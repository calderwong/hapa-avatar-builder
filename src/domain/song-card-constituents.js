function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value || "").trim();
}

export const SONG_CARD_CONSTITUENT_SNAPSHOT_SCHEMA = "hapa.song-card.constituent-snapshot.v2";

const PRINTABLE_ROOT_KEYS = [
  "schemaVersion", "id", "cardId", "cardType", "kind", "type", "primaryName", "title", "name",
  "names", "aliases", "status", "canonStatus", "summary", "description", "lore",
  "three_paragraph_background_narrative", "tags", "rank", "quality", "revision", "version",
  "characterSheet", "attribution", "authorship", "rights", "provenance", "hapaMergeProvenance",
  "sourceRefs", "connections", "locationState", "utility", "broadGameMechanics", "aesthetic",
  "promptPack", "tarotCard", "media", "thumbnail", "poster", "coverImage", "image", "videoUri", "videoSources",
];
const AUTHORING_ONLY_KEYS = new Set([
  "assets", "asset", "mind", "memory", "memories", "activity", "history", "slots", "mediaslots",
  "mediaassets", "telemetry", "operatornotes", "containedcards", "equipment",
]);
const PRINTABLE_SNAPSHOT_BUDGET = 48 * 1024;
const PRINTABLE_VALUE_DEPTH = 5;
const PRINTABLE_ARRAY_LIMIT = 48;
const PRINTABLE_OBJECT_KEY_LIMIT = 64;

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function boundedPrintableValue(value, state, depth = 0) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    state.remaining -= 16;
    return state.remaining >= 0 ? value : undefined;
  }
  if (typeof value === "string") {
    if (state.remaining <= 0) return undefined;
    const limit = Math.min(8192, state.remaining);
    const result = value.slice(0, limit);
    state.remaining -= result.length + 2;
    if (result.length < value.length) state.truncated = true;
    return result;
  }
  if (depth >= PRINTABLE_VALUE_DEPTH || state.remaining <= 0) {
    state.truncated = true;
    return undefined;
  }
  if (Array.isArray(value)) {
    const result = [];
    if (value.length > PRINTABLE_ARRAY_LIMIT) state.truncated = true;
    for (const item of value.slice(0, PRINTABLE_ARRAY_LIMIT)) {
      const projected = boundedPrintableValue(item, state, depth + 1);
      if (projected !== undefined) result.push(projected);
      if (state.remaining <= 0) break;
    }
    return result;
  }
  if (!value || typeof value !== "object") return undefined;
  const result = {};
  const entries = Object.entries(value)
    .filter(([key]) => !AUTHORING_ONLY_KEYS.has(normalizedKey(key)))
    .slice(0, PRINTABLE_OBJECT_KEY_LIMIT);
  if (Object.keys(value).length > entries.length) state.truncated = true;
  for (const [key, item] of entries) {
    state.remaining -= key.length + 4;
    const projected = boundedPrintableValue(item, state, depth + 1);
    if (projected !== undefined) result[key] = projected;
    if (state.remaining <= 0) break;
  }
  return result;
}

