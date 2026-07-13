import test from "node:test";
import assert from "node:assert/strict";
import {
  WIDE_COVERAGE_DENSITY_PROFILES,
  buildDirectorDensityPlan,
  convertShotToVisualizerOnly,
  recastBalancedEchoDirectorProject,
  validateBalancedDirectorRevision,
} from "../src/domain/echo-media-recast.js";

const SOURCE_GROUPS = ["scroll", "scene", "avatar"];

function directedShot(index, { duration = 1, hasMedia = true } = {}) {
  const start = index * duration;
  const end = start + duration;
  return {
    shot_index: index,
    section_id: index < 2 ? `intro-${index}` : `chorus-${index}`,
    section_type: index < 2 ? "intro" : "chorus",
    start_sec: start,
    end_sec: end,
    media_id: hasMedia ? `legacy-media-${index}` : "none",
    media_title: hasMedia ? `Legacy Media ${index}` : "Visualizer Only",
    media_uri: hasMedia ? `/media/legacy-${index}.mp4` : "",
    runtime_media_uri: hasMedia ? `/media/legacy-${index}-proxy.mp4` : "",
    transition: index % 2 ? "flicker" : "fade",
    active_stems: index < 2 ? ["Vocals", "Strings"] : ["Drums", "Bass"],
    audio_bindings: [{ source: index < 2 ? "vocals" : "drums", target: "cut" }],
    camera_motion: index % 2 ? "orbit" : "push-in",
    camera_intensity: index < 2 ? 0.7 : 1.8,
    camera_speed: index < 2 ? 0.8 : 1.6,
  };
}

function directedProject(count, { allVisualizer = false } = {}) {
  return {
    song_id: "wide-coverage-song",
    song_title: "Wide Coverage Song",
    duration: count,
    audio_id: "wide-coverage-audio",
    timed_lyrics: [{ text: "inherited lyric timing", start_sec: 1, end_sec: 2 }],
    visualizer_timeline: [{ start_sec: 0, end_sec: count, visualizer_id: "ivf-cymatic-1" }],
    timeline: Array.from({ length: count }, (_, index) => directedShot(index, {
      hasMedia: !allVisualizer,
    })),
  };
}

function directorCandidate(sourceGroup, motionRole, index) {
  const digest = (index + 1).toString(16).padStart(2, "0").repeat(32);
  const id = `${sourceGroup}-${motionRole}-${index}`;
  const cardId = `${sourceGroup}-card-${motionRole}-${index}`;
  return {
    id,
    mediaLibraryId: `${sourceGroup}-media-${motionRole}-${index}`,
    cardId,
    cardKind: sourceGroup === "scroll" ? "item" : sourceGroup,
    cardRef: `data/${sourceGroup}-store.json#${cardId}`,
    cardTitle: `${sourceGroup} ${motionRole} Card`,
    ownerId: cardId,
    ownerTitle: `${sourceGroup} ${motionRole}`,
    title: `${sourceGroup} ${motionRole}`,
    uri: `/media/${id}.mp4`,
    runtimeUri: `/media/${id}-proxy.mp4`,
    posterUri: `/media/${id}.jpg`,
    sha256: digest,
    technicalIdentity: `sha256:${digest}`,
    duration: 8,
    width: 1920,
    height: 1080,
    sourceGroup,
    cohort: sourceGroup === "scroll" ? "root" : `builder-${sourceGroup}`,
    motionRole,
    analyzerRole: motionRole,
    authoredUse: motionRole === "loop" ? "hold" : "connector",
    routeOrder: index,
    autoEligible: true,
    origin: {
      sourceSystem: sourceGroup === "scroll" ? "scroll-site-skill" : "hapa-avatar-builder",
      sourceStore: `data/${sourceGroup}-store.json`,
      recordId: cardId,
    },
  };
}

