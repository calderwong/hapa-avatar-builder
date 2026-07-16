import { buildPortableVisualizerCard } from "./portable-visualizer-card.js";

function clean(value = "") {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

const CANONICAL_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function canonicalSha256(value = "") {
  const hash = clean(value);
  return CANONICAL_SHA256_PATTERN.test(hash) ? hash : "";
}

function exactHyperframesProxyTruth(shader = {}) {
  const proxy = shader.hyperframesProxy && typeof shader.hyperframesProxy === "object"
    ? shader.hyperframesProxy
    : null;
  const sourceHash = canonicalSha256(shader.sourceHash);
  const proxySourceHash = canonicalSha256(proxy?.sourceHash);
  const assetHash = canonicalSha256(proxy?.assetSha256);
  const ready = Boolean(
    proxy
    && proxy.verified === true
    && sourceHash
    && proxySourceHash === sourceHash
    && assetHash
    && clean(proxy.assetPath)
    && Number(proxy.width) > 0
    && Number(proxy.height) > 0
    && Number(proxy.frameCount) > 0
    && Number(proxy.fps) > 0
  );
  return {
    ready,
    sourceHash: proxySourceHash,
    assetSha256: assetHash,
    frameCount: Number(proxy?.frameCount || 0),
    fps: Number(proxy?.fps || 0),
  };
}

export function echoShaderManifestCategories(shader = {}) {
  return unique([
    ...(Array.isArray(shader.categories) ? shader.categories : []),
    shader.category,
    shader.hmvCategory,
  ]);
}

export function echoShaderFinalRenderReadiness(shader = {}) {
  const id = clean(shader.id);
  const source = clean(shader.source);
  const sourceHash = clean(shader.sourceHash);
  const canonicalSourceHash = canonicalSha256(sourceHash);
  const gate = shader.pixelGate && typeof shader.pixelGate === "object" ? shader.pixelGate : {};
  const playableFrameCount = Array.isArray(gate.playableFrameIndices)
    ? gate.playableFrameIndices.filter((value) => Number.isInteger(Number(value)) && Number(value) >= 0).length
    : 0;
  const exactProxy = exactHyperframesProxyTruth(shader);
  const finalRenderReady = Boolean(
    id
    && source
    && canonicalSourceHash
    && shader.enabled !== false
    && shader.directorEligible !== false
    && shader.runtimeEligibility !== "unsupported-quarantine"
    && gate.status === "source-hash-verified"
    && gate.classification === "hash-bound-exact-proxy"
    && gate.compileAttempted === true
    && gate.drawAttempted === true
    && playableFrameCount > 0
    && exactProxy.ready
  );
  let reason = clean(gate.reason);
  if (finalRenderReady) reason = reason || "source-hash-verified-playable-pixel-gate";
  else if (!id) reason = "shader-id-missing";
  else if (!source || !sourceHash) reason = "hash-verified-source-missing";
  else if (!canonicalSourceHash) reason = "source-hash-not-canonical";
  else if (shader.enabled === false || shader.directorEligible === false) reason = "shader-disabled-or-director-ineligible";
  else if (shader.runtimeEligibility === "unsupported-quarantine" || gate.classification === "unsupported-quarantine") reason = reason || "pixel-gate-quarantine";
  else if (!shader.pixelGate) reason = "pixel-gate-truth-missing";
  else if (gate.status !== "source-hash-verified") reason = gate.status || "pixel-gate-source-not-verified";
  else if (gate.classification !== "hash-bound-exact-proxy") reason = gate.classification || "pixel-gate-exact-proxy-unavailable";
  else if (gate.compileAttempted !== true) reason = "pixel-gate-compile-not-attempted";
  else if (gate.drawAttempted !== true) reason = "pixel-gate-draw-not-attempted";
  else if (playableFrameCount === 0) reason = "pixel-gate-has-no-playable-frames";
  else if (!exactProxy.ready) reason = "hyperframes-exact-proxy-missing-or-unverified";
  return {
    finalRenderReady,
    reason,
    status: clean(gate.status),
    classification: clean(gate.classification),
    playableFrameCount,
    exactProxy,
  };
}

export function echoShaderPickerEntry(shader = {}) {
  const id = clean(shader.id);
  const hasVerifiedSource = Boolean(clean(shader.source) && clean(shader.sourceHash));
  const manifestEligible = Boolean(
    id
    && hasVerifiedSource
    && shader.enabled !== false
    && shader.directorEligible !== false
  );
  const legacyApproximation = Boolean(id.startsWith("builtin:") && !hasVerifiedSource);
  const categories = echoShaderManifestCategories(shader);
  const finalRender = echoShaderFinalRenderReadiness(shader);
  return {
    ...shader,
    id,
    categories,
    manifestEligible,
    legacyApproximation,
    pickerEligible: manifestEligible || legacyApproximation,
    finalRenderReady: finalRender.finalRenderReady,
    finalRenderReason: finalRender.reason,
    finalRenderTruth: finalRender,
    readiness: manifestEligible
      ? "source-verified"
      : legacyApproximation
        ? "legacy-approximation"
        : shader.enabled === false || shader.directorEligible === false
          ? "unsupported"
          : "source-missing",
  };
}

function objectValue(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function finiteValue(values, fallback) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return fallback;
}

function cuePortableCard(cue = {}) {
  return objectValue(
    cue.portable_visualizer_card,
    cue.portableVisualizerCard,
    cue.visualization?.card,
  );
}

function shaderControls(shader = {}) {
  const defaults = Object.fromEntries((Array.isArray(shader.inputs) ? shader.inputs : []).flatMap((input) => {
    const name = clean(input?.NAME || input?.name);
    const type = clean(input?.TYPE || input?.type).toLowerCase();
    if (!name || type === "image") return [];
    return [[name, input.DEFAULT ?? input.default ?? (type === "bool" ? false : 0)]];
  }));
  const declared = new Set(Object.keys(defaults));
  const captureControls = objectValue(
    shader.hyperframesProxy?.controls,
    shader.hyperframesProxy?.captureControls,
  );
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(captureControls).filter(([name]) => declared.has(name))),
  };
}

