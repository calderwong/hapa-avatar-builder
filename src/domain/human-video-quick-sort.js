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
    aliases: uniqueAliases([videoKey, ...(input.aliases || fallback.aliases || [])]),
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
  const requestedState = clean(input.state || input.action, 80).toLowerCase();
  if (current && current.state === requestedState) return { store, decision: current, changed: false };
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
    changed: true,
  };
}

export function migrateHumanVideoQuickSortStoreToVideos(storeInput = {}, videos = [], options = {}) {
  const store = normalizeHumanVideoQuickSortStore(storeInput);
  const byAlias = new Map();
  for (const video of videos) {
    for (const alias of [video.humanVideoKey, ...(video.humanVideoAliases || [])].filter(Boolean)) byAlias.set(alias, video);
  }
  const grouped = new Map();
  const unresolved = [];
  let remapped = 0;
  for (const decision of store.decisions) {
    const video = [decision.videoKey, ...(decision.aliases || [])].map((alias) => byAlias.get(alias)).find(Boolean) || null;
    const canonicalKey = video?.humanVideoKey || decision.videoKey;
    if (!video) unresolved.push(decision.videoKey);
    if (canonicalKey !== decision.videoKey) remapped += 1;
    const candidate = normalizeHumanVideoQuickSortDecision({
      ...decision,
      id: `${canonicalKey}:quick-sort`,
      videoKey: canonicalKey,
      videoId: video?.id || decision.videoId,
      videoName: video?.name || decision.videoName,
      aliases: [decision.videoKey, ...(decision.aliases || []), ...(video?.humanVideoAliases || [])],
    });
    const bucket = grouped.get(canonicalKey) || [];
    bucket.push(candidate);
    grouped.set(canonicalKey, bucket);
  }
  const conflicts = [];
  const decisions = [...grouped.entries()].map(([videoKey, candidates]) => {
    const ordered = [...candidates].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || b.revision - a.revision);
    const selected = ordered[0];
    const states = [...new Set(candidates.map((candidate) => candidate.state))];
    if (states.length > 1) conflicts.push({ videoKey, states, selectedState: selected.state, decisionIds: candidates.map((candidate) => candidate.id) });
    return normalizeHumanVideoQuickSortDecision({
      ...selected,
      id: `${videoKey}:quick-sort`,
      videoKey,
      aliases: candidates.flatMap((candidate) => [candidate.videoKey, ...(candidate.aliases || [])]),
      revision: Math.max(...candidates.map((candidate) => candidate.revision)),
      createdAt: candidates.map((candidate) => candidate.createdAt).filter(Boolean).sort()[0] || selected.createdAt,
    });
  });
  const now = options.now || new Date().toISOString();
  return {
    store: normalizeHumanVideoQuickSortStore({ ...store, decisions, updatedAt: remapped || decisions.length !== store.decisions.length ? now : store.updatedAt }),
    report: {
      schemaVersion: "hapa.human-video-quick-sort-identity-migration.v1",
      generatedAt: now,
      beforeDecisions: store.decisions.length,
      afterDecisions: decisions.length,
      remapped,
      collapsed: store.decisions.length - decisions.length,
      conflicts,
      unresolved,
    },
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
function uniqueAliases(values = []) { return [...new Set(values.map((value) => clean(value, 5_000)).filter(Boolean))].slice(0, 64); }
