import { projectToEditorGraph } from "./multitrack-editor.js";

export const ECHO_DIRECTION_WORKING_FORK_SCHEMA = "hapa.echo.direction-working-fork.v1";
export const ECHO_DIRECTION_FORK_PAYLOAD_SCHEMA = "hapa.echo.direction-variant-fork-request.v1";

const VARIANT_PROJECT_PATCH_FIELDS = Object.freeze([
  "lyric_variant",
  "lyric_position",
  "lyric_style",
  "director_show_graph_patches",
  "variation_lab_promotion",
  "director_patch_lineage",
  "human_taste_memory",
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function compactHash(value) {
  const input = JSON.stringify(stable(value));
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    left = Math.imul(left ^ input.charCodeAt(index), 0x01000193) >>> 0;
    right = Math.imul(right ^ (input.charCodeAt(index) + index), 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
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

export function echoDirectionVariantFingerprint(variant = {}) {
  const declared = text(variant.fingerprint || variant.variantFingerprint || variant.variant_fingerprint || variant.receiptHash || variant.receipt_hash);
  if (declared) return declared;
  return `fnv:${compactHash({
    id: echoDirectionVariantId(variant),
    seed: variant.seed || "",
    timeline: variant.timeline || [],
    visualizerTimeline: variant.visualizer_timeline || variant.visualizerTimeline || [],
  })}`;
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
  if (metadata.densityProfile?.label) parts.push(metadata.densityProfile.label);
  if (metadata.cut?.label && metadata.cut.label.toLowerCase() !== metadata.densityProfile?.label?.toLowerCase()) {
    parts.push(metadata.cut.label);
  }
  if (metadata.coveragePassLabel) parts.push(metadata.coveragePassLabel);
  else if (metadata.coveragePass !== null && metadata.coveragePass > 0) parts.push(`Library pass ${metadata.coveragePass}`);
  if (metadata.telemetry.uniqueMedia !== null) parts.push(`${metadata.telemetry.uniqueMedia} unique`);
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
  return Object.fromEntries(VARIANT_PROJECT_PATCH_FIELDS
    .filter((key) => project[key] !== undefined)
    .map((key) => [key, clone(project[key])]));
}

export function deriveEchoDirectionVariantProject(baseProject = {}, variant = {}) {
  const id = echoDirectionVariantId(variant);
  if (!id) return baseProject;
  const timeline = Array.isArray(variant.timeline) ? clone(variant.timeline) : baseProject.timeline;
  const visualizerTimeline = Array.isArray(variant.visualizer_timeline)
    ? clone(variant.visualizer_timeline)
    : Array.isArray(variant.visualizerTimeline)
      ? clone(variant.visualizerTimeline)
      : baseProject.visualizer_timeline;
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
  const declaredGraph = variant.director_show_graph || variant.directorShowGraph;
  const graph = declaredGraph?.tracks
    ? clone(declaredGraph)
    : projectToEditorGraph({ ...projected, director_show_graph: null });
  const variantHash = echoDirectionVariantFingerprint(variant);
  graph.directorV2 = {
    ...(graph.directorV2 || {}),
    variantId: id,
    variantHash,
    parentVariantId: variant.parent?.variantId || variant.lineage?.parentVariantId || null,
  };
  return {
    ...projected,
    director_show_graph: graph,
    hyperframe_script: text(variant.hyperframe_script || variant.hyperframeScript),
    hyperframe_script_stale: !text(variant.hyperframe_script || variant.hyperframeScript),
    active_direction_script_variant: {
      id,
      title: echoDirectionVariantTitle(variant),
      fingerprint: variantHash,
      ...echoDirectionVariantMetadata(variant),
      seed: variant.seed || null,
      parent: clone(variant.parent || variant.lineage || null),
      nonDestructive: true,
    },
  };
}

export function createEchoDirectionWorkingFork(project = {}, sourceVariant = {}) {
  const sourceVariantId = echoDirectionVariantId(sourceVariant);
  if (!sourceVariantId) throw new Error("A source direction cut is required.");
  const sourceVariantFingerprint = echoDirectionVariantFingerprint(sourceVariant);
  const projectSnapshot = clone(project);
  delete projectSnapshot.direction_script_variants;
  return {
    schemaVersion: ECHO_DIRECTION_WORKING_FORK_SCHEMA,
    sourceVariantId,
    sourceVariantFingerprint,
    startedAt: new Date().toISOString(),
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
  });
  const graph = projectToEditorGraph({ ...project, director_show_graph: null });
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
  return {
    schemaVersion: ECHO_DIRECTION_FORK_PAYLOAD_SCHEMA,
    songId: text(project.song_id),
    parentVariantId: text(workingFork.sourceVariantId),
    expectedParentFingerprint: text(workingFork.sourceVariantFingerprint),
    title: `${text(project.song_title) || "Song"} · Edited cut`,
    timeline: clone(project.timeline || []),
    visualizerTimeline: clone(project.visualizer_timeline || []),
    mediaDensityTelemetry: clone(project.media_density_telemetry || null),
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
