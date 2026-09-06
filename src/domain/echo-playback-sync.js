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

export function planEchoPlaybackCorrection({
  expectedSeconds = 0,
  currentSeconds = 0,
  seeking = false,
  cueEntry = false,
  targetPlaybackRate = 1,
} = {}) {
  const driftSeconds = Number(expectedSeconds) - Number(currentSeconds);
  const basePlaybackRate = Math.max(0.01, Number(targetPlaybackRate) || 1);
  if (seeking) return { action: "none", driftSeconds, playbackRate: basePlaybackRate };
  if ((cueEntry && Math.abs(driftSeconds) > 1 / 30) || Math.abs(driftSeconds) > 0.75) {
    return { action: "seek", driftSeconds, targetSeconds: Math.max(0, Number(expectedSeconds)), playbackRate: basePlaybackRate };
  }
  if (Math.abs(driftSeconds) > 0.04) {
    const correction = Math.max(0.96, Math.min(1.04, 1 + driftSeconds * 0.08));
    return { action: "rate", driftSeconds, playbackRate: basePlaybackRate * correction };
  }
  return { action: "none", driftSeconds, playbackRate: basePlaybackRate };
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
