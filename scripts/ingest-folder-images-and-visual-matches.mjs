#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, lstat, mkdir, open, readFile, realpath, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assignAssetToSlot,
  createMediaAsset,
  normalizeAvatarCard,
  pairVideoFirstFrameWithStaticImage,
  slugify,
  withVideoFrames
} from "../src/domain/avatar.js";
import {
  createCharacterSheetScaffold,
  createMediaIntelligenceRecord
} from "../src/domain/characterSheet.js";
import { normalizeAvatarTeams } from "../src/domain/avatarTeams.js";
import {
  attachSceneMedia,
  normalizeSceneGraph
} from "../src/domain/scene.js";
import {
  attachTarotCardMedia,
  normalizeTarotStore
} from "../src/domain/tarot.js";
import {
  createSystemMediaLibrary,
  normalizeSystemMediaLibrary
} from "../src/domain/systemMedia.js";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AVATAR_STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const TAROT_STORE_PATH = process.env.HAPA_TAROT_STORE || path.join(ROOT, "data/tarot-store.json");
const SCENE_STORE_PATH = process.env.HAPA_SCENE_STORE || path.join(ROOT, "data/scene-store.json");
const MEDIA_LIBRARY_PATH = process.env.HAPA_MEDIA_LIBRARY || path.join(ROOT, "data/media-library.json");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const TOOL_PATH = path.join(ROOT, "artifacts/tools/vision-ocr");
const SWIFT_SOURCE = path.join(ROOT, "scripts/vision-ocr.swift");
const REPORT_PATH = path.join(ROOT, "artifacts/enrichment/folder-image-visual-match-report.json");
const VISION_CACHE_PATH = path.join(ROOT, "artifacts/enrichment/vision-cache.json");
const DEFAULT_ROOTS = [
  "/Users/calderwong/comics",
  "/Users/calderwong/comics/Dear Papa - Album",
  "/Users/calderwong/comics/Dear Papa - Album/card-deck"
];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".heic", ".tif", ".tiff"]);
const DRY_RUN = process.argv.includes("--dry-run");
const NO_ATTACH = process.argv.includes("--no-attach");
const VISUAL_THRESHOLD = Number(process.env.HAPA_VISUAL_MATCH_THRESHOLD || 0.9);
const AUTO_THRESHOLD = Number(process.env.HAPA_VISUAL_AUTO_THRESHOLD || 0.94);
const SCENE_AUTO_THRESHOLD = Number(process.env.HAPA_VISUAL_SCENE_AUTO_THRESHOLD || 0.965);
const MIN_MARGIN = Number(process.env.HAPA_VISUAL_MATCH_MARGIN || 0.012);
const ROOT_ARGS = process.argv
  .filter((arg, index, args) => index > 1 && !arg.startsWith("--") && !args[index - 1]?.startsWith("--root"))
  .filter((arg) => arg !== "true");
const ROOTS = unique(ROOT_ARGS.length ? ROOT_ARGS : DEFAULT_ROOTS).map((item) => path.resolve(item));

await main();

