import test from "node:test";
import assert from "node:assert/strict";
import { buildFrameMatchTransitionGraph } from "../src/domain/frame-match-transition-graph.js";

const videos = [{ video_id: "video:a", path: "/a.mp4", width: 1280, height: 720 }, { video_id: "video:b", path: "/b.mp4", width: 1280, height: 720 }, { video_id: "video:c", path: "/c.mp4", width: 720, height: 1280 }];
const frame = (video_id, role, timestamp, hash, luma) => ({ frame_id: `${video_id}:${role}`, video_id, role, timestamp, ahash: hash, dhash: hash, phash: hash, luma_mean: luma });
const frames = [frame("video:a", "first", 0, "0000000000000000", .2), frame("video:a", "last", 3, "0000000000000000", .2), frame("video:b", "first", 0, "0000000000000001", .21), frame("video:b", "last", 3, "0000000000000003", .22), frame("video:c", "first", 0, "ffffffffffffffff", .9), frame("video:c", "last", 3, "ffffffffffffffff", .9)];
const roiItems = videos.map((video) => ({ path: video.path, status: "verified", evidence: "test", subjectROI: { x: .25, y: .2, width: .5, height: .6 } }));

test("candidate joins are deterministic, scored, bounded, and carry previews", () => {
  const one = buildFrameMatchTransitionGraph({ videos, frames, roiItems, topK: 2 });
  const two = buildFrameMatchTransitionGraph({ videos, frames, roiItems, topK: 2 });
  assert.deepEqual(one, two); assert.equal(one.totals.orderedCandidateJoins, 6);
  for (const join of one.candidates) { assert.ok(join.scoreBreakdown.perceptualAppearance); assert.ok(join.safetyLimits.fallbackFamily); assert.ok(join.preview.contactSheet); }
  assert.equal(one.alternatesBySource["video:a"].length, 2);
});

test("unmeasured dimensions are explicit and generation requires a strong strict match", () => {
  const graph = buildFrameMatchTransitionGraph({ videos, frames, roiItems });
  assert.equal(graph.truth.opticalFlowMeasured, false); assert.equal(graph.truth.semanticReview, "pending-human");
  assert.equal(typeof graph.flowDancerHandoff.generatedBridgeWarranted, "boolean");
});
