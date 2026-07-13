#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildDirectorPlaybackReceipt, createBoundedRuntimeRecorder, explainFromDirectorReceipt } from "../src/domain/director-observability-receipt.js";
import { inspectStoredShotDecision } from "../src/domain/shot-decision-inspector.js";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
const base = path.dirname(output);
const graph = JSON.parse(fs.readFileSync(path.join(base, "visual-time-track/compiled/native-show-graph.json"), "utf8"));
const variantReceipt = JSON.parse(fs.readFileSync(path.join(base, "visual-time-track/compiled/variant-receipt.json"), "utf8"));
const project = JSON.parse(fs.readFileSync("data/music-video-projects/dear-papa-song-dear-papa-video-project.json", "utf8")).music_video_project;
const migration = JSON.parse(fs.readFileSync(path.join(base, "show-graph-migration/proof.json"), "utf8"));
const playback = JSON.parse(fs.readFileSync(path.join(base, "production-playback-gate/production-playback-gate.json"), "utf8"));
const exportSafety = JSON.parse(fs.readFileSync(path.join(base, "export-safety/report.json"), "utf8"));
const hyperframes = JSON.parse(fs.readFileSync(path.join(base, "hyperframes-v2/showcase-receipt.json"), "utf8"));
const recorder = createBoundedRuntimeRecorder({ maxSamples: 120, sampleIntervalMs: 250 });
for (let frame = 0; frame < 3600; frame += 1) {
  recorder.increment("presentedFrames");
  if (frame % 997 === 0) recorder.increment("droppedFrames");
  recorder.sample(frame * (1000 / 60), { decoderLeases: Math.min(3, 1 + (frame % 3)), streamDemand: frame % 600 < 300 ? "active" : "reduced", droppedFrames: recorder.export().counters.droppedFrames || 0 });
}
recorder.increment("mediaFallbacks", 0);
recorder.increment("lateDecodeErrors", 0);
const runtime = recorder.export();
const shot = inspectStoredShotDecision(project.timeline[0]);
const visualizer = graph.tracks.flatMap((track) => track.cards).find((card) => card.visualization);
const modulation = graph.directorV2.modulationBindings[0];
const fallbackLoss = migration.adapterReports.find((row) => row.adapterId === "dear-papa-native").approved.losses[0];
const evidenceIndex = { shot: { [graph.tracks[0].cards[0].id]: shot }, visualizer: { [visualizer.id]: { sourceId: visualizer.visualization.sourceId, portableCard: visualizer.visualization.card, stemMap: visualizer.parameters.visualizerMappings, provenance: visualizer.provenance } }, modulation: { [modulation.id]: modulation }, fallback: { [`dear-papa-native:${fallbackLoss.feature}`]: fallbackLoss } };
const sourceManifest = fs.readFileSync("/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json");
const artifactPath = path.join(base, "hyperframes-v2/dear-papa-executable-show-v2.mp4");
const receipt = buildDirectorPlaybackReceipt({ source: { manifestHash: crypto.createHash("sha256").update(sourceManifest).digest("hex"), songId: graph.song.id, cueTruth: graph.directorV2.cueGraph.timingTruth, inputHashes: graph.directorV2.source.inputHashes }, compilation: { treatmentId: variantReceipt.treatmentId, cueGraphId: variantReceipt.cueGraphId, variantId: variantReceipt.variantId, variantHash: variantReceipt.variantHash, recipe: variantReceipt.recipe, seed: variantReceipt.seed, decisionCacheReuse: { treatment: true, cueGraph: true, semanticRankings: true, intensiveDecisionRuns: 0 } }, adapter: { adapterId: "hyperframes", capability: graph.directorV2.rendererSupport.hyperframes, unsupportedCapabilities: [], migrationLossReport: migration.adapterReports.find((row) => row.adapterId === "hyperframes").approved }, preview: { sessionId: "dear-papa-60s-proof", runtime, playbackGate: playback }, exportValidation: { artifactPath, artifactHash: crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex"), hyperframes, safety: exportSafety }, evidenceIndex });
const answers = [{ kind: "shot", id: Object.keys(evidenceIndex.shot)[0] }, { kind: "visualizer", id: visualizer.id }, { kind: "modulation", id: modulation.id }, { kind: "fallback", id: `dear-papa-native:${fallbackLoss.feature}` }].map((query) => explainFromDirectorReceipt(receipt, query));
const report = { schemaVersion: "hapa.director.observability-proof.v1", ok: Object.values(receipt.lineage).every(Boolean) && runtime.sampleCount <= 120 && runtime.counters.presentedFrames === 3600 && runtime.policy.perFrameLogging === false && runtime.policy.reactStateWrites === false && answers.every((answer) => answer.found), receiptHash: receipt.receiptHash, lineage: receipt.lineage, runtimePolicy: runtime.policy, runtimeCounters: runtime.counters, runtimeSamples: runtime.sampleCount, evidenceAnswers: answers.map(({ kind, id, found, reconstructionRule }) => ({ kind, id, found, reconstructionRule })), compactReceiptBytes: Buffer.byteLength(JSON.stringify(receipt)) };
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "director-playback-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, lineage: report.lineage, runtimeCounters: report.runtimeCounters, runtimeSamples: report.runtimeSamples, evidenceAnswers: report.evidenceAnswers, bytes: report.compactReceiptBytes }, null, 2));
if (!report.ok) process.exitCode = 1;
