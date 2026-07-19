import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as signBytes,
  verify as verifyBytes
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deriveStargate } from "../src/domain/tarot-stargate-derivation.js";
import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";

// Adapted from the tested signed-invitation/hello/ack protocol in
// hapa-tarot-stargate-reference@9e59305, with exact Card/revision bindings.
export const GATE_PASS_PROTOCOL = "hapa.stargate-gate-pass-p2p.v1";
export const GATE_PASS_SCHEMA = "hapa.stargate-gate-pass.v1";
export const GATE_PASS_HELLO_SCHEMA = "hapa.stargate-gate-pass-hello.v1";
export const GATE_PASS_ACK_SCHEMA = "hapa.stargate-gate-pass-ack.v1";
export const GATE_PASS_RESULT_SCHEMA = "hapa.stargate-gate-pass-result.v1";
export const CONTEXT_CARD_HANDOFF_SCHEMA = "hapa.stargate-context-card-handoff.v1";

const PASS_FIELDS = Object.freeze([
  "schemaVersion", "protocol", "passId", "issuerNodeId", "issuerPublicKey", "sourceCardId",
  "sourceRevision", "sourceNode", "formation", "protocolVersion", "privacyScope",
  "cohortSecretBase64Url", "contextCommitment", "issuedAt", "expiresAt", "nonce"
]);
const HELLO_FIELDS = Object.freeze([
  "schemaVersion", "protocol", "nodeId", "publicSigningKey", "displayLabel", "passCommitment",
  "sourceCardId", "sourceRevision", "formationDigest", "gateCommitment", "contextCommitment",
  "issuedAt", "expiresAt", "nonce"
]);
const ACK_FIELDS = Object.freeze([
  "schemaVersion", "protocol", "senderNodeId", "recipientNodeId", "helloDigest", "decision",
  "reasonCode", "issuedAt", "nonce"
]);
const CONTEXT_CARD_PACKET_FIELDS = Object.freeze([
  "schemaVersion", "globalCardId", "revision", "sourceNode", "localCardId", "title", "card"
]);
const FORBIDDEN_HANDSHAKE_FIELDS = Object.freeze([
  "cohortSecretBase64Url", "rendezvousTopic", "stargateAddress", "gatePassToken",
  "invitationToken", "privateKey", "privateKeyPem", "profileRoot", "absolutePath",
  "credential", "bearerToken"
]);

function exactFields(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new TypeError(`${label} has an invalid closed field set`);
}

function text(value) {
  return String(value ?? "").trim();
}

