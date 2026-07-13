import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  analyzePlaybackTelemetry,
  deriveChangedIntervals,
  printCheckpoints,
  runRealtimePlaybackPass,
} from "../scripts/run-song-card-kiosk-soak.mjs";

const exec = promisify(execFile);

test("changed intervals drive exact before, inside, and after print checkpoints", () => {
  const before = { appearances: [{ appearanceId: "a1", trackId: "A", cueId: "cue", startMs: 1000, endMs: 3000, sourceCardId: "old", sourceDigest: "old" }] };
  const after = { appearances: [{ appearanceId: "a2", trackId: "A", cueId: "cue", startMs: 1000, endMs: 2800, sourceCardId: "new", sourceDigest: "new" }] };
  assert.deepEqual(deriveChangedIntervals(before, after), [{ startMs: 1000, endMs: 3000, appearanceKeys: ["A:cue"] }]);
  assert.deepEqual(printCheckpoints(deriveChangedIntervals(before, after), 5000).map((row) => row.timestampMs), [900, 2000, 3100]);
});

test("telemetry fails on decoded gaps, wall stalls, drops, and undeclared black intervals", () => {
  const bad = analyzePlaybackTelemetry({
    framePtsMs: [0, 33, 66, 500],
    frameWallMs: [0, 33, 66, 1000],
    progressSamples: [{ wallMs: 0, outTimeMs: 0, dropFrames: 0 }, { wallMs: 1800, outTimeMs: 1000, dropFrames: 2 }],
    blackIntervals: [{ startMs: 200, endMs: 600, durationMs: 400 }],
    expectedDurationMs: 1000,
    completed: true,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.presentationGaps.length, 1);
  assert.equal(bad.wallStalls.length, 1);
  assert.equal(bad.reportedDroppedFrames, 2);
  assert.equal(bad.unintendedBlackIntervals.length, 1);
});

test("the playback pass gathers real decoded-frame and real-time wall-clock evidence", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-kiosk-soak-"));
  t.after(() => fsp.rm(base, { recursive: true, force: true }));
  const filePath = path.join(base, "nonblack.mp4");
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=15:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", filePath]);
  const receipt = await runRealtimePlaybackPass({ filePath, edition: 1, cycle: 1, maxSeconds: 1, expectedDurationMs: 1000, realtime: true });
  assert.equal(receipt.method, "ffmpeg-realtime-decoded-frame-clock");
  assert.equal(receipt.telemetry.checks.completed, true);
  assert.ok(receipt.telemetry.frameCount >= 14);
  assert.equal(receipt.telemetry.unintendedBlackIntervals.length, 0);
  assert.ok(receipt.wallDurationMs >= 450, `wall clock ${receipt.wallDurationMs}ms must prove throttled playback rather than an unbounded fast decode`);
  assert.ok(receipt.telemetry.progressSampleCount >= 2);
});
