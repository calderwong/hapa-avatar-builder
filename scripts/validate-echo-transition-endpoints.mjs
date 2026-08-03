#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { stableEchoEnrichmentStringify } from "../src/domain/echo-enrichment-director-variant.js";

const execFile = promisify(execFileCallback);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ARTIFACT_ROOT = path.join(ROOT, "artifacts/echo-video-enrichment-v1");
const DEFAULT_CHAIN_GRAPH = path.join(DEFAULT_ARTIFACT_ROOT, "chain-graph.json");
const DEFAULT_ENRICHMENTS = path.join(DEFAULT_ARTIFACT_ROOT, "enrichments.ndjson");
const DEFAULT_REFERENCE_CATALOG = path.join(ROOT, "data/echo-reference-animated-media.json");
const DEFAULT_MEDIA_ROOT = path.join(ROOT, "data/media");
const DEFAULT_OUTPUT = path.join(DEFAULT_ARTIFACT_ROOT, "transition-endpoint-visual-validation.json");

const SCHEMA_VERSION = "hapa.echo.transition-endpoint-visual-validation.v1";
const CHAIN_GRAPH_SCHEMA = "hapa.echo.video-chain-graph.v1";
const REFERENCE_CATALOG_SCHEMA = "hapa.echo-reference-animated-media-catalog.v1";
const ALGORITHM_ID = "center-crop-luma-ssim-phash-edge-v3-physical-terminal-pts";
const SAMPLE_CONTRACT_ID = "physical-terminal-frame-presentation-pts-v1";
const LEGACY_SEEK_DIAGNOSTIC_ID = "legacy-enrichment-input-seek-first-0.02-last-duration-minus-0.08-v1";
const RGB_SIZE = 256;
const SEARCH_SIZE = 128;
const FIRST_SAMPLE_SECONDS = 0.02;
const LAST_FRAME_END_GUARD_SECONDS = 0.08;
const THRESHOLDS = Object.freeze({
  ssimMin: 0.9,
  pHashDistanceMax: 10,
  edgeCorrelationMin: 0.75,
});

function fail(message) {
  throw new Error(message);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function fixed(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function stableStringify(value) {
  return stableEchoEnrichmentStringify(value);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return sha256Bytes(bytes);
}

function parseOption(argv, name, fallback) {
  const exactIndex = argv.indexOf(name);
  if (exactIndex >= 0) {
    const value = argv[exactIndex + 1];
    if (!value || value.startsWith("--")) fail(`${name} requires a value.`);
    return value;
  }
  const prefixed = argv.find((value) => value.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function parseArguments(argv = process.argv.slice(2)) {
  const known = new Set([
    "--write",
    "--verify",
    "--json",
    "--require-all-certified",
    "--help",
    "-h",
    "--chain-graph",
    "--enrichments",
    "--reference-catalog",
    "--media-root",
    "--output",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const name = raw.includes("=") ? raw.slice(0, raw.indexOf("=")) : raw;
    if (!known.has(name)) fail(`Unknown argument: ${raw}`);
    if (["--chain-graph", "--enrichments", "--reference-catalog", "--media-root", "--output"].includes(name) && !raw.includes("=")) index += 1;
  }
  return {
    write: argv.includes("--write"),
    verify: argv.includes("--verify"),
    json: argv.includes("--json"),
    requireAllCertified: argv.includes("--require-all-certified"),
    help: argv.includes("--help") || argv.includes("-h"),
    chainGraphPath: path.resolve(parseOption(argv, "--chain-graph", DEFAULT_CHAIN_GRAPH)),
    enrichmentsPath: path.resolve(parseOption(argv, "--enrichments", DEFAULT_ENRICHMENTS)),
    referenceCatalogPath: path.resolve(parseOption(argv, "--reference-catalog", DEFAULT_REFERENCE_CATALOG)),
    mediaRoot: path.resolve(parseOption(argv, "--media-root", DEFAULT_MEDIA_ROOT)),
    outputPath: path.resolve(parseOption(argv, "--output", DEFAULT_OUTPUT)),
  };
}

function usage() {
  return [
    "Usage: node scripts/validate-echo-transition-endpoints.mjs [options]",
    "",
    "  --write                    Regenerate the deterministic validation artifact.",
    "  --verify                   Regenerate in memory and fail if the artifact is stale.",
    "  --json                     Print the complete regenerated receipt.",
    "  --require-all-certified    Exit non-zero when any declared job is quarantined.",
    "  --chain-graph PATH         Override the chain graph.",
    "  --enrichments PATH         Override enrichment NDJSON.",
    "  --reference-catalog PATH   Override the independent Reference catalog.",
    "  --media-root PATH          Override the runtime media root.",
    "  --output PATH              Override the validation artifact path.",
  ].join("\n");
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

async function readNdjson(filePath) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`Cannot read enrichment NDJSON ${filePath}: ${error.message}`);
  }
  return source
    .split(/\r?\n/u)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim())
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(`Cannot parse enrichment NDJSON line ${index + 1}: ${error.message}`);
      }
    });
}

function relativeInputPath(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative.startsWith("..") ? filePath : relative.split(path.sep).join("/");
}

function runtimePath(mediaRoot, uri) {
  const value = text(uri);
  if (!value.startsWith("/media/")) fail(`Runtime URI must begin with /media/: ${value || "<missing>"}`);
  const relative = value.slice("/media/".length);
  const resolved = path.resolve(mediaRoot, relative);
  const boundary = `${path.resolve(mediaRoot)}${path.sep}`;
  if (!resolved.startsWith(boundary)) fail(`Runtime URI escaped the media root: ${value}`);
  return resolved;
}

