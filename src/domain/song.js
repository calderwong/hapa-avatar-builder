import { inferAssetKind, slugify } from "./avatar.js";

export const HAPA_SONG_STORE_VERSION = "hapa.songs.store.v1";
export const HAPA_SONG_CARD_VERSION = "hapa.song-card.v1";
export const HAPA_SONG_COMMENT_VERSION = "hapa.song-comment.v1";
export const HAPA_SONG_MEDIA_VERSION = "hapa.song-media-link.v1";
export const HAPA_SONG_VISUALIZER_LINK_VERSION = "hapa.song-visualizer-link.v1";
export const HAPA_SONG_MINT_PROJECTION_VERSION = "hapa.song-card.mint-projection.v1";

export const DEAR_PAPA_ALBUM_ID = "dear-papa-album";
export const DEAR_PAPA_ALBUM_TITLE = "Dear Papa";

export const HAPA_SONG_VISUALIZER_CATALOG = [
  {
    id: "builtin:spectrum-nebula",
    label: "Spectrum Nebula",
    family: "built-in",
    role: "audio-reactive-scene",
    category: "hyperspace",
    description: "FFT-driven nebula tunnel for full-board music travel.",
    sourceNode: "hapa-music-viz",
    sourcePath: "/Users/calderwong/Desktop/hapa-music-viz"
  },
  {
    id: "builtin:waveform-horizon",
    label: "Waveform Horizon",
    family: "built-in",
    role: "audio-reactive-scene",
    category: "middle-stage",
    description: "Horizontal waveform field suited for a focused center visualizer.",
    sourceNode: "hapa-music-viz",
    sourcePath: "/Users/calderwong/Desktop/hapa-music-viz"
  },
  {
    id: "builtin:beat-grid-pulse",
    label: "Beat Grid Pulse",
    family: "built-in",
    role: "audio-reactive-scene",
    category: "grid",
    description: "Beat/bar telemetry grid for readable deck motion.",
    sourceNode: "hapa-music-viz",
    sourcePath: "/Users/calderwong/Desktop/hapa-music-viz"
  },
  {
    id: "builtin:particle-storm",
    label: "Particle Storm",
    family: "built-in",
    role: "audio-reactive-scene",
    category: "particles",
    description: "Particle field that responds to energy and hooks.",
    sourceNode: "hapa-music-viz",
    sourcePath: "/Users/calderwong/Desktop/hapa-music-viz"
  },
  {
    id: "builtin:cymatic-rings",
    label: "Cymatic Rings",
    family: "built-in",
    role: "audio-reactive-scene",
    category: "center-ritual",
    description: "Concentric cymatic ring stack for board-center focus.",
    sourceNode: "hapa-music-viz",
    sourcePath: "/Users/calderwong/Desktop/hapa-music-viz"
  },
  {
    id: "builtin:stem-layers",
    label: "Stem Layers",
    family: "built-in",
    role: "stem-telemetry-scene",
    category: "stems",
    description: "One FFT lane per loaded stem for mix-aware visualization.",
    sourceNode: "hapa-music-viz",
    sourcePath: "/Users/calderwong/Desktop/hapa-music-viz"
  },
  {
    id: "isf:director-pool",
    label: "ISF Director Pool",
    family: "isf-library",
    role: "director-stack",
    category: "shader-library",
    description: "Hapa Music Viz ISF manifest pool with 182 local shaders and director-eligible filters/effects.",
    manifestPath: "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json",
    sourceNode: "hapa-music-viz",
    sourcePath: "/Users/calderwong/Desktop/hapa-music-viz"
  }
];

export function createHapaSongStoreFromDearPapaSongbook(songbook = {}, songLibrary = {}) {
  return normalizeHapaSongStore({
    schemaVersion: HAPA_SONG_STORE_VERSION,
    album: normalizeAlbum(songbook.album || {}),
    songs: [],
    visualizerCatalog: HAPA_SONG_VISUALIZER_CATALOG,
    createdAt: new Date().toISOString()
  }, songbook, songLibrary);
}

