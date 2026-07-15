import test from "node:test";
import assert from "node:assert/strict";
import { buildSongCardMintSnapshot } from "../src/domain/song-card-mint.js";
import {
  approveSongCardRemintCandidate,
  bindSongCardRemintMintPlan,
  cancelSongCardRemintCandidate,
  claimSongCardRemintWork,
  compactSongCardRemintResumeHistory,
  createSongCardRemintQueue,
  enqueueApprovedSongCardRemints,
  planSongCardRemintCandidate,
  recordSongCardRemintMint,
  recordSongCardRemintJobResult,
  retrySongCardRemintRender,
  resumeSongCardRemintQueue,
  songCardRemintQueueView,
  upsertSongCardRemintCandidate,
} from "../src/domain/song-card-remint-queue.js";

test("legacy no-op resume telemetry compacts without deleting real recovery provenance", () => {
  const queue = createSongCardRemintQueue();
  queue.events = [
    { type: "remint-candidate-created", at: "2026-07-13T00:00:00.000Z" },
    { type: "remint-queue-resumed", at: "2026-07-13T00:01:00.000Z", batchCount: 0, autoMint: false },
    { type: "remint-queue-resumed", at: "2026-07-13T00:02:00.000Z", batchCount: 2, autoMint: false },
    { type: "remint-queue-resumed", at: "2026-07-13T00:03:00.000Z", batchCount: 2, recoveredBatchCount: 1, autoMint: false },
  ];
  queue.batches = {
    "candidate:a": {
      schemaVersion: "hapa.director.album-batch.v1",
      status: "ready",
      jobs: [],
      events: [
        { type: "claim", at: "2026-07-13T00:00:30.000Z" },
        { type: "resume", at: "2026-07-13T00:01:00.000Z", artifactIndexEntries: 0 },
        { type: "resume", at: "2026-07-13T00:02:00.000Z", artifactIndexEntries: 1 },
        { type: "resume", at: "2026-07-13T00:03:00.000Z", artifactIndexEntries: 1, stateChanged: true },
      ],
    },
  };

  const compacted = compactSongCardRemintResumeHistory(queue);
  const queueSummary = compacted.events.find((event) => event.type === "remint-queue-resume-history-compacted");
  assert.equal(queueSummary.compactedCount, 2);
  assert.deepEqual(queueSummary.batchCountValues, [0, 2]);
  assert.equal(compacted.events.some((event) => event.type === "remint-candidate-created"), true);
  assert.equal(compacted.events.some((event) => event.type === "remint-queue-resumed" && event.recoveredBatchCount === 1), true);
  const batchEvents = compacted.batches["candidate:a"].events;
  const batchSummary = batchEvents.find((event) => event.type === "resume-history-compacted");
  assert.equal(batchSummary.compactedCount, 2);
  assert.deepEqual(batchSummary.artifactIndexEntriesValues, [0, 1]);
  assert.equal(batchEvents.some((event) => event.type === "claim"), true);
  assert.equal(batchEvents.some((event) => event.type === "resume" && event.stateChanged === true), true);
  assert.deepEqual(compactSongCardRemintResumeHistory(compacted), compacted, "the migration must be idempotent");
});

function snapshot({ mediaId = "media:a", endSeconds = 8, renderer = "native", revision = "editor:1" } = {}) {
  const showGraph = {
    song: { id: "song-a", title: "Song A", durationSeconds: 10 },
    directorV2: { variantId: "approved", rendererSupport: { renderer } },
    tracks: [{ id: "track-a", role: "foundation", cards: [{ id: "cue-a", startSeconds: 0, endSeconds, media: { id: mediaId, sha256: `sha256:${mediaId}` } }] }],
  };
  return buildSongCardMintSnapshot({
    song: { id: "song-a", title: "Song A" },
    project: { revision },
    showGraph,
    render: { renderer },
    rendererTruth: { ok: true, silentDefaultCount: 0 },
  });
}

