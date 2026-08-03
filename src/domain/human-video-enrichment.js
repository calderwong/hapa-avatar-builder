export const HUMAN_VIDEO_ENRICHMENT_STORE_SCHEMA = "hapa.human-video-enrichment-store.v1";
export const HUMAN_VIDEO_ENRICHMENT_RECORD_SCHEMA = "hapa.human-video-enrichment.v1";
export const HUMAN_VIDEO_ENRICHER_DASHBOARD_SCHEMA = "hapa.human-video-enricher-dashboard.v1";

export const HUMAN_VIDEO_QUALITY_GRADES = Object.freeze([
  { value: 0, label: "Ungraded", shortLabel: "—" },
  { value: 1, label: "Reject", shortLabel: "1" },
  { value: 2, label: "Rough", shortLabel: "2" },
  { value: 3, label: "Usable", shortLabel: "3" },
  { value: 4, label: "Strong", shortLabel: "4" },
  { value: 5, label: "Hero", shortLabel: "5" },
]);

export const HUMAN_VIDEO_REVIEW_FILTERS = Object.freeze([
  { value: "all", label: "All videos" },
  { value: "agent-reviewed", label: "Optically reviewed" },
  { value: "pending-human", label: "Needs human validation" },
  { value: "human-validated", label: "Human validated" },
  { value: "not-reviewed", label: "Not optically reviewed" },
]);

const REFERENCE_TYPES = new Set(["echo-song", "song", "card", "url", "other"]);

export function createHumanVideoEnrichmentStore(input = {}) {
  return normalizeHumanVideoEnrichmentStore({
    schemaVersion: HUMAN_VIDEO_ENRICHMENT_STORE_SCHEMA,
    records: input.records || [],
    updatedAt: input.updatedAt || null,
    truthBoundary: input.truthBoundary,
  });
}

export function normalizeHumanVideoEnrichmentStore(input = {}) {
  const records = uniqueRecords(input.records || []);
  return {
    schemaVersion: HUMAN_VIDEO_ENRICHMENT_STORE_SCHEMA,
    records,
    updatedAt: input.updatedAt || latestTimestamp(records.map((record) => record.updatedAt)) || null,
    truthBoundary: input.truthBoundary || "Human-authored direction overlay. Grades, mentions, notes, and references do not establish canon, ownership, rights clearance, publication approval, or render authority.",
  };
}

export function humanVideoIdentity(video = {}) {
  return {
    recordId: clean(video.recordId || video.id, 360),
    assetId: clean(video.assetId || video.asset?.id, 360),
    contentFingerprint: clean(video.contentFingerprint, 360),
    uri: clean(video.uri || video.asset?.uri, 2_000),
    sourcePath: clean(video.sourcePath || video.asset?.metadata?.sourcePath || video.asset?.storage?.path, 4_000),
  };
}

export function humanVideoKey(video = {}) {
  const identity = humanVideoIdentity(video);
  if (identity.contentFingerprint) return `fingerprint:${identity.contentFingerprint}`;
  if (identity.recordId) return `record:${identity.recordId}`;
  if (identity.sourcePath) return `path:${identity.sourcePath}`;
  if (identity.uri) return `uri:${identity.uri}`;
  if (identity.assetId) return `asset:${identity.assetId}`;
  return "";
}

export function matchesHumanVideoReviewFilter(video = {}, filter = "all") {
  const normalized = String(filter || "all").trim().toLowerCase();
  const review = video.agentReview || null;
  if (normalized === "agent-reviewed") return Boolean(review);
  if (normalized === "pending-human") return review?.status === "pending-human";
  if (normalized === "human-validated") return ["accepted", "accepted-edited", "rejected"].includes(review?.status);
  if (normalized === "not-reviewed") return !review;
  return true;
}

