import { localFileApiUri, localMediaPath } from "./local-media-uri.js";

export const ECHO_RECORD_GARDEN_SCHEMA = "hapa.echo-record-garden.record.v1";
export const ECHO_RECORD_VISUAL_SURFACE_SCHEMA = "hapa.echo-record-garden.visual-surface.v1";
export const ECHO_RECORD_LOCAL_CARD_SCHEMA = "hapa.echo-record-garden.local-card-projection.v1";
export const ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA = "hapa.echo-record-garden.snapshot.v1";
export const ECHO_RECORD_RPM = 100 / 3;

const TAU = Math.PI * 2;
const MAX_VISUAL_SURFACES = 12;
const ACCENTS = Object.freeze([
  { key: "cyan", hex: "#58d8e8", rgb: "88, 216, 232" },
  { key: "violet", hex: "#a68cff", rgb: "166, 140, 255" },
  { key: "amber", hex: "#efb76b", rgb: "239, 183, 107" },
  { key: "rose", hex: "#ed7fa9", rgb: "237, 127, 169" },
  { key: "sage", hex: "#78c991", rgb: "120, 201, 145" },
  { key: "sky", hex: "#75aef4", rgb: "117, 174, 244" },
]);
const DECLARED_ACCENTS = Object.freeze({
  red: { key: "red", hex: "#f06c65", rgb: "240, 108, 101" },
  green: { key: "green", hex: "#69c98b", rgb: "105, 201, 139" },
  blue: { key: "blue", hex: "#69aef4", rgb: "105, 174, 244" },
  yellow: { key: "yellow", hex: "#e8c65c", rgb: "232, 198, 92" },
  gold: { key: "gold", hex: "#efb85d", rgb: "239, 184, 93" },
  violet: { key: "violet", hex: "#a68cff", rgb: "166, 140, 255" },
  purple: { key: "violet", hex: "#a68cff", rgb: "166, 140, 255" },
  cyan: { key: "cyan", hex: "#58d8e8", rgb: "88, 216, 232" },
});

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Math.round(finite(value, fallback));
  return Math.max(minimum, Math.min(maximum, number));
}

