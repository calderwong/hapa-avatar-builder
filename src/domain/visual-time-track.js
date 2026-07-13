import crypto from "node:crypto";

export const VISUAL_TIME_TRACK_SCHEMA = "hapa.director.visual-time-track.v1";
export const VISUAL_TIME_LIMITS = Object.freeze({ minRate: 0.78, maxRate: 1.18, maxRateDeltaPerSecond: 0.4, maxHoldSeconds: 0.18, maxReverseSeconds: 0.12, maxStutterSeconds: 0.24, settleMarginSeconds: 0.08 });
const effects = ["playback-rate", "hold", "repeat", "micro-reverse", "beat-stutter", "temporal-echo"];
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const supportFor = (kind) => ({
  echoTarot: { supported: true, route: "frame-cache" },
  hyperframes: { supported: true, route: "deterministic-keyframes" },
  musicVizNative: { supported: !["repeat", "micro-reverse"].includes(kind), route: ["repeat", "micro-reverse"].includes(kind) ? "unsupported-visible" : "native-time-uniform", unsupported: ["repeat", "micro-reverse"].includes(kind) ? [kind] : [] },
  dearPapaNative: { supported: !["micro-reverse", "beat-stutter"].includes(kind), route: ["micro-reverse", "beat-stutter"].includes(kind) ? "unsupported-visible" : "offline-frame-map", unsupported: ["micro-reverse", "beat-stutter"].includes(kind) ? [kind] : [] },
});

function keyframesFor(kind, intensity) {
  const delta = Math.min(0.18, 0.04 + intensity * 0.1);
  if (kind === "playback-rate") return [{ offset: 0, visualRate: 1 }, { offset: 0.25, visualRate: 1 + delta }, { offset: 0.75, visualRate: 1 - delta }, { offset: 1, visualRate: 1 }];
  if (kind === "hold") return [{ offset: 0, visualRate: 1 }, { offset: 0.15, visualRate: 0 }, { offset: 0.65, visualRate: 0 }, { offset: 1, visualRate: 1 }];
  if (kind === "repeat") return [{ offset: 0, sampleOffsetSeconds: 0 }, { offset: 0.48, sampleOffsetSeconds: 0.08 }, { offset: 0.5, sampleOffsetSeconds: 0 }, { offset: 1, sampleOffsetSeconds: 0.08 }];
  if (kind === "micro-reverse") return [{ offset: 0, sampleOffsetSeconds: 0 }, { offset: 0.5, sampleOffsetSeconds: -VISUAL_TIME_LIMITS.maxReverseSeconds }, { offset: 1, sampleOffsetSeconds: 0 }];
  if (kind === "beat-stutter") return [{ offset: 0, sampleOffsetSeconds: 0 }, { offset: 0.32, sampleOffsetSeconds: 0.06 }, { offset: 0.34, sampleOffsetSeconds: 0 }, { offset: 0.66, sampleOffsetSeconds: 0.06 }, { offset: 0.68, sampleOffsetSeconds: 0 }, { offset: 1, sampleOffsetSeconds: 0.06 }];
  return [{ offset: 0, echoOpacity: 0 }, { offset: 0.24, echoOpacity: 0.22 + intensity * 0.2 }, { offset: 1, echoOpacity: 0 }];
}

