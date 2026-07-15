import { execFile as execFileCallback, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const IMAGE_PATTERN = /\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?)(?:$|[?#])/iu;
const CACHE_SCHEMA = "hapa.render-visual-media-probe-cache.v8";
const EVIDENCE_SCHEMA = "hapa.render-visual-media-probe-evidence.v8";
const DEFAULT_VIDEO_SAMPLING_POLICY = "boundary-midpoint-v1";
const BLACK_LUMA_MAX = 24;
const OPENING_FADE_POLICY = "verified-brief-black-opening-v1";
const OPENING_BLACK_SCAN_MIN_SECONDS = 0.04;
const OPENING_BLACK_FADE_MAX_SECONDS = 0.25;
const PROGRESS_SCHEMA = "hapa.render-visual-media-probe-progress.v1";
const PROGRESS_STAGES = Object.freeze(["start", "metadata", "full-decode", "pixel-samples", "complete"]);
const probeCache = new Map();
const probeInFlight = new Map();
let visualDecoderToolchainCache = null;
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
    } catch { /* Continue through PATH. */ }
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
  } catch { /* The real probe reports an unavailable decoder. */ }
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

function visualDecoderToolchainIdentity() {
  if (visualDecoderToolchainCache) return visualDecoderToolchainCache;
  const tools = {
    ffprobe: decoderCommandIdentity("ffprobe"),
    ffmpeg: decoderCommandIdentity("ffmpeg"),
  };
  visualDecoderToolchainCache = {
    schemaVersion: "hapa.render-visual-decoder-toolchain.v1",
    tools,
    sha256: `sha256:${crypto.createHash("sha256").update(JSON.stringify(tools)).digest("hex")}`,
  };
  return visualDecoderToolchainCache;
}

const VIDEO_SAMPLING_POLICIES = Object.freeze({
  "boundary-midpoint-v1": (durationSeconds) => [
    0,
    durationSeconds / 2,
    Math.max(0, durationSeconds - Math.min(0.25, durationSeconds / 10)),
  ],
  "interior-three-v1": (durationSeconds) => [
    durationSeconds * 0.1,
    durationSeconds * 0.5,
    durationSeconds * 0.9,
  ],
});

function safeMessage(error) {
  return text(error?.stderr || error?.message || error || "Unknown decoder error").replace(/\s+/gu, " ").slice(0, 500);
}

function normalizedSamplingPolicies(value) {
  const values = list(value).length ? list(value) : [value];
  const normalized = [...new Set(values.map(text).filter(Boolean))].sort();
  return normalized.length ? normalized : [DEFAULT_VIDEO_SAMPLING_POLICY];
}

function readFileIdentity(resolvedPath) {
  try {
    const stat = fs.statSync(resolvedPath);
    return {
      dev: String(stat.dev),
      ino: String(stat.ino),
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
      ctimeMs: Number(stat.ctimeMs),
      readable: stat.isFile() && stat.size > 0,
    };
  } catch {
    return { dev: null, ino: null, size: null, mtimeMs: null, ctimeMs: null, readable: false };
  }
}

function sameFileIdentity(left, right) {
  return Boolean(left && right)
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
    && left.readable === right.readable;
}

function signature(filePath, kind, { allowBlank = false, samplingPolicies = [] } = {}) {
  const resolvedPath = path.resolve(filePath);
  const identity = readFileIdentity(resolvedPath);
  const contract = JSON.stringify({
    allowBlank: allowBlank === true,
    samplingPolicies: kind === "video" ? normalizedSamplingPolicies(samplingPolicies) : [],
  });
  const identityKey = identity.readable ? JSON.stringify({
    dev: identity.dev,
    ino: identity.ino,
    size: identity.size,
    mtimeMs: identity.mtimeMs,
    ctimeMs: identity.ctimeMs,
  }) : "missing";
  return {
    resolvedPath,
    key: `${kind}:${resolvedPath}:${identityKey}:${contract}:${visualDecoderToolchainIdentity().sha256}`,
    readable: identity.readable,
    identity,
  };
}

function parseSignalStats(stdout = "") {
  const values = Object.fromEntries([...String(stdout).matchAll(/lavfi\.signalstats\.([A-Z]+)=(-?[0-9.]+)/gu)]
    .map((match) => [match[1], Number(match[2])]));
  const ranges = [values.YMAX - values.YMIN, values.UMAX - values.UMIN, values.VMAX - values.VMIN].filter(Number.isFinite);
  return {
    present: Number.isFinite(values.YMIN) && Number.isFinite(values.YMAX),
    nonFlat: ranges.some((value) => value >= 2),
    lumaMin: Number.isFinite(values.YMIN) ? values.YMIN : null,
    lumaMax: Number.isFinite(values.YMAX) ? values.YMAX : null,
    maximumRange: ranges.length ? Math.max(...ranges) : null,
  };
}

