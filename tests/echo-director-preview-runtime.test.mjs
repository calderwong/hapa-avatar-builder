import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ECHO_DIRECTOR_PREVIEW_CARD_PRINT_INTENT_SCHEMA,
  ECHO_DIRECTOR_PREVIEW_CARD_PRINT_RECEIPT_SCHEMA,
  ECHO_DIRECTOR_PREVIEW_FRAME_SCHEMA,
  ECHO_DIRECTOR_PREVIEW_RUNTIME_SCHEMA,
  ECHO_DIRECTOR_PREVIEW_SOURCE_SCHEMA,
  createEchoDirectorPreviewCardPrintIntent,
  createEchoDirectorPreviewRuntime,
  echoDirectorPreviewMediaTransitionState,
  projectEchoDirectorPreviewFrame,
  readEchoDirectorPreviewClock,
  resolveEchoDirectorPreviewCardPrintIntent,
  resolveEchoDirectorPreviewCameraPresentation,
  resolveEchoDirectorPreviewSourceGeometry,
  resolveEchoDirectorPreviewSourceRect,
  selectEchoDirectorPreviewSource,
} from "../src/domain/echo-director-preview-runtime.js";

function cssPreviewVisibleSourceRect({ sourceWidth, sourceHeight, outputWidth, outputHeight, presentation }) {
  const coverScale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight);
  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const objectLeft = (outputWidth - renderedWidth) * (presentation.objectPositionXPercent / 100);
  const objectTop = (outputHeight - renderedHeight) * (presentation.objectPositionYPercent / 100);
  const originX = outputWidth * (presentation.transformOriginXPercent / 100);
  const originY = outputHeight * (presentation.transformOriginYPercent / 100);
  const translateX = outputWidth * (presentation.translateXPercent / 100);
  const translateY = outputHeight * (presentation.translateYPercent / 100);
  const left = originX + ((0 - originX) / presentation.scale) - translateX;
  const top = originY + ((0 - originY) / presentation.scale) - translateY;
  const width = Math.min(sourceWidth, outputWidth / (coverScale * presentation.scale));
  const height = Math.min(sourceHeight, outputHeight / (coverScale * presentation.scale));
  return {
    x: Math.max(0, Math.min(sourceWidth - width, (left - objectLeft) / coverScale)),
    y: Math.max(0, Math.min(sourceHeight - height, (top - objectTop) / coverScale)),
    width,
    height,
  };
}

function latestCutProject() {
  return {
    song_id: "lazy-sunday",
    song_title: "Lazy Sunday",
    duration: 6,
    output_profile: "landscape",
    timeline: [{
      start_sec: 0,
      end_sec: 6,
      media_id: "legacy-media",
      media_uri: "/media/legacy.mp4",
    }],
    visualizer_timeline: [{
      start_sec: 0,
      end_sec: 6,
      visualizer_id: "legacy-shader",
      visualizer_title: "Legacy Shader",
    }],
    direction_script_variants: [
      {
        id: "legacy-baseline",
        title: "Legacy Baseline",
        status: "ready",
        updatedAt: "2026-07-31T20:00:00.000Z",
        timeline: [{ start_sec: 0, end_sec: 6, media_id: "legacy-cut-media" }],
        visualizer_timeline: [{ start_sec: 0, end_sec: 6, visualizer_id: "legacy-cut-shader" }],
      },
      {
        id: "director-cut-older",
        title: "Porch Light Cut",
        status: "ready",
        updatedAt: "2026-07-30T20:00:00.000Z",
        timeline: [{ start_sec: 0, end_sec: 6, media_id: "older-media" }],
        visualizer_timeline: [{ start_sec: 0, end_sec: 6, visualizer_id: "older-shader" }],
      },
      {
        id: "director-cut-newest",
        title: "Garden Cut",
        status: "ready",
        updatedAt: "2026-07-31T19:00:00.000Z",
        timeline: [{
          start_sec: 0,
          end_sec: 6,
          media_id: "garden-media",
          media_uri: "/media/garden.mp4",
          media_card_id: "card:garden",
        }],
        visualizer_timeline: [{
          start_sec: 0,
          end_sec: 6,
          visualizer_id: "ultimate-flame",
          visualizer_title: "Ultimate Flame",
        }],
      },
    ],
  };
}

