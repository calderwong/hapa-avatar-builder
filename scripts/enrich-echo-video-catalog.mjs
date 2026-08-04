#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION,
  classifyLoop,
  classifySourcePrior,
  classifyTransition,
  normalizeCanonicalTags,
  scoreChainEdge,
  scoreIntrinsicQuality,
} from "../src/domain/echo-video-enrichment.js";
import { buildEchoVideoEnrichmentCatalog } from "../src/domain/echo-enrichment-director-variant.js";
import { parseVisionToolOutput } from "../src/domain/vision-output.js";

const execFile = promisify(execFileCallback);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const SCHEMA_VERSION = ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION;
const DATABASE_SCHEMA_VERSION = "hapa.echo.video-enrichment-database.v1";
const MANIFEST_SCHEMA_VERSION = "hapa.echo.video-enrichment-manifest.v1";
const CHAIN_GRAPH_SCHEMA_VERSION = "hapa.echo.video-chain-graph.v1";
const REPORT_SCHEMA_VERSION = "hapa.echo.video-enrichment-report.v1";
const SOURCE_PRIOR_OVERRIDE_SCHEMA_VERSION = "hapa.echo.video-source-prior-overrides.v1";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);
const FRAME_MARKERS = ["first", "mid", "last"];
const VIDEO_REFERENCE_KEYS = new Set([
  "path",
  "sourcePath",
  "targetPath",
  "originalPath",
  "uri",
  "runtimeUri",
  "runtime_media_uri",
  "media_uri",
  "sourceUri",
  "originalUri",
  "solidUri",
  "backgroundlessUri",
  "videoUri",
  "video_uri",
  "outputPath",
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    mode: "all",
    apply: false,
    batchIndex: 0,
    batchCount: 1,
    concurrency: 3,
    visionChunkSize: 80,
    visionProvider: "auto",
    ollamaModel: "qwen3.5:2b",
    ollamaUrl: "http://127.0.0.1:11434",
    edgeThreshold: 0.65,
    maxBucketSize: 96,
    limit: null,
    mediaIds: [],
    candidateManifest: null,
    force: false,
    repoRoot: DEFAULT_REPO_ROOT,
    outputRoot: null,
    help: false,
  };
  const modes = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--prepare", "--recognize", "--repair-frames", "--finalize", "--all"].includes(value)) {
      modes.push(value === "--repair-frames" ? "repair-frames" : value.slice(2));
      continue;
    }
    if (value === "--apply") options.apply = true;
    else if (value === "--force") options.force = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--batch-index") options.batchIndex = numberArg(argv[++index], value, { minimum: 0, integer: true });
    else if (value === "--batch-count") options.batchCount = numberArg(argv[++index], value, { minimum: 1, integer: true });
    else if (value === "--concurrency") options.concurrency = numberArg(argv[++index], value, { minimum: 1, maximum: 16, integer: true });
    else if (value === "--vision-chunk-size") options.visionChunkSize = numberArg(argv[++index], value, { minimum: 1, maximum: 160, integer: true });
    else if (value === "--vision-provider") {
      options.visionProvider = requiredArg(argv[++index], value);
      if (!["auto", "ollama", "apple"].includes(options.visionProvider)) throw new Error("--vision-provider must be auto, ollama, or apple");
    }
    else if (value === "--ollama-model") options.ollamaModel = requiredArg(argv[++index], value);
    else if (value === "--ollama-url") options.ollamaUrl = requiredArg(argv[++index], value).replace(/\/$/u, "");
    else if (value === "--edge-threshold") options.edgeThreshold = numberArg(argv[++index], value, { minimum: 0, maximum: 1 });
    else if (value === "--max-bucket-size") options.maxBucketSize = numberArg(argv[++index], value, { minimum: 2, maximum: 512, integer: true });
    else if (value === "--limit") options.limit = numberArg(argv[++index], value, { minimum: 1, integer: true });
    else if (value === "--media-id") {
      const rawId = requiredArg(argv[++index], value).replace(/^sha256:/u, "");
      options.mediaIds.push(/^[a-f0-9]{64}$/iu.test(rawId) ? canonicalMediaId(rawId) : rawId);
    }
    else if (value === "--candidate-manifest") options.candidateManifest = path.resolve(requiredArg(argv[++index], value));
    else if (value === "--repo-root") options.repoRoot = path.resolve(requiredArg(argv[++index], value));
    else if (value === "--output") options.outputRoot = path.resolve(requiredArg(argv[++index], value));
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (modes.length > 1) throw new Error(`Choose exactly one mode flag, received: ${modes.join(", ")}`);
  if (modes.length === 1) options.mode = modes[0];
  if (options.batchIndex >= options.batchCount) throw new Error("--batch-index must be smaller than --batch-count");
  options.repoRoot = path.resolve(options.repoRoot);
  options.outputRoot ||= path.join(options.repoRoot, "artifacts/echo-video-enrichment-v1");
  return options;
}

function requiredArg(value, flag) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function numberArg(value, flag, { minimum = -Infinity, maximum = Infinity, integer = false } = {}) {
  requiredArg(value, flag);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${flag} received invalid value: ${value}`);
  }
  return parsed;
}

function usage() {
  return `Echo video catalog enrichment\n\nUsage:\n  node scripts/enrich-echo-video-catalog.mjs [--prepare|--recognize|--repair-frames|--finalize|--all] [--apply]\n\nModes:\n  --prepare       Discover, resolve, hash, deduplicate, probe, and materialize first/mid/last frames.\n  --recognize     Run bounded local image recognition and frame fingerprints.\n  --repair-frames Re-extract only missing/failed frame records, preserving healthy catalog rows.\n  --finalize      Build scored enrichments, bucketed chain edges, NDJSON exports, and the report.\n  --all           Run prepare, recognize, and finalize (default).\n\nSafety and batching:\n  Without --apply the command is read-only and prints a plan.\n  --batch-index N --batch-count M deterministically shards work.\n  --candidate-manifest PATH restricts prepare discovery to a schema-bound exact-source manifest.\n  --media-id ID may repeat to recompute a bounded set of content-addressed rows.\n  --vision-provider auto|ollama|apple selects local recognition; auto prefers the installed Ollama vision model.\n  --ollama-model NAME defaults to qwen3.5:2b; frames remain local.\n  --repo-root PATH and --output PATH support isolated fixtures.\n  --limit N bounds a local proof; --force recomputes completed stage work.\n`;
}

export function normalizeMarker(value) {
  const marker = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (["first", "start", "entry", "opening", "first-frame"].includes(marker)) return "first";
  if (["mid", "middle", "center", "sample", "mid-frame", "middle-frame"].includes(marker)) return "mid";
  if (["last", "end", "exit", "closing", "last-frame"].includes(marker)) return "last";
  return "";
}

export function canonicalMediaId(sha256) {
  const hash = String(sha256 || "").trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid archival SHA-256: ${sha256}`);
  return `hapa-media:sha256:${hash}`;
}

export function shardForKey(value, batchCount = 1) {
  if (batchCount <= 1) return 0;
  const digest = createHash("sha256").update(String(value || "")).digest();
  return digest.readUInt32BE(0) % batchCount;
}

function inShard(value, options) {
  return shardForKey(value, options.batchCount) === options.batchIndex;
}

function now() {
  return new Date().toISOString();
}

export function stableBatchGeneratedAt(priorReport, batchFingerprint, fallback = now()) {
  const priorFingerprint = String(priorReport?.batchFingerprint || "");
  const priorGeneratedAt = String(priorReport?.generatedAt || "");
  return priorFingerprint === String(batchFingerprint || "") && Number.isFinite(Date.parse(priorGeneratedAt))
    ? new Date(priorGeneratedAt).toISOString()
    : new Date(fallback).toISOString();
}

function json(value, fallback = null) {
  if (value === undefined) return JSON.stringify(fallback);
  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function semanticallyEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values.flat(Infinity) : [values]).filter((value) => value !== null && value !== undefined && value !== ""))];
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && entry !== undefined) : [];
}

function uniqueObjects(values, key = (value) => JSON.stringify(value)) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    if (!value) continue;
    const identity = key(value);
    if (seen.has(identity)) continue;
    seen.add(identity);
    output.push(value);
  }
  return output;
}

function normalizePathValue(value) {
  return path.normalize(String(value || "")).replaceAll("\\", "/");
}

function extensionForReference(value) {
  const source = String(value || "");
  let raw = source.split("#")[0].split("?")[0];
  try {
    const parsed = new URL(source, "http://127.0.0.1");
    raw = parsed.searchParams.get("path") || parsed.searchParams.get("src") || parsed.pathname || raw;
  } catch {
    // Plain filesystem references continue through the path extension fallback.
  }
  try {
    return path.extname(decodeURIComponent(raw)).toLowerCase();
  } catch {
    return path.extname(raw).toLowerCase();
  }
}

function isVideoReference(value) {
  return typeof value === "string" && VIDEO_EXTENSIONS.has(extensionForReference(value));
}

function isImageReference(value) {
  return typeof value === "string" && IMAGE_EXTENSIONS.has(extensionForReference(value));
}

async function readableFile(filePath) {
  try {
    const info = await stat(filePath);
    await access(filePath);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

async function readJsonOptional(filePath, state) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") state.warnings.push(`Could not read ${filePath}: ${error.message}`);
    return null;
  }
}

async function listJsonFiles(directory, recursive = false) {
  const output = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && recursive) output.push(...await listJsonFiles(target, true));
    else if (entry.isFile() && entry.name.endsWith(".json")) output.push(target);
  }
  return output;
}

function databasePath(options) {
  return path.join(options.outputRoot, "catalog.sqlite3");
}

function openDatabase(options, { readOnly = false } = {}) {
  const db = new DatabaseSync(databasePath(options), readOnly ? { readOnly: true } : {});
  if (!readOnly) initializeDatabase(db);
  return db;
}

