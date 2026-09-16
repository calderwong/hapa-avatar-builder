import assert from "node:assert/strict";
import test from "node:test";
import { assessEchoLyricPrecision, mapEchoLyricOnsetToBeat } from "../src/domain/echo-lyric-precision.js";

const line = (words) => ({ start: 1, end: 3, text: "sing it", words });

test("synthetic lyric spacing is never described as exact", () => {
  const result = assessEchoLyricPrecision({
    lyric_timing_heal: { timingSource: "synthetic-weighted-lyric-heal" },
    timed_lyrics: [line([{ word: "sing", start: 1, end: 2 }, { word: "it", start: 2, end: 3 }])],
  });
  assert.equal(result.level, "synthetic-estimate");
  assert.equal(result.exactSyllableReady, false);
  assert.equal(result.animationUnit, "phrase");
});

test("mixed STT anchors disclose interpolation instead of claiming word precision", () => {
  const result = assessEchoLyricPrecision({
    lyric_timing_truth: { timingSource: "whisper-cli" },
    timed_lyrics: [line([{ word: "sing", start: 1, end: 2, matched: true }, { word: "it", start: 2, end: 3, matched: false }])],
  });
  assert.equal(result.level, "mixed-word-anchor");
  assert.equal(result.animationUnit, "mixed");
  assert.equal(result.counts.matchedWords, 1);
  assert.equal(result.counts.inferredWords, 1);
  assert.match(result.limitations.join(" "), /interpolated/i);
});

test("reviewed syllable intervals plus measured beats unlock count mapping", () => {
  const evidence = { humanReviewed: true, audioHash: "sha256:source", reviewer: "reviewer-1" };
  const result = assessEchoLyricPrecision({
    audio_telemetry: { beatTimes: [0, 0.5, 1, 1.5, 2] },
    timed_lyrics: [line([{ word: "sing", start: 1, end: 2, syllables: [
      { text: "si", start: 1, end: 1.4, evidence },
      { text: "ng", start: 1.4, end: 2, evidence },
    ] }])],
  });
  assert.equal(result.level, "syllable-reviewed");
  assert.equal(result.exactSyllableReady, true);
  assert.equal(result.beatMappingReady, true);
  assert.deepEqual(mapEchoLyricOnsetToBeat(1.13, [0, 0.5, 1, 1.5, 2]), {
    beatIndex: 2,
    bar: 1,
    beatInBar: 3,
    subdivision: 2,
    subdivisions: 4,
    snappedSeconds: 1.125,
    offsetMs: 5,
  });
});

test("BPM without beat phase cannot manufacture count labels", () => {
  const result = assessEchoLyricPrecision({
    bpm: 120,
    timed_lyrics: [line([{ word: "sing", start: 1, end: 3, matched: true }])],
  });
  assert.equal(result.beatMappingReady, false);
  assert.match(result.limitations.join(" "), /not BPM alone/i);
});
