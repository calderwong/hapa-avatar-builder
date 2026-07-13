import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  createEchoIsfSurface,
  loadEchoIsfCatalog,
  resetEchoIsfBrowserRuntimeCaches,
  visualizerCardAtTime,
  visualizerCardsAtTime,
} from "../src/domain/echo-isf-browser-runtime.js";

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return String(body); },
  };
}

function shaderRow(source, overrides = {}) {
  const sourceHash = sha256(source);
  return {
    id: "isf:exact",
    title: "Duplicate titles are not identity",
    source: `/api/echos/shader-source?id=isf%3Aexact&sha256=${sourceHash}`,
    sourceHash: `sha256:${sourceHash}`,
    sourceBytes: Buffer.byteLength(source),
    runtime: "/api/echos/isf-runtime.js?sha256=runtime-hash",
    runtimeHash: "sha256:runtime-hash",
    inputs: [{ NAME: "inputImage", TYPE: "image" }, { NAME: "gain", TYPE: "float" }],
    ...overrides,
  };
}

function fakeCanvas(contextOptions) {
  return {
    width: 1,
    height: 1,
    getContext(kind, options) {
      assert.equal(kind, "webgl");
      contextOptions.push(options);
      return { getExtension: () => null };
    },
  };
}

test("default browser fetch keeps its Window/global receiver", async () => {
  const originalFetch = globalThis.fetch;
  const apiBase = "http://runtime-bound-fetch.test";
  let receiver = null;
  try {
    resetEchoIsfBrowserRuntimeCaches();
    globalThis.fetch = async function boundFetch(url) {
      receiver = this;
      assert.equal(String(url), `${apiBase}/api/echos/shaders`);
      return response([]);
    };
    const rows = await loadEchoIsfCatalog({ apiBase });
    assert.deepEqual(rows, []);
    assert.equal(receiver, globalThis);
  } finally {
    globalThis.fetch = originalFetch;
    resetEchoIsfBrowserRuntimeCaches();
  }
});

test("catalog/runtime/source loading is single-flight and draw uses exact source ID", async () => {
  const source = "/*{}*/ void main(){ gl_FragColor=vec4(1.0); }";
  const row = shaderRow(source);
  const calls = { catalog: 0, source: 0, runtime: 0, compile: 0, draw: 0 };
  const contexts = [];
  const renderers = [];
  const fetch = async (url) => {
    if (String(url).endsWith("/api/echos/shaders")) { calls.catalog += 1; return response([row]); }
    if (String(url).includes("/api/echos/shader-source")) { calls.source += 1; return response(source); }
    return response({}, 404);
  };
  const dependencies = {
    fetch,
    sha256,
    createCanvas: () => fakeCanvas(contexts),
    loadRuntime: async (url) => {
      calls.runtime += 1;
      assert.match(url, /sha256=runtime-hash/);
      return { Renderer: class {} };
    },
    createRenderer: () => {
      const values = {};
      const renderer = {
        valid: true,
        values,
        loadSource(value) { calls.compile += 1; assert.equal(value, source); },
        setValue(name, value) { values[name] = value; },
        draw() { calls.draw += 1; },
      };
      renderers.push(renderer);
      return renderer;
    },
  };
  const apiBase = "http://runtime-single-flight.test";
  const [catalogA, catalogB] = await Promise.all([
    loadEchoIsfCatalog({ apiBase, dependencies }),
    loadEchoIsfCatalog({ apiBase, dependencies }),
  ]);
  assert.equal(catalogA, catalogB);
  assert.equal(calls.catalog, 1);

  const surfaces = [
    createEchoIsfSurface({ apiBase, width: 320, height: 180, dependencies }),
    createEchoIsfSurface({ apiBase, width: 320, height: 180, dependencies }),
  ];
  const card = { visualization: { sourceId: "isf:exact", card: { audioMap: { gain: { signal: "rms", depth: 0.5 } } } } };
  const prepared = await Promise.all(surfaces.map((surface) => surface.prepare(card)));
  assert.ok(prepared.every((state) => state.status === "ready"));
  assert.equal(calls.catalog, 1);
  assert.equal(calls.source, 1);
  assert.equal(calls.runtime, 1);
  assert.equal(calls.compile, 2, "each WebGL surface owns its compiled program");
  assert.ok(contexts.every((options) => options.preserveDrawingBuffer === true));

  const mediaElement = { complete: true, width: 16, height: 16 };
  const drawState = surfaces[0].draw({ card, width: 640, height: 360, values: { gain: 0.9 }, imageInputs: { inputImage: mediaElement } });
  assert.equal(drawState.status, "ready");
  assert.ok(drawState.composition);
  assert.equal(drawState.frameReceipt.shaderId, "isf:exact");
  assert.equal(drawState.frameReceipt.sourceHash, sha256(source));
  assert.equal(calls.draw, 1);
  assert.equal(renderers[0].values.gain, 0.9);
  assert.equal(renderers[0].values.inputImage, mediaElement);
  assert.equal(surfaces[0].canvas.width, 640);
  assert.equal(surfaces[0].canvas.height, 360);
});