function initializeDatabase(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 30000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      mode TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      batch_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      settings_json TEXT NOT NULL,
      report_json TEXT
    );
    CREATE TABLE IF NOT EXISTS hash_cache (
      path TEXT PRIMARY KEY,
      size_bytes INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      sha256 TEXT NOT NULL,
      basis TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS videos (
      media_id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      canonical_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      title TEXT NOT NULL,
      duration_sec REAL,
      width INTEGER,
      height INTEGER,
      fps REAL,
      codec TEXT,
      pixel_format TEXT,
      decode_status TEXT NOT NULL,
      aliases_json TEXT NOT NULL,
      uris_json TEXT NOT NULL,
      source_kinds_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      relationships_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      technical_json TEXT NOT NULL,
      reference_policy_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS frames (
      frame_id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES videos(media_id) ON DELETE CASCADE,
      marker TEXT NOT NULL CHECK(marker IN ('first','mid','last')),
      at_seconds REAL,
      path TEXT NOT NULL,
      uri TEXT,
      source TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      fingerprint_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(media_id, marker)
    );
    CREATE TABLE IF NOT EXISTS recognition (
      frame_id TEXT PRIMARY KEY REFERENCES frames(frame_id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES videos(media_id) ON DELETE CASCADE,
      marker TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      text_lines_json TEXT NOT NULL,
      labels_json TEXT NOT NULL,
      fingerprint_json TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      recognized_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enrichments (
      media_id TEXT PRIMARY KEY REFERENCES videos(media_id) ON DELETE CASCADE,
      schema_version TEXT NOT NULL,
      status TEXT NOT NULL,
      synopsis TEXT NOT NULL,
      semantic_json TEXT NOT NULL,
      quality_json TEXT NOT NULL,
      source_prior_json TEXT NOT NULL,
      continuity_json TEXT NOT NULL,
      canon_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chain_edges (
      edge_id TEXT PRIMARY KEY,
      source_media_id TEXT NOT NULL REFERENCES videos(media_id) ON DELETE CASCADE,
      target_media_id TEXT NOT NULL REFERENCES videos(media_id) ON DELETE CASCADE,
      source_frame_id TEXT NOT NULL REFERENCES frames(frame_id) ON DELETE CASCADE,
      target_frame_id TEXT NOT NULL REFERENCES frames(frame_id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      score REAL NOT NULL,
      confidence REAL NOT NULL,
      classification TEXT NOT NULL,
      bucket_keys_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      rubric_json TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_frames_media_marker ON frames(media_id, marker);
    CREATE INDEX IF NOT EXISTS idx_recognition_media_marker ON recognition(media_id, marker);
    CREATE INDEX IF NOT EXISTS idx_chain_edges_source ON chain_edges(source_media_id, score DESC);
    CREATE INDEX IF NOT EXISTS idx_chain_edges_target ON chain_edges(target_media_id, score DESC);
  `);
}

function beginRun(db, options) {
  const runId = `echo-video-enrichment:${now().replace(/[:.]/g, "-")}:${process.pid}`;
  db.prepare(`INSERT INTO runs (run_id,schema_version,mode,batch_index,batch_count,status,started_at,settings_json)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    runId,
    DATABASE_SCHEMA_VERSION,
    options.mode,
    options.batchIndex,
    options.batchCount,
    "running",
    now(),
    json({
      concurrency: options.concurrency,
      visionChunkSize: options.visionChunkSize,
      visionProvider: options.visionProvider,
      ollamaModel: options.ollamaModel,
      edgeThreshold: options.edgeThreshold,
      maxBucketSize: options.maxBucketSize,
      limit: options.limit,
      candidateManifest: options.candidateManifest ? path.basename(options.candidateManifest) : null,
      force: options.force,
    }),
  );
  return runId;
}

function finishRun(db, runId, status, report) {
  db.prepare("UPDATE runs SET status=?,completed_at=?,report_json=? WHERE run_id=?")
    .run(status, now(), json(report), runId);
}

function createState(options) {
  return {
    options,
    candidates: [],
    sourceCounts: {},
    filesRead: 0,
    timelineFiles: 0,
    timelineShots: 0,
    warnings: [],
    errors: [],
  };
}

function increment(object, key, amount = 1) {
  object[key] = Number(object[key] || 0) + amount;
}

function addCandidate(state, candidate) {
  const rawRefs = unique(candidate.rawRefs || []).filter(isVideoReference);
  if (!rawRefs.length) return;
  const sourceKind = String(candidate.sourceKind || "unknown");
  state.candidates.push({
    title: String(candidate.title || candidate.name || candidate.aliases?.[0]?.id || path.basename(rawRefs[0]) || "Untitled video"),
    rawRefs,
    aliases: uniqueObjects(candidate.aliases || [], (value) => `${value.id || ""}|${value.uri || ""}|${value.path || ""}`),
    sourceKind,
    sourceRole: String(candidate.sourceRole || "video"),
    provenance: uniqueObjects(candidate.provenance || []),
    relationships: uniqueObjects(candidate.relationships || []),
    tags: unique(candidate.tags || []).map(String),
    technical: candidate.technical && typeof candidate.technical === "object" ? candidate.technical : {},
    frames: normalizeFrameCandidates(candidate.frames || []),
    recognition: normalizeExistingRecognition(candidate.recognition || []),
    referencePolicy: candidate.referencePolicy && typeof candidate.referencePolicy === "object" ? candidate.referencePolicy : {},
    cacheSeed: candidate.cacheSeed || null,
  });
  increment(state.sourceCounts, sourceKind);
}

function normalizeFrameCandidates(frames) {
  const byMarker = new Map();
  for (const frame of Array.isArray(frames) ? frames.flat(Infinity) : []) {
    if (!frame || typeof frame !== "object") continue;
    const marker = normalizeMarker(frame.marker || frame.frame || frame.role || frame.label);
    if (!marker) continue;
    const refs = unique([
      frame.path,
      frame.uri,
      frame.storage?.path,
      frame.storage?.targetPath,
      frame.thumbnail?.path,
      frame.thumbnail?.uri,
    ]).filter((value) => typeof value === "string" && isImageReference(value));
    const normalized = {
      marker,
      refs,
      atSeconds: finite(frame.atSeconds ?? frame.time ?? frame.timestamp ?? frame.seconds),
      width: finite(frame.width),
      height: finite(frame.height),
      fingerprint: frame.fingerprint && typeof frame.fingerprint === "object" ? frame.fingerprint : null,
      source: String(frame.source || "existing-catalog-frame"),
    };
    const prior = byMarker.get(marker);
    if (!prior || frameCandidateScore(normalized) > frameCandidateScore(prior)) byMarker.set(marker, normalized);
  }
  return [...byMarker.values()].sort((left, right) => FRAME_MARKERS.indexOf(left.marker) - FRAME_MARKERS.indexOf(right.marker));
}

function frameCandidateScore(frame) {
  return Number(frame.refs?.length > 0) * 4 + Number(Boolean(frame.fingerprint)) * 2 + Number(Number.isFinite(frame.atSeconds));
}

function normalizeExistingRecognition(values) {
  const byMarker = new Map();
  for (const item of Array.isArray(values) ? values.flat(Infinity) : []) {
    if (!item || typeof item !== "object") continue;
    const marker = normalizeMarker(item.marker || item.frame || item.role);
    if (!marker) continue;
    const current = byMarker.get(marker) || {
      marker,
      ok: false,
      textLines: [],
      labels: [],
      fingerprints: [],
      raw: [],
    };
    current.ok ||= Boolean(item.ok);
    current.textLines.push(...normalizeTextLines(item.textLines || item.lines || []));
    current.labels.push(...normalizeLabels(item.labels || []));
    if (item.fingerprint && typeof item.fingerprint === "object") current.fingerprints.push(item.fingerprint);
    current.raw.push(item);
    byMarker.set(marker, current);
  }
  return [...byMarker.values()].map((item) => ({
    marker: item.marker,
    ok: item.ok,
    textLines: uniqueObjects(item.textLines, (value) => `${value.text}|${value.confidence}`),
    labels: dedupeLabels(item.labels),
    fingerprint: item.fingerprints.find((value) => value?.dhash && value?.ahash) || item.fingerprints[0] || null,
    raw: item.raw,
  }));
}

function normalizeTextLines(values) {
  return (Array.isArray(values) ? values : []).map((value) => {
    if (typeof value === "string") return { text: value.trim(), confidence: null };
    return { text: String(value?.text || value?.value || "").trim(), confidence: finite(value?.confidence) };
  }).filter((value) => value.text);
}

function normalizeLabels(values) {
  return (Array.isArray(values) ? values : []).map((value) => {
    if (typeof value === "string") return { identifier: value.trim().toLowerCase(), confidence: null };
    return {
      identifier: String(value?.identifier || value?.label || value?.name || "").trim().toLowerCase().replace(/\s+/g, "_"),
      confidence: finite(value?.confidence ?? value?.score),
    };
  }).filter((value) => value.identifier);
}

function dedupeLabels(values) {
  const byIdentifier = new Map();
  for (const label of normalizeLabels(values)) {
    const prior = byIdentifier.get(label.identifier);
    if (!prior || Number(label.confidence ?? 0) > Number(prior.confidence ?? 0)) byIdentifier.set(label.identifier, label);
  }
  return [...byIdentifier.values()].sort((left, right) => Number(right.confidence ?? 0) - Number(left.confidence ?? 0) || left.identifier.localeCompare(right.identifier));
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function videoRefsFromObject(value) {
  if (!value || typeof value !== "object") return [];
  const refs = [];
  for (const [key, candidate] of Object.entries(value)) {
    if (!VIDEO_REFERENCE_KEYS.has(key) || !isVideoReference(candidate)) continue;
    refs.push({ key, value: candidate });
  }
  return uniqueObjects(refs, (item) => `${item.key}|${item.value}`);
}

function attachmentCandidate(asset, parent, sourceKind, storeName) {
  const technical = asset?.metadata?.echosTechnicalAffordance || asset?.technical || {};
  const rawRefs = unique([
    technical.sourcePath,
    asset?.metadata?.sourcePath,
    asset?.metadata?.storage?.path,
    asset?.sourcePath,
    asset?.path,
    asset?.uri,
    asset?.runtimeUri,
  ]);
  return {
    title: asset?.title || asset?.name || parent?.title || parent?.name || asset?.id,
    rawRefs,
    aliases: [{ id: asset?.id || "", uri: asset?.uri || "", path: technical.sourcePath || asset?.metadata?.sourcePath || "" }],
    sourceKind,
    provenance: [{
      source: storeName,
      parentId: parent?.id || "",
      assetId: asset?.id || "",
      sourcePath: technical.sourcePath || asset?.metadata?.sourcePath || "",
      technicalStatus: technical.status || "",
      verifiedSource: technical.status === "verified-source-file",
    }],
    relationships: [{ ownerType: storeName, ownerId: parent?.id || "", ownerName: parent?.title || parent?.name || "", role: "video-attachment" }],
    tags: unique([...(parent?.tags || []), ...(asset?.tags || [])]),
    technical,
    frames: asset?.metadata?.frames || asset?.frames || [],
    recognition: asset?.metadata?.frameIntelligence || asset?.frameIntelligence || [],
  };
}

async function collectSourceCatalog(options) {
  const state = createState(options);
  const dataRoot = path.join(options.repoRoot, "data");
  const artifactRoot = path.join(options.repoRoot, "artifacts");

  const mediaLibraryPath = path.join(dataRoot, "media-library.json");
  const mediaLibrary = await readJsonOptional(mediaLibraryPath, state);
  if (mediaLibrary) {
    state.filesRead += 1;
    for (const record of mediaLibrary.records || []) {
      if (record?.mediaType !== "video" && record?.asset?.type !== "video") continue;
      const metadata = record.asset?.metadata || {};
      addCandidate(state, {
        title: record.name || record.asset?.title || record.id,
        rawRefs: unique([record.sourcePath, metadata.sourcePath, metadata.storage?.path, record.uri, record.asset?.uri]),
        aliases: [{ id: record.id || "", uri: record.uri || "", path: record.sourcePath || "", fingerprint: record.contentFingerprint || "" }],
        sourceKind: record.sourceKind || "media-library",
        provenance: [{
          source: "media-library",
          recordId: record.id,
          sourceKind: record.sourceKind,
          sourcePath: record.sourcePath,
          sourceRoots: record.sourceRoots || [],
          documentKind: record.documentKind,
          reviewStatus: record.reviewStatus,
        }],
        relationships: record.relationships || [],
        tags: record.tags || [],
        technical: {
          durationSec: record.duration ?? metadata.duration,
          width: record.width ?? metadata.width,
          height: record.height ?? metadata.height,
          fps: metadata.frameRate ?? metadata.fps,
          status: "indexed-source-file",
        },
        frames: metadata.frames || record.frames || [],
        recognition: metadata.frameIntelligence || record.frameIntelligence || [],
      });
    }
  }

  const technicalCachePath = path.join(artifactRoot, "echo-media-affordances/technical-cache-v2.json");
  const technicalCache = await readJsonOptional(technicalCachePath, state);
  if (technicalCache) {
    state.filesRead += 1;
    for (const [cachePath, entry] of Object.entries(technicalCache)) {
      const technical = entry?.technical || entry || {};
      if (!isVideoReference(technical.sourcePath || cachePath)) continue;
      addCandidate(state, {
        title: path.basename(technical.sourcePath || cachePath),
        rawRefs: [technical.sourcePath || cachePath],
        aliases: [{ id: technical.contentHash?.value ? `sha256:${technical.contentHash.value}` : "", path: technical.sourcePath || cachePath }],
        sourceKind: "technical-cache-v2",
        provenance: [{
          source: "technical-cache-v2",
          sourcePath: technical.sourcePath || cachePath,
          sourceProvenance: technical.sourceProvenance || {},
          technicalStatus: technical.status,
          verifiedSource: technical.status === "verified-source-file",
        }],
        technical,
        frames: [],
        cacheSeed: {
          key: entry?.key || "",
          sha256: technical.contentHash?.algorithm === "sha256" ? technical.contentHash.value : "",
        },
      });
    }
  }

  await collectAttachmentStore(path.join(dataRoot, "item-manager-store.json"), "cards", "mediaAssets", "item-attachment", "item-manager-store", state);
  await collectAttachmentStore(path.join(dataRoot, "scene-store.json"), "scenes", "assets", "scene-attachment", "scene-store", state);
  await collectTarotAttachments(path.join(dataRoot, "tarot-store.json"), state);
  await collectTimelineSources(path.join(dataRoot, "music-video-projects"), false, state);
  await collectTimelineSources(path.join(dataRoot, "music-video-project-variants"), true, state);
  await collectAnimatedReferences(path.join(dataRoot, "echo-reference-animated-media.json"), state);
  await collectVibesTransitions(path.join(dataRoot, "vibes-transition-links/queue.json"), state);
  return state;
}

async function collectCandidateManifest(options) {
  const state = createState(options);
  const manifest = JSON.parse(await readFile(options.candidateManifest, "utf8"));
  if (manifest?.schemaVersion !== "hapa.human-video-optical-frame-candidates.v1" || !Array.isArray(manifest.candidates)) {
    throw new Error("Candidate manifest must declare hapa.human-video-optical-frame-candidates.v1 with a candidates array.");
  }
  state.filesRead += 1;
  for (const candidate of manifest.candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    addCandidate(state, {
      title: candidate.videoName || candidate.name || candidate.videoId || candidate.videoKey,
      rawRefs: [candidate.sourcePath],
      aliases: [{
        id: candidate.videoId || candidate.assetId || candidate.videoKey || "",
        uri: candidate.uri || "",
        path: candidate.sourcePath || "",
        fingerprint: candidate.contentFingerprint || "",
      }],
      sourceKind: "human-enricher-optical-frame-gap",
      provenance: [{
        source: "human-enricher-optical-frame-gap-manifest",
        videoKey: candidate.videoKey || "",
        recordId: candidate.videoId || "",
        assetId: candidate.assetId || "",
        sourcePath: candidate.sourcePath || "",
        sourceUri: candidate.uri || "",
        identityAuthority: "exact-dashboard-record-source",
      }],
      relationships: candidate.ownerType || candidate.ownerId ? [{
        ownerType: candidate.ownerType || "unknown",
        ownerId: candidate.ownerId || "",
        ownerName: candidate.ownerName || "",
        role: candidate.role || "video-attachment",
      }] : [],
      technical: candidate.technical || {},
      frames: [],
      recognition: [],
      referencePolicy: {},
    });
  }
  return state;
}

async function collectPreparationSources(options) {
  return options.candidateManifest ? collectCandidateManifest(options) : collectSourceCatalog(options);
}

async function collectAttachmentStore(filePath, parentKey, assetKey, sourceKind, storeName, state) {
  const payload = await readJsonOptional(filePath, state);
  if (!payload) return;
  state.filesRead += 1;
  for (const parent of payload[parentKey] || []) {
    for (const asset of parent?.[assetKey] || []) {
      if (asset?.type !== "video" && !String(asset?.mimeType || "").startsWith("video/") && !isVideoReference(asset?.uri)) continue;
      addCandidate(state, attachmentCandidate(asset, parent, sourceKind, storeName));
    }
  }
}

async function collectTarotAttachments(filePath, state) {
  const payload = await readJsonOptional(filePath, state);
  if (!payload) return;
  state.filesRead += 1;
  const walk = (value, pointer = "$") => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${pointer}[${index}]`));
      return;
    }
    for (const ref of videoRefsFromObject(value)) {
      addCandidate(state, {
        title: value.title || value.name || value.label || value.id || path.basename(String(ref.value)),
        rawRefs: [ref.value],
        aliases: [{ id: value.id || "", uri: /uri/i.test(ref.key) ? ref.value : "", path: /path/i.test(ref.key) ? ref.value : "" }],
        sourceKind: "tarot-attachment",
        sourceRole: ref.key,
        provenance: [{ source: "tarot-store", jsonPointer: pointer, sourcePath: /path/i.test(ref.key) ? ref.value : "" }],
        relationships: value.cardId ? [{ ownerType: "tarot", ownerId: value.cardId, role: "video-attachment" }] : [],
        tags: value.tags || [],
        technical: value.technical || value.metadata?.echosTechnicalAffordance || {},
        frames: value.frames || value.metadata?.frames || [],
        recognition: value.frameIntelligence || value.metadata?.frameIntelligence || [],
      });
    }
    for (const [key, nested] of Object.entries(value)) {
      if (nested && typeof nested === "object") walk(nested, `${pointer}.${key}`);
    }
  };
  walk(payload);
}

async function collectTimelineSources(directory, recursive, state) {
  const files = await listJsonFiles(directory, recursive);
  for (const filePath of files) {
    const payload = await readJsonOptional(filePath, state);
    if (!payload) continue;
    state.filesRead += 1;
    state.timelineFiles += 1;
    const project = payload.music_video_project || payload.cut || payload;
    const timeline = project.timeline || payload.timeline || [];
    const songId = project.song_id || payload.songId || path.basename(path.dirname(filePath));
    const songTitle = project.song_title || payload.songTitle || "";
    const cutId = payload.id || project.id || path.basename(filePath, ".json");
    for (const [index, shot] of timeline.entries()) {
      state.timelineShots += 1;
      const refs = [
        ["media-source", shot.media_source_path || shot.media_contract?.sourcePath || shot.media_uri],
        ["runtime-media", shot.runtime_media_uri],
        ["card-media", shot.media_card_asset_uri || shot.media_card_uri],
      ].filter(([, value]) => isVideoReference(value));
      for (const [role, rawRef] of refs) {
        addCandidate(state, {
          title: shot.media_title || shot.media_card_title || `${songTitle || songId} shot ${shot.shot_index ?? index}`,
          rawRefs: [rawRef],
          aliases: [{ id: shot.media_id || shot.media_card_asset_id || "", uri: rawRef }],
          sourceKind: recursive ? "director-variant-timeline" : "director-base-timeline",
          sourceRole: role,
          provenance: [{
            source: recursive ? "music-video-project-variant" : "music-video-project",
            file: path.relative(state.options.repoRoot, filePath),
            songId,
            songTitle,
            cutId,
            shotIndex: shot.shot_index ?? index,
            sectionId: shot.section_id || "",
            sourcePath: /path=/.test(rawRef) ? decodeLocalFileUrl(rawRef) : "",
          }],
          relationships: [{ ownerType: "song", ownerId: songId, ownerName: songTitle, role: "director-timeline-media" }],
          tags: unique([shot.section_type, shot.section_label, shot.media_source_group, role]),
          technical: shot.media_contract?.technical || {},
        });
      }
    }
  }
}

async function collectAnimatedReferences(filePath, state) {
  const payload = await readJsonOptional(filePath, state);
  if (!payload) return;
  state.filesRead += 1;
  for (const record of payload.records || []) {
    const video = record?.artifacts?.loopVideo || {};
    addCandidate(state, {
      title: record.card?.title || record.card?.id,
      rawRefs: unique([video.path, video.sourcePath, video.runtimeUri, video.uri]),
      aliases: [{ id: record.card?.id || "", uri: video.runtimeUri || video.uri || "", path: video.path || "", fingerprint: video.sha256 || "" }],
      sourceKind: "reference-atlas-animated-media",
      provenance: [{
        source: "echo-reference-animated-media",
        sourceSystem: record.provenance?.sourceSystem,
        sourceNode: record.provenance?.sourceNode,
        sourceCatalog: record.provenance?.sourceCatalog,
        cardId: record.card?.id,
        revisionId: record.card?.revisionId,
        sourceBenchmark: record.sourceBenchmark || {},
        technicalStatus: record.technical?.status,
        verifiedSource: record.technical?.status === "verified-source-file",
        referenceStatus: record.custody?.reviewStatus,
      }],
      relationships: [{ ownerType: "reference", ownerId: record.card?.id || "", ownerName: record.card?.title || "", role: "animated-reference-loop" }],
      tags: ["reference-atlas", "adaptive-loop", record.pattern?.particleEffect, record.pattern?.camera],
      technical: record.technical || {},
      referencePolicy: {
        card: record.card || {},
        custody: record.custody || {},
        provenance: record.provenance || {},
        pattern: record.pattern || {},
        sourceBenchmark: record.sourceBenchmark || {},
      },
    });
  }
}

async function collectVibesTransitions(filePath, state) {
  const payload = await readJsonOptional(filePath, state);
  if (!payload) return;
  state.filesRead += 1;
  for (const job of payload.jobs || []) {
    const output = job.output || {};
    if (!isVideoReference(output.path || output.uri)) continue;
    addCandidate(state, {
      title: job.title || job.prompt || job.id,
      rawRefs: unique([output.path, output.uri]),
      aliases: [{ id: output.mediaRecordId || output.assetId || job.id || "", uri: output.uri || "", path: output.path || "", fingerprint: output.sha256 || "" }],
      sourceKind: "vibes-transition",
      provenance: [{ source: "vibes-transition-links", provider: payload.provider, jobId: job.id, status: job.status, sourcePath: output.path }],
      relationships: unique([job.from, job.to, job.firstFrame, job.lastFrame]).filter(Boolean),
      tags: ["vibes-ai", "transition-link"],
      technical: {
        status: job.status === "ready" ? "verified-source-file" : job.status,
        durationSec: output.durationSeconds,
        width: output.width,
        height: output.height,
        providerOutputUrl: output.providerOutputUrl,
      },
    });
  }
}

function decodeLocalFileUrl(value) {
  try {
    const parsed = new URL(String(value), "http://127.0.0.1");
    if (parsed.pathname === "/api/local-file") return parsed.searchParams.get("path") || "";
  } catch {
    return "";
  }
  return "";
}

export async function resolveReference(value, repoRoot = DEFAULT_REPO_ROOT) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const possibilities = [];
  const decodedLocal = decodeLocalFileUrl(raw);
  if (decodedLocal) possibilities.push(decodedLocal);
  if (raw.startsWith("file://")) {
    try {
      possibilities.push(fileURLToPath(raw));
    } catch {
      // Keep trying the remaining forms.
    }
  }
  try {
    const parsed = new URL(raw);
    if (["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname.startsWith("/media/")) {
      possibilities.push(path.join(repoRoot, "data/media", decodeURIComponent(parsed.pathname.slice("/media/".length))));
    }
  } catch {
    // The reference is probably a filesystem path or server-relative URI.
  }
  if (raw.startsWith("/media/")) possibilities.push(path.join(repoRoot, "data/media", decodeURIComponent(raw.slice("/media/".length).split("?")[0])));
  if (raw.startsWith("data/media/")) possibilities.push(path.join(repoRoot, raw));
  if (path.isAbsolute(raw)) possibilities.push(raw);
  else if (!raw.startsWith("http://") && !raw.startsWith("https://")) possibilities.push(path.resolve(repoRoot, raw));
  for (const candidate of unique(possibilities)) {
    const info = await readableFile(candidate);
    if (!info) continue;
    let resolved = path.resolve(candidate);
    try {
      resolved = await realpath(candidate);
    } catch {
      // Preserve the readable path if realpath cannot resolve it.
    }
    return { path: resolved, requestedPath: path.resolve(candidate), stat: info };
  }
  return null;
}

async function resolveCandidate(candidate, options) {
  for (const rawRef of candidate.rawRefs) {
    const resolved = await resolveReference(rawRef, options.repoRoot);
    if (resolved) return { ...candidate, ...resolved, rawRef };
  }
  return { ...candidate, path: null, stat: null, rawRef: candidate.rawRefs[0] || "" };
}

async function mapLimit(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, values.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) break;
      output[index] = await worker(values[index], index);
    }
  });
  await Promise.all(runners);
  return output;
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return digest.digest("hex");
}

function seedMatchesStat(seed, info) {
  if (!seed?.key || !/^[a-f0-9]{64}$/i.test(String(seed.sha256 || ""))) return false;
  const separator = String(seed.key).indexOf(":");
  if (separator < 0) return false;
  const size = Number(String(seed.key).slice(0, separator));
  const mtime = Number(String(seed.key).slice(separator + 1));
  return size === info.size && Number.isFinite(mtime) && Math.abs(mtime - info.mtimeMs) < 2;
}

async function archivalHash(db, resolvedGroup, report) {
  const filePath = resolvedGroup.path;
  const info = resolvedGroup.stat;
  const cached = db.prepare("SELECT sha256,size_bytes,mtime_ms FROM hash_cache WHERE path=?").get(filePath);
  if (cached && Number(cached.size_bytes) === info.size && Math.abs(Number(cached.mtime_ms) - info.mtimeMs) < 2) {
    report.hashes.cached += 1;
    return cached.sha256;
  }
  const trustedSeed = resolvedGroup.candidates.map((item) => item.cacheSeed).find((seed) => seedMatchesStat(seed, info));
  const hash = trustedSeed ? String(trustedSeed.sha256).toLowerCase() : await sha256File(filePath);
  increment(report.hashes, trustedSeed ? "seededFromVerifiedTechnicalCache" : "computed");
  db.prepare(`INSERT INTO hash_cache (path,size_bytes,mtime_ms,sha256,basis,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(path) DO UPDATE SET size_bytes=excluded.size_bytes,mtime_ms=excluded.mtime_ms,sha256=excluded.sha256,basis=excluded.basis,updated_at=excluded.updated_at`)
    .run(filePath, info.size, info.mtimeMs, hash, trustedSeed ? "verified-technical-cache-size-mtime" : "full-file-sha256", now());
  return hash;
}

function mergeResolvedCandidates(candidates) {
  const byPath = new Map();
  for (const candidate of candidates) {
    if (!candidate.path) continue;
    const current = byPath.get(candidate.path) || { path: candidate.path, stat: candidate.stat, candidates: [] };
    current.candidates.push(candidate);
    byPath.set(candidate.path, current);
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function mergeHashedGroups(groups) {
  const byHash = new Map();
  for (const group of groups) {
    const current = byHash.get(group.sha256) || { sha256: group.sha256, paths: [], candidates: [], stat: group.stat };
    current.paths.push(group.path);
    current.candidates.push(...group.candidates);
    if (!current.stat || group.stat.size > current.stat.size) current.stat = group.stat;
    byHash.set(group.sha256, current);
  }
  return [...byHash.values()].sort((left, right) => left.sha256.localeCompare(right.sha256));
}

function canonicalPathFor(paths, repoRoot) {
  return [...unique(paths)].sort((left, right) => pathPreference(right, repoRoot) - pathPreference(left, repoRoot) || left.localeCompare(right))[0];
}

function pathPreference(filePath, repoRoot) {
  const normalized = normalizePathValue(filePath);
  let score = normalized.startsWith(normalizePathValue(repoRoot)) ? 20 : 10;
  if (normalized.includes("/data/media/")) score += 8;
  if (normalized.includes("/echo-proxies-v2/")) score -= 8;
  if (normalized.includes("/backgroundless/")) score -= 2;
  return score;
}

async function probeVideo(filePath, options = {}) {
  try {
    const runner = options.execFile || execFile;
    const { stdout } = await runner("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=index,codec_type,codec_name,pix_fmt,width,height,r_frame_rate,duration",
      "-of", "json",
      filePath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    const payload = JSON.parse(stdout);
    const stream = (payload.streams || []).find((item) => item.codec_type === "video") || payload.streams?.[0] || {};
    return {
      ok: Boolean(stream.width && stream.height),
      durationSec: finite(stream.duration ?? payload.format?.duration),
      width: finite(stream.width),
      height: finite(stream.height),
      fps: fraction(stream.r_frame_rate),
      codec: stream.codec_name || "",
      pixelFormat: stream.pix_fmt || "",
      source: "ffprobe",
    };
  } catch (error) {
    return { ok: false, error: error.message, source: "ffprobe" };
  }
}

function fraction(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const [numerator, denominator = "1"] = String(value || "").split("/");
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? result : null;
}

function bestTechnical(candidates) {
  const ranked = candidates.map((item) => item.technical || {}).sort((left, right) => technicalScore(right) - technicalScore(left));
  return ranked[0] || {};
}

function technicalScore(value) {
  return Number(value?.status === "verified-source-file") * 10
    + Number(Boolean(value?.durationSec ?? value?.duration)) * 3
    + Number(Boolean(value?.width && value?.height)) * 3
    + Number(Boolean(value?.contentHash?.value)) * 2;
}

function mergeVideoRecord(group, probe, options) {
  const mediaId = canonicalMediaId(group.sha256);
  const candidates = group.candidates;
  const technical = { ...bestTechnical(candidates), ...Object.fromEntries(Object.entries(probe).filter(([, value]) => value !== null && value !== undefined && value !== "")) };
  const aliases = uniqueObjects(candidates.flatMap((item) => [
    ...(item.aliases || []),
    ...item.rawRefs.map((rawRef) => ({ id: "", uri: /^(?:https?:)?\//.test(rawRef) || rawRef.startsWith("/media/") ? rawRef : "", path: path.isAbsolute(rawRef) ? rawRef : "" })),
  ]), (item) => `${item.id || ""}|${item.uri || ""}|${item.path || ""}|${item.fingerprint || ""}`);
  const provenance = uniqueObjects(candidates.flatMap((item) => item.provenance || []));
  const relationships = uniqueObjects(candidates.flatMap((item) => item.relationships || []));
  const referencePolicies = candidates.map((item) => item.referencePolicy).filter((item) => item && Object.keys(item).length);
  return {
    mediaId,
    sha256: group.sha256,
    canonicalPath: canonicalPathFor(group.paths, options.repoRoot),
    sizeBytes: group.stat?.size || 0,
    mtimeMs: group.stat?.mtimeMs || 0,
    title: candidates.map((item) => item.title).find((title) => title && !/^untitled/i.test(title)) || path.basename(group.paths[0]),
    durationSec: finite(probe.durationSec ?? technical.durationSec ?? technical.duration),
    width: finite(probe.width ?? technical.width),
    height: finite(probe.height ?? technical.height),
    fps: finite(probe.fps ?? technical.fps ?? technical.frameRate),
    codec: String(probe.codec || technical.codec || ""),
    pixelFormat: String(probe.pixelFormat || technical.pixelFormat || ""),
    decodeStatus: probe.ok ? "decoded" : "decode-failed",
    aliases,
    uris: unique(aliases.map((item) => item.uri).filter(Boolean)),
    sourceKinds: unique(candidates.map((item) => item.sourceKind)).sort(),
    provenance,
    relationships,
    tags: unique(candidates.flatMap((item) => item.tags || [])).sort(),
    technical,
    referencePolicy: referencePolicies.length === 1 ? referencePolicies[0] : { records: referencePolicies },
    candidates,
  };
}

function upsertVideo(db, record) {
  const existing = db.prepare("SELECT * FROM videos WHERE media_id=?").get(record.mediaId);
  const createdAt = existing?.created_at || now();
  const mergeArray = (column, incoming, key) => uniqueObjects([
    ...parseJson(existing?.[column], []),
    ...incoming,
  ], key);
  const aliases = mergeArray("aliases_json", record.aliases, (item) => `${item.id || ""}|${item.uri || ""}|${item.path || ""}|${item.fingerprint || ""}`);
  const provenance = mergeArray("provenance_json", record.provenance);
  const relationships = mergeArray("relationships_json", record.relationships);
  const sourceKinds = unique([...parseJson(existing?.source_kinds_json, []), ...record.sourceKinds]).sort();
  const tags = unique([...parseJson(existing?.tags_json, []), ...record.tags]).sort();
  const uris = unique([...parseJson(existing?.uris_json, []), ...record.uris]).sort();
  const referencePolicy = existing ? mergeReferencePolicy(parseJson(existing.reference_policy_json, {}), record.referencePolicy) : record.referencePolicy;
  const desired = {
    media_id: record.mediaId,
    sha256: record.sha256,
    canonical_path: record.canonicalPath,
    size_bytes: record.sizeBytes,
    mtime_ms: record.mtimeMs,
    title: record.title,
    duration_sec: record.durationSec,
    width: record.width,
    height: record.height,
    fps: record.fps,
    codec: record.codec,
    pixel_format: record.pixelFormat,
    decode_status: record.decodeStatus,
    aliases,
    uris,
    sourceKinds,
    provenance,
    relationships,
    tags,
    technical: record.technical || {},
    referencePolicy: referencePolicy || {},
  };
  const current = existing ? {
    media_id: existing.media_id,
    sha256: existing.sha256,
    canonical_path: existing.canonical_path,
    size_bytes: Number(existing.size_bytes),
    mtime_ms: Number(existing.mtime_ms),
    title: existing.title,
    duration_sec: finite(existing.duration_sec),
    width: finite(existing.width),
    height: finite(existing.height),
    fps: finite(existing.fps),
    codec: existing.codec || "",
    pixel_format: existing.pixel_format || "",
    decode_status: existing.decode_status,
    aliases: parseJson(existing.aliases_json, []),
    uris: parseJson(existing.uris_json, []),
    sourceKinds: parseJson(existing.source_kinds_json, []),
    provenance: parseJson(existing.provenance_json, []),
    relationships: parseJson(existing.relationships_json, []),
    tags: parseJson(existing.tags_json, []),
    technical: parseJson(existing.technical_json, {}),
    referencePolicy: parseJson(existing.reference_policy_json, {}),
  } : null;
  if (current && semanticallyEqual(current, desired)) {
    return { changed: false, created: false, updatedAt: existing.updated_at };
  }
  const changedAt = now();
  db.prepare(`INSERT INTO videos (
      media_id,sha256,canonical_path,size_bytes,mtime_ms,title,duration_sec,width,height,fps,codec,pixel_format,decode_status,
      aliases_json,uris_json,source_kinds_json,provenance_json,relationships_json,tags_json,technical_json,reference_policy_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(media_id) DO UPDATE SET
      canonical_path=excluded.canonical_path,size_bytes=excluded.size_bytes,mtime_ms=excluded.mtime_ms,title=excluded.title,
      duration_sec=excluded.duration_sec,width=excluded.width,height=excluded.height,fps=excluded.fps,codec=excluded.codec,
      pixel_format=excluded.pixel_format,decode_status=excluded.decode_status,aliases_json=excluded.aliases_json,uris_json=excluded.uris_json,
      source_kinds_json=excluded.source_kinds_json,provenance_json=excluded.provenance_json,relationships_json=excluded.relationships_json,
      tags_json=excluded.tags_json,technical_json=excluded.technical_json,reference_policy_json=excluded.reference_policy_json,updated_at=excluded.updated_at`)
    .run(
      record.mediaId, record.sha256, record.canonicalPath, record.sizeBytes, record.mtimeMs, record.title, record.durationSec,
      record.width, record.height, record.fps, record.codec, record.pixelFormat, record.decodeStatus,
      json(aliases), json(uris), json(sourceKinds), json(provenance), json(relationships), json(tags), json(record.technical || {}),
      json(referencePolicy || {}), createdAt, changedAt,
    );
  return { changed: true, created: !existing, updatedAt: changedAt };
}

function reusableProbeFromVideoRow(row) {
  if (!row) return null;
  const technical = parseJson(row.technical_json, {});
  return {
    ok: row.decode_status === "decoded",
    durationSec: finite(row.duration_sec),
    width: finite(row.width),
    height: finite(row.height),
    fps: finite(row.fps),
    codec: row.codec || "",
    pixelFormat: row.pixel_format || "",
    source: technical.source || "ffprobe",
    ...(technical.error ? { error: technical.error } : {}),
  };
}

function mergeReferencePolicy(left, right) {
  if (!left || !Object.keys(left).length) return right || {};
  if (!right || !Object.keys(right).length || JSON.stringify(left) === JSON.stringify(right)) return left;
  const records = uniqueObjects([...(left.records || [left]), ...(right.records || [right])]);
  return { records };
}

async function chooseExistingFrame(record, marker, db, options) {
  const existing = db.prepare("SELECT * FROM frames WHERE media_id=? AND marker=?").get(record.mediaId, marker);
  if (existing && !options.force && (String(existing.source || "").startsWith("unavailable:") || await readableFile(existing.path))) {
    return { ...existing, reused: true };
  }
  const candidates = normalizeFrameCandidates(record.candidates.flatMap((item) => item.frames || [])).filter((item) => item.marker === marker);
  for (const candidate of candidates) {
    for (const rawRef of candidate.refs) {
      const resolved = await resolveReference(rawRef, options.repoRoot);
      if (!resolved) continue;
      return {
        marker,
        path: resolved.path,
        uri: candidate.refs.find((value) => value.startsWith("/media/")) || "",
        at_seconds: candidate.atSeconds,
        width: candidate.width,
        height: candidate.height,
        fingerprint_json: candidate.fingerprint ? json(candidate.fingerprint) : null,
        source: candidate.source || "existing-catalog-frame",
        reused: true,
      };
    }
  }
  return null;
}

function frameTime(marker, duration) {
  if (marker === "first") return Math.min(0.02, Math.max(0, Number(duration || 0) / 4));
  if (marker === "mid") return Math.max(0, Number(duration || 0) / 2);
  return Math.max(0, Number(duration || 0) - 0.08);
}

async function extractFrame(record, marker, options) {
  if (record.decodeStatus !== "decoded" || !(Number(record.durationSec) > 0)) return null;
  const directory = path.join(options.outputRoot, "frames", record.sha256.slice(0, 2));
  const outputPath = path.join(directory, `${record.sha256}-${marker}.jpg`);
  if (!options.force && await readableFile(outputPath)) {
    return { marker, path: outputPath, at_seconds: frameTime(marker, record.durationSec), source: "enrichment-frame-cache", reused: true };
  }
  await mkdir(directory, { recursive: true });
  const runner = options.execFile || execFile;
  const atSeconds = frameTime(marker, record.durationSec);
  const earlierSeconds = Math.max(0, atSeconds - Math.max(0.25, record.fps > 0 ? 2 / record.fps : 0));
  const base = ["-hide_banner", "-loglevel", "error", "-y"];
  const encode = ["-frames:v", "1", "-vf", "scale=960:-2:force_original_aspect_ratio=decrease,format=yuvj420p", "-strict", "unofficial", "-q:v", "3"];
  const attempts = [
    {
      source: "ffmpeg-first-mid-last-v1",
      sampledAtSeconds: atSeconds,
      args: (target) => [...base, "-ss", String(atSeconds), "-i", record.canonicalPath, ...encode, target],
    },
    {
      source: "ffmpeg-earlier-safe-frame-fallback-v1",
      sampledAtSeconds: earlierSeconds,
      args: (target) => [...base, "-ss", String(earlierSeconds), "-i", record.canonicalPath, ...encode, target],
    },
    {
      source: "ffmpeg-unseeked-hold-fallback-v1",
      sampledAtSeconds: 0,
      args: (target) => [...base, "-i", record.canonicalPath, ...encode, target],
    },
  ];
  for (const [attemptIndex, attempt] of attempts.entries()) {
    const attemptPath = `${outputPath}.${process.pid}.${Date.now()}-${attemptIndex}.jpg`;
    try {
      await runner("ffmpeg", attempt.args(attemptPath), { maxBuffer: 4 * 1024 * 1024 });
      const created = await readableFile(attemptPath);
      if (!created?.size) continue;
      await rename(attemptPath, outputPath);
      return {
        marker,
        path: outputPath,
        at_seconds: attempt.sampledAtSeconds,
        source: attempt.source,
        reused: false,
      };
    } catch {
      // Continue through bounded fallbacks; the final no-seek attempt truthfully
      // represents single-frame hold videos whose container advertises duration.
    }
  }
  return null;
}

function upsertFrame(db, record, frame) {
  const frameId = `${record.mediaId}#frame:${frame.marker}:v1`;
  const current = db.prepare("SELECT * FROM frames WHERE frame_id=?").get(frameId);
  const desiredFingerprint = frame.fingerprint_json || current?.fingerprint_json || null;
  const desired = {
    frame_id: frameId,
    media_id: record.mediaId,
    marker: frame.marker,
    at_seconds: finite(frame.at_seconds ?? frame.atSeconds),
    path: frame.path,
    uri: frame.uri || "",
    source: frame.source || "unknown",
    width: finite(frame.width),
    height: finite(frame.height),
    fingerprint: parseJson(desiredFingerprint, null),
  };
  const persisted = current ? {
    frame_id: current.frame_id,
    media_id: current.media_id,
    marker: current.marker,
    at_seconds: finite(current.at_seconds),
    path: current.path,
    uri: current.uri || "",
    source: current.source,
    width: finite(current.width),
    height: finite(current.height),
    fingerprint: parseJson(current.fingerprint_json, null),
  } : null;
  if (persisted && semanticallyEqual(persisted, desired)) return frameId;
  const changedAt = now();
  db.prepare(`INSERT INTO frames (frame_id,media_id,marker,at_seconds,path,uri,source,width,height,fingerprint_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(media_id,marker) DO UPDATE SET frame_id=excluded.frame_id,at_seconds=excluded.at_seconds,path=excluded.path,
      uri=excluded.uri,source=excluded.source,width=excluded.width,height=excluded.height,
      fingerprint_json=COALESCE(excluded.fingerprint_json,frames.fingerprint_json),updated_at=excluded.updated_at`)
    .run(frameId, record.mediaId, frame.marker, frame.at_seconds ?? frame.atSeconds, frame.path, frame.uri || "", frame.source || "unknown",
      frame.width || null, frame.height || null, desiredFingerprint, current?.created_at || changedAt, changedAt);
  return frameId;
}

function seedExistingRecognition(db, record, frameId, marker) {
  const existing = normalizeExistingRecognition(record.candidates.flatMap((item) => item.recognition || [])).find((item) => item.marker === marker);
  if (!existing) return false;
  const prior = db.prepare("SELECT status FROM recognition WHERE frame_id=?").get(frameId);
  if (prior?.status === "ready") return true;
  upsertRecognition(db, { frame_id: frameId, media_id: record.mediaId, marker }, {
    status: existing.ok ? "ready" : "existing-failed",
    provider: "existing-macos-vision-intelligence",
    textLines: existing.textLines,
    labels: existing.labels,
    fingerprint: existing.fingerprint || {},
    raw: existing.raw,
  });
  return existing.ok;
}

async function prepareCatalog(db, sourceState, options) {
  const report = {
    candidates: sourceState.candidates.length,
    selectedCandidates: 0,
    resolvedCandidates: 0,
    unresolvedCandidates: 0,
    uniqueResolvedPaths: 0,
    canonicalVideos: 0,
    videosDecoded: 0,
    videosDecodeFailed: 0,
    hashes: { cached: 0, seededFromVerifiedTechnicalCache: 0, computed: 0 },
    frames: { reused: 0, extracted: 0, missing: 0, recognitionReused: 0 },
  };
  const allResolved = await mapLimit(sourceState.candidates, Math.min(options.concurrency * 2, 12), (candidate) => resolveCandidate(candidate, options));
  let resolved = allResolved.filter((item) => inShard(item.path || item.rawRef, options));
  if (options.limit) resolved = resolved.slice(0, options.limit);
  report.selectedCandidates = resolved.length;
  report.resolvedCandidates = resolved.filter((item) => item.path).length;
  report.unresolvedCandidates = resolved.length - report.resolvedCandidates;
  const pathGroups = mergeResolvedCandidates(resolved);
  report.uniqueResolvedPaths = pathGroups.length;
  const hashed = await mapLimit(pathGroups, options.concurrency, async (group) => ({ ...group, sha256: await archivalHash(db, group, report) }));
  const contentGroups = mergeHashedGroups(hashed);
  report.canonicalVideos = contentGroups.length;
  await mapLimit(contentGroups, options.concurrency, async (group) => {
    const canonicalPath = canonicalPathFor(group.paths, options.repoRoot);
    const mediaId = canonicalMediaId(group.sha256);
    const existingVideo = options.force ? null : db.prepare("SELECT * FROM videos WHERE media_id=?").get(mediaId);
    const reusableProbe = reusableProbeFromVideoRow(existingVideo);
    const probe = reusableProbe || await probeVideo(canonicalPath, options);
    const record = mergeVideoRecord(group, probe, options);
    const persistence = upsertVideo(db, record);
    increment(report, persistence.changed ? "videosPersisted" : "videosReused");
    if (reusableProbe) increment(report, "videoProbesReused");
    increment(report, probe.ok ? "videosDecoded" : "videosDecodeFailed");
    for (const marker of FRAME_MARKERS) {
      let frame = await chooseExistingFrame(record, marker, db, options);
      if (!frame) frame = await extractFrame(record, marker, options);
      if (!frame) {
        report.frames.missing += 1;
        upsertFrame(db, record, {
          marker,
          path: "",
          uri: "",
          at_seconds: frameTime(marker, record.durationSec),
          source: `unavailable:${record.decodeStatus === "decoded" ? "frame-extraction-failed" : "video-decode-failed"}`,
          width: null,
          height: null,
          fingerprint_json: json({
            status: "unavailable",
            reason: record.decodeStatus === "decoded" ? "frame-extraction-failed" : "video-decode-failed",
          }),
        });
        continue;
      }
      increment(report.frames, frame.reused ? "reused" : "extracted");
      const frameId = upsertFrame(db, record, frame);
      if (seedExistingRecognition(db, record, frameId, marker)) report.frames.recognitionReused += 1;
    }
  });
  return report;
}

export async function repairFrameGaps(db, options) {
  const rows = db.prepare(`SELECT f.media_id,f.marker,f.path,f.source,r.status AS recognition_status
    FROM frames f LEFT JOIN recognition r ON r.frame_id=f.frame_id ORDER BY f.media_id,f.marker`).all();
  const candidates = [];
  for (const row of rows) {
    if (row.recognition_status === "failed" || !row.path || !await readableFile(row.path)) candidates.push(row);
  }
  const selected = options.limit ? candidates.slice(0, options.limit) : candidates;
  const report = { candidates: candidates.length, attempted: selected.length, repaired: 0, explicitUnavailable: 0, recognitionInvalidated: 0 };
  await mapLimit(selected, options.concurrency, async (row) => {
    const videoRow = db.prepare("SELECT * FROM videos WHERE media_id=?").get(row.media_id);
    if (!videoRow) return;
    const record = videoRecordFromRow(videoRow);
    const frame = await extractFrame(record, row.marker, { ...options, force: true });
    const frameId = `${record.mediaId}#frame:${row.marker}:v1`;
    if (frame) {
      upsertFrame(db, record, frame);
      increment(report, "repaired");
    } else {
      upsertFrame(db, record, {
        marker: row.marker,
        path: "",
        uri: "",
        at_seconds: frameTime(row.marker, record.durationSec),
        source: `unavailable:${record.decodeStatus === "decoded" ? "frame-extraction-failed" : "video-decode-failed"}`,
        fingerprint_json: json({ status: "unavailable", reason: record.decodeStatus === "decoded" ? "frame-extraction-failed" : "video-decode-failed" }),
      });
      increment(report, "explicitUnavailable");
    }
    const deleted = db.prepare("DELETE FROM recognition WHERE frame_id=?").run(frameId);
    report.recognitionInvalidated += Number(deleted.changes || 0);
  });
  return report;
}

function completeFingerprint(value = {}) {
  return [value.ahash, value.dhash, value.phash].every((hash) => /^[a-f0-9]{16}$/iu.test(String(hash || "")))
    && Number.isFinite(Number(value.lumaMean))
    && Number.isFinite(Number(value.lumaStd));
}

function bitsToHex(bits) {
  let output = "";
  for (let index = 0; index < bits.length; index += 4) {
    output += Number.parseInt(bits.slice(index, index + 4).join(""), 2).toString(16);
  }
  return output.padEnd(16, "0").slice(0, 16);
}

function blockAverage(pixels, width, height, x0, y0, blockWidth, blockHeight) {
  let total = 0;
  let count = 0;
  for (let y = y0; y < Math.min(y0 + blockHeight, height); y += 1) {
    for (let x = x0; x < Math.min(x0 + blockWidth, width); x += 1) {
      total += pixels[y * width + x];
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function fingerprintGrayscaleFrame(bytes, width = 16, height = 16) {
  const pixels = Buffer.from(bytes || []);
  if (pixels.length < width * height || width < 9 || height < 8) throw new Error("A complete grayscale frame is required for perceptual hashing.");
  const luminance = [...pixels.subarray(0, width * height)].map((value) => value / 255);
  const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  const variance = luminance.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / luminance.length;
  const aSamples = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      aSamples.push(blockAverage(pixels, width, height, Math.floor(x * width / 8), Math.floor(y * height / 8), Math.ceil(width / 8), Math.ceil(height / 8)));
    }
  }
  const aMean = aSamples.reduce((sum, value) => sum + value, 0) / aSamples.length;
  const ahash = bitsToHex(aSamples.map((value) => Number(value >= aMean)));
  const dBits = [];
  for (let y = 0; y < 8; y += 1) {
    const sampleY = Math.min(height - 1, Math.floor((y + 0.5) * height / 8));
    for (let x = 0; x < 8; x += 1) {
      const leftX = Math.min(width - 1, Math.floor(x * (width - 1) / 8));
      const rightX = Math.min(width - 1, Math.floor((x + 1) * (width - 1) / 8));
      dBits.push(Number(pixels[sampleY * width + leftX] <= pixels[sampleY * width + rightX]));
    }
  }
  const dhash = bitsToHex(dBits);
  const coefficients = [];
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let coefficient = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          coefficient += pixels[y * width + x]
            * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * width))
            * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * height));
        }
      }
      coefficients.push(coefficient);
    }
  }
  const pMedian = median(coefficients.slice(1));
  const phash = bitsToHex(coefficients.map((value, index) => Number(index === 0 ? value >= coefficients[0] : value >= pMedian)));
  return {
    schemaVersion: `${SCHEMA_VERSION}.frame-fingerprint.v1`,
    status: "ready",
    width,
    height,
    ahash,
    dhash,
    phash,
    lumaMean: Number(mean.toFixed(6)),
    lumaStd: Number(Math.sqrt(variance).toFixed(6)),
  };
}

async function fingerprintFrame(filePath, options = {}) {
  if (!await readableFile(filePath)) return { status: "unavailable", reason: "frame-file-unavailable" };
  try {
    const runner = options.execFile || execFile;
    const result = await runner("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", filePath,
      "-vf", "scale=16:16,format=gray",
      "-frames:v", "1",
      "-f", "rawvideo",
      "pipe:1",
    ], { encoding: "buffer", maxBuffer: 1024 * 1024 });
    return fingerprintGrayscaleFrame(Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || "", "binary"));
  } catch (error) {
    return { status: "failed", reason: error.message };
  }
}

