// Reusable Score Dust looks (P2 item 19). A look is the song-independent part
// of a direction: colour, instrument responses, moment responses, base hue,
// density and comfort/particle settings. Anything tied to one analysis (repeat
// group families, palettes, pictures, phrases, camera moves) or to one song
// (seed, pulse) stays with that song's direction.
import { validateEchoScoreDirection } from "./echo-visual-score.js";

export const DUST_LOOK_SCHEMA = "hapa.echo.dust-look.v1";
const LOOK_KEYS = ["colour", "background", "stemResponses", "eventResponses", "baseHue", "maxDensity"];
const LOOK_PLAY_KEYS = ["reducedMotion", "flashLimitPerSecond", "particleCount"];

/** Built-in starting points; saved looks with the same name take precedence. */
export const BUILTIN_DUST_LOOKS = Object.freeze([
  { name: "Club", builtin: true, look: { colour: { preset: "neon", mode: "frequency", liftFlash: true, brighterReturns: true }, eventResponses: { lift: "shock" }, stemResponses: { drums: 1, bass: 1, vocals: 0.8, harmony: 0.6 } } },
  { name: "Calm", builtin: true, look: { colour: { preset: "ice", mode: "height", liftFlash: false, crossfadeSeconds: 2.5 }, eventResponses: { lift: "gather", fall: "calm" }, stemResponses: { drums: 0.3, bass: 0.6, vocals: 1, harmony: 1 }, playSettings: { flashLimitPerSecond: 1 } } },
  { name: "Film", builtin: true, look: { colour: { preset: "monochrome", mode: "depth", liftFlash: false, breakDesaturate: true }, background: { kind: "gradient", colour: "#1a1a1f", colour2: "#050506", shape: "radial" }, maxDensity: 0.8 } },
  { name: "Album", builtin: true, look: { colour: { preset: "album", mode: "palette", crossfadeSeconds: 2 }, background: { kind: "palette", shape: "radial" } } },
  { name: "Ember", builtin: true, look: { colour: { preset: "ember", mode: "speed" }, eventResponses: { lift: "kick" } } },
]);

export function dustLookSlug(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** The reusable part of a direction. */
export function extractDustLook(direction = {}) {
  const look = {};
  for (const key of LOOK_KEYS) if (direction[key] !== undefined && direction[key] !== null) look[key] = structuredClone(direction[key]);
  // An album spec belongs to one Song; the look keeps "album" and each Song resolves its own.
  if (look.colour?.album) delete look.colour.album;
  const play = Object.fromEntries(LOOK_PLAY_KEYS.filter((key) => direction.playSettings?.[key] !== undefined).map((key) => [key, direction.playSettings[key]]));
  if (Object.keys(play).length) look.playSettings = play;
  return look;
}

/** Apply a look: its fields replace the direction's; song-bound fields, seed and pulse are kept. */
export function applyDustLook(direction = {}, look = {}) {
  const next = { ...direction };
  for (const key of LOOK_KEYS) { if (look[key] !== undefined) next[key] = structuredClone(look[key]); else delete next[key]; }
  if (next.colour?.album) delete next.colour.album;
  const play = { ...(direction.playSettings || {}) };
  for (const key of LOOK_PLAY_KEYS) { if (look.playSettings?.[key] !== undefined) play[key] = look.playSettings[key]; else delete play[key]; }
  if (Object.keys(play).length) next.playSettings = play; else delete next.playSettings;
  return next;
}

export function validateDustLook(input) {
  const errors = [];
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 48 || !dustLookSlug(name)) errors.push({ code: "look-name", message: "A look needs a name of 1–48 characters with a letter or digit." });
  const look = input?.look;
  if (!look || typeof look !== "object" || Array.isArray(look)) errors.push({ code: "look", message: "look must be an object." });
  else {
    for (const key of Object.keys(look)) if (![...LOOK_KEYS, "playSettings"].includes(key)) errors.push({ code: "look-key", message: `${key} belongs to one song's direction, not a reusable look.` });
    for (const key of Object.keys(look.playSettings || {})) if (!LOOK_PLAY_KEYS.includes(key)) errors.push({ code: "look-key", message: `playSettings.${key} belongs to one song, not a reusable look.` });
    if (look.playSettings?.particleCount !== undefined && (!Number.isInteger(look.playSettings.particleCount) || look.playSettings.particleCount < 500 || look.playSettings.particleCount > 20000)) errors.push({ code: "look-particles", message: "particleCount must be an integer from 500 to 20000." });
    const check = validateEchoScoreDirection(look);
    if (!check.ok) errors.push(...check.errors.filter((e) => e.code !== "direction-key"));
  }
  return { ok: errors.length === 0, errors };
}

/** Saved looks first (latest revision per name), then built-ins whose names are not taken. */
export function mergeDustLooks(saved = []) {
  const taken = new Set(saved.map((row) => dustLookSlug(row.name)));
  return [...saved, ...BUILTIN_DUST_LOOKS.filter((row) => !taken.has(dustLookSlug(row.name)))];
}
