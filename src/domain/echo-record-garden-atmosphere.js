const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const smoothstep = (value) => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};

const mix = (from, to, amount) => from + (to - from) * amount;

const mixColor = (from, to, amount) => {
  const fromRed = (from >> 16) & 255;
  const fromGreen = (from >> 8) & 255;
  const fromBlue = from & 255;
  const toRed = (to >> 16) & 255;
  const toGreen = (to >> 8) & 255;
  const toBlue = to & 255;
  const red = Math.round(mix(fromRed, toRed, amount));
  const green = Math.round(mix(fromGreen, toGreen, amount));
  const blue = Math.round(mix(fromBlue, toBlue, amount));
  return (red << 16) | (green << 8) | blue;
};

const phase = (name, progress, values) => Object.freeze({ name, progress, ...values });

export const ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES = Object.freeze([
  phase("sunrise", 0, {
    skyTint: 0xffc5ad,
    backgroundColor: 0xf0ac91,
    fogColor: 0xe4c2ad,
    fogDensity: 0.019,
    sunColor: 0xffb56a,
    sunIntensity: 2.45,
    sunX: -11,
    sunY: 4.8,
    sunZ: 6.5,
    fillSkyColor: 0xc8b4cf,
    fillGroundColor: 0x5f704a,
    fillIntensity: 0.67,
    bounceColor: 0xff9870,
    bounceIntensity: 0.42,
    environmentIntensity: 0.46,
    cloudColor: 0xffd9c9,
    cloudOpacity: 0.58,
    moteColor: 0xffc47c,
    moteOpacity: 0.28,
    moteSize: 0.065,
    bulbEmissiveIntensity: 0.58,
    windScale: 0.68,
  }),
  phase("high-noon", 0.32, {
    skyTint: 0xffffff,
    backgroundColor: 0xc8e5ed,
    fogColor: 0xbcd9d7,
    fogDensity: 0.0165,
    sunColor: 0xfff0cf,
    sunIntensity: 3.25,
    sunX: -8,
    sunY: 12,
    sunZ: 7,
    fillSkyColor: 0x8ec5f0,
    fillGroundColor: 0x6b8f4e,
    fillIntensity: 0.92,
    bounceColor: 0xffd9a8,
    bounceIntensity: 0.28,
    environmentIntensity: 0.72,
    cloudColor: 0xfffcf0,
    cloudOpacity: 0.64,
    moteColor: 0xffedaa,
    moteOpacity: 0.34,
    moteSize: 0.07,
    bulbEmissiveIntensity: 0.3,
    windScale: 1,
  }),
  phase("sunset", 0.68, {
    skyTint: 0xffa07d,
    backgroundColor: 0xc97876,
    fogColor: 0xb48288,
    fogDensity: 0.021,
    sunColor: 0xff8759,
    sunIntensity: 2,
    sunX: 10,
    sunY: 3.4,
    sunZ: 4,
    fillSkyColor: 0x8c75a5,
    fillGroundColor: 0x4a513f,
    fillIntensity: 0.56,
    bounceColor: 0xff7a5c,
    bounceIntensity: 0.48,
    environmentIntensity: 0.4,
    cloudColor: 0xffb09b,
    cloudOpacity: 0.48,
    moteColor: 0xffa66b,
    moteOpacity: 0.4,
    moteSize: 0.075,
    bulbEmissiveIntensity: 1.2,
    windScale: 0.78,
  }),
  phase("night", 1, {
    skyTint: 0x293a70,
    backgroundColor: 0x101b3a,
    fogColor: 0x18233e,
    fogDensity: 0.025,
    sunColor: 0x8dacf2,
    sunIntensity: 0.62,
    sunX: 6,
    sunY: 8,
    sunZ: -4,
    fillSkyColor: 0x5a70a8,
    fillGroundColor: 0x22322d,
    fillIntensity: 0.32,
    bounceColor: 0x9c79d8,
    bounceIntensity: 0.18,
    environmentIntensity: 0.2,
    cloudColor: 0x8290b5,
    cloudOpacity: 0.25,
    moteColor: 0x8ddcff,
    moteOpacity: 0.42,
    moteSize: 0.06,
    bulbEmissiveIntensity: 1.8,
    windScale: 0.48,
  }),
]);

