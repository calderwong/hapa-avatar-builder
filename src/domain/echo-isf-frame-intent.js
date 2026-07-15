import {
  applyVisualizerAudioMapping,
  normalizeVisualizerAudioMapping,
  visualizerAudioMappingDepthMode,
} from "./hyperframes-visualizer-runtime.js";

export const ECHO_ISF_FRAME_RECEIPT_SCHEMA = "hapa.echo.isf-frame-receipt.v1";

const SUPPORTED_VALUE_TYPES = new Set(["float", "long", "bool", "event", "color", "point2d"]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableStringify(value) {
  return JSON.stringify(stable(value));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(stableStringify(value))) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function inputName(input = {}) {
  return String(input.NAME || input.name || "");
}

function inputType(input = {}) {
  return String(input.TYPE || input.type || "").toLowerCase();
}

function inputField(input, upper, lower) {
  return input?.[upper] ?? input?.[lower];
}

function scalarBounds(input, fallbackMin = -Number.MAX_SAFE_INTEGER, fallbackMax = Number.MAX_SAFE_INTEGER) {
  return {
    min: finite(inputField(input, "MIN", "min"), fallbackMin),
    max: finite(inputField(input, "MAX", "max"), fallbackMax),
  };
}

function vectorBounds(input, length, fallbackMin, fallbackMax) {
  const minimum = inputField(input, "MIN", "min");
  const maximum = inputField(input, "MAX", "max");
  return {
    min: Array.from({ length }, (_, index) => finite(Array.isArray(minimum) ? minimum[index] : minimum, fallbackMin[index])),
    max: Array.from({ length }, (_, index) => finite(Array.isArray(maximum) ? maximum[index] : maximum, fallbackMax[index])),
  };
}

export function normalizeEchoIsfInputValue(input = {}, value) {
  const type = inputType(input);
  if (type === "bool" || type === "event") {
    if (typeof value === "string") return !["", "0", "false", "off", "no"].includes(value.trim().toLowerCase());
    return Boolean(value);
  }
  if (type === "long") {
    const values = inputField(input, "VALUES", "values");
    const bounds = scalarBounds(input);
    const rounded = Math.round(clamp(finite(value), bounds.min, bounds.max));
    if (!Array.isArray(values) || values.length === 0) return rounded;
    const numeric = values.map((candidate) => finite(candidate));
    return numeric.reduce((closest, candidate) => (
      Math.abs(candidate - rounded) < Math.abs(closest - rounded) ? candidate : closest
    ), numeric[0]);
  }
  if (type === "color" || type === "point2d") {
    const length = type === "color" ? 4 : 2;
    const fallback = type === "color" ? [0, 0, 0, 1] : [0, 0];
    const source = Array.isArray(value) ? value : fallback;
    const bounds = vectorBounds(
      input,
      length,
      Array(length).fill(type === "color" ? 0 : -Number.MAX_SAFE_INTEGER),
      Array(length).fill(type === "color" ? 1 : Number.MAX_SAFE_INTEGER),
    );
    return Array.from({ length }, (_, index) => round(clamp(source[index] ?? fallback[index], bounds.min[index], bounds.max[index])));
  }
  const bounds = scalarBounds(input);
  return round(clamp(finite(value), bounds.min, bounds.max));
}

export function echoIsfManifestDefaults(shader = {}) {
  const values = {};
  for (const input of shader.inputs || []) {
    const name = inputName(input);
    const type = inputType(input);
    if (!name || type === "image" || !SUPPORTED_VALUE_TYPES.has(type)) continue;
    const declaredDefault = inputField(input, "DEFAULT", "default");
    const fallback = type === "bool" || type === "event"
      ? false
      : type === "color"
        ? [0, 0, 0, 1]
        : type === "point2d"
          ? [0, 0]
          : type === "long"
            ? (inputField(input, "VALUES", "values")?.[0] ?? 0)
            : 0;
    values[name] = normalizeEchoIsfInputValue(input, declaredDefault ?? fallback);
  }
  return values;
}

function portableCard(card = {}) {
  return card?.visualization?.card || {};
}

function mergedAudioMap(shader = {}, card = {}) {
  return { ...(shader.audioMap || {}), ...(portableCard(card).audioMap || {}) };
}

function parsedAudioMapping(mapping, defaultStem = "master") {
  const normalized = normalizeVisualizerAudioMapping(mapping, {
    generated: typeof mapping === "string",
    materializeDepth: false,
  }) || { signal: "off" };
  return {
    ...normalized,
    signal: String(normalized.signal || "off").toLowerCase(),
    stemFocus: String(normalized.stemFocus || normalized.stem_focus || defaultStem),
  };
}

function normalizedStemKey(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["leadvocals", "leadvoice", "voice"].includes(normalized)) return "vocals";
  if (["backingvocals", "backgroundvocals", "bgvocals"].includes(normalized)) return "backingvocals";
  if (["mastermix", "mix", "fullmix"].includes(normalized)) return "master";
  return normalized;
}

