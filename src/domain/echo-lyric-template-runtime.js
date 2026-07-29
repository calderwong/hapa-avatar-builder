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
  const frame = Math.max(0, Math.floor(Math.max(0, lyricFinite(timeSeconds)) * rate));
  return { frame, fps: rate, timeSeconds: lyricRound(frame / rate, 6) };
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
  });
}

export function echoLyricTemplateFrameState({
  templateId = "scanline-phrase-ribbon-v1",
  enabled = true,
  line = {},
  timeSeconds = 0,
  fps = 30,
} = {}) {
  const clock = echoLyricFrameTime(timeSeconds, fps);
  const start = lyricFinite(line.start);
  const end = Math.max(start + 0.001, lyricFinite(line.end, start + 0.001));
  const entryStart = Math.max(0, start - 0.24);
  const exitEnd = end + 0.18;
  const entryProgress = lyricClamp01((clock.timeSeconds - entryStart) / Math.max(0.001, start - entryStart));
  const exitProgress = lyricClamp01((clock.timeSeconds - end) / Math.max(0.001, exitEnd - end));
  const lineProgress = lyricClamp01((clock.timeSeconds - start) / Math.max(0.001, end - start));
  const words = Array.isArray(line.words) ? line.words : [];
  return {
    schemaVersion: ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA,
    templateId,
    frame: clock.frame,
    fps: clock.fps,
    timeSeconds: clock.timeSeconds,
    visible: enabled && clock.timeSeconds >= entryStart && clock.timeSeconds < exitEnd,
    lineProgress: lyricRound(lineProgress),
    entryProgress: lyricRound(entryProgress),
    exitProgress: lyricRound(exitProgress),
    words: words.map((word, index) => {
      const wordStart = lyricFinite(word.start, start);
      const wordEnd = Math.max(wordStart + 0.001, lyricFinite(word.end, wordStart + 0.001));
      const active = clock.timeSeconds >= wordStart && clock.timeSeconds < wordEnd;
      const completed = clock.timeSeconds >= wordEnd;
      const wordProgress = lyricClamp01((clock.timeSeconds - wordStart) / Math.max(0.001, wordEnd - wordStart));
      const spread = words.length > 1 ? (index / (words.length - 1)) * 2 - 1 : 0;
      const base = {
        index,
        active,
        completed,
        progress: lyricRound(wordProgress),
        opacity: lyricRound((1 - exitProgress) * (0.35 + entryProgress * 0.65)),
        scale: 1,
        translateX: 0,
        translateY: 0,
        rotateDegrees: 0,
        underlineProgress: active ? lyricRound(wordProgress) : completed ? 1 : 0,
      };
      if (templateId === "kinetic-word-burst-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.16 : completed ? 1 : 0.94 + entryProgress * 0.06),
          translateY: lyricRound((1 - entryProgress) * (12 + (index % 3) * 4)),
          rotateDegrees: lyricRound((1 - entryProgress) * spread * 5),
        };
      }
      if (templateId === "stacked-hook-echo-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.08 : 1),
          translateX: lyricRound(spread * (1 - entryProgress) * 10),
          translateY: lyricRound((index % 2 ? -1 : 1) * (1 - entryProgress) * 3),
        };
      }
      if (templateId === "orbit-caption-v1") {
        return {
          ...base,
          scale: lyricRound(active ? 1.1 : 1),
          translateY: lyricRound(-Math.sin((spread + 1) * Math.PI / 2) * 8),
          rotateDegrees: lyricRound(spread * 4),
        };
      }
      return {
        ...base,
        scale: lyricRound(active ? 1.06 : 1),
        translateX: lyricRound((1 - entryProgress) * -8),
      };
    }),
  };
}

export function echoLyricTemplateRuntimeBrowserSource() {
  return [
    `const ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA=${JSON.stringify(ECHO_LYRIC_TEMPLATE_RUNTIME_SCHEMA)};`,
    lyricFinite.toString(),
    lyricClamp01.toString(),
    lyricRound.toString(),
    echoLyricFrameTime.toString(),
    echoLyricTemplateFrameState.toString(),
  ].join("\n");
}
