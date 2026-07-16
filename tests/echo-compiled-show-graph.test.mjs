import test from "node:test";
import assert from "node:assert/strict";
import { validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import { contentHash } from "../src/domain/echo-director-v2.js";

function sealVariant(graph) {
  const { runId: _runId, ...graphBody } = graph;
  const {
    variantId: _variantId,
    variantHash: _variantHash,
    mediaDiversityReport: _mediaDiversityReport,
    ...directorV2
  } = graphBody.directorV2;
  const variantHash = contentHash({ ...graphBody, directorV2 });
  return {
    ...graphBody,
    runId: `echo-v2:${variantHash.slice(0, 20)}`,
    directorV2: {
      ...directorV2,
      variantId: `variant:${variantHash.slice(0, 20)}`,
      variantHash,
    },
  };
}

function fixture() {
  const project = {
    song_id: "song:fixture",
    song_title: "Fixture Song",
    audio_id: "audio:fixture",
    registry_track_id: "registry:fixture",
    timeline: [{ start_sec: 0, end_sec: 4, media_id: "media:one" }],
  };
  const sourceProjectHash = contentHash(project);
  const graph = sealVariant({
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "song:fixture" },
    tracks: [{ id: "track-b", role: "visualizer", cards: [] }],
    directorV2: {
      source: {
        sourceProjectHash,
        inputHashes: { song: contentHash({ songId: project.song_id }) },
      },
      provenance: { sourceProjectHash },
    },
  });
  return { project, graph };
}

test("compiled Echo graph validation is shared and fail-closed", () => {
  const valid = fixture();
  assert.equal(validateEchoCompiledShowGraph(valid).ok, true);

  const wrongSong = fixture();
  wrongSong.graph.song.id = "song:other";
  wrongSong.graph = sealVariant(wrongSong.graph);
  assert.deepEqual(validateEchoCompiledShowGraph(wrongSong).reasons, ["graph_song_identity_mismatch"]);

  const noVariant = fixture();
  delete noVariant.graph.directorV2.variantHash;
  assert.deepEqual(validateEchoCompiledShowGraph(noVariant).reasons, ["director_variant_identity_missing"]);

  const noVisualizer = fixture();
  noVisualizer.graph.tracks = [{ id: "media-a", role: "media", cards: [] }];
  noVisualizer.graph = sealVariant(noVisualizer.graph);
  assert.deepEqual(validateEchoCompiledShowGraph(noVisualizer).reasons, ["visualizer_track_missing"]);
});

test("compiled Echo graph rejects a project changed without recompiling", () => {
  const compiled = fixture();
  compiled.project.timeline[0].media_id = "media:changed-after-compile";
  const validation = validateEchoCompiledShowGraph(compiled);
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes("source_project_hash_mismatch"));
  assert.notEqual(validation.sourceProjectHash, validation.expectedSourceProjectHash);
});

test("compiled Echo graph requires canonical SHA256 lineage", () => {
  const invalid = fixture();
  invalid.graph.directorV2.source.sourceProjectHash = "sha256:not-a-canonical-hash";
  invalid.graph.directorV2.provenance.sourceProjectHash = "also-not-a-hash";
  invalid.graph.directorV2.source.inputHashes.song = "short";
  invalid.graph.directorV2.variantHash = "sha256:fixture";
  const validation = validateEchoCompiledShowGraph(invalid);
  assert.ok(validation.reasons.includes("director_variant_hash_invalid"));
  assert.ok(validation.reasons.includes("source_project_hash_invalid"));
  assert.ok(validation.reasons.includes("source_input_hash_invalid"));
});

test("compiled Echo graph rejects a graph changed without resealing its variant hash", () => {
  const compiled = fixture();
  compiled.graph.tracks[0].cards.push({ id: "unsealed-card" });
  assert.ok(validateEchoCompiledShowGraph(compiled).reasons.includes("director_variant_hash_mismatch"));
});

test("compiled Echo graph treats missing legacy output profiles as Landscape", () => {
  const legacy = fixture();
  const validation = validateEchoCompiledShowGraph(legacy);

  assert.equal(validation.ok, true);
  assert.equal(validation.projectOutputProfile.id, "landscape");
  assert.equal(validation.graphOutputProfile.id, "landscape");
  assert.equal(validation.directorOutputProfile.id, "landscape");
});

