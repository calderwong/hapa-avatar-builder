import test from "node:test";
import assert from "node:assert/strict";
import { applyIsfPixelGate, repairIsfVisualizerTimeline } from "../src/domain/isf-pixel-gate.js";

const hash = (letter) => `sha256:${letter.repeat(64)}`;

test("pixel gate disables only source-hash-matched quarantine entries", () => {
  const manifest = { shaders: [
    { id: "bad", title: "Bad", source: "/bad.fs", sourceHash: hash("a"), directorEligible: true, enabled: true, shaderType: "generator" },
    { id: "changed", title: "Changed", source: "/changed.fs", sourceHash: hash("b"), directorEligible: true, enabled: true },
    { id: "good", title: "Good", source: "/good.fs", sourceHash: hash("c"), directorEligible: true, enabled: true, shaderType: "generator" },
  ] };
  const report = { schemaVersion: "gate.v1", classifications: [
    { id: "bad", sourceHash: hash("a"), classification: "unsupported-quarantine", reason: "compile-failed" },
    { id: "changed", sourceHash: hash("d"), classification: "unsupported-quarantine", reason: "old-source-failed" },
    { id: "good", sourceHash: hash("c"), classification: "hash-bound-exact-proxy", playableFrameIndices: [0] },
  ] };
  const gated = applyIsfPixelGate(manifest, report);
  assert.equal(gated.shaders[0].directorEligible, false);
  assert.equal(gated.shaders[0].runtimeEligibility, "unsupported-quarantine");
  assert.equal(gated.shaders[1].directorEligible, true);
  assert.equal(gated.shaders[1].pixelGate.status, "stale-source-hash");
});

test("timeline repair is deterministic, explicit, and leaves the input unchanged", () => {
  const source = [{ start_sec: 0, end_sec: 4, visualizer_id: "bad", visualizer_title: "Bad" }];
  const gated = applyIsfPixelGate({ shaders: [
    { id: "bad", title: "Bad", source: "/bad.fs", sourceHash: hash("a"), directorEligible: true, enabled: true, hmvRole: "visualizer" },
    { id: "good", title: "Good", source: "/good.fs", sourceHash: hash("c"), directorEligible: true, enabled: true, hmvRole: "visualizer" },
  ] }, { classifications: [
    { id: "bad", sourceHash: hash("a"), classification: "unsupported-quarantine", reason: "compile-failed" },
    { id: "good", sourceHash: hash("c"), classification: "hash-bound-exact-proxy", playableFrameIndices: [0] },
  ] });
  const repaired = repairIsfVisualizerTimeline(source, gated);
  assert.equal(repaired.ok, true);
  assert.equal(repaired.replacementCount, 1);
  assert.equal(repaired.timeline[0].visualizer_id, "good");
  assert.equal(repaired.timeline[0].shader_repair.originalId, "bad");
  assert.equal(source[0].visualizer_id, "bad");
  assert.deepEqual(repairIsfVisualizerTimeline(source, gated), repaired);
});

test("quarantined filters prefer a media-independent replacement in the same editorial role", () => {
  const source = [{ start_sec: 0, end_sec: 4, visualizer_id: "bad-filter", visualizer_title: "Bad Filter" }];
  const gated = applyIsfPixelGate({ shaders: [
    { id: "bad-filter", title: "Bad Filter", source: "/bad.fs", sourceHash: hash("a"), directorEligible: true, enabled: true, hmvRole: "filter", shaderType: "filter" },
    { id: "good-filter", title: "Good Filter", source: "/filter.fs", sourceHash: hash("b"), directorEligible: true, enabled: true, hmvRole: "filter", shaderType: "filter" },
    { id: "good-generator", title: "Good Generator", source: "/generator.fs", sourceHash: hash("c"), directorEligible: true, enabled: true, hmvRole: "filter", shaderType: "generator" },
  ] }, { classifications: [
    { id: "bad-filter", sourceHash: hash("a"), classification: "unsupported-quarantine" },
    { id: "good-filter", sourceHash: hash("b"), classification: "hash-bound-exact-proxy", playableFrameIndices: [0] },
    { id: "good-generator", sourceHash: hash("c"), classification: "hash-bound-exact-proxy", playableFrameIndices: [0] },
  ] });
  const repaired = repairIsfVisualizerTimeline(source, gated);
  assert.equal(repaired.timeline[0].visualizer_id, "good-generator");
});
