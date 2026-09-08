export const ECHO_TRANSITION_TIME_MAPPING_SCHEMA = "hapa.echo.transition-time-map.v1";
export const ECHO_TRANSITION_TIME_MAPPING_MODE = "fit-source-once-to-cue";
export const ECHO_TRANSITION_TIME_MAPPING_MAX_PLAYBACK_RATE = 5;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function optionalFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizedMode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function approximatelyEqual(left, right, tolerance = 0.001) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

export function normalizeEchoTransitionTimeMapping(value = {}, fallback = {}) {
  const source = object(value);
  const schemaVersion = String(source.schemaVersion || source.schema_version || "").trim();
  if (schemaVersion !== ECHO_TRANSITION_TIME_MAPPING_SCHEMA) return null;
  const mode = normalizedMode(source.mode || source.mappingMode || source.mapping_mode);
  if (mode !== ECHO_TRANSITION_TIME_MAPPING_MODE) return null;

  const fallbackSourceIn = Math.max(0, optionalFinite(
    fallback.sourceInSeconds,
    fallback.source_in_seconds,
  ) ?? 0);
  const fallbackSourceOut = optionalFinite(
    fallback.sourceOutSeconds,
    fallback.source_out_seconds,
  );
  const fallbackCueDuration = optionalFinite(
    fallback.cueDurationSeconds,
    fallback.cue_duration_seconds,
    fallback.durationSeconds,
    fallback.duration_seconds,
  );
  const sourceInSeconds = Math.max(0, optionalFinite(
    source.sourceInSeconds,
    source.source_in_seconds,
    fallbackSourceIn,
  ) ?? 0);
  const sourceOutSeconds = optionalFinite(
    source.sourceOutSeconds,
    source.source_out_seconds,
    fallbackSourceOut,
  );
  const cueDurationSeconds = optionalFinite(
    source.cueDurationSeconds,
    source.cue_duration_seconds,
    fallbackCueDuration,
  );
  if (!(sourceOutSeconds > sourceInSeconds) || !(cueDurationSeconds > 0)) return null;

  if (fallbackSourceOut !== null && (
    !approximatelyEqual(sourceInSeconds, fallbackSourceIn)
    || !approximatelyEqual(sourceOutSeconds, fallbackSourceOut)
  )) return null;
  if (fallbackCueDuration !== null && !approximatelyEqual(cueDurationSeconds, fallbackCueDuration)) return null;

  const sourceDurationSeconds = sourceOutSeconds - sourceInSeconds;
  const outputFps = optionalFinite(source.outputFps, source.output_fps) || 30;
  const declaredCueSampleSpanSeconds = optionalFinite(
    source.cueSampleSpanSeconds,
    source.cue_sample_span_seconds,
  );
  const expectedCueSampleSpanSeconds = cueDurationSeconds - (1 / outputFps);
  if (!(declaredCueSampleSpanSeconds > 0)
    || !approximatelyEqual(declaredCueSampleSpanSeconds, expectedCueSampleSpanSeconds)) return null;
  const cueSampleSpanSeconds = expectedCueSampleSpanSeconds;
  const rawPlaybackRate = sourceDurationSeconds / cueSampleSpanSeconds;
  // Subtracting absolute cue boundaries can put an exact 5x map a few ULPs
  // above its limit. Retain the limit without rejecting that authored map.
  const playbackRate = rawPlaybackRate <= ECHO_TRANSITION_TIME_MAPPING_MAX_PLAYBACK_RATE + 1e-9
    ? Math.min(rawPlaybackRate, ECHO_TRANSITION_TIME_MAPPING_MAX_PLAYBACK_RATE) : rawPlaybackRate;
  const declaredSourceDuration = optionalFinite(
    source.sourceDurationSeconds,
    source.source_duration_seconds,
  );
  const declaredPlaybackRate = optionalFinite(source.playbackRate, source.playback_rate);
  if (declaredSourceDuration !== null && !approximatelyEqual(declaredSourceDuration, sourceDurationSeconds)) return null;
  if (declaredPlaybackRate !== null && !approximatelyEqual(declaredPlaybackRate, playbackRate)) return null;
  if (source.valid !== true || !(playbackRate > 0) || playbackRate > ECHO_TRANSITION_TIME_MAPPING_MAX_PLAYBACK_RATE) return null;
  if (source.reachesDeclaredLastFrame !== true && source.reaches_declared_last_frame !== true) return null;

  return {
    schemaVersion: ECHO_TRANSITION_TIME_MAPPING_SCHEMA,
    mode: ECHO_TRANSITION_TIME_MAPPING_MODE,
    sourceInSeconds,
    sourceOutSeconds,
    sourceDurationSeconds,
    cueDurationSeconds,
    cueSampleSpanSeconds,
    outputFps,
    playbackRate,
    valid: true,
    reachesDeclaredLastFrame: true,
  };
}

export function echoSourceWindowPlaybackRate({
  timeMapping = null,
  sourceInSeconds = 0,
  sourceOutSeconds = null,
  cueDurationSeconds = 0,
} = {}) {
  return normalizeEchoTransitionTimeMapping(timeMapping, {
    sourceInSeconds,
    sourceOutSeconds,
    cueDurationSeconds,
  })?.playbackRate || 1;
}

