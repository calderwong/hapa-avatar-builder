import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Tarot passes only the identity-matched current center video or image canvas to ISF", () => {
  const mediaPath = between("function currentTarotExactIsfMedia", "function ensureTarotExactIsfPlaybackPool");
  assert.match(mediaPath, /expectedKey = dropZoneVideoSourceKey\(source\)/);
  assert.match(mediaPath, /actualKey = dropZoneVideoSourceKey\(screen\?\.source \|\| \{\}\)/);
  assert.match(mediaPath, /expectedKey === actualKey/);
  assert.match(mediaPath, /current-center-media-mismatch/);
  assert.match(mediaPath, /element: ready \? video : null/);
  assert.match(mediaPath, /element: ready \? overlay\.exactIsfMediaCanvas : null/);
  assert.match(mediaPath, /verified-current-center-video/);
  assert.match(mediaPath, /verified-current-center-image/);
  assert.match(source, /mediaIdentity: integration\.mediaIdentity \|\| undefined/);
  assert.match(source, /mediaReceipt: mediaInput\.receipt/);
});

test("Tarot owns at most one silent exact requested-stem decoder and never fuzzy-picks a bus", () => {
  const resolver = between("function resolveVerifiedEchoStemBus", "function tarotEchoStemAudioUri");
  assert.match(resolver, /graph\?\.stems\?\.nativeStatus !== "verified-local-registry-paths"/);
  assert.match(resolver, /leadvocals: "vocals"/);
  assert.match(resolver, /keys\.includes\(matchKey\)/);
  assert.match(resolver, /bus\.truthStatus !== "verified_registry_path"/);
  assert.match(resolver, /requested-stem-bus-not-found/);
  assert.match(resolver, /requested-stem-path-not-verified/);

  const decoder = between("function createTarotEchoStemSignalDecoder", "function echoDirectorShotLooksVertical");
  assert.equal((decoder.match(/document\.createElement\("audio"\)/g) || []).length, 1, "decoder owns no more than one audio element");
  assert.match(decoder, /silentGain\.gain\.value = 0/);
  assert.match(decoder, /decoderCount: element \? 1 : 0/);
  assert.match(decoder, /explicit-master-fallback/);
  assert.match(decoder, /stem-decoder-playback-blocked/);
  assert.match(source, /echoIsfStemSignalDecoder\.dispose\(\)/);
});

test("Tarot sends bounded master and verified requested-stem signal frames with exact signal names", () => {
  const masterFrame = between("function masterSignalFrameFromDropZone", "function normalizedEchoStemKey");
  for (const signal of ["rms", "beat", "bass", "mid", "treble", "orbit", "palette"]) {
    assert.match(masterFrame, new RegExp(`\\b${signal}:`), `master frame missing ${signal}`);
  }
  assert.match(source, /slice\(0, ECHO_ISF_STEM_FREQUENCY_BINS\)/);
  assert.match(source, /const signalFrames = \{ master: masterFrame \}/);
  assert.match(source, /signalFrames\[stemSelection\.requestedStem\] = stemSample\.frame/);
  assert.match(source, /signalFrames: integration\.signalFrames/);
  assert.match(source, /truthStatus: "verified-stem-analyser"/);
  assert.match(source, /truthStatus: "explicit-master-fallback"/);
});

test("Tarot applies runtime composition and surfaces bounded pixel-parity receipts", () => {
  const drawPath = between("function drawTarotExactIsfOverlay", "function resizeEchoDirectorOverlayForScreen");
  assert.match(drawPath, /transitionAlpha: echoDirectorTransitionOpacityForSource\(source\)/);
  assert.match(drawPath, /composition\.effectiveAlpha/);
  assert.match(drawPath, /composition\.canvasComposite/);
  assert.match(drawPath, /ctx\.drawImage\(presentedCanvas/);
  assert.match(drawPath, /frameReceipt: result\?\.frameReceipt/);
  assert.match(drawPath, /exactIsfFrameReceipts\.length > ECHO_ISF_DIAGNOSTIC_RECEIPT_LIMIT/);
  assert.match(source, /latestFrameReceipt: latestReceipt\?\.frameReceipt/);
  assert.match(source, /latestMediaTruth: latestReceipt\?\.media/);
  assert.match(source, /latestStemTruth: latestReceipt\?\.stem/);
  assert.match(source, /latestComposition: latestReceipt\?\.composition/);
  assert.match(source, /frameReceiptLimit: ECHO_ISF_DIAGNOSTIC_RECEIPT_LIMIT/);
});

test("Tarot preserves quantized 12/4 fps exact rendering and renders lyrics after ISF", () => {
  const updatePath = between("function updateEchoDirectorPreviewOverlay", "function drawEchoDirectorShaderOverlay");
  assert.match(updatePath, /Math\.max\(1, Math\.min\(12, Number\(maxFps\) \|\| 12\)\)/);
  assert.match(updatePath, /quantizedTime = Math\.floor/);
  assert.match(updatePath, /signature === overlay\.lastSignature/);
  assert.match(updatePath, /overlay\.skippedUploads \+= 1/);
  assert.ok(updatePath.indexOf("drawTarotExactIsfOverlay") < updatePath.indexOf("drawEchoDirectorLyricOverlay"));
  assert.equal((source.match(/maxFps: playbackPowerMode === "docked" \? 4 : 12/g) || []).length, 2);
});