export function compactSongCardConstituentSnapshot(snapshot = {}, fallback = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const priorProjection = snapshot.songCardSnapshot?.schemaVersion === SONG_CARD_CONSTITUENT_SNAPSHOT_SCHEMA
    ? snapshot.songCardSnapshot
    : {};
  const state = { remaining: PRINTABLE_SNAPSHOT_BUDGET, truncated: false };
  const projected = {};
  for (const key of PRINTABLE_ROOT_KEYS) {
    if (snapshot[key] === undefined || AUTHORING_ONLY_KEYS.has(normalizedKey(key))) continue;
    state.remaining -= key.length + 4;
    const value = boundedPrintableValue(snapshot[key], state, 0);
    if (value !== undefined) projected[key] = value;
    if (state.remaining <= 0) break;
  }
  const sourceId = snapshotIdentity(snapshot, priorProjection.sourceId || fallback.id);
  if (!projected.id && sourceId) projected.id = sourceId;
  if (!projected.title && fallback.title) projected.title = text(fallback.title);
  if (!projected.kind && fallback.kind) projected.kind = normalizedKind(fallback.kind);
  const omittedFamilies = [...(Array.isArray(priorProjection.omittedFamilies) ? priorProjection.omittedFamilies : []), ...Object.keys(snapshot)
    .filter((key) => AUTHORING_ONLY_KEYS.has(normalizedKey(key)))
    .map(normalizedKey)]
    .filter((key, index, values) => values.indexOf(key) === index)
    .sort();
  projected.songCardSnapshot = {
    schemaVersion: SONG_CARD_CONSTITUENT_SNAPSHOT_SCHEMA,
    projection: "compact-printable-card",
    sourceId,
    sourceKind: normalizedKind(fallback.kind || priorProjection.sourceKind || snapshot.kind || snapshot.cardType || snapshot.schemaVersion),
    sourceSchemaVersion: text(priorProjection.sourceSchemaVersion || snapshot.schemaVersion),
    sourceRef: text(fallback.ref || priorProjection.sourceRef),
    omittedFamilies,
    truncated: priorProjection.truncated === true || state.truncated,
  };
  return projected;
}

function normalizedKind(value) {
  const kind = text(value).toLowerCase();
  if (kind.includes("avatar")) return "avatar";
  if (kind.includes("scene")) return "scene";
  if (kind.includes("item") || kind.includes("card")) return "item";
  return "";
}

function snapshotIdentity(snapshot = {}, fallback = "") {
  return text(snapshot.id || snapshot.cardId || fallback);
}

function isSyntheticMediaFallback(snapshot = {}) {
  return snapshot?.schemaVersion === "hapa.song-card.constituent-media.v1";
}

function addSnapshots(target, value) {
  if (Array.isArray(value)) {
    for (const snapshot of value) {
      const id = snapshotIdentity(snapshot);
      if (id && !target[id]) target[id] = compactSongCardConstituentSnapshot(snapshot, { id });
    }
    return;
  }
  for (const [key, snapshot] of Object.entries(object(value))) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const id = snapshotIdentity(snapshot, key);
    if (!id || target[id]) continue;
    target[id] = compactSongCardConstituentSnapshot(snapshot, { id });
  }
}

function cardMetadata(value = {}, fallback = {}) {
  const sourceCard = value?.decision_evidence?.sourceEvidence?.card
    || value?.decisionEvidence?.sourceEvidence?.card
    || value?.sourceEvidence?.card
    || {};
  return {
    id: text(value.cardId || value.card_id || value.media_card_id || sourceCard.id || fallback.id),
    kind: normalizedKind(value.cardKind || value.card_kind || value.media_card_kind || sourceCard.kind || fallback.kind),
    ref: text(value.cardRef || value.card_ref || value.media_card_ref || sourceCard.ref || fallback.ref),
    title: text(value.cardTitle || value.card_title || value.media_card_title || sourceCard.title || fallback.title),
  };
}

function graphCards(showGraph = {}) {
  return list(showGraph.tracks).flatMap((track) => list(track.cards));
}

function effectiveGraphs(project = {}, showGraph = {}) {
  const candidates = [showGraph, project.director_show_graph, project.directorShowGraph];
  const seen = new Set();
  return candidates.filter((graph) => {
    if (!graph || typeof graph !== "object" || !Array.isArray(graph.tracks) || seen.has(graph)) return false;
    seen.add(graph);
    return true;
  });
}

