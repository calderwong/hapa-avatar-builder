#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE,
  evaluateEchoLyricTimingPromotion,
} from "../src/domain/echo-lyric-promotion.js";

const ROOT = path.resolve(".");
const DATA_DIR = path.join(ROOT, "data");
const PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "903148b6-5709-4511-9cfd-d34b23799da6";
const SUNO_LIBRARY_ROOT = process.env.HAPA_SUNO_LIBRARY_ROOT || "/Users/calderwong/Desktop/suno-library";
const PLAYLIST_ROOT = process.env.HAPA_DEAR_PAPA_PLAYLIST_ROOT || path.join(SUNO_LIBRARY_ROOT, "playlists", PLAYLIST_ID);
const GENERATED_DIR = process.env.HAPA_ECHO_GENERATED_TIMINGS_DIR
  || path.join(ROOT, "artifacts", "echo-lyric-quality-v4", "generated-timings");
const PROGRESS_PATH = path.join(GENERATED_DIR, "timing-run-progress.json");
const DESTINATION_DIR = path.join(PLAYLIST_ROOT, "lyric_timings");
const REPORT_DIR = path.join(DATA_DIR, "song-sync-reports");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const requestedIds = new Set(
  [...args]
    .filter((arg) => arg.startsWith("--registry-track-ids="))
    .flatMap((arg) => arg.slice("--registry-track-ids=".length).split(","))
    .map((id) => id.trim())
    .filter(Boolean),
);
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

if (!fs.existsSync(PROGRESS_PATH)) {
  throw new Error(`Generated timing progress is missing: ${PROGRESS_PATH}`);
}
const progress = readJson(PROGRESS_PATH);
const results = Array.isArray(progress.results) ? progress.results : [];
const candidates = results.filter((result) => !requestedIds.size || requestedIds.has(String(result.songId || result.song_id || result.id || "")));
const published = [];
const rejected = [];
for (const result of candidates) {
  const registryTrackId = String(result.songId || result.song_id || result.id || "");
  const timingPath = path.join(GENERATED_DIR, `${registryTrackId}.json`);
  const sttPath = path.join(GENERATED_DIR, `${registryTrackId}.stt.json`);
  if (!registryTrackId || !fs.existsSync(timingPath)) {
    rejected.push({ registryTrackId, title: result.title || "", reasons: ["generated-timing-missing"] });
    continue;
  }
  const timing = readJson(timingPath);
  const promotion = evaluateEchoLyricTimingPromotion(timing, {
    minimumConfidence: DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE,
    sourcePathExists: true,
    sttPathExists: fs.existsSync(sttPath),
  });
  if (!promotion.accepted) {
    rejected.push({ registryTrackId, title: result.title || timing.title || "", confidence: timing.confidence, reasons: promotion.reasons });
    continue;
  }
  published.push({ registryTrackId, title: result.title || timing.title || "", confidence: timing.confidence, timingPath, sttPath });
}

const report = {
  schemaVersion: "hapa.echo.generated-lyric-timing-publish-report.v1",
  runId: RUN_ID,
  mode: APPLY ? "apply" : "dry-run",
  generatedDirectory: GENERATED_DIR,
  destinationDirectory: DESTINATION_DIR,
  requestedRegistryTrackIds: [...requestedIds],
  candidateCount: candidates.length,
  published,
  rejected,
};

if (APPLY) {
  fs.mkdirSync(DESTINATION_DIR, { recursive: true });
  const backupRoot = path.join(BACKUP_DIR, `echo-generated-lyric-timings.before-publish-${RUN_ID}`);
  for (const item of published) {
    for (const sourcePath of [item.timingPath, item.sttPath]) {
      const destinationPath = path.join(DESTINATION_DIR, path.basename(sourcePath));
      if (fs.existsSync(destinationPath)) {
        fs.mkdirSync(backupRoot, { recursive: true });
        fs.copyFileSync(destinationPath, path.join(backupRoot, path.basename(destinationPath)));
      }
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  writeJson(path.join(REPORT_DIR, `echo-generated-lyric-timing-publish-${RUN_ID}.json`), report);
  writeJson(path.join(REPORT_DIR, "latest-echo-generated-lyric-timing-publish.json"), report);
}

console.log(JSON.stringify(report, null, 2));
