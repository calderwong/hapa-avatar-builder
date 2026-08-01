import {
  deriveEchoDirectionVariantProject,
  echoDirectionVariantDeclaredFingerprint,
} from "./echo-direction-variants.js";
import { localFileApiUri, localMediaPath } from "./local-media-uri.js";

export const ECHO_RECORD_GARDEN_SCHEMA = "hapa.echo-record-garden.record.v1";
export const ECHO_RECORD_VISUAL_SURFACE_SCHEMA = "hapa.echo-record-garden.visual-surface.v1";
export const ECHO_RECORD_LOCAL_CARD_SCHEMA = "hapa.echo-record-garden.local-card-projection.v1";
export const ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA = "hapa.echo-record-garden.snapshot.v2";
export const ECHO_RECORD_GARDEN_LEGACY_SNAPSHOT_SCHEMA = "hapa.echo-record-garden.snapshot.v1";
export const ECHO_RECORD_SOURCE_COVERAGE_SCHEMA = "hapa.echo-record-garden.source-coverage.v1";
export const ECHO_RECORD_RPM = 100 / 3;
// A full-disc moving video makes literal 33⅓ RPM read much faster than a
// mostly symmetric vinyl surface. Keep the display clock-derived, but slow the
// presentation spin so it has the perceived weight of a record on a table.
export const ECHO_RECORD_DISPLAY_RPM = ECHO_RECORD_RPM / 4;

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

function normalizeRightsBoundary(value = {}) {
  const source = object(value?.rightsAndPrivacy || value?.rights || value);
  const licenseStatus = text(source.licenseStatus || source.licensingStatus, "unknown");
  const consentStatus = text(source.consentStatus, "unknown");
  const visibility = text(source.visibility, "private");
  const publicProjectionAllowed = source.publicProjectionAllowed === true;
  const attribution = list(source.attribution || source.attributions)
    .map((entry) => typeof entry === "string" ? text(entry) : text(entry?.label || entry?.name || entry?.url))
    .filter(Boolean);
  const declared = [
    source.licenseStatus,
    source.licensingStatus,
    source.consentStatus,
    source.visibility,
    source.publicProjectionAllowed,
  ].some((entry) => entry !== undefined);
  return {
    status: declared ? "source-declared" : "unknown",
    licenseStatus,
    consentStatus,
    visibility,
    publicProjectionAllowed,
    attribution: uniqueText(attribution),
    ownershipClaimed: false,
  };
}

