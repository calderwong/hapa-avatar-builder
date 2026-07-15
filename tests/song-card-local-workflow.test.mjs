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
import { reidentifyEchoCompiledShowGraph, validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import { contentHash } from "../src/domain/echo-director-v2.js";
import {
  assertSongCardSourceSnapshotUnchanged,
  buildSongCardSourceSnapshotManifest,
  canonicalizeSongCardExecutionValue,
  canonicalizeSongCardProxyRegistry,
  createSongCardCompilerError,
  createSongCardAudioInputPreflightError,
  createSongCardLocalRenderBridge,
  createSongCardMediaPreflightError,
  createSongCardPixelQaError,
  createSongCardRenderReadinessError,
  deriveSongCardReleaseCompositionContracts,
  describeSongCardCompilerFailure,
  inspectSongCardLocalRenderer,
  inspectSongCardRendererBuildIdentity,
  inspectSongCardReleaseFrameCadence,
  inspectSongCardReleaseCompositionLog,
  inspectSongCardReleaseAudioLineage,
  inspectSongCardReleaseStreams,
  inspectSongCardReleaseVideoProfile,
  loadSongCardProxyRegistry,
  probeSongCardRelease,
  preflightSongCardLocalMedia,
  preflightSongCardSignalGraph,
  reevaluateSongCardPixelReport,
  resolveSongCardRenderOutputProfile,
} from "../server/song-card-local-renderer.mjs";

const run = promisify(execFile);
const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

test("release stream inspection requires independent full-length audio and video streams", () => {
  const valid = inspectSongCardReleaseStreams({
    format: { duration: "2.0" },
    streams: [
      { codec_type: "video", codec_name: "h264", duration: "2.0", start_time: "0", width: 1280, height: 720 },
      { codec_type: "audio", codec_name: "aac", duration: "2.0", start_time: "0" },
    ],
  }, 2);
  assert.equal(valid.ok, true);

  const shortAudio = inspectSongCardReleaseStreams({
    format: { duration: "2.0" },
    streams: [
      { codec_type: "video", codec_name: "h264", duration: "2.0", start_time: "0", width: 1280, height: 720 },
      { codec_type: "audio", codec_name: "aac", duration: "0.25", start_time: "0" },
    ],
  }, 2);
  assert.equal(shortAudio.ok, false);
  assert.equal(shortAudio.durationMismatch, true);

  const containerMaskedVideo = inspectSongCardReleaseStreams({
    format: { duration: "2.0" },
    streams: [
      { codec_type: "video", codec_name: "h264", start_time: "0", width: 1280, height: 720 },
      { codec_type: "audio", codec_name: "aac", duration: "2.0", start_time: "0" },
    ],
  }, 2);
  assert.equal(containerMaskedVideo.ok, false, "container duration must not substitute for independent video duration");
  assert.equal(containerMaskedVideo.videoDuration, 0);

  const shiftedAudio = inspectSongCardReleaseStreams({
    format: { duration: "2.0" },
    streams: [
      { codec_type: "video", codec_name: "h264", duration: "2.0", start_time: "0", width: 1280, height: 720 },
      { codec_type: "audio", codec_name: "aac", duration: "2.0", start_time: "0.5" },
    ],
  }, 2);
  assert.equal(shiftedAudio.ok, false);
  assert.equal(shiftedAudio.startMismatch, true);

  const almostOneSecondShort = inspectSongCardReleaseStreams({
    format: { duration: "299.3" },
    streams: [
      { codec_type: "video", codec_name: "h264", duration: "299.3", start_time: "0" },
      { codec_type: "audio", codec_name: "aac", duration: "299.3", start_time: "0" },
    ],
  }, 300);
  assert.equal(almostOneSecondShort.ok, false);
  assert.equal(almostOneSecondShort.tolerance, 0.1);
});

test("release QA rejects dimension, frame-rate, frame-budget, black/frozen, and silent false passes", () => {
  const lowCadence = inspectSongCardReleaseVideoProfile({
    format: { duration: "10" },
    streams: [{ codec_type: "video", width: 320, height: 180, duration: "10", avg_frame_rate: "1/1", r_frame_rate: "1/1", nb_read_frames: "10" }],
  }, 10);
  assert.equal(lowCadence.ok, false);
  assert.deepEqual(lowCadence.errors, [
    "release-video-dimensions-mismatch",
    "release-video-frame-rate-mismatch",
    "release-video-frame-count-mismatch",
  ]);

  const profile = inspectSongCardReleaseVideoProfile({
    format: { duration: "10" },
    streams: [{ codec_type: "video", width: 1920, height: 1080, duration: "10", avg_frame_rate: "30/1", r_frame_rate: "30/1", nb_read_frames: "300" }],
  }, 10);
  assert.equal(profile.ok, true);

  const verticalOutputProfile = resolveSongCardRenderOutputProfile({
    project: { output_profile: { id: "vertical", width: 640, height: 1136, fps: 12 } },
  });
  assert.equal(Object.isFrozen(verticalOutputProfile), true);
  assert.deepEqual(
    { id: verticalOutputProfile.id, width: verticalOutputProfile.width, height: verticalOutputProfile.height, fps: verticalOutputProfile.fps },
    { id: "vertical", width: 1080, height: 1920, fps: 30 },
    "request-like dimensions and frame rates must collapse to an immutable canonical profile",
  );
  const verticalProfile = inspectSongCardReleaseVideoProfile({
    format: { duration: "10" },
    streams: [{ codec_type: "video", width: 1080, height: 1920, duration: "10", avg_frame_rate: "30/1", r_frame_rate: "30/1", nb_read_frames: "300" }],
  }, 10, {
    expectedWidth: verticalOutputProfile.width,
    expectedHeight: verticalOutputProfile.height,
    expectedFps: verticalOutputProfile.fps,
  });
  assert.equal(verticalProfile.ok, true);

  const deceptiveVfrDeclaration = inspectSongCardReleaseVideoProfile({
    format: { duration: "300" },
    streams: [{ codec_type: "video", width: 1920, height: 1080, duration: "300", avg_frame_rate: "30/1", r_frame_rate: "60/1", nb_read_frames: "9000" }],
  }, 300);
  assert.equal(deceptiveVfrDeclaration.ok, false);
  assert.ok(deceptiveVfrDeclaration.errors.includes("release-video-frame-rate-mismatch"));

  const missingTwentyFourFrames = inspectSongCardReleaseVideoProfile({
    format: { duration: "300" },
    streams: [{ codec_type: "video", width: 1920, height: 1080, duration: "300", avg_frame_rate: "30/1", r_frame_rate: "30/1", nb_read_frames: "8976" }],
  }, 300);
  assert.equal(missingTwentyFourFrames.ok, false);
  assert.equal(missingTwentyFourFrames.frameTolerance, 3);
  assert.ok(missingTwentyFourFrames.errors.includes("release-video-frame-count-mismatch"));

  const exactCadence = inspectSongCardReleaseFrameCadence({
    frames: Array.from({ length: 300 }, (_, index) => ({ media_type: "video", best_effort_timestamp_time: String(index / 30) })),
  }, 10);
  assert.equal(exactCadence.ok, true);

  const unevenCadenceFrames = Array.from({ length: 300 }, (_, index) => ({ media_type: "video", best_effort_timestamp_time: String(index / 30) }));
  unevenCadenceFrames[150] = { media_type: "video", best_effort_timestamp_time: String((149 / 30) + (2 / 30)) };
  const unevenCadence = inspectSongCardReleaseFrameCadence({ frames: unevenCadenceFrames }, 10);
  assert.equal(unevenCadence.ok, false);
  assert.ok(unevenCadence.errors.includes("release-video-frame-cadence-uneven"));

  const composition = inspectSongCardReleaseCompositionLog([
    "black_start:2 black_end:4.5 black_duration:2.5",
    "freeze_start: 1",
    "freeze_end: 15 | freeze_duration: 14",
    "mean_volume: -inf dB",
    "max_volume: -inf dB",
  ].join("\n"), 10);
  assert.equal(composition.ok, false);
  assert.ok(composition.errors.includes("release-video-prolonged-black"));
  assert.ok(composition.errors.includes("release-video-prolonged-freeze"));
  assert.ok(composition.errors.includes("release-audio-silent-or-unmeasured"));

  const realFreezeLog = inspectSongCardReleaseCompositionLog([
    "freeze_start: 1",
    "freeze_duration: 14",
    "freeze_end: 15",
    "mean_volume: -12 dB",
    "max_volume: -1 dB",
  ].join("\n"), 16, { silenceScanExecuted: true });
  assert.equal(realFreezeLog.ok, false);
  assert.equal(realFreezeLog.frozenSpans[0].durationSeconds, 14);
  assert.ok(realFreezeLog.errors.includes("release-video-prolonged-freeze"));

  const sevenSecondFreeze = inspectSongCardReleaseCompositionLog([
    "freeze_start: 1",
    "freeze_duration: 7",
    "freeze_end: 8",
    "mean_volume: -12 dB",
    "max_volume: -1 dB",
  ].join("\n"), 10, { silenceScanExecuted: true });
  assert.ok(sevenSecondFreeze.errors.includes("release-video-prolonged-freeze"));

  const almostTwoSecondBlack = inspectSongCardReleaseCompositionLog([
    "black_start:1 black_end:2.9 black_duration:1.9",
    "mean_volume: -12 dB",
    "max_volume: -1 dB",
  ].join("\n"), 10, { silenceScanExecuted: true });
  assert.ok(almostTwoSecondBlack.errors.includes("release-video-prolonged-black"));

  const staticContracts = deriveSongCardReleaseCompositionContracts({
    tracks: [{ role: "foundation", cards: [{ id: "image:hold", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/title-card.png" } }] }],
  });
  const declaredStatic = inspectSongCardReleaseCompositionLog([
    "freeze_start: 1",
    "freeze_duration: 14",
    "freeze_end: 15",
    "mean_volume: -12 dB",
    "max_volume: -1 dB",
  ].join("\n"), 16, { silenceScanExecuted: true, ...staticContracts });
  assert.equal(declaredStatic.ok, true);
  assert.equal(declaredStatic.intentionalFrozenSpans.length, 1);

  const adjacentStaticContracts = deriveSongCardReleaseCompositionContracts({
    tracks: [{
      role: "foundation",
      cards: [
        { id: "image:left", startSeconds: 0, endSeconds: 8, media: { localPath: "/tmp/left.png" } },
        { id: "image:right", startSeconds: 8, endSeconds: 16, media: { localPath: "/tmp/right.jpg" } },
      ],
    }],
  });
  assert.deepEqual(
    adjacentStaticContracts.intentionalFreezeSpans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 8], [8, 16]],
  );
  const frozenAcrossStillChange = inspectSongCardReleaseCompositionLog([
    "freeze_start: 1",
    "freeze_duration: 14",
    "freeze_end: 15",
    "mean_volume: -12 dB",
    "max_volume: -1 dB",
  ].join("\n"), 16, { silenceScanExecuted: true, ...adjacentStaticContracts });
  assert.ok(frozenAcrossStillChange.errors.includes("release-video-prolonged-freeze"));

  const staticOverlayContracts = deriveSongCardReleaseCompositionContracts({
    tracks: [
      { id: "base", role: "foundation", cards: [{ id: "image:base", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/base.png" } }] },
      { id: "overlay", role: "overlay", cards: [{ id: "image:overlay", startSeconds: 4, endSeconds: 12, media: { localPath: "/tmp/overlay.png" } }] },
    ],
  });
  assert.deepEqual(
    staticOverlayContracts.intentionalFreezeSpans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 4], [4, 12], [12, 16]],
  );

  const invisibleStaticContracts = deriveSongCardReleaseCompositionContracts({
    tracks: [{ role: "foundation", cards: [{ id: "image:invisible", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/hidden.png" }, parameters: { opacity: 0 } }] }],
  });
  assert.equal(invisibleStaticContracts.intentionalFreezeSpans.length, 0);

  const layeredDynamicContracts = deriveSongCardReleaseCompositionContracts({
    tracks: [
      { role: "foundation", cards: [{ id: "image:base", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/title-card.png" } }] },
      { role: "visualizer", cards: [{ id: "shader:live", startSeconds: 4, endSeconds: 12, visualization: { sourceId: "isf:live" }, parameters: { opacity: 0.7 } }] },
    ],
  });
  assert.deepEqual(
    layeredDynamicContracts.intentionalFreezeSpans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 4], [12, 16]],
  );
  const frozenDespiteVisualizer = inspectSongCardReleaseCompositionLog([
    "freeze_start: 1",
    "freeze_duration: 14",
    "freeze_end: 15",
    "mean_volume: -12 dB",
    "max_volume: -1 dB",
  ].join("\n"), 16, { silenceScanExecuted: true, ...layeredDynamicContracts });
  assert.ok(frozenDespiteVisualizer.errors.includes("release-video-prolonged-freeze"));

  const movingImageContracts = deriveSongCardReleaseCompositionContracts({
    tracks: [{ role: "foundation", cards: [{ id: "image:pan", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/title-card.png" }, parameters: { motion: "pan-down" } }] }],
  });
  assert.equal(movingImageContracts.intentionalFreezeSpans.length, 0);

  const cameraKeyframeContracts = deriveSongCardReleaseCompositionContracts({
    song: { durationSeconds: 16 },
    tracks: [{ role: "foundation", cards: [{ id: "image:keyframed", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/title-card.png" } }] }],
    directorV2: { cameraKeyframes: [
      { slotId: "slot:pan", atSeconds: 4, motion: "pan-left" },
      { slotId: "slot:pan", atSeconds: 12, motion: "pan-left" },
    ] },
  });
  assert.deepEqual(
    cameraKeyframeContracts.intentionalFreezeSpans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 4], [12, 16]],
  );

  const explicitCompositionHold = deriveSongCardReleaseCompositionContracts({
    tracks: [
      { role: "foundation", cards: [{ id: "hold:approved", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/title-card.png" }, parameters: { intentionalCompositionHold: true } }] },
      { role: "visualizer", cards: [{ id: "shader:hidden-by-hold", startSeconds: 0, endSeconds: 16, visualization: { sourceId: "isf:live" } }] },
    ],
  });
  assert.deepEqual(
    explicitCompositionHold.intentionalFreezeSpans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 16]],
  );

  const adjacentCompositionHolds = deriveSongCardReleaseCompositionContracts({
    tracks: [{ role: "foundation", cards: [
      { id: "hold:first", startSeconds: 0, endSeconds: 8, media: { localPath: "/tmp/first.png" }, parameters: { intentionalCompositionHold: true } },
      { id: "hold:second", startSeconds: 8, endSeconds: 16, media: { localPath: "/tmp/second.png" }, parameters: { intentionalCompositionHold: true } },
    ] }],
  });
  assert.deepEqual(
    adjacentCompositionHolds.intentionalFreezeSpans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 8], [8, 16]],
  );

  const layerBlackoutOnly = deriveSongCardReleaseCompositionContracts({
    tracks: [
      { role: "foundation", cards: [{ id: "background", startSeconds: 0, endSeconds: 16, media: { localPath: "/tmp/background.png" } }] },
      { role: "overlay", cards: [{ id: "layer:black", startSeconds: 0, endSeconds: 16, parameters: { intentionalBlackout: true } }] },
    ],
  });
  assert.equal(layerBlackoutOnly.intentionalBlackoutSpans.length, 0);
  assert.equal(layerBlackoutOnly.declaredLayerBlackoutSpans.length, 1);

  const programBlackout = deriveSongCardReleaseCompositionContracts({
    tracks: [{ role: "foundation", cards: [{ id: "program:black", startSeconds: 2, endSeconds: 6, parameters: { intentionalCompositionBlackout: true } }] }],
  });
  assert.deepEqual(programBlackout.intentionalBlackoutSpans.map((span) => [span.startSeconds, span.endSeconds]), [[2, 6]]);

  const eofFreeze = inspectSongCardReleaseCompositionLog("freeze_start: 0\nmean_volume: -12 dB\nmax_volume: -1 dB", 15, { silenceScanExecuted: true });
  assert.equal(eofFreeze.frozenSpans[0].closedBy, "decoded-eof");
  assert.ok(eofFreeze.errors.includes("release-video-prolonged-freeze"));

  const eofBlack = inspectSongCardReleaseCompositionLog("black_start: 3\nmean_volume: -12 dB\nmax_volume: -1 dB", 15, { silenceScanExecuted: true });
  assert.equal(eofBlack.blackSpans[0].closedBy, "decoded-eof");
  assert.ok(eofBlack.errors.includes("release-video-prolonged-black"));

  const clickThenSilence = inspectSongCardReleaseCompositionLog([
    "silence_start: 0.01",
    "silence_duration: 9.99",
    "silence_end: 10",
    "mean_volume: -30 dB",
    "max_volume: 0 dB",
  ].join("\n"), 10, { silenceScanExecuted: true });
  assert.ok(clickThenSilence.errors.includes("release-audio-active-coverage-insufficient"));
});

test("renderer output profile resolution defaults to landscape and honors an explicit project selection", () => {
  const fallback = resolveSongCardRenderOutputProfile();
  assert.deepEqual(
    { id: fallback.id, width: fallback.width, height: fallback.height, fps: fallback.fps },
    { id: "landscape", width: 1920, height: 1080, fps: 30 },
  );
  const compiled = resolveSongCardRenderOutputProfile({
    project: { output_profile: "vertical" },
    showGraph: { outputProfile: "landscape" },
  });
  assert.equal(compiled.id, "vertical");
  assert.equal(resolveSongCardRenderOutputProfile({ showGraph: { outputProfile: "vertical" } }).id, "vertical");
});

test("pixel QA derives its BrowserWindow dimensions from the executable show output profile", async () => {
  const source = await fsp.readFile(path.join(process.cwd(), "scripts/hyperframes-pixel-capture.cjs"), "utf8");
  assert.match(source, /resolveEchoOutputProfile\(manifest\?\.outputProfile \?\? manifest\?\.output_profile\)/u);
  assert.match(source, /width: outputProfile\.width/u);
  assert.match(source, /height: outputProfile\.height/u);
});

test("release audio lineage distinguishes the mastered song from same-duration unrelated audio", () => {
  const frames = Array.from({ length: 240 }, (_, index) => ({
    rms: 0.2 + (Math.sin(index * 0.17) * 0.08),
    zeroCrossingRate: 0.12 + (Math.cos(index * 0.11) * 0.03),
    derivativeRatio: 0.7 + (Math.sin(index * 0.07) * 0.1),
    crestFactor: 1.8 + (Math.cos(index * 0.13) * 0.2),
  }));
  const fingerprint = (rows) => ({ analysisFps: 50, durationSeconds: rows.length / 50, frames: rows });
  const matching = inspectSongCardReleaseAudioLineage(fingerprint(frames), fingerprint(frames.map((frame) => ({ ...frame }))));
  assert.equal(matching.ok, true);
  assert.equal(matching.matchMode, "dynamic-correlation");

  const unrelated = frames.map((_, index) => frames[(index * 37) % frames.length]);
  const rejected = inspectSongCardReleaseAudioLineage(fingerprint(frames), fingerprint(unrelated));
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.includes("release-audio-lineage-content-mismatch"));
});

test("local audio preflight reports a render-safe, actionable failure before MP4 work", () => {
  const error = createSongCardAudioInputPreflightError({
    expectedDurationSeconds: 240,
    declaredInputCount: 2,
    verifiedInputCount: 1,
    blockedInputCount: 1,
    failures: [{ id: "stem:vocals", role: "vocals", code: "audio-input-full-decode-failed", path: "/tmp/vocals.wav" }],
  });
  assert.equal(error.code, "local_audio_input_preflight_failed");
  assert.equal(error.details.stage, "audio-input-preflight");
  assert.equal(error.details.blockedInputCount, 1);
  assert.match(error.message, /saved edit is intact/iu);
});

async function fileSha256(filePath) {
  return createHash("sha256").update(await fsp.readFile(filePath)).digest("hex");
}

test("renderer checkpoint build identity changes when compiler code changes", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-renderer-build-identity-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const compilerPath = path.join(root, "scripts/compile-hyperframes-show-v2.mjs");
  await fsp.mkdir(path.dirname(compilerPath), { recursive: true });
  await fsp.writeFile(compilerPath, "export const fixture = 'first';\n");

  const first = await inspectSongCardRendererBuildIdentity({ root });
  await fsp.writeFile(compilerPath, "export const fixture = 'second';\n");
  const second = await inspectSongCardRendererBuildIdentity({ root });

  assert.equal(first.schemaVersion, "hapa.song-card.renderer-build-identity.v1");
  assert.match(first.sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.notEqual(second.sha256, first.sha256, "a live compiler code change must select a new checkpoint workspace without a manual cache refresh");
  assert.notEqual(
    second.codeFiles.find((row) => row.relativePath === "scripts/compile-hyperframes-show-v2.mjs")?.sha256,
    first.codeFiles.find((row) => row.relativePath === "scripts/compile-hyperframes-show-v2.mjs")?.sha256,
  );
  assert.ok(first.tools.ffmpeg && first.tools.ffprobe && first.tools.node && first.tools.hyperframes);
});

test("proxy registry cache is content-bound even when size and mtime are unchanged", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-proxy-registry-cache-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const registryPath = path.join(root, "native-exact-proxies.json");
  const frozen = new Date("2026-01-02T03:04:05.000Z");
  await fsp.writeFile(registryPath, JSON.stringify({ proxies: [{ id: "aa" }] }));
  await fsp.utimes(registryPath, frozen, frozen);
  const firstStat = await fsp.stat(registryPath);
  const first = loadSongCardProxyRegistry({ filePath: registryPath });

  await fsp.writeFile(registryPath, JSON.stringify({ proxies: [{ id: "bb" }] }));
  await fsp.utimes(registryPath, frozen, frozen);
  const secondStat = await fsp.stat(registryPath);
  const second = loadSongCardProxyRegistry({ filePath: registryPath });

  assert.equal(secondStat.size, firstStat.size);
  assert.equal(secondStat.mtimeMs, firstStat.mtimeMs);
  assert.notEqual(second.contentSha256, first.contentSha256);
  assert.equal(second.registry.proxies[0].id, "bb", "same-size replacement content must never return the stale registry");
  assert.ok(second.signature.endsWith(second.contentSha256));
});

test("source snapshot manifest content-binds audio, visuals, atlases, and both registries", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-source-snapshot-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const paths = Object.fromEntries(["master", "stem", "visual", "atlas", "proxyRegistry", "songRegistry"].map((name) => [name, path.join(root, `${name}.bin`)]));
  await Promise.all(Object.entries(paths).map(([name, filePath]) => fsp.writeFile(filePath, `${name}-source-bytes`)));
  const hash = async (filePath) => `sha256:${await fileSha256(filePath)}`;
  const manifest = await buildSongCardSourceSnapshotManifest({
    audio: { entries: [
      { ok: true, kind: "master", role: "master", path: paths.master, contentSha256: await hash(paths.master) },
      { ok: true, kind: "stem", role: "vocals", path: paths.stem, contentSha256: await hash(paths.stem) },
    ] },
    visualMedia: { entries: [{ ok: true, kind: "video", path: paths.visual }] },
    proxyAtlases: { entries: [{ ok: true, kind: "proxy", path: paths.atlas }] },
    proxyRegistry: { filePath: paths.proxyRegistry, contentSha256: await hash(paths.proxyRegistry) },
    songRegistry: { filePath: paths.songRegistry, contentSha256: await hash(paths.songRegistry) },
  });
  assert.match(manifest.sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(manifest.schemaVersion, "hapa.song-card.source-snapshot-manifest.v2");
  assert.equal(manifest.entries.length, 6);
  assert.equal((await assertSongCardSourceSnapshotUnchanged(manifest, { stage: "before-pipeline" })).ok, true);

  const originalStat = await fsp.stat(paths.visual);
  const originalBytes = await fsp.readFile(paths.visual);
  const replacement = Buffer.from(originalBytes.toString("utf8").replace(/^visual/u, "VISUAL"));
  assert.equal(replacement.length, originalBytes.length);
  await fsp.writeFile(paths.visual, replacement);
  await fsp.utimes(paths.visual, originalStat.atime, originalStat.mtime);
  await assert.rejects(
    assertSongCardSourceSnapshotUnchanged(manifest, { stage: "after-pipeline" }),
    (error) => (
      error?.code === "local_source_input_changed_during_render"
      && error?.details?.stage === "after-pipeline"
      && error?.details?.inputRole === "visual-media"
      && error?.details?.expectedContentSha256 !== error?.details?.observedContentSha256
    ),
  );
});

test("source snapshot canonicalizes symlink aliases and pins execution and proxy assets to the initial target", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-source-symlink-pin-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const originalPath = path.join(root, "original.bin");
  const wrongPath = path.join(root, "wrong.bin");
  const linkPath = path.join(root, "render-input.bin");
  await fsp.writeFile(originalPath, "certified-original-bytes");
  await fsp.writeFile(wrongPath, "attacker-repointed-bytes");
  await fsp.symlink(originalPath, linkPath);
  const expectedSha256 = `sha256:${await fileSha256(originalPath)}`;
  const manifest = await buildSongCardSourceSnapshotManifest({
    proxyAtlases: { entries: [{ ok: true, kind: "proxy", path: linkPath }] },
    additionalSources: [{ inputRole: "visual-media", kind: "video", path: linkPath }],
  });
  const entry = manifest.entries[0];
  const canonicalOriginalPath = await fsp.realpath(originalPath);
  assert.equal(entry.path, canonicalOriginalPath);
  assert.ok(entry.sourcePaths.includes(path.resolve(linkPath)));
  assert.equal(entry.contentSha256, expectedSha256);

  const storedPlan = { input: { project: { timeline: [{ media_path: linkPath }] } } };
  const executionPlan = canonicalizeSongCardExecutionValue(storedPlan, manifest, { root });
  const executionRegistry = canonicalizeSongCardProxyRegistry({
    proxies: [{ id: "isf:fixture", assetSha256: expectedSha256, assetPath: "/static/isf/proxies/fixture.png" }],
  }, manifest);
  assert.equal(storedPlan.input.project.timeline[0].media_path, linkPath, "canonicalization must not mutate the saved editor plan");
  assert.equal(executionPlan.input.project.timeline[0].media_path, canonicalOriginalPath);
  assert.equal(executionRegistry.proxies[0].assetPath, canonicalOriginalPath);
  assert.equal(executionRegistry.proxies[0].repositoryPath, canonicalOriginalPath);

  await fsp.unlink(linkPath);
  await fsp.symlink(wrongPath, linkPath);
  assert.equal(await fsp.readFile(executionPlan.input.project.timeline[0].media_path, "utf8"), "certified-original-bytes");
  assert.equal((await assertSongCardSourceSnapshotUnchanged(manifest, { stage: "after-symlink-repoint" })).ok, true);
});

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
  const sourceProjectHash = contentHash(project);
  const showGraph = reidentifyEchoCompiledShowGraph({
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
      id: "track-b",
      role: "visualizer",
      cards: [],
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
    directorV2: {
      treatmentId: "treatment:automatic-local",
      source: { sourceProjectHash, inputHashes: { fixture: contentHash("fixture") } },
      provenance: { sourceProjectHash },
    },
  });
  return { project, showGraph };
}

test("the production renderer cannot be constructed without exact-plan certification while injected pipelines remain available", () => {
  const options = {
    root: os.tmpdir(),
    controller: { managedRenderRoot: os.tmpdir() },
    remintStore: {},
  };
  assert.throws(
    () => createSongCardLocalRenderBridge(options),
    (error) => error?.code === "local_render_start_certifier_required"
      && error?.details?.stage === "render-start-certification",
  );
  assert.doesNotThrow(() => createSongCardLocalRenderBridge({
    ...options,
    pipeline: async () => { throw new Error("not run"); },
  }));
});

test("render-start certification is single-flight, fails durably before claim, survives restart, and retries", { timeout: 20_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-render-start-certificate-"));
  t.after(() => removeFixture(root));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const videoPath = path.join(sourceRoot, "video.mp4");
  const audioPath = path.join(sourceRoot, "master.wav");
  await Promise.all([
    fsp.writeFile(videoPath, "fixture-video-bytes"),
    fsp.writeFile(audioPath, "fixture-audio-bytes"),
  ]);
  const editor = exactEditorFixture({ videoPath });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const planned = await controller.plan(editor.project.song_id, editor);
  const candidate = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(planned.planId));
  await store.approve(candidate.id, { approvedBy: "operator:certification-test" });

  let releaseGate;
  const gateHeld = new Promise((resolve) => { releaseGate = resolve; });
  let gateCalls = 0;
  let pipelineCalls = 0;
  const failingBridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => audioPath,
    certificationHeartbeatMs: 20,
    certifyStart: async () => {
      gateCalls += 1;
      await gateHeld;
      const error = new Error("The exact saved cut certificate is stale.");
      error.code = "local_render_start_certification_not_ready";
      error.statusCode = 409;
      error.details = { stage: "render-start-certification", reason: "execution-renderer-build-stale" };
      throw error;
    },
    pipeline: async () => { pipelineCalls += 1; },
  });
  const firstStart = failingBridge.start(candidate.id);
  const duplicateStart = failingBridge.start(candidate.id);
  for (let attempt = 0; attempt < 80 && gateCalls === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(gateCalls, 1, "concurrent clicks must share one synchronous certification attempt");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const preparing = failingBridge.status().jobs.find((row) => row.candidateId === candidate.id);
    if (/Still checking this exact saved cut/u.test(preparing?.message || "")) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const heartbeat = failingBridge.status().jobs.find((row) => row.candidateId === candidate.id);
  assert.equal(heartbeat.status, "preparing");
  assert.equal(heartbeat.stage, "render-start-certification");
  assert.match(heartbeat.message, /Still checking this exact saved cut/u);
  assert.match(heartbeat.message, /media, audio, shaders, and the current build/u);
  assert.ok(heartbeat.elapsedSeconds >= 1);
  releaseGate();
  const attempts = await Promise.allSettled([firstStart, duplicateStart]);
  assert.deepEqual(attempts.map((row) => row.status), ["rejected", "rejected"]);
  assert.equal(pipelineCalls, 0, "a stale certificate must stop before the renderer pipeline");

  const failed = (await store.view()).candidates.find((row) => row.id === candidate.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.renderFailure.code, "local_render_start_certification_not_ready");
  assert.equal(failed.renderFailure.details.reason, "execution-renderer-build-stale");
  assert.equal(failed.jobs.filter((job) => job.status === "failed").length, 1, "one shared gate attempt records one durable failure");

  const restartedStore = createSongCardRemintStore({ root: mintRoot, controller });
  const afterRestart = (await restartedStore.view()).candidates.find((row) => row.id === candidate.id);
  assert.equal(afterRestart.status, "failed");
  assert.equal(afterRestart.renderFailure.code, "local_render_start_certification_not_ready");

  const freshnessStages = [];
  const retryBridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: restartedStore,
    resolveRegistryMaster: async () => audioPath,
    certifyStart: async ({ candidate: currentCandidate, storedPlan }) => ({
      ok: true,
      candidateId: currentCandidate.id,
      planId: currentCandidate.planId,
      storedPlan,
      project: storedPlan.input.project,
      showGraph: storedPlan.input.showGraph,
      summary: { schemaVersion: "test.render-start-certificate.v1", status: "ready" },
      assertFresh: async ({ stage }) => { freshnessStages.push(stage); },
    }),
    pipeline: async () => {
      pipelineCalls += 1;
      throw new Error("intentional stop after retry entered the pipeline");
    },
  });
  assert.equal((await retryBridge.start(candidate.id)).started, true);
  const retriedFailure = await waitForCandidate(restartedStore, candidate.id, ["failed"]);
  await waitForLocalJob(retryBridge, candidate.id, ["failed"]);
  assert.equal(pipelineCalls, 1, "explicit retry must pass the fresh gate and enter the pipeline");
  assert.ok(freshnessStages.includes("before-source-preflight"));
  assert.ok(freshnessStages.includes("before-source-snapshot-persistence"));
  assert.ok(freshnessStages.includes("before-job-claim"));
  assert.notEqual(retriedFailure.renderFailure.code, "local_render_start_certification_not_ready");
});

test("mid-render certificate drift fails before checkpoint or successful job persistence", { timeout: 20_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-render-certificate-drift-"));
  t.after(() => removeFixture(root));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const videoPath = path.join(sourceRoot, "video.mp4");
  const audioPath = path.join(sourceRoot, "master.wav");
  const registryPath = path.join(sourceRoot, "shader-proxy-song-registry.json");
  await Promise.all([
    fsp.writeFile(videoPath, "fixture-video-bytes"),
    fsp.writeFile(audioPath, "fixture-audio-bytes"),
    fsp.writeFile(registryPath, "certified-registry-v1"),
  ]);
  const certifiedRegistryBytes = await fsp.readFile(registryPath, "utf8");
  const editor = exactEditorFixture({ videoPath });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const planned = await controller.plan(editor.project.song_id, editor);
  const candidate = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(planned.planId));
  await store.approve(candidate.id, { approvedBy: "operator:mid-render-drift-test" });

  const freshnessStages = [];
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => audioPath,
    certifyStart: async ({ candidate: currentCandidate, storedPlan }) => ({
      ok: true,
      candidateId: currentCandidate.id,
      planId: currentCandidate.planId,
      storedPlan,
      project: storedPlan.input.project,
      showGraph: storedPlan.input.showGraph,
      summary: {
        schemaVersion: "test.render-start-certificate.v1",
        certificateSha256: `sha256:${createHash("sha256").update(certifiedRegistryBytes).digest("hex")}`,
      },
      assertFresh: async ({ stage }) => {
        freshnessStages.push(stage);
        if (await fsp.readFile(registryPath, "utf8") === certifiedRegistryBytes) return true;
        const error = new Error("The certified shader/proxy/song registry changed during rendering.");
        error.code = "local_render_start_certification_not_ready";
        error.statusCode = 409;
        error.details = { stage, reason: "certificate-registry-drift" };
        throw error;
      },
    }),
    pipeline: async ({ outputDirectory }) => {
      await fsp.mkdir(outputDirectory, { recursive: true });
      const masterPath = path.join(outputDirectory, "must-not-persist.mp4");
      const posterPath = path.join(outputDirectory, "must-not-persist.jpg");
      await Promise.all([
        fsp.writeFile(masterPath, "untrusted-render-after-registry-drift"),
        fsp.writeFile(posterPath, "untrusted-poster-after-registry-drift"),
        fsp.writeFile(registryPath, "drifted-registry-v2"),
      ]);
      return { masterPath, posterPath };
    },
  });

  assert.equal((await bridge.start(candidate.id)).started, true);
  const failed = await waitForCandidate(store, candidate.id, ["failed"]);
  const localJob = await waitForLocalJob(bridge, candidate.id, ["failed"]);
  assert.equal(failed.renderFailure.code, "local_render_start_certification_not_ready");
  assert.equal(failed.renderFailure.details.stage, "after-pipeline");
  assert.equal(failed.renderFailure.details.reason, "certificate-registry-drift");
  assert.equal(localJob.error.code, "local_render_start_certification_not_ready");
  assert.equal(freshnessStages.at(-1), "after-pipeline");
  assert.equal(failed.renderArtifacts.some((artifact) => artifact.role === "master"), false);
  assert.notEqual(failed.status, "render-ready");

  const songWorkRoot = path.join(controller.managedRenderRoot, ".local-render-work", editor.project.song_id);
  const fingerprints = await fsp.readdir(songWorkRoot);
  assert.equal(fingerprints.length, 1);
  await assert.rejects(
    fsp.access(path.join(songWorkRoot, fingerprints[0], "local-render-checkpoint.json")),
    { code: "ENOENT" },
  );
});

test("certificate drift inside the result-write boundary cannot persist a successful local job", { timeout: 20_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-render-result-persistence-cas-"));
  t.after(() => removeFixture(root));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const videoPath = path.join(sourceRoot, "video.mp4");
  const audioPath = path.join(sourceRoot, "master.wav");
  const registryPath = path.join(sourceRoot, "certified-registry.json");
  await Promise.all([
    fsp.writeFile(videoPath, "fixture-video-bytes"),
    fsp.writeFile(audioPath, "fixture-audio-bytes"),
    fsp.writeFile(registryPath, "certified-registry-v1"),
  ]);
  const certifiedRegistryBytes = await fsp.readFile(registryPath, "utf8");
  const certificateSha256 = `sha256:${createHash("sha256").update(certifiedRegistryBytes).digest("hex")}`;
  const editor = exactEditorFixture({ videoPath });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const planned = await controller.plan(editor.project.song_id, editor);
  const candidate = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(planned.planId));
  await store.approve(candidate.id, { approvedBy: "operator:result-persistence-cas-test" });

  let driftInjected = false;
  const racingStore = {
    view: (...args) => store.view(...args),
    enqueue: (...args) => store.enqueue(...args),
    claim: (...args) => store.claim(...args),
    retry: (...args) => store.retry(...args),
    recordResult: (...args) => store.recordResult(...args),
    recordGuardedResult: async (candidateId, jobId, body, options) => {
      if (!driftInjected) {
        driftInjected = true;
        await fsp.writeFile(registryPath, "drifted-between-freshness-and-record-result");
      }
      return store.recordGuardedResult(candidateId, jobId, body, options);
    },
  };
  let pipelineCalls = 0;
  const freshnessStages = [];
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: racingStore,
    resolveRegistryMaster: async () => audioPath,
    certifyStart: async ({ candidate: currentCandidate, storedPlan }) => ({
      ok: true,
      candidateId: currentCandidate.id,
      planId: currentCandidate.planId,
      storedPlan,
      project: storedPlan.input.project,
      showGraph: storedPlan.input.showGraph,
      summary: { schemaVersion: "test.render-start-certificate.v1", certificateSha256 },
      assertFresh: async ({ stage }) => {
        freshnessStages.push(stage);
        if (await fsp.readFile(registryPath, "utf8") === certifiedRegistryBytes) return true;
        const error = new Error("The exact start certificate changed at result persistence.");
        error.code = "local_render_start_certification_not_ready";
        error.statusCode = 409;
        error.details = { stage, reason: "certificate-drift-at-result-persistence" };
        throw error;
      },
    }),
    pipeline: async () => { pipelineCalls += 1; },
  });

  assert.equal((await bridge.start(candidate.id)).started, true);
  const failed = await waitForCandidate(store, candidate.id, ["failed"]);
  const localJob = await waitForLocalJob(bridge, candidate.id, ["failed"]);
  assert.equal(driftInjected, true);
  assert.equal(pipelineCalls, 0, "the stale first-stage success must stop before expensive pipeline work");
  assert.ok(freshnessStages.includes("commit-decision-envelope-result"));
  assert.equal(failed.renderFailure.code, "local_render_start_certification_not_ready");
  assert.equal(failed.renderFailure.details.reason, "certificate-drift-at-result-persistence");
  assert.equal(localJob.error.code, "local_render_start_certification_not_ready");
  assert.equal(failed.jobs.find((job) => job.stage === "decision-envelope")?.status, "failed");
  assert.equal(failed.jobs.some((job) => job.status === "done"), false, "no successful job result survives the failed guarded commit");
  const persisted = JSON.parse(await fsp.readFile(path.join(mintRoot, "remint-queue.json"), "utf8"));
  const persistedCandidate = persisted.candidates.find((row) => row.id === candidate.id);
  assert.equal(persistedCandidate.status, "failed");
  assert.equal(persisted.events.some((event) => event.type === "remint-job-completed"), false);
});

