import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deriveEchoDirectionVariantProject, echoDirectionVariantId } from "../src/domain/echo-direction-variants.js";
import { validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import {
  projectEchoRuntimeShaderRepairProvenance,
  repairEchoRuntimeDirectionVariant,
  repairEchoRuntimeShaderGraph,
  repairEchoRuntimeVisualizerTimeline,
} from "../src/domain/echo-runtime-shader-repair.js";
import { assessSongCardMintPlanCompatibility } from "../src/domain/song-card-mint-plan-compatibility.js";
import { EchoIsfAssetCatalog } from "./echo-isf-assets.mjs";

const text = (value) => String(value ?? "").trim();
const bodyOf = (payload = {}) => payload?.music_video_project || payload || {};

function safePathSegment(value) {
  const candidate = text(value);
  return candidate
    && candidate !== "."
    && candidate !== ".."
    && path.basename(candidate) === candidate
    && !candidate.includes("/")
    && !candidate.includes("\\")
    ? candidate
    : "";
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function blockedCompatibility(plan, code, details = {}) {
  const base = assessSongCardMintPlanCompatibility({ plan });
  return {
    ...base,
    reasons: [code],
    blocker: {
      ...base.blocker,
      details: { reasons: [code], ...details },
    },
  };
}

async function loadVariant({ avatarRoot, variantsRoot, rawProject, songId, variantId }) {
  const matches = [];
  const directory = path.join(variantsRoot, songId);
  const names = await fsp.readdir(directory).catch(() => []);
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    const sourcePath = path.join(directory, name);
    try {
      const variant = await readJson(sourcePath);
      if (echoDirectionVariantId(variant) === variantId) matches.push({
        variant: {
          ...variant,
          variant_source: {
            ...(variant.variant_source || {}),
            kind: "append-only-project-variant",
            path: path.relative(avatarRoot, sourcePath),
            nonDestructive: true,
          },
        },
        sourceKind: "sidecar",
        sourceId: path.relative(avatarRoot, sourcePath),
      });
    } catch { /* An unreadable sibling cannot prove this variant. */ }
  }
  for (const variant of Array.isArray(rawProject.direction_script_variants) ? rawProject.direction_script_variants : []) {
    if (echoDirectionVariantId(variant) === variantId && !matches.length) {
      matches.push({ variant, sourceKind: "embedded", sourceId: `embedded:${variantId}` });
    }
  }
  if (matches.length !== 1) return { ok: false, code: matches.length ? "canonical-variant-ambiguous" : "canonical-variant-not-found", count: matches.length };
  return { ok: true, ...matches[0] };
}

/**
 * Resolves only canonical production artifacts and append-only direction cuts.
 * The returned domain assessment performs the edit-lineage equality proof.
 */
export function createEchoMintPlanCanonicalResolver({
  avatarRoot,
  musicVizRoot,
  projectsRoot = null,
  variantsRoot = null,
  albumRoot = null,
  shaderCatalog = null,
  shaderCatalogLoader = null,
} = {}) {
  const root = path.resolve(String(avatarRoot || process.cwd()));
  const projectDirectory = path.resolve(projectsRoot || path.join(root, "data/music-video-projects"));
  const variantDirectory = path.resolve(variantsRoot || path.join(root, "data/music-video-project-variants"));
  const albumDirectory = path.resolve(albumRoot || path.join(root, "artifacts/echo-director-v2/album"));
  const injectedShaders = Array.isArray(shaderCatalog) ? structuredClone(shaderCatalog) : null;
  const catalog = (injectedShaders || typeof shaderCatalogLoader === "function")
    ? null
    : new EchoIsfAssetCatalog({
      musicVizRoot: path.resolve(String(musicVizRoot || process.env.HAPA_MUSIC_VIZ_ROOT || path.join(os.homedir(), "Desktop", "hapa-music-viz"))),
      cacheCheckMs: 1_000,
    });
  const loadShaders = async () => {
    if (injectedShaders) return structuredClone(injectedShaders);
    if (typeof shaderCatalogLoader === "function") {
      const loaded = await shaderCatalogLoader();
      return structuredClone(Array.isArray(loaded) ? loaded : loaded?.shaders || []);
    }
    return structuredClone((await catalog.load()).shaders || []);
  };

  return async function resolveEchoMintPlanCompatibility(plan = {}) {
    const initial = assessSongCardMintPlanCompatibility({ plan });
    if (!initial.requiresRepair) return initial;
    const project = plan?.input?.project || {};
    const graph = plan?.input?.showGraph || {};
    const songId = safePathSegment(project.song_id);
    const variantId = safePathSegment(
      graph?.directorV2?.variantId
        || project?.active_direction_script_variant?.id
        || project?.activeDirectionScriptVariant?.id,
    );
    if (!songId) return blockedCompatibility(plan, "canonical-project-song-id-unsafe");
    if (!variantId) return blockedCompatibility(plan, "canonical-variant-id-unsafe");
    try {
      const projectPath = path.join(projectDirectory, `${songId}-video-project.json`);
      const compiledGraphPath = path.join(albumDirectory, songId, "native-show-graph.json");
      const [rawProjectPayload, compiledGraph] = await Promise.all([
        readJson(projectPath),
        readJson(compiledGraphPath),
      ]);
      const rawProject = bodyOf(rawProjectPayload);
      if (text(rawProject.song_id) !== songId) {
        return blockedCompatibility(plan, "canonical-project-song-identity-mismatch");
      }
      const compiledValidation = validateEchoCompiledShowGraph({ project: rawProject, graph: compiledGraph });
      if (!compiledValidation.ok) {
        return blockedCompatibility(plan, "canonical-compiled-graph-invalid", { validation: compiledValidation });
      }
      const loadedVariant = await loadVariant({
        avatarRoot: root,
        variantsRoot: variantDirectory,
        rawProject,
        songId,
        variantId,
      });
      if (!loadedVariant.ok) {
        return blockedCompatibility(plan, loadedVariant.code, { matchCount: loadedVariant.count });
      }
      const suppliedShaders = await loadShaders();
      const shaderCatalogSha256 = digest(suppliedShaders);
      const initialBaseGraphRepair = repairEchoRuntimeShaderGraph(compiledGraph, suppliedShaders, "project:director-show-graph");
      const baseTimelineRepair = repairEchoRuntimeVisualizerTimeline(rawProject.visualizer_timeline, suppliedShaders, "project:visualizer-timeline");
      const baseGraphRepair = {
        ...initialBaseGraphRepair,
        graph: projectEchoRuntimeShaderRepairProvenance(initialBaseGraphRepair.graph, baseTimelineRepair).graph,
      };
      const baseProject = {
        ...rawProject,
        visualizer_timeline: baseTimelineRepair.timeline,
        director_show_graph: baseGraphRepair.graph,
      };
      const repairedVariant = repairEchoRuntimeDirectionVariant(loadedVariant.variant, {
        catalog: suppliedShaders,
        sourceProfile: true,
        selected: true,
        baseProject,
      }).variant;
      const canonicalProject = deriveEchoDirectionVariantProject(baseProject, repairedVariant, {
        identityVariant: loadedVariant.variant,
      });
      return assessSongCardMintPlanCompatibility({
        plan,
        canonicalProject,
        canonicalGraph: canonicalProject.director_show_graph,
        // The unmodified editorial payload is the authority for proving that
        // no saved cuts, timings, or project-patch edits were discarded.
        sourceVariant: loadedVariant.variant,
        sourceEvidence: {
          sourceKind: loadedVariant.sourceKind,
          sourceId: loadedVariant.sourceId,
          baseProjectSha256: digest(rawProjectPayload),
          compiledGraphSha256: digest(compiledGraph),
          directionVariantSha256: digest(loadedVariant.variant),
          shaderCatalogSha256,
        },
      });
    } catch (error) {
      return blockedCompatibility(plan, "canonical-resolution-failed", {
        errorCode: text(error?.code) || null,
        message: text(error?.message || error).replace(/\s+/gu, " ").slice(0, 500),
      });
    }
  };
}
