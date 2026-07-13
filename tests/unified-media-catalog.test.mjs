import test from "node:test";
import assert from "node:assert/strict";
import { createUnifiedMediaAsset, mergeUnifiedMediaAssets, queryUnifiedMediaCatalog } from "../src/domain/unified-media-catalog.js";

const hash = "a".repeat(64);
test("content hash deduplicates originals while retaining renditions, relationships, rights, and provenance", () => {
  const one = createUnifiedMediaAsset({ contentHash: hash, mediaType: "video", original: { sourcePath: "/a.mp4" }, renditions: [{ role: "poster", uri: "/a.jpg" }], relationships: [{ ownerId: "card-1" }], rights: { licensingStatus: "operator-authored" }, provenance: [{ adapterId: "cards" }] });
  const two = createUnifiedMediaAsset({ contentHash: hash, mediaType: "video", original: { sourcePath: "/a.mp4" }, renditions: [{ role: "proxy", uri: "/proxy.mp4" }], relationships: [{ ownerId: "scene-1" }], provenance: [{ adapterId: "echo" }] });
  const catalog = mergeUnifiedMediaAssets([one, two]);
  assert.equal(catalog.assets.length, 1);
  assert.equal(catalog.assets[0].renditions.length, 2);
  assert.equal(catalog.assets[0].relationships.length, 2);
  assert.equal(catalog.assets[0].id, `hapa-media:sha256:${hash}`);
});

test("Echo and Music Viz queries return byte-identical IDs and technical metadata", () => {
  const asset = createUnifiedMediaAsset({ contentHash: hash, mediaType: "video", original: { sourcePath: "/a.mp4" }, analysis: { status: "verified-source-file", width: 1280, height: 720 }, relationships: [{ ownerId: "song-1" }] });
  const catalog = mergeUnifiedMediaAssets([asset]);
  const echo = queryUnifiedMediaCatalog(catalog, { relationshipIds: ["song-1"], requireVerifiedTechnical: true });
  const musicViz = queryUnifiedMediaCatalog(catalog, { relationshipIds: ["song-1"], requireVerifiedTechnical: true });
  assert.deepEqual(echo, musicViz);
});

test("invalid or path-derived hashes are rejected", () => {
  assert.throws(() => createUnifiedMediaAsset({ contentHash: "path-fingerprint", original: { sourcePath: "/a" } }), /SHA-256/);
});
