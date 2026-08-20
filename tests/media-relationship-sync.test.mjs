import test from "node:test";
import assert from "node:assert/strict";
import { createSystemMediaLibrary } from "../src/domain/systemMedia.js";
import { upsertMediaAttachmentRecord } from "../src/domain/mediaRelationshipSync.js";

test("persisted media under the same long directory receives distinct record identities", () => {
  const sharedRoot = "/Users/calderwong/Documents/Codex/2026-06-10/files-mentioned-by-the-user-screenshot/outputs/hapa-avatar-builder/data/media";
  const relationship = { ownerType: "library", ownerId: "system-media", ownerName: "System Media Library", role: "persisted-media" };
  const first = {
    id: "media-transition-a",
    name: "transition-a.mp4",
    uri: "/media/transition-a.mp4",
    mimeType: "video/mp4",
    storage: { path: `${sharedRoot}/transition-a.mp4` },
  };
  const second = {
    id: "media-transition-b",
    name: "transition-b.mp4",
    uri: "/media/transition-b.mp4",
    mimeType: "video/mp4",
    storage: { path: `${sharedRoot}/transition-b.mp4` },
  };

  const afterFirst = upsertMediaAttachmentRecord(createSystemMediaLibrary(), first, relationship, { sourceKind: "persisted-media" });
  const afterSecond = upsertMediaAttachmentRecord(afterFirst, second, relationship, { sourceKind: "persisted-media" });

  assert.equal(afterSecond.records.length, 2);
  assert.equal(new Set(afterSecond.records.map((record) => record.id)).size, 2);
  assert.deepEqual(new Set(afterSecond.records.map((record) => record.uri)), new Set([first.uri, second.uri]));
});

test("repeating the same persisted media upserts its existing record", () => {
  const relationship = { ownerType: "scene", ownerId: "scene-1", ownerName: "Scene 1", role: "scene_videos" };
  const asset = {
    id: "media-loop",
    name: "loop.mp4",
    uri: "/media/loop.mp4",
    mimeType: "video/mp4",
    storage: { path: "/tmp/hapa/media/loop.mp4" },
  };

  const first = upsertMediaAttachmentRecord(createSystemMediaLibrary(), asset, relationship, { now: "2026-08-20T20:00:00.000Z" });
  const second = upsertMediaAttachmentRecord(first, { ...asset, name: "loop-renamed.mp4" }, relationship, { now: "2026-08-20T20:01:00.000Z" });

  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].name, "loop-renamed.mp4");
  assert.equal(second.records[0].updatedAt, "2026-08-20T20:01:00.000Z");
});
