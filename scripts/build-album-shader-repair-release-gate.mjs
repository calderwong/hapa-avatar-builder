#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EchoIsfAssetCatalog, writeEchoIsfAsset } from "../server/echo-isf-assets.mjs";
import {
  resolveVisualizerRendererTruth,
  validateVisualizerRendererTruth,
} from "../src/domain/visualizer-renderer-capability.js";
import {
  COMPOSITOR_NATIVE_KEYS,
  validateNativeVisualizerRoute,
} from "../src/domain/native-visualizer-route.js";
import { validatePortableVisualizerCard } from "../src/domain/portable-visualizer-card.js";

const ROOT = path.resolve(import.meta.dirname, "..");

function argumentsFrom(argv = process.argv.slice(2)) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = String(argv[index]);
    if (!raw.startsWith("--")) continue;
    const equal = raw.indexOf("=");
    if (equal >= 0) {
      values[raw.slice(2, equal)] = raw.slice(equal + 1);
      continue;
    }
    const key = raw.slice(2);
    const next = argv[index + 1];
    if (next && !String(next).startsWith("--")) {
      values[key] = String(next);
      index += 1;
    } else values[key] = true;
  }
  return values;
}

const argv = argumentsFrom();
const ALBUM_ROOT = path.resolve(String(argv.album || path.join(ROOT, "artifacts/echo-director-v2/album")));
const PROJECT_ROOT = path.resolve(String(argv.projects || path.join(ROOT, "data/music-video-projects")));
const MUSIC_VIZ_ROOT = path.resolve(String(argv.musicViz || process.env.HAPA_MUSIC_VIZ_ROOT || "/Users/calderwong/Desktop/hapa-music-viz"));
const OUTPUT = path.resolve(String(argv.output || path.join(ALBUM_ROOT, "shader-repair-release-gate.json")));
const HYDRATION_PATH = path.join(ALBUM_ROOT, "album-hydration-report.json");
const NATIVE_ROUTES_PATH = path.join(ALBUM_ROOT, "native-shader-route-report.json");
const MANIFEST_PATH = path.join(MUSIC_VIZ_ROOT, "web/isf/manifest.json");
const PROXY_REGISTRY_PATH = path.join(MUSIC_VIZ_ROOT, "web/isf/proxies/native-exact-proxies.json");

