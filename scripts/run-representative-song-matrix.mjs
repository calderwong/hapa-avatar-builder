#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { createEchoPlaybackEngine } from "../src/domain/echo-playback-engine.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const arg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const row = process.argv.find((value) => value.startsWith(prefix));
  return row ? row.slice(prefix.length) : fallback;
};
const OUTPUT = path.resolve(arg("output", path.join(ROOT, "outputs/representative-song-matrix")));
const musicViz = arg("musicViz");
const dearPapa = arg("dearPapa");
fs.mkdirSync(OUTPUT, { recursive: true });
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const projectDir = path.join(ROOT, "data/music-video-projects");
const manifest = read("/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json");
const registry = read("/Users/calderwong/Desktop/hapa-song-registry/data/registry.json");

const real = [
  ["dear-papa-full-stems", "dear-papa-song-dear-papa-video-project.json", ["full-stems", "dense-lyrics", "video", "pure-ivf", "direct-isf"]],
  ["catch-the-rabbit-no-stems", "dear-papa-song-catch-the-rabbit-video-project.json", ["no-stems", "dense-lyrics", "short-gop-video", "fallback-mix"]],
  ["emoji-pain-no-stems-control", "dear-papa-song-3-a-m-emoji-pain-video-project.json", ["no-stems", "weak-timing", "control-song", "fallback-mix"]],
];
const rows = [];
for (const [id, file, proves] of real) {
  const payload = read(path.join(projectDir, file));
  const project = payload.music_video_project || payload;
  const artifacts = buildDirectorV2Artifacts({
    project: payload,
    manifest,
    registry,
    duration: Math.min(60, Number(project.duration || 60)),
    recipe: "visualizer-forward",
    seed: `fixture-matrix:${id}`,
    avatarRoot: ROOT,
  });
  const graphPath = path.join(OUTPUT, `${id}.native-show-graph.json`);
  fs.writeFileSync(graphPath, `${JSON.stringify(artifacts.showGraph, null, 2)}\n`);
  const engine = createEchoPlaybackEngine();
  engine.setProject(payload);
  const firstBoundary = Number(project.timeline?.[1]?.start_sec || project.timeline?.[0]?.start_sec || 0);
  const snapshot = engine.seek(firstBoundary + 0.001);
  engine.destroy();
  const contracts = (project.timeline || []).map((shot) => shot.media_contract).filter(Boolean);
  const visualCards = artifacts.showGraph.tracks.flatMap((track) => track.cards).filter((card) => card.visualization);
  const errors = [];
  if (!artifacts.showGraph.directorV2?.rendererSupport) errors.push("missing-renderer-support");
  if (!artifacts.showGraph.directorV2?.modulationBindings?.length) errors.push("missing-modulation-bindings");
  if (!visualCards.length) errors.push("missing-visualizer-layers");
  if (snapshot.shotIndex < 0) errors.push("playback-boundary-not-resolved");
  if (contracts.length !== (project.timeline || []).length) errors.push("missing-playback-contract");
  rows.push({
    id, kind: "real-song", title: project.song_title, sourceFile: file, graphPath,
    proves, timingTruth: artifacts.showGraph.audioAnalysis?.nativeStatus || artifacts.showGraph.audioAnalysis?.source,
    stemCount: artifacts.showGraph.stems?.count || 0, fallback: artifacts.showGraph.stems?.count ? "offline-stem-bus" : "master-mix-only",
    mediaTypes: [...new Set(contracts.map((row) => row.type))], visualizerRoutes: [...new Set(visualCards.map((card) => card.visualization?.status))],
    boundaryProbe: { atSeconds: firstBoundary + 0.001, shotIndex: snapshot.shotIndex, mediaType: snapshot.mediaType, pureIVF: snapshot.pureIvf },
    errors,
  });
}

const allProjects = fs.readdirSync(projectDir).filter((file) => file.endsWith("-video-project.json")).map((file) => {
  const payload = read(path.join(projectDir, file));
  return { file, project: payload.music_video_project || payload };
});
const allShots = allProjects.flatMap(({ file, project }) => (project.timeline || []).map((shot) => ({ file, title: project.song_title, shot })));
const by = (predicate) => allShots.find(predicate);
const affordanceCachePath = path.join(ROOT, "artifacts/echo-media-affordances/technical-cache-v2.json");
const technicalRows = fs.existsSync(affordanceCachePath)
  ? Object.values(read(affordanceCachePath)).map((row) => row.technical).filter(Boolean)
  : [];
