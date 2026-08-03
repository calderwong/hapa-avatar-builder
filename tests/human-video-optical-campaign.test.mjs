import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  abortHumanVideoOpticalCampaignCompletion,
  beginHumanVideoOpticalCampaignCompletion,
  claimHumanVideoOpticalCampaignJob,
  createHumanVideoOpticalCampaignStore,
  enqueueHumanVideoOpticalCampaignJob,
  failHumanVideoOpticalCampaignJob,
  frameManifestDigest,
  frameManifestsEqual,
  recordHumanVideoOpticalCampaignTelemetry,
  recoverStaleHumanVideoOpticalCampaignLeases,
  summarizeHumanVideoOpticalCampaign,
  submitHumanVideoOpticalCampaignJob,
  updateHumanVideoOpticalCampaignPlanning,
} from "../src/domain/human-video-optical-campaign.js";
import { openHumanVideoOpticalCampaignStore } from "../server/human-video-optical-campaign-store.mjs";

const frames = ["a", "b", "c"].map((letter, index) => ({ imagePath: `/tmp/${letter}.jpg`, timestampSeconds: index, normalizedPosition: index / 2, sha256: `sha256:${letter.repeat(64)}` }));
const jobInput = { videoKey: "fingerprint:video-one", videoId: "video-one", videoName: "Video One", frames };
const resultDigest = `sha256:${"d".repeat(64)}`;

function boundTelemetry(job, telemetry) {
  return {
    ...telemetry,
    receiptId: `receipt:${job.id}:${job.attempt}`,
    jobId: job.id,
    attempt: job.attempt,
    frameDigest: job.frameDigest,
    leaseIdDigest: `sha256:${createHash("sha256").update(job.lease.leaseId).digest("hex")}`,
  };
}

test("campaign jobs use deterministic frame manifests, cap active work at three, and recover stale leases", () => {
  assert.equal(frameManifestDigest(frames), frameManifestDigest([...frames]));
  assert.match(frameManifestDigest(frames), /^sha256:[a-f0-9]{64}$/);
  assert.equal(frameManifestsEqual(frames, [...frames]), true);
  let store = createHumanVideoOpticalCampaignStore({ configuration: { maxActiveWorkers: 99, leaseMs: 1_000 } });
  assert.equal(store.configuration.maxActiveWorkers, 3);
  for (let index = 0; index < 4; index += 1) {
    const suffix = String(index).padStart(2, "0");
    ({ store } = enqueueHumanVideoOpticalCampaignJob(store, { ...jobInput, videoKey: `fingerprint:video-${suffix}` }, { now: "2026-08-03T00:00:00.000Z" }));
  }
  const claims = [];
  for (let index = 0; index < 3; index += 1) {
    const result = claimHumanVideoOpticalCampaignJob(store, { workerId: `terra-${index}` }, { now: "2026-08-03T00:00:00.000Z", leaseMs: 1_000 });
    store = result.store;
    claims.push(result.job);
  }
  assert.equal(claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-3" }, { now: "2026-08-03T00:00:00.000Z" }).reason, "max-active-workers");
  const recovered = recoverStaleHumanVideoOpticalCampaignLeases(store, { now: "2026-08-03T00:00:02.000Z" });
  assert.equal(recovered.recovered.length, 3);
  assert.equal(recovered.store.jobs.filter((job) => job.status === "queued").length, 4);
  assert.equal(claims[0].attempt, 1);
});

test("only a matching lease can settle a job and submitted work retains scheduler telemetry", () => {
  let store = createHumanVideoOpticalCampaignStore();
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, jobInput, { now: "2026-08-03T00:00:00.000Z" }));
  const claimed = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-1" }, { now: "2026-08-03T00:00:00.000Z" });
  assert.throws(() => beginHumanVideoOpticalCampaignCompletion(claimed.store, { jobId: claimed.job.id, attempt: 1, workerId: "wrong", leaseId: claimed.job.lease.leaseId, resultDigest }), (error) => error.code === "optical_campaign_lease_mismatch");
  const leaseInput = {
    jobId: claimed.job.id,
    attempt: claimed.job.attempt,
    workerId: claimed.job.lease.workerId,
    leaseId: claimed.job.lease.leaseId,
  };
  const telemetry = {
      status: "captured",
      source: "codex-rollout",
      sessionId: "session-1",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      agentPath: "/root/terra-1",
      startedAt: "2026-08-03T00:00:00.100Z",
      completedAt: "2026-08-03T00:00:00.900Z",
      wallClockMs: 800,
      directImageViewCalls: 3,
      inputTokens: 12,
      cachedInputTokens: 4,
      outputTokens: 8,
      reasoningTokens: 3,
      totalTokens: 20,
  };
  const schedulerTelemetry = boundTelemetry(claimed.job, telemetry);
  const recorded = recordHumanVideoOpticalCampaignTelemetry(claimed.store, { ...leaseInput, schedulerTelemetry }, { now: "2026-08-03T00:00:00.900Z" });
  assert.throws(() => recordHumanVideoOpticalCampaignTelemetry(recorded.store, { ...leaseInput, schedulerTelemetry }, { now: "2026-08-03T00:00:00.950Z" }), (error) => error.code === "optical_campaign_telemetry_immutable");
  const prepared = beginHumanVideoOpticalCampaignCompletion(recorded.store, { ...leaseInput, resultDigest }, { now: "2026-08-03T00:00:00.975Z" });
  const submitted = submitHumanVideoOpticalCampaignJob(prepared.store, { ...leaseInput, completionToken: prepared.job.completion.token, resultDigest, schedulerTelemetry }, { now: "2026-08-03T00:00:01.000Z" });
  assert.equal(submitted.job.status, "submitted");
  assert.equal(submitted.job.schedulerTelemetry.totalTokens, 20);
  assert.equal(submitted.job.schedulerTelemetry.wallClockMs, 800);
  assert.equal(submitted.job.schedulerTelemetry.directImageViewCalls, 3);
  assert.equal(submitted.job.lease.leaseId, "");
});

