import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { SongCardMintController } from "../server/song-card-mint-controller.mjs";
import { SongCardMintLedger } from "../server/song-card-mint-ledger.mjs";
import { createSongCardRemintStore } from "../server/song-card-remint-store.mjs";
import {
  createSongCardCompilerError,
  createSongCardLocalRenderBridge,
  createSongCardMediaPreflightError,
  describeSongCardCompilerFailure,
  inspectSongCardLocalRenderer,
  preflightSongCardLocalMedia,
} from "../server/song-card-local-renderer.mjs";

const run = promisify(execFile);
const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

async function fileSha256(filePath) {
  return createHash("sha256").update(await fsp.readFile(filePath)).digest("hex");
}

async function removeFixture(root) {
  async function makeWritable(target) {
    const info = await fsp.lstat(target).catch(() => null);
    if (!info) return;
    await fsp.chmod(target, info.isDirectory() ? 0o755 : 0o644).catch(() => {});
    if (info.isDirectory()) for (const name of await fsp.readdir(target)) await makeWritable(path.join(target, name));
  }
  await makeWritable(root);
  await fsp.rm(root, { recursive: true, force: true });
}

async function waitForServer(url, child, output) {
  for (let attempt = 0; attempt < 160 && child.exitCode === null; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API did not start: ${output.join("").slice(-4_000)}`);
}

async function startLocalApi(t, { root, mintRoot, exportRoot, sourceRoot }) {
  const port = 20_200 + Math.floor(Math.random() * 400);
  const api = `http://127.0.0.1:${port}`;
  const output = [];
  const stores = {
    avatar: path.join(root, "avatar-store.json"),
    scene: path.join(root, "scene-store.json"),
    item: path.join(root, "item-store.json"),
  };
  await Promise.all([
    fsp.writeFile(stores.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [], teams: [] })),
    fsp.writeFile(stores.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    fsp.writeFile(stores.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [], agents: [], auditRuns: [], audit: {} })),
  ]);
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPA_AVATAR_TRUST_LOCAL_UI: "1",
      HAPA_AVATAR_STORE: stores.avatar,
      HAPA_SCENE_STORE: stores.scene,
      HAPA_ITEM_STORE: stores.item,
      HAPA_SONG_CARD_MINT_ROOT: mintRoot,
      HAPA_SONG_CARD_EXPORT_ROOT: exportRoot,
      HAPA_SONG_CARD_SOURCE_ROOTS: sourceRoot,
      HAPA_AVATAR_OVERWIND_OUTBOX: path.join(root, "overwind", "outbox.sqlite3"),
      HAPA_OVERWIND_DIR: path.join(root, "overwind"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
  });
  await waitForServer(`${api}/api/health`, child, output);
  const bootstrap = await fetch(`${api}/api/local-ui-session`, {
    method: "POST",
    headers: { origin: api, "sec-fetch-site": "same-origin" },
  });
  assert.equal(bootstrap.status, 201);
  const cookie = (bootstrap.headers.get("set-cookie") || "").split(";", 1)[0];
  assert.match(cookie, new RegExp(`^hapa_avatar_local_session_${port}=`));
  const headers = { cookie, origin: api, "sec-fetch-site": "same-origin" };
  return { api, headers };
}

async function waitForCandidate(store, candidateId, acceptedStatuses, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let candidate = null;
  while (Date.now() - startedAt < timeoutMs) {
    candidate = (await store.view()).candidates.find((row) => row.id === candidateId) || null;
    if (candidate && acceptedStatuses.includes(candidate.status)) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`candidate ${candidateId} did not reach ${acceptedStatuses.join("/")}; last status ${candidate?.status || "missing"}`);
}

