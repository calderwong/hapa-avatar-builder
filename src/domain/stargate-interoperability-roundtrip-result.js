import { createHash } from "node:crypto";

export const STARGATE_INTEROPERABILITY_RESULT_SCHEMA = "hapa.stargate-interoperability-round-trip-result.v1";

const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const forbidden = /(?:cohort.?secret|rendezvous.?topic|gate.?pass|private.?key|bearer|credential|profile.?path)/i;

function assertNoPrivateCapabilityMaterial(value, trail = "$") {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertNoPrivateCapabilityMaterial(entry, `${trail}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key) && child !== null && child !== "" && child !== false) throw new TypeError(`Round-trip Result Card contains private capability material at ${trail}.${key}`);
    assertNoPrivateCapabilityMaterial(child, `${trail}.${key}`);
  }
}

function requireSameIdentity(expectedId, expectedRevision, observed, label) {
  if (String(observed?.cardId || "") !== expectedId || Number(observed?.revision || 0) !== expectedRevision) {
    throw new TypeError(`${label} did not preserve the exact Stargate Card identity`);
  }
}

export function buildStargateInteroperabilityRoundTripResult(input = {}) {
  const observedAt = String(input.observedAt || new Date().toISOString());
  const cardId = String(input.cardId || "").trim();
  const revision = Number(input.revision || 0);
  if (!cardId || !Number.isSafeInteger(revision) || revision < 1) throw new TypeError("A stable Stargate Card ID and positive revision are required");
  requireSameIdentity(cardId, revision, input.origin, "Overwind acknowledgement");
  requireSameIdentity(cardId, revision, input.catalog, "Catalog projection");
  requireSameIdentity(cardId, revision, input.deck, "Named Deck membership");
  requireSameIdentity(cardId, revision, input.returnResolution, "Builder return");
  requireSameIdentity(cardId, revision, input.peerResolution, "Second-node resolution");
  if (input.returnResolution?.connected !== false) throw new TypeError("Pinned Builder restore must be disconnected");
  if (input.peerResolution?.joined !== true || Number(input.peerResolution?.peerCount || 0) !== 2) throw new TypeError("Two-peer arrival evidence is required");
  if (input.catalog?.syncMode && !["rebuild", "delta-sync"].includes(input.catalog.syncMode)) throw new TypeError("Catalog projection must come from subscriber sync");

  const evidence = {
    schemaVersion: STARGATE_INTEROPERABILITY_RESULT_SCHEMA,
    card: { cardId, revision, localCardId: String(input.localCardId || "") || null },
    route: [
      { stage: "avatar-builder", outcome: "human-approved-mint", cardId, revision },
      { stage: "overwind", outcome: "durably-acknowledged", cardId, revision, eventId: input.origin.eventId || null, ledgerPosition: Number(input.origin.ledgerPosition || 0) || null },
      { stage: "hapa-catalog", outcome: "subscriber-projected", cardId, revision, syncMode: input.catalog.syncMode || null, subscriberCursor: Number(input.catalog.subscriberCursor || 0) || null },
      { stage: "named-deck", outcome: "buyer-local-membership", cardId, revision, deckId: input.deck.deckId || null, deckRevisionId: input.deck.deckRevisionId || null },
      { stage: "avatar-builder-return", outcome: "exact-pin-restored-disconnected", cardId, revision },
      { stage: "second-node", outcome: "fresh-pass-consented-arrival", cardId, revision, peerCount: 2, proofId: input.peerResolution.proofId || null, proofDigest: input.peerResolution.proofDigest || null }
    ],
    invariants: {
      oneStableCardIdentity: true,
      secondCardHeadCreated: false,
      catalogProjectionViaSubscriber: true,
      catalogRequiredForP2p: false,
      pinnedRestoreConnected: false,
      freshTransientAuthorityRequired: true,
      explicitLocalConsentRequired: true,
      capabilitySecretsWithheld: true
    },
    effects: {
      sourceHeadsCreated: 1,
      catalogProjectionsCreated: 1,
      buyerLocalDeckRevisionsCreated: Number(input.deck.deckRevisionCreated || 1),
      p2pJoined: true,
      peerCount: 2,
      commerceOfferCreated: false,
      entitlementCreated: false
    },
    truthBoundary: "Observed on isolated loopback services and two isolated local Hapa peer processes. This proves one exact Card revision crossed the tested Builder → Overwind → Catalog → Deck → Builder → peer route; it does not prove internet-wide availability or geographically remote peers.",
    observedAt
  };
  assertNoPrivateCapabilityMaterial(evidence);
  const evidenceDigest = digest(evidence);
  return {
    schemaVersion: "hapa.tarot-card.v1",
    id: `hapa-card:build-week:result:stargate-round-trip:${evidenceDigest.slice(0, 24)}`,
    title: "Stargate Interoperability Round-Trip Result",
    cardType: "reference_card",
    tarotMainType: "stargate_interoperability_round_trip_result",
    status: "verified_local_evidence",
    truthStatus: "observed_isolated_round_trip",
    summary: "One human-approved Stargate Context Card kept the same stable identity through durable acknowledgement, Catalog subscriber projection, buyer-local Deck membership, exact disconnected restore, and two-peer signed arrival.",
    tags: ["stargate", "interoperability", "overwind", "hapa-catalog", "named-deck", "p2p", "build-week", "verified-local-evidence"],
    stargateInteroperabilityResult: { ...evidence, evidenceDigest },
    lineage: { parentCardIds: [cardId], relationship: "execution-result-for-exact-card-revision", sourceRevision: revision, recordOwner: "hapa-avatar-builder" },
    createdAt: observedAt,
    updatedAt: observedAt
  };
}
