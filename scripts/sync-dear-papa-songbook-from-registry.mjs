#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalizeHapaSongStore } from "../src/domain/song.js";
import { slugify } from "../src/domain/avatar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const REPORT_DIR = path.join(DATA_DIR, "song-sync-reports");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";
const SUNO_LIBRARY_ROOT = process.env.HAPA_SUNO_LIBRARY_ROOT || "/Users/calderwong/Desktop/suno-library";
const SONG_REGISTRY_PATH = process.env.HAPA_SONG_REGISTRY_DATA || "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";
const PLAYLIST_ROOT = process.env.HAPA_DEAR_PAPA_PLAYLIST_ROOT || path.join(SUNO_LIBRARY_ROOT, "playlists", PLAYLIST_ID);
const MANIFEST_PATH = process.env.HAPA_DEAR_PAPA_MANIFEST || path.join(PLAYLIST_ROOT, "manifest.json");

await main();

async function main() {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(REPORT_DIR, { recursive: true });

  for (const filePath of [SONGBOOK_PATH, HAPA_SONG_STORE_PATH, AVATAR_STORE_PATH]) {
    if (existsSync(filePath)) {
      await fs.copyFile(filePath, path.join(BACKUP_DIR, `${path.basename(filePath, ".json")}.before-dear-papa-sync-${stamp}.json`));
    }
  }

  const songbook = await readJson(SONGBOOK_PATH);
  const existingSongStore = await readJson(HAPA_SONG_STORE_PATH).catch(() => ({ songs: [] }));
  const avatarStore = await readJson(AVATAR_STORE_PATH).catch(() => null);
  const registry = await readJson(SONG_REGISTRY_PATH);
  const manifest = await readJson(MANIFEST_PATH);
  const manifestSongs = (manifest.songs || [])
    .filter((song) => song?.id)
    .slice()
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0) || String(a.title || "").localeCompare(String(b.title || "")));

  const registryById = new Map((registry.songs || []).map((song) => [song.id, song]));
  const tracks = manifestSongs.map((manifestSong) => compactPlaylistTrack(manifestSong, registryById.get(manifestSong.id) || {}));
  const titleCounts = countBy(manifestSongs, (song) => titleKey(song.title));
  const existingQueues = buildExistingCardQueues(songbook.songCards || []);
  const usedExistingIds = new Set();
  const usedCardIds = new Set();
  const usedSongIds = new Set();

  const nextCards = tracks.map((track, index) => {
    const existing = takeExistingCard(track, existingQueues, usedExistingIds);
    const merged = mergeSongCard(existing, track, index, titleCounts, usedCardIds, usedSongIds, now);
    usedCardIds.add(merged.id);
    usedSongIds.add(merged.songId);
    return merged;
  });

  const unmatchedLegacyCards = (songbook.songCards || [])
    .filter((card) => !usedExistingIds.has(card.id))
    .map((card, index) => ({
      ...card,
      trackNumber: tracks.length + index + 1,
      status: card.status || "legacy-unmatched",
      lineage: {
        ...(card.lineage || {}),
        syncNote: "Preserved legacy Dear Papa card not present in the current Suno playlist manifest."
      },
      updatedAt: now
    }));

  const nextSongbook = {
    ...songbook,
    schemaVersion: songbook.schemaVersion || "hapa.foundation.dear-papa-songbook.v1",
    album: {
      ...(songbook.album || {}),
      id: songbook.album?.id || "dear-papa-album",
      title: songbook.album?.title || "Dear Papa",
      author: songbook.album?.author || "Calder",
      playlistId: PLAYLIST_ID,
      sourceUrl: manifest.sourceUrl || `https://suno.com/playlist/${PLAYLIST_ID}`,
      sourceManifestPath: MANIFEST_PATH
    },
    sourceAnchors: mergeSourceAnchors(songbook.sourceAnchors || [], now),
    songCards: [...nextCards, ...unmatchedLegacyCards],
    sync: {
      schemaVersion: "hapa.dear-papa-songbook-sync.v1",
      runAt: now,
      source: "scripts/sync-dear-papa-songbook-from-registry.mjs",
      playlistId: PLAYLIST_ID,
      manifestPath: MANIFEST_PATH,
      registryPath: SONG_REGISTRY_PATH,
      manifestSongs: manifestSongs.length,
      registryMatched: tracks.filter((track) => track.registryMatched).length,
      preservedLegacyCards: unmatchedLegacyCards.length,
      localAudio: tracks.filter((track) => track.localAvailable).length,
      songsWithStems: tracks.filter((track) => Number(track.stemCount || 0) > 0 || (track.stems || []).length > 0).length
    },
    generatedAt: songbook.generatedAt || now,
    updatedAt: now
  };

  const songLibrary = {
    status: "available",
    total: tracks.length,
    playlistId: PLAYLIST_ID,
    source: {
      registryPath: SONG_REGISTRY_PATH,
      manifestPath: MANIFEST_PATH
    },
    songs: tracks
  };
  const nextSongStore = normalizeHapaSongStore(existingSongStore, nextSongbook, songLibrary);
  nextSongStore.updatedAt = now;
  nextSongStore.generatedFrom = {
    ...(nextSongStore.generatedFrom || {}),
    songRegistryStatus: "available",
    songRegistryTotal: tracks.length,
    playlistId: PLAYLIST_ID,
    playlistManifestPath: MANIFEST_PATH
  };

  if (avatarStore) {
    avatarStore.dearPapaSongbook = {
      ...(avatarStore.dearPapaSongbook || {}),
      schemaVersion: "hapa.avatar-store.dear-papa-songbook-summary.v1",
      albumId: nextSongbook.album.id,
      albumTitle: nextSongbook.album.title,
      playlistId: PLAYLIST_ID,
      sourceUrl: nextSongbook.album.sourceUrl,
      songCards: nextSongbook.songCards.length,
      sunoPlaylistTracks: manifestSongs.length,
      registryMatched: tracks.filter((track) => track.registryMatched).length,
      localAudio: tracks.filter((track) => track.localAvailable).length,
      songsWithStems: tracks.filter((track) => Number(track.stemCount || 0) > 0 || (track.stems || []).length > 0).length,
      recoveredMergeContext: "Updated after the duplicate Pinokio/3D Tarot split was merged back into the canonical Avatar Builder. Treat song links as recovered soft canon until human review.",
      updatedAt: now
    };
    avatarStore.updatedAt = now;
  }

  const report = {
    schemaVersion: "hapa.dear-papa-songbook-sync-report.v1",
    runAt: now,
    playlistId: PLAYLIST_ID,
    sourceUrl: nextSongbook.album.sourceUrl,
    manifestPath: MANIFEST_PATH,
    registryPath: SONG_REGISTRY_PATH,
    before: {
      songbookCards: (songbook.songCards || []).length,
      hapaSongs: (existingSongStore.songs || []).length
    },
    after: {
      songbookCards: nextSongbook.songCards.length,
      hapaSongs: nextSongStore.songs.length,
      localAudio: nextSongStore.audit?.withAudio || 0,
      withStems: nextSongStore.audit?.withStems || 0,
      withLyrics: nextSongStore.audit?.withLyrics || 0
    },
    manifest: {
      songs: manifestSongs.length,
      songsWithStems: manifestSongs.filter((song) => Number(song.stemCount || 0) > 0 || (song.stems || []).length > 0).length,
      stemFiles: manifestSongs.reduce((sum, song) => sum + ((song.stems || []).length || Number(song.stemCount || 0)), 0)
    },
    matchedExistingCards: usedExistingIds.size,
    addedCards: nextCards.length - usedExistingIds.size,
    preservedLegacyCards: unmatchedLegacyCards.map((card) => ({ id: card.id, songId: card.songId, title: card.title })),
    tracks: nextCards.map((card) => ({
      trackNumber: card.trackNumber,
      id: card.id,
      songId: card.songId,
      registryTrackId: card.registryTrackId,
      title: card.title
    }))
  };

  await writeJson(SONGBOOK_PATH, nextSongbook);
  await writeJson(HAPA_SONG_STORE_PATH, nextSongStore);
  if (avatarStore) await writeJson(AVATAR_STORE_PATH, avatarStore);
  const runReportPath = path.join(REPORT_DIR, `dear-papa-songbook-sync-${stamp}.json`);
  const latestReportPath = path.join(REPORT_DIR, "latest-dear-papa-songbook-sync.json");
  await writeJson(runReportPath, report);
  await writeJson(latestReportPath, report);

  console.log(JSON.stringify({
    ok: true,
    songbookCards: nextSongbook.songCards.length,
    hapaSongs: nextSongStore.songs.length,
    localAudio: nextSongStore.audit?.withAudio || 0,
    withStems: nextSongStore.audit?.withStems || 0,
    withLyrics: nextSongStore.audit?.withLyrics || 0,
    reportPath: path.relative(ROOT, latestReportPath)
  }, null, 2));
}

