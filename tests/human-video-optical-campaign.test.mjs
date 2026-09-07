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
  projectHumanVideoOpticalFrameProgress,
  recordHumanVideoOpticalCampaignProgress,
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

test("campaign claims freeze exact-three inputs and stop completion when the receipt exceeds budget", () => {
  assert.throws(
    () => enqueueHumanVideoOpticalCampaignJob(createHumanVideoOpticalCampaignStore(), { ...jobInput, frames: [...frames, { ...frames[2], sha256: `sha256:${"d".repeat(64)}` }] }),
    (error) => error.code === "optical_campaign_frames_required",
  );
  let store = createHumanVideoOpticalCampaignStore({ configuration: { budget: { maxInputTokens: 10, maxOutputTokens: 5, maxTotalTokens: 15, maxWallClockMs: 1_000, maxReasoningEffort: "medium" } } });
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, jobInput, { now: "2026-08-03T00:00:00.000Z" }));
  const claimed = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-budget" }, { now: "2026-08-03T00:00:00.000Z", leaseId: "lease-budget", leaseMs: 60_000 });
  const receipt = boundTelemetry(claimed.job, {
    status: "captured", source: "codex-rollout", sessionId: "session-budget", model: "gpt-5.6-terra", reasoningEffort: "low", agentPath: "/root/terra-budget",
    startedAt: "2026-08-03T00:00:00.000Z", completedAt: "2026-08-03T00:00:00.500Z", wallClockMs: 500, directImageViewCalls: 3,
    inputTokens: 11, cachedInputTokens: 0, outputTokens: 4, reasoningTokens: 0, totalTokens: 15, stopReason: "completed",
  });
  const recorded = recordHumanVideoOpticalCampaignTelemetry(claimed.store, { jobId: claimed.job.id, workerId: "terra-budget", attempt: 1, leaseId: "lease-budget", schedulerTelemetry: receipt }, { now: "2026-08-03T00:00:00.500Z" });
  assert.equal(recorded.job.schedulerTelemetry.budgetExceeded, true);
  assert.equal(recorded.job.schedulerTelemetry.stopReason, "budget");
  assert.throws(
    () => beginHumanVideoOpticalCampaignCompletion(recorded.store, { jobId: claimed.job.id, workerId: "terra-budget", attempt: 1, leaseId: "lease-budget", resultDigest }, { now: "2026-08-03T00:00:00.600Z" }),
    (error) => error.code === "optical_campaign_budget_exceeded",
  );
});

