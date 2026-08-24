// Avatar Likeness Matcher — media vs Avatar profile similarity (L3).
//
// Avatar Likeness Assignment plan, layer L3. Pure, browser-safe scoring:
// takes one media likeness signature (see
// server/avatar-likeness-media-signature.mjs) and one Avatar likeness
// profile (layer L2) and produces a weighted similarity score plus a
// gated verdict. The batch pass (scripts/avatar-likeness-match.mjs) runs
// it over the durable Human Enricher accepted set.
//
// score = Σ channel × weight, renormalized over the ACTIVE channels:
//   palette    0.45  tolerant 6×6×6 histogram intersection (L1 primitive)
//   dHash      0.25  best dHash pair similarity (L1 primitive)
//   text       0.20  cosine over tokenized term sets (candidateScore-style)
//   colorWords 0.10  weighted Jaccard over deterministic palette color words
//
// Deliberately pixel-majority: a likeness that "looks like" the Avatar
// matters more than one that talks like it. Channels whose either side has
// no data (most accepted media carry no description) are excluded and
// their weight redistributed, so a media with no text is scored on the
// pixel channels alone on the same 0..1 scale — a supported case, not an
// error. Nothing here claims identity; it ranks appearance.

import {
  paletteHistogramSimilarity,
  paletteHistogramToVector,
  dHashSimilarity,
} from "./media-visual-signature.js";

export const AVATAR_LIKENESS_MATCH_SCHEMA = "hapa.avatar-likeness-match.v1";
export const AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA = "hapa.avatar-likeness-media-signature.v1";

/**
 * Tunable channel weights. Pixel-majority is intentional; the text and
 * color-word channels are the minority because most accepted media carry
 * no free-form description (the live ledger measured 0/3,267 with one) —
 * they sharpen ties, they do not drive the verdict.
 */
export const AVATAR_LIKENESS_MATCH_WEIGHTS = Object.freeze({
  palette: 0.45,
  dHash: 0.25,
  text: 0.2,
  colorWords: 0.1,
});

/**
 * Verdict gate. Calibrated, not vibes. The 2026-08-24 calibration run
 * (140 self-labeled identity media, all in-profile — every Avatar's
 * identity assets sat inside the L2 sample cap, so zero out-of-profile
 * labels exist; report: artifacts/enrichment/
 * avatar-likeness-match-calibrate-2026-08-24T04-52-08-361Z.json) observed
 * a median best−runner-up margin of 0.016 with same-family confusion in
 * the top non-hits (avatar-38→nahla-serein, avatar-5→avatar-47, …).
 * The 0.10 margin admits 13/140 — all true, zero false — and the score
 * floor is outcome-invariant across 0.30–0.90 (the margin does the
 * separating), so the plan's 0.55/0.10 defaults are confirmed rather than
 * moved. `assigned` requires BOTH conditions on the best candidate; the
 * optional secondary requires only the score floor.
 */
export const AVATAR_LIKENESS_MATCH_GATE = Object.freeze({
  assignedScore: 0.55,
  assignedMargin: 0.1,
  secondaryScore: 0.55,
});

export const AVATAR_LIKENESS_MATCH_TOP_N = 5;

// ---------------------------------------------------------------------------
// Deterministic color words
//
// The optical campaign has no completed jobs on the current store, so LLM
// palette words do not exist yet; the color-word channel therefore derives
// words deterministically from the 6×6×6 palette bins on BOTH sides. If a
// media ever carries optical LLM palette words, they blend in with the
// derived ones (words are just a weighted vocabulary).
// ---------------------------------------------------------------------------

// [word, r, g, b] — a fixed vocabulary covering the 6-level cube.
const COLOR_WORD_RGB = [
  ["black", 15, 15, 15],
  ["charcoal", 60, 60, 65],
  ["gray", 128, 128, 130],
  ["silver", 190, 190, 195],
  ["white", 245, 245, 245],
  ["cream", 240, 228, 205],
  ["tan", 205, 175, 135],
  ["brown", 115, 78, 50],
  ["red", 220, 45, 45],
  ["maroon", 115, 25, 25],
  ["pink", 238, 160, 185],
  ["magenta", 195, 45, 155],
  ["purple", 125, 55, 155],
  ["violet", 150, 85, 200],
  ["orange", 230, 120, 35],
  ["amber", 218, 158, 45],
  ["yellow", 228, 212, 60],
  ["gold", 198, 158, 55],
  ["green", 65, 155, 85],
  ["olive", 125, 125, 60],
  ["teal", 45, 135, 140],
  ["cyan", 85, 198, 218],
  ["blue", 55, 95, 200],
  ["navy", 28, 40, 95],
  ["sky", 135, 190, 228],
];