export function normalizeHapaSongStore(input = {}, songbook = {}, songLibrary = {}) {
  const now = new Date().toISOString();
  const sourceCards = Array.isArray(songbook.songCards) ? songbook.songCards : [];
  const tracksBySongId = createRegistryTrackIndex(songLibrary);
  const existingById = new Map((input.songs || []).filter(Boolean).map((song) => [song.id, song]));
  const songs = sourceCards.map((card, index) => {
    const existing = existingById.get(card.id) || existingById.get(card.songId) || null;
    const registryTrack = findRegistryTrackForCard(card, tracksBySongId);
    return normalizeHapaSong(existing, card, registryTrack, index);
  });
  const createdAt = input.createdAt || songbook.createdAt || now;
  const normalized = {
    schemaVersion: HAPA_SONG_STORE_VERSION,
    scope: {
      library: "dear-papa-only",
      albumId: songbook.album?.id || DEAR_PAPA_ALBUM_ID,
      albumTitle: songbook.album?.title || DEAR_PAPA_ALBUM_TITLE,
      source: "data/dear-papa-songbook.json",
      registryCollection: "dear-papa"
    },
    album: normalizeAlbum(songbook.album || input.album || {}),
    songs,
    visualizerCatalog: normalizeVisualizerCatalog(input.visualizerCatalog || HAPA_SONG_VISUALIZER_CATALOG),
    audit: auditHapaSongStore(songs),
    sourceAnchors: normalizeSourceAnchors(songbook.sourceAnchors || input.sourceAnchors || []),
    generatedFrom: {
      songbookSchemaVersion: songbook.schemaVersion || null,
      songbookGeneratedAt: songbook.generatedAt || null,
      songRegistryStatus: songLibrary?.status || "unavailable",
      songRegistryTotal: Number(songLibrary?.total) || (Array.isArray(songLibrary?.songs) ? songLibrary.songs.length : 0),
      musicVizNode: "/Users/calderwong/Desktop/hapa-music-viz"
    },
    createdAt,
    updatedAt: input.updatedAt || now
  };
  return normalized;
}

export function normalizeHapaSong(existing = {}, sourceCard = {}, registryTrack = null, ordinal = 0) {
  existing = existing || {};
  sourceCard = sourceCard || {};
  const now = new Date().toISOString();
  const songId = existing.songId || sourceCard.songId || registryTrack?.songId || registryTrack?.id || slugify(sourceCard.title || "song");
  const id = existing.id || sourceCard.id || `dear-papa-song-${slugify(songId)}`;
  const title = existing.title || sourceCard.title || registryTrack?.title || titleizeSlug(songId);
  const author = existing.author || sourceCard.author || sourceCard.authorship?.author || firstText(registryTrack?.authors) || "Calder";
  const sourcePerspective = sourceCard.performancePerspective || {};
  const avatarLinks = normalizeAvatarLinks(
    existing.attachments?.avatarLinks || existing.avatarLinks || [],
    sourcePerspective
  );
  const sceneLinks = normalizeSceneLinks(existing.attachments?.sceneLinks || existing.sceneLinks || []);
  const cardLinks = normalizeCardLinks(existing.attachments?.cardLinks || existing.cardLinks || []);
  const media = normalizeSongMediaLinks(existing.media || existing.attachments?.media || []);
  const visualizers = normalizeVisualizerLinks(existing.visualizers || existing.attachedVisualizers || []);
  const storyBeats = normalizeStoryBeats(existing.storyBeats || []);
  const comments = normalizeSongComments(existing.comments || []);
  const tags = uniqueTextList([
    "dear-papa",
    "hapa-song",
    sourceCard.mood,
    sourcePerspective.team_color || sourcePerspective.teamColor,
    ...normalizeMediaPrompts(sourceCard.mediaPrompts).map((prompt) => prompt.kind || prompt.id || prompt.title).filter(Boolean),
    ...(existing.tags || [])
  ]);
  return {
    schemaVersion: HAPA_SONG_CARD_VERSION,
    id,
    cardId: sourceCard.id || existing.cardId || id,
    songId,
    albumId: sourceCard.albumId || existing.albumId || DEAR_PAPA_ALBUM_ID,
    albumTitle: sourceCard.albumTitle || existing.albumTitle || DEAR_PAPA_ALBUM_TITLE,
    trackNumber: Number(sourceCard.trackNumber || existing.trackNumber || ordinal + 1),
    title,
    author,
    authorship: {
      author,
      rightsStatus: sourceCard.authorship?.rightsStatus || existing.authorship?.rightsStatus || "operator_authored_hapa_creative_commons",
      albumAttributionRule: sourceCard.authorship?.albumAttributionRule || existing.authorship?.albumAttributionRule || "Attribute the Dear Papa album to Author Calder.",
      singerPerspectiveRule: sourceCard.authorship?.singerPerspectiveRule || existing.authorship?.singerPerspectiveRule || "Avatar performance perspective does not change authorship."
    },
    status: existing.status || "active",
    loreStatus: existing.loreStatus || sourceCard.loreStatus || "hapa_lore_not_hard_canon",
    performancePerspective: normalizePerformancePerspective(sourcePerspective || existing.performancePerspective || {}),
    audio: normalizeAudioPayload(existing.audio || {}, registryTrack),
    stems: normalizeSongStems(existing.stems || [], sourceCard.archiveVariants || [], registryTrack),
    lyrics: normalizeSongLyrics(existing.lyrics || {}, sourceCard.lyrics || {}, registryTrack),
    lyricTimings: normalizeLyricTimings(existing.lyricTimings || existing.lyrics?.timings || registryTrack?.lyricTimings || registryTrack?.lyricTiming || registryTrack?.timings || []),
    lore: normalizeSongLore(existing.lore || {}, sourceCard),
    enrichment: normalizeSongEnrichment(existing.enrichment || {}, sourceCard, registryTrack),
    attachments: {
      avatarLinks,
      sceneLinks,
      cardLinks
    },
    media,
    visualizers,
    comments,
    storyBeats,
    tags,
    attribution: normalizeSongAttribution(existing.attribution || {}, sourceCard, registryTrack),
    lineage: normalizeSongLineage(existing.lineage || {}, sourceCard, registryTrack),
    songCardMint: normalizeSongCardMintProjection(existing.songCardMint || existing.mintHead || existing.mint || null, songId),
    createdAt: existing.createdAt || sourceCard.createdAt || now,
    updatedAt: existing.updatedAt || sourceCard.updatedAt || now
  };
}

