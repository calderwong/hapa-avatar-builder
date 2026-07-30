#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  createEchoLyricTimingAdjudication,
  inspectEchoLyricTimingAdjudication,
} from "../src/domain/echo-lyric-promotion.js";

const ROOT = path.resolve(".");
const PLAN_PATH = process.env.HAPA_ECHO_LYRIC_DRAIN_PLAN
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/drain-plan.json");
const OUTPUT_PATH = process.env.HAPA_ECHO_LYRIC_ADJUDICATION_REPORT
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/adjudication-report.json");
const APPLY = process.argv.includes("--apply");
const ADJUDICATED_AT = new Date().toISOString();

if (!fs.existsSync(PLAN_PATH)) throw new Error(`lyric drain plan not found: ${PLAN_PATH}`);
const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
const results = [];

for (const row of plan.rows || []) {
  const timingPath = String(row.timingPath || "");
  if (!timingPath || !fs.existsSync(timingPath)) continue;
  let timing;
  try {
    timing = JSON.parse(fs.readFileSync(timingPath, "utf8"));
  } catch {
    results.push({
      registryTrackId: row.registryTrackId,
      title: row.title,
      timingPath,
      eligible: false,
      applied: false,
      reasons: ["timing-json-invalid"],
    });
    continue;
  }
  const inspection = inspectEchoLyricTimingAdjudication(timing);
  const receipt = createEchoLyricTimingAdjudication(timing, {
    adjudicatedAt: ADJUDICATED_AT,
  });
  if (APPLY && receipt) {
    timing.adjudication = receipt;
    fs.writeFileSync(timingPath, `${JSON.stringify(timing, null, 2)}\n`, "utf8");
  }
  results.push({
    registryTrackId: row.registryTrackId,
    title: row.title,
    timingPath,
    eligible: inspection.eligible,
    applied: Boolean(APPLY && receipt),
    confidence: inspection.confidence,
    matchedRatio: inspection.matchedRatio,
    unmatchedLineCount: inspection.unmatchedLineCount,
    lineCount: inspection.lineCount,
    reasons: inspection.reasons,
  });
}

const report = {
  schemaVersion: "hapa.echo.lyric-evidence-adjudication-report.v1",
  mutationMode: APPLY ? "apply" : "read-only",
  generatedAt: ADJUDICATED_AT,
  planPath: PLAN_PATH,
  inspected: results.length,
  eligible: results.filter((row) => row.eligible).length,
  applied: results.filter((row) => row.applied).length,
  results,
};
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  mutationMode: report.mutationMode,
  inspected: report.inspected,
  eligible: report.eligible,
  applied: report.applied,
  acceptedTitles: results.filter((row) => row.applied).map((row) => row.title),
}, null, 2)}\n`);
