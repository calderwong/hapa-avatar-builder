import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { analyzeElectronKioskPass, deriveBlackIntervals } = require("../scripts/song-card-electron-kiosk-analyzer.cjs");

function healthyRaw() {
  const frameCallbacks = Array.from({ length: 31 }, (_, index) => ({ wallMs: index * 33.333, mediaTimeMs: index * 33.333, presentedFrames: index + 1 }));
  const progressSamples = Array.from({ length: 11 }, (_, index) => ({ wallMs: index * 100, mediaTimeMs: index * 100, active: true, paused: false, ended: false }));
  const blackSamples = progressSamples.map((row) => ({ ...row, isBlack: false, blackPixelRatio: 0.02, meanLuma: 88 }));
  return {
    edition: 1,
    selectedEdition: 1,
    panelPresent: true,
    elementKind: "HTMLVideoElement",
    windowVisible: true,
    documentVisibility: "visible",
    requestVideoFrameCallbackSupported: true,
    frameCallbacks,
    progressSamples,
    blackSamples,
    events: [{ type: "playing", wallMs: 0, mediaTimeMs: 0, readyState: 4, networkState: 1 }, { type: "ended", wallMs: 1000, mediaTimeMs: 1000, readyState: 4, networkState: 1 }],
    playbackQualityBefore: { totalVideoFrames: 0, droppedVideoFrames: 0, corruptedVideoFrames: 0 },
    playbackQualityAfter: { totalVideoFrames: 31, droppedVideoFrames: 0, corruptedVideoFrames: 0 },
    prebuffer: { fullyBuffered: true, bufferingMethod: "authenticated-full-artifact-fetch-to-memory-blob-before-playback", artifactBytes: 1024, declaredArtifactBytes: 1024, artifactSha256: "a".repeat(64) },
    playStartedWallMs: 0,
    finishedWallMs: 1000,
    finalMediaTimeMs: 1000,
    ended: true,
  };
}

test("visible Electron HTMLVideoElement telemetry passes when frame presentation, progress, quality, and pixels are healthy", () => {
  const result = analyzeElectronKioskPass(healthyRaw(), { expectedDurationMs: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.method, "visible-electron-browserwindow-htmlvideoelement-requestvideoframecallback");
  assert.equal(result.frameCallbackCount, 31);
  assert.equal(result.playbackQuality.droppedFrames, 0);
  assert.equal(result.checks.blackFrameSamplingObserved, true);
  assert.equal(result.checks.fullImmutableArtifactBuffered, true);
});

test("the analyzer fails closed on a hidden window, presentation gap, progress stall, dropped frame, or undeclared black interval", () => {
  const raw = healthyRaw();
  raw.documentVisibility = "hidden";
  raw.frameCallbacks = [
    { wallMs: 0, mediaTimeMs: 0 },
    { wallMs: 33, mediaTimeMs: 33 },
    { wallMs: 66, mediaTimeMs: 66 },
    { wallMs: 900, mediaTimeMs: 900 },
  ];
  raw.progressSamples = Array.from({ length: 11 }, (_, index) => ({ wallMs: index * 100, mediaTimeMs: index < 10 ? 100 : 200, active: true, paused: false, ended: false }));
  raw.blackSamples = Array.from({ length: 6 }, (_, index) => ({ wallMs: index * 100, mediaTimeMs: index * 100, isBlack: index <= 4, blackPixelRatio: index <= 4 ? 1 : 0, meanLuma: index <= 4 ? 0 : 80 }));
  raw.playbackQualityAfter.droppedVideoFrames = 1;
  const result = analyzeElectronKioskPass(raw, { expectedDurationMs: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.checks.browserWindowVisible, false);
  assert.equal(result.presentationGaps.length, 1);
  assert.equal(result.progressStalls.length, 1);
  assert.equal(result.playbackQuality.droppedFrames, 1);
  assert.equal(result.unintendedBlackIntervals.length, 1);
});

test("declared black is preserved in telemetry without becoming an unintended-black failure", () => {
  const samples = [0, 100, 200, 300, 400].map((value, index) => ({ wallMs: value, mediaTimeMs: value, isBlack: index < 4, blackPixelRatio: index < 4 ? 0.99 : 0.1 }));
  const intervals = deriveBlackIntervals(samples, 200);
  assert.equal(intervals.length, 1);
  const raw = { ...healthyRaw(), blackSamples: samples };
  const result = analyzeElectronKioskPass(raw, { expectedDurationMs: 1000, expectedBlackIntervals: [{ startMs: 0, endMs: 400 }] });
  assert.equal(result.unintendedBlackIntervals.length, 0);
  assert.equal(result.checks.noUnintendedBlackIntervals, true);
});
