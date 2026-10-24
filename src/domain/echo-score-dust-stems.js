// Stem-aware Score Dust responses (P2 item 9). Each instrument keeps its own
// job instead of being folded into one spectrum: drum hits kick, cymbals
// sparkle, bass swells shapes, vocals bring more dust in, and harmony
// instruments (keys, synth, guitar, strings) stir the flow.
//
// Source: the Echo prepared performance (one stem set per song, per the
// Audio Atlas stem rules). Sampling is a pure function of song time.
import { sampleEchoPerformanceBus, normalizeHyperFramesStemRole } from "./hyperframes-visualizer-runtime.js";

export const DUST_STEM_GROUPS = Object.freeze({
  drums: ["drums", "percussion"],
  bass: ["bass"],
  vocals: ["vocals", "backing-vocals"],
  harmony: ["keyboard", "synth", "guitar", "strings", "piano", "other", "instrumental"],
});
export const DUST_STEM_LABELS = Object.freeze({ drums: "Drums → kicks and sparkle", bass: "Bass → swell", vocals: "Vocals → more dust; words follow the singer", harmony: "Keys, synth, guitar → swirl" });
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0));

export function normalizeStemResponses(input = {}) {
  return Object.fromEntries(Object.keys(DUST_STEM_GROUPS).map((group) => [group, input[group] === undefined ? 1 : clamp(Number(input[group]))]));
}

/**
 * Build a stem reflex from a prepared performance. Returns null when the song
 * has no separated stems (master-only songs keep the spectrum response).
 */
export function createStemReflex(performance) {
  const buses = (performance?.buses || []).filter((bus) => bus.id !== "master" && bus.role !== "master" && bus.frames?.length);
  if (!buses.length) return null;
  const groups = {};
  for (const [group, roles] of Object.entries(DUST_STEM_GROUPS)) {
    const members = buses.filter((bus) => roles.includes(normalizeHyperFramesStemRole(bus.role || bus.id)));
    if (members.length) groups[group] = members;
  }
  if (!Object.keys(groups).length) return null;
  const level = (members, t, key = "rms") => Math.max(...members.map((bus) => sampleEchoPerformanceBus(bus, t)[key] || 0));
  return {
    available: Object.keys(groups),
    roles: Object.fromEntries(Object.entries(groups).map(([g, members]) => [g, members.map((bus) => bus.role || bus.id)])),
    at(t) {
      return {
        drums: groups.drums ? clamp(level(groups.drums, t)) : 0,
        drumOnset: groups.drums ? clamp(level(groups.drums, t, "onsetEnvelope")) : 0,
        cymbals: groups.drums ? clamp(level(groups.drums, t, "high")) : 0,
        bass: groups.bass ? clamp(level(groups.bass, t)) : 0,
        vocals: groups.vocals ? clamp(level(groups.vocals, t)) : 0,
        harmony: groups.harmony ? clamp(level(groups.harmony, t)) : 0,
        vocalsPresent: Boolean(groups.vocals),
      };
    },
  };
}