function parseTime(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${label} must be RFC3339 time`);
  return timestamp;
}

function publicKeyBytes(publicKeyBase64Url) {
  const bytes = Buffer.from(publicKeyBase64Url, "base64url");
  if (bytes.length < 32) throw new TypeError("public signing key is invalid");
  return bytes;
}

function nodeIdForPublicKey(publicKeyBase64Url) {
  return `hapa-node:${sha256(publicKeyBytes(publicKeyBase64Url)).slice(0, 32)}`;
}

function signDocument(unsigned, privateKeyPem) {
  return signBytes(null, Buffer.from(canonicalJson(unsigned)), createPrivateKey(privateKeyPem)).toString("base64url");
}

function verifyDocument(unsigned, signature, publicKeyBase64Url) {
  if (typeof signature !== "string" || signature.length < 32) return false;
  const publicKey = createPublicKey({ key: publicKeyBytes(publicKeyBase64Url), format: "der", type: "spki" });
  return verifyBytes(null, Buffer.from(canonicalJson(unsigned)), publicKey, Buffer.from(signature, "base64url"));
}

function signedEnvelope(unsigned, privateKeyPem) {
  return { ...unsigned, signature: signDocument(unsigned, privateKeyPem) };
}

function splitEnvelope(envelope, fields, label) {
  exactFields(envelope, [...fields, "signature"], label);
  const { signature, ...unsigned } = envelope;
  return { unsigned, signature };
}

function deepForbiddenFields(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((entry) => deepForbiddenFields(entry, found));
    return found;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_HANDSHAKE_FIELDS.includes(key)) found.push(key);
    deepForbiddenFields(entry, found);
  }
  return found;
}

function contextFromCard(card = {}) {
  return card.stargateContext || card.enrichment?.media?.stargateContext || null;
}

function derivableFormation(context) {
  return {
    schemaVersion: context.formation.formationSchemaVersion,
    purposeCode: context.formation.purposeCode,
    members: context.formation.members.map((member) => ({ ...member }))
  };
}

export async function openGatePassIdentity(profileRoot, { displayLabel = "Hapa peer" } = {}) {
  const identityPath = path.join(path.resolve(profileRoot), "p2p", "identity.json");
  try {
    const stored = JSON.parse(await readFile(identityPath, "utf8"));
    exactFields(stored, ["schemaVersion", "nodeId", "publicSigningKey", "privateKeyPem", "displayLabel", "createdAt"], "stored identity");
    if (stored.schemaVersion !== "hapa.local-p2p-identity.v1") throw new TypeError("stored identity schema is unsupported");
    if (nodeIdForPublicKey(stored.publicSigningKey) !== stored.nodeId) throw new Error("stored identity node binding failed");
    return { ...stored, identityPath };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicSigningKey = publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  const identity = {
    schemaVersion: "hapa.local-p2p-identity.v1",
    nodeId: nodeIdForPublicKey(publicSigningKey),
    publicSigningKey,
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    displayLabel,
    createdAt: new Date().toISOString()
  };
  await mkdir(path.dirname(identityPath), { recursive: true, mode: 0o700 });
  await writeFile(identityPath, `${JSON.stringify(identity)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return { ...identity, identityPath };
}

export function publicGatePassIdentity(identity) {
  return {
    nodeId: identity.nodeId,
    publicSigningKey: identity.publicSigningKey,
    displayLabel: identity.displayLabel,
    fingerprint: sha256(identity.publicSigningKey).slice(0, 16)
  };
}

export function buildContextCardHandoff({ globalCardId, revision, sourceNode = "hapa-avatar-builder", card } = {}) {
  const expectedRevision = Number(revision || 0);
  const context = contextFromCard(card);
  if (!text(globalCardId).startsWith("hapa-card:v1:") || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new TypeError("Context Card handoff requires stable identity and revision");
  if (!context || context.schemaVersion !== "hapa.stargate-context-card.v1") throw new TypeError("Context Card handoff requires a Stargate Context Card");
  const packet = {
    schemaVersion: CONTEXT_CARD_HANDOFF_SCHEMA,
    globalCardId: text(globalCardId),
    revision: expectedRevision,
    sourceNode: text(sourceNode),
    localCardId: text(card.id),
    title: text(card.title),
    card
  };
  const forbiddenFields = deepForbiddenFields(packet);
  if (forbiddenFields.length) throw new TypeError(`Context Card handoff contains forbidden fields: ${forbiddenFields.join(", ")}`);
  return packet;
}

function gateCommitmentFromDerivation(gate) {
  return sha256({
    schemaVersion: "hapa.stargate-gate-commitment.v1",
    protocolVersion: gate.protocolVersion,
    privacyScope: gate.privacyScope,
    formationDigest: gate.formationDigest,
    rendezvousTopic: gate.rendezvousTopic
  });
}

export function createGatePass({ identity, contextCardPacket, ttlMs = 120_000, now = Date.now(), cohortSecretBase64Url } = {}) {
  if (!identity?.privateKeyPem) throw new TypeError("a signing identity is required");
  if (!text(cohortSecretBase64Url)) throw Object.assign(new Error("A live peer must supply the memory-only Gate capability to issue a fresh Pass."), { code: "gate_pass_live_issuer_required" });
  const packet = verifyContextCardHandoff(contextCardPacket);
  const context = contextFromCard(packet.card);
  const formation = derivableFormation(context);
  const gate = deriveStargate({
    formation,
    protocolVersion: context.gate.protocolVersion,
    privacyScope: context.gate.privacyScope,
    cohortSecretBase64Url
  });
  if (gateCommitmentFromDerivation(gate) !== context.gate.gateCommitment) {
    throw Object.assign(new Error("The live issuer capability does not match the Context Card's committed Gate."), { code: "gate_pass_issuer_gate_mismatch" });
  }
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const unsigned = {
    schemaVersion: GATE_PASS_SCHEMA,
    protocol: GATE_PASS_PROTOCOL,
    passId: randomUUID(),
    issuerNodeId: identity.nodeId,
    issuerPublicKey: identity.publicSigningKey,
    sourceCardId: packet.globalCardId,
    sourceRevision: packet.revision,
    sourceNode: packet.sourceNode,
    formation,
    protocolVersion: context.gate.protocolVersion,
    privacyScope: context.gate.privacyScope,
    cohortSecretBase64Url,
    contextCommitment: context.contextDigest,
    issuedAt,
    expiresAt,
    nonce: randomBytes(18).toString("base64url")
  };
  const envelope = signedEnvelope(unsigned, identity.privateKeyPem);
  const gatePassToken = Buffer.from(canonicalJson(envelope)).toString("base64url");
  return { gatePassToken, gatePass: envelope, safeSummary: gatePassSafeSummary(envelope) };
}

export function parseGatePass(gatePassToken, { now = Date.now(), allowExpired = false } = {}) {
  if (typeof gatePassToken !== "string" || gatePassToken.length < 100) throw new TypeError("Gate Pass token is invalid");
  let gatePass;
  try { gatePass = JSON.parse(Buffer.from(gatePassToken, "base64url").toString("utf8")); }
  catch { throw new TypeError("Gate Pass token is not valid encoded JSON"); }
  const { unsigned, signature } = splitEnvelope(gatePass, PASS_FIELDS, "Gate Pass");
  if (unsigned.schemaVersion !== GATE_PASS_SCHEMA || unsigned.protocol !== GATE_PASS_PROTOCOL) throw new TypeError("Gate Pass protocol is unsupported");
  if (nodeIdForPublicKey(unsigned.issuerPublicKey) !== unsigned.issuerNodeId) throw new Error("Gate Pass node binding failed");
  if (!verifyDocument(unsigned, signature, unsigned.issuerPublicKey)) throw Object.assign(new Error("Gate Pass signature failed"), { code: "gate_pass_signature_failed" });
  const issued = parseTime(unsigned.issuedAt, "GatePass.issuedAt");
  const expires = parseTime(unsigned.expiresAt, "GatePass.expiresAt");
  if (expires <= issued) throw new Error("Gate Pass expiry is invalid");
  if (!allowExpired && expires <= now) throw Object.assign(new Error("Gate Pass expired"), { code: "gate_pass_expired" });
  if (!text(unsigned.sourceCardId).startsWith("hapa-card:v1:") || !Number.isSafeInteger(unsigned.sourceRevision) || unsigned.sourceRevision < 1) throw new Error("Gate Pass Card binding is invalid");
  const secret = Buffer.from(unsigned.cohortSecretBase64Url, "base64url");
  if (secret.length !== 32) throw new Error("Gate Pass cohort secret must contain 32 bytes");
  const gate = deriveStargate({
    formation: unsigned.formation,
    protocolVersion: unsigned.protocolVersion,
    privacyScope: unsigned.privacyScope,
    cohortSecretBase64Url: unsigned.cohortSecretBase64Url
  });
  return { gatePass, gatePassToken, gate, safeSummary: gatePassSafeSummary(gatePass) };
}

export function gatePassSafeSummary(gatePass) {
  const { unsigned } = splitEnvelope(gatePass, PASS_FIELDS, "Gate Pass");
  const gate = deriveStargate({
    formation: unsigned.formation,
    protocolVersion: unsigned.protocolVersion,
    privacyScope: unsigned.privacyScope,
    cohortSecretBase64Url: unsigned.cohortSecretBase64Url
  });
  return {
    schemaVersion: "hapa.stargate-gate-pass-summary.v1",
    passId: unsigned.passId,
    issuerNodeId: unsigned.issuerNodeId,
    sourceCardId: unsigned.sourceCardId,
    sourceRevision: unsigned.sourceRevision,
    sourceNode: unsigned.sourceNode,
    passCommitment: sha256(gatePass),
    formationDigest: gate.formationDigest,
    gateCommitment: gateCommitmentFromDerivation(gate),
    contextCommitment: unsigned.contextCommitment,
    stargateAddressRedacted: `${gate.stargateAddress.slice(0, 12)}…${gate.stargateAddress.slice(-8)}`,
    issuedAt: unsigned.issuedAt,
    expiresAt: unsigned.expiresAt,
    secretWithheld: true,
    topicWithheld: true,
    fullAddressWithheld: true,
    persisted: false
  };
}

export function verifyContextCardHandoff(packet, parsedGatePass = null) {
  exactFields(packet, CONTEXT_CARD_PACKET_FIELDS, "Context Card handoff");
  if (packet.schemaVersion !== CONTEXT_CARD_HANDOFF_SCHEMA) throw new TypeError("Context Card handoff protocol is unsupported");
  const context = contextFromCard(packet.card);
  if (!context || context.schemaVersion !== "hapa.stargate-context-card.v1") throw new TypeError("Context Card handoff is not a Stargate Context Card");
  const forbiddenFields = deepForbiddenFields(packet);
  if (forbiddenFields.length) throw new Error("Context Card handoff contains forbidden private fields");
  const checks = {
    sourceCardId: !parsedGatePass || packet.globalCardId === parsedGatePass.safeSummary.sourceCardId,
    sourceRevision: !parsedGatePass || packet.revision === parsedGatePass.safeSummary.sourceRevision,
    sourceNode: !parsedGatePass || packet.sourceNode === parsedGatePass.safeSummary.sourceNode,
    formationDigest: !parsedGatePass || context.gate?.semanticFormationDigest === parsedGatePass.safeSummary.formationDigest,
    gateCommitment: !parsedGatePass || context.gate?.gateCommitment === parsedGatePass.safeSummary.gateCommitment,
    contextCommitment: !parsedGatePass || context.contextDigest === parsedGatePass.safeSummary.contextCommitment
  };
  if (!Object.values(checks).every(Boolean)) throw Object.assign(new Error("Context Card and Gate Pass commitments do not match"), { code: "gate_pass_context_mismatch", checks });
  return { ...packet, packetDigest: sha256(packet), checks, forbiddenFields };
}

export function createGatePassHello({ identity, parsedGatePass, now = Date.now(), ttlMs = 60_000 } = {}) {
  const summary = parsedGatePass.safeSummary;
  const unsigned = {
    schemaVersion: GATE_PASS_HELLO_SCHEMA,
    protocol: GATE_PASS_PROTOCOL,
    nodeId: identity.nodeId,
    publicSigningKey: identity.publicSigningKey,
    displayLabel: identity.displayLabel,
    passCommitment: summary.passCommitment,
    sourceCardId: summary.sourceCardId,
    sourceRevision: summary.sourceRevision,
    formationDigest: summary.formationDigest,
    gateCommitment: summary.gateCommitment,
    contextCommitment: summary.contextCommitment,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    nonce: randomBytes(18).toString("base64url")
  };
  return signedEnvelope(unsigned, identity.privateKeyPem);
}

export function verifyGatePassHello(hello, { parsedGatePass, now = Date.now() } = {}) {
  const { unsigned, signature } = splitEnvelope(hello, HELLO_FIELDS, "Gate Pass hello");
  if (unsigned.schemaVersion !== GATE_PASS_HELLO_SCHEMA || unsigned.protocol !== GATE_PASS_PROTOCOL) throw new TypeError("Gate Pass hello protocol is unsupported");
  if (nodeIdForPublicKey(unsigned.publicSigningKey) !== unsigned.nodeId) throw new Error("Gate Pass hello node binding failed");
  if (!verifyDocument(unsigned, signature, unsigned.publicSigningKey)) throw new Error("Gate Pass hello signature failed");
  if (parseTime(unsigned.expiresAt, "GatePassHello.expiresAt") <= now) throw Object.assign(new Error("Gate Pass hello expired"), { code: "gate_pass_hello_expired" });
  const expected = parsedGatePass.safeSummary;
  const checks = {
    passCommitment: unsigned.passCommitment === expected.passCommitment,
    sourceCardId: unsigned.sourceCardId === expected.sourceCardId,
    sourceRevision: unsigned.sourceRevision === expected.sourceRevision,
    formationDigest: unsigned.formationDigest === expected.formationDigest,
    gateCommitment: unsigned.gateCommitment === expected.gateCommitment,
    contextCommitment: unsigned.contextCommitment === expected.contextCommitment,
    nodeBinding: true,
    signature: true,
    fresh: true
  };
  const forbiddenFields = deepForbiddenFields(hello);
  const matched = Object.values(checks).every(Boolean) && forbiddenFields.length === 0;
  return { matched, checks, forbiddenFields, helloDigest: sha256(hello), peer: { nodeId: unsigned.nodeId, publicSigningKey: unsigned.publicSigningKey, displayLabel: unsigned.displayLabel } };
}

export function createGatePassAcknowledgement({ identity, peerNodeId, helloDigest, decision, reasonCode, now = Date.now() } = {}) {
  if (!["accepted", "declined", "blocked", "mismatch", "expired"].includes(decision)) throw new TypeError("Gate Pass acknowledgement decision is unsupported");
  const unsigned = {
    schemaVersion: GATE_PASS_ACK_SCHEMA,
    protocol: GATE_PASS_PROTOCOL,
    senderNodeId: identity.nodeId,
    recipientNodeId: peerNodeId,
    helloDigest,
    decision,
    reasonCode,
    issuedAt: new Date(now).toISOString(),
    nonce: randomBytes(18).toString("base64url")
  };
  return signedEnvelope(unsigned, identity.privateKeyPem);
}

export function verifyGatePassAcknowledgement(acknowledgement, { expectedSender, expectedRecipient, expectedHelloDigest } = {}) {
  const { unsigned, signature } = splitEnvelope(acknowledgement, ACK_FIELDS, "Gate Pass acknowledgement");
  if (unsigned.senderNodeId !== expectedSender.nodeId || unsigned.recipientNodeId !== expectedRecipient) throw new Error("Gate Pass acknowledgement participant binding failed");
  if (unsigned.helloDigest !== expectedHelloDigest) throw new Error("Gate Pass acknowledgement hello binding failed");
  if (!verifyDocument(unsigned, signature, expectedSender.publicSigningKey)) throw new Error("Gate Pass acknowledgement signature failed");
  const forbiddenFields = deepForbiddenFields(acknowledgement);
  if (forbiddenFields.length) throw new Error("Gate Pass acknowledgement contains forbidden private fields");
  return { verified: true, decision: unsigned.decision, reasonCode: unsigned.reasonCode, signatureVerified: true };
}

export function selectGatePassDecision({ verification, localConsent = false, peerNodeId, blockedNodeIds = [] } = {}) {
  if (blockedNodeIds.includes(peerNodeId)) return { decision: "blocked", reasonCode: "peer_blocked_by_local_policy" };
  if (!verification.matched) return { decision: "mismatch", reasonCode: "signed_card_and_gate_commitments_do_not_match" };
  if (localConsent !== true) return { decision: "declined", reasonCode: "explicit_local_consent_required" };
  return { decision: "accepted", reasonCode: "same_signed_pass_exact_card_and_explicit_local_consent" };
}

export function assertGatePassLeakFree(value, secrets = []) {
  const forbiddenFields = deepForbiddenFields(value);
  const serialized = canonicalJson(value);
  const leakedSecrets = secrets.filter((secret) => typeof secret === "string" && secret.length > 0 && serialized.includes(secret));
  return { passed: forbiddenFields.length === 0 && leakedSecrets.length === 0, forbiddenFields, leakedSecretCount: leakedSecrets.length };
}