export function createHumanVideoQualityCalibration(videos = []) {
  const pairs = (Array.isArray(videos) ? videos : []).flatMap((video) => {
    const agentQuality = Number(video.agentReview?.proposal?.quality?.value || 0);
    const humanQuality = Number(video.humanEnrichment?.quality?.value || 0);
    return agentQuality && humanQuality ? [{ videoKey: video.humanVideoKey, agentQuality, humanQuality, delta: humanQuality - agentQuality }] : [];
  });
  const sampleSize = pairs.length;
  const gradeBands = [1, 2, 3, 4, 5].map((agentQuality) => {
    const matches = pairs.filter((pair) => pair.agentQuality === agentQuality);
    return {
      agentQuality,
      sampleSize: matches.length,
      humanAverage: matches.length ? round(matches.reduce((sum, pair) => sum + pair.humanQuality, 0) / matches.length, 3) : null,
      meanDelta: matches.length ? round(matches.reduce((sum, pair) => sum + pair.delta, 0) / matches.length, 3) : null,
    };
  });
  return {
    schemaVersion: "hapa.human-video-quality-calibration.v1",
    sampleSize,
    exactMatches: pairs.filter((pair) => pair.delta === 0).length,
    exactMatchRate: sampleSize ? round(pairs.filter((pair) => pair.delta === 0).length / sampleSize, 4) : null,
    withinOneRate: sampleSize ? round(pairs.filter((pair) => Math.abs(pair.delta) <= 1).length / sampleSize, 4) : null,
    meanError: sampleSize ? round(pairs.reduce((sum, pair) => sum + pair.delta, 0) / sampleSize, 3) : null,
    meanAbsoluteError: sampleSize ? round(pairs.reduce((sum, pair) => sum + Math.abs(pair.delta), 0) / sampleSize, 3) : null,
    gradeBands,
    guidance: "Use the observed human corrections as a bounded prior, not an automatic replacement. Preserve the independent optical judgment and explain departures, especially where a grade band has fewer than five human examples.",
  };
}

export function normalizeHumanVideoEnrichment(input = {}, fallback = {}) {
  const videoIdentity = humanVideoIdentity(input.videoIdentity || input.video || fallback.videoIdentity || fallback.video || {});
  const key = clean(input.key || fallback.key || humanVideoKey(videoIdentity), 4_500);
  if (!key) throw humanEnrichmentError("missing_video_key", "Human video enrichment requires one stable video identity.");
  const quality = normalizeQuality(input.quality ?? fallback.quality);
  const revision = Math.max(1, Math.trunc(number(input.revision ?? fallback.revision, 1)));
  const createdAt = clean(input.createdAt || fallback.createdAt, 80) || null;
  const updatedAt = clean(input.updatedAt || fallback.updatedAt, 80) || createdAt;
  return {
    schemaVersion: HUMAN_VIDEO_ENRICHMENT_RECORD_SCHEMA,
    key,
    videoId: clean(input.videoId || fallback.videoId || videoIdentity.recordId, 360),
    videoName: clean(input.videoName || fallback.videoName, 800),
    videoIdentity,
    quality,
    description: cleanMultiline(input.description ?? fallback.description, 12_000),
    categories: normalizeTextTags(input.categories ?? fallback.categories, 80),
    tags: normalizeTextTags(input.tags ?? fallback.tags, 160),
    avatarMentions: normalizeAvatarMentions(input.avatarMentions ?? fallback.avatarMentions),
    directorNotes: cleanMultiline(input.directorNotes ?? fallback.directorNotes, 12_000),
    references: normalizeReferences(input.references ?? fallback.references),
    agentReviewLineage: normalizeAgentReviewLineage(input.agentReviewLineage ?? fallback.agentReviewLineage),
    humanAuthored: true,
    updatedBy: clean(input.updatedBy || fallback.updatedBy || "local-human-operator", 180),
    revision,
    createdAt,
    updatedAt,
  };
}

