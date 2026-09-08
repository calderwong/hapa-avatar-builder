export const ECHO_SECTION_VISUAL_BUDGET_SCHEMA = 'hapa.echo.section-visual-budget.v1';

/** Shared compiler/Preview/export policy. Units for camera velocity and
 * acceleration are normalized source-crop coordinates per second and second². */
export function echoSectionVisualBudget(section = {}) {
  const role = String(section.type || section.sectionRole || '').toLowerCase();
  const energy = Number.isFinite(Number(section.energy)) ? Number(section.energy)
    : /chorus|hook|drop/.test(role) ? .85 : /intro|outro|bridge|break/.test(role) ? .2 : .5;
  const band = energy < .35 ? 'quiet' : energy >= .75 ? 'peak' : 'steady';
  const values = { quiet: [2, 6, .025, .04], steady: [3, 8, .05, .09], peak: [4, 10, .08, .16] }[band];
  return { schemaVersion: ECHO_SECTION_VISUAL_BUDGET_SCHEMA, sectionId: section.id || 'unsectioned', band,
    maxVisualizerLayers: values[0], maxTotalLayers: values[1], maxCameraVelocity: values[2], maxCameraAcceleration: values[3] };
}

export function echoSectionVisualBudgetAt(policy, timeSeconds) {
  if (policy?.schemaVersion !== ECHO_SECTION_VISUAL_BUDGET_SCHEMA) return null;
  const section = (policy.sections || []).find(row => Number(row.startSeconds ?? row.start) <= timeSeconds && Number(row.endSeconds ?? row.end) > timeSeconds);
  const budget = echoSectionVisualBudget(section);
  const requested = Number(policy.maxVisualizerLayers);
  return { ...budget, maxVisualizerLayers: Number.isFinite(requested) ? Math.max(0, Math.min(budget.maxVisualizerLayers, Math.floor(requested))) : budget.maxVisualizerLayers };
}

export function echoSectionCameraBudgetForWindow(sections, startSeconds, endSeconds) {
  const overlapping = (sections || []).filter(row => Number(row.startSeconds ?? row.start) < endSeconds && Number(row.endSeconds ?? row.end) > startSeconds);
  const budgets = (overlapping.length ? overlapping : [{}]).map(echoSectionVisualBudget);
  return { ...budgets[0], sectionIds: budgets.map(row => row.sectionId),
    maxCameraVelocity: Math.min(...budgets.map(row => row.maxCameraVelocity)),
    maxCameraAcceleration: Math.min(...budgets.map(row => row.maxCameraAcceleration)) };
}

export function admitEchoSectionVisualLayers(layers, policy, timeSeconds, { mediaLayers = 0, lyricLayers = 0, accentLayers = 0 } = {}) {
  const budget = echoSectionVisualBudgetAt(policy, timeSeconds);
  if (!budget) return { layers, receipt: { status: 'legacy-policy-not-declared', suppressedIds: [] } };
  const reserve = [mediaLayers, lyricLayers, accentLayers].reduce((sum, count) => sum + Math.max(0, Math.floor(Number(count) || 0)), 0);
  const allowance = Math.max(0, Math.min(budget.maxVisualizerLayers, budget.maxTotalLayers - reserve));
  // Explicit locks and always-on operator slots remain authored. Report their
  // excess; never silently disable a protected layer to manufacture compliance.
  const protectedLayer = layer => layer.locked === true || layer.persistent === true || Boolean(layer.persistentSlotId);
  const protectedIds = new Set(layers.filter(protectedLayer).map(layer => layer.id));
  const selected = new Set(protectedIds);
  for (const layer of layers) if (!selected.has(layer.id) && selected.size < allowance) selected.add(layer.id);
  const admitted = layers.filter(layer => selected.has(layer.id));
  return { layers: admitted, receipt: { ...budget, status: admitted.length > allowance || reserve > budget.maxTotalLayers ? 'protected-or-reserved-overflow' : 'within-budget',
    reservedLayers: reserve, visualizerAllowance: allowance, admittedIds: admitted.map(layer => layer.id),
    protectedIds: [...protectedIds], suppressedIds: layers.filter(layer => !selected.has(layer.id)).map(layer => layer.id),
    totalLayers: reserve + admitted.length } };
}

export const HYPERFRAMES_STEM_ROLE_ALIASES = Object.freeze({
  master: "master",
  mastermix: "master",
  mix: "master",
  fullmix: "master",
  leadvocal: "vocals",
  leadvocals: "vocals",
  leadvoice: "vocals",
  leadvoices: "vocals",
  vocal: "vocals",
  vocals: "vocals",
  voice: "vocals",
  voices: "vocals",
  backingvocal: "backing-vocals",
  backingvocals: "backing-vocals",
  backgroundvocal: "backing-vocals",
  backgroundvocals: "backing-vocals",
  bgvocal: "backing-vocals",
  bgvocals: "backing-vocals",
  drum: "drums",
  drums: "drums",
  key: "keyboard",
  keys: "keyboard",
  keyboard: "keyboard",
  keyboards: "keyboard",
  synths: "synth",
  stringssection: "strings",
});

export function normalizeHyperFramesStemRole(value = "") {
  const compact = text(value)
    .toLowerCase()
    .replace(/^(?:stem|bus)[:/_-]+/, "")
    .replace(/[^a-z0-9]+/g, "");
  return HYPERFRAMES_STEM_ROLE_ALIASES[compact] || compact;
}


export const HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA = "hapa.hyperframes.visualizer-runtime.v1";
export const HYPERFRAMES_VISUALIZER_DIAGNOSTIC_SCHEMA = "hapa.hyperframes.visualizer-diagnostic.v1";
export const VISUALIZER_AUDIO_HEADROOM_POLICY = "auto-headroom-v1";
export const VISUALIZER_AUDIO_EFFECTIVENESS_POLICY = "per-uniform-material-effect-v1";
export const VISUALIZER_AUDIO_REACTIVE_SIGNALS = new Set([
  "rms", "peak", "onset", "beat", "energy",
  "low", "bass", "mid", "high", "treble",
  "palette", "orbit",
]);


const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value, min)));
const round = (value, digits = 9) => {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
};
const text = (value) => String(value ?? "").trim();
const modulo = (value, divisor) => divisor > 0 ? ((value % divisor) + divisor) % divisor : 0;
const canonicalHash = (value) => text(value).toLowerCase().replace(/^sha256:/, "");
const isSha256 = (value) => /^[a-f0-9]{64}$/.test(canonicalHash(value));

function inputName(input = {}) {
  return text(input.NAME || input.name);
}

function inputType(input = {}) {
  return text(input.TYPE || input.type).toLowerCase();
}

function inputField(input, upper, lower) {
  return input?.[upper] ?? input?.[lower];
}

function normalizeEchoIsfInputValue(input = {}, value) {
  const type = inputType(input);
  if (type === "bool" || type === "event") {
    if (typeof value === "string") return !["", "0", "false", "off", "no"].includes(value.trim().toLowerCase());
    return Boolean(value);
  }
  if (type === "long") {
    const minimum = finite(inputField(input, "MIN", "min"), -Number.MAX_SAFE_INTEGER);
    const maximum = finite(inputField(input, "MAX", "max"), Number.MAX_SAFE_INTEGER);
    const rounded = Math.round(clamp(value, minimum, maximum));
    const values = inputField(input, "VALUES", "values");
    if (!Array.isArray(values) || !values.length) return rounded;
    return values.map(Number).filter(Number.isFinite).reduce((closest, candidate) => (
      Math.abs(candidate - rounded) < Math.abs(closest - rounded) ? candidate : closest
    ), Number(values[0]));
  }
  if (type === "color" || type === "point2d") {
    const length = type === "color" ? 4 : 2;
    const fallback = type === "color" ? [0, 0, 0, 1] : [0, 0];
    const source = Array.isArray(value) ? value : fallback;
    const minimum = inputField(input, "MIN", "min");
    const maximum = inputField(input, "MAX", "max");
    return Array.from({ length }, (_, index) => round(clamp(
      source[index] ?? fallback[index],
      finite(Array.isArray(minimum) ? minimum[index] : minimum, type === "color" ? 0 : -Number.MAX_SAFE_INTEGER),
      finite(Array.isArray(maximum) ? maximum[index] : maximum, type === "color" ? 1 : Number.MAX_SAFE_INTEGER),
    ), 6));
  }
  return round(clamp(
    value,
    finite(inputField(input, "MIN", "min"), -Number.MAX_SAFE_INTEGER),
    finite(inputField(input, "MAX", "max"), Number.MAX_SAFE_INTEGER),
  ), 6);
}

