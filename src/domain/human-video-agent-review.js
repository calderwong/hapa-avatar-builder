import { assertHumanVideoOpticalTextBoundary } from "./human-video-optical-boundary.js";

export const HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA = "hapa.human-video-agent-review-store.v1";
export const HUMAN_VIDEO_AGENT_REVIEW_SCHEMA = "hapa.human-video-agent-review.v1";
export const HUMAN_VIDEO_AGENT_REVIEW_EVENT_SCHEMA = "hapa.human-video-agent-review-event.v1";

const REVIEW_STATUSES = new Set(["pending-human", "accepted", "accepted-edited", "rejected", "blocked"]);
const EVIDENCE_TYPES = new Set(["visual-observation", "knowledge-base-inference", "source-relationship"]);
const REFERENCE_TYPES = new Set(["echo-song", "song", "card", "scene", "avatar", "url", "other"]);
const VISUAL_REFERENCE_STATUSES = new Set(["matched", "none-observed", "uncertain", "not-run"]);
const VISUAL_MATCH_TYPES = new Set(["direct-marking", "text", "symbol", "palette", "geometry", "costume", "object", "composition", "visual-motif", "thematic-inference"]);
const PALETTE_PREVALENCE = new Set(["dominant", "supporting", "accent"]);
const FINAL_HUMAN_REVIEW_STATUSES = new Set(["accepted", "accepted-edited", "rejected"]);

export function createHumanVideoAgentReviewStore(input = {}) {
  return normalizeHumanVideoAgentReviewStore({
    schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA,
    reviews: Object.prototype.hasOwnProperty.call(input, "reviews") ? input.reviews : [],
    updatedAt: input.updatedAt || null,
  });
}

export function normalizeHumanVideoAgentReviewStore(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw reviewError("agent_review_store_root_invalid", "The optical review store root must be its schema-bound object; refusing to reinterpret another JSON shape as empty review state.", 500);
  }
  if (input.schemaVersion !== HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA) {
    throw reviewError("agent_review_store_schema_invalid", `The optical review store must declare ${HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA}; refusing an unknown review custody schema.`, 500);
  }
  if (!Object.prototype.hasOwnProperty.call(input, "reviews")) {
    throw reviewError("agent_review_store_reviews_missing", "The optical review store is missing its reviews ledger; refusing to reinterpret incomplete persisted custody as empty.", 500);
  }
  if (!Array.isArray(input.reviews)) {
    throw reviewError("agent_review_store_reviews_invalid", "The optical review store's reviews collection must be an array; refusing to discard malformed persisted review state.", 500);
  }
  const byVideo = new Map();
  for (const [index, candidate] of input.reviews.entries()) {
    let review;
    try {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.schemaVersion !== HUMAN_VIDEO_AGENT_REVIEW_SCHEMA) {
        throw reviewError("agent_review_schema_invalid", `Persisted optical reviews must declare ${HUMAN_VIDEO_AGENT_REVIEW_SCHEMA}.`);
      }
      if (!Object.prototype.hasOwnProperty.call(candidate, "status")) {
        throw reviewError("agent_review_status_missing", "A persisted optical review must explicitly retain its human-authority status.");
      }
      review = normalizeHumanVideoAgentReview(candidate);
    } catch (error) {
      throw reviewError("agent_review_store_entry_invalid", `Optical review store entry ${index + 1} is invalid; refusing to rewrite a store that could contain human decisions.`, 500, {
        index,
        cause: error?.code || error?.message || String(error),
      });
    }
    const current = byVideo.get(review.videoKey);
    if (current) {
      throw reviewError("agent_review_store_duplicate_video_identity", `Optical review store entries ${index} and ${index + 1} both identify ${review.videoKey}; refusing to choose one and discard the other.`, 500, {
        videoKey: review.videoKey,
        firstReviewId: current.id,
        duplicateReviewId: review.id,
      });
    }
    byVideo.set(review.videoKey, review);
  }
  const reviews = [...byVideo.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.videoKey.localeCompare(b.videoKey));
  return {
    schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA,
    reviews,
    updatedAt: clean(input.updatedAt, 80) || reviews.map((review) => review.updatedAt).filter(Boolean).sort().at(-1) || null,
    truthBoundary: "New optical-worker proposals contain only one overall description and one concise hex palette for each claimed First, Middle, and Last frame. Human-authored enrichment remains separate authority.",
  };
}

