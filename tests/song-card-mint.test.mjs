import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSongCardEdition,
  buildSongCardHead,
  buildSongCardMintSnapshot,
  buildSongCardSnapshotRegistry,
  compileSongCardAppearanceIndex,
  diffSongCardMintSnapshots,
  fingerprintSongCardMintSnapshot,
  isPrivateLocalReference,
  migrateLegacySongCard,
  validateSongCardEdition,
} from "../src/domain/song-card-mint.js";

test("snapshot registry deduplicates aliases of the same canonical Card", () => {
  const card = { id: "avatar-25", schemaVersion: "hapa.avatar-card.v1", primaryName: "Calder", revision: 25 };
  const registry = buildSongCardSnapshotRegistry({ "timeline-card": card, "avatar-25": structuredClone(card) });
  assert.equal(Object.keys(registry.snapshots).length, 1);
  assert.equal(registry.references["timeline-card"], registry.references["avatar-25"]);
});

test("portable-reference detection rejects encoded traversal and embedded local paths while preserving canonical public roots", () => {
  for (const value of [
    "/api/%2e./Users/alice/private.json",
    "/api/.%2e/Users/alice/private.json",
    "/api/%2e%2e%2fUsers/alice/private.json",
    "/api/%252e%252e%255cUsers/alice/private.json",
    "/api/foo?source=/Users/alice/private.json",
    "filesystem:file:///Users/alice/private.json",
    "file%3A///Users/alice/private.json",
    "../private.json",
    "data/../private.json",
    "%2e%2e/private.json",
    "%252525252e%252525252e%252525252fUsers%252525252falice%252525252fprivate.json",
    "note(/Users/alice/private)",
    "json:{\"path\":\"/Users/alice/private\"}",
  ]) assert.equal(isPrivateLocalReference(value), true, value);
  for (const value of ["/api", "/media", "/static", "/api/cards/one", "https://example.com/media/card.mp4", "wss://example.com/socket", "profile:public-card"]) {
    assert.equal(isPrivateLocalReference(value), false, value);
  }
});

function fixture() {
  return {
    song: { id: "dear-papa", title: "Dear Papa", attribution: { author: "Calder" } },
    project: { song_id: "dear-papa", duration: 10, timed_lyrics: [{ start: 0, end: 2, text: "Dear Papa" }], updatedAt: "volatile" },
    showGraph: { song: { id: "dear-papa", title: "Dear Papa", durationSeconds: 10 }, stems: { items: [{ id: "vocals", hash: "v1" }] }, tracks: [{ id: "track-a", role: "foundation", cards: [{ id: "a", startSeconds: 0, endSeconds: 10, media: { id: "video-a", contentHash: "a", localPath: "/private/a.mp4" }, parameters: { motion: "static" } }] }], directorV2: { cameraKeyframes: [], visualTimeTrack: { events: [] }, accentTrack: { events: [] } } },
    render: { profile: "1080p", masterSha256: "one" }, rights: { licensingStatus: "operator-authored" },
  };
}

