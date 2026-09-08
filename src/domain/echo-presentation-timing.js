import { echoSourceWindowPlaybackRate, mapEchoSourceWindowTime } from './echo-playback-sync.js';

export const ECHO_PRESENTATION_TIMING_VERSION = 'hapa.echo.presentation-timing.v1';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};

// Output timestamps estimate the device clock; the media-element/context anchor
// remains an estimate. Never present this as physical loopback calibration.
// https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
export function estimateEchoAudibleClock({ audio, context, nowMs, displayTimeMs = nowMs } = {}) {
  const songTime = Number(audio?.currentTime);
  const rate = Number(audio?.playbackRate) || 1;
  const playing = Boolean(audio && !audio.paused && !audio.ended && !audio.seeking);
  const base = { status: playing ? 'element-clock-only' : 'transport-discontinuity', songTime: finite(songTime) ? songTime : null,
    audibleSongTime: null, outputLagSeconds: null, physicallyCalibrated: false, playing };
  if (!playing || !finite(songTime) || !finite(nowMs) || !finite(displayTimeMs)) return base;
  const projected = songTime + (displayTimeMs - nowMs) * rate / 1000;
  base.projectedElementSongTime = projected;
  if (context?.state !== 'running' || typeof context?.getOutputTimestamp !== 'function') return base;
  let timestamp;
  try { timestamp = context.getOutputTimestamp(); } catch { return base; }
  const contextTime = Number(context.currentTime);
  if (!finite(contextTime) || !finite(timestamp?.contextTime) || !finite(timestamp?.performanceTime)
    || timestamp.contextTime <= 0 || timestamp.performanceTime <= 0
    || Math.abs(nowMs - timestamp.performanceTime) > 250) return { ...base, status: 'output-timestamp-unavailable' };
  const outputAtNow = timestamp.contextTime + (nowMs - timestamp.performanceTime) / 1000;
  const lag = contextTime - outputAtNow;
  if (lag < -0.05 || lag > 2) return { ...base, status: 'output-timestamp-unavailable' };
  return { ...base, status: 'output-timestamp-estimate', audibleSongTime: Math.max(0, projected - lag * rate),
    outputLagSeconds: lag, contextTime, outputContextTime: timestamp.contextTime, outputPerformanceTimeMs: timestamp.performanceTime };
}

export function measureEchoPresentedFrame({ audio, context, video, shot = {}, nowMs, metadata = null } = {}) {
  const hasFrame = finite(metadata?.mediaTime) && finite(metadata?.expectedDisplayTime);
  const displayTimeMs = hasFrame ? metadata.expectedDisplayTime : nowMs;
  const clock = estimateEchoAudibleClock({ audio, context, nowMs, displayTimeMs });
  const mediaTime = hasFrame ? metadata.mediaTime : Number(video?.currentTime);
  const contract = shot.media_contract || shot.mediaContract || {};
  const start = Number(shot.start_sec ?? shot.startSeconds) || 0;
  const end = Number(shot.end_sec ?? shot.endSeconds);
  const options = { durationSeconds: Number(video?.duration), sourceInSeconds: contract.sourceInSeconds ?? contract.source_in_seconds,
    sourceOutSeconds: contract.sourceOutSeconds ?? contract.source_out_seconds, cueDurationSeconds: end - start,
    timeMapping: contract.timeMapping || contract.time_mapping, loop: false };
  const sourceRate = echoSourceWindowPlaybackRate(options);
  const at = time => finite(time) ? mapEchoSourceWindowTime({ ...options, elapsedSeconds: time - start }) : null;
  const expected = at(clock.projectedElementSongTime);
  const audibleExpected = at(clock.audibleSongTime);
  const eligible = clock.playing && !video?.seeking && finite(mediaTime) && finite(end)
    && clock.songTime >= start && clock.songTime < end;
  return { version: ECHO_PRESENTATION_TIMING_VERSION, route: hasFrame ? 'decoded-frame-callback' : 'element-time-fallback',
    eligible, mediaId: String(shot.media_id || ''), cueStartSeconds: start, cueEndSeconds: end, mediaTime,
    elementMediaTime: Number(video?.currentTime), mediaReadyState: Number(video?.readyState),
    sourceInSeconds: Number(options.sourceInSeconds) || 0, sourceOutSeconds: Number(options.sourceOutSeconds),
    nowMs, expectedDisplayTimeMs: hasFrame ? displayTimeMs : null,
    presentationTimeMs: finite(metadata?.presentationTime) ? metadata.presentationTime : null,
    presentedFrames: finite(metadata?.presentedFrames) ? metadata.presentedFrames : null,
    decodeProcessingMs: finite(metadata?.processingDuration) ? metadata.processingDuration * 1000 : null,
    callbackLateMs: hasFrame ? Math.max(0, nowMs - displayTimeMs) : null,
    sourceRate, clock, expectedSourceTime: expected, audibleExpectedSourceTime: audibleExpected,
    elementResidualMs: eligible && finite(expected) ? (mediaTime - expected) / sourceRate * 1000 : null,
    audibleEstimateResidualMs: eligible && hasFrame && finite(audibleExpected) ? (mediaTime - audibleExpected) / sourceRate * 1000 : null,
    truth: 'Browser presentation metadata and estimated audio-device clock; no physical AV calibration' };
}

