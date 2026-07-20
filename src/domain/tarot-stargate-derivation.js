import { blake2b } from "@noble/hashes/blake2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as sha256Bytes } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

// Adopted from the tested Build Week reference implementation at
// hapa-tarot-stargate-reference@9e5930501c6563529a9e21be3b7f5574d10768af.
// Keep the semantic and private-address algorithms byte-compatible with that donor.
export const STARGATE_PROTOCOL_VERSION = "hapa.stargate.v1";
export const STARGATE_FORMATION_SCHEMA = "hapa.formation.v1";
export const STARGATE_DERIVATION_SCHEMA = "hapa.stargate-derivation.v1";
export const STARGATE_SEMANTIC_FORMATION_SCHEMA = "hapa.stargate-semantic-formation.v1";
export const STARGATE_PUBLIC_DEMO_SECRET = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
export const STARGATE_PRIVACY_SCOPES = Object.freeze(["invite_only", "private_cohort"]);
export const STARGATE_FORMATION_ROLES = Object.freeze(["anchor", "lens", "participant", "resource", "sentinel", "result"]);
export const STARGATE_EXCLUDED_CONTEXT = Object.freeze([
  "display labels",
  "local paths and media URLs",
  "Tarot projection pose and 3D coordinates",
  "camera and device pose",
  "Phone/Webcam presence",
  "stream state",
  "transport state"
]);

const PROTOCOL_VERSION = /^hapa\.stargate\.v([1-9][0-9]*)$/;
const SECRET_BASE64URL = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

function exactObject(value, path, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  for (const field of fields) if (!Object.hasOwn(value, field)) throw new TypeError(`${path}.${field} is required`);
  for (const field of Object.keys(value)) if (!fields.includes(field)) throw new TypeError(`${path}.${field} is not allowed`);
}

function requiredText(value, path) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${path} must be a non-empty string`);
  return value.trim();
}

function canonicalValue(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Undefined value at ${path}.${key}`);
      return [key, canonicalValue(value[key], `${path}.${key}`)];
    }));
  }
  throw new TypeError(`Unsupported ${typeof value} value at ${path}`);
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function protocolMajor(protocolVersion) {
  const value = requiredText(protocolVersion, "$.protocolVersion");
  const match = PROTOCOL_VERSION.exec(value);
  if (!match) throw new TypeError("$.protocolVersion must use hapa.stargate.v<positive integer>");
  return Number(match[1]);
}

function decodeCohortSecret(value) {
  if (typeof value !== "string" || !SECRET_BASE64URL.test(value)) {
    throw new TypeError("$.cohortSecretBase64Url must be canonical unpadded base64url for exactly 32 bytes");
  }
  const base64 = `${value.replace(/-/g, "+").replace(/_/g, "/") }=`;
  let binary;
  try {
    binary = globalThis.atob(base64);
  } catch {
    throw new TypeError("$.cohortSecretBase64Url is invalid base64url");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== 32) throw new TypeError("$.cohortSecretBase64Url must decode to exactly 32 bytes");
  return bytes;
}