test("expired claims cannot prepare completion while a prepared receipt remains finalizable", () => {
  let store = createHumanVideoOpticalCampaignStore({ configuration: { leaseMs: 1_000 } });
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, jobInput, { now: "2026-08-03T00:00:00.000Z" }));
  const expired = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-expired" }, { now: "2026-08-03T00:00:00.000Z", leaseMs: 1_000 });
  const leaseInput = {
    jobId: expired.job.id,
    attempt: expired.job.attempt,
    workerId: expired.job.lease.workerId,
    leaseId: expired.job.lease.leaseId,
  };
  const unavailableTelemetry = boundTelemetry(expired.job, { status: "unavailable", source: "test-scheduler" });
  const recorded = recordHumanVideoOpticalCampaignTelemetry(expired.store, { ...leaseInput, schedulerTelemetry: unavailableTelemetry }, { now: "2026-08-03T00:00:00.500Z" });
  assert.throws(() => beginHumanVideoOpticalCampaignCompletion(recorded.store, { ...leaseInput, resultDigest }, { now: "2026-08-03T00:00:01.001Z" }), (error) => error.code === "optical_campaign_lease_expired");
  const prepared = beginHumanVideoOpticalCampaignCompletion(recorded.store, { ...leaseInput, resultDigest }, { now: "2026-08-03T00:00:00.900Z" });
  const submitted = submitHumanVideoOpticalCampaignJob(prepared.store, { ...leaseInput, completionToken: prepared.job.completion.token, resultDigest, schedulerTelemetry: unavailableTelemetry }, { now: "2026-08-03T00:00:01.001Z" });
  assert.equal(submitted.job.status, "submitted");
});

test("an expired prepared completion does not consume a worker slot", () => {
  let store = createHumanVideoOpticalCampaignStore({ configuration: { maxActiveWorkers: 1, leaseMs: 1_000 } });
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, jobInput, { now: "2026-08-03T00:00:00.000Z" }));
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, { ...jobInput, videoKey: "fingerprint:video-two", videoId: "video-two" }, { now: "2026-08-03T00:00:00.000Z" }));
  const first = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-finalizing" }, { now: "2026-08-03T00:00:00.000Z", leaseMs: 1_000 });
  const leaseInput = { jobId: first.job.id, attempt: first.job.attempt, workerId: first.job.lease.workerId, leaseId: first.job.lease.leaseId };
  const schedulerTelemetry = boundTelemetry(first.job, { status: "unavailable", source: "test-scheduler" });
  const recorded = recordHumanVideoOpticalCampaignTelemetry(first.store, { ...leaseInput, schedulerTelemetry }, { now: "2026-08-03T00:00:00.500Z" });
  const prepared = beginHumanVideoOpticalCampaignCompletion(recorded.store, { ...leaseInput, resultDigest }, { now: "2026-08-03T00:00:00.900Z" });
  const second = claimHumanVideoOpticalCampaignJob(prepared.store, { workerId: "terra-next" }, { now: "2026-08-03T00:00:02.000Z", leaseMs: 1_000 });
  assert.equal(second.job.videoKey, "fingerprint:video-two");
  assert.equal(second.store.jobs.find((job) => job.id === first.job.id).status, "completing");
});