const RENDERERS = Object.freeze({
  echo: {
    id: "echo-avatar-builder",
    routes: new Set(["exact-browser-isf"]),
  },
  tarot: {
    id: "echo-tarot",
    routes: new Set(["exact-browser-isf"]),
  },
  native: {
    id: "music-viz-native",
    routes: new Set(["exact-native", "hash-bound-exact-proxy", "unsupported"]),
  },
  hyperframes: {
    id: "hyperframes",
    routes: new Set(["hash-bound-exact-proxy", "unsupported"]),
  },
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function normalizedSha256(value = "") {
  const digest = String(value || "").trim().replace(/^sha256:/i, "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? `sha256:${digest}` : "";
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalHash(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(canonical(value))));
}

function reportSemanticHash(value) {
  const copy = structuredClone(value);
  delete copy.generatedAt;
  return canonicalHash(copy);
}

function stableCounter(values = []) {
  const counts = new Map();
  for (const value of values) {
    const key = String(value || "missing");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function clippedWindow(cue = {}, durationSeconds = 0) {
  const startSeconds = Math.max(0, Number(cue.start_sec));
  const endSeconds = Math.min(Number(durationSeconds), Number(cue.end_sec));
  return Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && endSeconds > startSeconds
    ? { startSeconds, endSeconds }
    : null;
}

function durationOf(rows = []) {
  return Number(rows.reduce((sum, row) => sum + Number(row.endSeconds - row.startSeconds), 0).toFixed(6));
}

function digestFileSet(files = [], base = ROOT) {
  const hash = crypto.createHash("sha256");
  for (const filePath of [...files].sort()) {
    hash.update(path.relative(base, filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function resolveStaticAsset(uri = "") {
  const value = String(uri || "");
  if (value.startsWith("/static/")) return path.resolve(MUSIC_VIZ_ROOT, "web", value.slice("/static/".length));
  if (path.isAbsolute(value)) return value;
  return path.resolve(MUSIC_VIZ_ROOT, value);
}

function captureResponse({ method = "GET", ifNoneMatch = "" } = {}, record, options) {
  const captured = { status: null, headers: {}, body: Buffer.alloc(0) };
  const req = { method, headers: { "if-none-match": ifNoneMatch } };
  const res = {
    writeHead(status, headers) {
      captured.status = status;
      captured.headers = { ...headers };
    },
    end(body) {
      captured.body = body == null ? Buffer.alloc(0) : Buffer.from(body);
    },
  };
  writeEchoIsfAsset(req, res, record, options);
  return captured;
}

function responseContract(record, { contentType, shaderId = "" } = {}) {
  const get = captureResponse({ method: "GET" }, record, { contentType, shaderId, immutable: true });
  const head = captureResponse({ method: "HEAD" }, record, { contentType, shaderId, immutable: true });
  const etag = get.headers.ETag;
  const conditional = captureResponse({ method: "GET", ifNoneMatch: etag }, record, { contentType, shaderId, immutable: true });
  const errors = [];
  if (get.status !== 200) errors.push("get-status");
  if (get.headers["Content-Type"] !== contentType) errors.push("content-type");
  if (get.headers["Content-Length"] !== record.bytes.byteLength) errors.push("content-length");
  if (get.headers["Cache-Control"] !== "public, max-age=31536000, immutable") errors.push("immutable-cache-control");
  if (get.headers["X-Content-Type-Options"] !== "nosniff") errors.push("nosniff");
  if (get.headers["X-Hapa-Source-Sha256"] !== record.hash) errors.push("source-hash-header");
  if (shaderId && get.headers["X-Hapa-Shader-Id"] !== shaderId) errors.push("shader-id-header");
  if (sha256Bytes(get.body) !== `sha256:${record.hash}`) errors.push("body-hash");
  if (head.status !== 200 || head.body.byteLength !== 0) errors.push("head-contract");
  if (conditional.status !== 304 || conditional.body.byteLength !== 0) errors.push("etag-contract");
  return {
    ok: errors.length === 0,
    errors,
    status: get.status,
    etag,
    cacheControl: get.headers["Cache-Control"] || "",
    sourceHashHeader: get.headers["X-Hapa-Source-Sha256"] || "",
  };
}

const violations = [];
function violate(code, details = {}) {
  violations.push({ code, ...details });
}

for (const required of [HYDRATION_PATH, NATIVE_ROUTES_PATH, MANIFEST_PATH, PROXY_REGISTRY_PATH]) {
  if (!fs.existsSync(required)) throw new Error(`Required shader-repair evidence is missing: ${required}`);
}

const hydration = readJson(HYDRATION_PATH);
const nativeRoutes = readJson(NATIVE_ROUTES_PATH);
const manifest = readJson(MANIFEST_PATH);
const proxyRegistry = readJson(PROXY_REGISTRY_PATH);
const manifestHash = sha256Bytes(fs.readFileSync(MANIFEST_PATH));
const proxyRegistryHash = sha256Bytes(fs.readFileSync(PROXY_REGISTRY_PATH));

if (hydration.schemaVersion !== "hapa.echo.director-v2-album-hydration.v2" || hydration.ok !== true) violate("hydration-report-not-release-ready");
if (nativeRoutes.schemaVersion !== "hapa.echo.album-native-shader-route-report.v1" || nativeRoutes.ok !== true) violate("native-route-report-not-release-ready");
if (hydration.manifestHash !== manifestHash || nativeRoutes.manifestHash !== manifestHash) violate("manifest-evidence-hash-mismatch");
if (nativeRoutes.proxyRegistryHash !== proxyRegistryHash) violate("proxy-registry-evidence-hash-mismatch");

const assetCatalog = new EchoIsfAssetCatalog({ musicVizRoot: MUSIC_VIZ_ROOT, cacheCheckMs: Number.MAX_SAFE_INTEGER });
const catalog = await assetCatalog.load();
const catalogById = catalog.byId;
const graphFiles = [];
const sourceProjectFiles = [];
const projectRows = [];
const allCards = [];
const sourceCueByCard = new Map();
let sourceCueCount = 0;
let validClippedCueCount = 0;
let graphCueCount = 0;
let receiptCount = 0;
let sourceClippedDuration = 0;
let compiledDuration = 0;
let immutableIdCount = 0;
let exactTitleCount = 0;
let titleSubstitutionCount = 0;
let silentDefaultCount = 0;
let fallbackCount = 0;

for (const projectEvidence of [...(hydration.projects || [])].sort((left, right) => String(left.songId).localeCompare(String(right.songId)))) {
  const sourceProjectPath = path.join(PROJECT_ROOT, projectEvidence.file);
  const graphPath = path.join(ALBUM_ROOT, projectEvidence.songId, "native-show-graph.json");
  if (!fs.existsSync(sourceProjectPath) || !fs.existsSync(graphPath)) {
    violate("project-evidence-file-missing", { songId: projectEvidence.songId });
    continue;
  }
  sourceProjectFiles.push(sourceProjectPath);
  graphFiles.push(graphPath);
  const sourcePayload = readJson(sourceProjectPath);
  const project = sourcePayload.music_video_project || sourcePayload;
  const graph = readJson(graphPath);
  const sourceCues = Array.isArray(project.visualizer_timeline) ? project.visualizer_timeline : [];
  const cards = (graph.tracks || []).find((track) => track.id === "track-b" || track.role === "visualizer")?.cards || [];
  const receipts = graph.directorV2?.visualizerReceipts || [];
  const validCues = sourceCues.flatMap((cue, sourceCueIndex) => {
    const window = clippedWindow(cue, project.duration);
    return window ? [{ ...window, sourceCueIndex, cue }] : [];
  });
  const cardByIndex = new Map(cards.map((card) => [Number(card.sourceCueIndex), card]));
  let projectImmutableIds = 0;
  let projectExactTitles = 0;
  let projectSilentDefaults = 0;
  let projectFallbacks = 0;
  const projectRendererRoutes = Object.fromEntries(Object.keys(RENDERERS).map((key) => [key, []]));

  if (sourceCues.length !== validCues.length || validCues.length !== cards.length || sourceCues.length !== receipts.length) {
    violate("project-cue-count-coverage", {
      songId: projectEvidence.songId,
      sourceCueCount: sourceCues.length,
      validClippedCueCount: validCues.length,
      graphCueCount: cards.length,
      receiptCount: receipts.length,
    });
  }

  for (const row of validCues) {
    const card = cardByIndex.get(row.sourceCueIndex);
    if (!card) {
      violate("compiled-cue-missing", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex });
      continue;
    }
    const requestedId = String(row.cue.visualizer_id || "");
    const portable = card.visualization?.card || {};
    const nativeRoute = card.visualization?.nativeRoute || {};
    const record = catalogById.get(requestedId);
    const identityChain = [
      card.requestedSourceId,
      card.executionReceipt?.requestedSourceId,
      card.executionReceipt?.resolvedSourceId,
      card.visualization?.requestedSourceId,
      card.visualization?.sourceId,
      portable.id,
      portable.provenance?.manifestId,
      nativeRoute.requested?.id,
      portable.nativeRoute?.requested?.id,
    ];
    const identityExact = Boolean(requestedId) && identityChain.every((value) => String(value || "") === requestedId);
    if (!identityExact) violate("requested-id-mutated", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, requestedId, identityChain });
    else {
      immutableIdCount += 1;
      projectImmutableIds += 1;
    }

    if (Math.abs(Number(card.startSeconds) - row.startSeconds) > 0.001 || Math.abs(Number(card.endSeconds) - row.endSeconds) > 0.001) {
      violate("clipped-cue-boundary-mismatch", {
        songId: projectEvidence.songId,
        sourceCueIndex: row.sourceCueIndex,
        expected: [row.startSeconds, row.endSeconds],
        actual: [card.startSeconds, card.endSeconds],
      });
    }

    const manifestTitle = String(record?.public?.title || "");
    const sourceTitle = String(row.cue.visualizer_title || "");
    const titleChain = [portable.title, nativeRoute.requested?.title, portable.nativeRoute?.requested?.title];
    const normalizedTitle = (value) => String(value || "").trim();
    const titleExact = Boolean(manifestTitle)
      && sourceTitle === manifestTitle
      && String(portable.title || "") === manifestTitle
      && titleChain.slice(1).every((value) => normalizedTitle(value) === normalizedTitle(manifestTitle))
      && card.resolutionStatus === "exact-id";
    if (!titleExact) {
      titleSubstitutionCount += 1;
      violate("title-substitution-detected", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, sourceTitle, manifestTitle, titleChain, resolutionStatus: card.resolutionStatus });
    } else {
      exactTitleCount += 1;
      projectExactTitles += 1;
    }

    const portableValidation = validatePortableVisualizerCard(portable);
    if (!portableValidation.ok) violate("portable-card-invalid", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, errors: portableValidation.errors });
    const nativeValidation = validateNativeVisualizerRoute(nativeRoute);
    if (!nativeValidation.ok) violate("native-route-invalid", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, errors: nativeValidation.errors });

    const cueFallback = card.executionReceipt?.fallbackUsed === true || card.visualization?.fallbackReceipt != null || card.resolutionStatus === "title-fallback";
    const cueSilentDefault = nativeRoute.silentDefault === true || portable.nativeRoute?.silentDefault === true;
    if (cueFallback) {
      fallbackCount += 1;
      projectFallbacks += 1;
      violate("cue-fallback-detected", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex });
    }
    if (cueSilentDefault) {
      silentDefaultCount += 1;
      projectSilentDefaults += 1;
      violate("cue-silent-default-detected", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex });
    }

    for (const [surface, renderer] of Object.entries(RENDERERS)) {
      const truth = resolveVisualizerRendererTruth(card, renderer.id);
      const validation = validateVisualizerRendererTruth(truth);
      projectRendererRoutes[surface].push(truth.route);
      if (!validation.ok) violate("renderer-truth-invalid", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, surface, errors: validation.errors });
      if (truth.requested?.id !== requestedId) violate("renderer-requested-id-mutated", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, surface, expected: requestedId, actual: truth.requested?.id });
      if (!renderer.routes.has(truth.route)) violate("renderer-route-unrecognized", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, surface, route: truth.route });
      if (!["exact", "unsupported"].includes(truth.status)) violate("renderer-substitution-status", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, surface, status: truth.status });
      if (truth.silentDefault !== false) {
        silentDefaultCount += 1;
        projectSilentDefaults += 1;
        violate("renderer-silent-default-detected", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, surface });
      }
      if (truth.substitute != null) {
        titleSubstitutionCount += 1;
        violate("renderer-substitute-detected", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, surface, substitute: truth.substitute });
      }
      if (truth.status === "unsupported" && (truth.route !== "unsupported" || truth.readiness !== "unavailable" || !truth.reason || !truth.fidelityLoss?.length)) {
        violate("renderer-unsupported-not-explicit", { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, surface, truth });
      }
      card.__releaseGateRendererTruth ||= {};
      card.__releaseGateRendererTruth[surface] = truth;
    }

    allCards.push(card);
    sourceCueByCard.set(card, { songId: projectEvidence.songId, sourceCueIndex: row.sourceCueIndex, requestedId });
  }

  const sourceDuration = durationOf(validCues);
  const graphDuration = durationOf(cards);
  if (Math.abs(sourceDuration - graphDuration) > 0.001) violate("project-clipped-duration-coverage", { songId: projectEvidence.songId, sourceDuration, graphDuration });
  sourceCueCount += sourceCues.length;
  validClippedCueCount += validCues.length;
  graphCueCount += cards.length;
  receiptCount += receipts.length;
  sourceClippedDuration += sourceDuration;
  compiledDuration += graphDuration;
  projectRows.push({
    songId: projectEvidence.songId,
    title: project.song_title,
    sourceCueCount: sourceCues.length,
    validClippedCueCount: validCues.length,
    graphCueCount: cards.length,
    receiptCount: receipts.length,
    sourceClippedDuration: sourceDuration,
    compiledDuration: graphDuration,
    immutableIdCount: projectImmutableIds,
    exactTitleCount: projectExactTitles,
    silentDefaultCount: projectSilentDefaults,
    fallbackCount: projectFallbacks,
    rendererRouteCounts: Object.fromEntries(Object.entries(projectRendererRoutes).map(([surface, routes]) => [surface, stableCounter(routes)])),
  });
}

