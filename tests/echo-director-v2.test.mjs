import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  assessTimingTruth,
  buildDirectorV2Artifacts,
  contentHash,
  firstStableDifference,
  NATIVE_SHOW_GRAPH_SCHEMA,
  normalizeStemRecords,
  stableStringify,
} from "../src/domain/echo-director-v2.js";

function fixture() {
  const project = {
    music_video_project: {
      song_id: "fixture-song",
      song_title: "Fixture Song",
      audio_id: "registry-fixture",
      registry_track_id: "registry-fixture",
      audio_uri: "/api/song-registry/audio/registry-fixture",
      avatar_name: "Red",
      duration: 24,
      stems_available: ["Vocals", "Drums", "Bass", "Synth", "Vocals", "Drums"],
      provenance: { generatedAt: "2026-07-01T00:00:00.000Z" },
      song_edit_map: {
        provenance: {
          lyricTimingSource: "exact-registry-track-lyric-timing",
          lyricTimingStrategy: "exact-registry-track-lyric-timing",
          lyricTimingPath: "",
          lyricTimingRegistryTrackId: "registry-fixture",
        },
        audioTelemetry: { beatTimes: Array.from({ length: 12 }, (_, index) => index * 0.5) },
        sections: [
          { id: "intro", type: "intro", label: "Intro", start: 0, end: 6, energy: 0.2, vocalDensity: "none" },
          { id: "verse", type: "verse", label: "Verse", start: 6, end: 14, energy: 0.54, vocalDensity: "medium" },
          { id: "chorus", type: "chorus", label: "Chorus", start: 14, end: 24, energy: 0.92, vocalDensity: "high" },
        ],
        editPulses: [
          { t: 6, kind: "lyric-downbeat-candidate", strength: 0.62, source: "lyric-line-start" },
          { t: 10, kind: "lyric-edit-pulse", strength: 0.55, source: "lyric-line-start" },
          { t: 14, kind: "lyric-downbeat-candidate", strength: 0.86, source: "lyric-line-start" },
          { t: 20, kind: "lyric-edit-pulse", strength: 0.74, source: "lyric-line-start" },
        ],
      },
      timed_lyrics: [
        { text: "Dear Papa", start: 6, end: 8, section_id: "verse", confidence: 0.8, timing_source: "fixture", words: [{ word: "Dear", start: 6, end: 6.8 }, { word: "Papa", start: 6.9, end: 8 }] },
        { text: "I remember", start: 14, end: 16, section_id: "chorus", confidence: 0.8, timing_source: "fixture", words: [{ word: "I", start: 14, end: 14.5 }, { word: "remember", start: 14.6, end: 16 }] },
      ],
      timeline: [
        { section_id: "intro", section_type: "intro", start_sec: 0, end_sec: 6, media_id: "m1", media_title: "One", media_uri: "/media/one.mp4", camera_motion: "slow-push-in", transition: "fade-in" },
        { section_id: "verse", section_type: "verse", start_sec: 6, end_sec: 12, media_id: "m2", media_title: "Two", media_uri: "/media/two.mp4", camera_motion: "pan-left", transition: "crossfade" },
        { section_id: "verse", section_type: "verse", start_sec: 12, end_sec: 18, media_id: "m3", media_title: "Three", media_uri: "/media/three.mp4", camera_motion: "pan-right", transition: "cut" },
        { section_id: "chorus", section_type: "chorus", start_sec: 18, end_sec: 24, media_id: "m4", media_title: "Four", media_uri: "/media/four.mp4", camera_motion: "slow-pull-out", transition: "scanline-dissolve" },
      ],
      visualizer_timeline: [
        { start_sec: 0, end_sec: 12, visualizer_id: "isf:fixture-a", visualizer_title: "Fixture A", transition: "cut" },
        { start_sec: 12, end_sec: 24, visualizer_id: "isf:fixture-b", visualizer_title: "Fixture B", transition: "crossfade" },
      ],
    },
  };
  const registry = {
    stems: ["Vocals", "Drums", "Bass", "Synth"].map((stemType, index) => ({
      id: `stem-${index}`,
      parentId: "registry-fixture",
      stemType,
      title: stemType,
      duration: 24,
      localPath: `/tmp/${stemType.toLowerCase()}.mp3`,
    })),
  };
  const manifest = {
    shaders: ["fixture-a", "fixture-b"].map((id, index) => ({
      id: `isf:${id}`,
      title: `Fixture ${index === 0 ? "A" : "B"}`,
      source: `/static/isf/${id}.fs`,
      inputs: [
        { NAME: "gain", TYPE: "float", DEFAULT: 0.25, MIN: 0, MAX: 1 },
        { NAME: "inputImage", TYPE: "image" },
      ],
      audioMap: {
        gain: { signal: index === 0 ? "rms" : "beat", depth: 0.4 },
        inputImage: { signal: "canvas", depth: 0 },
      },
    })),
  };
  return { project, registry, manifest };
}