export function createEchoPresentationTimingRecorder({ capacity = 256 } = {}) {
  const limit = Math.max(16, Math.min(2048, Math.floor(Number(capacity) || 256)));
  const ring = new Array(limit);
  let next = 0, length = 0, total = 0;
  // A fixed histogram retains whole-session evidence without storing every frame.
  // The last bin is overflow; never turn unbounded residuals into a passing p95.
  const residualBins = new Float64Array(2002);
  let sessionDecoded = 0, sessionAudible = 0, sessionFallback = 0, sessionIneligible = 0;
  const cueLimit = 512, worstLimit = 16;
  const cues = new Map(), worst = [];
  let cueOverflowSamples = 0;
  const recordCue = sample => {
    const mediaId = String(sample.mediaId || '').slice(0, 256);
    const start = finite(sample.cueStartSeconds) ? sample.cueStartSeconds : null;
    const end = finite(sample.cueEndSeconds) ? sample.cueEndSeconds : null;
    const key = JSON.stringify([mediaId, start, end]);
    let cue = cues.get(key);
    if (!cue && cues.size < cueLimit) {
      cue = { mediaId, startSeconds: start, endSeconds: end, decodedSamples: 0, audibleEstimatedSamples: 0,
        firstObservedSongTime: null, lastObservedSongTime: null, maximumAbsoluteResidualMs: null, overFrameBudgetSamples: 0 };
      cues.set(key, cue);
    }
    if (!cue) cueOverflowSamples++;
    else {
      cue.decodedSamples++;
      const time = sample.clock?.songTime;
      if (finite(time)) {
        cue.firstObservedSongTime = cue.firstObservedSongTime === null ? time : Math.min(time, cue.firstObservedSongTime);
        cue.lastObservedSongTime = cue.lastObservedSongTime === null ? time : Math.max(time, cue.lastObservedSongTime);
      }
    }
    const residual = sample.audibleEstimateResidualMs;
    if (!finite(residual)) return;
    if (cue) {
      cue.audibleEstimatedSamples++;
      cue.maximumAbsoluteResidualMs = Math.max(cue.maximumAbsoluteResidualMs || 0, Math.abs(residual));
      if (Math.abs(residual) > 1000 / 30) cue.overFrameBudgetSamples++;
    }
    if (worst.length >= worstLimit && Math.abs(residual) <= Math.abs(worst.at(-1).residualMs)) return;
    worst.push({ mediaId, cueStartSeconds: start, cueEndSeconds: end, residualMs: residual,
      songTime: sample.clock?.songTime, audibleSongTime: sample.clock?.audibleSongTime,
      outputLagSeconds: sample.clock?.outputLagSeconds, mediaTime: sample.mediaTime, elementMediaTime: sample.elementMediaTime,
      expectedSourceTime: sample.expectedSourceTime, audibleExpectedSourceTime: sample.audibleExpectedSourceTime,
      sourceRate: sample.sourceRate, sourceInSeconds: sample.sourceInSeconds, sourceOutSeconds: sample.sourceOutSeconds,
      nowMs: sample.nowMs, expectedDisplayTimeMs: sample.expectedDisplayTimeMs, callbackLateMs: sample.callbackLateMs,
      mediaReadyState: sample.mediaReadyState, presentedFrames: sample.presentedFrames });
    worst.sort((a, b) => Math.abs(b.residualMs) - Math.abs(a.residualMs));
    if (worst.length > worstLimit) worst.pop();
  };
  const sessionSummary = () => {
    let cumulative = 0, p95UpperBoundMs = null;
    for (let bin = 0; sessionAudible > 0 && bin < residualBins.length; bin++) {
      cumulative += residualBins[bin];
      if (cumulative >= Math.ceil(sessionAudible * .95)) { p95UpperBoundMs = bin === 2001 ? null : bin; break; }
    }
    return { scope: 'All observations since explicit recorder reset', decodedSamples: sessionDecoded,
      audibleEstimatedSamples: sessionAudible, fallbackSamples: sessionFallback, ineligibleSamples: sessionIneligible,
      absoluteResidualP95UpperBoundMs: p95UpperBoundMs, overflowSamples: residualBins[2001],
      binWidthMs: 1, cueLimit, cueOverflowSamples, cueObservations: [...cues.values()].map(cue => ({ ...cue })),
      worstLimit, worstObservations: worst.map(sample => ({ ...sample })), physicallyCalibrated: false };
  };
  return {
    record(sample) {
      ring[next] = sample; next = (next + 1) % limit; length = Math.min(limit, length + 1); total += 1;
      if (!sample.eligible) { sessionIneligible++; return; }
      if (sample.route !== 'decoded-frame-callback') { sessionFallback++; return; }
      sessionDecoded++;
      recordCue(sample);
      if (finite(sample.audibleEstimateResidualMs)) {
        sessionAudible++;
        residualBins[Math.min(2001, Math.ceil(Math.abs(sample.audibleEstimateResidualMs)))]++;
      }
    },
    reset() { ring.fill(undefined); residualBins.fill(0); cues.clear(); worst.length = 0; cueOverflowSamples = 0; next = 0; length = 0; total = 0; sessionDecoded = 0; sessionAudible = 0; sessionFallback = 0; sessionIneligible = 0; },
    snapshot() {
      const samples = Array.from({ length }, (_, index) => ring[(next - length + index + limit) % limit]);
      const eligible = samples.filter(sample => sample.eligible && sample.route === 'decoded-frame-callback');
      const residuals = eligible.map(sample => sample.audibleEstimateResidualMs).filter(finite).map(Math.abs);
      return { version: ECHO_PRESENTATION_TIMING_VERSION, capacity: limit, retained: length, total,
        session: sessionSummary(), decodedSamples: eligible.length, audibleEstimatedSamples: residuals.length,
        audibleEstimateAbsoluteResidualP95Ms: percentile(residuals, .95),
        elementAbsoluteResidualP95Ms: percentile(eligible.map(sample => sample.elementResidualMs).filter(finite).map(Math.abs), .95),
        callbackLateP95Ms: percentile(eligible.map(sample => sample.callbackLateMs).filter(finite), .95),
        decodeProcessingP95Ms: percentile(eligible.map(sample => sample.decodeProcessingMs).filter(finite), .95),
        physicallyCalibrated: false, scope: 'Bounded recent active-video samples; excludes paused/seeking samples and fallback from decoded-frame metrics', samples };
    },
  };
}