function compactPlaylistTrack(manifestSong, registrySong = {}) {
  const id = manifestSong.id || registrySong.id;
  const exportInfo = registrySong.raw?._hapaPlaylistExport || {};
  const localPath = manifestSong.songPath || registrySong.localPath || "";
  const coverPath = manifestSong.coverPath || exportInfo.coverPath || "";
  const stems = Array.isArray(manifestSong.stems) ? manifestSong.stems : [];
  const timingPayload = readPlaylistLyricTiming(manifestSong, id);
  return {
    id,
    registryTrackId: id,
    songId: id,
    title: manifestSong.title || registrySong.title || "Untitled Dear Papa Track",
    authors: registrySong.authors || ["Calder"],
    duration: Number(manifestSong.duration || registrySong.duration || 0) || null,
    createdAt: registrySong.createdAt || null,
    model: manifestSong.model || registrySong.model || null,
    majorModelVersion: manifestSong.majorModelVersion || registrySong.majorModelVersion || null,
    contentType: registrySong.contentType || "song",
    stemCount: Number(manifestSong.stemCount || registrySong.stemCount || stems.length || 0),
    stemTypes: manifestSong.stemTypes || registrySong.stemTypes || stems.map((stem) => stem.stemType).filter(Boolean),
    stems: stems.map((stem) => ({
      id: stem.id,
      title: stem.title || `${manifestSong.title || registrySong.title || "Song"} (${stem.stemType || "Stem"})`,
      type: stem.stemType || stem.type || "registry-stem",
      kind: stem.stemType || stem.type || "registry-stem",
      uri: stem.id ? `/api/song-registry/audio/${encodeURIComponent(stem.id)}` : stem.audioUrl || "",
      audioUri: stem.id ? `/api/song-registry/audio/${encodeURIComponent(stem.id)}` : stem.audioUrl || "",
      localPath: stem.localPath || "",
      source: "hapa-song-registry"
    })),
    tags: registrySong.tags || "",
    facets: registrySong.facets || {},
    localAvailable: Boolean(localPath),
    localPath,
    audioUrl: registrySong.audioUrl || manifestSong.audioUrl || "",
    audioUri: localPath ? `/api/song-registry/audio/${encodeURIComponent(id)}` : (registrySong.audioUrl || ""),
    imageUrl: registrySong.imageUrl || "",
    coverPath,
    coverUri: coverPath ? `/api/song-registry/covers/${encodeURIComponent(id)}` : (registrySong.imageUrl || ""),
    lyrics: readTextPathIfAvailable(manifestSong.lyricsPath) || registrySong.lyrics || "",
    lyricMasterId: registrySong.lyricMasterId || "",
    lyricTimings: timingPayload.lines?.length ? timingPayload.lines : (registrySong.lyricTimings || registrySong.lyricTiming || []),
    lyricTimingPath: timingPayload.path || "",
    lyricTimingStats: timingPayload.stats || null,
    lyricTimingConfidence: timingPayload.confidence ?? null,
    lyricTimingSource: timingPayload.path ? "dear-papa-playlist-lyric-timing" : "",
    trackNumber: Number(manifestSong.index || parseTrackNumber(manifestSong.localDir || localPath) || 0),
    sunoUrl: manifestSong.sunoUrl || `https://suno.com/song/${id}`,
    localDir: manifestSong.localDir || exportInfo.songDir || path.dirname(localPath),
    registryMatched: Boolean(registrySong.id)
  };
}