function throwIfAborted(signal, error = null) {
  if (signal?.aborted) signal.throwIfAborted();
  if (error?.name === "AbortError" || error?.code === "ABORT_ERR") throw error;
}

function emitProgress(onProgress, stage, file, declaredKind, details = {}) {
  if (typeof onProgress !== "function") return;
  const stageIndex = PROGRESS_STAGES.indexOf(stage);
  if (stageIndex < 0) return;
  try {
    const pending = onProgress({
      schemaVersion: PROGRESS_SCHEMA,
      stage,
      stageIndex,
      stageCount: PROGRESS_STAGES.length,
      path: file.resolvedPath,
      kind: declaredKind,
      ...details,
    });
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {
    // Progress reporting must never change the render-readiness result.
  }
}

async function run(command, args, timeout = 30_000, { signal } = {}) {
  throwIfAborted(signal);
  return execFile(command, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    ...(signal ? { signal } : {}),
  });
}

function hasAlphaChannel(pixelFormat = "") {
  return /(?:^yuva|rgba|argb|bgra|abgr|gbrap|graya|^ya\d)/iu.test(text(pixelFormat));
}

function roundedSampleTime(value, durationSeconds) {
  const bounded = Math.max(0, Math.min(Number(durationSeconds || 0), Number(value || 0)));
  return Math.round(bounded * 1000) / 1000;
}

function policySampleTimes(policyId, durationSeconds) {
  const factory = VIDEO_SAMPLING_POLICIES[policyId];
  if (!factory) return null;
  return [...new Set(factory(durationSeconds).map((value) => roundedSampleTime(value, durationSeconds)))];
}

function positiveFrameRate(value = "") {
  const normalized = text(value);
  const match = normalized.match(/^([\d.]+)\/([\d.]+)$/u);
  if (!match) {
    const numeric = Number(normalized);
    return numeric > 0 ? numeric : 0;
  }
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return numerator > 0 && denominator > 0 ? numerator / denominator : 0;
}

