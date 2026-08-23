// Media Visual Signature — deterministic pixel features + similarity.
//
// Pure feature math for the Avatar Likeness Assignment plan
// (docs/AVATAR_LIKENESS_ASSIGNMENT_PLAN.md, layer L1). This module is
// browser-safe: it operates on pixel arrays and never spawns processes.
// Frame acquisition (ffmpeg/ffprobe) lives in
// server/media-visual-signature-extract.mjs.
//
// The same feature extraction runs on both sides of a likeness match —
// Avatar Card media and enricher-accepted media — so the signals are
// directly comparable. Nothing here claims identity; it only measures
// deterministic, reproducible visual statistics.

export const MEDIA_VISUAL_SIGNATURE_SCHEMA = "hapa.media-visual-signature.v1";

// 6×6×6 RGB cube = 216 bins. Coarse on purpose: likeness matching wants
// stable dominant-color mass, not quantization noise. Same family as the
// dominantColor(pixels, bucketSize) precedent in the backgroundless script.
export const PALETTE_CUBE_LEVELS = 6;
export const PALETTE_CUBE_BINS = PALETTE_CUBE_LEVELS ** 3;

// Weighted top-K keeps the JSON representation small (24 {bin,weight}
// entries ≈ 300 bytes per frame) while preserving the dominant palette.
export const PALETTE_HISTOGRAM_TOP_K = 24;

// dHash: 8×8 output from a 9×8 grayscale source; 64 bits.
export const DHASH_SOURCE_WIDTH = 9;
export const DHASH_SOURCE_HEIGHT = 8;
export const DHASH_BITS = 64;

// Sample sizes for feature extraction (the extraction layer scales to these).
export const SIGNATURE_COLOR_SAMPLE = 64; // 64×64 for palette + tone
export const SIGNATURE_HASH_SAMPLE_WIDTH = DHASH_SOURCE_WIDTH;
export const SIGNATURE_HASH_SAMPLE_HEIGHT = DHASH_SOURCE_HEIGHT;

// Cap on distinct hashes kept in a merged (multi-frame) signature.
export const MERGED_HASH_SET_MAX = 8;

