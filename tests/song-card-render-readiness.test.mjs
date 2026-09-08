import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSongCardReadinessTelemetry,
  inspectSongCardRuntimeAdmission,
  preflightSongCardRenderReadiness,
  SONG_CARD_RENDER_READINESS_SCHEMA,
  songCardReadinessSampleTimes,
} from "../src/domain/song-card-render-readiness.js";

const sha256 = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;

function fixture(root) {
  const musicVizRoot = path.join(root, "hapa-music-viz");
  const proxyDirectory = path.join(musicVizRoot, "web", "isf", "proxies");
  fs.mkdirSync(proxyDirectory, { recursive: true });
  const assetPath = path.join(proxyDirectory, "fixture-atlas.png");
  const assetBytes = Buffer.from("deterministic-proxy-atlas");
  fs.writeFileSync(assetPath, assetBytes);
  const sourceHash = sha256("fixture-isf-source");
  const proxyRegistry = {
    schemaVersion: "hapa.music-viz.native-exact-proxies.v1",
    proxies: [{
      id: "isf:fixture-ready",
      sourceHash,
      assetPath: "/static/isf/proxies/fixture-atlas.png",
      repositoryPath: "web/isf/proxies/fixture-atlas.png",
      assetSha256: sha256(assetBytes),
      width: 4,
      height: 4,
      atlasWidth: 8,
      atlasHeight: 4,
      frameCount: 2,
      fps: 2,
      frameTimes: [0, 0.5],
      verified: true,
      frames: [
        { index: 0, lumaMax: 128, lumaRange: 96, nonBlank: true, nonFlat: true, playable: true },
        { index: 1, lumaMax: 160, lumaRange: 112, nonBlank: true, nonFlat: true, playable: true },
      ],
      playableFrameIndices: [0, 1],
    }],
  };
  const proxyRegistryPath = path.join(proxyDirectory, "native-exact-proxies.json");
  fs.writeFileSync(proxyRegistryPath, JSON.stringify(proxyRegistry));
  const portable = {
    schemaVersion: "hapa.visualizer-card.v2",
    id: "isf:fixture-ready",
    title: "Fixture Ready",
    source: { uri: "/static/isf/fixture-ready.fs", hash: sourceHash },
    stemFocus: "leadVocals",
    inputs: [
      { NAME: "gain", TYPE: "float", DEFAULT: 0.2, MIN: 0, MAX: 1 },
      { NAME: "hue", TYPE: "float", DEFAULT: 0.2, MIN: 0, MAX: 1 },
      { NAME: "direction", TYPE: "float", DEFAULT: 0.2, MIN: 0, MAX: 1 },
    ],
    audioMap: {
      gain: { stemFocus: "leadVocals", signal: "rms", depth: 0.3 },
      hue: { stemFocus: "leadVocals", signal: "palette", depth: 0.3 },
      direction: { stemFocus: "leadVocals", signal: "orbit", depth: 0.3 },
    },
    layer: { opacity: 0.8, blend: "screen", target: "program", transition: "crossfade" },
  };
  const visualizerCard = (id, startSeconds, endSeconds) => ({
    id,
    startSeconds,
    endSeconds,
    parameters: {},
    visualization: { sourceId: portable.id, card: structuredClone(portable) },
  });
  const showGraph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "song:readiness", title: "Readiness", durationSeconds: 4, lyricOverlay: { lines: [] } },
    stems: { items: [{ id: "stem:vocals", role: "Vocals", title: "Vocals" }] },
    tracks: [
      {
        id: "track-a",
        role: "media",
        cards: [{
          id: "media:generated",
          startSeconds: 0,
          endSeconds: 4,
          knockedOut: true,
          media: { id: "none", title: "Generated Visualizer", localPath: "" },
          parameters: {},
          provenance: { rendererRoute: "generated-visualizer" },
        }],
      },
      {
        id: "track-b",
        role: "visualizer",
        cards: [visualizerCard("viz:first", 0, 3), visualizerCard("viz:second", 1, 4)],
      },
    ],
    directorV2: { recipe: { visualizerMix: 0.7 } },
  };
  return { assetPath, proxyRegistry, proxyRegistryPath, showGraph };
}

