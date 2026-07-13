#!/usr/bin/env node
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeItemManagerStore } from "../src/domain/item.js";
import { createPlace, createScene, attachSceneMedia, normalizeSceneGraph } from "../src/domain/scene.js";
import { normalizeSystemMediaLibrary } from "../src/domain/systemMedia.js";
import {
  createScrollMediaAsset,
  createScrollSiteImportPlan,
  createScrollStoryItemCards,
  createScrollSystemMediaRecord,
  createScrollVideoItemCard,
  scrollMediaRecordId,
  scrollVideoCardId,
  validateScrollImportPlan,
} from "../src/domain/scroll-site-media-import.js";
import {
  SCROLL_FAL_DIRECTION_VARIANT_ID,
  recastEchoDirectorProject,
} from "../src/domain/echo-media-recast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const SCROLL_ROOT = path.resolve(process.env.HAPA_SCROLL_SITE_ROOT || "/Users/calderwong/Desktop/scroll-site-skill");
const VIDEO_ROOT = path.join(SCROLL_ROOT, "videos");
const CONTINUITY_PATH = path.join(SCROLL_ROOT, "analysis/full-cross-cohort/continuity.json");
const CONTINUITY_FRAMES_DIR = path.join(SCROLL_ROOT, "analysis/full-cross-cohort/frames");
const SITE_MANIFEST_PATH = path.join(SCROLL_ROOT, "prototype/data/site.json");
const PROTOTYPE_ROOT = path.join(SCROLL_ROOT, "prototype");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const SCENE_BASE_PATH = process.env.HAPA_SCROLL_SCENE_BASE ? path.resolve(process.env.HAPA_SCROLL_SCENE_BASE) : SCENE_STORE_PATH;
const MEDIA_LIBRARY_PATH = path.join(DATA_DIR, "media-library.json");
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const VARIANTS_DIR = path.join(DATA_DIR, "music-video-project-variants");
const VARIANTS_INDEX_PATH = path.join(VARIANTS_DIR, "index.json");
const REPORTS_DIR = path.join(DATA_DIR, "merge-reports");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const DRY_RUN = !APPLY;
const RUN_STARTED_AT = new Date().toISOString();
const RUN_ID = `scroll-site-media-${RUN_STARTED_AT.replace(/[:.]/g, "-")}`;
const IMPORT_ID = "scroll-site-root-fal-v1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function humanize(value = "") {
  return String(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function directionVariantFingerprint(variant = {}) {
  return sha256Bytes(Buffer.from(JSON.stringify({
    id: variant.id,
    parentProjectSha256: variant.parent?.projectSha256 || "",
    seed: variant.seed || "",
    sourcePolicy: variant.sourcePolicy || {},
    timeline: variant.timeline || [],
    hyperframeScript: variant.hyperframe_script || "",
  })));
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

function assertWithin(parent, child, label) {
  const parentPath = path.resolve(parent);
  const childPath = path.resolve(child);
  if (childPath !== parentPath && !childPath.startsWith(`${parentPath}${path.sep}`)) {
    throw new Error(`${label} escapes its allowed root: ${childPath}`);
  }
}

async function atomicWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
}

async function ensureSymlink(targetPath, linkPath) {
  assertWithin(MEDIA_DIR, linkPath, "Builder media link");
  await mkdir(path.dirname(linkPath), { recursive: true });
  try {
    const current = await lstat(linkPath);
    if (current.isSymbolicLink()) {
      const resolved = await realpath(linkPath).catch(() => "");
      const expected = await realpath(targetPath).catch(() => path.resolve(targetPath));
      if (resolved === expected) return;
      await unlink(linkPath);
    } else {
      throw new Error(`Refusing to replace non-symlink media file: ${linkPath}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await symlink(targetPath, linkPath);
}

function publicMediaUri(fileName = "") {
  return fileName ? `/media/${encodeURIComponent(fileName).replace(/%2F/g, "/")}` : "";
}

async function enrichPlanEntries(plan) {
  return await mapLimit(plan.clips, 4, async (entry, index) => {
    assertWithin(VIDEO_ROOT, entry.sourcePath, "Scroll source video");
    await access(entry.sourcePath);
    const info = await stat(entry.sourcePath);
    const sha256 = await sha256File(entry.sourcePath);
    const neutralTitle = entry.cohort === "fal-second-cohort"
      ? entry.authoredRoles?.[0]
        ? `${entry.authoredRoles[0]} · FAL ${sha256.slice(0, 8)}`
        : `FAL Video ${sha256.slice(0, 10)}`
      : humanize(entry.source);
    if ((index + 1) % 20 === 0 || index + 1 === plan.clips.length) {
      console.error(`[scroll-site-ingest] hashed ${index + 1}/${plan.clips.length}`);
    }
    return { ...entry, title: neutralTitle, sha256, sizeBytes: info.size };
  });
}

function derivedSourcePath(relativePath = "") {
  if (!relativePath) return "";
  const resolved = path.resolve(PROTOTYPE_ROOT, relativePath);
  assertWithin(PROTOTYPE_ROOT, resolved, "Scroll prototype derivative");
  return resolved;
}

async function createPathsAndAsset(entry) {
  const short = entry.sha256.slice(0, 12);
  const sourceFileName = `scroll-source-${entry.id}-${short}.mp4`;
  const sourceMediaPath = path.join(MEDIA_DIR, sourceFileName);
  const runtimeSource = derivedSourcePath(entry.proxyRelativePath);
  const mobileRuntimeSource = derivedSourcePath(entry.mobileProxyRelativePath);
  const posterSource = derivedSourcePath(entry.posterRelativePath);
  const runtimeFileName = runtimeSource ? `scroll-runtime-${entry.id}-${short}.mp4` : "";
  const mobileRuntimeFileName = mobileRuntimeSource ? `scroll-runtime-mobile-${entry.id}-${short}.mp4` : "";
  const posterFileName = posterSource ? `scroll-poster-${entry.id}-${short}.jpg` : "";

  const frameRows = [];
  for (const marker of ["first", "last"]) {
    const sourceFrameName = entry.frameFiles?.[marker];
    if (!sourceFrameName) continue;
    const sourceFramePath = path.join(CONTINUITY_FRAMES_DIR, sourceFrameName);
    assertWithin(CONTINUITY_FRAMES_DIR, sourceFramePath, "Continuity frame");
    if (!(await stat(sourceFramePath).catch(() => null))) continue;
    const frameFileName = `scroll-frame-${entry.id}-${short}-${marker}.jpg`;
    const frameMediaPath = path.join(MEDIA_DIR, frameFileName);
    if (APPLY) await ensureSymlink(sourceFramePath, frameMediaPath);
    frameRows.push({
      marker,
      label: `${marker[0].toUpperCase()}${marker.slice(1)} frame`,
      role: marker === "first" ? "start-state" : "end-state",
      time: marker === "first" ? 0 : Math.max(0, Number(entry.duration || 0) - 0.05),
      uri: publicMediaUri(frameFileName),
      width: entry.width,
      height: entry.height,
      mimeType: "image/jpeg",
      storage: { kind: "local-symlink", fileName: frameFileName, path: frameMediaPath, targetPath: sourceFramePath },
      createdAt: RUN_STARTED_AT,
    });
  }

  if (APPLY) {
    await ensureSymlink(entry.sourcePath, sourceMediaPath);
    if (runtimeSource && await stat(runtimeSource).catch(() => null)) await ensureSymlink(runtimeSource, path.join(MEDIA_DIR, runtimeFileName));
    if (mobileRuntimeSource && await stat(mobileRuntimeSource).catch(() => null)) await ensureSymlink(mobileRuntimeSource, path.join(MEDIA_DIR, mobileRuntimeFileName));
    if (posterSource && await stat(posterSource).catch(() => null)) await ensureSymlink(posterSource, path.join(MEDIA_DIR, posterFileName));
  }

  const paths = {
    uri: publicMediaUri(sourceFileName),
    fileName: sourceFileName,
    mediaPath: sourceMediaPath,
    runtimeUri: runtimeFileName ? publicMediaUri(runtimeFileName) : publicMediaUri(sourceFileName),
    mobileRuntimeUri: mobileRuntimeFileName ? publicMediaUri(mobileRuntimeFileName) : "",
    posterUri: posterFileName ? publicMediaUri(posterFileName) : frameRows[0]?.uri || "",
    frames: frameRows,
  };
  return { paths, asset: createScrollMediaAsset(entry, paths, RUN_STARTED_AT) };
}

function upsertById(existing = [], incoming = []) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return [...incoming, ...existing.filter((item) => !incomingIds.has(item.id))];
}

function ensureScene(graph, input) {
  const existing = graph.scenes.find((scene) => scene.tags?.includes(input.identityTag));
  if (existing) return { graph, sceneId: existing.id };
  const next = createScene(graph, {
    title: input.title,
    placeId: "scroll-site-visual-world",
    timelineId: "scroll-site-authored-route",
    summary: input.summary,
    quickPitch: input.quickPitch || input.summary,
    overallNarrative: input.narrative || input.summary,
    order: input.order,
    label: `Scroll Beat ${String(input.order).padStart(3, "0")}`,
  });
  const created = next.scenes.find((scene) => scene.title === input.title);
  if (!created) throw new Error(`Unable to create Scene: ${input.title}`);
  created.tags = unique([...(created.tags || []), "scroll-site", "scroll-fal-replacement", input.identityTag]);
  created.canonStatus = "soft_canon";
  created.productionPrompt = "Use only attached Scroll Site/FAL source Cards; keep continuity and authored-use truth visible.";
  return { graph: normalizeSceneGraph(next), sceneId: created.id };
}

function attachAssetOnce(graph, sceneId, asset) {
  const scene = graph.scenes.find((item) => item.id === sceneId);
  if (!scene || scene.assets?.some((item) => item.id === asset.id)) return graph;
  return attachSceneMedia(graph, sceneId, {
    ...asset,
    requirementId: "scene_videos",
    tags: unique([...(asset.tags || []), "scene-video", "scroll-site-scene"]),
  });
}

function buildScenes(sceneStore, site, entries, assetByClipId) {
  let graph = normalizeSceneGraph(sceneStore);
  if (!graph.places.some((place) => place.id === "scroll-site-visual-world")) {
    graph = createPlace(graph, {
      id: "scroll-site-visual-world",
      name: "Scroll Site Visual World",
      type: "dreamspace",
      summary: "Authored high-quality Scroll Site and FAL motion library for scenes, Cards, and music direction.",
      lore: "A production-facing media world; technical continuity and authored placement are kept distinct from unreviewed narrative meaning.",
      tags: ["scroll-site", "fal", "media-world", "production-library"],
    });
  }

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const authoredHolds = list(site.spine?.anchorLoopHolds);
  for (const [index, hold] of authoredHolds.entries()) {
    const result = ensureScene(graph, {
      identityTag: `scroll-stop-${hold.anchor}`,
      title: `Scroll Site · ${String(index + 1).padStart(2, "0")} · ${hold.role || humanize(hold.clip)}`,
      summary: hold.context || `Authored Scroll Site hold at route anchor ${hold.anchor}.`,
      narrative: `${hold.mode || "authored"}; continuity evidence is ${hold.selfScore ? `measured at ${hold.selfScore}` : "not claimed"}.`,
      order: 8000 + index,
    });
    graph = result.graph;
    const anchor = list(site.spine?.anchors).find((item) => Number(item.index) === Number(hold.anchor));
    const clipIds = unique([anchor?.incomingTransition, hold.clip, anchor?.outgoingTransition]);
    for (const clipId of clipIds) {
      if (!entryById.has(clipId)) continue;
      graph = attachAssetOnce(graph, result.sceneId, assetByClipId.get(clipId));
    }
  }

  const catalogs = [
    {
      identityTag: "scroll-catalog-root-authored",
      title: "Scroll Site · Authored Root Director Library",
      summary: "The authored high-quality root cohort eligible for automatic music direction.",
      filter: (entry) => entry.cohort === "root" && entry.autoEligible,
    },
    {
      identityTag: "scroll-catalog-fal-authored",
      title: "Scroll Site · Authored FAL Director Library",
      summary: "The authored high-quality FAL cohort eligible for automatic music direction.",
      filter: (entry) => entry.cohort === "fal-second-cohort" && entry.autoEligible,
    },
    {
      identityTag: "scroll-catalog-review",
      title: "Scroll Site · Processed Review Library",
      summary: "Processed root/FAL clips that are Carded and visible but require review before automatic direction.",
      filter: (entry) => !entry.autoEligible,
    },
  ];
  catalogs.forEach((catalog, catalogIndex) => {
    const result = ensureScene(graph, { ...catalog, order: 8050 + catalogIndex });
    graph = result.graph;
    for (const entry of entries.filter(catalog.filter)) {
      graph = attachAssetOnce(graph, result.sceneId, assetByClipId.get(entry.id));
    }
  });
  const normalized = normalizeSceneGraph(graph);
  const scrollScenes = normalized.scenes.filter((scene) => scene.tags?.includes("scroll-site"));
  const scrollSceneIds = new Set(scrollScenes.map((scene) => scene.id));
  const scrollPlaces = normalized.places.filter((place) => place.id === "scroll-site-visual-world");
  const sourceScenes = list(sceneStore.scenes).filter((scene) => !scrollSceneIds.has(scene.id) && !scene.tags?.includes("scroll-site"));
  const sourcePlaces = list(sceneStore.places).filter((place) => place.id !== "scroll-site-visual-world");
  const scrollTimeline = {
    id: "scroll-site-authored-route",
    name: "Scroll Site Authored Route",
    description: "Authored root/FAL visual continuity route and review-gated media libraries.",
    createdAt: RUN_STARTED_AT,
    updatedAt: RUN_STARTED_AT,
  };
  return {
    ...sceneStore,
    places: [...scrollPlaces, ...sourcePlaces],
    scenes: [...scrollScenes, ...sourceScenes],
    timelines: [scrollTimeline, ...list(sceneStore.timelines).filter((timeline) => timeline.id !== scrollTimeline.id)],
    updatedAt: RUN_STARTED_AT,
  };
}

async function buildVariants(entries, assetByClipId, projectFiles) {
  const candidates = entries.filter((entry) => entry.autoEligible).map((entry) => {
    const asset = assetByClipId.get(entry.id);
    return {
      ...entry,
      cardId: scrollVideoCardId(entry.sha256),
      mediaLibraryId: scrollMediaRecordId(entry.sha256),
      uri: asset.uri,
      runtimeUri: asset.metadata?.scrollSite?.derived?.runtimeUri || asset.uri,
      posterUri: asset.metadata?.scrollSite?.derived?.posterUri || asset.metadata?.thumbnailUri || "",
      tags: asset.tags,
    };
  });
  const variants = [];
  for (const fileName of projectFiles) {
    const filePath = path.join(PROJECTS_DIR, fileName);
    const bytes = await readFile(filePath);
    const payload = JSON.parse(bytes.toString("utf8"));
    const project = payload.music_video_project || payload;
    if (!project?.song_id) continue;
    const variant = recastEchoDirectorProject(project, candidates, {
      variantId: SCROLL_FAL_DIRECTION_VARIANT_ID,
      seed: `${project.song_id}:scroll-fal-authored-route-v1`,
      parentProjectHash: sha256Bytes(bytes),
      createdAt: RUN_STARTED_AT,
    });
    variants.push({ songId: project.song_id, fileName, parentPath: filePath, parentSha256: sha256Bytes(bytes), variant });
  }
  return variants;
}

async function backupStores() {
  const backupDir = path.join(BACKUPS_DIR, RUN_ID);
  await mkdir(backupDir, { recursive: true });
  for (const filePath of [ITEM_STORE_PATH, SCENE_STORE_PATH, MEDIA_LIBRARY_PATH, VARIANTS_INDEX_PATH]) {
    if (!(await stat(filePath).catch(() => null))) continue;
    await copyFile(filePath, path.join(backupDir, path.basename(filePath)));
  }
  return backupDir;
}

async function main() {
  const [continuityBytes, siteBytes, itemStore, sceneStore, mediaLibrary] = await Promise.all([
    readFile(CONTINUITY_PATH),
    readFile(SITE_MANIFEST_PATH),
    readJson(ITEM_STORE_PATH),
    readJson(SCENE_BASE_PATH),
    readJson(MEDIA_LIBRARY_PATH),
  ]);
  const continuity = JSON.parse(continuityBytes.toString("utf8"));
  const site = JSON.parse(siteBytes.toString("utf8"));
  const plan = createScrollSiteImportPlan({ continuity, site, sourceRoot: VIDEO_ROOT, includeAvatarBuilder: false });
  validateScrollImportPlan(plan, { included: 159, authoredEligible: 86 });
  const entries = await enrichPlanEntries(plan);
  const duplicateHashes = entries.filter((entry, index) => entries.findIndex((item) => item.sha256 === entry.sha256) !== index);
  if (duplicateHashes.length) throw new Error(`Unexpected duplicate source hashes: ${duplicateHashes.map((item) => item.source).join(", ")}`);

  const processed = await mapLimit(entries, 8, async (entry) => {
    const result = await createPathsAndAsset(entry);
    return { entry, ...result };
  });
  const assetByClipId = new Map(processed.map((item) => [item.entry.id, item.asset]));
  const mediaRecords = processed.map(({ entry, asset }) => createScrollSystemMediaRecord(entry, asset, RUN_STARTED_AT));
  const videoCards = processed.map(({ entry, asset }) => createScrollVideoItemCard(entry, asset, RUN_STARTED_AT));
  const storyCards = createScrollStoryItemCards(plan.storyCards, entries, RUN_STARTED_AT);

  const nextItemStore = normalizeItemManagerStore({
    ...itemStore,
    cards: upsertById(itemStore.cards || [], [...videoCards, ...storyCards]),
    updatedAt: RUN_STARTED_AT,
  });
  const nextSceneStore = buildScenes(sceneStore, site, entries, assetByClipId);
  const nextMediaLibrary = normalizeSystemMediaLibrary({
    ...mediaLibrary,
    records: upsertById(mediaLibrary.records || [], mediaRecords),
    batches: [{
      id: IMPORT_ID,
      runId: RUN_ID,
      sourceRoot: VIDEO_ROOT,
      continuitySha256: sha256Bytes(continuityBytes),
      siteManifestSha256: sha256Bytes(siteBytes),
      dryRun: DRY_RUN,
      totals: plan.totals,
      createdAt: RUN_STARTED_AT,
    }, ...(mediaLibrary.batches || []).filter((batch) => batch.id !== IMPORT_ID)].slice(0, 30),
    updatedAt: RUN_STARTED_AT,
  });

  const projectFiles = (await readdir(PROJECTS_DIR)).filter((file) => file.endsWith("-video-project.json")).sort();
  const parentHashesBefore = new Map(await Promise.all(projectFiles.map(async (file) => [file, await sha256File(path.join(PROJECTS_DIR, file))])));
  const variants = await buildVariants(entries, assetByClipId, projectFiles);
  const existingVariantIndex = await readJson(VARIANTS_INDEX_PATH, {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [],
    updatedAt: "",
  });
  const variantIndexRows = variants.map(({ songId, parentSha256, variant }) => ({
    id: `${songId}:${variant.id}`,
    songId,
    variantId: variant.id,
    title: variant.title,
    relativePath: `${songId}/${variant.id}.json`,
    parentProjectSha256: parentSha256,
    sourcePolicy: variant.sourcePolicy,
    replacementShots: variant.telemetry.replacementShots,
    updatedAt: RUN_STARTED_AT,
  }));
  const nextVariantIndex = {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: upsertById(existingVariantIndex.variants || [], variantIndexRows),
    updatedAt: RUN_STARTED_AT,
  };

  const report = {
    schemaVersion: "hapa.scroll-site-media-ingest-report.v1",
    runId: RUN_ID,
    importId: IMPORT_ID,
    mode: APPLY ? "apply" : "dry-run",
    source: {
      root: SCROLL_ROOT,
      videoRoot: VIDEO_ROOT,
      continuityPath: CONTINUITY_PATH,
      continuitySha256: sha256Bytes(continuityBytes),
      siteManifestPath: SITE_MANIFEST_PATH,
      siteManifestSha256: sha256Bytes(siteBytes),
    },
    policy: {
      includedCohorts: ["root", "fal-second-cohort"],
      excludedExistingCohort: "avatar-builder",
      replacementEligibility: "authored-site-manifest-only",
      forbiddenLineages: ["Hell Week", "hapa-dev-proto", "LTX"],
      preserveLegacyProjects: true,
    },
    counts: {
      sourceVideos: entries.length,
      rootVideos: entries.filter((entry) => entry.cohort === "root").length,
      falVideos: entries.filter((entry) => entry.cohort === "fal-second-cohort").length,
      authoredEligible: entries.filter((entry) => entry.autoEligible).length,
      reviewGated: entries.filter((entry) => !entry.autoEligible).length,
      videoCards: videoCards.length,
      storyCards: storyCards.length,
      systemMediaRecords: mediaRecords.length,
      directionVariants: variants.length,
      storyScenes: list(site.spine?.anchorLoopHolds).length,
      catalogScenes: 3,
    },
    validation: {
      uniqueFullHashes: new Set(entries.map((entry) => entry.sha256)).size,
      sourceFilesReadable: entries.length,
      parentProjectFilesPreserved: projectFiles.length,
      variantTimelinesWithForbiddenMedia: variants.filter(({ variant }) => /hell[ -]?week|hapa[-_]dev[-_]proto|\bltx\b/i.test(JSON.stringify(variant.timeline))).length,
      originalProjectsMutated: 0,
    },
    outputs: {
      itemStore: ITEM_STORE_PATH,
      sceneStore: SCENE_STORE_PATH,
      mediaLibrary: MEDIA_LIBRARY_PATH,
      variantsDirectory: VARIANTS_DIR,
      variantIndex: VARIANTS_INDEX_PATH,
    },
    generatedAt: new Date().toISOString(),
  };
  if (report.validation.variantTimelinesWithForbiddenMedia !== 0) {
    const offenders = variants
      .filter(({ variant }) => /hell[ -]?week|hapa[-_]dev[-_]proto|\bltx\b/i.test(JSON.stringify(variant.timeline)))
      .slice(0, 8)
      .map(({ songId, variant }) => {
        const text = JSON.stringify(variant.timeline);
        const match = text.match(/.{0,100}(?:hell[ -]?week|hapa[-_]dev[-_]proto|\bltx\b).{0,100}/i)?.[0] || "unknown";
        return `${songId}: ${match}`;
      });
    throw new Error(`A generated direction timeline retained forbidden media lineage markers. ${offenders.join(" | ")}`);
  }

  let backupDir = "";
  if (APPLY) {
    backupDir = await backupStores();
    await Promise.all([
      atomicWrite(ITEM_STORE_PATH, json(nextItemStore)),
      atomicWrite(SCENE_STORE_PATH, json(nextSceneStore)),
      atomicWrite(MEDIA_LIBRARY_PATH, json(nextMediaLibrary)),
    ]);
    for (const { songId, variant } of variants) {
      const variantPath = path.join(VARIANTS_DIR, songId, `${variant.id}.json`);
      assertWithin(VARIANTS_DIR, variantPath, "Direction variant");
      const existingVariant = await readJson(variantPath, null).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (existingVariant) {
        if (directionVariantFingerprint(existingVariant) !== directionVariantFingerprint(variant)) {
          throw new Error(`Append-only direction variant conflict at ${variantPath}; choose a new variant id instead of overwriting it.`);
        }
      } else {
        await atomicWrite(variantPath, json(variant));
      }
    }
    await atomicWrite(VARIANTS_INDEX_PATH, json(nextVariantIndex));
  }

  const parentHashesAfter = new Map(await Promise.all(projectFiles.map(async (file) => [file, await sha256File(path.join(PROJECTS_DIR, file))])));
  const mutatedParents = projectFiles.filter((file) => parentHashesBefore.get(file) !== parentHashesAfter.get(file));
  if (mutatedParents.length) throw new Error(`Legacy project files were unexpectedly mutated: ${mutatedParents.join(", ")}`);
  report.validation.originalProjectsMutated = mutatedParents.length;
  report.backupDirectory = backupDir;
  const reportPath = path.join(REPORTS_DIR, `${RUN_ID}.json`);
  if (APPLY) await atomicWrite(reportPath, json(report));

  console.log(json({ ok: true, dryRun: DRY_RUN, reportPath: APPLY ? reportPath : null, ...report }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
