export const NATIVE_SHADER_ROUTE_SCHEMA = "hapa.music-viz.native-shader-route.v1";

export const COMPOSITOR_NATIVE_KEYS = Object.freeze([
  "plasma-sparkle",
  "matrix-rain",
  "audio-bars",
]);

const COMPOSITOR_NATIVE_KEY_SET = new Set(COMPOSITOR_NATIVE_KEYS);
const ROUTES = new Set(["exact-native", "hash-bound-exact-proxy", "unsupported"]);

// These are the only manifest ISF identities with an explicitly implemented
// Metal program before nativeRoute was added to every manifest row. This is an
// identity lookup, never a title/category heuristic.
export const DECLARED_NATIVE_SHADER_PORTS = Object.freeze({
  "5e7a7fbe7c113618206de3aa": "plasma-sparkle",
  "5e7a7fe97c113618206de6d4": "matrix-rain",
  "5e7a80467c113618206dee48": "audio-bars",
});

function text(value = "") {
  return String(value ?? "").trim();
}

export function canonicalSha256(value = "") {
  const raw = text(value).toLowerCase();
  const digest = raw.replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(digest) ? `sha256:${digest}` : raw;
}

function normalizedShaderId(value = "") {
  return text(value).replace(/^isf:/i, "").toLowerCase();
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function losses(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return [...new Set(source.map(text).filter(Boolean))].sort();
}

function requestedShader(shader = {}, options = {}) {
  return {
    id: text(shader.id || options.id || (shader.shaderId ? `isf:${shader.shaderId}` : "")),
    title: text(shader.title || options.title),
    sourceHash: canonicalSha256(shader.sourceHash || shader.hash || options.sourceHash || shader.nativeRoute?.requested?.sourceHash),
  };
}

function unsupported(requested, reason, fidelityLoss = ["requested-shader-not-presented"]) {
  return {
    schemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
    requested,
    route: "unsupported",
    status: "unsupported",
    nativeKey: null,
    proxy: null,
    fidelityLoss: losses(fidelityLoss, ["requested-shader-not-presented"]),
    reason: text(reason || "native-route-undeclared"),
    silentDefault: false,
  };
}

function exactNative(requested, nativeKey, reason = "declared-native-metal-port") {
  return {
    schemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
    requested,
    route: "exact-native",
    status: "exact",
    nativeKey,
    proxy: null,
    fidelityLoss: [],
    reason,
    silentDefault: false,
  };
}

function exactProxy(requested, proxy, reason = "hash-bound-exact-proxy-available") {
  return {
    schemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
    requested,
    route: "hash-bound-exact-proxy",
    status: "exact",
    nativeKey: null,
    proxy: {
      assetPath: text(proxy.assetPath),
      assetSha256: canonicalSha256(proxy.assetSha256),
      sourceHash: canonicalSha256(proxy.sourceHash),
      width: finitePositive(proxy.width),
      height: finitePositive(proxy.height),
      frameCount: finitePositive(proxy.frameCount),
      fps: finitePositive(proxy.fps),
    },
    fidelityLoss: [],
    reason,
    silentDefault: false,
  };
}

function routeDeclaration(shader = {}, options = {}) {
  const declaration = options.declaration ?? shader.nativeRoute;
  if (typeof declaration === "string") return { route: declaration };
  return declaration && typeof declaration === "object" ? declaration : null;
}

export function resolveNativeVisualizerRoute(shader = {}, options = {}) {
  const requested = requestedShader(shader, options);
  if (!requested.id) return unsupported(requested, "missing-requested-id", ["immutable-id-missing"]);
  const declaration = routeDeclaration(shader, options);
  const fallbackKey = DECLARED_NATIVE_SHADER_PORTS[normalizedShaderId(requested.id)] || "";

  if (!declaration) {
    return fallbackKey
      ? exactNative(requested, fallbackKey, "legacy-manifest-id-declared-native-metal-port")
      : unsupported(requested, "native-route-undeclared");
  }
  if (declaration.schemaVersion && declaration.schemaVersion !== NATIVE_SHADER_ROUTE_SCHEMA) {
    return unsupported(requested, "native-route-schema-mismatch", ["native-route-invalid"]);
  }
  const declaredRequestedId = text(declaration.requested?.id);
  if (declaredRequestedId && normalizedShaderId(declaredRequestedId) !== normalizedShaderId(requested.id)) {
    return unsupported(requested, "native-route-requested-id-mismatch", ["native-route-invalid"]);
  }
  const route = text(declaration.route).toLowerCase();
  if (!ROUTES.has(route)) return unsupported(requested, "native-route-unrecognized", ["native-route-invalid"]);
  if (route === "unsupported") {
    return unsupported(
      requested,
      declaration.reason || "native-route-undeclared",
      declaration.fidelityLoss?.length ? declaration.fidelityLoss : ["requested-shader-not-presented"],
    );
  }
  if (route === "exact-native") {
    const nativeKey = text(declaration.nativeKey || fallbackKey);
    if (/^intent-/i.test(nativeKey)) return unsupported(requested, "noncanonical-native-intent-key", ["native-key-not-recognized"]);
    if (!COMPOSITOR_NATIVE_KEY_SET.has(nativeKey)) return unsupported(requested, "compositor-native-key-unrecognized", ["native-key-not-recognized"]);
    if (declaration.status && declaration.status !== "exact") return unsupported(requested, "native-route-status-mismatch", ["native-route-invalid"]);
    if (losses(declaration.fidelityLoss).length) return unsupported(requested, "exact-native-route-declares-fidelity-loss", ["native-route-invalid"]);
    return exactNative(requested, nativeKey, declaration.reason || "declared-native-metal-port");
  }

  const proxy = declaration.proxy && typeof declaration.proxy === "object" ? declaration.proxy : null;
  if (!proxy) return unsupported(requested, "exact-proxy-declaration-missing", ["exact-proxy-unavailable"]);
  const proxyShapeValid = Boolean(
    text(proxy.assetPath)
    && text(proxy.assetSha256)
    && text(proxy.sourceHash)
    && finitePositive(proxy.width)
    && finitePositive(proxy.height)
    && finitePositive(proxy.frameCount)
    && finitePositive(proxy.fps),
  );
  if (!proxyShapeValid) return unsupported(requested, "exact-proxy-declaration-invalid", ["exact-proxy-unavailable"]);
  if (!requested.sourceHash || canonicalSha256(proxy.sourceHash) !== requested.sourceHash) {
    return unsupported(requested, "exact-proxy-source-hash-mismatch", ["exact-proxy-unavailable"]);
  }
  if (options.proxyAvailable !== true) return unsupported(requested, "exact-proxy-asset-unavailable", ["exact-proxy-unavailable"]);
  if (declaration.status && declaration.status !== "exact") return unsupported(requested, "native-route-status-mismatch", ["native-route-invalid"]);
  if (losses(declaration.fidelityLoss).length) return unsupported(requested, "exact-proxy-route-declares-fidelity-loss", ["native-route-invalid"]);
  return exactProxy(requested, proxy, declaration.reason || "hash-bound-exact-proxy-available");
}

export function hydrateManifestNativeRoutes(manifest = {}, registry = {}) {
  const proxyById = new Map((registry.proxies || []).map((entry) => [normalizedShaderId(entry.id || entry.shaderId), entry]));
  const failureById = new Map((registry.failures || []).map((entry) => [normalizedShaderId(entry.id || entry.shaderId), entry]));
  const shaders = (manifest.shaders || []).map((shader) => {
    const normalizedId = normalizedShaderId(shader.id || shader.shaderId);
    const proxyEntry = proxyById.get(normalizedId) || null;
    const failureEntry = failureById.get(normalizedId) || null;
    const sourceHash = canonicalSha256(shader.sourceHash || proxyEntry?.sourceHash || failureEntry?.sourceHash || shader.hash);
    const requested = { id: text(shader.id || (shader.shaderId ? `isf:${shader.shaderId}` : "")), title: text(shader.title), sourceHash };
    const explicitPort = DECLARED_NATIVE_SHADER_PORTS[normalizedId] || "";
    const hyperframesProxy = proxyEntry ? {
      assetPath: text(proxyEntry.assetPath),
      repositoryPath: text(proxyEntry.repositoryPath),
      assetSha256: canonicalSha256(proxyEntry.assetSha256),
      sourceHash: canonicalSha256(proxyEntry.sourceHash),
      width: proxyEntry.width,
      height: proxyEntry.height,
      atlasWidth: proxyEntry.atlasWidth,
      atlasHeight: proxyEntry.atlasHeight,
      frameCount: proxyEntry.frameCount,
      fps: proxyEntry.fps,
      frameTimes: Array.isArray(proxyEntry.frameTimes) ? [...proxyEntry.frameTimes] : [],
      controls: proxyEntry.controls && typeof proxyEntry.controls === "object" && !Array.isArray(proxyEntry.controls)
        ? structuredClone(proxyEntry.controls)
        : {},
      imageInputs: Array.isArray(proxyEntry.imageInputs) ? structuredClone(proxyEntry.imageInputs) : [],
      durationSeconds: proxyEntry.durationSeconds,
      fidelityBoundary: text(proxyEntry.fidelityBoundary),
      verified: proxyEntry.verified === true,
    } : null;
    let nativeRoute = null;
    if (explicitPort) {
      nativeRoute = {
        schemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
        requested,
        route: "exact-native",
        status: "exact",
        nativeKey: explicitPort,
        proxy: null,
        fidelityLoss: [],
        reason: "declared-native-metal-port",
        silentDefault: false,
      };
    } else if (shader.nativeRoute && typeof shader.nativeRoute === "object") {
      nativeRoute = {
        ...shader.nativeRoute,
        requested: { ...requested, ...(shader.nativeRoute.requested || {}), sourceHash: canonicalSha256(shader.nativeRoute.requested?.sourceHash || sourceHash) },
        proxy: shader.nativeRoute.proxy ? {
          ...shader.nativeRoute.proxy,
          sourceHash: canonicalSha256(shader.nativeRoute.proxy.sourceHash),
          assetSha256: canonicalSha256(shader.nativeRoute.proxy.assetSha256),
        } : null,
      };
    } else if (proxyEntry) {
      nativeRoute = {
        schemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
        requested,
        route: "hash-bound-exact-proxy",
        status: "exact",
        nativeKey: null,
        proxy: hyperframesProxy,
        fidelityLoss: [],
        reason: text(proxyEntry.reason || "hash-verified-browser-isf-pixels"),
        silentDefault: false,
      };
    } else if (failureEntry) {
      nativeRoute = {
        schemaVersion: NATIVE_SHADER_ROUTE_SCHEMA,
        requested,
        route: "unsupported",
        status: "unsupported",
        nativeKey: null,
        proxy: null,
        fidelityLoss: ["requested-shader-not-presented"],
        reason: text(failureEntry.reason || "browser-isf-proxy-generation-failed"),
        silentDefault: false,
      };
    }
    return { ...shader, sourceHash, ...(nativeRoute ? { nativeRoute } : {}), ...(hyperframesProxy ? { hyperframesProxy } : {}) };
  });
  return {
    ...manifest,
    shaders,
    nativeRouteRegistry: {
      schemaVersion: text(registry.schemaVersion),
      sourceManifestSha256: canonicalSha256(registry.sourceManifestSha256),
      proxyCount: Number(registry.proxies?.length || 0),
      failureCount: Number(registry.failures?.length || 0),
    },
  };
}

export function validateNativeVisualizerRoute(entry = {}) {
  const errors = [];
  if (entry.schemaVersion !== NATIVE_SHADER_ROUTE_SCHEMA) errors.push("schema-version");
  if (!entry.requested || typeof entry.requested !== "object") errors.push("requested");
  if (!text(entry.requested?.id)) errors.push("requested-id");
  if (typeof entry.requested?.title !== "string") errors.push("requested-title");
  if (typeof entry.requested?.sourceHash !== "string") errors.push("requested-source-hash");
  if (!ROUTES.has(entry.route)) errors.push("route");
  if (!Array.isArray(entry.fidelityLoss)) errors.push("fidelity-loss-array");
  if (!text(entry.reason)) errors.push("reason");
  if (entry.silentDefault !== false) errors.push("silent-default");
  if (/^intent-/i.test(text(entry.nativeKey))) errors.push("intent-native-key");
  if (entry.route === "exact-native") {
    if (entry.status !== "exact") errors.push("exact-native-status");
    if (!COMPOSITOR_NATIVE_KEY_SET.has(text(entry.nativeKey))) errors.push("exact-native-key");
    if (entry.proxy !== null) errors.push("exact-native-proxy");
    if (entry.fidelityLoss?.length) errors.push("exact-native-fidelity-loss");
    if (!text(entry.requested?.sourceHash)) errors.push("exact-native-source-hash");
  }
  if (entry.route === "hash-bound-exact-proxy") {
    if (entry.status !== "exact") errors.push("exact-proxy-status");
    if (entry.nativeKey !== null) errors.push("exact-proxy-native-key");
    if (!entry.proxy || typeof entry.proxy !== "object") errors.push("exact-proxy");
    if (!text(entry.proxy?.assetPath) || !text(entry.proxy?.assetSha256)) errors.push("exact-proxy-asset");
    if (!text(entry.proxy?.sourceHash) || entry.proxy?.sourceHash !== entry.requested?.sourceHash) errors.push("exact-proxy-source-hash");
    for (const field of ["width", "height", "frameCount", "fps"]) if (!finitePositive(entry.proxy?.[field])) errors.push(`exact-proxy-${field}`);
    if (entry.fidelityLoss?.length) errors.push("exact-proxy-fidelity-loss");
  }
  if (entry.route === "unsupported") {
    if (entry.status !== "unsupported") errors.push("unsupported-status");
    if (entry.nativeKey !== null) errors.push("unsupported-native-key");
    if (entry.proxy !== null) errors.push("unsupported-proxy");
    if (!entry.fidelityLoss?.length) errors.push("unsupported-fidelity-loss");
  }
  return { ok: errors.length === 0, errors };
}

export function nativeVisualizerRouteCounts(rows = []) {
  const entries = rows.map((row) => row?.visualization?.nativeRoute || row?.nativeRoute || row).filter(Boolean);
  const counts = { total: entries.length, exactNative: 0, exactProxy: 0, unsupported: 0, invalid: 0, intentKeys: 0, silentDefaults: 0 };
  for (const entry of entries) {
    if (entry.route === "exact-native") counts.exactNative += 1;
    else if (entry.route === "hash-bound-exact-proxy") counts.exactProxy += 1;
    else if (entry.route === "unsupported") counts.unsupported += 1;
    if (!validateNativeVisualizerRoute(entry).ok) counts.invalid += 1;
    if (/^intent-/i.test(text(entry.nativeKey))) counts.intentKeys += 1;
    if (entry.silentDefault !== false) counts.silentDefaults += 1;
  }
  return counts;
}
