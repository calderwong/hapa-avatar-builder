#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildReferenceDirectorCandidates } from "../src/domain/builder-direction-candidates.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_ROOT = path.join(ROOT, "data", "media", "echo-reference-animated-cards");
const CATALOG_PATH = path.join(ROOT, "data", "echo-reference-animated-media.json");
const TECHNICAL_CACHE_PATH = path.join(ROOT, "artifacts", "echo-media-affordances", "technical-cache-v2.json");
const DEFAULT_REFERENCE_RUN_PATH = path.join(ROOT, "data", "echo-reference-mining", "latest.json");
const REPORTS_DIR = path.join(ROOT, "data", "merge-reports");
const BACKUPS_DIR = path.join(ROOT, "data", "backups");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const catalogIndex = args.indexOf("--catalog");
const SOURCE_CATALOG = catalogIndex >= 0 ? path.resolve(args[catalogIndex + 1] || "") : "";
const referenceRunIndex = args.indexOf("--reference-run");
const REFERENCE_RUN_PATH = referenceRunIndex >= 0
  ? path.resolve(args[referenceRunIndex + 1] || "")
  : DEFAULT_REFERENCE_RUN_PATH;
const STARTED_AT = new Date().toISOString();
const RUN_ID = `reference-adaptive-loop-ingest-${STARTED_AT.replace(/[:.]/g, "-")}`;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, typeof value === "string" ? value : json(value), "utf8");
  await rename(tempPath, filePath);
}

async function assertArtifact(record, key) {
  const artifact = record.artifacts?.[key];
  const sourcePath = path.resolve(String(artifact?.path || ""));
  if (!sourcePath || !(await stat(sourcePath).catch(() => null))?.isFile()) {
    throw new Error(`${record.card?.id || "unknown"} is missing ${key}: ${sourcePath}`);
  }
  const digest = await sha256File(sourcePath);
  if (digest !== artifact.sha256) throw new Error(`${record.card.id} ${key} digest changed.`);
  return { sourcePath, digest };
}

