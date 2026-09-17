import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCED_RECAST_SELECTION_MODE,
  SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID,
  balancedCandidateEditorialWeight,
  buildBalancedDirectorCandidates,
  isBalancedDirectorMediaAllowed,
  lyricDescriptionAffinity,
  recastBalancedEchoDirectorProject,
  recastEchoDirectorProject,
  validateBalancedDirectorRevision,
  visualDescriptionAffinity,
  visualPaletteContrast,
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
  const forbiddenHellWeekOrigin = {
    ...candidate("scene", "transition", 8),
    id: "scene-forbidden-hell-week-origin",
    origin: { sourceSystem: "hell-week" },
  };

  assert.equal(isBalancedDirectorMediaAllowed(loreOnly), true, "descriptive text is not provenance");
  assert.equal(isBalancedDirectorMediaAllowed(forbiddenOrigin), false, "explicit repository origin is provenance");
  assert.equal(isBalancedDirectorMediaAllowed(forbiddenHellWeekOrigin), false, "explicit Hell Week origin is provenance");
  assert.deepEqual(
    buildBalancedDirectorCandidates([loreOnly, forbiddenOrigin]).map((entry) => entry.id),
    ["scene-lore-reference"],
  );
});

test("balanced recast accepts an explicit four-library Builder source policy", () => {
  const sourceGroups = ["avatar", "deevid", "tarot", "scene"];
  const candidates = sourceGroups.flatMap((sourceGroup, groupIndex) => [
    candidate(sourceGroup, "loop", 20 + groupIndex * 2),
    candidate(sourceGroup, "transition", 21 + groupIndex * 2),
  ]);
  const variant = recastBalancedEchoDirectorProject(projectWithShots(8), candidates, {
    variantId: "builder-deevid-tarot-scene-eligible-v1",
    allowedSourceGroups: sourceGroups,
    sourcePattern: sourceGroups,
    rotateSourcePattern: false,
    createdAt: "2026-07-18T12:00:00.000Z",
    seed: "four-library-builder-fixture",
  });

  assert.deepEqual(variant.selectionEvidence.map((selection) => selection.sourceGroup), [...sourceGroups, ...sourceGroups]);
  assert.deepEqual(variant.telemetry.sourceCandidatesByGroup, { avatar: 2, deevid: 2, tarot: 2, scene: 2 });
  assert.deepEqual(variant.sourcePolicy.forbiddenProvenanceLineages, ["hapa-dev-proto", "hell-week"]);
  assert.deepEqual(validateBalancedDirectorRevision(variant), { ok: true, timelineShots: 8, replacementShots: 8 });
});

test("balanced recast accepts the Reference Atlas as an explicit Director source family", () => {
  const references = [31, 32].map((index) => ({
    ...candidate("reference", "loop", index),
    id: `reference-loop-${index}`,
    cardId: `reference:example-${index}`,
    cardKind: "reference",
    cohort: "reference-atlas-adaptive",
  }));
  const variant = recastBalancedEchoDirectorProject(projectWithShots(2), references, {
    variantId: "reference-atlas-adaptive-eligible-v1",
    allowedSourceGroups: ["reference"],
    sourcePattern: ["reference"],
    createdAt: "2026-07-26T12:00:00.000Z",
    seed: "reference-atlas-adaptive-fixture",
  });

  assert.deepEqual(variant.selectionEvidence.map((selection) => selection.sourceGroup), ["reference", "reference"]);
  assert.deepEqual(variant.telemetry.sourceCandidatesByGroup, { reference: 2 });
  assert.deepEqual(validateBalancedDirectorRevision(variant), { ok: true, timelineShots: 2, replacementShots: 2 });
});

