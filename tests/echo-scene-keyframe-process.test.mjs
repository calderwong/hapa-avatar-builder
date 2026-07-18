import test from "node:test";
import assert from "node:assert/strict";
import {
  claimEchoSceneKeyframeQuests,
  completeEchoSceneKeyframeQuest,
  configureEchoSceneKeyframeProcess,
  createEchoSceneKeyframeProcess,
  echoSceneKeyframeCountStatus,
  echoSceneKeyframeProcessSummary,
  failEchoSceneKeyframeQuest,
  importEchoSceneKeyframeArtifacts,
  pauseEchoSceneKeyframeProcess,
  planEchoSceneKeyframeCounts,
  releaseExpiredEchoSceneKeyframeLeases,
  requestEchoSceneKeyframeStopAfterCurrent,
  resumeEchoSceneKeyframeProcess,
  startEchoSceneKeyframeProcess,
} from "../src/domain/echo-scene-keyframe-process.js";

const at = "2026-07-18T12:00:00.000Z";
const nextMinute = "2026-07-18T12:01:00.000Z";
const sourceCount = (countOrdinal = 0, overrides = {}) => ({
  songId: "echo-song",
  countOrdinal,
  beatStart: countOrdinal * 4,
  beatEndExclusive: countOrdinal * 4 + 4,
  startSeconds: countOrdinal * 2,
  endSeconds: countOrdinal * 2 + 2,
  timingStatus: "ready",
  inputHash: `source:${countOrdinal}`,
  ...overrides,
});

test("replanning an unchanged four-count is idempotent and input changes retain stale lineage", () => {
  let process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const firstQuestId = process.counts[0].lanes.prompt.quest.id;
  process = planEchoSceneKeyframeCounts(process, { counts: [sourceCount()], at });
  assert.equal(process.counts.length, 1);
  assert.equal(process.counts[0].lanes.prompt.quest.id, firstQuestId);
  process = planEchoSceneKeyframeCounts(process, { counts: [sourceCount(0, { inputHash: "source:changed" })], at });
  assert.notEqual(process.counts[0].lanes.prompt.quest.id, firstQuestId);
  assert.equal(process.counts[0].history.length, 1);
  assert.equal(process.counts[0].history[0].lanes.prompt.quest.id, firstQuestId);
});

test("prompt completion opens a content-addressed image quest and keyframe completion holds video", () => {
  let process = startEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ counts: [sourceCount()] }), { at });
  let claimed = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "run-a", at });
  process = claimed.process;
  assert.equal(claimed.claims[0].lane, "prompt");
  process = completeEchoSceneKeyframeQuest(process, claimed.claims[0].questId, { runnerId: "terra", at, result: { sceneText: "red at the waterline", gptImagePrompt: "cinematic", contentHash: "prompt-output-a" } });
  assert.equal(process.counts[0].lanes.image.quest.status, "open");
  assert.equal(process.counts[0].lanes.image.quest.inputHash, "prompt-output-a");
  claimed = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "run-b", at });
  process = completeEchoSceneKeyframeQuest(claimed.process, claimed.claims[0].questId, { runnerId: "terra", at, result: { localPath: "/generated.png", contentHash: "image-output-a" } });
  assert.equal(process.counts[0].lanes.image.artifact.state, "keyframe_exists");
  assert.equal(process.counts[0].lanes.video.quest.status, "held");
  assert.equal(process.counts[0].lanes.video.quest.executionPolicy, "hold-video-generation-v1");
  assert.equal(echoSceneKeyframeCountStatus(process.counts[0]), "video_quest_held");
});

