import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  configureEchoIsfSourceCache,
  createEchoIsfPlaybackPool,
  getEchoIsfSourceCacheDiagnostics,
  resetEchoIsfBrowserRuntimeCaches,
  visualizerLookaheadCards,
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

function shader(id, overrides = {}) {
  const source = overrides.source || `/* ${id} */ void main(){ gl_FragColor=vec4(1.0); }`;
  const sourceHash = sha256(source);
  return {
    id,
    title: overrides.title || "A deliberately duplicated display title",
    shaderType: overrides.shaderType || "generator",
    inputs: overrides.inputs || [{ NAME: "gain", TYPE: "float", DEFAULT: 0.25, MIN: 0, MAX: 1 }],
    source: `/source/${encodeURIComponent(id)}?sha256=${sourceHash}`,
    sourceHash: `sha256:${sourceHash}`,
    sourceBytes: Buffer.byteLength(source),
    runtime: "/runtime.js?sha256=runtime-hash",
    runtimeHash: "sha256:runtime-hash",
    fixtureSource: source,
    compileError: Boolean(overrides.compileError),
    drawError: Boolean(overrides.drawError),
  };
}

function cue(id, startSeconds, endSeconds, overrides = {}) {
  const portableHash = overrides.portableHash || `fnv1a32:${sha256(`${id}:${startSeconds}:${endSeconds}`).slice(0, 8)}`;
  return {
    id: overrides.cardId || `cue:${id}:${startSeconds}`,
    sourceCueIndex: overrides.sourceCueIndex ?? startSeconds,
    startSeconds,
    endSeconds,
    visualization: {
      sourceId: id,
      layerIndex: overrides.layerIndex || 0,
      card: {
        id,
        source: { uri: `/source/${encodeURIComponent(id)}`, hash: portableHash },
        controls: overrides.controls || {},
        audioMap: overrides.audioMap || {},
        stemFocus: "master",
        layer: { opacity: 0.7, mix: 1, blend: "screen", target: "program" },
      },
    },
  };
}

function frame(time = 0, overrides = {}) {
  return {
    time,
    width: 320,
    height: 180,
    signalFrames: { master: { rms: 0.4 } },
    ...overrides,
  };
}

function fixture(rows) {
  const catalog = rows.map(({ fixtureSource: _fixtureSource, compileError: _compileError, drawError: _drawError, ...row }) => row);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const bySource = new Map(rows.map((row) => [row.fixtureSource, row]));
  const counters = {
    catalogFetches: 0,
    sourceFetches: new Map(),
    contexts: 0,
    renderers: 0,
    compiles: 0,
    draws: 0,
    cleanups: 0,
    contextLosses: 0,
  };
  let canvasSequence = 0;
  const canvases = [];
  const dependencies = {
    fetch: async (url) => {
      if (String(url).endsWith("/api/echos/shaders")) {
        counters.catalogFetches += 1;
        return response(catalog);
      }
      const row = rows.find((candidate) => String(url).includes(`/source/${encodeURIComponent(candidate.id)}`));
      if (!row) return response("missing", 404);
      counters.sourceFetches.set(row.id, (counters.sourceFetches.get(row.id) || 0) + 1);
      return response(row.fixtureSource);
    },
    sha256,
    createCanvas: (width, height) => {
      const canvas = {
        id: `canvas:${canvasSequence++}`,
        width,
        height,
        getContext(kind, options) {
          assert.equal(kind, "webgl");
          assert.equal(options.preserveDrawingBuffer, true);
          counters.contexts += 1;
          return {
            getExtension(name) {
              if (name !== "WEBGL_lose_context") return null;
              return { loseContext() { counters.contextLosses += 1; } };
            },
          };
        },
      };
      canvases.push(canvas);
      return canvas;
    },
    loadRuntime: async () => ({ Renderer: class {} }),
    createRenderer: () => {
      counters.renderers += 1;
      let current = null;
      return {
        valid: true,
        error: null,
        loadSource(source) {
          counters.compiles += 1;
          current = bySource.get(source) || null;
          assert.ok(current, "the renderer must receive a byte-exact catalog source");
          this.valid = !current.compileError;
          this.error = current.compileError ? new Error(`compile failed for ${current.id}`) : null;
        },
        setValue() {},
        draw(canvas) {
          counters.draws += 1;
          assert.ok(current, "draw must follow a successful exact-source compile");
          if (current.drawError) throw new Error(`draw failed for ${current.id}`);
          canvas.lastDrawnShaderId = current.id;
        },
        cleanup() { counters.cleanups += 1; },
      };
    },
  };
  return { byId, catalog, counters, canvases, dependencies };
}