function readPlaylistLyricTiming(manifestSong = {}, registryTrackId = "") {
  const candidates = [
    manifestSong.lyricTimingPath,
    manifestSong.localDir ? path.join(manifestSong.localDir, "lyric-timing.json") : "",
    registryTrackId ? path.join(PLAYLIST_ROOT, "lyric_timings", `${registryTrackId}.json`) : ""
  ].filter(Boolean);
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const timing = JSON.parse(readFileSync(filePath, "utf8"));
      const lines = normalizeTimingLines(timing.lines || []);
      return {
        path: filePath,
        lines,
        stats: timing.stats || null,
        confidence: timing.confidence ?? null
      };
    } catch (error) {
      console.warn(`Failed to read lyric timing sidecar ${filePath}:`, error.message);
    }
  }
  return { path: "", lines: [], stats: null, confidence: null };
}

function normalizeTimingLines(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line, index) => {
      const start = Number(line.start ?? line.startTime ?? 0);
      const end = Number(line.end ?? line.endTime ?? start);
      const words = Array.isArray(line.words)
        ? line.words.map((word, wordIndex) => ({
            word: String(word.word || word.text || word.token || ""),
            start: Number(word.start ?? start),
            end: Number(word.end ?? end),
            matched: word.matched ?? undefined,
            index: Number(word.index ?? wordIndex)
          })).filter((word) => word.word)
        : [];
      return {
        id: line.id || `timed-line-${index + 1}`,
        start,
        end,
        text: line.text || line.line || line.lyric || "",
        section: line.section || line.section_label || "",
        section_id: line.section_id || line.sectionId || "",
        section_label: line.section_label || line.sectionLabel || line.section || "",
        confidence: Number(line.confidence ?? 0),
        words
      };
    })
    .filter((line) => line.text && Number.isFinite(line.start) && Number.isFinite(line.end) && line.end >= line.start);
}

