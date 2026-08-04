import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const HUMAN_VIDEO_FRAME_CATALOG_RECEIPT_SCHEMA = "hapa.human-video-frame-catalog-receipt.v1";

const AMBIGUOUS = Symbol("ambiguous-frame-catalog-key");
const REQUIRED_MARKERS = Object.freeze(["first", "mid", "last"]);

export function openHumanVideoFrameCatalog({ databasePath, frameRoot } = {}) {
  const resolvedDatabasePath = path.resolve(String(databasePath || ""));
  const resolvedFrameRoot = path.resolve(String(frameRoot || path.join(path.dirname(resolvedDatabasePath), "frames")));
  let cachedSignature = "";
  let cachedSnapshot = emptySnapshot(resolvedDatabasePath, resolvedFrameRoot, "not-loaded");

  function read() {
    let signature;
    try {
      const databaseStat = statSync(resolvedDatabasePath);
      const rootStat = statSync(resolvedFrameRoot);
      signature = `${databaseStat.dev}:${databaseStat.ino}:${databaseStat.size}:${databaseStat.mtimeMs}:${rootStat.dev}:${rootStat.ino}:${rootStat.mtimeMs}`;
    } catch (error) {
      cachedSignature = "";
      cachedSnapshot = emptySnapshot(resolvedDatabasePath, resolvedFrameRoot, error?.code || "catalog-unavailable");
      return cachedSnapshot;
    }
    if (cachedSignature === signature) return cachedSnapshot;
    cachedSnapshot = loadSnapshot(resolvedDatabasePath, resolvedFrameRoot, signature);
    cachedSignature = signature;
    return cachedSnapshot;
  }

  function attachMediaDashboard(mediaDashboard = {}) {
    const snapshot = read();
    let attachedRecords = 0;
    let alreadyRegistered = 0;
    let unmatchedRecords = 0;
    let contradictoryRecords = 0;
    const records = (Array.isArray(mediaDashboard.records) ? mediaDashboard.records : []).map((record) => {
      if (record?.mediaType !== "video") return record;
      const existingFrames = sourceFrames(record);
      if (hasRequiredFrames(existingFrames)) {
        alreadyRegistered += 1;
        return record;
      }
      const resolution = resolveCatalogEntry(snapshot, record);
      if (!resolution.entry) {
        if (resolution.contradictory) contradictoryRecords += 1;
        else unmatchedRecords += 1;
        return record;
      }
      attachedRecords += 1;
      const asset = record.asset && typeof record.asset === "object" ? record.asset : {};
      const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
      const frames = REQUIRED_MARKERS.map((marker) => {
        const frame = resolution.entry.frames.get(marker);
        return {
          id: frame.frameId,
          marker,
          time: frame.atSeconds,
          timestampSeconds: frame.atSeconds,
          uri: localFileUri(frame.path),
          source: "echo-video-enrichment-frame-catalog",
          sourceMediaId: resolution.entry.mediaId,
          sourceMediaSha256: `sha256:${resolution.entry.sha256}`,
        };
      });
      return {
        ...record,
        asset: {
          ...asset,
          id: asset.id || record.assetId || record.id,
          metadata: {
            ...metadata,
            frames,
            humanVideoFrameCatalogReceipt: {
              schemaVersion: HUMAN_VIDEO_FRAME_CATALOG_RECEIPT_SCHEMA,
              catalog: "echo-video-enrichment-v1",
              mediaId: resolution.entry.mediaId,
              mediaSha256: `sha256:${resolution.entry.sha256}`,
              matchAuthority: resolution.matchAuthority,
              frameCount: frames.length,
              replacedIncompleteFrameCount: existingFrames.length,
            },
          },
        },
      };
    });
    return {
      dashboard: { ...mediaDashboard, records },
      receipt: {
        schemaVersion: HUMAN_VIDEO_FRAME_CATALOG_RECEIPT_SCHEMA,
        catalog: "echo-video-enrichment-v1",
        available: snapshot.available,
        catalogVideos: snapshot.entries.length,
        completeFrameSets: snapshot.completeFrameSets,
        attachedRecords,
        alreadyRegistered,
        unmatchedRecords,
        contradictoryRecords,
        error: snapshot.error,
        truthBoundary: "Frame backfills come only from an exact, content-bound Echo catalog hash/path/URI match with three readable First/Mid/Last files. Ambiguous or contradictory identities remain unmodified.",
      },
    };
  }

  return { databasePath: resolvedDatabasePath, frameRoot: resolvedFrameRoot, read, attachMediaDashboard };
}