async function runBinary(command, args, maxBuffer = 96 * 1024 * 1024) {
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

function parseRate(value) {
  const [numerator, denominator = "1"] = text(value).split("/");
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

async function probeVideo(filePath) {
  const bytes = await runBinary("ffprobe", [
    "-v", "error",
    "-count_frames",
    "-select_streams", "v:0",
    "-show_frames",
    "-show_entries", "stream=width,height,nb_read_frames,nb_frames,duration,r_frame_rate:frame=best_effort_timestamp_time,pkt_pts_time",
    "-of", "json",
    filePath,
  ]);
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`ffprobe returned invalid JSON for ${filePath}: ${error.message}`);
  }
  const stream = payload?.streams?.[0];
  const frameCount = Number(stream?.nb_read_frames || stream?.nb_frames);
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  const durationSeconds = Number(stream?.duration);
  const fps = parseRate(stream?.r_frame_rate);
  if (![frameCount, width, height, durationSeconds, fps].every(Number.isFinite) || frameCount < 2 || width < 1 || height < 1 || durationSeconds <= 0 || fps <= 0) {
    fail(`Incomplete video probe for ${filePath}.`);
  }
  const framePtsSeconds = list(payload?.frames).map((frame, frameIndex) => {
    const value = Number(frame?.best_effort_timestamp_time ?? frame?.pkt_pts_time);
    if (!Number.isFinite(value)) fail(`Frame ${frameIndex} has no presentation timestamp in ${filePath}.`);
    return value;
  });
  if (framePtsSeconds.length !== frameCount) {
    fail(`Frame timestamp probe returned ${framePtsSeconds.length}/${frameCount} frames for ${filePath}.`);
  }
  for (let frameIndex = 1; frameIndex < framePtsSeconds.length; frameIndex += 1) {
    if (framePtsSeconds[frameIndex] < framePtsSeconds[frameIndex - 1]) {
      fail(`Frame presentation timestamps are not monotonic at frame ${frameIndex} in ${filePath}.`);
    }
  }
  return { frameCount, width, height, durationSeconds, fps, framePtsSeconds };
}

function expectByteLength(bytes, expected, label) {
  if (bytes.length !== expected) fail(`${label} decoded ${bytes.length} bytes; expected ${expected}.`);
}

async function decodeAllRgbFrames(filePath, size = RGB_SIZE) {
  const bytes = await runBinary("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", filePath,
    "-vf", `scale=${size}:${size}:flags=lanczos`,
    "-fps_mode", "passthrough",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "pipe:1",
  ], 192 * 1024 * 1024);
  const frameBytes = size * size * 3;
  if (!bytes.length || bytes.length % frameBytes !== 0) fail(`Full RGB-frame decode for ${filePath} was incomplete.`);
  return { bytes, frameBytes, frameCount: bytes.length / frameBytes };
}

async function decodeVideoAtSeconds(filePath, atSeconds) {
  const bytes = await runBinary("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-ss", String(atSeconds),
    "-i", filePath,
    "-frames:v", "1",
    "-vf", `scale=${RGB_SIZE}:${RGB_SIZE}:flags=lanczos`,
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "pipe:1",
  ]);
  expectByteLength(bytes, RGB_SIZE * RGB_SIZE * 3, `Source-contract sample at ${atSeconds}s for ${filePath}`);
  return bytes;
}