function normalizeSongCardMintProjection(input = null, songId = "") {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const projection = structuredClone(input);
  return {
    ...projection,
    schemaVersion: projection.schemaVersion || HAPA_SONG_MINT_PROJECTION_VERSION,
    headId: projection.headId || projection.id || (songId ? `song-card:${songId}` : ""),
    latestEdition: Math.max(0, Number(projection.latestEdition || projection.edition || 0)),
    editionCount: Math.max(0, Number(projection.editionCount ?? projection.latestEdition ?? projection.edition ?? 0)),
    generation: Math.max(0, Number(projection.generation ?? projection.latestEdition ?? projection.edition ?? 0)),
    latestEditionId: projection.latestEditionId || projection.editionId || "",
    semanticFingerprint: projection.semanticFingerprint || projection.fingerprint || "",
    publishStatus: projection.publishStatus || projection.status || "unminted",
    editionsHref: projection.editionsHref || (songId ? `/api/song-cards/${encodeURIComponent(songId)}/editions` : "")
  };
}

export function upsertSongInStore(store, nextSong, songbook = {}, songLibrary = {}) {
  const base = normalizeHapaSongStore(store, songbook, songLibrary);
  const song = normalizeHapaSong(nextSong);
  return {
    ...base,
    songs: base.songs.map((item) => (item.id === song.id ? normalizeHapaSong({ ...item, ...song }) : item)),
    audit: auditHapaSongStore(base.songs.map((item) => (item.id === song.id ? normalizeHapaSong({ ...item, ...song }) : item))),
    updatedAt: new Date().toISOString()
  };
}

export function attachAvatarToSong(song, avatar, patch = {}) {
  const link = normalizeAvatarLink({
    avatarId: avatar?.id || patch.avatarId,
    avatarName: avatar?.primaryName || avatar?.name || patch.avatarName,
    role: patch.role || "song-linked-avatar",
    reason: patch.reason || "Attached in Hapa Songs builder.",
    tags: patch.tags || ["dear-papa", "song-link"],
    linkedAt: patch.linkedAt || new Date().toISOString()
  });
  return normalizeHapaSong({
    ...song,
    attachments: {
      ...(song.attachments || {}),
      avatarLinks: [link, ...(song.attachments?.avatarLinks || []).filter((item) => item.avatarId !== link.avatarId)]
    },
    updatedAt: new Date().toISOString()
  });
}

export function detachAvatarFromSong(song, avatarId) {
  return normalizeHapaSong({
    ...song,
    attachments: {
      ...(song.attachments || {}),
      avatarLinks: (song.attachments?.avatarLinks || []).filter((item) => item.avatarId !== avatarId)
    },
    updatedAt: new Date().toISOString()
  });
}

export function attachSceneToSong(song, scene, patch = {}) {
  const link = normalizeSceneLink({
    sceneId: scene?.id || patch.sceneId,
    sceneTitle: scene?.title || patch.sceneTitle,
    placeId: scene?.placeId || patch.placeId || "",
    role: patch.role || "song-scene-beat",
    reason: patch.reason || "Attached in Hapa Songs builder.",
    tags: patch.tags || ["dear-papa", "scene-link"],
    linkedAt: patch.linkedAt || new Date().toISOString()
  });
  return normalizeHapaSong({
    ...song,
    attachments: {
      ...(song.attachments || {}),
      sceneLinks: [link, ...(song.attachments?.sceneLinks || []).filter((item) => item.sceneId !== link.sceneId)]
    },
    updatedAt: new Date().toISOString()
  });
}

