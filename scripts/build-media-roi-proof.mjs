#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildSafeCameraPath, classifyMediaRole, validateSafeCameraPath } from "../src/domain/media-role-camera.js";

const arg = (name) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const graphPath = path.resolve(arg("graph"));
const output = path.resolve(arg("output"));
fs.mkdirSync(output, { recursive: true });
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const cards = graph.tracks.flatMap((track) => track.cards).filter((card) => card.media?.localPath && fs.existsSync(card.media.localPath));
const unique = [...new Map(cards.map((card) => [card.media.id, card])).values()];
const input = { items: unique.map((card) => ({ id: card.media.id, path: card.media.localPath })) };
const inputPath = path.join(output, "roi-input.json");
const analysisPath = path.join(output, "roi-analysis.json");
fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
const swift = spawnSync("swift", [path.resolve("scripts/analyze-media-roi.swift"), "--input", inputPath, "--output", analysisPath], { encoding: "utf8", timeout: 180000 });
if (swift.status !== 0) throw new Error(`Vision ROI analysis failed: ${swift.stderr || swift.stdout}`);
const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
const byId = new Map(analysis.items.map((item) => [item.id, item]));
const cachePath = path.resolve("artifacts/echo-media-affordances/technical-cache-v2.json");
const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const technicalByPath = new Map(Object.values(cache).map((row) => [row.technical?.sourcePath, row.technical]).filter(([key]) => key));
const sections = graph.directorV2.cueGraph.sections || [];
const lyricCues = graph.directorV2.cueGraph.lyricCues || [];
const paths = unique.map((card, index) => {
  const item = byId.get(card.media.id);
  const technical = technicalByPath.get(card.media.localPath) || { width: item.width, height: item.height, durationSec: card.endSeconds - card.startSeconds, fps: 24, codec: /\.(png|jpe?g|webp)$/i.test(card.media.localPath) ? "image" : "unknown" };
  const atSectionStart = sections.some((section) => Math.abs(Number(section.startSeconds) - Number(card.startSeconds)) < 0.1);
  const role = classifyMediaRole({ technical, subjectROI: item.subjectROI, atSectionStart, isFinal: index === unique.length - 1 });
  const phraseCue = lyricCues.find((cue) => Number(cue.startSeconds) >= Number(card.startSeconds) && Number(cue.startSeconds) < Number(card.endSeconds)) || { id: null, startSeconds: card.startSeconds, source: "shot-boundary" };
  return buildSafeCameraPath({ mediaId: card.media.id, technical, analysis: item, role, phraseCue });
});
const validations = paths.map(validateSafeCameraPath);
const enriched = structuredClone(graph);
enriched.directorV2.mediaRoleCamera = paths;
enriched.directorV2.cameraKeyframes = paths.flatMap((cameraPath) => {
  const card = unique.find((row) => row.media.id === cameraPath.mediaId);
  return [{ atSeconds: card.startSeconds, cameraPathId: cameraPath.id, subjectROI: cameraPath.subjectROI, shotRole: cameraPath.shotRole, phraseCue: cameraPath.phraseCue, easing: cameraPath.easing, safeZoomLimits: cameraPath.zoomLimits, crop: cameraPath.corridors[0].startCrop }, { atSeconds: card.endSeconds, cameraPathId: cameraPath.id, subjectROI: cameraPath.subjectROI, shotRole: cameraPath.shotRole, phraseCue: cameraPath.phraseCue, easing: cameraPath.easing, safeZoomLimits: cameraPath.zoomLimits, crop: cameraPath.corridors[0].endCrop }];
});
fs.writeFileSync(path.join(output, "native-show-graph.roi-enriched.json"), `${JSON.stringify(enriched, null, 2)}\n`);
const roles = Object.fromEntries([...new Set(paths.map((row) => row.shotRole))].sort().map((role) => [role, paths.filter((row) => row.shotRole === role).length]));
const report = { schemaVersion: "hapa.director.media-role-camera-proof.v1", ok: paths.length > 0 && validations.every((row) => row.ok), sourceGraph: graphPath, analyzedMedia: paths.length, faceDetected: analysis.items.filter((item) => item.faceCount > 0).length, saliencyDetected: analysis.items.filter((item) => item.evidence.includes("saliency")).length, fallbackROI: analysis.items.filter((item) => item.evidence.includes("fallback")).length, roles, targetAspects: ["16:9", "9:16", "1:1"], allPathsFullBleed: paths.every((row) => row.corridors.every((corridor) => corridor.fullBleed && !corridor.blackMatExposure)), allPathsCiteROIAndPhrase: paths.every((row) => row.subjectROI.evidence && Object.hasOwn(row.phraseCue, "id")), validations, paths };
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, analyzedMedia: report.analyzedMedia, faceDetected: report.faceDetected, saliencyDetected: report.saliencyDetected, fallbackROI: report.fallbackROI, roles, allPathsFullBleed: report.allPathsFullBleed }, null, 2));
if (!report.ok) process.exitCode = 1;