test("canceling during held render-start certification prevents runtime launch without overwriting cancellation", { timeout: 20_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-render-start-cancel-cas-"));
  t.after(() => removeFixture(root));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const videoPath = path.join(sourceRoot, "video.mp4");
  const audioPath = path.join(sourceRoot, "master.wav");
  await Promise.all([fsp.writeFile(videoPath, "video"), fsp.writeFile(audioPath, "audio")]);
  const editor = exactEditorFixture({ videoPath });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const plan = await controller.plan(editor.project.song_id, editor);
  const candidate = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(plan.planId));
  await store.approve(candidate.id, { approvedBy: "operator:cancel-cas-test" });

  let gateEntered = false;
  let releaseGate;
  const heldGate = new Promise((resolve) => { releaseGate = resolve; });
  let pipelineCalls = 0;
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => audioPath,
    certifyStart: async ({ candidate: currentCandidate, storedPlan }) => {
      gateEntered = true;
      await heldGate;
      return {
        ok: true,
        candidateId: currentCandidate.id,
        planId: currentCandidate.planId,
        storedPlan,
        project: storedPlan.input.project,
        showGraph: storedPlan.input.showGraph,
      };
    },
    pipeline: async () => { pipelineCalls += 1; },
  });
  const starting = bridge.start(candidate.id);
  for (let attempt = 0; attempt < 80 && !gateEntered; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(gateEntered, true);
  await store.cancel(candidate.id, { canceledBy: "operator:cancel-cas-test" });
  releaseGate();
  await assert.rejects(starting, (error) => error?.code === "local_render_candidate_changed_during_certification");
  const canceled = (await store.view()).candidates.find((row) => row.id === candidate.id);
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.renderFailure, null);
  assert.equal(pipelineCalls, 0);
  assert.equal(bridge.status().activeRenderCount, 0);
});