function explicitVocalMode(project = {}) {
  const declared = slug(
    project.vocal_mode
    || project.vocalMode
    || project.performance_mode
    || project.performanceMode
  );
  if (project.instrumental === true || project.is_instrumental === true || declared === "instrumental") {
    return { mode: "instrumental", truthStatus: "source-declared" };
  }
  if (project.instrumental === false || project.is_instrumental === false || ["vocal", "vocals", "sung", "spoken"].includes(declared)) {
    return { mode: "vocal", truthStatus: "source-declared" };
  }
  return { mode: "unspecified", truthStatus: "missing" };
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

function directionVariantId(variant = {}) {
  return text(
    variant.id
    || variant.variantId
    || variant.variant_id
    || variant.cutId
    || variant.cut_id
  );
}

function directionVariantTitle(variant = {}) {
  return text(
    variant.title
    || variant.name
    || variant.label
    || variant.cutTitle
    || variant.cut_title,
    directionVariantId(variant) || "Director cut"
  );
}

function directionVariantTimestamp(variant = {}) {
  const sources = [
    variant.updatedAt,
    variant.updated_at,
    variant.createdAt,
    variant.created_at,
    variant.lineage?.createdAt,
    variant.lineage?.created_at,
  ].map((value) => text(value)).filter(Boolean);
  for (const source of sources) {
    const timestamp = Date.parse(source);
    if (Number.isFinite(timestamp)) {
      return {
        iso: new Date(timestamp).toISOString(),
        milliseconds: timestamp,
      };
    }
  }
  return { iso: null, milliseconds: Number.NEGATIVE_INFINITY };
}

function isLegacyDirectionVariant(variant = {}) {
  return /(?:^|[\s:_-])(legacy|baseline)(?:$|[\s:_-])/i.test([
    directionVariantId(variant),
    directionVariantTitle(variant),
    variant.packageName,
    variant.package_name,
  ].filter(Boolean).join(" "));
}

export function isLegacyEchoRecordDirectionVariant(variant = {}) {
  return isLegacyDirectionVariant(variant);
}

const READY_DIRECTION_VARIANT_STATUSES = new Set([
  "available",
  "complete",
  "completed",
  "ready",
  "rendered",
  "saved",
]);

function directionVariantStatus(variant = {}) {
  return slug(variant.status || variant.state || variant.readinessStatus || variant.readiness_status);
}

function directionVariants(project = {}) {
  const candidates = list(
    project.direction_script_variant_summaries
    || project.directionScriptVariantSummaries
    || project.direction_script_variants
    || project.directionScriptVariants
  );
  return candidates.filter((variant) => (
    variant
    && typeof variant === "object"
    && directionVariantId(variant)
    && !["failed", "error", "blocked", "incomplete"].includes(directionVariantStatus(variant))
    && Math.max(0, finite(
      variant.timelineCount
      ?? variant.timeline_count
      ?? (Array.isArray(variant.timeline) ? variant.timeline.length : 0),
      0
    )) > 0
  ));
}

export function selectLatestEchoDirectionScriptVariant(projectPayload = null) {
  const project = unwrapEchoDirectorProject(projectPayload);
  if (!project) return null;
  const candidates = directionVariants(project);
  const nonLegacy = candidates.filter((variant) => !isLegacyDirectionVariant(variant));
  const ready = nonLegacy.filter((variant) => (
    READY_DIRECTION_VARIANT_STATUSES.has(directionVariantStatus(variant))
  ));
  const eligible = ready.length ? ready : nonLegacy;
  if (!eligible.length) return null;
  const ranked = eligible.map((variant, index) => {
    const timestamp = directionVariantTimestamp(variant);
    return {
      variant,
      index,
      timestamp,
      id: directionVariantId(variant),
    };
  }).sort((left, right) => (
    right.timestamp.milliseconds - left.timestamp.milliseconds
    || right.id.localeCompare(left.id)
    || right.index - left.index
  ));
  const selected = ranked[0];
  const variant = selected.variant;
  const status = directionVariantStatus(variant);
  const tiedLatestCount = ranked.filter((candidate) => (
    candidate.timestamp.milliseconds === selected.timestamp.milliseconds
  )).length;
  return {
    id: selected.id,
    title: directionVariantTitle(variant),
    createdAt: directionVariantTimestamp({
      createdAt: variant.createdAt || variant.created_at || variant.lineage?.createdAt || variant.lineage?.created_at,
    }).iso,
    updatedAt: selected.timestamp.iso,
    timelineCount: Math.max(0, Math.round(finite(
      variant.timelineCount
      ?? variant.timeline_count
      ?? (Array.isArray(variant.timeline) ? variant.timeline.length : 0),
      0
    ))),
    fingerprint: text(variant.fingerprint || variant.contentHash || variant.content_hash) || null,
    strategy: "most-recent-non-legacy",
    selectionBasis: ready.length
      ? "latest-ready-non-legacy"
      : "latest-nonfailed-non-legacy",
    status: status || null,
    readinessDeclared: Boolean(status),
    tieBreak: tiedLatestCount > 1
      ? "stable-variant-id"
      : selected.timestamp.iso
        ? "effective-timestamp"
        : "stable-variant-id-without-timestamp",
    candidateCount: eligible.length,
    tiedLatestCount,
    legacy: false,
  };
}

export function projectEchoRecordSelectedDirectorCut(projectPayload = null) {
  const project = unwrapEchoDirectorProject(projectPayload);
  if (!project) return null;
  const selectedId = text(
    project.selected_direction_script_variant_id
    || project.selectedDirectionScriptVariantId
  );
  if (!selectedId) return project;
  const selectedVariant = list(
    project.direction_script_variants
    || project.directionScriptVariants
  ).find((variant) => directionVariantId(variant) === selectedId);
  if (!selectedVariant || isLegacyDirectionVariant(selectedVariant) || !Array.isArray(selectedVariant.timeline) || !selectedVariant.timeline.length) {
    return project;
  }
  const projected = deriveEchoDirectionVariantProject(project, selectedVariant);
  const activeCut = object(projected.active_direction_script_variant);
  if (text(activeCut.id) !== selectedId) return project;
  const selectedTimestamp = directionVariantTimestamp(selectedVariant);
  const selectedTitle = activeCut.title || directionVariantTitle(selectedVariant);
  const selectedFingerprint = text(
    activeCut.fingerprint
    || selectedVariant.fingerprint
    || selectedVariant.contentHash
    || selectedVariant.content_hash
  ) || null;
  const sourceDeclaredFingerprint = text(
    echoDirectionVariantDeclaredFingerprint(selectedVariant)
  ) || null;
  return {
    ...projected,
    selected_direction_script_variant_id: selectedId,
    revision_id: selectedFingerprint || selectedId,
    updated_at: selectedTimestamp.iso || project.updated_at || project.updatedAt || null,
    echo_record_garden_director_cut: {
      id: selectedId,
      title: selectedTitle,
      updatedAt: selectedTimestamp.iso,
      fingerprint: selectedFingerprint,
      sourceDeclaredFingerprint,
      strategy: "most-recent-non-legacy",
      selectionBasis: "exact-variant-id",
      durationProjection: activeCut.durationProjection || null,
      projectionValidation: activeCut.projectionValidation || null,
      legacy: false,
    },
    provenance: {
      ...object(projected.provenance),
      directorCutId: selectedId,
      directorCutTitle: selectedTitle,
      directorCutFingerprint: selectedFingerprint,
      directorCutSourceDeclaredFingerprint: sourceDeclaredFingerprint,
      directorCutSelection: "most-recent-non-legacy",
    },
  };
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
  if (["video", "image", "audio", "model", "generated-visualizer"].includes(normalizedDeclared)) {
    return normalizedDeclared;
  }
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
  const sourceKind = detailHydrated ? "echo-director-detail" : "echo-director-summary";
  const timedLyricCueCount = Array.isArray(project.timed_lyrics)
    ? project.timed_lyrics.length
    : Math.max(0, finite(project.timed_lyric_count ?? project.timedLyricCount, 0));
  const vocalProfile = explicitVocalMode(project);
  const sourceRevisionId = text(
    project.revision_id
    || project.revisionId
    || project.updated_at
    || project.updatedAt
    || project.provenance?.revisionId
  ) || null;
  const stableRecordId = `echo-record:${songId}`;
  const latestCut = selectLatestEchoDirectionScriptVariant(project);
  return {
    schemaVersion: ECHO_RECORD_GARDEN_SCHEMA,
    id: stableRecordId,
    songId,
    title: projectSongTitle(project),
    durationSeconds,
    identity: {
      stableId: stableRecordId,
      sourceId: songId,
      sourceKind: "echo-song",
      identityBasis: "source-song-id",
      titleIsIdentity: false,
      truthStatus: "source-declared",
    },
    source: {
      id: songId,
      kind: sourceKind,
      revisionId: sourceRevisionId,
      contentHash: text(project.content_hash || project.contentHash || project.provenance?.contentHash) || null,
      truthStatus: projectTruth(project).status,
    },
    rights: normalizeRightsBoundary(project),
    content: {
      vocalMode: vocalProfile.mode,
      vocalModeTruth: vocalProfile.truthStatus,
      timedLyricCueCount,
      lyricAvailability: vocalProfile.mode === "instrumental"
        ? "not-applicable-instrumental"
        : timedLyricCueCount > 0
          ? "timed"
          : "missing-or-undeclared",
    },
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
      latestCut,
      updatedAt: text(project.updated_at || project.updatedAt) || null,
    },
    truth: projectTruth(project),
    provenance: {
      ...object(project.provenance),
      sourceKind,
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
  const sourceInSeconds = Math.max(0, finite(
    mediaContract.sourceInSeconds
    ?? mediaContract.source_in_seconds
    ?? shot.source_in_seconds
    ?? shot.sourceInSeconds,
    0,
  ));
  const declaredSourceOutSeconds = finite(
    mediaContract.sourceOutSeconds
    ?? mediaContract.source_out_seconds
    ?? shot.source_out_seconds
    ?? shot.sourceOutSeconds,
    0,
  );
  const sourceOutSeconds = declaredSourceOutSeconds > sourceInSeconds
    ? declaredSourceOutSeconds
    : 0;
  const playbackMode = slug(
    mediaContract.playbackMode
    || mediaContract.playback_mode
    || shot.playback_mode
    || shot.playbackMode,
    "once",
  );
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
  const mediaCardId = text(shot.media_card_id || shot.mediaCardId);
  const evidenceCard = object(
    shot.decision_evidence?.sourceEvidence?.card
    || shot.decisionEvidence?.sourceEvidence?.card
    || shot.sourceEvidence?.card
  );
  const evidenceCardId = text(evidenceCard.id);
  const explicitAttachmentStatus = slug(
    shot.attachment_status
    || shot.attachmentStatus
    || shot.media_card_status
    || shot.mediaCardStatus
  );
  const attachmentStale = explicitAttachmentStatus === "stale"
    || status === "stale"
    || Boolean(mediaCardId && evidenceCardId && mediaCardId !== evidenceCardId);
  const attachmentFreshnessStatus = attachmentStale
    ? "stale"
    : mediaCardId && evidenceCardId === mediaCardId
      ? "evidence-matched"
      : mediaCardId
        ? "source-declared"
        : "missing";
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
      sourceInSeconds,
      sourceOutSeconds,
      sourceDurationSeconds: sourceOutSeconds > sourceInSeconds
        ? sourceOutSeconds - sourceInSeconds
        : 0,
      playbackMode,
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
      mediaCardId: mediaCardId || null,
      mediaCardKind: text(shot.media_card_kind || shot.mediaCardKind) || null,
      mediaCardRef: text(shot.media_card_ref || shot.mediaCardRef) || null,
      attachmentEvidenceCardId: evidenceCardId || null,
      attachmentFreshnessStatus,
      decisionEvidence: shot.decision_evidence || shot.decisionEvidence || null,
    },
    rights: normalizeRightsBoundary(
      shot.rightsAndPrivacy
      || shot.rights
      || mediaContract.rightsAndPrivacy
      || mediaContract.rights
    ),
  };
}