function mixedCandidates() {
  return SOURCE_GROUPS.flatMap((sourceGroup, groupIndex) => [
    directorCandidate(sourceGroup, "loop", groupIndex * 2),
    directorCandidate(sourceGroup, "transition", groupIndex * 2 + 1),
  ]);
}

test("wide-coverage profiles produce deterministic nested 45/70/92 density masks", () => {
  assert.equal(Object.isFrozen(WIDE_COVERAGE_DENSITY_PROFILES), true);
  assert.deepEqual(
    WIDE_COVERAGE_DENSITY_PROFILES.map(({ id, targetVideoRatio }) => [id, targetVideoRatio]),
    [["airy", 0.45], ["rhythmic", 0.7], ["dense", 0.92]],
  );

  const project = directedProject(100);
  const plan = buildDirectorDensityPlan(project, {
    seed: "nested-wide-coverage-density-fixture",
  });
  const repeat = buildDirectorDensityPlan(project, {
    seed: "nested-wide-coverage-density-fixture",
  });

  assert.deepEqual(repeat, plan, "the density decision is reusable without another direction pass");
  assert.equal(plan.schemaVersion, "hapa.echo.director-density-plan.v1");
  assert.deepEqual(plan.profiles.map((profile) => profile.mediaBearingShots), [45, 70, 92]);
  assert.deepEqual(plan.profiles.map((profile) => profile.actualVideoRatio), [0.45, 0.7, 0.92]);

  const [airy, rhythmic, dense] = plan.profiles.map((profile) => new Set(profile.mediaShotIndices));
  assert.ok([...airy].every((index) => rhythmic.has(index)), "the rhythmic cut must extend the airy mask");
  assert.ok([...rhythmic].every((index) => dense.has(index)), "the dense cut must extend the rhythmic mask");
  for (const mask of [airy, rhythmic, dense]) {
    assert.equal(mask.has(0), true, "every cut keeps the opening frame");
    assert.equal(mask.has(99), true, "every cut keeps the closing frame");
  }
});

test("density planning and recasting refuse visualizer-only windows without full IVF coverage", () => {
  const project = directedProject(6);
  project.timeline[2].density_lock = "visualizer";
  project.visualizer_timeline = [
    { start_sec: 0, end_sec: 2, visualizer_id: "ivf-left" },
    { start_sec: 3, end_sec: 6, visualizer_id: "ivf-right" },
  ];

  assert.throws(
    () => buildDirectorDensityPlan(project, { seed: "coverage-gap-fixture" }),
    /without full visualizer coverage: 2/,
  );
  assert.throws(
    () => recastBalancedEchoDirectorProject(project, mixedCandidates(), {
      seed: "coverage-gap-recast-fixture",
      densityProfile: WIDE_COVERAGE_DENSITY_PROFILES[0],
      mediaShotIndices: [0, 1, 3, 4, 5],
    }),
    /without full visualizer coverage: 2/,
  );
});