async function fingerprintFrames(frames, options, report) {
  const output = new Map();
  const byPath = new Map();
  for (const frame of frames) {
    if (!frame.path) {
      output.set(frame.frame_id, { status: "unavailable", reason: "frame-marker-unavailable" });
      continue;
    }
    if (!byPath.has(frame.path)) byPath.set(frame.path, []);
    byPath.get(frame.path).push(frame.frame_id);
  }
  const paths = [...byPath.keys()];
  const chunkSize = Math.min(64, Math.max(1, options.visionChunkSize || 64));
  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    try {
      const args = ["-hide_banner", "-loglevel", "error"];
      for (const filePath of chunk) args.push("-i", filePath);
      const scales = chunk.map((_, input) => `[${input}:v]scale=16:16,format=gray[s${input}]`).join(";");
      const labels = chunk.map((_, input) => `[s${input}]`).join("");
      args.push("-filter_complex", `${scales};${labels}concat=n=${chunk.length}:v=1:a=0[out]`, "-map", "[out]", "-vsync", "0", "-f", "rawvideo", "pipe:1");
      const runner = options.execFile || execFile;
      const result = await runner("ffmpeg", args, { encoding: "buffer", maxBuffer: Math.max(1024 * 1024, chunk.length * 1024) });
      const bytes = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || "", "binary");
      if (bytes.length < chunk.length * 256) throw new Error(`expected ${chunk.length * 256} grayscale bytes; received ${bytes.length}`);
      chunk.forEach((filePath, offset) => {
        const fingerprint = fingerprintGrayscaleFrame(bytes.subarray(offset * 256, (offset + 1) * 256));
        for (const frameId of byPath.get(filePath) || []) output.set(frameId, fingerprint);
      });
      increment(report, "fingerprintBatches");
    } catch (error) {
      report.errors.push(`Batch fingerprint fallback (${chunk.length} frames): ${error.message}`);
      const fallback = await mapLimit(chunk, options.concurrency, async (filePath) => [filePath, await fingerprintFrame(filePath, options)]);
      for (const [filePath, fingerprint] of fallback) for (const frameId of byPath.get(filePath) || []) output.set(frameId, fingerprint);
      increment(report, "fingerprintBatchFallbacks");
    }
  }
  return output;
}

