import assert from "node:assert/strict";
import test from "node:test";
import {
  compareEchoLyricTimingCandidate,
  ECHO_LYRIC_ATLAS_ENGINE,
  evaluateEchoLyricTimingPromotion,
} from "../src/domain/echo-lyric-promotion.js";

const sidecars = { sourcePathExists: true, sttPathExists: true };
const timing = (engine, confidence, lyricsSha256 = "lyrics-hash") => ({
  engine,
  confidence,
  warnings: [],
  stats: { overlapCount: 0, duplicateStartCount: 0, matchedRatio: 0.9 },
  lines: [{ text: "source words", start: 1, end: 2, words: [{ text: "source", start: 1, end: 1.5 }, { text: "words", start: 1.5, end: 2 }] }],
  provenance: { timingSource: engine, audioPath: "/audio/vocals.wav", audioSha256: "audio-hash", lyricsPath: "/lyrics/source.txt", lyricsSha256 },
});

test("Audio Atlas MLX timing is a measured engine and still faces every other gate", () => {
  assert.equal(evaluateEchoLyricTimingPromotion(timing(ECHO_LYRIC_ATLAS_ENGINE, 0.8), sidecars).accepted, true);
  const low = evaluateEchoLyricTimingPromotion(timing(ECHO_LYRIC_ATLAS_ENGINE, 0.4), sidecars);
  assert.equal(low.accepted, false);
  assert.ok(low.reasons.includes("confidence-below-gate"));
  const unknown = evaluateEchoLyricTimingPromotion(timing("some-other-engine", 0.9), sidecars);
  assert.ok(unknown.reasons.includes("non-measured-engine"));
});

test("accepted Atlas timing supersedes accepted legacy whisper.cpp timing for the same lyrics", () => {
  const candidate = timing(ECHO_LYRIC_ATLAS_ENGINE, 0.7), existing = timing("whisper-cli", 0.85);
  const decision = compareEchoLyricTimingCandidate({ candidate, existing, candidatePromotion: { accepted: true }, existingPromotion: { accepted: true } });
  assert.deepEqual(decision, { selected: true, reason: "audio-atlas-supersedes-legacy-engine" });
  const otherLyrics = compareEchoLyricTimingCandidate({ candidate: timing(ECHO_LYRIC_ATLAS_ENGINE, 0.7, "changed"), existing, candidatePromotion: { accepted: true }, existingPromotion: { accepted: true } });
  assert.equal(otherLyrics.selected, false);
  const rejected = compareEchoLyricTimingCandidate({ candidate, existing, candidatePromotion: { accepted: false }, existingPromotion: { accepted: true } });
  assert.equal(rejected.selected, false);
});
