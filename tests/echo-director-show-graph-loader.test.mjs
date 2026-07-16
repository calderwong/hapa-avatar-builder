import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  guardEchoCertifiedGraphDelivery,
  readEchoDirectorShowGraphArtifact as readEchoDirectorShowGraphArtifactRaw,
  verifyEchoExecutionInputEvidence,
  verifyEchoExecutionVisualInputEvidence,
} from "../server/echo-director-show-graph-loader.mjs";
import {
  ECHO_EXECUTION_PUBLICATION_GATE_SCHEMA,
  echoExecutionFileSha256,
  publishEchoExecutionGraph,
} from "../server/echo-execution-graph-store.mjs";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function hashValue(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
}

function parentIdentity(parent = {}) {
  return {
    runId: parent.runId || null,
    variantId: parent.directorV2?.variantId || null,
    variantHash: parent.directorV2?.variantHash || null,
  };
}

function inputEvidence(filePath) {
  const fileStat = fs.statSync(filePath);
  return {
    kind: "master",
    inputClass: "master-audio",
    id: "fixture-master",
    role: "master",
    path: path.resolve(filePath),
    contentSha256: echoExecutionFileSha256(filePath),
    statIdentityKey: [
      "hapa.render-audio-input-cache.v5",
      path.resolve(filePath),
      Number(fileStat.dev),
      Number(fileStat.ino),
      Number(fileStat.size),
      Number(fileStat.mtimeMs),
      Number(fileStat.ctimeMs),
    ].join("\u0000"),
    routeBindings: [{ uri: path.resolve(filePath), source: "fixture-absolute-path" }],
  };
}

function statBoundEvidence(filePath, category) {
  const resolvedPath = path.resolve(filePath);
  const fileStat = fs.statSync(resolvedPath);
  return {
    kind: category,
    inputClass: category,
    path: resolvedPath,
    signatureKey: `${category}:${resolvedPath}:fixture`,
    statIdentityKey: [
      `hapa.echo.${category}-input.v1`,
      resolvedPath,
      String(fileStat.dev),
      String(fileStat.ino),
      Number(fileStat.size),
      Number(fileStat.mtimeMs),
      Number(fileStat.ctimeMs),
    ].join("\u0000"),
    routeBindings: category === "visual-media"
      ? [{ uri: resolvedPath, source: "fixture-absolute-path" }]
      : [],
  };
}

const RENDERER_BUILD_SHA256 = `sha256:${"4".repeat(64)}`;
const DELIVERY_RUNTIME_BUILD_SHA256 = `sha256:${"5".repeat(64)}`;
const SERVER_DELIVERY_BUILD_SHA256 = `sha256:${"7".repeat(64)}`;
const CURRENT_REGISTRIES = Object.freeze({
  shaderCatalogSha256: `sha256:${"1".repeat(64)}`,
  proxyRegistrySha256: `sha256:${"2".repeat(64)}`,
  songRegistrySha256: `sha256:${"3".repeat(64)}`,
  songbookSha256: `sha256:${"6".repeat(64)}`,
});

function readEchoDirectorShowGraphArtifact(options = {}) {
  return readEchoDirectorShowGraphArtifactRaw({ currentRegistries: CURRENT_REGISTRIES, ...options });
}

