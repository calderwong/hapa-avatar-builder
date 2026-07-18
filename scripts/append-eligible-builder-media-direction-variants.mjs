#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEligibleBuilderMediaDirectorCandidates,
  hasExcludedEchoDirectorOrigin,
} from "../src/domain/builder-direction-candidates.js";
import { recastBalancedEchoDirectorProject } from "../src/domain/echo-media-recast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const VARIANTS_DIR = path.join(DATA_DIR, "music-video-project-variants");
const VARIANT_INDEX_PATH = path.join(VARIANTS_DIR, "index.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const TAROT_STORE_PATH = path.join(DATA_DIR, "tarot-store.json");
const TECHNICAL_CACHE_PATH = path.join(ROOT, "artifacts", "echo-media-affordances", "technical-cache-v2.json");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "builder-eligible-media-direction");
const HASH_CACHE_PATH = path.join(OUTPUT_DIR, "hash-cache-v1.json");
const REPORTS_DIR = path.join(DATA_DIR, "merge-reports");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

const SOURCE_GROUPS = Object.freeze(["avatar", "deevid", "tarot", "scene"]);
const VARIANT_ID = "builder-deevid-tarot-scene-eligible-v1";
const VARIANT_TITLE = "Builder + Deevid + Tarot + Scene · Eligible Recast";
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const MISSING_ONLY = args.has("--missing-only");
const STARTED_AT = new Date().toISOString();
const RUN_ID = `builder-eligible-media-direction-${STARTED_AT.replace(/[:.]/g, "-")}`;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, typeof value === "string" ? value : json(value), "utf8");
  await rename(tempPath, filePath);
}

async function mapLimit(values, limit, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await worker(values[index], index);
    }
  }));
  return output;
}

function mediaRelativePath(uri = "") {
  const encoded = String(uri).replace(/^\/media\//, "").split(/[?#]/)[0];
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}

async function discoverMediaFiles(directory = MEDIA_DIR, relative = "") {
  const rows = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of await discoverMediaFiles(absolute, nextRelative)) rows.set(key, value);
      continue;
    }
    const info = await stat(absolute).catch(() => null);
    if (info?.isFile() && info.size > 0) rows.set(nextRelative, { path: absolute, sizeBytes: info.size, mtimeMs: info.mtimeMs });
  }
  return rows;
}

function technicalCacheByMediaName(cache = {}) {
  const rows = new Map();
  for (const [sourcePath, value] of Object.entries(cache)) {
    const technical = value?.technical || value;
    const normalized = String(sourcePath).replaceAll("\\", "/");
    const marker = "/data/media/";
    const markerIndex = normalized.lastIndexOf(marker);
    if (markerIndex >= 0) rows.set(normalized.slice(markerIndex + marker.length), technical);
    rows.set(path.basename(normalized), technical);
  }
  return rows;
}

async function materializeContentHashes(candidates, mediaFiles, hashCache) {
  const missing = candidates.filter((candidate) => !/^[a-f0-9]{64}$/.test(String(candidate.sha256 || "")));
  let diskHashed = 0;
  let cacheHits = 0;
  let processed = 0;
  const enriched = await mapLimit(missing, 4, async (candidate) => {
    const relativePath = mediaRelativePath(candidate.uri);
    const file = mediaFiles.get(relativePath);
    if (!file) throw new Error(`Eligible media is not available locally: ${candidate.uri}`);
    const cached = hashCache.entries?.[relativePath];
    let sha256 = cached?.sizeBytes === file.sizeBytes
      && Math.abs(Number(cached?.mtimeMs || 0) - file.mtimeMs) < 1
      && /^[a-f0-9]{64}$/.test(String(cached?.sha256 || ""))
      ? cached.sha256
      : "";
    if (sha256) cacheHits += 1;
    else {
      sha256 = await sha256File(file.path);
      diskHashed += 1;
    }
    hashCache.entries[relativePath] = { sizeBytes: file.sizeBytes, mtimeMs: file.mtimeMs, sha256, verifiedAt: STARTED_AT };
    processed += 1;
    if (processed % 50 === 0 || processed === missing.length) {
      console.error(`[builder-eligible-direction] verified ${processed}/${missing.length} missing identities`);
    }
    return { ...candidate, sha256, technicalIdentity: `sha256:${sha256}`, mediaLibraryId: `hapa-media:sha256:${sha256}` };
  });
  const byId = new Map(enriched.map((candidate) => [candidate.id, candidate]));
  return {
    candidates: candidates.map((candidate) => byId.get(candidate.id) || candidate),
    diskHashed,
    cacheHits,
  };
}