export function normalizeHumanVideoAgentReview(input = {}, fallback = {}) {
  const videoKey = clean(input.videoKey || input.key || fallback.videoKey, 4_500);
  if (!videoKey) throw reviewError("agent_review_video_key_required", "An optical review must name one stable Human Enricher video key.");
  const suppliedStatus = Object.prototype.hasOwnProperty.call(input, "status") ? input.status : fallback.status;
  if (suppliedStatus !== undefined && !REVIEW_STATUSES.has(suppliedStatus)) {
    throw reviewError("agent_review_status_invalid", `Unknown optical review status: ${clean(suppliedStatus, 120) || "empty"}.`);
  }
  const status = suppliedStatus || "pending-human";
  const revision = Math.max(1, Math.trunc(number(input.revision ?? fallback.revision, 1)));
  const reviewer = normalizeReviewer(input.reviewer || fallback.reviewer);
  const frames = normalizeFrames(input.evidence?.frames || input.frames || fallback.evidence?.frames || fallback.frames);
  const requiredFrameCount = Math.max(3, Math.trunc(number(input.evidence?.requiredFrameCount ?? fallback.evidence?.requiredFrameCount, frames.length || 3)));
  if (status !== "blocked") {
    if (reviewer.opticalInspectionConfirmed !== true) throw reviewError("optical_inspection_attestation_required", "A completed agent review must attest that the reviewer inspected every listed frame with optical visibility.");
    if (frames.length !== 3 || !["first", "mid", "last"].every((role) => frames.some((frame) => frame.role === role))) throw reviewError("optical_frame_evidence_insufficient", "A completed agent review requires exactly one First, Mid, and Last keyframe.");
    if (new Set(frames.map((frame) => frame.sha256)).size < 3) throw reviewError("optical_frame_evidence_not_distinct", "A completed agent review requires three distinct frame hashes.");
    if (frames.length < requiredFrameCount) throw reviewError("registered_frame_coverage_incomplete", `The review addressed ${frames.length} of ${requiredFrameCount} required registered frames.`);
  }
  const now = clean(input.updatedAt || fallback.updatedAt, 80) || null;
  const proposal = normalizeProposal(input.proposal || fallback.proposal);
  if (status !== "blocked" && !proposal.description) {
    throw reviewError("agent_review_diagnosis_required", "A completed optical review requires one overall visual description.");
  }
  return {
    schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_SCHEMA,
    id: clean(input.id || fallback.id || `${videoKey}:optical:r${revision}`, 5_000),
    videoKey,
    videoId: clean(input.videoId || fallback.videoId, 360),
    videoName: clean(input.videoName || fallback.videoName, 800),
    videoIdentity: normalizeIdentity(input.videoIdentity || fallback.videoIdentity),
    status,
    reviewer,
    evidence: {
      extractionOnlyAutomation: true,
      semanticJudgmentAutomation: false,
      inspectedFrameCount: frames.length,
      requiredFrameCount,
      allRequiredFramesAddressed: frames.length >= requiredFrameCount,
      frames,
    },
    proposal,
    knowledgeComparisons: normalizeKnowledgeComparisons(input.knowledgeComparisons || fallback.knowledgeComparisons),
    blockedReason: cleanMultiline(input.blockedReason || fallback.blockedReason, 2_000),
    humanDecision: normalizeHumanDecision(input.humanDecision || fallback.humanDecision),
    revision,
    createdAt: clean(input.createdAt || fallback.createdAt, 80) || now,
    updatedAt: now,
  };
}

