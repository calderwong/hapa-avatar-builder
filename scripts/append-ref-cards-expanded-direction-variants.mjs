#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildAvatarDirectorCandidates,
  buildDeevidDirectorCandidates,
  buildReferenceDirectorCandidates,
  buildSceneDirectorCandidates,
  buildScrollDirectorCandidatesFromLibrary,
  buildTarotDirectorCandidates,
  hasExcludedEchoDirectorOrigin,
} from "../src/domain/builder-direction-candidates.js";
import {
  discoverDirectionVariantIndexRows,
  mergeDirectionVariantIndexRows,
} from "../src/domain/echo-direction-variant-index.js";
import { recastBalancedEchoDirectorProject } from "../src/domain/echo-media-recast.js";
import {
  loadGatedEchoIsfManifest,
  repairEchoProjectShaders,
} from "./echo-isf-gated-manifest.mjs";
import {
  FOLDER_VIDEO_SOURCE_MANIFEST_SCHEMA,
  folderVideoHasReadableCompleteFrameSet,
  folderVideoPartialFileFingerprint,
  folderVideoSourceLibraryDigest,
  folderVideoSourceStateDigest,
} from "./ingest-folder-videos.mjs";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const MEDIA = path.join(DATA, "media");
const PROJECTS = path.join(DATA, "music-video-projects");
const VARIANTS = path.join(DATA, "music-video-project-variants");
const INDEX_PATH = path.join(VARIANTS, "index.json");
const REPORTS = path.join(DATA, "merge-reports");
const BACKUPS = path.join(DATA, "backups");
const OUTPUT = path.join(ROOT, "artifacts/ref-cards-expanded-direction");
const HASH_CACHE_PATH = path.join(OUTPUT, "hash-cache-v1.json");
const MEDIA_LIBRARY_PATH = path.join(DATA, "media-library.json");
const INGEST_REPORT_PATH = path.join(ROOT, "artifacts/enrichment/folder-video-ingest-report.json");
const SOURCE_ROOT = "ref-cards-run-1";
const SOURCE_FOLDER = "/Users/calderwong/Downloads/ref-cards-run-1";
const SOURCE_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const APPLY = process.argv.includes("--apply");
const TARGET_SONG_ID = process.argv.find((argument) => argument.startsWith("--song-id="))
  ?.slice("--song-id=".length).trim() || "";
const RUN_AT = new Date().toISOString();
const RUN_ID = `ref-cards-expanded-${RUN_AT.replace(/[:.]/g, "-")}`;

export const REF_CARDS_ACTION_TRANSITION_PATTERN = /(?:transition|morph|transform|becomes|turns[\s._-]*into|flows[\s._-]*into|moves[\s._-]*into|unlocks|opens[\s._-]*to|from[\s._-]*first[\s._-]*frame|into[\s._-]*(?:second|last|end)[\s._-]*frame|key[\s._-]*unlocks|fire[\s._-]*breeds|heart[\s._-]*morphs|energy[\s._-]*from[\s._-]*first|graph[\s._-]*forms|boat[\s._-]*leaves|card[\s._-]*joins)/iu;

export const REF_CARDS_DIRECTION_POLICY = Object.freeze({
  schemaVersion: "hapa.echo.ref-cards-transition-recovery-policy.v2",
  classifier: "explicit-action-name-provisional-scene-motion-v1",
  classifierPattern: REF_CARDS_ACTION_TRANSITION_PATTERN.source,
  transitionEditorialMotionWeight: 2,
  holdEditorialMotionWeight: 1,
  endpointTruthBoundary: "filename-never-certifies-transition-endpoints",
  coverageStrategy: "album-normalized-usage-load-then-card-fairness-v1",
});

export function classifyRefCardsMotionRole(relativePath = "") {
  const actionTransition = REF_CARDS_ACTION_TRANSITION_PATTERN.test(String(relativePath || ""));
  return actionTransition ? {
    analyzerRole: "transition",
    motionRole: "transition",
    authoredUse: "scene-motion",
    authoredRoles: ["action-transition-candidate", "endpoint-certification-required-for-atomic-bridge"],
    editorialMotionWeight: REF_CARDS_DIRECTION_POLICY.transitionEditorialMotionWeight,
    endpointStatus: "unverified-by-filename; eligible as scene motion only",
    roleBasis: "explicit action-transition source name",
  } : {
    analyzerRole: "loop",
    motionRole: "loop",
    authoredUse: "hold",
    authoredRoles: ["reference-or-scene-hold"],
    editorialMotionWeight: REF_CARDS_DIRECTION_POLICY.holdEditorialMotionWeight,
    endpointStatus: "not-applicable",
    roleBasis: "no explicit action-transition source name",
  };
}

export function refCardsSourceCohort(relativePath = "") {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (normalized.startsWith("run2/run3/")) return "ref-cards-run-1/run2/run3";
  if (normalized.startsWith("run2/")) return "ref-cards-run-1/run2";
  return "ref-cards-run-1/root";
}

if (TARGET_SONG_ID && path.basename(TARGET_SONG_ID) !== TARGET_SONG_ID) {
  throw new Error(`Unsafe target song ID: ${TARGET_SONG_ID}`);
}

export const REF_CARDS_SOURCE_GROUPS = Object.freeze([
  "ref-cards",
  "reference",
  "scroll",
  "scene",
  "avatar",
  "deevid",
  "tarot",
]);

export const REF_CARDS_CUT_BLUEPRINTS = Object.freeze([
  Object.freeze({
    key: "balanced",
    label: "Balanced",
    ordinal: 1,
    pattern: REF_CARDS_SOURCE_GROUPS,
  }),
  Object.freeze({
    key: "rhythmic",
    label: "Rhythmic",
    ordinal: 2,
    pattern: Object.freeze([
      "ref-cards", "avatar", "ref-cards", "deevid", "scroll",
      "ref-cards", "tarot", "scene", "reference",
    ]),
  }),
  Object.freeze({
    key: "cinematic",
    label: "Cinematic",
    ordinal: 3,
    pattern: Object.freeze([
      "ref-cards", "reference", "scene", "ref-cards",
      "scroll", "avatar", "tarot", "deevid",
    ]),
  }),
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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

async function atomicWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, typeof payload === "string" ? payload : json(payload), "utf8");
  await rename(temporary, filePath);
}

