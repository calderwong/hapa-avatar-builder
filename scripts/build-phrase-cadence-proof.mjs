#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { validatePhraseCadence } from "../src/domain/phrase-cadence.js";
import { loadGatedEchoIsfManifest, repairEchoProjectShaders } from "./echo-isf-gated-manifest.mjs";

const arg = (name) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const output = path.resolve(arg("output"));
fs.mkdirSync(output, { recursive: true });
const { manifest } = loadGatedEchoIsfManifest();
const registry = JSON.parse(fs.readFileSync("/Users/calderwong/Desktop/hapa-song-registry/data/registry.json", "utf8"));
const projectDir = path.resolve("data/music-video-projects");
const fixtures = [
  "dear-papa-song-dear-papa-video-project.json",
  "dear-papa-song-catch-the-rabbit-video-project.json",
  "dear-papa-song-3-a-m-emoji-pain-video-project.json",
];
const rows = fixtures.map((file) => {
  const payload = JSON.parse(fs.readFileSync(path.join(projectDir, file), "utf8"));
  const project = payload.music_video_project || payload;
  const prepared = repairEchoProjectShaders(payload, manifest).project;
  const artifacts = buildDirectorV2Artifacts({ project: prepared, manifest, registry, duration: Math.min(60, Number(project.duration || 60)), recipe: "visualizer-forward", seed: `cadence-proof:${project.song_id}` });
  const cadence = artifacts.showGraph.directorV2.cadenceTrack;
  const beatTimes = project.song_edit_map?.audioTelemetry?.beatTimes || [];
  const validation = validatePhraseCadence(cadence, { beatTimes });
  fs.writeFileSync(path.join(output, `${project.song_id}.cadence.json`), `${JSON.stringify(cadence, null, 2)}\n`);
  return {
    songId: project.song_id, title: project.song_title, validation,
    sectionCount: cadence.sectionCount,
    cutCount: cadence.sections.reduce((sum, section) => sum + section.cuts.length, 0),
    syncopatedCuts: cadence.sections.reduce((sum, section) => sum + section.cuts.filter((cut) => cut.syncopation).length, 0),
    tailRepairs: cadence.sections.filter((section) => section.tailRepair).length,
    sectionGrammar: cadence.sections.map((section) => ({ sectionId: section.sectionId, role: section.sectionRole, targetCutDensityPerSecond: section.targetCutDensityPerSecond, actualCutDensityPerSecond: section.actualCutDensityPerSecond, holdStrategy: section.holdStrategy, visualPeak: section.visualPeak, transitionGrammar: section.transitionGrammar })),
  };
});
const report = { schemaVersion: "hapa.director.phrase-cadence-proof.v1", ok: rows.every((row) => row.validation.ok), songs: rows };
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, songs: rows.map(({ title, cutCount, syncopatedCuts, tailRepairs }) => ({ title, cutCount, syncopatedCuts, tailRepairs })) }, null, 2));
if (!report.ok) process.exitCode = 1;
