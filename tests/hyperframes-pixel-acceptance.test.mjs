import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHyperFramesPixelAcceptance,
  matchesExpectedLayer,
  normalizedStemRole,
} from "../scripts/hyperframes-pixel-acceptance.mjs";

function frame({
  timestamp = 8,
  cueId = "card:b:0",
  visualizerId = "isf:one",
  expectedStem = "leadVocals",
  actualStem = "vocals",
  opacity = 0.2,
  png = "frame-a",
  canvas = "canvas-a",
} = {}) {
  return {
    timestamp,
    pngSha256: png,
    canvasPngSha256: canvas,
    metrics: { nonBlank: true, nonFlat: true },
    canvasMetrics: { nonBlank: true, nonFlat: true },
    expected: { layers: [{ cueId, visualizerId, stemFocus: expectedStem }] },
    renderState: {
      layers: [{ cueId, visualizerId, stemFocus: actualStem, effectiveOpacity: opacity }],
      drawnLayerCount: 1,
      canvasSampleHash: `hash:${canvas}`,
    },
  };
}

test("pixel QA canonicalizes the complete shared stem alias vocabulary", () => {
  const aliases = {
    masterMix: "master",
    mix: "master",
    leadVocal: "vocals",
    leadVocals: "vocals",
    leadVoice: "vocals",
    voice: "vocals",
    backingVocals: "backing-vocals",
    backgroundVocals: "backing-vocals",
    drums: "drums",
    drum: "drums",
    keys: "keyboard",
    keyboards: "keyboard",
    synths: "synth",
    stringsSection: "strings",
  };
  for (const [input, expected] of Object.entries(aliases)) assert.equal(normalizedStemRole(input), expected, input);
});

test("Blue-style leadVocals expectations match canonical vocals runtime truth", () => {
  const expected = { cueId: "card:b:9", visualizerId: "isf:blue", stemFocus: "leadVocals" };
  const actual = { cueId: "card:b:9", visualizerId: "isf:blue", stemFocus: "vocals", effectiveOpacity: 0.23 };
  assert.equal(matchesExpectedLayer(actual, expected), true);

  const result = evaluateHyperFramesPixelAcceptance({
    frames: [frame({ cueId: "card:b:9", visualizerId: "isf:blue" })],
    timelineReady: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.acceptance.renderStateMatchesExpected, true);
  assert.equal(result.acceptance.positiveEffectiveOpacity, true);
  assert.deepEqual(result.diagnostics.mismatchedFrames, []);
  assert.deepEqual(result.diagnostics.semanticAliasMatches, [{
    timestamp: 8,
    cueId: "card:b:9",
    expectedStemRole: "leadVocals",
    actualStemRole: "vocals",
    canonicalStemRole: "vocals",
  }]);
});

test("a valid one-shader or repeated-shader show does not require an invented ID transition", () => {
  const result = evaluateHyperFramesPixelAcceptance({
    frames: [
      frame({ timestamp: 4, cueId: "card:b:0", png: "frame-a", canvas: "canvas-a" }),
      frame({ timestamp: 12, cueId: "card:b:1", png: "frame-b", canvas: "canvas-b" }),
    ],
    timelineReady: true,
  });
  assert.equal(result.acceptance.expectedDistinctIdTransitions, 0);
  assert.equal(result.acceptance.distinctIdTransitions, 0);
  assert.equal(result.acceptance.idTransitionsMatchExpected, true);
  assert.equal(result.ok, true);
});

test("real cue, shader, stem, and opacity mismatches remain fail-closed and diagnostic", () => {
  const result = evaluateHyperFramesPixelAcceptance({
    frames: [frame({ expectedStem: "drums", actualStem: "vocals", opacity: 0 })],
    timelineReady: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.acceptance.renderStateMatchesExpected, false);
  assert.equal(result.acceptance.positiveEffectiveOpacity, false);
  assert.equal(result.diagnostics.mismatchedFrames[0].expected[0].canonicalStemRole, "drums");
  assert.equal(result.diagnostics.mismatchedFrames[0].actual[0].canonicalStemRole, "vocals");
});
