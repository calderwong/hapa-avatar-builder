import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  analyzeKeyframeTimestamps,
  ensureHyperFramesLoopCoverage,
  inspectHyperFramesLoopCoverage,
  parseHyperFramesVideoSlots,
} from "../server/hyperframes-loop-coverage.mjs";
import { summarizeHyperFramesFailure } from "../server/song-card-local-renderer.mjs";

const run = promisify(execFile);
const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

test("loop coverage inspection catches only looped clips that cannot fill their authored windows", () => {
  const slots = parseHyperFramesVideoSlots(`
    <video id="short-loop" src="assets/short.mp4" data-start="0" data-end="6" loop muted></video>
    <video id="short-once" src="assets/once.mp4" data-start="6" data-duration="6" muted></video>
    <video id="enough-loop" src="assets/enough.mp4" data-start="12" data-end="18" muted loop></video>
  `);
  const report = inspectHyperFramesLoopCoverage({
    slots,
    durationBySource: {
      "assets/short.mp4": 4.8,
      "assets/once.mp4": 4.8,
      "assets/enough.mp4": 6,
    },
    fps: 30,
  });
  assert.equal(report.ok, false);
  assert.equal(report.gapCount, 1);
  assert.equal(report.gaps[0].id, "short-loop");
  assert.equal(report.gaps[0].expectedFrames, 180);
  assert.equal(report.gaps[0].availableFrames, 144);
});

test("keyframe interval inspection matches HyperFrames' two-second seek-safety boundary", () => {
  assert.deepEqual(analyzeKeyframeTimestamps([0, 1, 2]), {
    keyframeCount: 3,
    maxIntervalSeconds: 1,
    sparse: false,
  });
  assert.deepEqual(analyzeKeyframeTimestamps([0, 3.04, 4]), {
    keyframeCount: 3,
    maxIntervalSeconds: 3.04,
    sparse: true,
  });
});

test("packaged loop fill extends a short source without modifying the authored HTML", { skip: !HAS_FFMPEG, timeout: 30_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-loop-coverage-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const mediaDirectory = path.join(root, "assets");
  const videoPath = path.join(mediaDirectory, "short.mp4");
  await fsp.mkdir(mediaDirectory, { recursive: true });
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=cyan:s=320x180:r=30:d=0.4",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath,
  ]);
  const html = '<video id="short-loop" src="assets/short.mp4" data-start="0" data-duration="0.75" loop muted playsinline></video>';
  await fsp.writeFile(path.join(root, "index.html"), html);

  const repaired = await ensureHyperFramesLoopCoverage({ projectDirectory: root, fps: 30 });
  assert.equal(repaired.ok, true, JSON.stringify(repaired, null, 2));
  assert.equal(repaired.repairCount, 1);
  assert.equal(repaired.after.gapCount, 0);
  assert.equal(await fsp.readFile(path.join(root, "index.html"), "utf8"), html);

  const repeated = await ensureHyperFramesLoopCoverage({ projectDirectory: root, fps: 30 });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.repairCount, 0);
});

test("HyperFrames coverage failures retain the useful encoder reason", () => {
  const message = summarizeHyperFramesFailure({
    stdout: 'Video "m33" captured 144 of expected 173 frames (coverage 83.2%, threshold 95.0%). (+6 more clip(s) below threshold)',
    message: "HyperFrames exited with code 1.",
  });
  assert.match(message, /packaged loop was shorter/iu);
  assert.match(message, /m33/);
  assert.doesNotMatch(message, /^HyperFrames exited/iu);
});

test("packaged normalization replaces sparse keyframes with one-second seek points", { skip: !HAS_FFMPEG, timeout: 30_000 }, async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-keyframe-coverage-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const mediaDirectory = path.join(root, "assets");
  const videoPath = path.join(mediaDirectory, "sparse.mp4");
  await fsp.mkdir(mediaDirectory, { recursive: true });
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=magenta:s=320x180:r=30:d=4.2",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-g", "90", "-keyint_min", "90", "-sc_threshold", "0",
    videoPath,
  ]);
  await fsp.writeFile(
    path.join(root, "index.html"),
    '<video id="sparse-loop" src="assets/sparse.mp4" data-start="0" data-duration="4" muted loop></video>',
  );

  const report = await ensureHyperFramesLoopCoverage({ projectDirectory: root, fps: 30 });
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.repairCount, 1);
  assert.deepEqual(report.repairs[0].reasons, ["sparse-keyframes"]);
  assert.ok(report.repairs[0].originalMaxKeyframeIntervalSeconds > 2);
  assert.ok(report.repairs[0].repairedMaxKeyframeIntervalSeconds <= 1.01);
  assert.equal(report.sparseKeyframesAfterCount, 0);
});
