import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSongCardRemintStore } from "../server/song-card-remint-store.mjs";
import { buildSongCardMintSnapshot, diffSongCardMintSnapshots } from "../src/domain/song-card-mint.js";
import { createSongCardRemintQueue, SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA } from "../src/domain/song-card-remint-queue.js";

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

test("opening a stable remint queue is read-only across duplicate server starts", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-stable-startup-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const controller = { ledger: { getHead: async () => null, readEdition: async () => null } };
  const first = createSongCardRemintStore({ root, controller });
  await first.initialize();
  const queuePath = path.join(root, "remint-queue.json");
  const before = await fsp.readFile(queuePath, "utf8");
  const beforeStat = await fsp.stat(queuePath, { bigint: true });

  const duplicate = createSongCardRemintStore({ root, controller });
  await duplicate.initialize();

  const after = await fsp.readFile(queuePath, "utf8");
  const afterStat = await fsp.stat(queuePath, { bigint: true });
  assert.equal(after, before);
  assert.equal(afterStat.ino, beforeStat.ino, "a read-only startup must not atomically replace the queue file");
  assert.equal(afterStat.mtimeNs, beforeStat.mtimeNs, "a read-only startup must preserve the queue source identity");
});

test("startup migrates legacy resume-event growth once and is read-only afterward", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-resume-migration-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const controller = { ledger: { getHead: async () => null, readEdition: async () => null } };
  const queuePath = path.join(root, "remint-queue.json");
  const seed = createSongCardRemintQueue({ createdAt: "2026-07-13T00:00:00.000Z" });
  seed.events = [
    { type: "remint-candidate-created", at: "2026-07-13T00:00:00.000Z" },
    ...Array.from({ length: 100 }, (_, index) => ({
      type: "remint-queue-resumed",
      at: `2026-07-13T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
      batchCount: 0,
      autoMint: false,
    })),
  ];
  await fsp.writeFile(queuePath, `${JSON.stringify(seed, null, 2)}\n`);

  const migrating = createSongCardRemintStore({ root, controller });
  await migrating.initialize();
  const migrated = JSON.parse(await fsp.readFile(queuePath, "utf8"));
  assert.equal(migrated.events.some((event) => event.type === "remint-candidate-created"), true);
  assert.equal(migrated.events.some((event) => event.type === "remint-queue-resumed"), false);
  assert.equal(migrated.events.find((event) => event.type === "remint-queue-resume-history-compacted")?.compactedCount, 100);
  const migratedBytes = await fsp.readFile(queuePath, "utf8");
  const migratedStat = await fsp.stat(queuePath, { bigint: true });

  const duplicate = createSongCardRemintStore({ root, controller });
  await duplicate.initialize();
  const stableStat = await fsp.stat(queuePath, { bigint: true });
  assert.equal(await fsp.readFile(queuePath, "utf8"), migratedBytes);
  assert.equal(stableStat.ino, migratedStat.ino);
  assert.equal(stableStat.mtimeNs, migratedStat.mtimeNs);
});

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

  await restarted.recordResult(proposed.id, releaseJobId, {
    ok: true,
    artifacts: [
      { role: "master", path: masterPath, sha256: `sha256:${await sha(masterPath)}` },
      { role: "poster", path: posterPath, sha256: `sha256:${await sha(posterPath)}` },
    ],
    receipt: {
      ...releaseReceiptContract,
      executorId: "hapa-avatar-builder:local-hyperframes",
      checkpointIdentity: `sha256:${"c".repeat(64)}`,
      masterSha256: `sha256:${await sha(masterPath)}`,
      rendererTruth: {
        schemaVersion: "hapa.show.release-renderer-truth.v1",
        executionStatus: "executed",
        status: "verified",
        ok: true,
        allStatesVisible: true,
        silentDefaultCount: 0,
        cueReceiptCount: 1,
        receipts: [{ cueId: "cue-a", ok: true, executionStatus: "executed" }],
      },
      qa: { executionStatus: "executed", status: "passed", ok: true },
    },
  });
  await assert.rejects(
    restarted.bindRenderPlan(proposed.id, { project: { revision: "editor:2" }, showGraph: after.showGraph }),
    /detached from its exact start certificate and guarded claim generation/,
    "a caller cannot impersonate the local renderer without its store-stamped guarded persistence receipt",
  );
  assert.equal(plannedBody, null);

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

test("guarded release result CAS cannot become render-ready after its exact start certificate goes stale", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-result-cas-"));
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
    planId: "plan:guarded-editor-2",
    headId: "song-card:song-a",
    input: { song: { title: "Song A" } },
    sourceRevision: "editor:2",
    snapshot: after,
    semanticDiff: diffSongCardMintSnapshots(before, after),
  };
  const store = createSongCardRemintStore({ root, controller });
  const candidate = await store.proposeFromPlan("song-a", storedPlan);
  await store.approve(candidate.id, { approvedBy: "operator:result-cas-test" });
  await store.enqueue();
  const startCertificateSha256 = `sha256:${createHash("sha256").update("exact-start-certificate").digest("hex")}`;
  const renderIdentitySha256 = `sha256:${createHash("sha256").update("exact-render-identity").digest("hex")}`;
  const resultPersistenceGuard = {
    planId: storedPlan.planId,
    candidateFingerprint: candidate.fingerprint,
    startCertificateSha256,
    renderIdentitySha256,
  };

  let releaseWork = null;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const claim = await store.claim({ candidateId: candidate.id, activePlayback: false, resultPersistenceGuard });
    assert.equal(claim.claimed.length, 1, `expected one guarded claim at iteration ${iteration}`);
    const work = claim.claimed[0];
    if (work.stage === "release-export") {
      releaseWork = work;
      break;
    }
    await store.recordGuardedResult(candidate.id, work.jobId, {
      ok: true,
      artifacts: [`artifact:${work.stage}`],
      receipt: { stage: work.stage, ok: true },
    }, {
      resultPersistenceGuard: work.resultPersistenceGuard,
      assertFresh: async () => true,
    });
  }
  assert.equal(releaseWork?.stage, "release-export");

  let certificateFresh = true;
  const assertFresh = async () => {
    if (certificateFresh) return true;
    const error = new Error("The exact render-start certificate changed before result commit.");
    error.code = "local_render_start_certification_not_ready";
    error.statusCode = 409;
    error.details = { stage: "result-persistence", reason: "execution-certificate-changed-after-start" };
    throw error;
  };
  assert.equal(await assertFresh(), true, "the old external pre-check can pass before the race");
  certificateFresh = false;
  const releaseResult = {
    ok: true,
    artifacts: [
      { role: "master", path: "/managed/master.mp4", sha256: `sha256:${"a".repeat(64)}` },
      { role: "poster", path: "/managed/poster.jpg", sha256: `sha256:${"b".repeat(64)}` },
    ],
    receipt: {
      ...releaseWork.releaseReceiptContract,
      executorId: "worker:guarded-release-test",
      checkpointIdentity: renderIdentitySha256,
      masterSha256: `sha256:${"a".repeat(64)}`,
    },
  };
  await assert.rejects(
    store.recordResult(candidate.id, releaseWork.jobId, releaseResult),
    (error) => error?.code === "local_render_result_persistence_conflict"
      && error?.details?.reason === "guarded-result-path-required",
    "an unguarded caller cannot consume a job generation claimed by the local certificate-aware bridge",
  );
  await assert.rejects(
    store.recordGuardedResult(candidate.id, releaseWork.jobId, releaseResult, {
      resultPersistenceGuard: releaseWork.resultPersistenceGuard,
      assertFresh,
      stage: "commit-release-export-result",
    }),
    (error) => error?.code === "local_render_start_certification_not_ready"
      && error?.details?.reason === "execution-certificate-changed-after-start",
  );
  let view = await store.view();
  let current = view.candidates.find((row) => row.id === candidate.id);
  assert.equal(current.status, "rendering");
  assert.equal(current.jobs.find((job) => job.id === releaseWork.jobId)?.status, "running");
  assert.deepEqual(current.renderArtifacts, []);
  assert.equal(current.releaseReceipt, null);

  certificateFresh = true;
  await store.recordResult(candidate.id, releaseWork.jobId, {
    ok: false,
    message: "certificate drift stopped guarded result persistence",
    retryable: true,
    requiresExplicitRetry: true,
  });
  current = (await store.view()).candidates.find((row) => row.id === candidate.id);
  assert.equal(current.status, "failed");
  let rawQueue = JSON.parse(await fsp.readFile(path.join(root, "remint-queue.json"), "utf8"));
  let rawRelease = rawQueue.batches[candidate.id].jobs.find((job) => job.id === releaseWork.jobId);
  assert.equal(rawRelease.resultPersistenceGuard.generation, releaseWork.resultPersistenceGuard.generation);
  await assert.rejects(
    store.recordResult(candidate.id, releaseWork.jobId, releaseResult),
    (error) => error?.code === "local_render_result_persistence_conflict"
      && error?.details?.reason === "guarded-result-path-required",
    "recording the freshness failure must not erase the guard and reopen an unguarded success path",
  );

  await store.retry(candidate.id);
  releaseWork = null;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const claim = await store.claim({ candidateId: candidate.id, activePlayback: false, resultPersistenceGuard });
    assert.equal(claim.claimed.length, 1, `expected one guarded retry claim at iteration ${iteration}`);
    const work = claim.claimed[0];
    if (work.stage === "release-export") {
      releaseWork = work;
      break;
    }
    await store.recordGuardedResult(candidate.id, work.jobId, {
      ok: true,
      artifacts: [`artifact:${work.stage}:retry`],
      receipt: { stage: work.stage, ok: true },
    }, {
      resultPersistenceGuard: work.resultPersistenceGuard,
      assertFresh,
    });
  }
  assert.equal(releaseWork?.stage, "release-export");
  await assert.rejects(
    store.recordGuardedResult(candidate.id, releaseWork.jobId, releaseResult, {
      resultPersistenceGuard: { ...releaseWork.resultPersistenceGuard, generation: "result-guard:obsolete" },
      assertFresh,
    }),
    (error) => error?.code === "local_render_result_persistence_conflict"
      && error?.details?.reason === "result-guard-generation-changed",
  );
  current = (await store.view()).candidates.find((row) => row.id === candidate.id);
  assert.equal(current.status, "rendering");
  assert.equal(current.releaseReceipt, null);

  await store.recordGuardedResult(candidate.id, releaseWork.jobId, releaseResult, {
    resultPersistenceGuard: releaseWork.resultPersistenceGuard,
    assertFresh,
    stage: "commit-release-export-result",
  });
  view = await store.view();
  current = view.candidates.find((row) => row.id === candidate.id);
  assert.equal(current.status, "render-ready");
  assert.equal(current.releaseReceipt.startCertificateSha256, startCertificateSha256);
  assert.equal(current.releaseReceipt.resultPersistence.generation, releaseWork.resultPersistenceGuard.generation);
  assert.equal(current.releaseReceipt.resultPersistence.renderIdentitySha256, renderIdentitySha256);
  await assert.rejects(
    store.recordResult(candidate.id, releaseWork.jobId, { ...releaseResult, receipt: { ...releaseResult.receipt, executorId: "worker:overwrite-attempt" } }),
    (error) => error?.code === "local_render_result_persistence_conflict"
      && error?.details?.reason === "guarded-result-already-committed",
  );
  await assert.rejects(
    store.recordResult(candidate.id, releaseWork.jobId, { ok: false, message: "late stale failure" }),
    (error) => error?.code === "local_render_result_persistence_conflict"
      && error?.details?.reason === "guarded-result-already-committed",
  );
  current = (await store.view()).candidates.find((row) => row.id === candidate.id);
  assert.equal(current.status, "render-ready");
  assert.equal(current.releaseReceipt.resultPersistence.generation, releaseWork.resultPersistenceGuard.generation);
  const persisted = JSON.parse(await fsp.readFile(path.join(root, "remint-queue.json"), "utf8"));
  const persistedRelease = persisted.batches[candidate.id].jobs.find((job) => job.id === releaseWork.jobId);
  assert.equal(persistedRelease.status, "done");
  assert.equal(persistedRelease.resultPersistenceGuard, null, "a consumed claim generation cannot be replayed");
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

test("worker claim fails before queue mutation when the source mint plan is not runnable", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-plan-guard-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const before = snapshot("media:a", "editor:1");
  const after = snapshot("media:b", "editor:2");
  let guardCalls = 0;
  const controller = {
    ledger: {
      getHead: async () => ({ latestEdition: 1, generation: 1, editions: [{ edition: 1, sourceRevision: "editor:1" }] }),
      readEdition: async () => ({ snapshot: structuredClone(before) }),
    },
    assertPlanRunnable: async (planId) => {
      guardCalls += 1;
      const error = new Error(`Plan ${planId} requires canonical rehydration`);
      error.code = "mint_plan_rehydration_required";
      error.statusCode = 409;
      throw error;
    },
  };
  const storedPlan = {
    planId: "plan:legacy-editor-2",
    headId: "song-card:song-a",
    input: { song: { title: "Song A" } },
    sourceRevision: "editor:2",
    snapshot: after,
    semanticDiff: diffSongCardMintSnapshots(before, after),
  };
  const store = createSongCardRemintStore({ root, controller });
  const candidate = await store.proposeFromPlan("song-a", storedPlan);
  await store.approve(candidate.id, { approvedBy: "operator:cj" });
  await store.enqueue();

  await assert.rejects(store.claim({ candidateId: candidate.id, activePlayback: false }), (error) => error?.code === "mint_plan_rehydration_required");
  assert.equal(guardCalls, 1);
  const unchanged = (await store.view()).candidates.find((row) => row.id === candidate.id);
  assert.equal(unchanged.status, "queued");
  assert.notEqual(unchanged.status, "rendering");
});

test("canonical replacement handoff revokes old approval and points at the review candidate", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-replacement-handoff-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const before = snapshot("media:a", "editor:1");
  const after = snapshot("media:b", "editor:2");
  const controller = {
    ledger: {
      getHead: async () => ({ latestEdition: 1, generation: 1, editions: [{ edition: 1, sourceRevision: "editor:1" }] }),
      readEdition: async () => ({ snapshot: structuredClone(before) }),
    },
  };
  const store = createSongCardRemintStore({ root, controller });
  const candidate = await store.proposeFromPlan("song-a", {
    planId: "plan:legacy-editor-2",
    headId: "song-card:song-a",
    input: { song: { title: "Song A" } },
    sourceRevision: "editor:2",
    snapshot: after,
    semanticDiff: diffSongCardMintSnapshots(before, after),
  });
  await store.approve(candidate.id, { approvedBy: "operator:cj" });
  await store.enqueue();

  const view = await store.supersede(candidate.id, {
    replacementCandidateId: "song-card-remint:replacement",
    replacementPlanId: "plan:canonical-editor-3",
  });
  const old = view.candidates.find((row) => row.id === candidate.id);
  assert.equal(old.status, "superseded");
  assert.equal(old.approvedBy, null);
  assert.equal(old.renderWorkAuthorized, false);
  assert.equal(old.supersededBy, "song-card-remint:replacement");
  assert.equal(old.supersededByPlanId, "plan:canonical-editor-3");
  assert.equal(store.queue.events.at(-1).type, "remint-candidate-canonical-replacement");
});
