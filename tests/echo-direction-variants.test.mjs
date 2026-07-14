import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEchoDirectionForkRequest,
  createEchoDirectionWorkingFork,
  deriveEchoDirectionVariantProject,
  deriveEchoDirectionWorkingProject,
  echoDirectionVariantOptionLabel,
  groupEchoDirectionVariants,
} from "../src/domain/echo-direction-variants.js";

function project() {
  return {
    song_id: "song-one",
    song_title: "Song One",
    duration: 20,
    timeline: [{ start_sec: 0, end_sec: 20, media_id: "legacy-media", media_uri: "/media/legacy.mp4" }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 20, visualizer_id: "legacy-viz", visualizer_title: "Legacy Viz" }],
    media_density_telemetry: { profile: "legacy" },
    director_show_graph: {
      song: { id: "song-one", durationSeconds: 20 },
      tracks: [{ id: "legacy-track", role: "media", cards: [{ id: "legacy-card", startSeconds: 0, endSeconds: 20, media: { id: "legacy-media" } }] }],
      directorV2: { variantId: "legacy", variantHash: "legacy-hash" },
    },
    direction_script_variants: [{ id: "large-nested-row" }],
  };
}

function variant(id, density, ordinal) {
  return {
    id,
    title: `Generic ${id}`,
    seed: `seed:${id}`,
    variationSet: { id: "wide-library", label: "Wide library cuts" },
    cut: { ordinal, label: `Cut ${ordinal}` },
    densityProfile: { id: density.toLowerCase(), label: density },
    coveragePass: ordinal,
    timeline: [{ start_sec: 0, end_sec: 20, media_id: `${id}-media`, media_uri: `/media/${id}.mp4`, media_card_id: `${id}-card` }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 20, visualizer_id: `${id}-viz`, visualizer_title: `${id} Viz` }],
    media_density_telemetry: { profile: density.toLowerCase() },
    telemetry: { uniqueMedia: 17 + ordinal, replacementShots: 17 + ordinal },
    hyperframe_script: `<div data-cut="${id}"></div>`,
  };
}

test("metadata groups generated cuts and gives density, pass, and breadth useful labels", () => {
  const airy = variant("airy-b", "Airy", 2);
  const dense = variant("dense-a", "Dense", 1);
  const legacy = { id: "older", title: "Older balanced recast" };
  const groups = groupEchoDirectionVariants([legacy, dense, airy]);
  assert.deepEqual(groups.map((group) => group.label), ["Wide library cuts", "Earlier append-only cuts"]);
  assert.deepEqual(groups[0].variants.map((row) => row.id), ["airy-b", "dense-a"]);
  assert.equal(echoDirectionVariantOptionLabel(airy), "Airy · Cut 2 · Library pass 2 · 19 unique");
  assert.equal(echoDirectionVariantOptionLabel(legacy), "Older balanced recast");
});

test("selected cut derives its own timelines, density, and graph instead of the stale Legacy graph", () => {
  const base = project();
  const cut = variant("airy-a", "Airy", 1);
  const derived = deriveEchoDirectionVariantProject(base, cut);
  assert.equal(derived.timeline[0].media_id, "airy-a-media");
  assert.equal(derived.visualizer_timeline[0].visualizer_id, "airy-a-viz");
  assert.equal(derived.media_density_telemetry.profile, "airy");
  assert.equal(derived.director_show_graph.directorV2.variantId, "airy-a");
  assert.notEqual(derived.director_show_graph.directorV2.variantHash, "legacy-hash");
  assert.ok(derived.director_show_graph.tracks.some((track) => track.cards.some((card) => card.media?.id === "airy-a-media")));
  assert.equal(base.timeline[0].media_id, "legacy-media");
  assert.equal(base.director_show_graph.directorV2.variantId, "legacy");
});