export function normalizeVisualizerAudioInputValue(input = {}, value) {
  return normalizeEchoIsfInputValue(input, value);
}

function echoIsfManifestDefaults(shader = {}) {
  const values = {};
  for (const input of shader.inputs || []) {
    const name = inputName(input);
    const type = inputType(input);
    if (!name || type === "image" || !["float", "long", "bool", "event", "color", "point2d"].includes(type)) continue;
    const declared = inputField(input, "DEFAULT", "default");
    const fallback = type === "bool" || type === "event"
      ? false
      : type === "color"
        ? [0, 0, 0, 1]
        : type === "point2d"
          ? [0, 0]
          : type === "long"
            ? (inputField(input, "VALUES", "values")?.[0] ?? 0)
            : 0;
    values[name] = normalizeEchoIsfInputValue(input, declared ?? fallback);
  }
  return values;
}

export function visualizerAudioMappingDepthMode(mapping = {}) {
  const declared = text(mapping?.depthMode || mapping?.depth_mode).toLowerCase();
  if (["absolute", "range-relative"].includes(declared)) return declared;
  if (Object.hasOwn(mapping || {}, "depthFraction") || Object.hasOwn(mapping || {}, "depth_fraction")) return "range-relative";
  if (Object.hasOwn(mapping || {}, "depth")) return "absolute";
  return VISUALIZER_AUDIO_REACTIVE_SIGNALS.has(text(mapping?.signal).toLowerCase()) ? "range-relative" : "absolute";
}

function visualizerInputRangeDepth(input = {}, fraction = 0.2) {
  const type = inputType(input);
  const minimum = inputField(input, "MIN", "min");
  const maximum = inputField(input, "MAX", "max");
  if (["color", "point2d"].includes(type)) {
    const length = type === "color" ? 4 : 2;
    return Array.from({ length }, (_, index) => {
      const min = Number(Array.isArray(minimum) ? minimum[index] : minimum);
      const max = Number(Array.isArray(maximum) ? maximum[index] : maximum);
      return Number.isFinite(min) && Number.isFinite(max) && max > min
        ? (max - min) * Number(fraction)
        : Number(fraction);
    });
  }
  const min = Number(minimum);
  const max = Number(maximum);
  return Number.isFinite(min) && Number.isFinite(max) && max > min
    ? (max - min) * Number(fraction)
    : Number(fraction);
}

/**
 * Normalize editor/portable mappings without reinterpreting an explicit legacy
 * depth. Newly generated reactive mappings opt into range-relative magnitude
 * and deterministic headroom direction; unmarked stored object depths remain
 * the legacy positive absolute contract.
 */
export function normalizeVisualizerAudioMapping(value, {
  fallback = null,
  input = null,
  generated = false,
  materializeDepth = true,
} = {}) {
  const base = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? { ...fallback } : {};
  let merged;
  let valueHasDepth = false;
  let valueHasDepthFraction = false;
  let valueDeclaredMode = "";
  let stringMapping = false;
  if (typeof value === "string") {
    stringMapping = true;
    const parts = value.split(":").map((part) => part.trim()).filter(Boolean);
    const signal = text(parts.pop() || base.signal || "off").toLowerCase();
    merged = { ...base, signal, ...(parts.length ? { stemFocus: parts.join(":") } : {}) };
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    valueHasDepth = Object.hasOwn(value, "depth");
    valueHasDepthFraction = Object.hasOwn(value, "depthFraction") || Object.hasOwn(value, "depth_fraction");
    valueDeclaredMode = text(value.depthMode || value.depth_mode).toLowerCase();
    merged = { ...base, ...value, signal: text(value.signal ?? base.signal ?? "off").toLowerCase() };
  } else if (Object.keys(base).length) {
    merged = { ...base, signal: text(base.signal || "off").toLowerCase() };
  } else {
    return null;
  }

  const reactive = VISUALIZER_AUDIO_REACTIVE_SIGNALS.has(text(merged.signal).toLowerCase());
  const inheritedMode = text(base.depthMode || base.depth_mode).toLowerCase();
  const inheritedHasFraction = Object.hasOwn(base, "depthFraction") || Object.hasOwn(base, "depth_fraction");
  const inheritedHasDepth = Object.hasOwn(base, "depth");
  let depthMode;
  if (["absolute", "range-relative"].includes(valueDeclaredMode)) depthMode = valueDeclaredMode;
  else if (valueHasDepthFraction) depthMode = "range-relative";
  else if (generated && valueHasDepth && reactive) depthMode = "range-relative";
  else if (valueHasDepth) depthMode = "absolute";
  else if (["absolute", "range-relative"].includes(inheritedMode)) depthMode = inheritedMode;
  else if (inheritedHasFraction) depthMode = "range-relative";
  else if (inheritedHasDepth) depthMode = "absolute";
  else if ((generated || stringMapping) && reactive) depthMode = "range-relative";
  else depthMode = reactive ? "range-relative" : "absolute";

  if (depthMode === "absolute") {
    return {
      ...merged,
      depthMode: "absolute",
      depth: merged.depth ?? (reactive ? 0.2 : 0),
    };
  }

  const inheritedFraction = base.depthFraction ?? base.depth_fraction;
  const fractionValue = valueHasDepthFraction
    ? (merged.depthFraction ?? merged.depth_fraction)
    : valueDeclaredMode === "range-relative" && valueHasDepth
      ? merged.depth
      : generated && valueHasDepth
        ? merged.depth
        : inheritedFraction ?? merged.depth ?? 0.2;
  const fraction = Number(fractionValue);
  const depthFraction = Number.isFinite(fraction) ? Math.max(0, fraction) : 0.2;
  return {
    ...merged,
    depthMode: "range-relative",
    depthFraction,
    ...(materializeDepth ? { depth: visualizerInputRangeDepth(input || {}, depthFraction) } : {}),
    headroomPolicy: text(merged.headroomPolicy || merged.headroom_policy || VISUALIZER_AUDIO_HEADROOM_POLICY),
    direction: text(merged.direction || "auto"),
  };
}

export function visualizerAudioMappingDepth(input = {}, mapping = {}) {
  if (visualizerAudioMappingDepthMode(mapping) === "absolute") return mapping.depth ?? 0;
  const fraction = Number(mapping.depthFraction ?? mapping.depth_fraction ?? mapping.depth ?? 0.2);
  return visualizerInputRangeDepth(input, Number.isFinite(fraction) ? Math.max(0, fraction) : 0.2);
}

function visualizerComponentBounds(input, index = null) {
  const type = inputType(input);
  const minimum = inputField(input, "MIN", "min");
  const maximum = inputField(input, "MAX", "max");
  const color = type === "color";
  return {
    min: finite(Array.isArray(minimum) ? minimum[index] : minimum, color ? 0 : -Number.MAX_SAFE_INTEGER),
    max: finite(Array.isArray(maximum) ? maximum[index] : maximum, color ? 1 : Number.MAX_SAFE_INTEGER),
  };
}

function visualizerLongMinimumDepth(input, baseValue, direction) {
  const values = inputField(input, "VALUES", "values");
  if (!Array.isArray(values) || !values.length) return 1;
  const candidates = values.map(Number).filter(Number.isFinite).filter((candidate) => (
    direction < 0 ? candidate < baseValue : candidate > baseValue
  ));
  if (!candidates.length) return 0;
  return Math.min(...candidates.map((candidate) => Math.abs(candidate - baseValue)));
}

function visualizerDirection(input, baseValue, bounds, mapping = {}) {
  const declared = text(mapping.direction || "auto").toLowerCase();
  if (["down", "negative", "decrease", "-1"].includes(declared)) return -1;
  if (["up", "positive", "increase", "+1", "1"].includes(declared)) return 1;
  if (text(mapping.headroomPolicy || mapping.headroom_policy) !== VISUALIZER_AUDIO_HEADROOM_POLICY) return 1;
  if (inputType(input) === "long") {
    const values = inputField(input, "VALUES", "values");
    if (Array.isArray(values) && values.length) {
      const numeric = values.map(Number).filter(Number.isFinite);
      const hasDown = numeric.some((candidate) => candidate < baseValue);
      const hasUp = numeric.some((candidate) => candidate > baseValue);
      // Numeric MIN/MAX can advertise headroom that an enum cannot actually
      // occupy. Prefer the only direction containing a declared alternate so
      // generated mappings do not normalize straight back to their base value.
      if (hasDown !== hasUp) return hasDown ? -1 : 1;
    }
  }
  const up = Math.max(0, bounds.max - baseValue);
  const down = Math.max(0, baseValue - bounds.min);
  return down > up ? -1 : 1;
}