function mergeSongCard(existing, track, index, titleCounts, usedCardIds, usedSongIds, now) {
  const titleSlug = slugify(track.title || "song");
  const duplicateTitle = (titleCounts.get(titleKey(track.title)) || 0) > 1;
  const baseSongId = duplicateTitle ? `${titleSlug}-${shortId(track.id)}` : titleSlug;
  const songId = uniqueId(existing?.songId || baseSongId, usedSongIds);
  const id = uniqueId(existing?.id || `dear-papa-song-${songId}`, usedCardIds);
  const perspective = existing?.performancePerspective || inferPerformancePerspective(track, index);
  const lyrics = existing?.lyrics?.text ? existing.lyrics : lyricsPayload(track);
  const lore = existing?.lore || buildLore(track, perspective);
  const facets = track.facets || {};

  return {
    ...(existing || {}),
    id,
    schemaVersion: existing?.schemaVersion || "hapa.foundation.song-lore-card.v1",
    cardType: existing?.cardType || "song_lore_card",
    albumId: existing?.albumId || "dear-papa-album",
    albumTitle: existing?.albumTitle || "Dear Papa",
    trackNumber: Number(track.trackNumber || index + 1),
    songId,
    registryTrackId: track.registryTrackId,
    sunoUrl: track.sunoUrl,
    title: track.title,
    author: existing?.author || "Calder",
    authorship: {
      author: existing?.authorship?.author || "Calder",
      albumAttributionRule: existing?.authorship?.albumAttributionRule || "Attribute the entire Dear Papa album to Author Calder.",
      singerPerspectiveRule: existing?.authorship?.singerPerspectiveRule || "Red, Blue, or Green may sing the lyrics in-universe as lore perspective, but the singer perspective does not change authorship.",
      rightsStatus: existing?.authorship?.rightsStatus || "operator_authored_hapa_creative_commons"
    },
    loreStatus: existing?.loreStatus || "hapa_lore_not_hard_canon",
    performancePerspective: perspective,
    lore,
    lyrics,
    archiveVariants: existing?.archiveVariants || [],
    mood: existing?.mood || first(facets.mood) || "cinematic-lore",
    learningThing: existing?.learningThing || lore.learning_thing,
    broadGameMechanic: existing?.broadGameMechanic || lore.broad_game_mechanic,
    genesisUse: existing?.genesisUse || [
      "Use as Dear Papa album canon fuel during avatar Genesis review.",
      "Keep Suno-derived media as recovered soft canon until human review.",
      "Route song-to-avatar choices through Red, Blue, and Green performance perspective rules."
    ],
    mediaPrompts: existing?.mediaPrompts || mediaPrompts(track, perspective),
    sourceAnchors: [
      ...(existing?.sourceAnchors || []),
      {
        id: `suno-playlist-${shortId(track.id)}`,
        kind: "suno-playlist-track",
        title: track.title,
        path: track.localDir || track.localPath || track.sunoUrl,
        registryTrackId: track.registryTrackId,
        playlistId: PLAYLIST_ID,
        confidence: "hard"
      }
    ],
    sync: {
      schemaVersion: "hapa.dear-papa-song-card-sync.v1",
      playlistId: PLAYLIST_ID,
      registryTrackId: track.registryTrackId,
      localPath: track.localPath || "",
      coverPath: track.coverPath || "",
      stemCount: track.stemCount || (track.stems || []).length,
      stemTypes: track.stemTypes || [],
      recoveredMergeContext: "Recovered after the duplicate Pinokio/3D Tarot split was merged back into the canonical app.",
      updatedAt: now
    },
    lineage: {
      ...(existing?.lineage || {}),
      registryTrackId: track.registryTrackId,
      playlistId: PLAYLIST_ID,
      playlistTrackNumber: Number(track.trackNumber || index + 1),
      localDir: track.localDir || ""
    },
    createdAt: existing?.createdAt || track.createdAt || now,
    updatedAt: now
  };
}

