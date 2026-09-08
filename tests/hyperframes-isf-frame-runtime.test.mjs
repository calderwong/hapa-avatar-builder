import test from "node:test";
import assert from "node:assert/strict";
import { prepareHyperFramesIsfFrame, prepareHyperFramesIsfSeek, createHyperFramesIsfCheckpointStore, createHyperFramesIsfCheckpointBudget } from "../src/domain/hyperframes-isf-frame-runtime.js";
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

test("song frames order persistent simulation while the visual clock slows or freezes", () => {
  const surface = { renderer: { renderBuffers: [] }, lastTime: null };
  const visualTimes = [0, .01, .01, .06];
  for (let i = 0; i < visualTimes.length; i++) {
    const clock = prepareHyperFramesIsfFrame(surface, visualTimes[i], 30, true, i / 30);
    assert.equal(clock.delta, i ? visualTimes[i] - visualTimes[i - 1] : 0);
    surface.lastTime = visualTimes[i]; surface.lastFrameIndex = i;
    assert.deepEqual(prepareHyperFramesIsfFrame(surface, visualTimes[i], 30, true, i / 30), clock);
  }
  assert.throws(() => prepareHyperFramesIsfFrame(surface, .1, 30, true, 5 / 30), /sequentially/);
});

test("checkpoint preparation uses historical input for gaps, yields and honors cancellation", async () => {
  const surface = { lastFrameIndex: 29 }, drawn = [], prepared = [], yields = [];
  surface.checkpoints = {
    latestBefore: () => 29,
    restoreBefore: () => { surface.lastFrameIndex = 29; return 29; },
    diagnostics: () => ({ count: 1, bytes: 16 }),
  };
  const result = await prepareHyperFramesIsfSeek(surface, 43, {
    batchFrames: 4,
    prepareFrame: async frame => prepared.push(frame),
    drawFrame: frame => { assert.equal(prepared.at(-1), frame); drawn.push(frame); surface.lastFrameIndex = frame; },
    yieldFrame: async () => yields.push(drawn.length),
  });
  assert.deepEqual(drawn, Array.from({ length: 13 }, (_, i) => i + 30));
  assert.deepEqual(yields, [4, 8, 12]);
  assert.equal(result.replayed, 13);
  const controller = new AbortController();
  await assert.rejects(prepareHyperFramesIsfSeek(surface, 60, {
    signal: controller.signal,
    prepareFrame: async () => controller.abort(),
    drawFrame: () => assert.fail('aborted preparation must not draw'),
  }), /cancelled/);
  assert.equal(surface.lastFrameIndex, 42);
  assert.equal(surface.isfSeekPreparing, false);
});

test("parallel seeks cannot interleave shader history and corrected frame time keeps its original predecessor", async () => {
  const surface = { renderer: { renderBuffers: [] }, lastTime: 0, lastFrameIndex: 0 };
  prepareHyperFramesIsfFrame(surface, .05, 30, true, 1 / 30);
  surface.lastTime = .05; surface.lastFrameIndex = 1;
  assert.equal(prepareHyperFramesIsfFrame(surface, 1 / 30, 30, true, 1 / 30).delta, 1 / 30);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  surface.checkpoints = { latestBefore: () => undefined, diagnostics: () => ({}) };
  const pending = prepareHyperFramesIsfSeek(surface, 3, {
    prepareFrame: () => gate,
    drawFrame: frame => { surface.lastFrameIndex = frame; },
  });
  await assert.rejects(prepareHyperFramesIsfSeek(surface, 1), /already preparing/);
  release(); await pending;
  assert.equal(surface.isfSeekPreparing, false);
});


function checkpointSurface() {
  let attached, bound; const state = new Map();
  const gl = { FRAMEBUFFER:1, FRAMEBUFFER_BINDING:2, COLOR_ATTACHMENT0:3, TEXTURE_2D:4, FRAMEBUFFER_COMPLETE:5,
    RGBA:6, FLOAT:7, UNSIGNED_BYTE:8, NO_ERROR:0, TEXTURE_BINDING_2D:9, UNPACK_FLIP_Y_WEBGL:10,
    getParameter: key => state.get(key), createFramebuffer:()=>({}), deleteFramebuffer:()=>{},
    bindFramebuffer:(_, value)=>state.set(2,value), framebufferTexture2D:(_a,_b,_c,value)=>{attached=value},
    checkFramebufferStatus:()=>5, getError:()=>0, pixelStorei:(key,value)=>state.set(key,value),
    bindTexture:(_,value)=>{bound=value;state.set(9,value)},
    readPixels:(_x,_y,_w,_h,_format,_type,data)=>data.set(attached.data),
    texSubImage2D:(_t,_l,_x,_y,_w,_h,_format,_type,data)=>{bound.data=new Float32Array(data)},
  };
  const texture = { data: Float32Array.of(.123456789, -.25, 2, 1) };
  const buffer = { name:'history', flipFlop:false, textures:[{texture,width:1,height:1,float:true}],setSize:()=>{} };
  return { lastFrameIndex:0,lastTime:0,renderer:{gl,renderBuffers:[buffer]},texture };
}

test('two checkpoint stores share one byte ceiling, preserve float values and release evicted/disposed entries', () => {
  const budget = createHyperFramesIsfCheckpointBudget(32), a = checkpointSurface(), b = checkpointSurface();
  const left = createHyperFramesIsfCheckpointStore(a,{intervalFrames:1,maxBytes:128,budget});
  const right = createHyperFramesIsfCheckpointStore(b,{intervalFrames:1,maxBytes:128,budget});
  const original = [...a.texture.data];
  left.record(0); right.record(0); assert.equal(budget.diagnostics().bytes,32);
  a.texture.data.fill(0); left.restoreBefore(1); assert.deepEqual([...a.texture.data],original);
  left.record(1); assert.equal(right.diagnostics().count,0,'recently restored left entry wins over older right entry');
  assert.equal(budget.diagnostics().bytes,32); assert.equal(budget.diagnostics().evictions,1);
  right.record(1); assert.equal(left.diagnostics().count,1); assert.ok(budget.diagnostics().peakBytes<=32);
  left.clear(); right.clear(); assert.equal(budget.diagnostics().bytes,0); assert.equal(budget.diagnostics().entries,0);
});