test("source, capability, renderer, and editor revisions create one reasoned Next Mint candidate without mint authority", () => {
  const before = snapshot();
  const after = snapshot({ mediaId: "media:b", endSeconds: 7.5, renderer: "hyperframes", revision: "editor:2" });
  const candidate = planSongCardRemintCandidate({
    songId: "song-a",
    latestEdition: 4,
    headGeneration: 7,
    mintedSnapshot: before,
    currentSnapshot: after,
    mintedRevisions: { source: "source:1", capability: "cap:1", renderer: "native:1", editor: "editor:1" },
    currentRevisions: { source: "source:2", capability: "cap:2", renderer: "hyperframes:2", editor: "editor:2" },
  });
  assert.equal(candidate.status, "awaiting-approval");
  assert.equal(candidate.predictedEdition, 5);
  assert.deepEqual(candidate.reasons.slice(0, 4).map((row) => row.kind), [
    "source-revision-change",
    "capability-revision-change",
    "renderer-revision-change",
    "editor-revision-change",
  ]);
  assert.ok(candidate.reasons.some((row) => row.kind === "editor-material-change"));
  assert.equal(candidate.renderWork.length, 1);
  assert.equal(candidate.renderWork[0].startMs, 0);
  assert.equal(candidate.renderWork[0].endMs, 8000);
  assert.equal(candidate.renderWork[0].cardKey, "track-a:cue-a");
  assert.deepEqual(candidate.renderWork[0].changedAssetIds, ["media:a", "media:b"]);
  assert.equal(candidate.renderWork[0].affectedAppearanceIds.length, 2);
  assert.equal(candidate.requiresExplicitApproval, true);
  assert.equal(candidate.renderWorkAuthorized, false);
  assert.equal(candidate.mintAuthorized, false);
  assert.equal(candidate.autoMint, false);
});

test("identical candidates deduplicate and a newer candidate supersedes unrendered work for the same Song Card", () => {
  const input = {
    songId: "song-a",
    latestEdition: 2,
    mintedSnapshot: snapshot(),
    currentSnapshot: snapshot({ mediaId: "media:b" }),
    mintedRevisions: { editor: "editor:1" },
    currentRevisions: { editor: "editor:2" },
  };
  let queue = createSongCardRemintQueue({ candidates: [input], createdAt: "2026-07-12T00:00:00Z" });
  const firstId = queue.candidates[0].id;
  queue = upsertSongCardRemintCandidate(queue, input, { eventAt: "2026-07-12T00:00:01Z" });
  assert.equal(queue.candidates.length, 1);
  assert.equal(queue.candidates[0].id, firstId);
  assert.equal(queue.candidates[0].attemptNumber, 1);
  const newer = planSongCardRemintCandidate({ ...input, currentSnapshot: snapshot({ mediaId: "media:c" }), currentRevisions: { editor: "editor:3" } });
  queue = upsertSongCardRemintCandidate(queue, newer);
  assert.equal(queue.candidates.length, 2);
  assert.equal(queue.candidates[0].status, "superseded");
  assert.equal(queue.candidates[0].supersededBy, newer.id);
  assert.equal(queue.candidates[1].status, "awaiting-approval");
});

