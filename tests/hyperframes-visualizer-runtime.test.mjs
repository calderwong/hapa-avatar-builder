import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyVisualizerAudioMapping,
  evaluateHyperFramesVisualizers,
  HapaHyperFramesVisualizerRuntime,
  HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
  inspectVisualizerAudioMappingEffect,
  normalizeVisualizerAudioMapping,
} from "../src/domain/hyperframes-visualizer-runtime.js";
import { buildEchoIsfFrameIntent } from "../src/domain/echo-isf-frame-intent.js";

const sourceHash = `sha256:${"a".repeat(64)}`;
const assetHash = `sha256:${"b".repeat(64)}`;

function exactLayer(overrides = {}) {
  const visualizerId = overrides.visualizerId || "isf:fixture-exact";
  const proxy = {
    assetPath: `/static/isf/proxies/${visualizerId.replace(/^isf:/, "")}.png`,
    repositoryPath: `web/isf/proxies/${visualizerId.replace(/^isf:/, "")}.png`,
    assetSha256: assetHash,
    sourceHash,
    width: 16,
    height: 9,
    frameWidth: 16,
    frameHeight: 9,
    atlasWidth: 128,
    atlasHeight: 9,
    frameCount: 8,
    fps: 4,
    frameTimes: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75],
  };
  return {
    id: overrides.id || "cue:exact",
    cueId: overrides.id || "cue:exact",
    cueIndex: overrides.cueIndex ?? 0,
    layerOrder: overrides.layerOrder ?? 2,
    trackId: overrides.trackId || "track:visualizers",
    start: overrides.start ?? 0,
    end: overrides.end ?? 2,
    duration: (overrides.end ?? 2) - (overrides.start ?? 0),
    visualizerId,
    sourceHash,
    pixelIdentitySeed: overrides.pixelIdentitySeed || "c".repeat(64),
    execution: { mode: "offline-proxy-atlas", route: "hash-bound-exact-proxy", status: "exact", drawable: true, silentDefault: false },
    rendererTruth: {
      schemaVersion: "hapa.visualizer-renderer-truth.v1",
      rendererId: "hyperframes",
      requested: { id: visualizerId, title: visualizerId, sourceHash, cueBoundary: { startSeconds: overrides.start ?? 0, endSeconds: overrides.end ?? 2 } },
      status: "exact",
      readiness: "ready",
      route: "hash-bound-exact-proxy",
      reason: "fixture",
      fidelityLoss: [],
      visible: true,
      silentDefault: false,
    },
    proxy,
    inputs: [
      { NAME: "gain", TYPE: "float", DEFAULT: 0.1, MIN: 0, MAX: 1 },
      { NAME: "enabled", TYPE: "bool", DEFAULT: false },
      { NAME: "inputImage", TYPE: "image" },
    ],
    controls: {},
    audioMap: {
      gain: { signal: "rms", depth: 0.5 },
      enabled: { signal: "onset", depth: 1, threshold: 0.5 },
      inputImage: { signal: "canvas", depth: 0 },
    },
    audioSignal: ["rms", "onset"],
    stemFocus: "drums",
    opacity: overrides.opacity ?? 0.8,
    visualizerMix: overrides.visualizerMix ?? 0.5,
    effectiveOpacity: (overrides.opacity ?? 0.8) * (overrides.visualizerMix ?? 0.5),
    blendMode: overrides.blendMode || "screen",
    target: overrides.target || "program",
    transition: overrides.transition || { kind: "crossfade", durationSeconds: 0.5 },
    ...overrides,
    proxy: { ...proxy, ...(overrides.proxy || {}) },
  };
}

