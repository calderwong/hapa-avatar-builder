import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {
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