function evidence({ parent, parentGraphSha256, parentGraphPath, visualPath = parentGraphPath, proxyPath = visualPath, cutId, cutKind, cutFingerprint }) {
  const receipt = {
    schemaVersion: "hapa.echo.runtime-stem-binding-repair.v1",
    status: "verified-no-change",
    decisionCount: 1,
    blockedDecisionCount: 0,
    repairedCardCount: 0,
    decisions: [{ decision: { status: "retained-active" } }],
    telemetry: { bundleSha256: `sha256:${"b".repeat(64)}` },
  };
  const receiptSha256 = hashValue(receipt);
  return {
    cut: {
      id: cutId,
      kind: cutKind,
      fingerprint: cutFingerprint,
      certificateSha256: `sha256:${"c".repeat(64)}`,
      readinessFingerprint: `sha256:${"e".repeat(64)}`,
    },
    parentGraphSha256,
    parentIdentity: parentIdentity(parent),
    gate: {
      schemaVersion: ECHO_EXECUTION_PUBLICATION_GATE_SCHEMA,
      ok: true,
      cutStatus: "ready-no-known-blockers",
      certificateSha256: `sha256:${"c".repeat(64)}`,
      readinessFingerprint: `sha256:${"e".repeat(64)}`,
      repairReceiptSha256: receiptSha256,
    },
    repair: { receipt, receiptSha256 },
    telemetry: {
      bundleSha256: receipt.telemetry.bundleSha256,
      analysisVersion: "fixture-v3",
      analyzerScriptSha256: `sha256:${"d".repeat(64)}`,
    },
    registries: CURRENT_REGISTRIES,
    rendererBuildSha256: RENDERER_BUILD_SHA256,
    deliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    serverDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
    certifier: {
      schemaVersion: "hapa.echo.readiness-certifier-source.v1",
      sourceSha256: `sha256:${"8".repeat(64)}`,
    },
    inputs: [inputEvidence(parentGraphPath)],
    visualInputs: [statBoundEvidence(visualPath, "visual-media")],
    proxyInputs: [statBoundEvidence(proxyPath, "proxy-atlas")],
    visualInputSummary: { visualInputCount: 1, proxyInputCount: 1 },
  };
}

const validate = ({ graph }) => ({
  ok: graph?.schemaVersion === "hapa.music-viz.native-show-graph.v2",
  reasons: graph?.schemaVersion === "hapa.music-viz.native-show-graph.v2" ? [] : ["bad-schema"],
  graphSchemaVersion: graph?.schemaVersion || null,
  graphSongId: graph?.song?.id || null,
  variantId: graph?.directorV2?.variantId || null,
  variantHash: graph?.directorV2?.variantHash || null,
  visualizerCards: 1,
});

function graph(marker, hashCharacter) {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    marker,
    song: { id: "song-loader" },
    stems: { items: [{ id: "stem:synth", stemType: "Synth", audioPath: "/tmp/synth.wav" }] },
    tracks: [{ id: "track-b", role: "visualizer", cards: [{}] }],
    directorV2: { variantId: `variant:${hashCharacter.repeat(20)}`, variantHash: hashCharacter.repeat(64) },
  };
}

function executionGraph(parent, parentGraphSha256, { marker, hashCharacter, cutId, cutKind, cutFingerprint }) {
  const result = graph(marker, hashCharacter);
  result.directorV2.executionLineage = {
    schemaVersion: "hapa.echo.execution-graph-lineage.v1",
    kind: "derived-stem-binding-repair",
    parentIdentity: parentIdentity(parent),
    parentGraphSha256,
    cutId,
    cutKind,
    cutFingerprint,
  };
  return result;
}