sourceClippedDuration = Number(sourceClippedDuration.toFixed(6));
compiledDuration = Number(compiledDuration.toFixed(6));

// Verify every unique shader requested by the album through the same content-
// addressed catalog and response writer used by the Echo API.
const cueCountsById = new Map();
for (const card of allCards) {
  const id = sourceCueByCard.get(card).requestedId;
  cueCountsById.set(id, (cueCountsById.get(id) || 0) + 1);
}
const sourceContracts = [];
for (const [id, cueCount] of [...cueCountsById.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  const record = catalogById.get(id);
  if (!record) {
    violate("requested-source-not-in-catalog", { id, cueCount });
    continue;
  }
  const publicRow = record.public;
  const parsedUrl = new URL(publicRow.source, "http://hapa.local");
  const pinnedHash = normalizedSha256(parsedUrl.searchParams.get("sha256"));
  const publicHash = normalizedSha256(publicRow.sourceHash);
  const direct = await assetCatalog.shader(id, publicHash);
  const mismatch = await assetCatalog.shader(id, "0".repeat(64));
  const response = responseContract(record, { contentType: "text/plain; charset=utf-8", shaderId: id });
  const cards = allCards.filter((card) => sourceCueByCard.get(card).requestedId === id);
  const cardHashes = [...new Set(cards.map((card) => normalizedSha256(card.visualization?.card?.source?.hash)))];
  const sourceUris = [...new Set(cards.map((card) => String(card.visualization?.card?.source?.uri || "")))];
  const errors = [];
  if (parsedUrl.pathname !== "/api/echos/shader-source") errors.push("api-source-path");
  if (parsedUrl.searchParams.get("id") !== id) errors.push("api-requested-id");
  if (!pinnedHash || pinnedHash !== publicHash) errors.push("api-source-hash-pin");
  if (direct.status !== "ready" || direct.record !== record) errors.push("catalog-ready-contract");
  if (mismatch.status !== "hash-mismatch") errors.push("catalog-hash-rejection-contract");
  if (!response.ok) errors.push(...response.errors.map((error) => `response:${error}`));
  if (cardHashes.length !== 1 || cardHashes[0] !== publicHash) errors.push("cue-source-hash");
  if (sourceUris.length !== 1 || sourceUris[0] !== publicRow.sourceOriginal) errors.push("cue-source-uri");
  if (sha256Bytes(record.bytes) !== publicHash) errors.push("source-bytes-hash");
  if (errors.length) violate("source-response-contract-invalid", { id, errors });
  sourceContracts.push({
    id,
    title: publicRow.title,
    cueCount,
    sourceOriginal: publicRow.sourceOriginal,
    source: publicRow.source,
    sourceHash: publicHash,
    sourceBytes: publicRow.sourceBytes,
    responseStatus: response.status,
    cacheControl: response.cacheControl,
    etag: response.etag,
    hashMismatchRejected: mismatch.status === "hash-mismatch",
    ok: errors.length === 0,
  });
}

const runtimeReady = await assetCatalog.runtime(catalog.runtime.sourceHash);
const runtimeMismatch = await assetCatalog.runtime("f".repeat(64));
const runtimeResponse = responseContract(catalog.runtime, { contentType: "text/javascript; charset=utf-8" });
const runtimeUrl = new URL(catalog.runtime.source, "http://hapa.local");
const runtimeContract = {
  source: catalog.runtime.source,
  sourceHash: catalog.runtime.sourceHash,
  sourceBytes: catalog.runtime.sourceBytes,
  responseStatus: runtimeResponse.status,
  cacheControl: runtimeResponse.cacheControl,
  etag: runtimeResponse.etag,
  hashMismatchRejected: runtimeMismatch.status === "hash-mismatch",
  ok: runtimeReady.status === "ready"
    && runtimeMismatch.status === "hash-mismatch"
    && normalizedSha256(runtimeUrl.searchParams.get("sha256")) === normalizedSha256(catalog.runtime.sourceHash)
    && runtimeResponse.ok,
};
if (!runtimeContract.ok) violate("runtime-response-contract-invalid", { runtimeReady: runtimeReady.status, runtimeMismatch: runtimeMismatch.status, responseErrors: runtimeResponse.errors });

// Re-hash every exact proxy used by Native or HyperFrames. This makes the
// route classification evidence bind to real, locally present pixel assets.
const proxyContractsByKey = new Map();
for (const card of allCards) {
  const { songId, sourceCueIndex, requestedId } = sourceCueByCard.get(card);
  const sourceHash = normalizedSha256(card.visualization?.card?.source?.hash);
  const nativeRoute = card.visualization?.nativeRoute;
  const hyperframesTruth = card.__releaseGateRendererTruth.hyperframes;
  const candidates = [];
  if (nativeRoute?.route === "hash-bound-exact-proxy") candidates.push({ surface: "native", proxy: nativeRoute.proxy });
  if (hyperframesTruth?.status === "exact") candidates.push({ surface: "hyperframes", proxy: card.visualization?.card?.hyperframesProxy });
  for (const { surface, proxy } of candidates) {
    const assetPath = resolveStaticAsset(proxy?.assetPath);
    const assetHash = normalizedSha256(proxy?.assetSha256);
    const errors = [];
    if (!proxy || proxy.verified === false) errors.push("proxy-unverified");
    if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) errors.push("proxy-asset-missing");
    if (normalizedSha256(proxy?.sourceHash) !== sourceHash) errors.push("proxy-source-hash");
    if (!assetHash) errors.push("proxy-asset-hash-missing");
    if (!errors.length && sha256Bytes(fs.readFileSync(assetPath)) !== assetHash) errors.push("proxy-asset-hash");
    if (![proxy?.width, proxy?.height, proxy?.frameCount, proxy?.fps].every((value) => Number(value) > 0)) errors.push("proxy-dimensions");
    if (errors.length) violate("proxy-contract-invalid", { songId, sourceCueIndex, requestedId, surface, errors });
    const key = `${surface}\0${requestedId}`;
    const existing = proxyContractsByKey.get(key);
    const row = {
      surface,
      id: requestedId,
      assetPath: proxy?.assetPath || "",
      assetSha256: assetHash,
      sourceHash,
      width: Number(proxy?.width || 0),
      height: Number(proxy?.height || 0),
      frameCount: Number(proxy?.frameCount || 0),
      fps: Number(proxy?.fps || 0),
      cueCount: Number(existing?.cueCount || 0) + 1,
      ok: errors.length === 0 && (existing?.ok ?? true),
    };
    proxyContractsByKey.set(key, row);
  }
}
const proxyContracts = [...proxyContractsByKey.values()].sort((left, right) => left.surface.localeCompare(right.surface) || left.id.localeCompare(right.id));

