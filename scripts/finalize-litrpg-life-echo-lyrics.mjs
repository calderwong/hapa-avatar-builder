#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DATA = path.join(ROOT, "data");
const SONG_ID = "4b9f48b5-3ca9-416e-b88e-75fd223a1dca";
const PROJECT_PATH = path.join(DATA, "music-video-projects", "dear-papa-song-litrpg-life-video-project.json");
const SONG_STORE_PATH = path.join(DATA, "hapa-songs-store.json");
const APPLY = process.argv.includes("--apply");
if (!fs.existsSync(PROJECT_PATH)) throw new Error(`Project not found: ${PROJECT_PATH}`);
const store = JSON.parse(fs.readFileSync(SONG_STORE_PATH, "utf8"));
const song = (store.songs || []).find((item) => item.audio?.registryTrackId === SONG_ID);
if (!song?.lyrics?.text) throw new Error("LitRPG Life source lyrics are not registered");
const payload = JSON.parse(fs.readFileSync(PROJECT_PATH, "utf8"));
const project = payload.music_video_project || payload;
const now = new Date().toISOString();
const nextLyrics = {
  ...song.lyrics,
  sourceText: song.lyrics.text,
  enabled: true,
  timingStatus: "source-captured-alignment-pending",
};
const report = {
  ok: true,
  mode: APPLY ? "apply" : "dry-run",
  project: PROJECT_PATH,
  previousTimedLines: Array.isArray(project.timed_lyrics) ? project.timed_lyrics.length : 0,
  sourceWords: song.lyrics.text.split(/\s+/).filter(Boolean).length,
  action: "Remove generated uniform timing; retain source-backed lyrics pending measured alignment.",
};
if (APPLY) {
  const backupDir = path.join(DATA, "backups", `litrpg-life-project-before-lyric-finalize-${now.replace(/[:.]/g, "-")}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(PROJECT_PATH, path.join(backupDir, path.basename(PROJECT_PATH)));
  project.lyrics = nextLyrics;
  project.lyric_source = { sourceKind: "suno-visible-lyrics", sourceId: SONG_ID, sourceUrl: song.lyrics.sourceUrl, sourcePath: song.lyrics.sourcePath, sha256: song.lyrics.sha256, capturedAt: song.lyrics.capturedAt || now };
  project.timed_lyrics = [];
  project.lyric_timing_heal = { ...(project.lyric_timing_heal || {}), source: "scripts/finalize-litrpg-life-echo-lyrics.mjs", strategy: "suno-visible-lyrics-capture", timingSource: "alignment-pending", generatedAt: now, lineCount: 0 };
  project.updated_at = now;
  fs.writeFileSync(PROJECT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