test("completed and release-stage candidates are idempotent at render start and never recertify", async () => {
  for (const status of ["render-ready", "ready-for-mint-review", "minting", "minted"]) {
    let certificationCalls = 0;
    const candidate = {
      id: `candidate:${status}`,
      planId: `plan:${status}`,
      status,
      renderWorkAuthorized: false,
      approvedBy: null,
      jobs: [],
    };
    const bridge = createSongCardLocalRenderBridge({
      root: os.tmpdir(),
      controller: { managedRenderRoot: os.tmpdir(), getPlan: async () => { throw new Error("must not load"); } },
      remintStore: { view: async () => ({ candidates: [candidate] }) },
      certifyStart: async () => { certificationCalls += 1; },
      pipeline: async () => { throw new Error("must not render"); },
    });
    const result = await bridge.start(candidate.id);
    assert.equal(result.started, false, status);
    assert.equal(result.completed, true, status);
    assert.equal(result.job.status, status);
    assert.equal(certificationCalls, 0, status);
  }
});

test("render bridge gives custom pipelines canonical source clones even if symlinks are repointed during work", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-symlink-bridge-"));
  t.after(() => removeFixture(root));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  const exportRoot = path.join(root, "exports");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const originalMasterPath = path.join(sourceRoot, "master-original.wav");
  const wrongMasterPath = path.join(sourceRoot, "master-wrong.wav");
  const masterLinkPath = path.join(sourceRoot, "master.wav");
  const originalVideoPath = path.join(sourceRoot, "video-original.mp4");
  const wrongVideoPath = path.join(sourceRoot, "video-wrong.mp4");
  const videoLinkPath = path.join(sourceRoot, "video.mp4");
  await Promise.all([
    fsp.writeFile(originalMasterPath, "certified-master-bytes"),
    fsp.writeFile(wrongMasterPath, "wrong-master-bytes"),
    fsp.writeFile(originalVideoPath, "certified-video-bytes"),
    fsp.writeFile(wrongVideoPath, "wrong-video-bytes"),
  ]);
  await Promise.all([
    fsp.symlink(originalMasterPath, masterLinkPath),
    fsp.symlink(originalVideoPath, videoLinkPath),
  ]);
  const editor = exactEditorFixture({ videoPath: videoLinkPath });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, exportRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const plan = await controller.plan(editor.project.song_id, editor);
  const storedPlan = await controller.getPlan(plan.planId);
  const proposed = await store.proposeFromPlan(editor.project.song_id, storedPlan);
  await store.approve(proposed.id, { approvedBy: "operator:symlink-pin-test" });
  await store.enqueue();

  let observed = null;
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => ({ masterPath: masterLinkPath }),
    pipeline: async ({ project, showGraph, storedPlan: executionPlan, masterPath }) => {
      const canonicalMasterPath = await fsp.realpath(originalMasterPath);
      const canonicalVideoPath = await fsp.realpath(originalVideoPath);
      const graphValidation = validateEchoCompiledShowGraph({ project: editor.project, graph: showGraph });
      assert.equal(graphValidation.ok, true, graphValidation.reasons.join(", "));
      assert.equal(masterPath, canonicalMasterPath);
      assert.equal(project.timeline[0].media_path, canonicalVideoPath);
      assert.equal(showGraph.tracks[0].cards[0].media.localPath, canonicalVideoPath);
      assert.equal(executionPlan.input.project.timeline[0].media_path, canonicalVideoPath);
      assert.deepEqual(executionPlan.input.showGraph, showGraph, "checkpoint and compiler must receive the same reidentified canonical graph");
      assert.notEqual(showGraph.directorV2.variantHash, storedPlan.input.showGraph.directorV2.variantHash, "canonical path rewriting must produce a fresh variant identity");
      await Promise.all([fsp.unlink(masterLinkPath), fsp.unlink(videoLinkPath)]);
      await Promise.all([
        fsp.symlink(wrongMasterPath, masterLinkPath),
        fsp.symlink(wrongVideoPath, videoLinkPath),
      ]);
      try {
        observed = {
          master: await fsp.readFile(masterPath, "utf8"),
          video: await fsp.readFile(project.timeline[0].media_path, "utf8"),
        };
      } finally {
        await Promise.all([fsp.unlink(masterLinkPath), fsp.unlink(videoLinkPath)]);
        await Promise.all([
          fsp.symlink(originalMasterPath, masterLinkPath),
          fsp.symlink(originalVideoPath, videoLinkPath),
        ]);
      }
      throw new Error("intentional stop after canonical source proof");
    },
  });
  assert.equal((await bridge.start(proposed.id)).started, true);
  const failed = await waitForCandidate(store, proposed.id, ["failed"]);
  await waitForLocalJob(bridge, proposed.id, ["failed"]);
  assert.equal(failed.status, "failed");
  assert.deepEqual(observed, {
    master: "certified-master-bytes",
    video: "certified-video-bytes",
  });
  const savedAfter = await controller.getPlan(plan.planId);
  assert.equal(savedAfter.input.project.timeline[0].media_path, videoLinkPath, "the stored editor plan must retain its original alias");
});