function paritySource() {
  const project = {
    song_id: "lazy-sunday",
    song_title: "Lazy Sunday",
    duration: 6,
    lyrics: {
      enabled: true,
      templateId: "kinetic-word-burst-v1",
      position: "bottom-center",
      style: "neon-cyan",
    },
    timed_lyrics: [{
      id: "line-one",
      start: 0,
      end: 2,
      text: "Sunlight finds us",
      words: [
        { word: "Sunlight", start: 0, end: 0.8 },
        { word: "finds", start: 0.8, end: 1.4 },
        { word: "us", start: 1.4, end: 2 },
      ],
    }],
    timeline: [
      {
        start_sec: 0,
        end_sec: 3,
        media_id: "garden-open",
        media_uri: "/media/garden-open.mp4",
        media_card_id: "card:garden-open",
        media_card_kind: "scene-card",
        media_card_ref: "hapa://card/garden-open",
        media_card_title: "Garden Opens",
        transition: "crossfade",
      },
      {
        start_sec: 3,
        end_sec: 6,
        media_id: "tea-table",
        media_uri: "/media/tea-table.mp4",
        media_card_id: "card:tea-table",
        media_card_kind: "scene-card",
        media_card_title: "Tea Table",
        transition: "scanline-dissolve",
      },
    ],
  };
  const showGraph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    outputProfile: {
      id: "landscape",
      width: 1920,
      height: 1080,
      fps: 10,
    },
    song: {
      id: project.song_id,
      title: project.song_title,
      durationSeconds: 6,
      lyricOverlay: {
        ...project.lyrics,
        lines: project.timed_lyrics,
      },
    },
    tracks: [
      {
        id: "media-a",
        role: "media",
        cards: [
          {
            id: "cue:garden-open",
            trackId: "media-a",
            startSeconds: 0,
            endSeconds: 3,
            sourceCueIndex: 0,
            media: {
              id: "garden-open",
              title: "Garden Opens",
              localPath: "/media/garden-open.mp4",
              cardId: "card:garden-open",
              cardKind: "scene-card",
              cardRef: "hapa://card/garden-open",
              cardTitle: "Garden Opens",
            },
            parameters: { motion: "slow-push", cameraIntensity: 0.7 },
            transition: "crossfade",
          },
          {
            id: "cue:tea-table",
            trackId: "media-a",
            startSeconds: 3,
            endSeconds: 6,
            sourceCueIndex: 1,
            media: {
              id: "tea-table",
              title: "Tea Table",
              localPath: "/media/tea-table.mp4",
              cardId: "card:tea-table",
              cardKind: "scene-card",
              cardTitle: "Tea Table",
            },
            transition: "scanline-dissolve",
          },
        ],
      },
      {
        id: "ivf-stack",
        role: "visualizer",
        cards: [{
          id: "shader:changing",
          trackId: "ivf-stack",
          startSeconds: 0,
          endSeconds: 3,
          visualization: {
            sourceId: "shader:aurora",
            nativeKey: "Aurora",
            status: "exact",
            sourceHash: "sha256:aurora",
          },
          parameters: { opacity: 0.6, blendMode: "screen" },
          transition: "fade-in",
        }],
      },
      {
        id: "always-on-ultimate-flame",
        role: "visualizer",
        persistent: true,
        alwaysOn: true,
        slotId: "always-on-1",
        cards: [{
          id: "shader:ultimate-flame",
          trackId: "always-on-ultimate-flame",
          startSeconds: 0,
          endSeconds: 6,
          alwaysOn: true,
          persistentSlotId: "always-on-1",
          visualization: {
            sourceId: "shader:ultimate-flame",
            nativeKey: "Ultimate Flame",
            status: "exact-browser-isf",
            sourceHash: "sha256:ultimate-flame",
          },
          parameters: {
            opacity: 0.85,
            blendMode: "screen",
            stemMap: ["main"],
          },
        }],
      },
    ],
    directorV2: {
      variantId: "director-cut-newest",
      variantHash: "sha256:newest",
      cameraKeyframes: [
        {
          atSeconds: 0,
          cameraPathId: "path:slow-push",
          slotId: "slot:hero",
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          atSeconds: 2,
          cameraPathId: "path:slow-push",
          slotId: "slot:hero",
          crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        },
      ],
      visualTimeTrack: {
        events: [{ id: "visual-time:one", kind: "hold", startSeconds: 1, endSeconds: 1.5 }],
      },
      accentTrack: {
        events: [{ id: "accent:one", kind: "beat-pulse", atSeconds: 1.2, durationSeconds: 0.2 }],
      },
      effects: [{ id: "effect:one", kind: "bloom", startSeconds: 1, endSeconds: 1.4 }],
    },
  };
  return {
    schemaVersion: ECHO_DIRECTOR_PREVIEW_SOURCE_SCHEMA,
    project,
    showGraph,
    song: { id: project.song_id, title: project.song_title, durationSeconds: 6 },
    cut: {
      id: "director-cut-newest",
      title: "Garden Cut",
      fingerprint: "sha256:newest",
      strategy: "most-recent-non-legacy",
      selectionBasis: "latest-ready-non-legacy",
      legacy: false,
    },
    outputProfile: showGraph.outputProfile,
    truth: {
      selection: "latest-ready-non-legacy",
      nonLegacy: true,
      graphSchemaVersion: showGraph.schemaVersion,
      graphVariantId: "director-cut-newest",
      graphVariantHash: "sha256:newest",
    },
  };
}

function fakeCanvas() {
  const context = {
    clears: 0,
    saves: 0,
    restores: 0,
    transforms: 0,
    draws: 0,
    clearRect() { this.clears += 1; },
    save() { this.saves += 1; },
    restore() { this.restores += 1; },
    setTransform() { this.transforms += 1; },
    drawImage() { this.draws += 1; },
  };
  return {
    width: 1,
    height: 1,
    context,
    getContext(kind) {
      assert.equal(kind, "2d");
      return context;
    },
    cloneNode() {
      return fakeCanvas();
    },
  };
}

test("Preview source selects and projects the newest ready non-legacy cut without mutating the saved project", () => {
  const project = latestCutProject();
  const before = structuredClone(project);

  const source = selectEchoDirectorPreviewSource(project);

  assert.equal(source.schemaVersion, ECHO_DIRECTOR_PREVIEW_SOURCE_SCHEMA);
  assert.equal(source.cut.id, "director-cut-newest");
  assert.equal(source.cut.legacy, false);
  assert.equal(source.cut.selectionBasis, "latest-ready-non-legacy");
  assert.equal(source.showGraph.directorV2.variantId, "director-cut-newest");
  assert.ok(source.showGraph.tracks.some((track) => (
    track.cards.some((card) => card.media?.id === "garden-media")
  )));
  assert.deepEqual(project, before, "selection and projection must leave append-only source data untouched");
});

