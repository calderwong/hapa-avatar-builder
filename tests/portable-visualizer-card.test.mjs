import test from "node:test";
import assert from "node:assert/strict";
import { buildPortableVisualizerCard, validatePortableVisualizerCard } from "../src/domain/portable-visualizer-card.js";

test("portable visualizer card retains executable layer and honest renderer truth", () => {
  const card = buildPortableVisualizerCard({
    id: "isf:test", title: "Test", source: "/static/test.fs",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.4 }],
    audioMap: { gain: { signal: "rms", depth: 0.3 } },
  }, { controls: { gain: 0.4 }, stemFocus: "synth", layerRole: "rhythm", opacity: 0.6, blendMode: "screen", target: "program", mix: 0.8, nativeKey: "audio-bars" });
  assert.equal(validatePortableVisualizerCard(card).ok, true);
  assert.equal(card.stemFocus, "synth");
  assert.deepEqual(card.audioSignal, ["rms"]);
  assert.equal(card.audioMap.gain.depthMode, "range-relative");
  assert.equal(card.audioMap.gain.depthFraction, 0.3, "new portable generator output must carry explicit range-relative intent");
  assert.equal(card.audioMap.gain.headroomPolicy, "auto-headroom-v1");
  assert.equal(card.audioMap.gain.direction, "auto");
  assert.equal(card.automation[0].headroomPolicy, "auto-headroom-v1");
  assert.equal(card.layer.mix, 0.8);
  assert.equal(card.rendererSupport.echoAvatarBuilder.route, "exact-browser-isf");
  assert.equal(card.rendererSupport.echoTarot.route, "exact-browser-isf");
  assert.equal(card.rendererSupport.musicVizNative.route, "unsupported");
  assert.equal(card.rendererSupport.musicVizNative.nativeKey, null);
  assert.equal(card.nativeRoute.reason, "native-route-undeclared");
  assert.equal(card.rendererSupport.hyperframes.route, "unsupported");
  assert.equal(card.rendererSupport.hyperframes.reason, "visualizer-instance-proxy-undeclared");
  assert.ok(card.source.hash.startsWith("fnv1a32:"));
});

test("portable generator preserves explicitly absolute legacy mappings", () => {
  const card = buildPortableVisualizerCard({
    id: "isf:absolute", source: "/absolute.fs",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.4, MIN: 0, MAX: 10 }],
    audioMap: { gain: { signal: "rms", depth: 0.3, depthMode: "absolute" } },
  });
  assert.equal(card.audioMap.gain.depthMode, "absolute");
  assert.equal(card.audioMap.gain.depth, 0.3);
  assert.equal(card.audioMap.gain.depthFraction, undefined);
});

test("portable card validator rejects audio maps without matching input metadata", () => {
  const card = buildPortableVisualizerCard({ id: "isf:bad", source: "/bad.fs", inputs: [], audioMap: { ghost: { signal: "beat" } } });
  const result = validatePortableVisualizerCard(card);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("audio-map-input-missing:ghost"));
});

test("portable generator rejects sub-material generated mappings without reinterpreting legacy absolute maps", () => {
  const generated = buildPortableVisualizerCard({
    id: "isf:ineffective", source: "/ineffective.fs",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 1, MIN: 0, MAX: 1 }],
    audioMap: { gain: { signal: "rms", depth: 0 } },
  });
  assert.equal(generated.audioMap.gain.headroomPolicy, "auto-headroom-v1");
  assert.ok(validatePortableVisualizerCard(generated).errors.includes("audio-map-ineffective:gain"));

  const legacy = buildPortableVisualizerCard({
    id: "isf:legacy-zero", source: "/legacy-zero.fs",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 1, MIN: 0, MAX: 1 }],
    audioMap: { gain: { signal: "rms", depth: 0, depthMode: "absolute" } },
  });
  assert.equal(legacy.audioMap.gain.headroomPolicy, undefined);
  assert.equal(validatePortableVisualizerCard(legacy).ok, true, "legacy absolute contracts remain readable and are not silently rewritten");
});
