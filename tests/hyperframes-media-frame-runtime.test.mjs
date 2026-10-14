import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { hyperFramesVideoFrameTime, prepareHyperFramesVideoFrame, holdHyperFramesMediaEndpoint, waitForHyperFramesVideoReady } from "../src/domain/hyperframes-media-frame-runtime.js";

class Video extends EventTarget {
  id = "fixture-video";
  dataset = { start: "10.55", duration: "5.45" };
  duration = 5;
  videoWidth = 704;
  videoHeight = 480;
  readyState = 2;
  seeking = false;
  paused = false;
  time = 0;
  pause() { this.paused = true; }
  get currentTime() { return this.time; }
  set currentTime(value) {
    this.time = value; this.seeking = true;
    queueMicrotask(() => { this.seeking = false; this.dispatchEvent(new Event("seeked")); });
  }
}

test("standalone frame capture uses the incoming presentation handle and waits for reverse decode", async () => {
  const video = new Video();
  for (const [song, source] of [[11.3, .75], [13, 2.45], [10.75, .2], [11.3, .75]]) {
    const receipt = await prepareHyperFramesVideoFrame(video, song);
    assert.ok(Math.abs(receipt.observedTimeSeconds - source) < 1e-7);
    assert.equal(video.seeking, false);
    assert.equal(video.paused, true);
  }
});

test("explicit source window and rate are applied without seeking beyond decoder end", () => {
  const video = new Video();
  video.dataset = { start: "10", mediaStart: "1", mediaEnd: "4", playbackRate: "2" };
  assert.equal(hyperFramesVideoFrameTime(video, 9), 1);
  assert.equal(hyperFramesVideoFrameTime(video, 10.5), 2);
  assert.ok(Math.abs(hyperFramesVideoFrameTime(video, 99) - (4 - 1 / 30)) < 1e-7);
});

test("unready media fails instead of publishing a successful frame receipt", async () => {
  const video = new Video(); video.readyState = 1;
  await assert.rejects(prepareHyperFramesVideoFrame(video, 11), /must decode/);
});

test("a stalled decoder rejects and removes pending listeners", async () => {
  const video = new Video();
  Object.defineProperty(video, "currentTime", { get: () => 0, set() {} });
  await assert.rejects(prepareHyperFramesVideoFrame(video, 11, { timeoutMs: 5 }), /timed out/);
  for (const name of ["seeked", "loadeddata", "error"]) assert.equal(getEventListeners(video, name).length, 0);
});

test("decoded-frame callback gates capture even after seeked has fired", async () => {
  const video = new Video();
  let callback;
  video.requestVideoFrameCallback = (fn) => { callback = fn; return 1; };
  video.cancelVideoFrameCallback = () => {};
  let finished = false;
  const pending = prepareHyperFramesVideoFrame(video, 11.3).then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(video.seeking, false);
  assert.equal(finished, false);
  callback(0, { mediaTime: .733333333 });
  assert.equal((await pending).presentedMediaTimeSeconds, .733333333);
});

test("full-source transitions retain exact mapped endpoints and apply rate only once", () => {
  const video = new Video(); video.duration = 8;
  const mapping = {
    schemaVersion: "hapa.echo.transition-time-map.v1", mode: "fit-source-once-to-cue",
    sourceInSeconds: 0, sourceOutSeconds: 5, sourceDurationSeconds: 5,
    cueDurationSeconds: 2, cueSampleSpanSeconds: 2 - 1 / 30,
    outputFps: 30, playbackRate: 5 / (2 - 1 / 30), valid: true, reachesDeclaredLastFrame: true,
  };
  video.dataset = { start: "10", logicalDuration: "2", mediaStart: "0", mediaEnd: "5", playbackRate: String(mapping.playbackRate) };
  assert.equal(hyperFramesVideoFrameTime(video, 9.8, 30, mapping), 0);
  assert.ok(Math.abs(hyperFramesVideoFrameTime(video, 11, 30, mapping) - mapping.playbackRate) < 1e-7);
  assert.equal(hyperFramesVideoFrameTime(video, 12.1, 30, mapping), 5);
});

test("a frame presented before seeked is retained while completion waits for seeked", async () => {
  const video = new Video();
  let callback;
  let requests = 0;
  video.requestVideoFrameCallback = fn => { callback = fn; return ++requests; };
  video.cancelVideoFrameCallback = () => {};
  Object.defineProperty(video, "currentTime", {
    get: () => video.time,
    set: value => { video.time = value; video.seeking = true; },
  });
  let finished = false;
  const pending = prepareHyperFramesVideoFrame(video, 11.3).then(result => { finished = true; return result; });
  callback(0, { mediaTime: .733333333 });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.equal(requests, 1, "paused video does not owe a second callback");
  video.seeking = false;
  video.dispatchEvent(new Event("seeked"));
  assert.equal((await pending).presentedMediaTimeSeconds, .733333333);
  for (const name of ["seeked", "loadeddata", "error"]) assert.equal(getEventListeners(video, name).length, 0);
});

