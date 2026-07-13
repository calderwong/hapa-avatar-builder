#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { applyDirtyRangePatch, dirtyRangeBufferInvalidations } from "../src/domain/dirty-range-rebuild.js";

const graphPath = path.resolve(process.argv.find((row) => row.startsWith("--graph="))?.slice(8));
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
fs.mkdirSync(output, { recursive: true });
let graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const edits = [
  { id: "edit:replace-card", kind: "card-replacement", cardId: graph.tracks[0].cards[3].id, reason: "human-media-replacement" },
  { id: "edit:trim-phrase", kind: "timing-edit", atSeconds: 22.5, endSeconds: 24.8, reason: "lyric-phrase-trim" },
  { id: "edit:remap-stem", kind: "stem-map-change", atSeconds: 31, reason: "synth-to-master-fallback" },
  { id: "edit:source-update", kind: "source-update", mediaId: graph.tracks[0].cards[6].media.id, reason: "proxy-source-hash-change" },
];
const receipts = [];
for (const edit of edits) {
  const before = graph;
  const result = applyDirtyRangePatch(graph, edit, (card) => ({ ...card, provenance: { ...(card.provenance || {}), dirtyProofEditId: edit.id } }));
  graph = result.graph;
  receipts.push({ ...result.receipt, bufferInvalidations: dirtyRangeBufferInvalidations(result.receipt), fullGraphBytes: Buffer.byteLength(JSON.stringify(before)), affectedTrackBytes: result.graph.tracks.filter((track) => result.receipt.affectedTrackIds.includes(track.id)).reduce((sum, track) => sum + Buffer.byteLength(JSON.stringify(track)), 0) });
}
const report = { schemaVersion: "hapa.show-graph.dirty-range-proof.v1", ok: receipts.every((row) => row.earliestDirtySeconds >= 0 && row.affectedTrackIds.length && row.dependencyReasons.length && Object.keys(row.rebuiltArtifactHashes).length === row.affectedTrackIds.length && row.unchangedTracksByteIdentical && row.bufferInvalidations.every((invalidation) => invalidation.schemaVersion === "hapa.show-graph.dirty-range.v1")), sourceGraph: graphPath, editCount: edits.length, totalFullGraphBytes: receipts.reduce((sum, row) => sum + row.fullGraphBytes, 0), totalAffectedTrackBytes: receipts.reduce((sum, row) => sum + row.affectedTrackBytes, 0), receipts };
report.rebuildByteRatio = report.totalAffectedTrackBytes / report.totalFullGraphBytes;
fs.writeFileSync(path.join(output, "patched-show-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, edits: report.editCount, rebuildByteRatio: report.rebuildByteRatio, receipts: receipts.map((row) => ({ editId: row.editId, earliestDirtySeconds: row.earliestDirtySeconds, endDirtySeconds: row.endDirtySeconds, tracks: row.affectedTrackIds, reasons: row.dependencyReasons })) }, null, 2));
if (!report.ok) process.exitCode = 1;