export function attachCardToSong(song, card, patch = {}) {
  const link = normalizeCardLink({
    cardId: card?.id || patch.cardId,
    cardTitle: card?.title || card?.name || patch.cardTitle,
    avatarId: patch.avatarId || "",
    avatarName: patch.avatarName || "",
    role: patch.role || "song-card-combination",
    reason: patch.reason || "Attached in Hapa Songs builder.",
    canonReason: patch.canonReason || "",
    contextReason: patch.contextReason || "",
    personaReason: patch.personaReason || "",
    tags: patch.tags || ["dear-papa", "card-link"],
    linkedAt: patch.linkedAt || new Date().toISOString()
  });
  return normalizeHapaSong({
    ...song,
    attachments: {
      ...(song.attachments || {}),
      cardLinks: [link, ...(song.attachments?.cardLinks || []).filter((item) => item.cardId !== link.cardId)]
    },
    updatedAt: new Date().toISOString()
  });
}

export function detachCardFromSong(song, cardId) {
  return normalizeHapaSong({
    ...song,
    attachments: {
      ...(song.attachments || {}),
      cardLinks: (song.attachments?.cardLinks || []).filter((item) => item.cardId !== cardId)
    },
    updatedAt: new Date().toISOString()
  });
}

export function detachSceneFromSong(song, sceneId) {
  return normalizeHapaSong({
    ...song,
    attachments: {
      ...(song.attachments || {}),
      sceneLinks: (song.attachments?.sceneLinks || []).filter((item) => item.sceneId !== sceneId)
    },
    updatedAt: new Date().toISOString()
  });
}

export function attachSongMedia(song, asset, options = {}) {
  const link = normalizeSongMediaLink({
    ...asset,
    id: options.id || asset?.id,
    tags: uniqueTextList(["song-media", "dear-papa", ...(asset?.tags || []), ...(options.tags || [])]),
    attribution: {
      author: options.author || asset?.attribution?.author || "Hapa operator",
      source: options.source || asset?.source || "hapa-avatar-builder",
      license: options.license || asset?.attribution?.license || "operator-local",
      notes: options.notes || asset?.notes || ""
    },
    lineage: {
      parentSongId: song.songId || song.id,
      parentSongCardId: song.id,
      importedAt: new Date().toISOString(),
      sourceAssetId: asset?.id || null,
      storage: asset?.metadata?.storage || asset?.storage || null
    }
  });
  return normalizeHapaSong({
    ...song,
    media: [link, ...(song.media || []).filter((item) => item.id !== link.id)],
    updatedAt: new Date().toISOString()
  });
}

export function attachVisualizerToSong(song, visualizer, options = {}) {
  const link = normalizeVisualizerLink({
    id: visualizer?.id || options.id,
    label: visualizer?.label || options.label,
    family: visualizer?.family || options.family,
    role: options.role || visualizer?.role || "song-visualizer",
    category: visualizer?.category || options.category,
    placement: options.placement || "middle",
    intensity: options.intensity || "medium",
    sourceNode: visualizer?.sourceNode || "hapa-music-viz",
    sourcePath: visualizer?.sourcePath || visualizer?.manifestPath || "",
    attachedAt: new Date().toISOString()
  });
  return normalizeHapaSong({
    ...song,
    visualizers: [link, ...(song.visualizers || []).filter((item) => item.id !== link.id)],
    updatedAt: new Date().toISOString()
  });
}

export function detachVisualizerFromSong(song, visualizerId) {
  return normalizeHapaSong({
    ...song,
    visualizers: (song.visualizers || []).filter((item) => item.id !== visualizerId),
    updatedAt: new Date().toISOString()
  });
}

export function addSongStoryBeat(song, input = {}) {
  const beat = normalizeStoryBeat({
    id: input.id || `song-beat-${slugify(song.songId || song.id)}-${Date.now()}`,
    authorType: input.authorType || "human",
    authorName: input.authorName || "Hapa operator",
    avatarId: input.avatarId || "",
    sceneId: input.sceneId || "",
    beatType: input.beatType || "story-beat",
    body: input.body || input.text || "",
    tags: input.tags || ["story-beat", "dear-papa"],
    createdAt: input.createdAt || new Date().toISOString()
  });
  if (!beat.body) return normalizeHapaSong(song);
  return normalizeHapaSong({
    ...song,
    storyBeats: [beat, ...(song.storyBeats || []).filter((item) => item.id !== beat.id)],
    updatedAt: new Date().toISOString()
  });
}

