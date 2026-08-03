#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEchoVideoEnrichmentCatalog,
  stableEchoEnrichmentStringify,
} from "../src/domain/echo-enrichment-director-variant.js";
import {
  buildBalancedAssignmentReport,
  ECHO_CHAIN_GRAPH_SCHEMA,
  ECHO_ENRICHMENT_REPORT_SCHEMA,
  REFERENCE_CATALOG_SCHEMA,
  REF_CARDS_TRANSITION_COMPILER,
  REF_CARDS_TRANSITION_DISCOVERY_POLICY,
  REF_CARDS_TRANSITION_RECEIPT_SCHEMA,
} from "./build-ref-cards-transition-contracts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PHYSICAL_REPORT_SCHEMA = "hapa.echo.transition-endpoint-visual-validation.v1";
const PHYSICAL_ALGORITHM_ID = "center-crop-luma-ssim-phash-edge-v3-physical-terminal-pts";
const PHYSICAL_SAMPLE_CONTRACT = "physical-terminal-frame-presentation-pts-v1";

export const REF_CARDS_TRANSITION_FINALIZER = "hapa-ref-cards-transition-contract-finalizer-v1";
export const REF_CARDS_TRANSITION_FINALIZE_POLICY = Object.freeze({
  schemaVersion: "hapa.echo.ref-cards-transition-finalize-policy.v1",
  compiler: REF_CARDS_TRANSITION_FINALIZER,
  inputCompiler: REF_CARDS_TRANSITION_COMPILER,
  acceptedPhysicalReportSchema: PHYSICAL_REPORT_SCHEMA,
  acceptedPhysicalAlgorithm: PHYSICAL_ALGORITHM_ID,
  acceptedPhysicalSampleContract: PHYSICAL_SAMPLE_CONTRACT,
  acceptedPhysicalThresholds: Object.freeze({
    ssimMin: 0.9,
    pHashDistanceMax: 10,
    edgeCorrelationMin: 0.75,
  }),
  declarations: "certified-jobs-only",
  assignment: REF_CARDS_TRANSITION_DISCOVERY_POLICY.assignment,
  downstreamRevalidationRequired: true,
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

function normalizedSha256(value, label) {
  const normalized = text(value).toLowerCase().replace(/^sha256:/u, "");
  if (!SHA256_PATTERN.test(normalized)) fail(`${label} must be a SHA-256 digest.`);
  return normalized;
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

export function parseRefCardsTransitionFinalizeArguments(argv = process.argv.slice(2)) {
  const known = new Set([
    "--help", "-h", "--candidate-dir", "--physical-validation", "--reference-catalog",
    "--projects", "--output", "--expected-song-count",
  ]);
  const values = new Set([...known].filter((name) => !["--help", "-h"].includes(name)));
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const name = raw.includes("=") ? raw.slice(0, raw.indexOf("=")) : raw;
    if (!known.has(name)) fail(`Unknown argument: ${raw}`);
    if (values.has(name) && !raw.includes("=")) index += 1;
  }
  const candidateDirectory = path.resolve(option(argv, "--candidate-dir", path.join(ROOT, "artifacts/ref-cards-transition-contracts-v1/candidate")));
  const physicalValidationPath = option(argv, "--physical-validation");
  if (!physicalValidationPath && !argv.includes("--help") && !argv.includes("-h")) fail("--physical-validation is required.");
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    candidateDirectory,
    physicalValidationPath: physicalValidationPath ? path.resolve(physicalValidationPath) : "",
    referenceCatalogPath: path.resolve(option(argv, "--reference-catalog", path.join(ROOT, "data/echo-reference-animated-media.json"))),
    projectsDirectory: path.resolve(option(argv, "--projects", path.join(ROOT, "data/music-video-projects"))),
    outputDirectory: path.resolve(option(argv, "--output", path.join(ROOT, "artifacts/ref-cards-transition-contracts-v1/final-certified"))),
    expectedSongCount: positiveInteger(option(argv, "--expected-song-count", "157"), "--expected-song-count"),
  };
}

function usage() {
  return [
    "Usage: node scripts/finalize-ref-cards-transition-contracts.mjs --physical-validation PATH [options]",
    "",
    "Filters a candidate Ref Cards graph to independently certified jobs and emits",
    "a new full enrichment/report/assignment bundle. It never applies Director cuts.",
    "The filtered graph must be run through the physical validator again before append.",
    "",
    "  --candidate-dir PATH       Candidate builder output directory.",
    "  --physical-validation PATH Physical validation of that exact candidate graph.",
    "  --reference-catalog PATH   Independent Reference animation catalog.",
    "  --projects PATH            Canonical Echo project directory.",
    "  --output PATH              Fresh append-only finalized output directory.",
    "  --expected-song-count N    Expected canonical songs (default 157).",
  ].join("\n");
}

function sameObject(left, right) {
  return stableEchoEnrichmentStringify(left) === stableEchoEnrichmentStringify(right);
}

function verifyCandidateReceipt(receipt, files) {
  if (receipt?.schemaVersion !== REF_CARDS_TRANSITION_RECEIPT_SCHEMA) {
    fail(`Candidate build receipt must use ${REF_CARDS_TRANSITION_RECEIPT_SCHEMA}.`);
  }
  if (receipt?.compiler !== REF_CARDS_TRANSITION_COMPILER) fail(`Candidate build receipt compiler must be ${REF_CARDS_TRANSITION_COMPILER}.`);
  for (const [fileName, bytes] of Object.entries(files)) {
    const output = receipt?.outputs?.[fileName];
    if (!output) fail(`Candidate build receipt does not bind ${fileName}.`);
    if (normalizedSha256(output.sha256, `${fileName} receipt SHA-256`) !== sha256Bytes(bytes)) fail(`Candidate ${fileName} does not match its build receipt.`);
    if (Number(output.bytes) !== bytes.length) fail(`Candidate ${fileName} byte length does not match its build receipt.`);
  }
  const core = structuredClone(receipt);
  delete core.resultDigestSha256;
  if (normalizedSha256(receipt.resultDigestSha256, "candidate receipt result digest") !== sha256Contract(core)) {
    fail("Candidate build receipt result digest is invalid.");
  }
}

function physicalJobId(row) {
  return text(row?.jobId || row?.job_id);
}

function validatePhysicalReport({ report, graphBytes, enrichmentsBytes, referenceCatalogBytes, declarations }) {
  if (report?.schemaVersion !== PHYSICAL_REPORT_SCHEMA) fail(`Physical validation must use ${PHYSICAL_REPORT_SCHEMA}.`);
  if (report?.algorithm?.id !== PHYSICAL_ALGORITHM_ID) fail(`Physical validation algorithm must be ${PHYSICAL_ALGORITHM_ID}.`);
  if (report?.algorithm?.sourceSampleContract?.id !== PHYSICAL_SAMPLE_CONTRACT) fail(`Physical validation sample contract must be ${PHYSICAL_SAMPLE_CONTRACT}.`);
  if (!sameObject(report?.algorithm?.thresholds, REF_CARDS_TRANSITION_FINALIZE_POLICY.acceptedPhysicalThresholds)) {
    fail("Physical validation thresholds do not match the finalize policy.");
  }
  const core = structuredClone(report);
  delete core.resultDigestSha256;
  if (normalizedSha256(report.resultDigestSha256, "physical validation result digest") !== sha256Contract(core)) {
    fail("Physical validation result digest is invalid.");
  }
  if (normalizedSha256(report?.inputs?.chainGraph?.sha256, "physical validation chain graph SHA-256") !== sha256Bytes(graphBytes)) {
    fail("Physical validation is not bound to the candidate chain graph.");
  }
  if (normalizedSha256(report?.inputs?.enrichments?.sha256, "physical validation enrichment SHA-256") !== sha256Bytes(enrichmentsBytes)) {
    fail("Physical validation is not bound to the candidate enrichment NDJSON.");
  }
  if (normalizedSha256(report?.inputs?.referenceCatalog?.sha256, "physical validation Reference catalog SHA-256") !== sha256Bytes(referenceCatalogBytes)) {
    fail("Physical validation is not bound to the independent Reference catalog.");
  }
  if (Number(report?.inputs?.declaredTransitionCount) !== declarations.length) fail("Physical validation declared-transition count does not match the candidate graph.");
  const declarationsByJobId = new Map();
  for (const declaration of declarations) {
    const jobId = text(declaration?.transitionLink?.id);
    const mediaId = text(declaration?.transitionMediaId);
    if (!jobId || !mediaId) fail("Candidate graph has an incomplete declared transition.");
    if (declarationsByJobId.has(jobId)) fail(`Candidate graph duplicates transition job ${jobId}.`);
    declarationsByJobId.set(jobId, { declaration, mediaId });
  }
  const jobsById = new Map();
  for (const job of list(report.jobs)) {
    const jobId = physicalJobId(job);
    const declaration = declarationsByJobId.get(jobId);
    if (!declaration) fail(`Physical validation references undeclared job ${jobId || "<missing>"}.`);
    if (jobsById.has(jobId)) fail(`Physical validation duplicates job ${jobId}.`);
    if (text(job.mediaId || job.media_id) !== declaration.mediaId) fail(`Physical validation job ${jobId} has the wrong media ID.`);
    const actualVideoSha256 = normalizedSha256(job?.video?.actualSha256 || job?.video?.actual_sha256, `${jobId} video SHA-256`);
    if (declaration.mediaId !== `hapa-media:sha256:${actualVideoSha256}`) fail(`Physical validation job ${jobId} video SHA-256 does not match its media ID.`);
    if (!["certified", "quarantine"].includes(text(job.decision).toLowerCase())) fail(`Physical validation job ${jobId} has an invalid decision.`);
    if (text(job.decision).toLowerCase() === "certified") {
      const first = job?.endpoints?.first;
      const last = job?.endpoints?.last;
      if (text(first?.decision).toLowerCase() !== "certified" || text(last?.decision).toLowerCase() !== "certified") {
        fail(`Certified physical job ${jobId} does not certify both endpoints.`);
      }
      if (Number(first?.decodedFrame?.frameIndex) !== 0) fail(`Certified physical job ${jobId} does not start at physical frame 0.`);
      const frameCount = Number(job?.video?.frameCount);
      if (!Number.isInteger(frameCount) || frameCount < 2 || Number(last?.decodedFrame?.frameIndex) !== frameCount - 1) {
        fail(`Certified physical job ${jobId} does not end at the physical terminal frame.`);
      }
    }
    jobsById.set(jobId, job);
  }
  if (jobsById.size !== declarations.length) fail(`Physical validation covers ${jobsById.size}/${declarations.length} declared jobs.`);
  const certified = [...jobsById.values()].filter((job) => text(job.decision).toLowerCase() === "certified");
  const quarantined = [...jobsById.values()].filter((job) => text(job.decision).toLowerCase() === "quarantine");
  if (Number(report?.aggregate?.certifiedJobs) !== certified.length || Number(report?.aggregate?.quarantinedJobs) !== quarantined.length) {
    fail("Physical validation aggregate job counts are inconsistent.");
  }
  if (!certified.length) fail("Physical validation certified no Ref Cards transition jobs.");
  return { jobsById, certified, quarantined };
}

async function canonicalSongs(projectsDirectory, expectedSongCount) {
  let files;
  try {
    files = (await readdir(projectsDirectory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort();
  } catch (error) {
    fail(`Cannot read canonical project directory ${projectsDirectory}: ${error.message}`);
  }
  if (files.length !== expectedSongCount) fail(`Expected exactly ${expectedSongCount} canonical projects; found ${files.length}.`);
  const songs = [];
  for (const fileName of files) {
    const payload = await readJson(path.join(projectsDirectory, fileName), "canonical project");
    const project = payload?.music_video_project || payload?.musicVideoProject || payload;
    const songId = text(project?.song_id || project?.songId);
    if (!songId) fail(`Canonical project ${fileName} is missing song_id.`);
    songs.push({ songId, songTitle: text(project?.song_title || project?.songTitle || project?.title, songId), fileName });
  }
  const ids = new Set(songs.map((song) => song.songId));
  if (ids.size !== songs.length) fail("Canonical projects contain duplicate song IDs.");
  return songs.sort((left, right) => left.songId.localeCompare(right.songId));
}

function transitionJobId(row) {
  return text(
    row?.flow?.transition?.declaredEndpoints?.link?.id
    || row?.continuity?.transition?.declaredEndpoints?.link?.id
    || row?.transitionContractDiscovery?.jobId,
  );
}

function demoteQuarantinedTransition(row, job) {
  const output = structuredClone(row);
  const demoted = {
    ...(output?.flow?.transition || output?.continuity?.transition || {}),
    eligible: false,
    classification: "not-transition",
    declaredTransition: false,
    visuallyValidated: false,
    visualClassification: "physical-endpoint-quarantine",
    visualValidationDecision: "quarantine",
    truthBoundary: "independent-physical-terminal-validation-quarantine",
    priorPhysicalValidation: {
      schemaVersion: "hapa.echo.ref-cards-prior-physical-validation.v1",
      jobId: physicalJobId(job),
      decision: "quarantine",
    },
  };
  output.flow = { ...(output.flow || {}), transition: structuredClone(demoted) };
  output.continuity = { ...(output.continuity || {}), transition: structuredClone(demoted) };
  return output;
}

function retainCertifiedTransition(row, job, physicalResultDigest) {
  const output = structuredClone(row);
  const priorPhysicalValidation = {
    schemaVersion: "hapa.echo.ref-cards-prior-physical-validation.v1",
    jobId: physicalJobId(job),
    mediaId: text(job.mediaId || job.media_id),
    decision: "certified",
    resultDigestSha256: physicalResultDigest,
    sourceSamples: structuredClone(job.sourceSamples || null),
    endpoints: {
      first: {
        frameIndex: Number(job?.endpoints?.first?.decodedFrame?.frameIndex),
        sourceTimeSeconds: Number(job?.endpoints?.first?.sourceTiming?.authoredSourceSeconds),
      },
      last: {
        frameIndex: Number(job?.endpoints?.last?.decodedFrame?.frameIndex),
        sourceTimeSeconds: Number(job?.endpoints?.last?.sourceTiming?.authoredSourceSeconds),
      },
    },
    downstreamRevalidationRequired: true,
  };
  for (const branch of ["flow", "continuity"]) {
    const transition = structuredClone(output?.[branch]?.transition || {});
    transition.priorPhysicalValidation = structuredClone(priorPhysicalValidation);
    transition.visuallyValidated = false;
    transition.visualValidationDecision = "awaiting-final-graph-physical-revalidation";
    transition.truthBoundary = "prior-candidate-graph-certified; final-graph-revalidation-required";
    output[branch] = { ...(output[branch] || {}), transition };
  }
  output.priorPhysicalValidation = priorPhysicalValidation;
  return output;
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
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const existing = await readFile(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
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

export async function finalizeRefCardsTransitionContracts(options = parseRefCardsTransitionFinalizeArguments()) {
  const candidatePaths = {
    "chain-graph.json": path.join(options.candidateDirectory, "chain-graph.json"),
    "enrichments.ndjson": path.join(options.candidateDirectory, "enrichments.ndjson"),
    "report.json": path.join(options.candidateDirectory, "report.json"),
  };
  const [
    graphBytes,
    enrichmentsBytes,
    reportBytes,
    candidateReceipt,
    candidateGraph,
    candidateEnrichments,
    candidateReport,
    physicalReport,
    referenceCatalog,
    referenceCatalogBytes,
    songs,
    compilerDigest,
  ] = await Promise.all([
    readFile(candidatePaths["chain-graph.json"]),
    readFile(candidatePaths["enrichments.ndjson"]),
    readFile(candidatePaths["report.json"]),
    readJson(path.join(options.candidateDirectory, "build-receipt.json"), "candidate build receipt"),
    readJson(candidatePaths["chain-graph.json"], "candidate chain graph"),
    readNdjson(candidatePaths["enrichments.ndjson"], "candidate enrichment NDJSON"),
    readJson(candidatePaths["report.json"], "candidate enrichment report"),
    readJson(options.physicalValidationPath, "physical endpoint validation"),
    readJson(options.referenceCatalogPath, "Reference catalog"),
    readFile(options.referenceCatalogPath),
    canonicalSongs(options.projectsDirectory, options.expectedSongCount),
    sha256File(SCRIPT_PATH),
  ]);
  verifyCandidateReceipt(candidateReceipt, {
    "chain-graph.json": graphBytes,
    "enrichments.ndjson": enrichmentsBytes,
    "report.json": reportBytes,
  });
  if (candidateGraph?.schemaVersion !== ECHO_CHAIN_GRAPH_SCHEMA) fail(`Candidate graph must use ${ECHO_CHAIN_GRAPH_SCHEMA}.`);
  if (candidateReport?.schemaVersion !== ECHO_ENRICHMENT_REPORT_SCHEMA || candidateReport?.complete !== true) fail(`Candidate report must be a complete ${ECHO_ENRICHMENT_REPORT_SCHEMA}.`);
  if (referenceCatalog?.schemaVersion !== REFERENCE_CATALOG_SCHEMA) fail(`Reference catalog must use ${REFERENCE_CATALOG_SCHEMA}.`);
  const declarations = list(candidateGraph.declaredTransitions);
  const physical = validatePhysicalReport({
    report: physicalReport,
    graphBytes,
    enrichmentsBytes,
    referenceCatalogBytes,
    declarations,
  });
  const certifiedJobIds = new Set(physical.certified.map(physicalJobId));
  const quarantinedJobIds = new Set(physical.quarantined.map(physicalJobId));
  const declarationJobIdByMediaId = new Map();
  for (const declaration of declarations) {
    const mediaId = text(declaration?.transitionMediaId || declaration?.transitionLink?.mediaId);
    const jobId = text(declaration?.transitionLink?.id);
    if (!mediaId || !jobId) fail("Candidate graph declaration is missing its media ID or transition job ID.");
    if (declarationJobIdByMediaId.has(mediaId)) fail(`Candidate graph declares multiple transition jobs for media ${mediaId}.`);
    declarationJobIdByMediaId.set(mediaId, jobId);
  }
  const physicalResultDigest = `sha256:${normalizedSha256(physicalReport.resultDigestSha256, "physical validation result digest")}`;
  const finalizerPolicyDigest = sha256Contract(REF_CARDS_TRANSITION_FINALIZE_POLICY);
  const inputBinding = {
    schemaVersion: "hapa.echo.ref-cards-transition-finalization-input-binding.v1",
    candidateBuildResultDigest: `sha256:${normalizedSha256(candidateReceipt.resultDigestSha256, "candidate build result digest")}`,
    candidateInputManifestDigest: candidateReceipt.inputBinding?.inputManifestDigest || null,
    physicalValidationResultDigest: physicalResultDigest,
    physicalValidationFileSha256: `sha256:${await sha256File(options.physicalValidationPath)}`,
    referenceCatalogSha256: `sha256:${sha256Bytes(referenceCatalogBytes)}`,
    finalizerPolicyDigest: `sha256:${finalizerPolicyDigest}`,
    finalizerCompilerDigest: `sha256:${compilerDigest}`,
  };
  const finalDeclarations = declarations.filter((declaration) => certifiedJobIds.has(text(declaration?.transitionLink?.id))).map((declaration) => {
    const output = structuredClone(declaration);
    const jobId = text(output.transitionLink?.id);
    const job = physical.jobsById.get(jobId);
    output.visuallyValidated = false;
    output.truthBoundary = "prior-candidate-graph-certified; final-graph-revalidation-required";
    output.priorPhysicalValidation = {
      schemaVersion: "hapa.echo.ref-cards-prior-physical-validation.v1",
      jobId,
      decision: "certified",
      resultDigestSha256: physicalResultDigest,
      sourceSamples: structuredClone(job.sourceSamples || null),
      downstreamRevalidationRequired: true,
    };
    output.transitionLink = { ...(output.transitionLink || {}), finalizationInputBinding: inputBinding };
    return output;
  }).sort((left, right) => text(left.transitionLink?.id).localeCompare(text(right.transitionLink?.id)));

  const rowsByJobId = new Map();
  const finalizedEnrichments = candidateEnrichments.map((row) => {
    const mediaId = text(row?.mediaId || row?.id);
    const jobId = declarationJobIdByMediaId.get(mediaId);
    // The candidate graph is the authority for this replacement family. Full
    // merged enrichment rows that retain an older provider's transition
    // semantics are intentionally preserved when their media is not declared
    // by the Ref Cards graph.
    if (!jobId) return row;
    const embeddedJobId = transitionJobId(row);
    if (embeddedJobId !== jobId) fail(`Candidate enrichment for media ${mediaId} does not bind graph transition job ${jobId}.`);
    if (rowsByJobId.has(jobId)) fail(`Candidate enrichments duplicate transition job ${jobId}.`);
    rowsByJobId.set(jobId, row);
    if (certifiedJobIds.has(jobId)) return retainCertifiedTransition(row, physical.jobsById.get(jobId), physicalResultDigest);
    if (quarantinedJobIds.has(jobId)) return demoteQuarantinedTransition(row, physical.jobsById.get(jobId));
    fail(`Candidate enrichment references transition job ${jobId} absent from physical validation.`);
  }).sort((left, right) => text(left.mediaId || left.id).localeCompare(text(right.mediaId || right.id)));
  for (const declaration of declarations) {
    const jobId = text(declaration?.transitionLink?.id);
    if (!rowsByJobId.has(jobId)) fail(`Candidate graph job ${jobId} has no enrichment row.`);
  }

  const finalGraph = {
    ...structuredClone(candidateGraph),
    generatedAt: text(physicalReport.generatedAt, candidateGraph.generatedAt),
    method: "ref-cards-certified-physical-terminal-filter-v1",
    declaredTransitions: finalDeclarations,
    totals: {
      ...(candidateGraph.totals || {}),
      candidateDeclaredTransitions: declarations.length,
      declaredTransitions: finalDeclarations.length,
      priorPhysicalCertifiedJobs: certifiedJobIds.size,
      priorPhysicalQuarantinedJobs: quarantinedJobIds.size,
    },
    finalizationInputBinding: inputBinding,
    truthBoundary: {
      candidateDiscoveryOnly: false,
      filteredByIndependentPhysicalValidation: true,
      finalGraphRevalidationRequired: true,
      visuallyValidated: false,
      certificationAuthority: REF_CARDS_TRANSITION_DISCOVERY_POLICY.certificationAuthority,
    },
  };
  const assignmentReport = buildBalancedAssignmentReport({
    declarations: finalDeclarations,
    canonicalSongs: songs,
    inputBinding,
    generatedAt: finalGraph.generatedAt,
  });
  const catalog = buildEchoVideoEnrichmentCatalog({
    enrichments: finalizedEnrichments,
    chainGraph: finalGraph,
    report: {},
    referenceAnimationCatalog: referenceCatalog,
  });
  const finalReport = {
    ...structuredClone(candidateReport),
    generatedAt: finalGraph.generatedAt,
    batchFingerprint: catalog.computedFingerprint,
    counts: {
      ...(candidateReport.counts || {}),
      manifestVideos: finalizedEnrichments.length,
      enrichmentRows: finalizedEnrichments.length,
      chainEdges: list(finalGraph.edges).length,
      declaredTransitions: finalDeclarations.length,
      declaredTransitionsAwaitingVisualValidation: finalDeclarations.length,
    },
    source: {
      ...(candidateReport.source || {}),
      finalizer: REF_CARDS_TRANSITION_FINALIZER,
      candidateDeclaredTransitions: declarations.length,
      certifiedDeclarationsRetained: finalDeclarations.length,
      quarantinedDeclarationsRemoved: quarantinedJobIds.size,
    },
    inputBinding,
    truthBoundary: "certified-candidate-subset-awaiting-final-graph-physical-revalidation",
  };
  const manifest = finalizedEnrichments.map(manifestRow);
  const finalizationReport = {
    schemaVersion: "hapa.echo.ref-cards-transition-finalization-report.v1",
    generatedAt: finalGraph.generatedAt,
    compiler: REF_CARDS_TRANSITION_FINALIZER,
    policy: REF_CARDS_TRANSITION_FINALIZE_POLICY,
    inputBinding,
    totals: {
      candidateJobs: declarations.length,
      certifiedJobsRetained: finalDeclarations.length,
      quarantinedJobsRemoved: quarantinedJobIds.size,
      canonicalSongs: songs.length,
      assignmentPairs: assignmentReport.balance.assignmentPairs,
      assignmentJobReuseMaximum: assignmentReport.balance.jobUsageMaximum,
    },
    certifiedJobIds: [...certifiedJobIds].sort(),
    quarantinedJobIds: [...quarantinedJobIds].sort(),
    validation: {
      candidateReceiptVerified: true,
      physicalValidationInputDigestsVerified: true,
      physicalValidationResultDigestVerified: true,
      onlyCertifiedJobsDeclared: finalDeclarations.every((row) => certifiedJobIds.has(text(row.transitionLink?.id))),
      allCanonicalSongsAssigned: assignmentReport.validation.allCanonicalSongsCovered,
      allCertifiedJobsAssigned: assignmentReport.validation.allDeclaredJobsCovered,
      assignmentMaximumReuseWithinPolicy: assignmentReport.balance.jobUsageMaximum <= REF_CARDS_TRANSITION_FINALIZE_POLICY.assignment.maximumJobReuse,
      finalGraphPhysicalRevalidationRequired: true,
      cutsApplied: false,
    },
  };
  const payloads = new Map([
    ["chain-graph.json", `${JSON.stringify(finalGraph, null, 2)}\n`],
    ["enrichments.ndjson", ndjson(finalizedEnrichments)],
    ["manifest.ndjson", ndjson(manifest)],
    ["report.json", `${JSON.stringify(finalReport, null, 2)}\n`],
    ["transition-assignment-report.json", `${JSON.stringify(assignmentReport, null, 2)}\n`],
    ["finalization-report.json", `${JSON.stringify(finalizationReport, null, 2)}\n`],
  ]);
  const outputDigests = Object.fromEntries([...payloads.entries()].map(([fileName, content]) => [fileName, {
    sha256: sha256Bytes(content),
    bytes: Buffer.byteLength(content),
  }]));
  const receiptCore = {
    schemaVersion: "hapa.echo.ref-cards-transition-finalization-receipt.v1",
    generatedAt: finalGraph.generatedAt,
    compiler: REF_CARDS_TRANSITION_FINALIZER,
    inputBinding,
    outputs: outputDigests,
    totals: finalizationReport.totals,
    validation: finalizationReport.validation,
  };
  payloads.set("finalization-receipt.json", `${JSON.stringify({
    ...receiptCore,
    resultDigestSha256: sha256Contract(receiptCore),
  }, null, 2)}\n`);
  await mkdir(options.outputDirectory, { recursive: true });
  const dispositions = {};
  for (const [fileName, content] of payloads) dispositions[fileName] = await writeReplaySafe(path.join(options.outputDirectory, fileName), content);
  return {
    ok: true,
    outputDirectory: options.outputDirectory,
    candidateJobs: declarations.length,
    certifiedJobs: finalDeclarations.length,
    quarantinedJobs: quarantinedJobIds.size,
    canonicalSongs: songs.length,
    assignmentPairs: assignmentReport.balance.assignmentPairs,
    assignmentJobReuseMaximum: assignmentReport.balance.jobUsageMaximum,
    finalGraphPhysicalRevalidationRequired: true,
    dispositions,
  };
}

async function main() {
  const options = parseRefCardsTransitionFinalizeArguments();
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await finalizeRefCardsTransitionContracts(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isDirectEntry = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isDirectEntry) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
