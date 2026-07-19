import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  STARGATE_PROTOCOL_VERSION,
  redactedStargateAddress
} from "./tarot-stargate-derivation.js";

export const STARGATE_CONTEXT_CARD_SCHEMA = "hapa.stargate-context-card.v1";
export const STARGATE_CONTEXT_RESTORE_SCHEMA = "hapa.stargate-context-restore.v1";
export const STARGATE_CONTEXT_MINT_REVIEW_SCHEMA = "hapa.stargate-context-mint-review.v1";
export const STARGATE_CONTEXT_CONNECTION_POLICY = "requires-fresh-gate-pass";

const DIGEST = /^[a-f0-9]{64}$/;
const FULL_GATE_ADDRESS = /hapa-gate:v[1-9][0-9]*:[a-z2-7]{52}/i;
const FORBIDDEN_KEYS = /(?:cohort.?secret|rendezvous.?topic|raw.?invite|invitation.?token|gate.?pass|private.?key|bearer|credential|profile.?path)/i;
const LOCAL_PATH = /^(?:file:\/\/|\/Users\/|\/var\/folders\/|[A-Za-z]:\\)/;

function canonicalValue(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  if (value && typeof value === "object") {
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

function digest(value) {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(value))));
}

function shortDigest(value, length = 16) {
  return String(value || "").replace(/^sha256:/, "").slice(0, length);
}