async function discoverSourceVideoSnapshot(directory = SOURCE_FOLDER) {
  const paths = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile() && SOURCE_VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        paths.push(absolute);
      }
    }
  }
  await walk(directory);
  paths.sort((left, right) => left.localeCompare(right));
  const entries = await mapLimit(paths, 4, async (absolute) => {
    const before = await stat(absolute);
    const contentFingerprint = await folderVideoPartialFileFingerprint(absolute, before);
    const after = await stat(absolute);
    if (before.size !== after.size || Math.abs(before.mtimeMs - after.mtimeMs) >= 1) {
      throw new Error(`Ref Cards source changed while its snapshot was being read: ${absolute}`);
    }
    const relativePath = path.relative(directory, absolute).replaceAll("\\", "/");
    return {
      sourcePath: absolute,
      sourceRoots: [SOURCE_ROOT],
      sourceRelativePaths: { [SOURCE_ROOT]: relativePath },
      sizeBytes: after.size,
      mtimeMs: after.mtimeMs,
      contentFingerprint,
    };
  });
  const latestModifiedMs = entries.reduce((latest, entry) => Math.max(latest, entry.mtimeMs), 0);
  return {
    directory,
    videoPaths: entries.length,
    latestModifiedAt: latestModifiedMs ? new Date(latestModifiedMs).toISOString() : null,
    sourceStateDigest: folderVideoSourceStateDigest(entries),
    entries,
  };
}

export function validateRefCardsIngestReceipt({
  ingestReport = {},
  sourceSnapshot = {},
  mediaLibrary = {},
  sourceFolder = SOURCE_FOLDER,
} = {}) {
  if (ingestReport.dryRun === true) throw new Error("Ref Cards compilation requires a persisted non-dry-run ingest report.");
  if (list(ingestReport.errors).length) throw new Error("Ref Cards compilation rejects ingest reports with errors.");
  const receipt = ingestReport.sourceLibraryManifest;
  if (!receipt || receipt.schemaVersion !== FOLDER_VIDEO_SOURCE_MANIFEST_SCHEMA || receipt.persisted !== true) {
    throw new Error("Ref Cards compilation requires a persisted complete source/library manifest receipt.");
  }
  const expectedRoot = path.resolve(sourceFolder);
  const receiptRoots = list(receipt.roots).map((root) => path.resolve(String(root))).sort();
  if (receiptRoots.length !== 1 || receiptRoots[0] !== expectedRoot) {
    throw new Error(`Ref Cards ingest receipt roots do not match ${expectedRoot}.`);
  }
  if (!Number.isFinite(Date.parse(String(ingestReport.generatedAt || "")))
    || String(receipt.generatedAt || "") !== String(ingestReport.generatedAt || "")) {
    throw new Error("Ref Cards ingest receipt timestamp does not match its report.");
  }
  if (receipt.digestAlgorithm !== "sha256") throw new Error("Ref Cards ingest receipt requires SHA-256 digests.");
  if (receipt.sourceFingerprintAlgorithm !== "hapa-partial-video-v1") {
    throw new Error("Ref Cards ingest receipt requires the declared partial-video source fingerprint contract.");
  }
  if (Number(receipt.entryCount) !== list(receipt.entries).length
    || Number(receipt.entryCount) !== Number(ingestReport.sourceVideos)
    || Number(receipt.entryCount) !== Number(sourceSnapshot.videoPaths)) {
    throw new Error("Ref Cards ingest receipt count does not match the report and current source snapshot.");
  }
  const receiptStateDigest = folderVideoSourceStateDigest(receipt.entries);
  const receiptLibraryDigest = folderVideoSourceLibraryDigest(receipt.entries);
  if (receipt.sourceStateDigest !== receiptStateDigest
    || receipt.sourceLibraryDigest !== receiptLibraryDigest
    || sourceSnapshot.sourceStateDigest !== receiptStateDigest) {
    throw new Error("Ref Cards ingest receipt digest does not match the current complete source snapshot.");
  }
  const recordsById = new Map(list(mediaLibrary.records).map((record) => [String(record.id || ""), record]));
  const missingOrMismatched = [];
  for (const entry of receipt.entries) {
    const record = recordsById.get(String(entry.mediaLibraryRecordId || ""));
    if (!record
      || record.sourceKind !== "folder-video"
      || String(record.contentFingerprint || "").toLowerCase() !== entry.contentFingerprint
      || !list(record.sourceRoots).includes(SOURCE_ROOT)
      || !record.asset?.uri) {
      missingOrMismatched.push(entry.sourcePath);
    }
  }
  if (missingOrMismatched.length) {
    throw new Error(`Ref Cards ingest receipt does not resolve to matching media-library records: ${missingOrMismatched.slice(0, 5).join(", ")}`);
  }
  return {
    verified: true,
    sourcePaths: receipt.entryCount,
    uniqueMediaLibraryRecords: new Set(receipt.entries.map((entry) => entry.mediaLibraryRecordId)).size,
    sourceStateDigest: receiptStateDigest,
    sourceLibraryDigest: receiptLibraryDigest,
  };
}

async function exclusiveWriteJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(json(payload), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stablePolicyValue(value) {
  if (Array.isArray(value)) return value.map(stablePolicyValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stablePolicyValue(value[key])]));
}

export function computeRefCardsDirectionPolicyDigest(policy = REF_CARDS_DIRECTION_POLICY) {
  return sha256Bytes(Buffer.from(JSON.stringify(stablePolicyValue(policy))));
}

export const REF_CARDS_DIRECTION_POLICY_DIGEST = computeRefCardsDirectionPolicyDigest();

export async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