const passingSignalPreflight = {
  schemaVersion: "hapa.song-card.signal-graph-preflight.v1",
  ok: true,
  errors: [],
  verifiedStemCount: 1,
  unresolvedStemBindings: [],
};

const passingMediaPreflight = {
  schemaVersion: "hapa.hyperframes.media-preflight.v1",
  ok: true,
  declaredCount: 1,
  generatedCount: 1,
  resolvedCount: 0,
  unresolvedCount: 0,
  entries: [],
  unresolved: [],
};

test("Song Card readiness proves exact overlapping shader runtime semantics once per unique proxy asset", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-render-readiness-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixtureData = fixture(root);
  const report = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: fixtureData.proxyRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    projectPath: path.join(root, "project.json"),
    signalGraphPreflight: passingSignalPreflight,
    mediaPreflight: passingMediaPreflight,
  });

  assert.equal(report.schemaVersion, SONG_CARD_RENDER_READINESS_SCHEMA);
  assert.equal(report.ok, true);
  assert.equal(report.status, "ready");
  assert.match(report.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.counts.visualizerCueCount, 2);
  assert.equal(report.counts.exactVisualizerCueCount, 2);
  assert.equal(report.counts.uniqueProxyAssetCount, 1, "repeated cues must hash one atlas once");
  assert.equal(report.counts.resolvedProxyAssetCount, 1);
  assert.equal(report.counts.overlapSignatureCount, 1);
  assert.equal(report.counts.semanticSampleCount, 3);
  assert.equal(report.checks.runtime.ok, true);
  assert.equal(report.checks.runtime.failures.length, 0);
  assert.equal(report.checks.proxyAssets.entries[0].cueCount, 2);
  assert.equal(report.checks.proxyAssets.entries[0].resolvedPath, fixtureData.assetPath);
  assert.equal(report.checks.inspection.ok, true);

  const telemetry = buildSongCardReadinessTelemetry(fixtureData.showGraph);
  assert.ok(telemetry.stems.some((stem) => stem.role === "vocals"), "leadVocals must use the canonical vocals signal resource");
  assert.equal(telemetry.stems.some((stem) => stem.role === "leadvocals"), false);
  const sampleRows = songCardReadinessSampleTimes([
    { id: "a", cueId: "a", start: 0, end: 3 },
    { id: "b", cueId: "b", start: 1, end: 4 },
  ]);
  assert.equal(sampleRows.some((row) => row.overlapSignatures.includes("a+b")), true);
});