test("unknown IDs and source hash mismatches are explicit and never title-substituted", async () => {
  const source = "trusted shader bytes";
  const row = shaderRow(source, { sourceHash: `sha256:${sha256("different bytes")}` });
  const dependencies = {
    fetch: async (url) => String(url).endsWith("/api/echos/shaders") ? response([row]) : response(source),
    sha256,
    createCanvas: () => fakeCanvas([]),
    loadRuntime: async () => ({ Renderer: class {} }),
    createRenderer: () => ({ valid: true, loadSource() {}, draw() {} }),
  };
  const surface = createEchoIsfSurface({ apiBase: "http://runtime-hash-error.test", dependencies });
  const missingIdentity = await surface.prepare({ title: row.title });
  assert.equal(missingIdentity.status, "missing-id");
  assert.match(missingIdentity.error, /exact shaderId/i);
  const missing = await surface.prepare({ visualization: { sourceId: "isf:missing" }, title: row.title });
  assert.equal(missing.status, "missing-id");
  assert.equal(missing.sourceId, "isf:missing");
  const mismatch = await surface.prepare({ visualization: { sourceId: row.id } });
  assert.equal(mismatch.status, "hash-error");
  assert.match(mismatch.error, /hash mismatch/i);
});

test("renderer compilation and drawing failures remain distinguishable", async () => {
  const source = "compile me";
  const row = shaderRow(source);
  let failCompile = true;
  const renderer = {
    valid: true,
    error: null,
    loadSource() {
      this.valid = !failCompile;
      this.error = failCompile ? new Error("synthetic compiler failure") : null;
    },
    setValue() {},
    draw() { throw new Error("synthetic draw failure"); },
  };
  const dependencies = {
    fetch: async (url) => String(url).endsWith("/api/echos/shaders") ? response([row]) : response(source),
    sha256,
    createCanvas: () => fakeCanvas([]),
    loadRuntime: async () => ({ Renderer: class {} }),
    createRenderer: () => renderer,
  };
  const surface = createEchoIsfSurface({ apiBase: "http://runtime-errors.test", dependencies });
  const card = { visualization: { sourceId: row.id } };
  assert.equal((await surface.prepare(card)).status, "compile-error");
  failCompile = false;
  assert.equal((await surface.prepare(card)).status, "ready");
  assert.equal(surface.draw({ card }).status, "draw-error");
});

test("show-graph selectors use only executable Track B source IDs and exact time windows", () => {
  const cards = [
    { id: "low", startSeconds: 0, endSeconds: 5, visualization: { sourceId: "isf:low", layerIndex: 0 } },
    { id: "high", startSeconds: 1, endSeconds: 4, visualization: { sourceId: "isf:high", layerIndex: 1 } },
    { id: "rejected", startSeconds: 1, endSeconds: 4, knockedOut: true, visualization: { sourceId: "isf:no", layerIndex: 2 } },
    { id: "title-only", startSeconds: 1, endSeconds: 4, visualization: { title: "Never resolve me" } },
    { id: "next", startSeconds: 5, endSeconds: 8, visualization: { sourceId: "isf:next", layerIndex: 0 } },
  ];
  const graph = { tracks: [{ id: "track-b", role: "visualizer", cards }] };
  assert.deepEqual(visualizerCardsAtTime(graph, 2).map((card) => card.id), ["low", "high"]);
  assert.equal(visualizerCardAtTime(graph, 2).id, "high");
  assert.equal(visualizerCardAtTime(graph, 5).id, "next", "cue ends are exclusive and starts are inclusive");
  assert.equal(visualizerCardAtTime(graph, 8), null);
});
