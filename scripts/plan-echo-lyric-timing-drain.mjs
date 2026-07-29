#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { evaluateEchoLyricTimingPromotion } from "../src/domain/echo-lyric-promotion.js";
import { classifyEchoLyricDrainQueue } from "../src/domain/echo-lyric-drain-plan.js";

const ROOT = path.resolve(".");
const BASELINE_PATH = process.env.HAPA_ECHO_LYRIC_BASELINE
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/baseline.json");
const OUTPUT_PATH = process.env.HAPA_ECHO_LYRIC_DRAIN_PLAN
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/drain-plan.json");
const PLAYLIST_ROOT = process.env.HAPA_DEAR_PAPA_PLAYLIST_ROOT
  || "/Users/calderwong/Desktop/suno-library/playlists/903148b6-5709-4511-9cfd-d34b23799da6";
const MANIFEST_PATH = process.env.HAPA_DEAR_PAPA_MANIFEST
  || path.join(PLAYLIST_ROOT, "manifest.hapa-avatar-builder.json");

function argument(name, fallback = "") {
  const token = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(token));
  return match ? match.slice(token.length) : fallback;
}

if (!fs.existsSync(BASELINE_PATH)) {
  throw new Error(`lyric baseline not found: ${BASELINE_PATH}`);
}

const cohort = argument("cohort", "recent");
const action = argument("action", "align");
const limit = Math.max(0, Number(argument("limit", "0")) || 0);
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const manifest = fs.existsSync(MANIFEST_PATH)
  ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))
  : { songs: [] };
const manifestById = new Map((manifest.songs || []).map((song) => [String(song.id || ""), song]));
const seen = new Set();
const queue = (baseline.projects || [])
  .filter((project) => cohort === "all" || project.recent)
  .filter((project) => !project.sourceDeclaration?.instrumental)
  .filter((project) => project.status !== "verified")
  .filter((project) => project.registryTrackId)
  .filter((project) => {
    if (seen.has(project.registryTrackId)) return false;
    seen.add(project.registryTrackId);
    return true;
  })
  .map((project) => {
    const manifestSong = manifestById.get(project.registryTrackId) || null;
    const timingPath = path.join(PLAYLIST_ROOT, "lyric_timings", `${project.registryTrackId}.json`);
    const sttPath = path.join(PLAYLIST_ROOT, "lyric_timings", `${project.registryTrackId}.stt.json`);
    const timingFound = fs.existsSync(timingPath);
    let timingParsed = false;
    let promotion = null;
    if (timingFound) {
      try {
        const timing = JSON.parse(fs.readFileSync(timingPath, "utf8"));
        timingParsed = true;
        promotion = evaluateEchoLyricTimingPromotion(timing, {
          sourcePathExists: true,
          sttPathExists: fs.existsSync(sttPath),
        });
      } catch {}
    }
    const queueKind = classifyEchoLyricDrainQueue({
      manifestSongFound: Boolean(manifestSong),
      issues: project.issues,
      timingFound,
      timingParsed,
      promotionAccepted: Boolean(promotion?.accepted),
    });
    return {
      registryTrackId: project.registryTrackId,
      songId: project.songId,
      title: project.title,
      recent: project.recent,
      priorityScore: project.priorityScore,
      issues: project.issues,
      alignmentSource: project.alignmentSource,
      manifestSongFound: Boolean(manifestSong),
      queueKind,
      timingPath: fs.existsSync(timingPath) ? timingPath : "",
      promotion,
    };
  });
const actionable = action === "all" ? queue : queue.filter((row) => row.queueKind === action);
const selected = limit ? actionable.slice(0, limit) : actionable;
const plan = {
  schemaVersion: "hapa.echo.lyric-timing-drain-plan.v1",
  mutationMode: "read-only",
  generatedAt: new Date().toISOString(),
  cohort,
  action,
  pendingUniqueTracks: queue.length,
  queueCounts: Object.fromEntries(
    [...queue.reduce((counts, row) => counts.set(row.queueKind, (counts.get(row.queueKind) || 0) + 1), new Map())].sort(),
  ),
  actionableTracks: actionable.length,
  selectedTracks: selected.length,
  registryTrackIds: selected.map((row) => row.registryTrackId),
  rows: selected,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(plan, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  cohort,
  action,
  pendingUniqueTracks: plan.pendingUniqueTracks,
  queueCounts: plan.queueCounts,
  actionableTracks: plan.actionableTracks,
  selectedTracks: plan.selectedTracks,
  registryTrackIds: plan.registryTrackIds,
}, null, 2)}\n`);
