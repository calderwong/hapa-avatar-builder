#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { exportPalmierRoundTripPacket, importPalmierRoundTripEdits } from "../src/domain/palmier-roundtrip.js";
import { contextHash } from "../src/domain/song-context-packet.js";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
const graphPath = path.resolve(process.argv.find((row) => row.startsWith("--graph="))?.slice(8));
const catalogPath = path.resolve(process.argv.find((row) => row.startsWith("--catalog="))?.slice(10));
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const sourceHash = contextHash(graph);
const packet = exportPalmierRoundTripPacket(graph, { unifiedCatalog: catalog, title: "Dear Papa Director v2 Palmier Review", handlesSeconds: 1.25 });
const card = graph.tracks[0].cards[1];
const edits = [
  { id: "palmier:trim:1", kind: "trim", clipId: card.id, startSeconds: card.startSeconds + .1, endSeconds: card.endSeconds - .1 },
  { id: "palmier:replacement:1", kind: "replacement", clipId: card.id, media: { id: "palmier-reviewed-replacement", title: "Palmier reviewed replacement", localPath: card.media.localPath } },
  { id: "palmier:annotation:1", kind: "annotation", clipId: card.id, atSeconds: card.startSeconds + 1.2, note: "Protect the breath before the phrase cut." },
  { id: "palmier:branch:1", kind: "branch-candidate", clipId: card.id, outputPath: "/exports/dear-papa-palmier-branch.mov", contentHash: "c".repeat(64), palmierProjectId: "dear-papa-director-v2-review" },
];
const imported = importPalmierRoundTripEdits({ packet, currentGraph: graph, edits, operator: "proof-reviewer", importedAt: "2026-07-11T09:00:00Z" });
const changedGraph = structuredClone(graph);
changedGraph.tracks[0].cards[2].endSeconds += .25;
const conflictPacket = exportPalmierRoundTripPacket(graph, { unifiedCatalog: catalog });
const conflict = importPalmierRoundTripEdits({ packet: conflictPacket, currentGraph: changedGraph, edits: [{ id: "palmier:conflict:1", kind: "trim", clipId: changedGraph.tracks[0].cards[2].id, startSeconds: changedGraph.tracks[0].cards[2].startSeconds, endSeconds: changedGraph.tracks[0].cards[2].endSeconds - .1 }], operator: "proof-reviewer", importedAt: "2026-07-11T09:00:00Z" });
const projectPatch = { schemaVersion: "hapa.avatar-builder.project-settings-patch.v1", projectId: graph.song.id, palmier_roundtrip_packet: packet, palmier_branch_candidates: imported.branchCandidates, palmier_roundtrip_conflicts: conflict.conflicts, director_show_graph_child_variant: { id: imported.newVariantId, parentVariantId: imported.parentVariantId, graph: imported.patchedGraph }, nonDestructive: true };
const report = { schemaVersion: "hapa.video-collab.palmier.roundtrip-proof.v1", ok: sourceHash === contextHash(graph) && imported.nonDestructive && imported.acceptedEditIds.length === 4 && imported.branchCandidates.length === 1 && imported.patchedGraph.directorV2.variantId !== graph.directorV2.variantId && conflict.conflicts[0]?.reason === "source-changed-since-export", sourceGraphUnchanged: sourceHash === contextHash(graph), packet: { schemaVersion: packet.schema_version, protocolId: packet.protocol_id, packetHash: packet.provenance.packet_hash, clips: packet.timeline.clips.length, lockedCueReferences: packet.timeline.clips.reduce((sum, clip) => sum + clip.locked_cue_ids.length, 0), stems: packet.stems.length, captions: packet.captions.length, clipsWithProxy: packet.timeline.clips.filter((clip) => clip.media.proxy).length, unsupportedNativeLayers: packet.unsupported_native_layers }, import: { parentVariantId: imported.parentVariantId, newVariantId: imported.newVariantId, acceptedEditIds: imported.acceptedEditIds, annotations: imported.annotations, branchCandidates: imported.branchCandidates, reviewStatus: imported.reviewStatus }, conflictProof: conflict.conflicts, avatarBuilderVisibilityPatch: "avatar-builder-project-patch.json", overwatchVisibility: "append-only card completion event" };
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "palmier-project-packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
fs.writeFileSync(path.join(output, "palmier-edit-import.json"), `${JSON.stringify(imported, null, 2)}\n`);
fs.writeFileSync(path.join(output, "avatar-builder-project-patch.json"), `${JSON.stringify(projectPatch, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, clips: report.packet.clips, cues: report.packet.lockedCueReferences, stems: report.packet.stems, captions: report.packet.captions, proxies: report.packet.clipsWithProxy, acceptedEdits: report.import.acceptedEditIds.length, branchCandidates: report.import.branchCandidates.length, conflicts: report.conflictProof.length, sourceGraphUnchanged: report.sourceGraphUnchanged }, null, 2));
if (!report.ok) process.exitCode = 1;
