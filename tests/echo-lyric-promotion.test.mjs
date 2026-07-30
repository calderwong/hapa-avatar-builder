import assert from "node:assert/strict";
import test from "node:test";
import {
  createEchoLyricTimingAdjudication,
  DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE,
  evaluateEchoLyricTimingPromotion,
  inspectEchoLyricTimingAdjudication,
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

test("a narrow clean near-threshold alignment can carry an evidence adjudication receipt", () => {
  const timing = measuredTiming({
    confidence: 0.586,
    stats: {
      lineCount: 20,
      unmatchedLineCount: 1,
      matchedRatio: 0.665,
      overlapCount: 0,
      duplicateStartCount: 0,
    },
  });
  const inspection = inspectEchoLyricTimingAdjudication(timing);
  assert.equal(inspection.eligible, true);
  timing.adjudication = createEchoLyricTimingAdjudication(timing, {
    adjudicatedAt: "2026-07-29T00:00:00.000Z",
  });
  const result = evaluateEchoLyricTimingPromotion(timing, {
    sourcePathExists: true,
    sttPathExists: true,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.adjudicationAccepted, true);
});

test("adjudication cannot bypass alignment warnings or source-hash drift", () => {
  const timing = measuredTiming({
    confidence: 0.586,
    warnings: ["many_unmatched_lines:8"],
    stats: {
      lineCount: 20,
      unmatchedLineCount: 8,
      matchedRatio: 0.665,
      overlapCount: 0,
      duplicateStartCount: 0,
    },
  });
  assert.equal(inspectEchoLyricTimingAdjudication(timing).eligible, false);
  assert.equal(createEchoLyricTimingAdjudication(timing), null);

  const clean = measuredTiming({
    confidence: 0.586,
    stats: {
      lineCount: 20,
      unmatchedLineCount: 1,
      matchedRatio: 0.665,
      overlapCount: 0,
      duplicateStartCount: 0,
    },
  });
  clean.adjudication = createEchoLyricTimingAdjudication(clean);
  clean.provenance.audioSha256 = "different-audio";
  const result = evaluateEchoLyricTimingPromotion(clean, {
    sourcePathExists: true,
    sttPathExists: true,
  });
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.includes("confidence-below-gate"));
});

test("high word coverage can adjudicate a narrowly sparse line-anchor warning", () => {
  const timing = measuredTiming({
    confidence: 0.716,
    warnings: ["many_unmatched_lines:9"],
    stats: {
      lineCount: 43,
      unmatchedLineCount: 9,
      matchedRatio: 0.854,
      overlapCount: 0,
      duplicateStartCount: 0,
    },
  });
  const inspection = inspectEchoLyricTimingAdjudication(timing);
  assert.equal(inspection.eligible, true);
  assert.equal(inspection.policyId, "high-word-coverage-sparse-line-anchors-v1");
  timing.adjudication = createEchoLyricTimingAdjudication(timing);
  assert.equal(evaluateEchoLyricTimingPromotion(timing, {
    sourcePathExists: true,
    sttPathExists: true,
  }).accepted, true);
});

test("multilingual display lyrics can use measured speech activity between lexical anchors", () => {
  const timing = measuredTiming({
    confidence: 0.562,
    stats: {
      lineCount: 78,
      unmatchedLineCount: 6,
      matchedRatio: 0.333,
      overlapCount: 0,
      duplicateStartCount: 0,
      alignableLineCount: 16,
      anchoredLineCount: 10,
      alignableAnchorCoverage: 0.625,
      interpolatedMultilingualLineCount: 62,
      multilingualLineRatio: 0.795,
      speechActivityInferredLineCount: 68,
      multilingualAnchorMode: true,
    },
  });
  const inspection = inspectEchoLyricTimingAdjudication(timing);
  assert.equal(inspection.eligible, true);
  assert.equal(inspection.policyId, "multilingual-speech-activity-anchors-v1");
  timing.adjudication = createEchoLyricTimingAdjudication(timing);
  assert.equal(evaluateEchoLyricTimingPromotion(timing, {
    sourcePathExists: true,
    sttPathExists: true,
  }).accepted, true);

  const sparseAnchors = measuredTiming({
    ...timing,
    adjudication: undefined,
    stats: {
      ...timing.stats,
      alignableAnchorCoverage: 0.4,
    },
  });
  assert.equal(inspectEchoLyricTimingAdjudication(sparseAnchors).eligible, false);
});