export function upsertHumanVideoAgentReview(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoAgentReviewStore(storeInput);
  const videoKey = clean(input.videoKey || input.key, 4_500);
  if (!videoKey) throw reviewError("agent_review_video_key_required", "Select one known video before submitting an optical review.");
  const current = store.reviews.find((review) => review.videoKey === videoKey) || null;
  if (current?.reviewer?.schedulerReceipt?.jobId) {
    throw reviewError("agent_review_campaign_managed", "This optical proposal is owned by a campaign job and cannot be revised through the ordinary agent submission path. A human may still decide it through the separate decision route.", 409, {
      videoKey,
      currentReviewId: current.id,
      campaignJobId: current.reviewer.schedulerReceipt.jobId,
      currentRevision: current.revision,
    });
  }
  if (current && FINAL_HUMAN_REVIEW_STATUSES.has(current.status)) {
    throw reviewError("agent_review_human_decision_final", "This optical proposal already has a human decision. A new campaign must explicitly create a superseding lineage instead of overwriting it.", 409, {
      videoKey,
      currentReviewId: current.id,
      currentStatus: current.status,
      currentRevision: current.revision,
    });
  }
  if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== Number(current?.revision || 0)) {
    throw reviewError("agent_review_revision_conflict", "This optical review changed while the agent was working. Reclaim and inspect the current frames.", 409, {
      expectedRevision: Number(input.expectedRevision),
      currentRevision: Number(current?.revision || 0),
    });
  }
  const now = options.now || new Date().toISOString();
  const agentInput = {
    ...input,
    status: input.status === "blocked" ? "blocked" : "pending-human",
    humanDecision: null,
    reviewer: {
      ...(input.reviewer || {}),
      schedulerReceipt: options.schedulerAuthority === true ? input.reviewer?.schedulerReceipt : null,
    },
  };
  assertHumanVideoOpticalTextBoundary({
    proposal: agentInput.proposal || {},
    frames: (Array.isArray(agentInput.evidence?.frames) ? agentInput.evidence.frames : []).map((frame) => ({ observation: frame?.observation || frame?.visualObservation })),
  }, { code: "agent_review_knowledge_claim_forbidden" });
  const review = normalizeHumanVideoAgentReview({
    ...(current || {}),
    ...agentInput,
    videoKey,
    reviewer: { ...(current?.reviewer || {}), ...(agentInput.reviewer || {}), agentId: options.agentId || agentInput.reviewer?.agentId || current?.reviewer?.agentId },
    revision: Number(current?.revision || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  });
  const incomingProposal = agentInput.proposal || {};
  if (
    (Array.isArray(incomingProposal.references) && incomingProposal.references.length)
    || (Array.isArray(incomingProposal.avatarRelationships) && incomingProposal.avatarRelationships.length)
    || (Array.isArray(input.knowledgeComparisons) && input.knowledgeComparisons.length)
    || (Array.isArray(incomingProposal.visualReferenceAnalysis?.matches) && incomingProposal.visualReferenceAnalysis.matches.length)
  ) {
    throw reviewError("reference_fields_require_reference_pass", "Optical workers may record visible signals, but Card, Avatar, song, scene, and lore matches must be submitted through the bounded reference-worker pass.");
  }
  if (review.status !== "blocked" && review.evidence.frames.some((frame) => (
    frame.palette.colors.length < 3
    || frame.palette.colors.length > 5
    || frame.palette.colors.some((color) => !/^#[A-F0-9]{6}$/.test(color.hex) || color.evidenceFrameHashes[0] !== frame.sha256)
  ))) {
    throw reviewError("optical_frame_palette_required", "New optical reviews require one separate 3–5 color #RRGGBB palette for each inspected First, Middle, and Last frame.");
  }
  return {
    store: normalizeHumanVideoAgentReviewStore({ ...store, reviews: [...store.reviews.filter((item) => item.videoKey !== videoKey), review], updatedAt: now }),
    review,
  };
}

export function decideHumanVideoAgentReview(storeInput = {}, reviewId, decisionInput = {}, options = {}) {
  const store = normalizeHumanVideoAgentReviewStore(storeInput);
  const current = store.reviews.find((review) => review.id === reviewId);
  if (!current) throw reviewError("agent_review_not_found", "The optical proposal is no longer available.", 404);
  const action = clean(decisionInput.action, 80);
  if (!new Set(["accepted", "accepted-edited", "rejected"]).has(action)) throw reviewError("agent_review_decision_invalid", "Choose accepted, accepted-edited, or rejected.");
  const now = options.now || new Date().toISOString();
  const review = normalizeHumanVideoAgentReview({
    ...current,
    status: action,
    revision: current.revision + 1,
    updatedAt: now,
    humanDecision: {
      action,
      actorId: options.actorId || decisionInput.actorId || "local-human-operator",
      notes: decisionInput.notes || "",
      decidedAt: now,
      resultingEnrichmentRevision: decisionInput.resultingEnrichmentRevision || null,
    },
  });
  return {
    store: normalizeHumanVideoAgentReviewStore({ ...store, reviews: [...store.reviews.filter((item) => item.id !== reviewId), review], updatedAt: now }),
    review,
  };
}

export function attachAgentReviewsToVideos(videos = [], storeInput = {}) {
  const store = normalizeHumanVideoAgentReviewStore(storeInput);
  const byKey = new Map(store.reviews.map((review) => [review.videoKey, review]));
  return videos.map((video) => ({ ...video, agentReview: byKey.get(video.humanVideoKey) || null }));
}

function normalizeReviewer(input = {}) {
  return {
    agentId: clean(input.agentId, 240),
    taskId: clean(input.taskId, 500),
    model: clean(input.model, 240),
    reasoningEffort: clean(input.reasoningEffort || input.effort || input.reasoning, 80),
    parameters: normalizeReviewerParameters(input.parameters),
    reviewMode: "vision-subagent-optical-only",
    opticalInspectionConfirmed: input.opticalInspectionConfirmed === true,
    attestation: cleanMultiline(input.attestation, 2_000),
    fieldNormalization: uniqueStrings(input.fieldNormalization, 120, 500),
    schedulerReceipt: normalizeSchedulerReceipt(input.schedulerReceipt),
  };
}

function normalizeReviewerParameters(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 40).map(([key, value]) => [clean(key, 120), typeof value === "number" || typeof value === "boolean" ? value : clean(value, 500)]).filter(([key]) => key));
}