function poolFor(rows, options = {}) {
  const harness = fixture(rows);
  const pool = createEchoIsfPlaybackPool({
    apiBase: options.apiBase || `http://pool-${Math.random().toString(16).slice(2)}.test`,
    width: 320,
    height: 180,
    maxSurfaces: options.maxSurfaces ?? 3,
    sourceCacheMaxEntries: options.sourceCacheMaxEntries,
    dependencies: harness.dependencies,
  });
  return { ...harness, pool };
}

test.beforeEach(() => {
  resetEchoIsfBrowserRuntimeCaches();
});

test("current, next, and lookahead exact IDs prewarm into no more than three resident surfaces", async (t) => {
  const rows = ["isf:a", "isf:b", "isf:c", "isf:d"].map((id) => shader(id));
  const cards = rows.map((row, index) => cue(row.id, index * 10, (index + 1) * 10, { sourceCueIndex: index }));
  const graph = { tracks: [{ id: "track-b", role: "visualizer", cards }] };
  const lookahead = visualizerLookaheadCards(graph, 0.01, 3);
  assert.deepEqual(lookahead.map((card) => card.visualization.sourceId), ["isf:a", "isf:b", "isf:c"]);

  const { pool, counters } = poolFor(rows);
  t.after(() => pool.dispose());
  const warmed = await pool.prewarm({ cards: lookahead, cacheKey: "graph:one" });
  assert.equal(warmed.status, "ready");
  assert.equal(warmed.ready, 3);
  assert.equal(counters.compiles, 3);
  assert.equal(counters.contexts, 3);
  assert.deepEqual(pool.getDiagnostics().slots.map((slot) => slot.shaderId).sort(), ["isf:a", "isf:b", "isf:c"]);

  const first = pool.present(cards[0], { ...frame(0.01), cacheKey: "graph:one" });
  assert.equal(first.status, "ready");
  assert.equal(first.canvas.lastDrawnShaderId, "isf:a");
  await pool.prewarm({ cards: [cards[3]], cacheKey: "graph:one" });
  const diagnostics = pool.getDiagnostics();
  assert.ok(diagnostics.surfaceCount <= 3);
  assert.ok(diagnostics.contextCount <= 3);
  assert.equal(diagnostics.currentShaderId, "isf:a", "the visible shader is protected from lookahead eviction");
  assert.equal(first.canvas.lastDrawnShaderId, "isf:a");
});

test("the pool key includes the exact source ID and portable source hash", async (t) => {
  const row = shader("isf:versioned");
  const versionOne = cue(row.id, 0, 10, { cardId: "cue:version-one", portableHash: "fnv1a32:11111111" });
  const versionTwo = cue(row.id, 0, 10, { cardId: "cue:version-two", portableHash: "fnv1a32:22222222" });
  const { pool, counters } = poolFor([row]);
  t.after(() => pool.dispose());

  assert.equal((await pool.prewarm({ cards: [versionOne], cacheKey: "graph:version-one" })).status, "ready");
  const firstCompileCount = counters.compiles;
  assert.equal(firstCompileCount, 1);
  assert.equal((await pool.prewarm({ cards: [versionTwo], cacheKey: "graph:version-two" })).status, "ready");
  assert.equal(
    counters.compiles,
    firstCompileCount + 1,
    "a changed portable source hash must not reuse a program prepared for older card source truth",
  );
});

