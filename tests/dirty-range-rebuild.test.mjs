import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyDirtyRangePatch, dirtyRangeBufferInvalidations, planDirtyRange } from "../src/domain/dirty-range-rebuild.js";

const graph = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/native-show-graph.json", "utf8"));

test("card edits rebuild one range and preserve untouched tracks byte-for-byte", () => {
  const source = structuredClone(graph);
  const card = graph.tracks[0].cards[2];
  const result = applyDirtyRangePatch(graph, { id: "replace:1", kind: "card-replacement", cardId: card.id, reason: "human-media-replacement" }, (row) => row.id === card.id ? { ...row, media: { ...row.media, id: "replacement" } } : row);
  assert.equal(result.receipt.earliestDirtySeconds, Math.max(0, card.startSeconds - 0.5));
  assert.deepEqual(result.receipt.affectedTrackIds, [graph.tracks[0].id]);
  assert.ok(result.receipt.rebuiltArtifactHashes[graph.tracks[0].id]);
  assert.equal(result.receipt.unchangedTracksByteIdentical, true);
  assert.deepEqual(graph, source, "incremental rebuild must not mutate the source graph");
  for (const track of graph.tracks.slice(1)) assert.equal(JSON.stringify(result.graph.tracks.find((row) => row.id === track.id)), JSON.stringify(track));
  assert.deepEqual(dirtyRangeBufferInvalidations(result.receipt).map((row) => row.trackId), result.receipt.affectedTrackIds);
});

test("timing and stem-map edits include dependent transitions and tracks", () => {
  const timing = planDirtyRange(graph, { kind: "timing-edit", atSeconds: 10, endSeconds: 12, reason: "trim" });
  assert.ok(timing.dependencyReasons.includes("adjacent-transition-handle"));
  assert.ok(timing.earliestDirtySeconds <= 9.5 && timing.endDirtySeconds >= 12.5);
  const stems = planDirtyRange(graph, { kind: "stem-map-change", atSeconds: 20, reason: "remap-synth" });
  assert.ok(stems.dependencyReasons.includes("visualizer-and-modulation-dependency"));
  assert.ok(stems.affectedTrackIds.includes("track-b"));
});

test("Music Viz Native consumes the same dirty-range schema", () => {
  const source = fs.readFileSync("/Users/calderwong/Desktop/hapa-music-viz/native/Sources/HapaMusicVizNativeCore/NativeDirtyRange.swift", "utf8");
  assert.match(source, /hapa\.show-graph\.dirty-range\.v1/);
  assert.match(source, /earliestDirtySeconds/);
  assert.match(source, /bufferInvalidations/);
});
