export const TAROT_SPATIAL_TRUTH_SCHEMA = "hapa.tarot-spatial-truth-event.v1";
export const TAROT_SPATIAL_TRUTH_RESULT_SCHEMA = "hapa.tarot-spatial-truth-result-card.v1";

const SHA256 = /^[a-f0-9]{64}$/i;

export const TAROT_SPATIAL_TRUTH_TYPES = Object.freeze({
  "card.placed": Object.freeze({ family: "placement", color: 0x00f3ff, accent: 0xf6c96d, geometry: "ripple", strength: 0.48 }),
  "stargate.activated": Object.freeze({ family: "gate", color: 0x45f2c8, accent: 0xf6c96d, geometry: "aperture", strength: 1 }),
  "peer.arrived": Object.freeze({ family: "peer", color: 0x7aa7ff, accent: 0xff6df2, geometry: "identity-orbit", strength: 0.62 }),
  "session.message.appended": Object.freeze({ family: "communication", color: 0x00f3ff, accent: 0xff6df2, geometry: "comet", strength: 0.36 }),
  "comment.consent.granted": Object.freeze({ family: "consent", color: 0xf6c96d, accent: 0x45f2c8, geometry: "lock-iris", strength: 0.52 }),
  "comment.card.finalized": Object.freeze({ family: "comment", color: 0xffb347, accent: 0x00f3ff, geometry: "lineage-arc", strength: 0.58 }),
  "build.task.closed": Object.freeze({ family: "build", color: 0xff6df2, accent: 0xf6c96d, geometry: "ledger-spire", strength: 0.45 }),
  "council.result.pressed": Object.freeze({ family: "council", color: 0xa472ff, accent: 0x45f2c8, geometry: "wisdom-triad", strength: 0.55 }),
  "proposal.created": Object.freeze({ family: "proposal", color: 0xffb347, accent: 0xff6df2, geometry: "candidate-ghost", strength: 0.42 }),
  "card.minted": Object.freeze({ family: "mint", color: 0xf6c96d, accent: 0xf8f3e7, geometry: "authority-seal", strength: 0.66 })
});

function clean(value) {
  return String(value ?? "").trim();
}

function validObservedAt(value) {
  const text = clean(value);
  return Boolean(text && Number.isFinite(Date.parse(text)));
}

function reject(reason, detail = "") {
  return { ok: false, reason, detail: clean(detail), event: null, cue: null };
}

