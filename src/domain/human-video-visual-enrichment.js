/**
 * Machine-derived visual enrichment for Human Enricher videos.
 *
 * This store keeps computed telemetry only: a local median-cut palette derived
 * from sampled media pixels, plus a description joined from the cheapest
 * trustworthy source (agent optical review first, Echo enrichment catalog
 * second). Human-authored direction lives in `human-video-enrichment.js`;
 * the two stores must not mix because their truth boundaries differ.
 *
 * The module is pure: no filesystem, no ffmpeg, no SQLite. The CLI script
 * (`scripts/enrich-human-accepted-visuals.mjs`) does I/O and calls the
 * palette/description/identity functions here.
 */

export const HUMAN_VIDEO_VISUAL_ENRICHMENT_STORE_SCHEMA = "hapa.human-video-visual-enrichment-store.v1";
export const HUMAN_VIDEO_VISUAL_ENRICHMENT_RECORD_SCHEMA = "hapa.human-video-visual-enrichment.v1";
export const HUMAN_VIDEO_VISUAL_ENRICHMENT_EVENT_SCHEMA = "hapa.human-video-visual-enrichment-event.v1";
export const HUMAN_VIDEO_PALETTE_METHOD = "local-median-cut-v1";

export const HUMAN_VIDEO_VISUAL_ENRICHMENT_TRUTH_BOUNDARY =
  "Machine-derived visual telemetry. Palettes are computed from sampled media pixels and descriptions are joined from agent optical reviews or the Echo enrichment catalog. Nothing here establishes canon, ownership, rights clearance, publication approval, or human direction.";

const NO_VALUE = Symbol("human-video-visual-enrichment:no-value");

function cleanText(value, max = 12_000) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  return max && text.length > max ? text.slice(0, max).trim() : text;
}

function cleanMultilineText(value, max = 12_000) {
  const text = String(value ?? "").replace(/\r\n?/gu, "\n").trim();
  return max && text.length > max ? text.slice(0, max).trim() : text;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hexOf(channel) {
  const value = Math.max(0, Math.min(255, Math.round(Number(channel) || 0)));
  return value.toString(16).padStart(2, "0");
}

function medianValue(values = []) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Convert a raw rgb24 frame (one per 32x32 region sample) into [r, g, b]
 * integer pixel tuples in scanline order.
 */
export function rgbPixelsFromRawFrame(data, width = 32, height = 32) {
  const pixels = [];
  if (!data) return pixels;
  const stride = 3;
  const available = Math.min(data.length, width * height * stride);
  for (let index = 0; index + stride <= available; index += stride) {
    pixels.push([data[index], data[index + 1], data[index + 2]]);
  }
  return pixels;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (max + min === 0 ? 1 : max + min);
  let h;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  return { h: ((h * 60) + 360) % 360, s, l };
}

function boxMaxRange(box) {
  let range = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    let min = 255;
    let max = 0;
    for (const pixel of box.pixels) {
      if (pixel[channel] < min) min = pixel[channel];
      if (pixel[channel] > max) max = pixel[channel];
    }
    range = Math.max(range, max - min);
  }
  return range;
}

function boxChannelRange(box, channel) {
  let min = 255;
  let max = 0;
  for (const pixel of box.pixels) {
    if (pixel[channel] < min) min = pixel[channel];
    if (pixel[channel] > max) max = pixel[channel];
  }
  return max - min;
}

/**
 * Deterministic median-cut quantization over pooled [r, g, b] pixels.
 *
 * Splitting is fully ordered: the box with the most pixels (ties broken by
 * the widest channel range, then the lowest id) is split on its widest
 * channel at the median, so the same pixels always produce the same boxes.
 * Stops early when fewer than `targetCount` distinct colors remain.
 */
