import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyMultitrackOperation, buildMultitrackProjection, editorGraphMintFingerprint, projectToEditorGraph, replayMultitrackPatches } from "../src/domain/multitrack-editor.js";

test("editor graphs carry canonical Echo output orientation into mint identity", () => {
  const landscape = projectToEditorGraph({ song_id: "song", duration: 4 });
  const vertical = projectToEditorGraph({ song_id: "song", duration: 4, output_profile: "vertical" });
  assert.equal(landscape.outputProfile.id, "landscape");
  assert.equal(vertical.outputProfile.id, "vertical");
  assert.equal(vertical.directorV2.outputProfile.height, 1920);
  assert.notEqual(editorGraphMintFingerprint(landscape), editorGraphMintFingerprint(vertical));
});

test("Vertical editor projection reframes hydrated camera corridors before mint planning", () => {
  const landscapeStart = { x: 0, y: 0.1, width: 1, height: 0.8 };
  const landscapeEnd = { x: 0, y: 0.08, width: 1, height: 0.84 };
  const verticalStart = { x: 0.3, y: 0, width: 0.4, height: 1 };
  const verticalEnd = { x: 0.28, y: 0, width: 0.44, height: 1 };
  const projected = projectToEditorGraph({
    song_id: "camera-song",
    duration: 4,
    output_profile: "vertical",
    director_show_graph: {
      schemaVersion: "hapa.music-viz.native-show-graph.v2",
      outputProfile: "landscape",
      song: { id: "camera-song", durationSeconds: 4 },
      tracks: [],
      directorV2: {
        outputProfile: "landscape",
        mediaRoleCamera: [{
          id: "camera-path:one",
          corridors: [
            { targetAspect: 16 / 9, startCrop: landscapeStart, endCrop: landscapeEnd },
            { targetAspect: 9 / 16, startCrop: verticalStart, endCrop: verticalEnd },
          ],
          keyframes: [{ offset: 0, crop: landscapeStart }, { offset: 1, crop: landscapeEnd }],
        }],
        cameraKeyframes: [
          { atSeconds: 0, cameraPathId: "camera-path:one", crop: landscapeStart },
          { atSeconds: 4, cameraPathId: "camera-path:one", crop: landscapeEnd },
        ],
        patchLineage: { patches: [], dirtyRanges: [] },
      },
    },
  });

  assert.equal(projected.outputProfile.id, "vertical");
  assert.equal(projected.directorV2.outputProfile.id, "vertical");
  assert.equal(projected.directorV2.mediaRoleCamera[0].corridors[0].targetAspect, 9 / 16);
  assert.deepEqual(projected.directorV2.mediaRoleCamera[0].keyframes.map((row) => row.crop), [verticalStart, verticalEnd]);
  assert.deepEqual(projected.directorV2.cameraKeyframes.map((row) => row.crop), [verticalStart, verticalEnd]);
});

const graph = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/native-show-graph.json", "utf8"));

test("multitrack projection exposes every playback-affecting lane with readiness and support", () => {
  const projection = buildMultitrackProjection(graph);
  for (const lane of ["audio", "track-a", "track-b", "lyrics", "camera", "visual-time", "accents", "agent-notes", "human-notes"]) assert.ok(projection.lanes.some((row) => row.id === lane), lane);
  for (const item of projection.lanes.flatMap((lane) => lane.items)) {
    assert.ok(item.id);
    assert.ok(Object.hasOwn(item, "readiness"));
    assert.ok(Object.hasOwn(item, "rendererSupport"));
  }
});

