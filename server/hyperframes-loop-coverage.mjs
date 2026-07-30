import { execFile as execFileCallback } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const REPORT_SCHEMA = "hapa.hyperframes.loop-coverage-preflight.v1";
const DEFAULT_THRESHOLD = 0.95;
const text = (value) => String(value ?? "").trim();

function numericAttribute(attributes, name, fallback = 0) {
  const match = attributes.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu"));
  const value = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  return Number.isFinite(value) ? value : fallback;
}

function stringAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu"));
  return text(match?.[1] ?? match?.[2] ?? match?.[3]);
}

function hasBooleanAttribute(attributes, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|/?>|$)`, "iu").test(attributes);
}

function localAssetPath(projectDirectory, source) {
  const cleanSource = text(source).split(/[?#]/u, 1)[0];
  if (!cleanSource || /^[a-z][a-z0-9+.-]*:/iu.test(cleanSource) || cleanSource.startsWith("//")) return null;
  const projectRoot = path.resolve(projectDirectory);
  const resolvedPath = path.resolve(projectRoot, cleanSource);
  const relativePath = path.relative(projectRoot, resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return { source: cleanSource, resolvedPath, relativePath };
}

export function parseHyperFramesVideoSlots(html = "") {
  const slots = [];
  let index = 0;
  for (const match of String(html).matchAll(/<video\b([^>]*)>/giu)) {
    const attributes = match[1] || "";
    const startSeconds = numericAttribute(attributes, "data-start", 0);
    const declaredEnd = numericAttribute(attributes, "data-end", Number.NaN);
    const durationSeconds = numericAttribute(attributes, "data-duration", Number.NaN);
    const endSeconds = Number.isFinite(declaredEnd)
      ? declaredEnd
      : (Number.isFinite(durationSeconds) ? startSeconds + durationSeconds : startSeconds);
    slots.push({
      id: stringAttribute(attributes, "id") || `hf-video-${index}`,
      source: stringAttribute(attributes, "src"),
      startSeconds,
      endSeconds,
      mediaStartSeconds: numericAttribute(attributes, "data-media-start", 0),
      loop: hasBooleanAttribute(attributes, "loop"),
    });
    index += 1;
  }
  return slots;
}

export function inspectHyperFramesLoopCoverage({
  slots = [],
  durationBySource = {},
  fps = 30,
  threshold = DEFAULT_THRESHOLD,
} = {}) {
  const safeFps = Number(fps) > 0 ? Number(fps) : 30;
  const safeThreshold = Number(threshold) > 0 && Number(threshold) <= 1
    ? Number(threshold)
    : DEFAULT_THRESHOLD;
  const entries = slots.map((slot) => {
    const sourceDurationSeconds = Number(durationBySource[slot.source] || 0);
    const slotDurationSeconds = Math.max(0, Number(slot.endSeconds) - Number(slot.startSeconds));
    const requiredSourceSeconds = Math.max(0, Number(slot.mediaStartSeconds) + slotDurationSeconds);
    const expectedFrames = Math.ceil(slotDurationSeconds * safeFps);
    const availableFrames = Math.max(0, Math.floor((sourceDurationSeconds - Number(slot.mediaStartSeconds)) * safeFps));
    const coverage = expectedFrames > 0 ? availableFrames / expectedFrames : 1;
    const local = Boolean(text(slot.source)) && sourceDurationSeconds > 0;
    const needsFill = slot.loop === true && local && expectedFrames > 0 && coverage < safeThreshold;
    return {
      ...slot,
      sourceDurationSeconds,
      slotDurationSeconds,
      requiredSourceSeconds,
      expectedFrames,
      availableFrames,
      coverage,
      threshold: safeThreshold,
      needsFill,
    };
  });
  const gaps = entries.filter((entry) => entry.needsFill);
  return {
    schemaVersion: REPORT_SCHEMA,
    ok: gaps.length === 0,
    fps: safeFps,
    threshold: safeThreshold,
    slotCount: entries.length,
    loopSlotCount: entries.filter((entry) => entry.loop).length,
    gapCount: gaps.length,
    entries,
    gaps,
  };
}

export function analyzeKeyframeTimestamps(timestamps = []) {
  const values = timestamps.map((value) => Number.parseFloat(String(value))).filter(Number.isFinite).sort((left, right) => left - right);
  let maxIntervalSeconds = 0;
  for (let index = 1; index < values.length; index += 1) {
    maxIntervalSeconds = Math.max(maxIntervalSeconds, values[index] - values[index - 1]);
  }
  return {
    keyframeCount: values.length,
    maxIntervalSeconds: Math.round(maxIntervalSeconds * 100) / 100,
    sparse: values.length >= 2 && maxIntervalSeconds > 2,
  };
}

async function probeVideo(filePath, { runCommand = execFile } = {}) {
  const [{ stdout }, { stdout: keyframeStdout }] = await Promise.all([
    runCommand("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=pix_fmt,codec_name:format=duration",
    "-of", "json",
    filePath,
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
    runCommand("ffprobe", [
      "-v", "quiet",
      "-select_streams", "v:0",
      "-skip_frame", "nokey",
      "-show_entries", "frame=pts_time",
      "-of", "csv=p=0",
      filePath,
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
  ]);
  const parsed = JSON.parse(stdout || "{}");
  const keyframes = analyzeKeyframeTimestamps(String(keyframeStdout || "").split(/\r?\n/u));
  return {
    durationSeconds: Number(parsed?.format?.duration || 0),
    pixelFormat: text(parsed?.streams?.[0]?.pix_fmt),
    codec: text(parsed?.streams?.[0]?.codec_name),
    ...keyframes,
  };
}

function alphaPixelFormat(pixelFormat = "") {
  return /(?:^yuva|rgba|argb|bgra|abgr|gbrap|graya|^ya\d)/iu.test(text(pixelFormat));
}

function outputArguments(filePath, fps, durationSeconds) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".webm") {
    return [
      "-t", String(durationSeconds),
      "-an", "-vf", `fps=${fps}`,
      "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0",
    ];
  }
  return [
    "-t", String(durationSeconds),
    "-an", "-vf", `fps=${fps},format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-g", String(fps), "-keyint_min", String(fps), "-sc_threshold", "0",
    "-movflags", "+faststart",
  ];
}