test("startup warming is not a black handoff and a candidate commits only after its first valid frame", async (t) => {
  const currentRow = shader("isf:current");
  const candidateRow = shader("isf:candidate", { drawError: true });
  const current = cue(currentRow.id, 0, 10);
  const candidate = cue(candidateRow.id, 10, 20);
  const { pool, byId } = poolFor([currentRow, candidateRow]);
  t.after(() => pool.dispose());

  const startup = pool.present(current, frame(0));
  assert.equal(startup.canvas, null);
  assert.equal(startup.heldPreviousFrame, false);
  assert.equal(pool.getDiagnostics().blackIntervals.length, 0, "initial loading has no prior pixels to hand off from and is not a black handoff interval");
  await pool.prewarm([current]);
  const first = pool.present(current, frame(0.01));
  assert.equal(first.status, "ready");
  assert.equal(first.presentedShaderId, currentRow.id);

  await pool.prewarm([candidate]);
  const rejected = pool.present(candidate, frame(10.01));
  assert.equal(rejected.status, "draw-error");
  assert.equal(rejected.heldPreviousFrame, true);
  assert.equal(rejected.canvas, first.canvas);
  assert.equal(rejected.presentedShaderId, currentRow.id);
  assert.equal(pool.getDiagnostics().currentShaderId, currentRow.id);

  byId.get(candidateRow.id).drawError = false;
  const committed = pool.present(candidate, frame(10.02));
  assert.equal(committed.status, "ready");
  assert.equal(committed.heldPreviousFrame, false);
  assert.equal(committed.presentedShaderId, candidateRow.id);
  assert.notEqual(committed.canvas, first.canvas);
  assert.equal(pool.getDiagnostics().blackIntervals.length, 0);
});

test("known compile, draw, and filter-input failures retain the last good canvas and receipt", async (t) => {
  const failureCases = [
    { name: "compile", row: shader("isf:compile-failure", { compileError: true }), expected: "compile-error", input: frame(10) },
    { name: "draw", row: shader("isf:draw-failure", { drawError: true }), expected: "draw-error", input: frame(10) },
    {
      name: "input",
      row: shader("isf:input-failure", { shaderType: "filter", inputs: [{ NAME: "inputImage", TYPE: "image" }] }),
      expected: "input-error",
      input: frame(10),
    },
  ];

  for (const failure of failureCases) {
    await t.test(failure.name, async (subtest) => {
      resetEchoIsfBrowserRuntimeCaches();
      const stableRow = shader(`isf:stable-for-${failure.name}`);
      const stable = cue(stableRow.id, 0, 10);
      const broken = cue(failure.row.id, 10, 20);
      const { pool } = poolFor([stableRow, failure.row]);
      subtest.after(() => pool.dispose());
      await pool.prewarm([stable]);
      const good = pool.present(stable, frame(1));
      assert.equal(good.status, "ready");
      const prewarm = await pool.prewarm([broken]);
      assert.ok(["ready", "error"].includes(prewarm.status));

      const held = pool.present(broken, failure.input);
      assert.equal(held.status, failure.expected, `the ${failure.name} cause must remain explicit at presentation`);
      assert.equal(held.heldPreviousFrame, true);
      assert.equal(held.canvas, good.canvas);
      assert.equal(held.presentedShaderId, stableRow.id);
      assert.deepEqual(held.frameReceipt, good.frameReceipt);
      assert.equal(pool.getDiagnostics().currentShaderId, stableRow.id);
      assert.equal(pool.getDiagnostics().blackIntervals.length, 0);
      await new Promise((resolve) => setImmediate(resolve));
    });
  }
});

