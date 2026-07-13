import { createHash } from "node:crypto";

export const SONG_CARD_EDITION_LINEAGE_SCHEMA = "hapa.song-card.edition-lineage.v1";
export const SONG_CARD_PRINT_LINEAGE_SCHEMA = "hapa.song-card.print-lineage-receipt.v1";
export const SONG_CARD_LIFECYCLE_EVENT_SCHEMA = "hapa.song-card.lifecycle-event.v1";

const REQUIRED_KINDS = [
  "registry-revision",
  "editor-snapshot",
  "treatment",
  "variant",
  "patch-lineage",
  "show-graph",
  "artifact",
  "temporal-index",
  "song-card-edition",
];
const ALLOWED_LIFECYCLE_TYPES = new Set(["published", "revoked"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function defaultHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function hashValue(value, hashFn = defaultHash) {
  const result = String(hashFn(stable(value)) || "").replace(/^sha256:/u, "");
  if (!/^[a-f0-9]{64}$/iu.test(result)) throw new Error("Lineage hash functions must return a 64-character digest");
  return `sha256:${result.toLowerCase()}`;
}

function artifactSha(value) {
  const result = String(value || "").replace(/^sha256:/u, "").toLowerCase();
  return /^[a-f0-9]{64}$/u.test(result) ? `sha256:${result}` : null;
}

function idPart(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._:-]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function makeNode(kind, identity, payload, hashFn) {
  const canonicalPayload = stable(payload);
  return {
    id: `${kind}:${idPart(identity) || hashValue(canonicalPayload, hashFn).slice(-24)}`,
    kind,
    hash: hashValue(canonicalPayload, hashFn),
    payload: canonicalPayload,
  };
}

function edge(from, to, relation) {
  return { from: from.id || from, to: to.id || to, relation };
}

function normalizedArtifacts(artifacts = []) {
  return artifacts.map((artifact, index) => {
    const sha256 = artifactSha(artifact.sha256 || artifact.hash || artifact.digest);
    if (!artifact.role) throw new Error(`Artifact ${index} is missing role`);
    if (!sha256) throw new Error(`Artifact ${artifact.role} is missing a valid SHA-256 digest`);
    return stable({
      role: String(artifact.role),
      sha256,
      byteSize: Number(artifact.byteSize ?? artifact.bytes ?? 0),
      durationMs: Number(artifact.durationMs || 0),
      mimeType: String(artifact.mimeType || ""),
      transform: artifact.transform || null,
    });
  });
}

function lineageDigest(lineage, hashFn = defaultHash) {
  const { lineageHash: _ignored, ...body } = lineage;
  return hashValue(body, hashFn);
}

export function buildSongCardEditionLineage({
  headId,
  edition,
  semanticFingerprint,
  registryRevision,
  editorSnapshot,
  treatment,
  variant,
  patches = [],
  showGraph,
  artifacts = [],
  appearanceIndex,
  priorEdition = null,
  changedFamilies = [],
  incrementReason = "",
  mintedAt = new Date().toISOString(),
  hashFn = defaultHash,
} = {}) {
  const editionNumber = Number(edition);
  if (!headId || !Number.isInteger(editionNumber) || editionNumber < 1) throw new Error("headId and a positive edition are required");
  if (!semanticFingerprint) throw new Error("A semantic fingerprint is required");
  if (!registryRevision || !editorSnapshot || !treatment || !variant || !showGraph || !appearanceIndex) throw new Error("Complete registry, editor, treatment, variant, graph, and temporal inputs are required");
  const normalized = normalizedArtifacts(artifacts);
  if (!normalized.some((artifact) => artifact.role === "master")) throw new Error("Edition lineage requires a rendered master artifact");
  if (editionNumber > 1 && !priorEdition) throw new Error("Edition increments require the prior edition");
  if (editionNumber > 1 && (!incrementReason || !changedFamilies.length)) throw new Error("Edition increments require a material explanation");

  const registryNode = makeNode("registry-revision", registryRevision.id || registryRevision.revision || "registry", registryRevision, hashFn);
  const editorNode = makeNode("editor-snapshot", editorSnapshot.id || editorSnapshot.revision || "editor", editorSnapshot, hashFn);
  const treatmentNode = makeNode("treatment", treatment.id || treatment.treatmentId || "treatment", treatment, hashFn);
  const variantNode = makeNode("variant", variant.id || variant.variantId || "variant", variant, hashFn);
  const patchNode = makeNode("patch-lineage", variant.id || variant.variantId || `edition-${editionNumber}`, { patches }, hashFn);
  const graphNode = makeNode("show-graph", showGraph.id || showGraph.runId || variant.variantId || "graph", showGraph, hashFn);
  const temporalNode = makeNode("temporal-index", appearanceIndex.id || appearanceIndex.indexDigest || `edition-${editionNumber}`, appearanceIndex, hashFn);
  const artifactNodes = normalized.map((artifact, index) => makeNode("artifact", `${artifact.role}-${index + 1}-${artifact.sha256.slice(-16)}`, artifact, hashFn));
  const priorNode = priorEdition ? makeNode("prior-edition", priorEdition.id || `${headId}:edition:${priorEdition.edition}`, {
    id: priorEdition.id || `${headId}:edition:${priorEdition.edition}`,
    headId: priorEdition.headId || headId,
    edition: Number(priorEdition.edition),
    semanticFingerprint: priorEdition.semanticFingerprint,
    lineageHash: priorEdition.lineageHash || null,
  }, hashFn) : null;
  const editionPayload = {
    id: `${headId}:edition:${editionNumber}`,
    headId,
    edition: editionNumber,
    semanticFingerprint,
    priorEditionId: priorNode?.payload.id || null,
    changedFamilies: [...new Set(changedFamilies.map(String))].sort(),
    incrementReason: String(incrementReason || (editionNumber === 1 ? "initial-edition" : "")),
    artifactSha256: artifactNodes.map((node) => node.payload.sha256).sort(),
    temporalIndexHash: temporalNode.hash,
  };
  const editionNode = makeNode("song-card-edition", editionPayload.id, editionPayload, hashFn);
  const nodes = [registryNode, editorNode, treatmentNode, variantNode, patchNode, graphNode, ...artifactNodes, temporalNode, ...(priorNode ? [priorNode] : []), editionNode];
  const edges = [
    edge(registryNode, editorNode, "registry-informed-editor"),
    edge(editorNode, treatmentNode, "editor-directed-treatment"),
    edge(treatmentNode, variantNode, "treatment-compiled-variant"),
    edge(variantNode, patchNode, "variant-received-patches"),
    edge(patchNode, graphNode, "patches-materialized-graph"),
    edge(graphNode, temporalNode, "graph-indexed-by"),
    edge(temporalNode, editionNode, "temporal-index-included-in"),
    ...artifactNodes.flatMap((node) => [edge(graphNode, node, "graph-rendered-artifact"), edge(node, editionNode, "artifact-included-in")]),
    ...(priorNode ? [edge(priorNode, editionNode, "prior-edition-superseded-by")] : []),
  ];
  const base = {
    schemaVersion: SONG_CARD_EDITION_LINEAGE_SCHEMA,
    complete: true,
    headId,
    edition: editionNumber,
    outputNodeId: editionNode.id,
    requiredKinds: REQUIRED_KINDS,
    artifactNodeIds: artifactNodes.map((node) => node.id),
    temporalNodeId: temporalNode.id,
    priorEditionNodeId: priorNode?.id || null,
    nodes,
    edges,
    mintedAt,
  };
  const lineage = { ...base, lineageHash: lineageDigest(base, hashFn) };
  const validation = validateSongCardEditionLineage(lineage, { hashFn });
  if (!validation.ok) throw new Error(`Invalid Song Card edition lineage: ${validation.errors.join(", ")}`);
  return lineage;
}

function hasCycle(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const row of edges) adjacency.get(row.from)?.push(row.to);
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((adjacency.get(id) || []).some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}

function hasEdge(edges, fromKind, toKind, relation, byId) {
  return edges.some((row) => byId.get(row.from)?.kind === fromKind && byId.get(row.to)?.kind === toKind && row.relation === relation);
}

export function validateSongCardEditionLineage(lineage = {}, { hashFn = defaultHash } = {}) {
  const errors = [];
  if (lineage.schemaVersion !== SONG_CARD_EDITION_LINEAGE_SCHEMA) errors.push("invalid-lineage-schema");
  const nodes = Array.isArray(lineage.nodes) ? lineage.nodes : [];
  const edges = Array.isArray(lineage.edges) ? lineage.edges : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) errors.push("duplicate-node-id");
  for (const kind of REQUIRED_KINDS) if (!nodes.some((node) => node.kind === kind)) errors.push(`missing-kind:${kind}`);
  for (const node of nodes) {
    if (!node.id || !node.kind || !node.payload || !node.hash) errors.push(`incomplete-node:${node.id || node.kind || "unknown"}`);
    else {
      try { if (node.hash !== hashValue(node.payload, hashFn)) errors.push(`node-hash-mismatch:${node.id}`); }
      catch { errors.push(`invalid-node-hash:${node.id}`); }
    }
    if (node.kind === "artifact" && !artifactSha(node.payload?.sha256)) errors.push(`artifact-hash-invalid:${node.id}`);
  }
  for (const row of edges) {
    if (!byId.has(row.from) || !byId.has(row.to)) errors.push(`edge-node-missing:${row.from}->${row.to}`);
    if (row.from === row.to) errors.push(`self-loop:${row.from}`);
  }
  if (hasCycle(nodes, edges)) errors.push("lineage-cycle");
  const requiredEdges = [
    ["registry-revision", "editor-snapshot", "registry-informed-editor"],
    ["editor-snapshot", "treatment", "editor-directed-treatment"],
    ["treatment", "variant", "treatment-compiled-variant"],
    ["variant", "patch-lineage", "variant-received-patches"],
    ["patch-lineage", "show-graph", "patches-materialized-graph"],
    ["show-graph", "temporal-index", "graph-indexed-by"],
    ["temporal-index", "song-card-edition", "temporal-index-included-in"],
  ];
  for (const [from, to, relation] of requiredEdges) if (!hasEdge(edges, from, to, relation, byId)) errors.push(`missing-edge:${relation}`);
  const artifacts = nodes.filter((node) => node.kind === "artifact");
  if (!artifacts.some((node) => node.payload?.role === "master")) errors.push("missing-master-artifact");
  for (const artifact of artifacts) {
    const graphInput = edges.some((row) => byId.get(row.from)?.kind === "show-graph" && row.to === artifact.id && row.relation === "graph-rendered-artifact");
    const editionOutput = edges.some((row) => row.from === artifact.id && byId.get(row.to)?.kind === "song-card-edition" && row.relation === "artifact-included-in");
    if (!graphInput || !editionOutput) errors.push(`unconnected-artifact:${artifact.id}`);
  }
  const output = byId.get(lineage.outputNodeId);
  if (output?.kind !== "song-card-edition") errors.push("invalid-output-node");
  if (!output?.payload?.semanticFingerprint) errors.push("missing-semantic-fingerprint");
  if (output?.payload?.headId !== lineage.headId) errors.push("edition-head-mismatch");
  const edition = Number(lineage.edition || output?.payload?.edition || 0);
  const prior = nodes.find((node) => node.kind === "prior-edition");
  if (edition > 1) {
    if (!prior) errors.push("missing-prior-edition");
    else {
      if (Number(prior.payload?.edition) !== edition - 1) errors.push("nonconsecutive-edition-increment");
      if (prior.payload?.headId !== lineage.headId) errors.push("prior-edition-head-mismatch");
      if (prior.payload?.semanticFingerprint === output?.payload?.semanticFingerprint) errors.push("unexplained-identical-semantic-fingerprint");
      if (!edges.some((row) => row.from === prior.id && row.to === output?.id && row.relation === "prior-edition-superseded-by")) errors.push("missing-supersession-edge");
    }
    if (!output?.payload?.incrementReason || !(output?.payload?.changedFamilies || []).length) errors.push("unexplained-edition-increment");
  } else if (prior) errors.push("edition-one-has-prior-edition");
  try { if (lineage.lineageHash !== lineageDigest(lineage, hashFn)) errors.push("lineage-hash-mismatch"); }
  catch { errors.push("invalid-lineage-hash"); }
  return { schemaVersion: "hapa.song-card.edition-lineage-validation.v1", ok: errors.length === 0, errors };
}

export function assertSongCardEditionLineage(lineage, options) {
  const result = validateSongCardEditionLineage(lineage, options);
  if (!result.ok) throw new Error(`Invalid Song Card edition lineage: ${result.errors.join(", ")}`);
  return lineage;
}

export function buildPrintedCardLineageReceipt({ lineage, appearance, timestampMs, printedCard, printedAt = new Date().toISOString(), hashFn = defaultHash } = {}) {
  assertSongCardEditionLineage(lineage, { hashFn });
  const at = Math.round(Number(timestampMs));
  if (!appearance || !Number.isFinite(at) || at < Number(appearance.startMs) || at >= Number(appearance.endMs)) throw new Error("Print timestamp must fall inside the historical appearance interval");
  if (!appearance.snapshot) throw new Error("Printed cards require an immutable historical snapshot");
  const editionNode = lineage.nodes.find((node) => node.id === lineage.outputNodeId);
  const appearanceNode = makeNode("temporal-appearance", appearance.appearanceId || appearance.sourceCardId, {
    appearanceId: appearance.appearanceId,
    sourceCardId: appearance.sourceCardId,
    sourceDigest: appearance.sourceDigest || appearance.snapshotDigest || hashValue(appearance.snapshot, hashFn),
    startMs: Number(appearance.startMs),
    endMs: Number(appearance.endMs),
    trackId: appearance.trackId,
    snapshot: appearance.snapshot,
  }, hashFn);
  const printNode = makeNode("printed-card", printedCard?.id || `${appearance.sourceCardId}-${at}`, {
    card: printedCard,
    timestampMs: at,
    editionId: editionNode.payload.id,
    editionLineageHash: lineage.lineageHash,
    appearanceId: appearance.appearanceId,
  }, hashFn);
  const base = {
    schemaVersion: SONG_CARD_PRINT_LINEAGE_SCHEMA,
    headId: lineage.headId,
    edition: lineage.edition,
    editionNode: { id: editionNode.id, hash: editionNode.hash },
    nodes: [appearanceNode, printNode],
    edges: [
      { from: editionNode.id, to: appearanceNode.id, relation: "edition-contained-appearance" },
      { from: appearanceNode.id, to: printNode.id, relation: "appearance-printed-as" },
    ],
    outputNodeId: printNode.id,
    printedAt,
  };
  return { ...base, receiptHash: hashValue(base, hashFn) };
}

export function validatePrintedCardLineageReceipt(receipt = {}, { lineage, hashFn = defaultHash } = {}) {
  const errors = [];
  if (receipt.schemaVersion !== SONG_CARD_PRINT_LINEAGE_SCHEMA) errors.push("invalid-print-lineage-schema");
  if (!lineage || receipt.editionNode?.id !== lineage.outputNodeId || receipt.editionNode?.hash !== lineage.nodes?.find((node) => node.id === lineage.outputNodeId)?.hash) errors.push("print-edition-lineage-mismatch");
  const appearance = receipt.nodes?.find((node) => node.kind === "temporal-appearance");
  const printed = receipt.nodes?.find((node) => node.kind === "printed-card");
  if (!appearance || !printed) errors.push("print-lineage-nodes-missing");
  for (const node of receipt.nodes || []) if (node.hash !== hashValue(node.payload, hashFn)) errors.push(`print-node-hash-mismatch:${node.id}`);
  if (!receipt.edges?.some((row) => row.from === receipt.editionNode?.id && row.to === appearance?.id && row.relation === "edition-contained-appearance")) errors.push("print-edition-edge-missing");
  if (!receipt.edges?.some((row) => row.from === appearance?.id && row.to === printed?.id && row.relation === "appearance-printed-as")) errors.push("print-child-edge-missing");
  const { receiptHash: _ignored, ...body } = receipt;
  if (receipt.receiptHash !== hashValue(body, hashFn)) errors.push("print-receipt-hash-mismatch");
  return { schemaVersion: "hapa.song-card.print-lineage-validation.v1", ok: errors.length === 0, errors };
}

export function createSongCardLifecycleEvent({ type, headId, edition, lineageHash, reason = "", actor = "local-operator", at = new Date().toISOString(), hashFn = defaultHash } = {}) {
  if (!ALLOWED_LIFECYCLE_TYPES.has(type)) throw new Error("Only bounded published and revoked lifecycle events are accepted");
  if (!headId || !Number.isInteger(Number(edition)) || !/^sha256:[a-f0-9]{64}$/iu.test(String(lineageHash || ""))) throw new Error("Lifecycle events require head, edition, and a SHA-256 lineage hash");
  if (type === "revoked" && !String(reason).trim()) throw new Error("Revocation requires a reason");
  const base = { schemaVersion: SONG_CARD_LIFECYCLE_EVENT_SCHEMA, type, headId, edition: Number(edition), lineageHash, reason: String(reason).slice(0, 1000), actor: String(actor).slice(0, 200), at, perFrame: false };
  return { ...base, eventId: `song-card-event:${hashValue(base, hashFn).slice(-24)}` };
}

export function appendBoundedSongCardLifecycleEvent(events = [], event, { maxEvents = 256, maxEventBytes = 8192 } = {}) {
  if (!event || event.schemaVersion !== SONG_CARD_LIFECYCLE_EVENT_SCHEMA || !ALLOWED_LIFECYCLE_TYPES.has(event.type) || event.perFrame !== false) throw new Error("Invalid Song Card lifecycle event");
  if (new TextEncoder().encode(JSON.stringify(event)).byteLength > maxEventBytes) throw new Error("Song Card lifecycle event exceeds the bounded event size");
  if (events.length >= maxEvents) throw new Error("Song Card lifecycle event log reached its bounded capacity");
  if (events.some((row) => row.eventId === event.eventId)) return [...events];
  return [...events, stable(event)];
}