function unsupportedLayer() {
  return {
    id: "cue:unsupported",
    cueId: "cue:unsupported",
    layerOrder: 1,
    trackId: "track:visualizers",
    start: 0,
    end: 2,
    duration: 2,
    visualizerId: "isf:fixture-unsupported",
    sourceHash,
    execution: { mode: "visible-diagnostic", route: "unsupported", status: "unsupported", drawable: false, reason: "proxy-generation-failed", silentDefault: false },
    rendererTruth: {
      schemaVersion: "hapa.visualizer-renderer-truth.v1",
      rendererId: "hyperframes",
      requested: { id: "isf:fixture-unsupported", title: "Unsupported", sourceHash, cueBoundary: { startSeconds: 0, endSeconds: 2 } },
      status: "unsupported",
      readiness: "unavailable",
      route: "unsupported",
      reason: "proxy-generation-failed",
      fidelityLoss: ["requested-shader-not-presented"],
      visible: true,
      silentDefault: false,
    },
    proxy: null,
  };
}

function fixtureShow() {
  return {
    schemaVersion: "hapa.hyperframes.executable-show.v2",
    showHash: "fixture-show",
    duration: 3,
    instances: {
      visualizers: [
        exactLayer({ id: "cue:back", layerOrder: 2 }),
        unsupportedLayer(),
        exactLayer({ id: "cue:front", visualizerId: "isf:fixture-front", layerOrder: 0, transition: "cut", pixelIdentitySeed: "d".repeat(64) }),
        exactLayer({ id: "cue:next", visualizerId: "isf:fixture-next", layerOrder: 0, start: 2, end: 3, transition: "cut", pixelIdentitySeed: "e".repeat(64) }),
      ],
    },
    automation: {
      visualTimeTrack: {
        events: [
          { id: "rate", kind: "playback-rate", startSeconds: 0, endSeconds: 0.5, target: { clock: "visual-only", layer: "visualizer-layer" }, keyframes: [{ offset: 0, visualRate: 2 }, { offset: 1, visualRate: 2 }] },
          { id: "hold", kind: "hold", startSeconds: 0.5, endSeconds: 1, target: { clock: "visual-only", layer: "visualizer-layer" }, keyframes: [{ offset: 0, visualRate: 0 }, { offset: 1, visualRate: 0 }] },
          { id: "repeat", kind: "repeat", startSeconds: 1, endSeconds: 1.5, target: { clock: "visual-only", layer: "visualizer-layer" }, keyframes: [{ offset: 0, sampleOffsetSeconds: -0.25 }, { offset: 1, sampleOffsetSeconds: -0.25 }] },
        ],
      },
      accentTrack: {
        events: [{
          id: "accent:fixture",
          cueId: "cue:beat",
          kind: "bloom",
          atSeconds: 0.2,
          endSeconds: 0.4,
          intensity: 0.6,
          target: { scope: "single-layer", layer: "visualizer-layer" },
          source: { stemRole: "drums", signal: "onset" },
          keyframes: [{ offset: 0, value: 0 }, { offset: 0.5, value: 0.6 }, { offset: 1, value: 0 }],
        }],
      },
    },
    stemFrames: {
      fps: 4,
      stems: [{
        id: "stem:drums",
        role: "drums",
        frames: [
          { t: 0, rms: 0.1, peak: 0.2, onset: 0.1, low: 0.2, mid: 0.3, high: 0.4 },
          { t: 0.25, rms: 0.4, peak: 0.5, onset: 0.7, low: 0.3, mid: 0.4, high: 0.5 },
          { t: 0.75, rms: 0.8, peak: 0.9, onset: 0.2, low: 0.7, mid: 0.6, high: 0.5 },
          { t: 1.25, rms: 0.6, peak: 0.7, onset: 0.4, low: 0.5, mid: 0.4, high: 0.3 },
          { t: 2, rms: 0.2, peak: 0.3, onset: 0.1, low: 0.2, mid: 0.2, high: 0.2 },
        ],
      }],
      master: {
        id: "master",
        frames: [
          { t: 0, rms: 0.2, peak: 0.3, onset: 0.1, low: 0.2, mid: 0.2, high: 0.2 },
          { t: 0.25, rms: 0.3, peak: 0.4, onset: 0.2, low: 0.3, mid: 0.3, high: 0.3 },
          { t: 0.75, rms: 0.4, peak: 0.5, onset: 0.3, low: 0.4, mid: 0.4, high: 0.4 },
          { t: 1.25, rms: 0.5, peak: 0.6, onset: 0.4, low: 0.5, mid: 0.5, high: 0.5 },
          { t: 2, rms: 0.6, peak: 0.7, onset: 0.5, low: 0.6, mid: 0.6, high: 0.6 },
        ],
      },
    },
  };
}

