import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEchoMusicalTimelineFromAtlas, buildEchoMusicalTimelineFromPerformance, composeEchoVisualScore, validateEchoVisualScore,
  prepareEchoScorePlayback, normalizeDustPlaySettings, reflexOnlyEchoTimeline, intensityAt,
  selectEchoScorePhrases, validateEchoScoreDirection,
  ECHO_MUSICAL_TIMELINE_SCHEMA, ECHO_VISUAL_SCORE_SCHEMA,
} from "../src/domain/echo-visual-score.js";
import { DUST_FORMATION_FAMILIES } from "../src/domain/echo-dust-swarm.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";


test("Atlas evidence becomes a versioned musical timeline without changing the result", () => {
  const result = atlasFixture(), before = JSON.stringify(result);
  const timeline = buildEchoMusicalTimelineFromAtlas(result);
  assert.equal(JSON.stringify(result), before);
  assert.equal(timeline.schemaVersion, ECHO_MUSICAL_TIMELINE_SCHEMA);
  assert.equal(timeline.source.sourceSha256, "a".repeat(64));
  assert.equal(timeline.source.runId, "run-trip");
  assert.equal(timeline.sections.length, 8);
  assert.ok(Math.abs(timeline.tempo.bpm - 129.805) < 0.05);
  // Fast and slow interpretations are both kept; half time is ~64.9 BPM.
  assert.equal(timeline.tempo.ambiguous, true);
  assert.ok(Math.abs(timeline.tempo.alternativesBpm.half - 64.9) < 0.05);
  assert.deepEqual(timeline.events.map((e) => e.kind), ["lift", "fall", "lift"]);
  assert.equal(timeline.events[0].at, 97.773);
  // Repeats chain 1 ↔ 3 ↔ 6 into one group with ordered occurrences.
  const grouped = timeline.sections.filter((s) => s.repeatGroup === timeline.sections[1].repeatGroup);
  assert.deepEqual(grouped.map((s) => s.index), [1, 3, 6]);
  assert.deepEqual(grouped.map((s) => s.occurrence), [0, 1, 2]);
  assert.equal(timeline.intensity.status, "candidate");
  assert.ok(intensityAt(timeline.intensity, 120) > intensityAt(timeline.intensity, 4));
  assert.equal(timeline.qualification.qualityQualified, false);
  assert.equal(buildEchoMusicalTimelineFromAtlas(atlasFixture()).fingerprint, timeline.fingerprint);
});

test("missing structure stays explicit and a ready master is required", () => {
  const result = atlasFixture();
  delete result.musical_structure;
  const timeline = buildEchoMusicalTimelineFromAtlas(result);
  assert.equal(timeline.sections.length, 1);
  assert.equal(timeline.coverage.sections, "not_requested");
  assert.equal(timeline.intensity.status, "unavailable");
  assert.throws(() => buildEchoMusicalTimelineFromAtlas({ assets: [{ id: "master", status: "failed" }] }), /ready Master/);
});

test("the composer gives repeats one motif and palette, with busier later returns", () => {
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const score = composeEchoVisualScore(timeline);
  assert.equal(score.schemaVersion, ECHO_VISUAL_SCORE_SCHEMA);
  assert.equal(score.timelineRef.fingerprint, timeline.fingerprint);
  const repeated = score.cues.filter((c) => [1, 3, 6].includes(Number(c.sectionId.split(":").pop())));
  assert.equal(new Set(repeated.map((c) => c.motifId)).size, 1);
  assert.ok(repeated[2].busy[0] > repeated[0].busy[0]);
  for (const motif of score.motifs) {
    assert.ok(DUST_FORMATION_FAMILIES.includes(motif.family));
    assert.equal(motif.allowedFamilies[0], motif.family);
    assert.ok(score.palettes[motif.paletteId].length === 3);
    assert.ok(motif.reason);
  }
  assert.ok(score.cues.every((c) => c.reason.includes("relative energy")));
  assert.deepEqual(score.events.map((e) => e.response), ["shock", "calm", "shock"]);
  assert.equal(composeEchoVisualScore(timeline).fingerprint, score.fingerprint);
  const pinned = composeEchoVisualScore(timeline, { families: { [timeline.sections[1].repeatGroup]: "snowflake" }, baseHue: 200 });
  assert.equal(pinned.motifs.find((m) => m.repeatGroup === timeline.sections[1].repeatGroup).family, "snowflake");
  assert.equal(validateEchoVisualScore(score, { timeline }).ok, true);
});