export function buildEchoShaderSelectionUpdate(shader = {}, cue = {}) {
  const entry = echoShaderPickerEntry(shader);
  const previousPortable = cuePortableCard(cue);
  const layer = objectValue(previousPortable.layer);
  const visualizerId = entry.id || "none";
  const visualizerTitle = clean(entry.title) || (visualizerId === "none" ? "None" : visualizerId);
  const finalRenderReady = entry.finalRenderReady === true;
  const passThrough = visualizerId === "none";
  const finalRenderTruth = {
    status: entry.finalRenderTruth.status,
    classification: entry.finalRenderTruth.classification,
    playableFrameCount: entry.finalRenderTruth.playableFrameCount,
    sourceHash: clean(entry.sourceHash),
    exactProxy: entry.finalRenderTruth.exactProxy,
  };
  const base = {
    visualizer_id: visualizerId,
    visualizer_title: visualizerTitle,
    native_status: finalRenderReady
      ? "exact"
      : entry.legacyApproximation
        ? "legacy-approximation"
        : entry.manifestEligible
          ? "browser-source-only"
          : "pass-through",
    finalRenderReady,
    final_render_ready: finalRenderReady,
    final_render_reason: visualizerId === "none"
      ? "pass-through-no-visualizer"
      : entry.finalRenderReason || "final-render-unverified",
    final_render_truth: finalRenderTruth,
    portable_visualizer_card: null,
    disabled: passThrough,
    knocked_out: passThrough,
    knockedOut: passThrough,
  };
  if (visualizerId !== "none" && !finalRenderReady) {
    const error = new Error(`${visualizerTitle} is catalogued but has no verified final-render proxy. Choose a Final render ready shader.`);
    error.code = "echo_shader_not_final_render_ready";
    error.reason = entry.finalRenderReason || "final-render-unverified";
    throw error;
  }
  if (!entry.manifestEligible) return base;

  const stemFocus = clean(
    cue.stem_focus
      || cue.stemFocus
      || cue.parameters?.stemFocus
      || previousPortable.stemFocus
      || "master",
  );
  const portableBase = buildPortableVisualizerCard(entry, {
    controls: shaderControls(entry),
    stemFocus,
    layerRole: clean(cue.layer_role || cue.layerRole || layer.role || "atmosphere"),
    blendMode: clean(cue.blend_mode || cue.blendMode || cue.parameters?.blendMode || layer.blend || "screen"),
    opacity: finiteValue([cue.opacity, cue.parameters?.opacity, layer.opacity], 0.5),
    target: clean(cue.target || cue.parameters?.target || layer.target || "program"),
    mix: finiteValue([cue.mix, cue.parameters?.mix, layer.mix], 1),
    transition: clean(cue.transition || layer.transition || "crossfade"),
    nativeProxyAvailable: Boolean(entry.nativeRoute?.proxy && finalRenderReady),
    hyperframesProxy: entry.hyperframesProxy || null,
    hyperframesProxyAvailable: Boolean(entry.hyperframesProxy && finalRenderReady),
    provenanceSource: "echo-shader-picker-catalog-selection",
  });
  const portable = {
    ...portableBase,
    provenance: {
      ...portableBase.provenance,
      finalRenderReady,
      finalRenderReason: entry.finalRenderReason,
      pixelGate: finalRenderTruth,
    },
  };
  return {
    ...base,
    portable_visualizer_card: portable,
  };
}

