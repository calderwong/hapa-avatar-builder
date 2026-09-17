import vm from "node:vm";
import { echoLyricOverlayExecutionContract, hashEchoLyricOverlayExecutionContract } from "../src/domain/hyperframes-show-compiler.js";
import { echoLyricTemplateFrameState, echoLyricTemplateRuntimeBrowserSource } from "../src/domain/echo-lyric-template-runtime.js";
import { projectEchoDirectorPreviewFrame } from "../src/domain/echo-director-preview-runtime.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  assessTimingTruth,
  buildCueGraph,
  buildDirectorV2Artifacts,
  buildEditorialTreatment,
  contentHash,
  firstStableDifference,
  NATIVE_SHOW_GRAPH_SCHEMA,
  normalizeStemRecords,
  stableStringify,
} from "../src/domain/echo-director-v2.js";
import { validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import {
  ECHO_AUDIO_WAVE_FORMS_SHADER,
  ECHO_ULTIMATE_FLAME_SHADER,
  withEchoPersistentShaderSlots,
} from "../src/domain/echo-persistent-shader-slots.js";

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
        { text: "Dear Papa", start: 6, end: 8, section_id: "verse", confidence: 0.8, timing_source: "fixture", words: [{ word: "Dear", confidence: 0.9, start: 6, end: 6.8 }, { word: "Papa", confidence: 0.9, start: 6.9, end: 8 }] },
        { text: "I remember", start: 14, end: 16, section_id: "chorus", confidence: 0.8, timing_source: "fixture", words: [{ word: "I", confidence: 0.9, start: 14, end: 14.5 }, { word: "remember", confidence: 0.9, start: 14.6, end: 16 }] },
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

test("declared always-on shader slots compile as three additional full-song tracks", () => {
  const inputs = fixture();
  inputs.project.music_video_project = withEchoPersistentShaderSlots(inputs.project.music_video_project);
  inputs.manifest.shaders.push(
    {
      id: ECHO_ULTIMATE_FLAME_SHADER.id,
      title: ECHO_ULTIMATE_FLAME_SHADER.title,
      source: "/static/isf/ultimateflame.fs",
      inputs: [{ NAME: "intensity", TYPE: "float", DEFAULT: 0.15, MIN: 0, MAX: 1 }],
      audioMap: { intensity: { signal: "rms", depth: 0.2 } },
    },
    {
      id: ECHO_AUDIO_WAVE_FORMS_SHADER.id,
      title: ECHO_AUDIO_WAVE_FORMS_SHADER.title,
      source: "/static/isf/simple-wave-lines.fs",
      inputs: [{ NAME: "intensity", TYPE: "float", DEFAULT: 0.5, MIN: 0, MAX: 1 }],
      audioMap: { intensity: { signal: "rms", depth: 0.16 } },
    },
  );

  const result = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "conservative", seed: "persistent-slots" });
  assert.deepEqual(result.showGraph.tracks.map((track) => track.id), [
    "track-a",
    "track-b",
    "track-shader-always-on-1",
    "track-shader-always-on-2",
    "track-shader-always-on-3",
    "track-c",
  ]);
  const [flame, waveform, open] = result.showGraph.tracks.slice(2, 5);
  assert.deepEqual(flame.cards.map((card) => [card.startSeconds, card.endSeconds, card.visualization.sourceId]), [
    [0, 24, ECHO_ULTIMATE_FLAME_SHADER.id],
  ]);
  assert.equal(flame.cards[0].visualization.stemBinding.requestedRole, "master");
  assert.deepEqual(waveform.cards.map((card) => [card.startSeconds, card.endSeconds, card.visualization.sourceId]), [
    [0, 24, ECHO_AUDIO_WAVE_FORMS_SHADER.id],
  ]);
  assert.equal(waveform.cards[0].visualization.stemBinding.requestedRole, "leadVocals");
  assert.equal(open.enabled, false);
  assert.deepEqual(open.cards, []);
  assert.equal(result.showGraph.directorV2.visualizerLayerPolicy.maxConcurrentLayers, 4);
  assert.equal(result.showGraph.directorV2.visualizerLayerPolicy.enabledPersistentSlotCount, 2);
});

