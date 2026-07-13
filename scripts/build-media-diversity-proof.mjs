#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildMediaDiversityReport, compareMediaDiversityReports } from "../src/domain/media-diversity-budget.js";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
const benchmarkRoot = path.join(path.dirname(output), "three-song-benchmark/graphs");
const songs = fs.readdirSync(benchmarkRoot).sort().map((songId) => {
  const reports = ["current", "conservative", "kinetic", "visualizer-forward"].map((variant) => {
    const graph = JSON.parse(fs.readFileSync(path.join(benchmarkRoot, songId, `${variant}.json`), "utf8"));
    const report = buildMediaDiversityReport(graph);
    report.variantId = variant;
    return report;
  });
  return { songId, comparison: compareMediaDiversityReports(reports), reports };
});
const ok = songs.length === 3
  && songs.every((song) => song.reports.length === 4 && song.reports.every((row) => row.deterministic && row.budgets.minClipSpacingSeconds > 0 && row.callbacks.every((callback) => callback.motifId && callback.reason) && row.penalties.every((penalty) => penalty.penalty > 0)))
  && songs.every((song) => song.comparison.variants.every((row) => Number.isFinite(row.reuseFatigue)));
const report = {
  schemaVersion: "hapa.director.media-diversity-proof.v1",
  ok,
  songs: songs.map((song) => ({
    songId: song.songId,
    comparison: song.comparison,
    variants: song.reports.map((row) => ({
      variantId: row.variantId, budgets: row.budgets, totals: row.totals,
      familySpacing: row.familySpacing, roleCoverage: row.roleCoverage,
      callbacks: row.callbacks.length, callbackSamples: row.callbacks.slice(0, 5),
      accidentalRepeats: row.penalties.filter((item) => item.kind === "accidental-clip-repeat").length,
      familySpacingPenalties: row.penalties.filter((item) => item.kind === "family-spacing").length,
      reuseFatigue: row.reuseFatigue,
    })),
  })),
};
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, songs: report.songs.map((song) => ({ songId: song.songId, variants: song.variants.map((row) => ({ variantId: row.variantId, uniqueMedia: row.totals.uniqueMedia, callbacks: row.callbacks, accidentalRepeats: row.accidentalRepeats, fatigue: row.reuseFatigue })) })) }, null, 2));
if (!report.ok) process.exitCode = 1;