test("Song Card readiness blocks hash drift, detached preflights, and unsupported requested shaders before rendering", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-render-readiness-fail-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixtureData = fixture(root);
  const unprovenRegistry = structuredClone(fixtureData.proxyRegistry);
  unprovenRegistry.proxies[0].verified = false;
  const unproven = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: unprovenRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    signalPreflight: passingSignalPreflight,
    mediaPreflight: passingMediaPreflight,
  });
  assert.equal(unproven.ok, false);
  assert.ok(unproven.blockers.some((row) => row.code === "exact-proxy-playback-proof-invalid"));

  const alphaOnlyRegistry = structuredClone(fixtureData.proxyRegistry);
  for (const frame of alphaOnlyRegistry.proxies[0].frames) {
    Object.assign(frame, { lumaMax: 0, lumaRange: 0, nonBlank: true, nonFlat: true, playable: true });
  }
  const alphaOnly = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: alphaOnlyRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    projectPath: path.join(root, "project.json"),
    signalPreflight: passingSignalPreflight,
    mediaPreflight: passingMediaPreflight,
  });
  assert.equal(alphaOnly.ok, false);
  const alphaOnlyBlocker = alphaOnly.blockers.find((row) => row.code === "visualizer-route-not-exact");
  assert.equal(alphaOnlyBlocker.details.reason, "exact-proxy-visible-rgb-evidence-invalid");

  const detachedVisualizers = Array.from({ length: 14 }, (_, index) => ({
    cardId: `projected:track-b:${index}`,
    sourceId: index === 0 ? "isf:linescape" : `isf:detached-${index}`,
    sourceTitle: index === 0 ? "Linescape" : `Detached ${index}`,
    startSeconds: 213 + index,
    endSeconds: 230 + index,
    reason: "portable-visualizer-card-missing-or-unbound",
  }));
  const detachedSignal = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: fixtureData.proxyRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    signalPreflight: {
      ...passingSignalPreflight,
      ok: false,
      errors: ["portable-visualizer-truth-detached"],
      detachedVisualizers,
    },
    mediaPreflight: passingMediaPreflight,
  });
  const detachedBlocker = detachedSignal.blockers.find((row) => row.code === "signal-graph-preflight-failed");
  assert.equal(detachedBlocker.cueId, "projected:track-b:0");
  assert.equal(detachedBlocker.visualizerId, "isf:linescape");
  assert.equal(detachedBlocker.details.detachedVisualizerCount, 14);
  assert.equal(detachedBlocker.details.detachedVisualizers.length, 12, "failure evidence must stay bounded");
  assert.deepEqual(detachedBlocker.details.detachedVisualizers[0], detachedVisualizers[0]);

  fs.writeFileSync(fixtureData.assetPath, "tampered-proxy-atlas");

  const hashDrift = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: fixtureData.proxyRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    signalPreflight: { ...passingSignalPreflight, ok: false, errors: ["visualizer-stem-paths-detached"] },
    mediaPreflight: { ...passingMediaPreflight, ok: false, unresolvedCount: 1, unresolved: [{ cueId: "media:missing" }] },
  });
  assert.equal(hashDrift.ok, false);
  assert.equal(hashDrift.status, "blocked");
  assert.ok(hashDrift.blockers.some((row) => row.code === "exact-proxy-asset-hash-mismatch"));
  assert.ok(hashDrift.blockers.some((row) => row.code === "signal-graph-preflight-failed"));
  assert.ok(hashDrift.blockers.some((row) => row.code === "media-preflight-failed"));
  assert.equal(hashDrift.counts.resolvedProxyAssetCount, 0);

  const unsupported = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: { proxies: [] },
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    signalPreflight: passingSignalPreflight,
    mediaPreflight: passingMediaPreflight,
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.counts.unsupportedVisualizerCueCount, 2);
  assert.ok(unsupported.blockers.some((row) => row.code === "visualizer-route-not-exact"));
  assert.ok(unsupported.blockers.some((row) => row.code === "runtime-diagnostics-present"));

  const detachedEvidence = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: fixtureData.proxyRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    mediaPreflight: passingMediaPreflight,
  });
  assert.equal(detachedEvidence.ok, false);
  assert.ok(detachedEvidence.blockers.some((row) => row.code === "signal-graph-preflight-missing"));

  const malformedEvidence = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: fixtureData.proxyRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    signalPreflight: {},
    mediaPreflight: {},
  });
  assert.equal(malformedEvidence.ok, false);
  assert.ok(malformedEvidence.blockers.some((row) => row.code === "signal-graph-preflight-failed"));
  assert.ok(malformedEvidence.blockers.some((row) => row.code === "media-preflight-failed"));

  const inconsistentEvidence = preflightSongCardRenderReadiness({
    project: {},
    showGraph: fixtureData.showGraph,
    proxyRegistry: fixtureData.proxyRegistry,
    proxyRegistryPath: fixtureData.proxyRegistryPath,
    root,
    signalPreflight: { ...passingSignalPreflight, errors: ["detached"] },
    mediaPreflight: { ...passingMediaPreflight, unresolvedCount: 1, unresolved: [{ cueId: "media:missing" }] },
  });
  assert.equal(inconsistentEvidence.ok, false);
  assert.ok(inconsistentEvidence.blockers.some((row) => row.code === "signal-graph-preflight-failed"));
  assert.ok(inconsistentEvidence.blockers.some((row) => row.code === "media-preflight-failed"));
});