async function main() {
  await ensureVisionTool();
  await mkdir(MEDIA_DIR, { recursive: true });
  const [avatarStore, tarotStore, sceneGraph, mediaLibrary] = await Promise.all([
    readAvatarStore(),
    readTarotStore(),
    readSceneGraph(),
    readMediaLibrary()
  ]);
  const nextAvatars = avatarStore.avatars.map((avatar) => normalizeAvatarCard(avatar));
  let nextTarotStore = normalizeTarotStore(tarotStore);
  let nextSceneGraph = normalizeSceneGraph(sceneGraph);
  const nextLibrary = normalizeSystemMediaLibrary(mediaLibrary);
  const report = createReport();

  const scan = await scanImageRoots(ROOTS);
  report.sourceImages = scan.sourceImages;
  report.uniqueImages = scan.files.length;
  const existing = buildExistingIndex({ avatarStore: { ...avatarStore, avatars: nextAvatars }, tarotStore: nextTarotStore, sceneGraph: nextSceneGraph, mediaLibrary: nextLibrary });
  const libraryByFingerprint = new Map(nextLibrary.records.map((record) => [record.contentFingerprint, record]).filter(([key]) => key));
  const folderImageRecords = [];
  const visionJobs = [];
  const concurrency = Number(process.env.HAPA_IMAGE_INGEST_CONCURRENCY || 8);

  await mapLimit(scan.files, concurrency, async (file, index) => {
    const fingerprint = await partialFileFingerprint(file.path, file.stat, "image");
    const known = existing.bySourcePath.get(file.path)
      || existing.byFingerprint.get(fingerprint)
      || existing.byNameSize.get(nameSizeKey(file.name, file.stat.size))
      || libraryByFingerprint.get(fingerprint)
      || null;
    const coverage = coverageForFile(file, ROOTS);
    const entry = {
      ...file,
      contentFingerprint: fingerprint,
      coverage,
      existing: known
    };
    for (const root of coverage.sourceRoots) {
      report.rootCoverage[root] ||= createRootCoverage(root);
      report.rootCoverage[root].unique += 1;
      if (known) report.rootCoverage[root].alreadyKnown += 1;
      else report.rootCoverage[root].new += 1;
    }
    if (known) report.alreadyKnown += 1;
    else report.newImages += 1;

    const libraryRecord = known?.libraryRecord?.sourceKind === "folder-image"
      ? known.libraryRecord
      : libraryByFingerprint.get(fingerprint) || null;
    const asset = await createFolderImageAsset(entry, libraryRecord);
    const record = createImageLibraryRecord(entry, asset, libraryRecord);
    const knownRelationship = known?.relationship && known.relationship.ownerType !== "library" ? known.relationship : null;
    if (knownRelationship && !record.relationships?.length) {
      record.relationships = uniqueRelationships([knownRelationship]);
      record.reviewStatus = "known-owner";
    }
    upsertLibraryRecord(nextLibrary, record);
    libraryByFingerprint.set(fingerprint, record);
    folderImageRecords.push(record);
    if (needsVision(record.asset)) {
      visionJobs.push({ kind: "folder-image", recordId: record.id, path: entry.path });
    }
    report.indexed += 1;
    if (!known) report.symlinked += asset.metadata?.storage?.kind === "local-symlink" ? 1 : 0;
    if ((index + 1) % 100 === 0) console.error(`[folder-image-visual] indexed ${index + 1}/${scan.files.length}`);
  });

  collectOwnedImageVisionJobs({ avatars: nextAvatars, tarotStore: nextTarotStore, sceneGraph: nextSceneGraph }, visionJobs);
  collectMissingVideoFrameVisionJobs(nextLibrary, visionJobs);
  report.visionJobs = unique(visionJobs.map((job) => job.path)).length;
  const vision = await runVision(visionJobs.map((job) => job.path));

  enrichFolderImages(nextLibrary, folderImageRecords, vision, report);
  nextAvatars.splice(0, nextAvatars.length, ...enrichAvatarImages(nextAvatars, vision, report));
  nextTarotStore = enrichTarotImages(nextTarotStore, vision, report);
  nextSceneGraph = enrichSceneImages(nextSceneGraph, vision, report);
  enrichVideoFrameFingerprints(nextLibrary, vision, report);

  const ownedTargets = collectOwnedStaticTargets({
    avatars: nextAvatars,
    tarotStore: nextTarotStore,
    sceneGraph: nextSceneGraph
  });
  linkFolderImagesByVisualSimilarity(nextLibrary, ownedTargets, report);
  const staticTargets = [
    ...ownedTargets,
    ...collectLibraryStaticTargets(nextLibrary)
  ];
  const stores = {
    avatars: nextAvatars,
    tarotStore: nextTarotStore,
    sceneGraph: nextSceneGraph
  };
  matchVideosByFirstFrame(nextLibrary, staticTargets, stores, report);
  nextTarotStore = stores.tarotStore;
  nextSceneGraph = stores.sceneGraph;

  for (const avatar of nextAvatars) {
    avatar.characterSheet = createCharacterSheetScaffold(avatar, { tarotStore: nextTarotStore });
    avatar.characterSheet.mediaIntelligence.matching = {
      schemaVersion: "hapa.visual-first-frame-matching.v1",
      method: "local-vision-fingerprint",
      threshold: AUTO_THRESHOLD,
      matchedVideos: report.videoMatches.autoAttached + report.videoMatches.relationships,
      candidateVideos: report.videoMatches.candidates,
      lastRunAt: new Date().toISOString()
    };
    avatar.updatedAt = new Date().toISOString();
  }

  nextLibrary.records = nextLibrary.records.map((record) => ({
    ...record,
    relationships: uniqueRelationships(record.relationships || []),
    updatedAt: record.updatedAt || new Date().toISOString()
  }));
  nextLibrary.batches = [{
    id: `folder-image-visual-match-${Date.now()}`,
    roots: ROOTS,
    dryRun: DRY_RUN,
    noAttach: NO_ATTACH,
    reportPath: REPORT_PATH,
    thresholds: {
      visual: VISUAL_THRESHOLD,
      auto: AUTO_THRESHOLD,
      sceneAuto: SCENE_AUTO_THRESHOLD,
      margin: MIN_MARGIN
    },
    summary: {
      uniqueImages: report.uniqueImages,
      newImages: report.newImages,
      imageRelationships: report.imageMatches.relationships,
      videoRelationships: report.videoMatches.relationships,
      autoAttached: report.videoMatches.autoAttached,
      candidates: report.videoMatches.candidates
    },
    createdAt: new Date().toISOString()
  }, ...(nextLibrary.batches || [])].slice(0, 24);
  nextLibrary.updatedAt = new Date().toISOString();
  report.libraryRecords = nextLibrary.records.length;
  report.generatedAt = new Date().toISOString();

  if (!DRY_RUN) {
    await Promise.all([
      backupFile(AVATAR_STORE_PATH, "folder-image-visual-match"),
      backupFile(TAROT_STORE_PATH, "folder-image-visual-match"),
      backupFile(SCENE_STORE_PATH, "folder-image-visual-match"),
      backupFile(MEDIA_LIBRARY_PATH, "folder-image-visual-match").catch(() => {})
    ]);
    await writeFile(AVATAR_STORE_PATH, `${JSON.stringify({
      ...avatarStore,
      avatars: nextAvatars,
      teams: normalizeAvatarTeams(avatarStore.teams || [], nextAvatars),
      updatedAt: new Date().toISOString()
    }, null, 2)}\n`, "utf8");
    await writeFile(TAROT_STORE_PATH, `${JSON.stringify(nextTarotStore, null, 2)}\n`, "utf8");
    await writeFile(SCENE_STORE_PATH, `${JSON.stringify(nextSceneGraph, null, 2)}\n`, "utf8");
    await writeFile(MEDIA_LIBRARY_PATH, `${JSON.stringify(nextLibrary, null, 2)}\n`, "utf8");
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, reportPath: REPORT_PATH, ...report }, null, 2));
}

async function readAvatarStore() {
  const store = JSON.parse(await readFile(AVATAR_STORE_PATH, "utf8"));
  const avatars = (store.avatars || []).map((avatar) => normalizeAvatarCard(avatar));
  return { ...store, avatars, teams: normalizeAvatarTeams(store.teams || [], avatars) };
}

async function readTarotStore() {
  try {
    return normalizeTarotStore(JSON.parse(await readFile(TAROT_STORE_PATH, "utf8")));
  } catch {
    return normalizeTarotStore({});
  }
}

async function readSceneGraph() {
  try {
    return normalizeSceneGraph(JSON.parse(await readFile(SCENE_STORE_PATH, "utf8")));
  } catch {
    return normalizeSceneGraph({});
  }
}

async function readMediaLibrary() {
  try {
    return normalizeSystemMediaLibrary(JSON.parse(await readFile(MEDIA_LIBRARY_PATH, "utf8")));
  } catch {
    return createSystemMediaLibrary();
  }
}

async function ensureVisionTool() {
  let needsBuild = true;
  try {
    const [toolStat, sourceStat] = await Promise.all([stat(TOOL_PATH), stat(SWIFT_SOURCE)]);
    needsBuild = sourceStat.mtimeMs > toolStat.mtimeMs;
  } catch {
    needsBuild = true;
  }
  if (!needsBuild) return;
  await mkdir(path.dirname(TOOL_PATH), { recursive: true });
  await execFile("swiftc", [SWIFT_SOURCE, "-o", TOOL_PATH], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
}

async function scanImageRoots(roots) {
  const byPath = new Map();
  let sourceImages = 0;
  for (const root of roots) {
    const files = await walkImages(root);
    sourceImages += files.length;
    for (const filePath of files) {
      const resolved = await realpath(filePath).catch(() => path.resolve(filePath));
      const info = await stat(resolved);
      const name = path.basename(resolved);
      const entry = byPath.get(resolved) || {
        path: resolved,
        name,
        extension: path.extname(name).toLowerCase(),
        stat: info,
        roots: []
      };
      entry.roots.push(root);
      byPath.set(resolved, entry);
    }
  }
  return {
    sourceImages,
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  };
}

async function walkImages(root) {
  const files = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await import("node:fs/promises").then((fs) => fs.readdir(dir, { withFileTypes: true }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".DS_Store") continue;
      const itemPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(itemPath);
        continue;
      }
      if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(itemPath);
    }
  }
  await walk(root);
  return files;
}