export function upsertHumanVideoEnrichment(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoEnrichmentStore(storeInput);
  const incomingIdentity = humanVideoIdentity(input.videoIdentity || input.video || {});
  const key = clean(input.key || humanVideoKey(incomingIdentity), 4_500);
  if (!key) throw humanEnrichmentError("missing_video_key", "Select a known video before saving human enrichment.");
  const current = store.records.find((record) => record.key === key) || null;
  const expectedRevision = input.expectedRevision;
  if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== Number(current?.revision || 0)) {
    throw humanEnrichmentError("human_enrichment_revision_conflict", "This video was enriched by another view. Reload its latest revision before saving.", 409, {
      expectedRevision: Number(expectedRevision),
      currentRevision: Number(current?.revision || 0),
      key,
    });
  }
  const now = options.now || new Date().toISOString();
  const record = normalizeHumanVideoEnrichment({
    ...(current || {}),
    ...input,
    key,
    videoIdentity: mergeIdentity(current?.videoIdentity, incomingIdentity),
    updatedBy: options.actorId || input.updatedBy || current?.updatedBy || "local-human-operator",
    revision: Number(current?.revision || 0) + 1,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  });
  const records = store.records.filter((item) => item.key !== key);
  records.push(record);
  records.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.key.localeCompare(b.key));
  return {
    store: normalizeHumanVideoEnrichmentStore({ ...store, records, updatedAt: now }),
    record,
  };
}

export function createHumanVideoEnricherDashboard({ mediaDashboard = {}, enrichmentStore = {}, agentReviewStore = {}, avatars = [], songs = [] } = {}) {
  const store = normalizeHumanVideoEnrichmentStore(enrichmentStore);
  const agentReviews = new Map((agentReviewStore.reviews || []).map((review) => [review.videoKey, review]));
  const videos = (mediaDashboard.records || [])
    .filter((record) => record.mediaType === "video")
    .map((video) => {
      const enriched = attachEnrichment(video, store);
      return compactHumanEnricherVideo({ ...enriched, agentReview: agentReviews.get(enriched.humanVideoKey) || null });
    })
    .sort((a, b) => Number(Boolean(b.humanEnrichment)) - Number(Boolean(a.humanEnrichment))
      || effectiveQuality(b) - effectiveQuality(a)
      || String(a.name || a.id).localeCompare(String(b.name || b.id)));
  const enriched = videos.filter((video) => video.humanEnrichment);
  const agentReviewed = videos.filter((video) => video.agentReview);
  const qualityCalibration = createHumanVideoQualityCalibration(videos);
  return {
    schemaVersion: HUMAN_VIDEO_ENRICHER_DASHBOARD_SCHEMA,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt: mediaDashboard.updatedAt || null,
    enrichmentUpdatedAt: store.updatedAt,
    truthBoundary: store.truthBoundary,
    directorContract: {
      consumer: "Echo State director",
      field: "human_enrichment",
      matching: "content fingerprint, record/asset id, source path, or media URI",
      authority: "human direction only; render and publication gates remain separate",
    },
    summary: {
      videos: videos.length,
      enriched: enriched.length,
      ungraded: videos.filter((video) => !video.humanEnrichment?.quality?.value).length,
      withDirectorNotes: enriched.filter((video) => video.humanEnrichment.directorNotes).length,
      withAvatarMentions: enriched.filter((video) => video.humanEnrichment.avatarMentions.length).length,
      withReferences: enriched.filter((video) => video.humanEnrichment.references.length).length,
      agentReviewed: agentReviewed.length,
      pendingHumanValidation: agentReviewed.filter((video) => video.agentReview.status === "pending-human").length,
      humanValidatedAgentReviews: agentReviewed.filter((video) => ["accepted", "accepted-edited", "rejected"].includes(video.agentReview.status)).length,
      remainingOpticalReviews: Math.max(0, videos.length - agentReviewed.length),
      calibrationPairs: qualityCalibration.sampleSize,
      agentQualityExactMatchRate: qualityCalibration.exactMatchRate,
    },
    qualityCalibration,
    facets: mediaDashboard.facets || {},
    avatarOptions: (avatars || []).map((avatar) => ({
      id: clean(avatar.id, 360),
      name: clean(avatar.primaryName || avatar.name || avatar.id, 800),
      mention: `@${clean(avatar.primaryName || avatar.name || avatar.id, 800).replace(/^@+/, "")}`,
    })).filter((avatar) => avatar.id && avatar.name).sort((a, b) => a.name.localeCompare(b.name)),
    songOptions: (songs || []).map((song) => ({
      id: clean(song.id || song.songId || song.registryId, 360),
      title: clean(song.title || song.name || song.songTitle || song.id, 800),
      referenceType: "echo-song",
    })).filter((song) => song.id && song.title).sort((a, b) => a.title.localeCompare(b.title)),
    videos,
  };
}