function requiredText(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be a non-empty string`);
  return value.trim();
}

function safeClone(value, stats = { omittedLocalReferences: 0 }, key = "") {
  if (Array.isArray(value)) return value.map((entry) => safeClone(entry, stats, key));
  if (value && typeof value === "object") {
    const result = {};
    for (const [nextKey, nextValue] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(nextKey)) continue;
      result[nextKey] = safeClone(nextValue, stats, nextKey);
    }
    return result;
  }
  if (typeof value === "string") {
    if (FULL_GATE_ADDRESS.test(value)) return value.replace(FULL_GATE_ADDRESS, "hapa-gate:redacted");
    if (LOCAL_PATH.test(value)) {
      stats.omittedLocalReferences += 1;
      return `[local-reference-omitted:${key || "value"}]`;
    }
  }
  return value;
}

function sceneSnapshotFromCard(card = {}) {
  return card.sceneSnapshot || card.drawScene?.snapshot || card.enrichment?.media?.sceneSnapshot || card.enrichment?.media?.drawScene?.snapshot || null;
}

export function stargateContextEnvelopeFromCard(card = {}) {
  return card.stargateContext || card.enrichment?.media?.stargateContext || null;
}

export function isStargateContextCard(card = {}) {
  return stargateContextEnvelopeFromCard(card)?.schemaVersion === STARGATE_CONTEXT_CARD_SCHEMA;
}

export function stargateGateCommitment(stargate = {}) {
  const rendezvousTopic = requiredText(stargate.rendezvousTopic, "$.stargate.rendezvousTopic");
  if (!DIGEST.test(rendezvousTopic)) throw new TypeError("$.stargate.rendezvousTopic must be a lowercase SHA-256 digest");
  return digest({
    schemaVersion: "hapa.stargate-gate-commitment.v1",
    protocolVersion: requiredText(stargate.protocolVersion || STARGATE_PROTOCOL_VERSION, "$.stargate.protocolVersion"),
    privacyScope: requiredText(stargate.privacyScope, "$.stargate.privacyScope"),
    formationDigest: requiredText(stargate.formationDigest, "$.stargate.formationDigest"),
    rendezvousTopic
  });
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function contextCardArtwork({ title, envelope }) {
  const members = envelope.formation.members;
  const count = Math.max(1, members.length);
  const orbit = members.map((member, index) => {
    const angle = -Math.PI / 2 + index / count * Math.PI * 2;
    const x = 384 + Math.cos(angle) * 218;
    const y = 418 + Math.sin(angle) * 218;
    const hue = ["#ff5b6e", "#f6c96d", "#00f3ff", "#45f2c8", "#ff6df2", "#7aa7ff", "#a472ff", "#f8f3e7"][index % 8];
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="34" fill="#06111f" stroke="${hue}" stroke-width="7"/><text x="${x.toFixed(1)}" y="${(y + 8).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="22" font-weight="900" fill="#f8f3e7">${index + 1}</text></g>`;
  }).join("");
  const safeTitle = escapeXml(title);
  const fingerprint = escapeXml(envelope.gate.semanticFormationDigest.slice(0, 16).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152">
    <defs>
      <radialGradient id="void" cx="50%" cy="34%" r="66%"><stop offset="0" stop-color="#0b92b8"/><stop offset=".24" stop-color="#072d53"/><stop offset=".58" stop-color="#0b102d"/><stop offset="1" stop-color="#020617"/></radialGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00f3ff"/><stop offset=".45" stop-color="#f6c96d"/><stop offset=".75" stop-color="#ff6df2"/><stop offset="1" stop-color="#45f2c8"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="13" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="768" height="1152" rx="44" fill="#020617"/>
    <path d="M44 18h680l26 26v1064l-26 26H44l-26-26V44z" fill="url(#void)" stroke="url(#edge)" stroke-width="10"/>
    <circle cx="384" cy="418" r="247" fill="#010510" stroke="#142b3f" stroke-width="34"/>
    <circle cx="384" cy="418" r="226" fill="none" stroke="url(#edge)" stroke-width="11" stroke-dasharray="22 12" filter="url(#glow)"/>
    <circle cx="384" cy="418" r="171" fill="url(#void)" stroke="#00f3ff" stroke-opacity=".78" stroke-width="5"/>
    <path d="M292 418c34-72 150-72 184 0-34 72-150 72-184 0Z" fill="none" stroke="#f8f3e7" stroke-opacity=".7" stroke-width="7"/>
    <circle cx="384" cy="418" r="42" fill="#00f3ff" fill-opacity=".24" stroke="#f6c96d" stroke-width="8" filter="url(#glow)"/>
    ${orbit}
    <text x="384" y="86" text-anchor="middle" font-family="ui-monospace,monospace" font-size="25" font-weight="900" letter-spacing="8" fill="#00f3ff">HAPA STARGATE</text>
    <text x="384" y="742" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="46" font-weight="900" fill="#f8f3e7">${safeTitle}</text>
    <text x="384" y="800" text-anchor="middle" font-family="ui-monospace,monospace" font-size="22" font-weight="900" letter-spacing="7" fill="#f6c96d">CONTEXT CARD · PROPOSED</text>
    <path d="M112 842h544" stroke="url(#edge)" stroke-width="5"/>
    <text x="384" y="902" text-anchor="middle" font-family="ui-monospace,monospace" font-size="20" fill="#9bd8e7">${count} ORDERED CARDS · ${escapeXml(envelope.gate.privacyScope.toUpperCase())}</text>
    <text x="384" y="950" text-anchor="middle" font-family="ui-monospace,monospace" font-size="19" fill="#f8f3e7">FORMATION ${fingerprint}</text>
    <rect x="142" y="990" width="484" height="72" rx="10" fill="#071523" stroke="#ff5b6e" stroke-width="3"/>
    <text x="384" y="1020" text-anchor="middle" font-family="ui-monospace,monospace" font-size="17" font-weight="900" fill="#ff8794">FRESH GATE PASS REQUIRED</text>
    <text x="384" y="1048" text-anchor="middle" font-family="ui-monospace,monospace" font-size="14" fill="#9bd8e7">NO SECRET · NO AUTO-CONNECT · RESTORABLE</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function validateStargateContextEnvelope(envelope = {}) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new TypeError("Stargate Context envelope must be an object");
  if (envelope.schemaVersion !== STARGATE_CONTEXT_CARD_SCHEMA) throw new TypeError(`Unsupported Stargate Context schema: ${envelope.schemaVersion || "missing"}`);
  if (!DIGEST.test(envelope.contextDigest || "")) throw new TypeError("Stargate Context contextDigest is invalid");
  if (!DIGEST.test(envelope.scene?.snapshotDigest || "")) throw new TypeError("Stargate Context scene snapshotDigest is invalid");
  if (!DIGEST.test(envelope.gate?.semanticFormationDigest || "")) throw new TypeError("Stargate Context semantic Formation digest is invalid");
  if (!DIGEST.test(envelope.gate?.gateCommitment || "")) throw new TypeError("Stargate Context Gate commitment is invalid");
  if (envelope.connectionPolicy !== STARGATE_CONTEXT_CONNECTION_POLICY) throw new TypeError("Stargate Context must require a fresh Gate Pass");
  if (!Array.isArray(envelope.formation?.members) || envelope.formation.members.length < 2 || envelope.formation.members.length > 8) throw new TypeError("Stargate Context Formation must contain two to eight ordered Cards");
  envelope.formation.members.forEach((member, index) => {
    if (member.position !== index) throw new TypeError("Stargate Context Formation positions must be contiguous and ordered");
  });
  const { contextDigest, ...unsigned } = envelope;
  if (digest(unsigned) !== contextDigest) throw new TypeError("Stargate Context digest does not match the safe envelope");
  const serialized = canonicalJson(envelope);
  if (FULL_GATE_ADDRESS.test(serialized)) throw new TypeError("Stargate Context contains a full private address");
  return envelope;
}