test("API graph loader fails closed without certification and serves the exact requested cut pointer", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-loader-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-loader";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = graph("canonical", "1");
  parent.runId = "canonical";
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent, null, 2)}\n`);
  const project = { song_id: songId };
  const cache = new Map();
  const missing = await readEchoDirectorShowGraphArtifact({ albumRoot, root, project, songId, cutId: "base", cache, validateGraph: validate, currentRendererBuildSha256: RENDERER_BUILD_SHA256, currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256, currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256 });
  assert.equal(missing.graph, null);
  assert.equal(missing.receipt.status, "preparing");
  assert.equal(missing.receipt.reason, "stem_execution_graph_not_ready");

  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const baseFingerprint = parentGraphSha256;
  const variantFingerprint = `content-v2:${"3".repeat(64)}`;
  const visualPath = path.join(root, "certified-video.bin");
  const proxyPath = path.join(root, "certified-atlas.bin");
  fs.writeFileSync(visualPath, "certified-video");
  fs.writeFileSync(proxyPath, "certified-atlas");
  const baseGraph = executionGraph(parent, parentGraphSha256, { marker: "base-execution", hashCharacter: "2", cutId: "base", cutKind: "base", cutFingerprint: baseFingerprint });
  const variantGraph = executionGraph(parent, parentGraphSha256, { marker: "variant-execution", hashCharacter: "3", cutId: "variant-blue", cutKind: "saved-variant", cutFingerprint: variantFingerprint });
  const base = publishEchoExecutionGraph({ albumRoot, songId, cutId: "base", cutKind: "base", cutFingerprint: baseFingerprint, parentGraphPath, expectedParentGraphSha256: parentGraphSha256, graph: baseGraph, project, evidence: evidence({ parent, parentGraphSha256, parentGraphPath, visualPath, proxyPath, cutId: "base", cutKind: "base", cutFingerprint: baseFingerprint }), validateGraph: validate });
  const variant = publishEchoExecutionGraph({ albumRoot, songId, cutId: "variant-blue", cutKind: "saved-variant", cutFingerprint: variantFingerprint, parentGraphPath, expectedParentGraphSha256: parentGraphSha256, graph: variantGraph, project, evidence: evidence({ parent, parentGraphSha256, parentGraphPath, visualPath, proxyPath, cutId: "variant-blue", cutKind: "saved-variant", cutFingerprint: variantFingerprint }), validateGraph: validate });
  const loadedBase = await readEchoDirectorShowGraphArtifact({ albumRoot, root, project, songId, cutId: "base", cache, validateGraph: validate, currentRendererBuildSha256: RENDERER_BUILD_SHA256, currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256, currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256 });
  const loadedVariant = await readEchoDirectorShowGraphArtifact({ albumRoot, root, project, songId, cutId: "variant-blue", cutKind: "saved-variant", cutFingerprint: variantFingerprint, cache, validateGraph: validate, currentRendererBuildSha256: RENDERER_BUILD_SHA256, currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256, currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256 });
  assert.equal(loadedBase.graph.marker, "base-execution");
  assert.equal(loadedVariant.graph.marker, "variant-execution");
  assert.equal(loadedVariant.receipt.source, "validated-derived-execution-graph");
  assert.equal(loadedVariant.receipt.sourceHash, variant.pointer.executionGraphSha256);
  assert.notEqual(base.pointer.executionGraphSha256, variant.pointer.executionGraphSha256);

  for (const [field, code] of [
    ["shaderCatalogSha256", "shader-catalog-changed-after-certification"],
    ["proxyRegistrySha256", "proxy-registry-changed-after-certification"],
    ["songRegistrySha256", "song-registry-changed-after-certification"],
    ["songbookSha256", "songbook-changed-after-certification"],
  ]) {
    const staleRegistry = await readEchoDirectorShowGraphArtifact({
      albumRoot,
      root,
      project,
      songId,
      cutId: "base",
      cache,
      validateGraph: validate,
      currentRendererBuildSha256: RENDERER_BUILD_SHA256,
      currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
      currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
      currentRegistries: { ...CURRENT_REGISTRIES, [field]: `sha256:${"9".repeat(64)}` },
    });
    assert.equal(staleRegistry.graph, null, `${field} drift must stop local render-start graph delivery`);
    assert.equal(staleRegistry.receipt.status, "preparing");
    assert.equal(staleRegistry.receipt.executionGraph.reason, "execution-registry-input-stale");
    assert.ok(staleRegistry.receipt.executionGraph.findings.some((finding) => finding.code === code));
  }
  const unboundRegistryIdentity = await readEchoDirectorShowGraphArtifact({
    albumRoot,
    root,
    project,
    songId,
    cutId: "base",
    cache,
    validateGraph: validate,
    currentRendererBuildSha256: RENDERER_BUILD_SHA256,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
    currentRegistries: null,
  });
  assert.equal(unboundRegistryIdentity.graph, null, "omitting current registry identities must fail closed");
  assert.equal(unboundRegistryIdentity.receipt.executionGraph.reason, "execution-registry-input-stale");
  assert.equal(unboundRegistryIdentity.receipt.executionGraph.findings.length, 4);

  const staleRenderer = await readEchoDirectorShowGraphArtifact({
    albumRoot,
    root,
    project,
    songId,
    cutId: "base",
    cache,
    validateGraph: validate,
    currentRendererBuildSha256: `sha256:${"5".repeat(64)}`,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  });
  assert.equal(staleRenderer.graph, null);
  assert.equal(staleRenderer.receipt.status, "preparing");
  assert.equal(staleRenderer.receipt.executionGraph.reason, "execution-renderer-build-stale");

  fs.appendFileSync(variant.graphPath, "tamper");
  const staleVariant = await readEchoDirectorShowGraphArtifact({ albumRoot, root, project, songId, cutId: "variant-blue", cutKind: "saved-variant", cutFingerprint: `content-v2:${"4".repeat(64)}`, cache, validateGraph: validate, currentRendererBuildSha256: RENDERER_BUILD_SHA256, currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256, currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256 });
  assert.equal(staleVariant.graph, null);
  assert.equal(staleVariant.receipt.status, "preparing");
  assert.equal(staleVariant.receipt.executionGraph.reason, "execution-pointer-contract-invalid");

  const tampered = await readEchoDirectorShowGraphArtifact({ albumRoot, root, project, songId, cutId: "variant-blue", cutKind: "saved-variant", cutFingerprint: variantFingerprint, cache, validateGraph: validate, currentRendererBuildSha256: RENDERER_BUILD_SHA256, currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256, currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256 });
  assert.equal(tampered.graph, null);
  assert.equal(tampered.receipt.status, "preparing");
  assert.equal(tampered.receipt.executionGraph.reason, "execution-artifact-hash-mismatch");

  fs.rmSync(visualPath);
  const missingVisual = await readEchoDirectorShowGraphArtifact({ albumRoot, root, project, songId, cutId: "base", cache, validateGraph: validate, currentRendererBuildSha256: RENDERER_BUILD_SHA256, currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256, currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256 });
  assert.equal(missingVisual.graph, null);
  assert.equal(missingVisual.receipt.status, "preparing");
  assert.equal(missingVisual.receipt.executionGraph.reason, "execution-visual-input-evidence-stale");
});

test("saved-plan loading validates the immutable parent with its canonical project and the execution graph with the saved project", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-loader-split-project-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-loader";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = graph("canonical-parent", "1");
  parent.runId = "canonical";
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent, null, 2)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const cutId = "plan:fixture-saved-cut";
  const cutKind = "saved-mint-plan";
  const cutFingerprint = `sha256:${"9".repeat(64)}`;
  const derived = executionGraph(parent, parentGraphSha256, {
    marker: "saved-plan-execution",
    hashCharacter: "2",
    cutId,
    cutKind,
    cutFingerprint,
  });
  const canonicalProject = { song_id: songId, projectIdentity: "canonical" };
  const savedProject = { song_id: songId, projectIdentity: "saved-plan" };
  const splitValidate = ({ project, graph: suppliedGraph }) => {
    const expected = suppliedGraph?.marker === "canonical-parent" ? "canonical" : "saved-plan";
    const ok = suppliedGraph?.schemaVersion === "hapa.music-viz.native-show-graph.v2"
      && project?.projectIdentity === expected;
    return {
      ok,
      reasons: ok ? [] : ["source_project_hash_mismatch"],
      graphSchemaVersion: suppliedGraph?.schemaVersion || null,
      graphSongId: suppliedGraph?.song?.id || null,
      variantId: suppliedGraph?.directorV2?.variantId || null,
      variantHash: suppliedGraph?.directorV2?.variantHash || null,
      visualizerCards: 1,
    };
  };
  publishEchoExecutionGraph({
    albumRoot,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    parentGraphPath,
    expectedParentGraphSha256: parentGraphSha256,
    graph: derived,
    project: savedProject,
    evidence: evidence({ parent, parentGraphSha256, parentGraphPath, cutId, cutKind, cutFingerprint }),
    validateGraph: splitValidate,
  });

  const blocked = await readEchoDirectorShowGraphArtifact({
    albumRoot,
    root,
    project: savedProject,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    validateGraph: splitValidate,
    currentRendererBuildSha256: RENDERER_BUILD_SHA256,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  });
  assert.equal(blocked.graph, null);
  assert.equal(blocked.receipt.reason, "compiled_graph_validation_failed");

  const loaded = await readEchoDirectorShowGraphArtifact({
    albumRoot,
    root,
    project: savedProject,
    canonicalProject,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    validateGraph: splitValidate,
    currentRendererBuildSha256: RENDERER_BUILD_SHA256,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  });
  assert.equal(loaded.receipt.source, "validated-derived-execution-graph");
  assert.equal(loaded.graph.marker, "saved-plan-execution");
});

test("saved-variant loading validates its effective profile against canonical source lineage", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-loader-saved-variant-source-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-loader";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = graph("canonical-parent", "1");
  parent.runId = "canonical";
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent, null, 2)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const cutId = "vertical-saved-cut";
  const cutKind = "saved-variant";
  const cutFingerprint = `content-v2:${"9".repeat(64)}`;
  const derived = executionGraph(parent, parentGraphSha256, {
    marker: "vertical-saved-execution",
    hashCharacter: "2",
    cutId,
    cutKind,
    cutFingerprint,
  });
  const canonicalProject = { song_id: songId, identity: "canonical", output_profile: "landscape" };
  const selectedProject = { ...canonicalProject, identity: "selected", output_profile: "vertical" };
  const splitValidate = ({ project, sourceProject, graph: suppliedGraph }) => {
    const lineageProject = sourceProject === undefined ? project : sourceProject;
    const canonicalGraph = suppliedGraph?.marker === "canonical-parent";
    const ok = suppliedGraph?.schemaVersion === "hapa.music-viz.native-show-graph.v2"
      && project?.identity === (canonicalGraph ? "canonical" : "selected")
      && lineageProject?.identity === "canonical";
    return { ok, reasons: ok ? [] : ["source-project-binding-mismatch"] };
  };
  publishEchoExecutionGraph({
    albumRoot,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    parentGraphPath,
    expectedParentGraphSha256: parentGraphSha256,
    graph: derived,
    project: selectedProject,
    sourceProject: canonicalProject,
    evidence: evidence({ parent, parentGraphSha256, parentGraphPath, cutId, cutKind, cutFingerprint }),
    validateGraph: splitValidate,
  });

  const request = {
    albumRoot,
    root,
    project: selectedProject,
    canonicalProject,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    validateGraph: splitValidate,
    currentRendererBuildSha256: RENDERER_BUILD_SHA256,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  };
  const loaded = await readEchoDirectorShowGraphArtifact({ ...request, sourceProject: canonicalProject });
  assert.equal(loaded.receipt.source, "validated-derived-execution-graph");
  assert.equal(loaded.graph.marker, "vertical-saved-execution");

  const missingSource = await readEchoDirectorShowGraphArtifact(request);
  assert.equal(missingSource.graph, null);
  assert.equal(missingSource.receipt.reason, "exact_cut_execution_graph_not_ready");
  assert.equal(missingSource.receipt.executionGraph.reason, "execution-graph-validation-failed");
  const wrongSource = await readEchoDirectorShowGraphArtifact({ ...request, sourceProject: { ...canonicalProject, identity: "wrong" } });
  assert.equal(wrongSource.graph, null);
  assert.equal(wrongSource.receipt.reason, "exact_cut_execution_graph_not_ready");
  assert.equal(wrongSource.receipt.executionGraph.reason, "execution-graph-validation-failed");
});

test("non-base cuts without stems or visualizers require their exact execution pointer", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-loader-no-stem-cut-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-loader";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = graph("canonical-no-stems", "1");
  parent.runId = "canonical-no-stems";
  parent.stems = { items: [] };
  parent.tracks = [{ id: "track-a", role: "media", cards: [] }];
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent, null, 2)}\n`);
  const project = { song_id: songId };
  const validateNoReactiveInputs = ({ graph: suppliedGraph }) => ({
    ok: suppliedGraph?.schemaVersion === "hapa.music-viz.native-show-graph.v2",
    reasons: suppliedGraph?.schemaVersion === "hapa.music-viz.native-show-graph.v2" ? [] : ["bad-schema"],
    graphSchemaVersion: suppliedGraph?.schemaVersion || null,
    graphSongId: suppliedGraph?.song?.id || null,
    variantId: suppliedGraph?.directorV2?.variantId || null,
    variantHash: suppliedGraph?.directorV2?.variantHash || null,
    visualizerCards: 0,
  });

  const base = await readEchoDirectorShowGraphArtifact({
    albumRoot,
    root,
    project,
    songId,
    cutId: "base",
    validateGraph: validateNoReactiveInputs,
    currentRendererBuildSha256: RENDERER_BUILD_SHA256,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  });
  assert.equal(base.receipt.status, "ready", "simple base graphs retain the intentional canonical preview path");
  assert.equal(base.receipt.source, "compiled-director-v2-album");
  assert.equal(base.graph.marker, "canonical-no-stems");

  const cutId = `plan:${"a".repeat(32)}`;
  const cutKind = "saved-mint-plan";
  const cutFingerprint = `sha256:${"b".repeat(64)}`;
  const missing = await readEchoDirectorShowGraphArtifact({
    albumRoot,
    root,
    project,
    canonicalProject: project,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    validateGraph: validateNoReactiveInputs,
    currentRendererBuildSha256: RENDERER_BUILD_SHA256,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  });
  assert.equal(missing.graph, null);
  assert.equal(missing.receipt.status, "preparing");
  assert.equal(missing.receipt.reason, "exact_cut_execution_graph_not_ready");
  assert.equal(missing.receipt.executionGraph.reason, "execution-pointer-missing");

  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const derived = executionGraph(parent, parentGraphSha256, {
    marker: "saved-plan-no-stems",
    hashCharacter: "2",
    cutId,
    cutKind,
    cutFingerprint,
  });
  derived.stems = { items: [] };
  derived.tracks = [{ id: "track-a", role: "media", cards: [] }];
  publishEchoExecutionGraph({
    albumRoot,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    parentGraphPath,
    expectedParentGraphSha256: parentGraphSha256,
    graph: derived,
    project,
    evidence: evidence({ parent, parentGraphSha256, parentGraphPath, cutId, cutKind, cutFingerprint }),
    validateGraph: validateNoReactiveInputs,
  });
  const stale = await readEchoDirectorShowGraphArtifact({
    albumRoot,
    root,
    project,
    canonicalProject: project,
    songId,
    cutId,
    cutKind,
    cutFingerprint: `sha256:${"c".repeat(64)}`,
    validateGraph: validateNoReactiveInputs,
    currentRendererBuildSha256: RENDERER_BUILD_SHA256,
    currentDeliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    currentServerDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  });
  assert.equal(stale.graph, null, "a stale exact-cut pointer must not fall through to the canonical base graph");
  assert.equal(stale.receipt.status, "preparing");
  assert.equal(stale.receipt.reason, "exact_cut_execution_graph_not_ready");
  assert.equal(stale.receipt.executionGraph.reason, "execution-pointer-contract-invalid");
});