test("fresh compilation binds sourceProjectHash to the raw persisted project", () => {
  const inputs = fixture();
  const rawProject = structuredClone(inputs.project);
  const preparedProject = structuredClone(rawProject);
  preparedProject.music_video_project.visualizer_timeline[0].visualizer_id = "isf:fixture-b";
  preparedProject.music_video_project.runtime_shader_repair_receipt = {
    schemaVersion: "hapa.isf.pixel-gate-repair.v1",
    replacementCount: 1,
    sourceProjectMutated: false,
  };
  const result = buildDirectorV2Artifacts({
    ...inputs,
    project: preparedProject,
    sourceProject: rawProject,
    duration: 24,
    recipe: "visualizer-forward",
    seed: "raw-source-lineage",
  });
  const rawBody = rawProject.music_video_project;
  assert.equal(result.treatment.sourceProjectHash, contentHash(rawBody));
  assert.notEqual(result.treatment.sourceProjectHash, contentHash(preparedProject.music_video_project));
  assert.equal(validateEchoCompiledShowGraph({ project: rawBody, graph: result.showGraph }).ok, true);
});

test("fresh compilation preserves bounded per-card quarantine replacement lineage", () => {
  const inputs = fixture();
  const rawProject = structuredClone(inputs.project);
  const preparedProject = structuredClone(rawProject);
  preparedProject.music_video_project.visualizer_timeline[0] = {
    ...preparedProject.music_video_project.visualizer_timeline[0],
    visualizer_id: "isf:fixture-b",
    visualizer_title: "Fixture B",
    shader_repair: {
      schemaVersion: "hapa.echo.runtime-shader-repair.v1",
      cueIndex: 0,
      reason: "fixture-quarantine",
      originalId: "isf:fixture-a",
      originalTitle: "Fixture A",
      replacementId: "isf:fixture-b",
      replacementTitle: "Fixture B",
      nonDestructive: true,
      ignoredAggregatePayload: { mustNotReachCard: true },
    },
  };
  const result = buildDirectorV2Artifacts({
    ...inputs,
    project: preparedProject,
    sourceProject: rawProject,
    duration: 24,
    recipe: "visualizer-forward",
    seed: "repair-lineage",
  });
  const card = result.showGraph.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(card.visualization.sourceId, "isf:fixture-b");
  assert.deepEqual(card.provenance.runtimeShaderRepair, {
    schemaVersion: "hapa.echo.runtime-shader-repair.v1",
    reason: "fixture-quarantine",
    originalId: "isf:fixture-a",
    originalTitle: "Fixture A",
    replacementId: "isf:fixture-b",
    replacementTitle: "Fixture B",
    nonDestructive: true,
  });
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
  assert.deepEqual(Object.keys(conservative.treatment.inputHashes).sort(), ["canon", "lyrics", "mediaAffordances", "persistentShaderSlots", "promptAgent", "song", "stemActivity", "stems", "telemetry", "visualizerCatalog"]);
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
  assert.ok(result.treatment.visualizers.some((visualizer) => Object.keys(visualizer.audioMap).length > 0));
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

test("Director v2 keeps archival lineage while selecting the runtime media contract", () => {
  const inputs = fixture();
  const shot = inputs.project.music_video_project.timeline[0];
  shot.media_uri = "/media/scroll-source-a.mp4";
  shot.runtime_media_uri = "";
  shot.media_contract = {
    type: "video",
    originalUri: "/media/scroll-source-a.mp4",
    runtimeUri: "/media/scroll-runtime-b.mp4",
  };
  const result = buildDirectorV2Artifacts({
    ...inputs,
    duration: 24,
    recipe: "visualizer-forward",
    seed: "runtime-media-contract",
    avatarRoot: "/tmp/hapa-avatar-builder",
  });
  const selected = result.treatment.mediaSlots[0].candidateMedia[0];
  assert.equal(selected.uri, "/media/scroll-source-a.mp4");
  assert.equal(selected.runtimeUri, "/media/scroll-runtime-b.mp4");
  assert.equal(selected.localPath, "/tmp/hapa-avatar-builder/data/media/scroll-runtime-b.mp4");
  assert.equal(result.showGraph.tracks[0].cards[0].media.localPath, selected.localPath);
});

test("Director v2 does not silently reinterpret an untyped blank source as an intentional visualizer cue", () => {
  const inputs = fixture();
  const shot = inputs.project.music_video_project.timeline[0];
  shot.media_id = "missing-real-media";
  shot.media_uri = "";
  delete shot.runtime_media_uri;
  delete shot.media_contract;
  const cueGraph = buildCueGraph(inputs.project, { duration: 24 });
  const treatment = buildEditorialTreatment(inputs.project, cueGraph, inputs.manifest, inputs.registry, {
    avatarRoot: "/tmp/hapa-avatar-builder",
  });
  const declared = treatment.mediaSlots[0].candidateMedia.find((media) => media.id === "missing-real-media");
  assert.equal(declared.sourceKind, "local-video");
  assert.notEqual(declared.truthStatus, "intentional-no-media");
});


test("native director word seconds survive execution hashing and all nine renderer templates", () => {
  const inputs = fixture();
  const { showGraph } = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: "conservative", seed: "word-clock" });
  const overlay = showGraph.song.lyricOverlay;
  assert.equal(overlay.lines[0].words[1].startSeconds, 6.9);
  assert.equal(overlay.lines[0].words[1].start, undefined);
  const executable = echoLyricOverlayExecutionContract(overlay);
  assert.deepEqual(executable.lines[0].words.map((word) => [word.start, word.end]), [[6, 6.8], [6.9, 8]]);
  assert.equal(hashEchoLyricOverlayExecutionContract(overlay), hashEchoLyricOverlayExecutionContract(executable));
  const retimed = structuredClone(overlay);
  retimed.lines[0].words[1].startSeconds += .1;
  assert.notEqual(hashEchoLyricOverlayExecutionContract(overlay), hashEchoLyricOverlayExecutionContract(retimed));
  const context = vm.createContext({});
  vm.runInContext(echoLyricTemplateRuntimeBrowserSource(), context);
  for (const templateId of ["kinetic-word-burst-v1", "scanline-phrase-ribbon-v1", "stacked-hook-echo-v1", "orbit-caption-v1", "center-word-focus-v1", "square-word-mosaic-v1", "letter-wave-v1", "kinetic-typewriter-v1", "vertical-poster-stack-v1"]) {
    showGraph.song.lyricOverlay.templateId = templateId;
    // Forward, backwards, direct, repeated and zero seeks must have no history.
    for (const timeSeconds of [0, 6.2, 6.85, 7.2, 7.8, 6.2, 7.2, 7.2, 0]) {
      const input = { templateId, line: overlay.lines[0], timeSeconds, fps: 30 };
      const frame = echoLyricTemplateFrameState(input);
      context.input = input;
      const browser = vm.runInContext("echoLyricTemplateFrameState(input)", context);
      assert.deepEqual(JSON.parse(JSON.stringify(browser)), frame);
      assert.deepEqual(frame, echoLyricTemplateFrameState({ ...input, line: executable.lines[0] }));
      if (timeSeconds >= 6 && timeSeconds < 8) {
        const preview = projectEchoDirectorPreviewFrame({ project: { ...inputs.project.music_video_project, timed_lyrics: [], lyrics: { enabled: true, templateId }, director_show_graph: showGraph, active_direction_script_variant: { id: "word-clock", title: "Word clock" } }, timeSeconds, fps: 30 });
        assert.deepEqual(preview.lyrics.templateFrame, frame);
      }
      if (timeSeconds === 7.2) assert.deepEqual(frame.words.map((word) => word.active), [false, true]);
      if (timeSeconds === 6.85) assert.deepEqual(frame.words.map((word) => word.active), [false, false]);
    }
  }
});

