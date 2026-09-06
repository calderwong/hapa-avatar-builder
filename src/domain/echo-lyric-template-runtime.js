import { echoLyricBoundary } from "./echo-lyric-time.js";
import {
  echoLyricTemplate,
  normalizeEchoLyricContract,
} from "./echo-lyric-contract.js";

export const ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA = "hapa.echo.lyric-template-runtime.v1";

function lyricFinite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function lyricClamp01(value) {
  return Math.max(0, Math.min(1, lyricFinite(value)));
}

function lyricRound(value, digits = 4) {
  const factor = 10 ** digits;
  const result = Math.round(lyricFinite(value) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

export function echoLyricFrameTime(timeSeconds = 0, fps = 30) {
  const rate = Math.max(1, Math.round(lyricFinite(fps, 30)));
  const frame = Math.max(0, Math.floor(Math.max(0, lyricFinite(timeSeconds)) * rate + 1e-9));
  return { frame, fps: rate, timeSeconds: lyricRound(frame / rate, 6) };
}

export function echoLyricDisplayToken(word = {}, timeSeconds = 0, maximumCharacters = 44) {
  const value = String(word.word || word.text || "");
  if (value.length <= maximumCharacters) return value;
  const hyphenParts = value.split("-").filter(Boolean);
  const pages = [];
  if (hyphenParts.length > 1) {
    let page = "";
    for (const part of hyphenParts) {
      const candidate = page ? `${page}-${part}` : part;
      if (candidate.length > maximumCharacters && page) {
        pages.push(`${page}-`);
        page = part;
      } else {
        page = candidate;
      }
    }
    if (page) pages.push(page);
  } else {
    for (let index = 0; index < value.length; index += maximumCharacters) pages.push(value.slice(index, index + maximumCharacters));
  }
  const start = echoLyricBoundary(word, "start");
  const end = Math.max(start + 0.001, echoLyricBoundary(word, "end", start + 0.001));
  const progress = lyricClamp01((lyricFinite(timeSeconds) - start) / (end - start));
  return pages[Math.min(pages.length - 1, Math.floor(progress * pages.length))] || value.slice(0, maximumCharacters);
}

export function echoLyricDisplayWindow({
  templateId = "scanline-phrase-ribbon-v1",
  words = [],
  timeSeconds = 0,
  lineStart = 0,
  lineEnd = 0,
} = {}) {
  const limits = {
    "kinetic-word-burst-v1": 7,
    "scanline-phrase-ribbon-v1": 10,
    "stacked-hook-echo-v1": 8,
    "orbit-caption-v1": 9,
  };
  const rows = Array.isArray(words) ? words : [];
  const limit = limits[templateId] || 10;
  if (rows.length <= limit) {
    return { startIndex: 0, endIndex: rows.length, wordCount: rows.length, text: rows.map((word) => echoLyricDisplayToken(word, timeSeconds)).join(" ").trim() };
  }
  let anchorIndex = rows.findIndex((word) => timeSeconds >= echoLyricBoundary(word, "start", lineStart) && timeSeconds < echoLyricBoundary(word, "end", lineEnd));
  if (anchorIndex < 0) {
    anchorIndex = rows.findIndex((word) => timeSeconds < echoLyricBoundary(word, "start", lineStart));
    if (anchorIndex < 0) anchorIndex = rows.length - 1;
  }
  const startIndex = Math.floor(Math.max(0, anchorIndex) / limit) * limit;
  const endIndex = Math.min(rows.length, startIndex + limit);
  return {
    startIndex,
    endIndex,
    wordCount: endIndex - startIndex,
    text: rows.slice(startIndex, endIndex).map((word) => echoLyricDisplayToken(word, timeSeconds)).join(" ").trim(),
  };
}

export function resolveEchoLyricTemplateFrame({
  project = {},
  contract = null,
  line = {},
  timeSeconds = 0,
  fps = 30,
} = {}) {
  const normalized = contract || normalizeEchoLyricContract(project);
  const template = echoLyricTemplate(normalized.templateId);
  return echoLyricTemplateFrameState({
    templateId: template.id,
    enabled: normalized.enabled,
    line,
    timeSeconds,
    fps,
    timingSource: normalized.timingSource,
    reducedMotion: normalized.reducedMotion,
  });
}

// Text-match flags and line-level scores are not acoustic word confidence.
// Keep this self-contained for the generated HyperFrames/Song Card runtime.
export function echoLyricWordTimingPolicy(line = {}, timingSource = '') {
  const words = Array.isArray(line.words) ? line.words : [];
  let reason = /synthetic|weighted|evenly|estimated/i.test(timingSource) ? 'synthetic-word-timing' : '';
  if (!reason && !words.length) reason = 'word-timing-missing';
  for (const word of words) {
    if (reason) break;
    const start = echoLyricBoundary(word, 'start', NaN), end = echoLyricBoundary(word, 'end', NaN);
    const confidence = word.confidence ?? word.probability;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) reason = 'word-interval-invalid';
    else if (typeof confidence !== 'number' || !Number.isFinite(confidence)) reason = 'word-confidence-missing';
    else if (confidence < .6 || confidence > 1) reason = 'word-confidence-low-or-invalid';
  }
  return { mode: reason ? 'phrase' : 'word', reason: reason || 'word-confidence-available',
    label: reason ? 'Phrase timing · word alignment unverified' : 'Word timing · confidence available',
    manuallyVerified: false };
}

export function echoLyricTemplateFrameState({
  templateId = "scanline-phrase-ribbon-v1",
  enabled = true,
  line = {},
  timeSeconds = 0,
  fps = 30,
  timingSource = '',
  reducedMotion = false,
} = {}) {
  const clock = echoLyricFrameTime(timeSeconds, fps);
  const start = echoLyricBoundary(line, "start");
  const end = Math.max(start + 0.001, echoLyricBoundary(line, "end", start + 0.001));
  const entryStart = Math.max(0, start - 0.24);
  const exitEnd = end + 0.18;
  const entryProgress = lyricClamp01((clock.timeSeconds - entryStart) / Math.max(0.001, start - entryStart));
  const exitProgress = lyricClamp01((clock.timeSeconds - end) / Math.max(0.001, exitEnd - end));
  const lineProgress = lyricClamp01((clock.timeSeconds - start) / Math.max(0.001, end - start));
  const words = Array.isArray(line.words) ? line.words : [];
  const timingPolicy = echoLyricWordTimingPolicy(line, timingSource);
  const displayWindow = timingPolicy.mode === "phrase" ? { startIndex: 0, endIndex: words.length, wordCount: words.length, text: String(line.text || words.map(word => word.word || word.text || "").join(" ")) } : echoLyricDisplayWindow({
    templateId,
    words,
    timeSeconds: clock.timeSeconds,
    lineStart: start,
    lineEnd: end,
  });
  return {
    schemaVersion: ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA,
    templateId,
    frame: clock.frame,
    fps: clock.fps,
    timeSeconds: clock.timeSeconds,
    timingPolicy,
    visible: enabled && clock.timeSeconds >= entryStart && clock.timeSeconds < exitEnd,
    lineProgress: lyricRound(lineProgress),
    entryProgress: lyricRound(entryProgress),
    exitProgress: lyricRound(exitProgress),
    displayWindow,
    displayText: displayWindow.text || String(line.text || ""),
    words: words.map((word, index) => {
      const wordStart = echoLyricBoundary(word, "start", start);
      const wordEnd = Math.max(wordStart + 0.001, echoLyricBoundary(word, "end", wordStart + 0.001));
      const active = timingPolicy.mode === 'word' && clock.timeSeconds >= wordStart && clock.timeSeconds < wordEnd;
      const completed = timingPolicy.mode === 'word' && clock.timeSeconds >= wordEnd;
      const wordProgress = timingPolicy.mode === 'word' ? lyricClamp01((clock.timeSeconds - wordStart) / Math.max(0.001, wordEnd - wordStart)) : 0;
      const onsetImpulse = active ? Math.max(0, 1 - (clock.timeSeconds - wordStart) / 0.18) ** 2 : 0;
      const spread = words.length > 1 ? (index / (words.length - 1)) * 2 - 1 : 0;
      const base = {
        index,
        display: index >= displayWindow.startIndex && index < displayWindow.endIndex,
        displayText: timingPolicy.mode === "phrase" ? String(word.word || word.text || "") : echoLyricDisplayToken(word, clock.timeSeconds),
        active,
        completed,
        progress: lyricRound(wordProgress),
        opacity: lyricRound((1 - exitProgress) * (0.35 + entryProgress * 0.65)),
        scale: 1,
        translateX: 0,
        translateY: 0,
        rotateDegrees: 0,
        underlineProgress: reducedMotion ? (active || completed ? 1 : 0) : active ? lyricRound(wordProgress) : completed ? 1 : 0,
      };
      if (reducedMotion || timingPolicy.mode === 'phrase') return { ...base, opacity: 1 };
      if (templateId === "kinetic-word-burst-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.04 + 0.12 * onsetImpulse : completed ? 1 : 0.94 + entryProgress * 0.06),
          translateY: lyricRound((1 - entryProgress) * (12 + (index % 3) * 4)),
          rotateDegrees: lyricRound((1 - entryProgress) * spread * 5),
        };
      }
      if (templateId === "stacked-hook-echo-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.02 + 0.06 * onsetImpulse : 1),
          translateX: lyricRound(spread * (1 - entryProgress) * 10),
          translateY: lyricRound((index % 2 ? -1 : 1) * (1 - entryProgress) * 3),
        };
      }
      if (templateId === "orbit-caption-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.02 + 0.08 * onsetImpulse : 1),
          translateY: lyricRound(-Math.sin((spread + 1) * Math.PI / 2) * 8),
          rotateDegrees: lyricRound(spread * 4),
        };
      }
      return {
        ...base,
        scale: lyricRound(active ? 1.01 + 0.05 * onsetImpulse : 1),
        translateX: lyricRound((1 - entryProgress) * -8),
      };
    }),
  };
}

export function echoLyricTemplateRuntimeBrowserSource() {
  return [
    `const ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA=${JSON.stringify(ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA)};`,
    echoLyricBoundary.toString(),
    lyricFinite.toString(),
    lyricClamp01.toString(),
    lyricRound.toString(),
    echoLyricFrameTime.toString(),
    echoLyricDisplayToken.toString(),
    echoLyricDisplayWindow.toString(),
    echoLyricWordTimingPolicy.toString(),
    echoLyricTemplateFrameState.toString(),
  ].join("\n");
}
