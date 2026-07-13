export const VISUALIZER_RENDERER_TRUTH_SCHEMA = "hapa.visualizer-renderer-truth.v1";
export const VISUALIZER_RENDERER_RECEIPT_SCHEMA = "hapa.visualizer-renderer-truth-receipt.v1";
export const VISUALIZER_RENDERER_STATUSES = Object.freeze(["exact", "approximation", "compile-error", "unsupported", "fallback"]);
export const VISUALIZER_RENDERER_READINESS = Object.freeze(["ready", "cold", "loading", "error", "unavailable"]);

export const VISUALIZER_RENDERERS = Object.freeze([
  "echo-avatar-builder",
  "echo-tarot",
  "music-viz-browser",
  "music-viz-native",
  "dear-papa-native",
  "hyperframes",
]);

const RENDERER_ALIASES = Object.freeze({
  echoAvatarBuilder: "echo-avatar-builder",
  "echo-avatar-builder": "echo-avatar-builder",
  echoTarot: "echo-tarot",
  "echo-tarot": "echo-tarot",
  musicVizBrowser: "music-viz-browser",
  "music-viz-browser": "music-viz-browser",
  musicVizNative: "music-viz-native",
  "music-viz-native": "music-viz-native",
  dearPapaNative: "dear-papa-native",
  "dear-papa-native": "dear-papa-native",
  hyperframes: "hyperframes",
});

const SUPPORT_KEYS = Object.freeze({
  "echo-avatar-builder": ["echoAvatarBuilder", "musicVizBrowser"],
  "echo-tarot": ["echoTarot", "musicVizBrowser"],
  "music-viz-browser": ["musicVizBrowser"],
  "music-viz-native": ["musicVizNative"],
  "dear-papa-native": ["dearPapaNative"],
  hyperframes: ["hyperframes"],
});

const EXACT_ROUTES = new Set([
  "exact-browser-isf",
  "exact-native",
  "exact-proxy",
  "hash-bound-exact-proxy",
  "executed-offline-instance",
  "precompiled-exact",
]);
const APPROXIMATION_ROUTES = new Set([
  "approximate-native",
  "supported-subset",
  "supported-pass-subset",
  "manifest-native-subset",
]);
const UNSUPPORTED_ROUTES = new Set(["pending", "unsupported", "none", ""]);
const RUNTIME_ERRORS = new Set([
  "compile-error",
  "draw-error",
  "input-error",
  "hash-error",
  "missing-id",
  "source-error",
]);

function runtimeReadiness(status = "") {
  if (status === "ready") return "ready";
  if (RUNTIME_ERRORS.has(status)) return "error";
  if (/loading|pending|prewarm|handoff/.test(status)) return "loading";
  if (/unsupported|missing|unavailable/.test(status)) return "unavailable";
  return "cold";
}

function portableCard(value = {}) {
  return value?.visualization?.card || value?.card || value;
}

function requestedId(value = {}, card = portableCard(value)) {
  return String(
    value?.visualization?.sourceId
    || value?.sourceId
    || value?.shaderId
    || card?.id
    || "",
  );
}

function cueBoundary(value = {}, override = null) {
  const source = override || value || {};
  const startSeconds = Number(source.startSeconds ?? source.start ?? source.fromSeconds);
  const endSeconds = Number(source.endSeconds ?? source.end ?? source.toSeconds);
  return {
    startSeconds: Number.isFinite(startSeconds) ? startSeconds : null,
    endSeconds: Number.isFinite(endSeconds) ? endSeconds : null,
  };
}

function cleanLosses(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(String).filter(Boolean))].sort();
}

function supportFor(card, rendererId, declaration = null) {
  if (declaration && typeof declaration === "object") return declaration;
  const support = card?.rendererSupport || {};
  for (const key of SUPPORT_KEYS[rendererId] || []) {
    if (support[key] && typeof support[key] === "object") return support[key];
  }
  return null;
}

function substituteFrom(value = null, route = "") {
  if (!value) return null;
  if (typeof value === "string") return { id: value, title: value, route: route || "declared-substitute" };
  const id = String(value.id || value.key || value.nativeKey || value.sourceId || "");
  if (!id) return null;
  return {
    id,
    title: String(value.title || id),
    route: String(value.route || route || "declared-substitute"),
  };
}