test("Song Card readiness fails closed on noncanonical hashes and requested/card ID mismatches", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-render-readiness-attachment-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [label, mutate, expectedError] of [
    ["invalid hash", (visualization) => { visualization.card.source.hash = "sha256:short"; }, "source-hash"],
    ["mismatched ID", (visualization) => { visualization.sourceId = "isf:other"; }, "requested-source-id-mismatch"],
    ["missing source URI", (visualization) => { delete visualization.card.source.uri; }, "source-uri"],
  ]) {
    const fixtureData = fixture(root);
    const visualization = fixtureData.showGraph.tracks.find((track) => track.role === "visualizer").cards[0].visualization;
    mutate(visualization);
    const report = preflightSongCardRenderReadiness({
      project: {},
      showGraph: fixtureData.showGraph,
      proxyRegistry: fixtureData.proxyRegistry,
      proxyRegistryPath: fixtureData.proxyRegistryPath,
      root,
      signalGraphPreflight: passingSignalPreflight,
      mediaPreflight: passingMediaPreflight,
    });
    const blocker = report.blockers.find((row) => row.code === "portable-visualizer-attachment-invalid");
    assert.equal(report.ok, false, label);
    assert.ok(blocker, label);
    assert.ok(blocker.details.errors.includes(expectedError), label);
    assert.ok(report.blockers.some((row) => row.code === "visualizer-route-not-exact"), label);
  }
});


test("readiness admits the declared quiet-section subset without hiding unsupported candidates", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-budget-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = fixture(root);
  const cards = data.showGraph.tracks[1].cards;
  cards.push({ ...structuredClone(cards[0]), id: "viz:third" });
  for (const card of cards) { card.startSeconds = 0; card.endSeconds = 4; }
  cards[0].alwaysOn = true;
  cards[1].persistentSlotId = "always-on-2";
  data.showGraph.directorV2.visualBudgetPolicy = {
    schemaVersion: "hapa.echo.section-visual-budget.v1",
    sections: [{ id: "outro", startSeconds: 0, endSeconds: 1, energy: .2 },
      { id: "peak", startSeconds: 1, endSeconds: 4, energy: .9 }],
  };
  const run = () => preflightSongCardRenderReadiness({ project: {}, showGraph: data.showGraph,
    proxyRegistry: data.proxyRegistry, proxyRegistryPath: data.proxyRegistryPath, root,
    projectPath: path.join(root, "project.json"), signalGraphPreflight: passingSignalPreflight, mediaPreflight: passingMediaPreflight });
  const report = run();
  assert.equal(report.ok, true, JSON.stringify(report.blockers));
  assert.equal(report.checks.runtime.sampleCount, 3, "section changes must be sampled even when all cue midpoints coincide");
  assert.equal(report.checks.runtime.evaluatedLayerCount, 8, "quiet admits two; midpoint and peak interval each admit three");
  cards[2].visualization.card.source.hash = sha256("unavailable-third-shader");
  const invalid = run();
  assert.equal(invalid.ok, false, "budget suppression cannot certify an invalid source");
  assert.ok(invalid.blockers.some(row => /hash|exact|diagnostic/.test(row.code)));
});

