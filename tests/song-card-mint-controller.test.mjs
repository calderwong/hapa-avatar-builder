import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SongCardMintController } from "../server/song-card-mint-controller.mjs";
import { SongCardMintLedger } from "../server/song-card-mint-ledger.mjs";

const PROBE = { durationSeconds: 10, hasVideo: true, hasAudio: true, decodeOk: true, videoCodec: "h264", audioCodec: "aac", width: 1280, height: 720 };
const truth = { ok: true, allStatesVisible: true, silentDefaultCount: 0, cueReceiptCount: 1 };

async function writePoster(directory) {
  const poster = path.join(directory, "poster.jpg");
  await fsp.writeFile(poster, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
  return poster;
}

async function removeFixture(root) {
  async function makeWritable(target) {
    const stat = await fsp.lstat(target).catch(() => null); if (!stat) return;
    await fsp.chmod(target, stat.isDirectory() ? 0o755 : 0o644).catch(() => {});
    if (stat.isDirectory()) for (const name of await fsp.readdir(target)) await makeWritable(path.join(target, name));
  }
  await makeWritable(root); await fsp.rm(root, { recursive: true, force: true });
}

function graph(mediaId = "media-a") {
  return {
    song: { id: "dear-papa", title: "Dear Papa", durationSeconds: 10, lyricOverlay: { lines: [{ start: 0, end: 2, text: "Dear Papa" }] } },
    tracks: [
      { id: "a", role: "foundation", cards: [{ id: "a0", startSeconds: 0, endSeconds: 10, media: { id: mediaId, title: mediaId, contentHash: mediaId } }] },
      { id: "b", role: "visualizer", cards: [{ id: "b0", startSeconds: 0, endSeconds: 10, visualization: { sourceId: "isf:one", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:one", title: "Frozen Shader" } } }] },
    ],
    directorV2: { treatmentId: "treatment:one", variantId: "variant:one", variantHash: mediaId },
  };
}

test("mint planning reconciles a supplied Landscape graph to a Vertical project", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-orientation-plan-"));
  try {
    const controller = new SongCardMintController({ root: path.join(base, "mint") });
    const suppliedGraph = graph();
    suppliedGraph.outputProfile = "landscape";
    suppliedGraph.directorV2.outputProfile = "landscape";
    suppliedGraph.directorV2.mediaRoleCamera = [{
      id: "camera-path:one",
      corridors: [
        { targetAspect: 16 / 9, startCrop: { x: 0, y: 0, width: 1, height: 1 }, endCrop: { x: 0, y: 0, width: 1, height: 1 } },
        { targetAspect: 9 / 16, startCrop: { x: 0.3, y: 0, width: 0.4, height: 1 }, endCrop: { x: 0.28, y: 0, width: 0.44, height: 1 } },
      ],
    }];
    suppliedGraph.directorV2.cameraKeyframes = [
      { atSeconds: 0, cameraPathId: "camera-path:one" },
      { atSeconds: 10, cameraPathId: "camera-path:one" },
    ];

    const publicPlan = await controller.plan("dear-papa", {
      project: { song_id: "dear-papa", song_title: "Dear Papa", duration: 10, output_profile: "vertical" },
      showGraph: suppliedGraph,
    });
    const stored = await controller.getPlan(publicPlan.planId);
    assert.equal(stored.input.project.output_profile, "vertical");
    assert.equal(stored.input.showGraph.outputProfile.id, "vertical");
    assert.equal(stored.input.showGraph.directorV2.outputProfile.id, "vertical");
    assert.equal(stored.input.showGraph.directorV2.mediaRoleCamera[0].corridors[0].targetAspect, 9 / 16);
    assert.equal(stored.snapshot.outputProfile.id, "vertical");
  } finally { await removeFixture(base); }
});

test("mint-plan storage rejects traversal, symlinks, and file-identity mismatches", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-plan-boundary-"));
  try {
    const controller = new SongCardMintController({ root: path.join(base, "mint") });
    await controller.initialize();
    assert.throws(() => controller.planPath("plan:../../escape"), (error) => error.code === "invalid_mint_plan_id");
    assert.throws(() => controller.planPath("/tmp/absolute"), (error) => error.code === "invalid_mint_plan_id");
    assert.throws(() => controller.planPath("plan:%2e%2e%2fescape"), (error) => error.code === "invalid_mint_plan_id");
    assert.throws(() => controller.planPath("plan:.."), (error) => error.code === "invalid_mint_plan_id");

    const validPath = controller.planPath("plan:legacy-safe");
    await fsp.writeFile(validPath, JSON.stringify({ planId: "plan:legacy-safe", status: "changed" }));
    assert.equal((await controller.getPlan("plan:legacy-safe")).planId, "plan:legacy-safe");

    await fsp.writeFile(controller.planPath("plan:mismatch"), JSON.stringify({ planId: "plan:someone-else" }));
    await assert.rejects(controller.getPlan("plan:mismatch"), (error) => error.code === "mint_plan_identity_mismatch");
    await fsp.writeFile(controller.planPath("plan:mismatch-id"), JSON.stringify({ planId: "plan:mismatch-id", id: "plan:someone-else" }));
    await assert.rejects(controller.getPlan("plan:mismatch-id"), (error) => error.code === "mint_plan_identity_mismatch");
    await fsp.writeFile(controller.planPath("plan:missing-identity"), JSON.stringify({ status: "changed" }));
    await assert.rejects(controller.getPlan("plan:missing-identity"), (error) => error.code === "mint_plan_identity_mismatch");

    const outside = path.join(base, "outside.json");
    await fsp.writeFile(outside, JSON.stringify({ planId: "plan:linked" }));
    await fsp.symlink(outside, controller.planPath("plan:linked"));
    await assert.rejects(controller.getPlan("plan:linked"), (error) => error.code === "invalid_mint_plan_file");
  } finally { await removeFixture(base); }
});

test("controller persists exact plans, mints E1/E2, restarts, streams by role, and prints historical cards", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-controller-"));
  try {
    const renderRoot = path.join(base, "renders"); await fsp.mkdir(renderRoot); const master = path.join(renderRoot, "master.mp4"); await fsp.writeFile(master, "physical-master"); const poster = await writePoster(renderRoot);
    const root = path.join(base, "mint");
    const make = () => new SongCardMintController({ root, ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }) });
    const controller = make();
    const input = { project: { song_id: "dear-papa", song_title: "Dear Papa", duration: 10 }, showGraph: graph(), renderMasterPath: master, posterPath: poster, rendererTruth: truth, rights: { licensingStatus: "operator-authored", consentStatus: "operator-approved" }, approvals: { technical: true, creative: true }, safety: { ok: true } };
    const plan1 = await controller.plan("dear-papa", input);
    assert.equal(plan1.status, "ready"); assert.equal(plan1.predictedEdition, 1); assert.equal(plan1.hardBlockers.length, 0);
    const first = await controller.mint("dear-papa", { planId: plan1.planId, renderMasterPath: master, expectedEdition: 1, expectedHeadGeneration: 0, idempotencyKey: "e1" });
    assert.equal(first.created, true); assert.equal(first.edition, 1);
    const replay = await controller.mint("dear-papa", { planId: plan1.planId, renderMasterPath: master, expectedEdition: 1, idempotencyKey: "e1" });
    assert.equal(replay.created, false); assert.equal(replay.edition, 1);

    const printed1 = await controller.print("dear-papa", 1, 1000, {});
    assert.equal(printed1.card.songCardPrint.edition, 1);
    assert.equal(printed1.card.songCardPrint.timestampMs, 1000);
    assert.equal(printed1.lineageReceipt.schemaVersion, "hapa.song-card.print-lineage-receipt.v1");
    assert.equal(printed1.card.songCardPrint.lineageReceipt.receiptHash, printed1.lineageReceipt.receiptHash);
    const artifact = await controller.artifactInfo("dear-papa", 1, "master");
    assert.equal(artifact.relativePath, "media/master.mp4"); assert.equal(Object.hasOwn(artifact, "path"), false); artifact.openReadStream().destroy();
    const rangeReuse = await controller.artifactInfo("dear-papa", 1, "master");
    assert.equal(rangeReuse.sha256, artifact.sha256);
    assert.equal(controller.artifactVerificationCache.size, 1, "range requests reuse one immutable artifact verification instead of rehashing the master");

    const restarted = make();
    const plan2 = await restarted.plan("dear-papa", { ...input, showGraph: graph("media-b") });
    assert.equal(plan2.predictedEdition, 2); assert.ok(plan2.changedFamilies.includes("videos"));
    const second = await restarted.mint("dear-papa", { planId: plan2.planId, renderMasterPath: master, expectedEdition: 2, expectedHeadGeneration: 1, idempotencyKey: "e2" });
    assert.equal(second.edition, 2);
    const readModel = await restarted.getSongCard("dear-papa");
    assert.equal(readModel.latestEdition, 2); assert.equal(readModel.editions.length, 2);
    assert.ok(readModel.editions[0].semanticDiff.changedFamilies.includes("videos"));
    assert.equal(readModel.editions[0].manifest.schemaVersion, "hapa.song-card.public-manifest.v1");
    assert.equal(readModel.editions[0].lineage.complete, true);
    assert.equal(readModel.editions[0].telemetrySummary.perFrame, false);
    assert.equal((await restarted.verify("dear-papa", 1)).ok, true);
    assert.equal((await restarted.verify("dear-papa", 2)).ok, true);
    const printedAgain = await restarted.print("dear-papa", 1, 1000, {});
    assert.equal(printedAgain.card.title, printed1.card.title, "Edition 1 print remains frozen after Edition 2");
    const events = (await fsp.readFile(path.join(root, "events.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(events.some((event) => event.type === "mint-requested"));
    assert.ok(events.some((event) => event.type === "card-printed"));
    assert.equal(events.some((event) => /frame/i.test(event.type)), false);
  } finally { await removeFixture(base); }
});

test("mint rejects a render that changed after the operator confirmed its exact plan", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-controller-confirmed-source-"));
  try {
    const renderRoot = path.join(base, "renders"); await fsp.mkdir(renderRoot); const master = path.join(renderRoot, "master.mp4"); await fsp.writeFile(master, "planned-master"); const poster = await writePoster(renderRoot);
    const root = path.join(base, "mint");
    const controller = new SongCardMintController({ root, ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }) });
    const input = { project: { song_id: "dear-papa", duration: 10 }, showGraph: graph(), renderMasterPath: master, posterPath: poster, rendererTruth: truth };
    const plan = await controller.plan("dear-papa", input);
    await fsp.writeFile(master, "different-master-after-confirmation");
    await assert.rejects(controller.mint("dear-papa", { planId: plan.planId, renderMasterPath: master, expectedEdition: 1, expectedHeadGeneration: 0 }), (error) => error.code === "mint_plan_changed");
    assert.equal(await controller.ledger.getHead("song-card:dear-papa"), null);
  } finally { await removeFixture(base); }
});

