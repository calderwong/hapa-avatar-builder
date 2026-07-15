import { buildPortableVisualizerCard } from "./portable-visualizer-card.js";
import {
  deriveEchoDirectionVariantProject,
  echoDirectionVariantId,
} from "./echo-direction-variants.js";

function text(value) {
  return String(value ?? "").trim();
}

function fallbackIndex(value, length) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(String(value || ""))) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return length > 0 ? (hash >>> 0) % length : -1;
}

function shaderDefaults(inputs = []) {
  return Object.fromEntries((Array.isArray(inputs) ? inputs : []).flatMap((input) => {
    const name = text(input?.NAME || input?.name);
    if (!name || text(input?.TYPE || input?.type).toLowerCase() === "image") return [];
    const fallback = text(input?.TYPE || input?.type).toLowerCase() === "bool" ? false : 0;
    return [[name, input.DEFAULT ?? input.default ?? fallback]];
  }));
}

function needsReplacement(shader) {
  return Boolean(shader && (
    shader.directorEligible === false
    || shader.enabled === false
    || shader.runtimeEligibility === "unsupported-quarantine"
  ));
}

function repairReason(shader) {
  return shader?.runtimeEligibilityReason
    || shader?.pixelGate?.reason
    || "source-hash-verified-pixel-gate-quarantine";
}

function replacementFor(shader, catalog = []) {
  const eligible = catalog.filter((candidate) => (
    candidate?.directorEligible !== false
    && candidate?.enabled !== false
    && candidate?.runtimeEligibility !== "unsupported-quarantine"
    && candidate?.pixelGate?.classification === "hash-bound-exact-proxy"
    && candidate?.pixelGate?.status === "source-hash-verified"
    && candidate?.id
    && candidate?.source
  ));
  const sameRole = eligible.filter((candidate) => text(candidate.hmvRole) === text(shader?.hmvRole));
  const sameType = eligible.filter((candidate) => text(candidate.shaderType) === text(shader?.shaderType));
  const mediaIndependentSameRole = sameRole.filter((candidate) => text(candidate.shaderType).toLowerCase() !== "filter");
  const mediaIndependent = eligible.filter((candidate) => text(candidate.shaderType).toLowerCase() !== "filter");
  const candidates = (mediaIndependentSameRole.length
    ? mediaIndependentSameRole
    : sameRole.length
      ? sameRole
      : sameType.length
        ? sameType
        : mediaIndependent.length
          ? mediaIndependent
          : eligible)
    .slice()
    .sort((left, right) => text(left.id).localeCompare(text(right.id)));
  return candidates[fallbackIndex(shader?.id, candidates.length)] || null;
}

function portableCardIsExact(card, shader) {
  const portable = card?.visualization?.card;
  return Boolean(
    portable?.schemaVersion === "hapa.visualizer-card.v2"
    && text(portable.id) === text(shader?.id)
    && text(portable.source?.hash).replace(/^sha256:/iu, "").toLowerCase()
      === text(shader?.sourceHash).replace(/^sha256:/iu, "").toLowerCase()
  );
}