test("semantic fingerprints ignore volatile UI/path state and change for every playback material family", () => {
  const base = fixture();
  const snapshot = buildSongCardMintSnapshot(base);
  const same = buildSongCardMintSnapshot({ ...base, project: { ...base.project, updatedAt: "later", currentTime: 8 }, showGraph: structuredClone(base.showGraph) });
  same.showGraph.tracks[0].cards[0].media.localPath = "/another/private/a.mp4";
  same.showGraph.tracks[0].cards[0].media.fileUri = "file:///Users/alice/private/a.mp4";
  same.showGraph.tracks[0].cards[0].media.windowsSource = "C:\\Users\\Alice\\private\\a.mp4";
  same.showGraph.tracks[0].cards[0].media.uncSource = "\\\\server\\private\\a.mp4";
  same.showGraph.tracks[0].cards[0].media.windowsRootSource = "\\Users\\Alice\\private\\a.mp4";
  same.showGraph.tracks[0].cards[0].media.driveRelativeSource = "E:private.mov";
  same.showGraph.tracks[0].cards[0].media.namedHomeSource = "~alice/private.mov";
  assert.equal(fingerprintSongCardMintSnapshot(snapshot), fingerprintSongCardMintSnapshot(same));

  const mutations = {
    videos: (value) => { value.showGraph.tracks[0].cards[0].media.contentHash = "b"; },
    timing: (value) => { value.showGraph.tracks[0].cards[0].endSeconds = 9; },
    cards: (value) => { value.cardSnapshots = { card: { id: "card", revision: 2 } }; },
    ivf: (value) => { value.showGraph.tracks[0].cards[0].visualization = { sourceId: "isf:x", card: { id: "isf:x" } }; },
    stems: (value) => { value.showGraph.stems.items[0].hash = "v2"; },
    camera: (value) => { value.showGraph.directorV2.cameraKeyframes.push({ atSeconds: 1, motion: "push" }); },
    lyrics: (value) => { value.project.timed_lyrics[0].text = "Dear Father"; },
    attribution: (value) => { value.song.attribution.author = "Another"; },
    renderer: (value) => { value.render.profile = "4k"; },
  };
  for (const [family, mutate] of Object.entries(mutations)) {
    const changed = structuredClone(base); mutate(changed);
    const diff = diffSongCardMintSnapshots(snapshot, buildSongCardMintSnapshot(changed));
    assert.equal(diff.changed, true, family);
    assert.ok(diff.changedFamilies.length, family);
  }

  const swapped = structuredClone(base);
  swapped.showGraph.tracks[0].cards[0].media = { id: "video-b", contentHash: "b" };
  const exact = diffSongCardMintSnapshots(snapshot, buildSongCardMintSnapshot(swapped));
  assert.deepEqual(exact.changedAssetIds.sort(), ["a", "b", "video-a", "video-b"]);
  assert.equal(exact.affectedAppearanceIds.length, 2);
  assert.deepEqual(exact.dirtyRanges[0].changedAssetIds.sort(), ["a", "b", "video-a", "video-b"]);
  assert.deepEqual(exact.dirtyRanges[0].affectedAppearanceIds.sort(), exact.affectedAppearanceIds.sort());
});

test("changing Echo output orientation invalidates the renderer family for the full song", () => {
  const base = fixture();
  base.project.output_profile = "landscape";
  const landscape = buildSongCardMintSnapshot(base);
  const verticalInput = structuredClone(base);
  verticalInput.project.output_profile = "vertical";
  const vertical = buildSongCardMintSnapshot(verticalInput);
  const diff = diffSongCardMintSnapshots(landscape, vertical);

  assert.equal(landscape.outputProfile.id, "landscape");
  assert.equal(vertical.outputProfile.id, "vertical");
  assert.ok(diff.changedFamilies.includes("renderer"));
  assert.deepEqual(diff.dirtyRanges.map(({ startMs, endMs, reason }) => ({ startMs, endMs, reason })), [
    { startMs: 0, endMs: 10_000, reason: "renderer-only-material-change" },
  ]);
});

test("stable heads and immutable edition records validate while legacy empty cards remain head-only", () => {
  const source = fixture();
  const snapshot = buildSongCardMintSnapshot(source);
  const appearanceIndex = compileSongCardAppearanceIndex({ showGraph: source.showGraph });
  const head = buildSongCardHead({ songId: "dear-papa", title: "Dear Papa" });
  const edition = buildSongCardEdition({ head, edition: 1, snapshot, semanticFingerprint: fingerprintSongCardMintSnapshot(snapshot), appearanceIndex, artifacts: [{ role: "master", path: "media/master.mp4", sha256: "sha256:abc" }], lineage: { edges: [{ from: "song:dear-papa", to: `${head.id}:edition:1` }] } });
  assert.equal(validateSongCardEdition(edition).ok, true);
  assert.equal(edition.immutable, true);
  assert.equal(migrateLegacySongCard({ cardType: "hapa.music-viz.native-show-card.v1", song: { id: "dear-papa" }, artifacts: { video: "" } }).acceptedAsMintedEdition, false);
});