async function decodeReference(filePath, width, height, size = RGB_SIZE, pixelFormat = "rgb24") {
  const filter = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${width}:${height}`,
    `scale=${size}:${size}:flags=lanczos`,
  ].join(",");
  const bytes = await runBinary("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", filePath,
    "-vf", filter,
    "-frames:v", "1",
    "-f", "rawvideo",
    "-pix_fmt", pixelFormat,
    "pipe:1",
  ]);
  const channels = pixelFormat === "gray" ? 1 : 3;
  expectByteLength(bytes, size * size * channels, `Reference decode for ${filePath}`);
  return bytes;
}

async function decodeAllGrayFrames(filePath, size = SEARCH_SIZE) {
  const bytes = await runBinary("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", filePath,
    "-vf", `scale=${size}:${size}:flags=lanczos`,
    "-fps_mode", "passthrough",
    "-f", "rawvideo",
    "-pix_fmt", "gray",
    "pipe:1",
  ], 160 * 1024 * 1024);
  const frameBytes = size * size;
  if (!bytes.length || bytes.length % frameBytes !== 0) fail(`Full-frame decode for ${filePath} was incomplete.`);
  return { bytes, frameCount: bytes.length / frameBytes };
}

function rgbToLuma(rgb, size = RGB_SIZE) {
  const luma = new Float64Array(size * size);
  for (let pixel = 0, offset = 0; pixel < luma.length; pixel += 1, offset += 3) {
    luma[pixel] = 0.2126 * rgb[offset] + 0.7152 * rgb[offset + 1] + 0.0722 * rgb[offset + 2];
  }
  return luma;
}

function resizeBilinear(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const target = new Float64Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * sourceHeight) / targetHeight - 0.5;
    const y0 = Math.max(0, Math.min(sourceHeight - 1, Math.floor(sourceY)));
    const y1 = Math.max(0, Math.min(sourceHeight - 1, y0 + 1));
    const fy = Math.max(0, Math.min(1, sourceY - y0));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth) / targetWidth - 0.5;
      const x0 = Math.max(0, Math.min(sourceWidth - 1, Math.floor(sourceX)));
      const x1 = Math.max(0, Math.min(sourceWidth - 1, x0 + 1));
      const fx = Math.max(0, Math.min(1, sourceX - x0));
      const top = source[y0 * sourceWidth + x0] * (1 - fx) + source[y0 * sourceWidth + x1] * fx;
      const bottom = source[y1 * sourceWidth + x0] * (1 - fx) + source[y1 * sourceWidth + x1] * fx;
      target[y * targetWidth + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return target;
}

function averageHash(luma) {
  const samples = resizeBilinear(luma, RGB_SIZE, RGB_SIZE, 8, 8);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return Uint8Array.from(samples, (value) => Number(value >= mean));
}

function differenceHash(luma) {
  const samples = resizeBilinear(luma, RGB_SIZE, RGB_SIZE, 9, 8);
  const bits = new Uint8Array(64);
  let cursor = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) bits[cursor++] = Number(samples[y * 9 + x + 1] >= samples[y * 9 + x]);
  }
  return bits;
}

let dctMatrix = null;
function perceptualHash(luma) {
  const samples = resizeBilinear(luma, RGB_SIZE, RGB_SIZE, 32, 32);
  if (!dctMatrix) {
    dctMatrix = Array.from({ length: 8 }, (_, frequency) => {
      const scale = frequency === 0 ? Math.sqrt(1 / 32) : Math.sqrt(2 / 32);
      return Float64Array.from({ length: 32 }, (_, index) => scale * Math.cos((Math.PI * (index + 0.5) * frequency) / 32));
    });
  }
  const coefficients = new Float64Array(64);
  for (let vertical = 0; vertical < 8; vertical += 1) {
    for (let horizontal = 0; horizontal < 8; horizontal += 1) {
      let sum = 0;
      for (let y = 0; y < 32; y += 1) {
        const verticalWeight = dctMatrix[vertical][y];
        for (let x = 0; x < 32; x += 1) sum += samples[y * 32 + x] * verticalWeight * dctMatrix[horizontal][x];
      }
      coefficients[vertical * 8 + horizontal] = sum;
    }
  }
  const sorted = Array.from(coefficients.subarray(1)).sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Uint8Array.from(coefficients, (value, index) => Number(index === 0 ? value >= coefficients[0] : value >= median));
}

function fingerprints(rgb) {
  const luma = rgbToLuma(rgb);
  return {
    luma,
    aHash: averageHash(luma),
    dHash: differenceHash(luma),
    pHash: perceptualHash(luma),
  };
}

function hamming(left, right) {
  if (left.length !== right.length) fail("Perceptual hashes have incompatible lengths.");
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) distance += Number(left[index] !== right[index]);
  return distance;
}

function hashMetrics(left, right) {
  const aHashDistance = hamming(left.aHash, right.aHash);
  const dHashDistance = hamming(left.dHash, right.dHash);
  const pHashDistance = hamming(left.pHash, right.pHash);
  const hashSimilarity = 1 - (aHashDistance + dHashDistance + pHashDistance) / (3 * 64);
  return { aHashDistance, dHashDistance, pHashDistance, hashSimilarity };
}

function integral(values, width, height) {
  const stride = width + 1;
  const result = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += values[y * width + x];
      result[(y + 1) * stride + x + 1] = result[y * stride + x + 1] + rowSum;
    }
  }
  return result;
}

function regionSum(table, width, x, y, size) {
  const stride = width + 1;
  const x1 = x + size;
  const y1 = y + size;
  return table[y1 * stride + x1] - table[y * stride + x1] - table[y1 * stride + x] + table[y * stride + x];
}

function structuralSimilarity(left, right, width = RGB_SIZE, height = RGB_SIZE, windowSize = 11) {
  if (left.length !== width * height || right.length !== width * height) fail("SSIM inputs have incompatible dimensions.");
  const leftSquared = new Float64Array(left.length);
  const rightSquared = new Float64Array(left.length);
  const product = new Float64Array(left.length);
  for (let index = 0; index < left.length; index += 1) {
    leftSquared[index] = left[index] * left[index];
    rightSquared[index] = right[index] * right[index];
    product[index] = left[index] * right[index];
  }
  const leftIntegral = integral(left, width, height);
  const rightIntegral = integral(right, width, height);
  const leftSquaredIntegral = integral(leftSquared, width, height);
  const rightSquaredIntegral = integral(rightSquared, width, height);
  const productIntegral = integral(product, width, height);
  const area = windowSize * windowSize;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let sum = 0;
  let count = 0;
  for (let y = 0; y <= height - windowSize; y += 1) {
    for (let x = 0; x <= width - windowSize; x += 1) {
      const leftMean = regionSum(leftIntegral, width, x, y, windowSize) / area;
      const rightMean = regionSum(rightIntegral, width, x, y, windowSize) / area;
      const leftVariance = Math.max(0, regionSum(leftSquaredIntegral, width, x, y, windowSize) / area - leftMean ** 2);
      const rightVariance = Math.max(0, regionSum(rightSquaredIntegral, width, x, y, windowSize) / area - rightMean ** 2);
      const covariance = regionSum(productIntegral, width, x, y, windowSize) / area - leftMean * rightMean;
      sum += ((2 * leftMean * rightMean + c1) * (2 * covariance + c2))
        / ((leftMean ** 2 + rightMean ** 2 + c1) * (leftVariance + rightVariance + c2));
      count += 1;
    }
  }
  return sum / count;
}

function edgeMagnitudes(luma, size = RGB_SIZE) {
  const edges = new Float64Array(luma.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const horizontal = luma[y * size + Math.min(size - 1, x + 1)] - luma[index];
      const vertical = luma[Math.min(size - 1, y + 1) * size + x] - luma[index];
      edges[index] = Math.hypot(horizontal, vertical);
    }
  }
  return edges;
}

function correlation(left, right) {
  let leftSum = 0;
  let rightSum = 0;
  for (let index = 0; index < left.length; index += 1) {
    leftSum += left[index];
    rightSum += right[index];
  }
  const leftMean = leftSum / left.length;
  const rightMean = rightSum / right.length;
  let numerator = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftEnergy += leftDelta ** 2;
    rightEnergy += rightDelta ** 2;
  }
  return leftEnergy > 0 && rightEnergy > 0 ? numerator / Math.sqrt(leftEnergy * rightEnergy) : 0;
}

function normalizedRmse(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += (left[index] - right[index]) ** 2;
  return Math.sqrt(sum / left.length) / 255;
}

function histogramIntersection(left, right) {
  let channelTotal = 0;
  const pixels = left.length / 3;
  for (let channel = 0; channel < 3; channel += 1) {
    const leftBins = new Uint32Array(32);
    const rightBins = new Uint32Array(32);
    for (let offset = channel; offset < left.length; offset += 3) {
      leftBins[Math.min(31, Math.floor(left[offset] / 8))] += 1;
      rightBins[Math.min(31, Math.floor(right[offset] / 8))] += 1;
    }
    let overlap = 0;
    for (let bin = 0; bin < 32; bin += 1) overlap += Math.min(leftBins[bin], rightBins[bin]);
    channelTotal += overlap / pixels;
  }
  return channelTotal / 3;
}

function compareEndpointFrame(frameBytes, frameFingerprint, reference) {
  const hashes = hashMetrics(frameFingerprint, reference.fingerprint);
  const metrics = {
    ssim: fixed(structuralSimilarity(frameFingerprint.luma, reference.fingerprint.luma)),
    aHashDistance: hashes.aHashDistance,
    dHashDistance: hashes.dHashDistance,
    pHashDistance: hashes.pHashDistance,
    hashSimilarity: fixed(hashes.hashSimilarity),
    edgeCorrelation: fixed(correlation(edgeMagnitudes(frameFingerprint.luma), edgeMagnitudes(reference.fingerprint.luma))),
    normalizedRmse: fixed(normalizedRmse(frameBytes, reference.bytes)),
    histogramIntersection: fixed(histogramIntersection(frameBytes, reference.bytes)),
  };
  return { metrics, ...endpointDecision(metrics) };
}

function endpointDecision(metrics) {
  const checks = {
    ssim: metrics.ssim >= THRESHOLDS.ssimMin,
    pHash: metrics.pHashDistance <= THRESHOLDS.pHashDistanceMax,
    edgeCorrelation: metrics.edgeCorrelation >= THRESHOLDS.edgeCorrelationMin,
  };
  return {
    decision: Object.values(checks).every(Boolean) ? "certified" : "quarantine",
    checks,
  };
}

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function distribution(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return {
    min: fixed(sorted[0]),
    p05: fixed(quantile(sorted, 0.05)),
    p25: fixed(quantile(sorted, 0.25)),
    median: fixed(quantile(sorted, 0.5)),
    p75: fixed(quantile(sorted, 0.75)),
    p95: fixed(quantile(sorted, 0.95)),
    max: fixed(sorted.at(-1)),
    mean: fixed(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  };
}

function exactEndpointContract(endpoint, role, jobId) {
  const cardId = text(endpoint?.cardId);
  const uri = text(endpoint?.uri);
  const sha256 = text(endpoint?.sha256).toLowerCase();
  if (!cardId || !uri || !/^[a-f0-9]{64}$/u.test(sha256)) fail(`${jobId} has an incomplete declared ${role} endpoint.`);
  return {
    role,
    cardId,
    cardTitle: text(endpoint?.cardTitle),
    assetId: text(endpoint?.assetId),
    uri,
    sha256,
  };
}

function sameEndpoint(left, right) {
  return text(left?.cardId) === text(right?.cardId)
    && text(left?.uri) === text(right?.uri)
    && text(left?.sha256).toLowerCase() === text(right?.sha256).toLowerCase();
}

function legacyEnrichmentSeekSampleTimes(row, probe, jobId) {
  const recognitionFrames = list(row?.recognition?.frames);
  const firstEvidence = recognitionFrames.find((frame) => text(frame?.marker).toLowerCase() === "first");
  const lastEvidence = recognitionFrames.find((frame) => text(frame?.marker).toLowerCase() === "last");
  const firstSeconds = Number(FIRST_SAMPLE_SECONDS.toFixed(6));
  const lastSeconds = Number(Math.max(firstSeconds, probe.durationSeconds - LAST_FRAME_END_GUARD_SECONDS).toFixed(6));
  const evidenceFirstSeconds = Number(firstEvidence?.atSeconds ?? firstEvidence?.at_seconds);
  const evidenceLastSeconds = Number(lastEvidence?.atSeconds ?? lastEvidence?.at_seconds);
  if (!Number.isFinite(evidenceFirstSeconds) || !Number.isFinite(evidenceLastSeconds)) {
    fail(`${jobId} is missing enrichment first/last sample timestamps.`);
  }
  const tolerance = 0.000002;
  if (Math.abs(evidenceFirstSeconds - firstSeconds) > tolerance || Math.abs(evidenceLastSeconds - lastSeconds) > tolerance) {
    fail(`${jobId} enrichment samples (${evidenceFirstSeconds}, ${evidenceLastSeconds}) do not match the declared legacy seek diagnostic inputs (${firstSeconds}, ${lastSeconds}).`);
  }
  return {
    diagnosticId: LEGACY_SEEK_DIAGNOSTIC_ID,
    governing: false,
    policy: "legacy-enrichment-recognition-input-seek-times-only; not terminal-frame certification",
    source: "enrichment-recognition-timestamps",
    firstSeconds,
    lastSeconds,
    firstEvidenceSeconds: fixed(evidenceFirstSeconds),
    lastEvidenceSeconds: fixed(evidenceLastSeconds),
  };
}

function resolveDecodedSampleFrame(sampleBytes, decodedFrames, probe, requestedAtSeconds, label) {
  const matchingPhysicalFrameIndices = [];
  for (let frameIndex = 0; frameIndex < decodedFrames.frameCount; frameIndex += 1) {
    const start = frameIndex * decodedFrames.frameBytes;
    const frame = decodedFrames.bytes.subarray(start, start + decodedFrames.frameBytes);
    if (sampleBytes.equals(frame)) matchingPhysicalFrameIndices.push(frameIndex);
  }
  if (!matchingPhysicalFrameIndices.length) {
    fail(`${label} did not exactly match any frame in the complete deterministic RGB decode.`);
  }
  const resolvedPhysicalFrameIndex = matchingPhysicalFrameIndices
    .slice()
    .sort((left, right) => Math.abs(probe.framePtsSeconds[left] - requestedAtSeconds) - Math.abs(probe.framePtsSeconds[right] - requestedAtSeconds)
      || left - right)[0];
  const resolvedPhysicalPtsSeconds = probe.framePtsSeconds[resolvedPhysicalFrameIndex];
  return {
    matchingPhysicalFrameIndices,
    resolvedPhysicalFrameIndex,
    resolvedPhysicalPtsSeconds: fixed(resolvedPhysicalPtsSeconds),
    requestToPresentationDeltaSeconds: fixed(resolvedPhysicalPtsSeconds - requestedAtSeconds),
  };
}

async function temporalSearch(videoPath, referencePath, probe) {
  const [{ bytes, frameCount }, referenceBytes] = await Promise.all([
    decodeAllGrayFrames(videoPath, SEARCH_SIZE),
    decodeReference(referencePath, probe.width, probe.height, SEARCH_SIZE, "gray"),
  ]);
  if (frameCount !== probe.frameCount) fail(`Full-frame search decoded ${frameCount}/${probe.frameCount} frames for ${videoPath}.`);
  const frameBytes = SEARCH_SIZE * SEARCH_SIZE;
  const reference = Float64Array.from(referenceBytes);
  let best = { ssim: -Infinity, frameIndex: -1 };
  let finalSsim = null;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * frameBytes;
    const frame = Float64Array.from(bytes.subarray(start, start + frameBytes));
    const score = structuralSimilarity(frame, reference, SEARCH_SIZE, SEARCH_SIZE, 7);
    if (score > best.ssim) best = { ssim: score, frameIndex };
    if (frameIndex === frameCount - 1) finalSsim = score;
  }
  return {
    algorithm: "all-decoded-frames-128px-luma-ssim-7x7-v1",
    searchedFrameCount: frameCount,
    bestFrameIndex: best.frameIndex,
    bestAtSeconds: fixed(best.frameIndex / probe.fps),
    bestSsim: fixed(best.ssim),
    finalSsim: fixed(finalSsim),
    salvageThreshold: THRESHOLDS.ssimMin,
    salvageableByTrim: best.ssim >= THRESHOLDS.ssimMin,
  };
}

async function generateReceipt(options) {
  const [chainGraph, enrichments, referenceCatalog, chainGraphSha256, enrichmentsSha256, referenceCatalogSha256, ffmpegVersion, ffprobeVersion] = await Promise.all([
    readJson(options.chainGraphPath, "chain graph"),
    readNdjson(options.enrichmentsPath),
    readJson(options.referenceCatalogPath, "Reference animation catalog"),
    sha256File(options.chainGraphPath),
    sha256File(options.enrichmentsPath),
    sha256File(options.referenceCatalogPath),
    toolVersion("ffmpeg"),
    toolVersion("ffprobe"),
  ]);
  if (chainGraph?.schemaVersion !== CHAIN_GRAPH_SCHEMA) fail(`Expected ${CHAIN_GRAPH_SCHEMA}, received ${chainGraph?.schemaVersion || "missing"}.`);
  if (referenceCatalog?.schemaVersion !== REFERENCE_CATALOG_SCHEMA) fail(`Expected ${REFERENCE_CATALOG_SCHEMA}, received ${referenceCatalog?.schemaVersion || "missing"}.`);
  const declarations = list(chainGraph?.declaredTransitions);
  if (!declarations.length) fail("The chain graph has no declared transitions.");

  const rowsByMediaId = new Map();
  for (const row of enrichments) {
    const mediaId = text(row?.mediaId || row?.id);
    if (!mediaId) continue;
    if (rowsByMediaId.has(mediaId)) fail(`Enrichment media ID is duplicated: ${mediaId}`);
    rowsByMediaId.set(mediaId, row);
  }
  const catalogByCardId = new Map();
  for (const record of list(referenceCatalog?.records)) {
    const cardId = text(record?.card?.id);
    if (!cardId) continue;
    if (catalogByCardId.has(cardId)) fail(`Reference animation catalog card is duplicated: ${cardId}`);
    catalogByCardId.set(cardId, record);
  }

  const seenJobs = new Set();
  const seenMedia = new Set();
  const referenceContracts = new Map();
  const declarationRows = declarations.map((declaration) => {
    const jobId = text(declaration?.transitionLink?.id);
    const mediaId = text(declaration?.transitionMediaId);
    if (!jobId || !mediaId) fail("A declared transition is missing its job or media ID.");
    if (seenJobs.has(jobId)) fail(`Declared transition job is duplicated: ${jobId}`);
    if (seenMedia.has(mediaId)) fail(`Declared transition media is duplicated: ${mediaId}`);
    seenJobs.add(jobId);
    seenMedia.add(mediaId);
    const first = exactEndpointContract(declaration?.sourceFrame, "first", jobId);
    const last = exactEndpointContract(declaration?.targetFrame, "last", jobId);
    for (const endpoint of [first, last]) {
      const existing = referenceContracts.get(endpoint.sha256);
      if (existing && (existing.cardId !== endpoint.cardId || existing.uri !== endpoint.uri)) fail(`Reference SHA ${endpoint.sha256} has conflicting endpoint contracts.`);
      referenceContracts.set(endpoint.sha256, endpoint);
    }
    return { declaration, jobId, mediaId, first, last };
  });

  const references = [];
  for (const endpoint of [...referenceContracts.values()].sort((left, right) => left.sha256.localeCompare(right.sha256))) {
    const catalogRecord = catalogByCardId.get(endpoint.cardId);
    const catalogImage = catalogRecord?.artifacts?.image;
    if (!catalogRecord || text(catalogImage?.uri) !== endpoint.uri || text(catalogImage?.sha256).toLowerCase() !== endpoint.sha256) {
      fail(`Reference catalog does not independently bind ${endpoint.cardId} to ${endpoint.uri} @ ${endpoint.sha256}.`);
    }
    const filePath = runtimePath(options.mediaRoot, endpoint.uri);
    const actualSha256 = await sha256File(filePath);
    if (actualSha256 !== endpoint.sha256) fail(`Reference file SHA mismatch for ${endpoint.cardId}: ${actualSha256} != ${endpoint.sha256}.`);
    references.push({
      cardId: endpoint.cardId,
      uri: endpoint.uri,
      declaredSha256: endpoint.sha256,
      actualSha256,
      catalogSha256: text(catalogImage?.sha256).toLowerCase(),
    });
  }

  const referenceBySha = new Map(references.map((reference) => [reference.declaredSha256, reference]));
  const normalizedReferenceCache = new Map();
  async function normalizedReference(referenceSha256, probe) {
    const key = `${referenceSha256}:${probe.width}x${probe.height}`;
    if (!normalizedReferenceCache.has(key)) {
      const reference = referenceBySha.get(referenceSha256);
      const bytes = await decodeReference(runtimePath(options.mediaRoot, reference.uri), probe.width, probe.height);
      normalizedReferenceCache.set(key, { bytes, fingerprint: fingerprints(bytes) });
    }
    return normalizedReferenceCache.get(key);
  }

  const jobs = [];
  const allEndpointMetrics = [];
  const legacySeekDiagnosticMetrics = [];
  const impostorHashDistances = [];
  let impostorFullRulePass = 0;
  const mediaReceipts = [];
  for (const [jobIndex, source] of declarationRows.entries()) {
    const row = rowsByMediaId.get(source.mediaId);
    if (!row) fail(`${source.jobId} has no enrichment row for ${source.mediaId}.`);
    if (row?.playable !== true || text(row?.decodeStatus) !== "decoded") fail(`${source.jobId} enrichment row is not playable and decoded.`);
    const inline = row?.flow?.transition?.declaredEndpoints || row?.continuity?.transition?.declaredEndpoints;
    if (!sameEndpoint(inline?.first, source.first) || !sameEndpoint(inline?.last, source.last)) fail(`${source.jobId} enrichment endpoints do not match the chain graph.`);
    const inlineJobId = text(row?.flow?.transition?.declaredEndpoints?.link?.id || row?.continuity?.transition?.declaredEndpoints?.link?.id);
    if (inlineJobId && inlineJobId !== source.jobId) fail(`${source.mediaId} is bound to ${inlineJobId}, not ${source.jobId}.`);
    const runtimeUri = text(row?.runtimeUri);
    const videoPath = runtimePath(options.mediaRoot, runtimeUri);
    const actualVideoSha256 = await sha256File(videoPath);
    const mediaSha256 = source.mediaId.replace(/^hapa-media:sha256:/u, "");
    if (!/^[a-f0-9]{64}$/u.test(mediaSha256) || actualVideoSha256 !== mediaSha256) fail(`${source.jobId} video SHA does not match ${source.mediaId}.`);
    const probe = await probeVideo(videoPath);
    const legacySeekTimes = legacyEnrichmentSeekSampleTimes(row, probe, source.jobId);
    const [decodedFrames, firstLegacySeekFrame, lastLegacySeekFrame] = await Promise.all([
      decodeAllRgbFrames(videoPath),
      decodeVideoAtSeconds(videoPath, legacySeekTimes.firstSeconds),
      decodeVideoAtSeconds(videoPath, legacySeekTimes.lastSeconds),
    ]);
    if (decodedFrames.frameCount !== probe.frameCount) {
      fail(`Complete RGB decode returned ${decodedFrames.frameCount}/${probe.frameCount} frames for ${videoPath}.`);
    }
    const legacySeekFrames = [firstLegacySeekFrame, lastLegacySeekFrame];
    const legacySeekResolutions = legacySeekFrames.map((frame, endpointIndex) => {
      const role = endpointIndex === 0 ? "first" : "last";
      const requestedAtSeconds = role === "first" ? legacySeekTimes.firstSeconds : legacySeekTimes.lastSeconds;
      return resolveDecodedSampleFrame(frame, decodedFrames, probe, requestedAtSeconds, `${source.jobId} ${role} legacy seek`);
    });
    const sourceSamples = {
      schemaVersion: "hapa.echo.transition-endpoint-source-samples.v2",
      contractId: SAMPLE_CONTRACT_ID,
      governing: true,
      policy: "author the exact physical terminal frames n=0 and n=frameCount-1 at their probed presentation timestamps",
      first: {
        frameIndex: 0,
        nominalAtSeconds: 0,
        presentationPtsSeconds: fixed(probe.framePtsSeconds[0]),
        authoredSourceSeconds: fixed(probe.framePtsSeconds[0]),
      },
      last: {
        frameIndex: probe.frameCount - 1,
        nominalAtSeconds: fixed((probe.frameCount - 1) / probe.fps),
        presentationPtsSeconds: fixed(probe.framePtsSeconds.at(-1)),
        authoredSourceSeconds: fixed(probe.framePtsSeconds.at(-1)),
      },
    };
    const endpointRecords = {};
    for (const [endpointIndex, endpoint] of [source.first, source.last].entries()) {
      const role = endpointIndex === 0 ? "first" : "last";
      const frameIndex = endpointIndex === 0 ? 0 : probe.frameCount - 1;
      const frameStart = frameIndex * decodedFrames.frameBytes;
      const physicalFrameBytes = decodedFrames.bytes.subarray(frameStart, frameStart + decodedFrames.frameBytes);
      const physicalFrameFingerprint = fingerprints(physicalFrameBytes);
      const legacySeekFrameBytes = legacySeekFrames[endpointIndex];
      const legacySeekFrameFingerprint = fingerprints(legacySeekFrameBytes);
      const legacySeekResolution = legacySeekResolutions[endpointIndex];
      const declaredReference = await normalizedReference(endpoint.sha256, probe);
      const legacySeekComparison = compareEndpointFrame(legacySeekFrameBytes, legacySeekFrameFingerprint, declaredReference);
      const physicalComparison = compareEndpointFrame(physicalFrameBytes, physicalFrameFingerprint, declaredReference);
      const metrics = physicalComparison.metrics;

      const candidates = [];
      for (const reference of references) {
        const candidate = await normalizedReference(reference.declaredSha256, probe);
        const candidateHashes = hashMetrics(physicalFrameFingerprint, candidate.fingerprint);
        const candidateRecord = {
          referenceSha256: reference.declaredSha256,
          hashSimilarity: candidateHashes.hashSimilarity,
          pHashDistance: candidateHashes.pHashDistance,
        };
        candidates.push(candidateRecord);
        if (reference.declaredSha256 !== endpoint.sha256) {
          impostorHashDistances.push(candidateHashes.pHashDistance);
          if (candidateHashes.pHashDistance <= THRESHOLDS.pHashDistanceMax) {
            const candidateSsim = structuralSimilarity(physicalFrameFingerprint.luma, candidate.fingerprint.luma);
            const candidateEdge = correlation(edgeMagnitudes(physicalFrameFingerprint.luma), edgeMagnitudes(candidate.fingerprint.luma));
            if (candidateSsim >= THRESHOLDS.ssimMin && candidateEdge >= THRESHOLDS.edgeCorrelationMin) impostorFullRulePass += 1;
          }
        }
      }
      candidates.sort((left, right) => right.hashSimilarity - left.hashSimilarity
        || left.pHashDistance - right.pHashDistance
        || left.referenceSha256.localeCompare(right.referenceSha256));
      const declaredIndex = candidates.findIndex((candidate) => candidate.referenceSha256 === endpoint.sha256);
      const declaredCandidate = candidates[declaredIndex];
      const bestImpostor = candidates.find((candidate) => candidate.referenceSha256 !== endpoint.sha256);
      const tiedAtDeclaredScore = candidates.filter((candidate) => Math.abs(candidate.hashSimilarity - declaredCandidate.hashSimilarity) < 1e-12).length;
      const decision = physicalComparison.decision;
      const legacyRequestedAtSeconds = role === "first" ? legacySeekTimes.firstSeconds : legacySeekTimes.lastSeconds;
      const endpointRecord = {
        role,
        decodedFrame: {
          frameIndex,
          nominalAtSeconds: fixed(frameIndex / probe.fps),
          rgb256Sha256: sha256Bytes(physicalFrameBytes),
        },
        sourceTiming: {
          contractId: SAMPLE_CONTRACT_ID,
          presentationPtsSeconds: fixed(probe.framePtsSeconds[frameIndex]),
          authoredSourceSeconds: fixed(probe.framePtsSeconds[frameIndex]),
        },
        legacyEnrichmentSeekDiagnostic: {
          diagnosticId: LEGACY_SEEK_DIAGNOSTIC_ID,
          governing: false,
          requestedAtSeconds: legacyRequestedAtSeconds,
          seekSemantics: "ffmpeg-input-seek-matching-enrichment-frame-extraction",
          matchingPhysicalFrameIndices: legacySeekResolution.matchingPhysicalFrameIndices,
          resolvedPhysicalFrameIndex: legacySeekResolution.resolvedPhysicalFrameIndex,
          resolvedPhysicalPtsSeconds: legacySeekResolution.resolvedPhysicalPtsSeconds,
          requestToPresentationDeltaSeconds: legacySeekResolution.requestToPresentationDeltaSeconds,
          rgb256Sha256: sha256Bytes(legacySeekFrameBytes),
          equivalentToPhysicalEndpoint: legacySeekFrameBytes.equals(physicalFrameBytes),
          metrics: legacySeekComparison.metrics,
          decision: legacySeekComparison.decision,
          checks: legacySeekComparison.checks,
        },
        declaredReference: {
          cardId: endpoint.cardId,
          cardTitle: endpoint.cardTitle,
          assetId: endpoint.assetId,
          uri: endpoint.uri,
          declaredSha256: endpoint.sha256,
          actualFileSha256: referenceBySha.get(endpoint.sha256).actualSha256,
          independentCatalogSha256: referenceBySha.get(endpoint.sha256).catalogSha256,
          normalizedRgb256Sha256: sha256Bytes(declaredReference.bytes),
        },
        metrics,
        retrieval: {
          method: "mean-a-d-p-hash-similarity-over-declared-reference-corpus-v1",
          corpusSize: references.length,
          rank: declaredIndex + 1,
          tiedAtDeclaredScore,
          declaredScore: fixed(declaredCandidate.hashSimilarity),
          marginToBestNonDeclared: fixed(declaredCandidate.hashSimilarity - bestImpostor.hashSimilarity),
          bestReferenceSha256: candidates[0].referenceSha256,
        },
        decision,
        checks: physicalComparison.checks,
      };
      endpointRecords[role] = endpointRecord;
      allEndpointMetrics.push({ role, decision, ...metrics });
      legacySeekDiagnosticMetrics.push({ role, decision: legacySeekComparison.decision, ...legacySeekComparison.metrics });
    }
    const jobDecision = endpointRecords.first.decision === "certified" && endpointRecords.last.decision === "certified"
      ? "certified"
      : "quarantine";
    if (jobDecision === "quarantine") {
      for (const endpoint of [source.first, source.last]) {
        if (endpointRecords[endpoint.role].decision !== "quarantine") continue;
        endpointRecords[endpoint.role].temporalSearch = await temporalSearch(
          videoPath,
          runtimePath(options.mediaRoot, endpoint.uri),
          probe,
        );
      }
    }
    jobs.push({
      jobId: source.jobId,
      mediaId: source.mediaId,
      runtimeUri,
      declaration: {
        truthBoundary: text(source.declaration?.truthBoundary),
        visualClassification: text(source.declaration?.visualClassification),
        visuallyValidated: source.declaration?.visuallyValidated === true,
      },
      video: {
        actualSha256: actualVideoSha256,
        width: probe.width,
        height: probe.height,
        frameCount: probe.frameCount,
        durationSeconds: fixed(probe.durationSeconds),
        fps: fixed(probe.fps),
      },
      sourceSamples,
      legacyEnrichmentSeekDiagnostic: {
        ...legacySeekTimes,
        decision: endpointRecords.first.legacyEnrichmentSeekDiagnostic.decision === "certified"
          && endpointRecords.last.legacyEnrichmentSeekDiagnostic.decision === "certified"
          ? "compatible"
          : "incompatible",
      },
      endpoints: endpointRecords,
      decision: jobDecision,
    });
    mediaReceipts.push({ mediaId: source.mediaId, runtimeUri, actualSha256: actualVideoSha256 });
    process.stderr.write(`validated ${jobIndex + 1}/${declarationRows.length} ${source.jobId}\n`);
  }

  const certifiedMetrics = allEndpointMetrics.filter((metric) => metric.decision === "certified");
  const quarantinedMetrics = allEndpointMetrics.filter((metric) => metric.decision === "quarantine");
  const legacySeekCertifiedMetrics = legacySeekDiagnosticMetrics.filter((metric) => metric.decision === "certified");
  const legacySeekQuarantinedMetrics = legacySeekDiagnosticMetrics.filter((metric) => metric.decision === "quarantine");
  const referenceStillSetDigestSha256 = sha256Bytes(stableStringify(references));
  const transitionMediaSetDigestSha256 = sha256Bytes(stableStringify(mediaReceipts.sort((left, right) => left.mediaId.localeCompare(right.mediaId))));
  const algorithm = {
    id: ALGORITHM_ID,
    decodedFrames: "complete deterministic RGB decode; governing endpoints are physical n=0 and n=frameCount-1",
    sourceSampleContract: {
      id: SAMPLE_CONTRACT_ID,
      first: "physical frame n=0 at its ffprobe best-effort presentation timestamp",
      last: "physical frame n=frameCount-1 at its ffprobe best-effort presentation timestamp",
      policy: "compiler must consume the emitted per-video authoredSourceSeconds; nominal FPS time is evidence, not the authoritative presentation timestamp",
    },
    legacySeekDiagnostic: {
      id: LEGACY_SEEK_DIAGNOSTIC_ID,
      governing: false,
      firstRequestedSeconds: FIRST_SAMPLE_SECONDS,
      lastRequestedSeconds: `duration-${LAST_FRAME_END_GUARD_SECONDS}`,
      policy: "retained only to expose which physical frame the former enrichment input seek resolves to",
    },
    normalization: "center-crop Reference to decoded video aspect; resize video and Reference to 256x256 Lanczos RGB",
    ssim: "11x11 valid-window BT.709-luma SSIM; K1=0.01, K2=0.03, L=255",
    hashes: "64-bit bilinear aHash, dHash, and 32x32 DCT pHash",
    edgeCorrelation: "Pearson correlation of forward-gradient magnitudes",
    thresholds: THRESHOLDS,
    decision: "all thresholds must pass for each physical terminal endpoint; both n=0 and n=frameCount-1 must certify the job",
    canonicalization: "recursive-lexicographic-json-keys-v1",
  };
  const inputReceipt = {
    chainGraph: { path: relativeInputPath(options.chainGraphPath), sha256: chainGraphSha256 },
    enrichments: { path: relativeInputPath(options.enrichmentsPath), sha256: enrichmentsSha256 },
    referenceCatalog: { path: relativeInputPath(options.referenceCatalogPath), sha256: referenceCatalogSha256 },
    mediaRoot: relativeInputPath(options.mediaRoot),
    declaredTransitionCount: jobs.length,
    endpointCount: allEndpointMetrics.length,
    uniqueReferenceCount: references.length,
    transitionMediaSetDigestSha256,
    referenceStillSetDigestSha256,
  };
  inputReceipt.aggregateInputDigestSha256 = sha256Bytes(stableStringify({ algorithm, ...inputReceipt }));
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: text(chainGraph?.generatedAt),
    generatedAtBasis: "chain-graph.generatedAt",
    algorithm,
    tooling: { ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion },
    inputs: inputReceipt,
    aggregate: {
      declaredTransitionCount: jobs.length,
      endpointCount: allEndpointMetrics.length,
      uniqueReferenceCount: references.length,
      certifiedJobs: jobs.filter((job) => job.decision === "certified").length,
      quarantinedJobs: jobs.filter((job) => job.decision === "quarantine").length,
      certifiedEndpoints: certifiedMetrics.length,
      quarantinedEndpoints: quarantinedMetrics.length,
      quarantinedJobIds: jobs.filter((job) => job.decision === "quarantine").map((job) => job.jobId),
      byRole: Object.fromEntries(["first", "last"].map((role) => [role, {
        certified: allEndpointMetrics.filter((metric) => metric.role === role && metric.decision === "certified").length,
        quarantined: allEndpointMetrics.filter((metric) => metric.role === role && metric.decision === "quarantine").length,
      }])),
      physicalTerminalSourceContract: {
        id: SAMPLE_CONTRACT_ID,
        certifiedJobs: jobs.filter((job) => job.decision === "certified").length,
        quarantinedJobs: jobs.filter((job) => job.decision === "quarantine").length,
      },
      legacyEnrichmentSeekDiagnostic: {
        diagnosticId: LEGACY_SEEK_DIAGNOSTIC_ID,
        governing: false,
        compatibleJobs: jobs.filter((job) => job.legacyEnrichmentSeekDiagnostic.decision === "compatible").length,
        incompatibleJobs: jobs.filter((job) => job.legacyEnrichmentSeekDiagnostic.decision === "incompatible").length,
        certifiedEndpoints: legacySeekCertifiedMetrics.length,
        quarantinedEndpoints: legacySeekQuarantinedMetrics.length,
        byRole: Object.fromEntries(["first", "last"].map((role) => {
          const endpoints = jobs.map((job) => job.endpoints[role]);
          return [role, {
            equivalentToPhysicalEndpoint: endpoints.filter((endpoint) => endpoint.legacyEnrichmentSeekDiagnostic.equivalentToPhysicalEndpoint).length,
            certified: endpoints.filter((endpoint) => endpoint.legacyEnrichmentSeekDiagnostic.decision === "certified").length,
            quarantined: endpoints.filter((endpoint) => endpoint.legacyEnrichmentSeekDiagnostic.decision === "quarantine").length,
            resolvedPhysicalFrameIndices: endpoints.map((endpoint) => endpoint.legacyEnrichmentSeekDiagnostic.resolvedPhysicalFrameIndex),
          }];
        })),
      },
      certifiedDistributions: {
        ssim: distribution(certifiedMetrics.map((metric) => metric.ssim)),
        pHashDistance: distribution(certifiedMetrics.map((metric) => metric.pHashDistance)),
        edgeCorrelation: distribution(certifiedMetrics.map((metric) => metric.edgeCorrelation)),
      },
      quarantinedDistributions: {
        ssim: distribution(quarantinedMetrics.map((metric) => metric.ssim)),
        pHashDistance: distribution(quarantinedMetrics.map((metric) => metric.pHashDistance)),
        edgeCorrelation: distribution(quarantinedMetrics.map((metric) => metric.edgeCorrelation)),
      },
      referenceRetrieval: {
        top1: jobs.flatMap((job) => Object.values(job.endpoints)).filter((endpoint) => endpoint.retrieval.rank === 1).length,
        top5: jobs.flatMap((job) => Object.values(job.endpoints)).filter((endpoint) => endpoint.retrieval.rank <= 5).length,
      },
      wrongReferenceControls: {
        count: impostorHashDistances.length,
        pHashDistance: distribution(impostorHashDistances),
        pHashGatePass: impostorHashDistances.filter((distance) => distance <= THRESHOLDS.pHashDistanceMax).length,
        fullCertificationRulePass: impostorFullRulePass,
      },
      fileIdentity: {
        transitionMediaMatchesMediaId: mediaReceipts.length,
        referenceStillMatchesDeclaration: references.length,
        referenceStillMatchesIndependentCatalog: references.length,
      },
    },
    jobs,
  };
  receipt.resultDigestSha256 = sha256Bytes(stableStringify(receipt));
  return receipt;
}

async function writeReceipt(outputPath, receipt) {
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await rename(tempPath, outputPath);
}

function summary(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    declaredTransitions: receipt.aggregate.declaredTransitionCount,
    certifiedJobs: receipt.aggregate.certifiedJobs,
    quarantinedJobs: receipt.aggregate.quarantinedJobs,
    certifiedEndpoints: receipt.aggregate.certifiedEndpoints,
    quarantinedEndpoints: receipt.aggregate.quarantinedEndpoints,
    wrongReferenceControls: receipt.aggregate.wrongReferenceControls.count,
    wrongReferenceControlPasses: receipt.aggregate.wrongReferenceControls.fullCertificationRulePass,
    quarantinedJobIds: receipt.aggregate.quarantinedJobIds,
    aggregateInputDigestSha256: receipt.inputs.aggregateInputDigestSha256,
    resultDigestSha256: receipt.resultDigestSha256,
  };
}

async function main() {
  const options = parseArguments();
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const receipt = await generateReceipt(options);
  if (options.write) await writeReceipt(options.outputPath, receipt);
  if (options.verify) {
    const existing = await readJson(options.outputPath, "transition endpoint validation artifact");
    if (stableStringify(existing) !== stableStringify(receipt)) fail(`Validation artifact is stale: ${options.outputPath}`);
  }
  process.stdout.write(`${JSON.stringify(options.json ? receipt : summary(receipt), null, 2)}\n`);
  if (options.requireAllCertified && receipt.aggregate.quarantinedJobs > 0) {
    process.exitCode = 2;
  }
}

const isDirectEntry = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectEntry) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}

// Shared deterministic visual-proof primitives. Keeping the transition and
// Reference-loop receipts on one implementation prevents their pixel metrics
// or canonical digests from drifting apart.
export {
  RGB_SIZE,
  SAMPLE_CONTRACT_ID,
  THRESHOLDS,
  compareEndpointFrame,
  decodeAllRgbFrames,
  decodeReference,
  distribution,
  fingerprints,
  fixed,
  hashMetrics,
  histogramIntersection,
  normalizedRmse,
  list,
  probeVideo,
  runtimePath,
  sha256Bytes,
  sha256File,
  stableStringify,
  text,
  toolVersion,
};
