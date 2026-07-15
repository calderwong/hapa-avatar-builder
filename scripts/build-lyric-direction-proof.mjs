#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { buildLyricDirectionTrack, validateLyricDirectionTrack } from "../src/domain/lyric-direction-track.js";
import { loadGatedEchoIsfManifest, repairEchoProjectShaders } from "./echo-isf-gated-manifest.mjs";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
fs.mkdirSync(output, { recursive: true });
const root = path.resolve("data/music-video-projects");
const { manifest } = loadGatedEchoIsfManifest();
const registry = JSON.parse(fs.readFileSync("/Users/calderwong/Desktop/hapa-song-registry/data/registry.json", "utf8"));
const rows = [];
for (const file of fs.readdirSync(root).filter((name) => name.endsWith("-video-project.json")).sort()) {
  const payload = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const project = payload.music_video_project || payload;
  const prepared = repairEchoProjectShaders(payload, manifest).project;
  const artifacts = buildDirectorV2Artifacts({ project: prepared, sourceProject: payload, manifest, registry, duration: Math.min(60, Number(project.duration || 60)), recipe: "visualizer-forward", seed: `lyric-direction:${project.song_id}` });
  const track = artifacts.showGraph.directorV2.lyricDirectionTrack;
  const validation = validateLyricDirectionTrack(track, artifacts.cueGraph.lyricCues);
  rows.push({ songId: project.song_id, title: project.song_title, validation, modes: [...new Set(track.sections.map((section) => section.mode))].sort(), lowConfidenceSections: track.sections.filter((section) => section.timing.truthStatus === "low-confidence-calm").length, exactWordCount: track.sections.reduce((sum, section) => sum + section.timing.words.length, 0) });
  if (project.song_id === "dear-papa-song-dear-papa") fs.writeFileSync(path.join(output, "dear-papa-lyric-direction.json"), `${JSON.stringify(track, null, 2)}\n`);
}
const roiFixtureLines = [{ id: "roi-line", startSeconds: 0, endSeconds: 4, confidence: 0.9, source: "fixture", words: [{ text: "Face-safe", startSeconds: 0, endSeconds: 1 }] }];
const roiFixture = buildLyricDirectionTrack({ sections: [{ id: "roi", type: "verse", startSeconds: 0, endSeconds: 5 }], lyricCues: roiFixtureLines, mediaSlots: [{ startSeconds: 0, endSeconds: 5, media: { id: "face-media", sourceKind: "local-video" } }], mediaROIs: { "face-media": { status: "verified-face-roi", occupiedRegions: ["right"] } } });
const modeCounts = {};
for (const row of rows) for (const mode of row.modes) modeCounts[mode] = (modeCounts[mode] || 0) + 1;
const report = { schemaVersion: "hapa.director.lyric-direction-proof.v1", ok: rows.length === 79 && rows.every((row) => row.validation.ok) && Object.keys(modeCounts).length > 1 && validateLyricDirectionTrack(roiFixture, roiFixtureLines).ok && roiFixture.sections[0].mediaContext.safeRegionInfluencedPlacement, projectCount: rows.length, projectsUsingOnlyPhraseWindow: rows.filter((row) => row.modes.length === 1 && row.modes[0] === "phrase-window").length, modeCounts, lowConfidenceSections: rows.reduce((sum, row) => sum + row.lowConfidenceSections, 0), roiFixture: roiFixture.sections[0], projects: rows };
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, projects: report.projectCount, projectsUsingOnlyPhraseWindow: report.projectsUsingOnlyPhraseWindow, modeCounts, lowConfidenceSections: report.lowConfidenceSections, roiPlacement: report.roiFixture.placement }, null, 2));
if (!report.ok) process.exitCode = 1;