export function formatEchoShaderPreviewError(value) {
  const seen = new WeakSet();
  const format = (current, depth = 0) => {
    if (current == null || current === false) return "";
    if (typeof current === "string") return clean(current);
    if (["number", "bigint", "boolean"].includes(typeof current)) return String(current);
    if (current instanceof Error) return clean(current.message || current.name);
    if (typeof current !== "object") return clean(current);
    if (seen.has(current)) return "";
    seen.add(current);
    if (depth >= 3) return "";
    if (Array.isArray(current)) return current.map((item) => format(item, depth + 1)).filter(Boolean).join("; ");
    let entries = [];
    try {
      entries = Object.entries(current);
    } catch {
      return "Shader preview failed without a readable diagnostic.";
    }
    for (const key of ["message", "error", "reason", "detail", "description", "log", "info"]) {
      const match = entries.find(([name]) => name.toLowerCase() === key);
      const rendered = match ? format(match[1], depth + 1) : "";
      if (rendered) return rendered;
    }
    const rendered = entries.slice(0, 4).map(([key, nested]) => {
      const detail = format(nested, depth + 1);
      return detail ? `${key.replace(/[_-]+/g, " ")}: ${detail}` : "";
    }).filter(Boolean).join(" · ");
    return rendered || "Shader preview failed without a readable diagnostic.";
  };
  return format(value);
}

export function echoShaderPickerCategories(shaders = []) {
  return unique(
    shaders
      .map(echoShaderPickerEntry)
      .filter((shader) => shader.pickerEligible)
      .flatMap((shader) => shader.categories),
  ).sort((left, right) => left.localeCompare(right));
}

