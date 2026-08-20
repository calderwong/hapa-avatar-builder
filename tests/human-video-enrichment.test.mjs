import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  attachHumanEnrichmentToDirectorProject,
  createHumanVideoEnricherDashboard,
  createHumanVideoEnrichmentStore,
  humanVideoAliasKeys,
  humanVideoKey,
  upsertHumanVideoEnrichment,
} from "../src/domain/human-video-enrichment.js";
import { createSystemMediaDashboard } from "../src/domain/systemMedia.js";
import { openHumanVideoEnrichmentStore } from "../server/human-video-enrichment-store.mjs";
import { BUILDER_HOST_TARGETS } from "../src/overcard/hostTargets.js";

function fixtureMediaDashboard() {
  return createSystemMediaDashboard({
    mediaLibrary: {
      schemaVersion: "hapa.system-media-library.v1",
      records: [{
        id: "library-video-1",
        name: "Bella chorus take",
        mediaType: "video",
        uri: "/media/bella-chorus.mp4",
        sourcePath: "/source/bella-chorus.mp4",
        contentFingerprint: "sha256:chorus",
        width: 1920,
        height: 1080,
        duration: 12.5,
        tags: ["echo-state", "chorus"],
        relationships: [{ ownerType: "song", ownerId: "echo-1", ownerName: "Catch the Rabbit", role: "reference-video" }],
      }],
    },
    avatars: [{
      id: "bella",
      primaryName: "Bella",
      assets: [{ id: "bella-loop", name: "Bella loop", type: "video", uri: "/media/bella-loop.mp4", requirementId: "avatar_concept_video" }],
    }],
    tarotStore: {
      cards: [{ id: "tarot-1", title: "The Bridge", assets: [{ id: "tarot-loop", name: "Bridge loop", type: "video", uri: "/media/bridge.mp4", metadata: { tarotMediaRole: "loop_video" } }] }],
    },
    sceneGraph: {
      scenes: [{ id: "scene-1", title: "Echo Hall", assets: [{ id: "scene-loop", name: "Echo Hall move", type: "video", uri: "/media/echo-hall.mp4" }] }],
      places: [],
    },
    itemStore: {
      cards: [{ id: "item-1", title: "Camera Card", mediaAssets: [{ id: "item-loop", title: "Camera move", type: "video", uri: "/media/camera.mp4" }] }],
    },
    songStore: {
      songs: [{ id: "echo-1", title: "Catch the Rabbit", media: [{ id: "song-loop", name: "Song reference loop", type: "video", uri: "/media/song-reference.mp4", role: "reference-video" }] }],
    },
  });
}

test("Human Enricher aggregates every known system, Avatar, Tarot, scene, item, and song video with relationships", () => {
  const dashboard = createHumanVideoEnricherDashboard({
    mediaDashboard: fixtureMediaDashboard(),
    enrichmentStore: createHumanVideoEnrichmentStore(),
    avatars: [{ id: "bella", primaryName: "Bella" }],
    songs: [{ id: "echo-1", title: "Catch the Rabbit" }],
  });
  assert.equal(dashboard.summary.videos, 6);
  assert.equal(dashboard.summary.ungraded, 6);
  assert.deepEqual(dashboard.avatarOptions[0], { id: "bella", name: "Bella", mention: "@Bella" });
  assert.deepEqual(dashboard.songOptions[0], { id: "echo-1", title: "Catch the Rabbit", referenceType: "echo-song" });
  assert.ok(dashboard.videos.every((video) => video.humanVideoKey));
  assert.equal(dashboard.videos.find((video) => video.id === "library-video-1").relationships[0].ownerType, "song");
});

test("system media merges physical-video aliases across library and Scene records", () => {
  const dashboard = createSystemMediaDashboard({
    mediaLibrary: { records: [{
      id: "library-copy",
      name: "Library copy",
      mediaType: "video",
      uri: "/media/shared.mp4",
      contentFingerprint: "sha256:shared",
      relationships: [{ ownerType: "library", ownerId: "system-media" }],
    }] },
    sceneGraph: { scenes: [{
      id: "scene-1",
      title: "Scene One",
      assets: [{ id: "scene-copy", name: "Scene copy", type: "video", uri: "/media/shared.mp4" }],
    }] },
  });

  assert.equal(dashboard.records.length, 1);
  assert.equal(dashboard.records[0].contentFingerprint, "sha256:shared");
  assert.equal(dashboard.records[0].relationships.some(({ ownerType }) => ownerType === "scene"), true);
  assert.ok(dashboard.records[0].identityAliases.includes("uri:/media/shared.mp4"));
  assert.equal(humanVideoKey(dashboard.records[0]), "fingerprint:sha256:shared");
  assert.ok(humanVideoAliasKeys(dashboard.records[0]).includes("uri:/media/shared.mp4"));
});