test("five narrative recipes compile distinct executable graphs without moving song or lyric clocks", async () => {
  const { NARRATIVE_VARIANT_RECIPES } = await import("../src/domain/echo-director-recipes.js");
  const inputs = fixture();
  const before = structuredClone(inputs.project);
  const graphs = [];
  for (const recipe of Object.keys(NARRATIVE_VARIANT_RECIPES)) {
    const first = buildDirectorV2Artifacts({ ...inputs, recipe, seed: "deterministic-narrative" });
    const again = buildDirectorV2Artifacts({ ...inputs, recipe, seed: "deterministic-narrative" });
    assert.equal(first.receipt.variantHash, again.receipt.variantHash);
    assert.equal(first.showGraph.directorV2.narrativeSequence.recipeId, recipe);
    assert.deepEqual(first.showGraph.tracks[0].cards.map(c => [c.startSeconds, c.endSeconds]), before.music_video_project.timeline.map(s => [s.start_sec, s.end_sec]));
    assert.deepEqual(first.showGraph.song.lyricOverlay.lines, graphs[0]?.song.lyricOverlay.lines || first.showGraph.song.lyricOverlay.lines);
    for (const track of first.showGraph.tracks.slice(1)) for (const card of track.cards) {
      const foundation = first.showGraph.tracks[0].cards.find(c => c.startSeconds <= card.startSeconds && c.endSeconds > card.startSeconds);
      if (foundation) assert.equal(card.media.id, foundation.media.id, `${recipe}:${card.id}`);
    }
    graphs.push(first.showGraph);
  }
  assert.equal(new Set(graphs.map(g => contentHash(g.tracks))).size, 5);
  assert.deepEqual(inputs.project, before);
});

