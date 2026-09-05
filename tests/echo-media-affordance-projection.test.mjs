import test from "node:test";
import assert from "node:assert/strict";
import { projectEchoMediaAffordance } from "../src/domain/echo-media-affordance-projection.js";
const technical = { contentHash: { value: "a".repeat(64) }, contactFrames: [{ uri: "/contacts/1.jpg" }], posterUri: "/poster.jpg", durationSec: 8, width: 1920, height: 1080, fps: 24 };

test("technical analysis preserves human palette, tags, semantic review and origin evidence", () => {
  const asset = { id: "asset", tags: ["camera-push-in", "authored-tag"], colorPalette: ["#123456"], thumbnailUri: "/authored.jpg", origin: { author: "artist" }, metadata: { echosSemanticAffordance: { status: "human-reviewed", artifactId: "original", reviewer: "artist" }, privateNotes: "Keep the sunset" } };
  const before = structuredClone(asset);
  const projected = projectEchoMediaAffordance(asset, technical, "scene-store");
  assert.deepEqual(asset, before);
  for (const key of ["tags", "colorPalette", "thumbnailUri", "origin"]) assert.deepEqual(projected[key], before[key]);
  assert.deepEqual(projected.metadata.echosSemanticAffordance, before.metadata.echosSemanticAffordance);
  assert.equal(projected.metadata.privateNotes, before.metadata.privateNotes);
  assert.equal(projected.metadata.width, 1920);
});

test("missing semantic fields receive explicitly inferred, source-bound evidence without review claims", () => {
  const projected = projectEchoMediaAffordance({ id: "asset", metadata: { objects: ["door"] } }, technical, "scene-store");
  const semantics = projected.metadata.echosSemanticAffordance;
  assert.equal(semantics.status, "inferred-unreviewed");
  assert.equal(semantics.reviewStatus, "unreviewed");
  assert.equal(semantics.model, null);
  assert.equal(semantics.artifactId, `sha256:${technical.contentHash.value}`);
  assert.deepEqual(semantics.fields.objects.value, ["door"]);
  assert.equal(semantics.fields.objects.status, "inferred");
});
