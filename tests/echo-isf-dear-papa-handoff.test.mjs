import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  createEchoIsfPlaybackPool,
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

function sourceId(card = {}) {
  return String(card?.visualization?.sourceId || "");
}

function frameInput(time) {
  const signal = {
    status: "live",
    truthStatus: "live-analyser",
    rms: 0.42,
    beat: 0.77,
    energy: 0.61,
    bass: 0.36,
    low: 0.36,
    mid: 0.48,
    treble: 0.54,
    high: 0.54,
    orbit: 0.25,
    palette: 0.5,
    off: 0,
  };
  return {
    time,
    width: 640,
    height: 360,
    signalFrames: { master: signal, synth: signal, drums: signal },
    audio: signal,
    mediaElement: { tagName: "VIDEO", readyState: 4, videoWidth: 640, videoHeight: 360, currentSrc: "memory://dear-papa-frame" },
    mediaIdentity: { id: "dear-papa-source-frame", uri: "memory://dear-papa-frame", sourceHash: "fixture" },
  };
}

test("Dear Papa multi-cue ISF handoffs keep pixels present with three bounded shader surfaces", async () => {
  resetEchoIsfBrowserRuntimeCaches();
  const graph = JSON.parse(fs.readFileSync(new URL("../work/dear-papa-critic-truth-v2/native-show-graph.json", import.meta.url), "utf8"));
  const track = graph.tracks.find((candidate) => candidate.id === "track-b");
  assert.ok(track?.cards?.length >= 4, "representative Dear Papa graph must contain multiple Track B cues");
  const cards = track.cards.slice(0, 4);
  const sources = new Map(cards.map((card, index) => [sourceId(card), `/* dear-papa-cue-${index} */ void main(){ gl_FragColor=vec4(${(index + 1) / 5},0.2,0.4,1.0); }`]));
  const catalog = cards.map((card) => {
    const id = sourceId(card);
    const source = sources.get(id);
    const sourceHash = sha256(source);
    return {
      id,
      title: card.visualization.card.title,
      inputs: card.visualization.card.inputs,
      source: `/source/${encodeURIComponent(id)}?sha256=${sourceHash}`,
      sourceHash: `sha256:${sourceHash}`,
      sourceBytes: Buffer.byteLength(source),
      runtime: "/runtime.js?sha256=runtime-hash",
      runtimeHash: "sha256:runtime-hash",
    };
  });
  const counters = { contexts: 0, programs: 0, draws: 0, cleanups: 0 };
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
    createRenderer: () => {
      counters.programs += 1;
      return {
        valid: true,
        loadSource() {},
        setValue() {},
        draw() { counters.draws += 1; },
        cleanup() { counters.cleanups += 1; },
      };
    },
  };
  const pool = createEchoIsfPlaybackPool({
    apiBase: "http://dear-papa-handoff.test",
    width: 640,
    height: 360,
    maxSurfaces: 3,
    dependencies,
  });

  const firstLookahead = visualizerLookaheadCards(graph, cards[0].startSeconds + 0.01, 3);
  await pool.prewarm({ cards: firstLookahead, cacheKey: graph.directorV2.variantHash });

  const presentations = [];
  for (const card of cards) {
    const time = Number(card.startSeconds) + 0.01;
    const lookahead = visualizerLookaheadCards(graph, time, 3);
    const presentation = pool.present(card, { ...frameInput(time), cacheKey: graph.directorV2.variantHash });
    presentations.push(presentation);
    assert.equal(presentation.status, "ready", `${card.id} must already be compiled at its cue boundary`);
    assert.ok(presentation.canvas, `${card.id} must present pixels`);
    await pool.prewarm({ cards: lookahead.slice(1), cacheKey: graph.directorV2.variantHash });
  }

  const diagnostics = pool.getDiagnostics();
  assert.deepEqual(presentations.map((row) => row.presentedShaderId), cards.map(sourceId));
  assert.equal(diagnostics.blackIntervals.length, 0, "prewarmed cue handoffs must never expose a black interval");
  assert.ok(diagnostics.surfaceCount <= 3);
  assert.ok(diagnostics.contextCount <= 3);
  assert.ok(diagnostics.programCount <= 3);
  assert.ok(diagnostics.sourceCache.entryCount <= diagnostics.sourceCache.maxEntries);
  assert.equal(diagnostics.currentShaderId, sourceId(cards.at(-1)));
  assert.equal(diagnostics.requestedShaderId, sourceId(cards.at(-1)));
  assert.ok(diagnostics.handoffs >= cards.length);
  assert.ok(diagnostics.frameTiming.maxMs >= diagnostics.frameTiming.lastMs);
  assert.equal(counters.draws, cards.length);

  pool.dispose();
  assert.equal(pool.getDiagnostics().surfaceCount, 0);
  assert.ok(counters.cleanups >= 1);
});
