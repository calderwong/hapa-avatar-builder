import {
  canonicalSha256,
  resolveNativeVisualizerRoute,
  validateNativeVisualizerRoute,
} from "./native-visualizer-route.js";
import {
  VISUALIZER_AUDIO_HEADROOM_POLICY,
  VISUALIZER_AUDIO_REACTIVE_SIGNALS,
  inspectVisualizerAudioMappingEffect,
  normalizeVisualizerAudioInputValue,
  normalizeVisualizerAudioMapping,
} from "./hyperframes-visualizer-runtime.js";

export const PORTABLE_VISUALIZER_CARD_SCHEMA = "hapa.visualizer-card.v2";

const CANONICAL_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function text(value = "") {
  return String(value ?? "").trim();
}

/**
 * Portable visualizer attachments are render identities, not loose labels.
 * Keep this stricter than canonicalSha256(): stored card truth must already be
 * the normalized lowercase `sha256:<64 hex>` representation.
 */
export function canonicalPortableVisualizerSourceHash(value = "") {
  const declared = text(value);
  return CANONICAL_SHA256_PATTERN.test(declared) ? declared : "";
}

/**
 * Validates the identity binding between a requested visualization and its
 * frozen portable card. Accepts either a cue (`{ visualization }`) or the
 * visualization declaration itself (`{ sourceId, card }`).
 */
export function inspectPortableVisualizerAttachment(value = {}) {
  const visualization = value?.visualization && typeof value.visualization === "object"
    ? value.visualization
    : value;
  const card = visualization?.card && typeof visualization.card === "object"
    ? visualization.card
    : null;
  const requestedIds = [...new Set([
    text(visualization?.sourceId),
    text(visualization?.requestedSourceId),
  ].filter(Boolean))];
  const cardId = text(card?.id);
  const sourceUri = text(card?.source?.uri);
  const sourceHash = text(card?.source?.hash);
  const errors = [];
  if (card?.schemaVersion !== PORTABLE_VISUALIZER_CARD_SCHEMA) errors.push("schema-version");
  if (!cardId) errors.push("id");
  if (!requestedIds.length) errors.push("requested-source-id");
  if (cardId && requestedIds.some((requestedId) => requestedId !== cardId)) errors.push("requested-source-id-mismatch");
  if (!sourceUri) errors.push("source-uri");
  if (!canonicalPortableVisualizerSourceHash(sourceHash)) errors.push("source-hash");
  return {
    ok: errors.length === 0,
    errors,
    requestedSourceId: requestedIds[0] || null,
    requestedSourceIds: requestedIds,
    cardId: cardId || null,
    sourceUri: sourceUri || null,
    sourceHash: sourceHash || null,
    card,
  };
}

