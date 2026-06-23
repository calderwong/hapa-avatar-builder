import { createMediaAsset, inferAssetKind, slugify } from "./avatar.js";

export const SCENE_GRAPH_VERSION = "hapa.scene-graph.v1";
export const SCENE_ATTACH_PACK_VERSION = "hapa.scene-attach-pack.v1";

export const SCENE_MEDIA_REQUIREMENTS = [
  {
    id: "scene_space_3d",
    label: "3D Scene Space",
    shortLabel: "3D Space",
    accent: "cyan",
    required: 1,
    accepts: ["model"],
    defaultTags: ["place", "scene-space", "3d", "scale", "blocking"]
  },
  {
    id: "scene_images",
    label: "Scene Images",
    shortLabel: "Images",
    accent: "violet",
    required: 4,
    accepts: ["image"],
    defaultTags: ["scene", "reference", "still", "composition"]
  },
  {
    id: "scene_videos",
    label: "Scene Videos",
    shortLabel: "Videos",
    accent: "orange",
    required: 4,
    accepts: ["video"],
    defaultTags: ["scene", "motion", "clip", "route"]
  },
  {
    id: "scene_comics",
    label: "Scene Comics",
    shortLabel: "Comics",
    accent: "gold",
    required: 6,
    accepts: ["image", "pdf", "doc"],
    defaultTags: ["comic", "panel", "sequence", "layout"]
  }
];

export const PLACE_TYPES = [
  "city",
  "interior",
  "vehicle",
  "landscape",
  "facility",
  "stage",
  "dreamspace",
  "garden",
  "space-station",
  "ship",
  "planet",
  "unknown"
];

export const SCENE_AVATAR_ROLES = [
  "lead",
  "support",
  "background",
  "opposition",
  "cameo",
  "mentioned"
];

export function createSceneGraphScaffold(input = {}) {
  const now = new Date().toISOString();
  const timeline = {
    id: input.timelineId || "canonical-timeline",
    name: input.timelineName || "Canonical Timeline",
    description: input.timelineDescription || "Primary ordered story continuity for avatar/place/scene work.",
    createdAt: now,
    updatedAt: now
  };
  const volume = createVolumeRecord({
    id: input.volumeId || "volume-scaffold-1",
    title: input.volumeTitle || "Volume Scaffold 1",
    quickPitch: "Archivist scaffold for grouping 6 to 8 episodes into a consolidated season/volume.",
    archivistAgent: {
      avatarName: "The Archivist",
      role: "canon consolidation and screenplay synthesis"
    }
  }, now);
  const episode = createEpisodeRecord({
    id: input.episodeId || "episode-scaffold-1",
    title: input.episodeTitle || "Episode Scaffold 1",
    volumeId: volume.id,
    quickPitch: input.episodeQuickPitch || "Team-joining episode scaffold.",
    overallNarrative: input.episodeNarrative || "Describe how a team member joins, what the scene teaches, and what canon changes.",
    sceneIds: [input.sceneId || "scene-scaffold-1"]
  }, now);
  const place = createPlaceRecord({
    id: input.placeId || "unassigned-place",
    name: input.placeName || "Unassigned Place",
    type: input.placeType || "unknown",
    summary: input.placeSummary || "Scene location scaffold awaiting human definition.",
    lore: input.placeLore || "Place lore awaiting Avatar Genesis backstory or scene canon.",
    visualDescription: input.placeVisualDescription || "Visual description awaiting production pass.",
    imagePrompt: input.placeImagePrompt || "Wide establishing shot of the place, readable as Hapa canon environment.",
    tags: ["place", "scaffold"]
  }, now);
  const scene = createSceneRecord({
    id: input.sceneId || "scene-scaffold-1",
    title: input.sceneTitle || "Scene Scaffold 1",
    placeId: place.id,
    timelineId: timeline.id,
    episodeId: episode.id,
    volumeId: volume.id,
    summary: input.sceneSummary || "Scene scaffold awaiting place, time, avatars, media, and playlist.",
    quickPitch: input.sceneQuickPitch || "A single canon beat ready for comic, video, or screenplay expansion.",
    overallNarrative: input.sceneOverallNarrative || "Explain how this beat advances character, lore, mechanics, and team history.",
    canonicalTime: {
      timelineId: timeline.id,
      order: 1,
      label: "Beat 001",
      startsAt: "",
      duration: ""
    }
  }, now);

  return normalizeSceneGraph({
    schemaVersion: SCENE_GRAPH_VERSION,
    places: [place],
    scenes: [scene],
    episodes: [episode],
    volumes: [{ ...volume, episodeIds: [episode.id] }],
    timelines: [timeline],
    createdAt: now,
    updatedAt: now
  });
}

export function normalizeSceneGraph(graph = {}) {
  const now = new Date().toISOString();
  const source = clone(graph || {});
  const next = {
    schemaVersion: source.schemaVersion || SCENE_GRAPH_VERSION,
    places: Array.isArray(source.places) ? source.places : [],
    scenes: Array.isArray(source.scenes) ? source.scenes : [],
    episodes: Array.isArray(source.episodes) ? source.episodes : [],
    volumes: Array.isArray(source.volumes) ? source.volumes : [],
    timelines: Array.isArray(source.timelines) && source.timelines.length
      ? source.timelines
      : [{
          id: "canonical-timeline",
          name: "Canonical Timeline",
          description: "Primary ordered story continuity.",
          createdAt: source.createdAt || now,
          updatedAt: source.updatedAt || now
        }],
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };

  if (!next.places.length) {
    next.places.push(createPlaceRecord({ name: "Unassigned Place", type: "unknown" }, now));
  }

  const firstTimelineId = next.timelines[0]?.id || "canonical-timeline";
  const firstPlaceId = next.places[0]?.id || "unassigned-place";
  next.places = next.places.map((place) => normalizePlace(place, now));
  next.scenes = next.scenes.map((scene, index) => normalizeScene(scene, {
    placeId: scene.placeId || firstPlaceId,
    timelineId: scene.timelineId || firstTimelineId,
    order: scene.canonicalTime?.order || index + 1
  }));

  if (!next.scenes.length) {
    next.scenes.push(createSceneRecord({
      title: "Scene Scaffold 1",
      placeId: firstPlaceId,
      timelineId: firstTimelineId,
      canonicalTime: {
        timelineId: firstTimelineId,
        order: 1,
        label: "Beat 001",
        startsAt: "",
        duration: ""
      }
    }, now));
  }

  next.episodes = next.episodes.map((episode) => normalizeEpisode(episode, now));
  next.volumes = next.volumes.map((volume) => normalizeVolume(volume, now));
  next.places = hydratePlaceSceneRefs(next.places, next.scenes);

  return next;
}