test("replace, knock, trim, blend, opacity, stem map, and camera controls emit graph patches and dirty ranges", () => {
  const mediaCard = graph.tracks[0].cards[1];
  const visualCard = graph.tracks[1].cards[0];
  const operations = [
    { kind: "replace-card", cardId: mediaCard.id, media: { id: "replacement" } },
    { kind: "knock-card", cardId: mediaCard.id, knockedOut: true },
    { kind: "trim-card", cardId: mediaCard.id, startSeconds: mediaCard.startSeconds + .1, endSeconds: mediaCard.endSeconds - .1 },
    { kind: "set-blend", cardId: visualCard.id, blendMode: "plus-lighter" },
    { kind: "set-opacity", cardId: visualCard.id, opacity: .42 },
    { kind: "set-stem-map", cardId: visualCard.id, stemMap: ["master:rms"] },
    { kind: "set-camera", cardId: mediaCard.id, motion: "roi-push", intensity: 1.1 },
  ];
  for (const operation of operations) {
    const result = applyMultitrackOperation(graph, { id: `test:${operation.kind}`, ...operation });
    assert.equal(result.patch.schemaVersion, "hapa.director.multitrack-patch.v1");
    assert.ok(result.patch.dirtyRange.affectedTrackIds.length);
    assert.ok(result.patch.dirtyRange.rebuiltArtifactHashes);
    assert.equal(result.patch.dirtyRange.unchangedTracksByteIdentical, true);
    assert.notEqual(result.patch.graphVariantHashBefore, result.patch.graphVariantHashAfter);
    assert.equal(result.patch.graphVariantHashAfter, editorGraphMintFingerprint(result.graph));
  }
});

test("UI saves patches rather than browser-only control state", () => {
  const component = fs.readFileSync("src/components/MultitrackDirectorEditor.jsx", "utf8");
  const host = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(component, /onPatch\?\.\(result\.patch\)/);
  assert.match(host, /director_show_graph_patches/);
  assert.match(host, /lastDirtyRange/);
  assert.match(host, /activeShowGraph = useMemo/);
  assert.match(host, /showGraph=\{activeShowGraph\}/);
  assert.match(component, /readiness/);
  assert.match(component, /rendererSupport/);
});

test("saved graph patches replay after refresh without rerunning direction", () => {
  const card = graph.tracks[0].cards[1];
  const first = applyMultitrackOperation(graph, { id: "persist:opacity", kind: "set-opacity", cardId: card.id, opacity: .37 });
  const second = applyMultitrackOperation(first.graph, { id: "persist:camera", kind: "set-camera", cardId: card.id, motion: "roi-push", intensity: 1.15 });
  const replayed = replayMultitrackPatches(graph, [first.patch, second.patch]);
  const persisted = replayed.tracks[0].cards.find((row) => row.id === card.id);
  assert.equal(persisted.parameters.opacity, .37);
  assert.equal(persisted.parameters.motion, "roi-push");
  assert.equal(persisted.parameters.cameraIntensity, 1.15);
  assert.equal(replayed.directorV2.patchLineage.patches.length, 2);
});

test("legacy director shots retain constituent Card identity in the editor graph", () => {
  const projected = projectToEditorGraph({
    song_id: "constituent-song",
    song_title: "Constituent Song",
    duration: 4,
    timeline: [{
      start_sec: 0,
      end_sec: 4,
      media_id: "builder-avatar:avatar-one:video-one",
      media_title: "Avatar One · Hero Move",
      media_uri: "/media/avatar-one.mp4",
      media_card_id: "avatar-one",
      decision_evidence: {
        sourceEvidence: {
          card: {
            id: "avatar-one",
            kind: "avatar",
            ref: "data/avatar-store.json#avatars/avatar-one",
            title: "Avatar One",
          },
        },
      },
    }],
  });
  assert.deepEqual(projected.tracks[0].cards[0].media, {
    id: "builder-avatar:avatar-one:video-one",
    title: "Avatar One · Hero Move",
    localPath: "/media/avatar-one.mp4",
    cardId: "avatar-one",
    cardKind: "avatar",
    cardRef: "data/avatar-store.json#avatars/avatar-one",
    cardTitle: "Avatar One",
  });
});

