import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSITOR_NATIVE_KEYS,
  NATIVE_SHADER_ROUTE_SCHEMA,
  canonicalSha256,
  hydrateManifestNativeRoutes,
  nativeVisualizerRouteCounts,
  resolveNativeVisualizerRoute,
  validateNativeVisualizerRoute,
} from "../src/domain/native-visualizer-route.js";
import { buildPortableVisualizerCard, validatePortableVisualizerCard } from "../src/domain/portable-visualizer-card.js";

test("only exact manifest identities resolve to compositor-recognized Metal keys", () => {
  const exact = resolveNativeVisualizerRoute({
    id: "isf:5e7a7fe97c113618206de6d4",
    title: "Matrix Rain",
    sourceHash: "sha256:matrix-source",
  });
  assert.equal(exact.schemaVersion, NATIVE_SHADER_ROUTE_SCHEMA);
  assert.equal(exact.route, "exact-native");
  assert.equal(exact.status, "exact");
  assert.equal(exact.nativeKey, "matrix-rain");
  assert.ok(COMPOSITOR_NATIVE_KEYS.includes(exact.nativeKey));
  assert.deepEqual(exact.fidelityLoss, []);
  assert.deepEqual(validateNativeVisualizerRoute(exact), { ok: true, errors: [] });

  const titleLookalike = resolveNativeVisualizerRoute({
    id: "isf:not-the-matrix-port",
    title: "Matrix Rain Audio Plasma",
    sourceHash: "sha256:lookalike",
  });
  assert.equal(titleLookalike.route, "unsupported");
  assert.equal(titleLookalike.nativeKey, null);
  assert.equal(titleLookalike.reason, "native-route-undeclared");
  assert.equal(titleLookalike.silentDefault, false);
});

test("manifest declarations override legacy ports and reject intent or unknown compositor keys", () => {
  const explicitUnsupported = resolveNativeVisualizerRoute({
    id: "isf:5e7a7fbe7c113618206de3aa",
    sourceHash: "sha256:source",
    nativeRoute: { route: "unsupported", status: "unsupported", reason: "operator-disabled-native-port", fidelityLoss: ["requested-shader-not-presented"] },
  });
  assert.equal(explicitUnsupported.route, "unsupported");
  assert.equal(explicitUnsupported.reason, "operator-disabled-native-port");

  const intent = resolveNativeVisualizerRoute({
    id: "isf:any",
    sourceHash: "sha256:any",
    nativeRoute: { route: "exact-native", status: "exact", nativeKey: "intent-any-title", fidelityLoss: [] },
  });
  assert.equal(intent.route, "unsupported");
  assert.equal(intent.reason, "noncanonical-native-intent-key");
  const unknown = resolveNativeVisualizerRoute({
    id: "isf:any",
    sourceHash: "sha256:any",
    nativeRoute: { route: "exact-native", status: "exact", nativeKey: "generic-random-look", fidelityLoss: [] },
  });
  assert.equal(unknown.route, "unsupported");
  assert.equal(unknown.reason, "compositor-native-key-unrecognized");
});

test("hash-bound exact proxies require a complete matching declaration and an available verified asset", () => {
  const shader = {
    id: "isf:proxy",
    title: "Exact proxy",
    sourceHash: "sha256:source",
    nativeRoute: {
      schemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
      route: "hash-bound-exact-proxy",
      status: "exact",
      nativeKey: null,
      fidelityLoss: [],
      proxy: {
        assetPath: "proxies/isf-proxy.mov",
        assetSha256: "sha256:asset",
        sourceHash: "sha256:source",
        width: 1920,
        height: 1080,
        frameCount: 300,
        fps: 30,
      },
    },
  };
  const unavailable = resolveNativeVisualizerRoute(shader, { proxyAvailable: false });
  assert.equal(unavailable.route, "unsupported");
  assert.equal(unavailable.reason, "exact-proxy-asset-unavailable");
  const exact = resolveNativeVisualizerRoute(shader, { proxyAvailable: true });
  assert.equal(exact.route, "hash-bound-exact-proxy");
  assert.equal(exact.nativeKey, null);
  assert.deepEqual(validateNativeVisualizerRoute(exact), { ok: true, errors: [] });
  const mismatch = resolveNativeVisualizerRoute({
    ...shader,
    nativeRoute: { ...shader.nativeRoute, proxy: { ...shader.nativeRoute.proxy, sourceHash: "sha256:different" } },
  }, { proxyAvailable: true });
  assert.equal(mismatch.route, "unsupported");
  assert.equal(mismatch.reason, "exact-proxy-source-hash-mismatch");
});