test("scheduler returns every drawable active cue in stable order and keeps unsupported active cues visible", () => {
  const show = fixtureShow();
  const before = structuredClone(show);
  const state = evaluateHyperFramesVisualizers(show, 0.25);
  assert.equal(state.schemaVersion, HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA);
  assert.deepEqual(state.layers.map((layer) => layer.cueId), ["cue:front", "cue:back"]);
  assert.deepEqual(state.instances, state.layers);
  assert.deepEqual(state.receipt.activeCandidateIds, ["cue:front", "cue:unsupported", "cue:back"]);
  assert.deepEqual(state.receipt.unsupportedInstanceIds, ["cue:unsupported"]);
  assert.equal(state.diagnostics.length, 1);
  assert.equal(state.diagnostics[0].reason, "native-route-not-exact");
  assert.equal(state.diagnostics[0].drawableFrame, null);
  assert.equal(state.diagnostics[0].visible, true);
  assert.equal(state.diagnostics[0].silentDefault, false);
  assert.deepEqual(show, before, "evaluation may not mutate the executable show");
});

test("visual rate, hold, and repeat events select deterministic horizontal proxy frames", () => {
  const show = fixtureShow();
  const rate = evaluateHyperFramesVisualizers(show, 0.25).layers[0];
  const hold = evaluateHyperFramesVisualizers(show, 0.75).layers[0];
  const repeat = evaluateHyperFramesVisualizers(show, 1.25).layers[0];
  const settled = evaluateHyperFramesVisualizers(show, 1.5).layers[0];
  assert.equal(rate.visualTime.visualTimeSeconds, 0.5);
  assert.equal(rate.proxyFrame.frameIndex, 2);
  assert.deepEqual(rate.proxyFrame.sourceRect, [32, 0, 16, 9]);
  assert.equal(hold.visualTime.visualTimeSeconds, 0.5);
  assert.equal(hold.proxyFrame.frameIndex, 2);
  assert.equal(repeat.visualTime.visualTimeSeconds, 1);
  assert.equal(repeat.proxyFrame.frameIndex, 4);
  assert.equal(settled.visualTime.visualTimeSeconds, 1.5);
  assert.equal(settled.proxyFrame.frameIndex, 6);
  assert.deepEqual(hold.visualTime.effects.map((effect) => effect.id), ["hold"]);
  assert.deepEqual(repeat.visualTime.effects.map((effect) => effect.id), ["repeat"]);
});

test("runtime skips registry-declared blank proxy samples without substituting another shader", () => {
  const show = fixtureShow();
  for (const layer of show.instances.visualizers.filter((row) => row.proxy)) {
    layer.proxy.playableFrameIndices = [1, 2, 3, 4, 5, 6, 7];
    layer.proxy.omittedFrameIndices = [0];
    layer.proxy.frameSelectionPolicy = "verified-nonblank-samples";
  }
  const layer = evaluateHyperFramesVisualizers(show, 0).layers[0];
  assert.equal(layer.proxyFrame.frameIndex, 1);
  assert.equal(layer.proxyFrame.frameSelectionPolicy, "verified-nonblank-samples");
  assert.equal(layer.visualizerId, "isf:fixture-front");
});

test("stem and master frames stay on canonical audio time while controls map from the requested stem", () => {
  const state = evaluateHyperFramesVisualizers(fixtureShow(), 0.25);
  const layer = state.layers.find((candidate) => candidate.id === "cue:back");
  assert.equal(layer.stemFrame.index, 1);
  assert.equal(layer.stemFrame.frame.t, 0.25);
  assert.equal(layer.masterFrame.index, 1);
  assert.equal(layer.masterFrame.frame.t, 0.25);
  assert.equal(layer.stemFocus, "drums");
  assert.equal(layer.mappedControls.values.gain, 0.3);
  assert.equal(layer.mappedControls.values.enabled, true);
  assert.equal(layer.controlBindings.find((binding) => binding.uniform === "gain").status, "mapped");
  assert.equal(layer.controlBindings.find((binding) => binding.uniform === "inputImage").status, "image-input-handled-separately");
  assert.equal(layer.visualTime.visualTimeSeconds, 0.5, "visual time modulation must not retime offline stem frames");
});