function visionToolPath(options) {
  return path.join(options.outputRoot, "tools/vision-ocr");
}

async function ensureVisionTool(options) {
  if (typeof options.visionRunner === "function") return "injected-vision-runner";
  const target = visionToolPath(options);
  const source = path.join(options.repoRoot, "scripts/vision-ocr.swift");
  const bundled = path.join(options.repoRoot, "artifacts/tools/vision-ocr");
  if (await readableFile(bundled)) return bundled;
  let needsBuild = true;
  try {
    const [targetStat, sourceStat] = await Promise.all([stat(target), stat(source)]);
    needsBuild = sourceStat.mtimeMs > targetStat.mtimeMs;
  } catch {
    needsBuild = true;
  }
  if (needsBuild) {
    await mkdir(path.dirname(target), { recursive: true });
    const runner = options.execFile || execFile;
    await runner("swiftc", [source, "-o", target], { cwd: options.repoRoot, maxBuffer: 16 * 1024 * 1024 });
  }
  return target;
}

function normalizedVisionResult(result = {}, filePath = "") {
  return {
    path: String(result.path || filePath),
    ok: result.ok === true,
    engine: String(result.engine || "apple-vision"),
    confidence: finite(result.confidence),
    textLines: normalizeTextLines(result.textLines || result.lines || []),
    labels: dedupeLabels(result.labels || []),
    description: String(result.description || result.caption || result.structured?.description || "").trim(),
    structured: result.structured && typeof result.structured === "object" ? result.structured : null,
    error: String(result.error || ""),
    raw: result.raw && typeof result.raw === "object" ? result.raw : result,
  };
}

const OLLAMA_VISION_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    ocrText: { type: "array", items: { type: "string" } },
    qualityWarnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: ["description", "tags", "ocrText", "qualityWarnings", "confidence"],
});

function parseStructuredJson(value) {
  const raw = String(value || "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* explicit failure below */ }
    }
    return null;
  }
}

function expandStructuredVision(structured = {}) {
  const output = { ...structured };
  const mapping = { setting: "settings", object: "objects", action: "actions", character: "characters", emotion: "emotions", motif: "motifs", shot: "shotTypes", camera: "camera", motion: "motion", palette: "palette", light: "lighting", weather: "weather", time: "timeOfDay" };
  for (const tag of list(structured.tags)) {
    const match = String(tag || "").match(/^([a-z]+)\s*:\s*(.+)$/iu);
    if (!match || !mapping[match[1].toLowerCase()]) continue;
    const key = mapping[match[1].toLowerCase()];
    output[key] = unique([...(output[key] || []), match[2].trim()]);
  }
  return output;
}

function structuredLabels(structured = {}) {
  return [...list(structured.tags), ...list(structured.qualityWarnings).map((value) => `quality:${value}`)].map((value) => ({
    identifier: String(value || "").trim().toLowerCase().replace(/[^a-z0-9:]+/g, "_").replace(/^_|_$/g, ""),
    confidence: clamp(structured.confidence ?? 0.65),
  })).filter((label) => label.identifier && !label.identifier.endsWith(":"));
}

