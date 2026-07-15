import { execFile as execFileCallback, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { normalizeHyperFramesStemRole } from "../src/domain/hyperframes-visualizer-runtime.js";

const execFile = promisify(execFileCallback);

export const RENDER_AUDIO_INPUT_PREFLIGHT_SCHEMA = "hapa.render-audio-input-preflight.v5";
export const RENDER_AUDIO_INPUT_EVIDENCE_SCHEMA = "hapa.render-audio-input-evidence.v5";
export const RENDER_AUDIO_INPUT_CACHE_SCHEMA = "hapa.render-audio-input-cache.v5";
const TRUSTED_AUDIO_PRODUCER = "hapa.render-audio-input.default-ffmpeg-xerror-signal-scan-sha256.v2";
const INVOCATION_CACHEABLE_FAILURES = new Set([
  "audio-input-stream-metadata-invalid",
  "audio-input-stream-duration-unavailable",
  "audio-input-signal-stats-missing",
  "audio-input-silent",
]);

const successfulEvidenceCache = new Map();
const inFlightEvidence = new Map();
const cacheOrigins = new Map();
let defaultAudioToolchainCache = null;
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];

function resolveExecutable(command) {
  const candidate = text(command);
  if (!candidate) return null;
  const paths = candidate.includes(path.sep)
    ? [path.resolve(candidate)]
    : text(process.env.PATH).split(path.delimiter).filter(Boolean).map((directory) => path.join(directory, candidate));
  for (const filePath of paths) {
    try {
      fs.accessSync(filePath, fs.constants.X_OK);
      return fs.realpathSync(filePath);
    } catch { /* Try the next PATH entry. */ }
  }
  return null;
}