function resolveSignalFrame(signalFrames = {}, requestedStem = "master") {
  const frameEntries = Object.entries(signalFrames || {});
  const requestedKey = normalizedStemKey(requestedStem);
  const requestedEntry = frameEntries.find(([key]) => key === requestedStem)
    || frameEntries.find(([key]) => normalizedStemKey(key) === requestedKey);
  const masterEntry = frameEntries.find(([key]) => normalizedStemKey(key) === "master");
  const fallbackUsed = !requestedEntry && requestedKey !== "master" && Boolean(masterEntry);
  const resolvedEntry = requestedEntry || (fallbackUsed ? masterEntry : null);
  return {
    requestedStem: String(requestedStem || "master"),
    requestedStemPresent: Boolean(requestedEntry),
    resolvedStem: String(resolvedEntry?.[0] || requestedStem || "master"),
    fallbackUsed,
    frame: normalizedSignalFrame(resolvedEntry?.[1] || {}),
  };
}

export function echoIsfRequiredStemFocuses(card = {}, shader = {}) {
  const portable = portableCard(card);
  const defaultStem = String(portable.stemFocus || card?.visualization?.stemFocus || "master");
  return [...new Set([
    defaultStem,
    ...Object.values(mergedAudioMap(shader, card)).map((mapping) => parsedAudioMapping(mapping, defaultStem).stemFocus),
  ].map((role) => String(role || "master")).filter(Boolean))];
}

export function validateEchoIsfCardBindings(shader = {}, card = {}) {
  const declared = new Set((shader.inputs || []).map(inputName).filter(Boolean));
  const audioMap = mergedAudioMap(shader, card);
  const invalidAudioMapUniforms = Object.keys(audioMap).filter((uniform) => !declared.has(uniform)).sort();
  return {
    ok: invalidAudioMapUniforms.length === 0,
    audioMap,
    invalidAudioMapUniforms,
    errors: invalidAudioMapUniforms.map((uniform) => `audio-map-uniform-not-declared:${uniform}`),
  };
}

function mediaReady(media) {
  if (!media) return false;
  if (typeof media.ready === "boolean") return media.ready;
  const width = finite(media.videoWidth || media.naturalWidth || media.width);
  const height = finite(media.videoHeight || media.naturalHeight || media.height);
  if (typeof media.readyState === "number") return media.readyState >= 2 && width > 0 && height > 0;
  if (typeof media.complete === "boolean") return media.complete && width > 0 && height > 0;
  return width > 0 && height > 0;
}

function mediaKind(media) {
  return String(media?.tagName || media?.constructor?.name || (media ? "media" : "missing")).toLowerCase();
}

const COMPOSITES = Object.freeze({
  normal: "source-over",
  source: "source-over",
  screen: "screen",
  add: "lighter",
  additive: "lighter",
  lighter: "lighter",
  "plus-lighter": "lighter",
  multiply: "multiply",
  overlay: "overlay",
  difference: "difference",
  exclusion: "exclusion",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  "hard-light": "hard-light",
  "soft-light": "soft-light",
});

function transitionAlpha(card, timestampSeconds, override) {
  if (Number.isFinite(Number(override))) return round(clamp(override));
  const transition = String(card?.transition || "cut").toLowerCase();
  if (!/(fade|cross|dissolve)/.test(transition)) return 1;
  const duration = Math.max(0.001, finite(card?.transitionDurationSeconds || card?.parameters?.transitionDurationSeconds, 0.35));
  const start = finite(card?.startSeconds, timestampSeconds);
  const end = finite(card?.endSeconds, timestampSeconds + duration);
  return round(Math.min(clamp((timestampSeconds - start) / duration), clamp((end - timestampSeconds) / duration)));
}