test("system media merges long canonical asset IDs but refuses contradictory fingerprints", () => {
  const assetId = "asset-identity-12345678901234567890";
  const merged = createSystemMediaDashboard({
    avatars: [{ id: "avatar-1", assets: [{ id: assetId, type: "video", uri: "/media/avatar-copy.mp4" }] }],
    sceneGraph: { scenes: [{ id: "scene-1", assets: [{ id: assetId, type: "video", uri: "/media/scene-copy.mp4" }] }] },
  });
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].relationships.some(({ ownerType }) => ownerType === "avatar"), true);
  assert.equal(merged.records[0].relationships.some(({ ownerType }) => ownerType === "scene"), true);

  const conflicting = createSystemMediaDashboard({ mediaLibrary: { records: [
    { id: "one", mediaType: "video", uri: "/media/collision.mp4", contentFingerprint: "sha256:one" },
    { id: "two", mediaType: "video", uri: "/media/collision.mp4", contentFingerprint: "sha256:two" },
  ] } });
  assert.equal(conflicting.records.length, 2);
});

test("physical URI outranks a transient record ID when no fingerprint exists", () => {
  assert.equal(humanVideoKey({ id: "record-one", uri: "/media/same.mp4" }), "uri:/media/same.mp4");
});

test("human enrichment revisions Quality, @Avatar mentions, Director Notes, and references without mutating the source video", () => {
  const video = fixtureMediaDashboard().records.find((record) => record.id === "library-video-1");
  const original = structuredClone(video);
  const first = upsertHumanVideoEnrichment(createHumanVideoEnrichmentStore(), {
    key: humanVideoKey(video),
    videoId: video.id,
    videoName: video.name,
    videoIdentity: video,
    expectedRevision: 0,
    quality: 5,
    avatarMentions: [{ avatarId: "bella", avatarName: "Bella" }],
    directorNotes: "Hold on Bella through the last chorus.",
    references: [{ type: "echo-song", id: "echo-1", label: "Catch the Rabbit", notes: "Use after verse two." }],
  }, { now: "2026-08-03T12:00:00.000Z", actorId: "calder" });

  assert.deepEqual(video, original);
  assert.equal(first.record.quality.label, "Hero");
  assert.equal(first.record.avatarMentions[0].mention, "@Bella");
  assert.equal(first.record.directorNotes, "Hold on Bella through the last chorus.");
  assert.equal(first.record.references[0].type, "echo-song");
  assert.equal(first.record.revision, 1);

  assert.throws(() => upsertHumanVideoEnrichment(first.store, {
    key: first.record.key,
    expectedRevision: 0,
    quality: 4,
  }), (error) => error.code === "human_enrichment_revision_conflict" && error.statusCode === 409);
});

test("Echo State director shots receive matching human enrichment by media URI", () => {
  const video = fixtureMediaDashboard().records.find((record) => record.id === "library-video-1");
  const { store } = upsertHumanVideoEnrichment(createHumanVideoEnrichmentStore(), {
    key: humanVideoKey(video),
    videoId: video.id,
    videoIdentity: video,
    quality: 4,
    avatarMentions: ["@Bella"],
    directorNotes: "Prefer the imperfect handheld take.",
    references: [{ type: "echo-song", id: "echo-1", label: "Catch the Rabbit" }],
  }, { now: "2026-08-03T12:00:00.000Z", actorId: "calder" });

  const project = attachHumanEnrichmentToDirectorProject({
    song_id: "echo-1",
    timeline: [{ id: "shot-1", media_uri: "/media/bella-chorus.mp4" }, { id: "shot-2", media_uri: "/media/other.mp4" }],
  }, store);
  assert.equal(project.timeline[0].human_enrichment.quality.value, 4);
  assert.equal(project.timeline[0].human_enrichment.directorNotes, "Prefer the imperfect handheld take.");
  assert.equal(project.timeline[1].human_enrichment, undefined);
  assert.equal(project.director_human_enrichment.matchedShots, 1);
  assert.equal(project.director_human_enrichment.availableRecords, 1);
});

test("human enrichment service writes a revisioned current store and append-only event receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-human-enricher-"));
  const filePath = path.join(root, "human-video-enrichments.json");
  const eventPath = path.join(root, "human-video-enrichment-events.ndjson");
  const service = openHumanVideoEnrichmentStore({ filePath, eventPath, clock: () => "2026-08-03T12:00:00.000Z" });
  const result = await service.update({
    key: "record:video-1",
    videoId: "video-1",
    videoIdentity: { recordId: "video-1", uri: "/media/video-1.mp4" },
    expectedRevision: 0,
    quality: 3,
    directorNotes: "Usable bridge shot.",
  }, { actorId: "calder" });
  assert.equal(result.record.revision, 1);
  assert.equal((await service.read()).records[0].quality.label, "Usable");
  const event = JSON.parse((await readFile(eventPath, "utf8")).trim());
  assert.equal(event.action, "human-video-enrichment.updated");
  assert.equal(event.authority, "human-direction-only");
});

test("Human Enricher is registered as a top-level Builder host and its UI uses parity endpoints", async () => {
  const target = BUILDER_HOST_TARGETS.find((entry) => entry.route === "human-enricher");
  assert.equal(target.label, "Human Enricher");
  assert.ok(target.slots[0].accepts.includes("media"));
  const source = await readFile(new URL("../src/components/HumanEnricherView.jsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/human-enricher\/videos/);
  assert.match(source, /\/api\/human-enricher\/records/);
  assert.match(source, /human_enrichment\.directorNotes/);
  assert.match(source, /Choose @Avatar/);
});
