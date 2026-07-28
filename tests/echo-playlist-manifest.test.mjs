import assert from "node:assert/strict";
import test from "node:test";
import { mergeEchoPlaylistManifest } from "../src/domain/echo-playlist-manifest.js";

test("keeps earlier stem bindings while appending current playlist tracks", () => {
  const previous = {
    songs: [{
      id: "existing",
      title: "Existing",
      stems: [{ id: "stem-1", stemType: "Vocals", localPath: "/missing/stem.mp3" }]
    }]
  };
  const current = {
    playlist: { id: "playlist-current" },
    sourceUrl: "https://suno.com/playlist/playlist-current",
    songs: [
      { index: 1, id: "existing", title: "Existing", stems: [] },
      { index: 2, id: "new", title: "New", stems: [{ id: "stem-2", stemType: "Drums", localPath: "/missing/new-stem.mp3" }] }
    ]
  };

  const result = mergeEchoPlaylistManifest(current, previous);

  assert.equal(result.manifest.songs.length, 2);
  assert.deepEqual(result.manifest.songs[0].stems.map((stem) => stem.id), ["stem-1"]);
  assert.deepEqual(result.manifest.songs[1].stems.map((stem) => stem.id), ["stem-2"]);
  assert.equal(result.reconciliation.counts.reusedBuilderTracks, 1);
  assert.equal(result.reconciliation.counts.addedTracks, 1);
  assert.equal(result.reconciliation.counts.addedWithStems, 1);
});
