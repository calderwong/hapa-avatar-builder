import { createHash } from "node:crypto";

export const SONG_CARD_MINT_PLAN_COMPATIBILITY_SCHEMA = "hapa.song-card.mint-plan-compatibility.v1";
export const SONG_CARD_MINT_RENDER_INVALIDATION_SCHEMA = "hapa.song-card.mint-render-invalidation.v1";
export const SONG_CARD_MINT_GRAPH_REFERENCE_SCHEMA = "hapa.song-card.mint-show-graph-reference.v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function songCardMintCompatibilityHash(value) {
  const encoded = JSON.stringify(stable(value));
  return `sha256:${createHash("sha256").update(encoded === undefined ? "undefined" : encoded).digest("hex")}`;
}

function stemPath(item = {}) {
  return text(item.audioPath || item.path || item.sourcePath || item.localPath || item.uri);
}

function visualizerCards(graph = {}) {
  const track = list(graph.tracks).find((row) => row?.role === "visualizer" || ["track-b", "ivf-stack"].includes(row?.id));
  return list(track?.cards);
}

function portableVisualizer(card = {}) {
  return card?.visualization?.card?.schemaVersion === "hapa.visualizer-card.v2";
}

function archiveStem(item = {}) {
  const role = text(item.stemType || item.role || item.title || item.id).toLowerCase().replace(/[^a-z0-9]+/gu, "-");
  return ["archive-zip", "stem-archive", "stems-archive"].includes(role);
}

/**
 * Identifies the historical projectToEditorGraph fallback precisely enough to
 * avoid treating a legitimate, intentionally small graph as legacy.
 */
export function inspectSongCardMintGraphCompatibility(graph = {}, { includeHash = true } = {}) {
  const tracks = list(graph.tracks);
  const stems = list(graph?.stems?.items);
  const cards = visualizerCards(graph);
  const trackIds = tracks.map((row) => text(row?.id));
  const trackRoles = tracks.map((row) => text(row?.role));
  const syntheticStemCount = stems.filter((item, index) => text(item?.id) === `stem:${index}` && !stemPath(item)).length;
  const legacyMediaCardCount = tracks.flatMap((row) => list(row?.cards))
    .filter((card) => /^legacy:(?:media|ivf):\d+$/u.test(text(card?.id))).length;
  const detachedVisualizerCount = cards.filter((card) => !portableVisualizer(card)).length;
  const emptyStemBusContract = list(graph?.directorV2?.stemBuses).length === 0;
  const twoTrackFallback = tracks.length === 2
    && trackIds.includes("media-a")
    && trackIds.includes("ivf-stack")
    && trackRoles.includes("media")
    && trackRoles.includes("visualizer");
  const legacyProjection = twoTrackFallback
    && stems.length > 0
    && syntheticStemCount === stems.length
    && emptyStemBusContract
    && (legacyMediaCardCount > 0 || detachedVisualizerCount > 0);
  const canonicalRoles = ["foundation", "visualizer", "accent"];
  const missingCanonicalRoles = canonicalRoles.filter((role) => !trackRoles.includes(role));
  const unboundStemCount = stems.filter((item) => !archiveStem(item) && !stemPath(item)).length;
  const canonical = graph?.schemaVersion === "hapa.music-viz.native-show-graph.v2"
    && missingCanonicalRoles.length === 0
    && stems.length > 0
    && unboundStemCount === 0
    && list(graph?.directorV2?.stemBuses).length > 0
    && cards.length > 0
    && detachedVisualizerCount === 0;
  return {
    schemaVersion: SONG_CARD_MINT_PLAN_COMPATIBILITY_SCHEMA,
    legacyProjection,
    canonical,
    graphHash: includeHash ? songCardMintCompatibilityHash(graph) : null,
    trackCount: tracks.length,
    trackIds,
    trackRoles,
    stemCount: stems.length,
    syntheticStemCount,
    unboundStemCount,
    stemBusCount: list(graph?.directorV2?.stemBuses).length,
    visualizerCount: cards.length,
    detachedVisualizerCount,
    legacyMediaCardCount,
    missingCanonicalRoles,
  };
}

function declaredText(entries = {}) {
  return Object.fromEntries(Object.entries(entries)
    .map(([key, value]) => [key, text(value)])
    .filter(([, value]) => Boolean(value)));
}

