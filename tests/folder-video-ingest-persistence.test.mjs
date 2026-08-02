import assert from "node:assert/strict";
import test from "node:test";
import {
  folderVideoFrameIdentity,
  folderVideoIngestPersistencePlan,
} from "../scripts/ingest-folder-videos.mjs";

test("folder video no-attach mode persists only the media library", () => {
  assert.deepEqual(folderVideoIngestPersistencePlan(true), {
    mediaLibrary: true,
    avatarStore: false,
    tarotStore: false,
    sceneStore: false,
  });
});

test("folder video attach mode may persist all attachment stores", () => {
  assert.deepEqual(folderVideoIngestPersistencePlan(false), {
    mediaLibrary: true,
    avatarStore: true,
    tarotStore: true,
    sceneStore: true,
  });
});

test("folder video frame files use bounded content identities while preserving stable frame IDs", () => {
  const fingerprint = "0123456789abcdef".repeat(4);
  const frame = folderVideoFrameIdentity(fingerprint, "first");

  assert.deepEqual(frame, {
    id: "folder-video-0123456789abcdef-frame-first",
    fileName: "folder-video-0123456789abcdef-frame-first.jpg",
  });
  assert.ok(Buffer.byteLength(frame.fileName, "utf8") < 255);
  assert.doesNotMatch(frame.fileName, /source-name|display-name/);
});

test("folder video frame identities reject malformed fingerprints and markers", () => {
  assert.throws(() => folderVideoFrameIdentity("not-a-fingerprint", "first"), /hexadecimal folder-video fingerprint/);
  assert.throws(() => folderVideoFrameIdentity("a".repeat(64), "poster"), /Unsupported folder-video frame marker/);
});