export function createPlace(graph, input = {}) {
  const next = normalizeSceneGraph(graph);
  const now = new Date().toISOString();
  const place = createPlaceRecord({
    name: input.name || `Place ${next.places.length + 1}`,
    type: input.type || "unknown",
    summary: input.summary || "New place scaffold.",
    lore: input.lore || "Place lore awaiting scene canon.",
    visualDescription: input.visualDescription || input.visual_description || "",
    imagePrompt: input.imagePrompt || input.image_prompt || "",
    tags: input.tags || ["place", "scaffold"],
    placeCard: input.placeCard || input.place_card
  }, now);
  next.places = [place, ...next.places];
  next.updatedAt = now;
  return next;
}

export function updatePlace(graph, placeId, patch = {}) {
  const next = normalizeSceneGraph(graph);
  const now = new Date().toISOString();
  next.places = next.places.map((place) => place.id === placeId ? {
    ...place,
    ...patch,
    type: patch.type ? (PLACE_TYPES.includes(patch.type) ? patch.type : "unknown") : place.type,
    tags: patch.tags ? unique(patch.tags) : place.tags,
    updatedAt: now
  } : place);
  next.updatedAt = now;
  return next;
}

export function createScene(graph, input = {}) {
  const next = normalizeSceneGraph(graph);
  const now = new Date().toISOString();
  const placeId = input.placeId || next.places[0]?.id || "unassigned-place";
  const timelineId = input.timelineId || next.timelines[0]?.id || "canonical-timeline";
  const scene = createSceneRecord({
    title: input.title || `Scene ${next.scenes.length + 1}`,
    placeId,
    timelineId,
    episodeId: input.episodeId || input.episode_id || "",
    volumeId: input.volumeId || input.volume_id || "",
    summary: input.summary || "New scene scaffold.",
    quickPitch: input.quickPitch || input.quick_pitch || "",
    overallNarrative: input.overallNarrative || input.overall_narrative || "",
    narrativeText: input.narrativeText || input.narrative_text || "",
    expositionBeats: input.expositionBeats || input.exposition_beats || [],
    actionBeats: input.actionBeats || input.action_beats || [],
    characterGrowth: input.characterGrowth || input.character_growth || [],
    learningObjectives: input.learningObjectives || input.learning_objectives || [],
    hapaMechanics: input.hapaMechanics || input.hapa_mechanics || [],
    managementSkills: input.managementSkills || input.management_skills || [],
    productionPrompt: input.productionPrompt || input.production_prompt || "",
    canonEventIds: input.canonEventIds || input.canon_event_ids || [],
    aesthetic: input.aesthetic,
    promptPack: input.promptPack || input.prompt_pack,
    canonicalTime: {
      timelineId,
      order: Number(input.order || next.scenes.length + 1),
      label: input.label || `Beat ${String(next.scenes.length + 1).padStart(3, "0")}`,
      startsAt: input.startsAt || "",
      duration: input.duration || ""
    }
  }, now);
  next.scenes = [scene, ...next.scenes];
  next.updatedAt = now;
  return next;
}

export function updateScene(graph, sceneId, patch = {}) {
  const next = normalizeSceneGraph(graph);
  const now = new Date().toISOString();
  next.scenes = next.scenes.map((scene) => scene.id === sceneId ? normalizeScene({
    ...scene,
    ...patch,
    tags: patch.tags ? unique(patch.tags) : scene.tags,
    updatedAt: now
  }) : scene);
  next.updatedAt = now;
  return next;
}

export function setSceneTimeline(graph, sceneId, timelinePatch = {}) {
  const next = normalizeSceneGraph(graph);
  const now = new Date().toISOString();
  next.scenes = next.scenes.map((scene) => scene.id === sceneId ? {
    ...scene,
    timelineId: timelinePatch.timelineId || scene.timelineId,
    canonicalTime: {
      ...(scene.canonicalTime || {}),
      ...timelinePatch,
      order: Number.isFinite(Number(timelinePatch.order)) ? Number(timelinePatch.order) : scene.canonicalTime?.order || 1,
      timelineId: timelinePatch.timelineId || scene.canonicalTime?.timelineId || scene.timelineId
    },
    updatedAt: now
  } : scene);
  next.updatedAt = now;
  return next;
}