export function filterEchoShaderPickerShaders(shaders = [], { query = "", category = "all" } = {}) {
  const needle = clean(query).toLowerCase();
  const categoryNeedle = clean(category).toLowerCase();
  return shaders
    .map(echoShaderPickerEntry)
    .filter((shader) => shader.pickerEligible)
    .filter((shader) => categoryNeedle === "" || categoryNeedle === "all"
      || shader.categories.some((value) => value.toLowerCase() === categoryNeedle))
    .filter((shader) => {
      if (!needle) return true;
      return [
        shader.id,
        shader.shaderId,
        shader.title,
        shader.author,
        shader.credit,
        shader.shaderType,
        shader.hmvRole,
        shader.hmvDescription,
        ...shader.categories,
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
}

export function buildEchoShaderPickerPreviewCard(shader = {}) {
  const entry = echoShaderPickerEntry(shader);
  if (!entry.manifestEligible) return null;
  return {
    id: `echo-picker-preview:${entry.id}`,
    startSeconds: 0,
    endSeconds: 3600,
    transition: "cut",
    parameters: {
      opacity: 1,
      mix: 1,
      blendMode: "normal",
      target: "preview",
    },
    visualization: {
      sourceId: entry.id,
      sourceHash: entry.sourceHash,
      card: {
        id: entry.id,
        title: entry.title || entry.id,
        source: {
          url: entry.source,
          hash: entry.sourceHash,
          bytes: Number(entry.sourceBytes || 0),
        },
        controls: {},
        audioMap: entry.audioMap || {},
        stemFocus: "master",
        layer: {
          opacity: 1,
          mix: 1,
          blend: "normal",
          target: "preview",
          transition: "cut",
        },
      },
    },
    provenance: {
      renderer: "echo-picker-source-preview",
      sourceId: entry.id,
      sourceHash: entry.sourceHash,
    },
  };
}

const LEGACY_CANVAS_BY_ID = Object.freeze({
  "builtin:spectrum-nebula": "spectrum-nebula",
  "builtin:waveform-horizon": "waveform-horizon",
  "builtin:beat-grid-pulse": "beat-grid-pulse",
  "builtin:particle-storm": "particle-storm",
  "builtin:cymatic-rings": "cymatic-rings",
  "builtin:liquid-aurora": "liquid-aurora",
  "builtin:starfield-warp": "starfield-warp",
  "builtin:kaleido-bloom": "kaleido-bloom",
});

const LEGACY_CANVAS_KEYWORDS = Object.freeze([
  ["matrix-rain", /matrix|rain|code/],
  ["liquid-metal", /liquid metal|fluid|metal|water|underwater/],
  ["rgb-halftone", /halftone|rgb|cmyk|color chords|dot/],
  ["ascii-art", /ascii|terminal|console|scanline|glitch|broken|lcd/],
  ["spectrum-nebula", /nebula|galaxy|cosmos|space|flare|spectrum/],
  ["waveform-horizon", /horizon|waveform|linescape|wave/],
  ["beat-grid-pulse", /grid|pulse|beat|cell|circuit/],
  ["particle-storm", /particle|storm|star|dust|flots/],
  ["cymatic-rings", /cymatic|ring|circle|orb|vortex/],
  ["liquid-aurora", /aurora|ribbon|flow|variation/],
  ["starfield-warp", /warp|hyperspace|tunnel|streak|extrude|box|tesseract|cube/],
  ["kaleido-bloom", /kaleido|bloom|flower|mandala|fractal|sponge|sketch|draw|cartoon/],
]);

export function echoLegacyCanvasApproximation(value = {}) {
  const id = clean(value.id || value.visualizer_id || value.sourceId);
  const title = clean(value.title || value.visualizer_title);
  const exactBuiltinMode = LEGACY_CANVAS_BY_ID[id] || "";
  const keywordMode = LEGACY_CANVAS_KEYWORDS.find(([, pattern]) => pattern.test(title.toLowerCase()))?.[0] || "";
  const mode = exactBuiltinMode || keywordMode;
  if (!mode) {
    return {
      supported: false,
      mode: "",
      reason: "legacy-title-and-id-not-recognized",
      match: "none",
    };
  }
  return {
    supported: true,
    mode,
    reason: exactBuiltinMode ? "legacy-builtin-id-canvas-approximation" : "legacy-title-keyword-canvas-approximation",
    match: exactBuiltinMode ? "builtin-id" : "title-keyword",
  };
}
