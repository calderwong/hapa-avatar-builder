import test from "node:test";
import assert from "node:assert/strict";
import {
  ECHO_PLAYER_POOL_LIMIT,
  resolveEchoPlayerPoolLimit,
  canonicalEchoAssetKey,
  echoShotRuntimeUri,
  planEchoPlayerLeases,
  reconcileEchoPlayerSlots,
} from "../src/domain/echo-player-pool.js";

const project = {
  timeline: Array.from({ length: 12 }, (_, index) => ({
    start_sec: index * 4,
    end_sec: (index + 1) * 4,
    media_id: `media-${index}`,
    media_uri: `/media/${index}.mp4#shot-${index}`,
  })),
};

test("3/5/9 budgets bound both allocated leases and lookahead span even across visualizer gaps", () => {
  for (const budget of [3, 5, 9]) {
    const sparse = { timeline: project.timeline.map((shot, index) => index % 2 ? { ...shot, media_id: 'none' } : shot) };
    const leases = planEchoPlayerLeases(sparse, 0, budget);
    assert.equal(resolveEchoPlayerPoolLimit(String(budget)), budget);
    assert.ok(leases.length <= budget);
    assert.ok(leases.every(lease => lease.lookahead < budget));
  }
  assert.equal(resolveEchoPlayerPoolLimit('900'), 9);
  assert.equal(resolveEchoPlayerPoolLimit(null, 3), 3);
  assert.deepEqual(planEchoPlayerLeases(project, 0, NaN), []);
});

test("Echo player leases are bounded to current plus eight shots and ignore URI fragments", () => {
  const leases = planEchoPlayerLeases(project, 2);
  assert.equal(ECHO_PLAYER_POOL_LIMIT, 9);
  assert.deepEqual(leases.map((lease) => lease.shotIndex), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(leases.map((lease) => lease.lookahead), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(canonicalEchoAssetKey(leases[0].uri), "/media/2.mp4");
});

test("Echo pool retains matching leases and protects the visible player during a far seek", () => {
  const slots = [{ key: "/media/0.mp4" }, { key: "/media/1.mp4" }, { key: "/media/2.mp4" }];
  const leases = planEchoPlayerLeases(project, 5);
  const plan = reconcileEchoPlayerSlots(slots, leases, 0);
  assert.ok(plan.assignments.every((assignment) => assignment.slotIndex !== 0));
  assert.equal(plan.assignments.length, 2, "the protected visible slot remains while all available staging players are assigned");
  assert.ok(plan.assignments.every((assignment) => assignment.lease.lookahead <= 8));
});

test("Echo pool reuses the staged next shot without starting another request", () => {
  const slots = [{ key: "/media/2.mp4" }, { key: "/media/3.mp4" }, { key: "/media/4.mp4" }];
  const leases = planEchoPlayerLeases(project, 3);
  const plan = reconcileEchoPlayerSlots(slots, leases, 1);
  assert.equal(plan.assignments[0].slotIndex, 1);
  assert.equal(plan.assignments[0].reused, true);
});

test("Echo leases preload the verified runtime contract and skip intentional visualizer blanks", () => {
  const leases = planEchoPlayerLeases({ timeline: [{
    start_sec: 0,
    end_sec: 4,
    media_id: "scroll-source",
    media_uri: "/media/scroll-source-a.mp4",
    media_contract: { type: "video", runtimeUri: "/media/scroll-runtime-b.mp4" },
  }, {
    start_sec: 4,
    end_sec: 8,
    media_id: "none",
    media_uri: "",
    media_contract: { type: "generated-visualizer", runtimeUri: "" },
  }] }, 0);
  assert.equal(echoShotRuntimeUri({ media_id: "none", media_contract: { type: "generated-visualizer" } }), "");
  assert.deepEqual(leases.map(({ uri }) => uri), ["/media/scroll-runtime-b.mp4"]);
});