function dedupeByContent(candidates = []) {
  const rows = new Map();
  for (const candidate of candidates) {
    const identity = candidate.technicalIdentity || (candidate.sha256 ? `sha256:${candidate.sha256}` : `uri:${candidate.uri}`);
    if (!rows.has(identity)) rows.set(identity, candidate);
  }
  return [...rows.values()];
}

function directionVariantFingerprint(variant = {}) {
  return sha256Bytes(Buffer.from(JSON.stringify({
    id: variant.id,
    parent: variant.parent,
    seed: variant.seed,
    sourcePolicy: variant.sourcePolicy,
    timeline: variant.timeline,
    visualizerTimeline: variant.visualizer_timeline,
    hyperframeScript: variant.hyperframe_script,
  })));
}

async function snapshotExistingVariants(directory = VARIANTS_DIR, relative = "") {
  const rows = new Map();
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error));
  for (const entry of entries) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of await snapshotExistingVariants(absolute, nextRelative)) rows.set(key, value);
    } else if (entry.name.endsWith(".json") && nextRelative !== "index.json") {
      rows.set(nextRelative, sha256Bytes(await readFile(absolute)));
    }
  }
  return rows;
}

function increment(map, key) {
  map.set(key, Number(map.get(key) || 0) + 1);
}

function usageSummary(candidates, usageCounts) {
  return Object.fromEntries(SOURCE_GROUPS.map((sourceGroup) => {
    const group = candidates.filter((candidate) => candidate.sourceGroup === sourceGroup);
    const counts = group.map((candidate) => Number(usageCounts.get(candidate.technicalIdentity) || 0));
    return [sourceGroup, {
      eligible: group.length,
      used: counts.filter((count) => count > 0).length,
      unused: counts.filter((count) => count === 0).length,
      placements: counts.reduce((sum, count) => sum + count, 0),
    }];
  }));
}

function validateCardReferences(candidates, stores) {
  const ids = {
    avatar: new Set(list(stores.avatarStore.avatars).map((row) => row.id)),
    item: new Set(list(stores.itemStore.cards).map((row) => row.id)),
    tarot: new Set(list(stores.tarotStore.cards).map((row) => row.id)),
    scene: new Set(list(stores.sceneStore.scenes).map((row) => row.id)),
  };
  const unresolved = candidates.filter((candidate) => !ids[candidate.cardKind]?.has(candidate.cardId));
  if (unresolved.length) throw new Error(`Unresolved candidate Card references: ${unresolved.slice(0, 12).map((row) => `${row.cardKind}:${row.cardId}`).join(", ")}`);
}