function animationCapableImage(filePath, codec = "") {
  return /\.(?:gif|webp|avif)(?:$|[?#])/iu.test(filePath)
    || /^(?:gif|webp|apng|av1)$/iu.test(text(codec));
}

function parseBlackIntervals(stderr = "") {
  return [...String(stderr).matchAll(/black_start:([\d.]+).*?black_end:([\d.]+).*?black_duration:([\d.]+)/gu)]
    .map((match) => ({
      startSeconds: Number(match[1]),
      endSeconds: Number(match[2]),
      durationSeconds: Number(match[3]),
    }))
    .filter((span) => Number.isFinite(span.startSeconds)
      && Number.isFinite(span.endSeconds)
      && Number.isFinite(span.durationSeconds));
}

function verifiedOpeningFadeReceipt(samples = [], blackIntervalScan = {}, frameRate = 0) {
  const blankSamples = samples.filter((sample) => !sample.visible);
  const firstSample = samples[0] || null;
  const laterSamples = samples.slice(1);
  const frameToleranceSeconds = frameRate > 0 ? Math.min(0.05, (1 / frameRate) + 0.005) : 0.05;
  const openingSpan = list(blackIntervalScan?.blackSpans)
    .filter((span) => Number(span.startSeconds) <= frameToleranceSeconds && Number(span.endSeconds) > 0)
    .sort((left, right) => Number(left.startSeconds) - Number(right.startSeconds) || Number(left.endSeconds) - Number(right.endSeconds))[0] || null;
  const accepted = blackIntervalScan?.complete === true
    && blankSamples.length === 1
    && firstSample === blankSamples[0]
    && Number(firstSample?.sampleTime) <= frameToleranceSeconds
    && firstSample?.present === true
    && firstSample?.black === true
    && laterSamples.length > 0
    && laterSamples.every((sample) => sample.visible === true)
    && openingSpan !== null
    && Number(openingSpan.durationSeconds) > 0
    && Number(openingSpan.durationSeconds) <= OPENING_BLACK_FADE_MAX_SECONDS
    && Number(openingSpan.endSeconds) <= OPENING_BLACK_FADE_MAX_SECONDS + frameToleranceSeconds;
  if (!accepted) return null;
  return {
    schemaVersion: "hapa.render-visual-opening-fade-receipt.v1",
    status: "accepted",
    policyId: OPENING_FADE_POLICY,
    maxDurationSeconds: OPENING_BLACK_FADE_MAX_SECONDS,
    scanMinimumSeconds: OPENING_BLACK_SCAN_MIN_SECONDS,
    frameToleranceSeconds,
    observed: {
      startSeconds: Number(openingSpan.startSeconds),
      endSeconds: Number(openingSpan.endSeconds),
      durationSeconds: Number(openingSpan.durationSeconds),
    },
    boundarySampleTime: Number(firstSample.sampleTime),
    laterVisibleSampleTimes: laterSamples.map((sample) => Number(sample.sampleTime)),
    evidence: ["full-file-blackdetect", "black-boundary-sample", "all-later-samples-visible"],
  };
}

function deterministicEvidence(file, {
  allowBlank = false,
  temporal = false,
  samplingPolicies = [],
  openingFade = null,
} = {}) {
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    deterministic: true,
    signatureKey: file.key,
    fullDecode: true,
    decodeScope: temporal ? "full-timeline" : "single-still-frame",
    temporalValidation: temporal === true,
    alphaAwareComposite: true,
    blackIntervalScan: temporal === true,
    allowBlankContract: allowBlank === true,
    samplingPolicies: list(samplingPolicies).length ? normalizedSamplingPolicies(samplingPolicies) : [],
    fileIdentity: structuredClone(file.identity),
    producer: {
      id: "hapa.render-visual-media.default-ffmpeg-full-decode.v2",
      toolchainSchemaVersion: visualDecoderToolchainIdentity().schemaVersion,
      toolchainSha256: visualDecoderToolchainIdentity().sha256,
    },
    visibilityTolerance: {
      schemaVersion: "hapa.render-visual-visibility-tolerance.v1",
      openingFade: openingFade ? structuredClone(openingFade) : {
        status: "not-applied",
        policyId: OPENING_FADE_POLICY,
        maxDurationSeconds: OPENING_BLACK_FADE_MAX_SECONDS,
      },
    },
  };
}

function isCompleteFileIdentity(identity) {
  return Boolean(text(identity?.dev)
    && text(identity?.ino)
    && Number.isFinite(identity?.size)
    && Number.isFinite(identity?.mtimeMs)
    && Number.isFinite(identity?.ctimeMs)
    && identity?.readable === true);
}

function isPersistableEvidence(result) {
  const temporal = result?.kind === "video";
  const toolchain = visualDecoderToolchainIdentity();
  return result?.ok === true
    && result?.evidence?.schemaVersion === EVIDENCE_SCHEMA
    && result?.evidence?.deterministic === true
    && result?.evidence?.fullDecode === true
    && result?.evidence?.decodeScope === (temporal ? "full-timeline" : "single-still-frame")
    && result?.evidence?.temporalValidation === temporal
    && result?.evidence?.alphaAwareComposite === true
    && result?.evidence?.blackIntervalScan === temporal
    && result?.evidence?.producer?.id === "hapa.render-visual-media.default-ffmpeg-full-decode.v2"
    && result?.evidence?.producer?.toolchainSha256 === toolchain.sha256
    && text(result?.evidence?.signatureKey)
    && isCompleteFileIdentity(result?.evidence?.fileIdentity);
}

async function samplePixelEvidence(filePath, {
  width,
  height,
  pixelFormat,
  sampleTime = null,
  includeColor = false,
  runCommand,
  signal,
} = {}) {
  throwIfAborted(signal);
  const seek = sampleTime === null ? [] : ["-ss", String(sampleTime)];
  const alphaExpected = hasAlphaChannel(pixelFormat);
  let colorPixels = null;
  if (includeColor) {
    const color = await runCommand("ffmpeg", [
      "-hide_banner", "-nostdin", "-v", "error", "-xerror",
      ...seek,
      "-i", filePath,
      "-vf", "setpts=PTS-STARTPTS,signalstats,metadata=print:file=-",
      "-frames:v", "1", "-f", "null", "-",
    ], 30_000, { signal });
    colorPixels = parseSignalStats(color.stdout);
  }
  let alphaPixels = null;
  if (alphaExpected) {
    const alpha = await runCommand("ffmpeg", [
      "-hide_banner", "-nostdin", "-v", "error", "-xerror",
      ...seek,
      "-i", filePath,
      "-vf", "setpts=PTS-STARTPTS,alphaextract,signalstats,metadata=print:file=-",
      "-frames:v", "1", "-f", "null", "-",
    ], 30_000, { signal });
    alphaPixels = parseSignalStats(alpha.stdout);
  }
  const composite = await runCommand("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror",
    ...seek,
    "-i", filePath,
    "-filter_complex", `color=c=gray:s=${width}x${height}:r=1:d=1[bg];[0:v]setpts=PTS-STARTPTS[fg];[bg][fg]overlay=shortest=1,signalstats,metadata=print:file=-`,
    "-frames:v", "1", "-f", "null", "-",
  ], 30_000, { signal });
  const compositePixels = parseSignalStats(composite.stdout);
  const alphaMeasured = !alphaExpected || alphaPixels?.present === true;
  const visibleAlpha = alphaMeasured && (!alphaExpected || Number(alphaPixels.lumaMax || 0) > 1);
  const black = compositePixels.present && Number(compositePixels.lumaMax || 0) <= BLACK_LUMA_MAX;
  const present = compositePixels.present && alphaMeasured;
  return {
    sampleTime,
    present,
    nonFlat: compositePixels.nonFlat,
    visibleAlpha,
    black,
    visible: present && compositePixels.nonFlat && visibleAlpha && !black,
    color: colorPixels,
    alpha: alphaPixels,
    composite: compositePixels,
  };
}

