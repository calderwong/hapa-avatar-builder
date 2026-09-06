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

// Companion data belongs to the existing preview recording, not a release.
export const ECHO_PREVIEW_SIGNALS_SCHEMA = "hapa.echo.preview-signals.v1";
export const ECHO_PREVIEW_SIGNALS_MAX_BYTES = 64 * 1024 * 1024;
export const ECHO_PREVIEW_SIGNALS_MAX_FRAMES = 216000;

function signalCaptureError(message) { throw new Error(`preview_signals_invalid: ${message}`); }
function checkedSignalIdentity(identity) {
  const keys = ["songId", "cutId", "audioUri", "graphSha256", "audioSha256"];
  if (!identity || keys.some(key => typeof identity[key] !== "string" || !identity[key] || identity[key].length > 4096)
    || !/^sha256:[a-f0-9]{64}$/.test(identity.graphSha256) || !/^sha256:[a-f0-9]{64}$/.test(identity.audioSha256)) signalCaptureError("source identity");
  return Object.fromEntries(keys.map(key => [key, identity[key]]));
}
export function echoPreviewSignalIdentityMatches(left, right) {
  try { return JSON.stringify(checkedSignalIdentity(left)) === JSON.stringify(checkedSignalIdentity(right)); } catch { return false; }
}

function signalValue(value, depth = 0, decode = false) {
  if (depth > 5) signalCaptureError("sample nesting");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") { if (!Number.isFinite(value)) signalCaptureError("non-finite sample"); return value; }
  if (typeof value === "string") { if (value.length > 4096) signalCaptureError("sample string"); return value; }
  if (value instanceof Uint8Array) {
    if (value.length > 4096) signalCaptureError("spectrum length");
    return { $u8: btoa(String.fromCharCode(...value)) };
  }
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length > 64) signalCaptureError("sample object");
  if (Object.hasOwn(value, "$u8")) {
    if (Object.keys(value).length !== 1 || typeof value.$u8 !== "string" || value.$u8.length > 5464 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.$u8)) signalCaptureError("spectrum encoding");
    const bytes = Uint8Array.from(atob(value.$u8), c => c.charCodeAt(0));
    if (bytes.length > 4096) signalCaptureError("spectrum length");
    return decode ? bytes : { $u8: value.$u8 };
  }
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) => [key, signalValue(v, depth + 1, decode)]));
}
function encodeSignalFrames(signalFrames) {
  const entries = Object.entries(signalFrames || {});
  if (!entries.length || entries.length > 64 || !signalFrames.master) signalCaptureError("master sample required");
  const unique = [], aliases = {}, seen = new Map();
  for (const [role, frame] of entries) {
    if (!/^[A-Za-z0-9 _-]{1,80}$/.test(role)) signalCaptureError("bus name");
    if (!seen.has(frame)) { seen.set(frame, unique.length); unique.push(signalValue(frame)); }
    aliases[role] = seen.get(frame);
  }
  if (unique.length > 16) signalCaptureError("bus budget");
  return { buses: unique, aliases };
}

/** Keep exactly the samples consumed by the preview. Duplicate paused times
 * are omitted; transport discontinuities stop capture with an explicit reason. */
export function createEchoPreviewSignalCapture({ identity, clock = () => performance.now(), maxBytes = ECHO_PREVIEW_SIGNALS_MAX_BYTES, maxFrames = ECHO_PREVIEW_SIGNALS_MAX_FRAMES } = {}) {
  const source = checkedSignalIdentity(identity), frames = [];
  const startedAt = clock();
  let bytes = 1024, reason = "", stopped = false;
  const invalidate = value => { reason ||= String(value); };
  return {
    identity: source,
    invalidate,
    append({ songTime, signalFrames, identity: currentIdentity = source } = {}) {
      if (stopped || reason) return false;
      if (!echoPreviewSignalIdentityMatches(source, currentIdentity)) { invalidate("source-changed"); return false; }
      const elapsedMs = clock() - startedAt;
      if (!Number.isFinite(songTime) || songTime < 0 || elapsedMs < 0) { invalidate("invalid-clock"); return false; }
      const previous = frames.at(-1);
      if (previous && (songTime < previous.songTime || Math.abs((songTime - previous.songTime) * 1000 - (elapsedMs - previous.elapsedMs)) > 250)) { invalidate("transport-discontinuity"); return false; }
      if (previous && songTime === previous.songTime) return false;
      try {
        const frame = { songTime, elapsedMs, ...encodeSignalFrames(signalFrames) };
        const size = new TextEncoder().encode(JSON.stringify(frame)).length;
        if (frames.length >= Math.min(maxFrames, ECHO_PREVIEW_SIGNALS_MAX_FRAMES) || bytes + size > Math.min(maxBytes, ECHO_PREVIEW_SIGNALS_MAX_BYTES) - 1024) { invalidate("capture-budget-exceeded"); return false; }
        frames.push(frame); bytes += size;
        return true;
      } catch (error) { invalidate(error.message); return false; }
    },
    finish() {
      stopped = true;
      if (frames.length < 2) invalidate("insufficient-samples");
      return { schemaVersion: ECHO_PREVIEW_SIGNALS_SCHEMA, identity: source, status: reason ? "incomplete" : "complete", reason, interpolation: "previous-consumed-frame", frames };
    },
  };
}