async function main() {
  const [avatarStore, itemStore, tarotStore, sceneStore, technicalCache, existingIndex, existingHashCache, mediaFiles] = await Promise.all([
    readJson(AVATAR_STORE_PATH),
    readJson(ITEM_STORE_PATH),
    readJson(TAROT_STORE_PATH),
    readJson(SCENE_STORE_PATH),
    readJson(TECHNICAL_CACHE_PATH, {}),
    readJson(VARIANT_INDEX_PATH, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [], updatedAt: "" }),
    readJson(HASH_CACHE_PATH, { schemaVersion: "hapa.builder-eligible-direction-hash-cache.v1", entries: {}, updatedAt: "" }),
    discoverMediaFiles(),
  ]);
  const stores = { avatarStore, itemStore, tarotStore, sceneStore };
  const extraction = buildEligibleBuilderMediaDirectorCandidates(stores, {
    minShortEdge: 512,
    minDurationSeconds: 2.5,
    availableMediaFiles: new Set(mediaFiles.keys()),
    technicalByFileName: technicalCacheByMediaName(technicalCache),
    deevidOptions: { requireVerifiedTechnical: true, requireBrowserSafePixelFormat: true },
    tarotOptions: { requireVerifiedTechnical: true, verifiedTechnicalStatuses: ["verified-source-file", "verified"], requireBrowserSafePixelFormat: true },
    sceneOptions: { requireSceneItemCard: false, requireVerifiedTechnical: true, requireBrowserSafePixelFormat: true },
    avatarOptions: { requireVerifiedTechnical: false, requireBrowserSafePixelFormat: true },
  });
  if (SOURCE_GROUPS.some((sourceGroup) => !extraction.groups[sourceGroup]?.length)) {
    throw new Error(`All four Builder media families are required: ${JSON.stringify(extraction.telemetry)}`);
  }
  const hashCache = { schemaVersion: "hapa.builder-eligible-direction-hash-cache.v1", entries: { ...(existingHashCache.entries || {}) }, updatedAt: STARTED_AT };
  const hashed = await materializeContentHashes(extraction.candidates, mediaFiles, hashCache);
  const candidates = dedupeByContent(hashed.candidates);
  validateCardReferences(candidates, stores);
  const forbidden = candidates.filter((candidate) => hasExcludedEchoDirectorOrigin(candidate.origin, candidate.provenance, candidate.sourceProvenance));
  if (forbidden.length) throw new Error(`Excluded origins survived candidate extraction: ${forbidden.slice(0, 12).map((row) => row.id).join(", ")}`);
  const candidateCounts = Object.fromEntries(SOURCE_GROUPS.map((sourceGroup) => [sourceGroup, candidates.filter((candidate) => candidate.sourceGroup === sourceGroup).length]));
  if (Object.values(candidateCounts).some((count) => count === 0)) throw new Error(`Content deduplication removed a required source family: ${JSON.stringify(candidateCounts)}`);

  const projectFiles = (await readdir(PROJECTS_DIR)).filter((file) => file.endsWith("-video-project.json")).sort();
  const immutableVariantsBefore = await snapshotExistingVariants();
  const usageCounts = new Map();
  const cardUsageCounts = new Map();
  const projectHashesBefore = new Map();
  const generated = [];
  for (const fileName of projectFiles) {
    const projectPath = path.join(PROJECTS_DIR, fileName);
    const bytes = await readFile(projectPath);
    const parentSha256 = sha256Bytes(bytes);
    projectHashesBefore.set(fileName, parentSha256);
    const payload = JSON.parse(bytes.toString("utf8"));
    const project = payload.music_video_project || payload;
    if (!project?.song_id) continue;
    const variantPath = path.join(VARIANTS_DIR, project.song_id, `${VARIANT_ID}.json`);
    const existing = await readJson(variantPath, null).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (MISSING_ONLY && existing) continue;
    const variant = recastBalancedEchoDirectorProject(project, candidates, {
      variantId: VARIANT_ID,
      title: VARIANT_TITLE,
      seed: `${project.song_id}:${VARIANT_ID}`,
      parentProjectHash: parentSha256,
      createdAt: STARTED_AT,
      allowedSourceGroups: SOURCE_GROUPS,
      sourcePattern: SOURCE_GROUPS,
      rotateSourcePattern: false,
      forbiddenProvenanceLineages: ["hapa-dev-proto", "hell-week"],
      sharedUsageCounts: usageCounts,
      sharedCardUsageCounts: cardUsageCounts,
    });
    if (existing && directionVariantFingerprint(existing) !== directionVariantFingerprint(variant)) {
      throw new Error(`Append-only conflict at ${variantPath}; choose a new variant id.`);
    }
    generated.push({ songId: project.song_id, fileName, parentSha256, variantPath, existing: Boolean(existing), variant });
  }
  if (!generated.length && !MISSING_ONLY) throw new Error("No Echo Album projects were available for the eligible Builder media pass.");

  const usage = usageSummary(candidates, usageCounts);
  const indexRows = generated.map(({ songId, parentSha256, variant }) => ({
    id: `${songId}:${variant.id}`,
    songId,
    variantId: variant.id,
    title: variant.title,
    relativePath: `${songId}/${variant.id}.json`,
    parentProjectSha256: parentSha256,
    sourcePolicy: variant.sourcePolicy,
    replacementShots: variant.telemetry.replacementShots,
    sourceSelections: variant.telemetry.selectionsBySource,
    uniqueMedia: variant.telemetry.uniqueMedia,
    updatedAt: STARTED_AT,
  }));
  const incomingIds = new Set(indexRows.map((row) => row.id));
  const nextIndex = {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [...indexRows, ...list(existingIndex.variants).filter((row) => !incomingIds.has(row.id))],
    updatedAt: STARTED_AT,
  };
  const report = {
    schemaVersion: "hapa.builder-eligible-media-direction-report.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    variant: { id: VARIANT_ID, title: VARIANT_TITLE },
    policy: {
      eligibleSourceGroups: SOURCE_GROUPS,
      sourceRotation: SOURCE_GROUPS,
      excludedOrigins: ["hapa-dev-proto", "hell-week"],
      exclusionScope: "explicit-origin-provenance-only",
      preserveExistingCuts: true,
      preserveLegacyProjects: true,
      minimumShortEdge: 512,
      minimumDurationSeconds: 2.5,
      technicalEligibility: "Deevid/Tarot/Scene require verified technical records; Avatar requires a local nonzero file plus Builder dimensions and duration",
      browserSafePixelFormatOnly: true,
      missingOnly: MISSING_ONLY,
    },
    candidates: {
      extracted: extraction.telemetry,
      afterContentDeduplication: candidates.length,
      bySourceGroup: candidateCounts,
      diskHashesMaterialized: hashed.diskHashed,
      hashCacheHits: hashed.cacheHits,
      explicitExcludedOriginsSurviving: 0,
      usage,
    },
    variants: {
      albumProjects: projectFiles.length,
      generated: generated.length,
      newFiles: generated.filter((row) => !row.existing).length,
      existingIdenticalFiles: generated.filter((row) => row.existing).length,
      replacementShots: generated.reduce((sum, row) => sum + row.variant.telemetry.replacementShots, 0),
      uniqueSelectedMedia: new Set(generated.flatMap((row) => row.variant.selectionEvidence.map((entry) => entry.technicalIdentity))).size,
      selectionsBySource: Object.fromEntries(SOURCE_GROUPS.map((sourceGroup) => [sourceGroup, generated.reduce((sum, row) => sum + Number(row.variant.telemetry.selectionsBySource?.[sourceGroup] || 0), 0)])),
    },
    validation: {
      allFourSourceGroupsEligible: Object.values(candidateCounts).every((count) => count > 0),
      allFourSourceGroupsSelected: SOURCE_GROUPS.every((sourceGroup) => usage[sourceGroup].placements > 0),
      deevidMediaIncorporated: usage.deevid.used > 0,
      tarotMediaIncorporated: usage.tarot.used > 0,
      noImmediateMediaRepeats: generated.every((row) => row.variant.telemetry.immediateMediaRepeats === 0),
      noExcludedOrigins: forbidden.length === 0,
      originalProjectsMutated: 0,
      existingVariantFilesMutated: 0,
    },
    outputs: { variantsDirectory: VARIANTS_DIR, variantIndex: VARIANT_INDEX_PATH, hashCache: HASH_CACHE_PATH },
    generatedAt: STARTED_AT,
  };

  let backupDirectory = "";
  if (APPLY) {
    backupDirectory = path.join(BACKUPS_DIR, RUN_ID);
    await mkdir(backupDirectory, { recursive: true });
    if (await stat(VARIANT_INDEX_PATH).catch(() => null)) await copyFile(VARIANT_INDEX_PATH, path.join(backupDirectory, "index.json"));
    for (const row of generated.filter((entry) => !entry.existing)) await atomicWrite(row.variantPath, row.variant);
    await Promise.all([atomicWrite(VARIANT_INDEX_PATH, nextIndex), atomicWrite(HASH_CACHE_PATH, hashCache)]);
  }

  const mutatedProjects = [];
  for (const [fileName, before] of projectHashesBefore) {
    if (sha256Bytes(await readFile(path.join(PROJECTS_DIR, fileName))) !== before) mutatedProjects.push(fileName);
  }
  const immutableVariantsAfter = await snapshotExistingVariants();
  const mutatedVariants = [...immutableVariantsBefore].filter(([relativePath, before]) => immutableVariantsAfter.get(relativePath) !== before).map(([relativePath]) => relativePath);
  if (mutatedProjects.length) throw new Error(`Legacy projects changed: ${mutatedProjects.join(", ")}`);
  if (mutatedVariants.length) throw new Error(`Existing cuts changed: ${mutatedVariants.slice(0, 12).join(", ")}`);
  report.validation.originalProjectsMutated = mutatedProjects.length;
  report.validation.existingVariantFilesMutated = mutatedVariants.length;
  report.backupDirectory = backupDirectory;
  const reportPath = path.join(REPORTS_DIR, `${RUN_ID}.json`);
  if (APPLY) await atomicWrite(reportPath, report);
  console.log(json({ ok: true, dryRun: !APPLY, reportPath: APPLY ? reportPath : null, ...report }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