export function resolveTrustedHumanVideoCatalogFrameUri(uri = "", frameRoot = "") {
  const value = String(uri || "").trim();
  if (!value.startsWith("/api/local-file?")) return "";
  try {
    const requested = new URL(value, "http://local.invalid").searchParams.get("path");
    if (!requested || !path.isAbsolute(requested)) return "";
    const realRoot = realpathSync(path.resolve(frameRoot));
    const realRequested = realpathSync(requested);
    const relative = path.relative(realRoot, realRequested);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
    if (!/\.(?:jpe?g|png|webp)$/i.test(realRequested)) return "";
    return realRequested;
  } catch {
    return "";
  }
}

function loadSnapshot(databasePath, frameRoot, signature) {
  const realFrameRoot = realpathSync(frameRoot);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  let rows;
  try {
    rows = database.prepare(`
      SELECT
        v.media_id AS mediaId,
        v.sha256 AS sha256,
        v.canonical_path AS canonicalPath,
        v.aliases_json AS aliasesJson,
        v.uris_json AS urisJson,
        f.frame_id AS frameId,
        f.marker AS marker,
        f.at_seconds AS atSeconds,
        f.path AS framePath
      FROM videos v
      JOIN frames f ON f.media_id = v.media_id
      WHERE f.marker IN ('first', 'mid', 'last')
      ORDER BY v.media_id, f.marker
    `).all();
  } finally {
    database.close();
  }
  const grouped = new Map();
  for (const row of rows) {
    const mediaId = clean(row.mediaId);
    const sha256 = normalizeSha256(row.sha256);
    const marker = normalizeMarker(row.marker);
    if (!mediaId || !sha256 || !marker) continue;
    let realFramePath;
    try {
      realFramePath = realpathSync(String(row.framePath || ""));
    } catch {
      continue;
    }
    if (!isWithin(realFrameRoot, realFramePath) || !existsSync(realFramePath) || !/\.(?:jpe?g|png|webp)$/i.test(realFramePath)) continue;
    const entry = grouped.get(mediaId) || {
      mediaId,
      sha256,
      canonicalPath: normalizePath(row.canonicalPath),
      aliases: parseStringArray(row.aliasesJson),
      uris: parseStringArray(row.urisJson),
      frames: new Map(),
    };
    if (entry.sha256 !== sha256) continue;
    entry.frames.set(marker, {
      frameId: clean(row.frameId) || `${mediaId}#frame:${marker}`,
      marker,
      atSeconds: Math.max(0, Number(row.atSeconds) || 0),
      path: realFramePath,
    });
    grouped.set(mediaId, entry);
  }
  const entries = [...grouped.values()].filter((entry) => REQUIRED_MARKERS.every((marker) => entry.frames.has(marker)));
  const byHash = new Map();
  const byPath = new Map();
  const byUri = new Map();
  for (const entry of entries) {
    addUnique(byHash, entry.sha256, entry);
    addUnique(byPath, entry.canonicalPath, entry);
    for (const alias of entry.aliases) {
      addUnique(byPath, normalizePath(alias), entry);
      addUnique(byUri, clean(alias), entry);
    }
    for (const uri of entry.uris) {
      addUnique(byUri, clean(uri), entry);
      addUnique(byPath, normalizePath(uri), entry);
    }
  }
  return {
    available: true,
    error: null,
    databasePath,
    frameRoot,
    signature,
    entries,
    completeFrameSets: entries.length,
    byHash,
    byPath,
    byUri,
  };
}

function emptySnapshot(databasePath, frameRoot, error) {
  return {
    available: false,
    error,
    databasePath,
    frameRoot,
    signature: "",
    entries: [],
    completeFrameSets: 0,
    byHash: new Map(),
    byPath: new Map(),
    byUri: new Map(),
  };
}