export function buildVisualTimeTrack({ cues = [], density = 0.34, durationSeconds = Infinity, reducedMotion = false } = {}) {
  const sectionBoundaries = cues.filter((cue) => cue.kind === "section_start").map((cue) => num(cue.atSeconds)).sort((a, b) => a - b);
  const candidates = cues.filter((cue) => cue.approved !== false && num(cue.atSeconds, -1) >= 0 && num(cue.atSeconds) < durationSeconds)
    .filter((cue) => ["stem_onset", "hook_start", "section_start", "lyric_phrase_start", "director_hit"].includes(cue.kind) || (cue.eligibleActions || []).includes("effect"))
    .sort((a, b) => a.atSeconds - b.atSeconds || String(a.id).localeCompare(String(b.id)));
  const stride = Math.max(2, Math.round(2.5 / Math.max(0.1, Math.min(1, density))));
  const selected = candidates.filter((_, index) => index % stride === 0);
  const events = selected.flatMap((cue, index) => {
    const token = parseInt(hash([cue.id, index]).slice(0, 8), 16);
    const kind = effects[token % effects.length];
    if (reducedMotion && ["micro-reverse", "beat-stutter"].includes(kind)) return [];
    const intensity = Math.max(0.2, Math.min(0.8, num(cue.evidence?.onset ?? cue.confidence, 0.5)));
    const maxDuration = kind === "hold" ? VISUAL_TIME_LIMITS.maxHoldSeconds : kind === "micro-reverse" ? VISUAL_TIME_LIMITS.maxReverseSeconds : kind === "beat-stutter" ? VISUAL_TIME_LIMITS.maxStutterSeconds : 0.32;
    const start = num(cue.atSeconds);
    const nextBoundary = sectionBoundaries.find((value) => value > start);
    const end = Math.min(durationSeconds, start + maxDuration, nextBoundary == null ? Infinity : nextBoundary - VISUAL_TIME_LIMITS.settleMarginSeconds);
    if (end <= start + 0.02) return [];
    return [{
      id: `visual-time:${hash([cue.id, kind]).slice(0, 16)}`,
      cueId: cue.id,
      kind,
      startSeconds: start,
      endSeconds: end,
      target: { clock: "visual-only", layer: token % 3 === 0 ? "visualizer-layer" : "media-layer" },
      source: { kind: cue.kind, stemRole: cue.evidence?.stemRole || "master", signal: cue.evidence?.stemRole ? "onset" : "director" },
      keyframes: keyframesFor(kind, intensity),
      rendererSupport: supportFor(kind),
      unsupportedBehavior: { mode: "fail-visible", action: "show-unsupported-effect-badge-and-use-base-visual-clock" },
      safety: { ...VISUAL_TIME_LIMITS, canonicalAudioRate: 1, visualClockSettlesToBase: true, transitionReadyAtSeconds: end + VISUAL_TIME_LIMITS.settleMarginSeconds },
    }];
  });
  return { schemaVersion: VISUAL_TIME_TRACK_SCHEMA, canonicalAudioClock: { rate: 1, edited: false }, reducedMotion, limits: VISUAL_TIME_LIMITS, eventCount: events.length, events };
}

export function validateVisualTimeTrack(track, { sectionBoundaries = [] } = {}) {
  const errors = [];
  for (const event of track?.events || []) {
    if (!event.cueId || event.target?.clock !== "visual-only") errors.push(`${event.id}:not-cue-anchored-visual-only`);
    if (!event.source?.stemRole || !Array.isArray(event.keyframes) || event.keyframes.length < 2) errors.push(`${event.id}:missing-address-or-keyframes`);
    if (!Object.values(event.rendererSupport || {}).every((support) => typeof support.supported === "boolean" && support.route && Array.isArray(support.unsupported || []))) errors.push(`${event.id}:implicit-renderer-support`);
    if (event.unsupportedBehavior?.mode !== "fail-visible") errors.push(`${event.id}:silent-unsupported-fallback`);
    if (event.safety?.canonicalAudioRate !== 1 || !event.safety?.visualClockSettlesToBase) errors.push(`${event.id}:av-drift-risk`);
    for (const frame of event.keyframes) if (frame.visualRate != null && event.kind !== "hold" && (frame.visualRate < VISUAL_TIME_LIMITS.minRate || frame.visualRate > VISUAL_TIME_LIMITS.maxRate)) errors.push(`${event.id}:rate-out-of-bounds`);
    const nextBoundary = sectionBoundaries.find((value) => value > event.startSeconds);
    if (nextBoundary != null && event.safety.transitionReadyAtSeconds > nextBoundary) errors.push(`${event.id}:not-ready-at-transition`);
  }
  if (track?.canonicalAudioClock?.rate !== 1 || track?.canonicalAudioClock?.edited !== false) errors.push("canonical-audio-clock-mutated");
  if (track?.reducedMotion && track.events.some((event) => ["micro-reverse", "beat-stutter"].includes(event.kind))) errors.push("reduced-motion-has-reversal-or-stutter");
  return { ok: errors.length === 0, errors };
}
