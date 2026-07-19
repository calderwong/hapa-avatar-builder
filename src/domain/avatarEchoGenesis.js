import {
  normalizeEchoSemanticTraversal,
  normalizeSongContextLayers,
  normalizeSongReferenceCatalog,
  normalizeSongReferenceConnectors,
  normalizeSongReferenceGraphEdges
} from "./song-reference-graph.js";

export const ECHO_ALBUM_LINEAGE_SCHEMA = "hapa.echo-album-lineage.v1";
export const ECHO_REFERENCE_MIND_CONTEXT_SCHEMA = "hapa.avatar-echo-reference-context.v1";
export const ECHO_SONG_CHOICE_SCHEMA = "hapa.avatar-echo-song-choice.v1";
export const ECHO_REFERENCE_SNAPSHOT_SCHEMA = "hapa.avatar-echo-reference-snapshot.v1";

const DEFAULT_SOURCE_ALBUM = {
  id: "dear-papa-album",
  title: "Dear Papa"
};

const DEFAULT_ECHO_PROJECTION = {
  id: "echo-album",
  title: "Echo Album",
  kind: "later-music-visualizer-projection"
};

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueText(values = []) {
  const seen = new Set();
  return list(values).map(String).map((value) => value.trim()).filter((value) => {
    if (!value) return false;
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeProjection(value = {}, fallback = DEFAULT_ECHO_PROJECTION) {
  const source = value && typeof value === "object" ? value : {};
  return {
    id: text(source.id, fallback.id),
    title: text(source.title, fallback.title),
    kind: text(source.kind, fallback.kind),
    sourcePath: text(source.sourcePath || source.source_path),
    status: text(source.status, "active")
  };
}

export function normalizeEchoAlbumLineage(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const sourceAlbum = normalizeProjection(source.sourceAlbum || source.source_album, {
    ...DEFAULT_SOURCE_ALBUM,
    kind: "source-album"
  });
  const activeProjection = normalizeProjection(source.activeProjection || source.active_projection);
  return {
    schemaVersion: text(source.schemaVersion || source.schema_version, ECHO_ALBUM_LINEAGE_SCHEMA),
    canonicalWorkId: text(source.canonicalWorkId || source.canonical_work_id, "echo-dear-papa-song-lineage"),
    sourceAlbum,
    activeProjection,
    aliases: uniqueText([
      sourceAlbum.title,
      activeProjection.title,
      ...(source.aliases || [])
    ]),
    relationship: text(
      source.relationship,
      "Echo Album is a later music-visualizer projection of the substantially same song corpus; album-title changes do not fork song identity."
    ),
    identityRule: text(
      source.identityRule || source.identity_rule,
      "Resolve a song by stable song/card IDs and lyrics SHA-256 before album title."
    ),
    status: text(source.status, "operator-confirmed-lineage")
  };
}

export function createEchoAlbumLineageFromSongStore(store = {}, overrides = {}) {
  const album = store?.album || {};
  return normalizeEchoAlbumLineage({
    ...overrides,
    sourceAlbum: {
      id: album.id || DEFAULT_SOURCE_ALBUM.id,
      title: album.title || DEFAULT_SOURCE_ALBUM.title,
      kind: "source-album",
      sourcePath: album.sourcePath || ""
    },
    activeProjection: overrides.activeProjection || album.activeProjection || DEFAULT_ECHO_PROJECTION,
    aliases: [
      ...(album.aliases || []),
      ...(overrides.aliases || []),
      album.title || DEFAULT_SOURCE_ALBUM.title,
      DEFAULT_ECHO_PROJECTION.title
    ]
  });
}

export function normalizeEchoSemanticPrimitives(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    themes: uniqueText(source.themes || []),
    mechanics: uniqueText(source.mechanics || []),
    traversalTerms: uniqueText(source.traversalTerms || source.traversal_terms || []),
    emotionalVectors: uniqueText(source.emotionalVectors || source.emotional_vectors || []),
    expositionFunctions: uniqueText(source.expositionFunctions || source.exposition_functions || [])
  };
}

export function normalizeEchoReferenceSnapshot(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    schemaVersion: text(source.schemaVersion || source.schema_version, ECHO_REFERENCE_SNAPSHOT_SCHEMA),
    graphHash: text(source.graphHash || source.graph_hash),
    sourceStoreUpdatedAt: text(source.sourceStoreUpdatedAt || source.source_store_updated_at),
    connectorIds: uniqueText(source.connectorIds || source.connector_ids || []),
    contextLayerIds: uniqueText(source.contextLayerIds || source.context_layer_ids || []),
    referenceIds: uniqueText(source.referenceIds || source.reference_ids || []),
    graphEdgeIds: uniqueText(source.graphEdgeIds || source.graph_edge_ids || []),
    reviewStatus: text(source.reviewStatus || source.review_status, "assistant-analyzed-pending-human-review")
  };
}

export function normalizeEchoReferenceMindContext(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    schemaVersion: text(source.schemaVersion || source.schema_version, ECHO_REFERENCE_MIND_CONTEXT_SCHEMA),
    albumLineage: normalizeEchoAlbumLineage(source.albumLineage || source.album_lineage),
    graphHash: text(source.graphHash || source.graph_hash),
    sourceStorePath: text(source.sourceStorePath || source.source_store_path, "data/hapa-songs-store.json"),
    sourceStoreSchemaVersion: text(source.sourceStoreSchemaVersion || source.source_store_schema_version),
    sourceStoreUpdatedAt: text(source.sourceStoreUpdatedAt || source.source_store_updated_at),
    catalogCount: Math.max(0, Number(source.catalogCount ?? source.catalog_count ?? 0)),
    edgeCount: Math.max(0, Number(source.edgeCount ?? source.edge_count ?? 0)),
    connectorCount: Math.max(0, Number(source.connectorCount ?? source.connector_count ?? 0)),
    semanticTraversal: normalizeEchoSemanticTraversal(source.semanticTraversal || source.semantic_traversal),
    ingestionRunId: text(source.ingestionRunId || source.ingestion_run_id),
    reviewStatus: text(source.reviewStatus || source.review_status, "assistant-analyzed-pending-human-review"),
    canonRule: text(
      source.canonRule || source.canon_rule,
      "Reference connectors expand interpretation but do not promote an external work, personal association, or lyric inference into hard Avatar biography."
    ),
    status: text(source.status, "active"),
    updatedAt: text(source.updatedAt || source.updated_at)
  };
}

