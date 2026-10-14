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
  const value = String(word.displayText || word.word || word.text || "");
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

function echoLyricJoinDisplayTokens(words = [], timeSeconds = 0) {
  return words.map((word, index) => `${index && word.joinerBefore !== false ? " " : ""}${echoLyricDisplayToken(word, timeSeconds)}`).join("").trim();
}

function echoLyricComparableToken(value = "") {
  return String(value).normalize("NFKD").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Keep authored punctuation and compound-word endings attached to the
 * acoustic intervals carried by the aligned word rows. */
export function echoLyricAuthoredWordSurfaces(line = {}) {
  const words = Array.isArray(line.words) ? line.words : [];
  const fallback = words.map((word) => String(word.word || word.text || ""));
  const authored = String(line.text || "").trim();
  if (!authored || !words.length) return fallback;
  const surfaces = authored
    .split(/\s+/u)
    .flatMap((token) => token.split(/(?<=-)(?=[\p{L}\p{N}])/u));
  if (surfaces.length !== words.length) return fallback;
  if (surfaces.some((surface, index) => echoLyricComparableToken(surface) !== echoLyricComparableToken(fallback[index]))) return fallback;
  return surfaces;
}

export function echoLyricCharacterFrames({
  templateId = "",
  text = "",
  word = {},
  reducedMotion = false,
  motionIntensity = 1,
} = {}) {
  if (!["letter-wave-v1", "kinetic-typewriter-v1", "prism-slam-v1", "letterfall-totem-v1"].includes(templateId)) return [];
  const characters = Array.from(String(text || ""));
  const intensity = lyricClamp01(motionIntensity);
  const progress = lyricClamp01(word.progress);
  const reveal = progress * Math.max(1, characters.length);
  return characters.map((character, index) => {
    const completed = Boolean(word.completed) || index + 0.15 <= reveal;
    const active = Boolean(word.active);
    if (reducedMotion) return {
      index,
      text: character,
      opacity: 1,
      scale: 1,
      translateX: 0,
      translateY: 0,
      rotateDegrees: 0,
    };
    if (templateId === "letter-wave-v1") {
      const wave = active ? Math.sin((index * 0.82) - (progress * Math.PI * 2.4)) : 0;
      return {
        index,
        text: character,
        opacity: lyricRound(active || word.completed ? 1 : 0.62),
        scale: lyricRound(1 + Math.max(0, wave) * 0.08 * intensity),
        translateX: 0,
        translateY: lyricRound(wave * 9 * intensity),
        rotateDegrees: lyricRound(wave * 2.5 * intensity),
        colorRole: index % 3 === 0 ? "accent" : "text",
        shadowRole: active ? "chromatic" : "soft",
      };
    }
    if (templateId === "prism-slam-v1") {
      const spread = characters.length > 1 ? (index / (characters.length - 1)) * 2 - 1 : 0;
      const strike = active ? Math.sin((progress * Math.PI) + index * 1.3) : 0;
      return {
        index,
        text: character,
        opacity: lyricRound(active || word.completed ? 1 : 0.34),
        scale: lyricRound(1 + Math.max(0, strike) * .12 * intensity),
        translateX: lyricRound(spread * (1 - progress) * 22 * intensity),
        translateY: lyricRound(strike * 12 * intensity),
        rotateDegrees: lyricRound(spread * (1 - progress) * 8 * intensity),
        colorRole: index % 3 === 0 ? "accent" : "text",
        shadowRole: "prism",
      };
    }
    if (templateId === "letterfall-totem-v1") {
      const local = lyricClamp01(reveal - index);
      return {
        index,
        text: character,
        opacity: lyricRound(word.completed || completed ? 1 : .3 + local * .7),
        scale: lyricRound(.82 + local * .18),
        translateX: lyricRound((index % 2 ? 1 : -1) * (1 - local) * 24 * intensity),
        translateY: lyricRound((1 - local) * -28 * intensity),
        rotateDegrees: lyricRound((index % 2 ? 1 : -1) * (1 - local) * 7 * intensity),
        colorRole: index % 2 ? "text" : "accent",
        shadowRole: active ? "vertical" : "soft",
      };
    }
    const local = lyricClamp01(reveal - index);
    return {
      index,
      text: character,
      opacity: lyricRound(word.completed || completed ? 1 : 0.3 + local * 0.7),
      scale: lyricRound(1 + (active ? (1 - local) * 0.13 * intensity : 0)),
      translateX: lyricRound(active ? (1 - local) * 5 * intensity : 0),
      translateY: lyricRound(active ? (1 - local) * 10 * intensity : 0),
      rotateDegrees: lyricRound(active ? (1 - local) * -4 * intensity : 0),
      colorRole: completed ? "text" : active ? "accent" : "muted",
      shadowRole: active ? "caret" : "soft",
    };
  });
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
    "center-word-focus-v1": 1,
    "square-word-mosaic-v1": 9,
    "letter-wave-v1": 7,
    "kinetic-typewriter-v1": 7,
    "vertical-poster-stack-v1": 5,
    "prism-slam-v1": 1,
    "letterfall-totem-v1": 1,
  };
  const rows = Array.isArray(words) ? words : [];
  const limit = templateId === "plain-phrase-v1" ? Math.max(1, rows.length) : limits[templateId] || 10;
  if (rows.length <= limit) {
    return { startIndex: 0, endIndex: rows.length, wordCount: rows.length, text: echoLyricJoinDisplayTokens(rows, timeSeconds) };
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
    text: echoLyricJoinDisplayTokens(rows.slice(startIndex, endIndex), timeSeconds),
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
    highlightWords: normalized.highlightWords,
    reducedMotion: normalized.reducedMotion,
    motionIntensity: normalized.motionIntensity,
  });
}