export function auditHapaSongStore(songs = []) {
  const withLyrics = songs.filter((song) => Boolean(song.lyrics?.text)).length;
  const withTimings = songs.filter((song) => (song.lyricTimings || []).length > 0).length;
  const withAudio = songs.filter((song) => Boolean(song.audio?.mp3Uri || song.audio?.wavUri || song.audio?.localPath)).length;
  const withStems = songs.filter((song) => (song.stems || []).length > 0).length;
  const withAvatars = songs.filter((song) => (song.attachments?.avatarLinks || []).length > 0).length;
  const withScenes = songs.filter((song) => (song.attachments?.sceneLinks || []).length > 0).length;
  const withMedia = songs.filter((song) => (song.media || []).length > 0).length;
  const withVisualizers = songs.filter((song) => (song.visualizers || []).length > 0).length;
  const storyBeatCount = songs.reduce((sum, song) => sum + (song.storyBeats || []).length, 0);
  return {
    songs: songs.length,
    withLyrics,
    withTimings,
    withAudio,
    withStems,
    withAvatars,
    withScenes,
    withMedia,
    withVisualizers,
    storyBeatCount,
    readyForBuilder: songs.length > 0 && withLyrics > 0
  };
}

function createRegistryTrackIndex(songLibrary = {}) {
  const tracks = Array.isArray(songLibrary?.songs) ? songLibrary.songs : [];
  const byKey = new Map();
  for (const track of tracks) {
    const keys = uniqueTextList([
      track.id,
      track.songId,
      track.registryTrackId,
      track.title,
      slugify(track.title || ""),
      slugify(String(track.title || "").replace(/[_-]+/g, " "))
    ]);
    for (const key of keys) byKey.set(String(key).toLowerCase(), track);
  }
  return byKey;
}

function findRegistryTrackForCard(card = {}, tracksBySongId = new Map()) {
  const keys = uniqueTextList([
    card.registryTrackId,
    card.audio?.registryTrackId,
    card.lineage?.registryTrackId,
    card.source?.registryTrackId,
    card.songId,
    card.title,
    slugify(card.title || ""),
    slugify(String(card.title || "").replace(/[_-]+/g, " "))
  ]);
  for (const key of keys) {
    const track = tracksBySongId.get(String(key).toLowerCase());
    if (track) return track;
  }
  return null;
}

function normalizeAlbum(album = {}) {
  return {
    id: album.id || DEAR_PAPA_ALBUM_ID,
    title: album.title || DEAR_PAPA_ALBUM_TITLE,
    author: album.author || "Calder",
    scope: "dear-papa-only",
    summary: album.summary || "",
    sourcePath: album.sourcePath || "/Users/calderwong/comics/Dear Papa - Album"
  };
}

function normalizeAudioPayload(existing = {}, registryTrack = null) {
  const trackId = registryTrack?.id || existing.registryTrackId || "";
  return {
    registryTrackId: trackId,
    sourceNode: existing.sourceNode || (trackId ? "hapa-song-registry" : ""),
    mp3Uri: existing.mp3Uri || registryTrack?.audioUri || registryTrack?.audioUrl || (trackId ? `/api/audio/${trackId}` : ""),
    wavUri: existing.wavUri || registryTrack?.wavUri || "",
    localPath: existing.localPath || registryTrack?.localPath || "",
    coverUri: existing.coverUri || registryTrack?.coverUri || registryTrack?.imageUrl || (trackId ? `/api/covers/${trackId}` : ""),
    duration: Number(existing.duration || registryTrack?.duration || 0) || null,
    model: existing.model || registryTrack?.model || "",
    localAvailable: existing.localAvailable ?? registryTrack?.localAvailable ?? Boolean(trackId || existing.mp3Uri || existing.localPath)
  };
}

function normalizeSongStems(existingStems = [], archiveVariants = [], registryTrack = null) {
  const archiveStems = archiveVariants.map((variant) => ({
    id: variant.id || `stem-archive-${slugify(variant.archiveName || variant.title || "stems")}`,
    title: variant.title || variant.archiveName || "Stem archive",
    kind: "archive-zip",
    archiveName: variant.archiveName || "",
    archivePath: variant.archivePath || "",
    stemCount: Number(variant.stemCount || 0),
    duplicateOrdinal: Number(variant.duplicateOrdinal || 0),
    source: "dear-papa-songbook"
  }));
  const registryStems = Array.isArray(registryTrack?.stems)
    ? registryTrack.stems.map((stem) => ({
        id: stem.id || `stem-${slugify(stem.type || stem.name || stem.path || "registry")}`,
        title: stem.title || stem.name || stem.type || "Registry stem",
        kind: stem.type || stem.kind || "registry-stem",
        uri: stem.uri || stem.audioUri || "",
        localPath: stem.localPath || stem.path || "",
        source: "hapa-song-registry"
      }))
    : [];
  const typeStems = Array.isArray(registryTrack?.stemTypes)
    ? registryTrack.stemTypes.map((type) => ({
        id: `stem-type-${slugify(type)}`,
        title: titleizeSlug(type),
        kind: type,
        source: "hapa-song-registry"
      }))
    : [];
  return uniqueById([...normalizeGenericList(existingStems), ...archiveStems, ...registryStems, ...typeStems]);
}

