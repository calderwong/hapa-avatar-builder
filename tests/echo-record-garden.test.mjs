import test from "node:test";
import assert from "node:assert/strict";

import {
  ECHO_RECORD_GARDEN_SCHEMA,
  ECHO_RECORD_GARDEN_LEGACY_SNAPSHOT_SCHEMA,
  ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
  ECHO_RECORD_LOCAL_CARD_SCHEMA,
  ECHO_RECORD_DISPLAY_RPM,
  ECHO_RECORD_RPM,
  ECHO_RECORD_VISUAL_SURFACE_SCHEMA,
  buildEchoRecordDirectorWarmSurfaces,
  buildEchoRecordVisualSurfaces,
  buildLocalEchoRecordCardProjection,
  echoRecordPerspectiveToken,
  echoRecordVideoPlaybackPlan,
  echoRecordVinylSpinRadians,
  inferEchoRecordMediaKind,
  isLegacyEchoRecordDirectionVariant,
  normalizeEchoRecordProject,
  normalizeEchoRecordGardenSnapshot,
  normalizeEchoRecordSummaryRows,
  projectEchoRecordSelectedDirectorCut,
  reconcileEchoRecordGardenSnapshot,
  resolveEchoRecordGardenTableDrop,
  resolveEchoRecordMediaUri,
  selectEchoRecordMediaWindow,
  selectLatestEchoDirectionScriptVariant,
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
        media_card_id: "card-shot-one",
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

test("Record Garden chooses the most recent non-legacy Director cut", () => {
  const variants = [
    {
      id: "legacy-baseline",
      title: "Legacy Baseline",
      createdAt: "2026-07-30T13:00:00.000Z",
      timelineCount: 99,
    },
    {
      id: "recent-balanced",
      title: "Recent Balanced",
      status: "ready",
      createdAt: "2026-07-30T12:00:00.000Z",
      timelineCount: 4,
    },
    {
      id: "recent-rhythmic",
      title: "Recent Rhythmic",
      status: "ready",
      updatedAt: "malformed-source-date",
      createdAt: "2026-07-30T12:00:00.000Z",
      timelineCount: 6,
    },
    {
      id: "newer-failed-cut",
      title: "Newer Failed Cut",
      status: "failed",
      createdAt: "2026-07-30T14:00:00.000Z",
      timelineCount: 20,
    },
    {
      id: "old-cut",
      title: "Old Cut",
      status: "ready",
      createdAt: "2026-07-10T12:00:00.000Z",
      timelineCount: 8,
    },
  ];
  const latest = selectLatestEchoDirectionScriptVariant(project({
    direction_script_variant_summaries: variants,
  }));
  assert.equal(latest.id, "recent-rhythmic");
  assert.equal(latest.strategy, "most-recent-non-legacy");
  assert.equal(latest.selectionBasis, "latest-ready-non-legacy");
  assert.equal(latest.status, "ready");
  assert.equal(latest.readinessDeclared, true);
  assert.equal(latest.tieBreak, "stable-variant-id");
  assert.equal(latest.candidateCount, 3);
  assert.equal(latest.tiedLatestCount, 2);
  assert.equal(latest.legacy, false);

  const record = normalizeEchoRecordProject(project({
    timeline: undefined,
    timeline_count: 3,
    direction_script_variant_summaries: variants,
  }));
  assert.equal(record.director.latestCut.id, "recent-rhythmic");
  assert.equal(record.director.latestCut.timelineCount, 6);
});

test("Record Garden diagnostics classify both Legacy and Baseline cuts as legacy", () => {
  assert.equal(isLegacyEchoRecordDirectionVariant({ id: "legacy-v1", title: "Director Legacy" }), true);
  assert.equal(isLegacyEchoRecordDirectionVariant({ id: "edition-baseline", title: "Baseline Cut" }), true);
  assert.equal(isLegacyEchoRecordDirectionVariant({ id: "recent-balanced", title: "Recent Balanced" }), false);
});

test("the selected recent Director cut becomes the Record Garden playback timeline", () => {
  const base = project({
    selected_direction_script_variant_id: "recent-cut",
    direction_script_variants: [
      {
        id: "legacy-baseline",
        title: "Legacy Baseline",
        createdAt: "2026-07-29T00:00:00.000Z",
        timeline: [{ start_sec: 0, end_sec: 4, media_uri: "/media/legacy.mp4" }],
      },
      {
        id: "recent-cut",
        title: "Most Recent Cut",
        createdAt: "2026-07-30T20:00:00.000Z",
        fingerprint: "sha256:recent",
        timeline: [{ start_sec: 0, end_sec: 4, media_uri: "/media/recent.mp4" }],
      },
    ],
  });
  const selected = projectEchoRecordSelectedDirectorCut({ music_video_project: base });
  assert.equal(selected.timeline[0].media_uri, "/media/recent.mp4");
  assert.equal(selected.echo_record_garden_director_cut.id, "recent-cut");
  assert.equal(selected.echo_record_garden_director_cut.strategy, "most-recent-non-legacy");
  assert.equal(selected.echo_record_garden_director_cut.selectionBasis, "exact-variant-id");
  assert.match(selected.provenance.directorCutFingerprint, /^content-v2:/);
  assert.equal(
    selected.provenance.directorCutFingerprint,
    selected.active_direction_script_variant.fingerprint,
  );
  assert.equal(
    selected.echo_record_garden_director_cut.sourceDeclaredFingerprint,
    "sha256:recent",
  );
  assert.equal(
    selected.provenance.directorCutSourceDeclaredFingerprint,
    "sha256:recent",
  );
  assert.equal(base.timeline[0].media_uri, "/media/original-one.mp4");
});

test("Director cut projection preserves patches, clips to song duration, and fails closed on invalid identity", () => {
  const overlongTimeline = [{
    start_sec: 0,
    end_sec: 20,
    media_uri: "/media/overlong.mp4",
  }];
  const projected = projectEchoRecordSelectedDirectorCut(project({
    selected_direction_script_variant_id: "bounded-cut",
    direction_script_variants: [{
      id: "bounded-cut",
      title: "Bounded Cut",
      createdAt: "2026-07-30T21:00:00.000Z",
      timeline: overlongTimeline,
      project_patch: {
        lyrics_enabled: false,
        lyric_style: "quiet-sunday",
      },
    }],
  }));
  assert.equal(projected.timeline[0].end_sec, 12);
  assert.equal(projected.lyrics_enabled, false);
  assert.equal(projected.lyric_style, "quiet-sunday");
  assert.equal(
    projected.echo_record_garden_director_cut.durationProjection.status,
    "applied",
  );
  assert.equal(overlongTimeline[0].end_sec, 20, "the stored source cut remains immutable");

  assert.throws(
    () => projectEchoRecordSelectedDirectorCut(project({
      selected_direction_script_variant_id: "invalid-cut",
      direction_script_variants: [{
        id: "invalid-cut",
        title: "Invalid Cut",
        createdAt: "2026-07-30T22:00:00.000Z",
        fingerprint: "content-v2:declared-but-wrong",
        timeline: [{ start_sec: 0, end_sec: 4, media_uri: "/media/invalid.mp4" }],
      }],
    })),
    /failed projection validation/,
  );
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
      null,
      "stale-reference-placeholder",
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
    limit: 8,
  });

  assert.equal(surfaces.length, 8);
  assert.ok(surfaces.every((surface) => surface.schemaVersion === ECHO_RECORD_VISUAL_SURFACE_SCHEMA));
  assert.deepEqual(
    surfaces.map((surface) => surface.role),
    [
      "now-playing",
      "now-playing-left",
      "now-playing-right",
      "up-next",
      "character",
      "reference",
      "scene",
      "reference",
    ],
  );
  assert.equal(surfaces.some((surface) => surface.title === "Wrong song"), false);
  assert.equal(surfaces.find((surface) => surface.role === "character").truth.status, "inferred");
  assert.equal(surfaces.find((surface) => surface.role === "scene").truth.status, "generated-placeholder");
  assert.equal(surfaces[0].attachment.cardId, "card-shot-one");
  assert.equal(surfaces[0].attachment.lookupId, "card-shot-one");
  const reference = surfaces.find((surface) => surface.role === "reference");
  assert.equal(reference.attachment.cardId, "tarot-reference:one");
  assert.equal(reference.attachment.card.id, "tarot-reference:one");
  assert.equal(reference.sourceId, "reference:one", "source lineage remains distinct from the attached Tarot Card identity");
  assert.equal(buildEchoRecordVisualSurfaces({ project: project(), limit: 99 }).length, 4);
});

