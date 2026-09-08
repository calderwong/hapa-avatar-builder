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
  echoDecodedPlaybackPhase,
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

test("Echo preview shares the bounded persistent player budget, gates handoff, and never repeats clips", () => {
  const source = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(source, /persistent-echo-player-/);
  assert.match(source, /requestVideoFrameCallback/);
  assert.match(source, /data-frame-presented/);
  assert.match(source, /const ECHO_VIDEO_LOOKAHEAD_COUNT = ECHO_PLAYER_POOL_LIMIT - 1/);
  assert.match(source, /ECHO_VIDEO_PLAYER_INDICES\.map/);
  assert.match(source, /data-echo-fallback/);
  assert.match(source, /Echo player first-frame timeout/);
  assert.match(source, /video\.loop = false/);
  assert.match(source, /holdingLastFrame/);
  assert.match(source, /Lookahead video failed/);
  assert.match(source, /1000 \/ 30/);
  assert.ok(source.includes("const time = playing ? outputFrame / fps : seconds;"));
  assert.match(source, /const cameraKeyframe = echoCameraKeyframeAt\(cameraPaths\.get\(cameraCueKey\(targetShot\)\) \|\| keyframes, time\)/);
  assert.match(source, /cameraKeyframe\?\.crop \|\| null/);
  assert.match(source, /echoPlaybackEngineRef\.current\?\.seek\(newTime\)/);
  assert.match(source, /decodeURIComponent\(value\)/);
  assert.doesNotMatch(source, /key=\{`\$\{currentTimelineItem\.media_id\}-\$\{currentTimelineItem\.start_sec\}`\}[\s\S]{0,120}<video/);
});

test('correction uses song-time error consistently for slow and fast source windows', () => {
  for (const rate of [.25, .5, 1, 2.5, 5]) {
    for (const sign of [-1, 1]) {
      const plan = seconds => planEchoPlaybackCorrection({ expectedSeconds: 10 + sign * seconds * rate, currentSeconds: 10, targetPlaybackRate: rate });
      assert.equal(plan(.015).action, 'none');
      assert.equal(plan(.03).action, 'rate');
      assert.ok(Math.abs(plan(.03).playbackRate / rate - (1 + sign * .03)) < 1e-10);
      assert.equal(plan(.9).action, 'seek');
      assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 10 + sign * .035 * rate, currentSeconds: 10, targetPlaybackRate: rate, cueEntry: true }).action, 'seek');
      let expected = 10, current = 10 - sign * .09 * rate;
      for (let frame = 0; frame < 90; frame++) {
        const correction = planEchoPlaybackCorrection({ expectedSeconds: expected, currentSeconds: current, targetPlaybackRate: rate });
        assert.notEqual(correction.action, 'seek', 'moderate steady-play error converges without repeated seeking');
        assert.ok(correction.playbackRate >= .96 * rate - 1e-9 && correction.playbackRate <= 1.04 * rate + 1e-9);
        expected += rate / 30; current += correction.playbackRate / 30;
      }
      assert.ok(Math.abs(expected - current) / rate < .025, `rate=${rate}, sign=${sign}: within 25ms after three seconds`);
    }
  }
});


function observedPhase({ expected = 10, mediaTime = 9.95, rate = 1, now = 1000 } = {}) {
  return { eligible: true, route: 'decoded-frame-callback', clock: { playing: true, status: 'output-timestamp-estimate' },
    nowMs: now, expectedDisplayTimeMs: now + 10, sourceRate: rate, mediaTime, audibleExpectedSourceTime: expected };
}

