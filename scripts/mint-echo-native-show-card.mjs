#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildVisualizerRendererTruthReceipt } from "../src/domain/visualizer-renderer-capability.js";

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  return result;
}
function read(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }

const options = args(process.argv.slice(2));
if (!options.graph || !options.status || !options.output) throw new Error("--graph, --status, and --output are required");
const graphPath = path.resolve(options.graph);
const statusPath = path.resolve(options.status);
const outputPath = path.resolve(options.output);
const graphBytes = fs.readFileSync(graphPath);
const graph = JSON.parse(graphBytes);
const status = read(statusPath);
const director = graph.directorV2 || {};
const trackCount = graph.tracks?.length || 0;
const cardCount = (graph.tracks || []).reduce((sum, track) => sum + (track.cards?.length || 0), 0);
const allTracksAtGate = trackCount > 0 && (status.perTrackBuffers || []).length === trackCount
  && status.perTrackBuffers.every((track) => Number(track.bufferSecondsReady || 0) >= Number(track.targetSeconds || Infinity));
if (!allTracksAtGate) throw new Error("Refusing to mint: every Native track must reach its configured precompute gate");
const rendererTruthReceipts = (graph.tracks || []).flatMap((track) => (track.cards || [])
  .filter((card) => card?.visualization)
  .map((card) => buildVisualizerRendererTruthReceipt(card)));
const rendererTruth = {
  schemaVersion: "hapa.show.release-renderer-truth.v1",
  status: rendererTruthReceipts.length ? "declared" : "not-supplied",
  cueReceiptCount: rendererTruthReceipts.length,
  allStatesVisible: rendererTruthReceipts.length > 0 && rendererTruthReceipts.every((receipt) => receipt.allStatesVisible === true),
  silentDefaultCount: rendererTruthReceipts.reduce((sum, receipt) => sum + Number(receipt.silentDefaultCount || 0), 0),
  receipts: rendererTruthReceipts,
};
rendererTruth.ok = rendererTruth.allStatesVisible && rendererTruth.silentDefaultCount === 0;
if (!rendererTruth.ok) throw new Error("Refusing to mint: per-cue renderer truth must be visible with zero silent defaults");
const createdAt = new Date().toISOString();
const card = {
  cardType: "hapa.music-viz.native-show-card.v1",
  cardId: `native-show-card:${director.variantId || graph.runId}`,
  createdAt,
  song: {
    id: graph.song?.id || "",
    title: graph.song?.title || "",
    durationSeconds: graph.song?.durationSeconds || 0,
  },
  showGraph: {
    schemaVersion: graph.schemaVersion,
    runId: graph.runId,
    path: graphPath,
    hash: crypto.createHash("sha256").update(graphBytes).digest("hex"),
    trackCount,
    cardCount,
    activeTrackId: graph.mixer?.activeTrackId || "",
  },
  timeline: {
    path: graphPath,
    compatibilityMode: "none",
    source: "show-graph-v2",
  },
  buffer: {
    telemetryContract: "hapa.music-viz.native-telemetry.v1",
    lastTelemetry: status,
    historyPath: statusPath,
    precomputeGate: "full-target",
    perTrackBuffers: status.perTrackBuffers,
  },
  nativeRuntime: {
    buildConfig: options.buildConfig || "debug",
    command: "hapa-music-viz native-show-graph launch",
    pid: null,
    display: "Native Metal window",
    renderer: "hapa-native-preview",
  },
  artifacts: {
    previewFrame: "",
    video: "",
    exportResult: "",
    logs: path.join(path.dirname(statusPath), "native-buffered-preview.log"),
  },
  rendererTruth,
  provenance: {
    operatorStatePath: "",
    sourcePoolCounts: graph.sourcePoolCounts || {},
    constraints: graph.constraints || {},
    editHistory: graph.edits || [],
    echoDirector: {
      schemaVersion: director.schemaVersion,
      treatmentId: director.treatmentId,
      basePlanId: director.basePlanId,
      cueGraphId: director.cueGraphId,
      variantId: director.variantId,
      variantHash: director.variantHash,
      sourceProjectHash: director.source?.sourceProjectHash || "",
      inputHashes: director.source?.inputHashes || {},
      patchLineage: director.patchLineage || {},
    },
  },
  review: {
    status: "unreviewed",
    reviewer: "Codex runtime gate",
    notes: "Precompute/runtime truth verified; subjective visual acceptance remains human-gated.",
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(card, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, outputPath, cardId: card.cardId, trackCount, cardCount, allTracksAtGate, treatmentId: director.treatmentId, variantHash: director.variantHash }, null, 2));