// Acoustic anchors keep their measured intervals. Unanchored words (no aligner
// match, low confidence, out of order or outside the phrase) are placed between
// the neighbouring anchors, or the phrase edges, by character weight, so every
// word has an ordered, non-overlapping interval. Self-contained for HyperFrames.
export function echoLyricResolvedWordIntervals(line = {}) {
  const words = Array.isArray(line.words) ? line.words : [];
  const lineStart = echoLyricBoundary(line, 'start', 0);
  const lineEnd = Math.max(lineStart + 0.001, echoLyricBoundary(line, 'end', lineStart + 0.001));
  const items = words.map((word) => {
    const start = echoLyricBoundary(word, 'start', NaN), end = echoLyricBoundary(word, 'end', NaN);
    const confidence = word.confidence ?? word.probability;
    // Operator corrections are placed by hand against the audio: keep them as anchors.
    const evidence = Boolean(word.timingCorrection) || (!(word.matched === false || word.unaligned === true)
      && (word.matched === true || (typeof confidence === 'number' && confidence >= .6 && confidence <= 1)));
    const weight = Math.max(1, Array.from(String(word.word || word.text || '').replace(/[^\p{L}\p{N}]/gu, '')).length);
    return { start, end, weight, anchored: evidence && Number.isFinite(start) && Number.isFinite(end) && end > start && start >= lineStart - 1e-6 && end <= lineEnd + 1e-6 };
  });
  let previousEnd = lineStart;
  for (const item of items) {
    if (item.anchored && item.start < previousEnd - 1e-6) item.anchored = false;
    if (item.anchored) previousEnd = item.end;
  }
  for (let index = 0; index < items.length;) {
    if (items[index].anchored) { index += 1; continue; }
    let last = index;
    while (last + 1 < items.length && !items[last + 1].anchored) last += 1;
    const previous = items[index - 1], next = items[last + 1], minimum = 0.15 * (last - index + 1);
    let from = previous ? previous.end : lineStart, to = next ? next.start : lineEnd;
    // Aligners often skip a short word wedged between two matches: borrow up
    // to half of each neighbour instead of stacking the word on top of them.
    if (to - from < minimum && previous) { from = Math.max(previous.start + (previous.end - previous.start) / 2, to - minimum); previous.end = lyricRound(Math.min(previous.end, from), 6); }
    if (to - from < minimum && next) { to = Math.min(next.end - (next.end - next.start) / 2, from + minimum); next.start = lyricRound(Math.max(next.start, to), 6); }
    to = Math.max(to, from + 0.001 * (last - index + 1));
    const total = items.slice(index, last + 1).reduce((sum, item) => sum + item.weight, 0);
    let cursor = from;
    for (let k = index; k <= last; k += 1) {
      items[k].start = lyricRound(cursor, 6);
      cursor += (to - from) * items[k].weight / total;
      items[k].end = lyricRound(k === last ? to : cursor, 6);
    }
    index = last + 1;
  }
  return { words: items.map(({ start, end, anchored }) => ({ start, end, anchored })), anchoredCount: items.filter((item) => item.anchored).length };
}