async function executeProbe(file, declaredKind, {
  allowBlank,
  samplingPolicies,
  runCommand,
  signal,
  onProgress,
} = {}) {
  throwIfAborted(signal);
  if (!file.readable) {
    return { ok: false, code: "visual-media-file-unreadable", path: file.resolvedPath, kind: declaredKind, message: "The visual media file is missing, empty, or unreadable." };
  }
  let metadata;
  try {
    emitProgress(onProgress, "metadata", file, declaredKind);
    const { stdout } = await runCommand("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,pix_fmt,width,height,duration,nb_frames,avg_frame_rate,r_frame_rate:format=duration",
      "-of", "json",
      file.resolvedPath,
    ], 30_000, { signal });
    metadata = JSON.parse(stdout || "{}");
  } catch (error) {
    throwIfAborted(signal, error);
    return { ok: false, code: "visual-media-probe-failed", path: file.resolvedPath, kind: declaredKind, message: safeMessage(error) };
  }
  const stream = list(metadata?.streams)[0] || null;
  const width = Number(stream?.width || 0);
  const height = Number(stream?.height || 0);
  const codec = text(stream?.codec_name);
  const pixelFormat = text(stream?.pix_fmt);
  const durationSeconds = Number(metadata?.format?.duration || stream?.duration || 0);
  const declaredFrameCount = Number(stream?.nb_frames || 0);
  const frameRateText = text(stream?.avg_frame_rate || stream?.r_frame_rate);
  if (!stream || !codec || !(width > 0) || !(height > 0) || (declaredKind === "video" && !(durationSeconds > 0))) {
    return {
      ok: false,
      code: "visual-media-metadata-invalid",
      path: file.resolvedPath,
      kind: declaredKind,
      message: "The file does not expose a usable visual stream, dimensions, or duration.",
      codec: codec || null,
      pixelFormat: pixelFormat || null,
      width,
      height,
      durationSeconds,
    };
  }
  const imageLike = declaredKind === "image" || declaredKind === "proxy";
  const timedImageMetadata = durationSeconds > 0 && positiveFrameRate(frameRateText) > 0;
  let observedFrameCount = declaredFrameCount;
  const shouldCountImageFrames = imageLike
    && !(observedFrameCount > 0)
    && (timedImageMetadata || animationCapableImage(file.resolvedPath, codec));
  if (shouldCountImageFrames) {
    try {
      const counted = await runCommand("ffprobe", [
        "-v", "error", "-count_frames",
        "-select_streams", "v:0",
        "-show_entries", "stream=nb_read_frames",
        "-of", "json",
        file.resolvedPath,
      ], 30_000, { signal });
      observedFrameCount = Number(JSON.parse(counted.stdout || "{}")?.streams?.[0]?.nb_read_frames || 0);
    } catch (error) {
      throwIfAborted(signal, error);
      return {
        ok: false,
        code: "visual-media-animation-status-unverified",
        path: file.resolvedPath,
        kind: declaredKind,
        message: `The image container may carry timed frames, but its complete frame count could not be verified: ${safeMessage(error)}`,
        codec,
        width,
        height,
        durationSeconds,
        declaredFrameCount,
        frameRate: frameRateText || null,
      };
    }
  }
  if (imageLike && observedFrameCount > 1) {
    return {
      ok: false,
      code: "visual-media-animated-image-requires-video-contract",
      path: file.resolvedPath,
      kind: declaredKind,
      message: "This animated image container has multiple timed frames and must be declared as video for full temporal validation.",
      codec,
      width,
      height,
      durationSeconds,
      declaredFrameCount,
      observedFrameCount,
      frameRate: frameRateText || null,
    };
  }
  if (imageLike && timedImageMetadata && !(observedFrameCount > 0)) {
    return {
      ok: false,
      code: "visual-media-animation-status-unverified",
      path: file.resolvedPath,
      kind: declaredKind,
      message: "The image container exposes a timed stream, but a complete frame count was unavailable. Declare it as video or replace it with a verified still image.",
      codec,
      width,
      height,
      durationSeconds,
      declaredFrameCount,
      observedFrameCount,
      frameRate: frameRateText || null,
    };
  }

  const common = {
    path: file.resolvedPath,
    kind: declaredKind,
    codec,
    pixelFormat: pixelFormat || null,
    width,
    height,
    durationSeconds,
    declaredFrameCount,
    observedFrameCount,
    allowBlank: allowBlank === true,
  };

  if (declaredKind === "video") {
    try {
      emitProgress(onProgress, "full-decode", file, declaredKind);
      const timeout = Math.max(60_000, Math.min(10 * 60_000, Math.ceil(durationSeconds * 2_000) + 30_000));
      const alphaIntervalScan = hasAlphaChannel(pixelFormat);
      const temporalFilter = alphaIntervalScan
        ? [
          "-filter_complex",
          `[0:v]split=2[content][alpha];[content]blackdetect=d=${OPENING_BLACK_SCAN_MIN_SECONDS}:pix_th=0.03[contentout];[alpha]alphaextract,blackdetect=d=${OPENING_BLACK_SCAN_MIN_SECONDS}:pix_th=0.03[alphaout]`,
          "-map", "[contentout]", "-map", "[alphaout]",
        ]
        : ["-vf", `blackdetect=d=${OPENING_BLACK_SCAN_MIN_SECONDS}:pix_th=0.03`];
      const fullDecode = await runCommand("ffmpeg", [
        "-hide_banner", "-nostdin", "-v", "info", "-xerror", "-err_detect", "explode",
        "-i", file.resolvedPath,
        ...(alphaIntervalScan ? [] : ["-map", "0:v:0"]), "-an", "-sn", "-dn",
        ...temporalFilter,
        "-f", "null", "-",
      ], timeout, { signal });
      const blackSpans = [...new Map(parseBlackIntervals(fullDecode?.stderr)
        .map((span) => [`${span.startSeconds}:${span.endSeconds}:${span.durationSeconds}`, span])).values()];
      const blackLimitSeconds = Math.max(2, durationSeconds * 0.15);
      const excessiveBlackSpans = blackSpans.filter((span) => span.durationSeconds >= blackLimitSeconds);
      if (excessiveBlackSpans.length && allowBlank !== true) {
        return {
          ok: false,
          code: "visual-media-prolonged-black-interval",
          ...common,
          message: `The fully decoded video contains ${excessiveBlackSpans.length} prolonged black interval${excessiveBlackSpans.length === 1 ? "" : "s"}.`,
          decodeScope: "full-file",
          blackLimitSeconds,
          alphaIntervalScan,
          blackSpans,
          excessiveBlackSpans,
        };
      }
      common.blackIntervalScan = {
        complete: true,
        blackLimitSeconds,
        alphaIntervalScan,
        blackSpans,
        excessiveBlackSpans,
        blankAllowed: excessiveBlackSpans.length > 0 && allowBlank === true,
      };
    } catch (error) {
      throwIfAborted(signal, error);
      return { ok: false, code: "visual-media-full-decode-failed", ...common, message: safeMessage(error), decodeScope: "full-file" };
    }
  }

  const policies = declaredKind === "video" ? normalizedSamplingPolicies(samplingPolicies) : [];
  const unsupportedPolicy = policies.find((policyId) => !VIDEO_SAMPLING_POLICIES[policyId]);
  if (unsupportedPolicy) {
    return {
      ok: false,
      code: "visual-media-sampling-policy-unsupported",
      ...common,
      message: `Unsupported video sampling policy: ${unsupportedPolicy}`,
      samplingPolicies: policies,
    };
  }

  try {
    emitProgress(onProgress, "pixel-samples", file, declaredKind);
    if (declaredKind === "proxy") {
      const pixels = await samplePixelEvidence(file.resolvedPath, { width, height, pixelFormat, includeColor: true, runCommand, signal });
      if (!pixels.present) {
        return { ok: false, code: "proxy-atlas-pixel-stats-missing", ...common, message: "The proxy atlas decoded without measurable alpha/composite pixel statistics.", pixels };
      }
      if (!pixels.visibleAlpha) {
        return { ok: false, code: "proxy-atlas-transparent", ...common, message: "The proxy atlas decodes, but every pixel is fully transparent.", pixels };
      }
      if (!pixels.nonFlat || pixels.black) {
        return {
          ok: false,
          code: "proxy-atlas-flat",
          ...common,
          message: "The proxy atlas decodes, but its composited pixels are blank or flat.",
          pixels,
        };
      }
      return {
        ok: true,
        code: "proxy-atlas-decoded",
        ...common,
        pixels,
        evidence: deterministicEvidence(file, { allowBlank: false, samplingPolicies: [] }),
      };
    }

    if (declaredKind === "image") {
      const pixels = await samplePixelEvidence(file.resolvedPath, { width, height, pixelFormat, runCommand, signal });
      if (!pixels.present) {
        return { ok: false, code: "visual-media-pixel-stats-missing", ...common, message: "The image decoded without measurable alpha/composite pixel statistics.", pixels };
      }
      if (!pixels.visible && allowBlank !== true) {
        const code = !pixels.visibleAlpha
          ? "visual-media-transparent"
          : pixels.black
            ? "visual-media-black"
            : "visual-media-flat";
        return { ok: false, code, ...common, message: "The image decodes, but it has no alpha-aware, non-flat visible pixels.", pixels };
      }
      return {
        ok: true,
        code: "image-sample-decoded",
        ...common,
        pixels,
        blankAllowed: !pixels.visible && allowBlank === true,
        evidence: deterministicEvidence(file, { allowBlank, samplingPolicies: [] }),
      };
    }

    const sampleEvidence = new Map();
    const sampleAt = async (sampleTime) => {
      const key = String(sampleTime);
      if (!sampleEvidence.has(key)) {
        sampleEvidence.set(key, samplePixelEvidence(file.resolvedPath, {
          width,
          height,
          pixelFormat,
          sampleTime,
          runCommand,
          signal,
        }));
      }
      return sampleEvidence.get(key);
    };
    const policyResults = [];
    for (const policyId of policies) {
      const sampleTimes = policySampleTimes(policyId, durationSeconds);
      const samples = await Promise.all(sampleTimes.map(sampleAt));
      const visibleSampleCount = samples.filter((sample) => sample.visible).length;
      const measurable = samples.every((sample) => sample.present);
      const blankSampleCount = samples.length - visibleSampleCount;
      const openingFade = allowBlank === true || blankSampleCount === 0
        ? null
        : verifiedOpeningFadeReceipt(samples, common.blackIntervalScan, positiveFrameRate(frameRateText));
      policyResults.push({
        policyId,
        ok: measurable && (blankSampleCount === 0 || allowBlank === true || openingFade !== null),
        measurable,
        sampleTimes,
        visibleSampleCount,
        blankSampleCount,
        blankAllowed: blankSampleCount > 0 && allowBlank === true,
        openingFadeAccepted: openingFade !== null,
        openingFade,
        samples,
      });
    }
    const failedPolicy = policyResults.find((policy) => !policy.ok);
    if (failedPolicy) {
      const allTransparent = failedPolicy.samples.every((sample) => !sample.visibleAlpha);
      const allBlack = failedPolicy.samples.every((sample) => sample.black);
      return {
        ok: false,
        code: !failedPolicy.measurable
          ? "visual-media-pixel-stats-missing"
          : allTransparent
            ? "visual-media-transparent"
            : allBlack
              ? "visual-media-black"
              : failedPolicy.blankSampleCount > 0
                ? "visual-media-blank-sample"
                : "visual-media-flat",
        ...common,
        message: `The fully decoded video has ${failedPolicy.blankSampleCount} blank or flat sample${failedPolicy.blankSampleCount === 1 ? "" : "s"} under ${failedPolicy.policyId}.`,
        decodeScope: "full-file",
        sampleTimes: policyResults[0]?.sampleTimes || [],
        samplingPolicies: policyResults,
      };
    }
    const openingFade = policyResults.find((policy) => policy.openingFadeAccepted)?.openingFade || null;
    return {
      ok: true,
      code: "video-samples-decoded",
      ...common,
      decodeScope: "full-file",
      sampleTimes: policyResults[0]?.sampleTimes || [],
      samplingPolicies: policyResults,
      blankAllowed: policyResults.some((policy) => policy.blankAllowed),
      openingFade,
      evidence: deterministicEvidence(file, { allowBlank, temporal: true, samplingPolicies: policies, openingFade }),
    };
  } catch (error) {
    throwIfAborted(signal, error);
    return { ok: false, code: "visual-media-sample-decode-failed", ...common, message: safeMessage(error), decodeScope: declaredKind === "video" ? "full-file" : "single-image" };
  }
}

