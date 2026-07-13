import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEchoShaderPickerPreviewCard,
  echoLegacyCanvasApproximation,
  echoShaderManifestCategories,
  echoShaderPickerCategories,
  filterEchoShaderPickerShaders,
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
