export const ECHO_LYRIC_QUALITY_SCHEMA = "hapa.echo.lyric-quality.v4";

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
}

function coefficientOfVariation(values = []) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function isLikelyLyricMetadata(text = "") {
  const value = String(text || "").trim();
  if (!value) return true;
  if (/^[\s\-—–⸻_*#]+$/.test(value)) return true;
  if (/^\[(?:verse|chorus|hook|bridge|intro|outro|refrain|pre[- ]?chorus|instrumental|break|spoken|sound|sfx)[^\]]*\]$/i.test(value)) return true;
  if (/^\((?:notification|scroll|soft static|playback click|phone ui|screen recording|instrumental|sound of|sfx)[^)]*\)$/i.test(value)) return true;
  return false;
}

export function lyricTextTokens(value = "") {
  const text = Array.isArray(value)
    ? value.map((line) => String(line?.text || "")).filter((line) => !isLikelyLyricMetadata(line)).join("\n")
    : String(value || "");
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

function multisetOverlap(left = [], right = []) {
  const counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token) || 0) + 1);
  let common = 0;
  for (const token of right) {
    const remaining = counts.get(token) || 0;
    if (remaining <= 0) continue;
    common += 1;
    counts.set(token, remaining - 1);
  }
  return common;
}

function bigrams(tokens = []) {
  return tokens.slice(1).map((token, index) => `${tokens[index]}\u0000${token}`);
}

export function compareLyricText(projectLines = [], canonicalText = "") {
  const activeTokens = lyricTextTokens(projectLines);
  const canonicalTokens = lyricTextTokens(canonicalText);
  if (!activeTokens.length || !canonicalTokens.length) {
    return {
      activeTokenCount: activeTokens.length,
      canonicalTokenCount: canonicalTokens.length,
      tokenF1: 0,
      orderF1: 0,
      similarity: 0,
    };
  }
  const commonTokens = multisetOverlap(activeTokens, canonicalTokens);
  const tokenF1 = (2 * commonTokens) / (activeTokens.length + canonicalTokens.length);
  const activeBigrams = bigrams(activeTokens);
  const canonicalBigrams = bigrams(canonicalTokens);
  const commonBigrams = multisetOverlap(activeBigrams, canonicalBigrams);
  const orderF1 = activeBigrams.length + canonicalBigrams.length > 0
    ? (2 * commonBigrams) / (activeBigrams.length + canonicalBigrams.length)
    : tokenF1;
  return {
    activeTokenCount: activeTokens.length,
    canonicalTokenCount: canonicalTokens.length,
    tokenF1: round(tokenF1),
    orderF1: round(orderF1),
    similarity: round((tokenF1 * 0.6) + (orderF1 * 0.4)),
  };
}

export function analyzeEchoLyricTiming(lines = [], durationSeconds = 0) {
  const source = Array.isArray(lines) ? lines : [];
  const duration = Math.max(0, finite(durationSeconds));
  let invalidLines = 0;
  let lineOverlaps = 0;
  let duplicateStarts = 0;
  let wordCount = 0;
  let linesWithoutWords = 0;
  let invalidWords = 0;
  let wordBounds = 0;
  let wordOverlaps = 0;
  let metadataLines = 0;
  let eligibleUniformLines = 0;
  let uniformWordCadenceLines = 0;
  let priorLine = null;

  for (const line of source) {
    const start = Number(line?.start);
    const end = Number(line?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || (duration > 0 && end > duration + 0.25)) invalidLines += 1;
    if (priorLine) {
      if (finite(priorLine.end) > start + 0.03) lineOverlaps += 1;
      if (Math.abs(finite(priorLine.start) - start) < 0.01) duplicateStarts += 1;
    }
    priorLine = line;
    if (isLikelyLyricMetadata(line?.text)) metadataLines += 1;
    const words = Array.isArray(line?.words) ? line.words : [];
    wordCount += words.length;
    if (!words.length) linesWithoutWords += 1;
    let priorWord = null;
    const durations = [];
    const gaps = [];
    for (const word of words) {
      const wordStart = Number(word?.start);
      const wordEnd = Number(word?.end);
      if (!Number.isFinite(wordStart) || !Number.isFinite(wordEnd) || wordEnd <= wordStart) invalidWords += 1;
      if (Number.isFinite(start) && Number.isFinite(end) && (wordStart < start - 0.05 || wordEnd > end + 0.25)) wordBounds += 1;
      if (priorWord) {
        const priorEnd = finite(priorWord.end);
        if (priorEnd > wordStart + 0.03) wordOverlaps += 1;
        gaps.push(Math.max(0, wordStart - priorEnd));
      }
      durations.push(Math.max(0, wordEnd - wordStart));
      priorWord = word;
    }
    if (words.length >= 3 && durations.every((value) => value > 0)) {
      eligibleUniformLines += 1;
      const durationCv = coefficientOfVariation(durations);
      const gapCv = gaps.length > 1 ? coefficientOfVariation(gaps) : 0;
      if (durationCv < 0.08 && gapCv < 0.12) uniformWordCadenceLines += 1;
    }
  }

  const uniformWordCadenceRatio = eligibleUniformLines > 0
    ? uniformWordCadenceLines / eligibleUniformLines
    : 0;
  const structuralIssueCount = invalidLines + lineOverlaps + duplicateStarts + invalidWords + wordBounds + wordOverlaps;
  return {
    schemaVersion: ECHO_LYRIC_QUALITY_SCHEMA,
    lineCount: source.length,
    wordCount,
    invalidLines,
    lineOverlaps,
    duplicateStarts,
    linesWithoutWords,
    invalidWords,
    wordBounds,
    wordOverlaps,
    metadataLines,
    eligibleUniformLines,
    uniformWordCadenceLines,
    uniformWordCadenceRatio: round(uniformWordCadenceRatio),
    syntheticCadenceLikely: eligibleUniformLines >= 3 && uniformWordCadenceRatio >= 0.72,
    structuralIssueCount,
    structurallyValid: source.length > 0 && structuralIssueCount === 0,
  };
}

export function lyricIssuePriority({ recent = false, timing = {}, text = {}, sourceKind = "", hasCanonicalText = false } = {}) {
  let score = recent ? 30 : 0;
  if (!timing.lineCount && hasCanonicalText) score += 100;
  if (String(sourceKind).includes("synthetic")) score += 70;
  if (timing.syntheticCadenceLikely) score += 50;
  if (timing.structuralIssueCount) score += Math.min(40, timing.structuralIssueCount * 4);
  if (hasCanonicalText && text.similarity < 0.75) score += 80;
  else if (hasCanonicalText && text.similarity < 0.9) score += 35;
  if (timing.linesWithoutWords) score += Math.min(30, timing.linesWithoutWords);
  return score;
}
