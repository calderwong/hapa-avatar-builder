import test from "node:test";
import assert from "node:assert/strict";
import { buildMediaDiversityReport, compareMediaDiversityReports } from "../src/domain/media-diversity-budget.js";

const graph = (name) => ({ song: { durationSeconds: 60 }, directorV2: { variantId: name }, tracks: [{ id: "track-a", role: "foundation", cards: [{ id: "a", startSeconds: 0, media: { id: "hero", groupId: "family", groupName: "chorus" } }, { id: "b", startSeconds: 12, media: { id: "hero", groupId: "family", groupName: "chorus" } }, { id: "c", startSeconds: 14, media: { id: "other", groupId: "family", groupName: "verse" } }, { id: "d", startSeconds: 16, media: { id: "other", groupId: "family", groupName: "verse" } }] }] });
test("budgets are deterministic, callbacks are labeled, and accidental repeats are penalized", () => {
  const one = buildMediaDiversityReport(graph("one")); const two = buildMediaDiversityReport(graph("one"));
  assert.deepEqual(one, two);
  assert.equal(one.callbacks[0].reason, "intentional-chorus-callback");
  assert.ok(one.penalties.some((row) => row.kind === "accidental-clip-repeat"));
});
test("variant comparison exposes unique media, spacing, role coverage, and fatigue", () => {
  const comparison = compareMediaDiversityReports([buildMediaDiversityReport(graph("one")), buildMediaDiversityReport(graph("two"))]);
  for (const row of comparison.variants) for (const key of ["uniqueMedia", "minimumFamilySpacing", "roleCoverage", "reuseFatigue"]) assert.ok(Object.hasOwn(row, key));
});
