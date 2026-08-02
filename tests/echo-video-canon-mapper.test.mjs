import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectedVideoSynopsis,
  buildEchoVideoCanonMapping,
  matchVideoReferences,
  matchVideoCharacters,
  normalizeVisionObservations,
} from "../src/domain/echo-video-canon-mapper.js";

const media = {
  id: "hapa-media:sha256:fixture",
  uri: "/media/fixture.mp4",
  width: 1080,
  height: 1080,
  tags: ["motif:memory", "garden"],
  provenance: { songId: "song-memory-garden" },
};

const observations = {
  frames: [
    {
      role: "first",
      frameId: "frame:first",
      confidence: 0.92,
      description: "Red Archivist holds a glowing memory card in a neon garden.",
      characters: ["Red Archivist"],
      objects: ["memory card"],
      settings: ["neon garden"],
      actions: ["holds"],
      palette: ["cyan", "magenta"],
      lighting: ["golden glow"],
      shotType: "medium shot",
    },
    {
      role: "middle",
      frameId: "frame:middle",
      confidence: 0.9,
      description: "Red Archivist opens the memory card and a constellation doorway appears.",
      characters: ["Red Archivist"],
      objects: ["memory card", "constellation doorway"],
      actions: ["opens"],
      motion: ["rising particles"],
      cameraMotion: ["push in"],
    },
    {
      role: "last",
      frameId: "frame:last",
      confidence: 0.91,
      description: "The constellation doorway resolves into a sovereign archive beyond the garden.",
      objects: ["constellation doorway"],
      settings: ["sovereign archive"],
      actions: ["resolves"],
      lighting: ["celestial light"],
    },
  ],
};

const exactAvatar = {
  id: "avatar-red",
  primaryName: "Red Archivist",
  canonStatus: "builder-identity",
  assets: [{ id: media.id, uri: media.uri }],
};

const appearanceOnlyAvatar = {
  id: "avatar-red-lookalike",
  primaryName: "Red Archivist",
  canonStatus: "candidate",
};

const referenceCard = {
  id: "reference:memory-door",
  revisionId: "reference:memory-door:r2",
  title: "Memory Door",
  status: "proposed",
  reviewStatus: "pending-review",
  summary: "A glowing card opens a constellation doorway into a memory archive.",
  mechanics: ["card opens doorway"],
  visualMotifs: ["constellation doorway", "memory card"],
  evidence: { evidenceClass: "interpretive" },
  rights: { licenseStatus: "reference-only" },
  caveats: ["Interpretation does not establish authorial intent."],
};

const animatedReference = {
  card: { id: referenceCard.id, revisionId: referenceCard.revisionId, title: referenceCard.title },
  artifacts: { loopVideo: { id: media.id, uri: media.uri } },
  custody: { reviewStatus: "approved" },
};

const song = {
  id: "song-memory-garden",
  title: "Memory Garden",
  lyricTimings: [{ id: "line-1", start: 0, end: 4, text: "Open the memory card inside the garden" }],
  storyBeats: [{ id: "beat-1", summary: "The constellation doorway resolves into the archive." }],
  referenceConnectors: [{ id: "connector-1", referenceId: referenceCard.id, target: { lyricText: "Open the memory card" } }],
};

test("normalizes exactly three observations and writes a directed synopsis with evidence-bearing tags", () => {
  const frames = normalizeVisionObservations(observations, media);
  assert.deepEqual(frames.map((frame) => frame.role), ["first", "middle", "last"]);
  const directed = buildDirectedVideoSynopsis({ media, observations });
  assert.match(directed.synopsis, /^First:/u);
  assert.match(directed.synopsis, /Middle:/u);
  assert.match(directed.synopsis, /Last:/u);
  assert.deepEqual(directed.evidenceFrameIds, ["frame:first", "frame:middle", "frame:last"]);
});

test("exact attached identity outranks and remains distinct from an appearance candidate", () => {
  const frames = normalizeVisionObservations(observations, media);
  const matches = matchVideoCharacters({ media, frames, avatars: [appearanceOnlyAvatar, exactAvatar] });
  assert.equal(matches[0].avatarId, exactAvatar.id);
  assert.equal(matches[0].matchClass, "exact-media-attachment");
  assert.equal(matches[0].truthStatus, "exact-relationship-not-visual-identity-proof");
  assert.equal(matches[0].canonPromoted, false);
  const inferred = matches.find((match) => match.avatarId === appearanceOnlyAvatar.id);
  assert.equal(inferred.matchClass, "appearance-candidate");
  assert.equal(inferred.canonPromoted, false);
});

