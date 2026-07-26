import test from "node:test";
import assert from "node:assert/strict";
import {
  COMIC_SONG_INGEST_MANIFEST_VERSION,
  comicSongIds,
  normalizeComicSongManifest,
  validateComicSongManifest
} from "../src/domain/comic-song-ingest.js";
import { mergeSceneGraphExtensions } from "../scripts/ingest-comic-song-package.mjs";

function fixture() {
  return {
    schemaVersion: COMIC_SONG_INGEST_MANIFEST_VERSION,
    author: "Calder",
    packages: [{
      id: "signal-at-the-well",
      title: "Signal at the Well",
      source: { root: "/tmp/signal-at-the-well" },
      song: {
        id: "signal-at-the-well",
        title: "Signal at the Well",
        lyrics: "Wake the signal.\nRing the bell."
      },
      avatars: [
        { id: "avatar-green", name: "Green", role: "lead", performancePerspective: true },
        { id: "avatar-bella", name: "Bella", role: "lead" }
      ],
      pages: [{
        pageNumber: 1,
        title: "The Signal",
        summary: "Green and Bella hear the bell.",
        path: "/tmp/signal-at-the-well/page-01.png"
      }]
    }]
  };
}

test("comic-song manifest normalizes Echo Album lineage and page Avatar defaults", () => {
  const manifest = normalizeComicSongManifest(fixture());
  assert.equal(manifest.album.title, "Dear Papa");
  assert.equal(manifest.album.activeProjection.title, "Echo Album");
  assert.deepEqual(manifest.packages[0].pages[0].avatarIds, ["avatar-green", "avatar-bella"]);
  assert.equal(validateComicSongManifest(manifest).ok, true);
});

test("comic-song IDs remain deterministic across repeat runs", () => {
  const comic = normalizeComicSongManifest(fixture()).packages[0];
  const first = comicSongIds(comic);
  const second = comicSongIds(comic);
  assert.equal(first.songCardId, "dear-papa-song-signal-at-the-well");
  assert.equal(first.sceneId(1), "echo-comic-signal-at-the-well-page-01");
  assert.equal(first.assetId("page", 1), "comic-song-signal-at-the-well-page-01");
  assert.equal(first.sceneId(1), second.sceneId(1));
});

test("comic-song validation rejects unsafe IDs and unknown page Avatars", () => {
  const input = fixture();
  input.packages[0].id = "../unsafe";
  input.packages[0].pages[0].avatarIds = ["avatar-missing"];
  const result = validateComicSongManifest(input);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.includes("lowercase safe identifier")), true);
  assert.equal(result.errors.some((error) => error.includes("unknown Avatar")), true);
});

test("comic-song writes preserve Scene extensions owned by older Builder passes", () => {
  const previous = {
    schemaVersion: "hapa.scene-graph.v1",
    scenes: [{
      id: "scene-existing",
      title: "Before",
      linkedChoiceIds: ["choice-canonical"],
      customStoryField: "preserve-me"
    }]
  };
  const next = {
    schemaVersion: "hapa.scene-graph.v1",
    updatedAt: "2026-07-26T00:00:00.000Z",
    scenes: [{ id: "scene-existing", title: "After", tags: ["scene"] }],
    places: [],
    timelines: [],
    volumes: [],
    episodes: []
  };
  const merged = mergeSceneGraphExtensions(previous, next);
  assert.equal(merged.scenes[0].title, "After");
  assert.deepEqual(merged.scenes[0].linkedChoiceIds, ["choice-canonical"]);
  assert.equal(merged.scenes[0].customStoryField, "preserve-me");
});