export async function probeVisualMediaFile(filePath, {
  kind = "auto",
  allowBlank = false,
  samplingPolicy = null,
  samplingPolicies = null,
  runCommand = run,
  signal = null,
  onProgress = null,
} = {}) {
  throwIfAborted(signal);
  const declaredKind = kind === "auto" ? (IMAGE_PATTERN.test(filePath) ? "image" : "video") : kind;
  const policies = declaredKind === "video"
    ? normalizedSamplingPolicies(samplingPolicies || samplingPolicy)
    : [];
  const file = signature(filePath, declaredKind, { allowBlank, samplingPolicies: policies });
  if (probeCache.has(file.key)) {
    const cached = structuredClone(await probeCache.get(file.key));
    emitProgress(onProgress, "complete", file, declaredKind, { ok: true, cached: true });
    return cached;
  }

  // A signal or custom runner makes the work caller-owned. Sharing that promise
  // would let one render's cancellation/transient behavior cancel another render.
  // Progress callbacks are also caller-owned so each observer receives its own
  // bounded stage sequence.
  const mayShareInFlight = runCommand === run && !signal && typeof onProgress !== "function";
  if (mayShareInFlight && probeInFlight.has(file.key)) return structuredClone(await probeInFlight.get(file.key));

  const pending = (async () => {
    emitProgress(onProgress, "start", file, declaredKind);
    try {
      const result = await executeProbe(file, declaredKind, {
        allowBlank,
        samplingPolicies: policies,
        runCommand,
        signal,
        onProgress,
      });
      throwIfAborted(signal);
      const currentIdentity = readFileIdentity(file.resolvedPath);
      if (!sameFileIdentity(file.identity, currentIdentity)) {
        const changed = {
          ok: false,
          code: "visual-media-file-changed-during-probe",
          path: file.resolvedPath,
          kind: declaredKind,
          message: "The visual media file changed while it was being verified. Retry against the stable replacement.",
          initialIdentity: file.identity,
          currentIdentity,
        };
        emitProgress(onProgress, "complete", file, declaredKind, { ok: false, code: changed.code, cached: false });
        return changed;
      }
      // Only the actual local decoder can create reusable evidence. Test/custom runners
      // and all negative/transient results are deliberately retried on the next call.
      if (runCommand === run && isPersistableEvidence(result)) probeCache.set(file.key, Promise.resolve(result));
      emitProgress(onProgress, "complete", file, declaredKind, { ok: result.ok === true, code: result.code, cached: false });
      return result;
    } catch (error) {
      emitProgress(onProgress, "complete", file, declaredKind, { ok: false, code: "aborted", cached: false });
      throw error;
    }
  })();
  if (mayShareInFlight) probeInFlight.set(file.key, pending);
  try {
    return structuredClone(await pending);
  } finally {
    if (mayShareInFlight && probeInFlight.get(file.key) === pending) probeInFlight.delete(file.key);
  }
}