export function observeEchoPresentedFrames({ video, getContext, onSample, requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame, now = () => performance.now() } = {}) {
  let stopped = false, token = null;
  const decoded = typeof video?.requestVideoFrameCallback === 'function';
  const schedule = () => { token = decoded ? video.requestVideoFrameCallback(tick) : requestFrame(tick); };
  const tick = (timestamp, metadata) => {
    token = null;
    if (stopped) return;
    onSample(measureEchoPresentedFrame({ ...getContext(), video, nowMs: finite(timestamp) ? timestamp : now(), metadata: decoded ? metadata : null }));
    if (!stopped) schedule();
  };
  schedule();
  return () => { stopped = true; if (token !== null) { if (decoded) video.cancelVideoFrameCallback?.(token); else cancelFrame(token); } token = null; };
}


// This owner measures synchronous compositor work, not GPU completion, decoded
// video drops or physical presentation. Histograms stay fixed for a long song.
export function createEchoCompositeCadence({ fps = 30 } = {}) {
  const frameRate = Math.max(1, Math.min(120, Number(fps) || 30));
  const budgetMs = 1000 / frameRate;
  const workBins = new Float64Array(2002);
  let previous = null, startedMs = null;
  let callbacks = 0, paints = 0, duplicateCallbacks = 0, idleCallbacks = 0;
  let overBudget = 0, totalWorkMs = 0, maximumWorkMs = 0;
  return {
    begin({ nowMs, songTime, playing, cadenceEnabled = true, surface, width, height }) {
      callbacks++;
      const frame = Math.floor(Math.max(0, songTime) * frameRate + 1e-7);
      const sameSurface = previous && previous.surface === surface && previous.width === width && previous.height === height;
      const sameMode = previous && previous.playing === playing && previous.cadenceEnabled === cadenceEnabled;
      if (cadenceEnabled && sameSurface && sameMode) {
        // A stalled audio clock must still expose completed preparation.
        if (playing && previous.frame === frame && nowMs - previous.nowMs < 250) { duplicateCallbacks++; return false; }
        // A paused position still needs new pixels after async shader/media
        // preparation. Refresh at output cadence; a seek/resize paints now.
        if (!playing && previous.songTime === songTime && nowMs - previous.nowMs < budgetMs - 1e-6) {
          idleCallbacks++; return false;
        }
      }
      previous = { frame, songTime, playing, cadenceEnabled, surface, width, height, nowMs };
      startedMs = nowMs;
      return true;
    },
    end(nowMs) {
      if (startedMs === null) return;
      const workMs = Math.max(0, nowMs - startedMs);
      startedMs = null;
      paints++; totalWorkMs += workMs; maximumWorkMs = Math.max(maximumWorkMs, workMs);
      if (workMs > budgetMs) overBudget++;
      workBins[Math.min(2001, Math.ceil(workMs))]++;
    },
    snapshot() {
      let count = 0, p95UpperBoundMs = null;
      for (let i = 0; paints && i < workBins.length; i++) {
        count += workBins[i];
        if (count >= Math.ceil(paints * .95)) { p95UpperBoundMs = i === 2001 ? null : i; break; }
      }
      return { version: 'hapa.echo.composite-cadence.v1', fps: frameRate, budgetMs,
        callbacks, paints, duplicateCallbacks, idleCallbacks, totalWorkMs, maximumWorkMs,
        meanWorkMs: paints ? totalWorkMs / paints : null, p95UpperBoundMs,
        workOverBudget: overBudget, overflowSamples: workBins[2001], histogramBytes: workBins.byteLength,
        scope: 'Synchronous main-canvas work in this mounted compositor; excludes GPU completion, media decode and observer overhead',
        skippedCallbackMeaning: 'Redundant or paused callbacks; not dropped output frames',
        livePolicy: 'Live-jam and legacy rendering keep their original cadence' };
    },
  };
}