export function medianCut(pixels = [], targetCount = 8) {
  const count = Math.max(1, Math.trunc(Number(targetCount) || 8));
  if (!pixels.length) return [];
  let boxes = [{ id: 0, pixels: [...pixels] }];
  let nextId = 1;
  while (boxes.length < count) {
    const splittable = boxes
      .filter((box) => box.pixels.length > 1 && boxMaxRange(box) > 0)
      .sort((a, b) => b.pixels.length - a.pixels.length
        || boxMaxRange(b) - boxMaxRange(a)
        || a.id - b.id);
    const box = splittable[0];
    if (!box) break;
    let channel = 0;
    for (let candidate = 1; candidate < 3; candidate += 1) {
      if (boxChannelRange(box, candidate) > boxChannelRange(box, channel)) channel = candidate;
    }
    const ordered = [...box.pixels].sort((p, q) => (p[channel] - q[channel])
      || (p[0] - q[0]) || (p[1] - q[1]) || (p[2] - q[2]));
    const half = Math.max(1, Math.floor(ordered.length / 2));
    boxes = boxes.filter((entry) => entry !== box)
      .concat([
        { id: nextId, pixels: ordered.slice(0, half) },
        { id: nextId + 1, pixels: ordered.slice(half) },
      ]);
    nextId += 2;
  }
  return boxes;
}

/**
 * Derive the v1 color profile from sampled raw rgb24 frames.
 *
 * `rawFrames` is an array of `{ data: Uint8Array|Buffer, width?, height? }`;
 * every frame weighs equally regardless of clip duration, so callers decide
 * how many evenly-spaced sample times a video gets. Deterministic: identical
 * frames always yield an identical profile object.
 */
export function paletteFromRawFrames(rawFrames = [], options = {}) {
  const methodVersion = options.methodVersion || HUMAN_VIDEO_PALETTE_METHOD;
  const swatchCount = Math.max(1, Math.trunc(options.swatchCount || 8));
  const chromaThreshold = Number(options.chromaThreshold || 0.15);
  const pixels = (Array.isArray(rawFrames) ? rawFrames : []).flatMap((frame) =>
    rgbPixelsFromRawFrame(frame?.data, Number(frame?.width) || 32, Number(frame?.height) || 32));
  if (!pixels.length) throw new Error("paletteFromRawFrames requires at least one non-empty raw frame");
  const total = pixels.length;
  const boxes = medianCut(pixels, swatchCount);
  const swatches = boxes.map((box) => {
    const median = [0, 1, 2].map((channel) => medianValue(box.pixels.map((pixel) => pixel[channel])));
    return {
      hex: `#${hexOf(median[0])}${hexOf(median[1])}${hexOf(median[2])}`,
      share: round(box.pixels.length / total),
    };
  }).sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex));

  let luminanceSum = 0;
  let saturationSum = 0;
  let chroma = 0;
  let warm = 0;
  let cool = 0;
  const hueBins = new Array(12).fill(0);
  for (const [r, g, b] of pixels) {
    const { h, s } = rgbToHsl(r, g, b);
    luminanceSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    saturationSum += s;
    if (s > chromaThreshold) {
      chroma += 1;
      hueBins[Math.min(11, Math.floor(h / 30))] += 1;
      if (h >= 330 || h < 90) warm += 1;
      else if (h >= 150 && h < 270) cool += 1;
    }
  }
  const chromaAxis = warm + cool;
  return {
    methodVersion,
    swatches,
    luminance: round(luminanceSum / total),
    saturation: round(saturationSum / total),
    hueHistogram: hueBins.map((bin) => (chroma ? round(bin / chroma) : 0)),
    // Warm hues: red/orange/yellow (330-360 + 0-90). Cool hues: cyan/blue (150-270).
    warmth: chromaAxis > 0 ? round(2 * (warm / chromaAxis) - 1) : 0,
    chromaShare: round(chroma / total),
    pixelCount: total,
    frameCount: Array.isArray(rawFrames) ? rawFrames.length : 0,
  };
}