test("visualizer conversion clears stale media identity and preserves inherited direction", () => {
  const shot = {
    ...directedShot(2, { duration: 2.5 }),
    media_id: "stale-media-id",
    media_title: "Stale Media Title",
    media_uri: "/media/stale-original.mp4",
    media_thumbnail: "/media/stale-poster.jpg",
    runtime_media_uri: "/media/stale-proxy.mp4",
    media_card_id: "stale-card-id",
    media_card_kind: "scene",
    media_card_ref: "data/scenes.json#stale-card-id",
    media_card_title: "Stale Card",
    media_source_group: "scene",
    media_technical_identity: `sha256:${"f".repeat(64)}`,
    media_contract: {
      type: "video",
      originalUri: "/media/stale-original.mp4",
      runtimeUri: "/media/stale-proxy.mp4",
      contentHash: "f".repeat(64),
    },
    semantic_casting: { claim: "stale" },
    decision_evidence: { truthStatus: "stale" },
    edit_reason: "stale reason",
    stem_modulation: { drums: 0.75 },
    audio_gain: 0.82,
    camera: { rig: "handheld", roll: 3 },
  };
  const before = structuredClone(shot);
  const converted = convertShotToVisualizerOnly(shot, {
    profileId: "airy",
    profileLabel: "Airy",
    targetVideoRatio: 0.45,
  });

  assert.deepEqual(shot, before, "the inherited shot must remain immutable");
  assert.deepEqual(
    [converted.start_sec, converted.end_sec, converted.transition],
    [shot.start_sec, shot.end_sec, shot.transition],
  );
  assert.deepEqual(converted.active_stems, shot.active_stems);
  assert.deepEqual(converted.audio_bindings, shot.audio_bindings);
  assert.deepEqual(converted.stem_modulation, shot.stem_modulation);
  assert.equal(converted.audio_gain, shot.audio_gain);
  assert.equal(converted.camera_motion, shot.camera_motion);
  assert.equal(converted.camera_intensity, shot.camera_intensity);
  assert.equal(converted.camera_speed, shot.camera_speed);
  assert.deepEqual(converted.camera, shot.camera);

  assert.equal(converted.media_id, "none");
  assert.equal(converted.media_title, "Visualizer Only");
  assert.equal(converted.media_uri, "");
  assert.equal(converted.runtime_media_uri, "");
  assert.equal(converted.media_contract.type, "generated-visualizer");
  assert.equal(converted.media_contract.sourceOutSeconds, 2.5);
  assert.equal(converted.media_contract.fallback.mode, "ivf");
  for (const key of [
    "media_card_id",
    "media_card_kind",
    "media_card_ref",
    "media_card_title",
    "media_source_group",
    "media_technical_identity",
    "semantic_casting",
  ]) {
    assert.equal(Object.hasOwn(converted, key), false, `${key} must not survive the conversion`);
  }
  assert.equal(converted.decision_evidence.truthStatus, "density-directed-visualizer-only");
  assert.equal(converted.decision_evidence.densityAction, "media-to-visualizer");
  assert.equal(converted.decision_evidence.visualizerCoverageVerified, true);
  assert.doesNotMatch(JSON.stringify(converted), /stale-media-id|stale-card-id|stale-original|stale-proxy/);
});

test("dense append-only cut promotes inherited IVF windows and carries selectable cut metadata", () => {
  const project = directedProject(10, { allVisualizer: true });
  const variationSet = {
    id: "wide-coverage-density-v1",
    label: "Wide Coverage Director Passes",
    batchId: "wide-coverage-density-2026-07-13-v1",
  };
  const cut = { ordinal: 3, label: "Dense" };
  const coveragePass = {
    strategy: "album-least-used-first",
    ordinal: 3,
    baselineVariantIds: ["scroll-fal-authored-v1", "scroll-scene-avatar-balanced-v1"],
  };
  const variant = recastBalancedEchoDirectorProject(project, mixedCandidates(), {
    variantId: "wide-coverage-dense-v1",
    title: "Wide Coverage · Dense",
    createdAt: "2026-07-13T00:00:00.000Z",
    parentProjectHash: "c".repeat(64),
    seed: "wide-coverage-dense-fixture",
    densityPlanSeed: "shared-wide-coverage-density-fixture",
    densityProfile: WIDE_COVERAGE_DENSITY_PROFILES[2],
    variationSet,
    cut,
    coveragePass,
  });

  assert.deepEqual(variant.variationSet, variationSet);
  assert.deepEqual(variant.cut, cut);
  assert.deepEqual(variant.coveragePass, coveragePass);
  assert.deepEqual(variant.densityProfile, WIDE_COVERAGE_DENSITY_PROFILES[2]);
  assert.equal(variant.parent.songId, project.song_id);
  assert.equal(variant.parent.projectSha256, "c".repeat(64));
  assert.equal(variant.parent.immutableLegacyProject, true);
  assert.equal(variant.telemetry.originalMediaShots, 0);
  assert.equal(variant.telemetry.mediaBearingShots, 9);
  assert.equal(variant.telemetry.visualizerOnlyShots, 1);
  assert.equal(variant.telemetry.promotedToMedia, 9);
  assert.equal(variant.telemetry.retainedOriginalMedia, 0);
  assert.equal(variant.telemetry.targetVideoRatio, 0.92);
  assert.equal(variant.telemetry.actualVideoRatio, 0.9);
  assert.equal(variant.telemetry.densityPlanActualVideoRatio, 0.9);
  assert.equal(variant.densityPlan.mediaShotIndices.length, 9);
  assert.equal(variant.selectionEvidence.length, 9);
  assert.ok(variant.selectionEvidence.every((selection) => (
    selection.densityAction === "visualizer-to-media" && selection.originalMediaPresent === false
  )));
  assert.ok(variant.timeline.filter((shot) => shot.media_id !== "none").every((shot) => (
    shot.decision_evidence.densityAction === "visualizer-to-media"
    && shot.decision_evidence.originalMediaPresent === false
  )));
  assert.deepEqual(
    validateBalancedDirectorRevision(variant),
    { ok: true, timelineShots: 10, replacementShots: 9 },
  );

  const tampered = structuredClone(variant);
  const visualizerIndex = tampered.timeline.findIndex((shot) => shot.media_id === "none");
  tampered.timeline[visualizerIndex].media_card_id = "stale-card-after-density-pass";
  assert.throws(
    () => validateBalancedDirectorRevision(tampered),
    /retains stale media state \(media_card_id\)/,
  );
});

