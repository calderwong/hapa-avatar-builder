import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mapEchoSourceTime, planEchoPlaybackCorrection } from "../src/domain/echo-playback-sync.js";

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

test("Echo preview keeps three persistent players, gates handoff, and never lacks a fallback", () => {
  const source = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(source, /persistent-echo-player-/);
  assert.match(source, /requestVideoFrameCallback/);
  assert.match(source, /data-frame-presented/);
  assert.match(source, /\[0, 1, 2\]\.map/);
  assert.match(source, /data-echo-fallback/);
  assert.match(source, /Echo player first-frame timeout/);
  assert.match(source, /<video[\s\S]{0,260}\sloop/);
  assert.match(source, /1000 \/ 30/);
  assert.match(source, /cameraMotionStyleForShot\(shot, Number\(clockRef/);
  assert.match(source, /echoPlaybackEngineRef\.current\?\.seek\(newTime\)/);
  assert.match(source, /decodeURIComponent\(value\)/);
  assert.doesNotMatch(source, /key=\{`\$\{currentTimelineItem\.media_id\}-\$\{currentTimelineItem\.start_sec\}`\}[\s\S]{0,120}<video/);
});