/** Strip a `sha256:` prefix and validate a 64-hex digest. Returns "" when invalid. */
export function sha256Hex(value) {
  const text = String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

/**
 * Description from an agent optical review. Provenance is read from the
 * review record itself (model, promptVersion, status), never assumed.
 */
export function agentReviewDescription(review = null) {
  const text = cleanMultilineText(review?.proposal?.description, 12_000);
  if (!text) return null;
  return {
    text,
    sourceClass: "agent-optical",
    provenance: {
      reviewId: cleanText(review?.id, 360) || null,
      model: cleanText(review?.reviewer?.model, 180) || null,
      promptVersion: cleanText(review?.reviewer?.parameters?.promptVersion, 180) || null,
      reviewStatus: cleanText(review?.status, 80) || null,
    },
  };
}

/** Description reused from the Echo enrichment catalog (SQLite synopsis). */
export function echoCatalogDescription(synopsis, provenance = {}) {
  const text = cleanMultilineText(synopsis, 12_000);
  if (!text) return null;
  return {
    text,
    sourceClass: "echo-enrichment",
    provenance: {
      catalogSha256: provenance.catalogSha256 || null,
      catalogTable: cleanText(provenance.catalogTable, 120) || "enrichments",
    },
  };
}

/**
 * Cheapest trustworthy description for a video:
 * agent optical review first, Echo catalog synopsis second, else null.
 * `echoSynopses` is a Map of sha256 hex -> synopsis text.
 */
export function descriptionForVideo(video = {}, options = {}) {
  const agent = agentReviewDescription(video.agentReview);
  if (agent) return agent;
  const sha = sha256Hex(video.contentFingerprint);
  if (sha && options.echoSynopses && options.echoSynopses.has(sha)) {
    return echoCatalogDescription(options.echoSynopses.get(sha), {
      ...options,
      catalogSha256: sha,
    });
  }
  return null;
}

/**
 * Stable identity used to decide whether a stored palette is still current.
 * Content fingerprints win; otherwise the file path plus size + mtime.
 * `fileStat` is an `fs.Stats`-shaped object ({ size, mtimeMs }) and
 * `options.filePath` is the concrete path that was actually sampled (the
 * dashboard `sourcePath` may be empty for uri-resolved media).
 */
export function visualSourceIdentity(video = {}, fileStat = null, options = {}) {
  const fingerprint = sha256Hex(video.contentFingerprint);
  const rawPath = options.filePath || video.sourcePath || "";
  const sourcePath = cleanText(String(rawPath).replace(/^file:\/\//u, ""), 4_000);
  const sizeBytes = Number(fileStat?.size) > 0 ? Math.trunc(Number(fileStat.size)) : null;
  const mtimeMs = Number(fileStat?.mtimeMs) > 0 ? Math.trunc(Number(fileStat.mtimeMs)) : null;
  if (fingerprint) {
    return { basis: "content-fingerprint", fingerprint, sourcePath: sourcePath || null, sizeBytes, mtimeMs };
  }
  if (sourcePath && sizeBytes && mtimeMs) {
    return { basis: "file", fingerprint: null, sourcePath, sizeBytes, mtimeMs };
  }
  return { basis: "none", fingerprint: null, sourcePath: sourcePath || null, sizeBytes: null, mtimeMs: null };
}

export function sourceIdentityMatches(stored = null, current = null) {
  if (!stored?.basis || !current?.basis || stored.basis === "none" || current.basis === "none") return false;
  if (stored.basis === "content-fingerprint" && current.basis === "content-fingerprint") {
    return Boolean(stored.fingerprint) && stored.fingerprint === current.fingerprint;
  }
  if (stored.basis === "file" && current.basis === "file") {
    return stored.sourcePath === current.sourcePath
      && stored.sizeBytes === current.sizeBytes
      && stored.mtimeMs === current.mtimeMs;
  }
  return false;
}

function normalizeSwatches(swatches = []) {
  if (!Array.isArray(swatches)) return null;
  const normalized = swatches
    .map((swatch) => {
      const hex = String(swatch?.hex || "").toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) return null;
      const share = Number(swatch?.share);
      if (!Number.isFinite(share) || share < 0 || share > 1) return null;
      return { hex, share: round(share) };
    })
    .filter(Boolean);
  return normalized.sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex));
}