export function createEchoReferenceMindContextFromSongStore(store = {}, options = {}) {
  const songs = list(store.songs);
  return normalizeEchoReferenceMindContext({
    albumLineage: createEchoAlbumLineageFromSongStore(store, options.albumLineage || {}),
    graphHash: options.graphHash,
    sourceStorePath: options.sourceStorePath || "data/hapa-songs-store.json",
    sourceStoreSchemaVersion: store.schemaVersion,
    sourceStoreUpdatedAt: store.updatedAt,
    catalogCount: list(store.referenceCatalog).length,
    edgeCount: list(store.referenceGraphEdges).length,
    connectorCount: songs.reduce((sum, song) => sum + list(song.referenceConnectors).length, 0),
    semanticTraversal: store.semanticTraversal,
    ingestionRunId: options.ingestionRunId,
    reviewStatus: store.semanticTraversal?.reviewStatus,
    updatedAt: options.updatedAt
  });
}

function referenceSnapshot(reference = {}) {
  return {
    id: text(reference.id),
    title: text(reference.title),
    kind: text(reference.kind),
    franchise: text(reference.franchise),
    themes: uniqueText(reference.themes || []),
    mechanics: uniqueText(reference.mechanics || []),
    traversalTerms: uniqueText(reference.traversalTerms || []),
    canonStatus: text(reference.canonStatus),
    reviewStatus: text(reference.reviewStatus)
  };
}