test("canceling an attempt preserves its terminal record while an identical proposal creates a lineaged approval attempt", () => {
  const input = {
    songId: "song-a",
    latestEdition: 2,
    mintedSnapshot: snapshot(),
    currentSnapshot: snapshot({ mediaId: "media:b" }),
    mintedRevisions: { editor: "editor:1" },
    currentRevisions: { editor: "editor:2" },
  };
  let queue = createSongCardRemintQueue({ candidates: [input], createdAt: "2026-07-12T00:00:00Z" });
  const first = queue.candidates[0];
  queue = cancelSongCardRemintCandidate(queue, first.id, {
    canceledBy: "operator:cj",
    reason: "operator-canceled-render",
    canceledAt: "2026-07-12T00:01:00Z",
  });
  const terminalRecord = structuredClone(queue.candidates[0]);

  queue = upsertSongCardRemintCandidate(queue, input, { eventAt: "2026-07-12T00:02:00Z" });
  assert.equal(queue.candidates.length, 2);
  assert.deepEqual(queue.candidates[0], terminalRecord, "the canceled attempt remains immutable history");
  const retried = queue.candidates[1];
  assert.equal(retried.status, "awaiting-approval");
  assert.equal(retried.fingerprint, first.fingerprint);
  assert.notEqual(retried.id, first.id);
  assert.equal(retried.attemptRootId, first.id);
  assert.equal(retried.attemptNumber, 2);
  assert.deepEqual(retried.attemptLineage, {
    relation: "reproposed-after-terminal-attempt",
    priorAttemptId: first.id,
    priorAttemptNumber: 1,
    priorAttemptStatus: "canceled",
    fingerprint: first.fingerprint,
    reproposedAt: "2026-07-12T00:02:00Z",
  });
  assert.equal(retried.approval, null);
  assert.equal(retried.renderWorkAuthorized, false);

  const afterIdenticalActiveProposal = upsertSongCardRemintCandidate(queue, input, { eventAt: "2026-07-12T00:03:00Z" });
  assert.deepEqual(afterIdenticalActiveProposal, queue, "the new active attempt still deduplicates identical proposals");
});

test("rejected and superseded matching attempts may also be reproposed without rewriting terminal history", () => {
  for (const status of ["rejected", "superseded"]) {
    const input = {
      songId: `song-${status}`,
      latestEdition: 1,
      mintedSnapshot: snapshot(),
      currentSnapshot: snapshot({ mediaId: `media:${status}` }),
      currentRevisions: { editor: `editor:${status}` },
    };
    let queue = createSongCardRemintQueue({ candidates: [input], createdAt: "2026-07-12T00:00:00Z" });
    queue.candidates[0] = { ...queue.candidates[0], status, terminalMarker: status };
    const terminalRecord = structuredClone(queue.candidates[0]);
    queue = upsertSongCardRemintCandidate(queue, input, { eventAt: "2026-07-12T00:02:00Z" });
    assert.deepEqual(queue.candidates[0], terminalRecord);
    assert.equal(queue.candidates[1].status, "awaiting-approval");
    assert.equal(queue.candidates[1].attemptLineage.priorAttemptStatus, status);
  }
});

test("only explicitly approved candidates enter the existing album orchestrator and never add a mint job", () => {
  const candidate = planSongCardRemintCandidate({
    songId: "song-a",
    latestEdition: 1,
    mintedSnapshot: snapshot(),
    currentSnapshot: snapshot({ mediaId: "media:b" }),
  });
  let queue = createSongCardRemintQueue({ candidates: [candidate] });
  queue = enqueueApprovedSongCardRemints(queue);
  assert.equal(Object.keys(queue.batches).length, 0);
  assert.throws(() => approveSongCardRemintCandidate(queue, candidate.id, {}), /approvedBy/);
  queue = approveSongCardRemintCandidate(queue, candidate.id, { approvedBy: "operator:cj", approvedAt: "2026-07-12T00:00:00Z" });
  queue = enqueueApprovedSongCardRemints(queue);
  const batch = queue.batches[candidate.id];
  assert.equal(batch.schemaVersion, "hapa.director.album-batch.v1");
  assert.ok(batch.jobs.length > 0);
  assert.equal(batch.jobs.some((job) => job.stage.includes("mint")), false);
  assert.equal(batch.remint.autoMint, false);
  assert.equal(queue.candidates[0].mintAuthorized, false);
  assert.equal(batch.jobs.find((job) => job.expensiveDecision).status, "cached", "saved editor decisions are reused");
});