test("stem aliases resolve lead vocals to verified vocal telemetry without master fallback", () => {
  const show = fixtureShow();
  const layer = show.instances.visualizers.find((candidate) => candidate.id === "cue:back");
  layer.stemFocus = "leadVocals";
  show.stemFrames.stems[0].id = "stem:vocals";
  show.stemFrames.stems[0].role = "Vocals";

  const evaluated = evaluateHyperFramesVisualizers(show, 0.25).layers.find((candidate) => candidate.id === "cue:back");
  assert.equal(evaluated.stemFocus, "vocals");
  assert.deepEqual(evaluated.stemResolution, { requested: "vocals", resolved: "vocals", fallbackUsed: false });
  assert.equal(evaluated.stemFrame.role, "Vocals");
  assert.equal(evaluated.mappedControls.values.gain, 0.3);
});

test("each audio-map uniform samples its declared stem instead of the portable instance stem", () => {
  const show = fixtureShow();
  const layer = show.instances.visualizers.find((candidate) => candidate.id === "cue:back");
  layer.stemFocus = "master";
  layer.audioMap.gain = { signal: "rms", depth: 0.5, stemFocus: "Drums" };
  layer.audioMap.enabled = { signal: "onset", depth: 1, threshold: 0.5, stemFocus: "leadVocals" };
  show.stemFrames.stems.push({
    id: "stem:vocals",
    role: "Vocals",
    frames: [
      { t: 0, rms: 0.05, onset: 0 },
      { t: 0.25, rms: 0.1, onset: 0.9 },
    ],
  });

  const evaluated = evaluateHyperFramesVisualizers(show, 0.25).layers.find((candidate) => candidate.id === "cue:back");
  assert.equal(evaluated.stemFocus, "master", "mixed maps keep the instance/presentation focus independent");
  assert.equal(evaluated.mappedControls.values.gain, 0.3, "gain uses drums rms 0.4, not master rms 0.3");
  assert.equal(evaluated.mappedControls.values.enabled, true, "enabled uses vocal onset 0.9, not master onset 0.2");
  assert.deepEqual(
    evaluated.controlBindings.filter((binding) => ["gain", "enabled"].includes(binding.uniform)).map((binding) => ({
      uniform: binding.uniform,
      requestedStem: binding.requestedStem,
      resolvedStem: binding.resolvedStem,
      fallbackUsed: binding.fallbackUsed,
    })),
    [
      { uniform: "gain", requestedStem: "drums", resolvedStem: "drums", fallbackUsed: false },
      { uniform: "enabled", requestedStem: "vocals", resolvedStem: "vocals", fallbackUsed: false },
    ],
  );
});

test("shared mapping policy preserves legacy numerics and gives generated float/enum mappings material headroom", () => {
  const gain = { NAME: "gain", TYPE: "float", DEFAULT: 1, MIN: 0, MAX: 1 };
  const legacy = normalizeVisualizerAudioMapping({ signal: "rms", depth: 0.2 }, { input: gain });
  assert.equal(legacy.depthMode, "absolute");
  assert.equal(legacy.headroomPolicy, undefined);
  assert.equal(applyVisualizerAudioMapping(gain, 1, 1, legacy).value, 1, "legacy positive-at-max behavior remains byte-compatible");

  const generated = normalizeVisualizerAudioMapping({ signal: "rms", depth: 0.2 }, { input: gain, generated: true, materializeDepth: false });
  assert.equal(generated.depthMode, "range-relative");
  assert.equal(generated.headroomPolicy, "auto-headroom-v1");
  assert.equal(applyVisualizerAudioMapping(gain, 1, 1, generated).value, 0.8);
  assert.equal(inspectVisualizerAudioMappingEffect(gain, 1, generated).material, true);

  const mode = { NAME: "mode", TYPE: "long", DEFAULT: 4, MIN: 0, MAX: 4, VALUES: [0, 2, 4] };
  const generatedMode = normalizeVisualizerAudioMapping({ signal: "beat", depth: 0.01 }, { input: mode, generated: true, materializeDepth: false });
  assert.equal(applyVisualizerAudioMapping(mode, 4, 1, generatedMode).value, 2, "generated enums move by at least one declared step");
  assert.equal(inspectVisualizerAudioMappingEffect(mode, 4, generatedMode).material, true);

  const asymmetricMode = { NAME: "asymmetricMode", TYPE: "long", DEFAULT: 4, MIN: 0, MAX: 10, VALUES: [0, 4] };
  const asymmetricMapping = normalizeVisualizerAudioMapping({ signal: "beat", depth: 0.01 }, { input: asymmetricMode, generated: true, materializeDepth: false });
  assert.equal(
    applyVisualizerAudioMapping(asymmetricMode, 4, 1, asymmetricMapping).value,
    0,
    "generated enums choose a direction that contains a declared alternate even when numeric bounds advertise empty headroom",
  );
  assert.equal(inspectVisualizerAudioMappingEffect(asymmetricMode, 4, asymmetricMapping).material, true);
});