function clamp01(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Cube bin index for an RGB triplet at the given quantization levels.
 *
 * @param {number} r 0..255
 * @param {number} g 0..255
 * @param {number} b 0..255
 * @param {number} [levels]
 * @returns {number} 0 .. levels^3 - 1
 */
export function paletteBinIndex(r, g, b, levels = PALETTE_CUBE_LEVELS) {
  const scale = 256 / levels;
  const quantize = (channel) => {
    const value = Number(channel);
    if (!Number.isFinite(value)) return 0;
    return Math.min(levels - 1, Math.max(0, Math.floor(value / scale)));
  };
  const [ir, ig, ib] = [quantize(r), quantize(g), quantize(b)];
  return ir * levels * levels + ig * levels + ib;
}

/**
 * Weighted top-K palette histogram from an RGB24 pixel buffer.
 *
 * Weights are the fraction of sampled pixels per cube bin. Entries are
 * ordered by weight (desc), then bin index, so output is deterministic.
 *
 * @param {Uint8Array|number[]|Buffer} rgb24 raw pixels, length width*height*3
 * @param {number} width
 * @param {number} height
 * @param {{ topK?: number }} [options]
 * @returns {{ bins: Array<{ bin: number, weight: number }>, totalWeight: number }}
 */
export function paletteHistogramFromPixels(rgb24, width, height, { topK = PALETTE_HISTOGRAM_TOP_K } = {}) {
  const pixels = Math.max(0, Math.trunc(width) * Math.trunc(height));
  if (!pixels || rgb24.length < pixels * 3) {
    throw new Error(`paletteHistogramFromPixels: expected ${pixels * 3} bytes, got ${rgb24?.length ?? 0}`);
  }
  const counts = new Float64Array(PALETTE_CUBE_BINS);
  for (let i = 0; i < pixels; i += 1) {
    counts[paletteBinIndex(rgb24[i * 3], rgb24[i * 3 + 1], rgb24[i * 3 + 2])] += 1;
  }
  const entries = [];
  for (let bin = 0; bin < PALETTE_CUBE_BINS; bin += 1) {
    if (counts[bin] > 0) entries.push({ bin, weight: counts[bin] / pixels });
  }
  entries.sort((a, b) => (b.weight - a.weight) || (a.bin - b.bin));
  const keep = Math.max(1, Math.min(PALETTE_CUBE_BINS, Math.trunc(topK) || PALETTE_HISTOGRAM_TOP_K));
  const bins = entries.slice(0, keep).map((entry) => ({
    bin: entry.bin,
    weight: Number(entry.weight.toFixed(6)),
  }));
  const totalWeight = Number(bins.reduce((sum, entry) => sum + entry.weight, 0).toFixed(6));
  return { bins, totalWeight };
}

/**
 * Expand a histogram into a dense 216-bin vector.
 *
 * @param {{ bins?: Array<{ bin: number, weight: number }> } | null} histogram
 * @returns {Float64Array}
 */
export function paletteHistogramToVector(histogram) {
  const vector = new Float64Array(PALETTE_CUBE_BINS);
  for (const entry of histogram?.bins || []) {
    const bin = Math.trunc(entry?.bin);
    const weight = Number(entry?.weight);
    if (Number.isInteger(bin) && bin >= 0 && bin < PALETTE_CUBE_BINS && weight > 0) {
      vector[bin] += weight;
    }
  }
  return vector;
}

// Neighborhood lookup (Chebyshev distance `tolerance` in the RGB cube) is
// computed once: tolerant matching lets adjacent quantization bins count as
// matches, which is what makes histogram comparison robust to codecs,
// scaling, and lighting.
const neighborCache = new Map();

function neighborhoodVector(vector, tolerance = 1) {
  const key = tolerance;
  let map = neighborCache.get(key);
  if (!map) {
    map = new Map();
    const step = PALETTE_CUBE_LEVELS;
    for (let bin = 0; bin < PALETTE_CUBE_BINS; bin += 1) {
      const x = Math.floor(bin / (step * step));
      const y = Math.floor((bin % (step * step)) / step);
      const z = bin % step;
      const neighbors = [];
      for (let dx = -tolerance; dx <= tolerance; dx += 1) {
        for (let dy = -tolerance; dy <= tolerance; dy += 1) {
          for (let dz = -tolerance; dz <= tolerance; dz += 1) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            if (nx < 0 || ny < 0 || nz < 0 || nx >= step || ny >= step || nz >= step) continue;
            neighbors.push(nx * step * step + ny * step + nz);
          }
        }
      }
      map.set(bin, neighbors);
    }
    neighborCache.set(key, map);
  }
  return { map, step: PALETTE_CUBE_LEVELS };
}

/**
 * Symmetric tolerant histogram intersection.
 *
 * Each side is normalized by its own mass (top-K truncation is allowed),
 * then for every bin the matched mass is the minimum of its own weight and
 * the neighbor mass on the other side. Returns 1 for identical palettes and
 * 0 when either side has no color mass or the palettes are disjoint.
 *
 * @param {object} a paletteHistogramFromPixels shape
 * @param {object} b paletteHistogramFromPixels shape
 * @param {{ tolerance?: number }} [options]
 * @returns {number} 0..1
 */
export function paletteHistogramSimilarity(a, b, { tolerance = 1 } = {}) {
  const va = paletteHistogramToVector(a);
  const vb = paletteHistogramToVector(b);
  const massA = va.reduce((sum, value) => sum + value, 0);
  const massB = vb.reduce((sum, value) => sum + value, 0);
  if (massA <= 0 || massB <= 0) return 0;
  const { map } = neighborhoodVector(tolerance);
  let matchedA = 0;
  let matchedB = 0;
  for (let bin = 0; bin < PALETTE_CUBE_BINS; bin += 1) {
    if (va[bin] <= 0 && vb[bin] <= 0) continue;
    const nearB = (map.get(bin) || []).reduce((sum, near) => sum + vb[near], 0);
    const nearA = (map.get(bin) || []).reduce((sum, near) => sum + va[near], 0);
    matchedA += Math.min(va[bin], nearB);
    matchedB += Math.min(vb[bin], nearA);
  }
  return clamp01(0.5 * (matchedA / massA + matchedB / massB));
}

