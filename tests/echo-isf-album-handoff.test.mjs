import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  configureEchoIsfSourceCache,
  createEchoIsfPlaybackPool,
  resetEchoIsfBrowserRuntimeCaches,
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

function exactId(card = {}) {
  return String(card?.visualization?.sourceId || card?.visualization?.card?.id || "");
}

function liveSignal() {
  return {
    status: "live",
    truthStatus: "album-handoff-smoke",
    rms: 0.43,
    beat: 0.71,
    energy: 0.58,
    bass: 0.36,
    low: 0.36,
    mid: 0.49,
    treble: 0.55,
    high: 0.55,
    orbit: 0.27,
    palette: 0.52,
    off: 0,
  };
}

test("all 79 album graphs hand off 791 exact shader cues with bounded resident resources and no black intervals", async (t) => {
  resetEchoIsfBrowserRuntimeCaches();
  configureEchoIsfSourceCache({ limit: 32 });
  const albumRoot = new URL("../artifacts/echo-director-v2/album/", import.meta.url);
  const graphPaths = fs.readdirSync(albumRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(albumRoot.pathname, entry.name, "native-show-graph.json"))
    .filter((file) => fs.existsSync(file))
    .sort();
  const graphs = graphPaths.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
  const graphCards = graphs.map((graph) => ({
    graph,
    cards: (graph.tracks || []).find((track) => track.id === "track-b")?.cards || [],
  }));
  const cards = graphCards.flatMap((entry) => entry.cards);
  assert.equal(graphs.length, 79);
  assert.equal(cards.length, 791);

  const firstCardById = new Map();
  for (const card of cards) if (!firstCardById.has(exactId(card))) firstCardById.set(exactId(card), card);
  const sources = new Map([...firstCardById].map(([id], index) => [
    id,
    `/* album-handoff-${index} */ void main(){ gl_FragColor=vec4(${((index % 17) + 1) / 18},0.35,0.65,1.0); }`,
  ]));
  const catalog = [...firstCardById].map(([id, card]) => {
    const source = sources.get(id);
    const sourceHash = sha256(source);
    return {
      id,
      title: card.visualization.card.title,
      inputs: card.visualization.card.inputs,
      source: `/source/${encodeURIComponent(id)}?sha256=${sourceHash}`,
      sourceHash: `sha256:${sourceHash}`,
      sourceBytes: Buffer.byteLength(source),
      runtime: "/runtime.js?sha256=album-runtime",
      runtimeHash: "sha256:album-runtime",
    };
  });
  const signals = new Set(["master"]);
  for (const card of cards) {
    signals.add(String(card?.visualization?.card?.stemFocus || "master"));
    for (const binding of card?.visualization?.card?.automation || []) signals.add(String(binding?.stemFocus || "master"));
  }
  const signalFrames = Object.fromEntries([...signals].filter(Boolean).map((name) => [name, liveSignal()]));
  const counters = { contexts: 0, draws: 0, cleanups: 0 };
  const dependencies = {
    fetch: async (url) => {
      if (String(url).endsWith("/api/echos/shaders")) return response(catalog);
      const row = catalog.find((candidate) => String(url).includes(encodeURIComponent(candidate.id)));
      return row ? response(sources.get(row.id)) : response("not-found", 404);
    },
    sha256,
    createCanvas: (width, height) => ({
      width,
      height,
      getContext(kind) {
        assert.equal(kind, "webgl");
        counters.contexts += 1;
        return { getExtension: () => null };
      },
    }),
    loadRuntime: async () => ({ Renderer: class {} }),
    createRenderer: () => ({
      valid: true,
      loadSource() {},
      setValue() {},
      draw() { counters.draws += 1; },
      cleanup() { counters.cleanups += 1; },
    }),
  };
  const pool = createEchoIsfPlaybackPool({
    apiBase: "http://album-handoff.test",
    width: 640,
    height: 360,
    maxSurfaces: 3,
    sourceCacheMaxEntries: 32,
    dependencies,
  });
  t.after(() => pool.dispose());

  let presented = 0;
  let peakContexts = 0;
  let peakPrograms = 0;
  for (const { graph, cards: songCards } of graphCards) {
    const cacheKey = `${graph.id || graph.runId}:${graph?.directorV2?.variantHash || "album"}`;
    await pool.prewarm({ cards: songCards.slice(0, 2), cacheKey });
    for (let index = 0; index < songCards.length; index += 1) {
      const card = songCards[index];
      const time = Number(card.startSeconds) + 0.001;
      const result = pool.present(card, {
        time,
        width: 640,
        height: 360,
        cacheKey,
        signalFrames,
        audio: signalFrames[String(card?.visualization?.card?.stemFocus || "master")] || signalFrames.master,
        mediaElement: { tagName: "VIDEO", readyState: 4, videoWidth: 640, videoHeight: 360, currentSrc: "memory://album-frame" },
        mediaIdentity: { id: "album-current-frame", uri: "memory://album-frame", sourceHash: "fixture" },
      });
      assert.equal(result.status, "ready", `${graph.id || graph.runId} ${card.id} was not ready at its cue boundary`);
      assert.equal(result.presentedShaderId, exactId(card));
      assert.ok(result.canvas);
      presented += 1;
      await pool.prewarm({ cards: songCards.slice(index + 1, index + 3), cacheKey });
      const diagnostics = pool.getDiagnostics();
      peakContexts = Math.max(peakContexts, diagnostics.contextCount);
      peakPrograms = Math.max(peakPrograms, diagnostics.programCount);
      assert.ok(diagnostics.surfaceCount <= 3);
      assert.equal(diagnostics.blackIntervalCount, 0);
    }
  }

  const diagnostics = pool.getDiagnostics();
  assert.equal(presented, 791);
  assert.equal(counters.draws, 791);
  assert.ok(peakContexts <= 3);
  assert.ok(peakPrograms <= 3);
  assert.ok(diagnostics.sourceCache.entryCount <= 32);
  assert.ok(diagnostics.frameTiming.p95Ms < 1000 / 12, `p95 ${diagnostics.frameTiming.p95Ms}ms exceeded the 12fps production preview budget`);
  assert.equal(diagnostics.blackIntervals.length, 0);
});
