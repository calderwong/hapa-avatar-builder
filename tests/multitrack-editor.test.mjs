import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyMultitrackOperation, buildMultitrackProjection, editorGraphMintFingerprint, projectToEditorGraph, replayMultitrackPatches, validateEditorGraphCameraBindings } from "../src/domain/multitrack-editor.js";
import { buildEchoShaderSelectionUpdate } from "../src/domain/echo-shader-picker.js";
import { compileHyperFramesShow, preflightHyperFramesMedia } from "../src/domain/hyperframes-show-compiler.js";
import { buildFoundationTimeline } from "../src/domain/hyperframes-foundation-reel.js";
import { preflightSongCardSignalGraph } from "../server/song-card-local-renderer.mjs";

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

test("historical authored transitions do not inherit the V6 physical-seam certificate", () => {
  const projected = projectToEditorGraph({
    song_id: "historical-motion-bridge",
    song_title: "Historical Motion Bridge",
    duration: 4,
    timeline: [{
      start_sec: 0,
      end_sec: 4,
      media_id: "historical-transition",
      media_title: "Historical transition",
      media_uri: "/media/historical-transition.mp4",
      camera_motion: "pan-left",
      camera_intensity: 1,
      camera_speed: 1,
      decision_evidence: {
        atomicTransition: {
          role: "authored-transition",
          endpointIdentityEvidence: "declared-card-lineage+poster-uri-match",
        },
      },
      camera_framing_contract: {
        schemaVersion: "hapa.echo.asset-camera-framing.v2",
        cropPolicy: "aspect-cover-full-bleed",
      },
    }],
  });
  const mediaCard = projected.tracks.find((track) => ["foundation", "media"].includes(track.role)).cards[0];
  assert.notEqual(mediaCard.provenance.cameraBinding, "certified-atomic-contract-preserved");
  assert.equal(mediaCard.parameters.motion, "pan-left");
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

test("timeline merge carries source geometry and rebinds reordered camera paths to selected media", () => {
  const projected = projectToEditorGraph({
    song_id: "camera-rebind-song",
    duration: 8,
    output_profile: "landscape",
    timeline: [{
      shot_index: 0,
      section_id: "verse-a",
      start_sec: 0,
      end_sec: 4,
      media_id: "selected-portrait",
      media_title: "Selected Portrait",
      media_uri: "/media/selected-portrait.mp4",
      camera_motion: "pan-down",
      camera_intensity: 1.24,
      camera_speed: 1.08,
      camera_focus: "center",
      media_contract: { type: "video", runtimeUri: "/media/selected-portrait.mp4", dimensions: { width: 720, height: 1280 } },
    }, {
      shot_index: 1,
      section_id: "verse-b",
      start_sec: 4,
      end_sec: 8,
      media_id: "selected-landscape",
      media_title: "Selected Landscape",
      media_uri: "/media/selected-landscape.mp4",
      camera_motion: "slow-push-in",
      camera_intensity: 0.95,
      camera_speed: 1.02,
      camera_focus: "center",
      media_contract: { type: "video", runtimeUri: "/media/selected-landscape.mp4", dimensions: { width: 1920, height: 1080 } },
    }],
    director_show_graph: {
      song: { id: "camera-rebind-song", durationSeconds: 8 },
      tracks: [{
        id: "track-a",
        role: "foundation",
        cards: [
          { id: "card:a:1", startSeconds: 4, endSeconds: 8, media: { id: "old-one" }, provenance: { sourceSlotId: "slot:1" }, parameters: {} },
          { id: "card:a:0", startSeconds: 0, endSeconds: 4, media: { id: "old-zero" }, provenance: { sourceSlotId: "slot:0" }, parameters: {} },
        ],
      }],
      directorV2: {
        mediaRoleCamera: [{ id: "stale-path", mediaId: "old-one", mediaCardId: "card:a:1", corridors: [] }],
        cameraKeyframes: [{ atSeconds: 0, cameraPathId: "stale-path" }],
        patchLineage: { patches: [], dirtyRanges: [] },
      },
    },
  });
  const cards = projected.tracks[0].cards;
  assert.deepEqual(cards.map((card) => card.id), ["card:a:0", "card:a:1"]);
  assert.deepEqual(cards[0].media.dimensions, { width: 720, height: 1280, maxDimension: 1280 });
  assert.equal(cards[0].media.sourceOrientation, "portrait");
  assert.equal(cards[0].media.aspectRatio, 720 / 1280);
  assert.equal(cards[0].parameters.cameraIntensity, 1.24);
  assert.equal(cards[0].parameters.cameraSpeed, 1.08);
  assert.equal(projected.directorV2.mediaRoleCamera.length, 2);
  for (const [index, path] of projected.directorV2.mediaRoleCamera.entries()) {
    assert.equal(path.mediaCardId, cards[index].id);
    assert.equal(path.mediaId, cards[index].media.id);
    for (const row of projected.directorV2.cameraKeyframes.filter((frame) => frame.cameraPathId === path.id)) {
      assert.equal(row.mediaCardId, cards[index].id);
      assert.equal(row.mediaId, cards[index].media.id);
    }
  }
  assert.deepEqual(validateEditorGraphCameraBindings(projected), {
    ok: true,
    errors: [],
    mediaCards: 2,
    cameraPaths: 2,
    cameraKeyframes: 4,
  });
  const corrupted = JSON.parse(JSON.stringify(projected));
  corrupted.directorV2.mediaRoleCamera[0].mediaId = "wrong-media";
  assert.equal(validateEditorGraphCameraBindings(corrupted).ok, false);
  assert.ok(validateEditorGraphCameraBindings(corrupted).errors.some((error) => error.startsWith("camera-path-media-mismatch")));
});

test("repeated media shots receive unique camera paths with per-card keyframe bindings", () => {
  const repeatedShot = {
    section_id: "shared-section",
    media_id: "repeated-portrait",
    media_title: "Repeated Portrait",
    media_uri: "/media/repeated-portrait.mp4",
    camera_motion: "pan-down",
    camera_intensity: 1.1,
    camera_speed: 1.05,
    camera_focus: "center",
    media_contract: {
      type: "video",
      runtimeUri: "/media/repeated-portrait.mp4",
      dimensions: { width: 720, height: 1280 },
    },
    camera_framing_contract: {
      shotRole: "portrait-anchor",
      path: {
        phraseCue: { id: "shared-phrase", atSeconds: 0, source: "test" },
      },
    },
  };
  const projected = projectToEditorGraph({
    song_id: "repeated-media-song",
    duration: 8,
    output_profile: "landscape",
    timeline: [
      { ...repeatedShot, shot_index: 0, start_sec: 0, end_sec: 4 },
      { ...repeatedShot, shot_index: 1, start_sec: 4, end_sec: 8 },
    ],
    director_show_graph: {
      song: { id: "repeated-media-song", durationSeconds: 8 },
      tracks: [{
        id: "track-a",
        role: "foundation",
        cards: [
          { id: "card:repeat:0", startSeconds: 0, endSeconds: 4, media: { id: "old-zero" }, provenance: { sourceSlotId: "slot:0" }, parameters: {} },
          { id: "card:repeat:1", startSeconds: 4, endSeconds: 8, media: { id: "old-one" }, provenance: { sourceSlotId: "slot:1" }, parameters: {} },
        ],
      }],
      directorV2: {
        mediaRoleCamera: [],
        cameraKeyframes: [],
        patchLineage: { patches: [], dirtyRanges: [] },
      },
    },
  });

  const cards = projected.tracks[0].cards;
  const paths = projected.directorV2.mediaRoleCamera;
  assert.equal(paths.length, 2);
  assert.equal(new Set(paths.map((path) => path.id)).size, 2);
  assert.deepEqual(paths.map((path) => path.mediaId), ["repeated-portrait", "repeated-portrait"]);

  for (const [index, path] of paths.entries()) {
    const frames = projected.directorV2.cameraKeyframes.filter((frame) => frame.cameraPathId === path.id);
    assert.equal(path.mediaCardId, cards[index].id);
    assert.equal(frames.length, 2);
    assert.ok(frames.every((frame) => frame.mediaCardId === cards[index].id));
    assert.ok(frames.every((frame) => frame.mediaId === "repeated-portrait"));
    assert.deepEqual(cards[index].cameraKeyframes, frames);
  }

  assert.deepEqual(validateEditorGraphCameraBindings(projected), {
    ok: true,
    errors: [],
    mediaCards: 2,
    cameraPaths: 2,
    cameraKeyframes: 4,
  });
});

test("saved media and camera patches replay before final camera bindings are certified", () => {
  const cardId = "card:patched:0";
  const projected = projectToEditorGraph({
    song_id: "patched-camera-song",
    duration: 4,
    output_profile: "landscape",
    timeline: [{
      shot_index: 0,
      section_id: "verse",
      start_sec: 0,
      end_sec: 4,
      media_id: "source-portrait",
      media_title: "Source Portrait",
      media_uri: "/media/source-portrait.mp4",
      camera_motion: "pan-down",
      camera_intensity: 0.9,
      camera_framing_contract: {
        schemaVersion: "hapa.echo.asset-camera-framing.v2",
        derived: true,
        subjectROI: { x: 0.1, y: 0.04, width: 0.3, height: 0.22 },
        path: {
          subjectROI: {
            x: 0.1,
            y: 0.04,
            width: 0.3,
            height: 0.22,
            status: "measured-subject-roi",
            evidence: "old-media-only-analysis",
          },
        },
      },
      media_contract: {
        type: "video",
        runtimeUri: "/media/source-portrait.mp4",
        dimensions: { width: 720, height: 1280 },
      },
    }],
    director_show_graph: {
      song: { id: "patched-camera-song", durationSeconds: 4 },
      tracks: [{
        id: "track-a",
        role: "foundation",
        cards: [{
          id: cardId,
          startSeconds: 0,
          endSeconds: 4,
          media: { id: "stale-media" },
          provenance: { sourceSlotId: "slot:0" },
          parameters: {},
        }],
      }],
      directorV2: {
        mediaRoleCamera: [],
        cameraKeyframes: [],
        patchLineage: { patches: [], dirtyRanges: [] },
      },
    },
    director_show_graph_patches: [{
      operation: {
        id: "saved:replace",
        kind: "replace-card",
        cardId,
        media: {
          id: "patched-landscape",
          title: "Patched Landscape",
          localPath: "/media/patched-landscape.mp4",
          dimensions: { width: 1920, height: 1080, maxDimension: 1920 },
          mediaContract: {
            type: "video",
            runtimeUri: "/media/patched-landscape.mp4",
            dimensions: { width: 1920, height: 1080 },
          },
        },
      },
    }, {
      operation: {
        id: "saved:camera",
        kind: "set-camera",
        cardId,
        motion: "roi-push",
        intensity: 1.15,
      },
    }],
  });

  const card = projected.tracks[0].cards[0];
  const path = projected.directorV2.mediaRoleCamera[0];
  assert.equal(card.media.id, "patched-landscape");
  assert.equal(card.parameters.motion, "roi-push");
  assert.equal(card.parameters.cameraIntensity, 1.15);
  assert.equal(path.mediaId, "patched-landscape");
  assert.equal(path.mediaCardId, cardId);
  assert.equal(path.sourceOrientation, "landscape");
  assert.deepEqual(path.subjectROI, {
    x: 0.25,
    y: 0.2,
    width: 0.5,
    height: 0.6,
    status: "center-safe-fallback",
    evidence: "replacement-media-center-safe-fallback",
    faceCount: 0,
  });
  assert.equal(path.framingContractSchema, null);
  assert.equal(card.provenance.cameraBinding, "selected-media-rebound");
  assert.ok(projected.directorV2.cameraKeyframes.every((frame) => (
    frame.mediaId === "patched-landscape"
    && frame.mediaCardId === cardId
    && frame.motion === "roi-push"
    && frame.intensity === 1.15
  )));
  assert.equal(projected.directorV2.variantHash, editorGraphMintFingerprint(projected));
  assert.equal(validateEditorGraphCameraBindings(projected).ok, true);
});

test("timeline projection preserves verified stems and portable visualizer truth", () => {
  const sourceHash = `sha256:${"e".repeat(64)}`;
  const portableCard = {
    schemaVersion: "hapa.visualizer-card.v2",
    id: "isf:exact-one",
    title: "Exact One",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.5 }],
    audioMap: { gain: { signal: "rms", depth: 0.4 } },
    audioSignal: ["rms"],
    source: { hash: sourceHash, uri: "/static/exact.fs" },
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
  assert.equal(visualizer.visualization.card.source.hash, sourceHash);
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

test("timeline projection attaches the exact row-carried card for a shader absent from graph templates", () => {
  const shader = {
    id: "isf:new-picker-shader",
    title: "New Picker Shader",
    source: "/api/echos/shader-source?id=isf:new-picker-shader",
    sourceHash: `sha256:${"a".repeat(64)}`,
    enabled: true,
    directorEligible: true,
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.5 }],
    audioMap: { gain: { signal: "rms", depth: 0.25 } },
    pixelGate: {
      status: "source-hash-verified",
      classification: "hash-bound-exact-proxy",
      compileAttempted: true,
      drawAttempted: true,
      playableFrameIndices: [0, 1],
    },
    hyperframesProxy: {
      assetPath: "/static/isf/proxies/new-picker-shader.png",
      assetSha256: `sha256:${"b".repeat(64)}`,
      sourceHash: `sha256:${"a".repeat(64)}`,
      width: 160,
      height: 90,
      frameCount: 2,
      fps: 4,
      controls: { gain: 0.5 },
      verified: true,
    },
  };
  const selection = buildEchoShaderSelectionUpdate(shader, {
    opacity: 0.61,
    blend_mode: "screen",
    transition: "crossfade",
    visualizer_controls: { gain: 0.7 },
  });
  const projected = projectToEditorGraph({
    song_id: "new-picker-song",
    duration: 4,
    visualizer_timeline: [{ start_sec: 0, end_sec: 4, ...selection }],
    director_show_graph: {
      song: { id: "new-picker-song", durationSeconds: 4 },
      tracks: [
        { id: "track-a", role: "foundation", cards: [] },
        { id: "track-b", role: "visualizer", cards: [{ id: "card:b:0", startSeconds: 0, endSeconds: 4, visualization: { sourceId: "isf:old-template", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:old-template" } } }] },
      ],
      directorV2: { patchLineage: { patches: [], dirtyRanges: [] } },
    },
  });
  const visualizer = projected.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(visualizer.visualization.sourceId, shader.id);
  assert.equal(visualizer.visualization.card.schemaVersion, "hapa.visualizer-card.v2");
  assert.equal(visualizer.visualization.card.id, shader.id);
  assert.equal(visualizer.visualization.card.source.hash, shader.sourceHash);
  assert.equal(visualizer.visualization.card.controls.gain, 0.5);
  assert.equal(visualizer.provenance.portableCardStatus, "attached-from-editor-selection");
});

test("None selection projects as a disabled pass-through cue that preflight does not classify as a visualizer", () => {
  const selection = buildEchoShaderSelectionUpdate({ id: "none", title: "None" }, {});
  const projected = projectToEditorGraph({
    song_id: "pass-through-song",
    duration: 4,
    timeline: [{
      start_sec: 0,
      end_sec: 4,
      media_id: "media:foundation",
      media_title: "Foundation",
      media_uri: "/media/foundation.mp4",
    }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 4, ...selection }],
    director_show_graph: {
      schemaVersion: "hapa.music-viz.native-show-graph.v2",
      song: { id: "pass-through-song", durationSeconds: 4 },
      tracks: [
        {
          id: "track-a",
          role: "foundation",
          cards: [{
            id: "card:a:0",
            startSeconds: 0,
            endSeconds: 4,
            media: { id: "none", title: "Intentional blank" },
            knockedOut: true,
            provenance: { rendererRoute: "generated-visualizer" },
          }],
        },
        { id: "track-b", role: "visualizer", cards: [{ id: "card:b:0", startSeconds: 0, endSeconds: 4, visualization: { sourceId: "isf:old", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:old" } } }] },
      ],
      directorV2: { patchLineage: { patches: [], dirtyRanges: [] } },
    },
  });
  const cue = projected.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(cue.visualization, null);
  assert.equal(cue.knockedOut, true);
  assert.equal(cue.disabled, true);
  assert.equal(cue.parameters.opacity, 0);
  assert.equal(cue.provenance.rendererRoute, "pass-through");
  assert.equal(cue.provenance.portableCardStatus, "pass-through-no-visualizer");
  const signalPreflight = preflightSongCardSignalGraph({ project: {}, showGraph: projected });
  assert.equal(signalPreflight.visualizerCount, 0);
  assert.deepEqual(signalPreflight.detachedVisualizers, []);
  assert.doesNotMatch(signalPreflight.errors.join(" "), /portable-visualizer-truth-detached/);
  const directMediaPreflight = preflightHyperFramesMedia(projected, { project: {}, root: ".", isFile: () => false });
  assert.equal(directMediaPreflight.entries.length, 1);
  assert.equal(directMediaPreflight.entries[0].cueId, "card:a:0");
  const show = compileHyperFramesShow({ showGraph: projected, telemetry: {}, project: {}, proxyRegistry: {} });
  assert.equal(show.instances.visualizers.length, 0);
  assert.equal(show.instances.media.length, 1);
  assert.doesNotThrow(() => buildFoundationTimeline(show, { projectRoot: ".", fps: 30 }));
});
