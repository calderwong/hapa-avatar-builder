import test from "node:test";
import assert from "node:assert/strict";
import dearPapaSongbook from "../data/dear-papa-songbook.json" with { type: "json" };
import {
  HAPA_SONG_STORE_VERSION,
  addSongStoryBeat,
  attachAvatarToSong,
  attachCardToSong,
  attachSceneToSong,
  attachSongMedia,
  attachVisualizerToSong,
  createHapaSongStoreFromDearPapaSongbook,
  normalizeHapaSong
} from "../src/domain/song.js";

test("Dear Papa songbook normalizes into Hapa Song cards", () => {
  const store = createHapaSongStoreFromDearPapaSongbook(dearPapaSongbook);
  assert.equal(store.schemaVersion, HAPA_SONG_STORE_VERSION);
  assert.equal(store.scope.albumTitle, "Dear Papa");
  assert.equal(store.songs.length, dearPapaSongbook.songCards.length);
  assert.equal(store.audit.songs, dearPapaSongbook.songCards.length);
  assert.ok(store.audit.songs >= 51);
  assert.ok(store.audit.withLyrics > 0);
  assert.equal(store.visualizerCatalog.some((visualizer) => visualizer.id === "builtin:spectrum-nebula"), true);
  const firstSong = store.songs[0];
  assert.equal(firstSong.albumTitle, "Dear Papa");
  assert.ok(firstSong.lyrics.status);
  assert.ok(firstSong.lineage.sourceCardId);
});

test("song attachments preserve avatars, scenes, media, visualizers, and story beats", () => {
  const store = createHapaSongStoreFromDearPapaSongbook(dearPapaSongbook);
  let song = store.songs[0];
  song = attachAvatarToSong(song, { id: "avatar-red", primaryName: "Red" });
  song = attachCardToSong(song, { id: "card-red-forge", title: "Red Forge" }, {
    avatarId: "avatar-red",
    avatarName: "Red",
    canonReason: "Red chooses the card and song as a kit pairing."
  });
  song = attachSceneToSong(song, { id: "scene-bridge", title: "Bridge Beat", placeId: "hss-bridge" });
  song = attachSongMedia(song, {
    id: "media-loop",
    name: "Bridge Loop.mp4",
    uri: "/media/bridge-loop.mp4",
    type: "video",
    tags: ["loop"]
  });
  song = attachVisualizerToSong(song, { id: "builtin:cymatic-rings", label: "Cymatic Rings", family: "built-in" });
  song = addSongStoryBeat(song, {
    authorType: "avatar",
    authorName: "Red",
    avatarId: "avatar-red",
    sceneId: "scene-bridge",
    body: "Red hears the song as a bridge-crossing vow."
  });
  assert.equal(song.attachments.avatarLinks.some((link) => link.avatarId === "avatar-red"), true);
  assert.equal(song.attachments.cardLinks.some((link) => link.cardId === "card-red-forge"), true);
  assert.equal(song.attachments.sceneLinks.some((link) => link.sceneId === "scene-bridge"), true);
  assert.equal(song.media[0].lineage.parentSongId, song.songId);
  assert.equal(song.visualizers[0].id, "builtin:cymatic-rings");
  assert.equal(song.storyBeats[0].body.includes("bridge-crossing"), true);
});

test("song normalization preserves exact lyric timing sidecar word data", () => {
  const song = normalizeHapaSong({
    id: "timed-song",
    title: "Timed Song",
    lyricTimings: [
      {
        start: 1.234,
        end: 2.345,
        text: "hold the line",
        section_label: "Verse 1",
        confidence: 0.91,
        words: [
          { text: "hold", start: 1.234, end: 1.58, matched: true },
          { word: "the", start: 1.59, end: 1.76, matched: true },
          { token: "line", start: 1.8, end: 2.345, matched: true }
        ]
      }
    ]
  });

  assert.equal(song.lyricTimings.length, 1);
  assert.equal(song.lyricTimings[0].section_label, "Verse 1");
  assert.equal(song.lyricTimings[0].confidence, 0.91);
  assert.deepEqual(song.lyricTimings[0].words.map((word) => word.word), ["hold", "the", "line"]);
  assert.equal(song.lyricTimings[0].words[0].start, 1.234);
});
