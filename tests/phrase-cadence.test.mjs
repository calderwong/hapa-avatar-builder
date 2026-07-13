import test from "node:test";
import assert from "node:assert/strict";
import { buildPhraseCadence, validatePhraseCadence } from "../src/domain/phrase-cadence.js";

test("phrase cadence declares section grammar, labels syncopation, and repairs tails", () => {
  const sections = [
    { id: "intro", type: "intro", label: "Intro", startSeconds: 0, endSeconds: 6 },
    { id: "verse", type: "verse", label: "Verse", startSeconds: 6, endSeconds: 18 },
    { id: "hook", type: "chorus", label: "Hook", startSeconds: 18, endSeconds: 30 },
  ];
  const editCues = [3, 6, 8.5, 11.8, 15.2, 18, 20.2, 22.4, 24.6, 27.1, 29.6].map((atSeconds, index) => ({ id: `cue:${index}`, atSeconds, source: "lyric-phrase" }));
  const beatTimes = Array.from({ length: 60 }, (_, index) => index * 0.5);
  const track = buildPhraseCadence({ sections, editCues, beatTimes, durationSeconds: 30 });
  assert.ok(validatePhraseCadence(track, { beatTimes }).ok);
  assert.ok(track.sections.every((section) => section.targetCutDensityPerSecond && section.holdStrategy && section.visualPeak && section.transitionGrammar.length));
  assert.ok(track.sections.flatMap((section) => section.cuts).some((cut) => cut.syncopation && cut.syncopationLabel));
  assert.ok(track.sections.some((section) => section.tailRepair));
  assert.ok(track.sections.every((section) => section.cuts.length < beatTimes.filter((beat) => beat >= section.startSeconds && beat < section.endSeconds).length));
});
