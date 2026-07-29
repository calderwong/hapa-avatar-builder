import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeEchoLyricTiming,
  compareLyricText,
  isLikelyLyricMetadata,
  lyricIssuePriority,
} from "../src/domain/echo-lyric-quality.js";

test("lyric text comparison distinguishes canonical text from wrong lyrics", () => {
  const canonical = "Dear Papa, tell her I am on my way now";
  const exact = compareLyricText([{ text: "Dear Papa" }, { text: "tell her I am on my way now" }], canonical);
  const wrong = compareLyricText([{ text: "unrelated synthetic words from another song" }], canonical);
  assert.equal(exact.similarity, 1);
  assert.ok(wrong.similarity < 0.25);
});

test("timing audit detects synthetic uniform cadence and structural faults", () => {
  const synthetic = analyzeEchoLyricTiming([
    {
      text: "one two three four",
      start: 1,
      end: 3,
      words: [
        { word: "one", start: 1, end: 1.4 },
        { word: "two", start: 1.5, end: 1.9 },
        { word: "three", start: 2, end: 2.4 },
        { word: "four", start: 2.5, end: 2.9 },
      ],
    },
    {
      text: "five six seven",
      start: 3,
      end: 4.5,
      words: [
        { word: "five", start: 3, end: 3.4 },
        { word: "six", start: 3.5, end: 3.9 },
        { word: "seven", start: 4, end: 4.4 },
      ],
    },
    {
      text: "eight nine ten",
      start: 4.5,
      end: 6,
      words: [
        { word: "eight", start: 4.5, end: 4.9 },
        { word: "nine", start: 5, end: 5.4 },
        { word: "ten", start: 5.5, end: 5.9 },
      ],
    },
  ], 8);
  assert.equal(synthetic.structurallyValid, true);
  assert.equal(synthetic.syntheticCadenceLikely, true);

  const invalid = analyzeEchoLyricTiming([
    { text: "first", start: 1, end: 3, words: [{ word: "first", start: 0.5, end: 3.5 }] },
    { text: "second", start: 2, end: 2, words: [] },
  ], 4);
  assert.ok(invalid.structuralIssueCount >= 3);
  assert.equal(invalid.structurallyValid, false);
});

test("metadata rows and recent repair priority remain explicit", () => {
  assert.equal(isLikelyLyricMetadata("[Verse 1]"), true);
  assert.equal(isLikelyLyricMetadata("(playback click)"), true);
  assert.equal(isLikelyLyricMetadata("I am singing this line"), false);
  const recentMissing = lyricIssuePriority({
    recent: true,
    timing: { lineCount: 0, structuralIssueCount: 0, linesWithoutWords: 0 },
    text: { similarity: 0 },
    sourceKind: "missing",
    hasCanonicalText: true,
  });
  const oldReview = lyricIssuePriority({
    recent: false,
    timing: { lineCount: 10, structuralIssueCount: 0, linesWithoutWords: 0 },
    text: { similarity: 0.85 },
    sourceKind: "source-linked",
    hasCanonicalText: true,
  });
  assert.ok(recentMissing > oldReview);
});
