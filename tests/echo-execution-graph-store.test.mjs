import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ECHO_EXECUTION_LEGACY_LOCK_STALE_MS,
  ECHO_EXECUTION_GRAPH_POINTER_SCHEMA,
  ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA,
  ECHO_EXECUTION_PUBLICATION_GATE_SCHEMA,
  echoExecutionFileSha256,
  echoExecutionPointerToken,
  publishEchoExecutionGraph,
  resolveEchoExecutionGraph,
} from "../server/echo-execution-graph-store.mjs";
import crypto from "node:crypto";

const validate = ({ graph }) => ({
  ok: graph?.schemaVersion === "hapa.music-viz.native-show-graph.v2",
  reasons: graph?.schemaVersion === "hapa.music-viz.native-show-graph.v2" ? [] : ["bad-schema"],
  variantId: graph?.directorV2?.variantId || null,
  variantHash: graph?.directorV2?.variantHash || null,
  visualizerCards: 1,
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function hashValue(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
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

const baseCutFingerprint = `sha256:${"8".repeat(64)}`;

function parentGraph(songId, marker = "1") {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    runId: `parent:${marker}`,
    song: { id: songId },
    directorV2: { variantId: `variant:${marker.repeat(20)}`, variantHash: marker.repeat(64) },
  };
}

function parentIdentity(parent = {}) {
  return {
    runId: parent.runId || null,
    variantId: parent.directorV2?.variantId || null,
    variantHash: parent.directorV2?.variantHash || null,
  };
}

function derivedGraph({ songId, parent, parentGraphSha256, cutId = "base", cutKind = "base", cutFingerprint = baseCutFingerprint, marker = "2" }) {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    runId: `derived:${marker}`,
    song: { id: songId },
    directorV2: {
      variantId: `variant:${marker.repeat(20)}`,
      variantHash: marker.repeat(64),
      executionLineage: {
        schemaVersion: "hapa.echo.execution-graph-lineage.v1",
        kind: "derived-stem-binding-repair",
        parentIdentity: parentIdentity(parent),
        parentGraphSha256,
        cutId,
        cutKind,
        cutFingerprint,
      },
    },
  };
}

function validEvidence({
  parent,
  parentGraphSha256,
  cutId = "base",
  cutKind = "base",
  cutFingerprint = baseCutFingerprint,
  marker = "one",
  inputPath,
} = {}) {
  const repairReceipt = {
    schemaVersion: "hapa.echo.runtime-stem-binding-repair.v1",
    status: "repaired",
    decisionCount: 1,
    blockedDecisionCount: 0,
    repairedCardCount: 1,
    decisions: [{ decision: { status: "rebound-active-isolated-stem" } }],
    telemetry: { bundleSha256: `sha256:${"b".repeat(64)}` },
  };
  const receiptSha256 = hashValue(repairReceipt);
  return {
    marker,
    cut: {
      id: cutId,
      kind: cutKind,
      fingerprint: cutFingerprint,
      certificateSha256: `sha256:${"a".repeat(64)}`,
      readinessFingerprint: `sha256:${"c".repeat(64)}`,
    },
    parentGraphSha256,
    parentIdentity: parentIdentity(parent),
    gate: {
      schemaVersion: ECHO_EXECUTION_PUBLICATION_GATE_SCHEMA,
      ok: true,
      cutStatus: "ready-no-known-blockers",
      certificateSha256: `sha256:${"a".repeat(64)}`,
      readinessFingerprint: `sha256:${"c".repeat(64)}`,
      repairReceiptSha256: receiptSha256,
    },
    repair: { receipt: repairReceipt, receiptSha256 },
    telemetry: {
      bundleSha256: repairReceipt.telemetry.bundleSha256,
      analysisVersion: "fixture-v3",
      analyzerScriptSha256: `sha256:${"d".repeat(64)}`,
    },
    registries: {
      shaderCatalogSha256: `sha256:${"1".repeat(64)}`,
      proxyRegistrySha256: `sha256:${"2".repeat(64)}`,
      songRegistrySha256: `sha256:${"3".repeat(64)}`,
      songbookSha256: `sha256:${"5".repeat(64)}`,
    },
    rendererBuildSha256: `sha256:${"4".repeat(64)}`,
    deliveryRuntimeBuildSha256: `sha256:${"6".repeat(64)}`,
    serverDeliveryBuildSha256: `sha256:${"7".repeat(64)}`,
    certifier: {
      schemaVersion: "hapa.echo.readiness-certifier-source.v1",
      sourceSha256: `sha256:${"8".repeat(64)}`,
    },
    inputs: inputPath ? [inputEvidence(inputPath)] : [],
    visualInputs: inputPath ? [statBoundEvidence(inputPath, "visual-media")] : [],
    proxyInputs: inputPath ? [statBoundEvidence(inputPath, "proxy-atlas")] : [],
    visualInputSummary: {
      visualInputCount: inputPath ? 1 : 0,
      proxyInputCount: inputPath ? 1 : 0,
    },
  };
}

function noOpEvidence(options = {}) {
  const result = validEvidence(options);
  const bundleSha256 = `sha256:${"9".repeat(64)}`;
  result.repair.receipt = {
    schemaVersion: "hapa.echo.runtime-stem-binding-repair.v1",
    status: "verified-no-change",
    policy: { id: "no-stem-binding-repair-required", version: 1 },
    decisionCount: 0,
    blockedDecisionCount: 0,
    repairedCardCount: 0,
    decisions: [],
    telemetry: {
      bundleSha256,
      truthStatus: "not-required-no-audio-reactive-stem-bindings",
    },
  };
  const receiptSha256 = hashValue(result.repair.receipt);
  result.repair.receiptSha256 = receiptSha256;
  result.gate.repairReceiptSha256 = receiptSha256;
  result.telemetry = {
    cacheIdentitySha256: bundleSha256,
    bundleSha256,
    analyzerScriptSha256: `sha256:${"d".repeat(64)}`,
    schemaVersion: "hapa.echo.no-stem-telemetry-proof.v1",
    analysisVersion: "not-required",
    truthStatus: "not-required-no-audio-reactive-stem-bindings",
    fps: 0,
    sampleRate: 0,
  };
  return result;
}

function publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph, cutId = "base", cutKind = "base", cutFingerprint = baseCutFingerprint, marker = "one", expectedCurrentPointerSha256, validateGraph = validate }) {
  return {
    albumRoot,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    parentGraphPath,
    expectedParentGraphSha256: parentGraphSha256,
    ...(expectedCurrentPointerSha256 !== undefined ? { expectedCurrentPointerSha256 } : {}),
    graph,
    project: {},
    evidence: validEvidence({ parent, parentGraphSha256, cutId, cutKind, cutFingerprint, marker, inputPath: parentGraphPath }),
    validateGraph,
  };
}

