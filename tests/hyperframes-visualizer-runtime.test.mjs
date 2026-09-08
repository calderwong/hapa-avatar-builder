import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyVisualizerAudioMapping,
  echoPreparedPerformanceSignalFrames,
  isolateEchoPreparedModulation,
  evaluateHyperFramesVisualizers,
  HapaHyperFramesVisualizerRuntime,
  HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
  inspectVisualizerAudioMappingEffect,
  normalizeVisualizerAudioMapping,
} from "../src/domain/hyperframes-visualizer-runtime.js";
import { buildEchoIsfFrameIntent } from "../src/domain/echo-isf-frame-intent.js";
import { buildEchoMusicPerformance } from "../src/domain/echo-music-performance.js";
import { prepareDirectorModulationTimeline } from "../src/domain/director-modulation-v2.js";

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

test("deterministic browser ISF layers execute without a sampled proxy contract", () => {
  const show = fixtureShow();
  const layer = exactLayer({ id: "cue:live", visualizerId: "isf:fixture-live" });
  layer.proxy = null;
  layer.execution = {
    mode: "offline-browser-isf",
    route: "deterministic-browser-isf",
    status: "exact",
    drawable: true,
    reason: "hash-bound-isf-source-executed-at-final-resolution-and-fps",
    silentDefault: false,
  };
  layer.liveIsf = {
    schemaVersion: "hapa.hyperframes.deterministic-browser-isf.v2",
    shaderId: "fixture-live",
    sourceHash,
    runtimeSha256: assetHash,
    imageInputs: ["inputImage"],
    requiresMedia: true,
    multipass: true,
    persistent: true,
    timelineRequirement: "sequential-from-cue-start",
    frameRate: 30,
    width: 1920,
    height: 1080,
  };
  show.instances.visualizers = [layer];
  const state = evaluateHyperFramesVisualizers(show, 0.25);
  assert.equal(state.diagnostics.length, 0);
  assert.equal(state.layers.length, 1);
  assert.equal(state.layers[0].rendererTruth.route, "deterministic-browser-isf");
  assert.equal(state.layers[0].proxyFrame.frameSelectionPolicy, "continuous-pinned-isf-time");
  assert.deepEqual(state.layers[0].proxyFrame.sourceRect, [0, 0, 1920, 1080]);
  assert.equal(state.layers[0].pixelSignature, sourceHash);
  assert.equal(state.layers[0].liveIsf.persistent, true);
  layer.echoComposition = { opacity: .8, layerOpacity: .5, mix: .75, canvasComposite: 'lighter' };
  layer.presentationModulation = { mode: 'audio-conditioned-proxy', opacityDepth: .5, brightnessDepth: .8 };
  const projected = evaluateHyperFramesVisualizers(show, .25).layers[0];
  assert.equal(projected.effectiveOpacity, .075, "authored opacity, layer, mix, recipe and transition apply once");
  assert.equal(projected.echoPresentation.canvasComposite, 'lighter');
  assert.ok(projected.echoPresentation.audioEnvelope.contrast >= 1);
  const signalChanged = structuredClone(show);
  signalChanged.stemFrames.stems.forEach(stem => stem.frames.forEach(frame => { frame.rms=0; frame.onset=0; frame.low=0; frame.mid=0; frame.high=0; }));
  assert.equal(evaluateHyperFramesVisualizers(signalChanged,.25).layers[0].effectiveOpacity, projected.effectiveOpacity, "exact shader input changes do not add the proxy-only opacity envelope");

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

test("prepared sparse beats drive actual uniforms at the same song instant after reverse seeks", () => {
  const bundle = buildEchoMusicPerformance({ telemetry: { fps: 10, sampleRate: 8000, durationSeconds: 3,
    masterMix: { audioHash: "a".repeat(64), durationSeconds: 3, frames: [{ t: 0, rms: 0.9 }, { t: 1, rms: 0.7 }] },
    stems: [{ id: "d", role: "drums", audioHash: "b".repeat(64), durationSeconds: 3, frames: [{ t: 0, rms: 0.2 }, { t: 1, rms: 0.3 }] }] },
    events: [{ resourceId: "d", audioHash: "b".repeat(64), kind: "beat", atSeconds: 0.13125, precisionSeconds: 0.000125, method: "fixture-sample-onset", truthStatus: "measured" }] });
  const { buses, ...performance } = bundle;
  const show = fixtureShow();
  show.instances.visualizers = [exactLayer({ audioMap: { gain: { signal: "beat", depth: 1 } }, transition: "cut" })];
  show.stemFrames = { performance, master: buses[0], stems: buses.slice(1) };
  const before = evaluateHyperFramesVisualizers(show, 0.13124).layers[0];
  const at = evaluateHyperFramesVisualizers(show, 0.13125).layers[0];
  assert.equal(before.stemFrame.frame.beat, 0);
  assert.equal(at.stemFrame.frame.beat, 1);
  assert.ok(at.controlValues.gain > before.controlValues.gain);
  evaluateHyperFramesVisualizers(show, 1.6);
  evaluateHyperFramesVisualizers(show, 0.01);
  assert.deepEqual(evaluateHyperFramesVisualizers(show, 0.13125).layers[0], at);
  assert.equal(at.masterFrame.frame.beat, 0);
});

test("actual offline uniform adapter evaluates prepared attack/release without playback history", () => {
  const show = fixtureShow();
  show.instances.visualizers = [exactLayer({ id: "prepared", transition: "cut" })];
  show.automation.preparedModulation = prepareDirectorModulationTimeline([{
    id: "gain", source: { kind: "stem_signal", stemFocus: "drums", signal: "rms" },
    target: { kind: "visualizer_uniform", visualizerId: "prepared", uniform: "gain" },
    envelope: { depth: 0.8, attackSeconds: 0.15, releaseSeconds: 0.2 },
  }], { durationSeconds: 3, sourceFingerprint: "test-prepared-audio", sampleSignals: time => ({ stems: { drums: { rms: Math.min(1, time / 0.6) } } }) });
  const first = evaluateHyperFramesVisualizers(show, 0.6).layers[0];
  for (const time of [1.7, 0, 0.12, 1.2]) evaluateHyperFramesVisualizers(show, time);
  const again = evaluateHyperFramesVisualizers(show, 0.6).layers[0];
  assert.equal(first.controlValues.gain, again.controlValues.gain);
  assert.ok(first.controlBindings.some(binding => binding.status === "prepared-absolute-modulation"));
  const layer = show.instances.visualizers[0];
  const preview = time => buildEchoIsfFrameIntent({
    shader: { id: layer.visualizerId, shaderType: "generator", inputs: layer.inputs },
    card: { id: "prepared", visualization: { sourceId: layer.visualizerId, card: { controls: layer.controls, audioMap: layer.audioMap } } },
    timestampSeconds: time, preparedModulation: show.automation.preparedModulation,
    signalFrames: { master: { rms: 0.99, source: "prepared-performance" } },
  });
  assert.equal(preview(0.6).values.gain, first.controlValues.gain, "workbench and HyperFrames apply the same baked scalar value");
  preview(1.7); preview(0.01);
  assert.equal(preview(0.6).values.gain, first.controlValues.gain);
});

test("prepared bus sampling cost is independent of layer count and repeated seeks keep no frame cache", () => {
  const bundle = buildEchoMusicPerformance({ telemetry: { fps: 10, sampleRate: 8000, durationSeconds: 3,
    masterMix: { audioHash: 'a'.repeat(64), durationSeconds: 3, frames: [{ t: 0, rms: .2 }, { t: 1, rms: .8 }] },
    stems: [{ id: 'd', role: 'drums', audioHash: 'b'.repeat(64), durationSeconds: 3, frames: [{ t: 0, rms: .1 }, { t: 1, rms: .7 }] }] } });
  const { buses, ...performance } = bundle;
  const show = fixtureShow(); let reads = 0;
  const observedBuses = buses.map(bus => { const frames = bus.frames; return { ...bus, get frames() { reads++; return frames; } }; });
  show.stemFrames = { performance, master: observedBuses[0], stems: observedBuses.slice(1) };
  show.instances.visualizers = [exactLayer({ transition: 'cut' })];
  evaluateHyperFramesVisualizers(show, .6); const single = reads;
  show.instances.visualizers = Array.from({ length: 6 }, (_, index) => exactLayer({ id: `layer-${index}`, transition: 'cut' }));
  reads = 0; const first = evaluateHyperFramesVisualizers(show, .6);
  assert.equal(first.layers.length, 6); assert.equal(reads, single);
  evaluateHyperFramesVisualizers(show, 1.7); evaluateHyperFramesVisualizers(show, .01);
  assert.deepEqual(evaluateHyperFramesVisualizers(show, .6), first);
});


test("diagnostic solo reaches both uniform adapters without rebaking or leaking master modulation", () => {
  const roles = ["master", "drums", "vocals", "bass"];
  const buses = roles.map((role, index) => ({ id: role, role, durationSeconds: 2, originSeconds: 0,
    frames: [0, 1, 1.9].map(t => ({ t, rms: (index + 1) / 5, peak: 0.8, low: 0.2, mid: 0.3, high: 0.4, onsetEnvelope: 0.5, silence: false })) }));
  const bundle = { fingerprint: "test-isolation", durationSeconds: 2, buses, events: [], missingData: {} };
  const inputs = [...roles, "orbit"].map(role => ({ NAME: role, TYPE: "float", DEFAULT: 0.1, MIN: 0, MAX: 1 }));
  const audioMap = { ...Object.fromEntries(roles.map(role => [role, { signal: "rms", stemFocus: role, depth: 0.5 }])), orbit: { signal: "orbit", stemFocus: "master", depth: 0.5 } };
  const layer = exactLayer({ inputs, audioMap, controls: {} });
  const bindings = roles.map(role => ({ id: role, source: role === "master" ? { kind: "mix_signal", signal: "rms" } : { kind: "stem_signal", stemFocus: role, signal: "rms" }, target: { kind: "visualizer_uniform", visualizerId: layer.id, uniform: role }, envelope: { depth: 0.5, baseValue: 0.1, clamp: [0, 1] } }));
  const timeline = prepareDirectorModulationTimeline(bindings, { durationSeconds: 2, fps: 60, sourceFingerprint: bundle.fingerprint, sampleSignals: () => ({ master: buses[0].frames[0], stems: Object.fromEntries(buses.slice(1).map(b => [b.role, b.frames[0]])) }) });
  const show = { duration: 2, stemFrames: { performance: bundle, master: buses[0], stems: buses.slice(1) }, automation: { preparedModulation: timeline }, instances: { visualizers: [layer] } };
  const card = { id: layer.id, visualization: { card: { stemFocus: "drums", controls: {}, audioMap } } };
  const baseline = evaluateHyperFramesVisualizers(show, 0.6).layers[0].controlValues;
  for (const soloStem of ["drums", "leadVocals", "master", "__silence__", ""]) {
    const selected = soloStem === "leadVocals" ? "vocals" : soloStem;
    const filtered = isolateEchoPreparedModulation(timeline, soloStem);
    assert.equal(filtered.channels, timeline.channels, "diagnostics must reuse prepared envelope arrays");
    for (const t of [0.6, 0.1, 1.4, 0.6]) {
      const preview = buildEchoIsfFrameIntent({ shader: { id: layer.visualizerId, inputs }, card, timestampSeconds: t, signalFrames: echoPreparedPerformanceSignalFrames(bundle, t, { soloStem }), preparedModulation: filtered });
      const exported = evaluateHyperFramesVisualizers(show, t, { soloStem }).layers[0];
      for (const [uniform, value] of Object.entries(exported.controlValues)) assert.ok(Math.abs(value - preview.values[uniform]) <= 0.00000101, `${uniform} differs beyond six-decimal adapter rounding`);
      for (const role of roles) assert.equal(exported.controlValues[role], !selected || role === selected ? baseline[role] : 0.1);
      if (selected && selected !== "master") assert.equal(exported.controlValues.orbit, 0.1);
    }
  }
  assert.equal(show.automation.preparedModulation, timeline);
  assert.equal(timeline.targets.length, 4);
});

test('generated prepared envelopes use each input range and current control base in both adapters', async () => {
  const { buildEchoRecipeModulationBindings } = await import('../src/domain/echo-recipe-execution.js');
  const inputs = [
    { NAME: 'shine', TYPE: 'float', MIN: 50, MAX: 900, DEFAULT: 300 },
    { NAME: 'edge', TYPE: 'float', MIN: 55, MAX: 233, DEFAULT: 233 },
    { NAME: 'mode', TYPE: 'long', VALUES: [0, 2, 4], MIN: 0, MAX: 4, DEFAULT: 4 },
    { NAME: 'enabled', TYPE: 'bool', DEFAULT: true },
  ];
  const audioMap = Object.fromEntries(inputs.map(input => [input.NAME, { signal: 'rms', stemFocus: 'vocals', depth: .2, depthFraction: .2, depthMode: 'range-relative', direction: 'auto', headroomPolicy: 'auto-headroom-v1' }]));
  const layer = exactLayer({ inputs, audioMap, controls: {}, transition: 'cut' });
  const bindings = buildEchoRecipeModulationBindings([layer], { visualizerMix: 1, cameraEnergy: .5, accentDensity: .5, temporalModulation: .5 });
  const bundle = { fingerprint: 'range-fixture', durationSeconds: 2, buses: [{ role: 'vocals', durationSeconds: 2, frames: [{ t: 0, rms: 0 }, { t: 1, rms: 1 }] }], events: [], missingData: {} };
  const prepared = prepareDirectorModulationTimeline(bindings, { durationSeconds: 2, fps: 60, sourceFingerprint: bundle.fingerprint, sampleSignals: t => ({ stems: { vocals: { rms: t < .5 ? 0 : 1 } } }) });
  const show = { duration: 2, stemFrames: { performance: bundle, stems: bundle.buses }, automation: { preparedModulation: prepared }, instances: { visualizers: [layer] } };
  const card = { id: layer.id, visualization: { card: { controls: {}, audioMap, stemFocus: 'vocals' } } };
  const sample = t => {
    const preview = buildEchoIsfFrameIntent({ shader: { id: layer.visualizerId, inputs }, card, timestampSeconds: t, signalFrames: { vocals: { rms: t < .5 ? 0 : 1 } }, preparedModulation: prepared });
    const exported = evaluateHyperFramesVisualizers(show, t).layers[0].controlValues;
    for (const input of inputs) {
      const a = preview.values[input.NAME], b = exported[input.NAME];
      if (typeof a === 'number') assert.ok(Math.abs(a - b) < .000002, input.NAME);
      else assert.equal(a, b, input.NAME);
    }
    return preview.values;
  };
  assert.deepEqual(sample(.1), { shine: 300, edge: 233, mode: 4, enabled: true });
  const loud = sample(1.8);
  assert.ok(loud.shine > 400 && loud.shine <= 470);
  assert.ok(loud.edge < 233 && loud.edge >= 197.4);
  assert.equal(loud.mode, 2); assert.equal(loud.enabled, false);
  card.visualization.card.controls.shine = 400; layer.controls.shine = 400;
  assert.equal(sample(.1).shine, 400, 'current operator base is preserved without rebaking');
  assert.ok(sample(1.8).shine > 500);
  card.visualization.card.audioMap.shine = { signal: 'off' };
  assert.equal(sample(1.8).shine, 400, 'disabled/static mapping must not be overridden by prepared animation');
  assert.equal(sample(.1).edge, 233, 'reverse seeks restore the exact quiet state');
});

test('section layer admission counts media/lyrics/accents and preserves locked overflow through seeks', async () => {
  const {ECHO_SECTION_VISUAL_BUDGET_SCHEMA,admitEchoSectionVisualLayers}=await import('../src/domain/hyperframes-visualizer-runtime.js');
  const policy={schemaVersion:ECHO_SECTION_VISUAL_BUDGET_SCHEMA,sections:[{id:'quiet',type:'intro',start:0,end:1},{id:'peak',type:'chorus',start:1,end:2}]};
  const show=fixtureShow();
  show.instances.visualizers=Array.from({length:6},(_,i)=>exactLayer({id:'layer-'+i,layerOrder:i}));
  show.automation.visualBudgetPolicy=policy;
  show.instances.media=[{id:'media',start:0,end:2}];
  const before=JSON.stringify(show);
  const quiet=evaluateHyperFramesVisualizers(show,.5),peak=evaluateHyperFramesVisualizers(show,1.5);
  assert.equal(quiet.layers.length,2);assert.equal(peak.layers.length,4);
  assert.deepEqual(evaluateHyperFramesVisualizers(show,.5),quiet);
  assert.equal(JSON.stringify(show),before);
  const crowded=admitEchoSectionVisualLayers(show.instances.visualizers,policy,.5,{mediaLayers:2,lyricLayers:1,accentLayers:3});
  assert.equal(crowded.layers.length,0);assert.equal(crowded.receipt.totalLayers,6);
  show.instances.visualizers.forEach((layer,i)=>layer.locked=i<3);
  const locked=evaluateHyperFramesVisualizers(show,.5);
  assert.equal(locked.layers.length,3);assert.equal(locked.visualBudget.status,'protected-or-reserved-overflow');
});