test("Preview source never silently labels Legacy Baseline as the latest cut", () => {
  const project = latestCutProject();
  project.direction_script_variants = project.direction_script_variants.filter((row) => row.id === "legacy-baseline");

  assert.throws(
    () => selectEchoDirectorPreviewSource(project),
    { code: "echo_director_preview_modern_cut_missing" },
  );
  const explicitFallback = selectEchoDirectorPreviewSource(project, { allowLegacyFallback: true });
  assert.equal(explicitFallback.cut.id, "legacy-baseline");
  assert.equal(explicitFallback.cut.legacy, true);
  assert.equal(explicitFallback.cut.selectionBasis, "explicit-legacy-fallback");
});

test("one external audio clock deterministically projects media, exact Card, shaders, camera, automation, transitions, and lyrics", () => {
  const source = paritySource();
  const clock = {
    currentTime: 1.26,
    duration: 6,
    paused: false,
    source: "master-audio-element",
  };

  const frame = projectEchoDirectorPreviewFrame({ source, clock });
  const repeated = projectEchoDirectorPreviewFrame({ source, clock });

  assert.equal(frame.schemaVersion, ECHO_DIRECTOR_PREVIEW_FRAME_SCHEMA);
  assert.deepEqual(frame, repeated);
  assert.match(frame.frameKey, /sha256:newest/);
  assert.equal(frame.clock.source, "master-audio-element");
  assert.equal(frame.clock.frame, 37);
  assert.equal(frame.clock.seconds, 1.233333);
  assert.equal(frame.cut.id, "director-cut-newest");
  assert.equal(frame.primaryMediaCue.id, "cue:garden-open");
  assert.equal(frame.primaryMediaCue.cameraSeedId, "garden-open");
  assert.equal(frame.currentCard.id, "card:garden-open");
  assert.equal(frame.currentCard.ref, "hapa://card/garden-open");
  assert.equal(frame.transition.kind, "crossfade");
  assert.equal(frame.transition.opacity, 1);
  assert.equal(frame.visualizers.length, 2);
  assert.deepEqual(frame.visualizers.map((row) => row.sourceId), [
    "shader:aurora",
    "shader:ultimate-flame",
  ]);
  assert.equal(frame.visualizers[1].persistent, true);
  assert.equal(frame.visualizers[1].persistentSlotId, "always-on-1");
  assert.equal(frame.visualizers[1].composition.opacity, 0.85);
  assert.equal(frame.camera.motion, "slow-push");
  assert.equal(frame.camera.intensity, 0.7);
  assert.equal(frame.camera.speed, null, "an omitted speed stays unset so every renderer uses the shared deterministic fallback");
  assert.equal(frame.camera.sourceCueIndex, 0);
  assert.deepEqual(frame.camera.keyframe.crop, {
    x: 0.06166665,
    y: 0.06166665,
    width: 0.8766667,
    height: 0.8766667,
  });
  assert.equal(frame.lyrics.line.id, "line-one");
  assert.equal(frame.lyrics.templateFrame.templateId, "kinetic-word-burst-v1");
  assert.equal(frame.lyrics.templateFrame.words[1].active, true);
  assert.deepEqual(frame.automation.visualTime.map((row) => row.id), ["visual-time:one"]);
  assert.deepEqual(frame.automation.accents.map((row) => row.id), ["accent:one"]);
  assert.deepEqual(frame.automation.effects.map((row) => row.id), ["effect:one"]);
});

