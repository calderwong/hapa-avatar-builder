import { echoLyricBoundary } from "./echo-lyric-time.js";
import { normalizeEchoLyricContract } from "./echo-lyric-contract.js";
import { resolveEchoLyricTemplateFrame } from "./echo-lyric-template-runtime.js";
import { echoLyricDisplayWindow } from "./echo-lyric-template-runtime.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";

export const ECHO_LYRIC_RENDER_SAFETY_SCHEMA = "hapa.echo.lyric-render-safety.v1";
export const ECHO_LYRIC_FRAME_BUDGET_MS = 0.35;

const POSITIONS = new Set(["bottom-center", "top-center", "center", "lower-left", "lower-right", "upper-left", "upper-right", "side-right"]);
const STYLES = new Set(["neon-cyan", "magenta-glow", "gold-caption", "paper-white", "minimal-subtitle"]);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 4) => {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
};

function addIssue(issues, code, message, details = {}) {
  issues.push({ code, message, ...details });
}

export function echoLyricSafetySampleTimes(lines = [], fps = 30) {
  const frame = 1 / Math.max(1, finite(fps, 30));
  const values = (Array.isArray(lines) ? lines : []).flatMap((line) => {
    const start = echoLyricBoundary(line, "start");
    const end = echoLyricBoundary(line, "end", start);
    if (!(end > start)) return [];
    return [
      Math.max(0, start - frame),
      start,
      start + ((end - start) / 2),
      Math.max(start, end - frame),
      end + frame,
    ];
  });
  return [...new Set(values.map((value) => round(value, 6)))].sort((left, right) => left - right);
}