test("API verification fails when any declared immutable support file is tampered", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-controller-full-verify-"));
  try {
    const renderRoot = path.join(base, "renders"); await fsp.mkdir(renderRoot); const master = path.join(renderRoot, "master.mp4"); await fsp.writeFile(master, "physical-master"); const poster = await writePoster(renderRoot);
    const root = path.join(base, "mint");
    const controller = new SongCardMintController({ root, ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }) });
    const plan = await controller.plan("dear-papa", { project: { song_id: "dear-papa", duration: 10 }, showGraph: graph(), renderMasterPath: master, posterPath: poster, rendererTruth: truth });
    await controller.mint("dear-papa", { planId: plan.planId, expectedEdition: 1, expectedHeadGeneration: 0 });
    const edition = await controller.ledger.readEdition("song-card:dear-papa", 1);
    await fsp.chmod(edition.directory, 0o755);
    await fsp.chmod(path.join(edition.directory, "timestamp-index.json"), 0o644);
    await fsp.writeFile(path.join(edition.directory, "timestamp-index.json"), "{}\n");
    const verification = await controller.verify("dear-papa", 1);
    assert.equal(verification.ok, false);
    assert.equal(verification.checks.supportFileHashes, false);
    assert.equal(verification.checks.immutablePermissions, false);
  } finally { await removeFixture(base); }
});