test("fixed-time Preview parity preserves layered media bounds, camera, changing and Always-On shaders, lyrics, transitions, and automation", () => {
  const source = paritySource();
  source.project.timeline[0].media_contract = {
    type: "video",
    runtimeUri: "/media/garden-open.mp4",
    sourceHash: "sha256:garden-open-bounded",
    sourceInSeconds: 4,
    sourceOutSeconds: 5.5,
    playbackMode: "loop",
    dimensions: { width: 720, height: 1280, maxDimension: 1280 },
  };
  source.showGraph.tracks.push(
    {
      id: "media-overlay",
      label: "Media overlay",
      role: "media",
      cards: [{
        id: "cue:garden-overlay",
        trackId: "media-overlay",
        startSeconds: 1,
        endSeconds: 2,
        sourceCueIndex: 0,
        media: {
          id: "garden-overlay",
          title: "Garden Light Overlay",
          localPath: "/media/garden-overlay.mp4",
          sourceHash: "sha256:garden-overlay",
          sourceInSeconds: 8,
          sourceOutSeconds: 9,
          playbackMode: "once",
          dimensions: { width: 1920, height: 1080, maxDimension: 1920 },
          cardId: "card:garden-overlay",
          cardKind: "scene-card",
          cardRef: "hapa://card/garden-overlay",
          cardTitle: "Garden Light Overlay",
        },
        parameters: {
          layerIndex: 3,
          opacity: 0.72,
          blendMode: "screen",
          motion: "slow-push",
          cameraIntensity: 0.7,
        },
        transition: "fade-in",
      }],
    },
    {
      id: "always-on-simple-waveform",
      label: "Always On 2 · Simple Waveform",
      role: "visualizer",
      persistent: true,
      alwaysOn: true,
      slotId: "always-on-2",
      cards: [{
        id: "shader:simple-waveform",
        trackId: "always-on-simple-waveform",
        startSeconds: 0,
        endSeconds: 6,
        alwaysOn: true,
        persistentSlotId: "always-on-2",
        visualization: {
          sourceId: "shader:simple-waveform",
          nativeKey: "Simple Waveform",
          status: "exact-browser-isf",
          sourceHash: "sha256:simple-waveform",
        },
        parameters: {
          opacity: 0.55,
          blendMode: "screen",
          stemMap: ["lead-vocals"],
        },
      }],
    },
  );

  const fixedTimeSeconds = 1.26;
  const frame = projectEchoDirectorPreviewFrame({ source, timeSeconds: fixedTimeSeconds });
  const repeated = projectEchoDirectorPreviewFrame({ source, timeSeconds: fixedTimeSeconds });

  assert.deepEqual(frame, repeated, "one source plus one fixed time must yield one complete parity frame");
  assert.equal(frame.clock.frame, 37);
  assert.equal(frame.media.layerCount, 2);
  assert.deepEqual(frame.media.layers.map((cue) => cue.id), [
    "cue:garden-open",
    "cue:garden-overlay",
  ]);
  assert.deepEqual(frame.media.layers[0].media, {
    id: "garden-open",
    title: "Garden Opens",
    uri: "/media/garden-open.mp4",
    kind: "video",
    sourceHash: "sha256:garden-open-bounded",
    sourceInSeconds: 4,
    sourceOutSeconds: 5.5,
    sourceDurationSeconds: 1.5,
    playbackMode: "loop",
    dimensions: { width: 720, height: 1280, maxDimension: 1280 },
    aspectRatio: 0.5625,
    sourceAspectRatio: 0.5625,
    sourceOrientation: "portrait",
  });
  assert.deepEqual(frame.primaryMediaCue.media, {
    id: "garden-overlay",
    title: "Garden Light Overlay",
    uri: "/media/garden-overlay.mp4",
    kind: "video",
    sourceHash: "sha256:garden-overlay",
    sourceInSeconds: 8,
    sourceOutSeconds: 9,
    sourceDurationSeconds: 1,
    playbackMode: "once",
    dimensions: { width: 1920, height: 1080, maxDimension: 1920 },
    aspectRatio: 1.777778,
    sourceAspectRatio: 1.777778,
    sourceOrientation: "landscape",
  });
  assert.equal(frame.currentCard.id, "card:garden-overlay");
  assert.equal(frame.camera.motion, "slow-push");
  assert.equal(frame.camera.sourceCueIndex, 0);
  assert.equal(frame.transition.kind, "fade-in");
  assert.equal(frame.transition.phase, "entering");
  assert.equal(frame.transition.opacity, 0.466666);
  assert.deepEqual(frame.shaders, frame.visualizers);
  assert.deepEqual(frame.visualizers.map((row) => row.sourceId), [
    "shader:aurora",
    "shader:ultimate-flame",
    "shader:simple-waveform",
  ]);
  assert.deepEqual(frame.visualizers.filter((row) => row.persistent).map((row) => row.persistentSlotId), [
    "always-on-1",
    "always-on-2",
  ]);
  assert.equal(frame.visualizers[2].stemMap[0], "lead-vocals");
  assert.equal(frame.lyrics.line.id, "line-one");
  assert.equal(frame.lyrics.templateFrame.templateId, "kinetic-word-burst-v1");
  assert.equal(frame.lyrics.templateFrame.words[1].active, true);
  assert.deepEqual(frame.automation.visualTime.map((row) => row.id), ["visual-time:one"]);
  assert.deepEqual(frame.automation.accents.map((row) => row.id), ["accent:one"]);
  assert.deepEqual(frame.automation.effects.map((row) => row.id), ["effect:one"]);
});

test("Preview projects an explicit full-source authored-transition time map without changing ordinary cues", () => {
  const source = paritySource();
  source.project.timeline[0].end_sec = 2;
  source.project.timeline[0].media_contract = {
    type: "video",
    runtimeUri: "/media/garden-open.mp4",
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    playbackMode: "once",
    timeMapping: {
      schemaVersion: "hapa.echo.transition-time-map.v1",
      mode: "fit-source-once-to-cue",
      sourceInSeconds: 0,
      sourceOutSeconds: 5,
      sourceDurationSeconds: 5,
      cueDurationSeconds: 2,
      cueSampleSpanSeconds: 2 - (1 / 30),
      outputFps: 30,
      playbackRate: 5 / (2 - (1 / 30)),
      valid: true,
      reachesDeclaredLastFrame: true,
    },
  };
  source.showGraph.tracks[0].cards[0].endSeconds = 2;

  const frame = projectEchoDirectorPreviewFrame({ source, timeSeconds: 1 });
  assert.equal(frame.primaryMediaCue.media.playbackMode, "once");
  assert.deepEqual(frame.primaryMediaCue.media.timeMapping, {
    schemaVersion: "hapa.echo.transition-time-map.v1",
    mode: "fit-source-once-to-cue",
    sourceInSeconds: 0,
    sourceOutSeconds: 5,
    sourceDurationSeconds: 5,
    cueDurationSeconds: 2,
    cueSampleSpanSeconds: 2 - (1 / 30),
    outputFps: 30,
    playbackRate: 5 / (2 - (1 / 30)),
    valid: true,
    reachesDeclaredLastFrame: true,
  });
  const ordinaryFrame = projectEchoDirectorPreviewFrame({ source, timeSeconds: 3.25 });
  assert.equal(ordinaryFrame.primaryMediaCue.media.timeMapping, undefined);
});

