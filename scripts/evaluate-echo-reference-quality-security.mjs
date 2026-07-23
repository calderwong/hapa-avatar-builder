#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateEchoReferenceQualitySecurity,
  runEchoReferenceMining,
} from "../src/domain/echo-reference-mining.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedAt = new Date().toISOString();
const store = JSON.parse(await fs.readFile(path.join(root, "data", "hapa-songs-store.json"), "utf8"));
const startedAt = performance.now();
const run = runEchoReferenceMining(store, { generatedAt: "2026-07-23T00:00:00.000Z" });
const durationMs = Math.round(performance.now() - startedAt);
const repeatRun = runEchoReferenceMining(store, { generatedAt: "2026-07-23T00:00:00.000Z" });
const [component, css] = await Promise.all([
  fs.readFile(path.join(root, "src", "components", "EchoReferenceExplorer.jsx"), "utf8"),
  fs.readFile(path.join(root, "src", "index.css"), "utf8"),
]);
const report = evaluateEchoReferenceQualitySecurity(run, {
  repeatRun,
  idempotentReplay: repeatRun.runHash === run.runHash,
  durationMs,
  maxDurationMs: 30_000,
  generatedAt,
  accessibilitySignals: {
    keyboard: component.includes("onKeyDown"),
    screenReader: component.includes("echo-ref-map-screenreader"),
    mobile: css.includes("@media (max-width: 560px)"),
    reducedMotion: css.includes("@media (prefers-reduced-motion: reduce)"),
    forcedColors: css.includes("@media (forced-colors: active)"),
    nonColorStatus: component.includes("confidence is numeric"),
  },
});
const outputPath = path.join(root, "data", "echo-reference-mining", "artifacts", "quality-security-evaluation.json");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, ...report }, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
