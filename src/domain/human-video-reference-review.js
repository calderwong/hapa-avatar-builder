export const HUMAN_VIDEO_REFERENCE_REVIEW_STORE_SCHEMA = "hapa.human-video-reference-review-store.v1";
export const HUMAN_VIDEO_REFERENCE_REVIEW_SCHEMA = "hapa.human-video-reference-review.v1";
export const HUMAN_VIDEO_REFERENCE_REVIEW_EVENT_SCHEMA = "hapa.human-video-reference-review-event.v1";
export const HUMAN_VIDEO_REFERENCE_CARD_PACKET_SCHEMA = "hapa.human-video-reference-card-packet.v1";

const REVIEW_STATUSES = new Set(["pending-human", "accepted", "accepted-edited", "rejected", "blocked"]);
const PACKET_PROFILES = new Set(["echo-reference-cards", "echo-core-cards", "hapa-card-library", "explicit-card-ids"]);
const MATCH_TYPES = new Set(["direct-marking", "text", "symbol", "palette", "geometry", "costume", "object", "composition", "visual-motif", "thematic-inference"]);

export function createHumanVideoReferenceReviewStore(input = {}) {
  return normalizeHumanVideoReferenceReviewStore({ schemaVersion: HUMAN_VIDEO_REFERENCE_REVIEW_STORE_SCHEMA, reviews: input.reviews || [], updatedAt: input.updatedAt || null });
}

export function normalizeHumanVideoReferenceReviewStore(input = {}) {
  const byVideo = new Map();
  for (const candidate of Array.isArray(input.reviews) ? input.reviews : []) {
    try {
      const review = normalizeHumanVideoReferenceReview(candidate);
      const current = byVideo.get(review.videoKey);
      if (!current || review.revision > current.revision || String(review.updatedAt || "") > String(current.updatedAt || "")) byVideo.set(review.videoKey, review);
    } catch {
      // Invalid local proposals never enter the human review surface.
    }
  }
  const reviews = [...byVideo.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.videoKey.localeCompare(b.videoKey));
  return {
    schemaVersion: HUMAN_VIDEO_REFERENCE_REVIEW_STORE_SCHEMA,
    reviews,
    updatedAt: clean(input.updatedAt, 80) || reviews.map((review) => review.updatedAt).filter(Boolean).sort().at(-1) || null,
    truthBoundary: "Reference-worker proposals may only select or reject Cards from their exact packet. They do not invent Cards, establish identity, create canon, or replace human direction.",
  };
}

export function buildHumanVideoReferenceCardPacket(input = {}, options = {}) {
  const profile = PACKET_PROFILES.has(options.profile) ? options.profile : "echo-reference-cards";
  const explicitIds = new Set(list(options.cardIds).map((value) => clean(value, 500)).filter(Boolean));
  const include = (kind, id) => {
    if (explicitIds.size) return explicitIds.has(id);
    if (profile === "echo-reference-cards") return kind === "echo-reference";
    if (profile === "echo-core-cards") return new Set(["echo-reference", "song", "avatar"]).has(kind);
    return profile === "hapa-card-library" ? kind === "hapa-card" : false;
  };
  const cards = [
    ...list(input.referenceCatalog).map((record, index) => projectCard(record, "echo-reference", "data/hapa-songs-store.json", `/referenceCatalog/${index}`)),
    ...list(input.songs).map((record, index) => projectCard(record, "song", "data/hapa-songs-store.json", `/songs/${index}`)),
    ...list(input.avatars).map((record, index) => projectCard(record, "avatar", "data/avatar-store.json", `/avatars/${index}`)),
    ...list(input.itemCards).map((record, index) => projectCard(record, "hapa-card", "data/item-manager-store.json", `/cards/${index}`)),
  ].filter((card) => card.id && include(card.kind, card.id));
  const maxCards = Math.max(1, Math.min(2_500, Math.trunc(number(options.maxCards, profile === "hapa-card-library" ? 400 : 400))));
  const selected = cards.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, maxCards);
  return {
    schemaVersion: HUMAN_VIDEO_REFERENCE_CARD_PACKET_SCHEMA,
    id: clean(options.id, 500) || `reference-card-packet:${profile}`,
    profile,
    digest: clean(options.digest, 100),
    createdAt: clean(options.createdAt, 80) || null,
    cardCount: selected.length,
    cards: selected,
    sourcePolicy: "Existing Hapa Card records and source-backed Echo reference records only. No worker-authored candidate IDs are permitted.",
  };
}

