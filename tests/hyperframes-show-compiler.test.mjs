import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileHyperFramesShow, inspectHyperFramesShow } from "../src/domain/hyperframes-show-compiler.js";

test("HyperFrames compiler emits pinned templated executable shows", () => {
  const graph = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/native-show-graph.json", "utf8"));
  const telemetry = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/stem-telemetry.json", "utf8"));
  const project = JSON.parse(fs.readFileSync("data/music-video-projects/dear-papa-song-dear-papa-video-project.json", "utf8"));
  const a = compileHyperFramesShow({ showGraph: graph, telemetry, project, fps: 30 });
  const b = compileHyperFramesShow({ showGraph: graph, telemetry, project, fps: 30 });
  assert.deepEqual(a, b);
  assert.equal(a.deterministicPolicy.runtimeDecisionCalls, false);
  assert.equal(a.deterministicPolicy.runtimeAudioAnalysis, false);
  assert.equal(a.deterministicPolicy.randomCalls, false);
  assert.ok(Object.keys(a.templates).length < a.instances.media.length + a.instances.visualizers.length);
  assert.ok(a.stemFrames.stems.every((stem) => stem.frames.length > 1));
  assert.ok(a.instances.visualizers.every((layer) => layer.stemFocus && layer.audioSignal && Array.isArray(layer.inputs) && Array.isArray(layer.unsupported)));
  assert.ok(a.instances.visualizers.every((layer) => layer.visualizerMix > 0), "omitting visualizerMix must use the recipe/default instead of coercing null to zero");
  assert.ok(a.instances.visualizers.every((layer) => layer.effectiveOpacity > 0), "default-compiled visualizer layers must remain visible");
  assert.ok(inspectHyperFramesShow(a).ok);
});