export const AVATAR_LIKENESS_COLOR_WORDS = Object.freeze(COLOR_WORD_RGB.map(([word]) => word));

const PALETTE_CUBE_LEVELS = 6;

/** Bin center as an approximate 0..255 triple. */
export function paletteBinCenterRgb(bin) {
  const r = Math.floor(bin / (PALETTE_CUBE_LEVELS * PALETTE_CUBE_LEVELS));
  const g = Math.floor((bin / PALETTE_CUBE_LEVELS) % PALETTE_CUBE_LEVELS);
  const b = bin % PALETTE_CUBE_LEVELS;
  const center = (level) => Math.round(((level + 0.5) / PALETTE_CUBE_LEVELS) * 255);
  return { r: center(r), g: center(g), b: center(b) };
}

/**
 * Deterministic color words for one palette: each bin's center color maps
 * to its nearest vocabulary word, mass is summed per word, and the
 * heaviest words come back normalized.
 *
 * @param {{ bins?: Array<{ bin: number, weight: number }> } | null} palette
 *   a media-visual-signature palette shape (top-K bins)
 * @param {{ maxWords?: number }} [options]
 * @returns {Array<{ word: string, weight: number }>}
 */
export function colorWordsFromPalette(palette, { maxWords = 12 } = {}) {
  const bins = Array.isArray(palette?.bins) ? palette.bins : [];
  const mass = new Map();
  let total = 0;
  for (const entry of bins) {
    const weight = Number(entry?.weight) || 0;
    if (weight <= 0) continue;
    total += weight;
    const { r, g, b } = paletteBinCenterRgb(Number(entry.bin) | 0);
    let bestWord = null;
    let bestDistance = Infinity;
    for (const [word, wr, wg, wb] of COLOR_WORD_RGB) {
      const distance = (r - wr) ** 2 + (g - wg) ** 2 + (b - wb) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestWord = word;
      }
    }
    if (bestWord) mass.set(bestWord, (mass.get(bestWord) || 0) + weight);
  }
  if (!total) return [];
  const words = [...mass.entries()]
    .map(([word, value]) => ({ word, weight: Number((value / total).toFixed(6)) }))
    .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word))
    .slice(0, Math.max(1, Math.trunc(maxWords) || 12));
  const wordMass = words.reduce((sum, entry) => sum + entry.weight, 0);
  if (wordMass <= 0) return [];
  return words.map((entry) => ({ word: entry.word, weight: Number((entry.weight / wordMass).toFixed(6)) }));
}

/**
 * @param {Array<{ word: string, weight: number }> | string[] | null} words
 * @returns {Map<string, number>} word → normalized weight
 */
export function colorWordVector(words) {
  const entries = Array.isArray(words) ? words : [];
  const map = new Map();
  let total = 0;
  for (const entry of entries) {
    const word = typeof entry === "string" ? entry : entry?.word;
    const weight = typeof entry === "string" ? 1 : Number(entry?.weight) || 0;
    const clean = String(word || "").toLowerCase().trim();
    if (!clean || weight <= 0) continue;
    map.set(clean, (map.get(clean) || 0) + weight);
    total += weight;
  }
  if (total <= 0) return new Map();
  for (const [word, weight] of [...map.entries()]) map.set(word, weight / total);
  return map;
}

/** Weighted Jaccard between two color-word vectors; 0 when either is empty. */
export function colorWordOverlap(a, b) {
  const va = a instanceof Map ? a : colorWordVector(a);
  const vb = b instanceof Map ? b : colorWordVector(b);
  if (!va.size || !vb.size) return 0;
  let intersection = 0;
  let union = 0;
  for (const word of new Set([...va.keys(), ...vb.keys()])) {
    const weightA = va.get(word) || 0;
    const weightB = vb.get(word) || 0;
    intersection += Math.min(weightA, weightB);
    union += Math.max(weightA, weightB);
  }
  return union > 0 ? intersection / union : 0;
}