function decoderCommandIdentity(command) {
  const resolvedPath = resolveExecutable(command);
  let version = null;
  try {
    const probe = spawnSync(command, ["-version"], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    version = text(`${probe.stdout || ""}\n${probe.stderr || ""}`).split(/\r?\n/u).map(text).find(Boolean) || null;
  } catch { /* Missing tools are reported by the actual decode. */ }
  let executable = null;
  if (resolvedPath) {
    try {
      const stat = fs.statSync(resolvedPath);
      executable = {
        path: resolvedPath,
        device: Number(stat.dev),
        inode: Number(stat.ino),
        size: Number(stat.size),
        mtimeMs: Number(stat.mtimeMs),
        ctimeMs: Number(stat.ctimeMs),
      };
    } catch { executable = { path: resolvedPath, missing: true }; }
  }
  return { command, resolvedPath, version, executable };
}

function defaultAudioToolchainIdentity() {
  if (defaultAudioToolchainCache) return defaultAudioToolchainCache;
  const tools = {
    ffprobe: decoderCommandIdentity("ffprobe"),
    ffmpeg: decoderCommandIdentity("ffmpeg"),
  };
  defaultAudioToolchainCache = {
    schemaVersion: "hapa.render-audio-decoder-toolchain.v1",
    tools,
    sha256: `sha256:${crypto.createHash("sha256").update(JSON.stringify(tools)).digest("hex")}`,
  };
  return defaultAudioToolchainCache;
}

function safeMessage(error) {
  return text(error?.stderr || error?.message || error || "Unknown audio decoder error")
    .replace(/\s+/gu, " ")
    .slice(0, 800);
}

function isAbort(error, signal) {
  return signal?.aborted === true
    || error?.name === "AbortError"
    || error?.code === "ABORT_ERR";
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function rationalSeconds(value) {
  const match = text(value).match(/^(-?\d+)\/(\d+)$/u);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? numerator / denominator
    : null;
}

function streamDuration(stream = {}) {
  const direct = positiveNumber(stream.duration);
  if (direct) return { seconds: direct, source: "stream.duration" };
  const ticks = positiveNumber(stream.duration_ts);
  const timeBase = rationalSeconds(stream.time_base);
  const calculated = ticks && timeBase ? positiveNumber(ticks * timeBase) : null;
  return calculated
    ? { seconds: calculated, source: "stream.duration_ts*time_base" }
    : { seconds: null, source: null };
}

function detectedSilenceSpans(source = "", durationSeconds = 0) {
  const events = [...String(source).matchAll(/silence_(start|duration|end):\s*([\d.]+)/gu)]
    .map((match) => ({ kind: match[1], value: Number(match[2]), index: match.index }))
    .filter((event) => Number.isFinite(event.value))
    .sort((left, right) => left.index - right.index);
  const spans = [];
  let open = null;
  for (const event of events) {
    if (event.kind === "start") {
      if (open) spans.push({ startSeconds: open.startSeconds, endSeconds: event.value, durationSeconds: Math.max(0, event.value - open.startSeconds) });
      open = { startSeconds: event.value, declaredDurationSeconds: null };
    } else if (event.kind === "duration" && open) open.declaredDurationSeconds = event.value;
    else if (event.kind === "end" && open) {
      spans.push({
        startSeconds: open.startSeconds,
        endSeconds: event.value,
        durationSeconds: Number.isFinite(open.declaredDurationSeconds) ? open.declaredDurationSeconds : Math.max(0, event.value - open.startSeconds),
      });
      open = null;
    }
  }
  if (open && Number(durationSeconds) > open.startSeconds) {
    spans.push({ startSeconds: open.startSeconds, endSeconds: Number(durationSeconds), durationSeconds: Number(durationSeconds) - open.startSeconds });
  }
  return spans;
}

function mergedSpanDuration(spans = []) {
  const rows = spans
    .map((span) => ({ start: Number(span.startSeconds), end: Number(span.endSeconds) }))
    .filter((span) => Number.isFinite(span.start) && Number.isFinite(span.end) && span.end > span.start)
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let open = null;
  for (const row of rows) {
    if (!open) open = { ...row };
    else if (row.start <= open.end) open.end = Math.max(open.end, row.end);
    else {
      total += open.end - open.start;
      open = { ...row };
    }
  }
  if (open) total += open.end - open.start;
  return total;
}

function parseVolumeEvidence(stderr = "", durationSeconds = 0) {
  const source = String(stderr || "");
  const value = (name) => {
    const match = source.match(new RegExp(`${name}:\\s*(-?inf|-?[0-9.]+)\\s*dB`, "iu"));
    if (!match) return null;
    return /^-?inf$/iu.test(match[1]) ? Number.NEGATIVE_INFINITY : Number(match[1]);
  };
  const meanVolumeDb = value("mean_volume");
  const maxVolumeDb = value("max_volume");
  const duration = positiveNumber(durationSeconds) || 0;
  const silenceSpans = detectedSilenceSpans(source, duration);
  const silentSeconds = Math.min(duration, mergedSpanDuration(silenceSpans));
  const activeSeconds = Math.max(0, duration - silentSeconds);
  const activeRatio = duration > 0 ? activeSeconds / duration : 0;
  const minimumActiveSeconds = Math.min(duration, Math.max(1, duration * 0.1));
  return {
    measured: meanVolumeDb !== null && maxVolumeDb !== null,
    meanVolumeDb,
    maxVolumeDb,
    nonSilent: Number.isFinite(maxVolumeDb) && maxVolumeDb > -90,
    silenceThresholdDb: -90,
    activeCoverageMeasured: duration > 0,
    silenceDetectionThresholdDb: -60,
    silenceDetectionMinimumSeconds: 0.25,
    silenceSpans,
    silentSeconds,
    activeSeconds,
    activeRatio,
    minimumActiveSeconds,
    activeCoverageSufficient: duration > 0 && activeSeconds + 1e-6 >= minimumActiveSeconds,
  };
}

export function renderDurationToleranceSeconds(expectedDurationSeconds, {
  toleranceRatio = 0.0025,
  minimumToleranceSeconds = 0.15,
  maximumToleranceSeconds = 1,
} = {}) {
  const expected = positiveNumber(expectedDurationSeconds);
  if (!expected) return null;
  const ratio = Math.max(0, Number(toleranceRatio) || 0);
  const minimum = Math.max(0, Number(minimumToleranceSeconds) || 0);
  const maximumCandidate = Number(maximumToleranceSeconds);
  const maximum = Number.isFinite(maximumCandidate) && maximumCandidate >= 0
    ? Math.max(minimum, maximumCandidate)
    : Number.POSITIVE_INFINITY;
  return Math.min(maximum, Math.max(minimum, expected * ratio));
}

function statSignature(filePath, { root = process.cwd() } = {}) {
  const candidate = text(filePath);
  const resolvedPath = candidate
    ? (path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate))
    : "";
  if (!resolvedPath) {
    return { readable: false, resolvedPath: null, key: null, identity: null };
  }
  try {
    const stat = fs.statSync(resolvedPath);
    const identity = {
      path: resolvedPath,
      device: Number(stat.dev),
      inode: Number(stat.ino),
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
      ctimeMs: Number(stat.ctimeMs),
    };
    const key = [
      RENDER_AUDIO_INPUT_CACHE_SCHEMA,
      identity.path,
      identity.device,
      identity.inode,
      identity.size,
      identity.mtimeMs,
      identity.ctimeMs,
    ].join("\u0000");
    return {
      readable: stat.isFile() && stat.size > 0,
      resolvedPath,
      key,
      identity,
    };
  } catch {
    return { readable: false, resolvedPath, key: null, identity: null };
  }
}

async function defaultRunCommand(command, args, options = {}) {
  return execFile(command, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}

async function sha256File(filePath) {
  const digest = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) digest.update(chunk);
  return `sha256:${digest.digest("hex")}`;
}

function isPersistableAudioEvidence(evidence) {
  const toolchain = defaultAudioToolchainIdentity();
  return evidence?.schemaVersion === RENDER_AUDIO_INPUT_EVIDENCE_SCHEMA
    && evidence?.ok === true
    && evidence?.producer?.id === TRUSTED_AUDIO_PRODUCER
    && evidence?.producer?.toolchainSha256 === toolchain.sha256
    && evidence?.decode?.fullAudioDecode === true
    && evidence?.decode?.xerror === true
    && evidence?.decode?.nostdin === true
    && evidence?.audio?.signal?.measured === true
    && evidence?.audio?.signal?.activeCoverageMeasured === true
    && /^sha256:[a-f0-9]{64}$/iu.test(text(evidence?.contentSha256))
    && evidence?.tools?.ffprobe === "ffprobe"
    && evidence?.tools?.ffmpeg === "ffmpeg"
    && list(evidence?.checks).includes("full-audio-decode-xerror")
    && list(evidence?.checks).includes("stable-stat-identity")
    && list(evidence?.checks).includes("full-file-content-sha256")
    && evidence?.statIdentity
    && evidence.statIdentity.path === evidence.path;
}

function failure(code, message, file, extra = {}) {
  return {
    schemaVersion: RENDER_AUDIO_INPUT_EVIDENCE_SCHEMA,
    ok: false,
    code,
    path: file?.resolvedPath || null,
    message,
    ...extra,
  };
}

async function inspectAndDecodeAudio(file, {
  ffprobePath = "ffprobe",
  ffmpegPath = "ffmpeg",
  runCommand = defaultRunCommand,
  signal,
  probeTimeoutMs = 30_000,
  decodeTimeoutMs = 10 * 60_000,
} = {}) {
  if (!file.readable || !file.key || !file.identity) {
    return failure(
      "audio-input-file-unreadable",
      "The audio input is missing, empty, or unreadable.",
      file,
    );
  }

  let payload;
  try {
    const { stdout } = await runCommand(ffprobePath, [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=index,codec_type,codec_name,sample_rate,channels,channel_layout,start_time,duration,duration_ts,time_base:format=duration",
      "-of", "json",
      file.resolvedPath,
    ], {
      encoding: "utf8",
      timeout: probeTimeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      signal,
    });
    payload = JSON.parse(stdout || "{}");
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return failure(
      error?.code === "ETIMEDOUT" ? "audio-input-probe-timeout" : "audio-input-probe-failed",
      safeMessage(error),
      file,
    );
  }

  const stream = list(payload?.streams)[0] || null;
  const codec = text(stream?.codec_name);
  const sampleRate = positiveNumber(stream?.sample_rate);
  const channels = positiveNumber(stream?.channels);
  if (!stream || text(stream.codec_type) !== "audio" || !codec || !sampleRate || !channels) {
    return failure(
      "audio-input-stream-metadata-invalid",
      "The file does not expose a usable audio stream, codec, sample rate, and channel count.",
      file,
      {
        audio: {
          codec: codec || null,
          sampleRate,
          channels,
        },
      },
    );
  }

  const independentDuration = streamDuration(stream);
  const containerDurationSeconds = positiveNumber(payload?.format?.duration);
  if (!independentDuration.seconds) {
    return failure(
      "audio-input-stream-duration-unavailable",
      "The audio stream has no independent positive duration, so it cannot be checked against the show timeline.",
      file,
      {
        audio: {
          codec,
          sampleRate,
          channels,
          streamDurationSeconds: null,
          containerDurationSeconds,
        },
      },
    );
  }

  try {
    const decoded = await runCommand(ffmpegPath, [
      "-hide_banner", "-nostdin", "-nostats", "-v", "info", "-xerror",
      "-i", file.resolvedPath,
      "-map", "0:a:0",
      "-vn", "-sn", "-dn",
      "-af", "silencedetect=n=-60dB:d=0.25,volumedetect",
      "-f", "null", "-",
    ], {
      encoding: "utf8",
      timeout: decodeTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      signal,
    });
    const signalEvidence = parseVolumeEvidence(decoded?.stderr, independentDuration.seconds);
    if (!signalEvidence.measured) {
      return failure(
        "audio-input-signal-stats-missing",
        "The full decoder did not produce deterministic audio-level evidence.",
        file,
        { audio: { codec, sampleRate, channels, streamDurationSeconds: independentDuration.seconds, containerDurationSeconds }, signal: signalEvidence },
      );
    }
    file.signalEvidence = signalEvidence;
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return failure(
      error?.code === "ETIMEDOUT" ? "audio-input-full-decode-timeout" : "audio-input-full-decode-failed",
      safeMessage(error),
      file,
      {
        audio: {
          codec,
          sampleRate,
          channels,
          streamDurationSeconds: independentDuration.seconds,
          streamDurationSource: independentDuration.source,
          containerDurationSeconds,
        },
      },
    );
  }

  const current = statSignature(file.resolvedPath);
  if (current.key !== file.key) {
    return failure(
      "audio-input-changed-during-preflight",
      "The audio input changed while it was being decoded; retry against the stable file.",
      current,
      { initialStatIdentity: file.identity, currentStatIdentity: current.identity },
    );
  }

  let contentSha256;
  try {
    contentSha256 = await sha256File(file.resolvedPath);
  } catch (error) {
    return failure("audio-input-content-hash-failed", safeMessage(error), file);
  }
  const afterHash = statSignature(file.resolvedPath);
  if (afterHash.key !== file.key) {
    return failure(
      "audio-input-changed-during-preflight",
      "The audio input changed while its content proof was being created; retry against the stable file.",
      afterHash,
      { initialStatIdentity: file.identity, currentStatIdentity: afterHash.identity },
    );
  }

  return {
    schemaVersion: RENDER_AUDIO_INPUT_EVIDENCE_SCHEMA,
    ok: true,
    code: "audio-input-fully-decoded",
    path: file.resolvedPath,
    statIdentity: file.identity,
    contentSha256,
    audio: {
      streamIndex: Number.isFinite(Number(stream.index)) ? Number(stream.index) : null,
      codec,
      sampleRate,
      channels,
      channelLayout: text(stream.channel_layout) || null,
      startTimeSeconds: Number.isFinite(Number(stream.start_time)) ? Number(stream.start_time) : null,
      streamDurationSeconds: independentDuration.seconds,
      streamDurationSource: independentDuration.source,
      containerDurationSeconds,
      signal: file.signalEvidence,
    },
    decode: {
      decoder: "ffmpeg-null-audio",
      fullAudioDecode: true,
      xerror: true,
      nostdin: true,
    },
    checks: [
      "nonempty-file-stat",
      "audio-stream-metadata",
      "independent-stream-duration",
      "full-audio-decode-xerror",
      "full-stream-signal-scan",
      "stable-stat-identity",
      "full-file-content-sha256",
    ],
    tools: {
      ffprobe: text(ffprobePath),
      ffmpeg: text(ffmpegPath),
    },
  };
}

export function validateAudioInputDuration(evidence = {}, expectedDurationSeconds, {
  toleranceRatio = 0.0025,
  minimumToleranceSeconds = 0.15,
  maximumToleranceSeconds = 1,
  startTimeToleranceSeconds = 0.1,
} = {}) {
  if (evidence?.ok !== true) return structuredClone(evidence);
  const expected = positiveNumber(expectedDurationSeconds);
  if (!expected) {
    return {
      ...structuredClone(evidence),
      ok: false,
      code: "audio-input-expected-duration-missing",
      message: "A positive show duration is required to certify this audio input.",
      durationValidation: {
        expectedDurationSeconds: null,
        streamDurationSeconds: evidence?.audio?.streamDurationSeconds ?? null,
      },
    };
  }
  const streamSeconds = positiveNumber(evidence?.audio?.streamDurationSeconds);
  if (!streamSeconds) {
    return {
      ...structuredClone(evidence),
      ok: false,
      code: "audio-input-stream-duration-unavailable",
      message: "The independently measured audio-stream duration is unavailable.",
    };
  }
  const ratio = Math.max(0, Number(toleranceRatio) || 0);
  const minimum = Math.max(0, Number(minimumToleranceSeconds) || 0);
  const toleranceSeconds = renderDurationToleranceSeconds(expected, {
    toleranceRatio: ratio,
    minimumToleranceSeconds: minimum,
    maximumToleranceSeconds,
  });
  const driftSeconds = Math.abs(streamSeconds - expected);
  const startTimeSeconds = Number(evidence?.audio?.startTimeSeconds);
  const startTolerance = Math.max(0, Number(startTimeToleranceSeconds) || 0);
  const durationValidation = {
    basis: "audio-stream-not-container",
    expectedDurationSeconds: expected,
    streamDurationSeconds: streamSeconds,
    containerDurationSeconds: positiveNumber(evidence?.audio?.containerDurationSeconds),
    driftSeconds,
    toleranceSeconds,
    toleranceRatio: ratio,
    maximumToleranceSeconds: Number.isFinite(Number(maximumToleranceSeconds))
      ? Number(maximumToleranceSeconds)
      : null,
    startTimeSeconds: Number.isFinite(startTimeSeconds) ? startTimeSeconds : null,
    startTimeToleranceSeconds: startTolerance,
  };
  if (!Number.isFinite(startTimeSeconds) || Math.abs(startTimeSeconds) > startTolerance) {
    return {
      ...structuredClone(evidence),
      ok: false,
      code: "audio-input-start-time-mismatch",
      message: Number.isFinite(startTimeSeconds)
        ? `Audio stream starts at ${startTimeSeconds.toFixed(3)}s instead of the show origin.`
        : "Audio stream start time is unavailable, so synchronization to the show origin cannot be certified.",
      durationValidation,
    };
  }
  if (driftSeconds > toleranceSeconds) {
    return {
      ...structuredClone(evidence),
      ok: false,
      code: "audio-input-duration-mismatch",
      message: `Audio stream duration ${streamSeconds.toFixed(3)}s does not match the ${expected.toFixed(3)}s show within ${toleranceSeconds.toFixed(3)}s.`,
      durationValidation,
    };
  }
  return {
    ...structuredClone(evidence),
    code: "audio-input-render-ready",
    durationValidation,
  };
}

function normalizedActivityWindows(windows = []) {
  const unique = new Map();
  for (const window of list(windows)) {
    const startSeconds = Number(window?.startSeconds);
    const endSeconds = Number(window?.endSeconds);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) continue;
    const normalized = {
      cueId: text(window?.cueId) || null,
      startSeconds,
      endSeconds,
      signals: [...new Set(list(window?.signals).map((signal) => text(signal).toLowerCase()).filter(Boolean))].sort(),
      bindingSources: [...new Set(list(window?.bindingSources).map(text).filter(Boolean))].sort(),
      activityClass: window?.activityClass === "event" ? "event" : "continuous",
    };
    const key = `${normalized.cueId || ""}\u0000${startSeconds}\u0000${endSeconds}`;
    if (!unique.has(key)) unique.set(key, normalized);
    else {
      const current = unique.get(key);
      current.signals = [...new Set([...current.signals, ...normalized.signals])].sort();
      current.bindingSources = [...new Set([...current.bindingSources, ...normalized.bindingSources])].sort();
      // Any continuous/spectral consumer makes the shared role/window
      // continuous. Event mode is reserved for truly event-only bindings.
      current.activityClass = current.activityClass === "event" && normalized.activityClass === "event"
        ? "event"
        : "continuous";
    }
  }
  return [...unique.values()].sort((left, right) => (
    left.startSeconds - right.startSeconds
    || left.endSeconds - right.endSeconds
    || String(left.cueId).localeCompare(String(right.cueId))
  ));
}