async function runOllamaVision(paths, options, report) {
  const output = new Map();
  const prompt = "Analyze this one video frame literally. Return only the requested JSON. Do not guess names or canon. Write one concise description. Provide at most 16 concise tags using prefixes setting:, object:, action:, character:, emotion:, motif:, shot:, camera:, motion:, palette:, light:, weather:, or time:. Copy visible text into ocrText. List only visible defects in qualityWarnings.";
  await mapLimit(paths, Math.min(options.concurrency, 4), async (filePath) => {
    try {
      const bytes = await readFile(filePath);
      const response = await fetch(`${options.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.ollamaModel,
          messages: [{ role: "user", content: prompt, images: [bytes.toString("base64")] }],
          stream: false,
          think: false,
          format: OLLAMA_VISION_SCHEMA,
          keep_alive: "30m",
          options: { temperature: 0, seed: 23, num_predict: 1024 },
        }),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
      const envelope = await response.json();
      const parsed = parseStructuredJson(envelope?.message?.content || envelope?.response);
      if (!parsed) throw new Error(`local vision model returned non-JSON content: ${String(envelope?.message?.content || envelope?.response || "").slice(0, 240)}`);
      const structured = expandStructuredVision(parsed);
      output.set(filePath, normalizedVisionResult({
        path: filePath,
        ok: true,
        engine: `ollama:${options.ollamaModel}`,
        confidence: clamp(structured.confidence ?? 0.65),
        description: structured.description,
        structured,
        textLines: list(structured.ocrText).map((text) => ({ text, confidence: clamp(structured.confidence ?? 0.65) })),
        labels: structuredLabels(structured),
        raw: { ...structured, model: options.ollamaModel, localOnly: true },
      }, filePath));
      increment(report, "ollamaReady");
    } catch (error) {
      report.errors.push(`Ollama vision failed for ${filePath}: ${error.message}`);
      output.set(filePath, normalizedVisionResult({ ok: false, engine: `ollama:${options.ollamaModel}`, error: error.message }, filePath));
      increment(report, "ollamaFailed");
    }
  });
  report.visionChunks += paths.length;
  return output;
}

async function runVision(paths, options, report) {
  const results = new Map();
  const readable = [];
  for (const filePath of unique(paths)) {
    if (await readableFile(filePath)) readable.push(filePath);
    else results.set(filePath, normalizedVisionResult({ ok: false, error: "frame-file-unavailable" }, filePath));
  }
  if (!readable.length) return results;
  if (typeof options.visionRunner === "function") {
    const supplied = await options.visionRunner(readable);
    if (supplied instanceof Map) {
      for (const filePath of readable) results.set(filePath, normalizedVisionResult(supplied.get(filePath) || {}, filePath));
    } else {
      const byPath = new Map(list(supplied).map((row) => [String(row?.path || ""), row]));
      for (const filePath of readable) results.set(filePath, normalizedVisionResult(byPath.get(filePath) || {}, filePath));
    }
    report.visionChunks += Math.ceil(readable.length / options.visionChunkSize);
    return results;
  }
  let applePaths = readable;
  if (["auto", "ollama"].includes(options.visionProvider)) {
    const ollama = await runOllamaVision(readable, options, report);
    for (const filePath of readable) results.set(filePath, ollama.get(filePath));
    if (options.visionProvider === "ollama") return results;
    applePaths = readable.filter((filePath) => !ollama.get(filePath)?.ok);
    if (!applePaths.length) return results;
  }
  let tool;
  try {
    tool = await ensureVisionTool(options);
  } catch (error) {
    report.errors.push(`Apple Vision helper unavailable: ${error.message}`);
    for (const filePath of applePaths) if (!results.get(filePath)?.ok) results.set(filePath, normalizedVisionResult({ ok: false, error: error.message }, filePath));
    return results;
  }
  for (let index = 0; index < applePaths.length; index += options.visionChunkSize) {
    const chunk = applePaths.slice(index, index + options.visionChunkSize);
    report.visionChunks += 1;
    try {
      const runner = options.execFile || execFile;
      const { stdout } = await runner(tool, chunk, { cwd: options.repoRoot, maxBuffer: 160 * 1024 * 1024 });
      const byPath = new Map(parseVisionToolOutput(stdout).map((row) => [String(row?.path || ""), row]));
      for (const filePath of chunk) results.set(filePath, normalizedVisionResult(byPath.get(filePath) || {}, filePath));
    } catch (error) {
      report.errors.push(`Apple Vision chunk failed: ${error.message}`);
      for (const filePath of chunk) results.set(filePath, normalizedVisionResult({ ok: false, error: error.message }, filePath));
    }
  }
  return results;
}

function upsertRecognition(db, frame, result) {
  const existing = db.prepare("SELECT * FROM recognition WHERE frame_id=?").get(frame.frame_id);
  const desired = {
    frame_id: frame.frame_id,
    media_id: frame.media_id,
    marker: frame.marker,
    status: result.status,
    provider: result.provider,
    textLines: result.textLines || [],
    labels: result.labels || [],
    fingerprint: result.fingerprint || {},
    raw: result.raw || {},
  };
  const current = existing ? {
    frame_id: existing.frame_id,
    media_id: existing.media_id,
    marker: existing.marker,
    status: existing.status,
    provider: existing.provider,
    textLines: parseJson(existing.text_lines_json, []),
    labels: parseJson(existing.labels_json, []),
    fingerprint: parseJson(existing.fingerprint_json, {}),
    raw: parseJson(existing.raw_json, {}),
  } : null;
  if (current && semanticallyEqual(current, desired)) return false;
  const changedAt = now();
  db.prepare(`INSERT INTO recognition (frame_id,media_id,marker,status,provider,text_lines_json,labels_json,fingerprint_json,raw_json,recognized_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(frame_id) DO UPDATE SET status=excluded.status,provider=excluded.provider,text_lines_json=excluded.text_lines_json,
      labels_json=excluded.labels_json,fingerprint_json=excluded.fingerprint_json,raw_json=excluded.raw_json,recognized_at=excluded.recognized_at`)
    .run(
      frame.frame_id,
      frame.media_id,
      frame.marker,
      result.status,
      result.provider,
      json(result.textLines || []),
      json(result.labels || []),
      json(result.fingerprint || {}),
      json(result.raw || {}),
      changedAt,
    );
  const persistedFrame = db.prepare("SELECT fingerprint_json FROM frames WHERE frame_id=?").get(frame.frame_id);
  if (!semanticallyEqual(parseJson(persistedFrame?.fingerprint_json, {}), result.fingerprint || {})) {
    db.prepare("UPDATE frames SET fingerprint_json=?,updated_at=? WHERE frame_id=?")
      .run(json(result.fingerprint || {}), changedAt, frame.frame_id);
  }
  return true;
}

function recognitionComplete(row = {}) {
  const textLines = parseJson(row.recognition_text_lines_json, []);
  const labels = parseJson(row.recognition_labels_json, []);
  const raw = parseJson(row.recognition_raw_json, {});
  const vision = raw?.vision && typeof raw.vision === "object" ? raw.vision : raw;
  const hasVisionEvidence = textLines.length > 0 || labels.length > 0 || Boolean(vision?.description || vision?.structured?.description || vision?.ok);
  return ["ready", "partial"].includes(String(row.recognition_status || ""))
    && hasVisionEvidence
    && completeFingerprint(parseJson(row.recognition_fingerprint_json, {}));
}

function reusableVisionResult(row = {}) {
  const textLines = parseJson(row.recognition_text_lines_json, []);
  const labels = parseJson(row.recognition_labels_json, []);
  const raw = parseJson(row.recognition_raw_json, {});
  const vision = raw?.vision && typeof raw.vision === "object" ? raw.vision : raw;
  if (!["ready", "partial"].includes(String(row.recognition_status || "")) || (!textLines.length && !labels.length)) return null;
  return normalizedVisionResult({
    path: row.path,
    ok: true,
    engine: row.recognition_provider || "reused-local-vision",
    textLines,
    labels,
    description: vision?.description,
    structured: vision?.structured || vision,
    raw: { ...vision, reusedRecognition: true },
  }, row.path);
}

function fingerprintKey(value = {}) {
  return completeFingerprint(value) ? `${value.ahash}:${value.dhash}:${value.phash}:${value.lumaMean}:${value.lumaStd}` : "";
}

export async function recognizeCatalog(db, options) {
  const report = {
    videos: 0,
    frames: 0,
    reused: 0,
    ready: 0,
    partial: 0,
    unavailable: 0,
    failed: 0,
    fingerprintReady: 0,
    visionChunks: 0,
    errors: [],
  };
  const videos = db.prepare("SELECT media_id,canonical_path FROM videos ORDER BY media_id").all()
    .filter((row) => inShard(row.canonical_path || row.media_id, options));
  const selectedVideos = options.limit ? videos.slice(0, options.limit) : videos;
  report.videos = selectedVideos.length;
  const frames = selectedVideos.flatMap((video) => db.prepare(`SELECT f.*,
      r.status AS recognition_status,r.provider AS recognition_provider,r.text_lines_json AS recognition_text_lines_json,
      r.labels_json AS recognition_labels_json,r.fingerprint_json AS recognition_fingerprint_json,r.raw_json AS recognition_raw_json
    FROM frames f LEFT JOIN recognition r ON r.frame_id=f.frame_id WHERE f.media_id=? ORDER BY f.marker`).all(video.media_id));
  report.frames = frames.length;
  const pending = [];
  for (const frame of frames) {
    if (!options.force && recognitionComplete(frame)) {
      report.reused += 1;
      continue;
    }
    pending.push(frame);
  }
  const fingerprints = await fingerprintFrames(pending, options, report);
  const reusableVision = new Map(pending.flatMap((frame) => {
    const value = reusableVisionResult(frame);
    return value ? [[frame.path, value]] : [];
  }));
  const visionByFingerprint = new Map();
  if (!options.force) {
    const knownRows = db.prepare(`SELECT f.path,r.status AS recognition_status,r.provider AS recognition_provider,
        r.text_lines_json AS recognition_text_lines_json,r.labels_json AS recognition_labels_json,
        r.fingerprint_json AS recognition_fingerprint_json,r.raw_json AS recognition_raw_json
      FROM recognition r JOIN frames f ON f.frame_id=r.frame_id`).all();
    for (const row of knownRows) {
      const value = reusableVisionResult(row);
      const key = fingerprintKey(parseJson(row.recognition_fingerprint_json, {}));
      if (value && key && !visionByFingerprint.has(key)) visionByFingerprint.set(key, value);
    }
    for (const frame of pending) {
      const value = reusableVision.get(frame.path);
      const key = fingerprintKey(fingerprints.get(frame.frame_id));
      if (value && key && !visionByFingerprint.has(key)) visionByFingerprint.set(key, value);
    }
  }
  const representativeByFingerprint = new Map();
  for (const frame of pending) {
    if (!frame.path || (!options.force && reusableVision.has(frame.path))) continue;
    const key = fingerprintKey(fingerprints.get(frame.frame_id)) || `path:${frame.path}`;
    if (!options.force && visionByFingerprint.has(key)) {
      increment(report, "visionReusedByExactFingerprint");
      continue;
    }
    if (!representativeByFingerprint.has(key)) representativeByFingerprint.set(key, frame.path);
    else increment(report, "visionDeduplicatedByExactFingerprint");
  }
  const visionPaths = [...representativeByFingerprint.values()];
  const vision = await runVision(visionPaths, options, report);
  for (const frame of pending) {
    const fingerprint = fingerprints.get(frame.frame_id) || { status: "unavailable", reason: "fingerprint-not-produced" };
    const key = fingerprintKey(fingerprint) || `path:${frame.path}`;
    const representative = representativeByFingerprint.get(key) || frame.path;
    const attempted = frame.path ? vision.get(representative) : null;
    const visionResult = attempted?.ok ? attempted
      : reusableVision.get(frame.path)
        || (!options.force ? visionByFingerprint.get(key) : null)
        || attempted
        || normalizedVisionResult({ ok: false, error: "frame-marker-unavailable" }, frame.path);
    const fingerprintReady = completeFingerprint(fingerprint);
    const visionReady = visionResult?.ok === true;
    const status = !frame.path
      ? "unavailable"
      : fingerprintReady && visionReady ? "ready"
        : fingerprintReady || visionReady ? "partial"
          : "failed";
    const result = {
      status,
      provider: `${visionResult?.engine || "vision-unavailable"}+ffmpeg-perceptual-v1`,
      textLines: visionResult?.textLines || [],
      labels: visionResult?.labels || [],
      fingerprint,
      raw: {
        vision: visionResult?.raw || { error: visionResult?.error || "vision-unavailable" },
        fingerprintStatus: fingerprint.status,
      },
    };
    upsertRecognition(db, frame, result);
    increment(report, status);
    if (fingerprintReady) report.fingerprintReady += 1;
  }
  return report;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function fixed(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0;
}

function popcountNibble(value) {
  return [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4][value] || 0;
}

function hammingDistance(left, right) {
  if (!/^[a-f0-9]{16}$/iu.test(String(left || "")) || !/^[a-f0-9]{16}$/iu.test(String(right || ""))) return null;
  let distance = 0;
  for (let index = 0; index < 16; index += 1) {
    distance += popcountNibble(Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16));
  }
  return distance;
}

function setSimilarity(left, right) {
  const leftSet = new Set(unique(left).map(String));
  const rightSet = new Set(unique(right).map(String));
  if (!leftSet.size && !rightSet.size) return 0;
  let intersection = 0;
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
  return intersection / Math.max(1, leftSet.size + rightSet.size - intersection);
}

function fingerprintSimilarity(left = {}, right = {}) {
  const distances = ["ahash", "dhash", "phash"].map((key) => hammingDistance(left[key], right[key])).filter(Number.isFinite);
  const hash = distances.length ? 1 - distances.reduce((sum, value) => sum + value, 0) / (distances.length * 64) : 0;
  const meanDelta = Number.isFinite(Number(left.lumaMean)) && Number.isFinite(Number(right.lumaMean))
    ? Math.abs(Number(left.lumaMean) - Number(right.lumaMean))
    : 1;
  const stdDelta = Number.isFinite(Number(left.lumaStd)) && Number.isFinite(Number(right.lumaStd))
    ? Math.abs(Number(left.lumaStd) - Number(right.lumaStd))
    : 1;
  return {
    hash: clamp(hash),
    luma: clamp(1 - meanDelta * 2.5 - stdDelta * 1.5),
    meanDelta: fixed(meanDelta, 6),
    stdDelta: fixed(stdDelta, 6),
    ahashDistance: hammingDistance(left.ahash, right.ahash),
    dhashDistance: hammingDistance(left.dhash, right.dhash),
    phashDistance: hammingDistance(left.phash, right.phash),
  };
}

function runtimeUriForVideo(video, options) {
  const mediaRoot = path.resolve(options.repoRoot, "data/media");
  const canonical = path.resolve(String(video.canonical_path || ""));
  const relative = path.relative(mediaRoot, canonical);
  if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return `/media/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
  }
  return parseJson(video.uris_json, []).find((uri) => String(uri).startsWith("/media/")) || null;
}

function videoRecordFromRow(row) {
  return {
    mediaId: row.media_id,
    sha256: row.sha256,
    canonicalPath: row.canonical_path,
    sizeBytes: Number(row.size_bytes || 0),
    mtimeMs: Number(row.mtime_ms || 0),
    title: row.title,
    durationSec: finite(row.duration_sec),
    width: finite(row.width),
    height: finite(row.height),
    fps: finite(row.fps),
    codec: row.codec || "",
    pixelFormat: row.pixel_format || "",
    decodeStatus: row.decode_status,
    aliases: parseJson(row.aliases_json, []),
    uris: parseJson(row.uris_json, []),
    sourceKinds: parseJson(row.source_kinds_json, []),
    provenance: parseJson(row.provenance_json, []),
    relationships: parseJson(row.relationships_json, []),
    tags: parseJson(row.tags_json, []),
    technical: parseJson(row.technical_json, {}),
    referencePolicy: parseJson(row.reference_policy_json, {}),
  };
}

function staticSingleFrameEvidence(video, frames) {
  if (video.decodeStatus !== "decoded" || frames.length !== 3 || !frames.every((frame) => frame.available)) return false;
  const fingerprints = frames.map((frame) => fingerprintKey(frame.fingerprint)).filter(Boolean);
  return frames.every((frame) => finite(frame.atSeconds) === 0)
    && fingerprints.length === 3
    && new Set(fingerprints).size === 1;
}

function recognitionConfidence(textLines, labels) {
  const values = [...textLines, ...labels].map((row) => Number(row?.confidence)).filter(Number.isFinite);
  return values.length ? fixed(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function frameEvaluation(marker, row = null, recognition = null) {
  const textLines = parseJson(recognition?.text_lines_json, []);
  const labels = parseJson(recognition?.labels_json, []);
  const fingerprint = parseJson(recognition?.fingerprint_json ?? row?.fingerprint_json, {});
  const recognitionRaw = parseJson(recognition?.raw_json, {});
  const structuredVision = recognitionRaw?.vision && typeof recognitionRaw.vision === "object"
    ? recognitionRaw.vision
    : recognitionRaw;
  const available = Boolean(row?.path);
  const status = recognition?.status || (available ? "recognition-pending" : "unavailable");
  return {
    marker,
    frameId: row?.frame_id || null,
    evaluationStatus: status,
    available,
    unavailableReason: available ? null : String(row?.source || "frame-marker-not-prepared").replace(/^unavailable:/u, ""),
    atSeconds: finite(row?.at_seconds),
    path: row?.path || null,
    uri: row?.uri || null,
    source: row?.source || "unavailable",
    confidence: available ? recognitionConfidence(textLines, confidentFrameLabels({ labels })) : 0,
    textLines,
    labels,
    visionDescription: String(structuredVision?.description || structuredVision?.structured?.description || "").trim(),
    structuredVision: structuredVision?.structured && typeof structuredVision.structured === "object"
      ? structuredVision.structured
      : structuredVision,
    fingerprint: completeFingerprint(fingerprint) ? fingerprint : {
      status: fingerprint.status || "unavailable",
      reason: fingerprint.reason || (available ? "fingerprint-pending" : "frame-marker-unavailable"),
    },
    provider: recognition?.provider || null,
  };
}

function frameEvaluations(db, mediaId) {
  const rows = db.prepare(`SELECT f.*,
      r.status AS recognition_status,r.provider AS recognition_provider,r.text_lines_json AS recognition_text_lines_json,
      r.labels_json AS recognition_labels_json,r.fingerprint_json AS recognition_fingerprint_json,r.raw_json AS recognition_raw_json
    FROM frames f LEFT JOIN recognition r ON r.frame_id=f.frame_id WHERE f.media_id=? ORDER BY f.marker`).all(mediaId);
  const byMarker = new Map(rows.map((row) => [row.marker, row]));
  return FRAME_MARKERS.map((marker) => {
    const row = byMarker.get(marker) || null;
    const recognition = row ? {
      status: row.recognition_status,
      provider: row.recognition_provider,
      text_lines_json: row.recognition_text_lines_json,
      labels_json: row.recognition_labels_json,
      fingerprint_json: row.recognition_fingerprint_json,
      raw_json: row.recognition_raw_json,
    } : null;
    return frameEvaluation(marker, row, recognition);
  });
}

export const VISION_LABEL_MIN_CONFIDENCE = 0.05;
export const VISION_LABEL_RELATIVE_CONFIDENCE = 0.25;
export const VISION_LABEL_MAX_PER_FRAME = 12;

export function confidentFrameLabels(frame, {
  minimumConfidence = VISION_LABEL_MIN_CONFIDENCE,
  relativeConfidence = VISION_LABEL_RELATIVE_CONFIDENCE,
  limit = VISION_LABEL_MAX_PER_FRAME,
} = {}) {
  const normalized = list(frame?.labels)
    .map((label, index) => ({
      ...label,
      identifier: String(label?.identifier || "").trim(),
      confidence: Number.isFinite(Number(label?.confidence)) ? Number(label.confidence) : null,
      _sourceIndex: index,
    }))
    .filter((label) => label.identifier);
  const topConfidence = normalized.reduce((maximum, label) => (
    label.confidence === null ? maximum : Math.max(maximum, label.confidence)
  ), 0);
  const effectiveMinimum = Math.max(minimumConfidence, topConfidence * relativeConfidence);
  return normalized
    .filter((label) => label.confidence === null || label.confidence >= effectiveMinimum)
    .sort((left, right) => (
      (right.confidence ?? 1) - (left.confidence ?? 1)
      || left._sourceIndex - right._sourceIndex
      || left.identifier.localeCompare(right.identifier)
    ))
    .slice(0, Math.max(0, limit))
    .map(({ _sourceIndex, ...label }) => label);
}

function frameLabelIds(frame) {
  return confidentFrameLabels(frame).map((label) => label.identifier);
}

function frameSemanticLabelConfidence(frame) {
  const labels = confidentFrameLabels(frame);
  if (!labels.length) return 0;
  const measured = labels.map((label) => Number(label.confidence)).filter(Number.isFinite);
  if (measured.length) return clamp(measured.reduce((sum, value) => sum + value, 0) / measured.length);
  return clamp(Number(frame?.confidence) || 0.6);
}

function describeFrame(frame) {
  if (!frame?.available) return `${frame?.marker || "frame"}: unavailable (${frame?.unavailableReason || "no frame evidence"})`;
  if (frame.visionDescription) return `${frame.marker}: ${frame.visionDescription}`;
  const labels = frameLabelIds(frame).slice(0, 5).map((label) => label.replaceAll("_", " "));
  const ocr = list(frame.textLines).map((line) => String(line.text || "").trim()).filter(Boolean).slice(0, 2);
  const visual = labels.length ? labels.join(", ") : "no confident Vision labels";
  return `${frame.marker}: ${visual}${ocr.length ? `; visible text “${ocr.join(" / ").slice(0, 160)}”` : ""}`;
}

function semanticSummary(video, frames) {
  const first = frames.find((frame) => frame.marker === "first");
  const mid = frames.find((frame) => frame.marker === "mid");
  const last = frames.find((frame) => frame.marker === "last");
  const firstLabels = frameLabelIds(first);
  const midLabels = frameLabelIds(mid);
  const lastLabels = frameLabelIds(last);
  const retained = firstLabels.filter((label) => lastLabels.includes(label));
  const introduced = lastLabels.filter((label) => !firstLabels.includes(label));
  const synopsis = [first, mid, last].map(describeFrame).join(" | ");
  const arcSynopsis = first?.available && last?.available
    ? `From ${firstLabels.slice(0, 3).join(", ") || "an unclassified opening"} through ${midLabels.slice(0, 3).join(", ") || "an unclassified middle"} to ${lastLabels.slice(0, 3).join(", ") || "an unclassified ending"}; ${retained.length ? `retains ${retained.slice(0, 3).join(", ")}` : "no stable label is claimed"}${introduced.length ? ` and introduces ${introduced.slice(0, 3).join(", ")}` : ""}.`
    : "The three-frame visual arc is unavailable because one or more decoded frame markers could not be evaluated.";
  const tags = normalizeCanonicalTags([
    ...video.tags.map((tag) => ({ namespace: "source", value: tag })),
    ...frames.flatMap((frame) => frameLabelIds(frame).map((label) => ({ namespace: "vision", value: label }))),
    ...video.sourceKinds.map((kind) => ({ namespace: "source", value: kind })),
    frames.some((frame) => frame.textLines.length) ? "ocr:text-present" : null,
  ]);
  return {
    synopsis,
    arcSynopsis,
    tags,
    motifs: tags.filter((tag) => /^(?:motif|vision):/u.test(tag)).slice(0, 24),
    ocrText: unique(frames.flatMap((frame) => frame.textLines.map((line) => line.text))).join("\n"),
    labels: dedupeLabels(frames.flatMap((frame) => frame.labels)),
    confidentLabels: dedupeLabels(frames.flatMap((frame) => confidentFrameLabels(frame))),
    provisionalLabels: dedupeLabels(frames.flatMap((frame) => {
      if (confidentFrameLabels(frame).length) return [];
      const fallback = list(frame?.labels)
        .filter((label) => String(label?.identifier || "").trim() && Number.isFinite(Number(label?.confidence)))
        .sort((left, right) => Number(right.confidence) - Number(left.confidence))[0];
      return fallback ? [{ ...fallback, evidenceStatus: "low-confidence-provisional" }] : [];
    })),
    labelPolicy: {
      minimumConfidence: VISION_LABEL_MIN_CONFIDENCE,
      relativeToFrameTop: VISION_LABEL_RELATIVE_CONFIDENCE,
      maximumPerFrame: VISION_LABEL_MAX_PER_FRAME,
      unscoredLabels: "retained-as-curated-or-provider-labels",
      lowConfidenceFallback: "retained-provisionally-but-excluded-from-semantic-scoring",
      rawLabelsRetained: true,
    },
  };
}

function metric(score, confidence, rationale, evidence = [], status = "inferred") {
  return { score: clamp(score), confidence: clamp(confidence), rationale, evidence, status };
}

function qualityForVideo(video, frames, semantic) {
  const decoded = video.decodeStatus === "decoded";
  const available = frames.filter((frame) => frame.available).length;
  const recognitionCoverage = frames.filter((frame) => ["ready", "partial"].includes(frame.evaluationStatus)).length / 3;
  const shortEdge = Math.min(Number(video.width || 0), Number(video.height || 0));
  const technicalScore = decoded ? clamp(0.45 + Math.min(0.45, shortEdge / 1600) + (video.codec ? 0.1 : 0)) : 0;
  const first = frames.find((frame) => frame.marker === "first") || {};
  const mid = frames.find((frame) => frame.marker === "mid") || {};
  const last = frames.find((frame) => frame.marker === "last") || {};
  const endpoint = fingerprintSimilarity(first.fingerprint, last.fingerprint);
  const firstMid = fingerprintSimilarity(first.fingerprint, mid.fingerprint);
  const midLast = fingerprintSimilarity(mid.fingerprint, last.fingerprint);
  const temporal = decoded && available === 3 ? clamp(0.45 + (firstMid.hash + midLast.hash) * 0.275) : 0;
  const semanticLegibility = decoded ? clamp(0.25 + recognitionCoverage * 0.45 + Math.min(0.3, semantic.confidentLabels.length / 20)) : 0;
  const canonSignals = video.relationships.length + video.provenance.filter((entry) => entry?.approvedReference || entry?.referenceApproved).length;
  const composition = decoded ? clamp(0.3 + Math.min(0.45, shortEdge / 1440) + (Number(video.durationSec) >= 2 ? 0.25 : 0.1)) : 0;
  const dimensions = {
    visualCraftTechnicalFidelity: metric(technicalScore, decoded ? 0.95 : 0.1, decoded ? "Measured decode, codec, and resolution fitness." : "The canonical source did not decode.", [video.decodeStatus, `${video.width || 0}x${video.height || 0}`, video.codec], "measured"),
    temporalCoherenceMotionQuality: metric(temporal, available === 3 ? 0.72 : 0.1, available === 3 ? "Inferred from first→middle→last perceptual continuity." : "Three decoded frame fingerprints were unavailable.", [firstMid, midLast], available === 3 ? "inferred-from-three-frames" : "measured-unavailable"),
    hapaAestheticWorldAlignment: metric(decoded ? clamp(0.35 + Math.min(0.4, semantic.tags.length / 30) + Math.min(0.25, video.relationships.length / 4)) : 0, recognitionCoverage ? 0.45 : 0.15, "Inferred only from canonical tags and explicit Hapa relationships; no human taste approval is claimed.", [...semantic.tags, ...video.relationships.slice(0, 5)], "inferred"),
    narrativeSemanticLegibility: metric(semanticLegibility, recognitionCoverage ? 0.62 : 0.15, "Inferred from three-frame labels, OCR, and visible progression.", [semantic.arcSynopsis], "inferred"),
    characterCanonIntegrity: metric(decoded ? clamp(0.3 + Math.min(0.7, canonSignals / 3)) : 0, canonSignals ? 0.7 : 0.2, canonSignals ? "Explicit attachment/reference relationships provide canon context." : "No explicit character/reference relationship was available; no identity is claimed.", video.relationships.slice(0, 8), canonSignals ? "source-evidenced" : "inferred-unmapped"),
    compositionEditorialUtility: metric(composition, decoded ? 0.82 : 0.1, "Measured from resolution, duration, and successful frame extraction.", [`duration:${video.durationSec || 0}`, `short-edge:${shortEdge}`, `frames:${available}/3`], "measured"),
    libraryDistinctiveness: metric(decoded ? clamp(0.35 + Math.min(0.65, new Set(semantic.tags).size / 24)) : 0, recognitionCoverage ? 0.42 : 0.12, "Provisional distinctiveness from the video's own normalized semantic vocabulary; corpus percentile is not claimed.", semantic.tags.slice(0, 20), "provisional"),
  };
  const quality = scoreIntrinsicQuality(dimensions);
  return {
    ...quality,
    inputs: dimensions,
    endpointEvidence: endpoint,
  };
}

function declaredTransitionEndpoints(video = {}) {
  const relationships = list(video.relationships);
  const endpoint = (role) => {
    const relationship = relationships.find((entry) => String(entry?.role || "") === `transition-${role}-frame`);
    if (!relationship) return null;
    const frame = relationships.find((entry) => (
      String(entry?.schemaVersion || "") === "hapa.vibes-transition-frame.v1"
      && String(entry?.cardId || "") === String(relationship.ownerId || "")
    ));
    return {
      role,
      ownerType: relationship.ownerType || null,
      ownerId: relationship.ownerId || null,
      ownerName: relationship.ownerName || null,
      frameId: frame?.id || null,
      frameKind: frame?.kind || null,
      cardId: frame?.cardId || relationship.ownerId || null,
      cardTitle: frame?.cardTitle || relationship.ownerName || null,
      assetId: frame?.assetId || null,
      assetTitle: frame?.assetTitle || null,
      uri: frame?.uri || null,
      sha256: frame?.sha256 || null,
      reviewStatus: frame?.authority?.reviewStatus || null,
      sourceCardUnchanged: frame?.authority?.sourceCardUnchanged === true,
    };
  };
  const link = relationships.find((entry) => (
    entry?.ownerType === "transition-link" || entry?.role === "vibes-provider-output"
  ));
  return {
    first: endpoint("first"),
    last: endpoint("last"),
    link: link ? {
      id: link.ownerId || link.id || null,
      title: link.ownerName || link.title || null,
      role: link.role || null,
    } : null,
  };
}

function flowForVideo(frames, video = {}) {
  const first = frames.find((frame) => frame.marker === "first") || {};
  const mid = frames.find((frame) => frame.marker === "mid") || {};
  const last = frames.find((frame) => frame.marker === "last") || {};
  const endpoint = fingerprintSimilarity(first.fingerprint, last.fingerprint);
  const semanticContinuity = setSimilarity(frameLabelIds(first), frameLabelIds(last));
  const midEntry = fingerprintSimilarity(first.fingerprint, mid.fingerprint);
  const midExit = fingerprintSimilarity(mid.fingerprint, last.fingerprint);
  const perceptualConfidence = frames.every((frame) => frame.available && completeFingerprint(frame.fingerprint)) ? 0.92 : 0.1;
  const semanticConfidence = Math.min(frameSemanticLabelConfidence(first), frameSemanticLabelConfidence(last));
  const confidenceAdjustedSemanticContinuity = semanticContinuity * semanticConfidence;
  const transitionRelationships = list(video.relationships).filter((relationship) => (
    /transition-(?:from|to)|first-frame|last-frame/iu.test(String(relationship?.role || relationship?.kind || relationship?.type || ""))
  ));
  const transitionSourceKinds = list(video.sourceKinds).filter((kind) => String(kind) === "vibes-transition");
  const transitionEndpoints = declaredTransitionEndpoints(video);
  const declaredTransitionEvidence = [
    ...transitionSourceKinds.map((kind) => ({ type: "source-kind", value: kind })),
    ...transitionRelationships.map((relationship) => ({
      type: "keyframe-relationship",
      role: relationship?.role || relationship?.kind || relationship?.type || null,
      id: relationship?.id || relationship?.relationshipId || relationship?.ownerId || null,
      title: relationship?.ownerName || relationship?.title || null,
      ownerType: relationship?.ownerType || null,
      sourceId: relationship?.sourceId || relationship?.fromId || relationship?.source?.id || null,
      targetId: relationship?.targetId || relationship?.toId || relationship?.target?.id || null,
    })),
  ];
  const declaredTransition = declaredTransitionEvidence.length > 0;
  const loop = classifyLoop({
    endpointAppearance: metric(endpoint.hash, perceptualConfidence, "Perceptual aHash/dHash/pHash endpoint similarity.", [endpoint], "measured"),
    subjectRoiContinuity: metric(confidenceAdjustedSemanticContinuity, semanticConfidence, "Confidence-gated Vision label continuity is a bounded subject proxy; low-confidence labels cannot inflate the score.", [], "inferred"),
    paletteLumaContinuity: metric(endpoint.luma, perceptualConfidence, "Measured endpoint luminance continuity.", [endpoint], "measured"),
    seamMotionContinuity: metric(clamp((midEntry.hash + midExit.hash + endpoint.hash) / 3), perceptualConfidence * 0.85, "Inferred from the three perceptual-hash intervals.", [midEntry, midExit], "inferred"),
    semanticStateContinuity: metric(confidenceAdjustedSemanticContinuity, semanticConfidence, "Confidence-gated Vision endpoint label overlap.", [], "inferred"),
    oneWayStateChange: declaredTransition,
  });
  const transition = classifyTransition({
    directedStateChange: metric(1 - endpoint.hash, perceptualConfidence * 0.85, "Endpoint perceptual change; direction is not narratively asserted.", [endpoint], "inferred"),
    entryExitKeyframeLegibility: metric(frames.filter((frame) => frame.available).length / 3, perceptualConfidence, "Availability of explicit first/middle/last markers.", [], "measured"),
    motionCoherence: metric(clamp((midEntry.hash + midExit.hash) / 2), perceptualConfidence * 0.8, "Three-frame perceptual progression proxy.", [midEntry, midExit], "inferred"),
    semanticBridgeUtility: metric(clamp(0.5 * confidenceAdjustedSemanticContinuity + 0.5 * (1 - endpoint.hash)), Math.max(semanticConfidence, perceptualConfidence * 0.5), "Balanced confidence-gated semantic continuity and measured endpoint change.", [], "inferred"),
    endpointDistinctness: metric(1 - endpoint.hash, perceptualConfidence, "Measured perceptual endpoint distinctness.", [endpoint], "measured"),
    declaredTransition,
    declaredEvidence: declaredTransitionEvidence,
    declaredEndpoints: transitionEndpoints,
  });
  return { loop, transition, endpoint, midEntry, midExit };
}

async function optionalCanonMapper(options) {
  if (typeof options.canonMapper === "function") return options.canonMapper;
  const modulePath = path.join(options.repoRoot, "src/domain/echo-video-canon-mapper.js");
  if (!await readableFile(modulePath)) return null;
  const module = await import(`${pathToFileURL(modulePath).href}?v=${(await stat(modulePath)).mtimeMs}`);
  return module.buildEchoVideoCanonMapping
    || module.mapEchoVideoCanonContext
    || module.mapEchoVideoCanon
    || module.mapEchoVideoCanonEvidence
    || module.mapVideoEnrichmentCanon
    || module.default
    || null;
}

function canonObservationsFromFrames(frames) {
  return frames.filter((frame) => frame?.available).map((frame) => {
    const labels = frameLabelIds(frame);
    const ocrText = list(frame?.textLines).map((line) => String(line?.text || "").trim()).filter(Boolean);
    return {
      ...(frame.structuredVision && typeof frame.structuredVision === "object" ? frame.structuredVision : {}),
      role: frame.marker === "mid" ? "middle" : frame.marker,
      frameId: frame.frameId,
      timestampSeconds: frame.atSeconds,
      confidence: frame.confidence,
      description: frame.visionDescription || describeFrame(frame),
      objects: labels,
      ocrText,
      raw: {
        evaluationStatus: frame.evaluationStatus,
        available: frame.available,
        labels: frame.labels,
        textLines: frame.textLines,
      },
    };
  });
}

async function loadCanonContext(options, report) {
  if (options.canonContext && typeof options.canonContext === "object") return options.canonContext;
  const state = { warnings: report.warnings };
  const load = (relative) => readJsonOptional(path.join(options.repoRoot, relative), state);
  const [referenceAtlas, animatedReferences, songStore, avatarStore, sceneStore, itemStore, tarotStore] = await Promise.all([
    load("data/echo-reference-mining/latest.json"),
    load("data/echo-reference-animated-media.json"),
    load("data/hapa-songs-store.json"),
    load("data/avatar-store.json"),
    load("data/scene-store.json"),
    load("data/item-manager-store.json"),
    load("data/tarot-store.json"),
  ]);
  return { referenceAtlas, animatedReferences, songStore, avatarStore, sceneStore, itemStore, tarotStore };
}

export async function loadSourcePriorOverrides(options, report = { warnings: [] }, { required = false } = {}) {
  const overridePath = path.join(options.repoRoot, "data/echo-video-source-prior-overrides.json");
  const payload = await readJsonOptional(overridePath, report);
  if (!payload) {
    if (required) {
      throw new Error(`Required Echo source-prior override overlay is missing or unreadable: ${overridePath}`);
    }
    return { path: overridePath, authority: "", byMediaId: new Map() };
  }
  if (payload.schemaVersion !== SOURCE_PRIOR_OVERRIDE_SCHEMA_VERSION) {
    throw new Error(`Unsupported Echo source-prior override schema: ${payload.schemaVersion || "missing"}`);
  }
  const authority = String(payload.authority || "").trim();
  const byMediaId = new Map();
  for (const record of list(payload.overrides)) {
    const mediaId = String(record?.mediaId || "").trim();
    if (!/^hapa-media:sha256:[a-f0-9]{64}$/u.test(mediaId)) {
      throw new Error(`Invalid content-addressed source-prior override mediaId: ${mediaId || "missing"}`);
    }
    if (byMediaId.has(mediaId)) throw new Error(`Duplicate source-prior override: ${mediaId}`);
    const sourceClass = String(record?.sourceClass || "").trim();
    if (!sourceClass) throw new Error(`Missing sourceClass for source-prior override: ${mediaId}`);
    byMediaId.set(mediaId, {
      ...record,
      mediaId,
      sourceClass,
      authority,
      provenanceEvidence: {
        source: "echo-video-source-prior-overrides",
        sourceCatalog: String(record.sourceCatalog || sourceClass),
        sourceClass,
        sourceReferenceRunId: record.sourceReferenceRunId,
        sourcePath: record.sourcePath,
        authority,
        lineage: {
          rootCardId: record.rootCardId,
          coreId: record.coreId,
          derivedFromMediaId: record.derivedFromMediaId,
        },
      },
    });
  }
  return { path: overridePath, authority, byMediaId };
}

function mergeQualityInputs(primary = {}, fallback = {}) {
  const output = {};
  for (const key of new Set([...Object.keys(fallback || {}), ...Object.keys(primary || {})])) {
    const candidate = primary?.[key];
    const candidateScore = candidate?.score === null || candidate?.score === undefined ? NaN : Number(candidate.score);
    output[key] = candidate && candidate.status !== "unmeasured" && Number.isFinite(candidateScore) ? candidate : fallback?.[key];
  }
  return output;
}

function enrichmentInputFingerprint(db, mediaId, sourcePriorOverride = null) {
  const videoRow = db.prepare(`SELECT media_id,sha256,canonical_path,size_bytes,mtime_ms,title,duration_sec,width,height,fps,codec,pixel_format,
    decode_status,aliases_json,uris_json,source_kinds_json,provenance_json,relationships_json,tags_json,technical_json,reference_policy_json
    FROM videos WHERE media_id=?`).get(mediaId);
  const video = videoRow ? {
    mediaId: videoRow.media_id,
    sha256: videoRow.sha256,
    canonicalPath: videoRow.canonical_path,
    sizeBytes: Number(videoRow.size_bytes),
    mtimeMs: Number(videoRow.mtime_ms),
    title: videoRow.title,
    durationSec: finite(videoRow.duration_sec),
    width: finite(videoRow.width),
    height: finite(videoRow.height),
    fps: finite(videoRow.fps),
    codec: videoRow.codec || "",
    pixelFormat: videoRow.pixel_format || "",
    decodeStatus: videoRow.decode_status,
    aliases: parseJson(videoRow.aliases_json, []),
    uris: parseJson(videoRow.uris_json, []),
    sourceKinds: parseJson(videoRow.source_kinds_json, []),
    provenance: parseJson(videoRow.provenance_json, []),
    relationships: parseJson(videoRow.relationships_json, []),
    tags: parseJson(videoRow.tags_json, []),
    technical: parseJson(videoRow.technical_json, {}),
    referencePolicy: parseJson(videoRow.reference_policy_json, {}),
  } : null;
  const frames = db.prepare(`SELECT f.frame_id,f.marker,f.at_seconds,f.path,f.uri,f.source,f.width,f.height,f.fingerprint_json,
      r.status,r.provider,r.text_lines_json,r.labels_json,r.fingerprint_json AS recognition_fingerprint_json,r.raw_json
    FROM frames f LEFT JOIN recognition r ON r.frame_id=f.frame_id WHERE f.media_id=? ORDER BY f.marker`).all(mediaId)
    .map((row) => ({
      frameId: row.frame_id,
      marker: row.marker,
      atSeconds: finite(row.at_seconds),
      path: row.path,
      uri: row.uri || "",
      source: row.source,
      width: finite(row.width),
      height: finite(row.height),
      fingerprint: parseJson(row.fingerprint_json, {}),
      recognition: row.status ? {
        status: row.status,
        provider: row.provider,
        textLines: parseJson(row.text_lines_json, []),
        labels: parseJson(row.labels_json, []),
        fingerprint: parseJson(row.recognition_fingerprint_json, {}),
        raw: parseJson(row.raw_json, {}),
      } : null,
    }));
  const fingerprintInput = { schemaVersion: "hapa.echo.enrichment-input.v2", video, frames };
  if (sourcePriorOverride) fingerprintInput.sourcePriorOverride = sourcePriorOverride;
  return `sha256:${createHash("sha256").update(stableStringify(fingerprintInput)).digest("hex")}`;
}

function legacyEnrichmentInputFingerprint(db, mediaId, sourcePriorOverride = null) {
  const video = db.prepare("SELECT updated_at,decode_status,sha256 FROM videos WHERE media_id=?").get(mediaId);
  const frames = db.prepare(`SELECT f.frame_id,f.marker,f.updated_at,r.recognized_at,r.status
    FROM frames f LEFT JOIN recognition r ON r.frame_id=f.frame_id WHERE f.media_id=? ORDER BY f.marker`).all(mediaId);
  const fingerprintInput = { video, frames };
  if (sourcePriorOverride) fingerprintInput.sourcePriorOverride = sourcePriorOverride;
  return `sha256:${createHash("sha256").update(stableStringify(fingerprintInput)).digest("hex")}`;
}

function enrichmentPayloadComplete(payload, inputFingerprint = null) {
  const acceptedFingerprints = inputFingerprint instanceof Set ? inputFingerprint
    : new Set((Array.isArray(inputFingerprint) ? inputFingerprint : [inputFingerprint]).filter(Boolean));
  return payload?.schemaVersion === SCHEMA_VERSION
    && (!acceptedFingerprints.size || acceptedFingerprints.has(payload?.inputFingerprint))
    && FRAME_MARKERS.every((marker) => payload.recognition?.frames?.some((frame) => frame.marker === marker));
}

function upsertEnrichment(db, payload) {
  const existing = db.prepare("SELECT * FROM enrichments WHERE media_id=?").get(payload.mediaId);
  if (existing) {
    const currentPayload = parseJson(existing.payload_json, {});
    const desiredPayload = { ...payload };
    delete currentPayload.updatedAt;
    delete desiredPayload.updatedAt;
    const current = {
      schemaVersion: existing.schema_version,
      status: existing.status,
      synopsis: existing.synopsis,
      semantic: parseJson(existing.semantic_json, {}),
      quality: parseJson(existing.quality_json, {}),
      sourcePrior: parseJson(existing.source_prior_json, {}),
      continuity: parseJson(existing.continuity_json, {}),
      canon: parseJson(existing.canon_json, {}),
      payload: currentPayload,
    };
    const desired = {
      schemaVersion: payload.schemaVersion,
      status: payload.status,
      synopsis: payload.recognition.synopsis,
      semantic: payload.semantic,
      quality: payload.quality,
      sourcePrior: payload.sourcePrior,
      continuity: payload.continuity,
      canon: payload.canon,
      payload: desiredPayload,
    };
    if (semanticallyEqual(current, desired)) return false;
  }
  const changedAt = now();
  payload.updatedAt = changedAt;
  db.prepare(`INSERT INTO enrichments (media_id,schema_version,status,synopsis,semantic_json,quality_json,source_prior_json,continuity_json,canon_json,payload_json,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(media_id) DO UPDATE SET schema_version=excluded.schema_version,status=excluded.status,synopsis=excluded.synopsis,
      semantic_json=excluded.semantic_json,quality_json=excluded.quality_json,source_prior_json=excluded.source_prior_json,
      continuity_json=excluded.continuity_json,canon_json=excluded.canon_json,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .run(
      payload.mediaId,
      payload.schemaVersion,
      payload.status,
      payload.recognition.synopsis,
      json(payload.semantic),
      json(payload.quality),
      json(payload.sourcePrior),
      json(payload.continuity),
      json(payload.canon),
      json(payload),
      changedAt,
    );
  return true;
}

export async function finalizeCatalog(db, options) {
  const mapper = await optionalCanonMapper(options);
  const report = { videos: 0, created: 0, reused: 0, decoded: 0, decodeFailed: 0, playable: 0, nonPlayable: 0, mapper: mapper ? "echo-video-canon-mapper" : "fallback-explicit-relationship-projection", warnings: [] };
  const canonContext = mapper ? await loadCanonContext(options, report) : {};
  const sourcePriorOverrides = await loadSourcePriorOverrides(options, report, { required: true });
  report.sourcePriorOverrides = {
    path: sourcePriorOverrides.path,
    authority: sourcePriorOverrides.authority,
    records: sourcePriorOverrides.byMediaId.size,
    applied: 0,
  };
  const rows = db.prepare("SELECT * FROM videos ORDER BY media_id").all()
    .filter((row) => inShard(row.canonical_path || row.media_id, options))
    .filter((row) => !options.mediaIds?.length || options.mediaIds.includes(row.media_id));
  const selected = options.limit ? rows.slice(0, options.limit) : rows;
  report.videos = selected.length;
  for (const row of selected) {
    const sourcePriorOverride = sourcePriorOverrides.byMediaId.get(row.media_id) || null;
    const inputFingerprint = enrichmentInputFingerprint(db, row.media_id, sourcePriorOverride);
    const acceptedInputFingerprints = new Set([
      inputFingerprint,
      legacyEnrichmentInputFingerprint(db, row.media_id, sourcePriorOverride),
    ]);
    const existing = db.prepare("SELECT payload_json,status FROM enrichments WHERE media_id=?").get(row.media_id);
    const existingPayload = parseJson(existing?.payload_json, null);
    if (!options.force && existing?.status === "ready" && enrichmentPayloadComplete(existingPayload, acceptedInputFingerprints)) {
      report.reused += 1;
      increment(report, existingPayload.decodeStatus === "decoded" ? "decoded" : "decodeFailed");
      increment(report, existingPayload.playable === true ? "playable" : "nonPlayable");
      continue;
    }
    const video = videoRecordFromRow(row);
    if (sourcePriorOverride) {
      video.provenance = uniqueObjects([...video.provenance, sourcePriorOverride.provenanceEvidence]);
      video.sourceKinds = unique([...video.sourceKinds, `source-prior-override:${sourcePriorOverride.sourceClass}`]);
      report.sourcePriorOverrides.applied += 1;
    }
    const frames = frameEvaluations(db, video.mediaId);
    const fallbackSemantic = semanticSummary(video, frames);
    let quality = qualityForVideo(video, frames, fallbackSemantic);
    const flow = flowForVideo(frames, video);
    const sourcePrior = classifySourcePrior(video.provenance, video.aliases, video.technical, video.referencePolicy);
    let mapped = null;
    if (mapper) {
      try {
        mapped = await mapper({
          media: {
            ...video,
            id: video.mediaId,
            mediaId: video.mediaId,
            uri: runtimeUriForVideo(row, options),
            width: video.width,
            height: video.height,
            durationSec: video.durationSec,
          },
          observations: canonObservationsFromFrames(frames),
          ...canonContext,
        });
        quality = {
          ...scoreIntrinsicQuality(mergeQualityInputs(mapped?.intrinsicQualityInputs, quality.inputs)),
          inputs: mergeQualityInputs(mapped?.intrinsicQualityInputs, quality.inputs),
          endpointEvidence: quality.endpointEvidence,
        };
      } catch (error) {
        report.warnings.push(`${video.mediaId} canon mapper failed: ${error.message}`);
      }
    }
    const mappedTags = list(mapped?.tags);
    const semantic = {
      ...fallbackSemantic,
      synopsis: mapped?.directedSynopsis?.synopsis || fallbackSemantic.synopsis,
      arcSynopsis: mapped?.directedSynopsis?.synopsis || fallbackSemantic.arcSynopsis,
      tags: unique([...mappedTags.map((tag) => tag?.tag).filter(Boolean), ...fallbackSemantic.tags]),
    };
    const mappedRelationships = list(mapped?.relationships);
    const relationships = uniqueObjects([...video.relationships, ...mappedRelationships]);
    const referenceMatches = mapped
      ? uniqueObjects(list(mapped.referenceMatches))
      : uniqueObjects(relationships.filter((relationship) => /reference|lore/iu.test(String(relationship?.ownerType || relationship?.role || ""))));
    const canon = mapped ? {
      schemaVersion: mapped.schemaVersion,
      status: "evidence-mapped-with-truth-boundary",
      truthBoundary: mapped.truthBoundary,
      directedSynopsis: mapped.directedSynopsis,
      observedFrames: mapped.frames,
      characterMatches: mapped.characterMatches,
      referenceMatches: mapped.referenceMatches,
      songStoryCandidates: mapped.songStoryCandidates,
      totals: mapped.totals,
      claimsHumanApproval: false,
    } : {
      schemaVersion: `${SCHEMA_VERSION}.canon-map.v1`,
      status: relationships.length ? "explicit-relationship-projection" : "unmapped",
      mapper: mapper ? "mapper-returned-no-canon" : "fallback-explicit-relationship-projection",
      claimsHumanApproval: false,
    };
    const runtimeUri = runtimeUriForVideo(row, options);
    const staticSingleFrame = staticSingleFrameEvidence(video, frames);
    const directorPlayable = Boolean(runtimeUri) && video.decodeStatus === "decoded" && !staticSingleFrame;
    const effectiveFlow = staticSingleFrame ? {
      loop: {
        ...flow.loop,
        classification: "static-hold",
        eligible: false,
        rationale: "The source contains one static image frame; it is a hold asset, not a temporal loop.",
      },
      transition: {
        ...flow.transition,
        classification: "not-transition-static-hold",
        eligible: false,
        rationale: "A one-frame hold cannot provide a temporal keyframe-to-keyframe transition.",
      },
    } : flow;
    const evidenceFrames = frames.map((frame) => ({
      ...frame,
      temporalEvidenceStatus: staticSingleFrame
        ? frame.marker === "first" ? "sole-source-frame" : "derived-static-hold"
        : frame.evaluationStatus,
    }));
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      inputFingerprint,
      id: video.mediaId,
      mediaId: video.mediaId,
      contentHash: { algorithm: "sha256", value: video.sha256 },
      sha256: video.sha256,
      title: video.title,
      path: video.canonicalPath,
      runtimeUri,
      playable: directorPlayable,
      mediaKind: video.decodeStatus !== "decoded" ? "non-video-generation-metadata"
        : staticSingleFrame ? "static-single-frame" : "video",
      uris: unique([runtimeUri, ...video.uris].filter(Boolean)),
      aliases: video.aliases,
      sourceKinds: video.sourceKinds,
      sourcePrior,
      technical: {
        ...video.technical,
        status: video.decodeStatus,
        width: video.width,
        height: video.height,
        durationSec: video.durationSec,
        fps: video.fps,
        codec: video.codec,
        pixelFormat: video.pixelFormat,
        archivalSha256: video.sha256,
      },
      decodeStatus: video.decodeStatus,
      evidenceStatus: video.decodeStatus !== "decoded" ? "decode-unavailable"
        : staticSingleFrame ? "static-single-frame-evaluated"
        : frames.every((frame) => ["ready", "partial"].includes(frame.evaluationStatus)) ? "three-frame-evaluated"
          : "partial-three-frame-evidence",
      recognition: {
        provider: "local-apple-vision+perceptual-hashes",
        frames: evidenceFrames,
        synopsis: semantic.synopsis,
        arcSynopsis: semantic.arcSynopsis,
        tags: mappedTags.length ? mappedTags : semantic.tags.map((tag) => ({ tag, status: "inferred-from-three-frame-evidence", confidence: fixed(frames.reduce((sum, frame) => sum + frame.confidence, 0) / 3), supportingFrameIds: frames.filter((frame) => frame.available).map((frame) => frame.frameId) })),
      },
      semantic: {
        ocrText: semantic.ocrText,
        labels: semantic.labels,
        confidentLabels: semantic.confidentLabels,
        provisionalLabels: semantic.provisionalLabels,
        labelPolicy: semantic.labelPolicy,
        tags: semantic.tags,
        motifs: semantic.motifs,
        characters: list(mapped?.characterMatches),
        scenes: list(mapped?.scenes),
        references: referenceMatches,
        songContexts: list(mapped?.songStoryCandidates),
      },
      songIds: unique(list(mapped?.songStoryCandidates)
        .filter((match) => ["exact-song-relationship", "explicit-context-relationship"].includes(match?.matchClass))
        .map((match) => match.songId)),
      relationships,
      referenceMatches,
      quality,
      flow: { loop: effectiveFlow.loop, transition: effectiveFlow.transition },
      continuity: { loop: effectiveFlow.loop, transition: effectiveFlow.transition, endpoint: flow.endpoint, middleIntervals: [flow.midEntry, flow.midExit] },
      referencePolicy: video.referencePolicy,
      provenance: video.provenance,
      canon,
      status: "ready",
      updatedAt: now(),
    };
    upsertEnrichment(db, payload);
    report.created += 1;
    increment(report, video.decodeStatus === "decoded" ? "decoded" : "decodeFailed");
    increment(report, directorPlayable ? "playable" : "nonPlayable");
  }
  return report;
}

function percentileMap(rows, valueForRow) {
  const scored = rows.map((row) => ({ row, value: Number(valueForRow(row)) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => left.value - right.value || String(left.row.media_id || left.row.mediaId).localeCompare(String(right.row.media_id || right.row.mediaId)));
  const output = new Map();
  if (!scored.length) return output;
  for (let index = 0; index < scored.length;) {
    let end = index + 1;
    while (end < scored.length && scored[end].value === scored[index].value) end += 1;
    const midpoint = (index + end - 1) / 2;
    const percentile = scored.length === 1 ? 100 : fixed((midpoint / (scored.length - 1)) * 100, 2);
    for (let cursor = index; cursor < end; cursor += 1) {
      output.set(scored[cursor].row.media_id || scored[cursor].row.mediaId, percentile);
    }
    index = end;
  }
  return output;
}

export function updateQualityPercentiles(db) {
  const rows = db.prepare("SELECT media_id,quality_json,source_prior_json FROM enrichments WHERE status='ready' ORDER BY media_id").all()
    .map((row) => ({ ...row, quality: parseJson(row.quality_json, {}), sourcePrior: parseJson(row.source_prior_json, {}) }));
  const global = percentileMap(rows, (row) => row.quality?.score);
  const bySource = new Map();
  for (const row of rows) {
    const sourceClass = String(row.sourcePrior?.sourceClass || "unknown");
    if (!bySource.has(sourceClass)) bySource.set(sourceClass, []);
    bySource.get(sourceClass).push(row);
  }
  const withinSource = new Map();
  for (const sourceRows of bySource.values()) {
    for (const [mediaId, percentile] of percentileMap(sourceRows, (row) => row.quality?.score)) withinSource.set(mediaId, percentile);
  }
  const update = db.prepare("UPDATE enrichments SET quality_json=?,payload_json=?,updated_at=? WHERE media_id=?");
  let updated = 0;
  let reused = 0;
  for (const row of rows) {
    const persisted = db.prepare("SELECT payload_json FROM enrichments WHERE media_id=?").get(row.media_id);
    const payload = parseJson(persisted?.payload_json, {});
    const nextQuality = {
      ...payload.quality,
      percentile: global.get(row.media_id) ?? null,
      withinSourcePercentile: withinSource.get(row.media_id) ?? null,
      relativeToCorpus: true,
      relativeRankingBasis: "intrinsic-quality-score-before-source-prior",
    };
    if (semanticallyEqual(payload.quality || {}, nextQuality)) {
      reused += 1;
      continue;
    }
    const changedAt = now();
    payload.quality = nextQuality;
    payload.updatedAt = changedAt;
    update.run(json(payload.quality), json(payload), changedAt, row.media_id);
    updated += 1;
  }
  return { videosRanked: rows.length, sourceClasses: bySource.size, updated, reused };
}

function payloadFrame(payload, marker) {
  return list(payload?.recognition?.frames).find((frame) => normalizeMarker(frame?.marker || frame?.role) === marker) || {};
}

function aspectClass(payload) {
  const width = Number(payload?.technical?.width || 0);
  const height = Number(payload?.technical?.height || 0);
  if (!width || !height) return "unknown";
  const ratio = width / height;
  return ratio < 0.8 ? "vertical" : ratio > 1.25 ? "horizontal" : "square";
}

function chainBucketKeys(payload, marker) {
  const frame = payloadFrame(payload, marker);
  const fingerprint = frame?.fingerprint || {};
  const keys = [
    fingerprint.phash ? `p:${String(fingerprint.phash).slice(0, 2)}` : null,
    fingerprint.dhash ? `d:${String(fingerprint.dhash).slice(0, 2)}` : null,
    `a:${aspectClass(payload)}`,
    ...frameLabelIds(frame).slice(0, 4).map((label) => `l:${label.toLowerCase()}`),
  ];
  return unique(keys.filter(Boolean));
}

function semanticTokensForChain(payload) {
  return unique([
    ...list(payload?.semantic?.tags),
    ...list(payload?.semantic?.motifs),
    ...list(payload?.recognition?.tags).map((tag) => tag?.tag || tag),
    ...list(payload?.semantic?.songContexts).flatMap((context) => [context?.songId, ...list(context?.matchedTokens)]),
  ].map((value) => String(value || "").toLowerCase()).filter(Boolean));
}

function entityTokensForChain(payload) {
  return unique([
    ...list(payload?.semantic?.characters).flatMap((row) => [row?.avatarId, row?.title, row?.name]),
    ...list(payload?.semantic?.references).flatMap((row) => [row?.cardId, row?.title, ...list(row?.matchedTokens)]),
    ...list(payload?.semantic?.confidentLabels).map((row) => row?.identifier || row?.tag || row),
  ].map((value) => String(value || "").toLowerCase()).filter(Boolean));
}

function aspectSafety(left, right) {
  const leftWidth = Number(left?.technical?.width || 0);
  const leftHeight = Number(left?.technical?.height || 0);
  const rightWidth = Number(right?.technical?.width || 0);
  const rightHeight = Number(right?.technical?.height || 0);
  if (!leftWidth || !leftHeight || !rightWidth || !rightHeight) return 0;
  const leftRatio = leftWidth / leftHeight;
  const rightRatio = rightWidth / rightHeight;
  return clamp(Math.min(leftRatio, rightRatio) / Math.max(leftRatio, rightRatio));
}

function internalMotion(payload) {
  const first = payloadFrame(payload, "first");
  const last = payloadFrame(payload, "last");
  const similarity = fingerprintSimilarity(first?.fingerprint, last?.fingerprint);
  const firstLuma = Number(first?.fingerprint?.lumaMean);
  const lastLuma = Number(last?.fingerprint?.lumaMean);
  return {
    magnitude: clamp(1 - similarity.hash),
    lumaDirection: Number.isFinite(firstLuma) && Number.isFinite(lastLuma) ? clamp((lastLuma - firstLuma + 1) / 2) : 0.5,
  };
}

function chainFeatures(payload) {
  return {
    first: payloadFrame(payload, "first"),
    last: payloadFrame(payload, "last"),
    entityTokens: entityTokensForChain(payload),
    semanticTokens: semanticTokensForChain(payload),
    characterIds: list(payload?.semantic?.characters).map((row) => row?.avatarId).filter(Boolean),
    explicitEntityEvidence: list(payload?.semantic?.characters).length > 0 || list(payload?.semantic?.references).length > 0,
    explicitMotifEvidence: list(payload?.semantic?.references).length > 0 || list(payload?.semantic?.songContexts).length > 0,
    motion: internalMotion(payload),
  };
}

function chainEdgePayload(source, target, sharedBucketKeys, sourceFeatures = chainFeatures(source), targetFeatures = chainFeatures(target)) {
  const sourceExit = sourceFeatures.last;
  const targetEntry = targetFeatures.first;
  const appearance = fingerprintSimilarity(sourceExit?.fingerprint, targetEntry?.fingerprint);
  const sourceLabels = frameLabelIds(sourceExit);
  const targetLabels = frameLabelIds(targetEntry);
  const entityContinuity = setSimilarity(sourceFeatures.entityTokens, targetFeatures.entityTokens);
  const motifContinuity = setSimilarity(sourceFeatures.semanticTokens, targetFeatures.semanticTokens);
  const sourceMotion = sourceFeatures.motion;
  const targetMotion = targetFeatures.motion;
  const motionContinuity = clamp(1 - 0.65 * Math.abs(sourceMotion.magnitude - targetMotion.magnitude)
    - 0.35 * Math.abs(sourceMotion.lumaDirection - targetMotion.lumaDirection));
  const perceptualConfidence = [sourceExit, targetEntry].every((frame) => frame?.available && completeFingerprint(frame?.fingerprint)) ? 0.92 : 0.1;
  const semanticConfidence = Math.min(frameSemanticLabelConfidence(sourceExit), frameSemanticLabelConfidence(targetEntry));
  const entityConfidence = sourceFeatures.explicitEntityEvidence && targetFeatures.explicitEntityEvidence ? 0.75 : semanticConfidence;
  const motifConfidence = sourceFeatures.explicitMotifEvidence && targetFeatures.explicitMotifEvidence ? 0.7 : semanticConfidence;
  const edge = scoreChainEdge({
    endpointAppearance: metric(appearance.hash, perceptualConfidence, "Last→first perceptual hash affinity.", [appearance], "measured"),
    subjectRoiContinuity: metric(setSimilarity(sourceLabels, targetLabels) * semanticConfidence, semanticConfidence, "Confidence-gated Vision label overlap is a bounded subject/ROI proxy.", [], "inferred"),
    paletteContinuity: metric(appearance.luma, perceptualConfidence, "Last→first luminance continuity.", [appearance], "measured"),
    motionDirectionContinuity: metric(motionContinuity, perceptualConfidence * 0.8, "Three-frame motion magnitude and luminance-direction compatibility.", [sourceMotion, targetMotion], "inferred"),
    aspectCropSafety: metric(aspectSafety(source, target), 0.9, "Measured aspect-ratio compatibility.", [], "measured"),
    entityActionContinuity: metric(entityContinuity * entityConfidence, entityConfidence, "Confidence-gated visual entities or explicit mapped relationships only.", [], "inferred"),
    characterCanonContinuity: metric(setSimilarity(
      sourceFeatures.characterIds,
      targetFeatures.characterIds,
    ), sourceFeatures.characterIds.length && targetFeatures.characterIds.length ? 0.75 : 0.1, "Only mapped character identifiers contribute.", [], "source-evidenced"),
    motifStoryContinuity: metric(motifContinuity * motifConfidence, motifConfidence, "Confidence-gated motifs or explicit reference/song-context overlap.", [], "inferred"),
  });
  return { edge, appearance, sourceLabels, targetLabels, entityContinuity, motifContinuity, motionContinuity, sharedBucketKeys };
}

export function buildChainGraph(db, options) {
  const payloads = [];
  for (const row of db.prepare("SELECT payload_json FROM enrichments WHERE status='ready' ORDER BY media_id").iterate()) {
    const payload = compactEnrichmentForDirector(parseJson(row.payload_json, {}));
    if (payload?.mediaId && payload.playable === true && payload.decodeStatus === "decoded" && payload.mediaKind === "video") payloads.push(payload);
  }
  const features = new Map(payloads.map((payload) => [payload.mediaId, chainFeatures(payload)]));
  const firstBuckets = new Map();
  for (const payload of payloads) for (const key of chainBucketKeys(payload, "first")) {
    if (!firstBuckets.has(key)) firstBuckets.set(key, []);
    firstBuckets.get(key).push(payload);
  }
  const upsert = db.prepare(`INSERT INTO chain_edges (edge_id,source_media_id,target_media_id,source_frame_id,target_frame_id,kind,score,confidence,classification,bucket_keys_json,evidence_json,rubric_json,status,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(edge_id) DO UPDATE SET score=excluded.score,confidence=excluded.confidence,classification=excluded.classification,
      bucket_keys_json=excluded.bucket_keys_json,evidence_json=excluded.evidence_json,rubric_json=excluded.rubric_json,status=excluded.status,updated_at=excluded.updated_at`);
  const output = [];
  for (const source of payloads) {
    const sourceKeys = chainBucketKeys(source, "last");
    const candidates = new Map();
    for (const key of sourceKeys) {
      const bucket = firstBuckets.get(key) || [];
      if (bucket.length > options.maxBucketSize) continue;
      for (const target of bucket) {
        if (target.mediaId === source.mediaId) continue;
        if (!candidates.has(target.mediaId)) candidates.set(target.mediaId, { target, keys: [] });
        candidates.get(target.mediaId).keys.push(key);
      }
    }
    const scored = [...candidates.values()].map(({ target, keys }) => ({
      target,
      ...chainEdgePayload(source, target, unique(keys), features.get(source.mediaId), features.get(target.mediaId)),
    }))
      .filter((row) => row.edge.score >= options.edgeThreshold)
      .sort((left, right) => right.edge.score - left.edge.score || left.target.mediaId.localeCompare(right.target.mediaId))
      .slice(0, 6);
    for (const row of scored) {
      const sourceFrameId = payloadFrame(source, "last")?.frameId;
      const targetFrameId = payloadFrame(row.target, "first")?.frameId;
      if (!sourceFrameId || !targetFrameId) continue;
      const edgeId = `echo-chain:${createHash("sha256").update(`${source.mediaId}\0${row.target.mediaId}\0last-to-first`).digest("hex").slice(0, 32)}`;
      const evidence = {
        endpointAppearance: row.appearance,
        sourceLabels: row.sourceLabels,
        targetLabels: row.targetLabels,
        entityContinuity: fixed(row.entityContinuity),
        motifContinuity: fixed(row.motifContinuity),
        motionContinuity: fixed(row.motionContinuity),
      };
      output.push({
        id: edgeId,
        sourceMediaId: source.mediaId,
        targetMediaId: row.target.mediaId,
        sourceFrameId,
        targetFrameId,
        kind: "last-to-first",
        score: row.edge.score,
        confidence: row.edge.confidence,
        classification: row.edge.classification,
        sharedBucketKeys: row.sharedBucketKeys,
        evidence,
        rubric: row.edge,
      });
    }
  }
  output.sort((left, right) => left.sourceMediaId.localeCompare(right.sourceMediaId) || right.score - left.score || left.targetMediaId.localeCompare(right.targetMediaId));
  const existingEdges = new Map(db.prepare("SELECT * FROM chain_edges ORDER BY edge_id").all().map((row) => [row.edge_id, row]));
  const desiredEdgeIds = new Set(output.map((edge) => edge.id));
  const remove = db.prepare("DELETE FROM chain_edges WHERE edge_id=?");
  for (const edgeId of existingEdges.keys()) if (!desiredEdgeIds.has(edgeId)) remove.run(edgeId);
  for (const edge of output) {
    const desired = {
      edgeId: edge.id,
      sourceMediaId: edge.sourceMediaId,
      targetMediaId: edge.targetMediaId,
      sourceFrameId: edge.sourceFrameId,
      targetFrameId: edge.targetFrameId,
      kind: edge.kind,
      score: edge.score,
      confidence: edge.confidence,
      classification: edge.classification,
      sharedBucketKeys: edge.sharedBucketKeys,
      evidence: edge.evidence,
      rubric: edge.rubric,
      status: "ready",
    };
    const row = existingEdges.get(edge.id);
    const current = row ? {
      edgeId: row.edge_id,
      sourceMediaId: row.source_media_id,
      targetMediaId: row.target_media_id,
      sourceFrameId: row.source_frame_id,
      targetFrameId: row.target_frame_id,
      kind: row.kind,
      score: Number(row.score),
      confidence: Number(row.confidence),
      classification: row.classification,
      sharedBucketKeys: parseJson(row.bucket_keys_json, []),
      evidence: parseJson(row.evidence_json, {}),
      rubric: parseJson(row.rubric_json, {}),
      status: row.status,
    } : null;
    if (current && semanticallyEqual(current, desired)) continue;
    upsert.run(edge.id, edge.sourceMediaId, edge.targetMediaId, edge.sourceFrameId, edge.targetFrameId, edge.kind, edge.score,
      edge.confidence, edge.classification, json(edge.sharedBucketKeys), json(edge.evidence), json(edge.rubric), "ready", now());
  }
  const alternates = Object.fromEntries(payloads.map((payload) => [payload.mediaId, []]));
  for (const edge of output) alternates[edge.sourceMediaId].push({ targetMediaId: edge.targetMediaId, score: edge.score, relation: edge.kind });
  const declaredTransitions = payloads.filter((payload) => payload.flow?.transition?.declaredTransition === true).map((payload) => ({
    transitionMediaId: payload.mediaId,
    classification: payload.flow.transition.classification,
    visualClassification: payload.flow.transition.visualClassification,
    visuallyValidated: payload.flow.transition.visuallyValidated === true,
    sourceFrame: payload.flow.transition.declaredEndpoints?.first || null,
    targetFrame: payload.flow.transition.declaredEndpoints?.last || null,
    transitionLink: payload.flow.transition.declaredEndpoints?.link || null,
    truthBoundary: payload.flow.transition.truthBoundary,
  }));
  return {
    schemaVersion: CHAIN_GRAPH_SCHEMA_VERSION,
    generatedAt: now(),
    method: "bounded-last-to-first-perceptual-semantic-buckets-v1",
    threshold: options.edgeThreshold,
    nodes: payloads.map((payload) => ({
      id: payload.mediaId,
      qualityScore: payload.quality?.score ?? null,
      loop: payload.flow?.loop?.classification,
      transition: payload.flow?.transition?.classification,
      transitionVisualClassification: payload.flow?.transition?.visualClassification,
      transitionDeclared: payload.flow?.transition?.declaredTransition === true,
      transitionVisuallyValidated: payload.flow?.transition?.visuallyValidated === true,
      transitionEndpoints: payload.flow?.transition?.declaredEndpoints || null,
    })),
    edges: output,
    declaredTransitions,
    alternatesBySource: alternates,
    totals: {
      nodes: payloads.length,
      edges: output.length,
      declaredTransitions: declaredTransitions.length,
      sourcesWithEdges: new Set(output.map((edge) => edge.sourceMediaId)).size,
    },
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => value[key] === undefined ? [] : [[key, canonicalize(value[key])]]));
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, content);
  await rename(temporary, filePath);
}

async function atomicWriteIfChanged(filePath, content) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  try {
    const current = await readFile(filePath);
    if (current.equals(next)) return false;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await atomicWrite(filePath, next);
  return true;
}

function ndjson(rows) {
  return `${rows.map((row) => stableStringify(row)).join("\n")}\n`;
}

function qualitySummary(enrichments) {
  const scores = enrichments.map((row) => Number(row?.quality?.score)).filter(Number.isFinite).sort((left, right) => left - right);
  const at = (ratio) => scores.length ? scores[Math.min(scores.length - 1, Math.floor((scores.length - 1) * ratio))] : null;
  return { scored: scores.length, minimum: scores[0] ?? null, p25: at(0.25), median: at(0.5), p75: at(0.75), maximum: scores.at(-1) ?? null };
}

function compactReferenceMatch(match = {}) {
  return {
    cardId: match.cardId,
    revisionId: match.revisionId,
    title: match.title,
    matchClass: match.matchClass,
    truthStatus: match.truthStatus,
    confidence: match.confidence,
    matchedTokens: list(match.matchedTokens).slice(0, 16),
    supportingFrameIds: list(match.supportingFrameIds).slice(0, 3),
    reviewStatus: match.reviewStatus,
    sourceCanonStatus: match.sourceCanonStatus,
    mappingCanonStatus: match.mappingCanonStatus,
    canonPromoted: false,
    rightsStatus: match.rights?.licenseStatus || match.rights?.status || null,
    caveats: list(match.caveats).slice(0, 3),
  };
}

function compactSongContext(context = {}) {
  const compactCitation = (citation = {}) => ({
    kind: citation.kind,
    id: citation.id,
    text: citation.text,
    startSeconds: citation.startSeconds,
    endSeconds: citation.endSeconds,
    section: citation.section,
    sceneId: citation.sceneId,
    cardId: citation.cardId,
    matchedTokens: list(citation.matchedTokens).slice(0, 12),
    affinity: citation.affinity,
  });
  return {
    songId: context.songId,
    title: context.title,
    matchClass: context.matchClass,
    truthStatus: context.truthStatus,
    confidence: context.confidence,
    relationshipEvidence: list(context.relationshipEvidence).slice(0, 4).map((row) => ({ type: row?.type, ids: list(row?.ids).slice(0, 6) })),
    lyricCitations: list(context.lyricCitations).slice(0, 2).map(compactCitation),
    storyCitations: list(context.storyCitations).slice(0, 2).map(compactCitation),
    matchedTokens: list(context.matchedTokens).slice(0, 16),
    canonPromoted: false,
  };
}

function compactRubric(value = {}) {
  return {
    schemaVersion: value.schemaVersion,
    score: value.score,
    scorePercent: value.scorePercent,
    normalizedScore: value.normalizedScore,
    classification: value.classification,
    visualClassification: value.visualClassification,
    visuallyValidated: value.visuallyValidated,
    declaredTransition: value.declaredTransition,
    declaredEvidence: list(value.declaredEvidence).slice(0, 8),
    declaredEndpoints: value.declaredEndpoints,
    truthBoundary: value.truthBoundary,
    eligible: value.eligible,
    tier: value.tier,
    qualityTier: value.qualityTier,
    coverage: value.coverage,
    confidence: value.confidence,
    sourceIndependent: value.sourceIndependent,
    percentile: value.percentile,
    withinSourcePercentile: value.withinSourcePercentile,
    relativeToCorpus: value.relativeToCorpus,
    relativeRankingBasis: value.relativeRankingBasis,
    rationale: value.rationale,
    components: value.components ? Object.fromEntries(Object.entries(value.components).map(([key, component]) => [key, {
      score: component?.score,
      confidence: component?.confidence,
      coverage: component?.coverage,
      status: component?.status,
    }])) : undefined,
  };
}

function compactEnrichmentForDirector(row = {}) {
  const references = list(row?.semantic?.references).slice(0, 12).map(compactReferenceMatch);
  const songContexts = list(row?.semantic?.songContexts).slice(0, 4).map(compactSongContext);
  return {
    schemaVersion: row.schemaVersion,
    id: row.id,
    mediaId: row.mediaId,
    contentHash: row.contentHash,
    sha256: row.sha256,
    title: row.title,
    runtimeUri: row.runtimeUri,
    playable: row.playable,
    mediaKind: row.mediaKind,
    sourceKinds: row.sourceKinds,
    sourcePrior: row.sourcePrior,
    technical: row.technical,
    decodeStatus: row.decodeStatus,
    evidenceStatus: row.evidenceStatus,
    recognition: {
      provider: row?.recognition?.provider,
      synopsis: row?.recognition?.synopsis,
      arcSynopsis: row?.recognition?.arcSynopsis,
      frames: list(row?.recognition?.frames).map((frame) => ({
        marker: frame.marker,
        frameId: frame.frameId,
        evaluationStatus: frame.evaluationStatus,
        available: frame.available,
        unavailableReason: frame.unavailableReason,
        atSeconds: frame.atSeconds,
        confidence: frame.confidence,
        visionDescription: frame.visionDescription,
        textLines: list(frame.textLines).slice(0, 6),
        labels: list(frame.labels).slice(0, 16),
        fingerprint: frame.fingerprint,
      })),
      tags: list(row?.recognition?.tags).slice(0, 96).map((tag) => tag?.tag || tag),
    },
    semantic: {
      ocrText: row?.semantic?.ocrText,
      labels: list(row?.semantic?.labels).slice(0, 64),
      confidentLabels: list(row?.semantic?.confidentLabels).slice(0, 36),
      provisionalLabels: list(row?.semantic?.provisionalLabels).slice(0, 3),
      labelPolicy: row?.semantic?.labelPolicy,
      tags: list(row?.semantic?.tags).slice(0, 128),
      motifs: list(row?.semantic?.motifs).slice(0, 48),
      characters: list(row?.semantic?.characters).slice(0, 16),
      references,
      songContexts,
    },
    songIds: row.songIds,
    quality: compactRubric(row.quality),
    flow: { loop: compactRubric(row?.flow?.loop), transition: compactRubric(row?.flow?.transition) },
    continuity: { loop: compactRubric(row?.continuity?.loop), transition: compactRubric(row?.continuity?.transition) },
    canon: {
      schemaVersion: row?.canon?.schemaVersion,
      status: row?.canon?.status,
      truthBoundary: row?.canon?.truthBoundary,
      totals: row?.canon?.totals,
      claimsHumanApproval: false,
    },
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

export async function exportCatalog(db, options, stageReports = {}) {
  const videoRows = db.prepare(`SELECT media_id,sha256,title,canonical_path,uris_json,source_kinds_json,decode_status,
    width,height,duration_sec,fps,codec FROM videos ORDER BY media_id`).all();
  const enrichments = [];
  for (const row of db.prepare("SELECT payload_json FROM enrichments WHERE status='ready' ORDER BY media_id").iterate()) {
    enrichments.push(compactEnrichmentForDirector(parseJson(row.payload_json, {})));
  }
  const manifest = videoRows.map((row) => ({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: row.media_id,
    mediaId: row.media_id,
    contentHash: { algorithm: "sha256", value: row.sha256 },
    title: row.title,
    path: row.canonical_path,
    runtimeUri: runtimeUriForVideo(row, options),
    sourceKinds: parseJson(row.source_kinds_json, []),
    decodeStatus: row.decode_status,
    technical: { width: row.width, height: row.height, durationSec: row.duration_sec, fps: row.fps, codec: row.codec },
  }));
  const chainGraph = buildChainGraph(db, options);
  // Fingerprint the exact JSON projection that downstream compilers will read.
  // JSON removes undefined fields, so hashing the richer in-memory objects can
  // otherwise declare a batch identity that cannot be reproduced from disk.
  const persistedEnrichments = enrichments.map((row) => JSON.parse(stableStringify(row)));
  const persistedChainGraph = JSON.parse(stableStringify(chainGraph));
  const catalog = buildEchoVideoEnrichmentCatalog({
    enrichments: persistedEnrichments,
    chainGraph: persistedChainGraph,
    report: {},
  });
  const reportPath = path.join(options.outputRoot, "report.json");
  let priorReport = null;
  try {
    priorReport = JSON.parse(await readFile(reportPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const batchFingerprint = `sha256:${catalog.computedFingerprint}`;
  const generatedAt = stableBatchGeneratedAt(priorReport, batchFingerprint);
  chainGraph.generatedAt = generatedAt;
  const sourceCounts = {};
  for (const row of enrichments) increment(sourceCounts, row?.sourcePrior?.sourceClass || "unknown");
  const nextReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    batchFingerprint,
    complete: manifest.length > 0 && manifest.length === enrichments.length,
    counts: {
      manifestVideos: manifest.length,
      enrichmentRows: enrichments.length,
      playableVideos: enrichments.filter((row) => row.playable).length,
      decodedVideos: enrichments.filter((row) => row.decodeStatus === "decoded").length,
      recognitionReadyFrames: db.prepare("SELECT COUNT(*) AS count FROM recognition WHERE status IN ('ready','partial')").get().count,
      loops: enrichments.filter((row) => ["loop", "loop-candidate"].includes(row?.flow?.loop?.classification)).length,
      transitions: enrichments.filter((row) => row?.flow?.transition?.eligible === true).length,
      visuallyValidatedTransitions: enrichments.filter((row) => row?.flow?.transition?.visuallyValidated === true).length,
      declaredTransitions: enrichments.filter((row) => row?.flow?.transition?.declaredTransition === true).length,
      declaredTransitionsAwaitingVisualValidation: enrichments.filter((row) => (
        row?.flow?.transition?.declaredTransition === true && row?.flow?.transition?.visuallyValidated !== true
      )).length,
      chainEdges: chainGraph.edges.length,
    },
    quality: qualitySummary(enrichments),
    sourceClasses: sourceCounts,
    lowPriorPolicy: {
      classes: ["ltx-2.3", "hapa-dev-proto", "hell-week"],
      treatment: "selection-prior-only-never-intrinsic-quality",
      minimumPrior: 0.1,
    },
    visionLabelPolicy: {
      minimumConfidence: VISION_LABEL_MIN_CONFIDENCE,
      relativeToFrameTop: VISION_LABEL_RELATIVE_CONFIDENCE,
      maximumPerFrame: VISION_LABEL_MAX_PER_FRAME,
      rawLabelsRetained: true,
      appliesTo: ["synopsis", "catalog-tags", "canon-mapping", "quality", "loop-transition", "chain-graph"],
    },
    stages: stageReports,
    outputs: {
      database: databasePath(options),
      manifest: path.join(options.outputRoot, "manifest.ndjson"),
      enrichments: path.join(options.outputRoot, "enrichments.ndjson"),
      chainGraph: path.join(options.outputRoot, "chain-graph.json"),
    },
  };
  const reportSemanticIdentity = (value = {}) => ({
    schemaVersion: value.schemaVersion,
    batchFingerprint: value.batchFingerprint,
    complete: value.complete,
    counts: value.counts,
    quality: value.quality,
    sourceClasses: value.sourceClasses,
    lowPriorPolicy: value.lowPriorPolicy,
    visionLabelPolicy: value.visionLabelPolicy,
    outputs: value.outputs,
  });
  const report = priorReport
    && semanticallyEqual(reportSemanticIdentity(priorReport), reportSemanticIdentity(nextReport))
    ? priorReport
    : nextReport;
  await Promise.all([
    atomicWriteIfChanged(nextReport.outputs.manifest, ndjson(manifest)),
    atomicWriteIfChanged(nextReport.outputs.enrichments, ndjson(enrichments)),
    atomicWriteIfChanged(nextReport.outputs.chainGraph, `${stableStringify(chainGraph)}\n`),
    atomicWriteIfChanged(reportPath, `${stableStringify(report)}\n`),
  ]);
  return report;
}

async function outputExists(filePath) {
  return Boolean(await readableFile(filePath));
}

function dryRunPlan(options, sourceState = null) {
  return {
    schemaVersion: `${REPORT_SCHEMA_VERSION}.plan`,
    mode: options.mode,
    apply: false,
    repoRoot: options.repoRoot,
    outputRoot: options.outputRoot,
    shard: { index: options.batchIndex, count: options.batchCount },
    candidates: sourceState?.candidates?.length ?? null,
    sourceCounts: sourceState?.sourceCounts ?? null,
    stages: options.mode === "all" ? ["prepare", "recognize", "finalize"] : [options.mode],
    note: "No database, frames, enrichments, cuts, or indexes were written.",
  };
}

export async function runEchoVideoEnrichment(options = parseArgs()) {
  if (!options.apply) {
    const sourceState = ["prepare", "all"].includes(options.mode) ? await collectPreparationSources(options) : null;
    return dryRunPlan(options, sourceState);
  }
  await mkdir(options.outputRoot, { recursive: true });
  const exists = await outputExists(databasePath(options));
  if (!exists && !["prepare", "all"].includes(options.mode)) {
    throw new Error(`Enrichment database is missing; run --prepare --apply first: ${databasePath(options)}`);
  }
  const db = openDatabase(options);
  const runId = beginRun(db, options);
  const report = { schemaVersion: REPORT_SCHEMA_VERSION, mode: options.mode, shard: { index: options.batchIndex, count: options.batchCount }, stages: {} };
  try {
    if (["prepare", "all"].includes(options.mode)) {
      const sourceState = await collectPreparationSources(options);
      report.sources = { candidates: sourceState.candidates.length, counts: sourceState.sourceCounts, warnings: sourceState.warnings };
      report.stages.prepare = await prepareCatalog(db, sourceState, options);
    }
    if (options.mode === "repair-frames") report.stages.repairFrames = await repairFrameGaps(db, options);
    if (["recognize", "all"].includes(options.mode)) report.stages.recognize = await recognizeCatalog(db, options);
    if (["finalize", "all"].includes(options.mode)) {
      report.stages.finalize = await finalizeCatalog(db, options);
      if (options.batchCount === 1) {
        report.stages.percentiles = updateQualityPercentiles(db);
        report.catalog = await exportCatalog(db, options, report.stages);
      } else {
        report.stages.export = { deferred: true, reason: "Run unsharded --finalize after every recognition shard completes." };
      }
    }
    finishRun(db, runId, "complete", report);
    return report;
  } catch (error) {
    finishRun(db, runId, "failed", { ...report, error: error.message });
    throw error;
  } finally {
    db.close();
  }
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const report = await runEchoVideoEnrichment(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`Echo video enrichment failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
