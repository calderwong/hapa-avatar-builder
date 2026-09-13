export const ECHO_TAROT_SONG_LINKS_SCHEMA = "hapa.echo-tarot-song-links.v1";

function text(value = "") {
  return String(value || "").trim();
}

function normalizedTitle(value = "") {
  return text(value).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function songMatchesTrack(song = {}, track = {}) {
  if (Number(song.trackNumber) === Number(track.track_no)) return true;
  return normalizedTitle(song.title) === normalizedTitle(track.title);
}

export function compactEchoTarotEditionCards(source = {}) {
  return (source.cards || []).map((card) => ({
    id: `echo-tarot:${card.id}`,
    editionCardId: card.id,
    title: card.title,
    subtitle: card.hapa_edition?.edition_subtitle || "",
    arcana: card.arcana,
    suit: card.suit,
    rank: card.rank,
    number: card.number,
    casting: card.inherited?.casting || "",
    summary: card.hapa_edition?.thematic_synthesis || card.inherited?.hapa_interpretation || "",
    status: "proposed-editorial-correspondence",
    source: {
      editionId: source.edition_id,
      sourceCardId: card.id,
      canonSource: card.canon_source || null,
      sourceStatus: card.source_status || "",
      resourcePath: "resources/echo-album/hapa-tarot-echoes-v1.json",
    },
  }));
}

export function buildEchoTarotSongConnections(source = {}, songs = []) {
  const tracks = source.track_index || [];
  const connections = [];
  for (const card of source.cards || []) {
    for (const assignment of card.hapa_edition?.songs || []) {
      const track = tracks.find((item) => item.track_id === assignment.track_id) || assignment;
      const song = songs.find((item) => songMatchesTrack(item, track)) || null;
      connections.push({
        schemaVersion: ECHO_TAROT_SONG_LINKS_SCHEMA,
        id: `echo-tarot-link:${card.id}:${assignment.track_id}`,
        songId: song?.id || "",
        songSlug: song?.songId || "",
        songTitle: track.title || assignment.title,
        trackId: assignment.track_id,
        trackNumber: Number(assignment.track_no || track.track_no || 0),
        cardId: `echo-tarot:${card.id}`,
        editionCardId: card.id,
        cardTitle: card.title,
        cardSubtitle: card.hapa_edition?.edition_subtitle || "",
        arcana: card.arcana,
        suit: card.suit,
        role: assignment.role || "Editorial correspondence",
        logic: assignment.argument || "",
        evidence: assignment.evidence || [],
        mappingStatus: assignment.mapping_status || "proposed_editorial_correspondence",
        thematicSynthesis: card.hapa_edition?.thematic_synthesis || "",
        interpretiveGuardrail: card.hapa_edition?.interpretive_guardrail || "",
        readingMechanics: card.hapa_edition?.reading_mechanics || null,
        symbolBridges: card.hapa_edition?.symbol_bridges || [],
        artistScene: card.hapa_edition?.artist_scene || "",
        listenUrl: assignment.listen_url || track.listen_url || null,
        sourceRange: assignment.source_range || track.source_range || null,
        source: {
          editionId: source.edition_id,
          editionTitle: source.title,
          editionStatus: source.status,
          sourceReviewDate: source.source_review_date,
          cardSource: card.canon_source || null,
          resourcePath: "resources/echo-album/hapa-tarot-echoes-v1.json",
        },
      });
    }
  }
  return connections;
}

export function projectEchoTarotSongConnections(source = {}, songs = [], songId = "") {
  const all = buildEchoTarotSongConnections(source, songs);
  if (!songId) return all;
  const selected = songs.find((song) => [song.id, song.songId, song.cardId].includes(songId));
  return all.filter((connection) => (
    connection.songId === selected?.id
    || connection.songSlug === selected?.songId
    || connection.trackId === songId
  ));
}

export function compactTarotLibraryCards(store = {}) {
  return (store.cards || []).map((card) => ({
    id: card.id,
    title: card.title || card.name || card.id,
    subtitle: card.promptNotes || card.meaning || "",
    arcana: card.arcana || "custom",
    suit: card.suit || "custom",
    number: card.number ?? "",
    status: card.status || "draft",
    source: { resourcePath: "data/tarot-store.json", sourceCardId: card.id },
  }));
}
