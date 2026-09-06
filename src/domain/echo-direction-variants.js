import { applyEchoMediaEvidenceProjection } from "./unified-media-catalog.js";
import { projectToEditorGraph, reframeEchoShowGraphOutputProfile } from "./multitrack-editor.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";
import { NARRATIVE_VARIANT_RECIPES } from "./echo-director-recipes.js";
import { inspectEchoTimelineMediaEligibility, echoMediaConstraintError } from "./echo-media-eligibility.js";

export const ECHO_DIRECTION_WORKING_FORK_SCHEMA = "hapa.echo.direction-working-fork.v1";
export const ECHO_DIRECTION_FORK_PAYLOAD_SCHEMA = "hapa.echo.direction-variant-fork-request.v1";
export const ECHO_VARIANT_GRAPH_OVERLAY_SCHEMA = "hapa.echo.variant-graph-overlay.v1";

export function beginEchoSongCardPlanWait(state = {}, songId = "", revision = "", cutId = "", options = {}) {
  const id = text(songId);
  if (!id) return state;
  const current = object(state)[id];
  const previous = options.reusePrevious === true && current?.status === "waiting"
    ? current.previous || null
    : current || null;
  return {
    ...state,
    [id]: {
      status: "waiting",
      revision: text(revision) || "saving",
      cutId: text(cutId || revision) || null,
      previous,
    },
  };
}

export function pinEchoSongCardPlanSnapshot(state = {}, songId = "", revision = "", snapshot = null) {
  const id = text(songId);
  if (!id || !snapshot?.project || !snapshot?.showGraph?.tracks) return state;
  return {
    ...state,
    [id]: {
      status: "ready",
      revision: text(revision),
      cutId: text(snapshot.cutId || revision) || null,
      project: snapshot.project,
      showGraph: snapshot.showGraph,
    },
  };
}

export function restoreEchoSongCardPlanSnapshot(state = {}, songId = "", options = {}) {
  const id = text(songId);
  const current = object(state)[id];
  if (!id || current?.status !== "waiting") return state;
  let previous = current.previous || null;
  if (options.toReady === true) {
    while (previous?.status === "waiting") previous = previous.previous || null;
  }
  if (previous) return { ...state, [id]: previous };
  const next = { ...state };
  delete next[id];
  return next;
}

const VARIANT_PROJECT_PATCH_FIELDS = Object.freeze([
  "mediaConstraints",
  "output_profile",
  "lyric_variant",
  "lyric_position",
  "lyric_style",
  "lyrics",
  "lyrics_enabled",
  "lyric_template_id",
  "director_show_graph_patches",
  "variation_lab_promotion",
  "director_patch_lineage",
  "human_taste_memory",
  "persistent_shader_slots_schema",
  "persistent_shader_slots",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value || "").trim();
}

function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function rowStartSeconds(row = {}) {
  return number(row?.start_sec ?? row?.startSeconds, null);
}

function rowEndSeconds(row = {}) {
  return number(row?.end_sec ?? row?.endSeconds, null);
}

function timelineEndSeconds(rows) {
  return Array.isArray(rows)
    ? rows.reduce((maximum, row) => Math.max(maximum, rowEndSeconds(row) ?? 0), 0)
    : 0;
}

function setRowBounds(row, start, end) {
  if (row?.start_sec !== undefined || row?.startSeconds === undefined) row.start_sec = start;
  else row.startSeconds = start;
  if (row?.end_sec !== undefined || row?.endSeconds === undefined) row.end_sec = end;
  else row.endSeconds = end;
  return row;
}