export function normalizePalette(palette = null) {
  if (!palette || typeof palette !== "object") return null;
  const swatches = normalizeSwatches(palette.swatches);
  if (!swatches?.length) return null;
  const hueHistogram = Array.isArray(palette.hueHistogram) && palette.hueHistogram.length === 12
    ? palette.hueHistogram.map((bin) => round(Number(bin) || 0))
    : new Array(12).fill(0);
  return {
    methodVersion: cleanText(palette.methodVersion, 80) || HUMAN_VIDEO_PALETTE_METHOD,
    swatches,
    luminance: round(Number(palette.luminance) || 0),
    saturation: round(Number(palette.saturation) || 0),
    hueHistogram,
    warmth: round(Number(palette.warmth) || 0),
    chromaShare: round(Number(palette.chromaShare) || 0),
    pixelCount: Math.max(0, Math.trunc(Number(palette.pixelCount) || 0)),
    frameCount: Math.max(0, Math.trunc(Number(palette.frameCount) || 0)),
    source: palette.source && typeof palette.source === "object" ? palette.source : null,
  };
}

function normalizeDescriptionBlock(description = NO_VALUE) {
  if (description === NO_VALUE) return NO_VALUE;
  if (!description || typeof description !== "object") return null;
  const text = cleanMultilineText(description.text, 12_000);
  if (!text) return null;
  const provenance = description.provenance && typeof description.provenance === "object" ? description.provenance : {};
  return {
    text,
    sourceClass: cleanText(description.sourceClass, 80) || "unknown",
    provenance,
  };
}

function normalizeIdentity(input = {}) {
  return {
    recordId: cleanText(input.recordId || input.id, 360) || null,
    assetId: cleanText(input.assetId, 360) || null,
    contentFingerprint: cleanText(input.contentFingerprint, 360) || null,
    uri: cleanText(input.uri, 2_000) || null,
    sourcePath: cleanText(input.sourcePath, 4_000) || null,
  };
}

export function normalizeHumanVideoVisualEnrichmentRecord(input = {}, fallback = {}) {
  const key = cleanText(input.key ?? fallback.key, 4_500);
  if (!key) throw new Error("human-video-visual-enrichment: a record requires a stable video key");
  const rawAliases = input.aliases ?? fallback.aliases ?? [];
  const aliases = [...new Set([key, ...rawAliases.map((alias) => cleanText(alias, 4_500)).filter(Boolean)])].sort();
  const description = normalizeDescriptionBlock(input.description === NO_VALUE ? fallback.description : input.description);
  return {
    schemaVersion: HUMAN_VIDEO_VISUAL_ENRICHMENT_RECORD_SCHEMA,
    key,
    aliases,
    videoId: cleanText(input.videoId ?? fallback.videoId, 360) || null,
    videoName: cleanText(input.videoName ?? fallback.videoName, 800) || null,
    mediaType: cleanText(input.mediaType ?? fallback.mediaType, 40) || "video",
    videoIdentity: normalizeIdentity(input.videoIdentity ?? fallback.videoIdentity ?? {}),
    palette: normalizePalette(input.palette === NO_VALUE ? fallback.palette : input.palette),
    description: description === NO_VALUE ? fallback.description ?? null : description,
    createdAt: cleanText(input.createdAt || fallback.createdAt, 80) || null,
    updatedAt: cleanText(input.updatedAt || fallback.updatedAt, 80) || null,
  };
}

export function normalizeHumanVideoVisualEnrichmentStore(input = {}) {
  const seen = new Map();
  for (const record of input.records || []) {
    try {
      const normalized = normalizeHumanVideoVisualEnrichmentRecord(record, record);
      const current = seen.get(normalized.key);
      if (!current || String(normalized.updatedAt || "") > String(current.updatedAt || "")) seen.set(normalized.key, normalized);
    } catch {
      // A malformed record is dropped at load time; the store stays usable.
    }
  }
  const records = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
  const updatedAt = input.updatedAt
    || records.map((record) => record.updatedAt).filter(Boolean).sort().at(-1)
    || null;
  return {
    schemaVersion: HUMAN_VIDEO_VISUAL_ENRICHMENT_STORE_SCHEMA,
    records,
    updatedAt,
    truthBoundary: input.truthBoundary || HUMAN_VIDEO_VISUAL_ENRICHMENT_TRUTH_BOUNDARY,
  };
}

export function createHumanVideoVisualEnrichmentStore(input = {}) {
  return normalizeHumanVideoVisualEnrichmentStore(input);
}

