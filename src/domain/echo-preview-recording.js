// Echo Album Director Preview — quick capture (preview recordings).
//
// This module owns the browser-agnostic parts of the Director Preview
// "Record" feature: container/mime negotiation, file extension mapping, and
// the MediaRecorder session lifecycle (start / tick / auto-stop / stop).
//
// It is deliberately independent of the Song Card release machinery: a
// preview recording is a lightweight operator capture with no release
// bookkeeping, no certification, and no gates.
//
// The React orchestration (compositing the presented media + shader canvas,
// the Web Audio capture tap, upload, and the Recordings shelf) lives in
// src/components/HapaEchosView.jsx; the server persistence lives in
// server/preview-recording-store.mjs behind /api/echo/preview-recordings.

export const ECHO_PREVIEW_RECORDING_SCHEMA = "hapa.echo.preview-recording.v1";

// Capture rate for the preview recording canvas stream. The Director Preview
// frames at 30fps; matching it avoids temporal aliasing in the capture.
export const ECHO_PREVIEW_RECORD_FPS = 30;

// Long-form safety ceiling for a single capture. The operator can always stop
// earlier, while a forgotten recording still cannot run unbounded.
export const ECHO_PREVIEW_RECORD_MAX_DURATION_MS = 60 * 60 * 1000;

// Timeslice for MediaRecorder data events: keeps the browser from hoarding an
// unbounded in-memory buffer while the operator records.
export const ECHO_PREVIEW_RECORD_TIMESLICE_MS = 1000;

// High-quality capture budget for the Director's full-resolution 1080p/30
// output. Fast shader motion and neon gradients need substantially more room
// than the old 8 Mbps preview encode; audio is raised in the same profile so
// sound quality keeps pace with the sharper picture.
// MediaRecorder treats these as requested/target rates and may report a nearby
// negotiated value for the selected browser codec.
export const ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE = 20_000_000;
export const ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE = 256_000;

export function echoPreviewRecordingQualityLabel({ width, height } = {}) {
  const normalizedWidth = Math.max(0, Math.trunc(Number(width) || 0));
  const normalizedHeight = Math.max(0, Math.trunc(Number(height) || 0));
  const dimensions = normalizedWidth && normalizedHeight
    ? `${normalizedWidth}\u00d7${normalizedHeight}`
    : "FULL OUTPUT";
  const videoMbps = ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE / 1_000_000;
  const audioKbps = ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE / 1_000;
  return `HQ ${dimensions} \u00b7 ${ECHO_PREVIEW_RECORD_FPS} FPS \u00b7 ${videoMbps} Mbps VIDEO \u00b7 ${audioKbps} kbps AUDIO`;
}

// Container candidates in preference order. Safari's MediaRecorder only
// supports MP4/H.264 (+ AAC); Chromium/Firefox support WebM/VP8/VP9+Opus.
// The first supported candidate wins; undefined means the browser supports
// none of these and the caller must fall back to the default constructor.
export const ECHO_PREVIEW_RECORD_MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  "video/mp4",
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/**
 * Pick the best MediaRecorder mime type the runtime supports.
 *
 * @param {(mimeType: string) => boolean} [isTypeSupported] Injectable so the
 *   choice stays unit-testable outside the browser.
 * @returns {string|undefined} The chosen mime type, or undefined when the
 *   runtime supports none of the candidates (caller should then use the
 *   MediaRecorder default constructor).
 */
export function pickEchoPreviewRecordingMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== "function") return undefined;
  for (const candidate of ECHO_PREVIEW_RECORD_MIME_CANDIDATES) {
    let supported = false;
    try {
      supported = Boolean(isTypeSupported(candidate));
    } catch {
      supported = false;
    }
    if (supported) return candidate;
  }
  return undefined;
}

/**
 * File extension for a recorded container mime type.
 *
 * @param {string} [mimeType]
 * @returns {"mp4"|"webm"}
 */
export function echoPreviewRecordingFileExtension(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  return "webm";
}

/**
 * Content type stored alongside the recording (what the file route serves).
 *
 * @param {string} [mimeType]
 * @returns {string}
 */
export function echoPreviewRecordingContentType(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("mp4")) return "video/mp4";
  return "video/webm";
}

function echoPreviewRecordingSafeFilePart(value, fallback = "Untitled Song") {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, " - ")
    .replace(/\s+/gu, " ")
    .replace(/(?:\s+-\s+){2,}/gu, " - ")
    .trim()
    .replace(/^[. -]+|[. -]+$/gu, "")
    .slice(0, 96)
    .trim();
  return normalized || fallback;
}