function variantScriptDurationSeconds(variant = {}) {
  const script = text(variant.hyperframe_script || variant.hyperframeScript);
  const match = script.match(/\bdata-duration=["']([0-9]+(?:\.[0-9]+)?)["']/i);
  return number(match?.[1], null);
}

function projectTimelineToDuration(rows, durationSeconds, timelineName, options = {}) {
  if (!Array.isArray(rows) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return {
      rows: clone(rows),
      receipt: {
        timeline: timelineName,
        inputRows: Array.isArray(rows) ? rows.length : 0,
        outputRows: Array.isArray(rows) ? rows.length : 0,
        clippedRows: 0,
        droppedRows: 0,
        extendedRows: 0,
      },
    };
  }
  let clippedRows = 0;
  let droppedRows = 0;
  const projectedRows = [];
  for (const sourceRow of rows) {
    const row = clone(sourceRow);
    const start = rowStartSeconds(row);
    const end = rowEndSeconds(row);
    if (start === null || end === null) {
      projectedRows.push(row);
      continue;
    }
    const projectedStart = Math.max(0, start);
    const projectedEnd = Math.min(durationSeconds, end);
    if (projectedStart >= durationSeconds || projectedEnd <= projectedStart) {
      droppedRows += 1;
      continue;
    }
    if (projectedStart !== start || projectedEnd !== end) clippedRows += 1;
    projectedRows.push(setRowBounds(row, projectedStart, projectedEnd));
  }
  let extendedRows = 0;
  const extensionStartSeconds = number(options.extensionStartSeconds, null);
  const extensionRows = Array.isArray(options.extensionRows) ? options.extensionRows : [];
  if (
    extensionStartSeconds !== null
    && extensionStartSeconds < durationSeconds - 0.050001
    && Math.abs(timelineEndSeconds(projectedRows) - extensionStartSeconds) <= 0.100001
    && timelineEndSeconds(extensionRows) >= durationSeconds - 0.050001
  ) {
    for (const sourceRow of extensionRows) {
      const start = rowStartSeconds(sourceRow);
      const end = rowEndSeconds(sourceRow);
      if (start === null || end === null || end <= extensionStartSeconds) continue;
      const projectedStart = Math.max(extensionStartSeconds, start);
      const projectedEnd = Math.min(durationSeconds, end);
      if (projectedEnd <= projectedStart) continue;
      projectedRows.push(setRowBounds(clone(sourceRow), projectedStart, projectedEnd));
      extendedRows += 1;
    }
  }
  return {
    rows: projectedRows,
    receipt: {
      timeline: timelineName,
      inputRows: rows.length,
      outputRows: projectedRows.length,
      clippedRows,
      droppedRows,
      extendedRows,
      extensionStartSeconds: extendedRows > 0 ? extensionStartSeconds : null,
      extensionSource: extendedRows > 0 ? "canonical-base-tail" : null,
    },
  };
}

function graphFitsDuration(graph, durationSeconds) {
  if (!graph?.tracks || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  const graphDuration = number(graph?.song?.durationSeconds, null);
  if (graphDuration === null || Math.abs(graphDuration - durationSeconds) > 0.050001) return false;
  return graph.tracks.every((track) => (Array.isArray(track?.cards) ? track.cards : []).every((card) => {
    const start = number(card?.startSeconds ?? card?.start_sec, null);
    const end = number(card?.endSeconds ?? card?.end_sec, null);
    return start !== null && end !== null && start >= 0 && end > start && end <= durationSeconds + 0.000001;
  }));
}

function hydrateEchoVariantGraphOverlay(baseGraph, declaredGraph) {
  const declared = clone(declaredGraph);
  if (declared?.delivery?.schemaVersion !== ECHO_VARIANT_GRAPH_OVERLAY_SCHEMA) return declared;
  const base = clone(baseGraph) || {};
  return {
    ...base,
    ...declared,
    song: {
      ...(base.song || {}),
      ...(declared.song || {}),
      lyricOverlay: declared.song?.lyricOverlay || base.song?.lyricOverlay || { lines: [] },
    },
    stems: declared.stems || base.stems,
    tracks: Array.isArray(declared.tracks) ? declared.tracks : base.tracks || [],
    directorV2: {
      ...(base.directorV2 || {}),
      ...(declared.directorV2 || {}),
    },
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function compactHash(value) {
  const input = JSON.stringify(stable(value));
  // These are the existing content-v2 lanes, kept byte-compatible. Scalar
  // state avoids eight array reads/writes and an inner loop for every UTF-16
  // code unit in large saved cuts. Do not substitute another hash algorithm.
  let h0=0x811c9dc5,h1=0x9e3779b9,h2=0x85ebca6b,h3=0xc2b2ae35;
  let h4=0x27d4eb2f,h5=0x165667b1,h6=0xd3a2646c,h7=0xfd7046c5;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index) + index;
    h0=Math.imul(h0^code,0x01000193)>>>0;
    h1=Math.imul(h1^(code+131),0x85ebca6b)>>>0;
    h2=Math.imul(h2^(code+262),0xc2b2ae35)>>>0;
    h3=Math.imul(h3^(code+393),0x27d4eb2f)>>>0;
    h4=Math.imul(h4^(code+524),0x165667b1)>>>0;
    h5=Math.imul(h5^(code+655),0xd3a2646c)>>>0;
    h6=Math.imul(h6^(code+786),0xfd7046c5)>>>0;
    h7=Math.imul(h7^(code+917),0x9e3779b1)>>>0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map((lane) => lane.toString(16).padStart(8, "0")).join("");
}

function metadataObject(variant, camel, snake, aliases = []) {
  const values = [variant?.[camel], variant?.[snake], ...aliases.map((key) => variant?.[key])];
  return object(values.find((value) => value && typeof value === "object"));
}

export function echoDirectionVariantId(variant = {}) {
  return text(variant.id || variant.variant_id || variant.variantId);
}

export function echoDirectionVariantTitle(variant = {}) {
  return text(variant.title || variant.label || variant.name || echoDirectionVariantId(variant) || "Direction cut");
}

export function echoDirectionVariantDeclaredFingerprint(variant = {}) {
  return text(variant.fingerprint || variant.variantFingerprint || variant.variant_fingerprint || variant.receiptHash || variant.receipt_hash);
}

function echoDirectionVariantContentPayload(variant = {}) {
  const payload = clone(object(variant));
  for (const field of [
    "fingerprint", "variantFingerprint", "variant_fingerprint", "receiptHash", "receipt_hash",
    "sourceFingerprint", "source_fingerprint",
    "variant_source", "projectionValidation", "runtime_shader_repair_receipt", "runtimeShaderRepairReceipt",
    "delivery_receipt", "deliveryReceipt", "execution_preview", "executionPreview", "canonical_media_evidence",
  ]) {
    delete payload[field];
  }
  for (const field of ["director_show_graph", "directorShowGraph"]) {
    if (payload[field]?.directorV2) {
      delete payload[field].directorV2.variantHash;
    }
  }
  return payload;
}

export function echoDirectionVariantFingerprint(variant = {}) {
  return `content-v2:${compactHash(echoDirectionVariantContentPayload(variant))}`;
}

/**
 * The Editor can receive a runtime-repaired projection of a saved cut (for
 * example, when an unavailable shader is hydrated for playback).  That
 * projection must not become the optimistic-concurrency identity of the
 * immutable source file being forked.
 */
export function echoDirectionVariantSourceFingerprint(variant = {}) {
  const sourceFingerprint = text(variant.source_fingerprint || variant.sourceFingerprint);
  if (/^content-v2:[a-f0-9]{64}$/iu.test(sourceFingerprint)) return sourceFingerprint;
  return echoDirectionVariantFingerprint(variant);
}

export function validateEchoDirectionVariantProjection({ baseProject = {}, variant = {}, graph = {} } = {}) {
  const reasons = [];
  const variantId = echoDirectionVariantId(variant);
  const expectedFingerprint = echoDirectionVariantFingerprint(variant);
  const declaredFingerprint = echoDirectionVariantDeclaredFingerprint(variant);
  const expectedSongIds = [...new Set([
    baseProject.song_id,
    baseProject.audio_id,
    baseProject.registry_track_id,
    baseProject.director_show_graph?.song?.id,
  ].map(text).filter(Boolean))];
  const graphSongId = text(graph?.song?.id);
  const expectedDuration = number(baseProject.director_show_graph?.song?.durationSeconds ?? baseProject.duration, null);
  const graphDuration = number(graph?.song?.durationSeconds, null);
  const baseSchema = text(baseProject.director_show_graph?.schemaVersion);
  const graphSchema = text(graph?.schemaVersion);
  const baseSourceHash = text(baseProject.director_show_graph?.directorV2?.source?.sourceProjectHash);
  const graphSourceHash = text(graph?.directorV2?.source?.sourceProjectHash);
  if (!variantId) reasons.push("variant-id-missing");
  if (!graphSongId || !expectedSongIds.includes(graphSongId)) reasons.push("variant-graph-song-mismatch");
  if (expectedDuration !== null && (graphDuration === null || Math.abs(graphDuration - expectedDuration) > 0.050001)) reasons.push("variant-graph-duration-mismatch");
  if (!Array.isArray(graph?.tracks)) reasons.push("variant-graph-tracks-missing");
  if (baseSchema && graphSchema !== baseSchema) reasons.push("variant-graph-schema-mismatch");
  if (text(graph?.directorV2?.variantId) !== variantId) reasons.push("variant-graph-id-mismatch");
  if (text(graph?.directorV2?.variantHash) !== expectedFingerprint) reasons.push("variant-graph-fingerprint-mismatch");
  if (declaredFingerprint.startsWith("content-v2:") && declaredFingerprint !== expectedFingerprint) reasons.push("variant-declared-fingerprint-mismatch");
  if (baseSourceHash && graphSourceHash !== baseSourceHash) reasons.push("variant-parent-source-hash-mismatch");
  return {
    schemaVersion: "hapa.echo.direction-variant-projection-validation.v1",
    ok: reasons.length === 0,
    reasons,
    variantId: variantId || null,
    expectedFingerprint,
    declaredFingerprint: declaredFingerprint || null,
    declaredFingerprintStatus: !declaredFingerprint
      ? "absent"
      : declaredFingerprint.startsWith("content-v2:")
        ? declaredFingerprint === expectedFingerprint ? "verified" : "mismatch"
        : "legacy-claim-not-authoritative",
    graphSongId: graphSongId || null,
    expectedSongIds,
    expectedDurationSeconds: expectedDuration,
    graphDurationSeconds: graphDuration,
    baseSourceProjectHash: baseSourceHash || null,
    graphSourceProjectHash: graphSourceHash || null,
  };
}

export function echoDirectionVariantMetadata(variant = {}) {
  const variationSet = metadataObject(variant, "variationSet", "variation_set", ["variantFamily", "variant_family"]);
  const cut = metadataObject(variant, "cut", "cut_metadata", ["cutProfile", "cut_profile"]);
  const densityProfile = metadataObject(variant, "densityProfile", "density_profile", ["density"]);
  const telemetry = object(variant.telemetry);
  const familyId = text(variationSet.id || variationSet.familyId || variationSet.family_id);
  const familyLabel = text(variationSet.label || variationSet.title || variationSet.name);
  const densityId = text(densityProfile.id || densityProfile.key || (typeof variant.density === "string" ? variant.density : ""));
  const densityLabel = text(densityProfile.label || densityProfile.title || densityProfile.name || densityId);
  const cutOrdinal = number(cut.ordinal ?? cut.index ?? variant.cutOrdinal ?? variant.cut_ordinal, null);
  const cutLabel = text(cut.label || cut.title || cut.name || (cutOrdinal !== null ? `Cut ${cutOrdinal}` : ""));
  const coverageValue = variant.coveragePass ?? variant.coverage_pass ?? cut.coveragePass ?? cut.coverage_pass;
  const coverageObject = object(coverageValue);
  const coveragePass = number(coverageObject.ordinal ?? coverageObject.index ?? coverageObject.pass ?? coverageValue, null);
  const coveragePassLabel = text(coverageObject.label || coverageObject.title || coverageObject.name);
  return {
    variationSet: familyId || familyLabel ? {
      ...clone(variationSet),
      id: familyId || familyLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label: familyLabel || familyId,
    } : null,
    cut: cutLabel || cutOrdinal !== null ? { ...clone(cut), ordinal: cutOrdinal, label: cutLabel } : null,
    densityProfile: densityId || densityLabel ? { ...clone(densityProfile), id: densityId || densityLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: densityLabel || densityId } : null,
    coveragePass,
    coveragePassLabel,
    telemetry: {
      replacementShots: number(telemetry.replacementShots ?? telemetry.mediaBearingShots, null),
      uniqueMedia: number(telemetry.uniqueMedia, null),
      videoEventsPerMinute: number(telemetry.videoEventsPerMinute, null),
      videoCoverageSeconds: number(telemetry.videoCoverageSeconds, null),
    },
  };
}

export function echoDirectionVariantOptionLabel(variant = {}) {
  const metadata = echoDirectionVariantMetadata(variant);
  const hasStructuredCutMetadata = Boolean(
    metadata.variationSet || metadata.densityProfile || metadata.cut || metadata.coveragePass !== null,
  );
  if (!hasStructuredCutMetadata) return echoDirectionVariantTitle(variant);
  const parts = [];
  if (metadata.cut?.kind === "human-fork") parts.push(echoDirectionVariantTitle(variant));
  else if (metadata.densityProfile?.label) parts.push(metadata.densityProfile.label);
  if (metadata.cut?.kind !== "human-fork" && metadata.cut?.label && metadata.cut.label.toLowerCase() !== metadata.densityProfile?.label?.toLowerCase()) {
    parts.push(metadata.cut.label);
  }
  if (metadata.coveragePassLabel) parts.push(metadata.coveragePassLabel);
  else if (metadata.coveragePass !== null && metadata.coveragePass > 0) parts.push(`Library pass ${metadata.coveragePass}`);
  if (metadata.telemetry.uniqueMedia !== null) parts.push(`${metadata.telemetry.uniqueMedia} unique`);
  const createdAt = text(variant.createdAt || variant.created_at || variant.updatedAt || variant.updated_at);
  const createdDate = createdAt ? new Date(createdAt) : null;
  if (createdDate && Number.isFinite(createdDate.getTime())) {
    const date = `${createdDate.getUTCFullYear()}-${String(createdDate.getUTCMonth() + 1).padStart(2, "0")}-${String(createdDate.getUTCDate()).padStart(2, "0")}`;
    const time = `${String(createdDate.getUTCHours()).padStart(2, "0")}:${String(createdDate.getUTCMinutes()).padStart(2, "0")} UTC`;
    parts.push(`Run ${date} ${time}`);
  }
  return parts.length ? parts.join(" · ") : echoDirectionVariantTitle(variant);
}

export function groupEchoDirectionVariants(variants = []) {
  const groups = new Map();
  for (const variant of Array.isArray(variants) ? variants : []) {
    const metadata = echoDirectionVariantMetadata(variant);
    const id = metadata.variationSet?.id || "earlier-cuts";
    const label = metadata.variationSet?.label || "Earlier append-only cuts";
    if (!groups.has(id)) groups.set(id, { id, label, variants: [] });
    groups.get(id).variants.push(variant);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      variants: group.variants.slice().sort((left, right) => {
        const a = echoDirectionVariantMetadata(left);
        const b = echoDirectionVariantMetadata(right);
        const densityOrdinal = (a.densityProfile?.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.densityProfile?.ordinal ?? Number.MAX_SAFE_INTEGER);
        if (densityOrdinal) return densityOrdinal;
        const density = text(a.densityProfile?.label).localeCompare(text(b.densityProfile?.label));
        if (density) return density;
        const ordinal = (a.cut?.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.cut?.ordinal ?? Number.MAX_SAFE_INTEGER);
        if (ordinal) return ordinal;
        return echoDirectionVariantTitle(left).localeCompare(echoDirectionVariantTitle(right));
      }),
    }))
    .sort((left, right) => {
      if (left.id === "earlier-cuts") return 1;
      if (right.id === "earlier-cuts") return -1;
      return left.label.localeCompare(right.label);
    });
}

export function pickEchoDirectionVariantProjectPatch(project = {}) {
  const patch = Object.fromEntries(VARIANT_PROJECT_PATCH_FIELDS
    .filter((key) => project[key] !== undefined)
    .map((key) => [key, clone(project[key])]));
  if (patch.output_profile !== undefined) patch.output_profile = resolveEchoOutputProfile(patch.output_profile);
  return patch;
}

export function deriveEchoDirectionVariantProject(baseProject = {}, variant = {}, options = {}) {
  const id = echoDirectionVariantId(variant);
  if (!id) return baseProject;
  const identityVariant = options.identityVariant || variant;
  const identityVariantId = echoDirectionVariantId(identityVariant);
  if (identityVariantId !== id) {
    const error = new Error(`Direction cut ${id} cannot use identity from ${identityVariantId || "an unnamed cut"}.`);
    error.code = "echo_direction_variant_identity_mismatch";
    error.validation = {
      schemaVersion: "hapa.echo.direction-variant-projection-validation.v1",
      ok: false,
      reasons: ["variant-identity-id-mismatch"],
      variantId: id,
      identityVariantId: identityVariantId || null,
    };
    throw error;
  }
  const variantHash = echoDirectionVariantFingerprint(identityVariant);
  const baseDurationSeconds = number(
    baseProject.director_show_graph?.song?.durationSeconds ?? baseProject.duration,
    null,
  );
  const sourceTimeline = Array.isArray(variant.timeline) ? variant.timeline : baseProject.timeline;
  const declaredTimeline = applyEchoMediaEvidenceProjection(sourceTimeline, variant.canonical_media_evidence, variantHash);
  const declaredVisualizerTimeline = Array.isArray(variant.visualizer_timeline)
    ? clone(variant.visualizer_timeline)
    : Array.isArray(variant.visualizerTimeline)
      ? clone(variant.visualizerTimeline)
      : baseProject.visualizer_timeline;
  const legacyParentDurationSeconds = variantScriptDurationSeconds(variant);
  const legacyParentTailProjection = Boolean(
    variant.parent?.immutableLegacyProject === true
    && text(variant.parent?.songId) === text(baseProject.song_id)
    && legacyParentDurationSeconds !== null
    && baseDurationSeconds !== null
    && baseDurationSeconds > legacyParentDurationSeconds + 0.050001
    && Math.abs(timelineEndSeconds(declaredTimeline) - legacyParentDurationSeconds) <= 0.100001
    && Math.abs(timelineEndSeconds(declaredVisualizerTimeline) - legacyParentDurationSeconds) <= 0.100001
  );
  const timelineProjection = projectTimelineToDuration(declaredTimeline, baseDurationSeconds, "timeline", {
    extensionStartSeconds: legacyParentTailProjection ? legacyParentDurationSeconds : null,
    extensionRows: legacyParentTailProjection ? baseProject.timeline : null,
  });
  const visualizerProjection = projectTimelineToDuration(
    declaredVisualizerTimeline,
    baseDurationSeconds,
    "visualizer_timeline",
    {
      extensionStartSeconds: legacyParentTailProjection ? legacyParentDurationSeconds : null,
      extensionRows: legacyParentTailProjection ? baseProject.visualizer_timeline : null,
    },
  );
  const durationProjectionApplied = [timelineProjection.receipt, visualizerProjection.receipt]
    .some((receipt) => receipt.clippedRows > 0 || receipt.droppedRows > 0 || receipt.extendedRows > 0);
  const durationProjection = {
    schemaVersion: "hapa.echo.direction-variant-duration-projection.v1",
    status: durationProjectionApplied ? "applied" : "not-required",
    baseDurationSeconds,
    sourceVariantMutated: false,
    timelines: [timelineProjection.receipt, visualizerProjection.receipt],
  };
  const timeline = timelineProjection.rows;
  const visualizerTimeline = visualizerProjection.rows;
  const projectPatch = pickEchoDirectionVariantProjectPatch(object(variant.project_patch || variant.projectPatch));
  const explicitDensityTelemetry = variant.media_density_telemetry || variant.mediaDensityTelemetry;
  const densityTelemetry = explicitDensityTelemetry || (variant.densityProfile || variant.density_profile
    ? {
      ...clone(object(variant.telemetry)),
      densityProfile: clone(variant.densityProfile || variant.density_profile),
    }
    : baseProject.media_density_telemetry);
  const projected = {
    ...baseProject,
    ...projectPatch,
    timeline,
    visualizer_timeline: visualizerTimeline,
    media_density_telemetry: clone(densityTelemetry),
  };
  const executionPreview = object(variant.execution_preview || variant.executionPreview);
  if (text(executionPreview.status) === "preparing") {
    const reason = text(executionPreview.reason) || "certified-execution-graph-unavailable";
    return {
      ...projected,
      director_show_graph: null,
      hyperframe_script: text(variant.hyperframe_script || variant.hyperframeScript),
      hyperframe_script_stale: durationProjectionApplied || !text(variant.hyperframe_script || variant.hyperframeScript),
      execution_preview: clone(executionPreview),
      active_direction_script_variant: {
        id,
        title: echoDirectionVariantTitle(variant),
        fingerprint: variantHash,
        ...echoDirectionVariantMetadata(variant),
        seed: variant.seed || null,
        parent: clone(variant.parent || variant.lineage || null),
        nonDestructive: true,
        durationProjection,
        projectionValidation: {
          schemaVersion: "hapa.echo.direction-variant-projection-validation.v1",
          ok: false,
          reasons: [reason],
          variantId: id,
          expectedFingerprint: variantHash,
        },
      },
    };
  }
  const declaredGraph = variant.director_show_graph || variant.directorShowGraph;
  const deliveredRuntimeGraph = Boolean(
    durationProjectionApplied
    && declaredGraph?.tracks
    && variant.runtime_shader_repair_receipt?.sourceVariantMutated === false
    && graphFitsDuration(declaredGraph, baseDurationSeconds)
  );
  const certifiedReceipt = object(baseProject.director_show_graph_receipt);
  const certifiedSelectedGraph = Boolean(
    baseProject.director_show_graph?.tracks
    && text(baseProject.selected_direction_script_variant_id) === id
    && text(certifiedReceipt.status) === "ready"
    && text(certifiedReceipt.source) === "validated-derived-execution-graph"
    && text(certifiedReceipt.cutId) === id
    && text(certifiedReceipt.cutFingerprint) === variantHash
  );
  const sourceGraph = (!durationProjectionApplied || deliveredRuntimeGraph) && declaredGraph?.tracks
    ? hydrateEchoVariantGraphOverlay(baseProject.director_show_graph, declaredGraph)
    : !durationProjectionApplied && certifiedSelectedGraph
      ? clone(baseProject.director_show_graph)
      : projectToEditorGraph({ ...projected, director_show_graph: baseProject.director_show_graph });
  const graph = reframeEchoShowGraphOutputProfile(sourceGraph, projected.output_profile);
  graph.directorV2 = {
    ...(graph.directorV2 || {}),
    variantId: id,
    variantHash,
    parentVariantId: variant.parent?.variantId || variant.lineage?.parentVariantId || null,
  };
  const validation = validateEchoDirectionVariantProjection({ baseProject, variant: identityVariant, graph });
  if (!validation.ok) {
    const error = new Error(`Direction cut ${id} failed projection validation: ${validation.reasons.join(", ")}`);
    error.code = "echo_direction_variant_projection_invalid";
    error.validation = validation;
    throw error;
  }
  return {
    ...projected,
    director_show_graph: graph,
    hyperframe_script: text(variant.hyperframe_script || variant.hyperframeScript),
    hyperframe_script_stale: durationProjectionApplied || !text(variant.hyperframe_script || variant.hyperframeScript),
    active_direction_script_variant: {
      id,
      title: echoDirectionVariantTitle(variant),
      fingerprint: variantHash,
      ...echoDirectionVariantMetadata(variant),
      seed: variant.seed || null,
      parent: clone(variant.parent || variant.lineage || null),
      nonDestructive: true,
      durationProjection,
      projectionValidation: validation,
    },
  };
}

/**
 * Pins Song Card planning to the append-only saved cut. A preparing delivery
 * may borrow the already loaded portable-card graph as a projection template,
 * but the returned graph is re-identified as the saved child and never as the
 * automatically reopened `working:` copy.
 */
export function deriveEchoSavedDirectionPlanningProject(baseProject = {}, variant = {}, options = {}) {
  const projected = deriveEchoDirectionVariantProject(baseProject, variant);
  if (projected?.director_show_graph?.tracks) {
    return {
      ...projected,
      editor_graph_fallback: {
        schemaVersion: "hapa.echo.editor-graph-fallback.v1",
        source: "saved-child-certified-projection",
        reason: "saved-cut-graph-ready",
        preservesPortableCards: true,
        pinnedSavedCut: true,
      },
    };
  }
  const fallbackGraph = options.fallbackProject?.director_show_graph;
  if (!fallbackGraph?.tracks) return null;
  const locallyProjectableVariant = clone(variant);
  delete locallyProjectableVariant.execution_preview;
  delete locallyProjectableVariant.executionPreview;
  try {
    const pinned = deriveEchoDirectionVariantProject(
      { ...baseProject, director_show_graph: clone(fallbackGraph) },
      locallyProjectableVariant,
      { identityVariant: variant },
    );
    return {
      ...pinned,
      editor_graph_fallback: {
        schemaVersion: "hapa.echo.editor-graph-fallback.v1",
        source: "saved-child-local-projection",
        reason: text(projected?.execution_preview?.reason) || "saved-cut-certification-pending",
        preservesPortableCards: true,
        pinnedSavedCut: true,
      },
    };
  } catch {
    return null;
  }
}

export function createEchoDirectionWorkingFork(project = {}, sourceVariant = {}) {
  const sourceVariantId = echoDirectionVariantId(sourceVariant);
  if (!sourceVariantId) throw new Error("A source direction cut is required.");
  const sourceVariantFingerprint = echoDirectionVariantSourceFingerprint(sourceVariant);
  const startedAt = new Date().toISOString();
  const sourceSlug = sourceVariantId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "direction-cut";
  const requestedChildId = `${sourceSlug}-edit-${compactHash({
    songId: text(project.song_id),
    sourceVariantId,
    sourceVariantFingerprint,
    startedAt,
  }).slice(0, 16)}`;
  const projectSnapshot = clone(project);
  delete projectSnapshot.direction_script_variants;
  return {
    schemaVersion: ECHO_DIRECTION_WORKING_FORK_SCHEMA,
    sourceVariantId,
    sourceVariantFingerprint,
    requestedChildId,
    startedAt,
    project: {
      ...projectSnapshot,
      active_direction_script_variant: {
        ...(clone(project.active_direction_script_variant) || {}),
        id: sourceVariantId,
        fingerprint: sourceVariantFingerprint,
        workingFork: true,
        nonDestructive: true,
      },
    },
  };
}

export function deriveEchoDirectionWorkingProject(workingFork = {}) {
  if (workingFork.schemaVersion !== ECHO_DIRECTION_WORKING_FORK_SCHEMA || !workingFork.project) return null;
  const project = clone(workingFork.project);
  const workingHash = echoDirectionVariantFingerprint({
    id: `working:${workingFork.sourceVariantId}`,
    timeline: project.timeline || [],
    visualizer_timeline: project.visualizer_timeline || [],
    persistent_shader_slots: project.persistent_shader_slots || [],
  });
  const graph = projectToEditorGraph(project);
  graph.directorV2 = {
    ...(graph.directorV2 || {}),
    variantId: `working:${workingFork.sourceVariantId}`,
    variantHash: workingHash,
    parentVariantId: workingFork.sourceVariantId,
  };
  return {
    ...project,
    director_show_graph: graph,
    active_direction_script_variant: {
      ...(project.active_direction_script_variant || {}),
      workingFork: true,
      workingHash,
    },
  };
}

export function buildEchoDirectionForkRequest(workingFork = {}, project = workingFork.project || {}) {
  if (workingFork.schemaVersion !== ECHO_DIRECTION_WORKING_FORK_SCHEMA) throw new Error("Invalid working direction fork.");
  const mediaEligibility = inspectEchoTimelineMediaEligibility(project.timeline, project.mediaConstraints);
  if (mediaEligibility.some(result => !result.eligible)) throw echoMediaConstraintError(mediaEligibility.filter(result => !result.eligible), { stage: "working-fork" });
  const recut = project.director_patch_lineage?.narrativeRecut;
  const recipe = NARRATIVE_VARIANT_RECIPES[recut?.recipeId];
  const title = recipe
    ? `${text(project.song_title) || "Song"} · ${recipe.label} · ${recut.range.startSeconds}–${recut.range.endSeconds}s · ${text(recut.seed).slice(0, 128)}`
    : `${text(project.song_title) || "Song"} · Edited cut`;
  return {
    schemaVersion: ECHO_DIRECTION_FORK_PAYLOAD_SCHEMA,
    songId: text(project.song_id),
    parentVariantId: text(workingFork.sourceVariantId),
    expectedParentFingerprint: text(workingFork.sourceVariantFingerprint),
    requestedId: text(workingFork.requestedChildId),
    title,
    timeline: clone(project.timeline || []),
    visualizerTimeline: clone(project.visualizer_timeline || []),
    mediaDensityTelemetry: clone(project.media_density_telemetry || null),
    mediaConstraints: clone(project.mediaConstraints || {}),
    hyperframeScript: text(project.hyperframe_script),
    projectPatch: pickEchoDirectionVariantProjectPatch(project),
  };
}

export function summarizeEchoDirectionVariantMetadata(variant = {}) {
  const metadata = echoDirectionVariantMetadata(variant);
  return {
    variationSet: metadata.variationSet,
    cut: metadata.cut,
    densityProfile: metadata.densityProfile,
    coveragePass: metadata.coveragePass,
    coveragePassLabel: metadata.coveragePassLabel,
    telemetry: metadata.telemetry,
    fingerprint: echoDirectionVariantFingerprint(variant),
  };
}