test("the validator rejects absent assets, unreadable cues, broken refs and camera conflicts", () => {
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const base = composeEchoVisualScore(timeline, { images: { [timeline.sections[0].repeatGroup]: { assetId: "atlas-cell-1", cell: [0, 0], grid: [4, 4] } } });
  assert.equal(validateEchoVisualScore(base, { timeline, assets: ["atlas-cell-1"] }).ok, true);
  const codes = (score, options = { timeline, assets: ["atlas-cell-1"] }) => validateEchoVisualScore(score, options).errors.map((e) => e.code);
  assert.ok(codes(base, { timeline, assets: [] }).includes("absent-asset"));
  const short = structuredClone(base); short.cues[0].end = short.cues[0].start + 0.2; short.cues[1].start = short.cues[0].end;
  assert.ok(codes(short).includes("unreadable-cue"));
  const missing = structuredClone(base); missing.cues[2].motifId = "motif-nope";
  assert.ok(codes(missing).includes("missing-motif"));
  const overlap = structuredClone(base); overlap.cues[2].start -= 3;
  assert.ok(codes(overlap).includes("cue-overlap"));
  const family = structuredClone(base); family.motifs[0].family = "teapot";
  assert.ok(codes(family).includes("motif-family"));
  const camera = structuredClone(base); camera.cameraMoves = [{ id: "a", start: 10, end: 20, mode: "push" }, { id: "b", start: 15, end: 25, mode: "hold" }];
  assert.ok(codes(camera).includes("camera-conflict"));
  const sameCamera = structuredClone(base); sameCamera.cameraMoves = [{ id: "a", start: 10, end: 20, mode: "hold" }, { id: "b", start: 15, end: 25, mode: "hold" }];
  assert.ok(!codes(sameCamera).includes("camera-conflict"));
  const phrase = structuredClone(base); phrase.phrases = [{ id: "p", text: "edge", start: 30, end: 30 }];
  assert.ok(codes(phrase).includes("phrase-range"));
  const other = composeEchoVisualScore(buildEchoMusicalTimelineFromAtlas({ ...atlasFixture(), run_id: "other-run" }));
  assert.ok(codes(other).includes("timeline-mismatch"));
  const quick = composeEchoVisualScore(timeline, { phrases: [{ text: "a long phrase that cannot be read", start: 50, end: 50.5 }] });
  assert.ok(validateEchoVisualScore(quick, { timeline }).warnings.some((w) => w.code === "phrase-short"));
});

test("playback answers now and next: cue, beat phase, anticipation and crossings", () => {
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const score = composeEchoVisualScore(timeline, { phrases: [{ text: "to the edge", start: 120, end: 123 }] });
  const play = prepareEchoScorePlayback(score, timeline);
  const before = play.stateAt(96);
  assert.equal(before.nextEvent.kind, "lift");
  assert.ok(before.anticipation > 0.2 && before.anticipation < 1);
  assert.equal(play.stateAt(80).anticipation, 0);
  assert.ok(before.beat.phase >= 0 && before.beat.phase <= 1);
  assert.ok(Math.abs(before.beat.period - 60 / 129.805) < 1e-3);
  assert.ok(play.stateAt(121).phrase.text === "to the edge" && play.stateAt(121).calm > 0.5);
  const crossing = play.crossings(97.7, 97.8);
  assert.equal(crossing.events.length, 1);
  assert.equal(crossing.events[0].response, "shock");
  assert.equal(play.crossings(10, 60).events.length, 0, "seeks never fire every event");
  const half = prepareEchoScorePlayback(score, timeline, { pulse: "half" });
  assert.ok(Math.abs(half.stateAt(50).beat.period - 2 * 60 / 129.805) < 1e-3);
  const double = prepareEchoScorePlayback(score, timeline, { pulse: "double" });
  assert.ok(Math.abs(double.stateAt(50).beat.period - 30 / 129.805) < 1e-3);
  const broken = structuredClone(score); broken.cues[0].motifId = "x";
  assert.throws(() => prepareEchoScorePlayback(broken, timeline), /failed validation/);
});