// Text-match flags and line-level scores are not acoustic word confidence.
// Keep this self-contained for the generated HyperFrames/Song Card runtime.
// A line is never hidden: with no usable anchor it falls back to phrase display.
export function echoLyricWordTimingPolicy(line = {}, timingSource = '') {
  const words = Array.isArray(line.words) ? line.words : [];
  if (words.length && words.every((word) => word.matched === false || word.unaligned === true)) return {
    mode: 'phrase',
    reason: 'line-unaligned',
    label: 'Phrase timing · no direct word anchor',
    manuallyVerified: false,
  };
  let reason = /synthetic|weighted|evenly|estimated/i.test(timingSource) ? 'synthetic-word-timing' : '';
  let directAnchorWords = 0;
  if (!reason && !words.length) reason = 'word-timing-missing';
  let previousEnd = echoLyricBoundary(line, 'start', -Infinity);
  for (const word of words) {
    if (reason) break;
    const start = echoLyricBoundary(word, 'start', NaN), end = echoLyricBoundary(word, 'end', NaN);
    const confidence = word.confidence ?? word.probability;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) reason = 'word-interval-invalid';
    else if (start < echoLyricBoundary(line, 'start', -Infinity) || end > echoLyricBoundary(line, 'end', Infinity)) reason = 'word-outside-phrase';
    else if (start < previousEnd) reason = 'overlapping-word-intervals';
    else if (word.matched === false || word.unaligned === true) reason = 'word-unaligned';
    else if (word.matched === true) directAnchorWords += 1;
    else if (typeof confidence !== 'number' || !Number.isFinite(confidence)) reason = 'word-confidence-missing';
    else if (confidence < .6 || confidence > 1) reason = 'word-confidence-low-or-invalid';
    previousEnd = end;
  }
  const acceptedReason = directAnchorWords === words.length && words.length ? 'direct-stt-word-anchors' : 'word-confidence-available';
  // Most words carry acoustic anchors: animate words, interpolating the rest
  // between their neighbours rather than dropping the whole line to phrase.
  if (reason && reason !== 'synthetic-word-timing' && words.length) {
    const resolved = echoLyricResolvedWordIntervals(line);
    const ratio = resolved.anchoredCount / words.length;
    // Half the words anchored, or both ends anchored so every interpolated word is bracketed by measurements.
    const bracketed = resolved.words[0].anchored && resolved.words.at(-1).anchored && ratio >= 1 / 3;
    if (resolved.anchoredCount && (ratio >= .5 || bracketed)) return { mode: 'word', reason,
      label: 'Word timing · unanchored words interpolated between anchors', manuallyVerified: false,
      anchoredWords: resolved.anchoredCount, interpolatedWords: words.length - resolved.anchoredCount };
  }
  return { mode: reason ? 'phrase' : 'word', reason: reason || acceptedReason,
    label: reason ? 'Phrase timing · word alignment unverified' : directAnchorWords === words.length ? 'Word timing · direct STT anchors (not syllable exact)' : 'Word timing · confidence available',
    manuallyVerified: false };
}