export function normalizeEchoIsfComposition(card = {}, timestampSeconds = 0, overrides = {}) {
  const layer = portableCard(card).layer || {};
  const parameters = card.parameters || {};
  const opacity = round(clamp(overrides.opacity ?? parameters.opacity ?? layer.opacity ?? 1));
  const mix = round(clamp(overrides.mix ?? parameters.mix ?? layer.mix ?? 1));
  const blend = String(overrides.blend || overrides.blendMode || parameters.blendMode || layer.blend || "normal").toLowerCase();
  const normalized = {
    opacity,
    mix,
    blend,
    canvasComposite: COMPOSITES[blend] || "source-over",
    target: String(overrides.target || parameters.target || layer.target || "program"),
    transitionAlpha: transitionAlpha(card, timestampSeconds, overrides.transitionAlpha),
  };
  return { ...normalized, effectiveAlpha: round(normalized.opacity * normalized.mix * normalized.transitionAlpha) };
}

function normalizedSignalFrame(frame = {}) {
  return Object.fromEntries(Object.entries(frame || {}).flatMap(([signal, value]) => {
    const candidate = typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value)
      ? value.value
      : value;
    const number = Number(candidate);
    return Number.isFinite(number) ? [[signal, round(clamp(number))]] : [];
  }));
}

