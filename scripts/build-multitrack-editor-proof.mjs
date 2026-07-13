#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { applyMultitrackOperation, buildMultitrackProjection } from "../src/domain/multitrack-editor.js";

const graphPath = path.resolve(process.argv.find((row) => row.startsWith("--graph="))?.slice(8));
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
fs.mkdirSync(output, { recursive: true });
let graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const media = graph.tracks.find((track) => track.cards.some((card) => !card.visualization)).cards[1];
const visual = graph.tracks.find((track) => track.cards.some((card) => card.visualization)).cards[0];
const operations = [
  { id: "proof:replace", kind: "replace-card", cardId: media.id, media: { id: "proof-replacement", title: "Proof replacement" } },
  { id: "proof:knock", kind: "knock-card", cardId: media.id, knockedOut: true },
  { id: "proof:trim", kind: "trim-card", cardId: media.id, startSeconds: media.startSeconds + .1, endSeconds: media.endSeconds - .1 },
  { id: "proof:blend", kind: "set-blend", cardId: visual.id, blendMode: "plus-lighter" },
  { id: "proof:opacity", kind: "set-opacity", cardId: visual.id, opacity: .42 },
  { id: "proof:stem", kind: "set-stem-map", cardId: visual.id, stemMap: ["master:rms"] },
  { id: "proof:camera", kind: "set-camera", cardId: media.id, motion: "roi-push", intensity: 1.1 },
];
const patches = [];
for (const operation of operations) { const result = applyMultitrackOperation(graph, operation); graph = result.graph; patches.push(result.patch); }
const projection = buildMultitrackProjection(graph);
const report = { schemaVersion: "hapa.director.multitrack-editor-proof.v1", ok: patches.length === 7 && patches.every((patch) => patch.dirtyRange.affectedTrackIds.length && patch.dirtyRange.unchangedTracksByteIdentical) && projection.lanes.every((lane) => lane.items.every((item) => Object.hasOwn(item, "readiness") && Object.hasOwn(item, "rendererSupport"))), laneCount: projection.lanes.length, laneSummary: projection.lanes.map((lane) => ({ id: lane.id, kind: lane.kind, items: lane.items.length })), controls: operations.map((row) => row.kind), patches };
fs.writeFileSync(path.join(output, "patched-show-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, lanes: report.laneSummary, controls: report.controls, patches: patches.length }, null, 2));
if (!report.ok) process.exitCode = 1;
