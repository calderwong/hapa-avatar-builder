import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEchoReferenceGptImageBenchmarkManifest,
  buildEchoReferenceGptImagePrompt,
  mergeEchoReferenceGptImageBenchmarkManifest,
} from "../src/domain/echo-reference-gpt-image-benchmark.js";

function fixture() {
  const card = {
    id: "reference:test",
    revisionId: "reference:test:r1",
    title: "Test Reference",
    summary: "A public source about repairing a crossing while preserving evidence of failure.",
    publicContext: "A public source about repairing a crossing while preserving evidence of failure.",
    occurrences: [{ id: "occurrence:one", songId: "song:one", songTitle: "Song", confidence: 0.9 }],
    themes: ["repair", "memory"],
    mechanics: ["bridge restoration"],
    citations: [{ url: "https://example.test/source" }],
    authority: { evidenceClass: "direct" },
    rightsAndPrivacy: { visibility: "shared", containsPrivateClues: false },
  };
  return { card, run: { runId: "run:one", runHash: "sha256:run", cards: [card], graph: { graphHash: "sha256:graph", edges: [] } } };
}

test("GPT Image benchmark prompt is art-only and retains custody", () => {
  const { card, run } = fixture();
  const compiled = buildEchoReferenceGptImagePrompt(card, run);
  assert.match(compiled.prompt, /full-bleed vertical/);
  assert.match(compiled.prompt, /all text, letters, numerals/);
  assert.match(compiled.prompt, /original people/);
  assert.match(compiled.prompt, /source context is authoritative/);
  assert.match(compiled.prompt, /one concrete original subject/);
  assert.equal(compiled.source.title, card.title);
  assert.equal(compiled.custody.humanReviewRequired, true);
});

test("benchmark planning is deterministic and preserves imported state", () => {
  const { run } = fixture();
  const first = buildEchoReferenceGptImageBenchmarkManifest(run);
  const second = buildEchoReferenceGptImageBenchmarkManifest(run);
  assert.equal(first.manifestHash, second.manifestHash);
  assert.equal(first.jobs.length, 1);
  assert.equal(first.eligibility.eligibleSourceReferences, 1);
  first.jobs[0].status = "review-required";
  first.jobs[0].rawArtifact = { sha256: "raw" };
  const merged = mergeEchoReferenceGptImageBenchmarkManifest(first, second);
  assert.equal(merged.jobs[0].status, "review-required");
  assert.equal(merged.jobs[0].rawArtifact.sha256, "raw");
});

test("approved remainder planning includes internal comparative Cards and excludes existing media", () => {
  const { run } = fixture();
  run.cards[0].authority.reviewStatus = "approved";
  const internal = {
    ...structuredClone(run.cards[0]),
    id: "reference-card:echo-candidate:internal",
    revisionId: "reference-card:echo-candidate:internal:r1",
    title: "Internal Return Pattern",
    authority: { evidenceClass: "comparative", reviewStatus: "approved" },
    citations: [],
  };
  run.cards.push(internal);
  const manifest = buildEchoReferenceGptImageBenchmarkManifest(run, {
    approvedAtlas: true,
    assumeApproved: true,
    approvedBy: "Calder Wong",
    excludeCardIds: [run.cards[0].id],
  });
  assert.equal(manifest.jobs.length, 1);
  assert.equal(manifest.jobs[0].source.cardId, internal.id);
  assert.equal(manifest.jobs[0].custody.reviewStatus, "approved");
  assert.equal(manifest.jobs[0].custody.humanReviewRequired, false);
  assert.equal(manifest.jobs[0].review.decision, "accepted");
  assert.equal(manifest.eligibility.excludedAlreadyMediaBacked, 1);
  assert.equal(manifest.eligibility.plannedRemainder, 1);
});

test("public-figure source connections remain in provenance while generation uses an anonymous institutional mechanic", () => {
  const { card, run } = fixture();
  card.occurrences = [
    ...card.occurrences,
    {
      id: "occurrence:two",
      songId: "song:two",
      songTitle: "Song Two",
      confidence: 0.8,
      lyricSpan: { lyricText: "A quoted passage alleges Donald Trump and Epstein controlled an official message." },
    },
  ];
  const sensitivePath = "/tmp/reference-donald-trump.png";
  const compiled = buildEchoReferenceGptImagePrompt(card, run, {
    referencePacks: {
      [card.id]: {
        primaryAvatar: { id: "avatar-2", name: "Blue", path: "/tmp/blue.png" },
        supportingAvatars: [],
        referenceImagery: [{ cardId: "reference:donald-trump", title: "Donald Trump", path: sensitivePath }],
        paths: ["/tmp/blue.png", sensitivePath],
      },
    },
  });
  assert.doesNotMatch(compiled.prompt, /Donald Trump|Epstein/);
  assert.match(compiled.prompt, /institutional message control/);
  assert.match(compiled.prompt, /remain connected in Atlas text and provenance/);
  assert.deepEqual(compiled.referencePack.paths, ["/tmp/blue.png"]);
});

test("approved production queue can freeze a reference pack at an exact Card revision", () => {
  const { run } = fixture();
  const prior = buildEchoReferenceGptImageBenchmarkManifest(run);
  prior.jobs[0].status = "accepted";
  prior.jobs[0].rawArtifact = { sha256: "generated-before-neighborhood-expanded" };
  const changed = buildEchoReferenceGptImageBenchmarkManifest(run, {
    referencePacks: {
      [run.cards[0].id]: {
        primaryAvatar: { id: "avatar-2", name: "Blue", path: "/tmp/blue.png" },
        supportingAvatars: [],
        referenceImagery: [],
        paths: ["/tmp/blue.png"],
      },
    },
  });
  assert.notEqual(prior.jobs[0].promptHash, changed.jobs[0].promptHash);
  const merged = mergeEchoReferenceGptImageBenchmarkManifest(prior, changed, {
    preserveExactCardRevision: true,
  });
  assert.equal(merged.jobs[0].status, "accepted");
  assert.equal(merged.jobs[0].rawArtifact.sha256, "generated-before-neighborhood-expanded");
  assert.equal(merged.jobs[0].promptHash, prior.jobs[0].promptHash);
});
