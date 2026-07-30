#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const BASELINE_PATH = path.join(ROOT, "artifacts/echo-lyric-quality-v4/baseline.json");
const SONG_STORE_PATH = path.join(ROOT, "data/hapa-songs-store.json");
const OUTPUT_DIR = path.join(ROOT, "artifacts/echo-lyric-quality-v4");
const SOURCE_DIR = path.join(OUTPUT_DIR, "canonical-sources");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "alignment-manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function registryIdForSong(song = {}) {
  return String(song.audio?.registryTrackId || song.registryTrackId || song.lineage?.registryTrackId || "");
}

function embeddedLyrics(song = {}) {
  return typeof song.lyrics === "string"
    ? song.lyrics
    : String(song.lyrics?.text || song.lyricText || "");
}

if (!fs.existsSync(BASELINE_PATH)) throw new Error(`lyric baseline not found: ${BASELINE_PATH}`);
fs.mkdirSync(SOURCE_DIR, { recursive: true });

const baseline = readJson(BASELINE_PATH);
const store = readJson(SONG_STORE_PATH);
const songById = new Map();
for (const song of store.songs || []) {
  for (const id of [song.id, song.songId, song.cardId, registryIdForSong(song)].filter(Boolean)) {
    songById.set(String(id), song);
  }
}

const seen = new Set();
const songs = [];
for (const project of baseline.projects || []) {
  const id = String(project.registryTrackId || "");
  if (!id || seen.has(id) || project.sourceDeclaration?.instrumental) continue;
  seen.add(id);
  const song = songById.get(project.songId) || songById.get(id) || {};
  let lyricsPath = String(
    project.canonicalText?.kind === "measured-performance-variant"
      ? project.canonicalText?.sourceReference?.path || ""
      : project.canonicalText?.path || "",
  );
  if (!lyricsPath || !fs.existsSync(lyricsPath)) {
    const lyrics = embeddedLyrics(song).trim();
    if (!lyrics) continue;
    lyricsPath = path.join(SOURCE_DIR, `${id.replace(/[^A-Za-z0-9._-]+/gu, "-")}.txt`);
    fs.writeFileSync(lyricsPath, `${lyrics}\n`, "utf8");
  }
  const masterPath = String(song.audio?.localPath || "");
  const fallbackPath = String(project.alignmentSource?.path || "");
  const songPath = masterPath && fs.existsSync(masterPath) ? masterPath : fallbackPath;
  if (!songPath || !fs.existsSync(songPath)) continue;
  const stems = (song.stems || [])
    .map((stem) => ({
      stemType: String(stem.stemType || stem.kind || stem.type || stem.label || ""),
      localPath: String(stem.localPath || stem.path || ""),
    }))
    .filter((stem) => stem.stemType && stem.localPath && fs.existsSync(stem.localPath));
  songs.push({
    id,
    index: songs.length + 1,
    title: project.title,
    duration: Number(project.durationSeconds || 0),
    lyricsPath,
    songPath,
    stems,
    localDir: "",
    sourceCollection: "echo-album-director-projects",
    sourceProjectId: project.songId,
    sourceProjectFile: project.file,
    playlistMember: false,
  });
}

const manifest = {
  schema: "hapa.echo.lyric-alignment-manifest.v1",
  generatedAt: new Date().toISOString(),
  mutationMode: "generated-read-only-source-projection",
  playlist: {
    id: "echo-album-director-projects",
    name: "Echo Album Director Projects",
  },
  songs,
  counts: {
    sourceProjects: Number(baseline.summary?.projects || 0),
    uniqueVocalSongs: songs.length,
  },
};
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  sourceDir: SOURCE_DIR,
  uniqueVocalSongs: songs.length,
}, null, 2)}\n`);
