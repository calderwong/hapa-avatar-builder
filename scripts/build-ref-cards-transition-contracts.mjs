#!/usr/bin/env node

import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEchoVideoEnrichmentCatalog,
  stableEchoEnrichmentStringify,
} from "../src/domain/echo-enrichment-director-variant.js";
import { probeVideo } from "./validate-echo-transition-endpoints.mjs";

const execFile = promisify(execFileCallback);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const REF_CARDS_TRANSITION_COMPILER = "hapa-ref-cards-transition-contract-builder-v1";
export const REF_CARDS_TRANSITION_POLICY_SCHEMA = "hapa.echo.ref-cards-transition-discovery-policy.v1";
export const REF_CARDS_TRANSITION_REPORT_SCHEMA = "hapa.echo.ref-cards-transition-candidate-report.v1";
export const REF_CARDS_TRANSITION_RECEIPT_SCHEMA = "hapa.echo.ref-cards-transition-contract-build-receipt.v1";
export const REF_CARDS_TRANSITION_OVERLAY_SCHEMA = "hapa.echo.ref-cards-transition-enrichment-overlay.v1";
export const REF_CARDS_TRANSITION_LINK_SCHEMA = "hapa.echo.authored-transition-link.v1";
export const ECHO_CHAIN_GRAPH_SCHEMA = "hapa.echo.video-chain-graph.v1";
export const ECHO_ENRICHMENT_REPORT_SCHEMA = "hapa.echo.video-enrichment-report.v1";
export const ECHO_ASSIGNMENT_REPORT_SCHEMA = "hapa.echo.transition-director-script-report.v1";
export const REFERENCE_CATALOG_SCHEMA = "hapa.echo-reference-animated-media-catalog.v1";
export const MEDIA_LIBRARY_SCHEMA = "hapa.system-media-library.v1";
export const HASH_CACHE_SCHEMA = "hapa.ref-cards-expanded-direction-hash-cache.v1";

const DEFAULT_OUTPUT_DIRECTORY = path.join(ROOT, "artifacts/ref-cards-transition-contracts-v1");
const DEFAULT_MEDIA_LIBRARY = path.join(ROOT, "data/media-library.json");
const DEFAULT_REFERENCE_CATALOG = path.join(ROOT, "data/echo-reference-animated-media.json");
const DEFAULT_HASH_CACHE = path.join(ROOT, "artifacts/ref-cards-expanded-direction/hash-cache-v1.json");
const DEFAULT_BASE_ENRICHMENTS = path.join(ROOT, "artifacts/echo-video-enrichment-v1/enrichments.ndjson");
const DEFAULT_PROJECTS_DIRECTORY = path.join(ROOT, "data/music-video-projects");
const DEFAULT_MEDIA_ROOT = path.join(ROOT, "data/media");
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const COARSE_SIZE = 64;
const COARSE_FRAME_BYTES = COARSE_SIZE * COARSE_SIZE;
const FIRST_LEGACY_SEEK_SECONDS = 0.02;
const LAST_LEGACY_END_GUARD_SECONDS = 0.08;

const FILENAME_TRANSITION_HINT = /(?:transition|morph|transform|becomes|turns[\s._-]*into|flows[\s._-]*into|moves[\s._-]*into|unlocks|opens[\s._-]*to|from[\s._-]*first[\s._-]*frame|into[\s._-]*(?:second|last|end)[\s._-]*frame|key[\s._-]*unlocks|fire[\s._-]*breeds|heart[\s._-]*morphs|energy[\s._-]*from[\s._-]*first|graph[\s._-]*forms|boat[\s._-]*leaves|card[\s._-]*joins)/iu;

export const REF_CARDS_TRANSITION_DISCOVERY_POLICY = Object.freeze({
  schemaVersion: REF_CARDS_TRANSITION_POLICY_SCHEMA,
  compiler: REF_CARDS_TRANSITION_COMPILER,
  sourceRoot: "ref-cards-run-1",
  sourceCohorts: Object.freeze([
    "ref-cards-run-1/root",
    "ref-cards-run-1/run2",
    "ref-cards-run-1/run2/run3",
  ]),
  sampleContract: "actual-decoded-physical-frame-index-0-and-terminal-v1",
  referenceAuthority: "independent-data/echo-reference-animated-media.json",
  coarseAlgorithm: "center-square-64px-gray-dhash-mae-luma-v1",
  shortlistSize: 5,
  thresholds: Object.freeze({
    dHashDistanceMax: 16,
    normalizedMaeMax: 0.2,
    lumaDeltaMax: 0.16,
    minimumCompositeMargin: 0.01,
    distinctEndpointCards: true,
  }),
  certificationAuthority: Object.freeze({
    script: "scripts/validate-echo-transition-endpoints.mjs",
    algorithm: "center-crop-luma-ssim-phash-edge-v3-physical-terminal-pts",
    sampleContract: "physical-terminal-frame-presentation-pts-v1",
    thresholds: Object.freeze({
      ssimMin: 0.9,
      pHashDistanceMax: 10,
      edgeCorrelationMin: 0.75,
    }),
  }),
  filenamePolicy: "hint-only-never-selection-or-certification",
  assignment: Object.freeze({
    jobsPerCanonicalSong: 2,
    maximumJobReuse: 3,
    strategy: "least-used-job-then-semantic-affinity-then-content-hash-v1",
  }),
  cutMutation: false,
});

function fail(message) {
  throw new Error(message);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function fixed(value, digits = 6) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("end", () => resolve(digest.digest("hex")));
  });
}

function sha256Contract(value) {
  return sha256Bytes(stableEchoEnrichmentStringify(value));
}