function applyVisualizerScalarMapping(input, baseValue, signal, depth, mapping, normalize, componentIndex = null) {
  const type = inputType(input);
  const bounds = visualizerComponentBounds(input, componentIndex);
  const direction = visualizerDirection(input, finite(baseValue), bounds, mapping);
  let magnitude = Math.abs(finite(depth));
  if (magnitude > 0 && text(mapping.headroomPolicy || mapping.headroom_policy) === VISUALIZER_AUDIO_HEADROOM_POLICY && type === "long") {
    magnitude = Math.max(magnitude, visualizerLongMinimumDepth(input, finite(baseValue), direction));
  }
  const headroom = direction < 0 ? Math.max(0, finite(baseValue) - bounds.min) : Math.max(0, bounds.max - finite(baseValue));
  if (text(mapping.headroomPolicy || mapping.headroom_policy) === VISUALIZER_AUDIO_HEADROOM_POLICY) {
    magnitude = Math.min(magnitude, headroom);
  }
  const rawValue = finite(baseValue) + clamp(signal) * magnitude * direction;
  return { value: normalize(input, rawValue), direction, effectiveDepth: magnitude * direction };
}

/** Apply the same generated mapping policy in browser Preview and HyperFrames. */
export function applyVisualizerAudioMapping(input = {}, baseValue, signalValue, mapping = {}, {
  normalize = normalizeEchoIsfInputValue,
} = {}) {
  const type = inputType(input);
  const signal = clamp(signalValue);
  const depth = visualizerAudioMappingDepth(input, mapping);
  const headroomPolicy = text(mapping.headroomPolicy || mapping.headroom_policy);
  if (type === "bool" || type === "event") {
    const threshold = finite(mapping.threshold, 0.5);
    const value = signal >= threshold
      ? headroomPolicy === VISUALIZER_AUDIO_HEADROOM_POLICY ? !Boolean(baseValue) : true
      : baseValue;
    return {
      value: normalize(input, value),
      depth,
      effectiveDepth: null,
      direction: Boolean(baseValue) ? "toggle-off" : "toggle-on",
      headroomPolicy: headroomPolicy || null,
    };
  }
  if (Array.isArray(baseValue)) {
    const depths = Array.isArray(depth) ? depth : Array(baseValue.length).fill(finite(depth));
    const components = baseValue.map((value, index) => applyVisualizerScalarMapping(
      input,
      value,
      signal,
      depths[index],
      mapping,
      (_input, candidate) => candidate,
      index,
    ));
    return {
      value: normalize(input, components.map((component) => component.value)),
      depth,
      effectiveDepth: components.map((component) => component.effectiveDepth),
      direction: components.map((component) => component.direction < 0 ? "down" : "up"),
      headroomPolicy: headroomPolicy || null,
    };
  }
  const scalar = applyVisualizerScalarMapping(input, baseValue, signal, depth, mapping, normalize);
  return {
    ...scalar,
    depth,
    direction: scalar.direction < 0 ? "down" : "up",
    headroomPolicy: headroomPolicy || null,
  };
}

export const PREPARED_VISUALIZER_MAPPED_SIGNAL = "mapped-signal-v1";

/** Generated envelopes shape signal strength; the existing input mapper owns
 * units, direction, headroom and the current operator control/default. */
export function applyPreparedVisualizerInput(input, baseValue, rawMapping, output, { normalize = normalizeEchoIsfInputValue } = {}) {
  const space = output.target?.valueSpace;
  if (!space || space === "isf-absolute-v1") return { applied: true, value: normalize(input, output.value) };
  if (space !== PREPARED_VISUALIZER_MAPPED_SIGNAL) throw new Error("Unsupported prepared visualizer value space: " + space);
  const referenceDepth = Number(output.target.referenceDepth);
  if (!Number.isFinite(referenceDepth) || referenceDepth < 0) throw new Error("Invalid prepared visualizer reference depth");
  const mapping = normalizeVisualizerAudioMapping(rawMapping, { input, generated: typeof rawMapping === "string", materializeDepth: false });
  if (!mapping || !mapping.signal || mapping.signal === "off" || referenceDepth === 0) return { applied: false, reason: "mapping-disabled" };
  if (mapping.signal !== output.source?.signal) return { applied: false, reason: "prepared-feature-changed" };
  const signalFraction = clamp(output.value / referenceDepth);
  return { ...applyVisualizerAudioMapping(input, baseValue, signalFraction, mapping, { normalize }), applied: true, valueSpace: space, signalFraction, baseValue };
}

function visualizerMaterialRatio(input, lowValue, highValue) {
  const type = inputType(input);
  if (["bool", "event", "long"].includes(type)) return lowValue === highValue ? 0 : 1;
  const low = Array.isArray(lowValue) ? lowValue : [lowValue];
  const high = Array.isArray(highValue) ? highValue : [highValue];
  return Math.max(0, ...low.map((value, index) => {
    const bounds = visualizerComponentBounds(input, Array.isArray(lowValue) ? index : null);
    const range = bounds.max - bounds.min;
    const denominator = Number.isFinite(range) && range > 0 && range < Number.MAX_SAFE_INTEGER
      ? range
      : Math.max(1, Math.abs(finite(value)), Math.abs(finite(high[index])));
    return Math.abs(finite(high[index]) - finite(value)) / denominator;
  }));
}

export function inspectVisualizerAudioMappingEffect(input = {}, baseValue, mapping = {}, options = {}) {
  const low = applyVisualizerAudioMapping(input, baseValue, 0, mapping, options);
  const high = applyVisualizerAudioMapping(input, baseValue, 1, mapping, options);
  const changed = JSON.stringify(low.value) !== JSON.stringify(high.value);
  const materialRatio = visualizerMaterialRatio(input, low.value, high.value);
  return {
    policy: VISUALIZER_AUDIO_EFFECTIVENESS_POLICY,
    lowValue: low.value,
    highValue: high.value,
    changed,
    materialRatio: round(materialRatio),
    material: changed && materialRatio + 1e-9 >= 0.01,
    direction: high.direction,
    effectiveDepth: high.effectiveDepth,
    depthMode: visualizerAudioMappingDepthMode(mapping),
    depthFraction: mapping.depthFraction ?? mapping.depth_fraction ?? null,
    headroomPolicy: high.headroomPolicy,
  };
}

function stableLayerRows(show = {}) {
  return (show.instances?.visualizers || [])
    .map((instance, sourceIndex) => ({ instance, sourceIndex }))
    .sort((left, right) => {
      const a = left.instance;
      const b = right.instance;
      const aExplicit = Number(a.layerOrder ?? a.layerIndex ?? a.zIndex);
      const bExplicit = Number(b.layerOrder ?? b.layerIndex ?? b.zIndex);
      const aHasExplicit = Number.isFinite(aExplicit);
      const bHasExplicit = Number.isFinite(bExplicit);
      if (aHasExplicit && bHasExplicit && aExplicit !== bExplicit) return aExplicit - bExplicit;
      if (aHasExplicit !== bHasExplicit) return aHasExplicit ? -1 : 1;
      return left.sourceIndex - right.sourceIndex;
    });
}

function cueWindow(instance = {}) {
  const start = finite(instance.start ?? instance.startSeconds);
  const end = finite(instance.end ?? instance.endSeconds, start);
  return { start, end, duration: Math.max(0, end - start) };
}

function activeHalfOpen(window, timeSeconds) {
  return window.end > window.start && timeSeconds >= window.start && timeSeconds < window.end;
}

function normalizedKeyframes(event = {}, property, fallback) {
  const frames = (event.keyframes || [])
    .flatMap((frame, index) => {
      const value = Number(frame?.[property]);
      if (!Number.isFinite(value)) return [];
      return [{ offset: clamp(frame.offset, 0, 1), value, index }];
    })
    .sort((a, b) => a.offset - b.offset || a.index - b.index);
  if (!frames.length) return [{ offset: 0, value: fallback }, { offset: 1, value: fallback }];
  if (frames[0].offset > 0) frames.unshift({ offset: 0, value: frames[0].value, index: -1 });
  if (frames.at(-1).offset < 1) frames.push({ offset: 1, value: frames.at(-1).value, index: Number.MAX_SAFE_INTEGER });
  return frames;
}

function interpolatedKeyframe(frames, progress) {
  const p = clamp(progress);
  const rightIndex = frames.findIndex((frame) => frame.offset >= p);
  if (rightIndex <= 0) return frames[0].value;
  if (rightIndex < 0) return frames.at(-1).value;
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  if (right.offset <= left.offset) return right.value;
  const amount = (p - left.offset) / (right.offset - left.offset);
  return left.value + (right.value - left.value) * amount;
}

