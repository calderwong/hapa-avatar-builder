import test from "node:test";
import assert from "node:assert/strict";
import {
  addPlaylistTrack,
  attachSceneMedia,
  auditSceneGraph,
  createPlace,
  createScene,
  createSceneAttachPack,
  createSceneGraphScaffold,
  detachSceneMedia,
  normalizeSceneGraph,
  setSceneTimeline,
  tagAvatarInScene,
  tagAvatarInSceneMedia,
  updatePlace,
  updateScene
} from "../src/domain/scene.js";

test("scene graph scaffold creates a place, scene, timeline, and media slots", () => {
  const graph = createSceneGraphScaffold();
  assert.equal(graph.schemaVersion, "hapa.scene-graph.v1");
  assert.equal(graph.places.length, 1);
  assert.equal(graph.scenes.length, 1);
  assert.equal(graph.episodes.length, 1);
  assert.equal(graph.volumes.length, 1);
  assert.equal(graph.timelines.length, 1);
  assert.equal(graph.scenes[0].mediaSlots.length, 15);
  assert.equal(graph.places[0].placeCard.schemaVersion, "hapa.place-card.v1");
});

test("places and scenes can be defined and layered on the canonical timeline", () => {
  let graph = createSceneGraphScaffold();
  graph = createPlace(graph, {
    name: "Neon Harbor",
    type: "city",
    summary: "Rain-lit dock city.",
    lore: "A place where team arrivals become canon.",
    visualDescription: "Wet black docks, reflected signage, and cargo lights.",
    imagePrompt: "Wide shot of a rain-lit neon harbor used for Hapa team arrivals."
  });
  const place = graph.places[0];
  graph = updatePlace(graph, place.id, { tags: ["place", "harbor", "night"] });
  graph = createScene(graph, {
    placeId: place.id,
    title: "Dock Arrival",
    order: 12,
    label: "Beat 012",
    quickPitch: "The team arrives and learns why place cards matter.",
    overallNarrative: "The scene ties place canon to avatar motivation.",
    productionPrompt: "Comic panel of avatars stepping onto wet black docks under neon signs.",
    learningObjectives: ["place cards"],
    hapaMechanics: ["scene canon"],
    managementSkills: ["handoff"],
    aesthetic: {
      mood: "rain-lit",
      palette: "black cyan gold"
    }
  });
  const scene = graph.scenes[0];
  graph = updateScene(graph, scene.id, { summary: "The team reaches the harbor under red signage." });
  graph = setSceneTimeline(graph, scene.id, { order: 13, startsAt: "2041-05-20T22:10:00-07:00", duration: "00:04:30" });

  const updatedScene = graph.scenes.find((item) => item.id === scene.id);
  const updatedPlace = graph.places.find((item) => item.id === place.id);
  assert.equal(updatedScene.placeId, place.id);
  assert.equal(updatedScene.canonicalTime.order, 13);
  assert.equal(updatedScene.canonicalTime.label, "Beat 012");
  assert.equal(updatedScene.summary.includes("harbor"), true);
  assert.equal(updatedScene.quickPitch.includes("place cards"), true);
  assert.equal(updatedScene.learningObjectives[0], "place cards");
  assert.equal(updatedScene.aesthetic.mood, "rain-lit");
  assert.equal(updatedPlace.placeCard.imagePrompt.includes("neon harbor"), true);
  assert.equal(updatedPlace.sceneIds.includes(scene.id), true);
});

test("scene media attaches to standard slots, overfills when full, and cleans up on delete", () => {
  let graph = createSceneGraphScaffold();
  const sceneId = graph.scenes[0].id;
  for (let index = 0; index < 5; index += 1) {
    graph = attachSceneMedia(graph, sceneId, {
      id: `scene-image-${index}`,
      name: `scene-image-${index}.png`,
      uri: `/media/scene-image-${index}.png`,
      type: "image",
      requirementId: "scene_images",
      tags: ["scene", "reference"]
    });
  }
  const scene = graph.scenes[0];
  const imageSlots = scene.mediaSlots.filter((slot) => slot.requirementId === "scene_images");
  const audit = auditSceneGraph(graph).byScene[0];
  const overfillSlot = imageSlots.find((slot) => slot.required === false);
  const overfillAsset = scene.assets.find((asset) => asset.id === "scene-image-4");

  assert.equal(imageSlots.filter((slot) => slot.assetId).length, 5);
  assert.equal(audit.overfill, 1);
  assert.equal(overfillSlot.assetId, "scene-image-4");
  assert.equal(overfillAsset.name, "scene-images-5");
  assert.equal(overfillAsset.metadata.originalFileName, "scene-image-4.png");

  const cleaned = detachSceneMedia(graph, sceneId, "scene-image-4");
  const cleanedScene = cleaned.scenes[0];
  assert.equal(cleanedScene.mediaSlots.some((slot) => slot.required === false && !slot.assetId), false);
  assert.equal(auditSceneGraph(cleaned).byScene[0].overfill, 0);
});

