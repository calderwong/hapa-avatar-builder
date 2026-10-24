import test from "node:test";
import assert from "node:assert/strict";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback } from "../src/domain/echo-visual-score.js";
import { createScoreDustPerformance, buildScoreDustMotion, scoreDerivedBands, SCORE_DUST_STEP_HZ } from "../src/domain/echo-score-dust-performance.js";
import { sampleDustTargetsFromPixels } from "../src/domain/echo-dust-swarm.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const score = composeEchoVisualScore(timeline, { phrases: [{ text: "to the edge", start: 124, end: 128 }] });
const playback = prepareEchoScorePlayback(score, timeline);
const settings = { seed: 77, particleCount: 600, prerollSeconds: 1.5 };

function wordPixels() {
  const width = 24, height = 8, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 22; x++) if (x % 5) data.set([255, 255, 255, 255], (y * width + x) * 4);
  return { width, height, data };
}
const phraseTargets = (phrase, count, seed) => sampleDustTargetsFromPixels(wordPixels(), { count, seed });

test("frame rate does not change the simulation: 24, 30 and 60 fps reach the same state", () => {
  const run = (fps) => {
    const performance = createScoreDustPerformance({ playback, settings, phraseTargets });
    for (let frame = 0; frame <= Math.round(4 * fps); frame++) performance.advanceTo(95 + frame / fps);
    return performance.swarm.fingerprint();
  };
  assert.equal(run(24), run(60));
  assert.equal(run(30), run(60));
});

test("a seek, a second seek and an export start at the same time render identically", () => {
  const exported = createScoreDustPerformance({ playback, settings });
  exported.advanceTo(98.2);
  const previewed = createScoreDustPerformance({ playback, settings });
  previewed.advanceTo(10); previewed.advanceTo(12);
  const jump = previewed.advanceTo(98.2);
  assert.equal(jump.reset, true, "long jumps restart from the seeded state");
  assert.equal(previewed.swarm.fingerprint(), exported.swarm.fingerprint());
  const back = previewed.advanceTo(98.2 - 5);
  assert.equal(back.reset, true, "backward seeks restart too");
  assert.equal(previewed.diagnostics().resets, 3);
});

test("pausing holds the exact frame and short advances never restart", () => {
  const performance = createScoreDustPerformance({ playback, settings });
  performance.advanceTo(50);
  const held = performance.swarm.fingerprint();
  performance.advanceTo(50.004);
  assert.equal(performance.swarm.fingerprint(), held, "no new grid step inside 1/60 s");
  assert.equal(performance.advanceTo(51).reset, false);
  assert.equal(performance.diagnostics().simulatedTime, Math.floor(51 * SCORE_DUST_STEP_HZ) / SCORE_DUST_STEP_HZ);
});

test("closed-form spin and yaw are continuous and phrases face the viewer", () => {
  const motion = buildScoreDustMotion(score);
  for (const { start } of motion.segments.slice(1)) {
    assert.ok(Math.abs(motion.rotationAt(start + 1e-7) - motion.rotationAt(start - 1e-7)) < 1e-4, `spin jump at ${start}`);
    assert.ok(Math.abs(motion.yawAt(start + 1e-7) - motion.yawAt(start - 1e-7)) < 1e-4, `yaw jump at ${start}`);
  }
  const facing = motion.rotationAt(127.9), turn = Math.round(facing / (2 * Math.PI)) * 2 * Math.PI;
  assert.ok(Math.abs(facing - turn) < 1e-3, "spin eased to a whole turn by the end of the phrase");
  assert.ok(motion.faceAt(127) > 0.95 && motion.faceAt(120) === 0 && motion.faceAt(130) < 0.01);
});

test("lifts launch a shock and phrases become word targets inside the performance", () => {
  const performance = createScoreDustPerformance({ playback, settings, phraseTargets });
  performance.advanceTo(97.6); performance.advanceTo(97.85);
  assert.ok(performance.swarm.activeShocks >= 1);
  performance.advanceTo(125);
  assert.equal(performance.swarm.formation, "points");
  assert.match(performance.diagnostics().formationKey, /^phrase:/);
  performance.advanceTo(129.5);
  assert.notEqual(performance.swarm.formation, "points");
  const camera = performance.camera(127, playback.stateAt(127));
  assert.ok(Math.abs(camera.pitch) < 0.02, "camera levels for reading");
});

test("score-derived bands are deterministic, bounded and follow intensity", () => {
  const quiet = scoreDerivedBands(playback.stateAt(4)), loud = scoreDerivedBands(playback.stateAt(120));
  assert.ok([...quiet, ...loud].every((v) => v >= 0 && v <= 1));
  assert.ok(loud.reduce((a, b) => a + b) > quiet.reduce((a, b) => a + b));
  assert.deepEqual([...scoreDerivedBands(playback.stateAt(120))], [...loud]);
});
