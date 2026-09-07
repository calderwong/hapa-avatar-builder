import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const HUMAN_VIDEO_REFERENCE_REVIEW_STORE_SCHEMA = "hapa.human-video-reference-review-store.v1";
export const HUMAN_VIDEO_REFERENCE_REVIEW_SCHEMA = "hapa.human-video-reference-review.v1";
export const HUMAN_VIDEO_REFERENCE_REVIEW_EVENT_SCHEMA = "hapa.human-video-reference-review-event.v1";
export const HUMAN_VIDEO_REFERENCE_CARD_PACKET_SCHEMA = "hapa.human-video-reference-card-packet.v1";

const REVIEW_STATUSES = new Set(["pending-human", "accepted", "accepted-edited", "rejected", "blocked"]);
const PACKET_PROFILES = new Set(["echo-reference-cards", "echo-reference-wide", "echo-reference-exploratory", "echo-core-cards", "hapa-card-library", "explicit-card-ids"]);
const MATCH_TYPES = new Set(["direct-marking", "text", "symbol", "palette", "geometry", "costume", "object", "composition", "visual-motif", "thematic-inference"]);
const REFERENCE_STOP_REASONS = new Set(["completed", "no-confident-match", "budget", "unknown", "error"]);
export const HUMAN_VIDEO_REFERENCE_CANDIDATE_MIN = 5;
export const HUMAN_VIDEO_REFERENCE_CANDIDATE_MAX = 20;
export const HUMAN_VIDEO_REFERENCE_DEFAULT_BUDGET = Object.freeze({
  maxInputTokens: 24_000,
  maxOutputTokens: 1_200,
  maxTotalTokens: 25_200,
  maxWallClockMs: 90_000,
  maxReasoningEffort: "medium",
});

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
  const minedReferenceCards = list(input.referenceCards);
  const include = (card) => {
    const { kind, id } = card;
    if (explicitIds.size) return explicitIds.has(id);
    if (kind === "echo-reference") {
      if (profile === "echo-reference-exploratory") return true;
      if (profile === "echo-reference-wide") return card.evidenceClass !== "unresolved";
      if (new Set(["echo-reference-cards", "echo-core-cards"]).has(profile)) return new Set(["direct", "source-backed-candidate"]).has(card.evidenceClass);
    }
    if (profile === "echo-core-cards") return new Set(["song", "avatar"]).has(kind);
    return profile === "hapa-card-library" ? kind === "hapa-card" : false;
  };
  const referenceSourcePath = input.referenceRun?.referenceRuntime?.source === "external-research-projection"
    ? "data/echo-reference-research-loop/projected-run.json"
    : minedReferenceCards.length
      ? "data/echo-reference-mining/latest.json"
      : "data/hapa-songs-store.json";
  const projected = [
    ...(minedReferenceCards.length
      ? minedReferenceCards.map((record, index) => projectCard(record, "echo-reference", referenceSourcePath, `/cards/${index}`))
      : list(input.referenceCatalog).map((record, index) => projectCard(record, "echo-reference", "data/hapa-songs-store.json", `/referenceCatalog/${index}`))),
    ...list(input.songs).map((record, index) => projectCard(record, "song", "data/hapa-songs-store.json", `/songs/${index}`)),
    ...list(input.avatars).map((record, index) => projectCard(record, "avatar", "data/avatar-store.json", `/avatars/${index}`)),
    ...list(input.itemCards).map((record, index) => projectCard(record, "hapa-card", "data/item-manager-store.json", `/cards/${index}`)),
  ];
  const cardsById = new Map();
  for (const card of projected) if (card.id && include(card) && !cardsById.has(card.id)) cardsById.set(card.id, card);
  const defaultLimits = { "echo-reference-cards": 400, "echo-reference-wide": 900, "echo-reference-exploratory": 1_200, "echo-core-cards": 600, "hapa-card-library": 400, "explicit-card-ids": 2_500 };
  const maxCards = Math.max(1, Math.min(2_500, Math.trunc(number(options.maxCards, defaultLimits[profile] || 400))));
  const selected = [...cardsById.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, maxCards);
  const authorityCounts = selected.reduce((counts, card) => ({ ...counts, [card.evidenceClass || "unclassified"]: Number(counts[card.evidenceClass || "unclassified"] || 0) + 1 }), {});
  const reviewStatusCounts = selected.reduce((counts, card) => ({ ...counts, [card.reviewStatus || "unclassified"]: Number(counts[card.reviewStatus || "unclassified"] || 0) + 1 }), {});
  const canonStatusCounts = selected.reduce((counts, card) => ({ ...counts, [card.canonStatus || "unclassified"]: Number(counts[card.canonStatus || "unclassified"] || 0) + 1 }), {});
  const runtimeAuthority = input.referenceRun?.referenceRuntime?.authority || {};
  return {
    schemaVersion: HUMAN_VIDEO_REFERENCE_CARD_PACKET_SCHEMA,
    id: clean(options.id, 500) || `reference-card-packet:${profile}`,
    profile,
    digest: clean(options.digest, 100),
    createdAt: clean(options.createdAt, 80) || null,
    cardCount: selected.length,
    authorityCounts,
    reviewStatusCounts,
    canonStatusCounts,
    referenceAtlas: {
      runId: clean(input.referenceRun?.runId, 500),
      runHash: clean(input.referenceRun?.runHash, 240),
      source: clean(input.referenceRun?.referenceRuntime?.source || input.referenceRun?.source, 240),
      availableCards: minedReferenceCards.length,
      authority: {
        status: clean(runtimeAuthority.status, 180),
        receiptId: clean(runtimeAuthority.receiptId, 500),
        approvedCards: Math.max(0, Math.trunc(number(runtimeAuthority.approvedCards, 0))),
        resolvedWithoutPromotion: Math.max(0, Math.trunc(number(runtimeAuthority.resolvedWithoutPromotion, 0))),
        previewPolicy: clean(runtimeAuthority.previewPolicy, 180),
        publicActivation: runtimeAuthority.publicActivation === true,
        canonPromotion: runtimeAuthority.canonPromotion === true,
      },
    },
    cards: selected,
    sourcePolicy: "Existing Reference Atlas and Hapa Card records only. Default packets exclude unresolved Cards; every Card preserves its evidence, review, canon, rights, and provenance labels. No worker-authored candidate IDs are permitted.",
  };
}

