import assert from "node:assert/strict";
import test from "node:test";

import {
  ECHO_RECORD_GARDEN_SCHEMA,
  ECHO_RECORD_SOURCE_COVERAGE_SCHEMA,
  buildEchoRecordVisualSurfaces,
  normalizeEchoRecordProject,
  normalizeEchoRecordSourceCoverage,
  normalizeEchoRecordSummaryRows,
} from "../src/domain/echo-record-garden.js";

function project(overrides = {}) {
  return {
    song_id: "source-song-a",
    song_title: "Same Sunday",
    duration: 10,
    timeline: [],
    provenance: {
      status: "source_aligned",
      revisionId: "director-revision:a",
      contentHash: "sha256:director-a",
    },
    ...overrides,
  };
}

test("explicit instrumental truth does not turn missing lyrics into a vocal-data error", () => {
  const record = normalizeEchoRecordProject(project({
    instrumental: true,
    timed_lyrics: [],
    audio_id: "instrumental-master",
    audio_uri: "/audio/instrumental-master.wav",
    rightsAndPrivacy: {
      licenseStatus: "reference-only",
      consentStatus: "not-applicable",
      visibility: "private",
      publicProjectionAllowed: false,
      attribution: ["Source artist retains ownership"],
    },
  }));

  assert.equal(record.schemaVersion, ECHO_RECORD_GARDEN_SCHEMA);
  assert.equal(record.content.vocalMode, "instrumental");
  assert.equal(record.content.vocalModeTruth, "source-declared");
  assert.equal(record.content.timedLyricCueCount, 0);
  assert.equal(record.content.lyricAvailability, "not-applicable-instrumental");
  assert.equal(record.audio.availability, "routable");
  assert.equal(record.rights.status, "source-declared");
  assert.equal(record.rights.licenseStatus, "reference-only");
  assert.equal(record.rights.publicProjectionAllowed, false);
  assert.equal(record.rights.ownershipClaimed, false);
  assert.deepEqual(record.rights.attribution, ["Source artist retains ownership"]);
});

test("undeclared vocals stay unspecified instead of being inferred as instrumental", () => {
  const record = normalizeEchoRecordProject(project({
    timed_lyrics: [],
    audio_uri: "/audio/no-vocal-metadata.wav",
  }));

  assert.equal(record.content.vocalMode, "unspecified");
  assert.equal(record.content.vocalModeTruth, "missing");
  assert.equal(record.content.lyricAvailability, "missing-or-undeclared");
});

test("missing audio, video, and Reference media remain separate explicit degraded states", () => {
  const degraded = project({
    audio_id: "",
    audio_uri: "",
    timeline: [{
      id: "shot-without-media",
      start_sec: 0,
      end_sec: 10,
      media_id: "missing-video",
      media_uri: "",
    }],
  });
  const missingAll = normalizeEchoRecordSourceCoverage({
    project: degraded,
    referenceCards: [],
  });

  assert.equal(missingAll.schemaVersion, ECHO_RECORD_SOURCE_COVERAGE_SCHEMA);
  assert.equal(missingAll.audio.state, "missing");
  assert.deepEqual(missingAll.video, {
    declaredCount: 1,
    validTimingCount: 1,
    routableCount: 0,
    state: "missing-media",
  });
  assert.deepEqual(missingAll.references, {
    providedCount: 0,
    matchingCount: 0,
    routableCount: 0,
    state: "missing",
  });
  assert.equal(missingAll.attachments.state, "missing");

  const missingReferenceMedia = normalizeEchoRecordSourceCoverage({
    project: degraded,
    referenceCards: [{
      id: "tarot-reference:missing-image",
      referenceCardId: "reference:missing-image",
      title: "Declared but unavailable",
      occurrences: [{ songId: "source-song-a" }],
    }],
  });
  assert.deepEqual(missingReferenceMedia.references, {
    providedCount: 1,
    matchingCount: 1,
    routableCount: 0,
    state: "missing-media",
  });
  assert.deepEqual(
    buildEchoRecordVisualSurfaces({
      project: degraded,
      referenceCards: [{ id: "reference-without-media", title: "No visual" }],
    }),
    [],
    "missing media must not become an interactive placeholder surface",
  );

  const summaryOnly = normalizeEchoRecordSourceCoverage({
    project: {
      music_video_project: {
        song_id: "summary-song",
        song_title: "Summary only",
        timeline_count: 3,
      },
    },
  });
  assert.equal(summaryOnly.video.declaredCount, 3);
  assert.equal(summaryOnly.video.state, "summary-count-only");
  assert.equal(summaryOnly.attachments.state, "unknown-summary-only");
});

