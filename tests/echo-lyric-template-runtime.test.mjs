import { echoLyricBoundary } from "../src/domain/echo-lyric-time.js";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {
  echoLyricAuthoredWordSurfaces,
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
    { word: "Animate", confidence: 0.9, start: 1, end: 1.5 },
    { word: "every", confidence: 0.9, start: 1.5, end: 2 },
    { word: "word", confidence: 0.9, start: 2, end: 2.5 },
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

test("aligned timing keeps exact authored endings and compound-word punctuation", () => {
  const source = {
    text: "But Giga-, Ultra-, and Omega-physics would tell ya’,",
    start: 0,
    end: 4,
    words: ["But", "Giga", "Ultra", "and", "Omega", "physics", "would", "tell", "ya"].map((word, index) => ({
      word,
      start: index / 3,
      end: (index + 1) / 3,
      matched: true,
    })),
  };
  assert.deepEqual(echoLyricAuthoredWordSurfaces(source), ["But", "Giga-,", "Ultra-,", "and", "Omega-", "physics", "would", "tell", "ya’,"]);
  const frame = resolveEchoLyricTemplateFrame({ contract: { enabled: true }, line: source, timeSeconds: 1 });
  assert.deepEqual(frame.words.map((word) => word.displayText), ["But", "Giga-,", "Ultra-,", "and", "Omega-", "physics", "would", "tell", "ya’,"]);
  assert.equal(frame.displayText, source.text);
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

test('missing, low and synthetic word confidence produces static phrase fallback without invented paging', () => {
  for (const [confidence, timingSource] of [[undefined,'forced-alignment'],[.4,'forced-alignment'],[.9,'synthetic-weighted-lyric-heal'],['0.9','forced-alignment']]) {
    const source = { text: 'whole phrase', start: 1, end: 10, words: Array.from({length: 24}, (_,i) => ({word: `w${i}`,start: 1+i/3,end:1+(i+1)/3,confidence})) };
    const before = JSON.stringify(source);
    const frame = resolveEchoLyricTemplateFrame({contract:{enabled:true,templateId:'kinetic-word-burst-v1',timingSource},line:source,timeSeconds:5});
    assert.equal(frame.timingPolicy.mode,'phrase');
    assert.equal(frame.displayWindow.wordCount,24);
    assert.ok(frame.words.every(word => !word.active && word.progress===0 && word.scale===1 && word.translateY===0));
    assert.equal(JSON.stringify(source),before);
  }
});

test('a fully unanchored canonical row is suppressed instead of flashing an invented interval', () => {
  const source={text:"I’d know her if I saw her,",start:99,end:99.2,words:["I’d","know","her","if","I","saw","her"].map((word,index)=>({word,start:99+index/35,end:99+(index+1)/35,matched:false}))};
  const frame=resolveEchoLyricTemplateFrame({contract:{enabled:true},line:source,timeSeconds:99.1});
  assert.equal(frame.timingPolicy.mode,'hidden');
  assert.equal(frame.timingPolicy.reason,'line-unaligned');
  assert.equal(frame.visible,false);
});

test('verified sustained words fill continuously and their onset emphasis does not retrigger', () => {
  const source={text:'sustain',start:0,end:3,words:[{word:'sustain',start:0,end:3,confidence:.9}]};
  const sample = timeSeconds => resolveEchoLyricTemplateFrame({contract:{enabled:true,templateId:'kinetic-word-burst-v1'},line:source,timeSeconds});
  assert.ok(sample(0).words[0].scale > sample(.1).words[0].scale);
  assert.equal(sample(.3).words[0].scale,sample(2).words[0].scale);
  assert.ok(sample(1).words[0].underlineProgress < sample(2).words[0].underlineProgress);
  assert.deepEqual(sample(1),sample(1));
  const reduced=resolveEchoLyricTemplateFrame({contract:{enabled:true,templateId:'orbit-caption-v1',reducedMotion:true},line:source,timeSeconds:1});
  assert.equal(reduced.words[0].scale,1);assert.equal(reduced.words[0].rotateDegrees,0);assert.equal(reduced.words[0].underlineProgress,1);
});

test('motion intensity changes displacement without changing the exact vocal interval or progress', () => {
  const config={templateId:'orbit-caption-v1',enabled:true};
  const full=resolveEchoLyricTemplateFrame({contract:{...config,motionIntensity:1},line,timeSeconds:1.5});
  const half=resolveEchoLyricTemplateFrame({contract:{...config,motionIntensity:.5},line,timeSeconds:1.5});
  const zero=resolveEchoLyricTemplateFrame({contract:{...config,motionIntensity:0},line,timeSeconds:1.5});
  assert.deepEqual(full.words.map(word=>word.active),zero.words.map(word=>word.active));
  assert.deepEqual(full.words.map(word=>word.progress),zero.words.map(word=>word.progress));
  assert.ok(zero.words.every(word=>word.scale===1&&word.translateY===0&&word.rotateDegrees===0));
  assert.equal(half.words[1].scale,1+(full.words[1].scale-1)/2);
});

test('explicit reviewed syllables drive sub-word progress without accepting inferred syllables', () => {
  const reviewed = {
    text: 'singing', start: 1, end: 2, words: [{ word: 'singing', start: 1, end: 2, syllables: [
      { text: 'sing', start: 1, end: 1.4, evidence: { humanReviewed: true, audioHash: 'sha256:source', reviewer: 'reviewer-1' } },
      { text: 'ing', start: 1.4, end: 2, evidence: { humanReviewed: true, audioHash: 'sha256:source', reviewer: 'reviewer-1' } },
    ] }],
  };
  const frame = resolveEchoLyricTemplateFrame({ contract: { enabled: true, templateId: 'kinetic-word-burst-v1' }, line: reviewed, timeSeconds: 1.7, fps: 30 });
  assert.equal(frame.timingPolicy.mode, 'syllable');
  assert.deepEqual(frame.words[0].syllables.map(item => item.active), [false, true]);
  assert.ok(frame.words[0].progress > .5 && frame.words[0].progress < 1);
  const inferred = structuredClone(reviewed);
  delete inferred.words[0].syllables[1].evidence;
  inferred.words[0].syllables[1].confidence = .9;
  assert.equal(resolveEchoLyricTemplateFrame({ contract: { enabled: true }, line: inferred, timeSeconds: 1.7 }).timingPolicy.mode, 'phrase');
});