export function validateEchoPreviewSignals(value, { identity } = {}) {
  if (value?.schemaVersion !== ECHO_PREVIEW_SIGNALS_SCHEMA || !["complete", "incomplete"].includes(value.status) || value.interpolation !== "previous-consumed-frame") signalCaptureError("schema");
  checkedSignalIdentity(value.identity);
  if (identity && !echoPreviewSignalIdentityMatches(identity, value.identity)) signalCaptureError("source mismatch");
  if (typeof value.reason !== "string" || value.reason.length > 4096 || (value.status === "complete" && value.reason)) signalCaptureError("status reason");
  if (!Array.isArray(value.frames) || value.frames.length > ECHO_PREVIEW_SIGNALS_MAX_FRAMES || (value.status === "complete" && value.frames.length < 2)) signalCaptureError("frame count");
  if (new TextEncoder().encode(JSON.stringify(value)).length > ECHO_PREVIEW_SIGNALS_MAX_BYTES) signalCaptureError("byte budget");
  let previous = null;
  for (const frame of value.frames) {
    if (!Number.isFinite(frame.songTime) || frame.songTime < 0 || !Number.isFinite(frame.elapsedMs) || frame.elapsedMs < 0 || (previous && (frame.songTime <= previous.songTime || frame.elapsedMs < previous.elapsedMs))) signalCaptureError("frame order");
    if (value.status === "complete" && previous && Math.abs((frame.songTime - previous.songTime) * 1000 - (frame.elapsedMs - previous.elapsedMs)) > 250) signalCaptureError("transport discontinuity");
    if (!Array.isArray(frame.buses) || !frame.buses.length || frame.buses.length > 16 || !frame.aliases || Object.keys(frame.aliases).length > 64 || !Object.hasOwn(frame.aliases, "master")) signalCaptureError("buses");
    frame.buses.forEach(bus => signalValue(bus));
    for (const [role, index] of Object.entries(frame.aliases)) if (!/^[A-Za-z0-9 _-]{1,80}$/.test(role) || !Number.isInteger(index) || index < 0 || index >= frame.buses.length) signalCaptureError("alias");
    previous = frame;
  }
  return value;
}

/** Validated once when loaded; binary search supports forward/reverse seeks.
 * Never extrapolate outside the captured interval or fall back to live input. */
export function createEchoPreviewSignalReplay(value, identity) {
  validateEchoPreviewSignals(value, { identity });
  if (value.status !== "complete") signalCaptureError("capture is incomplete: " + value.reason);
  const frames = value.frames;
  let cachedIndex = -1, cached = null;
  return {
    identity: value.identity, startSeconds: frames[0].songTime, endSeconds: frames.at(-1).songTime,
    at(songTime) {
      if (!Number.isFinite(songTime) || songTime < frames[0].songTime || songTime > frames.at(-1).songTime) return null;
      let low = 0, high = frames.length - 1;
      while (low < high) { const middle = Math.ceil((low + high) / 2); if (frames[middle].songTime <= songTime) low = middle; else high = middle - 1; }
      if (cachedIndex !== low) {
        const frame = frames[low], buses = frame.buses.map(bus => signalValue(bus, 0, true));
        cached = Object.fromEntries(Object.entries(frame.aliases).map(([role, index]) => [role, buses[index]])); cachedIndex = low;
      }
      return cached;
    },
  };
}