function integratedKeyframes(frames, progress) {
  const p = clamp(progress);
  let area = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const left = frames[index - 1];
    const right = frames[index];
    if (p <= left.offset) break;
    const segmentEnd = Math.min(p, right.offset);
    const span = segmentEnd - left.offset;
    if (span <= 0) continue;
    const fullSpan = Math.max(Number.EPSILON, right.offset - left.offset);
    const endValue = left.value + (right.value - left.value) * (span / fullSpan);
    area += span * (left.value + endValue) * 0.5;
    if (p <= right.offset) break;
  }
  return area;
}

function eventWindow(event = {}) {
  const start = finite(event.startSeconds ?? event.atSeconds);
  const end = finite(event.endSeconds, start + Math.max(0, finite(event.durationSeconds)));
  return { start, end, duration: Math.max(0, end - start) };
}

function eventTargetsInstance(event = {}, instance = {}) {
  const target = event.target || {};
  if (target.clock && target.clock !== "visual-only") return false;
  if (target.layer && target.layer !== "visualizer-layer") return false;
  if (target.instanceId && target.instanceId !== instance.id) return false;
  if (target.visualizerId && target.visualizerId !== instance.visualizerId) return false;
  if (target.trackId && target.trackId !== instance.trackId) return false;
  return true;
}

export function visualTimeFor(show, instance, timeSeconds, window) {
  const baseGlobal = timeSeconds;
  let sampleGlobal = baseGlobal;
  const effects = [];
  const events = (show.automation?.visualTimeTrack?.events || [])
    .filter((event) => eventTargetsInstance(event, instance))
    .map((event, sourceIndex) => ({ event, sourceIndex, window: eventWindow(event) }))
    .filter((row) => activeHalfOpen(row.window, timeSeconds))
    .sort((a, b) => a.window.start - b.window.start || text(a.event.id).localeCompare(text(b.event.id)) || a.sourceIndex - b.sourceIndex);

  for (const row of events) {
    const { event } = row;
    const elapsed = timeSeconds - row.window.start;
    const progress = row.window.duration > 0 ? elapsed / row.window.duration : 0;
    const kind = text(event.kind).toLowerCase();
    let deltaSeconds = 0;
    let visualRate = null;
    let sampleOffsetSeconds = null;
    if (["playback-rate", "rate", "hold"].includes(kind)) {
      const fallbackRate = kind === "hold" ? 0 : finite(event.visualRate ?? event.rate ?? event.playbackRate, 1);
      const frames = normalizedKeyframes(event, "visualRate", fallbackRate);
      visualRate = interpolatedKeyframe(frames, progress);
      const mappedElapsed = row.window.duration * integratedKeyframes(frames, progress);
      deltaSeconds = mappedElapsed - elapsed;
    } else {
      const hasOffsets = (event.keyframes || []).some((frame) => Number.isFinite(Number(frame?.sampleOffsetSeconds)));
      if (hasOffsets) {
        const frames = normalizedKeyframes(event, "sampleOffsetSeconds", 0);
        sampleOffsetSeconds = interpolatedKeyframe(frames, progress);
        deltaSeconds = sampleOffsetSeconds;
      } else if (kind === "repeat" && finite(event.repeatSeconds ?? event.windowSeconds) > 0) {
        const repeatSeconds = finite(event.repeatSeconds ?? event.windowSeconds);
        deltaSeconds = modulo(elapsed, repeatSeconds) - elapsed;
        sampleOffsetSeconds = deltaSeconds;
      } else if (kind === "hold") {
        deltaSeconds = finite(event.holdAtSeconds, row.window.start) - timeSeconds;
        sampleOffsetSeconds = deltaSeconds;
      }
    }
    sampleGlobal += deltaSeconds;
    effects.push({
      id: text(event.id),
      kind,
      startSeconds: row.window.start,
      endSeconds: row.window.end,
      progress: round(progress),
      visualRate: visualRate == null ? null : round(visualRate),
      sampleOffsetSeconds: sampleOffsetSeconds == null ? null : round(sampleOffsetSeconds),
      deltaSeconds: round(deltaSeconds),
    });
  }

  const unclampedLocal = sampleGlobal - window.start;
  const visualTimeSeconds = clamp(unclampedLocal, 0, window.duration);
  return {
    baseTimeSeconds: round(baseGlobal - window.start),
    visualTimeSeconds: round(visualTimeSeconds),
    unclampedVisualTimeSeconds: round(unclampedLocal),
    effects,
  };
}

export const DIRECTOR_MODULATION_TIMELINE_SCHEMA = "hapa.director-modulation.timeline.v1";
export function evaluatePreparedDirectorModulation(timeline, atSeconds, muted = []) {
  if (timeline.schemaVersion !== DIRECTOR_MODULATION_TIMELINE_SCHEMA || !Number.isFinite(atSeconds)) throw new Error("Invalid prepared modulation input");
  const time = clamp(atSeconds, 0, timeline.durationSeconds);
  const index = Math.floor(time * timeline.fps), fraction = time * timeline.fps - index;
  const mutedSet = new Set([...(muted || [])].map(normalizeHyperFramesStemRole));
  const channels = new Map(timeline.channels.map(channel => [channel.id, channel]));
  return timeline.targets.flatMap(target => {
    const kind = target.source?.kind;
    const bus = kind === "mix_signal" ? "master" : kind === "stem_signal" ? normalizeHyperFramesStemRole(target.source.stemFocus) : null;
    if (bus && mutedSet.has(bus)) return [];
    const channel = channels.get(target.channelId);
    const value = channel?.values[index], next = channel?.values[index + 1] ?? value;
    if (value === null || value === undefined) return [];
    return [{ id: target.id, source: target.source, target: target.target,
      value: value + (next - value) * fraction, raw: channel.raw[index] }];
  });
}


function floorIndex(values, time, key) {
  let low = 0, high = values.length - 1, result = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (values[middle][key] <= time) { result = middle; low = middle + 1; } else high = middle - 1;
  }
  return result;
}

export function sampleEchoPerformanceBus(bus, songSeconds) {
  const time = Number(songSeconds) - Number(bus?.originSeconds || 0);
  const frames = bus?.frames || [];
  const index = floorIndex(frames, time, "t");
  const empty = { t: Number(songSeconds), rms: 0, peak: 0, low: 0, mid: 0, high: 0, onsetEnvelope: 0, beat: 0, transient: 0, silence: true };
  if (index < 0 || time >= bus.durationSeconds || !frames.length) return { ...empty, status: frames.length ? "outside-resource" : "missing-analysis" };
  const current = frames[index], next = frames[index + 1];
  if (current.silence) return { ...empty, status: "prepared-rest" };
  const mix = next && !next.silence ? Math.min(1, Math.max(0, (time - current.t) / (next.t - current.t))) : 0;
  return { ...Object.fromEntries(["rms", "peak", "low", "mid", "high", "onsetEnvelope"].map(signal => [signal, current[signal] + ((next?.[signal] ?? current[signal]) - current[signal]) * mix])),
    t: Number(songSeconds), rawRms: current.rawRms, rawPeak: current.rawPeak, beat: 0, transient: 0, silence: false, status: "prepared-envelope" };
}

/** Absolute-time evaluation is independent of seek order and render cadence.
 * Event pulses use sparse event times, so a 10 Hz envelope cannot shift a beat.
 * This returns separate buses; absent or ambiguous stems never alias master. */
export function echoVisualSignalIsolation(bundle, soloStem = "") {
  const selectedRole = soloStem === "__silence__" ? "__silence__" : normalizeHyperFramesStemRole(soloStem);
  const roles = [...new Set((bundle?.buses || []).map(bus => normalizeHyperFramesStemRole(bus.role)))].filter(Boolean);
  const availableRoles = roles.filter(role => !bundle?.missingData?.ambiguousRoles?.includes(role));
  if (selectedRole && selectedRole !== "__silence__" && !availableRoles.includes(selectedRole)) {
    throw new Error(`Visual signal bus is unavailable: ${selectedRole}`);
  }
  return { selectedRole, availableRoles, mutedRoles: selectedRole ? roles.filter(role => role !== selectedRole) : [], temporary: true, affectsAudibleAudio: false };
}

/** Filter only prepared audio bindings; cue/time animation remains authored.
 * Channel arrays are shared read-only: toggling diagnostics never rebakes audio. */