function hydrateShaderCard(card, shader, options = {}) {
  const previousPortable = card.visualization?.card || {};
  const previousLayer = previousPortable.layer || {};
  const stemFocus = text(previousPortable.stemFocus || card.provenance?.stemFocus || "master");
  const defaults = shaderDefaults(shader.inputs);
  const allowedControlNames = new Set(Object.keys(defaults));
  const previousControls = card.parameters?.visualizerControls || previousPortable.controls || {};
  const controls = {
    ...defaults,
    ...Object.fromEntries(Object.entries(previousControls).filter(([name]) => allowedControlNames.has(name))),
  };
  const portable = buildPortableVisualizerCard(shader, {
    stemFocus,
    layerRole: previousLayer.role || card.provenance?.layerRole || "atmosphere",
    controls,
    blendMode: card.parameters?.blendMode || previousLayer.blend || "screen",
    opacity: Number(card.parameters?.opacity ?? previousLayer.opacity ?? 0.48),
    target: card.parameters?.target || previousLayer.target || "program",
    mix: Number(card.parameters?.mix ?? previousLayer.mix ?? 1),
    transition: String(card.transition || previousLayer.transition || "crossfade"),
    nativeProxyAvailable: Boolean(shader.nativeRoute?.proxy && shader.pixelGate?.playableFrameIndices?.length),
    hyperframesProxy: shader.hyperframesProxy || null,
    hyperframesProxyAvailable: Boolean(shader.hyperframesProxy && shader.pixelGate?.playableFrameIndices?.length),
    provenanceSource: options.replacement ? "runtime-pixel-gate-repair" : "runtime-catalog-hydration",
  });
  const visualizerMappings = Object.fromEntries((portable.automation || []).map((binding) => [
    binding.uniform,
    `${binding.stemFocus || stemFocus}:${binding.signal}`,
  ]));
  const repairEvidence = options.replacement ? {
    runtimeShaderRepair: {
      schemaVersion: "hapa.echo.runtime-shader-repair.v1",
      reason: options.reason,
      originalId: options.original?.id,
      originalTitle: options.original?.title,
      replacementId: shader.id,
      replacementTitle: shader.title,
      nonDestructive: true,
    },
  } : {
    runtimeShaderHydration: {
      schemaVersion: "hapa.echo.runtime-shader-hydration.v1",
      reason: options.reason || "portable-card-missing-or-stale",
      sourceId: shader.id,
      sourceHash: shader.sourceHash,
      nonDestructive: true,
    },
  };
  return {
    ...card,
    requestedSourceId: shader.id,
    resolutionStatus: options.replacement ? "runtime-pixel-gate-repair" : "runtime-catalog-hydration",
    executionStatus: "executable-runtime-repair",
    media: { ...(card.media || {}), id: shader.id, title: shader.title },
    visualization: {
      ...(card.visualization || {}),
      requestedSourceId: shader.id,
      sourceId: shader.id,
      nativeKey: shader.nativeRoute?.nativeKey || null,
      nativeRoute: portable.nativeRoute,
      card: portable,
      status: "exact",
    },
    parameters: {
      ...(card.parameters || {}),
      visualizerControls: controls,
      visualizerMappings,
    },
    provenance: {
      ...(card.provenance || {}),
      requestedSourceId: shader.id,
      manifestSource: shader.source,
      resolutionStatus: options.replacement ? "runtime-pixel-gate-repair" : "runtime-catalog-hydration",
      ...repairEvidence,
    },
  };
}

function boundedRuntimeShaderRepairEvidence(repair = {}) {
  const originalId = text(repair.originalId);
  const replacementId = text(repair.replacementId || repair.sourceId);
  if (!originalId || !replacementId || repair.nonDestructive !== true) return null;
  return {
    schemaVersion: "hapa.echo.runtime-shader-repair.v1",
    reason: text(repair.reason),
    originalId,
    originalTitle: text(repair.originalTitle),
    replacementId,
    replacementTitle: text(repair.replacementTitle || repair.sourceTitle),
    nonDestructive: true,
  };
}

/**
 * Project only the fixed-size repair lineage needed to explain an already
 * repaired executable card. This does not alter shader selection or copy the
 * aggregate repair receipt into every card.
 */
export function projectEchoRuntimeShaderRepairProvenance(graph, timelineRepair = {}) {
  if (!graph?.tracks || !Array.isArray(timelineRepair?.replacements)) {
    return { graph, projectedCount: 0 };
  }
  const repairsByCueIndex = new Map(timelineRepair.replacements.flatMap((repair) => {
    const cueIndex = Number(repair?.rowIndex ?? repair?.cueIndex);
    const rowRepair = timelineRepair.timeline?.[cueIndex]?.shader_repair
      || timelineRepair.timeline?.[cueIndex]?.shaderRepair;
    const evidence = boundedRuntimeShaderRepairEvidence(rowRepair || repair);
    return Number.isInteger(cueIndex) && cueIndex >= 0 && evidence ? [[cueIndex, evidence]] : [];
  }));
  if (!repairsByCueIndex.size) return { graph, projectedCount: 0 };

  let projectedCount = 0;
  const projectedGraph = structuredClone(graph);
  for (const track of projectedGraph.tracks || []) {
    if (track?.role !== "visualizer" && !["track-b", "ivf-stack"].includes(track?.id)) continue;
    for (const card of track.cards || []) {
      const cueIndex = Number(card?.sourceCueIndex ?? card?.visualization?.sourceCueIndex ?? card?.executionReceipt?.sourceCueIndex);
      const evidence = repairsByCueIndex.get(cueIndex);
      if (!evidence || text(card?.visualization?.sourceId) !== evidence.replacementId) continue;
      const existing = card?.provenance?.runtimeShaderRepair;
      if (existing?.originalId) continue;
      card.provenance = {
        ...(card.provenance || {}),
        runtimeShaderRepair: evidence,
      };
      projectedCount += 1;
    }
  }
  return { graph: projectedCount ? projectedGraph : graph, projectedCount };
}

