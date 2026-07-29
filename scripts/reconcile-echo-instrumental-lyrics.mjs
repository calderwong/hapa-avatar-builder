#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { attachEchoLyricContract } from "../src/domain/echo-lyric-contract.js";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";
import { isSourceDeclaredInstrumental } from "../src/domain/echo-lyric-quality.js";

const ROOT = path.resolve(".");
const PROJECTS_DIR = path.join(ROOT, "data/music-video-projects");
const BACKUPS_DIR = path.join(ROOT, "data/backups");
const REPORTS_DIR = path.join(ROOT, "data/merge-reports");
const MANIFEST_PATH = process.env.HAPA_DEAR_PAPA_MANIFEST
  || "/Users/calderwong/Desktop/suno-library/playlists/903148b6-5709-4511-9cfd-d34b23799da6/manifest.hapa-avatar-builder.json";
const APPLY = process.argv.includes("--apply");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function projectBody(payload) {
  return payload?.music_video_project || payload?.project || payload || {};
}

function replaceProjectBody(payload, project) {
  if (payload?.music_video_project) return { ...payload, music_video_project: project };
  if (payload?.project) return { ...payload, project };
  return project;
}

function sourceMetadata(manifestSong = {}) {
  const metadataPath = String(manifestSong.metadataPath || "");
  if (!metadataPath || !fs.existsSync(metadataPath)) return {};
  try {
    return readJson(metadataPath);
  } catch {
    return {};
  }
}

if (!fs.existsSync(MANIFEST_PATH)) {
  throw new Error(`playlist manifest not found: ${MANIFEST_PATH}`);
}

const manifest = readJson(MANIFEST_PATH);
const instrumentalByRegistryId = new Map(
  (manifest.songs || [])
    .filter((song) => isSourceDeclaredInstrumental(sourceMetadata(song)))
    .map((song) => [String(song.id || ""), song]),
);
const planned = [];

for (const file of fs.readdirSync(PROJECTS_DIR).filter((name) => name.endsWith(".json")).sort()) {
  const filePath = path.join(PROJECTS_DIR, file);
  const payload = readJson(filePath);
  const project = projectBody(payload);
  const registryTrackId = String(project.registry_track_id || project.audio_id || "");
  const manifestSong = instrumentalByRegistryId.get(registryTrackId);
  if (!manifestSong) continue;
  const normalized = attachEchoLyricContract({
    ...project,
    lyrics: {
      ...(project.lyrics || {}),
      enabled: false,
      disabledReason: "source-declared-instrumental",
      sourceDeclarationPath: String(manifestSong.metadataPath || ""),
    },
    lyrics_enabled: false,
  });
  normalized.timed_lyrics = [];
  if (normalized.song_edit_map) normalized.song_edit_map.timedLyrics = [];
  normalized.hyperframe_script = generateEchoHyperframeScript(normalized);
  normalized.hyperframe_script_stale = false;
  const nextPayload = replaceProjectBody(payload, normalized);
  planned.push({
    file,
    filePath,
    registryTrackId,
    title: String(project.song_title || manifestSong.title || ""),
    changed: JSON.stringify(payload) !== JSON.stringify(nextPayload),
    nextPayload,
  });
}

const changed = planned.filter((row) => row.changed);
const report = {
  schemaVersion: "hapa.echo.instrumental-lyric-reconciliation.v1",
  mutationMode: APPLY ? "apply" : "dry-run",
  runId: RUN_ID,
  manifestPath: MANIFEST_PATH,
  sourceDeclaredInstrumentals: instrumentalByRegistryId.size,
  matchedProjects: planned.length,
  changedProjects: changed.length,
  rows: planned.map(({ filePath, nextPayload, ...row }) => row),
};

if (APPLY && changed.length) {
  const backupDir = path.join(BACKUPS_DIR, `echo-instrumental-lyrics-${RUN_ID}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const row of changed) {
    fs.copyFileSync(row.filePath, path.join(backupDir, row.file));
    fs.writeFileSync(row.filePath, `${JSON.stringify(row.nextPayload, null, 2)}\n`);
  }
  report.backupDir = backupDir;
}

fs.mkdirSync(REPORTS_DIR, { recursive: true });
const reportPath = path.join(REPORTS_DIR, `echo-instrumental-lyrics-${RUN_ID}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  ok: true,
  reportPath,
  mutationMode: report.mutationMode,
  sourceDeclaredInstrumentals: report.sourceDeclaredInstrumentals,
  matchedProjects: report.matchedProjects,
  changedProjects: report.changedProjects,
  backupDir: report.backupDir || "",
}, null, 2)}\n`);
