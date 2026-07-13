import test from "node:test";
import assert from "node:assert/strict";
import {
  createScrollSiteImportPlan,
  scrollMediaRecordId,
  scrollVideoCardId,
  validateScrollImportPlan,
} from "../src/domain/scroll-site-media-import.js";
import {
  buildScrollSiteDirectorCandidates,
  isDirectorMediaAllowed,
  recastEchoDirectorProject,
} from "../src/domain/echo-media-recast.js";

const continuity = {
  clips: [
    { id: "root-loop", source: "Root_loop.mp4", duration: 8, width: 1280, height: 720, fps: 24, classification: { role: "loop", confidence: "strong", loop_metrics: { score: 0.98 } } },
    { id: "fal-transition", source: "fal-second-cohort/opaque_output.mp4", duration: 5, width: 1920, height: 1080, fps: 24, classification: { role: "transition", confidence: "none", loop_metrics: { score: 0.2 } } },
    { id: "fal-review", source: "fal-second-cohort/review_output.mp4", duration: 5, width: 1920, height: 1080, fps: 24, classification: { role: "transition", confidence: "none", loop_metrics: { score: 0.1 } } },
    { id: "existing-avatar", source: "avatar-builder/red-avatar.mp4", duration: 10, width: 1080, height: 1920, fps: 24, classification: { role: "loop", confidence: "strong" } },
  ],
};

const site = {
  timeline: [{ id: "root-loop", source: "Root_loop.mp4", kind: "loop", src: "assets/videos/root-loop.mp4", poster: "assets/posters/root-loop.jpg" }],
  cards: {
    "root-card": { title: "Root World", family: "scene", mediaClip: "root-loop" },
  },
  spine: {
    transitions: [{ index: 0, clip: "fal-transition", source: "fal-second-cohort/opaque_output.mp4", src: "assets/spine/desktop/fal-transition.mp4", poster: "assets/spine/posters/fal-transition.jpg" }],
    anchorLoopHolds: [],
    loopInsertions: [],
    cardLoopOverlays: [],
  },
};

test("Scroll import plan excludes pre-existing Avatar cohort and gates un-authored clips", () => {
  const plan = createScrollSiteImportPlan({ continuity, site, sourceRoot: "/safe/videos" });
  assert.deepEqual(plan.totals, {
    declared: 4,
    included: 3,
    root: 1,
    fal: 2,
    authoredEligible: 2,
    reviewCandidates: 1,
    storyCards: 1,
  });
  assert.equal(plan.clips.find((clip) => clip.id === "fal-review").authoredUse, "review-candidate");
  assert.equal(plan.clips.find((clip) => clip.id === "root-loop").storyAppearances[0].cardId, "root-card");
  assert.deepEqual(validateScrollImportPlan(plan, { included: 3, authoredEligible: 2 }), { ok: true, clips: 3, authoredEligible: 2 });
});

test("Scroll media and Card ids require and preserve full SHA-256 identity", () => {
  const digest = "a".repeat(64);
  assert.equal(scrollVideoCardId(digest), `scroll-video-${digest}`);
  assert.equal(scrollMediaRecordId(digest), `hapa-media:sha256:${digest}`);
  assert.throws(() => scrollVideoCardId("short"), /full SHA-256/);
});

