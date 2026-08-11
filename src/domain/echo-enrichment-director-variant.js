import { createHash } from "node:crypto";
import {
  echoDirectionVariantFingerprint,
  pickEchoDirectionVariantProjectPatch,
} from "./echo-direction-variants.js";
import { generateEchoHyperframeScript } from "./echo-hyperframe-script.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";
import {
  buildSafeCameraPath,
  classifyMediaRole,
  validateSafeCameraPath,
} from "./media-role-camera.js";
import {
  classifySourcePrior,
  scoreDirectorCandidate,
} from "./echo-video-enrichment.js";
import {
  ECHO_TRANSITION_TIME_MAPPING_MAX_PLAYBACK_RATE as ECHO_TRANSITION_MAX_PLAYBACK_RATE,
  ECHO_TRANSITION_TIME_MAPPING_SCHEMA as ECHO_TRANSITION_TIME_MAP_SCHEMA,
} from "./echo-playback-sync.js";

export { ECHO_TRANSITION_MAX_PLAYBACK_RATE, ECHO_TRANSITION_TIME_MAP_SCHEMA };

export const ECHO_VIDEO_ENRICHMENT_ROW_SCHEMA = "hapa.echo.video-enrichment.v1";
export const ECHO_VIDEO_ENRICHMENT_CATALOG_SCHEMA = "hapa.echo.video-enrichment-catalog.v1";
export const ECHO_ENRICHMENT_DIRECTOR_VARIANT_SCHEMA = "hapa.echo.direction-script-variant.v1";
export const ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA = "hapa.echo.shot-decision-evidence.v6";
export const ECHO_ASSET_CAMERA_FRAMING_SCHEMA = "hapa.echo.asset-camera-framing.v2";
export const ECHO_ENRICHMENT_DIRECTOR_COMPILER = "echo-intentional-enrichment-v6-full-source-motion-bridges";
export const ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE = "declared-card-lineage+reference-image-sha256+poster-uri";
export const ECHO_TRANSITION_FIRST_FRAME_SAMPLE_SECONDS = 0;
export const ECHO_TRANSITION_LAST_FRAME_END_GUARD_SECONDS = 1 / 24;
export const ECHO_INFERRED_TRANSITION_MIN_CONTEXT_AFFINITY = 0.025;
export const ECHO_TARGET_TRANSITIONS_PER_SONG = 2;
export const ECHO_SOURCE_BIAS_COUNTERFACTUAL_SCHEMA = "hapa.echo.source-bias-counterfactual.v1";
export const ECHO_ENRICHMENT_DIRECTOR_REPORT_SCHEMA = "hapa.echo.enrichment-director-variant-report.v1";
export const ECHO_CANONICAL_STORY_AFFINITY_MINIMUM = 0.1;
export const ECHO_SOFT_STORY_AFFINITY_MINIMUM = 0.15;

export const ECHO_VIDEO_ENRICHMENT_EXPECTED_SCHEMA = Object.freeze({
  enrichmentsNdjson: {
    required: ["one JSON object per non-empty line"],
    identity: ["id|enrichmentId", "mediaId|media.id|asset.id", "runtimeMediaUri|mediaUri|media.uri|asset.uri"],
    optional: [
      "title", "thumbnailUri", "mediaContract", "technicalIdentity|sha256|contentHash",
      "sourceGroup|source.group", "sourcePrior", "qualityScore|quality.overall",
      "summary|caption|description", "tags|keywords|motifs", "story", "lore", "songIds",
      "flow", "semantic.references", "transitionAssignment",
    ],
    tolerance: "Missing optional fields receive explicit neutral or unavailable evidence; rows without a playable URI can annotate matching parent media but are not added as standalone media candidates.",
  },
  chainGraphJson: {
    accepted: ["{edges:[{from,to,weight?,relation?}]} ", "{adjacency:{id:[id|{id,weight}]}}", "{nodes:[{id,neighbors:[]}]}"],
    declaredTransitions: "{declaredTransitions:[{transitionMediaId,sourceFrame,targetFrame,transitionLink}]}",
    tolerance: "Missing or unresolved generic edges contribute zero affinity. Declared transitions remain ineligible until both directed Reference endpoints resolve.",
  },
  reportJson: {
    optional: ["schemaVersion", "generatedAt|createdAt", "batchFingerprint|contentSha256|corpusSha256", "counts", "quality"],
    tolerance: "The report is provenance context. Stable catalog identity is recomputed from normalized enrichment rows and graph edges when no declared SHA-256 is present.",
  },
});

const READY_STATUSES = new Set(["available", "complete", "completed", "ready", "rendered", "saved"]);
const MEDIA_FIELDS = Object.freeze([
  "media_id", "media_title", "media_uri", "media_thumbnail", "runtime_media_uri",
  "media_contract", "media_card_id", "media_card_kind", "media_card_ref", "media_card_title",
  "media_source_group", "media_technical_identity", "media_dimensions", "media_width", "media_height",
  "media_aspect_ratio", "media_orientation", "semantic_casting",
]);
const CAMERA_REFRAME_FIELDS = Object.freeze([
  "camera_motion", "camera_intensity", "camera_speed", "camera_focus", "camera_framing_contract",
]);
const CATALOG_BASE_CANDIDATE_CACHE = new WeakMap();
const CATALOG_GLOBAL_SEARCH_CACHE = new WeakMap();
const CATALOG_CERTIFIED_TRANSITION_CANDIDATE_CACHE = new WeakMap();
const DIRECTION_EVIDENCE_FIELDS = new Set([
  ...MEDIA_FIELDS,
  ...CAMERA_REFRAME_FIELDS,
  "decision_evidence",
  "edit_reason",
  "transition_link",
]);
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "had", "has",
  "have", "he", "her", "his", "i", "if", "in", "is", "it", "its", "me", "my", "of", "on",
  "or", "our", "she", "that", "the", "their", "them", "there", "they", "this", "to", "was",
  "we", "were", "what", "when", "where", "which", "who", "with", "you", "your",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function mediaDimensions(...values) {
  for (const value of values) {
    const row = object(value);
    const dimensions = object(row.dimensions || row.mediaDimensions || row.media_dimensions);
    const technical = object(row.technical);
    const width = positiveFinite(
      dimensions.width ?? row.width ?? row.media_width ?? row.video_width ?? technical.width,
    );
    const height = positiveFinite(
      dimensions.height ?? row.height ?? row.media_height ?? row.video_height ?? technical.height,
    );
    if (width && height) return {
      width,
      height,
      maxDimension: Math.max(width, height),
    };
  }
  return null;
}

function mediaOrientation(value) {
  const dimensions = mediaDimensions(value);
  if (!dimensions) return "unknown";
  const aspect = dimensions.width / dimensions.height;
  if (Math.abs(aspect - 1) <= 0.02) return "square";
  return aspect > 1 ? "landscape" : "portrait";
}

function normalizeOpticalProposal(value = {}) {
  const proposal = object(value);
  const description = firstText(proposal.description);
  const normalizedFrames = list(proposal.frames).map((frame) => {
    const role = firstText(frame?.role).toLowerCase();
    const colors = uniqueStrings(list(frame?.palette).map((color) => String(color || "").trim().toUpperCase()))
      .filter((color) => /^#[A-F0-9]{6}$/u.test(color))
      .slice(0, 5);
    return {
      role: role === "middle" ? "mid" : role,
      sha256: firstText(frame?.sha256),
      palette: colors,
    };
  }).filter((frame) => ["first", "mid", "last"].includes(frame.role) && frame.palette.length >= 3);
  const byRole = new Map(normalizedFrames.map((frame) => [frame.role, frame]));
  if (!description || !["first", "mid", "last"].every((role) => byRole.has(role))) return null;
  return {
    authority: firstText(proposal.authority, "pending-human optical proposal"),
    reviewId: firstText(proposal.reviewId),
    reviewStatus: firstText(proposal.reviewStatus, "pending-human"),
    description,
    frames: ["first", "mid", "last"].map((role) => byRole.get(role)),
  };
}

function normalizedSubjectROI(...values) {
  for (const value of values) {
    const roi = object(value?.subjectROI || value?.subjectRoi || value?.subject_roi || value);
    const x = Number(roi.x);
    const y = Number(roi.y);
    const width = Number(roi.width);
    const height = Number(roi.height);
    if ([x, y, width, height].every(Number.isFinite)
      && x >= 0 && y >= 0 && width > 0 && height > 0
      && x + width <= 1.000001 && y + height <= 1.000001) {
      return { x, y, width, height };
    }
  }
  return null;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function normalizedScore(value, fallback = 0.5) {
  if (value === null || value === undefined || value === "") return fallback;
  const score = finite(value, fallback);
  if (score > 1 && score <= 100) return clamp(score / 100);
  return clamp(score);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, clone(entry)]));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
    value[key] === undefined ? [] : [[key, canonicalize(value[key])]]
  )));
}

export function stableEchoEnrichmentStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function echoEnrichmentSha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(
    typeof value === "string" ? value : stableEchoEnrichmentStringify(value),
  );
  return createHash("sha256").update(bytes).digest("hex");
}