function buildExistingIndex({ avatarStore, tarotStore, sceneGraph, mediaLibrary }) {
  const bySourcePath = new Map();
  const byFingerprint = new Map();
  const byNameSize = new Map();
  const addAsset = (asset, relationship, libraryRecord = null) => {
    if (!asset) return;
    const sourcePath = asset.metadata?.folderIngest?.sourcePath || asset.metadata?.sourcePath || asset.metadata?.storage?.path || asset.storage?.path || null;
    const fingerprint = asset.metadata?.folderIngest?.contentFingerprint || asset.metadata?.contentFingerprint || libraryRecord?.contentFingerprint || null;
    const key = nameSizeKey(asset.metadata?.originalFileName || asset.name, asset.metadata?.sizeBytes || asset.sizeBytes);
    const record = { asset, relationship, libraryRecord };
    if (sourcePath) bySourcePath.set(path.resolve(sourcePath), record);
    if (fingerprint) byFingerprint.set(fingerprint, record);
    if (key) byNameSize.set(key, record);
  };
  for (const record of normalizeSystemMediaLibrary(mediaLibrary).records) {
    addAsset(record.asset || record, { ownerType: "library", ownerId: record.id, ownerName: "System Media Library", role: "indexed" }, record);
  }
  for (const avatar of avatarStore.avatars || []) {
    for (const asset of avatar.assets || []) addAsset(asset, { ownerType: "avatar", ownerId: avatar.id, ownerName: avatar.primaryName, role: asset.requirementId || "avatar-media" });
  }
  for (const card of tarotStore.cards || []) {
    for (const asset of card.assets || []) addAsset(asset, { ownerType: "tarot", ownerId: card.id, ownerName: card.title, role: asset.metadata?.tarotMediaRole || "card-media" });
  }
  for (const scene of sceneGraph.scenes || []) {
    for (const asset of scene.assets || []) addAsset(asset, { ownerType: "scene", ownerId: scene.id, ownerName: scene.title, role: asset.requirementId || "scene-media" });
  }
  return { bySourcePath, byFingerprint, byNameSize };
}

async function createFolderImageAsset(entry, existingRecord = null) {
  const fingerprintShort = entry.contentFingerprint.slice(0, 16);
  const base = slugify(path.basename(entry.name, entry.extension)) || "folder-image";
  const mediaName = `${base}-${fingerprintShort}${entry.extension}`;
  const mediaPath = path.join(MEDIA_DIR, mediaName);
  const thumbName = `${base}-${fingerprintShort}-thumb.jpg`;
  const thumbPath = path.join(MEDIA_DIR, thumbName);
  if (!DRY_RUN) {
    await ensureSymlink(entry.path, mediaPath);
    await createThumbnail(entry.path, thumbPath);
  }
  return createMediaAsset({
    id: existingRecord?.asset?.id || `folder-image-${fingerprintShort}`,
    name: entry.name,
    uri: `/media/${mediaName}`,
    type: "image",
    requirementId: "folder_image",
    tags: unique(["folder-ingest", "image", "still", ...entry.coverage.sourceRoots.map((root) => `source-${slugify(root)}`)]),
    source: "folder-image-ingest",
    notes: `Indexed from ${entry.coverage.sourceRoots.join(", ")}.`,
    metadata: {
      ...(existingRecord?.asset?.metadata || {}),
      originalFileName: entry.name,
      mimeType: mimeTypeForExtension(entry.extension),
      sizeBytes: entry.stat.size,
      lastModified: entry.stat.mtimeMs,
      format: entry.extension.slice(1),
      thumbnail: {
        id: `folder-image-${fingerprintShort}-thumbnail`,
        uri: `/media/${thumbName}`,
        mimeType: "image/jpeg",
        storage: {
          kind: "local-file",
          fileName: thumbName,
          path: thumbPath,
          sourcePath: entry.path
        }
      },
      thumbnailUri: `/media/${thumbName}`,
      storage: {
        kind: "local-symlink",
        fileName: mediaName,
        path: mediaPath,
        targetPath: entry.path
      },
      folderIngest: folderIngestMetadata({ ...entry, sourceRoots: entry.coverage.sourceRoots, sourceRelativePaths: entry.coverage.sourceRelativePaths })
    },
    processing: {
      status: "indexed",
      indexedAt: new Date().toISOString()
    }
  });
}

async function ensureSymlink(targetPath, linkPath) {
  try {
    const info = await lstat(linkPath);
    if (info.isSymbolicLink() || info.isFile()) return;
  } catch {
    // Create below.
  }
  try {
    await symlink(targetPath, linkPath);
  } catch (error) {
    if (error?.code === "EEXIST") return;
    await copyFile(targetPath, linkPath);
  }
}

async function createThumbnail(sourcePath, outputPath) {
  try {
    await access(outputPath, fsConstants.R_OK);
    return;
  } catch {
    // Create below.
  }
  try {
    await execFile("sips", ["-s", "format", "jpeg", "-Z", "512", sourcePath, "--out", outputPath], { maxBuffer: 2 * 1024 * 1024 });
  } catch {
    await copyFile(sourcePath, outputPath).catch(() => {});
  }
}

