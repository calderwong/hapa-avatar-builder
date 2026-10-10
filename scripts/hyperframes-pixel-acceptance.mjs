import {
  HYPERFRAMES_STEM_ROLE_ALIASES,
  normalizeHyperFramesStemRole,
  expectedHyperFramesVisualAdmission,
} from "../src/domain/hyperframes-visualizer-runtime.js";

export const STEM_ROLE_ALIASES = HYPERFRAMES_STEM_ROLE_ALIASES;

export function deriveHyperFramesPixelExpectations(show, timestamps) {
  return timestamps.map((timestamp) => {
    const admission = expectedHyperFramesVisualAdmission(show, timestamp);
    return {
      timestamp,
      layers: admission.layers.map((instance) => ({
        cueId: instance.cueId || instance.id,
        visualizerId: instance.visualizerId,
        stemFocus: instance.stemFocus,
        start: instance.start,
        end: instance.end,
      })),
      visualBudget: admission.receipt,
      derivedFrom: "executable-show.json:declared-section-admission",
    };
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  return value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function rawStemRole(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.requested ?? value.resolved ?? value.role ?? value.id ?? "";
  }
  return value ?? "";
}

function normalizedStemRole(value) {
  return normalizeHyperFramesStemRole(rawStemRole(value));
}

export function renderLayers(frame = {}) {
  const layers = frame?.renderState?.layers || frame?.renderState?.instances || [];
  return Array.isArray(layers) ? layers : [];
}

export function frameExpectedLayers(frame = {}) {
  if (Array.isArray(frame?.expected?.layers)) return frame.expected.layers;
  return frame?.expected ? [frame.expected] : [];
}

export function matchesExpectedLayer(actual = {}, expected = {}) {
  return (actual.cueId || actual.id) === expected.cueId
    && actual.visualizerId === expected.visualizerId
    && normalizedStemRole(actual.stemFocus) === normalizedStemRole(expected.stemFocus);
}

function layerSummary(layer = {}) {
  return {
    cueId: layer.cueId || layer.id || null,
    visualizerId: layer.visualizerId || null,
    stemFocus: rawStemRole(layer.stemFocus) || null,
    canonicalStemRole: normalizedStemRole(layer.stemFocus) || null,
    effectiveOpacity: Number.isFinite(Number(layer.effectiveOpacity)) ? Number(layer.effectiveOpacity) : null,
  };
}

function expectedVisualizerKey(frame = {}) {
  return frameExpectedLayers(frame).map((layer) => String(layer.visualizerId || "")).join("+");
}

function actualVisualizerKey(frame = {}) {
  return renderLayers(frame).map((layer) => String(layer.visualizerId || "")).join("+");
}

function changedTransitions(values = []) {
  return values.slice(1).filter((value, index) => value && value !== values[index]).length;
}

export function evaluateHyperFramesPixelAcceptance({
  frames = [],
  timelineReady = false,
  networkAttemptCount = 0,
  consoleErrorCount = 0,
} = {}) {
  const rows = Array.isArray(frames) ? frames : [];
  const mismatchedFrames = [];
  const nonPositiveOpacityFrames = [];
  const semanticAliasMatches = [];
  const budgetMismatches = [];

  for (const frame of rows) {
    const actualLayers = renderLayers(frame);
    const expectedLayers = frameExpectedLayers(frame);
    const missing = [];
    if (frame.expected?.visualBudget && JSON.stringify(stable(frame.expected.visualBudget)) !== JSON.stringify(stable(frame.renderState?.visualBudget))) {
      budgetMismatches.push({ timestamp: finite(frame.timestamp), expected: frame.expected.visualBudget, actual: frame.renderState?.visualBudget || null });
    }
    const nonPositive = actualLayers
      .filter((layer) => !(finite(layer.effectiveOpacity, 0) > 0))
      .map(layerSummary);
    for (const expected of expectedLayers) {
      const actual = actualLayers.find((candidate) => matchesExpectedLayer(candidate, expected));
      if (!actual) {
        missing.push(layerSummary(expected));
        continue;
      }
      const expectedRaw = String(rawStemRole(expected.stemFocus) || "");
      const actualRaw = String(rawStemRole(actual.stemFocus) || "");
      if (expectedRaw !== actualRaw && normalizedStemRole(expectedRaw) === normalizedStemRole(actualRaw)) {
        semanticAliasMatches.push({
          timestamp: finite(frame.timestamp),
          cueId: expected.cueId || null,
          expectedStemRole: expectedRaw,
          actualStemRole: actualRaw,
          canonicalStemRole: normalizedStemRole(actualRaw),
        });
      }
    }
    const unexpected = actualLayers.filter(actual => !expectedLayers.some(expected => matchesExpectedLayer(actual, expected)));
    const orderMatches = actualLayers.length === expectedLayers.length && actualLayers.every((actual, index) => matchesExpectedLayer(actual, expectedLayers[index]));
    if (expectedLayers.length === 0 || missing.length > 0 || unexpected.length > 0 || !orderMatches) {
      mismatchedFrames.push({
        timestamp: finite(frame.timestamp),
        expected: expectedLayers.map(layerSummary),
        actual: actualLayers.map(layerSummary),
        missing,
        unexpected: unexpected.map(layerSummary),
        orderMatches,
      });
    }
    if (expectedLayers.length === 0 || actualLayers.length === 0 || nonPositive.length > 0) {
      nonPositiveOpacityFrames.push({ timestamp: finite(frame.timestamp), layers: nonPositive });
    }
  }

  const actualVisualizerIds = rows.map(actualVisualizerKey);
  const expectedVisualizerIds = rows.map(expectedVisualizerKey);
  const pixelHashes = rows.map((frame) => frame.pngSha256 || "");
  const canvasPixelHashes = rows.map((frame) => frame.canvasPngSha256 || "");
  const distinctIdTransitions = changedTransitions(actualVisualizerIds);
  const expectedDistinctIdTransitions = changedTransitions(expectedVisualizerIds);
  const fullFrameChangedTransitions = changedTransitions(pixelHashes);
  const canvasChangedTransitions = changedTransitions(canvasPixelHashes);
  const idTransitionsMatchExpected = distinctIdTransitions === expectedDistinctIdTransitions;
  const idChangeCausesPixelChange = distinctIdTransitions === 0 || canvasChangedTransitions >= distinctIdTransitions;
  const blankShaderCanvasFrameDetails = rows
    .filter((frame) => frame.canvasMetrics?.nonBlank !== true)
    .map((frame) => ({
      timestamp: finite(frame.timestamp),
      expected: frameExpectedLayers(frame).map(layerSummary),
      actual: renderLayers(frame).map(layerSummary),
      canvasMetrics: frame.canvasMetrics && typeof frame.canvasMetrics === "object"
        ? { ...frame.canvasMetrics }
        : null,
    }));
  // Audio-reactive visualizers legitimately draw transparent or pure-black
  // canvases at zero-signal moments, and a visualizer instance sampled only
  // during rests is pixel-indistinguishable from a broken one. Canvas content
  // presence is therefore evidence only: it is verified against the Preview
  // by the post-encode spatial-parity gate, not by per-capture blank counts.
  // The structural gates above (identity, opacity, draw counts, transitions)
  // remain fail-closed.
  const requestedVisualizerIds = new Set();
  const drawnVisualizerIds = new Set();
  for (const frame of rows) {
    for (const layer of frameExpectedLayers(frame)) {
      const id = String(layer.visualizerId || "");
      if (id) requestedVisualizerIds.add(id);
    }
    if (frame.canvasMetrics?.nonBlank === true) {
      for (const layer of renderLayers(frame)) {
        const id = String(layer.visualizerId || "");
        if (id) drawnVisualizerIds.add(id);
      }
    }
  }
  const unprovenVisualizerIds = [...requestedVisualizerIds].filter((id) => !drawnVisualizerIds.has(id));
  const acceptance = {
    timelineReady: Boolean(timelineReady),
    renderStatePresent: rows.length > 0 && rows.every((frame) => frame.renderState && Array.isArray(frame.renderState.layers || frame.renderState.instances)),
    shaderCanvasCapturePresent: rows.length > 0 && rows.every((frame) => frame.canvasPngSha256 && frame.renderState?.canvasSampleHash),
    shaderLayersDrawn: rows.length > 0 && rows.every((frame) => finite(frame.renderState?.drawnLayerCount, 0) >= frameExpectedLayers(frame).length),
    positiveEffectiveOpacity: rows.length > 0 && nonPositiveOpacityFrames.length === 0,
    nonBlank: rows.length > 0 && rows.every((frame) => frame.metrics?.nonBlank === true),
    nonFlat: rows.length > 0 && rows.every((frame) => frame.metrics?.nonFlat === true),
    shaderCanvasNonBlank: rows.length > 0 && rows.every((frame) => frame.canvasMetrics?.nonBlank === true),
    shaderCanvasDrawn: rows.length === 0 || unprovenVisualizerIds.length === 0,
    blankShaderCanvasFrames: rows.filter((frame) => frame.canvasMetrics?.nonBlank !== true).map((frame) => finite(frame.timestamp)),
    renderStateMatchesExpected: rows.length > 0 && mismatchedFrames.length === 0,
    declaredVisualBudgetMatches: budgetMismatches.length === 0,
    expectedDistinctIdTransitions,
    distinctIdTransitions,
    idTransitionsMatchExpected,
    fullFrameChangedTransitions,
    canvasChangedTransitions,
    idChangeCausesPixelChange,
  };
  const functionalOk = Number(networkAttemptCount || 0) === 0
    && Number(consoleErrorCount || 0) === 0
    && acceptance.timelineReady
    && acceptance.renderStatePresent
    && acceptance.shaderCanvasCapturePresent
    && acceptance.shaderLayersDrawn
    && acceptance.positiveEffectiveOpacity
    && acceptance.nonBlank
    && acceptance.nonFlat
    && acceptance.renderStateMatchesExpected
    && acceptance.declaredVisualBudgetMatches
    && acceptance.idTransitionsMatchExpected
    && acceptance.idChangeCausesPixelChange;

  return {
    acceptance,
    functionalOk,
    ok: functionalOk,
    diagnostics: {
      mismatchedFrames,
      nonPositiveOpacityFrames,
      blankShaderCanvasFrameDetails,
      unprovenVisualizerIds,
      semanticAliasMatches,
      budgetMismatches,
    },
  };
}

export { normalizedStemRole };