function resolveCatalogEntry(snapshot, record) {
  if (!snapshot.available) return { entry: null, matchAuthority: "", contradictory: false };
  const matches = [];
  let ambiguous = false;
  const collect = (index, key, authority) => {
    if (!key || !index.has(key)) return;
    const value = index.get(key);
    if (value === AMBIGUOUS) {
      ambiguous = true;
      return;
    }
    matches.push({ entry: value, authority });
  };
  for (const hash of candidateHashes(record)) collect(snapshot.byHash, hash, "exact-content-sha256");
  for (const candidatePath of candidatePaths(record)) collect(snapshot.byPath, candidatePath, "exact-catalog-path-alias");
  for (const uri of candidateUris(record)) collect(snapshot.byUri, uri, "exact-catalog-uri-alias");
  const mediaIds = new Set(matches.map((match) => match.entry.mediaId));
  if (ambiguous || mediaIds.size > 1) return { entry: null, matchAuthority: "", contradictory: true };
  if (!matches.length) return { entry: null, matchAuthority: "", contradictory: false };
  const authorityOrder = ["exact-content-sha256", "exact-catalog-path-alias", "exact-catalog-uri-alias"];
  matches.sort((left, right) => authorityOrder.indexOf(left.authority) - authorityOrder.indexOf(right.authority));
  return { entry: matches[0].entry, matchAuthority: matches[0].authority, contradictory: false };
}

function candidateHashes(record) {
  const asset = record?.asset || {};
  const metadata = asset.metadata || {};
  return unique([
    record?.contentFingerprint,
    asset.contentFingerprint,
    metadata.contentFingerprint,
    metadata.sha256,
    asset.storage?.sha256,
    metadata.storage?.sha256,
  ].map(normalizeSha256).filter(Boolean));
}

function candidatePaths(record) {
  const asset = record?.asset || {};
  const metadata = asset.metadata || {};
  return unique([
    record?.sourcePath,
    asset.storage?.path,
    metadata.sourcePath,
    metadata.storage?.path,
    ...candidateUris(record),
  ].map(normalizePath).filter(Boolean));
}

function candidateUris(record) {
  const asset = record?.asset || {};
  return unique([record?.uri, asset.uri].map(clean).filter(Boolean));
}

function sourceFrames(record) {
  const raw = record?.asset?.metadata?.frames || record?.asset?.state?.keyframes || [];
  return Array.isArray(raw) ? raw : Object.values(raw || {}).filter((frame) => frame && typeof frame === "object");
}

function hasRequiredFrames(frames) {
  const markers = new Set((frames || []).map((frame) => normalizeMarker(frame?.marker || frame?.role || frame?.label)).filter(Boolean));
  return REQUIRED_MARKERS.every((marker) => markers.has(marker));
}

function addUnique(index, key, entry) {
  if (!key) return;
  const current = index.get(key);
  if (!current) index.set(key, entry);
  else if (current !== AMBIGUOUS && current.mediaId !== entry.mediaId) index.set(key, AMBIGUOUS);
}

function parseStringArray(value) {
  const parsed = JSON.parse(String(value || "[]"));
  if (!Array.isArray(parsed)) throw new Error("Frame catalog alias columns must contain JSON arrays.");
  return unique(parsed.map(clean).filter(Boolean));
}

function normalizeMarker(value) {
  const marker = clean(value).toLowerCase();
  if (["first", "start", "opening"].includes(marker)) return "first";
  if (["mid", "middle", "center"].includes(marker)) return "mid";
  if (["last", "end", "closing"].includes(marker)) return "last";
  return "";
}

function normalizeSha256(value) {
  const hash = clean(value).toLowerCase().replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function normalizePath(value) {
  const text = clean(value);
  if (!text) return "";
  if (text.startsWith("/api/local-file?")) {
    try {
      return normalizePath(new URL(text, "http://local.invalid").searchParams.get("path"));
    } catch {
      return "";
    }
  }
  const withoutScheme = text.replace(/^file:\/\//, "");
  return path.isAbsolute(withoutScheme) ? path.normalize(withoutScheme) : "";
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function localFileUri(filePath) {
  return `/api/local-file?path=${encodeURIComponent(filePath)}`;
}

function unique(values) {
  return [...new Set(values)];
}

function clean(value) {
  return String(value || "").trim();
}