test("restart recovery deduplicates content-addressed artifacts and enqueue is idempotent", () => {
  const candidate = planSongCardRemintCandidate({
    songId: "song-a",
    latestEdition: 1,
    mintedSnapshot: snapshot(),
    currentSnapshot: snapshot({ renderer: "hyperframes" }),
    mintedRevisions: { renderer: "native:1", capability: "cap:1" },
    currentRevisions: { renderer: "hyperframes:2", capability: "cap:2" },
  });
  let queue = createSongCardRemintQueue({ candidates: [candidate] });
  queue = approveSongCardRemintCandidate(queue, candidate.id, { approvedBy: "operator:cj" });
  queue = enqueueApprovedSongCardRemints(queue);
  const jobCount = queue.batches[candidate.id].jobs.length;
  assert.equal(queue.batches[candidate.id].jobs.find((job) => job.expensiveDecision).status, "cached");
  queue = enqueueApprovedSongCardRemints(queue);
  assert.equal(queue.batches[candidate.id].jobs.length, jobCount);
  const queued = queue.batches[candidate.id].jobs.find((job) => job.status === "queued");
  queue.batches[candidate.id].jobs.find((job) => job.id === queued.id).status = "running";
  queue = resumeSongCardRemintQueue(queue, {
    artifactIndexByCandidate: {
      [candidate.id]: { [queued.artifactHash]: { valid: true, receipt: { sha256: "cached" }, artifacts: ["cached-render"] } },
    },
  });
  assert.equal(queue.batches[candidate.id].jobs.find((job) => job.id === queued.id).status, "cached");
  assert.equal(queue.candidates[0].mintAuthorized, false);
  const recovered = structuredClone(queue);
  queue = resumeSongCardRemintQueue(queue, {
    artifactIndexByCandidate: {
      [candidate.id]: { [queued.artifactHash]: { valid: true, receipt: { sha256: "cached" }, artifacts: ["cached-render"] } },
    },
  });
  assert.deepEqual(queue, recovered, "a fully recovered queue must not gain another startup event");
});

test("active playback applies the scaled album budget while an idle kiosk can claim work", () => {
  const candidate = planSongCardRemintCandidate({
    songId: "song-a",
    latestEdition: 0,
    currentSnapshot: snapshot(),
    currentRevisions: { source: "source:1" },
  });
  const makeQueue = () => {
    let queue = createSongCardRemintQueue({
      candidates: [candidate],
      budgets: { cpu: 2, gpu: 1, disk: 1, decoders: 1, cacheGB: 1, activePlaybackScale: 0.25 },
    });
    queue = approveSongCardRemintCandidate(queue, candidate.id, { approvedBy: "operator:cj" });
    return enqueueApprovedSongCardRemints(queue);
  };
  const playbackClaim = claimSongCardRemintWork(makeQueue(), { activePlayback: true });
  assert.equal(playbackClaim.claimed.length, 0);
  const idleClaim = claimSongCardRemintWork(makeQueue(), { activePlayback: false });
  assert.equal(idleClaim.claimed.length, 1);
  assert.equal(idleClaim.queue.candidates[0].status, "rendering");
});

test("completed render work stops at render-ready and still requires a separate mint confirmation", () => {
  const candidate = planSongCardRemintCandidate({ songId: "song-a", latestEdition: 3, currentSnapshot: snapshot(), currentRevisions: { source: "source:1" } });
  let queue = createSongCardRemintQueue({ candidates: [candidate] });
  queue = approveSongCardRemintCandidate(queue, candidate.id, { approvedBy: "operator:cj" });
  queue = enqueueApprovedSongCardRemints(queue);
  queue.batches[candidate.id].jobs = queue.batches[candidate.id].jobs.map((job) => ({ ...job, status: job.id === queue.batches[candidate.id].jobs.at(-1).id ? "running" : "done" }));
  const finalJob = queue.batches[candidate.id].jobs.at(-1);
  queue = recordSongCardRemintJobResult(queue, candidate.id, finalJob.id, { ok: true, artifacts: ["render.mp4"], receipt: { sha256: "render" } });
  const view = songCardRemintQueueView(queue);
  assert.equal(view.candidates[0].status, "render-ready");
  assert.equal(view.candidates[0].predictedEdition, 4);
  assert.equal(view.candidates[0].mintAuthorized, false);
  assert.equal(view.candidates[0].autoMint, false);
  assert.equal(view.candidates[0].nextAction, "operator-confirm-song-card-mint");
});

