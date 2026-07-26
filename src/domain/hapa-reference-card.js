export const HAPA_REFERENCE_CARD_SCHEMA = "hapa.reference-card.v1";
export const HAPA_REFERENCE_EDGE_SCHEMA = "hapa.reference-edge.v1";
export const HAPA_REFERENCE_DECISION_SCHEMA = "hapa.reference-decision.v1";

export const REFERENCE_NODE_TYPES = Object.freeze([
  "song",
  "lyric-span",
  "reference-card",
  "context-layer",
  "external-work",
  "person",
  "place",
  "media",
  "mechanic",
  "motif",
  "emotion",
  "unresolved-namespace"
]);

export const REFERENCE_EDGE_TYPES = Object.freeze([
  "occurs-in",
  "alludes-to",
  "supports",
  "challenges",
  "alternative-to",
  "same-entity-as",
  "alias-of",
  "adaptation-of",
  "co-activated-with",
  "recurs-with",
  "contrasts-with",
  "transforms",
  "imports-mechanic",
  "imports-emotion",
  "thematic-resonance",
  "narrative-continuation",
  "corroborates",
  "supersedes"
]);

export const REFERENCE_EVIDENCE_CLASSES = Object.freeze([
  "direct",
  "source-backed-candidate",
  "comparative",
  "unresolved"
]);

export const REFERENCE_REVIEW_STATUSES = Object.freeze([
  "proposed",
  "pending-review",
  "approved",
  "challenged",
  "rejected",
  "superseded",
  "withdrawn"
]);

export const REFERENCE_CANON_STATUSES = Object.freeze([
  "non-canon",
  "soft-canon",
  "canon"
]);