export function isolateEchoPreparedModulation(timeline, soloStem = "") {
  if (!timeline || !soloStem) return timeline;
  const selected = soloStem === "__silence__" ? "__silence__" : normalizeHyperFramesStemRole(soloStem);
  return { ...timeline, targets: timeline.targets.filter(target => {
    const kind = target.source?.kind;
    if (!["stem_signal", "mix_signal"].includes(kind)) return true;
    const role = kind === "mix_signal" ? "master" : normalizeHyperFramesStemRole(target.source.stemFocus);
    return role === selected;
  }) };
}

export function evaluateEchoMusicPerformance(bundle, songSeconds, { soloStem = "" } = {}) {
  const time = Number(songSeconds);
  if (!Number.isFinite(time)) throw new Error("Performance time must be finite");
  const isolation = soloStem ? echoVisualSignalIsolation(bundle, soloStem) : null;
  const muted = new Set(isolation?.mutedRoles || []);
  const byId = Object.fromEntries((bundle.buses || []).map(bus => {
    const frame = sampleEchoPerformanceBus(bus, time);
    if (!muted.has(normalizeHyperFramesStemRole(bus.role))) return [bus.id, frame];
    return [bus.id, { ...Object.fromEntries(Object.entries(frame).map(([key, value]) => [key, key !== "t" && typeof value === "number" ? 0 : value])), silence: true, originalStatus: frame.status, status: "diagnostic-muted" }];
  }));
  const last = floorIndex(bundle.events || [], time, "atSeconds");
  const activeEvents = [];
  for (let index = last; index >= 0 && bundle.events[index].atSeconds >= time - 0.25; index--) {
    const event = bundle.events[index];
    const bus = byId[event.resourceId];
    if (!bus || bus.status === "diagnostic-muted") continue;
    const pulse = Math.exp(-(time - event.atSeconds) / 0.06) * Math.max(0, Math.min(1, event.strength == null ? 1 : finite(event.strength, 1)));
    if (["beat", "downbeat"].includes(event.kind)) bus.beat = Math.max(bus.beat, pulse);
    if (event.kind === "transient") bus.transient = Math.max(bus.transient, pulse);
    activeEvents.push(event);
  }
  const byRole = {};
  for (const bus of bundle.buses || []) {
    if (bundle.missingData?.ambiguousRoles?.includes(bus.role)) continue;
    byRole[bus.role] = byId[bus.id];
  }
  return { atSeconds: time, master: byRole.master || null, stems: Object.fromEntries(Object.entries(byRole).filter(([role]) => role !== "master")), byId, activeEvents: activeEvents.reverse() };
}

export function echoPreparedPerformanceSignalFrames(bundle, timeSeconds, options = {}) {
  const evaluated = evaluateEchoMusicPerformance(bundle, timeSeconds, options);
  const frames = { master: evaluated.master, ...evaluated.stems };
  return Object.fromEntries(Object.entries(frames).map(([role, frame]) => [role, {
    ...(frame || {}),
    ...Object.fromEntries(["rms", "peak", "low", "mid", "high", "bass", "treble", "beat", "onset", "energy", "palette", "orbit"].map(signal => [signal, frame ? signalValue(frame, signal) : 0])),
    source: "prepared-performance", status: frame?.status || "missing-analysis", role,
  }]));
}