async function makeTinyRealFixture(root, { size = "1920x1080" } = {}) {
  const videoPath = path.join(root, "fixture-video.mp4");
  const audioPath = path.join(root, "fixture-audio.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=30:duration=0.75`,
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoPath,
  ]);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.75",
    "-c:a", "pcm_s16le", audioPath,
  ]);
  return { videoPath, audioPath };
}

test("final release QA accepts a canonical 1080x1920 vertical master", { skip: !HAS_FFMPEG, timeout: 30_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-vertical-release-qa-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const media = await makeTinyRealFixture(root, { size: "1080x1920" });
  const masterPath = path.join(root, "vertical-release.mp4");
  const posterPath = path.join(root, "vertical-poster.jpg");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", media.videoPath, "-i", media.audioPath, "-t", "0.75",
    "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", masterPath,
  ]);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", masterPath, "-frames:v", "1", posterPath]);

  const qa = await probeSongCardRelease(masterPath, posterPath, 0.75, {
    sourceMasterPath: media.audioPath,
    outputProfile: "vertical",
  });
  assert.equal(qa.ok, true);
  assert.equal(qa.outputProfile.id, "vertical");
  assert.deepEqual({ width: qa.video.width, height: qa.video.height }, { width: 1080, height: 1920 });
  assert.ok(qa.checks.includes("output-profile-dimensions-fps-frame-budget"));
});

