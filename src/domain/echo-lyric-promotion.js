export const ECHO_LYRIC_PROMOTION_SCHEMA = "hapa.echo.lyric-promotion-gate.v1";
export const DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE = 0.6;
export const ECHO_LYRIC_ADJUDICATION_SCHEMA = "hapa.echo.lyric-evidence-adjudication.v1";
export const ECHO_LYRIC_ADJUDICATION_POLICY = "near-threshold-clean-alignment-v1";
export const ECHO_LYRIC_SPARSE_LINE_ADJUDICATION_POLICY = "high-word-coverage-sparse-line-anchors-v1";
export const ECHO_LYRIC_MULTILINGUAL_ADJUDICATION_POLICY = "multilingual-speech-activity-anchors-v1";
export const ECHO_LYRIC_DENSE_LINE_ADJUDICATION_POLICY = "dense-line-coverage-phrase-alignment-v1";
export const ECHO_LYRIC_ADJUDICATION_MIN_CONFIDENCE = 0.53;
export const ECHO_LYRIC_ADJUDICATION_MIN_MATCHED_RATIO = 0.62;
export const ECHO_LYRIC_ADJUDICATION_MAX_UNMATCHED_LINE_RATIO = 0.2;
export const ECHO_LYRIC_SPARSE_LINE_MIN_CONFIDENCE = 0.65;
export const ECHO_LYRIC_SPARSE_LINE_MIN_MATCHED_RATIO = 0.8;
export const ECHO_LYRIC_SPARSE_LINE_MAX_UNMATCHED_LINE_RATIO = 0.3;
export const ECHO_LYRIC_MULTILINGUAL_MIN_CONFIDENCE = 0.55;
export const ECHO_LYRIC_MULTILINGUAL_MIN_MATCHED_RATIO = 0.3;
export const ECHO_LYRIC_MULTILINGUAL_MIN_ANCHOR_COVERAGE = 0.6;
export const ECHO_LYRIC_MULTILINGUAL_MIN_LINE_RATIO = 0.5;
export const ECHO_LYRIC_MULTILINGUAL_MAX_UNMATCHED_ALIGNABLE_RATIO = 0.4;
export const ECHO_LYRIC_DENSE_LINE_MIN_CONFIDENCE = 0.5;
export const ECHO_LYRIC_DENSE_LINE_MIN_MATCHED_RATIO = 0.58;
export const ECHO_LYRIC_DENSE_LINE_MIN_ANCHOR_COVERAGE = 0.9;
export const ECHO_LYRIC_DENSE_LINE_MAX_UNMATCHED_ALIGNABLE_RATIO = 0.1;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function inspectEchoLyricTimingAdjudication(timing = {}) {
  const confidence = Number(timing.confidence ?? 0);
  const warnings = Array.isArray(timing.warnings) ? timing.warnings.map(String) : [];
  const stats = timing.stats && typeof timing.stats === "object" ? timing.stats : {};
  const provenance = timing.provenance && typeof timing.provenance === "object" ? timing.provenance : {};
  const lineCount = Math.max(0, Number(stats.lineCount || timing.lines?.length || 0));
  const unmatchedLineCount = Math.max(0, Number(stats.unmatchedLineCount || 0));
  const alignableLineCount = Math.max(0, Number(stats.alignableLineCount || 0));
  const matchedRatio = Number(stats.matchedRatio || 0);
  const unmatchedLineRatio = lineCount > 0 ? unmatchedLineCount / lineCount : 1;
  const unmatchedAlignableLineRatio = alignableLineCount > 0
    ? unmatchedLineCount / alignableLineCount
    : 1;
  const alignableAnchorCoverage = Number(stats.alignableAnchorCoverage || 0);
  const multilingualLineRatio = Number(stats.multilingualLineRatio || 0);
  const speechActivityInferredLineCount = Math.max(
    0,
    Number(stats.speechActivityInferredLineCount || 0),
  );
  const invalidWordIntervals = (timing.lines || []).reduce((count, line) => (
    count + (line?.words || []).filter((word) => {
      const start = Number(word?.start ?? word?.startTime);
      const end = Number(word?.end ?? word?.endTime);
      return !Number.isFinite(start) || !Number.isFinite(end) || end <= start;
    }).length
  ), 0);
  const duration = Number(timing.duration || 0);
  const invalidLineIntervals = (timing.lines || []).filter((line) => {
    const start = Number(line?.start ?? line?.startTime);
    const end = Number(line?.end ?? line?.endTime);
    return !Number.isFinite(start)
      || !Number.isFinite(end)
      || start < 0
      || end <= start
      || (duration > 0 && end > duration + 0.25);
  }).length;
  const structuralReasons = [];
  if (Number(stats.overlapCount || 0) > 0) structuralReasons.push("overlapping-line-windows");
  if (Number(stats.duplicateStartCount || 0) > 0) structuralReasons.push("duplicate-line-starts");
  if (invalidWordIntervals > 0) structuralReasons.push("invalid-word-intervals");
  if (invalidLineIntervals > 0) structuralReasons.push("invalid-line-intervals");
  if (!text(provenance.audioSha256)) structuralReasons.push("audio-source-hash-missing");
  if (!text(provenance.lyricsSha256)) structuralReasons.push("lyric-source-hash-missing");
  const cleanReasons = [...structuralReasons];
  if (!Number.isFinite(confidence) || confidence < ECHO_LYRIC_ADJUDICATION_MIN_CONFIDENCE) cleanReasons.push("confidence-below-adjudication-floor");
  if (confidence >= DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE) cleanReasons.push("automatic-gate-already-available");
  if (!Number.isFinite(matchedRatio) || matchedRatio < ECHO_LYRIC_ADJUDICATION_MIN_MATCHED_RATIO) cleanReasons.push("matched-ratio-below-adjudication-floor");
  if (unmatchedLineRatio > ECHO_LYRIC_ADJUDICATION_MAX_UNMATCHED_LINE_RATIO) cleanReasons.push("too-many-unmatched-lines");
  if (warnings.length) cleanReasons.push("alignment-warning-present");
  const sparseLineReasons = [...structuralReasons];
  if (!Number.isFinite(confidence) || confidence < ECHO_LYRIC_SPARSE_LINE_MIN_CONFIDENCE) sparseLineReasons.push("confidence-below-sparse-line-floor");
  if (!Number.isFinite(matchedRatio) || matchedRatio < ECHO_LYRIC_SPARSE_LINE_MIN_MATCHED_RATIO) sparseLineReasons.push("matched-ratio-below-sparse-line-floor");
  if (unmatchedLineRatio > ECHO_LYRIC_SPARSE_LINE_MAX_UNMATCHED_LINE_RATIO) sparseLineReasons.push("too-many-unmatched-lines");
  if (!warnings.length || warnings.some((warning) => !/^many_unmatched_lines:/u.test(warning))) {
    sparseLineReasons.push("unsupported-alignment-warning");
  }
  const multilingualReasons = [...structuralReasons];
  if (!Number.isFinite(confidence) || confidence < ECHO_LYRIC_MULTILINGUAL_MIN_CONFIDENCE) {
    multilingualReasons.push("confidence-below-multilingual-floor");
  }
  if (!Number.isFinite(matchedRatio) || matchedRatio < ECHO_LYRIC_MULTILINGUAL_MIN_MATCHED_RATIO) {
    multilingualReasons.push("matched-ratio-below-multilingual-floor");
  }
  if (
    !Number.isFinite(alignableAnchorCoverage)
    || alignableAnchorCoverage < ECHO_LYRIC_MULTILINGUAL_MIN_ANCHOR_COVERAGE
  ) {
    multilingualReasons.push("anchor-coverage-below-multilingual-floor");
  }
  if (
    !Number.isFinite(multilingualLineRatio)
    || multilingualLineRatio < ECHO_LYRIC_MULTILINGUAL_MIN_LINE_RATIO
  ) {
    multilingualReasons.push("multilingual-line-ratio-below-floor");
  }
  if (
    unmatchedAlignableLineRatio
    > ECHO_LYRIC_MULTILINGUAL_MAX_UNMATCHED_ALIGNABLE_RATIO
  ) {
    multilingualReasons.push("too-many-unmatched-alignable-lines");
  }
  if (stats.multilingualAnchorMode !== true) {
    multilingualReasons.push("multilingual-anchor-mode-not-declared");
  }
  if (speechActivityInferredLineCount <= 0) {
    multilingualReasons.push("speech-activity-inference-missing");
  }
  if (warnings.length) multilingualReasons.push("alignment-warning-present");
  const denseLineReasons = [...structuralReasons];
  if (!Number.isFinite(confidence) || confidence < ECHO_LYRIC_DENSE_LINE_MIN_CONFIDENCE) {
    denseLineReasons.push("confidence-below-dense-line-floor");
  }
  if (!Number.isFinite(matchedRatio) || matchedRatio < ECHO_LYRIC_DENSE_LINE_MIN_MATCHED_RATIO) {
    denseLineReasons.push("matched-ratio-below-dense-line-floor");
  }
  if (
    !Number.isFinite(alignableAnchorCoverage)
    || alignableAnchorCoverage < ECHO_LYRIC_DENSE_LINE_MIN_ANCHOR_COVERAGE
  ) {
    denseLineReasons.push("anchor-coverage-below-dense-line-floor");
  }
  if (
    unmatchedAlignableLineRatio
    > ECHO_LYRIC_DENSE_LINE_MAX_UNMATCHED_ALIGNABLE_RATIO
  ) {
    denseLineReasons.push("too-many-unmatched-alignable-lines");
  }
  if (speechActivityInferredLineCount <= 0) {
    denseLineReasons.push("speech-activity-inference-missing");
  }
  if (
    warnings.length !== 1
    || !/^low_match_ratio:/u.test(warnings[0])
  ) {
    denseLineReasons.push("unsupported-alignment-warning");
  }
  const cleanEligible = cleanReasons.length === 0;
  const sparseLineEligible = sparseLineReasons.length === 0;
  const multilingualEligible = multilingualReasons.length === 0;
  const denseLineEligible = denseLineReasons.length === 0;
  const policyId = cleanEligible
    ? ECHO_LYRIC_ADJUDICATION_POLICY
    : sparseLineEligible
      ? ECHO_LYRIC_SPARSE_LINE_ADJUDICATION_POLICY
      : denseLineEligible
        ? ECHO_LYRIC_DENSE_LINE_ADJUDICATION_POLICY
        : multilingualEligible
          ? ECHO_LYRIC_MULTILINGUAL_ADJUDICATION_POLICY
          : ECHO_LYRIC_ADJUDICATION_POLICY;
  const reasons = cleanEligible || sparseLineEligible || multilingualEligible || denseLineEligible
    ? []
    : [...new Set([
        ...cleanReasons,
        ...sparseLineReasons,
        ...multilingualReasons,
        ...denseLineReasons,
      ])];
  return {
    eligible: cleanEligible || sparseLineEligible || multilingualEligible || denseLineEligible,
    policyId,
    confidence,
    matchedRatio,
    unmatchedLineCount,
    lineCount,
    unmatchedLineRatio,
    alignableLineCount,
    unmatchedAlignableLineRatio,
    alignableAnchorCoverage,
    multilingualLineRatio,
    speechActivityInferredLineCount,
    invalidWordIntervals,
    invalidLineIntervals,
    reasons,
  };
}