function frameAt(frames = [], timeSeconds = 0) {
  if (!frames.length) return null;
  let low = 0;
  let high = frames.length - 1;
  let selected = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (finite(frames[middle]?.t) <= timeSeconds) {
      selected = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return { index: selected, frame: { ...frames[selected] } };
}


function resolvedSignalFrame(show, instance, timeSeconds, stemFocus = null, preparedFrame = null) {
  const requestedStem = normalizeHyperFramesStemRole(stemFocus ?? instance.stemFocus ?? "master") || "master";
  if (show.stemFrames?.performance) {
    const value = preparedFrame;
    const selected = requestedStem === "master" ? value.master : value.stems[requestedStem];
    const wrapped = frame => frame ? { id: requestedStem, role: requestedStem, frame } : null;
    return { requestedStem, resolvedStem: selected ? requestedStem : null, fallbackUsed: false,
      stem: wrapped(selected), master: value.master ? { id: "master", role: "master", frame: value.master } : null };
  }
  const masterResource = show.stemFrames?.master || null;
  const stemResource = (show.stemFrames?.stems || []).find((stem) => (
    normalizeHyperFramesStemRole(stem.role) === requestedStem || normalizeHyperFramesStemRole(stem.id) === requestedStem
  )) || null;
  const master = masterResource ? { id: masterResource.id || "master", role: "master", ...frameAt(masterResource.frames, timeSeconds) } : null;
  if (requestedStem === "master") {
    return { requestedStem, resolvedStem: master ? "master" : null, fallbackUsed: false, stem: master, master };
  }
  const stem = stemResource ? { id: stemResource.id, role: stemResource.role, ...frameAt(stemResource.frames, timeSeconds) } : null;
  return {
    requestedStem,
    resolvedStem: stem ? normalizeHyperFramesStemRole(stemResource.role || stemResource.id) : master ? "master" : null,
    fallbackUsed: !stem && Boolean(master),
    stem: stem || master,
    master,
  };
}

function signalValue(frame = {}, signal = "") {
  if (frame?.silence === true) return 0;
  const name = text(signal).toLowerCase();
  if (name === "beat" && Number.isFinite(frame.beat)) return clamp(frame.beat);
  if (name === "onset" && Number.isFinite(frame.transient)) return clamp(frame.transient);
  const aliases = { bass: "low", treble: "high", beat: "onset" };
  const key = aliases[name] || name;
  const value = Number(frame?.[key]);
  if (Number.isFinite(value)) return clamp(value);
  const rms = clamp(finite(frame?.rms));
  const low = clamp(finite(frame?.low));
  const mid = clamp(finite(frame?.mid));
  const high = clamp(finite(frame?.high));
  if (name === "energy") return clamp((rms * 0.55) + (low * 0.2) + (mid * 0.15) + (high * 0.1));
  const palette = modulo((low * 0.17) + (mid * 0.37) + (high * 0.46), 1);
  if (name === "palette") return palette;
  if (name === "orbit") {
    const timeSeconds = finite(frame?.t);
    return clamp(0.5 + (Math.sin((timeSeconds * 0.37) + (palette * Math.PI * 2)) * 0.5));
  }
  return null;
}

function mappedControls(instance, signalResource, resolveSignalResource = null) {
  const inputs = instance.inputs || [];
  const byName = new Map(inputs.map((input) => [inputName(input), input]).filter(([name]) => name));
  const values = echoIsfManifestDefaults({ inputs });
  const unknownControls = [];
  for (const [name, value] of Object.entries(instance.controls || {})) {
    const input = byName.get(name);
    if (!input || inputType(input) === "image") {
      unknownControls.push(name);
      continue;
    }
    values[name] = normalizeEchoIsfInputValue(input, value);
  }
  const baseValues = { ...values };
  const bindings = [];
  const invalidAudioMapUniforms = [];
  for (const [uniform, rawMapping] of Object.entries(instance.audioMap || {})) {
    const input = byName.get(uniform);
    const mapping = normalizeVisualizerAudioMapping(rawMapping, {
      input,
      generated: typeof rawMapping === "string",
      materializeDepth: false,
    }) || {};
    const mappingSignals = mapping.stemFocus && typeof resolveSignalResource === "function"
      ? resolveSignalResource(mapping.stemFocus)
      : signalResource;
    const bindingStem = {
      requestedStem: mappingSignals.requestedStem,
      resolvedStem: mappingSignals.resolvedStem,
      fallbackUsed: mappingSignals.fallbackUsed,
    };
    if (!input) {
      invalidAudioMapUniforms.push(uniform);
      bindings.push({ uniform, signal: text(mapping?.signal || "off"), status: "uniform-not-declared", ...bindingStem, value: null });
      continue;
    }
    const signal = text(mapping?.signal || "off").toLowerCase();
    const baseValue = values[uniform];
    if (inputType(input) === "image") {
      bindings.push({ uniform, signal, status: "image-input-handled-separately", ...bindingStem, baseValue: null, signalValue: null, value: null });
      continue;
    }
    if (signal === "off" || !signal) {
      bindings.push({ uniform, signal: "off", status: "disabled", ...bindingStem, baseValue, signalValue: null, value: baseValue });
      continue;
    }
    const resolved = signalValue(mappingSignals.stem?.frame, signal);
    if (resolved == null) {
      bindings.push({ uniform, signal, status: "missing-signal", ...bindingStem, baseValue, signalValue: null, value: baseValue });
      continue;
    }
    const applied = applyVisualizerAudioMapping(input, baseValue, resolved, mapping);
    const value = applied.value;
    values[uniform] = value;
    bindings.push({
      uniform,
      signal,
      status: "mapped",
      ...bindingStem,
      baseValue,
      signalValue: round(resolved),
      depth: applied.depth,
      effectiveDepth: applied.effectiveDepth,
      depthMode: visualizerAudioMappingDepthMode(mapping),
      depthFraction: mapping.depthFraction ?? mapping.depth_fraction ?? null,
      direction: applied.direction,
      headroomPolicy: applied.headroomPolicy,
      value,
    });
  }
  return {
    values,
    baseValues,
    bindings,
    unknownControls: unknownControls.sort(),
    invalidAudioMapUniforms: invalidAudioMapUniforms.sort(),
  };
}

function transitionEnvelope(instance, timeSeconds, window) {
  const declaration = instance.transition;
  const kind = text(typeof declaration === "object" ? declaration.kind || declaration.type || declaration.name : declaration || "cut").toLowerCase();
  const fades = /(fade|cross|dissolve)/.test(kind);
  const durationSeconds = Math.max(0.001, finite(
    typeof declaration === "object" ? declaration.durationSeconds : instance.transitionDurationSeconds,
    0.35,
  ));
  const inProgress = clamp((timeSeconds - window.start) / durationSeconds);
  const outProgress = clamp((window.end - timeSeconds) / durationSeconds);
  const alpha = fades ? Math.min(inProgress, outProgress) : 1;
  return { kind: kind || "cut", durationSeconds: round(durationSeconds), inProgress: round(inProgress), outProgress: round(outProgress), alpha: round(alpha) };
}

function proxyContract(instance = {}) {
  const declaredNativeRoute = instance.nativeRoute || instance.execution?.nativeRoute || null;
  const exactRoutes = ["hash-bound-exact-proxy", "exact-native", "deterministic-browser-isf"];
  const executionExact = exactRoutes.includes(instance.execution?.route)
    && instance.execution?.status === "exact"
    && instance.execution?.drawable === true
    && instance.execution?.silentDefault === false;
  const nativeRoute = declaredNativeRoute || (executionExact ? {
    schemaVersion: "hapa.music-viz.native-shader-route.v1",
    requested: { id: instance.visualizerId, title: instance.rendererTruth?.requested?.title || instance.visualizerId, sourceHash: instance.sourceHash },
    route: instance.execution?.route || "hash-bound-exact-proxy",
    status: "exact",
    nativeKey: null,
    proxy: instance.proxy || instance.execution?.proxy || null,
    fidelityLoss: [],
    reason: instance.execution?.reason || "hash-bound-exact-proxy-instance-ready",
    silentDefault: false,
  } : null);
  const proxy = { ...(nativeRoute?.proxy || {}), ...(instance.proxy || instance.execution?.proxy || {}) };
  const sourceHash = text(instance.sourceHash || nativeRoute?.requested?.sourceHash || proxy.sourceHash || instance.rendererTruth?.requested?.sourceHash);
  const issues = [];
  const nativeRouteExact = nativeRoute?.status === "exact" && exactRoutes.includes(nativeRoute?.route);
  if (!nativeRouteExact && !executionExact) issues.push("native-route-not-exact");
  const liveIsf = instance.liveIsf || null;
  if (liveIsf) {
    const liveSourceHash = text(liveIsf.sourceHash);
    const shaderId = text(instance.visualizerId).replace(/^isf:/, "");
    if (text(instance.execution?.route) !== "deterministic-browser-isf") issues.push("live-isf-route-invalid");
    if (!isSha256(sourceHash) || !isSha256(liveSourceHash) || canonicalHash(sourceHash) !== canonicalHash(liveSourceHash)) issues.push("live-isf-source-hash-mismatch");
    if (!text(liveIsf.shaderId) || text(liveIsf.shaderId).replace(/^isf:/, "") !== shaderId) issues.push("live-isf-shader-id-mismatch");
    const frameWidth = Math.floor(finite(liveIsf.width));
    const frameHeight = Math.floor(finite(liveIsf.height));
    const fps = finite(liveIsf.frameRate);
    if (frameWidth <= 0 || frameHeight <= 0 || fps <= 0) issues.push("live-isf-output-contract-invalid");
    return {
      ok: issues.length === 0,
      issues,
      nativeRoute,
      proxy: { frameCount: 0, fps, frameWidth, frameHeight, atlasWidth: frameWidth, atlasHeight: frameHeight },
      sourceHash,
      liveIsf,
    };
  }
  if (!isSha256(sourceHash) || !isSha256(proxy.sourceHash) || canonicalHash(sourceHash) !== canonicalHash(proxy.sourceHash)) issues.push("proxy-source-hash-mismatch");
  if (!isSha256(proxy.assetSha256)) issues.push("proxy-asset-hash-missing");
  if (!text(proxy.compiledUri || proxy.assetPath || proxy.repositoryPath || proxy.assetName)) issues.push("proxy-asset-path-missing");
  const frameCount = Math.floor(finite(proxy.frameCount));
  const fps = finite(proxy.fps);
  const frameWidth = Math.floor(finite(proxy.frameWidth ?? proxy.width));
  const frameHeight = Math.floor(finite(proxy.frameHeight ?? proxy.height));
  if (frameCount <= 0 || fps <= 0 || frameWidth <= 0 || frameHeight <= 0) issues.push("proxy-frame-contract-invalid");
  const atlasWidth = Math.floor(finite(proxy.atlasWidth, frameWidth * frameCount));
  const atlasHeight = Math.floor(finite(proxy.atlasHeight, frameHeight));
  if (atlasWidth < frameWidth * frameCount || atlasHeight < frameHeight) issues.push("proxy-atlas-bounds-invalid");
  return { ok: issues.length === 0, issues, nativeRoute, proxy: { ...proxy, frameCount, fps, frameWidth, frameHeight, atlasWidth, atlasHeight }, sourceHash };
}

function liveIsfFrame(contract, visualTimeSeconds) {
  const fps = Math.max(1, finite(contract.liveIsf?.frameRate, contract.proxy?.fps || 30));
  const frameIndex = Math.max(0, Math.floor(finite(visualTimeSeconds) * fps + Number.EPSILON * 8));
  const width = Math.max(1, Math.floor(finite(contract.liveIsf?.width, contract.proxy?.frameWidth || 1)));
  const height = Math.max(1, Math.floor(finite(contract.liveIsf?.height, contract.proxy?.frameHeight || 1)));
  return {
    frameIndex,
    baseFrameIndex: frameIndex,
    audioFrameOffset: 0,
    frameTimeSeconds: round(frameIndex / fps),
    loopTimeSeconds: round(visualTimeSeconds),
    frameSelectionPolicy: "continuous-pinned-isf-time",
    sourceRect: [0, 0, width, height],
    rect: { x: 0, y: 0, width, height },
    assetPath: null,
    repositoryPath: null,
    compiledUri: null,
    assetName: null,
    assetSha256: null,
    sourceHash: contract.sourceHash,
  };
}

function proxyFrame(contract, visualTimeSeconds, modulation = null) {
  const { proxy } = contract;
  const playableFrameIndices = Array.isArray(proxy.playableFrameIndices)
    ? proxy.playableFrameIndices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < proxy.frameCount)
    : [];
  const playable = playableFrameIndices.length
    ? [...new Set(playableFrameIndices)]
    : Array.from({ length: proxy.frameCount }, (_, index) => index);
  const loopDuration = playable.length / proxy.fps;
  const loopTimeSeconds = modulo(visualTimeSeconds, loopDuration);
  let frameIndex;
  const frameTimes = Array.isArray(proxy.frameTimes) ? proxy.frameTimes.map(Number) : [];
  if (playable.length === proxy.frameCount && frameTimes.length === proxy.frameCount && frameTimes.every(Number.isFinite)) {
    frameIndex = 0;
    for (let index = 0; index < frameTimes.length; index += 1) if (frameTimes[index] <= loopTimeSeconds + Number.EPSILON) frameIndex = index;
  } else {
    frameIndex = playable[Math.min(playable.length - 1, Math.floor(loopTimeSeconds * proxy.fps))];
  }
  const baseFrameIndex = frameIndex;
  const audioFrameOffset = Math.round(finite(modulation?.frameOffsetFrames));
  if (audioFrameOffset !== 0 && playable.length > 1) {
    const basePlayableIndex = Math.max(0, playable.indexOf(frameIndex));
    frameIndex = playable[modulo(basePlayableIndex + audioFrameOffset, playable.length)];
  }
  const sourceRect = [frameIndex * proxy.frameWidth, 0, proxy.frameWidth, proxy.frameHeight];
  return {
    frameIndex,
    baseFrameIndex,
    audioFrameOffset,
    frameTimeSeconds: round(frameTimes[frameIndex] ?? frameIndex / proxy.fps),
    loopTimeSeconds: round(loopTimeSeconds),
    frameSelectionPolicy: text(proxy.frameSelectionPolicy || "declared-sampled-loop"),
    sourceRect,
    rect: { x: sourceRect[0], y: 0, width: proxy.frameWidth, height: proxy.frameHeight },
    assetPath: text(proxy.assetPath) || null,
    repositoryPath: text(proxy.repositoryPath) || null,
    compiledUri: text(proxy.compiledUri) || null,
    assetName: text(proxy.assetName) || null,
    assetSha256: text(proxy.assetSha256),
    sourceHash: text(proxy.sourceHash),
  };
}