test("canceling a durable active job cooperatively prevents an uncommitted edition", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-controller-cancel-"));
  try {
    const renderRoot = path.join(base, "renders"); await fsp.mkdir(renderRoot); const master = path.join(renderRoot, "master.mp4"); await fsp.writeFile(master, "physical-master"); const poster = await writePoster(renderRoot);
    const root = path.join(base, "mint");
    let decoderStarted;
    let releaseDecoder;
    const started = new Promise((resolve) => { decoderStarted = resolve; });
    const gate = new Promise((resolve) => { releaseDecoder = resolve; });
    const ledger = new SongCardMintLedger({
      root,
      allowedSourceRoots: [renderRoot],
      mediaProbe: async () => PROBE,
      mediaDecoder: async () => { decoderStarted(); await gate; return { ok: true, fullAudioVideoDecode: true, decoder: "test-gate" }; },
    });
    const controller = new SongCardMintController({ root, ledger });
    const plan = await controller.plan("dear-papa", { project: { song_id: "dear-papa", duration: 10 }, showGraph: graph(), renderMasterPath: master, posterPath: poster, rendererTruth: truth });
    const mintPromise = controller.mint("dear-papa", { planId: plan.planId, expectedEdition: 1, expectedHeadGeneration: 0, idempotencyKey: "cancel-me" });
    await started;
    const canceled = await controller.cancel(plan.planId, { reason: "operator-test" });
    assert.equal(canceled.status, "canceled");
    releaseDecoder();
    await assert.rejects(mintPromise, (error) => error.code === "MINT_CANCELED");
    assert.equal(await ledger.getHead("song-card:dear-papa"), null);
    const job = await controller.getJob((await controller.getPlan(plan.planId)).jobId);
    assert.equal(job.status, "canceled");
  } finally { await removeFixture(base); }
});