test("append-only recast preserves timing, stems, bindings, camera, and visualizers", () => {
  const project = {
    song_id: "song-1",
    song_title: "Song One",
    duration: 12,
    audio_id: "audio-1",
    timed_lyrics: [{ text: "hello", start_sec: 1, end_sec: 2 }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 12, visualizer_id: "shader-1", transition: "mix" }],
    timeline: [
      {
        shot_index: 0,
        section_id: "intro",
        section_type: "intro",
        start_sec: 0,
        end_sec: 6,
        media_id: "old-ltx-card",
        media_title: "Old LTX",
        media_uri: "/media/old-ltx.mp4",
        transition: "fade",
        active_stems: ["Vocals"],
        audio_bindings: [{ source: "vocals", target: "vibe" }],
        camera_motion: "push-in",
        camera_intensity: 1.4,
        camera_speed: 1.2,
        decision_evidence: { rejectedAlternatives: [{ mediaId: "hell-week-old" }] },
      },
      {
        shot_index: 1,
        section_id: "chorus",
        section_type: "chorus",
        start_sec: 6,
        end_sec: 12,
        media_id: "old-dev-proto-card",
        media_title: "Old Proto",
        media_uri: "/media/hapa-dev-proto.mp4",
        transition: "flicker",
        active_stems: ["Drums", "Bass"],
        audio_bindings: [{ source: "drums", target: "cut" }],
        camera_motion: "orbit",
        camera_intensity: 2,
        camera_speed: 1.8,
      },
    ],
  };
  const before = JSON.stringify(project);
  const candidates = [
    {
      id: "root-loop",
      cardId: `scroll-video-${"a".repeat(64)}`,
      mediaLibraryId: `hapa-media:sha256:${"a".repeat(64)}`,
      title: "Root Loop",
      uri: "/media/root-loop.mp4",
      runtimeUri: "/media/root-loop-proxy.mp4",
      posterUri: "/media/root-loop.jpg",
      sha256: "a".repeat(64),
      duration: 8,
      width: 1280,
      height: 720,
      cohort: "root",
      analyzerRole: "loop",
      analyzerConfidence: "strong",
      authoredUse: "hold",
      authoredRoles: ["opening hold"],
      autoEligible: true,
      routeOrder: 0,
    },
    {
      id: "fal-transition",
      cardId: `scroll-video-${"b".repeat(64)}`,
      mediaLibraryId: `hapa-media:sha256:${"b".repeat(64)}`,
      title: "FAL Transition",
      uri: "/media/fal-transition.mp4",
      runtimeUri: "/media/fal-transition-proxy.mp4",
      posterUri: "/media/fal-transition.jpg",
      sha256: "b".repeat(64),
      duration: 5,
      width: 1920,
      height: 1080,
      cohort: "fal-second-cohort",
      analyzerRole: "transition",
      analyzerConfidence: "none",
      authoredUse: "connector",
      autoEligible: true,
      routeOrder: 1,
    },
  ];
  const variant = recastEchoDirectorProject(project, candidates, { createdAt: "2026-07-12T00:00:00.000Z", parentProjectHash: "c".repeat(64) });
  assert.equal(JSON.stringify(project), before, "source project must not be mutated");
  assert.deepEqual(variant.timeline.map((shot) => [shot.start_sec, shot.end_sec]), [[0, 6], [6, 12]]);
  assert.deepEqual(variant.timeline[0].active_stems, project.timeline[0].active_stems);
  assert.deepEqual(variant.timeline[0].audio_bindings, project.timeline[0].audio_bindings);
  assert.equal(variant.timeline[0].camera_motion, "push-in");
  assert.equal(variant.timeline[1].transition, "flicker");
  assert.doesNotMatch(JSON.stringify(variant.timeline), /hell[ -]?week|hapa[-_]dev[-_]proto|\bltx\b/i);
  assert.match(variant.hyperframe_script, /root-loop-proxy|fal-transition-proxy/);
});

test("director allowlist rejects forbidden markers and review-gated candidates", () => {
  assert.equal(isDirectorMediaAllowed({ id: "ok", uri: "/media/ok.mp4", cohort: "root", autoEligible: true }), true);
  assert.equal(isDirectorMediaAllowed({ id: "ltx-old", uri: "/media/ok.mp4", cohort: "root", autoEligible: true }), false);
  assert.equal(isDirectorMediaAllowed({ id: "review", uri: "/media/review.mp4", cohort: "fal-second-cohort", autoEligible: false }), false);
  assert.equal(buildScrollSiteDirectorCandidates([
    { id: "ok", uri: "/media/ok.mp4", cohort: "root", autoEligible: true },
    { id: "blocked", uri: "/media/hapa-dev-proto.mp4", cohort: "root", autoEligible: true },
  ]).length, 1);
});