export function inspectEchoLyricRenderSafety({
  project = {},
  lyricOverlay = null,
  outputProfile = null,
  includeRuntimeSamples = true,
} = {}) {
  const hasDeclaredLyrics = Boolean(
    (lyricOverlay && (
      lyricOverlay.enabled !== undefined
      || (Array.isArray(lyricOverlay.lines) && lyricOverlay.lines.length)
    ))
      || project?.lyrics
      || project?.lyrics_enabled !== undefined
      || (Array.isArray(project?.timed_lyrics) && project.timed_lyrics.length),
  );
  const contract = lyricOverlay || normalizeEchoLyricContract(project);
  const enabled = hasDeclaredLyrics && contract.enabled !== false;
  const lines = Array.isArray(contract.lines)
    ? contract.lines
    : Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [];
  const profile = resolveEchoOutputProfile(outputProfile || project);
  const duration = Math.max(0, finite(project.duration || project.durationSeconds || project.song?.durationSeconds));
  const issues = [];
  if (!enabled) {
    return {
      schemaVersion: ECHO_LYRIC_RENDER_SAFETY_SCHEMA,
      ok: true,
      status: "disabled",
      enabled: false,
      profileId: profile.id,
      templateId: contract.templateId || null,
      lineCount: 0,
      wordCount: 0,
      issues,
      runtime: { sampleCount: 0, maxTranslatePx: 0, maxScale: 1, maxRotateDegrees: 0 },
    };
  }
  if (!lines.length) addIssue(issues, "enabled-lyrics-have-no-lines", "Lyrics are enabled but no measured lyric cues are available.");
  if (!POSITIONS.has(String(contract.position || project.lyric_position || "bottom-center"))) {
    addIssue(issues, "unsafe-lyric-position", "The selected lyric position has no declared safe-area placement.");
  }
  if (!STYLES.has(String(contract.style || project.lyric_style || "neon-cyan"))) {
    addIssue(issues, "unverified-lyric-contrast", "The selected lyric style has no verified contrast palette.");
  }
  let previousEnd = 0;
  let wordCount = 0;
  lines.forEach((line, lineIndex) => {
    const start = echoLyricBoundary(line, "start");
    const end = echoLyricBoundary(line, "end");
    const cueDuration = end - start;
    const value = String(line.text || "").trim();
    if (!value) addIssue(issues, "empty-lyric-line", "A lyric cue has no visible text.", { lineIndex, timestampSeconds: start });
    // The template runtime deterministically clamps degenerate line windows to
    // a 1 ms floor, so zero/negative line durations render as harmless
    // one-frame cues and must not block the render.
    if (!Number.isFinite(start) || !Number.isFinite(end)) addIssue(issues, "invalid-lyric-window", "A lyric cue window cannot be resolved to a finite duration.", { lineIndex, timestampSeconds: start });
    if (lineIndex > 0 && start < previousEnd - 0.001) addIssue(issues, "overlapping-lyric-lines", "Two lyric cues overlap.", { lineIndex, timestampSeconds: start });
    if (duration > 0 && end > duration + 0.001) addIssue(issues, "lyric-after-song-end", "A lyric cue extends past the audio duration.", { lineIndex, timestampSeconds: end });
    const words = Array.isArray(line.words) ? line.words : [];
    const presentationWindow = echoLyricDisplayWindow({
      templateId: contract.templateId,
      words,
      timeSeconds: start,
      lineStart: start,
      lineEnd: end,
    });
    const presentedText = words.length ? presentationWindow.text : value;
    if (presentedText.length > 130) addIssue(issues, "lyric-line-too-long", "A rendered lyric window is too long for the protected caption region.", { lineIndex, timestampSeconds: start, characterCount: presentedText.length });
    if (!words.length && value.length >= 20 && cueDuration > 0 && value.length / cueDuration > 90) addIssue(issues, "lyric-reading-rate-unsafe", "A lyric cue changes too quickly to read.", { lineIndex, timestampSeconds: start, charactersPerSecond: round(value.length / cueDuration, 2) });
    if (cueDuration > 0 && cueDuration < 0.05) addIssue(issues, "lyric-cue-too-short", "A lyric cue is shorter than two 30 fps frames.", { lineIndex, timestampSeconds: start, durationSeconds: round(cueDuration, 4) });
    wordCount += words.length;
    let previousWordEnd = start;
    words.forEach((word, wordIndex) => {
      const wordStart = echoLyricBoundary(word, "start", start);
      // Mirror the template runtime's 1 ms clamp (echo-lyric-template-runtime):
      // degenerate word windows render as harmless one-frame slivers and must
      // not block the render.
      const wordEnd = Math.max(wordStart + 0.001, echoLyricBoundary(word, "end", wordStart + 0.001));
      if (!Number.isFinite(wordStart) || !Number.isFinite(wordEnd)) addIssue(issues, "invalid-word-window", "A lyric word window cannot be resolved to a finite duration.", { lineIndex, wordIndex, timestampSeconds: wordStart });
      if (wordStart < start - 0.001 || wordEnd > end + 0.001) addIssue(issues, "word-outside-line", "A word highlight falls outside its lyric line.", { lineIndex, wordIndex, timestampSeconds: wordStart });
      if (wordIndex > 0 && wordStart < previousWordEnd - 0.001) addIssue(issues, "overlapping-lyric-words", "Two lyric word highlights overlap.", { lineIndex, wordIndex, timestampSeconds: wordStart });
      previousWordEnd = wordEnd;
    });
    previousEnd = end;
  });

  const runtime = { sampleCount: 0, maxTranslatePx: 0, maxScale: 1, maxRotateDegrees: 0 };
  if (includeRuntimeSamples) {
    for (const line of lines) {
      const start = echoLyricBoundary(line, "start");
      const end = echoLyricBoundary(line, "end", start);
      for (const timeSeconds of [start, start + ((end - start) / 2), Math.max(start, end - (1 / profile.fps))]) {
        const frame = resolveEchoLyricTemplateFrame({ project, contract, line, timeSeconds, fps: profile.fps });
        runtime.sampleCount += 1;
        for (const word of frame.words || []) {
          runtime.maxTranslatePx = Math.max(runtime.maxTranslatePx, Math.abs(finite(word.translateX)), Math.abs(finite(word.translateY)));
          runtime.maxScale = Math.max(runtime.maxScale, finite(word.scale, 1));
          runtime.maxRotateDegrees = Math.max(runtime.maxRotateDegrees, Math.abs(finite(word.rotateDegrees)));
        }
      }
    }
    runtime.maxTranslatePx = round(runtime.maxTranslatePx);
    runtime.maxScale = round(runtime.maxScale);
    runtime.maxRotateDegrees = round(runtime.maxRotateDegrees);
    if (runtime.maxTranslatePx > 32 || runtime.maxScale > 1.25 || runtime.maxRotateDegrees > 8) {
      addIssue(issues, "unsafe-lyric-motion", "Lyric motion exceeds the bounded accessibility envelope.", { ...runtime });
    }
  }
  return {
    schemaVersion: ECHO_LYRIC_RENDER_SAFETY_SCHEMA,
    ok: issues.length === 0,
    status: issues.length ? "blocked" : "ready",
    enabled,
    profileId: profile.id,
    templateId: contract.templateId || null,
    lineCount: lines.length,
    wordCount,
    issues,
    runtime,
  };
}

export function benchmarkEchoLyricTemplateRuntime({
  iterations = 20_000,
  now = () => performance.now(),
} = {}) {
  const line = {
    text: "Deterministic lyric frame budget",
    start: 1,
    end: 3,
    words: [
      { word: "Deterministic", start: 1, end: 1.7 },
      { word: "lyric", start: 1.7, end: 2.1 },
      { word: "frame", start: 2.1, end: 2.5 },
      { word: "budget", start: 2.5, end: 3 },
    ],
  };
  const templates = ["kinetic-word-burst-v1", "scanline-phrase-ribbon-v1", "stacked-hook-echo-v1", "orbit-caption-v1"];
  const started = now();
  for (let index = 0; index < iterations; index += 1) {
    resolveEchoLyricTemplateFrame({
      project: { lyrics: { enabled: true, templateId: templates[index % templates.length] } },
      line,
      timeSeconds: 1 + ((index % 60) / 30),
      fps: 30,
    });
  }
  const elapsedMs = Math.max(0, now() - started);
  const perFrameMs = elapsedMs / Math.max(1, iterations);
  return {
    schemaVersion: "hapa.echo.lyric-runtime-benchmark.v1",
    ok: perFrameMs <= ECHO_LYRIC_FRAME_BUDGET_MS,
    iterations,
    elapsedMs: round(elapsedMs, 3),
    perFrameMs: round(perFrameMs, 6),
    budgetMs: ECHO_LYRIC_FRAME_BUDGET_MS,
  };
}
