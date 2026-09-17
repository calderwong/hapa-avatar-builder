import assert from "node:assert/strict";
import test from "node:test";
import {
  ECHO_LYRIC_VISUAL_VARIATIONS,
  attachTimedLyricContextToProject,
  enrichedCandidatesForSong,
  highQualityHumanAcceptedCandidates,
  referenceCandidatesForSong,
} from "../src/domain/echo-lyric-visual-director.js";

test("three lyric-visual variations expose distinct density and source direction", () => {
  assert.equal(ECHO_LYRIC_VISUAL_VARIATIONS.length, 3);
  assert.deepEqual(ECHO_LYRIC_VISUAL_VARIATIONS.map((row) => row.density.targetVideoRatio), [0.72, 0.84, 0.94]);
  assert.deepEqual(ECHO_LYRIC_VISUAL_VARIATIONS[0].sourcePattern, ["human-accepted", "reference"]);
  assert.deepEqual(ECHO_LYRIC_VISUAL_VARIATIONS[1].sourcePattern, ["reference", "human-accepted"]);
});

test("timed lyrics are attached to every overlapping shot without moving boundaries", () => {
  const source = {
    song_id: "song-one",
    song_title: "Song One",
    local_spine: "A mirror and a harbor",
    song_edit_map: { timedLyrics: [
      { id: "line-a", start: 0.5, end: 2.2, text: "Mirror in the rain", confidence: 0.9 },
      { id: "line-b", start: 2.1, end: 4.5, text: "Harbor knows my name", confidence: 0.8 },
    ] },
    timeline: [
      { shot_index: 0, start_sec: 0, end_sec: 2 },
      { shot_index: 1, start_sec: 2, end_sec: 4 },
      { shot_index: 2, start_sec: 5, end_sec: 7 },
    ],
  };
  const result = attachTimedLyricContextToProject(source);
  assert.equal(result.evidence.shotsWithLyrics, 2);
  assert.deepEqual(result.project.timeline.map((shot) => [shot.start_sec, shot.end_sec]), [[0, 2], [2, 4], [5, 7]]);
  assert.equal(result.project.timeline[0].lyric_context, "Mirror in the rain");
  assert.equal(result.project.timeline[1].lyric_context, "Mirror in the rain / Harbor knows my name");
  assert.deepEqual(result.project.timeline[1].lyric_line_ids, ["line-a", "line-b"]);
  assert.equal(result.project.timeline[2].lyric_context, undefined);
});

test("Reference loops prefer the current song and retain a truthful album fallback", () => {
  const candidates = [
    { id: "one", sourceSongIds: ["song-one"], sourceSongTitles: ["Song One"] },
    { id: "two", sourceSongIds: ["song-two"], sourceSongTitles: ["Song Two"] },
  ];
  const scoped = referenceCandidatesForSong(candidates, { song_id: "song-one", song_title: "Song One" });
  assert.equal(scoped.mode, "same-song-reference-cards");
  assert.deepEqual(scoped.candidates.map((row) => row.id), ["one"]);
  const fallback = referenceCandidatesForSong(candidates, { song_id: "song-three", song_title: "Song Three" });
  assert.equal(fallback.mode, "album-reference-semantic-fallback");
  assert.equal(fallback.candidates.length, 2);
});

test("song-level enriched shortlist prefers lyric-relevant accepted media", () => {
  const candidates = [
    { id: "mirror", technicalIdentity: "mirror", title: "Mirror Rain", visualDescription: { text: "A silver mirror reveals a hidden name in rain" } },
    { id: "mountain", technicalIdentity: "mountain", title: "Mountain", visualDescription: { text: "A dry mountain road at noon" } },
    { id: "kitchen", technicalIdentity: "kitchen", title: "Kitchen", visualDescription: { text: "A bright kitchen with copper pans" } },
  ];
  const result = enrichedCandidatesForSong(candidates, {
    song_title: "Hidden Name",
    song_edit_map: { timedLyrics: [{ start: 0, end: 2, text: "The mirror knows my hidden name in the rain" }] },
  }, { limit: 2 });
  assert.equal(result.candidates[0].id, "mirror");
  assert.equal(result.candidates.length, 2);
  assert.ok(result.topScore > 0);
  assert.ok(result.positiveMatches >= 1);
});

test("Human candidates require acceptance, enrichment, and the high-resolution floor", () => {
  const accepted = (id, width, height, patch = {}) => ({
    id, width, height,
    humanAcceptedIdentity: { decisionState: "accepted" },
    visualDescription: { text: "Enriched visual description" },
    visualPalette: { swatches: [{ hex: "#ffffff" }] },
    ...patch,
  });
  const result = highQualityHumanAcceptedCandidates([
    accepted("hd-a", 1920, 1080),
    accepted("hd-b", 1280, 720),
    accepted("small", 640, 360),
    accepted("rejected", 1920, 1080, { humanAcceptedIdentity: { decisionState: "rejected" } }),
  ], { minimumShortEdge: 720 });
  assert.equal(result.minimumShortEdge, 720);
  assert.deepEqual(result.candidates.map((row) => row.id), ["hd-a", "hd-b"]);
});
