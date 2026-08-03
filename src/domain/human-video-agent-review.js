export const HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA = "hapa.human-video-agent-review-store.v1";
export const HUMAN_VIDEO_AGENT_REVIEW_SCHEMA = "hapa.human-video-agent-review.v1";
export const HUMAN_VIDEO_AGENT_REVIEW_EVENT_SCHEMA = "hapa.human-video-agent-review-event.v1";

const REVIEW_STATUSES = new Set(["pending-human", "accepted", "accepted-edited", "rejected", "blocked"]);
const EVIDENCE_TYPES = new Set(["visual-observation", "knowledge-base-inference", "source-relationship"]);
const REFERENCE_TYPES = new Set(["echo-song", "song", "card", "scene", "avatar", "url", "other"]);

export function createHumanVideoAgentReviewStore(input = {}) {
  return normalizeHumanVideoAgentReviewStore({
    schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA,
    reviews: input.reviews || [],
    updatedAt: input.updatedAt || null,
  });
}

export function normalizeHumanVideoAgentReviewStore(input = {}) {
  const byVideo = new Map();
  for (const candidate of Array.isArray(input.reviews) ? input.reviews : []) {
    try {
      const review = normalizeHumanVideoAgentReview(candidate);
      const current = byVideo.get(review.videoKey);
      if (!current || review.revision > current.revision || String(review.updatedAt || "") > String(current.updatedAt || "")) byVideo.set(review.videoKey, review);
    } catch {
      // Invalid local proposals never enter the human review surface.
    }
  }
  const reviews = [...byVideo.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.videoKey.localeCompare(b.videoKey));
  return {
    schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA,
    reviews,
    updatedAt: clean(input.updatedAt, 80) || reviews.map((review) => review.updatedAt).filter(Boolean).sort().at(-1) || null,
    truthBoundary: "Vision-sub-agent proposals are evidence-backed drafts, not human validation, identity truth, canon, rights clearance, publication approval, or render authority.",
  };
}

export function normalizeHumanVideoAgentReview(input = {}, fallback = {}) {
  const videoKey = clean(input.videoKey || input.key || fallback.videoKey, 4_500);
  if (!videoKey) throw reviewError("agent_review_video_key_required", "An optical review must name one stable Human Enricher video key.");
  const status = REVIEW_STATUSES.has(input.status) ? input.status : REVIEW_STATUSES.has(fallback.status) ? fallback.status : "pending-human";
  const revision = Math.max(1, Math.trunc(number(input.revision ?? fallback.revision, 1)));
  const reviewer = normalizeReviewer(input.reviewer || fallback.reviewer);
  const frames = normalizeFrames(input.evidence?.frames || input.frames || fallback.evidence?.frames || fallback.frames);
  const requiredFrameCount = Math.max(3, Math.trunc(number(input.evidence?.requiredFrameCount ?? fallback.evidence?.requiredFrameCount, frames.length || 3)));
  if (status !== "blocked") {
    if (reviewer.opticalInspectionConfirmed !== true) throw reviewError("optical_inspection_attestation_required", "A completed agent review must attest that the reviewer inspected every listed frame with optical visibility.");
    if (frames.length < 3) throw reviewError("optical_frame_evidence_insufficient", "A completed agent review requires at least three inspected keyframes.");
    if (new Set(frames.map((frame) => frame.sha256)).size < 3) throw reviewError("optical_frame_evidence_not_distinct", "A completed agent review requires three distinct frame hashes.");
    if (frames.length < requiredFrameCount) throw reviewError("registered_frame_coverage_incomplete", `The review addressed ${frames.length} of ${requiredFrameCount} required registered frames.`);
  }
  const now = clean(input.updatedAt || fallback.updatedAt, 80) || null;
  const proposal = normalizeProposal(input.proposal || fallback.proposal);
  if (status !== "blocked" && (!proposal.description || !proposal.quality.explanation)) {
    throw reviewError("agent_review_diagnosis_required", "A completed optical review requires a visual description and an explained quality grade.");
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
  if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== Number(current?.revision || 0)) {
    throw reviewError("agent_review_revision_conflict", "This optical review changed while the agent was working. Reclaim and inspect the current frames.", 409, {
      expectedRevision: Number(input.expectedRevision),
      currentRevision: Number(current?.revision || 0),
    });
  }
  const now = options.now || new Date().toISOString();
  const review = normalizeHumanVideoAgentReview({
    ...(current || {}),
    ...input,
    videoKey,
    reviewer: { ...(current?.reviewer || {}), ...(input.reviewer || {}), agentId: options.agentId || input.reviewer?.agentId || current?.reviewer?.agentId },
    revision: Number(current?.revision || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  });
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
    reviewMode: "vision-subagent-optical",
    opticalInspectionConfirmed: input.opticalInspectionConfirmed === true,
    attestation: cleanMultiline(input.attestation, 2_000),
  };
}

function normalizeFrames(input = []) {
  return (Array.isArray(input) ? input : []).slice(0, 24).map((frame, index) => {
    const sha256 = normalizeSha256(frame.sha256 || frame.imageSha256);
    const observation = cleanMultiline(frame.observation || frame.visualObservation, 4_000);
    if (!sha256) throw reviewError("optical_frame_hash_required", `Inspected frame ${index + 1} is missing a SHA-256 digest.`);
    if (!observation) throw reviewError("optical_frame_observation_required", `Inspected frame ${index + 1} is missing its own visual observation.`);
    return {
      ordinal: index + 1,
      timestampSeconds: Math.max(0, number(frame.timestampSeconds ?? frame.timestamp, 0)),
      normalizedPosition: Math.max(0, Math.min(1, number(frame.normalizedPosition, index / Math.max(1, input.length - 1)))),
      imagePath: clean(frame.imagePath || frame.path, 4_500),
      imageUri: clean(frame.imageUri || frame.uri, 4_500),
      sha256,
      observation,
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
    avatarRelationships: (Array.isArray(input.avatarRelationships) ? input.avatarRelationships : []).slice(0, 80).map((item) => normalizeRelationship(item, "avatar")),
    references: (Array.isArray(input.references) ? input.references : []).slice(0, 120).map(normalizeReference).filter(Boolean),
    directorNotes: cleanMultiline(input.directorNotes, 12_000),
    strengths: uniqueStrings(input.strengths, 60, 1_000),
    issues: uniqueStrings(input.issues, 60, 1_000),
    uncertainty: cleanMultiline(input.uncertainty, 4_000),
    confidence: score(input.confidence),
  };
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