function overlapSeconds(leftStart, leftEnd, rightStart, rightEnd) {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

function activityWindowEvidence(signal = {}, windows = []) {
  return normalizedActivityWindows(windows).map((window) => {
    const durationSeconds = window.endSeconds - window.startSeconds;
    const silentSeconds = Math.min(durationSeconds, list(signal?.silenceSpans).reduce((sum, span) => (
      sum + overlapSeconds(window.startSeconds, window.endSeconds, Number(span?.startSeconds), Number(span?.endSeconds))
    ), 0));
    const activeSeconds = Math.max(0, durationSeconds - silentSeconds);
    const eventDriven = window.activityClass === "event";
    // Continuous controls need only enough absolute signal to prove that the
    // selected cue is not detached. Per-signal telemetry variance performs
    // the stronger reactivity check. Event-only controls are occupancy-agnostic:
    // one real transient may be the entire intended beat/onset contract.
    const minimumActiveSeconds = eventDriven
      ? 0
      : Math.min(durationSeconds, Math.max(0.05, Math.min(0.1, durationSeconds * 0.005)));
    return {
      ...window,
      durationSeconds,
      silentSeconds,
      activeSeconds,
      activeRatio: durationSeconds > 0 ? activeSeconds / durationSeconds : 0,
      minimumActiveSeconds,
      activityRule: eventDriven ? "event-present" : "sparse-continuous-floor",
      sufficient: eventDriven
        ? activeSeconds > 1e-6
        : activeSeconds + 1e-6 >= minimumActiveSeconds,
    };
  });
}

export function validateAudioInputSignalCoverage(evidence = {}, {
  allowSilent = false,
  activeCoverageRequired = true,
  activityWindows = [],
  activityReason = "",
} = {}) {
  if (evidence?.ok !== true) return structuredClone(evidence);
  const signal = evidence?.audio?.signal || {};
  if (signal.activeCoverageMeasured !== true) {
    return {
      ...structuredClone(evidence),
      ok: false,
      code: "audio-input-active-coverage-unmeasured",
      message: "The full-file silence scan did not produce active-audio coverage evidence.",
    };
  }
  if (activeCoverageRequired === false) {
    return {
      ...structuredClone(evidence),
      signalContract: {
        allowSilent: false,
        activeCoverageRequired: false,
        scope: "structural-only",
        reason: text(activityReason) || "unused-by-selected-cut",
        activityWindows: [],
      },
    };
  }
  if (allowSilent === true) {
    return {
      ...structuredClone(evidence),
      signalContract: {
        allowSilent: true,
        activeCoverageRequired: false,
        scope: normalizedActivityWindows(activityWindows).length ? "bound-cue-windows" : "full-input",
        reason: "explicit-allow-silent-contract",
        activityWindows: activityWindowEvidence(signal, activityWindows),
      },
    };
  }
  const boundedWindows = activityWindowEvidence(signal, activityWindows);
  if (boundedWindows.length) {
    const insufficient = boundedWindows.filter((window) => !window.sufficient);
    if (insufficient.length) {
      return {
        ...structuredClone(evidence),
        ok: false,
        code: "audio-input-bound-window-activity-insufficient",
        message: `${insufficient.length} requested cue window${insufficient.length === 1 ? " has" : "s have"} too little active audio to drive its visualizer binding.`,
        signalContract: {
          allowSilent: false,
          activeCoverageRequired: true,
          scope: "bound-cue-windows",
          activityWindows: boundedWindows,
          insufficientActivityWindows: insufficient,
        },
      };
    }
    return {
      ...structuredClone(evidence),
      signalContract: {
        allowSilent: false,
        activeCoverageRequired: true,
        scope: "bound-cue-windows",
        activityWindows: boundedWindows,
        insufficientActivityWindows: [],
      },
    };
  }
  if (signal.nonSilent !== true) {
    return {
      ...structuredClone(evidence),
      ok: false,
      code: "audio-input-silent",
      message: "The audio input fully decodes but contains no measurable signal above the silence threshold.",
      signalContract: { allowSilent: false, activeCoverageRequired: true, scope: "full-input" },
    };
  }
  if (signal.activeCoverageSufficient !== true) {
    return {
      ...structuredClone(evidence),
      ok: false,
      code: "audio-input-active-coverage-insufficient",
      message: `The audio contains only ${Number(signal.activeSeconds || 0).toFixed(3)}s of active signal; at least ${Number(signal.minimumActiveSeconds || 0).toFixed(3)}s is required.`,
      signalContract: { allowSilent: false, activeCoverageRequired: true, scope: "full-input" },
    };
  }
  return {
    ...structuredClone(evidence),
    signalContract: { allowSilent: false, activeCoverageRequired: true, scope: "full-input" },
  };
}

export async function probeAndDecodeAudioInput(filePath, options = {}) {
  const file = statSignature(filePath, { root: options.root });
  if (!file.readable || !file.key) {
    return failure(
      "audio-input-file-unreadable",
      "The audio input is missing, empty, or unreadable.",
      file,
    );
  }

  const invocationFailureCache = options.failureCache instanceof Map ? options.failureCache : null;
  const authoritativeProbe = (options.runCommand === undefined || options.runCommand === defaultRunCommand)
    && (options.ffprobePath === undefined || options.ffprobePath === "ffprobe")
    && (options.ffmpegPath === undefined || options.ffmpegPath === "ffmpeg");
  let evidence = (authoritativeProbe ? successfulEvidenceCache.get(file.key) : null) || invocationFailureCache?.get(file.key);
  let cacheHit = Boolean(evidence);
  let cacheOrigin = evidence
    ? evidence.ok === false ? "invocation-failure-cache" : (cacheOrigins.get(file.key) || "memory")
    : "none";
  if (!evidence) {
    // An AbortSignal belongs to one render job. Never let canceling that job
    // reject another candidate that happens to verify the same audio file.
    const shareInFlight = authoritativeProbe && !options.signal;
    let pending = shareInFlight ? inFlightEvidence.get(file.key) : null;
    if (pending) {
      cacheHit = true;
      cacheOrigin = "in-flight";
    } else {
      pending = inspectAndDecodeAudio(file, options);
      if (shareInFlight) inFlightEvidence.set(file.key, pending);
    }
    try {
      evidence = await pending;
    } finally {
      if (shareInFlight && inFlightEvidence.get(file.key) === pending) inFlightEvidence.delete(file.key);
    }
    if (evidence?.ok === true && authoritativeProbe) {
      const toolchain = defaultAudioToolchainIdentity();
      evidence = {
        ...evidence,
        producer: {
          id: TRUSTED_AUDIO_PRODUCER,
          authoritative: true,
          toolchainSchemaVersion: toolchain.schemaVersion,
          toolchainSha256: toolchain.sha256,
        },
      };
    }
    if (authoritativeProbe && isPersistableAudioEvidence(evidence)) {
      successfulEvidenceCache.set(file.key, structuredClone(evidence));
      if (cacheOrigin === "none") cacheOrigins.set(file.key, "verified-this-process");
    } else if (evidence?.ok === false && invocationFailureCache && INVOCATION_CACHEABLE_FAILURES.has(evidence.code)) {
      // Deterministic failures are reusable only inside this explicitly-owned
      // sweep. A user retry gets a fresh Map and therefore a fresh decode.
      invocationFailureCache.set(file.key, structuredClone(evidence));
    }
  }

  const signalValidated = validateAudioInputSignalCoverage(evidence, options);
  const result = options.expectedDurationSeconds === undefined
    ? signalValidated
    : validateAudioInputDuration(signalValidated, options.expectedDurationSeconds, options);
  return {
    ...result,
    cache: {
      hit: cacheHit,
      origin: cacheOrigin === "none" ? "verified-this-process" : cacheOrigin,
      statIdentityKey: file.key,
    },
  };
}

function inputPath(input = {}) {
  return text(input.path || input.audioPath || input.filePath);
}

function normalizedRole(value, fallback = "audio") {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || fallback;
}

async function mapLimit(rows, concurrency, work) {
  const results = new Array(rows.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await work(rows[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), rows.length) }, worker));
  return results;
}

