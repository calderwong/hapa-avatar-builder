import {
  createSystemMediaLibrary,
  normalizeSystemMediaLibrary
} from "./systemMedia.js";

const SYNC_VERSION = "hapa.media-attachment-sync.v1";

export function withMediaAttachmentRelationship(asset = {}, relationship = {}, options = {}) {
  if (!asset || typeof asset !== "object") return asset;
  const normalizedRelationship = normalizeAttachmentRelationship(relationship);
  const now = options.now || new Date().toISOString();
  const currentSystemMedia = asset.metadata?.systemMedia || {};
  const relationships = uniqueRelationships([
    ...(currentSystemMedia.relationships || []),
    normalizedRelationship
  ]);
  return {
    ...asset,
    tags: uniqueStrings([
      ...(asset.tags || []),
      ...(options.tags || []),
      normalizedRelationship.ownerType ? `${normalizedRelationship.ownerType}-attached` : "",
      "media-relationship-synced"
    ]),
    metadata: {
      ...(asset.metadata || {}),
      systemMedia: {
        ...currentSystemMedia,
        schemaVersion: SYNC_VERSION,
        reviewStatus: "assigned",
        relationships,
        latestRelationship: normalizedRelationship,
        syncedAt: now,
        syncSource: options.source || "server-attach-route"
      }
    },
    updatedAt: asset.updatedAt || now
  };
}

export function upsertMediaAttachmentRecord(library = {}, asset = {}, relationship = {}, options = {}) {
  const normalizedLibrary = normalizeSystemMediaLibrary(library || createSystemMediaLibrary());
  const now = options.now || new Date().toISOString();
  const normalizedRelationship = normalizeAttachmentRelationship(relationship);
  const recordId = findExistingRecordId(normalizedLibrary.records, asset) || mediaRecordId(asset);
  const existing = normalizedLibrary.records.find((record) => record.id === recordId) || null;
  const annotatedAsset = withMediaAttachmentRelationship(asset, normalizedRelationship, {
    ...options,
    now,
    tags: uniqueStrings([
      ...(options.tags || []),
      ...(asset.tags || [])
    ])
  });
  const relationships = uniqueRelationships([
    ...(existing?.relationships || []),
    ...(annotatedAsset.metadata?.systemMedia?.relationships || []),
    normalizedRelationship
  ]);
  const nextRecord = {
    ...(existing || {}),
    id: recordId,
    sourceKind: existing?.sourceKind || options.sourceKind || "attached-media",
    name: asset.name || asset.title || existing?.name || asset.id || "Attached media",
    mediaType: mediaTypeForAsset(asset),
    uri: asset.uri || existing?.uri || "",
    thumbnailUri: thumbnailUriForAsset(asset) || existing?.thumbnailUri || "",
    sourcePath: sourcePathForAsset(asset) || existing?.sourcePath || null,
    sourceRoots: uniqueStrings([
      ...(existing?.sourceRoots || []),
      sourceRootFromPath(sourcePathForAsset(asset))
    ]),
    sourceRelativePaths: existing?.sourceRelativePaths || {},
    contentFingerprint: contentFingerprintForAsset(asset) || existing?.contentFingerprint || null,
    sizeBytes: Number(asset.sizeBytes || asset.metadata?.sizeBytes || existing?.sizeBytes || 0),
    width: numberOrNull(asset.width ?? asset.metadata?.width ?? existing?.width),
    height: numberOrNull(asset.height ?? asset.metadata?.height ?? existing?.height),
    duration: numberOrNull(asset.duration ?? asset.metadata?.duration ?? existing?.duration),
    documentKind: documentKindForAsset(asset, normalizedRelationship, existing),
    reviewPriority: reviewPriorityForAsset(asset, existing),
    reviewStatus: "assigned",
    tags: uniqueStrings([
      ...(existing?.tags || []),
      ...(annotatedAsset.tags || []),
      ...(options.tags || [])
    ]),
    match: existing?.match || asset.metadata?.systemMedia?.match || asset.metadata?.visualMatch || null,
    relationships,
    asset: annotatedAsset,
    intelligence: asset.metadata?.intelligence || asset.metadata?.tarotEnrichment || existing?.intelligence || null,
    notes: asset.notes || existing?.notes || "",
    createdAt: existing?.createdAt || asset.createdAt || now,
    updatedAt: now
  };

  return normalizeSystemMediaLibrary({
    ...normalizedLibrary,
    records: [nextRecord, ...normalizedLibrary.records.filter((record) => record.id !== recordId)],
    batches: [
      {
        id: `${recordId}-attachment-sync-${Date.parse(now) || Date.now()}`,
        kind: "media-attachment-sync",
        assetId: asset.id || "",
        ownerType: normalizedRelationship.ownerType,
        ownerId: normalizedRelationship.ownerId,
        ownerName: normalizedRelationship.ownerName,
        role: normalizedRelationship.role,
        syncedAt: now,
        source: options.source || "server-attach-route"
      },
      ...(normalizedLibrary.batches || [])
    ].slice(0, 200),
    updatedAt: now
  });
}