test("Director warming skips unroutable and image shots while preserving clip playback bounds", () => {
  const warmProject = project({
    duration: 28,
    timeline: [
      {
        id: "current-video",
        start_sec: 0,
        end_sec: 4,
        media_uri: "/media/current.mp4",
      },
      {
        id: "uri-less-visualizer",
        start_sec: 4,
        end_sec: 8,
        media_type: "visualizer",
      },
      {
        id: "image-only",
        start_sec: 8,
        end_sec: 12,
        media_uri: "/media/still.jpg",
        media_type: "image",
      },
      {
        id: "video-a",
        start_sec: 12,
        end_sec: 16,
        media_contract: {
          type: "video",
          runtimeUri: "/media/a.mp4",
          sourceInSeconds: 1.5,
          sourceOutSeconds: 3.5,
          playbackMode: "loop",
        },
      },
      {
        id: "video-a-duplicate",
        start_sec: 12,
        end_sec: 16,
        media_contract: {
          type: "video",
          runtimeUri: "/media/a.mp4",
          sourceInSeconds: 1.5,
          sourceOutSeconds: 3.5,
          playbackMode: "loop",
        },
      },
      {
        id: "video-b",
        start_sec: 16,
        end_sec: 20,
        media_uri: "/media/b.webm",
      },
      {
        id: "video-c",
        start_sec: 20,
        end_sec: 24,
        media_uri: "/media/c.mov",
      },
    ],
  });

  const warm = buildEchoRecordDirectorWarmSurfaces({
    project: warmProject,
    clockSeconds: 1,
    count: 3,
  });

  assert.equal(warm.length, 3);
  assert.deepEqual(warm.map((surface) => surface.sourceId), [
    "video-a",
    "video-b",
    "video-c",
  ]);
  assert.ok(warm.every((surface) => surface.role === "buffered-upcoming"));
  assert.ok(warm.every((surface) => surface.media.kind === "video"));
  assert.equal(warm.some((surface) => surface.sourceId === "uri-less-visualizer"), false);
  assert.equal(warm.some((surface) => surface.sourceId === "image-only"), false);
  assert.equal(warm[0].provenance.sourceInSeconds, 1.5);
  assert.equal(warm[0].provenance.sourceOutSeconds, 3.5);
  assert.equal(warm[0].provenance.sourceDurationSeconds, 2);
  assert.equal(warm[0].provenance.playbackMode, "loop");
});