test("duplicate display titles never collapse or redefine exact song identity", () => {
  const rows = normalizeEchoRecordSummaryRows([
    { music_video_project: project({ song_id: "source-song-a", song_title: "Same Sunday" }) },
    { music_video_project: project({ song_id: "source-song-b", song_title: "Same Sunday" }) },
  ]);

  assert.deepEqual(rows.map((record) => record.id), [
    "echo-record:source-song-a",
    "echo-record:source-song-b",
  ]);
  assert.deepEqual(rows.map((record) => record.identity.sourceId), [
    "source-song-a",
    "source-song-b",
  ]);
  assert.ok(rows.every((record) => record.identity.identityBasis === "source-song-id"));
  assert.ok(rows.every((record) => record.identity.titleIsIdentity === false));

  const renamed = normalizeEchoRecordProject(project({
    song_id: "source-song-a",
    song_title: "A Renamed Sunday",
  }));
  assert.equal(renamed.identity.stableId, "echo-record:source-song-a");
  assert.equal(renamed.id, rows[0].id);
});

test("stale attachment evidence is exposed without laundering the old Card id", () => {
  const staleProject = project({
    timeline: [{
      id: "stale-shot",
      start_sec: 0,
      end_sec: 10,
      media_id: "video-stale",
      media_uri: "/media/stale.mp4",
      media_card_id: "card-old",
      media_card_ref: "/cards/card-old.json",
      decision_evidence: {
        truthStatus: "stale",
        sourceEvidence: {
          card: { id: "card-current", ref: "/cards/card-current.json" },
        },
      },
    }],
  });
  const coverage = normalizeEchoRecordSourceCoverage({ project: staleProject });
  const [identity] = coverage.attachments.identities;

  assert.equal(coverage.attachments.state, "stale");
  assert.equal(coverage.attachments.staleCount, 1);
  assert.deepEqual(identity, {
    shotId: "stale-shot",
    cardId: "card-old",
    lookupId: "card-old",
    freshnessStatus: "stale",
    evidenceCardId: "card-current",
  });

  const surface = buildEchoRecordVisualSurfaces({
    project: staleProject,
    clockSeconds: 1,
    limit: 1,
  })[0];
  assert.equal(surface.source.id, "stale-shot");
  assert.equal(surface.source.identityStatus, "source-declared");
  assert.equal(surface.truth.status, "stale");
  assert.equal(surface.attachment.cardId, "card-old");
  assert.equal(surface.attachment.lookupId, "card-old");
  assert.equal(surface.attachment.identityStatus, "stale-source-card-id");
  assert.equal(surface.attachment.freshnessStatus, "stale");
  assert.equal(surface.attachment.stale, true);
});

test("Reference surface IDs and attachment IDs remain exact across ordering and duplicate titles", () => {
  const references = [
    {
      id: "tarot-reference:first",
      referenceCardId: "reference:first",
      title: "Repeated motif",
      imageUri: "/references/first.jpg",
      occurrences: [{ songId: "source-song-a" }],
      rightsAndPrivacy: {
        visibility: "private",
        licenseStatus: "reference-only",
        publicProjectionAllowed: false,
      },
    },
    {
      id: "tarot-reference:second",
      referenceCardId: "reference:second",
      title: "Repeated motif",
      imageUri: "/references/second.jpg",
      occurrences: [{ songId: "source-song-a" }],
    },
  ];
  const firstOrder = buildEchoRecordVisualSurfaces({
    project: project(),
    referenceCards: references,
  });
  const reverseOrder = buildEchoRecordVisualSurfaces({
    project: project(),
    referenceCards: [...references].reverse(),
  });
  const identities = (surfaces) => Object.fromEntries(surfaces.map((surface) => [
    surface.sourceId,
    {
      id: surface.id,
      cardId: surface.attachment.cardId,
      embeddedId: surface.attachment.card?.id,
    },
  ]));

  assert.deepEqual(identities(firstOrder), identities(reverseOrder));
  assert.deepEqual(identities(firstOrder), {
    "reference:first": {
      id: "echo-surface:source-song-a:reference:reference-first",
      cardId: "tarot-reference:first",
      embeddedId: "tarot-reference:first",
    },
    "reference:second": {
      id: "echo-surface:source-song-a:reference:reference-second",
      cardId: "tarot-reference:second",
      embeddedId: "tarot-reference:second",
    },
  });
  const first = firstOrder.find((surface) => surface.sourceId === "reference:first");
  assert.equal(first.rights.licenseStatus, "reference-only");
  assert.equal(first.rights.publicProjectionAllowed, false);
  assert.equal(first.rights.ownershipClaimed, false);
});

test("name-matched Avatar relationships remain inferred even when the source Card id is exact", () => {
  const surfaces = buildEchoRecordVisualSurfaces({
    project: project({
      avatar_name: "Blue",
      perspective: "Blue",
    }),
    avatars: [{
      id: "avatar-blue",
      primaryName: "Blue",
      assets: [{
        id: "blue-portrait",
        type: "image",
        uri: "/avatars/blue.png",
        requirementId: "character_dossier",
        processing: { attachedToCard: true },
      }],
    }],
  });
  const character = surfaces.find((surface) => surface.role === "character");

  assert.ok(character);
  assert.equal(character.source.id, "avatar-blue");
  assert.equal(character.attachment.cardId, "avatar-blue");
  assert.equal(character.truth.status, "inferred");
  assert.equal(character.truth.relationship, "project-avatar-name-match");
  assert.match(character.truth.label, /review relationship/i);
  assert.notEqual(character.truth.status, "verified");
});