async function waitForLocalJob(bridge, candidateId, acceptedStatuses, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let job = null;
  while (Date.now() - startedAt < timeoutMs) {
    job = bridge.status().jobs.find((row) => row.candidateId === candidateId) || null;
    if (job && acceptedStatuses.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`local job ${candidateId} did not reach ${acceptedStatuses.join("/")}; last status ${job?.status || "missing"}`);
}

function exactEditorFixture({ videoPath }) {
  const song = { id: "automatic-local-song", title: "Automatic Local Song", durationSeconds: 0.75, audioPath: "/api/song-registry/audio/automatic-local-song" };
  const showGraph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song,
    tracks: [{
      id: "track-a",
      role: "foundation",
      cards: [{
        id: "card:a:0",
        trackId: "track-a",
        startSeconds: 0,
        endSeconds: 0.75,
        media: { id: "media:fixture", title: "Verified local fixture", localPath: videoPath, sourceKind: "local-video" },
        parameters: { opacity: 1, blendMode: "normal", target: "program" },
      }],
    }, {
      id: "track-c",
      role: "accent",
      cards: [{
        id: "card:c:0",
        trackId: "track-c",
        startSeconds: 0.2,
        endSeconds: 0.35,
        visualization: { sourceId: "director:accent" },
        parameters: { opacity: 0.25, blendMode: "screen", target: "program" },
      }],
    }],
    directorV2: { treatmentId: "treatment:automatic-local", variantId: "variant:automatic-local", variantHash: "fixture-v1" },
  };
  const project = {
    schema_version: "hapa.music-video-project.v2",
    song_id: song.id,
    song_title: song.title,
    duration: song.durationSeconds,
    selected_direction_script_id: "variant:automatic-local",
    timeline: [{
      section_id: "fixture",
      start_sec: 0,
      end_sec: 0.75,
      media_id: "media:fixture",
      media_title: "Verified local fixture",
      media_path: videoPath,
    }],
  };
  return { project, showGraph };
}

async function makeTinyRealFixture(root) {
  const videoPath = path.join(root, "fixture-video.mp4");
  const audioPath = path.join(root, "fixture-audio.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=0.75",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoPath,
  ]);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.75",
    "-c:a", "pcm_s16le", audioPath,
  ]);
  return { videoPath, audioPath };
}

test("compiler failures summarize offline cue counts and identifiers without exposing the raw child command", () => {
  const offlineMissing = Array.from({ length: 20 }, (_, index) => `legacy:media:${index + 1}`);
  const report = {
    ok: false,
    media: {
      declared: 77,
      compiled: 57,
      offlineMissing,
      preflight: { unresolved: offlineMissing.map((cueId) => ({ cueId, reason: "media-source-file-unavailable", attemptedPaths: [`/missing/${cueId}.mp4`] })) },
    },
    visualizers: { declared: 14, exactProxy: 14, compiledAssets: 14, offlineMissing: [] },
    validation: { lint: "pass", inspect: "pass", mediaOffline: "fail", visualizerOffline: "pass", showcaseReady: false },
  };
  const failure = describeSongCardCompilerFailure(report, {
    cause: { code: 1 },
    reportPath: "/managed/render/compiler-report.json",
  });
  assert.equal(failure.code, "local_compile_media_offline");
  assert.match(failure.message, /20 media cues could not be packaged/);
  assert.match(failure.message, /legacy:media:1/);
  assert.match(failure.message, /\+14 more/);
  assert.match(failure.message, /Shaders packaged 14\/14/);
  assert.match(failure.message, /final MP4 did not start/);
  assert.doesNotMatch(failure.message, /compile-hyperframes-show-v2|--graph=/);
  assert.equal(failure.details.exitCode, 1);
  assert.equal(failure.details.media.missingCount, 20);
  assert.deepEqual(failure.details.media.missingCueIds, offlineMissing);
  assert.equal(failure.details.media.unresolved[0].reason, "media-source-file-unavailable");
  assert.equal(failure.details.visualizers.missingCount, 0);

  const shaderFailure = describeSongCardCompilerFailure({
    ok: false,
    media: { declared: 2, compiled: 2, offlineMissing: [] },
    visualizers: {
      declared: 4,
      compiledAssets: 3,
      offlineMissing: ["legacy:ivf:2"],
      preflight: { unresolved: [{ cueId: "legacy:ivf:2", reason: "exact-proxy-asset-hash-mismatch" }] },
    },
    validation: { visualizerPreflight: "fail", showcaseReady: false },
  });
  assert.equal(shaderFailure.code, "local_compile_visualizer_offline");
  assert.match(shaderFailure.message, /legacy:ivf:2: exact-proxy-asset-hash-mismatch/);
  assert.match(shaderFailure.message, /Shaders packaged 3\/4/);
  assert.equal(shaderFailure.details.visualizers.unresolved[0].reason, "exact-proxy-asset-hash-mismatch");
});