test("a Builder-managed failure stops durably after one attempt and remains explicitly retryable from the approved plan", () => {
  const candidate = planSongCardRemintCandidate({
    songId: "song-a",
    latestEdition: 0,
    currentSnapshot: snapshot({ mediaId: "media:b", renderer: "hyperframes" }),
    currentRevisions: { source: "source:1", renderer: "hyperframes:1" },
  });
  let queue = createSongCardRemintQueue({ candidates: [candidate] });
  queue = approveSongCardRemintCandidate(queue, candidate.id, { approvedBy: "operator:durable-failure" });
  queue = enqueueApprovedSongCardRemints(queue);
  const batch = queue.batches[candidate.id];
  const hyperframesIndex = batch.jobs.findIndex((job) => job.stage === "hyperframes");
  batch.jobs = batch.jobs.map((job, index) => ({
    ...job,
    status: index < hyperframesIndex ? (job.expensiveDecision ? "cached" : "done") : index === hyperframesIndex ? "running" : "queued",
    attempts: index === hyperframesIndex ? 1 : job.attempts,
  }));
  queue.candidates[0] = { ...queue.candidates[0], status: "rendering" };
  const hyperframesJob = batch.jobs[hyperframesIndex];

  queue = recordSongCardRemintJobResult(queue, candidate.id, hyperframesJob.id, {
    ok: false,
    message: "Offline show compilation failed: 20 media cues could not be packaged.",
    retryable: true,
    requiresExplicitRetry: true,
    failure: {
      code: "local_compile_media_offline",
      message: "Offline show compilation failed: 20 media cues could not be packaged.",
      stage: "compile",
      retryable: true,
      details: { media: { missingCount: 20, missingCueIds: ["legacy:media:1", "legacy:media:2"] } },
    },
  }, { recordedAt: "2026-07-14T02:44:20.268Z" });

  const failedView = songCardRemintQueueView(queue).candidates[0];
  const failedJob = queue.batches[candidate.id].jobs.find((job) => job.id === hyperframesJob.id);
  assert.equal(failedJob.status, "failed", "the local bridge must not leave a stopped process silently queued");
  assert.equal(failedJob.attempts, 1);
  assert.equal(failedView.status, "failed");
  assert.equal(failedView.nextAction, "operator-retry-approved-remint-render");
  assert.equal(failedView.renderFailure.code, "local_compile_media_offline");
  assert.equal(failedView.renderFailure.details.media.missingCount, 20);
  assert.equal(failedView.approvedBy, "operator:durable-failure");
  assert.equal(failedView.renderWorkAuthorized, true);

  const retried = retrySongCardRemintRender(queue, candidate.id, { retriedAt: "2026-07-14T02:45:00.000Z" });
  const retriedView = songCardRemintQueueView(retried).candidates[0];
  assert.equal(retriedView.status, "queued");
  assert.equal(retriedView.renderFailure, null);
  assert.equal(retriedView.approvedBy, "operator:durable-failure");
  assert.equal(retried.batches[candidate.id].jobs.find((job) => job.expensiveDecision).status, "cached");
  assert.equal(retried.batches[candidate.id].jobs.find((job) => job.stage === "proxy").status, "done");
  assert.equal(retried.batches[candidate.id].jobs.find((job) => job.stage === "hyperframes").status, "queued");
});

