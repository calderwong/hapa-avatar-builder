import test from "node:test";
import assert from "node:assert/strict";

import {
  ECHO_RECORD_GARDEN_SCHEMA,
  ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
  ECHO_RECORD_LOCAL_CARD_SCHEMA,
  ECHO_RECORD_RPM,
  ECHO_RECORD_VISUAL_SURFACE_SCHEMA,
  buildEchoRecordVisualSurfaces,
  buildLocalEchoRecordCardProjection,
  echoRecordPerspectiveToken,
  echoRecordVinylSpinRadians,
  inferEchoRecordMediaKind,
  normalizeEchoRecordProject,
  normalizeEchoRecordGardenSnapshot,
  normalizeEchoRecordSummaryRows,
  resolveEchoRecordMediaUri,
  selectEchoRecordDirectorShots,
  unwrapEchoDirectorProject,
} from "../src/domain/echo-record-garden.js";

function project(overrides = {}) {
  return {
    song_id: "echo-song-one",
    song_title: "Sunday Signals",
    audio_id: "audio-one",
    audio_uri: "/api/song-registry/audio/audio-one",
    cover_uri: "/media/sunday-signals.png",
    registry_track_id: "registry-one",
    perspective: "green",
    avatar_name: "Green",
    duration: 12,
    timeline: [
      {
        shot_index: 0,
        start_sec: 0,
        end_sec: 4,
        media_id: "shot-one",
        media_title: "Garden opens",
        media_uri: "/media/original-one.mp4",
        runtime_media_uri: "/media/runtime-one.mp4",
        media_thumbnail: "/media/one.jpg",
        decision_evidence: { truthStatus: "verified" },
      },
      {
        shot_index: 1,
        start_sec: 5,
        end_sec: 9,
        media_id: "shot-two",
        media_title: "Needle settles",
        media_contract: {
          type: "video",
          runtimeUri: "/media/runtime-two.mp4",
          posterUri: "/media/two.jpg",
          contentHash: "sha256:two",
        },
        decision_evidence: { truthStatus: "inferred" },
      },
      {
        shot_index: 2,
        start_sec: 9,
        end_sec: 12,
        media_id: "shot-three",
        media_title: "Sunset chorus",
        media_uri: "/media/three.png",
        decision_evidence: { truthStatus: "generated_placeholder" },
      },
    ],
    provenance: {
      status: "generated_placeholder",
      source: "fixture-director",
      runId: "fixture-run",
    },
    updated_at: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

test("director detail payloads unwrap without inventing a project", () => {
  const source = project();
  assert.equal(unwrapEchoDirectorProject({ project: { music_video_project: source } }), source);
  assert.equal(unwrapEchoDirectorProject({ detail: { music_video_project: source } }), source);
  assert.equal(unwrapEchoDirectorProject({ music_video_project: {} }), null);
  assert.equal(unwrapEchoDirectorProject([]), null);
});

test("summary rows become deduplicated truth-labelled record models", () => {
  const summary = {
    music_video_project: {
      song_id: "echo-song-one",
      song_title: "Sunday Signals",
      perspective: "green",
      avatar_name: "Green",
      audio_id: "audio-one",
      duration: 12,
      timeline_count: 3,
      provenance: { status: "generated_placeholder", source: "summary-index" },
    },
  };
  const hydrated = { music_video_project: project() };
  const rows = normalizeEchoRecordSummaryRows([
    summary,
    { music_video_project: { song_title: "Invalid without an ID" } },
    hydrated,
    { music_video_project: { song_id: "echo-song-two", song_title: "Second", perspective: "blue" } },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].schemaVersion, ECHO_RECORD_GARDEN_SCHEMA);
  assert.equal(rows[0].id, "echo-record:echo-song-one");
  assert.equal(rows[0].director.detailHydrated, true, "the truthful detailed duplicate should win");
  assert.equal(rows[0].director.timelineCount, 3);
  assert.equal(rows[0].truth.status, "generated-placeholder");
  assert.equal(rows[0].truth.canonClaimed, false);
  assert.equal(rows[0].provenance.source, "fixture-director");
  assert.equal(rows[0].audio.availability, "routable");
  assert.equal(rows[1].cover.availability, "missing");
});

test("perspective tokens and media helpers are deterministic and safe", () => {
  const green = echoRecordPerspectiveToken({ perspective: "Green" });
  const unknownA = echoRecordPerspectiveToken("Sunday lavender");
  const unknownB = echoRecordPerspectiveToken("Sunday lavender");

  assert.equal(green.accentKey, "green");
  assert.deepEqual(unknownA, unknownB);
  assert.match(unknownA.accentHex, /^#[a-f0-9]{6}$/i);
  assert.equal(resolveEchoRecordMediaUri("media/clip.mp4"), "/media/clip.mp4");
  assert.equal(resolveEchoRecordMediaUri("/media/clip.mp4", "http://127.0.0.1:8787"), "http://127.0.0.1:8787/media/clip.mp4");
  assert.match(
    resolveEchoRecordMediaUri("file:///Users/example/clip.mp4", "http://127.0.0.1:8787"),
    /^http:\/\/127\.0\.0\.1:8787\/api\/local-file\?path=/,
  );
  assert.equal(resolveEchoRecordMediaUri("javascript:alert(1)"), "");
  assert.equal(resolveEchoRecordMediaUri("data:text/html,no"), "");
  assert.equal(inferEchoRecordMediaKind("/media/clip.MP4?x=1"), "video");
  assert.equal(inferEchoRecordMediaKind("/media/frame.webp"), "image");
});

test("director shot selection is clock-bound, gap-honest, and wrap-aware", () => {
  const playing = selectEchoRecordDirectorShots(project(), 2);
  assert.equal(playing.current.id, "shot-one");
  assert.equal(playing.current.media.uri, "/media/runtime-one.mp4");
  assert.equal(playing.current.truth.status, "verified");
  assert.equal(playing.next.id, "shot-two");

  const gap = selectEchoRecordDirectorShots(project(), 4.5);
  assert.equal(gap.current, null, "a timeline gap must not be filled with a made-up current shot");
  assert.equal(gap.next.id, "shot-two");
  assert.equal(gap.truth.currentIsTimelineBound, false);

  const wrapped = selectEchoRecordDirectorShots(project(), 13);
  assert.equal(wrapped.clockSeconds, 1);
  assert.equal(wrapped.current.id, "shot-one");
  assert.equal(wrapped.truth.clockWrapped, true);
});

test("visual surfaces combine timeline, references, character, and matching scenes within a hard bound", () => {
  const referenceCards = {
    cards: [
      {
        id: "tarot-reference:one",
        referenceCardId: "reference:one",
        title: "Porch-light memory",
        videoUri: "/media/reference-one.mp4",
        imageUri: "/media/reference-one.jpg",
        occurrences: [{ songId: "echo-song-one" }],
        authority: { reviewStatus: "pending-review", evidenceClass: "candidate" },
      },
      {
        id: "tarot-reference:other-song",
        title: "Wrong song",
        imageUri: "/media/wrong-song.jpg",
        occurrences: [{ songId: "echo-song-other" }],
      },
      {
        id: "tarot-reference:caller-scoped",
        title: "Caller-scoped reference",
        imageUri: "/media/caller-scoped.jpg",
      },
    ],
  };
  const avatars = [{
    id: "green-avatar",
    primaryName: "Green",
    assets: [{
      id: "green-portrait",
      name: "Character portrait",
      type: "image",
      uri: "/media/green.png",
      requirementId: "character_dossier",
      processing: { attachedToCard: true },
    }],
  }];
  const sceneGraph = {
    scenes: [
      {
        id: "scene-green-porch",
        title: "Green on the porch",
        summary: "A warm afternoon.",
        canonStatus: "scaffold",
        avatarTags: [{ avatarId: "green-avatar" }],
        assets: [{ id: "scene-green-video", type: "video", uri: "/media/green-porch.mp4" }],
      },
      {
        id: "scene-other",
        title: "Unrelated",
        avatarTags: [{ avatarId: "red-avatar" }],
        assets: [{ id: "other", type: "image", uri: "/media/other.jpg" }],
      },
    ],
  };
  const surfaces = buildEchoRecordVisualSurfaces({
    project: { music_video_project: project() },
    referenceCards,
    avatars,
    sceneGraph,
    clockSeconds: 2,
    limit: 6,
  });

  assert.equal(surfaces.length, 6);
  assert.ok(surfaces.every((surface) => surface.schemaVersion === ECHO_RECORD_VISUAL_SURFACE_SCHEMA));
  assert.deepEqual(
    surfaces.map((surface) => surface.role),
    ["now-playing", "up-next", "character", "reference", "scene", "reference"],
  );
  assert.equal(surfaces.some((surface) => surface.title === "Wrong song"), false);
  assert.equal(surfaces.find((surface) => surface.role === "character").truth.status, "inferred");
  assert.equal(surfaces.find((surface) => surface.role === "scene").truth.status, "generated-placeholder");
  assert.equal(buildEchoRecordVisualSurfaces({ project: project(), limit: 99 }).length, 2);
});

test("vinyl rotation is locked to the media clock at 33⅓ RPM", () => {
  assert.equal(ECHO_RECORD_RPM, 100 / 3);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(1) - (10 * Math.PI / 9)) < 1e-12);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(3, { normalize: false }) - (10 * Math.PI / 3)) < 1e-12);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(18)) < 1e-12);
  assert.equal(echoRecordVinylSpinRadians(0, { phaseRadians: 0.25 }), 0.25);
});