export function canonicalVisualizerRendererId(value = "") {
  return RENDERER_ALIASES[String(value)] || String(value || "unknown-renderer");
}

export function resolveVisualizerRendererTruth(value = {}, renderer = "", options = {}) {
  const rendererId = canonicalVisualizerRendererId(renderer);
  const rendererKnown = VISUALIZER_RENDERERS.includes(rendererId);
  const card = portableCard(value);
  const id = requestedId(value, card);
  const sourceHash = String(card?.source?.hash || value?.visualization?.sourceHash || value?.sourceHash || "");
  const sourceTruth = String(card?.source?.truthStatus || "missing-source-reference");
  const support = supportFor(card, rendererId, options.declaration);
  const runtimeStatus = String(options.runtimeStatus || options.runtime?.status || "").toLowerCase();
  const declaredRoute = String(options.route || support?.route || "").toLowerCase();
  const declaredNativeKey = String(support?.nativeKey || value?.visualization?.nativeKey || value?.nativeKey || "");
  const explicitFallback = substituteFrom(options.fallback || options.runtime?.fallback || support?.fallback, declaredRoute);
  const declaredSubstitute = substituteFrom(support?.substitute || declaredNativeKey, declaredRoute);
  const losses = cleanLosses([
    ...(support?.unsupported || []),
    ...(support?.fidelityLoss || []),
  ]);
  const requested = {
    id,
    title: String(card?.title || value?.visualization?.title || value?.title || id || "Unknown visualizer"),
    sourceHash,
    cueBoundary: cueBoundary(value, options.cueBoundary),
  };
  const base = {
    schemaVersion: VISUALIZER_RENDERER_TRUTH_SCHEMA,
    rendererId,
    requested,
    status: "unsupported",
    readiness: runtimeReadiness(runtimeStatus),
    route: declaredRoute || "unsupported",
    substitute: null,
    reason: "",
    fidelityLoss: losses,
    visible: true,
    silentDefault: false,
  };

  if (!rendererKnown) return { ...base, readiness: "unavailable", reason: "unknown-renderer", fidelityLoss: cleanLosses([...losses, "renderer-not-declared"]) };
  if (!id) return { ...base, readiness: "unavailable", reason: "missing-requested-id", fidelityLoss: cleanLosses([...losses, "immutable-id-missing"]) };
  if (RUNTIME_ERRORS.has(runtimeStatus)) {
    if (explicitFallback) {
      return {
        ...base,
        status: "fallback",
        readiness: "ready",
        route: explicitFallback.route,
        substitute: explicitFallback,
        reason: runtimeStatus,
        fidelityLoss: cleanLosses([...losses, "requested-shader-not-presented", "pixel-equivalence-not-verified"]),
      };
    }
    return { ...base, status: "compile-error", readiness: "error", reason: runtimeStatus, fidelityLoss: cleanLosses([...losses, "requested-shader-not-presented"]) };
  }
  if (explicitFallback) {
    return {
      ...base,
      status: "fallback",
      readiness: "ready",
      route: explicitFallback.route,
      substitute: explicitFallback,
      reason: String(options.reason || support?.reason || "explicit-safe-fallback"),
      fidelityLoss: cleanLosses([...losses, "substitute-rendered"]),
    };
  }
  if (!support) return { ...base, readiness: "unavailable", reason: "renderer-support-undeclared", fidelityLoss: cleanLosses([...losses, "renderer-route-undeclared"]) };
  if (/^intent-/.test(declaredNativeKey)) {
    return {
      ...base,
      readiness: "unavailable",
      route: "unsupported",
      reason: "noncanonical-native-intent-key",
      fidelityLoss: cleanLosses([...losses, "native-key-not-recognized", "requested-shader-not-presented"]),
    };
  }
  if (declaredRoute === "browser-proxy" && ["echo-avatar-builder", "echo-tarot", "music-viz-browser"].includes(rendererId)) {
    if (sourceTruth !== "manifest-source-reference" || !card?.source?.uri) {
      return { ...base, readiness: "unavailable", route: "unsupported", reason: "manifest-source-reference-missing", fidelityLoss: cleanLosses([...losses, "source"] ) };
    }
    return {
      ...base,
      status: "exact",
      route: "exact-browser-isf",
      reason: runtimeStatus === "ready" ? "exact-source-drawn" : "exact-source-declared",
      fidelityLoss: [],
    };
  }
  if (EXACT_ROUTES.has(declaredRoute)) {
    const reason = declaredRoute === "exact-browser-isf"
      ? runtimeStatus === "ready" ? "exact-source-drawn" : "exact-source-declared"
      : runtimeStatus === "ready" ? "declared-route-drawn" : "declared-exact-route";
    return { ...base, status: "exact", reason, fidelityLoss: losses };
  }
  if (APPROXIMATION_ROUTES.has(declaredRoute)) {
    if (!declaredSubstitute) {
      return {
        ...base,
        readiness: "unavailable",
        route: "unsupported",
        reason: "approximation-substitute-undeclared",
        fidelityLoss: cleanLosses([...losses, "substitute-route-undeclared"]),
      };
    }
    return {
      ...base,
      status: "approximation",
      readiness: declaredSubstitute ? "ready" : base.readiness,
      substitute: declaredSubstitute,
      reason: rendererId === "music-viz-native" ? "declared-native-substitute" : String(support?.reason || "declared-renderer-approximation"),
      fidelityLoss: cleanLosses(losses.length ? losses : ["pixel-equivalence-not-verified"]),
    };
  }
  if (UNSUPPORTED_ROUTES.has(declaredRoute)) {
    return {
      ...base,
      readiness: "unavailable",
      route: "unsupported",
      reason: String(support?.reason || (declaredRoute === "pending" ? "renderer-route-pending" : "renderer-route-unsupported")),
      fidelityLoss: cleanLosses(losses.length ? losses : ["requested-shader-not-presented"]),
    };
  }
  return {
    ...base,
    readiness: "unavailable",
    route: "unsupported",
    reason: "unknown-renderer-route",
    fidelityLoss: cleanLosses([...losses, `unknown-route:${declaredRoute}`]),
  };
}