function normalizeSchedulerReceipt(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const jobId = clean(input.jobId, 600);
  const frameDigest = clean(input.frameDigest, 240);
  if (!jobId && !frameDigest) return null;
  return {
    campaignId: clean(input.campaignId, 500),
    jobId,
    attempt: Math.max(0, Math.trunc(number(input.attempt, 0))),
    frameDigest,
    claimedAt: clean(input.claimedAt, 80) || null,
    submittedAt: clean(input.submittedAt, 80) || null,
    telemetryStatus: clean(input.telemetryStatus, 80),
    telemetrySource: clean(input.telemetrySource, 360),
    sessionId: clean(input.sessionId, 500),
    completionToken: clean(input.completionToken, 500),
    resultDigest: clean(input.resultDigest, 240),
    accounting: {
      status: clean(input.accounting?.status, 80),
      source: clean(input.accounting?.source, 360),
      pass: "optical",
      packetRecords: Math.max(0, Math.trunc(number(input.accounting?.packetRecords, 0))),
      inputTokens: Math.max(0, Math.trunc(number(input.accounting?.inputTokens, 0))),
      cachedInputTokens: Math.max(0, Math.trunc(number(input.accounting?.cachedInputTokens, 0))),
      outputTokens: Math.max(0, Math.trunc(number(input.accounting?.outputTokens, 0))),
      totalTokens: Math.max(0, Math.trunc(number(input.accounting?.totalTokens, 0))),
      wallClockMs: Math.max(0, Math.trunc(number(input.accounting?.wallClockMs, 0))),
      stopReason: clean(input.accounting?.stopReason, 80),
      budgetExceeded: input.accounting?.budgetExceeded === true,
    },
  };
}

function normalizeFrames(input = []) {
  const sourceFrames = (Array.isArray(input) ? input : []).slice(0, 24);
  const midIndex = Math.floor((sourceFrames.length - 1) / 2);
  return sourceFrames.map((frame, index) => {
    const sha256 = normalizeSha256(frame.sha256 || frame.imageSha256);
    const observation = cleanMultiline(frame.observation || frame.visualObservation, 4_000);
    if (!sha256) throw reviewError("optical_frame_hash_required", `Inspected frame ${index + 1} is missing a SHA-256 digest.`);
    return {
      ordinal: index + 1,
      role: index === 0 ? "first" : index === sourceFrames.length - 1 ? "last" : index === midIndex ? "mid" : "intermediate",
      timestampSeconds: Math.max(0, number(frame.timestampSeconds ?? frame.timestamp, 0)),
      normalizedPosition: Math.max(0, Math.min(1, number(frame.normalizedPosition, index / Math.max(1, sourceFrames.length - 1)))),
      imagePath: clean(frame.imagePath || frame.path, 4_500),
      imageUri: clean(frame.imageUri || frame.uri, 4_500),
      sha256,
      observation,
      palette: normalizeFramePalette(frame.palette || frame.framePalette, sha256),
    };
  });
}