export function normalizeHumanVideoReferenceReview(input = {}, fallback = {}, options = {}) {
  const videoKey = clean(input.videoKey || fallback.videoKey, 4_500);
  if (!videoKey) throw referenceError("reference_review_video_key_required", "A reference review must name one stable Human Enricher video key.");
  const status = REVIEW_STATUSES.has(input.status) ? input.status : REVIEW_STATUSES.has(fallback.status) ? fallback.status : "pending-human";
  const packet = normalizePacketReceipt(input.packet || fallback.packet);
  const opticalReview = normalizeOpticalReceipt(input.opticalReview || fallback.opticalReview);
  const reviewer = normalizeReviewer(input.reviewer || fallback.reviewer);
  if (status !== "blocked") {
    if (!opticalReview.id || opticalReview.revision < 1) throw referenceError("reference_review_optical_dependency_required", "Reference workers require a completed optical-pass receipt.");
    if (!packet.id || !packet.digest || packet.cardCount < 1) throw referenceError("reference_review_card_packet_required", "Reference workers require one non-empty, hash-bound Hapa Card packet.");
    if (reviewer.referenceInspectionConfirmed !== true) throw referenceError("reference_inspection_attestation_required", "A completed reference review must attest that it compared the optical evidence only with the supplied Card packet.");
  }
  const allowed = new Set(list(options.allowedCardIds).map((value) => clean(value, 500)).filter(Boolean));
  const proposal = normalizeProposal(input.proposal || fallback.proposal);
  if (allowed.size) {
    const outsidePacket = [...proposal.matches, ...proposal.avatarRelationships].filter((match) => match.cardId && !allowed.has(match.cardId));
    if (outsidePacket.length) throw referenceError("reference_card_outside_packet", "A reference worker selected a Card that was not present in its bounded packet.", 409, { cardIds: [...new Set(outsidePacket.map((match) => match.cardId))] });
  }
  const revision = Math.max(1, Math.trunc(number(input.revision ?? fallback.revision, 1)));
  const now = clean(input.updatedAt || fallback.updatedAt, 80) || null;
  return {
    schemaVersion: HUMAN_VIDEO_REFERENCE_REVIEW_SCHEMA,
    id: clean(input.id || fallback.id, 5_000) || `${videoKey}:reference:r${revision}`,
    videoKey,
    videoId: clean(input.videoId || fallback.videoId, 360),
    videoName: clean(input.videoName || fallback.videoName, 800),
    status,
    opticalReview,
    packet,
    reviewer,
    proposal,
    blockedReason: cleanMultiline(input.blockedReason || fallback.blockedReason, 2_000),
    revision,
    createdAt: clean(input.createdAt || fallback.createdAt, 80) || now,
    updatedAt: now,
  };
}

export function upsertHumanVideoReferenceReview(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoReferenceReviewStore(storeInput);
  const current = store.reviews.find((review) => review.videoKey === input.videoKey) || null;
  if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== Number(current?.revision || 0)) {
    throw referenceError("reference_review_revision_conflict", "This reference review changed while the worker was running.", 409);
  }
  const now = options.now || new Date().toISOString();
  const review = normalizeHumanVideoReferenceReview({
    ...(current || {}),
    ...input,
    revision: Number(current?.revision || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
    reviewer: { ...(current?.reviewer || {}), ...(input.reviewer || {}), agentId: options.agentId || input.reviewer?.agentId || current?.reviewer?.agentId },
  }, {}, options);
  return {
    store: normalizeHumanVideoReferenceReviewStore({ ...store, reviews: [...store.reviews.filter((item) => item.videoKey !== review.videoKey), review], updatedAt: now }),
    review,
  };
}