test("narrative compilation carries source cast, scene and camera locks into actual selection", () => {
  const inputs = fixture();
  const body = inputs.project.music_video_project;
  body.mediaConstraints = { requiredCharacterIds: ["lead"] };
  for (const shot of body.timeline) { shot.characterIds = ["lead"]; shot.sceneIds = ["home"]; }
  body.timeline[1].locks = ["camera", "media"];
  const compiled = buildDirectorV2Artifacts({ ...inputs, recipe: "ensemble-response", mediaConstraints: { requiredSceneIds: ["home"] } });
  assert.equal(compiled.showGraph.tracks[0].cards[1].media.id, "m2");
  assert.equal(compiled.showGraph.tracks[0].cards[1].cameraKeyframes[0].motion, "pan-left");
  assert.throws(() => buildDirectorV2Artifacts({ ...inputs, recipe: "ensemble-response", mediaConstraints: { requiredCharacterIds: ["absent"] } }), error => error.statusCode === 422);
});

test("Director image contracts preserve protected framing and source identity through HyperFrames", async () => {
  const { compileHyperFramesShow } = await import('../src/domain/hyperframes-show-compiler.js');
  const inputs = fixture();
  const shot = inputs.project.music_video_project.timeline[0];
  shot.media_uri = '/media/comic-page.png';
  shot.media_contract = {
    type: 'image', originalUri: shot.media_uri, runtimeUri: shot.media_uri,
    imageShot: { original: { uri: shot.media_uri, sha256: 'a'.repeat(64), width: 1024, height: 2048 },
      pageId: 'comic-page-1', readingOrder: 0, readingSeconds: 4 },
  };
  const before = structuredClone(inputs);
  const result = buildDirectorV2Artifacts({ ...inputs, duration: 24, recipe: 'conservative', seed: 'image-geometry' });
  const card = result.showGraph.tracks[0].cards[0];
  assert.equal(card.media.imageShot.original.sha256, 'a'.repeat(64));
  assert.equal(card.cameraKeyframes.length, 3);
  assert.equal(card.cameraKeyframes[1].atSeconds, 6, "unsegmented page stays held for the whole shot");
  assert.ok(card.cameraKeyframes.every(row => row.crop.cameraModel === 'protected-v2' && row.crop.fit === 'contain'));
  assert.deepEqual(inputs, before);
  const show = compileHyperFramesShow({ showGraph: result.showGraph, project: inputs.project, telemetry: {} });
  assert.deepEqual(show.instances.media[0].imageShot, card.media.imageShot);
  assert.deepEqual(show.instances.media[0].cameraKeyframes, card.cameraKeyframes);
  assert.equal(show.instances.media[0].source.type, 'image');
});

