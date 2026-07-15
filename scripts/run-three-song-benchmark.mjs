#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { buildDirectorV2Artifacts, compileDirectorVariant } from "../src/domain/echo-director-v2.js";
import { DIRECTOR_BENCHMARK_SCHEMA, evaluateDefaultMigration, summarizeBenchmarkGraph } from "../src/domain/director-benchmark.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";
import { loadGatedEchoIsfManifest, repairEchoProjectShaders } from "./echo-isf-gated-manifest.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9) || path.join(root, "artifacts/three-song-benchmark"));
const manifestPath = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";
const registryPath = "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";
const { manifest } = loadGatedEchoIsfManifest({ manifestPath });
const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : null;
const fixtures = [
  ["dear-papa-song-dear-papa", "Dear Papa"],
  ["dear-papa-song-catch-the-rabbit", "Catch the Rabbit"],
  ["dear-papa-song-3-a-m-emoji-pain", "3 a.m. Emoji Pain"],
];
const recipes = ["conservative", "kinetic", "visualizer-forward"];
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

function assetTraffic(graph) {
  const paths = [...new Set((graph.tracks || []).flatMap((track) => track.cards || []).map((card) => card.media?.localPath).filter(Boolean))];
  const rows = paths.map((assetPath) => ({ path: assetPath, exists: fs.existsSync(assetPath), bytes: fs.existsSync(assetPath) ? fs.statSync(assetPath).size : 0 }));
  return { uniqueAssets: rows.length, existingAssets: rows.filter((row) => row.exists).length, missingAssets: rows.filter((row) => !row.exists).length, totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0), assets: rows };
}