test("Director v2 deduplicates stems and retains verified registry paths", () => {
  const { project, registry } = fixture();
  const stems = normalizeStemRecords(project, registry);
  assert.equal(stems.length, 4);
  assert.deepEqual(stems.map((stem) => stem.role), ["leadVocals", "drums", "bass", "synth"]);
  assert.ok(stems.every((stem) => stem.truthStatus === "verified_registry_path"));
});

test("Director v2 quarantines uniform generated grids and missing exact-timing paths", () => {
  const truth = assessTimingTruth(fixture().project);
  assert.equal(truth.beatStatus, "quarantined_uniform_grid");
  assert.equal(truth.lyricStatus, "usable_inferred_missing_path");
  assert.ok(truth.warnings.includes("uniform-0.5s-grid-requires-source-proof"));
  assert.ok(truth.warnings.includes("exact-lyric-claim-missing-source-path"));
});

test("timing truth requires cited source bytes to match active timing bytes", () => {
  const { project } = fixture(); const body = project.music_video_project;
  body.song_edit_map.provenance.lyricTimingPath = "/verified/timing.json";
  body.song_edit_map.provenance.lyricTimingRegistryTrackId = body.registry_track_id;
  const activeHash = crypto.createHash("sha256").update(JSON.stringify(body.timed_lyrics)).digest("hex");
  body.lyric_timing_truth = { timingSourceSha256: activeHash, activeTimingSha256: activeHash, sourceMatchesActive: true, qualityStatus: "source-aligned", confidence: .8 };
  assert.equal(assessTimingTruth(project).lyricStatus, "verified_source_content");
  body.lyric_timing_truth.activeTimingSha256 = "different";
  const rejected = assessTimingTruth(project);
  assert.equal(rejected.lyricStatus, "quarantined_source_content_mismatch");
  assert.ok(rejected.warnings.includes("lyric-source-content-mismatch"));
});

test("same treatment, recipe, and seed compile byte-identically", () => {
  const inputs = fixture();
  const one = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "visualizer-forward", seed: "stable-seed" });
  const two = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "visualizer-forward", seed: "stable-seed" });
  const three = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "visualizer-forward", seed: "stable-seed" });
  assert.equal(stableStringify(one), stableStringify(two));
  assert.equal(stableStringify(two), stableStringify(three));
  assert.equal(one.showGraph.schemaVersion, NATIVE_SHOW_GRAPH_SCHEMA);
  assert.equal(one.showGraph.runId, two.showGraph.runId);
  assert.equal(one.showGraph.stems.count, 4);
  assert.deepEqual(one.showGraph.tracks.map((track) => track.id), ["track-a", "track-b", "track-c"]);
});