function uniqueStrings(values) {
  const seen = new Set();
  return list(values).flatMap((value) => {
    const normalized = text(String(value || ""));
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function semanticName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return firstText(value.tag, value.identifier, value.value, value.name, value.title, value.id);
  }
  return text(typeof value === "string" ? value : String(value || ""));
}

function flattenText(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return [];
  if (["string", "number", "boolean"].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenText(entry, depth + 1));
  if (typeof value === "object") return Object.values(value).flatMap((entry) => flattenText(entry, depth + 1));
  return [];
}

function tokens(value) {
  if (value instanceof Set) return new Set(value);
  return new Set(flattenText(value).join(" ").normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").split(/\s+/u)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function tokenAffinity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return clamp(overlap / Math.sqrt(leftTokens.size * rightTokens.size));
}

function overlappingTokens(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  return [...leftTokens].filter((token) => rightTokens.has(token)).sort();
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizedSourceGroup(value) {
  return firstText(value, "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

export function isLowPriorEchoEnrichmentSource(value = {}) {
  const classification = classifySourcePrior(value, value.source, value.provenance, value.origin, value.lineage);
  return classification.flags?.ltx23 === true
    || classification.flags?.hapaDevProto === true
    || classification.flags?.hellWeek === true
    || [0.1, 0.15].includes(Number(value.sourcePrior?.multiplier ?? value.sourcePrior?.prior));
}

export function echoEnrichmentSourcePrior(value = {}) {
  const prior = object(value.sourcePrior || value.source_prior);
  const classified = classifySourcePrior(value, value.source, value.provenance, value.origin, value.lineage);
  const declared = Number(
    prior.multiplier ?? prior.prior ?? prior.weight
    ?? value.sourcePriorMultiplier ?? value.source_prior_multiplier,
  );
  const exactPolicyValues = new Set([0.1, 0.15, 0.7, 1, 1.05, 1.1]);
  return classified.sourceClass === "unknown" && exactPolicyValues.has(declared)
    ? declared
    : classified.prior;
}

function technicalIdentity(value = {}, uri = "") {
  const contract = object(value.mediaContract || value.media_contract || value.playbackContract || value.playback_contract);
  const contentHash = object(value.contentHash || value.content_hash);
  const digest = firstText(
    value.technicalIdentity,
    value.technical_identity,
    value.mediaTechnicalIdentity,
    value.media_technical_identity,
    value.sha256,
    contentHash.value,
    contract.contentHash,
  ).replace(/^sha256:/iu, "").toLowerCase();
  if (/^[a-f0-9]{64}$/u.test(digest)) return `sha256:${digest}`;
  const normalizedUri = firstText(uri, contract.runtimeUri, contract.originalUri).toLowerCase();
  return normalizedUri ? `uri:${normalizedUri}` : "";
}

function normalizeMediaContract(row, uri) {
  const media = object(row.media || row.asset || row.video || row.hapaMedia || row.hapa_media);
  const declared = object(
    row.mediaContract || row.media_contract || row.playbackContract || row.playback_contract
    || media.mediaContract || media.media_contract || media.playbackContract || media.playback_contract,
  );
  const dimensions = mediaDimensions(declared, row, media, row.technical, media.technical);
  const technical = object(row.technical || media.technical);
  const actualDurationSeconds = positiveFinite(
    declared.actualDurationSeconds ?? declared.actual_duration_seconds
    ?? technical.durationSec ?? technical.durationSeconds,
  );
  const fps = positiveFinite(declared.fps ?? technical.fps);
  if (Object.keys(declared).length) return {
    ...clone(declared),
    ...(actualDurationSeconds ? { actualDurationSeconds } : {}),
    ...(fps ? { fps } : {}),
    ...(dimensions ? { dimensions } : {}),
  };
  if (!uri) return null;
  const hash = object(row.contentHash || row.content_hash);
  const type = /\.(?:png|jpe?g|webp|gif|avif)(?:$|[?#])/iu.test(uri) ? "image" : "video";
  return {
    schemaVersion: "hapa.echo.playback-media.v2",
    type,
    originalUri: uri,
    runtimeUri: uri,
    playbackMode: type === "video" ? "loop" : "hold",
    ...(actualDurationSeconds ? { actualDurationSeconds } : {}),
    ...(fps ? { fps } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(firstText(hash.value, row.sha256) ? { contentHash: firstText(hash.value, row.sha256).replace(/^sha256:/iu, "") } : {}),
    provenance: "synthesized-from-enrichment-uri",
  };
}

function normalizedReferenceAnchorId(value = {}) {
  const row = object(value);
  return firstText(
    row.cardId,
    row.card_id,
    row.referenceCardId,
    row.reference_card_id,
    String(row.ownerType || row.owner_type || "").toLowerCase() === "reference"
      ? firstText(row.ownerId, row.owner_id)
      : "",
    /^(?:reference|reference-card):/iu.test(firstText(row.id)) ? row.id : "",
  );
}

function normalizedTransitionEndpoint(value, role) {
  const row = object(value);
  const cardId = normalizedReferenceAnchorId(row);
  if (!cardId) return null;
  return {
    role,
    cardId,
    cardRevisionId: firstText(row.cardRevisionId, row.card_revision_id, row.revisionId, row.revision_id),
    cardTitle: firstText(row.cardTitle, row.card_title, row.ownerName, row.owner_name, row.title),
    assetId: firstText(row.assetId, row.asset_id),
    frameId: firstText(row.frameId, row.frame_id),
    sha256: firstText(row.sha256, row.contentHash, row.content_hash).replace(/^sha256:/iu, "").toLowerCase(),
    uri: firstText(row.uri, row.mediaUri, row.media_uri),
    reviewStatus: firstText(row.reviewStatus, row.review_status),
    sourceCardUnchanged: row.sourceCardUnchanged === true || row.source_card_unchanged === true,
  };
}

function normalizedMotionRole(row = {}, semantic = {}) {
  const flow = object(Object.keys(object(row.flow)).length ? row.flow : row.continuity);
  const loop = object(flow.loop || row.loop);
  const transition = object(flow.transition || row.transition);
  const endpoints = object(transition.declaredEndpoints || transition.declared_endpoints);
  const transitionLink = object(endpoints.link || transition.link || row.transitionAssignment || row.transition_assignment);
  const firstEndpoint = normalizedTransitionEndpoint(
    endpoints.first || endpoints.source || endpoints.entry || row.firstFrame || row.first_frame,
    "first",
  );
  const lastEndpoint = normalizedTransitionEndpoint(
    endpoints.last || endpoints.target || endpoints.exit || row.lastFrame || row.last_frame,
    "last",
  );
  const referenceAnchorIds = uniqueStrings([
    ...list(semantic.references).map(normalizedReferenceAnchorId),
    normalizedReferenceAnchorId(row.reference),
    normalizedReferenceAnchorId(row.card),
  ]);
  const transitionComponents = object(transition.components);
  const directedStateChange = normalizedScore(
    transitionComponents.directedStateChange?.score ?? transition.directedStateChange,
    0,
  );
  const endpointDistinctness = normalizedScore(
    transitionComponents.endpointDistinctness?.score ?? transition.endpointDistinctness,
    0,
  );
  const loopEligible = loop.eligible === true
    || ["loop", "loop-candidate"].includes(firstText(loop.classification).toLowerCase());
  const transitionEligible = transition.eligible === true
    || ["transition", "declared-transition"].includes(firstText(transition.classification).toLowerCase());
  const subtleReferenceLoop = loopEligible
    && !transitionEligible
    && referenceAnchorIds.length > 0
    && directedStateChange <= 0.15
    && endpointDistinctness <= 0.15;
  return {
    kind: transitionEligible
      ? "transition"
      : subtleReferenceLoop ? "subtle-reference-loop" : loopEligible ? "loop" : "motion-clip",
    referenceAnchorIds,
    loop: {
      eligible: loopEligible,
      classification: firstText(loop.classification, loopEligible ? "loop-candidate" : "not-loop"),
      score: normalizedScore(loop.score, 0),
    },
    transition: {
      eligible: transitionEligible,
      classification: firstText(transition.classification, transitionEligible ? "transition" : "not-transition"),
      declaredTransition: transition.declaredTransition === true || transition.declared_transition === true,
      visuallyValidated: transition.visuallyValidated === true || transition.visually_validated === true,
      score: normalizedScore(transition.score, 0),
      directedStateChange,
      endpointDistinctness,
      endpoints: { first: firstEndpoint, last: lastEndpoint },
      jobId: firstText(transitionLink.id, transitionLink.jobId, transitionLink.job_id),
      truthBoundary: firstText(transition.truthBoundary, transition.truth_boundary),
      ...(firstText(transition.visualValidationDecision, transition.visual_validation_decision)
        ? { visualValidationDecision: firstText(transition.visualValidationDecision, transition.visual_validation_decision) }
        : {}),
    },
    subtleReferenceLoop,
  };
}

export function normalizeEchoVideoEnrichmentRow(row = {}, index = 0) {
  const source = object(row.source || row.provenance || row.origin);
  const media = object(row.media || row.asset || row.video || row.hapaMedia || row.hapa_media);
  const semantic = object(row.semantic || row.semantics || row.analysis || row.enrichment);
  const recognition = object(row.recognition);
  const quality = object(row.quality || row.scores || row.score);
  const motionRole = normalizedMotionRole(row, semantic);
  const transitionEndpointText = uniqueStrings([
    motionRole.transition.endpoints.first?.cardTitle,
    motionRole.transition.endpoints.last?.cardTitle,
  ]);
  const uri = firstText(
    row.runtimeUri, row.runtime_uri, row.runtimeMediaUri, row.runtime_media_uri, row.mediaUri, row.media_uri, row.uri,
    row.original?.uri,
    list(row.renditions).find((rendition) => ["runtime", "playback"].includes(String(rendition?.role || "").toLowerCase()))?.uri,
    list(row.uris)[0],
    media.runtimeMediaUri, media.runtime_media_uri, media.mediaUri, media.media_uri,
    media.uri, list(media.uris)[0], media.asset?.uri,
  );
  const mediaId = firstText(
    row.mediaId, row.media_id, row.recordId, row.record_id,
    media.mediaId, media.media_id, media.recordId, media.record_id, media.id,
    /^hapa-media:/u.test(text(row.id)) ? row.id : "",
  );
  const identity = technicalIdentity({ ...row, ...media }, uri);
  const enrichmentId = firstText(
    row.enrichmentId, row.enrichment_id, row.id, semantic.id,
    mediaId && `enrichment:${mediaId}`,
    identity && `enrichment:${echoEnrichmentSha256(identity).slice(0, 20)}`,
    `enrichment:row-${String(index + 1).padStart(6, "0")}`,
  );
  const sourceGroup = normalizedSourceGroup(
    row.sourceGroup || row.source_group || list(row.sourceKinds)[0] || list(row.source_kinds)[0]
    || source.group || source.sourceGroup || source.kind || media.sourceGroup || media.source_group
    || row.sourcePrior?.sourceClass || row.source_prior?.sourceClass,
  );
  const title = firstText(row.title, row.name, media.title, media.name, mediaId, enrichmentId);
  const opticalProposal = normalizeOpticalProposal(row.opticalProposal || row.optical_proposal);
  const motifs = uniqueStrings([
    ...list(row.motifs), ...list(semantic.motifs), ...list(row.tags), ...list(semantic.tags),
    ...list(recognition.tags), ...list(semantic.confidentLabels),
    ...list(row.keywords), ...list(semantic.keywords),
  ].map(semanticName));
  const story = clone(row.story || semantic.story || row.storyBeat || row.story_beat || null);
  const lore = clone(row.lore || semantic.lore || null);
  const observedVisualText = uniqueStrings([
    recognition.synopsis,
    recognition.arcSynopsis,
    recognition.arc_synopsis,
    ...list(recognition.frames).flatMap((frame) => [
      frame?.visionDescription,
      frame?.description,
      ...list(frame?.textLines).map((line) => line?.text),
    ]),
    semantic.ocrText,
    semantic.ocr_text,
    ...list(semantic.confidentLabels).map(semanticName),
  ]);
  const canonContextText = uniqueStrings([
    ...flattenText(semantic.characters),
    ...flattenText(semantic.references),
    ...transitionEndpointText,
    ...flattenText(story),
    ...flattenText(lore),
  ]);
  const declaredSongContextIds = uniqueStrings(list(semantic.songContexts).map((context) => (
    firstText(context?.songId, context?.song_id, context?.id)
  )));
  const semanticText = uniqueStrings([
    row.summary, row.synopsis, row.caption, row.description, row.transcript,
    semantic.summary, semantic.synopsis, semantic.caption, semantic.description, semantic.transcript,
    recognition.synopsis, recognition.arcSynopsis, recognition.arc_synopsis,
    semantic.ocrText, semantic.ocr_text,
    ...list(recognition.frames).flatMap((frame) => [
      frame?.visionDescription,
      frame?.description,
      ...list(frame?.textLines).map((line) => line?.text),
    ]),
    ...flattenText(recognition.tags),
    ...flattenText(semantic.confidentLabels), ...flattenText(semantic.characters), ...flattenText(semantic.scenes),
    ...flattenText(semantic.references), ...flattenText(semantic.songContexts), ...flattenText(row.continuity),
    ...transitionEndpointText,
    ...motifs, ...flattenText(story), ...flattenText(lore),
    opticalProposal?.description,
  ]);
  const sourcePolicyInput = { ...row, sourceGroup, source };
  const sourceClassification = classifySourcePrior(row, media, source, row.sourcePrior, row.provenance);
  const sourcePrior = echoEnrichmentSourcePrior(sourcePolicyInput);
  const effectiveSourceClassification = {
    ...sourceClassification,
    sourceClass: sourceClassification.sourceClass === "unknown" && sourcePrior !== 0.7
      ? firstText(row.sourcePrior?.sourceClass, row.sourcePrior?.classification, "declared-policy-prior")
      : sourceClassification.sourceClass,
    prior: sourcePrior,
  };
  const normalizedMediaContract = normalizeMediaContract(row, uri);
  const mediaContract = motionRole.kind === "transition" && normalizedMediaContract
    ? { ...normalizedMediaContract, playbackMode: "once" }
    : normalizedMediaContract;
  const dimensions = mediaDimensions(mediaContract, row, media);
  const subjectROI = normalizedSubjectROI(
    row.subjectROI,
    row.analysis,
    semantic.subjectROI,
    recognition.subjectROI,
    list(recognition.frames).find((frame) => normalizedSubjectROI(frame?.subjectROI))?.subjectROI,
  );
  const normalized = {
    schemaVersion: ECHO_VIDEO_ENRICHMENT_ROW_SCHEMA,
    enrichmentId,
    mediaId,
    title,
    uri,
    playable: row.playable !== false
      && !["decode-failed", "unreadable", "invalid"].includes(firstText(
        row.decodeStatus,
        row.decode_status,
        row.technical?.status,
        row.technical?.decodeStatus,
      ).toLowerCase()),
    thumbnailUri: firstText(
      row.thumbnailUri, row.thumbnail_uri, row.posterUri, row.poster_uri,
      row.technical?.posterUri, row.technical?.poster_uri,
      media.thumbnailUri, media.thumbnail_uri, media.posterUri, media.poster_uri,
    ),
    technicalIdentity: identity,
    mediaContract,
    dimensions,
    orientation: mediaOrientation(dimensions),
    framingAnalysis: {
      subjectROI: subjectROI || { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
      status: subjectROI ? "measured-subject-roi" : "center-safe-fallback",
      evidence: subjectROI ? "enrichment-subject-roi" : "selected-media-dimensions-with-center-safe-fallback",
      faceCount: Math.max(0, finite(recognition.faceCount ?? semantic.faceCount, 0)),
    },
    card: clone(row.card || media.card || null),
    sourceGroup,
    sourcePrior,
    sourceClassification: effectiveSourceClassification,
    lowPrior: sourcePrior <= 0.15,
    qualityScore: normalizedScore(
      row.qualityScore ?? row.quality_score ?? quality.overall ?? quality.score ?? quality.normalizedScore ?? semantic.qualityScore,
      0.5,
    ),
    semanticText,
    observedVisualText,
    observedSynopsis: firstText(recognition.synopsis, recognition.arcSynopsis, recognition.arc_synopsis),
    opticalProposal,
    canonContextText,
    referenceAnchorIds: motionRole.referenceAnchorIds,
    motionRole,
    declaredSongContextIds,
    motifs,
    story,
    lore,
    songIds: uniqueStrings([
      ...list(row.songIds), ...list(row.song_ids), ...list(semantic.songIds),
      row.songId, row.song_id,
    ]),
    sourceKinds: uniqueStrings([
      ...list(row.sourceKinds), ...list(row.source_kinds), sourceGroup,
    ]),
    transitionAssignment: clone(row.transitionAssignment || row.transition_assignment || null),
    source: clone(source),
    rawSchemaVersion: firstText(row.schemaVersion, row.schema_version) || null,
    missing: [],
  };
  if (!normalized.mediaId) normalized.missing.push("media-id");
  if (!normalized.uri || !normalized.playable) normalized.missing.push("playable-uri");
  if (!normalized.technicalIdentity) normalized.missing.push("technical-identity");
  if (!normalized.semanticText.length) normalized.missing.push("semantic-text");
  return normalized;
}

function normalizeEdge(edge = {}) {
  if (Array.isArray(edge)) {
    return { from: firstText(edge[0]), to: firstText(edge[1]), weight: normalizedScore(edge[2], 0.5), relation: "adjacent" };
  }
  return {
    from: firstText(
      edge.from, edge.source, edge.left, edge.a, edge.sourceId, edge.source_id,
      edge.sourceMediaId, edge.source_media_id, edge.sourceVideoId, edge.source_video_id,
    ),
    to: firstText(
      edge.to, edge.target, edge.right, edge.b, edge.targetId, edge.target_id,
      edge.targetMediaId, edge.target_media_id, edge.targetVideoId, edge.target_video_id,
    ),
    weight: normalizedScore(edge.weight ?? edge.score ?? edge.affinity, 0.5),
    relation: firstText(edge.relation, edge.type, edge.kind, "adjacent"),
  };
}

function normalizedChainEdges(chainGraph = {}) {
  const output = list(chainGraph.edges || chainGraph.links || chainGraph.candidates).map(normalizeEdge);
  const adjacency = object(chainGraph.adjacency || chainGraph.neighbors || chainGraph.byId || chainGraph.by_id);
  for (const [from, neighbors] of Object.entries(adjacency)) {
    for (const neighbor of list(neighbors)) {
      output.push(normalizeEdge(typeof neighbor === "string" ? { from, to: neighbor } : { from, ...neighbor, to: neighbor.to || neighbor.id || neighbor.target }));
    }
  }
  for (const node of list(chainGraph.nodes)) {
    const from = firstText(node.id, node.enrichmentId, node.enrichment_id, node.mediaId, node.media_id);
    for (const neighbor of list(node.neighbors || node.links)) {
      output.push(normalizeEdge(typeof neighbor === "string" ? { from, to: neighbor } : { from, ...neighbor, to: neighbor.to || neighbor.id || neighbor.target }));
    }
  }
  for (const [from, neighbors] of Object.entries(object(chainGraph.alternatesBySource || chainGraph.alternates_by_source))) {
    for (const neighbor of list(neighbors)) {
      output.push(normalizeEdge(typeof neighbor === "string" ? { from, to: neighbor } : {
        from,
        ...neighbor,
        to: neighbor.to || neighbor.id || neighbor.target || neighbor.targetVideoId || neighbor.targetMediaId,
      }));
    }
  }
  const seen = new Set();
  return output.filter((edge) => {
    if (!edge.from || !edge.to) return false;
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => (
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.relation.localeCompare(right.relation)
  ));
}

function normalizedDeclaredTransitions(chainGraph = {}) {
  const output = list(chainGraph.declaredTransitions || chainGraph.declared_transitions).map((entry) => {
    const row = object(entry);
    const first = normalizedTransitionEndpoint(
      row.sourceFrame || row.source_frame || row.firstFrame || row.first_frame || row.entry,
      "first",
    );
    const last = normalizedTransitionEndpoint(
      row.targetFrame || row.target_frame || row.lastFrame || row.last_frame || row.exit,
      "last",
    );
    return {
      transitionMediaId: firstText(
        row.transitionMediaId,
        row.transition_media_id,
        row.mediaId,
        row.media_id,
        row.transitionLink?.mediaId,
      ),
      classification: firstText(row.classification, "declared-transition"),
      visuallyValidated: row.visuallyValidated === true || row.visually_validated === true,
      truthBoundary: firstText(row.truthBoundary, row.truth_boundary),
      first,
      last,
      link: clone(row.transitionLink || row.transition_link || null),
    };
  }).filter((entry) => entry.transitionMediaId && entry.first?.cardId && entry.last?.cardId);
  const seen = new Set();
  return output.filter((entry) => {
    const key = [entry.transitionMediaId, entry.first.cardId, entry.last.cardId].join("\u0000").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => (
    left.transitionMediaId.localeCompare(right.transitionMediaId)
    || left.first.cardId.localeCompare(right.first.cardId)
    || left.last.cardId.localeCompare(right.last.cardId)
  ));
}

export function echoDeclaredTransitionEndpointContractDigest(chainGraph = {}) {
  const contract = normalizedDeclaredTransitions(chainGraph).map((entry) => ({
    transitionMediaId: entry.transitionMediaId,
    transitionJobId: firstText(entry.link?.id, entry.link?.jobId, entry.link?.job_id),
    linkedMediaId: firstText(entry.link?.mediaId, entry.link?.media_id),
    first: clone(entry.first),
    last: clone(entry.last),
  }));
  return echoEnrichmentSha256(contract);
}

export function echoReferenceAnimationCatalogContractDigest(catalog = {}) {
  const records = list(catalog.records).map((record) => ({
    cardId: firstText(record?.card?.id, record?.cardId, record?.card_id),
    cardRevisionId: firstText(record?.card?.revisionId, record?.cardRevisionId, record?.card_revision_id),
    imageUri: firstText(record?.artifacts?.image?.uri),
    imageSha256: firstText(record?.artifacts?.image?.sha256).replace(/^sha256:/iu, "").toLowerCase(),
  })).filter((record) => record.cardId && record.imageUri && /^[a-f0-9]{64}$/u.test(record.imageSha256))
    .sort((left, right) => left.cardId.localeCompare(right.cardId));
  return echoEnrichmentSha256({
    schemaVersion: firstText(catalog.schemaVersion, catalog.schema_version),
    sourceManifestHash: firstText(catalog.sourceManifestHash, catalog.source_manifest_hash),
    records,
  });
}

export function echoEnrichmentCompilerInputFingerprint({
  songId = "",
  parentProjectSha256 = "",
  parentVariantId = "",
  parentVariantFingerprint = "",
  enrichmentBatchFingerprint = "",
  songDecisionInputDigest = "",
  assignedTransitionJobIds = [],
  transitionSelectionBalanceDigest = "",
  transitionEndpointValidation = null,
} = {}) {
  return echoEnrichmentSha256({
    compiler: ECHO_ENRICHMENT_DIRECTOR_COMPILER,
    songId: firstText(songId),
    parentProjectSha256: firstText(parentProjectSha256).replace(/^sha256:/iu, "").toLowerCase(),
    parentVariantId: firstText(parentVariantId),
    parentVariantFingerprint: firstText(parentVariantFingerprint).replace(/^sha256:/iu, "").toLowerCase(),
    enrichmentBatchFingerprint: firstText(enrichmentBatchFingerprint).replace(/^sha256:/iu, "").toLowerCase(),
    songDecisionInputDigest: firstText(songDecisionInputDigest).replace(/^sha256:/iu, "").toLowerCase(),
    assignedTransitionJobIds: uniqueStrings(assignedTransitionJobIds).sort(),
    transitionSelectionBalanceDigest: firstText(transitionSelectionBalanceDigest).replace(/^sha256:/iu, "").toLowerCase(),
    transitionEndpointValidation: clone(transitionEndpointValidation),
  });
}

function transitionUsageEntries(usageCounts = new Map()) {
  const entries = usageCounts instanceof Map
    ? [...usageCounts.entries()]
    : Array.isArray(usageCounts)
      ? usageCounts
      : Object.entries(object(usageCounts));
  return entries.map(([jobId, count]) => ({
    jobId: firstText(jobId),
    count: Math.max(0, Math.trunc(finite(count, 0))),
  })).filter((row) => row.jobId && row.count > 0)
    .sort((left, right) => left.jobId.localeCompare(right.jobId));
}

export function echoTransitionSelectionBalanceDigest(usageCounts = new Map()) {
  return echoEnrichmentSha256({
    schemaVersion: "hapa.echo.transition-selection-balance.v1",
    usage: transitionUsageEntries(usageCounts),
  });
}

function transitionUsageCount(usageCounts, jobId) {
  if (!jobId) return 0;
  if (usageCounts instanceof Map) return Math.max(0, Math.trunc(finite(usageCounts.get(jobId), 0)));
  return Math.max(0, Math.trunc(finite(object(usageCounts)[jobId], 0)));
}

function mergeDeclaredTransition(row, declared) {
  if (!declared) return row;
  const existing = object(row.motionRole?.transition);
  const visualValidationDecision = firstText(existing.visualValidationDecision).toLowerCase();
  const visuallyQuarantined = ["quarantine", "quarantined"].includes(visualValidationDecision);
  const visuallyValidated = existing.visuallyValidated === true || declared.visuallyValidated === true;
  const endpoints = object(existing.endpoints);
  const authoritativeEndpoint = (inlineEndpoint, declaredEndpoint) => {
    const next = clone(inlineEndpoint || {});
    for (const [key, value] of Object.entries(object(declaredEndpoint))) {
      if (key === "sourceCardUnchanged") {
        if (value === true) next[key] = true;
      } else if (text(value)) {
        next[key] = clone(value);
      }
    }
    return next;
  };
  const nextMotionRole = {
    ...clone(row.motionRole),
    kind: visuallyQuarantined ? "motion-clip" : "transition",
    transition: {
      ...clone(existing),
      eligible: !visuallyQuarantined,
      classification: visuallyQuarantined
        ? "endpoint-mismatch-quarantined"
        : firstText(existing.classification, declared.classification, "declared-transition"),
      declaredTransition: true,
      visuallyValidated,
      endpoints: {
        first: authoritativeEndpoint(endpoints.first, declared.first),
        last: authoritativeEndpoint(endpoints.last, declared.last),
      },
      jobId: firstText(declared.link?.id, existing.jobId),
      truthBoundary: firstText(declared.truthBoundary, existing.truthBoundary),
    },
  };
  const endpointText = uniqueStrings([
    nextMotionRole.transition.endpoints.first?.cardTitle,
    nextMotionRole.transition.endpoints.last?.cardTitle,
  ]);
  return {
    ...row,
    motionRole: nextMotionRole,
    semanticText: uniqueStrings([...row.semanticText, ...endpointText]),
    canonContextText: uniqueStrings([...row.canonContextText, ...endpointText]),
  };
}

function declaredFingerprint(report = {}) {
  const candidate = firstText(report.batchFingerprint, report.batch_fingerprint, report.contentSha256, report.content_sha256, report.corpusSha256, report.corpus_sha256)
    .replace(/^sha256:/iu, "").toLowerCase();
  return /^[a-f0-9]{64}$/u.test(candidate) ? candidate : "";
}

function referenceStillHoldCandidate({ endpoint = {}, record = {}, transition = {}, role = "first" } = {}) {
  endpoint = object(endpoint);
  record = object(record);
  transition = object(transition);
  const image = object(record.artifacts?.image);
  const imageSha256 = firstText(image.sha256, endpoint.sha256).replace(/^sha256:/iu, "").toLowerCase();
  const imageUri = firstText(image.uri, endpoint.uri);
  if (!endpoint.cardId
    || endpoint.sourceCardUnchanged !== true
    || imageUri !== endpoint.uri
    || imageSha256 !== endpoint.sha256
    || !/^[a-f0-9]{64}$/u.test(imageSha256)) return null;
  // The animation and its source still share an authored aspect. Dimensions
  // are used only to derive a truthful centered cover crop; the selected media
  // remains the content-addressed still, never the adaptive loop.
  const dimensions = mediaDimensions(image.dimensions, record.technical);
  const mediaId = `hapa-media:sha256:${imageSha256}`;
  const title = firstText(endpoint.cardTitle, record.card?.title, `${role} Reference hold`);
  const endpointText = uniqueStrings([
    endpoint.cardTitle,
    record.card?.title,
    ...transition.semanticText,
    ...transition.canonContextText,
  ]);
  return {
    enrichmentId: `certified-reference-still:${imageSha256}`,
    mediaId,
    title,
    uri: imageUri,
    thumbnailUri: imageUri,
    technicalIdentity: `sha256:${imageSha256}`,
    mediaContract: {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "image",
      originalUri: imageUri,
      runtimeUri: imageUri,
      playbackMode: "hold",
      contentHash: imageSha256,
      ...(dimensions ? { dimensions: clone(dimensions) } : {}),
      provenance: "certified-transition-reference-still",
    },
    dimensions: clone(dimensions),
    orientation: mediaOrientation(dimensions),
    framingAnalysis: {
      subjectROI: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
      status: "certified-center-crop",
      evidence: "same-reference-image-used-by-transition-endpoint-visual-certification",
      faceCount: 0,
    },
    card: {
      id: endpoint.cardId,
      revisionId: endpoint.cardRevisionId || firstText(record.card?.revisionId),
      kind: "reference-card",
      title,
    },
    sourceGroup: "reference-atlas",
    sourcePrior: 1.1,
    sourceClassification: {
      sourceClass: "approved-reference",
      prior: 1.1,
      flags: { approvedReference: true },
    },
    lowPrior: false,
    qualityScore: 1,
    semanticText: endpointText,
    observedVisualText: uniqueStrings([endpoint.cardTitle, record.card?.title]),
    observedSynopsis: `Exact certified ${role} Reference still for ${title}.`,
    canonContextText: endpointText,
    referenceAnchorIds: [endpoint.cardId],
    motionRole: {
      kind: "reference-still-hold",
      referenceAnchorIds: [endpoint.cardId],
      referenceStillHold: true,
      endpointRole: role,
      loop: { eligible: false, classification: "not-a-loop", score: 0 },
      transition: { eligible: false, classification: "not-a-transition", score: 0 },
      subtleReferenceLoop: false,
    },
    declaredSongContextIds: clone(transition.declaredSongContextIds),
    motifs: clone(transition.motifs),
    story: clone(transition.story),
    lore: clone(transition.lore),
    songIds: clone(transition.songIds),
    sourceKinds: ["reference-atlas", "certified-transition-reference-still"],
    playable: true,
    enrichmentCoverage: "certified-transition-reference-still",
    referenceStillCertification: {
      schemaVersion: "hapa.echo.transition-reference-still-hold.v1",
      role,
      cardId: endpoint.cardId,
      imageSha256,
      imageUri,
      sourceCardUnchanged: true,
    },
  };
}

function validTimestamp(...values) {
  for (const value of values) {
    const parsed = Date.parse(text(value));
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

export function buildEchoVideoEnrichmentCatalog({
  enrichments = [],
  chainGraph = {},
  report = {},
  transitionEndpointValidation = null,
  referenceAnimationCatalog = null,
} = {}) {
  const declaredTransitions = normalizedDeclaredTransitions(chainGraph);
  const declaredEndpointContractDigest = echoDeclaredTransitionEndpointContractDigest(chainGraph);
  const referenceCatalogContractDigest = referenceAnimationCatalog
    ? echoReferenceAnimationCatalogContractDigest(referenceAnimationCatalog)
    : "";
  const endpointFilesVerified = transitionEndpointValidation?.verified === true
    && transitionEndpointValidation?.schemaVersion === "hapa.echo.transition-endpoint-file-validation.v1"
    && finite(transitionEndpointValidation?.endpointRecords, 0) === declaredTransitions.length * 2
    && transitionEndpointValidation?.declaredEndpointContractDigest === declaredEndpointContractDigest
    && Boolean(referenceCatalogContractDigest)
    && transitionEndpointValidation?.referenceCatalogContractDigest === referenceCatalogContractDigest;
  const declaredJobIds = declaredTransitions.map((entry) => firstText(
    entry.link?.id,
    entry.link?.jobId,
    entry.link?.job_id,
  )).filter(Boolean).sort();
  const visualValidation = object(transitionEndpointValidation?.visualValidation);
  const visualJobs = list(visualValidation.jobs);
  const visualJobsById = new Map(visualJobs.map((job) => [firstText(job.jobId, job.job_id), job]));
  const visualJobIds = visualJobs.map((job) => firstText(job.jobId, job.job_id)).filter(Boolean).sort();
  const certifiedTransitionJobIds = new Set(list(
    visualValidation.certifiedJobIds || visualValidation.certified_job_ids,
  ).map(String));
  const visualMediaFiles = object(transitionEndpointValidation?.visualMediaFiles);
  const visualEndpointsVerified = endpointFilesVerified
    && visualValidation.schemaVersion === "hapa.echo.transition-endpoint-visual-validation-receipt.v1"
    && visualValidation.verified === true
    && finite(visualValidation.totalJobs, -1) === declaredTransitions.length
    && stableEchoEnrichmentStringify(visualJobIds) === stableEchoEnrichmentStringify(declaredJobIds)
    && certifiedTransitionJobIds.size === finite(visualValidation.certifiedJobs, -1)
    && certifiedTransitionJobIds.size + finite(visualValidation.quarantinedJobs, -1) === declaredTransitions.length
    && visualMediaFiles.schemaVersion === "hapa.echo.transition-visual-media-file-validation.v1"
    && visualMediaFiles.verified === true
    && finite(visualMediaFiles.files, -1) === declaredTransitions.length;
  const declaredByMediaId = new Map(declaredTransitions.map((entry) => [entry.transitionMediaId.toLowerCase(), entry]));
  const referenceRecordsByCardId = new Map(list(referenceAnimationCatalog?.records).map((record) => (
    [firstText(record?.card?.id, record?.cardId, record?.card_id), record]
  )).filter(([cardId]) => Boolean(cardId)));
  const rows = list(enrichments).map(normalizeEchoVideoEnrichmentRow)
    .map((row) => mergeDeclaredTransition(row, declaredByMediaId.get(String(row.mediaId || "").toLowerCase())))
    .sort((left, right) => left.enrichmentId.localeCompare(right.enrichmentId));
  const edges = normalizedChainEdges(chainGraph);
  const computedFingerprint = echoEnrichmentSha256({ rows, edges, declaredTransitions });
  const batchFingerprint = declaredFingerprint(report) || computedFingerprint;
  const byKey = new Map();
  for (const row of rows) {
    for (const key of [row.enrichmentId, row.mediaId, row.technicalIdentity, row.uri].filter(Boolean)) {
      const normalized = String(key).toLowerCase();
      const current = byKey.get(normalized);
      if (!current || row.qualityScore > current.qualityScore) byKey.set(normalized, row);
    }
  }
  const adjacency = new Map();
  for (const edge of edges) {
    const from = edge.from.toLowerCase();
    const to = edge.to.toLowerCase();
    const forward = adjacency.get(from) || new Map();
    forward.set(to, Math.max(finite(forward.get(to), 0), edge.weight));
    adjacency.set(from, forward);
  }
  const referenceRowsByAnchor = new Map();
  for (const row of rows) {
    if (!row.motionRole?.loop?.eligible || !row.playable) continue;
    for (const anchorId of row.referenceAnchorIds || []) {
      const key = anchorId.toLowerCase();
      const matches = referenceRowsByAnchor.get(key) || [];
      matches.push(row);
      referenceRowsByAnchor.set(key, matches);
    }
  }
  for (const matches of referenceRowsByAnchor.values()) matches.sort((left, right) => (
    right.qualityScore - left.qualityScore || left.technicalIdentity.localeCompare(right.technicalIdentity)
  ));
  const referenceRowsForEndpoint = (endpoint) => {
    if (!endpoint?.cardId || !endpoint?.sha256 || endpoint.sourceCardUnchanged !== true) return [];
    return (referenceRowsByAnchor.get(endpoint.cardId.toLowerCase()) || []).filter((row) => (
      endpoint.uri && row.thumbnailUri
        ? endpoint.uri.toLowerCase() === row.thumbnailUri.toLowerCase()
        : false
    ));
  };
  const resolutionByKey = new Map();
  const transitionsByFirstAnchor = new Map();
  for (const row of rows) {
    if (!row.motionRole?.transition?.eligible) continue;
    const transitionJobId = firstText(row.motionRole.transition.jobId);
    const visualJob = object(visualJobsById.get(transitionJobId));
    const visuallyCertified = visualEndpointsVerified
      && row.motionRole.transition.visuallyValidated === true
      && firstText(row.motionRole.transition.visualValidationDecision).toLowerCase() === "certified"
      && certifiedTransitionJobIds.has(transitionJobId)
      && firstText(visualJob.decision).toLowerCase() === "certified"
      && firstText(visualJob.mediaId, visualJob.media_id) === row.mediaId;
    const first = row.motionRole.transition.endpoints?.first || null;
    const last = row.motionRole.transition.endpoints?.last || null;
    const entryRows = referenceRowsForEndpoint(first);
    const exitRows = referenceRowsForEndpoint(last);
    const entryReferenceStill = referenceStillHoldCandidate({
      endpoint: first,
      record: referenceRecordsByCardId.get(first?.cardId),
      transition: row,
      role: "first",
    });
    const exitReferenceStill = referenceStillHoldCandidate({
      endpoint: last,
      record: referenceRecordsByCardId.get(last?.cardId),
      transition: row,
      role: "last",
    });
    const resolution = {
      eligible: Boolean(
        visuallyCertified
        && first?.cardId
        && last?.cardId
        && entryReferenceStill
        && exitReferenceStill
      ),
      transitionMediaId: row.mediaId,
      transitionEnrichmentId: row.enrichmentId,
      first: clone(first),
      last: clone(last),
      entryMediaIds: entryRows.map((entry) => entry.mediaId),
      exitMediaIds: exitRows.map((entry) => entry.mediaId),
      entryTechnicalIdentities: entryRows.map((entry) => entry.technicalIdentity),
      exitTechnicalIdentities: exitRows.map((entry) => entry.technicalIdentity),
      entryReferenceStill: clone(entryReferenceStill),
      exitReferenceStill: clone(exitReferenceStill),
      endpointFilesVerified,
      visualEndpointsVerified,
      visualValidationDecision: visuallyCertified ? "certified" : "uncertified",
      visualValidationResultDigestSha256: visuallyCertified
        ? firstText(visualValidation.resultDigestSha256, visualValidation.result_digest_sha256)
        : "",
      visualValidation: visuallyCertified ? {
        jobId: transitionJobId,
        mediaId: row.mediaId,
        videoSha256: firstText(visualJob.video?.actualSha256, visualJob.video?.actual_sha256),
        first: {
          frameIndex: finite(visualJob.endpoints?.first?.frameIndex, -1),
          sourceTimeSeconds: finite(visualJob.endpoints?.first?.sourceTimeSeconds, -1),
        },
        last: {
          frameIndex: finite(visualJob.endpoints?.last?.frameIndex, -1),
          sourceTimeSeconds: finite(visualJob.endpoints?.last?.sourceTimeSeconds, -1),
        },
      } : null,
      endpointIdentityEvidence: entryReferenceStill && exitReferenceStill
        ? endpointFilesVerified
          ? ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE
          : "declared-card-lineage+poster-uri-match"
        : "unresolved",
      reason: !first?.cardId || !last?.cardId
        ? "declared-transition-endpoint-missing"
        : !visuallyCertified
          ? "decoded-transition-endpoints-not-certified"
        : !entryReferenceStill || !exitReferenceStill
          ? "declared-transition-reference-still-unresolved"
          : "resolved-certified-reference-still-bridge",
    };
    for (const key of [row.enrichmentId, row.mediaId, row.technicalIdentity, row.uri].filter(Boolean)) {
      resolutionByKey.set(String(key).toLowerCase(), resolution);
    }
    if (resolution.eligible) {
      const anchorKey = first.cardId.toLowerCase();
      const matches = transitionsByFirstAnchor.get(anchorKey) || [];
      matches.push(row);
      transitionsByFirstAnchor.set(anchorKey, matches);
    }
  }
  const findRow = (value = {}) => {
    for (const key of [
      value.enrichmentId, value.enrichment_id, value.mediaId, value.media_id,
      value.technicalIdentity, value.media_technical_identity,
      value.uri, value.media_uri, value.runtime_media_uri,
    ].filter(Boolean)) {
      const match = byKey.get(String(key).toLowerCase());
      if (match) return match;
    }
    return null;
  };
  const findResolution = (value = {}) => {
    for (const key of [
      value.enrichmentId, value.enrichment_id, value.mediaId, value.media_id,
      value.technicalIdentity, value.media_technical_identity,
      value.uri, value.media_uri, value.runtime_media_uri,
    ].filter(Boolean)) {
      const match = resolutionByKey.get(String(key).toLowerCase());
      if (match) return match;
    }
    return null;
  };
  const genericAffinity = (leftKeys = [], rightKeys = []) => {
    let maximum = 0;
    for (const left of list(leftKeys).filter(Boolean)) {
      const neighbors = adjacency.get(String(left).toLowerCase());
      if (!neighbors) continue;
      for (const right of list(rightKeys).filter(Boolean)) {
        maximum = Math.max(maximum, finite(neighbors.get(String(right).toLowerCase()), 0));
      }
    }
    return clamp(maximum);
  };
  return {
    schemaVersion: ECHO_VIDEO_ENRICHMENT_CATALOG_SCHEMA,
    rows,
    edges,
    declaredTransitions,
    batchFingerprint,
    computedFingerprint,
    declaredFingerprint: declaredFingerprint(report) || null,
    generatedAt: validTimestamp(report.generatedAt, report.generated_at, report.createdAt, report.created_at),
    reportSummary: {
      schemaVersion: firstText(report.schemaVersion, report.schema_version) || null,
      counts: clone(report.counts || report.summary?.counts || null),
      quality: clone(report.quality || report.summary?.quality || null),
    },
    expectedSchema: ECHO_VIDEO_ENRICHMENT_EXPECTED_SCHEMA,
    transitionEndpointValidation: endpointFilesVerified
      ? clone(transitionEndpointValidation)
      : null,
    find(value = {}) {
      return findRow(value);
    },
    affinity(leftKeys = [], rightKeys = []) {
      return genericAffinity(leftKeys, rightKeys);
    },
    transitionResolution(value = {}) {
      return clone(findResolution(value));
    },
    continuityEvidence(left = {}, right = {}) {
      const leftRow = findRow(left) || left;
      const rightRow = findRow(right) || right;
      const leftAnchors = new Set(list(leftRow.referenceAnchorIds).map((id) => String(id).toLowerCase()));
      const rightAnchors = new Set(list(rightRow.referenceAnchorIds).map((id) => String(id).toLowerCase()));
      const rightResolution = findResolution(rightRow);
      if (rightResolution?.eligible && leftRow.motionRole?.kind !== "transition"
        && leftAnchors.has(String(rightResolution.first.cardId).toLowerCase())) {
        return {
          score: 1,
          kind: "declared-transition-entry-anchor",
          referenceId: rightResolution.first.cardId,
          transitionMediaId: rightResolution.transitionMediaId,
        };
      }
      const leftResolution = findResolution(leftRow);
      if (leftResolution?.eligible && rightRow.motionRole?.kind !== "transition"
        && rightAnchors.has(String(leftResolution.last.cardId).toLowerCase())) {
        return {
          score: 1,
          kind: "declared-transition-exit-anchor",
          referenceId: leftResolution.last.cardId,
          transitionMediaId: leftResolution.transitionMediaId,
        };
      }
      const score = genericAffinity(candidateKeys(leftRow), candidateKeys(rightRow));
      return {
        score,
        kind: score > 0 ? "measured-last-to-first-chain" : "none",
        referenceId: null,
        transitionMediaId: null,
      };
    },
    outboundTransitionCount(value = {}) {
      const row = findRow(value) || value;
      const ids = new Set();
      for (const anchorId of list(row.referenceAnchorIds)) {
        for (const transition of transitionsByFirstAnchor.get(String(anchorId).toLowerCase()) || []) {
          ids.add(transition.technicalIdentity);
        }
      }
      return ids.size;
    },
    neighborKeys(leftKeys = [], limit = 96) {
      const weighted = new Map();
      for (const left of list(leftKeys).filter(Boolean)) {
        for (const [target, weight] of adjacency.get(String(left).toLowerCase()) || []) {
          weighted.set(target, Math.max(finite(weighted.get(target), 0), finite(weight, 0)));
        }
        const row = byKey.get(String(left).toLowerCase());
        if (!row) continue;
        const resolution = findResolution(row);
        if (resolution?.eligible) {
          for (const target of resolution.exitMediaIds) weighted.set(target.toLowerCase(), 1);
        } else {
          for (const anchorId of row.referenceAnchorIds || []) {
            for (const transition of transitionsByFirstAnchor.get(anchorId.toLowerCase()) || []) {
              weighted.set(String(transition.mediaId).toLowerCase(), 1);
            }
          }
        }
      }
      return [...weighted.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, limit).map(([key]) => key);
    },
  };
}

function variantId(variant = {}) {
  return firstText(variant.id, variant.variantId, variant.variant_id);
}

function variantTimestamp(variant = {}) {
  const parsed = Date.parse(firstText(variant.updatedAt, variant.updated_at, variant.createdAt, variant.created_at));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function legacyVariant(variant = {}) {
  return /(?:^|[\s:_-])(legacy|baseline)(?:$|[\s:_-])/iu.test([
    variantId(variant), variant.title, variant.name, variant.packageName, variant.package_name,
  ].filter(Boolean).join(" "));
}

function generatedByThisCompiler(variant = {}) {
  return variant.lineage?.kind === "append-only-intentional-enrichment"
    || variant.lineage?.mode === "append-only-intentional-enrichment"
    || /^intentional-enrichment-/u.test(variantId(variant));
}

export function selectLatestEnrichmentParentVariant(variants = []) {
  const candidates = list(variants).filter((variant) => {
    const status = firstText(variant.status).toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
    return variantId(variant)
      && !legacyVariant(variant)
      && !generatedByThisCompiler(variant)
      && Array.isArray(variant.timeline)
      && variant.timeline.length > 0
      && (!status || READY_STATUSES.has(status));
  });
  return candidates.sort((left, right) => (
    variantTimestamp(right) - variantTimestamp(left) || variantId(right).localeCompare(variantId(left))
  ))[0] || null;
}

export function deriveEchoEnrichmentParentProject(baseProject = {}, parentVariant = {}) {
  const patch = clone(parentVariant.project_patch || parentVariant.projectPatch || {});
  return {
    ...clone(baseProject),
    ...patch,
    timeline: clone(Array.isArray(parentVariant.timeline) ? parentVariant.timeline : baseProject.timeline || []),
    visualizer_timeline: clone(
      Array.isArray(parentVariant.visualizer_timeline) ? parentVariant.visualizer_timeline
        : Array.isArray(parentVariant.visualizerTimeline) ? parentVariant.visualizerTimeline
          : baseProject.visualizer_timeline || [],
    ),
    persistent_shader_slots: clone(
      Array.isArray(parentVariant.persistent_shader_slots) ? parentVariant.persistent_shader_slots
        : Array.isArray(patch.persistent_shader_slots) ? patch.persistent_shader_slots
          : baseProject.persistent_shader_slots || [],
    ),
  };
}

function candidateKeys(candidate = {}) {
  return uniqueStrings([candidate.enrichmentId, candidate.mediaId, candidate.technicalIdentity, candidate.uri]);
}

function candidateFromRow(row = {}) {
  if (!row.uri || row.playable !== true) return null;
  return {
    enrichmentId: row.enrichmentId,
    mediaId: row.mediaId || `enriched-media:${echoEnrichmentSha256(row.uri).slice(0, 20)}`,
    title: row.title,
    uri: row.uri,
    thumbnailUri: row.thumbnailUri,
    technicalIdentity: row.technicalIdentity || `uri:${row.uri.toLowerCase()}`,
    mediaContract: clone(row.mediaContract),
    dimensions: clone(row.dimensions),
    orientation: row.orientation,
    framingAnalysis: clone(row.framingAnalysis),
    card: clone(row.card),
    sourceGroup: row.sourceGroup,
    sourcePrior: row.sourcePrior,
    sourceClassification: clone(row.sourceClassification),
    lowPrior: row.lowPrior,
    qualityScore: row.qualityScore,
    semanticText: row.semanticText,
    observedVisualText: row.observedVisualText,
    observedSynopsis: row.observedSynopsis,
    opticalProposal: clone(row.opticalProposal),
    canonContextText: row.canonContextText,
    referenceAnchorIds: clone(row.referenceAnchorIds),
    motionRole: clone(row.motionRole),
    declaredSongContextIds: row.declaredSongContextIds,
    motifs: row.motifs,
    story: clone(row.story),
    lore: clone(row.lore),
    songIds: row.songIds,
    sourceKinds: clone(row.sourceKinds),
    playable: true,
    enrichmentCoverage: "direct-enrichment-row",
  };
}

function candidateFromShot(shot = {}, catalog) {
  const uri = firstText(shot.runtime_media_uri, shot.media_contract?.runtimeUri, shot.media_uri);
  const identity = firstText(shot.media_technical_identity, technicalIdentity(shot, uri));
  const enrichment = catalog.find({
    mediaId: shot.media_id,
    technicalIdentity: identity,
    uri,
  });
  const canonicalCandidate = enrichment ? candidateFromRow(enrichment) : null;
  if (!canonicalCandidate) return null;
  const shotCard = {
    id: shot.media_card_id,
    kind: shot.media_card_kind,
    ref: shot.media_card_ref,
    title: shot.media_card_title,
  };
  return {
    ...canonicalCandidate,
    card: clone({ ...shotCard, ...object(canonicalCandidate.card) }),
    enrichmentCoverage: "matched-parent-media",
  };
}

function candidatePool(parentProject, catalog, songId) {
  const byIdentity = new Map();
  const insert = (candidate) => {
    if (!candidate) return;
    if (candidate.songIds?.length && !candidate.songIds.includes(songId)) return;
    // A runtime URI is one playback resource. Keep exactly one canonical
    // identity for it even when old cards declared conflicting aliases or
    // filename-derived hashes for the same file.
    const identity = candidate.uri
      ? `uri:${candidate.uri.toLowerCase()}`
      : candidate.technicalIdentity || candidate.mediaId;
    if (!identity) return;
    const current = byIdentity.get(identity);
    const coverageRank = (value) => ({
      "direct-enrichment-row": 3,
      "matched-parent-media": 2,
    })[value] || 0;
    const candidateRank = coverageRank(candidate.enrichmentCoverage);
    const currentRank = coverageRank(current?.enrichmentCoverage);
    if (
      !current
      || candidateRank > currentRank
      || (candidateRank === currentRank && candidate.qualityScore > current.qualityScore)
      || (candidateRank === currentRank && candidate.qualityScore === current.qualityScore
        && candidate.technicalIdentity.localeCompare(current.technicalIdentity) < 0)
    ) byIdentity.set(identity, candidate);
  };
  let baseCandidates = CATALOG_BASE_CANDIDATE_CACHE.get(catalog);
  if (!baseCandidates) {
    baseCandidates = catalog.rows.map(candidateFromRow).filter(Boolean);
    CATALOG_BASE_CANDIDATE_CACHE.set(catalog, baseCandidates);
  }
  for (const candidate of baseCandidates) insert(candidate);
  for (const shot of list(parentProject.timeline)) insert(candidateFromShot(shot, catalog));
  return [...byIdentity.values()].sort((left, right) => (
    left.technicalIdentity.localeCompare(right.technicalIdentity)
  ));
}

function certifiedTransitionCandidates(catalog) {
  let candidates = CATALOG_CERTIFIED_TRANSITION_CANDIDATE_CACHE.get(catalog);
  if (candidates) return candidates;
  candidates = catalog.rows.map(candidateFromRow).filter((candidate) => (
    candidate?.motionRole?.kind === "transition"
    && candidate.motionRole?.transition?.visuallyValidated === true
    && firstText(candidate.motionRole?.transition?.visualValidationDecision).toLowerCase() === "certified"
    && catalog.transitionResolution(candidate)?.eligible === true
  )).sort((left, right) => (
    firstText(left.motionRole?.transition?.jobId, left.mediaId)
      .localeCompare(firstText(right.motionRole?.transition?.jobId, right.mediaId))
  ));
  CATALOG_CERTIFIED_TRANSITION_CANDIDATE_CACHE.set(catalog, candidates);
  return candidates;
}

function buildRawCandidateSearchIndex(candidates, catalog) {
  const byToken = new Map();
  const byKey = new Map();
  for (const candidate of candidates) {
    candidate.observedVisualTokenSet ||= tokens(candidate.observedVisualText);
    candidate.canonContextTokenSet ||= tokens(candidate.canonContextText);
    candidate.searchTokenSet ||= tokens([candidate.observedVisualText, candidate.canonContextText, candidate.motifs]);
    for (const token of candidate.searchTokenSet) {
      const rows = byToken.get(token) || [];
      rows.push(candidate);
      byToken.set(token, rows);
    }
    for (const key of candidateKeys(candidate)) byKey.set(String(key).toLowerCase(), candidate);
  }
  const fallback = [...candidates].sort((left, right) => (
    (right.qualityScore * right.sourcePrior) - (left.qualityScore * left.sourcePrior)
    || left.technicalIdentity.localeCompare(right.technicalIdentity)
  )).slice(0, 64);
  const intrinsicFallback = [...candidates].sort((left, right) => (
    right.qualityScore - left.qualityScore
    || left.technicalIdentity.localeCompare(right.technicalIdentity)
  )).slice(0, 64);
  const resolvedTransitionFallback = candidates.filter((candidate) => (
    candidate.motionRole?.kind === "transition"
    && catalog.transitionResolution(candidate)?.eligible === true
  )).sort((left, right) => (
    right.qualityScore - left.qualityScore
    || left.technicalIdentity.localeCompare(right.technicalIdentity)
  ));
  const bridgeSeedFallback = candidates.filter((candidate) => (
    candidate.motionRole?.kind !== "transition"
    && catalog.outboundTransitionCount(candidate) > 0
  )).sort((left, right) => (
    right.qualityScore - left.qualityScore
    || left.technicalIdentity.localeCompare(right.technicalIdentity)
  ));
  return {
    byToken,
    byTokenMaps: [byToken],
    byKey,
    fallback,
    intrinsicFallback,
    resolvedTransitionFallback,
    bridgeSeedFallback,
  };
}

function buildCandidateSearchIndex(candidates, catalog) {
  let globalSearch = CATALOG_GLOBAL_SEARCH_CACHE.get(catalog);
  if (!globalSearch) {
    const baseCandidates = CATALOG_BASE_CANDIDATE_CACHE.get(catalog) || [];
    globalSearch = buildRawCandidateSearchIndex(
      baseCandidates.filter((candidate) => !candidate.songIds?.length),
      catalog,
    );
    CATALOG_GLOBAL_SEARCH_CACHE.set(catalog, globalSearch);
  }
  const localCandidates = candidates.filter((candidate) => candidate.songIds?.length);
  if (!localCandidates.length) return globalSearch;
  const localSearch = buildRawCandidateSearchIndex(localCandidates, catalog);
  const combine = (left, right, compare, limit = Number.POSITIVE_INFINITY) => {
    const byIdentity = new Map();
    for (const candidate of [...left, ...right]) {
      if (!byIdentity.has(candidate.technicalIdentity)) byIdentity.set(candidate.technicalIdentity, candidate);
    }
    return [...byIdentity.values()].sort(compare).slice(0, limit);
  };
  return {
    byToken: globalSearch.byToken,
    byTokenMaps: [globalSearch.byToken, localSearch.byToken],
    byKey: {
      get(key) {
        return localSearch.byKey.get(key) || globalSearch.byKey.get(key);
      },
    },
    fallback: combine(globalSearch.fallback, localSearch.fallback, (left, right) => (
      (right.qualityScore * right.sourcePrior) - (left.qualityScore * left.sourcePrior)
      || left.technicalIdentity.localeCompare(right.technicalIdentity)
    ), 64),
    intrinsicFallback: combine(globalSearch.intrinsicFallback, localSearch.intrinsicFallback, (left, right) => (
      right.qualityScore - left.qualityScore
      || left.technicalIdentity.localeCompare(right.technicalIdentity)
    ), 64),
    resolvedTransitionFallback: combine(
      globalSearch.resolvedTransitionFallback,
      localSearch.resolvedTransitionFallback,
      (left, right) => right.qualityScore - left.qualityScore
        || left.technicalIdentity.localeCompare(right.technicalIdentity),
    ),
    bridgeSeedFallback: combine(
      globalSearch.bridgeSeedFallback,
      localSearch.bridgeSeedFallback,
      (left, right) => right.qualityScore - left.qualityScore
        || left.technicalIdentity.localeCompare(right.technicalIdentity),
    ),
  };
}

function shortlistCandidates(search, targetContext, previous, neighborKeys = [], limit = 384) {
  const wanted = tokens(targetContext);
  const matches = new Map();
  for (const token of wanted) {
    for (const tokenMap of search.byTokenMaps || [search.byToken]) {
      for (const candidate of tokenMap.get(token) || []) {
        const row = matches.get(candidate.technicalIdentity) || { candidate, tokenMatches: 0 };
        row.tokenMatches += 1;
        matches.set(candidate.technicalIdentity, row);
      }
    }
  }
  const ranked = [...matches.values()].sort((left, right) => (
    right.tokenMatches - left.tokenMatches
    || right.candidate.qualityScore - left.candidate.qualityScore
    || left.candidate.technicalIdentity.localeCompare(right.candidate.technicalIdentity)
  )).map((row) => row.candidate);
  const byIdentity = new Map();
  const add = (candidate) => {
    if (candidate && byIdentity.size < limit && !byIdentity.has(candidate.technicalIdentity)) {
      byIdentity.set(candidate.technicalIdentity, candidate);
    }
  };
  add(previous);
  for (const key of neighborKeys.slice(0, 96)) {
    const candidate = search.byKey.get(String(key).toLowerCase());
    add(candidate);
  }
  for (const candidate of search.bridgeSeedFallback) add(candidate);
  for (const candidate of search.resolvedTransitionFallback) add(candidate);
  for (const candidate of search.intrinsicFallback) add(candidate);
  for (const candidate of search.fallback) add(candidate);
  for (const candidate of ranked) add(candidate);
  return [...byIdentity.values()];
}

function planningSemanticAffinity(candidate, targetContext) {
  const visual = candidate.observedVisualTokenSet || candidate.observedVisualText;
  const canon = new Set([
    ...tokens(candidate.observedVisualTokenSet || candidate.observedVisualText),
    ...tokens(candidate.canonContextTokenSet || candidate.canonContextText),
  ]);
  return Number((
    tokenAffinity(targetContext.lyric, visual) * 0.25
    + tokenAffinity(targetContext.canon, canon) * 0.2
    + tokenAffinity(targetContext.objectAction, visual) * 0.2
    + tokenAffinity(targetContext.emotion, [candidate.observedVisualText, candidate.motifs]) * 0.15
  ).toFixed(6));
}

function planningContextScore(candidate, targetContext) {
  const score = (
    planningSemanticAffinity(candidate, targetContext)
    + candidate.qualityScore * 0.2
  ) * candidate.sourcePrior;
  return Number(score.toFixed(6));
}

export function buildEchoAuthoredTransitionTimeMap({
  mediaContract = {},
  cueStartSeconds = 0,
  cueEndSeconds = 0,
  outputFps = 30,
} = {}) {
  const actualDurationSeconds = positiveFinite(
    mediaContract.actualDurationSeconds ?? mediaContract.actual_duration_seconds,
  );
  const sourceFps = positiveFinite(mediaContract.fps) || 24;
  const frameCount = Math.max(0, Math.trunc(finite(
    mediaContract.frameCount ?? mediaContract.frame_count,
  )));
  const declaredSourceInSeconds = Number(
    mediaContract.sourceInSeconds ?? mediaContract.source_in_seconds,
  );
  const sourceInSeconds = Math.max(0, Number.isFinite(declaredSourceInSeconds)
    ? declaredSourceInSeconds
    : ECHO_TRANSITION_FIRST_FRAME_SAMPLE_SECONDS);
  const declaredSourceBoundarySeconds = positiveFinite(
    mediaContract.sourceOutSeconds ?? mediaContract.source_out_seconds,
  );
  const sourceBoundarySeconds = declaredSourceBoundarySeconds > sourceInSeconds
    ? Math.min(actualDurationSeconds || declaredSourceBoundarySeconds, declaredSourceBoundarySeconds)
    : Math.max(
      sourceInSeconds,
      frameCount > 1
        ? (frameCount - 1) / sourceFps
        : actualDurationSeconds - (1 / sourceFps),
    );
  const resolvedOutputFps = positiveFinite(outputFps) || 30;
  const sourceOutSeconds = sourceBoundarySeconds > sourceInSeconds ? sourceBoundarySeconds : 0;
  const sourceDurationSeconds = Math.max(0, sourceOutSeconds - sourceInSeconds);
  const cueDurationSeconds = Math.max(0, finite(cueEndSeconds) - finite(cueStartSeconds));
  const cueSampleSpanSeconds = Math.max(0, cueDurationSeconds - (1 / resolvedOutputFps));
  const playbackRate = cueSampleSpanSeconds > 0
    ? sourceDurationSeconds / cueSampleSpanSeconds
    : Number.POSITIVE_INFINITY;
  const valid = sourceDurationSeconds > 0
    && cueSampleSpanSeconds > 0
    && playbackRate > 0
    && playbackRate <= ECHO_TRANSITION_MAX_PLAYBACK_RATE;
  return {
    schemaVersion: ECHO_TRANSITION_TIME_MAP_SCHEMA,
    mode: "fit-source-once-to-cue",
    valid,
    reason: valid
      ? "full-source-transition-fits-bounded-playback-rate"
      : !sourceBoundarySeconds
        ? "transition-source-duration-unavailable"
        : playbackRate > ECHO_TRANSITION_MAX_PLAYBACK_RATE
          ? "transition-cue-requires-unsupported-playback-rate"
          : "transition-cue-or-source-window-invalid",
    sourceInSeconds: Number(sourceInSeconds.toFixed(6)),
    sourceOutSeconds: Number(sourceOutSeconds.toFixed(6)),
    sourceBoundarySeconds: Number(sourceBoundarySeconds.toFixed(6)),
    sourceDurationSeconds: Number(sourceDurationSeconds.toFixed(6)),
    cueStartSeconds: Number(finite(cueStartSeconds).toFixed(6)),
    cueEndSeconds: Number(finite(cueEndSeconds).toFixed(6)),
    cueDurationSeconds: Number(cueDurationSeconds.toFixed(6)),
    cueSampleSpanSeconds: Number(cueSampleSpanSeconds.toFixed(6)),
    sourceFps,
    outputFps: resolvedOutputFps,
    playbackRate: Number.isFinite(playbackRate) ? Number(playbackRate.toFixed(6)) : null,
    maximumPlaybackRate: ECHO_TRANSITION_MAX_PLAYBACK_RATE,
    endpointFrameSampling: {
      firstSeconds: Number(sourceInSeconds.toFixed(6)),
      lastSeconds: Number(sourceOutSeconds.toFixed(6)),
      policy: "physical-terminal-frame-presentation-pts-v1",
    },
    sourceTimeOrigin: "logical-cue-start",
    preRoll: "hold-first-frame",
    postRoll: "hold-last-frame",
    playbackMode: "once",
    reachesDeclaredLastFrame: valid,
  };
}

function planAssignedTransitionTriplets({
  songId,
  timeline,
  contexts,
  candidates,
  certifiedTransitions = [],
  transitionUsageCounts = new Map(),
  catalog,
  outputFps = 30,
} = {}) {
  const reservations = new Map();
  const placed = [];
  const rejected = [];
  const assignedTransitions = candidates.filter((candidate) => (
    candidate.motionRole?.kind === "transition"
    && candidate.songIds?.includes(songId)
  ));
  const explicitTransitions = assignedTransitions.filter((candidate) => (
    candidate.motionRole?.transition?.visuallyValidated === true
    && firstText(candidate.motionRole?.transition?.visualValidationDecision).toLowerCase() === "certified"
    && catalog.transitionResolution(candidate)?.eligible === true
  )).map((candidate) => ({
    ...candidate,
    transitionSelection: {
      kind: "explicit-assignment",
      songId,
      contextAffinity: null,
    },
  })).sort((left, right) => (
    firstText(left.motionRole?.transition?.jobId, left.mediaId)
      .localeCompare(firstText(right.motionRole?.transition?.jobId, right.mediaId))
  ));
  if (explicitTransitions.length && catalog.transitionEndpointValidation?.verified !== true) {
    throw new Error(`${songId} assigned transitions require independently verified Reference endpoint files.`);
  }
  for (const transition of assignedTransitions) {
    if (explicitTransitions.some((candidate) => candidate.mediaId === transition.mediaId)) continue;
    rejected.push({
      mediaId: transition.mediaId,
      jobId: transition.motionRole?.transition?.jobId || null,
      reason: "decoded-transition-endpoints-not-certified",
    });
  }
  if (rejected.length) {
    return {
      reservations,
      placed,
      rejected,
      assignedTransitions: assignedTransitions.length,
      inferredTransitions: 0,
      plannedTransitions: explicitTransitions.length,
    };
  }
  const targetCount = Math.min(
    ECHO_TARGET_TRANSITIONS_PER_SONG,
    Math.floor(list(timeline).length / 3),
    list(certifiedTransitions).length,
  );
  const explicitMediaIds = new Set(explicitTransitions.map((candidate) => candidate.mediaId));
  const scoredInferenceCandidates = list(certifiedTransitions).filter((candidate) => (
    !explicitMediaIds.has(candidate.mediaId)
  )).map((candidate) => {
    const affinities = list(contexts).map((context, index) => ({
      index,
      affinity: planningSemanticAffinity(candidate, context.targetContext),
    })).sort((left, right) => right.affinity - left.affinity || left.index - right.index);
    const contextAffinity = finite(affinities[0]?.affinity, 0);
    const jobId = firstText(candidate.motionRole?.transition?.jobId, candidate.mediaId);
    const albumPriorUsageCount = transitionUsageCount(transitionUsageCounts, jobId);
    const diversity = Number.parseInt(echoEnrichmentSha256(`${songId}\u0000${jobId}`).slice(0, 8), 16) / 0xffffffff;
    return {
      candidate,
      contextAffinity,
      bestContextIndex: affinities[0]?.index ?? null,
      albumPriorUsageCount,
      diversity,
      inferenceScore: Number((contextAffinity * 0.5 + candidate.qualityScore * 0.1 + diversity * 0.4).toFixed(6)),
    };
  });
  const bestInferenceAffinity = Math.max(0, ...scoredInferenceCandidates.map((row) => row.contextAffinity));
  const inferenceCohortFloor = Math.max(
    ECHO_INFERRED_TRANSITION_MIN_CONTEXT_AFFINITY,
    bestInferenceAffinity * 0.7,
  );
  const inferredCandidates = scoredInferenceCandidates
    .filter((row) => row.contextAffinity >= inferenceCohortFloor)
    .sort((left, right) => (
      left.albumPriorUsageCount - right.albumPriorUsageCount
      || right.inferenceScore - left.inferenceScore
      || right.contextAffinity - left.contextAffinity
      || right.candidate.qualityScore - left.candidate.qualityScore
      || firstText(left.candidate.motionRole?.transition?.jobId, left.candidate.mediaId)
        .localeCompare(firstText(right.candidate.motionRole?.transition?.jobId, right.candidate.mediaId))
    ));
  const inferredTransitions = inferredCandidates
    .slice(0, Math.max(0, targetCount - explicitTransitions.length))
    .map((row) => ({
      ...row.candidate,
      transitionSelection: {
        kind: "semantic-supplement",
        songId,
        contextAffinity: row.contextAffinity,
        bestContextIndex: row.bestContextIndex,
        minimumContextAffinity: ECHO_INFERRED_TRANSITION_MIN_CONTEXT_AFFINITY,
        songRelativeContextAffinityFloor: Number(inferenceCohortFloor.toFixed(6)),
        albumPriorUsageCount: row.albumPriorUsageCount,
        diversityPrior: Number(row.diversity.toFixed(6)),
        inferenceScore: row.inferenceScore,
      },
    }));
  const transitions = [...explicitTransitions, ...inferredTransitions];
  const optionSets = transitions.map((transition, transitionIndex) => {
    const resolution = catalog.transitionResolution(transition);
    const entry = resolution.entryReferenceStill;
    const exit = resolution.exitReferenceStill;
    if (!entry || !exit) {
      rejected.push({
        mediaId: transition.mediaId,
        jobId: transition.motionRole?.transition?.jobId || null,
        reason: "certified-transition-reference-still-missing",
      });
      return [];
    }
    const windows = [];
    let timingRejectedWindows = 0;
    for (let center = 1; center < list(timeline).length - 1; center += 1) {
      const transitionTimeMap = buildEchoAuthoredTransitionTimeMap({
        mediaContract: transition.mediaContract,
        cueStartSeconds: timeline[center]?.start_sec,
        cueEndSeconds: timeline[center]?.end_sec,
        outputFps,
      });
      if (!transitionTimeMap.valid) {
        timingRejectedWindows += 1;
        continue;
      }
      const contextualScore = planningContextScore(entry, contexts[center - 1].targetContext)
        + planningContextScore(transition, contexts[center].targetContext)
        + planningContextScore(exit, contexts[center + 1].targetContext);
      const distributionTarget = ((transitionIndex + 1) / (transitions.length + 1)) * (list(timeline).length - 1);
      const distributionScore = 1 - Math.min(1, Math.abs(center - distributionTarget) / Math.max(1, list(timeline).length));
      const timingFidelityScore = 1 - Math.min(
        1,
        Math.abs(Math.log(transitionTimeMap.playbackRate)) / Math.log(ECHO_TRANSITION_MAX_PLAYBACK_RATE),
      );
      const entryDurationSeconds = Math.max(0, finite(timeline[center - 1]?.end_sec) - finite(timeline[center - 1]?.start_sec));
      const transitionDurationSeconds = Math.max(0, finite(timeline[center]?.end_sec) - finite(timeline[center]?.start_sec));
      const exitDurationSeconds = Math.max(0, finite(timeline[center + 1]?.end_sec) - finite(timeline[center + 1]?.start_sec));
      const anchorHoldSeconds = entryDurationSeconds + exitDurationSeconds;
      const tripletDurationSeconds = anchorHoldSeconds + transitionDurationSeconds;
      const motionShareScore = tripletDurationSeconds > 0 ? transitionDurationSeconds / tripletDurationSeconds : 0;
      const contextualDistributionScore = contextualScore + distributionScore * 0.2;
      windows.push({
        transitionIndex,
        center,
        entry,
        transition,
        exit,
        // Motion share and timing are optimized lexicographically by the global solver. This
        // scalar remains only as human-readable aggregate evidence.
        score: Number((contextualDistributionScore + timingFidelityScore).toFixed(6)),
        timingFidelityScore: Number(timingFidelityScore.toFixed(6)),
        motionShareScore: Number(motionShareScore.toFixed(6)),
        anchorHoldSeconds: Number(anchorHoldSeconds.toFixed(6)),
        transitionDurationSeconds: Number(transitionDurationSeconds.toFixed(6)),
        contextualDistributionScore: Number(contextualDistributionScore.toFixed(6)),
        scoreBreakdown: {
          contextualScore: Number(contextualScore.toFixed(6)),
          distributionScore: Number(distributionScore.toFixed(6)),
          timingFidelityScore: Number(timingFidelityScore.toFixed(6)),
          motionShareScore: Number(motionShareScore.toFixed(6)),
          anchorHoldSeconds: Number(anchorHoldSeconds.toFixed(6)),
          transitionDurationSeconds: Number(transitionDurationSeconds.toFixed(6)),
          selection: clone(transition.transitionSelection),
        },
        resolution,
        transitionTimeMap,
      });
    }
    if (!windows.length) {
      rejected.push({
        mediaId: transition.mediaId,
        jobId: transition.motionRole?.transition?.jobId || null,
        reason: timingRejectedWindows > 0
          ? "no-time-map-compatible-interior-three-shot-window"
          : "no-non-overlapping-interior-three-shot-window",
      });
    }
    return windows;
  });
  if (rejected.length) {
    return {
      reservations,
      placed,
      rejected,
      assignedTransitions: assignedTransitions.length,
      inferredTransitions: inferredTransitions.length,
      plannedTransitions: transitions.length,
    };
  }

  const windowsByCenter = new Map();
  for (const windows of optionSets) {
    for (const window of windows) {
      const rows = windowsByCenter.get(window.center) || [];
      rows.push(window);
      windowsByCenter.set(window.center, rows);
    }
  }
  for (const windows of windowsByCenter.values()) windows.sort((left, right) => (
    left.transitionIndex - right.transitionIndex
    || right.score - left.score
    || left.center - right.center
  ));
  const completeMask = (1 << transitions.length) - 1;
  const memo = new Map();
  const better = (left, right) => {
    if (!left) return right;
    if (!right) return left;
    if (Math.abs(left.motionShareScore - right.motionShareScore) > 0.000001) {
      return left.motionShareScore > right.motionShareScore ? left : right;
    }
    if (Math.abs(left.timingFidelityScore - right.timingFidelityScore) > 0.000001) {
      return left.timingFidelityScore > right.timingFidelityScore ? left : right;
    }
    if (Math.abs(left.contextualDistributionScore - right.contextualDistributionScore) > 0.000001) {
      return left.contextualDistributionScore > right.contextualDistributionScore ? left : right;
    }
    return left.signature.localeCompare(right.signature) <= 0 ? left : right;
  };
  const solve = (center, mask) => {
    const key = `${center}:${mask}`;
    if (memo.has(key)) return memo.get(key);
    if (center >= list(timeline).length - 1) {
      const result = mask === completeMask ? {
        timingFidelityScore: 0,
        motionShareScore: 0,
        contextualDistributionScore: 0,
        selections: [],
        signature: "",
      } : null;
      memo.set(key, result);
      return result;
    }
    let best = solve(center + 1, mask);
    for (const window of windowsByCenter.get(center) || []) {
      const bit = 1 << window.transitionIndex;
      if (mask & bit) continue;
      const suffix = solve(center + 3, mask | bit);
      if (!suffix) continue;
      const selections = [window, ...suffix.selections];
      const signature = selections.map((selection) => (
        `${String(selection.transitionIndex).padStart(2, "0")}@${String(selection.center).padStart(4, "0")}`
      )).sort().join("|");
      best = better(best, {
        timingFidelityScore: Number((
          window.timingFidelityScore + suffix.timingFidelityScore
        ).toFixed(6)),
        motionShareScore: Number((
          window.motionShareScore + suffix.motionShareScore
        ).toFixed(6)),
        contextualDistributionScore: Number((
          window.contextualDistributionScore + suffix.contextualDistributionScore
        ).toFixed(6)),
        selections,
        signature,
      });
    }
    memo.set(key, best);
    return best;
  };
  const globalPlan = solve(1, 0);
  if (!globalPlan) {
    for (const transition of transitions) rejected.push({
      mediaId: transition.mediaId,
      jobId: transition.motionRole?.transition?.jobId || null,
      reason: "no-global-non-overlapping-interior-three-shot-plan",
    });
    return {
      reservations,
      placed,
      rejected,
      assignedTransitions: assignedTransitions.length,
      inferredTransitions: inferredTransitions.length,
      plannedTransitions: transitions.length,
    };
  }

  for (const selected of globalPlan.selections.sort((left, right) => left.center - right.center)) {
    const triplet = [selected.entry, selected.transition, selected.exit];
    for (const [offset, candidate] of triplet.entries()) {
      const index = selected.center + offset - 1;
      reservations.set(index, {
        candidate,
        role: ["entry-reference-still", "authored-transition", "exit-reference-still"][offset],
        center: selected.center,
        transitionMediaId: selected.transition.mediaId,
        transitionJobId: selected.transition.motionRole?.transition?.jobId || null,
        resolution: clone(selected.resolution),
        transitionTimeMap: clone(selected.transitionTimeMap),
      });
    }
    placed.push({
      center: selected.center,
      mediaId: selected.transition.mediaId,
      jobId: selected.transition.motionRole?.transition?.jobId || null,
      firstReferenceId: selected.resolution.first.cardId,
      lastReferenceId: selected.resolution.last.cardId,
      entryMediaId: selected.entry.mediaId,
      exitMediaId: selected.exit.mediaId,
      endpointIdentityEvidence: selected.resolution.endpointIdentityEvidence,
      selection: clone(selected.transition.transitionSelection),
      transitionTimeMap: clone(selected.transitionTimeMap),
      scoreBreakdown: clone(selected.scoreBreakdown),
    });
  }
  return {
    reservations,
    placed,
    rejected,
    assignedTransitions: assignedTransitions.length,
    inferredTransitions: inferredTransitions.length,
    plannedTransitions: transitions.length,
  };
}

function lyricRows(parentProject = {}, song = {}) {
  const sourceRows = [
    parentProject.timed_lyrics,
    parentProject.lyric_timing?.lines,
    parentProject.lyricTiming?.lines,
    song.lyricTimings,
    song.lyric_timings,
  ].find(Array.isArray) || [];
  return sourceRows.map((line, index) => ({
    id: firstText(line.id, line.lineId, line.line_id, `lyric-line-${index + 1}`),
    text: firstText(line.text, line.lyric, line.line),
    startSeconds: finite(line.start ?? line.start_sec ?? line.startSeconds, Number.NaN),
    endSeconds: finite(line.end ?? line.end_sec ?? line.endSeconds, Number.NaN),
    source: sourceRows === song.lyricTimings || sourceRows === song.lyric_timings ? "canonical-song-card" : "parent-director-project",
  })).filter((line) => line.text && Number.isFinite(line.startSeconds) && Number.isFinite(line.endSeconds));
}

function lyricEvidence(lines, shot) {
  if (!lines.length) {
    return {
      status: "lyrics-unavailable",
      explicitLyricsUnavailable: true,
      citation: null,
      note: "No time-addressable lyric line is present in the canonical song card or inherited Director project.",
    };
  }
  const start = finite(shot.start_sec, 0);
  const end = finite(shot.end_sec, start);
  const center = (start + end) / 2;
  const ranked = lines.map((line) => {
    const overlap = Math.max(0, Math.min(end, line.endSeconds) - Math.max(start, line.startSeconds));
    const lineCenter = (line.startSeconds + line.endSeconds) / 2;
    return { line, overlap, distance: Math.abs(center - lineCenter) };
  }).sort((left, right) => right.overlap - left.overlap || left.distance - right.distance || left.line.id.localeCompare(right.line.id));
  const selected = ranked[0];
  const distanceSeconds = Number(selected.distance.toFixed(3));
  return {
    status: selected.overlap > 0 ? "time-overlap" : distanceSeconds <= 2 ? "near-line-context" : "distant-line-context",
    explicitLyricsUnavailable: false,
    distanceSeconds,
    citation: {
      id: selected.line.id,
      text: selected.line.text,
      startSeconds: selected.line.startSeconds,
      endSeconds: selected.line.endSeconds,
      source: selected.line.source,
      overlapSeconds: Number(selected.overlap.toFixed(3)),
      distanceSeconds,
    },
  };
}

function storyBeatEvidence(song = {}, shot = {}, lyric = {}) {
  const beats = list(song.storyBeats || song.story_beats).map((beat, index) => {
    const raw = typeof beat === "string" ? { body: beat } : object(beat);
    const tags = list(raw.tags).map((tag) => String(tag || "").toLowerCase());
    const authorType = firstText(raw.authorType, raw.author_type, "human").toLowerCase();
    const beatType = firstText(raw.beatType, raw.beat_type, "story-beat");
    const softCanon = tags.includes("soft-canon") || beatType.toLowerCase() === "kit-combination" || authorType !== "human";
    return {
      id: firstText(raw.id, raw.beatId, raw.beat_id, `story-beat-${index + 1}`),
      text: firstText(raw.body, raw.summary, raw.text, raw.description, raw.title),
      authority: softCanon ? "soft-canon-association" : "human-canonical",
      authorType,
      beatType,
      softCanon,
    };
  }).filter((beat) => beat.text);
  const context = [shot.section_label, shot.section_type, lyric.citation?.text];
  const ranked = beats.map((beat) => ({
    ...beat,
    affinity: tokenAffinity(context, beat.text),
    overlapTokens: overlappingTokens(context, beat.text),
  })).sort((left, right) => right.affinity - left.affinity || right.overlapTokens.length - left.overlapTokens.length || left.id.localeCompare(right.id));
  const canonical = ranked.find((beat) => !beat.softCanon
    && beat.affinity >= ECHO_CANONICAL_STORY_AFFINITY_MINIMUM
    && beat.overlapTokens.length >= 2);
  if (canonical) return {
    status: "canonical-story-beat-match",
    ids: [canonical.id],
    summary: canonical.text.slice(0, 320),
    affinity: Number(canonical.affinity.toFixed(4)),
    authority: canonical.authority,
    authorType: canonical.authorType,
    beatType: canonical.beatType,
    softCanon: false,
    overlapTokens: canonical.overlapTokens,
    matchThreshold: ECHO_CANONICAL_STORY_AFFINITY_MINIMUM,
    availableBeatCount: beats.length,
  };
  const soft = ranked.find((beat) => beat.softCanon
    && beat.affinity >= ECHO_SOFT_STORY_AFFINITY_MINIMUM
    && beat.overlapTokens.length >= 2);
  if (soft) return {
    status: "soft-canon-association-match",
    ids: [soft.id],
    summary: soft.text.slice(0, 320),
    affinity: Number(soft.affinity.toFixed(4)),
    authority: soft.authority,
    authorType: soft.authorType,
    beatType: soft.beatType,
    softCanon: true,
    overlapTokens: soft.overlapTokens,
    matchThreshold: ECHO_SOFT_STORY_AFFINITY_MINIMUM,
    availableBeatCount: beats.length,
  };
  if (beats.length) {
    const hasCanonical = beats.some((beat) => !beat.softCanon);
    const selected = ranked.find((beat) => hasCanonical ? !beat.softCanon : beat.softCanon) || ranked[0];
    return {
      status: hasCanonical ? "canonical-story-beats-context-unmatched" : "soft-canon-associations-context-unmatched",
      ids: [],
      summary: "",
      affinity: Number((selected?.affinity || 0).toFixed(4)),
      authority: hasCanonical ? "human-canonical" : "soft-canon-association",
      softCanon: !hasCanonical,
      overlapTokens: [],
      matchThreshold: hasCanonical ? ECHO_CANONICAL_STORY_AFFINITY_MINIMUM : ECHO_SOFT_STORY_AFFINITY_MINIMUM,
      availableBeatCount: beats.length,
      note: "Available story context did not cross the authority-aware affinity and overlap threshold for this shot; no story-beat claim is made.",
    };
  }
  return {
    status: "story-beats-unavailable",
    ids: [],
    summary: "",
    affinity: 0,
    authority: "unavailable",
    softCanon: false,
    overlapTokens: [],
    availableBeatCount: 0,
  };
}

function loreEvidence(song = {}) {
  const lore = object(song.lore);
  const summary = firstText(lore.summary, song.contextualLayers?.summary);
  const mood = firstText(lore.mood, song.enrichment?.mood);
  return {
    status: summary || mood ? "canonical-song-lore" : "lore-unavailable",
    summary: summary || "",
    mood: mood || "",
  };
}

function sourceScore(candidate, targetContext, previous, catalog, priorUses = 0, options = {}) {
  const visualContext = candidate.observedVisualTokenSet || candidate.observedVisualText;
  const canonContext = new Set([
    ...tokens(candidate.observedVisualTokenSet || candidate.observedVisualText),
    ...tokens(candidate.canonContextTokenSet || candidate.canonContextText),
  ]);
  const emotionVisualContext = tokens([candidate.observedVisualText, candidate.motifs]);
  const lyricAffinity = tokenAffinity(targetContext.lyric, visualContext);
  const canonAffinity = tokenAffinity(targetContext.canon, canonContext);
  const objectActionAffinity = tokenAffinity(targetContext.objectAction, visualContext);
  const emotionAffinity = tokenAffinity(targetContext.emotion, emotionVisualContext);
  const continuity = previous
    ? catalog.continuityEvidence(previous, candidate)
    : { score: 0, kind: "none", referenceId: null, transitionMediaId: null };
  const chainContinuity = continuity.score;
  const transitionResolution = catalog.transitionResolution(candidate);
  const motionKind = firstText(candidate.motionRole?.kind, "motion-clip");
  const reservationRole = firstText(options.reservation?.role);
  const hardFilters = [];
  if (motionKind === "transition" && reservationRole !== "authored-transition") {
    hardFilters.push("transition-requires-atomic-three-shot-reservation");
  }
  if (candidate.motionRole?.subtleReferenceLoop && !reservationRole) {
    hardFilters.push("adaptive-reference-loop-reservation-only");
  }
  if (motionKind === "reference-still-hold"
    && !["entry-reference-still", "exit-reference-still"].includes(reservationRole)) {
    hardFilters.push("reference-still-requires-atomic-transition-reservation");
  }
  if (motionKind === "transition" && transitionResolution?.eligible !== true) {
    hardFilters.push("transition-endpoints-unresolved");
  }
  if (motionKind === "transition"
    && (finite(options.index, -1) <= 0 || finite(options.index, -1) >= finite(options.shotCount, 0) - 1)) {
    hardFilters.push("transition-cannot-be-first-or-last");
  }
  if (reservationRole === "authored-transition" && continuity.kind !== "declared-transition-entry-anchor") {
    hardFilters.push("transition-entry-reference-mismatch");
  }
  if (previous?.motionRole?.kind === "transition"
    && continuity.kind !== "declared-transition-exit-anchor") {
    hardFilters.push("transition-exit-reference-mismatch");
  }
  let transitionBridgeUtility = 0.5;
  if (motionKind === "transition") {
    transitionBridgeUtility = reservationRole === "authored-transition" && transitionResolution?.eligible
      ? 1
      : transitionResolution?.eligible ? 0.75 : 0;
  } else if (reservationRole === "entry-reference-still" || reservationRole === "exit-reference-still") {
    transitionBridgeUtility = 0.65;
  } else if (candidate.motionRole?.subtleReferenceLoop) {
    transitionBridgeUtility = catalog.outboundTransitionCount(candidate) > 0 ? 0.22 : 0.04;
  } else if (candidate.motionRole?.loop?.eligible) {
    transitionBridgeUtility = 0.24;
  } else {
    transitionBridgeUtility = Math.max(
      0.5,
      normalizedScore(candidate.motionRole?.transition?.directedStateChange, 0),
      normalizedScore(candidate.motionRole?.transition?.endpointDistinctness, 0),
    );
  }
  const sameAsPrevious = previous && previous.technicalIdentity === candidate.technicalIdentity;
  const fatigueMultiplier = sameAsPrevious
    ? 0.55
    : Math.max(0.45, 1 / (1 + Math.max(0, priorUses) * 0.28));
  const scored = scoreDirectorCandidate({
    lyricMomentSectionStemFit: lyricAffinity,
    characterCanonReferenceFit: canonAffinity,
    objectActionSpecificity: objectActionAffinity,
    emotionalArcContribution: emotionAffinity,
    intrinsicQuality: candidate.qualityScore,
    chainContinuity,
    transitionBridgeUtility,
    cameraAspectSuitability: candidate.mediaContract ? 1 : 0.5,
    technicalTruth: candidate.technicalIdentity ? 1 : 0,
    noveltyRepetitionControl: priorUses > 0 ? 0 : 1,
    sourceClassification: candidate.sourceClassification,
    sourcePrior: { prior: candidate.sourcePrior },
    fatigueMultiplier,
    hardFilters,
    eligible: hardFilters.length === 0,
  });
  const motionRoleMultiplier = motionKind === "transition" && reservationRole === "authored-transition"
    ? 1.3
    : candidate.motionRole?.subtleReferenceLoop ? 0.92 : motionKind === "motion-clip" ? 1.08 : 1;
  const total = Number((scored.finalScore * motionRoleMultiplier).toFixed(6));
  return {
    total,
    lyricAffinity: Number(lyricAffinity.toFixed(6)),
    canonAffinity: Number(canonAffinity.toFixed(6)),
    objectActionAffinity: Number(objectActionAffinity.toFixed(6)),
    emotionAffinity: Number(emotionAffinity.toFixed(6)),
    quality: Number(candidate.qualityScore.toFixed(6)),
    sourcePrior: scored.sourcePrior,
    sourceClass: scored.sourceClass,
    chainContinuity: Number(chainContinuity.toFixed(6)),
    chainContinuityKind: continuity.kind,
    chainReferenceId: continuity.referenceId,
    transitionBridgeUtility: Number(transitionBridgeUtility.toFixed(6)),
    motionKind,
    motionRoleMultiplier,
    hardFilters,
    fatigueMultiplier: scored.fatigueMultiplier,
    baseScore: scored.baseScore,
    formula: `${scored.formula} * motionRoleMultiplier`,
  };
}

function directionContract(shot = {}) {
  return Object.fromEntries(Object.entries(shot)
    .filter(([key]) => !DIRECTION_EVIDENCE_FIELDS.has(key))
    .map(([key, value]) => [key, clone(value)]));
}

export function echoShotDirectionContractSnapshot(shot = {}) {
  return directionContract(shot);
}

function shotMediaDimensions(shot = {}) {
  return mediaDimensions(
    shot.media_contract,
    shot.media_dimensions,
    {
      width: shot.media_width ?? shot.video_width,
      height: shot.media_height ?? shot.video_height,
    },
  );
}

function shotMediaOrientation(shot = {}) {
  return firstText(shot.media_orientation, mediaOrientation(shotMediaDimensions(shot)), "unknown");
}

function shotHasPlayableMedia(shot = {}) {
  const kind = firstText(shot.media_contract?.type).toLowerCase();
  const mediaId = firstText(shot.media_id).toLowerCase();
  const uri = firstText(shot.runtime_media_uri, shot.media_contract?.runtimeUri, shot.media_uri);
  return Boolean(uri)
    && !["generated-visualizer", "visualizer", "none", "no-media"].includes(kind)
    && !["", "none", "no-media", "visualizer-only"].includes(mediaId);
}

function cameraState(shot = {}) {
  return {
    motion: firstText(shot.camera_motion, "auto"),
    intensity: finite(shot.camera_intensity, 1),
    speed: finite(shot.camera_speed, 1),
    focus: firstText(shot.camera_focus, "center"),
  };
}

function cameraFocusForROI(roi = {}) {
  const centerX = finite(roi.x, 0.25) + finite(roi.width, 0.5) / 2;
  const centerY = finite(roi.y, 0.2) + finite(roi.height, 0.6) / 2;
  const horizontal = centerX < 0.38 ? "left" : centerX > 0.62 ? "right" : "center";
  const vertical = centerY < 0.38 ? "top" : centerY > 0.62 ? "bottom" : "center";
  if (vertical === "center") return horizontal;
  if (horizontal === "center") return `${vertical}-center`;
  return `${vertical}-${horizontal}`;
}

function cameraMotionForReplacement({ sourceOrientation, targetOrientation, index, isFinal }) {
  if (isFinal) return "slow-pull-out";
  if (sourceOrientation === "portrait" && targetOrientation === "landscape") {
    return index % 2 === 0 ? "pan-down" : "pan-up";
  }
  if (sourceOrientation === "landscape" && targetOrientation === "portrait") {
    return index % 2 === 0 ? "pan-right" : "pan-left";
  }
  if (sourceOrientation === "portrait") return index % 2 === 0 ? "pan-down" : "pan-up";
  return "slow-push-in";
}

function cropIsAspectSafe(crop, sourceAspect, targetAspect) {
  const row = object(crop);
  const x = Number(row.x);
  const y = Number(row.y);
  const width = Number(row.width);
  const height = Number(row.height);
  if (![x, y, width, height].every(Number.isFinite)
    || x < 0 || y < 0 || width <= 0 || height <= 0
    || x + width > 1.000001 || y + height > 1.000001) return false;
  const framedAspect = sourceAspect * width / height;
  return Math.abs(framedAspect - targetAspect) <= 0.00001;
}

function validateAssetCameraFramingContract(contract = {}, shot = {}) {
  const reasons = [];
  const dimensions = mediaDimensions(contract.sourceDimensions, shotMediaDimensions(shot));
  const sourceAspect = dimensions ? dimensions.width / dimensions.height : 0;
  const path = object(contract.path);
  if (contract.schemaVersion !== ECHO_ASSET_CAMERA_FRAMING_SCHEMA) reasons.push("schema");
  if (!firstText(contract.reason)) reasons.push("reason");
  if (!dimensions || !sourceAspect) reasons.push("source-dimensions");
  if (firstText(contract.mediaId) !== firstText(shot.media_id)) reasons.push("media-id");
  if (firstText(path.mediaId) !== firstText(shot.media_id)) reasons.push("path-media-id");
  if (stableEchoEnrichmentStringify(cameraState(shot)) !== stableEchoEnrichmentStringify({
    motion: firstText(contract.motion, "auto"),
    intensity: finite(contract.intensity, 1),
    speed: finite(contract.speed, 1),
    focus: firstText(contract.focus, "center"),
  })) reasons.push("camera-state");
  for (const error of validateSafeCameraPath(path).errors) reasons.push(`path-${error}`);
  for (const corridor of list(path.corridors)) {
    const targetAspect = positiveFinite(corridor.targetAspect);
    if (!targetAspect) reasons.push("corridor-target-aspect");
    for (const crop of [corridor.startCrop, corridor.endCrop]) {
      if (!targetAspect || !sourceAspect || !cropIsAspectSafe(crop, sourceAspect, targetAspect)) {
        reasons.push("corridor-aspect-safety");
      }
    }
  }
  return { ok: reasons.length === 0, reasons: uniqueStrings(reasons) };
}

function cameraReframeRequirement(parentShot = {}, nextShot = {}) {
  const replacement = firstText(parentShot.media_technical_identity, parentShot.media_id, parentShot.media_uri)
    !== firstText(nextShot.media_technical_identity, nextShot.media_id, nextShot.media_uri);
  const parentOrientation = shotMediaOrientation(parentShot);
  const selectedOrientation = shotMediaOrientation(nextShot);
  const replacesNonMedia = replacement && !shotHasPlayableMedia(parentShot);
  const orientationChanged = replacement
    && parentOrientation !== "unknown"
    && selectedOrientation !== "unknown"
    && parentOrientation !== selectedOrientation;
  return {
    required: orientationChanged || replacesNonMedia,
    replacement,
    replacesNonMedia,
    orientationChanged,
    parentOrientation,
    selectedOrientation,
    reason: replacesNonMedia
      ? "replaces-generated-visualizer-or-no-media"
      : orientationChanged
        ? "selected-media-orientation-changed"
        : "parent-camera-compatible",
  };
}

function deriveAssetCameraFraming({
  parentShot,
  nextShot,
  candidate,
  index,
  shotCount,
  outputProfile,
  forceStaticAtomicTransition = false,
} = {}) {
  const derivedRequirement = cameraReframeRequirement(parentShot, nextShot);
  const requirement = forceStaticAtomicTransition ? {
    ...derivedRequirement,
    required: true,
    reason: "certified-atomic-transition-centered-framing",
  } : derivedRequirement;
  if (!requirement.required) return { shot: nextShot, reframed: false, requirement, contract: null };
  const measuredDimensions = shotMediaDimensions(nextShot);
  const sourceDimensions = measuredDimensions || {
    width: outputProfile.width,
    height: outputProfile.height,
    maxDimension: Math.max(outputProfile.width, outputProfile.height),
  };
  const sourceOrientation = mediaOrientation(sourceDimensions);
  const targetOrientation = outputProfile.orientation;
  const targetAspect = outputProfile.width / outputProfile.height;
  const sourceAspect = sourceDimensions.width / sourceDimensions.height;
  const analysis = clone(candidate.framingAnalysis) || {
    subjectROI: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
    status: "center-safe-fallback",
    evidence: "selected-media-dimensions-with-center-safe-fallback",
    faceCount: 0,
  };
  analysis.subjectROI = normalizedSubjectROI(analysis.subjectROI)
    || { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
  const startSeconds = finite(parentShot.start_sec, 0);
  const endSeconds = finite(parentShot.end_sec, startSeconds);
  const technical = {
    ...sourceDimensions,
    durationSec: Math.max(0, endSeconds - startSeconds),
    fps: positiveFinite(nextShot.media_contract?.fps) || 24,
    codec: firstText(nextShot.media_contract?.type, "video"),
  };
  const role = forceStaticAtomicTransition ? "certified-atomic-transition" : classifyMediaRole({
    technical,
    subjectROI: analysis.subjectROI,
    atSectionStart: index === 0,
    isFinal: index === shotCount - 1,
  });
  const phraseCue = {
    id: firstText(parentShot.section_id, `shot-${index}`),
    atSeconds: startSeconds,
    source: "intentional-enrichment-selected-media",
  };
  const path = buildSafeCameraPath({
    mediaId: nextShot.media_id,
    technical,
    analysis,
    role,
    phraseCue,
    targetAspects: [...new Set([targetAspect, 16 / 9, 9 / 16, 1])],
  });
  if (forceStaticAtomicTransition) {
    path.easing = "linear";
    path.zoomLimits = { min: 1, max: 1, startCloseCrop: true };
    for (const corridor of path.corridors) {
      const corridorAspect = positiveFinite(corridor.targetAspect) || targetAspect;
      const width = sourceAspect >= corridorAspect ? corridorAspect / sourceAspect : 1;
      const height = sourceAspect >= corridorAspect ? 1 : sourceAspect / corridorAspect;
      const crop = {
        x: (1 - width) / 2,
        y: (1 - height) / 2,
        width,
        height,
      };
      corridor.startCrop = clone(crop);
      corridor.endCrop = clone(crop);
    }
    path.keyframes = [
      { offset: 0, crop: clone(path.corridors[0].startCrop), zoom: 1 },
      { offset: 1, crop: clone(path.corridors[0].startCrop), zoom: 1 },
    ];
  }
  const cropRetention = sourceAspect >= targetAspect
    ? targetAspect / sourceAspect
    : sourceAspect / targetAspect;
  const motion = forceStaticAtomicTransition ? "static" : cameraMotionForReplacement({
    sourceOrientation,
    targetOrientation,
    index,
    isFinal: index === shotCount - 1,
  });
  const intensity = forceStaticAtomicTransition
    ? 0
    : Number((0.9 + Math.min(0.45, (1 - cropRetention) * 0.7)).toFixed(2));
  const speed = forceStaticAtomicTransition
    ? 1
    : Number((Math.max(0.9, Math.min(1.2, 1.08 + (6 - Math.max(1, endSeconds - startSeconds)) * 0.015))).toFixed(2));
  const focus = forceStaticAtomicTransition ? "center" : cameraFocusForROI(analysis.subjectROI);
  const contract = {
    schemaVersion: ECHO_ASSET_CAMERA_FRAMING_SCHEMA,
    mediaId: nextShot.media_id,
    mediaTechnicalIdentity: nextShot.media_technical_identity,
    reason: requirement.reason,
    derived: true,
    parentMediaId: parentShot.media_id || null,
    parentOrientation: requirement.parentOrientation,
    sourceDimensions: { ...sourceDimensions, measured: Boolean(measuredDimensions) },
    sourceAspect,
    sourceOrientation,
    outputProfile: {
      id: outputProfile.id,
      width: outputProfile.width,
      height: outputProfile.height,
      aspect: targetAspect,
      orientation: targetOrientation,
    },
    cropPolicy: forceStaticAtomicTransition
      ? "certified-centered-cover-no-motion"
      : "aspect-cover-full-bleed",
    motion,
    intensity,
    speed,
    focus,
    shotRole: role,
    subjectROI: clone(analysis.subjectROI),
    path: {
      ...path,
      sourceDimensions: clone(sourceDimensions),
      sourceAspect,
      sourceOrientation,
      activeTargetAspect: targetAspect,
      activeOutputProfileId: outputProfile.id,
    },
  };
  const reframed = {
    ...nextShot,
    camera_motion: motion,
    camera_intensity: intensity,
    camera_speed: speed,
    camera_focus: focus,
    camera_framing_contract: contract,
  };
  const validation = validateAssetCameraFramingContract(contract, reframed);
  if (!validation.ok) {
    throw new Error(`Shot ${index} selected-media camera framing is unsafe: ${validation.reasons.join(", ")}`);
  }
  return { shot: reframed, reframed: true, requirement, contract };
}

function applyCandidateMedia(shot, candidate, reservation = null) {
  const next = clone(shot);
  const card = object(candidate.card);
  const dimensions = mediaDimensions(candidate.dimensions, candidate.mediaContract);
  next.media_id = candidate.mediaId;
  next.media_title = candidate.title;
  next.media_uri = candidate.uri;
  next.media_thumbnail = candidate.thumbnailUri || next.media_thumbnail || "";
  next.runtime_media_uri = firstText(candidate.mediaContract?.runtimeUri, candidate.uri);
  next.media_contract = clone(candidate.mediaContract);
  next.media_card_id = firstText(card.id, next.media_card_id);
  next.media_card_kind = firstText(card.kind, next.media_card_kind);
  next.media_card_ref = firstText(card.ref, next.media_card_ref);
  next.media_card_title = firstText(card.title, candidate.title, next.media_card_title);
  next.media_source_group = candidate.sourceGroup;
  next.media_technical_identity = candidate.technicalIdentity;
  if (candidate.motionRole?.kind === "transition") {
    const transitionTimeMap = object(reservation?.transitionTimeMap);
    if (transitionTimeMap.schemaVersion !== ECHO_TRANSITION_TIME_MAP_SCHEMA
      || transitionTimeMap.valid !== true
      || transitionTimeMap.reachesDeclaredLastFrame !== true) {
      throw new Error(`Transition ${candidate.mediaId} has no valid full-source cue time map.`);
    }
    next.media_contract = {
      ...clone(candidate.mediaContract),
      playbackMode: "once",
      sourceInSeconds: transitionTimeMap.sourceInSeconds,
      sourceOutSeconds: transitionTimeMap.sourceOutSeconds,
      timeMapping: clone(transitionTimeMap),
    };
    next.transition_link = {
      schemaVersion: "hapa.echo.resolved-transition-link-cue.v1",
      id: candidate.motionRole.transition.jobId || candidate.mediaId,
      mediaId: candidate.mediaId,
      from: clone(candidate.motionRole.transition.endpoints?.first),
      to: clone(candidate.motionRole.transition.endpoints?.last),
      endpointIdentityEvidence: reservation?.resolution?.endpointIdentityEvidence
        || ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE,
      playbackMode: "once",
      timeMapping: clone(transitionTimeMap),
      visualValidation: {
        schemaVersion: "hapa.echo.transition-shot-visual-certification.v1",
        decision: "certified",
        jobId: candidate.motionRole.transition.jobId || candidate.mediaId,
        mediaId: candidate.mediaId,
        videoSha256: firstText(reservation?.resolution?.visualValidation?.videoSha256),
        endpoints: {
          first: clone(reservation?.resolution?.visualValidation?.first),
          last: clone(reservation?.resolution?.visualValidation?.last),
        },
        resultDigestSha256: firstText(
          reservation?.resolution?.visualValidationResultDigestSha256,
        ),
      },
    };
  } else {
    delete next.transition_link;
  }
  if (dimensions) {
    next.media_dimensions = clone(dimensions);
    next.media_width = dimensions.width;
    next.media_height = dimensions.height;
    next.media_aspect_ratio = dimensions.width / dimensions.height;
    next.media_orientation = mediaOrientation(dimensions);
  } else {
    delete next.media_dimensions;
    delete next.media_width;
    delete next.media_height;
    delete next.media_aspect_ratio;
    delete next.media_orientation;
  }
  return next;
}

function compactCandidate(candidate, score) {
  return {
    enrichmentId: candidate.enrichmentId,
    mediaId: candidate.mediaId,
    title: candidate.title,
    technicalIdentity: candidate.technicalIdentity,
    sourceGroup: candidate.sourceGroup,
    qualityScore: candidate.qualityScore,
    sourcePrior: candidate.sourcePrior,
    lowPrior: candidate.lowPrior,
    enrichmentCoverage: candidate.enrichmentCoverage,
    observedSynopsis: candidate.observedSynopsis,
    observedVisualEvidence: list(candidate.observedVisualText).slice(0, 3),
    opticalProposal: clone(candidate.opticalProposal),
    declaredSongContextIds: candidate.declaredSongContextIds,
    assignedSongIds: clone(candidate.songIds),
    referenceAnchorIds: clone(candidate.referenceAnchorIds),
    motionRole: clone(candidate.motionRole),
    referenceStillCertification: clone(candidate.referenceStillCertification || null),
    transitionSelection: clone(candidate.transitionSelection || null),
    score,
  };
}

function alternativeRejectionReason(alternative, selected) {
  const fields = [
    "lyricAffinity",
    "canonAffinity",
    "objectActionAffinity",
    "emotionAffinity",
    "quality",
    "chainContinuity",
    "transitionBridgeUtility",
    "motionRoleMultiplier",
  ];
  const leading = fields.map((field) => ({ field, delta: finite(selected.score[field]) - finite(alternative.score[field]) }))
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.field.localeCompare(right.field))[0];
  return `lower intentional-fit score ${alternative.score.total.toFixed(4)} vs ${selected.score.total.toFixed(4)} (delta ${(selected.score.total - alternative.score.total).toFixed(4)}; largest component delta ${leading.field} ${leading.delta.toFixed(4)})`;
}

function sourceNeutralCounterfactualScore(score = {}) {
  return Number((
    finite(score.baseScore, 0)
    * finite(score.fatigueMultiplier, 1)
    * finite(score.motionRoleMultiplier, 1)
  ).toFixed(6));
}

function deterministicTimestamp(catalog, parentVariant, supersedesCreatedAt = "") {
  const parentMilliseconds = variantTimestamp(parentVariant);
  const catalogMilliseconds = Date.parse(catalog.generatedAt || "");
  const supersedesMilliseconds = Date.parse(supersedesCreatedAt || "");
  const effective = Math.max(
    Number.isFinite(parentMilliseconds) ? parentMilliseconds : Date.parse("2026-01-01T00:00:00.000Z"),
    Number.isFinite(catalogMilliseconds) ? catalogMilliseconds : Number.NEGATIVE_INFINITY,
    Number.isFinite(supersedesMilliseconds) ? supersedesMilliseconds : Number.NEGATIVE_INFINITY,
  );
  return new Date(effective + 1).toISOString();
}

function topLevelSelectionEvidence(timeline) {
  return timeline.map((shot) => ({
    shotIndex: shot.shot_index,
    startSeconds: shot.start_sec,
    endSeconds: shot.end_sec,
    enrichmentId: shot.decision_evidence?.enrichment?.id,
    mediaId: shot.media_id,
    technicalIdentity: shot.media_technical_identity,
    sourceGroup: shot.media_source_group,
  }));
}

export function validateEchoEnrichmentDirectorVariant({ parentProject = {}, parentVariant = {}, variant = {} } = {}) {
  const reasons = [];
  const sourceTimeline = list(parentProject.timeline);
  const nextTimeline = list(variant.timeline);
  const requiresVisualCertification = variant.lineage?.compiler === ECHO_ENRICHMENT_DIRECTOR_COMPILER
    && nextTimeline.some((shot) => (
      shot?.decision_evidence?.atomicTransition?.role === "authored-transition"
    ));
  const endpointCertification = object(variant.lineage?.transitionEndpointCertification);
  const certifiedTransitionJobs = new Set(list(endpointCertification.certifiedJobIds).map(String));
  const certifiedTransitionJobEvidence = new Map(list(endpointCertification.certifiedJobs).map((job) => (
    [firstText(job.jobId, job.job_id), job]
  )));
  const visualResultDigestSha256 = firstText(endpointCertification.resultDigestSha256);
  if (variant.schemaVersion !== ECHO_ENRICHMENT_DIRECTOR_VARIANT_SCHEMA) reasons.push("variant-schema");
  if (requiresVisualCertification && (
    endpointCertification.schemaVersion !== "hapa.echo.transition-endpoint-certification-lineage.v1"
    || endpointCertification.verified !== true
    || !/^[a-f0-9]{64}$/u.test(visualResultDigestSha256)
    || endpointCertification.certifiedJobLedgerDigestSha256
      !== echoEnrichmentSha256(list(endpointCertification.certifiedJobs))
  )) reasons.push("transition-endpoint-certification-lineage");
  if (!variantId(parentVariant) || variant.parent?.variantId !== variantId(parentVariant)) reasons.push("parent-variant-identity");
  if (sourceTimeline.length !== nextTimeline.length) reasons.push("timeline-length");
  for (let index = 0; index < Math.min(sourceTimeline.length, nextTimeline.length); index += 1) {
    if (stableEchoEnrichmentStringify(directionContract(sourceTimeline[index])) !== stableEchoEnrichmentStringify(directionContract(nextTimeline[index]))) {
      reasons.push(`shot-${index}-direction-contract`);
    }
    if (nextTimeline[index]?.decision_evidence?.schemaVersion !== ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA) reasons.push(`shot-${index}-evidence-schema`);
    if (!nextTimeline[index]?.decision_evidence?.lyrics?.citation && nextTimeline[index]?.decision_evidence?.lyrics?.explicitLyricsUnavailable !== true) {
      reasons.push(`shot-${index}-lyric-truth`);
    }
    const atomic = nextTimeline[index]?.decision_evidence?.atomicTransition || null;
    const cameraRequirement = atomic ? {
      ...cameraReframeRequirement(sourceTimeline[index], nextTimeline[index]),
      required: true,
      reason: "certified-atomic-transition-centered-framing",
    } : cameraReframeRequirement(sourceTimeline[index], nextTimeline[index]);
    const cameraChanged = stableEchoEnrichmentStringify(cameraState(sourceTimeline[index]))
      !== stableEchoEnrichmentStringify(cameraState(nextTimeline[index]));
    const framingContract = nextTimeline[index]?.camera_framing_contract;
    if (cameraRequirement.required) {
      if (!cameraChanged && !atomic) reasons.push(`shot-${index}-camera-not-rederived`);
      const framingValidation = validateAssetCameraFramingContract(framingContract, nextTimeline[index]);
      for (const reason of framingValidation.reasons) reasons.push(`shot-${index}-camera-${reason}`);
      if (nextTimeline[index]?.decision_evidence?.preservedDirection?.camera !== false) {
        reasons.push(`shot-${index}-camera-falsely-preserved`);
      }
      if (atomic && (
        firstText(nextTimeline[index]?.camera_motion).toLowerCase() !== "static"
        || finite(nextTimeline[index]?.camera_intensity, Number.NaN) !== 0
        || finite(nextTimeline[index]?.camera_speed, Number.NaN) !== 1
        || firstText(nextTimeline[index]?.camera_focus).toLowerCase() !== "center"
        || firstText(framingContract?.cropPolicy) !== "certified-centered-cover-no-motion"
        || firstText(framingContract?.mediaId) !== firstText(nextTimeline[index]?.media_id)
        || firstText(framingContract?.path?.mediaId) !== firstText(nextTimeline[index]?.media_id)
        || list(framingContract?.path?.corridors).some((corridor) => (
          stableEchoEnrichmentStringify(corridor.startCrop)
            !== stableEchoEnrichmentStringify(corridor.endCrop)
          || (() => {
            const sourceAspect = positiveFinite(framingContract?.sourceAspect);
            const targetAspect = positiveFinite(corridor.targetAspect);
            const crop = object(corridor.startCrop);
            if (!sourceAspect || !targetAspect) return true;
            const expectedWidth = sourceAspect >= targetAspect ? targetAspect / sourceAspect : 1;
            const expectedHeight = sourceAspect >= targetAspect ? 1 : sourceAspect / targetAspect;
            return Math.abs(finite(crop.width, -1) - expectedWidth) > 0.000001
              || Math.abs(finite(crop.height, -1) - expectedHeight) > 0.000001
              || Math.abs(finite(crop.x, -1) - ((1 - expectedWidth) / 2)) > 0.000001
              || Math.abs(finite(crop.y, -1) - ((1 - expectedHeight) / 2)) > 0.000001;
          })()
        ))
      )) reasons.push(`shot-${index}-atomic-transition-framing-drift`);
    } else {
      if (cameraChanged) reasons.push(`shot-${index}-camera-unjustified-change`);
      if (framingContract) reasons.push(`shot-${index}-camera-unnecessary-contract`);
      if (nextTimeline[index]?.decision_evidence?.preservedDirection?.camera !== true) {
        reasons.push(`shot-${index}-camera-preservation-evidence`);
      }
    }
    const selectedMotionRole = nextTimeline[index]?.decision_evidence?.selectedCandidate?.motionRole?.kind;
    if (selectedMotionRole === "transition" && atomic?.role !== "authored-transition") {
      reasons.push(`shot-${index}-unreserved-transition`);
    }
    if (["entry-reference-still", "exit-reference-still"].includes(atomic?.role)) {
      const endpoint = atomic.role === "entry-reference-still"
        ? object(atomic.firstReference)
        : object(atomic.lastReference);
      const expectedImageSha256 = firstText(endpoint.sha256).replace(/^sha256:/iu, "").toLowerCase();
      const expectedMediaId = expectedImageSha256 ? `hapa-media:sha256:${expectedImageSha256}` : "";
      const selectedStillCertification = object(
        nextTimeline[index]?.decision_evidence?.selectedCandidate?.referenceStillCertification,
      );
      const mediaContract = object(nextTimeline[index]?.media_contract);
      if (selectedMotionRole !== "reference-still-hold"
        || !expectedMediaId
        || firstText(nextTimeline[index]?.media_id) !== expectedMediaId
        || firstText(nextTimeline[index]?.media_uri) !== firstText(endpoint.uri)
        || firstText(nextTimeline[index]?.runtime_media_uri) !== firstText(endpoint.uri)
        || firstText(mediaContract.type).toLowerCase() !== "image"
        || firstText(mediaContract.playbackMode).toLowerCase() !== "hold"
        || firstText(mediaContract.contentHash).toLowerCase() !== expectedImageSha256
        || selectedStillCertification.schemaVersion !== "hapa.echo.transition-reference-still-hold.v1"
        || selectedStillCertification.cardId !== endpoint.cardId
        || selectedStillCertification.imageSha256 !== expectedImageSha256
        || selectedStillCertification.imageUri !== endpoint.uri) {
        reasons.push(`shot-${index}-certified-reference-still-binding`);
      }
    }
    if (atomic?.role === "authored-transition") {
      if (index === 0 || index === nextTimeline.length - 1) reasons.push(`shot-${index}-transition-boundary`);
      if (nextTimeline[index]?.media_contract?.playbackMode !== "once") reasons.push(`shot-${index}-transition-playback-mode`);
      const mediaTimeMap = object(nextTimeline[index]?.media_contract?.timeMapping);
      const linkTimeMap = object(nextTimeline[index]?.transition_link?.timeMapping);
      const atomicTimeMap = object(atomic.timeMapping);
      const cueDuration = finite(nextTimeline[index]?.end_sec) - finite(nextTimeline[index]?.start_sec);
      const sourceSpan = finite(mediaTimeMap.sourceOutSeconds) - finite(mediaTimeMap.sourceInSeconds);
      const cueSampleSpan = finite(mediaTimeMap.cueSampleSpanSeconds);
      const expectedPlaybackRate = cueSampleSpan > 0 ? sourceSpan / cueSampleSpan : 0;
      const certifiedJob = object(certifiedTransitionJobEvidence.get(firstText(atomic.transitionJobId)));
      const certifiedFirstSeconds = finite(certifiedJob.endpoints?.first?.sourceTimeSeconds, Number.NaN);
      const certifiedLastSeconds = finite(certifiedJob.endpoints?.last?.sourceTimeSeconds, Number.NaN);
      if (mediaTimeMap.schemaVersion !== ECHO_TRANSITION_TIME_MAP_SCHEMA
        || mediaTimeMap.valid !== true
        || mediaTimeMap.reachesDeclaredLastFrame !== true
        || mediaTimeMap.mode !== "fit-source-once-to-cue") {
        reasons.push(`shot-${index}-transition-time-map`);
      }
      if (Math.abs(finite(mediaTimeMap.cueDurationSeconds) - cueDuration) > 0.00001
        || sourceSpan <= 0
        || cueSampleSpan <= 0
        || Math.abs(finite(mediaTimeMap.playbackRate) - expectedPlaybackRate) > 0.00001
        || finite(mediaTimeMap.playbackRate) > ECHO_TRANSITION_MAX_PLAYBACK_RATE) {
        reasons.push(`shot-${index}-transition-time-map-bounds`);
      }
      if (finite(nextTimeline[index]?.media_contract?.sourceInSeconds) !== finite(mediaTimeMap.sourceInSeconds)
        || finite(nextTimeline[index]?.media_contract?.sourceOutSeconds) !== finite(mediaTimeMap.sourceOutSeconds)) {
        reasons.push(`shot-${index}-transition-time-map-source-window`);
      }
      if (requiresVisualCertification && (
        !Number.isFinite(certifiedFirstSeconds)
        || !Number.isFinite(certifiedLastSeconds)
        || Math.abs(finite(mediaTimeMap.sourceInSeconds, Number.NaN) - certifiedFirstSeconds) > 0.000001
        || Math.abs(finite(mediaTimeMap.sourceOutSeconds, Number.NaN) - certifiedLastSeconds) > 0.000001
      )) reasons.push(`shot-${index}-transition-time-map-visual-endpoint-mismatch`);
      if (stableEchoEnrichmentStringify(linkTimeMap) !== stableEchoEnrichmentStringify(mediaTimeMap)
        || stableEchoEnrichmentStringify(atomicTimeMap) !== stableEchoEnrichmentStringify(mediaTimeMap)) {
        reasons.push(`shot-${index}-transition-time-map-evidence`);
      }
      if (nextTimeline[index]?.transition_link?.endpointIdentityEvidence !== ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE
        || atomic.endpointIdentityEvidence !== ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE) {
        reasons.push(`shot-${index}-transition-endpoint-evidence`);
      }
      if (requiresVisualCertification) {
        const jobId = firstText(atomic.transitionJobId);
        const linkVisual = object(nextTimeline[index]?.transition_link?.visualValidation);
        const atomicVisual = object(atomic.visualValidation);
        if (!jobId || !certifiedTransitionJobs.has(jobId)
          || firstText(certifiedJob.mediaId, certifiedJob.media_id) !== atomic.transitionMediaId) {
          reasons.push(`shot-${index}-transition-job-not-visually-certified`);
        }
        for (const [label, visual] of [["link", linkVisual], ["atomic", atomicVisual]]) {
          if (visual.schemaVersion !== "hapa.echo.transition-shot-visual-certification.v1"
            || visual.decision !== "certified"
            || visual.jobId !== jobId
            || visual.mediaId !== atomic.transitionMediaId
            || !/^[a-f0-9]{64}$/u.test(firstText(visual.videoSha256))
            || visual.videoSha256 !== firstText(certifiedJob.videoSha256)
            || stableEchoEnrichmentStringify(visual.endpoints)
              !== stableEchoEnrichmentStringify(certifiedJob.endpoints)
            || visual.resultDigestSha256 !== visualResultDigestSha256) {
            reasons.push(`shot-${index}-transition-${label}-visual-certification`);
          }
        }
      }
      const previousAtomic = nextTimeline[index - 1]?.decision_evidence?.atomicTransition;
      const nextAtomic = nextTimeline[index + 1]?.decision_evidence?.atomicTransition;
      if (previousAtomic?.role !== "entry-reference-still"
        || previousAtomic.transitionMediaId !== atomic.transitionMediaId) {
        reasons.push(`shot-${index}-transition-entry-anchor`);
      }
      if (nextAtomic?.role !== "exit-reference-still"
        || nextAtomic.transitionMediaId !== atomic.transitionMediaId) {
        reasons.push(`shot-${index}-transition-exit-anchor`);
      }
      if (nextTimeline[index - 1]?.decision_evidence?.neighborContinuity?.next?.kind !== "declared-transition-entry-anchor") {
        reasons.push(`shot-${index}-transition-entry-continuity`);
      }
      if (nextTimeline[index]?.decision_evidence?.neighborContinuity?.next?.kind !== "declared-transition-exit-anchor") {
        reasons.push(`shot-${index}-transition-exit-continuity`);
      }
    }
    if (atomic?.role === "entry-reference-still"
      && nextTimeline[index + 1]?.decision_evidence?.atomicTransition?.role !== "authored-transition") {
      reasons.push(`shot-${index}-orphan-transition-entry`);
    }
    if (atomic?.role === "exit-reference-still"
      && nextTimeline[index - 1]?.decision_evidence?.atomicTransition?.role !== "authored-transition") {
      reasons.push(`shot-${index}-orphan-transition-exit`);
    }
  }
  if (stableEchoEnrichmentStringify(parentProject.visualizer_timeline || []) !== stableEchoEnrichmentStringify(variant.visualizer_timeline || [])) reasons.push("visualizer-contract");
  if (stableEchoEnrichmentStringify(parentProject.persistent_shader_slots || []) !== stableEchoEnrichmentStringify(variant.persistent_shader_slots || [])) reasons.push("persistent-shader-contract");
  if (!text(variant.hyperframe_script)) reasons.push("hyperframe-script");
  return {
    schemaVersion: "hapa.echo.enrichment-director-variant-validation.v1",
    ok: reasons.length === 0,
    reasons: uniqueStrings(reasons),
    shots: nextTimeline.length,
  };
}

export function compileEchoEnrichmentDirectorVariant({
  song = {},
  baseProject = {},
  parentVariant = {},
  parentProjectSha256 = "",
  supersedesCreatedAt = "",
  enrichments = [],
  chainGraph = {},
  report = {},
  transitionEndpointValidation = null,
  transitionUsageCounts = new Map(),
  catalog: suppliedCatalog = null,
} = {}) {
  const songId = firstText(baseProject.song_id, baseProject.songId, song.id, song.cardId);
  if (!songId) throw new Error("An Echo song/project ID is required.");
  if (!variantId(parentVariant)) throw new Error(`${songId} requires a latest non-legacy parent Director cut.`);
  const parentProject = deriveEchoEnrichmentParentProject(baseProject, parentVariant);
  if (!list(parentProject.timeline).length) throw new Error(`${songId} parent Director cut has no shots.`);
  const catalog = suppliedCatalog || buildEchoVideoEnrichmentCatalog({
    enrichments,
    chainGraph,
    report,
    transitionEndpointValidation,
  });
  const candidates = candidatePool(parentProject, catalog, songId);
  if (!candidates.length) throw new Error(`${songId} has no playable parent or enrichment media candidates.`);
  const candidateSearch = buildCandidateSearchIndex(candidates, catalog);
  const outputProfile = resolveEchoOutputProfile(
    parentProject.output_profile || parentProject.outputProfile || baseProject.output_profile || baseProject.outputProfile,
  );
  const lyrics = lyricRows(parentProject, song);
  const lore = loreEvidence(song);
  const songMotifs = uniqueStrings([
    ...list(song.motifs), ...list(song.tags), ...list(song.enrichment?.motifs),
    lore.mood, ...flattenText(song.contextualLayers),
  ]);
  const sourceTimeline = list(parentProject.timeline);
  const assignedTransitionJobIds = uniqueStrings(candidates.filter((candidate) => (
    candidate.motionRole?.kind === "transition"
    && candidate.songIds?.includes(songId)
  )).map((candidate) => candidate.motionRole?.transition?.jobId)).sort();
  const transitionSelectionBalanceDigest = echoTransitionSelectionBalanceDigest(transitionUsageCounts);
  const shotContexts = sourceTimeline.map((shot) => {
    const lyric = lyricEvidence(lyrics, shot);
    const story = storyBeatEvidence(song, shot, lyric);
    const matchedCanonicalStory = story.status === "canonical-story-beat-match" ? story.summary : "";
    return {
      lyric,
      story,
      targetContext: {
        lyric: [lyric.citation?.text, shot.section_label, shot.section_type],
        canon: [matchedCanonicalStory, lore.summary, songMotifs],
        objectAction: [lyric.citation?.text, shot.section_label, shot.section_type],
        emotion: [lyric.citation?.text, lore.mood, songMotifs, shot.section_type],
      },
    };
  });
  const transitionPlan = planAssignedTransitionTriplets({
    songId,
    timeline: sourceTimeline,
    contexts: shotContexts,
    candidates,
    certifiedTransitions: certifiedTransitionCandidates(catalog),
    transitionUsageCounts,
    catalog,
    outputFps: outputProfile.fps,
  });
  if (transitionPlan.rejected.length) {
    throw new Error(`${songId} could not place every assigned transition bridge: ${transitionPlan.rejected.map((row) => `${row.jobId || row.mediaId}:${row.reason}`).join(", ")}.`);
  }
  const selections = [];
  const usageCounts = new Map();
  let previous = null;
  for (const [index, shot] of sourceTimeline.entries()) {
    const { lyric, story, targetContext } = shotContexts[index];
    const reservation = transitionPlan.reservations.get(index) || null;
    const targetTokenSet = tokens(Object.values(targetContext));
    const shotCandidates = reservation
      ? [reservation.candidate]
      : shortlistCandidates(
        candidateSearch,
        targetTokenSet,
        previous,
        previous ? catalog.neighborKeys(candidateKeys(previous)) : [],
      );
    const scoredCandidates = shotCandidates.map((candidate) => ({
      candidate,
      score: sourceScore(
        candidate,
        targetContext,
        previous,
        catalog,
        usageCounts.get(candidate.technicalIdentity) || 0,
        { index, shotCount: sourceTimeline.length, reservation },
      ),
    }));
    const eligibleCandidates = scoredCandidates.filter((entry) => entry.score.hardFilters.length === 0);
    const ranked = [...eligibleCandidates].sort((left, right) => (
      right.score.total - left.score.total
      || left.candidate.technicalIdentity.localeCompare(right.candidate.technicalIdentity)
    ));
    const sourceNeutralWinner = [...eligibleCandidates].sort((left, right) => (
      sourceNeutralCounterfactualScore(right.score) - sourceNeutralCounterfactualScore(left.score)
      || left.candidate.technicalIdentity.localeCompare(right.candidate.technicalIdentity)
    ))[0];
    const selected = ranked[0];
    if (!selected) {
      throw new Error(`${songId} shot ${index} has no eligible intentional-enrichment candidate.`);
    }
    if (reservation && (selected?.score?.hardFilters?.length || selected?.score?.total <= 0)) {
      throw new Error(`${songId} shot ${index} invalid atomic transition reservation: ${selected?.score?.hardFilters?.join(", ") || "zero-score"}.`);
    }
    if (!selected?.candidate?.playable
      || ![
        "direct-enrichment-row",
        "matched-parent-media",
        "certified-transition-reference-still",
      ].includes(selected.candidate.enrichmentCoverage)) {
      throw new Error(`${songId} shot ${index} did not resolve to a playable enrichment-backed catalog candidate.`);
    }
    const selectedMediaShot = applyCandidateMedia(shot, selected.candidate, reservation);
    const cameraDecision = deriveAssetCameraFraming({
      parentShot: shot,
      nextShot: selectedMediaShot,
      candidate: selected.candidate,
      index,
      shotCount: list(parentProject.timeline).length,
      outputProfile,
      forceStaticAtomicTransition: Boolean(reservation),
    });
    const nextShot = cameraDecision.shot;
    const motifs = uniqueStrings([
      ...selected.candidate.motifs,
      ...songMotifs.filter((motif) => tokenAffinity(motif, selected.candidate.semanticText) > 0),
    ]).slice(0, 12);
    const visibleEvidence = firstText(selected.candidate.observedSynopsis, selected.candidate.observedVisualText?.[0], selected.candidate.title);
    const opticalPaletteDirection = clone(selected.candidate.opticalProposal || null);
    const lyricReason = lyric.status === "time-overlap"
      ? `aligns with timed lyric “${lyric.citation.text.slice(0, 72)}”`
      : lyric.citation
        ? `uses nearest timed lyric context “${lyric.citation.text.slice(0, 72)}” at ${lyric.distanceSeconds.toFixed(2)}s distance without claiming overlap`
        : "uses explicit lyrics-unavailable context";
    const storyReason = story.status === "canonical-story-beat-match"
      ? `supports human canonical story beat ${story.ids.join(", ")}`
      : story.status === "soft-canon-association-match"
        ? `records soft-canon association ${story.ids.join(", ")} without treating it as canonical story direction`
        : "uses section and canonical song lore; no story-beat match is claimed";
    const continuityReason = selected.score.chainContinuityKind === "declared-transition-entry-anchor"
      ? `enters an authored transition from exact Reference Card ${selected.score.chainReferenceId}`
      : selected.score.chainContinuityKind === "declared-transition-exit-anchor"
        ? `lands on exact transition exit Reference Card ${selected.score.chainReferenceId}`
        : selected.score.chainContinuity > 0
          ? `measured last-to-first neighbor affinity ${selected.score.chainContinuity.toFixed(2)}`
          : "no measured chain edge; preserves the inherited cut boundary without claiming continuity";
    const motionReason = reservation
      ? `atomic ${reservation.role} for ${reservation.transitionJobId || reservation.transitionMediaId}; endpoint identity ${reservation.resolution.endpointIdentityEvidence}`
      : selected.candidate.motionRole?.subtleReferenceLoop
        ? "near-static Reference loop receives the lower hold utility outside a resolved bridge"
        : `motion/editorial utility ${selected.score.transitionBridgeUtility.toFixed(2)}`;
    const rationaleParts = [
      `selects “${selected.candidate.title}” for observed visual evidence “${visibleEvidence.slice(0, 120)}”`,
      ...(opticalPaletteDirection ? [`uses its pending-human optical description and registered First/Mid/Last palette sequence ${opticalPaletteDirection.frames.map((frame) => `${frame.role}:${frame.palette.join("/")}`).join("; ")}`] : []),
      lyricReason,
      storyReason,
      `quality ${selected.candidate.qualityScore.toFixed(2)} / source prior ${selected.candidate.sourcePrior.toFixed(2)}`,
      continuityReason,
      motionReason,
    ];
    nextShot.edit_reason = `Intentional enrichment selection: ${rationaleParts.join("; ")}.`;
    nextShot.decision_evidence = {
      schemaVersion: ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
      truthStatus: "intentional-enrichment-backed",
      selectedMediaId: selected.candidate.mediaId,
      enrichmentId: selected.candidate.enrichmentId,
      qualityScore: selected.candidate.qualityScore,
      sourcePrior: selected.candidate.sourcePrior,
      lyricCitation: lyric.citation,
      explicitLyricsUnavailable: lyric.explicitLyricsUnavailable,
      shot: {
        index: finite(shot.shot_index, index),
        startSeconds: finite(shot.start_sec, 0),
        endSeconds: finite(shot.end_sec, 0),
        sectionId: firstText(shot.section_id),
        sectionLabel: firstText(shot.section_label),
      },
      lyrics: lyric,
      story,
      lore,
      motifs,
      enrichment: {
        id: selected.candidate.enrichmentId,
        coverage: selected.candidate.enrichmentCoverage,
        qualityScore: selected.candidate.qualityScore,
        sourcePrior: selected.candidate.sourcePrior,
        sourceGroup: selected.candidate.sourceGroup,
        lowPriorEligible: selected.candidate.lowPrior,
        motionRole: selected.candidate.motionRole?.kind || "motion-clip",
        opticalProposal: opticalPaletteDirection,
      },
      atomicTransition: reservation ? {
        role: reservation.role,
        centerShotIndex: reservation.center,
        transitionMediaId: reservation.transitionMediaId,
        transitionJobId: reservation.transitionJobId,
        firstReference: clone(reservation.resolution.first),
        lastReference: clone(reservation.resolution.last),
        endpointIdentityEvidence: reservation.resolution.endpointIdentityEvidence,
        visualValidation: {
          schemaVersion: "hapa.echo.transition-shot-visual-certification.v1",
          decision: reservation.resolution.visualValidationDecision,
          jobId: reservation.transitionJobId,
          mediaId: reservation.transitionMediaId,
          videoSha256: reservation.resolution.visualValidation?.videoSha256,
          endpoints: {
            first: clone(reservation.resolution.visualValidation?.first),
            last: clone(reservation.resolution.visualValidation?.last),
          },
          resultDigestSha256: reservation.resolution.visualValidationResultDigestSha256,
        },
        timeMapping: clone(reservation.transitionTimeMap),
      } : null,
      selectedCandidate: compactCandidate(selected.candidate, selected.score),
      sourceBiasCounterfactual: {
        schemaVersion: ECHO_SOURCE_BIAS_COUNTERFACTUAL_SCHEMA,
        method: "full-bounded-search-with-source-prior-neutralized",
        eligibleCandidateCount: candidates.length,
        evaluatedCandidateCount: scoredCandidates.length,
        selectedCandidate: compactCandidate(sourceNeutralWinner.candidate, {
          ...sourceNeutralWinner.score,
          sourceNeutralTotal: sourceNeutralCounterfactualScore(sourceNeutralWinner.score),
        }),
        postPriorSelectedMediaId: selected.candidate.mediaId,
        postPriorSelectedSourceNeutralTotal: sourceNeutralCounterfactualScore(selected.score),
        differsFromPostPrior: sourceNeutralWinner.candidate.technicalIdentity !== selected.candidate.technicalIdentity,
        truthBoundary: "This diagnostic neutralizes only the explicit source prior over the compiler's complete bounded search set; it is comparative evidence, not aesthetic ground truth or causal proof.",
      },
      candidateAlternatives: ranked.slice(1, 4).map((entry) => ({
        ...compactCandidate(entry.candidate, entry.score),
        rejectionReason: alternativeRejectionReason(entry, selected),
      })),
      contextReuse: {
        currentSongId: songId,
        declaredSongContextIds: selected.candidate.declaredSongContextIds,
        crossSongReuse: selected.candidate.declaredSongContextIds.length > 0
          && !selected.candidate.declaredSongContextIds.includes(songId),
        note: selected.candidate.declaredSongContextIds.length > 0
          && !selected.candidate.declaredSongContextIds.includes(songId)
          ? "The visual has catalog context for another song; this reuse is disclosed and the foreign song context did not enter lyric/object scoring."
          : "No undisclosed foreign-song catalog context affected this selection.",
      },
      neighborContinuity: {
        previous: previous ? {
          enrichmentId: previous.enrichmentId,
          technicalIdentity: previous.technicalIdentity,
          chainAffinity: selected.score.chainContinuity,
          kind: selected.score.chainContinuityKind,
          referenceId: selected.score.chainReferenceId,
        } : null,
        next: null,
      },
      preservedDirection: {
        timing: true,
        sections: true,
        stems: true,
        audioBindings: true,
        camera: !cameraDecision.reframed,
        transitions: true,
        visualizerTimeline: true,
        persistentShaders: true,
        runtimeMediaContract: true,
      },
      cameraFraming: cameraDecision.reframed ? {
        status: "rederived-for-selected-media",
        reason: cameraDecision.requirement.reason,
        contractSchema: ECHO_ASSET_CAMERA_FRAMING_SCHEMA,
        parentOrientation: cameraDecision.requirement.parentOrientation,
        selectedOrientation: cameraDecision.requirement.selectedOrientation,
        mediaId: selected.candidate.mediaId,
      } : {
        status: "parent-camera-compatible",
        reason: cameraDecision.requirement.reason,
        parentOrientation: cameraDecision.requirement.parentOrientation,
        selectedOrientation: cameraDecision.requirement.selectedOrientation,
        mediaId: selected.candidate.mediaId,
      },
      rationale: rationaleParts.join("; "),
    };
    if (stableEchoEnrichmentStringify(directionContract(shot)) !== stableEchoEnrichmentStringify(directionContract(nextShot))) {
      throw new Error(`${songId} shot ${index} changed its inherited Director contract.`);
    }
    selections.push({ shot: nextShot, candidate: selected.candidate });
    usageCounts.set(selected.candidate.technicalIdentity, (usageCounts.get(selected.candidate.technicalIdentity) || 0) + 1);
    previous = selected.candidate;
  }
  for (let index = 0; index < selections.length; index += 1) {
    const next = selections[index + 1]?.candidate || null;
    const current = selections[index].candidate;
    const continuity = next ? catalog.continuityEvidence(current, next) : null;
    selections[index].shot.decision_evidence.neighborContinuity.next = next ? {
      enrichmentId: next.enrichmentId,
      technicalIdentity: next.technicalIdentity,
      chainAffinity: continuity.score,
      kind: continuity.kind,
      referenceId: continuity.referenceId,
    } : null;
  }
  const timeline = selections.map((selection) => selection.shot);
  const projectPatch = pickEchoDirectionVariantProjectPatch(parentProject);
  const visualizerTimeline = clone(parentProject.visualizer_timeline || []);
  const persistentShaderSlots = clone(parentProject.persistent_shader_slots || []);
  const parentFingerprint = firstText(parentVariant.fingerprint, parentVariant.contentSha256, echoDirectionVariantFingerprint(parentVariant));
  const compilerInputFingerprint = echoEnrichmentCompilerInputFingerprint({
    songId,
    parentProjectSha256,
    parentVariantId: variantId(parentVariant),
    parentVariantFingerprint: parentFingerprint,
    enrichmentBatchFingerprint: catalog.batchFingerprint,
    songDecisionInputDigest: echoEnrichmentSha256(song),
    assignedTransitionJobIds,
    transitionSelectionBalanceDigest,
    transitionEndpointValidation: catalog.transitionEndpointValidation,
  });
  const visualValidationReceipt = object(catalog.transitionEndpointValidation?.visualValidation);
  const compactCertifiedJobs = list(visualValidationReceipt.jobs).filter((job) => (
    firstText(job.decision).toLowerCase() === "certified"
  )).map((job) => ({
    jobId: firstText(job.jobId, job.job_id),
    mediaId: firstText(job.mediaId, job.media_id),
    videoSha256: firstText(job.video?.actualSha256, job.video?.actual_sha256),
    endpoints: {
      first: {
        frameIndex: finite(job.endpoints?.first?.frameIndex, -1),
        sourceTimeSeconds: finite(job.endpoints?.first?.sourceTimeSeconds, -1),
      },
      last: {
        frameIndex: finite(job.endpoints?.last?.frameIndex, -1),
        sourceTimeSeconds: finite(job.endpoints?.last?.sourceTimeSeconds, -1),
      },
    },
  })).sort((left, right) => left.jobId.localeCompare(right.jobId));
  const transitionEndpointCertification = {
    schemaVersion: "hapa.echo.transition-endpoint-certification-lineage.v1",
    verified: visualValidationReceipt.verified === true,
    sourceSchemaVersion: firstText(
      visualValidationReceipt.sourceSchemaVersion,
      visualValidationReceipt.reportSchemaVersion,
    ),
    resultDigestSha256: firstText(visualValidationReceipt.resultDigestSha256),
    certifiedJobIds: uniqueStrings(visualValidationReceipt.certifiedJobIds).sort(),
    quarantinedJobIds: uniqueStrings(visualValidationReceipt.quarantinedJobIds).sort(),
    certifiedJobs: compactCertifiedJobs,
    certifiedJobLedgerDigestSha256: echoEnrichmentSha256(compactCertifiedJobs),
    mediaLedgerDigestSha256: firstText(
      catalog.transitionEndpointValidation?.visualMediaFiles?.ledgerDigestSha256,
    ),
  };
  const semanticPayload = {
    compiler: ECHO_ENRICHMENT_DIRECTOR_COMPILER,
    compilerInputFingerprint,
    songId,
    parentProjectSha256,
    parentVariantId: variantId(parentVariant),
    parentVariantFingerprint: parentFingerprint,
    supersedesCreatedAt,
    enrichmentBatchFingerprint: catalog.batchFingerprint,
    transitionEndpointValidation: clone(catalog.transitionEndpointValidation),
    timeline,
    visualizerTimeline,
    persistentShaderSlots,
    projectPatch,
  };
  const contentSha256 = echoEnrichmentSha256(semanticPayload);
  const id = `intentional-enrichment-${catalog.batchFingerprint.slice(0, 12)}-${contentSha256.slice(0, 16)}`;
  const createdAt = deterministicTimestamp(catalog, parentVariant, supersedesCreatedAt);
  const projectedProject = {
    ...clone(parentProject),
    ...clone(projectPatch),
    timeline,
    visualizer_timeline: visualizerTimeline,
    persistent_shader_slots: persistentShaderSlots,
  };
  const selectedIdentities = new Set(timeline.map((shot) => shot.media_technical_identity).filter(Boolean));
  const transitionPlaybackRates = transitionPlan.placed
    .map((row) => finite(row.transitionTimeMap?.playbackRate, Number.NaN))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const transitionPlaybackRateMedian = transitionPlaybackRates.length
    ? transitionPlaybackRates.length % 2
      ? transitionPlaybackRates[Math.floor(transitionPlaybackRates.length / 2)]
      : (transitionPlaybackRates[(transitionPlaybackRates.length / 2) - 1]
        + transitionPlaybackRates[transitionPlaybackRates.length / 2]) / 2
    : null;
  const transitionSeconds = timeline.filter((shot) => (
    shot.decision_evidence?.atomicTransition?.role === "authored-transition"
  )).reduce((sum, shot) => sum + Math.max(0, finite(shot.end_sec) - finite(shot.start_sec)), 0);
  const referenceStillHoldSeconds = timeline.filter((shot) => (
    ["entry-reference-still", "exit-reference-still"].includes(
      shot.decision_evidence?.atomicTransition?.role,
    )
  )).reduce((sum, shot) => sum + Math.max(0, finite(shot.end_sec) - finite(shot.start_sec)), 0);
  const sourceSelections = {};
  for (const shot of timeline) sourceSelections[shot.media_source_group || "unknown"] = (sourceSelections[shot.media_source_group || "unknown"] || 0) + 1;
  const variant = {
    schemaVersion: ECHO_ENRICHMENT_DIRECTOR_VARIANT_SCHEMA,
    id,
    title: `${firstText(baseProject.song_title, song.title, songId)} · Intentional Enrichment · Motion Bridges`,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    contentSha256,
    fingerprint: contentSha256,
    parent: {
      songId,
      projectSha256: parentProjectSha256,
      variantId: variantId(parentVariant),
      variantFingerprint: parentFingerprint,
      immutableLegacyProject: true,
      immutableParentVariant: true,
    },
    lineage: {
      kind: "append-only-intentional-enrichment",
      compiler: ECHO_ENRICHMENT_DIRECTOR_COMPILER,
      compilerInputFingerprint,
      transitionSelectionBalanceDigest,
      parentVariantId: variantId(parentVariant),
      parentVariantFingerprint: parentFingerprint,
      sourceArtifactSchemas: {
        enrichments: ECHO_VIDEO_ENRICHMENT_ROW_SCHEMA,
        chainGraph: firstText(chainGraph.schemaVersion, chainGraph.schema_version) || null,
        report: firstText(report.schemaVersion, report.schema_version) || null,
        transitionEndpointVisualValidation: firstText(
          visualValidationReceipt.sourceSchemaVersion,
          visualValidationReceipt.reportSchemaVersion,
        ) || null,
      },
      transitionEndpointCertification,
      appendOnly: true,
    },
    variationSet: {
      id: `echo-video-enrichment-${catalog.batchFingerprint.slice(0, 16)}-motion-bridge-v6`,
      label: "Echo Video Enrichment · Intentional Cuts · Full-Source Motion Bridge V6",
      batchFingerprint: `sha256:${catalog.batchFingerprint}`,
      appendOnly: true,
    },
    cut: { ordinal: 5, label: "Intentional Enrichment · Full-Source Motion Bridges" },
    sourcePolicy: {
      mode: "semantic-quality-resolved-motion-bridge-weighted",
      lowPriorSourcesEligible: true,
      lowPriorSources: ["LTX", "hapa-dev-proto", "Hell Week"],
      lowPriorTreatment: "eligible-but-downweighted",
      deterministicTieBreak: "technical-identity-ascending",
      exactParentDirectionContract: false,
      exactParentNonCameraDirectionContract: true,
      assetAwareCameraReframing: true,
      cameraReframeTriggers: ["selected-media-orientation-changed", "replaces-generated-visualizer-or-no-media"],
      transitionPolicy: {
        placement: "atomic-interior-certified-reference-still-transition-still-triplets",
        endpointIdentity: ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE,
        assignedSongsPreferred: true,
        semanticSupplement: {
          enabled: true,
          targetTransitionsPerSong: ECHO_TARGET_TRANSITIONS_PER_SONG,
          minimumContextAffinity: ECHO_INFERRED_TRANSITION_MIN_CONTEXT_AFFINITY,
          songRelativeSemanticCohort: "at-least-70%-of-best-affinity",
          albumBalance: "least-used-certified-job-within-semantic-cohort",
          explicitAssignmentsPreseeded: true,
          deterministicDiversityPrior: "song+job-hash-after-album-usage-count",
        },
        adaptiveReferenceLoopsReservationOnly: true,
        transitionRoleMultiplier: 1.3,
        subtleReferenceLoopRoleMultiplier: 0.92,
        sceneMotionRoleMultiplier: 1.08,
        firstOrLastAllowed: false,
        adjacentTransitionsAllowed: false,
        timeMapSchema: ECHO_TRANSITION_TIME_MAP_SCHEMA,
        timeMapMode: "fit-source-once-to-cue",
        maximumPlaybackRate: ECHO_TRANSITION_MAX_PLAYBACK_RATE,
        sourceTimeOrigin: "logical-cue-start",
        timingPreference: "global-non-overlapping-plan-maximizes-transition-motion-share-before-near-native-playback-and-contextual-ties",
      },
    },
    timeline,
    visualizer_timeline: visualizerTimeline,
    persistent_shader_slots: persistentShaderSlots,
    project_patch: projectPatch,
    selectionEvidence: topLevelSelectionEvidence(timeline),
    telemetry: {
      selectionMode: "intentional-enrichment",
      candidateCount: candidates.length,
      enrichmentRows: catalog.rows.length,
      enrichmentRowsWithPlayableUri: catalog.rows.filter((row) => row.uri && row.playable !== false).length,
      enrichmentRowsMissingSemanticText: catalog.rows.filter((row) => row.missing.includes("semantic-text")).length,
      replacementShots: timeline.filter((shot, index) => shot.media_technical_identity !== parentProject.timeline[index]?.media_technical_identity).length,
      mediaBearingShots: timeline.filter((shot) => shot.media_uri).length,
      assetReframedShots: timeline.filter((shot) => shot.camera_framing_contract?.derived === true).length,
      uniqueMedia: selectedIdentities.size,
      selectionsBySource: sourceSelections,
      lowPriorSelections: timeline.filter((shot) => shot.decision_evidence?.enrichment?.lowPriorEligible).length,
      lyricsUnavailableShots: timeline.filter((shot) => shot.decision_evidence?.lyrics?.explicitLyricsUnavailable).length,
      assignedTransitions: transitionPlan.assignedTransitions,
      inferredTransitions: transitionPlan.inferredTransitions,
      plannedTransitions: transitionPlan.plannedTransitions,
      explicitTransitionPlacements: transitionPlan.placed.filter((row) => row.selection?.kind === "explicit-assignment").length,
      inferredTransitionPlacements: transitionPlan.placed.filter((row) => row.selection?.kind === "semantic-supplement").length,
      placedTransitions: transitionPlan.placed.length,
      rejectedTransitions: transitionPlan.rejected.length,
      transitionPlan: clone(transitionPlan.placed),
      transitionSelectionBalanceDigest,
      transitionRejections: clone(transitionPlan.rejected),
      selectedTransitionShots: timeline.filter((shot) => shot.decision_evidence?.atomicTransition?.role === "authored-transition").length,
      selectedUniqueTransitionJobs: [...new Set(transitionPlan.placed
        .map((row) => row.jobId)
        .filter(Boolean))].sort(),
      transitionSeconds: Number(transitionSeconds.toFixed(3)),
      referenceStillHoldShots: timeline.filter((shot) => (
        ["entry-reference-still", "exit-reference-still"].includes(
          shot.decision_evidence?.atomicTransition?.role,
        )
      )).length,
      referenceStillHoldSeconds: Number(referenceStillHoldSeconds.toFixed(3)),
      transitionMotionShare: transitionSeconds + referenceStillHoldSeconds > 0
        ? Number((transitionSeconds / (transitionSeconds + referenceStillHoldSeconds)).toFixed(6))
        : null,
      transitionPlaybackRate: {
        count: transitionPlaybackRates.length,
        minimum: transitionPlaybackRates[0] ?? null,
        median: transitionPlaybackRateMedian === null ? null : Number(transitionPlaybackRateMedian.toFixed(6)),
        maximum: transitionPlaybackRates.at(-1) ?? null,
      },
      selectedSceneMotionShots: timeline.filter((shot) => (
        shot.decision_evidence?.selectedCandidate?.motionRole?.kind === "motion-clip"
      )).length,
      selectedLoopShots: timeline.filter((shot) => (
        shot.decision_evidence?.selectedCandidate?.motionRole?.kind === "loop"
      )).length,
      selectedSubtleReferenceLoops: timeline.filter((shot) => shot.decision_evidence?.selectedCandidate?.motionRole?.subtleReferenceLoop).length,
    },
    hyperframe_script: generateEchoHyperframeScript(projectedProject),
  };
  const validation = validateEchoEnrichmentDirectorVariant({ parentProject, parentVariant, variant });
  if (!validation.ok) throw new Error(`${songId} intentional enrichment cut failed validation: ${validation.reasons.join(", ")}`);
  variant.validation = validation;
  return variant;
}

export const buildEchoEnrichmentDirectorVariant = compileEchoEnrichmentDirectorVariant;

export function echoEnrichmentDirectorVariantIndexRow(songId, variant) {
  return {
    id: `${songId}:${variant.id}`,
    songId,
    variantId: variant.id,
    title: variant.title,
    schemaVersion: variant.schemaVersion,
    relativePath: `${songId}/${variant.id}.json`,
    parentProjectSha256: variant.parent?.projectSha256 || "",
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
    status: variant.status,
    timelineCount: list(variant.timeline).length,
    hasHyperframeScript: Boolean(variant.hyperframe_script),
    variationSet: clone(variant.variationSet),
    cut: clone(variant.cut),
    sourcePolicy: clone(variant.sourcePolicy),
    replacementShots: variant.telemetry?.replacementShots,
    sourceSelections: clone(variant.telemetry?.selectionsBySource),
    uniqueMedia: variant.telemetry?.uniqueMedia,
    mediaBearingShots: variant.telemetry?.mediaBearingShots,
    telemetry: clone(variant.telemetry),
    fingerprint: variant.contentSha256,
    contentSha256: variant.contentSha256,
  };
}