test("certified API delivery is an exact no-op and fails closed on shader or registry drift", () => {
  const certifiedGraph = graph("certified", "8");
  const registries = {
    shaderCatalogSha256: `sha256:${"1".repeat(64)}`,
    proxyRegistrySha256: `sha256:${"2".repeat(64)}`,
    songRegistrySha256: `sha256:${"3".repeat(64)}`,
    songbookSha256: `sha256:${"6".repeat(64)}`,
    rendererBuildSha256: RENDERER_BUILD_SHA256,
    deliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
    serverDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
  };
  const graphResult = {
    graph: certifiedGraph,
    receipt: {
      source: "validated-derived-execution-graph",
      sourceHash: `sha256:${"8".repeat(64)}`,
      executionGraph: {
        registries,
        rendererBuildSha256: RENDERER_BUILD_SHA256,
        deliveryRuntimeBuildSha256: DELIVERY_RUNTIME_BUILD_SHA256,
        serverDeliveryBuildSha256: SERVER_DELIVERY_BUILD_SHA256,
      },
    },
  };
  const noOp = guardEchoCertifiedGraphDelivery({
    graphResult,
    shaderRepair: { graph: structuredClone(certifiedGraph), replacements: [], hydrations: [] },
    currentRegistries: registries,
  });
  assert.equal(noOp.ok, true);
  assert.strictEqual(noOp.shaderRepair.graph, certifiedGraph, "API must deliver the exact certified graph object after a no-op audit");

  const changed = structuredClone(certifiedGraph);
  changed.marker = "post-certified-mutation";
  const mutated = guardEchoCertifiedGraphDelivery({
    graphResult,
    shaderRepair: { graph: changed, replacements: [], hydrations: [] },
    currentRegistries: registries,
  });
  assert.equal(mutated.ok, false);
  assert.equal(mutated.graphResult.graph, null);
  assert.ok(mutated.reasons.includes("certified-graph-requires-runtime-shader-repair"));

  const drifted = guardEchoCertifiedGraphDelivery({
    graphResult,
    shaderRepair: { graph: structuredClone(certifiedGraph), replacements: [], hydrations: [] },
    currentRegistries: { ...registries, shaderCatalogSha256: `sha256:${"9".repeat(64)}` },
  });
  assert.equal(drifted.ok, false);
  assert.ok(drifted.reasons.includes("shader-catalog-changed-after-certification"));

  const rendererDrifted = guardEchoCertifiedGraphDelivery({
    graphResult,
    shaderRepair: { graph: structuredClone(certifiedGraph), replacements: [], hydrations: [] },
    currentRegistries: { ...registries, rendererBuildSha256: `sha256:${"7".repeat(64)}` },
  });
  assert.equal(rendererDrifted.ok, false);
  assert.ok(rendererDrifted.reasons.includes("renderer-build-changed-after-certification"));

  const deliveryDrifted = guardEchoCertifiedGraphDelivery({
    graphResult,
    shaderRepair: { graph: structuredClone(certifiedGraph), replacements: [], hydrations: [] },
    currentRegistries: { ...registries, deliveryRuntimeBuildSha256: `sha256:${"7".repeat(64)}` },
  });
  assert.equal(deliveryDrifted.ok, false);
  assert.ok(deliveryDrifted.reasons.includes("delivery-runtime-build-changed-after-certification"));
});