/**
 * dHash from a 9×8 grayscale buffer (standard difference hash: bit set when
 * the left neighbor is darker than the right neighbor).
 *
 * @param {Uint8Array|number[]|Buffer} gray length 72 (9×8)
 * @returns {string} 16 hex characters (64 bits)
 */
export function dHashFromGrayscale(gray, width = DHASH_SOURCE_WIDTH, height = DHASH_SOURCE_HEIGHT) {
  const needed = width * height;
  if (!gray || gray.length < needed) {
    throw new Error(`dHashFromGrayscale: expected ${needed} bytes, got ${gray?.length ?? 0}`);
  }
  const bytes = Buffer.alloc(8);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width - 1; col += 1) {
      if (gray[row * width + col] < gray[row * width + col + 1]) {
        bytes[row] |= 0x80 >> col;
      }
    }
  }
  return bytes.toString("hex");
}

/**
 * @param {string} a 16 hex chars
 * @param {string} b 16 hex chars
 * @returns {number} 0..64 differing bits
 */
export function dHashHamming(a, b) {
  const left = Buffer.from(String(a || "").padEnd(16, "0").slice(0, 16), "hex");
  const right = Buffer.from(String(b || "").padEnd(16, "0").slice(0, 16), "hex");
  if (left.length !== 8 || right.length !== 8) return DHASH_BITS;
  let distance = 0;
  for (let i = 0; i < 8; i += 1) {
    distance += (left[i] ^ right[i]).toString(2).replace(/0/g, "").length;
  }
  return Math.min(DHASH_BITS, distance);
}

/**
 * @param {string} a 16 hex chars
 * @param {string} b 16 hex chars
 * @returns {number} 0..1 (1 = identical hashes)
 */
export function dHashSimilarity(a, b) {
  return 1 - dHashHamming(a, b) / DHASH_BITS;
}

/**
 * Best similarity across a set of hashes (multi-frame signatures keep a
 * small distinct-hash set; the closest representative wins).
 *
 * @param {string} hash
 * @param {string[]} hashes
 * @returns {number} 0..1
 */
export function dHashListSimilarity(hash, hashes) {
  const list = (Array.isArray(hashes) ? hashes : []).map((value) => String(value || "")).filter(Boolean);
  if (!list.length) return 0;
  let best = 0;
  for (const candidate of new Set(list)) {
    best = Math.max(best, dHashSimilarity(hash, candidate));
  }
  return best;
}

/**
 * Global tone vector: mean RGB (0..255) + mean saturation (0..1).
 *
 * @param {Uint8Array|number[]|Buffer} rgb24
 * @param {number} width
 * @param {number} height
 * @returns {{ r: number, g: number, b: number, saturation: number }}
 */
export function toneFromPixels(rgb24, width, height) {
  const pixels = Math.max(0, Math.trunc(width) * Math.trunc(height));
  if (!pixels || rgb24.length < pixels * 3) {
    throw new Error(`toneFromPixels: expected ${pixels * 3} bytes, got ${rgb24?.length ?? 0}`);
  }
  let r = 0;
  let g = 0;
  let b = 0;
  let sat = 0;
  for (let i = 0; i < pixels; i += 1) {
    const pr = rgb24[i * 3];
    const pg = rgb24[i * 3 + 1];
    const pb = rgb24[i * 3 + 2];
    r += pr;
    g += pg;
    b += pb;
    sat += (Math.max(pr, pg, pb) - Math.min(pr, pg, pb)) / 255;
  }
  return {
    r: Number((r / pixels).toFixed(2)),
    g: Number((g / pixels).toFixed(2)),
    b: Number((b / pixels).toFixed(2)),
    saturation: Number((sat / pixels).toFixed(4)),
  };
}

/**
 * @param {{ r: number, g: number, b: number, saturation: number }} a
 * @param {{ r: number, g: number, b: number, saturation: number }} b
 * @returns {number} 0..1 (1 = same tone)
 */