test("admission audit independently rejects lost, extra, reordered or falsely receipted layers", async () => {
  const { expectedHyperFramesVisualAdmission } = await import("../src/domain/hyperframes-visualizer-runtime.js");
  const policy = { schemaVersion: "hapa.echo.section-visual-budget.v1", sections: [{ id: "quiet", start: 0, end: 4, energy: .2 }] };
  const show = { instances: { visualizers: [
    { id: "ordinary", start: 0, end: 4, layerOrder: 0, visualizerId: "fx-a", stemFocus: "master" },
    { id: "persistent", start: 0, end: 4, layerOrder: 2, alwaysOn: true, visualizerId: "fx-b", stemFocus: "vocals" },
    { id: "locked", start: 0, end: 4, layerOrder: 1, locked: true, visualizerId: "fx-c", stemFocus: "drums" },
  ] }, automation: { visualBudgetPolicy: policy } };
  const admission = expectedHyperFramesVisualAdmission(show, 2);
  assert.deepEqual(admission.layers.map(row => row.id), ["locked", "persistent"]);
  assert.deepEqual(admission.receipt.suppressedIds, ["ordinary"]);
  const state = { layers: structuredClone(admission.layers), visualBudget: structuredClone(admission.receipt),
    receipt: { activeCandidateIds: ["ordinary", "locked", "persistent"], drawableInstanceIds: ["locked", "persistent"] } };
  assert.deepEqual(inspectSongCardRuntimeAdmission(show, 2, state).issues, []);
  for (const [mutate, issue] of [
    [s => { s.layers.pop(); s.visualBudget.suppressedIds.push("persistent"); }, "active-layer-identity-mismatch"],
    [s => s.layers.push(show.instances.visualizers[0]), "unexpected-active-layer"],
    [s => s.layers.reverse(), "admitted-layer-order-mismatch"],
    [s => { s.layers[0].stemFocus = "bass"; }, "active-layer-identity-mismatch"],
    [s => { s.visualBudget.visualizerAllowance = 3; }, "visual-budget-receipt-mismatch"],
    [s => s.receipt.activeCandidateIds.push("ordinary"), "active-candidate-receipt-mismatch"],
    [s => s.receipt.drawableInstanceIds.pop(), "drawable-instance-receipt-mismatch"],
  ]) {
    const tampered = structuredClone(state); mutate(tampered);
    assert.ok(inspectSongCardRuntimeAdmission(show, 2, tampered).issues.includes(issue), issue);
  }
  show.instances.visualizers[0].locked = true;
  const overflow = expectedHyperFramesVisualAdmission(show, 2);
  assert.equal(overflow.receipt.status, "protected-or-reserved-overflow");
  assert.deepEqual(overflow.layers.map(row => row.id), ["ordinary", "locked", "persistent"]);
  assert.deepEqual(overflow.receipt.suppressedIds, []);
});

test("admission accounts for media, lyric and bounded accent reservations at half-open boundaries", async () => {
  const { expectedHyperFramesVisualAdmission } = await import("../src/domain/hyperframes-visualizer-runtime.js");
  const show = { instances: {
    visualizers: [0, 1, 2].map(i => ({ id: `v${i}`, start: 0, end: 4 })),
    media: [{ start: 0, end: 2 }, { start: 0, end: 2 }],
    lyrics: [{ contract: { enabled: true }, lines: [{ start: 0, end: 2 }] }],
  }, automation: { visualBudgetPolicy: { schemaVersion: "hapa.echo.section-visual-budget.v1", sections: [{ start: 0, end: 4, energy: .2 }] },
    accentTrack: { events: [0, 1, 2, 3].map(i => ({ id: `a${i}`, atSeconds: 0, durationSeconds: 2 })) } } };
  let result = expectedHyperFramesVisualAdmission(show, 1);
  assert.equal(result.receipt.reservedLayers, 6);
  assert.equal(result.layers.length, 0);
  show.instances.lyrics[0].contract.reducedMotion = true;
  result = expectedHyperFramesVisualAdmission(show, 1);
  assert.equal(result.receipt.reservedLayers, 4);
  assert.deepEqual(result.layers.map(row => row.id), ["v0", "v1"]);
  result = expectedHyperFramesVisualAdmission(show, 2);
  assert.equal(result.receipt.reservedLayers, 0);
  assert.deepEqual(result.layers.map(row => row.id), ["v0", "v1"]);
  assert.equal(expectedHyperFramesVisualAdmission(show, 4).layers.length, 0);
});