async function normalizeLoopAsset(filePath, requiredSeconds, fps, {
  runCommand = execFile,
  signal = null,
} = {}) {
  const extension = path.extname(filePath) || ".mp4";
  const digest = crypto.createHash("sha256").update(`${filePath}:${requiredSeconds}:${fps}`).digest("hex").slice(0, 12);
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath, extension)}.loop-fill-${process.pid}-${digest}${extension}`);
  try {
    await runCommand("ffmpeg", [
      "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
      "-stream_loop", "-1", "-i", filePath,
      ...outputArguments(filePath, fps, requiredSeconds),
      temporaryPath,
    ], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: Math.max(120_000, Math.ceil(requiredSeconds * 20_000)),
      ...(signal ? { signal } : {}),
    });
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function ensureHyperFramesLoopCoverage({
  projectDirectory,
  fps = 30,
  threshold = DEFAULT_THRESHOLD,
  runCommand = execFile,
  signal = null,
} = {}) {
  const projectRoot = path.resolve(projectDirectory);
  const indexPath = path.join(projectRoot, "index.html");
  const reportPath = path.join(projectRoot, "loop-coverage-preflight.json");
  const html = await fs.readFile(indexPath, "utf8");
  const slots = parseHyperFramesVideoSlots(html);
  const sourceRows = new Map();
  for (const slot of slots) {
    const asset = localAssetPath(projectRoot, slot.source);
    if (!asset || sourceRows.has(slot.source)) continue;
    const metadata = await probeVideo(asset.resolvedPath, { runCommand });
    sourceRows.set(slot.source, { ...asset, ...metadata });
  }
  const durationBySource = Object.fromEntries([...sourceRows].map(([source, row]) => [source, row.durationSeconds]));
  const before = inspectHyperFramesLoopCoverage({ slots, durationBySource, fps, threshold });
  const sparseKeyframesBefore = [...sourceRows.entries()]
    .filter(([, asset]) => asset.sparse)
    .map(([source, asset]) => ({ source, maxIntervalSeconds: asset.maxIntervalSeconds }));
  const repairsBySource = new Map();
  for (const gap of before.gaps) {
    const prior = repairsBySource.get(gap.source) || { requiredSourceSeconds: 0, reasons: [] };
    repairsBySource.set(gap.source, {
      requiredSourceSeconds: Math.max(prior.requiredSourceSeconds, gap.requiredSourceSeconds),
      reasons: [...new Set([...prior.reasons, "duration-coverage-gap"])],
    });
  }
  for (const [source, asset] of sourceRows) {
    if (!asset.sparse) continue;
    const prior = repairsBySource.get(source) || { requiredSourceSeconds: 0, reasons: [] };
    repairsBySource.set(source, {
      requiredSourceSeconds: Math.max(prior.requiredSourceSeconds, asset.durationSeconds),
      reasons: [...new Set([...prior.reasons, "sparse-keyframes"])],
    });
  }

  const repairs = [];
  const blockers = [];
  for (const [source, repair] of repairsBySource) {
    const asset = sourceRows.get(source);
    if (!asset) {
      blockers.push({ source, code: "loop-source-unavailable", message: "The packaged loop source could not be resolved." });
      continue;
    }
    if (alphaPixelFormat(asset.pixelFormat)) {
      blockers.push({
        source,
        code: "loop-alpha-fill-unsupported",
        message: "The packaged loop has alpha video and requires an alpha-preserving loop repair.",
        pixelFormat: asset.pixelFormat,
      });
      continue;
    }
    try {
      await normalizeLoopAsset(asset.resolvedPath, repair.requiredSourceSeconds, Number(fps) || 30, { runCommand, signal });
      const verified = await probeVideo(asset.resolvedPath, { runCommand });
      durationBySource[source] = verified.durationSeconds;
      sourceRows.set(source, { ...asset, ...verified });
      repairs.push({
        source,
        path: asset.resolvedPath,
        reasons: repair.reasons,
        originalDurationSeconds: asset.durationSeconds,
        requiredDurationSeconds: repair.requiredSourceSeconds,
        repairedDurationSeconds: verified.durationSeconds,
        originalMaxKeyframeIntervalSeconds: asset.maxIntervalSeconds,
        repairedMaxKeyframeIntervalSeconds: verified.maxIntervalSeconds,
      });
    } catch (error) {
      blockers.push({
        source,
        code: "loop-fill-failed",
        message: text(error?.stderr || error?.message || error).replace(/\s+/gu, " ").slice(0, 500),
      });
    }
  }

  const after = inspectHyperFramesLoopCoverage({ slots, durationBySource, fps, threshold });
  const sparseAfter = [...sourceRows.entries()]
    .filter(([, asset]) => asset.sparse)
    .map(([source, asset]) => ({ source, maxIntervalSeconds: asset.maxIntervalSeconds }));
  const report = {
    schemaVersion: REPORT_SCHEMA,
    ok: blockers.length === 0 && after.ok && sparseAfter.length === 0,
    projectDirectory: projectRoot,
    indexPath,
    fps: after.fps,
    threshold: after.threshold,
    before,
    after,
    sparseKeyframesBeforeCount: sparseKeyframesBefore.length,
    sparseKeyframesBefore,
    sparseKeyframesAfterCount: sparseAfter.length,
    sparseKeyframesAfter: sparseAfter,
    repairCount: repairs.length,
    repairs,
    blockerCount: blockers.length,
    blockers,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