function executionTruth(instance, contract) {
  const declared = instance.rendererTruth || {};
  const requested = {
    id: text(contract.nativeRoute?.requested?.id || instance.visualizerId),
    title: text(contract.nativeRoute?.requested?.title || declared.requested?.title || instance.visualizerId),
    sourceHash: contract.sourceHash,
    cueBoundary: { startSeconds: cueWindow(instance).start, endSeconds: cueWindow(instance).end },
  };
  return {
    schemaVersion: "hapa.visualizer-renderer-truth.v1",
    rendererId: "hyperframes",
    requested,
    status: "exact",
    readiness: "ready",
    route: text(instance.execution?.route || contract.nativeRoute?.route || "hash-bound-exact-proxy"),
    substitute: null,
    reason: text(instance.execution?.reason || (instance.liveIsf
      ? "hash-bound-isf-source-executed-on-pinned-timeline"
      : "hash-bound-proxy-instance-scheduled")),
    fidelityLoss: [],
    visible: true,
    silentDefault: false,
  };
}

function controlEnergy(values = {}) {
  const numbers = Object.values(values).flatMap((value) => Array.isArray(value) ? value : [value]).map(Number).filter(Number.isFinite);
  return numbers.length ? round(numbers.reduce((sum, value) => sum + clamp(Math.abs(value)), 0) / numbers.length) : 0;
}

function resolvedPresentationModulation(instance, signalResource) {
  const declaration = instance.presentationModulation;
  if (!declaration || declaration.mode !== "audio-conditioned-proxy") return null;
  const primarySignal = text(declaration.primarySignal || "rms").toLowerCase();
  const accentSignal = text(declaration.accentSignal || "beat").toLowerCase();
  const primaryValue = signalValue(signalResource.stem?.frame, primarySignal)
    ?? signalValue(signalResource.master?.frame, primarySignal)
    ?? 0;
  const accentValue = signalValue(signalResource.stem?.frame, accentSignal)
    ?? signalValue(signalResource.master?.frame, accentSignal)
    ?? 0;
  const primaryWeight = Math.max(0, finite(declaration.primaryWeight, 0.7));
  const accentWeight = Math.max(0, finite(declaration.accentWeight, 0.3));
  const weightTotal = Math.max(Number.EPSILON, primaryWeight + accentWeight);
  const energy = clamp((primaryValue * primaryWeight + accentValue * accentWeight) / weightTotal);
  const frameOffsetFrames = Math.round(energy * Math.max(0, finite(declaration.frameOffsetFrames, 3)));
  const opacityDepth = clamp(declaration.opacityDepth, 0, 0.5);
  return {
    schemaVersion: "hapa.hyperframes.resolved-presentation-modulation.v1",
    mode: "audio-conditioned-proxy",
    source: text(declaration.source || "declared-audio-map"),
    primarySignal,
    accentSignal,
    primaryValue: round(primaryValue),
    accentValue: round(accentValue),
    energy: round(energy),
    frameOffsetFrames,
    brightness: round(1 + energy * clamp(declaration.brightnessDepth, 0, 1)),
    saturation: round(1 + energy * clamp(declaration.saturationDepth, 0, 1.5)),
    scale: round(1 + energy * clamp(declaration.scaleDepth, 0, 0.15)),
    opacityMultiplier: round(1 - opacityDepth + energy * opacityDepth),
  };
}

function diagnostic(instance, window, issues) {
  const truth = instance.rendererTruth || {};
  return {
    schemaVersion: HYPERFRAMES_VISUALIZER_DIAGNOSTIC_SCHEMA,
    instanceId: text(instance.id),
    visualizerId: text(instance.visualizerId),
    trackId: text(instance.trackId),
    cue: { startSeconds: window.start, endSeconds: window.end, activeInterval: "half-open" },
    status: "unsupported",
    route: "unsupported",
    reason: issues[0] || truth.reason || "visualizer-instance-unsupported",
    issues: [...new Set(issues.length ? issues : truth.fidelityLoss || instance.unsupported || ["visualizer-instance-unsupported"])],
    rendererTruth: truth,
    visible: true,
    silentDefault: false,
    drawableFrame: null,
  };
}

function accentEnvelope(event, timeSeconds) {
  const window = eventWindow(event);
  const progress = window.duration > 0 ? (timeSeconds - window.start) / window.duration : 0;
  const frames = normalizedKeyframes(event, "value", 0);
  return {
    id: text(event.id),
    cueId: text(event.cueId),
    kind: text(event.kind),
    preset: text(event.preset),
    atSeconds: window.start,
    endSeconds: window.end,
    progress: round(progress),
    value: round(interpolatedKeyframe(frames, progress)),
    intensity: round(event.intensity),
    target: event.target || {},
    source: event.source || {},
    safety: event.safety || {},
  };
}

function activeAccents(show, timeSeconds) {
  return (show.automation?.accentTrack?.events || [])
    .filter((event) => event.target?.layer === "visualizer-layer")
    .filter((event) => activeHalfOpen(eventWindow(event), timeSeconds))
    .map(accent => accentEnvelope(accent, timeSeconds))
    .sort((a, b) => a.atSeconds - b.atSeconds || a.id.localeCompare(b.id));
}

function assignAccents(instances, accents) {
  const assigned = new Map(instances.map((instance) => [instance.id, []]));
  const resolved = accents.map((accent) => {
    const target = accent.target || {};
    let instance = instances.find((candidate) => target.instanceId && candidate.id === target.instanceId)
      || instances.find((candidate) => target.visualizerId && candidate.visualizerId === target.visualizerId)
      || instances.find((candidate) => target.trackId && candidate.trackId === target.trackId);
    if (!instance && Number.isInteger(target.layerIndex)) instance = instances[target.layerIndex] || null;
    if (!instance) instance = instances[0] || null;
    if (instance) assigned.get(instance.id).push(accent);
    return { ...accent, assignedInstanceId: instance?.id || null };
  });
  return {
    accents: resolved,
    instances: instances.map((instance) => ({ ...instance, accents: assigned.get(instance.id) || [] })),
  };
}

