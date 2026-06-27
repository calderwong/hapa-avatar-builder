#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = path.resolve(".");
const DATA_DIR = path.join(ROOT, "data");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const REPORT_DIR = path.join(DATA_DIR, "song-sync-reports");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";
const SUNO_LIBRARY_ROOT = process.env.HAPA_SUNO_LIBRARY_ROOT || "/Users/calderwong/Desktop/suno-library";
const PLAYLIST_ROOT = process.env.HAPA_DEAR_PAPA_PLAYLIST_ROOT || path.join(SUNO_LIBRARY_ROOT, "playlists", PLAYLIST_ID);
const MANIFEST_PATH = process.env.HAPA_DEAR_PAPA_MANIFEST || path.join(PLAYLIST_ROOT, "manifest.json");
const SCRIPT_NAME = "scripts/sync-dear-papa-lyric-timings.mjs";
const args = new Set(process.argv.slice(2));
const APPLY_MUTATIONS = args.has("--apply") || process.env.HAPA_DEAR_PAPA_TIMINGS_APPLY === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const UPDATED_AT = new Date().toISOString();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeTimingLines(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line, index) => {
      const start = Number(line.start ?? line.startTime ?? line.t0 ?? 0);
      const end = Number(line.end ?? line.endTime ?? line.t1 ?? start);
      const words = Array.isArray(line.words)
        ? line.words.map((word, wordIndex) => ({
            word: String(word.word || word.text || word.token || ""),
            start: Number(word.start ?? word.startTime ?? start),
            end: Number(word.end ?? word.endTime ?? end),
            matched: word.matched ?? undefined,
            index: Number(word.index ?? wordIndex)
          })).filter((word) => word.word)
        : [];
      return {
        id: line.id || `timed-line-${index + 1}`,
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
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

function readTimingForManifestSong(song = {}) {
  const candidates = [
    song.lyricTimingPath,
    song.localDir ? path.join(song.localDir, "lyric-timing.json") : "",
    song.id ? path.join(PLAYLIST_ROOT, "lyric_timings", `${song.id}.json`) : ""
  ].filter(Boolean);
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const timing = readJson(filePath);
    const lines = normalizeTimingLines(timing.lines || []);
    if (!lines.length) continue;
    return {
      registryTrackId: song.id,
      title: song.title || timing.title || "",
      path: filePath,
      sttPath: filePath.replace(/\.json$/, ".stt.json"),
      duration: Number(timing.duration || song.duration || 0),
      confidence: Number(timing.confidence ?? 0),
      stats: timing.stats || {},
      provenance: timing.provenance || {},
      source: timing.source || timing.provenance?.sttInput || "",
      lines
    };
  }
  return null;
}

function registryIdForSong(song = {}) {
  return song.audio?.registryTrackId
    || song.registryTrackId
    || song.lineage?.registryTrackId
    || song.attribution?.songRegistryTrackId
    || "";
}

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`Dear Papa playlist manifest not found: ${MANIFEST_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(HAPA_SONG_STORE_PATH) || !fs.existsSync(SONGBOOK_PATH)) {
  console.error("Expected data/dear-papa-songbook.json and data/hapa-songs-store.json to exist.");
  process.exit(1);
}

const manifest = readJson(MANIFEST_PATH);
const timingByRegistryId = new Map();
for (const song of manifest.songs || []) {
  const timing = readTimingForManifestSong(song);
  if (timing?.registryTrackId) timingByRegistryId.set(timing.registryTrackId, timing);
}

const store = readJson(HAPA_SONG_STORE_PATH);
const songbook = readJson(SONGBOOK_PATH);
let storeUpdated = 0;
let songbookUpdated = 0;
let duplicateExactTimingKeys = 0;
const touched = [];

for (const song of store.songs || []) {
  const registryTrackId = registryIdForSong(song);
  const timing = timingByRegistryId.get(registryTrackId);
  if (!timing) continue;
  const previousCount = Array.isArray(song.lyricTimings) ? song.lyricTimings.length : 0;
  song.lyricTimings = timing.lines;
  song.lyricTimingSource = {
    schemaVersion: "hapa.dear-papa.lyric-timing-source.v1",
    source: SCRIPT_NAME,
    timingSource: "dear-papa-playlist-lyric-timing",
    registryTrackId,
    playlistId: PLAYLIST_ID,
    path: timing.path,
    sttPath: fs.existsSync(timing.sttPath) ? timing.sttPath : "",
    confidence: timing.confidence,
    stats: timing.stats,
    updatedAt: UPDATED_AT
  };
  song.enrichment = {
    ...(song.enrichment || {}),
    timingReviewed: true,
    timingSource: "dear-papa-playlist-lyric-timing"
  };
  song.lineage = {
    ...(song.lineage || {}),
    lyricTimingPath: timing.path,
    lyricTimingRegistryTrackId: registryTrackId
  };
  song.updatedAt = UPDATED_AT;
  storeUpdated++;
  touched.push({
    songId: song.songId || song.id,
    cardId: song.cardId || song.id,
    title: song.title,
    registryTrackId,
    previousCount,
    lineCount: timing.lines.length,
    confidence: timing.confidence
  });
}

const seenTimingKeys = new Set();
for (const card of songbook.songCards || []) {
  const registryTrackId = card.registryTrackId || card.lineage?.registryTrackId || "";
  const timing = timingByRegistryId.get(registryTrackId);
  if (!timing) continue;
  const exactKey = `${registryTrackId}:${timing.path}`;
  if (seenTimingKeys.has(exactKey)) duplicateExactTimingKeys++;
  seenTimingKeys.add(exactKey);
  card.lyrics = {
    ...(card.lyrics || {}),
    timingStatus: "matched_exact",
    timingSource: "dear-papa-playlist-lyric-timing",
    timingPath: timing.path,
    timingLineCount: timing.lines.length,
    timingConfidence: timing.confidence
  };
  card.sync = {
    ...(card.sync || {}),
    lyricTimingPath: timing.path,
    lyricTimingLineCount: timing.lines.length,
    lyricTimingConfidence: timing.confidence,
    updatedAt: UPDATED_AT
  };
  card.updatedAt = UPDATED_AT;
  songbookUpdated++;
}

store.audit = {
  ...(store.audit || {}),
  withTimings: (store.songs || []).filter((song) => (song.lyricTimings || []).length > 0).length,
  lyricTimingSource: "dear-papa-playlist-lyric-timing",
  lyricTimingSyncedAt: UPDATED_AT
};
store.updatedAt = UPDATED_AT;
songbook.sync = {
  ...(songbook.sync || {}),
  lyricTimingSource: "dear-papa-playlist-lyric-timing",
  lyricTimingSyncedAt: UPDATED_AT,
  lyricTimingMatched: songbookUpdated
};
songbook.updatedAt = UPDATED_AT;

const report = {
  schemaVersion: "hapa.dear-papa-lyric-timing-sync-report.v1",
  runId: RUN_ID,
  mode: APPLY_MUTATIONS ? "apply" : "dry-run",
  updatedAt: UPDATED_AT,
  playlistId: PLAYLIST_ID,
  manifestPath: MANIFEST_PATH,
  timingFilesFound: timingByRegistryId.size,
  storeSongsUpdated: storeUpdated,
  songbookCardsUpdated: songbookUpdated,
  duplicateExactTimingKeys,
  touched
};

if (APPLY_MUTATIONS) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(HAPA_SONG_STORE_PATH, path.join(BACKUP_DIR, `hapa-songs-store.before-lyric-timing-sync-${RUN_ID}.json`));
  fs.copyFileSync(SONGBOOK_PATH, path.join(BACKUP_DIR, `dear-papa-songbook.before-lyric-timing-sync-${RUN_ID}.json`));
  writeJson(HAPA_SONG_STORE_PATH, store);
  writeJson(SONGBOOK_PATH, songbook);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  writeJson(path.join(REPORT_DIR, `dear-papa-lyric-timing-sync-${RUN_ID}.json`), report);
  writeJson(path.join(REPORT_DIR, "latest-dear-papa-lyric-timing-sync.json"), report);
} else {
  console.log("Dry run only. Use --apply or HAPA_DEAR_PAPA_TIMINGS_APPLY=1 to write timing sync updates.");
}

console.log(JSON.stringify(report, null, 2));