test("editor projection preserves runtime-contract media and explicit visualizer-only blanks", () => {
  const projected = projectToEditorGraph({
    song_id: "runtime-contract-song",
    song_title: "Runtime Contract Song",
    duration: 8,
    timeline: [{
      start_sec: 0,
      end_sec: 4,
      media_id: "media:scroll-source",
      media_title: "Scroll source",
      media_uri: "/media/scroll-source-a.mp4",
      media_contract: {
        type: "video",
        originalUri: "/media/scroll-source-a.mp4",
        runtimeUri: "/media/scroll-runtime-b.mp4",
      },
    }, {
      start_sec: 4,
      end_sec: 8,
      media_id: "none",
      media_title: "Visualizer Only",
      media_uri: "",
      media_contract: {
        type: "generated-visualizer",
        originalUri: "",
        runtimeUri: "",
      },
    }],
  });
  const [runtime, generated] = projected.tracks[0].cards;
  assert.equal(runtime.media.localPath, "/media/scroll-runtime-b.mp4");
  assert.equal(runtime.provenance.rendererRoute, "video");
  assert.equal(generated.media.id, "none");
  assert.equal(generated.media.localPath, "");
  assert.equal(generated.provenance.rendererRoute, "generated-visualizer");
});

test("timeline projection preserves verified stems and portable visualizer truth", () => {
  const portableCard = {
    schemaVersion: "hapa.visualizer-card.v2",
    id: "isf:exact-one",
    title: "Exact One",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.5 }],
    audioMap: { gain: { signal: "rms", depth: 0.4 } },
    audioSignal: ["rms"],
    source: { hash: "sha256:exact", uri: "/static/exact.fs" },
    stemFocus: "drums",
  };
  const projected = projectToEditorGraph({
    song_id: "rich-song",
    song_title: "Rich Song",
    duration: 8,
    timeline: [{ start_sec: 0, end_sec: 8, media_id: "new-media", media_title: "New Media", media_uri: "/new.mp4" }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 8, visualizer_id: "isf:exact-one", visualizer_title: "Exact One" }],
    director_show_graph: {
      song: { id: "rich-song", durationSeconds: 8 },
      stems: { nativeStatus: "partial-local-paths", items: [{ id: "stem:drums", stemType: "Drums", audioPath: "/stems/drums.wav" }] },
      tracks: [
        { id: "track-a", role: "foundation", cards: [{ id: "card:a:0", startSeconds: 0, endSeconds: 8, media: { id: "old-media" }, parameters: { opacity: 1 } }] },
        { id: "track-b", role: "visualizer", cards: [{ id: "card:b:0", startSeconds: 0, endSeconds: 8, media: { id: "isf:exact-one" }, visualization: { sourceId: "isf:exact-one", card: portableCard }, parameters: { visualizerMappings: { gain: "drums:rms" } }, provenance: { stemFocus: "drums" } }] },
      ],
      directorV2: { stemBuses: [{ id: "bus:drums", stemType: "Drums", audioPath: "/stems/drums.wav", truthStatus: "verified_registry_path" }], patchLineage: { patches: [], dirtyRanges: [] } },
    },
  });
  const visualizer = projected.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(projected.stems.items[0].audioPath, "/stems/drums.wav");
  assert.equal(projected.directorV2.stemBuses[0].truthStatus, "verified_registry_path");
  assert.deepEqual(visualizer.visualization.card.inputs, portableCard.inputs);
  assert.deepEqual(visualizer.visualization.card.audioMap, portableCard.audioMap);
  assert.equal(visualizer.visualization.card.source.hash, "sha256:exact");
  assert.equal(visualizer.parameters.visualizerMappings.gain, "drums:rms");
});

test("timeline projection marks an unknown shader instead of borrowing another shader's portable card", () => {
  const projected = projectToEditorGraph({
    song_id: "unknown-viz-song",
    duration: 4,
    visualizer_timeline: [{ start_sec: 0, end_sec: 4, visualizer_id: "isf:unknown", visualizer_title: "Unknown" }],
    director_show_graph: {
      song: { id: "unknown-viz-song", durationSeconds: 4 },
      tracks: [
        { id: "track-a", role: "foundation", cards: [] },
        { id: "track-b", role: "visualizer", cards: [{ id: "card:b:0", startSeconds: 0, endSeconds: 4, visualization: { sourceId: "isf:known", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:known" } } }] },
      ],
      directorV2: { patchLineage: { patches: [], dirtyRanges: [] } },
    },
  });
  const visualizer = projected.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(visualizer.visualization.sourceId, "isf:unknown");
  assert.equal(visualizer.visualization.card, undefined);
  assert.equal(visualizer.provenance.portableCardStatus, "missing-for-requested-source");
});
