import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSongCardRemintStore } from "../server/song-card-remint-store.mjs";
import { buildSongCardMintSnapshot, diffSongCardMintSnapshots } from "../src/domain/song-card-mint.js";
import { SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA } from "../src/domain/song-card-remint-queue.js";

function snapshot(mediaId, revision) {
  return buildSongCardMintSnapshot({
    song: { id: "song-a", title: "Song A" },
    project: { revision, duration: 10 },
    showGraph: {
      song: { id: "song-a", title: "Song A", durationSeconds: 10 },
      directorV2: { variantId: "approved-v1", rendererSupport: { renderer: "native" } },
      tracks: [{ id: "foundation", role: "foundation", cards: [{ id: "cue-a", startSeconds: 0, endSeconds: 10, media: { id: mediaId, sha256: `sha256:${mediaId}` } }] }],
    },
    render: { renderer: "native" },
    rendererTruth: { ok: true, silentDefaultCount: 0 },
  });
}

test("proposing an identical plan after cancel returns the newest lineaged attempt while an active attempt deduplicates", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-reproposal-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const before = snapshot("media:a", "editor:1");
  const after = snapshot("media:b", "editor:2");
  const head = { latestEdition: 1, generation: 1, editions: [{ edition: 1, sourceRevision: "editor:1" }] };
  const controller = {
    ledger: {
      getHead: async () => structuredClone(head),
      readEdition: async () => ({ snapshot: structuredClone(before) }),
    },
  };
  const storedPlan = {
    planId: "plan:editor-2",
    headId: "song-card:song-a",
    input: { song: { title: "Song A" } },
    sourceRevision: "editor:2",
    snapshot: after,
    semanticDiff: diffSongCardMintSnapshots(before, after),
  };
  const store = createSongCardRemintStore({ root, controller });
  const first = await store.proposeFromPlan("song-a", storedPlan);
  await store.cancel(first.id, { canceledBy: "operator:cj", reason: "try-again" });

  const second = await store.proposeFromPlan("song-a", storedPlan);
  assert.notEqual(second.id, first.id);
  assert.equal(second.status, "awaiting-approval");
  assert.equal(second.attemptNumber, 2);
  assert.equal(second.attemptLineage.priorAttemptId, first.id);
  assert.equal(second.attemptLineage.priorAttemptStatus, "canceled");

  const identicalActive = await store.proposeFromPlan("song-a", storedPlan);
  assert.equal(identicalActive.id, second.id, "proposeFromPlan returns the newest matching active attempt");
  assert.equal((await store.view()).candidates.length, 2, "an active matching fingerprint still deduplicates");
});