test("play settings stay outside the score and default to a song-derived seed", () => {
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const a = normalizeDustPlaySettings({}, timeline), b = normalizeDustPlaySettings({}, timeline);
  assert.equal(a.seed, b.seed);
  assert.equal(a.prerollSeconds, 1.5);
  assert.equal(normalizeDustPlaySettings({ seed: 9, pulse: "half", particleCount: 99999 }).particleCount, 20000);
  assert.equal(normalizeDustPlaySettings({ pulse: "sideways" }).pulse, "normal");
});

test("prepared performance and reflex-only fallbacks stay honest about coverage", () => {
  const performance = { songId: "s", durationSeconds: 20, masterAudioHash: "c".repeat(64),
    buses: [{ id: "master", frames: Array.from({ length: 80 }, (_, i) => ({ t: i / 4, rms: 0.05 + (i > 40 ? 0.3 : 0) })) }],
    events: [{ kind: "beat", atSeconds: 1 }, { kind: "beat", atSeconds: 1.5 }, { kind: "section", atSeconds: 10 }] };
  const timeline = buildEchoMusicalTimelineFromPerformance(performance);
  assert.equal(timeline.sections.length, 2);
  assert.equal(timeline.coverage.repeats, "unknown");
  assert.equal(validateEchoVisualScore(composeEchoVisualScore(timeline), { timeline }).ok, true);
  const reflex = reflexOnlyEchoTimeline(30);
  assert.equal(reflex.source.kind, "reflex-only");
  assert.equal(prepareEchoScorePlayback(composeEchoVisualScore(reflex), reflex).stateAt(5).nextEvent, null);
});

test("Atlas API/CLI projection composes or validates without mutating the run", async () => {
  const { atlasVisualScore } = await import("../server/audio-atlas-visual-score.mjs");
  const result = atlasFixture(), before = JSON.stringify(result);
  const composed = atlasVisualScore(result, { pulse: "half", seed: "42" });
  assert.equal(JSON.stringify(result), before);
  assert.equal(composed.score_origin, "composed");
  assert.equal(composed.validation.ok, true);
  assert.equal(composed.playSettings.pulse, "half");
  assert.equal(composed.playSettings.seed, 42);
  const group = composed.timeline.sections[0].repeatGroup;
  const directed = atlasVisualScore(result, { direction: JSON.stringify({ families: { [group]: "jellyfish" } }) });
  assert.equal(directed.score.motifs.find((m) => m.repeatGroup === group).family, "jellyfish");
  const broken = structuredClone(composed.score); broken.cues[1].motifId = "missing";
  const checked = atlasVisualScore(result, { score: broken });
  assert.equal(checked.score_origin, "supplied");
  assert.equal(checked.validation.ok, false);
  assert.throws(() => atlasVisualScore(result, { direction: "{not json" }), /must be JSON/);
});

