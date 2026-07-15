#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import {
  buildDirectorV2Artifacts,
  DEFAULT_VARIANT_RECIPES,
  firstStableDifference,
  stableStringify,
} from "../src/domain/echo-director-v2.js";
import { hydrateManifestNativeRoutes } from "../src/domain/native-visualizer-route.js";
import { loadGatedEchoIsfManifest, repairEchoProjectShaders } from "./echo-isf-gated-manifest.mjs";
import {
  ECHO_MEDIA_PREFLIGHT_SCHEMA,
  assertEchoMediaPreflight,
  preflightEchoDirectionCut,
} from "./preflight-echo-director-media.mjs";

function parseArgs(argv) {
  const options = {
    project: "",
    manifest: "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json",
    registry: "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json",
    output: "",
    duration: 60,
    count: 0,
    recipe: "visualizer-forward",
    seed: "dear-papa-demo-v2",
    avatarRoot: "/Users/calderwong/Desktop/hapa-avatar-builder",
    stemTelemetry: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  options.duration = Number(options.duration);
  options.count = Number(options.count || 0);
  return options;
}

function readJson(filePath, required = true) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) {
    if (required) throw new Error(`Missing JSON input: ${filePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  const next = `${stableStringify(value, 2)}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === next) return "hit";
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, "utf8");
  return "miss";
}

function writeJsonWithEvidence(filePath, value) {
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, value);
    return { status: "miss", reason: "cache-file-missing", firstDifference: "$" };
  }
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { /* Invalid cache is replaced below. */ }
  const difference = previous ? firstStableDifference(previous, value) : { path: "$", left: "unparseable-cache", right: "valid-value" };
  const status = writeJson(filePath, value);
  return status === "hit"
    ? { status: "hit", reason: "content-hash-match", firstDifference: null }
    : { status: "miss", reason: "input-or-compiler-change", firstDifference: difference?.path || "$" };
}