function normalizeProposal(input = {}) {
  return {
    description: cleanMultiline(input.description, 12_000),
    quality: {
      value: Math.max(0, Math.min(5, Math.trunc(number(input.quality?.value ?? input.quality, 0)))),
      explanation: cleanMultiline(input.quality?.explanation || input.qualityExplanation, 4_000),
      technicalUsability: score(input.quality?.technicalUsability),
      visualCraft: score(input.quality?.visualCraft),
      narrativeValue: score(input.quality?.narrativeValue),
      identityConfidence: score(input.quality?.identityConfidence),
    },
    categories: uniqueStrings(input.categories, 80, 180),
    tags: uniqueStrings(input.tags, 160, 180),
    referenceSignals: uniqueStrings(input.referenceSignals || input.visualSignals || input.visualReferenceAnalysis?.observedSignals, 120, 1_000),
    referenceSignalOutcome: new Set(["observed", "none-visible", "unknown"]).has(input.referenceSignalOutcome) ? input.referenceSignalOutcome : "unknown",
    avatarRelationships: (Array.isArray(input.avatarRelationships) ? input.avatarRelationships : []).slice(0, 80).map((item) => normalizeRelationship(item, "avatar")),
    references: (Array.isArray(input.references) ? input.references : []).slice(0, 120).map(normalizeReference).filter(Boolean),
    visualReferenceAnalysis: normalizeVisualReferenceAnalysis(input.visualReferenceAnalysis),
    directorNotes: cleanMultiline(input.directorNotes, 12_000),
    strengths: uniqueStrings(input.strengths, 60, 1_000),
    issues: uniqueStrings(input.issues, 60, 1_000),
    uncertainty: cleanMultiline(input.uncertainty, 4_000),
    confidence: score(input.confidence),
  };
}

