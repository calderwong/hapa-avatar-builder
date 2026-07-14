#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  buildDirectorV2Artifacts,
  stableStringify,
} from "../src/domain/echo-director-v2.js";
import { validatePortableVisualizerCard } from "../src/domain/portable-visualizer-card.js";
import {
  COMPOSITOR_NATIVE_KEYS,
  NATIVE_SHADER_ROUTE_SCHEMA,
  hydrateManifestNativeRoutes,
  nativeVisualizerRouteCounts,
  validateNativeVisualizerRoute,
} from "../src/domain/native-visualizer-route.js";
import {
  assertEchoMediaPreflight,
  preflightEchoAlbum,
} from "./preflight-echo-director-media.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const PROJECTS = path.resolve(argument("projects", path.join(ROOT, "data/music-video-projects")));
const OUTPUT = path.resolve(argument("output", path.join(ROOT, "artifacts/echo-director-v2/album")));
const VARIANTS = path.resolve(argument("variants", path.join(ROOT, "data/music-video-project-variants")));
const MANIFEST_PATH = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";
const PROXY_REGISTRY_PATH = path.join(path.dirname(MANIFEST_PATH), "proxies/native-exact-proxies.json");
const registryPath = "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";

function nativeProxyAvailable(proxy = {}, shader = {}) {
  const assetPath = String(proxy.assetPath || "");
  const expected = String(proxy.assetSha256 || "").replace(/^sha256:/i, "").toLowerCase();
  const sourcePath = String(shader.source || "");
  const expectedSource = String(shader.sourceHash || proxy.sourceHash || "").replace(/^sha256:/i, "").toLowerCase();
  if (!assetPath || !expected || !sourcePath || !expectedSource) return false;
  const musicVizRoot = path.resolve(path.dirname(MANIFEST_PATH), "../..");
  const candidates = [
    proxy.repositoryPath ? path.resolve(musicVizRoot, String(proxy.repositoryPath)) : "",
    assetPath.startsWith("/static/") ? path.resolve(musicVizRoot, "web", assetPath.replace(/^\/static\//, "")) : "",
    path.isAbsolute(assetPath) ? assetPath : path.resolve(path.dirname(MANIFEST_PATH), assetPath),
    path.resolve(musicVizRoot, assetPath.replace(/^\/+/, "")),
  ].filter(Boolean);
  const filePath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!filePath) return false;
  const sourceCandidates = [
    sourcePath.startsWith("/static/") ? path.resolve(musicVizRoot, "web", sourcePath.replace(/^\/static\//, "")) : "",
    path.isAbsolute(sourcePath) ? sourcePath : path.resolve(path.dirname(MANIFEST_PATH), sourcePath),
    path.resolve(musicVizRoot, sourcePath.replace(/^\/+/, "")),
  ].filter(Boolean);
  const sourceFilePath = sourceCandidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!sourceFilePath) return false;
  const assetMatches = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") === expected;
  const sourceMatches = crypto.createHash("sha256").update(fs.readFileSync(sourceFilePath)).digest("hex") === expectedSource;
  return assetMatches && sourceMatches;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${stableStringify(value, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function clippedWindow(cue, duration) {
  const start = Math.max(0, Number(cue?.start_sec));
  const end = Math.min(Number(duration || 0), Number(cue?.end_sec));
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
}

function durationOf(rows) {
  return Number(rows.reduce((sum, row) => sum + Number(row.endSeconds - row.startSeconds), 0).toFixed(6));
}

function maxSimultaneous(rows) {
  const events = rows.flatMap((row) => [
    { at: Number(row.startSeconds), delta: 1 },
    { at: Number(row.endSeconds), delta: -1 },
  ]).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let peak = 0;
  for (const event of events) {
    active += event.delta;
    peak = Math.max(peak, active);
  }
  return peak;
}

function sameId(left, right) {
  return String(left || "").replace(/^isf:/i, "").toLowerCase()
    === String(right || "").replace(/^isf:/i, "").toLowerCase();
}

const mediaPreflight = preflightEchoAlbum({
  projectsRoot: PROJECTS,
  variantsRoot: VARIANTS,
  avatarRoot: ROOT,
});
writeJson(path.join(OUTPUT, "media-preflight-report.json"), {
  ...mediaPreflight,
  generatedAt: new Date().toISOString(),
});
assertEchoMediaPreflight(mediaPreflight);

// Only hydrate the large manifest/proxy/registry inputs after every source cut
// has passed the local media gate.
const MANIFEST_BYTES = fs.readFileSync(MANIFEST_PATH);
const PROXY_REGISTRY_BYTES = fs.existsSync(PROXY_REGISTRY_PATH) ? fs.readFileSync(PROXY_REGISTRY_PATH) : Buffer.from("{}");
const PROXY_REGISTRY = JSON.parse(PROXY_REGISTRY_BYTES.toString("utf8"));
const MANIFEST = hydrateManifestNativeRoutes(JSON.parse(MANIFEST_BYTES.toString("utf8")), PROXY_REGISTRY);
const MANIFEST_HASH = `sha256:${crypto.createHash("sha256").update(MANIFEST_BYTES).digest("hex")}`;
const PROXY_REGISTRY_HASH = `sha256:${crypto.createHash("sha256").update(PROXY_REGISTRY_BYTES).digest("hex")}`;
const REGISTRY = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : null;

const files = fs.readdirSync(PROJECTS).filter((file) => file.endsWith(".json")).sort();
const rows = [];
for (const file of files) {
  const payload = JSON.parse(fs.readFileSync(path.join(PROJECTS, file), "utf8"));
  const project = payload.music_video_project || payload;
  const artifacts = buildDirectorV2Artifacts({
    project: payload,
    manifest: MANIFEST,
    registry: REGISTRY,
    duration: Number(project.duration || 0),
    recipe: "visualizer-forward",
    seed: `album-v2:${project.song_id}`,
    avatarRoot: ROOT,
    nativeProxyAvailable,
  });
  const slug = String(project.song_id || path.basename(file, ".json")).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const directory = path.join(OUTPUT, slug);
  writeJson(path.join(directory, "cue-graph.json"), artifacts.cueGraph);
  writeJson(path.join(directory, "editorial-treatment.json"), artifacts.treatment);
  writeJson(path.join(directory, "native-show-graph.json"), artifacts.showGraph);
  writeJson(path.join(directory, "variant-receipt.json"), artifacts.receipt);
  const portableCards = artifacts.treatment.visualizers.map((visualizer) => visualizer.portableCard);
  const invalidCards = portableCards.flatMap((card, index) => {
    const result = validatePortableVisualizerCard(card);
    return result.ok ? [] : [{ index, errors: result.errors }];
  });
  const pureSlots = artifacts.treatment.mediaSlots.filter((slot) => slot.media.sourceKind === "pure-visualizer");
  const knockedOut = artifacts.showGraph.tracks[0].cards.filter((card) => card.knockedOut);
  const graphVisualizerCards = artifacts.showGraph.tracks[1].cards;
  const nativeRouteCounts = nativeVisualizerRouteCounts(graphVisualizerCards);
  const nativeRouteErrors = graphVisualizerCards.flatMap((card) => {
    const route = card.visualization?.nativeRoute;
    const validation = validateNativeVisualizerRoute(route);
    const errors = [...validation.errors];
    if (!sameId(card.visualization?.sourceId, route?.requested?.id)) errors.push("requested-id-mismatch");
    if (route?.requested?.sourceHash !== card.visualization?.card?.source?.hash) errors.push("source-hash-mismatch");
    if (card.visualization?.card?.nativeRoute?.route !== route?.route) errors.push("portable-route-mismatch");
    if (card.visualization?.card?.rendererSupport?.musicVizNative?.route !== route?.route) errors.push("renderer-support-route-mismatch");
    if (card.visualization?.nativeKey !== route?.nativeKey) errors.push("visualization-native-key-mismatch");
    return errors.length ? [{ cardId: card.id, sourceCueIndex: card.sourceCueIndex, requestedSourceId: card.requestedSourceId, errors: [...new Set(errors)] }] : [];
  });
  const allGraphVisualizations = artifacts.showGraph.tracks.flatMap((track) => (track.cards || []).filter((card) => card.visualization));
  const graphIntentKeys = allGraphVisualizations.filter((card) => /^intent-/i.test(String(card.visualization?.nativeKey || "")));
  const nativeSourceRouteMap = new Map();
  for (const card of graphVisualizerCards) {
    const route = card.visualization?.nativeRoute;
    const sourceId = String(card.visualization?.sourceId || "");
    const key = `${route?.route || "missing"}\0${route?.nativeKey || ""}`;
    const source = nativeSourceRouteMap.get(sourceId) || { sourceId, count: 0, routes: new Map() };
    source.count += 1;
    source.routes.set(key, (source.routes.get(key) || 0) + 1);
    nativeSourceRouteMap.set(sourceId, source);
  }
  const nativeSourceRoutes = [...nativeSourceRouteMap.values()].map((source) => ({
    sourceId: source.sourceId,
    count: source.count,
    routes: [...source.routes.entries()].map(([key, count]) => {
      const [route, nativeKey] = key.split("\0");
      return { route, nativeKey: nativeKey || null, count };
    }),
  }));
  const sourceCues = Array.isArray(project.visualizer_timeline) ? project.visualizer_timeline : [];
  const clippedSourceCues = sourceCues.flatMap((cue, sourceCueIndex) => {
    const window = clippedWindow(cue, project.duration);
    return window ? [{ sourceCueIndex, requestedSourceId: String(cue.visualizer_id || ""), startSeconds: window[0], endSeconds: window[1] }] : [];
  });
  const receipts = artifacts.showGraph.directorV2?.visualizerReceipts || [];
  const treatmentByIndex = new Map(artifacts.treatment.visualizers.map((visualizer) => [visualizer.sourceCueIndex, visualizer]));
  const receiptByIndex = new Map(receipts.map((receipt) => [receipt.sourceCueIndex, receipt]));
  const graphByIndex = new Map(graphVisualizerCards.map((card) => [card.sourceCueIndex, card]));
  const endpointMismatches = [];
  const identityMismatches = [];
  const missingAccounting = [];
  for (let sourceCueIndex = 0; sourceCueIndex < sourceCues.length; sourceCueIndex += 1) {
    const cue = sourceCues[sourceCueIndex];
    const window = clippedWindow(cue, project.duration);
    const receipt = receiptByIndex.get(sourceCueIndex);
    if (!receipt) missingAccounting.push({ sourceCueIndex, reason: "missing-receipt" });
    if (!window) {
      if (!String(receipt?.eligibilityStatus || "").startsWith("rejected-invalid-window")) {
        missingAccounting.push({ sourceCueIndex, reason: "invalid-window-without-explicit-rejection" });
      }
      continue;
    }
    const visualizer = treatmentByIndex.get(sourceCueIndex);
    const card = graphByIndex.get(sourceCueIndex);
    if (!visualizer || !card) {
      missingAccounting.push({ sourceCueIndex, reason: !visualizer ? "missing-treatment-visualizer" : "missing-track-b-card" });
      continue;
    }
    if (Math.abs(card.startSeconds - window[0]) > 0.001 || Math.abs(card.endSeconds - window[1]) > 0.001) {
      endpointMismatches.push({ sourceCueIndex, expected: window, actual: [card.startSeconds, card.endSeconds] });
    }
    const requestedSourceId = String(cue.visualizer_id || "");
    const identityChain = [
      visualizer.requestedSourceId,
      visualizer.sourceId,
      visualizer.portableCard?.id,
      card.requestedSourceId,
      card.visualization?.requestedSourceId,
      card.visualization?.sourceId,
      card.visualization?.card?.id,
    ];
    if (identityChain.some((value) => !sameId(requestedSourceId, value))) {
      identityMismatches.push({ sourceCueIndex, requestedSourceId, identityChain });
    }
  }
  const executableCards = graphVisualizerCards.filter((card) => !card.knockedOut);
  const sourceClippedDuration = durationOf(clippedSourceCues);
  const compiledDuration = durationOf(graphVisualizerCards);
  const exactIdCount = graphVisualizerCards.filter((card) => card.resolutionStatus === "exact-id").length;
  const titleFallbackCount = graphVisualizerCards.filter((card) => card.resolutionStatus === "title-fallback").length;
  const sourceCueOverrideCount = graphVisualizerCards.filter((card) => card.executionStatus === "executable-source-cue-override").length;
  const rejectedVisualizerCount = graphVisualizerCards.filter((card) => card.knockedOut).length;
  const maxConcurrentLayers = maxSimultaneous(executableCards);
  const configuredMaxConcurrentLayers = Number(artifacts.showGraph.directorV2?.visualizerLayerPolicy?.maxConcurrentLayers || 0);
  const errors = [];
  if (portableCards.length < 1) errors.push("no-portable-visualizer-cards");
  if (sourceCues.length !== receipts.length) errors.push("source-receipt-count-mismatch");
  if (clippedSourceCues.length !== artifacts.treatment.visualizers.length) errors.push("source-treatment-count-mismatch");
  if (clippedSourceCues.length !== graphVisualizerCards.length) errors.push("source-track-b-count-mismatch");
  if (exactIdCount !== graphVisualizerCards.length || titleFallbackCount !== 0) errors.push("non-exact-album-shader-resolution");
  if (Math.abs(sourceClippedDuration - compiledDuration) > 0.001) errors.push("source-track-b-duration-mismatch");
  if (endpointMismatches.length) errors.push("source-track-b-endpoint-mismatch");
  if (identityMismatches.length) errors.push("source-id-chain-mismatch");
  if (missingAccounting.length) errors.push("source-cue-accounting-mismatch");
  if (configuredMaxConcurrentLayers < 1 || configuredMaxConcurrentLayers > 6 || maxConcurrentLayers > configuredMaxConcurrentLayers) errors.push("simultaneous-layer-limit-violated");
  if (invalidCards.length) errors.push("invalid-portable-cards");
  if (graphVisualizerCards.some((card) => !card.visualization?.card?.stemFocus || !card.visualization?.card?.audioSignal || !card.visualization?.card?.rendererSupport)) errors.push("missing-executable-layer-fields");
  if (knockedOut.length !== pureSlots.length) errors.push("pure-ivf-media-suppression-mismatch");
  if (nativeRouteCounts.total !== graphVisualizerCards.length) errors.push("native-route-card-accounting-mismatch");
  if (nativeRouteCounts.exactNative + nativeRouteCounts.exactProxy + nativeRouteCounts.unsupported !== graphVisualizerCards.length) errors.push("native-route-classification-mismatch");
  if (nativeRouteCounts.invalid || nativeRouteErrors.length) errors.push("invalid-native-routes");
  if (nativeRouteCounts.intentKeys || graphIntentKeys.length) errors.push("intent-native-keys-remain");
  if (nativeRouteCounts.silentDefaults) errors.push("silent-native-defaults-remain");
  rows.push({
    file,
    songId: project.song_id,
    title: project.song_title,
    directory,
    sourceProjectHash: artifacts.treatment.sourceProjectHash,
    manifestHash: MANIFEST_HASH,
    sourceCueCount: sourceCues.length,
    validClippedCueCount: clippedSourceCues.length,
    receiptCount: receipts.length,
    treatmentVisualizerCount: artifacts.treatment.visualizers.length,
    portableCardCount: portableCards.length,
    visualizerCardCount: graphVisualizerCards.length,
    executableLayerCount: executableCards.length,
    rejectedVisualizerCount,
    exactIdCount,
    titleFallbackCount,
    sourceCueOverrideCount,
    sourceClippedDuration,
    compiledDuration,
    maxConcurrentLayers,
    configuredMaxConcurrentLayers,
    endpointMismatches,
    identityMismatches,
    missingAccounting,
    pureIVFSlots: pureSlots.length,
    knockedOutMediaCards: knockedOut.length,
    invalidCards,
    nativeRouteCounts,
    nativeRouteErrors,
    nativeIntentKeyCount: graphIntentKeys.length,
    nativeSourceRoutes,
    errors,
  });
}

const nativeRouteCounts = rows.reduce((counts, row) => {
  for (const field of ["total", "exactNative", "exactProxy", "unsupported", "invalid", "intentKeys", "silentDefaults"]) {
    counts[field] += Number(row.nativeRouteCounts?.[field] || 0);
  }
  return counts;
}, { total: 0, exactNative: 0, exactProxy: 0, unsupported: 0, invalid: 0, intentKeys: 0, silentDefaults: 0 });
const albumSourceRouteMap = new Map();
for (const row of rows) {
  for (const source of row.nativeSourceRoutes || []) {
    const aggregate = albumSourceRouteMap.get(source.sourceId) || { sourceId: source.sourceId, count: 0, routes: new Map() };
    aggregate.count += source.count;
    for (const route of source.routes) {
      const key = `${route.route}\0${route.nativeKey || ""}`;
      aggregate.routes.set(key, (aggregate.routes.get(key) || 0) + route.count);
    }
    albumSourceRouteMap.set(source.sourceId, aggregate);
  }
}
const albumSourceRoutes = [...albumSourceRouteMap.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId)).map((source) => ({
  sourceId: source.sourceId,
  count: source.count,
  routes: [...source.routes.entries()].map(([key, count]) => {
    const [route, nativeKey] = key.split("\0");
    return { route, nativeKey: nativeKey || null, count };
  }),
}));
const visualizerCardCount = rows.reduce((sum, row) => sum + row.visualizerCardCount, 0);
const nativeRouteReport = {
  schemaVersion: "hapa.echo.album-native-shader-route-report.v1",
  routeEntrySchemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
  generatedAt: new Date().toISOString(),
  manifestPath: MANIFEST_PATH,
  manifestHash: MANIFEST_HASH,
  proxyRegistryPath: PROXY_REGISTRY_PATH,
  proxyRegistryHash: PROXY_REGISTRY_HASH,
  proxyRegistryCounts: MANIFEST.nativeRouteRegistry,
  projectCount: rows.length,
  cueCardCount: visualizerCardCount,
  routeCounts: nativeRouteCounts,
  accountedCardCount: nativeRouteCounts.exactNative + nativeRouteCounts.exactProxy + nativeRouteCounts.unsupported,
  renderableNativeCardCount: nativeRouteCounts.exactNative + nativeRouteCounts.exactProxy,
  explicitUnsupportedCardCount: nativeRouteCounts.unsupported,
  silentFilteredCardCount: Math.max(0, visualizerCardCount - nativeRouteCounts.total) + nativeRouteCounts.silentDefaults,
  verification: {
    exactProxyRequiresAvailableAsset: true,
    exactProxyRequiresSourceSha256Match: true,
    exactProxyRequiresAssetSha256Match: true,
    verifiedExactProxyCueCount: nativeRouteCounts.exactProxy,
  },
  compositorNativeKeys: COMPOSITOR_NATIVE_KEYS,
  uniqueSourceIdCount: albumSourceRoutes.length,
  sourceRoutes: albumSourceRoutes,
  projects: rows.map((row) => ({ songId: row.songId, file: row.file, visualizerCardCount: row.visualizerCardCount, routeCounts: row.nativeRouteCounts, intentKeyCount: row.nativeIntentKeyCount, routeErrors: row.nativeRouteErrors })),
  ok: nativeRouteCounts.total === visualizerCardCount
    && nativeRouteCounts.exactNative + nativeRouteCounts.exactProxy + nativeRouteCounts.unsupported === visualizerCardCount
    && nativeRouteCounts.invalid === 0
    && nativeRouteCounts.intentKeys === 0
    && nativeRouteCounts.silentDefaults === 0
    && rows.every((row) => row.nativeIntentKeyCount === 0 && row.nativeRouteErrors.length === 0),
};

const report = {
  schemaVersion: "hapa.echo.director-v2-album-hydration.v2",
  ok: rows.every((row) => row.errors.length === 0),
  generatedAt: new Date().toISOString(),
  projectCount: rows.length,
  passingProjects: rows.filter((row) => row.errors.length === 0).length,
  manifestPath: MANIFEST_PATH,
  manifestHash: MANIFEST_HASH,
  sourceCueCount: rows.reduce((sum, row) => sum + row.sourceCueCount, 0),
  validClippedCueCount: rows.reduce((sum, row) => sum + row.validClippedCueCount, 0),
  receiptCount: rows.reduce((sum, row) => sum + row.receiptCount, 0),
  visualizerCardCount,
  portableCardCount: rows.reduce((sum, row) => sum + row.portableCardCount, 0),
  executableLayerCount: rows.reduce((sum, row) => sum + row.executableLayerCount, 0),
  rejectedVisualizerCount: rows.reduce((sum, row) => sum + row.rejectedVisualizerCount, 0),
  exactIdCount: rows.reduce((sum, row) => sum + row.exactIdCount, 0),
  titleFallbackCount: rows.reduce((sum, row) => sum + row.titleFallbackCount, 0),
  sourceCueOverrideCount: rows.reduce((sum, row) => sum + row.sourceCueOverrideCount, 0),
  sourceClippedDuration: Number(rows.reduce((sum, row) => sum + row.sourceClippedDuration, 0).toFixed(6)),
  compiledDuration: Number(rows.reduce((sum, row) => sum + row.compiledDuration, 0).toFixed(6)),
  maxConcurrentLayers: Math.max(0, ...rows.map((row) => row.maxConcurrentLayers)),
  pureIVFSlots: rows.reduce((sum, row) => sum + row.pureIVFSlots, 0),
  knockedOutMediaCards: rows.reduce((sum, row) => sum + row.knockedOutMediaCards, 0),
  nativeShaderRoutes: {
    schemaVersion: nativeRouteReport.schemaVersion,
    ok: nativeRouteReport.ok,
    routeCounts: nativeRouteReport.routeCounts,
    accountedCardCount: nativeRouteReport.accountedCardCount,
    silentFilteredCardCount: nativeRouteReport.silentFilteredCardCount,
    uniqueSourceIdCount: nativeRouteReport.uniqueSourceIdCount,
  },
  mediaPreflight: {
    schemaVersion: mediaPreflight.schemaVersion,
    ok: mediaPreflight.ok,
    projectCount: mediaPreflight.projectCount,
    cutCount: mediaPreflight.cutCount,
    declaredCount: mediaPreflight.declaredCount,
    generatedCount: mediaPreflight.generatedCount,
    resolvedCount: mediaPreflight.resolvedCount,
    unresolvedCount: mediaPreflight.unresolvedCount,
  },
  failures: rows.filter((row) => row.errors.length),
  projects: rows,
};
writeJson(path.join(OUTPUT, "album-hydration-report.json"), report);
writeJson(path.join(OUTPUT, "native-shader-route-report.json"), nativeRouteReport);
console.log(JSON.stringify({ ok: report.ok && nativeRouteReport.ok, output: OUTPUT, projects: report.projectCount, passing: report.passingProjects, portableCards: report.portableCardCount, executableLayers: report.executableLayerCount, pureIVFSlots: report.pureIVFSlots, nativeRoutes: nativeRouteReport.routeCounts, mediaPreflight: report.mediaPreflight }, null, 2));
if (!report.ok || !nativeRouteReport.ok) process.exitCode = 1;