const VISIBILITIES = new Set(["private", "shared", "public"]);
const CLAIM_KINDS = new Set(["source-fact", "lyric-observation", "inference", "human-decision"]);
const EDGE_DIRECTIONS = new Set(["directed", "bidirectional"]);
const NODE_TYPE_SET = new Set(REFERENCE_NODE_TYPES);
const EDGE_TYPE_SET = new Set(REFERENCE_EDGE_TYPES);
const EVIDENCE_CLASS_SET = new Set(REFERENCE_EVIDENCE_CLASSES);
const REVIEW_STATUS_SET = new Set(REFERENCE_REVIEW_STATUSES);
const CANON_STATUS_SET = new Set(REFERENCE_CANON_STATUSES);

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function uniqueText(value) {
  const seen = new Set();
  return list(value).flatMap((item) => {
    const normalized = text(item);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function boundedNumber(value, fallback = 0) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(0, Math.min(1, candidate));
}

function positiveInteger(value, fallback = 1) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate > 0 ? candidate : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
}

function enumValue(value, allowed, fallback) {
  const normalized = text(value);
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeCitation(citation = {}, index = 0) {
  return {
    id: text(citation.id, `citation-${index + 1}`),
    label: text(citation.label),
    url: text(citation.url),
    sourceClass: text(citation.sourceClass, "unclassified"),
    publisher: text(citation.publisher),
    author: text(citation.author),
    publishedAt: text(citation.publishedAt),
    retrievedAt: text(citation.retrievedAt),
    safeExcerpt: text(citation.safeExcerpt),
    claimIds: uniqueText(citation.claimIds),
    visibility: enumValue(citation.visibility, VISIBILITIES, "public"),
    rights: {
      licenseStatus: text(citation.rights?.licenseStatus, "unknown"),
      quotationPolicy: text(citation.rights?.quotationPolicy, "minimal-rights-safe-excerpt"),
      notes: text(citation.rights?.notes)
    },
    freshness: {
      status: text(citation.freshness?.status, "unchecked"),
      checkedAt: text(citation.freshness?.checkedAt),
      failure: text(citation.freshness?.failure)
    }
  };
}

function normalizeOccurrence(occurrence = {}, index = 0) {
  const lineStart = positiveInteger(occurrence.lyricSpan?.lineStart || occurrence.lineStart, 1);
  const lineEnd = Math.max(
    lineStart,
    positiveInteger(occurrence.lyricSpan?.lineEnd || occurrence.lineEnd, lineStart)
  );
  const startSeconds = nullableNumber(occurrence.lyricSpan?.startSeconds ?? occurrence.startSeconds);
  const endCandidate = nullableNumber(occurrence.lyricSpan?.endSeconds ?? occurrence.endSeconds);
  return {
    id: text(occurrence.id, `${text(occurrence.songId, "unknown-song")}:occurrence-${index + 1}`),
    songId: text(occurrence.songId),
    songTitle: text(occurrence.songTitle),
    albumProjection: text(occurrence.albumProjection, "Echo Album"),
    lyricSpan: {
      lineStart,
      lineEnd,
      startSeconds,
      endSeconds: endCandidate === null || startSeconds === null
        ? endCandidate
        : Math.max(startSeconds, endCandidate),
      lyricText: text(occurrence.lyricSpan?.lyricText || occurrence.lyricText),
      matchedText: text(occurrence.lyricSpan?.matchedText || occurrence.matchedText)
    },
    relationType: EDGE_TYPE_SET.has(text(occurrence.relationType))
      ? text(occurrence.relationType)
      : "alludes-to",
    confidence: boundedNumber(occurrence.confidence, 0.5),
    status: enumValue(occurrence.status, REVIEW_STATUS_SET, "pending-review"),
    pointer: text(occurrence.pointer)
  };
}

function normalizeClaim(claim = {}, index = 0) {
  return {
    id: text(claim.id, `claim-${index + 1}`),
    kind: enumValue(claim.kind, CLAIM_KINDS, "inference"),
    text: text(claim.text),
    evidenceClass: enumValue(claim.evidenceClass, EVIDENCE_CLASS_SET, "unresolved"),
    confidence: boundedNumber(claim.confidence, 0),
    citationIds: uniqueText(claim.citationIds),
    occurrenceIds: uniqueText(claim.occurrenceIds),
    caveat: text(claim.caveat)
  };
}

function normalizeInterpretation(interpretation = {}, index = 0) {
  return {
    id: text(interpretation.id, `interpretation-${index + 1}`),
    title: text(interpretation.title, `Interpretation ${index + 1}`),
    summary: text(interpretation.summary),
    readingLayers: {
      surface: text(interpretation.readingLayers?.surface),
      contextual: text(interpretation.readingLayers?.contextual),
      thematic: text(interpretation.readingLayers?.thematic),
      emotional: text(interpretation.readingLayers?.emotional),
      narrative: text(interpretation.readingLayers?.narrative),
      operationalMechanic: text(interpretation.readingLayers?.operationalMechanic)
    },
    confidence: boundedNumber(interpretation.confidence, 0),
    status: enumValue(interpretation.status, REVIEW_STATUS_SET, "proposed"),
    claimIds: uniqueText(interpretation.claimIds),
    caveats: uniqueText(interpretation.caveats),
    proposedBy: text(interpretation.proposedBy),
    approvedBy: text(interpretation.approvedBy)
  };
}

export function normalizeHapaReferenceEdge(edge = {}) {
  const fromId = text(edge.fromId || edge.fromReferenceId);
  const toId = text(edge.toId || edge.toReferenceId);
  const relationType = EDGE_TYPE_SET.has(text(edge.relationType))
    ? text(edge.relationType)
    : "thematic-resonance";
  return {
    schemaVersion: HAPA_REFERENCE_EDGE_SCHEMA,
    id: text(edge.id, `${fromId}:${relationType}:${toId}`),
    fromId,
    fromType: enumValue(edge.fromType, NODE_TYPE_SET, "reference-card"),
    toId,
    toType: enumValue(edge.toType, NODE_TYPE_SET, "reference-card"),
    relationType,
    direction: enumValue(edge.direction, EDGE_DIRECTIONS, "directed"),
    weight: boundedNumber(edge.weight, 0.5),
    confidence: boundedNumber(edge.confidence, 0.5),
    evidenceClass: enumValue(edge.evidenceClass, EVIDENCE_CLASS_SET, "unresolved"),
    status: enumValue(edge.status, REVIEW_STATUS_SET, "proposed"),
    rationale: text(edge.rationale),
    support: {
      sharedSongIds: uniqueText(edge.support?.sharedSongIds),
      sharedThemes: uniqueText(edge.support?.sharedThemes),
      sharedMechanics: uniqueText(edge.support?.sharedMechanics),
      reasonCodes: uniqueText(edge.support?.reasonCodes),
      lineProximity: list(edge.support?.lineProximity).map((row) => ({
        songId: text(row?.songId),
        leftLine: positiveInteger(row?.leftLine, 1),
        rightLine: positiveInteger(row?.rightLine, 1),
        distance: Math.max(0, Number(row?.distance) || 0),
      })).filter((row) => row.songId),
      channelCount: Math.max(0, Number(edge.support?.channelCount) || 0),
    },
    claimIds: uniqueText(edge.claimIds),
    citationIds: uniqueText(edge.citationIds),
    derived: edge.derived !== false,
    humanApproved: edge.humanApproved === true,
    provenance: {
      method: text(edge.provenance?.method, "unspecified"),
      sourceRunId: text(edge.provenance?.sourceRunId),
      sourcePacketHash: text(edge.provenance?.sourcePacketHash),
      createdBy: text(edge.provenance?.createdBy),
      createdAt: text(edge.provenance?.createdAt),
      decisionIds: uniqueText(edge.provenance?.decisionIds)
    }
  };
}

export function normalizeHapaReferenceCard(card = {}) {
  const id = text(card.id);
  const reviewStatus = enumValue(card.authority?.reviewStatus || card.reviewStatus, REVIEW_STATUS_SET, "proposed");
  const canonStatus = enumValue(card.authority?.canonStatus || card.canonStatus, CANON_STATUS_SET, "non-canon");
  const visibility = enumValue(card.rightsAndPrivacy?.visibility || card.visibility, VISIBILITIES, "private");
  return {
    schemaVersion: HAPA_REFERENCE_CARD_SCHEMA,
    id,
    revisionId: text(card.revisionId, id ? `${id}:r1` : ""),
    parentRevisionId: text(card.parentRevisionId),
    title: text(card.title, id),
    aliases: uniqueText(card.aliases),
    referenceType: enumValue(card.referenceType, NODE_TYPE_SET, "external-work"),
    summary: text(card.summary),
    publicContext: text(card.publicContext),
    occurrences: list(card.occurrences).map(normalizeOccurrence),
    citations: list(card.citations).map(normalizeCitation),
    claims: list(card.claims).map(normalizeClaim),
    interpretations: list(card.interpretations).map(normalizeInterpretation),
    relationships: list(card.relationships).map(normalizeHapaReferenceEdge),
    signalLexicon: {
      literal: uniqueText(card.signalLexicon?.literal),
      phonetic: uniqueText(card.signalLexicon?.phonetic),
      orthographic: uniqueText(card.signalLexicon?.orthographic),
      multilingual: uniqueText(card.signalLexicon?.multilingual),
      mechanical: uniqueText(card.signalLexicon?.mechanical)
    },
    themes: uniqueText(card.themes),
    mechanics: uniqueText(card.mechanics),
    emotions: uniqueText(card.emotions),
    mediaEntities: list(card.mediaEntities).map((entity, index) => ({
      id: text(entity?.id, `media-entity-${index + 1}`),
      type: text(entity?.type, "media"),
      label: text(entity?.label),
      pointer: text(entity?.pointer),
      rightsStatus: text(entity?.rightsStatus, "reference-only")
    })),
    unresolved: list(card.unresolved).map((item, index) => ({
      id: text(item?.id, `unresolved-${index + 1}`),
      label: text(item?.label),
      possibleNamespaces: uniqueText(item?.possibleNamespaces),
      attempts: uniqueText(item?.attempts),
      leverage: boundedNumber(item?.leverage, 0),
      status: text(item?.status, "open")
    })),
    authority: {
      evidenceClass: enumValue(card.authority?.evidenceClass || card.evidenceClass, EVIDENCE_CLASS_SET, "unresolved"),
      reviewStatus,
      canonStatus,
      approvedBy: text(card.authority?.approvedBy),
      approvedAt: text(card.authority?.approvedAt),
      canonizedBy: text(card.authority?.canonizedBy),
      canonizedAt: text(card.authority?.canonizedAt)
    },
    rightsAndPrivacy: {
      visibility,
      containsPersonalData: card.rightsAndPrivacy?.containsPersonalData === true,
      containsPrivateClues: card.rightsAndPrivacy?.containsPrivateClues === true,
      licenseStatus: text(card.rightsAndPrivacy?.licenseStatus, "reference-only"),
      quotationPolicy: text(card.rightsAndPrivacy?.quotationPolicy, "minimal-rights-safe-excerpt"),
      publicProjectionAllowed: card.rightsAndPrivacy?.publicProjectionAllowed === true
    },
    custody: {
      originCoreKey: text(card.custody?.originCoreKey),
      eventId: text(card.custody?.eventId),
      contentDigest: text(card.custody?.contentDigest),
      custodyStatus: text(card.custody?.custodyStatus, "uncommitted")
    },
    provenance: {
      method: text(card.provenance?.method, "unspecified"),
      sourceRunId: text(card.provenance?.sourceRunId),
      sourcePacketHash: text(card.provenance?.sourcePacketHash),
      configurationVersion: text(card.provenance?.configurationVersion),
      model: text(card.provenance?.model),
      createdBy: text(card.provenance?.createdBy),
      createdAt: text(card.provenance?.createdAt),
      decisionIds: uniqueText(card.provenance?.decisionIds)
    }
  };
}

function duplicateIds(rows = []) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    if (!row?.id) continue;
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  }
  return [...duplicates];
}

