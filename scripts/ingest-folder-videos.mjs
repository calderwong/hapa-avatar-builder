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
const REPORT_PATH = path.join(ROOT, "artifacts/enrichment/folder-video-ingest-report.json");
const DEFAULT_ROOTS = [
  "/Users/calderwong/comics",
  "/Users/calderwong/comics/Dear Papa - Album",
  "/Users/calderwong/comics/Dear Papa - Album/card-deck"
];
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const DRY_RUN = process.argv.includes("--dry-run");
const NO_ATTACH = process.argv.includes("--no-attach");
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

  const scan = await scanVideoRoots(ROOTS);
  const existing = buildExistingIndex({ avatarStore, tarotStore, sceneGraph, mediaLibrary });
  const report = createReport(scan);
  const nextLibrary = normalizeSystemMediaLibrary(mediaLibrary);
  const nextAvatars = avatarStore.avatars.map((avatar) => normalizeAvatarCard(avatar));
  let nextTarotStore = normalizeTarotStore(tarotStore);
  let nextSceneGraph = normalizeSceneGraph(sceneGraph);
  const avatarMatcher = buildAvatarMatchers(nextAvatars);
  const tarotMatcher = buildTarotMatchers(nextTarotStore.cards || []);
  const sceneMatcher = buildSceneMatchers(nextSceneGraph);
  const libraryByFingerprint = new Map(nextLibrary.records.map((record) => [record.contentFingerprint, record]).filter(([key]) => key));

  const recordsToVision = [];
  const recordsToAttach = [];
  const allEntries = [];
  const concurrency = Number(process.env.HAPA_VIDEO_INGEST_CONCURRENCY || 4);

  await mapLimit(scan.files, concurrency, async (file, index) => {
    const fingerprint = await partialFileFingerprint(file.path, file.stat);
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
    allEntries.push(entry);
    for (const root of coverage.sourceRoots) {
      report.rootCoverage[root] ||= createRootCoverage(root);
      report.rootCoverage[root].unique += 1;
      if (known) report.rootCoverage[root].alreadyKnown += 1;
      else report.rootCoverage[root].new += 1;
    }
    if (known) {
      report.alreadyKnown += 1;
    } else {
      report.newVideos += 1;
    }

    const libraryRecord = known?.libraryRecord || libraryByFingerprint.get(fingerprint) || null;
    const needsFrames = !libraryRecord?.asset?.metadata?.frames?.length && !libraryRecord?.frames?.length;
    const needsIntelligence = !libraryRecord?.intelligence && !libraryRecord?.asset?.metadata?.intelligence;
    if (!known || needsFrames || needsIntelligence) {
      let asset;
      try {
        asset = await createFolderVideoAsset(entry, libraryRecord);
      } catch (error) {
        report.errors.push({
          path: entry.path,
          message: error instanceof Error ? error.message : String(error)
        });
        asset = await createMinimalFolderVideoAsset(entry, libraryRecord);
      }
      const record = createLibraryRecord(entry, asset, libraryRecord);
      upsertLibraryRecord(nextLibrary, record);
      libraryByFingerprint.set(fingerprint, record);
      recordsToVision.push(record);
      recordsToAttach.push(record);
      report.indexed += 1;
      if (!known) report.symlinked += asset.metadata?.storage?.kind === "local-symlink" ? 1 : 0;
      if ((index + 1) % 100 === 0) {
        console.error(`[folder-video-ingest] indexed ${index + 1}/${scan.files.length}`);
      }
    } else {
      const merged = mergeLibraryCoverage(libraryRecord, entry);
      upsertLibraryRecord(nextLibrary, merged);
      recordsToAttach.push(merged);
    }
  });

  const frameJobs = recordsToVision.flatMap((record) =>
    (record.asset?.metadata?.frames || []).map((frame) => ({
      recordId: record.id,
      marker: frame.marker,
      path: mediaPathForUri(frame.uri),
      frame
    })).filter((job) => job.path)
  );
  report.frameJobs = frameJobs.length;
  const vision = await runVision(frameJobs.map((job) => job.path));
  const visionByRecord = groupVisionByRecord(frameJobs, vision);

  for (const record of recordsToVision) {
    const frameResults = visionByRecord.get(record.id) || [];
    if (!frameResults.length) continue;
    const aggregateVision = {
      ok: frameResults.some((frame) => frame.ok),
      textLines: frameResults.flatMap((frame) => frame.textLines || []),
      labels: dedupeLabels(frameResults.flatMap((frame) => frame.labels || [])).slice(0, 32)
    };
    const intelligence = createMediaIntelligenceRecord(record.asset, aggregateVision, {
      source: "folder-video-ingest-frame-pass"
    });
    record.asset = withAssetIntelligence(record.asset, intelligence, frameResults);
    record.intelligence = intelligence;
    record.documentKind = intelligence.classifications?.documentKind || record.documentKind;
    record.reviewPriority = intelligence.classifications?.reviewPriority || record.reviewPriority;
    record.tags = unique([
      ...(record.tags || []),
      "vision-ocr",
      intelligence.ocr?.lineCount ? "ocr-text" : null,
      record.documentKind,
      ...(intelligence.classifications?.activity || []),
      ...(intelligence.classifications?.palette || []).map((color) => `palette-${color}`)
    ]);
    report.enriched += 1;
    report.ocrLines += intelligence.ocr?.lineCount || 0;
    upsertLibraryRecord(nextLibrary, record);
  }

  if (!NO_ATTACH) {
    const attachable = nextLibrary.records.filter((record) => record.sourceKind === "folder-video");
    for (const record of attachable) {
      const match = chooseBestTarget(record, { avatarMatcher, tarotMatcher, sceneMatcher });
      const stableRelationships = (record.relationships || []).filter((rel) => !isPriorAutoMatch(record, rel));
      if (!match || match.score < 0.78) {
        record.relationships = uniqueRelationships(stableRelationships);
        record.reviewStatus = "unassigned";
        record.notes = record.notes || "Indexed from source folders; no high-confidence owner match yet.";
        report.unassigned += 1;
        upsertLibraryRecord(nextLibrary, record);
        continue;
      }
      record.relationships = uniqueRelationships([...stableRelationships, match.relationship]);
      record.reviewStatus = "attached";
      record.match = match;
      upsertLibraryRecord(nextLibrary, record);
      if (match.kind === "avatar") {
        const avatarIndex = nextAvatars.findIndex((avatar) => avatar.id === match.id);
        if (avatarIndex >= 0 && !nextAvatars[avatarIndex].assets.some((asset) => asset.id === record.asset.id)) {
          const requirementId = guessAvatarRequirement(record);
          nextAvatars[avatarIndex] = assignAssetToSlot(nextAvatars[avatarIndex], {
            ...record.asset,
            requirementId,
            tags: unique([...(record.asset.tags || []), "folder-ingest", "auto-attached"]),
            notes: `Auto-attached from ${record.sourceRoots.join(", ")} with ${Math.round(match.score * 100)}% confidence.`,
            metadata: {
              ...(record.asset.metadata || {}),
              folderIngest: folderIngestMetadata(record),
              autoAttach: match
            }
          });
          report.attached.avatar += 1;
        }
      }
      if (match.kind === "tarot") {
        const card = nextTarotStore.cards.find((item) => item.id === match.id);
        if (card && !card.assets.some((asset) => asset.id === record.asset.id)) {
          nextTarotStore = attachTarotCardMedia(nextTarotStore, match.id, {
            ...record.asset,
            tags: unique([...(record.asset.tags || []), "folder-ingest", "auto-attached", "tarot-loop"]),
            metadata: {
              ...(record.asset.metadata || {}),
              folderIngest: folderIngestMetadata(record),
              autoAttach: match,
              tarotMediaRole: "loop_video"
            }
          }, "loop_video");
          report.attached.tarot += 1;
        }
      }
      if (match.kind === "scene") {
        const scene = nextSceneGraph.scenes.find((item) => item.id === match.id);
        if (scene && !scene.assets.some((asset) => asset.id === record.asset.id)) {
          nextSceneGraph = attachSceneMedia(nextSceneGraph, match.id, {
            ...record.asset,
            requirementId: "scene_videos",
            tags: unique([...(record.asset.tags || []), "folder-ingest", "auto-attached", "scene-video"]),
            metadata: {
              ...(record.asset.metadata || {}),
              folderIngest: folderIngestMetadata(record),
              autoAttach: match
            }
          });
          report.attached.scene += 1;
        }
      }
    }
  }

  for (const avatar of nextAvatars) {
    avatar.characterSheet = createCharacterSheetScaffold(avatar, { tarotStore: nextTarotStore });
    avatar.updatedAt = new Date().toISOString();
  }

  nextLibrary.records = nextLibrary.records.map((record) => ({
    ...record,
    relationships: uniqueRelationships(record.relationships || []),
    updatedAt: new Date().toISOString()
  }));
  nextLibrary.batches = [{
    id: `folder-video-ingest-${Date.now()}`,
    roots: ROOTS,
    dryRun: DRY_RUN,
    noAttach: NO_ATTACH,
    reportPath: REPORT_PATH,
    summary: {
      sourceVideos: report.sourceVideos,
      uniqueVideos: scan.files.length,
      newVideos: report.newVideos,
      alreadyKnown: report.alreadyKnown,
      enriched: report.enriched,
      attached: report.attached,
      unassigned: report.unassigned
    },
    createdAt: new Date().toISOString()
  }, ...(nextLibrary.batches || [])].slice(0, 20);
  nextLibrary.updatedAt = new Date().toISOString();

  report.uniqueVideos = scan.files.length;
  report.libraryRecords = nextLibrary.records.length;
  report.generatedAt = new Date().toISOString();

  if (!DRY_RUN) {
    await Promise.all([
      backupFile(AVATAR_STORE_PATH, "folder-video-ingest"),
      backupFile(TAROT_STORE_PATH, "folder-video-ingest"),
      backupFile(SCENE_STORE_PATH, "folder-video-ingest"),
      backupFile(MEDIA_LIBRARY_PATH, "folder-video-ingest").catch(() => {})
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

async function scanVideoRoots(roots) {
  const byPath = new Map();
  let sourceVideos = 0;
  for (const root of roots) {
    const files = await walkVideos(root);
    sourceVideos += files.length;
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
    sourceVideos,
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  };
}

async function walkVideos(root) {
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
      if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(itemPath);
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

async function createFolderVideoAsset(entry, existingRecord = null) {
  const fingerprintShort = entry.contentFingerprint.slice(0, 16);
  const base = slugify(path.basename(entry.name, entry.extension)) || "folder-video";
  const mediaName = `${base}-${fingerprintShort}${entry.extension}`;
  const mediaPath = path.join(MEDIA_DIR, mediaName);
  await ensureSymlink(entry.path, mediaPath);
  const metadata = await probeVideo(entry.path);
  const frames = await extractFrameSet(entry, metadata, base, fingerprintShort);
  const asset = createMediaAsset({
    id: existingRecord?.asset?.id || `folder-video-${fingerprintShort}`,
    name: entry.name,
    uri: `/media/${mediaName}`,
    type: "video",
    requirementId: "folder_video",
    tags: unique(["folder-ingest", "video", "motion", ...entry.coverage.sourceRoots.map((root) => `source-${slugify(root)}`)]),
    source: "folder-video-ingest",
    notes: `Indexed from ${entry.coverage.sourceRoots.join(", ")}.`,
    metadata: {
      ...(existingRecord?.asset?.metadata || {}),
      originalFileName: entry.name,
      mimeType: mimeTypeForExtension(entry.extension),
      sizeBytes: entry.stat.size,
      lastModified: entry.stat.mtimeMs,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      format: entry.extension.slice(1),
      thumbnail: frames.find((frame) => frame.marker === "first") || frames[0] || null,
      thumbnailUri: frames.find((frame) => frame.marker === "first")?.uri || frames[0]?.uri || null,
      frames,
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
      attachedToCard: false,
      indexedAt: new Date().toISOString()
    }
  });
  return withVideoFrames(asset, frames);
}

async function createMinimalFolderVideoAsset(entry, existingRecord = null) {
  const fingerprintShort = entry.contentFingerprint.slice(0, 16);
  const base = slugify(path.basename(entry.name, entry.extension)) || "folder-video";
  const mediaName = `${base}-${fingerprintShort}${entry.extension}`;
  const mediaPath = path.join(MEDIA_DIR, mediaName);
  await ensureSymlink(entry.path, mediaPath);
  return createMediaAsset({
    id: existingRecord?.asset?.id || `folder-video-${fingerprintShort}`,
    name: entry.name,
    uri: `/media/${mediaName}`,
    type: "video",
    requirementId: "folder_video",
    tags: unique(["folder-ingest", "video", "needs-review", ...entry.coverage.sourceRoots.map((root) => `source-${slugify(root)}`)]),
    source: "folder-video-ingest",
    notes: `Indexed from ${entry.coverage.sourceRoots.join(", ")}; frame extraction needs review.`,
    metadata: {
      ...(existingRecord?.asset?.metadata || {}),
      originalFileName: entry.name,
      mimeType: mimeTypeForExtension(entry.extension),
      sizeBytes: entry.stat.size,
      lastModified: entry.stat.mtimeMs,
      storage: {
        kind: "local-symlink",
        fileName: mediaName,
        path: mediaPath,
        targetPath: entry.path
      },
      frames: [],
      folderIngest: folderIngestMetadata({ ...entry, sourceRoots: entry.coverage.sourceRoots, sourceRelativePaths: entry.coverage.sourceRelativePaths })
    },
    processing: {
      status: "indexed-needs-frame-review",
      attachedToCard: false,
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

async function probeVideo(filePath) {
  try {
    const { stdout } = await execFile("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,duration:format=duration",
      "-of", "json",
      filePath
    ], { maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const stream = parsed.streams?.[0] || {};
    return {
      width: Number(stream.width) || null,
      height: Number(stream.height) || null,
      duration: Number(stream.duration || parsed.format?.duration) || null
    };
  } catch {
    return { width: null, height: null, duration: null };
  }
}

async function extractFrameSet(entry, metadata, base, fingerprintShort) {
  const duration = Number(metadata.duration || 0);
  const times = {
    first: duration > 0.05 ? 0.02 : 0,
    mid: duration ? duration / 2 : 0,
    last: duration > 0.12 ? duration - 0.08 : Math.max(0, duration)
  };
  const roles = {
    first: "start-state",
    mid: "motion-state",
    last: "end-state"
  };
  const frames = [];
  for (const marker of ["first", "mid", "last"]) {
    const frameName = `${base}-${fingerprintShort}-${marker}-frame.jpg`;
    const framePath = path.join(MEDIA_DIR, frameName);
    try {
      await extractFrame(entry.path, times[marker], framePath);
    } catch {
      continue;
    }
    const frameStat = await stat(framePath).catch(() => null);
    frames.push({
      id: `folder-video-${fingerprintShort}-frame-${marker}`,
      marker,
      label: marker === "mid" ? "Mid frame" : `${marker[0].toUpperCase()}${marker.slice(1)} frame`,
      role: roles[marker],
      time: times[marker],
      uri: `/media/${frameName}`,
      width: metadata.width ? Math.min(metadata.width, 720) : null,
      height: metadata.width && metadata.height ? Math.round(metadata.height * Math.min(1, 720 / metadata.width)) : metadata.height || null,
      mimeType: "image/jpeg",
      storage: {
        kind: "local-file",
        fileName: frameName,
        path: framePath,
        sourcePath: entry.path
      },
      createdAt: frameStat?.mtime?.toISOString?.() || new Date().toISOString()
    });
  }
  return frames;
}

async function extractFrame(sourcePath, time, outputPath) {
  try {
    await access(outputPath, fsConstants.R_OK);
    return;
  } catch {
    // Extract below.
  }
  await execFile("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-ss", String(Math.max(0, time || 0)),
    "-i", sourcePath,
    "-frames:v", "1",
    "-vf", "scale='min(720,iw)':-2",
    "-q:v", "3",
    outputPath
  ], { maxBuffer: 2 * 1024 * 1024 });
}

async function runVision(paths) {
  const results = new Map();
  const existingPaths = [];
  for (const filePath of unique(paths)) {
    try {
      await access(filePath, fsConstants.R_OK);
      existingPaths.push(filePath);
    } catch {
      results.set(filePath, { path: filePath, ok: false, textLines: [], labels: [], error: "missing" });
    }
  }
  const chunks = chunkArray(existingPaths, 80);
  for (let index = 0; index < chunks.length; index += 1) {
    console.error(`[folder-video-ingest] Vision chunk ${index + 1}/${chunks.length} (${chunks[index].length} frames)`);
    const { stdout } = await execFile(TOOL_PATH, chunks[index], { cwd: ROOT, maxBuffer: 140 * 1024 * 1024 });
    for (const line of stdout.split("\n").filter(Boolean)) {
      const result = JSON.parse(line);
      results.set(result.path, result);
    }
  }
  return results;
}

function groupVisionByRecord(frameJobs, vision) {
  const grouped = new Map();
  for (const job of frameJobs) {
    const result = vision.get(job.path) || null;
    if (!grouped.has(job.recordId)) grouped.set(job.recordId, []);
    grouped.get(job.recordId).push({
      marker: job.marker,
      path: job.path,
      ok: Boolean(result?.ok),
      width: result?.width || null,
      height: result?.height || null,
      textLines: result?.textLines || [],
      labels: result?.labels || [],
      fingerprint: result?.fingerprint || null
    });
  }
  return grouped;
}

function createLibraryRecord(entry, asset, existingRecord = null) {
  const intelligence = asset.metadata?.intelligence || existingRecord?.intelligence || null;
  return {
    ...(existingRecord || {}),
    id: existingRecord?.id || `folder-video-${entry.contentFingerprint.slice(0, 16)}`,
    sourceKind: "folder-video",
    name: entry.name,
    mediaType: "video",
    uri: asset.uri,
    thumbnailUri: asset.metadata?.thumbnailUri || asset.metadata?.frames?.[0]?.uri || null,
    sourcePath: entry.path,
    sourceRoots: entry.coverage.sourceRoots,
    sourceRelativePaths: entry.coverage.sourceRelativePaths,
    contentFingerprint: entry.contentFingerprint,
    sizeBytes: entry.stat.size,
    width: asset.metadata?.width || null,
    height: asset.metadata?.height || null,
    duration: asset.metadata?.duration || null,
    documentKind: intelligence?.classifications?.documentKind || existingRecord?.documentKind || guessDocumentKindFromPath(entry.path),
    reviewPriority: intelligence?.classifications?.reviewPriority || existingRecord?.reviewPriority || "medium",
    tags: unique([...(existingRecord?.tags || []), ...(asset.tags || []), guessDocumentKindFromPath(entry.path)]),
    relationships: uniqueRelationships(existingRecord?.relationships || []),
    asset,
    intelligence,
    notes: existingRecord?.notes || `Indexed from ${entry.coverage.sourceRoots.join(", ")}.`,
    createdAt: existingRecord?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function mergeLibraryCoverage(record, entry) {
  return {
    ...record,
    sourceRoots: unique([...(record.sourceRoots || []), ...entry.coverage.sourceRoots]),
    sourceRelativePaths: {
      ...(record.sourceRelativePaths || {}),
      ...entry.coverage.sourceRelativePaths
    },
    updatedAt: new Date().toISOString()
  };
}

function upsertLibraryRecord(library, record) {
  const index = library.records.findIndex((item) => item.id === record.id || (record.contentFingerprint && item.contentFingerprint === record.contentFingerprint));
  if (index >= 0) library.records[index] = record;
  else library.records.push(record);
}

function chooseBestTarget(record, { avatarMatcher, tarotMatcher, sceneMatcher }) {
  const relativePaths = Object.values(record.sourceRelativePaths || {}).join(" ");
  const haystack = normalizeText([
    record.name,
    relativePaths,
    record.documentKind,
    ...(record.tags || []),
    ...(record.intelligence?.ocr?.lines || []).map((line) => line.text || line),
    record.intelligence?.vision?.description || ""
  ].join(" "));
  const candidates = [
    ...avatarMatcher.map((item) => scoreMatcher(item, haystack, "avatar")),
    ...tarotMatcher.map((item) => scoreMatcher(item, haystack, "tarot")),
    ...sceneMatcher.map((item) => scoreMatcher(item, haystack, "scene"))
  ].filter(Boolean);
  if (record.sourceRoots?.includes("card-deck")) {
    candidates.push(...tarotMatcher.map((item) => ({
      kind: "tarot",
      id: item.id,
      score: scoreMatcher(item, haystack, "tarot")?.score || 0.52,
      reason: "card-deck source folder",
      relationship: {
        ownerType: "tarot",
        ownerId: item.id,
        ownerName: item.name,
        role: "loop_video"
      }
    })).filter((item) => item.score >= 0.72));
  }
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

function isPriorAutoMatch(record, relationship) {
  if (!record.match || !relationship) return false;
  return record.match.kind === relationship.ownerType && record.match.id === relationship.ownerId;
}

function scoreMatcher(item, haystack, kind) {
  const hits = item.terms.filter((term) => term.length >= item.minLength && haystack.includes(term));
  if (!hits.length) return null;
  const base = kind === "avatar" ? 0.76 : kind === "tarot" ? 0.74 : 0.7;
  const score = Math.min(0.98, base + hits.length * 0.07 + Math.min(0.12, Math.max(...hits.map((hit) => hit.length)) / 100));
  return {
    kind,
    id: item.id,
    score,
    reason: `Matched ${hits.slice(0, 3).join(", ")}`,
    relationship: {
      ownerType: kind,
      ownerId: item.id,
      ownerName: item.name,
      role: kind === "tarot" ? "loop_video" : kind === "scene" ? "scene_videos" : "avatar-video"
    }
  };
}

function buildAvatarMatchers(avatars) {
  const skip = new Set(["red", "blue", "green", "black", "white", "gold"]);
  return avatars.map((avatar) => {
    const terms = unique([
      avatar.primaryName,
      ...(avatar.aliases || []),
      ...(avatar.names || []).map((item) => item.name)
    ].map(normalizeText)).filter((term) => term.length >= 4 && !skip.has(term));
    return { id: avatar.id, name: avatar.primaryName || avatar.id, terms, minLength: 4 };
  }).filter((item) => item.terms.length);
}

function buildTarotMatchers(cards) {
  return cards.map((card) => ({
    id: card.id,
    name: card.title || card.id,
    terms: unique([card.title, card.slug, card.number ? `${card.number} ${card.suit}` : null].map(normalizeText)).filter((term) => term.length >= 5),
    minLength: 5
  })).filter((item) => item.terms.length);
}

function buildSceneMatchers(graph) {
  return (graph.scenes || []).map((scene) => ({
    id: scene.id,
    name: scene.title || scene.id,
    terms: unique([scene.title, scene.id, ...(scene.tags || [])].map(normalizeText)).filter((term) => term.length >= 7),
    minLength: 7
  })).filter((item) => item.terms.length);
}

function guessAvatarRequirement(record) {
  const kind = record.documentKind || "";
  const text = normalizeText(`${record.name} ${(record.tags || []).join(" ")} ${record.intelligence?.vision?.description || ""}`);
  if (/close|portrait|face|emotion/.test(text)) return "closeup_emotions";
  if (/kit|weapon|tool|gear|pose/.test(text) || kind === "kit_sheet") return "kit_poses";
  if (/background|city|scene|comic|cinematic/.test(text) || kind === "comic") return "fullbody_concept_art";
  return "fullbody_concept_art";
}

function guessDocumentKindFromPath(filePath) {
  const text = normalizeText(filePath);
  if (text.includes("card-deck") || text.includes("tarot") || text.includes("card")) return "tarot_loop";
  if (text.includes("comic") || text.includes("page") || text.includes("panel")) return "comic";
  if (text.includes("dossier")) return "character_dossier";
  if (text.includes("kit")) return "kit_sheet";
  if (text.includes("scene")) return "scene_video";
  return "video_loop";
}

function withAssetIntelligence(asset, intelligence, frameResults) {
  const frames = (asset.metadata?.frames || []).map((frame) => {
    const result = frameResults.find((item) => item.marker === frame.marker);
    return result?.fingerprint ? { ...frame, fingerprint: result.fingerprint } : frame;
  });
  return withVideoFrames({
    ...asset,
    tags: unique([
      ...(asset.tags || []),
      "vision-ocr",
      intelligence.ocr?.lineCount ? "ocr-text" : null,
      intelligence.classifications?.documentKind,
      ...(intelligence.classifications?.activity || []),
      ...((intelligence.gaps || []).length ? ["needs-review"] : [])
    ]),
    metadata: {
      ...(asset.metadata || {}),
      frames,
      frameIntelligence: frameResults,
      intelligence
    }
  }, frames);
}

function folderIngestMetadata(record) {
  return {
    schemaVersion: "hapa.folder-video-ingest.v1",
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

async function partialFileFingerprint(filePath, info) {
  const hash = createHash("sha256");
  hash.update(`hapa-partial-video-v1:${info.size}:`);
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

function createReport(scan) {
  return {
    schemaVersion: "hapa.folder-video-ingest-report.v1",
    dryRun: DRY_RUN,
    noAttach: NO_ATTACH,
    roots: ROOTS,
    sourceVideos: scan.sourceVideos,
    uniqueVideos: 0,
    alreadyKnown: 0,
    newVideos: 0,
    indexed: 0,
    symlinked: 0,
    frameJobs: 0,
    enriched: 0,
    ocrLines: 0,
    attached: {
      avatar: 0,
      tarot: 0,
      scene: 0
    },
    unassigned: 0,
    errors: [],
    libraryRecords: 0,
    rootCoverage: Object.fromEntries(ROOTS.map((root) => [rootLabel(root), createRootCoverage(rootLabel(root))])),
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
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".m4v") return "video/x-m4v";
  if (ext === ".mkv") return "video/x-matroska";
  return "video/mp4";
}

function dedupeLabels(labels = []) {
  const byId = new Map();
  for (const label of labels) {
    const identifier = label.identifier || label.label;
    if (!identifier) continue;
    const existing = byId.get(identifier);
    if (!existing || Number(label.confidence || 0) > Number(existing.confidence || 0)) byId.set(identifier, label);
  }
  return [...byId.values()].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
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
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}