test("visual surfaces hold the prior routable Director frame through a URI-less gap", () => {
  const gapProject = project({
    duration: 16,
    timeline: [
      {
        id: "decoded-prior",
        start_sec: 0,
        end_sec: 4,
        media_uri: "/media/prior.mp4",
      },
      {
        id: "visualizer-gap",
        start_sec: 4,
        end_sec: 10,
        media_type: "visualizer",
      },
      {
        id: "future-video",
        start_sec: 10,
        end_sec: 16,
        media_uri: "/media/future.mp4",
      },
    ],
  });

  const surfaces = buildEchoRecordVisualSurfaces({
    project: gapProject,
    clockSeconds: 6,
    limit: 3,
  });

  assert.equal(surfaces[0].role, "now-playing-hold");
  assert.equal(surfaces[0].sourceId, "decoded-prior");
  assert.equal(surfaces[0].media.uri, "/media/prior.mp4");
  assert.match(surfaces[0].subtitle, /Holding the last decoded Director frame/);
  assert.equal(surfaces[1].role, "up-next");
  assert.equal(surfaces[1].sourceId, "future-video");
});

test("declared generated visualizer cues remain the current Director surface", () => {
  const visualizerProject = project({
    duration: 8,
    timeline: [{
      id: "director-visualizer",
      start_sec: 0,
      end_sec: 8,
      media_title: "Visualizer Only",
      media_contract: {
        type: "generated-visualizer",
        runtimeUri: "",
        playbackMode: "not-applicable",
      },
    }],
  });
  const surfaces = buildEchoRecordVisualSurfaces({
    project: visualizerProject,
    clockSeconds: 3,
    limit: 3,
  });
  assert.deepEqual(
    surfaces.map((surface) => surface.role),
    ["now-playing", "now-playing-left", "now-playing-right"],
  );
  assert.ok(surfaces.every((surface) => surface.media.kind === "generated-visualizer"));
  assert.ok(surfaces.every((surface) => surface.media.availability === "generated"));
  assert.ok(surfaces.every((surface) => surface.sourceId === "director-visualizer"));
});