export function createEchoLyricTimingAdjudication(timing = {}, {
  adjudicatedAt = new Date().toISOString(),
  adjudicatedBy = "codex-evidence-gate",
} = {}) {
  const inspection = inspectEchoLyricTimingAdjudication(timing);
  if (!inspection.eligible) return null;
  return {
    schemaVersion: ECHO_LYRIC_ADJUDICATION_SCHEMA,
    policyId: inspection.policyId,
    disposition: "accepted",
    humanReviewed: false,
    adjudicatedBy,
    adjudicatedAt,
    evidence: {
      confidence: inspection.confidence,
      matchedRatio: inspection.matchedRatio,
      unmatchedLineCount: inspection.unmatchedLineCount,
      lineCount: inspection.lineCount,
      alignableLineCount: inspection.alignableLineCount,
      alignableAnchorCoverage: inspection.alignableAnchorCoverage,
      multilingualLineRatio: inspection.multilingualLineRatio,
      speechActivityInferredLineCount: inspection.speechActivityInferredLineCount,
      audioSha256: text(timing.provenance?.audioSha256),
      lyricsSha256: text(timing.provenance?.lyricsSha256),
    },
  };
}

function validEchoLyricTimingAdjudication(timing = {}) {
  const receipt = timing.adjudication && typeof timing.adjudication === "object"
    ? timing.adjudication
    : {};
  const inspection = inspectEchoLyricTimingAdjudication(timing);
  const commonEvidenceValid = inspection.eligible
    && receipt.schemaVersion === ECHO_LYRIC_ADJUDICATION_SCHEMA
    && receipt.policyId === inspection.policyId
    && receipt.disposition === "accepted"
    && receipt.humanReviewed === false
    && text(receipt.evidence?.audioSha256) === text(timing.provenance?.audioSha256)
    && text(receipt.evidence?.lyricsSha256) === text(timing.provenance?.lyricsSha256)
    && Number(receipt.evidence?.confidence) === inspection.confidence
    && Number(receipt.evidence?.matchedRatio) === inspection.matchedRatio;
  if (!commonEvidenceValid) return false;
  if (![
    ECHO_LYRIC_MULTILINGUAL_ADJUDICATION_POLICY,
    ECHO_LYRIC_DENSE_LINE_ADJUDICATION_POLICY,
  ].includes(inspection.policyId)) {
    return true;
  }
  return Number(receipt.evidence?.alignableLineCount) === inspection.alignableLineCount
    && Number(receipt.evidence?.alignableAnchorCoverage) === inspection.alignableAnchorCoverage
    && Number(receipt.evidence?.multilingualLineRatio) === inspection.multilingualLineRatio
    && Number(receipt.evidence?.speechActivityInferredLineCount)
      === inspection.speechActivityInferredLineCount;
}