test("release QA rejects a 440 Hz authoritative master overwritten by 880 Hz after certification", { skip: !HAS_FFMPEG, timeout: 15_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-source-master-toctou-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const media = await makeTinyRealFixture(root);
  const sourceMasterPath = media.audioPath;
  const replacementPath = path.join(root, "replacement.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=0.75",
    "-c:a", "pcm_s16le", replacementPath,
  ]);
  const masterPath = path.join(root, "release.mp4");
  const posterPath = path.join(root, "release.jpg");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", media.videoPath, "-i", sourceMasterPath, "-t", "0.75", "-shortest",
    "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", masterPath,
  ]);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", masterPath, "-frames:v", "1", posterPath]);
  const expectedContentSha256 = `sha256:${await fileSha256(sourceMasterPath)}`;
  const observedContentSha256 = `sha256:${await fileSha256(replacementPath)}`;

  await assert.rejects(
    probeSongCardRelease(masterPath, posterPath, 0.75, {
      sourceMasterPath,
      sourceMasterSha256: expectedContentSha256,
      afterSourceMasterPredecodeProof: async () => fsp.copyFile(replacementPath, sourceMasterPath),
    }),
    (error) => (
      error?.code === "local_source_input_changed_during_render"
      && error?.details?.stage === "release-qa"
      && error?.details?.inputRole === "master"
      && error?.details?.expectedContentSha256 === expectedContentSha256
      && error?.details?.observedContentSha256 === observedContentSha256
    ),
  );
});

