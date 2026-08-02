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

export const ECHO_VIDEO_ENRICHMENT_ROW_SCHEMA = "hapa.echo.video-enrichment.v1";
export const ECHO_VIDEO_ENRICHMENT_CATALOG_SCHEMA = "hapa.echo.video-enrichment-catalog.v1";
export const ECHO_ENRICHMENT_DIRECTOR_VARIANT_SCHEMA = "hapa.echo.direction-script-variant.v1";
export const ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA = "hapa.echo.shot-decision-evidence.v4";
export const ECHO_ASSET_CAMERA_FRAMING_SCHEMA = "hapa.echo.asset-camera-framing.v2";
const ECHO_ENRICHMENT_CAMERA_COMPILER = "echo-intentional-enrichment-v3-top-origin-asset-camera";
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
    ],
    tolerance: "Missing optional fields receive explicit neutral or unavailable evidence; rows without a playable URI can annotate matching parent media but are not added as standalone media candidates.",
  },
  chainGraphJson: {
    accepted: ["{edges:[{from,to,weight?,relation?}]} ", "{adjacency:{id:[id|{id,weight}]}}", "{nodes:[{id,neighbors:[]}]}"],
    tolerance: "Missing or unresolved edges contribute zero continuity weight and never make a media candidate ineligible.",
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
const DIRECTION_EVIDENCE_FIELDS = new Set([
  ...MEDIA_FIELDS,
  ...CAMERA_REFRAME_FIELDS,
  "decision_evidence",
  "edit_reason",
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
  if (Object.keys(declared).length) return {
    ...clone(declared),
    ...(dimensions ? { dimensions } : {}),
  };
  if (!uri) return null;
  const technical = object(row.technical);
  const hash = object(row.contentHash || row.content_hash);
  const type = /\.(?:png|jpe?g|webp|gif|avif)(?:$|[?#])/iu.test(uri) ? "image" : "video";
  return {
    schemaVersion: "hapa.echo.playback-media.v2",
    type,
    originalUri: uri,
    runtimeUri: uri,
    playbackMode: type === "video" ? "loop" : "hold",
    ...(finite(technical.durationSec ?? technical.durationSeconds, 0) > 0 ? {
      actualDurationSeconds: finite(technical.durationSec ?? technical.durationSeconds, 0),
    } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(firstText(hash.value, row.sha256) ? { contentHash: firstText(hash.value, row.sha256).replace(/^sha256:/iu, "") } : {}),
    provenance: "synthesized-from-enrichment-uri",
  };
}

export function normalizeEchoVideoEnrichmentRow(row = {}, index = 0) {
  const source = object(row.source || row.provenance || row.origin);
  const media = object(row.media || row.asset || row.video || row.hapaMedia || row.hapa_media);
  const semantic = object(row.semantic || row.semantics || row.analysis || row.enrichment);
  const recognition = object(row.recognition);
  const quality = object(row.quality || row.scores || row.score);
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
    ...motifs, ...flattenText(story), ...flattenText(lore),
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
  const mediaContract = normalizeMediaContract(row, uri);
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
    canonContextText,
    declaredSongContextIds,
    motifs,
    story,
    lore,
    songIds: uniqueStrings([
      ...list(row.songIds), ...list(row.song_ids), ...list(semantic.songIds),
      row.songId, row.song_id,
    ]),
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

function declaredFingerprint(report = {}) {
  const candidate = firstText(report.batchFingerprint, report.batch_fingerprint, report.contentSha256, report.content_sha256, report.corpusSha256, report.corpus_sha256)
    .replace(/^sha256:/iu, "").toLowerCase();
  return /^[a-f0-9]{64}$/u.test(candidate) ? candidate : "";
}

function validTimestamp(...values) {
  for (const value of values) {
    const parsed = Date.parse(text(value));
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

export function buildEchoVideoEnrichmentCatalog({ enrichments = [], chainGraph = {}, report = {} } = {}) {
  const rows = list(enrichments).map(normalizeEchoVideoEnrichmentRow)
    .sort((left, right) => left.enrichmentId.localeCompare(right.enrichmentId));
  const edges = normalizedChainEdges(chainGraph);
  const computedFingerprint = echoEnrichmentSha256({ rows, edges });
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
    const forward = adjacency.get(edge.from) || new Map();
    forward.set(edge.to, Math.max(finite(forward.get(edge.to), 0), edge.weight));
    adjacency.set(edge.from, forward);
  }
  return {
    schemaVersion: ECHO_VIDEO_ENRICHMENT_CATALOG_SCHEMA,
    rows,
    edges,
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
    find(value = {}) {
      for (const key of [
        value.enrichmentId, value.enrichment_id, value.mediaId, value.media_id,
        value.technicalIdentity, value.media_technical_identity,
        value.uri, value.media_uri, value.runtime_media_uri,
      ].filter(Boolean)) {
        const match = byKey.get(String(key).toLowerCase());
        if (match) return match;
      }
      return null;
    },
    affinity(leftKeys = [], rightKeys = []) {
      let maximum = 0;
      for (const left of list(leftKeys).filter(Boolean)) {
        const neighbors = adjacency.get(String(left));
        if (!neighbors) continue;
        for (const right of list(rightKeys).filter(Boolean)) maximum = Math.max(maximum, finite(neighbors.get(String(right)), 0));
      }
      return clamp(maximum);
    },
    neighborKeys(leftKeys = [], limit = 96) {
      const weighted = new Map();
      for (const left of list(leftKeys).filter(Boolean)) {
        for (const [target, weight] of adjacency.get(String(left)) || []) {
          weighted.set(target, Math.max(finite(weighted.get(target), 0), finite(weight, 0)));
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
    canonContextText: row.canonContextText,
    declaredSongContextIds: row.declaredSongContextIds,
    motifs: row.motifs,
    story: clone(row.story),
    lore: clone(row.lore),
    songIds: row.songIds,
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
  for (const row of catalog.rows) insert(candidateFromRow(row));
  for (const shot of list(parentProject.timeline)) insert(candidateFromShot(shot, catalog));
  return [...byIdentity.values()].sort((left, right) => (
    left.technicalIdentity.localeCompare(right.technicalIdentity)
  ));
}

function buildCandidateSearchIndex(candidates) {
  const byToken = new Map();
  const byKey = new Map();
  for (const candidate of candidates) {
    candidate.observedVisualTokenSet = tokens(candidate.observedVisualText);
    candidate.canonContextTokenSet = tokens(candidate.canonContextText);
    candidate.searchTokenSet = tokens([candidate.observedVisualText, candidate.canonContextText, candidate.motifs]);
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
  return { byToken, byKey, fallback, intrinsicFallback };
}

function shortlistCandidates(search, targetContext, previous, neighborKeys = [], limit = 384) {
  const wanted = tokens(targetContext);
  const matches = new Map();
  for (const token of wanted) {
    for (const candidate of search.byToken.get(token) || []) {
      const row = matches.get(candidate.technicalIdentity) || { candidate, tokenMatches: 0 };
      row.tokenMatches += 1;
      matches.set(candidate.technicalIdentity, row);
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
  for (const candidate of search.intrinsicFallback) add(candidate);
  for (const candidate of search.fallback) add(candidate);
  for (const candidate of ranked) add(candidate);
  return [...byIdentity.values()];
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

function sourceScore(candidate, targetContext, previous, catalog, priorUses = 0) {
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
  const chainContinuity = previous ? catalog.affinity(candidateKeys(previous), candidateKeys(candidate)) : 0;
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
    cameraAspectSuitability: candidate.mediaContract ? 1 : 0.5,
    technicalTruth: candidate.technicalIdentity ? 1 : 0,
    noveltyRepetitionControl: priorUses > 0 ? 0 : 1,
    sourceClassification: candidate.sourceClassification,
    sourcePrior: { prior: candidate.sourcePrior },
    fatigueMultiplier,
    eligible: true,
  });
  return {
    total: scored.finalScore,
    lyricAffinity: Number(lyricAffinity.toFixed(6)),
    canonAffinity: Number(canonAffinity.toFixed(6)),
    objectActionAffinity: Number(objectActionAffinity.toFixed(6)),
    emotionAffinity: Number(emotionAffinity.toFixed(6)),
    quality: Number(candidate.qualityScore.toFixed(6)),
    sourcePrior: scored.sourcePrior,
    sourceClass: scored.sourceClass,
    chainContinuity: Number(chainContinuity.toFixed(6)),
    fatigueMultiplier: scored.fatigueMultiplier,
    baseScore: scored.baseScore,
    formula: scored.formula,
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
} = {}) {
  const requirement = cameraReframeRequirement(parentShot, nextShot);
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
  const role = classifyMediaRole({
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
  const cropRetention = sourceAspect >= targetAspect
    ? targetAspect / sourceAspect
    : sourceAspect / targetAspect;
  const motion = cameraMotionForReplacement({
    sourceOrientation,
    targetOrientation,
    index,
    isFinal: index === shotCount - 1,
  });
  const intensity = Number((0.9 + Math.min(0.45, (1 - cropRetention) * 0.7)).toFixed(2));
  const speed = Number((Math.max(0.9, Math.min(1.2, 1.08 + (6 - Math.max(1, endSeconds - startSeconds)) * 0.015))).toFixed(2));
  const focus = cameraFocusForROI(analysis.subjectROI);
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
    cropPolicy: "aspect-cover-full-bleed",
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

function applyCandidateMedia(shot, candidate) {
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
    declaredSongContextIds: candidate.declaredSongContextIds,
    score,
  };
}

function alternativeRejectionReason(alternative, selected) {
  const fields = ["lyricAffinity", "canonAffinity", "objectActionAffinity", "emotionAffinity", "quality", "chainContinuity"];
  const leading = fields.map((field) => ({ field, delta: finite(selected.score[field]) - finite(alternative.score[field]) }))
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.field.localeCompare(right.field))[0];
  return `lower intentional-fit score ${alternative.score.total.toFixed(4)} vs ${selected.score.total.toFixed(4)} (delta ${(selected.score.total - alternative.score.total).toFixed(4)}; largest component delta ${leading.field} ${leading.delta.toFixed(4)})`;
}

function sourceNeutralCounterfactualScore(score = {}) {
  return Number((finite(score.baseScore, 0) * finite(score.fatigueMultiplier, 1)).toFixed(6));
}

function deterministicTimestamp(catalog, parentVariant) {
  const parentMilliseconds = variantTimestamp(parentVariant);
  const catalogMilliseconds = Date.parse(catalog.generatedAt || "");
  const effective = Math.max(
    Number.isFinite(parentMilliseconds) ? parentMilliseconds + 1 : Date.parse("2026-01-01T00:00:00.000Z"),
    Number.isFinite(catalogMilliseconds) ? catalogMilliseconds : Number.NEGATIVE_INFINITY,
  );
  // The top-origin framing generation supersedes the earlier asset-camera
  // generation while remaining deterministic for the same catalog and parent.
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
  if (variant.schemaVersion !== ECHO_ENRICHMENT_DIRECTOR_VARIANT_SCHEMA) reasons.push("variant-schema");
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
    const cameraRequirement = cameraReframeRequirement(sourceTimeline[index], nextTimeline[index]);
    const cameraChanged = stableEchoEnrichmentStringify(cameraState(sourceTimeline[index]))
      !== stableEchoEnrichmentStringify(cameraState(nextTimeline[index]));
    const framingContract = nextTimeline[index]?.camera_framing_contract;
    if (cameraRequirement.required) {
      if (!cameraChanged) reasons.push(`shot-${index}-camera-not-rederived`);
      const framingValidation = validateAssetCameraFramingContract(framingContract, nextTimeline[index]);
      for (const reason of framingValidation.reasons) reasons.push(`shot-${index}-camera-${reason}`);
      if (nextTimeline[index]?.decision_evidence?.preservedDirection?.camera !== false) {
        reasons.push(`shot-${index}-camera-falsely-preserved`);
      }
    } else {
      if (cameraChanged) reasons.push(`shot-${index}-camera-unjustified-change`);
      if (framingContract) reasons.push(`shot-${index}-camera-unnecessary-contract`);
      if (nextTimeline[index]?.decision_evidence?.preservedDirection?.camera !== true) {
        reasons.push(`shot-${index}-camera-preservation-evidence`);
      }
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
  enrichments = [],
  chainGraph = {},
  report = {},
  catalog: suppliedCatalog = null,
} = {}) {
  const songId = firstText(baseProject.song_id, baseProject.songId, song.id, song.cardId);
  if (!songId) throw new Error("An Echo song/project ID is required.");
  if (!variantId(parentVariant)) throw new Error(`${songId} requires a latest non-legacy parent Director cut.`);
  const parentProject = deriveEchoEnrichmentParentProject(baseProject, parentVariant);
  if (!list(parentProject.timeline).length) throw new Error(`${songId} parent Director cut has no shots.`);
  const catalog = suppliedCatalog || buildEchoVideoEnrichmentCatalog({ enrichments, chainGraph, report });
  const candidates = candidatePool(parentProject, catalog, songId);
  if (!candidates.length) throw new Error(`${songId} has no playable parent or enrichment media candidates.`);
  const candidateSearch = buildCandidateSearchIndex(candidates);
  const outputProfile = resolveEchoOutputProfile(
    parentProject.output_profile || parentProject.outputProfile || baseProject.output_profile || baseProject.outputProfile,
  );
  const lyrics = lyricRows(parentProject, song);
  const lore = loreEvidence(song);
  const songMotifs = uniqueStrings([
    ...list(song.motifs), ...list(song.tags), ...list(song.enrichment?.motifs),
    lore.mood, ...flattenText(song.contextualLayers),
  ]);
  const selections = [];
  const usageCounts = new Map();
  let previous = null;
  for (const [index, shot] of list(parentProject.timeline).entries()) {
    const lyric = lyricEvidence(lyrics, shot);
    const story = storyBeatEvidence(song, shot, lyric);
    const matchedCanonicalStory = story.status === "canonical-story-beat-match" ? story.summary : "";
    const targetContext = {
      lyric: [lyric.citation?.text, shot.section_label, shot.section_type],
      canon: [matchedCanonicalStory, lore.summary, songMotifs],
      objectAction: [lyric.citation?.text, shot.section_label, shot.section_type],
      emotion: [lyric.citation?.text, lore.mood, songMotifs, shot.section_type],
    };
    const targetTokenSet = tokens(Object.values(targetContext));
    const shotCandidates = shortlistCandidates(
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
      ),
    }));
    const ranked = [...scoredCandidates].sort((left, right) => (
      right.score.total - left.score.total
      || left.candidate.technicalIdentity.localeCompare(right.candidate.technicalIdentity)
    ));
    const sourceNeutralWinner = [...scoredCandidates].sort((left, right) => (
      sourceNeutralCounterfactualScore(right.score) - sourceNeutralCounterfactualScore(left.score)
      || left.candidate.technicalIdentity.localeCompare(right.candidate.technicalIdentity)
    ))[0];
    const selected = ranked[0];
    if (!selected?.candidate?.playable
      || !["direct-enrichment-row", "matched-parent-media"].includes(selected.candidate.enrichmentCoverage)) {
      throw new Error(`${songId} shot ${index} did not resolve to a playable enrichment-backed catalog candidate.`);
    }
    const selectedMediaShot = applyCandidateMedia(shot, selected.candidate);
    const cameraDecision = deriveAssetCameraFraming({
      parentShot: shot,
      nextShot: selectedMediaShot,
      candidate: selected.candidate,
      index,
      shotCount: list(parentProject.timeline).length,
      outputProfile,
    });
    const nextShot = cameraDecision.shot;
    const motifs = uniqueStrings([
      ...selected.candidate.motifs,
      ...songMotifs.filter((motif) => tokenAffinity(motif, selected.candidate.semanticText) > 0),
    ]).slice(0, 12);
    const visibleEvidence = firstText(selected.candidate.observedSynopsis, selected.candidate.observedVisualText?.[0], selected.candidate.title);
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
    const rationaleParts = [
      `selects “${selected.candidate.title}” for observed visual evidence “${visibleEvidence.slice(0, 120)}”`,
      lyricReason,
      storyReason,
      `quality ${selected.candidate.qualityScore.toFixed(2)} / source prior ${selected.candidate.sourcePrior.toFixed(2)}`,
      selected.score.chainContinuity > 0 ? `measured neighbor affinity ${selected.score.chainContinuity.toFixed(2)}` : "no measured chain edge; preserves the inherited cut boundary without claiming continuity",
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
      },
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
    selections[index].shot.decision_evidence.neighborContinuity.next = next ? {
      enrichmentId: next.enrichmentId,
      technicalIdentity: next.technicalIdentity,
      chainAffinity: catalog.affinity(candidateKeys(current), candidateKeys(next)),
    } : null;
  }
  const timeline = selections.map((selection) => selection.shot);
  const projectPatch = pickEchoDirectionVariantProjectPatch(parentProject);
  const visualizerTimeline = clone(parentProject.visualizer_timeline || []);
  const persistentShaderSlots = clone(parentProject.persistent_shader_slots || []);
  const parentFingerprint = firstText(parentVariant.fingerprint, parentVariant.contentSha256, echoDirectionVariantFingerprint(parentVariant));
  const semanticPayload = {
    compiler: ECHO_ENRICHMENT_CAMERA_COMPILER,
    songId,
    parentProjectSha256,
    parentVariantId: variantId(parentVariant),
    parentVariantFingerprint: parentFingerprint,
    enrichmentBatchFingerprint: catalog.batchFingerprint,
    timeline,
    visualizerTimeline,
    persistentShaderSlots,
    projectPatch,
  };
  const contentSha256 = echoEnrichmentSha256(semanticPayload);
  const id = `intentional-enrichment-${catalog.batchFingerprint.slice(0, 12)}-${contentSha256.slice(0, 16)}`;
  const createdAt = deterministicTimestamp(catalog, parentVariant);
  const projectedProject = {
    ...clone(parentProject),
    ...clone(projectPatch),
    timeline,
    visualizer_timeline: visualizerTimeline,
    persistent_shader_slots: persistentShaderSlots,
  };
  const selectedIdentities = new Set(timeline.map((shot) => shot.media_technical_identity).filter(Boolean));
  const sourceSelections = {};
  for (const shot of timeline) sourceSelections[shot.media_source_group || "unknown"] = (sourceSelections[shot.media_source_group || "unknown"] || 0) + 1;
  const variant = {
    schemaVersion: ECHO_ENRICHMENT_DIRECTOR_VARIANT_SCHEMA,
    id,
    title: `${firstText(baseProject.song_title, song.title, songId)} · Intentional Enrichment · Asset-Aware Camera`,
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
      parentVariantId: variantId(parentVariant),
      parentVariantFingerprint: parentFingerprint,
      sourceArtifactSchemas: {
        enrichments: ECHO_VIDEO_ENRICHMENT_ROW_SCHEMA,
        chainGraph: firstText(chainGraph.schemaVersion, chainGraph.schema_version) || null,
        report: firstText(report.schemaVersion, report.schema_version) || null,
      },
      appendOnly: true,
    },
    variationSet: {
      id: `echo-video-enrichment-${catalog.batchFingerprint.slice(0, 16)}-camera-v2`,
      label: "Echo Video Enrichment · Intentional Cuts · Camera V2",
      batchFingerprint: `sha256:${catalog.batchFingerprint}`,
      appendOnly: true,
    },
    cut: { ordinal: 2, label: "Intentional Enrichment · Asset-Aware Camera" },
    sourcePolicy: {
      mode: "semantic-quality-continuity-weighted",
      lowPriorSourcesEligible: true,
      lowPriorSources: ["LTX", "hapa-dev-proto", "Hell Week"],
      lowPriorTreatment: "eligible-but-downweighted",
      deterministicTieBreak: "technical-identity-ascending",
      exactParentDirectionContract: false,
      exactParentNonCameraDirectionContract: true,
      assetAwareCameraReframing: true,
      cameraReframeTriggers: ["selected-media-orientation-changed", "replaces-generated-visualizer-or-no-media"],
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