export function attachSceneMedia(graph, sceneId, assetInput, slotId = null) {
  const next = normalizeSceneGraph(graph);
  const sceneIndex = next.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0) return next;

  const scene = clone(next.scenes[sceneIndex]);
  const asset = createMediaAsset({
    ...assetInput,
    requirementId: assetInput.requirementId || inferSceneRequirement(assetInput),
    type: assetInput.type || inferAssetKind(assetInput.name || assetInput.uri || "")
  });
  const requirement = sceneRequirementById(asset.requirementId);
  if (!requirement) return next;

  asset.processing = {
    ...(asset.processing || {}),
    status: "attached",
    attachedToScene: true,
    sceneId,
    attachedAt: new Date().toISOString(),
    slotId
  };
  asset.metadata = {
    ...(asset.metadata || {}),
    sceneId,
    sceneTitle: scene.title,
    sceneRequirementId: requirement.id,
    sceneRequirementName: requirement.label
  };

  const existingIndex = scene.assets.findIndex((item) => item.id === asset.id);
  if (existingIndex >= 0) scene.assets[existingIndex] = asset;
  else scene.assets.push(asset);

  scene.mediaSlots = scene.mediaSlots.map((slot) =>
    slot.assetId === asset.id && slot.id !== slotId ? { ...slot, assetId: null } : slot
  );

  let slotIndex = slotId
    ? scene.mediaSlots.findIndex((slot) => slot.id === slotId)
    : scene.mediaSlots.findIndex((slot) => slot.requirementId === requirement.id && slot.required !== false && !slot.assetId);

  if (!slotId && slotIndex < 0) {
    const overfillCount = scene.mediaSlots.filter((slot) => slot.requirementId === requirement.id && slot.required === false).length;
    scene.mediaSlots.push({
      id: `${scene.id}-${requirement.id}-overfill-${Date.now()}-${overfillCount + 1}`,
      requirementId: requirement.id,
      label: `${requirement.shortLabel} overfill ${overfillCount + 1}`,
      required: false,
      overfill: true,
      assetId: null,
      preferredTags: requirement.defaultTags || []
    });
    slotIndex = scene.mediaSlots.length - 1;
  }

  if (slotIndex >= 0) {
    scene.mediaSlots[slotIndex] = { ...scene.mediaSlots[slotIndex], assetId: asset.id };
    asset.processing.slotId = scene.mediaSlots[slotIndex].id;
    scene.assets[scene.assets.findIndex((item) => item.id === asset.id)] = asset;
  }

  reconcileSceneMediaSlots(scene);
  applySceneAssetLabels(scene);
  scene.updatedAt = new Date().toISOString();
  next.scenes[sceneIndex] = scene;
  next.updatedAt = scene.updatedAt;
  return next;
}

export function detachSceneMedia(graph, sceneId, assetId) {
  const next = normalizeSceneGraph(graph);
  const sceneIndex = next.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0) return next;
  const scene = clone(next.scenes[sceneIndex]);
  scene.assets = scene.assets.filter((asset) => asset.id !== assetId);
  scene.mediaSlots = scene.mediaSlots
    .map((slot) => slot.assetId === assetId ? { ...slot, assetId: null } : slot)
    .filter((slot) => !(slot.required === false && !slot.assetId));
  applySceneAssetLabels(scene);
  scene.updatedAt = new Date().toISOString();
  next.scenes[sceneIndex] = scene;
  next.updatedAt = scene.updatedAt;
  return next;
}

export function tagAvatarInScene(graph, sceneId, avatarId, details = {}) {
  const next = normalizeSceneGraph(graph);
  const sceneIndex = next.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0 || !avatarId) return next;
  const scene = clone(next.scenes[sceneIndex]);
  const now = new Date().toISOString();
  const existingIndex = scene.avatarTags.findIndex((tag) => tag.avatarId === avatarId);
  const record = {
    avatarId,
    role: details.role || scene.avatarTags[existingIndex]?.role || "lead",
    presence: details.presence || scene.avatarTags[existingIndex]?.presence || "onscreen",
    tags: unique(details.tags || scene.avatarTags[existingIndex]?.tags || ["scene-presence"]),
    note: details.note || scene.avatarTags[existingIndex]?.note || "",
    taggedAt: scene.avatarTags[existingIndex]?.taggedAt || now,
    updatedAt: now
  };
  if (existingIndex >= 0) scene.avatarTags[existingIndex] = record;
  else scene.avatarTags.push(record);
  scene.updatedAt = now;
  next.scenes[sceneIndex] = scene;
  next.updatedAt = now;
  return next;
}

export function removeAvatarFromScene(graph, sceneId, avatarId) {
  const next = normalizeSceneGraph(graph);
  const sceneIndex = next.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0) return next;
  const scene = clone(next.scenes[sceneIndex]);
  scene.avatarTags = scene.avatarTags.filter((tag) => tag.avatarId !== avatarId);
  scene.assets = scene.assets.map((asset) => ({
    ...asset,
    metadata: {
      ...(asset.metadata || {}),
      avatarTags: (asset.metadata?.avatarTags || []).filter((tag) => tag.avatarId !== avatarId)
    }
  }));
  scene.updatedAt = new Date().toISOString();
  next.scenes[sceneIndex] = scene;
  next.updatedAt = scene.updatedAt;
  return next;
}

export function tagAvatarInSceneMedia(graph, sceneId, assetId, avatarId, details = {}) {
  const next = normalizeSceneGraph(graph);
  const sceneIndex = next.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0 || !assetId || !avatarId) return next;
  const scene = clone(next.scenes[sceneIndex]);
  const assetIndex = scene.assets.findIndex((asset) => asset.id === assetId);
  if (assetIndex < 0) return next;
  const now = new Date().toISOString();
  const avatarTags = [...(scene.assets[assetIndex].metadata?.avatarTags || [])];
  const existingIndex = avatarTags.findIndex((tag) => tag.avatarId === avatarId);
  const record = {
    avatarId,
    role: details.role || avatarTags[existingIndex]?.role || "visible",
    tags: unique(details.tags || avatarTags[existingIndex]?.tags || ["in-frame"]),
    note: details.note || avatarTags[existingIndex]?.note || "",
    taggedAt: avatarTags[existingIndex]?.taggedAt || now,
    updatedAt: now
  };
  if (existingIndex >= 0) avatarTags[existingIndex] = record;
  else avatarTags.push(record);
  scene.assets[assetIndex] = {
    ...scene.assets[assetIndex],
    metadata: {
      ...(scene.assets[assetIndex].metadata || {}),
      avatarTags
    }
  };
  scene.updatedAt = now;
  next.scenes[sceneIndex] = scene;
  next.updatedAt = now;
  return next;
}