export function computeRefCardsBatchFingerprint(rows = []) {
  const tuples = rows.map((row) => [
    String(row.recordId || ""),
    String(row.relativePath || ""),
    String(row.sha256 || "").toLowerCase(),
  ].join("\u0000")).sort();
  if (!tuples.length || tuples.some((tuple) => !/[a-f0-9]{64}$/u.test(tuple.slice(-64)))) {
    throw new Error("Ref Cards batch fingerprint requires at least one true full-file SHA-256 identity.");
  }
  return sha256Bytes(Buffer.from(tuples.join("\n")));
}

export function buildRefCardsCutConfigurations(
  batchFingerprint,
  policyDigest = REF_CARDS_DIRECTION_POLICY_DIGEST,
) {
  const digest = String(batchFingerprint || "").toLowerCase();
  const normalizedPolicyDigest = String(policyDigest || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("A full Ref Cards batch fingerprint is required.");
  if (!/^[a-f0-9]{64}$/u.test(normalizedPolicyDigest)) throw new Error("A full Ref Cards directing-policy digest is required.");
  const familyDigest = sha256Bytes(Buffer.from(`${digest}\u0000${normalizedPolicyDigest}`));
  const familyId = `ref-cards-expanded-${familyDigest.slice(0, 12)}`;
  const variationSet = Object.freeze({
    id: familyId,
    label: "Ref Cards Run 1 · Transition Recovery",
    batchFingerprint: `sha256:${digest}`,
    directingPolicyDigest: `sha256:${normalizedPolicyDigest}`,
    directingPolicyVersion: REF_CARDS_DIRECTION_POLICY.schemaVersion,
    sourceRoot: SOURCE_ROOT,
    appendOnly: true,
  });
  return REF_CARDS_CUT_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    id: `${familyId}-${blueprint.key}-v1`,
    title: `Ref Cards Transition Recovery · ${blueprint.label}`,
    variationSet,
    cut: { ordinal: blueprint.ordinal, label: blueprint.label },
  }));
}

function mediaName(uri = "") {
  const encoded = String(uri).replace(/^\/media\//u, "").split(/[?#]/u)[0];
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

async function discoverMediaFiles(directory = MEDIA, relative = "") {
  const rows = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of await discoverMediaFiles(absolute, nextRelative)) rows.set(key, value);
      continue;
    }
    const info = await stat(absolute).catch(() => null);
    if (info?.isFile() && info.size > 0) {
      rows.set(nextRelative, {
        path: absolute,
        sizeBytes: info.size,
        mtimeMs: info.mtimeMs,
      });
    }
  }
  return rows;
}

function technicalByMediaName(cache = {}) {
  const output = new Map();
  for (const [sourcePath, value] of Object.entries(cache)) {
    const normalized = String(sourcePath).replaceAll("\\", "/");
    const marker = "/data/media/";
    const technical = value?.technical || value;
    if (normalized.includes(marker)) output.set(normalized.slice(normalized.lastIndexOf(marker) + marker.length), technical);
    output.set(path.basename(normalized), technical);
  }
  return output;
}

async function mapLimit(values, limit, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return output;
}