test("campaign jobs retain an exact legacy-review repair target", () => {
  const repair = {
    priorReviewId: "fingerprint:video-one:optical:r1",
    priorRevision: 1,
    reason: "legacy-noncompliant-optical-review",
  };
  let store = createHumanVideoOpticalCampaignStore();
  const enqueued = enqueueHumanVideoOpticalCampaignJob(store, { ...jobInput, repair }, { now: "2026-08-03T00:00:00.000Z" });
  store = enqueued.store;
  assert.deepEqual(enqueued.job.repair, repair);
  const claimed = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-repair" }, { now: "2026-08-03T00:00:00.100Z", leaseMs: 900_000 });
  assert.deepEqual(claimed.job.repair, repair);
  assert.throws(
    () => enqueueHumanVideoOpticalCampaignJob(createHumanVideoOpticalCampaignStore(), { ...jobInput, repair: { priorReviewId: repair.priorReviewId } }),
    (error) => error.code === "optical_campaign_repair_target_invalid",
  );
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
      reasoningEffort: "low",
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
    status: "captured", source: "codex-rollout", sessionId: "session-bound", model: "gpt-5.6-terra", reasoningEffort: "low", agentPath: "/root/terra-bound",
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

test("catalog completion separates direct optical reviews from verified invalid-media terminals", () => {
  const summary = summarizeHumanVideoOpticalCampaign(createHumanVideoOpticalCampaignStore({ planning: { knownVideos: 10 } }), {
    reviewCoverage: { knownVideos: 10, totalReviews: 4, opticalComplete: 3, terminalInvalidMedia: 1, blocked: 1 },
  });
  assert.equal(summary.summary.opticalComplete, 3);
  assert.equal(summary.summary.terminalInvalidMedia, 1);
  assert.equal(summary.summary.catalogResolved, 4);
  assert.equal(summary.summary.remainingOpticalReviews, 6);
  assert.equal(summary.reviewCoverage.directVisionRemaining, 6);
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

test("lease-bound First/Mid/Last progress is monotonic, manifest-bound, and visible without exposing the lease secret", () => {
  let store = createHumanVideoOpticalCampaignStore({ configuration: { leaseMs: 600_000 } });
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, jobInput, { now: "2026-08-03T00:00:00.000Z" }));
  const claimed = claimHumanVideoOpticalCampaignJob(store, { workerId: "terra-visible" }, { now: "2026-08-03T00:00:00.000Z", leaseId: "lease-secret", leaseMs: 600_000 });
  const leaseInput = { jobId: claimed.job.id, attempt: 1, workerId: "terra-visible", leaseId: "lease-secret" };
  const viewing = recordHumanVideoOpticalCampaignProgress(claimed.store, {
    ...leaseInput,
    phase: "inspecting",
    currentFrameOrdinal: 1,
    completedFrameOrdinals: [],
  }, { now: "2026-08-03T00:00:10.000Z" });
  const advanced = recordHumanVideoOpticalCampaignProgress(viewing.store, {
    ...leaseInput,
    phase: "inspecting",
    currentFrameOrdinal: 2,
    completedFrameOrdinals: [1],
  }, { now: "2026-08-03T00:00:20.000Z" });

  const summary = summarizeHumanVideoOpticalCampaign(advanced.store, {
    now: "2026-08-03T00:00:30.000Z",
    reviewCoverage: { knownVideos: 10_884, totalReviews: 19, opticalComplete: 3, legacyIncomplete: 16 },
  });
  assert.equal(summary.summary.compliantOpticalReviews, 3);
  assert.equal(summary.summary.legacyPaletteRepairs, 16);
  assert.equal(summary.summary.remainingOpticalReviews, 10_881);
  assert.equal(summary.planning.remainingOpticalReviews, 10_881);
  assert.equal(summary.planning.plannerSnapshotRemainingOpticalReviews, 0);
  assert.equal(summary.workers.length, 1);
  assert.equal(summary.workers[0].lifecycleState, "inspecting-frames");
  assert.equal(summary.workers[0].leaseHealth, "fresh");
  assert.equal(summary.workers[0].frameProgress.percent, 33);
  assert.deepEqual(summary.workers[0].frameProgress.frames.map((frame) => [frame.role, frame.status]), [["first", "inspected"], ["mid", "viewing"], ["last", "pending"]]);
  assert.equal(JSON.stringify(summary.workers).includes("lease-secret"), false);

  assert.throws(() => recordHumanVideoOpticalCampaignProgress(advanced.store, { ...leaseInput, phase: "inspecting", completedFrameOrdinals: [] }, { now: "2026-08-03T00:00:21.000Z" }), (error) => error.code === "optical_campaign_progress_frames_regressed");
  assert.throws(() => recordHumanVideoOpticalCampaignProgress(advanced.store, { ...leaseInput, phase: "inspecting", currentFrameOrdinal: 99, completedFrameOrdinals: [1] }, { now: "2026-08-03T00:00:21.000Z" }), (error) => error.code === "optical_campaign_progress_current_frame_not_registered");
  assert.throws(() => recordHumanVideoOpticalCampaignProgress(advanced.store, { ...leaseInput, leaseId: "wrong", phase: "drafting", completedFrameOrdinals: [1] }, { now: "2026-08-03T00:00:21.000Z" }), (error) => error.code === "optical_campaign_lease_mismatch");

  const malformedFrames = structuredClone(advanced.store);
  malformedFrames.jobs[0].workerProgress.completedFrameOrdinals = "1";
  assert.throws(() => summarizeHumanVideoOpticalCampaign(malformedFrames), (error) => error.code === "optical_campaign_store_entry_invalid" && error.details?.cause === "optical_campaign_progress_frames_invalid");
  const detachedAttempt = structuredClone(advanced.store);
  detachedAttempt.jobs[0].workerProgress.attempt = 0;
  assert.throws(() => summarizeHumanVideoOpticalCampaign(detachedAttempt), (error) => error.code === "optical_campaign_store_entry_invalid" && error.details?.cause === "optical_campaign_progress_attempt_mismatch");
});

test("captured scheduler telemetry truthfully confirms every registered frame and recent activity comes from the append-only ledger", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-optical-campaign-progress-"));
  let now = "2026-08-03T00:00:00.000Z";
  const service = openHumanVideoOpticalCampaignStore({ filePath: path.join(root, "campaign.json"), eventPath: path.join(root, "campaign.ndjson"), clock: () => now });
  await service.enqueue(jobInput);
  const claimed = await service.claim({ workerId: "terra-receipt" }, { leaseId: "lease-receipt", leaseMs: 600_000 });
  const leaseInput = { jobId: claimed.job.id, attempt: 1, workerId: "terra-receipt", leaseId: "lease-receipt" };
  now = "2026-08-03T00:00:01.000Z";
  await service.progress({ ...leaseInput, phase: "inspecting", currentFrameOrdinal: 2, completedFrameOrdinals: [1] });
  now = "2026-08-03T00:00:02.000Z";
  const telemetry = boundTelemetry(claimed.job, {
    status: "captured", source: "codex-rollout", sessionId: "session-progress", model: "gpt-5.6-terra", reasoningEffort: "low", agentPath: "/root/terra-receipt",
    startedAt: "2026-08-03T00:00:01.000Z", completedAt: "2026-08-03T00:00:02.000Z", wallClockMs: 1_000, directImageViewCalls: 3,
    inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningTokens: 1, totalTokens: 12,
  });
  const recorded = await service.telemetry({ ...leaseInput, schedulerTelemetry: telemetry });
  assert.deepEqual(recorded.job.workerProgress.completedFrameOrdinals, [1, 2, 3]);
  assert.deepEqual(projectHumanVideoOpticalFrameProgress(recorded.job).frames.map((frame) => frame.status), ["receipt-confirmed", "receipt-confirmed", "receipt-confirmed"]);

  const recentEvents = await service.recentEvents({ limit: 8 });
  assert.deepEqual(recentEvents.map((event) => event.action), [
    "human-video-optical-campaign.enqueued",
    "human-video-optical-campaign.claimed",
    "human-video-optical-campaign.progress-recorded",
    "human-video-optical-campaign.telemetry-recorded",
  ]);
  const summary = summarizeHumanVideoOpticalCampaign(recorded.store, { now, recentEvents });
  assert.equal(summary.recentActivity[0].lifecycleState, "telemetry-recorded");
  assert.equal(summary.recentActivity[0].frameProgress.completed, 3);
  assert.equal(summary.recentActivity.some((event) => event.lifecycleState === "inspecting"), true);

  const prepared = beginHumanVideoOpticalCampaignCompletion(recorded.store, { ...leaseInput, resultDigest }, { now: "2026-08-03T00:00:03.000Z" });
  const submitted = submitHumanVideoOpticalCampaignJob(prepared.store, {
    ...leaseInput,
    completionToken: prepared.job.completion.token,
    resultDigest,
    reviewId: "review:one",
    schedulerTelemetry: prepared.job.schedulerTelemetry,
  }, { now: "2026-08-03T00:00:04.000Z" });
  const submittedSummary = summarizeHumanVideoOpticalCampaign(submitted.store, { now, recentEvents });
  assert.equal(submittedSummary.summary.submitted, 1);
  assert.equal(submittedSummary.recentActivity.some((event) => event.lifecycleState === "inspecting"), true);
});