export function echoLyricSyllableTimingPolicy(line = {}) {
  const words = Array.isArray(line.words) ? line.words : [];
  if (!words.length) return { accepted: false, reason: 'word-timing-missing' };
  let count = 0;
  let previousEnd = echoLyricBoundary(line, 'start', -Infinity);
  for (const word of words) {
    const syllables = Array.isArray(word.syllables) ? word.syllables : [];
    if (!syllables.length) return { accepted: false, reason: 'syllable-timing-missing' };
    for (const syllable of syllables) {
      const start = echoLyricBoundary(syllable, 'start', NaN), end = echoLyricBoundary(syllable, 'end', NaN);
      const confidence = syllable.confidence ?? syllable.probability;
      const source = String(syllable.timing_source || syllable.timingSource || syllable.evidence?.kind || syllable.evidence?.source || '');
      const reviewed = syllable.evidence?.humanReviewed === true && Boolean(String(syllable.evidence?.audioHash || '').trim()) && Boolean(String(syllable.evidence?.reviewer || '').trim());
      const acoustic = /acoustic|forced|phoneme|syllable|manual/i.test(source);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { accepted: false, reason: 'syllable-interval-invalid' };
      if (start < echoLyricBoundary(word, 'start', -Infinity) || end > echoLyricBoundary(word, 'end', Infinity)) return { accepted: false, reason: 'syllable-outside-word' };
      if (start < previousEnd) return { accepted: false, reason: 'overlapping-syllable-intervals' };
      if (!reviewed && (!acoustic || typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < .6 || confidence > 1)) return { accepted: false, reason: 'syllable-evidence-unverified' };
      previousEnd = end;
      count += 1;
    }
  }
  return { accepted: true, reason: 'explicit-syllable-evidence', count };
}

export function echoLyricTimingPolicy(line = {}, timingSource = '') {
  const syllable = echoLyricSyllableTimingPolicy(line);
  if (syllable.accepted) return {
    mode: 'syllable',
    reason: syllable.reason,
    label: 'Syllable timing · explicit acoustic/review evidence',
    manuallyVerified: (line.words || []).every(word => (word.syllables || []).every(item => item.evidence?.humanReviewed === true && Boolean(String(item.evidence?.audioHash || '').trim()) && Boolean(String(item.evidence?.reviewer || '').trim()))),
    syllableCount: syllable.count,
  };
  return echoLyricWordTimingPolicy(line, timingSource);
}