test("campaign summaries distinguish bound receipts from legacy captured telemetry", () => {
  let store = createHumanVideoOpticalCampaignStore();
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, jobInput, { now: "2026-08-03T00:00:00.000Z" }));
  const claimed = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-bound" }, { now: "2026-08-03T00:00:00.000Z" });
  const leaseInput = { jobId: claimed.job.id, attempt: claimed.job.attempt, workerId: claimed.job.lease.workerId, leaseId: claimed.job.lease.leaseId };
  const telemetry = boundTelemetry(claimed.job, {
    status: "captured", source: "codex-rollout", sessionId: "session-bound", model: "gpt-5.6-terra", reasoningEffort: "medium", agentPath: "/root/terra-bound",
    startedAt: "2026-08-03T00:00:00.100Z", completedAt: "2026-08-03T00:00:00.900Z", wallClockMs: 800, directImageViewCalls: 3,
    inputTokens: 12, cachedInputTokens: 4, outputTokens: 8, reasoningTokens: 3, totalTokens: 20,
  });
  const recorded = recordHumanVideoOpticalCampaignTelemetry(claimed.store, { ...leaseInput, schedulerTelemetry: telemetry }, { now: "2026-08-03T00:00:00.900Z" });
  const boundSummary = summarizeHumanVideoOpticalCampaign(recorded.store).summary;
  assert.equal(boundSummary.tokenTelemetryCaptured, 1);
  assert.equal(boundSummary.tokenTelemetryBound, 1);
  assert.equal(boundSummary.legacyUnboundTelemetryCaptured, 0);
  const legacyStore = createHumanVideoOpticalCampaignStore({
    ...recorded.store,
    jobs: recorded.store.jobs.map((job) => ({
      ...job,
      schedulerTelemetry: { ...job.schedulerTelemetry, receiptId: "", jobId: "", attempt: 0, frameDigest: "", leaseIdDigest: "" },
    })),
  });
  const legacySummary = summarizeHumanVideoOpticalCampaign(legacyStore).summary;
  assert.equal(legacySummary.tokenTelemetryCaptured, 1);
  assert.equal(legacySummary.tokenTelemetryBound, 0);
  assert.equal(legacySummary.legacyUnboundTelemetryCaptured, 1);
});

test("claim configuration and telemetry are immutable while completion owns the lease", () => {
  let store = createHumanVideoOpticalCampaignStore({ configuration: { model: "gpt-5.6-terra", reasoningEffort: "medium" } });
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, jobInput, { now: "2026-08-03T00:00:00.000Z" }));
  const claimed = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-config" }, { now: "2026-08-03T00:00:00.000Z" });
  store = updateHumanVideoOpticalCampaignPlanning(claimed.store, { configuration: { model: "another-model", reasoningEffort: "high" } }, { now: "2026-08-03T00:00:00.100Z" });
  const job = store.jobs[0];
  assert.equal(job.workerConfiguration.model, "gpt-5.6-terra");
  const leaseInput = { jobId: job.id, attempt: job.attempt, workerId: job.lease.workerId, leaseId: job.lease.leaseId };
  const captured = {
    status: "captured", source: "codex-rollout", sessionId: "session-config", model: "gpt-5.6-terra", reasoningEffort: "medium", agentPath: "/root/terra-config",
    startedAt: "2026-08-03T00:00:00.200Z", completedAt: "2026-08-03T00:00:00.700Z", wallClockMs: 500, directImageViewCalls: 3,
    inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningTokens: 1, totalTokens: 12,
  };
  assert.throws(() => recordHumanVideoOpticalCampaignTelemetry(store, { ...leaseInput, schedulerTelemetry: boundTelemetry(job, { ...captured, model: "another-model" }) }, { now: "2026-08-03T00:00:00.800Z" }), (error) => error.code === "optical_campaign_telemetry_configuration_mismatch");
  const recorded = recordHumanVideoOpticalCampaignTelemetry(store, { ...leaseInput, schedulerTelemetry: boundTelemetry(job, captured) }, { now: "2026-08-03T00:00:00.800Z" });
  const prepared = beginHumanVideoOpticalCampaignCompletion(recorded.store, { ...leaseInput, resultDigest }, { now: "2026-08-03T00:00:00.850Z" });
  assert.throws(() => failHumanVideoOpticalCampaignJob(prepared.store, { ...leaseInput, failure: { retryable: true } }, { now: "2026-08-03T00:00:00.900Z" }), (error) => error.code === "optical_campaign_job_not_claimed");
  const aborted = abortHumanVideoOpticalCampaignCompletion(prepared.store, { ...leaseInput, completionToken: prepared.job.completion.token, resultDigest, failure: { code: "review-store-failed", retryable: true } }, { now: "2026-08-03T00:00:00.900Z" });
  assert.equal(aborted.job.status, "failed");
  assert.equal(aborted.job.failure.retryable, true);
});

