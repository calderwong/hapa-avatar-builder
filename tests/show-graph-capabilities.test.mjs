import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { adaptShowGraphWithLossReport, getShowGraphCapability, migrateShowGraphForward, showGraphCapabilityMatrix } from "../src/domain/show-graph-capabilities.js";

test("six runtime adapters publish version and capability flags", () => {
  const matrix = showGraphCapabilityMatrix();
  assert.equal(matrix.adapters.length, 6);
  assert.ok(matrix.adapters.every((row) => row.publishedAtRuntime && row.graphVersions.includes("hapa.music-viz.native-show-graph.v2")));
  assert.equal(getShowGraphCapability("echo-avatar-builder").capabilities.portableISF, "exact-browser-isf");
  assert.equal(getShowGraphCapability("hyperframes").capabilities.portableISF, "precompiled-exact");
  assert.equal(getShowGraphCapability("hyperframes").capabilities.multipass, "exact");
});

test("v1 migrates forward preserving cue IDs, locks, provenance, and decision cache lineage", () => {
  const fixture = { schemaVersion: "hapa.music-viz.native-show-graph.v1", song: { durationSeconds: 10 }, tracks: [], cues: [{ id: "cue:stable", atSeconds: 2 }], locks: [{ id: "lock:media" }], provenance: { source: "fixture" }, decisionCacheLineage: { envelopeId: "envelope:1" } };
  const { graph, receipt } = migrateShowGraphForward(fixture);
  assert.equal(graph.directorV2.cueGraph.cues[0].id, "cue:stable");
  assert.equal(graph.directorV2.locks[0].id, "lock:media");
  assert.equal(graph.directorV2.provenance.source, "fixture");
  assert.equal(graph.directorV2.decisionCacheLineage.envelopeId, "envelope:1");
  assert.equal(receipt.losses.length, 0);
});

test("unsupported or approximate features fail until visible fallbacks are approved", () => {
  const graph = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/native-show-graph.json", "utf8"));
  const blocked = adaptShowGraphWithLossReport(graph, "palmier");
  assert.equal(blocked.ok, false);
  assert.ok(blocked.losses.length);
  assert.ok(blocked.losses.every((loss) => loss.visible));
  const approved = adaptShowGraphWithLossReport(graph, "palmier", { approvedFallbacks: blocked.losses.map((loss) => ({ feature: loss.feature, fallback: loss.fallback, approvedBy: "operator", approvedAt: "2026-07-11T09:10:00Z" })) });
  assert.equal(approved.ok, true);
  assert.equal(approved.silentDegradation, false);
});
