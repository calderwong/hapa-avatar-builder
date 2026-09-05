import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEchoLyricGlobalOffset,
  inspectEchoLyricManualTiming,
  setEchoLyricLineBoundary,
  shiftEchoLyricLine,
  shiftEchoLyricWord,
  updateEchoLyricLineText,
} from "../src/domain/echo-lyric-timing-editor.js";

const fixture = [
  { text: "one two", start: 1, end: 2, words: [{ word: "one", start: 1, end: 1.4 }, { word: "two", start: 1.5, end: 2 }] },
  { text: "three", start: 3, end: 4, words: [{ word: "three", start: 3, end: 4 }] },
];

test("line and word nudges preserve measured duration and prevent overlaps", () => {
  const shifted = shiftEchoLyricLine(fixture, 0, .25, 10);
  assert.deepEqual([shifted[0].start, shifted[0].end], [1.25, 2.25]);
  assert.deepEqual([shifted[0].words[0].start, shifted[0].words[0].end], [1.25, 1.65]);
  const clamped = shiftEchoLyricLine(fixture, 0, 5, 10);
  assert.equal(clamped[0].end, 3);
  const word = shiftEchoLyricWord(fixture, 0, 0, .2, 10);
  assert.deepEqual([word[0].words[0].start, word[0].words[0].end], [1.1, 1.5]);
});

test("manual boundaries, text edits, and global offset remain valid", () => {
  const start = setEchoLyricLineBoundary(fixture, 0, "start", 1.2, 10);
  assert.equal(start[0].start, 1.2);
  const text = updateEchoLyricLineText(start, 0, "One, two!", 10);
  assert.equal(text[0].text, "One, two!");
  const offset = applyEchoLyricGlobalOffset(text, -.5, 10);
  assert.equal(offset[0].start, .7);
  assert.equal(inspectEchoLyricManualTiming(offset, 10).ok, true);
});

test("inspection identifies empty and overlapping manual cues", () => {
  const report = inspectEchoLyricManualTiming([
    { text: "", start: 0, end: 2, words: [] },
    { text: "overlap", start: 1, end: 3, words: [] },
  ], 10);
  assert.equal(report.ok, false);
  assert.deepEqual(report.issues.map((issue) => issue.code), ["empty-line", "overlapping-lines"]);
});


test("editing native graph timestamps preserves measured boundaries without stale aliases", () => {
  const native = fixture.map(({ start, end, words, ...line }) => ({ ...line, startSeconds: start, endSeconds: end, words: words.map(({ start, end, ...word }) => ({ ...word, startSeconds: start, endSeconds: end })) }));
  const before = structuredClone(native);
  const shifted = shiftEchoLyricLine(native, 0, .25, 10);
  assert.deepEqual(shifted, shiftEchoLyricLine(fixture, 0, .25, 10));
  assert.deepEqual(native, before);
  assert.equal('startSeconds' in shifted[0], false);
  assert.equal('startSeconds' in shifted[0].words[0], false);
});
