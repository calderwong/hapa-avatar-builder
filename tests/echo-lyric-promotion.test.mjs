import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE,
  evaluateEchoLyricTimingPromotion,
} from "../src/domain/echo-lyric-promotion.js";

function measuredTiming(overrides = {}) {
  return {
    engine: "whisper-cli",
    confidence: 0.871,
    warnings: [],
    stats: { overlapCount: 0, duplicateStartCount: 0 },
    lines: [{ text: "source words", start: 1, end: 2 }],
    provenance: {
      timingSource: "whisper-cli",
      audioPath: "/audio/vocals.wav",
      audioSha256: "audio-hash",
      lyricsPath: "/lyrics/source.txt",
      lyricsSha256: "lyrics-hash",
    },
    ...overrides,
  };
}

test("measured, hashed, structurally clean timing clears the promotion gate", () => {
  const result = evaluateEchoLyricTimingPromotion(measuredTiming(), {
    sourcePathExists: true,
    sttPathExists: true,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.minimumConfidence, DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE);
  assert.deepEqual(result.reasons, []);
});

test("weak or synthetic timing cannot replace live Director timing", () => {
  const weak = evaluateEchoLyricTimingPromotion(measuredTiming({
    engine: "stub",
    confidence: 0.538,
    warnings: ["many_unmatched_lines:6"],
    provenance: {},
  }), {
    sourcePathExists: true,
    sttPathExists: true,
  });
  assert.equal(weak.accepted, false);
  assert.ok(weak.reasons.includes("confidence-below-gate"));
  assert.ok(weak.reasons.includes("alignment-warning"));
  assert.ok(weak.reasons.includes("non-measured-engine"));
  assert.ok(weak.reasons.includes("audio-source-hash-missing"));
});
