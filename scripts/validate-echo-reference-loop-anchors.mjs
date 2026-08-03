#!/usr/bin/env node

import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SAMPLE_CONTRACT_ID,
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
} from "./validate-echo-transition-endpoints.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ARTIFACT_ROOT = path.join(ROOT, "artifacts/echo-video-enrichment-v1");
const DEFAULT_CHAIN_GRAPH = path.join(DEFAULT_ARTIFACT_ROOT, "chain-graph.json");
const DEFAULT_ENRICHMENTS = path.join(DEFAULT_ARTIFACT_ROOT, "enrichments.ndjson");
const DEFAULT_REFERENCE_CATALOG = path.join(ROOT, "data/echo-reference-animated-media.json");
const DEFAULT_MEDIA_ROOT = path.join(ROOT, "data/media");
const DEFAULT_OUTPUT = path.join(DEFAULT_ARTIFACT_ROOT, "reference-loop-anchor-visual-validation.json");

const SCHEMA_VERSION = "hapa.echo.reference-loop-anchor-visual-validation.v1";
const CHAIN_GRAPH_SCHEMA = "hapa.echo.video-chain-graph.v1";
const REFERENCE_CATALOG_SCHEMA = "hapa.echo-reference-animated-media-catalog.v1";
const ALGORITHM_ID = "center-crop-luma-ssim-phash-edge-v1-reference-loop-terminals";
const CANONICALIZATION_ID = "recursive-lexicographic-json-keys-v1";
const LOOP_THRESHOLDS = Object.freeze({
  ssimMin: 0.15,
  pHashDistanceMax: 24,
  edgeCorrelationMin: 0.11,
  normalizedRmseMax: 0.17,
  histogramIntersectionMin: 0.67,
  hashSimilarityMin: 0.64,
  semanticSimilarityMin: 0.70,
  retrievalRankMax: 1,
  retrievalMarginMin: 0,
});

