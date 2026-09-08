import test from "node:test";
import assert from "node:assert/strict";
import { prepareHyperFramesIsfFrame } from "../src/domain/hyperframes-isf-frame-runtime.js";
import { createHyperFramesMediaRedrawBridge, hyperFramesCapturedMediaElement } from "../src/domain/hyperframes-media-frame-runtime.js";

test("a post-injection replay reads the same prior persistent state and retains TIMEDELTA", () => {
  const buffer = { textures: [0, 0], flipFlop: false };
  const surface = { renderer: { renderBuffers: [buffer] }, lastTime: null };
  const draw = (time, input) => {
    const clock = prepareHyperFramesIsfFrame(surface, time, 30, true);
    const read = buffer.flipFlop ? 1 : 0, write = 1 - read;
    buffer.textures[write] = buffer.textures[read] + input;
    buffer.flipFlop = !buffer.flipFlop; surface.lastTime = time;
    return { output: buffer.textures[write], clock };
  };
  assert.equal(draw(0, 1).output, 1);
  assert.equal(draw(0, 2).output, 2);
  const first = draw(1 / 30, 3);
  const replay = draw(1 / 30, 4);
  assert.equal(first.output, 5);
  assert.equal(replay.output, 6);
  assert.deepEqual(first.clock, replay.clock);
  assert.equal(draw(2 / 30, 1).output, 7);
  assert.throws(() => draw(0, 1), /not rendered sequentially/);
});

test("capture hook keeps the upstream receiver/result, runs after it, and survives replacement", () => {
  const calls = [], root = {};
  const bridge = createHyperFramesMediaRedrawBridge(root, t => calls.push(['hapa', t]));
  assert.equal(bridge.install(), false);
  root.__hfReseekGpu = function (t) { assert.equal(this, root); calls.push(['upstream', t]); return 42; };
  assert.equal(bridge.install(), true);
  const wrapped = root.__hfReseekGpu;
  assert.equal(bridge.install(), true);
  assert.equal(root.__hfReseekGpu, wrapped);
  assert.equal(root.__hfReseekGpu(.5), 42);
  assert.deepEqual(calls, [['upstream', .5], ['hapa', .5]]);
  root.__hfReseekGpu = t => calls.push(['replacement', t]);
  bridge.install(); root.__hfReseekGpu(1);
  assert.deepEqual(calls.slice(-2), [['replacement', 1], ['hapa', 1]]);
});

test("shader input uses only the matching decoded and visible extracted image", () => {
  const image = { id: '__render_frame_m3__', complete: true, naturalWidth: 704,
    classList: { contains: name => name === '__render_frame__' }, style: { visibility: 'visible' } };
  const video = { tagName: 'VIDEO', id: 'm3', nextElementSibling: image };
  assert.equal(hyperFramesCapturedMediaElement(video), image);
  image.style.visibility = 'hidden'; assert.equal(hyperFramesCapturedMediaElement(video), video);
  image.style.visibility = 'visible'; image.complete = false; assert.equal(hyperFramesCapturedMediaElement(video), video);
  image.complete = true; image.id = '__render_frame_m2__'; assert.equal(hyperFramesCapturedMediaElement(video), video);
});
