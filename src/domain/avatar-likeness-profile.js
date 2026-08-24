// Avatar Likeness Profile — per-Avatar visual + text likeness signal.
//
// Avatar Likeness Assignment plan (docs/AVATAR_LIKENESS_ASSIGNMENT_PLAN.md,
// layer L2). Pure, browser-safe assembly math: takes the media visual
// signatures (layer L1) for an Avatar's attached media plus its text
// signals and merges them into one profile document that the likeness
// matcher (layer L3) compares against enricher-accepted media.
//
// Weighting reflects signal quality, not asset count:
//   identity (1.0)  backgroundless / close-up / full-body / concept media
//   default  (0.8)  other images and videos
//   context  (0.5)  dossiers, kits — contextual, not identity
//   unusable (0)    3D models and other non-pixel assets
//
// A profile is content-hash keyed (assetFingerprints): it is "fresh" only
// while every attached pixel asset hashes to exactly what was signed.

import {
  PALETTE_CUBE_BINS,
  PALETTE_HISTOGRAM_TOP_K,
  paletteHistogramToVector,
  paletteBinIndex,
} from "./media-visual-signature.js";
import { ECHO_AVATAR_CAST_REGISTRY } from "./echo-avatar-cast-registry.js";

export const AVATAR_LIKENESS_PROFILE_SCHEMA = "hapa.avatar-likeness-profile.v1";
export const AVATAR_LIKENESS_PROFILE_STORE_SCHEMA = "hapa.avatar-likeness-profile-store.v1";

export const AVATAR_LIKENESS_WEIGHTS = Object.freeze({
  identity: 1.0,
  default: 0.8,
  context: 0.5,
  unusable: 0,
});

// Same symbolic-motif vocabulary as the Character Sheet intelligence.
const SYMBOLIC_MOTIF_RE = /sword|wand|cup|pentacle|moon|sun|star|lantern|compass|oath|sigil|blade|guardian|ritual|city|ocean|fire|earth|air|water/i;

const BOUND = { ocrLines: 24, labels: 32, tags: 32, motifs: 24, invariants: 12, terms: 128, termText: 240 };

export const AVATAR_LIKENESS_MAX_HASHES = 8;

// Version of the media signer whose output a profile stores. Freshness
// compares it: when the extractor changes in a way that alters the signature
// of identical pixels (bug fixes, feature changes), every profile becomes
// stale and gets re-signed instead of caching the old result — e.g. "failed"
// entries left behind by a broken seek path must not survive a signer fix
// just because the source files are byte-identical.
export const AVATAR_LIKENESS_SIGNER_VERSION = "hapa.media-visual-signature.v1";

// Per-class signing caps. Avatars can carry thousands of near-duplicate
// generated clips (e.g. 803 videos on one Card); the merged palette/tone
// signal saturates well before that, and an uncapped rebuild of the full
// store measured ~45 minutes of ffmpeg work. Capping the *sample* (not the
// fingerprint set) bounds a rebuild to a few minutes while always keeping
// the cleanest identity media in the mix.
export const AVATAR_LIKENESS_SAMPLE_CAPS = Object.freeze({ identity: 40, default: 40, context: 12, unusable: 0 });

/**
 * Deterministic per-class signing selection.
 *
 * Every attached asset comes back annotated with its weight class and a
 * `selected` flag; at most `caps[cls]` assets per class are selected for
 * pixel signing. Ordering is stable (weight-class priority, then asset id)
 * so the same asset set always yields the same sample — profiles stay a
 * pure function of the Avatar Card.
 *
 * @param {Array<object>} assets the Avatar's attached assets
 * @param {{ caps?: object }} [options]
 * @returns {Array<{ asset: object, cls: string, selected: boolean }>}
 */
