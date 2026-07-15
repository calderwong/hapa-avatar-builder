import assert from "node:assert/strict";
import test from "node:test";
import { projectEchoRuntimeShaderRepairProvenance } from "../src/domain/echo-runtime-shader-repair.js";

test("published shader repair projection restores only bounded per-card lineage", () => {
  const graph = {
    tracks: [{
      id: "track-b",
      role: "visualizer",
      cards: [{
        id: "card:b:1",
        sourceCueIndex: 1,
        visualization: { sourceId: "isf:replacement" },
        provenance: { treatmentId: "fixture" },
      }],
    }],
  };
  const projected = projectEchoRuntimeShaderRepairProvenance(graph, {
    replacements: [{
      rowIndex: 1,
      reason: "pixel-gate-quarantine",
      originalId: "isf:quarantined",
      originalTitle: "Quarantined",
      replacementId: "isf:replacement",
      replacementTitle: "Replacement",
      nonDestructive: true,
      aggregateReceiptPayload: { mustNotReachCard: true },
    }],
  });

  assert.equal(projected.projectedCount, 1);
  assert.equal(graph.tracks[0].cards[0].provenance.runtimeShaderRepair, undefined);
  assert.deepEqual(projected.graph.tracks[0].cards[0].provenance.runtimeShaderRepair, {
    schemaVersion: "hapa.echo.runtime-shader-repair.v1",
    reason: "pixel-gate-quarantine",
    originalId: "isf:quarantined",
    originalTitle: "Quarantined",
    replacementId: "isf:replacement",
    replacementTitle: "Replacement",
    nonDestructive: true,
  });
  assert.equal(projected.graph.tracks[0].cards[0].provenance.runtimeShaderRepair.aggregateReceiptPayload, undefined);
});

test("published shader repair projection requires exact cue and executable replacement identity", () => {
  const graph = {
    tracks: [{
      id: "track-b",
      role: "visualizer",
      cards: [{ sourceCueIndex: 2, visualization: { sourceId: "isf:other" } }],
    }],
  };
  const projected = projectEchoRuntimeShaderRepairProvenance(graph, {
    replacements: [{
      rowIndex: 2,
      originalId: "isf:quarantined",
      replacementId: "isf:replacement",
      nonDestructive: true,
    }],
  });
  assert.equal(projected.projectedCount, 0);
  assert.equal(projected.graph, graph);
});