test("a freshly loaded hold surface seeks to the prior Director shot's final frame", () => {
  const hold = echoRecordVideoPlaybackPlan({
    clockSeconds: 6,
    startSeconds: 0,
    durationSeconds: 4,
    sourceStartSeconds: 0,
    holdLastFrame: true,
    playbackPlaying: true,
    videoCurrentTime: 0,
    videoDuration: 8,
    readyState: 2,
  });

  assert.equal(hold.phase, "hold");
  assert.equal(hold.shouldPlay, false);
  assert.equal(hold.shouldSeek, true);
  assert.ok(
    Math.abs(hold.seekSeconds - 3.96) < 1e-12,
    "restoring inside a URI-less gap must decode the prior shot's end, not show frame zero",
  );
});

test("vinyl rotation stays media-clock-locked at a calmer display speed", () => {
  assert.equal(ECHO_RECORD_RPM, 100 / 3);
  assert.equal(ECHO_RECORD_DISPLAY_RPM, ECHO_RECORD_RPM / 4);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(1) - (10 * Math.PI / 9)) < 1e-12);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(3, { normalize: false }) - (10 * Math.PI / 3)) < 1e-12);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(18)) < 1e-12);
  assert.equal(echoRecordVinylSpinRadians(0, { phaseRadians: 0.25 }), 0.25);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(1.8, { rpm: ECHO_RECORD_DISPLAY_RPM }) - (Math.PI / 2)) < 1e-12);
  assert.ok(Math.abs(echoRecordVinylSpinRadians(7.2, { rpm: ECHO_RECORD_DISPLAY_RPM })) < 1e-12);
});

test("Director videos pre-cue future shots, follow active shots, and hold completed frames", () => {
  const future = echoRecordVideoPlaybackPlan({
    clockSeconds: 3,
    startSeconds: 10,
    durationSeconds: 5,
    sourceStartSeconds: 1.25,
    playbackPlaying: true,
    videoCurrentTime: 1.25,
    videoDuration: 8,
    readyState: 4,
  });
  assert.equal(future.active, false);
  assert.equal(future.phase, "future");
  assert.equal(future.shouldPlay, false);
  assert.equal(future.shouldSeek, false);
  assert.equal(future.seekSeconds, 1.25);

  const current = echoRecordVideoPlaybackPlan({
    clockSeconds: 12,
    startSeconds: 10,
    durationSeconds: 5,
    sourceStartSeconds: 1.25,
    playbackPlaying: true,
    videoCurrentTime: 3.25,
    videoDuration: 8,
    readyState: 4,
  });
  assert.equal(current.active, true);
  assert.equal(current.phase, "active");
  assert.equal(current.expectedSeconds, 3.25);
  assert.equal(current.shouldPlay, true);
  assert.equal(current.shouldSeek, false);

  const past = echoRecordVideoPlaybackPlan({
    clockSeconds: 16,
    startSeconds: 10,
    durationSeconds: 5,
    sourceStartSeconds: 1.25,
    playbackPlaying: true,
    videoCurrentTime: 6.21,
    videoDuration: 8,
    readyState: 4,
  });
  assert.equal(past.active, false);
  assert.equal(past.phase, "past");
  assert.equal(past.past, true);
  assert.equal(past.shouldPlay, false);
  assert.ok(Math.abs(past.seekSeconds - 6.21) < 1e-12);
  assert.equal(past.shouldSeek, false);

  const overshotPast = echoRecordVideoPlaybackPlan({
    clockSeconds: 16,
    startSeconds: 10,
    durationSeconds: 5,
    sourceStartSeconds: 1.25,
    playbackPlaying: true,
    videoCurrentTime: 7.5,
    videoDuration: 8,
    readyState: 4,
  });
  assert.equal(overshotPast.phase, "past");
  assert.equal(overshotPast.expectedSeconds, 7.5);
  assert.equal(overshotPast.seekSeconds, 7.5);
  assert.equal(overshotPast.shouldSeek, false);

  const exactEnd = echoRecordVideoPlaybackPlan({
    clockSeconds: 15,
    startSeconds: 10,
    durationSeconds: 5,
    sourceStartSeconds: 1.25,
    videoCurrentTime: 6.21,
    videoDuration: 8,
    readyState: 4,
  });
  assert.equal(exactEnd.phase, "past");

  const boundedPast = echoRecordVideoPlaybackPlan({
    clockSeconds: 16,
    startSeconds: 10,
    durationSeconds: 5,
    sourceStartSeconds: 1.25,
    videoCurrentTime: 3.97,
    videoDuration: 4,
    readyState: 4,
  });
  assert.equal(boundedPast.seekSeconds, 3.97);
  assert.equal(boundedPast.shouldSeek, false);

  const buffering = echoRecordVideoPlaybackPlan({
    clockSeconds: 10.2,
    startSeconds: 10,
    durationSeconds: 5,
    playbackPlaying: true,
    videoCurrentTime: 0.18,
    videoDuration: 5,
    readyState: 2,
  });
  assert.equal(buffering.presentable, true);
  assert.equal(buffering.buffered, false);
  assert.equal(buffering.waitingForFrame, false);
  assert.equal(buffering.waitingForBuffer, true);
  assert.equal(
    buffering.shouldPlay,
    true,
    "a decoded current frame must be allowed to play so the browser can fill its future buffer",
  );

  const noDecodedFrame = echoRecordVideoPlaybackPlan({
    clockSeconds: 10.2,
    startSeconds: 10,
    durationSeconds: 5,
    playbackPlaying: true,
    videoCurrentTime: 0,
    videoDuration: 5,
    readyState: 1,
  });
  assert.equal(noDecodedFrame.presentable, false);
  assert.equal(noDecodedFrame.buffered, false);
  assert.equal(noDecodedFrame.waitingForFrame, true);
  assert.equal(
    noDecodedFrame.shouldPlay,
    true,
    "active playback intent must survive a temporary loss of decoded-frame readiness",
  );

  const reducedAmbient = echoRecordVideoPlaybackPlan({
    clockSeconds: 9,
    startSeconds: 0,
    durationSeconds: 4,
    clockLocked: false,
    reducedMotion: true,
    videoCurrentTime: 0,
    videoDuration: 4,
    readyState: 4,
  });
  assert.equal(reducedAmbient.phase, "ambient");
  assert.equal(reducedAmbient.shouldPlay, false);
  assert.equal(reducedAmbient.seekSeconds, 0);

  const loopingAmbient = echoRecordVideoPlaybackPlan({
    clockSeconds: 9,
    startSeconds: 0,
    durationSeconds: 4,
    clockLocked: false,
    reducedMotion: false,
    videoCurrentTime: 1,
    videoDuration: 4,
    readyState: 4,
  });
  assert.equal(loopingAmbient.phase, "ambient");
  assert.equal(loopingAmbient.expectedSeconds, 1);
  assert.equal(loopingAmbient.shouldPlay, true);
  assert.equal(loopingAmbient.shouldSeek, false);
});

