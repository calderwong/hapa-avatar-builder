import test from "node:test";
import assert from "node:assert/strict";
import dearPapaSongbook from "../data/dear-papa-songbook.json" with { type: "json" };
import {
  HAPA_SONG_STORE_VERSION,
  HAPA_SONG_MINT_PROJECTION_VERSION,
  addSongStoryBeat,
  attachAvatarToSong,
  attachCardToSong,
  attachSceneToSong,
  attachSongMedia,
  attachVisualizerToSong,
  auditHapaSongStore,
  createHapaSongStoreFromDearPapaSongbook,
  normalizeHapaSong,
  normalizeHapaSongStore
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

test("song normalization preserves reviewable reference connectors and context layers", () => {
  const song = normalizeHapaSong({
    id: "reference-song",
    title: "Reference Song",
    referenceConnectors: [{
      id: "reference-song:star-fox:line-3",
      referenceId: "star-fox",
      referenceTitle: "Star Fox 64",
      target: { songId: "reference-song", lineStart: 3, lyricText: "Do a barrel roll", matchedText: "barrel roll" },
      semanticEffect: {
        withoutContext: "A flight instruction.",
        withContext: "A mentor voice remembered through controller motion.",
        thematicShift: "Navigation becomes inherited guidance.",
        expositionFunction: "The command imports a story and a tactile memory.",
        traversalEdges: ["mentor", "controller-memory"]
      }
    }],
    contextualLayers: [{
      id: "public-story-worlds",
      label: "Public story worlds",
      referenceIds: ["star-fox"],
      connectorIds: ["reference-song:star-fox:line-3"],
      changesExpositionBy: "Loading a prior game world."
    }]
  });

  assert.equal(song.referenceConnectors.length, 1);
  assert.equal(song.referenceConnectors[0].target.lineStart, 3);
  assert.equal(song.referenceConnectors[0].provenance.reviewStatus, "assistant-analyzed-pending-human-review");
  assert.deepEqual(song.referenceConnectors[0].semanticEffect.traversalEdges, ["mentor", "controller-memory"]);
  assert.equal(song.contextualLayers[0].referenceIds[0], "star-fox");
});

test("song store preserves comparative reference graph edges", () => {
  const store = normalizeHapaSongStore({
    referenceGraphEdges: [{
      fromReferenceId: "incarnations",
      toReferenceId: "ff8",
      relationType: "role-outlives-holder",
      score: 0.8
    }]
  });
  assert.equal(store.referenceGraphEdges.length, 1);
  assert.equal(store.referenceGraphEdges[0].relationType, "role-outlives-holder");
});

test("song audit separates candidate, comparative, and total reviewable connectors", () => {
  const audit = auditHapaSongStore([{ referenceConnectors: [
    { evidence: { classification: "candidate-phonetic" } },
    { evidence: { classification: "comparative-mechanical-resonance" } },
    { evidence: { classification: "explicit-name-cluster" } }
  ] }]);
  assert.equal(audit.candidateReferenceConnectorCount, 1);
  assert.equal(audit.comparativeReferenceConnectorCount, 1);
  assert.equal(audit.reviewableReferenceConnectorCount, 2);
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

test("song normalization preserves the separate immutable mint-head projection without absorbing edition custody", () => {
  const song = normalizeHapaSong({
    id: "minted-song",
    songId: "minted-song",
    title: "Minted Song",
    songCardMint: {
      headId: "song-card:minted-song",
      latestEdition: 2,
      latestEditionId: "song-card:minted-song:edition:2",
      semanticFingerprint: "sha256:edition-two",
      publishStatus: "private-demo",
      migrationReceipts: [{ from: "hapa.song-card.v1", status: "compatible" }],
      futureCompatibleField: { retained: true }
    }
  });

  assert.equal(song.songCardMint.schemaVersion, HAPA_SONG_MINT_PROJECTION_VERSION);
  assert.equal(song.songCardMint.latestEdition, 2);
  assert.equal(song.songCardMint.editionCount, 2);
  assert.equal(song.songCardMint.futureCompatibleField.retained, true);
  assert.deepEqual(song.songCardMint.migrationReceipts, [{ from: "hapa.song-card.v1", status: "compatible" }]);
  assert.equal(Object.hasOwn(song.songCardMint, "editions"), false, "immutable edition bodies stay in the mint ledger");
});
