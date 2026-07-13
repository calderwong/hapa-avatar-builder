import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCED_RECAST_SELECTION_MODE,
  SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID,
  buildBalancedDirectorCandidates,
  isBalancedDirectorMediaAllowed,
  recastBalancedEchoDirectorProject,
  recastEchoDirectorProject,
  validateBalancedDirectorRevision,
} from "../src/domain/echo-media-recast.js";

const GROUPS = ["scroll", "scene", "avatar"];

function candidate(sourceGroup, motionRole, index) {
  const digest = String(index + 1).repeat(64).slice(0, 64);
  const cardId = `${sourceGroup}-card-${motionRole}`;
  return {
    id: `${sourceGroup}-${motionRole}`,
    mediaLibraryId: `${sourceGroup}-media-${motionRole}`,
    cardId,
    cardKind: sourceGroup === "scroll" ? "item" : sourceGroup,
    cardRef: `data/${sourceGroup}-store.json#${cardId}`,
    cardTitle: `${sourceGroup} ${motionRole} Card`,
    ownerId: cardId,
    ownerTitle: `${sourceGroup} ${motionRole}`,
    title: `${sourceGroup} ${motionRole}`,
    uri: `/media/${sourceGroup}-${motionRole}.mp4`,
    runtimeUri: `/media/${sourceGroup}-${motionRole}-proxy.mp4`,
    posterUri: `/media/${sourceGroup}-${motionRole}.jpg`,
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
  return GROUPS.flatMap((sourceGroup, groupIndex) => [
    candidate(sourceGroup, "loop", groupIndex * 2),
    candidate(sourceGroup, "transition", groupIndex * 2 + 1),
  ]);
}

function projectWithShots(count = 12) {
  return {
    song_id: "balanced-song",
    song_title: "Balanced Song",
    duration: count * 4,
    audio_id: "balanced-audio",
    timed_lyrics: [{ text: "keep this timing", start_sec: 1, end_sec: 2 }],
    visualizer_timeline: [{ start_sec: 0, end_sec: count * 4, visualizer_id: "shader-1" }],
    timeline: Array.from({ length: count }, (_, index) => ({
      shot_index: index,
      section_id: index < 3 ? `bridge-${index}` : `chorus-${index}`,
      section_type: index < 3 ? "bridge" : "chorus",
      start_sec: index * 4,
      end_sec: (index + 1) * 4,
      media_id: `legacy-media-${index}`,
      media_uri: `/media/legacy-${index}.mp4`,
      transition: index % 2 ? "flicker" : "fade",
      active_stems: index < 3 ? ["Vocals", "Strings"] : ["Drums", "Bass"],
      audio_bindings: [{ source: index < 3 ? "vocals" : "drums", target: "cut" }],
      camera_motion: index % 2 ? "orbit" : "push-in",
      camera_intensity: index < 3 ? 0.7 : 1.8,
      camera_speed: index < 3 ? 0.8 : 1.6,
    })),
  };
}

test("balanced mixed-library eligibility scopes hapa-dev-proto exclusion to explicit provenance", () => {
  const loreOnly = {
    ...candidate("scene", "loop", 6),
    id: "scene-lore-reference",
    title: "A Hapa Dev Proto Retrospective",
    tags: ["hapa-dev-proto", "historical-lore"],
  };
  const forbiddenOrigin = {
    ...candidate("avatar", "transition", 7),
    id: "avatar-forbidden-origin",
    title: "Clean public title",
    origin: {
      sourceRepository: "/Users/calderwong/Desktop/hapa-dev-proto",
      recordId: "opaque-card-id",
    },
  };

  assert.equal(isBalancedDirectorMediaAllowed(loreOnly), true, "descriptive text is not provenance");
  assert.equal(isBalancedDirectorMediaAllowed(forbiddenOrigin), false, "explicit repository origin is provenance");
  assert.deepEqual(
    buildBalancedDirectorCandidates([loreOnly, forbiddenOrigin]).map((entry) => entry.id),
    ["scene-lore-reference"],
  );
});

test("balanced recast rotates all three sources, drains deterministic shuffle bags, and preserves direction", () => {
  const project = projectWithShots();
  const before = JSON.stringify(project);
  const options = {
    createdAt: "2026-07-12T12:00:00.000Z",
    parentProjectHash: "c".repeat(64),
    seed: "balanced-recast-fixture",
  };
  const variant = recastBalancedEchoDirectorProject(project, mixedCandidates(), options);
  const viaMode = recastEchoDirectorProject(project, mixedCandidates(), {
    ...options,
    selectionMode: BALANCED_RECAST_SELECTION_MODE,
  });

  assert.equal(JSON.stringify(project), before, "source project must remain immutable");
  assert.equal(variant.id, SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID);
  assert.equal(variant.selectionMode, BALANCED_RECAST_SELECTION_MODE);
  assert.deepEqual(viaMode.selectionEvidence, variant.selectionEvidence, "the opt-in options path is deterministic");

  const sources = variant.selectionEvidence.map((selection) => selection.sourceGroup);
  assert.deepEqual([...new Set(sources.slice(0, 3))].sort(), [...GROUPS].sort());
  for (let index = 3; index < sources.length; index += 1) {
    assert.equal(sources[index], sources[index - 3], "three-source rotation must remain stable");
  }
  assert.deepEqual(variant.selectionEvidence.slice(0, 3).map((selection) => selection.motionRole), ["loop", "loop", "loop"]);
  assert.deepEqual(variant.selectionEvidence.slice(3, 6).map((selection) => selection.motionRole), ["transition", "transition", "transition"]);

  for (let index = 1; index < variant.selectionEvidence.length; index += 1) {
    assert.notEqual(
      variant.selectionEvidence[index].technicalIdentity,
      variant.selectionEvidence[index - 1].technicalIdentity,
      "adjacent shots must not repeat the same technical media",
    );
  }
  for (const sourceGroup of GROUPS) {
    const firstBag = variant.selectionEvidence.filter((selection) => selection.sourceGroup === sourceGroup).slice(0, 2);
    assert.equal(new Set(firstBag.map((selection) => selection.technicalIdentity)).size, 2, `${sourceGroup} must drain its first bag before reuse`);
  }

  assert.deepEqual(variant.timeline.map((shot) => [shot.start_sec, shot.end_sec]), project.timeline.map((shot) => [shot.start_sec, shot.end_sec]));
  assert.deepEqual(variant.timeline[0].active_stems, project.timeline[0].active_stems);
  assert.deepEqual(variant.timeline[1].audio_bindings, project.timeline[1].audio_bindings);
  assert.equal(variant.timeline[2].camera_motion, project.timeline[2].camera_motion);
  assert.equal(variant.timeline[3].transition, project.timeline[3].transition);
  assert.ok(variant.timeline.every((shot) => shot.decision_evidence.sourceEvidence.card.id === shot.media_card_id));
  assert.ok(variant.timeline.every((shot) => shot.media_card_kind && shot.media_card_ref && shot.media_source_group));
  assert.ok(variant.timeline.every((shot) => shot.media_technical_identity === shot.decision_evidence.technicalIdentity));
  assert.ok(variant.timeline.every((shot) => shot.decision_evidence.provenance.scope === "explicit-origin-lineage-only"));

  assert.deepEqual(variant.telemetry.sourceCandidatesByGroup, { scroll: 2, scene: 2, avatar: 2 });
  assert.deepEqual(variant.telemetry.selectionsBySource, { scroll: 4, scene: 4, avatar: 4 });
  assert.equal(variant.telemetry.sourceSelectionBalanceSpread, 0);
  assert.equal(variant.telemetry.immediateMediaRepeats, 0);
  assert.equal(variant.telemetry.longestSourceStreak, 1);
  assert.ok(variant.telemetry.rolePreferenceHits >= 6);
  assert.deepEqual(variant.telemetry.shuffleBagPassesBySource, { scroll: 2, scene: 2, avatar: 2 });
  assert.deepEqual(validateBalancedDirectorRevision(variant), { ok: true, timelineShots: 12, replacementShots: 12 });
});

test("balanced validation rejects provenance tampering and selection refuses immediate media reuse", () => {
  const variant = recastBalancedEchoDirectorProject(projectWithShots(3), mixedCandidates(), {
    createdAt: "2026-07-12T12:00:00.000Z",
    seed: "balanced-validation-fixture",
  });
  const tampered = structuredClone(variant);
  tampered.timeline[0].decision_evidence.provenance.references = ["/imports/hapa-dev-proto/card.json"];
  assert.throws(() => validateBalancedDirectorRevision(tampered), /forbidden explicit provenance|violates balanced source policy/);

  assert.throws(() => recastBalancedEchoDirectorProject(projectWithShots(2), [candidate("scene", "loop", 8)], {
    requireAllSourceGroups: false,
    seed: "impossible-single-candidate",
  }), /no-immediate-repeat contract/);
});
