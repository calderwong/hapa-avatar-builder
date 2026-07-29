import assert from "node:assert/strict";
import test from "node:test";
import {
  assignVibesTransitionJobsToSongs,
  buildVibesTransitionDirectorVariant,
  vibesTransitionBatchIdentity,
} from "../src/domain/vibes-transition-director-scripts.js";

function job(id, fromCardId, toCardId, sha = id.padEnd(64, "0").slice(0, 64)) {
  return {
    id: `vibes-transition:${id}`,
    linkId: `vibes-transition:${id}`,
    title: `${fromCardId} → ${toCardId}`,
    status: "ready",
    from: { cardId: fromCardId, cardTitle: "First", assetId: `${fromCardId}:image`, uri: "/media/first.png" },
    to: { cardId: toCardId, cardTitle: "Last", assetId: `${toCardId}:image`, uri: "/media/last.png" },
    provider: { id: "vibes.ai", outputUrl: `https://vibes.ai/content/${id}` },
    output: {
      mediaRecordId: `hapa-media:sha256:${sha}`,
      uri: `/media/vibes-transition-links/${id}.mp4`,
      sha256: sha,
      mimeType: "video/mp4",
      durationSeconds: 5,
      width: 624,
      height: 720,
      providerOutputUrl: `https://vibes.ai/content/${id}`,
    },
    completedAt: `2026-07-28T00:00:0${id.length}.000Z`,
  };
}

function project(songId = "dear-papa-song-alpha") {
  return {
    song_id: songId,
    timeline: Array.from({ length: 6 }, (_, index) => ({
      section_id: `section-${index}`,
      section_type: index === 0 ? "intro" : "verse",
      shot_index: index,
      start_sec: index * 4,
      end_sec: index * 4 + 4,
      transition: index ? "cut" : "fade-in",
      camera_motion: "static",
      camera_intensity: 1,
      camera_speed: 1,
      camera_focus: "center",
      active_stems: ["Master Mix"],
      audio_bindings: [],
      media_id: `legacy-${index}`,
      media_uri: `/media/legacy-${index}.mp4`,
      runtime_media_uri: `/media/legacy-${index}.mp4`,
      media_contract: {
        schemaVersion: "hapa.echo.playback-media.v2",
        type: "video",
        originalUri: `/media/legacy-${index}.mp4`,
        runtimeUri: `/media/legacy-${index}.mp4`,
      },
    })),
    visualizer_timeline: [],
  };
}

test("ready jobs follow embedded Echo song lineage and cue-card lineage", () => {
  const direct = job(
    "direct",
    "reference-card:echo-candidate:dear-papa-song-alpha:literal-title-phrase:alludes-to:dear-papa-song-beta",
    "reference:unmapped",
  );
  const cueMapped = job("cue", "reference:atlas-card", "reference:another-card");
  const fallback = job("fallback", "reference:no-song", "reference:still-no-song");
  const result = assignVibesTransitionJobsToSongs({ jobs: [direct, cueMapped, fallback] }, {
    projectSongIds: ["dear-papa-song-alpha", "dear-papa-song-beta", "dear-papa-song-wish-her-well"],
    directorScriptAlbums: [{
      scripts: [{
        songId: "dear-papa-song-beta",
        cues: [{ cardId: "reference:atlas-card" }],
      }],
    }],
  });

  assert.deepEqual(result.assignments.get("dear-papa-song-alpha").map((row) => row.id), [direct.id]);
  assert.deepEqual(result.assignments.get("dear-papa-song-beta").map((row) => row.id), [cueMapped.id]);
  assert.deepEqual(result.assignments.get("dear-papa-song-wish-her-well").map((row) => row.id), [fallback.id]);
  assert.deepEqual(result.fallbackJobIds, [fallback.id]);
  assert.deepEqual(result.unassignedJobIds, []);
});

test("batch identity is stable regardless of queue order", () => {
  const one = job("one", "reference:a", "reference:b", "1".repeat(64));
  const two = job("two", "reference:b", "reference:c", "2".repeat(64));
  assert.deepEqual(vibesTransitionBatchIdentity([one, two]), vibesTransitionBatchIdentity([two, one]));
});

test("a new Director Script inserts each assigned ready video once and preserves inherited direction", () => {
  const source = project();
  const jobs = [
    job("one", "reference:a", "reference:b", "1".repeat(64)),
    job("two", "reference:b", "reference:c", "2".repeat(64)),
  ];
  const sourceSnapshot = structuredClone(source);
  const batch = vibesTransitionBatchIdentity(jobs);
  const variant = buildVibesTransitionDirectorVariant(source, jobs, {
    batchIdentity: batch,
    parentProjectHash: "a".repeat(64),
    createdAt: "2026-07-28T00:00:00.000Z",
  });

  assert.deepEqual(source, sourceSnapshot);
  assert.equal(variant.id, batch.variantId);
  assert.equal(variant.parent.songId, source.song_id);
  assert.equal(variant.parent.immutableLegacyProject, true);
  assert.equal(variant.transitionLinks.length, 2);
  assert.equal(variant.telemetry.replacementShots, 2);
  assert.equal(new Set(variant.selectionEvidence.map((row) => row.jobId)).size, 2);
  assert.equal(variant.timeline.filter((shot) => shot.media_source_group === "vibes-transition-link").length, 2);
  for (const evidence of variant.selectionEvidence) {
    const before = source.timeline[evidence.shotIndex];
    const after = variant.timeline[evidence.shotIndex];
    assert.equal(after.start_sec, before.start_sec);
    assert.equal(after.end_sec, before.end_sec);
    assert.equal(after.transition, before.transition);
    assert.equal(after.camera_motion, before.camera_motion);
    assert.deepEqual(after.active_stems, before.active_stems);
    assert.equal(after.decision_evidence.truthStatus, "verified-vibes-transition-link");
    assert.match(after.media_uri, /vibes-transition-links/);
  }
  assert.equal(typeof variant.hyperframe_script, "string");
  assert.match(variant.hyperframe_script, /vibes-transition-links\/one\.mp4/);
  assert.match(variant.hyperframe_script, /vibes-transition-links\/two\.mp4/);
});