test("cross-process store lock prevents two store instances from double-claiming one job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-optical-campaign-lock-"));
  const options = { filePath: path.join(root, "campaign.json"), eventPath: path.join(root, "campaign.ndjson"), clock: () => "2026-08-03T00:00:00.000Z" };
  const first = openHumanVideoOpticalCampaignStore(options);
  const second = openHumanVideoOpticalCampaignStore(options);
  await first.enqueue(jobInput);
  const claims = await Promise.all([
    first.claim({ workerId: "terra-lock-1" }, { leaseId: "lease-lock-1" }),
    second.claim({ workerId: "terra-lock-2" }, { leaseId: "lease-lock-2" }),
  ]);
  assert.equal(claims.filter((result) => result.job).length, 1);
  assert.equal((await first.read()).jobs.filter((job) => job.status === "claimed").length, 1);
});

test("manual review custody and campaign enqueue cannot preempt one another", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-optical-campaign-custody-"));
  const service = openHumanVideoOpticalCampaignStore({ filePath: path.join(root, "campaign.json"), eventPath: path.join(root, "campaign.ndjson"), clock: () => "2026-08-03T00:00:00.000Z" });
  let markReviewed;
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const release = new Promise((resolve) => { markReviewed = resolve; });
  let reviewed = false;
  const direct = service.withVideoAvailable(jobInput.videoKey, async () => {
    entered();
    await release;
    reviewed = true;
  });
  await enteredPromise;
  const enqueue = service.enqueueIf(jobInput, async () => !reviewed);
  markReviewed();
  await direct;
  const skipped = await enqueue;
  assert.equal(skipped.skipped, true);
  assert.equal((await service.read()).jobs.length, 0);

  await service.enqueue(jobInput);
  await assert.rejects(service.withVideoAvailable(jobInput.videoKey, async () => {}), (error) => error.code === "optical_campaign_video_reserved");
});

test("an expired prepared completion without a review is safely requeued", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-optical-campaign-finalize-recovery-"));
  let now = "2026-08-03T00:00:00.000Z";
  const service = openHumanVideoOpticalCampaignStore({ filePath: path.join(root, "campaign.json"), eventPath: path.join(root, "campaign.ndjson"), clock: () => now });
  await service.enqueue(jobInput);
  const claimed = await service.claim({ workerId: "terra-crash" }, { leaseId: "lease-crash", leaseMs: 1_000 });
  const leaseInput = { jobId: claimed.job.id, attempt: claimed.job.attempt, workerId: claimed.job.lease.workerId, leaseId: claimed.job.lease.leaseId };
  await service.telemetry({ ...leaseInput, schedulerTelemetry: boundTelemetry(claimed.job, { status: "unavailable", source: "test-scheduler" }) });
  now = "2026-08-03T00:00:00.500Z";
  await assert.rejects(
    service.completeWithReview({ ...leaseInput, resultDigest }, async () => { throw new Error("simulated review-store outage"); }),
    (error) => error.message === "simulated review-store outage" && error.preparedJob?.status === "completing",
  );
  assert.equal((await service.read()).jobs[0].status, "completing");
  now = "2026-08-03T00:00:02.000Z";
  const recovered = await service.recoverCompletion(leaseInput, async () => null);
  assert.equal(recovered.requeued, true);
  assert.equal(recovered.job.status, "failed");
  assert.equal(recovered.job.failure.retryable, true);
  const retried = await service.claim({ workerId: "terra-retry" }, { leaseId: "lease-retry", leaseMs: 1_000 });
  assert.equal(retried.job.attempt, 2);
});

test("atomic campaign store emits append-only scheduling receipts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-optical-campaign-"));
  const service = openHumanVideoOpticalCampaignStore({ filePath: path.join(root, "campaign.json"), eventPath: path.join(root, "campaign.ndjson"), clock: () => "2026-08-03T00:00:00.000Z" });
  await service.enqueue(jobInput);
  const claimed = await service.claim({ workerId: "terra-1" }, { leaseId: "lease-test" });
  assert.equal(claimed.job.status, "claimed");
  await service.fail({ jobId: claimed.job.id, attempt: claimed.job.attempt, workerId: "terra-1", leaseId: "lease-test", failure: { code: "image-unavailable", retryable: true } });
  assert.equal((await service.read()).jobs[0].status, "failed");
  const retried = await service.claim({ workerId: "terra-2" }, { leaseId: "lease-retry" });
  assert.equal(retried.job.attempt, 2);
  assert.equal(retried.job.schedulerTelemetry.status, "");
  const events = (await readFile(service.eventPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map((event) => event.action), ["human-video-optical-campaign.enqueued", "human-video-optical-campaign.claimed", "human-video-optical-campaign.failed", "human-video-optical-campaign.claimed"]);
});