async function probeVideo(filePath) {
  const { stdout } = await execFile("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,pix_fmt,width,height,avg_frame_rate:format=duration",
    "-of", "json",
    filePath,
  ], { maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const video = parsed.streams?.[0] || {};
  return {
    codec: String(video.codec_name || ""),
    pixelFormat: String(video.pix_fmt || ""),
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    duration: Number(parsed.format?.duration || 0),
    frameRate: String(video.avg_frame_rate || ""),
  };
}

function refCardRecords(mediaLibrary = {}) {
  return list(mediaLibrary.records).filter((record) => (
    record?.sourceKind === "folder-video"
    && list(record.sourceRoots).includes(SOURCE_ROOT)
    && record?.asset?.uri
  )).sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function sourceRelativePath(record = {}) {
  return String(
    record.sourceRelativePaths?.[SOURCE_ROOT]
      || record.asset?.metadata?.folderIngest?.sourceRelativePaths?.[SOURCE_ROOT]
      || path.basename(record.asset?.metadata?.folderIngest?.sourcePath || record.name || record.id || ""),
  ).replaceAll("\\", "/");
}

async function buildRefCardCandidates(mediaLibrary, mediaFiles, hashCache) {
  const records = refCardRecords(mediaLibrary);
  let cacheHits = 0;
  let diskHashes = 0;
  let processed = 0;
  const candidates = await mapLimit(records, 6, async (record, index) => {
    const asset = record.asset || {};
    const relativeMediaPath = mediaName(asset.uri);
    const file = mediaFiles.get(relativeMediaPath);
    if (!file) throw new Error(`Ref Cards asset is not locally readable: ${asset.uri}`);
    const technical = await probeVideo(file.path);
    if (
      technical.codec !== "h264"
      || technical.pixelFormat !== "yuv420p"
      || technical.duration < 2.5
      || Math.min(technical.width, technical.height) < 360
    ) {
      throw new Error(`Ref Cards asset failed browser/render eligibility: ${record.id} (${JSON.stringify(technical)})`);
    }

    const partialFingerprint = String(record.contentFingerprint || asset.metadata?.folderIngest?.contentFingerprint || "");
    const cached = hashCache.entries?.[relativeMediaPath];
    let sha256 = cached?.sizeBytes === file.sizeBytes
      && Math.abs(Number(cached?.mtimeMs || 0) - file.mtimeMs) < 1
      && cached?.partialFingerprint === partialFingerprint
      && /^[a-f0-9]{64}$/u.test(String(cached?.sha256 || ""))
      ? cached.sha256
      : "";
    if (sha256) cacheHits += 1;
    else {
      sha256 = await sha256File(file.path);
      diskHashes += 1;
    }
    hashCache.entries[relativeMediaPath] = {
      sizeBytes: file.sizeBytes,
      mtimeMs: file.mtimeMs,
      partialFingerprint,
      sha256,
      verifiedAt: RUN_AT,
    };
    processed += 1;
    if (processed % 50 === 0 || processed === records.length) {
      console.error(`[ref-cards-expanded] verified ${processed}/${records.length} true media hashes (${cacheHits} cache hits, ${diskHashes} disk hashes)`);
    }

    const tags = [...new Set([...list(record.tags), ...list(asset.tags)])];
    const relativePath = sourceRelativePath(record);
    const cohort = refCardsSourceCohort(relativePath);
    const motionClassification = classifyRefCardsMotionRole(relativePath);
    const origin = {
      sourceSystem: "folder-video-ingest",
      sourceStore: "data/media-library.json",
      sourceKind: record.sourceKind,
      sourceRoots: record.sourceRoots,
      sourcePath: asset.metadata?.folderIngest?.sourcePath,
      sourceRelativePath: relativePath,
      recordId: record.id,
    };
    if (hasExcludedEchoDirectorOrigin(origin, record, asset, asset.metadata)) {
      throw new Error(`Forbidden provenance reached Ref Cards candidates: ${record.id}`);
    }
    return {
      id: `builder-ref-cards:${record.id}`,
      mediaLibraryId: record.id,
      cardId: record.id,
      cardKind: "media",
      cardRef: `data/media-library.json#records/${record.id}`,
      cardTitle: record.name || asset.name || record.id,
      ownerId: record.id,
      ownerTitle: record.name || asset.name || record.id,
      title: record.name || asset.name || record.id,
      uri: asset.uri,
      runtimeUri: asset.runtimeUri || asset.uri,
      posterUri: asset.metadata?.thumbnailUri || asset.metadata?.thumbnail?.uri || record.thumbnailUri || "",
      sha256,
      technicalIdentity: `sha256:${sha256}`,
      duration: technical.duration,
      width: technical.width,
      height: technical.height,
      sourceGroup: "ref-cards",
      cohort,
      ...motionClassification,
      semanticTags: tags,
      tags,
      routeOrder: index,
      autoEligible: true,
      origin,
      provenance: {
        sourceProvenance: origin,
        folderIngest: asset.metadata?.folderIngest,
        technicalIdentity: {
          algorithm: "sha256",
          fullFileBytes: true,
          digest: sha256,
          ingestFingerprintAlgorithm: "hapa-partial-video-v1",
          ingestFingerprint: partialFingerprint,
        },
      },
      technical: {
        status: "verified-source-file",
        shortEdge: Math.min(technical.width, technical.height),
        identityBasis: "full-file-sha256",
        codec: technical.codec,
        pixelFormat: technical.pixelFormat,
        frameRate: technical.frameRate,
        sourceAudioPolicy: "muted; Echo album audio remains master",
      },
      batch: {
        recordId: record.id,
        relativePath,
        sourcePath: asset.metadata?.folderIngest?.sourcePath || record.sourcePath || "",
      },
    };
  });
  return { candidates, records, cacheHits, diskHashes };
}

function knownBlankMedia(report = {}) {
  return new Set([...list(report.blockers), ...list(report.rootCauseGroups)]
    .filter((blocker) => blocker?.code === "visual-media-blank-sample" && blocker?.path)
    .map((blocker) => {
      const normalized = String(blocker.path).replaceAll("\\", "/");
      const marker = "/data/media/";
      return normalized.includes(marker)
        ? normalized.slice(normalized.lastIndexOf(marker) + marker.length)
        : path.basename(normalized);
    }));
}

function candidateIdentity(candidate = {}) {
  return candidate.technicalIdentity
    || (candidate.sha256 ? `sha256:${candidate.sha256}` : `uri:${String(candidate.uri || "").toLowerCase()}`);
}

function dedupeCandidates(groups, blankMedia) {
  const used = new Set();
  const output = [];
  for (const group of REF_CARDS_SOURCE_GROUPS) {
    for (const candidate of groups[group] || []) {
      if (blankMedia.has(mediaName(candidate.uri))) continue;
      if (hasExcludedEchoDirectorOrigin(candidate.origin, candidate.provenance, candidate.sourceProvenance)) continue;
      const identity = candidateIdentity(candidate);
      if (!identity || used.has(identity)) continue;
      used.add(identity);
      output.push(candidate);
    }
  }
  return output;
}

function variantFingerprint(variant = {}) {
  return sha256Bytes(Buffer.from(JSON.stringify({
    schemaVersion: variant.schemaVersion,
    id: variant.id,
    parent: variant.parent,
    seed: variant.seed,
    variationSet: variant.variationSet,
    cut: variant.cut,
    sourcePolicy: variant.sourcePolicy,
    timeline: variant.timeline,
    visualizerTimeline: variant.visualizer_timeline,
    hyperframeScript: variant.hyperframe_script,
  })));
}

function indexRow(songId, variant) {
  return {
    id: `${songId}:${variant.id}`,
    songId,
    variantId: variant.id,
    title: variant.title,
    schemaVersion: variant.schemaVersion,
    relativePath: `${songId}/${variant.id}.json`,
    parentProjectSha256: variant.parent?.projectSha256 || "",
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
    status: variant.status,
    timelineCount: list(variant.timeline).length,
    hasHyperframeScript: Boolean(variant.hyperframe_script),
    variationSet: variant.variationSet,
    cut: variant.cut,
    sourcePolicy: variant.sourcePolicy,
    replacementShots: variant.telemetry?.replacementShots,
    sourceSelections: variant.telemetry?.selectionsBySource,
    uniqueMedia: variant.telemetry?.uniqueMedia,
    mediaBearingShots: variant.telemetry?.mediaBearingShots,
    visualizerOnlyShots: variant.telemetry?.visualizerOnlyShots,
    actualVideoRatio: variant.telemetry?.actualVideoRatio,
    videoCoverageSeconds: variant.telemetry?.videoCoverageSeconds,
    videoEventsPerMinute: variant.telemetry?.videoEventsPerMinute,
    previouslyUnseenSelections: variant.telemetry?.previouslyUnseenSelections,
    telemetry: variant.telemetry,
    fingerprint: variantFingerprint(variant),
  };
}

function usageSummary(candidates, usageCounts) {
  const counts = candidates.map((candidate) => Number(usageCounts.get(candidate.technicalIdentity) || 0));
  return {
    eligible: candidates.length,
    used: counts.filter((count) => count > 0).length,
    unused: counts.filter((count) => count === 0).length,
    minimumUses: counts.length ? Math.min(...counts) : 0,
    maximumUses: counts.length ? Math.max(...counts) : 0,
    totalUses: counts.reduce((sum, count) => sum + count, 0),
  };
}

async function snapshotFiles(rows) {
  const snapshots = new Map();
  for (const row of rows) {
    const filePath = path.join(VARIANTS, row.relativePath);
    snapshots.set(filePath, sha256Bytes(await readFile(filePath)));
  }
  return snapshots;
}

async function changedSnapshots(snapshots) {
  const changed = [];
  for (const [filePath, before] of snapshots) {
    const after = sha256Bytes(await readFile(filePath));
    if (after !== before) changed.push(filePath);
  }
  return changed;
}

async function main() {
  const [
    mediaLibrary,
    itemStore,
    sceneStore,
    avatarStore,
    tarotStore,
    referenceCatalog,
    technicalCache,
    renderReadiness,
    ingestReport,
    existingIndex,
    existingHashCache,
    mediaFiles,
    sourceSnapshot,
  ] = await Promise.all([
    readJson(MEDIA_LIBRARY_PATH),
    readJson(path.join(DATA, "item-manager-store.json")),
    readJson(path.join(DATA, "scene-store.json")),
    readJson(path.join(DATA, "avatar-store.json")),
    readJson(path.join(DATA, "tarot-store.json")),
    readJson(path.join(DATA, "echo-reference-animated-media.json")),
    readJson(path.join(ROOT, "artifacts/echo-media-affordances/technical-cache-v2.json"), {}),
    readJson(path.join(ROOT, "artifacts/echo-render-readiness/report.json"), {}),
    readJson(INGEST_REPORT_PATH, {}),
    readJson(INDEX_PATH, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [] }),
    readJson(HASH_CACHE_PATH, { schemaVersion: "hapa.ref-cards-expanded-direction-hash-cache.v1", entries: {} }),
    discoverMediaFiles(),
    discoverSourceVideoSnapshot(),
  ]);
  const ingestReceiptValidation = validateRefCardsIngestReceipt({
    ingestReport,
    sourceSnapshot,
    mediaLibrary,
  });
  const hashCache = {
    schemaVersion: "hapa.ref-cards-expanded-direction-hash-cache.v1",
    entries: { ...(existingHashCache.entries || {}) },
    updatedAt: RUN_AT,
  };
  const refExtraction = await buildRefCardCandidates(mediaLibrary, mediaFiles, hashCache);
  const refFrameValidation = await mapLimit(refExtraction.records, 8, async (record) => ({
    recordId: record.id,
    complete: await folderVideoHasReadableCompleteFrameSet(
      record.asset?.metadata?.frames,
      record.contentFingerprint,
      { mediaDirectory: MEDIA },
    ),
  }));
  const refFrameGaps = refFrameValidation.filter((row) => !row.complete);
  if (refFrameGaps.length) {
    throw new Error(`Ref Cards compilation requires readable content-bound first/mid/last frames; ${refFrameGaps.length} record(s) failed: ${refFrameGaps.slice(0, 8).map((row) => row.recordId).join(", ")}`);
  }
  const refByHash = new Map();
  for (const candidate of refExtraction.candidates) {
    if (!refByHash.has(candidate.technicalIdentity)) refByHash.set(candidate.technicalIdentity, candidate);
  }
  const refCandidates = [...refByHash.values()];
  const duplicateRefRecords = refExtraction.candidates.length - refCandidates.length;
  if (!refCandidates.length) throw new Error("No Ref Cards media survived the full-file identity pass.");

  const batchFingerprint = computeRefCardsBatchFingerprint(refCandidates.map((candidate) => ({
    recordId: candidate.cardId,
    relativePath: candidate.batch.relativePath,
    sha256: candidate.sha256,
  })));
  const cuts = buildRefCardsCutConfigurations(batchFingerprint);
  const availableMediaFiles = new Set(mediaFiles.keys());
  const shared = {
    minShortEdge: 512,
    minDurationSeconds: 2.5,
    availableMediaFiles,
    technicalByFileName: technicalByMediaName(technicalCache),
    originPredicate: hasExcludedEchoDirectorOrigin,
    requireBrowserSafePixelFormat: true,
  };
  const groups = {
    "ref-cards": refCandidates,
    reference: buildReferenceDirectorCandidates(referenceCatalog, {
      ...shared,
      requireVerifiedTechnical: true,
      verifiedTechnicalStatuses: ["verified-source-file", "verified"],
    }),
    scroll: buildScrollDirectorCandidatesFromLibrary(mediaLibrary, {
      ...shared,
      requireVerifiedTechnical: true,
      verifiedTechnicalStatuses: ["verified-source-file", "verified"],
    }),
    scene: buildSceneDirectorCandidates(sceneStore, {
      ...shared,
      requireSceneItemCard: false,
      requireVerifiedTechnical: true,
      verifiedTechnicalStatuses: ["verified-source-file", "verified"],
    }),
    avatar: buildAvatarDirectorCandidates(avatarStore, {
      ...shared,
      requireVerifiedTechnical: false,
    }),
    deevid: buildDeevidDirectorCandidates(itemStore, {
      ...shared,
      requireVerifiedTechnical: true,
      verifiedTechnicalStatuses: ["verified-source-file", "verified"],
    }),
    tarot: buildTarotDirectorCandidates(tarotStore, {
      ...shared,
      requireVerifiedTechnical: true,
      verifiedTechnicalStatuses: ["verified-source-file", "verified"],
    }),
  };
  const blankMedia = knownBlankMedia(renderReadiness);
  const candidates = dedupeCandidates(groups, blankMedia);
  const candidateCounts = Object.fromEntries(REF_CARDS_SOURCE_GROUPS.map((group) => [
    group,
    candidates.filter((candidate) => candidate.sourceGroup === group).length,
  ]));
  if (Object.values(candidateCounts).some((count) => count === 0)) {
    throw new Error(`Every allowed source group must remain eligible: ${JSON.stringify(candidateCounts)}`);
  }
  const selectedRefCandidates = candidates.filter((candidate) => candidate.sourceGroup === "ref-cards");
  if (selectedRefCandidates.length !== refCandidates.length) {
    throw new Error(`Ref Cards content dedupe unexpectedly removed ${refCandidates.length - selectedRefCandidates.length} media record(s).`);
  }
  const refMotionRoleCounts = Object.fromEntries(["transition", "loop"].map((motionRole) => [
    motionRole,
    selectedRefCandidates.filter((candidate) => candidate.motionRole === motionRole).length,
  ]));
  if (!refMotionRoleCounts.transition || !refMotionRoleCounts.loop) {
    throw new Error(`Ref Cards transition recovery requires both action-transition and hold candidates: ${JSON.stringify(refMotionRoleCounts)}`);
  }

  const diskIndexRows = discoverDirectionVariantIndexRows({ variantsDirectory: VARIANTS });
  const existingIndexIds = new Set(list(existingIndex.variants).map((row) => row.id));
  const recoveredIndexRows = diskIndexRows.filter((row) => !existingIndexIds.has(row.id));
  mergeDirectionVariantIndexRows(existingIndex.variants, diskIndexRows, []);
  const immutableVariantSnapshots = await snapshotFiles(diskIndexRows);

  const gatedManifest = loadGatedEchoIsfManifest();
  const projectFiles = (await readdir(PROJECTS))
    .filter((name) => name.endsWith("-video-project.json"))
    .filter((name) => !TARGET_SONG_ID || name === `${TARGET_SONG_ID}-video-project.json`)
    .sort();
  if (!projectFiles.length) throw new Error("No Echo Album projects matched this Director-cut pass.");
  const generated = [];
  const usageCounts = new Map();
  const cardUsageCounts = new Map();
  const projectHashesBefore = new Map();
  let shaderReplacements = 0;
  for (const fileName of projectFiles) {
    const projectPath = path.join(PROJECTS, fileName);
    const bytes = await readFile(projectPath);
    projectHashesBefore.set(projectPath, sha256Bytes(bytes));
    const payload = JSON.parse(bytes.toString("utf8"));
    const sourceProject = payload.music_video_project || payload;
    const shaderRepair = repairEchoProjectShaders(sourceProject, gatedManifest.manifest);
    shaderReplacements += Number(shaderRepair.shaderRepair?.replacementCount || 0);
    const project = shaderRepair.projectBody;
    const parentSha256 = sha256Bytes(bytes);
    for (const cut of cuts) {
      const variantPath = path.join(VARIANTS, project.song_id, `${cut.id}.json`);
      const existing = await readJson(variantPath, null).catch((error) => (
        error?.code === "ENOENT" ? null : Promise.reject(error)
      ));
      const variant = recastBalancedEchoDirectorProject(project, candidates, {
        variantId: cut.id,
        title: cut.title,
        seed: `${project.song_id}:${cut.id}:media-recast`,
        parentProjectHash: parentSha256,
        createdAt: RUN_AT,
        variationSet: cut.variationSet,
        cut: cut.cut,
        allowedSourceGroups: REF_CARDS_SOURCE_GROUPS,
        sourcePattern: cut.pattern,
        rotateSourcePattern: false,
        forbiddenProvenanceLineages: ["hapa-dev-proto", "hell-week"],
        sharedUsageCounts: usageCounts,
        sharedCardUsageCounts: cardUsageCounts,
      });
      if (existing && variantFingerprint(existing) !== variantFingerprint(variant)) {
        throw new Error(`Append-only conflict at ${variantPath}; choose a new content-derived family ID.`);
      }
      if (!variant.selectionEvidence.some((selection) => selection.sourceGroup === "ref-cards")) {
        throw new Error(`${project.song_id}:${cut.id} did not select Ref Cards media.`);
      }
      generated.push({
        songId: project.song_id,
        cut,
        variantPath,
        existing: Boolean(existing),
        variant: existing || variant,
        generatedVariant: variant,
      });
    }
    const projectRows = generated.filter((row) => row.songId === project.song_id);
    const selectedGroups = new Set(projectRows.flatMap((row) => (
      row.generatedVariant.selectionEvidence.map((selection) => selection.sourceGroup)
    )));
    const missingGroups = REF_CARDS_SOURCE_GROUPS.filter((group) => !selectedGroups.has(group));
    if (missingGroups.length) throw new Error(`${project.song_id} cut family missed groups: ${missingGroups.join(", ")}`);
  }

  const refUsage = usageSummary(selectedRefCandidates, usageCounts);
  const refUsageByMotionRole = Object.fromEntries(["transition", "loop"].map((motionRole) => [
    motionRole,
    usageSummary(selectedRefCandidates.filter((candidate) => candidate.motionRole === motionRole), usageCounts),
  ]));
  const transitionMeanUses = refUsageByMotionRole.transition.eligible
    ? refUsageByMotionRole.transition.totalUses / refUsageByMotionRole.transition.eligible
    : 0;
  const loopMeanUses = refUsageByMotionRole.loop.eligible
    ? refUsageByMotionRole.loop.totalUses / refUsageByMotionRole.loop.eligible
    : 0;
  if (!TARGET_SONG_ID && refUsage.unused) {
    throw new Error(`Expanded cut family left ${refUsage.unused} Ref Cards media record(s) unused.`);
  }
  if (!TARGET_SONG_ID && transitionMeanUses < loopMeanUses * 1.5) {
    throw new Error(`Action-transition candidates were not weighted materially above holds (${transitionMeanUses.toFixed(3)} vs ${loopMeanUses.toFixed(3)} mean uses).`);
  }
  const incomingRows = generated.map((row) => indexRow(row.songId, row.variant));
  const nextIndexRows = mergeDirectionVariantIndexRows(existingIndex.variants, diskIndexRows, incomingRows);
  const stableBatchMetadata = {
    variationSetId: cuts[0].variationSet.id,
    batchFingerprint: `sha256:${batchFingerprint}`,
    directingPolicyDigest: `sha256:${REF_CARDS_DIRECTION_POLICY_DIGEST}`,
    directingPolicyVersion: REF_CARDS_DIRECTION_POLICY.schemaVersion,
    cutIds: cuts.map((cut) => cut.id),
    sourceRoot: SOURCE_ROOT,
  };
  const currentStableBatchMetadata = existingIndex.refCardsExpandedBatch ? {
    variationSetId: existingIndex.refCardsExpandedBatch.variationSetId,
    batchFingerprint: existingIndex.refCardsExpandedBatch.batchFingerprint,
    directingPolicyDigest: existingIndex.refCardsExpandedBatch.directingPolicyDigest,
    directingPolicyVersion: existingIndex.refCardsExpandedBatch.directingPolicyVersion,
    cutIds: existingIndex.refCardsExpandedBatch.cutIds,
    sourceRoot: existingIndex.refCardsExpandedBatch.sourceRoot,
  } : null;
  const indexRowsChanged = JSON.stringify(list(existingIndex.variants)) !== JSON.stringify(nextIndexRows);
  const indexBatchChanged = JSON.stringify(currentStableBatchMetadata) !== JSON.stringify(stableBatchMetadata);
  const indexNeedsWrite = indexRowsChanged || indexBatchChanged;
  const nextIndex = indexNeedsWrite ? {
    ...existingIndex,
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: nextIndexRows,
    updatedAt: RUN_AT,
    refCardsExpandedBatch: {
      ...stableBatchMetadata,
      generatedAt: RUN_AT,
    },
  } : existingIndex;
  const forbidden = candidates.filter((candidate) => (
    hasExcludedEchoDirectorOrigin(candidate.origin, candidate.provenance, candidate.sourceProvenance)
  ));
  const report = {
    schemaVersion: "hapa.ref-cards-expanded-direction-report.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    sourceFolder: SOURCE_FOLDER,
    sourceRoot: SOURCE_ROOT,
    variationSet: cuts[0].variationSet,
    policy: {
      sourceGroups: REF_CARDS_SOURCE_GROUPS,
      excludedOrigins: ["hapa-dev-proto", "hell-week"],
      excludedKnownBlankMedia: [...blankMedia].sort(),
      mediaIdentity: "true full-file SHA-256; ingest partial fingerprints retained only as ingest lineage",
      browserSafety: "every Ref Cards source is ffprobe-verified H.264/yuv420p with >=360px short edge",
      sourceAudio: "muted by the Echo playback/render contract; the album track remains audio master",
      cameraTransitionsLyricsStems: "inherited unchanged from each immutable base project",
      refCardsMotionRoles: "explicit transition-like source names are high-motion scene candidates, never endpoint certification; ordinary holds remain 1x and action-transition candidates receive a 2x editorial-motion coverage weight",
      directingPolicy: REF_CARDS_DIRECTION_POLICY,
      directingPolicyDigest: `sha256:${REF_CARDS_DIRECTION_POLICY_DIGEST}`,
      shaderSafety: "pixel-gate quarantine repaired before each append-only cut is generated",
      appendOnly: true,
    },
    ingest: {
      freshSourceSnapshot: {
        directory: sourceSnapshot.directory,
        videoPaths: sourceSnapshot.videoPaths,
        latestModifiedAt: sourceSnapshot.latestModifiedAt,
        sourceStateDigest: sourceSnapshot.sourceStateDigest,
      },
      receiptValidation: ingestReceiptValidation,
      sourceVideoPaths: Number(ingestReport.sourceVideos || 0),
      uniqueHapaMediaRecords: refExtraction.records.length,
      contentAliasPaths: Math.max(0, Number(ingestReport.sourceVideos || 0) - refExtraction.records.length),
      missingFrameSets: refFrameGaps.length,
      ingestErrors: list(ingestReport.errors).length,
      mediaLibraryRecords: list(mediaLibrary.records).length,
    },
    candidates: {
      bySourceGroup: candidateCounts,
      total: candidates.length,
      refCardRecords: refExtraction.records.length,
      refCardsAfterFullHashDeduplication: refCandidates.length,
      refCardsByMotionRole: refMotionRoleCounts,
      duplicateRefRecords,
      fullHashesReadFromCache: refExtraction.cacheHits,
      fullHashesReadFromDisk: refExtraction.diskHashes,
      forbiddenSurviving: forbidden.length,
      refCardsByCohort: Object.fromEntries(["ref-cards-run-1/root", "ref-cards-run-1/run2", "ref-cards-run-1/run2/run3"].map((cohort) => [
        cohort,
        selectedRefCandidates.filter((candidate) => candidate.cohort === cohort).length,
      ])),
      refCardUsage: refUsage,
      refCardUsageByMotionRole: refUsageByMotionRole,
      refCardMeanUsesByMotionRole: {
        transition: Number(transitionMeanUses.toFixed(6)),
        loop: Number(loopMeanUses.toFixed(6)),
      },
    },
    variants: {
      projects: projectFiles.length,
      cutFamilies: cuts.map(({ id, title, key, variationSet, cut }) => ({ id, title, key, variationSet, cut })),
      generated: generated.length,
      newFiles: generated.filter((row) => !row.existing).length,
      existingIdentical: generated.filter((row) => row.existing).length,
      shaderQuarantineReplacementsBaked: shaderReplacements,
      selectionsBySource: Object.fromEntries(REF_CARDS_SOURCE_GROUPS.map((group) => [
        group,
        generated.reduce((sum, row) => sum + Number(row.generatedVariant.telemetry?.selectionsBySource?.[group] || 0), 0),
      ])),
      uniqueSelectedMedia: new Set(generated.flatMap((row) => (
        row.generatedVariant.selectionEvidence.map((entry) => entry.technicalIdentity)
      ))).size,
    },
    index: {
      beforeRows: list(existingIndex.variants).length,
      authoritativeDiskRowsBefore: diskIndexRows.length,
      previouslyUnindexedRowsRecovered: recoveredIndexRows.length,
      afterRows: nextIndexRows.length,
      writeRequired: indexNeedsWrite,
    },
    validation: {
      allProjectsHaveAllThreeCuts: generated.length === projectFiles.length * cuts.length,
      everyCutUsesRefCards: generated.every((row) => row.generatedVariant.selectionEvidence.some((selection) => (
        selection.sourceGroup === "ref-cards"
      ))),
      everyProjectFamilyUsesEverySourceGroup: [...new Set(generated.map((row) => row.songId))].every((songId) => {
        const rows = generated.filter((row) => row.songId === songId);
        return REF_CARDS_SOURCE_GROUPS.every((group) => rows.some((row) => (
          row.generatedVariant.selectionEvidence.some((selection) => selection.sourceGroup === group)
        )));
      }),
      everyUniqueRefCardUsed: TARGET_SONG_ID ? null : refUsage.unused === 0,
      noImmediateMediaRepeats: generated.every((row) => row.generatedVariant.telemetry?.immediateMediaRepeats === 0),
      noExcludedOrigins: forbidden.length === 0,
      noKnownBlankMediaSelected: generated.every((row) => row.generatedVariant.selectionEvidence.every((selection) => (
        !blankMedia.has(mediaName(selection.uri))
      ))),
      trueFullHashIdentity: selectedRefCandidates.every((candidate) => (
        candidate.technical?.identityBasis === "full-file-sha256"
        && candidate.technicalIdentity === `sha256:${candidate.sha256}`
      )),
      mediaRoutesReadable: selectedRefCandidates.every((candidate) => mediaFiles.has(mediaName(candidate.uri))),
      frameSetsComplete: refFrameGaps.length === 0,
      freshSourceRescanMatchesIngest: sourceSnapshot.videoPaths === Number(ingestReport.sourceVideos || 0)
        && sourceSnapshot.sourceStateDigest === ingestReceiptValidation.sourceStateDigest,
      actionTransitionsReceiveHigherEditorialWeight: selectedRefCandidates
        .filter((candidate) => candidate.motionRole === "transition")
        .every((candidate) => candidate.editorialMotionWeight > 1),
      actionTransitionsMateriallyOutrankHolds: TARGET_SONG_ID ? null : transitionMeanUses >= loopMeanUses * 1.5,
      originalProjectsMutated: 0,
      existingVariantFilesMutated: 0,
      indexMatchesDiskAfterApply: APPLY ? null : "pending-apply",
    },
    outputs: {
      variantsDirectory: VARIANTS,
      variantIndex: INDEX_PATH,
      hashCache: HASH_CACHE_PATH,
    },
    generatedAt: RUN_AT,
  };

  let backupDirectory = "";
  if (APPLY) {
    const preApplySourceSnapshot = await discoverSourceVideoSnapshot();
    const preApplyReceiptValidation = validateRefCardsIngestReceipt({
      ingestReport,
      sourceSnapshot: preApplySourceSnapshot,
      mediaLibrary,
    });
    if (preApplySourceSnapshot.sourceStateDigest !== sourceSnapshot.sourceStateDigest) {
      throw new Error("Ref Cards source changed during Director compilation; rerun ingest before applying.");
    }
    report.ingest.preApplySourceSnapshot = {
      directory: preApplySourceSnapshot.directory,
      videoPaths: preApplySourceSnapshot.videoPaths,
      latestModifiedAt: preApplySourceSnapshot.latestModifiedAt,
      sourceStateDigest: preApplySourceSnapshot.sourceStateDigest,
    };
    report.ingest.preApplyReceiptValidation = preApplyReceiptValidation;
    backupDirectory = path.join(BACKUPS, RUN_ID);
    await mkdir(backupDirectory, { recursive: true });
    if (await stat(INDEX_PATH).catch(() => null)) {
      await copyFile(INDEX_PATH, path.join(backupDirectory, "index.json"));
    }
    for (const row of generated.filter((entry) => !entry.existing)) {
      await exclusiveWriteJson(row.variantPath, row.generatedVariant);
    }
    const persistenceJobs = [atomicWrite(HASH_CACHE_PATH, hashCache)];
    if (indexNeedsWrite) persistenceJobs.push(atomicWrite(INDEX_PATH, nextIndex));
    await Promise.all(persistenceJobs);
  }

  const mutatedProjects = [];
  for (const [projectPath, before] of projectHashesBefore) {
    if (sha256Bytes(await readFile(projectPath)) !== before) mutatedProjects.push(projectPath);
  }
  const mutatedVariants = await changedSnapshots(immutableVariantSnapshots);
  if (mutatedProjects.length) throw new Error(`Immutable base projects changed: ${mutatedProjects.join(", ")}`);
  if (mutatedVariants.length) throw new Error(`Existing append-only cuts changed: ${mutatedVariants.join(", ")}`);
  report.validation.originalProjectsMutated = mutatedProjects.length;
  report.validation.existingVariantFilesMutated = mutatedVariants.length;
  report.backupDirectory = backupDirectory;

  if (APPLY) {
    const diskRowsAfter = discoverDirectionVariantIndexRows({ variantsDirectory: VARIANTS });
    const persistedIndex = await readJson(INDEX_PATH);
    const diskIds = diskRowsAfter.map((row) => row.id);
    const indexIds = list(persistedIndex.variants).map((row) => row.id).sort();
    report.validation.indexMatchesDiskAfterApply = JSON.stringify(diskIds) === JSON.stringify(indexIds);
    report.index.authoritativeDiskRowsAfter = diskRowsAfter.length;
    report.index.persistedRowsAfter = indexIds.length;
    if (!report.validation.indexMatchesDiskAfterApply) {
      throw new Error("Direction Variant index does not match authoritative cut files after apply.");
    }
    const reportPath = path.join(REPORTS, `${RUN_ID}.json`);
    report.outputs.report = reportPath;
    await atomicWrite(reportPath, report);
  }
  console.log(json({ ok: true, dryRun: !APPLY, ...report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