test("portable cards mirror native route truth and route accounting cannot silently drop unsupported cards", () => {
  const exactCard = buildPortableVisualizerCard({
    id: "isf:5e7a80467c113618206dee48",
    title: "Audio Bars",
    source: "/audio-bars.fs",
    sourceHash: "sha256:audio-source",
  });
  const unsupportedCard = buildPortableVisualizerCard({
    id: "isf:unknown",
    title: "Unknown",
    source: "/unknown.fs",
    sourceHash: "sha256:unknown-source",
  });
  assert.equal(validatePortableVisualizerCard(exactCard).ok, true);
  assert.equal(validatePortableVisualizerCard(unsupportedCard).ok, true);
  assert.deepEqual(exactCard.rendererSupport.musicVizNative, {
    route: "exact-native",
    status: "exact",
    fidelity: "declared-native-metal-port",
    reason: "legacy-manifest-id-declared-native-metal-port",
    nativeKey: "audio-bars",
    proxy: null,
    fidelityLoss: [],
    unsupported: [],
  });
  assert.equal(unsupportedCard.rendererSupport.musicVizNative.route, "unsupported");
  const counts = nativeVisualizerRouteCounts([exactCard, unsupportedCard]);
  assert.deepEqual(counts, {
    total: 2,
    exactNative: 1,
    exactProxy: 0,
    unsupported: 1,
    invalid: 0,
    intentKeys: 0,
    silentDefaults: 0,
  });
});

test("proxy registry hydration canonicalizes hashes and keeps real Metal ports ahead of proxy rows", () => {
  const hash = "a".repeat(64);
  const assetHash = "b".repeat(64);
  const manifest = { shaders: [
    { id: "isf:5e7a7fbe7c113618206de3aa", title: "Metal first", source: "/metal.fs" },
    { id: "isf:proxy-row", title: "Proxy", source: "/proxy.fs" },
    { id: "isf:failure-row", title: "Failure", source: "/failure.fs" },
  ] };
  const registry = {
    schemaVersion: "hapa.music-viz.native-exact-proxy-registry.v1",
    sourceManifestSha256: "c".repeat(64),
    proxies: [
      { id: "isf:5e7a7fbe7c113618206de3aa", sourceHash: hash, assetPath: "/static/isf/proxies/metal.png", repositoryPath: "web/isf/proxies/metal.png", assetSha256: assetHash, width: 160, height: 90, frameCount: 8, fps: 4 },
      { id: "isf:proxy-row", sourceHash: hash, assetPath: "/static/isf/proxies/proxy.png", repositoryPath: "web/isf/proxies/proxy.png", assetSha256: assetHash, width: 160, height: 90, frameCount: 8, fps: 4 },
    ],
    failures: [{ id: "isf:failure-row", sourceHash: hash, route: "unsupported", reason: "browser-isf-compile-or-draw-failed" }],
  };
  const hydrated = hydrateManifestNativeRoutes(manifest, registry);
  assert.equal(canonicalSha256(hash), `sha256:${hash}`);
  assert.equal(hydrated.shaders[0].nativeRoute.route, "exact-native");
  assert.equal(hydrated.shaders[0].nativeRoute.nativeKey, "plasma-sparkle");
  assert.equal(hydrated.shaders[1].sourceHash, `sha256:${hash}`);
  assert.equal(hydrated.shaders[1].nativeRoute.proxy.sourceHash, `sha256:${hash}`);
  assert.equal(hydrated.shaders[1].nativeRoute.proxy.assetSha256, `sha256:${assetHash}`);
  assert.equal(hydrated.shaders[1].nativeRoute.proxy.repositoryPath, "web/isf/proxies/proxy.png");
  assert.equal(resolveNativeVisualizerRoute(hydrated.shaders[1], { proxyAvailable: true }).route, "hash-bound-exact-proxy");
  assert.equal(hydrated.shaders[2].nativeRoute.route, "unsupported");
  assert.equal(hydrated.shaders[2].nativeRoute.reason, "browser-isf-compile-or-draw-failed");
});