export function hydrateEchoSongChoice(choice = {}, song = {}, store = {}, options = {}) {
  const connectors = normalizeSongReferenceConnectors(song.referenceConnectors || []);
  const contextualLayers = normalizeSongContextLayers(song.contextualLayers || []);
  const referenceIds = new Set(connectors.map((connector) => connector.referenceId));
  const catalog = normalizeSongReferenceCatalog(store.referenceCatalog || [])
    .filter((reference) => referenceIds.has(reference.id));
  const graphEdges = normalizeSongReferenceGraphEdges(store.referenceGraphEdges || [])
    .filter((edge) => referenceIds.has(edge.fromReferenceId) || referenceIds.has(edge.toReferenceId));
  const lineage = createEchoAlbumLineageFromSongStore(store, options.albumLineage || {});
  const semanticPrimitives = normalizeEchoSemanticPrimitives({
    themes: catalog.flatMap((reference) => reference.themes || []),
    mechanics: catalog.flatMap((reference) => reference.mechanics || []),
    traversalTerms: catalog.flatMap((reference) => reference.traversalTerms || []),
    emotionalVectors: [song.lore?.mood, song.lore?.relationshipLens].filter(Boolean),
    expositionFunctions: connectors.map((connector) => connector.semanticEffect?.expositionFunction).filter(Boolean)
  });
  const lyricsSha256 = text(song.lyrics?.sha256 || choice.lyricsSha256 || choice.lyrics_sha256);
  return {
    ...choice,
    schemaVersion: ECHO_SONG_CHOICE_SCHEMA,
    songId: text(song.songId || choice.songId || choice.song_id || song.id),
    cardId: text(song.cardId || choice.cardId || choice.card_id || song.id),
    title: text(song.title || choice.title, "Untitled Echo song"),
    albumId: text(choice.albumId || choice.album_id || song.albumId || lineage.sourceAlbum.id),
    albumTitle: text(choice.albumTitle || choice.album_title || song.albumTitle || lineage.sourceAlbum.title),
    albumAliases: lineage.aliases,
    albumLineage: lineage,
    activeAlbumProjection: lineage.activeProjection,
    lineageKey: lyricsSha256 ? `lyrics-sha256:${lyricsSha256}` : `song-id:${text(song.songId || song.id)}`,
    author: text(choice.author || song.author, "Calder"),
    perspective: choice.perspective || song.performancePerspective || {},
    lyricsSha256,
    sourcePath: text(choice.sourcePath || choice.source_path, options.sourceStorePath || "data/hapa-songs-store.json"),
    referenceConnectors: connectors,
    contextualLayers,
    referenceSnapshots: catalog.map(referenceSnapshot),
    semanticPrimitives,
    referenceGraphSnapshot: normalizeEchoReferenceSnapshot({
      graphHash: options.graphHash,
      sourceStoreUpdatedAt: store.updatedAt,
      connectorIds: connectors.map((connector) => connector.id),
      contextLayerIds: contextualLayers.map((layer) => layer.id),
      referenceIds: catalog.map((reference) => reference.id),
      graphEdgeIds: graphEdges.map((edge) => edge.id),
      reviewStatus: store.semanticTraversal?.reviewStatus
    })
  };
}

export function echoSongIndex(store = {}) {
  const index = new Map();
  for (const song of list(store.songs)) {
    for (const key of [song.id, song.songId, song.cardId, song.lyrics?.sha256].filter(Boolean)) {
      index.set(String(key), song);
    }
  }
  return index;
}

export function resolveEchoSongChoice(choice = {}, index = new Map()) {
  for (const key of [choice.songId, choice.song_id, choice.cardId, choice.card_id, choice.id, choice.lyricsSha256, choice.lyrics_sha256].filter(Boolean)) {
    const song = index.get(String(key));
    if (song) return song;
  }
  return null;
}
