import {
  ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
  ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE,
  ECHO_TRANSITION_MAX_PLAYBACK_RATE,
  ECHO_TRANSITION_TIME_MAP_SCHEMA,
  echoEnrichmentSha256,
  stableEchoEnrichmentStringify,
} from "./echo-enrichment-director-variant.js";

export const ECHO_ENRICHMENT_AUDIT_SCHEMA = "hapa.echo.video-enrichment-audit.v1";
export const ECHO_ENRICHMENT_SUPPORTED_SHOT_EVIDENCE_SCHEMAS = Object.freeze([
  "hapa.echo.shot-decision-evidence.v4",
  "hapa.echo.shot-decision-evidence.v5",
  ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
]);

const CANONICAL_STORY_AFFINITY_MINIMUM = 0.1;
const SUPPORTED_SHOT_EVIDENCE_SCHEMAS = new Set(ECHO_ENRICHMENT_SUPPORTED_SHOT_EVIDENCE_SCHEMAS);
const ATOMIC_TRANSITION_ROLES = new Set([
  "entry-reference-loop",
  "entry-reference-still",
  "authored-transition",
  "exit-reference-loop",
  "exit-reference-still",
]);
const ECHO_ENRICHMENT_ATOMIC_SHOT_EVIDENCE_SCHEMAS = new Set([
  "hapa.echo.shot-decision-evidence.v5",
  ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
]);
const ATOMIC_ENDPOINT_IDENTITY_EVIDENCE_BY_SCHEMA = Object.freeze({
  "hapa.echo.shot-decision-evidence.v5": "declared-card-lineage+poster-uri-match",
  [ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA]: ECHO_TRANSITION_ENDPOINT_IDENTITY_EVIDENCE,
});
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function median(values = []) {
  const ordered = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function fixed(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function enrichmentId(row = {}) {
  return text(row.id || row.mediaId || row.canonicalMediaId);
}

function contentHash(row = {}) {
  const value = text(row.contentHash?.value || row.sha256 || row.contentSha256).replace(/^sha256:/u, "");
  return /^[a-f0-9]{64}$/u.test(value) ? value : "";
}

function qualityScore(row = {}) {
  return number(row.quality?.score ?? row.intrinsicQuality?.score, null);
}

function qualityPercentile(row = {}) {
  return number(row.quality?.percentile ?? row.intrinsicQuality?.percentile, null);
}

function sourceClass(row = {}) {
  return text(row.sourcePrior?.sourceClass || row.sourceClassification?.sourceClass || row.sourceClass) || "unknown";
}

function sourcePrior(row = {}) {
  return number(row.sourcePrior?.prior ?? row.sourcePrior?.multiplier ?? row.sourceClassification?.prior, null);
}

function runtimeUri(row = {}) {
  return text(
    row.runtimeUri
      || row.uri
      || row.original?.uri
      || list(row.renditions).find((item) => ["runtime", "playback", "proxy"].includes(item?.role))?.uri,
  );
}

function normalizedFrameMarkers(row = {}) {
  const frames = list(row.recognition?.frames || row.frames);
  return new Set(frames.map((frame) => text(frame.marker || frame.role).toLowerCase()).map((marker) => (
    marker === "middle" ? "mid" : marker
  )));
}

function normalizedFrameEvidence(row = {}) {
  const frames = list(row.recognition?.frames || row.frames);
  return new Map(frames.map((frame) => {
    const marker = text(frame.marker || frame.role).toLowerCase() === "middle"
      ? "mid"
      : text(frame.marker || frame.role).toLowerCase();
    return [marker, frame];
  }).filter(([marker]) => marker));
}

function normalizedTags(row = {}) {
  return list(row.recognition?.tags || row.tags).map((tag) => text(tag?.tag || tag?.value || tag)).filter(Boolean);
}

function hasSynopsis(row = {}) {
  return Boolean(text(row.recognition?.synopsis || row.synopsis) && text(row.recognition?.arcSynopsis || row.arcSynopsis));
}

function flowStatus(row = {}) {
  const loop = text(row.flow?.loop?.classification || row.loop?.classification);
  const transition = text(row.flow?.transition?.classification || row.transition?.classification);
  return { loop, transition };
}

export function auditEchoVideoEnrichments({ manifest = [], enrichments = [], chainEdges = [] } = {}) {
  const manifestRows = list(manifest);
  const rows = list(enrichments);
  const edges = list(chainEdges);
  const manifestIds = new Set(manifestRows.map(enrichmentId).filter(Boolean));
  const byId = new Map();
  const blockers = [];
  const warnings = [];
  let sourceCorruptVideos = 0;
  let staticSingleFrameAssets = 0;

  for (const row of rows) {
    const id = enrichmentId(row);
    if (!id) {
      blockers.push({ code: "missing-enrichment-id" });
      continue;
    }
    if (byId.has(id)) blockers.push({ code: "duplicate-enrichment-id", mediaId: id });
    byId.set(id, row);
    if (!contentHash(row)) blockers.push({ code: "missing-full-sha256", mediaId: id });
    if (!runtimeUri(row)) warnings.push({ code: "missing-runtime-uri-not-director-eligible", mediaId: id });
    const markers = normalizedFrameMarkers(row);
    const frameEvidence = normalizedFrameEvidence(row);
    const decodeStatus = text(row.decodeStatus || row.technical?.status).toLowerCase();
    const sourceCorrupt = ["decode-failed", "unreadable", "invalid"].includes(decodeStatus);
    const staticSingleFrame = text(row.mediaKind) === "static-single-frame";
    if (sourceCorrupt) sourceCorruptVideos += 1;
    if (staticSingleFrame) staticSingleFrameAssets += 1;
    if (sourceCorrupt && row.playable === true) blockers.push({ code: "decode-failed-video-marked-playable", mediaId: id });
    for (const marker of ["first", "mid", "last"]) {
      if (!markers.has(marker)) {
        blockers.push({ code: `missing-${marker}-frame-evaluation`, mediaId: id });
        continue;
      }
      const frame = frameEvidence.get(marker) || {};
      const evaluationStatus = text(frame.evaluationStatus || frame.status).toLowerCase();
      const explicitlyUnavailable = frame.available === false
        && evaluationStatus === "unavailable"
        && Boolean(text(frame.unavailableReason || frame.reason));
      if (!sourceCorrupt && (frame.available === false || ["unavailable", "failed", "error"].includes(evaluationStatus))) {
        blockers.push({ code: "decoded-video-frame-evaluation-unavailable", mediaId: id, marker, status: evaluationStatus || null });
      } else if (sourceCorrupt && !explicitlyUnavailable) {
        blockers.push({ code: "source-corrupt-frame-not-explicitly-evaluated", mediaId: id, marker, status: evaluationStatus || null });
      }
    }
    if (sourceCorrupt) warnings.push({ code: "source-corrupt-video-quarantined", mediaId: id, decodeStatus });
    if (staticSingleFrame) warnings.push({ code: "static-single-frame-asset-quarantined-from-director", mediaId: id });
    if (!hasSynopsis(row)) blockers.push({ code: "missing-directed-synopsis", mediaId: id });
    if (!normalizedTags(row).length) blockers.push({ code: "missing-catalog-tags", mediaId: id });
    const quality = qualityScore(row);
    if (quality === null || quality < 0 || quality > 100) blockers.push({ code: "invalid-quality-score", mediaId: id, value: quality });
    const prior = sourcePrior(row);
    if (prior === null || prior < 0 || prior > 1.1) blockers.push({ code: "invalid-source-prior", mediaId: id, value: prior });
    const flow = flowStatus(row);
    if (!flow.loop) blockers.push({ code: "missing-loop-classification", mediaId: id });
    if (!flow.transition) blockers.push({ code: "missing-transition-classification", mediaId: id });
    for (const reference of list(row.semantic?.references || row.referenceMatches)) {
      if (
        text(reference?.truthStatus) === "textual-visual-affinity-pending-review"
        && list(reference?.supportingFrameIds).length === 0
      ) blockers.push({
        code: "visual-reference-affinity-missing-frame-citation",
        mediaId: id,
        referenceId: text(reference?.cardId) || null,
      });
    }
  }

  for (const id of manifestIds) {
    if (!byId.has(id)) blockers.push({ code: "manifest-video-not-enriched", mediaId: id });
  }
  for (const id of byId.keys()) {
    if (manifestIds.size && !manifestIds.has(id)) warnings.push({ code: "enrichment-not-in-manifest", mediaId: id });
  }

  const outgoing = new Map();
  for (const edge of edges) {
    const source = text(edge.sourceVideoId || edge.sourceMediaId || edge.source);
    const target = text(edge.targetVideoId || edge.targetMediaId || edge.target);
    const score = number(edge.score, null);
    if (!source || !target || score === null) {
      blockers.push({ code: "invalid-chain-edge", edgeId: text(edge.id) || null });
      continue;
    }
    if (!byId.has(source) || !byId.has(target)) blockers.push({ code: "chain-edge-missing-node", edgeId: text(edge.id) || null, source, target });
    if (byId.get(source)?.playable === false || byId.get(target)?.playable === false) {
      blockers.push({ code: "chain-edge-unplayable-node", edgeId: text(edge.id) || null, source, target });
    }
    if (!outgoing.has(source)) outgoing.set(source, new Set());
    outgoing.get(source).add(target);
  }

  const classifiedLoops = rows.filter((row) => ["loop", "loop-candidate"].includes(flowStatus(row).loop)).length;
  const classifiedTransitions = rows.filter((row) => ["transition", "declared-transition"].includes(flowStatus(row).transition)).length;
  const visuallyValidatedTransitions = rows.filter((row) => row.flow?.transition?.visuallyValidated === true).length;
  const declaredTransitions = rows.filter((row) => row.flow?.transition?.declaredTransition === true).length;
  return {
    schemaVersion: ECHO_ENRICHMENT_AUDIT_SCHEMA,
    ok: blockers.length === 0 && rows.length > 0 && rows.length === manifestIds.size,
    totals: {
      manifestVideos: manifestIds.size,
      enrichmentRows: rows.length,
      uniqueEnrichments: byId.size,
      chainEdges: edges.length,
      videosWithOutgoingChains: outgoing.size,
      classifiedLoops,
      classifiedTransitions,
      visuallyValidatedTransitions,
      declaredTransitions,
      sourceCorruptVideos,
      staticSingleFrameAssets,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    blockers,
    warnings,
  };
}

export function buildSourceBiasFeedback({ enrichments = [], selections = [] } = {}) {
  const rows = list(enrichments);
  const selectedCounts = new Map();
  const counterfactualCounts = new Map();
  for (const selection of list(selections)) {
    const id = text(selection.mediaId || selection.enrichmentId || selection.selectedMediaId);
    if (!id) continue;
    const target = selection.selectionKind === "intrinsic-counterfactual" ? counterfactualCounts : selectedCounts;
    target.set(id, (target.get(id) || 0) + 1);
  }
  const groups = new Map();
  for (const row of rows) {
    const group = sourceClass(row);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  const report = [...groups.entries()].map(([group, items]) => {
    const scores = items.map(qualityScore).filter(Number.isFinite);
    const percentiles = items.map(qualityPercentile).filter(Number.isFinite);
    const topDecile = items.filter((row) => qualityPercentile(row) !== null && qualityPercentile(row) >= 90).length;
    const selected = items.reduce((sum, row) => sum + (selectedCounts.get(enrichmentId(row)) || 0), 0);
    const counterfactual = items.reduce((sum, row) => sum + (counterfactualCounts.get(enrichmentId(row)) || 0), 0);
    const rescues = items.filter((row) => {
      const prior = sourcePrior(row);
      return prior !== null && prior <= 0.15 && qualityScore(row) !== null && qualityScore(row) >= 85;
    }).map((row) => ({ mediaId: enrichmentId(row), qualityScore: qualityScore(row), selected: selectedCounts.get(enrichmentId(row)) || 0 }));
    return {
      sourceClass: group,
      videos: items.length,
      medianQualityScore: fixed(median(scores), 2),
      medianGlobalPercentile: fixed(median(percentiles), 2),
      topDecileVideos: topDecile,
      topDecileRate: fixed(items.length ? topDecile / items.length : 0),
      intrinsicCounterfactualSelections: counterfactual,
      postPriorDirectorSelections: selected,
      counterfactualSelectionShare: null,
      postPriorSelectionShare: null,
      rescueCases: rescues,
    };
  }).sort((left, right) => left.sourceClass.localeCompare(right.sourceClass));
  const totalCounterfactual = [...counterfactualCounts.values()].reduce((sum, value) => sum + value, 0);
  const totalSelected = [...selectedCounts.values()].reduce((sum, value) => sum + value, 0);
  for (const group of report) {
    group.counterfactualSelectionShare = fixed(totalCounterfactual ? group.intrinsicCounterfactualSelections / totalCounterfactual : 0);
    group.postPriorSelectionShare = fixed(totalSelected ? group.postPriorDirectorSelections / totalSelected : 0);
  }
  return {
    schemaVersion: "hapa.echo.video-source-bias-feedback.v1",
    intrinsicQualityIndependentOfSourcePrior: true,
    groups: report,
    totals: {
      videos: rows.length,
      intrinsicCounterfactualSelections: totalCounterfactual,
      postPriorDirectorSelections: totalSelected,
      rescueCases: report.reduce((sum, group) => sum + group.rescueCases.length, 0),
    },
  };
}

function shotDecisionEvidence(shot = {}) {
  return shot.decision_evidence || shot.decisionEvidence || shot.enrichmentDecision || shot.hapa?.shotDecisionEvidence || null;
}

function normalizedAtomicEndpoint(value = {}) {
  const row = object(value);
  return {
    role: text(row.role).toLowerCase(),
    cardId: text(row.cardId || row.card_id),
    cardRevisionId: text(row.cardRevisionId || row.card_revision_id),
    cardTitle: text(row.cardTitle || row.card_title),
    assetId: text(row.assetId || row.asset_id),
    frameId: text(row.frameId || row.frame_id),
    sha256: text(row.sha256 || row.contentHash || row.content_hash).replace(/^sha256:/u, "").toLowerCase(),
    uri: text(row.uri || row.mediaUri || row.media_uri),
    reviewStatus: text(row.reviewStatus || row.review_status),
    sourceCardUnchanged: row.sourceCardUnchanged === true || row.source_card_unchanged === true,
  };
}

function completeAtomicEndpoint(endpoint = {}, expectedRole = "") {
  return endpoint.role === expectedRole
    && Boolean(endpoint.cardId)
    && SHA256_PATTERN.test(endpoint.sha256)
    && Boolean(endpoint.uri)
    && endpoint.sourceCardUnchanged === true;
}

function atomicEndpointIdentity(endpoint = {}) {
  return JSON.stringify(endpoint);
}

function auditCurrentAtomicTransitions({ timeline = [], songId = "", variantId = "", variant = {} } = {}) {
  const blockers = [];
  const push = (code, shotIndex, details = {}) => blockers.push({
    code,
    songId,
    variantId,
    shotIndex,
    ...details,
  });
  const rows = list(timeline).map((shot, shotIndex) => {
    const evidence = shotDecisionEvidence(shot);
    const evidenceSchemaVersion = text(evidence?.schemaVersion);
    const atomicSchema = ECHO_ENRICHMENT_ATOMIC_SHOT_EVIDENCE_SCHEMAS.has(evidenceSchemaVersion);
    const currentSchema = evidenceSchemaVersion === ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA;
    const atomicValue = atomicSchema ? evidence?.atomicTransition : null;
    const validAtomicShape = atomicValue === null || atomicValue === undefined
      || (typeof atomicValue === "object" && !Array.isArray(atomicValue));
    const atomic = validAtomicShape ? object(atomicValue) : {};
    return {
      shot,
      shotIndex,
      evidence,
      evidenceSchemaVersion,
      atomicSchema,
      currentSchema,
      atomicValue,
      validAtomicShape,
      atomic,
      role: text(atomic.role),
      transitionMediaId: text(atomic.transitionMediaId || atomic.transition_media_id),
      transitionJobId: text(atomic.transitionJobId || atomic.transition_job_id || atomic.jobId || atomic.job_id),
      selectedCandidateMotionKind: text(evidence?.selectedCandidate?.motionRole?.kind).toLowerCase(),
      selectedCandidateReferenceAnchorIds: list(evidence?.selectedCandidate?.referenceAnchorIds)
        .map((value) => text(value).toLowerCase()).filter(Boolean),
      firstReference: normalizedAtomicEndpoint(atomic.firstReference || atomic.first_reference),
      lastReference: normalizedAtomicEndpoint(atomic.lastReference || atomic.last_reference),
      endpointIdentityEvidence: text(atomic.endpointIdentityEvidence || atomic.endpoint_identity_evidence),
    };
  });
  const endpointCertification = object(variant.lineage?.transitionEndpointCertification);
  const visualResultDigestSha256 = text(endpointCertification.resultDigestSha256);
  const certifiedJobIds = new Set(list(endpointCertification.certifiedJobIds).map(text).filter(Boolean));
  const certifiedJobs = new Map(list(endpointCertification.certifiedJobs).map((job) => (
    [text(job.jobId || job.job_id), job]
  )));

  for (const row of rows) {
    if (!row.atomicSchema) continue;
    if (row.selectedCandidateMotionKind === "transition" && row.role !== "authored-transition") {
      push("transition-candidate-missing-authored-atomic-role", row.shotIndex, {
        atomicRole: row.role || null,
      });
    }
    if (row.atomicValue === null || row.atomicValue === undefined) continue;
    if (!row.validAtomicShape) {
      push("invalid-atomic-transition-evidence", row.shotIndex);
      continue;
    }
    if (!ATOMIC_TRANSITION_ROLES.has(row.role)) {
      push("invalid-atomic-transition-role", row.shotIndex, { role: row.role || null });
      continue;
    }
    if (!completeAtomicEndpoint(row.firstReference, "first")) {
      push("atomic-transition-first-reference-incomplete", row.shotIndex);
    }
    if (!completeAtomicEndpoint(row.lastReference, "last")) {
      push("atomic-transition-last-reference-incomplete", row.shotIndex);
    }
    const expectedEndpointIdentityEvidence = ATOMIC_ENDPOINT_IDENTITY_EVIDENCE_BY_SCHEMA[row.evidenceSchemaVersion];
    if (row.endpointIdentityEvidence !== expectedEndpointIdentityEvidence) {
      push("atomic-transition-endpoint-identity-evidence-invalid", row.shotIndex, {
        endpointIdentityEvidence: row.endpointIdentityEvidence || null,
      });
    }
    if (!row.transitionMediaId) push("atomic-transition-media-id-missing", row.shotIndex, { role: row.role });
    if (!row.transitionJobId) push("atomic-transition-job-id-missing", row.shotIndex, { role: row.role });
    if (row.currentSchema) {
      const framing = object(row.shot.camera_framing_contract || row.shot.cameraFramingContract);
      if (text(row.shot.camera_motion || row.shot.cameraMotion).toLowerCase() !== "static"
        || number(row.shot.camera_intensity ?? row.shot.cameraIntensity, null) !== 0
        || number(row.shot.camera_speed ?? row.shot.cameraSpeed, null) !== 1
        || text(row.shot.camera_focus || row.shot.cameraFocus).toLowerCase() !== "center"
        || framing.schemaVersion !== "hapa.echo.asset-camera-framing.v2"
        || text(framing.cropPolicy) !== "certified-centered-cover-no-motion"
        || text(framing.mediaId) !== text(row.shot.media_id || row.shot.mediaId)
        || text(framing.path?.mediaId) !== text(row.shot.media_id || row.shot.mediaId)
        || list(framing.path?.corridors).some((corridor) => (
          stableEchoEnrichmentStringify(corridor.startCrop)
            !== stableEchoEnrichmentStringify(corridor.endCrop)
          || (() => {
            const sourceAspect = number(framing.sourceAspect, null);
            const targetAspect = number(corridor.targetAspect, null);
            const crop = object(corridor.startCrop);
            if (!(sourceAspect > 0) || !(targetAspect > 0)) return true;
            const expectedWidth = sourceAspect >= targetAspect ? targetAspect / sourceAspect : 1;
            const expectedHeight = sourceAspect >= targetAspect ? 1 : sourceAspect / targetAspect;
            return Math.abs(number(crop.width, -1) - expectedWidth) > 0.000001
              || Math.abs(number(crop.height, -1) - expectedHeight) > 0.000001
              || Math.abs(number(crop.x, -1) - ((1 - expectedWidth) / 2)) > 0.000001
              || Math.abs(number(crop.y, -1) - ((1 - expectedHeight) / 2)) > 0.000001;
          })()
        ))) {
        push("atomic-transition-framing-drift", row.shotIndex);
      }
    }

    const previous = rows[row.shotIndex - 1] || null;
    const next = rows[row.shotIndex + 1] || null;
    if (["entry-reference-loop", "entry-reference-still"].includes(row.role)) {
      if (next?.role !== "authored-transition") {
        push("orphan-atomic-transition-entry", row.shotIndex);
      }
      if (!row.selectedCandidateReferenceAnchorIds.includes(row.firstReference.cardId.toLowerCase())) {
        push("atomic-transition-entry-reference-anchor-mismatch", row.shotIndex, {
          expectedReferenceCardId: row.firstReference.cardId || null,
        });
      }
      if (row.currentSchema) {
        const certification = object(row.evidence?.selectedCandidate?.referenceStillCertification);
        const imageSha256 = text(row.firstReference.sha256).replace(/^sha256:/u, "").toLowerCase();
        const mediaContract = object(row.shot.media_contract || row.shot.mediaContract);
        if (row.role !== "entry-reference-still"
          || row.selectedCandidateMotionKind !== "reference-still-hold"
          || text(row.shot.media_id || row.shot.mediaId) !== `hapa-media:sha256:${imageSha256}`
          || text(row.shot.media_uri || row.shot.mediaUri) !== row.firstReference.uri
          || text(row.shot.runtime_media_uri || row.shot.runtimeMediaUri) !== row.firstReference.uri
          || text(mediaContract.type).toLowerCase() !== "image"
          || text(mediaContract.playbackMode || mediaContract.playback_mode).toLowerCase() !== "hold"
          || text(mediaContract.contentHash || mediaContract.content_hash).toLowerCase() !== imageSha256
          || certification.schemaVersion !== "hapa.echo.transition-reference-still-hold.v1"
          || text(certification.cardId) !== row.firstReference.cardId
          || text(certification.imageSha256).toLowerCase() !== imageSha256
          || text(certification.imageUri) !== row.firstReference.uri) {
          push("atomic-transition-entry-reference-still-binding-invalid", row.shotIndex);
        }
      }
      continue;
    }
    if (["exit-reference-loop", "exit-reference-still"].includes(row.role)) {
      if (previous?.role !== "authored-transition") {
        push("orphan-atomic-transition-exit", row.shotIndex);
      }
      if (!row.selectedCandidateReferenceAnchorIds.includes(row.lastReference.cardId.toLowerCase())) {
        push("atomic-transition-exit-reference-anchor-mismatch", row.shotIndex, {
          expectedReferenceCardId: row.lastReference.cardId || null,
        });
      }
      if (row.currentSchema) {
        const certification = object(row.evidence?.selectedCandidate?.referenceStillCertification);
        const imageSha256 = text(row.lastReference.sha256).replace(/^sha256:/u, "").toLowerCase();
        const mediaContract = object(row.shot.media_contract || row.shot.mediaContract);
        if (row.role !== "exit-reference-still"
          || row.selectedCandidateMotionKind !== "reference-still-hold"
          || text(row.shot.media_id || row.shot.mediaId) !== `hapa-media:sha256:${imageSha256}`
          || text(row.shot.media_uri || row.shot.mediaUri) !== row.lastReference.uri
          || text(row.shot.runtime_media_uri || row.shot.runtimeMediaUri) !== row.lastReference.uri
          || text(mediaContract.type).toLowerCase() !== "image"
          || text(mediaContract.playbackMode || mediaContract.playback_mode).toLowerCase() !== "hold"
          || text(mediaContract.contentHash || mediaContract.content_hash).toLowerCase() !== imageSha256
          || certification.schemaVersion !== "hapa.echo.transition-reference-still-hold.v1"
          || text(certification.cardId) !== row.lastReference.cardId
          || text(certification.imageSha256).toLowerCase() !== imageSha256
          || text(certification.imageUri) !== row.lastReference.uri) {
          push("atomic-transition-exit-reference-still-binding-invalid", row.shotIndex);
        }
      }
      continue;
    }

    if (row.shotIndex === 0 || row.shotIndex === rows.length - 1) {
      push("atomic-transition-boundary", row.shotIndex);
    }
    if (next?.role === "authored-transition") {
      push("adjacent-atomic-transitions", row.shotIndex, { adjacentShotIndex: next.shotIndex });
    }
    const expectedEntryRole = row.currentSchema ? "entry-reference-still" : "entry-reference-loop";
    const expectedExitRole = row.currentSchema ? "exit-reference-still" : "exit-reference-loop";
    if (previous?.role !== expectedEntryRole) {
      push("atomic-transition-entry-anchor-missing", row.shotIndex);
    }
    if (next?.role !== expectedExitRole) {
      push("atomic-transition-exit-anchor-missing", row.shotIndex);
    }

    for (const neighbor of [previous, next].filter(Boolean)) {
      if (atomicEndpointIdentity(neighbor.firstReference) !== atomicEndpointIdentity(row.firstReference)) {
        push("atomic-transition-first-reference-mismatch", row.shotIndex, {
          neighborShotIndex: neighbor.shotIndex,
        });
      }
      if (atomicEndpointIdentity(neighbor.lastReference) !== atomicEndpointIdentity(row.lastReference)) {
        push("atomic-transition-last-reference-mismatch", row.shotIndex, {
          neighborShotIndex: neighbor.shotIndex,
        });
      }
      if (neighbor.endpointIdentityEvidence !== row.endpointIdentityEvidence) {
        push("atomic-transition-endpoint-identity-evidence-mismatch", row.shotIndex, {
          neighborShotIndex: neighbor.shotIndex,
        });
      }
    }

    for (const neighbor of [previous, next].filter(Boolean)) {
      if (neighbor.transitionMediaId !== row.transitionMediaId) {
        push("atomic-transition-media-id-mismatch", row.shotIndex, {
          neighborShotIndex: neighbor.shotIndex,
          expectedTransitionMediaId: row.transitionMediaId || null,
          actualTransitionMediaId: neighbor.transitionMediaId || null,
        });
      }
      if (neighbor.transitionJobId !== row.transitionJobId) {
        push("atomic-transition-job-id-mismatch", row.shotIndex, {
          neighborShotIndex: neighbor.shotIndex,
          expectedTransitionJobId: row.transitionJobId || null,
          actualTransitionJobId: neighbor.transitionJobId || null,
        });
      }
    }

    const selectedMediaId = text(row.evidence?.selectedMediaId || row.evidence?.mediaId);
    if (!selectedMediaId || selectedMediaId !== row.transitionMediaId) {
      push("atomic-transition-selected-media-mismatch", row.shotIndex, {
        selectedMediaId: selectedMediaId || null,
        transitionMediaId: row.transitionMediaId || null,
      });
    }
    const shotMediaId = text(row.shot.media_id || row.shot.mediaId);
    if (!shotMediaId || shotMediaId !== row.transitionMediaId || shotMediaId !== selectedMediaId) {
      push("atomic-transition-shot-media-mismatch", row.shotIndex, {
        shotMediaId: shotMediaId || null,
        selectedMediaId: selectedMediaId || null,
        transitionMediaId: row.transitionMediaId || null,
      });
    }
    const mediaContract = object(row.shot.media_contract || row.shot.mediaContract);
    if (text(mediaContract.playbackMode || mediaContract.playback_mode).toLowerCase() !== "once") {
      push("atomic-transition-playback-not-once", row.shotIndex);
    }
    const transitionLink = object(row.shot.transition_link || row.shot.transitionLink);
    if (!Object.keys(transitionLink).length) {
      push("atomic-transition-link-missing", row.shotIndex);
    } else {
      const linkJobId = text(transitionLink.id || transitionLink.jobId || transitionLink.job_id);
      const linkMediaId = text(transitionLink.mediaId || transitionLink.media_id);
      if (linkJobId !== row.transitionJobId || linkMediaId !== row.transitionMediaId) {
        push("atomic-transition-link-identity-mismatch", row.shotIndex, {
          linkJobId: linkJobId || null,
          linkMediaId: linkMediaId || null,
        });
      }
      if (text(transitionLink.playbackMode || transitionLink.playback_mode).toLowerCase() !== "once") {
        push("atomic-transition-link-playback-not-once", row.shotIndex);
      }
    }

    if (row.currentSchema) {
      const atomicVisual = object(row.atomic.visualValidation || row.atomic.visual_validation);
      const transitionLink = object(row.shot.transition_link || row.shot.transitionLink);
      const linkVisual = object(transitionLink.visualValidation || transitionLink.visual_validation);
      const certifiedJob = object(certifiedJobs.get(row.transitionJobId));
      if (endpointCertification.schemaVersion !== "hapa.echo.transition-endpoint-certification-lineage.v1"
        || endpointCertification.verified !== true
        || !SHA256_PATTERN.test(visualResultDigestSha256)
        || text(endpointCertification.certifiedJobLedgerDigestSha256)
          !== echoEnrichmentSha256(list(endpointCertification.certifiedJobs))) {
        push("atomic-transition-visual-certification-lineage-invalid", row.shotIndex);
      }
      if (!certifiedJobIds.has(row.transitionJobId)
        || text(certifiedJob.mediaId || certifiedJob.media_id) !== row.transitionMediaId) {
        push("atomic-transition-job-not-visually-certified", row.shotIndex, {
          transitionJobId: row.transitionJobId || null,
        });
      }
      for (const [location, visual] of [["atomic", atomicVisual], ["link", linkVisual]]) {
        if (visual.schemaVersion !== "hapa.echo.transition-shot-visual-certification.v1"
          || text(visual.decision) !== "certified"
          || text(visual.jobId || visual.job_id) !== row.transitionJobId
          || text(visual.mediaId || visual.media_id) !== row.transitionMediaId
          || !SHA256_PATTERN.test(text(visual.videoSha256 || visual.video_sha256))
          || text(visual.videoSha256 || visual.video_sha256) !== text(certifiedJob.videoSha256)
          || stableEchoEnrichmentStringify(visual.endpoints)
            !== stableEchoEnrichmentStringify(certifiedJob.endpoints)
          || text(visual.resultDigestSha256 || visual.result_digest_sha256) !== visualResultDigestSha256) {
          push("atomic-transition-visual-certification-mismatch", row.shotIndex, { location });
        }
      }
      const mediaTimeMapping = object(mediaContract.timeMapping || mediaContract.time_mapping);
      const linkTimeMapping = object(transitionLink.timeMapping || transitionLink.time_mapping);
      const atomicTimeMapping = object(row.atomic.timeMapping || row.atomic.time_mapping);
      const cueDurationSeconds = number(row.shot.end_sec ?? row.shot.endSeconds, 0)
        - number(row.shot.start_sec ?? row.shot.startSeconds, 0);
      const sourceInSeconds = number(mediaTimeMapping.sourceInSeconds ?? mediaTimeMapping.source_in_seconds, null);
      const sourceOutSeconds = number(mediaTimeMapping.sourceOutSeconds ?? mediaTimeMapping.source_out_seconds, null);
      const sourceDurationSeconds = sourceOutSeconds !== null && sourceInSeconds !== null
        ? sourceOutSeconds - sourceInSeconds
        : null;
      const outputFps = number(mediaTimeMapping.outputFps ?? mediaTimeMapping.output_fps, null);
      const cueSampleSpanSeconds = number(
        mediaTimeMapping.cueSampleSpanSeconds ?? mediaTimeMapping.cue_sample_span_seconds,
        null,
      );
      const playbackRate = number(mediaTimeMapping.playbackRate ?? mediaTimeMapping.playback_rate, null);
      const expectedCueSampleSpanSeconds = outputFps > 0 && cueDurationSeconds > 0
        ? cueDurationSeconds - (1 / outputFps)
        : null;
      const expectedPlaybackRate = sourceDurationSeconds > 0 && cueSampleSpanSeconds > 0
        ? sourceDurationSeconds / cueSampleSpanSeconds
        : null;
      const certifiedFirstSeconds = number(certifiedJob.endpoints?.first?.sourceTimeSeconds, null);
      const certifiedLastSeconds = number(certifiedJob.endpoints?.last?.sourceTimeSeconds, null);
      if (mediaTimeMapping.schemaVersion !== ECHO_TRANSITION_TIME_MAP_SCHEMA
        || mediaTimeMapping.mode !== "fit-source-once-to-cue"
        || mediaTimeMapping.valid !== true
        || mediaTimeMapping.reachesDeclaredLastFrame !== true) {
        push("atomic-transition-time-mapping-invalid", row.shotIndex);
      }
      if (!(sourceDurationSeconds > 0)
        || !(cueDurationSeconds > 0)
        || Math.abs(number(mediaTimeMapping.sourceDurationSeconds, 0) - sourceDurationSeconds) > 0.001
        || Math.abs(number(mediaTimeMapping.cueDurationSeconds, 0) - cueDurationSeconds) > 0.001
        || expectedCueSampleSpanSeconds === null
        || Math.abs(cueSampleSpanSeconds - expectedCueSampleSpanSeconds) > 0.001
        || expectedPlaybackRate === null
        || playbackRate === null
        || Math.abs(playbackRate - expectedPlaybackRate) > 0.001
        || playbackRate > ECHO_TRANSITION_MAX_PLAYBACK_RATE) {
        push("atomic-transition-time-mapping-bounds-invalid", row.shotIndex, {
          sourceDurationSeconds,
          cueDurationSeconds,
          playbackRate,
        });
      }
      if (number(mediaContract.sourceInSeconds ?? mediaContract.source_in_seconds, null) !== sourceInSeconds
        || number(mediaContract.sourceOutSeconds ?? mediaContract.source_out_seconds, null) !== sourceOutSeconds) {
        push("atomic-transition-time-mapping-source-window-mismatch", row.shotIndex);
      }
      if (certifiedFirstSeconds === null
        || certifiedLastSeconds === null
        || sourceInSeconds !== certifiedFirstSeconds
        || sourceOutSeconds !== certifiedLastSeconds) {
        push("atomic-transition-time-mapping-visual-endpoint-mismatch", row.shotIndex);
      }
      if (stableEchoEnrichmentStringify(linkTimeMapping) !== stableEchoEnrichmentStringify(mediaTimeMapping)
        || stableEchoEnrichmentStringify(atomicTimeMapping) !== stableEchoEnrichmentStringify(mediaTimeMapping)) {
        push("atomic-transition-time-mapping-evidence-mismatch", row.shotIndex);
      }
    }

    const entryContinuityKind = text(previous?.evidence?.neighborContinuity?.next?.kind);
    const transitionEntryContinuityKind = text(row.evidence?.neighborContinuity?.previous?.kind);
    if (entryContinuityKind !== "declared-transition-entry-anchor"
      || transitionEntryContinuityKind !== "declared-transition-entry-anchor") {
      push("atomic-transition-entry-continuity-missing", row.shotIndex);
    }
    const transitionExitContinuityKind = text(row.evidence?.neighborContinuity?.next?.kind);
    const exitContinuityKind = text(next?.evidence?.neighborContinuity?.previous?.kind);
    if (transitionExitContinuityKind !== "declared-transition-exit-anchor"
      || exitContinuityKind !== "declared-transition-exit-anchor") {
      push("atomic-transition-exit-continuity-missing", row.shotIndex);
    }
  }
  return blockers;
}

export function auditIntentionalDirectorVariants(input = {}) {
  input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const {
    songs = [],
    variants = [],
    enrichmentIds = [],
    playableEnrichmentIds = [],
  } = input;
  const playabilityUniverseSupplied = Object.prototype.hasOwnProperty.call(input, "playableEnrichmentIds");
  const songIds = new Set(list(songs).map((song) => text(song.id || song.cardId || song.songId)).filter(Boolean));
  const allowedEnrichments = new Set(list(enrichmentIds).map(text).filter(Boolean));
  const playableEnrichments = new Set(list(playableEnrichmentIds).map(text).filter(Boolean));
  const variantsBySong = new Map();
  const blockers = [];
  for (const variant of list(variants)) {
    const songId = text(variant.parent?.songId || variant.songId);
    if (!songId) {
      blockers.push({ code: "variant-missing-song-id", variantId: text(variant.id) });
      continue;
    }
    if (!variantsBySong.has(songId)) variantsBySong.set(songId, []);
    variantsBySong.get(songId).push(variant);
    if (variant.schemaVersion !== "hapa.echo.direction-script-variant.v1") blockers.push({ code: "invalid-variant-schema", songId, variantId: text(variant.id) });
    if (!(variant.enrichmentLineage || variant.lineage)) blockers.push({ code: "missing-enrichment-lineage", songId, variantId: text(variant.id) });
    const timeline = list(variant.timeline);
    if (!timeline.length) blockers.push({ code: "empty-intentional-timeline", songId, variantId: text(variant.id) });
    for (const [index, shot] of timeline.entries()) {
      const evidence = shotDecisionEvidence(shot);
      const evidenceSchemaVersion = text(evidence?.schemaVersion);
      if (!SUPPORTED_SHOT_EVIDENCE_SCHEMAS.has(evidenceSchemaVersion)) {
        blockers.push({
          code: "unsupported-shot-evidence-schema",
          songId,
          variantId: text(variant.id),
          shotIndex: index,
          schemaVersion: evidenceSchemaVersion || null,
          supportedSchemaVersions: ECHO_ENRICHMENT_SUPPORTED_SHOT_EVIDENCE_SCHEMAS,
        });
        continue;
      }
      const selectedMediaId = text(evidence.selectedMediaId || evidence.mediaId);
      const selectedEnrichmentId = text(evidence.enrichmentId || evidence.enrichment?.id || selectedMediaId);
      const atomicRole = text(evidence.atomicTransition?.role || evidence.atomic_transition?.role);
      const certifiedReferenceStill = evidenceSchemaVersion === ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA
        && ["entry-reference-still", "exit-reference-still"].includes(atomicRole)
        && /^certified-reference-still:[a-f0-9]{64}$/u.test(selectedEnrichmentId)
        && /^hapa-media:sha256:[a-f0-9]{64}$/u.test(selectedMediaId);
      if (!selectedMediaId && !selectedEnrichmentId) blockers.push({ code: "shot-evidence-missing-media-id", songId, variantId: text(variant.id), shotIndex: index });
      else if (!certifiedReferenceStill && allowedEnrichments.size && !allowedEnrichments.has(selectedEnrichmentId)) blockers.push({ code: "shot-media-not-enriched", songId, variantId: text(variant.id), shotIndex: index, mediaId: selectedMediaId || selectedEnrichmentId, enrichmentId: selectedEnrichmentId });
      else if (!certifiedReferenceStill && playabilityUniverseSupplied && !playableEnrichments.has(selectedEnrichmentId)) blockers.push({ code: "shot-media-not-playable", songId, variantId: text(variant.id), shotIndex: index, mediaId: selectedMediaId || selectedEnrichmentId, enrichmentId: selectedEnrichmentId });
      if (!text(evidence.rationale || evidence.directorRationale)) blockers.push({ code: "shot-evidence-missing-rationale", songId, variantId: text(variant.id), shotIndex: index });
      const lyric = evidence.lyrics || evidence.lyricCitation || evidence.lyric;
      const hasLyricStatus = Boolean(text(lyric?.status) || text(lyric?.text) || text(lyric?.citation?.text));
      const explicitlyUnavailable = lyric?.explicitLyricsUnavailable === true || evidence.explicitLyricsUnavailable === true;
      if (!hasLyricStatus && !explicitlyUnavailable) blockers.push({ code: "shot-evidence-missing-lyric-status", songId, variantId: text(variant.id), shotIndex: index });
      const story = evidence.story;
      if (["canonical-story-beat", "canonical-story-beat-match"].includes(story?.status)) {
        const affinity = number(story.affinity, null);
        if (!(affinity >= CANONICAL_STORY_AFFINITY_MINIMUM)
          || !list(story.ids).length
          || !text(story.summary)
          || story.softCanon === true
          || (text(story.authority) && text(story.authority) !== "human-canonical")
          || list(story.overlapTokens).length < 2) {
          blockers.push({
            code: "shot-evidence-overstated-story-affinity",
            songId,
            variantId: text(variant.id),
            shotIndex: index,
            affinity,
          });
        }
      }
      if (/context-unmatched$/u.test(text(story?.status)) && (list(story.ids).length || text(story.summary))) {
        blockers.push({ code: "unmatched-story-evidence-contains-claim", songId, variantId: text(variant.id), shotIndex: index });
      }
      const rationale = text(evidence.rationale || evidence.directorRationale);
      if (lyric?.status !== "time-overlap" && /aligns with (?:timed )?lyric/iu.test(rationale)) {
        blockers.push({ code: "non-overlap-lyric-claimed-as-aligned", songId, variantId: text(variant.id), shotIndex: index });
      }
      if (number(evidence.neighborContinuity?.previous?.chainAffinity, 0) <= 0 && /stable visual continuity/iu.test(rationale)) {
        blockers.push({ code: "zero-affinity-chain-claimed-as-stable", songId, variantId: text(variant.id), shotIndex: index });
      }
      if (evidence.truthStatus === "intentional-enrichment-backed") {
        const selected = evidence.selectedCandidate || {};
        const counterfactual = evidence.sourceBiasCounterfactual || {};
        if (counterfactual.schemaVersion !== "hapa.echo.source-bias-counterfactual.v1"
          || counterfactual.method !== "full-bounded-search-with-source-prior-neutralized"
          || number(counterfactual.eligibleCandidateCount, 0) < number(counterfactual.evaluatedCandidateCount, 0)
          || number(counterfactual.evaluatedCandidateCount, 0) < 1
          || !text(counterfactual.selectedCandidate?.mediaId || counterfactual.selectedCandidate?.enrichmentId)) {
          blockers.push({ code: "source-bias-counterfactual-missing-direct-evidence", songId, variantId: text(variant.id), shotIndex: index });
        }
        if (!text(selected.title) || !rationale.toLowerCase().includes(text(selected.title).toLowerCase())) {
          blockers.push({ code: "rationale-missing-selected-visual-title", songId, variantId: text(variant.id), shotIndex: index });
        }
        if (!text(selected.observedSynopsis) && !list(selected.observedVisualEvidence).length) {
          blockers.push({ code: "selected-visual-missing-observed-evidence", songId, variantId: text(variant.id), shotIndex: index });
        }
        for (const field of ["lyricAffinity", "canonAffinity", "objectActionAffinity", "emotionAffinity"]) {
          if (number(selected.score?.[field], null) === null) blockers.push({ code: "director-score-missing-independent-component", field, songId, variantId: text(variant.id), shotIndex: index });
        }
        for (const alternative of list(evidence.candidateAlternatives)) {
          if (!/score .*delta/iu.test(text(alternative.rejectionReason))) blockers.push({ code: "alternative-missing-score-delta", songId, variantId: text(variant.id), shotIndex: index, mediaId: text(alternative.mediaId) });
        }
        const declaredContexts = list(selected.declaredSongContextIds).map(text).filter(Boolean);
        if (declaredContexts.length && !declaredContexts.includes(songId) && evidence.contextReuse?.crossSongReuse !== true) {
          blockers.push({ code: "cross-song-reuse-not-disclosed", songId, variantId: text(variant.id), shotIndex: index });
        }
      }
    }
    blockers.push(...auditCurrentAtomicTransitions({
      timeline,
      songId,
      variantId: text(variant.id),
      variant,
    }));
  }
  for (const songId of songIds) {
    const count = variantsBySong.get(songId)?.length || 0;
    if (count !== 1) blockers.push({ code: "intentional-cut-count-not-one", songId, count });
  }
  for (const songId of variantsBySong.keys()) {
    if (songIds.size && !songIds.has(songId)) blockers.push({ code: "intentional-cut-for-unknown-song", songId });
  }
  return {
    schemaVersion: "hapa.echo.intentional-director-cut-audit.v1",
    ok: blockers.length === 0 && songIds.size > 0 && variantsBySong.size === songIds.size,
    totals: { songs: songIds.size, songsWithCuts: variantsBySong.size, variants: list(variants).length, blockers: blockers.length },
    blockers,
  };
}