test('execution identity includes confidence and reduced motion without converting missing confidence into evidence', () => {
  const overlay={lines:[{start:0,end:2,words:[{word:'hello',start:0,end:2}]}]};
  const initial=hashEchoLyricOverlayExecutionContract(overlay);
  assert.equal(echoLyricOverlayExecutionContract(overlay).lines[0].words[0].confidence,null);
  overlay.lines[0].words[0].confidence=.9;
  assert.notEqual(hashEchoLyricOverlayExecutionContract(overlay),initial);
  const confident=hashEchoLyricOverlayExecutionContract(overlay);
  overlay.reducedMotion=true;
  assert.notEqual(hashEchoLyricOverlayExecutionContract(overlay),confident);
});

test("lyric entry and release cues retain their source timing truth instead of claiming new onset detection", () => {
  const graph = buildCueGraph({ song_id: "s", duration: 12, timed_lyrics: [{text:"one",start:1,end:2,confidence:.4,timing_source:"manual-rough"},{text:"two",start:2.2,end:3,confidence:.5,timing_source:"manual-rough"},{text:"three",start:5,end:6,confidence:.6,timing_source:"manual-rough"}] });
  const entries=graph.cues.filter(c=>c.kind==='vocal-entry'),ends=graph.cues.filter(c=>c.kind==='phrase-end');
  assert.deepEqual(entries.map(c=>c.atSeconds),[1,5]); assert.deepEqual(ends.map(c=>c.atSeconds),[2,3,6]);
  assert.equal(entries[0].confidence,.4);assert.equal(entries[0].source,'manual-rough');
  assert.equal(entries[0].evidence.timingStatus,graph.timingTruth.lyricStatus);
  assert.equal(entries[0].evidence.timingBasis,'lyric-line-boundary');
  assert.equal(entries[0].evidence.inference,'lyric-entry-after-gap');
});

test('compiler carries section motion and layer budgets through preview and export without changing source', async () => {
  const {compileHyperFramesShow}=await import('../src/domain/hyperframes-show-compiler.js');
  const inputs=fixture();
  inputs.project.music_video_project.visualizer_timeline=Array.from({length:6},(_,i)=>({start_sec:0,end_sec:24,visualizer_id:i%2?'isf:fixture-b':'isf:fixture-a',transition:'cut'}));
  const before=structuredClone(inputs);
  const {showGraph}=buildDirectorV2Artifacts({...inputs,recipe:'ensemble-response',seed:'section-budgets'});
  const policy=showGraph.directorV2.visualBudgetPolicy;
  assert.equal(policy.sections.length,3);
  assert.ok(showGraph.directorV2.cameraKeyframes.some(row=>row.crop?.cameraModel==='section-crop-v1'));
  const preview=timeSeconds=>projectEchoDirectorPreviewFrame({project:{...inputs.project.music_video_project,director_show_graph:showGraph,active_direction_script_variant:{id:'section-budget',title:'Section budget'}},timeSeconds,fps:30});
  assert.ok(preview(2).visualizers.length<=2);
  assert.ok(preview(16).visualizers.length<=4);
  assert.equal(preview(2).visualBudget.band,'quiet');
  const show=compileHyperFramesShow({showGraph,project:inputs.project,telemetry:{}});
  assert.deepEqual(show.automation.visualBudgetPolicy,policy);
  assert.equal(show.instances.media[0].cameraKeyframes[0].crop.cameraModel,'section-crop-v1');
  const {echoCameraKeyframeAt}=await import('../src/domain/echo-camera-framing.js');
  assert.deepEqual(echoCameraKeyframeAt(show.instances.media[0].cameraKeyframes,2).crop,preview(2).camera.keyframe.crop);
  assert.deepEqual(inputs,before);
});
