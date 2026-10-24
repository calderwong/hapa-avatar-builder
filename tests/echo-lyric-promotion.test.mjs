import assert from "node:assert/strict";
import test from "node:test";
import {
  compareEchoLyricTimingCandidate,
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

test("same-quality hybrid DTW evidence can replace legacy timing without a coverage regression", () => {
  const existing = measuredTiming({
    confidence: 0.846,
    stats: {
      lineCount: 102,
      wordCount: 618,
      matchedRatio: 0.943,
      alignableAnchorCoverage: 0.99,
      overlapCount: 0,
      duplicateStartCount: 0,
    },
  });
  const candidate = measuredTiming({
    confidence: 0.846,
    stats: { ...existing.stats },
    provenance: {
      ...existing.provenance,
      wordTiming: {
        method: "whisper.cpp-hybrid-cross-attention-dtw",
        refinement: { refinedWordCount: 249 },
      },
    },
  });
  assert.deepEqual(compareEchoLyricTimingCandidate({
    candidate,
    existing,
    candidatePromotion: { accepted: true },
    existingPromotion: { accepted: true },
  }), {
    selected: true,
    reason: "measured-boundary-upgrade",
  });

  candidate.stats.matchedRatio = 0.93;
  assert.equal(compareEchoLyricTimingCandidate({
    candidate,
    existing,
    candidatePromotion: { accepted: true },
    existingPromotion: { accepted: true },
  }).selected, false);
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

test("automatic confidence never bypasses invalid line or word intervals", () => {
  const timing = measuredTiming({
    confidence: 0.9,
    duration: 3,
    lines: [{
      text: "broken interval",
      start: 1,
      end: 4,
      words: [{ text: "broken", start: 1, end: 1 }],
    }],
  });
  const result = evaluateEchoLyricTimingPromotion(timing, {
    sourcePathExists: true,
    sttPathExists: true,
  });
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.includes("invalid-word-intervals"));
  assert.ok(result.reasons.includes("invalid-line-intervals"));
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

test("high word coverage tolerates at most thirty percent sparse line anchors", () => {
  const timing = measuredTiming({
    confidence: 0.656,
    warnings: ["many_unmatched_lines:13"],
    stats: {
      lineCount: 44,
      unmatchedLineCount: 13,
      matchedRatio: 0.811,
      overlapCount: 0,
      duplicateStartCount: 0,
    },
  });
  assert.equal(inspectEchoLyricTimingAdjudication(timing).eligible, true);
  const tooSparse = measuredTiming({
    ...timing,
    stats: {
      ...timing.stats,
      unmatchedLineCount: 14,
    },
  });
  assert.equal(inspectEchoLyricTimingAdjudication(tooSparse).eligible, false);
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

test("dense line anchors can adjudicate a narrowly sub-threshold word match", () => {
  const timing = measuredTiming({
    confidence: 0.513,
    warnings: ["low_match_ratio: fewer than 60% of canonical words have STT anchors"],
    stats: {
      lineCount: 93,
      unmatchedLineCount: 7,
      matchedRatio: 0.591,
      overlapCount: 0,
      duplicateStartCount: 0,
      alignableLineCount: 93,
      anchoredLineCount: 86,
      alignableAnchorCoverage: 0.925,
      speechActivityInferredLineCount: 6,
    },
  });
  const inspection = inspectEchoLyricTimingAdjudication(timing);
  assert.equal(inspection.eligible, true);
  assert.equal(inspection.policyId, "dense-line-coverage-phrase-alignment-v1");
  timing.adjudication = createEchoLyricTimingAdjudication(timing);
  assert.equal(evaluateEchoLyricTimingPromotion(timing, {
    sourcePathExists: true,
    sttPathExists: true,
  }).accepted, true);
});


test("single-model coverage does not displace corroborated boundaries on a different confidence scale",()=>{
  const lines=[{text:'real words',start:1,end:3,words:[{start:1,end:2,matched:true},{start:2,end:3,matched:true}],alignmentReview:{modelAgreementRatio:1}}];
  const existing=measuredTiming({engine:'audio-atlas-mlx',confidence:.8,lines,provenance:{wordTiming:{method:'audio-atlas-qwen3-forced-alignment-windowed'}}});
  const candidate=measuredTiming({engine:'audio-atlas-mlx',confidence:.99,lines:[{...lines[0],alignmentReview:{performanceSupported:true,performanceCoverage:1}}],provenance:{measurementKind:'transcript-timestamps'}});
  const input={candidate,existing,candidatePromotion:{accepted:true},existingPromotion:{accepted:true}};
  assert.equal(compareEchoLyricTimingCandidate(input).reason,'preserve-corroborated-word-boundaries');
  existing.lines[0].alignmentReview.modelAgreementRatio=0;
  assert.equal(compareEchoLyricTimingCandidate(input).reason,'complete-passage-evidence-upgrade');
});
test("v2 whole-song confidence cannot bypass a locally unsupported passage",()=>{
  const timing=measuredTiming({engine:'audio-atlas-mlx',confidence:.99,lines:[{text:'missing words',start:1,end:4,words:[{start:1,end:2,matched:true}],alignmentReview:{performanceSupported:false,performanceCoverage:.2}}]});
  timing.provenance={...timing.provenance,pipeline:'audio-atlas-lyric-timing.v2',measurementKind:'transcript-timestamps'};
  assert.ok(evaluateEchoLyricTimingPromotion(timing,{sourcePathExists:true,sttPathExists:true}).reasons.includes('unresolved-lyric-passages'));
});