export function echoLyricTemplateFrameState({
  templateId = "scanline-phrase-ribbon-v1",
  enabled = true,
  line = {},
  timeSeconds = 0,
  fps = 30,
  timingSource = '',
  highlightWords = true,
  reducedMotion = false,
  motionIntensity = 1,
} = {}) {
  if (highlightWords === false) templateId = "plain-phrase-v1";
  const clock = echoLyricFrameTime(timeSeconds, fps);
  const start = echoLyricBoundary(line, "start");
  const end = Math.max(start + 0.001, echoLyricBoundary(line, "end", start + 0.001));
  const entryStart = Math.max(0, start - 0.24);
  const exitEnd = end + 0.18;
  const entryProgress = lyricClamp01((clock.timeSeconds - entryStart) / Math.max(0.001, start - entryStart));
  const exitProgress = lyricClamp01((clock.timeSeconds - end) / Math.max(0.001, exitEnd - end));
  const lineProgress = lyricClamp01((clock.timeSeconds - start) / Math.max(0.001, end - start));
  const words = Array.isArray(line.words) ? line.words : [];
  const authoredWordSurfaces = echoLyricAuthoredWordSurfaces(line);
  // Unspaced scripts (Japanese/Chinese) are tokenised per character run; never insert spaces between them.
  const unspaced = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆、。！？「」『』]/u;
  const displayWords = words.map((word, index) => ({ ...word, displayText: authoredWordSurfaces[index], joinerBefore: index > 0 && !/-$/u.test(authoredWordSurfaces[index - 1])
    && !(unspaced.test(Array.from(String(authoredWordSurfaces[index - 1] || "")).at(-1) || "") && unspaced.test(Array.from(String(authoredWordSurfaces[index] || ""))[0] || "")) }));
  const timingPolicy = highlightWords === false
    ? { mode: 'phrase', reason: 'word-highlighting-disabled', label: 'Full phrase · word highlighting off', manuallyVerified: false }
    : echoLyricTimingPolicy(line, timingSource);
  const resolvedIntervals = echoLyricResolvedWordIntervals(line).words;
  const singleWordPerformance = ["center-word-focus-v1", "prism-slam-v1", "letterfall-totem-v1"].includes(templateId);
  // Phrase lines still page by their best interval estimate so long lines never overflow the caption box.
  const timedWords = displayWords.map((word, index) => ({ ...word, start: resolvedIntervals[index].start, end: resolvedIntervals[index].end, startSeconds: undefined, endSeconds: undefined }));
  const displayWindow = echoLyricDisplayWindow({
    templateId,
    words: timedWords,
    timeSeconds: clock.timeSeconds,
    lineStart: start,
    lineEnd: end,
  });
  const frame = {
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
      const wordStart = timingPolicy.mode === 'syllable' ? echoLyricBoundary(word, "start", start) : resolvedIntervals[index].start;
      const wordEnd = Math.max(wordStart + 0.001, timingPolicy.mode === 'syllable' ? echoLyricBoundary(word, "end", wordStart + 0.001) : resolvedIntervals[index].end);
      const syllables = (Array.isArray(word.syllables) ? word.syllables : []).map((syllable, syllableIndex) => {
        const syllableStart = echoLyricBoundary(syllable, "start", wordStart);
        const syllableEnd = Math.max(syllableStart + 0.001, echoLyricBoundary(syllable, "end", syllableStart + 0.001));
        const active = timingPolicy.mode === 'syllable' && clock.timeSeconds >= syllableStart && clock.timeSeconds < syllableEnd;
        return {
          index: syllableIndex,
          text: String(syllable.text || syllable.syllable || ""),
          active,
          completed: timingPolicy.mode === 'syllable' && clock.timeSeconds >= syllableEnd,
          progress: timingPolicy.mode === 'syllable' ? lyricRound(lyricClamp01((clock.timeSeconds - syllableStart) / Math.max(0.001, syllableEnd - syllableStart))) : 0,
        };
      });
      const activeSyllable = syllables.find(item => item.active);
      const activeSyllableIndex = activeSyllable?.index ?? -1;
      const syllableProgress = timingPolicy.mode === 'syllable' && syllables.length
        ? activeSyllableIndex >= 0
          ? lyricClamp01((activeSyllableIndex + activeSyllable.progress) / syllables.length)
          : clock.timeSeconds >= wordEnd ? 1 : 0
        : 0;
      // One-word templates have nothing to show without a current word, so they
      // step through the best interval estimate even on phrase-timed lines.
      const animateWords = timingPolicy.mode !== 'phrase' || singleWordPerformance;
      const active = timingPolicy.mode === 'syllable' ? activeSyllableIndex >= 0 : animateWords && clock.timeSeconds >= wordStart && clock.timeSeconds < wordEnd;
      const completed = animateWords && clock.timeSeconds >= wordEnd;
      const wordProgress = timingPolicy.mode === 'syllable' ? syllableProgress : animateWords ? lyricClamp01((clock.timeSeconds - wordStart) / Math.max(0.001, wordEnd - wordStart)) : 0;
      const onsetImpulse = active ? Math.max(0, 1 - (clock.timeSeconds - wordStart) / 0.18) ** 2 : 0;
      const spread = words.length > 1 ? (index / (words.length - 1)) * 2 - 1 : 0;
      const base = {
        index,
        joinerBefore: displayWords[index]?.joinerBefore,
        display: index >= displayWindow.startIndex && index < displayWindow.endIndex,
        displayText: echoLyricDisplayToken(timedWords[index], clock.timeSeconds),
        active,
        completed,
        progress: lyricRound(wordProgress),
        syllables,
        opacity: lyricRound((1 - exitProgress) * (0.35 + entryProgress * 0.65)),
        scale: 1,
        translateX: 0,
        translateY: 0,
        rotateDegrees: 0,
        underlineProgress: reducedMotion ? (active || completed ? 1 : 0) : active ? lyricRound(wordProgress) : completed ? 1 : 0,
      };
      if (reducedMotion || !animateWords) return { ...base, opacity: 1 };
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
      if (templateId === "square-word-mosaic-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.06 + 0.08 * onsetImpulse : completed ? 1 : 0.92 + entryProgress * 0.08),
          translateY: lyricRound((1 - entryProgress) * ((index % 3) - 1) * 8),
          rotateDegrees: lyricRound(active ? spread * 2.5 * onsetImpulse : 0),
        };
      }
      if (templateId === "vertical-poster-stack-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.03 + 0.07 * onsetImpulse : 1),
          translateX: lyricRound((index % 2 ? 1 : -1) * (1 - entryProgress) * 18),
          translateY: lyricRound((1 - entryProgress) * 6),
        };
      }
      if (templateId === "letter-wave-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.02 + 0.03 * onsetImpulse : 1),
        };
      }
      if (templateId === "kinetic-typewriter-v1") return base;
      if (templateId === "prism-slam-v1") return {
        ...base,
        scale: lyricRound(1 + .18 * onsetImpulse),
        translateY: lyricRound((1 - entryProgress) * 18),
      };
      if (templateId === "letterfall-totem-v1") return {
        ...base,
        scale: lyricRound(1 + .08 * onsetImpulse),
      };
      return {
        ...base,
        scale: lyricRound(active ? 1.01 + 0.05 * onsetImpulse : 1),
        translateX: lyricRound((1 - entryProgress) * -8),
      };
    }).map(word => {
      const animatedWord = { ...word,
        scale: lyricRound(1 + (word.scale - 1) * lyricClamp01(motionIntensity)),
        translateX: lyricRound(word.translateX * lyricClamp01(motionIntensity)),
        translateY: lyricRound(word.translateY * lyricClamp01(motionIntensity)),
        rotateDegrees: lyricRound(word.rotateDegrees * lyricClamp01(motionIntensity)),
      };
      animatedWord.characters = echoLyricCharacterFrames({
        templateId,
        text: animatedWord.displayText,
        word: animatedWord,
        reducedMotion,
        motionIntensity,
      });
      return animatedWord;
    }),
  };
  if (singleWordPerformance) {
    // Hold the most recently sung word through inter-word gaps (and the first
    // word through the entry lead-in) so the template never blinks out mid-line.
    const activeWord = frame.words.find((word) => word.active)
      || [...frame.words].reverse().find((word) => clock.timeSeconds >= resolvedIntervals[word.index].start)
      || frame.words[0];
    frame.visible = frame.visible && Boolean(activeWord);
    frame.words = frame.words.map((word) => ({
      ...word,
      display: Boolean(activeWord && word.index === activeWord.index),
      opacity: activeWord && word.index === activeWord.index ? 1 : 0,
      translateX: 0,
      translateY: 0,
      rotateDegrees: 0,
      underlineProgress: 0,
    }));
    frame.displayWindow = activeWord
      ? { startIndex: activeWord.index, endIndex: activeWord.index + 1, wordCount: 1, text: activeWord.displayText }
      : { startIndex: 0, endIndex: 0, wordCount: 0, text: "" };
    frame.displayText = frame.displayWindow.text;
  }
  return frame;
}

export function echoLyricTemplateRuntimeBrowserSource() {
  return [
    `const ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA=${JSON.stringify(ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA)};`,
    echoLyricBoundary.toString(),
    lyricFinite.toString(),
    lyricClamp01.toString(),
    lyricRound.toString(),
    echoLyricJoinDisplayTokens.toString(),
    echoLyricComparableToken.toString(),
    echoLyricAuthoredWordSurfaces.toString(),
    echoLyricCharacterFrames.toString(),
    echoLyricFrameTime.toString(),
    echoLyricDisplayToken.toString(),
    echoLyricDisplayWindow.toString(),
    echoLyricResolvedWordIntervals.toString(),
    echoLyricWordTimingPolicy.toString(),
    echoLyricSyllableTimingPolicy.toString(),
    echoLyricTimingPolicy.toString(),
    echoLyricTemplateFrameState.toString(),
  ].join("\n");
}