function durationDeclarations(entries = {}) {
  return Object.entries(entries).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === "") return [];
    const seconds = Number(value);
    return [{ key, raw: value, seconds, valid: Number.isFinite(seconds) && seconds >= 0 }];
  });
}

function stripRenderDerivedReceipts(receipts = {}) {
  if (!receipts || typeof receipts !== "object" || Array.isArray(receipts)) return {};
  const preserved = structuredClone(receipts);
  for (const key of [
    "releaseExport",
    "releaseExportVerification",
    "releaseQa",
    "releaseQA",
    "render",
    "rendererTruth",
    "managedArtifacts",
  ]) delete preserved[key];
  return preserved;
}

function compactRehydratedProject(project = {}, canonicalGraphHash, savedVariantId, sourceEvidence = {}) {
  const compact = structuredClone(project);
  delete compact.director_show_graph;
  delete compact.directorShowGraph;
  delete compact.director_show_graph_receipt;
  delete compact.directorShowGraphReceipt;
  delete compact.direction_script_variants;
  delete compact.directionScriptVariants;
  delete compact.hyperframe_script;
  delete compact.hyperframeScript;
  compact.hyperframe_script_stale = true;
  compact.director_show_graph_reference = {
    schemaVersion: SONG_CARD_MINT_GRAPH_REFERENCE_SCHEMA,
    location: "input.showGraph",
    sha256: canonicalGraphHash,
    variantId: savedVariantId,
  };
  compact.direction_script_variants_reference = {
    schemaVersion: SONG_CARD_MINT_GRAPH_REFERENCE_SCHEMA,
    location: sourceEvidence.sourceId || null,
    sha256: sourceEvidence.directionVariantSha256 || null,
    variantId: savedVariantId,
  };
  return compact;
}

function invalidateRenderEvidence(input = {}, receipt) {
  return {
    ...structuredClone(input),
    renderMasterPath: "",
    posterPath: "",
    render: {
      schemaVersion: SONG_CARD_MINT_RENDER_INVALIDATION_SCHEMA,
      status: "requires-fresh-render",
      reason: "canonical-show-graph-rehydrated",
      compatibilityReceiptHash: receipt.canonicalGraphHash,
    },
    rendererTruth: {
      schemaVersion: "hapa.show.release-renderer-truth.v1",
      status: "invalidated",
      executionStatus: "not-executed",
      ok: false,
      allStatesVisible: false,
      silentDefaultCount: 0,
      cueReceiptCount: 0,
      reason: "canonical-show-graph-rehydrated",
    },
    managedArtifacts: null,
    manageArtifacts: false,
    approvals: {
      technical: false,
      creative: false,
      invalidatedBy: SONG_CARD_MINT_RENDER_INVALIDATION_SCHEMA,
    },
    safety: {
      ok: false,
      status: "requires-fresh-render",
      invalidatedBy: SONG_CARD_MINT_RENDER_INVALIDATION_SCHEMA,
    },
    receipts: stripRenderDerivedReceipts(input.receipts),
  };
}

function editorialProjection(project = {}) {
  return {
    timeline: list(project.timeline),
    visualizerTimeline: list(project.visualizer_timeline || project.visualizerTimeline),
  };
}

function variantEditorialProjection(variant = {}) {
  return {
    timeline: list(variant.timeline),
    visualizerTimeline: list(variant.visualizer_timeline || variant.visualizerTimeline),
  };
}

function projectPatchMismatches(project = {}, variant = {}) {
  const patch = variant.project_patch || variant.projectPatch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return [];
  return Object.entries(patch).flatMap(([key, value]) => (
    songCardMintCompatibilityHash(project[key]) === songCardMintCompatibilityHash(value) ? [] : [key]
  ));
}

function nonRunnable(plan, graphInspection, reasons, details = {}) {
  return {
    schemaVersion: SONG_CARD_MINT_PLAN_COMPATIBILITY_SCHEMA,
    status: "non-runnable",
    runnable: false,
    requiresRepair: graphInspection.legacyProjection,
    planId: text(plan?.planId || plan?.id) || null,
    graphInspection,
    reasons,
    blocker: {
      code: "mint-plan-canonical-graph-unavailable",
      stage: "mint-plan-compatibility",
      message: "This saved mint plan uses a detached legacy editor graph and no identity-compatible canonical compiled graph was proven. It must be superseded before rendering.",
      details: { reasons, ...details },
    },
  };
}