export function stargateContextMintReview(card = {}) {
  const envelope = validateStargateContextEnvelope(stargateContextEnvelopeFromCard(card));
  restoreStargateContextCard(card);
  const safeReview = {
    schemaVersion: STARGATE_CONTEXT_MINT_REVIEW_SCHEMA,
    cardId: requiredText(card.id, "$.card.id"),
    title: String(card.title || "Stargate Context Card"),
    sourceRevisionId: String(envelope.revisionId || "r1"),
    truthStatus: String(envelope.truthStatus || "proposed_unminted"),
    origin: {
      nodeId: String(envelope.origin?.nodeId || ""),
      actorId: String(envelope.origin?.actorId || ""),
      sourceSceneCardId: String(envelope.origin?.sourceSceneCardId || "")
    },
    scene: {
      snapshotId: String(envelope.scene?.snapshotId || ""),
      snapshotFingerprint: shortDigest(envelope.scene?.snapshotDigest),
      formationId: String(envelope.scene?.formationId || ""),
      formationRevision: Number(envelope.scene?.formationRevision || 1),
      omittedLocalReferences: Number(envelope.scene?.omittedLocalReferences || 0)
    },
    formation: {
      memberCount: envelope.formation.members.length,
      purposeCode: String(envelope.formation.purposeCode || envelope.gate?.purposeCode || ""),
      members: envelope.formation.members.map((member) => ({
        position: member.position,
        cardId: String(member.cardId || ""),
        role: String(member.role || ""),
        cardRevisionId: String(member.cardRevisionId || ""),
        recordFingerprint: shortDigest(member.cardRecordDigest)
      }))
    },
    commitments: {
      context: shortDigest(envelope.contextDigest),
      scene: shortDigest(envelope.scene?.snapshotDigest),
      formation: shortDigest(envelope.gate?.semanticFormationDigest),
      gate: shortDigest(envelope.gate?.gateCommitment),
      invitation: envelope.gate?.invitationCommitment ? shortDigest(envelope.gate.invitationCommitment) : null
    },
    privacy: {
      scope: String(envelope.gate?.privacyScope || "invite_only"),
      address: String(envelope.gate?.addressRedacted || "withheld"),
      connectionPolicy: envelope.connectionPolicy,
      excludedSecrets: [...(envelope.excludedSecrets || [])]
    },
    authority: {
      decisionRequired: true,
      mintAuthority: String(envelope.lineage?.mintAuthority || "human-explicit-only"),
      joinAuthorityIncluded: false,
      autoConnect: false,
      commerceEligibility: "not_inferred"
    }
  };
  return {
    ...safeReview,
    reviewDigest: digest(safeReview)
  };
}