function normalizeFramePalette(input = {}, frameSha256 = "") {
  const source = Array.isArray(input) ? { colors: input } : input && typeof input === "object" ? input : {};
  const normalizedColors = (Array.isArray(source.colors) ? source.colors : []).slice(0, 8).map((color) => {
    const normalizedHex = String(color?.hex || color?.value || "").trim().toUpperCase();
    if (!/^#[A-F0-9]{6}$/.test(normalizedHex)) return null;
    const prevalence = clean(color.prevalence || color.role, 80).toLowerCase();
    return {
      hex: normalizedHex,
      label: clean(color.label || color.name, 180),
      prevalence: PALETTE_PREVALENCE.has(prevalence) ? prevalence : "",
      explanation: cleanMultiline(color.explanation || color.evidence || color.whereSeen, 2_000),
      evidenceFrameHashes: frameSha256 ? [frameSha256] : [],
    };
  }).filter(Boolean);
  const colors = [...new Map(normalizedColors.map((color) => [color.hex, color])).values()];
  return {
    method: "vision-agent-estimate",
    semanticJudgmentAutomation: false,
    frameSha256,
    colors,
    uncertainty: cleanMultiline(source.uncertainty, 2_000),
  };
}

function normalizeVisualReferenceAnalysis(input = {}) {
  const completed = input.completed === true;
  const matches = (Array.isArray(input.matches) ? input.matches : []).slice(0, 120).map((match) => ({
    sourcePath: clean(match.sourcePath || match.source, 4_500),
    entityId: clean(match.entityId || match.sourceId || match.id, 360),
    entityLabel: clean(match.entityLabel || match.title || match.label, 800),
    matchType: visualMatchType(match.matchType || match.evidenceClass || match.classification),
    observedEvidence: cleanMultiline(match.observedEvidence || match.visualEvidence || match.result || match.reason, 3_000),
    explanation: cleanMultiline(match.explanation || match.relationship || match.reason || match.result, 3_000),
    confidence: score(match.confidence),
  })).filter((match) => match.sourcePath && match.observedEvidence && match.explanation);
  const status = VISUAL_REFERENCE_STATUSES.has(input.status) ? input.status : completed ? matches.length ? "matched" : "none-observed" : "not-run";
  return {
    completed,
    status: completed && status === "matched" && !matches.length ? "uncertain" : status,
    observedSignals: flattenReferenceText(input.observedSignals, 120),
    matches,
    negativeFindings: flattenReferenceText(input.negativeFindings, 120),
  };
}

function visualMatchType(value) {
  const normalized = clean(value, 180).toLowerCase().replace(/[_\s]+/g, "-");
  if (VISUAL_MATCH_TYPES.has(normalized)) return normalized;
  for (const type of ["direct-marking", "text", "symbol", "palette", "geometry", "costume", "object", "composition", "visual-motif", "thematic-inference"]) {
    if (normalized.includes(type.replace("visual-", ""))) return type;
  }
  return "visual-motif";
}

function flattenReferenceText(input, limit) {
  const values = [];
  const visit = (value) => {
    if (values.length >= limit || value == null) return;
    if (typeof value === "string" || typeof value === "number") {
      const text = clean(value, 1_000);
      if (text) values.push(text);
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === "object") {
      if (value.finding) return visit(value.finding);
      Object.values(value).forEach(visit);
    }
  };
  visit(input);
  return [...new Set(values)].slice(0, limit);
}

function normalizeRelationship(input = {}, defaultType = "other") {
  const evidenceType = EVIDENCE_TYPES.has(input.evidenceType) ? input.evidenceType : "knowledge-base-inference";
  return {
    entityType: clean(input.entityType || defaultType, 80),
    entityId: clean(input.entityId || input.avatarId || input.id, 360),
    label: clean(input.label || input.avatarName || input.name || input.id, 800),
    relationship: clean(input.relationship || input.role, 360),
    evidenceType,
    explanation: cleanMultiline(input.explanation || input.evidence, 3_000),
    confidence: score(input.confidence),
  };
}

function normalizeReference(input = {}) {
  if (!input) return null;
  const type = REFERENCE_TYPES.has(input.type) ? input.type : "other";
  const reference = {
    type,
    id: clean(input.id || input.referenceId, 360),
    label: clean(input.label || input.title || input.name || input.id, 800),
    uri: clean(input.uri || input.url, 2_000),
    evidenceType: EVIDENCE_TYPES.has(input.evidenceType) ? input.evidenceType : "knowledge-base-inference",
    explanation: cleanMultiline(input.explanation || input.evidence || input.notes, 3_000),
    confidence: score(input.confidence),
  };
  return reference.id || reference.label || reference.uri ? reference : null;
}

function normalizeKnowledgeComparisons(input = []) {
  return (Array.isArray(input) ? input : []).slice(0, 120).map((item) => ({
    sourcePath: clean(item.sourcePath || item.source, 4_500),
    entityId: clean(item.entityId || item.id, 360),
    entityLabel: clean(item.entityLabel || item.label, 800),
    relationship: clean(item.relationship || item.relevance, 360),
    explanation: cleanMultiline(item.explanation, 3_000),
    confidence: score(item.confidence),
  })).filter((item) => item.sourcePath && item.explanation);
}

function normalizeHumanDecision(input = null) {
  if (!input || typeof input !== "object") return null;
  return {
    action: clean(input.action, 80),
    actorId: clean(input.actorId, 180),
    notes: cleanMultiline(input.notes, 4_000),
    decidedAt: clean(input.decidedAt, 80) || null,
    resultingEnrichmentRevision: input.resultingEnrichmentRevision == null ? null : Math.max(1, Math.trunc(number(input.resultingEnrichmentRevision, 1))),
  };
}

function normalizeIdentity(input = {}) {
  return {
    recordId: clean(input.recordId, 360),
    assetId: clean(input.assetId, 360),
    contentFingerprint: clean(input.contentFingerprint, 360),
    uri: clean(input.uri, 2_000),
    sourcePath: clean(input.sourcePath, 4_000),
  };
}

function normalizeSha256(value) {
  const text = clean(value, 80).toLowerCase().replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(text) ? `sha256:${text}` : "";
}

function uniqueStrings(input, limit, maxLength) {
  return [...new Set((Array.isArray(input) ? input : String(input || "").split(/[,\n]+/)).map((value) => clean(value, maxLength)).filter(Boolean))].slice(0, limit);
}

function score(value) { return Math.max(0, Math.min(1, number(value, 0))); }
function number(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(value, max) { return String(value || "").replace(/\0/g, "").trim().slice(0, max); }
function cleanMultiline(value, max) { return String(value || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max); }

function reviewError(code, message, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