function concatBytes(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function canonicalFormationDigest(formation) {
  exactObject(formation, "$.formation", ["schemaVersion", "purposeCode", "members"]);
  if (formation.schemaVersion !== STARGATE_FORMATION_SCHEMA) {
    throw new TypeError(`$.formation.schemaVersion must equal ${STARGATE_FORMATION_SCHEMA}`);
  }
  requiredText(formation.purposeCode, "$.formation.purposeCode");
  if (!Array.isArray(formation.members) || formation.members.length < 2 || formation.members.length > 8) {
    throw new TypeError("$.formation.members must contain two to eight durable Cards");
  }
  const positions = new Set();
  formation.members.forEach((member, index) => {
    const path = `$.formation.members[${index}]`;
    exactObject(member, path, ["position", "role", "cardId", "cardCoreKey", "cardRevisionId", "cardRecordDigest", "orientation"]);
    if (!Number.isInteger(member.position) || member.position < 0 || positions.has(member.position)) {
      throw new TypeError(`${path}.position must be a unique non-negative integer`);
    }
    positions.add(member.position);
    requiredText(member.cardId, `${path}.cardId`);
    requiredText(member.cardCoreKey, `${path}.cardCoreKey`);
    requiredText(member.cardRevisionId, `${path}.cardRevisionId`);
    if (!DIGEST.test(member.cardRecordDigest)) throw new TypeError(`${path}.cardRecordDigest must be a lowercase SHA-256 digest`);
    if (!STARGATE_FORMATION_ROLES.includes(member.role)) throw new TypeError(`${path}.role is unsupported`);
    if (!["upright", "reversed"].includes(member.orientation)) throw new TypeError(`${path}.orientation is unsupported`);
  });
  return bytesToHex(sha256Bytes(new TextEncoder().encode(canonicalJson(formation))));
}

export function canonicalizeStargateFormation({ formation, protocolVersion = STARGATE_PROTOCOL_VERSION, privacyScope = "invite_only" }) {
  const major = protocolMajor(protocolVersion);
  if (!STARGATE_PRIVACY_SCOPES.includes(privacyScope)) throw new TypeError("$.privacyScope is unsupported");
  canonicalFormationDigest(formation);
  const members = formation.members.slice().sort((left, right) => left.position - right.position);
  members.forEach((member, index) => {
    if (member.position !== index) throw new TypeError("$.formation.members positions must be contiguous from zero");
  });
  return {
    schemaVersion: STARGATE_SEMANTIC_FORMATION_SCHEMA,
    protocolVersion,
    protocolMajor: major,
    privacyScope,
    formationSchemaVersion: formation.schemaVersion,
    purposeCode: requiredText(formation.purposeCode, "$.formation.purposeCode"),
    members: members.map((member) => ({ ...member }))
  };
}

export function deriveStargate(input) {
  exactObject(input, "$", ["formation", "protocolVersion", "privacyScope", "cohortSecretBase64Url"]);
  const canonicalFormation = canonicalizeStargateFormation(input);
  const formationDigestBytes = blake2b(new TextEncoder().encode(canonicalJson(canonicalFormation)), { dkLen: 32 });
  const formationDigest = bytesToHex(formationDigestBytes);
  const secret = decodeCohortSecret(input.cohortSecretBase64Url);
  const domain = new TextEncoder().encode(`hapa.stargate.rendezvous.v${canonicalFormation.protocolMajor}`);
  const rendezvousTopicBytes = hmac(sha256Bytes, secret, concatBytes(domain, new Uint8Array([0]), hexToBytes(formationDigest)));
  const rendezvousTopic = bytesToHex(rendezvousTopicBytes);
  return {
    schemaVersion: STARGATE_DERIVATION_SCHEMA,
    protocolVersion: canonicalFormation.protocolVersion,
    privacyScope: canonicalFormation.privacyScope,
    formationDigest,
    rendezvousTopic,
    stargateAddress: `hapa-gate:v${canonicalFormation.protocolMajor}:${base32(rendezvousTopicBytes)}`,
    canonicalFormation,
    secretPolicy: "request-memory-only; never returned, persisted, logged, or committed",
    discoveryPolicy: "private capability topic; public semantic discovery is not implemented",
    excludedContext: [...STARGATE_EXCLUDED_CONTEXT]
  };
}

export function redactedStargateAddress(address) {
  const value = requiredText(address, "address");
  const parts = value.split(":");
  if (parts.length !== 3 || !parts[2]) throw new TypeError("address must be a Hapa Gate address");
  return `${parts[0]}:${parts[1]}:${parts[2].slice(0, 10)}…${parts[2].slice(-8)}`;
}

export function createMemoryOnlyCohortSecret() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function resolveStargateCardIdentity(card = {}, entry = null, position = 0) {
  const cardId = String(card.cardId || card.id || "").trim();
  const cardCoreKey = String(card.cardCoreKey || card.hypercore?.key || card.custody?.cardCoreKey || "").trim().toLowerCase();
  const cardRevisionId = String(card.cardRevisionId || card.revisionId || card.semanticVersion || card.revision || "").trim();
  const cardRecordDigest = String(card.cardRecordDigest || card.recordDigest || card.custody?.recordDigest || "").trim().toLowerCase();
  const role = STARGATE_FORMATION_ROLES.includes(card.stargateRole) ? card.stargateRole : STARGATE_FORMATION_ROLES[position] || "participant";
  const missing = [];
  if (!cardId) missing.push("cardId");
  if (!DIGEST.test(cardCoreKey)) missing.push("cardCoreKey");
  if (!cardRevisionId) missing.push("cardRevisionId");
  if (!DIGEST.test(cardRecordDigest)) missing.push("cardRecordDigest");
  return {
    ok: missing.length === 0,
    missing,
    member: {
      position,
      role,
      cardId,
      cardCoreKey,
      cardRevisionId,
      cardRecordDigest,
      orientation: entry?.flipped ? "reversed" : "upright"
    }
  };
}

function publicDemoCardImage({ title, role, accent, symbol }) {
  const safeTitle = String(title).replaceAll("&", "&amp;");
  const safeRole = String(role).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152">
    <defs>
      <radialGradient id="a" cx="50%" cy="38%" r="66%"><stop offset="0" stop-color="${accent}" stop-opacity=".72"/><stop offset=".48" stop-color="#071b2d"/><stop offset="1" stop-color="#020617"/></radialGradient>
      <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00f3ff"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="#ff6df2"/></linearGradient>
      <filter id="g"><feGaussianBlur stdDeviation="14"/></filter>
    </defs>
    <rect width="768" height="1152" rx="42" fill="#020617"/>
    <rect x="22" y="22" width="724" height="1108" rx="30" fill="url(#a)" stroke="url(#b)" stroke-width="8"/>
    <circle cx="384" cy="410" r="254" fill="none" stroke="${accent}" stroke-opacity=".3" stroke-width="28" filter="url(#g)"/>
    <circle cx="384" cy="410" r="236" fill="none" stroke="#00f3ff" stroke-opacity=".58" stroke-width="5" stroke-dasharray="18 14"/>
    <circle cx="384" cy="410" r="176" fill="none" stroke="#f6c96d" stroke-width="8" stroke-dasharray="8 17"/>
    <path d="M384 158 601 533 167 533Z" fill="none" stroke="${accent}" stroke-opacity=".72" stroke-width="7"/>
    <path d="M166 410h436M384 192v436" stroke="#f8f3e7" stroke-opacity=".18" stroke-width="3"/>
    <circle cx="384" cy="410" r="96" fill="#020617" stroke="url(#b)" stroke-width="11"/>
    <text x="384" y="444" text-anchor="middle" font-size="112" font-family="ui-monospace,monospace" font-weight="900" fill="#f8f3e7">${symbol}</text>
    <text x="62" y="78" font-size="26" font-family="ui-monospace,monospace" font-weight="900" letter-spacing="7" fill="${accent}">HAPA STARGATE</text>
    <text x="384" y="804" text-anchor="middle" font-size="54" font-family="Inter,system-ui,sans-serif" font-weight="900" fill="#f8f3e7">${safeTitle}</text>
    <text x="384" y="864" text-anchor="middle" font-size="25" font-family="ui-monospace,monospace" font-weight="800" letter-spacing="9" fill="${accent}">${safeRole}</text>
    <path d="M112 940h544" stroke="url(#b)" stroke-width="5"/>
    <text x="384" y="1002" text-anchor="middle" font-size="22" font-family="ui-monospace,monospace" fill="#9bd8e7">PUBLIC DETERMINISTIC VECTOR</text>
    <text x="384" y="1043" text-anchor="middle" font-size="19" font-family="ui-monospace,monospace" fill="#f6c96d">BUILD WEEK / NOT A LIVE INVITATION</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildPublicDemoGateCards() {
  const specs = [
    ["hapa-card:content:red-demo", "Creator Signal", "anchor", "b", "c", "RED", "#ff5b6e", "△"],
    ["hapa-card:sponsor:build-week", "Sponsor Energy", "resource", "d", "e", "SP", "#f6c96d", "◇"],
    ["hapa-card:protocol:evidence-lens", "Evidence Lens", "lens", "1", "2", "EV", "#00f3ff", "◎"],
    ["hapa-card:protocol:human-authority", "Human Authority", "sentinel", "3", "4", "HU", "#45f2c8", "✦"]
  ];
  return specs.map(([cardId, title, role, core, digest, tarotNumber, accent, symbol]) => {
    const imageUri = publicDemoCardImage({ title, role, accent, symbol });
    return {
      id: cardId,
      cardId,
      title,
      subtitle: "Build Week public deterministic test vector",
      summary: `Public test Card occupying the ${role} position. It is not a production invitation or minted commercial Card.`,
      cardType: role === "resource" ? "creator_sponsor_card" : role === "anchor" ? "creator_content_card" : "protocol_card",
      cardCoreKey: core.repeat(64),
      cardRevisionId: "r1",
      cardRecordDigest: digest.repeat(64),
      stargateRole: role,
      tarotNumber,
      accent,
      imageUri,
      posterUri: imageUri,
      truthStatus: "public_test_vector",
      lifecycleStatus: "fixture",
      keywords: [role, "stargate", "build-week", "public-test-vector"],
      tags: ["stargate-demo", "public-test-vector", role]
    };
  });
}
