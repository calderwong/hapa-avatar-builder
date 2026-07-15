import { contextHash } from "./song-context-packet.js";
import {
  collectEmbeddedSongCardSnapshots,
  compactSongCardConstituentSnapshot,
} from "./song-card-constituents.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";

export const SONG_CARD_HEAD_SCHEMA = "hapa.song-card.v2";
export const SONG_CARD_EDITION_SCHEMA = "hapa.song-card.edition.v1";
export const SONG_CARD_MINT_SNAPSHOT_SCHEMA = "hapa.song-card.mint-snapshot.v1";
export const SONG_CARD_APPEARANCE_INDEX_SCHEMA = "hapa.song-card.appearance-index.v1";
export const SONG_CARD_PUBLIC_MANIFEST_SCHEMA = "hapa.song-card.public-manifest.v1";
export const SONG_CARD_PRIVATE_MANIFEST_SCHEMA = "hapa.song-card.private-manifest.v1";
export const SONG_CARD_PRINTED_CARD_SCHEMA = "hapa.song-card.printed-card.v1";
export const SONG_CARD_MINT_TELEMETRY_SCHEMA = "hapa.song-card.mint-telemetry.v1";
export const SONG_CARD_SNAPSHOT_REGISTRY_SCHEMA = "hapa.song-card.constituent-snapshot-registry.v1";
export const SONG_CARD_APPEARANCE_SNAPSHOT_CATALOG_SCHEMA = "hapa.song-card.appearance-snapshot-catalog.v1";