test("microsecond video clocks select inside fractional frame boundaries without requiring a new presentation", async () => {
  const video = new Video(); video.dataset = { start: '0' };
  video.requestVideoFrameCallback = () => 1;
  video.cancelVideoFrameCallback = () => {};
  Object.defineProperty(video, 'currentTime', {
    get: () => video.time,
    set: value => {
      video.time = Math.floor(value * 1e6) / 1e6; video.seeking = true;
      queueMicrotask(() => { video.seeking = false; video.dispatchEvent(new Event('seeked')); });
    },
  });
  const raf = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => setImmediate(callback);
  globalThis.cancelAnimationFrame = clearImmediate;
  try {
    const result = await prepareHyperFramesVideoFrame(video, 1 / 30);
    assert.ok(result.observedTimeSeconds >= 1 / 30);
    assert.ok(result.observedTimeSeconds - 1 / 30 < 1e-6);
    assert.equal(result.presentedMediaTimeSeconds, null);
    assert.equal(result.presentationEvidence, 'settled-seek-without-new-presentation');
  } finally {
    if (raf) globalThis.requestAnimationFrame = raf; else delete globalThis.requestAnimationFrame;
    if (cancel) globalThis.cancelAnimationFrame = cancel; else delete globalThis.cancelAnimationFrame;
  }
});

test('cancelling a historical seek removes frame callbacks and event handlers', async () => {
  const video = new Video(), controller = new AbortController();
  let cancelled = 0;
  video.requestVideoFrameCallback = () => 7;
  video.cancelVideoFrameCallback = id => { assert.equal(id, 7); cancelled++; };
  Object.defineProperty(video, 'currentTime', { get: () => 0, set() {} });
  const pending = prepareHyperFramesVideoFrame(video, 11.3, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(cancelled, 1);
  for (const name of ['seeked', 'loadeddata', 'error']) assert.equal(getEventListeners(video, name).length, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

// The native video/shader proof separately verifies these decoded pixels against
// the default presentation-gated reference, including cold and reverse seeks.
test('offscreen decoding settles without scheduling a presentation callback', async () => {
  const video = new Video();
  video.requestVideoFrameCallback = () => { throw new Error('offscreen display wait'); };
  const result = await prepareHyperFramesVideoFrame(video, 11.3, { waitForPresentation: false });
  assert.equal(video.seeking, false);
  assert.equal(result.presentationEvidence, 'settled-decode-only');
  assert.equal(result.presentedMediaTimeSeconds, null);
  assert.equal(result.observedTimeSeconds, Math.ceil(result.sourceTimeSeconds * 1e6 - 1e-6) / 1e6);
  for (const name of ['seeked', 'loadeddata', 'error']) assert.equal(getEventListeners(video, name).length, 0);
});

test('positive source origins hold the first decoded frame without shifting the song clock', async () => {
  const video = new Video(); video.dataset = { start: '42.5' }; video.time = .033008;
  const options = { waitForPresentation: false, sourceOriginSeconds: .033008 };
  for (const songTime of [42.5, 42.6, 42.5]) {
    const receipt = await prepareHyperFramesVideoFrame(video, songTime, options);
    assert.equal(receipt.songTimeSeconds, songTime);
    assert.equal(receipt.sourceOriginClamped, songTime === 42.5);
    assert.ok(Math.abs(receipt.observedTimeSeconds - Math.max(.033008, songTime - 42.5)) < 1e-6);
  }
});


test('outgoing invisible clips never seek unused source tails', () => {
  const video = new Video(); video.tagName = 'VIDEO'; video.duration = 8; video.time = 3.393334;
  const timing = { presentationStart: 84.89, logicalStart: 85.34, logicalEnd: 88.74, presentationEnd: 88.74 };
  let seeks = 0;
  Object.defineProperty(video, 'currentTime', { get: () => video.time, set() { seeks++; throw Error('Unused source tail'); } });
  for (const time of [84, 85.34, 88.74, 88.7666667, 89]) holdHyperFramesMediaEndpoint(video, time, {}, timing);
  assert.equal(seeks, 0);
});

test('visible incoming transition handles still hold the declared first frame', () => {
  const video = new Video(); video.tagName = 'VIDEO'; video.time = 3;
  const timing = { presentationStart: 9.55, logicalStart: 10, logicalEnd: 12, presentationEnd: 12 };
  holdHyperFramesMediaEndpoint(video, 9.8, { source: { timeMapping: { sourceInSeconds: 1 } } }, timing);
  assert.equal(video.time, 1);
  assert.equal(video.paused, true);
});

test('readiness reports an already dispatched decoder error without waiting for timeout', async () => {
  const video = new Video(); video.videoHeight = 480; video.readyState = 1;
  video.error = { message: 'PIPELINE_ERROR_DECODE' };
  await assert.rejects(waitForHyperFramesVideoReady(video), /Failed preparing.*PIPELINE_ERROR_DECODE/);
  for (const event of ['loadeddata', 'canplay', 'seeked', 'error']) assert.equal(getEventListeners(video, event).length, 0);
});

test('readiness settles a seek without requiring another canplay and cleans up timeout', async () => {
  const video = new Video(); video.videoHeight = 480; video.readyState = 1;
  const pending = waitForHyperFramesVideoReady(video);
  video.readyState = 2; video.dispatchEvent(new Event('seeked')); await pending;
  for (const event of ['loadeddata', 'canplay', 'seeked', 'error']) assert.equal(getEventListeners(video, event).length, 0);
  video.readyState = 1;
  await assert.rejects(waitForHyperFramesVideoReady(video, { timeoutMs: 5 }), /Timed out/);
  for (const event of ['loadeddata', 'canplay', 'seeked', 'error']) assert.equal(getEventListeners(video, event).length, 0);
});