test("dirty ranges use half-open cue windows and graph cache-key invalidation is selective", async (t) => {
  const rows = ["isf:left", "isf:middle", "isf:right"].map((id) => shader(id));
  const cards = [cue(rows[0].id, 0, 10), cue(rows[1].id, 10, 20), cue(rows[2].id, 20, 30)];
  const { pool } = poolFor(rows);
  t.after(() => pool.dispose());
  await pool.prewarm({ cards: cards.slice(0, 2), cacheKey: "graph:old" });
  await pool.prewarm({ cards: [cards[2]], cacheKey: "graph:new" });
  const left = pool.present(cards[0], { ...frame(1), cacheKey: "graph:old" });
  assert.equal(left.status, "ready");

  const dirty = pool.invalidate({ dirtyRanges: [{ startSeconds: 10, endSeconds: 20 }] });
  assert.deepEqual(dirty.invalidatedShaderIds, [rows[1].id], "touching 10s/20s boundaries must not invalidate adjacent half-open cues");
  assert.deepEqual(pool.getDiagnostics().slots.map((slot) => slot.shaderId).sort(), [rows[0].id, rows[2].id]);

  const oldGraph = pool.invalidate({ cacheKey: "graph:old" });
  assert.deepEqual(oldGraph.invalidatedShaderIds, [rows[0].id]);
  let diagnostics = pool.getDiagnostics();
  assert.equal(diagnostics.currentShaderId, rows[0].id, "an invalidated visible slot holds its pixels until replacement");
  assert.equal(diagnostics.slots.find((slot) => slot.shaderId === rows[0].id)?.invalidated, true);
  assert.equal(diagnostics.slots.find((slot) => slot.shaderId === rows[2].id)?.ready, true, "the new graph cache key remains resident");

  const right = pool.present(cards[2], { ...frame(20.01), cacheKey: "graph:new" });
  assert.equal(right.status, "ready");
  assert.equal(right.presentedShaderId, rows[2].id);
  diagnostics = pool.getDiagnostics();
  assert.equal(diagnostics.slots.some((slot) => slot.shaderId === rows[0].id), false, "stale held pixels are released only after replacement commits");
  assert.equal(diagnostics.blackIntervals.length, 0);
});

test("the global source cache is bounded and disposal releases every resident renderer and context", async (t) => {
  configureEchoIsfSourceCache({ limit: 2 });
  const rows = ["isf:cache-a", "isf:cache-b", "isf:cache-c"].map((id) => shader(id));
  const cards = rows.map((row, index) => cue(row.id, index * 10, (index + 1) * 10));
  const first = poolFor(rows, { sourceCacheMaxEntries: 2 });
  t.after(() => first.pool.dispose());
  await first.pool.prewarm(cards);
  const cache = getEchoIsfSourceCacheDiagnostics();
  assert.equal(cache.limit, 2);
  assert.equal(cache.size, 2);
  assert.ok(cache.evictions >= 1);
  assert.ok(first.pool.getDiagnostics().sourceCache.entryCount <= 2);

  const fetchesBefore = first.counters.sourceFetches.get(rows[0].id);
  const second = createEchoIsfPlaybackPool({
    apiBase: "http://second-cache-consumer.test",
    width: 320,
    height: 180,
    maxSurfaces: 1,
    sourceCacheMaxEntries: 2,
    dependencies: first.dependencies,
  });
  t.after(() => second.dispose());
  await second.prewarm([cards[0]]);
  assert.equal(first.counters.sourceFetches.get(rows[0].id), fetchesBefore + 1, "the deterministically evicted oldest source is fetched again");
  assert.ok(getEchoIsfSourceCacheDiagnostics().size <= 2);
  second.dispose();

  const resident = first.pool.getDiagnostics().surfaceCount;
  assert.equal(resident, 3);
  first.pool.dispose();
  const disposed = first.pool.getDiagnostics();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.surfaceCount, 0);
  assert.equal(first.counters.cleanups, resident + 1, "all renderers from both pools are cleaned up");
  assert.equal(first.counters.contextLosses, resident + 1, "all WebGL contexts from both pools are explicitly lost");
});