async function readJson(filePath, label) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`Cannot read ${label} ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`Cannot parse ${label} ${filePath}: ${error.message}`);
  }
}

async function readNdjson(filePath, label) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`Cannot read ${label} ${filePath}: ${error.message}`);
  }
  return source.split(/\r?\n/u).map((line, index) => ({ line, index })).filter(({ line }) => line.trim()).map(({ line, index }) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`Cannot parse ${label} line ${index + 1}: ${error.message}`);
    }
  });
}

function repoPath(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : path.resolve(filePath);
}

function option(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  if (index >= 0) {
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) fail(`${name} requires a value.`);
    return argv[index + 1];
  }
  const prefixed = argv.find((value) => value.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) fail(`${label} must be a positive integer.`);
  return parsed;
}

export function parseRefCardsTransitionContractArguments(argv = process.argv.slice(2)) {
  const known = new Set([
    "--help", "-h",
    "--media-library", "--reference-catalog", "--hash-cache", "--base-enrichments",
    "--projects", "--media-root", "--output", "--concurrency",
    "--expected-video-count", "--expected-reference-count", "--expected-song-count",
  ]);
  const valueOptions = new Set([...known].filter((name) => !["--help", "-h"].includes(name)));
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const name = raw.includes("=") ? raw.slice(0, raw.indexOf("=")) : raw;
    if (!known.has(name)) fail(`Unknown argument: ${raw}`);
    if (valueOptions.has(name) && !raw.includes("=")) index += 1;
  }
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    mediaLibraryPath: path.resolve(option(argv, "--media-library", DEFAULT_MEDIA_LIBRARY)),
    referenceCatalogPath: path.resolve(option(argv, "--reference-catalog", DEFAULT_REFERENCE_CATALOG)),
    hashCachePath: path.resolve(option(argv, "--hash-cache", DEFAULT_HASH_CACHE)),
    baseEnrichmentsPath: path.resolve(option(argv, "--base-enrichments", DEFAULT_BASE_ENRICHMENTS)),
    projectsDirectory: path.resolve(option(argv, "--projects", DEFAULT_PROJECTS_DIRECTORY)),
    mediaRoot: path.resolve(option(argv, "--media-root", DEFAULT_MEDIA_ROOT)),
    outputDirectory: path.resolve(option(argv, "--output", DEFAULT_OUTPUT_DIRECTORY)),
    concurrency: positiveInteger(option(argv, "--concurrency", "4"), "--concurrency"),
    expectedVideoCount: positiveInteger(option(argv, "--expected-video-count", "439"), "--expected-video-count"),
    expectedReferenceCount: positiveInteger(option(argv, "--expected-reference-count", "853"), "--expected-reference-count"),
    expectedSongCount: positiveInteger(option(argv, "--expected-song-count", "157"), "--expected-song-count"),
  };
}

function usage() {
  return [
    "Usage: node scripts/build-ref-cards-transition-contracts.mjs [options]",
    "",
    "Builds candidate-only Ref Cards endpoint contracts and downstream-compatible artifacts.",
    "It never writes Director cuts and never claims endpoint certification.",
    "",
    "  --media-library PATH          Ingested Hapa media library.",
    "  --reference-catalog PATH      Independent Reference animation catalog.",
    "  --hash-cache PATH             Full-file Ref Cards SHA-256 cache.",
    "  --base-enrichments PATH       Existing enrichment NDJSON to preserve and overlay.",
    "  --projects PATH               Canonical Echo project directory.",
    "  --media-root PATH             Runtime /media root.",
    "  --output PATH                 Append-only output directory.",
    "  --concurrency N               Bounded video probe/decode concurrency (default 4).",
    "  --expected-video-count N      Expected content-unique Ref Cards videos (default 439).",
    "  --expected-reference-count N  Expected independent Reference images (default 853).",
    "  --expected-song-count N       Expected canonical Echo songs (default 157).",
  ].join("\n");
}

function safeMediaPath(mediaRoot, uri, label) {
  let decoded;
  try {
    decoded = decodeURIComponent(text(uri).split(/[?#]/u)[0]);
  } catch {
    fail(`${label} URI cannot be decoded: ${uri || "<missing>"}.`);
  }
  if (!decoded.startsWith("/media/") || decoded.includes("\\") || decoded.includes("\0")) {
    fail(`${label} is not a safe runtime media URI: ${uri || "<missing>"}.`);
  }
  const root = path.resolve(mediaRoot);
  const resolved = path.resolve(root, decoded.slice("/media/".length));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`${label} escapes or aliases the media root: ${uri}.`);
  }
  return resolved;
}

function mediaName(uri) {
  let decoded;
  try {
    decoded = decodeURIComponent(text(uri).split(/[?#]/u)[0]);
  } catch {
    fail(`Runtime URI cannot be decoded: ${uri || "<missing>"}.`);
  }
  return path.posix.basename(decoded);
}

function normalizedSha256(value, label) {
  const normalized = text(value).toLowerCase().replace(/^sha256:/u, "");
  if (!SHA256_PATTERN.test(normalized)) fail(`${label} must be a SHA-256 digest.`);
  return normalized;
}

function sourceRelativePath(record) {
  const roots = list(record?.sourceRoots).map(String);
  if (!roots.includes(REF_CARDS_TRANSITION_DISCOVERY_POLICY.sourceRoot)) return "";
  return text(record?.sourceRelativePaths?.[REF_CARDS_TRANSITION_DISCOVERY_POLICY.sourceRoot]);
}

function sourceCohort(relativePath) {
  const normalized = text(relativePath).replace(/\\/gu, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized.includes("\0")) {
    fail(`Unsafe or missing Ref Cards relative path: ${relativePath || "<missing>"}.`);
  }
  if (normalized.startsWith("run2/run3/")) return "ref-cards-run-1/run2/run3";
  if (normalized.startsWith("run2/")) return "ref-cards-run-1/run2";
  if (!normalized.includes("/")) return "ref-cards-run-1/root";
  fail(`Unexpected Ref Cards cohort path: ${normalized}.`);
}

async function mapLimit(values, concurrency, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

async function runBinary(command, args, maxBuffer = 16 * 1024 * 1024) {
  try {
    const { stdout } = await execFile(command, args, { encoding: null, maxBuffer });
    return Buffer.from(stdout);
  } catch (error) {
    const detail = Buffer.isBuffer(error?.stderr) ? error.stderr.toString("utf8").trim() : text(error?.stderr);
    fail(`${command} failed${detail ? `: ${detail}` : `: ${error.message}`}`);
  }
}

async function toolVersion(command) {
  const bytes = await runBinary(command, ["-version"], 2 * 1024 * 1024);
  return bytes.toString("utf8").split(/\r?\n/u)[0].trim();
}

async function decodePhysicalTerminalFrames(filePath, frameCount) {
  if (!Number.isInteger(frameCount) || frameCount < 2) fail(`Cannot decode terminal frames from ${filePath}: invalid frame count.`);
  const lastFrameIndex = frameCount - 1;
  const filter = [
    `select=eq(n\\,0)+eq(n\\,${lastFrameIndex})`,
    `scale=${COARSE_SIZE}:${COARSE_SIZE}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${COARSE_SIZE}:${COARSE_SIZE}`,
  ].join(",");
  const bytes = await runBinary("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", filePath,
    "-vf", filter,
    "-fps_mode", "passthrough",
    "-f", "rawvideo",
    "-pix_fmt", "gray",
    "pipe:1",
  ], COARSE_FRAME_BYTES * 4);
  if (bytes.length !== COARSE_FRAME_BYTES * 2) {
    fail(`Physical terminal decode returned ${bytes.length / COARSE_FRAME_BYTES}/2 frames for ${filePath}.`);
  }
  return {
    first: Buffer.from(bytes.subarray(0, COARSE_FRAME_BYTES)),
    last: Buffer.from(bytes.subarray(COARSE_FRAME_BYTES, COARSE_FRAME_BYTES * 2)),
  };
}

async function decodeReferenceImages(references) {
  if (!references.length) fail("The independent Reference catalog has no readable images.");
  const child = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-vcodec", "png", "-i", "pipe:0",
    "-vf", `scale=${COARSE_SIZE}:${COARSE_SIZE}:force_original_aspect_ratio=increase:flags=lanczos,crop=${COARSE_SIZE}:${COARSE_SIZE}`,
    "-fps_mode", "passthrough",
    "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  const output = [];
  const errors = [];
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => errors.push(chunk));
  const spawnError = new Promise((_, reject) => child.once("error", reject));
  const feed = (async () => {
    for (const reference of references) {
      const bytes = await readFile(reference.imagePath);
      if (!child.stdin.write(bytes)) await new Promise((resolve) => child.stdin.once("drain", resolve));
    }
    child.stdin.end();
  })();
  const exitCode = await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    spawnError,
  ]);
  await feed;
  if (exitCode !== 0) fail(`ffmpeg Reference decode failed: ${Buffer.concat(errors).toString("utf8").trim()}`);
  const decoded = Buffer.concat(output);
  if (decoded.length !== references.length * COARSE_FRAME_BYTES) {
    fail(`Reference decode returned ${decoded.length / COARSE_FRAME_BYTES}/${references.length} images.`);
  }
  return references.map((reference, index) => ({
    ...reference,
    pixels: Buffer.from(decoded.subarray(index * COARSE_FRAME_BYTES, (index + 1) * COARSE_FRAME_BYTES)),
  }));
}

function differenceHash(pixels) {
  const bits = new Uint8Array(64);
  let cursor = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      let left = 0;
      let right = 0;
      for (let dy = 0; dy < 8; dy += 1) {
        for (let dx = 0; dx < 4; dx += 1) {
          left += pixels[(y * 8 + dy) * COARSE_SIZE + x * 8 + dx];
          right += pixels[(y * 8 + dy) * COARSE_SIZE + x * 8 + dx + 4];
        }
      }
      bits[cursor++] = Number(right >= left);
    }
  }
  return bits;
}

function coarseFingerprint(pixels) {
  let sum = 0;
  let sumSquares = 0;
  for (const value of pixels) {
    sum += value;
    sumSquares += value * value;
  }
  const mean = sum / pixels.length;
  return {
    dHash: differenceHash(pixels),
    lumaMean: mean / 255,
    lumaStd: Math.sqrt(Math.max(0, sumSquares / pixels.length - mean * mean)) / 255,
  };
}

function hashHex(bits) {
  let output = "";
  for (let offset = 0; offset < bits.length; offset += 4) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) value = value * 2 + (bits[offset + bit] || 0);
    output += value.toString(16);
  }
  return output;
}

function compareCoarse(left, right) {
  const leftFingerprint = left.fingerprint || (left.fingerprint = coarseFingerprint(left.pixels));
  const rightFingerprint = right.fingerprint || (right.fingerprint = coarseFingerprint(right.pixels));
  let dHashDistance = 0;
  let absolute = 0;
  for (let index = 0; index < COARSE_FRAME_BYTES; index += 1) {
    absolute += Math.abs(left.pixels[index] - right.pixels[index]);
  }
  for (let index = 0; index < leftFingerprint.dHash.length; index += 1) {
    dHashDistance += Number(leftFingerprint.dHash[index] !== rightFingerprint.dHash[index]);
  }
  const normalizedMae = absolute / COARSE_FRAME_BYTES / 255;
  const lumaDelta = Math.abs(leftFingerprint.lumaMean - rightFingerprint.lumaMean);
  const composite = (dHashDistance / 64) * 0.45 + normalizedMae * 0.45 + lumaDelta * 0.1;
  return {
    dHashDistance,
    normalizedMae: fixed(normalizedMae),
    lumaDelta: fixed(lumaDelta),
    composite: fixed(composite),
  };
}

function withinCandidateGate(match) {
  const thresholds = REF_CARDS_TRANSITION_DISCOVERY_POLICY.thresholds;
  return match
    && match.dHashDistance <= thresholds.dHashDistanceMax
    && match.normalizedMae <= thresholds.normalizedMaeMax
    && match.lumaDelta <= thresholds.lumaDeltaMax;
}

function publicMatch(match) {
  if (!match) return null;
  return {
    cardId: match.cardId,
    cardRevisionId: match.cardRevisionId,
    cardTitle: match.cardTitle,
    assetId: match.assetId,
    imageSha256: match.sha256,
    imageUri: match.uri,
    reviewStatus: match.reviewStatus,
    dHashDistance: match.dHashDistance,
    normalizedMae: match.normalizedMae,
    lumaDelta: match.lumaDelta,
    composite: match.composite,
    withinCandidateGate: withinCandidateGate(match),
  };
}

function rankEndpoint(endpoint, references) {
  return references.map((reference) => ({
    ...reference,
    ...compareCoarse(endpoint, reference),
  })).sort((left, right) => (
    left.composite - right.composite
    || left.dHashDistance - right.dHashDistance
    || left.normalizedMae - right.normalizedMae
    || left.cardId.localeCompare(right.cardId)
  )).slice(0, REF_CARDS_TRANSITION_DISCOVERY_POLICY.shortlistSize);
}

function classifyCandidate(video, firstMatches, lastMatches) {
  const first = firstMatches[0] || null;
  const last = lastMatches[0] || null;
  const firstMargin = firstMatches[1] ? firstMatches[1].composite - first.composite : 1;
  const lastMargin = lastMatches[1] ? lastMatches[1].composite - last.composite : 1;
  const minimumMargin = REF_CARDS_TRANSITION_DISCOVERY_POLICY.thresholds.minimumCompositeMargin;
  const reasons = [];
  if (!withinCandidateGate(first)) reasons.push("first-endpoint-no-reference-match");
  if (!withinCandidateGate(last)) reasons.push("last-endpoint-no-reference-match");
  if (first && last && first.cardId === last.cardId) reasons.push("entry-and-exit-reference-are-identical");
  if (withinCandidateGate(firstMatches[1]) && firstMargin < minimumMargin) reasons.push("first-endpoint-reference-ambiguous");
  if (withinCandidateGate(lastMatches[1]) && lastMargin < minimumMargin) reasons.push("last-endpoint-reference-ambiguous");
  return {
    decision: reasons.length ? "quarantine" : "declared-candidate",
    reasons,
    filenameHint: FILENAME_TRANSITION_HINT.test(video.relativePath),
    first,
    last,
    firstMargin: fixed(firstMargin),
    lastMargin: fixed(lastMargin),
  };
}

function endpointContract(reference, role, policyDigest) {
  const imageSha256 = normalizedSha256(reference.sha256, `${reference.cardId} image SHA-256`);
  return {
    schemaVersion: "hapa.echo.transition-reference-frame.v1",
    role,
    cardId: reference.cardId,
    cardRevisionId: reference.cardRevisionId,
    cardTitle: reference.cardTitle,
    assetId: reference.assetId,
    frameId: `echo-reference-frame:${imageSha256.slice(0, 24)}`,
    sha256: imageSha256,
    uri: reference.uri,
    reviewStatus: reference.reviewStatus,
    sourceCardUnchanged: true,
    discoveryPolicyDigest: `sha256:${policyDigest}`,
  };
}

function transitionJobId(videoSha256, first, last, policyDigest) {
  const digest = sha256Contract({
    schemaVersion: REF_CARDS_TRANSITION_LINK_SCHEMA,
    videoSha256,
    first: { cardId: first.cardId, sha256: first.sha256, uri: first.uri },
    last: { cardId: last.cardId, sha256: last.sha256, uri: last.uri },
    policyDigest,
  });
  return `ref-cards-transition:${digest.slice(0, 24)}`;
}

function deterministicTimestamp(...values) {
  const parsed = values.flat().map((value) => Date.parse(text(value))).filter(Number.isFinite).sort((left, right) => left - right);
  return new Date(parsed.at(-1) ?? 0).toISOString();
}

async function loadReferences(referenceCatalog, mediaRoot, expectedReferenceCount, concurrency) {
  if (referenceCatalog?.schemaVersion !== REFERENCE_CATALOG_SCHEMA) {
    fail(`Reference catalog must use ${REFERENCE_CATALOG_SCHEMA}.`);
  }
  const records = list(referenceCatalog.records);
  if (records.length !== expectedReferenceCount) {
    fail(`Expected exactly ${expectedReferenceCount} Reference records; found ${records.length}.`);
  }
  const seenCards = new Set();
  const seenHashes = new Set();
  const seenUris = new Set();
  const references = records.map((record, index) => {
    const cardId = text(record?.card?.id);
    const cardRevisionId = text(record?.card?.revisionId);
    const cardTitle = text(record?.card?.title);
    const image = record?.artifacts?.image || {};
    const uri = text(image.uri);
    const sha256 = normalizedSha256(image.sha256, `Reference record ${index} image SHA-256`);
    if (!cardId || !cardRevisionId || !cardTitle || !uri) fail(`Reference record ${index} has incomplete Card/image identity.`);
    if (record?.custody?.sourceCardUnchanged !== true) fail(`Reference Card ${cardId} does not preserve sourceCardUnchanged.`);
    if (seenCards.has(cardId)) fail(`Reference catalog duplicates Card ${cardId}.`);
    if (seenHashes.has(sha256)) fail(`Reference catalog duplicates image SHA-256 ${sha256}.`);
    if (seenUris.has(uri)) fail(`Reference catalog duplicates image URI ${uri}.`);
    seenCards.add(cardId);
    seenHashes.add(sha256);
    seenUris.add(uri);
    const imagePath = safeMediaPath(mediaRoot, uri, `Reference Card ${cardId}`);
    if (text(image.path) && path.resolve(image.path) !== imagePath) {
      fail(`Reference Card ${cardId} image path does not match its runtime URI.`);
    }
    if (path.extname(imagePath).toLowerCase() !== ".png") fail(`Reference Card ${cardId} image must be PNG for deterministic decode.`);
    return {
      cardId,
      cardRevisionId,
      cardTitle,
      assetId: `${cardId}:image`,
      imagePath,
      sha256,
      uri,
      reviewStatus: text(record?.custody?.reviewStatus, "unreviewed"),
    };
  }).sort((left, right) => left.cardId.localeCompare(right.cardId));
  await mapLimit(references, concurrency, async (reference) => {
    const fileStat = await stat(reference.imagePath).catch((error) => fail(`Cannot read Reference image ${reference.imagePath}: ${error.message}`));
    if (!fileStat.isFile() || fileStat.size < 1) fail(`Reference image is missing or empty: ${reference.imagePath}.`);
    const actualSha256 = await sha256File(reference.imagePath).catch((error) => fail(`Cannot hash Reference image ${reference.imagePath}: ${error.message}`));
    if (actualSha256 !== reference.sha256) fail(`Reference image SHA-256 mismatch for ${reference.cardId}.`);
  });
  return decodeReferenceImages(references);
}

async function loadRefCardsVideos(mediaLibrary, hashCache, mediaRoot, expectedVideoCount, concurrency) {
  if (mediaLibrary?.schemaVersion !== MEDIA_LIBRARY_SCHEMA) fail(`Media library must use ${MEDIA_LIBRARY_SCHEMA}.`);
  if (hashCache?.schemaVersion !== HASH_CACHE_SCHEMA || !hashCache.entries || typeof hashCache.entries !== "object") {
    fail(`Hash cache must use ${HASH_CACHE_SCHEMA}.`);
  }
  const ingestedRecords = list(mediaLibrary.records).filter((record) => (
    record?.sourceKind === "folder-video" && sourceRelativePath(record)
  ));
  if (!ingestedRecords.length) fail("No ingested Ref Cards videos were found.");
  const probed = await mapLimit(ingestedRecords, concurrency, async (record) => {
    const relativePath = sourceRelativePath(record);
    const cohort = sourceCohort(relativePath);
    const runtimeUri = text(record?.asset?.runtimeUri || record?.asset?.uri || record?.uri);
    const runtimePath = safeMediaPath(mediaRoot, runtimeUri, `Ref Cards video ${record.id || relativePath}`);
    const storagePath = text(record?.asset?.metadata?.storage?.path);
    if (storagePath && path.resolve(storagePath) !== runtimePath) fail(`Ref Cards video ${record.id || relativePath} storage path does not match its runtime URI.`);
    const fileStat = await stat(runtimePath).catch((error) => fail(`Cannot read Ref Cards video ${runtimePath}: ${error.message}`));
    if (!fileStat.isFile() || fileStat.size < 1) fail(`Ref Cards video is missing or empty: ${runtimePath}.`);
    if (Number(record?.sizeBytes) > 0 && Number(record.sizeBytes) !== fileStat.size) fail(`Ref Cards video size mismatch for ${runtimeUri}.`);
    const cacheEntry = hashCache.entries[mediaName(runtimeUri)];
    if (!cacheEntry) fail(`Full-file hash cache is missing ${mediaName(runtimeUri)}.`);
    const cachedSha256 = normalizedSha256(cacheEntry.sha256, `${runtimeUri} cached SHA-256`);
    if (Number(cacheEntry.sizeBytes) !== fileStat.size) fail(`Full-file hash cache size mismatch for ${runtimeUri}.`);
    const actualSha256 = await sha256File(runtimePath).catch((error) => fail(`Cannot hash Ref Cards video ${runtimePath}: ${error.message}`));
    if (actualSha256 !== cachedSha256) fail(`Ref Cards video SHA-256 mismatch for ${runtimeUri}.`);
    const probe = await probeVideo(runtimePath);
    if (Number(record?.width) > 0 && Number(record.width) !== probe.width) fail(`Ref Cards video width mismatch for ${runtimeUri}.`);
    if (Number(record?.height) > 0 && Number(record.height) !== probe.height) fail(`Ref Cards video height mismatch for ${runtimeUri}.`);
    const declaredDuration = Number(record?.duration || record?.asset?.metadata?.duration);
    if (declaredDuration > 0 && Math.abs(declaredDuration - probe.durationSeconds) > Math.max(0.1, 1 / probe.fps)) {
      fail(`Ref Cards video duration mismatch for ${runtimeUri}.`);
    }
    const terminalFrames = await decodePhysicalTerminalFrames(runtimePath, probe.frameCount);
    return {
      ingestRecordId: text(record.id),
      mediaId: `hapa-media:sha256:${actualSha256}`,
      sha256: actualSha256,
      runtimeUri,
      runtimePath,
      relativePath,
      cohort,
      name: text(record.name, path.basename(relativePath)),
      probe,
      terminalFrames,
      sourceRecordUpdatedAt: text(record.updatedAt),
    };
  });
  const byHash = new Map();
  for (const video of probed.sort((left, right) => left.relativePath.localeCompare(right.relativePath) || left.runtimeUri.localeCompare(right.runtimeUri))) {
    const current = byHash.get(video.sha256);
    if (!current) byHash.set(video.sha256, { ...video, aliasPaths: [] });
    else current.aliasPaths.push(video.relativePath);
  }
  const videos = [...byHash.values()].sort((left, right) => left.mediaId.localeCompare(right.mediaId));
  if (videos.length !== expectedVideoCount) {
    fail(`Expected exactly ${expectedVideoCount} content-unique Ref Cards videos; found ${videos.length} from ${ingestedRecords.length} records.`);
  }
  return { videos, ingestedRecords: ingestedRecords.length, contentAliases: probed.length - videos.length };
}

async function discoverCanonicalSongs(projectsDirectory, expectedSongCount, concurrency) {
  let entries;
  try {
    entries = (await readdir(projectsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    fail(`Cannot read canonical Echo projects ${projectsDirectory}: ${error.message}`);
  }
  if (entries.length !== expectedSongCount) fail(`Expected exactly ${expectedSongCount} canonical Echo project files; found ${entries.length}.`);
  const projects = await mapLimit(entries, concurrency, async (fileName) => {
    const filePath = path.join(projectsDirectory, fileName);
    const bytes = await readFile(filePath).catch((error) => fail(`Cannot read canonical Echo project ${filePath}: ${error.message}`));
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      fail(`Cannot parse canonical Echo project ${filePath}: ${error.message}`);
    }
    const project = payload?.music_video_project || payload?.musicVideoProject || payload;
    const songId = text(project?.song_id || project?.songId);
    const songTitle = text(project?.song_title || project?.songTitle || project?.title, songId);
    if (!songId) fail(`Canonical Echo project ${fileName} is missing song_id.`);
    return { fileName, songId, songTitle, sha256: sha256Bytes(bytes) };
  });
  const songIds = new Set();
  for (const project of projects) {
    if (songIds.has(project.songId)) fail(`Canonical Echo projects duplicate song ${project.songId}.`);
    songIds.add(project.songId);
  }
  return projects.sort((left, right) => left.songId.localeCompare(right.songId));
}

function semanticAssignmentAffinity(song, declaration) {
  const haystack = [
    declaration.sourceFrame?.cardId,
    declaration.sourceFrame?.cardTitle,
    declaration.targetFrame?.cardId,
    declaration.targetFrame?.cardTitle,
  ].map((value) => text(value).toLowerCase()).join(" ");
  const songId = text(song.songId).toLowerCase();
  if (songId && haystack.includes(songId)) return 2;
  const tokens = `${song.songId} ${song.songTitle}`.toLowerCase().split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 4 && !["dear", "papa", "song", "with", "from", "that", "this"].includes(token));
  return new Set(tokens.filter((token) => haystack.includes(token))).size;
}

export function buildBalancedAssignmentReport({ declarations = [], canonicalSongs = [], inputBinding = {}, generatedAt = null } = {}) {
  const jobs = list(declarations).map((declaration) => ({
    declaration,
    jobId: text(declaration?.transitionLink?.id),
  })).filter((row) => row.jobId).sort((left, right) => left.jobId.localeCompare(right.jobId));
  const songs = list(canonicalSongs).slice().sort((left, right) => left.songId.localeCompare(right.songId));
  if (!jobs.length) fail("Cannot assign an empty transition-job set.");
  if (!songs.length) fail("Cannot assign transition jobs without canonical songs.");
  const jobsPerSong = Math.min(REF_CARDS_TRANSITION_DISCOVERY_POLICY.assignment.jobsPerCanonicalSong, jobs.length);
  const usage = new Map(jobs.map(({ jobId }) => [jobId, 0]));
  const assignments = [];
  for (const song of songs) {
    const assigned = [];
    while (assigned.length < jobsPerSong) {
      const ranked = jobs.filter(({ jobId }) => !assigned.includes(jobId)).sort((left, right) => (
        usage.get(left.jobId) - usage.get(right.jobId)
        || semanticAssignmentAffinity(song, right.declaration) - semanticAssignmentAffinity(song, left.declaration)
        || sha256Contract(`${song.songId}\0${left.jobId}`).localeCompare(sha256Contract(`${song.songId}\0${right.jobId}`))
        || left.jobId.localeCompare(right.jobId)
      ));
      const selected = ranked[0];
      if (!selected) fail(`Could not assign ${jobsPerSong} unique transition jobs to ${song.songId}.`);
      assigned.push(selected.jobId);
      usage.set(selected.jobId, usage.get(selected.jobId) + 1);
    }
    assignments.push({
      songId: song.songId,
      title: `Ref Cards Endpoint Transitions · ${assigned.length} ${assigned.length === 1 ? "Link" : "Links"}`,
      videoCount: assigned.length,
      jobIds: assigned.sort(),
    });
  }
  const unassignedJobIds = jobs.map(({ jobId }) => jobId).filter((jobId) => usage.get(jobId) < 1);
  if (unassignedJobIds.length) {
    for (const jobId of unassignedJobIds) {
      const target = assignments.slice().sort((left, right) => left.jobIds.length - right.jobIds.length || left.songId.localeCompare(right.songId))[0];
      target.jobIds.push(jobId);
      target.jobIds.sort();
      target.videoCount = target.jobIds.length;
      target.title = `Ref Cards Endpoint Transitions · ${target.videoCount} Links`;
      usage.set(jobId, 1);
    }
  }
  const usageValues = [...usage.values()];
  const assignmentPairs = assignments.reduce((sum, row) => sum + row.jobIds.length, 0);
  const maximumJobReuse = REF_CARDS_TRANSITION_DISCOVERY_POLICY.assignment.maximumJobReuse;
  const observedMaximumJobReuse = Math.max(...usageValues);
  if (observedMaximumJobReuse > maximumJobReuse) {
    fail(`Balanced assignment requires reusing a transition job ${observedMaximumJobReuse} times; policy permits at most ${maximumJobReuse}. Add more independently certified jobs or lower the requested per-song coverage.`);
  }
  const batchFingerprint = sha256Contract({
    jobs: jobs.map(({ jobId }) => jobId),
    songs: assignments.map(({ songId, jobIds }) => ({ songId, jobIds })),
    inputBinding,
  });
  return {
    schemaVersion: ECHO_ASSIGNMENT_REPORT_SCHEMA,
    runId: `ref-cards-transition-assignments-${batchFingerprint.slice(0, 16)}`,
    mode: "candidate-contract-only-no-cuts",
    provider: "provider-neutral-ref-cards",
    batch: {
      fingerprint: batchFingerprint,
      variantId: `ref-cards-endpoint-transitions-${batchFingerprint.slice(0, 16)}`,
      readyVideos: jobs.length,
      truthBoundary: "candidate-jobs-await-independent-physical-endpoint-validation",
    },
    assignment: {
      source: "ref-cards-certified-transition-family",
      directorScripts: assignments.length,
      songs: assignments,
      fallbackShowcaseSongId: assignments[0]?.songId || null,
      fallbackJobIds: assignments[0]?.jobIds || [],
      unassignedJobIds: [],
    },
    balance: {
      jobsPerCanonicalSongTarget: jobsPerSong,
      assignmentPairs,
      jobUsageMinimum: Math.min(...usageValues),
      jobUsageMaximum: observedMaximumJobReuse,
      jobUsageMaximumPolicy: maximumJobReuse,
      jobUsageSpread: observedMaximumJobReuse - Math.min(...usageValues),
      songJobMinimum: Math.min(...assignments.map((row) => row.jobIds.length)),
      songJobMaximum: Math.max(...assignments.map((row) => row.jobIds.length)),
      usageByJobId: Object.fromEntries([...usage.entries()].sort(([left], [right]) => left.localeCompare(right))),
    },
    validation: {
      allDeclaredJobsCovered: [...usage.values()].every((count) => count >= 1),
      allCanonicalSongsCovered: assignments.length === songs.length && assignments.every((row) => row.jobIds.length >= 1),
      duplicateSongJobPairs: 0,
      cutMutation: false,
    },
    inputBinding,
    generatedAt,
  };
}

function appendUnique(values, additions) {
  return [...new Set([...list(values).map(String), ...list(additions).map(String)].filter(Boolean))].sort();
}

function ensureRecognitionFrames(recognition, video) {
  const output = structuredClone(recognition && typeof recognition === "object" ? recognition : {});
  const byMarker = new Map(list(output.frames).map((frame) => [text(frame?.marker).toLowerCase(), structuredClone(frame)]));
  const required = [
    ["first", FIRST_LEGACY_SEEK_SECONDS],
    ["mid", video.probe.durationSeconds / 2],
    ["last", Math.max(FIRST_LEGACY_SEEK_SECONDS, video.probe.durationSeconds - LAST_LEGACY_END_GUARD_SECONDS)],
  ];
  output.frames = required.map(([marker, atSeconds]) => ({
    ...(byMarker.get(marker) || {}),
    marker,
    atSeconds: fixed(atSeconds),
    available: true,
    evaluationStatus: byMarker.get(marker)?.evaluationStatus || "physical-frame-contract-ready",
    frameId: byMarker.get(marker)?.frameId || `${video.mediaId}#frame:${marker}:v1`,
  }));
  output.provider = text(output.provider, "ref-cards-physical-terminal-contract-builder");
  return output;
}