export function repairEchoRuntimeVisualizerTimeline(rows = [], catalog = [], scope = "visualizer-timeline") {
  const catalogById = new Map(catalog.map((shader) => [text(shader?.id), shader]));
  const replacementById = new Map();
  const replacements = [];
  const timeline = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const originalId = text(row?.visualizer_id || row?.visualizerId);
    const original = catalogById.get(originalId);
    if (!needsReplacement(original)) return row;
    let replacement = replacementById.get(originalId);
    if (!replacement) {
      replacement = replacementFor(original, catalog);
      if (!replacement) return row;
      replacementById.set(originalId, replacement);
    }
    const reason = repairReason(original);
    replacements.push({
      scope,
      rowIndex: index,
      startSeconds: Number(row?.start_sec ?? row?.startSeconds ?? 0),
      endSeconds: Number(row?.end_sec ?? row?.endSeconds ?? 0),
      originalId,
      originalTitle: text(row?.visualizer_title || row?.visualizerTitle || original?.title),
      replacementId: replacement.id,
      replacementTitle: replacement.title,
      reason,
    });
    return {
      ...row,
      visualizer_id: replacement.id,
      ...(Object.hasOwn(row || {}, "visualizerId") ? { visualizerId: replacement.id } : {}),
      visualizer_title: replacement.title,
      ...(Object.hasOwn(row || {}, "visualizerTitle") ? { visualizerTitle: replacement.title } : {}),
      shader_repair: {
        schemaVersion: "hapa.echo.runtime-shader-repair.v1",
        reason,
        originalId,
        originalTitle: text(row?.visualizer_title || row?.visualizerTitle || original?.title),
        replacementId: replacement.id,
        replacementTitle: replacement.title,
        nonDestructive: true,
      },
    };
  });
  return { scope, timeline, replacementById, replacements, hydrations: [] };
}

export function repairEchoRuntimeShaderGraph(graph, catalog = [], scope = "director-show-graph") {
  if (!graph?.tracks) return { scope, graph, replacementById: new Map(), replacements: [], hydrations: [] };
  const catalogById = new Map(catalog.map((shader) => [text(shader?.id), shader]));
  const replacementById = new Map();
  const replacements = [];
  const hydrations = [];
  const repairedGraph = structuredClone(graph);
  for (const track of repairedGraph.tracks || []) {
    if (track?.role !== "visualizer" && !["track-b", "ivf-stack"].includes(track?.id)) continue;
    for (let cardIndex = 0; cardIndex < (track.cards || []).length; cardIndex += 1) {
      const card = track.cards[cardIndex];
      const originalId = text(card?.visualization?.sourceId || card?.visualization?.requestedSourceId || card?.visualization?.card?.id);
      const original = catalogById.get(originalId);
      if (!original) continue;
      let target = original;
      let replacement = null;
      if (needsReplacement(original)) {
        replacement = replacementById.get(originalId);
        if (!replacement) {
          replacement = replacementFor(original, catalog);
          if (!replacement) continue;
          replacementById.set(originalId, replacement);
        }
        target = replacement;
      }
      if (!replacement && portableCardIsExact(card, target)) continue;
      const reason = replacement ? repairReason(original) : "portable-card-missing-or-stale";
      track.cards[cardIndex] = hydrateShaderCard(card, target, { replacement: Boolean(replacement), original, reason });
      const evidence = {
        scope,
        trackId: text(track.id),
        cardId: text(card.id),
        startSeconds: Number(card.startSeconds || 0),
        endSeconds: Number(card.endSeconds || 0),
        sourceId: target.id,
        sourceTitle: target.title,
        sourceHash: target.sourceHash,
        reason,
      };
      hydrations.push(evidence);
      if (replacement) replacements.push({
        ...evidence,
        originalId,
        originalTitle: original.title,
        replacementId: replacement.id,
        replacementTitle: replacement.title,
      });
    }
  }
  if (replacements.length || hydrations.length) {
    repairedGraph.directorV2 = {
      ...(repairedGraph.directorV2 || {}),
      runtimeShaderRepair: {
        schemaVersion: "hapa.echo.runtime-shader-repair-receipt.v1",
        status: replacements.length ? "repaired" : "hydrated",
        nonDestructive: true,
        replacementCount: replacements.length,
        hydrationCount: hydrations.length,
        replacements,
        hydrations,
      },
    };
  }
  return { scope, graph: repairedGraph, replacementById, replacements, hydrations };
}