// ---------------------------------------------------------------------------
// Channel math
// ---------------------------------------------------------------------------

/**
 * Cosine similarity over binary term vectors (candidateScore-style token
 * overlap, made symmetric): 1 for identical non-empty sets, 0 when either
 * side is empty or the sets are disjoint.
 *
 * @param {Iterable<string>} a
 * @param {Iterable<string>} b
 * @returns {number} 0..1
 */
export function textOverlap(a, b) {
  const setA = new Set([...(a || [])].map((term) => String(term || "").toLowerCase()).filter(Boolean));
  const setB = new Set([...(b || [])].map((term) => String(term || "").toLowerCase()).filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let hits = 0;
  for (const term of small) if (large.has(term)) hits += 1;
  if (!hits) return 0;
  return hits / Math.sqrt(setA.size * setB.size);
}

/** Best pairwise dHash similarity over two bounded hash sets. */
export function bestDHashSimilarity(aHashes, bHashes) {
  const a = (Array.isArray(aHashes) ? aHashes : [aHashes]).filter(Boolean);
  const b = (Array.isArray(bHashes) ? bHashes : [bHashes]).filter(Boolean);
  if (!a.length || !b.length) return 0;
  let best = 0;
  for (const hashA of a) {
    for (const hashB of b) {
      const value = dHashSimilarity(hashA, hashB);
      if (value > best) best = value;
    }
  }
  return best;
}

/**
 * Palette channel over two palette documents (L1 tolerant intersection).
 *
 * @param {{ bins?: Array } | null} a
 * @param {{ bins?: Array } | null} b
 * @returns {number} 0..1 (0 when either side has no palette mass)
 */
export function paletteSimilarity(a, b) {
  if (!a || !b) return 0;
  return paletteHistogramSimilarity(a, b, { tolerance: 1 });
}

// ---------------------------------------------------------------------------
// Per-side state + scoring
// ---------------------------------------------------------------------------

/**
 * Pre-parsed side state for fast repeated scoring.
 *
 * The color-word channel resolves against explicit `text.colorWords` when
 * the side carries them (media signature docs do — derived at sign time,
 * or LLM optical words if they ever exist); otherwise it derives them from
 * that side's palette. Layer-L2 Avatar profiles persist no words, so in a
 * real profile-vs-media score BOTH sides derive from their own palettes and
 * the 0.10 channel is live whenever both palettes have mass.
 *
 * @param {{ palette?: object, dHashes?: string[] } | null} signature a merged L1 signature
 * @param {{ terms?: string[], colorWords?: Array }} [text]
 */
export function prepareLikenessState({ signature, text } = {}) {
  const palette = signature?.palette || null;
  const paletteVector = palette && Array.isArray(palette.bins) && palette.bins.length ? paletteHistogramToVector(palette) : null;
  const paletteMass = paletteVector ? paletteVector.reduce((sum, value) => sum + value, 0) : 0;
  const dHashes = (Array.isArray(signature?.dHashes) ? signature.dHashes : [signature?.dHash].filter(Boolean)).filter(Boolean);
  const terms = new Set((Array.isArray(text?.terms) ? text.terms : []).map((term) => String(term || "").toLowerCase()).filter(Boolean));
  const colorWords = colorWordVector(text?.colorWords?.length ? text.colorWords : colorWordsFromPalette(signature?.palette));
  return {
    palette,
    paletteVector,
    paletteMass,
    dHashes,
    terms,
    colorWords,
  };
}

/**
 * Score one media signature against one Avatar profile.
 *
 * @param {object} media a media likeness signature document (L3 shape)
 * @param {object} avatarProfile a layer-L2 Avatar likeness profile
 * @param {{ weights?: object, gate?: object }} [options]
 * @returns {{ avatarId: string, name?: string, score: number,
 *   channels: { palette: number|null, dHash: number|null, text: number|null, colorWords: number|null },
 *   active: string[] }} null channels mark inactive sides; `score` is the
 *   weight renormalized over the active channels (0 when none are active).
 */
export function scoreMediaAgainstAvatar(media, avatarProfile, { weights = AVATAR_LIKENESS_MATCH_WEIGHTS } = {}) {
  const avatarId = String(avatarProfile?.avatarId || "");
  const mediaState = media && media.__state ? media.__state : prepareLikenessState(media);
  const avatarState = avatarProfile.__state ? avatarProfile.__state : prepareLikenessState({ signature: avatarProfile.media, text: avatarProfile.text });

  const palette =
    mediaState.paletteMass > 0 && avatarState.paletteMass > 0
      ? paletteHistogramSimilarity(mediaState.palette, avatarState.palette, { tolerance: 1 })
      : null;
  const dHash = mediaState.dHashes.length && avatarState.dHashes.length ? bestDHashSimilarity(mediaState.dHashes, avatarState.dHashes) : null;
  const text = mediaState.terms.size && avatarState.terms.size ? textOverlap(mediaState.terms, avatarState.terms) : null;
  const colorWords = mediaState.colorWords.size && avatarState.colorWords.size ? colorWordOverlap(mediaState.colorWords, avatarState.colorWords) : null;

  const channels = { palette, dHash, text, colorWords };
  const active = Object.entries(channels).filter(([, value]) => value !== null).map(([name]) => name);
  const activeWeight = active.reduce((sum, name) => sum + (Number(weights[name]) || 0), 0);
  const score = activeWeight > 0 ? active.reduce((sum, name) => sum + (channels[name] || 0) * (Number(weights[name]) || 0), 0) / activeWeight : 0;
  return {
    avatarId,
    name: avatarProfile?.name || undefined,
    score: Number(clamp01(score).toFixed(6)),
    channels,
    active,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * Match one media signature against every profile.
 *
 * @param {object} media a media likeness signature document
 * @param {object[]} profiles layer-L2 profiles (profileless ones are
 *   excluded from candidacy and reported in `excludedProfileless`)
 * @param {{ weights?: object, gate?: object, top?: number }} [options]
 * @returns {{ verdict: "assigned"|"unresolved", reasons: string[],
 *   primary: object|null, secondary: object|null, candidates: object[],
 *   excludedProfileless: number }}
 *
 * `assigned` requires best.score ≥ gate.assignedScore AND
 * best − runnerUp ≥ gate.assignedMargin (a lone candidate treats the
 * runner-up as 0). The optional secondary is the runner-up when it clears
 * gate.secondaryScore on its own. `unresolved` carries an honest reason:
 * `no_profiled_avatars` | `below_floor` | `too_close`.
 */
export function matchMediaToAvatars(media, profiles = [], { weights = AVATAR_LIKENESS_MATCH_WEIGHTS, gate = AVATAR_LIKENESS_MATCH_GATE, top = AVATAR_LIKENESS_MATCH_TOP_N } = {}) {
  const candidates = (Array.isArray(profiles) ? profiles : [])
    .filter((profile) => profile && profile.schemaVersion && profile.status === "profiled" && profile.media)
    .map((profile) => scoreMediaAgainstAvatar(media, profile, { weights }))
    .filter((candidate) => candidate.avatarId)
    .sort((a, b) => b.score - a.score || a.avatarId.localeCompare(b.avatarId))
    .slice(0, Math.max(1, Math.trunc(top) || AVATAR_LIKENESS_MATCH_TOP_N));

  const excludedProfileless = (Array.isArray(profiles) ? profiles : []).filter((profile) => profile?.status === "profileless").length;

  if (!candidates.length) {
    return { verdict: "unresolved", reasons: ["no_profiled_avatars"], primary: null, secondary: null, candidates: [], excludedProfileless };
  }
  const best = candidates[0];
  const runnerUp = candidates[1] || null;
  const margin = runnerUp ? best.score - runnerUp.score : best.score;

  if (best.score < gate.assignedScore) {
    return { verdict: "unresolved", reasons: ["below_floor"], primary: best, secondary: null, candidates, excludedProfileless };
  }
  if (margin < gate.assignedMargin) {
    return { verdict: "unresolved", reasons: ["too_close"], primary: best, secondary: null, candidates, excludedProfileless };
  }
  const secondary = runnerUp && runnerUp.score >= gate.secondaryScore ? runnerUp : null;
  return { verdict: "assigned", reasons: [], primary: best, secondary, candidates, excludedProfileless };
}