test("local media preflight stops missing real cues before rendering and accepts explicit IVF-only blanks", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-media-preflight-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "fixture.mp4");
  await fsp.writeFile(videoPath, "non-empty-media-fixture");
  const editor = exactEditorFixture({ videoPath });
  editor.showGraph.tracks[0].cards.push({
    id: "card:a:ivf-only",
    trackId: "track-a",
    startSeconds: 0.5,
    endSeconds: 0.75,
    media: { id: "none", title: "Visualizer Only", localPath: "" },
    provenance: { rendererRoute: "generated-visualizer" },
  });

  const passing = preflightSongCardLocalMedia({ ...editor, root, projectPath: path.join(root, "project.json") });
  assert.equal(passing.ok, true);
  assert.equal(passing.generatedCount, 1);
  assert.equal(passing.resolvedCount, 1);

  await fsp.rm(videoPath);
  const blocked = preflightSongCardLocalMedia({ ...editor, root, projectPath: path.join(root, "project.json") });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.unresolvedCount, 1);
  assert.equal(blocked.unresolved[0].cueId, "card:a:0");
  assert.equal(blocked.unresolved[0].reason, "media-source-file-unavailable");
  const error = createSongCardMediaPreflightError(blocked);
  assert.equal(error.code, "local_media_preflight_failed");
  assert.equal(error.details.stage, "media-preflight");
  assert.equal(error.details.media.missingCount, 1);
  assert.match(error.message, /before stem analysis/);
  assert.match(error.message, /No media was substituted/);
});