function compactHumanEnricherVideo(video = {}) {
  const intelligence = video.enrichment || video.intelligence || null;
  const rawRegisteredFrames = video.asset?.metadata?.frames || video.asset?.state?.keyframes || [];
  const registeredFrames = Array.isArray(rawRegisteredFrames) ? rawRegisteredFrames : Object.values(rawRegisteredFrames || {}).filter((frame) => frame && typeof frame === "object");
  return {
    id: video.id,
    assetId: video.assetId || video.asset?.id || null,
    name: video.name,
    mediaType: "video",
    uri: video.uri,
    thumbnailUri: video.thumbnailUri,
    ownerType: video.ownerType,
    ownerId: video.ownerId,
    ownerName: video.ownerName,
    role: video.role,
    sourceRoots: video.sourceRoots || [],
    sourcePath: video.sourcePath,
    contentFingerprint: video.contentFingerprint,
    sizeBytes: video.sizeBytes,
    width: video.width,
    height: video.height,
    duration: video.duration,
    orientation: video.orientation,
    dimensionClass: video.dimensionClass,
    documentKind: video.documentKind,
    reviewPriority: video.reviewPriority,
    reviewStatus: video.reviewStatus,
    tags: video.tags || [],
    match: video.match || null,
    relationships: video.relationships || [],
    notes: video.notes || "",
    sourceMetadata: video.asset ? {
      id: video.asset.id,
      name: video.asset.name || video.asset.title || null,
      requirementId: video.asset.requirementId || null,
      source: video.asset.source || null,
      mimeType: video.asset.mimeType || video.asset.metadata?.mimeType || null,
      originalFileName: video.asset.metadata?.originalFileName || null,
      storage: video.asset.storage || video.asset.metadata?.storage || null,
      technicalStatus: video.asset.metadata?.echosTechnicalAffordance?.status || null,
      codec: video.asset.metadata?.echosTechnicalAffordance?.codec || null,
      fps: video.asset.metadata?.echosTechnicalAffordance?.fps || null,
      registeredFrames: registeredFrames.map((frame, index) => ({
        id: frame.id || `frame-${index + 1}`,
        marker: frame.marker || frame.role || frame.label || null,
        timestampSeconds: Number(frame.time ?? frame.timestampSeconds ?? frame.timestamp ?? 0),
        uri: frame.uri || frame.thumbnailUri || frame.thumbnail?.uri || null,
        fingerprint: frame.fingerprint || frame.sha256 || null,
      })),
    } : null,
    enrichmentSummary: intelligence ? {
      status: intelligence.status || null,
      classifications: intelligence.classifications || null,
      visionLabels: (intelligence.vision?.labels || []).slice(0, 16),
      ocrLineCount: Number(intelligence.ocr?.lineCount || intelligence.ocr?.lines?.length || 0),
    } : null,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    humanVideoKey: video.humanVideoKey,
    humanEnrichment: video.humanEnrichment,
    agentReview: video.agentReview || null,
  };
}