test("explicit render retry preserves approved decisions and rebuilds the failed HyperFrames chain without stale artifacts", () => {
  const candidate = planSongCardRemintCandidate({
    songId: "song-a",
    latestEdition: 2,
    mintedSnapshot: snapshot(),
    currentSnapshot: snapshot({ mediaId: "media:b", renderer: "hyperframes", revision: "editor:2" }),
  });
  let queue = createSongCardRemintQueue({ candidates: [candidate] });
  queue = approveSongCardRemintCandidate(queue, candidate.id, { approvedBy: "operator:cj" });
  queue = enqueueApprovedSongCardRemints(queue);
  const batch = queue.batches[candidate.id];
  const hyperframesIndex = batch.jobs.findIndex((job) => job.stage === "hyperframes");
  const qaIndex = batch.jobs.findIndex((job) => job.stage === "qa");
  const releaseIndex = batch.jobs.findIndex((job) => job.stage === "release-export");
  batch.jobs = batch.jobs.map((job, index) => {
    if (index === qaIndex) return { ...job, status: "failed", attempts: 2, receipt: { stale: true }, producedArtifacts: ["stale-qa"] };
    if (index === releaseIndex) return { ...job, status: "done", attempts: 1, receipt: { stale: true }, producedArtifacts: ["stale-release"] };
    if (index <= hyperframesIndex && !job.expensiveDecision) return { ...job, status: "done", attempts: 1, receipt: { stage: job.stage }, producedArtifacts: [`artifact:${job.stage}`] };
    return job;
  });
  queue.candidates[0] = {
    ...queue.candidates[0],
    status: "failed",
    renderArtifacts: [{ role: "master", path: "/stale/master.mp4" }],
    releaseReceipt: { stale: true },
    releaseReceiptVerification: { stale: true },
    reviewedRender: { stale: true },
    mintPlanId: "plan:stale",
  };

  const retried = retrySongCardRemintRender(queue, candidate.id, { retriedAt: "2026-07-13T12:00:00Z" });
  const retriedCandidate = retried.candidates[0];
  const retriedBatch = retried.batches[candidate.id];
  const decision = retriedBatch.jobs.find((job) => job.expensiveDecision);
  assert.equal(decision.status, "cached", "the completed director decision envelope remains reusable");
  assert.equal(retriedBatch.jobs.find((job) => job.stage === "proxy").status, "done", "content-addressed preparation before HyperFrames is preserved");
  for (const stage of ["hyperframes", "qa", "release-export"]) {
    const job = retriedBatch.jobs.find((row) => row.stage === stage);
    assert.equal(job.status, "queued", `${stage} should be queued for a truthful rebuild`);
    assert.equal(job.attempts, 0);
    assert.equal(job.receipt, null);
    assert.deepEqual(job.producedArtifacts, []);
  }
  assert.equal(retriedCandidate.status, "queued");
  assert.equal(retriedCandidate.approval.approvedBy, "operator:cj");
  assert.equal(retriedCandidate.renderWorkAuthorized, true);
  assert.deepEqual(retriedCandidate.renderArtifacts, []);
  assert.equal(retriedCandidate.releaseReceipt, null);
  assert.equal(retriedCandidate.releaseReceiptVerification, null);
  assert.equal(retriedCandidate.reviewedRender, null);
  assert.equal(retriedCandidate.mintPlanId, null);
  assert.equal(retriedCandidate.mintAuthorized, false);
  assert.equal(retried.events.at(-1).type, "remint-render-retry-requested");
  assert.equal(retried.events.at(-1).approvedBy, "operator:cj");
  assert.equal(retried.events.at(-1).autoMint, false);
});

