import test from "node:test";
import assert from "node:assert/strict";
import { createEchoScoreDustOfflineRenderer } from "../src/components/echo-score-dust-renderer.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback } from "../src/domain/echo-visual-score.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

// Minimal 2D canvas stand-in: records draw calls, returns blank pixels.
function stubCanvas(width, height) {
  const calls = [];
  const ctx = new Proxy({ calls, measureText: () => ({ width: 10 }), getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) },
    { get: (target, key) => (key in target ? target[key] : (...args) => { calls.push(key); }), set: (target, key, value) => { target[key] = value; return true; } });
  return { width, height, getContext: () => ctx, ctx };
}

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const playback = prepareEchoScorePlayback(composeEchoVisualScore(timeline), timeline);
const make = () => createEchoScoreDustOfflineRenderer({ width: 320, height: 180, fps: 30, durationUs: 204_920_000, playback, settings: { seed: 9, particleCount: 500 }, canvasFactory: stubCanvas });

test("offline frames follow the frame-addressed contract", async () => {
  const renderer = make();
  assert.equal(renderer.frameCount, Math.ceil(204.92 * 30));
  assert.equal(renderer.frameTime(30), 1_000_000);
  assert.throws(() => renderer.frameTime(-1), /outside/);
  assert.throws(() => renderer.paintFrame(0, stubCanvas(1, 1).ctx), /Prepare this exact/);
  const frame = await renderer.prepareFrame(0);
  assert.equal(frame.schemaVersion, "hapa.echo.score-dust.offline-frame.v1");
  assert.equal(renderer.paintFrame(0, stubCanvas(320, 180).ctx).frameIndex, 0);
  const controller = new AbortController(); controller.abort(new Error("stop"));
  await assert.rejects(renderer.prepareFrame(1, { signal: controller.signal }), /stop/);
  renderer.dispose();
  await assert.rejects(renderer.prepareFrame(1), /disposed/);
  assert.equal(renderer.diagnostics().ownedAnimationLoops, 0);
});

test("two renders of the same frames reach identical simulation state, independent of wall time", async () => {
  const first = make(), second = make(), a = [], b = [];
  for (let i = 2925; i < 2960; i++) { a.push((await first.prepareFrame(i)).stateFingerprint); }
  for (let i = 2925; i < 2960; i++) { await new Promise((r) => setTimeout(r, i % 3)); b.push((await second.prepareFrame(i)).stateFingerprint); }
  assert.deepEqual(a, b);
  assert.ok(new Set(a).size > 30, "frames advance");
  assert.ok(first.diagnostics().resets === 1, "a sequential render restarts once");
  first.dispose(); second.dispose();
});