async function mapLimit(rows, concurrency, work, signal = null) {
  const results = new Array(rows.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      throwIfAborted(signal);
      const index = cursor;
      cursor += 1;
      results[index] = await work(rows[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), rows.length) }, worker));
  return results;
}

function report(schemaVersion, entries) {
  const failures = entries.filter((entry) => !entry.ok);
  return {
    schemaVersion,
    ok: failures.length === 0,
    uniqueInputCount: entries.length,
    verifiedInputCount: entries.length - failures.length,
    blockedInputCount: failures.length,
    entries,
    failures,
  };
}

export async function preflightProxyAtlasImages(readiness = {}, {
  concurrency = 4,
  probe = probeVisualMediaFile,
  signal = null,
  onProgress = null,
} = {}) {
  throwIfAborted(signal);
  const rows = list(readiness?.checks?.proxyAssets?.entries)
    .filter((entry) => entry?.resolvedPath)
    .filter((entry, index, values) => values.findIndex((candidate) => candidate.resolvedPath === entry.resolvedPath) === index);
  const entries = await mapLimit(rows, concurrency, async (entry, index) => {
    const result = await probe(entry.resolvedPath, {
      kind: "proxy",
      signal,
      onProgress: typeof onProgress === "function"
        ? (event) => onProgress({ ...event, inputIndex: index, inputCount: rows.length })
        : null,
    });
    if (!result.ok) return result;
    const expectedWidth = Number(entry.expectedWidth || 0);
    const expectedHeight = Number(entry.expectedHeight || 0);
    if (expectedWidth > 0 && expectedHeight > 0 && (result.width !== expectedWidth || result.height !== expectedHeight)) {
      return {
        ...result,
        ok: false,
        code: "proxy-atlas-dimensions-mismatch",
        message: `Decoded atlas is ${result.width}x${result.height}; registry requires ${expectedWidth}x${expectedHeight}.`,
        expectedWidth,
        expectedHeight,
      };
    }
    return { ...result, expectedWidth, expectedHeight };
  }, signal);
  return report("hapa.song-card.proxy-atlas-preflight.v1", entries);
}