export function validateHapaReferenceCard(input = {}) {
  const card = normalizeHapaReferenceCard(input);
  const errors = [];
  if (input?.schemaVersion && input.schemaVersion !== HAPA_REFERENCE_CARD_SCHEMA) errors.push("schema-version");
  if (!card.id) errors.push("id");
  if (!card.revisionId) errors.push("revision-id");
  if (!card.title) errors.push("title");
  if (!card.occurrences.length) errors.push("occurrences");
  if (card.occurrences.some((item) => !item.songId)) errors.push("occurrence-song-id");
  if (card.occurrences.some((item) => item.lyricSpan.endSeconds !== null
    && item.lyricSpan.startSeconds !== null
    && item.lyricSpan.endSeconds < item.lyricSpan.startSeconds)) {
    errors.push("occurrence-time-order");
  }
  if (card.citations.some((item) => item.claimIds.length > 0 && !item.url)) errors.push("citation-url");
  if (card.claims.some((item) => !item.text)) errors.push("claim-text");
  if (card.interpretations.some((item) => !item.summary)) errors.push("interpretation-summary");
  if (card.relationships.some((item) => !item.fromId || !item.toId || item.fromId === item.toId)) {
    errors.push("relationship-endpoints");
  }
  if (duplicateIds(card.occurrences).length) errors.push("duplicate-occurrence-id");
  if (duplicateIds(card.citations).length) errors.push("duplicate-citation-id");
  if (duplicateIds(card.claims).length) errors.push("duplicate-claim-id");
  if (duplicateIds(card.interpretations).length) errors.push("duplicate-interpretation-id");
  if (duplicateIds(card.relationships).length) errors.push("duplicate-relationship-id");

  const claimIds = new Set(card.claims.map((item) => item.id));
  const citationIds = new Set(card.citations.map((item) => item.id));
  const occurrenceIds = new Set(card.occurrences.map((item) => item.id));
  if (card.claims.some((claim) => claim.citationIds.some((id) => !citationIds.has(id)))) {
    errors.push("claim-citation-pointer");
  }
  if (card.claims.some((claim) => claim.occurrenceIds.some((id) => !occurrenceIds.has(id)))) {
    errors.push("claim-occurrence-pointer");
  }
  if (card.interpretations.some((item) => item.claimIds.some((id) => !claimIds.has(id)))) {
    errors.push("interpretation-claim-pointer");
  }
  if (card.relationships.some((item) => item.claimIds.some((id) => !claimIds.has(id)))) {
    errors.push("relationship-claim-pointer");
  }
  if (card.relationships.some((item) => item.citationIds.some((id) => !citationIds.has(id)))) {
    errors.push("relationship-citation-pointer");
  }

  if (card.authority.reviewStatus === "approved" && !card.authority.approvedBy) {
    errors.push("approved-by");
  }
  if (card.authority.canonStatus !== "non-canon") {
    if (card.authority.reviewStatus !== "approved") errors.push("canon-requires-approved-review");
    if (!card.authority.canonizedBy) errors.push("canonized-by");
  }
  if (card.rightsAndPrivacy.visibility === "public") {
    if (!card.rightsAndPrivacy.publicProjectionAllowed) errors.push("public-projection-approval");
    if (card.rightsAndPrivacy.containsPrivateClues) errors.push("public-private-clues");
    if (card.citations.some((item) => item.visibility === "private")) errors.push("public-private-citation");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    card
  };
}

