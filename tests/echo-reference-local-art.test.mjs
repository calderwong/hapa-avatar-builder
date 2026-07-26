import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEchoReferenceScenePromptBoundary,
  buildEchoReferenceCardSvg,
  buildEchoReferenceKreaFinishHandoff,
  buildEchoReferenceLocalArtQueue,
  compileEchoReferenceVisualScene,
  mergeEchoReferenceLocalArtQueue,
  reviewEchoReferenceLocalCandidate,
} from "../src/domain/echo-reference-local-art.js";

function fixture() {
  const card = {
    id: "reference:frank-jackson-marys-room",
    revisionId: "revision:one",
    title: "Frank Jackson's Mary's Room",
    publicContext: "A philosophical thought experiment about knowledge and experience.",
    themes: ["experience", "memory"],
    mechanics: ["context expansion"],
    citations: [{ url: "https://example.test/marys-room" }],
    occurrences: [{
      id: "occurrence:one",
      songId: "song:one",
      songTitle: "Climb",
      confidence: 0.92,
      lyricSpan: { lineStart: 12, lyricText: "There is a philosopher, Mary." },
    }],
    authority: { evidenceClass: "direct", reviewStatus: "pending-review", canonStatus: "non-canon" },
    rightsAndPrivacy: { visibility: "shared", containsPrivateClues: false },
  };
  return {
    card,
    run: {
      runId: "run:one",
      runHash: "sha256:run",
      cards: [card],
      graph: { graphHash: "sha256:graph", edges: [] },
    },
  };
}

test("semantic scene retains evidence locally but excludes exact references and lyrics from generation", () => {
  const { card, run } = fixture();
  const scene = compileEchoReferenceVisualScene(card, run);
  assert.equal(scene.evidence.referenceTitle, card.title);
  assert.equal(scene.evidence.lyricText, card.occurrences[0].lyricSpan.lyricText);
  assert.equal(scene.generationPrompt.includes(card.title), false);
  assert.equal(scene.generationPrompt.includes(card.occurrences[0].lyricSpan.lyricText), false);
  assert.doesNotMatch(scene.generationPrompt, /\b(reference card|title[- ]plate|collectible card|tarot card)\b/i);
  assert.match(scene.generationPrompt, /touches a vivid red apple/);
  assert.equal(scene.symbols.length, 3);
  assert.equal(assertEchoReferenceScenePromptBoundary(scene), true);
});

test("local queue is deterministic, multi-candidate, and preserves completed work on merge", () => {
  const { run } = fixture();
  const first = buildEchoReferenceLocalArtQueue(run, { candidateCount: 3 });
  const second = buildEchoReferenceLocalArtQueue(run, { candidateCount: 3 });
  assert.equal(first.queueHash, second.queueHash);
  assert.equal(first.jobs.length, 1);
  assert.equal(first.jobs[0].candidates.length, 3);
  assert.equal(new Set(first.jobs[0].candidates.map((candidate) => candidate.seed)).size, 3);
  first.jobs[0].candidates[0].status = "review-required";
  const merged = mergeEchoReferenceLocalArtQueue(first, second);
  assert.equal(merged.jobs[0].candidates[0].status, "review-required");
});

test("deterministic SVG assembly adds exact title and citation after image generation", () => {
  const svg = buildEchoReferenceCardSvg({
    imageBytes: Buffer.from("local-image"),
    imageMediaType: "image/png",
    title: "Frank Jackson's Mary's Room",
    context: "Complete description changes when experience arrives.",
    citationUrl: "https://plato.stanford.edu/entries/qualia-knowledge/",
    cardId: "reference:mary",
    candidateId: "candidate:mary",
    imageSha256: "abc123",
  });
  assert.match(svg, /Frank Jackson&apos;s Mary&apos;s Room/);
  assert.match(svg, /plato\.stanford\.edu/);
  assert.match(svg, /REVIEW REQUIRED/);
  assert.match(svg, /data:image\/png;base64,bG9jYWwtaW1hZ2U=/);
  assert.match(svg, /generatedOutputIsIdentityTruth/);
});

test("review and optional Krea handoff require a completed accepted candidate", () => {
  const { run } = fixture();
  const queue = buildEchoReferenceLocalArtQueue(run, { candidateCount: 1 });
  const candidate = queue.jobs[0].candidates[0];
  candidate.status = "review-required";
  candidate.rawArtifact = { localPath: "/tmp/raw.png", sha256: "raw" };
  candidate.assembledArtifact = { localPath: "/tmp/card.svg", sha256: "card" };
  const reviewed = reviewEchoReferenceLocalCandidate(queue, {
    candidateId: candidate.id,
    reviewer: "operator",
    decision: "accepted",
    rationale: "Composition and semantics passed.",
  }, () => "2026-07-25T00:00:00.000Z");
  assert.equal(reviewed.jobs[0].selectedCandidateId, candidate.id);
  const handoff = buildEchoReferenceKreaFinishHandoff(reviewed, { jobId: queue.jobs[0].id }, () => "2026-07-25T00:00:01.000Z");
  assert.equal(handoff.status, "held-for-explicit-operator-run");
  assert.equal(handoff.operation, "comic_panel_restyle");
  assert.equal(handoff.source.sha256, "raw");
  assert.equal(handoff.custody.humanReviewRequired, true);
});