test("execution input freshness uses the certified stat fast path, bounds fallback proofs, and rejects hash-time mutation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-input-freshness-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "stem.bin");
  fs.writeFileSync(inputPath, "certified-stem-bytes");
  const evidence = inputEvidence(inputPath);
  let hashCalls = 0;
  const cache = new Map();
  const exact = await verifyEchoExecutionInputEvidence([evidence], {
    cache,
    hashFile: async () => {
      hashCalls += 1;
      return evidence.contentSha256;
    },
  });
  assert.equal(exact.ok, true);
  assert.equal(hashCalls, 0, "an exact certified stat identity must not reread full stems on a cold API request");

  for (let index = 0; index < 270; index += 1) {
    const seconds = 1_800_000_000 + index;
    fs.utimesSync(inputPath, seconds, seconds);
    const proof = await verifyEchoExecutionInputEvidence([evidence], {
      cache,
      hashFile: async () => {
        hashCalls += 1;
        return evidence.contentSha256;
      },
    });
    assert.equal(proof.ok, true);
  }
  assert.ok(cache.size <= 256, `execution input proof cache grew beyond its bound: ${cache.size}`);

  fs.utimesSync(inputPath, 1_900_000_000, 1_900_000_000);
  const changedDuringHash = await verifyEchoExecutionInputEvidence([evidence], {
    cache: new Map(),
    hashFile: async (filePath) => {
      fs.appendFileSync(filePath, "changed");
      return evidence.contentSha256;
    },
  });
  assert.equal(changedDuringHash.ok, false);
  assert.equal(changedDuringHash.findings[0].code, "execution-input-changed-during-content-proof");
});

