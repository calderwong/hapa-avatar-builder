import test from "node:test";
import assert from "node:assert/strict";
import {
  ECHO_PLAYER_POOL_LIMIT,
  canonicalEchoAssetKey,
  planEchoPlayerLeases,
  reconcileEchoPlayerSlots,
} from "../src/domain/echo-player-pool.js";

const project = {
  timeline: Array.from({ length: 8 }, (_, index) => ({
    start_sec: index * 4,
    end_sec: (index + 1) * 4,
    media_id: `media-${index}`,
    media_uri: `/media/${index}.mp4#shot-${index}`,
  })),
};

test("Echo player leases are bounded to current plus two shots and ignore URI fragments", () => {
  const leases = planEchoPlayerLeases(project, 2);
  assert.equal(ECHO_PLAYER_POOL_LIMIT, 3);
  assert.deepEqual(leases.map((lease) => lease.shotIndex), [2, 3, 4]);
  assert.deepEqual(leases.map((lease) => lease.lookahead), [0, 1, 2]);
  assert.equal(canonicalEchoAssetKey(leases[0].uri), "/media/2.mp4");
});

test("Echo pool retains matching leases and protects the visible player during a far seek", () => {
  const slots = [{ key: "/media/0.mp4" }, { key: "/media/1.mp4" }, { key: "/media/2.mp4" }];
  const leases = planEchoPlayerLeases(project, 5);
  const plan = reconcileEchoPlayerSlots(slots, leases, 0);
  assert.ok(plan.assignments.every((assignment) => assignment.slotIndex !== 0));
  assert.equal(plan.assignments.length, 2, "visible old frame remains until one of two staging players is first-frame ready");
  assert.ok(plan.assignments.every((assignment) => assignment.lease.lookahead <= 2));
});

test("Echo pool reuses the staged next shot without starting another request", () => {
  const slots = [{ key: "/media/2.mp4" }, { key: "/media/3.mp4" }, { key: "/media/4.mp4" }];
  const leases = planEchoPlayerLeases(project, 3);
  const plan = reconcileEchoPlayerSlots(slots, leases, 1);
  assert.equal(plan.assignments[0].slotIndex, 1);
  assert.equal(plan.assignments[0].reused, true);
});
