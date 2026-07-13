import test from "node:test";
import assert from "node:assert/strict";
import { compileSongCardAppearanceIndex, createPrintedSongCard, querySongCardAppearances } from "../src/domain/song-card-mint.js";

const graph = {
  song: { id: "song", durationSeconds: 6 },
  tracks: [
    { id: "a", role: "foundation", cards: [{ id: "a0", startSeconds: 0, endSeconds: 3, media: { id: "mutable-card", title: "Original Media" } }] },
    { id: "b", role: "visualizer", cards: [{ id: "b0", startSeconds: 2, endSeconds: 5, visualization: { sourceId: "isf:one", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:one", title: "Frozen Shader" } } }] },
    { id: "c", role: "accent", cards: [{ id: "c0", startSeconds: 2, endSeconds: 2.5, media: { id: "accent", title: "Accent" }, zOrder: 999 }, { id: "knocked", startSeconds: 0, endSeconds: 6, knockedOut: true, media: { id: "no" } }] },
  ],
};

test("appearance index uses exact half-open boundaries, stable overlap order, explicit gaps, and pure-IVF snapshots", () => {
  const index = compileSongCardAppearanceIndex({ showGraph: graph, cardSnapshots: { "mutable-card": { id: "mutable-card", title: "Historical Original", revision: 1 } } });
  assert.equal(querySongCardAppearances(index, 1999).active.length, 1);
  const overlap = querySongCardAppearances(index, 2000);
  assert.equal(overlap.active.length, 3);
  assert.equal(overlap.primary.sourceCardId, "accent");
  assert.equal(querySongCardAppearances(index, 2500).active.some((row) => row.sourceCardId === "accent"), false);
  assert.equal(querySongCardAppearances(index, 3000).active.some((row) => row.sourceCardId === "mutable-card"), false);
  assert.equal(querySongCardAppearances(index, 5200).truthStatus, "no-card");
  assert.equal(querySongCardAppearances(index, 6000).truthStatus, "end-of-media");
  assert.equal(index.gaps.length, 1);
  assert.equal(index.appearances.find((row) => row.sourceCardId === "isf:one").snapshot.title, "Frozen Shader");
});

test("printed cards remain edition-pinned after the mutable source changes or disappears", () => {
  const index = compileSongCardAppearanceIndex({ showGraph: graph, cardSnapshots: { "mutable-card": { id: "mutable-card", title: "Historical Original", revision: 1 } } });
  const appearance = querySongCardAppearances(index, 1000).primary;
  const head = { id: "song-card:song", songId: "song" };
  const edition = { id: "song-card:song:edition:1", edition: 1, artifacts: [{ role: "master", sha256: "sha256:render" }] };
  const printed = createPrintedSongCard({ head, edition, appearance, timestampMs: 1000, activeAppearances: [appearance] });
  assert.equal(printed.title, "Historical Original");
  assert.equal(printed.revision, 1);
  assert.equal(printed.songCardPrint.sourceDigest, appearance.sourceDigest);
  assert.equal(printed.songCardPrint.edition, 1);
});
