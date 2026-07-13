import crypto from "node:crypto";

export const ACCENT_EVENT_SCHEMA = "hapa.director.accent-event-track.v1";
export const SAFE_ACCENT_LIMITS = Object.freeze({
  maxFlashHz: 3,
  maxLuminanceDelta: 0.2,
  maxFrameArea: 0.25,
  maxDurationSeconds: 0.42,
  minFlashSeparationSeconds: 1 / 3,
});

const stableNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const kinds = ["scan", "glitch", "bloom", "shutter", "deck-swap", "flicker"];
const targets = ["visualizer-layer", "media-layer", "lyric-layer", "card-layer"];

export function buildAccentEventTrack({ cues = [], density = 0.5, durationSeconds = Infinity, reducedMotion = false } = {}) {
  const eligible = cues
    .filter((cue) => cue?.approved !== false && stableNumber(cue.atSeconds, -1) >= 0 && stableNumber(cue.atSeconds) <= durationSeconds)
    .filter((cue) => (cue.eligibleActions || []).some((action) => action === "accent" || action === "effect"))
    .sort((a, b) => a.atSeconds - b.atSeconds || String(a.id).localeCompare(String(b.id)));
  const stride = Math.max(1, Math.round(1 / Math.max(0.05, Math.min(1, density))));
  const events = [];
  let lastFlash = -Infinity;
  for (let index = 0; index < eligible.length; index += stride) {
    const cue = eligible[index];
    const token = parseInt(digest(cue.id || `${cue.atSeconds}`).slice(0, 8), 16);
    let kind = kinds[token % kinds.length];
    if (reducedMotion && ["glitch", "shutter", "flicker"].includes(kind)) kind = token % 2 ? "scan" : "bloom";
    const flashBearing = kind === "flicker" || kind === "shutter";
    if (flashBearing && cue.atSeconds - lastFlash < SAFE_ACCENT_LIMITS.minFlashSeparationSeconds) kind = "scan";
    if (kind === "flicker" || kind === "shutter") lastFlash = cue.atSeconds;
    const intensity = Math.max(0.18, Math.min(0.68, stableNumber(cue.evidence?.onset ?? cue.confidence, 0.5) * 0.54 + 0.14));
    events.push({
      id: `accent:${digest([cue.id, kind, index]).slice(0, 16)}`,
      schemaVersion: ACCENT_EVENT_SCHEMA,
      cueId: cue.id,
      atSeconds: stableNumber(cue.atSeconds),
      endSeconds: stableNumber(cue.atSeconds) + Math.min(SAFE_ACCENT_LIMITS.maxDurationSeconds, kind === "deck-swap" ? 0.36 : 0.18),
      kind,
      preset: intensity >= 0.55 ? "safe-strong" : intensity >= 0.35 ? "safe-medium" : "safe-soft",
      intensity,
      target: { scope: "single-layer", layer: targets[(token >>> 4) % targets.length] },
      source: { kind: cue.kind || "director-hit", stemRole: cue.evidence?.stemRole || "master", signal: cue.evidence?.stemRole ? "onset" : "director" },
      safety: {
        mode: reducedMotion ? "reduced-motion" : "safe-default",
        flashCount: kind === "flicker" || kind === "shutter" ? 1 : 0,
        flashHz: kind === "flicker" || kind === "shutter" ? 3 : 0,
        luminanceDelta: Math.min(SAFE_ACCENT_LIMITS.maxLuminanceDelta, intensity * 0.26),
        frameArea: kind === "bloom" ? 0.25 : 0.16,
        limits: SAFE_ACCENT_LIMITS,
      },
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 0.28, value: intensity },
        { offset: 1, value: 0 },
      ],
    });
  }
  return { schemaVersion: ACCENT_EVENT_SCHEMA, reducedMotion, limits: SAFE_ACCENT_LIMITS, eventCount: events.length, events };
}

export function validateAccentEventTrack(track, { overrideReceipt = null } = {}) {
  const errors = [];
  const warnings = [];
  const flashTimes = [];
  for (const event of track?.events || []) {
    if (!event.cueId) errors.push(`${event.id}:missing-cue`);
    if (event.target?.scope !== "single-layer") errors.push(`${event.id}:full-frame-target`);
    if (!event.source?.stemRole) errors.push(`${event.id}:missing-stem-address`);
    if (!Array.isArray(event.keyframes) || event.keyframes.length < 2) errors.push(`${event.id}:missing-keyframes`);
    const safety = event.safety || {};
    if (safety.flashHz > SAFE_ACCENT_LIMITS.maxFlashHz || safety.luminanceDelta > SAFE_ACCENT_LIMITS.maxLuminanceDelta || safety.frameArea > SAFE_ACCENT_LIMITS.maxFrameArea) warnings.push(`${event.id}:strong-treatment`);
    if (safety.flashCount > 0) flashTimes.push(event.atSeconds);
  }
  for (let i = 1; i < flashTimes.length; i += 1) if (flashTimes[i] - flashTimes[i - 1] < SAFE_ACCENT_LIMITS.minFlashSeparationSeconds - 1e-6) errors.push("flash-density-over-3hz");
  if (warnings.length && !(overrideReceipt?.operator && overrideReceipt?.reason && overrideReceipt?.acknowledgedAt)) errors.push("strong-treatment-missing-operator-override");
  return { ok: errors.length === 0, errors, warnings, overrideAccepted: warnings.length > 0 && errors.length === 0 };
}

export function createAccentOverrideReceipt({ operator, reason, acknowledgedAt, eventIds = [] } = {}) {
  const receipt = { schemaVersion: "hapa.director.accent-safety-override.v1", operator, reason, acknowledgedAt, eventIds: [...eventIds].sort() };
  return { ...receipt, receiptHash: digest(receipt) };
}
