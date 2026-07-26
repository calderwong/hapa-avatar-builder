import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEchoReferenceArtPrompt,
  buildEchoReferenceArtQueue,
  isEchoReferenceArtEligible,
  mergeEchoReferenceArtQueue,
  reviewEchoReferenceArtJob,
} from "../src/domain/echo-reference-card-art.js";

function sourceCard(id = "winter") {
  return {
    id: `reference:${id}`,
    revisionId: `reference:${id}:r1`,
    title: "Winter Watch",
    summary: "A test source.",
    publicContext: "Endurance, command, weaponized identity, and eventual demobilization.",
    occurrences: [{
      id: `${id}:one`,
      songId: "song-one",
      songTitle: "One More Watch",
      confidence: 0.9,
      lyricSpan: { lineStart: 4, lineEnd: 4, lyricText: "When Winter's Watch was over" },
    }],
    themes: ["duty", "winter", "recovery"],
    mechanics: ["demobilization", "identity recovery"],
    authority: { evidenceClass: "direct", reviewStatus: "pending-review", canonStatus: "non-canon" },
    rightsAndPrivacy: { visibility: "shared", containsPrivateClues: false },
  };
}

function runFixture() {
  const card = sourceCard();
  const neighbor = sourceCard("good-night");
  neighbor.title = "Good Knight";
  return {
    runId: "run:one",
    runHash: "sha256:run",
    graph: {
      graphHash: "sha256:graph",
      edges: [{
        id: "edge",
        fromId: card.id,
        toId: neighbor.id,
        relationType: "co-activated-with",
        weight: 0.8,
        support: { sharedSongIds: ["song-one"], sharedThemes: ["duty"], sharedMechanics: ["demobilization"] },
      }],
    },
    cards: [card, neighbor],
  };
}

test("FLUX.2 Reference Card prompts use semantic constellations and transformative art constraints", () => {
  const run = runFixture();
  const prompt = buildEchoReferenceArtPrompt(run.cards[0], run);

  assert.equal(prompt.neighbors[0].title, "Good Knight");
  assert.match(prompt.prompt, /one dominant symbolic action/u);
  assert.match(prompt.prompt, /Do not reproduce celebrity likenesses/u);
  assert.match(prompt.prompt, /human review required/u);
  assert.equal(Object.hasOwn(prompt.promptObject, "negativePrompt"), false);
  assert.match(prompt.promptHash, /^sha256:[a-f0-9]{64}$/u);
});

test("Reference art planning is deterministic and excludes private, unresolved, and motif cards", () => {
  const run = runFixture();
  const privateCard = sourceCard("private");
  privateCard.rightsAndPrivacy.containsPrivateClues = true;
  privateCard.rightsAndPrivacy.visibility = "private";
  const unresolvedCard = sourceCard("unresolved");
  unresolvedCard.authority.evidenceClass = "unresolved";
  const motif = sourceCard("motif");
  motif.id = "reference-card:motif";
  run.cards.push(privateCard, unresolvedCard, motif);

  assert.equal(isEchoReferenceArtEligible(privateCard), false);
  const first = buildEchoReferenceArtQueue(run, { model: "flux-2-max" });
  const second = buildEchoReferenceArtQueue(run, { model: "flux-2-max" });

  assert.equal(first.queueHash, second.queueHash);
  assert.equal(first.jobs.length, 2);
  assert.equal(first.jobs.every((job) => job.custody.humanReviewRequired), true);
  assert.equal(first.jobs.every((job) => job.status === "planned"), true);
  assert.equal(first.counts.privateOrUnresolvedExcluded, 2);
});

test("queue merge preserves provider state while updating the deterministic prompt projection", () => {
  const run = runFixture();
  const planned = buildEchoReferenceArtQueue(run);
  const previous = structuredClone(planned);
  previous.jobs[0].status = "review-required";
  previous.jobs[0].artifact = { sha256: "abc" };

  const merged = mergeEchoReferenceArtQueue(previous, planned);
  assert.equal(merged.jobs[0].status, "review-required");
  assert.equal(merged.jobs[0].artifact.sha256, "abc");
  assert.equal(merged.jobs[0].prompt.promptHash, planned.jobs[0].prompt.promptHash);
});

test("completed Reference art requires an explicit human accept or reject decision", () => {
  const queue = buildEchoReferenceArtQueue(runFixture());
  assert.throws(() => reviewEchoReferenceArtJob(queue, {
    jobId: queue.jobs[0].id,
    decision: "accepted",
    reviewer: "calder",
  }), /no completed artifact/u);

  queue.jobs[0].status = "review-required";
  queue.jobs[0].artifact = { sha256: "abc" };
  const reviewed = reviewEchoReferenceArtJob(queue, {
    jobId: queue.jobs[0].id,
    decision: "accepted",
    reviewer: "calder",
    rationale: "The symbols read clearly.",
  }, () => "2026-07-26T00:00:00.000Z");
  assert.equal(reviewed.jobs[0].status, "accepted");
  assert.equal(reviewed.jobs[0].review.reviewer, "calder");
  assert.equal(reviewed.jobs[0].custody.canonPromotion, false);
});