function projectCard(record = {}, kind, sourcePath, sourcePointer) {
  const id = clean(record.id || record.cardId || record.songId || record.registryId, 500);
  return {
    id,
    kind,
    schemaVersion: clean(record.schemaVersion, 240),
    cardType: clean(record.cardType || `${kind}-card`, 240),
    title: clean(record.title || record.primaryName || record.name || id, 800),
    summary: cleanMultiline(record.summary || record.publicContext || record.description || record.lore, 2_400),
    themes: unique([...list(record.themes), ...list(record.tags)], 80, 180),
    signals: unique([
      ...list(record.traversalTerms),
      ...list(record.signalLexicon?.literal),
      ...list(record.signalLexicon?.mechanical),
      ...list(record.visualIdentity?.markers),
      ...list(record.visualIdentity?.motifs),
    ], 120, 240),
    canonStatus: clean(record.canonStatus, 180),
    reviewStatus: clean(record.reviewStatus || record.status, 180),
    source: normalizeSource(record.source || list(record.sourceRefs)[0]),
    sourcePath,
    sourcePointer,
  };
}

function normalizeProposal(input = {}) {
  return {
    status: new Set(["matched", "none-supported", "uncertain"]).has(input.status) ? input.status : "uncertain",
    observedSignals: unique(input.observedSignals, 120, 1_000),
    matches: list(input.matches).slice(0, 120).map(normalizeMatch).filter((match) => match.cardId && match.observedEvidence && match.explanation),
    avatarRelationships: list(input.avatarRelationships).slice(0, 80).map(normalizeMatch).filter((match) => match.cardId && match.observedEvidence && match.explanation),
    negativeFindings: unique(input.negativeFindings, 120, 1_000),
    directorNotes: cleanMultiline(input.directorNotes, 8_000),
    uncertainty: cleanMultiline(input.uncertainty, 4_000),
  };
}

function normalizeMatch(input = {}) {
  const normalizedType = clean(input.matchType, 180).toLowerCase().replace(/[_\s]+/g, "-");
  return {
    cardId: clean(input.cardId || input.entityId || input.referenceId, 500),
    cardTitle: clean(input.cardTitle || input.entityLabel || input.label || input.title, 800),
    relationship: clean(input.relationship || input.role, 360),
    matchType: MATCH_TYPES.has(normalizedType) ? normalizedType : "visual-motif",
    observedEvidence: cleanMultiline(input.observedEvidence || input.visualEvidence, 3_000),
    explanation: cleanMultiline(input.explanation || input.reason, 3_000),
    evidenceFrameHashes: unique(input.evidenceFrameHashes, 24, 100),
    confidence: Math.max(0, Math.min(1, number(input.confidence, 0))),
  };
}

function normalizePacketReceipt(input = {}) {
  return { id: clean(input.id, 500), profile: PACKET_PROFILES.has(input.profile) ? input.profile : "echo-reference-cards", digest: clean(input.digest, 100), cardCount: Math.max(0, Math.trunc(number(input.cardCount, 0))) };
}
function normalizeOpticalReceipt(input = {}) { return { id: clean(input.id, 5_000), revision: Math.max(0, Math.trunc(number(input.revision, 0))), frameDigest: clean(input.frameDigest, 100) }; }
function normalizeReviewer(input = {}) { return { agentId: clean(input.agentId, 240), taskId: clean(input.taskId, 500), model: clean(input.model, 240), reasoningEffort: clean(input.reasoningEffort, 80), parameters: input.parameters && typeof input.parameters === "object" ? structuredClone(input.parameters) : {}, reviewMode: "reference-worker-card-packet", referenceInspectionConfirmed: input.referenceInspectionConfirmed === true, attestation: cleanMultiline(input.attestation, 2_000) }; }
function normalizeSource(input = {}) { return { label: clean(input.label || input.title, 800), uri: clean(input.uri || input.url, 2_000), sourceKind: clean(input.sourceKind, 240), checkedAt: clean(input.checkedAt, 80) }; }
function list(value) { return Array.isArray(value) ? value : []; }
function unique(input, limit, max) { return [...new Set(list(input).map((value) => clean(value, max)).filter(Boolean))].slice(0, limit); }
function number(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(value, max) { return String(value || "").replace(/\0/g, "").trim().slice(0, max); }
function cleanMultiline(value, max) { return String(value || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max); }
function referenceError(code, message, statusCode = 400, details = {}) { const error = new Error(message); error.code = code; error.statusCode = statusCode; error.details = details; return error; }
