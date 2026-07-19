import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign as signBytes,
  verify as verifyBytes
} from "node:crypto";

import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";

export const CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL = "hapa.card-origin-announcement-p2p.v1";
export const CARD_ORIGIN_ANNOUNCEMENT_SCHEMA = "hapa.card-origin-announcement.v1";
export const CARD_ORIGIN_ACK_SCHEMA = "hapa.card-origin-announcement-ack.v1";
export const CARD_ORIGIN_ANNOUNCEMENT_PROOF_SCHEMA = "hapa.card-origin-announcement-proof.v1";

const ANNOUNCEMENT_FIELDS = Object.freeze([
  "schemaVersion", "protocol", "announcementId", "senderNodeId", "senderPublicKey",
  "cardId", "revision", "originEventId", "originEventDigest", "originSequence",
  "contentDigest", "decisionDigest", "issuedAt", "nonce"
]);
const ACK_FIELDS = Object.freeze([
  "schemaVersion", "protocol", "receiverNodeId", "receiverPublicKey", "announcementDigest",
  "decision", "receivedAt", "nonce"
]);

function exactFields(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new TypeError(`${label} has an invalid closed field set`);
}

function required(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

function publicKeyBytes(publicKeyBase64Url) {
  const bytes = Buffer.from(required(publicKeyBase64Url, "public signing key"), "base64url");
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
  const publicKey = createPublicKey({ key: publicKeyBytes(publicKeyBase64Url), format: "der", type: "spki" });
  return verifyBytes(null, Buffer.from(canonicalJson(unsigned)), publicKey, Buffer.from(required(signature, "signature"), "base64url"));
}

function signed(unsigned, privateKeyPem) {
  return { ...unsigned, signature: signDocument(unsigned, privateKeyPem) };
}

function split(envelope, fields, label) {
  exactFields(envelope, [...fields, "signature"], label);
  const { signature, ...unsigned } = envelope;
  return { unsigned, signature };
}

function digest(value, label) {
  const normalized = required(value, label).replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} must be SHA-256`);
  return `sha256:${normalized}`;
}

export function createCardOriginAnnouncement({ identity, origin, decisionDigest, now = Date.now() } = {}) {
  if (!identity?.privateKeyPem) throw new TypeError("a signing identity is required");
  const revision = Number(origin?.revision || 0);
  const originSequence = Number(origin?.originSequence || 0);
  if (!Number.isSafeInteger(revision) || revision < 1 || !Number.isSafeInteger(originSequence) || originSequence < 1) throw new TypeError("origin revision and sequence must be positive integers");
  const unsigned = {
    schemaVersion: CARD_ORIGIN_ANNOUNCEMENT_SCHEMA,
    protocol: CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL,
    announcementId: randomUUID(),
    senderNodeId: identity.nodeId,
    senderPublicKey: identity.publicSigningKey,
    cardId: required(origin.cardId, "origin.cardId"),
    revision,
    originEventId: required(origin.eventId, "origin.eventId"),
    originEventDigest: digest(origin.eventDigest, "origin.eventDigest"),
    originSequence,
    contentDigest: digest(origin.contentDigest, "origin.contentDigest"),
    decisionDigest: digest(decisionDigest, "decisionDigest"),
    issuedAt: new Date(now).toISOString(),
    nonce: randomBytes(18).toString("base64url")
  };
  return signed(unsigned, identity.privateKeyPem);
}

export function verifyCardOriginAnnouncement(envelope) {
  const { unsigned, signature } = split(envelope, ANNOUNCEMENT_FIELDS, "Card origin announcement");
  if (unsigned.schemaVersion !== CARD_ORIGIN_ANNOUNCEMENT_SCHEMA || unsigned.protocol !== CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL) throw new TypeError("Card origin announcement protocol is unsupported");
  if (nodeIdForPublicKey(unsigned.senderPublicKey) !== unsigned.senderNodeId) throw new Error("Card origin announcement node binding failed");
  if (!verifyDocument(unsigned, signature, unsigned.senderPublicKey)) throw new Error("Card origin announcement signature failed");
  digest(unsigned.originEventDigest, "originEventDigest");
  digest(unsigned.contentDigest, "contentDigest");
  digest(unsigned.decisionDigest, "decisionDigest");
  return { verified: true, announcementDigest: sha256(envelope), announcement: unsigned };
}

export function createCardOriginAcknowledgement({ identity, announcementDigest, now = Date.now() } = {}) {
  if (!identity?.privateKeyPem) throw new TypeError("a receiving signing identity is required");
  const unsigned = {
    schemaVersion: CARD_ORIGIN_ACK_SCHEMA,
    protocol: CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL,
    receiverNodeId: identity.nodeId,
    receiverPublicKey: identity.publicSigningKey,
    announcementDigest: digest(announcementDigest, "announcementDigest"),
    decision: "received_exact_origin_event",
    receivedAt: new Date(now).toISOString(),
    nonce: randomBytes(18).toString("base64url")
  };
  return signed(unsigned, identity.privateKeyPem);
}

export function verifyCardOriginAcknowledgement(envelope, { announcementDigest } = {}) {
  const { unsigned, signature } = split(envelope, ACK_FIELDS, "Card origin acknowledgement");
  if (unsigned.schemaVersion !== CARD_ORIGIN_ACK_SCHEMA || unsigned.protocol !== CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL) throw new TypeError("Card origin acknowledgement protocol is unsupported");
  if (nodeIdForPublicKey(unsigned.receiverPublicKey) !== unsigned.receiverNodeId) throw new Error("Card origin acknowledgement node binding failed");
  if (unsigned.announcementDigest !== digest(announcementDigest, "announcementDigest")) throw new Error("Card origin acknowledgement digest binding failed");
  if (!verifyDocument(unsigned, signature, unsigned.receiverPublicKey)) throw new Error("Card origin acknowledgement signature failed");
  return { verified: true, receiverNodeId: unsigned.receiverNodeId, decision: unsigned.decision, receivedAt: unsigned.receivedAt, acknowledgementDigest: sha256(envelope) };
}

export function cardOriginAnnouncementTopic(envelope) {
  const verified = verifyCardOriginAnnouncement(envelope);
  return Buffer.from(sha256(`${CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL}\0${verified.announcementDigest}`), "hex");
}
