import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSemanticBlindBallots, semanticBlindPacketHash } from "../src/domain/semantic-blind-review.js";

const packet = { schemaVersion: "test", comparisons: ["a", "b", "c"].map((id, index) => ({ id, songId: index === 2 ? "song-2" : "song-1" })) };
const key = { sealedAnswers: [{ id: "a", answer: "A" }, { id: "b", answer: "B" }, { id: "c", answer: "A" }] };
test("evaluation decodes sealed proposed sides only after voting", () => {
  const ballot = { packetHash: semanticBlindPacketHash(packet), reviewerId: "human-1", votes: { a: "A", b: "B", c: "A" } };
  const result = evaluateSemanticBlindBallots({ packet, answerKey: key, ballots: [ballot] });
  assert.equal(result.overall.proposed, 3); assert.equal(result.promotionGate.allowed, true); assert.equal(result.completedBallots, 1);
});
test("ties, neither, incomplete ballots, and packet mismatch cannot create a false win", () => {
  const result = evaluateSemanticBlindBallots({ packet, answerKey: key, ballots: [{ packetHash: "wrong", votes: { a: "TIE", b: "NEITHER" } }] });
  assert.equal(result.overall.decisive, 0); assert.equal(result.packetHashValid, false); assert.equal(result.promotionGate.allowed, false);
});
