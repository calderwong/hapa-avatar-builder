export const ECHO_LYRIC_PROMOTION_SCHEMA = "hapa.echo.lyric-promotion-gate.v1";
export const DEFAULT_ECHO_LYRIC_MIN_CONFIDENCE = 0.6;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
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
  if (!lines.length) reasons.push("no-timed-lines");
  if (!Number.isFinite(confidence) || confidence < minimumConfidence) reasons.push("confidence-below-gate");
  if (Number(stats.overlapCount || 0) > 0) reasons.push("overlapping-line-windows");
  if (Number(stats.duplicateStartCount || 0) > 0) reasons.push("duplicate-line-starts");
  if (warnings.some((warning) => /low_match_ratio|many_unmatched_lines|overlapping_line_windows|duplicate_line_starts/u.test(warning))) {
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
    reasons,
  };
}
