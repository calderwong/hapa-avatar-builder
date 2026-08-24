// Human Video Likeness Decisions (Avatar Likeness Assignment, layer L4).
//
// The matcher's verdicts are PROPOSALS, not truth. This module is the
// durable human gate: one decision per known video, same family shape as
// the Quick Sort decision ledger (states, aliases, optimistic revision,
// actor attribution, append-only event receipts) with one difference —
// the decision carries the full score receipt so the Director (layer L5)
// can consume a verifiable placement instead of re-inferring identity.
//
// `origin: "avatar-likeness"` marks the family member; the Quick Sort
// ledger itself is never written by this path (media triage and likeness
// placement are separate authority surfaces).

export const HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA = "hapa.human-video-likeness-decisions-store.v1";
export const HUMAN_VIDEO_LIKENESS_DECISION_SCHEMA = "hapa.human-video-likeness-decision.v1";
export const HUMAN_VIDEO_LIKENESS_DECISION_EVENT_SCHEMA = "hapa.human-video-likeness-decision-event.v1";

const DECISION_STATES = new Set(["accepted", "rejected"]);
const LIKENESS_ORIGIN = "avatar-likeness";

export function createHumanVideoLikenessDecisionsStore(input = {}) {
  return normalizeHumanVideoLikenessDecisionsStore({
    schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA,
    decisions: input.decisions || [],
    updatedAt: input.updatedAt || null,
  });
}

export function normalizeHumanVideoLikenessDecisionsStore(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw likenessDecisionError("likeness_decisions_store_root_invalid", "The likeness decisions store must be an object.", 500);
  if (input.schemaVersion !== HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA) throw likenessDecisionError("likeness_decisions_store_schema_invalid", `The likeness decisions store must declare ${HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA}.`, 500);
  if (!Array.isArray(input.decisions)) throw likenessDecisionError("likeness_decisions_store_decisions_invalid", "The likeness decisions collection must be an array.", 500);
  const byVideo = new Map();
  for (const candidate of input.decisions) {
    const decision = normalizeHumanVideoLikenessDecision(candidate);
    if (byVideo.has(decision.videoKey)) throw likenessDecisionError("likeness_decisions_store_duplicate_video", `More than one likeness decision identifies ${decision.videoKey}.`, 500);
    byVideo.set(decision.videoKey, decision);
  }
  const decisions = [...byVideo.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.videoKey.localeCompare(b.videoKey));
  return {
    schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA,
    decisions,
    updatedAt: clean(input.updatedAt, 80) || decisions.map((decision) => decision.updatedAt).filter(Boolean).sort().at(-1) || null,
    truthBoundary: "Human likeness decisions record human-confirmed Avatar placement for media that passed the enricher. They establish cast attribution for the Director only; they do not establish canon, ownership, rights clearance, optical accuracy, or identity.",
  };
}

export function normalizeHumanVideoLikenessDecision(input = {}, fallback = {}) {
  const videoKey = clean(input.videoKey || input.key || fallback.videoKey, 4_500);
  if (!videoKey) throw likenessDecisionError("likeness_decision_video_key_required", "A likeness decision requires one stable video key.");
  const state = clean(input.state || input.action || fallback.state, 80).toLowerCase();
  if (!DECISION_STATES.has(state)) throw likenessDecisionError("likeness_decision_state_invalid", "Choose accepted or rejected.");
  const revision = Math.max(1, Math.trunc(number(input.revision ?? fallback.revision, 1)));
  const updatedAt = clean(input.updatedAt || input.decidedAt || fallback.updatedAt, 80) || null;
  return {
    schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_SCHEMA,
    id: clean(input.id || fallback.id || `${videoKey}:avatar-likeness`, 5_000),
    videoKey,
    videoId: clean(input.videoId || fallback.videoId, 360),
    videoName: clean(input.videoName || fallback.videoName, 800),
    aliases: uniqueAliases([videoKey, ...(input.aliases || fallback.aliases || [])]),
    state,
    origin: LIKENESS_ORIGIN,
    // The Avatar the human actually confirmed. On an edited acceptance this
    // differs from the proposal's primary; on rejection it records what the
    // proposal's best candidate was (for audit, not placement).
    decisionAvatarId: clean(input.decisionAvatarId || fallback.decisionAvatarId, 180),
    decisionAvatarName: clean(input.decisionAvatarName || fallback.decisionAvatarName, 240),
    receipt: normalizeReceipt(input.receipt ?? fallback.receipt),
    notes: clean(input.notes || fallback.notes, 2_000),
    actorId: clean(input.actorId || fallback.actorId || "local-human-operator", 180),
    revision,
    createdAt: clean(input.createdAt || fallback.createdAt, 80) || updatedAt,
    updatedAt,
  };
}

