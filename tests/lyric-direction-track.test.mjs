import test from "node:test";
import assert from "node:assert/strict";
import { buildLyricDirectionTrack, validateLyricDirectionTrack } from "../src/domain/lyric-direction-track.js";

const sections = [
  { id: "intro", type: "intro", label: "Intro", startSeconds: 0, endSeconds: 5 },
  { id: "verse", type: "verse", label: "Verse", startSeconds: 5, endSeconds: 15 },
  { id: "hook", type: "chorus", label: "Hook", startSeconds: 15, endSeconds: 25 },
  { id: "bridge", type: "bridge", label: "Bridge", startSeconds: 25, endSeconds: 35 },
];
const lyricCues = [
  { id: "line:1", startSeconds: 5, endSeconds: 10, confidence: 0.92, source: "registry", words: [{ text: "Dear", startSeconds: 5, endSeconds: 6 }, { text: "Papa", startSeconds: 6, endSeconds: 7 }] },
  { id: "line:2", startSeconds: 15, endSeconds: 20, confidence: 0.84, source: "registry", words: [{ text: "Home", startSeconds: 15, endSeconds: 16 }] },
  { id: "line:3", startSeconds: 25, endSeconds: 30, confidence: 0.42, source: "inferred", words: [{ text: "Maybe", startSeconds: 25, endSeconds: 26 }] },
];
const mediaSlots = sections.map((section, index) => ({ startSeconds: section.startSeconds, endSeconds: section.endSeconds, media: { id: `m${index}`, sourceKind: "local-video" } }));

test("lyric direction changes only at sections and preserves exact words", () => {
  const track = buildLyricDirectionTrack({ sections, lyricCues, mediaSlots, mediaROIs: { m1: { status: "verified", occupiedRegions: ["right"] } } });
  assert.ok(validateLyricDirectionTrack(track, lyricCues).ok);
  assert.equal(track.sections[0].mode, "no-text");
  assert.equal(track.sections[1].mode, "orbit-caption");
  assert.equal(track.sections[1].placement, "lower-left");
  assert.equal(track.sections[1].mediaContext.safeRegionInfluencedPlacement, true);
  assert.equal(track.sections[2].mode, "stacked-echo");
  assert.equal(track.sections[3].mode, "phrase-window");
  assert.equal(track.sections[3].motionPreset, "calm-no-jitter");
  assert.deepEqual(track.sections.flatMap((section) => section.timing.words).map(({ text, startSeconds, endSeconds }) => ({ text, startSeconds, endSeconds })), lyricCues.flatMap((line) => line.words));
});