test("final release QA rejects same-duration wrong audio and a dimension-readable truncated poster", { skip: !HAS_FFMPEG, timeout: 30_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-release-lineage-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const media = await makeTinyRealFixture(root);
  const wrongAudioPath = path.join(root, "wrong-audio.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=0.75",
    "-c:a", "pcm_s16le", wrongAudioPath,
  ]);
  const render = async (audioPath, name) => {
    const masterPath = path.join(root, `${name}.mp4`);
    const posterPath = path.join(root, `${name}.jpg`);
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", media.videoPath, "-i", audioPath, "-t", "0.75", "-shortest",
      "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", masterPath,
    ]);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", masterPath, "-frames:v", "1", posterPath]);
    return { masterPath, posterPath };
  };

  const wrong = await render(wrongAudioPath, "wrong-song");
  await assert.rejects(
    probeSongCardRelease(wrong.masterPath, wrong.posterPath, 0.75, { sourceMasterPath: media.audioPath }),
    (error) => error?.code === "local_release_audio_lineage_failed",
  );

  const correct = await render(media.audioPath, "correct-song");
  const posterBytes = await fsp.readFile(correct.posterPath);
  assert.ok(posterBytes.length > 1_400);
  let reproducedDimensionOnlyFalsePass = false;
  for (let bytes = 1_200; bytes < posterBytes.length - 64; bytes += 400) {
    await fsp.writeFile(correct.posterPath, posterBytes.subarray(0, bytes));
    const dimensionProbe = spawnSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", correct.posterPath,
    ], { encoding: "utf8" });
    let dimensions = null;
    try { dimensions = JSON.parse(dimensionProbe.stdout || "{}").streams?.[0]; } catch { dimensions = null; }
    const strictDecode = spawnSync("ffmpeg", [
      "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode",
      "-i", correct.posterPath, "-frames:v", "1", "-f", "null", "-",
    ], { encoding: "utf8" });
    if (dimensionProbe.status === 0 && Number(dimensions?.width) > 0 && Number(dimensions?.height) > 0 && strictDecode.status !== 0) {
      reproducedDimensionOnlyFalsePass = true;
      break;
    }
  }
  assert.equal(reproducedDimensionOnlyFalsePass, true, "the truncated JPEG fixture must expose dimensions while failing strict decode");
  await assert.rejects(
    probeSongCardRelease(correct.masterPath, correct.posterPath, 0.75, { sourceMasterPath: media.audioPath }),
    (error) => error?.code === "local_release_poster_decode_failed",
  );
});

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

