function clean(value = "") {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function echoShaderManifestCategories(shader = {}) {
  return unique([
    ...(Array.isArray(shader.categories) ? shader.categories : []),
    shader.category,
    shader.hmvCategory,
  ]);
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
  return {
    ...shader,
    id,
    categories,
    manifestEligible,
    legacyApproximation,
    pickerEligible: manifestEligible || legacyApproximation,
    readiness: manifestEligible
      ? "source-verified"
      : legacyApproximation
        ? "legacy-approximation"
        : shader.enabled === false || shader.directorEligible === false
          ? "unsupported"
          : "source-missing",
  };
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
