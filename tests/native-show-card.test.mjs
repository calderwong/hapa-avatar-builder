import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("minted Dear Papa Native Show Card cites Echo treatment and variant lineage", () => {
  const file = "./work/director-v2-contract-refresh/native-show-card.json";
  if (!fs.existsSync(file)) return;
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(card.cardType, "hapa.music-viz.native-show-card.v1");
  assert.equal(card.showGraph.trackCount, 3);
  assert.ok(card.provenance.echoDirector.treatmentId.startsWith("treatment:"));
  assert.ok(card.provenance.echoDirector.variantHash.length === 64);
  assert.ok(card.buffer.perTrackBuffers.every((track) => track.bufferSecondsReady >= track.targetSeconds));
  assert.equal(card.review.status, "unreviewed");
});
