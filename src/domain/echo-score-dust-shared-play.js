// Shared Score Dust listening. Peers share timing and decisions, never video:
// each renders locally from the same audio identity, score (direction),
// seed and schedule. Clock discipline follows the research's room-clock
// method: offset = ((serverReceive − clientSend) + (serverSend − clientReceive)) / 2,
// prefer the lowest-delay sample, refresh periodically, and correct drift by
// seeking when the error exceeds 250 ms. Matching cues and formations is the
// reproducibility goal; identical floating-point trajectories are not claimed.

export const ECHO_SCORE_DUST_SESSION_SCHEMA = "hapa.echo.score-dust.session.v1";
export const SHARED_PLAY_DRIFT_TOLERANCE_SECONDS = 0.25;
export const SHARED_PLAY_CHECK_INTERVAL_MS = 2000;
export const SHARED_PLAY_CLOCK_REFRESH_MS = 10 * 60 * 1000;

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** One request's timing sample → offset (server − client) and network delay. */
export function clockSample({ clientSendMs, clientReceiveMs, serverReceiveMs = null, serverSendMs }) {
  if (![clientSendMs, clientReceiveMs, serverSendMs].every(finite) || clientReceiveMs < clientSendMs) return null;
  if (finite(serverReceiveMs) && serverSendMs >= serverReceiveMs) {
    return { offsetMs: ((serverReceiveMs - clientSendMs) + (serverSendMs - clientReceiveMs)) / 2, delayMs: (clientReceiveMs - clientSendMs) - (serverSendMs - serverReceiveMs), method: "four-timestamp" };
  }
  // Without a server receive time, assume the reply left at the round-trip midpoint.
  return { offsetMs: serverSendMs - (clientSendMs + clientReceiveMs) / 2, delayMs: clientReceiveMs - clientSendMs, method: "midpoint" };
}

/** Keep the lowest-delay estimate; samples older than the refresh window are dropped. */
export function createRoomClock({ now = () => Date.now(), refreshMs = SHARED_PLAY_CLOCK_REFRESH_MS, keep = 8 } = {}) {
  let samples = [];
  return {
    add(sample) {
      const value = clockSample(sample);
      if (!value) return null;
      samples = [...samples, { ...value, at: now() }].filter((s) => now() - s.at <= refreshMs).sort((a, b) => a.delayMs - b.delayMs).slice(0, keep);
      return value;
    },
    get offsetMs() { return samples[0]?.offsetMs ?? null; },
    get delayMs() { return samples[0]?.delayMs ?? null; },
    get ready() { return samples.length > 0; },
    get needsRefresh() { return !samples.length || now() - Math.max(...samples.map((s) => s.at)) > refreshMs; },
    roomNowMs(clientNowMs = now()) { return samples.length ? clientNowMs + samples[0].offsetMs : null; },
    samples: () => samples.map((s) => ({ ...s })),
  };
}

/** Where the shared song should be at a room time. */
export function sessionPositionAt(session, roomNowMs) {
  if (!session) return null;
  if (session.state !== "playing" || !finite(session.startedAtRoomMs)) return session.positionSeconds ?? 0;
  const position = session.positionSeconds + (roomNowMs - session.startedAtRoomMs) / 1000;
  return finite(session.durationSeconds) ? Math.min(session.durationSeconds, Math.max(0, position)) : Math.max(0, position);
}

/**
 * Drift policy: seek only when playing, the error exceeds the tolerance and
 * the target is still inside the song. Output latency is added to the target.
 */
export function sharedPlayCorrection({ session, roomNowMs, actualSeconds, playing, outputLatencySeconds = 0 }) {
  const target = sessionPositionAt(session, roomNowMs);
  if (target === null) return { action: "none", reason: "no-session" };
  const wantPlaying = session.state === "playing";
  if (wantPlaying !== Boolean(playing)) return { action: wantPlaying ? "play" : "pause", to: target + (wantPlaying ? outputLatencySeconds : 0), reason: "state" };
  if (!wantPlaying) return Math.abs(actualSeconds - target) > SHARED_PLAY_DRIFT_TOLERANCE_SECONDS ? { action: "seek", to: target, reason: "paused-position" } : { action: "none", reason: "aligned" };
  const aimed = target + outputLatencySeconds, error = actualSeconds - aimed;
  if (finite(session.durationSeconds) && aimed >= session.durationSeconds) return { action: "none", reason: "past-end" };
  return Math.abs(error) > SHARED_PLAY_DRIFT_TOLERANCE_SECONDS ? { action: "seek", to: aimed, errorSeconds: error, reason: "drift" } : { action: "none", errorSeconds: error, reason: "within-tolerance" };
}

