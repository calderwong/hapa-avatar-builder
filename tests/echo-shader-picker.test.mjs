import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEchoShaderPickerPreviewCard,
  buildEchoShaderSelectionUpdate,
  echoLegacyCanvasApproximation,
  echoShaderFinalRenderReadiness,
  echoShaderManifestCategories,
  echoShaderPickerCategories,
  filterEchoShaderPickerShaders,
  formatEchoShaderPreviewError,
} from "../src/domain/echo-shader-picker.js";

function manifestShader(index, patch = {}) {
  return {
    id: `isf:${index}`,
    title: `Shader ${index}`,
    shaderType: index % 2 ? "filter" : "generator",
    categories: index % 2 ? ["Stylize"] : ["Generator"],
    hmvCategory: index % 3 ? "Beat Motion Filters" : "ASCII Filters",
    hmvRole: index % 2 ? "filter" : "generator",
    hmvDescription: `Manifest shader ${index}`,
    source: `/api/echos/shader-source?id=isf:${index}`,
    sourceHash: `sha256:${String(index).padStart(64, "0")}`,
    sourceBytes: 100 + index,
    directorEligible: true,
    enabled: true,
    inputs: [],
    audioMap: {},
    ...patch,
  };
}

function exactProxy(index, controls = {}) {
  return {
    assetPath: `/static/isf/proxies/${index}.png`,
    assetSha256: `sha256:${"f".repeat(64)}`,
    sourceHash: `sha256:${String(index).padStart(64, "0")}`,
    width: 160,
    height: 90,
    frameCount: 8,
    fps: 4,
    controls,
    verified: true,
  };
}

function playablePixelGate() {
  return {
    status: "source-hash-verified",
    classification: "hash-bound-exact-proxy",
    compileAttempted: true,
    drawAttempted: true,
    playableFrameIndices: [0, 2, 4],
    reason: "hash-verified-browser-isf-playable-pixels",
  };
}

test("Echo shader picker returns every eligible manifest shader without an 80-row cap", () => {
  const shaders = Array.from({ length: 182 }, (_, index) => manifestShader(index + 1));
  assert.equal(filterEchoShaderPickerShaders(shaders).length, 182);
});

test("Echo shader picker searches and filters canonical manifest category fields", () => {
  const shaders = [
    manifestShader(1, { title: "One", categories: ["Stylize"], hmvCategory: "Beat Motion Filters" }),
    manifestShader(2, { title: "Two", categories: ["Generator"], hmvCategory: "ASCII Filters" }),
  ];
  assert.deepEqual(echoShaderManifestCategories(shaders[0]), ["Stylize", "Beat Motion Filters"]);
  assert.deepEqual(echoShaderPickerCategories(shaders), ["ASCII Filters", "Beat Motion Filters", "Generator", "Stylize"]);
  assert.deepEqual(filterEchoShaderPickerShaders(shaders, { query: "beat motion" }).map((row) => row.id), ["isf:1"]);
  assert.deepEqual(filterEchoShaderPickerShaders(shaders, { category: "ASCII Filters" }).map((row) => row.id), ["isf:2"]);
});

test("disabled and source-less manifest rows are ineligible while named built-ins stay explicit legacy approximations", () => {
  const exact = manifestShader(1);
  const disabled = manifestShader(2, { enabled: false });
  const missing = manifestShader(3, { sourceHash: "" });
  const legacy = { id: "builtin:waveform-horizon", title: "Waveform Horizon", shaderType: "generator" };
  const rows = filterEchoShaderPickerShaders([exact, disabled, missing, legacy]);
  assert.deepEqual(rows.map((row) => [row.id, row.readiness]), [
    ["isf:1", "source-verified"],
    ["builtin:waveform-horizon", "legacy-approximation"],
  ]);
});

test("source-backed picker preview cards retain exact ID and hash", () => {
  const shader = manifestShader(7, { audioMap: { amount: { signal: "rms", depth: 0.4 } } });
  const card = buildEchoShaderPickerPreviewCard(shader);
  assert.equal(card.visualization.sourceId, shader.id);
  assert.equal(card.visualization.sourceHash, shader.sourceHash);
  assert.equal(card.visualization.card.source.hash, shader.sourceHash);
  assert.equal(card.visualization.card.audioMap.amount.signal, "rms");
  assert.equal(buildEchoShaderPickerPreviewCard({ id: "builtin:spectrum-nebula" }), null);
});

