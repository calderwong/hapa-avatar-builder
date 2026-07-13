import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  VISUALIZER_RENDERER_RECEIPT_SCHEMA,
  VISUALIZER_RENDERER_READINESS,
  VISUALIZER_RENDERER_STATUSES,
  VISUALIZER_RENDERER_TRUTH_SCHEMA,
  resolveVisualizerRendererTruth,
  visualizerRendererTruthMatrix,
  buildVisualizerRendererTruthReceipt,
  validateVisualizerRendererTruth,
} from "../src/domain/visualizer-renderer-capability.js";
import { compileHyperFramesShow } from "../src/domain/hyperframes-show-compiler.js";
import {
  RELEASE_RENDERER_TRUTH_SCHEMA,
  buildReleaseManifest,
  createNativeShowCard,
  verifyReleaseManifest,
} from "../src/domain/release-package.js";

const fixture = JSON.parse(fs.readFileSync("tests/fixtures/visualizer-renderer-truth.json", "utf8"));

function cueCard(portableCard = fixture.portableCard) {
  const card = structuredClone(fixture.cueCard);
  card.visualization.card = structuredClone(portableCard);
  return card;
}

function fixtureShowGraph(portableCard = fixture.portableCard) {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "song:truth-fixture", title: "Truth Fixture", durationSeconds: 12, lyricOverlay: { lines: [] } },
    tracks: [{ id: "track-b", cards: [cueCard(portableCard)] }],
    stems: { items: [] },
    directorV2: {
      treatmentId: "treatment:truth-fixture",
      variantId: "variant:truth-fixture",
      variantHash: "fixture-hash",
      rendererSupport: { hyperframes: { route: "exact-native", status: "graph-wide-claim-must-not-override-card" } },
    },
  };
}

test("one portable card produces one canonical exact/approximation/unsupported matrix", () => {
  const card = cueCard();
  const matrix = visualizerRendererTruthMatrix(card);
  assert.deepEqual(
    Object.fromEntries(Object.entries(matrix).map(([rendererId, row]) => [rendererId, row.status])),
    fixture.expectedStatus,
  );
  for (const row of Object.values(matrix)) {
    assert.equal(row.schemaVersion, VISUALIZER_RENDERER_TRUTH_SCHEMA);
    assert.equal(row.requested.id, fixture.portableCard.id);
    assert.equal(row.requested.sourceHash, fixture.portableCard.source.hash);
    assert.deepEqual(row.requested.cueBoundary, { startSeconds: 5, endSeconds: 9 });
    assert.ok(VISUALIZER_RENDERER_STATUSES.includes(row.status));
    assert.ok(VISUALIZER_RENDERER_READINESS.includes(row.readiness));
    assert.ok(Array.isArray(row.fidelityLoss));
    if (["approximation", "fallback"].includes(row.status)) {
      assert.ok(row.substitute?.id);
      assert.ok(row.substitute?.route);
    }
    assert.equal(row.visible, true);
    assert.equal(row.silentDefault, false);
    assert.deepEqual(validateVisualizerRendererTruth(row), { ok: true, errors: [] });
  }
  assert.equal(matrix["music-viz-native"].substitute.id, "audio-bars");
  assert.ok(matrix["music-viz-native"].fidelityLoss.includes("exact-isf-source"));
  assert.equal(matrix["dear-papa-native"].reason, "renderer-route-pending");
  assert.doesNotMatch(JSON.stringify(matrix), /Spectrum Nebula|Plasma Sparkle/i);
});

test("runtime failure becomes a named fallback and intent keys become unsupported, never defaults", () => {
  const card = cueCard();
  const fallback = resolveVisualizerRendererTruth(card, "echo-avatar-builder", {
    runtimeStatus: "compile-error",
    fallback: { id: "held:last-good:isf", title: "Held last-good frame", route: "held-last-good-frame" },
  });
  assert.equal(fallback.status, "fallback");
  assert.equal(fallback.reason, "compile-error");
  assert.equal(fallback.substitute.id, "held:last-good:isf");
  assert.ok(fallback.fidelityLoss.includes("requested-shader-not-presented"));
  assert.deepEqual(fallback.requested.cueBoundary, { startSeconds: 5, endSeconds: 9 });

  const intentCard = cueCard();
  intentCard.visualization.card.rendererSupport.musicVizNative.nativeKey = "intent-unknown-title";
  const unsupported = resolveVisualizerRendererTruth(intentCard, "music-viz-native");
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.reason, "noncanonical-native-intent-key");
  assert.equal(unsupported.substitute, null);
});

