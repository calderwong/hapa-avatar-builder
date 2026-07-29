export const ECHO_LYRIC_DRAIN_QUEUE_KINDS = Object.freeze({
  ALIGN: "align",
  MANUAL_REVIEW: "manual-review",
  PROMOTE: "promote",
  SOURCE_RECONCILIATION: "source-reconciliation",
});

export function classifyEchoLyricDrainQueue({
  manifestSongFound = false,
  issues = [],
  timingFound = false,
  timingParsed = false,
  promotionAccepted = false,
} = {}) {
  if (!manifestSongFound) return ECHO_LYRIC_DRAIN_QUEUE_KINDS.SOURCE_RECONCILIATION;
  if ((issues || []).some((issue) => [
    "canonical-text-mismatch",
    "canonical-text-review",
  ].includes(String(issue)))) {
    return ECHO_LYRIC_DRAIN_QUEUE_KINDS.MANUAL_REVIEW;
  }
  if (!timingFound) return ECHO_LYRIC_DRAIN_QUEUE_KINDS.ALIGN;
  if (!timingParsed) return ECHO_LYRIC_DRAIN_QUEUE_KINDS.MANUAL_REVIEW;
  return promotionAccepted
    ? ECHO_LYRIC_DRAIN_QUEUE_KINDS.PROMOTE
    : ECHO_LYRIC_DRAIN_QUEUE_KINDS.MANUAL_REVIEW;
}
