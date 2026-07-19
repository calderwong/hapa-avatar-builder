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

test("operator can increase bounded throughput without rebuilding the process", () => {
  const before = run(["status"]);
  const report = run(["configure", "--concurrency", "4", "--per-run-claim-limit", "4"]);
  assert.equal(report.configured, true);
  assert.equal(report.process.countTotal, before.process.countTotal);
  const state = JSON.parse(fs.readFileSync(report.processPath, "utf8"));
  assert.equal(state.settings.concurrency, 4);
  assert.equal(state.settings.perRunClaimLimit, 4);
  assert.ok(state.events.some((event) => event.type === "process-settings-configured"));
});

test("image claim forwards every count-selected Avatar seed from the completed prompt", () => {
  run(["resume"]);
  const promptClaim = run(["claim", "--lane", "prompt", "--limit", "1", "--runner-id", "cast-test", "--run-id", "cast-prompt"]);
  assert.equal(promptClaim.claims.length, 1);
  const green = path.join(runtimeRoot, "green-seed.png");
  const bella = path.join(runtimeRoot, "bella-seed.png");
  fs.writeFileSync(green, "green");
  fs.writeFileSync(bella, "bella");
  const resultPath = path.join(runtimeRoot, "cast-prompt-result.json");
  fs.writeFileSync(resultPath, JSON.stringify({
    sceneText: "Green and Bella pull the same rope from opposite sides.",
    gptImagePrompt: "Cinematic two-character rope handoff.",
    negativePrompt: "no text",
    justification: "The shared action makes the lyric relationship visible.",
    evidence: { castAppearances: [{ avatarId: "avatar-3", presence: "on_screen" }, { avatarId: "pinokio-bella", presence: "on_screen" }] },
    seedUse: [
      { avatarId: "avatar-3", assetId: "green", castRole: "primary", retrievalHandle: green },
      { avatarId: "pinokio-bella", assetId: "bella", castRole: "referenced", retrievalHandle: bella },
    ],
    continuity: { carriesFromPrevious: "rope", preparesNext: "handoff" },
  }));
  run(["prompt-complete", "--quest-id", promptClaim.claims[0].questId, "--runner-id", "cast-test", "--result", resultPath]);
  const imageClaim = run(["claim", "--lane", "image", "--limit", "1", "--runner-id", "cast-test", "--run-id", "cast-image"]);
  assert.equal(imageClaim.claims.length, 1);
  assert.deepEqual(imageClaim.claims[0].evidencePacket.seedAssets.map((seed) => seed.avatarId), ["avatar-3", "pinokio-bella"]);
  run(["pause"]);
});
