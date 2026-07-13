import test from "node:test";
import assert from "node:assert/strict";
import { buildSongCardMintSnapshot } from "../src/domain/song-card-mint.js";
import {
  approveSongCardRemintCandidate,
  bindSongCardRemintMintPlan,
  claimSongCardRemintWork,
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
  queue = upsertSongCardRemintCandidate(queue, input, { eventAt: "2026-07-12T00:00:01Z" });
  assert.equal(queue.candidates.length, 1);
  const newer = planSongCardRemintCandidate({ ...input, currentSnapshot: snapshot({ mediaId: "media:c" }), currentRevisions: { editor: "editor:3" } });
  queue = upsertSongCardRemintCandidate(queue, newer);
  assert.equal(queue.candidates.length, 2);
  assert.equal(queue.candidates[0].status, "superseded");
  assert.equal(queue.candidates[0].supersededBy, newer.id);
  assert.equal(queue.candidates[1].status, "awaiting-approval");
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