export function validateVisualizerRendererTruth(truth = {}) {
  const errors = [];
  if (truth.schemaVersion !== VISUALIZER_RENDERER_TRUTH_SCHEMA) errors.push("schema-version");
  if (!VISUALIZER_RENDERER_STATUSES.includes(truth.status)) errors.push("status");
  if (!VISUALIZER_RENDERER_READINESS.includes(truth.readiness)) errors.push("readiness");
  if (!truth.rendererId) errors.push("renderer-id");
  if (!truth.requested?.id) errors.push("requested-id");
  if (!truth.route) errors.push("route");
  if (!truth.reason) errors.push("reason");
  if (!Array.isArray(truth.fidelityLoss)) errors.push("fidelity-loss-array");
  if (truth.visible !== true) errors.push("not-visible");
  if (truth.silentDefault !== false) errors.push("silent-default");
  if (["approximation", "fallback"].includes(truth.status) && !truth.substitute?.id) errors.push("substitute-id");
  if (truth.substitute && !truth.substitute.route) errors.push("substitute-route");
  if (truth.status === "exact" && truth.fidelityLoss?.length) errors.push("exact-with-fidelity-loss");
  return { ok: errors.length === 0, errors };
}

export function visualizerRendererTruthMatrix(value = {}, options = {}) {
  return Object.fromEntries(VISUALIZER_RENDERERS.map((rendererId) => [
    rendererId,
    resolveVisualizerRendererTruth(value, rendererId, options[rendererId] || {}),
  ]));
}

export function buildVisualizerRendererTruthReceipt(value = {}, options = {}) {
  const truth = visualizerRendererTruthMatrix(value, options);
  const rows = Object.values(truth);
  return {
    schemaVersion: VISUALIZER_RENDERER_RECEIPT_SCHEMA,
    requestedId: rows[0]?.requested?.id || "",
    requestedSourceHash: rows[0]?.requested?.sourceHash || "",
    cueBoundary: rows[0]?.requested?.cueBoundary || { startSeconds: null, endSeconds: null },
    renderers: truth,
    allStatesVisible: rows.every((row) => row.visible === true),
    silentDefaultCount: rows.filter((row) => row.silentDefault === true).length,
    unresolvedRendererIds: rows.filter((row) => row.status === "unsupported").map((row) => row.rendererId),
    ok: rows.every((row) => validateVisualizerRendererTruth(row).ok),
  };
}
