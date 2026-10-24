// Score Dust colour and comfort, shared by the 2D preview, video export and the
// 3D layer so every host colours the same particle the same way.
//
// - Presets and per-section palettes (direction.colour.preset / direction.palettes)
// - Colour modes: palette, frequency, speed, height, depth, picture
// - Dynamics, all deterministic in song time: palette crossfades at section
//   changes, lift flashes, break desaturation, brighter returns
// - Comfort: a flash gate (never more than 3 bright flashes per second) and a
//   reduced-motion mode.

export const DUST_COLOUR_MODES = Object.freeze(["palette", "frequency", "speed", "height", "depth", "picture"]);
export const DUST_FLASH_LIMIT_PER_SECOND = 3;

const hsl = (h, s, l) => ({ h, s, l });
export const DUST_COLOUR_PRESETS = Object.freeze({
  neon: [hsl(188, 0.95, 0.58), hsl(300, 0.9, 0.62), hsl(90, 0.9, 0.55)],
  monochrome: [hsl(210, 0.08, 0.86), hsl(210, 0.06, 0.66), hsl(210, 0.05, 0.48)],
  sunset: [hsl(18, 0.92, 0.58), hsl(338, 0.8, 0.6), hsl(45, 0.95, 0.6)],
  ice: [hsl(195, 0.7, 0.74), hsl(215, 0.65, 0.62), hsl(180, 0.45, 0.84)],
  ember: [hsl(8, 0.9, 0.5), hsl(28, 0.95, 0.56), hsl(48, 0.95, 0.62)],
  red: [hsl(355, 0.88, 0.56), hsl(15, 0.85, 0.6), hsl(335, 0.7, 0.66)],
  green: [hsl(145, 0.75, 0.52), hsl(95, 0.7, 0.56), hsl(170, 0.65, 0.6)],
  blue: [hsl(205, 0.9, 0.58), hsl(230, 0.8, 0.64), hsl(185, 0.8, 0.6)],
});
export const DUST_COLOUR_PRESET_LABELS = Object.freeze({ neon: "Neon", monochrome: "Monochrome", sunset: "Sunset", ice: "Ice", ember: "Ember", red: "Red perspective", green: "Green perspective", blue: "Blue perspective" });

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smoothstep = (x) => { const v = clamp(x); return v * v * (3 - 2 * v); };

/** HSL (h in degrees, s/l 0..1) → linear-ish sRGB 0..1. */
export function hslToRgb({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4) };
}

/** Preset palette for a repeat group: rotate the preset so groups differ but stay in family. */
export function presetPaletteFor(preset, groupIndex = 0) {
  const base = DUST_COLOUR_PRESETS[preset];
  if (!base) return null;
  const shift = (groupIndex * 23) % 60 - 30;
  return base.map((c) => ({ h: Math.round(((c.h + (preset === "monochrome" ? 0 : shift)) % 360 + 360) % 360), s: c.s, l: c.l }));
}

export function normalizeDustColour(colour = {}) {
  return {
    mode: DUST_COLOUR_MODES.includes(colour.mode) ? colour.mode : "palette",
    preset: DUST_COLOUR_PRESETS[colour.preset] ? colour.preset : null,
    crossfadeSeconds: Number.isFinite(colour.crossfadeSeconds) ? clamp(colour.crossfadeSeconds, 0, 4) : 1.2,
    liftFlash: colour.liftFlash !== false,
    breakDesaturate: colour.breakDesaturate !== false,
    brighterReturns: colour.brighterReturns !== false,
  };
}

function paletteRgb(score, cue, returns) {
  const motif = score.motifs.find((m) => m.id === cue.motifId);
  const lift = returns ? Math.min(0.15, 0.05 * (cue.occurrence || 0)) : 0;
  return (score.palettes[motif?.paletteId] || [hsl(190, 0.8, 0.6)]).map((c) => hslToRgb({ ...c, l: Math.min(0.9, c.l + lift) }));
}

/**
 * Colour state for song time t: crossfaded palette (rgb 0..1), flash and
 * desaturation. Deterministic in t (flash comes from the performance gate).
 */
