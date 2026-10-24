import test from "node:test";
import assert from "node:assert/strict";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback, validateEchoScoreDirection, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { normalizeLyricControl, validateLyricControl, chosenLyricPhrases, wordByWordPhrases, lyricFontCss } from "../src/domain/echo-score-dust-lyrics.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
function lyricLines() {
  const lines = [];
  let t = 12;
  for (let i = 0; i < 24; i++) {
    const text = i % 4 === 1 ? "take me to the edge" : `verse line number ${i}`;
    const words = text.split(" ").map((word, k) => ({ text: word, start: t + k * 0.5, end: t + k * 0.5 + 0.4 }));
    lines.push({ id: `line-${i}`, text, start: t, end: t + words.length * 0.5, words });
    t += 7.5;
  }
  return lines;
}
const compose = (lyrics) => {
  assert.equal(validateEchoScoreDirection({ lyrics }).ok, true);
  const score = composeEchoVisualScore(timeline, { lyrics }, { lyricLines: lyricLines() });
  const check = validateEchoVisualScore(score, { timeline });
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  return score;
};

test("chosen lines are shown exactly, in time order, overlaps refused", () => {
  const score = compose({ pick: "chosen", lines: [6, 0, 3] });
  assert.deepEqual(score.phrases.map((p) => p.source.lineIndex), [0, 3, 6]);
  assert.equal(score.phraseSource.pick, "chosen");
  const lines = lyricLines();
  lines[2] = { ...lines[2], start: lines[1].start + 0.5, end: lines[1].end + 1 };
  const result = chosenLyricPhrases(lines, timeline, [1, 2]);
  assert.deepEqual(result.skipped, [{ index: 2, reason: "overlaps an earlier chosen line" }]);
  assert.equal(chosenLyricPhrases(lines, timeline, [99]).skipped[0].reason, "no measured timing inside this recording");
  assert.equal(chosenLyricPhrases(lines, timeline, [1], { lyricAudioHash: "f".repeat(64) }).status, "audio-mismatch");
  const long = [{ text: Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "), start: 10, end: 20 }];
  assert.ok(chosenLyricPhrases(long, timeline, [0]).phrases[0].text.length <= 64, "long lines keep whole words up to 64 characters");
});

test("hooks respect the maximum; off and the earlier switch still mean no words", () => {
  assert.ok(compose({ pick: "hooks", max: 2 }).phrases.length <= 2);
  assert.equal(compose({ pick: "off" }).phrases.length, 0);
  assert.equal(normalizeLyricControl({}, "off").pick, "off");
  assert.equal(composeEchoVisualScore(timeline, { lyricPhrases: "off" }, { lyricLines: lyricLines() }).phrases.length, 0);
});

test("word by word shows one sung word at a time, contiguous and inside its line", () => {
  const score = compose({ pick: "chosen", lines: [1], wordByWord: true, textCase: "upper", font: "serif" });
  assert.deepEqual(score.phrases.map((p) => p.text), ["TAKE", "ME", "TO", "THE", "EDGE"]);
  for (let i = 1; i < score.phrases.length; i++) assert.equal(score.phrases[i].start, score.phrases[i - 1].end, "each word holds until the next");
  assert.ok(score.phrases.every((p) => p.font === "serif" && p.wordOf === "lyric-line-1" && !p.burst));
  const check = validateEchoVisualScore(score, { timeline });
  assert.equal(check.warnings.filter((w) => w.code === "phrase-short").length, 0, "single words are not reported as unreadable lines");
  const playback = prepareEchoScorePlayback(score, timeline);
  assert.equal(playback.stateAt(score.phrases[2].start + 0.1).phrase.text, "TO");
  const untimed = [{ text: "no word timing here", start: 10, end: 14 }];
  assert.equal(wordByWordPhrases(chosenLyricPhrases(untimed, timeline, [0]).phrases, untimed).length, 1, "lines without word timing stay whole");
  const clustered = [{ text: "a b c", start: 10, end: 12, words: [{ text: "a", start: 10, end: 10.5 }, { text: "b", start: 10.02, end: 10.6 }, { text: "c", start: 11, end: 11.5 }] }];
  assert.deepEqual(wordByWordPhrases(chosenLyricPhrases(clustered, timeline, [0]).phrases, clustered).map((p) => p.text), ["a b", "c"], "near-simultaneous words join");
});

test("lyric settings validate strictly and fonts fall back safely", () => {
  assert.deepEqual(validateLyricControl(undefined), []);
  for (const bad of [{ pick: "all" }, { lines: [-1] }, { max: 40 }, { font: "comic" }, { textCase: "title" }, { wordByWord: "yes" }, { glow: 1 }]) assert.ok(validateLyricControl(bad).length, JSON.stringify(bad));
  assert.ok(validateEchoScoreDirection({ lyrics: { pick: "all" } }).errors.some((e) => e.code === "lyrics"));
  assert.match(lyricFontCss("serif", 40), /40px Georgia/);
  assert.match(lyricFontCss("nope", 40), /800 40px system-ui/);
});