test("automatic local render preserves the exact editor revision, binds verified artifacts, and never auto-mints", { skip: !HAS_FFMPEG, timeout: 60_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-local-workflow-"));
  t.after(() => removeFixture(root));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  const exportRoot = path.join(root, "exports");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const media = await makeTinyRealFixture(sourceRoot);
  const editor = exactEditorFixture(media);
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, exportRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });

  const initialPlan = await controller.plan(editor.project.song_id, editor);
  const storedPlan = await controller.getPlan(initialPlan.planId);
  assert.deepEqual(storedPlan.input.project, editor.project);
  assert.deepEqual(storedPlan.input.showGraph, editor.showGraph);
  const proposed = await store.proposeFromPlan(editor.project.song_id, storedPlan);
  await store.approve(proposed.id, { approvedBy: "operator:local-workflow-test" });
  await store.enqueue();

  const dependencyInspection = inspectSongCardLocalRenderer();
  assert.equal(typeof dependencyInspection.available, "boolean");

  // The injected pipeline creates a tiny, real A/V release fixture. The bridge still
  // owns hashing, ffprobe/QA interpretation, durable job receipts, and mint isolation.
  let receivedEditor = null;
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async (songId) => {
      assert.equal(songId, editor.project.song_id);
      return { masterPath: media.audioPath, songDirectory: sourceRoot };
    },
    pipeline: async ({ project, showGraph, outputDirectory }) => {
      receivedEditor = structuredClone({ project, showGraph });
      await fsp.mkdir(outputDirectory, { recursive: true });
      const masterPath = path.join(outputDirectory, "master.mp4");
      const posterPath = path.join(outputDirectory, "poster.jpg");
      await run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", media.videoPath, "-i", media.audioPath, "-t", "0.75", "-shortest",
        "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", masterPath,
      ]);
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", masterPath, "-frames:v", "1", posterPath]);
      return { masterPath, posterPath };
    },
  });
  const started = await bridge.start(proposed.id);
  assert.equal(started.started, true);
  const duplicateStart = await bridge.start(proposed.id);
  assert.equal(duplicateStart.started, false, "a second click monitors the in-flight render instead of duplicating it");
  const inFlight = bridge.status().jobs.find((row) => row.candidateId === proposed.id);
  assert.ok(inFlight);
  assert.ok(["queued", "rendering"].includes(inFlight.status));
  assert.equal((await controller.ledger.getHead("song-card:automatic-local-song")), null, "render start cannot create an edition");
  const rendered = await waitForCandidate(store, proposed.id, ["render-ready", "failed"]);
  assert.equal(rendered.status, "render-ready", JSON.stringify(rendered.failure || rendered.lastError || {}));
  const completedJob = bridge.status().jobs.find((row) => row.candidateId === proposed.id);
  assert.equal(completedJob.status, "render-ready");
  assert.equal(completedJob.percent, 100);
  assert.deepEqual(receivedEditor, editor, "the renderer must receive the exact selected project and Show Graph from the stored plan");
  assert.equal((await controller.ledger.getHead("song-card:automatic-local-song")), null, "render completion still requires explicit mint confirmation");
  assert.match(rendered.renderArtifacts.find((row) => row.role === "master")?.sha256 || "", /^sha256:[a-f0-9]{64}$/u);

  const binding = await store.bindRenderPlan(proposed.id, editor);
  assert.equal(binding.remintCandidate.status, "ready-for-mint-review");
  assert.equal(binding.plan.predictedEdition, 1);
  assert.equal(binding.plan.hardBlockers.length, 0);
  const master = binding.remintCandidate.reviewedRender.master;
  assert.equal(master.sha256, await fileSha256(master.path));

  const minted = await store.mintExplicit({ songId: editor.project.song_id, planId: binding.plan.planId, edition: 1 }, () => controller.mint(editor.project.song_id, {
    planId: binding.plan.planId,
    expectedEdition: 1,
    expectedHeadGeneration: 0,
    idempotencyKey: "automatic-local-edition-1",
  }));
  assert.equal(minted.created, true);
  assert.equal(minted.edition, 1);
  const artifact = await controller.artifactInfo(editor.project.song_id, 1, "master");
  assert.equal(artifact.sha256, master.sha256);
  assert.ok(artifact.size > 1_000);
  artifact.openReadStream().destroy();
  const exported = await controller.exportEdition(editor.project.song_id, 1, { format: "video" });
  assert.equal(await fileSha256(exported.destination), artifact.sha256);

  const localApi = await startLocalApi(t, { root, mintRoot, exportRoot, sourceRoot });
  const card = await fetch(`${localApi.api}/api/song-cards/${editor.project.song_id}`).then((response) => response.json());
  assert.equal(card.latestEdition, 1);
  const ticketResponse = await fetch(`${localApi.api}/api/song-cards/${editor.project.song_id}/editions/1/artifact-ticket`, {
    method: "POST",
    headers: { ...localApi.headers, "content-type": "application/json" },
    body: JSON.stringify({ role: "master" }),
  });
  assert.equal(ticketResponse.status, 201);
  const { ticket } = await ticketResponse.json();
  const playbackResponse = await fetch(`${localApi.api}/api/song-cards/${editor.project.song_id}/editions/1/artifact/master?ticket=${encodeURIComponent(ticket)}`);
  assert.equal(playbackResponse.status, 200);
  assert.equal(playbackResponse.headers.get("content-type"), "video/mp4");
  assert.equal(createHash("sha256").update(Buffer.from(await playbackResponse.arrayBuffer())).digest("hex"), artifact.sha256);
  const managedExportResponse = await fetch(`${localApi.api}/api/song-cards/${editor.project.song_id}/editions/1/export`, {
    method: "POST",
    headers: { ...localApi.headers, "content-type": "application/json" },
    body: JSON.stringify({ format: "video" }),
  });
  assert.equal(managedExportResponse.status, 201);
  const managedExport = await managedExportResponse.json();
  assert.equal(await fileSha256(managedExport.destination), artifact.sha256);
});