export function dustColourStyle(playback, state, t, { flash = 0 } = {}) {
  const score = playback.score, colour = normalizeDustColour(score.colour);
  const cue = state.cue, index = score.cues.indexOf(cue);
  let palette = paletteRgb(score, cue, colour.brighterReturns);
  const into = t - cue.start;
  if (index > 0 && colour.crossfadeSeconds > 0 && into < colour.crossfadeSeconds) {
    const previous = paletteRgb(score, score.cues[index - 1], colour.brighterReturns), w = smoothstep(into / colour.crossfadeSeconds);
    palette = palette.map((c, i) => { const p = previous[i % previous.length]; return { r: p.r + (c.r - p.r) * w, g: p.g + (c.g - p.g) * w, b: p.b + (c.b - p.b) * w }; });
  }
  // Breaks and quiet passages drain colour; a recent "calm" response deepens it.
  let desaturate = 0;
  if (colour.breakDesaturate) {
    const calm = score.events.filter((e) => e.response === "calm" && t >= e.at && t - e.at < 4).map((e) => 1 - (t - e.at) / 4);
    desaturate = clamp(Math.max(0, (0.3 - state.intensity) * 1.6, ...calm) * 0.65);
  }
  return { mode: colour.mode, palette, flash: colour.liftFlash ? clamp(flash) : 0, desaturate };
}

/** Smooth ramp through the palette for continuous modes. */
function ramp(palette, u, out) {
  const x = clamp(u) * (palette.length - 1), i = Math.min(palette.length - 2, Math.floor(x)), f = x - i;
  if (palette.length === 1) { out.r = palette[0].r; out.g = palette[0].g; out.b = palette[0].b; return out; }
  const a = palette[i], b = palette[i + 1];
  out.r = a.r + (b.r - a.r) * f; out.g = a.g + (b.g - a.g) * f; out.b = a.b + (b.b - a.b) * f;
  return out;
}

/**
 * Fill per-particle RGB (0..1) for the style's mode. `rotation` lets depth
 * follow the formation turn; picture mode uses swarm.tint when present.
 */
export function computeDustColours(swarm, style, out = new Float32Array(swarm.count * 3), { rotation = 0 } = {}) {
  const { palette, mode, flash, desaturate } = style, c = { r: 0, g: 0, b: 0 };
  const cr = Math.cos(rotation), sr = Math.sin(rotation), hasTint = mode === "picture" && swarm.tintActive;
  for (let i = 0; i < swarm.count; i++) {
    const i3 = i * 3;
    if (hasTint) { c.r = swarm.tint[i3] / 255; c.g = swarm.tint[i3 + 1] / 255; c.b = swarm.tint[i3 + 2] / 255; }
    else if (mode === "frequency") ramp(palette, swarm.param[i], c);
    else if (mode === "speed") ramp(palette, Math.hypot(swarm.velocity[i3], swarm.velocity[i3 + 1], swarm.velocity[i3 + 2]) / 2.5, c);
    else if (mode === "height") ramp(palette, (swarm.position[i3 + 1] + 1.3) / 2.6, c);
    else if (mode === "depth") ramp(palette, (swarm.position[i3] * sr + swarm.position[i3 + 2] * cr + 1.5) / 3, c);
    else { const p = palette[i % palette.length]; c.r = p.r; c.g = p.g; c.b = p.b; }
    if (desaturate > 0) { const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; c.r += (y - c.r) * desaturate; c.g += (y - c.g) * desaturate; c.b += (y - c.b) * desaturate; }
    if (flash > 0) { c.r += (1 - c.r) * flash; c.g += (1 - c.g) * flash; c.b += (1 - c.b) * flash; }
    out[i3] = c.r; out[i3 + 1] = c.g; out[i3 + 2] = c.b;
  }
  return out;
}

/**
 * Deterministic flash gate: a bright flash is allowed only when the previous
 * allowed flash is at least 1/limit seconds earlier. Motion is never gated.
 */
export function createFlashGate(limitPerSecond = DUST_FLASH_LIMIT_PER_SECOND) {
  const limit = clamp(Number(limitPerSecond), 0, DUST_FLASH_LIMIT_PER_SECOND);
  let last = -Infinity, level = 0, allowed = 0, blocked = 0;
  return {
    request(t, strength = 1) {
      if (limit <= 0 || t - last < 1 / limit) { blocked++; return false; }
      last = t; level = Math.max(level, clamp(strength)); allowed++; return true;
    },
    decay(dt) { level *= Math.exp(-dt / 0.12); if (level < 0.002) level = 0; },
    reset() { last = -Infinity; level = 0; allowed = 0; blocked = 0; },
    get level() { return level; },
    stats: () => ({ allowed, blocked, limitPerSecond: limit }),
  };
}

/** "#rrggbb" ↔ palette HSL, for colour pickers. */
export function hslToHex(c) {
  const { r, g, b } = hslToRgb(c), h = (v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const v = parseInt(m[1], 16), r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l: Math.round(l * 1000) / 1000 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h: Math.round(h * 10) / 10 % 360, s: Math.round(clamp(s) * 1000) / 1000, l: Math.round(l * 1000) / 1000 };
}