test("balanced recast keeps Ref Cards distinct from the Reference Atlas", () => {
  const sourceGroups = ["ref-cards", "reference"];
  const candidates = sourceGroups.flatMap((sourceGroup, groupIndex) => [
    {
      ...candidate(sourceGroup, "loop", 40 + groupIndex * 2),
      cardKind: sourceGroup === "ref-cards" ? "media" : "reference",
      cohort: sourceGroup === "ref-cards" ? "ref-cards-run-1" : "reference-atlas-adaptive",
    },
    {
      ...candidate(sourceGroup, "transition", 41 + groupIndex * 2),
      cardKind: sourceGroup === "ref-cards" ? "media" : "reference",
      cohort: sourceGroup === "ref-cards" ? "ref-cards-run-1" : "reference-atlas-adaptive",
    },
  ]);
  const variant = recastBalancedEchoDirectorProject(projectWithShots(4), candidates, {
    variantId: "ref-cards-reference-balanced-v1",
    allowedSourceGroups: sourceGroups,
    sourcePattern: sourceGroups,
    rotateSourcePattern: false,
    createdAt: "2026-07-27T12:00:00.000Z",
    seed: "ref-cards-reference-fixture",
  });

  assert.deepEqual(
    variant.selectionEvidence.map((selection) => selection.sourceGroup),
    ["ref-cards", "reference", "ref-cards", "reference"],
  );
  assert.deepEqual(variant.telemetry.sourceCandidatesByGroup, { "ref-cards": 2, reference: 2 });
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

test("shared album coverage honors bounded editorial motion weights", () => {
  const weighted = [
    { role: "transition", index: 80, weight: 2 },
    { role: "transition", index: 81, weight: 2 },
    { role: "loop", index: 82, weight: 1 },
    { role: "loop", index: 83, weight: 1 },
  ].map(({ role, index, weight }) => ({
    ...candidate("ref-cards", role, index),
    id: `ref-cards-${role}-${index}`,
    cardId: `ref-cards-card-${role}-${index}`,
    uri: `/media/ref-cards-${role}-${index}.mp4`,
    runtimeUri: `/media/ref-cards-${role}-${index}.mp4`,
    technicalIdentity: `sha256:${String(index).repeat(64).slice(0, 64)}`,
    sha256: String(index).repeat(64).slice(0, 64),
    editorialMotionWeight: weight,
  }));
  const sharedUsageCounts = new Map();
  for (let pass = 0; pass < 18; pass += 1) {
    const project = projectWithShots(2);
    project.timeline.forEach((shot) => {
      shot.section_id = "chorus";
      shot.section_type = "chorus";
      shot.active_stems = ["Drums", "Bass"];
    });
    recastBalancedEchoDirectorProject(project, weighted, {
      variantId: `weighted-${pass}`,
      allowedSourceGroups: ["ref-cards"],
      sourcePattern: ["ref-cards"],
      rotateSourcePattern: false,
      sharedUsageCounts,
      seed: `weighted-${pass}`,
    });
  }

  const transitionMean = weighted.filter((row) => row.motionRole === "transition")
    .reduce((sum, row) => sum + sharedUsageCounts.get(row.technicalIdentity), 0) / 2;
  const loopMean = weighted.filter((row) => row.motionRole === "loop")
    .reduce((sum, row) => sum + sharedUsageCounts.get(row.technicalIdentity), 0) / 2;
  assert.equal(balancedCandidateEditorialWeight({ editorialMotionWeight: 99 }), 4);
  assert.equal(balancedCandidateEditorialWeight({ editorialMotionWeight: 0.01 }), 0.25);
  assert.ok(transitionMean >= loopMean * 1.5, `${transitionMean} transition uses vs ${loopMean} loop uses`);
});

const hueBin = (bin, weight = 1) => new Array(12).fill(0).map((value, index) => (index === bin ? weight : value));

const visualCandidate = (tag, index, warmth, luminance, hue, descriptionText) => {
  const digest = String(index % 10).repeat(64);
  return {
    ...candidate("scene", "transition", index),
    id: `scene-${tag}`,
    mediaLibraryId: `scene-${tag}`,
    cardId: `scene-card-${tag}`,
    cardRef: `data/scene-store.json#scene-card-${tag}`,
    cardTitle: `Scene ${tag}`,
    ownerId: `scene-card-${tag}`,
    ownerTitle: `Scene ${tag}`,
    title: `Scene ${tag}`,
    uri: `/media/scene-${tag}.mp4`,
    runtimeUri: `/media/scene-${tag}.mp4`,
    posterUri: "",
    sha256: digest,
    technicalIdentity: `sha256:${digest}`,
    visualPalette: {
      methodVersion: "local-median-cut-v1",
      swatches: [{ hex: "#c64322", share: 1 }],
      luminance,
      saturation: 0.5,
      hueHistogram: hue,
      warmth,
      chromaShare: 0.5,
      frameSource: "video-file",
    },
    visualDescription: { text: descriptionText, sourceClass: "local-vision" },
  };
};

test("visual telemetry computes description affinity and palette contrast", () => {
  const shot = {
    section_id: "chorus-1",
    section_type: "chorus",
    section_label: "Chorus 1",
    camera_motion: "pan-up",
    camera_focus: "center",
    transition: "cut",
    active_stems: ["Drums", "Bass"],
  };
  const warm = visualCandidate("warm", 61, 0.9, 0.3, hueBin(0), "A static portrait of a snowy mountain at night.");
  const cool = visualCandidate("cool", 62, -0.9, 0.7, hueBin(6), "A chorus of golden lights with a hard cut over the drums.");

  assert.equal(visualDescriptionAffinity({ title: "plain" }, shot), 0);
  // Context is {chorus, pan, center, cut, drums, bass} ("up" is a stopword);
  // the cool description hits chorus + cut + drums = 3/6.
  assert.equal(visualDescriptionAffinity(cool, shot), 0.5);
  assert.equal(visualDescriptionAffinity(warm, shot), 0);
  assert.equal(visualPaletteContrast(warm, null), 0);
  assert.equal(visualPaletteContrast(warm, warm), 0);
  const contrast = visualPaletteContrast(warm, cool);
  assert.ok(contrast > 0.5, `warm vs cool palette contrast should be strong, got ${contrast}`);
  assert.ok(contrast <= 1);
});

test("timed lyric context steers enriched visual selection and records measured evidence", () => {
  const mirror = visualCandidate("mirror", 63, 0.1, 0.5, hueBin(4), "A silver mirror catches rain while a hidden name appears.");
  const mountain = visualCandidate("mountain", 64, -0.2, 0.5, hueBin(7), "A mountain road crosses a bright desert at noon.");
  const shot = {
    shot_index: 0,
    section_id: "verse-1",
    section_type: "verse",
    start_sec: 0,
    end_sec: 4,
    media_id: "legacy",
    media_uri: "/media/legacy.mp4",
    transition: "cut",
    camera_motion: "static",
    active_stems: ["Vocals"],
    lyric_context: "The mirror knows my hidden name in the rain",
    lyric_line_ids: ["line-1"],
    lyric_context_source: "fixture-timed-lyrics",
  };
  assert.ok(lyricDescriptionAffinity(mirror, shot) > lyricDescriptionAffinity(mountain, shot));
  const variant = recastBalancedEchoDirectorProject({
    song_id: "lyric-visual-song",
    song_title: "Lyric Visual Song",
    duration: 4,
    timeline: [shot],
  }, [mirror, mountain], {
    variantId: "lyric-visual-test",
    allowedSourceGroups: ["scene"],
    sourcePattern: ["scene"],
    rotateSourcePattern: false,
    sharedUsageCounts: new Map(),
    seed: "lyric-visual-fixture",
    createdAt: "2026-09-16T00:00:00.000Z",
    parentProjectHash: "f".repeat(64),
  });
  assert.equal(variant.selectionEvidence[0].mediaId, "scene-mirror");
  assert.ok(variant.selectionEvidence[0].lyricAffinity > 0);
  assert.equal(variant.timeline[0].decision_evidence.lyricVisualAlignment.source, "fixture-timed-lyrics");
  assert.equal(variant.timeline[0].decision_evidence.lyricVisualAlignment.lineIds[0], "line-1");
  assert.ok(variant.timeline[0].decision_evidence.semanticMusicMatch.value > 0);
  assert.equal(variant.telemetry.lyricAffinitySelections, 1);
});

test("visual telemetry steers the balanced selection and records its evidence", () => {
  const warm = visualCandidate("warm", 61, 0.9, 0.3, hueBin(0), "A static portrait of a snowy mountain at night.");
  const cool = visualCandidate("cool", 62, -0.9, 0.7, hueBin(6), "A chorus of golden lights with a hard cut over the drums.");
  const project = {
    song_id: "visual-song",
    song_title: "Visual Song",
    duration: 8,
    timeline: [
      { shot_index: 0, section_id: "chorus-1", section_type: "chorus", section_label: "Chorus 1", start_sec: 0, end_sec: 4, media_id: "legacy-0", media_uri: "/media/legacy-0.mp4", transition: "cut", camera_motion: "pan-up", camera_focus: "center", active_stems: ["Drums", "Bass"] },
      { shot_index: 1, section_id: "chorus-2", section_type: "chorus", section_label: "Chorus 2", start_sec: 4, end_sec: 8, media_id: "legacy-1", media_uri: "/media/legacy-1.mp4", transition: "fade", camera_motion: "orbit", camera_focus: "center", active_stems: ["Drums", "Bass"] },
    ],
  };
  const options = {
    variantId: "visual-telemetry-test",
    allowedSourceGroups: ["scene"],
    sourcePattern: ["scene"],
    rotateSourcePattern: false,
    requireAllSourceGroups: true,
    sharedUsageCounts: new Map(),
    seed: "visual-telemetry-fixture",
    createdAt: "2026-08-22T12:00:00.000Z",
    parentProjectHash: "e".repeat(64),
  };
  const variant = recastBalancedEchoDirectorProject(project, [warm, cool], options);

  assert.equal(variant.selectionEvidence[0].mediaId, "scene-cool", "the description matching the chorus context must win the tied pool");
  assert.equal(variant.selectionEvidence[0].visualAffinity, 0.5);
  assert.equal(variant.selectionEvidence[0].paletteContrast, 0, "first shot has no previous palette");
  assert.equal(variant.selectionEvidence[1].mediaId, "scene-warm", "coverage ledger still rotates to the unused clip");
  assert.ok(variant.selectionEvidence[1].paletteContrast > 0.5, "warm follows cool with strong palette contrast");

  const evidence = variant.timeline[0].decision_evidence;
  assert.equal(evidence.visualContext.description.sourceClass, "local-vision");
  assert.equal(evidence.visualContext.descriptionAffinity, 0.5);
  assert.ok(evidence.visualContext.palette, "palette evidence is recorded on the shot");
  assert.equal(evidence.semanticMusicMatch.value, null, "telemetry never claims a semantic match");
  assert.equal(variant.telemetry.visualEnrichedCandidates, 2);
  assert.equal(variant.telemetry.visualContextSelections, 2);

  const rerun = recastBalancedEchoDirectorProject(project, [warm, cool], { ...options, sharedUsageCounts: new Map() });
  assert.deepEqual(rerun.selectionEvidence, variant.selectionEvidence, "visual telemetry keeps the pass deterministic");
});

test("balanced selection is byte-identical when candidates carry no visual telemetry", () => {
  const project = projectWithShots(6);
  const plain = [candidate("scene", "transition", 71), candidate("scene", "loop", 72)];
  const first = recastBalancedEchoDirectorProject(project, plain, {
    variantId: "no-visual-a",
    allowedSourceGroups: ["scene"],
    sourcePattern: ["scene"],
    rotateSourcePattern: false,
    requireAllSourceGroups: true,
    sharedUsageCounts: new Map(),
    seed: "no-visual-fixture",
    createdAt: "2026-08-22T12:00:00.000Z",
    parentProjectHash: "d".repeat(64),
  });
  assert.ok(first.selectionEvidence.every((selection) => selection.visualAffinity === 0));
  assert.ok(first.selectionEvidence.every((selection) => selection.visualContextAvailable === false));
  assert.ok(first.timeline.every((shot) => !("visualContext" in shot.decision_evidence)), "no visual evidence block without telemetry");
  const second = recastBalancedEchoDirectorProject(project, plain, {
    variantId: "no-visual-b",
    allowedSourceGroups: ["scene"],
    sourcePattern: ["scene"],
    rotateSourcePattern: false,
    requireAllSourceGroups: true,
    sharedUsageCounts: new Map(),
    seed: "no-visual-fixture",
    createdAt: "2026-08-22T12:00:00.000Z",
    parentProjectHash: "d".repeat(64),
  });
  assert.deepEqual(second.selectionEvidence.map((selection) => selection.technicalIdentity), first.selectionEvidence.map((selection) => selection.technicalIdentity));
  assert.deepEqual(second.timeline.map((shot) => shot.media_id), first.timeline.map((shot) => shot.media_id));
});
