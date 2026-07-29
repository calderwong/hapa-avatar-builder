import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVibesTransitionFrameCatalog,
  createVibesReferenceTransitionRing,
  createVibesTransitionJob,
  createVibesTransitionMediaRecord,
  createVibesTransitionQueue,
  enqueueVibesTransitionJobs,
  fillVibesTransitionBuffer,
  markVibesTransitionFailed,
  markVibesTransitionReady,
  summarizeVibesReferenceTransitionCoverage,
  updateVibesTransitionSession,
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

test("retriable failures cool down without occupying the three-slot buffer", () => {
  const jobs = [1, 2, 3, 4].map(job);
  let queue = enqueueVibesTransitionJobs(createVibesTransitionQueue({}, now), jobs, now).queue;
  queue = fillVibesTransitionBuffer(queue, { maxConcurrent: 3, now }).queue;
  const failedId = queue.jobs.find((row) => row.status === "claimed").id;
  queue = markVibesTransitionFailed(queue, failedId, "provider returned image instead of video", {
    retry: true,
    baseDelayMs: 60_000,
  }, later);

  const cooled = queue.jobs.find((row) => row.id === failedId);
  assert.equal(cooled.status, "queued");
  assert.equal(cooled.failure.retryDelayMs, 60_000);
  assert.equal(cooled.nextEligibleAt, "2026-07-28T18:06:00.000Z");

  const refill = fillVibesTransitionBuffer(queue, { maxConcurrent: 3, now: later });
  assert.equal(refill.claimed.length, 1);
  assert.notEqual(refill.claimed[0].id, failedId);
  assert.equal(refill.queue.counts.active, 3);

  const afterCooldown = markVibesTransitionFailed(
    refill.queue,
    refill.claimed[0].id,
    "release test slot",
    {},
    "2026-07-28T18:06:01.000Z",
  );
  const reclaimed = fillVibesTransitionBuffer(afterCooldown, {
    maxConcurrent: 3,
    now: "2026-07-28T18:06:01.000Z",
  });
  assert.equal(reclaimed.claimed[0].id, failedId);
});

test("equal-priority buffer claims prefer untouched jobs over cooled retries", () => {
  const retried = createVibesTransitionJob({
    from: frame("reference", "retry-from", "retry-from-asset"),
    to: frame("reference", "retry-to", "retry-to-asset"),
    prompt: "Retry transition.",
    priority: 200,
  }, now);
  const fresh = createVibesTransitionJob({
    from: frame("reference", "fresh-from", "fresh-from-asset"),
    to: frame("reference", "fresh-to", "fresh-to-asset"),
    prompt: "Fresh transition.",
    priority: 200,
  }, now);
  let queue = enqueueVibesTransitionJobs(
    createVibesTransitionQueue({}, now),
    [retried, fresh],
    now,
  ).queue;
  queue = {
    ...queue,
    jobs: queue.jobs.map((row) => row.id === retried.id
      ? { ...row, attempts: 4, nextEligibleAt: "" }
      : row),
  };

  const claimed = fillVibesTransitionBuffer(queue, { maxConcurrent: 1, now });
  assert.equal(claimed.claimed.length, 1);
  assert.equal(claimed.claimed[0].id, fresh.id);
  assert.equal(claimed.claimed[0].attempts, 1);
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

test("reference ring creates one deterministic outbound transition per Reference image", () => {
  const references = ["Gamma", "Alpha", "Beta"].map((title, index) => ({
    ...frame("reference", `reference-${index}`, `reference-asset-${index}`),
    cardTitle: title,
    id: `transition-frame:reference:${title.toLowerCase()}`,
  }));
  const ring = createVibesReferenceTransitionRing({ frames: references }, {
    projectUrl: "https://vibes.ai/projects/example",
  }, now);
  assert.equal(ring.referenceCount, 3);
  assert.equal(ring.transitionCount, 3);
  assert.deepEqual(ring.jobs.map((row) => row.from.cardTitle), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(ring.jobs.map((row) => row.to.cardTitle), ["Beta", "Gamma", "Alpha"]);
  assert.equal(new Set(ring.jobs.map((row) => row.from.id)).size, 3);
  assert.ok(ring.jobs.every((row) => row.provenance.coverageRole === "outbound-transition-per-reference-image"));
});

test("reference coverage distinguishes ready, active, queued, and missing outbound frames", () => {
  const references = ["one", "two", "three", "four"].map((id) => ({
    ...frame("reference", id, `${id}-asset`),
    id: `transition-frame:reference:${id}`,
  }));
  const ring = createVibesReferenceTransitionRing({ frames: references.slice(0, 3) }, {}, now);
  let queue = createVibesTransitionQueue({ jobs: ring.jobs }, now);
  queue = fillVibesTransitionBuffer(queue, { maxConcurrent: 1, now }).queue;
  const claimedId = queue.jobs.find((row) => row.status === "claimed").id;
  queue = markVibesTransitionReady(queue, claimedId, {
    uri: "/media/ready.mp4",
    path: "/tmp/ready.mp4",
    sha256: "c".repeat(64),
  }, later);
  const coverage = summarizeVibesReferenceTransitionCoverage({ frames: references }, queue);
  assert.equal(coverage.referenceCount, 4);
  assert.equal(coverage.satisfied, 1);
  assert.equal(coverage.queued, 2);
  assert.equal(coverage.missing, 1);
});

test("session recovery records safe re-entry and human-auth boundaries", () => {
  const recovering = updateVibesTransitionSession({}, "recovering", {
    observedUrl: "https://vibes.ai/",
    resumeUrl: "https://vibes.ai/projects/example",
    reason: "redirected-to-public-landing",
  }, now);
  assert.equal(recovering.recoveryAttempts, 1);
  assert.equal(recovering.nextAction, "attempt-one-safe-login-reentry");

  const required = updateVibesTransitionSession(recovering, "auth-required", {
    reason: "credential-or-otp-required",
  }, later);
  assert.equal(required.nextAction, "pause-provider-submissions-and-request-human-sign-in");

  const healthy = updateVibesTransitionSession(required, "healthy", {
    observedUrl: "https://vibes.ai/projects/example",
  }, "2026-07-28T18:10:00.000Z");
  assert.equal(healthy.authRequiredAt, "");
  assert.equal(healthy.nextAction, "resume-three-video-buffer");
});