async function main() {
  if (!SOURCE_CATALOG) {
    throw new Error("Usage: node scripts/ingest-reference-adaptive-loops.mjs --catalog <catalog.json> [--reference-run <run.json>] [--apply]");
  }
  const [sourceCatalog, referenceRun, technicalCache, currentCatalog] = await Promise.all([
    readJson(SOURCE_CATALOG),
    readJson(REFERENCE_RUN_PATH),
    readJson(TECHNICAL_CACHE_PATH, {}),
    readJson(CATALOG_PATH, { schemaVersion: "hapa.echo-reference-animated-media-catalog.v1", records: [] }),
  ]);
  const sourceRecords = list(sourceCatalog.records);
  if (!sourceRecords.length) throw new Error("Source animated-media catalog has no records.");
  const cardById = new Map(list(referenceRun.cards).map((card) => [card.id, card]));
  const duplicateIds = sourceRecords.map((record) => record.card?.id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`Duplicate Reference Card media records: ${[...new Set(duplicateIds)].join(", ")}`);

  const plannedCopies = [];
  const records = [];
  const nextTechnicalCache = { ...technicalCache };
  for (const record of sourceRecords) {
    const sourceCard = cardById.get(record.card?.id);
    if (!sourceCard) throw new Error(`Animated media points to an unknown Reference Card: ${record.card?.id}`);
    if (sourceCard.revisionId !== record.card.revisionId) {
      throw new Error(`Reference Card revision mismatch for ${record.card.id}: ${record.card.revisionId} != ${sourceCard.revisionId}`);
    }
    const previewVisible = record.custody?.previewVisibility === "visible-before-review"
      || record.custody?.humanReviewRequired === true;
    const reviewBoundaryValid = record.custody?.reviewStatus === "approved"
      ? record.custody?.humanReviewRequired === false
      : record.custody?.humanReviewRequired === true;
    if (!previewVisible || !reviewBoundaryValid || record.custody?.canonPromotion !== false) {
      throw new Error(`Reference media custody boundary is missing for ${record.card.id}`);
    }
    if (record.technical?.directorEligible !== true
      || record.technical?.shortEdge < 512
      || record.technical?.durationSec < 2.5
      || record.technical?.codec !== "h264"
      || record.technical?.pixelFormat !== "yuv420p") {
      throw new Error(`Reference media is not technically Director-eligible: ${record.card.id}`);
    }
    const image = await assertArtifact(record, "image");
    const video = await assertArtifact(record, "loopVideo");
    const mediaSlug = slug(record.card.id);
    const imageName = `${mediaSlug}-reference-image.png`;
    const videoName = `${mediaSlug}-adaptive-default-loop.mp4`;
    const imageTarget = path.join(MEDIA_ROOT, imageName);
    const videoTarget = path.join(MEDIA_ROOT, videoName);
    plannedCopies.push(
      { sourcePath: image.sourcePath, targetPath: imageTarget, sha256: image.digest },
      { sourcePath: video.sourcePath, targetPath: videoTarget, sha256: video.digest },
    );
    const normalized = {
      ...record,
      artifacts: {
        ...record.artifacts,
        image: {
          ...record.artifacts.image,
          sourcePath: image.sourcePath,
          path: imageTarget,
          uri: `/media/echo-reference-animated-cards/${imageName}`,
        },
        loopVideo: {
          ...record.artifacts.loopVideo,
          sourcePath: video.sourcePath,
          path: videoTarget,
          uri: `/media/echo-reference-animated-cards/${videoName}`,
          runtimeUri: `/media/echo-reference-animated-cards/${videoName}`,
        },
      },
      provenance: {
        sourceSystem: "hapa-avatar-builder",
        sourceNode: "Reference Atlas",
        sourceCatalog: SOURCE_CATALOG,
        sourceManifestHash: sourceCatalog.sourceManifestHash || "",
        patternId: sourceCatalog.patternId || record.pattern?.id || "",
        importedAt: STARTED_AT,
      },
    };
    records.push(normalized);
    nextTechnicalCache[videoTarget] = {
      key: `${record.artifacts.loopVideo.bytes}:${STARTED_AT}`,
      technical: {
        schemaVersion: "hapa.echo.media-technical-affordance.v2",
        status: "verified-source-file",
        sourcePath: videoTarget,
        sourceProvenance: {
          storeRecords: [{
            source: "echo-reference-animated-media",
            parentId: record.card.id,
            assetId: `reference-loop:${record.card.id}`,
          }],
        },
        contentHash: { algorithm: "sha256", value: video.digest },
        fileSizeBytes: record.artifacts.loopVideo.bytes,
        durationSec: record.technical.durationSec,
        width: record.technical.width,
        height: record.technical.height,
        fps: record.technical.fps,
        codec: record.technical.codec,
        pixelFormat: record.technical.pixelFormat,
        keyframes: { count: 1, firstSeconds: [0], source: "deterministic-loop-encode" },
        posterUri: `/media/echo-reference-animated-cards/${imageName}`,
        contactFrames: [],
        analyzedAt: STARTED_AT,
        analyzer: "scripts/ingest-reference-adaptive-loops.mjs",
        durationBasis: "source-receipt-and-ffprobe",
      },
    };
  }

  const nextCatalog = {
    schemaVersion: "hapa.echo-reference-animated-media-catalog.v1",
    sourceManifest: SOURCE_CATALOG,
    sourceManifestHash: sourceCatalog.sourceManifestHash || "",
    sourceReferenceRunId: referenceRun.runId || "",
    sourceReferenceRunHash: referenceRun.runHash || "",
    patternId: sourceCatalog.patternId || "",
    records,
    custody: {
      sourceCardsUnchanged: true,
      previewVisibility: "visible-before-review",
      approvalControlsAuthorityNotVisibility: true,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
      humanReviewRequired: true,
    },
    updatedAt: STARTED_AT,
  };
  const availableMediaFiles = new Set(records.map((record) => (
    record.artifacts.loopVideo.uri.replace(/^\/media\//, "")
  )));
  const candidates = buildReferenceDirectorCandidates(nextCatalog, {
    minShortEdge: 512,
    minDurationSeconds: 2.5,
    requireVerifiedTechnical: true,
    requireBrowserSafePixelFormat: true,
    availableMediaFiles,
  });
  if (candidates.length !== records.length) {
    throw new Error(`Director candidate loss: ${records.length} records produced ${candidates.length} candidates.`);
  }
  const report = {
    schemaVersion: "hapa.echo-reference-animated-media-ingest-report.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    sourceCatalog: SOURCE_CATALOG,
    records: records.length,
    directorCandidates: candidates.length,
    distinctCardIds: new Set(candidates.map((candidate) => candidate.cardId)).size,
    technical: {
      minimumShortEdge: Math.min(...candidates.map((candidate) => candidate.technical.shortEdge)),
      minimumDurationSeconds: Math.min(...candidates.map((candidate) => candidate.duration)),
      browserSafePixelFormat: candidates.every((candidate) => candidate.technical.pixelFormat === "yuv420p"),
      contentHashed: candidates.every((candidate) => /^[a-f0-9]{64}$/.test(candidate.sha256)),
    },
    custody: nextCatalog.custody,
    outputs: {
      catalog: CATALOG_PATH,
      mediaRoot: MEDIA_ROOT,
      technicalCache: TECHNICAL_CACHE_PATH,
    },
    generatedAt: STARTED_AT,
  };

  let backupDirectory = "";
  if (APPLY) {
    backupDirectory = path.join(BACKUPS_DIR, RUN_ID);
    await mkdir(backupDirectory, { recursive: true });
    for (const sourcePath of [CATALOG_PATH, TECHNICAL_CACHE_PATH]) {
      if ((await stat(sourcePath).catch(() => null))?.isFile()) {
        await copyFile(sourcePath, path.join(backupDirectory, path.basename(sourcePath)));
      }
    }
    await mkdir(MEDIA_ROOT, { recursive: true });
    for (const copy of plannedCopies) {
      const existing = await stat(copy.targetPath).catch(() => null);
      if (existing?.isFile() && await sha256File(copy.targetPath) !== copy.sha256) {
        throw new Error(`Refusing to overwrite different media at ${copy.targetPath}`);
      }
      if (!existing) await copyFile(copy.sourcePath, copy.targetPath);
    }
    await atomicWrite(CATALOG_PATH, nextCatalog);
    await atomicWrite(TECHNICAL_CACHE_PATH, nextTechnicalCache);
    report.backupDirectory = backupDirectory;
    await atomicWrite(path.join(REPORTS_DIR, `${RUN_ID}.json`), report);
  }
  console.log(json({ ok: true, dryRun: !APPLY, report }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
