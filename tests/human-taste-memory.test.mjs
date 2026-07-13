import test from "node:test";
import assert from "node:assert/strict";
import { activeTasteEvidence, appendTasteEvidence, applyTastePriors, createTasteMemory, evaluateTastePromotion, resetTasteScope, setTasteEvidenceEnabled, TASTE_SCOPES } from "../src/domain/human-taste-memory.js";

test("all six scopes retain source action and context as transparent priors", () => {
  let memory = createTasteMemory();
  for (const scope of TASTE_SCOPES) memory = appendTasteEvidence(memory, { scope, scopeId: scope === "global" ? "*" : `${scope}:1`, actionEventId: `action:${scope}`, action: "pin", operator: "reviewer", feature: "camera:hold", targetId: "candidate-a", recordedAt: "2026-07-11T09:40:00Z" });
  const scored = applyTastePriors([{ id: "candidate-a", score: .5 }], memory, { shot: "shot:1", song: "song:1", album: "album:1", character: "character:1", "visualizer-family": "visualizer-family:1" });
  assert.equal(scored[0].tastePriorContributions.length, 6);
  assert.equal(scored[0].baseScoreUnchanged, .5);
});

test("preferences can be disabled and scopes reset without deleting history", () => {
  let memory = appendTasteEvidence(createTasteMemory(), { scope: "song", scopeId: "song:1", actionEventId: "action:1", action: "pin", operator: "reviewer", feature: "media:m", recordedAt: "2026-07-11T09:40:00Z" });
  const id = memory.events[0].id;
  memory = setTasteEvidenceEnabled(memory, id, false, { operator: "reviewer", at: "2026-07-11T09:41:00Z" });
  assert.equal(activeTasteEvidence(memory, { song: "song:1" }).length, 0);
  memory = resetTasteScope(memory, "song", "song:1", { operator: "reviewer", at: "2026-07-11T09:42:00Z" });
  assert.equal(memory.events.length, 3);
});

test("default promotion requires blind review, safety, performance, and evidence", () => {
  assert.equal(evaluateTastePromotion({ blindReview: { status: "pass", receiptHash: "b" }, safety: { status: "pass", receiptHash: "s" }, performance: { status: "pass", receiptHash: "p" }, evidenceCount: 2 }).promoted, true);
  assert.equal(evaluateTastePromotion({ blindReview: { status: "pending" }, safety: { status: "pass", receiptHash: "s" }, performance: { status: "pass", receiptHash: "p" }, evidenceCount: 2 }).promoted, false);
});