function explicitAllowBlank(entry = {}) {
  return entry?.allowBlank === true
    || entry?.visualContract?.allowBlank === true
    || entry?.source?.allowBlank === true
    || entry?.source?.visualContract?.allowBlank === true;
}

function declaredSamplingPolicy(entry = {}) {
  return text(
    entry?.videoSamplingPolicy
    || entry?.samplingPolicy
    || entry?.visualContract?.samplingPolicy
    || entry?.source?.videoSamplingPolicy
    || entry?.source?.samplingPolicy
    || entry?.source?.visualContract?.samplingPolicy,
  );
}

function declaredMediaKind(entry = {}) {
  const kind = text(entry?.kind || entry?.type || entry?.source?.kind || entry?.source?.type).toLowerCase();
  return kind === "image" || kind === "video" ? kind : null;
}

export async function preflightResolvedVisualMedia(mediaPreflight = {}, {
  concurrency = 4,
  probe = probeVisualMediaFile,
  signal = null,
  onProgress = null,
} = {}) {
  throwIfAborted(signal);
  const grouped = new Map();
  for (const entry of list(mediaPreflight?.entries)) {
    const declaredPath = text(entry?.resolvedPath);
    const resolvedPath = declaredPath ? path.resolve(declaredPath) : "";
    if (!resolvedPath) continue;
    if (!grouped.has(resolvedPath)) grouped.set(resolvedPath, []);
    grouped.get(resolvedPath).push(entry);
  }
  const rows = [...grouped.entries()].map(([resolvedPath, usages]) => ({
    resolvedPath,
    // A shared file may only bypass visibility validation when every usage carries
    // the explicit contract. One uncontracted usage keeps the file fail-closed.
    allowBlank: usages.length > 0 && usages.every(explicitAllowBlank),
    samplingPolicies: [...new Set(usages.map(declaredSamplingPolicy).filter(Boolean))],
    declaredKinds: [...new Set(usages.map(declaredMediaKind).filter(Boolean))],
  }));
  const entries = await mapLimit(rows, concurrency, ({ resolvedPath, allowBlank, samplingPolicies, declaredKinds }, index) => probe(resolvedPath, {
    kind: declaredKinds.length === 1 ? declaredKinds[0] : "auto",
    allowBlank,
    samplingPolicies: samplingPolicies.length ? samplingPolicies : [DEFAULT_VIDEO_SAMPLING_POLICY],
    signal,
    onProgress: typeof onProgress === "function"
      ? (event) => onProgress({ ...event, inputIndex: index, inputCount: rows.length })
      : null,
  }), signal);
  return report("hapa.song-card.visual-media-decode-preflight.v1", entries);
}