function clockWithinDuration(clockSeconds = 0, durationSeconds = 0) {
  const clock = finite(clockSeconds, 0);
  if (!(durationSeconds > 0)) return Math.max(0, clock);
  return ((clock % durationSeconds) + durationSeconds) % durationSeconds;
}

function normalizedDirectorTimeline(project = {}, apiBase = "") {
  return list(project?.timeline)
    .map((shot, index) => normalizedShot(shot, index, apiBase))
    .filter(Boolean)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.index - right.index);
}

export function selectEchoRecordDirectorShots(projectPayload = null, clockSeconds = 0) {
  const project = unwrapEchoDirectorProject(projectPayload);
  const durationSeconds = projectDuration(project || {});
  const clock = clockWithinDuration(clockSeconds, durationSeconds);
  const timeline = normalizedDirectorTimeline(project || {});
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
  rights = {},
  attachedCard = null,
  attachedCardId = "",
  cardLookupId = "",
  attachmentFreshnessStatus = "",
}) {
  const normalizedUri = text(uri);
  const normalizedTruth = object(truth);
  const normalizedKind = inferEchoRecordMediaKind(normalizedUri, kind);
  const generated = normalizedKind === "generated-visualizer";
  const status = normalizedTruthStatus(normalizedTruth.status || normalizedTruth.sourceStatus);
  const embeddedCard = attachedCard && typeof attachedCard === "object" && !Array.isArray(attachedCard)
    ? attachedCard
    : null;
  const exactCardId = text(attachedCardId || embeddedCard?.id);
  const lookupId = text(cardLookupId || exactCardId);
  const normalizedAttachmentFreshness = slug(attachmentFreshnessStatus)
    || (embeddedCard ? "source-projected" : exactCardId ? "source-declared" : "missing");
  const attachmentIsStale = normalizedAttachmentFreshness === "stale";
  const sourceRevisionId = text(
    provenance?.referenceRevisionId
    || provenance?.revisionId
    || provenance?.contentHash
  ) || null;
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
      kind: normalizedKind,
      availability: normalizedUri ? "routable" : generated ? "generated" : "missing",
    },
    interactive: Boolean(normalizedUri || generated),
    truth: {
      ...normalizedTruth,
      status,
      label: normalizedTruth.label || truthLabel(status),
      canonClaimed: false,
    },
    source: {
      id: sourceId || null,
      kind: sourceType,
      revisionId: sourceRevisionId,
      identityStatus: sourceId ? "source-declared" : "missing",
      ownershipClaimed: false,
    },
    rights: normalizeRightsBoundary(rights),
    provenance: object(provenance),
    attachment: {
      cardId: exactCardId || null,
      lookupId: lookupId || null,
      card: embeddedCard,
      identityStatus: attachmentIsStale
        ? "stale-source-card-id"
        : embeddedCard
        ? "embedded-source-card"
        : exactCardId
          ? "source-declared-card-id"
          : lookupId
            ? "source-lookup-id"
            : "unresolved",
      freshnessStatus: normalizedAttachmentFreshness,
      stale: attachmentIsStale,
    },
  };
}

