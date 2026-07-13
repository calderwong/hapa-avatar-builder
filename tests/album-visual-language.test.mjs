import test from "node:test";
import assert from "node:assert/strict";
import { buildAlbumFatigueLedger, buildAlbumVisualBible, inheritAlbumVisualBible } from "../src/domain/album-visual-language.js";

const songs = [{ id: "a", title: "A", mood: "dark", performancePerspective: { avatar_id: "red", team_color: "red" } }, { id: "b", title: "B", mood: "bright", performancePerspective: { avatar_id: "blue", team_color: "blue" } }];
test("songs inherit a stable bible and departures require reasons", () => {
  const bible = buildAlbumVisualBible(songs);
  assert.equal(inheritAlbumVisualBible(bible, "a").bibleHash, bible.bibleHash);
  assert.throws(() => inheritAlbumVisualBible(bible, "a", [{ field: "visualizerFamily", value: "x" }]), /reason/);
  assert.equal(inheritAlbumVisualBible(bible, "a", [{ field: "visualizerFamily", value: "x", reason: "Bridge breaks the album grammar." }]).effective.visualizerFamily, "x");
});
test("setlist reorder preserves identity and reserves each hero for its own song", () => {
  const bible = buildAlbumVisualBible(songs); const graphs = { a: { tracks: [] }, b: { tracks: [] } };
  const one = buildAlbumFatigueLedger({ bible, graphs, setlist: ["a", "b"] }); const two = buildAlbumFatigueLedger({ bible, graphs, setlist: ["b", "a"] });
  assert.equal(one.songIdentityIds.a, two.songIdentityIds.a);
  assert.equal(two.heroMomentsExhaustedEarly, false);
  assert.ok(two.heroSchedule.every((row) => row.consumedByOwnSongOnly));
});