export function projectPublicHapaReferenceCard(input = {}) {
  const result = validateHapaReferenceCard(input);
  const card = result.card;
  if (!result.ok
    || card.rightsAndPrivacy.visibility !== "public"
    || !card.rightsAndPrivacy.publicProjectionAllowed
    || card.rightsAndPrivacy.containsPrivateClues) {
    return null;
  }
  return {
    ...card,
    citations: card.citations.filter((citation) => citation.visibility === "public"),
    unresolved: [],
    provenance: {
      method: card.provenance.method,
      sourceRunId: card.provenance.sourceRunId,
      sourcePacketHash: card.provenance.sourcePacketHash,
      configurationVersion: card.provenance.configurationVersion,
      model: "",
      createdBy: card.provenance.createdBy,
      createdAt: card.provenance.createdAt,
      decisionIds: card.provenance.decisionIds
    },
    rightsAndPrivacy: {
      ...card.rightsAndPrivacy,
      containsPersonalData: false,
      containsPrivateClues: false
    }
  };
}

export function normalizeHapaReferenceDecision(decision = {}) {
  return {
    schemaVersion: HAPA_REFERENCE_DECISION_SCHEMA,
    id: text(decision.id),
    targetId: text(decision.targetId),
    targetRevisionId: text(decision.targetRevisionId),
    action: text(decision.action),
    reason: text(decision.reason),
    actor: text(decision.actor),
    authority: text(decision.authority, "contributor"),
    evidenceIds: uniqueText(decision.evidenceIds),
    affectedEdgeIds: uniqueText(decision.affectedEdgeIds),
    createdAt: text(decision.createdAt),
    supersedesDecisionId: text(decision.supersedesDecisionId)
  };
}