function publishedLockFixture(t, { suffix, parentMarker = "1", graphMarker = "2" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `echo-execution-lock-${suffix}-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = `song-lock-${suffix}`;
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, parentMarker);
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: graphMarker });
  const first = publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph }));
  return {
    root,
    albumRoot,
    songId,
    parentGraphPath,
    parent,
    parentGraphSha256,
    graph,
    lockPath: path.join(path.dirname(first.pointerPath), "current.lock"),
    nextArgs: () => publicationArgs({
      albumRoot,
      songId,
      parentGraphPath,
      parent,
      parentGraphSha256,
      expectedCurrentPointerSha256: echoExecutionPointerToken({ albumRoot, songId }),
      graph,
      marker: `next-${suffix}`,
    }),
  };
}

function publisherLockMetadata({
  pid = process.pid,
  token = crypto.randomBytes(32).toString("hex"),
  ownerStartedAt = new Date(Date.now() - (process.uptime() * 1_000)).toISOString(),
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA,
    pid,
    ownerStartedAt,
    createdAt,
    token,
  };
}

test("publishes an append-only execution graph and activates it only after parent/output/receipt hashes agree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-one";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId);
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const originalParentBytes = fs.readFileSync(parentGraphPath);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const derived = derivedGraph({ songId, parent, parentGraphSha256 });
  const publication = publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph: derived }));
  assert.equal(publication.pointer.schemaVersion, ECHO_EXECUTION_GRAPH_POINTER_SCHEMA);
  assert.deepEqual(fs.readFileSync(parentGraphPath), originalParentBytes, "canonical compiler output must not be overwritten");
  const resolved = resolveEchoExecutionGraph({
    albumRoot,
    songId,
    parentGraphPath,
    parentGraphSha256,
    cutKind: "base",
    cutFingerprint: baseCutFingerprint,
    project: {},
    validateGraph: validate,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.graph.runId, "derived:2");
  assert.equal(resolved.receipt.canonicalGraphMutated, false);

  fs.writeFileSync(parentGraphPath, `${JSON.stringify({ ...parent, changed: true })}\n`);
  const stale = resolveEchoExecutionGraph({
    albumRoot,
    songId,
    parentGraphPath,
    parentGraphSha256: echoExecutionFileSha256(parentGraphPath),
    cutKind: "base",
    cutFingerprint: baseCutFingerprint,
    project: {},
    validateGraph: validate,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "execution-parent-graph-stale");
});

test("publication and resolution keep effective project validation separate from canonical source lineage", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-source-project-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-source-project";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId);
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const cutId = "vertical-cut";
  const cutKind = "saved-variant";
  const cutFingerprint = `content-v2:${"6".repeat(64)}`;
  const graph = derivedGraph({ songId, parent, parentGraphSha256, cutId, cutKind, cutFingerprint });
  const project = { identity: "effective-vertical" };
  const sourceProject = { identity: "canonical-source" };
  const splitValidate = ({ project: effective, sourceProject: source, graph: suppliedGraph }) => {
    const ok = suppliedGraph?.schemaVersion === "hapa.music-viz.native-show-graph.v2"
      && effective?.identity === "effective-vertical"
      && source?.identity === "canonical-source";
    return { ok, reasons: ok ? [] : ["source-project-binding-mismatch"] };
  };
  const args = publicationArgs({
    albumRoot,
    songId,
    parentGraphPath,
    parent,
    parentGraphSha256,
    graph,
    cutId,
    cutKind,
    cutFingerprint,
    validateGraph: splitValidate,
  });
  args.project = project;
  args.sourceProject = sourceProject;
  publishEchoExecutionGraph(args);

  const resolution = {
    albumRoot,
    songId,
    cutId,
    cutKind,
    cutFingerprint,
    parentGraphPath,
    parentGraphSha256,
    project,
    validateGraph: splitValidate,
  };
  assert.equal(resolveEchoExecutionGraph({ ...resolution, sourceProject }).ok, true);
  assert.equal(resolveEchoExecutionGraph(resolution).reason, "execution-graph-validation-failed");
  assert.equal(resolveEchoExecutionGraph({ ...resolution, sourceProject: { identity: "wrong-source" } }).reason, "execution-graph-validation-failed");
});

test("execution publication rejects a graph routed to a different parent song", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-parent-song-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-parent-binding";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const registryAudioId = "registry-audio-parent";
  const parent = parentGraph(registryAudioId);
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256 });
  graph.song.id = "different-audio-identity";
  const args = publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph });
  args.project = { song_id: songId, audio_id: registryAudioId };

  assert.throws(
    () => publishEchoExecutionGraph(args),
    /graph-parent-song-identity-mismatch/u,
  );

  const aliasedGraph = derivedGraph({ songId, parent, parentGraphSha256 });
  const aliasedArgs = publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph: aliasedGraph });
  aliasedArgs.project = { song_id: songId, audio_id: registryAudioId };
  assert.equal(publishEchoExecutionGraph(aliasedArgs).status, "published");
});

test("publishes and resolves a media-only execution graph with an explicit no-telemetry proof", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-media-only-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-media-only";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "8");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: "9" });
  const evidence = noOpEvidence({ parent, parentGraphSha256, inputPath: parentGraphPath });
  const published = publishEchoExecutionGraph({
    ...publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph }),
    evidence,
  });
  const resolved = resolveEchoExecutionGraph({
    albumRoot,
    songId,
    parentGraphPath,
    parentGraphSha256,
    cutKind: "base",
    cutFingerprint: baseCutFingerprint,
    project: {},
    validateGraph: validate,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.receipt.evidence.telemetry.analysisVersion, "not-required");

  const tampered = structuredClone(evidence);
  tampered.telemetry.truthStatus = "measured";
  assert.throws(() => publishEchoExecutionGraph({
    ...publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph }),
    expectedCurrentPointerSha256: echoExecutionPointerToken({ albumRoot, songId }),
    evidence: tampered,
  }), /publication gate/i);

  const reactiveGraph = structuredClone(graph);
  reactiveGraph.tracks = [{
    id: "track-b",
    role: "visualizer",
    cards: [{
      id: "reactive-cue",
      startSeconds: 0,
      endSeconds: 10,
      visualization: {
        card: {
          schemaVersion: "hapa.visualizer-card.v2",
          audioMap: { intensity: { stemFocus: "vocals", signal: "rms" } },
        },
      },
    }],
  }];
  assert.throws(() => publishEchoExecutionGraph({
    ...publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph: reactiveGraph }),
    expectedCurrentPointerSha256: echoExecutionPointerToken({ albumRoot, songId }),
    evidence,
  }), /publication gate/i, "a forged no-op receipt cannot publish an audio-reactive graph");
  assert.ok(published.pointerPath);
});

test("rejects a torn or tampered execution artifact instead of serving it", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-tamper-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-two";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "2");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: "3" });
  const publication = publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph }));
  fs.appendFileSync(publication.graphPath, " ");
  const result = resolveEchoExecutionGraph({ albumRoot, songId, parentGraphPath, parentGraphSha256, cutKind: "base", cutFingerprint: baseCutFingerprint, project: {}, validateGraph: validate });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "execution-artifact-hash-mismatch");
});

test("refuses blocked gates before writing any execution artifact", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-blocked-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-blocked";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "3");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: "4" });
  const evidence = validEvidence({ parent, parentGraphSha256, inputPath: parentGraphPath });
  evidence.gate.ok = false;
  evidence.gate.cutStatus = "blocked";
  evidence.repair.receipt.status = "blocked";
  evidence.repair.receipt.blockedDecisionCount = 1;
  assert.throws(() => publishEchoExecutionGraph({
    albumRoot,
    songId,
    cutKind: "base",
    cutFingerprint: baseCutFingerprint,
    parentGraphPath,
    expectedParentGraphSha256: parentGraphSha256,
    graph,
    project: {},
    evidence,
    validateGraph: validate,
  }), /publication gate/i);
  assert.equal(fs.existsSync(path.join(songRoot, "execution")), false);
});

test("immutable artifacts are create-or-verify and different evidence gets a different content address", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-immutable-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-immutable";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "4");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: "5" });
  const first = publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph, marker: "one" }));
  const token = echoExecutionPointerToken({ albumRoot, songId });
  const second = publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, expectedCurrentPointerSha256: token, graph, marker: "two" }));
  assert.notEqual(first.receipt.artifactId, second.receipt.artifactId);
  assert.equal(JSON.parse(fs.readFileSync(first.receiptPath, "utf8")).evidence.marker, "one");
  fs.appendFileSync(second.graphPath, "tamper");
  assert.throws(() => publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, expectedCurrentPointerSha256: echoExecutionPointerToken({ albumRoot, songId }), graph, marker: "two" })), /immutable/i);
});

test("older publishers lose the pointer CAS and concurrent activation locks fail closed", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-cas-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-cas";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "5");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: "6" });
  const olderToken = echoExecutionPointerToken({ albumRoot, songId });
  const first = publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, expectedCurrentPointerSha256: olderToken, graph, marker: "newer" }));
  assert.throws(() => publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, expectedCurrentPointerSha256: olderToken, graph, marker: "older" })), /current pointer changed/i);
  const lockPath = path.join(path.dirname(first.pointerPath), "current.lock");
  fs.writeFileSync(lockPath, "busy");
  assert.throws(() => publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, expectedCurrentPointerSha256: echoExecutionPointerToken({ albumRoot, songId }), graph, marker: "locked" })), /another echo execution publisher/i);
});

test("a metadata lock owned by a live publisher remains an exclusive conflict", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "live", parentMarker: "1", graphMarker: "2" });
  fs.writeFileSync(fixture.lockPath, `${JSON.stringify(publisherLockMetadata())}\n`, { flag: "wx" });
  assert.throws(
    () => publishEchoExecutionGraph(fixture.nextArgs()),
    /another echo execution publisher.*live-lock-owner/i,
  );
});

test("a metadata lock whose owner process is dead is quarantined and recovered", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "dead", parentMarker: "2", graphMarker: "3" });
  const deadPid = 2_147_483_647;
  assert.throws(() => process.kill(deadPid, 0), (error) => error?.code === "ESRCH", "fixture PID must not exist");
  fs.writeFileSync(fixture.lockPath, `${JSON.stringify(publisherLockMetadata({ pid: deadPid }))}\n`, { flag: "wx" });
  const publication = publishEchoExecutionGraph(fixture.nextArgs());
  assert.equal(publication.ok, true);
  assert.equal(fs.existsSync(fixture.lockPath), false, "the recovered publisher must release only its own successor lock");
});

test("a recycled live PID does not impersonate the process-start identity recorded by the lock", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "pid-reuse", parentMarker: "2", graphMarker: "3" });
  fs.writeFileSync(fixture.lockPath, `${JSON.stringify(publisherLockMetadata({
    pid: process.pid,
    ownerStartedAt: "2000-01-01T00:00:00.000Z",
  }))}\n`, { flag: "wx" });
  const publication = publishEchoExecutionGraph(fixture.nextArgs());
  assert.equal(publication.ok, true);
  assert.equal(fs.existsSync(fixture.lockPath), false);
});

test("a stale legacy empty lock is recovered after the conservative stale window", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "stale-empty", parentMarker: "3", graphMarker: "4" });
  fs.writeFileSync(fixture.lockPath, "", { flag: "wx" });
  const staleAt = new Date(Date.now() - ECHO_EXECUTION_LEGACY_LOCK_STALE_MS - 1_000);
  fs.utimesSync(fixture.lockPath, staleAt, staleAt);
  const publication = publishEchoExecutionGraph(fixture.nextArgs());
  assert.equal(publication.ok, true);
  assert.equal(fs.existsSync(fixture.lockPath), false);
});

test("stale-lock reclamation retries without moving or deleting a successor that wins the path race", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "reclaim-race", parentMarker: "3", graphMarker: "4" });
  fs.writeFileSync(fixture.lockPath, "", { flag: "wx" });
  const staleAt = new Date(Date.now() - ECHO_EXECUTION_LEGACY_LOCK_STALE_MS - 1_000);
  fs.utimesSync(fixture.lockPath, staleAt, staleAt);
  const successorBytes = `${JSON.stringify(publisherLockMetadata({ token: "e".repeat(64) }))}\n`;
  const originalLinkSync = fs.linkSync;
  let raced = false;
  fs.linkSync = function linkWithSuccessorRace(sourcePath, destinationPath) {
    if (!raced && sourcePath === fixture.lockPath && path.basename(destinationPath).startsWith(".current.lock.reclaim.")) {
      fs.unlinkSync(fixture.lockPath);
      fs.writeFileSync(fixture.lockPath, successorBytes, { flag: "wx" });
      raced = true;
    }
    return originalLinkSync.call(fs, sourcePath, destinationPath);
  };
  try {
    assert.throws(() => publishEchoExecutionGraph(fixture.nextArgs()), /another echo execution publisher.*live-lock-owner/i);
  } finally {
    fs.linkSync = originalLinkSync;
  }
  assert.equal(raced, true);
  assert.equal(fs.readFileSync(fixture.lockPath, "utf8"), successorBytes);
});

test("two-reclaimer claim disappearance is treated as a bounded retry instead of leaking ENOENT", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "claim-disappeared", parentMarker: "3", graphMarker: "4" });
  fs.writeFileSync(fixture.lockPath, "", { flag: "wx" });
  const staleAt = new Date(Date.now() - ECHO_EXECUTION_LEGACY_LOCK_STALE_MS - 1_000);
  fs.utimesSync(fixture.lockPath, staleAt, staleAt);
  const originalLinkSync = fs.linkSync;
  let disappeared = false;
  fs.linkSync = function linkWithDisappearedClaim(sourcePath, destinationPath) {
    if (!disappeared && sourcePath === fixture.lockPath && path.basename(destinationPath).startsWith(".current.lock.reclaim.")) {
      disappeared = true;
      const error = new Error("simulated competing reclaimer removed its claim");
      error.code = "EEXIST";
      throw error;
    }
    return originalLinkSync.call(fs, sourcePath, destinationPath);
  };
  try {
    const publication = publishEchoExecutionGraph(fixture.nextArgs());
    assert.equal(publication.ok, true);
  } finally {
    fs.linkSync = originalLinkSync;
  }
  assert.equal(disappeared, true);
  assert.equal(fs.existsSync(fixture.lockPath), false);
});

test("stale-lock disposal restores rather than deleting a successor swapped in immediately before rename", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "reclaim-dispose-race", parentMarker: "3", graphMarker: "4" });
  fs.writeFileSync(fixture.lockPath, "", { flag: "wx" });
  const staleAt = new Date(Date.now() - ECHO_EXECUTION_LEGACY_LOCK_STALE_MS - 1_000);
  fs.utimesSync(fixture.lockPath, staleAt, staleAt);
  const successorBytes = `${JSON.stringify(publisherLockMetadata({ token: "d".repeat(64) }))}\n`;
  const originalRenameSync = fs.renameSync;
  let raced = false;
  fs.renameSync = function renameWithSuccessorRace(sourcePath, destinationPath) {
    if (!raced && sourcePath === fixture.lockPath && path.basename(destinationPath).startsWith(".current.lock.reclaim-dispose.")) {
      fs.unlinkSync(fixture.lockPath);
      fs.writeFileSync(fixture.lockPath, successorBytes, { flag: "wx" });
      raced = true;
    }
    return originalRenameSync.call(fs, sourcePath, destinationPath);
  };
  try {
    assert.throws(() => publishEchoExecutionGraph(fixture.nextArgs()), /another echo execution publisher.*live-lock-owner/i);
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.equal(raced, true);
  assert.equal(fs.readFileSync(fixture.lockPath, "utf8"), successorBytes);
});

test("a fresh legacy empty lock remains blocked while an interrupted publisher may still be starting", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "fresh-empty", parentMarker: "4", graphMarker: "5" });
  fs.writeFileSync(fixture.lockPath, "", { flag: "wx" });
  assert.throws(
    () => publishEchoExecutionGraph(fixture.nextArgs()),
    /another echo execution publisher.*fresh-legacy-empty-lock/i,
  );
});

test("a symlink at the publisher lock path is rejected instead of followed or reclaimed", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "symlink", parentMarker: "5", graphMarker: "6" });
  const targetPath = path.join(fixture.root, "outside-lock-target.json");
  const targetBytes = `${JSON.stringify(publisherLockMetadata({ pid: 2_147_483_647 }))}\n`;
  fs.writeFileSync(targetPath, targetBytes);
  fs.symlinkSync(targetPath, fixture.lockPath);
  assert.throws(() => publishEchoExecutionGraph(fixture.nextArgs()), /publisher lock may not be a symbolic link/i);
  assert.equal(fs.readFileSync(targetPath, "utf8"), targetBytes);
});

test("publisher cleanup cannot remove a successor lock after ownership changes", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "successor", parentMarker: "6", graphMarker: "7" });
  const successor = publisherLockMetadata({ token: "f".repeat(64) });
  const successorBytes = `${JSON.stringify(successor)}\n`;
  let replaced = false;
  assert.throws(() => publishEchoExecutionGraph({
    ...fixture.nextArgs(),
    assertPublicationFresh: ({ stage }) => {
      if (stage !== "before-pointer-activation") return;
      const installed = JSON.parse(fs.readFileSync(fixture.lockPath, "utf8"));
      assert.equal(installed.schemaVersion, ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA);
      assert.equal(installed.pid, process.pid);
      assert.match(installed.ownerStartedAt, /^\d{4}-\d{2}-\d{2}T/u);
      assert.match(installed.createdAt, /^\d{4}-\d{2}-\d{2}T/u);
      assert.match(installed.token, /^[a-f0-9]{64}$/u);
      fs.unlinkSync(fixture.lockPath);
      fs.writeFileSync(fixture.lockPath, successorBytes, { flag: "wx" });
      replaced = true;
    },
  }), /publisher no longer owns this cut lock/i);
  assert.equal(replaced, true);
  assert.equal(fs.readFileSync(fixture.lockPath, "utf8"), successorBytes, "cleanup must leave the successor's token and inode untouched");
});

test("publisher release restores rather than deleting a successor swapped in at the final disposal boundary", (t) => {
  const fixture = publishedLockFixture(t, { suffix: "release-dispose-race", parentMarker: "6", graphMarker: "7" });
  const successorBytes = `${JSON.stringify(publisherLockMetadata({ token: "c".repeat(64) }))}\n`;
  const originalRenameSync = fs.renameSync;
  let raced = false;
  fs.renameSync = function renameWithReleaseSuccessorRace(sourcePath, destinationPath) {
    if (!raced && sourcePath === fixture.lockPath && path.basename(destinationPath).startsWith(".current.lock.release-dispose.")) {
      fs.unlinkSync(fixture.lockPath);
      fs.writeFileSync(fixture.lockPath, successorBytes, { flag: "wx" });
      raced = true;
    }
    return originalRenameSync.call(fs, sourcePath, destinationPath);
  };
  try {
    const publication = publishEchoExecutionGraph(fixture.nextArgs());
    assert.equal(publication.ok, true);
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.equal(raced, true);
  assert.equal(fs.readFileSync(fixture.lockPath, "utf8"), successorBytes);
});

test("rejects execution-directory symlink escapes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-symlink-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-symlink";
  const songRoot = path.join(albumRoot, songId);
  const outside = path.join(root, "outside");
  fs.mkdirSync(songRoot, { recursive: true });
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(songRoot, "execution"));
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "6");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: "7" });
  assert.throws(() => publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph })), /symbolic link/i);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("a graph audited from an older canonical parent cannot be relabeled or published after the parent changes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-parent-race-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-parent-race";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parentOne = parentGraph(songId, "a");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parentOne)}\n`);
  const parentOneSha256 = echoExecutionFileSha256(parentGraphPath);
  const staleGraph = derivedGraph({ songId, parent: parentOne, parentGraphSha256: parentOneSha256, marker: "b" });
  const staleEvidence = validEvidence({ parent: parentOne, parentGraphSha256: parentOneSha256, inputPath: parentGraphPath });

  const parentTwo = parentGraph(songId, "c");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parentTwo)}\n`);
  const parentTwoSha256 = echoExecutionFileSha256(parentGraphPath);
  assert.throws(() => publishEchoExecutionGraph({
    albumRoot,
    songId,
    cutKind: "base",
    cutFingerprint: baseCutFingerprint,
    parentGraphPath,
    expectedParentGraphSha256: parentOneSha256,
    graph: staleGraph,
    project: {},
    evidence: staleEvidence,
    validateGraph: validate,
  }), /changed before execution graph publication/i);
  assert.throws(() => publishEchoExecutionGraph({
    albumRoot,
    songId,
    cutKind: "base",
    cutFingerprint: baseCutFingerprint,
    parentGraphPath,
    expectedParentGraphSha256: parentTwoSha256,
    graph: staleGraph,
    project: {},
    evidence: staleEvidence,
    validateGraph: validate,
  }), /exact canonical parent/i);
  assert.equal(echoExecutionPointerToken({ albumRoot, songId }), null);
});

test("publication and resolution bind the exact semantic cut fingerprint and reject cross-cut reuse", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-cut-binding-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-cut-binding";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "d");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const cutId = "variant-blue";
  const cutKind = "saved-variant";
  const cutFingerprint = `content-v2:${"e".repeat(64)}`;
  const changedFingerprint = `content-v2:${"f".repeat(64)}`;
  const graph = derivedGraph({ songId, parent, parentGraphSha256, cutId, cutKind, cutFingerprint, marker: "e" });
  const published = publishEchoExecutionGraph(publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph, cutId, cutKind, cutFingerprint }));
  assert.equal(published.pointer.cutFingerprint, cutFingerprint);
  const stale = resolveEchoExecutionGraph({ albumRoot, songId, cutId, cutKind, cutFingerprint: changedFingerprint, parentGraphPath, parentGraphSha256, project: {}, validateGraph: validate });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "execution-pointer-contract-invalid");

  assert.throws(() => publishEchoExecutionGraph({
    ...publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph, cutId, cutKind, cutFingerprint }),
    cutId: "variant-red",
  }), /exact canonical parent, semantic cut/i);
});

test("a dependency change between artifact creation and pointer activation loses the final publication CAS", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-execution-dependency-race-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const albumRoot = path.join(root, "album");
  const songId = "song-dependency-race";
  const songRoot = path.join(albumRoot, songId);
  fs.mkdirSync(songRoot, { recursive: true });
  const parentGraphPath = path.join(songRoot, "native-show-graph.json");
  const parent = parentGraph(songId, "7");
  fs.writeFileSync(parentGraphPath, `${JSON.stringify(parent)}\n`);
  const parentGraphSha256 = echoExecutionFileSha256(parentGraphPath);
  const graph = derivedGraph({ songId, parent, parentGraphSha256, marker: "8" });
  let dependencyGeneration = 1;
  let assertions = 0;
  const args = publicationArgs({ albumRoot, songId, parentGraphPath, parent, parentGraphSha256, graph });
  assert.throws(() => publishEchoExecutionGraph({
    ...args,
    assertPublicationFresh: () => {
      assertions += 1;
      if (dependencyGeneration !== 1) throw new Error("renderer changed during publication");
      dependencyGeneration = 2;
    },
  }), /renderer changed during publication/i);
  assert.equal(assertions, 2);
  assert.equal(echoExecutionPointerToken({ albumRoot, songId }), null, "an orphan immutable artifact is safe; a stale ready pointer is not");
});