export function approveStargateContextCardForMint(card = {}, approval = {}) {
  const review = stargateContextMintReview(card);
  if (approval.approved !== true || String(approval.decision || "approve") !== "approve") {
    throw new TypeError("Explicit mint approval is required");
  }
  if (String(approval.actorType || "") !== "human") throw new TypeError("Mint approval actorType must be human");
  const actorId = requiredText(approval.actorId, "$.approval.actorId");
  const currentEnvelope = stargateContextEnvelopeFromCard(card);
  if (currentEnvelope.truthStatus === "origin_staged" && (!approval.reviewDigest || approval.reviewDigest === card.mintApproval?.reviewDigest)) return card;
  if (approval.reviewDigest && approval.reviewDigest !== review.reviewDigest) throw new TypeError("Mint review changed before approval");
  if (currentEnvelope.truthStatus !== "proposed_unminted") throw new TypeError(`Stargate Context Card is not proposed: ${currentEnvelope.truthStatus || "missing"}`);
  const approvedAt = String(approval.approvedAt || new Date().toISOString());
  const sourceRevisionNumber = Math.max(2, Number(String(currentEnvelope.revisionId || "r1").replace(/^r/, "")) + 1 || 2);
  const { contextDigest: _previousDigest, ...previousUnsigned } = currentEnvelope;
  const nextUnsigned = {
    ...previousUnsigned,
    revisionId: `r${sourceRevisionNumber}`,
    truthStatus: "origin_staged",
    updatedAt: approvedAt,
    mintApproval: {
      decision: "approved",
      actorId,
      actorType: "human",
      method: String(approval.method || "explicit-ui-control"),
      identityAssurance: "locally-asserted-not-remotely-verified",
      approvedAt,
      reviewDigest: review.reviewDigest
    }
  };
  const nextEnvelope = { ...nextUnsigned, contextDigest: digest(nextUnsigned) };
  validateStargateContextEnvelope(nextEnvelope);
  const replaceTag = (values = []) => [...new Set(values.filter((value) => value !== "proposed-unminted").concat("origin-staged", "human-approved-mint"))];
  return {
    ...card,
    status: "origin_staged",
    tags: replaceTag(card.tags),
    stargateContext: nextEnvelope,
    mintApproval: nextEnvelope.mintApproval,
    enrichment: {
      ...(card.enrichment || {}),
      needsReview: false,
      tags: replaceTag(card.enrichment?.tags),
      media: {
        ...(card.enrichment?.media || {}),
        stargateContext: nextEnvelope
      }
    },
    lineage: {
      ...(card.lineage || {}),
      mintedIn: "Hapa Avatar Builder explicit local human approval; origin event staged",
      mintApprovedAt: approvedAt,
      mintActorId: actorId,
      sourceRevisionId: nextEnvelope.revisionId
    }
  };
}