// Presentation feedback is optional: unsupported, stale or discontinuous
// observations retain the explicit element-clock path. The caller binds the
// sample to the current element and exact cue identity before supplying it.
export function echoDecodedPlaybackPhase(sample, { nowMs, targetPlaybackRate = 1 } = {}) {
  if (sample?.eligible !== true || sample.route !== "decoded-frame-callback"
    || sample.clock?.playing !== true || sample.clock?.status !== "output-timestamp-estimate"
    || ![nowMs, sample.nowMs, sample.expectedDisplayTimeMs, sample.mediaTime, sample.audibleExpectedSourceTime, sample.sourceRate].every(Number.isFinite)
    || nowMs < sample.nowMs || nowMs - sample.nowMs > 100
    || Math.abs(sample.expectedDisplayTimeMs - sample.nowMs) > 100
    || Math.abs(sample.sourceRate - targetPlaybackRate) > 1e-6) return null;
  return (sample.audibleExpectedSourceTime - sample.mediaTime) / sample.sourceRate;
}

export function planEchoPlaybackCorrection({
  expectedSeconds = 0,
  currentSeconds = 0,
  seeking = false,
  cueEntry = false,
  targetPlaybackRate = 1,
  presentedSample = null,
  nowMs = null,
  minimumSeconds = 0,
  maximumSeconds = Infinity,
} = {}) {
  const basePlaybackRate = Math.max(0.01, Number(targetPlaybackRate) || 1);
  const phase = seeking ? null : echoDecodedPlaybackPhase(presentedSample, { nowMs, targetPlaybackRate: basePlaybackRate });
  const route = phase === null ? "element-clock" : "decoded-presentation";
  const songDriftSeconds = phase ?? (Number(expectedSeconds) - Number(currentSeconds)) / basePlaybackRate;
  const driftSeconds = songDriftSeconds * basePlaybackRate;
  const state = { route, driftSeconds, songDriftSeconds };
  if (seeking) return { ...state, action: "none", playbackRate: basePlaybackRate };
  if ((cueEntry && Math.abs(songDriftSeconds) > 1 / 30) || Math.abs(songDriftSeconds) > 0.75) {
    // Apply the observed phase displacement to the current element position;
    // seeking to the element target alone would discard measured decode lag.
    return { ...state, action: "seek", targetSeconds: Math.max(minimumSeconds, Math.min(maximumSeconds, phase === null ? Number(expectedSeconds) : Number(currentSeconds) + driftSeconds)), playbackRate: basePlaybackRate };
  }
  const deadband = phase === null ? 1 / 60 : 1 / 240;
  if (Math.abs(songDriftSeconds) > deadband) {
    const correction = Math.max(0.96, Math.min(1.04, 1 + songDriftSeconds * (phase === null ? 1 : 3)));
    return { ...state, action: "rate", playbackRate: basePlaybackRate * correction };
  }
  return { ...state, action: "none", playbackRate: basePlaybackRate };
}

export function mapEchoSourceTime({ elapsedSeconds = 0, durationSeconds = 0, loop = true, endGuardSeconds = 0.06 } = {}) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  if (!duration) return elapsed;
  const guard = Math.min(Math.max(0.01, Number(endGuardSeconds) || 0.06), Math.max(0.01, duration / 4));
  const playableEnd = Math.max(0, duration - guard);
  if (!loop) return Math.min(playableEnd, elapsed);
  if (elapsed < playableEnd) return elapsed;
  return playableEnd > 0 ? elapsed % playableEnd : 0;
}

export function mapEchoSourceWindowTime({
  elapsedSeconds = 0,
  durationSeconds = 0,
  sourceInSeconds = 0,
  sourceOutSeconds = null,
  loop = true,
  endGuardSeconds = 0.06,
  cueDurationSeconds = 0,
  timeMapping = null,
} = {}) {
  const mediaDuration = Math.max(0, Number(durationSeconds) || 0);
  const sourceStart = Math.min(mediaDuration || Infinity, Math.max(0, Number(sourceInSeconds) || 0));
  const declaredSourceEnd = Number(sourceOutSeconds);
  const sourceEnd = Number.isFinite(declaredSourceEnd) && declaredSourceEnd > sourceStart
    ? Math.min(mediaDuration || declaredSourceEnd, declaredSourceEnd)
    : mediaDuration;
  const sourceDuration = Math.max(0, sourceEnd - sourceStart);
  if (!sourceDuration) return sourceStart;
  const normalizedTimeMapping = normalizeEchoTransitionTimeMapping(timeMapping, {
    sourceInSeconds: sourceStart,
    sourceOutSeconds: sourceEnd,
    cueDurationSeconds,
  });
  if (normalizedTimeMapping) {
    const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
    const progress = Math.max(0, Math.min(1, elapsed / normalizedTimeMapping.cueSampleSpanSeconds));
    return sourceStart + (sourceDuration * progress);
  }
  return sourceStart + mapEchoSourceTime({
    elapsedSeconds,
    durationSeconds: sourceDuration,
    loop,
    endGuardSeconds,
  });
}

// Share the mapper's reachable terminal sample instead of a second end tolerance.
// Unknown/empty windows cannot establish an end. A reverse seek releases the hold.
export function echoSourceWindowAtEnd(options = {}) {
  const start = mapEchoSourceWindowTime({ ...options, elapsedSeconds: 0, loop: false });
  const end = mapEchoSourceWindowTime({ ...options, elapsedSeconds: Number.MAX_VALUE, loop: false });
  return end > start && mapEchoSourceWindowTime({ ...options, loop: false }) >= end - 1e-7;
}
