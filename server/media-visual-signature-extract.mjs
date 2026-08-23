// Media Visual Signature — Node frame acquisition.
//
// Avatar Likeness Assignment plan (docs/AVATAR_LIKENESS_ASSIGNMENT_PLAN.md,
// layer L1). Decodes any ffmpeg-readable image or video into the pixel
// samples the pure feature math in src/domain/media-visual-signature.js
// expects, then assembles the signature.
//
// Follows the repo's ffmpeg conventions: FFMPEG/FFPROBE environment
// overrides, PATH fallback, injectable spawn/exec for tests.
//
// The optical review's three-frame contract is reused verbatim: videos
// yield First (0s), Mid (duration/2), and Last (sseof ≈ two frame periods
// from the end, with a doubling retry ladder); images yield a single frame
// (role "single").

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";

import {
  MEDIA_VISUAL_SIGNATURE_SCHEMA,
  SIGNATURE_COLOR_SAMPLE,
  SIGNATURE_HASH_SAMPLE_WIDTH,
  SIGNATURE_HASH_SAMPLE_HEIGHT,
  signatureFromFrame,
  mergeFrameSignatures,
} from "../src/domain/media-visual-signature.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_FRAME_RATE = 24;

export class MediaVisualSignatureError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MediaVisualSignatureError";
    this.code = code;
    this.details = details;
  }
}

export function defaultFfmpegPath() {
  return process.env.FFMPEG || "ffmpeg";
}

export function defaultFfprobePath() {
  return process.env.FFPROBE || "ffprobe";
}

async function assertReadableFile(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  try {
    await access(resolved);
  } catch {
    throw new MediaVisualSignatureError("file_not_found", `media file not found: ${resolved}`, { path: resolved });
  }
  const info = await stat(resolved).catch(() => null);
  if (!info || !info.isFile()) {
    throw new MediaVisualSignatureError("not_a_file", `media path is not a regular file: ${resolved}`, { path: resolved });
  }
  return resolved;
}

/**
 * Decode one frame as raw pixels.
 *
 * @param {{
 *   path: string, timeSeconds?: number, sseofOffsetSeconds?: number,
 *   pixelFormat?: "rgb24"|"gray", width: number, height: number,
 *   ffmpegPath?: string, timeoutMs?: number,
 *   spawnFn?: typeof spawn,
 * }} options timeSeconds seeks from the start; sseofOffsetSeconds seeks that
 * many seconds back from the end (used for the Last frame, because an
 * absolute seek at/past the final frame makes ffmpeg emit zero bytes with
 * exit code 0 — indistinguishable from a healthy empty read). A time of
 * zero (or none) emits no seek argument at all: reading from the start is
 * exactly "seek to 0" without any of its fragility — for some inputs
 * (notably certain single-frame images) `-ss 0` makes ffmpeg drop the one
 * frame and exit 0 with zero output bytes.
 * @returns {Promise<{ pixels: Uint8Array, width: number, height: number, pixelFormat: string }>}
 */