test("a local compile failure becomes one durable failed attempt and an approved explicit retry", { timeout: 20_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-local-compile-failure-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const audioPath = path.join(sourceRoot, "master.dat");
  await fsp.writeFile(audioPath, "verified-local-master");
  const editor = exactEditorFixture({ videoPath: path.join(sourceRoot, "video.mp4") });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const initialPlan = await controller.plan(editor.project.song_id, editor);
  const proposed = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(initialPlan.planId));
  await store.approve(proposed.id, { approvedBy: "operator:compile-failure-test" });
  await store.enqueue();
  const compilerReport = {
    ok: false,
    media: { declared: 3, compiled: 1, offlineMissing: ["legacy:media:1", "legacy:media:2"] },
    visualizers: { declared: 1, exactProxy: 1, compiledAssets: 1, offlineMissing: [] },
    validation: { mediaOffline: "fail", visualizerOffline: "pass", showcaseReady: false },
  };
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => audioPath,
    pipeline: async () => { throw createSongCardCompilerError(compilerReport, { cause: { code: 1 }, reportPath: "/managed/compiler-report.json" }); },
  });

  await bridge.start(proposed.id);
  const failed = await waitForCandidate(store, proposed.id, ["failed"]);
  const liveJob = await waitForLocalJob(bridge, proposed.id, ["failed"]);
  assert.equal(liveJob.status, "failed");
  assert.equal(liveJob.error.code, "local_compile_media_offline");
  assert.equal(liveJob.error.details.media.missingCount, 2);
  assert.equal(failed.status, "failed");
  assert.equal(failed.renderFailure.code, "local_compile_media_offline");
  assert.deepEqual(failed.renderFailure.details.media.missingCueIds, ["legacy:media:1", "legacy:media:2"]);
  assert.equal(failed.approvedBy, "operator:compile-failure-test");
  assert.equal(failed.renderWorkAuthorized, true);
  assert.equal(failed.jobs.find((job) => job.stage === "hyperframes").status, "failed");
  assert.equal(failed.jobs.find((job) => job.stage === "hyperframes").status, liveJob.status);

  const retried = await store.retry(proposed.id);
  const retriedCandidate = retried.candidates.find((candidate) => candidate.id === proposed.id);
  assert.equal(retriedCandidate.status, "queued");
  assert.equal(retriedCandidate.renderFailure, null);
  assert.equal(retriedCandidate.approvedBy, "operator:compile-failure-test");
  assert.equal(retriedCandidate.jobs.find((job) => job.stage === "decision-envelope").status, "done", "the completed decision envelope is preserved instead of rerun");
  assert.equal(retriedCandidate.jobs.find((job) => job.stage === "proxy").status, "done");
  assert.equal(retriedCandidate.jobs.find((job) => job.stage === "hyperframes").status, "queued");
});

