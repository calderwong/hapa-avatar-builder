import assert from "node:assert/strict";
import test from "node:test";

import { scanHumanVideoOpticalCandidates } from "../server/human-video-optical-planner.mjs";

test("planner cursor advances deterministically without rescanning deferred videos", async () => {
  const videos = [video("d"), video("b"), video("a"), video("c")];
  const inspected = [];
  const first = await scanHumanVideoOpticalCandidates({
    videos,
    jobLimit: 1,
    scanLimit: 2,
    prepare: async (candidate) => {
      inspected.push(candidate.humanVideoKey);
      return candidate.humanVideoKey === "a" ? { deferred: "missing-frames" } : { job: { videoKey: candidate.humanVideoKey } };
    },
  });
  assert.deepEqual(inspected, ["a", "b"]);
  assert.deepEqual(first.jobs, [{ videoKey: "b" }]);
  assert.equal(first.lastScannedVideoKey, "b");
  assert.equal(first.deferredMissingFrames, 1);
  assert.equal(first.scanExhausted, false);

  inspected.length = 0;
  const second = await scanHumanVideoOpticalCandidates({
    videos,
    existingVideoKeys: ["b"],
    afterVideoKey: first.lastScannedVideoKey,
    jobLimit: 1,
    scanLimit: 2,
    prepare: async (candidate) => {
      inspected.push(candidate.humanVideoKey);
      return { job: { videoKey: candidate.humanVideoKey } };
    },
  });
  assert.deepEqual(inspected, ["c"]);
  assert.deepEqual(second.jobs, [{ videoKey: "c" }]);
  assert.equal(second.lastScannedVideoKey, "c");
});

test("planner scan limit bounds missing-file traversal and reports exhaustion truthfully", async () => {
  const videos = [video("a"), video("b"), video("c")];
  const bounded = await scanHumanVideoOpticalCandidates({
    videos,
    jobLimit: 2,
    scanLimit: 2,
    prepare: async () => ({ deferred: "missing-files" }),
  });
  assert.equal(bounded.scanned, 2);
  assert.equal(bounded.deferredMissingFiles, 2);
  assert.equal(bounded.lastScannedVideoKey, "b");
  assert.equal(bounded.scanExhausted, false);

  const exhausted = await scanHumanVideoOpticalCandidates({
    videos,
    afterVideoKey: bounded.lastScannedVideoKey,
    jobLimit: 2,
    scanLimit: 2,
    prepare: async () => ({ deferred: "missing-files" }),
  });
  assert.equal(exhausted.scanned, 1);
  assert.equal(exhausted.lastScannedVideoKey, "c");
  assert.equal(exhausted.scanExhausted, true);
});

test("empty cursor explicitly begins a new scan generation", async () => {
  const visited = [];
  const result = await scanHumanVideoOpticalCandidates({
    videos: [video("a"), video("b")],
    afterVideoKey: "",
    jobLimit: 1,
    prepare: async (candidate) => {
      visited.push(candidate.humanVideoKey);
      return { job: { videoKey: candidate.humanVideoKey } };
    },
  });
  assert.deepEqual(visited, ["a"]);
  assert.equal(result.lastScannedVideoKey, "a");
});

function video(humanVideoKey) {
  return { humanVideoKey, agentReview: null };
}