/**
 * Returns one of:
 * - current: the saved graph is not the legacy fallback and may continue to
 *   the ordinary readiness checks;
 * - rehydrated: an exact edit-lineage match was proven and a replacement input
 *   using the canonical graph is supplied;
 * - non-runnable: fail closed before render.
 */
export function assessSongCardMintPlanCompatibility({
  plan = {},
  canonicalProject = null,
  canonicalGraph = null,
  sourceVariant = null,
  sourceEvidence = {},
} = {}) {
  const input = plan?.input || {};
  const project = input.project || {};
  const graph = input.showGraph || {};
  let graphInspection = inspectSongCardMintGraphCompatibility(graph, { includeHash: false });
  if (!graphInspection.legacyProjection) {
    return {
      schemaVersion: SONG_CARD_MINT_PLAN_COMPATIBILITY_SCHEMA,
      status: "current",
      runnable: true,
      requiresRepair: false,
      planId: text(plan?.planId || plan?.id) || null,
      graphInspection,
      reasons: [],
      receipt: {
        schemaVersion: SONG_CARD_MINT_PLAN_COMPATIBILITY_SCHEMA,
        action: "audited-current-graph",
        sourceGraphHash: null,
      },
    };
  }

  graphInspection = {
    ...graphInspection,
    graphHash: songCardMintCompatibilityHash(graph),
  };

  if (!canonicalProject || !canonicalGraph || !sourceVariant) {
    return nonRunnable(plan, graphInspection, ["canonical-compiled-graph-not-resolved"]);
  }

  const canonicalInspection = inspectSongCardMintGraphCompatibility(canonicalGraph, { includeHash: true });
  const savedVariantDeclarations = declaredText({
    showGraph: graph?.directorV2?.variantId,
    project: project?.active_direction_script_variant?.id,
    projectCamel: project?.activeDirectionScriptVariant?.id,
  });
  const savedVariantIds = [...new Set(Object.values(savedVariantDeclarations))];
  const savedVariantId = savedVariantIds.length === 1 ? savedVariantIds[0] : "";
  const sourceVariantId = text(sourceVariant.id || sourceVariant.variant_id || sourceVariant.variantId);
  const canonicalVariantId = text(canonicalGraph?.directorV2?.variantId);
  const savedSongDeclarations = declaredText({
    planSongId: plan.songId,
    projectSongId: project.song_id,
    projectAudioId: project.audio_id,
    projectRegistryTrackId: project.registry_track_id,
    showGraphSongId: graph?.song?.id,
  });
  const canonicalSongAliases = new Set([
    canonicalProject.song_id,
    canonicalProject.audio_id,
    canonicalProject.registry_track_id,
    canonicalGraph?.song?.id,
  ].map(text).filter(Boolean));
  const songDeclarationMismatches = Object.entries(savedSongDeclarations)
    .filter(([, value]) => !canonicalSongAliases.has(value))
    .map(([key]) => key);
  const fieldSongMismatches = [
    ["projectSongId", project.song_id, canonicalProject.song_id],
    ["projectAudioId", project.audio_id, canonicalProject.audio_id],
    ["projectRegistryTrackId", project.registry_track_id, canonicalProject.registry_track_id],
  ].flatMap(([key, saved, canonical]) => (
    text(saved) && text(canonical) && text(saved) !== text(canonical) ? [key] : []
  ));
  const savedEditorial = editorialProjection(project);
  const sourceEditorial = variantEditorialProjection(sourceVariant);
  const savedEditorialHash = songCardMintCompatibilityHash(savedEditorial);
  const sourceEditorialHash = songCardMintCompatibilityHash(sourceEditorial);
  const patchMismatches = projectPatchMismatches(project, sourceVariant);
  const savedDurations = durationDeclarations({
    showGraph: graph?.song?.durationSeconds,
    project: project.duration,
  });
  const canonicalDurations = durationDeclarations({
    showGraph: canonicalGraph?.song?.durationSeconds,
    project: canonicalProject.duration,
  });
  const durationValues = [...savedDurations, ...canonicalDurations];
  const durationMismatch = !savedDurations.length
    || !canonicalDurations.length
    || durationValues.some((entry) => !entry.valid)
    || Math.max(...durationValues.map((entry) => entry.seconds)) - Math.min(...durationValues.map((entry) => entry.seconds)) > 0.050001;
  const reasons = [];
  if (!canonicalInspection.canonical) reasons.push("canonical-graph-contract-incomplete");
  if (!savedVariantId || savedVariantIds.length !== 1 || savedVariantId !== sourceVariantId || savedVariantId !== canonicalVariantId) reasons.push("variant-identity-mismatch");
  if (!canonicalSongAliases.size || songDeclarationMismatches.length || fieldSongMismatches.length) reasons.push("song-identity-mismatch");
  if (savedEditorialHash !== sourceEditorialHash) reasons.push("saved-editorial-payload-mismatch");
  if (patchMismatches.length) reasons.push("saved-project-patch-mismatch");
  if (durationMismatch) reasons.push("duration-identity-mismatch");
  if (reasons.length) {
    return nonRunnable(plan, graphInspection, reasons, {
      canonicalGraphInspection: canonicalInspection,
      savedVariantId: savedVariantId || null,
      sourceVariantId: sourceVariantId || null,
      canonicalVariantId: canonicalVariantId || null,
      savedVariantDeclarations,
      savedSongDeclarations,
      canonicalSongAliases: [...canonicalSongAliases],
      songDeclarationMismatches,
      fieldSongMismatches,
      savedDurations,
      canonicalDurations,
      savedEditorialHash,
      sourceEditorialHash,
      patchMismatches,
    });
  }

  const receipt = {
    schemaVersion: SONG_CARD_MINT_PLAN_COMPATIBILITY_SCHEMA,
    action: "rehydrated-canonical-compiled-graph",
    legacyProducer: "projectToEditorGraph:fallback-v1",
    savedPlanId: text(plan?.planId || plan?.id) || null,
    savedVariantId,
    savedEditorialHash,
    sourceVariantEditorialHash: sourceEditorialHash,
    sourceGraphHash: graphInspection.graphHash,
    canonicalGraphHash: canonicalInspection.graphHash,
    canonicalVariantHash: text(canonicalGraph?.directorV2?.variantHash) || null,
    identityProof: {
      song: true,
      duration: true,
      variantId: true,
      editorialPayload: true,
      projectPatch: true,
    },
    sourceEvidence: structuredClone(sourceEvidence),
  };
  const rehydratedProject = {
    ...compactRehydratedProject(project, canonicalInspection.graphHash, savedVariantId, sourceEvidence),
    visualizer_timeline: structuredClone(canonicalProject.visualizer_timeline || project.visualizer_timeline || []),
    active_direction_script_variant: structuredClone(canonicalProject.active_direction_script_variant || project.active_direction_script_variant || { id: savedVariantId }),
  };
  const invalidatedInput = invalidateRenderEvidence(input, receipt);
  const renderEvidenceInvalidation = {
    schemaVersion: SONG_CARD_MINT_RENDER_INVALIDATION_SCHEMA,
    status: "invalidated",
    reason: "canonical-show-graph-rehydrated",
    invalidatedFields: [
      "renderMasterPath",
      "posterPath",
      "render",
      "rendererTruth",
      "managedArtifacts",
      "approvals.technical",
      "approvals.creative",
      "safety",
      "receipts.releaseExport",
      "receipts.releaseExportVerification",
    ],
    requiresFreshRender: true,
  };
  receipt.renderEvidenceInvalidation = renderEvidenceInvalidation;
  return {
    schemaVersion: SONG_CARD_MINT_PLAN_COMPATIBILITY_SCHEMA,
    status: "rehydrated",
    runnable: true,
    requiresRepair: true,
    planId: text(plan?.planId || plan?.id) || null,
    graphInspection,
    canonicalGraphInspection: canonicalInspection,
    reasons: [],
    receipt,
    input: {
      ...invalidatedInput,
      project: rehydratedProject,
      showGraph: structuredClone(canonicalGraph),
      receipts: {
        ...(invalidatedInput.receipts || {}),
        mintPlanCompatibility: receipt,
        renderEvidenceInvalidation,
      },
    },
  };
}
