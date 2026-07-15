export const STEM_TELEMETRY_REACTIVE_SIGNALS = new Set([
  "rms", "peak", "onset", "beat", "energy",
  "low", "bass", "mid", "high", "treble",
  "palette", "orbit",
]);

export const STEM_TELEMETRY_CORE_SIGNALS = Object.freeze(["rms", "peak", "onset", "low", "mid", "high"]);
export const STEM_TELEMETRY_EVENT_DRIVEN_SIGNALS = new Set(["beat", "onset", "peak"]);
export const STEM_TELEMETRY_SIGNAL_ALIASES = Object.freeze({ beat: "onset", bass: "low", treble: "high" });
export const STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD = 1e-6;
export const STEM_TELEMETRY_EVENT_THRESHOLD = 0.01;
export const STEM_TELEMETRY_ABSOLUTE_ACTIVITY_FLOOR = 10 ** (-60 / 20);
export const STEM_TELEMETRY_CONTINUOUS_MIN_ACTIVE_RATIO = 0.25;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];

export function stemTelemetryReactiveSignal(value) {
  const normalized = text(value).toLowerCase();
  return STEM_TELEMETRY_REACTIVE_SIGNALS.has(normalized) ? normalized : "";
}

export function stemTelemetrySignalActivityClass(signals = [], fallback = "continuous") {
  const reactive = [...new Set(list(signals).map(stemTelemetryReactiveSignal).filter(Boolean))];
  return reactive.length && reactive.every((signal) => STEM_TELEMETRY_EVENT_DRIVEN_SIGNALS.has(signal))
    ? "event"
    : fallback;
}

export function stemTelemetrySignalValue(frame = {}, signal) {
  const normalized = STEM_TELEMETRY_SIGNAL_ALIASES[signal] || signal;
  const bandValue = frame?.bands?.[normalized];
  if (Number.isFinite(Number(frame?.[normalized]))) return Number(frame[normalized]);
  if (Number.isFinite(Number(bandValue))) return Number(bandValue);
  const values = {
    rms: Number(frame?.rms),
    low: Number(frame?.bands?.low ?? frame?.low),
    mid: Number(frame?.bands?.mid ?? frame?.mid),
    high: Number(frame?.bands?.high ?? frame?.high),
  };
  if (normalized === "energy" && Object.values(values).every(Number.isFinite)) {
    return (values.rms * 0.55) + (values.low * 0.2) + (values.mid * 0.15) + (values.high * 0.1);
  }
  if (normalized === "palette" && [values.low, values.mid, values.high].every(Number.isFinite)) {
    return ((values.low * 0.17) + (values.mid * 0.37) + (values.high * 0.46)) % 1;
  }
  if (normalized === "orbit" && [values.low, values.mid, values.high, Number(frame?.t)].every(Number.isFinite)) {
    const palette = ((values.low * 0.17) + (values.mid * 0.37) + (values.high * 0.46)) % 1;
    return 0.5 + (Math.sin((Number(frame.t) * 0.37) + (palette * Math.PI * 2)) * 0.5);
  }
  return null;
}

export function stemTelemetryFiniteRange(frames, signal) {
  const values = list(frames).map((frame) => stemTelemetrySignalValue(frame, signal)).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.max(...values) - Math.min(...values);
}

export function stemTelemetryRawActivityCoverage(frames = [], {
  fps,
  startSeconds = 0,
  endSeconds = 0,
  activityFloor = STEM_TELEMETRY_ABSOLUTE_ACTIVITY_FLOOR,
} = {}) {
  const durationSeconds = Math.max(0, Number(endSeconds) - Number(startSeconds));
  const cadenceSeconds = Number(fps) > 0 ? 1 / Number(fps) : null;
  const raw = list(frames).map((frame) => ({
    rms: Number(frame?.rawRms ?? frame?.rmsRaw ?? frame?.absoluteRms),
    peak: Number(frame?.rawPeak ?? frame?.peakRaw ?? frame?.absolutePeak),
  }));
  const measured = Boolean(cadenceSeconds && raw.length && raw.every(({ rms, peak }) => Number.isFinite(rms) && rms >= 0 && Number.isFinite(peak) && peak >= 0));
  const activeFrameCount = measured
    ? raw.filter(({ rms, peak }) => rms >= activityFloor || peak >= activityFloor).length
    : 0;
  const activeSeconds = measured ? Math.min(durationSeconds, activeFrameCount * cadenceSeconds) : 0;
  const activeRatio = durationSeconds > 0 ? activeSeconds / durationSeconds : 0;
  const minimumActiveFrames = durationSeconds >= Number(cadenceSeconds || 0) * 2 ? 2 : 1;
  return {
    measured,
    activityFloor,
    durationSeconds,
    cadenceSeconds,
    frameCount: raw.length,
    activeFrameCount,
    activeSeconds,
    activeRatio,
    minimumActiveFrames,
    minimumActiveRatio: STEM_TELEMETRY_CONTINUOUS_MIN_ACTIVE_RATIO,
    sufficient: measured
      && activeFrameCount >= minimumActiveFrames
      && activeRatio + 1e-9 >= STEM_TELEMETRY_CONTINUOUS_MIN_ACTIVE_RATIO,
  };
}