export function projectTarotSpatialTruthEvent(input = {}) {
  const eventId = clean(input.eventId || input.id);
  const type = clean(input.type);
  const truthStatus = clean(input.truthStatus || input.truth?.status || input.protocol?.truthStatus);
  const observedAt = clean(input.observedAt || input.ts);
  const sourceNode = clean(input.sourceNode || input.source?.node || input.protocol?.recordOwner);
  const payloadDigest = clean(input.payloadDigest || input.payload?.digest || input.protocol?.payloadDigest).replace(/^sha256:/i, "");
  const profile = TAROT_SPATIAL_TRUTH_TYPES[type];

  if (!eventId) return reject("missing_event_identity");
  if (!profile) return reject("unsupported_event_type", type || "missing");
  if (truthStatus !== "verified_event") return reject("event_not_verified", truthStatus || "missing");
  if (!validObservedAt(observedAt)) return reject("invalid_observation_time", observedAt || "missing");
  if (!sourceNode) return reject("missing_source_identity");
  if (!SHA256.test(payloadDigest)) return reject("invalid_payload_digest", payloadDigest || "missing");

  const event = Object.freeze({
    schemaVersion: TAROT_SPATIAL_TRUTH_SCHEMA,
    eventId,
    type,
    truthStatus,
    observedAt: new Date(observedAt).toISOString(),
    sourceNode,
    payloadDigest: payloadDigest.toLowerCase(),
    subjectCardId: clean(input.subjectCardId || input.payload?.subjectCardId) || null,
    actorId: clean(input.actorId || input.payload?.actorId) || null,
    label: clean(input.label || input.payload?.label || type.replaceAll(".", " ")),
    publicFixture: input.publicFixture === true
  });

  const cue = Object.freeze({
    cueId: `spatial-cue:${event.eventId}`,
    eventCommitment: `sha256:${event.payloadDigest}`,
    family: profile.family,
    geometry: profile.geometry,
    color: profile.color,
    accent: profile.accent,
    strength: profile.strength,
    label: event.label,
    subjectCardId: event.subjectCardId,
    publicFixture: event.publicFixture
  });

  return { ok: true, reason: null, detail: "", event, cue };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

async function sha256(value) {
  const cryptoApi = globalThis.crypto?.subtle;
  if (!cryptoApi) throw new Error("Web Crypto SHA-256 is required for the Spatial Truth Result Card.");
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await cryptoApi.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildTarotSpatialTruthResultCard({ accepted = [], rejected = [], gateCommitment = "", title = "Spatial Truth Result" } = {}) {
  const acceptedEvents = accepted.map((item) => item?.event || item).filter((item) => item?.eventId && item?.payloadDigest);
  if (!acceptedEvents.length) throw new Error("At least one verified spatial event is required.");
  const rejectedEvents = rejected.map((item) => ({ reason: clean(item?.reason), detail: clean(item?.detail) }));
  const receipt = {
    schemaVersion: TAROT_SPATIAL_TRUTH_RESULT_SCHEMA,
    accepted: acceptedEvents.map((event) => ({
      eventId: event.eventId,
      type: event.type,
      sourceNode: event.sourceNode,
      observedAt: event.observedAt,
      payloadDigest: event.payloadDigest
    })),
    rejected: rejectedEvents,
    gateCommitment: clean(gateCommitment) || null,
    truthBoundary: "Only verified events emitted spatial cues. Rejected and proposed records produced no effect. Visuals are projections, not authority or execution proof."
  };
  const receiptDigest = await sha256(receipt);
  return {
    id: `hapa-card:result:spatial-truth:${receiptDigest.slice(0, 40)}`,
    title,
    pileId: "protocol",
    type: "spatial-truth-result-card",
    cardCoreKey: `spatial-truth-result:${receiptDigest}`,
    cardRecordDigest: receiptDigest,
    revision: 1,
    truthState: "proposed_unminted",
    spatialTruth: { ...receipt, receiptDigest },
    description: `${acceptedEvents.length} verified spatial cue${acceptedEvents.length === 1 ? "" : "s"}; ${rejectedEvents.length} rejected event${rejectedEvents.length === 1 ? "" : "s"}.`,
    image: null,
    imageUrl: null,
    lineage: {
      method: "verified-event-spatial-projection",
      sourceEventIds: acceptedEvents.map((event) => event.eventId),
      generatedBy: "Hapa Avatar Builder / Tarot Spatial Truth"
    }
  };
}

export function publicSpatialTruthShowcaseEvents(observedAt = "2026-07-18T20:00:00.000Z") {
  const base = [
    ["showcase-placement", "card.placed", "hapa-avatar-builder", "Build Week Formation placed"],
    ["showcase-gate", "stargate.activated", "hapa-avatar-builder", "Deterministic Gate active"],
    ["showcase-peer", "peer.arrived", "hapa-peer-proof", "Two verified peers arrived"],
    ["showcase-message", "session.message.appended", "hapa-session-feed", "Signed communication appended"],
    ["showcase-consent", "comment.consent.granted", "hapa-avatar-builder", "Bounded camera consent granted"],
    ["showcase-comment", "comment.card.finalized", "hapa-avatar-builder", "Separate Comment Card finalized"],
    ["showcase-build", "build.task.closed", "hapa-overwatch-kanban", "Build task memorial attached"],
    ["showcase-council", "council.result.pressed", "hapa-wisdom-studio", "Wisdom Council result pressed"],
    ["showcase-proposal", "proposal.created", "hapa-avatar-builder", "Candidate Card proposed"],
    ["showcase-mint", "card.minted", "hapa-origin", "Human-authorized revision minted"]
  ];
  return base.map(([eventId, type, sourceNode, label], index) => ({
    schemaVersion: TAROT_SPATIAL_TRUTH_SCHEMA,
    eventId,
    type,
    truthStatus: "verified_event",
    observedAt: new Date(Date.parse(observedAt) + index * 1000).toISOString(),
    sourceNode,
    payloadDigest: `${String(index + 1).padStart(2, "0")}${"a".repeat(62)}`,
    label,
    publicFixture: true
  }));
}