export const ECHO_RECORD_GARDEN_DEFAULT_ATMOSPHERE_PHASE = "high-noon";

const phaseAliases = Object.freeze({
  dawn: "sunrise",
  morning: "sunrise",
  noon: "high-noon",
  midday: "high-noon",
  afternoon: "high-noon",
  dusk: "sunset",
  evening: "sunset",
  midnight: "night",
});

function findNamedPhase(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  const name = phaseAliases[normalized] || normalized;
  return ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES.find((entry) => entry.name === name) || null;
}

export function resolveEchoRecordGardenAtmosphereProgress(
  value,
  fallback = ECHO_RECORD_GARDEN_DEFAULT_ATMOSPHERE_PHASE,
) {
  if (value && typeof value === "object") {
    if (Number.isFinite(Number(value.progress))) return clamp01(value.progress);
    if (value.phase != null) return resolveEchoRecordGardenAtmosphereProgress(value.phase, fallback);
  }
  if (typeof value === "number" && Number.isFinite(value)) return clamp01(value);
  const named = findNamedPhase(value);
  if (named) return named.progress;
  const fallbackNamed = findNamedPhase(fallback);
  if (fallbackNamed) return fallbackNamed.progress;
  if (typeof fallback === "number" && Number.isFinite(fallback)) return clamp01(fallback);
  return ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES[1].progress;
}

export function getNextEchoRecordGardenAtmospherePhase(value) {
  const progress = resolveEchoRecordGardenAtmosphereProgress(value);
  const next = ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES.find((entry) => entry.progress > progress + 1e-6);
  return next || ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES[0];
}

const colorFields = [
  "skyTint",
  "backgroundColor",
  "fogColor",
  "sunColor",
  "fillSkyColor",
  "fillGroundColor",
  "bounceColor",
  "cloudColor",
  "moteColor",
];

const scalarFields = [
  "fogDensity",
  "sunIntensity",
  "sunX",
  "sunY",
  "sunZ",
  "fillIntensity",
  "bounceIntensity",
  "environmentIntensity",
  "cloudOpacity",
  "moteOpacity",
  "moteSize",
  "bulbEmissiveIntensity",
  "windScale",
];

/**
 * Resolve a normalized atmosphere frame without any Three.js dependency.
 * Passing an output object lets the render loop reuse storage per frame.
 */
export function resolveEchoRecordGardenAtmosphere(value, output = {}) {
  const progress = resolveEchoRecordGardenAtmosphereProgress(value);
  const exact = ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES.find(
    (candidate) => Math.abs(progress - candidate.progress) <= 1e-9,
  );
  let from = exact || ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES[0];
  let to = from;
  if (!exact) {
    for (let index = 1; index < ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES.length; index += 1) {
      const candidate = ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES[index];
      if (progress <= candidate.progress) {
        to = candidate;
        break;
      }
      from = candidate;
      to = candidate;
    }
  }
  const span = Math.max(1e-6, to.progress - from.progress);
  const blend = from === to ? 0 : smoothstep((progress - from.progress) / span);
  output.progress = progress;
  output.fromPhase = from.name;
  output.toPhase = to.name;
  output.blend = blend;
  for (const field of colorFields) output[field] = mixColor(from[field], to[field], blend);
  for (const field of scalarFields) output[field] = mix(from[field], to[field], blend);
  return output;
}

/** Interpolates two explicit atmosphere states, including the cyclic night → sunrise seam. */
export function interpolateEchoRecordGardenAtmospheres(fromValue, toValue, amount, output = {}) {
  const from = resolveEchoRecordGardenAtmosphere(fromValue, {});
  const to = resolveEchoRecordGardenAtmosphere(toValue, {});
  const blend = smoothstep(amount);
  const dominantPhase = (frame) => frame.blend >= 0.5 ? frame.toPhase : frame.fromPhase;
  output.progress = mix(from.progress, to.progress, blend);
  output.fromPhase = dominantPhase(from);
  output.toPhase = dominantPhase(to);
  output.blend = blend;
  for (const field of colorFields) output[field] = mixColor(from[field], to[field], blend);
  for (const field of scalarFields) output[field] = mix(from[field], to[field], blend);
  return output;
}