const rendererRows = Object.fromEntries(Object.keys(RENDERERS).map((surface) => {
  const rows = allCards.map((card) => card.__releaseGateRendererTruth[surface]);
  const unsupportedRows = rows.filter((row) => row.status === "unsupported");
  return [surface, {
    rendererId: RENDERERS[surface].id,
    receiptCount: rows.length,
    statusCounts: stableCounter(rows.map((row) => row.status)),
    routeCounts: stableCounter(rows.map((row) => row.route)),
    reasonCounts: stableCounter(rows.map((row) => row.reason)),
    exactCount: rows.filter((row) => row.status === "exact").length,
    unsupportedCount: unsupportedRows.length,
    unsupportedUniqueIdCount: new Set(unsupportedRows.map((row) => row.requested.id)).size,
    substituteCount: rows.filter((row) => row.substitute != null).length,
    silentDefaultCount: rows.filter((row) => row.silentDefault === true).length,
    allRoutesRecognized: rows.every((row) => RENDERERS[surface].routes.has(row.route)),
    allUnsupportedExplicit: unsupportedRows.every((row) => row.route === "unsupported" && row.readiness === "unavailable" && Boolean(row.reason) && row.fidelityLoss?.length > 0),
  }];
}));

for (const card of allCards) delete card.__releaseGateRendererTruth;