/**
 * Host publishing: what changed since the last change the room accepted.
 * `last` advances only after the room accepts (`next`), so a refused update
 * (another revision landed first) is detected and sent again.
 */
export function hostPublishPlan({ last, now, playing, position, fingerprint = null, owner = true }) {
  if (!last) return null;
  const expected = last.playing ? last.position + (now - last.at) / 1000 : last.position;
  const scoreChanged = Boolean(fingerprint && fingerprint !== last.fingerprint);
  const playChanged = Boolean(owner) && (Boolean(playing) !== Boolean(last.playing) || Math.abs(position - expected) > 1);
  if (!scoreChanged && !playChanged) return null;
  return { scoreChanged, playChanged, next: { playing: Boolean(playing), at: now, position, fingerprint } };
}

export const SCORE_DUST_AUDIO_SOURCE_KINDS = Object.freeze(["atlas-master", "playback"]);
const SAFE_SOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The song audio a guest device may play, as something the Builder resolves
 * itself (never a URL it proxies): the Atlas master of a run, or a prepared
 * playback job. Anything else (a blob: URL, another origin) shares no audio;
 * the session still works and guests watch without sound.
 */
export function scoreDustAudioSource(url, origin = globalThis.location?.origin || "http://localhost") {
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url, origin); } catch { return null; }
  if (parsed.protocol === "blob:" || parsed.origin !== new URL(origin).origin) return null;
  const atlas = parsed.pathname.match(/^\/api\/echos\/audio-atlas\/jobs\/([A-Za-z0-9_-]{1,128})\/audio\/master$/);
  if (atlas) return { kind: "atlas-master", runId: atlas[1] };
  const jobId = parsed.pathname === "/api/echos/playback-audio" ? parsed.searchParams.get("jobId") : null;
  return jobId && SAFE_SOURCE_ID.test(jobId) ? { kind: "playback", jobId } : null;
}

function validAudioSource(source) {
  if (source === null) return true;
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (source.kind === "atlas-master") return Object.keys(source).length === 2 && SAFE_SOURCE_ID.test(String(source.runId || ""));
  if (source.kind === "playback") return Object.keys(source).length === 2 && SAFE_SOURCE_ID.test(String(source.jobId || ""));
  return false;
}

// score/timeline/audioSource let devices without Atlas access (phone guests) render the host's exact score.
const SESSION_KEYS = ["songId", "runId", "audioIdentity", "scoreFingerprint", "direction", "playSettings", "durationSeconds", "state", "positionSeconds", "title", "score", "timeline", "audioSource"];

/** Validate a create/update request. Peers rebuild the same score from the direction. */
export function validateSharedPlayInput(input, { partial = false } = {}) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["Session input must be an object."] };
  for (const key of Object.keys(input)) if (![...SESSION_KEYS, "baseRevision"].includes(key)) errors.push(`Unknown session field ${key}.`);
  if (!partial || input.songId !== undefined) if (typeof input.songId !== "string" || !input.songId) errors.push("songId required.");
  if (input.state !== undefined && !["playing", "paused"].includes(input.state)) errors.push("state must be playing or paused.");
  if (input.positionSeconds !== undefined && (!finite(input.positionSeconds) || input.positionSeconds < 0)) errors.push("positionSeconds must be ≥ 0.");
  if (input.durationSeconds !== undefined && input.durationSeconds !== null && (!finite(input.durationSeconds) || input.durationSeconds <= 0)) errors.push("durationSeconds must be positive.");
  if (input.direction !== undefined && (typeof input.direction !== "object" || Array.isArray(input.direction) || JSON.stringify(input.direction).length > 64 * 1024)) errors.push("direction must be an object under 64 KiB.");
  if (input.score !== undefined && input.score !== null && (typeof input.score !== "object" || Array.isArray(input.score) || JSON.stringify(input.score).length > 1024 * 1024)) errors.push("score must be an object under 1 MiB.");
  if (input.timeline !== undefined && input.timeline !== null && (typeof input.timeline !== "object" || Array.isArray(input.timeline) || JSON.stringify(input.timeline).length > 2 * 1024 * 1024)) errors.push("timeline must be an object under 2 MiB.");
  if (input.audioSource !== undefined && !validAudioSource(input.audioSource)) errors.push("audioSource must be null, {kind:\"atlas-master\", runId} or {kind:\"playback\", jobId}.");
  if (partial && !Number.isSafeInteger(input.baseRevision)) errors.push("baseRevision required for updates.");
  return { ok: errors.length === 0, errors };
}