test("recipe variants reuse treatment decisions and preserve hydrated visualizer wiring", () => {
  const inputs = fixture();
  const conservative = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "conservative", seed: "family" });
  const kinetic = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "kinetic", seed: "family" });
  assert.equal(conservative.treatment.treatmentId, kinetic.treatment.treatmentId);
  assert.equal(conservative.cueGraph.cueGraphId, kinetic.cueGraph.cueGraphId);
  assert.notEqual(conservative.showGraph.directorV2.variantId, kinetic.showGraph.directorV2.variantId);
  assert.equal(contentHash(conservative.treatment), contentHash(kinetic.treatment));
  assert.ok(conservative.treatment.visualizers.every((visualizer) => visualizer.inputs.length > 0));
  assert.ok(conservative.treatment.visualizers.every((visualizer) => Object.keys(visualizer.audioMap).length > 0));
  assert.deepEqual(Object.keys(conservative.treatment.inputHashes).sort(), ["canon", "lyrics", "mediaAffordances", "promptAgent", "song", "stems", "telemetry", "visualizerCatalog"]);
  assert.ok(conservative.showGraph.directorV2.modulationBindings.some((binding) => binding.target.kind === "visualizer_uniform"));
  assert.ok(kinetic.showGraph.tracks[2].cards.length >= conservative.showGraph.tracks[2].cards.length);
  assert.equal(conservative.receipt.basePlanId, conservative.treatment.treatmentId);
  assert.equal(conservative.receipt.variantSeed, "family");
  assert.deepEqual(conservative.showGraph.tracks[0].cards[0].media, kinetic.showGraph.tracks[0].cards[0].media, "locked first media card must survive rerolls");
  assert.equal(conservative.showGraph.tracks[0].cards[0].startSeconds, kinetic.showGraph.tracks[0].cards[0].startSeconds);
  const difference = firstStableDifference(conservative.showGraph, kinetic.showGraph);
  assert.ok(difference?.path.startsWith("$."));
  assert.notDeepEqual(difference?.left, difference?.right);
});

test("current Dear Papa project compiles into twelve truthful stems and manifest-hydrated visualizers", () => {
  const projectPath = "./data/music-video-projects/dear-papa-song-dear-papa-video-project.json";
  const manifestPath = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";
  const registryPath = "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";
  if (![projectPath, manifestPath, registryPath].every(fs.existsSync)) return;
  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const result = buildDirectorV2Artifacts({ project, manifest, registry, duration: 60, recipe: "visualizer-forward", seed: "dear-papa-demo-v2" });
  assert.equal(result.showGraph.stems.count, 12);
  assert.ok(result.treatment.visualizers.length >= 3);
  assert.ok(result.treatment.visualizers.every((visualizer) => visualizer.inputs.length > 0));
  assert.ok(result.treatment.visualizers.every((visualizer) => Object.keys(visualizer.audioMap).length > 0));
  assert.ok(result.showGraph.tracks[0].cards.length > 10);
  assert.ok(result.showGraph.tracks[0].cards.every((card) => card.provenance.semanticScore === ""));
});

test("Director v2 show graph carries the shared executable contract without JSON field loss", () => {
  const inputs = fixture();
  const graph = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "visualizer-forward", seed: "contract-fixture" }).showGraph;
  const director = graph.directorV2;
  for (const field of ["source", "cueGraph", "rankedMediaCandidates", "visualizerLayers", "stemBuses", "cameraKeyframes", "timeModulation", "effects", "provenance", "rendererSupport", "patchLineage", "modulationBindings", "locks"]) {
    assert.ok(Object.hasOwn(director, field), `shared contract missing ${field}`);
  }
  assert.deepEqual(new Set(Object.values(director.rendererSupport).map((entry) => entry.route)), new Set(["exact-browser-isf", "executed-offline-instance", "unsupported"]));
  assert.ok(Object.values(director.rendererSupport).every((entry) => entry.reason && Array.isArray(entry.unsupported)), "every renderer route must carry visible capability truth");
  assert.deepEqual(JSON.parse(JSON.stringify(graph)), graph, "Echo JSON adapter must preserve the whole shared graph");
  assert.ok(graph.tracks[0].cards[0].transition);
  assert.equal(graph.tracks[0].cards[0].cameraKeyframes.length, 2);
});