test("normalization re-slots orphaned scene image assets after a partial UI attach", () => {
  const graph = createSceneGraphScaffold();
  const scene = graph.scenes[0];
  const firstImageSlot = scene.mediaSlots.find((slot) => slot.requirementId === "scene_images");
  scene.assets = Array.from({ length: 4 }, (_, index) => ({
    id: `orphan-scene-image-${index + 1}`,
    name: `uploaded-scene-image-${index + 1}.png`,
    uri: `/media/uploaded-scene-image-${index + 1}.png`,
    type: "image",
    requirementId: "scene_images",
    tags: ["scene", "reference"],
    metadata: {
      sceneRequirementId: "scene_images",
      originalFileName: `uploaded-scene-image-${index + 1}.png`
    }
  }));
  firstImageSlot.assetId = scene.assets[0].id;

  const normalized = normalizeSceneGraph(graph);
  const normalizedScene = normalized.scenes[0];
  const filledImageSlots = normalizedScene.mediaSlots
    .filter((slot) => slot.requirementId === "scene_images" && slot.assetId);

  assert.equal(filledImageSlots.length, 4);
  assert.deepEqual(
    normalizedScene.assets.filter((asset) => asset.requirementId === "scene_images").map((asset) => asset.name),
    ["scene-images-1", "scene-images-2", "scene-images-3", "scene-images-4"]
  );
});

test("normalization clears stale scene slots before reconciling visible media", () => {
  const graph = createSceneGraphScaffold();
  const scene = graph.scenes[0];
  const imageSlots = scene.mediaSlots.filter((slot) => slot.requirementId === "scene_images");
  scene.assets = [
    {
      id: "scene-visible-a",
      name: "visible-a.png",
      uri: "/media/visible-a.png",
      type: "image",
      requirementId: "scene_images",
      metadata: { sceneRequirementId: "scene_images" }
    },
    {
      id: "scene-visible-b",
      name: "visible-b.png",
      uri: "/media/visible-b.png",
      type: "image",
      requirementId: "scene_images",
      metadata: { sceneRequirementId: "scene_images" }
    }
  ];
  imageSlots[0].assetId = "scene-visible-a";
  imageSlots[1].assetId = "deleted-scene-asset";
  imageSlots[2].assetId = "scene-visible-a";

  const normalized = normalizeSceneGraph(graph);
  const normalizedScene = normalized.scenes[0];
  const filledImageSlots = normalizedScene.mediaSlots
    .filter((slot) => slot.requirementId === "scene_images" && slot.assetId);

  assert.equal(filledImageSlots.length, 2);
  assert.deepEqual(filledImageSlots.map((slot) => slot.assetId), ["scene-visible-a", "scene-visible-b"]);
});

test("avatars can be tagged in scenes and in specific scene media", () => {
  let graph = createSceneGraphScaffold();
  const sceneId = graph.scenes[0].id;
  graph = tagAvatarInScene(graph, sceneId, "red-reaper", {
    role: "lead",
    presence: "onscreen",
    tags: ["arrives", "armed"]
  });
  graph = attachSceneMedia(graph, sceneId, {
    id: "panel-1",
    name: "panel-1.png",
    uri: "/media/panel-1.png",
    type: "image",
    requirementId: "scene_comics",
    tags: ["comic", "panel"]
  });
  graph = tagAvatarInSceneMedia(graph, sceneId, "panel-1", "red-reaper", {
    role: "foreground",
    tags: ["visible", "speaking"]
  });

  const scene = graph.scenes[0];
  const asset = scene.assets.find((item) => item.id === "panel-1");
  assert.equal(scene.avatarTags[0].avatarId, "red-reaper");
  assert.equal(scene.avatarTags[0].role, "lead");
  assert.equal(asset.metadata.avatarTags[0].avatarId, "red-reaper");
  assert.equal(asset.metadata.avatarTags[0].role, "foreground");
});

test("playlists and scene attach packs expose place, timeline, avatars, media, and songs", () => {
  let graph = createSceneGraphScaffold();
  const sceneId = graph.scenes[0].id;
  graph = tagAvatarInScene(graph, sceneId, "red-reaper", { role: "lead" });
  graph = attachSceneMedia(graph, sceneId, {
    id: "scene-video-1",
    name: "scene-video-1.mp4",
    uri: "/media/scene-video-1.mp4",
    type: "video",
    requirementId: "scene_videos",
    tags: ["scene", "motion"]
  });
  graph = addPlaylistTrack(graph, sceneId, {
    title: "After Midnight Signal",
    artist: "Hapa Audio Lab",
    mood: "tense",
    uri: "hapa://music/after-midnight-signal"
  });

  const pack = createSceneAttachPack(graph, sceneId);
  assert.equal(pack.schemaVersion, "hapa.scene-attach-pack.v1");
  assert.equal(pack.sceneId, sceneId);
  assert.equal(pack.place.name, "Unassigned Place");
  assert.equal(pack.placeCard.schemaVersion, "hapa.place-card.v1");
  assert.equal(pack.episode.title, "Episode Scaffold 1");
  assert.equal(pack.volume.title, "Volume Scaffold 1");
  assert.equal(pack.timeline.name, "Canonical Timeline");
  assert.equal(pack.avatarTags[0].avatarId, "red-reaper");
  assert.equal(pack.mediaReferences[0].role, "scene_videos");
  assert.equal(pack.playlist[0].title, "After Midnight Signal");
  assert.equal(auditSceneGraph(normalizeSceneGraph(graph)).episodes, 1);
  assert.equal(auditSceneGraph(normalizeSceneGraph(graph)).volumes, 1);
  assert.equal(auditSceneGraph(normalizeSceneGraph(graph)).placeCards, 1);
  assert.equal(auditSceneGraph(normalizeSceneGraph(graph)).playlistTracks, 1);
});
