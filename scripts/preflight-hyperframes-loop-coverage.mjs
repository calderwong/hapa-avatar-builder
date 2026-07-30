#!/usr/bin/env node
import path from "node:path";
import { ensureHyperFramesLoopCoverage } from "../server/hyperframes-loop-coverage.mjs";

const projectOption = process.argv.find((value) => value.startsWith("--project="));
const projectDirectory = path.resolve(projectOption?.slice("--project=".length) || process.argv[2] || "");
if (!projectOption && !process.argv[2]) {
  console.error("Usage: node scripts/preflight-hyperframes-loop-coverage.mjs --project=/path/to/hyperframes-show");
  process.exit(2);
}

const report = await ensureHyperFramesLoopCoverage({ projectDirectory });
console.log(JSON.stringify({
  ok: report.ok,
  projectDirectory: report.projectDirectory,
  slotCount: report.after.slotCount,
  loopSlotCount: report.after.loopSlotCount,
  gapsBefore: report.before.gapCount,
  repairs: report.repairCount,
  gapsAfter: report.after.gapCount,
  sparseKeyframesAfter: report.sparseKeyframesAfterCount,
  blockers: report.blockers,
  reportPath: path.join(report.projectDirectory, "loop-coverage-preflight.json"),
}, null, 2));
if (!report.ok) process.exitCode = 1;
