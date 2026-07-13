import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const ECHO_DIRECTION_VARIANT_INDEX_SCHEMA = "hapa.echo.direction-script-variant-index.v1";
const ECHO_DIRECTION_VARIANT_SCHEMA = "hapa.echo.direction-script-variant.v1";

function text(value) {
  return String(value || "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function withinDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function safeSegment(value) {
  const candidate = text(value);
  return candidate && path.basename(candidate) === candidate && candidate !== "." && candidate !== ".."
    ? candidate
    : "";
}

function timelineCount(row) {
  const declared = finite(row.timelineCount ?? row.timeline_count, null);
  if (declared !== null) return Math.max(0, Math.round(declared));
  const media = finite(row.mediaBearingShots, null);
  const visualizer = finite(row.visualizerOnlyShots, null);
  return media !== null && visualizer !== null ? Math.max(0, Math.round(media + visualizer)) : null;
}

/**
 * Converts an index row into the small variant-shaped record consumed by the
 * existing summarizer. It intentionally contains no timeline or script body.
 */
export function normalizeEchoDirectionVariantIndexRow(row = {}, variantsRoot = "") {
  const songId = safeSegment(row.songId || row.song_id);
  const variantId = safeSegment(row.variantId || row.variant_id);
  const relativePath = text(row.relativePath || row.relative_path);
  const absolutePath = relativePath ? path.resolve(variantsRoot, relativePath) : "";
  if (!songId || !variantId || !relativePath || !withinDirectory(path.resolve(variantsRoot), absolutePath)) return null;
  if (path.dirname(relativePath) !== songId || path.extname(relativePath).toLowerCase() !== ".json") return null;

  const replacementShots = finite(row.replacementShots ?? row.mediaBearingShots, null);
  const uniqueMedia = finite(row.uniqueMedia, null);
  const videoEventsPerMinute = finite(row.videoEventsPerMinute, null);
  const videoCoverageSeconds = finite(row.videoCoverageSeconds, null);
  return {
    id: variantId,
    title: text(row.title) || variantId,
    schemaVersion: text(row.schemaVersion || row.schema_version) || ECHO_DIRECTION_VARIANT_SCHEMA,
    createdAt: row.createdAt || row.created_at || row.updatedAt || row.updated_at || null,
    timelineCount: timelineCount(row),
    hasHyperframeScript: row.hasHyperframeScript ?? row.has_hyperframe_script ?? true,
    variationSet: object(row.variationSet || row.variation_set),
    cut: object(row.cut || row.cut_metadata),
    densityProfile: object(row.densityProfile || row.density_profile),
    coveragePass: row.coveragePass ?? row.coverage_pass ?? null,
    sourcePolicy: object(row.sourcePolicy || row.source_policy),
    media_density_telemetry: {
      mediaBearingShots: finite(row.mediaBearingShots, null),
      visualizerOnlyShots: finite(row.visualizerOnlyShots, null),
      actualVideoRatio: finite(row.actualVideoRatio, null),
    },
    telemetry: {
      ...object(row.telemetry),
      replacementShots,
      uniqueMedia,
      videoEventsPerMinute,
      videoCoverageSeconds,
    },
    ...(text(row.fingerprint) ? { fingerprint: text(row.fingerprint) } : {}),
    variant_source: {
      kind: "append-only-project-variant-summary-index",
      path: relativePath,
      nonDestructive: true,
      indexed: true,
    },
  };
}

function sameNames(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Reads compact album summaries from index.json. File inventory checks are
 * cached briefly; if a song gains, loses, or changes a variant after the index
 * was written, only that song falls back to the authoritative JSON reader.
 */
export function createEchoDirectionVariantSummaryIndex({
  variantsRoot,
  validationTtlMs = 1_000,
  logger = console,
} = {}) {
  const root = path.resolve(variantsRoot || ".");
  const indexPath = path.join(root, "index.json");
  let indexCache = null;
  const verificationCache = new Map();
  const fallbackCache = new Map();
  const invalidatedSongs = new Set();

  async function loadIndex() {
    let info;
    try {
      info = await stat(indexPath);
    } catch (error) {
      if (error?.code !== "ENOENT") logger.warn?.("Failed to stat Echo direction variant index:", error);
      indexCache = { signature: "missing", mtimeMs: 0, rowsBySong: new Map(), valid: false, reason: "missing" };
      return indexCache;
    }
    const signature = `${info.size}:${info.mtimeMs}`;
    if (indexCache?.signature === signature) return indexCache;

    try {
      const payload = JSON.parse(await readFile(indexPath, "utf8"));
      if (payload?.schemaVersion !== ECHO_DIRECTION_VARIANT_INDEX_SCHEMA || !Array.isArray(payload.variants)) {
        throw new Error(`unsupported index schema: ${payload?.schemaVersion || "missing"}`);
      }
      const rowsBySong = new Map();
      for (const rawRow of payload.variants) {
        const row = normalizeEchoDirectionVariantIndexRow(rawRow, root);
        if (!row) throw new Error("index contains an unsafe or incomplete row");
        const songId = path.dirname(row.variant_source.path).split(path.sep)[0];
        if (!rowsBySong.has(songId)) rowsBySong.set(songId, []);
        rowsBySong.get(songId).push(row);
      }
      for (const rows of rowsBySong.values()) rows.sort((left, right) => left.id.localeCompare(right.id));
      indexCache = { signature, mtimeMs: info.mtimeMs, rowsBySong, valid: true, reason: "indexed" };
    } catch (error) {
      logger.warn?.("Echo direction variant index is unavailable; using authoritative variant files:", error);
      indexCache = { signature, mtimeMs: info.mtimeMs, rowsBySong: new Map(), valid: false, reason: "invalid" };
    }
    verificationCache.clear();
    fallbackCache.clear();
    invalidatedSongs.clear();
    return indexCache;
  }

  async function verifySong(songId, index) {
    if (!index.valid || invalidatedSongs.has(songId)) return { fresh: false, signature: `${index.signature}:invalidated` };
    const cached = verificationCache.get(songId);
    if (cached?.indexSignature === index.signature && Date.now() - cached.checkedAt < validationTtlMs) return cached;

    const songDirectory = path.resolve(root, songId);
    if (!withinDirectory(root, songDirectory)) return { fresh: false, signature: `${index.signature}:unsafe` };
    const expected = (index.rowsBySong.get(songId) || [])
      .map((row) => path.basename(row.variant_source.path))
      .sort((left, right) => left.localeCompare(right));
    let entries = [];
    try {
      entries = (await readdir(songDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (error?.code !== "ENOENT") logger.warn?.(`Failed to verify Echo direction variants for ${songId}:`, error);
    }
    const actual = entries.map((entry) => entry.name);
    let newestVariantMtime = 0;
    if (sameNames(expected, actual)) {
      const infos = await Promise.all(actual.map((name) => stat(path.join(songDirectory, name)).catch(() => null)));
      newestVariantMtime = Math.max(0, ...infos.map((info) => Number(info?.mtimeMs || Infinity)));
    }
    const fresh = sameNames(expected, actual) && newestVariantMtime <= index.mtimeMs;
    const result = {
      checkedAt: Date.now(),
      indexSignature: index.signature,
      signature: `${actual.join("|")}:${newestVariantMtime}`,
      fresh,
    };
    verificationCache.set(songId, result);
    return result;
  }

  async function variantsForSongs(songIds = [], readAuthoritativeVariants) {
    if (typeof readAuthoritativeVariants !== "function") throw new TypeError("readAuthoritativeVariants must be a function");
    const index = await loadIndex();
    const bySong = new Map();
    const sourceBySong = new Map();
    const uniqueSongIds = [...new Set(songIds.map(safeSegment).filter(Boolean))];
    await Promise.all(uniqueSongIds.map(async (songId) => {
      const verification = await verifySong(songId, index);
      if (verification.fresh) {
        bySong.set(songId, index.rowsBySong.get(songId) || []);
        sourceBySong.set(songId, "index");
        return;
      }
      const cacheKey = `${index.signature}:${verification.signature}`;
      const cached = fallbackCache.get(songId);
      const variants = cached?.key === cacheKey
        ? cached.variants
        : await readAuthoritativeVariants(songId);
      if (cached?.key !== cacheKey) fallbackCache.set(songId, { key: cacheKey, variants });
      bySong.set(songId, variants);
      sourceBySong.set(songId, "authoritative-fallback");
    }));
    return {
      bySong,
      sourceBySong,
      indexSignature: index.signature,
      indexValid: index.valid,
    };
  }

  function invalidate(songId = "") {
    const safeSongId = safeSegment(songId);
    if (safeSongId) {
      invalidatedSongs.add(safeSongId);
      verificationCache.delete(safeSongId);
      fallbackCache.delete(safeSongId);
      return;
    }
    indexCache = null;
    verificationCache.clear();
    fallbackCache.clear();
    invalidatedSongs.clear();
  }

  return { variantsForSongs, invalidate };
}