test("pixel QA reuses runtime stem semantics and reports the exact pre-encode gate", () => {
  const report = {
    schemaVersion: "hapa.hyperframes.pixel-capture.v2",
    offline: { networkAttemptCount: 0 },
    consoleSummary: { errorCount: 0 },
    acceptance: { timelineReady: true },
    frames: [{
      timestamp: 12,
      pngSha256: "sha256:frame",
      canvasPngSha256: "sha256:canvas",
      metrics: { nonBlank: true, nonFlat: true },
      canvasMetrics: { nonBlank: true, nonFlat: true },
      expected: { layers: [{ cueId: "card:b:9", visualizerId: "isf:blue", stemFocus: "leadVocals" }] },
      renderState: {
        layers: [{ cueId: "card:b:9", visualizerId: "isf:blue", stemFocus: "vocals", effectiveOpacity: 0.23 }],
        drawnLayerCount: 1,
        canvasSampleHash: "sha256:canvas-sample",
      },
    }],
  };
  const accepted = reevaluateSongCardPixelReport(report);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.acceptanceDiagnostics.semanticAliasMatches[0].canonicalStemRole, "vocals");

  const rejected = structuredClone(report);
  rejected.frames[0].renderState.layers[0].effectiveOpacity = 0;
  const error = createSongCardPixelQaError(rejected, { reportPath: "/managed/qa/pixel-capture-report.json" });
  assert.equal(error.code, "local_renderer_truth_failed");
  assert.equal(error.details.stage, "pixel-qa");
  assert.deepEqual(error.details.failedChecks, ["positiveEffectiveOpacity"]);
  assert.equal(error.details.nonPositiveOpacityFrames.length, 1);
  assert.match(error.message, /before MP4 encoding/);
  assert.match(error.message, /no edition was minted/);
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

test("deterministic render readiness reports exact blockers before stem analysis", () => {
  const error = createSongCardRenderReadinessError({
    fingerprint: `sha256:${"a".repeat(64)}`,
    counts: { visualizerCueCount: 3, exactVisualizerCueCount: 2 },
    blockers: [{
      code: "exact-proxy-asset-hash-mismatch",
      stage: "proxy-assets",
      cueId: "card:b:2",
      message: "Proxy bytes changed.",
    }],
  });
  assert.equal(error.code, "local_render_readiness_failed");
  assert.equal(error.details.stage, "render-readiness");
  assert.equal(error.details.blockerCount, 1);
  assert.equal(error.details.blockers[0].cueId, "card:b:2");
  assert.match(error.message, /before stem analysis/);
  assert.match(error.message, /no MP4 work started/);
});

test("the local pipeline runs deterministic readiness before analysis and skips shader capture when no cues exist", async () => {
  const source = await fsp.readFile(path.join(process.cwd(), "server/song-card-local-renderer.mjs"), "utf8");
  const readinessIndex = source.indexOf("preflightSongCardRenderReadiness({");
  const analysisIndex = source.indexOf("scripts/build-stem-telemetry-bundle.py", readinessIndex);
  const telemetryGateIndex = source.indexOf('report("stem-telemetry-preflight"', analysisIndex);
  const compileIndex = source.indexOf('report("compile"', telemetryGateIndex);
  assert.ok(readinessIndex > 0 && readinessIndex < analysisIndex);
  assert.ok(telemetryGateIndex > analysisIndex && compileIndex > telemetryGateIndex, "real analyzed telemetry must pass before compilation and rendering");
  assert.match(source, /requestedVisualizerCueCount === 0/);
  assert.match(source, /selected-cut-has-no-visualizer-cues/);
});

test("signal graph preflight catches lossy variant projection before stem analysis or rendering", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-signal-preflight-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const synthPath = path.join(root, "synth.wav");
  await fsp.writeFile(synthPath, "verified-stem");
  const portable = {
    schemaVersion: "hapa.visualizer-card.v2",
    id: "isf:exact",
    source: { hash: `sha256:${"a".repeat(64)}` },
  };
  const rich = preflightSongCardSignalGraph({
    project: { stems_available: ["archive-zip", "Synth"] },
    showGraph: {
      stems: { nativeStatus: "partial-local-paths", items: [{ id: "archive", stemType: "archive-zip", audioPath: "" }, { id: "synth", stemType: "Synth", audioPath: synthPath }] },
      tracks: [{ id: "track-b", role: "visualizer", cards: [{ id: "card:b:0", visualization: { sourceId: "isf:exact", card: portable } }] }],
    },
  });
  assert.equal(rich.ok, true);
  assert.equal(rich.verifiedStemCount, 1);

  const lossy = preflightSongCardSignalGraph({
    project: { stems_available: ["Synth", "Drums", "Vocals"] },
    showGraph: {
      stems: { items: [{ id: "stem:0", stemType: "Synth", title: "Synth" }, { id: "stem:1", stemType: "Drums", title: "Drums" }] },
      tracks: [{ id: "ivf-stack", role: "visualizer", cards: [{ id: "legacy:ivf:0", visualization: { sourceId: "isf:exact" } }] }],
    },
  });
  assert.equal(lossy.ok, false);
  assert.deepEqual(lossy.errors, ["isolated-stem-paths-detached", "portable-visualizer-truth-detached"]);
  assert.equal(lossy.detachedVisualizers[0].cardId, "legacy:ivf:0");
});