function inferPerformancePerspective(track, index) {
  const text = `${track.title || ""} ${track.tags || ""} ${JSON.stringify(track.facets || {})}`.toLowerCase();
  if (/\bred\b|fire|war|coin|throat|reaper|vector/.test(text)) return perspective("red");
  if (/\bblue\b|code|signal|truth|log|save|mirror|tide|source|shift/.test(text)) return perspective("blue");
  if (/\bgreen\b|home|bread|garden|campfire|rabbit|conviction|bounce|peak|line/.test(text)) return perspective("green");
  return [perspective("blue"), perspective("red"), perspective("green")][index % 3];
}

function perspective(color) {
  const map = {
    red: {
      team_color: "red",
      team_id: "red-team",
      avatar_id: "red-reaper",
      avatar_name: "Red",
      voice_function: "pressure, protection, fire-control, threat triage, and accountable action",
      relationship_focus: ["protection", "pressure", "rollback", "repair"]
    },
    blue: {
      team_color: "blue",
      team_id: "blue-team",
      avatar_id: "avatar-2",
      avatar_name: "Blue",
      voice_function: "signal, memory, source-path, pattern proof, and return-route intelligence",
      relationship_focus: ["truth filtering", "lineage", "invariant checking", "route home"]
    },
    green: {
      team_color: "green",
      team_id: "green-team",
      avatar_id: "avatar-3",
      avatar_name: "Green",
      voice_function: "stakeholder care, embodiment, cultivation, delivery, and repair loop",
      relationship_focus: ["care", "stakeholders", "growth", "repair loop"]
    }
  };
  return map[color] || map.blue;
}