function normalizeSongLyrics(existing = {}, sourceLyrics = {}, registryTrack = null) {
  const text = existing.text || sourceLyrics.text || registryTrack?.lyrics || "";
  return {
    status: existing.status || sourceLyrics.status || (text ? "available" : "missing"),
    text,
    sha256: existing.sha256 || sourceLyrics.sha256 || "",
    sourceKind: existing.sourceKind || sourceLyrics.sourceKind || (registryTrack ? "hapa-song-registry" : ""),
    sourceId: existing.sourceId || sourceLyrics.sourceId || registryTrack?.lyricMasterId || "",
    sourceTitle: existing.sourceTitle || sourceLyrics.sourceTitle || "",
    sourceTextType: existing.sourceTextType || sourceLyrics.sourceTextType || "lyrics",
    matchScore: Number(existing.matchScore ?? sourceLyrics.matchScore ?? 0),
    candidateMatches: normalizeCandidateMatches(existing.candidateMatches || sourceLyrics.candidateMatches || [])
  };
}

function normalizeLyricTimings(timings = []) {
  if (!Array.isArray(timings)) return [];
  return timings.map((timing, index) => {
    const start = Number(timing.start ?? timing.startTime ?? timing.t0 ?? 0);
    const end = Number(timing.end ?? timing.endTime ?? timing.t1 ?? 0);
    const words = Array.isArray(timing.words)
      ? timing.words.map((word, wordIndex) => ({
          word: String(word.word || word.text || word.token || ""),
          start: Number(word.start ?? word.startTime ?? start),
          end: Number(word.end ?? word.endTime ?? end),
          matched: word.matched ?? undefined,
          index: Number(word.index ?? wordIndex)
        })).filter((word) => word.word)
      : [];
    return {
      id: timing.id || `lyric-line-${index + 1}`,
      start,
      end,
      text: timing.text || timing.line || timing.lyric || "",
      section: timing.section || timing.kind || "",
      section_id: timing.section_id || timing.sectionId || "",
      section_label: timing.section_label || timing.sectionLabel || timing.section || timing.kind || "",
      confidence: Number(timing.confidence ?? 0),
      words
    };
  });
}

function normalizeSongLore(existing = {}, sourceCard = {}) {
  const sourceLore = sourceCard.lore || {};
  return {
    summary: existing.summary || sourceLore.summary || "",
    learningThing: existing.learningThing || sourceCard.learningThing || sourceLore.learning_thing || "",
    broadGameMechanic: existing.broadGameMechanic || sourceCard.broadGameMechanic || sourceLore.broad_game_mechanic || "",
    relationshipLens: existing.relationshipLens || sourceLore.relationship_lens || "",
    genesisUse: existing.genesisUse || sourceCard.genesisUse || "",
    mood: existing.mood || sourceCard.mood || "cinematic-lore",
    mediaPrompts: Array.isArray(existing.mediaPrompts) ? existing.mediaPrompts : normalizeMediaPrompts(sourceCard.mediaPrompts)
  };
}

function normalizeMediaPrompts(mediaPrompts = []) {
  if (Array.isArray(mediaPrompts)) {
    return mediaPrompts.map((prompt, index) => typeof prompt === "string"
      ? { id: `media-prompt-${index + 1}`, kind: "prompt", prompt }
      : {
          id: prompt.id || prompt.kind || prompt.title || `media-prompt-${index + 1}`,
          kind: prompt.kind || prompt.id || prompt.title || "prompt",
          prompt: prompt.prompt || prompt.text || prompt.value || "",
          ...prompt
        });
  }
  if (mediaPrompts && typeof mediaPrompts === "object") {
    return Object.entries(mediaPrompts).map(([kind, prompt]) => ({
      id: `media-prompt-${slugify(kind)}`,
      kind,
      prompt: typeof prompt === "string" ? prompt : prompt?.prompt || prompt?.text || ""
    }));
  }
  return [];
}

function normalizeSongEnrichment(existing = {}, sourceCard = {}, registryTrack = null) {
  return {
    titleReviewed: Boolean(existing.titleReviewed),
    lyricsReviewed: Boolean(existing.lyricsReviewed || sourceCard.lyrics?.status === "matched_exact"),
    timingReviewed: Boolean(existing.timingReviewed || registryTrack?.lyricTimings?.length),
    stemsReviewed: Boolean(existing.stemsReviewed || sourceCard.archiveVariants?.length || registryTrack?.stemCount),
    authorReviewed: Boolean(existing.authorReviewed || sourceCard.author),
    needsHumanReview: Boolean(existing.needsHumanReview || sourceCard.lyrics?.status === "candidate_needs_review" || sourceCard.lyrics?.status === "not_found"),
    notes: existing.notes || ""
  };
}