test("compiled Echo graph requires root and director output profiles to match the project", () => {
  const vertical = fixture();
  vertical.project.output_profile = "vertical";
  const sourceProjectHash = contentHash(vertical.project);
  vertical.graph.outputProfile = "vertical";
  vertical.graph.directorV2.outputProfile = "vertical";
  vertical.graph.directorV2.source.sourceProjectHash = sourceProjectHash;
  vertical.graph.directorV2.provenance.sourceProjectHash = sourceProjectHash;
  vertical.graph = sealVariant(vertical.graph);

  assert.equal(validateEchoCompiledShowGraph(vertical).ok, true);

  const wrongRoot = structuredClone(vertical);
  wrongRoot.graph.outputProfile = "landscape";
  wrongRoot.graph = sealVariant(wrongRoot.graph);
  assert.deepEqual(
    validateEchoCompiledShowGraph(wrongRoot).reasons,
    ["graph_output_profile_mismatch", "graph_director_output_profile_mismatch"],
  );

  const wrongDirector = structuredClone(vertical);
  wrongDirector.graph.directorV2.outputProfile = "landscape";
  wrongDirector.graph = sealVariant(wrongDirector.graph);
  assert.deepEqual(
    validateEchoCompiledShowGraph(wrongDirector).reasons,
    ["director_output_profile_mismatch", "graph_director_output_profile_mismatch"],
  );
});

test("compiled Echo graph validates a derived cut profile without losing canonical source lineage", () => {
  const canonical = fixture();
  const selectedProject = { ...canonical.project, output_profile: "vertical" };
  canonical.graph.outputProfile = "vertical";
  canonical.graph.directorV2.outputProfile = "vertical";
  canonical.graph = sealVariant(canonical.graph);

  const validation = validateEchoCompiledShowGraph({
    project: selectedProject,
    sourceProject: canonical.project,
    graph: canonical.graph,
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.projectOutputProfile.id, "vertical");
  assert.equal(validation.graphOutputProfile.id, "vertical");
  assert.equal(validation.directorOutputProfile.id, "vertical");
  assert.equal(validation.expectedSourceProjectHash, contentHash(canonical.project));

  assert.deepEqual(
    validateEchoCompiledShowGraph({ project: selectedProject, graph: canonical.graph }).reasons,
    ["source_project_hash_mismatch"],
  );
});

test("compiled Echo graph rejects lineage borrowed from another song identity", () => {
  const canonical = fixture();
  const selectedProject = { ...canonical.project, output_profile: "vertical" };
  canonical.graph.outputProfile = "vertical";
  canonical.graph.directorV2.outputProfile = "vertical";
  canonical.graph = sealVariant(canonical.graph);

  const wrongSong = { ...canonical.project, song_id: "song:other" };
  const wrongAudio = { ...canonical.project, audio_id: "audio:other" };
  const wrongRegistry = { ...canonical.project, registry_track_id: "registry:other" };
  assert.ok(validateEchoCompiledShowGraph({ project: selectedProject, sourceProject: wrongSong, graph: canonical.graph })
    .reasons.includes("source_project_song_identity_mismatch"));
  assert.ok(validateEchoCompiledShowGraph({ project: selectedProject, sourceProject: wrongAudio, graph: canonical.graph })
    .reasons.includes("source_project_audio_identity_mismatch"));
  assert.ok(validateEchoCompiledShowGraph({ project: selectedProject, sourceProject: wrongRegistry, graph: canonical.graph })
    .reasons.includes("source_project_registry_identity_mismatch"));
});

test("compiled Echo graph defaults a missing graph profile to Landscape before comparison", () => {
  const project = fixture();
  project.project.output_profile = "vertical";
  const sourceProjectHash = contentHash(project.project);
  project.graph.directorV2.source.sourceProjectHash = sourceProjectHash;
  project.graph.directorV2.provenance.sourceProjectHash = sourceProjectHash;
  project.graph = sealVariant(project.graph);

  assert.deepEqual(
    validateEchoCompiledShowGraph(project).reasons,
    ["graph_output_profile_mismatch", "director_output_profile_mismatch"],
  );
});