export function evaluateHyperFramesVisualizers(show = {}, timeSeconds = 0, { soloStem = "" } = {}) {
  if (soloStem && !show.stemFrames?.performance) throw new Error("Visual signal isolation requires prepared song timing");
  const time = Number(timeSeconds);
  if (!Number.isFinite(time)) {
    return {
      schemaVersion: HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
      timeSeconds: null,
      layers: [],
      instances: [],
      diagnostics: [{ schemaVersion: HYPERFRAMES_VISUALIZER_DIAGNOSTIC_SCHEMA, status: "unsupported", reason: "invalid-time", issues: ["time-seconds-must-be-finite"], visible: true, silentDefault: false, drawableFrame: null }],
      accents: [],
      receipt: { activeCandidateIds: [], drawableInstanceIds: [], unsupportedInstanceIds: [], stableLayerOrder: true, halfOpenCueIntervals: true },
    };
  }

  const drawable = [];
  const diagnostics = [];
  const activeCandidateIds = [];
  // Evaluate each bus/envelope once for this frame, independent of the number
  // of layers and uniform mappings. Nothing is retained across seek calls.
  const preparedFrame = show.stemFrames?.performance ? evaluateEchoMusicPerformance({ ...show.stemFrames.performance,
    buses: [show.stemFrames.master, ...(show.stemFrames.stems || [])].filter(Boolean) }, time, { soloStem }) : null;
  const preparedModulation = show.automation?.preparedModulation ? evaluatePreparedDirectorModulation(isolateEchoPreparedModulation(show.automation.preparedModulation, soloStem), time) : [];
  for (const { instance, sourceIndex } of stableLayerRows(show)) {
    const window = cueWindow(instance);
    if (window.end <= window.start) {
      diagnostics.push(diagnostic(instance, window, ["invalid-cue-window"]));
      continue;
    }
    if (!activeHalfOpen(window, time)) continue;
    activeCandidateIds.push(text(instance.id));
    const contract = proxyContract(instance);
    if (!contract.ok) {
      const truthIssues = instance.rendererTruth?.status === "unsupported"
        ? [instance.rendererTruth.reason || "renderer-declared-unsupported", ...(instance.rendererTruth.fidelityLoss || [])]
        : [];
      diagnostics.push(diagnostic(instance, window, [...contract.issues, ...truthIssues]));
      continue;
    }
    const visualTime = visualTimeFor(show, instance, time, window);
    const signals = resolvedSignalFrame(show, instance, time, null, preparedFrame);
    const controls = mappedControls(
      instance,
      signals,
      (stemFocus) => resolvedSignalFrame(show, instance, time, stemFocus, preparedFrame),
    );
    if (show.automation?.preparedModulation) {
      for (const output of preparedModulation) {
        if (output.target?.kind !== "visualizer_uniform" || ![instance.id, instance.cueId].includes(output.target.visualizerId)) continue;
        const input = (instance.inputs || []).find(input => inputName(input) === output.target.uniform);
        if (!input || !["float", "long", "bool"].includes(inputType(input))) continue;
        const applied = applyPreparedVisualizerInput(input, controls.baseValues[output.target.uniform], instance.audioMap?.[output.target.uniform], output);
        if (!applied.applied) continue;
        controls.values[output.target.uniform] = applied.value;
        controls.bindings.push({ uniform: output.target.uniform, status: "prepared-absolute-modulation", value: applied.value,
          ...(applied.valueSpace ? { valueSpace: applied.valueSpace, signalFraction: applied.signalFraction, baseValue: applied.baseValue, effectiveDepth: applied.effectiveDepth } : {}),
          sourceFingerprint: show.automation.preparedModulation.sourceFingerprint });
      }
    }
    const presentationModulation = resolvedPresentationModulation(instance, signals);
    const transition = transitionEnvelope(instance, time, window);
    const opacity = clamp(instance.opacity, 0, 1);
    const visualizerMix = clamp(instance.visualizerMix, 0, 1);
    const declaredEffective = Number(instance.effectiveOpacity);
    const baseEffectiveOpacity = Number.isFinite(declaredEffective) ? clamp(declaredEffective) : opacity * visualizerMix;
    const effectiveOpacity = round(baseEffectiveOpacity * transition.alpha * (presentationModulation?.opacityMultiplier ?? 1));
    const bindingDiagnostics = [
      ...(signals.fallbackUsed ? ["requested-stem-absent-master-frame-used"] : []),
      ...(!signals.stem ? ["stem-and-master-frame-unavailable"] : []),
      ...controls.invalidAudioMapUniforms.map((uniform) => `audio-map-uniform-not-declared:${uniform}`),
      ...controls.bindings.filter((binding) => binding.status === "missing-signal").map((binding) => `signal-unavailable:${binding.signal}`),
    ];
    const resolvedProxyFrame = contract.liveIsf
      ? liveIsfFrame(contract, visualTime.visualTimeSeconds)
      : proxyFrame(contract, visualTime.visualTimeSeconds, presentationModulation);
    const declaredSignals = Array.isArray(instance.audioSignal) ? instance.audioSignal : [instance.audioSignal].filter(Boolean);
    const primarySignal = presentationModulation?.primaryValue
      ?? declaredSignals.map((signal) => signalValue(signals.stem?.frame, signal)).find((value) => value != null)
      ?? 0;
    const seed = canonicalHash(instance.pixelIdentitySeed);
    const pixelSignature = contract.liveIsf
      ? text(contract.sourceHash)
      : /^[a-f0-9]{64}$/.test(seed) ? `sha256:${seed}` : text(contract.proxy.assetSha256);
    drawable.push({
      id: text(instance.id),
      cueId: text(instance.cueId || instance.id),
      visualizerId: text(instance.visualizerId),
      sourceHash: contract.sourceHash,
      persistent: instance.alwaysOn === true,
      persistentSlotId: instance.persistentSlotId || null,
      locked: instance.locked === true,
      trackId: text(instance.trackId),
      cueIndex: Number.isFinite(Number(instance.cueIndex)) ? Number(instance.cueIndex) : null,
      layerOrder: Number.isFinite(Number(instance.layerOrder ?? instance.layerIndex ?? instance.zIndex))
        ? Number(instance.layerOrder ?? instance.layerIndex ?? instance.zIndex)
        : sourceIndex,
      cue: { startSeconds: window.start, endSeconds: window.end, durationSeconds: window.duration, activeInterval: "half-open" },
      canonicalAudioTimeSeconds: round(time),
      visualTime,
      proxy: contract.proxy,
      liveIsf: instance.liveIsf || null,
      proxyFrame: resolvedProxyFrame,
      frame: { index: resolvedProxyFrame.frameIndex, rect: resolvedProxyFrame.sourceRect },
      pixelSignature,
      pixelFrameIdentity: `${pixelSignature}#${resolvedProxyFrame.frameIndex}`,
      stemFrame: signals.stem,
      masterFrame: signals.master,
      stemSignal: round(primarySignal),
      signalValue: round(primarySignal),
      stemFocus: signals.requestedStem,
      stemResolution: { requested: signals.requestedStem, resolved: signals.resolvedStem, fallbackUsed: signals.fallbackUsed },
      controls: { ...(instance.controls || {}) },
      mappedControls: controls,
      controlValues: controls.values,
      controlBindings: controls.bindings,
      controlEnergy: controlEnergy(controls.values),
      presentationModulation,
      opacity: round(opacity),
      visualizerMix: round(visualizerMix),
      baseEffectiveOpacity: round(baseEffectiveOpacity),
      effectiveOpacity,
      blendMode: text(instance.blendMode || "screen"),
      target: text(instance.target || "program"),
      transition,
      transitionEnvelope: transition,
      transitionAlpha: transition.alpha,
      nativeRoute: contract.nativeRoute,
      rendererTruth: executionTruth(instance, contract),
      sourceRendererTruth: instance.rendererTruth || null,
      execution: {
        ...(instance.execution || {}),
        mode: "executed-offline-instance",
        status: "exact",
        route: text(instance.execution?.route || contract.nativeRoute?.route || "hash-bound-exact-proxy"),
        drawable: true,
        silentDefault: false,
        proxyFrameReady: true,
      },
      diagnostics: bindingDiagnostics,
      accents: [],
    });
  }
  const lyricTrack = show.instances?.lyrics?.[0];
  const visualAdmission = admitEchoSectionVisualLayers(drawable, show.automation?.visualBudgetPolicy, time, {
    mediaLayers: (show.instances?.media || []).filter(row => activeHalfOpen(cueWindow(row), time)).length,
    lyricLayers: lyricTrack?.contract?.enabled !== false && (lyricTrack?.lines || []).some(row => time >= Number(row.start ?? row.startSeconds) && time < Number(row.end ?? row.endSeconds)) ? 1 : 0,
    accentLayers: Math.min(lyricTrack?.contract?.reducedMotion ? 1 : 3, (show.automation?.accentTrack?.events || []).filter(event => activeHalfOpen(eventWindow(event), time)).length),
  });
  const accentAssignment = assignAccents(visualAdmission.layers, activeAccents(show, time));
  const layers = accentAssignment.instances;
  return {
    schemaVersion: HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
    showHash: text(show.showHash) || null,
    timeSeconds: round(time),
    layers,
    instances: layers,
    diagnostics,
    accents: accentAssignment.accents,
    visualBudget: visualAdmission.receipt,
    receipt: {
      activeCandidateIds,
      drawableInstanceIds: layers.map((instance) => instance.id),
      unsupportedInstanceIds: diagnostics.filter((entry) => activeCandidateIds.includes(entry.instanceId)).map((entry) => entry.instanceId),
      stableLayerOrder: true,
      halfOpenCueIntervals: true,
      runtimeDecisionCalls: false,
      runtimeAudioAnalysis: false,
      randomCalls: false,
      wallClockCalls: false,
      networkCalls: false,
    },
  };
}

export const HapaHyperFramesVisualizerRuntime = Object.freeze({
  schemaVersion: HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
  evaluateHyperFramesVisualizers,
});

if (typeof globalThis === "object") {
  globalThis.HapaHyperFramesVisualizerRuntime = HapaHyperFramesVisualizerRuntime;
}
