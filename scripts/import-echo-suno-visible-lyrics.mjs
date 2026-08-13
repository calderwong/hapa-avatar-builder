#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const DATA_DIR = path.join(ROOT, "data");
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const SOURCE_DIR = path.join(DATA_DIR, "lyrics", "suno-visible");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const REPORT_DIR = path.join(DATA_DIR, "song-sync-reports");
const IMPORT_PATH = process.env.HAPA_ECHO_SUNO_LYRICS_IMPORT
  || "/private/tmp/hapa-echo-suno-lyrics-2026-08-11.json";
const APPLY = process.argv.includes("--apply");
const NOW = new Date().toISOString();
const RUN_ID = NOW.replace(/[:.]/g, "-");

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function registryIdForSong(song = {}) {
  return String(song.audio?.registryTrackId || song.registryTrackId || song.lineage?.registryTrackId || "");
}

if (!fs.existsSync(IMPORT_PATH)) throw new Error(`Visible-Suno lyrics import not found: ${IMPORT_PATH}`);
const captured = readJson(IMPORT_PATH);
const entries = Object.entries(captured.songs || {}).map(([id, entry]) => {
  const lyrics = text(entry?.lyrics);
  const title = text(entry?.title);
  if (!id || !title || lyrics.split(/\s+/u).filter(Boolean).length < 10) {
    throw new Error(`Invalid visible-Suno lyric capture for ${id || "unnamed song"}`);
  }
  return { id, title, lyrics, sourceUrl: text(entry?.sunoUrl) || `https://suno.com/song/${id}`, sha256: sha256(lyrics) };
});
const captureById = new Map(entries.map((entry) => [entry.id, entry]));

const store = readJson(SONG_STORE_PATH);
const songbook = readJson(SONGBOOK_PATH);
const projectRows = fs.readdirSync(PROJECTS_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, filePath: path.join(PROJECTS_DIR, name), payload: readJson(path.join(PROJECTS_DIR, name)) }));

const sourceRecords = [];
for (const entry of entries) {
  const sourcePath = path.join(SOURCE_DIR, `${entry.id}.txt`);
  sourceRecords.push({ ...entry, sourcePath });
}
const sourceById = new Map(sourceRecords.map((entry) => [entry.id, entry]));

const report = { schemaVersion: "hapa.echo.suno-visible-lyrics-import.v1", mode: APPLY ? "apply" : "dry-run", generatedAt: NOW, importPath: IMPORT_PATH, capturedAt: captured.capturedAt || "", tracks: [] };

for (const entry of sourceRecords) {
  const storeMatches = (store.songs || []).filter((song) => registryIdForSong(song) === entry.id);
  const cardMatches = (songbook.songCards || []).filter((card) => String(card.registryTrackId || card.lineage?.registryTrackId || "") === entry.id);
  const projectMatches = projectRows.filter(({ payload }) => {
    const project = payload.music_video_project || payload;
    return String(project.registry_track_id || project.audio_id || "") === entry.id
      || storeMatches.some((song) => [song.id, song.songId, song.cardId].includes(project.song_id));
  });
  if (storeMatches.length !== 1 || cardMatches.length !== 1 || projectMatches.length !== 1) {
    throw new Error(`Expected one Registry song, Songbook card, and Director project for ${entry.title}; found ${storeMatches.length}/${cardMatches.length}/${projectMatches.length}.`);
  }
  const source = {
    status: "available",
    text: entry.lyrics,
    sha256: entry.sha256,
    sourceKind: "suno-visible-lyrics",
    sourceId: entry.id,
    sourceTitle: entry.title,
    sourceTextType: "lyrics",
    sourcePath: entry.sourcePath,
    sourceUrl: entry.sourceUrl,
    capturedAt: captured.capturedAt || NOW,
    timingStatus: "source-captured-alignment-pending",
    candidateMatches: [],
  };
  const song = storeMatches[0];
  song.lyrics = { ...(song.lyrics || {}), ...source };
  song.lineage = { ...(song.lineage || {}), lyricsSourceId: entry.id, lyricsSourcePath: entry.sourcePath, lyricsSha256: entry.sha256 };
  song.updatedAt = NOW;
  const card = cardMatches[0];
  card.lyrics = { ...(card.lyrics || {}), ...source };
  card.lineage = { ...(card.lineage || {}), lyricsSourceId: entry.id, lyricsSourcePath: entry.sourcePath, lyricsSha256: entry.sha256 };
  card.updatedAt = NOW;
  const projectRow = projectMatches[0];
  const project = projectRow.payload.music_video_project || projectRow.payload;
  project.lyrics = { ...(project.lyrics || {}), enabled: project.lyrics?.enabled !== false, ...source };
  project.lyric_source = source;
  project.lyric_timing_heal = { ...(project.lyric_timing_heal || {}), source: "scripts/import-echo-suno-visible-lyrics.mjs", strategy: "suno-visible-lyrics-capture", timingSource: "alignment-pending", sourcePath: entry.sourcePath, sourceUrl: entry.sourceUrl, sourceTextSha256: entry.sha256, generatedAt: NOW, lineCount: Array.isArray(project.timed_lyrics) ? project.timed_lyrics.length : 0 };
  project.updated_at = NOW;
  report.tracks.push({ id: entry.id, title: entry.title, wordCount: entry.lyrics.split(/\s+/u).filter(Boolean).length, sourcePath: entry.sourcePath, sourceUrl: entry.sourceUrl, songId: project.song_id, projectFile: projectRow.name });
}
report.count = report.tracks.length;

if (APPLY) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.copyFileSync(SONG_STORE_PATH, path.join(BACKUP_DIR, `hapa-songs-store.before-suno-visible-lyrics-${RUN_ID}.json`));
  fs.copyFileSync(SONGBOOK_PATH, path.join(BACKUP_DIR, `dear-papa-songbook.before-suno-visible-lyrics-${RUN_ID}.json`));
  const projectBackupDir = path.join(BACKUP_DIR, `music-video-projects.before-suno-visible-lyrics-${RUN_ID}`);
  fs.mkdirSync(projectBackupDir, { recursive: true });
  for (const row of projectRows.filter(({ payload }) => {
    const project = payload.music_video_project || payload;
    return [...sourceById.keys()].includes(String(project.registry_track_id || project.audio_id || "")) || report.tracks.some((track) => track.songId === project.song_id);
  })) fs.copyFileSync(row.filePath, path.join(projectBackupDir, row.name));
  for (const entry of sourceRecords) fs.writeFileSync(entry.sourcePath, `${entry.lyrics}\n`, "utf8");
  writeJson(SONG_STORE_PATH, store);
  writeJson(SONGBOOK_PATH, songbook);
  for (const row of projectRows.filter(({ payload }) => report.tracks.some((track) => track.songId === (payload.music_video_project || payload).song_id))) writeJson(row.filePath, row.payload);
  writeJson(path.join(REPORT_DIR, `echo-suno-visible-lyrics-import-${RUN_ID}.json`), report);
  writeJson(path.join(REPORT_DIR, "latest-echo-suno-visible-lyrics-import.json"), report);
}

process.stdout.write(`${JSON.stringify({ ok: true, mode: report.mode, count: report.count, tracks: report.tracks.map(({ title, wordCount }) => ({ title, wordCount })) }, null, 2)}\n`);