export function buildHumanVideoReferenceCandidatePacket(basePacketInput = {}, opticalInput = {}, options = {}) {
  const basePacket = basePacketInput && typeof basePacketInput === "object" ? basePacketInput : {};
  const sourceCards = list(basePacket.cards);
  const targetCards = Math.max(
    HUMAN_VIDEO_REFERENCE_CANDIDATE_MIN,
    Math.min(HUMAN_VIDEO_REFERENCE_CANDIDATE_MAX, Math.trunc(number(options.targetCards, 12))),
  );
  const query = opticalQuery(opticalInput);
  const ranked = sourceCards.map((card) => ({ card, score: candidateScore(card, query) }))
    .sort((left, right) => right.score - left.score || authorityRank(left.card) - authorityRank(right.card) || String(left.card.id).localeCompare(String(right.card.id)));
  const selected = ranked.slice(0, Math.min(targetCards, ranked.length)).map((row) => row.card);
  if (selected.length && (selected.length < HUMAN_VIDEO_REFERENCE_CANDIDATE_MIN || selected.length > HUMAN_VIDEO_REFERENCE_CANDIDATE_MAX)) {
    throw referenceError("reference_candidate_packet_size_invalid", `A video candidate packet must contain ${HUMAN_VIDEO_REFERENCE_CANDIDATE_MIN}–${HUMAN_VIDEO_REFERENCE_CANDIDATE_MAX} Cards.`);
  }
  const authorityCounts = countBy(selected, (card) => card.evidenceClass || "unclassified");
  const reviewStatusCounts = countBy(selected, (card) => card.reviewStatus || "unclassified");
  const canonStatusCounts = countBy(selected, (card) => card.canonStatus || "unclassified");
  const selectionDigest = stableDigest([
    clean(basePacket.digest, 100),
    ...query.terms,
    ...selected.map((card) => card.id),
  ]);
  return {
    ...basePacket,
    id: `reference-video-candidates:${selectionDigest.slice(-24)}`,
    digest: `sha256:${selectionDigest}`,
    cardCount: selected.length,
    authorityCounts,
    reviewStatusCounts,
    canonStatusCounts,
    cards: selected,
    selection: {
      mode: "video-optical-candidates",
      targetCards,
      sourceCardCount: sourceCards.length,
      queryDigest: `sha256:${stableDigest(query.terms)}`,
      packetCacheKey: `reference-candidates:${selectionDigest}`,
      fallbackCards: selected.filter((card) => candidateScore(card, query) === 0).length,
      truthBoundary: "Candidate ranking is deterministic preselection outside the reference model. The worker receives only this 5–20 Card packet and may not traverse the source corpus.",
    },
    sourcePolicy: "Exactly one video-specific packet of 5–20 existing source-backed Cards. Reference workers must not read or traverse raw Hapa/Echo stores.",
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
    if (packet.selection.mode === "video-optical-candidates" && (packet.cardCount < HUMAN_VIDEO_REFERENCE_CANDIDATE_MIN || packet.cardCount > HUMAN_VIDEO_REFERENCE_CANDIDATE_MAX)) throw referenceError("reference_candidate_packet_size_invalid", `Reference workers require ${HUMAN_VIDEO_REFERENCE_CANDIDATE_MIN}–${HUMAN_VIDEO_REFERENCE_CANDIDATE_MAX} preselected Cards.`);
    if (reviewer.referenceInspectionConfirmed !== true) throw referenceError("reference_inspection_attestation_required", "A completed reference review must attest that it compared the optical evidence only with the supplied Card packet.");
    if (options.requireAccounting === true && !new Set(["captured", "unavailable"]).has(reviewer.accounting.status)) throw referenceError("reference_review_accounting_required", "Reference workers must attach captured accounting or an explicit unavailable receipt.");
    if (options.requireAccounting === true && effortRank(reviewer.reasoningEffort) > effortRank(reviewer.budget.maxReasoningEffort)) throw referenceError("reference_review_effort_budget_exceeded", "The reference worker reasoning effort exceeded the immutable packet budget.");
    if (options.requireAccounting === true && reviewer.accounting.budgetExceeded) throw referenceError("reference_review_budget_exceeded", "This reference attempt stopped at its immutable budget and cannot become a completed comparison.");
  }
  const allowed = new Set(list(options.allowedCardIds).map((value) => clean(value, 500)).filter(Boolean));
  const proposal = normalizeProposal(input.proposal || fallback.proposal);
  if (options.strictOutcome === true && proposal.status === "none-supported" && (proposal.matches.length || proposal.avatarRelationships.length || !proposal.negativeFindings.length)) {
    throw referenceError("reference_review_no_match_invalid", "A no-confident-match result must contain no matches and at least one negative finding.");
  }
  if (options.strictOutcome === true && proposal.status === "matched" && !proposal.matches.length && !proposal.avatarRelationships.length) throw referenceError("reference_review_match_required", "A matched result requires at least one in-packet match.");
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
  const authority = record.authority && typeof record.authority === "object" ? record.authority : {};
  const rightsAndPrivacy = record.rightsAndPrivacy && typeof record.rightsAndPrivacy === "object" ? record.rightsAndPrivacy : {};
  const provenance = record.provenance && typeof record.provenance === "object" ? record.provenance : {};
  const evidenceClass = clean(authority.evidenceClass || record.evidenceClass || (kind === "echo-reference" ? "direct" : ""), 180);
  const citations = list(record.citations);
  const occurrences = list(record.occurrences);
  return {
    id,
    kind,
    schemaVersion: clean(record.schemaVersion, 240),
    cardType: clean(record.cardType || `${kind}-card`, 240),
    revisionId: clean(record.revisionId, 500),
    title: clean(record.title || record.primaryName || record.name || id, 800),
    summary: cleanMultiline(record.summary || record.publicContext || record.description || record.lore, 2_400),
    themes: unique([...list(record.themes), ...list(record.tags)], 80, 180),
    signals: unique([
      ...list(record.traversalTerms),
      ...list(record.signalLexicon?.literal),
      ...list(record.signalLexicon?.phonetic),
      ...list(record.signalLexicon?.orthographic),
      ...list(record.signalLexicon?.multilingual),
      ...list(record.signalLexicon?.mechanical),
      ...list(record.visualIdentity?.markers),
      ...list(record.visualIdentity?.motifs),
      ...occurrences.map((occurrence) => occurrence?.lyricSpan?.matchedText),
    ], 120, 240),
    evidenceClass,
    canonStatus: clean(authority.canonStatus || record.canonStatus, 180),
    reviewStatus: clean(authority.reviewStatus || record.reviewStatus || record.status, 180),
    authority: {
      evidenceClass,
      reviewStatus: clean(authority.reviewStatus || record.reviewStatus || record.status, 180),
      canonStatus: clean(authority.canonStatus || record.canonStatus, 180),
      approvedBy: clean(authority.approvedBy, 240),
      approvedAt: clean(authority.approvedAt, 80),
    },
    rightsAndPrivacy: {
      visibility: clean(rightsAndPrivacy.visibility, 80),
      containsPrivateClues: rightsAndPrivacy.containsPrivateClues === true,
      licenseStatus: clean(rightsAndPrivacy.licenseStatus, 240),
      publicProjectionAllowed: rightsAndPrivacy.publicProjectionAllowed === true,
    },
    provenance: {
      method: clean(provenance.method, 360),
      sourceRunId: clean(provenance.sourceRunId, 500),
      sourcePacketHash: clean(provenance.sourcePacketHash, 240),
      configurationVersion: clean(provenance.configurationVersion, 360),
      model: clean(provenance.model, 240),
      createdBy: clean(provenance.createdBy, 240),
    },
    source: normalizeSource(record.source || citations[0] || list(record.sourceRefs)[0]),
    citationCount: citations.length,
    occurrenceCount: occurrences.length,
    claimCount: list(record.claims).length,
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
  const authorityCounts = normalizeCounts(input.authorityCounts);
  const reviewStatusCounts = normalizeCounts(input.reviewStatusCounts);
  const canonStatusCounts = normalizeCounts(input.canonStatusCounts);
  return {
    id: clean(input.id, 500),
    profile: PACKET_PROFILES.has(input.profile) ? input.profile : "echo-reference-cards",
    digest: clean(input.digest, 100),
    cardCount: Math.max(0, Math.trunc(number(input.cardCount, 0))),
    authorityCounts,
    reviewStatusCounts,
    canonStatusCounts,
    referenceAtlas: {
      runId: clean(input.referenceAtlas?.runId, 500),
      runHash: clean(input.referenceAtlas?.runHash, 240),
      source: clean(input.referenceAtlas?.source, 240),
      availableCards: Math.max(0, Math.trunc(number(input.referenceAtlas?.availableCards, 0))),
      authority: {
        status: clean(input.referenceAtlas?.authority?.status, 180),
        receiptId: clean(input.referenceAtlas?.authority?.receiptId, 500),
        approvedCards: Math.max(0, Math.trunc(number(input.referenceAtlas?.authority?.approvedCards, 0))),
        resolvedWithoutPromotion: Math.max(0, Math.trunc(number(input.referenceAtlas?.authority?.resolvedWithoutPromotion, 0))),
        previewPolicy: clean(input.referenceAtlas?.authority?.previewPolicy, 180),
        publicActivation: input.referenceAtlas?.authority?.publicActivation === true,
        canonPromotion: input.referenceAtlas?.authority?.canonPromotion === true,
      },
    },
    selection: {
      mode: clean(input.selection?.mode, 180),
      targetCards: Math.max(0, Math.trunc(number(input.selection?.targetCards, 0))),
      sourceCardCount: Math.max(0, Math.trunc(number(input.selection?.sourceCardCount, 0))),
      queryDigest: clean(input.selection?.queryDigest, 100),
      packetCacheKey: clean(input.selection?.packetCacheKey, 500),
      fallbackCards: Math.max(0, Math.trunc(number(input.selection?.fallbackCards, 0))),
    },
  };
}
function normalizeOpticalReceipt(input = {}) { return { id: clean(input.id, 5_000), revision: Math.max(0, Math.trunc(number(input.revision, 0))), frameDigest: clean(input.frameDigest, 100) }; }
function normalizeReviewer(input = {}) {
  const budget = normalizeReferenceBudget(input.budget || input.parameters?.budget);
  const accounting = normalizeReferenceAccounting(input.accounting || input.telemetry, budget);
  return { agentId: clean(input.agentId, 240), taskId: clean(input.taskId, 500), model: clean(input.model, 240), reasoningEffort: clean(input.reasoningEffort, 80), parameters: input.parameters && typeof input.parameters === "object" ? structuredClone(input.parameters) : {}, budget, accounting, reviewMode: "reference-worker-card-packet", referenceInspectionConfirmed: input.referenceInspectionConfirmed === true, attestation: cleanMultiline(input.attestation, 2_000) };
}
function normalizeReferenceBudget(input = {}) {
  return {
    maxInputTokens: positive(input.maxInputTokens, HUMAN_VIDEO_REFERENCE_DEFAULT_BUDGET.maxInputTokens),
    maxOutputTokens: positive(input.maxOutputTokens, HUMAN_VIDEO_REFERENCE_DEFAULT_BUDGET.maxOutputTokens),
    maxTotalTokens: positive(input.maxTotalTokens, HUMAN_VIDEO_REFERENCE_DEFAULT_BUDGET.maxTotalTokens),
    maxWallClockMs: positive(input.maxWallClockMs, HUMAN_VIDEO_REFERENCE_DEFAULT_BUDGET.maxWallClockMs),
    maxReasoningEffort: clean(input.maxReasoningEffort, 80) || HUMAN_VIDEO_REFERENCE_DEFAULT_BUDGET.maxReasoningEffort,
  };
}
function normalizeReferenceAccounting(input = {}, budget = HUMAN_VIDEO_REFERENCE_DEFAULT_BUDGET) {
  const status = new Set(["captured", "unavailable"]).has(input.status) ? input.status : "";
  const inputTokens = Math.max(0, Math.trunc(number(input.inputTokens, 0)));
  const outputTokens = Math.max(0, Math.trunc(number(input.outputTokens, 0)));
  const totalTokens = Math.max(0, Math.trunc(number(input.totalTokens, inputTokens + outputTokens)));
  const wallClockMs = Math.max(0, Math.trunc(number(input.wallClockMs ?? input.elapsedMs, 0)));
  const stopReason = REFERENCE_STOP_REASONS.has(input.stopReason) ? input.stopReason : status === "captured" ? "completed" : "unknown";
  if (status === "captured" && (!clean(input.source, 360) || totalTokens !== inputTokens + outputTokens)) throw referenceError("reference_review_accounting_invalid", "Captured reference accounting requires a source and internally consistent token totals.");
  const budgetExceeded = status === "captured" && (inputTokens > budget.maxInputTokens || outputTokens > budget.maxOutputTokens || totalTokens > budget.maxTotalTokens || wallClockMs > budget.maxWallClockMs);
  return { status, source: clean(input.source, 360), inputTokens, outputTokens, totalTokens, wallClockMs, stopReason: budgetExceeded ? "budget" : stopReason, budgetExceeded };
}
function opticalQuery(input = {}) {
  const values = [
    input?.proposal?.description, input?.description,
    ...list(input?.proposal?.categories), ...list(input?.categories),
    ...list(input?.proposal?.tags), ...list(input?.tags),
    ...list(input?.proposal?.referenceSignals), ...list(input?.referenceSignals),
    ...list(input?.evidence?.frames).flatMap((frame) => [frame?.observation, ...list(frame?.palette?.colors).flatMap((color) => [color?.label, color?.explanation])]),
  ];
  return { terms: [...new Set(values.flatMap(tokenize))].sort() };
}
function tokenize(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((term) => term.length > 2).slice(0, 400); }
function candidateScore(card, query) {
  const queryTerms = new Set(query.terms);
  const scoreField = (value, weight) => tokenize(value).reduce((score, term) => score + (queryTerms.has(term) ? weight : 0), 0);
  return scoreField(card.title, 8) + scoreField(card.summary, 2) + list(card.themes).reduce((score, value) => score + scoreField(value, 4), 0) + list(card.signals).reduce((score, value) => score + scoreField(value, 6), 0);
}
function authorityRank(card) { return ({ direct: 0, "source-backed-candidate": 1, comparative: 2, unresolved: 3 })[card.evidenceClass] ?? 4; }
function countBy(values, keyFor) { return values.reduce((counts, value) => ({ ...counts, [keyFor(value)]: Number(counts[keyFor(value)] || 0) + 1 }), {}); }
function stableDigest(values) { return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(values)))); }
function positive(value, fallback) { const parsed = Math.trunc(number(value, fallback)); return parsed > 0 ? parsed : fallback; }
function effortRank(value) { return ({ none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6, ultra: 7 })[clean(value, 80).toLowerCase()] ?? 99; }
function normalizeSource(input = {}) { return { label: clean(input.label || input.title, 800), uri: clean(input.uri || input.url, 2_000), sourceKind: clean(input.sourceKind || input.sourceClass, 240), checkedAt: clean(input.checkedAt || input.retrievedAt, 80) }; }
function normalizeCounts(input = {}) { return input && typeof input === "object" ? Object.fromEntries(Object.entries(input).map(([key, value]) => [clean(key, 180), Math.max(0, Math.trunc(number(value, 0)))]).filter(([key]) => key)) : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function unique(input, limit, max) { return [...new Set(list(input).map((value) => clean(value, max)).filter(Boolean))].slice(0, limit); }
function number(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(value, max) { return String(value || "").replace(/\0/g, "").trim().slice(0, max); }
function cleanMultiline(value, max) { return String(value || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max); }
function referenceError(code, message, statusCode = 400, details = {}) { const error = new Error(message); error.code = code; error.statusCode = statusCode; error.details = details; return error; }
