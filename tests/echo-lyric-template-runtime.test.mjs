import { echoLyricBoundary } from "../src/domain/echo-lyric-time.js";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {
  echoLyricDisplayWindow,
  echoLyricFrameTime,
  echoLyricTemplateRuntimeBrowserSource,
  resolveEchoLyricTemplateFrame,
} from "../src/domain/echo-lyric-template-runtime.js";

const line = {
  text: "Animate every word",
  start: 1,
  end: 2.5,
  words: [
    { word: "Animate", start: 1, end: 1.5 },
    { word: "every", start: 1.5, end: 2 },
    { word: "word", start: 2, end: 2.5 },
  ],
};

test("lyric template time is frame-quantized and repeatable", () => {
  assert.deepEqual(echoLyricFrameTime(1.234, 30), {
    frame: 37,
    fps: 30,
    timeSeconds: 1.233333,
  });
  const input = {
    project: { lyrics: { enabled: true, templateId: "kinetic-word-burst-v1" } },
    line,
    timeSeconds: 1.72,
    fps: 30,
  };
  assert.deepEqual(resolveEchoLyricTemplateFrame(input), resolveEchoLyricTemplateFrame(input));
});

test("all four templates preserve spoken-word activation intervals", () => {
  for (const templateId of [
    "kinetic-word-burst-v1",
    "scanline-phrase-ribbon-v1",
    "stacked-hook-echo-v1",
    "orbit-caption-v1",
  ]) {
    const frame = resolveEchoLyricTemplateFrame({
      project: { lyrics: { enabled: true, templateId } },
      line,
      timeSeconds: 1.72,
      fps: 30,
    });
    assert.equal(frame.templateId, templateId);
    assert.deepEqual(frame.words.map((word) => word.active), [false, true, false]);
    assert.ok(frame.words.every((word) => Number.isFinite(word.scale)));
  }
});

test("disabled contracts retain timing but emit no visible template frame", () => {
  const frame = resolveEchoLyricTemplateFrame({
    project: { lyrics: { enabled: false, templateId: "orbit-caption-v1" } },
    line,
    timeSeconds: 1.5,
  });
  assert.equal(frame.visible, false);
  assert.equal(frame.words.length, 3);
});

test("the exported HyperFrames browser runtime returns the same fixed-frame state", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${echoLyricTemplateRuntimeBrowserSource()};this.sample=echoLyricTemplateFrameState({
    templateId:"orbit-caption-v1",
    enabled:true,
    line:${JSON.stringify(line)},
    timeSeconds:1.72,
    fps:30
  });`, context);
  const preview = resolveEchoLyricTemplateFrame({
    project: { lyrics: { enabled: true, templateId: "orbit-caption-v1" } },
    line,
    timeSeconds: 1.72,
    fps: 30,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.sample)), preview);
});

test("long measured transcript spans page into deterministic readable word windows", () => {
  const words = Array.from({ length: 23 }, (_, index) => ({
    word: `word${index}`,
    start: index,
    end: index + 1,
  }));
  assert.deepEqual(
    echoLyricDisplayWindow({ templateId: "kinetic-word-burst-v1", words, timeSeconds: 9.5, lineStart: 0, lineEnd: 23 }),
    {
      startIndex: 7,
      endIndex: 14,
      wordCount: 7,
      text: "word7 word8 word9 word10 word11 word12 word13",
    },
  );
});


test("timestamp aliases preserve zero and measured pagination rather than line-start fallback", () => {
  assert.equal(echoLyricBoundary({ start: 0, startSeconds: 9 }, "start", 4), 0);
  assert.equal(echoLyricBoundary({ startSeconds: "1.5" }, "start"), 1.5);
  assert.equal(echoLyricBoundary({ startSeconds: "bad" }, "start", 4), 4);
  assert.equal(echoLyricBoundary({ start: "" }, "start", 4), 4);
  const words = Array.from({ length: 23 }, (_, index) => ({ word: `word${index}`, startSeconds: index, endSeconds: index + 1 }));
  const window = echoLyricDisplayWindow({ templateId: "kinetic-word-burst-v1", words, timeSeconds: 9.5, lineStart: 0, lineEnd: 23 });
  assert.equal(window.startIndex, 7);
  assert.equal(window.endIndex, 14);
});


test("exact frame clocks do not slip a frame through floating-point multiplication", () => {
  for (const fps of [24, 25, 30, 60]) {
    for (let frame = 0; frame < fps * 600; frame += 7) {
      assert.equal(echoLyricFrameTime(frame / fps, fps).frame, frame);
    }
  }
});
