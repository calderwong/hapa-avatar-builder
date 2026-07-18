const DEFAULT_MIN_SHORT_EDGE = 720;
const DEFAULT_MIN_DURATION_SECONDS = 2.5;
const INVALID_TECHNICAL_MARKERS = [
  "technical-missing-source",
  "technical-source-missing",
  "invalid-media",
  "unreadable",
  "corrupt",
  "broken-media",
];
const HAPA_DEV_PROTO_MEDIA_ROOTS = [
  "/users/calderwong/comics/reviclips/",
  "/users/calderwong/comics/hapa-trains/",
];

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedToken(value = "") {
  return String(value).trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function sourceValues(value = {}) {
  return [
    value?.source,
    value?.sourceSystem,
    value?.cardSourceSystem,
    value?.adapterId,
    value?.sourceAdapter,
    value?.sourceRepo,
    value?.sourceRepository,
    value?.sourceNode,
    value?.sourceKind,
    value?.originId,
    value?.originNode,
    value?.sourcePath,
    value?.targetPath,
    value?.originalPath,
  ].filter(Boolean);
}

function normalizedSourceValue(value = "") {
  return String(value).trim().toLowerCase().replaceAll("\\", "/");
}

function isDevProtoSourceValue(value = "") {
  const normalized = normalizedSourceValue(value);
  return normalizedToken(normalized).includes("hapa-dev-proto")
    || HAPA_DEV_PROTO_MEDIA_ROOTS.some((root) => normalized.startsWith(root));
}

function isHellWeekSourceValue(value = "") {
  return normalizedToken(normalizedSourceValue(value)).includes("hell-week");
}

function hasExplicitOriginMatch(predicate, records = []) {
  const queue = records.filter(Boolean);
  const visited = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (sourceValues(value).some((entry) => predicate(entry))) return true;
    for (const key of ["origin", "provenance", "sourceProvenance", "cardOrigin", "hapaOrigin", "records", "folderIngest", "storage"]) {
      const nested = value[key];
      if (Array.isArray(nested)) queue.push(...nested);
      else if (nested && typeof nested === "object") queue.push(nested);
    }
  }
  return false;
}

/**
 * Excludes a Card only when its explicit origin/provenance names hapa-dev-proto.
 * Titles, OCR, descriptive tags, and lore are intentionally not searched.
 */
export function hasHapaDevProtoOrigin(...records) {
  return hasExplicitOriginMatch(isDevProtoSourceValue, records);
}

/** Excludes Hell Week only when explicit origin/provenance names it. */
export function hasHellWeekOrigin(...records) {
  return hasExplicitOriginMatch(isHellWeekSourceValue, records);
}

/** Shared exclusion contract for new Echo Director media passes. */
export function hasExcludedEchoDirectorOrigin(...records) {
  return hasHapaDevProtoOrigin(...records) || hasHellWeekOrigin(...records);
}

function isVideoAsset(asset = {}) {
  const type = String(asset.type || asset.mediaType || asset.mimeType || asset.metadata?.mimeType || "").toLowerCase();
  return type.includes("video") || /\.mp4(?:$|\?)/i.test(String(asset.uri || asset.url || asset.src || ""));
}

function assetDimensions(asset = {}) {
  const technical = asset.metadata?.echosTechnicalAffordance || {};
  return {
    width: finite(asset.width ?? asset.metadata?.width ?? asset.metadata?.dimensions?.width ?? technical.width),
    height: finite(asset.height ?? asset.metadata?.height ?? asset.metadata?.dimensions?.height ?? technical.height),
  };
}

function assetDuration(asset = {}) {
  const technical = asset.metadata?.echosTechnicalAffordance || {};
  return finite(asset.duration ?? asset.durationSeconds ?? asset.metadata?.duration ?? asset.metadata?.durationSeconds ?? technical.durationSec);
}