export function attachHumanEnrichmentToDirectorProject(projectInput = {}, storeInput = {}) {
  const store = normalizeHumanVideoEnrichmentStore(storeInput);
  const lookup = humanEnrichmentLookup(store);
  let matchedShots = 0;
  const enrichTimeline = (timeline) => (Array.isArray(timeline) ? timeline.map((shot) => {
    const enrichment = findHumanEnrichmentForDirectorShot(shot, lookup);
    if (!enrichment) return shot;
    matchedShots += 1;
    return { ...shot, human_enrichment: directorEnrichmentProjection(enrichment) };
  }) : timeline);
  const directionVariants = Array.isArray(projectInput.direction_script_variants)
    ? projectInput.direction_script_variants.map((variant) => ({ ...variant, timeline: enrichTimeline(variant.timeline) }))
    : projectInput.direction_script_variants;
  return {
    ...projectInput,
    timeline: enrichTimeline(projectInput.timeline),
    direction_script_variants: directionVariants,
    director_human_enrichment: {
      schemaVersion: HUMAN_VIDEO_ENRICHMENT_STORE_SCHEMA,
      humanAuthored: true,
      matchedShots,
      availableRecords: store.records.length,
      truthBoundary: store.truthBoundary,
    },
  };
}

function attachEnrichment(video, store) {
  const lookup = humanEnrichmentLookup(store);
  const aliases = identityAliases({ ...humanVideoIdentity(video), recordId: video.id, assetId: video.assetId || video.asset?.id });
  const enrichment = aliases.map((alias) => lookup.get(alias)).find(Boolean) || null;
  return {
    ...video,
    humanVideoKey: enrichment?.key || humanVideoKey(video),
    humanEnrichment: enrichment,
  };
}

function findHumanEnrichmentForDirectorShot(shot = {}, lookup) {
  const contract = shot.media_contract || shot.mediaContract || {};
  const aliases = [
    shot.media_id,
    shot.mediaId,
    shot.asset_id,
    shot.assetId,
    shot.media_uri,
    shot.mediaUri,
    shot.runtime_media_uri,
    shot.runtimeMediaUri,
    contract.runtimeUri,
    contract.runtime_uri,
    contract.originalUri,
    contract.original_uri,
  ].flatMap(aliasVariants);
  return aliases.map((alias) => lookup.get(alias)).find(Boolean) || null;
}

function humanEnrichmentLookup(store) {
  const lookup = new Map();
  for (const record of store.records) {
    for (const alias of [record.key, record.videoId, ...identityAliases(record.videoIdentity)].flatMap(aliasVariants)) {
      if (alias && !lookup.has(alias)) lookup.set(alias, record);
    }
  }
  return lookup;
}

function identityAliases(identity = {}) {
  return [identity.recordId, identity.assetId, identity.contentFingerprint, identity.uri, identity.sourcePath].filter(Boolean);
}