test("media windows keep three visible surfaces and deterministically warm the next three", () => {
  const visuals = Array.from({ length: 7 }, (_, index) => ({
    id: `surface-${index + 1}`,
    mediaId: `media-${index + 1}`,
  }));

  const first = selectEchoRecordMediaWindow(visuals, 0, {
    visibleCount: 3,
    warmCount: 3,
  });
  assert.equal(first.page, 0);
  assert.equal(first.pageCount, 3);
  assert.deepEqual(first.visible.map((visual) => visual.id), [
    "surface-1",
    "surface-2",
    "surface-3",
  ]);
  assert.deepEqual(first.warm.map((visual) => visual.id), [
    "surface-4",
    "surface-5",
    "surface-6",
  ]);

  const middle = selectEchoRecordMediaWindow(visuals, 1, {
    visibleCount: 3,
    warmCount: 3,
  });
  assert.deepEqual(middle.visible.map((visual) => visual.id), [
    "surface-4",
    "surface-5",
    "surface-6",
  ]);
  assert.deepEqual(
    middle.warm.map((visual) => visual.id),
    ["surface-7", "surface-1", "surface-2"],
    "warming wraps across the end instead of leaving the pool empty",
  );

  const bounded = selectEchoRecordMediaWindow(visuals, 99, {
    visibleCount: 3,
    warmCount: 3,
  });
  assert.equal(bounded.page, 2);
  assert.deepEqual(bounded.visible.map((visual) => visual.id), ["surface-7"]);
  assert.deepEqual(bounded.warm.map((visual) => visual.id), [
    "surface-1",
    "surface-2",
    "surface-3",
  ]);
  assert.equal(
    new Set([...bounded.visible, ...bounded.warm].map((visual) => visual.id)).size,
    4,
    "the warm window never duplicates a currently visible resource",
  );
});