test("controller public methods do not expose custody paths and public gates fail closed", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-controller-privacy-"));
  try {
    const renderRoot = path.join(base, "renders"); await fsp.mkdir(renderRoot); const master = path.join(renderRoot, "master.mp4"); await fsp.writeFile(master, "master"); const poster = await writePoster(renderRoot); const root = path.join(base, "mint");
    const controller = new SongCardMintController({ root, ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }) });
    const plan = await controller.plan("dear-papa", { project: { song_id: "dear-papa", duration: 10 }, showGraph: graph(), renderMasterPath: master, posterPath: poster, rendererTruth: truth, gate: "public-gate" });
    assert.equal(JSON.stringify(plan).includes(base), true, "authenticated plan may name the selected local render");
    await assert.rejects(controller.mint("dear-papa", { planId: plan.planId, renderMasterPath: master, posterPath: poster, gate: "public-gate", expectedEdition: 1 }), (error) => error.code === "publish_gate_blocked");
    const publicCard = await controller.getSongCard("dear-papa");
    assert.equal(JSON.stringify(publicCard).includes(base), false);
  } finally { await removeFixture(base); }
});

test("managed render defaults copy the worker master and generate a verified poster", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-managed-render-"));
  try {
    const renderRoot = path.join(base, "worker-renders");
    await fsp.mkdir(renderRoot);
    const master = path.join(renderRoot, "worker-master.mp4");
    await fsp.writeFile(master, "worker-produced-master");
    const root = path.join(base, "mint");
    const controller = new SongCardMintController({
      root,
      ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }),
      runCommand: async (_command, args) => {
        await fsp.writeFile(args.at(-1), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
        return { stdout: "", stderr: "" };
      },
    });
    const managed = await controller.prepareManagedRender("dear-papa", { masterPath: master });
    assert.equal(managed.schemaVersion, "hapa.song-card.managed-render.v1");
    assert.equal(managed.sourceVerified, true);
    assert.equal(managed.master.managed, true);
    assert.equal(managed.poster.managed, true);
    assert.equal(managed.poster.generated, true);
    assert.equal(await fsp.readFile(managed.master.path, "utf8"), "worker-produced-master");

    const plan = await controller.plan("dear-papa", {
      project: { song_id: "dear-papa", duration: 10 },
      showGraph: graph(),
      renderMasterPath: master,
      rendererTruth: truth,
    });
    assert.equal(plan.status, "ready");
    assert.equal(plan.hardBlockers.length, 0);
    assert.equal(plan.managedArtifacts.posterGenerated, true);
    assert.equal(plan.posterPath.endsWith("poster.jpg"), true);
    assert.notEqual(plan.renderMasterPath, master);
  } finally { await removeFixture(base); }
});

test("managed exports choose unique video and bundle destinations outside the live ledger", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-managed-export-"));
  try {
    const renderRoot = path.join(base, "renders");
    const exportRoot = path.join(base, "exports");
    await fsp.mkdir(renderRoot);
    const master = path.join(renderRoot, "master.mp4");
    await fsp.writeFile(master, "immutable-export-master");
    const poster = await writePoster(renderRoot);
    const root = path.join(base, "mint");
    const controller = new SongCardMintController({
      root,
      exportRoot,
      ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }),
    });
    const plan = await controller.plan("dear-papa", {
      project: { song_id: "dear-papa", song_title: "Dear Papa", duration: 10 },
      showGraph: graph(),
      renderMasterPath: master,
      posterPath: poster,
      rendererTruth: truth,
    });
    await controller.mint("dear-papa", { planId: plan.planId, expectedEdition: 1, expectedHeadGeneration: 0 });

    const video = await controller.exportEdition("dear-papa", 1, { format: "video" });
    const secondVideo = await controller.exportEdition("dear-papa", 1, { format: "mp4" });
    const bundle = await controller.exportEdition("dear-papa", 1, { format: "bundle" });
    assert.equal(video.format, "video");
    assert.equal(path.dirname(video.destination), await fsp.realpath(exportRoot));
    assert.equal(await fsp.readFile(video.destination, "utf8"), "immutable-export-master");
    assert.notEqual(secondVideo.destination, video.destination);
    assert.match(secondVideo.fileName, /-2\.mp4$/u);
    assert.equal(bundle.format, "bundle");
    assert.equal(path.dirname(bundle.destination), await fsp.realpath(exportRoot));
    assert.equal(JSON.parse(await fsp.readFile(path.join(bundle.destination, "export-manifest.json"), "utf8")).edition, 1);
    assert.equal((await fsp.stat(path.join(bundle.destination, "media", "master.mp4"))).isFile(), true);
  } finally { await removeFixture(base); }
});

