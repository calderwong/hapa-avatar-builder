import assert from "node:assert/strict";
import test from "node:test";
import { folderVideoIngestPersistencePlan } from "../scripts/ingest-folder-videos.mjs";

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