export function toneSimilarity(a, b) {
  const left = { r: Number(a?.r) || 0, g: Number(a?.g) || 0, b: Number(a?.b) || 0, saturation: Number(a?.saturation) || 0 };
  const right = { r: Number(b?.r) || 0, g: Number(b?.g) || 0, b: Number(b?.b) || 0, saturation: Number(b?.saturation) || 0 };
  const colorDistance = Math.sqrt(
    (left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2,
  ) / (255 * Math.sqrt(3)); // normalized 0..1
  return clamp01(1 - (0.7 * colorDistance + 0.3 * Math.abs(left.saturation - right.saturation)));
}

/**
 * Assemble one frame signature from its pixel samples.
 *
 * @param {{
 *   rgb: Uint8Array|number[]|Buffer, width: number, height: number,
 *   gray?: Uint8Array|number[]|Buffer,
 * }} input rgb is the color sample (e.g. 64×64); gray is the hash sample
 *   (9×8). A missing gray yields an all-zero dHash (uniform frame).
 * @returns {{ palette: object, dHash: string, tone: object }}
 */
export function signatureFromFrame({ rgb, width, height, gray }) {
  const palette = paletteHistogramFromPixels(rgb, width, height);
  const tone = toneFromPixels(rgb, width, height);
  const dHash = gray
    ? dHashFromGrayscale(gray, DHASH_SOURCE_WIDTH, DHASH_SOURCE_HEIGHT)
    : "0".repeat(16);
  return { palette, dHash, tone };
}

/**
 * Merge multiple frame signatures into one media signature:
 * - tone: mean of frame tones
 * - palette: summed bin mass renormalized to a single-frame-comparable
 *   histogram (top-K again)
 * - dHashes: distinct hashes, capped
 *
 * @param {Array<{ palette: object, dHash: string, tone: object }>} signatures
 * @param {{ topK?: number, maxHashes?: number }} [options]
 * @returns {{ palette: object, dHashes: string[], tone: object }}
 */
export function mergeFrameSignatures(signatures, { topK = PALETTE_HISTOGRAM_TOP_K, maxHashes = MERGED_HASH_SET_MAX } = {}) {
  const frames = (Array.isArray(signatures) ? signatures : []).filter((frame) => frame && typeof frame === "object");
  if (!frames.length) {
    throw new Error("mergeFrameSignatures: no frame signatures to merge");
  }
  const total = { r: 0, g: 0, b: 0, saturation: 0 };
  const binMass = new Map();
  const hashes = [];
  for (const frame of frames) {
    total.r += Number(frame.tone?.r) || 0;
    total.g += Number(frame.tone?.g) || 0;
    total.b += Number(frame.tone?.b) || 0;
    total.saturation += Number(frame.tone?.saturation) || 0;
    for (const entry of frame.palette?.bins || []) {
      binMass.set(entry.bin, (binMass.get(entry.bin) || 0) + Number(entry.weight) || 0);
    }
    if (frame.dHash && !hashes.includes(frame.dHash)) hashes.push(frame.dHash);
  }
  const massSum = [...binMass.values()].reduce((sum, value) => sum + value, 0);
  const entries = [...binMass.entries()]
    .map(([bin, weight]) => ({ bin, weight: massSum > 0 ? weight / massSum : 0 }))
    .sort((a, b) => (b.weight - a.weight) || (a.bin - b.bin));
  const keep = Math.max(1, Math.min(PALETTE_CUBE_BINS, Math.trunc(topK) || PALETTE_HISTOGRAM_TOP_K));
  const bins = entries.slice(0, keep).map((entry) => ({
    bin: entry.bin,
    weight: Number(entry.weight.toFixed(6)),
  }));
  return {
    palette: {
      bins,
      totalWeight: Number(bins.reduce((sum, entry) => sum + entry.weight, 0).toFixed(6)),
    },
    dHashes: hashes.slice(0, Math.max(1, Math.trunc(maxHashes) || MERGED_HASH_SET_MAX)),
    tone: {
      r: Number((total.r / frames.length).toFixed(2)),
      g: Number((total.g / frames.length).toFixed(2)),
      b: Number((total.b / frames.length).toFixed(2)),
      saturation: Number((total.saturation / frames.length).toFixed(4)),
    },
  };
}