test("persistent remint store survives restart, requires approval, and never increments the ledger itself", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-store-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const before = snapshot("media:a", "editor:1");
  const after = snapshot("media:b", "editor:2");
  const head = { latestEdition: 1, generation: 1, editions: [{ edition: 1, sourceRevision: "editor:1" }] };
  const masterPath = path.join(root, "render-e2.mp4");
  const posterPath = path.join(root, "poster-e2.jpg");
  await fsp.writeFile(masterPath, "render-e2");
  await fsp.writeFile(posterPath, "poster-e2");
  const sha = async (file) => createHash("sha256").update(await fsp.readFile(file)).digest("hex");
  let plannedBody = null;
  const controller = {
    ledger: {
      getHead: async () => structuredClone(head),
      readEdition: async () => ({ snapshot: structuredClone(before) }),
    },
    prepareManagedRender: async (songId, body) => ({
      schemaVersion: "hapa.song-card.managed-render.v1",
      workspaceId: `managed-render:${songId}`,
      master: { role: "master", path: body.masterPath, sha256: await sha(body.masterPath), managed: true },
      poster: { role: "poster", path: body.posterPath, sha256: await sha(body.posterPath), managed: true, generated: false },
    }),
    plan: async (songId, body) => {
      plannedBody = structuredClone(body);
      return ({
      schemaVersion: "hapa.song-card.mint-plan.v1",
      id: "plan:reviewed-e2",
      planId: "plan:reviewed-e2",
      songId,
      sourceRevision: "editor:2",
      predictedEdition: 2,
      expectedHeadGeneration: 1,
      renderMasterPath: body.renderMasterPath,
      renderMasterSha256: await sha(body.renderMasterPath),
      posterPath: body.posterPath,
      posterSha256: await sha(body.posterPath),
      });
    },
  };
  const storedPlan = {
    planId: "plan:editor-2",
    headId: "song-card:song-a",
    input: { song: { title: "Song A" } },
    sourceRevision: "editor:2",
    snapshot: after,
    semanticDiff: diffSongCardMintSnapshots(before, after),
  };

  const first = createSongCardRemintStore({ root, controller });
  await first.initialize();
  const proposed = await first.proposeFromPlan("song-a", storedPlan);
  assert.equal(proposed.status, "awaiting-approval");
  assert.equal(proposed.planId, storedPlan.planId);
  assert.equal(head.latestEdition, 1, "planning must not mint or increment an edition");

  const restarted = createSongCardRemintStore({ root, controller });
  await restarted.initialize();
  let view = await restarted.view();
  assert.equal(view.candidates.length, 1);
  assert.equal(view.candidates[0].planId, storedPlan.planId);
  assert.equal(view.candidates[0].status, "awaiting-approval");

  await assert.rejects(restarted.approve(proposed.id, {}), /approvedBy/);
  await restarted.approve(proposed.id, { approvedBy: "operator:cj" });
  await restarted.enqueue();
  let releaseJobId = "";
  let releaseReceiptContract = null;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    view = await restarted.view();
    if (view.candidates[0].status === "render-ready") break;
    const claimed = await restarted.claim({ activePlayback: false });
    assert.ok(claimed.claimed.length > 0, `render pipeline stopped before release at iteration ${iteration}`);
    for (const work of claimed.claimed) {
      const job = (await restarted.view()).candidates[0].jobs.find((row) => row.id === work.jobId);
      const release = job.stage === "release-export";
      if (release) {
        releaseJobId = work.jobId;
        releaseReceiptContract = work.releaseReceiptContract;
      }
      await restarted.recordResult(work.candidateId, work.jobId, {
        ok: true,
        artifacts: release ? [
          { role: "master", path: masterPath, sha256: `sha256:${await sha(masterPath)}` },
          { role: "poster", path: posterPath, sha256: `sha256:${await sha(posterPath)}` },
        ] : [`artifact:${job.stage}`],
        receipt: release ? {
          ...work.releaseReceiptContract,
          executorId: "worker:release-test",
          masterSha256: `sha256:${await sha(masterPath)}`,
          rendererTruth: { schemaVersion: "hapa.show.release-renderer-truth.v1", status: "declared", ok: true, allStatesVisible: true, silentDefaultCount: 0, cueReceiptCount: 1 },
          qa: { executionStatus: "executed", status: "passed", ok: true },
        } : { stage: job.stage, ok: true },
      });
    }
  }
  view = await restarted.view();
  assert.equal(view.candidates[0].status, "render-ready");
  assert.equal(head.latestEdition, 1, "render orchestration must not mint automatically");
  assert.equal(releaseReceiptContract.schemaVersion, SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA);
  assert.equal(releaseReceiptContract.planId, storedPlan.planId);
  assert.equal(view.candidates[0].releaseReceipt.rendererTruth.status, "declared");

  await assert.rejects(
    restarted.bindRenderPlan(proposed.id, {
      project: { revision: "editor:2" },
      showGraph: after.showGraph,
      rendererTruth: { executionStatus: "executed", ok: true, allStatesVisible: true, silentDefaultCount: 0, marker: "browser-synthesized" },
    }),
    /passing executed renderer truth/,
    "browser-supplied static truth must not replace missing worker execution evidence",
  );
  assert.equal(plannedBody, null, "invalid worker evidence must stop before mint planning");

  const unsupportedRendererTruth = {
    schemaVersion: "hapa.show.release-renderer-truth.v1",
    executionStatus: "executed",
    status: "verified",
    ok: true,
    allStatesVisible: true,
    silentDefaultCount: 0,
    cueReceiptCount: 1,
    unresolvedRendererIds: ["isf:unsupported"],
    receipts: [{ cueId: "cue-a", ok: true, executionStatus: "executed", status: "unsupported" }],
  };
  await restarted.recordResult(proposed.id, releaseJobId, {
    ok: true,
    artifacts: [
      { role: "master", path: masterPath, sha256: `sha256:${await sha(masterPath)}` },
      { role: "poster", path: posterPath, sha256: `sha256:${await sha(posterPath)}` },
    ],
    receipt: {
      ...releaseReceiptContract,
      executorId: "worker:release-test",
      masterSha256: `sha256:${await sha(masterPath)}`,
      rendererTruth: unsupportedRendererTruth,
      qa: { executionStatus: "executed", status: "passed", ok: true },
    },
  });
  await assert.rejects(
    restarted.bindRenderPlan(proposed.id, { project: { revision: "editor:2" }, showGraph: after.showGraph }),
    /unresolved or unexecuted visualizer cues/,
    "unsupported executed-state declarations must not bind as release evidence",
  );
  assert.equal(plannedBody, null, "unsupported cue evidence must stop before mint planning");

  const executedRendererTruth = {
    schemaVersion: "hapa.show.release-renderer-truth.v1",
    executionStatus: "executed",
    status: "verified",
    ok: true,
    allStatesVisible: true,
    silentDefaultCount: 0,
    cueReceiptCount: 1,
    receipts: [{ cueId: "cue-a", ok: true, executionStatus: "executed" }],
  };
  const releaseReceipt = {
    ...releaseReceiptContract,
    executorId: "worker:release-test",
    masterSha256: `sha256:${await sha(masterPath)}`,
    rendererTruth: executedRendererTruth,
    qa: { executionStatus: "executed", status: "passed", ok: true, checks: ["decode", "duration", "renderer-truth"] },
  };
  await restarted.recordResult(proposed.id, releaseJobId, {
    ok: true,
    artifacts: [
      { role: "master", path: masterPath, sha256: `sha256:${await sha(masterPath)}` },
      { role: "poster", path: posterPath, sha256: `sha256:${await sha(posterPath)}` },
    ],
    receipt: releaseReceipt,
  });

  const binding = await restarted.bindRenderPlan(proposed.id, {
    project: { revision: "editor:2" },
    showGraph: after.showGraph,
    rendererTruth: { executionStatus: "declared", ok: true, allStatesVisible: true, silentDefaultCount: 0, marker: "browser-synthesized" },
    receipts: { browser: { rendererTruth: "declared" } },
  });
  assert.equal(binding.plan.planId, "plan:reviewed-e2");
  assert.equal(binding.remintCandidate.status, "ready-for-mint-review");
  assert.equal(binding.remintCandidate.reviewedRender.master.sha256, await sha(masterPath));
  assert.deepEqual(plannedBody.rendererTruth, executedRendererTruth);
  assert.deepEqual(plannedBody.receipts.releaseExport, releaseReceipt);
  assert.equal(plannedBody.receipts.releaseExportVerification.ok, true);
  assert.equal(plannedBody.receipts.releaseExportVerification.executorId, "worker:release-test");
  assert.equal(binding.remintCandidate.releaseReceiptVerification.masterSha256, await sha(masterPath));
  const reboundAfterRestart = createSongCardRemintStore({ root, controller });
  await reboundAfterRestart.initialize();
  assert.equal((await reboundAfterRestart.view()).candidates[0].status, "ready-for-mint-review");

  const explicit = await reboundAfterRestart.mintExplicit({ songId: "song-a", planId: binding.plan.planId, edition: 2, mintId: "mint:e2" }, async () => ({ edition: 2 }));
  assert.equal(explicit.edition, 2);
  view = await reboundAfterRestart.view();
  assert.equal(view.candidates[0].status, "minted");
  assert.equal(view.candidates[0].mintedEdition, 2);
  assert.equal(view.candidates[0].mintAuthorized, false);

  const persisted = JSON.parse(await fsp.readFile(path.join(root, "remint-queue.json"), "utf8"));
  assert.equal(persisted.candidates[0].status, "minted");
  assert.equal(persisted.events.some((event) => event.type === "remint-explicit-mint-recorded" && event.autoMint === false), true);
});