function normalizePerformancePerspective(input = {}) {
  return {
    teamColor: input.teamColor || input.team_color || "",
    teamId: input.teamId || input.team_id || "",
    avatarId: input.avatarId || input.avatar_id || "",
    avatarName: input.avatarName || input.avatar_name || "",
    voiceFunction: input.voiceFunction || input.voice_function || "",
    relationshipFocus: uniqueTextList(input.relationshipFocus || input.relationship_focus || [])
  };
}

function normalizeAvatarLinks(existingLinks = [], sourcePerspective = {}) {
  const perspective = normalizePerformancePerspective(sourcePerspective);
  const seeded = perspective.avatarId || perspective.avatarName
    ? [normalizeAvatarLink({
        avatarId: perspective.avatarId,
        avatarName: perspective.avatarName,
        role: "performance-perspective",
        reason: perspective.voiceFunction || "Seeded from Dear Papa songbook performance perspective.",
        tags: uniqueTextList(["performance-perspective", perspective.teamColor, perspective.teamId]),
        linkedAt: ""
      })]
    : [];
  return uniqueById([...existingLinks.map(normalizeAvatarLink), ...seeded], "avatarId").filter((link) => link.avatarId || link.avatarName);
}

function normalizeAvatarLink(link = {}) {
  return {
    avatarId: link.avatarId || link.avatar_id || "",
    avatarName: link.avatarName || link.avatar_name || link.name || "",
    role: link.role || "song-linked-avatar",
    reason: link.reason || link.why || "",
    tags: uniqueTextList(link.tags || []),
    linkedAt: link.linkedAt || link.createdAt || ""
  };
}

function normalizeSceneLinks(links = []) {
  return uniqueById(links.map(normalizeSceneLink).filter((link) => link.sceneId || link.sceneTitle), "sceneId");
}

function normalizeSceneLink(link = {}) {
  return {
    sceneId: link.sceneId || link.scene_id || "",
    sceneTitle: link.sceneTitle || link.title || link.scene_title || "",
    placeId: link.placeId || link.place_id || "",
    role: link.role || "song-scene-beat",
    reason: link.reason || "",
    tags: uniqueTextList(link.tags || []),
    linkedAt: link.linkedAt || link.createdAt || ""
  };
}

function normalizeCardLinks(links = []) {
  return uniqueById(links.map(normalizeCardLink).filter((link) => link.cardId || link.cardTitle), "cardId");
}

function normalizeCardLink(link = {}) {
  return {
    cardId: link.cardId || link.card_id || "",
    cardTitle: link.cardTitle || link.card_title || link.title || "",
    avatarId: link.avatarId || link.avatar_id || "",
    avatarName: link.avatarName || link.avatar_name || link.name || "",
    role: link.role || "song-card-combination",
    reason: link.reason || link.why || "",
    canonReason: link.canonReason || link.canon_reason || "",
    contextReason: link.contextReason || link.context_reason || "",
    personaReason: link.personaReason || link.persona_reason || "",
    tags: uniqueTextList(link.tags || []),
    linkedAt: link.linkedAt || link.createdAt || ""
  };
}

function normalizeSongMediaLinks(media = []) {
  return uniqueById(media.map(normalizeSongMediaLink).filter((item) => item.id || item.uri));
}

function normalizeSongMediaLink(asset = {}) {
  const type = asset.type || inferAssetKind(asset.name || asset.uri || "");
  return {
    schemaVersion: HAPA_SONG_MEDIA_VERSION,
    id: asset.id || `song-media-${slugify(asset.name || asset.uri || "asset")}`,
    name: asset.name || asset.title || "Song media",
    type,
    uri: asset.uri || "",
    mimeType: asset.mimeType || asset.metadata?.mimeType || "",
    requirementId: asset.requirementId || "song_media",
    tags: uniqueTextList(asset.tags || []),
    notes: asset.notes || "",
    metadata: asset.metadata || {},
    attribution: {
      author: asset.attribution?.author || "",
      source: asset.attribution?.source || asset.source || "",
      license: asset.attribution?.license || "",
      notes: asset.attribution?.notes || ""
    },
    lineage: {
      ...(asset.lineage || {}),
      sourceAssetId: asset.lineage?.sourceAssetId || asset.id || null
    },
    createdAt: asset.createdAt || asset.processing?.processedAt || new Date().toISOString(),
    updatedAt: asset.updatedAt || asset.processing?.attachedAt || new Date().toISOString()
  };
}

function normalizeVisualizerCatalog(catalog = []) {
  return uniqueById(catalog.map((visualizer) => ({
    id: visualizer.id,
    label: visualizer.label || visualizer.title || titleizeSlug(visualizer.id || "Visualizer"),
    family: visualizer.family || "built-in",
    role: visualizer.role || "audio-reactive-scene",
    category: visualizer.category || visualizer.hmvCategory || "",
    description: visualizer.description || visualizer.hmvDescription || "",
    sourceNode: visualizer.sourceNode || "hapa-music-viz",
    sourcePath: visualizer.sourcePath || visualizer.manifestPath || "",
    manifestPath: visualizer.manifestPath || ""
  }))).filter((item) => item.id);
}