const assertions = {
  expected79Projects: projectRows.length === 79 && hydration.projectCount === 79 && hydration.passingProjects === 79,
  expected791SourceCues: sourceCueCount === 791,
  allSourceCuesHaveValidClippedWindows: validClippedCueCount === sourceCueCount,
  cueCountCoverage100Percent: graphCueCount === validClippedCueCount && receiptCount === sourceCueCount,
  clippedDurationCoverage100Percent: Math.abs(sourceClippedDuration - compiledDuration) <= 0.001,
  hydrationCountsAgree: hydration.sourceCueCount === sourceCueCount
    && hydration.validClippedCueCount === validClippedCueCount
    && hydration.visualizerCardCount === graphCueCount
    && hydration.receiptCount === receiptCount
    && Math.abs(hydration.sourceClippedDuration - sourceClippedDuration) <= 0.001
    && Math.abs(hydration.compiledDuration - compiledDuration) <= 0.001,
  immutableRequestedIds100Percent: immutableIdCount === graphCueCount,
  exactManifestTitles100Percent: exactTitleCount === graphCueCount && titleSubstitutionCount === 0,
  zeroSilentDefaults: silentDefaultCount === 0 && Object.values(rendererRows).every((row) => row.silentDefaultCount === 0),
  zeroFallbacksOrSubstitutes: fallbackCount === 0 && Object.values(rendererRows).every((row) => row.substituteCount === 0),
  allPortableCardsValid: !violations.some((row) => row.code === "portable-card-invalid"),
  requestedSourceCatalogCoverage100Percent: sourceContracts.length === cueCountsById.size && sourceContracts.every((row) => row.ok),
  allShaderSourcesHashPinned: sourceContracts.every((row) => normalizedSha256(new URL(row.source, "http://hapa.local").searchParams.get("sha256")) === row.sourceHash),
  sourceResponseContractsValid: sourceContracts.every((row) => row.responseStatus === 200 && row.hashMismatchRejected && row.cacheControl === "public, max-age=31536000, immutable"),
  runtimeResponseContractValid: runtimeContract.ok,
  rendererReceiptCoverage100Percent: Object.values(rendererRows).every((row) => row.receiptCount === graphCueCount),
  rendererRoutesRecognized: Object.values(rendererRows).every((row) => row.allRoutesRecognized),
  rendererUnsupportedAccountingExplicit: Object.values(rendererRows).every((row) => row.allUnsupportedExplicit),
  nativeRouteCountsAgree: rendererRows.native.routeCounts["exact-native"] === nativeRoutes.routeCounts.exactNative
    && rendererRows.native.routeCounts["hash-bound-exact-proxy"] === nativeRoutes.routeCounts.exactProxy
    && rendererRows.native.routeCounts.unsupported === nativeRoutes.routeCounts.unsupported
    && nativeRoutes.accountedCardCount === graphCueCount
    && nativeRoutes.silentFilteredCardCount === 0,
  exactProxyAssetsHashVerified: proxyContracts.length > 0 && proxyContracts.every((row) => row.ok),
  noUnrecognizedNativeKeys: allCards.every((card) => card.visualization?.nativeRoute?.route !== "exact-native" || COMPOSITOR_NATIVE_KEYS.includes(card.visualization.nativeRoute.nativeKey)),
  noViolations: violations.length === 0,
};