function shotSurface(shot, role, project, apiBase = "") {
  if (!shot) return null;
  const uri = resolveEchoRecordMediaUri(shot.media?.uri, apiBase);
  const generatedVisualizer = shot.media?.kind === "generated-visualizer";
  if (!uri && !generatedVisualizer) return null;
  const nowPlaying = role === "now-playing" || role.startsWith("now-playing-");
  const holdingLastFrame = role === "now-playing-hold"
    || role.startsWith("now-playing-hold-");
  return visualSurface({
    id: `echo-surface:${projectSongId(project)}:${role}:${shot.index}`,
    role,
    sourceType: "director-shot",
    sourceId: shot.id,
    songId: projectSongId(project),
    title: shot.title,
    subtitle: nowPlaying && !holdingLastFrame
      ? "Playing now"
      : holdingLastFrame
        ? "Holding the last decoded Director frame"
        : role === "buffered-upcoming"
          ? "Buffered upcoming Director shot"
          : "Up next",
    uri,
    posterUri: resolveEchoRecordMediaUri(shot.media.posterUri, apiBase),
    kind: shot.media.kind,
    truth: shot.truth,
    provenance: {
      ...shot.provenance,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      sourceInSeconds: shot.media.sourceInSeconds,
      sourceOutSeconds: shot.media.sourceOutSeconds,
      sourceDurationSeconds: shot.media.sourceDurationSeconds,
      playbackMode: shot.media.playbackMode,
      holdLastFrame: holdingLastFrame,
      contentHash: shot.media.contentHash,
    },
    rights: shot.rights,
    attachedCardId: shot.provenance?.mediaCardId,
    cardLookupId: shot.provenance?.mediaCardId || shot.media?.id,
    attachmentFreshnessStatus: shot.provenance?.attachmentFreshnessStatus,
  });
}

