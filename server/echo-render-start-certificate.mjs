import { createHash } from "node:crypto";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const CUT_FINGERPRINT = /^(?:sha256|content-v2):[a-f0-9]{64}$/u;
const ARTIFACT_ID = /^[a-f0-9]{64}$/u;
const VARIANT_HASH = /^[a-f0-9]{64}$/u;
const POINTER_SCHEMA = "hapa.echo.execution-graph-pointer.v1";
const RECEIPT_SCHEMA = "hapa.echo.execution-graph-receipt.v2";

export const ECHO_LOCAL_RENDER_EXECUTION_PUBLICATION_SCHEMA = "hapa.echo.local-render-execution-publication.v1";

function text(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function echoRenderStartCertificationSha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
}

function boundedText(value, { label, maximum, required = true } = {}) {
  const candidate = text(value);
  if ((!candidate && required) || candidate.length > maximum) {
    throw new Error(`The resolved Echo execution ${label} is missing or outside its bounded certificate contract.`);
  }
  return candidate || null;
}

function exactSha256(value, label) {
  const candidate = text(value);
  if (!SHA256.test(candidate)) {
    throw new Error(`The resolved Echo execution ${label} is not a verified SHA-256 identity.`);
  }
  return candidate;
}

/**
 * Reduce the already-verified execution pointer to a fixed-size publication
 * identity. Paths and evidence payloads stay out of the local-render summary;
 * the immutable receipt digest commits to all of that evidence instead.
 */
export function canonicalEchoExecutionPublicationIdentity(executionGraph = {}, {
  expectedCutId = null,
  expectedCutKind = null,
  expectedCutFingerprint = null,
} = {}) {
  const pointer = executionGraph?.pointer;
  if (!pointer || typeof pointer !== "object") {
    throw new Error("The resolved Echo execution publication pointer is missing.");
  }
  const cutId = boundedText(pointer.cutId, { label: "cut ID", maximum: 256 });
  const cutKind = boundedText(pointer.cutKind, { label: "cut kind", maximum: 64 });
  const cutFingerprint = text(pointer.cutFingerprint);
  const variantId = boundedText(pointer.variantId, {
    label: "variant ID",
    maximum: 256,
    required: false,
  });
  if (pointer.schemaVersion !== POINTER_SCHEMA || pointer.status !== "ready") {
    throw new Error("The resolved Echo execution publication pointer contract is invalid.");
  }
  if (!ARTIFACT_ID.test(text(pointer.artifactId))) {
    throw new Error("The resolved Echo execution artifact identity is invalid.");
  }
  if (!CUT_FINGERPRINT.test(cutFingerprint)) {
    throw new Error("The resolved Echo execution cut fingerprint is invalid.");
  }
  if (expectedCutId && cutId !== text(expectedCutId)) {
    throw new Error("The resolved Echo execution publication is for a different cut ID.");
  }
  if (expectedCutKind && cutKind !== text(expectedCutKind)) {
    throw new Error("The resolved Echo execution publication is for a different cut kind.");
  }
  if (expectedCutFingerprint && cutFingerprint !== text(expectedCutFingerprint)) {
    throw new Error("The resolved Echo execution publication is for a different cut fingerprint.");
  }
  const parentGraphSha256 = exactSha256(pointer.parentGraphSha256, "parent graph identity");
  const executionGraphSha256 = exactSha256(pointer.executionGraphSha256, "output graph identity");
  const receiptSha256 = exactSha256(pointer.receiptSha256, "receipt identity");
  const receiptSchemaVersion = boundedText(executionGraph.receiptSchemaVersion, {
    label: "receipt schema",
    maximum: 96,
  });
  if (receiptSchemaVersion !== RECEIPT_SCHEMA) {
    throw new Error("The resolved Echo execution receipt schema is invalid.");
  }
  if (exactSha256(executionGraph.parentGraphSha256, "projected parent graph identity") !== parentGraphSha256) {
    throw new Error("The resolved Echo execution pointer and receipt disagree about the parent graph.");
  }
  if (exactSha256(executionGraph.outputGraphSha256, "projected output graph identity") !== executionGraphSha256) {
    throw new Error("The resolved Echo execution pointer and receipt disagree about the output graph.");
  }
  if (text(executionGraph.cutKind) !== cutKind || text(executionGraph.cutFingerprint) !== cutFingerprint) {
    throw new Error("The resolved Echo execution pointer and receipt disagree about the semantic cut.");
  }
  if (executionGraph.receiptSha256 != null
    && exactSha256(executionGraph.receiptSha256, "projected receipt identity") !== receiptSha256) {
    throw new Error("The resolved Echo execution pointer and receipt projection disagree about the receipt identity.");
  }
  const variantHash = text(pointer.variantHash);
  if (!VARIANT_HASH.test(variantHash)) {
    throw new Error("The resolved Echo execution variant identity is invalid.");
  }
  return Object.freeze({
    schemaVersion: ECHO_LOCAL_RENDER_EXECUTION_PUBLICATION_SCHEMA,
    pointerSchemaVersion: POINTER_SCHEMA,
    receiptSchemaVersion,
    artifactId: text(pointer.artifactId),
    cutId,
    cutKind,
    cutFingerprint,
    parentGraphSha256,
    executionGraphSha256,
    receiptSha256,
    variantId,
    variantHash,
  });
}

/**
 * Build the one canonical exact-plan identity used at render start and at
 * every assertFresh checkpoint. In particular, receiptSha256 makes an
 * evidence-only republish produce a different certificate even when the
 * output graph and all public counts are unchanged.
 */
export function createEchoRenderStartCertificateBinding({
  candidateId,
  planId,
  planSha256,
  receipt,
} = {}) {
  const executionGraph = receipt?.executionGraph || {};
  const publicationIdentity = canonicalEchoExecutionPublicationIdentity(executionGraph, {
    expectedCutId: planId,
    expectedCutKind: "saved-mint-plan",
    expectedCutFingerprint: planSha256,
  });
  const publicationIdentitySha256 = echoRenderStartCertificationSha256(publicationIdentity);
  const certificateSha256 = echoRenderStartCertificationSha256({
    schemaVersion: "hapa.song-card.local-render-start-certificate-material.v2",
    candidateId: boundedText(candidateId, { label: "candidate ID", maximum: 256 }),
    planId: boundedText(planId, { label: "plan ID", maximum: 256 }),
    planSha256: exactSha256(planSha256, "saved-plan identity"),
    sourceHash: exactSha256(receipt?.sourceHash, "resolved source identity"),
    cutId: boundedText(receipt?.cutId, { label: "receipt cut ID", maximum: 256 }),
    cutKind: boundedText(receipt?.cutKind, { label: "receipt cut kind", maximum: 64 }),
    cutFingerprint: text(receipt?.cutFingerprint),
    registries: executionGraph.registries,
    rendererBuildSha256: exactSha256(executionGraph.rendererBuildSha256, "renderer build identity"),
    deliveryRuntimeBuildSha256: exactSha256(executionGraph.deliveryRuntimeBuildSha256, "delivery runtime build identity"),
    serverDeliveryBuildSha256: exactSha256(executionGraph.serverDeliveryBuildSha256, "server delivery build identity"),
    certifierSourceSha256: exactSha256(executionGraph.certifierSourceSha256, "certifier source identity"),
    visualInputCount: Number(executionGraph.visualInputCount || 0),
    proxyInputCount: Number(executionGraph.proxyInputCount || 0),
    publicationIdentity,
  });
  return Object.freeze({
    certificateSha256,
    publicationIdentity,
    publicationIdentitySha256,
  });
}