function boundActivityWindowsByRole(bindings = []) {
  const windowsByRole = new Map();
  for (const binding of list(bindings)) {
    const stemRole = normalizeHyperFramesStemRole(binding?.stemRole);
    const startSeconds = Number(binding?.startSeconds);
    const endSeconds = Number(binding?.endSeconds);
    if (!stemRole || stemRole === "master" || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) continue;
    if (!windowsByRole.has(stemRole)) windowsByRole.set(stemRole, []);
    windowsByRole.get(stemRole).push({
      cueId: text(binding?.cueId) || null,
      startSeconds,
      endSeconds,
      signals: [text(binding?.signal).toLowerCase()].filter(Boolean),
      bindingSources: [text(binding?.source)].filter(Boolean),
      activityClass: binding?.activityClass === "event" ? "event" : "continuous",
    });
  }
  return new Map([...windowsByRole.entries()].map(([stemRole, windows]) => [stemRole, normalizedActivityWindows(windows)]));
}

export function renderAudioInputsFromShowGraph({ masterPath = "", showGraph = {}, stemTelemetryBindings = [] } = {}) {
  const activityWindowsByRole = boundActivityWindowsByRole(stemTelemetryBindings);
  const inputs = [{
    id: "master",
    role: "master",
    kind: "master",
    path: masterPath,
    activeCoverageRequired: true,
    activityReason: "authoritative-playback-master",
    activityWindows: [],
  }];
  const ignoredInputs = [];
  for (const [index, stem] of list(showGraph?.stems?.items).entries()) {
    const role = normalizedRole(stem?.stemType || stem?.role || stem?.title || stem?.id, `stem-${index + 1}`);
    const canonicalRole = normalizeHyperFramesStemRole(stem?.stemType || stem?.role || stem?.title || stem?.id);
    const activityWindows = activityWindowsByRole.get(canonicalRole) || [];
    const audioPath = inputPath(stem);
    if (!audioPath && ["archive-zip", "stem-archive", "stems-archive"].includes(role)) {
      ignoredInputs.push({
        id: text(stem?.id) || `stem-${index + 1}`,
        role,
        reason: "non-audio-archive-lineage",
      });
      continue;
    }
    inputs.push({
      id: text(stem?.id) || `stem-${index + 1}`,
      role,
      kind: "stem",
      path: audioPath,
      allowSharedSource: stem?.allowSharedSource === true
        || stem?.allow_shared_source === true
        || stem?.signalContract?.allowSharedSource === true,
      sharedSourceGroup: text(stem?.sharedSourceGroup || stem?.shared_source_group || stem?.signalContract?.sharedSourceGroup),
      allowSilent: stem?.allowSilent === true
        || stem?.allow_silent === true
        || stem?.signalContract?.allowSilent === true
        || stem?.signalContract?.allow_silent === true,
      activeCoverageRequired: activityWindows.length > 0,
      activityReason: activityWindows.length > 0 ? "bound-by-selected-cut" : "unused-by-selected-cut",
      activityWindows,
    });
  }
  return { inputs, ignoredInputs };
}

