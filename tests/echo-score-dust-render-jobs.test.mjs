import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelEchoScoreDustLayerRender, clearEchoScoreDustLayerRender, echoScoreDustLayerRenderJob, echoScoreDustLayerRenderKey,
  resetEchoScoreDustLayerRenders, retryEchoScoreDustLayerSave, startEchoScoreDustLayerRender, subscribeEchoScoreDustLayerRender,
} from "../src/components/echo-score-dust-render-jobs.js";

const layer = { songId: "song", layerId: "layer:1", binding: { scoreFingerprint: "fnv1a:1", seed: 7 }, window: { startUs: 0, endUs: 1e6 } };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("a layer render outlives the panel that started it: a new panel reattaches and finds the result", async () => {
  resetEchoScoreDustLayerRenders();
  const key = echoScoreDustLayerRenderKey(layer);
  assert.equal(key, "song|layer:1|fnv1a:1|7|0-1000000");
  const gate = deferred(); let runs = 0, report;
  const first = [];
  const unsubscribe = subscribeEchoScoreDustLayerRender(key, (job) => first.push(job?.state));
  startEchoScoreDustLayerRender(key, async (context) => { runs += 1; report = context.report; return gate.promise; });
  await tick();
  report({ progress: 0.5, message: "Rendering layer frame 4045 of 8496" });
  unsubscribe(); // the panel unmounts (tab switch, cut reload, Prepare)
  assert.equal(echoScoreDustLayerRenderJob(key).message, "Rendering layer frame 4045 of 8496", "the render keeps going without a panel");
  assert.equal(startEchoScoreDustLayerRender(key, async () => { runs += 1; }).state, "running", "Render layer cannot start a duplicate");
  const second = [];
  subscribeEchoScoreDustLayerRender(key, (job) => second.push(job));
  gate.resolve({ recordingId: "rec", uri: "/media/r.webm", sha256: "a", receipt: {} });
  await tick(); await tick();
  assert.equal(runs, 1);
  assert.equal(second.at(-1).state, "done");
  assert.equal(second.at(-1).result.recordingId, "rec", "the new panel gets the finished render to bind");
  clearEchoScoreDustLayerRender(key);
  assert.equal(echoScoreDustLayerRenderJob(key), null);
});

test("cancel and failure are reported to whoever is watching; a new render can start after either", async () => {
  resetEchoScoreDustLayerRenders();
  const key = echoScoreDustLayerRenderKey(layer);
  startEchoScoreDustLayerRender(key, ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))));
  cancelEchoScoreDustLayerRender(key);
  await tick(); await tick();
  assert.equal(echoScoreDustLayerRenderJob(key).state, "cancelled");
  startEchoScoreDustLayerRender(key, async () => { throw new Error("VideoEncoder failed"); });
  await tick(); await tick();
  assert.deepEqual([echoScoreDustLayerRenderJob(key).state, echoScoreDustLayerRenderJob(key).message], ["error", "VideoEncoder failed"]);
  assert.equal(echoScoreDustLayerRenderKey({ ...layer, binding: { ...layer.binding, seed: 8 } }) === key, false, "a different seed is a different render");
});

test("a failed save keeps the rendered frames; retrying saves without rendering again", async () => {
  resetEchoScoreDustLayerRenders();
  const key = echoScoreDustLayerRenderKey(layer);
  let renders = 0, saves = 0;
  startEchoScoreDustLayerRender(key, {
    render: async () => { renders += 1; return { blob: { size: 220e6 }, receipt: { scoreFingerprint: "fnv1a:1" } }; },
    save: async ({ blob }) => { saves += 1; if (saves === 1) throw new Error(`The render (${Math.round(blob.size / 1e6)} MB) could not be saved to Recordings (413).`); return { recordingId: "rec" }; },
  });
  for (let i = 0; i < 6; i++) await tick();
  const failed = echoScoreDustLayerRenderJob(key);
  assert.equal(failed.state, "error");
  assert.match(failed.message, /220 MB.*413/);
  assert.equal(failed.rendered.blob.size, 220e6, "the frames survive the failed save");
  retryEchoScoreDustLayerSave(key);
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(echoScoreDustLayerRenderJob(key).state, "done");
  assert.equal(echoScoreDustLayerRenderJob(key).result.recordingId, "rec");
  assert.deepEqual([renders, saves], [1, 2], "rendered once, saved twice");
});