/**
 * Build the operator-facing recording filename used by both server storage
 * and the browser's emergency local-download fallback.
 */
export function echoPreviewRecordingFileName({
  songTitle,
  recordingNumber = 1,
  durationMs = 0,
  createdAt = new Date(),
  mimeType = "video/webm",
} = {}) {
  const title = echoPreviewRecordingSafeFilePart(songTitle);
  const take = Math.max(1, Math.trunc(Number(recordingNumber) || 1));
  const totalSeconds = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const length = hours > 0
    ? `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`
    : `${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  const parsedDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const timestampDate = Number.isFinite(parsedDate.getTime()) ? parsedDate : new Date(0);
  const timestamp = timestampDate.toISOString().replace(/\.\d{3}Z$/u, "Z").replace(/:/gu, "-");
  const extension = echoPreviewRecordingFileExtension(mimeType);
  return `${title} - recording ${String(take).padStart(2, "0")} - ${length} - ${timestamp}.${extension}`;
}

/**
 * Create a MediaRecorder session controller for a preview recording.
 *
 * The recorder instance is injected (it owns the browser MediaStream); this
 * controller owns the lifecycle: exactly one start, elapsed-time ticks, an
 * auto-stop at the duration ceiling, and a stop() that resolves with the
 * assembled Blob. All timers/clocks are injectable for tests.
 *
 * @param {object} options
 * @param {object} options.recorder MediaRecorder instance (not yet started).
 * @param {number} [options.maxDurationMs] Auto-stop ceiling.
 * @param {(elapsedMs: number) => void} [options.onTick] Elapsed-time observer.
 * @param {() => void} [options.onAutoStop] Called once when the ceiling hits.
 * @param {() => number} [options.clock] Monotonic ms clock (default performance/Date).
 * @param {number} [options.tickIntervalMs] Elapsed-time tick cadence.
 */
export function createEchoPreviewRecordingSession({
  recorder,
  maxDurationMs = ECHO_PREVIEW_RECORD_MAX_DURATION_MS,
  onTick,
  onAutoStop,
  clock,
  tickIntervalMs = 250,
} = {}) {
  if (!recorder || typeof recorder.start !== "function" || typeof recorder.stop !== "function") {
    throw new Error("createEchoPreviewRecordingSession requires a MediaRecorder instance");
  }
  const now = typeof clock === "function" ? clock : () => (globalThis.performance?.now?.() ?? Date.now());
  let state = "idle";
  let startedAt = 0;
  let durationMs = 0;
  let elapsedTick = 0;
  let autoStopFired = false;
  let lastError = "";
  let stopResolvers = [];

  const resolveStop = (result) => {
    const resolvers = stopResolvers;
    stopResolvers = [];
    for (const resolve of resolvers) resolve(result);
  };

  recorder.onstop = () => {
    if (state !== "stopped" && state !== "error") state = "stopped";
    resolveStop({ state, durationMs });
  };

  recorder.onerror = (event) => {
    if (state === "recording" || state === "auto-stopping" || state === "stopping") {
      clearAutoStop();
      state = "error";
      lastError = String(event?.error?.message || "media_recorder_error");
      resolveStop({ state: "error", durationMs, error: lastError });
    }
  };

  const scheduleAutoStop = () => {
    elapsedTick = globalThis.setInterval(() => {
      const elapsed = Math.max(0, now() - startedAt);
      durationMs = Math.min(elapsed, Number(maxDurationMs) || ECHO_PREVIEW_RECORD_MAX_DURATION_MS);
      if (typeof onTick === "function") {
        try { onTick(elapsed); } catch { /* observer must not kill the capture */ }
      }
      if (!autoStopFired && elapsed >= (Number(maxDurationMs) || ECHO_PREVIEW_RECORD_MAX_DURATION_MS)) {
        autoStopFired = true;
        globalThis.clearInterval(elapsedTick);
        if (typeof onAutoStop === "function") {
          try { onAutoStop(); } catch { /* the explicit stop path still runs below */ }
        }
        if (recorder.state !== "inactive") {
          state = "auto-stopping";
          try { recorder.stop(); } catch { /* already inactive */ }
        }
      }
    }, Math.max(50, Number(tickIntervalMs) || 250));
  };

  const clearAutoStop = () => {
    if (elapsedTick) {
      globalThis.clearInterval(elapsedTick);
      elapsedTick = 0;
    }
  };

  return {
    get state() { return state; },
    get durationMs() { return durationMs; },
    /**
     * Begin the capture. Throws when already running or already finished.
     * @param {number} [timesliceMs]
     */
    start(timesliceMs) {
      if (state !== "idle") {
        throw new Error(`cannot start a preview recording session in state "${state}"`);
      }
      state = "recording";
      autoStopFired = false;
      startedAt = now();
      durationMs = 0;
      recorder.start(Number(timesliceMs) > 0 ? Number(timesliceMs) : undefined);
      scheduleAutoStop();
      return this;
    },
    /**
     * Request the stop and resolve with { state, durationMs, blob } once the
     * recorder emits its final data. The blob assembly is injected because
     * the chunk collector lives with the MediaStream owner.
     *
     * @param {() => any} [buildResultBlob]
     * @param {number} [timeoutMs] Safety wait for the onstop flush.
     */
    stop({ buildResultBlob, timeoutMs = 5000 } = {}) {
      if (state === "stopped" || state === "error") {
        // An auto-stop at the ceiling can finish before this call; still
        // hand back the assembled blob so the capture is never dropped.
        let blob = null;
        try {
          blob = typeof buildResultBlob === "function" ? buildResultBlob() : null;
        } catch { blob = null; }
        return Promise.resolve({ state, durationMs, blob, error: state === "error" ? (lastError || "media_recorder_error") : null });
      }
      clearAutoStop();
      state = "stopping";
      const finish = (result) => {
        let blob = null;
        try {
          blob = typeof buildResultBlob === "function" ? buildResultBlob() : null;
        } catch { blob = null; }
        return { ...result, blob };
      };
      return new Promise((resolve) => {
        stopResolvers.push((result) => resolve(finish(result)));
        if (recorder.state === "inactive") {
          // Nothing left to flush; the onstop hook may never fire.
          const result = { state: "stopped", durationMs };
          resolve(finish(result));
          return;
        }
        try {
          recorder.stop();
        } catch {
          const result = { state: "stopped", durationMs };
          resolve(finish(result));
          return;
        }
        globalThis.setTimeout(() => {
          // If the flush never arrived, resolve with what we have so the
          // operator's capture is never silently dropped.
          if (state === "stopping") {
            const result = { state: "stopped", durationMs };
            resolve(finish(result));
          }
        }, Math.max(0, Number(timeoutMs) || 5000));
      });
    },
    /** Test/support hook: expose the live recorder for stream cleanup. */
    get recorder() { return recorder; },
  };
}

/**
 * Format elapsed milliseconds as m:ss (operator-facing capture timer).
 *
 * @param {number} milliseconds
 * @returns {string}
 */
export function formatEchoPreviewRecordingElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Trusted local UI session bootstrap.
//
// The preview recording routes are admin-gated. The standard local launchd
// deployment runs without a bearer admin token, so a browser client must
// first establish the trusted-local-UI session cookie (POST
// /api/local-ui-session) or every admin call fails closed with
// admin_auth_not_configured. The bootstrap re-posts on each call (deduping
// only concurrent callers) because the session token rotates on every
// service restart; a one-shot cached success would otherwise leave a stale
// cookie in the browser and 503 again after a restart.

let localUiSessionPromise = null;

/**
 * Establish the trusted-local-UI session for the preview recording routes.
 *
 * @param {string} [apiBase] API origin prefix (empty string for same-origin).
 * @param {(input: any, init: any) => Promise<any>} [fetchImpl] Injectable for
 *   tests; defaults to the global fetch.
 * @returns {Promise<object>} The session payload on success.
 */
export function ensureEchoPreviewRecordingLocalSession(apiBase = "", fetchImpl) {
  if (localUiSessionPromise) return localUiSessionPromise;
  const fetchFn = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
  if (typeof fetchFn !== "function") {
    const failed = Promise.reject(new Error("fetch is not available"));
    localUiSessionPromise = failed;
    return failed;
  }
  const base = String(apiBase || "").replace(/\/+$/, "");
  const pending = fetchFn(`${base}/api/local-ui-session`, {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Local Builder session failed (${response.status}).`);
    }
    return payload;
  }).finally(() => {
    if (localUiSessionPromise === pending) localUiSessionPromise = null;
  });
  localUiSessionPromise = pending;
  return localUiSessionPromise;
}
