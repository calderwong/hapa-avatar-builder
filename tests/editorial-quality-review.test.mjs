import test from "node:test";
import assert from "node:assert/strict";
import { createBlindEditorialPacket, EDITORIAL_QUALITY_RUBRIC, evaluateVariantGraduation, recordEditorialScore } from "../src/domain/editorial-quality-review.js";

const graph = { song: { durationSeconds: 60 }, tracks: [{ cards: [{ id: "a", startSeconds: 0, endSeconds: 10, media: { id: "m" } }] }], directorV2: {} };

test("rubric anchors every dimension from one through five", () => {
  assert.equal(EDITORIAL_QUALITY_RUBRIC.length, 8);
  for (const dimension of EDITORIAL_QUALITY_RUBRIC) assert.deepEqual(Object.keys(dimension.anchors), ["1", "2", "3", "4", "5"]);
});

test("three-song four-cut packet is blind while the answer key stays separate", () => {
  const songs = ["dear-papa", "catch-the-rabbit", "emoji-pain"].map((songId) => ({ songId, title: songId, stemTruth: songId === "dear-papa" ? "decoded-stems" : "no-isolated-stems", candidates: ["current", "conservative", "kinetic", "visualizer-forward"].map((pipelineId) => ({ pipelineId, graph, graphRef: `${pipelineId}.json` })) }));
  const { packet, answerKey } = createBlindEditorialPacket({ songs, createdAt: "2026-07-11T08:20:00Z" });
  assert.equal(packet.comparisons.length, 3);
  assert.ok(packet.comparisons.every((row) => row.candidates.length === 4));
  assert.doesNotMatch(JSON.stringify(packet), /visualizer-forward|conservative|kinetic|"current"/);
  assert.equal(answerKey.answers.length, 12);
});

test("scores require timestamped notes", () => {
  assert.throws(() => recordEditorialScore({ scores: [] }, { comparisonId: "s", anonymousId: "A", dimensionId: "musical-alignment", score: 4 }), /timestamp and note/);
  const state = recordEditorialScore({ scores: [] }, { comparisonId: "s", anonymousId: "A", dimensionId: "musical-alignment", score: 4, atSeconds: 12.4, note: "Cut lands on the phrase release.", recordedAt: "2026-07-11T08:20:00Z" });
  assert.equal(state.scores.length, 1);
});

test("graduation requires target improvement, no regressions, and both gates", () => {
  const baseline = Object.fromEntries(EDITORIAL_QUALITY_RUBRIC.map((row) => [row.id, 3]));
  const candidate = { ...baseline, "musical-alignment": 4, "motion-intent": 4 };
  assert.equal(evaluateVariantGraduation({ baselineScores: baseline, candidateScores: candidate, targetDimensions: ["musical-alignment", "motion-intent"], gates: { safety: "pass", playback: "pass" } }).graduated, true);
  assert.equal(evaluateVariantGraduation({ baselineScores: baseline, candidateScores: { ...candidate, "lyric-legibility": 2 }, targetDimensions: ["musical-alignment"], gates: { safety: "pass", playback: "pass" } }).graduated, false);
  assert.equal(evaluateVariantGraduation({ baselineScores: baseline, candidateScores: candidate, targetDimensions: ["musical-alignment"], gates: { safety: "pending-export", playback: "pass" } }).graduated, false);
});
