import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import {
  createEchoIsfPlaybackPool,
  visualizerLookaheadCards,
} from "../src/domain/echo-isf-browser-runtime.js";

const source = fs.readFileSync(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return String(body); },
  };
}

function poolShader(id) {
  const sourceText = `/*${id}*/ void main(){ gl_FragColor=vec4(1.0); }`;
  return {
    id,
    title: id,
    shaderType: "generator",
    source: `/shader/${encodeURIComponent(id)}`,
    sourceText,
    sourceHash: `sha256:${sha256(sourceText)}`,
    sourceBytes: Buffer.byteLength(sourceText),
    runtime: "/runtime.js?sha256=runtime",
    runtimeHash: "sha256:runtime",
    inputs: [],
    audioMap: {},
  };
}

function poolCard(id, index) {
  return {
    id: `card-${index}`,
    sourceCueIndex: index,
    startSeconds: index * 4,
    endSeconds: index * 4 + 4,
    visualization: {
      sourceId: id,
      layerIndex: 0,
      card: { id, inputs: [], audioMap: {}, stemFocus: "master", layer: { opacity: 1, mix: 1, blend: "normal", target: "program" } },
    },
    parameters: { opacity: 1, blendMode: "normal", target: "program" },
  };
}

function poolDependencies(rows) {
  return {
    fetch: async (url) => {
      if (String(url).endsWith("/api/echos/shaders")) return response(rows);
      const row = rows.find((candidate) => String(url).includes(candidate.source));
      return row ? response(row.sourceText) : response({}, 404);
    },
    sha256,
    createCanvas: (width, height) => ({
      width,
      height,
      getContext: () => ({ getExtension: () => null }),
    }),
    loadRuntime: async () => ({ Renderer: class {} }),
    createRenderer: () => ({
      valid: true,
      loadSource(value) { this.source = value; },
      setValue() {},
      draw(canvas) { canvas.lastSource = this.source; },
      cleanup() {},
    }),
  };
}

test("Tarot uses one bounded three-surface pool and prewarms current plus lookahead", () => {
  assert.match(source, /createEchoIsfPlaybackPool/);
  assert.match(source, /visualizerLookaheadCards/);
  const poolPath = between("function ensureTarotExactIsfPlaybackPool", "function drawTarotExactIsfDiagnostic");
  assert.match(poolPath, /maxSurfaces: 3/);
  assert.match(poolPath, /cards\.filter/);
  assert.match(poolPath, /\.slice\(0, 3\)/);
  assert.match(poolPath, /pool\.prewarm\(\{ cards: exactCards, cacheKey \}\)/);
  assert.match(source, /visualizerLookaheadCards\(graph, clock, 3\)/);
  assert.match(source, /exactIsfPlaybackPool\?\.dispose\?\.\(\)/);
  assert.doesNotMatch(source, /exactIsfSurface:/);
});

test("Tarot invalidates shader caches only for graph variant, hashes, or dirty ranges", () => {
  const graphKey = between("function echoDirectorGraphPlaybackCacheKey", "function echoDirectorGraphVisualizerState");
  assert.match(graphKey, /variantHash/);
  assert.match(graphKey, /sourceProjectHash/);
  assert.match(graphKey, /dirtyRanges/);
  assert.doesNotMatch(graphKey, /clock|currentTime|sourceCueIndex/);
  const invalidation = between("function invalidateTarotExactIsfPoolForGraph", "function prewarmTarotExactIsfCards");
  assert.match(invalidation, /overlay\.exactIsfGraphCacheKey === cacheKey/);
  assert.match(invalidation, /pool\.invalidate\(\{ cacheKey: overlay\.exactIsfGraphCacheKey, dirtyRanges \}\)/);
});