function enrichmentOverlay(video, declaration, baseRow, inputBinding, generatedAt) {
  const jobId = declaration.transitionLink.id;
  const link = structuredClone(declaration.transitionLink);
  const declaredEndpoints = {
    first: structuredClone(declaration.sourceFrame),
    last: structuredClone(declaration.targetFrame),
    link,
  };
  const evidence = {
    schemaVersion: REF_CARDS_TRANSITION_OVERLAY_SCHEMA,
    jobId,
    mediaId: video.mediaId,
    discoveryDecision: "declared-candidate",
    visuallyValidated: false,
    certificationAuthority: REF_CARDS_TRANSITION_DISCOVERY_POLICY.certificationAuthority,
    inputManifestDigest: inputBinding.inputManifestDigest,
    policyDigest: inputBinding.policyDigest,
    compilerDigest: inputBinding.compilerDigest,
  };
  const row = structuredClone(baseRow || {});
  const transition = {
    ...(row?.flow?.transition || row?.continuity?.transition || {}),
    schemaVersion: "hapa.echo.video-enrichment.v1.transition-classification",
    eligible: true,
    classification: "declared-transition",
    declaredTransition: true,
    visuallyValidated: false,
    visualClassification: "candidate-transition",
    visualValidationDecision: "awaiting-independent-physical-validator",
    declaredEndpoints,
    declaredEvidence: [
      ...list(row?.flow?.transition?.declaredEvidence || row?.continuity?.transition?.declaredEvidence),
      evidence,
    ],
    truthBoundary: "candidate-only-awaiting-independent-physical-terminal-validation",
  };
  row.schemaVersion = "hapa.echo.video-enrichment.v1";
  row.id = video.mediaId;
  row.mediaId = video.mediaId;
  row.sha256 = video.sha256;
  row.contentHash = { algorithm: "sha256", value: video.sha256 };
  row.runtimeUri = video.runtimeUri;
  row.mediaKind = "video";
  row.playable = true;
  row.status = "ready";
  row.decodeStatus = "decoded";
  row.evidenceStatus = text(row.evidenceStatus, "physical-terminal-candidate-evaluated");
  row.sourceKinds = appendUnique(row.sourceKinds, ["folder-video", "ref-cards-transition-contract-builder"]);
  row.recognition = ensureRecognitionFrames(row.recognition, video);
  row.flow = { ...(row.flow || {}), transition: structuredClone(transition) };
  row.continuity = { ...(row.continuity || {}), transition: structuredClone(transition) };
  row.technical = {
    ...(row.technical || {}),
    ok: true,
    status: "decoded",
    source: text(row?.technical?.source, "ffprobe"),
    sourcePath: text(row?.technical?.sourcePath, video.runtimePath),
    archivalSha256: video.sha256,
    durationSec: fixed(video.probe.durationSeconds),
    width: video.probe.width,
    height: video.probe.height,
    fps: fixed(video.probe.fps),
    frameCount: video.probe.frameCount,
  };
  row.transitionContractDiscovery = evidence;
  row.updatedAt = text(row.updatedAt, generatedAt);
  return row;
}