test("certified visual and proxy inputs fail closed on replacement or deletion with a bounded proof cache", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-visual-input-freshness-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const visualPath = path.join(root, "visual.bin");
  const proxyPath = path.join(root, "proxy.bin");
  fs.writeFileSync(visualPath, "certified-visual");
  fs.writeFileSync(proxyPath, "certified-proxy");
  const visual = statBoundEvidence(visualPath, "visual-media");
  const proxy = statBoundEvidence(proxyPath, "proxy-atlas");
  const cache = new Map();
  const exact = await verifyEchoExecutionVisualInputEvidence({ visualInputs: [visual, visual], proxyInputs: [proxy] }, { cache });
  assert.equal(exact.ok, true);
  assert.ok(cache.size <= 2, "duplicate visual evidence should share one proof row");

  fs.renameSync(visualPath, `${visualPath}.old`);
  fs.writeFileSync(visualPath, "certified-visual");
  const replaced = await verifyEchoExecutionVisualInputEvidence({ visualInputs: [visual], proxyInputs: [proxy] }, { cache });
  assert.equal(replaced.ok, false);
  assert.equal(replaced.findings[0].code, "execution-visual-input-stat-changed");

  fs.rmSync(proxyPath);
  const deleted = await verifyEchoExecutionVisualInputEvidence({ visualInputs: [], proxyInputs: [proxy] }, { cache });
  assert.equal(deleted.ok, false);
  assert.equal(deleted.findings[0].code, "execution-visual-input-unreadable");
});
