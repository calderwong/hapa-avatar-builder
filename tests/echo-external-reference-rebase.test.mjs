import test from "node:test";
import assert from "node:assert/strict";

import { rebaseEchoExternalReferenceProjection } from "../src/domain/echo-external-reference-loop.js";

function sourceRun() {
  return {
    runId: "fresh",
    runHash: "fresh-hash",
    cards: [{
      id: "reference:personal",
      revisionId: "reference:personal:r2",
      publicContext: "Creator-released personal context.",
      occurrences: [{ id: "occ:fresh" }],
    }],
    contributions: [],
  };
}

test("research projection rebase refreshes source cards and preserves sourced research overlays", () => {
  const prior = {
    runId: "prior",
    runHash: "prior-hash",
    cards: [
      {
        id: "reference:personal",
        revisionId: "reference:personal:r1",
        publicContext: "Previously private.",
        occurrences: [{ id: "occ:old" }],
      },
      {
        id: "reference:researched-work",
        revisionId: "reference:researched-work:r1",
        publicContext: "Source-backed research.",
        occurrences: [{ id: "occ:research" }],
        research: { sourceResultHash: "result-hash" },
      },
    ],
    contributions: [{
      id: "external-reference-research:1",
      type: "external-reference-research-proposal",
    }],
  };
  const result = rebaseEchoExternalReferenceProjection(sourceRun(), prior);
  assert.equal(result.projectedRun.cards.length, 2);
  assert.equal(
    result.projectedRun.cards.find((card) => card.id === "reference:personal").publicContext,
    "Creator-released personal context.",
  );
  assert.ok(result.projectedRun.cards.some((card) => card.id === "reference:researched-work"));
  assert.equal(result.receipt.researchCardsAppended, 1);
  assert.equal(result.receipt.researchContributionsPreserved, 1);
  assert.notEqual(result.projectedRun.runHash, "fresh-hash");
});
