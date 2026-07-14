import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

test("album Director v2 hydration covers every Echo project with executable visualizer cards", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-album-hydration-test-"));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const file = path.join(output, "album-hydration-report.json");
  const compiled = spawnSync(process.execPath, ["scripts/compile-echo-director-v2-album.mjs", "--output", output], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
  assert.equal(fs.existsSync(file), true, "album hydration report must be freshly compiled");
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(report.schemaVersion, "hapa.echo.director-v2-album-hydration.v2");
  assert.equal(report.projectCount, 79);
  assert.equal(report.passingProjects, 79);
  assert.equal(report.ok, true);
  assert.deepEqual(report.mediaPreflight, {
    schemaVersion: "hapa.echo.director-media-preflight.v1",
    ok: true,
    projectCount: 79,
    cutCount: 477,
    declaredCount: 27001,
    generatedCount: 6869,
    resolvedCount: 20132,
    unresolvedCount: 0,
  });
  assert.equal(report.sourceCueCount, 791);
  assert.equal(report.validClippedCueCount, 791);
  assert.equal(report.receiptCount, 791);
  assert.equal(report.visualizerCardCount, 791);
  assert.equal(report.executableLayerCount, 791);
  assert.equal(report.rejectedVisualizerCount, 0);
  assert.equal(report.exactIdCount, 791);
  assert.equal(report.titleFallbackCount, 0);
  assert.equal(report.sourceCueOverrideCount, 12);
  assert.equal(report.sourceClippedDuration, 17035.08);
  assert.equal(report.compiledDuration, report.sourceClippedDuration);
  assert.equal(report.maxConcurrentLayers, 1);
  assert.equal(report.pureIVFSlots, report.knockedOutMediaCards);
  assert.equal(report.nativeShaderRoutes.schemaVersion, "hapa.echo.album-native-shader-route-report.v1");
  assert.equal(report.nativeShaderRoutes.ok, true);
  assert.deepEqual(report.nativeShaderRoutes.routeCounts, {
    total: 791,
    exactNative: 11,
    exactProxy: 780,
    unsupported: 0,
    invalid: 0,
    intentKeys: 0,
    silentDefaults: 0,
  });
  assert.equal(report.nativeShaderRoutes.accountedCardCount, 791);
  assert.equal(report.nativeShaderRoutes.silentFilteredCardCount, 0);
  assert.equal(report.shaderRepair.replacementCount, 88);
  assert.ok(report.shaderRepair.repairedProjectCount > 0);
  assert.equal(report.shaderRepair.unresolvedQuarantineCount, 0);
  assert.ok(report.projects.every((project) => project.shaderRepair.ok));
  assert.ok(report.projects.every((project) => project.sourceCueCount === project.receiptCount));
  assert.ok(report.projects.every((project) => project.validClippedCueCount === project.visualizerCardCount));
  assert.ok(report.projects.every((project) => project.exactIdCount === project.visualizerCardCount));
  assert.ok(report.projects.every((project) => project.maxConcurrentLayers <= project.configuredMaxConcurrentLayers));
  assert.ok(report.projects.every((project) => project.endpointMismatches.length === 0));
  assert.ok(report.projects.every((project) => project.identityMismatches.length === 0));
  assert.ok(report.projects.every((project) => project.missingAccounting.length === 0));
  assert.ok(report.projects.every((project) => project.invalidCards.length === 0));
  assert.ok(report.projects.every((project) => project.nativeRouteCounts.total === project.visualizerCardCount));
  assert.ok(report.projects.every((project) => project.nativeRouteCounts.invalid === 0 && project.nativeRouteCounts.intentKeys === 0 && project.nativeRouteCounts.silentDefaults === 0));
  assert.ok(report.projects.every((project) => project.nativeRouteErrors.length === 0 && project.nativeIntentKeyCount === 0));

  const routeFile = path.join(output, "native-shader-route-report.json");
  assert.equal(fs.existsSync(routeFile), true, "native shader route report must be freshly compiled");
  const routes = JSON.parse(fs.readFileSync(routeFile, "utf8"));
  assert.equal(routes.schemaVersion, "hapa.echo.album-native-shader-route-report.v1");
  assert.equal(routes.ok, true);
  assert.equal(routes.cueCardCount, 791);
  assert.equal(routes.accountedCardCount, 791);
  assert.equal(routes.silentFilteredCardCount, 0);
  assert.equal(routes.uniqueSourceIdCount, 162);
  assert.equal(routes.proxyRegistryCounts.proxyCount, 163);
  assert.equal(routes.proxyRegistryCounts.failureCount, 19);
  assert.deepEqual(routes.verification, {
    exactProxyRequiresAvailableAsset: true,
    exactProxyRequiresSourceSha256Match: true,
    exactProxyRequiresAssetSha256Match: true,
    verifiedExactProxyCueCount: 780,
  });
  assert.deepEqual(routes.compositorNativeKeys, ["plasma-sparkle", "matrix-rain", "audio-bars"]);
  assert.ok(routes.sourceRoutes.every((source) => source.routes.length === 1));
  assert.ok(routes.sourceRoutes.flatMap((source) => source.routes).every((route) => ["exact-native", "hash-bound-exact-proxy", "unsupported"].includes(route.route)));
  assert.ok(routes.sourceRoutes.flatMap((source) => source.routes).filter((route) => route.route === "exact-native").every((route) => routes.compositorNativeKeys.includes(route.nativeKey)));
  assert.equal(routes.sourceRoutes.filter((source) => source.routes[0].route === "exact-native").length, 3);
  assert.equal(routes.sourceRoutes.filter((source) => source.routes[0].route === "hash-bound-exact-proxy").length, 159);
  assert.equal(routes.sourceRoutes.filter((source) => source.routes[0].route === "unsupported").length, 0);
  assert.deepEqual(routes.shaderRepair, report.shaderRepair);

  const proxyProject = report.projects.find((project) => project.nativeRouteCounts.exactProxy > 0);
  const proxyGraph = JSON.parse(fs.readFileSync(path.join(proxyProject.directory, "native-show-graph.json"), "utf8"));
  const proxyCard = proxyGraph.tracks[1].cards.find((card) => card.visualization.nativeRoute.route === "hash-bound-exact-proxy");
  const proxyRoute = proxyCard.visualization.nativeRoute;
  const musicVizRoot = "/Users/calderwong/Desktop/hapa-music-viz";
  const routePath = (uri) => path.resolve(musicVizRoot, "web", String(uri).replace(/^\/static\//, ""));
  const sha256 = (filePath) => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
  assert.equal(sha256(routePath(proxyCard.visualization.card.source.uri)), proxyRoute.requested.sourceHash);
  assert.equal(sha256(routePath(proxyRoute.proxy.assetPath)), proxyRoute.proxy.assetSha256);
  assert.ok([proxyRoute.proxy.width, proxyRoute.proxy.height, proxyRoute.proxy.frameCount, proxyRoute.proxy.fps].every((value) => Number(value) > 0));
});