function manifestRow(row) {
  return {
    schemaVersion: "hapa.echo.video-enrichment-manifest.v1",
    id: row.mediaId || row.id,
    mediaId: row.mediaId || row.id,
    runtimeUri: row.runtimeUri,
    path: row.technical?.sourcePath || null,
    title: row.title || null,
    contentHash: row.contentHash || { algorithm: "sha256", value: row.sha256 },
    decodeStatus: row.decodeStatus || null,
    sourceKinds: row.sourceKinds || [],
    technical: {
      width: row.technical?.width ?? null,
      height: row.technical?.height ?? null,
      durationSec: row.technical?.durationSec ?? null,
      fps: row.technical?.fps ?? null,
      codec: row.technical?.codec ?? null,
    },
  };
}

function ndjson(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

async function writeReplaySafe(filePath, content) {
  const existing = await readFile(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (existing) {
    if (existing.equals(bytes)) return "replayed-identical";
    fail(`Append-only output conflict at ${filePath}.`);
  }
  try {
    await writeFile(filePath, bytes, { flag: "wx" });
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const raced = await readFile(filePath);
    if (raced.equals(bytes)) return "replayed-identical";
    fail(`Append-only output conflict at ${filePath}.`);
  }
}

export async function buildRefCardsTransitionContracts(options = parseRefCardsTransitionContractArguments()) {
  const compilerDigest = await sha256File(SCRIPT_PATH);
  const policyDigest = sha256Contract(REF_CARDS_TRANSITION_DISCOVERY_POLICY);
  const [
    mediaLibrary,
    referenceCatalog,
    hashCache,
    baseEnrichments,
    mediaLibrarySha256,
    referenceCatalogSha256,
    hashCacheSha256,
    baseEnrichmentsSha256,
    ffmpegVersion,
    ffprobeVersion,
  ] = await Promise.all([
    readJson(options.mediaLibraryPath, "media library"),
    readJson(options.referenceCatalogPath, "Reference catalog"),
    readJson(options.hashCachePath, "Ref Cards hash cache"),
    readNdjson(options.baseEnrichmentsPath, "base enrichment NDJSON"),
    sha256File(options.mediaLibraryPath),
    sha256File(options.referenceCatalogPath),
    sha256File(options.hashCachePath),
    sha256File(options.baseEnrichmentsPath),
    toolVersion("ffmpeg"),
    toolVersion("ffprobe"),
  ]);
  const [referenceRows, videoDiscovery, canonicalSongs] = await Promise.all([
    loadReferences(referenceCatalog, options.mediaRoot, options.expectedReferenceCount, options.concurrency),
    loadRefCardsVideos(mediaLibrary, hashCache, options.mediaRoot, options.expectedVideoCount, options.concurrency),
    discoverCanonicalSongs(options.projectsDirectory, options.expectedSongCount, options.concurrency),
  ]);
  const { videos } = videoDiscovery;
  const projectManifest = canonicalSongs.map(({ fileName, songId, songTitle, sha256 }) => ({ fileName, songId, songTitle, sha256 }));
  const videoManifest = videos.map((video) => ({
    mediaId: video.mediaId,
    sha256: video.sha256,
    runtimeUri: video.runtimeUri,
    sourceRelativePath: video.relativePath,
    cohort: video.cohort,
    frameCount: video.probe.frameCount,
    firstPtsSeconds: fixed(video.probe.framePtsSeconds[0]),
    lastPtsSeconds: fixed(video.probe.framePtsSeconds.at(-1)),
  }));
  const referenceManifest = referenceRows.map((reference) => ({
    cardId: reference.cardId,
    cardRevisionId: reference.cardRevisionId,
    imageSha256: reference.sha256,
    imageUri: reference.uri,
  }));
  const manifestCore = {
    schemaVersion: "hapa.echo.ref-cards-transition-input-manifest.v1",
    mediaLibrary: { path: repoPath(options.mediaLibraryPath), sha256: mediaLibrarySha256, schemaVersion: mediaLibrary.schemaVersion },
    referenceCatalog: { path: repoPath(options.referenceCatalogPath), sha256: referenceCatalogSha256, schemaVersion: referenceCatalog.schemaVersion },
    hashCache: { path: repoPath(options.hashCachePath), sha256: hashCacheSha256, schemaVersion: hashCache.schemaVersion },
    baseEnrichments: { path: repoPath(options.baseEnrichmentsPath), sha256: baseEnrichmentsSha256, rows: baseEnrichments.length },
    projects: { path: repoPath(options.projectsDirectory), count: canonicalSongs.length, manifestDigest: sha256Contract(projectManifest) },
    videos: { count: videos.length, manifestDigest: sha256Contract(videoManifest) },
    references: { count: referenceRows.length, manifestDigest: sha256Contract(referenceManifest) },
  };
  const inputManifestDigest = sha256Contract(manifestCore);
  const inputBinding = {
    schemaVersion: "hapa.echo.ref-cards-transition-input-binding.v1",
    inputManifestDigest: `sha256:${inputManifestDigest}`,
    policyDigest: `sha256:${policyDigest}`,
    compilerDigest: `sha256:${compilerDigest}`,
  };
  const generatedAt = deterministicTimestamp(mediaLibrary.updatedAt, referenceCatalog.updatedAt, hashCache.updatedAt);

  const discoveries = videos.map((video) => {
    const firstEndpoint = { pixels: video.terminalFrames.first };
    const lastEndpoint = { pixels: video.terminalFrames.last };
    const firstMatches = rankEndpoint(firstEndpoint, referenceRows);
    const lastMatches = rankEndpoint(lastEndpoint, referenceRows);
    const classification = classifyCandidate(video, firstMatches, lastMatches);
    const firstFingerprint = coarseFingerprint(video.terminalFrames.first);
    const lastFingerprint = coarseFingerprint(video.terminalFrames.last);
    return {
      video,
      firstMatches,
      lastMatches,
      classification,
      physicalFrames: {
        first: {
          frameIndex: 0,
          sourceTimeSeconds: fixed(video.probe.framePtsSeconds[0]),
          dHash: hashHex(firstFingerprint.dHash),
          lumaMean: fixed(firstFingerprint.lumaMean),
          lumaStd: fixed(firstFingerprint.lumaStd),
        },
        last: {
          frameIndex: video.probe.frameCount - 1,
          sourceTimeSeconds: fixed(video.probe.framePtsSeconds.at(-1)),
          dHash: hashHex(lastFingerprint.dHash),
          lumaMean: fixed(lastFingerprint.lumaMean),
          lumaStd: fixed(lastFingerprint.lumaStd),
        },
      },
    };
  });
  const selected = discoveries.filter((row) => row.classification.decision === "declared-candidate");
  if (!selected.length) fail("No Ref Cards videos passed candidate endpoint discovery; no chain graph can be emitted.");

  const declarations = selected.map((row) => {
    const first = endpointContract(row.classification.first, "first", policyDigest);
    const last = endpointContract(row.classification.last, "last", policyDigest);
    const jobId = transitionJobId(row.video.sha256, first, last, policyDigest);
    const transitionLink = {
      schemaVersion: REF_CARDS_TRANSITION_LINK_SCHEMA,
      id: jobId,
      mediaId: row.video.mediaId,
      provider: "provider-neutral-ref-cards",
      role: "reference-frame-authored-transition-candidate",
      title: `${first.cardTitle} → ${last.cardTitle}`,
      sourceRoot: REF_CARDS_TRANSITION_DISCOVERY_POLICY.sourceRoot,
      sourceRelativePath: row.video.relativePath,
      playbackMode: "once-after-independent-certification",
      inputBinding,
    };
    return {
      id: `echo-transition-declaration:${sha256Contract({ jobId, mediaId: row.video.mediaId }).slice(0, 24)}`,
      classification: "declared-transition",
      sourceFrame: first,
      targetFrame: last,
      transitionLink,
      transitionMediaId: row.video.mediaId,
      truthBoundary: "candidate-only-awaiting-independent-physical-terminal-validation",
      visualClassification: "candidate-transition",
      visuallyValidated: false,
      discoveryEvidence: {
        schemaVersion: "hapa.echo.ref-cards-transition-endpoint-discovery-evidence.v1",
        physicalSampleContract: REF_CARDS_TRANSITION_DISCOVERY_POLICY.sampleContract,
        first: publicMatch(row.classification.first),
        last: publicMatch(row.classification.last),
        firstCompositeMargin: row.classification.firstMargin,
        lastCompositeMargin: row.classification.lastMargin,
        filenameHint: row.classification.filenameHint,
        filenameAffectsDecision: false,
        inputBinding,
      },
    };
  }).sort((left, right) => left.transitionLink.id.localeCompare(right.transitionLink.id));
  const declarationByMediaId = new Map(declarations.map((row) => [row.transitionMediaId, row]));

  const chainGraph = {
    schemaVersion: ECHO_CHAIN_GRAPH_SCHEMA,
    generatedAt,
    method: "ref-cards-physical-terminal-to-independent-reference-candidate-discovery-v1",
    threshold: structuredClone(REF_CARDS_TRANSITION_DISCOVERY_POLICY.thresholds),
    nodes: videos.map((video) => ({
      id: video.mediaId,
      mediaId: video.mediaId,
      runtimeUri: video.runtimeUri,
      contentSha256: video.sha256,
      sourceRoot: REF_CARDS_TRANSITION_DISCOVERY_POLICY.sourceRoot,
      sourceCohort: video.cohort,
      sourceRelativePath: video.relativePath,
      firstFrameId: `${video.mediaId}#physical:0`,
      lastFrameId: `${video.mediaId}#physical:${video.probe.frameCount - 1}`,
    })),
    edges: [],
    alternatesBySource: {},
    declaredTransitions: declarations,
    totals: {
      ingestedRecords: videoDiscovery.ingestedRecords,
      contentUniqueVideos: videos.length,
      contentAliasRecords: videoDiscovery.contentAliases,
      referenceImages: referenceRows.length,
      declaredTransitions: declarations.length,
      quarantinedVideos: discoveries.length - declarations.length,
    },
    inputBinding,
    truthBoundary: {
      candidateDiscoveryOnly: true,
      filenameAffectsDecision: false,
      visuallyValidated: false,
      certificationAuthority: REF_CARDS_TRANSITION_DISCOVERY_POLICY.certificationAuthority,
    },
  };

  const baseByMediaId = new Map();
  for (const [index, row] of baseEnrichments.entries()) {
    const mediaId = text(row?.mediaId || row?.id);
    if (!mediaId) fail(`Base enrichment row ${index + 1} has no media ID.`);
    if (baseByMediaId.has(mediaId)) fail(`Base enrichment NDJSON duplicates media ID ${mediaId}.`);
    baseByMediaId.set(mediaId, row);
  }
  const overlays = selected.map((row) => enrichmentOverlay(
    row.video,
    declarationByMediaId.get(row.video.mediaId),
    baseByMediaId.get(row.video.mediaId),
    inputBinding,
    generatedAt,
  )).sort((left, right) => left.mediaId.localeCompare(right.mediaId));
  for (const overlay of overlays) baseByMediaId.set(overlay.mediaId, overlay);
  const mergedEnrichments = [...baseByMediaId.values()].sort((left, right) => text(left.mediaId || left.id).localeCompare(text(right.mediaId || right.id)));
  const manifest = mergedEnrichments.map(manifestRow);

  const candidateReport = {
    schemaVersion: REF_CARDS_TRANSITION_REPORT_SCHEMA,
    generatedAt,
    compiler: REF_CARDS_TRANSITION_COMPILER,
    policy: REF_CARDS_TRANSITION_DISCOVERY_POLICY,
    inputManifest: manifestCore,
    inputBinding,
    totals: {
      ingestedRecords: videoDiscovery.ingestedRecords,
      contentUniqueVideos: videos.length,
      contentAliasRecords: videoDiscovery.contentAliases,
      cohorts: Object.fromEntries(REF_CARDS_TRANSITION_DISCOVERY_POLICY.sourceCohorts.map((cohort) => [cohort, videos.filter((video) => video.cohort === cohort).length])),
      referenceImages: referenceRows.length,
      canonicalSongs: canonicalSongs.length,
      declaredCandidates: declarations.length,
      quarantined: discoveries.length - declarations.length,
      filenameHints: discoveries.filter((row) => row.classification.filenameHint).length,
      candidatesWithoutFilenameHint: selected.filter((row) => !row.classification.filenameHint).length,
      filenameHintsQuarantined: discoveries.filter((row) => row.classification.filenameHint && row.classification.decision === "quarantine").length,
    },
    candidates: discoveries.map((row) => ({
      mediaId: row.video.mediaId,
      ingestRecordId: row.video.ingestRecordId,
      runtimeUri: row.video.runtimeUri,
      sourceRelativePath: row.video.relativePath,
      sourceCohort: row.video.cohort,
      contentSha256: row.video.sha256,
      decision: row.classification.decision,
      quarantineReasons: row.classification.reasons,
      filenameHint: row.classification.filenameHint,
      filenameAffectsDecision: false,
      physicalFrames: row.physicalFrames,
      first: {
        selected: publicMatch(row.classification.first),
        compositeMargin: row.classification.firstMargin,
        shortlist: row.firstMatches.map(publicMatch),
      },
      last: {
        selected: publicMatch(row.classification.last),
        compositeMargin: row.classification.lastMargin,
        shortlist: row.lastMatches.map(publicMatch),
      },
      transitionJobId: declarationByMediaId.get(row.video.mediaId)?.transitionLink?.id || null,
      truthBoundary: "candidate-only-awaiting-independent-physical-terminal-validation",
    })).sort((left, right) => left.mediaId.localeCompare(right.mediaId)),
    quarantine: discoveries.filter((row) => row.classification.decision === "quarantine").map((row) => ({
      mediaId: row.video.mediaId,
      sourceRelativePath: row.video.relativePath,
      reasons: row.classification.reasons,
      filenameHint: row.classification.filenameHint,
    })).sort((left, right) => left.mediaId.localeCompare(right.mediaId)),
  };

  const assignmentReport = buildBalancedAssignmentReport({
    declarations,
    canonicalSongs,
    inputBinding,
    generatedAt,
  });
  const provisionalCatalog = buildEchoVideoEnrichmentCatalog({
    enrichments: mergedEnrichments,
    chainGraph,
    report: {},
    referenceAnimationCatalog: referenceCatalog,
  });
  const enrichmentReport = {
    schemaVersion: ECHO_ENRICHMENT_REPORT_SCHEMA,
    complete: true,
    generatedAt,
    batchFingerprint: provisionalCatalog.computedFingerprint,
    counts: {
      manifestVideos: mergedEnrichments.length,
      enrichmentRows: mergedEnrichments.length,
      chainEdges: 0,
      declaredTransitions: declarations.length,
      declaredTransitionsAwaitingVisualValidation: declarations.length,
      playableVideos: mergedEnrichments.filter((row) => row.playable === true).length,
      decodedVideos: mergedEnrichments.filter((row) => text(row.decodeStatus).toLowerCase() === "decoded").length,
    },
    source: {
      compiler: REF_CARDS_TRANSITION_COMPILER,
      baseEnrichmentsSha256,
      overlayRows: overlays.length,
      preservedBaseRows: baseEnrichments.length,
    },
    inputBinding,
    truthBoundary: "candidate-chain-awaiting-independent-physical-terminal-validation",
  };

  const outputPayloads = new Map([
    ["chain-graph.json", `${JSON.stringify(chainGraph, null, 2)}\n`],
    ["enrichments.ndjson", ndjson(mergedEnrichments)],
    ["transition-enrichment-overlays.ndjson", ndjson(overlays)],
    ["manifest.ndjson", ndjson(manifest)],
    ["report.json", `${JSON.stringify(enrichmentReport, null, 2)}\n`],
    ["candidate-quarantine-report.json", `${JSON.stringify(candidateReport, null, 2)}\n`],
    ["transition-assignment-report.json", `${JSON.stringify(assignmentReport, null, 2)}\n`],
  ]);
  const outputDigests = Object.fromEntries([...outputPayloads.entries()].map(([fileName, content]) => [fileName, {
    sha256: sha256Bytes(content),
    bytes: Buffer.byteLength(content),
  }]));
  const receiptCore = {
    schemaVersion: REF_CARDS_TRANSITION_RECEIPT_SCHEMA,
    generatedAt,
    compiler: REF_CARDS_TRANSITION_COMPILER,
    inputManifest: manifestCore,
    inputBinding,
    tools: { ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion },
    outputs: outputDigests,
    totals: {
      contentUniqueVideos: videos.length,
      references: referenceRows.length,
      declaredCandidates: declarations.length,
      quarantined: discoveries.length - declarations.length,
      canonicalSongs: canonicalSongs.length,
      assignmentPairs: assignmentReport.balance.assignmentPairs,
      enrichmentRows: mergedEnrichments.length,
      enrichmentOverlays: overlays.length,
    },
    validation: {
      allVideosIntegrityChecked: true,
      allReferenceImagesIntegrityChecked: true,
      actualPhysicalFirstAndLastFramesDecoded: true,
      filenameAffectsDecision: false,
      everyDeclaredJobAssigned: assignmentReport.validation.allDeclaredJobsCovered,
      everyCanonicalSongAssigned: assignmentReport.validation.allCanonicalSongsCovered,
      outputIsCandidateOnly: true,
      downstreamPhysicalValidatorRemainsAuthority: true,
      cutsApplied: false,
    },
  };
  const receipt = {
    ...receiptCore,
    resultDigestSha256: sha256Contract(receiptCore),
  };
  outputPayloads.set("build-receipt.json", `${JSON.stringify(receipt, null, 2)}\n`);

  await mkdir(options.outputDirectory, { recursive: true });
  const dispositions = {};
  for (const [fileName, content] of outputPayloads) {
    dispositions[fileName] = await writeReplaySafe(path.join(options.outputDirectory, fileName), content);
  }
  return {
    ok: true,
    outputDirectory: options.outputDirectory,
    contentUniqueVideos: videos.length,
    declaredCandidates: declarations.length,
    quarantined: discoveries.length - declarations.length,
    canonicalSongs: canonicalSongs.length,
    assignmentPairs: assignmentReport.balance.assignmentPairs,
    inputManifestDigest: inputBinding.inputManifestDigest,
    policyDigest: inputBinding.policyDigest,
    compilerDigest: inputBinding.compilerDigest,
    dispositions,
  };
}

async function main() {
  const options = parseRefCardsTransitionContractArguments();
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await buildRefCardsTransitionContracts(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isDirectEntry = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isDirectEntry) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