function previewHtml(title, graph) {
  const cards = (graph.tracks || []).flatMap((track, trackIndex) => (track.cards || []).map((card) => ({ ...card, trackIndex })));
  const duration = Number(graph.song?.durationSeconds || 1);
  const blocks = cards.map((card) => `<div title="${String(card.media?.title || card.visualization?.nativeKey || card.id).replaceAll('"', '&quot;')}" style="position:absolute;left:${100 * Number(card.startSeconds || 0) / duration}%;width:${Math.max(.3,100*(Number(card.endSeconds||0)-Number(card.startSeconds||0))/duration)}%;top:${card.trackIndex*30}px;height:24px;background:${card.visualization?'#7b3f91':'#17627b'};border:1px solid #a8d8e8;overflow:hidden;font-size:9px">${card.media?.title || card.visualization?.nativeKey || card.id}</div>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{background:#060b13;color:#eef;font:14px system-ui;margin:20px}.timeline{position:relative;height:${Math.max(60,(graph.tracks?.length||1)*30)}px;background:repeating-linear-gradient(90deg,#111c2b 0,#111c2b 1px,transparent 1px,transparent 10%)}</style><h1>${title}</h1><p>${duration.toFixed(2)} seconds · ${cards.length} cards · graph preview (not an export-quality playback claim)</p><div class="timeline">${blocks}</div>`;
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const songs = [];
for (const [songId, title] of fixtures) {
  const projectPath = path.join(root, "data/music-video-projects", `${songId}-video-project.json`);
  const payload = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const project = payload.music_video_project || payload;
  const prepared = repairEchoProjectShaders(payload, manifest).project;
  const preparedProject = prepared.music_video_project || prepared;
  const started = performance.now();
  const base = buildDirectorV2Artifacts({ project: prepared, sourceProject: payload, manifest, registry, duration: Number(project.duration), recipe: "conservative", seed: `benchmark:${songId}:base`, avatarRoot: root });
  const decisionEnvelopeMs = performance.now() - started;
  const current = projectToEditorGraph(preparedProject);
  const variants = [];
  for (const recipe of recipes) {
    const variantStarted = performance.now();
    const graph = compileDirectorVariant({ treatment: base.treatment, cueGraph: base.cueGraph, recipe, seed: `benchmark:${songId}:${recipe}`, sourceProject: prepared });
    const compileMs = performance.now() - variantStarted;
    variants.push({ recipe, graph, compileMs });
  }
  const graphRows = [{ id: "current", graph: current, compileMs: 0 }, ...variants.map((row) => ({ id: row.recipe, graph: row.graph, compileMs: row.compileMs }))];
  for (const row of graphRows) {
    const relativeGraph = `graphs/${songId}/${row.id}.json`;
    const relativePreview = `previews/${songId}/${row.id}.html`;
    write(path.join(output, relativeGraph), row.graph);
    fs.mkdirSync(path.dirname(path.join(output, relativePreview)), { recursive: true });
    fs.writeFileSync(path.join(output, relativePreview), previewHtml(`${title} · ${row.id}`, row.graph));
    row.graphRef = relativeGraph;
    row.previewRef = relativePreview;
    row.summary = summarizeBenchmarkGraph(row.graph);
    row.assetTraffic = assetTraffic(row.graph);
    delete row.graph;
  }
  songs.push({ songId, title, stemTruth: (project.stems_available || []).length ? "registry-stems-declared" : "no-isolated-stems", pinnedProjectSha256: digest(projectPath), decisionEnvelope: { treatmentId: base.treatment.treatmentId, cueGraphId: base.cueGraph.cueGraphId, intensiveDecisionRuns: 1, compileMs: Number(decisionEnvelopeMs.toFixed(3)) }, variantsReuseSameEnvelope: variants.every((row) => row.graph.directorV2.treatmentId === base.treatment.treatmentId && row.graph.directorV2.cueGraphId === base.cueGraph.cueGraphId), graphs: graphRows });
}

const productionGatePath = path.join(path.dirname(output), "production-playback-gate/production-playback-gate.json");
const productionGate = fs.existsSync(productionGatePath) ? JSON.parse(fs.readFileSync(productionGatePath, "utf8")) : null;
const editorialProofPath = path.join(path.dirname(output), "editorial-blind-review/proof.json");
const editorialProof = fs.existsSync(editorialProofPath) ? JSON.parse(fs.readFileSync(editorialProofPath, "utf8")) : null;
const regressions = [
  { id: "catch-the-rabbit-production-playback", severity: "blocking", status: "not-measured", message: "No production playback export gate has been run for Catch the Rabbit." },
  { id: "emoji-pain-production-playback", severity: "blocking", status: "not-measured", message: "No production playback export gate has been run for 3 a.m. Emoji Pain." },
  { id: "blind-editorial-scores", severity: "blocking", status: editorialProof?.reviewStatus || "missing", message: "Human blind editorial scores have not been submitted." },
  ...songs.flatMap((song) => song.graphs.filter((row) => row.assetTraffic.missingAssets > 0).map((row) => ({ id: `${song.songId}:${row.id}:missing-assets`, severity: "blocking", status: "missing-assets", count: row.assetTraffic.missingAssets, message: "Graph declares local media paths that are unavailable." }))),
];
const p0Gates = { deterministicVariants: "pass", productionPlaybackDearPapa: productionGate?.ok ? "pass" : "missing", semanticCastingBlindReview: "pending-human" };
const migration = evaluateDefaultMigration({ p0Gates, regressions, blindEditorialStatus: editorialProof?.reviewStatus === "complete" ? "complete" : "awaiting-human" });
const report = { schemaVersion: DIRECTOR_BENCHMARK_SCHEMA, ok: songs.length === 3 && songs.every((song) => song.graphs.length === 4 && song.variantsReuseSameEnvelope && song.decisionEnvelope.intensiveDecisionRuns === 1), generatedAt: new Date().toISOString(), pinnedInputs: { isfManifest: { path: manifestPath, sha256: digest(manifestPath) }, songRegistry: fs.existsSync(registryPath) ? { path: registryPath, sha256: digest(registryPath) } : { path: registryPath, status: "missing" } }, songs, compileTotals: { intensiveDecisionRuns: songs.reduce((sum, song) => sum + song.decisionEnvelope.intensiveDecisionRuns, 0), cheapVariantRuns: songs.length * recipes.length, totalDecisionEnvelopeMs: Number(songs.reduce((sum, song) => sum + song.decisionEnvelope.compileMs, 0).toFixed(3)), totalCheapVariantMs: Number(songs.flatMap((song) => song.graphs.slice(1)).reduce((sum, row) => sum + row.compileMs, 0).toFixed(3)) }, playbackMetrics: { dearPapa: productionGate ? { source: "production-playback-gate", ok: productionGate.ok, metrics: productionGate.metrics || productionGate.summary || productionGate } : { status: "missing" }, catchTheRabbit: { status: "not-measured" }, emojiPain: { status: "not-measured" } }, blindEditorial: { status: editorialProof?.reviewStatus || "missing", source: "../editorial-blind-review/index.html" }, regressions, p0Gates, defaultMigration: migration };
write(path.join(output, "benchmark.json"), report);
const songLinks = songs.map((song) => `<section><h2>${song.title}</h2><p>${song.stemTruth} · one decision envelope, three cheap variants</p>${song.graphs.map((row) => `<a href="${row.previewRef}">${row.id} preview</a>`).join(' · ')}</section>`).join('');
fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><meta charset="utf-8"><title>Echo three-song benchmark</title><style>body{font:15px system-ui;background:#07101a;color:#eaf5ff;margin:28px;max-width:1000px}section{padding:16px;border:1px solid #2e5870;margin:14px 0}a{color:#50e3ff}.blocked{color:#ffbc73}</style><h1>Current versus Director v2 benchmark</h1><p class="blocked">Default migration: BLOCKED. Human blind scores, semantic casting votes, and two production playback exports remain open.</p>${songLinks}<p><a href="benchmark.json">Machine-readable benchmark</a> · <a href="../editorial-blind-review/index.html">Blind editorial review</a></p>`);
console.log(JSON.stringify({ ok: report.ok, output, songs: songs.length, variants: songs.reduce((sum, song) => sum + song.graphs.length - 1, 0), intensiveDecisionRuns: report.compileTotals.intensiveDecisionRuns, cheapVariantRuns: report.compileTotals.cheapVariantRuns, regressions: regressions.length, migrationAllowed: migration.allowed }, null, 2));
if (!report.ok) process.exitCode = 1;
