import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHyperFramesPixelAcceptance,
  deriveHyperFramesPixelExpectations,
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
  canvasNonBlank = true,
} = {}) {
  return {
    timestamp,
    pngSha256: png,
    canvasPngSha256: canvas,
    metrics: { nonBlank: true, nonFlat: true },
    canvasMetrics: { nonBlank: canvasNonBlank, nonFlat: canvasNonBlank, lumaMax: canvasNonBlank ? 128 : 0 },
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

test("audio-reactive blank moments at zero-signal never gate the render when the visualizer draws elsewhere", () => {
  const result = evaluateHyperFramesPixelAcceptance({
    frames: [
      frame({ timestamp: 12.5, cueId: "card:b:0", visualizerId: "isf:reactive", canvasNonBlank: false, canvas: "canvas-quiet" }),
      frame({ timestamp: 64.5, cueId: "card:b:2", visualizerId: "isf:reactive", canvasNonBlank: true, canvas: "canvas-loud" }),
      frame({ timestamp: 174.5, cueId: "card:b:7", visualizerId: "isf:reactive", canvasNonBlank: false, canvas: "canvas-quiet2" }),
      frame({ timestamp: 181.2, cueId: "card:b:7", visualizerId: "isf:reactive", canvasNonBlank: true, canvas: "canvas-loud2" }),
    ],
    timelineReady: true,
  });
  assert.equal(result.acceptance.shaderCanvasNonBlank, false, "blank moments are still recorded as evidence");
  assert.deepEqual(result.acceptance.blankShaderCanvasFrames, [12.5, 174.5]);
  assert.equal(result.acceptance.shaderCanvasDrawn, true);
  assert.equal(result.ok, true);
});

test("blank shader canvas diagnostics preserve the exact cue and visualizer for safe replanning", () => {
  const result = evaluateHyperFramesPixelAcceptance({
    frames: [frame({ timestamp: 210.5, cueId: "card:b:9", visualizerId: "isf:alpha-only", canvasNonBlank: false })],
    timelineReady: true,
  });
  // Canvas content presence is evidence-only (post-encode spatial parity is
  // the content gate), but the unproven visualizer is still recorded.
  assert.equal(result.acceptance.shaderCanvasDrawn, false);
  assert.deepEqual(result.diagnostics.unprovenVisualizerIds, ["isf:alpha-only"]);
  assert.deepEqual(result.acceptance.blankShaderCanvasFrames, [210.5]);
  assert.deepEqual(result.diagnostics.blankShaderCanvasFrameDetails[0].expected[0], {
    cueId: "card:b:9",
    visualizerId: "isf:alpha-only",
    stemFocus: "leadVocals",
    canonicalStemRole: "vocals",
    effectiveOpacity: null,
  });
  assert.equal(result.diagnostics.blankShaderCanvasFrameDetails[0].canvasMetrics.lumaMax, 0);
});


test("pixel expectations honor declared quiet/verse admission and reject incorrect suppression or extra draws", () => {
  const layer = (id, protectedSlot = false) => ({ id, cueId: id, visualizerId: `isf:${id}`, stemFocus: "master", start: 0, end: 10, alwaysOn: protectedSlot, trackIndex: protectedSlot ? 2 : 1 });
  const show = { duration: 10, instances: { visualizers: [layer("cue"), layer("slot-a", true), layer("slot-b", true)], media: [], lyrics: [] }, automation: { visualBudgetPolicy: { schemaVersion: "hapa.echo.section-visual-budget.v1", maxVisualizerLayers: 6, sections: [{ id: "intro", startSeconds: 0, endSeconds: 4, energy: .2 }, { id: "verse", startSeconds: 4, endSeconds: 10, energy: .5 }] } } };
  const expected = deriveHyperFramesPixelExpectations(show, [3.9, 4]);
  assert.deepEqual(expected[0].layers.map(l => l.cueId), ["slot-a", "slot-b"]);
  assert.equal(expected[1].layers.length, 3);
  assert.deepEqual(expected[0].visualBudget.suppressedIds, ["cue"]);
  const row = frame(); row.expected = expected[0];
  row.renderState.layers = expected[0].layers.map(l => ({ ...l, effectiveOpacity: .2 }));
  row.renderState.drawnLayerCount = 2; row.renderState.visualBudget = structuredClone(expected[0].visualBudget);
  const evaluate = () => evaluateHyperFramesPixelAcceptance({ frames: [row], timelineReady: true });
  assert.equal(evaluate().ok, true);
  row.renderState.visualBudget.suppressedIds = [];
  assert.equal(evaluate().acceptance.declaredVisualBudgetMatches, false);
  row.renderState.visualBudget = structuredClone(expected[0].visualBudget);
  row.renderState.layers.push({ ...expected[1].layers.find(l => l.cueId === "cue"), effectiveOpacity: .2 });
  assert.equal(evaluate().ok, false);
  row.renderState.layers.pop(); row.renderState.layers.reverse();
  assert.equal(evaluate().ok, false);
  row.renderState.layers.pop();
  assert.equal(evaluate().ok, false);
});
