import { DIRECTOR_MODULATION_TIMELINE_SCHEMA, evaluatePreparedDirectorModulation, normalizeHyperFramesStemRole } from "./hyperframes-visualizer-runtime.js";
export { DIRECTOR_MODULATION_TIMELINE_SCHEMA, evaluatePreparedDirectorModulation } from "./hyperframes-visualizer-runtime.js";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function eased(value, name = "linear") {
  const x = clamp(value, 0, 1);
  if (name === "sine.inOut") return -(Math.cos(Math.PI * x) - 1) / 2;
  if (name === "sine.out") return Math.sin((x * Math.PI) / 2);
  if (name === "power2.out") return 1 - (1 - x) ** 2;
  if (name === "power3.out") return 1 - (1 - x) ** 3;
  return x;
}

function sourceValue(source = {}, signals = {}, mutedStems = new Set()) {
  if (source.kind === "stem_signal") {
    const stem = normalizeHyperFramesStemRole(source.stemFocus);
    if (mutedStems.has(stem)) return null;
    const resource = stem === "master" ? signals.master : signals.stems?.[stem] ?? signals.stems?.[source.stemFocus];
    if (!resource) return null;
    const aliases = { bass: "low", treble: "high", onset: "transient" };
    return Number(resource[source.signal] ?? resource[aliases[source.signal]] ?? 0);
  }
  if (source.kind === "mix_signal") return !mutedStems.has("master") && signals.master ? Number(signals.master[source.signal] ?? 0) : null;
  if (source.kind === "cue") return Number(signals.cues?.[source.signal] ?? 0);
  return Number(signals[source.signal] ?? 0);
}

function quantized(value, quantize) {
  if (typeof quantize === "number" && quantize > 0) return Math.round(value / quantize) * quantize;
  return value;
}

export function createDirectorModulationRuntime(bindings = [], options = {}) {
  if (options.preparedTimeline) {
    let latest = [];
    return {
      mode: "prepared-absolute-time",
      step({ atSeconds = 0, muted = options.mutedStems || [] } = {}) {
        latest = evaluatePreparedDirectorModulation(options.preparedTimeline, atSeconds, muted);
        return latest;
      },
      snapshot() { return Object.fromEntries(latest.map(output => [output.id, output.value])); },
    };
  }
  let latest = [];
  const state = new Map();
  const history = new Map();
  const mutedStems = new Set([...(options.mutedStems || [])].map(normalizeHyperFramesStemRole));
  return {
    mode: "live-history",
    step({ atSeconds = 0, signals = {}, muted = mutedStems } = {}) {
      const activeMuted = new Set([...(muted || [])].map(normalizeHyperFramesStemRole));
      const outputs = [];
      for (const binding of bindings) {
        const envelope = binding.envelope || {};
        const raw = sourceValue(binding.source, signals, activeMuted);
        if (raw === null || !Number.isFinite(raw)) continue;
        const bindingHistory = history.get(binding.id) || [];
        bindingHistory.push({ atSeconds, value: raw });
        while (bindingHistory.length > 2 && bindingHistory[1].atSeconds < atSeconds - Math.max(2, Number(envelope.delaySeconds || 0) + 1)) bindingHistory.shift();
        history.set(binding.id, bindingHistory);
        const delayedAt = atSeconds - Number(envelope.delaySeconds || 0);
        const delayed = [...bindingHistory].reverse().find((sample) => sample.atSeconds <= delayedAt)?.value ?? raw;
        const threshold = Number(envelope.gate?.threshold ?? 0);
        const gated = delayed >= threshold ? delayed : Number(envelope.gate?.floor ?? 0);
        const polarity = envelope.polarity === "negative" ? -1 : envelope.polarity === "bipolar" ? gated * 2 - 1 : 1;
        const shaped = envelope.polarity === "bipolar" ? polarity : eased(gated, envelope.easing);
        const target = quantized(Number(envelope.baseValue || 0) + shaped * Number(envelope.depth ?? 1) * (envelope.polarity === "negative" ? -1 : 1), envelope.quantizeStep);
        const previous = state.get(binding.id) || { atSeconds, value: Number(envelope.initialValue || 0) };
        const dt = Math.max(0, atSeconds - previous.atSeconds);
        const rise = target >= previous.value;
        const response = Math.max(0.0001, Number(rise ? envelope.attackSeconds : envelope.releaseSeconds) || 0.0001);
        const smoothing = Math.max(0, Number(envelope.smoothingSeconds || 0));
        const alpha = dt <= 0 ? 1 : 1 - Math.exp(-dt / (response + smoothing));
        let value = previous.value + (target - previous.value) * alpha;
        const bounds = envelope.safetyBounds || {};
        const maxDeltaPerSecond = Number(bounds.maxDeltaPerSecond || Infinity);
        if (Number.isFinite(maxDeltaPerSecond) && dt > 0) value = clamp(value, previous.value - maxDeltaPerSecond * dt, previous.value + maxDeltaPerSecond * dt);
        const range = envelope.clamp || [bounds.min ?? -Infinity, bounds.max ?? Infinity];
        value = clamp(value, Number(range[0] ?? -Infinity), Number(range[1] ?? Infinity));
        state.set(binding.id, { atSeconds, value });
        outputs.push({ id: binding.id, source: binding.source, target: binding.target, value, raw: delayed });
      }
      latest = outputs;
      return outputs;
    },
    snapshot() { return Object.fromEntries(latest.map(output => [output.id, output.value])); },
  };
}