test("Tarot holds the last presented canvas through compilation, input, and draw failures", () => {
  const drawPath = between("function drawTarotExactIsfOverlay", "function resizeEchoDirectorOverlayForScreen");
  assert.match(drawPath, /pool\.present\(card,/);
  assert.match(drawPath, /heldPreviousFrame \? overlay\.exactIsfLastPresentedCanvas/);
  assert.match(drawPath, /overlay\.exactIsfLastPresentedCanvas = result\.canvas/);
  assert.match(drawPath, /holding-last-frame:/);
  assert.match(drawPath, /holding-last-frame-draw-error/);
  assert.match(drawPath, /ctx\.drawImage\(overlay\.exactIsfLastPresentedCanvas/);
  assert.match(drawPath, /drawTarotExactIsfDiagnostic/);
  // Black is valid as a bounded underlay in a successful composition. Exercise
  // the failure branches below rather than forbidding this color everywhere.
  const draw = vm.runInNewContext(`(${drawPath})`, {
    performance: { now: () => 0 }, ECHO_ISF_DIAGNOSTIC_RECEIPT_LIMIT: 10,
    THREE: { MathUtils: { clamp: (n, min, max) => Math.max(min, Math.min(max, n)) } },
    setTarotExactIsfStatus: (overlay, value) => { overlay.exactIsfStatus = value; },
    tarotExactRendererTruth: () => ({ truth: {}, receipt: {} }),
    drawTarotRendererTruthBadge() {},
    drawTarotExactIsfDiagnostic: () => { throw new Error("an available previous frame must be held"); },
    echoDirectorTransitionOpacityForSource: () => 1,
    masterSignalFrameFromDropZone: () => ({}),
  });
  const previous = { id: "previous-frame" }, next = { id: "next-frame" };
  const card = { visualization: { sourceId: "shader-next", card: { layer: {} } } };
  for (const mode of ["compiling", "media-wait", "draw-error", "held-result", "ready"]) {
    const calls = [];
    const ctx = { save() {}, restore() {}, drawImage: canvas => calls.push(["draw", canvas]), fillRect: () => calls.push(["fill"]) };
    const overlay = { canvas: { width: 320, height: 180 }, ctx, exactIsfLastPresentedCanvas: previous, exactIsfFrameReceipts: [], exactIsfFrameTimings: [] };
    const pool = {
      getDiagnostics: () => ({ slots: [{ shaderId: "shader-next", ready: mode !== "compiling", status: "loading" }], presentedShaderId: "shader-previous" }),
      present: () => {
        if (mode === "draw-error") throw new Error("synthetic draw failure");
        return mode === "held-result"
          ? { status: "input-error", heldPreviousFrame: true, presentedShaderId: "shader-previous", composition: {} }
          : { status: "ready", canvas: next, composition: { underlayDimAlpha: .2, effectiveAlpha: .8 } };
      },
    };
    draw(overlay, {}, card, {}, 0, null, "", { pool, ...(mode === "media-wait" ? { mediaReceipt: { kind: "video", ready: false } } : {}) });
    if (mode === "ready") {
      assert.deepEqual(calls, [["fill"], ["draw", next]], "successful composition retains its intentional underlay");
      assert.equal(overlay.exactIsfLastPresentedCanvas, next);
    } else {
      assert.deepEqual(calls, [["draw", previous]], `${mode}: retain the presented canvas without clearing it`);
      assert.equal(overlay.exactIsfLastPresentedCanvas, previous);
      assert.match(overlay.exactIsfHandoffState, /holding-last-frame/);
    }
  }
});

test("Tarot handoff diagnostics are bounded and expose prewarm, cache, black, and frame timing truth", () => {
  for (const field of [
    "handoffState",
    "prewarmSourceIds",
    "requestedShaderId",
    "currentShaderId",
    "contextCount",
    "sourceCache",
    "blackIntervals",
    "blackIntervalCount",
    "frameTimingCount",
    "latestFrameTiming",
    "frameTimingP95Ms",
  ]) assert.match(source, new RegExp(`\\b${field}:`), field);
  assert.match(source, /exactIsfFrameTimings\.length > ECHO_ISF_DIAGNOSTIC_RECEIPT_LIMIT/);
  assert.match(source, /\.slice\(-ECHO_ISF_DIAGNOSTIC_RECEIPT_LIMIT\)/);
});

test("Tarot still performs pool presentation only on the quantized 12/4 fps overlay path", () => {
  const updatePath = between("function updateEchoDirectorPreviewOverlay", "function drawEchoDirectorShaderOverlay");
  assert.match(updatePath, /Math\.min\(12, Number\(maxFps\)/);
  assert.match(updatePath, /quantizedTime = Math\.floor/);
  assert.match(updatePath, /overlay\.skippedUploads \+= 1/);
  assert.ok(updatePath.indexOf("visualizerLookaheadCards") > updatePath.indexOf("overlay.lastDrawAt = drawAt"));
  assert.equal((source.match(/maxFps: playbackPowerMode === "docked" \? 4 : 12/g) || []).length, 2);
});

test("representative three-cue Tarot handoff holds pixels, never opens black, and stays within three contexts", async () => {
  const rows = ["isf:a", "isf:b", "isf:c"].map(poolShader);
  const cards = rows.map((row, index) => poolCard(row.id, index));
  const graph = { tracks: [{ id: "track-b", role: "visualizer", cards }] };
  assert.deepEqual(visualizerLookaheadCards(graph, 1, 3).map((card) => card.visualization.sourceId), ["isf:a", "isf:b", "isf:c"]);

  const pool = createEchoIsfPlaybackPool({
    apiBase: `http://tarot-pool-${Date.now()}.test`,
    width: 320,
    height: 180,
    maxSurfaces: 3,
    dependencies: poolDependencies(rows),
  });
  const frame = { time: 1, signalFrames: { master: { rms: .2, beat: .1, bass: .2, mid: .3, treble: .1 } }, width: 320, height: 180 };
  await pool.prewarm([cards[0]]);
  const first = pool.present(cards[0], frame);
  assert.equal(first.status, "ready");
  assert.ok(first.canvas);

  const warmingSecond = pool.prewarm([cards[1]]);
  const held = pool.present(cards[1], { ...frame, time: 4.01 });
  assert.equal(held.heldPreviousFrame, true);
  assert.equal(held.canvas, first.canvas, "the previous shader canvas remains the presented texture");
  await warmingSecond;
  const second = pool.present(cards[1], { ...frame, time: 4.02 });
  assert.equal(second.status, "ready");
  assert.equal(second.presentedShaderId, "isf:b");

  await pool.prewarm([cards[2]]);
  const third = pool.present(cards[2], { ...frame, time: 8.01 });
  assert.equal(third.status, "ready");
  const diagnostics = pool.getDiagnostics();
  assert.ok(diagnostics.contextCount <= 3);
  assert.ok(diagnostics.surfaceCount <= 3);
  assert.equal(diagnostics.blackIntervals.length, 0);
  assert.ok(diagnostics.handoffs >= 3);
  pool.dispose();
  assert.equal(pool.getDiagnostics().surfaceCount, 0);
});