test("a restarted local bridge rehydrates the hash-verified render checkpoint before QA and release", { skip: !HAS_FFMPEG, timeout: 60_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-checkpoint-resume-"));
  t.after(() => removeFixture(root));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const media = await makeTinyRealFixture(sourceRoot);
  const editor = exactEditorFixture(media);
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const initialPlan = await controller.plan(editor.project.song_id, editor);
  const proposed = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(initialPlan.planId));
  await store.approve(proposed.id, { approvedBy: "operator:checkpoint-test" });
  await store.enqueue();

  let pipelineRuns = 0;
  const pipeline = async ({ outputDirectory }) => {
    pipelineRuns += 1;
    await fsp.mkdir(outputDirectory, { recursive: true });
    const masterPath = path.join(outputDirectory, "checkpoint-master.mp4");
    const posterPath = path.join(outputDirectory, "checkpoint-poster.jpg");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", media.videoPath, "-i", media.audioPath, "-t", "0.75", "-shortest", "-c:v", "copy", "-c:a", "aac", masterPath]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", masterPath, "-frames:v", "1", posterPath]);
    return { masterPath, posterPath };
  };

  let releasePaused;
  let releasePause;
  const paused = new Promise((resolve) => { releasePaused = resolve; });
  const pause = new Promise((resolve) => { releasePause = resolve; });
  let pauseOnce = true;
  const pausingStore = {
    view: (...args) => store.view(...args),
    enqueue: (...args) => store.enqueue(...args),
    claim: (...args) => store.claim(...args),
    retry: (...args) => store.retry(...args),
    recordResult: async (candidateId, jobId, body) => {
      const view = await store.recordResult(candidateId, jobId, body);
      if (pauseOnce && body.ok === true && jobId.endsWith(":hyperframes")) {
        pauseOnce = false;
        releasePaused();
        await pause;
      }
      return view;
    },
  };
  const firstBridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: pausingStore,
    resolveRegistryMaster: async () => ({ masterPath: media.audioPath }),
    pipeline,
  });
  await firstBridge.start(proposed.id);
  await paused;
  const shuttingDown = firstBridge.shutdown({ reason: "checkpoint-test-restart" });
  releasePause();
  await shuttingDown;
  assert.equal((await store.view()).candidates[0].status, "rendering", "the completed HyperFrames stage stays durable across shutdown");

  const restartedBridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => ({ masterPath: media.audioPath }),
    pipeline,
  });
  await restartedBridge.start(proposed.id);
  const resumed = await waitForCandidate(store, proposed.id, ["render-ready", "failed"]);
  assert.equal(resumed.status, "render-ready");
  assert.equal(pipelineRuns, 1, "restart must reuse the verified checkpoint instead of rerendering the final video");
  assert.equal(restartedBridge.status().jobs.find((row) => row.candidateId === proposed.id)?.status, "render-ready");
});

test("operator cancellation aborts the active local pipeline and leaves the candidate durably canceled", { timeout: 20_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-local-cancel-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const audioPath = path.join(sourceRoot, "master.dat");
  await fsp.writeFile(audioPath, "local-master");
  const editor = exactEditorFixture({ videoPath: path.join(sourceRoot, "video.mp4") });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const initialPlan = await controller.plan(editor.project.song_id, editor);
  const proposed = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(initialPlan.planId));
  await store.approve(proposed.id, { approvedBy: "operator:cancel-test" });
  await store.enqueue();

  let pipelineStarted;
  const started = new Promise((resolve) => { pipelineStarted = resolve; });
  let observedAbort = false;
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => audioPath,
    pipeline: async ({ signal }) => {
      pipelineStarted();
      await new Promise((resolve, reject) => signal.addEventListener("abort", () => {
        observedAbort = true;
        reject(signal.reason);
      }, { once: true }));
    },
  });
  await bridge.start(proposed.id);
  await started;
  await store.cancel(proposed.id, { canceledBy: "operator:cancel-test" });
  const result = await bridge.cancel(proposed.id, { reason: "operator-canceled-test-render" });
  assert.equal(result.stopped, true);
  assert.equal(observedAbort, true);
  assert.equal((await store.view()).candidates[0].status, "canceled");
  assert.equal(bridge.status().activeProcessCount, 0);
});
