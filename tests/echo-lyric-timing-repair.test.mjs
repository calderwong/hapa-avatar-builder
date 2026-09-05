import assert from "node:assert/strict";
import test from "node:test";
import {
  repairEchoLyricTimingDefects,
  repairEchoLyricWordIntervals,
} from "../src/domain/echo-lyric-timing-repair.js";

test("zero-duration word runs are redistributed inside their measured line window", () => {
  const result = repairEchoLyricWordIntervals([{
    text: "four forty four",
    start: 68.745,
    end: 69.055,
    words: [
      { text: "four", start: 68.745, end: 69.055 },
      { text: "forty", start: 69.055, end: 69.055 },
      { text: "four", start: 69.055, end: 69.055 },
    ],
  }]);
  assert.equal(result.changed, true);
  assert.equal(result.repairedWordIntervals, 2);
  assert.equal(result.unrepairableWordIntervals, 0);
  assert.equal(result.lines[0].words[0].start, 68.745);
  assert.equal(result.lines[0].words.at(-1).end, 69.055);
  assert.ok(result.lines[0].words.every((word) => word.end > word.start));
});

test("valid measured word intervals remain byte-for-byte equivalent", () => {
  const lines = [{
    text: "already good",
    start: 1,
    end: 2,
    words: [
      { text: "already", start: 1, end: 1.4 },
      { text: "good", start: 1.5, end: 2 },
    ],
  }];
  const result = repairEchoLyricWordIntervals(lines);
  assert.equal(result.changed, false);
  assert.deepEqual(result.lines, lines);
});

test("words beyond the real audio duration are removed without compressing them into the ending", () => {
  const result = repairEchoLyricTimingDefects({
    duration: 10,
    lines: [{
      text: "and play out that fantasy",
      start: 8,
      end: 12,
      words: [
        { text: "and", start: 8, end: 8.5, matched: true },
        { text: "play", start: 8.5, end: 9.2, matched: true },
        { text: "out", start: 9.2, end: 10, matched: true },
        { text: "that", start: 10, end: 10.6, matched: true },
        { text: "fantasy", start: 10.6, end: 12, matched: true },
      ],
    }],
    stats: {},
  });
  assert.equal(result.trimmedLines, 1);
  assert.equal(result.trimmedWords, 2);
  assert.equal(result.timing.lines[0].text, "and play out");
  assert.equal(result.timing.lines[0].end, 10);
  assert.equal(result.timing.lines[0].words.length, 3);
});


test("interval repair is explicitly inferred and keeps original evidence even for borrowed windows", () => {
  const source = [{ text: "one two", start: 1, end: 2, words: [
    { word: "one", start: 1, end: 2, confidence: .95, matched: true, timing_source: "forced-alignment" },
    { word: "two", start: 2, end: 2, confidence: .3 },
  ] }];
  const before = structuredClone(source);
  const repaired = repairEchoLyricWordIntervals(source);
  assert.equal(repaired.changed, true);
  for (const word of repaired.lines[0].words) {
    assert.equal(word.confidence, 0);
    assert.equal(word.matched, false);
    assert.equal(word.timing_repair.alignmentStatus, "unmeasured-needs-review");
  }
  assert.deepEqual(repaired.lines[0].words[0].timing_repair.original, { start: 1, end: 2, confidence: .95, matched: true, timingSource: "forced-alignment" });
  assert.deepEqual(source, before);
});

test("automatic interval repair cannot move manually locked words or lines", () => {
  const line = { text: "one two", start: 1, end: 2, words: [
    { word: "one", start: 1, end: 2, timing_lock: { locked: true, actor: "human" } },
    { word: "two", start: 2, end: 2 },
  ] };
  const wordLocked = repairEchoLyricWordIntervals([line]);
  assert.equal(wordLocked.changed, false);
  assert.equal(wordLocked.unrepairableWordIntervals, 1);
  assert.deepEqual(wordLocked.lines, [line]);
  delete line.words[0].timing_lock;
  line.manual_locked = true;
  assert.deepEqual(repairEchoLyricWordIntervals([line]).lines, [line]);
});

test("valid native word aliases are never mistaken for missing intervals", () => {
  const source = [{ text: "native word", startSeconds: 1, endSeconds: 2, words: [
    { text: "native", startSeconds: 1, endSeconds: 1.5 },
    { text: "word", startSeconds: 1.5, endSeconds: 2 },
  ] }];
  assert.deepEqual(repairEchoLyricWordIntervals(source).lines, source);
  assert.equal(repairEchoLyricWordIntervals(source).changed, false);
});


test("full repair reports a duration conflict rather than trimming a manual lock", () => {
  const timing = { duration: 2, lines: [{ text: "held", start: 1, end: 3, words: [{ text: "held", start: 1, end: 3, manual_locked: true }] }] };
  const repaired = repairEchoLyricTimingDefects(timing);
  assert.equal(repaired.changed, false);
  assert.equal(repaired.untrimmedLockedLines, 1);
  assert.deepEqual(repaired.timing.lines, timing.lines);
});