test("managed MP4 export fails closed when immutable renderer truth is tampered", async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-managed-export-integrity-"));
  try {
    const renderRoot = path.join(base, "renders");
    const exportRoot = path.join(base, "exports");
    await fsp.mkdir(renderRoot);
    const master = path.join(renderRoot, "master.mp4");
    await fsp.writeFile(master, "immutable-export-master");
    const poster = await writePoster(renderRoot);
    const root = path.join(base, "mint");
    const controller = new SongCardMintController({
      root,
      exportRoot,
      ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }),
    });
    const plan = await controller.plan("dear-papa", {
      project: { song_id: "dear-papa", song_title: "Dear Papa", duration: 10 },
      showGraph: graph(),
      renderMasterPath: master,
      posterPath: poster,
      rendererTruth: truth,
    });
    await controller.mint("dear-papa", { planId: plan.planId, expectedEdition: 1, expectedHeadGeneration: 0 });
    const edition = await controller.ledger.readEdition("song-card:dear-papa", 1);
    const rendererTruthPath = path.join(edition.directory, "data", "renderer-truth.json");
    await fsp.chmod(rendererTruthPath, 0o644);
    await fsp.writeFile(rendererTruthPath, `${JSON.stringify({ ...truth, tampered: true })}\n`);

    await assert.rejects(
      controller.exportEdition("dear-papa", 1, { format: "video" }),
      (error) => error.code === "BUNDLE_INTEGRITY_FAILED",
    );
    assert.equal(await fsp.stat(exportRoot).then(() => true).catch(() => false), false, "integrity failure must happen before creating an export destination");
  } finally { await removeFixture(base); }
});

test("managed export falls back to a private Builder-owned root when the preferred root is unwritable", async (t) => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    t.skip("root can bypass directory write permissions");
    return;
  }
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-managed-export-fallback-"));
  try {
    const renderRoot = path.join(base, "renders");
    const exportRoot = path.join(base, "unwritable-preferred");
    const fallbackExportRoot = path.join(base, "builder-owned-exports");
    await Promise.all([fsp.mkdir(renderRoot), fsp.mkdir(exportRoot)]);
    await fsp.chmod(exportRoot, 0o500);
    const master = path.join(renderRoot, "master.mp4");
    await fsp.writeFile(master, "immutable-export-master");
    const poster = await writePoster(renderRoot);
    const root = path.join(base, "mint");
    const controller = new SongCardMintController({
      root,
      exportRoot,
      fallbackExportRoot,
      ledger: new SongCardMintLedger({ root, allowedSourceRoots: [renderRoot], mediaProbe: async () => PROBE }),
    });
    const plan = await controller.plan("dear-papa", {
      project: { song_id: "dear-papa", song_title: "Dear Papa", duration: 10 },
      showGraph: graph(),
      renderMasterPath: master,
      posterPath: poster,
      rendererTruth: truth,
    });
    await controller.mint("dear-papa", { planId: plan.planId, expectedEdition: 1, expectedHeadGeneration: 0 });

    const exported = await controller.exportEdition("dear-papa", 1, { format: "video" });
    assert.equal(exported.fallbackUsed, true);
    assert.equal(exported.preferredExportRoot, exportRoot);
    assert.match(exported.fallbackReason, /permission denied|EACCES|operation not permitted/iu);
    assert.equal(exported.exportRoot, await fsp.realpath(fallbackExportRoot));
    assert.equal(path.dirname(exported.destination), await fsp.realpath(fallbackExportRoot));
    assert.equal(await fsp.readFile(exported.destination, "utf8"), "immutable-export-master");
    assert.equal((await fsp.stat(fallbackExportRoot)).mode & 0o077, 0, "Builder-owned fallback must stay private");
  } finally { await removeFixture(base); }
});