export function evaluateEchoLyricTimingPromotion(timing = {}, {
  minimumConfidence = DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE,
  sourcePathExists = false,
  sttPathExists = false,
} = {}) {
  const lines = Array.isArray(timing.lines) ? timing.lines : [];
  const confidence = Number(timing.confidence ?? 0);
  const warnings = Array.isArray(timing.warnings) ? timing.warnings.map(String) : [];
  const stats = timing.stats && typeof timing.stats === "object" ? timing.stats : {};
  const provenance = timing.provenance && typeof timing.provenance === "object" ? timing.provenance : {};
  const engine = text(timing.engine || provenance.timingSource);
  const reasons = [];
  const adjudicationAccepted = validEchoLyricTimingAdjudication(timing);
  const structuralInspection = inspectEchoLyricTimingAdjudication(timing);
  if (!lines.length) reasons.push("no-timed-lines");
  if (!Number.isFinite(confidence) || (confidence < minimumConfidence && !adjudicationAccepted)) reasons.push("confidence-below-gate");
  if (Number(stats.overlapCount || 0) > 0) reasons.push("overlapping-line-windows");
  if (Number(stats.duplicateStartCount || 0) > 0) reasons.push("duplicate-line-starts");
  if (structuralInspection.invalidWordIntervals > 0) reasons.push("invalid-word-intervals");
  if (structuralInspection.invalidLineIntervals > 0) reasons.push("invalid-line-intervals");
  if (!adjudicationAccepted && warnings.some((warning) => /low_match_ratio|many_unmatched_lines|overlapping_line_windows|duplicate_line_starts/u.test(warning))) {
    reasons.push("alignment-warning");
  }
  if (!sourcePathExists) reasons.push("timing-sidecar-missing");
  if (!sttPathExists) reasons.push("stt-sidecar-missing");
  if (!["whisper-cli", "whisper.cpp"].includes(engine)) reasons.push("non-measured-engine");
  if (!text(provenance.audioPath)) reasons.push("audio-source-path-missing");
  if (!text(provenance.audioSha256)) reasons.push("audio-source-hash-missing");
  if (!text(provenance.lyricsPath)) reasons.push("lyric-source-path-missing");
  if (!text(provenance.lyricsSha256)) reasons.push("lyric-source-hash-missing");
  return {
    schemaVersion: ECHO_LYRIC_PROMOTION_SCHEMA,
    accepted: reasons.length === 0,
    minimumConfidence,
    confidence,
    engine,
    adjudicationAccepted,
    reasons,
  };
}