test("Preview preserves a certified static portrait crop at unity scale for the full cue", () => {
  const source = paritySource();
  const crop = { x: 0, y: 0.341796875, width: 1, height: 0.31640625 };
  Object.assign(source.project.timeline[0], {
    camera_motion: "static",
    camera_intensity: 0,
    camera_speed: 1,
    camera_focus: "center",
    media_contract: {
      type: "image",
      playbackMode: "hold",
      runtimeUri: "/reference-frames/moon-door-a.png",
      dimensions: { width: 720, height: 1280, maxDimension: 1280 },
    },
  });
  const card = source.showGraph.tracks[0].cards[0];
  card.media = {
    ...card.media,
    dimensions: { width: 720, height: 1280, maxDimension: 1280 },
    mediaContract: structuredClone(source.project.timeline[0].media_contract),
  };
  card.parameters = { ...card.parameters, motion: "static", cameraIntensity: 0, cameraSpeed: 1, cameraFocus: "center" };
  card.cameraKeyframes = [
    { atSeconds: 0, cameraPathId: "certified:path", mediaCardId: card.id, mediaId: card.media.id, crop, motion: "static", intensity: 0, speed: 1, focus: "center" },
    { atSeconds: 3, cameraPathId: "certified:path", mediaCardId: card.id, mediaId: card.media.id, crop, motion: "static", intensity: 0, speed: 1, focus: "center" },
  ];
  source.showGraph.directorV2.cameraKeyframes = structuredClone(card.cameraKeyframes);

  for (const timeSeconds of [0, 1.5, 2.9]) {
    const frame = projectEchoDirectorPreviewFrame({ source, timeSeconds });
    assert.deepEqual(frame.primaryMediaCue.camera.crop, crop);
    assert.deepEqual(frame.camera.motionPresentation.crop, crop);
    assert.equal(frame.camera.motionPresentation.scale, 1);
    assert.equal(frame.camera.motionPresentation.translateXPercent, 0);
    assert.equal(frame.camera.motionPresentation.translateYPercent, 0);
  }
});

