#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ECHO_ENRICHMENT_DIRECTOR_REPORT_SCHEMA,
  ECHO_ENRICHMENT_DIRECTOR_COMPILER,
  ECHO_VIDEO_ENRICHMENT_EXPECTED_SCHEMA,
  buildEchoVideoEnrichmentCatalog,
  compileEchoEnrichmentDirectorVariant,
  echoDeclaredTransitionEndpointContractDigest,
  echoEnrichmentCompilerInputFingerprint,
  echoEnrichmentSha256,
  echoEnrichmentDirectorVariantIndexRow,
  echoReferenceAnimationCatalogContractDigest,
  echoTransitionSelectionBalanceDigest,
  normalizeEchoVideoEnrichmentRow,
  selectLatestEnrichmentParentVariant,
  stableEchoEnrichmentStringify,
} from "../src/domain/echo-enrichment-director-variant.js";
import {
  discoverDirectionVariantIndexRows,
  mergeDirectionVariantIndexRows,
} from "../src/domain/echo-direction-variant-index.js";
import { echoDirectionVariantFingerprint } from "../src/domain/echo-direction-variants.js";
import { validateEchoEnrichmentCatalogIntegrity } from "../src/domain/echo-enrichment-catalog-integrity.js";
import {
  resolveEchoEnrichmentVariantPath,
  validateEchoEnrichmentSongId,
} from "../src/domain/echo-enrichment-path-safety.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ARTIFACTS = path.join(ROOT, "artifacts/echo-video-enrichment-v1");
const DEFAULT_TRANSITION_ASSIGNMENTS = path.join(
  ROOT,
  "data/merge-reports/vibes-transition-director-scripts-33beff74b1ea.json",
);
const DEFAULT_REFERENCE_ANIMATION_CATALOG = path.join(
  ROOT,
  "data/echo-reference-animated-media.json",
);
const DEFAULT_TRANSITION_VISUAL_VALIDATION = path.join(
  DEFAULT_ARTIFACTS,
  "transition-endpoint-visual-validation.json",
);
const TRANSITION_ASSIGNMENT_REPORT_SCHEMA = "hapa.vibes-transition-director-script-report.v1";
const REFERENCE_ANIMATION_CATALOG_SCHEMA = "hapa.echo-reference-animated-media-catalog.v1";
const TRANSITION_ENDPOINT_VISUAL_VALIDATION_SCHEMA = "hapa.echo.transition-endpoint-visual-validation.v1";
const TRANSITION_ENDPOINT_VISUAL_VALIDATION_RECEIPT_SCHEMA = "hapa.echo.transition-endpoint-visual-validation-receipt.v1";
const TRANSITION_ENDPOINT_VISUAL_VALIDATION_ALGORITHM = "center-crop-luma-ssim-phash-edge-v3-physical-terminal-pts";
const TRANSITION_ENDPOINT_VISUAL_SAMPLE_CONTRACT = "physical-terminal-frame-presentation-pts-v1";
const TRANSITION_ENDPOINT_VISUAL_THRESHOLDS = Object.freeze({
  ssimMin: 0.9,
  pHashDistanceMax: 10,
  edgeCorrelationMin: 0.75,
});

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && entry !== undefined) : [];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function option(argv, names, fallback = "") {
  for (const name of names) {
    const exactIndex = argv.indexOf(name);
    if (exactIndex >= 0 && argv[exactIndex + 1] && !argv[exactIndex + 1].startsWith("--")) return argv[exactIndex + 1];
    const prefixed = argv.find((argument) => argument.startsWith(`${name}=`));
    if (prefixed) return prefixed.slice(name.length + 1);
  }
  return fallback;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function resolveOption(argv, names, fallback) {
  return path.resolve(option(argv, names, fallback));
}

export function parseEnrichmentDirectorArguments(argv = process.argv.slice(2)) {
  const apply = hasFlag(argv, "--apply");
  const songId = text(option(argv, ["--song-id"], ""));
  if (songId) validateEchoEnrichmentSongId(songId);
  const expectedDefault = songId ? 1 : 157;
  const expectedSongCount = Number(option(argv, ["--expected-song-count"], String(expectedDefault)));
  if (!Number.isInteger(expectedSongCount) || expectedSongCount < 1) throw new Error("--expected-song-count must be a positive integer.");
  const variantsDirectory = resolveOption(argv, ["--variants", "--variants-dir"], path.join(ROOT, "data/music-video-project-variants"));
  return {
    apply,
    songId,
    expectedSongCount,
    enrichmentsPath: resolveOption(argv, ["--enrichments"], path.join(DEFAULT_ARTIFACTS, "enrichments.ndjson")),
    chainGraphPath: resolveOption(argv, ["--chain-graph"], path.join(DEFAULT_ARTIFACTS, "chain-graph.json")),
    enrichmentReportPath: resolveOption(argv, ["--enrichment-report", "--source-report"], path.join(DEFAULT_ARTIFACTS, "report.json")),
    transitionAssignmentsPath: resolveOption(
      argv,
      ["--transition-assignments"],
      DEFAULT_TRANSITION_ASSIGNMENTS,
    ),
    referenceAnimationCatalogPath: resolveOption(
      argv,
      ["--reference-animation-catalog"],
      DEFAULT_REFERENCE_ANIMATION_CATALOG,
    ),
    transitionVisualValidationPath: resolveOption(
      argv,
      ["--transition-visual-validation"],
      DEFAULT_TRANSITION_VISUAL_VALIDATION,
    ),
    mediaRoot: resolveOption(argv, ["--media-root"], path.join(ROOT, "data/media")),
    songsPath: resolveOption(argv, ["--songs", "--songs-store"], path.join(ROOT, "data/hapa-songs-store.json")),
    projectsDirectory: resolveOption(argv, ["--projects", "--projects-dir"], path.join(ROOT, "data/music-video-projects")),
    variantsDirectory,
    indexPath: resolveOption(argv, ["--index", "--variant-index"], path.join(variantsDirectory, "index.json")),
    reportPath: resolveOption(argv, ["--report-out"], path.join(ROOT, "artifacts/echo-enrichment-director-variants/report.json")),
    backupsDirectory: resolveOption(argv, ["--backups"], path.join(ROOT, "data/backups")),
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== undefined) return fallback;
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`, { cause: error });
  }
}

export async function readEnrichmentNdjson(filePath) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read enrichment NDJSON ${filePath}: ${error.message}`, { cause: error });
  }
  const rows = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("row is not a JSON object");
      rows.push(row);
    } catch (error) {
      throw new Error(`Invalid enrichment NDJSON at ${filePath}:${index + 1}: ${error.message}`, { cause: error });
    }
  }
  if (!rows.length) throw new Error(`Enrichment NDJSON has no rows: ${filePath}`);
  return rows;
}

async function atomicWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, typeof payload === "string" ? payload : json(payload), "utf8");
  await rename(temporary, filePath);
}

async function exclusiveWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(typeof payload === "string" || Buffer.isBuffer(payload) ? payload : json(payload));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function exists(filePath) {
  return Boolean(await stat(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  }));
}

async function acquireIndexLock(lockPath, attempts = 250) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(json({ pid: process.pid, acquiredAt: new Date().toISOString() }), "utf8");
      await handle.sync();
      return handle;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for serialized Direction Variant index lock: ${lockPath}`);
}

async function withIndexLock(indexPath, operation) {
  const lockPath = `${indexPath}.enrichment.lock`;
  const handle = await acquireIndexLock(lockPath);
  try {
    return await operation();
  } finally {
    await handle.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

function unwrapProject(payload = {}) {
  return payload.music_video_project || payload.musicVideoProject || payload.project || payload;
}

async function discoverProjects(directory, targetSongId = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const projects = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(directory, entry.name);
    const bytes = await readFile(filePath);
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Cannot parse Echo project ${filePath}: ${error.message}`, { cause: error });
    }
    const project = unwrapProject(payload);
    const rawSongId = text(project.song_id || project.songId);
    const songId = rawSongId ? validateEchoEnrichmentSongId(rawSongId) : "";
    if (!songId || (targetSongId && songId !== targetSongId)) continue;
    projects.push({ filePath, fileName: entry.name, bytes, payload, project, songId });
  }
  return projects;
}

function songLookup(songsPayload = {}) {
  const lookup = new Map();
  for (const song of list(songsPayload.songs || songsPayload.records || songsPayload)) {
    for (const id of [song.id, song.cardId, song.card_id, song.songId, song.song_id].filter(Boolean)) {
      if (!lookup.has(String(id))) lookup.set(String(id), song);
    }
  }
  return lookup;
}

function transitionJobId(row = {}) {
  return text(
    row.flow?.transition?.declaredEndpoints?.link?.id
    || row.continuity?.transition?.declaredEndpoints?.link?.id
    || row.transition?.declaredEndpoints?.link?.id,
  );
}