test("persistent remint store explicitly retries failed work without losing candidate approval", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-retry-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const before = snapshot("media:a", "editor:1");
  const after = snapshot("media:b", "editor:2");
  const controller = {
    ledger: {
      getHead: async () => ({ latestEdition: 1, generation: 1, editions: [{ edition: 1, sourceRevision: "editor:1" }] }),
      readEdition: async () => ({ snapshot: structuredClone(before) }),
    },
  };
  const storedPlan = {
    planId: "plan:retry-editor-2",
    headId: "song-card:song-a",
    input: { song: { title: "Song A" } },
    sourceRevision: "editor:2",
    snapshot: after,
    semanticDiff: diffSongCardMintSnapshots(before, after),
  };
  const store = createSongCardRemintStore({ root, controller });
  const candidate = await store.proposeFromPlan("song-a", storedPlan);
  await store.approve(candidate.id, { approvedBy: "operator:retry-test" });
  await store.enqueue();
  let failedJobId = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const claim = await store.claim({ candidateId: candidate.id, activePlayback: false });
    assert.equal(claim.claimed.length, 1);
    failedJobId = claim.claimed[0].jobId;
    await store.recordResult(candidate.id, failedJobId, { ok: false, message: `test failure ${attempt + 1}` });
  }
  assert.equal((await store.view()).candidates[0].status, "failed");

  const retried = await store.retry(candidate.id);
  assert.equal(retried.candidates[0].status, "queued");
  assert.equal(retried.candidates[0].approvedBy, "operator:retry-test");
  const persisted = JSON.parse(await fsp.readFile(path.join(root, "remint-queue.json"), "utf8"));
  const retriedJob = persisted.batches[candidate.id].jobs.find((job) => job.id === failedJobId);
  assert.equal(retriedJob.status, "queued");
  assert.equal(retriedJob.attempts, 0);
  assert.equal(retriedJob.receipt, null);
  assert.deepEqual(retriedJob.producedArtifacts, []);
  assert.equal(persisted.candidates[0].approval.approvedBy, "operator:retry-test");
  assert.equal(persisted.events.at(-1).type, "remint-render-retry-requested");

  const restarted = createSongCardRemintStore({ root, controller });
  await restarted.initialize();
  assert.equal((await restarted.view()).candidates[0].status, "queued");
});