export async function preflightRenderAudioInputs({
  inputs = [],
  expectedDurationSeconds,
  ignoredInputs = [],
} = {}, {
  concurrency = 2,
  ...probeOptions
} = {}) {
  const declared = list(inputs).map((input, index) => ({
    id: text(input?.id) || `audio-${index + 1}`,
    role: text(input?.role) || text(input?.kind) || "audio",
    kind: text(input?.kind) || "audio",
    path: inputPath(input),
    expectedDurationSeconds: input?.expectedDurationSeconds ?? expectedDurationSeconds,
    allowSharedSource: input?.allowSharedSource === true,
    sharedSourceGroup: text(input?.sharedSourceGroup),
    allowSilent: input?.allowSilent === true,
    activeCoverageRequired: input?.activeCoverageRequired !== false,
    activityReason: text(input?.activityReason),
    activityWindows: normalizedActivityWindows(input?.activityWindows),
  }));
  const entries = declared.length
    ? await mapLimit(declared, concurrency, async (input) => ({
      ...input,
      ...(await probeAndDecodeAudioInput(input.path, {
        ...probeOptions,
        expectedDurationSeconds: input.expectedDurationSeconds ?? null,
        allowSilent: input.allowSilent,
        activeCoverageRequired: input.activeCoverageRequired,
        activityReason: input.activityReason,
        activityWindows: input.activityWindows,
      })),
    }))
    : [{
      schemaVersion: RENDER_AUDIO_INPUT_EVIDENCE_SCHEMA,
      ok: false,
      code: "audio-input-set-empty",
      id: "audio-inputs",
      role: "audio",
      kind: "audio",
      path: null,
      message: "No master or stem audio inputs were supplied for render preflight.",
    }];
  const failures = entries.filter((entry) => entry.ok !== true);
  const byIdentity = new Map();
  for (const entry of entries.filter((entry) => entry.ok === true)) {
    const identities = [
      ["stat", text(entry?.cache?.statIdentityKey)],
      ["content", text(entry?.contentSha256)],
    ];
    for (const [kind, identity] of identities) {
      if (!identity) continue;
      const key = `${kind}:${identity}`;
      if (!byIdentity.has(key)) byIdentity.set(key, []);
      byIdentity.get(key).push(entry);
    }
  }
  const sharedSourceFailures = [];
  const failedRoleSets = new Set();
  for (const [identity, aliases] of byIdentity.entries()) {
    const distinctRoles = [...new Set(aliases.map((entry) => normalizedRole(entry.role)))];
    if (distinctRoles.length < 2) continue;
    const groups = [...new Set(aliases.map((entry) => text(entry.sharedSourceGroup)).filter(Boolean))];
    const explicitlyShared = aliases.every((entry) => entry.allowSharedSource === true)
      && groups.length === 1
      && aliases.every((entry) => text(entry.sharedSourceGroup) === groups[0]);
    if (explicitlyShared) continue;
    const roleSetKey = distinctRoles.slice().sort().join("\u0000");
    if (failedRoleSets.has(roleSetKey)) continue;
    failedRoleSets.add(roleSetKey);
    sharedSourceFailures.push({
      schemaVersion: RENDER_AUDIO_INPUT_EVIDENCE_SCHEMA,
      ok: false,
      code: "audio-input-distinct-stems-share-source",
      message: `Distinct audio roles (${distinctRoles.join(", ")}) resolve to the same file without an explicit shared-source contract.`,
      path: aliases[0].path,
      kind: "stem-wiring",
      role: distinctRoles.join(","),
      roles: distinctRoles,
      inputIds: aliases.map((entry) => entry.id),
      sourceIdentity: identity,
    });
  }
  failures.push(...sharedSourceFailures);
  const uniqueKeys = new Set(entries.map((entry) => entry?.cache?.statIdentityKey || entry.path || `${entry.id}:${entry.role}`));
  const verifiedKeys = new Set(entries.filter((entry) => entry.ok === true).map((entry) => entry?.cache?.statIdentityKey || entry.path));
  return {
    schemaVersion: RENDER_AUDIO_INPUT_PREFLIGHT_SCHEMA,
    ok: failures.length === 0,
    expectedDurationSeconds: positiveNumber(expectedDurationSeconds),
    declaredInputCount: declared.length,
    uniqueInputCount: uniqueKeys.size,
    verifiedInputCount: entries.filter((entry) => entry.ok === true).length,
    verifiedUniqueInputCount: verifiedKeys.size,
    blockedInputCount: failures.length,
    ignoredInputCount: list(ignoredInputs).length,
    ignoredInputs: structuredClone(list(ignoredInputs)),
    entries,
    failures,
    sharedSourceFailureCount: sharedSourceFailures.length,
  };
}