function timingMethod(timing = {}) {
  return text(timing.provenance?.wordTiming?.method || timing.wordTiming?.method);
}

function timingStat(timing, key) {
  return Number(timing?.stats?.[key] || 0);
}

export function compareEchoLyricTimingCandidate({
  candidate = {},
  existing = null,
  candidatePromotion = {},
  existingPromotion = null,
} = {}) {
  if (candidatePromotion.accepted !== true) {
    return { selected: false, reason: "candidate-rejected" };
  }
  if (!existing || existingPromotion?.accepted !== true) {
    return { selected: true, reason: "replaces-unaccepted-or-missing" };
  }
  const candidateConfidence = Number(candidate.confidence || 0);
  const existingConfidence = Number(existing.confidence || 0);
  if (candidateConfidence > existingConfidence) {
    return { selected: true, reason: "higher-confidence" };
  }

  const candidateMethod = timingMethod(candidate);
  const existingMethod = timingMethod(existing);
  const sameEvidence = Boolean(text(candidate.provenance?.audioSha256))
    && text(candidate.provenance?.audioSha256) === text(existing.provenance?.audioSha256)
    && Boolean(text(candidate.provenance?.lyricsSha256))
    && text(candidate.provenance?.lyricsSha256) === text(existing.provenance?.lyricsSha256);
  const noQualityRegression = candidateConfidence >= existingConfidence
    && timingStat(candidate, "matchedRatio") >= timingStat(existing, "matchedRatio")
    && timingStat(candidate, "alignableAnchorCoverage") >= timingStat(existing, "alignableAnchorCoverage")
    && timingStat(candidate, "overlapCount") <= timingStat(existing, "overlapCount")
    && timingStat(candidate, "duplicateStartCount") <= timingStat(existing, "duplicateStartCount")
    && (candidate.warnings || []).length <= (existing.warnings || []).length
    && timingStat(candidate, "wordCount") === timingStat(existing, "wordCount")
    && timingStat(candidate, "lineCount") === timingStat(existing, "lineCount");
  const measuredBoundaryUpgrade = candidateMethod === "whisper.cpp-hybrid-cross-attention-dtw"
    && existingMethod !== candidateMethod
    && Number(candidate.provenance?.wordTiming?.refinement?.refinedWordCount || 0) > 0;
  if (sameEvidence && noQualityRegression && measuredBoundaryUpgrade) {
    return { selected: true, reason: "measured-boundary-upgrade" };
  }
  return { selected: false, reason: "not-better-than-accepted" };
}