export function addPlaylistTrack(graph, sceneId, track = {}) {
  const next = normalizeSceneGraph(graph);
  const sceneIndex = next.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0) return next;
  const scene = clone(next.scenes[sceneIndex]);
  const now = new Date().toISOString();
  scene.playlist = [
    ...(scene.playlist || []),
    {
      id: track.id || `track-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      title: track.title || "Untitled track",
      artist: track.artist || "",
      uri: track.uri || "",
      mood: track.mood || "",
      bpm: track.bpm || "",
      tags: unique(track.tags || ["playlist"]),
      note: track.note || "",
      createdAt: now,
      updatedAt: now
    }
  ];
  scene.updatedAt = now;
  next.scenes[sceneIndex] = scene;
  next.updatedAt = now;
  return next;
}

export function auditSceneGraph(graph) {
  const next = normalizeSceneGraph(graph);
  const media = next.scenes.flatMap((scene) => scene.assets || []);
  const avatarTags = next.scenes.flatMap((scene) => scene.avatarTags || []);
  const playlistTracks = next.scenes.flatMap((scene) => scene.playlist || []);
  const completeScenes = next.scenes.filter((scene) => {
    const requiredSlots = scene.mediaSlots.filter((slot) => slot.required !== false);
    return Boolean(scene.placeId)
      && Boolean(scene.canonicalTime?.timelineId)
      && requiredSlots.some((slot) => slot.assetId)
      && scene.avatarTags.length > 0;
  });

  return {
    schemaVersion: "hapa.scene-graph-audit.v1",
    places: next.places.length,
    scenes: next.scenes.length,
    episodes: next.episodes.length,
    volumes: next.volumes.length,
    timelines: next.timelines.length,
    media: media.length,
    avatarTags: avatarTags.length,
    playlistTracks: playlistTracks.length,
    placeCards: next.places.filter((place) => place.placeCard?.id).length,
    completeScenes: completeScenes.length,
    percent: next.scenes.length ? Math.round((completeScenes.length / next.scenes.length) * 100) : 0,
    byScene: next.scenes.map((scene) => auditScene(scene))
  };
}

export function createSceneAttachPack(graph, sceneId = null) {
  const next = normalizeSceneGraph(graph);
  const scene = sceneId ? next.scenes.find((item) => item.id === sceneId) : next.scenes[0];
  if (!scene) {
    return {
      schemaVersion: SCENE_ATTACH_PACK_VERSION,
      generatedAt: new Date().toISOString(),
      scenes: []
    };
  }
  const place = next.places.find((item) => item.id === scene.placeId) || null;
  const episode = next.episodes.find((item) => item.id === scene.episodeId) || null;
  const volume = next.volumes.find((item) => item.id === scene.volumeId || item.id === episode?.volumeId) || null;
  const timeline = next.timelines.find((item) => item.id === scene.canonicalTime?.timelineId || scene.timelineId) || null;
  const slotByAssetId = new Map(scene.mediaSlots.filter((slot) => slot.assetId).map((slot) => [slot.assetId, slot]));
  const mediaReferences = (scene.assets || []).map((asset) => {
    const slot = slotByAssetId.get(asset.id);
    return {
      id: asset.id,
      role: slot?.requirementId || asset.requirementId,
      label: sceneRequirementById(slot?.requirementId || asset.requirementId)?.label || asset.requirementId,
      name: asset.name,
      originalFileName: asset.metadata?.originalFileName || asset.metadata?.originalAssetName || null,
      uri: asset.uri,
      thumbnail: asset.metadata?.thumbnail?.uri || asset.metadata?.thumbnailUri || null,
      type: asset.type,
      tags: asset.tags || [],
      avatarTags: asset.metadata?.avatarTags || [],
      overfill: slot?.required === false
    };
  });

  return {
    schemaVersion: SCENE_ATTACH_PACK_VERSION,
    graphId: next.id || "scene-graph",
    sceneId: scene.id,
    title: scene.title,
    episode,
    volume,
    place,
    placeCard: place?.placeCard || null,
    timeline,
    canonicalTime: scene.canonicalTime,
    summary: scene.summary,
    quickPitch: scene.quickPitch,
    overallNarrative: scene.overallNarrative,
    narrativeText: scene.narrativeText,
    productionPrompt: scene.productionPrompt,
    aesthetic: scene.aesthetic,
    promptPack: scene.promptPack,
    expositionBeats: scene.expositionBeats,
    actionBeats: scene.actionBeats,
    characterGrowth: scene.characterGrowth,
    learningObjectives: scene.learningObjectives,
    hapaMechanics: scene.hapaMechanics,
    managementSkills: scene.managementSkills,
    tags: scene.tags || [],
    avatarTags: scene.avatarTags || [],
    mediaReferences,
    playlist: scene.playlist || [],
    generatedAt: new Date().toISOString()
  };
}

export function sceneRequirementById(id) {
  return SCENE_MEDIA_REQUIREMENTS.find((requirement) => requirement.id === id) || null;
}

function normalizeScene(scene = {}, fallback = {}) {
  const now = new Date().toISOString();
  const id = scene.id || slugify(scene.title || `scene-${Date.now()}`);
  const timelineId = scene.timelineId || scene.canonicalTime?.timelineId || fallback.timelineId || "canonical-timeline";
  const normalized = {
    id,
    title: scene.title || "Untitled Scene",
    placeId: scene.placeId || fallback.placeId || "unassigned-place",
    timelineId,
    episodeId: scene.episodeId || scene.episode_id || fallback.episodeId || "",
    volumeId: scene.volumeId || scene.volume_id || fallback.volumeId || "",
    canonicalTime: {
      timelineId,
      order: Number(scene.canonicalTime?.order || fallback.order || 1),
      label: scene.canonicalTime?.label || `Beat ${String(fallback.order || 1).padStart(3, "0")}`,
      startsAt: scene.canonicalTime?.startsAt || "",
      duration: scene.canonicalTime?.duration || ""
    },
    summary: scene.summary || "",
    quickPitch: scene.quickPitch || scene.quick_pitch || "",
    overallNarrative: scene.overallNarrative || scene.overall_narrative || "",
    narrativeText: scene.narrativeText || scene.narrative_text || "",
    expositionBeats: normalizeStringList(scene.expositionBeats || scene.exposition_beats),
    actionBeats: normalizeStringList(scene.actionBeats || scene.action_beats),
    characterGrowth: normalizeStringList(scene.characterGrowth || scene.character_growth),
    learningObjectives: normalizeStringList(scene.learningObjectives || scene.learning_objectives),
    hapaMechanics: normalizeStringList(scene.hapaMechanics || scene.hapa_mechanics),
    managementSkills: normalizeStringList(scene.managementSkills || scene.management_skills),
    productionPrompt: scene.productionPrompt || scene.production_prompt || "",
    canonEventIds: normalizeStringList(scene.canonEventIds || scene.canon_event_ids),
    eventTimestamp: normalizeEventTimestamp(scene.eventTimestamp || scene.event_timestamp, {
      timelineId,
      order: scene.canonicalTime?.order || fallback.order || 1,
      placeId: scene.placeId || fallback.placeId || "unassigned-place"
    }),
    eventActions: normalizeEventActions(scene.eventActions || scene.event_actions),
    aesthetic: normalizeAesthetic(scene.aesthetic),
    promptPack: normalizePromptPack(scene.promptPack || scene.prompt_pack),
    canonStatus: scene.canonStatus || scene.canon_status || "scaffold",
    placeCardRefs: normalizeStringList(scene.placeCardRefs || scene.place_card_refs),
    tags: unique(scene.tags || ["scene"]),
    mediaSlots: Array.isArray(scene.mediaSlots) ? scene.mediaSlots : [],
    assets: Array.isArray(scene.assets) ? scene.assets : [],
    avatarTags: Array.isArray(scene.avatarTags) ? scene.avatarTags : [],
    playlist: Array.isArray(scene.playlist) ? scene.playlist : [],
    nodes: Array.isArray(scene.nodes) ? scene.nodes : [],
    createdAt: scene.createdAt || now,
    updatedAt: scene.updatedAt || scene.createdAt || now
  };

  for (const requirement of SCENE_MEDIA_REQUIREMENTS) {
    const existingRequired = normalized.mediaSlots.filter((slot) => slot.requirementId === requirement.id && slot.required !== false);
    for (let index = existingRequired.length; index < requirement.required; index += 1) {
      normalized.mediaSlots.push({
        id: `${id}-${requirement.id}-${index + 1}`,
        requirementId: requirement.id,
        label: `${requirement.shortLabel} ${index + 1}`,
        required: true,
        assetId: null,
        preferredTags: requirement.defaultTags.slice(index, index + 2)
      });
    }
  }
  reconcileSceneMediaSlots(normalized);
  applySceneAssetLabels(normalized);
  return normalized;
}

function createPlaceRecord(input = {}, now = new Date().toISOString()) {
  const name = input.name || "Unnamed Place";
  const place = {
    id: input.id || slugify(name) || `place-${Date.now()}`,
    name,
    type: PLACE_TYPES.includes(input.type) ? input.type : "unknown",
    summary: input.summary || "",
    lore: input.lore || "",
    visualDescription: input.visualDescription || input.visual_description || "",
    imagePrompt: input.imagePrompt || input.image_prompt || "",
    tags: unique(input.tags || ["place"]),
    coordinates: input.coordinates || null,
    sceneIds: normalizeStringList(input.sceneIds || input.scene_ids),
    avatarIds: normalizeStringList(input.avatarIds || input.avatar_ids),
    canonEventIds: normalizeStringList(input.canonEventIds || input.canon_event_ids),
    placeCard: input.placeCard || input.place_card || null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  };
  return {
    ...place,
    placeCard: normalizePlaceCard(place.placeCard || place, place, now)
  };
}

function createSceneRecord(input = {}, now = new Date().toISOString()) {
  return normalizeScene({
    id: input.id || slugify(input.title || `scene-${Date.now()}`),
    title: input.title || "Untitled Scene",
    placeId: input.placeId,
    timelineId: input.timelineId,
    episodeId: input.episodeId || input.episode_id || "",
    volumeId: input.volumeId || input.volume_id || "",
    canonicalTime: input.canonicalTime,
    summary: input.summary || "",
    quickPitch: input.quickPitch || input.quick_pitch || "",
    overallNarrative: input.overallNarrative || input.overall_narrative || "",
    narrativeText: input.narrativeText || input.narrative_text || "",
    expositionBeats: input.expositionBeats || input.exposition_beats || [],
    actionBeats: input.actionBeats || input.action_beats || [],
    characterGrowth: input.characterGrowth || input.character_growth || [],
    learningObjectives: input.learningObjectives || input.learning_objectives || [],
    hapaMechanics: input.hapaMechanics || input.hapa_mechanics || [],
    managementSkills: input.managementSkills || input.management_skills || [],
    productionPrompt: input.productionPrompt || input.production_prompt || "",
    canonEventIds: input.canonEventIds || input.canon_event_ids || [],
    eventTimestamp: input.eventTimestamp || input.event_timestamp,
    eventActions: input.eventActions || input.event_actions || [],
    aesthetic: input.aesthetic,
    promptPack: input.promptPack || input.prompt_pack,
    canonStatus: input.canonStatus || input.canon_status || "scaffold",
    placeCardRefs: input.placeCardRefs || input.place_card_refs || [],
    tags: input.tags || ["scene", "scaffold"],
    mediaSlots: [],
    assets: [],
    avatarTags: [],
    playlist: [],
    nodes: [],
    createdAt: now,
    updatedAt: now
  });
}

function inferSceneRequirement(asset = {}) {
  const type = asset.type || inferAssetKind(asset.name || asset.uri || "");
  if (type === "model") return "scene_space_3d";
  if (type === "video") return "scene_videos";
  if ((asset.tags || []).includes("comic")) return "scene_comics";
  return "scene_images";
}

function auditScene(scene) {
  const requiredSlots = scene.mediaSlots.filter((slot) => slot.required !== false);
  const filled = requiredSlots.filter((slot) => slot.assetId);
  return {
    id: scene.id,
    title: scene.title,
    placeId: scene.placeId,
    timelineId: scene.canonicalTime?.timelineId || scene.timelineId,
    requiredMedia: requiredSlots.length,
    filledMedia: filled.length,
    overfill: scene.mediaSlots.filter((slot) => slot.required === false && slot.assetId).length,
    avatarTags: scene.avatarTags.length,
    playlistTracks: scene.playlist.length,
    episodeId: scene.episodeId,
    volumeId: scene.volumeId,
    hasProductionPrompt: Boolean(scene.productionPrompt || scene.promptPack?.comicPanelPrompt || scene.promptPack?.heroImagePrompt),
    hasQuickPitch: Boolean(scene.quickPitch),
    percent: requiredSlots.length ? Math.round((filled.length / requiredSlots.length) * 100) : 100
  };
}

function normalizePlace(place = {}, now = new Date().toISOString()) {
  return createPlaceRecord(place, now);
}

function hydratePlaceSceneRefs(places = [], scenes = []) {
  const refs = new Map(places.map((place) => [place.id, { sceneIds: [], avatarIds: [], canonEventIds: [] }]));
  for (const scene of scenes) {
    if (!refs.has(scene.placeId)) continue;
    const ref = refs.get(scene.placeId);
    ref.sceneIds.push(scene.id);
    ref.avatarIds.push(...(scene.avatarTags || []).map((tag) => tag.avatarId).filter(Boolean));
    ref.canonEventIds.push(...normalizeStringList(scene.canonEventIds || scene.canon_event_ids));
  }
  return places.map((place) => {
    const ref = refs.get(place.id) || { sceneIds: [], avatarIds: [], canonEventIds: [] };
    const next = {
      ...place,
      sceneIds: unique([...(place.sceneIds || []), ...ref.sceneIds]),
      avatarIds: unique([...(place.avatarIds || []), ...ref.avatarIds]),
      canonEventIds: unique([...(place.canonEventIds || []), ...ref.canonEventIds])
    };
    return {
      ...next,
      placeCard: normalizePlaceCard(next.placeCard, next)
    };
  });
}

function createEpisodeRecord(input = {}, now = new Date().toISOString()) {
  return normalizeEpisode({
    id: input.id || slugify(input.title || `episode-${Date.now()}`),
    title: input.title || "Untitled Episode",
    teamId: input.teamId || input.team_id || "",
    teamTitle: input.teamTitle || input.team_title || "",
    volumeId: input.volumeId || input.volume_id || "",
    episodeNumber: input.episodeNumber || input.episode_number || "",
    quickPitch: input.quickPitch || input.quick_pitch || "",
    overallNarrative: input.overallNarrative || input.overall_narrative || "",
    settingTimeline: input.settingTimeline || input.setting_timeline || "",
    expositionGoal: input.expositionGoal || input.exposition_goal || "",
    mechanicsTaught: input.mechanicsTaught || input.mechanics_taught || [],
    managementSkills: input.managementSkills || input.management_skills || [],
    avatarIds: input.avatarIds || input.avatar_ids || [],
    sceneIds: input.sceneIds || input.scene_ids || [],
    placeIds: input.placeIds || input.place_ids || [],
    aesthetic: input.aesthetic,
    promptPack: input.promptPack || input.prompt_pack,
    canonStatus: input.canonStatus || input.canon_status || "scaffold",
    completedAt: input.completedAt || input.completed_at || "",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }, now);
}

function createVolumeRecord(input = {}, now = new Date().toISOString()) {
  return normalizeVolume({
    id: input.id || slugify(input.title || `volume-${Date.now()}`),
    title: input.title || "Untitled Volume",
    volumeNumber: input.volumeNumber || input.volume_number || "",
    seasonTitle: input.seasonTitle || input.season_title || "",
    quickPitch: input.quickPitch || input.quick_pitch || "",
    episodeIds: input.episodeIds || input.episode_ids || [],
    archivistAgent: input.archivistAgent || input.archivist_agent || {},
    screenplayPitch: input.screenplayPitch || input.screenplay_pitch || "",
    screenplayPrompt: input.screenplayPrompt || input.screenplay_prompt || "",
    canonConsolidationPlan: input.canonConsolidationPlan || input.canon_consolidation_plan || "",
    summary: input.summary || "",
    overallNarrative: input.overallNarrative || input.overall_narrative || "",
    episodeSummaries: input.episodeSummaries || input.episode_summaries || [],
    screenplayOutline: input.screenplayOutline || input.screenplay_outline || [],
    screenplayDraft: input.screenplayDraft || input.screenplay_draft || "",
    canonDeltas: input.canonDeltas || input.canon_deltas || [],
    relationshipCollisions: input.relationshipCollisions || input.relationship_collisions || [],
    placesFeatured: input.placesFeatured || input.places_featured || [],
    artifactPaths: input.artifactPaths || input.artifact_paths || [],
    aesthetic: input.aesthetic,
    promptPack: input.promptPack || input.prompt_pack,
    periodicTrigger: input.periodicTrigger || input.periodic_trigger || {},
    canonStatus: input.canonStatus || input.canon_status || "scaffold",
    completedAt: input.completedAt || input.completed_at || "",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }, now);
}

function normalizeEpisode(episode = {}, now = new Date().toISOString()) {
  const id = episode.id || slugify(episode.title || `episode-${Date.now()}`);
  const status = episode.status || "planned";
  return {
    id,
    title: episode.title || "Untitled Episode",
    teamId: episode.teamId || episode.team_id || "",
    teamTitle: episode.teamTitle || episode.team_title || "",
    volumeId: episode.volumeId || episode.volume_id || "",
    episodeNumber: episode.episodeNumber || episode.episode_number || "",
    quickPitch: episode.quickPitch || episode.quick_pitch || "",
    overallNarrative: episode.overallNarrative || episode.overall_narrative || "",
    settingTimeline: episode.settingTimeline || episode.setting_timeline || "",
    expositionGoal: episode.expositionGoal || episode.exposition_goal || "",
    mechanicsTaught: normalizeStringList(episode.mechanicsTaught || episode.mechanics_taught),
    managementSkills: normalizeStringList(episode.managementSkills || episode.management_skills),
    avatarIds: normalizeStringList(episode.avatarIds || episode.avatar_ids),
    sceneIds: normalizeStringList(episode.sceneIds || episode.scene_ids),
    placeIds: normalizeStringList(episode.placeIds || episode.place_ids),
    aesthetic: normalizeAesthetic(episode.aesthetic),
    promptPack: normalizePromptPack(episode.promptPack || episode.prompt_pack),
    canonStatus: episode.canonStatus || episode.canon_status || "scaffold",
    status,
    completedAt: episode.completedAt || episode.completed_at || (status === "done" ? now : ""),
    createdAt: episode.createdAt || episode.created_at || now,
    updatedAt: episode.updatedAt || episode.updated_at || now
  };
}

function normalizeVolume(volume = {}, now = new Date().toISOString()) {
  const id = volume.id || slugify(volume.title || `volume-${Date.now()}`);
  const status = volume.status || "planned";
  return {
    id,
    title: volume.title || "Untitled Volume",
    volumeNumber: volume.volumeNumber || volume.volume_number || "",
    seasonTitle: volume.seasonTitle || volume.season_title || "",
    quickPitch: volume.quickPitch || volume.quick_pitch || "",
    episodeIds: normalizeStringList(volume.episodeIds || volume.episode_ids),
    archivistAgent: normalizeArchivistAgent(volume.archivistAgent || volume.archivist_agent),
    screenplayPitch: volume.screenplayPitch || volume.screenplay_pitch || "",
    screenplayPrompt: volume.screenplayPrompt || volume.screenplay_prompt || "",
    canonConsolidationPlan: volume.canonConsolidationPlan || volume.canon_consolidation_plan || "",
    summary: volume.summary || "",
    overallNarrative: volume.overallNarrative || volume.overall_narrative || "",
    episodeSummaries: Array.isArray(volume.episodeSummaries || volume.episode_summaries)
      ? (volume.episodeSummaries || volume.episode_summaries)
      : [],
    screenplayOutline: Array.isArray(volume.screenplayOutline || volume.screenplay_outline)
      ? (volume.screenplayOutline || volume.screenplay_outline)
      : [],
    screenplayDraft: volume.screenplayDraft || volume.screenplay_draft || "",
    canonDeltas: Array.isArray(volume.canonDeltas || volume.canon_deltas)
      ? (volume.canonDeltas || volume.canon_deltas)
      : [],
    relationshipCollisions: Array.isArray(volume.relationshipCollisions || volume.relationship_collisions)
      ? (volume.relationshipCollisions || volume.relationship_collisions)
      : [],
    placesFeatured: normalizeStringList(volume.placesFeatured || volume.places_featured),
    artifactPaths: normalizeStringList(volume.artifactPaths || volume.artifact_paths),
    aesthetic: normalizeAesthetic(volume.aesthetic),
    promptPack: normalizePromptPack(volume.promptPack || volume.prompt_pack),
    periodicTrigger: normalizeArchivistTrigger(volume.periodicTrigger || volume.periodic_trigger),
    canonStatus: volume.canonStatus || volume.canon_status || "scaffold",
    status,
    completedAt: volume.completedAt || volume.completed_at || (status === "done" ? now : ""),
    createdAt: volume.createdAt || volume.created_at || now,
    updatedAt: volume.updatedAt || volume.updated_at || now
  };
}

function normalizePlaceCard(card = {}, place = {}, now = new Date().toISOString()) {
  const source = card && typeof card === "object" ? card : {};
  const title = source.title || `${place.name || "Unnamed Place"} Place Card`;
  return {
    id: source.id || `place-card-${place.id || slugify(place.name || title)}`,
    schemaVersion: source.schemaVersion || source.schema_version || "hapa.place-card.v1",
    title,
    placeId: source.placeId || source.place_id || place.id || "",
    placeName: source.placeName || source.place_name || place.name || "",
    summary: source.summary || place.summary || "",
    lore: source.lore || place.lore || "",
    visualDescription: source.visualDescription || source.visual_description || place.visualDescription || "",
    imagePrompt: source.imagePrompt || source.image_prompt || place.imagePrompt || "",
    avatarIds: normalizeStringList(source.avatarIds || source.avatar_ids || place.avatarIds),
    sceneIds: normalizeStringList(source.sceneIds || source.scene_ids || place.sceneIds),
    canonEventIds: normalizeStringList(source.canonEventIds || source.canon_event_ids || place.canonEventIds),
    tags: unique(source.tags || place.tags || ["place-card"]),
    canonStatus: source.canonStatus || source.canon_status || "scaffold",
    status: source.status || "active",
    createdAt: source.createdAt || source.created_at || place.createdAt || now,
    updatedAt: source.updatedAt || source.updated_at || place.updatedAt || now
  };
}

function normalizeArchivistAgent(agent = {}) {
  return {
    avatarId: agent.avatarId || agent.avatar_id || "",
    avatarName: agent.avatarName || agent.avatar_name || agent.name || "The Archivist",
    role: agent.role || "volume and screenplay canon consolidator",
    cadence: agent.cadence || "after every 6 to 8 completed episodes",
    loreInstruction: agent.loreInstruction || agent.lore_instruction || "Look for canon, relationship, and production opportunities, then write a Volume/Season screenplay pass."
  };
}

function normalizeArchivistTrigger(trigger = {}) {
  return {
    type: trigger.type || "episode_count",
    minEpisodes: Number(trigger.minEpisodes || trigger.min_episodes || 6),
    maxEpisodes: Number(trigger.maxEpisodes || trigger.max_episodes || 8),
    nextAfterEpisodeCount: Number(trigger.nextAfterEpisodeCount || trigger.next_after_episode_count || 6),
    status: trigger.status || "active"
  };
}

function normalizeEventTimestamp(timestamp = {}, fallback = {}) {
  const source = timestamp && typeof timestamp === "object" ? timestamp : {};
  const order = Number(source.order || fallback.order || 1);
  return {
    schemaVersion: source.schemaVersion || source.schema_version || "hapa.event-timestamp.v1",
    eventId: source.eventId || source.event_id || `event-${String(order).padStart(4, "0")}`,
    timelineId: source.timelineId || source.timeline_id || fallback.timelineId || "canonical-timeline",
    sequence: Number(source.sequence || source.seq || order),
    order,
    timespace: source.timespace || source.timeSpace || source.time_space || "black-horizon",
    localTimestamp: source.localTimestamp || source.local_timestamp || "",
    dilationBand: source.dilationBand || source.dilation_band || "",
    mutableUntil: source.mutableUntil || source.mutable_until || "canon-lock",
    placeId: source.placeId || source.place_id || fallback.placeId || "",
    confidence: source.confidence || "draft",
    notes: source.notes || ""
  };
}

function normalizeEventActions(actions = []) {
  return (Array.isArray(actions) ? actions : [])
    .filter(Boolean)
    .map((action, index) => typeof action === "string" ? {
      id: `action-${index + 1}`,
      sequence: index + 1,
      label: action,
      avatarIds: [],
      itemIds: [],
      canonStatus: "draft",
      notes: ""
    } : {
      id: action.id || `action-${index + 1}`,
      sequence: Number(action.sequence || index + 1),
      label: action.label || action.title || action.summary || `Action ${index + 1}`,
      avatarIds: normalizeStringList(action.avatarIds || action.avatar_ids),
      itemIds: normalizeStringList(action.itemIds || action.item_ids),
      canonStatus: action.canonStatus || action.canon_status || "draft",
      notes: action.notes || action.description || ""
    });
}

function normalizeAesthetic(aesthetic = {}) {
  const source = aesthetic && typeof aesthetic === "object" ? aesthetic : {};
  return {
    palette: source.palette || "",
    lighting: source.lighting || "",
    camera: source.camera || "",
    composition: source.composition || "",
    mood: source.mood || "",
    referenceTags: normalizeStringList(source.referenceTags || source.reference_tags)
  };
}

function normalizePromptPack(pack = {}) {
  const source = pack && typeof pack === "object" ? pack : {};
  return {
    quickPitch: source.quickPitch || source.quick_pitch || "",
    heroImagePrompt: source.heroImagePrompt || source.hero_image_prompt || "",
    comicPanelPrompt: source.comicPanelPrompt || source.comic_panel_prompt || "",
    explainerVideoPrompt: source.explainerVideoPrompt || source.explainer_video_prompt || "",
    screenplayPrompt: source.screenplayPrompt || source.screenplay_prompt || "",
    negativePrompt: source.negativePrompt || source.negative_prompt || "",
    shotList: normalizeStringList(source.shotList || source.shot_list),
    automationTags: normalizeStringList(source.automationTags || source.automation_tags)
  };
}

function applySceneAssetLabels(scene) {
  const assetById = new Map((scene.assets || []).map((asset) => [asset.id, asset]));
  for (const requirement of SCENE_MEDIA_REQUIREMENTS) {
    const filledSlots = sceneDisplaySlots(scene.mediaSlots, requirement.id).filter(({ slot }) => slot.assetId);
    filledSlots.forEach(({ slot }, index) => {
      const asset = assetById.get(slot.assetId);
      if (!asset) return;
      const order = index + 1;
      const sceneAssetId = `${slugify(requirement.label)}-${order}`;
      const originalFileName = asset.metadata?.originalFileName || asset.metadata?.originalAssetName || asset.name;
      asset.name = sceneAssetId;
      asset.metadata = {
        ...(asset.metadata || {}),
        originalFileName,
        originalAssetName: originalFileName,
        sceneAssetId,
        sceneLabel: sceneAssetId,
        sceneRequirementId: requirement.id,
        sceneRequirementName: requirement.label,
        sceneOrder: order,
        defaultForSceneSection: order === 1
      };
      asset.processing = {
        ...(asset.processing || {}),
        slotId: slot.id,
        sceneOrder: order,
        defaultForSceneSection: order === 1
      };
    });
  }
}

function reconcileSceneMediaSlots(scene) {
  const assetIds = new Set((scene.assets || []).filter((asset) => asset?.id).map((asset) => asset.id));
  const seenSlotAssetIds = new Set();
  scene.mediaSlots = (scene.mediaSlots || [])
    .map((slot) => {
      if (!slot.assetId) return slot;
      if (!assetIds.has(slot.assetId) || seenSlotAssetIds.has(slot.assetId)) {
        return { ...slot, assetId: null };
      }
      seenSlotAssetIds.add(slot.assetId);
      return slot;
    })
    .filter((slot) => !(slot.required === false && !slot.assetId));

  const slottedAssetIds = new Set((scene.mediaSlots || []).filter((slot) => slot.assetId).map((slot) => slot.assetId));
  for (const asset of scene.assets || []) {
    if (!asset?.id || slottedAssetIds.has(asset.id)) continue;
    const requirement = sceneRequirementById(asset.metadata?.sceneRequirementId || asset.requirementId || inferSceneRequirement(asset));
    if (!requirement) continue;
    asset.requirementId = requirement.id;
    asset.metadata = {
      ...(asset.metadata || {}),
      sceneId: scene.id,
      sceneTitle: scene.title,
      sceneRequirementId: requirement.id,
      sceneRequirementName: requirement.label
    };

    let slotIndex = scene.mediaSlots.findIndex((slot) =>
      slot.requirementId === requirement.id && slot.required !== false && !slot.assetId
    );
    if (slotIndex < 0) {
      const overfillCount = scene.mediaSlots.filter((slot) => slot.requirementId === requirement.id && slot.required === false).length;
      scene.mediaSlots.push({
        id: `${scene.id}-${requirement.id}-overfill-${Date.now()}-${overfillCount + 1}`,
        requirementId: requirement.id,
        label: `${requirement.shortLabel} overfill ${overfillCount + 1}`,
        required: false,
        overfill: true,
        assetId: null,
        preferredTags: requirement.defaultTags || []
      });
      slotIndex = scene.mediaSlots.length - 1;
    }
    scene.mediaSlots[slotIndex] = { ...scene.mediaSlots[slotIndex], assetId: asset.id };
    slottedAssetIds.add(asset.id);
  }
}

function sceneDisplaySlots(slots = [], requirementId) {
  return (slots || [])
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.requirementId === requirementId)
    .sort((a, b) => Number(a.slot.required === false) - Number(b.slot.required === false) || a.index - b.index);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return unique(value.map((item) => String(item || "").trim()).filter(Boolean));
  if (value === undefined || value === null || value === "") return [];
  return unique(String(value).split(",").map((item) => item.trim()).filter(Boolean));
}
