import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ECHO_TRANSITION_TIME_MAPPING_MODE,
  ECHO_TRANSITION_TIME_MAPPING_SCHEMA,
  echoSourceWindowPlaybackRate,
  mapEchoSourceTime,
  mapEchoSourceWindowTime,
  normalizeEchoTransitionTimeMapping,
  planEchoPlaybackCorrection,
} from "../src/domain/echo-playback-sync.js";

test("Echo sync rate-corrects small drift and seeks only at cue entry or large drift", () => {
  assert.deepEqual(planEchoPlaybackCorrection({ expectedSeconds: 2, currentSeconds: 1, seeking: true }).action, "none");
  const small = planEchoPlaybackCorrection({ expectedSeconds: 2.2, currentSeconds: 2 });
  assert.equal(small.action, "rate");
  assert.ok(small.playbackRate >= 0.96 && small.playbackRate <= 1.04);
  assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 2.5, currentSeconds: 2 }).action, "rate");
  assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 3, currentSeconds: 2 }).action, "seek");
  assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 2.1, currentSeconds: 2, cueEntry: true }).action, "seek");
});

test("source time loops before the undecodable end boundary", () => {
  assert.ok(Math.abs(mapEchoSourceTime({ elapsedSeconds: 4.5, durationSeconds: 4 }) - 0.56) < 1e-9);
  assert.equal(mapEchoSourceTime({ elapsedSeconds: 4.5, durationSeconds: 4, loop: false }), 3.94);
  assert.equal(mapEchoSourceTime({ elapsedSeconds: 2, durationSeconds: 0 }), 2);
});

test("source window time never escapes an explicit Director clip bound", () => {
  assert.equal(mapEchoSourceWindowTime({
    elapsedSeconds: 0,
    durationSeconds: 20,
    sourceInSeconds: 4,
    sourceOutSeconds: 5.5,
    loop: true,
  }), 4);
  assert.ok(Math.abs(mapEchoSourceWindowTime({
    elapsedSeconds: 2,
    durationSeconds: 20,
    sourceInSeconds: 4,
    sourceOutSeconds: 5.5,
    loop: true,
  }) - 4.56) < 1e-9);
  assert.ok(Math.abs(mapEchoSourceWindowTime({
    elapsedSeconds: 99,
    durationSeconds: 20,
    sourceInSeconds: 4,
    sourceOutSeconds: 5.5,
    loop: false,
  }) - 5.44) < 1e-9);
});

test("an explicit authored-transition map fits the full source exactly once across a shorter cue", () => {
  const declared = {
    schemaVersion: ECHO_TRANSITION_TIME_MAPPING_SCHEMA,
    mode: ECHO_TRANSITION_TIME_MAPPING_MODE,
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    sourceDurationSeconds: 5,
    cueDurationSeconds: 2,
    cueSampleSpanSeconds: 2 - (1 / 30),
    outputFps: 30,
    playbackRate: 5 / (2 - (1 / 30)),
    valid: true,
    reachesDeclaredLastFrame: true,
  };
  const normalized = normalizeEchoTransitionTimeMapping(declared, {
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    cueDurationSeconds: 2,
  });
  assert.deepEqual(normalized, declared);
  assert.equal(echoSourceWindowPlaybackRate({
    timeMapping: declared,
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    cueDurationSeconds: 2,
  }), 5 / (2 - (1 / 30)));
  assert.equal(mapEchoSourceWindowTime({
    elapsedSeconds: 0,
    durationSeconds: 8,
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    loop: false,
    cueDurationSeconds: 2,
    timeMapping: declared,
  }), 0);
  assert.ok(Math.abs(mapEchoSourceWindowTime({
    elapsedSeconds: 1,
    durationSeconds: 8,
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    loop: false,
    cueDurationSeconds: 2,
    timeMapping: declared,
  }) - (5 / (2 - (1 / 30)))) < 0.000001);
  assert.equal(mapEchoSourceWindowTime({
    elapsedSeconds: 1.966667,
    durationSeconds: 8,
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    loop: false,
    endGuardSeconds: 0.03,
    cueDurationSeconds: 2,
    timeMapping: declared,
  }), 5);

  const correction = planEchoPlaybackCorrection({
    expectedSeconds: 5 / (2 - (1 / 30)),
    currentSeconds: 5 / (2 - (1 / 30)),
    targetPlaybackRate: 5 / (2 - (1 / 30)),
  });
  assert.equal(correction.action, "none");
  assert.equal(correction.playbackRate, 5 / (2 - (1 / 30)));
});

test("ordinary loop and once playback ignore absent or inconsistent transition maps", () => {
  const stale = {
    mode: ECHO_TRANSITION_TIME_MAPPING_MODE,
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    cueDurationSeconds: 1,
    playbackRate: 5,
  };
  assert.equal(normalizeEchoTransitionTimeMapping(stale, {
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    cueDurationSeconds: 2,
  }), null);
  assert.equal(mapEchoSourceWindowTime({
    elapsedSeconds: 2,
    durationSeconds: 8,
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    loop: false,
    cueDurationSeconds: 2,
    timeMapping: stale,
  }), 2);
  assert.equal(echoSourceWindowPlaybackRate({
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    cueDurationSeconds: 2,
  }), 1);
});

test("Echo preview keeps three persistent players, gates handoff, and never lacks a fallback", () => {
  const source = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(source, /persistent-echo-player-/);
  assert.match(source, /requestVideoFrameCallback/);
  assert.match(source, /data-frame-presented/);
  assert.match(source, /\[0, 1, 2\]\.map/);
  assert.match(source, /data-echo-fallback/);
  assert.match(source, /Echo player first-frame timeout/);
  assert.match(source, /video\.loop = playbackMode === "loop" && !timeMapping/);
  assert.match(source, /1000 \/ 30/);
  assert.match(source, /const cameraTime = Number\(clockRef\?\.current \?\? songTime\)/);
  assert.match(source, /const cameraKeyframe = echoCameraKeyframeAt\(cameraKeyframes, cameraTime\)/);
  assert.match(source, /cameraKeyframe\?\.crop \|\| null/);
  assert.match(source, /echoPlaybackEngineRef\.current\?\.seek\(newTime\)/);
  assert.match(source, /decodeURIComponent\(value\)/);
  assert.doesNotMatch(source, /key=\{`\$\{currentTimelineItem\.media_id\}-\$\{currentTimelineItem\.start_sec\}`\}[\s\S]{0,120}<video/);
});
