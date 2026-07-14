import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  createEchoIsfPlaybackPool,
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

test("playback-pool surfaces share one default-fetch catalog and source flight", async (t) => {
  const originalFetch = globalThis.fetch;
  const source = "/*{}*/ void main(){ gl_FragColor=vec4(0.5); }";
  const row = shaderRow(source);
  const calls = { catalog: 0, source: 0, runtime: 0, compile: 0 };
  const apiBase = "http://runtime-default-fetch-single-flight.test";
  resetEchoIsfBrowserRuntimeCaches();
  globalThis.fetch = async function sharedDefaultFetch(url) {
    assert.equal(this, globalThis);
    if (String(url).endsWith("/api/echos/shaders")) {
      calls.catalog += 1;
      return response([row]);
    }
    if (String(url).includes("/api/echos/shader-source")) {
      calls.source += 1;
      return response(source);
    }
    return response({}, 404);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetEchoIsfBrowserRuntimeCaches();
  });
  const pool = createEchoIsfPlaybackPool({
    apiBase,
    width: 320,
    height: 180,
    maxSurfaces: 2,
    dependencies: {
      sha256,
      createCanvas: () => fakeCanvas([]),
      loadRuntime: async () => {
        calls.runtime += 1;
        return { Renderer: class {} };
      },
      createRenderer: () => ({
        valid: true,
        loadSource(value) { calls.compile += 1; assert.equal(value, source); },
        setValue() {},
        draw() {},
        cleanup() {},
      }),
    },
  });
  t.after(() => pool.dispose());
  const card = (hash) => ({
    visualization: {
      sourceId: row.id,
      card: { id: row.id, source: { hash }, audioMap: { gain: { signal: "rms", depth: 0.5 } } },
    },
  });

  const warmed = await pool.prewarm([card("portable:a"), card("portable:b")]);
  assert.equal(warmed.ready, 2);
  assert.equal(calls.catalog, 1);
  assert.equal(calls.source, 1);
  assert.equal(calls.runtime, 1);
  assert.equal(calls.compile, 2, "each surface compiles once while sharing immutable network bytes");
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

test("live renderer clock is pinned to the music playhead across pause, advance, and scrub", async () => {
  const source = "playhead clock shader";
  const row = shaderRow(source, { inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.5 }] });
  const uniformFrames = [];
  const uniforms = {};
  let drawCalls = 0;
  const renderer = {
    valid: true,
    loadSource() {},
    setValue(name, value) { uniforms[name] = value; },
    setDateUniforms() { throw new Error("wall-clock setter must be replaced"); },
    draw() {
      this.setDateUniforms();
      drawCalls += 1;
      uniformFrames.push({ ...uniforms, DATE: [...uniforms.DATE] });
    },
  };
  const dependencies = {
    fetch: async (url) => String(url).endsWith("/api/echos/shaders") ? response([row]) : response(source),
    sha256,
    createCanvas: () => fakeCanvas([]),
    loadRuntime: async () => ({ Renderer: class {} }),
    createRenderer: () => renderer,
  };
  const surface = createEchoIsfSurface({ apiBase: "http://runtime-playhead-clock.test", dependencies });
  const card = { visualization: { sourceId: row.id } };
  assert.equal((await surface.prepare(card)).status, "ready");

  const first = surface.draw({ card, time: 12, frameRate: 30 });
  assert.deepEqual(first.clock, {
    time: 12,
    timeDelta: 0,
    frameIndex: 360,
    frameRate: 30,
    date: [1970, 1, 1, 12],
    rephased: true,
    reusedFrame: false,
  });
  assert.deepEqual(
    { TIME: uniformFrames[0].TIME, TIMEDELTA: uniformFrames[0].TIMEDELTA, FRAMEINDEX: uniformFrames[0].FRAMEINDEX },
    { TIME: 12, TIMEDELTA: 0, FRAMEINDEX: 360 },
  );

  const paused = surface.draw({ card, time: 12, frameRate: 30 });
  assert.equal(drawCalls, 1, "a paused playhead must not advance feedback buffers or vendor frame state");
  assert.equal(paused.clock.reusedFrame, true);
  assert.equal(paused.clock.frameIndex, 360);

  const advanced = surface.draw({ card, time: 12.1, frameRate: 30 });
  assert.equal(drawCalls, 2);
  assert.equal(advanced.clock.timeDelta, 0.1);
  assert.equal(advanced.clock.frameIndex, 363);
  assert.deepEqual(
    { TIME: uniformFrames[1].TIME, TIMEDELTA: uniformFrames[1].TIMEDELTA, FRAMEINDEX: uniformFrames[1].FRAMEINDEX },
    { TIME: 12.1, TIMEDELTA: 0.1, FRAMEINDEX: 363 },
  );

  const scrubbed = surface.draw({ card, time: 2, frameRate: 30 });
  assert.equal(drawCalls, 3);
  assert.equal(scrubbed.clock.time, 2);
  assert.equal(scrubbed.clock.timeDelta, 0);
  assert.equal(scrubbed.clock.frameIndex, 60);
  assert.equal(scrubbed.clock.rephased, true);
  assert.deepEqual(
    { TIME: uniformFrames[2].TIME, TIMEDELTA: uniformFrames[2].TIMEDELTA, FRAMEINDEX: uniformFrames[2].FRAMEINDEX },
    { TIME: 2, TIMEDELTA: 0, FRAMEINDEX: 60 },
  );
});

test("catalog-quarantined shaders fail explicitly before source fetch or compilation", async () => {
  const source = "known unsupported shader";
  const row = shaderRow(source, {
    directorEligible: false,
    quarantineReason: "pixel-gate shader-compile failure",
  });
  const calls = { source: 0, compile: 0 };
  const dependencies = {
    fetch: async (url) => {
      if (String(url).endsWith("/api/echos/shaders")) return response([row]);
      calls.source += 1;
      return response(source);
    },
    sha256,
    createCanvas: () => fakeCanvas([]),
    loadRuntime: async () => ({ Renderer: class {} }),
    createRenderer: () => ({
      valid: true,
      loadSource() { calls.compile += 1; },
      draw() {},
    }),
  };
  const surface = createEchoIsfSurface({ apiBase: "http://runtime-quarantine.test", dependencies });
  const result = await surface.prepare({ visualization: { sourceId: row.id } });
  assert.equal(result.status, "unsupported-quarantine");
  assert.match(result.error, /pixel-gate shader-compile failure/);
  assert.equal(calls.source, 0);
  assert.equal(calls.compile, 0);
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
