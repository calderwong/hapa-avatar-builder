import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createEchoEmptyShaderMedia } from "../src/domain/echo-empty-shader-media.js";
import { createEchoIsfHistoryMedia } from "../src/domain/echo-isf-history-media.js";

function canvasFactory() {
  let created = 0, clears = 0;
  return { get created() { return created; }, get clears() { return clears; }, createCanvas() {
    created++;
    return { dataset: {}, getContext(type, options) {
      assert.equal(type, "2d"); assert.equal(options.alpha, true);
      return { clearRect(...args) { clears++; assert.deepEqual(args, [0, 0, 1, 1]); } };
    } };
  } };
}

test("only explicitly unscheduled intervals provide a bounded transparent shader input", () => {
  const factory = canvasFactory(), empty = createEchoEmptyShaderMedia(factory);
  for (const state of [true, undefined, null, 0]) assert.equal(empty.at(state), null);
  assert.equal(factory.created, 0);
  const frame = empty.at(false);
  assert.equal(frame.element.width, 1); assert.equal(frame.element.height, 1);
  assert.equal(frame.receipt.route, "empty-media-interval");
  assert.equal(frame.receipt.sourceHash, null);
  assert.equal(empty.at(false), frame);
  assert.equal(factory.created, 1); assert.equal(factory.clears, 1);
});

test("historical gaps never promote missing scheduled media into ready pixels", async () => {
  const factory = canvasFactory();
  const decoder = createEchoIsfHistoryMedia({ createElement: tag => {
    assert.equal(tag, "canvas"); return factory.createCanvas();
  } });
  assert.equal((await decoder.at(null, 258.4)).element, null);
  const frame = await decoder.at(null, 258.4, { emptyInterval: true });
  assert.equal(frame.receipt.route, "empty-media-interval");
  assert.equal((await decoder.at(null, 258.433333, { emptyInterval: true })).element, frame.element);
  assert.equal((await decoder.at({ media: { kind: "video" } }, 1, { emptyInterval: true })).element, null);
  decoder.dispose();
  await assert.rejects(decoder.at(null, 1, { emptyInterval: true }), /cancelled/);
});

test("compiled HyperFrames preserves media end, distinguishes decode failure, and handles the terminal frames", () => {
  const source = fs.readFileSync("scripts/compile-hyperframes-show-v2.mjs", "utf8");
  const body = source.slice(source.indexOf("function cameraFramedMediaElement(t,mediaInput){"), source.indexOf("\nfunction liveIsfSurface"));
  const factory = canvasFactory(), emptyShaderMedia = createEchoEmptyShaderMedia(factory);
  const instance = { start: 255.4, end: 258.4, duration: 3 };
  const original = structuredClone(instance);
  const present = vm.runInNewContext(body + ";cameraFramedMediaElement", {
    S: { instances: { media: [instance] } }, emptyShaderMedia,
    finite: (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
    mediaReadyForShader: () => false, shaderMediaContext: {},
  });
  assert.equal(present(258.3666667, null), null, "scheduled undecoded clip must remain unavailable");
  for (const time of [258.4, 258.433333333, 258.44, 10, 258.4]) {
    const frame = present(time, null);
    assert.equal(frame.dataset.echoFrameRoute, "empty-media-interval");
  }
  assert.equal(present(258.3, null), null, "reverse seek must not reuse the blank texture for scheduled footage");
  assert.deepEqual(instance, original, "do not extend authored fade-out/cut bounds");
});