test("scene snapshots migrate bounded state and reject malformed camera values", () => {
  const snapshot = normalizeEchoRecordGardenSnapshot({
    lastSongId: "echo-song-one",
    placedSongId: "echo-song-one",
    selectedVisualId: "echo-surface:one",
    perspective: "GREEN",
    muted: false,
    playbackSeconds: 22.4,
    scene: {
      camera: {
        position: [1, 4.5, 8],
        target: { x: 0, y: 0.7, z: 0 },
      },
    },
  });
  assert.equal(snapshot.schemaVersion, ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.selectedSongId, "echo-song-one");
  assert.equal(snapshot.placedSongId, "echo-song-one");
  assert.equal(snapshot.perspective, "green");
  assert.equal(snapshot.muted, false);
  assert.equal(snapshot.playbackSeconds, 22.4);
  assert.deepEqual(snapshot.camera.position, [1, 4.5, 8]);
  assert.deepEqual(snapshot.camera.target, [0, 0.7, 0]);

  const malformed = normalizeEchoRecordGardenSnapshot({
    perspective: "invented",
    playbackSeconds: -90,
    scene: {
      camera: {
        position: ["no", Infinity, null],
        target: [0, 1],
      },
    },
  });
  assert.equal(malformed.perspective, "all");
  assert.equal(malformed.playbackSeconds, 0);
  assert.equal(malformed.camera.position, null);
  assert.equal(malformed.camera.target, null);
});