export function clearRenderVisualMediaProbeCache() {
  probeCache.clear();
  probeInFlight.clear();
}

export function loadRenderVisualMediaProbeCache(filePath) {
  let payload;
  try { payload = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return { loaded: 0, path: path.resolve(filePath) }; }
  if (payload?.schemaVersion !== CACHE_SCHEMA || !Array.isArray(payload.entries)) return { loaded: 0, path: path.resolve(filePath) };
  let loaded = 0;
  for (const entry of payload.entries) {
    if (!text(entry?.key) || !isPersistableEvidence(entry?.result)) continue;
    if (entry.result.evidence.signatureKey !== entry.key) continue;
    const live = signature(entry.result.path, entry.result.kind, {
      allowBlank: entry.result.evidence.allowBlankContract === true,
      samplingPolicies: entry.result.evidence.samplingPolicies,
    });
    if (!live.readable || live.key !== entry.key || !sameFileIdentity(live.identity, entry.result.evidence.fileIdentity)) continue;
    probeCache.set(entry.key, Promise.resolve(entry.result));
    loaded += 1;
  }
  return { loaded, path: path.resolve(filePath) };
}

export async function writeRenderVisualMediaProbeCache(filePath) {
  const entries = [];
  for (const [key, pending] of probeCache.entries()) {
    try {
      const result = await pending;
      if (isPersistableEvidence(result) && result.evidence.signatureKey === key) entries.push({ key, result });
    } catch { /* A rejected in-flight probe is never persistent evidence. */ }
  }
  entries.sort((left, right) => left.key.localeCompare(right.key));
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const temporary = `${resolvedPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ schemaVersion: CACHE_SCHEMA, updatedAt: new Date().toISOString(), entries }, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, resolvedPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { written: entries.length, path: resolvedPath };
}