function aliasVariants(value) {
  const text = clean(value, 4_500);
  if (!text) return [];
  const withoutFile = text.replace(/^file:\/\//, "");
  const withoutApi = text.startsWith("/api/local-file?") ? localFilePathFromApiUri(text) : "";
  return [...new Set([text, withoutFile, withoutApi].filter(Boolean))];
}

function localFilePathFromApiUri(uri) {
  try {
    return new URL(uri, "http://127.0.0.1").searchParams.get("path") || "";
  } catch {
    return "";
  }
}

function directorEnrichmentProjection(record) {
  return {
    schemaVersion: HUMAN_VIDEO_ENRICHMENT_RECORD_SCHEMA,
    humanAuthored: true,
    quality: record.quality,
    description: record.description,
    categories: record.categories,
    tags: record.tags,
    avatarMentions: record.avatarMentions,
    directorNotes: record.directorNotes,
    references: record.references,
    agentReviewLineage: record.agentReviewLineage,
    revision: record.revision,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    authority: "human-direction-only",
  };
}

function normalizeQuality(value) {
  const raw = typeof value === "object" && value !== null ? value.value : value;
  const numeric = Math.max(0, Math.min(5, Math.trunc(number(raw, 0))));
  const definition = HUMAN_VIDEO_QUALITY_GRADES.find((item) => item.value === numeric) || HUMAN_VIDEO_QUALITY_GRADES[0];
  return { value: definition.value, label: definition.label };
}

function normalizeAvatarMentions(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  const byId = new Map();
  for (const item of values.slice(0, 80)) {
    const object = typeof item === "object" && item !== null ? item : {};
    const name = clean(object.name || object.avatarName || item, 800).replace(/^@+/, "");
    const avatarId = clean(object.avatarId || object.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 360);
    if (!name || !avatarId) continue;
    byId.set(avatarId, { avatarId, avatarName: name, mention: `@${name}` });
  }
  return [...byId.values()];
}

function normalizeReferences(value) {
  const values = Array.isArray(value) ? value : [];
  const byKey = new Map();
  for (const item of values.slice(0, 120)) {
    if (!item) continue;
    const object = typeof item === "object" ? item : { label: item };
    const type = REFERENCE_TYPES.has(object.type) ? object.type : "other";
    const reference = {
      id: clean(object.id || object.referenceId, 360),
      type,
      label: clean(object.label || object.title || object.name || object.id, 800),
      uri: clean(object.uri || object.url, 2_000),
      notes: cleanMultiline(object.notes, 2_000),
    };
    if (!reference.label && !reference.id && !reference.uri) continue;
    const key = `${reference.type}:${reference.id || reference.uri || reference.label}`;
    byKey.set(key, reference);
  }
  return [...byKey.values()];
}

function normalizeTextTags(value, limit) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,\n]+/);
  return [...new Set(values.map((item) => clean(item, 180)).filter(Boolean))].slice(0, limit);
}

function normalizeAgentReviewLineage(value) {
  if (!value || typeof value !== "object") return null;
  return {
    reviewId: clean(value.reviewId, 5_000),
    reviewRevision: Math.max(1, Math.trunc(number(value.reviewRevision, 1))),
    decision: clean(value.decision || "accepted-edited", 80),
    agentId: clean(value.agentId, 240),
    taskId: clean(value.taskId, 500),
    incorporatedAt: clean(value.incorporatedAt, 80) || null,
  };
}

function effectiveQuality(video) {
  return Number(video.humanEnrichment?.quality?.value ?? video.agentReview?.proposal?.quality?.value ?? 0);
}

function uniqueRecords(records) {
  const byKey = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    try {
      const normalized = normalizeHumanVideoEnrichment(record);
      const current = byKey.get(normalized.key);
      if (!current || normalized.revision > current.revision || String(normalized.updatedAt || "") > String(current.updatedAt || "")) byKey.set(normalized.key, normalized);
    } catch {
      // Invalid local rows are omitted from the read model; writes remain fail-closed.
    }
  }
  return [...byKey.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.key.localeCompare(b.key));
}

function mergeIdentity(current = {}, incoming = {}) {
  return {
    recordId: incoming.recordId || current.recordId || "",
    assetId: incoming.assetId || current.assetId || "",
    contentFingerprint: incoming.contentFingerprint || current.contentFingerprint || "",
    uri: incoming.uri || current.uri || "",
    sourcePath: incoming.sourcePath || current.sourcePath || "",
  };
}

function latestTimestamp(values) {
  return values.filter(Boolean).map(String).sort((a, b) => b.localeCompare(a))[0] || null;
}

function clean(value, max) {
  return String(value || "").replace(/\0/g, "").trim().slice(0, max);
}

function cleanMultiline(value, max) {
  return String(value || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function humanEnrichmentError(code, message, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