function transitionEndpointContract(value = {}) {
  return {
    cardId: text(value.cardId || value.card_id || value.referenceCardId || value.reference_card_id || value.ownerId || value.owner_id),
    assetId: text(value.assetId || value.asset_id),
    frameId: text(value.frameId || value.frame_id),
    sha256: normalizedSha256(value.sha256 || value.contentHash || value.content_hash),
    uri: text(value.uri || value.mediaUri || value.media_uri),
    sourceCardUnchanged: value.sourceCardUnchanged === true || value.source_card_unchanged === true,
  };
}

function resolveEndpointImagePath(uri, mediaRoot) {
  let decoded;
  try {
    decoded = decodeURIComponent(text(uri).split(/[?#]/u)[0]);
  } catch {
    throw new Error(`Transition endpoint URI cannot be decoded: ${uri || "<missing>"}.`);
  }
  if (!decoded.startsWith("/media/") || decoded.includes("\\") || decoded.includes("\0")) {
    throw new Error(`Transition endpoint URI is not a safe local media path: ${uri || "<missing>"}.`);
  }
  const root = path.resolve(mediaRoot);
  const resolved = path.resolve(root, decoded.slice("/media/".length));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Transition endpoint URI escapes or aliases the media root: ${uri}.`);
  }
  return resolved;
}

export async function validateDeclaredTransitionEndpointFiles({
  chainGraph = {},
  referenceAnimationCatalog = {},
  mediaRoot = path.join(ROOT, "data/media"),
} = {}) {
  if (referenceAnimationCatalog.schemaVersion !== REFERENCE_ANIMATION_CATALOG_SCHEMA) {
    throw new Error(`Reference animation catalog must use ${REFERENCE_ANIMATION_CATALOG_SCHEMA}.`);
  }
  const recordsByCardId = new Map();
  for (const record of list(referenceAnimationCatalog.records)) {
    const cardId = text(record.card?.id || record.cardId || record.card_id);
    if (!cardId) continue;
    if (recordsByCardId.has(cardId)) throw new Error(`Reference animation catalog duplicates card ${cardId}.`);
    recordsByCardId.set(cardId, record);
  }
  let endpointRecords = 0;
  const uniqueCards = new Set();
  const uniqueFiles = new Set();
  for (const declaration of list(chainGraph.declaredTransitions || chainGraph.declared_transitions)) {
    const jobId = text(declaration.transitionLink?.id || declaration.transition_link?.id) || "<missing>";
    for (const [role, rawEndpoint] of [
      ["first", declaration.sourceFrame || declaration.source_frame || declaration.first],
      ["last", declaration.targetFrame || declaration.target_frame || declaration.last],
    ]) {
      const endpoint = transitionEndpointContract(rawEndpoint);
      if (!endpoint.cardId || !endpoint.uri || !endpoint.sha256) {
        throw new Error(`Declared transition job ${jobId} has incomplete ${role} endpoint identity.`);
      }
      const record = recordsByCardId.get(endpoint.cardId);
      const image = record?.artifacts?.image || {};
      const catalogUri = text(image.uri);
      const catalogSha256 = normalizedSha256(image.sha256);
      if (!record || catalogUri !== endpoint.uri || catalogSha256 !== endpoint.sha256) {
        throw new Error(`Declared transition job ${jobId} ${role} endpoint does not match the independent Reference animation catalog.`);
      }
      const filePath = resolveEndpointImagePath(endpoint.uri, mediaRoot);
      const actualSha256 = sha256Bytes(await readFile(filePath));
      if (actualSha256 !== endpoint.sha256) {
        throw new Error(`Declared transition job ${jobId} ${role} endpoint file SHA-256 does not match its declaration.`);
      }
      endpointRecords += 1;
      uniqueCards.add(endpoint.cardId);
      uniqueFiles.add(filePath);
    }
  }
  if (!endpointRecords) throw new Error("The chain graph contains no transition endpoint records to verify.");
  return {
    schemaVersion: "hapa.echo.transition-endpoint-file-validation.v1",
    verified: true,
    endpointRecords,
    uniqueCards: uniqueCards.size,
    uniqueFiles: uniqueFiles.size,
    catalogSchemaVersion: referenceAnimationCatalog.schemaVersion,
    digestAlgorithm: "sha256",
    declaredEndpointContractDigest: echoDeclaredTransitionEndpointContractDigest(chainGraph),
    referenceCatalogContractDigest: echoReferenceAnimationCatalogContractDigest(referenceAnimationCatalog),
  };
}

function visualValidationDecision(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === "certified") return "certified";
  if (["quarantine", "quarantined"].includes(normalized)) return "quarantine";
  return "";
}

function visualValidationResultDigest(report = {}) {
  const core = structuredClone(report);
  delete core.resultDigestSha256;
  delete core.result_digest_sha256;
  return sha256Bytes(stableEchoEnrichmentStringify(core));
}

function mediaIdSha256(mediaId) {
  const match = /^hapa-media:sha256:([a-f0-9]{64})$/iu.exec(text(mediaId));
  return match ? match[1].toLowerCase() : "";
}

export function validateTransitionEndpointVisualValidation({
  validationReport = {},
  chainGraph = {},
  rawEnrichments = [],
  chainGraphSha256 = "",
  enrichmentsSha256 = "",
  referenceAnimationCatalogSha256 = "",
} = {}) {
  if (validationReport.schemaVersion !== TRANSITION_ENDPOINT_VISUAL_VALIDATION_SCHEMA) {
    throw new Error(`Transition visual validation must use ${TRANSITION_ENDPOINT_VISUAL_VALIDATION_SCHEMA}.`);
  }
  if (validationReport.algorithm?.id !== TRANSITION_ENDPOINT_VISUAL_VALIDATION_ALGORITHM
    || validationReport.algorithm?.sourceSampleContract?.id !== TRANSITION_ENDPOINT_VISUAL_SAMPLE_CONTRACT
    || validationReport.algorithm?.canonicalization !== "recursive-lexicographic-json-keys-v1") {
    throw new Error(`Transition visual validation must use the supported ${TRANSITION_ENDPOINT_VISUAL_VALIDATION_ALGORITHM} sample contract.`);
  }
  const thresholds = validationReport.algorithm?.thresholds || {};
  if (Number(thresholds.ssimMin) !== TRANSITION_ENDPOINT_VISUAL_THRESHOLDS.ssimMin
    || Number(thresholds.pHashDistanceMax) !== TRANSITION_ENDPOINT_VISUAL_THRESHOLDS.pHashDistanceMax
    || Number(thresholds.edgeCorrelationMin) !== TRANSITION_ENDPOINT_VISUAL_THRESHOLDS.edgeCorrelationMin) {
    throw new Error("Transition visual validation uses an unsupported endpoint certification threshold set.");
  }
  const declaredResultDigest = normalizedSha256(
    validationReport.resultDigestSha256 || validationReport.result_digest_sha256,
  );
  const computedResultDigest = visualValidationResultDigest(validationReport);
  if (!declaredResultDigest || declaredResultDigest !== computedResultDigest) {
    throw new Error("Transition visual validation result digest does not match its canonical payload.");
  }
  const expectedInputs = [
    ["chain graph", validationReport.inputs?.chainGraph?.sha256, chainGraphSha256],
    ["enrichments", validationReport.inputs?.enrichments?.sha256, enrichmentsSha256],
    ["Reference catalog", validationReport.inputs?.referenceCatalog?.sha256, referenceAnimationCatalogSha256],
  ];
  for (const [label, declared, actual] of expectedInputs) {
    if (!normalizedSha256(actual) || normalizedSha256(declared) !== normalizedSha256(actual)) {
      throw new Error(`Transition visual validation ${label} digest is stale or missing.`);
    }
  }
  const declarationsByJobId = new Map();
  for (const declaration of list(chainGraph.declaredTransitions || chainGraph.declared_transitions)) {
    const jobId = text(declaration.transitionLink?.id || declaration.transition_link?.id);
    const mediaId = text(declaration.transitionMediaId || declaration.transition_media_id);
    if (!jobId || !mediaId || declarationsByJobId.has(jobId)) {
      throw new Error("Transition visual validation requires unique declared job/media identities.");
    }
    declarationsByJobId.set(jobId, {
      mediaId,
      endpoints: {
        first: transitionEndpointContract(
          declaration.sourceFrame || declaration.source_frame || declaration.first,
        ),
        last: transitionEndpointContract(
          declaration.targetFrame || declaration.target_frame || declaration.last,
        ),
      },
    });
  }
  const enrichmentMediaByJobId = new Map();
  for (const row of list(rawEnrichments)) {
    const jobId = transitionJobId(row);
    if (!jobId) continue;
    if (enrichmentMediaByJobId.has(jobId)) {
      throw new Error(`Transition visual validation job ${jobId} resolves to multiple enrichment rows.`);
    }
    enrichmentMediaByJobId.set(jobId, {
      mediaId: text(row.mediaId || row.media_id || row.id),
      runtimeUri: text(
        row.mediaContract?.runtimeUri
        || row.media_contract?.runtime_uri
        || row.runtimeUri
        || row.runtime_uri,
      ),
      contentSha256: normalizedSha256(
        row.contentHash?.value
        || row.content_hash?.value
        || row.contentSha256
        || row.content_sha256,
      ),
    });
  }
  const jobs = [];
  const seenJobs = new Set();
  for (const rawJob of list(validationReport.jobs || validationReport.results)) {
    const jobId = text(rawJob.jobId || rawJob.job_id);
    const mediaId = text(rawJob.mediaId || rawJob.transitionMediaId || rawJob.media_id);
    const declaration = declarationsByJobId.get(jobId);
    const enrichment = enrichmentMediaByJobId.get(jobId);
    if (!jobId || seenJobs.has(jobId) || declaration?.mediaId !== mediaId
      || enrichment?.mediaId !== mediaId) {
      throw new Error(`Transition visual validation has a stale, duplicate, or mismatched job ${jobId || "<missing>"}.`);
    }
    seenJobs.add(jobId);
    const runtimeUri = text(rawJob.runtimeUri || rawJob.runtime_uri);
    const actualVideoSha256 = normalizedSha256(
      rawJob.video?.actualSha256 || rawJob.video?.actual_sha256,
    );
    const expectedVideoSha256 = mediaIdSha256(mediaId);
    if (!runtimeUri || runtimeUri !== enrichment.runtimeUri
      || !expectedVideoSha256 || actualVideoSha256 !== expectedVideoSha256
      || (enrichment.contentSha256 && enrichment.contentSha256 !== expectedVideoSha256)) {
      throw new Error(`Transition visual validation job ${jobId} is not bound to the current runtime URI and video SHA-256.`);
    }
    const frameCount = Number(rawJob.video?.frameCount || rawJob.frameCount);
    const durationSeconds = Number(rawJob.video?.durationSeconds || rawJob.durationSeconds);
    const fps = Number(rawJob.video?.fps || rawJob.fps);
    if (!Number.isInteger(frameCount) || frameCount < 2
      || !Number.isFinite(durationSeconds) || durationSeconds <= 0
      || !Number.isFinite(fps) || fps <= 0) {
      throw new Error(`Transition visual validation job ${jobId} has an invalid decoded-video contract.`);
    }
    const endpoints = {};
    for (const role of ["first", "last"]) {
      const endpoint = rawJob.endpoints?.[role] || {};
      const metrics = endpoint.metrics || {};
      const decision = visualValidationDecision(endpoint.decision);
      const expectedDecision = Number(metrics.ssim) >= TRANSITION_ENDPOINT_VISUAL_THRESHOLDS.ssimMin
        && Number(metrics.pHashDistance) <= TRANSITION_ENDPOINT_VISUAL_THRESHOLDS.pHashDistanceMax
        && Number(metrics.edgeCorrelation) >= TRANSITION_ENDPOINT_VISUAL_THRESHOLDS.edgeCorrelationMin
        ? "certified"
        : "quarantine";
      if (!decision || decision !== expectedDecision) {
        throw new Error(`Transition visual validation job ${jobId} ${role} decision contradicts its metrics.`);
      }
      const frameIndex = Number(endpoint.decodedFrame?.frameIndex ?? endpoint.frameIndex);
      const sourceTimeSeconds = Number(
        endpoint.sourceTiming?.authoredSourceSeconds
        ?? endpoint.sourceTimeSeconds,
      );
      const presentationPtsSeconds = Number(
        endpoint.sourceTiming?.presentationPtsSeconds
        ?? endpoint.sourceTimeSeconds,
      );
      const sourceContractId = text(
        endpoint.sourceTiming?.contractId
        || validationReport.algorithm?.sourceSampleContract?.id,
      );
      if (!Number.isInteger(frameIndex) || frameIndex < 0 || !Number.isFinite(sourceTimeSeconds) || sourceTimeSeconds < 0) {
        throw new Error(`Transition visual validation job ${jobId} ${role} has no exact decoded sample identity.`);
      }
      const expectedFrameIndex = role === "first" ? 0 : frameCount - 1;
      const nominalAtSeconds = Number(endpoint.decodedFrame?.nominalAtSeconds ?? sourceTimeSeconds);
      const expectedNominalAtSeconds = expectedFrameIndex / fps;
      if (frameIndex !== expectedFrameIndex
        || sourceContractId !== TRANSITION_ENDPOINT_VISUAL_SAMPLE_CONTRACT
        || !Number.isFinite(presentationPtsSeconds)
        || Math.abs(sourceTimeSeconds - presentationPtsSeconds) > 0.000001
        || !Number.isFinite(nominalAtSeconds)
        || Math.abs(nominalAtSeconds - expectedNominalAtSeconds) > 0.000001
        || sourceTimeSeconds >= durationSeconds) {
        throw new Error(`Transition visual validation job ${jobId} ${role} is not the physical terminal frame sample.`);
      }
      const declaredReferenceCardId = text(
        endpoint.declaredReference?.cardId || endpoint.declaredReferenceCardId,
      );
      const declaredReferenceSha256 = normalizedSha256(
        endpoint.declaredReference?.declaredSha256 || endpoint.declaredReferenceSha256,
      );
      const declaredEndpoint = declaration.endpoints[role];
      if (!declaredReferenceCardId || !declaredReferenceSha256
        || declaredReferenceCardId !== declaredEndpoint.cardId
        || declaredReferenceSha256 !== declaredEndpoint.sha256) {
        throw new Error(`Transition visual validation job ${jobId} ${role} does not certify its declared chain-graph endpoint.`);
      }
      endpoints[role] = {
        decision: decision === "quarantine" ? "quarantined" : decision,
        frameIndex,
        sourceTimeSeconds,
        declaredReferenceCardId,
        declaredReferenceSha256,
        metrics: {
          ssim: Number(metrics.ssim),
          pHashDistance: Number(metrics.pHashDistance),
          edgeCorrelation: Number(metrics.edgeCorrelation),
        },
      };
    }
    const decision = visualValidationDecision(rawJob.decision || (rawJob.certified === true ? "certified" : ""));
    const expectedJobDecision = endpoints.first.decision === "certified" && endpoints.last.decision === "certified"
      ? "certified"
      : "quarantine";
    if (decision !== expectedJobDecision) {
      throw new Error(`Transition visual validation job ${jobId} decision contradicts its endpoint decisions.`);
    }
    jobs.push({
      jobId,
      mediaId,
      decision: decision === "quarantine" ? "quarantined" : decision,
      runtimeUri,
      video: {
        actualSha256: actualVideoSha256,
        frameCount,
        durationSeconds,
        fps,
      },
      endpoints,
    });
  }
  if (jobs.length !== declarationsByJobId.size
    || jobs.length !== enrichmentMediaByJobId.size
    || seenJobs.size !== declarationsByJobId.size) {
    throw new Error(`Transition visual validation covers ${jobs.length} jobs; expected ${declarationsByJobId.size}.`);
  }
  jobs.sort((left, right) => left.jobId.localeCompare(right.jobId));
  const certifiedJobIds = jobs.filter((job) => job.decision === "certified").map((job) => job.jobId);
  const quarantinedJobIds = jobs.filter((job) => job.decision === "quarantined").map((job) => job.jobId);
  if (Number(validationReport.aggregate?.certifiedJobs) !== certifiedJobIds.length
    || Number(validationReport.aggregate?.quarantinedJobs) !== quarantinedJobIds.length) {
    throw new Error("Transition visual validation aggregate job counts contradict its job ledger.");
  }
  return {
    schemaVersion: TRANSITION_ENDPOINT_VISUAL_VALIDATION_RECEIPT_SCHEMA,
    verified: true,
    sourceSchemaVersion: validationReport.schemaVersion,
    reportSchemaVersion: validationReport.schemaVersion,
    resultDigestSha256: declaredResultDigest,
    thresholds: structuredClone(TRANSITION_ENDPOINT_VISUAL_THRESHOLDS),
    totalJobs: jobs.length,
    declaredJobs: jobs.length,
    certifiedJobs: certifiedJobIds.length,
    quarantinedJobs: quarantinedJobIds.length,
    eligibleJobIds: certifiedJobIds,
    certifiedJobIds,
    quarantinedJobIds,
    inputDigests: {
      chainGraphSha256: normalizedSha256(chainGraphSha256),
      enrichmentsSha256: normalizedSha256(enrichmentsSha256),
      referenceAnimationCatalogSha256: normalizedSha256(referenceAnimationCatalogSha256),
    },
    chainGraphSha256: normalizedSha256(chainGraphSha256),
    enrichmentsSha256: normalizedSha256(enrichmentsSha256),
    referenceAnimationCatalogSha256: normalizedSha256(referenceAnimationCatalogSha256),
    jobs,
  };
}

export async function validateTransitionVisualMediaFiles({
  validationReceipt = {},
  mediaRoot = path.join(ROOT, "data/media"),
} = {}) {
  if (validationReceipt.schemaVersion !== TRANSITION_ENDPOINT_VISUAL_VALIDATION_RECEIPT_SCHEMA
    || validationReceipt.verified !== true) {
    throw new Error("A verified transition endpoint visual-validation receipt is required before checking media bytes.");
  }
  const files = [];
  for (const job of list(validationReceipt.jobs)) {
    const filePath = resolveEndpointImagePath(job.runtimeUri, mediaRoot);
    const bytes = await readFile(filePath);
    const actualSha256 = sha256Bytes(bytes);
    if (actualSha256 !== job.video?.actualSha256 || actualSha256 !== mediaIdSha256(job.mediaId)) {
      throw new Error(`Transition visual validation job ${job.jobId} runtime media bytes no longer match the certified SHA-256.`);
    }
    files.push({
      jobId: job.jobId,
      mediaId: job.mediaId,
      runtimeUri: job.runtimeUri,
      sha256: actualSha256,
      bytes: bytes.byteLength,
    });
  }
  return {
    schemaVersion: "hapa.echo.transition-visual-media-file-validation.v1",
    verified: true,
    files: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    ledgerDigestSha256: sha256Bytes(stableEchoEnrichmentStringify(files)),
  };
}

export function applyTransitionEndpointVisualValidation(enrichments = [], validationReceipt = {}) {
  if (validationReceipt.schemaVersion !== TRANSITION_ENDPOINT_VISUAL_VALIDATION_RECEIPT_SCHEMA
    || validationReceipt.verified !== true) {
    throw new Error("A verified transition endpoint visual-validation receipt is required.");
  }
  const jobsById = new Map(list(validationReceipt.jobs).map((job) => [job.jobId, job]));
  let certifiedRows = 0;
  let quarantinedRows = 0;
  const rows = list(enrichments).map((row) => {
    const jobId = transitionJobId(row);
    if (!jobId) return row;
    const job = jobsById.get(jobId);
    if (!job) throw new Error(`Transition enrichment job ${jobId} has no visual-validation result.`);
    const next = structuredClone(row);
    const flowKey = Object.keys(next.flow || {}).length ? "flow" : "continuity";
    next[flowKey] = next[flowKey] || {};
    next[flowKey].transition = {
      ...(next[flowKey].transition || {}),
      eligible: job.decision === "certified",
      visuallyValidated: job.decision === "certified",
      visualValidationDecision: job.decision,
      truthBoundary: job.decision === "certified"
        ? "decoded-first-and-last-frames-certified-against-declared-reference-stills"
        : "decoded-last-frame-diverges-from-declared-reference-still; quarantined-as-transition",
      visualValidation: {
        schemaVersion: validationReceipt.sourceSchemaVersion,
        resultDigestSha256: validationReceipt.resultDigestSha256,
        jobId,
        decision: job.decision,
        endpoints: structuredClone(job.endpoints),
      },
    };
    if (job.decision === "certified") {
      certifiedRows += 1;
      const existingContract = next.mediaContract || next.media_contract || {};
      next.mediaContract = {
        ...existingContract,
        sourceInSeconds: job.endpoints.first.sourceTimeSeconds,
        sourceOutSeconds: job.endpoints.last.sourceTimeSeconds,
        actualDurationSeconds: job.video.durationSeconds,
        frameCount: job.video.frameCount,
        fps: job.video.fps,
        playbackMode: "once",
      };
      delete next.media_contract;
    } else {
      quarantinedRows += 1;
      next.playable = false;
      next[flowKey].transition.classification = "endpoint-mismatch-quarantined";
    }
    return next;
  });
  if (certifiedRows !== validationReceipt.certifiedJobs
    || quarantinedRows !== validationReceipt.quarantinedJobs) {
    throw new Error(`Transition visual-validation overlay matched ${certifiedRows} certified and ${quarantinedRows} quarantined rows; expected ${validationReceipt.certifiedJobs}/${validationReceipt.quarantinedJobs}.`);
  }
  return {
    rows,
    certifiedRows,
    quarantinedRows,
    eligibleJobIds: [...validationReceipt.certifiedJobIds],
    quarantinedJobIds: [...validationReceipt.quarantinedJobIds],
  };
}

export function applyExplicitTransitionSongAssignments(enrichments = [], assignmentReport = {}, {
  eligibleJobIds = null,
} = {}) {
  const eligibleJobs = eligibleJobIds === null
    ? null
    : new Set(list(eligibleJobIds).map(String));
  const declaredAssignmentJobs = new Set();
  const declaredSongsByJobId = new Map();
  const songsByJobId = new Map();
  const jobsBySongId = new Map();
  for (const assignment of list(assignmentReport.assignment?.songs)) {
    const songId = text(assignment.songId || assignment.song_id);
    if (!songId) continue;
    for (const jobId of list(assignment.jobIds || assignment.job_ids).map(String)) {
      declaredAssignmentJobs.add(jobId);
      const declaredSongIds = declaredSongsByJobId.get(jobId) || new Set();
      declaredSongIds.add(songId);
      declaredSongsByJobId.set(jobId, declaredSongIds);
      if (eligibleJobs && !eligibleJobs.has(jobId)) continue;
      const songIds = songsByJobId.get(jobId) || new Set();
      songIds.add(songId);
      songsByJobId.set(jobId, songIds);
      const jobIds = jobsBySongId.get(songId) || new Set();
      jobIds.add(jobId);
      jobsBySongId.set(songId, jobIds);
    }
  }
  let assignedRows = 0;
  let quarantinedRows = 0;
  const rows = list(enrichments).map((row) => {
    const jobId = transitionJobId(row);
    const assignedSongIds = [...(songsByJobId.get(jobId) || [])].sort();
    if (!jobId) return row;
    if (!assignedSongIds.length) {
      if (!declaredAssignmentJobs.has(jobId)) return row;
      quarantinedRows += 1;
      const quarantinedSongIds = [...(declaredSongsByJobId.get(jobId) || [])].sort();
      return {
        ...row,
        // Empty song scope means globally eligible to the candidate pool.
        // Preserve the declared scope even though this media is quarantined.
        songIds: quarantinedSongIds,
        transitionAssignment: {
          schemaVersion: "hapa.echo.transition-song-assignment.v1",
          jobId,
          songIds: quarantinedSongIds,
          status: "visual-endpoint-quarantined",
          source: "vibes-transition-director-script-report+endpoint-visual-validation",
        },
      };
    }
    assignedRows += 1;
    return {
      ...row,
      // The validated assignment report is authoritative for authored
      // transitions. Raw enrichment song hints cannot widen its scope.
      songIds: assignedSongIds,
      transitionAssignment: {
        schemaVersion: "hapa.echo.transition-song-assignment.v1",
        jobId,
        songIds: assignedSongIds,
        source: "vibes-transition-director-script-report",
      },
    };
  });
  return {
    rows,
    assignedRows,
    quarantinedRows,
    assignmentJobs: songsByJobId.size,
    assignedSongs: new Set([...songsByJobId.values()].flatMap((songIds) => [...songIds])).size,
    jobsBySongId,
  };
}

export function validateExplicitTransitionSongAssignments({
  enrichments = [],
  chainGraph = {},
  assignmentReport = {},
  projectSongIds = [],
} = {}) {
  if (assignmentReport.schemaVersion !== TRANSITION_ASSIGNMENT_REPORT_SCHEMA) {
    throw new Error(`Transition assignment report must use ${TRANSITION_ASSIGNMENT_REPORT_SCHEMA}.`);
  }
  const canonicalSongs = new Set(list(projectSongIds).map(String));
  if (!canonicalSongs.size) throw new Error("Transition assignment validation requires canonical project song IDs.");
  const declaredJobs = new Map();
  const declaredMediaOwners = new Map();
  for (const declaration of list(chainGraph.declaredTransitions || chainGraph.declared_transitions)) {
    const jobId = text(declaration.transitionLink?.id || declaration.transition_link?.id);
    if (!jobId) throw new Error("A declared transition is missing its transition-link job ID.");
    const mediaId = text(declaration.transitionMediaId || declaration.transition_media_id);
    if (!mediaId) throw new Error(`Declared transition job ${jobId} is missing its transition media ID.`);
    const linkedMediaId = text(declaration.transitionLink?.mediaId || declaration.transition_link?.media_id);
    if (linkedMediaId && linkedMediaId !== mediaId) {
      throw new Error(`Declared transition job ${jobId} link media ${linkedMediaId} does not match ${mediaId}.`);
    }
    const sourceEndpoint = transitionEndpointContract(
      declaration.sourceFrame || declaration.source_frame || declaration.first,
    );
    const targetEndpoint = transitionEndpointContract(
      declaration.targetFrame || declaration.target_frame || declaration.last,
    );
    if (!sourceEndpoint.cardId || !targetEndpoint.cardId) {
      throw new Error(`Declared transition job ${jobId} is missing an exact source or target endpoint.`);
    }
    const current = declaredJobs.get(jobId) || {
      count: 0,
      mediaId,
      sourceEndpoint,
      targetEndpoint,
    };
    if (current.mediaId !== mediaId) {
      throw new Error(`Declared transition job ${jobId} maps to conflicting media IDs.`);
    }
    if (stableEchoEnrichmentStringify(current.sourceEndpoint) !== stableEchoEnrichmentStringify(sourceEndpoint)
      || stableEchoEnrichmentStringify(current.targetEndpoint) !== stableEchoEnrichmentStringify(targetEndpoint)) {
      throw new Error(`Declared transition job ${jobId} maps to conflicting endpoint identities.`);
    }
    declaredJobs.set(jobId, {
      count: current.count + 1,
      mediaId,
      sourceEndpoint,
      targetEndpoint,
    });
    const priorOwner = declaredMediaOwners.get(mediaId);
    if (priorOwner && priorOwner !== jobId) {
      throw new Error(`Declared transition media ${mediaId} is shared by jobs ${priorOwner} and ${jobId}.`);
    }
    declaredMediaOwners.set(mediaId, jobId);
  }
  if (!declaredJobs.size) throw new Error("The chain graph contains no declared transition jobs.");
  for (const [jobId, declaration] of declaredJobs) {
    if (declaration.count !== 1) throw new Error(`Declared transition job ${jobId} occurs ${declaration.count} times; expected exactly one declaration.`);
  }

  const songsByJobId = new Map();
  const seenPairs = new Set();
  for (const assignment of list(assignmentReport.assignment?.songs)) {
    const songId = text(assignment.songId || assignment.song_id);
    if (!songId || !canonicalSongs.has(songId)) {
      throw new Error(`Transition assignment references unknown canonical song ${songId || "<missing>"}.`);
    }
    const jobIds = list(assignment.jobIds || assignment.job_ids).map(String).filter(Boolean);
    if (!jobIds.length) throw new Error(`Transition assignment for ${songId} has no transition jobs.`);
    for (const jobId of jobIds) {
      if (!declaredJobs.has(jobId)) throw new Error(`Transition assignment references undeclared job ${jobId}.`);
      const pair = `${songId}\u0000${jobId}`;
      if (seenPairs.has(pair)) throw new Error(`Transition assignment duplicates ${songId} → ${jobId}.`);
      seenPairs.add(pair);
      const songs = songsByJobId.get(jobId) || new Set();
      songs.add(songId);
      songsByJobId.set(jobId, songs);
    }
  }
  for (const jobId of declaredJobs.keys()) {
    if (!songsByJobId.get(jobId)?.size) throw new Error(`Declared transition job ${jobId} has no canonical song assignment.`);
  }

  const enrichmentRowsByJobId = new Map();
  for (const [index, row] of list(enrichments).entries()) {
    const jobId = transitionJobId(row);
    if (jobId && declaredJobs.has(jobId)) {
      const matches = enrichmentRowsByJobId.get(jobId) || [];
      matches.push(normalizeEchoVideoEnrichmentRow(row, index));
      enrichmentRowsByJobId.set(jobId, matches);
    }
  }
  for (const [jobId, declaration] of declaredJobs) {
    const matches = enrichmentRowsByJobId.get(jobId) || [];
    if (matches.length !== 1) throw new Error(`Declared transition job ${jobId} resolves to ${matches.length} enrichment rows; expected exactly one.`);
    const [row] = matches;
    if (row.mediaId !== declaration.mediaId) {
      throw new Error(`Declared transition job ${jobId} resolves to media ${row.mediaId || "<missing>"}; expected ${declaration.mediaId}.`);
    }
    if (!row.playable || !row.uri) {
      throw new Error(`Declared transition job ${jobId} resolves to unplayable media ${declaration.mediaId}.`);
    }
    if (row.motionRole?.kind !== "transition" || row.motionRole?.transition?.eligible !== true) {
      throw new Error(`Declared transition job ${jobId} does not resolve to an eligible transition row.`);
    }
    if (row.motionRole?.transition?.jobId !== jobId) {
      throw new Error(`Declared transition media ${declaration.mediaId} carries job ${row.motionRole?.transition?.jobId || "<missing>"}; expected ${jobId}.`);
    }
    const rowSourceEndpoint = transitionEndpointContract(row.motionRole?.transition?.endpoints?.first);
    const rowTargetEndpoint = transitionEndpointContract(row.motionRole?.transition?.endpoints?.last);
    if (stableEchoEnrichmentStringify(rowSourceEndpoint) !== stableEchoEnrichmentStringify(declaration.sourceEndpoint)
      || stableEchoEnrichmentStringify(rowTargetEndpoint) !== stableEchoEnrichmentStringify(declaration.targetEndpoint)) {
      throw new Error(`Declared transition job ${jobId} enrichment endpoints do not match the chain-graph declaration.`);
    }
  }
  const catalog = buildEchoVideoEnrichmentCatalog({ enrichments, chainGraph, report: {} });
  for (const [jobId, declaration] of declaredJobs) {
    const row = catalog.find({ mediaId: declaration.mediaId });
    const resolution = row ? catalog.transitionResolution(row) : null;
    if (!row || row.playable !== true
      || !list(resolution?.entryMediaIds).length
      || !list(resolution?.exitMediaIds).length) {
      throw new Error(`Declared transition job ${jobId} does not resolve to playable entry and exit anchors.`);
    }
  }
  const declaredUnassigned = list(assignmentReport.assignment?.unassignedJobIds).map(String).filter(Boolean);
  if (declaredUnassigned.length) {
    throw new Error(`Transition assignment report still declares unassigned jobs: ${declaredUnassigned.join(", ")}.`);
  }
  return {
    schemaVersion: "hapa.echo.transition-assignment-validation.v1",
    verified: true,
    declaredJobs: declaredJobs.size,
    assignedJobs: songsByJobId.size,
    assignedSongs: new Set([...songsByJobId.values()].flatMap((songs) => [...songs])).size,
    assignmentPairs: seenPairs.size,
    matchedEnrichmentRows: enrichmentRowsByJobId.size,
  };
}

async function readSongVariants(variantsDirectory, songId) {
  const directory = resolveEchoEnrichmentVariantPath(
    variantsDirectory,
    validateEchoEnrichmentSongId(songId),
  );
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const variants = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(directory, entry.name);
    const bytes = await readFile(filePath);
    try {
      variants.push({ filePath, bytes, variant: JSON.parse(bytes.toString("utf8")) });
    } catch (error) {
      throw new Error(`Cannot parse Direction Variant ${filePath}: ${error.message}`, { cause: error });
    }
  }
  return variants;
}

function normalizedSha256(value) {
  const digest = text(value).replace(/^sha256:/iu, "").toLowerCase();
  return /^[a-f0-9]{64}$/u.test(digest) ? digest : "";
}

export function newestVariantTimestamp(rows = [], {
  replayCompiler = "",
  replayBatchFingerprint = "",
  replayAssignedJobIds = [],
  replayCompilerInputFingerprint = "",
} = {}) {
  const replayFingerprint = normalizedSha256(replayBatchFingerprint);
  const replayJobs = [...new Set(list(replayAssignedJobIds).map(String).filter(Boolean))].sort();
  let latest = Number.NEGATIVE_INFINITY;
  for (const row of list(rows)) {
    const value = row.variant || row;
    const rowFingerprint = normalizedSha256(
      value.variationSet?.batchFingerprint || value.variation_set?.batch_fingerprint,
    );
    const rowJobs = [...new Set(list(value.telemetry?.selectedUniqueTransitionJobs)
      .map(String).filter(Boolean))].sort();
    const exactAssignment = stableEchoEnrichmentStringify(rowJobs)
      === stableEchoEnrichmentStringify(replayJobs);
    const rowCompilerInputFingerprint = normalizedSha256(
      value.lineage?.compilerInputFingerprint || value.lineage?.compiler_input_fingerprint,
    );
    const requestedCompilerInputFingerprint = normalizedSha256(replayCompilerInputFingerprint);
    const exactReplayFamily = requestedCompilerInputFingerprint
      ? value.lineage?.compiler === replayCompiler
        && rowCompilerInputFingerprint === requestedCompilerInputFingerprint
      : replayCompiler
      && replayFingerprint
      && value.lineage?.compiler === replayCompiler
      && rowFingerprint === replayFingerprint
      && exactAssignment;
    if (exactReplayFamily) continue;
    const parsed = Date.parse(text(value.updatedAt || value.updated_at || value.createdAt || value.created_at));
    if (Number.isFinite(parsed)) latest = Math.max(latest, parsed);
  }
  return Number.isFinite(latest) ? new Date(latest).toISOString() : "";
}

async function snapshotExistingVariants(variantsDirectory) {
  const snapshots = new Map();
  let songDirectories;
  try {
    songDirectories = await readdir(variantsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return snapshots;
    throw error;
  }
  for (const songDirectory of songDirectories) {
    if (!songDirectory.isDirectory()) continue;
    const directory = resolveEchoEnrichmentVariantPath(
      variantsDirectory,
      validateEchoEnrichmentSongId(songDirectory.name),
    );
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(directory, entry.name);
      snapshots.set(filePath, sha256Bytes(await readFile(filePath)));
    }
  }
  return snapshots;
}

async function changedSnapshots(snapshots) {
  const changed = [];
  for (const [filePath, before] of snapshots) {
    const current = await readFile(filePath).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (!current || sha256Bytes(current) !== before) changed.push(filePath);
  }
  return changed;
}

function indexPayloadRows(payload = {}) {
  return list(payload.variants || payload.rows);
}

function indexStablePayload(payload = {}) {
  return {
    schemaVersion: payload.schemaVersion,
    variants: indexPayloadRows(payload),
    enrichmentDirectorBatch: payload.enrichmentDirectorBatch || null,
  };
}

async function backupIndex(indexPath, backupsDirectory, batchFingerprint) {
  if (!await exists(indexPath)) return "";
  const bytes = await readFile(indexPath);
  const digest = sha256Bytes(bytes);
  const directory = path.join(backupsDirectory, `echo-enrichment-director-${batchFingerprint.slice(0, 16)}`);
  const target = path.join(directory, `direction-variant-index-before-${digest.slice(0, 16)}.json`);
  if (await exists(target)) return target;
  try {
    await exclusiveWrite(target, bytes);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  return target;
}

async function appendVariantReplaySafe(filePath, variant) {
  try {
    await exclusiveWrite(filePath, variant);
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readJson(filePath);
    if (text(existing.contentSha256) === variant.contentSha256) return "replayed-identical";
    throw new Error(`Append-only conflict at ${filePath}: the content-derived ID exists with different content.`);
  }
}

function assertIndexParity(index, diskRows) {
  const diskIds = diskRows.map((row) => row.id).sort();
  const indexIds = indexPayloadRows(index).map((row) => row.id).sort();
  if (new Set(indexIds).size !== indexIds.length) throw new Error("Direction Variant index contains duplicate IDs.");
  if (stableEchoEnrichmentStringify(diskIds) !== stableEchoEnrichmentStringify(indexIds)) {
    throw new Error(`Direction Variant index parity failed: disk=${diskIds.length}, index=${indexIds.length}.`);
  }
  return { diskRows: diskIds.length, indexRows: indexIds.length, exactIdParity: true };
}

export async function runEnrichmentDirectorVariantPass(options = parseEnrichmentDirectorArguments()) {
  const [
    rawEnrichments,
    chainGraph,
    enrichmentReport,
    transitionAssignments,
    referenceAnimationCatalog,
    transitionVisualValidationReport,
    songsPayload,
    projects,
  ] = await Promise.all([
    readEnrichmentNdjson(options.enrichmentsPath),
    readJson(options.chainGraphPath),
    readJson(options.enrichmentReportPath),
    options.transitionAssignmentsPath
      ? readJson(options.transitionAssignmentsPath)
      : Promise.resolve(null),
    options.referenceAnimationCatalogPath
      ? readJson(options.referenceAnimationCatalogPath)
      : Promise.resolve(null),
    options.transitionVisualValidationPath
      ? readJson(options.transitionVisualValidationPath)
      : Promise.resolve(null),
    readJson(options.songsPath),
    discoverProjects(options.projectsDirectory, options.songId),
  ]);
  const declaredTransitionCount = list(
    chainGraph.declaredTransitions || chainGraph.declared_transitions,
  ).length;
  if (declaredTransitionCount > 0 && !transitionAssignments) {
    throw new Error("Declared transition jobs require an explicit transition-assignment report.");
  }
  if (declaredTransitionCount > 0 && !referenceAnimationCatalog) {
    throw new Error("Declared transition jobs require the independent Reference animation catalog.");
  }
  if (declaredTransitionCount > 0 && !transitionVisualValidationReport) {
    throw new Error("Declared transition jobs require a decoded endpoint visual-validation report.");
  }
  const transitionEndpointFileValidation = declaredTransitionCount > 0
    ? await validateDeclaredTransitionEndpointFiles({
      chainGraph,
      referenceAnimationCatalog,
      mediaRoot: options.mediaRoot,
    })
    : null;
  if (projects.length !== options.expectedSongCount) {
    throw new Error(`Expected exactly ${options.expectedSongCount} Echo projects; found ${projects.length}.`);
  }
  const uniqueProjectIds = new Set(projects.map((row) => row.songId));
  if (uniqueProjectIds.size !== projects.length) throw new Error("Echo project directory contains duplicate song IDs.");
  const canonicalAssignmentProjects = options.songId
    ? await discoverProjects(options.projectsDirectory)
    : projects;
  const canonicalAssignmentSongIds = new Set(canonicalAssignmentProjects.map((row) => row.songId));
  const transitionAssignmentValidation = declaredTransitionCount > 0
    ? validateExplicitTransitionSongAssignments({
      enrichments: rawEnrichments,
      chainGraph,
      assignmentReport: transitionAssignments,
      projectSongIds: [...canonicalAssignmentSongIds],
    })
    : null;
  const transitionVisualValidation = declaredTransitionCount > 0
    ? validateTransitionEndpointVisualValidation({
      validationReport: transitionVisualValidationReport,
      chainGraph,
      rawEnrichments,
      chainGraphSha256: sha256Bytes(await readFile(options.chainGraphPath)),
      enrichmentsSha256: sha256Bytes(await readFile(options.enrichmentsPath)),
      referenceAnimationCatalogSha256: sha256Bytes(
        await readFile(options.referenceAnimationCatalogPath),
      ),
    })
    : null;
  const transitionVisualMediaFiles = transitionVisualValidation
    ? await validateTransitionVisualMediaFiles({
      validationReceipt: transitionVisualValidation,
      mediaRoot: options.mediaRoot,
    })
    : null;
  const visualOverlay = transitionVisualValidation
    ? applyTransitionEndpointVisualValidation(rawEnrichments, transitionVisualValidation)
    : { rows: rawEnrichments, eligibleJobIds: [], quarantinedJobIds: [] };
  const assignmentOverlay = applyExplicitTransitionSongAssignments(
    visualOverlay.rows,
    transitionAssignments || {},
    { eligibleJobIds: transitionVisualValidation ? visualOverlay.eligibleJobIds : null },
  );
  const enrichments = assignmentOverlay.rows;
  if (transitionVisualValidation && assignmentOverlay.assignedRows !== transitionVisualValidation.certifiedJobs) {
    throw new Error(`Transition assignment overlay matched ${assignmentOverlay.assignedRows} certified rows; expected ${transitionVisualValidation.certifiedJobs}.`);
  }
  const transitionEndpointValidation = transitionEndpointFileValidation
    ? {
      ...transitionEndpointFileValidation,
      visualValidation: transitionVisualValidation,
      visualMediaFiles: transitionVisualMediaFiles,
    }
    : null;
  const sourceCatalog = buildEchoVideoEnrichmentCatalog({
    enrichments: rawEnrichments,
    chainGraph,
    report: enrichmentReport,
    transitionEndpointValidation: transitionEndpointFileValidation,
    referenceAnimationCatalog,
  });
  const catalogIntegrity = validateEchoEnrichmentCatalogIntegrity({ catalog: sourceCatalog, report: enrichmentReport });
  const catalog = transitionEndpointValidation
    ? buildEchoVideoEnrichmentCatalog({
      enrichments,
      chainGraph,
      report: enrichmentReport,
      transitionEndpointValidation,
      referenceAnimationCatalog,
    })
    : sourceCatalog;
  const songs = songLookup(songsPayload);
  const projectSnapshots = new Map(projects.map((project) => [project.filePath, sha256Bytes(project.bytes)]));
  const variantSnapshots = await snapshotExistingVariants(options.variantsDirectory);
  const existingIndex = await readJson(options.indexPath, {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [],
  });
  const diskRowsBefore = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
  mergeDirectionVariantIndexRows(indexPayloadRows(existingIndex), diskRowsBefore, []);
  const generated = [];
  // Seed the album prior with every immutable explicit assignment before adding inferred
  // placements. Early songs therefore cannot consume a job whose later explicit uses are
  // already known, and explicit placements are not double-counted as the album is compiled.
  const transitionUsageCounts = new Map();
  for (const jobIds of assignmentOverlay.jobsBySongId.values()) {
    for (const jobId of jobIds) {
      transitionUsageCounts.set(jobId, (transitionUsageCounts.get(jobId) || 0) + 1);
    }
  }
  for (const projectRow of projects) {
    const song = songs.get(projectRow.songId);
    if (!song) throw new Error(`Canonical Hapa song card missing for ${projectRow.songId}.`);
    const variantRows = await readSongVariants(options.variantsDirectory, projectRow.songId);
    const parentVariant = selectLatestEnrichmentParentVariant(variantRows.map((row) => row.variant));
    if (!parentVariant) throw new Error(`${projectRow.songId} has no ready non-legacy parent Director cut.`);
    const parentVariantFingerprint = text(
      parentVariant.fingerprint
      || parentVariant.contentSha256
      || parentVariant.content_sha256
      || echoDirectionVariantFingerprint(parentVariant),
    );
    const assignedTransitionJobIds = [...(assignmentOverlay.jobsBySongId.get(projectRow.songId) || [])];
    const transitionSelectionBalanceDigest = echoTransitionSelectionBalanceDigest(transitionUsageCounts);
    const compilerInputFingerprint = echoEnrichmentCompilerInputFingerprint({
      songId: projectRow.songId,
      parentProjectSha256: sha256Bytes(projectRow.bytes),
      parentVariantId: parentVariant.id,
      parentVariantFingerprint,
      enrichmentBatchFingerprint: catalog.batchFingerprint,
      songDecisionInputDigest: echoEnrichmentSha256(song),
      assignedTransitionJobIds,
      transitionSelectionBalanceDigest,
      transitionEndpointValidation,
    });
    const variant = compileEchoEnrichmentDirectorVariant({
      song,
      baseProject: projectRow.project,
      parentVariant,
      parentProjectSha256: sha256Bytes(projectRow.bytes),
      supersedesCreatedAt: newestVariantTimestamp(variantRows, {
        replayCompiler: ECHO_ENRICHMENT_DIRECTOR_COMPILER,
        replayBatchFingerprint: catalog.batchFingerprint,
        replayAssignedJobIds: assignedTransitionJobIds,
        replayCompilerInputFingerprint: compilerInputFingerprint,
      }),
      catalog,
      enrichments,
      chainGraph,
      report: enrichmentReport,
      transitionEndpointValidation,
      transitionUsageCounts,
    });
    for (const placement of list(variant.telemetry?.transitionPlan)) {
      if (placement.selection?.kind !== "semantic-supplement") continue;
      const jobId = text(placement.jobId);
      if (jobId) transitionUsageCounts.set(jobId, (transitionUsageCounts.get(jobId) || 0) + 1);
    }
    const variantPath = resolveEchoEnrichmentVariantPath(
      options.variantsDirectory,
      `${validateEchoEnrichmentSongId(projectRow.songId)}/${variant.id}.json`,
    );
    const prior = await readJson(variantPath, null);
    if (prior && text(prior.contentSha256) !== variant.contentSha256) {
      throw new Error(`Append-only conflict at ${variantPath}: the content-derived ID exists with different content.`);
    }
    generated.push({
      songId: projectRow.songId,
      projectPath: projectRow.filePath,
      parentVariantId: parentVariant.id,
      variantPath,
      variant,
      disposition: prior ? "existing-identical" : "pending-create",
    });
  }
  if (generated.length !== options.expectedSongCount) throw new Error("One-cut-per-song coverage invariant failed.");
  const variantIds = new Set(generated.map((row) => `${row.songId}:${row.variant.id}`));
  if (variantIds.size !== generated.length) throw new Error("Generated cut IDs are not unique per song.");
  const incomingRows = generated.map((row) => echoEnrichmentDirectorVariantIndexRow(row.songId, row.variant));
  const previewIndexRows = mergeDirectionVariantIndexRows(indexPayloadRows(existingIndex), diskRowsBefore, incomingRows);
  const effectiveTimestamp = generated.map((row) => row.variant.createdAt).sort().at(-1);
  const batchMetadata = {
    schemaVersion: "hapa.echo.enrichment-director-batch.v1",
    batchFingerprint: `sha256:${catalog.batchFingerprint}`,
    variationSetId: generated[0]?.variant.variationSet?.id || null,
    cutCount: generated.length,
    songCount: generated.length,
    generatedAt: effectiveTimestamp,
    appendOnly: true,
  };
  const motionTelemetry = {
    shots: generated.reduce((sum, row) => sum + row.variant.timeline.length, 0),
    assignedTransitions: generated.reduce((sum, row) => sum + row.variant.telemetry.assignedTransitions, 0),
    inferredTransitions: generated.reduce((sum, row) => sum + row.variant.telemetry.inferredTransitions, 0),
    plannedTransitions: generated.reduce((sum, row) => sum + row.variant.telemetry.plannedTransitions, 0),
    explicitTransitionPlacements: generated.reduce((sum, row) => sum + row.variant.telemetry.explicitTransitionPlacements, 0),
    inferredTransitionPlacements: generated.reduce((sum, row) => sum + row.variant.telemetry.inferredTransitionPlacements, 0),
    placedTransitions: generated.reduce((sum, row) => sum + row.variant.telemetry.placedTransitions, 0),
    rejectedTransitions: generated.reduce((sum, row) => sum + row.variant.telemetry.rejectedTransitions, 0),
    authoredTransitionShots: generated.reduce((sum, row) => sum + row.variant.telemetry.selectedTransitionShots, 0),
    uniqueAuthoredTransitionJobs: [...new Set(generated.flatMap(
      (row) => list(row.variant.telemetry.selectedUniqueTransitionJobs),
    ))].sort(),
    sceneMotionShots: generated.reduce((sum, row) => sum + row.variant.telemetry.selectedSceneMotionShots, 0),
    loopShots: generated.reduce((sum, row) => sum + row.variant.telemetry.selectedLoopShots, 0),
    subtleReferenceLoopShots: generated.reduce((sum, row) => sum + row.variant.telemetry.selectedSubtleReferenceLoops, 0),
    referenceStillHoldShots: generated.reduce((sum, row) => sum + row.variant.telemetry.referenceStillHoldShots, 0),
    referenceStillHoldSeconds: Number(generated.reduce((sum, row) => sum + row.variant.telemetry.referenceStillHoldSeconds, 0).toFixed(3)),
    transitionSeconds: Number(generated.reduce((sum, row) => sum + row.variant.telemetry.transitionSeconds, 0).toFixed(3)),
  };
  const transitionJobReuse = new Map();
  const inferredTransitionJobReuse = new Map();
  const explicitTransitionJobReuse = new Map();
  const transitionPlacementsBySong = {};
  for (const row of generated) {
    transitionPlacementsBySong[row.songId] = list(row.variant.telemetry?.transitionPlan).length;
    for (const placement of list(row.variant.telemetry?.transitionPlan)) {
      const jobId = text(placement.jobId);
      if (!jobId) continue;
      transitionJobReuse.set(jobId, (transitionJobReuse.get(jobId) || 0) + 1);
      const target = placement.selection?.kind === "explicit-assignment"
        ? explicitTransitionJobReuse
        : inferredTransitionJobReuse;
      target.set(jobId, (target.get(jobId) || 0) + 1);
    }
  }
  motionTelemetry.transitionJobReuse = Object.fromEntries([...transitionJobReuse.entries()].sort());
  motionTelemetry.explicitTransitionJobReuse = Object.fromEntries([...explicitTransitionJobReuse.entries()].sort());
  motionTelemetry.inferredTransitionJobReuse = Object.fromEntries([...inferredTransitionJobReuse.entries()].sort());
  motionTelemetry.maximumTransitionJobReuse = Math.max(0, ...transitionJobReuse.values());
  motionTelemetry.transitionPlacementsBySong = transitionPlacementsBySong;
  const songsByTransitionCount = new Map();
  for (const count of Object.values(transitionPlacementsBySong)) {
    songsByTransitionCount.set(count, (songsByTransitionCount.get(count) || 0) + 1);
  }
  motionTelemetry.songsByTransitionCount = Object.fromEntries(
    [...songsByTransitionCount.entries()].sort((left, right) => left[0] - right[0]),
  );
  motionTelemetry.songsWithoutTransitions = Object.entries(transitionPlacementsBySong)
    .filter(([, count]) => count === 0).map(([songId]) => songId).sort();
  const certifiedTransitionJobCount = motionTelemetry.uniqueAuthoredTransitionJobs.length;
  const expectedCertifiedTransitionJobIds = list(transitionVisualValidation?.certifiedJobIds).map(String).sort();
  if (stableEchoEnrichmentStringify(motionTelemetry.uniqueAuthoredTransitionJobs)
    !== stableEchoEnrichmentStringify(expectedCertifiedTransitionJobIds)) {
    throw new Error("Album transition coverage failed: selected jobs do not exactly match the certified transition set.");
  }
  const idealMaximumReuse = certifiedTransitionJobCount
    ? Math.ceil(motionTelemetry.placedTransitions / certifiedTransitionJobCount)
    : 0;
  const unavoidableExplicitMaximum = Math.max(0, ...explicitTransitionJobReuse.values());
  const documentedReuseCap = Math.max(18, idealMaximumReuse * 2, unavoidableExplicitMaximum);
  motionTelemetry.transitionReuseBalance = {
    policy: "preseed-explicit-then-least-used-within-song-semantic-cohort",
    certifiedTransitionJobCount,
    idealMaximumReuse,
    unavoidableExplicitMaximum,
    documentedReuseCap,
    withinDocumentedCap: motionTelemetry.maximumTransitionJobReuse <= documentedReuseCap,
  };
  if (!motionTelemetry.transitionReuseBalance.withinDocumentedCap) {
    throw new Error(`Album transition reuse ${motionTelemetry.maximumTransitionJobReuse} exceeds the documented cap ${documentedReuseCap}.`);
  }
  const transitionPlaybackRates = generated.flatMap((row) => (
    list(row.variant.telemetry?.transitionPlan)
      .map((placement) => Number(placement.transitionTimeMap?.playbackRate))
      .filter(Number.isFinite)
  )).sort((left, right) => left - right);
  motionTelemetry.actionOrientedShots = motionTelemetry.sceneMotionShots + motionTelemetry.authoredTransitionShots;
  motionTelemetry.nearStaticLoopShots = motionTelemetry.loopShots + motionTelemetry.subtleReferenceLoopShots;
  motionTelemetry.actionOrientedShare = motionTelemetry.shots
    ? Number((motionTelemetry.actionOrientedShots / motionTelemetry.shots).toFixed(6))
    : 0;
  motionTelemetry.transitionMotionShare = motionTelemetry.transitionSeconds + motionTelemetry.referenceStillHoldSeconds > 0
    ? Number((motionTelemetry.transitionSeconds / (
      motionTelemetry.transitionSeconds + motionTelemetry.referenceStillHoldSeconds
    )).toFixed(6))
    : null;
  motionTelemetry.transitionPlaybackRate = {
    count: transitionPlaybackRates.length,
    minimum: transitionPlaybackRates[0] ?? null,
    median: transitionPlaybackRates.length
      ? transitionPlaybackRates.length % 2
        ? transitionPlaybackRates[Math.floor(transitionPlaybackRates.length / 2)]
        : Number(((transitionPlaybackRates[(transitionPlaybackRates.length / 2) - 1]
          + transitionPlaybackRates[transitionPlaybackRates.length / 2]) / 2).toFixed(6))
      : null,
    maximum: transitionPlaybackRates.at(-1) ?? null,
  };
  if (motionTelemetry.subtleReferenceLoopShots !== 0) {
    throw new Error(`V6 ordinary-selection guard failed: ${motionTelemetry.subtleReferenceLoopShots} adaptive Reference loops leaked into the batch.`);
  }
  if (motionTelemetry.authoredTransitionShots !== motionTelemetry.placedTransitions
    || motionTelemetry.referenceStillHoldShots !== motionTelemetry.placedTransitions * 2
    || motionTelemetry.explicitTransitionPlacements + motionTelemetry.inferredTransitionPlacements
      !== motionTelemetry.placedTransitions) {
    throw new Error("V6 atomic transition accounting failed: every placed transition must have one motion shot and two exact Reference still holds.");
  }
  const declaredAssignedSongIds = new Set(list(transitionAssignments?.assignment?.songs)
    .map((assignment) => text(assignment.songId || assignment.song_id)).filter(Boolean));
  const certifiedAssignedSongIds = new Set(assignmentOverlay.jobsBySongId.keys());
  const songsWithoutCertifiedTransitions = [...declaredAssignedSongIds]
    .filter((songId) => !certifiedAssignedSongIds.has(songId)).sort();
  const report = {
    schemaVersion: ECHO_ENRICHMENT_DIRECTOR_REPORT_SCHEMA,
    mode: options.apply ? "apply" : "dry-run",
    dryRun: !options.apply,
    batch: batchMetadata,
    inputs: {
      enrichments: options.enrichmentsPath,
      chainGraph: options.chainGraphPath,
      enrichmentReport: options.enrichmentReportPath,
      transitionAssignments: options.transitionAssignmentsPath || null,
      referenceAnimationCatalog: options.referenceAnimationCatalogPath || null,
      transitionVisualValidation: options.transitionVisualValidationPath || null,
      mediaRoot: options.mediaRoot,
      songs: options.songsPath,
      projects: options.projectsDirectory,
      variants: options.variantsDirectory,
      expectedSchema: ECHO_VIDEO_ENRICHMENT_EXPECTED_SCHEMA,
    },
    enrichment: {
      rows: catalog.rows.length,
      playableRows: catalog.rows.filter((row) => row.uri && row.playable !== false).length,
      rowsMissingSemanticText: catalog.rows.filter((row) => row.missing.includes("semantic-text")).length,
      chainEdges: catalog.edges.length,
      computedFingerprint: `sha256:${sourceCatalog.computedFingerprint}`,
      declaredFingerprint: catalog.declaredFingerprint ? `sha256:${catalog.declaredFingerprint}` : null,
      integrity: catalogIntegrity,
      transitionAssignments: {
        declaredJobs: transitionAssignmentValidation?.declaredJobs || 0,
        certifiedJobs: assignmentOverlay.assignmentJobs,
        songs: assignmentOverlay.assignedSongs,
        enrichmentRows: assignmentOverlay.assignedRows,
        quarantinedRows: assignmentOverlay.quarantinedRows,
        songsWithoutCertifiedTransitions,
        validation: transitionAssignmentValidation,
      },
      transitionEndpoints: transitionEndpointValidation,
    },
    variants: {
      songs: generated.length,
      generated: generated.length,
      newFiles: generated.filter((row) => row.disposition === "pending-create").length,
      existingIdentical: generated.filter((row) => row.disposition === "existing-identical").length,
      motion: motionTelemetry,
      parentCuts: Object.fromEntries(generated.map((row) => [row.songId, row.parentVariantId])),
      cuts: generated.map((row) => ({
        songId: row.songId,
        variantId: row.variant.id,
        contentSha256: row.variant.contentSha256,
        shots: row.variant.timeline.length,
        replacementShots: row.variant.telemetry.replacementShots,
        lowPriorSelections: row.variant.telemetry.lowPriorSelections,
        lyricsUnavailableShots: row.variant.telemetry.lyricsUnavailableShots,
        assignedTransitions: row.variant.telemetry.assignedTransitions,
        inferredTransitions: row.variant.telemetry.inferredTransitions,
        plannedTransitions: row.variant.telemetry.plannedTransitions,
        explicitTransitionPlacements: row.variant.telemetry.explicitTransitionPlacements,
        inferredTransitionPlacements: row.variant.telemetry.inferredTransitionPlacements,
        placedTransitions: row.variant.telemetry.placedTransitions,
        rejectedTransitions: row.variant.telemetry.rejectedTransitions,
        transitionSeconds: row.variant.telemetry.transitionSeconds,
        referenceStillHoldSeconds: row.variant.telemetry.referenceStillHoldSeconds,
      })),
    },
    index: {
      beforeRows: indexPayloadRows(existingIndex).length,
      diskRowsBefore: diskRowsBefore.length,
      previewRowsAfter: previewIndexRows.length,
      serializedRebuild: options.apply ? "pending" : "dry-run-only",
    },
    validation: {
      exactSongCoverage: generated.length === options.expectedSongCount,
      oneCutPerSong: variantIds.size === generated.length,
      allCutsReady: generated.every((row) => row.variant.status === "ready" && row.variant.validation?.ok),
      baseProjectsMutated: 0,
      existingVariantsMutated: 0,
      indexMatchesDiskAfterApply: options.apply ? null : "pending-apply",
    },
    outputs: {
      report: options.apply ? options.reportPath : null,
      variantIndex: options.indexPath,
    },
  };

  if (options.apply) {
    report.index.backup = await backupIndex(options.indexPath, options.backupsDirectory, catalog.batchFingerprint);
    for (const row of generated) row.disposition = await appendVariantReplaySafe(row.variantPath, row.variant);
    await withIndexLock(options.indexPath, async () => {
      const lockedIndex = await readJson(options.indexPath, {
        schemaVersion: "hapa.echo.direction-script-variant-index.v1",
        variants: [],
      });
      const diskRows = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
      const rows = mergeDirectionVariantIndexRows(indexPayloadRows(lockedIndex), diskRows, incomingRows);
      const nextIndex = {
        ...lockedIndex,
        schemaVersion: "hapa.echo.direction-script-variant-index.v1",
        variants: rows,
        updatedAt: effectiveTimestamp,
        enrichmentDirectorBatch: batchMetadata,
      };
      if (stableEchoEnrichmentStringify(indexStablePayload(lockedIndex)) !== stableEchoEnrichmentStringify(indexStablePayload(nextIndex))) {
        await atomicWrite(options.indexPath, nextIndex);
      }
      report.index.serializedRebuild = "complete";
    });
  }

  const changedProjects = [];
  for (const [filePath, before] of projectSnapshots) {
    if (sha256Bytes(await readFile(filePath)) !== before) changedProjects.push(filePath);
  }
  const changedVariants = await changedSnapshots(variantSnapshots);
  if (changedProjects.length) throw new Error(`Immutable base projects changed: ${changedProjects.join(", ")}`);
  if (changedVariants.length) throw new Error(`Existing append-only variants changed: ${changedVariants.join(", ")}`);
  report.validation.baseProjectsMutated = changedProjects.length;
  report.validation.existingVariantsMutated = changedVariants.length;

  if (options.apply) {
    const diskRowsAfter = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
    const persistedIndex = await readJson(options.indexPath);
    const parity = assertIndexParity(persistedIndex, diskRowsAfter);
    report.validation.indexMatchesDiskAfterApply = parity.exactIdParity;
    report.index.diskRowsAfter = parity.diskRows;
    report.index.persistedRowsAfter = parity.indexRows;
    report.variants.newFiles = generated.filter((row) => row.disposition === "created").length;
    report.variants.existingIdentical = generated.filter((row) => row.disposition !== "created").length;
    await atomicWrite(options.reportPath, report);
  }
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const report = await runEnrichmentDirectorVariantPass(parseEnrichmentDirectorArguments(argv));
  process.stdout.write(json({ ok: true, ...report }));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
