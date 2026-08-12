import assert from "node:assert/strict";
import test from "node:test";
import {
  projectEchoRuntimeShaderRepairProvenance,
  repairEchoRuntimeShaderGraph,
  repairEchoRuntimeVisualizerTimeline,
} from "../src/domain/echo-runtime-shader-repair.js";

const SOURCE_HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ASSET_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function finalRenderReadyShader(id, { title = id, hmvRole = "atmosphere" } = {}) {
  return {
    id,
    title,
    source: `visualizers/${id}.fs`,
    sourceHash: SOURCE_HASH,
    hmvRole,
    enabled: true,
    directorEligible: true,
    pixelGate: {
      status: "source-hash-verified",
      classification: "hash-bound-exact-proxy",
      compileAttempted: true,
      drawAttempted: true,
      playableFrameIndices: [0],
    },
    hyperframesProxy: {
      verified: true,
      sourceHash: SOURCE_HASH,
      assetSha256: ASSET_HASH,
      assetPath: `/proxies/${id}.mp4`,
      width: 640,
      height: 360,
      frameCount: 30,
      fps: 30,
    },
    nativeRoute: { nativeKey: id, proxy: { path: `/proxies/${id}.mp4` } },
    inputs: [],
  };
}

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

test("runtime repair replaces every catalog-missing or final-render-unready Director reference", () => {
  const eligible = finalRenderReadyShader("isf:verified", { hmvRole: "energy" });
  const unready = {
    ...finalRenderReadyShader("isf:unready", { hmvRole: "energy" }),
    hyperframesProxy: { verified: false },
  };
  const catalog = [eligible, unready];
  const timeline = repairEchoRuntimeVisualizerTimeline([
    { visualizer_id: "isf:unready", visualizer_title: "Unready" },
    { visualizer_id: "isf:removed", visualizer_title: "Removed" },
  ], catalog);
  assert.deepEqual(timeline.timeline.map((row) => row.visualizer_id), ["isf:verified", "isf:verified"]);
  assert.deepEqual(timeline.replacements.map((replacement) => replacement.reason), [
    "hyperframes-exact-proxy-missing-or-unverified",
    "shader-not-in-current-final-render-catalog",
  ]);

  const graph = repairEchoRuntimeShaderGraph({
    tracks: [{
      id: "track-b",
      role: "visualizer",
      cards: [{
        id: "card:b:removed",
        startSeconds: 0,
        endSeconds: 2,
        visualization: { sourceId: "isf:removed" },
      }],
    }],
  }, catalog);
  assert.equal(graph.graph.tracks[0].cards[0].visualization.sourceId, "isf:verified");
  assert.equal(graph.replacements[0].reason, "shader-not-in-current-final-render-catalog");
});
