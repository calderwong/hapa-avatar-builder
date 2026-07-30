#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { repairEchoLyricTimingDefects } from "../src/domain/echo-lyric-timing-repair.js";

const ROOT = path.resolve(".");
const PLAN_PATH = process.env.HAPA_ECHO_LYRIC_DRAIN_PLAN
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/drain-plan.json");
const OUTPUT_PATH = process.env.HAPA_ECHO_LYRIC_REPAIR_REPORT
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/timing-repair-report.json");
const APPLY = process.argv.includes("--apply");
const SONG_IDS = new Set(process.argv
  .filter((value) => value.startsWith("--song-id="))
  .map((value) => value.slice("--song-id=".length))
  .filter(Boolean));

if (!fs.existsSync(PLAN_PATH)) throw new Error(`lyric drain plan not found: ${PLAN_PATH}`);
const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
const results = [];

for (const row of plan.rows || []) {
  if (SONG_IDS.size && !SONG_IDS.has(String(row.registryTrackId || ""))) continue;
  const timingPath = String(row.timingPath || "");
  if (!timingPath || !fs.existsSync(timingPath)) continue;
  const timing = JSON.parse(fs.readFileSync(timingPath, "utf8"));
  const repair = repairEchoLyricTimingDefects(timing);
  if (APPLY && repair.changed && repair.unrepairableWordIntervals === 0) {
    Object.assign(timing, repair.timing);
    delete timing.adjudication;
    timing.repair = {
      schemaVersion: "hapa.echo.lyric-timing-safe-repair.v1",
      strategy: "repair-nonpositive-word-intervals-and-trim-out-of-audio-words",
      repairedWordIntervals: repair.repairedWordIntervals,
      trimmedLines: repair.trimmedLines,
      trimmedWords: repair.trimmedWords,
      droppedLines: repair.droppedLines,
      repairedAt: new Date().toISOString(),
    };
    fs.writeFileSync(timingPath, `${JSON.stringify(timing, null, 2)}\n`, "utf8");
  }
  results.push({
    registryTrackId: row.registryTrackId,
    title: row.title,
    timingPath,
    changed: repair.changed,
    applied: Boolean(APPLY && repair.changed && repair.unrepairableWordIntervals === 0),
    repairedWordIntervals: repair.repairedWordIntervals,
    unrepairableWordIntervals: repair.unrepairableWordIntervals,
    trimmedLines: repair.trimmedLines,
    trimmedWords: repair.trimmedWords,
    droppedLines: repair.droppedLines,
  });
}

const report = {
  schemaVersion: "hapa.echo.lyric-timing-safe-repair-report.v1",
  mutationMode: APPLY ? "apply" : "read-only",
  generatedAt: new Date().toISOString(),
  inspected: results.length,
  changed: results.filter((row) => row.changed).length,
  applied: results.filter((row) => row.applied).length,
  results,
};
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  mutationMode: report.mutationMode,
  inspected: report.inspected,
  changed: report.changed,
  applied: report.applied,
}, null, 2)}\n`);
