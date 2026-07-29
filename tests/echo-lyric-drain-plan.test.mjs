import assert from "node:assert/strict";
import test from "node:test";
import { classifyEchoLyricDrainQueue } from "../src/domain/echo-lyric-drain-plan.js";

test("lyric drain routes missing source identity before alignment", () => {
  assert.equal(classifyEchoLyricDrainQueue({
    manifestSongFound: false,
  }), "source-reconciliation");
});

test("canonical text review cannot be mistaken for a timing promotion", () => {
  assert.equal(classifyEchoLyricDrainQueue({
    manifestSongFound: true,
    issues: ["canonical-text-review"],
    timingFound: true,
    timingParsed: true,
    promotionAccepted: true,
  }), "manual-review");
});

test("timing state separates alignment, review, and promotion queues", () => {
  assert.equal(classifyEchoLyricDrainQueue({
    manifestSongFound: true,
  }), "align");
  assert.equal(classifyEchoLyricDrainQueue({
    manifestSongFound: true,
    timingFound: true,
  }), "manual-review");
  assert.equal(classifyEchoLyricDrainQueue({
    manifestSongFound: true,
    timingFound: true,
    timingParsed: true,
    promotionAccepted: true,
  }), "promote");
});