function buildLore(track, perspective) {
  const avatarName = perspective.avatar_name || perspective.avatarName || "Blue";
  const focus = (perspective.relationship_focus || perspective.relationshipFocus || []).slice(0, 2).join(", ") || "relationship repair";
  const mood = first(track.facets?.mood) || "cinematic-lore";
  return {
    summary: `${avatarName} carries ${track.title} as recovered Dear Papa soft canon: a playlist track restored with its local audio, stems, and registry lineage after the app merge.`,
    learning_thing: `How ${mood} song evidence becomes usable avatar lore without losing source path, authorship, or review boundary.`,
    broad_game_mechanic: "Draw as a song card: name the singer perspective, cite the registry track, then attach one avatar, one card, and one repair/action reason.",
    relationship_lens: `Use this song to ask how an avatar relates through ${focus}.`
  };
}

function lyricsPayload(track) {
  const text = track.lyrics || "";
  return {
    status: text ? "matched_exact" : "not_found",
    matchScore: text ? 1 : 0,
    sourceKind: text ? "hapa-song-registry" : "missing",
    sourceId: track.lyricMasterId || track.registryTrackId || track.id || "",
    sourceTitle: track.title || "",
    sourceTextType: "lyrics",
    text,
    sha256: text ? crypto.createHash("sha256").update(text).digest("hex") : "",
    candidateMatches: []
  };
}

function mediaPrompts(track, perspective) {
  const avatarName = perspective.avatar_name || perspective.avatarName || "Avatar";
  const stems = (track.stemTypes || []).slice(0, 5).join(", ") || "full mix";
  return [
    {
      id: "song-tarot-cover",
      kind: "tarot-cover",
      prompt: `Create a Dear Papa song tarot image for ${track.title}; ${avatarName} performs the recovered track as soft canon with visible source-path motifs.`
    },
    {
      id: "stem-visualizer",
      kind: "audio-reactive-visualizer",
      prompt: `Build a stem-aware visualizer for ${track.title} using ${stems}; keep the registry track and local files traceable.`
    }
  ];
}

function buildExistingCardQueues(cards) {
  const queues = new Map();
  for (const card of cards) {
    const keys = [card.registryTrackId, card.lineage?.registryTrackId, titleKey(card.title)].filter(Boolean);
    for (const key of keys) {
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key).push(card);
    }
  }
  return queues;
}

function takeExistingCard(track, queues, usedExistingIds) {
  for (const key of [track.registryTrackId, titleKey(track.title)].filter(Boolean)) {
    const queue = queues.get(key) || [];
    while (queue.length) {
      const card = queue.shift();
      if (card?.id && !usedExistingIds.has(card.id)) {
        usedExistingIds.add(card.id);
        return card;
      }
    }
  }
  return null;
}

function mergeSourceAnchors(sourceAnchors, now) {
  const next = [...sourceAnchors];
  if (!next.some((anchor) => anchor.id === "suno-dear-papa-playlist-79")) {
    next.push({
      id: "suno-dear-papa-playlist-79",
      kind: "suno-playlist",
      title: "Dear Papa Suno Playlist",
      url: `https://suno.com/playlist/${PLAYLIST_ID}`,
      path: MANIFEST_PATH,
      confidence: "hard",
      addedAt: now
    });
  }
  return next;
}

function countBy(list, getKey) {
  const counts = new Map();
  for (const item of list) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function titleKey(title) {
  return slugify(String(title || "").replace(/[_-]+/g, " "));
}

function shortId(id = "") {
  return String(id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || crypto.randomBytes(4).toString("hex");
}

function uniqueId(base, used) {
  const clean = base || "id";
  if (!used.has(clean)) return clean;
  let index = 2;
  while (used.has(`${clean}-${index}`)) index += 1;
  return `${clean}-${index}`;
}

function parseTrackNumber(value = "") {
  const match = String(value).match(/\/songs\/(\d+)\s+-\s+/);
  return match ? Number(match[1]) : 0;
}

function first(value) {
  return Array.isArray(value) ? value.find(Boolean) || "" : (value || "");
}

function readTextPathIfAvailable(filePath = "") {
  if (!filePath || !existsSync(filePath)) return "";
  try {
    return String(readFileSync(filePath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
