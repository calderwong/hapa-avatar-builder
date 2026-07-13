import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDirectorV2Artifacts,
  contentHash,
  stableStringify,
} from "../src/domain/echo-director-v2.js";

function inputs() {
  const project = { music_video_project: {
    song_id: "cue-proof",
    song_title: "Cue Proof",
    audio_id: "cue-proof-track",
    duration: 12,
    song_edit_map: {
      provenance: { lyricTimingSource: "aligned-phrase-fixture", lyricTimingPath: "/fixtures/cue-proof.json" },
      sections: [
        { id: "intro", type: "intro", start: 0, end: 4 },
        { id: "hook", type: "chorus", start: 4, end: 12 },
      ],
      editPulses: [{ t: 4, kind: "edit_pulse", strength: 0.9, source: "fixture-pulse" }],
    },
    timed_lyrics: [{ text: "Dear Papa", start: 4, end: 6, section_id: "hook", confidence: 0.83, timing_source: "aligned-phrase-fixture" }],
    timeline: [
      { section_id: "intro", section_type: "intro", start_sec: 0, end_sec: 4, media_id: "one", media_title: "One", media_uri: "/media/one.mp4" },
      { section_id: "hook", section_type: "chorus", start_sec: 4, end_sec: 12, media_id: "two", media_title: "Two", media_uri: "/media/two.mp4" },
    ],
    visualizer_timeline: [{ start_sec: 0, end_sec: 12, visualizer_id: "isf:fixture", visualizer_title: "Fixture" }],
  } };
  const manifest = { shaders: [{ id: "isf:fixture", title: "Fixture", source: "/fixture.fs", inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.2 }], audioMap: { gain: { signal: "rms", depth: 0.4 } } }] };
  const stemTelemetry = {
    schemaVersion: "hapa.stem-telemetry-bundle.v1",
    analysisVersion: "fixture-rfft-v1",
    truthStatus: "offline-decoded-local-stems",
    fps: 10,
    canonicalStemCount: 1,
    stems: [{ id: "drums", role: "drums", frames: [
      { t: 3.9, onset: 0.1 }, { t: 4, onset: 0.94 }, { t: 4.1, onset: 0.2 },
    ] }],
    masterMix: { frames: [
      { t: 0, silence: false }, { t: 10.8, silence: true }, { t: 11.4, silence: true }, { t: 12, silence: true },
    ] },
  };
  return { project, manifest, stemTelemetry, duration: 12, recipe: "visualizer-forward", seed: "cue-proof" };
}

test("canonical cues are deterministic, evidence-backed, and carry action permissions", () => {
  const one = buildDirectorV2Artifacts(inputs());
  const two = buildDirectorV2Artifacts(inputs());
  assert.equal(stableStringify(one.cueGraph), stableStringify(two.cueGraph));
  assert.deepEqual(new Set(one.cueGraph.cues.map((cue) => cue.kind)), new Set(["section_start", "section_end", "hook", "phrase", "edit_pulse", "stem_onset", "silence_start", "ringout"]));
  for (const cue of one.cueGraph.cues) {
    assert.match(cue.id, /^cue:[a-f0-9]{16}$/);
    assert.equal(Object.hasOwn(cue, "confidence"), true);
    assert.ok(cue.confidence === null || (cue.confidence >= 0 && cue.confidence <= 1));
    assert.ok(cue.toleranceSeconds > 0);
    assert.ok(cue.source);
    assert.ok(cue.sectionRole);
    assert.ok(cue.eligibleActions.length > 0);
    assert.equal(cue.approved, true);
    assert.equal(cue.id, `cue:${contentHash({
      kind: cue.kind,
      atSeconds: cue.atSeconds,
      source: cue.source,
      confidence: cue.confidence,
      toleranceSeconds: cue.toleranceSeconds,
      sectionRole: cue.sectionRole,
      eligibleActions: cue.eligibleActions,
      evidence: cue.evidence,
      approved: cue.approved,
    }).slice(0, 16)}`);
  }
  assert.equal(one.cueGraph.cues.some((cue) => ["beat", "bar"].includes(cue.kind)), false, "absent beat/bar evidence must not be invented");
  assert.deepEqual(one.showGraph.directorV2.cueGraph.cues, one.cueGraph.cues);
  assert.ok(one.showGraph.tracks[0].cards.every((card) => Boolean(card.provenance.boundaryCueId) !== Boolean(card.provenance.offGridReason)));
  assert.ok(one.showGraph.tracks[2].cards.every((card) => card.provenance.cueId.startsWith("cue:")));
});
