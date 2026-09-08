import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { hyperFramesVideoFrameTime, prepareHyperFramesVideoFrame } from "../src/domain/hyperframes-media-frame-runtime.js";

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
