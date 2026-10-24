import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEchoMusicalTimelineFromAtlas, buildEchoMusicalTimelineFromPerformance, composeEchoVisualScore, validateEchoVisualScore,
  prepareEchoScorePlayback, normalizeDustPlaySettings, reflexOnlyEchoTimeline, intensityAt,
  ECHO_MUSICAL_TIMELINE_SCHEMA, ECHO_VISUAL_SCORE_SCHEMA,
} from "../src/domain/echo-visual-score.js";
import { DUST_FORMATION_FAMILIES } from "../src/domain/echo-dust-swarm.js";

// Shaped after the public example in the Nanodot report: 204.92 s, ~129.8 BPM,
// seven ranges where label-1 style ranges repeat, lifts near 97.8 s and 171.6 s.
export function atlasFixture() {
  const rate = 48000, duration = 204.92, count = Math.round(duration * rate), source = "a".repeat(64);
  const beatPeriod = 60 / 129.805, beats = [];
  for (let t = 0.12; t < duration; t += beatPeriod) beats.push(t);
  const edges = [0, 9.161, 40.2, 70.5, 97.773, 149.474, 171.615, 197.455, duration];
  const quiet = new Set([0, 5, 7]);
  const regions = edges.slice(0, -1).map((start, i) => ({ id: `master:region:${i}`, start_sample: Math.round(start * rate), end_sample: i === edges.length - 2 ? count : Math.round(edges[i + 1] * rate), label: `Region ${i + 1}`, mean_rms_dbfs: quiet.has(i) ? -30 : -14 }));
  const frames = [];
  for (let t = 0; t < duration; t += 0.25) {
    const region = edges.findIndex((edge, i) => t >= edge && t < edges[i + 1]);
    frames.push({ sample: Math.round(t * rate), novelty: 0, rms_dbfs: quiet.has(region) ? -32 + Math.sin(t) : -14 + Math.sin(t) });
  }
  const observations = [
    ...beats.map((t, i) => ({ id: `master:beat:${i}`, kind: "hapa.audio.beat_candidate", subject_id: "master", start_sample: Math.round(t * rate), end_sample: Math.round(t * rate), shape: "instant" })),
    ...beats.filter((_, i) => i % 4 === 0).map((t, i) => ({ id: `master:downbeat:${i}`, kind: "hapa.audio.downbeat_candidate", subject_id: "master", start_sample: Math.round(t * rate), end_sample: Math.round(t * rate), shape: "instant" })),
  ];
  return {
    run_id: "run-trip", song_id: "song-trip", schema_version: "hapa.audio-atlas.measurements.v1",
    assets: [{ id: "master", status: "ready", source_sha256: source, timeline_id: `pcm:${"b".repeat(64)}:48000:2`, sample_rate_hz: rate, sample_count: count, channels: 2 }],
    observations,
    musical_structure: {
      regions, frames,
      repeats: [{ left_id: "master:region:1", right_id: "master:region:3", similarity: 0.95 }, { left_id: "master:region:3", right_id: "master:region:6", similarity: 0.94 }],
      transitions: [
        { start_sample: Math.round(95.7 * rate), end_sample: Math.round(99.7 * rate), boundary_sample: Math.round(97.773 * rate), kind: "energy_rise_candidate", delta_db: 16 },
        { start_sample: Math.round(147 * rate), end_sample: Math.round(151 * rate), boundary_sample: Math.round(149.474 * rate), kind: "energy_drop_candidate", delta_db: -15 },
        { start_sample: Math.round(169.6 * rate), end_sample: Math.round(173.6 * rate), boundary_sample: Math.round(171.615 * rate), kind: "energy_rise_candidate", delta_db: 15 },
      ],
    },
  };
}

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
