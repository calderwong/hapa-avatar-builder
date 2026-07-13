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
    const stem = String(source.stemFocus || "").toLowerCase();
    if (mutedStems.has(stem)) return null;
    return Number(signals.stems?.[stem]?.[source.signal] ?? 0);
  }
  if (source.kind === "mix_signal") return Number(signals.master?.[source.signal] ?? 0);
  if (source.kind === "cue") return Number(signals.cues?.[source.signal] ?? 0);
  return Number(signals[source.signal] ?? 0);
}

function quantized(value, quantize) {
  if (typeof quantize === "number" && quantize > 0) return Math.round(value / quantize) * quantize;
  return value;
}

export function createDirectorModulationRuntime(bindings = [], options = {}) {
  const state = new Map();
  const history = new Map();
  const mutedStems = new Set((options.mutedStems || []).map((stem) => String(stem).toLowerCase()));
  return {
    step({ atSeconds = 0, signals = {}, muted = mutedStems } = {}) {
      const activeMuted = muted instanceof Set ? muted : new Set((muted || []).map((stem) => String(stem).toLowerCase()));
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
      return outputs;
    },
    snapshot() { return Object.fromEntries([...state].map(([id, value]) => [id, value.value])); },
  };
}

export function evaluateDirectorModulationSequence(bindings, frames, options = {}) {
  const runtime = createDirectorModulationRuntime(bindings, options);
  return frames.map((frame) => ({ atSeconds: frame.atSeconds, outputs: runtime.step(frame) }));
}