/** Bounded copy of the matcher verdict receipt that anchors the decision. */
export function normalizeReceipt(receipt = null) {
  if (!receipt || typeof receipt !== "object") return null;
  const candidate = (entry = null, rank = 0) => entry && typeof entry === "object" ? {
    rank,
    avatarId: clean(entry.avatarId, 180),
    name: clean(entry.name, 240),
    score: Number(number(entry.score, 0)).toFixed(4),
    channels: {
      palette: entry.channels?.palette == null ? null : Number(number(entry.channels.palette, 0)).toFixed(4),
      dHash: entry.channels?.dHash == null ? null : Number(number(entry.channels.dHash, 0)).toFixed(4),
      text: entry.channels?.text == null ? null : Number(number(entry.channels.text, 0)).toFixed(4),
      colorWords: entry.channels?.colorWords == null ? null : Number(number(entry.channels.colorWords, 0)).toFixed(4),
    },
  } : null;
  return {
    schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_SCHEMA,
    runId: clean(receipt.runId, 160),
    verdict: clean(receipt.verdict, 40),
    reasons: (Array.isArray(receipt.reasons) ? receipt.reasons : []).map((value) => clean(value, 80)).filter(Boolean).slice(0, 8),
    gate: receipt.gate && typeof receipt.gate === "object"
      ? { assignedScore: number(receipt.gate.assignedScore, 0), assignedMargin: number(receipt.gate.assignedMargin, 0), secondaryScore: number(receipt.gate.secondaryScore, 0) }
      : null,
    weights: receipt.weights && typeof receipt.weights === "object"
      ? { palette: number(receipt.weights.palette, 0), dHash: number(receipt.weights.dHash, 0), text: number(receipt.weights.text, 0), colorWords: number(receipt.weights.colorWords, 0) }
      : null,
    contentFingerprint: clean(receipt.contentFingerprint, 80),
    staleSignature: Boolean(receipt.staleSignature),
    primary: candidate(receipt.primary, 1),
    secondary: candidate(receipt.secondary, 2),
    candidates: (Array.isArray(receipt.candidates) ? receipt.candidates : []).slice(0, 5).map((entry, index) => candidate(entry, index + 1)).filter(Boolean),
    excludedProfileless: Math.max(0, Math.trunc(number(receipt.excludedProfileless, 0))),
    matchedAt: clean(receipt.matchedAt, 80) || null,
  };
}

export function upsertHumanVideoLikenessDecision(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoLikenessDecisionsStore(storeInput);
  const videoKey = clean(input.videoKey || input.key, 4_500);
  if (!videoKey) throw likenessDecisionError("likeness_decision_video_key_required", "Select one known video before recording a likeness decision.");
  const current = store.decisions.find((decision) => decision.videoKey === videoKey) || null;
  if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== Number(current?.revision || 0)) {
    throw likenessDecisionError("likeness_decision_revision_conflict", "This likeness decision changed in another view. Reload before deciding again.", 409, { currentRevision: Number(current?.revision || 0) });
  }
  const requestedState = clean(input.state || input.action, 80).toLowerCase();
  const requestedAvatar = clean(input.decisionAvatarId, 180);
  if (current && current.state === requestedState && clean(current.decisionAvatarId, 180) === requestedAvatar) {
    return { store, decision: current, changed: false };
  }
  const now = options.now || new Date().toISOString();
  const decision = normalizeHumanVideoLikenessDecision({
    ...(current || {}),
    ...input,
    videoKey,
    actorId: options.actorId || input.actorId || current?.actorId || "local-human-operator",
    revision: Number(current?.revision || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  });
  return {
    store: normalizeHumanVideoLikenessDecisionsStore({ ...store, decisions: [...store.decisions.filter((item) => item.videoKey !== videoKey), decision], updatedAt: now }),
    decision,
    changed: true,
  };
}

/** Lane filter helpers — the browser and the API share one vocabulary. */
export const HUMAN_VIDEO_LIKENESS_LANE_STATES = Object.freeze({
  all: "all",
  proposed: "proposed",
  assigned: "assigned",
  accepted: "accepted",
  rejected: "rejected",
});

/**
 * `proposed` = a verdict exists and the human has not decided yet (the
 * actionable queue); `assigned` = the matcher's verdict assigned and still
 * undecided; accepted/rejected follow the decision; `all` = any verdict.
 */
export function humanVideoLikenessLaneState(video = {}) {
  const decision = video.likenessDecision || null;
  const verdict = video.likenessVerdict || null;
  if (!verdict) return "unknown";
  if (decision?.state === "accepted") return "accepted";
  if (decision?.state === "rejected") return "rejected";
  if (verdict.verdict === "assigned") return "assigned";
  return "proposed";
}

export function matchesHumanVideoLikenessLaneFilter(video = {}, filter = "all") {
  const normalized = String(filter || "all").trim().toLowerCase();
  const state = humanVideoLikenessLaneState(video);
  if (normalized === "all") return state !== "unknown";
  if (normalized === "proposed") return state === "assigned" || state === "proposed";
  return state === normalized;
}

/** Videos with a durable likeness decision (the human-confirmed set). */
export function isHumanVideoLikenessDecided(video = {}) {
  return ["accepted", "rejected"].includes(video.likenessDecision?.state);
}

export function likenessDecisionError(code, message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function clean(value, limit = 1_000) { return String(value || "").trim().slice(0, limit); }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function uniqueAliases(values = []) { return [...new Set(values.map((value) => clean(value, 5_000)).filter(Boolean))].slice(0, 64); }
