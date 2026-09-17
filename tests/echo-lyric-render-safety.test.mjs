import test from "node:test";
import assert from "node:assert/strict";
import {
  benchmarkEchoLyricTemplateRuntime,
  echoLyricSafetySampleTimes,
  inspectEchoLyricRenderSafety,
} from "../src/domain/echo-lyric-render-safety.js";

const good = {
  duration: 8,
  lyrics: { enabled: true, templateId: "kinetic-word-burst-v1", position: "bottom-center", style: "neon-cyan" },
  timed_lyrics: [{
    text: "Safe readable words",
    start: 1,
    end: 3,
    words: [
      { word: "Safe", start: 1, end: 1.5 },
      { word: "readable", start: 1.5, end: 2.4 },
      { word: "words", start: 2.4, end: 3 },
    ],
  }],
};

test("all templates pass bounded motion in landscape, vertical, and square fixtures", () => {
  const profiles = [
    { id: "landscape", width: 1920, height: 1080, aspectRatio: "16:9" },
    { id: "vertical", width: 1080, height: 1920, aspectRatio: "9:16" },
    { id: "square", width: 1080, height: 1080, aspectRatio: "1:1" },
  ];
  for (const templateId of ["kinetic-word-burst-v1", "scanline-phrase-ribbon-v1", "stacked-hook-echo-v1", "orbit-caption-v1", "center-word-focus-v1", "square-word-mosaic-v1", "letter-wave-v1", "kinetic-typewriter-v1", "vertical-poster-stack-v1", "prism-slam-v1", "letterfall-totem-v1"]) {
    for (const outputProfile of profiles) {
      const report = inspectEchoLyricRenderSafety({
        project: { ...good, lyrics: { ...good.lyrics, templateId } },
        outputProfile,
      });
      assert.equal(report.ok, true, `${templateId} ${outputProfile.aspectRatio}`);
    }
  }
});

test("unreadable, clipped, over-fast, and stale timing fixtures fail with timestamps", () => {
  const report = inspectEchoLyricRenderSafety({
    project: {
      duration: 2,
      lyrics: { enabled: true, templateId: "orbit-caption-v1", position: "outside-frame", style: "unknown-low-contrast" },
      timed_lyrics: [{
        text: "x".repeat(200),
        start: 1,
        end: 1.05,
        words: [],
      }],
    },
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.length >= 4);
  assert.ok(report.issues.some((issue) => Number.isFinite(issue.timestampSeconds)));
});

test("boundary samples include before, start, middle, end, and after", () => {
  assert.deepEqual(echoLyricSafetySampleTimes(good.timed_lyrics, 10), [.9, 1, 2, 2.9, 3.1]);
});

test("degenerate word windows are clamped by the runtime and never fail safety", () => {
  const report = inspectEchoLyricRenderSafety({
    project: {
      duration: 8,
      lyrics: { enabled: true, templateId: "scanline-phrase-ribbon-v1", position: "bottom-center", style: "neon-cyan" },
      timed_lyrics: [{
        text: "Zero width word",
        start: 1,
        end: 4,
        words: [
          { word: "Zero", start: 1, end: 1 },
          { word: "width", start: 1.4 },
          { word: "word", start: 2, end: 2.2 },
        ],
      }],
    },
  });
  assert.equal(report.issues.some((issue) => issue.code === "invalid-word-window"), false, "the 1 ms runtime clamp makes zero/missing word windows harmless");
  assert.equal(report.ok, true);
});

test("template runtime remains inside the offline and Preview frame budget", () => {
  const report = benchmarkEchoLyricTemplateRuntime({ iterations: 2_000 });
  assert.equal(report.ok, true);
  assert.ok(report.perFrameMs <= report.budgetMs);
});
