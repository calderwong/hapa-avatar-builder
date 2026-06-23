export const SYSTEM_MEDIA_LIBRARY_VERSION = "hapa.system-media-library.v1";
export const SYSTEM_MEDIA_DASHBOARD_VERSION = "hapa.system-media-dashboard.v1";

export const SYSTEM_MEDIA_FILTER_DEFAULTS = {
  query: "",
  ownerType: "all",
  mediaType: "all",
  documentKind: "all",
  sourceRoot: "all",
  reviewPriority: "all",
  orientation: "all",
  dimensionClass: "all",
  attachment: "all"
};

export function createSystemMediaLibrary(input = {}) {
  return normalizeSystemMediaLibrary({
    schemaVersion: SYSTEM_MEDIA_LIBRARY_VERSION,
    records: input.records || [],
    batches: input.batches || [],
    updatedAt: input.updatedAt || new Date().toISOString()
  });
}

export function normalizeSystemMediaLibrary(input = {}) {
  return {
    schemaVersion: input.schemaVersion || SYSTEM_MEDIA_LIBRARY_VERSION,
    records: uniqueById(Array.isArray(input.records) ? input.records.map(normalizeLibraryRecord) : []),
    batches: Array.isArray(input.batches) ? input.batches : [],
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

export function createSystemMediaDashboard({ avatars = [], tarotStore = {}, sceneGraph = {}, mediaLibrary = {} } = {}) {
  const library = normalizeSystemMediaLibrary(mediaLibrary);
  const records = collectSystemMediaRecords({ avatars, tarotStore, sceneGraph, mediaLibrary: library });
  const videos = records.filter((record) => record.mediaType === "video");
  const images = records.filter((record) => record.mediaType === "image");
  const enriched = records.filter((record) => record.enrichment?.status === "enriched" || record.enrichment?.ocr?.lineCount > 0 || record.enrichment?.vision?.labels?.length);
  const needsReview = records.filter((record) => record.reviewPriority === "high" || record.needsReview);
  const comics = records.filter((record) => record.isComic || record.documentKind === "comic");
  const tarotCards = Array.isArray(tarotStore.cards) ? tarotStore.cards : [];
  const sceneList = Array.isArray(sceneGraph.scenes) ? sceneGraph.scenes : [];
  const placeList = Array.isArray(sceneGraph.places) ? sceneGraph.places : [];

  return {
    schemaVersion: SYSTEM_MEDIA_DASHBOARD_VERSION,
    updatedAt: latestTimestamp([library.updatedAt, tarotStore.updatedAt, sceneGraph.updatedAt, ...avatars.map((avatar) => avatar.updatedAt)]),
    summary: {
      avatars: avatars.length,
      tarotCards: tarotCards.length,
      tarotDecks: Array.isArray(tarotStore.decks) ? tarotStore.decks.length : 0,
      tarotSets: Array.isArray(tarotStore.sets) ? tarotStore.sets.length : 0,
      scenes: sceneList.length,
      places: placeList.length,
      media: records.length,
      videos: videos.length,
      images: images.length,
      comics: comics.length,
      cards: records.filter((record) => record.isTarotCard || record.ownerType === "tarot").length,
      dossiers: records.filter((record) => record.isDossier || record.documentKind === "character_dossier").length,
      kits: records.filter((record) => record.isKit || record.documentKind === "kit_sheet").length,
      enriched: enriched.length,
      needsReview: needsReview.length,
      folderVideos: library.records.filter((record) => record.sourceKind === "folder-video").length,
      unassigned: records.filter((record) => !record.relationships.length || record.ownerType === "library").length
    },
    facets: {
      mediaTypes: countBy(records, (record) => record.mediaType),
      ownerTypes: countBy(records, (record) => record.ownerType),
      documentKinds: countBy(records, (record) => record.documentKind || "unknown"),
      sourceRoots: countBy(records.flatMap((record) => record.sourceRoots.length ? record.sourceRoots : ["unknown"]), (root) => root),
      reviewPriority: countBy(records, (record) => record.reviewPriority || "none"),
      orientation: countBy(records, (record) => record.orientation || "unknown"),
      dimensionClass: countBy(records, (record) => record.dimensionClass || "unknown"),
      attachmentTargets: countBy(records.flatMap((record) => record.relationships.length ? record.relationships.map((rel) => rel.ownerType) : ["unassigned"]), (target) => target),
      rootsByVideo: countBy(videos.flatMap((record) => record.sourceRoots.length ? record.sourceRoots : ["unknown"]), (root) => root)
    },
    records
  };
}

export function filterSystemMediaRecords(records = [], filters = {}) {
  const active = { ...SYSTEM_MEDIA_FILTER_DEFAULTS, ...(filters || {}) };
  const query = normalizeSearch(active.query);
  return records.filter((record) => {
    if (active.ownerType !== "all" && record.ownerType !== active.ownerType && !record.relationships.some((rel) => rel.ownerType === active.ownerType)) return false;
    if (active.mediaType !== "all" && record.mediaType !== active.mediaType) return false;
    if (active.documentKind !== "all" && (record.documentKind || "unknown") !== active.documentKind) return false;
    if (active.sourceRoot !== "all" && !record.sourceRoots.includes(active.sourceRoot)) return false;
    if (active.reviewPriority !== "all" && (record.reviewPriority || "none") !== active.reviewPriority) return false;
    if (active.orientation !== "all" && (record.orientation || "unknown") !== active.orientation) return false;
    if (active.dimensionClass !== "all" && (record.dimensionClass || "unknown") !== active.dimensionClass) return false;
    if (active.attachment === "assigned" && (!record.relationships.length || record.ownerType === "library")) return false;
    if (active.attachment === "unassigned" && record.relationships.length && record.ownerType !== "library") return false;
    if (!query) return true;
    return normalizeSearch([
      record.name,
      record.ownerName,
      record.documentKind,
      record.mediaType,
      record.reviewPriority,
      record.notes,
      record.match?.name,
      record.match?.method,
      record.match?.reason,
      ...(record.tags || []),
      ...(record.ocrSnippets || []),
      ...(record.sourceRoots || []),
      ...record.relationships.map((rel) => `${rel.ownerType} ${rel.ownerName} ${rel.role}`)
    ].join(" ")).includes(query);
  });
}

export function collectSystemMediaRecords({ avatars = [], tarotStore = {}, sceneGraph = {}, mediaLibrary = {} } = {}) {
  const merged = new Map();
  const add = (record) => {
    const normalized = normalizeDashboardRecord(record);
    const key = normalized.fingerprintKey || normalized.id;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      return;
    }
    merged.set(key, mergeDashboardRecord(existing, normalized));
  };

  for (const record of normalizeSystemMediaLibrary(mediaLibrary).records) {
    add(libraryRecordToDashboardRecord(record));
  }

  for (const avatar of avatars || []) {
    for (const asset of avatar.assets || []) {
      add(assetToDashboardRecord(asset, {
        ownerType: "avatar",
        ownerId: avatar.id,
        ownerName: avatar.primaryName || avatar.id,
        role: asset.requirementId || "avatar-media"
      }));
    }
  }

  for (const card of tarotStore.cards || []) {
    for (const asset of card.assets || []) {
      add(assetToDashboardRecord(asset, {
        ownerType: "tarot",
        ownerId: card.id,
        ownerName: card.title || card.id,
        role: asset.metadata?.tarotMediaRole || (asset.type === "video" ? "loop_video" : "card_media")
      }));
    }
  }

  for (const scene of sceneGraph.scenes || []) {
    for (const asset of scene.assets || []) {
      add(assetToDashboardRecord(asset, {
        ownerType: "scene",
        ownerId: scene.id,
        ownerName: scene.title || scene.id,
        role: asset.requirementId || asset.metadata?.sceneRequirementId || "scene-media"
      }));
    }
  }

  return [...merged.values()].sort((a, b) => {
    const reviewDelta = reviewWeight(b.reviewPriority) - reviewWeight(a.reviewPriority);
    if (reviewDelta) return reviewDelta;
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
}

function normalizeLibraryRecord(record = {}) {
  const sourceRoots = unique(record.sourceRoots || record.coverage?.sourceRoots || []);
  const relationships = Array.isArray(record.relationships) ? record.relationships : [];
  return {
    id: record.id || record.asset?.id || `media-${Date.now()}`,
    sourceKind: record.sourceKind || "system-media",
    name: record.name || record.asset?.name || "Untitled media",
    mediaType: record.mediaType || record.asset?.type || "unknown",
    uri: record.uri || record.asset?.uri || "",
    thumbnailUri: record.thumbnailUri || thumbnailUriForAsset(record.asset),
    sourcePath: record.sourcePath || record.metadata?.sourcePath || null,
    sourceRoots,
    sourceRelativePaths: record.sourceRelativePaths || record.coverage?.sourceRelativePaths || {},
    contentFingerprint: record.contentFingerprint || record.metadata?.contentFingerprint || null,
    sizeBytes: Number(record.sizeBytes || record.asset?.metadata?.sizeBytes || 0),
    width: numberOrNull(record.width ?? record.asset?.metadata?.width),
    height: numberOrNull(record.height ?? record.asset?.metadata?.height),
    duration: numberOrNull(record.duration ?? record.asset?.metadata?.duration),
    documentKind: record.documentKind || record.asset?.metadata?.intelligence?.classifications?.documentKind || "unknown",
    reviewPriority: record.reviewPriority || record.asset?.metadata?.intelligence?.classifications?.reviewPriority || "none",
    reviewStatus: record.reviewStatus || record.asset?.metadata?.systemMedia?.reviewStatus || "new",
    tags: unique(record.tags || record.asset?.tags || []),
    match: record.match || record.asset?.metadata?.systemMedia?.match || null,
    relationships,
    asset: record.asset || null,
    intelligence: record.intelligence || record.asset?.metadata?.intelligence || null,
    notes: record.notes || "",
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || record.createdAt || null
  };
}

function libraryRecordToDashboardRecord(record) {
  const primaryRelationship = record.relationships[0] || null;
  return {
    id: record.id,
    name: record.name,
    mediaType: record.mediaType,
    uri: record.uri,
    thumbnailUri: record.thumbnailUri,
    ownerType: primaryRelationship?.ownerType || "library",
    ownerId: primaryRelationship?.ownerId || null,
    ownerName: primaryRelationship?.ownerName || "System Media Library",
    role: primaryRelationship?.role || "indexed-media",
    sourceRoots: record.sourceRoots,
    sourcePath: record.sourcePath,
    contentFingerprint: record.contentFingerprint,
    sizeBytes: record.sizeBytes,
    width: record.width,
    height: record.height,
    duration: record.duration,
    documentKind: record.documentKind,
    reviewPriority: record.reviewPriority,
    reviewStatus: record.reviewStatus,
    tags: record.tags,
    match: record.match,
    relationships: record.relationships,
    enrichment: record.intelligence,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function assetToDashboardRecord(asset = {}, owner) {
  const intelligence = asset.metadata?.intelligence || asset.metadata?.tarotEnrichment || null;
  const classifications = intelligence?.classifications || {};
  const sourceRoots = unique([
    ...(asset.metadata?.folderIngest?.sourceRoots || []),
    ...(asset.metadata?.systemMedia?.sourceRoots || []),
    sourceRootFromPath(asset.metadata?.sourcePath || asset.metadata?.folderIngest?.sourcePath || asset.metadata?.storage?.path || asset.storage?.path)
  ]);
  return {
    id: `${owner.ownerType}:${owner.ownerId}:${asset.id}`,
    assetId: asset.id,
    name: asset.name || asset.id,
    mediaType: asset.type || "unknown",
    uri: asset.uri || "",
    thumbnailUri: thumbnailUriForAsset(asset),
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    ownerName: owner.ownerName,
    role: owner.role,
    sourceRoots,
    sourcePath: asset.metadata?.folderIngest?.sourcePath || asset.metadata?.sourcePath || asset.metadata?.storage?.path || asset.storage?.path || null,
    contentFingerprint: asset.metadata?.folderIngest?.contentFingerprint || asset.metadata?.contentFingerprint || null,
    sizeBytes: Number(asset.metadata?.sizeBytes || asset.sizeBytes || 0),
    width: numberOrNull(asset.metadata?.width),
    height: numberOrNull(asset.metadata?.height),
    duration: numberOrNull(asset.metadata?.duration),
    documentKind: classifications.documentKind || asset.metadata?.tarotMediaRole || asset.metadata?.sceneRequirementId || asset.requirementId || "unknown",
    reviewPriority: classifications.reviewPriority || ((asset.tags || []).includes("needs-review") ? "high" : "none"),
    reviewStatus: asset.metadata?.systemMedia?.reviewStatus || "assigned",
    tags: unique(asset.tags || []),
    match: asset.metadata?.systemMedia?.match || asset.metadata?.visualMatch || null,
    relationships: [{
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      ownerName: owner.ownerName,
      role: owner.role
    }],
    enrichment: intelligence,
    notes: asset.notes || "",
    createdAt: asset.createdAt || null,
    updatedAt: asset.updatedAt || asset.processing?.attachedAt || asset.processing?.processedAt || asset.createdAt || null
  };
}

function normalizeDashboardRecord(record = {}) {
  const width = numberOrNull(record.width);
  const height = numberOrNull(record.height);
  const enrichment = record.enrichment || null;
  const classifications = enrichment?.classifications || {};
  const ocrLines = enrichment?.ocr?.lines || [];
  return {
    ...record,
    mediaType: record.mediaType || "unknown",
    sourceRoots: unique(record.sourceRoots || []),
    relationships: uniqueRelationships(record.relationships || []),
    tags: unique(record.tags || []),
    match: normalizeVisualMatch(record.match),
    width,
    height,
    duration: numberOrNull(record.duration),
    documentKind: record.documentKind || classifications.documentKind || "unknown",
    reviewPriority: record.reviewPriority || classifications.reviewPriority || "none",
    reviewStatus: record.reviewStatus || "new",
    orientation: orientationFor(width, height),
    dimensionClass: dimensionClassFor(width, height),
    isComic: Boolean(classifications.isComic || record.documentKind === "comic" || (record.tags || []).includes("comic")),
    isTarotCard: Boolean(classifications.isTarotCard || record.ownerType === "tarot" || (record.tags || []).includes("tarot-card")),
    isDossier: Boolean(classifications.isDossier || record.documentKind === "character_dossier"),
    isKit: Boolean(classifications.isKit || record.documentKind === "kit_sheet"),
    needsReview: record.reviewPriority === "high" || (record.tags || []).includes("needs-review"),
    ocrSnippets: Array.isArray(ocrLines) ? ocrLines.map((line) => line.text || line).filter(Boolean).slice(0, 6) : [],
    fingerprintKey: record.contentFingerprint || record.sourcePath || record.uri || record.assetId || record.id
  };
}

function mergeDashboardRecord(a, b) {
  const relationships = uniqueRelationships([...(a.relationships || []), ...(b.relationships || [])]);
  const sourceRoots = unique([...(a.sourceRoots || []), ...(b.sourceRoots || [])]);
  const tags = unique([...(a.tags || []), ...(b.tags || [])]);
  const match = betterVisualMatch(a.match, b.match);
  const owner = a.ownerType === "library" && b.ownerType !== "library" ? b : a;
  return normalizeDashboardRecord({
    ...a,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    ownerName: owner.ownerName,
    role: owner.role,
    relationships,
    sourceRoots,
    tags,
    match,
    thumbnailUri: a.thumbnailUri || b.thumbnailUri,
    width: a.width || b.width,
    height: a.height || b.height,
    duration: a.duration || b.duration,
    enrichment: a.enrichment || b.enrichment,
    documentKind: a.documentKind !== "unknown" ? a.documentKind : b.documentKind,
    reviewPriority: reviewWeight(a.reviewPriority) >= reviewWeight(b.reviewPriority) ? a.reviewPriority : b.reviewPriority,
    reviewStatus: mergeReviewStatus(a.reviewStatus, b.reviewStatus),
    updatedAt: latestTimestamp([a.updatedAt, b.updatedAt])
  });
}

function normalizeVisualMatch(match = null) {
  if (!match || typeof match !== "object") return null;
  const relationship = match.relationship || match.target?.relationship || match.target || null;
  return {
    schemaVersion: match.schemaVersion || "hapa.visual-match.v1",
    method: match.method || "image-similarity",
    reason: match.reason || match.matchType || match.type || "visual similarity",
    score: Number.isFinite(Number(match.score)) ? Number(match.score) : null,
    confidence: match.confidence || null,
    margin: Number.isFinite(Number(match.margin)) ? Number(match.margin) : null,
    name: match.name || match.targetName || relationship?.ownerName || relationship?.name || null,
    relationship: relationship ? {
      ownerType: relationship.ownerType || relationship.type || "unknown",
      ownerId: relationship.ownerId || relationship.id || null,
      ownerName: relationship.ownerName || relationship.name || relationship.id || "Unknown",
      role: relationship.role || "visual-match"
    } : null
  };
}

function betterVisualMatch(a = null, b = null) {
  const normalizedA = normalizeVisualMatch(a);
  const normalizedB = normalizeVisualMatch(b);
  if (!normalizedA) return normalizedB;
  if (!normalizedB) return normalizedA;
  return Number(normalizedB.score || 0) > Number(normalizedA.score || 0) ? normalizedB : normalizedA;
}

function mergeReviewStatus(a = "new", b = "new") {
  const weight = { reviewed: 4, assigned: 3, typed: 2, new: 1 };
  return (weight[b] || 0) > (weight[a] || 0) ? b : a;
}

function thumbnailUriForAsset(asset = {}) {
  if (!asset) return null;
  if (asset.metadata?.thumbnailUri) return asset.metadata.thumbnailUri;
  if (asset.metadata?.thumbnail?.uri) return asset.metadata.thumbnail.uri;
  const frames = asset.metadata?.frames || asset.state?.keyframes || [];
  const firstFrame = frames.find((frame) => frame.marker === "first") || frames[0];
  return firstFrame?.thumbnail?.uri || firstFrame?.thumbnailUri || firstFrame?.uri || null;
}

function sourceRootFromPath(filePath = "") {
  if (!filePath) return null;
  if (filePath.includes("/Dear Papa - Album/card-deck/")) return "card-deck";
  if (filePath.includes("/Dear Papa - Album/")) return "Dear Papa - Album";
  if (filePath.includes("/comics/")) return "comics";
  return null;
}

function orientationFor(width, height) {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait";
  return "square";
}

function dimensionClassFor(width, height) {
  if (!width || !height) return "unknown";
  const longEdge = Math.max(width, height);
  if (longEdge >= 3840) return "uhd";
  if (longEdge >= 1920) return "hd";
  if (longEdge >= 1000) return "production";
  return "small";
}

function reviewWeight(priority = "none") {
  return { high: 3, medium: 2, low: 1, none: 0 }[priority] || 0;
}

function countBy(items = [], getter = (item) => item) {
  return items.reduce((counts, item) => {
    const key = getter(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function uniqueById(items = []) {
  const byId = new Map();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}

function uniqueRelationships(relationships = []) {
  const byKey = new Map();
  for (const rel of relationships) {
    if (!rel?.ownerType && !rel?.ownerId) continue;
    byKey.set(`${rel.ownerType}:${rel.ownerId}:${rel.role || ""}`, {
      ownerType: rel.ownerType || "unknown",
      ownerId: rel.ownerId || null,
      ownerName: rel.ownerName || rel.ownerId || "Unknown",
      role: rel.role || "media"
    });
  }
  return [...byKey.values()];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSearch(value = "") {
  return String(value || "").trim().toLowerCase();
}

function latestTimestamp(values = []) {
  return values
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] || new Date().toISOString();
}
