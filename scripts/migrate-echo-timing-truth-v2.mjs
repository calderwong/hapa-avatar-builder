#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROJECTS_DIR = path.join(ROOT, "data/music-video-projects");
const REPORT_DIR = path.join(ROOT, "artifacts/echo-director-v2");
const APPLY = process.argv.includes("--apply");
const MIGRATION_ID = "hapa.echo.timing-truth-migration.v2";
const EXACT_SOURCE = "dear-papa-playlist-lyric-timing";
const INFERRED_SOURCE = "synthetic-weighted-lyric-heal";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isMissingPathExactClaim(project) {
  const provenance = project.song_edit_map?.provenance || {};
  const heal = project.lyric_timing_heal || {};
  const exact = provenance.lyricTimingSource === EXACT_SOURCE
    || heal.timingSource === EXACT_SOURCE
    || String(provenance.lyricTimingStrategy || "").includes("exact")
    || String(heal.strategy || "").includes("exact");
  return exact && !String(provenance.lyricTimingPath || heal.timingPath || "").trim();
}

function migratedPayload(payload, now) {
  const project = structuredClone(payload.music_video_project);
  const registryTrackId = String(project.registry_track_id || project.audio_id || "");
  const previous = {
    lyricTimingSource: project.song_edit_map?.provenance?.lyricTimingSource || "",
    lyricTimingStrategy: project.song_edit_map?.provenance?.lyricTimingStrategy || "",
    lyricTimingPath: project.song_edit_map?.provenance?.lyricTimingPath || "",
    healTimingSource: project.lyric_timing_heal?.timingSource || "",
    healStrategy: project.lyric_timing_heal?.strategy || "",
  };
  const rejection = {
    reason: "missing-timing-source-path",
    rejectedClaim: "exact-registry-track-lyric-timing",
    sourceRegistryTrackId: registryTrackId,
  };
  project.song_edit_map.provenance = {
    ...project.song_edit_map.provenance,
    lyricSource: INFERRED_SOURCE,
    lyricTimingSource: INFERRED_SOURCE,
    lyricTimingStrategy: "weighted-phrase-split-full-song-arc",
    lyricTimingPath: "",
    lyricTimingRejectedExact: rejection,
    confidence: "registry_audio_stems_inferred_lyric_projection",
  };
  project.song_edit_map.audioTelemetry = {
    ...project.song_edit_map.audioTelemetry,
    lyricTimingSource: INFERRED_SOURCE,
    lyricTimingPath: "",
    lyricTimingConfidence: 0.8,
  };
  project.song_edit_map.timedLyrics = (project.song_edit_map.timedLyrics || []).map((line) => ({
    ...line,
    timing_source: INFERRED_SOURCE,
  }));
  project.song_edit_map.vocalDensity = (project.song_edit_map.vocalDensity || []).map((window) => ({
    ...window,
    source: INFERRED_SOURCE,
  }));
  if (project.song_edit_map.energyCurves) project.song_edit_map.energyCurves.source = INFERRED_SOURCE;
  project.timed_lyrics = (project.timed_lyrics || []).map((line) => ({
    ...line,
    timing_source: INFERRED_SOURCE,
  }));
  project.lyric_timing_heal = {
    ...project.lyric_timing_heal,
    source: "scripts/migrate-echo-timing-truth-v2.mjs",
    strategy: "weighted-phrase-split-full-song-arc",
    timingSource: INFERRED_SOURCE,
    timingPath: "",
    timingConfidence: 0.8,
    truthStatus: "usable_inferred_missing_path",
    rejectedExactTiming: rejection,
    migratedAt: now,
  };
  project.lyric_timing_truth = {
    schemaVersion: "hapa.echo.timing-truth.v2",
    status: "usable_inferred_missing_path",
    claim: "inferred-projection",
    source: INFERRED_SOURCE,
    sourcePath: "",
    registryTrackId,
    warnings: ["source-sidecar-unavailable", "do-not-label-exact"],
    migration: {
      id: MIGRATION_ID,
      previous,
      migratedAt: now,
    },
  };
  project.updated_at = now;
  return { ...payload, music_video_project: project };
}

const files = fs.readdirSync(PROJECTS_DIR).filter((name) => name.endsWith(".json")).sort();
const candidates = files.flatMap((name) => {
  const filePath = path.join(PROJECTS_DIR, name);
  const payload = readJson(filePath);
  return isMissingPathExactClaim(payload.music_video_project || {}) ? [{ name, filePath, payload }] : [];
});
const now = new Date().toISOString();
let backupDir = "";
if (APPLY && candidates.length) {
  const stamp = now.replaceAll(":", "-").replace(".", "-");
  backupDir = path.join(ROOT, "data/backups", `echo-timing-truth-v2-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const candidate of candidates) {
    fs.copyFileSync(candidate.filePath, path.join(backupDir, candidate.name));
    fs.writeFileSync(candidate.filePath, `${JSON.stringify(migratedPayload(candidate.payload, now), null, 2)}\n`);
  }
}

const report = {
  schemaVersion: MIGRATION_ID,
  mode: APPLY ? "apply" : "dry-run",
  generatedAt: now,
  candidateCount: candidates.length,
  changedCount: APPLY ? candidates.length : 0,
  backupDir,
  invariant: "No exact timing claim may survive without a source sidecar path.",
  files: candidates.map(({ name, payload }) => ({
    name,
    songId: payload.music_video_project.song_id,
    registryTrackId: payload.music_video_project.registry_track_id || payload.music_video_project.audio_id || "",
    action: "downgrade-to-usable-inferred-missing-path",
  })),
};
fs.mkdirSync(REPORT_DIR, { recursive: true });
const reportPath = path.join(REPORT_DIR, `timing-truth-migration-${APPLY ? "apply" : "dry-run"}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