test("Preview and offline runtime apply identical generated values across scalar, enum, bool, and vector inputs", () => {
  const inputs = [
    { NAME: "floatMax", TYPE: "float", DEFAULT: 1, MIN: 0, MAX: 1 },
    { NAME: "floatMin", TYPE: "float", DEFAULT: 0, MIN: 0, MAX: 1 },
    { NAME: "mode", TYPE: "long", DEFAULT: 4, MIN: 0, MAX: 10, VALUES: [0, 4] },
    { NAME: "enabled", TYPE: "bool", DEFAULT: true },
    { NAME: "tint", TYPE: "color", DEFAULT: [1, 0, 1, 0], MIN: [0, 0, 0, 0], MAX: [1, 1, 1, 1] },
    { NAME: "origin", TYPE: "point2D", DEFAULT: [1, -1], MIN: [-1, -1], MAX: [1, 1] },
  ];
  const audioMap = Object.fromEntries(inputs.map((input) => [
    input.NAME,
    normalizeVisualizerAudioMapping(
      { signal: "rms", depth: 0.2 },
      { input, generated: true, materializeDepth: false },
    ),
  ]));
  const card = {
    id: "cue:parity",
    startSeconds: 0,
    endSeconds: 2,
    visualization: {
      sourceId: "isf:parity",
      card: { id: "isf:parity", inputs, controls: {}, audioMap, stemFocus: "master", layer: {} },
    },
  };
  const preview = buildEchoIsfFrameIntent({
    shader: { id: "isf:parity", inputs },
    card,
    signalFrames: { master: { rms: 0.75 } },
  });
  const show = fixtureShow();
  const layer = exactLayer({
    id: "cue:parity",
    visualizerId: "isf:parity",
    inputs,
    controls: {},
    audioMap,
    stemFocus: "master",
  });
  show.instances.visualizers = [layer];
  show.stemFrames.master.frames = [{ t: 0, rms: 0.75 }];
  const offline = evaluateHyperFramesVisualizers(show, 0.25).layers[0];
  assert.deepEqual(offline.mappedControls.values, preview.values);
});