/**
 * Evaluate the same cue-level signal contract used by final render preflight.
 * Candidate selection and final validation share these thresholds so a repair
 * cannot select a loud stem whose requested band or event signal is unusable.
 */
export function evaluateStemTelemetryCueSignals(frames = [], {
  startSeconds = 0,
  endSeconds = 0,
  signals = [],
  requiredSignals = signals,
  activityClass = stemTelemetrySignalActivityClass(requiredSignals),
  fps = null,
} = {}) {
  const windowFrames = list(frames).filter((frame) => {
    const timestamp = Number(frame?.t);
    return Number.isFinite(timestamp)
      && timestamp + 1e-9 >= Number(startSeconds)
      && timestamp < Number(endSeconds) - 1e-9;
  });
  const normalizedSignals = [...new Set(list(signals).map(stemTelemetryReactiveSignal).filter(Boolean))].sort();
  const normalizedRequiredSignals = [...new Set(list(requiredSignals).map(stemTelemetryReactiveSignal).filter(Boolean))].sort();
  const allSignals = [...new Set([...normalizedSignals, ...normalizedRequiredSignals])].sort();
  const coreVarianceRange = Math.max(0, ...STEM_TELEMETRY_CORE_SIGNALS.map((signal) => stemTelemetryFiniteRange(windowFrames, signal) || 0));
  const signalVariance = Object.fromEntries(allSignals.map((signal) => [signal, stemTelemetryFiniteRange(windowFrames, signal)]));
  const nonfiniteSignals = allSignals.filter((signal) => (
    windowFrames.some((frame) => !Number.isFinite(stemTelemetrySignalValue(frame, signal)))
  ));
  const flatRequiredSignals = normalizedRequiredSignals.filter((signal) => {
    const range = signalVariance[signal];
    return Number.isFinite(range) && range <= STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD;
  });
  const eventSignals = normalizedRequiredSignals.filter((signal) => STEM_TELEMETRY_EVENT_DRIVEN_SIGNALS.has(signal));
  const eventEvidence = Object.fromEntries(eventSignals.map((signal) => {
    const values = windowFrames.map((frame) => stemTelemetrySignalValue(frame, signal)).filter(Number.isFinite);
    const peak = values.length ? Math.max(...values) : null;
    const eventFrameCount = values.filter((value) => value > STEM_TELEMETRY_EVENT_THRESHOLD).length;
    return [signal, { eventThreshold: STEM_TELEMETRY_EVENT_THRESHOLD, eventFrameCount, peak }];
  }));
  const missingEventSignals = activityClass === "event"
    ? eventSignals.filter((signal) => !(eventEvidence[signal]?.eventFrameCount > 0))
    : [];
  const rawActivity = stemTelemetryRawActivityCoverage(windowFrames, { fps, startSeconds, endSeconds });
  return {
    startSeconds: Number(startSeconds),
    endSeconds: Number(endSeconds),
    frameCount: windowFrames.length,
    coreVarianceRange,
    signals: normalizedSignals,
    requiredSignals: normalizedRequiredSignals,
    signalVariance,
    nonfiniteSignals,
    flatRequiredSignals,
    eventEvidence,
    missingEventSignals,
    activityClass: activityClass === "event" ? "event" : "continuous",
    rawActivity,
    eligible: windowFrames.length > 0
      && coreVarianceRange > STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD
      && nonfiniteSignals.length === 0
      && flatRequiredSignals.length === 0
      && missingEventSignals.length === 0,
  };
}
