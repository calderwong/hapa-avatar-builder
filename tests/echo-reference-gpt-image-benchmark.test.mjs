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