export function buildEchoIsfFrameIntent({
  shader = {},
  card = {},
  timestampSeconds = 0,
  sourceHash = "",
  values: explicitValues = {},
  signalFrames = {},
  audio = null,
  imageInputs = {},
  mediaElement = null,
  mediaIdentity = {},
  composition: compositionOverrides = {},
} = {}) {
  const timestamp = round(timestampSeconds);
  const inputs = shader.inputs || [];
  const byName = new Map(inputs.map((input) => [inputName(input), input]));
  const defaults = echoIsfManifestDefaults(shader);
  const portable = portableCard(card);
  const controls = { ...(portable.controls || {}), ...(card.parameters?.visualizerControls || {}) };
  const finalValues = { ...defaults };
  const controlsApplied = [];
  const explicitValuesApplied = [];
  const unknownControls = [];
  for (const [name, value] of Object.entries(controls)) {
    const input = byName.get(name);
    if (!input || inputType(input) === "image") { unknownControls.push(name); continue; }
    finalValues[name] = normalizeEchoIsfInputValue(input, value);
    controlsApplied.push(name);
  }
  for (const [name, value] of Object.entries(explicitValues || {})) {
    const input = byName.get(name);
    if (!input || inputType(input) === "image") continue;
    finalValues[name] = normalizeEchoIsfInputValue(input, value);
    explicitValuesApplied.push(name);
  }

  const validation = validateEchoIsfCardBindings(shader, card);
  const requestedStem = String(portable.stemFocus || card?.visualization?.stemFocus || "master");
  const frames = Object.keys(signalFrames || {}).length ? signalFrames : audio ? { master: audio } : {};
  const defaultStemResolution = resolveSignalFrame(frames, requestedStem);
  const { requestedStemPresent, resolvedStem, fallbackUsed, frame: resolvedFrame } = defaultStemResolution;
  const modulationBindings = [];
  for (const [uniform, rawMapping] of Object.entries(validation.audioMap)) {
    const mapping = parsedAudioMapping(rawMapping, requestedStem);
    const mappingStem = resolveSignalFrame(frames, mapping.stemFocus);
    const mappingFrame = mappingStem.frame;
    const input = byName.get(uniform);
    if (!input) continue;
    const signal = String(mapping?.signal || "off");
    if (inputType(input) === "image") {
      modulationBindings.push({
        uniform,
        signal,
        requestedStem: mappingStem.requestedStem,
        resolvedStem: mappingStem.resolvedStem,
        fallbackUsed: mappingStem.fallbackUsed,
        status: "image-input-handled-separately",
        signalValue: null,
        depth: mapping?.depth ?? 0,
        baseValue: null,
        value: null,
      });
      continue;
    }
    const signalPresent = signal !== "off" && Object.prototype.hasOwnProperty.call(mappingFrame, signal);
    const baseValue = finalValues[uniform];
    const applied = signalPresent
      ? applyVisualizerAudioMapping(input, baseValue, mappingFrame[signal], mapping, { normalize: normalizeEchoIsfInputValue })
      : null;
    if (signalPresent) {
      finalValues[uniform] = applied.value;
    }
    modulationBindings.push({
      uniform,
      signal,
      requestedStem: mappingStem.requestedStem,
      resolvedStem: mappingStem.resolvedStem,
      fallbackUsed: mappingStem.fallbackUsed,
      status: signal === "off" ? "disabled" : signalPresent ? "mapped" : "missing-signal",
      signalValue: signalPresent ? mappingFrame[signal] : null,
      depth: applied?.depth ?? mapping.depth ?? 0,
      effectiveDepth: applied?.effectiveDepth ?? null,
      depthMode: visualizerAudioMappingDepthMode(mapping),
      depthFraction: visualizerAudioMappingDepthMode(mapping) === "absolute" ? null : mapping.depthFraction ?? mapping.depth_fraction ?? mapping.depth ?? 0.2,
      direction: applied?.direction ?? null,
      headroomPolicy: applied?.headroomPolicy ?? null,
      baseValue,
      value: finalValues[uniform],
    });
  }

  const manifestImages = inputs.filter((input) => inputType(input) === "image").map(inputName).filter(Boolean);
  const filterRequiresMedia = String(shader.shaderType || "").toLowerCase() === "filter";
  // A legacy manifest row for God Rays lost its parsed INPUTS even though its
  // source declares inputImage. The filter contract is still unambiguous: a
  // filter must receive the current frame and must never render a blank stand-in.
  const declaredImages = filterRequiresMedia && manifestImages.length === 0 ? ["inputImage"] : manifestImages;
  const boundImageInputs = {};
  const imageBindings = declaredImages.map((name) => {
    const media = imageInputs?.[name] || mediaElement;
    const ready = mediaReady(media);
    if (ready) boundImageInputs[name] = media;
    return { name, ready, kind: mediaKind(media), source: imageInputs?.[name] ? "explicit-image-input" : mediaElement ? "current-media" : "missing" };
  });
  const mediaSatisfied = !filterRequiresMedia || (declaredImages.length > 0 && imageBindings.every((binding) => binding.ready));
  const errors = [...validation.errors];
  if (!mediaSatisfied) errors.push("filter-media-input-not-ready");
  const composition = normalizeEchoIsfComposition(card, timestamp, compositionOverrides);

  const cardReceipt = {
    id: String(card.id || ""),
    sourceCueIndex: card.sourceCueIndex ?? card.visualization?.sourceCueIndex ?? null,
    requestedSourceId: String(card.requestedSourceId || card.visualization?.requestedSourceId || ""),
    sourceId: String(card.visualization?.sourceId || ""),
    portableCardId: String(portable.id || ""),
  };
  cardReceipt.hash = stableHash(cardReceipt);
  const inputReceipt = {
    values: finalValues,
    defaultsApplied: Object.keys(defaults),
    controlsApplied: controlsApplied.sort(),
    explicitValuesApplied: explicitValuesApplied.sort(),
    unknownControls: unknownControls.sort(),
    invalidAudioMapUniforms: validation.invalidAudioMapUniforms,
    modulationBindings,
  };
  inputReceipt.hash = stableHash(inputReceipt);
  const mediaReceipt = {
    required: filterRequiresMedia,
    declaredInputs: declaredImages,
    inferredFilterInput: filterRequiresMedia && manifestImages.length === 0,
    bindings: imageBindings,
    ready: imageBindings.length > 0 && imageBindings.every((binding) => binding.ready),
    satisfied: mediaSatisfied,
    id: String(mediaIdentity.id || card.media?.id || ""),
    sourceHash: String(mediaIdentity.sourceHash || card.media?.sourceHash || ""),
    uri: String(mediaIdentity.uri || mediaElement?.currentSrc || mediaElement?.src || card.media?.localPath || ""),
  };
  mediaReceipt.hash = stableHash(mediaReceipt);
  const stemReceipt = {
    requestedStem,
    requestedStemPresent,
    resolvedStem,
    fallbackUsed,
    fallbackReason: fallbackUsed ? "requested-stem-absent-master-frame-used" : "",
    frame: resolvedFrame,
  };
  stemReceipt.hash = stableHash(stemReceipt);
  const receiptBase = {
    schemaVersion: ECHO_ISF_FRAME_RECEIPT_SCHEMA,
    timestampSeconds: timestamp,
    shaderId: String(shader.id || ""),
    sourceHash: String(sourceHash || ""),
    card: cardReceipt,
    input: inputReceipt,
    media: mediaReceipt,
    stem: stemReceipt,
    composition,
  };
  const frameReceipt = { ...receiptBase, receiptHash: stableHash(receiptBase) };
  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? "ready" : "input-error",
    error: errors.join(", "),
    errors,
    values: finalValues,
    imageInputs: boundImageInputs,
    composition,
    frameReceipt,
  };
}