export function normalizeAttachmentRelationship(relationship = {}) {
  return {
    ownerType: relationship.ownerType || relationship.type || "library",
    ownerId: relationship.ownerId || relationship.id || "",
    ownerName: relationship.ownerName || relationship.name || relationship.ownerId || "Media Library",
    role: relationship.role || "attached-media"
  };
}

function findExistingRecordId(records = [], asset = {}) {
  const keys = uniqueStrings([
    contentFingerprintForAsset(asset),
    sourcePathForAsset(asset),
    asset.uri,
    asset.id
  ]);
  if (!keys.length) return null;
  const match = records.find((record) => keys.some((key) =>
    key === record.contentFingerprint ||
    key === record.sourcePath ||
    key === record.uri ||
    key === record.asset?.id ||
    key === record.id
  ));
  return match?.id || null;
}

function mediaRecordId(asset = {}) {
  return `attached-${slugify(contentFingerprintForAsset(asset) || sourcePathForAsset(asset) || asset.uri || asset.id || asset.name || Date.now())}`;
}

function mediaTypeForAsset(asset = {}) {
  if (asset.type) return asset.type;
  const mimeType = asset.mimeType || asset.metadata?.mimeType || "";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  const value = `${asset.name || ""} ${asset.uri || ""}`.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(value)) return "video";
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(value)) return "image";
  if (/\.(mp3|wav|m4a|aac|flac)$/.test(value)) return "audio";
  return "unknown";
}

function documentKindForAsset(asset = {}, relationship = {}, existing = null) {
  return asset.metadata?.intelligence?.classifications?.documentKind ||
    asset.metadata?.tarotMediaRole ||
    asset.metadata?.sceneRequirementId ||
    asset.requirementId ||
    existing?.documentKind ||
    `${relationship.ownerType || "media"}_media`;
}

function reviewPriorityForAsset(asset = {}, existing = null) {
  if ((asset.tags || []).includes("needs-review")) return "high";
  return asset.metadata?.intelligence?.classifications?.reviewPriority || existing?.reviewPriority || "none";
}

function thumbnailUriForAsset(asset = {}) {
  if (asset.thumbnailUri) return asset.thumbnailUri;
  if (asset.metadata?.thumbnailUri) return asset.metadata.thumbnailUri;
  if (asset.thumbnail?.uri) return asset.thumbnail.uri;
  if (asset.metadata?.thumbnail?.uri) return asset.metadata.thumbnail.uri;
  const frames = asset.metadata?.frames || asset.state?.keyframes || asset.frames || [];
  const firstFrame = frames.find((frame) => frame.marker === "first") || frames[0];
  return firstFrame?.thumbnail?.uri || firstFrame?.thumbnailUri || firstFrame?.uri || "";
}

function sourcePathForAsset(asset = {}) {
  return asset.metadata?.folderIngest?.sourcePath ||
    asset.metadata?.sourcePath ||
    asset.metadata?.storage?.path ||
    asset.storage?.path ||
    asset.lineage?.storage?.path ||
    "";
}

function contentFingerprintForAsset(asset = {}) {
  return asset.metadata?.folderIngest?.contentFingerprint ||
    asset.metadata?.contentFingerprint ||
    asset.metadata?.fingerprint?.hash ||
    asset.fingerprint ||
    "";
}

function sourceRootFromPath(filePath = "") {
  if (!filePath) return "";
  if (filePath.includes("/Dear Papa - Album/card-deck/")) return "card-deck";
  if (filePath.includes("/Dear Papa - Album/")) return "Dear Papa - Album";
  if (filePath.includes("/comics/")) return "comics";
  if (filePath.includes("/data/media/")) return "avatar-builder-media";
  return "";
}

function uniqueRelationships(relationships = []) {
  const byKey = new Map();
  for (const relationship of relationships || []) {
    const normalized = normalizeAttachmentRelationship(relationship);
    if (!normalized.ownerType && !normalized.ownerId) continue;
    byKey.set(`${normalized.ownerType}:${normalized.ownerId}:${normalized.role}`, normalized);
  }
  return [...byKey.values()];
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flat()
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "media";
}