export function buildEchoRecordDirectorWarmSurfaces({
  project: projectPayload,
  clockSeconds = 0,
  count = 6,
  apiBase = "",
} = {}) {
  const project = unwrapEchoDirectorProject(projectPayload);
  if (!project) return [];
  const timeline = normalizedDirectorTimeline(project);
  if (!timeline.length) return [];
  const selection = selectEchoRecordDirectorShots(project, clockSeconds);
  const startIndex = selection.currentIndex >= 0
    ? selection.currentIndex + 1
    : selection.nextIndex >= 0
      ? selection.nextIndex
      : 0;
  const boundedCount = clampInteger(count, 6, 0, MAX_VISUAL_SURFACES);
  const surfaces = [];
  const seen = new Set();
  for (let offset = 0; offset < timeline.length && surfaces.length < boundedCount; offset += 1) {
    const shot = timeline[(startIndex + offset) % timeline.length];
    if (!shot?.media?.uri || shot.media.kind !== "video") continue;
    const key = [
      shot.media.uri,
      shot.media.contentHash || "",
      shot.media.sourceInSeconds || 0,
      shot.media.sourceOutSeconds || 0,
      shot.startSeconds,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const surface = shotSurface(shot, "buffered-upcoming", project, apiBase);
    if (surface) surfaces.push(surface);
  }
  return surfaces;
}

function referenceCardsFrom(value = []) {
  const cards = Array.isArray(value)
    ? value
    : list(value?.cards || value?.referenceCards);
  return cards.filter((card) => card && typeof card === "object");
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
  if (!card || typeof card !== "object") return null;
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
    rights: card.rightsAndPrivacy || card.referenceAtlas?.rightsAndPrivacy,
    attachedCard: card,
    attachedCardId: card.id,
    cardLookupId: card.id,
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
    rights: avatar.rightsAndPrivacy || avatar.rights,
    attachedCardId: avatar.id,
    cardLookupId: avatar.id,
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
    rights: scene.rightsAndPrivacy || scene.rights,
    attachedCardId: scene.id,
    cardLookupId: scene.id,
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
  const timeline = normalizedDirectorTimeline(project);
  const currentShot = selection.currentIndex >= 0 ? timeline[selection.currentIndex] : null;
  let currentSurface = shotSurface(currentShot, "now-playing", project, apiBase);
  let heldShotIndex = -1;
  if (!currentSurface) {
    const priorIndex = selection.currentIndex >= 0
      ? selection.currentIndex - 1
      : timeline.reduce((latest, shot, index) => (
        shot.endSeconds <= selection.clockSeconds ? index : latest
      ), -1);
    for (let index = priorIndex; index >= 0; index -= 1) {
      if (!timeline[index]?.media?.uri) continue;
      heldShotIndex = index;
      currentSurface = shotSurface(timeline[index], "now-playing-hold", project, apiBase);
      if (currentSurface) break;
    }
  }
  const nextStartIndex = selection.currentIndex >= 0
    ? selection.currentIndex + 1
    : selection.nextIndex >= 0
      ? selection.nextIndex
      : 0;
  let nextSurface = null;
  for (let offset = 0; offset < timeline.length; offset += 1) {
    const index = (nextStartIndex + offset) % timeline.length;
    if (index === selection.currentIndex || index === heldShotIndex) continue;
    nextSurface = shotSurface(timeline[index], "up-next", project, apiBase);
    if (nextSurface) break;
  }
  const timelineSurfaces = [
    currentSurface,
    currentSurface && shotSurface(
      currentShot || timeline[heldShotIndex],
      currentSurface.role === "now-playing-hold"
        ? "now-playing-hold-left"
        : "now-playing-left",
      project,
      apiBase,
    ),
    currentSurface && shotSurface(
      currentShot || timeline[heldShotIndex],
      currentSurface.role === "now-playing-hold"
        ? "now-playing-hold-right"
        : "now-playing-right",
      project,
      apiBase,
    ),
    nextSurface,
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

export function selectEchoRecordMediaWindow(
  visuals = [],
  page = 0,
  {
    visibleCount = 3,
    warmCount = 3,
  } = {},
) {
  const source = list(visuals).filter(Boolean);
  const boundedVisibleCount = clampInteger(visibleCount, 3, 1, MAX_VISUAL_SURFACES);
  const boundedWarmCount = clampInteger(warmCount, 3, 0, MAX_VISUAL_SURFACES);
  const pageCount = Math.max(1, Math.ceil(source.length / boundedVisibleCount));
  const boundedPage = clampInteger(page, 0, 0, pageCount - 1);
  const visibleStart = boundedPage * boundedVisibleCount;
  const visible = source.slice(visibleStart, visibleStart + boundedVisibleCount);
  const identity = (visual, index) => text(
    visual?.id
    || visual?.source?.id
    || visual?.sourceId
    || visual?.media?.uri
    || visual?.mediaUri,
    `echo-record-media-${index}`,
  );
  const selected = new Set(visible.map((visual, index) => identity(visual, visibleStart + index)));
  const warm = [];
  for (
    let offset = visible.length;
    source.length > 0 && offset < source.length + visible.length && warm.length < boundedWarmCount;
    offset += 1
  ) {
    const index = (visibleStart + offset) % source.length;
    const visual = source[index];
    const key = identity(visual, index);
    if (selected.has(key)) continue;
    selected.add(key);
    warm.push(visual);
  }
  return {
    visible,
    warm,
    page: boundedPage,
    pageCount,
  };
}

function boundedCoverageState(declaredCount = 0, routableCount = 0, missingLabel = "missing") {
  if (!(declaredCount > 0)) return missingLabel;
  if (!(routableCount > 0)) return "missing-media";
  if (routableCount < declaredCount) return "partial";
  return "routable";
}

export function normalizeEchoRecordSourceCoverage({
  project: projectPayload,
  referenceCards = [],
  apiBase = "",
} = {}) {
  const project = unwrapEchoDirectorProject(projectPayload);
  const record = normalizeEchoRecordProject(projectPayload);
  if (!project || !record) return null;
  const detailHydrated = Array.isArray(project.timeline);
  const timelineInput = list(project.timeline);
  const declaredVideoCount = detailHydrated ? timelineInput.length : record.director.timelineCount;
  const shots = timelineInput
    .map((shot, index) => normalizedShot(shot, index, apiBase))
    .filter(Boolean);
  const routableShots = shots.filter((shot) => shot.media.availability === "routable");
  const references = referenceCardsFrom(referenceCards);
  const matchingReferences = references.filter((card) => {
    const explicitSongIds = referenceSongIds(card);
    return !explicitSongIds.length || explicitSongIds.includes(record.songId);
  });
  const routableReferences = matchingReferences.filter((card, index) => (
    Boolean(referenceSurface(card, project, index, apiBase))
  ));
  const declaredAttachments = shots.filter((shot) => Boolean(shot.provenance.mediaCardId));
  const staleAttachments = declaredAttachments.filter((shot) => (
    shot.provenance.attachmentFreshnessStatus === "stale"
  ));
  const attachmentState = staleAttachments.length
    ? "stale"
    : !detailHydrated && declaredVideoCount > 0
      ? "unknown-summary-only"
      : !shots.length || !declaredAttachments.length
      ? "missing"
      : declaredAttachments.length < shots.length
        ? "partial"
        : "source-declared";
  return {
    schemaVersion: ECHO_RECORD_SOURCE_COVERAGE_SCHEMA,
    recordId: record.id,
    songId: record.songId,
    identity: { ...record.identity },
    source: { ...record.source },
    rights: { ...record.rights },
    content: { ...record.content },
    audio: {
      id: record.audio.id,
      availability: record.audio.availability,
      state: record.audio.availability,
    },
    video: {
      declaredCount: declaredVideoCount,
      validTimingCount: shots.length,
      routableCount: routableShots.length,
      state: !detailHydrated && declaredVideoCount > 0
        ? "summary-count-only"
        : boundedCoverageState(declaredVideoCount, routableShots.length),
    },
    references: {
      providedCount: references.length,
      matchingCount: matchingReferences.length,
      routableCount: routableReferences.length,
      state: !references.length
        ? "missing"
        : !matchingReferences.length
          ? "missing-for-song"
          : boundedCoverageState(matchingReferences.length, routableReferences.length),
    },
    attachments: {
      declaredCount: declaredAttachments.length,
      staleCount: staleAttachments.length,
      missingCount: Math.max(0, shots.length - declaredAttachments.length),
      state: attachmentState,
      identities: shots.map((shot) => ({
        shotId: shot.id,
        cardId: shot.provenance.mediaCardId,
        lookupId: shot.provenance.mediaCardId || shot.media.id,
        freshnessStatus: shot.provenance.attachmentFreshnessStatus,
        evidenceCardId: shot.provenance.attachmentEvidenceCardId,
      })),
    },
  };
}

export function echoRecordVinylSpinRadians(clockSeconds = 0, options = {}) {
  const rpm = finite(options.rpm, ECHO_RECORD_RPM);
  const phaseRadians = finite(options.phaseRadians, 0);
  const raw = finite(clockSeconds, 0) * (rpm / 60) * TAU + phaseRadians;
  if (options.normalize === false) return raw;
  return ((raw % TAU) + TAU) % TAU;
}

export function echoRecordVideoPlaybackPlan({
  clockSeconds = 0,
  startSeconds = 0,
  durationSeconds = 0,
  sourceStartSeconds = 0,
  sourceEndSeconds = 0,
  playbackMode = "once",
  clockLocked = true,
  playbackPlaying = false,
  documentHidden = false,
  reducedMotion = false,
  videoCurrentTime = 0,
  videoDuration = 0,
  readyState = 0,
  hardSeekToleranceSeconds = 0.1,
  holdLastFrame = false,
} = {}) {
  const clock = Math.max(0, finite(clockSeconds, 0));
  const start = Math.max(0, finite(startSeconds, 0));
  const duration = Math.max(0.1, finite(durationSeconds, finite(videoDuration, 4)));
  const sourceStart = Math.max(0, finite(sourceStartSeconds, 0));
  const sourceEnd = Math.max(0, finite(sourceEndSeconds, 0));
  const sourceSpan = sourceEnd > sourceStart ? sourceEnd - sourceStart : 0;
  const loopsSource = slug(playbackMode) === "loop" && sourceSpan > 0.04;
  const currentVideoTime = Math.max(0, finite(videoCurrentTime, 0));
  const end = start + duration;
  const phase = holdLastFrame
    ? "hold"
    : !clockLocked
    ? "ambient"
    : clock < start
      ? "future"
      : clock >= end
        ? "past"
        : "active";
  const active = phase === "active" || phase === "ambient";
  const ambientElapsed = Math.max(0, clock - start);
  const elapsedInShot = Math.max(0, Math.min(duration - 0.04, clock - start));
  const activeSourceElapsed = loopsSource
    ? elapsedInShot % sourceSpan
    : elapsedInShot;
  const ambientSourceElapsed = loopsSource
    ? ambientElapsed % sourceSpan
    : ambientElapsed % duration;
  const holdSourceEnd = sourceEnd > sourceStart
    ? sourceEnd
    : sourceStart + duration;
  const expected = phase === "hold"
    ? Math.max(sourceStart, holdSourceEnd - 0.04)
    : !clockLocked
    ? sourceStart + (reducedMotion ? 0 : ambientSourceElapsed)
    : phase === "future"
      ? sourceStart
      : phase === "past"
        ? currentVideoTime
        : sourceStart + activeSourceElapsed;
  const declaredVideoEnd = finite(videoDuration, 0) > 0
    ? Math.max(0, finite(videoDuration, 0) - 0.03)
    : Number.POSITIVE_INFINITY;
  const declaredSourceEnd = sourceEnd > sourceStart
    ? Math.max(sourceStart, sourceEnd - 0.03)
    : Number.POSITIVE_INFINITY;
  const playableEnd = Math.min(declaredVideoEnd, declaredSourceEnd);
  const boundedExpected = Number.isFinite(playableEnd)
    ? Math.min(playableEnd, Math.max(0, expected))
    : Math.max(0, expected);
  const effectiveExpected = phase === "past" ? currentVideoTime : boundedExpected;
  const driftSeconds = effectiveExpected - currentVideoTime;
  const presentable = finite(readyState, 0) >= 2;
  const buffered = finite(readyState, 0) >= 3;
  const shouldPlay = !documentHidden
    && (clockLocked ? playbackPlaying && active : !reducedMotion);
  const seekTarget = effectiveExpected;
  const seekDrift = seekTarget - currentVideoTime;
  const shouldSeek = phase !== "past"
    && Math.abs(seekDrift) > Math.max(0.1, finite(hardSeekToleranceSeconds, 0.75));
  const playbackRate = shouldPlay && !shouldSeek && Math.abs(driftSeconds) > 0.16
    ? Math.max(0.97, Math.min(1.03, 1 + driftSeconds * 0.04))
    : 1;
  return {
    active,
    phase,
    future: phase === "future",
    past: phase === "past",
    presentable,
    buffered,
    waitingForFrame: !presentable,
    waitingForBuffer: !buffered,
    loopsSource,
    expectedSeconds: effectiveExpected,
    shouldPlay,
    shouldPause: !shouldPlay,
    shouldSeek,
    seekSeconds: Math.max(0, seekTarget),
    driftSeconds,
    playbackRate,
  };
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

function boundedVector(value, bounds = []) {
  const vector = finiteVector(value);
  if (!vector) return null;
  return vector.map((entry, index) => {
    const [minimum, maximum] = bounds[index] || [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    return Math.max(minimum, Math.min(maximum, entry));
  });
}

function normalizeSnapshotRecordTransforms(value = {}) {
  const entries = Array.isArray(value)
    ? value.map((entry) => [entry?.songId || entry?.id, entry])
    : Object.entries(object(value));
  const normalized = [];
  const seen = new Set();
  for (const [rawSongId, rawTransform] of entries) {
    const songId = text(String(rawSongId || rawTransform?.songId || ""));
    if (!songId || seen.has(songId)) continue;
    const transform = object(rawTransform);
    const position = boundedVector(transform.position, [
      [-4.25, 4.25],
      [0.55, 1.2],
      [-2.2, 2.45],
    ]);
    if (!position) continue;
    const rotation = boundedVector(transform.rotation, [
      [-Math.PI * 2, Math.PI * 2],
      [-Math.PI * 2, Math.PI * 2],
      [-Math.PI * 2, Math.PI * 2],
    ]) || [0, 0, 0];
    seen.add(songId);
    normalized.push([songId, {
      position,
      rotation,
      manipulated: transform.manipulated !== false,
    }]);
  }
  return Object.fromEntries(normalized.slice(0, 500));
}

export function resolveEchoRecordGardenTableDrop({
  position,
  occupiedPositions = [],
  quantizeStep = 0.05,
  recordDiameter = 1.25,
} = {}) {
  const bounded = boundedVector(position, [
    [-4.25, 4.25],
    [0.55, 1.2],
    [-2.2, 2.45],
  ]);
  if (!bounded) return { accepted: false, reason: "invalid-position", position: null };
  const step = Math.max(0.01, finite(quantizeStep, 0.05));
  const quantized = bounded.map((entry) => Math.round(entry / step) * step);
  const minimumDistance = Math.max(0.1, finite(recordDiameter, 1.25));
  const collision = list(occupiedPositions)
    .map(finiteVector)
    .filter(Boolean)
    .some((occupied) => Math.hypot(
      quantized[0] - occupied[0],
      quantized[2] - occupied[2],
    ) < minimumDistance);
  if (collision) return { accepted: false, reason: "record-collision", position: null };
  return { accepted: true, reason: "accepted", position: quantized };
}

function normalizeSnapshotCardJob(value = {}) {
  const job = object(value);
  const visualId = text(job.visualId || job.sourceVisualId);
  if (!visualId) return null;
  const sourceStatus = slug(job.status);
  if (!sourceStatus || ["idle", "complete", "completed", "cancelled", "canceled"].includes(sourceStatus)) {
    return null;
  }
  const status = ["pending", "running", "resolving"].includes(sourceStatus)
    ? "interrupted"
    : ["interrupted", "failed", "blocked", "unavailable"].includes(sourceStatus)
      ? sourceStatus
      : "interrupted";
  return {
    status,
    visualId,
    songId: text(job.songId || job.sourceSongId),
    requestKey: text(job.requestKey),
    startedAt: text(job.startedAt) || null,
    error: text(job.error) || (status === "interrupted"
      ? "The previous Card request was interrupted. Retry from the same visual."
      : ""),
    recoverable: status !== "blocked" && status !== "unavailable",
  };
}

export function normalizeEchoRecordGardenSnapshot(value = {}) {
  const source = object(value);
  const selection = object(source.selection);
  const playback = object(source.playback);
  const catalog = object(source.catalog);
  const scene = object(source.scene);
  const layout = object(source.layout || scene.layout);
  const camera = object(source.camera || source.scene?.camera);
  const perspective = text(catalog.perspective || selection.perspective || source.perspective, "all").toLowerCase();
  const rawQuery = text(catalog.query ?? source.query);
  const crateOrder = uniqueText(catalog.crateOrder || source.crateOrder).slice(0, 500);
  const recordTransforms = normalizeSnapshotRecordTransforms(
    scene.recordTransforms || layout.recordTransforms || source.recordTransforms,
  );
  const sourceSchemaVersion = text(source.schemaVersion);
  return {
    schemaVersion: ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
    migratedFrom: sourceSchemaVersion && sourceSchemaVersion !== ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA
      ? sourceSchemaVersion
      : null,
    selectedSongId: text(selection.selectedSongId || source.selectedSongId || source.lastSongId),
    placedSongId: text(selection.placedSongId || source.placedSongId),
    selectedVisualId: text(selection.selectedVisualId || source.selectedVisualId),
    perspective: ["all", "red", "blue", "green"].includes(perspective) ? perspective : "all",
    query: rawQuery.slice(0, 180),
    cratePage: clampInteger(catalog.cratePage ?? source.cratePage, 0, 0, 10_000),
    crateOrder,
    surfacePage: clampInteger(scene.surfacePage ?? layout.surfacePage ?? source.surfacePage, 0, 0, 100),
    surfaceSongId: text(scene.surfaceSongId || layout.surfaceSongId || source.surfaceSongId),
    recordTransforms,
    muted: playback.muted === undefined ? source.muted !== false : playback.muted !== false,
    playbackSeconds: Math.max(0, finite(playback.seconds ?? source.playbackSeconds, 0)),
    camera: {
      position: finiteVector(camera.position),
      target: finiteVector(camera.target),
    },
    cardJob: normalizeSnapshotCardJob(source.cardJob || source.jobs?.card),
    persistedAt: text(source.persistedAt) || null,
  };
}

export function reconcileEchoRecordGardenSnapshot(value = {}, {
  recordIds,
  visualIds,
} = {}) {
  const snapshot = normalizeEchoRecordGardenSnapshot(value);
  const hasRecordInventory = Array.isArray(recordIds);
  const hasVisualInventory = Array.isArray(visualIds);
  const currentRecordIds = hasRecordInventory ? uniqueText(recordIds).slice(0, 500) : [];
  const currentVisualIds = hasVisualInventory ? uniqueText(visualIds).slice(0, 500) : [];
  const currentRecordSet = new Set(currentRecordIds);
  const currentVisualSet = new Set(currentVisualIds);
  const crateOrder = hasRecordInventory
    ? [
        ...snapshot.crateOrder.filter((songId) => currentRecordSet.has(songId)),
        ...currentRecordIds.filter((songId) => !snapshot.crateOrder.includes(songId)),
      ]
    : snapshot.crateOrder;
  const recordTransforms = hasRecordInventory
    ? Object.fromEntries(Object.entries(snapshot.recordTransforms)
        .filter(([songId]) => currentRecordSet.has(songId)))
    : snapshot.recordTransforms;
  const placedSongId = hasRecordInventory && !currentRecordSet.has(snapshot.placedSongId)
    ? ""
    : snapshot.placedSongId;
  const selectedSongId = hasRecordInventory
    ? currentRecordSet.has(snapshot.selectedSongId)
      ? snapshot.selectedSongId
      : currentRecordSet.has(placedSongId)
        ? placedSongId
        : currentRecordIds[0] || ""
    : snapshot.selectedSongId;
  const selectedVisualId = hasVisualInventory
    ? currentVisualSet.has(snapshot.selectedVisualId)
      ? snapshot.selectedVisualId
      : currentVisualIds[0] || ""
    : snapshot.selectedVisualId;
  let cardJob = snapshot.cardJob;
  if (cardJob && (
    (hasRecordInventory && cardJob.songId && !currentRecordSet.has(cardJob.songId))
    || (hasVisualInventory && !currentVisualSet.has(cardJob.visualId))
  )) {
    cardJob = {
      ...cardJob,
      status: "unavailable",
      error: "The source visual for the interrupted Card request is no longer available.",
      recoverable: false,
    };
  }
  return {
    ...snapshot,
    selectedSongId,
    placedSongId,
    selectedVisualId,
    crateOrder,
    recordTransforms,
    cardJob,
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