function createImageLibraryRecord(entry, asset, existingRecord = null) {
  const intelligence = asset.metadata?.intelligence || existingRecord?.intelligence || null;
  return {
    ...(existingRecord || {}),
    id: existingRecord?.id || `folder-image-${entry.contentFingerprint.slice(0, 16)}`,
    sourceKind: "folder-image",
    name: entry.name,
    mediaType: "image",
    uri: asset.uri,
    thumbnailUri: asset.metadata?.thumbnailUri || asset.uri,
    sourcePath: entry.path,
    sourceRoots: entry.coverage.sourceRoots,
    sourceRelativePaths: entry.coverage.sourceRelativePaths,
    contentFingerprint: entry.contentFingerprint,
    sizeBytes: entry.stat.size,
    width: asset.metadata?.width || existingRecord?.width || null,
    height: asset.metadata?.height || existingRecord?.height || null,
    duration: null,
    documentKind: intelligence?.classifications?.documentKind || existingRecord?.documentKind || guessDocumentKindFromPath(entry.path, "image"),
    reviewPriority: intelligence?.classifications?.reviewPriority || existingRecord?.reviewPriority || "normal",
    reviewStatus: existingRecord?.reviewStatus || "indexed",
    tags: unique([...(existingRecord?.tags || []), ...(asset.tags || []), guessDocumentKindFromPath(entry.path, "image")]),
    relationships: uniqueRelationships(existingRecord?.relationships || []),
    asset,
    intelligence,
    notes: existingRecord?.notes || `Indexed from ${entry.coverage.sourceRoots.join(", ")}.`,
    createdAt: existingRecord?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function collectOwnedImageVisionJobs({ avatars, tarotStore, sceneGraph }, jobs) {
  const add = (job) => {
    if (!job.path) return;
    jobs.push(job);
  };
  for (const avatar of avatars || []) {
    for (const asset of avatar.assets || []) {
      if (asset.type !== "image" || !needsVision(asset)) continue;
      add({ kind: "avatar-image", ownerId: avatar.id, assetId: asset.id, path: mediaPathForAsset(asset) });
    }
  }
  for (const card of tarotStore.cards || []) {
    for (const asset of card.assets || []) {
      if (asset.type !== "image" || !needsVision(asset)) continue;
      add({ kind: "tarot-image", ownerId: card.id, assetId: asset.id, path: mediaPathForAsset(asset) });
    }
  }
  for (const scene of sceneGraph.scenes || []) {
    for (const asset of scene.assets || []) {
      if (asset.type !== "image" || !needsVision(asset)) continue;
      add({ kind: "scene-image", ownerId: scene.id, assetId: asset.id, path: mediaPathForAsset(asset) });
    }
  }
}

function collectMissingVideoFrameVisionJobs(library, jobs) {
  for (const record of library.records || []) {
    if (record.sourceKind !== "folder-video" || record.mediaType !== "video") continue;
    const first = firstVideoFrame(record);
    if (!first || first.fingerprint) continue;
    const filePath = mediaPathForUri(first.uri);
    if (filePath) jobs.push({ kind: "video-first-frame", recordId: record.id, frameId: first.id, path: filePath });
  }
}

async function runVision(paths) {
  const results = new Map();
  const cache = await readVisionCache();
  const pending = [];
  for (const filePath of unique(paths)) {
    try {
      await access(filePath, fsConstants.R_OK);
      const key = await visionCacheKey(filePath);
      if (cache.entries[key]) {
        results.set(filePath, cache.entries[key]);
      } else {
        pending.push({ path: filePath, key });
      }
    } catch {
      results.set(filePath, { path: filePath, ok: false, textLines: [], labels: [], error: "missing" });
    }
  }
  console.error(`[folder-image-visual] Vision cache hits ${results.size}/${unique(paths).length}; processing ${pending.length}`);
  const chunks = chunkArray(pending, 64);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    console.error(`[folder-image-visual] Vision chunk ${index + 1}/${chunks.length} (${chunk.length} images)`);
    const keyByPath = new Map(chunk.map((item) => [item.path, item.key]));
    const { stdout } = await execFile(TOOL_PATH, chunk.map((item) => item.path), { cwd: ROOT, maxBuffer: 160 * 1024 * 1024 });
    for (const line of stdout.split("\n").filter(Boolean)) {
      const result = JSON.parse(line);
      const key = keyByPath.get(result.path);
      if (key) cache.entries[key] = { ...result, cachedAt: new Date().toISOString() };
      results.set(result.path, result);
    }
    await writeVisionCache(cache);
  }
  return results;
}

async function readVisionCache() {
  try {
    const parsed = JSON.parse(await readFile(VISION_CACHE_PATH, "utf8"));
    return {
      schemaVersion: parsed.schemaVersion || "hapa.local-vision-cache.v1",
      entries: parsed.entries || {}
    };
  } catch {
    return { schemaVersion: "hapa.local-vision-cache.v1", entries: {} };
  }
}

async function writeVisionCache(cache) {
  await mkdir(path.dirname(VISION_CACHE_PATH), { recursive: true });
  await writeFile(VISION_CACHE_PATH, `${JSON.stringify({
    schemaVersion: cache.schemaVersion || "hapa.local-vision-cache.v1",
    entries: cache.entries || {},
    updatedAt: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

async function visionCacheKey(filePath) {
  const info = await stat(filePath);
  return `${path.resolve(filePath)}::${info.size}::${Math.round(info.mtimeMs)}`;
}

function enrichFolderImages(library, records, vision, report) {
  for (const record of records) {
    const result = vision.get(record.sourcePath) || null;
    if (!result) continue;
    const intelligence = createMediaIntelligenceRecord(record.asset, result, {
      source: "folder-image-visual-match-pass"
    });
    record.asset = withImageAssetIntelligence(record.asset, intelligence, result);
    record.intelligence = intelligence;
    record.width = result.width || record.width;
    record.height = result.height || record.height;
    record.documentKind = intelligence.classifications?.documentKind || record.documentKind;
    record.reviewPriority = intelligence.classifications?.reviewPriority || record.reviewPriority;
    record.tags = unique([
      ...(record.tags || []),
      "vision-ocr",
      result.fingerprint ? "visual-fingerprint" : null,
      intelligence.ocr?.lineCount ? "ocr-text" : null,
      record.documentKind,
      ...(intelligence.classifications?.activity || []),
      ...(intelligence.classifications?.palette || []).map((color) => `palette-${color}`)
    ]);
    if (intelligence.ocr?.lineCount) report.ocrLines += intelligence.ocr.lineCount;
    report.enrichedImages += 1;
    upsertLibraryRecord(library, record);
  }
}

function enrichAvatarImages(avatars, vision, report) {
  return avatars.map((avatar) => {
    const next = normalizeAvatarCard(avatar);
    next.assets = next.assets.map((asset) => {
      if (asset.type !== "image") return asset;
      const result = vision.get(mediaPathForAsset(asset)) || null;
      if (!result) return asset;
      report.ownedImagesEnriched += 1;
      return enrichOwnedImageAsset(asset, result, "avatar-owned-image-pass", report);
    });
    return next;
  });
}

function enrichTarotImages(store, vision, report) {
  const next = normalizeTarotStore(store);
  for (const card of next.cards || []) {
    card.assets = (card.assets || []).map((asset) => {
      if (asset.type !== "image") return asset;
      const result = vision.get(mediaPathForAsset(asset)) || null;
      if (!result) return asset;
      report.ownedImagesEnriched += 1;
      return enrichOwnedImageAsset(asset, result, "tarot-owned-image-pass", report);
    });
    const primary = card.assets.find((asset) => asset.id === card.primaryAssetId) || card.assets.find((asset) => asset.type === "image");
    if (primary) card.asset = primary;
  }
  return next;
}

function enrichSceneImages(graph, vision, report) {
  const next = normalizeSceneGraph(graph);
  for (const scene of next.scenes || []) {
    scene.assets = (scene.assets || []).map((asset) => {
      if (asset.type !== "image") return asset;
      const result = vision.get(mediaPathForAsset(asset)) || null;
      if (!result) return asset;
      report.ownedImagesEnriched += 1;
      return enrichOwnedImageAsset(asset, result, "scene-owned-image-pass", report);
    });
  }
  return next;
}

function enrichOwnedImageAsset(asset, result, source, report) {
  const intelligence = createMediaIntelligenceRecord(asset, result, { source });
  if (intelligence.ocr?.lineCount) report.ocrLines += intelligence.ocr.lineCount;
  return withImageAssetIntelligence(asset, intelligence, result);
}

function withImageAssetIntelligence(asset, intelligence, result) {
  return {
    ...asset,
    tags: unique([
      ...(asset.tags || []),
      "vision-ocr",
      result?.fingerprint ? "visual-fingerprint" : null,
      intelligence.ocr?.lineCount ? "ocr-text" : null,
      intelligence.classifications?.documentKind,
      ...(intelligence.classifications?.palette || []).map((color) => `palette-${color}`),
      ...(intelligence.classifications?.activity || []),
      ...((intelligence.gaps || []).length ? ["needs-review"] : [])
    ]),
    metadata: {
      ...(asset.metadata || {}),
      width: result?.width || asset.metadata?.width || null,
      height: result?.height || asset.metadata?.height || null,
      ...(result?.fingerprint ? { fingerprint: result.fingerprint } : {}),
      thumbnail: {
        ...(asset.metadata?.thumbnail || {}),
        ...(result?.fingerprint ? { fingerprint: result.fingerprint } : {})
      },
      intelligence
    }
  };
}

function enrichVideoFrameFingerprints(library, vision, report) {
  for (const record of library.records || []) {
    if (record.sourceKind !== "folder-video" || record.mediaType !== "video") continue;
    const frames = record.asset?.metadata?.frames || [];
    let changed = false;
    const nextFrames = frames.map((frame) => {
      if (frame.fingerprint) return frame;
      const result = vision.get(mediaPathForUri(frame.uri)) || null;
      if (!result?.fingerprint) return frame;
      changed = true;
      return { ...frame, fingerprint: result.fingerprint };
    });
    if (!changed) continue;
    record.asset = withVideoFrames({
      ...record.asset,
      metadata: {
        ...(record.asset.metadata || {}),
        frames: nextFrames
      }
    }, nextFrames);
    report.videoFramesFingerprintBackfilled += 1;
    upsertLibraryRecord(library, record);
  }
}

function collectOwnedStaticTargets({ avatars, tarotStore, sceneGraph }) {
  const targets = [];
  for (const avatar of avatars || []) {
    for (const asset of avatar.assets || []) {
      if (asset.type !== "image") continue;
      const target = staticTargetFromAsset(asset, {
        ownerType: "avatar",
        ownerId: avatar.id,
        ownerName: avatar.primaryName || avatar.id,
        role: asset.requirementId || "avatar-image",
        targetAssetId: asset.id
      });
      if (target) targets.push(target);
    }
  }
  for (const card of tarotStore.cards || []) {
    for (const asset of card.assets || []) {
      if (asset.type !== "image") continue;
      const target = staticTargetFromAsset(asset, {
        ownerType: "tarot",
        ownerId: card.id,
        ownerName: card.title || card.id,
        role: asset.metadata?.tarotMediaRole || "card-image",
        targetAssetId: asset.id
      });
      if (target) targets.push(target);
    }
  }
  for (const scene of sceneGraph.scenes || []) {
    for (const asset of scene.assets || []) {
      if (asset.type !== "image") continue;
      const target = staticTargetFromAsset(asset, {
        ownerType: "scene",
        ownerId: scene.id,
        ownerName: scene.title || scene.id,
        role: asset.requirementId || "scene_images",
        targetAssetId: asset.id
      });
      if (target) targets.push(target);
    }
  }
  return targets;
}

function collectLibraryStaticTargets(library) {
  const targets = [];
  for (const record of library.records || []) {
    if (record.mediaType !== "image") continue;
    const relationship = (record.relationships || []).find((rel) => rel.ownerType && rel.ownerType !== "library") || null;
    const target = staticTargetFromRecord(record, relationship);
    if (target) targets.push(target);
  }
  return targets;
}

function staticTargetFromAsset(asset, owner) {
  const fingerprint = asset.metadata?.fingerprint || asset.metadata?.thumbnail?.fingerprint || null;
  if (!fingerprint) return null;
  return {
    ...owner,
    source: "owned-asset",
    recordId: null,
    targetName: asset.name || asset.id,
    targetUri: asset.metadata?.thumbnailUri || asset.metadata?.thumbnail?.uri || asset.uri,
    sourcePath: mediaPathForAsset(asset),
    width: asset.metadata?.width || asset.metadata?.thumbnail?.width || null,
    height: asset.metadata?.height || asset.metadata?.thumbnail?.height || null,
    tags: asset.tags || [],
    fingerprint
  };
}

function staticTargetFromRecord(record, relationship = null) {
  const fingerprint = record.asset?.metadata?.fingerprint || record.asset?.metadata?.thumbnail?.fingerprint || null;
  if (!fingerprint) return null;
  return {
    ownerType: relationship?.ownerType || "library",
    ownerId: relationship?.ownerId || record.id,
    ownerName: relationship?.ownerName || record.name,
    role: relationship?.role || "static-image",
    targetAssetId: record.asset?.id || record.id,
    source: "library-image",
    recordId: record.id,
    targetName: record.name,
    targetUri: record.thumbnailUri || record.uri,
    sourcePath: record.sourcePath,
    width: record.width || record.asset?.metadata?.width || null,
    height: record.height || record.asset?.metadata?.height || null,
    tags: record.tags || [],
    fingerprint
  };
}

function linkFolderImagesByVisualSimilarity(library, ownedTargets, report) {
  for (const record of library.records || []) {
    if (record.sourceKind !== "folder-image" || record.mediaType !== "image") continue;
    if ((record.relationships || []).some((rel) => rel.ownerType && rel.ownerType !== "library")) continue;
    const source = staticTargetFromRecord(record, null);
    if (!source) continue;
    const candidates = bestVisualCandidates(source, ownedTargets, { excludeSourcePath: record.sourcePath, limit: 4 });
    const best = candidates[0] || null;
    if (!best) continue;
    const match = visualMatchPayload("visual-static-image-owner-match", best, candidates, source);
    record.match = match;
    if (isAutoMatch(best, candidates[1])) {
      const relationship = relationshipForTarget(best, best.role || "reference-image");
      record.relationships = uniqueRelationships([...(record.relationships || []), relationship]);
      record.reviewStatus = "visual-matched";
      record.tags = unique([...(record.tags || []), "visual-match", `matched-${best.ownerType}`]);
      report.imageMatches.relationships += 1;
    } else if (best.score >= VISUAL_THRESHOLD) {
      record.reviewStatus = record.reviewStatus === "indexed" ? "visual-candidate" : record.reviewStatus;
      record.tags = unique([...(record.tags || []), "visual-candidate"]);
      report.imageMatches.candidates += 1;
    }
    report.imageMatches.scored += 1;
    report.samples.imageMatches.push(sampleMatch(record, match));
    report.samples.imageMatches = report.samples.imageMatches.slice(0, 20);
    upsertLibraryRecord(library, record);
  }
}

function matchVideosByFirstFrame(library, staticTargets, stores, report) {
  for (const record of library.records || []) {
    if (record.sourceKind !== "folder-video" || record.mediaType !== "video") continue;
    if (!isUnassignedVideo(record)) continue;
    const first = firstVideoFrame(record);
    if (!first?.fingerprint) continue;
    const source = {
      ownerType: "video",
      ownerId: record.id,
      ownerName: record.name,
      role: "first-frame",
      targetAssetId: first.id,
      source: "video-first-frame",
      recordId: record.id,
      targetName: `${record.name} first frame`,
      targetUri: first.uri,
      sourcePath: mediaPathForUri(first.uri),
      width: first.width || record.width || null,
      height: first.height || record.height || null,
      tags: record.tags || [],
      fingerprint: first.fingerprint
    };
    const candidates = bestVisualCandidates(source, staticTargets, { limit: 6 });
    const best = candidates[0] || null;
    if (!best) continue;
    const match = visualMatchPayload("visual-video-first-frame-static-image-match", best, candidates, source);
    record.match = match;
    report.videoMatches.scored += 1;
    if (isAutoMatch(best, candidates[1]) && best.ownerType !== "library") {
      const relationship = relationshipForTarget(best, roleForVideoTarget(best));
      record.relationships = uniqueRelationships([...(record.relationships || []), relationship]);
      record.reviewStatus = "visual-matched";
      record.tags = unique([...(record.tags || []), "visual-match", "first-frame-match", `matched-${best.ownerType}`]);
      record.asset = withVisualMatchMetadata(record.asset, match);
      report.videoMatches.relationships += 1;
      if (!NO_ATTACH) {
        const attached = attachVideoMatch(record, best, stores, match);
        if (attached) report.videoMatches.autoAttached += 1;
      }
    } else if (best.score >= VISUAL_THRESHOLD) {
      record.reviewStatus = record.reviewStatus === "unassigned" || !record.reviewStatus ? "visual-candidate" : record.reviewStatus;
      record.tags = unique([...(record.tags || []), "visual-candidate", "first-frame-candidate"]);
      report.videoMatches.candidates += 1;
    }
    report.samples.videoMatches.push(sampleMatch(record, match));
    report.samples.videoMatches = report.samples.videoMatches.slice(0, 30);
    upsertLibraryRecord(library, record);
  }
}

function attachVideoMatch(record, target, stores, match) {
  if (target.ownerType === "avatar") {
    const avatarIndex = stores.avatars.findIndex((avatar) => avatar.id === target.ownerId);
    if (avatarIndex < 0 || stores.avatars[avatarIndex].assets.some((asset) => asset.id === record.asset?.id)) return false;
    const requirementId = avatarVideoRequirementForTarget(target, record);
    let avatar = assignAssetToSlot(stores.avatars[avatarIndex], {
      ...withVisualMatchMetadata(record.asset, match),
      requirementId,
      tags: unique([...(record.asset?.tags || []), "folder-ingest", "auto-attached", "visual-match", "first-frame-match"]),
      notes: `Auto-attached by visual first-frame match to ${target.targetName} with ${Math.round(match.score * 100)}% confidence.`
    });
    if (target.targetAssetId && avatar.assets.some((asset) => asset.id === target.targetAssetId)) {
      avatar = pairVideoFirstFrameWithStaticImage(avatar, {
        id: `candidate-${record.asset.id}-first-to-${target.targetAssetId}-static`,
        status: "queued",
        score: match.score,
        fromVideoId: record.asset.id,
        fromVideoName: record.asset.name,
        fromFrame: "first",
        fromFrameAssetId: firstVideoFrame(record)?.id || null,
        fromFrameUri: firstVideoFrame(record)?.uri || null,
        targetAssetId: target.targetAssetId,
        targetAssetName: target.targetName,
        targetRequirementId: target.role,
        targetUri: target.targetUri,
        suggestedPairType: "video-first-to-static-image",
        confidence: match.confidence,
        reason: match.reason
      }, {
        status: "auto-paired",
        reason: match.reason,
        note: "High-confidence system-wide visual first-frame match."
      });
    }
    stores.avatars[avatarIndex] = avatar;
    return true;
  }
  if (target.ownerType === "tarot") {
    const card = stores.tarotStore.cards.find((item) => item.id === target.ownerId);
    if (!card || card.assets.some((asset) => asset.id === record.asset?.id)) return false;
    stores.tarotStore = attachTarotCardMedia(stores.tarotStore, target.ownerId, {
      ...withVisualMatchMetadata(record.asset, match),
      tags: unique([...(record.asset?.tags || []), "folder-ingest", "auto-attached", "visual-match", "tarot-loop"]),
      metadata: {
        ...(record.asset?.metadata || {}),
        tarotMediaRole: "loop_video",
        visualMatch: match
      }
    }, "loop_video");
    return true;
  }
  if (target.ownerType === "scene") {
    const scene = stores.sceneGraph.scenes.find((item) => item.id === target.ownerId);
    if (!scene || scene.assets.some((asset) => asset.id === record.asset?.id)) return false;
    stores.sceneGraph = attachSceneMedia(stores.sceneGraph, target.ownerId, {
      ...withVisualMatchMetadata(record.asset, match),
      requirementId: "scene_videos",
      tags: unique([...(record.asset?.tags || []), "folder-ingest", "auto-attached", "visual-match", "scene-video"]),
      metadata: {
        ...(record.asset?.metadata || {}),
        visualMatch: match
      }
    });
    return true;
  }
  return false;
}

function withVisualMatchMetadata(asset = {}, match = {}) {
  return {
    ...asset,
    tags: unique([...(asset.tags || []), "visual-match", "first-frame-match"]),
    metadata: {
      ...(asset.metadata || {}),
      visualMatch: match,
      autoAttach: {
        kind: match.kind,
        id: match.id,
        score: match.score,
        reason: match.reason,
        method: match.method
      }
    }
  };
}

function bestVisualCandidates(source, targets, options = {}) {
  const scored = [];
  for (const target of targets) {
    if (!target?.fingerprint) continue;
    if (options.excludeSourcePath && target.sourcePath && path.resolve(target.sourcePath) === path.resolve(options.excludeSourcePath)) continue;
    const visual = fingerprintSimilarity(source.fingerprint, target.fingerprint);
    if (!Number.isFinite(visual)) continue;
    const aspect = aspectSimilarity(source, target);
    const dimension = dimensionSimilarity(source, target);
    const score = Math.max(0, Math.min(0.99, Number((0.86 * visual + 0.1 * aspect + 0.04 * dimension).toFixed(3))));
    if (score < VISUAL_THRESHOLD) continue;
    scored.push({
      ...target,
      score,
      visual,
      aspect,
      dimension,
      confidence: score >= autoThresholdForTarget(target) ? "high" : score >= VISUAL_THRESHOLD ? "medium" : "low",
      reason: `visual ${Math.round(visual * 100)}% / aspect ${Math.round(aspect * 100)}% / dimensions ${Math.round(dimension * 100)}%`
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, options.limit || 5);
}

function visualMatchPayload(method, best, candidates, source) {
  const second = candidates[1] || null;
  return {
    schemaVersion: "hapa.visual-match.v1",
    method,
    kind: best.ownerType,
    id: best.ownerId,
    name: best.ownerName,
    score: best.score,
    confidence: best.confidence,
    margin: Number((best.score - (second?.score || 0)).toFixed(3)),
    reason: best.reason,
    relationship: relationshipForTarget(best, best.ownerType === "tarot" ? "loop_video" : best.role),
    source: {
      recordId: source.recordId,
      name: source.targetName,
      uri: source.targetUri
    },
    target: {
      source: best.source,
      recordId: best.recordId,
      assetId: best.targetAssetId,
      name: best.targetName,
      uri: best.targetUri,
      ownerType: best.ownerType,
      ownerId: best.ownerId,
      ownerName: best.ownerName,
      role: best.role
    },
    candidates: candidates.map((candidate) => ({
      ownerType: candidate.ownerType,
      ownerId: candidate.ownerId,
      ownerName: candidate.ownerName,
      role: candidate.role,
      recordId: candidate.recordId,
      assetId: candidate.targetAssetId,
      name: candidate.targetName,
      score: candidate.score,
      confidence: candidate.confidence,
      reason: candidate.reason
    })),
    createdAt: new Date().toISOString()
  };
}

function isAutoMatch(best, second = null) {
  if (!best || best.score < autoThresholdForTarget(best)) return false;
  if (!second) return true;
  return best.score - second.score >= MIN_MARGIN || best.score >= 0.965;
}

function autoThresholdForTarget(target = {}) {
  if (target.ownerType === "scene") return SCENE_AUTO_THRESHOLD;
  if (target.ownerType === "tarot") return Math.max(0.945, AUTO_THRESHOLD);
  if (target.ownerType === "library") return 1;
  return AUTO_THRESHOLD;
}

function relationshipForTarget(target, role) {
  return {
    ownerType: target.ownerType,
    ownerId: target.ownerId,
    ownerName: target.ownerName,
    role: role || target.role || "visual-match"
  };
}

function roleForVideoTarget(target) {
  if (target.ownerType === "tarot") return "loop_video";
  if (target.ownerType === "scene") return "scene_videos";
  return "avatar-video";
}

function avatarVideoRequirementForTarget(target, record) {
  if (["character_dossier", "kit_sheet", "kit_poses", "kit_items", "closeup_emotions", "closeup_backgrounds", "fullbody_backgroundless", "backgroundless_two_thirds", "fullbody_concept_art"].includes(target.role)) {
    return target.role;
  }
  return guessAvatarRequirement(record);
}

function guessAvatarRequirement(record) {
  const text = normalizeText(`${record.name} ${record.documentKind} ${(record.tags || []).join(" ")} ${record.intelligence?.vision?.description || ""}`);
  if (/close|portrait|face|emotion/.test(text)) return "closeup_emotions";
  if (/kit|weapon|tool|gear|pose/.test(text) || record.documentKind === "kit_sheet") return "kit_poses";
  if (/background|city|scene|comic|cinematic/.test(text) || record.documentKind === "comic") return "fullbody_concept_art";
  return "fullbody_concept_art";
}

function isUnassignedVideo(record) {
  const relationships = record.relationships || [];
  return !relationships.length || relationships.every((rel) => !rel.ownerType || rel.ownerType === "library");
}

function firstVideoFrame(record) {
  const frames = record.asset?.metadata?.frames || record.asset?.state?.keyframes || [];
  return frames.find((frame) => frame.marker === "first") || frames[0] || null;
}

function needsVision(asset = {}) {
  return !asset.metadata?.intelligence || !asset.metadata?.fingerprint;
}

function sampleMatch(record, match) {
  return {
    recordId: record.id,
    name: record.name,
    kind: match.kind,
    id: match.id,
    nameMatched: match.name,
    score: match.score,
    confidence: match.confidence,
    margin: match.margin,
    reason: match.reason,
    target: match.target?.name
  };
}

function upsertLibraryRecord(library, record) {
  const index = library.records.findIndex((item) => item.id === record.id || (record.contentFingerprint && item.contentFingerprint === record.contentFingerprint));
  if (index >= 0) library.records[index] = record;
  else library.records.push(record);
}

function folderIngestMetadata(record) {
  return {
    schemaVersion: "hapa.folder-image-ingest.v1",
    sourcePath: record.sourcePath || record.path,
    sourceRoots: record.sourceRoots || record.coverage?.sourceRoots || [],
    sourceRelativePaths: record.sourceRelativePaths || record.coverage?.sourceRelativePaths || {},
    contentFingerprint: record.contentFingerprint,
    indexedAt: new Date().toISOString()
  };
}

function coverageForFile(file, roots) {
  const sourceRoots = [];
  const sourceRelativePaths = {};
  for (const root of roots) {
    const relative = path.relative(root, file.path);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      const label = rootLabel(root);
      sourceRoots.push(label);
      sourceRelativePaths[label] = relative;
    }
  }
  return { sourceRoots: unique(sourceRoots), sourceRelativePaths };
}

function rootLabel(root) {
  if (root.endsWith("card-deck")) return "card-deck";
  if (root.endsWith("Dear Papa - Album")) return "Dear Papa - Album";
  if (root.endsWith("comics")) return "comics";
  return path.basename(root);
}

async function partialFileFingerprint(filePath, info, kind = "file") {
  const hash = createHash("sha256");
  hash.update(`hapa-partial-${kind}-v1:${info.size}:`);
  const chunkSize = Math.min(1024 * 1024, Math.max(1, info.size));
  const offsets = [...new Set([
    0,
    Math.max(0, Math.floor(info.size / 2) - Math.floor(chunkSize / 2)),
    Math.max(0, info.size - chunkSize)
  ])];
  const handle = await open(filePath, "r");
  try {
    for (const offset of offsets) {
      const buffer = Buffer.alloc(Math.min(chunkSize, info.size - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function mediaPathForAsset(asset) {
  if (!asset?.uri) return null;
  return mediaPathForUri(asset.uri);
}

function mediaPathForUri(uri) {
  if (!uri) return null;
  if (uri.startsWith("/media/")) return path.join(MEDIA_DIR, uri.slice("/media/".length));
  if (uri.startsWith("file://")) return new URL(uri).pathname;
  if (path.isAbsolute(uri)) return uri;
  return null;
}

async function backupFile(filePath, label) {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(ROOT, "data/backups", `${path.basename(filePath)}.${label}-${timestamp}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(filePath, backupPath);
}

function createReport() {
  return {
    schemaVersion: "hapa.folder-image-visual-match-report.v1",
    dryRun: DRY_RUN,
    noAttach: NO_ATTACH,
    roots: ROOTS,
    thresholds: {
      visual: VISUAL_THRESHOLD,
      auto: AUTO_THRESHOLD,
      sceneAuto: SCENE_AUTO_THRESHOLD,
      margin: MIN_MARGIN
    },
    sourceImages: 0,
    uniqueImages: 0,
    alreadyKnown: 0,
    newImages: 0,
    indexed: 0,
    symlinked: 0,
    visionJobs: 0,
    enrichedImages: 0,
    ownedImagesEnriched: 0,
    ocrLines: 0,
    videoFramesFingerprintBackfilled: 0,
    imageMatches: {
      scored: 0,
      candidates: 0,
      relationships: 0
    },
    videoMatches: {
      scored: 0,
      candidates: 0,
      relationships: 0,
      autoAttached: 0
    },
    samples: {
      imageMatches: [],
      videoMatches: []
    },
    rootCoverage: Object.fromEntries(ROOTS.map((root) => [rootLabel(root), createRootCoverage(rootLabel(root))])),
    libraryRecords: 0,
    generatedAt: null
  };
}

function createRootCoverage(root) {
  return {
    root,
    unique: 0,
    alreadyKnown: 0,
    new: 0
  };
}

function nameSizeKey(name, size) {
  if (!name || !size) return null;
  return `${String(name).toLowerCase()}::${Number(size)}`;
}

function mimeTypeForExtension(extension) {
  const ext = extension.toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/png";
}

function guessDocumentKindFromPath(filePath, mediaType = "image") {
  const text = normalizeText(filePath);
  if (text.includes("card-deck") || text.includes("tarot") || text.includes("card")) return mediaType === "video" ? "tarot_loop" : "tarot_card";
  if (text.includes("comic") || text.includes("page") || text.includes("panel")) return "comic";
  if (text.includes("dossier")) return "character_dossier";
  if (text.includes("kit")) return "kit_sheet";
  if (text.includes("scene")) return mediaType === "video" ? "scene_video" : "scene_image";
  return mediaType === "video" ? "video_loop" : "image_reference";
}

function fingerprintSimilarity(left, right) {
  const leftValues = Array.isArray(left?.luma) ? left.luma : null;
  const rightValues = Array.isArray(right?.luma) ? right.luma : null;
  if (!leftValues || !rightValues || leftValues.length !== rightValues.length || !leftValues.length) return NaN;
  const totalDistance = leftValues.reduce((total, value, index) => total + Math.abs(Number(value) - Number(rightValues[index])), 0);
  return Math.max(0, Math.min(1, 1 - totalDistance / (leftValues.length * 255)));
}

function aspectSimilarity(left, right) {
  const leftAspect = Number(left.width) > 0 && Number(left.height) > 0 ? Number(left.width) / Number(left.height) : null;
  const rightAspect = Number(right.width) > 0 && Number(right.height) > 0 ? Number(right.width) / Number(right.height) : null;
  if (!leftAspect || !rightAspect) return 0.72;
  return Math.max(0, Math.min(1, 1 - Math.abs(leftAspect - rightAspect) / Math.max(leftAspect, rightAspect)));
}

function dimensionSimilarity(left, right) {
  if (!Number(left.width) || !Number(left.height) || !Number(right.width) || !Number(right.height)) return 0.64;
  const width = 1 - Math.abs(Number(left.width) - Number(right.width)) / Math.max(Number(left.width), Number(right.width));
  const height = 1 - Math.abs(Number(left.height) - Number(right.height)) / Math.max(Number(left.height), Number(right.height));
  return Math.max(0, Math.min(1, (width + height) / 2));
}

function uniqueRelationships(relationships = []) {
  const byKey = new Map();
  for (const rel of relationships) {
    if (!rel?.ownerType && !rel?.ownerId) continue;
    byKey.set(`${rel.ownerType}:${rel.ownerId}:${rel.role || ""}`, {
      ownerType: rel.ownerType || "unknown",
      ownerId: rel.ownerId || null,
      ownerName: rel.ownerName || rel.ownerId || "Unknown",
      role: rel.role || "media"
    });
  }
  return [...byKey.values()];
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(workers);
}