function normalizeVisualizerLinks(visualizers = []) {
  return uniqueById(visualizers.map(normalizeVisualizerLink).filter((item) => item.id));
}

function normalizeVisualizerLink(link = {}) {
  return {
    schemaVersion: HAPA_SONG_VISUALIZER_LINK_VERSION,
    id: link.id || "",
    label: link.label || titleizeSlug(link.id || "Visualizer"),
    family: link.family || "built-in",
    role: link.role || "song-visualizer",
    category: link.category || "",
    placement: link.placement || "middle",
    intensity: link.intensity || "medium",
    sourceNode: link.sourceNode || "hapa-music-viz",
    sourcePath: link.sourcePath || "",
    attachedAt: link.attachedAt || ""
  };
}

function normalizeSongComments(comments = []) {
  return comments.map((comment, index) => ({
    schemaVersion: HAPA_SONG_COMMENT_VERSION,
    id: comment.id || `song-comment-${index + 1}`,
    authorType: comment.authorType || "human",
    authorName: comment.authorName || "",
    avatarId: comment.avatarId || "",
    body: comment.body || comment.text || "",
    tags: uniqueTextList(comment.tags || []),
    createdAt: comment.createdAt || ""
  })).filter((comment) => comment.body);
}

function normalizeStoryBeats(storyBeats = []) {
  return storyBeats.map(normalizeStoryBeat).filter((beat) => beat.body);
}

function normalizeStoryBeat(beat = {}) {
  return {
    id: beat.id || `story-beat-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    authorType: beat.authorType || "human",
    authorName: beat.authorName || "",
    avatarId: beat.avatarId || "",
    sceneId: beat.sceneId || "",
    beatType: beat.beatType || "story-beat",
    body: beat.body || beat.text || "",
    tags: uniqueTextList(beat.tags || []),
    createdAt: beat.createdAt || new Date().toISOString()
  };
}

function normalizeSongAttribution(existing = {}, sourceCard = {}, registryTrack = null) {
  return {
    author: existing.author || sourceCard.author || sourceCard.authorship?.author || "Calder",
    rightsStatus: existing.rightsStatus || sourceCard.authorship?.rightsStatus || "operator_authored_hapa_creative_commons",
    sourceNode: existing.sourceNode || "hapa-avatar-builder",
    songRegistryTrackId: existing.songRegistryTrackId || registryTrack?.id || "",
    sourceCardId: existing.sourceCardId || sourceCard.id || "",
    sourceAlbumPath: existing.sourceAlbumPath || "/Users/calderwong/comics/Dear Papa - Album"
  };
}

function normalizeSongLineage(existing = {}, sourceCard = {}, registryTrack = null) {
  return {
    sourceCardId: existing.sourceCardId || sourceCard.id || "",
    sourceSongId: existing.sourceSongId || sourceCard.songId || registryTrack?.id || "",
    songbookSchemaVersion: existing.songbookSchemaVersion || sourceCard.schemaVersion || "",
    registryTrackId: existing.registryTrackId || registryTrack?.id || "",
    archiveVariantIds: uniqueTextList([
      ...(existing.archiveVariantIds || []),
      ...((sourceCard.archiveVariants || []).map((variant) => variant.id))
    ]),
    lyricsSourceId: existing.lyricsSourceId || sourceCard.lyrics?.sourceId || registryTrack?.lyricMasterId || "",
    provenanceNotes: existing.provenanceNotes || "Normalized from Dear Papa songbook plus optional Hapa Song Registry projection."
  };
}

function normalizeCandidateMatches(matches = []) {
  return matches.map((match) => ({
    score: Number(match.score || 0),
    kind: match.kind || "",
    id: match.id || "",
    title: match.title || "",
    textType: match.text_type || match.textType || "",
    textSha256: match.text_sha256 || match.textSha256 || "",
    preview: match.preview || ""
  }));
}

function normalizeSourceAnchors(anchors = []) {
  if (Array.isArray(anchors)) return anchors;
  return Object.entries(anchors || {}).map(([key, value]) => ({ key, value }));
}

function normalizeGenericList(items = []) {
  return Array.isArray(items) ? items.filter(Boolean).map((item) => ({ ...item })) : [];
}

function uniqueById(items = [], idKey = "id") {
  const seen = new Set();
  const result = [];
  for (const item of items.filter(Boolean)) {
    const id = String(item[idKey] || item.id || item.uri || item.name || "").toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

function uniqueTextList(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : [values]) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function firstText(value) {
  if (Array.isArray(value)) return value.find(Boolean) || "";
  return value || "";
}

function titleizeSlug(value = "") {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
