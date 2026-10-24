import test from "node:test";
import assert from "node:assert/strict";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback, validateEchoScoreDirection, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { splitSectionAt, mergeSectionBoundary, moveSectionBoundary, editSectionCue, resetSectionCue, validateSectionEdits } from "../src/domain/echo-score-dust-sections.js";
import { createScoreDustPerformance } from "../src/domain/echo-score-dust-performance.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const base = composeEchoVisualScore(timeline);
const compose = (sections) => {
  assert.equal(validateEchoScoreDirection({ sections }).ok, true, JSON.stringify(validateEchoScoreDirection({ sections }).errors));
  const score = composeEchoVisualScore(timeline, { sections });
  assert.equal(validateEchoVisualScore(score, { timeline }).ok, true, JSON.stringify(validateEchoVisualScore(score, { timeline }).errors));
  return score;
};

test("split, merge and move edit section boundaries and keep the score valid", () => {
  const [a, b, c] = base.cues, mid = (b.start + b.end) / 2;
  const split = compose(splitSectionAt({}, mid));
  assert.equal(split.cues.length, base.cues.length + 1);
  assert.deepEqual([split.cues[1].end, split.cues[2].start], [Number(mid.toFixed(3)), Number(mid.toFixed(3))]);
  assert.equal(split.cues[2].motifId, b.motifId, "both halves keep the repeat motif");
  const merged = compose(mergeSectionBoundary({}, b.start));
  assert.equal(merged.cues.length, base.cues.length - 1);
  assert.deepEqual([merged.cues[0].start, merged.cues[0].end], [a.start, b.end]);
  assert.deepEqual(merged.cues[0].mergedCueIds, [b.id]);
  const moved = compose(moveSectionBoundary({}, c.start, c.start + 2));
  assert.deepEqual([moved.cues[1].end, moved.cues[2].start], [Number((c.start + 2).toFixed(3)), Number((c.start + 2).toFixed(3))]);
  // Moving the same boundary again updates the move instead of stacking edits.
  const twice = moveSectionBoundary(moveSectionBoundary({}, c.start, c.start + 2), c.start + 2, c.start + 3);
  assert.deepEqual(twice.move, [{ from: c.start, to: Number((c.start + 3).toFixed(3)) }]);
  assert.deepEqual(moveSectionBoundary(twice, c.start + 3, c.start).move, [], "moving it back removes the edit");
  assert.equal(splitSectionAt(splitSectionAt({}, mid), mid).split.length, 1);
});

test("edits that would make an unreadable section are skipped and reported", () => {
  const b = base.cues[1];
  const score = composeEchoVisualScore(timeline, { sections: { split: [b.start + 0.2], move: [{ from: b.end, to: b.start + 0.1 }], merge: [7.777], cues: { "cue-nope": { density: 0.5 } } } });
  assert.equal(score.cues.length, base.cues.length);
  assert.deepEqual(score.sectionEdits.skipped.map((s) => s.op), ["merge", "move", "split", "cue"]);
  const check = validateEchoVisualScore(score, { timeline });
  assert.equal(check.ok, true);
  assert.equal(check.warnings.filter((w) => w.code === "section-edit-skipped").length, 4);
});

test("one occurrence can change shape, picture, palette, density and busy without touching its group", () => {
  const group = base.motifs.find((m) => base.cues.filter((c) => c.motifId === m.id).length > 1);
  const [first, second] = base.cues.filter((c) => c.motifId === group.id);
  let sections = editSectionCue({}, second.id, { family: "jellyfish", density: 0.3, busy: [0.1, 0.2], palette: [{ h: 10, s: 0.8, l: 0.6 }] });
  sections = editSectionCue(sections, second.id, { image: { assetId: "avatar:x:y", url: "/x.png" } });
  const score = compose(sections);
  const edited = score.cues.find((c) => c.id === second.id), motif = score.motifs.find((m) => m.id === edited.motifId);
  assert.deepEqual([motif.family, motif.occurrenceOf, motif.repeatGroup, motif.imageRef.assetId], ["jellyfish", second.id, group.repeatGroup, "avatar:x:y"]);
  assert.deepEqual(score.palettes[motif.paletteId], [{ h: 10, s: 0.8, l: 0.6 }]);
  assert.deepEqual([edited.density, edited.busy], [0.3, [0.1, 0.2]]);
  const untouched = score.cues.find((c) => c.id === first.id);
  assert.equal(untouched.motifId, group.id);
  assert.equal(score.motifs.find((m) => m.id === group.id).family, group.family);
  const playback = prepareEchoScorePlayback(score, timeline), mid = (edited.start + edited.end) / 2;
  const performance = createScoreDustPerformance({ playback, settings: { seed: 2, particleCount: 300 } });
  performance.advanceTo(mid - 1); performance.advanceTo(mid);
  assert.equal(performance.swarm.formation, "jellyfish");
  assert.deepEqual(editSectionCue(sections, second.id, { family: undefined, density: undefined, busy: undefined, palette: undefined, image: undefined }).cues, {}, "clearing every field removes the patch");
  const reset = resetSectionCue({ ...sections, split: [(second.start + second.end) / 2], merge: [base.cues[0].end] }, second);
  assert.deepEqual([reset.cues, reset.split], [{}, []]);
  assert.equal(reset.merge.length, 1, "edits elsewhere are kept");
});

test("section edit validation is strict", () => {
  assert.deepEqual(validateSectionEdits(undefined), []);
  for (const bad of [{ glue: [] }, { split: [-1] }, { move: [{ from: 1 }] }, { cues: { a: { family: "teapot" } } }, { cues: { a: { busy: [0.5, 0.2] } } }, { cues: { a: { glow: 1 } } }, { cues: { a: { image: {} } } }])
    assert.ok(validateSectionEdits(bad).length > 0, JSON.stringify(bad));
  assert.ok(validateEchoScoreDirection({ sections: { split: "x" } }).errors.some((e) => e.code === "sections"));
});