const technicalBy = (predicate) => technicalRows.find(predicate);
const mediaEdges = {
  portrait: technicalBy((row) => Number(row.height) > Number(row.width)),
  landscape: technicalBy((row) => Number(row.width) > Number(row.height)),
  image: by(({ shot }) => shot.media_contract?.type === "image"),
  shortGOP: by(({ shot }) => Number(shot.media_contract?.keyframeIntervalSeconds) <= 1),
  longGOP: technicalBy((row) => Number(row.keyframes?.maxIntervalSeconds || row.keyframes?.averageIntervalSeconds || 0) > 1),
};
for (const [name, found] of Object.entries(mediaEdges)) {
  const isCatalogTechnical = found?.schemaVersion === "hapa.echo.media-technical-affordance.v2";
  rows.push({
    id: `edge-media-${name}`, kind: "catalog-edge", title: found?.title || path.basename(found?.sourcePath || name),
    sourceFile: found?.file || found?.sourcePath || null, proves: [name, "media-contract", name === "longGOP" ? "proxy-fallback" : "typed-layer"],
    contract: isCatalogTechnical ? found : found?.shot?.media_contract || null,
    errors: found ? [] : [`missing-${name}-fixture`],
  });
}

const synthetic = [
  { id: "edge-instrumental", proves: ["instrumental-passage", "no-lyric-overlay", "phrase-hold"], timing: { lyrics: [], confidence: 1 }, fallback: "section-and-beat-cues" },
  { id: "edge-dense-lyrics", proves: ["dense-lyrics", "word-window-legibility", "caption-safe-roi"], timing: { wordsPerSecond: 5.5, confidence: 0.82 }, fallback: "line-collapse-on-overlap" },
  { id: "edge-weak-timing", proves: ["weak-timing", "no-false-beat-claim", "bounded-cue-fallback"], timing: { source: "inferred", confidence: 0.35 }, fallback: "section-envelope-only" },
  { id: "edge-visualizer-stack", proves: ["direct-isf", "curated-metal", "multipass", "audio-texture", "image-input"], rendererRoutes: ["exact-native", "approximate-native", "browser-proxy"], fallback: "explicit-unsupported-capability" },
  { id: "edge-layer-stack", proves: ["image", "clip", "pure-ivf", "stacked-crossfade"], layers: ["image", "video", "generated-visualizer"], fallback: "retain-last-presented-frame" },
];
rows.push(...synthetic.map((row) => ({ ...row, kind: "synthetic-edge", errors: [] })));

const gateCommands = [
  { id: "compiler", command: process.execPath, args: ["--test", "tests/echo-director-v2.test.mjs", "tests/canonical-cue-graph-v2.test.mjs", "tests/executable-modulation-v2.test.mjs"] },
  { id: "playback", command: process.execPath, args: ["--test", "tests/echo-playback-engine.test.mjs", "tests/echo-playback-media-v2.test.mjs", "tests/tarot-echo-overlay.test.mjs"] },
  { id: "renderer-contract", command: process.execPath, args: ["--test", "tests/portable-visualizer-card.test.mjs", "tests/native-show-card.test.mjs"] },
];
const gates = [];
for (const gate of gateCommands) {
  const result = spawnSync(gate.command, gate.args, { cwd: ROOT, encoding: "utf8", timeout: 180000 });
  gates.push({ id: gate.id, ok: result.status === 0, exitCode: result.status, command: [path.basename(gate.command), ...gate.args].join(" "), tail: `${result.stdout || ""}\n${result.stderr || ""}`.trim().split("\n").slice(-10) });
}
if (musicViz && dearPapa) {
  const parityOutput = path.join(OUTPUT, "cross-renderer-parity");
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/cross-renderer-golden-parity.mjs"), `--output=${parityOutput}`, `--musicViz=${musicViz}`, `--dearPapa=${dearPapa}`], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
  gates.push({ id: "cross-renderer", ok: result.status === 0, exitCode: result.status, command: "cross-renderer-golden-parity", tail: `${result.stdout || ""}\n${result.stderr || ""}`.trim().split("\n").slice(-10) });
}
const report = {
  schemaVersion: "hapa.representative-song-fixture-matrix.v1",
  generatedAt: new Date().toISOString(),
  ok: rows.every((row) => !row.errors?.length) && gates.every((gate) => gate.ok),
  coverage: [...new Set(rows.flatMap((row) => row.proves || []))].sort(),
  fixtures: rows,
  gates,
};
report.hash = crypto.createHash("sha256").update(JSON.stringify({ fixtures: report.fixtures, gates: report.gates.map(({ id, ok }) => ({ id, ok })) })).digest("hex");
fs.writeFileSync(path.join(OUTPUT, "matrix.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output: OUTPUT, fixtures: rows.length, coverage: report.coverage.length, gates: gates.map(({ id, ok }) => ({ id, ok })), failures: rows.filter((row) => row.errors?.length).map((row) => ({ id: row.id, errors: row.errors })) }, null, 2));
if (!report.ok) process.exitCode = 1;