export function clearRenderAudioInputPreflightCache() {
  successfulEvidenceCache.clear();
  inFlightEvidence.clear();
  cacheOrigins.clear();
}

export function loadRenderAudioInputPreflightCache(filePath) {
  const resolvedCachePath = path.resolve(filePath);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(resolvedCachePath, "utf8"));
  } catch {
    return { loaded: 0, rejected: 0, path: resolvedCachePath };
  }
  if (payload?.schemaVersion !== RENDER_AUDIO_INPUT_CACHE_SCHEMA || !Array.isArray(payload.entries)) {
    return { loaded: 0, rejected: list(payload?.entries).length, path: resolvedCachePath };
  }
  let loaded = 0;
  let rejected = 0;
  for (const row of payload.entries) {
    const evidence = row?.evidence;
    const current = statSignature(evidence?.path);
    if (
      !text(row?.key)
      || !isPersistableAudioEvidence(evidence)
      || JSON.stringify(current.identity) !== JSON.stringify(evidence.statIdentity)
      || current.key !== row.key
    ) {
      rejected += 1;
      continue;
    }
    successfulEvidenceCache.set(row.key, structuredClone(evidence));
    cacheOrigins.set(row.key, "persistent-cache");
    loaded += 1;
  }
  return { loaded, rejected, path: resolvedCachePath };
}

export function writeRenderAudioInputPreflightCache(filePath) {
  const entries = [];
  for (const [key, evidence] of successfulEvidenceCache.entries()) {
    const current = statSignature(evidence?.path);
    if (
      !isPersistableAudioEvidence(evidence)
      || JSON.stringify(current.identity) !== JSON.stringify(evidence.statIdentity)
      || current.key !== key
    ) continue;
    entries.push({ key, evidence: structuredClone(evidence) });
  }
  entries.sort((left, right) => left.key.localeCompare(right.key));
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const temporary = `${resolvedPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({
      schemaVersion: RENDER_AUDIO_INPUT_CACHE_SCHEMA,
      updatedAt: new Date().toISOString(),
      entries,
    }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, resolvedPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { written: entries.length, path: resolvedPath };
}
