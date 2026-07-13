import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { exportPalmierRoundTripPacket, importPalmierRoundTripEdits } from "../src/domain/palmier-roundtrip.js";
import { contextHash } from "../src/domain/song-context-packet.js";

const graph = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/native-show-graph.json", "utf8"));

test("export preserves stable clip/cue IDs, handles, stems, captions, provenance, and unsupported layers", () => {
  const packet = exportPalmierRoundTripPacket(graph);
  assert.equal(packet.schema_version, "hapa.video-collab.palmier.director-roundtrip.v1");
  assert.equal(packet.timeline.clips[0].clip_id, graph.tracks[0].cards[0].id);
  assert.ok(packet.timeline.clips.every((clip) => clip.snapshot.contentHash && clip.handles));
  assert.equal(packet.stems.length, graph.stems.items.length);
  assert.equal(packet.captions.length, graph.song.lyricOverlay.lines.length);
  assert.ok(packet.unsupported_native_layers.length);
});

test("reimport creates a child variant and branch candidate without mutating canonical graph", () => {
  const before = contextHash(graph);
  const packet = exportPalmierRoundTripPacket(graph);
  const card = graph.tracks[0].cards[0];
  const result = importPalmierRoundTripEdits({ packet, currentGraph: graph, operator: "reviewer", importedAt: "2026-07-11T09:00:00Z", edits: [{ id: "trim-1", kind: "trim", clipId: card.id, startSeconds: card.startSeconds + .1, endSeconds: card.endSeconds - .1 }, { id: "note-1", kind: "annotation", clipId: card.id, atSeconds: card.startSeconds + 1, note: "Hold longer on the breath." }, { id: "branch-1", kind: "branch-candidate", clipId: card.id, outputPath: "/exports/branch.mov", contentHash: "b".repeat(64) }] });
  assert.equal(contextHash(graph), before);
  assert.equal(result.nonDestructive, true);
  assert.match(result.newVariantId, /^variant:palmier:/);
  assert.equal(result.branchCandidates[0].approvalStatus, "pending-human-review");
  assert.equal(result.patchedGraph.directorV2.patchLineage.parentVariantId, packet.immutable_parent.variant_id);
});

test("source changes become explicit conflicts", () => {
  const packet = exportPalmierRoundTripPacket(graph);
  const changed = structuredClone(graph);
  changed.tracks[0].cards[0].endSeconds += .25;
  const result = importPalmierRoundTripEdits({ packet, currentGraph: changed, edits: [{ id: "trim-conflict", kind: "trim", clipId: changed.tracks[0].cards[0].id, startSeconds: 0, endSeconds: 1 }] });
  assert.equal(result.acceptedEditIds.length, 0);
  assert.equal(result.conflicts[0].reason, "source-changed-since-export");
});