export function selectLikenessAssets(assets = [], { caps = AVATAR_LIKENESS_SAMPLE_CAPS } = {}) {
  const classRank = { identity: 0, default: 1, context: 2, unusable: 3 };
  const annotated = (Array.isArray(assets) ? assets : []).map((asset) => ({
    asset,
    cls: classifyAssetWeightClass(asset),
    selected: false,
  }));
  annotated.sort((a, b) => {
    if (classRank[a.cls] !== classRank[b.cls]) return classRank[a.cls] - classRank[b.cls];
    const idA = String(a.asset?.id || "");
    const idB = String(b.asset?.id || "");
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
  const counts = { identity: 0, default: 0, context: 0, unusable: 0 };
  for (const entry of annotated) {
    const cap = Number(caps?.[entry.cls]) || 0;
    if (entry.cls !== "unusable" && counts[entry.cls] < cap) {
      entry.selected = true;
      counts[entry.cls] += 1;
    }
  }
  return annotated;
}

function cleanText(value, max = BOUND.termText) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listify(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

/**
 * Tokenize free text into matchable terms (same rules as the reference
 * review query builder): lowercase, alnum words longer than two chars.
 * Pure-numeric tokens are dropped: OCR readouts (HUD values, hex
 * fragments, timestamps) dominate avatar intelligence text, and digits
 * carry no likeness signal for text overlap — the live store measured 757
 * of 8,676 profile terms were all-digit noise that displaced real words
 * under the term bound.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function tokenizeLikenessText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !/^[0-9]+$/.test(term));
}

/**
 * Classify an Avatar asset's likeness weight class from its shape.
 *
 * @param {{ type?: string, name?: string, requirementId?: string, metadata?: object }} asset
 * @returns {"identity"|"default"|"context"|"unusable"}
 */
export function classifyAssetWeightClass(asset = {}) {
  if (asset.type !== "image" && asset.type !== "video") return "unusable";
  const documentKind = asset.metadata?.intelligence?.classifications?.documentKind || "";
  const haystack = `${asset.requirementId || ""} ${asset.name || ""} ${documentKind}`;
  if (/backgroundless|closeup|fullbody|concept|avatar_reference/i.test(haystack)) return "identity";
  if (/dossier|kit|tarot/i.test(haystack)) return "context";
  return "default";
}

export function assetLikenessWeight(asset = {}) {
  return AVATAR_LIKENESS_WEIGHTS[classifyAssetWeightClass(asset)];
}

/**
 * Assemble the text channel from a raw Avatar Card: OCR lines, vision
 * labels, tags, symbolic motifs, and cast-registry identity invariants.
 *
 * @param {{ id: string, primaryName?: string, assets?: object[] }} avatar
 * @param {{ registry?: object[] }} [options] cast registry entries (defaults
 *   to the Echo Avatar Cast Registry)
 * @returns {{ ocrLines: string[], labels: string[], tags: string[], motifs: string[], invariants: string[], terms: string[] }}
 */
export function textChannelFromAvatar(avatar = {}, { registry } = {}) {
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const ocrLines = [];
  const labels = [];
  const tags = [];
  for (const asset of assets) {
    const intelligence = asset.metadata?.intelligence || {};
    for (const line of listify(intelligence.ocr?.lines)) {
      const text = typeof line === "string" ? line : line?.text || "";
      const cleaned = cleanText(text);
      if (cleaned) ocrLines.push(cleaned);
    }
    if (!intelligence.ocr?.lines?.length && typeof intelligence.ocr?.text === "string") {
      for (const line of intelligence.ocr.text.split("\n")) {
        const cleaned = cleanText(line);
        if (cleaned) ocrLines.push(cleaned);
      }
    }
    for (const label of listify(intelligence.vision?.labels)) {
      const text = typeof label === "string" ? label : label?.identifier || label?.label || "";
      const cleaned = cleanText(text, 80);
      if (cleaned) labels.push(cleaned);
    }
    for (const tag of listify(asset.tags)) {
      const cleaned = cleanText(tag, 80);
      if (cleaned) tags.push(cleaned);
    }
  }
  const registryPool = Array.isArray(registry)
    ? registry
    : [...(ECHO_AVATAR_CAST_REGISTRY.evergreen || []), ...(ECHO_AVATAR_CAST_REGISTRY.directors || [])];
  const registryEntries = registryPool.filter(
    (entry) => String(entry?.avatarId || "") === String(avatar.id || ""),
  );
  const invariants = listify(registryEntries[0]?.identityInvariants).map((value) => cleanText(value, 120)).filter(Boolean);
  const motifs = [...tags, ...ocrLines]
    .filter((value) => SYMBOLIC_MOTIF_RE.test(value))
    .map((value) => cleanText(value, 80));
  const terms = new Set(
    [...tags, ...labels, ...motifs, ...invariants, ...ocrLines, cleanText(avatar.primaryName), ...listify(avatar.aliases)]
      .flatMap(tokenizeLikenessText),
  );
  return {
    ocrLines: ocrLines.slice(0, BOUND.ocrLines),
    labels: [...new Set(labels)].slice(0, BOUND.labels),
    tags: [...new Set(tags)].slice(0, BOUND.tags),
    motifs: [...new Set(motifs)].slice(0, BOUND.motifs),
    invariants: [...new Set(invariants)].slice(0, BOUND.invariants),
    terms: [...terms].sort().slice(0, BOUND.terms),
  };
}

/**
 * Merge weighted media signatures into one media likeness signal.
 *
 * @param {Array<{ weight: number, signature: { palette: object, dHash?: string, dHashes?: string[], tone: object } }>} entries
 * @returns {{ tone: object, palette: object, dHashes: string[] } | null}
 */
export function mergeLikenessMedia(entries = []) {
  const usable = (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry?.signature && Number(entry.weight) > 0,
  );
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, entry) => sum + Number(entry.weight), 0);
  const tone = { r: 0, g: 0, b: 0, saturation: 0 };
  const binMass = new Float64Array(PALETTE_CUBE_BINS);
  let paletteMass = 0;
  const hashes = [];
  for (const entry of usable) {
    const share = Number(entry.weight) / totalWeight;
    tone.r += (Number(entry.signature.tone?.r) || 0) * share;
    tone.g += (Number(entry.signature.tone?.g) || 0) * share;
    tone.b += (Number(entry.signature.tone?.b) || 0) * share;
    tone.saturation += (Number(entry.signature.tone?.saturation) || 0) * share;
    const vector = paletteHistogramToVector(entry.signature.palette);
    const vectorMass = vector.reduce((sum, value) => sum + value, 0);
    if (vectorMass > 0) {
      paletteMass += vectorMass * share;
      for (let bin = 0; bin < PALETTE_CUBE_BINS; bin += 1) binMass[bin] += vector[bin] * share;
    }
    const frameHashes = entry.signature.dHashes?.length
      ? entry.signature.dHashes
      : [entry.signature.dHash].filter(Boolean);
    for (const hash of frameHashes) {
      if (hash && !hashes.includes(hash)) hashes.push(hash);
    }
  }
  const entriesSorted = [...binMass.entries()]
    .filter(([, weight]) => weight > 0)
    .map(([bin, weight]) => ({ bin, weight: paletteMass > 0 ? weight / paletteMass : 0 }))
    .sort((a, b) => (b.weight - a.weight) || (a.bin - b.bin));
  const bins = entriesSorted.slice(0, PALETTE_HISTOGRAM_TOP_K).map((entry) => ({
    bin: entry.bin,
    weight: Number(entry.weight.toFixed(6)),
  }));
  return {
    tone: {
      r: Number(tone.r.toFixed(2)),
      g: Number(tone.g.toFixed(2)),
      b: Number(tone.b.toFixed(2)),
      saturation: Number(tone.saturation.toFixed(4)),
    },
    palette: {
      bins,
      totalWeight: Number(bins.reduce((sum, entry) => sum + entry.weight, 0).toFixed(6)),
    },
    dHashes: hashes.slice(0, AVATAR_LIKENESS_MAX_HASHES),
  };
}

/**
 * Build a full Avatar likeness profile document.
 *
 * @param {{
 *   avatarId: string, name?: string,
 *   entries?: Array<{ assetId: string, kind: "image"|"video", fileName?: string,
 *                     weight: number, status: "signed"|"missing"|"failed",
 *                     signature?: object, note?: string }>,
 *   text?: object, profiledAt?: string,
 *   sampling?: { usable?: number, attempted?: number, signed?: number, sampledOut?: number },
 * }} input
 * @returns {object} profile document (schema AVATAR_LIKENESS_PROFILE_SCHEMA)
 */
export function buildAvatarLikenessProfile(input = {}) {
  const avatarId = String(input.avatarId || "").trim();
  if (!avatarId) throw new Error("buildAvatarLikenessProfile requires an avatarId");
  const entries = (Array.isArray(input.entries) ? input.entries : []).map((entry) => ({
    assetId: String(entry.assetId || ""),
    kind: entry.kind === "video" ? "video" : "image",
    fileName: entry.fileName ? String(entry.fileName).slice(0, 240) : "",
    weight: Math.max(0, Number(entry.weight) || 0),
    status: entry.status || "signed",
    note: entry.note ? String(entry.note).slice(0, 160) : undefined,
    signature: entry.signature || null,
  }));
  const signed = entries.filter((entry) => entry.status === "signed" && entry.signature);
  const media = mergeLikenessMedia(signed);
  const profileless = !media;
  const reason = profileless
    ? entries.length
      ? "all referenced pixel media were missing or failed to decode"
      : "no usable visual assets attached"
    : undefined;
  const text = input.text && typeof input.text === "object" ? input.text : textChannelFromAvatar({});
  return {
    schemaVersion: AVATAR_LIKENESS_PROFILE_SCHEMA,
    avatarId,
    signerVersion: String(input.signerVersion || AVATAR_LIKENESS_SIGNER_VERSION),
    name: input.name ? String(input.name).slice(0, 120) : undefined,
    status: profileless ? "profileless" : "profiled",
    ...(reason ? { reason } : {}),
    ...(media ? { media } : {}),
    text: {
      ocrLines: listify(text.ocrLines).map((value) => cleanText(value)).filter(Boolean).slice(0, BOUND.ocrLines),
      labels: listify(text.labels).map((value) => cleanText(value, 80)).filter(Boolean).slice(0, BOUND.labels),
      tags: listify(text.tags).map((value) => cleanText(value, 80)).filter(Boolean).slice(0, BOUND.tags),
      motifs: listify(text.motifs).map((value) => cleanText(value, 80)).filter(Boolean).slice(0, BOUND.motifs),
      invariants: listify(text.invariants).map((value) => cleanText(value, 120)).filter(Boolean).slice(0, BOUND.invariants),
      terms: listify(text.terms).map((value) => cleanText(value, 80)).filter(Boolean).sort().slice(0, BOUND.terms),
    },
    sourceAssets: entries.map(({ signature, ...rest }) => rest),
    ...(input.sampling && typeof input.sampling === "object"
      ? { sampling: {
          usable: Math.max(0, Number(input.sampling.usable) || 0),
          attempted: Math.max(0, Number(input.sampling.attempted) || 0),
          signed: Math.max(0, Number(input.sampling.signed) || 0),
          sampledOut: Math.max(0, Number(input.sampling.sampledOut) || 0),
        } }
      : {}),
    assetFingerprints: input.assetFingerprints && typeof input.assetFingerprints === "object"
      ? Object.fromEntries(
          Object.entries(input.assetFingerprints).map(([key, value]) => [String(key), String(value)]),
        )
      : {},
    profiledAt: input.profiledAt || new Date().toISOString(),
  };
}
/**
 * Freshness: the profile matches only when the set of pixel assets and
 * every asset fingerprint are exactly what the profile recorded.
 *
 * @param {object} profile
 * @param {Array<{ assetId: string, fingerprint: string }>} currentAssets
 * @returns {boolean}
 */
export function profileIsFresh(profile, currentAssets = []) {
  if (!profile || profile.schemaVersion !== AVATAR_LIKENESS_PROFILE_SCHEMA) return false;
  // A profile signed by an older/different signer version is stale by
  // definition, even when every source file is byte-identical.
  if (profile.signerVersion !== AVATAR_LIKENESS_SIGNER_VERSION) return false;
  const recorded = profile.assetFingerprints || {};
  const current = new Map((Array.isArray(currentAssets) ? currentAssets : []).map((asset) => [String(asset.assetId), String(asset.fingerprint || "")]));
  if (current.size !== Object.keys(recorded).length) return false;
  for (const [assetId, fingerprint] of current) {
    if (recorded[assetId] !== fingerprint) return false;
  }
  return true;
}

/**
 * Compact projection for API/UI consumers.
 *
 * @param {object} profile
 * @returns {object}
 */
export function profileSummary(profile = {}) {
  const media = profile.media || null;
  return {
    avatarId: profile.avatarId,
    name: profile.name,
    status: profile.status,
    ...(profile.reason ? { reason: profile.reason } : {}),
    tone: media?.tone || null,
    topPalette: media?.palette?.bins?.slice(0, 6) || [],
    dHashCount: media?.dHashes?.length || 0,
    termCount: profile.text?.terms?.length || 0,
    sourceAssetCount: profile.sourceAssets?.length || 0,
    signedCount: (profile.sourceAssets || []).filter((entry) => entry.status === "signed").length,
    usableCount: profile.sampling?.usable ?? profile.sourceAssets?.length ?? 0,
    profiledAt: profile.profiledAt,
  };
}
