import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { echoLegacyCanvasApproximation } from "../src/domain/echo-shader-picker.js";
import { resolveVisualizerRendererTruth } from "../src/domain/visualizer-renderer-capability.js";

const echoSource = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
const tarotSource = fs.readFileSync("src/components/TarotDraw3DView.jsx", "utf8");

function exactCard() {
  return {
    id: "card:b:4",
    startSeconds: 12,
    endSeconds: 18,
    visualization: {
      sourceId: "isf:exact-4",
      card: {
        id: "isf:exact-4",
        title: "Exact Four",
        source: { uri: "/static/isf/shaders/exact-4.fs", hash: "sha256:four", truthStatus: "manifest-source-reference" },
        rendererSupport: {
          musicVizBrowser: { route: "browser-proxy", unsupported: [] },
          echoTarot: { route: "browser-proxy", unsupported: [] },
        },
      },
    },
  };
}

test("same-shader last-good pixels are a named fallback, not a compile error", () => {
  const truth = resolveVisualizerRendererTruth(exactCard(), "echo-avatar-builder", {
    runtimeStatus: "draw-error",
    fallback: {
      id: "isf:exact-4@last-good-frame",
      title: "isf:exact-4 last good frame",
      route: "last-good-frame-hold",
    },
  });
  assert.equal(truth.status, "fallback");
  assert.equal(truth.substitute.id, "isf:exact-4@last-good-frame");
  assert.equal(truth.reason, "draw-error");
  assert.match(echoSource, /heldPreviousFrame && presentedId\s*\n\s*\? \{ id: `\$\{presentedId\}@last-good-frame`/);
  assert.match(tarotSource, /heldPreviousFrame && presentedId\s*\n\s*\? \{ id: `\$\{presentedId\}@last-good-frame`/);
});

test("legacy unknown titles are unsupported and never acquire a Spectrum default", () => {
  assert.equal(echoLegacyCanvasApproximation({ id: "legacy:unknown", title: "Personal Look 77" }).supported, false);
  assert.doesNotMatch(echoSource, /Fallback default[\s\S]{0,80}spectrum-nebula/i);
  assert.doesNotMatch(tarotSource, /function echoDirectorShaderMode[\s\S]{0,900}return "spectrum-nebula"/);
  assert.match(echoSource, /UNSUPPORTED LEGACY VISUALIZER/);
  assert.match(tarotSource, /No generic shader substitute was rendered/);
});

test("Echo and Tarot expose exact, approximation, fallback, compile-error, and unsupported truth in overlays and receipts", () => {
  for (const token of [
    "data-echo-renderer-truth",
    "data-echo-renderer-requested-id",
    "data-echo-renderer-substitute-id",
    "data-echo-renderer-reason",
    "data-echo-renderer-silent-default",
    "rendererTruthReceipt",
  ]) assert.match(echoSource, new RegExp(token));
  for (const token of [
    "drawTarotRendererTruthBadge",
    "rendererTruthReceipt",
    "rendererSilentDefault",
    "hapa.echo-tarot.legacy-renderer-frame-receipt.v1",
  ]) assert.match(tarotSource, new RegExp(token));
});

test("Echo picker renders a source-backed compile preview and keeps the complete eligible result set", () => {
  assert.match(echoSource, /createEchoIsfSurface/);
  assert.match(echoSource, /EchoShaderSourcePreview/);
  assert.match(echoSource, /data-echo-shader-preview-status/);
  assert.match(echoSource, /All manifest categories/);
  assert.match(echoSource, /no result cap/);
  assert.match(echoSource, /buildEchoShaderSelectionUpdate\(shader, activeVisualizerItem\)/);
  assert.match(echoSource, /FINAL RENDER READY/);
  assert.match(echoSource, /SOURCE AVAILABLE · FINAL RENDER UNAVAILABLE/);
  assert.match(echoSource, /LEGACY APPROXIMATION · NOT FINAL READY/);
  assert.match(echoSource, /disabled=\{!shader\.finalRenderReady\}/);
  assert.match(echoSource, /data-echo-shader-selection-blocker/);
  assert.match(echoSource, /Choose a Final render ready shader/);
  assert.match(echoSource, /formatEchoShaderPreviewError\(next\.error\)/);
  assert.doesNotMatch(echoSource, /error: String\(next\.error/);
  assert.doesNotMatch(echoSource, /filteredShaderOptions[\s\S]{0,500}\.slice\(0, 80\)/);
});