export function buildStargateContextCard({ sceneCard, stargate, origin = {}, invitationCommitment = null } = {}) {
  if (!sceneCard || typeof sceneCard !== "object") throw new TypeError("sceneCard is required");
  if (!stargate?.canonicalFormation?.members?.length) throw new TypeError("A derived Stargate with an ordered canonical Formation is required");
  if (!DIGEST.test(stargate.formationDigest || "")) throw new TypeError("Stargate semantic Formation digest is invalid");
  const rawSnapshot = sceneSnapshotFromCard(sceneCard);
  if (!rawSnapshot) throw new TypeError("The Scene Card has no restorable Tarot snapshot");
  const safety = { omittedLocalReferences: 0 };
  const snapshot = safeClone(rawSnapshot, safety);
  const createdAt = sceneCard.createdAt || rawSnapshot.createdAt || new Date().toISOString();
  const semanticFormation = safeClone(stargate.canonicalFormation);
  const identitiesByCardId = new Map(semanticFormation.members.map((member) => [member.cardId, member]));
  snapshot.cards = (snapshot.cards || []).map((entry) => {
    const identity = identitiesByCardId.get(String(entry.cardId || entry.card?.id || ""));
    if (!identity) return entry;
    return {
      ...entry,
      card: {
        ...(entry.card || {}),
        cardId: identity.cardId,
        cardCoreKey: identity.cardCoreKey,
        cardRevisionId: identity.cardRevisionId,
        cardRecordDigest: identity.cardRecordDigest,
        stargateRole: identity.role
      }
    };
  });
  const snapshotDigest = digest(snapshot);
  const addressRedacted = stargate.stargateAddress ? redactedStargateAddress(stargate.stargateAddress) : "withheld";
  const unsignedEnvelope = {
    schemaVersion: STARGATE_CONTEXT_CARD_SCHEMA,
    revisionId: "r1",
    truthStatus: "proposed_unminted",
    createdAt,
    origin: {
      nodeId: String(origin.nodeId || "hapa-avatar-builder"),
      actorId: String(origin.actorId || "local-operator"),
      sourceSceneCardId: String(sceneCard.id || rawSnapshot.id || "")
    },
    scene: {
      snapshotSchemaVersion: String(snapshot.schemaVersion || "hapa.tarot-draw.scene-snapshot.v1"),
      snapshotId: String(snapshot.id || rawSnapshot.id || sceneCard.id || ""),
      snapshotDigest,
      formationId: String(snapshot.formation?.id || rawSnapshot.formation?.id || ""),
      formationRevision: Number(snapshot.formation?.revision || rawSnapshot.formation?.revision || 1),
      omittedLocalReferences: safety.omittedLocalReferences
    },
    formation: semanticFormation,
    gate: {
      protocolVersion: String(stargate.protocolVersion || STARGATE_PROTOCOL_VERSION),
      privacyScope: String(stargate.privacyScope || "invite_only"),
      purposeCode: String(semanticFormation.purposeCode || ""),
      semanticFormationDigest: stargate.formationDigest,
      gateCommitment: stargateGateCommitment(stargate),
      invitationCommitment: DIGEST.test(invitationCommitment || "") ? invitationCommitment : null,
      addressRedacted
    },
    connectionPolicy: STARGATE_CONTEXT_CONNECTION_POLICY,
    excludedSecrets: [
      "cohort secret",
      "raw invitation token",
      "full rendezvous topic",
      "full Stargate address",
      "private key",
      "local profile path",
      "bearer/provider credentials"
    ],
    lineage: {
      parentCardIds: semanticFormation.members.map((member) => member.cardId),
      relationship: "ordered-formation-context",
      mintAuthority: "human-explicit-only"
    }
  };
  const envelope = { ...unsignedEnvelope, contextDigest: digest(unsignedEnvelope) };
  validateStargateContextEnvelope(envelope);
  const cardId = `hapa-stargate-context-${digest({ snapshotDigest, formationDigest: stargate.formationDigest }).slice(0, 24)}`;
  const title = `${sceneCard.title || "Tarot Scene"} Stargate`;
  const artwork = contextCardArtwork({ title, envelope });
  const drawScene = {
    ...(sceneCard.drawScene || sceneCard.enrichment?.media?.drawScene || {}),
    schemaVersion: sceneCard.drawScene?.schemaVersion || "hapa.tarot-draw.scene-card.v1",
    snapshotId: snapshot.id || rawSnapshot.id || sceneCard.id,
    snapshot,
    formation: snapshot.formation || null,
    stargateContextSchemaVersion: STARGATE_CONTEXT_CARD_SCHEMA
  };
  return {
    ...sceneCard,
    id: cardId,
    title,
    subtitle: `${semanticFormation.members.length} ordered Cards / Return Gate`,
    archetype: "Portable Stargate Context",
    tarotNumber: "GATE",
    number: "GATE",
    summary: `A proposed, unminted return Card for ${semanticFormation.members.length} ordered Hapa Cards. It restores the scene but never reconnects without fresh transient authority.`,
    meaning: "Cards become coordinates, then the coordinates become one portable teaching and return object. Durable context travels; private joining authority does not.",
    promptNotes: "Load this Context Card to restore its exact safe Tarot scene and ordered Formation. A fresh Gate Pass is required before any connection.",
    keywords: ["stargate-context", "return-card", "ordered-formation", "portable-scene", "fresh-pass-required"],
    tags: ["stargate-context", "proposed-unminted", "hapa-card", "control-interface", "fresh-pass-required"],
    sourceKind: "tarot-stargate-context",
    kind: "tarot-stargate-context",
    cardType: "reference_card",
    tarotMainType: "stargate_context",
    status: "draft",
    imageUri: artwork,
    highResImageUri: artwork,
    posterUri: artwork,
    asset: {
      id: `${cardId}-face`,
      name: `${title} face`,
      type: "image",
      mimeType: "image/svg+xml",
      uri: artwork,
      source: "hapa-avatar-builder-stargate-context-renderer",
      tags: ["tarot-card", "primary_image", "stargate-context"],
      metadata: { tarotMediaRole: "primary_image", generatedFrom: envelope.contextDigest }
    },
    assets: [{
      id: `${cardId}-face`,
      name: `${title} face`,
      type: "image",
      mimeType: "image/svg+xml",
      uri: artwork,
      source: "hapa-avatar-builder-stargate-context-renderer",
      tags: ["tarot-card", "primary_image", "stargate-context"],
      metadata: { tarotMediaRole: "primary_image", generatedFrom: envelope.contextDigest }
    }],
    drawScene,
    formation: snapshot.formation || null,
    sceneSnapshot: snapshot,
    stargateContext: envelope,
    enrichment: {
      ...(sceneCard.enrichment || {}),
      status: "enriched",
      method: "tarot-stargate-save-gate",
      confidence: "high",
      needsReview: true,
      symbolicSummary: "The active Gate contracts into one portable Context Card while its private joining capability remains absent.",
      textSynopsis: "A safe, proposed Stargate Context Card carrying a restorable Tarot scene, ordered semantic Formation, commitments, redacted address, and an explicit fresh-Pass connection policy.",
      media: {
        ...(sceneCard.enrichment?.media || {}),
        drawScene,
        formation: snapshot.formation || null,
        sceneSnapshot: snapshot,
        stargateContext: envelope,
        stargateContextArtwork: { kind: "generated-svg", digest: digest(artwork) }
      },
      tags: ["stargate-context", "proposed-unminted", "fresh-pass-required"]
    },
    lineage: {
      ...(sceneCard.lineage || {}),
      createdAt,
      source: "Hapa Avatar Builder / 3D Tarot Draw / Save Gate",
      mintedIn: "Not minted — proposed Context Card",
      parentCardIds: envelope.lineage.parentCardIds
    }
  };
}

export function restoreStargateContextCard(card = {}) {
  const envelope = validateStargateContextEnvelope(stargateContextEnvelopeFromCard(card));
  const snapshot = sceneSnapshotFromCard(card);
  if (!snapshot) throw new TypeError("Stargate Context Card has no restorable scene snapshot");
  const safeSnapshot = safeClone(snapshot);
  if (digest(safeSnapshot) !== envelope.scene.snapshotDigest) throw new TypeError("Stargate Context scene snapshot no longer matches its commitment");
  return {
    schemaVersion: STARGATE_CONTEXT_RESTORE_SCHEMA,
    cardId: String(card.id || ""),
    revisionId: envelope.revisionId,
    snapshot: safeSnapshot,
    formation: envelope.formation,
    gate: envelope.gate,
    connected: false,
    connectionPolicy: STARGATE_CONTEXT_CONNECTION_POLICY,
    requiresFreshGatePass: true,
    truthStatus: "restored_disconnected"
  };
}