function assetHash(asset = {}, fallbackTechnical = {}) {
  const raw = asset.sha256
    || asset.contentHash
    || asset.metadata?.sha256
    || asset.metadata?.contentHash?.value
    || asset.metadata?.contentHash
    || asset.metadata?.contentFingerprint
    || asset.metadata?.folderIngest?.contentFingerprint
    || asset.metadata?.scrollSite?.sha256
    || asset.metadata?.echosTechnicalAffordance?.contentHash?.value
    || fallbackTechnical?.contentHash?.value
    || "";
  const digest = String(raw).replace(/^sha256:/i, "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? digest : "";
}

function assetPoster(asset = {}) {
  return asset.thumbnailUri
    || asset.posterUri
    || asset.metadata?.thumbnailUri
    || asset.metadata?.thumbnail?.uri
    || list(asset.metadata?.frames).find((frame) => frame?.marker === "first")?.thumbnailUri
    || list(asset.metadata?.frames).find((frame) => frame?.marker === "first")?.uri
    || "";
}

function mediaFileName(uri = "") {
  const clean = String(uri).replace(/^\/media\//, "").split(/[?#]/)[0];
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

function candidateIdentity(candidate = {}) {
  return candidate.sha256 ? `sha256:${candidate.sha256}` : `uri:${String(candidate.uri || "").toLowerCase()}`;
}

function motionRole(asset = {}, owner = {}) {
  const tags = [...list(asset.tags), ...list(owner.tags)].map((tag) => normalizedToken(tag));
  const explicit = normalizedToken(
    asset.motionRole
      || asset.analyzerRole
      || asset.metadata?.motionRole
      || asset.metadata?.motionAffordance
      || asset.metadata?.scrollSite?.analyzer?.role
      || "",
  );
  const text = [...tags, explicit].join(" ");
  if (/loop|hold|idle|ambient|calm|rest/.test(text) || list(asset.metadata?.loopPoints).length) return "loop";
  if (/transition|connector|progression|action|combat|dance|movement|kinetic|travel/.test(text)) return "transition";
  return "neutral";
}

function isTechnicallyEligible(asset = {}, owner = {}, options = {}) {
  if (!isVideoAsset(asset)) return false;
  const originPredicate = typeof options.originPredicate === "function" ? options.originPredicate : hasHapaDevProtoOrigin;
  if (originPredicate(asset, asset.metadata, owner, owner?.hapaMergeProvenance)) return false;
  const uri = String(asset.uri || asset.url || asset.src || "");
  const allowedUriPrefixes = list(options.allowedUriPrefixes).length ? options.allowedUriPrefixes : ["/media/"];
  if (!allowedUriPrefixes.some((prefix) => uri.startsWith(prefix))) return false;
  const { width, height } = assetDimensions(asset);
  const shortEdge = Math.min(width, height);
  if (shortEdge < finite(options.minShortEdge, DEFAULT_MIN_SHORT_EDGE)) return false;
  if (assetDuration(asset) < finite(options.minDurationSeconds, DEFAULT_MIN_DURATION_SECONDS)) return false;
  const markers = [
    ...list(asset.tags),
    asset.processing?.status,
    asset.metadata?.echosTechnicalAffordance?.status,
  ].filter(Boolean).map(normalizedToken);
  if (markers.some((marker) => INVALID_TECHNICAL_MARKERS.some((invalid) => marker.includes(invalid)))) return false;
  const technical = technicalFor(asset, options);
  const technicalStatus = technical.status || asset.metadata?.echosTechnicalAffordance?.status || "";
  const verifiedTechnicalStatuses = new Set(list(options.verifiedTechnicalStatuses).length
    ? options.verifiedTechnicalStatuses
    : ["verified-source-file"]);
  if (options.requireVerifiedTechnical && !verifiedTechnicalStatuses.has(technicalStatus)) return false;
  const pixelFormat = String(technical.pixelFormat || asset.metadata?.echosTechnicalAffordance?.pixelFormat || "").toLowerCase();
  if (options.requireBrowserSafePixelFormat && pixelFormat && pixelFormat !== "yuv420p") return false;
  if (options.availableMediaFiles instanceof Set && !options.availableMediaFiles.has(mediaFileName(uri))) return false;
  return true;
}

function technicalFor(asset = {}, options = {}) {
  if (!(options.technicalByFileName instanceof Map)) return {};
  return options.technicalByFileName.get(mediaFileName(asset.uri)) || {};
}

function commonCandidate(asset = {}, owner = {}, input = {}, options = {}) {
  const technical = technicalFor(asset, options);
  const { width, height } = assetDimensions({
    ...asset,
    metadata: {
      ...asset.metadata,
      echosTechnicalAffordance: asset.metadata?.echosTechnicalAffordance || technical,
    },
  });
  const duration = assetDuration({
    ...asset,
    metadata: {
      ...asset.metadata,
      echosTechnicalAffordance: asset.metadata?.echosTechnicalAffordance || technical,
    },
  });
  const sha256 = assetHash(asset, technical);
  return {
    id: input.id,
    mediaLibraryId: input.mediaLibraryId || asset.id || input.id,
    cardId: input.cardId,
    cardKind: input.cardKind,
    cardRef: input.cardRef,
    cardTitle: input.cardTitle,
    ownerId: input.ownerId,
    ownerTitle: input.ownerTitle,
    title: input.title || asset.name || asset.title || input.cardTitle || asset.id,
    uri: asset.uri,
    runtimeUri: asset.runtimeUri || asset.metadata?.scrollSite?.derived?.runtimeUri || asset.uri,
    posterUri: assetPoster(asset),
    sha256,
    technicalIdentity: sha256 ? `sha256:${sha256}` : `uri:${String(asset.uri).toLowerCase()}`,
    duration,
    width,
    height,
    fps: finite(asset.fps ?? asset.metadata?.fps ?? asset.metadata?.frameRate ?? technical.fps),
    sourceGroup: input.sourceGroup,
    cohort: input.cohort,
    analyzerRole: motionRole(asset, owner) === "loop" ? "loop" : "transition",
    motionRole: motionRole(asset, owner),
    analyzerConfidence: asset.metadata?.scrollSite?.analyzer?.confidence || "builder-metadata",
    authoredUse: asset.metadata?.scrollSite?.authored?.use || (motionRole(asset, owner) === "loop" ? "hold" : "connector"),
    authoredRoles: list(asset.metadata?.scrollSite?.authored?.roles),
    semanticTags: [...new Set([...list(owner.tags), ...list(asset.tags)])],
    tags: list(asset.tags),
    routeOrder: finite(input.routeOrder),
    autoEligible: true,
    origin: input.origin,
    technical: {
      status: technical.status || asset.metadata?.echosTechnicalAffordance?.status || "builder-metadata-verified",
      shortEdge: Math.min(width, height),
      identityBasis: sha256 ? "sha256" : "stable-local-uri",
      codec: technical.codec || asset.metadata?.echosTechnicalAffordance?.codec || "",
      pixelFormat: technical.pixelFormat || asset.metadata?.echosTechnicalAffordance?.pixelFormat || "",
      keyframeCount: finite(technical.keyframes?.count ?? asset.metadata?.echosTechnicalAffordance?.keyframes?.count),
    },
  };
}

function dedupeCandidates(candidates = [], alreadyUsed = new Set()) {
  const output = [];
  for (const candidate of candidates) {
    const identity = candidateIdentity(candidate);
    if (alreadyUsed.has(identity)) continue;
    alreadyUsed.add(identity);
    output.push(candidate);
  }
  return output;
}

export function buildScrollDirectorCandidatesFromLibrary(mediaLibrary = {}, options = {}) {
  const rows = list(mediaLibrary.records)
    .filter((record) => record?.mediaType === "video" && list(record.tags).includes("director-eligible"))
    .filter((record) => !hasHapaDevProtoOrigin(record, record.asset, record.cardRecord))
    .sort((a, b) => finite(a.asset?.metadata?.scrollSite?.authored?.routeOrder) - finite(b.asset?.metadata?.scrollSite?.authored?.routeOrder)
      || String(a.id).localeCompare(String(b.id)));
  const candidates = rows.flatMap((record, index) => {
    const asset = record.asset || record;
    if (!isTechnicallyEligible(asset, record, options)) return [];
    const scroll = asset.metadata?.scrollSite || {};
    const digest = String(scroll.sha256 || record.intelligence?.technical?.sha256 || record.contentFingerprint || "").replace(/^sha256:/i, "");
    const cardId = list(record.relationships).find((relationship) => relationship.ownerType === "card")?.ownerId
      || (digest ? `scroll-video-${digest}` : record.id);
    return [commonCandidate(asset, record, {
      id: record.id,
      mediaLibraryId: record.id,
      cardId,
      cardKind: "item",
      cardRef: `data/item-manager-store.json#cards/${cardId}`,
      cardTitle: record.name,
      ownerId: cardId,
      ownerTitle: record.name,
      title: record.name,
      sourceGroup: "scroll",
      cohort: scroll.cohort || (list(record.tags).includes("scroll-cohort-root") ? "root" : "fal-second-cohort"),
      routeOrder: scroll.authored?.routeOrder ?? index,
      origin: { sourceSystem: "scroll-site-skill", sourceStore: "data/media-library.json", recordId: record.id },
    }, options)];
  });
  return dedupeCandidates(candidates, options.usedIdentities || new Set());
}

export function buildSceneDirectorCandidates(sceneStore = {}, options = {}) {
  const rows = list(sceneStore.scenes)
    .filter((scene) => !list(scene.tags).includes("scroll-site"))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .flatMap((scene) => list(scene.assets).map((asset) => ({ scene, asset })))
    .filter(({ scene, asset }) => (!options.requireSceneItemCard || Boolean(asset.metadata?.cardId)) && isTechnicallyEligible(asset, scene, options))
    .sort((a, b) => String(a.scene.id).localeCompare(String(b.scene.id)) || String(a.asset.id).localeCompare(String(b.asset.id)));
  const candidates = rows.map(({ scene, asset }, index) => {
    const sceneItemCardId = asset.metadata?.cardId || "";
    const sceneItemCard = options.itemCardById instanceof Map ? options.itemCardById.get(sceneItemCardId) : null;
    const cardId = sceneItemCardId || scene.id;
    return commonCandidate(asset, scene, {
    id: `builder-scene:${scene.id}:${asset.id}`,
    cardId,
    cardKind: sceneItemCardId ? "item" : "scene",
    cardRef: sceneItemCardId ? `data/item-manager-store.json#cards/${sceneItemCardId}` : `data/scene-store.json#scenes/${scene.id}`,
    cardTitle: sceneItemCard?.title || scene.title,
    ownerId: scene.id,
    ownerTitle: scene.title,
    title: `${scene.title || scene.id} · ${asset.name || asset.title || asset.id}`,
    sourceGroup: "scene",
    cohort: "builder-scene",
    routeOrder: index,
    origin: { sourceSystem: "hapa-avatar-builder", sourceStore: "data/scene-store.json", recordId: scene.id },
  }, options);
  });
  return dedupeCandidates(candidates, options.usedIdentities || new Set());
}

export function buildAvatarDirectorCandidates(avatarStore = {}, options = {}) {
  const rows = list(avatarStore.avatars)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .flatMap((avatar) => list(avatar.assets).map((asset) => ({ avatar, asset })))
    .filter(({ avatar, asset }) => isTechnicallyEligible(asset, avatar, options))
    .sort((a, b) => String(a.avatar.id).localeCompare(String(b.avatar.id)) || String(a.asset.id).localeCompare(String(b.asset.id)));
  const candidates = rows.map(({ avatar, asset }, index) => {
    const avatarTitle = avatar.primaryName || avatar.name || avatar.title || avatar.id;
    return commonCandidate(asset, avatar, {
      id: `builder-avatar:${avatar.id}:${asset.id}`,
      cardId: avatar.id,
      cardKind: "avatar",
      cardRef: `data/avatar-store.json#avatars/${avatar.id}`,
      cardTitle: avatarTitle,
      ownerId: avatar.id,
      ownerTitle: avatarTitle,
      title: `${avatarTitle} · ${asset.name || asset.title || asset.id}`,
      sourceGroup: "avatar",
      cohort: "builder-avatar",
      routeOrder: index,
      origin: { sourceSystem: "hapa-avatar-builder", sourceStore: "data/avatar-store.json", recordId: avatar.id },
    }, options);
  });
  return dedupeCandidates(candidates, options.usedIdentities || new Set());
}

export function buildDeevidDirectorCandidates(itemStore = {}, options = {}) {
  const rows = list(itemStore.cards)
    .filter((card) => String(card.id || "").startsWith("card-media-deevid-")
      || card.cardRecord?.schemaVersion === "hapa.deevid-media-card-record.v1")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .flatMap((card) => list(card.mediaAssets).map((asset) => ({ card, asset })))
    .filter(({ card, asset }) => isTechnicallyEligible(asset, card, options))
    .sort((a, b) => String(a.card.id).localeCompare(String(b.card.id)) || String(a.asset.id).localeCompare(String(b.asset.id)));
  const candidates = rows.map(({ card, asset }, index) => commonCandidate(asset, card, {
    id: `builder-deevid:${card.id}:${asset.id}`,
    cardId: card.id,
    cardKind: "item",
    cardRef: `data/item-manager-store.json#cards/${card.id}`,
    cardTitle: card.title || card.name || card.id,
    ownerId: card.id,
    ownerTitle: card.title || card.name || card.id,
    title: card.title || card.name || asset.title || asset.id,
    sourceGroup: "deevid",
    cohort: "builder-deevid",
    routeOrder: index,
    origin: { sourceSystem: "hapa-avatar-builder", sourceStore: "data/item-manager-store.json", recordId: card.id },
  }, options));
  return dedupeCandidates(candidates, options.usedIdentities || new Set());
}

export function buildTarotDirectorCandidates(tarotStore = {}, options = {}) {
  const rows = list(tarotStore.cards)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .flatMap((card) => list(card.assets).map((asset) => ({ card, asset })))
    .filter(({ card, asset }) => isTechnicallyEligible(asset, card, options))
    .sort((a, b) => String(a.card.id).localeCompare(String(b.card.id)) || String(a.asset.id).localeCompare(String(b.asset.id)));
  const candidates = rows.map(({ card, asset }, index) => commonCandidate(asset, card, {
    id: `builder-tarot:${card.id}:${asset.id}`,
    cardId: card.id,
    cardKind: "tarot",
    cardRef: `data/tarot-store.json#cards/${card.id}`,
    cardTitle: card.title || card.name || card.id,
    ownerId: card.id,
    ownerTitle: card.title || card.name || card.id,
    title: `${card.title || card.name || card.id} · ${asset.name || asset.title || asset.id}`,
    sourceGroup: "tarot",
    cohort: "builder-tarot",
    routeOrder: index,
    origin: { sourceSystem: "hapa-avatar-builder", sourceStore: "data/tarot-store.json", recordId: card.id },
  }, options));
  return dedupeCandidates(candidates, options.usedIdentities || new Set());
}

export function buildEligibleBuilderMediaDirectorCandidates(stores = {}, options = {}) {
  const usedIdentities = new Set();
  const shared = { ...options, usedIdentities, originPredicate: hasExcludedEchoDirectorOrigin };
  for (const key of ["deevidOptions", "tarotOptions", "sceneOptions", "avatarOptions"]) delete shared[key];
  const deevid = buildDeevidDirectorCandidates(stores.itemStore, { ...shared, ...options.deevidOptions, usedIdentities });
  const tarot = buildTarotDirectorCandidates(stores.tarotStore, { ...shared, ...options.tarotOptions, usedIdentities });
  const scene = buildSceneDirectorCandidates(stores.sceneStore, { ...shared, ...options.sceneOptions, usedIdentities });
  const avatar = buildAvatarDirectorCandidates(stores.avatarStore, { ...shared, ...options.avatarOptions, usedIdentities });
  const candidates = [...avatar, ...deevid, ...tarot, ...scene];
  return {
    candidates,
    groups: { avatar, deevid, tarot, scene },
    telemetry: {
      total: candidates.length,
      avatar: avatar.length,
      deevid: deevid.length,
      tarot: tarot.length,
      scene: scene.length,
      uniqueTechnicalIdentities: usedIdentities.size,
      minShortEdge: finite(options.minShortEdge, DEFAULT_MIN_SHORT_EDGE),
      minDurationSeconds: finite(options.minDurationSeconds, DEFAULT_MIN_DURATION_SECONDS),
      excludedOrigin: "hapa-dev-proto-and-hell-week-explicit-provenance-only",
    },
  };
}

export function buildBuilderExpandedDirectorCandidates(stores = {}, options = {}) {
  const usedIdentities = new Set();
  const shared = { ...options, usedIdentities };
  delete shared.scrollOptions;
  delete shared.sceneOptions;
  delete shared.avatarOptions;
  const scroll = buildScrollDirectorCandidatesFromLibrary(stores.mediaLibrary, { ...shared, ...options.scrollOptions, usedIdentities });
  const scene = buildSceneDirectorCandidates(stores.sceneStore, { ...shared, ...options.sceneOptions, usedIdentities });
  const avatar = buildAvatarDirectorCandidates(stores.avatarStore, { ...shared, ...options.avatarOptions, usedIdentities });
  const candidates = [...scroll, ...scene, ...avatar];
  return {
    candidates,
    groups: { scroll, scene, avatar },
    telemetry: {
      total: candidates.length,
      scroll: scroll.length,
      scene: scene.length,
      avatar: avatar.length,
      uniqueTechnicalIdentities: usedIdentities.size,
      minShortEdge: finite(options.minShortEdge, DEFAULT_MIN_SHORT_EDGE),
      minDurationSeconds: finite(options.minDurationSeconds, DEFAULT_MIN_DURATION_SECONDS),
      excludedOrigin: "hapa-dev-proto-explicit-provenance-only",
    },
  };
}
