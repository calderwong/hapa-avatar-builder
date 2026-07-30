#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  createEchoLyricTimingAdjudication,
  evaluateEchoLyricTimingPromotion,
} from "../src/domain/echo-lyric-promotion.js";

const ROOT = path.resolve(".");
const CANDIDATE_DIR = process.env.HAPA_ECHO_LYRIC_CANDIDATE_DIR
  || "/Users/calderwong/Documents/Codex/2026-07-28/can/903148b6-5709-4511-9cfd-d34b23799da6/lyric_timing_candidates/full-mix";
const PLAYLIST_ROOT = path.dirname(path.dirname(CANDIDATE_DIR));
const DESTINATION_DIR = process.env.HAPA_ECHO_LYRIC_TIMING_DESTINATION
  || path.join(PLAYLIST_ROOT, "lyric_timings");
const OUTPUT_PATH = process.env.HAPA_ECHO_LYRIC_CANDIDATE_REPORT
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/candidate-promotion-report.json");
const APPLY = process.argv.includes("--apply");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function promotionFor(timing, timingPath) {
  return evaluateEchoLyricTimingPromotion(timing, {
    sourcePathExists: fs.existsSync(timingPath),
    sttPathExists: fs.existsSync(timingPath.replace(/\.json$/i, ".stt.json")),
  });
}

if (!fs.existsSync(CANDIDATE_DIR)) throw new Error(`candidate directory not found: ${CANDIDATE_DIR}`);
fs.mkdirSync(DESTINATION_DIR, { recursive: true });
const rows = [];

for (const file of fs.readdirSync(CANDIDATE_DIR).filter((value) => (
  value.endsWith(".json")
  && !value.endsWith(".stt.json")
  && !["manifest.json", "timing-run-progress.json"].includes(value)
)).sort()) {
  const candidatePath = path.join(CANDIDATE_DIR, file);
  const candidateSttPath = candidatePath.replace(/\.json$/i, ".stt.json");
  const destinationPath = path.join(DESTINATION_DIR, file);
  const destinationSttPath = destinationPath.replace(/\.json$/i, ".stt.json");
  const candidate = readJson(candidatePath);
  let promotion = promotionFor(candidate, candidatePath);
  let route = "automatic";
  if (!promotion.accepted) {
    const adjudication = createEchoLyricTimingAdjudication(candidate);
    if (adjudication) {
      candidate.adjudication = adjudication;
      promotion = promotionFor(candidate, candidatePath);
      route = "evidence-adjudication";
    }
  }
  let existingPromotion = null;
  let existingConfidence = 0;
  if (fs.existsSync(destinationPath)) {
    const existing = readJson(destinationPath);
    existingPromotion = promotionFor(existing, destinationPath);
    existingConfidence = Number(existing.confidence || 0);
  }
  const candidateConfidence = Number(candidate.confidence || 0);
  const betterThanExisting = !existingPromotion?.accepted || candidateConfidence > existingConfidence;
  const selected = promotion.accepted && betterThanExisting;
  if (APPLY && selected) {
    fs.writeFileSync(destinationPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    fs.copyFileSync(candidateSttPath, destinationSttPath);
  }
  rows.push({
    registryTrackId: String(candidate.songId || path.basename(file, ".json")),
    title: String(candidate.title || ""),
    candidatePath,
    destinationPath,
    route: promotion.accepted ? route : "rejected",
    selected,
    applied: Boolean(APPLY && selected),
    confidence: candidateConfidence,
    matchedRatio: Number(candidate.stats?.matchedRatio || 0),
    warnings: candidate.warnings || [],
    reasons: promotion.reasons,
    existingConfidence,
  });
}

const report = {
  schemaVersion: "hapa.echo.lyric-timing-candidate-promotion.v1",
  mutationMode: APPLY ? "apply" : "read-only",
  generatedAt: new Date().toISOString(),
  candidateDir: CANDIDATE_DIR,
  destinationDir: DESTINATION_DIR,
  inspected: rows.length,
  selected: rows.filter((row) => row.selected).length,
  applied: rows.filter((row) => row.applied).length,
  rows,
};
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  mutationMode: report.mutationMode,
  inspected: report.inspected,
  selected: report.selected,
  applied: report.applied,
  selectedTitles: rows.filter((row) => row.selected).map((row) => `${row.title} (${row.route})`),
}, null, 2)}\n`);