test("audio-conditioned proxy presentation changes retained pixels materially and deterministically", () => {
  const conditionedShow = ({ rms, onset }) => {
    const show = fixtureShow();
    const layer = show.instances.visualizers.find((candidate) => candidate.id === "cue:back");
    layer.presentationModulation = {
      schemaVersion: "hapa.hyperframes.presentation-modulation.v1",
      mode: "audio-conditioned-proxy",
      source: "declared-audio-map",
      primarySignal: "rms",
      accentSignal: "beat",
      primaryWeight: 0.7,
      accentWeight: 0.3,
      frameOffsetFrames: 3,
      brightnessDepth: 0.38,
      saturationDepth: 0.5,
      scaleDepth: 0.055,
      opacityDepth: 0.16,
    };
    const frame = show.stemFrames.stems[0].frames.find((candidate) => candidate.t === 0.25);
    Object.assign(frame, { rms, onset });
    return show;
  };
  const lowShow = conditionedShow({ rms: 0, onset: 0 });
  const highShow = conditionedShow({ rms: 1, onset: 1 });
  const low = evaluateHyperFramesVisualizers(lowShow, 0.25).layers.find((candidate) => candidate.id === "cue:back");
  const high = evaluateHyperFramesVisualizers(highShow, 0.25).layers.find((candidate) => candidate.id === "cue:back");
  const repeated = evaluateHyperFramesVisualizers(highShow, 0.25).layers.find((candidate) => candidate.id === "cue:back");

  assert.equal(low.proxyFrame.baseFrameIndex, high.proxyFrame.baseFrameIndex, "canonical visual time remains identical");
  assert.equal(low.proxyFrame.audioFrameOffset, 0);
  assert.equal(high.proxyFrame.audioFrameOffset, 3);
  assert.notEqual(low.proxyFrame.frameIndex, high.proxyFrame.frameIndex, "audio energy selects a materially different retained shader frame");
  assert.notEqual(low.pixelFrameIdentity, high.pixelFrameIdentity);
  assert.equal(low.presentationModulation.brightness, 1);
  assert.equal(high.presentationModulation.brightness, 1.38);
  assert.equal(high.presentationModulation.saturation, 1.5);
  assert.equal(high.presentationModulation.scale, 1.055);
  assert.ok(high.effectiveOpacity > low.effectiveOpacity);
  assert.deepEqual(high, repeated, "the same show time and stem frame must produce the same presentation");
});

test("transition opacity and visualizer accents are evaluated without hidden decisions", () => {
  const state = evaluateHyperFramesVisualizers(fixtureShow(), 0.25);
  const back = state.layers.find((layer) => layer.id === "cue:back");
  assert.equal(back.baseEffectiveOpacity, 0.4);
  assert.equal(back.transitionEnvelope.alpha, 0.5);
  assert.equal(back.effectiveOpacity, 0.2);
  assert.equal(state.accents.length, 1);
  assert.equal(state.accents[0].assignedInstanceId, "cue:front");
  assert.equal(state.layers[0].accents[0].id, "accent:fixture");
  assert.equal(state.layers[1].accents.length, 0);
});

test("cue seams are half-open and unsupported cues never leave drawable placeholders", () => {
  const before = evaluateHyperFramesVisualizers(fixtureShow(), 2 - 0.0001);
  const seam = evaluateHyperFramesVisualizers(fixtureShow(), 2);
  assert.deepEqual(before.layers.map((layer) => layer.cueId), ["cue:front", "cue:back"]);
  assert.deepEqual(seam.layers.map((layer) => layer.cueId), ["cue:next"]);
  assert.equal(seam.layers.some((layer) => layer.cueId === "cue:back"), false);
  assert.equal(seam.diagnostics.some((row) => row.instanceId === "cue:unsupported"), false);
  assert.equal(seam.receipt.halfOpenCueIntervals, true);
});

test("runtime is self-contained browser ESM/global code with no nondeterministic or online APIs", () => {
  const source = fs.readFileSync("src/domain/hyperframes-visualizer-runtime.js", "utf8");
  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /Math\.random|Date\.now|new Date|AudioContext|getUserMedia|fetch\(|XMLHttpRequest|https?:\/\//);
  assert.equal(globalThis.HapaHyperFramesVisualizerRuntime, HapaHyperFramesVisualizerRuntime);
  assert.equal(globalThis.HapaHyperFramesVisualizerRuntime.evaluateHyperFramesVisualizers, evaluateHyperFramesVisualizers);
  const a = evaluateHyperFramesVisualizers(fixtureShow(), 0.75);
  const b = evaluateHyperFramesVisualizers(fixtureShow(), 0.75);
  assert.deepEqual(a, b);
  assert.equal(a.receipt.runtimeDecisionCalls, false);
  assert.equal(a.receipt.runtimeAudioAnalysis, false);
  assert.equal(a.receipt.randomCalls, false);
  assert.equal(a.receipt.wallClockCalls, false);
  assert.equal(a.receipt.networkCalls, false);
});
