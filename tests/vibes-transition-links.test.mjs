import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVibesTransitionFrameCatalog,
  createVibesTransitionJob,
  createVibesTransitionMediaRecord,
  createVibesTransitionQueue,
  enqueueVibesTransitionJobs,
  fillVibesTransitionBuffer,
  markVibesTransitionFailed,
  markVibesTransitionReady,
} from "../src/domain/vibes-transition-links.js";

const now = "2026-07-28T18:00:00.000Z";
const later = "2026-07-28T18:05:00.000Z";

function frame(kind, cardId, assetId) {
  return {
    kind,
    cardId,
    cardTitle: `${kind} ${cardId}`,
    assetId,
    assetTitle: assetId,
    uri: `/media/${assetId}.png`,
    path: `/tmp/${assetId}.png`,
  };
}

function job(index) {
  return createVibesTransitionJob({
    from: frame(index % 2 ? "avatar" : "reference", `from-${index}`, `from-asset-${index}`),
    to: frame("scene", `to-${index}`, `to-asset-${index}`),
    prompt: `Transition ${index} without identity drift.`,
    priority: index,
  }, now);
}

test("three-slot pump claims exactly three and completion replenishes one", () => {
  const seeded = enqueueVibesTransitionJobs(createVibesTransitionQueue({}, now), [1, 2, 3, 4, 5].map(job), now).queue;
  const first = fillVibesTransitionBuffer(seeded, { maxConcurrent: 3, claimant: "test", now });
  assert.equal(first.claimed.length, 3);
  assert.equal(first.queue.counts.active, 3);
  assert.equal(first.queue.counts.queued, 2);

  const completedId = first.claimed[0].id;
  const ready = markVibesTransitionReady(first.queue, completedId, {
    uri: "/media/vibes-transition-links/ready.mp4",
    path: "/tmp/ready.mp4",
    sha256: "a".repeat(64),
    bytes: 42,
  }, later);
  const refill = fillVibesTransitionBuffer(ready, { maxConcurrent: 3, claimant: "test", now: later });
  assert.equal(refill.claimed.length, 1);
  assert.equal(refill.queue.counts.active, 3);
  assert.equal(refill.queue.counts.ready, 1);
  assert.equal(refill.queue.counts.queued, 1);
});

test("enqueue is idempotent and failed jobs release capacity", () => {
  const original = job(1);
  const enqueued = enqueueVibesTransitionJobs(createVibesTransitionQueue({}, now), [original, original], now);
  assert.equal(enqueued.added.length, 1);
  const claimed = fillVibesTransitionBuffer(enqueued.queue, { maxConcurrent: 3, now });
  const failed = markVibesTransitionFailed(claimed.queue, original.id, "provider rejected frame", {}, later);
  assert.equal(failed.counts.active, 0);
  assert.equal(failed.counts.failed, 1);
});

test("frame catalog includes Reference Atlas, Avatar, and Scene images", () => {
  const catalog = buildVibesTransitionFrameCatalog({
    referenceMedia: {
      records: [{
        card: { id: "reference:one", title: "Reference One", revisionId: "r1" },
        artifacts: { image: { uri: "/media/reference.png", path: "/tmp/reference.png", sha256: "1" } },
        custody: { reviewStatus: "approved" },
      }],
    },
    avatarStore: {
      avatars: [{
        id: "avatar-one",
        primaryName: "Avatar One",
        assets: [{ id: "avatar-image", name: "Avatar Image", type: "image", uri: "/media/avatar.png", metadata: { storage: { path: "/tmp/avatar.png" } } }],
      }],
    },
    sceneStore: {
      scenes: [{
        id: "scene-one",
        title: "Scene One",
        assets: [{ id: "scene-image", name: "Scene Image", type: "image", uri: "/media/scene.png", metadata: { storage: { path: "/tmp/scene.png" } } }],
      }],
    },
  }, now);
  assert.deepEqual(catalog.counts, { total: 3, reference: 1, avatar: 1, scene: 1 });
  assert.deepEqual(catalog.frames.map((row) => row.kind), ["avatar", "reference", "scene"]);
});

test("completed media record links both endpoint Cards and the transition link", () => {
  const transition = job(9);
  const readyQueue = markVibesTransitionReady(
    fillVibesTransitionBuffer(createVibesTransitionQueue({ jobs: [transition] }, now), { now }).queue,
    transition.id,
    {
      uri: "/media/vibes-transition-links/transition.mp4",
      path: "/tmp/transition.mp4",
      sha256: "b".repeat(64),
      bytes: 128,
    },
    later,
  );
  const ready = readyQueue.jobs[0];
  const record = createVibesTransitionMediaRecord(ready, ready.output, later);
  assert.equal(record.relationships.length, 3);
  assert.deepEqual(record.relationships.slice(0, 2).map((row) => row.role), [
    "transition-first-frame",
    "transition-last-frame",
  ]);
  assert.equal(record.asset.metadata.vibesTransitionLink.from.assetId, transition.from.assetId);
  assert.equal(record.asset.metadata.vibesTransitionLink.to.assetId, transition.to.assetId);
});