test("Echo Album and Record Garden both consume the shared fixed-time Preview contract", () => {
  const albumSource = readFileSync(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");
  const gardenSource = readFileSync(new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url), "utf8");

  assert.match(albumSource, /selectEchoDirectorPreviewSource\(activeProject,/);
  assert.match(albumSource, /projectEchoDirectorPreviewFrame\(\{/);
  assert.match(albumSource, /directorPreviewFrame\.visualizers\.map/);
  assert.match(albumSource, /directorPreviewFrame\?\.lyrics\?\.templateFrame/);
  assert.match(albumSource, /data-echo-preview-automation=/);
  assert.match(gardenSource, /createEchoDirectorPreviewRuntime\(\{/);
  assert.match(gardenSource, /strictParity: true/);
  assert.match(gardenSource, /cue\.media\?\.sourceOutSeconds/);
  assert.match(gardenSource, /cue\.media\?\.playbackMode === "loop"/);
});

test("camera projection preserves current timeline motion, intensity, speed, and deterministic cue index", () => {
  const source = paritySource();
  Object.assign(source.project.timeline[0], {
    camera_motion: "pan-up-right",
    camera_intensity: 1.4,
    camera_speed: 1.85,
  });
  Object.assign(source.showGraph.tracks[0].cards[0].parameters, {
    motion: "stale-card-motion",
    cameraIntensity: 0.2,
    cameraSpeed: 0.4,
  });

  const frame = projectEchoDirectorPreviewFrame({ source, timeSeconds: 1.25 });

  assert.equal(frame.camera.motion, "pan-up-right");
  assert.equal(frame.camera.intensity, 1.4);
  assert.equal(frame.camera.speed, 1.85);
  assert.equal(frame.camera.sourceCueIndex, 0);
  assert.deepEqual(frame.primaryMediaCue.camera, {
    motion: "pan-up-right",
    intensity: 1.4,
    speed: 1.85,
  });
});

test("fixed-time frames preserve portrait source geometry separately from horizontal output framing", () => {
  const source = paritySource();
  source.showGraph.directorV2.cameraKeyframes = [];
  Object.assign(source.project.timeline[0], {
    camera_motion: "pan-down",
    camera_intensity: 1.1,
    camera_speed: 1.8,
    media_contract: {
      type: "video",
      runtimeUri: "/media/garden-open.mp4",
      dimensions: { width: 720, height: 1280, maxDimension: 1280 },
    },
  });

  const frames = [0, 1.5, 2.9].map((timeSeconds) => (
    projectEchoDirectorPreviewFrame({ source, timeSeconds })
  ));
  const middle = frames[1];
  assert.deepEqual(middle.primaryMediaCue.media.dimensions, {
    width: 720,
    height: 1280,
    maxDimension: 1280,
  });
  assert.equal(middle.primaryMediaCue.media.aspectRatio, 0.5625);
  assert.equal(middle.primaryMediaCue.media.sourceOrientation, "portrait");
  assert.equal(middle.outputProfile.width, 1920);
  assert.equal(middle.outputProfile.height, 1080);
  assert.equal(middle.camera.motion, "pan-down");
  assert.equal(middle.camera.intensity, 1.1);
  assert.equal(middle.camera.speed, 1.8);
  assert.equal(middle.camera.motionPresentation.isPortrait, true);

  const sharedPresentation = resolveEchoDirectorPreviewCameraPresentation({ frame: middle });
  assert.deepEqual(sharedPresentation.presentation, middle.camera.motionPresentation);
  assert.equal(sharedPresentation.sourceGeometry.source, "preview-contract");
  assert.equal(sharedPresentation.sourceGeometry.sourceOrientation, "portrait");
  assert.deepEqual(sharedPresentation.outputDimensions, {
    width: 1920,
    height: 1080,
    maxDimension: 1920,
  });

  const rects = frames.map((frame) => resolveEchoDirectorPreviewSourceRect({ frame }));
  assert.ok(rects[0].y < rects[1].y && rects[1].y < rects[2].y, "pan-down must reveal progressively lower portrait source rows");
  for (const rect of rects) {
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.width <= 720.000001);
    assert.ok(rect.y + rect.height <= 1280.000001);
    assert.equal(rect.presentation.isPortrait, true);
  }

  const expectedCssRect = cssPreviewVisibleSourceRect({
    sourceWidth: 720,
    sourceHeight: 1280,
    outputWidth: 1920,
    outputHeight: 1080,
    presentation: middle.camera.motionPresentation,
  });
  const actualCanvasRect = rects[1];
  for (const key of ["x", "y", "width", "height"]) {
    assert.ok(Math.abs(actualCanvasRect[key] - expectedCssRect[key]) < 0.00001, `${key} must match the CSS Preview sample`);
  }

  const proxyRect = resolveEchoDirectorPreviewSourceRect({
    frame: middle,
    sourceWidth: 360,
    sourceHeight: 640,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.deepEqual(proxyRect.sourceGeometry.dimensions, { width: 720, height: 1280, maxDimension: 1280 });
  assert.deepEqual(proxyRect.samplingDimensions, { width: 360, height: 640, maxDimension: 640 });
  assert.equal(proxyRect.samplingSource, "decoded-media");
  assert.equal(proxyRect.presentation.isPortrait, true);
  assert.ok(proxyRect.x + proxyRect.width <= 360.000001);
  assert.ok(proxyRect.y + proxyRect.height <= 640.000001);
});

test("decoded media dimensions recover portrait framing when an older Preview contract has no geometry", () => {
  const frame = projectEchoDirectorPreviewFrame({ source: paritySource(), timeSeconds: 1 });
  assert.equal(frame.primaryMediaCue.media.dimensions, null);
  assert.equal(frame.primaryMediaCue.media.sourceOrientation, "unknown");

  const recovered = resolveEchoDirectorPreviewSourceGeometry({
    frame,
    sourceWidth: 720,
    sourceHeight: 1280,
  });
  assert.deepEqual(recovered.dimensions, { width: 720, height: 1280, maxDimension: 1280 });
  assert.equal(recovered.sourceOrientation, "portrait");
  assert.equal(recovered.source, "decoded-media");

  const rect = resolveEchoDirectorPreviewSourceRect({
    frame,
    sourceWidth: 720,
    sourceHeight: 1280,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.equal(rect.presentation.isPortrait, true);
  assert.equal(rect.sourceGeometry.source, "decoded-media");
  assert.deepEqual(rect.outputDimensions, { width: 1920, height: 1080, maxDimension: 1920 });

  const unavailable = resolveEchoDirectorPreviewSourceGeometry({ frame });
  assert.equal(unavailable.dimensions, null);
  assert.equal(unavailable.sourceOrientation, "unknown");
  assert.equal(unavailable.source, "unavailable");
});

test("reordered graph cards match timeline camera and dimensions by active media identity", () => {
  const source = paritySource();
  Object.assign(source.project.timeline[0], {
    camera_motion: "static",
    camera_intensity: 0,
    camera_speed: 1,
    media_contract: { dimensions: { width: 1920, height: 1080 } },
  });
  Object.assign(source.project.timeline[1], {
    camera_motion: "pan-up",
    camera_intensity: 1.6,
    camera_speed: 2.2,
    camera: { crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 } },
    media_contract: { dimensions: { width: 720, height: 1280 } },
  });
  const mediaCards = source.showGraph.tracks[0].cards;
  mediaCards.reverse();
  mediaCards[0].sourceCueIndex = 0;

  const frame = projectEchoDirectorPreviewFrame({ source, timeSeconds: 3.5 });
  assert.equal(frame.primaryMediaCue.media.id, "tea-table");
  assert.equal(frame.primaryMediaCue.sourceCueIndex, 1);
  assert.equal(frame.primaryMediaCue.timelineMatchBasis, "active-media-identity");
  assert.deepEqual(frame.primaryMediaCue.media.dimensions, { width: 720, height: 1280, maxDimension: 1280 });
  assert.equal(frame.primaryMediaCue.media.sourceOrientation, "portrait");
  assert.deepEqual(frame.primaryMediaCue.camera, {
    motion: "pan-up",
    intensity: 1.6,
    speed: 2.2,
    crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
  });
  assert.equal(frame.camera.sourceCueIndex, 1);
  assert.equal(frame.camera.motionPresentation.isPortrait, true);
  assert.deepEqual(frame.camera.motionPresentation.crop, { x: 0.2, y: 0.1, width: 0.6, height: 0.8 });
});

test("camera projection preserves Director auto motion and fallback speed semantics when metadata is unset", () => {
  const frame = projectEchoDirectorPreviewFrame({ source: paritySource(), timeSeconds: 3.5 });

  assert.equal(frame.primaryMediaCue.id, "cue:tea-table");
  assert.equal(frame.camera.motion, "auto");
  assert.equal(frame.camera.speed, null);
  assert.equal(frame.camera.intensity, 1);
  assert.equal(frame.camera.sourceCueIndex, 1);
  assert.equal(frame.primaryMediaCue.cameraSeedId, "tea-table");
});

test("half-open cue seams select the next Director cue and use stable transition noise", () => {
  const source = paritySource();
  const before = projectEchoDirectorPreviewFrame({ source, timeSeconds: 2.9 });
  const seam = projectEchoDirectorPreviewFrame({ source, timeSeconds: 3 });
  const repeated = projectEchoDirectorPreviewFrame({ source, timeSeconds: 3 });

  assert.equal(before.primaryMediaCue.id, "cue:garden-open");
  assert.equal(seam.primaryMediaCue.id, "cue:tea-table");
  assert.equal(seam.currentCard.id, "card:tea-table");
  assert.equal(seam.transition.kind, "scanline-dissolve");
  assert.equal(seam.transition.opacity, 0);
  assert.equal(seam.transition.deterministicSeed, repeated.transition.deterministicSeed);
});

test("shared transition math preserves Hapa Preview's ordered half-second overlap behavior", () => {
  const state = echoDirectorPreviewMediaTransitionState({
    id: "short-crossfade",
    startSeconds: 0,
    endSeconds: 0.75,
    transition: "crossfade",
  }, 0.4, 30);

  assert.equal(state.windowSeconds, 0.5);
  assert.equal(state.entrance, 0.8);
  assert.equal(state.exit, 0.7);
  assert.equal(state.opacity, 0.8, "the historical entrance branch wins while both windows overlap");
  assert.equal(state.phase, "entering");
});

test("clock projection clamps to duration while retaining the final half-open cue", () => {
  assert.deepEqual(readEchoDirectorPreviewClock({
    clock: { currentTime: 99, duration: 6, ended: true },
    fps: 10,
  }), {
    source: "external-clock",
    rawSeconds: 99,
    seconds: 6,
    selectionSeconds: 5.999999,
    durationSeconds: 6,
    frame: 60,
    fps: 10,
    playing: false,
    ended: true,
  });
  const frame = projectEchoDirectorPreviewFrame({ source: paritySource(), timeSeconds: 99 });
  assert.equal(frame.clock.ended, true);
  assert.equal(frame.primaryMediaCue.id, "cue:tea-table");
});

test("single-canvas runtime renders every parity layer in canonical order from the external clock", async () => {
  const canvas = fakeCanvas();
  const calls = [];
  const clock = { currentTime: 1.26, duration: 6, paused: false, source: "master-audio" };
  const adapters = Object.fromEntries([
    "media",
    "visualizers",
    "transition",
    "automation",
    "lyrics",
  ].map((layer) => [layer, ({ frame }) => {
    calls.push(`${layer}:${frame.clock.frame}`);
    return { layer, frame: frame.clock.frame };
  }]));
  const runtime = createEchoDirectorPreviewRuntime({
    canvas,
    source: paritySource(),
    clock,
    adapters,
  });

  const snapshot = await runtime.render();

  assert.equal(snapshot.schemaVersion, ECHO_DIRECTOR_PREVIEW_RUNTIME_SCHEMA);
  assert.equal(snapshot.status, "rendered-parity-contract");
  assert.deepEqual(calls, [
    "media:37",
    "visualizers:37",
    "transition:37",
    "automation:37",
    "lyrics:37",
  ]);
  assert.equal(canvas.width, 1920);
  assert.equal(canvas.height, 1080);
  assert.equal(canvas.context.clears, 0, "the visible canvas is atomically replaced, never cleared first");
  assert.equal(canvas.context.draws, 1);
  assert.equal(canvas.context.saves, 1);
  assert.equal(canvas.context.restores, 1);
  assert.equal(runtime.inspect().outputCanvasCount, 1);
  assert.equal(runtime.inspect().currentCardId, "card:garden-open");

  clock.currentTime = 3.04;
  await runtime.render();
  assert.equal(runtime.snapshot().frame.currentCard.id, "card:tea-table");
  assert.equal(canvas.context.draws, 2);
});

test("layer-only Director gaps render their active shader and lyrics without invoking a stale media adapter", async () => {
  const source = paritySource();
  source.project.timeline = source.project.timeline.slice(0, 1);
  source.showGraph.tracks[0].cards = source.showGraph.tracks[0].cards.slice(0, 1);
  const gapLyric = {
    id: "line-in-gap",
    start: 4,
    end: 5,
    text: "The garden keeps glowing",
    words: [{ word: "glowing", start: 4, end: 5 }],
  };
  source.project.timed_lyrics.push(gapLyric);
  source.showGraph.song.lyricOverlay.lines.push(gapLyric);

  const canvas = fakeCanvas();
  const calls = [];
  const runtime = createEchoDirectorPreviewRuntime({
    canvas,
    source,
    clock: 4.2,
    adapters: {
      media() {
        throw new Error("a media adapter must not run when no media cue is active");
      },
      visualizers() {
        calls.push("visualizers");
      },
      lyrics() {
        calls.push("lyrics");
      },
    },
  });

  const snapshot = await runtime.render();

  assert.equal(snapshot.status, "rendered-parity-contract");
  assert.equal(snapshot.frame.primaryMediaCue, null);
  assert.deepEqual(calls, ["visualizers", "lyrics"]);
  assert.deepEqual(Object.keys(snapshot.receipts), ["visualizers", "lyrics"]);
  assert.equal(canvas.context.draws, 1, "the composed layer-only frame is published atomically");
});

test("adapter failure preserves the last fully composed output frame", async () => {
  const canvas = fakeCanvas();
  let failTransition = false;
  const runtime = createEchoDirectorPreviewRuntime({
    canvas,
    source: paritySource(),
    clock: 1.2,
    adapters: {
      media() {},
      visualizers() {},
      transition() {
        if (failTransition) throw new Error("transition decoder failed");
      },
      automation() {},
      lyrics() {},
    },
  });

  const valid = await runtime.render();
  assert.equal(canvas.context.draws, 1);
  failTransition = true;

  await assert.rejects(runtime.render(), /transition decoder failed/);
  assert.equal(canvas.context.draws, 1, "failed staging work is never published over the valid output");
  assert.equal(canvas.context.clears, 0);
  assert.deepEqual(runtime.snapshot(), valid, "the last successful receipt remains authoritative");
});

test("strict runtime fails visibly before clearing when a parity renderer is missing", async () => {
  const canvas = fakeCanvas();
  const runtime = createEchoDirectorPreviewRuntime({
    canvas,
    source: paritySource(),
    clock: 1.2,
    adapters: { media() {} },
  });

  await assert.rejects(
    runtime.render(),
    (error) => {
      assert.equal(error.code, "echo_director_preview_renderer_incomplete");
      assert.deepEqual(error.details.missingLayers, ["visualizers", "transition", "automation", "lyrics"]);
      return true;
    },
  );
  assert.equal(canvas.context.clears, 0, "an incomplete renderer must retain the last honest frame");
});

test("runtime owns one idempotent animation loop and cancels it on stop", async () => {
  const canvas = fakeCanvas();
  const queued = [];
  const cancelled = [];
  const adapters = {
    media() {},
    visualizers() {},
    transition() {},
    automation() {},
    lyrics() {},
  };
  const runtime = createEchoDirectorPreviewRuntime({
    canvas,
    source: paritySource(),
    clock: 1.2,
    adapters,
    requestFrame(callback) {
      queued.push(callback);
      return queued.length;
    },
    cancelFrame(handle) {
      cancelled.push(handle);
    },
  });

  assert.equal(runtime.start(), true);
  assert.equal(runtime.start(), false);
  assert.equal(queued.length, 1);
  await queued[0]();
  assert.equal(queued.length, 2);
  assert.equal(runtime.stop(), true);
  assert.deepEqual(cancelled, [2]);
  assert.equal(runtime.inspect().running, false);
  const { dispose } = runtime;
  assert.equal(dispose(), true, "runtime lifecycle methods do not depend on a bound this value");
});

test("animation-loop renderer failures stop once and surface a bounded diagnostic", async () => {
  const canvas = fakeCanvas();
  const queued = [];
  const reported = [];
  const runtime = createEchoDirectorPreviewRuntime({
    canvas,
    source: paritySource(),
    clock: 1.2,
    adapters: { media() {} },
    requestFrame(callback) {
      queued.push(callback);
      return queued.length;
    },
    cancelFrame() {},
    onError(error, diagnostic) {
      reported.push({ error, diagnostic });
    },
  });

  runtime.start();
  await queued[0]();

  assert.equal(queued.length, 1, "a failed frame must not create a runaway render loop");
  assert.equal(runtime.inspect().running, false);
  assert.equal(runtime.inspect().lastError.code, "echo_director_preview_renderer_incomplete");
  assert.equal(reported.length, 1);
  assert.equal(reported[0].error.code, "echo_director_preview_renderer_incomplete");
});

test("exact Card print intent and resolver preserve the current cue attachment identity or fail closed", async () => {
  const frame = projectEchoDirectorPreviewFrame({ source: paritySource(), timeSeconds: 1.2 });
  const intent = createEchoDirectorPreviewCardPrintIntent(frame, { surface: "record-garden-screen-left" });

  assert.equal(intent.schemaVersion, ECHO_DIRECTOR_PREVIEW_CARD_PRINT_INTENT_SCHEMA);
  assert.equal(intent.resolutionPolicy, "exact-id-or-fail");
  assert.equal(intent.song.id, "lazy-sunday");
  assert.equal(intent.cut.id, "director-cut-newest");
  assert.equal(intent.cue.id, "cue:garden-open");
  assert.equal(intent.card.id, "card:garden-open");
  assert.equal(intent.surface, "record-garden-screen-left");

  const receipt = await resolveEchoDirectorPreviewCardPrintIntent(intent, {
    resolveExactCard: async ({ cardId }) => ({
      card: { id: cardId, title: "Garden Opens", cardType: "scene-card" },
      receipt: { source: "tarot-library" },
    }),
  });
  assert.equal(receipt.schemaVersion, ECHO_DIRECTOR_PREVIEW_CARD_PRINT_RECEIPT_SCHEMA);
  assert.equal(receipt.status, "resolved-exact-attached-card");
  assert.equal(receipt.card.id, "card:garden-open");
  assert.equal(receipt.source.cueId, "cue:garden-open");

  await assert.rejects(
    resolveEchoDirectorPreviewCardPrintIntent(intent, {
      resolveExactCard: async () => ({ id: "card:wrong" }),
    }),
    { code: "echo_director_preview_card_identity_mismatch" },
  );

  const missing = structuredClone(frame);
  missing.primaryMediaCue.card.id = null;
  assert.throws(
    () => createEchoDirectorPreviewCardPrintIntent(missing),
    { code: "echo_director_preview_card_attachment_missing" },
  );
});