function nativeProxyAvailability(manifestPath) {
  return (proxy = {}, shader = {}) => {
    const assetPath = String(proxy.assetPath || "");
    const expected = String(proxy.assetSha256 || "").replace(/^sha256:/i, "").toLowerCase();
    const sourcePath = String(shader.source || "");
    const expectedSource = String(shader.sourceHash || proxy.sourceHash || "").replace(/^sha256:/i, "").toLowerCase();
    if (!assetPath || !expected || !sourcePath || !expectedSource) return false;
    const musicVizRoot = path.resolve(path.dirname(manifestPath), "../..");
    const candidates = [
      proxy.repositoryPath ? path.resolve(musicVizRoot, String(proxy.repositoryPath)) : "",
      assetPath.startsWith("/static/") ? path.resolve(musicVizRoot, "web", assetPath.replace(/^\/static\//, "")) : "",
      path.isAbsolute(assetPath) ? assetPath : path.resolve(path.dirname(manifestPath), assetPath),
      path.resolve(musicVizRoot, assetPath.replace(/^\/+/, "")),
    ].filter(Boolean);
    const filePath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!filePath) return false;
    const sourceCandidates = [
      sourcePath.startsWith("/static/") ? path.resolve(musicVizRoot, "web", sourcePath.replace(/^\/static\//, "")) : "",
      path.isAbsolute(sourcePath) ? sourcePath : path.resolve(path.dirname(manifestPath), sourcePath),
      path.resolve(musicVizRoot, sourcePath.replace(/^\/+/, "")),
    ].filter(Boolean);
    const sourceFilePath = sourceCandidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!sourceFilePath) return false;
    const assetMatches = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") === expected;
    const sourceMatches = crypto.createHash("sha256").update(fs.readFileSync(sourceFilePath)).digest("hex") === expectedSource;
    return assetMatches && sourceMatches;
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.project) throw new Error("--project is required");
  if (!options.output) throw new Error("--output is required");
  const recipeNames = options.recipe === "all"
    ? Object.keys(DEFAULT_VARIANT_RECIPES)
    : options.recipe.split(",").map((value) => value.trim()).filter(Boolean);
  const unknownRecipes = recipeNames.filter((recipe) => !DEFAULT_VARIANT_RECIPES[recipe]);
  if (unknownRecipes.length) throw new Error(`Unknown --recipe ${unknownRecipes.join(", ")}; expected all or ${Object.keys(DEFAULT_VARIANT_RECIPES).join(", ")}`);
  const projectPath = path.resolve(options.project);
  const outputDir = path.resolve(options.output);
  const sourceProject = readJson(projectPath);
  const avatarRoot = path.resolve(options.avatarRoot);
  const selectedCutPreflight = preflightEchoDirectionCut({
    project: sourceProject,
    sourcePath: projectPath,
    avatarRoot,
  });
  const mediaPreflight = assertEchoMediaPreflight({
    schemaVersion: ECHO_MEDIA_PREFLIGHT_SCHEMA,
    scope: "selected-project-or-cut",
    songId: selectedCutPreflight.songId,
    songTitle: selectedCutPreflight.songTitle,
    ok: selectedCutPreflight.ok,
    cutCount: 1,
    declaredCount: selectedCutPreflight.declaredCount,
    generatedCount: selectedCutPreflight.generatedCount,
    resolvedCount: selectedCutPreflight.resolvedCount,
    unresolvedCount: selectedCutPreflight.unresolvedCount,
    failures: selectedCutPreflight.failures,
    cuts: [selectedCutPreflight],
  });
  const manifestPath = path.resolve(options.manifest);
  const proxyRegistryPath = path.join(path.dirname(manifestPath), "proxies/native-exact-proxies.json");
  const pixelGatePath = path.join(path.resolve(path.dirname(manifestPath), "../.."), "docs/ISF_ALL_SHADER_PIXEL_GATE_REPORT.json");
  const gatedManifest = loadGatedEchoIsfManifest({ manifestPath, pixelGatePath });
  const manifest = hydrateManifestNativeRoutes(gatedManifest.manifest, readJson(proxyRegistryPath, false) || {});
  const { project, shaderRepair } = repairEchoProjectShaders(sourceProject, manifest);
  const nativeProxyAvailable = nativeProxyAvailability(manifestPath);
  const registry = readJson(path.resolve(options.registry), false);
  const stemTelemetry = options.stemTelemetry ? readJson(path.resolve(options.stemTelemetry), false) : null;
  const requestedCount = Math.max(recipeNames.length, Math.floor(options.count || recipeNames.length));
  const recipePlan = Array.from({ length: requestedCount }, (_, index) => ({
    recipe: recipeNames[index % recipeNames.length],
    seed: requestedCount > recipeNames.length ? `${options.seed}:${String(index + 1).padStart(2, "0")}` : options.seed,
    index,
  }));
  const family = recipePlan.map(({ recipe, seed }) => buildDirectorV2Artifacts({
    project,
    sourceProject,
    manifest,
    registry,
    stemTelemetry,
    duration: options.duration,
    recipe,
    seed,
    avatarRoot,
    nativeProxyAvailable,
  }));
  const artifacts = family[0];
  fs.mkdirSync(outputDir, { recursive: true });
  const cueCache = writeJsonWithEvidence(path.join(outputDir, "cue-graph.json"), artifacts.cueGraph);
  const treatmentCache = writeJsonWithEvidence(path.join(outputDir, "editorial-treatment.json"), artifacts.treatment);
  const lyricCache = writeJsonWithEvidence(path.join(outputDir, "lyric-timing.json"), {
    schema: "hapa.echo.lyric-timing-projection.v2",
    songId: artifacts.treatment.songId,
    title: artifacts.treatment.songTitle,
    duration: artifacts.cueGraph.durationSeconds,
    lines: artifacts.cueGraph.lyricCues.map((cue) => ({
      index: Number(cue.id.split(":").at(-1)),
      section: cue.sectionId,
      text: cue.text,
      start: cue.startSeconds,
      end: cue.endSeconds,
      confidence: cue.confidence,
      words: cue.words.map((word) => ({
        text: word.text,
        start: word.startSeconds,
        end: word.endSeconds,
      })),
    })),
    provenance: {
      source: "echo-director-v2-cue-graph",
      cueGraphId: artifacts.cueGraph.cueGraphId,
      truthStatus: artifacts.cueGraph.timingTruth.lyricStatus,
      warnings: artifacts.cueGraph.timingTruth.warnings,
      canonicalClaim: false,
    },
  });
  const variants = family.map((item, index) => {
    const { recipe, seed } = recipePlan[index];
    const variantLabel = requestedCount > recipeNames.length
      ? `${String(index + 1).padStart(2, "0")}-${recipe}`
      : recipe;
    const variantDir = requestedCount === 1 ? outputDir : path.join(outputDir, "variants", variantLabel);
    const graphCache = writeJson(path.join(variantDir, "native-show-graph.json"), item.showGraph);
    const invariantEvidence = {
      timelineContinuity: item.showGraph.tracks[0].cards.every((card, cardIndex, cards) => cardIndex === 0 || card.startSeconds === cards[cardIndex - 1].endSeconds),
      mediaAvailable: item.showGraph.tracks[0].cards.every((card) => card.knockedOut || Boolean(card.media.localPath && fs.existsSync(card.media.localPath))),
      cueGraphReused: item.receipt.cueGraphId === artifacts.cueGraph.cueGraphId,
      treatmentReused: item.receipt.treatmentId === artifacts.treatment.treatmentId,
      semanticAnalysisRuns: 0,
    };
    const enrichedReceipt = {
      ...item.receipt,
      compileEvidence: {
        mode: "local-deterministic-variant-compile",
        treatmentCacheKey: item.treatment.treatmentId,
        semanticAnalysisRuns: 0,
      },
      invariants: invariantEvidence,
    };
    const receiptCache = writeJson(path.join(variantDir, "variant-receipt.json"), enrichedReceipt);
    if (index === 0 && requestedCount > 1) {
      writeJson(path.join(outputDir, "native-show-graph.json"), item.showGraph);
      writeJson(path.join(outputDir, "variant-receipt.json"), enrichedReceipt);
    }
    return {
      recipe,
      seed,
      variantId: item.showGraph.directorV2.variantId,
      variantHash: item.showGraph.directorV2.variantHash,
      relativeGraphPath: path.relative(outputDir, path.join(variantDir, "native-show-graph.json")),
      tracks: item.showGraph.tracks.map((track) => ({ id: track.id, cards: track.cards.length })),
      cache: { graph: graphCache, receipt: receiptCache },
      invariants: invariantEvidence,
    };
  });
  writeJson(path.join(outputDir, "variant-family.json"), {
    schemaVersion: "hapa.echo.variant-family.v2",
    treatmentId: artifacts.treatment.treatmentId,
    cueGraphId: artifacts.cueGraph.cueGraphId,
    sourceProjectHash: artifacts.treatment.sourceProjectHash,
    seed: options.seed,
    requestedCount,
    variants,
  });
  writeJson(path.join(outputDir, "media-preflight-report.json"), mediaPreflight);
  const cueAdapterBase = {
    schemaVersion: "hapa.echo.cue-adapter-fixture.v2",
    cueGraphId: artifacts.cueGraph.cueGraphId,
    durationSeconds: artifacts.cueGraph.durationSeconds,
    cues: artifacts.cueGraph.cues,
  };
  writeJson(path.join(outputDir, "adapters", "native-cue-fixture.json"), {
    ...cueAdapterBase,
    adapter: "native-show-graph.directorV2.cueGraph",
  });
  writeJson(path.join(outputDir, "adapters", "dear-papa-cue-fixture.json"), {
    ...cueAdapterBase,
    adapter: "dear-papa.lossless-director-show-graph",
  });
  writeJson(path.join(outputDir, "adapters", "hyperframes-cue-fixture.json"), {
    ...cueAdapterBase,
    adapter: "hyperframes.director-plan-v2",
  });
  process.stdout.write(`${stableStringify({
    ok: true,
    outputDir,
    treatmentId: artifacts.treatment.treatmentId,
    cueGraphId: artifacts.cueGraph.cueGraphId,
    variants,
    cache: { cueGraph: cueCache, treatment: treatmentCache, lyricProjection: lyricCache },
    stems: artifacts.showGraph.stems.count,
    visualizerTruth: artifacts.showGraph.truth.visualizers,
    timingWarnings: artifacts.receipt.warnings,
    mediaPreflight: {
      ok: mediaPreflight.ok,
      cutCount: mediaPreflight.cutCount,
      declaredCount: mediaPreflight.declaredCount,
      generatedCount: mediaPreflight.generatedCount,
      resolvedCount: mediaPreflight.resolvedCount,
      unresolvedCount: mediaPreflight.unresolvedCount,
    },
  }, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