test("generated density cuts do not inherit stale Legacy density telemetry or duplicate their label", () => {
  const cut = variant("wide-coverage-airy-v1", "Airy", 1);
  cut.cut.label = "Airy";
  delete cut.media_density_telemetry;
  cut.telemetry = { uniqueMedia: 23, mediaBearingShots: 23, actualVideoRatio: 0.451 };
  const derived = deriveEchoDirectionVariantProject(project(), cut);
  assert.equal(echoDirectionVariantOptionLabel(cut), "Airy · Library pass 1 · 23 unique");
  assert.equal(derived.media_density_telemetry.profile, undefined);
  assert.equal(derived.media_density_telemetry.actualVideoRatio, 0.451);
  assert.equal(derived.media_density_telemetry.densityProfile.id, "airy");
});

test("working continuation stays separate and serializes only an append-only child request", () => {
  const cut = variant("airy-a", "Airy", 1);
  const selected = deriveEchoDirectionVariantProject(project(), cut);
  const working = createEchoDirectionWorkingFork(selected, cut);
  assert.equal(working.project.direction_script_variants, undefined);
  working.project.timeline[0].media_id = "human-choice";
  working.project.timeline[0].media_uri = "/media/human-choice.mp4";
  working.project.lyric_style = "cinematic";
  const workingProject = deriveEchoDirectionWorkingProject(working);
  assert.equal(workingProject.director_show_graph.directorV2.parentVariantId, "airy-a");
  assert.ok(workingProject.director_show_graph.tracks.some((track) => track.cards.some((card) => card.media?.id === "human-choice")));
  const request = buildEchoDirectionForkRequest(working, workingProject);
  assert.equal(request.songId, "song-one");
  assert.equal(request.parentVariantId, "airy-a");
  assert.equal(request.timeline[0].media_id, "human-choice");
  assert.equal(request.projectPatch.lyric_style, "cinematic");
  assert.equal(request.direction_script_variants, undefined);
  assert.equal(request.director_show_graph, undefined);
  assert.equal(selected.timeline[0].media_id, "airy-a-media");
});

test("variant and working cuts retain canonical stem paths and portable shader cards", () => {
  const base = project();
  base.director_show_graph.stems = { items: [{ id: "stem:synth", stemType: "Synth", audioPath: "/stems/synth.wav" }] };
  base.director_show_graph.directorV2.stemBuses = [{ id: "bus:synth", stemType: "Synth", audioPath: "/stems/synth.wav", truthStatus: "verified_registry_path" }];
  base.director_show_graph.tracks.push({
    id: "track-b",
    role: "visualizer",
    cards: [{
      id: "card:b:0",
      startSeconds: 0,
      endSeconds: 20,
      media: { id: "airy-a-viz", title: "airy-a Viz" },
      visualization: {
        sourceId: "airy-a-viz",
        card: { schemaVersion: "hapa.visualizer-card.v2", id: "airy-a-viz", inputs: [{ NAME: "gain" }], audioMap: { gain: { signal: "rms", depth: 0.3 } }, source: { hash: "sha256:airy" }, stemFocus: "synth" },
      },
      parameters: { visualizerMappings: { gain: "synth:rms" } },
    }],
  });
  const cut = variant("airy-a", "Airy", 1);
  const selected = deriveEchoDirectionVariantProject(base, cut);
  const visualizer = selected.director_show_graph.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(selected.director_show_graph.stems.items[0].audioPath, "/stems/synth.wav");
  assert.equal(selected.director_show_graph.directorV2.stemBuses[0].truthStatus, "verified_registry_path");
  assert.equal(visualizer.visualization.card.source.hash, "sha256:airy");
  assert.equal(visualizer.visualization.card.stemFocus, "synth");

  const working = createEchoDirectionWorkingFork(selected, cut);
  working.project.timeline[0].media_id = "working-media";
  const continued = deriveEchoDirectionWorkingProject(working);
  const continuedVisualizer = continued.director_show_graph.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(continued.director_show_graph.stems.items[0].audioPath, "/stems/synth.wav");
  assert.equal(continuedVisualizer.visualization.card.source.hash, "sha256:airy");
});