test("full mapping preserves Reference evidence and never promotes interpretation to canon", () => {
  const mapping = buildEchoVideoCanonMapping({
    media,
    observations,
    referenceCards: [referenceCard],
    animatedReferences: [animatedReference],
    songs: [song],
    avatars: [exactAvatar, appearanceOnlyAvatar],
  });
  assert.equal(mapping.schemaVersion, "hapa.echo.video-canon-mapping.v1");
  assert.equal(mapping.referenceMatches[0].cardId, referenceCard.id);
  assert.equal(mapping.referenceMatches[0].revisionId, referenceCard.revisionId);
  assert.equal(mapping.referenceMatches[0].canonPromoted, false);
  assert.equal(mapping.referenceMatches[0].mappingCanonStatus, "reference-interpretation-not-promoted");
  assert.equal(mapping.referenceMatches[0].rights.licenseStatus, "reference-only");
  assert.match(mapping.referenceMatches[0].translationTruth.imageryCopyStatus, /review-required|no-imagery-copy-claim/u);
  assert.equal(mapping.truthBoundary.referenceInterpretation, "never-promoted-to-canon");
});

test("Reference visual affinity cites the frame even when matched tokens fall beyond the compact frame-token window", () => {
  const leadingTokens = Array.from({ length: 80 }, (_, index) => `x${String(index).padStart(2, "0")}`).join(" ");
  const matches = matchVideoReferences({
    media,
    observations: {
      frames: [{
        role: "first",
        frameId: "frame:late-reference",
        description: `${leadingTokens} nebula lantern passage`,
      }],
    },
    referenceCards: [{
      id: "reference:nebula-lantern-passage",
      title: "Nebula Lantern Passage",
      summary: "A nebula lantern reveals a passage.",
      visualMotifs: ["nebula", "lantern", "passage"],
    }],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].truthStatus, "textual-visual-affinity-pending-review");
  assert.deepEqual(matches[0].supportingFrameIds, ["frame:late-reference"]);
});

test("song context is explicit/cited and all seven source-independent quality inputs are present", () => {
  const mapping = buildEchoVideoCanonMapping({
    media,
    observations,
    referenceCards: [referenceCard],
    animatedReferences: [animatedReference],
    songs: [song],
    avatars: [exactAvatar],
  });
  const songMatch = mapping.songStoryCandidates.find((candidate) => candidate.songId === song.id);
  assert.equal(songMatch.matchClass, "exact-song-relationship");
  assert.ok(songMatch.lyricCitations.some((citation) => citation.id === "line-1"));
  assert.ok(songMatch.storyCitations.some((citation) => citation.id === "beat-1"));
  assert.equal(songMatch.canonPromoted, false);
  assert.deepEqual(Object.keys(mapping.intrinsicQualityInputs).sort(), [
    "characterCanonIntegrity",
    "compositionEditorialUtility",
    "hapaAestheticWorldAlignment",
    "libraryDistinctiveness",
    "narrativeSemanticLegibility",
    "temporalCoherenceMotionQuality",
    "visualCraftTechnicalFidelity",
  ]);
  assert.equal(mapping.quality.sourceIndependent, true);
  assert.ok(mapping.tags.some((tag) => tag.tag === "motif:memory"));
});

test("missing frames stay explicit instead of inventing observations", () => {
  const mapping = buildEchoVideoCanonMapping({ media, observations: { first: observations.frames[0] } });
  assert.deepEqual(mapping.frames.map((frame) => frame.status), ["vision-observed", "missing", "missing"]);
  assert.match(mapping.synopsis, /No middle-frame Vision evidence/u);
  assert.match(mapping.synopsis, /No last-frame Vision evidence/u);
});

test("preserves recognition quality metrics and does not treat the Hapa word artifact as a defect", () => {
  const measured = {
    frames: observations.frames.map((frame, index) => ({
      ...frame,
      sharpness: 0.8 - index * 0.1,
      temporalCoherence: 0.75,
      composition: 0.9,
    })),
  };
  const frames = normalizeVisionObservations(measured, media);
  assert.equal(frames[0].metrics.sharpness, 0.8);
  assert.equal(frames[1].metrics.temporalCoherence, 0.75);
  const baseline = buildEchoVideoCanonMapping({ media, observations: measured });
  const withArtifactMotif = buildEchoVideoCanonMapping({
    media,
    observations: {
      frames: measured.frames.map((frame) => ({ ...frame, description: `${frame.description} Hapa artifact.` })),
    },
  });
  assert.equal(
    withArtifactMotif.intrinsicQualityInputs.visualCraftTechnicalFidelity.score,
    baseline.intrinsicQualityInputs.visualCraftTechnicalFidelity.score,
  );
  const withFrozenWater = buildEchoVideoCanonMapping({
    media,
    observations: {
      frames: measured.frames.map((frame) => ({ ...frame, description: `${frame.description} Frozen water surrounds the archive.` })),
    },
  });
  assert.equal(
    withFrozenWater.intrinsicQualityInputs.visualCraftTechnicalFidelity.score,
    baseline.intrinsicQualityInputs.visualCraftTechnicalFidelity.score,
  );
  assert.equal(
    withFrozenWater.intrinsicQualityInputs.temporalCoherenceMotionQuality.score,
    baseline.intrinsicQualityInputs.temporalCoherenceMotionQuality.score,
  );
});
