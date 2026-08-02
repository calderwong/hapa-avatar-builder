export const ECHO_ENRICHMENT_AUDIT_SCHEMA = "hapa.echo.video-enrichment-audit.v1";
const CANONICAL_STORY_AFFINITY_MINIMUM = 0.1;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
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
      const evidence = shot.decision_evidence || shot.decisionEvidence || shot.enrichmentDecision || shot.hapa?.shotDecisionEvidence;
      if (evidence?.schemaVersion !== "hapa.echo.shot-decision-evidence.v4") {
        blockers.push({ code: "missing-v4-shot-evidence", songId, variantId: text(variant.id), shotIndex: index });
        continue;
      }
      const selectedMediaId = text(evidence.selectedMediaId || evidence.mediaId);
      const selectedEnrichmentId = text(evidence.enrichmentId || evidence.enrichment?.id || selectedMediaId);
      if (!selectedMediaId && !selectedEnrichmentId) blockers.push({ code: "shot-evidence-missing-media-id", songId, variantId: text(variant.id), shotIndex: index });
      else if (allowedEnrichments.size && !allowedEnrichments.has(selectedEnrichmentId)) blockers.push({ code: "shot-media-not-enriched", songId, variantId: text(variant.id), shotIndex: index, mediaId: selectedMediaId || selectedEnrichmentId, enrichmentId: selectedEnrichmentId });
      else if (playabilityUniverseSupplied && !playableEnrichments.has(selectedEnrichmentId)) blockers.push({ code: "shot-media-not-playable", songId, variantId: text(variant.id), shotIndex: index, mediaId: selectedMediaId || selectedEnrichmentId, enrichmentId: selectedEnrichmentId });
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