export function isPortableVisualizerAttachment(value = {}) {
  return inspectPortableVisualizerAttachment(value).ok;
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function portableVisualizerSourceHash(shader = {}, options = {}) {
  return String(shader.sourceHash || shader.hash || options.sourceHash || stableHash(JSON.stringify({
    source: shader.source || options.source || "",
    inputs: Array.isArray(shader.inputs) ? shader.inputs : [],
    audioMap: shader.audioMap && typeof shader.audioMap === "object" ? shader.audioMap : {},
  })));
}

function generatedAudioMap(audioMap = {}, inputs = []) {
  const inputByName = new Map(inputs.map((input) => [String(input.NAME || input.name || ""), input]));
  return Object.fromEntries(Object.entries(audioMap).map(([uniform, rawMapping]) => {
    const normalized = normalizeVisualizerAudioMapping(rawMapping, {
      input: inputByName.get(uniform),
      generated: true,
      materializeDepth: false,
    });
    return [uniform, normalized ?? rawMapping];
  }));
}

export function buildPortableVisualizerCard(shader = {}, options = {}) {
  const inputs = Array.isArray(shader.inputs) ? shader.inputs : [];
  const controls = options.controls || {};
  const audioMap = generatedAudioMap(shader.audioMap && typeof shader.audioMap === "object" ? shader.audioMap : {}, inputs);
  const signals = [...new Set(Object.values(audioMap).map((row) => String(row?.signal || "off")).filter((signal) => signal !== "off"))];
  const manifestBacked = Boolean(shader.id && shader.source);
  const sourceHash = portableVisualizerSourceHash(shader, options);
  const nativeRoute = options.nativeRoute || resolveNativeVisualizerRoute(shader, {
    sourceHash,
    proxyAvailable: options.nativeProxyAvailable === true,
  });
  const nativeSupport = {
    route: nativeRoute.route,
    status: nativeRoute.status,
    fidelity: nativeRoute.route === "exact-native"
      ? "declared-native-metal-port"
      : nativeRoute.route === "hash-bound-exact-proxy"
        ? "hash-bound-exact-proxy"
        : "native-route-unsupported",
    reason: nativeRoute.reason,
    nativeKey: nativeRoute.nativeKey,
    proxy: nativeRoute.proxy,
    fidelityLoss: nativeRoute.fidelityLoss,
    unsupported: nativeRoute.fidelityLoss,
  };
  const hyperframesProxy = options.hyperframesProxy || shader.hyperframesProxy || null;
  const hyperframesProxyValid = Boolean(
    hyperframesProxy
    && options.hyperframesProxyAvailable === true
    && canonicalSha256(hyperframesProxy.sourceHash) === canonicalSha256(sourceHash)
    && hyperframesProxy.assetPath
    && hyperframesProxy.assetSha256
    && Number(hyperframesProxy.width) > 0
    && Number(hyperframesProxy.height) > 0
    && Number(hyperframesProxy.frameCount) > 0
    && Number(hyperframesProxy.fps) > 0,
  );
  const hyperframesSupport = options.hyperframesRoute
    ? {
      route: options.hyperframesRoute,
      fidelity: options.hyperframesFidelity || "declared-hyperframes-route",
      reason: options.hyperframesReason || "declared-hyperframes-route",
      fidelityLoss: options.hyperframesUnsupported || [],
      unsupported: options.hyperframesUnsupported || [],
    }
    : hyperframesProxyValid
      ? {
        route: "hash-bound-exact-proxy",
        fidelity: "hash-bound-exact-proxy-frames",
        reason: "verified-proxy-instance-executor",
        fidelityLoss: [],
        unsupported: [],
      }
      : {
        route: "unsupported",
        fidelity: "visualizer-instance-proxy-unavailable",
        reason: hyperframesProxy ? "visualizer-instance-proxy-unverified" : "visualizer-instance-proxy-undeclared",
        fidelityLoss: ["visualizer-instance-execution"],
        unsupported: ["visualizer-instance-execution"],
      };
  return {
    schemaVersion: PORTABLE_VISUALIZER_CARD_SCHEMA,
    id: String(shader.id || options.id || ""),
    title: String(shader.title || options.title || shader.id || "Untitled visualizer"),
    source: {
      uri: String(shader.source || options.source || ""),
      hash: sourceHash,
      truthStatus: manifestBacked ? "manifest-source-reference" : "missing-source-reference",
    },
    rendererSupport: {
      musicVizBrowser: manifestBacked
        ? { route: "exact-browser-isf", fidelity: "hash-verified-isf-source", reason: "shared-isf-runtime", unsupported: [] }
        : { route: "unsupported", fidelity: "source-missing", reason: "manifest-source-reference-missing", unsupported: ["source"] },
      echoAvatarBuilder: manifestBacked
        ? { route: "exact-browser-isf", fidelity: "hash-verified-isf-source", reason: "shared-isf-runtime", unsupported: [] }
        : { route: "unsupported", fidelity: "source-missing", reason: "manifest-source-reference-missing", unsupported: ["source"] },
      echoTarot: manifestBacked
        ? { route: "exact-browser-isf", fidelity: "hash-verified-isf-source", reason: "shared-isf-runtime", unsupported: [] }
        : { route: "unsupported", fidelity: "source-missing", reason: "manifest-source-reference-missing", unsupported: ["source"] },
      musicVizNative: nativeSupport,
      dearPapaNative: {
        route: options.dearPapaRoute || "unsupported",
        fidelity: options.dearPapaFidelity || "native-route-undeclared",
        reason: options.dearPapaReason || "native-route-undeclared",
        unsupported: options.dearPapaUnsupported || ["native-route"],
      },
      hyperframes: hyperframesSupport,
    },
    nativeRoute,
    hyperframesProxy,
    inputs,
    controls,
    audioMap,
    stemFocus: String(options.stemFocus || "master"),
    audioSignal: signals,
    layer: {
      role: String(options.layerRole || "atmosphere"),
      opacity: Number(options.opacity ?? 0.5),
      blend: String(options.blendMode || "screen"),
      target: String(options.target || "program"),
      mix: Number(options.mix ?? 1),
      transition: String(options.transition || "crossfade"),
    },
    automation: Object.entries(audioMap).map(([uniform, mapping]) => ({
      uniform,
      signal: String(mapping?.signal || "off"),
      depth: mapping?.depth ?? mapping?.depthFraction ?? mapping?.depth_fraction ?? 0,
      depthMode: String(mapping?.depthMode || mapping?.depth_mode || "absolute"),
      depthFraction: mapping?.depthFraction ?? mapping?.depth_fraction ?? null,
      headroomPolicy: mapping?.headroomPolicy ?? mapping?.headroom_policy ?? null,
      direction: mapping?.direction ?? null,
      stemFocus: String(mapping?.stemFocus || mapping?.stem_focus || options.stemFocus || "master"),
    })),
    provenance: {
      source: String(options.provenanceSource || "music-viz-isf-manifest"),
      manifestId: String(shader.id || ""),
      generatedPlaceholder: false,
    },
  };
}

export function validatePortableVisualizerCard(card = {}) {
  const errors = [];
  if (card.schemaVersion !== PORTABLE_VISUALIZER_CARD_SCHEMA) errors.push("schema-version");
  if (!card.id) errors.push("id");
  if (!card.source?.uri) errors.push("source-uri");
  if (!canonicalPortableVisualizerSourceHash(card.source?.hash)) errors.push("source-hash");
  for (const uniform of Object.keys(card.audioMap || {})) {
    if (!(card.inputs || []).some((input) => input.NAME === uniform)) errors.push(`audio-map-input-missing:${uniform}`);
  }
  for (const [uniform, mapping] of Object.entries(card.audioMap || {})) {
    const input = (card.inputs || []).find((candidate) => String(candidate.NAME || candidate.name || "") === uniform);
    const enforced = Boolean(input)
      && VISUALIZER_AUDIO_REACTIVE_SIGNALS.has(String(mapping?.signal || "").toLowerCase())
      && String(mapping?.headroomPolicy || mapping?.headroom_policy || "") === VISUALIZER_AUDIO_HEADROOM_POLICY;
    if (!enforced) continue;
    const declared = input.DEFAULT ?? input.default;
    const baseValue = normalizeVisualizerAudioInputValue(input, Object.hasOwn(card.controls || {}, uniform) ? card.controls[uniform] : declared);
    if (!inspectVisualizerAudioMappingEffect(input, baseValue, mapping).material) errors.push(`audio-map-ineffective:${uniform}`);
  }
  for (const [renderer, support] of Object.entries(card.rendererSupport || {})) {
    if (!["exact-native", "exact-browser-isf", "exact-proxy", "hash-bound-exact-proxy", "executed-offline-instance", "approximate-native", "browser-proxy", "pending", "unsupported"].includes(support.route)) errors.push(`renderer-route:${renderer}`);
    if (["pending", "unsupported"].includes(support.route) && !(support.unsupported || []).length) errors.push(`pending-without-loss-report:${renderer}`);
  }
  const nativeRoute = validateNativeVisualizerRoute(card.nativeRoute);
  if (!nativeRoute.ok) errors.push(...nativeRoute.errors.map((error) => `native-route:${error}`));
  if (card.nativeRoute?.requested?.id !== card.id) errors.push("native-route:requested-id-mismatch");
  if (card.nativeRoute?.requested?.sourceHash !== card.source?.hash) errors.push("native-route:source-hash-mismatch");
  if (card.rendererSupport?.musicVizNative?.route !== card.nativeRoute?.route) errors.push("native-route:support-route-mismatch");
  if (card.rendererSupport?.musicVizNative?.nativeKey !== card.nativeRoute?.nativeKey) errors.push("native-route:support-key-mismatch");
  if (card.rendererSupport?.hyperframes?.route === "executed-offline-instance") {
    if (!card.hyperframesProxy) errors.push("hyperframes-proxy:missing");
    if (canonicalSha256(card.hyperframesProxy?.sourceHash) !== canonicalSha256(card.source?.hash)) errors.push("hyperframes-proxy:source-hash-mismatch");
    for (const field of ["width", "height", "frameCount", "fps"]) if (!(Number(card.hyperframesProxy?.[field]) > 0)) errors.push(`hyperframes-proxy:${field}`);
  }
  return { ok: errors.length === 0, errors };
}
