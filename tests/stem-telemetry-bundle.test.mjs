import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

test("Dear Papa offline stem bundle is complete and is the shared preview/export truth", () => {
  const bundlePath = "./work/dear-papa-stem-telemetry/stem-telemetry.json";
  const graphPath = "./work/dear-papa-stem-telemetry/native-show-graph.json";
  if (!fs.existsSync(bundlePath) || !fs.existsSync(graphPath)) return;
  const bytes = fs.readFileSync(bundlePath);
  const bundle = JSON.parse(bytes);
  const graph = JSON.parse(fs.readFileSync(graphPath));
  assert.equal(bundle.canonicalStemCount, 12);
  assert.equal(bundle.usableStemCount, 12);
  assert.equal(bundle.masterMix.inputRoles.length, 12);
  assert.ok(bundle.stems.every((stem) => stem.frames.length > 2500 && stem.audioHash.length === 64));
  assert.ok(bundle.stems.every((stem) => stem.frames.every((frame) => frame.bands && typeof frame.silence === "boolean")));
  assert.equal(bundle.renderTruth.preview, "this-bundle");
  assert.equal(bundle.renderTruth.export, "this-bundle");
  assert.equal(bundle.renderTruth.runtimeWebAudio, false);
  assert.equal(graph.stems.telemetryBundle.hash, crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.equal(graph.stems.runtimeWebAudioTruth, false);
});