test("claims respect process state, concurrency, run limits, and categorically refuse video", () => {
  let process = createEchoSceneKeyframeProcess({ settings: { concurrency: 2, perRunClaimLimit: 1 }, counts: [sourceCount(0), sourceCount(1)] });
  assert.equal(claimEchoSceneKeyframeQuests(process, { at }).claims.length, 0);
  process = startEchoSceneKeyframeProcess(process, { at });
  let first = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "same-run", limit: 9, at });
  assert.equal(first.claims.length, 1);
  let second = claimEchoSceneKeyframeQuests(first.process, { runnerId: "terra", runId: "same-run", limit: 9, at });
  assert.equal(second.claims.length, 0);
  second = claimEchoSceneKeyframeQuests(first.process, { runnerId: "luna", runId: "new-run", limit: 9, at });
  assert.equal(second.claims.length, 1);
  assert.ok([...first.claims, ...second.claims].every((claim) => claim.lane !== "video"));
  assert.throws(() => claimEchoSceneKeyframeQuests(first.process, { lane: "video", at }), /Unsupported claim lane/u);
  const videoId = first.process.counts[0].lanes.video.quest.id;
  assert.throws(() => completeEchoSceneKeyframeQuest(first.process, videoId, { at }), /Video generation is held/u);
});

test("throughput can be raised without invalidating work and cannot contradict live leases", () => {
  let process = startEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ settings: { concurrency: 2, perRunClaimLimit: 2 }, counts: [sourceCount(0), sourceCount(1), sourceCount(2)] }), { at });
  let claimed = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "batch-a", limit: 2, at });
  process = configureEchoSceneKeyframeProcess(claimed.process, { settings: { concurrency: 3, perRunClaimLimit: 3 }, at: nextMinute });
  assert.equal(process.settings.concurrency, 3);
  assert.equal(process.settings.perRunClaimLimit, 3);
  assert.equal(process.events.at(-1).type, "process-settings-configured");
  const extra = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "batch-b", limit: 3, at: nextMinute });
  assert.equal(extra.claims.length, 1);
  assert.throws(() => configureEchoSceneKeyframeProcess(extra.process, { settings: { concurrency: 2 }, at: nextMinute }), /below 3 active claims/u);
});

test("accepted pilot artifacts import without replaying provider work", () => {
  let process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  process = importEchoSceneKeyframeArtifacts(process, process.counts[0].id, {
    at,
    promptResult: { sceneText: "existing pilot", contentHash: "prompt-pilot" },
    imageResult: { localPath: "/pilot.png", contentHash: "image-pilot" },
  });
  assert.equal(process.counts[0].lanes.prompt.quest.status, "complete");
  assert.equal(process.counts[0].lanes.image.artifact.state, "keyframe_exists");
  assert.equal(process.counts[0].lanes.video.quest.status, "held");
  assert.ok(process.events.some((event) => event.type === "artifacts-imported"));
});

test("pause, resume, stop-after-current, failures, and expired leases are restart-safe", () => {
  let process = startEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ settings: { leaseMs: 1000, maxAttempts: 2 }, counts: [sourceCount()] }), { at });
  let claim = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "run", at });
  process = requestEchoSceneKeyframeStopAfterCurrent(claim.process, { at });
  assert.equal(process.status, "stop_after_current");
  assert.equal(claimEchoSceneKeyframeQuests(process, { at }).claims.length, 0);
  process = failEchoSceneKeyframeQuest(process, claim.claims[0].questId, { runnerId: "terra", error: "temporary", at: nextMinute });
  assert.equal(process.status, "paused");
  assert.equal(process.counts[0].lanes.prompt.quest.status, "open");
  process = resumeEchoSceneKeyframeProcess(process, { at: nextMinute });
  claim = claimEchoSceneKeyframeQuests(process, { runnerId: "luna", runId: "retry", at: nextMinute });
  process = releaseExpiredEchoSceneKeyframeLeases(claim.process, { at: "2026-07-18T12:02:00.000Z" });
  assert.equal(process.counts[0].lanes.prompt.quest.status, "failed");
  process = pauseEchoSceneKeyframeProcess(process, { at: nextMinute });
  assert.equal(process.status, "paused");
});

test("summary keeps independent lane facts and treats missing timing as incomplete", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1, { timingStatus: "needs_timing_truth" })] });
  const summary = echoSceneKeyframeProcessSummary(process);
  assert.equal(summary.status, "planned");
  assert.equal(summary.timingReady, 1);
  assert.equal(summary.needsTimingTruth, 1);
  assert.equal(summary.lanes.prompt.quests.open, 1);
  assert.equal(summary.lanes.prompt.quests.not_open, 1);
  assert.equal(summary.complete, false);
  assert.equal(echoSceneKeyframeCountStatus(process.counts[1]), "needs_timing_truth");
});