function slug(value, fallback = "") {
  const normalized = text(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function titleCase(value, fallback = "") {
  const normalized = text(String(value || ""));
  if (!normalized) return fallback;
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function hashText(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableId(value = "") {
  return hashText(value).toString(36).padStart(7, "0");
}

function uniqueText(values = []) {
  const seen = new Set();
  return list(values).flatMap((value) => {
    const normalized = text(String(value || ""));
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function normalizedTruthStatus(value = "", fallback = "unreviewed") {
  const source = slug(value);
  if (["verified", "technical-verified", "source-aligned", "approved"].includes(source)) return "verified";
  if (["inferred", "source-inferred", "candidate", "proposed"].includes(source)) return "inferred";
  if (["generated-placeholder", "placeholder", "scaffold"].includes(source)) return "generated-placeholder";
  if (["missing", "unavailable", "none"].includes(source)) return "missing";
  return source || fallback;
}

function truthLabel(status = "unreviewed") {
  if (status === "verified") return "Source-backed";
  if (status === "inferred") return "Inferred — review pending";
  if (status === "generated-placeholder") return "Generated placeholder — review required";
  if (status === "missing") return "Source unavailable";
  return "Unreviewed source projection";
}

function projectSongId(project = {}) {
  return text(project.song_id || project.songId || project.id);
}

function projectSongTitle(project = {}) {
  return text(project.song_title || project.songTitle || project.title, "Untitled Echo song");
}

function projectDuration(project = {}) {
  const declared = finite(project.duration ?? project.durationSeconds, 0);
  if (declared > 0) return declared;
  return list(project.timeline)
    .reduce((maximum, shot) => Math.max(maximum, finite(shot?.end_sec ?? shot?.endSeconds, 0)), 0);
}

function projectTruth(project = {}) {
  const provenance = object(project.provenance);
  const sourceStatus = text(
    provenance.status
    || project.truth_status
    || project.truthStatus
    || project.decision_evidence?.truthStatus
  );
  const status = normalizedTruthStatus(sourceStatus);
  return {
    status,
    label: truthLabel(status),
    sourceStatus: sourceStatus || null,
    reviewStatus: text(project.review_status || project.reviewStatus) || null,
    canonClaimed: false,
  };
}

function projectPerspectiveValue(input = {}) {
  if (typeof input === "string") return input;
  return text(
    input.perspective
    || input.performancePerspective?.name
    || input.performancePerspective?.avatarName
    || input.avatar_name
    || input.avatarName
  );
}

export function unwrapEchoDirectorProject(payload = null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const candidates = [
    payload.music_video_project,
    payload.project?.music_video_project,
    payload.detail?.music_video_project,
    payload.project,
    payload.detail,
    payload,
  ];
  return candidates.find((candidate) => (
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && projectSongId(candidate)
  )) || null;
}

export function echoRecordPerspectiveToken(input = {}) {
  const declared = projectPerspectiveValue(input);
  const id = slug(declared, "unassigned");
  const declaredKey = Object.keys(DECLARED_ACCENTS).find((key) => (
    id === key || id.startsWith(`${key}-`) || id.endsWith(`-${key}`)
  ));
  const accent = declaredKey
    ? DECLARED_ACCENTS[declaredKey]
    : ACCENTS[hashText(id) % ACCENTS.length];
  return {
    id,
    label: titleCase(declared, "Unassigned perspective"),
    accentKey: accent.key,
    accentHex: accent.hex,
    accentRgb: accent.rgb,
    cssToken: `echo-record-accent-${accent.key}`,
    truthStatus: declared ? "source-declared" : "missing",
  };
}

export function resolveEchoRecordMediaUri(value = "", apiBase = "") {
  const source = text(String(value || ""));
  if (!source || /^(?:javascript|vbscript):/i.test(source)) return "";
  const base = text(String(apiBase || "")).replace(/\/+$/, "");
  const localPath = localMediaPath(source);
  if (localPath) return localFileApiUri(source, base);
  if (/^data:/i.test(source)) {
    return /^data:(?:image|video|audio)\//i.test(source) ? source : "";
  }
  if (/^(?:https?:|blob:)/i.test(source)) return source;
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return "";
  const route = source.startsWith("/") ? source : `/${source.replace(/^\.?\//, "")}`;
  return base ? `${base}${route}` : route;
}

export function inferEchoRecordMediaKind(value = "", declared = "") {
  const normalizedDeclared = slug(declared);
  if (["video", "image", "audio", "model"].includes(normalizedDeclared)) return normalizedDeclared;
  const uri = text(String(value || "")).split(/[?#]/)[0].toLowerCase();
  if (/\.(?:mp4|mov|m4v|webm|mkv|avi)$/.test(uri) || /^data:video\//.test(uri)) return "video";
  if (/\.(?:png|jpe?g|webp|gif|avif|heic|svg)$/.test(uri) || /^data:image\//.test(uri)) return "image";
  if (/\.(?:mp3|wav|m4a|aac|flac|ogg)$/.test(uri) || /^data:audio\//.test(uri)) return "audio";
  if (/\.(?:glb|gltf|fbx|obj|usdz)$/.test(uri)) return "model";
  return "unknown";
}

export function normalizeEchoRecordProject(payload = null) {
  const project = unwrapEchoDirectorProject(payload);
  if (!project) return null;
  const songId = projectSongId(project);
  const durationSeconds = projectDuration(project);
  const timelineCount = Array.isArray(project.timeline)
    ? project.timeline.length
    : Math.max(0, finite(project.timeline_count ?? project.timelineCount, 0));
  const visualizerCount = Array.isArray(project.visualizer_timeline)
    ? project.visualizer_timeline.length
    : Math.max(0, finite(project.visualizer_timeline_count ?? project.visualizerTimelineCount, 0));
  const audioUri = resolveEchoRecordMediaUri(
    project.audio_uri
    || project.audioUri
    || project.audio?.uri
  );
  const coverUri = resolveEchoRecordMediaUri(
    project.cover_uri
    || project.coverUri
    || project.poster_uri
    || project.posterUri
  );
  const detailHydrated = Array.isArray(project.timeline);
  return {
    schemaVersion: ECHO_RECORD_GARDEN_SCHEMA,
    id: `echo-record:${songId}`,
    songId,
    title: projectSongTitle(project),
    durationSeconds,
    perspective: echoRecordPerspectiveToken(project),
    avatar: {
      id: text(project.avatar_id || project.avatarId) || null,
      name: text(project.avatar_name || project.avatarName) || null,
      relationshipTruth: project.avatar_id || project.avatarId ? "source-declared-id" : "name-only",
    },
    audio: {
      id: text(project.registry_track_id || project.registryTrackId || project.audio_id || project.audioId) || null,
      uri: audioUri,
      availability: audioUri ? "routable" : project.audio_id || project.audioId ? "route-id-only" : "missing",
    },
    cover: {
      uri: coverUri,
      kind: inferEchoRecordMediaKind(coverUri, "image"),
      availability: coverUri ? "routable" : "missing",
    },
    director: {
      detailHydrated,
      timelineCount,
      visualizerCount,
      directionCutCount: Array.isArray(project.direction_script_variants)
        ? project.direction_script_variants.length
        : Math.max(0, finite(project.direction_script_variant_count ?? project.directionScriptVariantCount, 0)),
      updatedAt: text(project.updated_at || project.updatedAt) || null,
    },
    truth: projectTruth(project),
    provenance: {
      ...object(project.provenance),
      sourceKind: detailHydrated ? "echo-director-detail" : "echo-director-summary",
      sourceSongId: songId,
    },
  };
}

export function normalizeEchoRecordSummaryRows(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : list(rows?.projects || rows?.records);
  const records = new Map();
  const order = [];
  for (const row of sourceRows) {
    const record = normalizeEchoRecordProject(row);
    if (!record) continue;
    const previous = records.get(record.songId);
    if (!previous) {
      records.set(record.songId, record);
      order.push(record.songId);
      continue;
    }
    const nextScore = Number(record.director.detailHydrated) * 1000 + record.director.timelineCount;
    const previousScore = Number(previous.director.detailHydrated) * 1000 + previous.director.timelineCount;
    if (nextScore > previousScore) records.set(record.songId, record);
  }
  return order.map((songId) => records.get(songId));
}

function normalizedShot(shot = {}, index = 0, apiBase = "") {
  const startSeconds = finite(shot.start_sec ?? shot.startSeconds ?? shot.start, NaN);
  const endSeconds = finite(shot.end_sec ?? shot.endSeconds ?? shot.end, NaN);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) {
    return null;
  }
  const mediaContract = object(shot.media_contract || shot.mediaContract);
  const uri = resolveEchoRecordMediaUri(
    mediaContract.runtimeUri
    || mediaContract.runtime_uri
    || shot.runtime_media_uri
    || shot.runtimeMediaUri
    || shot.media_uri
    || shot.mediaUri,
    apiBase
  );
  const posterUri = resolveEchoRecordMediaUri(
    mediaContract.posterUri
    || mediaContract.poster_uri
    || shot.media_thumbnail
    || shot.mediaThumbnail
    || shot.poster_uri
    || shot.posterUri,
    apiBase
  );
  const sourceStatus = text(
    shot.decision_evidence?.truthStatus
    || shot.decisionEvidence?.truthStatus
    || shot.semantic_casting?.selected?.semanticTruth
    || shot.semanticCasting?.selected?.semanticTruth
  );
  const status = normalizedTruthStatus(sourceStatus);
  return {
    id: text(shot.id || shot.shot_id || shot.media_id || shot.mediaId, `director-shot-${index + 1}`),
    index,
    startSeconds,
    endSeconds,
    durationSeconds: endSeconds - startSeconds,
    title: text(shot.media_title || shot.mediaTitle || shot.section_label || shot.sectionLabel, `Shot ${index + 1}`),
    section: text(shot.section_label || shot.sectionLabel || shot.section_id || shot.sectionId) || null,
    media: {
      id: text(shot.media_id || shot.mediaId) || null,
      uri,
      posterUri,
      kind: inferEchoRecordMediaKind(uri, mediaContract.type || shot.media_type || shot.mediaType),
      contentHash: text(
        mediaContract.contentHash
        || mediaContract.sourceHash
        || shot.media_sha256
        || shot.mediaSha256
      ) || null,
      availability: uri ? "routable" : "missing",
    },
    truth: {
      status,
      label: truthLabel(status),
      sourceStatus: sourceStatus || null,
      confidence: Number.isFinite(Number(shot.confidence)) ? Number(shot.confidence) : null,
      canonClaimed: false,
    },
    provenance: {
      mediaCardId: text(shot.media_card_id || shot.mediaCardId) || null,
      mediaCardKind: text(shot.media_card_kind || shot.mediaCardKind) || null,
      mediaCardRef: text(shot.media_card_ref || shot.mediaCardRef) || null,
      decisionEvidence: shot.decision_evidence || shot.decisionEvidence || null,
    },
  };
}

function clockWithinDuration(clockSeconds = 0, durationSeconds = 0) {
  const clock = finite(clockSeconds, 0);
  if (!(durationSeconds > 0)) return Math.max(0, clock);
  return ((clock % durationSeconds) + durationSeconds) % durationSeconds;
}

export function selectEchoRecordDirectorShots(projectPayload = null, clockSeconds = 0) {
  const project = unwrapEchoDirectorProject(projectPayload);
  const durationSeconds = projectDuration(project || {});
  const clock = clockWithinDuration(clockSeconds, durationSeconds);
  const timeline = list(project?.timeline)
    .map((shot, index) => normalizedShot(shot, index))
    .filter(Boolean)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.index - right.index);
  const currentIndex = timeline.findIndex((shot) => clock >= shot.startSeconds && clock < shot.endSeconds);
  const current = currentIndex >= 0 ? timeline[currentIndex] : null;
  let nextIndex = -1;
  if (timeline.length) {
    nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % timeline.length
      : timeline.findIndex((shot) => shot.startSeconds > clock);
    if (nextIndex < 0) nextIndex = 0;
  }
  return {
    songId: projectSongId(project || {}) || null,
    durationSeconds,
    clockSeconds: clock,
    current,
    next: nextIndex >= 0 ? timeline[nextIndex] : null,
    currentIndex,
    nextIndex,
    timelineCount: timeline.length,
    truth: {
      currentIsTimelineBound: Boolean(current),
      clockWrapped: finite(clockSeconds, 0) !== clock,
    },
  };
}

function visualSurface({
  id,
  role,
  sourceType,
  sourceId,
  songId,
  title,
  subtitle = "",
  uri = "",
  posterUri = "",
  kind = "",
  truth = {},
  provenance = {},
}) {
  const normalizedUri = text(uri);
  const normalizedTruth = object(truth);
  const status = normalizedTruthStatus(normalizedTruth.status || normalizedTruth.sourceStatus);
  return {
    schemaVersion: ECHO_RECORD_VISUAL_SURFACE_SCHEMA,
    id,
    role,
    sourceType,
    sourceId: sourceId || null,
    songId: songId || null,
    title: text(title, "Untitled visual"),
    subtitle: text(subtitle),
    media: {
      uri: normalizedUri,
      posterUri: text(posterUri),
      kind: inferEchoRecordMediaKind(normalizedUri, kind),
      availability: normalizedUri ? "routable" : "missing",
    },
    interactive: Boolean(normalizedUri),
    truth: {
      ...normalizedTruth,
      status,
      label: normalizedTruth.label || truthLabel(status),
      canonClaimed: false,
    },
    provenance: object(provenance),
  };
}

function shotSurface(shot, role, project, apiBase = "") {
  if (!shot) return null;
  const uri = resolveEchoRecordMediaUri(shot.media?.uri, apiBase);
  if (!uri) return null;
  return visualSurface({
    id: `echo-surface:${projectSongId(project)}:${role}:${shot.index}`,
    role,
    sourceType: "director-shot",
    sourceId: shot.id,
    songId: projectSongId(project),
    title: shot.title,
    subtitle: role === "now-playing" ? "Playing now" : "Up next",
    uri,
    posterUri: resolveEchoRecordMediaUri(shot.media.posterUri, apiBase),
    kind: shot.media.kind,
    truth: shot.truth,
    provenance: {
      ...shot.provenance,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      contentHash: shot.media.contentHash,
    },
  });
}

function referenceCardsFrom(value = []) {
  if (Array.isArray(value)) return value;
  return list(value?.cards || value?.referenceCards);
}

function referenceSongIds(card = {}) {
  return uniqueText([
    card.songId,
    card.song_id,
    ...list(card.songIds || card.song_ids),
    ...list(card.occurrences || card.referenceAtlas?.occurrences).map((occurrence) => occurrence?.songId || occurrence?.song_id),
    card.target?.songId,
  ]);
}

function referenceSurface(card = {}, project = {}, index = 0, apiBase = "") {
  const songId = projectSongId(project);
  const explicitSongIds = referenceSongIds(card);
  if (explicitSongIds.length && !explicitSongIds.includes(songId)) return null;
  const uri = resolveEchoRecordMediaUri(
    card.videoUri
    || card.video_uri
    || card.videoSources?.[0]?.uri
    || card.presentationMedia?.loopVideo?.uri
    || card.presentationMedia?.loopVideo?.runtimeUri
    || card.imageUri
    || card.image
    || card.poster
    || card.presentationMedia?.image?.uri,
    apiBase
  );
  if (!uri) return null;
  const posterUri = resolveEchoRecordMediaUri(
    card.imageUri
    || card.image
    || card.poster
    || card.videoSources?.[0]?.posterUri
    || card.presentationMedia?.image?.uri,
    apiBase
  );
  const authority = object(card.referenceAtlas?.authority || card.authority);
  const status = normalizedTruthStatus(authority.evidenceClass || authority.reviewStatus);
  const sourceId = text(card.referenceCardId || card.referenceAtlas?.cardId || card.id, `reference-${index + 1}`);
  return visualSurface({
    id: `echo-surface:${songId}:reference:${slug(sourceId, String(index + 1))}`,
    role: "reference",
    sourceType: "echo-reference-card",
    sourceId,
    songId,
    title: card.title || card.name,
    subtitle: card.subtitle || "Echo Reference Card",
    uri,
    posterUri,
    kind: inferEchoRecordMediaKind(uri),
    truth: {
      status,
      label: truthLabel(status),
      reviewStatus: text(authority.reviewStatus) || null,
      evidenceClass: text(authority.evidenceClass) || null,
      canonStatus: text(authority.canonStatus) || null,
      scope: explicitSongIds.length ? "source-declared-song" : "caller-scoped",
    },
    provenance: {
      referenceRevisionId: text(card.referenceAtlas?.revisionId || card.revisionId) || null,
      sourceKind: text(card.sourceKind, "echo-reference-atlas"),
      citations: list(card.referenceAtlas?.citations),
    },
  });
}

function avatarNames(avatar = {}) {
  return uniqueText([
    avatar.id,
    avatar.primaryName,
    avatar.name,
    ...list(avatar.aliases),
    ...list(avatar.names).map((entry) => typeof entry === "string" ? entry : entry?.name),
  ]);
}

function matchingAvatar(project = {}, avatars = []) {
  const targetId = slug(project.avatar_id || project.avatarId);
  const targetNames = uniqueText([
    project.avatar_name,
    project.avatarName,
    project.perspective,
  ]).map((value) => slug(value));
  return list(avatars).find((avatar) => {
    const names = avatarNames(avatar).map((value) => slug(value));
    return Boolean(
      (targetId && names.includes(targetId))
      || targetNames.some((name) => names.includes(name))
    );
  }) || null;
}

function bestAvatarAsset(avatar = {}) {
  return list(avatar.assets)
    .map((asset, index) => {
      const uri = text(asset?.uri || asset?.runtimeUri || asset?.metadata?.thumbnailUri || asset?.metadata?.thumbnail?.uri);
      const kind = inferEchoRecordMediaKind(uri, asset?.type);
      const preferred = kind === "video" ? 100 : kind === "image" ? 50 : 0;
      const identity = /dossier|character|portrait|full.?body|hero/i.test([
        asset?.requirementId,
        asset?.name,
        ...(asset?.tags || []),
      ].join(" ")) ? 20 : 0;
      return { asset, index, uri, kind, score: preferred + identity };
    })
    .filter((candidate) => candidate.uri && ["video", "image"].includes(candidate.kind))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0] || null;
}

function avatarSurface(avatar = null, project = {}, apiBase = "") {
  const selected = avatar && bestAvatarAsset(avatar);
  if (!avatar || !selected) return null;
  const uri = resolveEchoRecordMediaUri(selected.uri, apiBase);
  if (!uri) return null;
  const asset = selected.asset;
  return visualSurface({
    id: `echo-surface:${projectSongId(project)}:character:${slug(avatar.id || avatar.primaryName, "avatar")}`,
    role: "character",
    sourceType: "avatar-card",
    sourceId: avatar.id,
    songId: projectSongId(project),
    title: avatar.primaryName || avatar.name,
    subtitle: "Character attached by source name match",
    uri,
    posterUri: resolveEchoRecordMediaUri(asset.metadata?.thumbnailUri || asset.metadata?.thumbnail?.uri, apiBase),
    kind: selected.kind,
    truth: {
      status: "inferred",
      label: "Name-matched Avatar — review relationship",
      relationship: "project-avatar-name-match",
      assetAttachment: asset.processing?.attachedToCard === true ? "attached" : "source-asset",
    },
    provenance: {
      avatarId: avatar.id || null,
      assetId: asset.id || null,
      assetSource: asset.source || null,
    },
  });
}

function sceneSongIds(scene = {}) {
  return uniqueText([
    scene.songId,
    scene.song_id,
    ...list(scene.songIds || scene.song_ids),
    ...list(scene.playlist).map((entry) => typeof entry === "string"
      ? entry
      : entry?.songId || entry?.song_id || entry?.id),
  ]);
}

function sceneMatches(scene = {}, project = {}, avatar = null) {
  const songId = projectSongId(project);
  if (sceneSongIds(scene).includes(songId)) return true;
  const avatarId = text(avatar?.id || project.avatar_id || project.avatarId);
  return Boolean(
    avatarId
    && list(scene.avatarTags || scene.avatar_tags).some((tag) => (
      text(tag?.avatarId || tag?.avatar_id) === avatarId
    ))
  );
}

function bestSceneAsset(scene = {}) {
  return list(scene.assets || scene.mediaAssets || scene.media)
    .map((asset, index) => {
      const uri = text(asset?.uri || asset?.runtimeUri || asset?.metadata?.thumbnailUri || asset?.metadata?.thumbnail?.uri);
      const kind = inferEchoRecordMediaKind(uri, asset?.type);
      return { asset, index, uri, kind, score: kind === "video" ? 100 : kind === "image" ? 50 : 0 };
    })
    .filter((candidate) => candidate.uri && ["video", "image"].includes(candidate.kind))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0] || null;
}

function sceneSurface(scene = {}, project = {}, index = 0, apiBase = "") {
  const selected = bestSceneAsset(scene);
  if (!selected) return null;
  const uri = resolveEchoRecordMediaUri(selected.uri, apiBase);
  if (!uri) return null;
  const status = normalizedTruthStatus(scene.canonStatus || scene.canon_status);
  return visualSurface({
    id: `echo-surface:${projectSongId(project)}:scene:${slug(scene.id || scene.title, String(index + 1))}`,
    role: "scene",
    sourceType: "scene-card",
    sourceId: scene.id,
    songId: projectSongId(project),
    title: scene.title,
    subtitle: scene.summary,
    uri,
    posterUri: resolveEchoRecordMediaUri(
      selected.asset.metadata?.thumbnailUri || selected.asset.metadata?.thumbnail?.uri,
      apiBase
    ),
    kind: selected.kind,
    truth: {
      status,
      label: truthLabel(status),
      canonStatus: text(scene.canonStatus || scene.canon_status) || null,
      matchBasis: sceneSongIds(scene).includes(projectSongId(project)) ? "playlist-song-id" : "avatar-tag",
    },
    provenance: {
      sceneId: scene.id || null,
      placeId: scene.placeId || scene.place_id || null,
      assetId: selected.asset.id || null,
    },
  });
}

export function buildEchoRecordVisualSurfaces({
  project: projectPayload,
  referenceCards = [],
  avatars = [],
  sceneGraph = {},
  clockSeconds = 0,
  limit = 8,
  apiBase = "",
} = {}) {
  const project = unwrapEchoDirectorProject(projectPayload);
  if (!project) return [];
  const boundedLimit = clampInteger(limit, 8, 1, MAX_VISUAL_SURFACES);
  const selection = selectEchoRecordDirectorShots(project, clockSeconds);
  const timelineSurfaces = [
    shotSurface(selection.current, "now-playing", project, apiBase),
    shotSurface(selection.next, "up-next", project, apiBase),
  ].filter(Boolean);
  const avatar = matchingAvatar(project, avatars);
  const character = avatarSurface(avatar, project, apiBase);
  const references = referenceCardsFrom(referenceCards)
    .map((card, index) => referenceSurface(card, project, index, apiBase))
    .filter(Boolean);
  const scenes = list(sceneGraph?.scenes || sceneGraph)
    .filter((scene) => sceneMatches(scene, project, avatar))
    .map((scene, index) => sceneSurface(scene, project, index, apiBase))
    .filter(Boolean);
  const prioritized = [
    ...timelineSurfaces,
    character,
    references[0],
    scenes[0],
    ...references.slice(1),
    ...scenes.slice(1),
  ].filter(Boolean);
  const seen = new Set();
  return prioritized.filter((surface) => {
    const key = `${surface.sourceType}:${surface.sourceId || surface.id}:${surface.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, boundedLimit);
}

export function echoRecordVinylSpinRadians(clockSeconds = 0, options = {}) {
  const rpm = finite(options.rpm, ECHO_RECORD_RPM);
  const phaseRadians = finite(options.phaseRadians, 0);
  const raw = finite(clockSeconds, 0) * (rpm / 60) * TAU + phaseRadians;
  if (options.normalize === false) return raw;
  return ((raw % TAU) + TAU) % TAU;
}

function finiteVector(value = null) {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? [value.x, value.y, value.z]
      : [];
  if (source.length !== 3 || source.some((entry) => !Number.isFinite(Number(entry)))) return null;
  return source.map((entry) => Number(entry));
}

export function normalizeEchoRecordGardenSnapshot(value = {}) {
  const source = object(value);
  const selection = object(source.selection);
  const playback = object(source.playback);
  const camera = object(source.camera || source.scene?.camera);
  const perspective = text(selection.perspective || source.perspective, "all").toLowerCase();
  return {
    schemaVersion: ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
    selectedSongId: text(selection.selectedSongId || source.selectedSongId || source.lastSongId),
    placedSongId: text(selection.placedSongId || source.placedSongId),
    selectedVisualId: text(selection.selectedVisualId || source.selectedVisualId),
    perspective: ["all", "red", "blue", "green"].includes(perspective) ? perspective : "all",
    muted: playback.muted === undefined ? source.muted !== false : playback.muted !== false,
    playbackSeconds: Math.max(0, finite(playback.seconds ?? source.playbackSeconds, 0)),
    camera: {
      position: finiteVector(camera.position),
      target: finiteVector(camera.target),
    },
    persistedAt: text(source.persistedAt) || null,
  };
}

export function buildLocalEchoRecordCardProjection({
  visual,
  project: projectPayload,
  clockSeconds = 0,
} = {}) {
  const project = unwrapEchoDirectorProject(projectPayload);
  if (!visual?.id || !project) return null;
  const songId = projectSongId(project);
  const sourceUri = text(visual.media?.uri);
  const sourceKey = [
    songId,
    visual.id,
    visual.sourceType,
    visual.sourceId,
    sourceUri,
  ].join("|");
  const cardId = `echo-record-local-card:${stableId(sourceKey)}`;
  return {
    schemaVersion: ECHO_RECORD_LOCAL_CARD_SCHEMA,
    id: cardId,
    cardType: "reference_card",
    status: "local-preview",
    title: visual.title,
    subtitle: `Echo Record Garden · ${projectSongTitle(project)}`,
    summary: visual.subtitle || `Local Card projection from ${visual.sourceType}.`,
    imageUri: visual.media?.kind === "image"
      ? sourceUri
      : text(visual.media?.posterUri),
    videoUri: visual.media?.kind === "video" ? sourceUri : "",
    videoSources: visual.media?.kind === "video" ? [{
      uri: sourceUri,
      posterUri: text(visual.media?.posterUri),
      status: "local-preview",
    }] : [],
    tags: uniqueText([
      "echo-record-garden",
      "local-card-preview",
      visual.role,
      visual.sourceType,
      songId,
    ]),
    sourceVisual: {
      id: visual.id,
      sourceType: visual.sourceType,
      sourceId: visual.sourceId || null,
      role: visual.role,
      truth: object(visual.truth),
    },
    playback: {
      songId,
      clockSeconds: Math.max(0, finite(clockSeconds, 0)),
    },
    persistence: {
      status: "not-persisted",
      durable: false,
      minted: false,
      edition: null,
      originCore: null,
      message: "This is a local printed-card projection. No Card was persisted or minted.",
    },
    authority: {
      status: "projection-only",
      canonPromotion: false,
      publicActivation: false,
      requiresExplicitSave: true,
    },
    lineage: {
      sourceSongId: songId,
      sourceProjectUpdatedAt: text(project.updated_at || project.updatedAt) || null,
      sourceVisualProvenance: object(visual.provenance),
      sourceProjectProvenance: object(project.provenance),
    },
  };
}
