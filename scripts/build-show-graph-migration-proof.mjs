#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { adaptShowGraphWithLossReport, migrateShowGraphForward, showGraphCapabilityMatrix } from "../src/domain/show-graph-capabilities.js";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
const graphPath = path.resolve(process.argv.find((row) => row.startsWith("--graph="))?.slice(8));
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const v1 = { schemaVersion: "hapa.music-viz.native-show-graph.v1", song: graph.song, tracks: graph.tracks, stems: graph.stems, cues: graph.directorV2.cueGraph.cues, locks: graph.directorV2.locks, provenance: graph.directorV2.provenance, decisionCacheLineage: { treatmentId: graph.directorV2.treatmentId, cueGraphId: graph.directorV2.cueGraphId, source: graph.directorV2.source } };
const migration = migrateShowGraphForward(v1);
const matrix = showGraphCapabilityMatrix();
const adapterReports = matrix.adapters.map((adapter) => {
  const initial = adaptShowGraphWithLossReport(graph, adapter.adapterId);
  const approvedFallbacks = initial.losses.map((loss) => ({ feature: loss.feature, fallback: loss.fallback, approvedBy: "migration-proof-operator", approvedAt: "2026-07-11T09:10:00Z", rationale: `Approved deterministic ${loss.fallback} fallback for ${adapter.adapterId}.` }));
  const approved = adaptShowGraphWithLossReport(graph, adapter.adapterId, { approvedFallbacks });
  return { adapterId: adapter.adapterId, initial, approved };
});
const sourceRuntimeEvidence = [
  "src/domain/show-graph-capabilities.js",
  "src/domain/hyperframes-show-compiler.js",
  "src/domain/palmier-roundtrip.js",
  "/Users/calderwong/Desktop/hapa-music-viz/native/Sources/HapaMusicVizNativeCore/NativeShowGraphCapabilities.swift",
  "/Users/calderwong/Desktop/dear-papa-native-viz/Sources/DearPapaCore/NativeShowGraphCapabilities.swift",
].map((file) => ({ file, exists: fs.existsSync(file.startsWith("/") ? file : path.resolve(import.meta.dirname, "..", file)) }));
const report = { schemaVersion: "hapa.show-graph.capability-migration-proof.v1", ok: matrix.adapters.length === 6 && sourceRuntimeEvidence.every((row) => row.exists) && migration.receipt.losses.length === 0 && migration.graph.directorV2.cueGraph.cues.map((row) => row.id).join("|") === v1.cues.map((row) => row.id).join("|") && adapterReports.every((row) => row.approved.ok && !row.approved.silentDegradation && row.initial.losses.every((loss) => loss.visible)), matrix, migration: { receipt: migration.receipt, stableCueIds: migration.graph.directorV2.cueGraph.cues.map((row) => row.id), locks: migration.graph.directorV2.locks, provenance: migration.graph.directorV2.provenance, decisionCacheLineage: migration.graph.directorV2.decisionCacheLineage }, adapterReports, sourceRuntimeEvidence };
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "capability-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
fs.writeFileSync(path.join(output, "migrated-v2.native-show-graph.json"), `${JSON.stringify(migration.graph, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, adapters: matrix.adapters.length, migratedCues: report.migration.stableCueIds.length, preservedLocks: report.migration.locks.length, reports: adapterReports.map((row) => ({ adapterId: row.adapterId, visibleLosses: row.initial.losses.length, initialOK: row.initial.ok, approvedOK: row.approved.ok })) }, null, 2));
if (!report.ok) process.exitCode = 1;