test("picker selection carries a catalog-backed portable card and preserves cue settings", () => {
  const shader = manifestShader(9, {
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.25 }],
    audioMap: { gain: { signal: "rms", depth: 0.4 } },
    pixelGate: playablePixelGate(),
    hyperframesProxy: exactProxy(9, { gain: 0.25 }),
  });
  const update = buildEchoShaderSelectionUpdate(shader, {
    opacity: 0.72,
    blend_mode: "overlay",
    transition: "dissolve",
    stem_focus: "drums",
    visualizer_controls: { gain: 0.8, removedUniform: 1 },
  });
  assert.equal(update.finalRenderReady, true);
  assert.equal(update.final_render_ready, true);
  assert.equal(update.native_status, "exact");
  assert.equal(update.portable_visualizer_card.schemaVersion, "hapa.visualizer-card.v2");
  assert.equal(update.portable_visualizer_card.id, shader.id);
  assert.equal(update.portable_visualizer_card.source.uri, shader.source);
  assert.equal(update.portable_visualizer_card.source.hash, shader.sourceHash);
  assert.deepEqual(update.portable_visualizer_card.controls, { gain: 0.25 });
  assert.equal(update.portable_visualizer_card.stemFocus, "drums");
  assert.equal(update.portable_visualizer_card.layer.opacity, 0.72);
  assert.equal(update.portable_visualizer_card.layer.blend, "overlay");
  assert.equal(update.portable_visualizer_card.layer.transition, "dissolve");
  assert.equal(update.portable_visualizer_card.provenance.finalRenderReady, true);
  assert.equal(update.portable_visualizer_card.provenance.pixelGate.classification, "hash-bound-exact-proxy");
});

test("final-render readiness comes from playable, source-verified pixel-gate truth", () => {
  const sourceOnly = manifestShader(10);
  const ready = manifestShader(11, {
    pixelGate: playablePixelGate(),
    hyperframesProxy: exactProxy(11),
  });
  const missingProxy = manifestShader(14, { pixelGate: playablePixelGate() });
  const quarantined = manifestShader(12, {
    runtimeEligibility: "unsupported-quarantine",
    pixelGate: {
      status: "source-hash-verified",
      classification: "unsupported-quarantine",
      compileAttempted: true,
      drawAttempted: true,
      playableFrameIndices: [],
      reason: "compile failed",
    },
  });
  assert.equal(echoShaderFinalRenderReadiness(sourceOnly).finalRenderReady, false);
  assert.equal(echoShaderFinalRenderReadiness(ready).finalRenderReady, true);
  assert.equal(echoShaderFinalRenderReadiness(missingProxy).reason, "hyperframes-exact-proxy-missing-or-unverified");
  assert.equal(echoShaderFinalRenderReadiness(quarantined).finalRenderReady, false);
  const nonCanonicalHash = manifestShader(16, {
    sourceHash: `sha256:${"A".repeat(64)}`,
    pixelGate: playablePixelGate(),
    hyperframesProxy: {
      ...exactProxy(16),
      sourceHash: `sha256:${"A".repeat(64)}`,
    },
  });
  assert.equal(echoShaderFinalRenderReadiness(nonCanonicalHash).finalRenderReady, false);
  assert.equal(echoShaderFinalRenderReadiness(nonCanonicalHash).reason, "source-hash-not-canonical");
});

test("pass-through disables the cue and a zero-control shader cannot inherit stale uniforms", () => {
  const none = buildEchoShaderSelectionUpdate({ id: "none", title: "None" }, {
    portable_visualizer_card: { controls: { staleGain: 1 } },
  });
  assert.equal(none.disabled, true);
  assert.equal(none.knocked_out, true);
  assert.equal(none.knockedOut, true);
  assert.equal(none.portable_visualizer_card, null);

  const shader = manifestShader(13, {
    inputs: [],
    pixelGate: playablePixelGate(),
    hyperframesProxy: exactProxy(13),
  });
  const selected = buildEchoShaderSelectionUpdate(shader, {
    visualizer_controls: { staleGain: 1 },
  });
  assert.deepEqual(selected.portable_visualizer_card.controls, {});
  assert.equal(selected.disabled, false);
  assert.equal(selected.knocked_out, false);
  assert.equal(selected.knockedOut, false);
});

test("preview-only shaders cannot create a detached editor selection", () => {
  assert.throws(
    () => buildEchoShaderSelectionUpdate(manifestShader(15, { pixelGate: playablePixelGate() })),
    (error) => error?.code === "echo_shader_not_final_render_ready"
      && error?.reason === "hyperframes-exact-proxy-missing-or-unverified",
  );
});

test("preview diagnostics turn structured errors into readable text", () => {
  assert.equal(formatEchoShaderPreviewError({ error: { message: "Uniform gain failed to compile" } }), "Uniform gain failed to compile");
  assert.equal(formatEchoShaderPreviewError({ code: "compile_error", stage: "fragment" }), "code: compile_error · stage: fragment");
  assert.notEqual(formatEchoShaderPreviewError({ reason: { code: "bad_source" } }), "[object Object]");
});

test("legacy canvas approximation maps only deliberate IDs or keywords and has no Spectrum default", () => {
  assert.deepEqual(echoLegacyCanvasApproximation({ id: "builtin:waveform-horizon", title: "Anything" }), {
    supported: true,
    mode: "waveform-horizon",
    reason: "legacy-builtin-id-canvas-approximation",
    match: "builtin-id",
  });
  assert.equal(echoLegacyCanvasApproximation({ id: "legacy:x", title: "Matrix Rain" }).mode, "matrix-rain");
  assert.deepEqual(echoLegacyCanvasApproximation({ id: "legacy:unknown", title: "Unmapped Personal Look" }), {
    supported: false,
    mode: "",
    reason: "legacy-title-and-id-not-recognized",
    match: "none",
  });
});
