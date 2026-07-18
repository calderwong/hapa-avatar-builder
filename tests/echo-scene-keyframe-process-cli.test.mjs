import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-keyframe-process-cli-"));
function run(args) {
  const result = spawnSync(process.execPath, ["scripts/echo-scene-keyframe-process.mjs", ...args], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, HAPA_ECHO_KEYFRAME_RUNTIME_ROOT: runtimeRoot },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("the live process initializes, exposes controls, and holds every video lane", () => {
  const report = run(["init", "--apply"]);
  assert.ok(report.process.countTotal > 0);
  assert.equal(report.process.keyframes.exists, 3);
  assert.equal(report.noOpenAIAPI, true);
  assert.equal(report.noVideoGeneration, true);
  assert.ok(fs.existsSync(report.processPath));
  const status = run(["status"]);
  assert.equal(status.process.countTotal, report.process.countTotal);
  assert.equal(status.process.lanes.video.quests.held, 3);
});

test("pause and resume controls are restart-safe and image claims remain blocked until prompts exist", () => {
  let report = run(["pause"]);
  assert.equal(report.process.status, "paused");
  report = run(["resume"]);
  assert.equal(report.process.status, "running");
  const image = run(["claim", "--lane", "image", "--limit", "1", "--runner-id", "test-runner", "--run-id", "test-image-empty"]);
  assert.equal(image.claims.length, 0);
  report = run(["pause"]);
  assert.equal(report.process.status, "paused");
});