test("signal graph preflight rejects partially detached visualizer stems and resolves vocal aliases", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-stem-coverage-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const drumsPath = path.join(root, "drums.wav");
  const vocalsPath = path.join(root, "vocals.wav");
  await Promise.all([
    fsp.writeFile(drumsPath, "verified-drums"),
    fsp.writeFile(vocalsPath, "verified-vocals"),
  ]);
  const portable = (id, stemFocus = "master") => ({
    schemaVersion: "hapa.visualizer-card.v2",
    id,
    stemFocus,
    source: { hash: `sha256:${"b".repeat(64)}` },
  });
  const baseGraph = {
    stems: {
      nativeStatus: "partial-local-paths",
      items: [
        { id: "stem:drums", stemType: "Drums", audioPath: drumsPath },
        { id: "stem:vocals", stemType: "Vocals", audioPath: vocalsPath },
        { id: "stem:bass", stemType: "Bass", audioPath: path.join(root, "missing-bass.wav") },
      ],
    },
    tracks: [{
      id: "track-b",
      role: "visualizer",
      cards: [
        { id: "card:vocals", visualization: { sourceId: "isf:vocals", card: portable("isf:vocals", "leadVocals") } },
        {
          id: "card:mixed",
          visualization: { sourceId: "isf:mixed", card: portable("isf:mixed") },
          parameters: { visualizerMappings: { gain: "drums:rms", warp: { stemFocus: "Bass", signal: "peak" } } },
        },
      ],
    }],
  };

  const partial = preflightSongCardSignalGraph({
    project: { stems_available: ["Drums", "Vocals", "Bass"] },
    showGraph: baseGraph,
  });
  assert.equal(partial.verifiedStemCount, 2, "one valid stem must not hide a different requested missing stem");
  assert.deepEqual(partial.verifiedStemRoles.sort(), ["drums", "vocals"]);
  assert.deepEqual(partial.unverifiedExpectedStemRoles, ["bass"]);
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.errors, ["visualizer-stem-paths-detached"]);
  assert.deepEqual(partial.unresolvedStemBindings, [{
    cardId: "card:mixed",
    sourceId: "isf:mixed",
    requestedStemRole: "bass",
    requestedStemFocus: "Bass",
    bindingSource: "parameters.visualizerMappings.warp",
    reason: "visualizer-requested-stem-path-unverified",
  }]);

  const repaired = structuredClone(baseGraph);
  repaired.stems.items[2].audioPath = path.join(root, "bass.wav");
  await fsp.writeFile(repaired.stems.items[2].audioPath, "verified-bass");
  const complete = preflightSongCardSignalGraph({
    project: { stems_available: ["Drums", "leadVocals", "Bass"] },
    showGraph: repaired,
  });
  assert.equal(complete.ok, true);
  assert.deepEqual(complete.unresolvedStemBindings, []);
  assert.ok(complete.verifiedStemRoles.includes("vocals"), "leadVocals requests must resolve to the Vocals registry role");
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
  if (rendered.status === "failed") await waitForLocalJob(bridge, proposed.id, ["failed"]);
  assert.equal(rendered.status, "render-ready", JSON.stringify({
    candidateFailure: rendered.failure || rendered.lastError || null,
    localJob: bridge.status().jobs.find((row) => row.candidateId === proposed.id) || null,
  }));
  const completedJob = bridge.status().jobs.find((row) => row.candidateId === proposed.id);
  assert.equal(completedJob.status, "render-ready");
  assert.equal(completedJob.percent, 100);
  assert.equal(rendered.releaseReceipt.outputProfile.id, "landscape");
  assert.match(rendered.releaseReceipt.outputProfileCacheKey, /:landscape:1920x1080:/u);
  const expectedExecutionEditor = structuredClone(editor);
  const canonicalVideoPath = await fsp.realpath(media.videoPath);
  expectedExecutionEditor.project.timeline[0].media_path = canonicalVideoPath;
  expectedExecutionEditor.showGraph.tracks[0].cards[0].media.localPath = canonicalVideoPath;
  expectedExecutionEditor.showGraph = reidentifyEchoCompiledShowGraph(expectedExecutionEditor.showGraph);
  assert.deepEqual(receivedEditor, expectedExecutionEditor, "the renderer must receive a canonical execution clone of the selected project and Show Graph");
  const persistedEditor = (await controller.getPlan(initialPlan.planId)).input;
  assert.deepEqual({ project: persistedEditor.project, showGraph: persistedEditor.showGraph }, editor, "canonical execution paths must never rewrite the stored editor revision");
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

test("bridge rejects a master source mutation after pipeline work and before checkpoint persistence", { timeout: 20_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-source-race-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const mintRoot = path.join(root, "mint");
  await fsp.mkdir(sourceRoot, { recursive: true });
  const audioPath = path.join(sourceRoot, "master.dat");
  await fsp.writeFile(audioPath, "certified-source-master");
  const editor = exactEditorFixture({ videoPath: path.join(sourceRoot, "video.mp4") });
  const ledger = new SongCardMintLedger({ root: mintRoot, allowedSourceRoots: [sourceRoot, mintRoot] });
  const controller = new SongCardMintController({ root: mintRoot, ledger });
  const store = createSongCardRemintStore({ root: mintRoot, controller });
  const initialPlan = await controller.plan(editor.project.song_id, editor);
  const proposed = await store.proposeFromPlan(editor.project.song_id, await controller.getPlan(initialPlan.planId));
  await store.approve(proposed.id, { approvedBy: "operator:source-race-test" });
  await store.enqueue();
  const bridge = createSongCardLocalRenderBridge({
    root: mintRoot,
    controller,
    remintStore: store,
    resolveRegistryMaster: async () => audioPath,
    pipeline: async ({ outputDirectory }) => {
      await fsp.writeFile(audioPath, "mutated-source-master!");
      return {
        masterPath: path.join(outputDirectory, "must-not-checkpoint.mp4"),
        posterPath: path.join(outputDirectory, "must-not-checkpoint.jpg"),
      };
    },
  });

  await bridge.start(proposed.id);
  const failed = await waitForCandidate(store, proposed.id, ["failed"]);
  const liveJob = await waitForLocalJob(bridge, proposed.id, ["failed"]);
  assert.equal(failed.renderFailure.code, "local_source_input_changed_during_render");
  assert.equal(failed.renderFailure.details.stage, "after-pipeline");
  assert.equal(failed.renderFailure.details.inputRole, "master");
  assert.notEqual(failed.renderFailure.details.expectedContentSha256, failed.renderFailure.details.observedContentSha256);
  assert.equal(liveJob.error.code, "local_source_input_changed_during_render");
  const workRoots = await fsp.readdir(path.join(controller.managedRenderRoot, ".local-render-work", editor.project.song_id));
  const checkpointPath = path.join(controller.managedRenderRoot, ".local-render-work", editor.project.song_id, workRoots[0], "local-render-checkpoint.json");
  await assert.rejects(fsp.access(checkpointPath), { code: "ENOENT" });
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
  assert.equal(liveJob.stage, "compile", "the UI keeps the exact failed gate instead of replacing it with a generic failed stage");
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
    recordResult: (...args) => store.recordResult(...args),
    recordGuardedResult: async (candidateId, jobId, body, options) => {
      const view = await store.recordGuardedResult(candidateId, jobId, body, options);
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
  const checkpointSongRoot = path.join(controller.managedRenderRoot, ".local-render-work", editor.project.song_id);
  const checkpointFingerprints = await fsp.readdir(checkpointSongRoot);
  assert.equal(checkpointFingerprints.length, 1);
  const checkpoint = JSON.parse(await fsp.readFile(path.join(checkpointSongRoot, checkpointFingerprints[0], "local-render-checkpoint.json"), "utf8"));
  assert.equal(checkpoint.schemaVersion, "hapa.song-card.local-render-checkpoint.v5");
  assert.equal(checkpoint.identity.renderGateVersion, "hapa.song-card.render-gate.canonical-source-snapshot.v6");
  assert.equal(checkpoint.identity.rendererBuildSchema, "hapa.song-card.renderer-build-identity.v1");
  assert.match(checkpoint.identity.rendererBuildSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(checkpoint.identity.pipelineSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(checkpoint.outputProfile.id, "landscape");
  assert.equal(checkpoint.identity.outputProfile.id, "landscape");
  assert.match(checkpoint.identity.outputProfileCacheKey, /:landscape:1920x1080:/u);
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
  if (resumed.status === "failed") await waitForLocalJob(restartedBridge, proposed.id, ["failed"]);
  assert.equal(resumed.status, "render-ready", JSON.stringify({
    candidateFailure: resumed.failure || resumed.lastError || null,
    localJob: restartedBridge.status().jobs.find((row) => row.candidateId === proposed.id) || null,
  }));
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