test("an explicit mint records the predicted edition without granting queue-side mint authority", () => {
  const candidate = { ...planSongCardRemintCandidate({ songId: "song-a", latestEdition: 3, currentSnapshot: snapshot(), currentRevisions: { source: "source:1" } }), planId: "plan:editor-4" };
  let queue = createSongCardRemintQueue({ candidates: [candidate] });
  queue = recordSongCardRemintMint(queue, { songId: "song-a", planId: "plan:editor-4", edition: 4, mintId: "mint:4", mintedAt: "2026-07-12T00:00:00Z" });
  const view = songCardRemintQueueView(queue);
  assert.equal(view.candidates[0].status, "minted");
  assert.equal(view.candidates[0].mintedEdition, 4);
  assert.equal(view.candidates[0].mintId, "mint:4");
  assert.equal(view.candidates[0].mintAuthorized, false);
  assert.equal(queue.events.at(-1).type, "remint-explicit-mint-recorded");
  assert.equal(queue.events.at(-1).autoMint, false);
});

test("explicit mint reconciliation never marks a newer superseding plan as the older plan's mint", () => {
  const first = { ...planSongCardRemintCandidate({ songId: "song-a", latestEdition: 1, mintedSnapshot: snapshot(), currentSnapshot: snapshot({ mediaId: "media:b", revision: "editor:2" }) }), planId: "plan:A" };
  const second = { ...planSongCardRemintCandidate({ songId: "song-a", latestEdition: 1, mintedSnapshot: snapshot(), currentSnapshot: snapshot({ mediaId: "media:c", revision: "editor:3" }) }), planId: "plan:B" };
  let queue = createSongCardRemintQueue({ candidates: [first] });
  queue = upsertSongCardRemintCandidate(queue, second);
  queue = recordSongCardRemintMint(queue, { songId: "song-a", planId: "plan:A", edition: 2, mintId: "mint:A" });
  assert.deepEqual(queue.candidates.map((candidate) => ({ planId: candidate.planId, status: candidate.status, mintId: candidate.mintId || null })), [
    { planId: "plan:A", status: "superseded", mintId: null },
    { planId: "plan:B", status: "awaiting-approval", mintId: null },
  ]);
  assert.notEqual(queue.events.at(-1).type, "remint-explicit-mint-recorded");
});

test("hashed release artifacts bind to one reviewed mint plan before explicit mint confirmation", () => {
  const candidate = { ...planSongCardRemintCandidate({ songId: "song-a", latestEdition: 1, currentSnapshot: snapshot(), currentRevisions: { source: "editor:2" } }), planId: "plan:render-request" };
  let queue = createSongCardRemintQueue({ candidates: [candidate] });
  queue = approveSongCardRemintCandidate(queue, candidate.id, { approvedBy: "operator:cj" });
  queue = enqueueApprovedSongCardRemints(queue);
  const batch = queue.batches[candidate.id];
  const releaseJob = batch.jobs.find((job) => job.stage === "release-export");
  batch.jobs = batch.jobs.map((job) => ({ ...job, status: job.id === releaseJob.id ? "running" : "done" }));
  queue = recordSongCardRemintJobResult(queue, candidate.id, releaseJob.id, {
    ok: true,
    artifacts: [
      { role: "master", path: "/safe/render-e2.mp4", sha256: "sha256:master" },
      { role: "poster", path: "/safe/poster-e2.jpg", sha256: "sha256:poster" },
    ],
  });
  assert.equal(queue.candidates[0].status, "render-ready");
  queue = bindSongCardRemintMintPlan(queue, candidate.id, {
    planId: "plan:reviewed-e2",
    predictedEdition: 2,
    expectedHeadGeneration: 1,
    renderMasterPath: "/safe/render-e2.mp4",
    renderMasterSha256: "sha256:master",
    posterPath: "/safe/poster-e2.jpg",
    posterSha256: "sha256:poster",
  });
  const view = songCardRemintQueueView(queue);
  assert.equal(view.candidates[0].status, "ready-for-mint-review");
  assert.equal(view.candidates[0].mintPlanId, "plan:reviewed-e2");
  assert.equal(view.candidates[0].nextAction, "operator-review-and-confirm-song-card-mint");
  assert.equal(view.candidates[0].mintAuthorized, false);
});
