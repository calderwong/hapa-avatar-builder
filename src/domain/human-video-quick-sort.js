export const HUMAN_VIDEO_QUICK_SORT_STORE_SCHEMA = "hapa.human-video-quick-sort-store.v1";
export const HUMAN_VIDEO_QUICK_SORT_DECISION_SCHEMA = "hapa.human-video-quick-sort-decision.v1";
export const HUMAN_VIDEO_QUICK_SORT_EVENT_SCHEMA = "hapa.human-video-quick-sort-event.v1";

const DECISION_STATES = new Set(["accepted", "rejected"]);

export function createHumanVideoQuickSortStore(input = {}) {
  return normalizeHumanVideoQuickSortStore({
    schemaVersion: HUMAN_VIDEO_QUICK_SORT_STORE_SCHEMA,
    decisions: input.decisions || [],
    updatedAt: input.updatedAt || null,
  });
}

export function normalizeHumanVideoQuickSortStore(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw quickSortError("quick_sort_store_root_invalid", "The Quick Sort store must be an object.", 500);
  if (input.schemaVersion !== HUMAN_VIDEO_QUICK_SORT_STORE_SCHEMA) throw quickSortError("quick_sort_store_schema_invalid", `The Quick Sort store must declare ${HUMAN_VIDEO_QUICK_SORT_STORE_SCHEMA}.`, 500);
  if (!Array.isArray(input.decisions)) throw quickSortError("quick_sort_store_decisions_invalid", "The Quick Sort decisions collection must be an array.", 500);
  const byVideo = new Map();
  for (const candidate of input.decisions) {
    const decision = normalizeHumanVideoQuickSortDecision(candidate);
    if (byVideo.has(decision.videoKey)) throw quickSortError("quick_sort_store_duplicate_video", `More than one Quick Sort decision identifies ${decision.videoKey}.`, 500);
    byVideo.set(decision.videoKey, decision);
  }
  const decisions = [...byVideo.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.videoKey.localeCompare(b.videoKey));
  return {
    schemaVersion: HUMAN_VIDEO_QUICK_SORT_STORE_SCHEMA,
    decisions,
    updatedAt: clean(input.updatedAt, 80) || decisions.map((decision) => decision.updatedAt).filter(Boolean).sort().at(-1) || null,
    truthBoundary: "Human Quick Sort records media triage only. It does not establish canon, ownership, rights clearance, optical accuracy, publication approval, or render authority.",
  };
}

export function normalizeHumanVideoQuickSortDecision(input = {}, fallback = {}) {
  const videoKey = clean(input.videoKey || input.key || fallback.videoKey, 4_500);
  if (!videoKey) throw quickSortError("quick_sort_video_key_required", "A Quick Sort decision requires one stable video key.");
  const state = clean(input.state || input.action || fallback.state, 80).toLowerCase();
  if (!DECISION_STATES.has(state)) throw quickSortError("quick_sort_state_invalid", "Choose accepted or rejected.");
  const revision = Math.max(1, Math.trunc(number(input.revision ?? fallback.revision, 1)));
  const updatedAt = clean(input.updatedAt || input.decidedAt || fallback.updatedAt, 80) || null;
  return {
    schemaVersion: HUMAN_VIDEO_QUICK_SORT_DECISION_SCHEMA,
    id: clean(input.id || fallback.id || `${videoKey}:quick-sort`, 5_000),
    videoKey,
    videoId: clean(input.videoId || fallback.videoId, 360),
    videoName: clean(input.videoName || fallback.videoName, 800),
    state,
    notes: clean(input.notes || fallback.notes, 2_000),
    actorId: clean(input.actorId || fallback.actorId || "local-human-operator", 180),
    origin: clean(input.origin || fallback.origin || "human-enricher-quick-sort", 180),
    revision,
    createdAt: clean(input.createdAt || fallback.createdAt, 80) || updatedAt,
    updatedAt,
  };
}

export function upsertHumanVideoQuickSortDecision(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoQuickSortStore(storeInput);
  const videoKey = clean(input.videoKey || input.key, 4_500);
  if (!videoKey) throw quickSortError("quick_sort_video_key_required", "Select one known video before recording a Quick Sort decision.");
  const current = store.decisions.find((decision) => decision.videoKey === videoKey) || null;
  if (input.expectedRevision !== undefined && Number(input.expectedRevision) !== Number(current?.revision || 0)) {
    throw quickSortError("quick_sort_revision_conflict", "This Quick Sort decision changed in another view. Reload before deciding again.", 409, { currentRevision: Number(current?.revision || 0) });
  }
  const now = options.now || new Date().toISOString();
  const decision = normalizeHumanVideoQuickSortDecision({
    ...(current || {}),
    ...input,
    videoKey,
    actorId: options.actorId || input.actorId || current?.actorId || "local-human-operator",
    revision: Number(current?.revision || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  });
  return {
    store: normalizeHumanVideoQuickSortStore({ ...store, decisions: [...store.decisions.filter((item) => item.videoKey !== videoKey), decision], updatedAt: now }),
    decision,
  };
}

function quickSortError(code, message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function clean(value, limit = 1_000) { return String(value || "").trim().slice(0, limit); }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