test("clicked visuals produce deterministic local projections without persistence or mint claims", () => {
  const [visual] = buildEchoRecordVisualSurfaces({
    project: project(),
    clockSeconds: 2,
    limit: 1,
  });
  const first = buildLocalEchoRecordCardProjection({ visual, project: project(), clockSeconds: 2 });
  const second = buildLocalEchoRecordCardProjection({ visual, project: project(), clockSeconds: 8 });

  assert.equal(first.schemaVersion, ECHO_RECORD_LOCAL_CARD_SCHEMA);
  assert.equal(first.id, second.id);
  assert.equal(first.status, "local-preview");
  assert.equal(first.persistence.status, "not-persisted");
  assert.equal(first.persistence.minted, false);
  assert.equal(first.persistence.edition, null);
  assert.equal(first.authority.canonPromotion, false);
  assert.equal(first.lineage.sourceProjectProvenance.source, "fixture-director");
  assert.equal(first.playback.clockSeconds, 2);
  assert.equal(Object.hasOwn(first, "mintedAt"), false);
  assert.match(first.persistence.message, /No Card was persisted or minted/);
});

test("project normalization rejects invalid input and preserves source truth", () => {
  assert.equal(normalizeEchoRecordProject({ nope: true }), null);
  const record = normalizeEchoRecordProject({ project: project({ perspective: "blue" }) });
  assert.equal(record.perspective.accentKey, "blue");
  assert.equal(record.truth.sourceStatus, "generated_placeholder");
  assert.equal(record.provenance.runId, "fixture-run");
});