test("HyperFrames requires a verified proxy and cannot inherit a graph-wide exact claim", () => {
  const graph = fixtureShowGraph();
  const compiled = compileHyperFramesShow({ showGraph: graph, telemetry: {}, project: {}, fps: 30 });
  const layer = compiled.instances.visualizers[0];
  assert.equal(resolveVisualizerRendererTruth(graph.tracks[0].cards[0], "hyperframes").status, "exact", "the portable card only declares capability");
  assert.equal(layer.rendererTruth.status, "unsupported", "the executable layer needs a hash-bound proxy asset");
  assert.equal(layer.rendererTruth.reason, "exact-proxy-undeclared");
  assert.equal(layer.rendererRoute, "unsupported");
  assert.equal(layer.nativeRoute, null);

  const undeclaredCard = structuredClone(fixture.portableCard);
  delete undeclaredCard.rendererSupport.hyperframes;
  const undeclaredGraph = fixtureShowGraph(undeclaredCard);
  const undeclared = compileHyperFramesShow({ showGraph: undeclaredGraph, telemetry: {}, project: {}, fps: 30 }).instances.visualizers[0];
  assert.equal(undeclared.rendererTruth.status, "unsupported");
  assert.equal(undeclared.rendererTruth.reason, "exact-proxy-undeclared");
  assert.equal(undeclared.rendererTruth.substitute, null);
});

test("release manifest and Native Show Card preserve the same per-cue renderer receipt", () => {
  const showGraph = fixtureShowGraph();
  const expectedReceipt = buildVisualizerRendererTruthReceipt(showGraph.tracks[0].cards[0]);
  const manifest = buildReleaseManifest({
    song: showGraph.song,
    approvedVariant: {
      variantId: "variant:truth-fixture",
      technicalApprovalReceipt: "technical.json",
      creativeApprovalReceipt: "creative.json",
    },
    artifacts: [{ role: "master", path: "master.mp4", sha256: "master-hash", transform: { kind: "identity" } }],
    graphRef: "graph.json",
    contextRef: "context.json",
    showGraph,
    rights: { licensingStatus: "operator-authored", consentStatus: "operator-approved", attribution: [] },
  });
  assert.equal(manifest.rendererTruth.schemaVersion, RELEASE_RENDERER_TRUTH_SCHEMA);
  assert.equal(manifest.rendererTruth.cueReceiptCount, 1);
  assert.equal(manifest.rendererTruth.receipts[0].schemaVersion, VISUALIZER_RENDERER_RECEIPT_SCHEMA);
  assert.deepEqual(manifest.rendererTruth.receipts[0], expectedReceipt);
  assert.equal(manifest.rendererTruth.allStatesVisible, true);
  assert.equal(manifest.rendererTruth.silentDefaultCount, 0);
  assert.equal(manifest.publishGate.rendererTruthVisible, true);
  assert.equal(manifest.publishGate.allowed, true);

  const verification = verifyReleaseManifest(manifest, {
    "master.mp4": { exists: true, sha256: "master-hash" },
    "graph.json": { exists: true },
    "context.json": { exists: true },
  });
  assert.equal(verification.ok, true);
  assert.equal(verification.rendererTruthValid, true);
  const showCard = createNativeShowCard(manifest, { manifestPath: "release.json", posterPath: "poster.jpg" });
  assert.deepEqual(showCard.rendererTruth, {
    schemaVersion: RELEASE_RENDERER_TRUTH_SCHEMA,
    status: "declared",
    cueReceiptCount: 1,
    allStatesVisible: true,
    silentDefaultCount: 0,
  });
  assert.equal(showCard.publishStatus, "publishable");
});

test("release without renderer receipts remains technically inspectable but cannot publish", () => {
  const manifest = buildReleaseManifest({
    song: { id: "song:no-truth", title: "No Truth" },
    approvedVariant: { variantId: "variant:no-truth", technicalApprovalReceipt: "t", creativeApprovalReceipt: "c" },
    artifacts: [],
    graphRef: "graph.json",
    contextRef: "context.json",
    rights: { licensingStatus: "known", consentStatus: "known", attribution: [] },
  });
  assert.equal(manifest.rendererTruth.status, "not-supplied");
  assert.equal(manifest.publishGate.rendererTruthVisible, false);
  assert.equal(manifest.publishGate.allowed, false);
  const verification = verifyReleaseManifest(manifest, { "graph.json": { exists: true }, "context.json": { exists: true } });
  assert.equal(verification.ok, true);
  assert.equal(verification.rendererTruthValid, false);
  assert.equal(verification.publishAllowed, false);
});