export async function extractFramePixels({
  path,
  timeSeconds = 0,
  sseofOffsetSeconds,
  pixelFormat = "rgb24",
  width,
  height,
  ffmpegPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnFn = spawn,
}) {
  const resolved = await assertReadableFile(path);
  const sampleWidth = Math.max(1, Math.trunc(width) || SIGNATURE_COLOR_SAMPLE);
  const sampleHeight = Math.max(1, Math.trunc(height) || SIGNATURE_COLOR_SAMPLE);
  const filter = `scale=${sampleWidth}:${sampleHeight}:flags=bilinear${pixelFormat === "gray" ? ",format=gray" : ""}`;
  const useSseof = sseofOffsetSeconds !== undefined && sseofOffsetSeconds !== null && Number.isFinite(Number(sseofOffsetSeconds));
  const absoluteTime = Math.max(0, Number(timeSeconds) || 0);
  const seekArgs = useSseof
    ? ["-sseof", `-${Math.max(0, Number(sseofOffsetSeconds)).toFixed(3)}`]
    : absoluteTime > 0
      ? ["-ss", String(absoluteTime)]
      : [];
  const args = [
    "-v", "error",
    ...seekArgs,
    "-i", resolved,
    "-frames:v", "1",
    "-vf", filter,
    "-f", "rawvideo",
    "-pix_fmt", pixelFormat,
    "pipe:1",
  ];
  const bytesPerPixel = pixelFormat === "rgb24" ? 3 : 1;
  const expectedBytes = sampleWidth * sampleHeight * bytesPerPixel;
  const chunks = [];
  let stderr = "";
  let timedOut = false;
  const exit = await new Promise((resolvePromise) => {
    let child;
    try {
      child = spawnFn(ffmpegPath || defaultFfmpegPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolvePromise({ code: -1, error: error.message });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ code: -1, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code });
    });
  });
  const pixels = Buffer.concat(chunks);
  if (exit.error) {
    throw new MediaVisualSignatureError("tool_not_found", `ffmpeg could not be started: ${exit.error}`, {
      ffmpeg: ffmpegPath || defaultFfmpegPath(),
      path: resolved,
    });
  }
  if (timedOut) {
    throw new MediaVisualSignatureError("decode_timeout", `ffmpeg frame decode timed out after ${timeoutMs}ms`, { path: resolved });
  }
  if (exit.code !== 0 || pixels.length !== expectedBytes) {
    throw new MediaVisualSignatureError("decode_failed", `ffmpeg frame decode failed${stderr ? `: ${stderr.trim()}` : ""}`, {
      path: resolved,
      expectedBytes,
      actualBytes: pixels.length,
    });
  }
  return { pixels: new Uint8Array(pixels), width: sampleWidth, height: sampleHeight, pixelFormat };
}

/**
 * Probe a media file's duration and video frame rate via ffprobe.
 *
 * Images legitimately have no format duration and come back as all-null
 * (they are then signed as images). Any probe failure degrades the same
 * way: callers must treat nulls as "unknown", never as fatal.
 *
 * @param {{ path: string, ffprobePath?: string, execFileFn?: typeof execFile, timeoutMs?: number }} options
 * @returns {Promise<{ durationSeconds: number|null, fps: number|null }>}
 */
export async function probeMediaFormat({ path, ffprobePath, execFileFn = execFile, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const resolved = await assertReadableFile(path);
  const args = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "format=duration:stream=avg_frame_rate",
    "-of", "json",
    resolved,
  ];
  let stdout = "";
  try {
    ({ stdout } = await new Promise((resolvePromise) => {
      execFileFn(ffprobePath || defaultFfprobePath(), args, { timeout: Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS), maxBuffer: 1024 * 1024 }, (error, result) => {
        resolvePromise({ stdout: error ? "" : String(result || "") });
      });
    }));
  } catch {
    return { durationSeconds: null, fps: null };
  }
  let parsed;
  try { parsed = JSON.parse(String(stdout)); } catch { return { durationSeconds: null, fps: null }; }
  const duration = Number.parseFloat(String(parsed?.format?.duration ?? ""));
  const [numerator, denominator] = String(parsed?.streams?.[0]?.avg_frame_rate || "").split("/").map(Number);
  const fps = Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
  };
}

/**
 * Build a media visual signature for an image or video file.
 *
 * @param {{
 *   path: string,
 *   type?: "auto"|"image"|"video",
 *   ffmpegPath?: string, ffprobePath?: string,
 *   colorSample?: number,
 *   spawnFn?: typeof spawn, execFileFn?: typeof execFile,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<object>} signature document
 * @throws {MediaVisualSignatureError}
 */