test("scene snapshots migrate bounded state and reject malformed camera values", () => {
  const snapshot = normalizeEchoRecordGardenSnapshot({
    schemaVersion: ECHO_RECORD_GARDEN_LEGACY_SNAPSHOT_SCHEMA,
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
  assert.equal(snapshot.migratedFrom, ECHO_RECORD_GARDEN_LEGACY_SNAPSHOT_SCHEMA);
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

test("v2 garden snapshots preserve full crate, surface, spatial, and interrupted Card state", () => {
  const snapshot = normalizeEchoRecordGardenSnapshot({
    schemaVersion: ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
    selection: {
      selectedSongId: "echo-song-two",
      placedSongId: "echo-song-one",
      selectedVisualId: "echo-surface:two",
    },
    catalog: {
      query: "  porch light  ",
      perspective: "blue",
      cratePage: 2,
      crateOrder: ["echo-song-two", "echo-song-one", "echo-song-two"],
    },
    playback: { seconds: 44.5, muted: false },
    scene: {
      surfacePage: 3,
      surfaceSongId: "echo-song-one",
      camera: {
        position: [2, 4, 7],
        target: [0, 0.8, -1],
      },
      recordTransforms: {
        "echo-song-one": {
          position: [1.234, 0.82, -0.765],
          rotation: [0.1, -0.2, 0.3],
          manipulated: true,
        },
        "malformed-song": {
          position: ["bad", 0.8, 0],
        },
      },
    },
    cardJob: {
      status: "resolving",
      visualId: "echo-surface:two",
      songId: "echo-song-two",
      requestKey: "song|visual|44500",
      startedAt: "2026-07-30T10:00:00.000Z",
      error: "",
    },
  });

  assert.equal(snapshot.schemaVersion, ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.migratedFrom, null);
  assert.equal(snapshot.query, "porch light");
  assert.equal(snapshot.cratePage, 2);
  assert.deepEqual(snapshot.crateOrder, ["echo-song-two", "echo-song-one"]);
  assert.equal(snapshot.surfacePage, 3);
  assert.equal(snapshot.surfaceSongId, "echo-song-one");
  assert.deepEqual(snapshot.recordTransforms, {
    "echo-song-one": {
      position: [1.234, 0.82, -0.765],
      rotation: [0.1, -0.2, 0.3],
      manipulated: true,
    },
  });
  assert.deepEqual(snapshot.cardJob, {
    status: "interrupted",
    visualId: "echo-surface:two",
    songId: "echo-song-two",
    requestKey: "song|visual|44500",
    startedAt: "2026-07-30T10:00:00.000Z",
    error: "The previous Card request was interrupted. Retry from the same visual.",
    recoverable: true,
  });
});

test("snapshot reconciliation removes stale IDs without reordering current records", () => {
  const reconciled = reconcileEchoRecordGardenSnapshot({
    schemaVersion: ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
    selection: {
      selectedSongId: "removed-song",
      placedSongId: "echo-song-one",
      selectedVisualId: "removed-visual",
    },
    catalog: {
      crateOrder: ["removed-song", "echo-song-two", "echo-song-one"],
    },
    scene: {
      recordTransforms: {
        "removed-song": { position: [1, 0.8, 1] },
        "echo-song-one": { position: [2, 0.8, 1] },
      },
    },
    cardJob: {
      status: "failed",
      visualId: "removed-visual",
      songId: "echo-song-one",
      error: "Network interrupted",
    },
  }, {
    recordIds: ["echo-song-one", "echo-song-two", "echo-song-three"],
    visualIds: ["echo-surface:one"],
  });

  assert.equal(reconciled.selectedSongId, "echo-song-one");
  assert.equal(reconciled.placedSongId, "echo-song-one");
  assert.equal(reconciled.selectedVisualId, "echo-surface:one");
  assert.deepEqual(reconciled.crateOrder, [
    "echo-song-two",
    "echo-song-one",
    "echo-song-three",
  ]);
  assert.deepEqual(Object.keys(reconciled.recordTransforms), ["echo-song-one"]);
  assert.equal(reconciled.cardJob.status, "unavailable");
  assert.equal(reconciled.cardJob.recoverable, false);
});

test("table drops are bounded, quantized, and collision safe", () => {
  assert.deepEqual(
    resolveEchoRecordGardenTableDrop({
      position: [5, 0.823, -3],
      occupiedPositions: [],
    }),
    {
      accepted: true,
      reason: "accepted",
      position: [4.25, 0.8, -2.2],
    },
  );
  assert.deepEqual(
    resolveEchoRecordGardenTableDrop({
      position: [1.02, 0.82, 1.02],
      occupiedPositions: [[1.8, 0.82, 1.1]],
    }),
    {
      accepted: false,
      reason: "record-collision",
      position: null,
    },
  );
  assert.equal(
    resolveEchoRecordGardenTableDrop({ position: ["bad", 0.8, 0] }).reason,
    "invalid-position",
  );
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