export function echoRuntimeShaderRepairReceipt(scopes = [], sourceKey = "sourceProjectMutated") {
  const deliveredScopes = scopes.filter(Boolean).map((scope) => ({
    scope: scope.scope,
    replacementCount: scope.replacements.length,
    hydrationCount: scope.hydrations.length,
    replacements: scope.replacements,
    hydrations: scope.hydrations,
  }));
  const replacements = deliveredScopes.flatMap((scope) => scope.replacements);
  const hydrations = deliveredScopes.flatMap((scope) => scope.hydrations);
  return {
    schemaVersion: "hapa.echo.runtime-shader-repair-receipt.v1",
    status: replacements.length ? "repaired" : hydrations.length ? "hydrated" : "not-required",
    nonDestructive: true,
    [sourceKey]: false,
    replacementCount: replacements.length,
    hydrationCount: hydrations.length,
    replacements,
    hydrations,
    scopes: deliveredScopes,
  };
}

export function repairEchoRuntimeDirectionVariant(variant = {}, options = {}) {
  const variantId = echoDirectionVariantId(variant) || "unnamed";
  const catalog = options.catalog || [];
  const sourceProfile = options.sourceProfile === true;
  const selected = options.selected === true;
  const compactGraph = options.compactGraph || ((graph) => graph);
  const compactDerivedGraph = options.compactDerivedGraph || compactGraph;
  const scopes = [];
  const delivered = { ...variant };
  for (const field of ["visualizer_timeline", "visualizerTimeline"]) {
    if (!Array.isArray(variant?.[field])) continue;
    const result = repairEchoRuntimeVisualizerTimeline(variant[field], catalog, `variant:${variantId}:${field}`);
    delivered[field] = result.timeline;
    scopes.push(result);
  }
  let hasDeclaredGraph = false;
  for (const field of ["director_show_graph", "directorShowGraph"]) {
    const declaredGraph = variant?.[field];
    if (!declaredGraph?.tracks) continue;
    hasDeclaredGraph = true;
    const result = repairEchoRuntimeShaderGraph(declaredGraph, catalog, `variant:${variantId}:${field}`);
    delivered[field] = sourceProfile ? result.graph : compactGraph(result.graph);
    scopes.push(result);
  }
  if (selected && !hasDeclaredGraph) {
    const derivedVariant = {
      ...delivered,
      ...(Array.isArray(delivered.visualizerTimeline) && !Array.isArray(delivered.visualizer_timeline)
        ? { visualizer_timeline: delivered.visualizerTimeline }
        : {}),
    };
    const derived = deriveEchoDirectionVariantProject(options.baseProject || {}, derivedVariant, {
      identityVariant: variant,
    });
    const result = repairEchoRuntimeShaderGraph(
      derived.director_show_graph,
      catalog,
      `variant:${variantId}:derived-director-show-graph`,
    );
    delivered.director_show_graph = sourceProfile
      ? result.graph
      : compactDerivedGraph(result.graph, { baseGraphAvailable: Boolean(options.baseProject?.director_show_graph?.tracks) });
    scopes.push(result);
  }
  const deliveredFullPayload = selected
    || Array.isArray(variant?.visualizer_timeline)
    || Array.isArray(variant?.visualizerTimeline)
    || hasDeclaredGraph;
  if (deliveredFullPayload) {
    delivered.runtime_shader_repair_receipt = echoRuntimeShaderRepairReceipt(scopes, "sourceVariantMutated");
  }
  return { variant: delivered, scopes };
}