/** Find a stored record by any of the incoming aliases (key, uri:, path:, ...). */
export function findHumanVideoVisualEnrichmentRecord(store = {}, match = {}) {
  const aliases = new Set([match.key, ...(match.aliases || [])].map((alias) => cleanText(alias, 4_500)).filter(Boolean));
  if (match.videoId) aliases.add(cleanText(match.videoId, 360));
  for (const record of store.records || []) {
    if ([record.key, record.videoId, ...(record.aliases || [])].some((alias) => aliases.has(alias))) return record;
  }
  return null;
}

/**
 * Merge a palette and/or description into the store. Passing `palette: NO_VALUE`
 * is not expressible from outside; omit the property instead to leave the
 * stored block untouched. Returns `{ store, record, changed }` where `changed`
 * is false when no stored content would differ (idempotent reruns).
 */
export function upsertHumanVideoVisualEnrichment(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoVisualEnrichmentStore(storeInput);
  const key = cleanText(input.key, 4_500);
  if (!key) throw new Error("human-video-visual-enrichment: an upsert requires a stable video key");
  const now = options.now || new Date().toISOString();
  const existing = findHumanVideoVisualEnrichmentRecord(store, {
    key,
    aliases: input.aliases || [],
    videoId: input.videoId,
  });
  const palette = input.palette === undefined
    ? existing?.palette ?? null
    : normalizePalette(input.palette);
  const description = input.description === undefined
    ? existing?.description ?? null
    : normalizeDescriptionBlock(input.description);
  const aliases = [...new Set([
    key,
    ...(input.aliases || []),
    ...(existing?.aliases || []),
  ].map((alias) => cleanText(alias, 4_500)).filter(Boolean))].sort();
  const videoName = cleanText(input.videoName ?? existing?.videoName, 800) || null;
  const mediaType = cleanText(input.mediaType ?? existing?.mediaType, 40) || "video";
  const videoIdentity = normalizeIdentity({
    ...normalizeIdentity(existing?.videoIdentity ?? {}),
    ...Object.fromEntries(Object.entries(normalizeIdentity(input.videoIdentity ?? {})).filter(([, value]) => value)),
  });
  const contentChanged = stableStringify(palette) !== stableStringify(existing?.palette ?? null)
    || stableStringify(description) !== stableStringify(existing?.description ?? null)
    || stableStringify(aliases) !== stableStringify(existing?.aliases ?? [])
    || videoName !== existing?.videoName
    || mediaType !== existing?.mediaType;
  const record = normalizeHumanVideoVisualEnrichmentRecord({
    key: existing?.key || key,
    aliases,
    videoId: input.videoId || existing?.videoId || videoIdentity.recordId,
    videoName,
    mediaType,
    videoIdentity,
    palette,
    description,
    createdAt: existing?.createdAt || now,
    updatedAt: contentChanged ? now : (existing?.updatedAt || now),
  });
  if (!contentChanged && existing) {
    return { store, record: existing, changed: false };
  }
  const records = store.records.filter((entry) => entry.key !== record.key);
  records.push(record);
  records.sort((a, b) => a.key.localeCompare(b.key));
  return {
    store: { ...store, records, updatedAt: now },
    record,
    changed: true,
  };
}

/** Append-only event rows for the store's NDJSON journal. */
export function humanVideoVisualEnrichmentEvent({ record = null, stage = "", error = null, actorId = "", now } = {}) {
  const key = record?.key || "";
  const digest = stableStringify({ stage, record }).replace(/[^a-z0-9]/gi, "").slice(0, 24) || "unknown";
  return {
    schemaVersion: HUMAN_VIDEO_VISUAL_ENRICHMENT_EVENT_SCHEMA,
    eventId: key ? `${key}:${stage}:${digest}` : `${stage}:${digest}`,
    action: error ? "human-video-visual-enrichment.failed" : "human-video-visual-enrichment.updated",
    occurredAt: now || new Date().toISOString(),
    actorId: actorId || "scripts/enrich-human-accepted-visuals",
    videoKey: key || null,
    stage,
    mediaType: record?.mediaType || null,
    descriptionSourceClass: record?.description?.sourceClass ?? null,
    error: error ? cleanText(error, 500) : null,
  };
}