test("shared least-used ledger chooses unseen media before a used motion-role match", () => {
  const usedTransition = directorCandidate("scene", "transition", 20);
  const unseenLoop = directorCandidate("scene", "loop", 21);
  const ledger = new Map([
    [usedTransition.technicalIdentity, 12],
    [unseenLoop.technicalIdentity, 0],
  ]);
  const cardLedger = new Map([
    [usedTransition.cardId, 12],
    [unseenLoop.cardId, 0],
  ]);
  const project = directedProject(1);
  project.timeline[0].section_id = "chorus-climax";
  project.timeline[0].section_type = "chorus";
  project.timeline[0].active_stems = ["Drums", "Bass"];

  const variant = recastBalancedEchoDirectorProject(project, [usedTransition, unseenLoop], {
    variantId: "least-used-ledger-fixture",
    createdAt: "2026-07-13T00:00:00.000Z",
    seed: "least-used-ledger-fixture",
    allowedSourceGroups: ["scene"],
    requireAllSourceGroups: false,
    sourcePattern: ["scene"],
    rotateSourcePattern: false,
    sharedUsageCounts: ledger,
    sharedCardUsageCounts: cardLedger,
  });
  const [selection] = variant.selectionEvidence;

  assert.equal(selection.mediaId, unseenLoop.id);
  assert.equal(selection.preferredRole, "transition", "the high-energy shot still asks for motion");
  assert.equal(selection.motionRole, "loop", "coverage wins over the already-used role match");
  assert.equal(selection.priorAlbumUsage, 0);
  assert.equal(selection.albumUsageAfter, 1);
  assert.equal(selection.coveragePriorityHit, true);
  assert.equal(selection.rolePreferenceHit, false);
  assert.equal(ledger.get(unseenLoop.technicalIdentity), 1);
  assert.equal(ledger.get(usedTransition.technicalIdentity), 12);
  assert.equal(cardLedger.get(unseenLoop.cardId), 1);
  assert.equal(variant.telemetry.previouslyUnseenSelections, 1);
  assert.equal(variant.telemetry.coveragePriorityHits, 1);
  assert.equal(
    variant.sourcePolicy.coverageStrategy,
    "album-least-used-clip-then-card-fairness-with-soft-motion-role",
  );
});