/** Bake history-dependent attack/release once from a fixed song origin.
 * Identical source/envelope channels share storage across target uniforms.
 * Playback only samples these arrays; seeking never calls the signal analyzer.
 */
export function prepareDirectorModulationTimeline(bindings = [], {
  sampleSignals, durationSeconds, fps = 60, sourceFingerprint, maxSamples = 1_000_000,
} = {}) {
  if (typeof sampleSignals !== "function" || !sourceFingerprint) throw new Error("Prepared modulation requires a pinned signal sampler and source fingerprint");
  if (!(Number.isFinite(durationSeconds) && durationSeconds > 0 && Number.isFinite(fps) && fps >= 30 && fps <= 240)) throw new Error("Invalid modulation duration/cadence");
  const channels = [], byKey = new Map();
  const targets = bindings.map(binding => {
    const key = JSON.stringify({ source: binding.source, envelope: binding.envelope || {} });
    if (!byKey.has(key)) {
      const id = `channel-${channels.length}`;
      byKey.set(key, id); channels.push({ id, source: binding.source, envelope: binding.envelope, values: [], raw: [] });
    }
    return { id: binding.id, source: binding.source, target: binding.target, channelId: byKey.get(key) };
  });
  const frameCount = Math.ceil(durationSeconds * fps) + 1;
  if (frameCount * channels.length > maxSamples) {
    const error = new Error(`Modulation preparation exceeds ${maxSamples} sample budget; reduce channels or prepare bounded song ranges.`);
    error.code = "echo_modulation_budget_exceeded"; throw error;
  }
  const runtime = createDirectorModulationRuntime(channels);
  for (let index = 0; index < frameCount; index++) {
    const atSeconds = index / fps;
    const values = new Map(runtime.step({ atSeconds, signals: sampleSignals(atSeconds) }).map(output => [output.id, output]));
    for (const channel of channels) {
      const output = values.get(channel.id);
      channel.values.push(output ? Number(output.value.toFixed(9)) : null);
      channel.raw.push(output ? Number(output.raw.toFixed(9)) : null);
    }
  }
  return { schemaVersion: DIRECTOR_MODULATION_TIMELINE_SCHEMA, sourceFingerprint, fps, durationSeconds, originSeconds: 0,
    channels: channels.map(({ envelope, ...channel }) => channel), targets,
    policy: { origin: "fixed-song-zero", seekingRunsAnalysis: false, interpolation: "linear", frameCount, samples: frameCount * channels.length } };
}


export function evaluateDirectorModulationSequence(bindings, frames, options = {}) {
  const runtime = createDirectorModulationRuntime(bindings, options);
  return frames.map((frame) => ({ atSeconds: frame.atSeconds, outputs: runtime.step(frame) }));
}
