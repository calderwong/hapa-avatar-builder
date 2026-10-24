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

// score/timeline/audioUri let devices without Atlas access (phone guests) render the host's exact score.
const SESSION_KEYS = ["songId", "runId", "audioIdentity", "scoreFingerprint", "direction", "playSettings", "durationSeconds", "state", "positionSeconds", "title", "score", "timeline", "audioUri"];

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
  if (input.audioUri !== undefined && input.audioUri !== null && (typeof input.audioUri !== "string" || !/^\/[A-Za-z0-9/_.~%-]{1,512}$/.test(input.audioUri) || input.audioUri.includes(".."))) errors.push("audioUri must be a same-origin path.");
  if (partial && !Number.isSafeInteger(input.baseRevision)) errors.push("baseRevision required for updates.");
  return { ok: errors.length === 0, errors };
}
