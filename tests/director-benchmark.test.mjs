import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDefaultMigration, summarizeBenchmarkGraph } from "../src/domain/director-benchmark.js";

test("benchmark summary covers media, IVF, lyrics, camera, accents, and time", () => {
  const graph = { song: { durationSeconds: 10, lyricOverlay: { lines: [{ text: "x" }] } }, tracks: [{ cards: [{ media: {}, visualization: {} }] }], directorV2: { cameraKeyframes: [{}], accentTrack: { events: [{}] }, visualTimeTrack: { events: [{}] }, modulationBindings: [{}], rendererSupport: { hyperframes: { status: "exact" } } } };
  const summary = summarizeBenchmarkGraph(graph);
  assert.deepEqual({ media: summary.mediaCards, ivf: summary.visualizerCards, lyrics: summary.lyricLines, camera: summary.cameraKeyframes, accents: summary.accentEvents, time: summary.visualTimeEvents }, { media: 1, ivf: 1, lyrics: 1, camera: 1, accents: 1, time: 1 });
});

test("default migration blocks any P0 gap, regression, or pending blind review", () => {
  assert.equal(evaluateDefaultMigration({ p0Gates: { deterministic: "pass", playback: "pass" }, regressions: [], blindEditorialStatus: "complete" }).allowed, true);
  assert.equal(evaluateDefaultMigration({ p0Gates: { deterministic: "pass", semantic: "pending-human" }, regressions: [], blindEditorialStatus: "complete" }).allowed, false);
  assert.equal(evaluateDefaultMigration({ p0Gates: { deterministic: "pass" }, regressions: ["song-playback-unmeasured"], blindEditorialStatus: "complete" }).allowed, false);
  assert.equal(evaluateDefaultMigration({ p0Gates: { deterministic: "pass" }, regressions: [], blindEditorialStatus: "awaiting-human" }).allowed, false);
});