function lyricLines() {
  const hook = "take me to the edge";
  const lines = [];
  let t = 12;
  for (let i = 0; i < 24; i++) {
    const text = i % 4 === 1 ? hook : i === 7 ? "a very long verse line that keeps going and going past what anyone can read" : `verse line number ${i}`;
    const words = text.split(" ").map((word, k) => ({ text: word, start: t + k * 0.3, end: t + k * 0.3 + 0.25 }));
    lines.push({ id: `line-${i}`, text, start: t, end: t + Math.max(2.4, words.length * 0.3), words });
    t += 7.5;
  }
  return lines;
}

test("lyric hooks are chosen sparsely from measured timing, never invented", () => {
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const selection = selectEchoScorePhrases(lyricLines(), timeline, { lyricAudioHash: "sha256:" + "a".repeat(64) });
  assert.equal(selection.status, "selected");
  assert.ok(selection.phrases.length >= 2 && selection.phrases.length <= 8);
  assert.ok(selection.phrases.some((p) => p.text === "take me to the edge" && p.source.repeats === 6));
  const shown = selection.phrases.reduce((sum, p) => sum + p.end - p.start, 0);
  assert.ok(shown <= 0.12 * timeline.durationSeconds);
  for (let i = 1; i < selection.phrases.length; i++) assert.ok(selection.phrases[i].start >= selection.phrases[i - 1].end);
  const lines = lyricLines();
  for (const phrase of selection.phrases) {
    const line = lines.find((l) => l.id === phrase.source.lineId);
    assert.ok(phrase.start >= line.start - 1e-6 && phrase.end <= line.end + 1e-6, "times come from the measured line");
  }
  assert.equal(selectEchoScorePhrases(lyricLines(), timeline, { lyricAudioHash: "f".repeat(64) }).status, "audio-mismatch");
  assert.equal(selectEchoScorePhrases([], timeline).status, "unavailable");
  const score = composeEchoVisualScore(timeline, {}, { lyricLines: lyricLines(), lyricAudioHash: "a".repeat(64) });
  assert.equal(score.phraseSource.kind, "lyrics");
  assert.equal(validateEchoVisualScore(score, { timeline }).ok, true);
  assert.equal(composeEchoVisualScore(timeline, { lyricPhrases: "off" }, { lyricLines: lyricLines() }).phrases.length, 0);
});

test("directions are validated strictly before they are saved", () => {
  assert.equal(validateEchoScoreDirection({ families: { "group-A": "helix" }, baseHue: 210, lyricPhrases: "auto", playSettings: { pulse: "half", seed: 3 } }).ok, true);
  const codes = (direction) => validateEchoScoreDirection(direction).errors.map((e) => e.code);
  assert.ok(codes({ families: { "group-A": "teapot" } }).includes("families"));
  assert.ok(codes({ surprise: true }).includes("direction-key"));
  assert.ok(codes({ eventResponses: { lift: "explode" } }).includes("eventResponses"));
  assert.ok(codes({ phrases: [{ text: "x", start: 3, end: 3 }] }).includes("phrases"));
  assert.ok(codes({ playSettings: { pulse: "triple" } }).includes("playSettings"));
  assert.ok(codes({ images: { "group-A": { url: "x.png" } } }).includes("images"));
  assert.ok(codes([]).includes("direction"));
});

test("authored camera moves override the cue camera and phrases cannot overlap", () => {
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const score = composeEchoVisualScore(timeline, { cameraMoves: [{ id: "push-1", start: 92, end: 97.7, mode: "push" }] });
  const play = prepareEchoScorePlayback(score, timeline);
  const early = play.stateAt(92.5), late = play.stateAt(97.5);
  assert.equal(early.camera.mode, "push");
  assert.ok(late.camera.distance < early.camera.distance - 0.8);
  assert.equal(play.stateAt(100).camera.moveId, undefined);
  const overlapping = composeEchoVisualScore(timeline, { phrases: [{ text: "one", start: 10, end: 13 }, { text: "two", start: 12, end: 15 }] });
  assert.ok(validateEchoVisualScore(overlapping, { timeline }).errors.some((e) => e.code === "phrase-overlap"));
});
