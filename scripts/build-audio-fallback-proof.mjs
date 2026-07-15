#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { validateAudioFallbackProfile } from "../src/domain/audio-fallback-profile.js";
import { loadGatedEchoIsfManifest, repairEchoProjectShaders } from "./echo-isf-gated-manifest.mjs";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
fs.mkdirSync(output, { recursive: true });
const projectRoot = path.resolve("data/music-video-projects");
const { manifest } = loadGatedEchoIsfManifest();
const registry = JSON.parse(fs.readFileSync("/Users/calderwong/Desktop/hapa-song-registry/data/registry.json", "utf8"));
const rows = [];
for (const file of fs.readdirSync(projectRoot).filter((name) => name.endsWith("-video-project.json")).sort()) {
  const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, file), "utf8"));
  const project = payload.music_video_project || payload;
  if ((project.stems_available || []).length) continue;
  const prepared = repairEchoProjectShaders(payload, manifest).project;
  const artifacts = buildDirectorV2Artifacts({ project: prepared, sourceProject: payload, manifest, registry, duration: Math.min(60, Number(project.duration || 60)), recipe: "visualizer-forward", seed: `fallback-proof:${project.song_id}` });
  const profile = artifacts.showGraph.directorV2.audioFallbackProfile;
  const validation = validateAudioFallbackProfile(profile);
  rows.push({ songId: project.song_id, title: project.song_title, validation, mode: profile.mode, truthStatus: profile.truthStatus, isolatedStemCount: profile.isolatedStemCount, unavailableSignals: profile.unavailableSignals, busKinds: profile.buses.map((bus) => bus.kind), frameCount: profile.deterministicControlEnvelope.frames.length, envelopeHash: profile.deterministicControlEnvelope.hash, upgradePath: profile.upgradePath });
  if (project.song_id === "dear-papa-song-catch-the-rabbit") fs.writeFileSync(path.join(output, "catch-the-rabbit-fallback-profile.json"), `${JSON.stringify(profile, null, 2)}\n`);
}
const ui = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
const report = { schemaVersion: "hapa.director.audio-fallback-proof.v1", ok: rows.length === 15 && rows.every((row) => row.validation.ok && row.isolatedStemCount === 0 && !row.busKinds.includes("stem_signal")) && ui.includes("echo-audio-fallback-upgrade"), noStemProjectCount: rows.length, inventedIsolatedStemCount: rows.reduce((sum, row) => sum + row.isolatedStemCount, 0), uiUpgradePathVisible: ui.includes("echo-audio-fallback-upgrade"), projects: rows };
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, noStemProjects: report.noStemProjectCount, inventedIsolatedStems: report.inventedIsolatedStemCount, uiUpgradePathVisible: report.uiUpgradePathVisible, frameCount: rows.reduce((sum, row) => sum + row.frameCount, 0) }, null, 2));
if (!report.ok) process.exitCode = 1;