export function collectEmbeddedSongCardSnapshots({ project = {}, showGraph = {}, cardSnapshots = {} } = {}) {
  const snapshots = {};
  for (const value of [
    cardSnapshots,
    project.cardSnapshots,
    project.card_snapshots,
    showGraph.cardSnapshots,
    showGraph.card_snapshots,
  ]) addSnapshots(snapshots, value);

  for (const graph of effectiveGraphs(project, showGraph)) {
    for (const card of graphCards(graph)) {
      for (const snapshot of [
        card.visualization?.card,
        card.media?.card,
        card.media?.cardSnapshot,
        card.media?.card_snapshot,
        card.cardSnapshot,
        card.card_snapshot,
      ]) addSnapshots(snapshots, snapshot ? [snapshot] : []);
    }
  }
  for (const shot of list(project.timeline)) {
    for (const snapshot of [shot.media_card_snapshot, shot.mediaCardSnapshot, shot.card_snapshot, shot.cardSnapshot]) {
      addSnapshots(snapshots, snapshot ? [snapshot] : []);
    }
  }
  return snapshots;
}

export function collectSongCardConstituentReferences({ project = {}, showGraph = {} } = {}) {
  const references = [];
  for (const graph of effectiveGraphs(project, showGraph)) {
    for (const card of graphCards(graph)) {
      const reference = cardMetadata(card.media || {});
      if (reference.id) references.push(reference);
    }
  }
  for (const shot of list(project.timeline)) {
    const reference = cardMetadata(shot, {
      id: shot.media_card_id,
      title: shot.media_title,
    });
    if (reference.id) references.push(reference);
  }
  const unique = new Map();
  for (const reference of references) {
    const key = `${reference.kind}:${reference.id}:${reference.ref}`;
    if (!unique.has(key)) unique.set(key, reference);
  }
  return [...unique.values()];
}

function decoded(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function referenceTarget(ref = "") {
  const match = /#(cards|scenes|avatars)\/(.+)$/u.exec(text(ref));
  if (!match) return null;
  return {
    kind: match[1] === "cards" ? "item" : match[1] === "scenes" ? "scene" : "avatar",
    id: decoded(match[2]),
  };
}

function storeIndex(rows = []) {
  return new Map(list(rows).flatMap((row) => {
    const id = snapshotIdentity(row);
    return id ? [[id, row]] : [];
  }));
}

export function hydrateSongCardConstituentSnapshots({
  project = {},
  showGraph = {},
  cardSnapshots = {},
  itemStore = {},
  sceneStore = {},
  avatarStore = {},
} = {}) {
  const snapshots = collectEmbeddedSongCardSnapshots({ project, showGraph, cardSnapshots });
  const suppliedIds = new Set(Object.keys(snapshots));
  const indexes = {
    item: storeIndex(itemStore.cards),
    scene: storeIndex(sceneStore.scenes),
    avatar: storeIndex(avatarStore.avatars),
  };
  const references = collectSongCardConstituentReferences({ project, showGraph });
  const hydrated = [];
  const unresolved = [];

  for (const reference of references) {
    const existing = snapshots[reference.id];
    if (existing && !isSyntheticMediaFallback(existing)) continue;
    const target = referenceTarget(reference.ref);
    const kind = target?.kind || reference.kind;
    const id = target?.id || reference.id;
    let snapshot = kind ? indexes[kind]?.get(id) || indexes[kind]?.get(reference.id) : null;
    if (!snapshot) {
      const matches = Object.entries(indexes)
        .map(([candidateKind, index]) => ({ kind: candidateKind, snapshot: index.get(reference.id) }))
        .filter((entry) => entry.snapshot);
      if (matches.length === 1) snapshot = matches[0].snapshot;
    }
    if (!snapshot) {
      unresolved.push(reference);
      continue;
    }
    snapshots[reference.id] = compactSongCardConstituentSnapshot(snapshot, reference);
    hydrated.push({ id: reference.id, kind: kind || normalizedKind(snapshot.schemaVersion || snapshot.kind), ref: reference.ref, replacedSyntheticFallback: Boolean(existing) });
  }

  return {
    cardSnapshots: snapshots,
    receipt: {
      schemaVersion: "hapa.song-card.constituent-hydration-receipt.v1",
      requestedCount: references.length,
      suppliedCount: suppliedIds.size,
      hydratedCount: hydrated.length,
      unresolvedCount: unresolved.length,
      hydrated,
      unresolved,
    },
  };
}