test('decoded presentation corrects a late displayed frame even when the element clock is aligned', () => {
  const fallback = planEchoPlaybackCorrection({ expectedSeconds: 10, currentSeconds: 10 });
  const actual = planEchoPlaybackCorrection({ expectedSeconds: 10, currentSeconds: 10, presentedSample: observedPhase(), nowMs: 1000 });
  assert.equal(fallback.action, 'none'); assert.equal(actual.route, 'decoded-presentation'); assert.equal(actual.action, 'rate');
  assert.equal(actual.playbackRate, 1.04);
  const acquire = planEchoPlaybackCorrection({ expectedSeconds: 10, currentSeconds: 10, presentedSample: observedPhase(), nowMs: 1000, cueEntry: true });
  assert.ok(Math.abs(acquire.targetSeconds - 10.05) < 1e-10, 'a phase seek retains measured frame lag');
});

test('invalid, stale, seeking and incompatible frame observations retain element-clock behavior', () => {
  const valid = observedPhase();
  for (const patch of [{ eligible: false }, { route: 'element-time-fallback' }, { clock: { playing: false } },
    { nowMs: 1001 }, { nowMs: 899 }, { expectedDisplayTimeMs: 1200 }, { mediaTime: NaN },
    { audibleExpectedSourceTime: null }, { sourceRate: 5 }]) {
    const sample = { ...valid, ...patch };
    assert.equal(echoDecodedPlaybackPhase(sample, { nowMs: 1000 }), null);
    assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 10, currentSeconds: 10, nowMs: 1000, presentedSample: sample }).route, 'element-clock');
  }
  assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 10, currentSeconds: 10, nowMs: 1000, presentedSample: valid, seeking: true }).action, 'none');
  for (const sign of [-1, 1]) {
    const correction = planEchoPlaybackCorrection({ expectedSeconds: 10, currentSeconds: 10, presentedSample: observedPhase({ mediaTime: 10 - sign }), nowMs: 1000, cueEntry: true, minimumSeconds: 9.99, maximumSeconds: 10.01 });
    assert.ok(correction.targetSeconds >= 9.99 && correction.targetSeconds <= 10.01, 'phase recovery cannot escape authored clip bounds');
  }
});

test('presentation feedback converges with decoder phase lag across source rates without repeated seeks', () => {
  for (const rate of [.25, .5, 1, 2.5, 5]) for (const lag of [-.025, .035, .08]) {
    let expected = 10, element = 10, finalResidual;
    for (let n = 0; n < 120; n++) {
      // Plant observation: the displayed timestamp differs from the element
      // clock by a fixed decode/presentation phase, independent of controller.
      const media = element - lag * rate;
      const sample = observedPhase({ expected, mediaTime: media, rate, now: n * 1000 / 30 });
      const correction = planEchoPlaybackCorrection({ expectedSeconds: expected, currentSeconds: element, targetPlaybackRate: rate, presentedSample: sample, nowMs: sample.nowMs });
      assert.notEqual(correction.action, 'seek');
      assert.ok(correction.playbackRate >= .96 * rate - 1e-9 && correction.playbackRate <= 1.04 * rate + 1e-9);
      finalResidual = (expected - media) / rate;
      expected += rate / 30; element += correction.playbackRate / 30;
    }
    assert.ok(Math.abs(finalResidual) < .005, `rate=${rate}, lag=${lag}: ${finalResidual}`);
  }
});


test('paused source positioning removes subframe drift instead of applying a rate nudge', () => {
  for (const currentSeconds of [2.030992, 1.98]) {
    const result = planEchoPlaybackCorrection({ expectedSeconds: 2, currentSeconds, paused: true });
    assert.equal(result.action, 'seek');
    assert.equal(result.targetSeconds, 2);
    assert.equal(result.playbackRate, 1);
  }
  assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 2, currentSeconds: 2 + 1e-8, paused: true }).action, 'none');
  const clamped = planEchoPlaybackCorrection({ expectedSeconds: 3, currentSeconds: 2, paused: true, minimumSeconds: 1, maximumSeconds: 2.5 });
  assert.equal(clamped.targetSeconds, 2.5);
  assert.equal(planEchoPlaybackCorrection({ expectedSeconds: 2, currentSeconds: 1.9, paused: true, seeking: true }).action, 'none');
});
