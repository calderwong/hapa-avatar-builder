export const ECHO_LYRIC_MANUAL_EDIT_SCHEMA = "hapa.echo.lyric-manual-edit.v1";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value) => Math.round(finite(value) * 1000) / 1000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));

function normalizeWord(word = {}, lineStart = 0, lineEnd = lineStart + 0.001) {
  const start = clamp(word.start, lineStart, lineEnd);
  const end = clamp(Math.max(start + 0.001, finite(word.end, start + 0.001)), start + 0.001, lineEnd);
  return { ...word, start: round(start), end: round(end) };
}

export function normalizeEchoLyricTimingLines(lines = [], durationSeconds = Infinity) {
  const duration = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
    ? Number(durationSeconds)
    : Infinity;
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const previousEnd = index > 0 ? finite(lines[index - 1]?.end) : 0;
    const start = clamp(line?.start, 0, duration);
    const end = clamp(Math.max(start + 0.001, finite(line?.end, Math.max(start + 0.001, previousEnd))), start + 0.001, duration);
    const words = (Array.isArray(line?.words) ? line.words : []).map((word) => normalizeWord(word, start, end));
    return {
      ...line,
      text: String(line?.text || "").trim(),
      start: round(start),
      end: round(end),
      words,
    };
  });
}

export function shiftEchoLyricLine(lines = [], lineIndex = 0, deltaSeconds = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const target = normalized[lineIndex];
  if (!target) return normalized;
  const duration = Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : Infinity;
  const previousEnd = lineIndex > 0 ? normalized[lineIndex - 1].end : 0;
  const nextStart = lineIndex < normalized.length - 1 ? normalized[lineIndex + 1].start : duration;
  const length = target.end - target.start;
  const minimumStart = Math.max(0, previousEnd);
  const maximumStart = Math.max(minimumStart, nextStart - length);
  const nextLineStart = clamp(target.start + finite(deltaSeconds), minimumStart, maximumStart);
  const appliedDelta = nextLineStart - target.start;
  normalized[lineIndex] = {
    ...target,
    start: round(nextLineStart),
    end: round(nextLineStart + length),
    words: target.words.map((word) => ({
      ...word,
      start: round(word.start + appliedDelta),
      end: round(word.end + appliedDelta),
    })),
  };
  return normalized;
}

export function setEchoLyricLineBoundary(lines = [], lineIndex = 0, boundary = "start", value = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const target = normalized[lineIndex];
  if (!target) return normalized;
  const duration = Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : Infinity;
  const previousEnd = lineIndex > 0 ? normalized[lineIndex - 1].end : 0;
  const nextStart = lineIndex < normalized.length - 1 ? normalized[lineIndex + 1].start : duration;
  const start = boundary === "start"
    ? clamp(value, previousEnd, target.end - 0.001)
    : target.start;
  const end = boundary === "end"
    ? clamp(value, target.start + 0.001, nextStart)
    : target.end;
  normalized[lineIndex] = {
    ...target,
    start: round(start),
    end: round(end),
    words: target.words.map((word) => normalizeWord(word, start, end)),
  };
  return normalized;
}

export function updateEchoLyricLineText(lines = [], lineIndex = 0, value = "", durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  if (!normalized[lineIndex]) return normalized;
  normalized[lineIndex] = { ...normalized[lineIndex], text: String(value || "") };
  return normalized;
}

export function shiftEchoLyricWord(lines = [], lineIndex = 0, wordIndex = 0, deltaSeconds = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const line = normalized[lineIndex];
  const word = line?.words?.[wordIndex];
  if (!line || !word) return normalized;
  const previousEnd = wordIndex > 0 ? line.words[wordIndex - 1].end : line.start;
  const nextStart = wordIndex < line.words.length - 1 ? line.words[wordIndex + 1].start : line.end;
  const length = word.end - word.start;
  const start = clamp(word.start + finite(deltaSeconds), previousEnd, Math.max(previousEnd, nextStart - length));
  const words = line.words.map((candidate, index) => index === wordIndex
    ? { ...candidate, start: round(start), end: round(start + length) }
    : candidate);
  normalized[lineIndex] = { ...line, words };
  return normalized;
}

export function applyEchoLyricGlobalOffset(lines = [], deltaSeconds = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  if (!normalized.length) return normalized;
  const duration = Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : Infinity;
  const minimumDelta = -normalized[0].start;
  const maximumDelta = duration - normalized[normalized.length - 1].end;
  const appliedDelta = clamp(deltaSeconds, minimumDelta, maximumDelta);
  return normalized.map((line) => ({
    ...line,
    start: round(line.start + appliedDelta),
    end: round(line.end + appliedDelta),
    words: line.words.map((word) => ({
      ...word,
      start: round(word.start + appliedDelta),
      end: round(word.end + appliedDelta),
    })),
  }));
}

export function inspectEchoLyricManualTiming(lines = [], durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const issues = [];
  normalized.forEach((line, lineIndex) => {
    if (!line.text.trim()) issues.push({ code: "empty-line", lineIndex });
    if (!(line.end > line.start)) issues.push({ code: "invalid-line-interval", lineIndex });
    if (lineIndex > 0 && line.start < normalized[lineIndex - 1].end) issues.push({ code: "overlapping-lines", lineIndex });
    line.words.forEach((word, wordIndex) => {
      if (!(word.end > word.start)) issues.push({ code: "invalid-word-interval", lineIndex, wordIndex });
      if (word.start < line.start || word.end > line.end) issues.push({ code: "word-outside-line", lineIndex, wordIndex });
      if (wordIndex > 0 && word.start < line.words[wordIndex - 1].end) issues.push({ code: "overlapping-words", lineIndex, wordIndex });
    });
  });
  return {
    schemaVersion: ECHO_LYRIC_MANUAL_EDIT_SCHEMA,
    ok: issues.length === 0,
    lineCount: normalized.length,
    wordCount: normalized.reduce((sum, line) => sum + line.words.length, 0),
    issues,
    lines: normalized,
  };
}

