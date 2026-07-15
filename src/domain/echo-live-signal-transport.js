import {
  STEM_TELEMETRY_ABSOLUTE_ACTIVITY_FLOOR,
  stemTelemetrySignalValue,
} from "./stem-telemetry-signal-semantics.js";

export const ECHO_STEM_MAX_CLOCK_DRIFT_SECONDS = 0.12;
export const ECHO_STEM_SIGNAL_HEALTH_WINDOW_SECONDS = 0.75;
export const ECHO_STEM_SIGNAL_MINIMUM_SAMPLES = 3;
export const ECHO_STEM_DECODER_RETRY_BASE_DELAY_MS = 500;
export const ECHO_STEM_DECODER_RETRY_MAX_DELAY_MS = 8_000;
export const ECHO_STEM_DECODER_RETRY_MAX_ATTEMPTS = 5;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value, min)));
const round = (value, digits = 9) => {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
};

function percentile(values = [], quantile = 0.99, fallback = 1) {
  const finiteValues = values.map(Number).filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
  if (!finiteValues.length) return fallback;
  const index = Math.max(0, Math.min(finiteValues.length - 1, Math.ceil((finiteValues.length - 1) * quantile)));
  return Math.max(1e-12, finiteValues[index]);
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function nextEchoStemDecoderRetryState(resource = {}, nowMs = Date.now(), {
  baseDelayMs = ECHO_STEM_DECODER_RETRY_BASE_DELAY_MS,
  maxDelayMs = ECHO_STEM_DECODER_RETRY_MAX_DELAY_MS,
  maxAttempts = ECHO_STEM_DECODER_RETRY_MAX_ATTEMPTS,
} = {}) {
  const failureCount = Math.max(0, Math.floor(finite(resource?.failureCount))) + 1;
  const retryDelayMs = Math.min(
    Math.max(0, finite(maxDelayMs, ECHO_STEM_DECODER_RETRY_MAX_DELAY_MS)),
    Math.max(0, finite(baseDelayMs, ECHO_STEM_DECODER_RETRY_BASE_DELAY_MS)) * (2 ** Math.max(0, failureCount - 1)),
  );
  const retryExhausted = failureCount >= Math.max(1, Math.floor(finite(maxAttempts, ECHO_STEM_DECODER_RETRY_MAX_ATTEMPTS)));
  return {
    failureCount,
    retryDelayMs,
    nextRetryAtMs: retryExhausted ? null : finite(nowMs) + retryDelayMs,
    retryExhausted,
  };
}

export function echoStemDecoderRetryDue(resource = {}, nowMs = Date.now()) {
  if (!resource || resource.retryExhausted === true || resource.nextRetryAtMs == null) return false;
  return finite(nowMs) + 1e-9 >= finite(resource.nextRetryAtMs, Number.POSITIVE_INFINITY);
}

function offlineExpectedActivityWindow(evidence = {}) {
  const source = String(evidence?.source || evidence?.truthStatus || evidence?.truth_status || evidence?.schemaVersion || "").toLowerCase();
  if (!source.includes("offline")) return null;
  if (evidence?.expectedActive !== true && evidence?.expected_active !== true) return null;
  const start = Number(evidence.startSeconds ?? evidence.start_seconds);
  const end = Number(evidence.endSeconds ?? evidence.end_seconds);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return { start, end };
  const at = Number(evidence.atSeconds ?? evidence.at_seconds ?? evidence.timestampSeconds ?? evidence.timestamp_seconds);
  const tolerance = Number(evidence.toleranceSeconds ?? evidence.tolerance_seconds ?? evidence.frameDurationSeconds ?? evidence.frame_duration_seconds);
  if (!Number.isFinite(at) || !(Number.isFinite(tolerance) && tolerance > 0)) return null;
  return { start: at - tolerance / 2, end: at + tolerance / 2 };
}

/** Only bounded offline evidence may turn live silence from a diagnostic into a transport failure. */
export function resolveEchoExpectedActivityEvidence(evidence = null, targetTimeSeconds = null) {
  const target = Number(targetTimeSeconds);
  if (!Number.isFinite(target)) return null;
  const entries = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  for (const entry of entries) {
    const window = offlineExpectedActivityWindow(entry);
    if (window && target + 1e-9 >= window.start && target < window.end) {
      return { ...entry, matchedStartSeconds: round(window.start), matchedEndSeconds: round(window.end) };
    }
  }
  return null;
}

function spectrumValues(analyser, binCount) {
  const byteFft = new Uint8Array(binCount);
  analyser?.getByteFrequencyData?.(byteFft);
  if (typeof analyser?.getFloatFrequencyData === "function") {
    const decibels = new Float32Array(binCount);
    analyser.getFloatFrequencyData(decibels);
    return {
      fft: byteFft,
      linear: Array.from(decibels, (decibel) => Number.isFinite(decibel) ? 10 ** (decibel / 20) : 0),
      encoding: "float-db-linearized",
    };
  }
  return {
    fft: byteFft,
    linear: Array.from(byteFft, (value) => Number(value) / 255),
    encoding: "byte-db-window",
  };
}

function frequencyBandAverage(linearSpectrum, sampleRate, lowerHz, upperHz) {
  if (!linearSpectrum.length || !(sampleRate > 0)) return 0;
  const nyquist = sampleRate / 2;
  const hzPerBin = nyquist / linearSpectrum.length;
  const start = Math.max(0, Math.ceil(lowerHz / hzPerBin));
  const end = Math.min(linearSpectrum.length, Math.max(start + 1, Math.ceil(Math.min(upperHz, nyquist) / hzPerBin)));
  return average(linearSpectrum.slice(start, end));
}

function waveformMeasurements(wave = []) {
  let sumSquares = 0;
  let peak = 0;
  for (const sample of wave) {
    const normalized = (Number(sample) - 128) / 128;
    sumSquares += normalized * normalized;
    peak = Math.max(peak, Math.abs(normalized));
  }
  return {
    rawRms: Math.sqrt(sumSquares / Math.max(1, wave.length)),
    rawPeak: peak,
  };
}

function recentSignalHealth(history, observedAtSeconds, windowSeconds, activityFloor) {
  const recent = history.filter((sample) => sample.observedAtSeconds >= observedAtSeconds - windowSeconds - 1e-9);
  const spanSeconds = recent.length > 1
    ? Math.max(0, recent.at(-1).observedAtSeconds - recent[0].observedAtSeconds)
    : 0;
  const exactZeroCount = recent.filter((sample) => sample.exactZero).length;
  const activeCount = recent.filter((sample) => sample.rawRms >= activityFloor || sample.rawPeak >= activityFloor).length;
  const rmsValues = recent.map((sample) => sample.rawRms);
  const warm = recent.length >= ECHO_STEM_SIGNAL_MINIMUM_SAMPLES
    && (spanSeconds >= 0.04 || recent.length >= ECHO_STEM_SIGNAL_MINIMUM_SAMPLES + 1);
  return {
    schemaVersion: "hapa.echo.live-signal-health.v1",
    warm,
    // This is diagnostic evidence, not proof of decoder failure: real stems can
    // contain rests. Transport admission only escalates it when matching bounded
    // offline expected-active evidence is supplied for this exact playhead time.
    stalled: warm && activeCount === 0,
    sampleCount: recent.length,
    spanSeconds: round(spanSeconds),
    exactZeroRatio: recent.length ? round(exactZeroCount / recent.length) : 1,
    rawActiveRatio: recent.length ? round(activeCount / recent.length) : 0,
    rawRmsRange: recent.length ? round(Math.max(...rmsValues) - Math.min(...rmsValues)) : 0,
    currentActive: Boolean(recent.at(-1) && (recent.at(-1).rawRms >= activityFloor || recent.at(-1).rawPeak >= activityFloor)),
    activityFloor,
  };
}

/**
 * Stateful live analyser sampler. Signal names and derived values deliberately
 * use the same vocabulary/formulas as offline stem telemetry: 20-250 Hz low,
 * 250-2000 Hz mid, 2000 Hz-Nyquist high, positive RMS delta onset/beat, and
 * matching energy/palette/orbit formulas. Live rolling normalization is not
 * claimed to be numerically identical to whole-song offline normalization.
 */
export function createEchoLiveSignalTracker({
  normalizationWindowSeconds = 8,
  healthWindowSeconds = ECHO_STEM_SIGNAL_HEALTH_WINDOW_SECONDS,
  activityFloor = STEM_TELEMETRY_ABSOLUTE_ACTIVITY_FLOOR,
} = {}) {
  const history = [];
  let previousNormalizedRms = null;

  return {
    reset() {
      history.splice(0, history.length);
      previousNormalizedRms = null;
    },
    sample(analyser, timeSeconds = 0, metadata = {}) {
      const binCount = Math.max(1, Number(analyser?.frequencyBinCount || 256));
      const emptyFft = new Uint8Array(binCount);
      const emptyWave = new Uint8Array(binCount);
      if (!analyser?.getByteTimeDomainData || (!analyser?.getByteFrequencyData && !analyser?.getFloatFrequencyData)) {
        return {
          ...metadata,
          status: "unavailable",
          truthStatus: "no-live-analyser",
          fft: emptyFft,
          wave: emptyWave,
          rawRms: 0,
          rawPeak: 0,
          rawBands: { low: 0, mid: 0, high: 0 },
          rms: 0,
          peak: 0,
          onset: 0,
          beat: 0,
          energy: 0,
          hook: 0,
          low: 0,
          bass: 0,
          mid: 0,
          high: 0,
          treble: 0,
          telemetryRms: 0,
          orbit: 0,
          palette: 0,
          off: 0,
          signalHealth: recentSignalHealth([], finite(metadata.observedAtSeconds, timeSeconds), healthWindowSeconds, activityFloor),
        };
      }

      const observedAtSeconds = finite(metadata.observedAtSeconds, timeSeconds);
      const sampleRate = Math.max(1, finite(metadata.sampleRate ?? analyser?.context?.sampleRate, 48_000));
      const wave = new Uint8Array(binCount);
      analyser.getByteTimeDomainData(wave);
      const spectrum = spectrumValues(analyser, binCount);
      const { rawRms, rawPeak } = waveformMeasurements(wave);
      const rawLow = frequencyBandAverage(spectrum.linear, sampleRate, 20, 250);
      const rawMid = frequencyBandAverage(spectrum.linear, sampleRate, 250, 2_000);
      const rawHigh = frequencyBandAverage(spectrum.linear, sampleRate, 2_000, sampleRate / 2);
      const maxSpectrum = Math.max(0, ...spectrum.linear);
      const exactZero = rawPeak <= 1e-12 && maxSpectrum <= 1e-12;
      history.push({ observedAtSeconds, rawRms, rawPeak, rawLow, rawMid, rawHigh, exactZero });
      const oldest = observedAtSeconds - Math.max(normalizationWindowSeconds, healthWindowSeconds) - 1e-9;
      while (history.length && history[0].observedAtSeconds < oldest) history.shift();

      const rms = clamp(rawRms / percentile(history.map((sample) => sample.rawRms)));
      const peak = clamp(rawPeak / percentile(history.map((sample) => sample.rawPeak)));
      const low = clamp(rawLow / percentile(history.map((sample) => sample.rawLow)));
      const mid = clamp(rawMid / percentile(history.map((sample) => sample.rawMid)));
      const high = clamp(rawHigh / percentile(history.map((sample) => sample.rawHigh)));
      const onsetDelta = previousNormalizedRms === null ? 0 : Math.max(0, rms - previousNormalizedRms);
      previousNormalizedRms = rms;
      history.at(-1).onsetDelta = onsetDelta;
      const onset = clamp(onsetDelta / percentile(history.map((sample) => sample.onsetDelta || 0)));
      const semanticFrame = { t: finite(timeSeconds), rms, peak, onset, low, mid, high };
      const energy = clamp(stemTelemetrySignalValue(semanticFrame, "energy"));
      const palette = clamp(stemTelemetrySignalValue(semanticFrame, "palette"));
      const orbit = clamp(stemTelemetrySignalValue(semanticFrame, "orbit"));

      return {
        ...metadata,
        status: "live",
        truthStatus: "live-analyser-vocabulary-aligned",
        fft: spectrum.fft,
        fftEncoding: spectrum.encoding,
        wave,
        sampleRate,
        observedAtSeconds,
        rawRms,
        rawPeak,
        rawBands: { low: rawLow, mid: rawMid, high: rawHigh },
        rms,
        peak,
        onset,
        beat: onset,
        energy,
        hook: Math.max(onset, energy),
        low,
        bass: low,
        mid,
        high,
        treble: high,
        telemetryRms: rms,
        orbit,
        palette,
        off: 0,
        signalHealth: recentSignalHealth(history, observedAtSeconds, healthWindowSeconds, activityFloor),
      };
    },
  };
}

export function sampleEchoLiveSignalFrame(analyser, timeSeconds = 0, metadata = {}, tracker = null) {
  const sampler = tracker && typeof tracker.sample === "function" ? tracker : createEchoLiveSignalTracker();
  return sampler.sample(analyser, timeSeconds, metadata);
}

export function evaluateEchoStemTransportHealth(resource = null, {
  playing = false,
  targetTimeSeconds = null,
  stemFrame = null,
  masterFrame = null,
  allowSilent = false,
  expectedActivity = null,
  expectedActivityEvidence = null,
  maxClockDriftSeconds = ECHO_STEM_MAX_CLOCK_DRIFT_SECONDS,
} = {}) {
  const fail = (reason, details = {}) => ({ usable: false, reason, ...details });
  if (!resource || resource.status !== "ready" || !resource.analyser) {
    return fail(resource?.fallbackReason || resource?.status || "stem-not-ready");
  }
  if (resource.playbackBlocked) return fail(resource.playbackError || "stem-decoder-playback-blocked");
  if (resource.context?.state !== "running") return fail(`stem-audio-context-${resource.context?.state || "unavailable"}`);
  if (!resource.element) return fail("stem-decoder-element-missing");
  if (resource.readyGeneration !== resource.sourceGeneration) return fail("stem-decoder-stale-generation");
  if (!resource.targetUri || resource.readyUri !== resource.targetUri) return fail("stem-decoder-stale-uri");
  if (Number(resource.element.readyState || 0) < 2) return fail("stem-decoder-frame-not-ready");
  if (resource.element.seeking) return fail("stem-decoder-seeking");
  if (playing && resource.element.paused) return fail("stem-decoder-paused-during-playback");

  const target = Number(targetTimeSeconds);
  const current = Number(resource.element.currentTime);
  const clockDriftSeconds = Number.isFinite(target) && Number.isFinite(current) ? Math.abs(current - target) : null;
  if (clockDriftSeconds !== null && clockDriftSeconds > maxClockDriftSeconds + 1e-9) {
    return fail("stem-decoder-clock-drift", { clockDriftSeconds, maxClockDriftSeconds });
  }
  if (!stemFrame || stemFrame.status !== "live") return fail("stem-analyser-frame-unavailable", { clockDriftSeconds });

  const signalHealth = stemFrame.signalHealth || {};
  const masterActive = Boolean(masterFrame?.signalHealth?.currentActive
    || Number(masterFrame?.rawRms) >= STEM_TELEMETRY_ABSOLUTE_ACTIVITY_FLOOR
    || Number(masterFrame?.rawPeak) >= STEM_TELEMETRY_ABSOLUTE_ACTIVITY_FLOOR);
  const matchedExpectedActivity = resolveEchoExpectedActivityEvidence(expectedActivityEvidence, targetTimeSeconds);
  if (!allowSilent && signalHealth.stalled === true && masterActive && matchedExpectedActivity) {
    return fail("stem-analyser-stalled-zero-signal", {
      clockDriftSeconds,
      signalHealth,
      expectedActivityEvidence: matchedExpectedActivity,
    });
  }
  const diagnostic = signalHealth.warm !== true
    ? "stem-analyser-health-warming"
    : signalHealth.stalled === true
      ? allowSilent ? "stem-analyser-intentional-silence" : "stem-analyser-sub-floor-diagnostic"
      : "";
  return {
    usable: true,
    reason: "",
    diagnostic,
    clockDriftSeconds,
    signalHealth,
    allowSilent,
    masterActive,
    expectedActivityEvidence: matchedExpectedActivity,
    legacyExpectedActivityHint: expectedActivity === true,
  };
}