for (const [name, passed] of Object.entries(assertions)) if (!passed && !violations.some((row) => row.code === `assertion:${name}`)) violate(`assertion:${name}`);
assertions.noViolations = violations.length === 0;

const evidence = {
  schemaVersion: "hapa.echo.album-shader-repair-release-gate.v1",
  ok: Object.values(assertions).every(Boolean) && violations.length === 0,
  inputs: {
    albumHydrationSchemaVersion: hydration.schemaVersion,
    albumHydrationSemanticHash: reportSemanticHash(hydration),
    nativeRouteReportSchemaVersion: nativeRoutes.schemaVersion,
    nativeRouteReportSemanticHash: reportSemanticHash(nativeRoutes),
    manifestHash,
    proxyRegistryHash,
    sourceProjectSetHash: digestFileSet(sourceProjectFiles, PROJECT_ROOT),
    compiledGraphSetHash: digestFileSet(graphFiles, ALBUM_ROOT),
  },
  totals: {
    projectCount: projectRows.length,
    sourceCueCount,
    validClippedCueCount,
    graphCueCount,
    receiptCount,
    sourceClippedDuration,
    compiledDuration,
    immutableIdCount,
    exactTitleCount,
    titleSubstitutionCount,
    silentDefaultCount,
    fallbackCount,
    rendererReceiptCount: Object.values(rendererRows).reduce((sum, row) => sum + row.receiptCount, 0),
  },
  sources: {
    manifestShaderCount: manifest.shaders?.length || 0,
    catalogShaderCount: catalog.shaders.length,
    albumUniqueRequestedIdCount: cueCountsById.size,
    validContractCount: sourceContracts.filter((row) => row.ok).length,
    runtime: runtimeContract,
    contracts: sourceContracts,
  },
  proxies: {
    registryProxyCount: proxyRegistry.proxies?.length || 0,
    registryFailureCount: proxyRegistry.failures?.length || 0,
    nativeUniqueExactProxyCount: proxyContracts.filter((row) => row.surface === "native").length,
    hyperframesUniqueExactProxyCount: proxyContracts.filter((row) => row.surface === "hyperframes").length,
    contracts: proxyContracts,
  },
  renderers: rendererRows,
  unsupportedAccounting: Object.fromEntries(Object.entries(rendererRows).map(([surface, row]) => [surface, {
    cueCount: row.unsupportedCount,
    uniqueIdCount: row.unsupportedUniqueIdCount,
    explicit: row.allUnsupportedExplicit,
  }])),
  assertions,
  projects: projectRows,
  violations,
};
const report = { ...evidence, evidenceHash: canonicalHash(evidence) };
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  ok: report.ok,
  output: OUTPUT,
  evidenceHash: report.evidenceHash,
  projects: report.totals.projectCount,
  cues: report.totals.graphCueCount,
  durationSeconds: report.totals.compiledDuration,
  rendererReceipts: report.totals.rendererReceiptCount,
  sourceContracts: report.sources.validContractCount,
  unsupported: report.unsupportedAccounting,
  violations: report.violations.length,
}, null, 2));
if (!report.ok) process.exitCode = 1;