const NON_MATERIAL_KEYS = new Set([
  "updatedAt", "updated_at", "createdAt", "created_at", "lastOpenedAt", "lastPlayedAt",
  "currentTime", "current_time", "playbackTelemetry", "telemetry", "hovered", "selected",
  "uiState", "ui_state", "notice", "progress", "requestId", "correlationId", "reused", "cacheHit", "cached",
]);
const PRIVATE_PATH_KEYS = new Set(["localPath", "sourcePath", "storagePath", "absolutePath", "cwd"]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function isPrivateLocalReference(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  let decoded = text;
  for (let pass = 0; pass < 16; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  const normalized = decoded.replace(/\\/gu, "/");
  if (/(?:^|[^A-Za-z0-9_])(?:filesystem:)?file:/iu.test(normalized)) return true;
  if (/%(?:25|2e|2f|5c|3a)/iu.test(normalized)) return true;
  if (/(?:^|\/)\.{1,2}(?:\/|$|[?#])/u.test(normalized)) return true;
  const embeddedLocal = (input) => /(?:^|[\s"'([{=,:;?&#])(?:\/(?!\/)|\/\/|[A-Za-z]:\/|~[^/\s]*\/)/u.test(input);
  if (/^(?:https?|wss?):\/\//iu.test(normalized)) {
    const suffixIndex = normalized.search(/[?#]/u);
    return suffixIndex >= 0 && embeddedLocal(normalized.slice(suffixIndex));
  }
  const publicRootRelative = /^\/(?:api|media|static)(?:\/|$)/u.test(normalized);
  if (publicRootRelative) {
    const suffixIndex = normalized.search(/[?#]/u);
    const privateSuffix = suffixIndex >= 0 && embeddedLocal(normalized.slice(suffixIndex));
    return privateSuffix;
  }
  return /^\//u.test(normalized)
    || /^[A-Za-z]:/u.test(normalized)
    || /^~(?:$|[^/]*\/)/u.test(normalized)
    || embeddedLocal(normalized);
}

export function canonicalMintValue(value, { portable = false } = {}) {
  if (Array.isArray(value)) return value.map((item) => canonicalMintValue(item, { portable })).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return isPrivateLocalReference(value) ? undefined : value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
    if (isPrivateLocalReference(key)) return [];
    if (NON_MATERIAL_KEYS.has(key)) return [];
    const item = value[key];
    if (PRIVATE_PATH_KEYS.has(key) && isPrivateLocalReference(item)) return [];
    if (typeof item === "string" && isPrivateLocalReference(item)) return [];
    const normalized = canonicalMintValue(item, { portable });
    return normalized === undefined ? [] : [[key, normalized]];
  }));
}

export function stableMintStringify(value) {
  return JSON.stringify(canonicalMintValue(value));
}

function defaultHash(value) {
  return `hapa-hash:${contextHash(canonicalMintValue(value))}`;
}

function digest(value, hashFn = defaultHash) {
  // The hash provider owns canonicalization. The default provider and the controller's
  // stableMintStringify provider both canonicalize once; pre-normalizing here doubled
  // the largest allocation in planning without changing the resulting digest.
  const result = hashFn(value);
  return String(result).includes(":") ? String(result) : `sha256:${result}`;
}

function snapshotCollectionEntries(value = {}) {
  if (value?.schemaVersion === SONG_CARD_SNAPSHOT_REGISTRY_SCHEMA) {
    const snapshots = value.snapshots || {};
    return Object.entries(value.references || {}).flatMap(([reference, snapshotDigest]) => {
      const snapshot = snapshots[snapshotDigest];
      return snapshot ? [[reference, snapshot]] : [];
    });
  }
  if (Array.isArray(value)) return value.flatMap((snapshot, index) => snapshot && typeof snapshot === "object" ? [[snapshot.id || snapshot.cardId || String(index), snapshot]] : []);
  return Object.entries(value || {}).filter(([, snapshot]) => snapshot && typeof snapshot === "object");
}

function compactSnapshotCollection(value = {}) {
  return Object.fromEntries(snapshotCollectionEntries(value).flatMap(([reference, snapshot]) => {
    const compact = compactSongCardConstituentSnapshot(snapshot, { id: reference });
    return compact ? [[reference, compact]] : [];
  }));
}

function looksLikeConstituentSnapshot(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = String(value.schemaVersion || value.cardType || "").toLowerCase();
  return Boolean((value.id || value.cardId) && /(avatar|scene|item|tarot|visualizer)-?(?:card)?/u.test(schema));
}

const EMBEDDED_SNAPSHOT_KEYS = new Set([
  "cardsnapshot", "mediacardsnapshot", "media_card_snapshot", "card_snapshot",
]);

function compactMintStructure(value, parentKey = "", currentKey = "") {
  if (Array.isArray(value)) return value.map((item) => compactMintStructure(item, currentKey, ""));
  if (!value || typeof value !== "object") return value;
  const normalizedCurrent = String(currentKey || "").replace(/[^A-Za-z]/gu, "").toLowerCase();
  const normalizedParent = String(parentKey || "").replace(/[^A-Za-z]/gu, "").toLowerCase();
  if (EMBEDDED_SNAPSHOT_KEYS.has(currentKey) || EMBEDDED_SNAPSHOT_KEYS.has(normalizedCurrent)
    || (normalizedCurrent === "card" && ["visualization", "media"].includes(normalizedParent))
    || looksLikeConstituentSnapshot(value)) {
    return compactSongCardConstituentSnapshot(value) || {};
  }
  if (["cardsnapshots", "card_snapshots"].includes(currentKey) || normalizedCurrent === "cardsnapshots") {
    return compactSnapshotCollection(value);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactMintStructure(item, currentKey, key)]));
}

export function buildSongCardSnapshotRegistry(cardSnapshots = {}, hashFn = defaultHash) {
  const snapshots = {};
  const references = {};
  for (const [reference, source] of snapshotCollectionEntries(cardSnapshots)) {
    const snapshot = compactSongCardConstituentSnapshot(source, { id: reference });
    if (!snapshot) continue;
    const snapshotDigest = digest(snapshot, hashFn);
    if (!snapshots[snapshotDigest]) snapshots[snapshotDigest] = snapshot;
    references[String(reference)] = snapshotDigest;
    const sourceId = String(snapshot.id || snapshot.cardId || "").trim();
    if (sourceId && !references[sourceId]) references[sourceId] = snapshotDigest;
  }
  return canonicalMintValue({ schemaVersion: SONG_CARD_SNAPSHOT_REGISTRY_SCHEMA, snapshots, references });
}

function idText(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
}

function graphCards(showGraph = {}) {
  return (showGraph.tracks || []).flatMap((track, trackIndex) => (track.cards || []).map((card, layerIndex) => ({ track, card, trackIndex, layerIndex })));
}

function graphFamilyProjection(showGraph = {}, family) {
  const rows = graphCards(showGraph);
  if (family === "videos") return rows.map(({ track, card }) => ({ trackId: track.id, id: card.id, startSeconds: card.startSeconds, endSeconds: card.endSeconds, knockedOut: card.knockedOut, media: card.media, transition: card.transition }));
  if (family === "timing") return rows.map(({ track, card }) => ({ trackId: track.id, id: card.id, startSeconds: card.startSeconds, endSeconds: card.endSeconds, transition: card.transition }));
  if (family === "cards") return rows.map(({ track, card }) => ({ trackId: track.id, id: card.id, sourceId: card.visualization?.card?.id || card.visualization?.sourceId || card.media?.cardId || card.media?.id, provenance: card.provenance }));
  if (family === "ivf") return rows.filter(({ card }) => card.visualization).map(({ track, card }) => ({ trackId: track.id, id: card.id, visualization: card.visualization, parameters: card.parameters }));
  return [];
}

export function buildSongCardMintSnapshot({ song = {}, project = {}, showGraph = {}, render = {}, registry = {}, cardSnapshots = {}, rights = {}, approvals = {}, rendererTruth = {} } = {}) {
  const compactProject = compactMintStructure(project);
  const compactGraph = compactMintStructure(showGraph);
  const suppliedSnapshots = compactSnapshotCollection(cardSnapshots);
  const embeddedSnapshots = collectEmbeddedSongCardSnapshots({
    project: compactProject,
    showGraph: compactGraph,
    cardSnapshots: suppliedSnapshots,
  });
  const graph = canonicalMintValue(compactGraph);
  const editor = canonicalMintValue(compactProject);
  const outputProfile = resolveEchoOutputProfile(
    graph.outputProfile || graph.output_profile || editor.output_profile || editor.outputProfile,
  );
  const normalizedCards = buildSongCardSnapshotRegistry({ ...embeddedSnapshots, ...suppliedSnapshots });
  const families = {
    videos: graphFamilyProjection(graph, "videos"),
    timing: graphFamilyProjection(graph, "timing"),
    cards: [graphFamilyProjection(graph, "cards"), normalizedCards],
    ivf: graphFamilyProjection(graph, "ivf"),
    stems: [graph.stems || null, graph.directorV2?.stemBuses || [], editor.stems_available || editor.stems || []],
    camera: [graph.directorV2?.cameraKeyframes || [], graphCards(graph).map(({ card }) => ({ id: card.id, cameraKeyframes: card.cameraKeyframes, motion: card.parameters?.motion, cameraIntensity: card.parameters?.cameraIntensity }))],
    lyrics: [graph.song?.lyricOverlay || null, editor.timed_lyrics || editor.lyricTimings || [], editor.lyric_variant, editor.lyric_position, editor.lyric_style],
    attribution: [song.authorship || song.attribution || null, rights],
    renderer: [render, rendererTruth, graph.directorV2?.rendererSupport || null, outputProfile],
    direction: [graph.directorV2?.visualTimeTrack || null, graph.directorV2?.accentTrack || null, graph.directorV2?.effects || [], graph.directorV2?.modulation || null],
  };
  return canonicalMintValue({
    schemaVersion: SONG_CARD_MINT_SNAPSHOT_SCHEMA,
    song: { id: song.id || song.songId || project.song_id || showGraph.song?.id || "", songId: song.songId || project.song_id || showGraph.song?.id || song.id || "", title: song.title || project.song_title || showGraph.song?.title || "", albumId: song.albumId || project.album_id || "" },
    editor,
    showGraph: graph,
    render,
    outputProfile,
    registry,
    cardSnapshots: normalizedCards,
    rights,
    approvals,
    rendererTruth,
    families,
  });
}

export function mintFamilyHashes(snapshot = {}, hashFn = defaultHash) {
  return Object.fromEntries(Object.entries(snapshot.families || {}).map(([family, value]) => [family, digest(value, hashFn)]));
}

export function fingerprintSongCardMintSnapshot(snapshot = {}, hashFn = defaultHash) {
  return digest(snapshot, hashFn);
}

function changedCardIntervals(before = {}, after = {}, changedFamilies = []) {
  if (!changedFamilies.some((family) => ["videos", "timing", "cards", "ivf"].includes(family))) return [];
  const beforeRows = new Map(graphCards(before.showGraph || {}).map(({ track, card }) => [`${track.id}:${card.id}`, card]));
  const afterRows = new Map(graphCards(after.showGraph || {}).map(({ track, card }) => [`${track.id}:${card.id}`, card]));
  const beforeAppearances = compileSongCardAppearanceIndex({ showGraph: before.showGraph || {}, cardSnapshots: before.cardSnapshots || {}, durationSeconds: before.showGraph?.song?.durationSeconds || before.editor?.duration || 0 }).appearances;
  const afterAppearances = compileSongCardAppearanceIndex({ showGraph: after.showGraph || {}, cardSnapshots: after.cardSnapshots || {}, durationSeconds: after.showGraph?.song?.durationSeconds || after.editor?.duration || 0 }).appearances;
  const keys = new Set([...beforeRows.keys(), ...afterRows.keys()]);
  return [...keys].flatMap((key) => {
    const left = beforeRows.get(key);
    const right = afterRows.get(key);
    if (stableMintStringify(left) === stableMintStringify(right)) return [];
    const [trackId, ...cueParts] = key.split(":");
    const cueId = cueParts.join(":");
    const start = Math.max(0, Math.min(Number(left?.startSeconds ?? right?.startSeconds ?? 0), Number(right?.startSeconds ?? left?.startSeconds ?? 0)));
    const end = Math.max(Number(left?.endSeconds || 0), Number(right?.endSeconds || 0), start + 0.001);
    const changedAssetIds = [...new Set([
      left?.media?.cardId, left?.media?.id, left?.media?.contentHash, left?.visualization?.sourceId, left?.visualization?.card?.id,
      right?.media?.cardId, right?.media?.id, right?.media?.contentHash, right?.visualization?.sourceId, right?.visualization?.card?.id,
    ].filter(Boolean).map(String))];
    const affectedAppearanceIds = [...new Set([...beforeAppearances, ...afterAppearances]
      .filter((row) => row.trackId === trackId && row.cueId === cueId)
      .map((row) => row.appearanceId))];
    return [{ startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), cardKey: key, trackId, cueId, changedAssetIds, affectedAppearanceIds, reason: "material-card-change" }];
  });
}

function mergeRanges(ranges = []) {
  const sorted = ranges.filter((row) => row.endMs > row.startMs).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged = [];
  for (const row of sorted) {
    const prior = merged[merged.length - 1];
    if (prior && row.startMs <= prior.endMs) {
      prior.endMs = Math.max(prior.endMs, row.endMs);
      prior.reasons = [...new Set([...(prior.reasons || [prior.reason]), row.reason].filter(Boolean))];
      prior.changedAssetIds = [...new Set([...(prior.changedAssetIds || []), ...(row.changedAssetIds || [])])];
      prior.affectedAppearanceIds = [...new Set([...(prior.affectedAppearanceIds || []), ...(row.affectedAppearanceIds || [])])];
    } else merged.push({ ...row, reasons: [row.reason].filter(Boolean) });
  }
  return merged;
}

export function diffSongCardMintSnapshots(before = null, after = {}, hashFn = defaultHash) {
  const afterHashes = mintFamilyHashes(after, hashFn);
  const beforeHashes = before ? mintFamilyHashes(before, hashFn) : {};
  const changedFamilies = Object.keys(afterHashes).filter((family) => beforeHashes[family] !== afterHashes[family]);
  const durationMs = Math.round(Number(after.showGraph?.song?.durationSeconds || after.editor?.duration || 0) * 1000);
  let ranges = changedCardIntervals(before || {}, after, changedFamilies);
  if (changedFamilies.some((family) => ["stems", "camera", "lyrics", "attribution", "direction"].includes(family)) && durationMs > 0) ranges.push({ startMs: 0, endMs: durationMs, reason: "song-wide-material-change" });
  if (changedFamilies.includes("renderer") && ranges.length === 0 && durationMs > 0) ranges.push({ startMs: 0, endMs: durationMs, reason: "renderer-only-material-change" });
  ranges = mergeRanges(ranges);
  const afterAppearances = compileSongCardAppearanceIndex({ showGraph: after.showGraph || {}, cardSnapshots: after.cardSnapshots || {}, durationSeconds: after.showGraph?.song?.durationSeconds || after.editor?.duration || 0 }).appearances;
  if (ranges.some((row) => row.reason !== "material-card-change")) {
    for (const row of ranges) {
      if (row.reason !== "material-card-change") row.affectedAppearanceIds = afterAppearances.filter((appearance) => appearance.startMs < row.endMs && appearance.endMs > row.startMs).map((appearance) => appearance.appearanceId);
    }
  }
  const changed = !before || fingerprintSongCardMintSnapshot(before, hashFn) !== fingerprintSongCardMintSnapshot(after, hashFn);
  return {
    schemaVersion: "hapa.song-card.semantic-diff.v1",
    changed,
    summary: changed ? `Changed ${changedFamilies.join(", ") || "mint material"}.` : "Editor and selected render match the latest immutable edition.",
    changedFamilies,
    dirtyRanges: ranges,
    changedAssetIds: [...new Set(ranges.flatMap((row) => row.changedAssetIds || []))],
    affectedAppearanceIds: [...new Set(ranges.flatMap((row) => row.affectedAppearanceIds || []))],
    beforeFamilyHashes: beforeHashes,
    afterFamilyHashes: afterHashes,
    reusableWork: changedFamilies.includes("renderer") && changedFamilies.length === 1 ? ["editorial-treatment", "cue-graph", "semantic-ranking"] : changed ? ["unchanged-track-artifacts", "director-decision-envelope"] : ["entire-edition"],
    renderWork: ranges,
  };
}

function snapshotLookup(cardSnapshots = {}) {
  const lookup = new Map();
  for (const [reference, source] of snapshotCollectionEntries(cardSnapshots)) {
    const snapshot = compactSongCardConstituentSnapshot(source, { id: reference });
    if (!snapshot) continue;
    lookup.set(String(reference), snapshot);
    for (const identity of [snapshot.id, snapshot.cardId, snapshot.songCardSnapshot?.sourceId]) {
      if (identity && !lookup.has(String(identity))) lookup.set(String(identity), snapshot);
    }
  }
  return lookup;
}

function sourceSnapshotFor(card, track, snapshots) {
  const candidates = [card.visualization?.card?.id, card.visualization?.sourceId, card.media?.cardId, card.media?.id, card.id].filter(Boolean);
  const found = candidates.map((candidate) => snapshots.get(String(candidate))).find(Boolean);
  if (found) return { snapshot: canonicalMintValue(found, { portable: true }), sourceId: found.id || found.cardId || found.songCardSnapshot?.sourceId, sourceKind: found.schemaVersion || found.cardType || "card" };
  if (card.visualization?.card) {
    const snapshot = compactSongCardConstituentSnapshot(card.visualization.card, { id: card.visualization.card.id || card.visualization.sourceId, kind: "visualizer" });
    return { snapshot: canonicalMintValue(snapshot, { portable: true }), sourceId: card.visualization.card.id || card.visualization.sourceId, sourceKind: "visualizer-card" };
  }
  if (card.media) {
    const snapshot = compactSongCardConstituentSnapshot({ schemaVersion: "hapa.song-card.constituent-media.v1", id: card.media.cardId || card.media.id || card.id, title: card.media.cardTitle || card.media.title || card.media.id || "Media", media: card.media, track: { id: track.id, role: track.role }, provenance: card.provenance || {} }, { id: card.media.cardId || card.media.id || card.id, kind: card.media.cardKind || "media-card" });
    return { snapshot: canonicalMintValue(snapshot, { portable: true }), sourceId: card.media.cardId || card.media.id || card.id, sourceKind: card.media.cardKind || "media-card" };
  }
  return { snapshot: null, sourceId: card.id || "", sourceKind: "non-printable" };
}

export function compileSongCardAppearanceIndex({ showGraph = {}, cardSnapshots = {}, durationSeconds = null, hashFn = defaultHash } = {}) {
  const durationMs = Math.max(0, Math.round(Number(durationSeconds ?? showGraph.song?.durationSeconds ?? 0) * 1000));
  const snapshots = snapshotLookup(cardSnapshots);
  const snapshotCatalog = {};
  const appearances = graphCards(showGraph).flatMap(({ track, card, trackIndex, layerIndex }) => {
    if (card.knockedOut === true) return [];
    const startMs = Math.max(0, Math.round(Number(card.startSeconds || 0) * 1000));
    const endMs = Math.min(durationMs || Infinity, Math.round(Number(card.endSeconds || 0) * 1000));
    if (!(endMs > startMs)) return [];
    const source = sourceSnapshotFor(card, track, snapshots);
    const sourceDigest = source.snapshot ? digest(source.snapshot, hashFn) : null;
    if (sourceDigest && !snapshotCatalog[sourceDigest]) snapshotCatalog[sourceDigest] = source.snapshot;
    const base = { trackId: track.id || `track:${trackIndex}`, trackRole: track.role || "unknown", layerIndex, zOrder: Number(card.zOrder ?? card.parameters?.zOrder ?? track.zOrder ?? trackIndex * 100 + layerIndex), cueId: card.id || `cue:${trackIndex}:${layerIndex}`, shotId: card.provenance?.sourceSlotId || card.id || "", startMs, endMs, sourceCardId: source.sourceId, sourceCardKind: source.sourceKind, sourceCardRevision: card.provenance?.sourceRevision || source.snapshot?.revision || null, sourceDigest, snapshotRef: sourceDigest, printable: Boolean(source.snapshot), pureIvf: Boolean(card.visualization && !card.media?.id), provenance: canonicalMintValue({ ...(card.provenance || {}), visualizationSourceId: card.visualization?.sourceId || null }, { portable: true }) };
    return [{ ...base, appearanceId: `appearance:${digest(base, hashFn).replace(/^[^:]+:/, "").slice(0, 24)}` }];
  }).sort((a, b) => a.startMs - b.startMs || a.zOrder - b.zOrder || a.appearanceId.localeCompare(b.appearanceId));
  const boundaries = [...new Set([0, durationMs, ...appearances.flatMap((row) => [row.startMs, row.endMs])])].filter((value) => value >= 0 && value <= durationMs).sort((a, b) => a - b);
  const coverage = boundaries.slice(0, -1).map((startMs, index) => {
    const endMs = boundaries[index + 1];
    const active = appearances.filter((row) => row.startMs < endMs && row.endMs > startMs).sort((a, b) => a.zOrder - b.zOrder || a.appearanceId.localeCompare(b.appearanceId));
    return { startMs, endMs, appearanceIds: active.map((row) => row.appearanceId), truthStatus: active.length ? "covered" : "no-card" };
  });
  const base = {
    schemaVersion: SONG_CARD_APPEARANCE_INDEX_SCHEMA,
    durationMs,
    intervalRule: "half-open-[startMs,endMs)",
    orderingRule: "zOrder-then-appearanceId; highest printable is primary",
    snapshotCatalog: {
      schemaVersion: SONG_CARD_APPEARANCE_SNAPSHOT_CATALOG_SCHEMA,
      snapshots: snapshotCatalog,
    },
    appearances,
    coverage,
    gaps: coverage.filter((row) => row.truthStatus === "no-card"),
  };
  return { ...base, indexDigest: digest(base, hashFn) };
}

export function querySongCardAppearances(index = {}, timeMs = 0) {
  const timestampMs = Math.max(0, Math.round(Number(timeMs) || 0));
  const catalog = {};
  for (const [snapshotDigest, snapshot] of Object.entries(index.snapshotCatalog?.snapshots || index.snapshots || {})) catalog[snapshotDigest] = snapshot;
  for (const row of index.appearances || []) {
    for (const [snapshotDigest, snapshot] of Object.entries(row.snapshotCatalog?.snapshots || {})) {
      if (!catalog[snapshotDigest]) catalog[snapshotDigest] = snapshot;
    }
    const embedded = row.snapshot && typeof row.snapshot === "object" && Object.keys(row.snapshot).length
      ? row.snapshot
      : row.sourceSnapshot && typeof row.sourceSnapshot === "object" && Object.keys(row.sourceSnapshot).length
        ? row.sourceSnapshot
        : null;
    if (embedded && (row.snapshotRef || row.sourceDigest)) catalog[row.snapshotRef || row.sourceDigest] = embedded;
  }
  const active = (index.appearances || []).filter((row) => row.startMs <= timestampMs && row.endMs > timestampMs).map((row) => {
    const { snapshotCatalog: _catalog, ...appearance } = row;
    const embedded = row.snapshot && typeof row.snapshot === "object" && Object.keys(row.snapshot).length
      ? row.snapshot
      : row.sourceSnapshot && typeof row.sourceSnapshot === "object" && Object.keys(row.sourceSnapshot).length
        ? row.sourceSnapshot
        : null;
    const snapshot = embedded || catalog[row.snapshotRef || row.sourceDigest] || null;
    const printable = row.printable === undefined ? Boolean(snapshot) : row.printable === true && Boolean(snapshot);
    return { ...appearance, snapshot, sourceSnapshot: snapshot || {}, printable };
  }).sort((a, b) => a.zOrder - b.zOrder || a.appearanceId.localeCompare(b.appearanceId));
  const printable = active.filter((row) => row.printable && row.snapshot);
  return { schemaVersion: "hapa.song-card.cards-at-time.v1", timestampMs, intervalRule: index.intervalRule || "half-open-[startMs,endMs)", truthStatus: timestampMs >= Number(index.durationMs || Infinity) ? "end-of-media" : active.length ? printable.length ? "printable" : "non-printable" : "no-card", primary: printable[printable.length - 1] || null, active };
}

export function buildSongCardHead({ songId, title = "", albumId = "", latestEdition = 0, generation = latestEdition, latestEditionId = "", semanticFingerprint = "", editions = [], migrationReceipts = [] } = {}) {
  const stableSongId = idText(songId);
  if (!stableSongId) throw new Error("songId is required");
  return { schemaVersion: SONG_CARD_HEAD_SCHEMA, id: `song-card:${stableSongId}`, kind: "song", songId: stableSongId, title, albumId, latestEdition: Number(latestEdition || 0), generation: Number(generation || 0), latestEditionId, semanticFingerprint, editionIds: editions.map((row) => typeof row === "string" ? row : row.id).filter(Boolean), migrationReceipts: clone(migrationReceipts) };
}

export function buildSongCardEdition({ head, edition, snapshot, semanticFingerprint, artifacts = [], appearanceIndex, parentEditionId = null, lineage = {}, telemetryRef = null, approvals = {}, rights = {}, publishStatus = "private-demo", mintedAt = new Date().toISOString() } = {}) {
  const number = Math.max(1, Number(edition || 1));
  const id = `${head.id}:edition:${number}`;
  return { schemaVersion: SONG_CARD_EDITION_SCHEMA, id, headId: head.id, songId: head.songId, edition: number, parentEditionId, supersedes: parentEditionId, immutable: true, semanticFingerprint, snapshot: clone(snapshot), editorRevision: snapshot?.editor?.revision || snapshot?.editor?.directorV2?.source?.sourceProjectHash || snapshot?.showGraph?.directorV2?.source?.sourceProjectHash || null, treatmentId: snapshot?.showGraph?.directorV2?.treatmentId || null, variantId: snapshot?.showGraph?.directorV2?.variantId || null, variantHash: snapshot?.showGraph?.directorV2?.variantHash || null, showGraphHash: digest(snapshot?.showGraph || {}), releaseHash: artifacts.find((row) => row.role === "release-manifest")?.sha256 || null, artifacts: clone(artifacts), appearanceIndex: clone(appearanceIndex), approvals: clone(approvals), rights: clone(rights), lineage: canonicalMintValue({ ...lineage, edges: lineage.edges || [] }, { portable: true }), telemetryRef, publishStatus, mintedAt };
}

function containsPrivatePath(value) {
  if (typeof value === "string") return isPrivateLocalReference(value);
  if (Array.isArray(value)) return value.some(containsPrivatePath);
  return Boolean(value && typeof value === "object" && Object.entries(value).some(([key, item]) => isPrivateLocalReference(key) || containsPrivatePath(item)));
}

function lineageHasCycle(edges = []) {
  const next = new Map();
  for (const edge of edges) next.set(edge.from, [...(next.get(edge.from) || []), edge.to]);
  const active = new Set(); const done = new Set();
  function visit(node) { if (active.has(node)) return true; if (done.has(node)) return false; active.add(node); if ((next.get(node) || []).some(visit)) return true; active.delete(node); done.add(node); return false; }
  return [...next.keys()].some(visit);
}

export function validateSongCardEdition(edition = {}, { publicManifest = null } = {}) {
  const errors = [];
  if (edition.schemaVersion !== SONG_CARD_EDITION_SCHEMA) errors.push("invalid-edition-schema");
  if (!edition.headId || !edition.id?.startsWith(`${edition.headId}:edition:`)) errors.push("edition-head-identity-mismatch");
  if (!(Number(edition.edition) > 0)) errors.push("invalid-edition-number");
  if (!edition.semanticFingerprint) errors.push("missing-semantic-fingerprint");
  if (!edition.appearanceIndex?.indexDigest) errors.push("missing-appearance-index");
  if ((edition.appearanceIndex?.appearances || []).some((row) => !(row.endMs > row.startMs))) errors.push("invalid-appearance-interval");
  if (lineageHasCycle(edition.lineage?.edges || [])) errors.push("lineage-cycle");
  if (publicManifest && containsPrivatePath(publicManifest)) errors.push("public-manifest-private-path");
  return { schemaVersion: "hapa.song-card.edition-validation.v1", ok: errors.length === 0, errors };
}

export function buildSongCardPublicManifest({ head, edition, files = {}, lineage = null } = {}) {
  return canonicalMintValue({ schemaVersion: SONG_CARD_PUBLIC_MANIFEST_SCHEMA, head: { schemaVersion: head.schemaVersion, id: head.id, songId: head.songId, title: head.title, latestEdition: edition.edition }, edition: { ...edition, snapshot: undefined, appearanceIndex: undefined }, files, appearanceIndex: { path: files.appearanceIndex?.path || "data/card-appearance-index.json", digest: edition.appearanceIndex?.indexDigest }, lineage: lineage || edition.lineage }, { portable: true });
}

export function buildSongCardPrivateManifest({ head, edition, custody = {}, sources = {} } = {}) {
  return { schemaVersion: SONG_CARD_PRIVATE_MANIFEST_SCHEMA, headId: head.id, editionId: edition.id, custody: clone(custody), sources: clone(sources) };
}

export function createPrintedSongCard({ head, edition, appearance, timestampMs, activeAppearances = [], printedAt = new Date().toISOString() } = {}) {
  if (!appearance?.snapshot) throw new Error("A historical appearance snapshot is required");
  return { ...clone(appearance.snapshot), songCardPrint: { schemaVersion: SONG_CARD_PRINTED_CARD_SCHEMA, headId: head.id, songId: head.songId, editionId: edition.id, edition: edition.edition, renderHash: edition.artifacts?.find((row) => row.role === "master")?.sha256 || null, timestampMs: Math.round(Number(timestampMs) || 0), appearanceId: appearance.appearanceId, cueId: appearance.cueId, trackId: appearance.trackId, sourceCardId: appearance.sourceCardId, sourceDigest: appearance.sourceDigest, activeAppearanceIds: activeAppearances.map((row) => row.appearanceId), provenance: clone(appearance.provenance), printedAt } };
}

export function migrateLegacySongCard(input = {}, { songId = input.songId || input.song?.id || input.id, title = input.title || input.song?.title || "" } = {}) {
  const from = input.schemaVersion || input.cardType || "unknown";
  const video = input.artifacts?.video || input.video || input.releaseManifest?.video || "";
  const head = buildSongCardHead({ songId: String(songId || "legacy-song").replace(/^song-card[:-]/, ""), title, migrationReceipts: [{ schemaVersion: "hapa.song-card.migration-receipt.v1", from, status: video ? "compatibility-child-pending-verification" : "head-only-no-rendered-edition", reason: video ? "legacy rendered artifact requires mint preflight" : "legacy card has no rendered video custody" }] });
  return { head, edition: null, acceptedAsMintedEdition: false };
}