export async function createMediaVisualSignature({
  path,
  type = "auto",
  ffmpegPath,
  ffprobePath,
  colorSample = SIGNATURE_COLOR_SAMPLE,
  spawnFn,
  execFileFn,
  timeoutMs,
}) {
  const resolved = await assertReadableFile(path);
  const probe = await probeMediaFormat({ path: resolved, ffprobePath, execFileFn, timeoutMs });
  let mediaType = type;
  let durationSeconds = probe.durationSeconds;
  const frameRate = probe.fps;
  if (mediaType === "auto") {
    mediaType = durationSeconds !== null ? "video" : "image";
  } else if (mediaType === "video") {
    // Explicit video: a missing duration degrades to a 0-second timeline
    // (first = mid = last) rather than failing the signature.
    if (durationSeconds === null) durationSeconds = 0;
  }

  const frameSignatureAt = async (timeSeconds, sseofOffsetSeconds) => {
    const color = await extractFramePixels({
      path: resolved, timeSeconds, sseofOffsetSeconds, pixelFormat: "rgb24",
      width: colorSample, height: colorSample, ffmpegPath, spawnFn, timeoutMs,
    });
    const gray = await extractFramePixels({
      path: resolved, timeSeconds, sseofOffsetSeconds, pixelFormat: "gray",
      width: SIGNATURE_HASH_SAMPLE_WIDTH, height: SIGNATURE_HASH_SAMPLE_HEIGHT, ffmpegPath, spawnFn, timeoutMs,
    });
    return signatureFromFrame({ rgb: color.pixels, width: color.width, height: color.height, gray: gray.pixels });
  };

  let frames;
  if (mediaType === "video") {
    const duration = durationSeconds ?? 0;
    const framePeriod = 1 / (frameRate || DEFAULT_FRAME_RATE);
    // The Last frame seeks with -sseof (relative to the end). The offset is
    // about two frame periods, so the seek lands on a frame that exists:
    // an absolute seek at/past the final frame makes ffmpeg exit 0 with
    // zero output, and a too-small sseof offset can do the same for clips
    // whose reported duration slightly exceeds their final frame. A retry
    // ladder doubles the offset before degrading to the first frame.
    const baseOffset = Math.min(1, Math.max(0.05, 2 * framePeriod));
    const lastOffset = duration > 0 ? Math.min(baseOffset, Math.max(0.02, duration * 0.25)) : baseOffset;
    const roles = [
      { role: "first", timeSeconds: 0 },
      { role: "mid", timeSeconds: duration / 2 },
      { role: "last", timeSeconds: Math.max(0, duration - lastOffset) },
    ];
    frames = [];
    for (const { role, timeSeconds: time } of roles) {
      let signature;
      if (role === "last") {
        let attemptError = null;
        for (const factor of [1, 2, 4]) {
          try {
            signature = await frameSignatureAt(time, lastOffset * factor);
            attemptError = null;
            break;
          } catch (error) {
            if (!(error instanceof MediaVisualSignatureError && error.code === "decode_failed" && error.details.actualBytes === 0)) throw error;
            attemptError = error;
          }
        }
        if (attemptError) {
          // Pathological file whose end seeks all yield no data: degrade to
          // the first frame and record that it did so.
          signature = await frameSignatureAt(0);
          signature.degraded = "last-frame-seek-returned-no-data; used first frame";
        }
      } else {
        try {
          signature = await frameSignatureAt(time);
        } catch (error) {
          if (!(error instanceof MediaVisualSignatureError && error.code === "decode_failed" && error.details.actualBytes === 0)) throw error;
          // A seek into a clip whose usable span is nearly zero can find no
          // frame at all: degrade to the first frame and record it, the same
          // way the last frame degrades.
          signature = await frameSignatureAt(0);
          signature.degraded = "mid-seek-returned-no-data; used first frame";
        }
      }
      frames.push({ role, timeSeconds: Number(time.toFixed(3)), signature });
    }
  } else {
    frames = [{ role: "single", timeSeconds: 0, signature: await frameSignatureAt(0) }];
  }

  const merged = mergeFrameSignatures(frames.map((frame) => frame.signature));
  return {
    schemaVersion: MEDIA_VISUAL_SIGNATURE_SCHEMA,
    type: mediaType,
    path: resolved,
    durationSeconds: mediaType === "video" ? durationSeconds : null,
    colorSample,
    frames,
    merged,
    extractedAt: new Date().toISOString(),
  };
}