function fail(message) {
  throw new Error(message);
}

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactSha256(value, label) {
  const sha256 = text(value).replace(/^sha256:/u, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256)) fail(`${label} is not a SHA-256 digest.`);
  return sha256;
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
  const valueOptions = new Set([
    "--chain-graph",
    "--enrichments",
    "--reference-catalog",
    "--media-root",
    "--output",
  ]);
  const known = new Set([
    "--write",
    "--verify",
    "--json",
    "--require-all-certified",
    "--help",
    "-h",
    ...valueOptions,
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const name = raw.includes("=") ? raw.slice(0, raw.indexOf("=")) : raw;
    if (!known.has(name)) fail(`Unknown argument: ${raw}`);
    if (valueOptions.has(name) && !raw.includes("=")) index += 1;
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
    "Usage: node scripts/validate-echo-reference-loop-anchors.mjs [options]",
    "",
    "  --write                    Regenerate the deterministic loop-anchor receipt.",
    "  --verify                   Regenerate in memory and fail if the artifact is stale.",
    "  --json                     Print the complete regenerated receipt.",
    "  --require-all-certified    Exit non-zero when any Reference loop is quarantined.",
    "  --chain-graph PATH         Override the declared Vibes transition graph.",
    "  --enrichments PATH         Override the video enrichment NDJSON.",
    "  --reference-catalog PATH   Override the independent Reference animation catalog.",
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

function sameUri(left, right) {
  return text(left) === text(right);
}

function sameNumber(left, right, tolerance = 0.00001) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function endpointUse(declaration, role) {
  const jobId = text(declaration?.transitionLink?.id);
  const endpoint = role === "first" ? declaration?.sourceFrame : declaration?.targetFrame;
  const cardId = text(endpoint?.cardId);
  const imageUri = text(endpoint?.uri);
  const imageSha256 = exactSha256(endpoint?.sha256, `${jobId || "Declared transition"} ${role} Reference image`);
  if (!jobId || !cardId || !imageUri) fail("A declared transition has an incomplete Reference endpoint.");
  return {
    jobId,
    role,
    cardId,
    cardTitle: text(endpoint?.cardTitle),
    imageUri,
    imageSha256,
  };
}

function collectRequiredAnchors(chainGraph) {
  const declarations = list(chainGraph?.declaredTransitions);
  if (!declarations.length) fail("The chain graph has no declared Vibes transitions.");
  const jobs = new Set();
  const byCardId = new Map();
  for (const declaration of declarations) {
    const jobId = text(declaration?.transitionLink?.id);
    if (!jobId) fail("A declared transition is missing its job ID.");
    if (jobs.has(jobId)) fail(`Declared transition job is duplicated: ${jobId}`);
    jobs.add(jobId);
    for (const role of ["first", "last"]) {
      const use = endpointUse(declaration, role);
      const existing = byCardId.get(use.cardId);
      if (existing && (existing.imageUri !== use.imageUri || existing.imageSha256 !== use.imageSha256)) {
        fail(`Reference card ${use.cardId} has conflicting image contracts in the transition graph.`);
      }
      const anchor = existing || {
        cardId: use.cardId,
        cardTitle: use.cardTitle,
        imageUri: use.imageUri,
        imageSha256: use.imageSha256,
        uses: [],
      };
      anchor.uses.push({ jobId: use.jobId, role: use.role });
      byCardId.set(use.cardId, anchor);
    }
  }
  return [...byCardId.values()]
    .map((anchor) => ({
      ...anchor,
      uses: anchor.uses.sort((left, right) => compareCodepoint(left.jobId, right.jobId)
        || compareCodepoint(left.role, right.role)),
    }))
    .sort((left, right) => compareCodepoint(left.cardId, right.cardId));
}

function catalogRecordForAnchor(anchor, catalogByCardId) {
  const record = catalogByCardId.get(anchor.cardId);
  if (!record) fail(`Reference animation catalog has no record for ${anchor.cardId}.`);
  const image = record?.artifacts?.image;
  const loopVideo = record?.artifacts?.loopVideo;
  const imageSha256 = exactSha256(image?.sha256, `${anchor.cardId} catalog Reference image`);
  const videoSha256 = exactSha256(loopVideo?.sha256, `${anchor.cardId} catalog loop video`);
  const imageUri = text(image?.uri);
  const runtimeUri = text(loopVideo?.runtimeUri || loopVideo?.uri);
  if (!sameUri(imageUri, anchor.imageUri) || imageSha256 !== anchor.imageSha256) {
    fail(`Reference catalog does not bind ${anchor.cardId} to the graph's image URI and SHA.`);
  }
  if (!runtimeUri) fail(`${anchor.cardId} catalog record has no loop runtime URI.`);
  const loopMediaId = `hapa-media:sha256:${videoSha256}`;
  return { record, imageUri, imageSha256, runtimeUri, videoSha256, loopMediaId };
}

function validateEnrichmentRow(anchor, catalog, enrichmentsByMediaId) {
  const row = enrichmentsByMediaId.get(catalog.loopMediaId);
  if (!row) fail(`${anchor.cardId} loop ${catalog.loopMediaId} has no enrichment row.`);
  if (text(row?.mediaId || row?.id) !== catalog.loopMediaId) fail(`${anchor.cardId} enrichment media identity changed.`);
  if (text(row?.mediaKind).toLowerCase() !== "video" || row?.playable !== true || text(row?.decodeStatus) !== "decoded") {
    fail(`${anchor.cardId} loop enrichment is not a decoded, playable video.`);
  }
  if (!sameUri(row?.runtimeUri || row?.runtimeMediaUri, catalog.runtimeUri)) {
    fail(`${anchor.cardId} enrichment runtime URI does not match the Reference catalog.`);
  }
  const contentSha256 = exactSha256(row?.contentHash?.value || row?.technicalIdentity?.sha256, `${anchor.cardId} enrichment content hash`);
  if (contentSha256 !== catalog.videoSha256) fail(`${anchor.cardId} enrichment content hash does not match its loop media ID.`);
  // The catalog, byte identity, and pixel proof establish this anchor's role.
  // Preserve the heuristic enrichment label as evidence, but do not let an
  // older motion classifier overrule an explicitly authored Reference loop.
  return row;
}

function terminalRecord(role, frameIndex, frameBytes, probe, reference, referenceCorpus, cardId) {
  const fingerprint = fingerprints(frameBytes);
  const strictPixelDiagnostic = compareEndpointFrame(frameBytes, fingerprint, reference);
  const candidates = referenceCorpus.map((candidate) => {
    const hashes = hashMetrics(fingerprint, candidate.fingerprint);
    const candidateRmse = normalizedRmse(frameBytes, candidate.bytes);
    const candidateHistogram = histogramIntersection(frameBytes, candidate.bytes);
    const semanticSimilarity = 0.5 * hashes.hashSimilarity
      + 0.3 * (1 - candidateRmse)
      + 0.2 * candidateHistogram;
    return {
      cardId: candidate.cardId,
      hashSimilarity: fixed(hashes.hashSimilarity),
      pHashDistance: hashes.pHashDistance,
      normalizedRmse: fixed(candidateRmse),
      histogramIntersection: fixed(candidateHistogram),
      semanticSimilarity: fixed(semanticSimilarity),
      reference: candidate,
    };
  }).sort((left, right) => right.semanticSimilarity - left.semanticSimilarity
    || right.hashSimilarity - left.hashSimilarity
    || left.pHashDistance - right.pHashDistance
    || compareCodepoint(left.cardId, right.cardId));
  const quickFloorPasses = candidates.filter((candidate) => candidate.pHashDistance <= LOOP_THRESHOLDS.pHashDistanceMax
    && candidate.normalizedRmse <= LOOP_THRESHOLDS.normalizedRmseMax
    && candidate.histogramIntersection >= LOOP_THRESHOLDS.histogramIntersectionMin
    && candidate.hashSimilarity >= LOOP_THRESHOLDS.hashSimilarityMin
    && candidate.semanticSimilarity >= LOOP_THRESHOLDS.semanticSimilarityMin);
  const declared = candidates.find((candidate) => candidate.cardId === cardId);
  if (!declared) fail(`${cardId} is absent from the Reference retrieval corpus.`);
  const retrievalFloorPasses = quickFloorPasses.map((candidate) => {
    const comparison = candidate.cardId === cardId
      ? strictPixelDiagnostic
      : compareEndpointFrame(frameBytes, fingerprint, candidate.reference);
    const absoluteChecks = {
      ssim: comparison.metrics.ssim >= LOOP_THRESHOLDS.ssimMin,
      pHash: comparison.metrics.pHashDistance <= LOOP_THRESHOLDS.pHashDistanceMax,
      edgeCorrelation: comparison.metrics.edgeCorrelation >= LOOP_THRESHOLDS.edgeCorrelationMin,
      normalizedRmse: comparison.metrics.normalizedRmse <= LOOP_THRESHOLDS.normalizedRmseMax,
      histogramIntersection: comparison.metrics.histogramIntersection >= LOOP_THRESHOLDS.histogramIntersectionMin,
      hashSimilarity: comparison.metrics.hashSimilarity >= LOOP_THRESHOLDS.hashSimilarityMin,
      semanticSimilarity: candidate.semanticSimilarity >= LOOP_THRESHOLDS.semanticSimilarityMin,
    };
    return {
      ...candidate,
      fullMetrics: comparison.metrics,
      absoluteChecks,
      absoluteFloorPass: Object.values(absoluteChecks).every(Boolean),
    };
  }).filter((candidate) => candidate.absoluteFloorPass);
  const declaredIndex = retrievalFloorPasses.findIndex((candidate) => candidate.cardId === cardId);
  const bestImpostor = retrievalFloorPasses.find((candidate) => candidate.cardId !== cardId) || null;
  const bestUnfilteredImpostor = candidates.find((candidate) => candidate.cardId !== cardId);
  const declaredMargin = bestImpostor
    ? fixed(declared.semanticSimilarity - bestImpostor.semanticSimilarity)
    : null;
  const visualChecks = {
    ssim: strictPixelDiagnostic.metrics.ssim >= LOOP_THRESHOLDS.ssimMin,
    pHash: strictPixelDiagnostic.metrics.pHashDistance <= LOOP_THRESHOLDS.pHashDistanceMax,
    edgeCorrelation: strictPixelDiagnostic.metrics.edgeCorrelation >= LOOP_THRESHOLDS.edgeCorrelationMin,
    normalizedRmse: strictPixelDiagnostic.metrics.normalizedRmse <= LOOP_THRESHOLDS.normalizedRmseMax,
    histogramIntersection: strictPixelDiagnostic.metrics.histogramIntersection >= LOOP_THRESHOLDS.histogramIntersectionMin,
    hashSimilarity: strictPixelDiagnostic.metrics.hashSimilarity >= LOOP_THRESHOLDS.hashSimilarityMin,
    semanticSimilarity: declared.semanticSimilarity >= LOOP_THRESHOLDS.semanticSimilarityMin,
    retrievalRank: declaredIndex >= 0 && declaredIndex + 1 <= LOOP_THRESHOLDS.retrievalRankMax,
    retrievalMargin: !bestImpostor || declaredMargin >= LOOP_THRESHOLDS.retrievalMarginMin,
  };
  const decision = Object.values(visualChecks).every(Boolean) ? "certified" : "quarantine";
  const wrongReferenceQuickFloor = quickFloorPasses.filter((candidate) => candidate.cardId !== cardId);
  const wrongReferenceAbsoluteFloor = retrievalFloorPasses.filter((candidate) => candidate.cardId !== cardId);
  const topRetrievalCandidate = retrievalFloorPasses[0];
  let wrongReferenceFullRule = null;
  if (topRetrievalCandidate && topRetrievalCandidate.cardId !== cardId) {
    const runnerUp = retrievalFloorPasses.find((candidate) => candidate.cardId !== topRetrievalCandidate.cardId);
    const wrongChecks = {
      ...topRetrievalCandidate.absoluteChecks,
      retrievalRank: LOOP_THRESHOLDS.retrievalRankMax >= 1,
      retrievalMargin: !runnerUp
        || topRetrievalCandidate.semanticSimilarity - runnerUp.semanticSimilarity >= LOOP_THRESHOLDS.retrievalMarginMin,
    };
    wrongReferenceFullRule = {
      cardId: topRetrievalCandidate.cardId,
      metrics: topRetrievalCandidate.fullMetrics,
      semanticSimilarity: topRetrievalCandidate.semanticSimilarity,
      marginToRunnerUp: runnerUp
        ? fixed(topRetrievalCandidate.semanticSimilarity - runnerUp.semanticSimilarity)
        : null,
      checks: wrongChecks,
      decision: Object.values(wrongChecks).every(Boolean) ? "false-pass" : "rejected",
    };
  }
  function publicCandidate(candidate) {
    if (!candidate) return null;
    const {
      reference: omitted,
      fullMetrics: omittedFullMetrics,
      absoluteChecks: omittedAbsoluteChecks,
      absoluteFloorPass: omittedAbsoluteFloorPass,
      ...publicFields
    } = candidate;
    return publicFields;
  }
  return {
    role,
    decodedFrame: {
      frameIndex,
      nominalAtSeconds: fixed(frameIndex / probe.fps),
      presentationPtsSeconds: fixed(probe.framePtsSeconds[frameIndex]),
      rgb256Sha256: sha256Bytes(frameBytes),
    },
    metrics: strictPixelDiagnostic.metrics,
    retrieval: {
      method: "weighted-hash-rmse-histogram-retrieval-over-required-reference-loop-corpus-v1",
      scoreWeights: { hashSimilarity: 0.5, inverseNormalizedRmse: 0.3, histogramIntersection: 0.2 },
      corpusSize: candidates.length,
      qualifyingCandidateCount: retrievalFloorPasses.length,
      rank: declaredIndex >= 0 ? declaredIndex + 1 : null,
      declaredScore: declared.semanticSimilarity,
      marginToBestNonDeclared: declaredMargin,
      bestCardId: retrievalFloorPasses[0]?.cardId || null,
      unfilteredBestCardId: candidates[0].cardId,
      bestNonDeclared: publicCandidate(bestImpostor),
      bestNonDeclaredUnfiltered: publicCandidate(bestUnfilteredImpostor),
      topFiveQualifying: retrievalFloorPasses.slice(0, 5).map(publicCandidate),
      topFiveUnfiltered: candidates.slice(0, 5).map(publicCandidate),
    },
    wrongReferenceControls: {
      compared: candidates.length - 1,
      quickRetrievalFloorPassCount: wrongReferenceQuickFloor.length,
      retrievalFloorPassCount: wrongReferenceAbsoluteFloor.length,
      fullSemanticRulePassCount: wrongReferenceFullRule?.decision === "false-pass" ? 1 : 0,
      fullSemanticRule: wrongReferenceFullRule,
    },
    strictPixelIdentityDiagnostic: {
      governing: false,
      decision: strictPixelDiagnostic.decision,
      checks: strictPixelDiagnostic.checks,
      truthBoundary: "adaptive depth/particle loops are not claimed to be pixel-identical to the clean Reference still",
    },
    decision,
    checks: visualChecks,
  };
}

async function validateAnchor(anchor, catalogByCardId, enrichmentsByMediaId, requiredAnchors, normalizedReferenceFor, options) {
  const catalog = catalogRecordForAnchor(anchor, catalogByCardId);
  const enrichment = validateEnrichmentRow(anchor, catalog, enrichmentsByMediaId);
  const videoPath = runtimePath(options.mediaRoot, catalog.runtimeUri);
  const [actualVideoSha256, videoStat, probe] = await Promise.all([
    sha256File(videoPath),
    stat(videoPath),
    probeVideo(videoPath),
  ]);
  if (actualVideoSha256 !== catalog.videoSha256) fail(`${anchor.cardId} loop video bytes do not match ${catalog.videoSha256}.`);
  const declaredBytes = Number(catalog.record?.artifacts?.loopVideo?.bytes);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes !== videoStat.size) {
    fail(`${anchor.cardId} loop byte length ${videoStat.size} does not match catalog ${declaredBytes}.`);
  }
  const technical = catalog.record?.technical;
  if (Number(technical?.width) !== probe.width
    || Number(technical?.height) !== probe.height
    || Number(technical?.frameCount) !== probe.frameCount
    || !sameNumber(technical?.durationSec, probe.durationSeconds)
    || !sameNumber(technical?.fps, probe.fps)) {
    fail(`${anchor.cardId} loop probe does not match its catalog technical identity.`);
  }
  const [decodedFrames, declaredReference, ...referenceCorpus] = await Promise.all([
    decodeAllRgbFrames(videoPath),
    normalizedReferenceFor(anchor, probe.width, probe.height),
    ...requiredAnchors.map((candidate) => normalizedReferenceFor(candidate, probe.width, probe.height)),
  ]);
  if (decodedFrames.frameCount !== probe.frameCount) {
    fail(`${anchor.cardId} complete RGB decode returned ${decodedFrames.frameCount}/${probe.frameCount} frames.`);
  }
  if (declaredReference.actualFileSha256 !== catalog.imageSha256) {
    fail(`${anchor.cardId} Reference image bytes do not match ${catalog.imageSha256}.`);
  }
  const reference = declaredReference;
  const firstBytes = decodedFrames.bytes.subarray(0, decodedFrames.frameBytes);
  const lastStart = (decodedFrames.frameCount - 1) * decodedFrames.frameBytes;
  const lastBytes = decodedFrames.bytes.subarray(lastStart, lastStart + decodedFrames.frameBytes);
  const first = terminalRecord("first", 0, firstBytes, probe, reference, referenceCorpus, anchor.cardId);
  const last = terminalRecord("last", probe.frameCount - 1, lastBytes, probe, reference, referenceCorpus, anchor.cardId);
  const decision = first.decision === "certified" && last.decision === "certified" ? "certified" : "quarantine";
  return {
    cardId: anchor.cardId,
    cardTitle: anchor.cardTitle || text(catalog.record?.card?.title),
    declaredTransitionUse: {
      occurrenceCount: anchor.uses.length,
      jobIds: [...new Set(anchor.uses.map((use) => use.jobId))].sort(compareCodepoint),
      roles: {
        first: anchor.uses.filter((use) => use.role === "first").length,
        last: anchor.uses.filter((use) => use.role === "last").length,
      },
      uses: anchor.uses,
    },
    image: {
      runtimeUri: catalog.imageUri,
      imageSha256: catalog.imageSha256,
      actualFileSha256: declaredReference.actualFileSha256,
      normalizedRgb256Sha256: sha256Bytes(declaredReference.bytes),
    },
    loopMediaId: catalog.loopMediaId,
    runtimeUri: catalog.runtimeUri,
    videoSha256: catalog.videoSha256,
    video: {
      actualFileSha256: actualVideoSha256,
      byteLength: videoStat.size,
      width: probe.width,
      height: probe.height,
      frameCount: probe.frameCount,
      durationSeconds: fixed(probe.durationSeconds),
      fps: fixed(probe.fps),
      sourceSampleContractId: SAMPLE_CONTRACT_ID,
    },
    enrichment: {
      mediaId: text(enrichment?.mediaId || enrichment?.id),
      contentSha256: catalog.videoSha256,
      loopClassification: text(enrichment?.flow?.loop?.classification),
      loopEligible: enrichment?.flow?.loop?.eligible === true,
    },
    endpoints: { first, last },
    truthBoundary: "semantic-visual-identity-to-declared-reference-still; no-pixel-identity-claim-to-clean-still-or-transition-terminal",
    selectionEligibility: decision === "certified",
    decision,
  };
}

async function generateReceipt(options) {
  const [
    chainGraph,
    enrichments,
    referenceCatalog,
    chainGraphSha256,
    enrichmentsSha256,
    referenceCatalogSha256,
    ffmpegVersion,
    ffprobeVersion,
  ] = await Promise.all([
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

  const requiredAnchors = collectRequiredAnchors(chainGraph);
  const catalogByCardId = new Map();
  for (const record of list(referenceCatalog?.records)) {
    const cardId = text(record?.card?.id);
    if (!cardId) continue;
    if (catalogByCardId.has(cardId)) fail(`Reference animation catalog card is duplicated: ${cardId}`);
    catalogByCardId.set(cardId, record);
  }
  const enrichmentsByMediaId = new Map();
  for (const row of enrichments) {
    const mediaId = text(row?.mediaId || row?.id);
    if (!mediaId) continue;
    if (enrichmentsByMediaId.has(mediaId)) fail(`Enrichment media ID is duplicated: ${mediaId}`);
    enrichmentsByMediaId.set(mediaId, row);
  }

  const normalizedReferenceCache = new Map();
  async function normalizedReferenceFor(anchor, width, height) {
    const key = `${anchor.cardId}:${width}x${height}`;
    if (!normalizedReferenceCache.has(key)) {
      normalizedReferenceCache.set(key, (async () => {
        const catalog = catalogRecordForAnchor(anchor, catalogByCardId);
        const imagePath = runtimePath(options.mediaRoot, catalog.imageUri);
        const [actualFileSha256, bytes] = await Promise.all([
          sha256File(imagePath),
          decodeReference(imagePath, width, height),
        ]);
        if (actualFileSha256 !== catalog.imageSha256) {
          fail(`${anchor.cardId} Reference image bytes do not match ${catalog.imageSha256}.`);
        }
        return {
          cardId: anchor.cardId,
          actualFileSha256,
          bytes,
          fingerprint: fingerprints(bytes),
        };
      })());
    }
    return normalizedReferenceCache.get(key);
  }

  const recordList = [];
  for (const [index, anchor] of requiredAnchors.entries()) {
    recordList.push(await validateAnchor(
      anchor,
      catalogByCardId,
      enrichmentsByMediaId,
      requiredAnchors,
      normalizedReferenceFor,
      options,
    ));
    process.stderr.write(`validated ${index + 1}/${requiredAnchors.length} ${anchor.cardId}\n`);
  }
  recordList.sort((left, right) => compareCodepoint(left.cardId, right.cardId));
  const records = Object.fromEntries(recordList.map((record) => [record.cardId, record]));
  const endpoints = recordList.flatMap((record) => [record.endpoints.first, record.endpoints.last]);
  const certifiedEndpoints = endpoints.filter((endpoint) => endpoint.decision === "certified");
  const quarantinedEndpoints = endpoints.filter((endpoint) => endpoint.decision === "quarantine");
  const identityRows = recordList.map((record) => ({
    cardId: record.cardId,
    imageSha256: record.image.imageSha256,
    loopMediaId: record.loopMediaId,
    runtimeUri: record.runtimeUri,
    videoSha256: record.videoSha256,
    byteLength: record.video.byteLength,
  }));

  const algorithm = {
    id: ALGORITHM_ID,
    decodedFrames: "complete deterministic RGB decode; governing loop endpoints are physical n=0 and n=frameCount-1",
    sourceSampleContract: {
      id: SAMPLE_CONTRACT_ID,
      first: "physical frame n=0 at its ffprobe best-effort presentation timestamp",
      last: "physical frame n=frameCount-1 at its ffprobe best-effort presentation timestamp",
    },
    normalization: "center-crop Reference to decoded loop aspect; resize loop and Reference to 256x256 Lanczos RGB",
    ssim: "11x11 valid-window BT.709-luma SSIM; K1=0.01, K2=0.03, L=255",
    hashes: "64-bit bilinear aHash, dHash, and 32x32 DCT pHash",
    edgeCorrelation: "Pearson correlation of forward-gradient magnitudes",
    thresholds: LOOP_THRESHOLDS,
    thresholdCalibration: {
      corpus: `all physical first/last frames of the ${recordList.length} Reference loops required by the declared Vibes transition graph, each compared with its declared still and all ${Math.max(0, recordList.length - 1)} wrong stills`,
      purpose: "prove bounded semantic visual identity after authored depth, crop, grading, and particle treatment; do not claim pixel identity",
      absoluteFloor: "SSIM, pHash, edge, RMSE, histogram, hash, and weighted semantic-similarity floors must all pass",
      retrievalMargin: "the declared still must rank first without a negative margin among candidates that pass the retrieval absolute floor; ranking still evaluates the complete required-Reference corpus",
    },
    decision: "the loop terminal certifies semantic visual identity only when its absolute floor and all-Reference retrieval-margin checks pass; both terminals certify the anchor",
    truthBoundary: "certified means the displayed adaptive loop retains the Reference still's semantic visual identity; it does not mean pixel identity with the clean still or transition endpoint",
    canonicalization: CANONICALIZATION_ID,
    implementation: "shared-with-validate-echo-transition-endpoints.mjs",
  };
  const inputs = {
    chainGraph: { path: relativeInputPath(options.chainGraphPath), sha256: chainGraphSha256 },
    referenceCatalog: { path: relativeInputPath(options.referenceCatalogPath), sha256: referenceCatalogSha256 },
    enrichments: { path: relativeInputPath(options.enrichmentsPath), sha256: enrichmentsSha256 },
    mediaRoot: relativeInputPath(options.mediaRoot),
    declaredTransitionCount: list(chainGraph?.declaredTransitions).length,
    requiredReferenceLoopCount: requiredAnchors.length,
    requiredReferenceEndpointUseCount: requiredAnchors.reduce((sum, anchor) => sum + anchor.uses.length, 0),
    requiredReferenceLoopSetDigestSha256: sha256Bytes(stableStringify(identityRows)),
  };
  inputs.aggregateInputDigestSha256 = sha256Bytes(stableStringify({ algorithm, ...inputs }));

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: text(chainGraph?.generatedAt),
    generatedAtBasis: "chain-graph.generatedAt",
    algorithm,
    tooling: { ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion },
    inputs,
    aggregate: {
      declaredTransitionCount: list(chainGraph?.declaredTransitions).length,
      requiredReferenceLoopCount: recordList.length,
      endpointCount: endpoints.length,
      certifiedRecords: recordList.filter((record) => record.decision === "certified").length,
      quarantinedRecords: recordList.filter((record) => record.decision === "quarantine").length,
      certifiedEndpoints: certifiedEndpoints.length,
      quarantinedEndpoints: quarantinedEndpoints.length,
      quarantinedCardIds: recordList.filter((record) => record.decision === "quarantine").map((record) => record.cardId),
      byRole: Object.fromEntries(["first", "last"].map((role) => [role, {
        certified: recordList.filter((record) => record.endpoints[role].decision === "certified").length,
        quarantined: recordList.filter((record) => record.endpoints[role].decision === "quarantine").length,
      }])),
      certifiedDistributions: {
        ssim: distribution(certifiedEndpoints.map((endpoint) => endpoint.metrics.ssim)),
        pHashDistance: distribution(certifiedEndpoints.map((endpoint) => endpoint.metrics.pHashDistance)),
        edgeCorrelation: distribution(certifiedEndpoints.map((endpoint) => endpoint.metrics.edgeCorrelation)),
      },
      quarantinedDistributions: {
        ssim: distribution(quarantinedEndpoints.map((endpoint) => endpoint.metrics.ssim)),
        pHashDistance: distribution(quarantinedEndpoints.map((endpoint) => endpoint.metrics.pHashDistance)),
        edgeCorrelation: distribution(quarantinedEndpoints.map((endpoint) => endpoint.metrics.edgeCorrelation)),
      },
      retrieval: {
        corpusSize: recordList.length,
        top1Endpoints: endpoints.filter((endpoint) => endpoint.retrieval.rank === 1).length,
        top5Endpoints: endpoints.filter((endpoint) => Number.isInteger(endpoint.retrieval.rank) && endpoint.retrieval.rank <= 5).length,
        absentFromQualifyingCorpus: endpoints.filter((endpoint) => !Number.isInteger(endpoint.retrieval.rank)).length,
        worstDeclaredRank: Math.max(...endpoints.map((endpoint) => endpoint.retrieval.rank).filter(Number.isInteger)),
        marginToBestNonDeclared: distribution(endpoints.map((endpoint) => endpoint.retrieval.marginToBestNonDeclared)),
      },
      wrongReferenceControls: {
        comparisons: endpoints.reduce((sum, endpoint) => sum + endpoint.wrongReferenceControls.compared, 0),
        quickRetrievalFloorPasses: endpoints.reduce((sum, endpoint) => sum + endpoint.wrongReferenceControls.quickRetrievalFloorPassCount, 0),
        retrievalFloorPasses: endpoints.reduce((sum, endpoint) => sum + endpoint.wrongReferenceControls.retrievalFloorPassCount, 0),
        fullSemanticRulePasses: endpoints.reduce((sum, endpoint) => sum + endpoint.wrongReferenceControls.fullSemanticRulePassCount, 0),
      },
      strictPixelIdentityDiagnostic: {
        governing: false,
        certifiedEndpoints: endpoints.filter((endpoint) => endpoint.strictPixelIdentityDiagnostic.decision === "certified").length,
        quarantinedEndpoints: endpoints.filter((endpoint) => endpoint.strictPixelIdentityDiagnostic.decision === "quarantine").length,
        truthBoundary: "reported to prevent semantic loop identity from being mistaken for clean-still pixel identity",
      },
      fileIdentity: {
        imageFilesMatchCatalogSha256: recordList.length,
        loopFilesMatchCatalogSha256: recordList.length,
        loopFilesMatchMediaId: recordList.length,
        loopFilesMatchCatalogByteLength: recordList.length,
        enrichmentRowsMatchLoopIdentity: recordList.length,
      },
    },
    consumerContract: {
      selectionGate: "a compiler may select an A/B Reference loop only when its exact cardId record exists, decision is certified, selectionEligibility is true, and all input/result digests revalidate",
      continuityClaim: "this receipt proves bounded semantic visual identity between each adaptive loop terminal and its declared Reference still; transition-terminal pixel identity remains a separate receipt",
      transitiveUse: "A-loop -> declared A still -> certified transition terminal is a lineage-plus-semantic bridge, not a claim that A-loop and transition terminal pixels are identical",
    },
    records,
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
    algorithmId: receipt.algorithm.id,
    declaredTransitions: receipt.aggregate.declaredTransitionCount,
    requiredReferenceLoops: receipt.aggregate.requiredReferenceLoopCount,
    certifiedRecords: receipt.aggregate.certifiedRecords,
    quarantinedRecords: receipt.aggregate.quarantinedRecords,
    certifiedEndpoints: receipt.aggregate.certifiedEndpoints,
    quarantinedEndpoints: receipt.aggregate.quarantinedEndpoints,
    quarantinedCardIds: receipt.aggregate.quarantinedCardIds,
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
    const existing = await readJson(options.outputPath, "Reference loop validation artifact");
    const storedDigest = text(existing?.resultDigestSha256);
    const unsigned = { ...existing };
    delete unsigned.resultDigestSha256;
    if (storedDigest !== sha256Bytes(stableStringify(unsigned))) fail("Stored Reference loop receipt result digest is invalid.");
    if (stableStringify(existing) !== stableStringify(receipt)) fail(`Validation artifact is stale: ${options.outputPath}`);
  }
  process.stdout.write(`${JSON.stringify(options.json ? receipt : summary(receipt), null, 2)}\n`);
  if (options.requireAllCertified && receipt.aggregate.quarantinedRecords > 0) process.exitCode = 2;
}

const isDirectEntry = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectEntry) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}

export { ALGORITHM_ID, SCHEMA_VERSION, generateReceipt };
