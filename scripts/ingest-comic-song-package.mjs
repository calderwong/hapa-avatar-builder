#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  attachSceneMedia,
  normalizeSceneGraph,
  tagAvatarInScene,
  tagAvatarInSceneMedia,
  updateScene
} from "../src/domain/scene.js";
import {
  addSongStoryBeat,
  attachAvatarToSong,
  attachSceneToSong,
  attachSongMedia,
  auditHapaSongStore,
  normalizeHapaSong,
  normalizeHapaSongStore
} from "../src/domain/song.js";
import { normalizeAvatarCard, upsertAvatarMind } from "../src/domain/avatar.js";
import { normalizeSystemMediaLibrary } from "../src/domain/systemMedia.js";
import {
  COMIC_SONG_INGEST_REPORT_VERSION,
  comicSongIds,
  validateComicSongManifest
} from "../src/domain/comic-song-ingest.js";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function ingestComicSongManifest({
  manifestPath,
  root = SCRIPT_ROOT,
  apply = false,
  now = new Date().toISOString()
} = {}) {
  if (!manifestPath) throw new Error("--manifest is required.");
  const absoluteManifestPath = path.resolve(manifestPath);
  const rawManifest = hydrateManifestLyrics(readJson(absoluteManifestPath), path.dirname(absoluteManifestPath));
  const validation = validateComicSongManifest(rawManifest);
  if (!validation.ok) throw new Error(`Invalid comic-song manifest:\n- ${validation.errors.join("\n- ")}`);

  const manifest = validation.manifest;
  const paths = {
    avatarStore: path.join(root, "data/avatar-store.json"),
    sceneStore: path.join(root, "data/scene-store.json"),
    songbook: path.join(root, "data/dear-papa-songbook.json"),
    songStore: path.join(root, "data/hapa-songs-store.json"),
    mediaLibrary: path.join(root, "data/media-library.json"),
    mediaRoot: path.join(root, "data/media/comic-song"),
    backupsRoot: path.join(root, "data/backups"),
    reportsRoot: path.join(root, "data/merge-reports")
  };
  const requiredStores = Object.entries(paths).filter(([key]) => ["avatarStore", "sceneStore", "songbook", "songStore", "mediaLibrary"].includes(key));
  for (const [key, filePath] of requiredStores) {
    if (!existsSync(filePath)) throw new Error(`Missing ${key}: ${filePath}`);
  }

  let avatarStore = readJson(paths.avatarStore);
  const previousSceneStore = readJson(paths.sceneStore);
  let sceneGraph = normalizeSceneGraph(previousSceneStore);
  let songbook = readJson(paths.songbook);
  let songStore = readJson(paths.songStore);
  let mediaLibrary = normalizeSystemMediaLibrary(readJson(paths.mediaLibrary));
  const avatarById = new Map((avatarStore.avatars || []).map((avatar) => [avatar.id, avatar]));

  const report = {
    schemaVersion: COMIC_SONG_INGEST_REPORT_VERSION,
    mode: apply ? "apply" : "dry-run",
    manifestPath: absoluteManifestPath,
    manifestSchemaVersion: manifest.schemaVersion,
    album: manifest.album,
    packages: [],
    counts: {
      packages: manifest.packages.length,
      songsUpserted: 0,
      scenesUpserted: 0,
      avatarsLinked: 0,
      mediaCopied: 0,
      mediaRegistered: 0
    },
    startedAt: now,
    completedAt: null,
    backupDirectory: null,
    reportPath: null
  };

  for (const comic of manifest.packages) {
    const ids = comicSongIds(comic);
    const unknownAvatars = comic.avatars.filter((avatar) => !avatarById.has(avatar.id));
    if (unknownAvatars.length) {
      throw new Error(`${comic.id} references unknown Avatar IDs: ${unknownAvatars.map((avatar) => avatar.id).join(", ")}`);
    }
    const sources = collectSources(comic);
    for (const source of sources) {
      if (!existsSync(source.path)) throw new Error(`${comic.id} is missing ${source.role}: ${source.path}`);
    }

    const packageReport = {
      id: comic.id,
      title: comic.title,
      songId: ids.songId,
      songCardId: ids.songCardId,
      episodeId: ids.episodeId,
      sceneIds: [],
      avatarIds: comic.avatars.map((avatar) => avatar.id),
      media: []
    };

    const copiedAssets = new Map();
    for (const source of sources) {
      const asset = prepareMediaAsset({ source, comic, ids, root, now, copy: apply });
      copiedAssets.set(source.key, asset);
      packageReport.media.push({
        id: asset.id,
        role: source.role,
        sourcePath: source.path,
        storedPath: asset.metadata.storage.path,
        uri: asset.uri,
        sha256: asset.metadata.sha256
      });
      report.counts.mediaCopied += 1;
    }

    sceneGraph = upsertSceneCollection(sceneGraph, comic, ids, copiedAssets, now);
    packageReport.sceneIds = comic.pages.map((page) => ids.sceneId(page.pageNumber));
    report.counts.scenesUpserted += comic.pages.length;

    songbook = upsertSongbookCard(songbook, comic, ids, copiedAssets.get("audio"), manifest, now);
    songStore = normalizeHapaSongStore(songStore, songbook);
    const songIndex = songStore.songs.findIndex((song) => song.id === ids.songCardId || song.songId === ids.songId);
    if (songIndex < 0) throw new Error(`Song normalization did not produce ${ids.songId}.`);
    let song = normalizeHapaSong({
      ...songStore.songs[songIndex],
      title: comic.song.title,
      lyrics: {
        ...(songStore.songs[songIndex].lyrics || {}),
        status: "operator-supplied",
        sourceKind: "codex-comic-song-manifest",
        sourceId: comic.id,
        sourceTitle: comic.song.title,
        sourceTextType: "lyrics",
        text: comic.song.lyrics,
        sha256: sha256Text(comic.song.lyrics),
        matchScore: 1
      },
      lore: {
        ...(songStore.songs[songIndex].lore || {}),
        summary: comic.song.summary || `${comic.title} is a ten-page Echo Album song comic.`,
        learningThing: comic.song.learningThing || "Song, scene, avatar, and media provenance remain connected.",
        broadGameMechanic: comic.song.broadGameMechanic || "Draw the song with its ordered comic scenes and attached Avatars.",
        mood: comic.song.mood
      },
      tags: unique([...(songStore.songs[songIndex].tags || []), ...comic.song.tags, "codex-comic-ingest"]),
      audio: copiedAssets.get("audio")
        ? {
            ...(songStore.songs[songIndex].audio || {}),
            sourceNode: "hapa-avatar-builder",
            mp3Uri: copiedAssets.get("audio").uri,
            localPath: copiedAssets.get("audio").metadata.storage.path,
            localAvailable: true
          }
        : songStore.songs[songIndex].audio,
      updatedAt: now
    });

    for (const avatarLink of comic.avatars) {
      const avatar = avatarById.get(avatarLink.id);
      song = attachAvatarToSong(song, avatar, {
        role: avatarLink.role,
        reason: `${avatar.primaryName || avatar.id} appears in the ${comic.title} comic-song sequence.`,
        tags: ["echo-album", "comic-song", comic.id]
      });
    }
    for (const page of comic.pages) {
      const scene = sceneGraph.scenes.find((candidate) => candidate.id === ids.sceneId(page.pageNumber));
      song = attachSceneToSong(song, scene, {
        role: `comic-page-${String(page.pageNumber).padStart(2, "0")}`,
        reason: `${scene.title} acts out the song in the ordered comic sequence.`,
        tags: ["echo-album", "comic-song", comic.id]
      });
      song = addSongStoryBeat(song, {
        id: `song-beat-${comic.id}-page-${String(page.pageNumber).padStart(2, "0")}`,
        authorType: "human",
        authorName: comic.song.author || manifest.author,
        sceneId: scene.id,
        beatType: "comic-page",
        body: page.summary || page.caption || page.title,
        tags: ["comic-page", comic.id],
        createdAt: now
      });
    }
    for (const asset of copiedAssets.values()) {
      song = attachSongMedia(song, asset, {
        author: comic.rights.author || comic.song.author || manifest.author,
        source: "codex-comic-song-ingest",
        license: comic.rights.status,
        notes: comic.rights.notes || `${asset.name} imported from the completed comic package.`
      });
    }
    songStore.songs[songIndex] = song;
    songStore.audit = auditHapaSongStore(songStore.songs);
    songStore.updatedAt = now;
    report.counts.songsUpserted += 1;

    avatarStore = linkAvatars(avatarStore, comic, ids, song, manifest, now);
    avatarStore.avatars.forEach((avatar) => avatarById.set(avatar.id, avatar));
    report.counts.avatarsLinked += comic.avatars.length;

    mediaLibrary = registerMedia(mediaLibrary, comic, ids, copiedAssets, now);
    report.counts.mediaRegistered += copiedAssets.size;
    report.packages.push(packageReport);
  }

  report.completedAt = new Date().toISOString();
  if (apply) {
    const stamp = fileStamp(now);
    const backupDirectory = path.join(paths.backupsRoot, `comic-song-ingest-${stamp}`);
    mkdirSync(backupDirectory, { recursive: true });
    for (const [, filePath] of requiredStores) copyFileSync(filePath, path.join(backupDirectory, path.basename(filePath)));
    report.backupDirectory = backupDirectory;

    writeJsonAtomic(paths.avatarStore, avatarStore);
    writeJsonAtomic(paths.sceneStore, mergeSceneGraphExtensions(previousSceneStore, normalizeSceneGraph(sceneGraph)));
    writeJsonAtomic(paths.songbook, songbook);
    writeJsonAtomic(paths.songStore, songStore);
    writeJsonAtomic(paths.mediaLibrary, normalizeSystemMediaLibrary(mediaLibrary));

    mkdirSync(paths.reportsRoot, { recursive: true });
    const reportPath = path.join(paths.reportsRoot, `comic-song-ingest-${stamp}.json`);
    report.reportPath = reportPath;
    writeJsonAtomic(reportPath, report);
    writeJsonAtomic(path.join(paths.reportsRoot, "comic-song-ingest-latest.json"), report);
  }
  return report;
}

function upsertSceneCollection(graph, comic, ids, assets, now) {
  const next = normalizeSceneGraph(graph);
  upsertById(next.timelines, {
    id: ids.timelineId,
    name: "Echo Album Comic Timeline",
    description: "Ordered song-comic scenes imported into the Echo Album projection.",
    createdAt: existingCreatedAt(next.timelines, ids.timelineId, now),
    updatedAt: now
  });
  upsertById(next.places, {
    id: ids.placeId,
    name: `${comic.title} Storyworld`,
    type: "dreamspace",
    summary: `${comic.title} comic-song environment.`,
    lore: comic.song.summary,
    visualDescription: [comic.visualLanguage.style, comic.visualLanguage.mood, comic.visualLanguage.palette].filter(Boolean).join("; "),
    imagePrompt: comic.pages[0]?.productionPrompt || comic.pages[0]?.summary || "",
    tags: ["place", "echo-album", "comic-song", comic.id],
    sceneIds: comic.pages.map((page) => ids.sceneId(page.pageNumber)),
    avatarIds: comic.avatars.map((avatar) => avatar.id),
    canonStatus: comic.canonStatus,
    createdAt: existingCreatedAt(next.places, ids.placeId, now),
    updatedAt: now
  });
  upsertById(next.volumes, {
    id: ids.volumeId,
    title: "Echo Album Song Comics",
    seasonTitle: "Echo Album",
    quickPitch: "Repeatable comic-scene projections for Echo Album songs.",
    episodeIds: unique([...(next.volumes.find((volume) => volume.id === ids.volumeId)?.episodeIds || []), ids.episodeId]),
    canonStatus: "soft_canon",
    status: "active",
    createdAt: existingCreatedAt(next.volumes, ids.volumeId, now),
    updatedAt: now
  });
  upsertById(next.episodes, {
    id: ids.episodeId,
    title: comic.title,
    volumeId: ids.volumeId,
    episodeNumber: comic.id,
    quickPitch: comic.subtitle || comic.song.summary,
    overallNarrative: comic.song.summary,
    settingTimeline: ids.timelineId,
    avatarIds: comic.avatars.map((avatar) => avatar.id),
    sceneIds: comic.pages.map((page) => ids.sceneId(page.pageNumber)),
    placeIds: [ids.placeId],
    mechanicsTaught: ["song-to-scene association", "avatar-linked comic continuity"],
    canonStatus: comic.canonStatus,
    status: "done",
    completedAt: now,
    createdAt: existingCreatedAt(next.episodes, ids.episodeId, now),
    updatedAt: now
  });

  let result = normalizeSceneGraph(next);
  for (const page of comic.pages) {
    const sceneId = ids.sceneId(page.pageNumber);
    if (!result.scenes.some((scene) => scene.id === sceneId)) {
      result.scenes.unshift({
        id: sceneId,
        title: `${comic.title} — Page ${String(page.pageNumber).padStart(2, "0")}: ${page.title}`,
        placeId: ids.placeId,
        timelineId: ids.timelineId,
        episodeId: ids.episodeId,
        volumeId: ids.volumeId,
        canonicalTime: {
          timelineId: ids.timelineId,
          order: page.pageNumber,
          label: `${comic.title} / Page ${String(page.pageNumber).padStart(2, "0")}`,
          startsAt: "",
          duration: ""
        },
        summary: page.summary,
        quickPitch: page.caption,
        overallNarrative: page.summary,
        narrativeText: page.caption,
        actionBeats: [page.summary].filter(Boolean),
        productionPrompt: page.productionPrompt,
        aesthetic: comic.visualLanguage,
        canonStatus: comic.canonStatus,
        tags: page.tags,
        createdAt: now,
        updatedAt: now
      });
      result = normalizeSceneGraph(result);
    } else {
      result = updateScene(result, sceneId, {
        title: `${comic.title} — Page ${String(page.pageNumber).padStart(2, "0")}: ${page.title}`,
        placeId: ids.placeId,
        timelineId: ids.timelineId,
        episodeId: ids.episodeId,
        volumeId: ids.volumeId,
        canonicalTime: {
          timelineId: ids.timelineId,
          order: page.pageNumber,
          label: `${comic.title} / Page ${String(page.pageNumber).padStart(2, "0")}`,
          startsAt: "",
          duration: ""
        },
        summary: page.summary,
        quickPitch: page.caption,
        overallNarrative: page.summary,
        narrativeText: page.caption,
        actionBeats: [page.summary].filter(Boolean),
        productionPrompt: page.productionPrompt,
        aesthetic: comic.visualLanguage,
        canonStatus: comic.canonStatus,
        tags: page.tags,
        updatedAt: now
      });
    }
    const pageAsset = assets.get(`page-${page.pageNumber}`);
    result = attachSceneMedia(result, sceneId, { ...pageAsset, requirementId: "scene_comics" });
    for (const avatarId of page.avatarIds) {
      const avatarLink = comic.avatars.find((avatar) => avatar.id === avatarId);
      result = tagAvatarInScene(result, sceneId, avatarId, {
        role: avatarLink?.role || "lead",
        presence: "onscreen",
        tags: ["comic-presence", comic.id],
        note: avatarLink?.note || ""
      });
      result = tagAvatarInSceneMedia(result, sceneId, pageAsset.id, avatarId, {
        role: avatarLink?.role || "visible",
        tags: ["in-frame", "comic-page", comic.id]
      });
    }
    if (page.pageNumber === comic.pages[0].pageNumber) {
      for (const key of ["contactSheet", "pdf", "storyboard"]) {
        const asset = assets.get(key);
        if (!asset) continue;
        result = attachSceneMedia(result, sceneId, {
          ...asset,
          requirementId: key === "contactSheet" ? "scene_images" : "scene_comics"
        });
      }
    }
    const scene = result.scenes.find((candidate) => candidate.id === sceneId);
    const track = {
      id: `playlist-${comic.song.id}`,
      title: comic.song.title,
      artist: comic.song.author || "Calder",
      uri: assets.get("audio")?.uri || `hapa://echo-album/${comic.song.id}`,
      mood: comic.song.mood,
      tags: ["echo-album", "comic-song", comic.id],
      note: "Linked by the repeatable comic-song ingest process.",
      createdAt: now,
      updatedAt: now
    };
    scene.playlist = [track, ...(scene.playlist || []).filter((item) => item.id !== track.id)];
    scene.updatedAt = now;
    result.updatedAt = now;
  }
  return normalizeSceneGraph(result);
}

function upsertSongbookCard(songbook, comic, ids, audioAsset, manifest, now) {
  const next = structuredClone(songbook);
  next.songCards = Array.isArray(next.songCards) ? next.songCards : [];
  const existing = next.songCards.find((card) => card.id === ids.songCardId || card.songId === ids.songId);
  const maxTrack = Math.max(0, ...next.songCards.map((card) => Number(card.trackNumber || 0)));
  const author = comic.song.author || manifest.author;
  const card = {
    ...(existing || {}),
    id: ids.songCardId,
    schemaVersion: "hapa.foundation.song-lore-card.v1",
    cardType: "song_lore_card",
    albumId: manifest.album.id,
    albumTitle: manifest.album.title,
    albumAliases: manifest.album.aliases,
    albumLineage: {
      schemaVersion: "hapa.song-album-lineage.v1",
      canonicalWorkId: "echo-dear-papa-song-lineage",
      sourceAlbum: { id: manifest.album.id, title: manifest.album.title },
      activeProjection: { ...manifest.album.activeProjection, kind: "later-music-visualizer-projection" },
      identityRule: "Resolve stable song/card IDs and lyrics SHA-256 before album title.",
      status: "operator-confirmed-lineage"
    },
    trackNumber: existing?.trackNumber || maxTrack + 1,
    songId: ids.songId,
    title: comic.song.title,
    author,
    authorship: {
      author,
      albumAttributionRule: `Attribute the ${manifest.album.title} album to Author ${author}.`,
      singerPerspectiveRule: "Avatar performance perspective does not change authorship.",
      rightsStatus: comic.rights.status
    },
    loreStatus: "hapa_lore_not_hard_canon",
    performancePerspective: performancePerspective(comic),
    lore: {
      summary: comic.song.summary || `${comic.title} is an Echo Album comic-song.`,
      learning_thing: comic.song.learningThing || "Keep song, scene, media, and Avatar associations reversible and attributable.",
      broad_game_mechanic: comic.song.broadGameMechanic || "Draw with the ordered comic scenes and associated Avatars.",
      relationship_lens: comic.avatars.map((avatar) => `${avatar.name || avatar.id}: ${avatar.role}`).join("; ")
    },
    lyrics: {
      status: "operator-supplied",
      matchScore: 1,
      sourceKind: "codex-comic-song-manifest",
      sourceId: comic.id,
      sourceTitle: comic.song.title,
      sourceTextType: "lyrics",
      text: comic.song.lyrics,
      sha256: sha256Text(comic.song.lyrics),
      candidateMatches: []
    },
    mood: comic.song.mood,
    learningThing: comic.song.learningThing,
    broadGameMechanic: comic.song.broadGameMechanic,
    genesisUse: [
      "Use the ordered comic scenes as visual story context.",
      "Keep all Avatar, media, and song links source-attributed.",
      "Treat the comic interpretation as soft canon pending human review."
    ],
    mediaPrompts: comic.pages.map((page) => ({
      id: `comic-page-${String(page.pageNumber).padStart(2, "0")}`,
      kind: "comic-page",
      prompt: page.productionPrompt || page.summary
    })),
    sourceAnchors: [
      {
        id: `codex-comic-${comic.id}`,
        kind: "codex-comic-song-package",
        title: comic.title,
        path: comic.source.root,
        confidence: "hard"
      }
    ],
    sync: {
      schemaVersion: "hapa.comic-song-card-sync.v1",
      sourceManifestId: comic.id,
      localPath: audioAsset?.metadata?.storage?.path || "",
      updatedAt: now
    },
    lineage: {
      sourceKind: "codex-comic-song-ingest",
      sourceManifestId: comic.id,
      localDir: comic.source.root,
      lyricsSha256: sha256Text(comic.song.lyrics)
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  upsertById(next.songCards, card);
  next.updatedAt = now;
  next.sync = {
    ...(next.sync || {}),
    comicSongIngest: {
      schemaVersion: "hapa.comic-song-card-sync.v1",
      packageIds: unique([...(next.sync?.comicSongIngest?.packageIds || []), comic.id]),
      updatedAt: now
    }
  };
  return next;
}

function linkAvatars(store, comic, ids, song, manifest, now) {
  const next = structuredClone(store);
  next.avatars = (next.avatars || []).map((avatar) => {
    const link = comic.avatars.find((candidate) => candidate.id === avatar.id);
    if (!link) return avatar;
    const normalized = normalizeAvatarCard(avatar);
    const currentContext = normalized.mind.dearPapaSongContext || {};
    const songChoice = {
      id: `avatar-song-choice-${avatar.id}-${ids.songId}`,
      schemaVersion: "hapa.avatar-dear-papa-song-choice.v1",
      songId: ids.songId,
      cardId: ids.songCardId,
      title: comic.song.title,
      albumId: manifest.album.id,
      albumTitle: manifest.album.title,
      albumAliases: manifest.album.aliases,
      albumLineage: song.albumLineage,
      activeAlbumProjection: manifest.album.activeProjection,
      lineageKey: `${manifest.album.id}:${ids.songId}`,
      author: comic.song.author || manifest.author,
      perspective: {
        avatarId: avatar.id,
        avatarName: avatar.primaryName || link.name,
        voiceFunction: link.role,
        relationshipFocus: ["comic-scene", "song-story", "ensemble"]
      },
      whySelected: `${avatar.primaryName || avatar.id} appears as ${link.role} in ${comic.title}.`,
      genesisInstruction: `Use ${comic.title}'s ordered scenes as soft-canon visual context.`,
      communicationUse: "comic_song_scene_context",
      lyricsSha256: sha256Text(comic.song.lyrics),
      sourcePath: comic.source.root,
      status: "active",
      createdAt: currentContext.selectedSongCards?.find((choice) => choice.id === `avatar-song-choice-${avatar.id}-${ids.songId}`)?.createdAt || now,
      updatedAt: now
    };
    const selectedSongCards = upsertArray(currentContext.selectedSongCards || [], songChoice);
    const sceneContexts = comic.pages.map((page) => ({
      id: `avatar-context-${avatar.id}-${ids.sceneId(page.pageNumber)}`,
      contextId: ids.sceneId(page.pageNumber),
      label: `${comic.title} — ${page.title}`,
      kind: "scene",
      avatarBelief: link.note || `${avatar.primaryName || avatar.id} remembers this scene through the song.`,
      publicSummary: page.summary,
      classification: "soft_canon",
      confidence: "soft",
      visibility: "shared",
      status: "active",
      createdAt: normalized.mind.contextMap?.find((entry) => entry.id === `avatar-context-${avatar.id}-${ids.sceneId(page.pageNumber)}`)?.createdAt || now,
      updatedAt: now
    }));
    return upsertAvatarMind(normalized, {
      dearPapaSongContext: {
        ...currentContext,
        albumId: manifest.album.id,
        albumTitle: manifest.album.title,
        albumAliases: manifest.album.aliases,
        selectedSongCards,
        sourceAnchors: unique([...(currentContext.sourceAnchors || []), comic.source.root]),
        genesisUse: unique([
          ...(currentContext.genesisUse || []),
          `Use ${comic.title} scenes as linked Echo Album visual context.`
        ]),
        updatedAt: now
      },
      contextMap: sceneContexts.reduce((entries, entry) => upsertArray(entries, entry), normalized.mind.contextMap || []),
      updatedAt: now
    });
  });
  next.updatedAt = now;
  return next;
}

function registerMedia(library, comic, ids, assets, now) {
  const next = normalizeSystemMediaLibrary(library);
  for (const asset of assets.values()) {
    const sceneIds = asset.metadata.comicPageNumber
      ? [ids.sceneId(asset.metadata.comicPageNumber)]
      : comic.pages.length
        ? [ids.sceneId(comic.pages[0].pageNumber)]
        : [];
    const relationships = [
      ...sceneIds.map((sceneId) => ({
        ownerType: "scene",
        ownerId: sceneId,
        ownerName: comic.title,
        role: asset.requirementId || "scene_comics"
      })),
      {
        ownerType: "song",
        ownerId: ids.songId,
        ownerName: comic.song.title,
        role: asset.metadata.comicMediaRole
      },
      ...comic.avatars.map((avatar) => ({
        ownerType: "avatar",
        ownerId: avatar.id,
        ownerName: avatar.name || avatar.id,
        role: "appears-in-comic-song"
      }))
    ];
    const record = {
      id: `system-media-${asset.id}`,
      sourceKind: "codex-comic-song-ingest",
      name: asset.name,
      mediaType: asset.type,
      uri: asset.uri,
      sourcePath: asset.metadata.sourcePath,
      sourceRoots: [comic.source.root].filter(Boolean),
      contentFingerprint: asset.metadata.sha256,
      sizeBytes: asset.metadata.sizeBytes,
      width: asset.metadata.width,
      height: asset.metadata.height,
      documentKind: documentKind(asset),
      reviewPriority: "none",
      reviewStatus: "assigned",
      tags: asset.tags,
      relationships,
      asset,
      notes: `${comic.title} / ${comic.song.title}`,
      createdAt: next.records.find((record) => record.id === `system-media-${asset.id}`)?.createdAt || now,
      updatedAt: now
    };
    next.records = upsertArray(next.records, record);
  }
  next.batches = upsertArray(next.batches || [], {
    id: `comic-song-ingest-${comic.id}`,
    schemaVersion: "hapa.system-media-import-batch.v1",
    sourceKind: "codex-comic-song-ingest",
    packageId: comic.id,
    assetIds: [...assets.values()].map((asset) => asset.id),
    sceneIds: comic.pages.map((page) => ids.sceneId(page.pageNumber)),
    songId: ids.songId,
    avatarIds: comic.avatars.map((avatar) => avatar.id),
    updatedAt: now
  });
  next.updatedAt = now;
  return normalizeSystemMediaLibrary(next);
}

function collectSources(comic) {
  const sources = comic.pages.map((page) => ({
    key: `page-${page.pageNumber}`,
    role: "comic-page",
    path: page.path,
    pageNumber: page.pageNumber,
    requirementId: "scene_comics"
  }));
  for (const [key, role, requirementId] of [
    ["pdf", "comic-pdf", "scene_comics"],
    ["contactSheet", "contact-sheet", "scene_images"],
    ["storyboard", "storyboard", "scene_comics"],
    ["audio", "song-audio", null]
  ]) {
    if (comic.source[key]) sources.push({ key, role, path: comic.source[key], pageNumber: null, requirementId });
  }
  return sources;
}

function prepareMediaAsset({ source, comic, ids, root, now, copy }) {
  const extension = path.extname(source.path).toLowerCase();
  const fileName = source.pageNumber
    ? `page-${String(source.pageNumber).padStart(2, "0")}${extension}`
    : `${source.key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}${extension}`;
  const relative = path.join("comic-song", comic.id, fileName);
  const storedPath = path.join(root, "data/media", relative);
  const buffer = readFileSync(source.path);
  const dimensions = mediaDimensions(buffer, extension);
  if (copy) {
    mkdirSync(path.dirname(storedPath), { recursive: true });
    copyFileSync(source.path, storedPath);
  }
  const type = mediaType(extension);
  return {
    id: ids.assetId(source.pageNumber ? "page" : source.key, source.pageNumber),
    name: source.pageNumber
      ? `${comic.title} Page ${String(source.pageNumber).padStart(2, "0")}`
      : `${comic.title} ${titleize(source.role)}`,
    uri: `/${path.posix.join("media", relative.split(path.sep).join("/"))}`,
    type,
    requirementId: source.requirementId,
    tags: unique([
      "comic-song",
      "echo-album",
      comic.id,
      source.role,
      source.pageNumber ? `page-${String(source.pageNumber).padStart(2, "0")}` : ""
    ]),
    metadata: {
      sourcePath: source.path,
      originalFileName: path.basename(source.path),
      sizeBytes: statSync(source.path).size,
      sha256: sha256Buffer(buffer),
      width: dimensions.width,
      height: dimensions.height,
      comicPackageId: comic.id,
      comicPageNumber: source.pageNumber,
      comicMediaRole: source.role,
      generationWorkflow: comic.visualLanguage.generationWorkflow,
      storage: {
        provider: "hapa-avatar-builder-local",
        path: storedPath,
        relativePath: path.relative(root, storedPath)
      }
    },
    processing: {
      status: "attached",
      importedBy: "ingest-comic-song-package",
      importedAt: now
    },
    createdAt: now,
    updatedAt: now
  };
}

function performancePerspective(comic) {
  const selected = comic.avatars.find((avatar) => avatar.performancePerspective) || comic.avatars[0] || {};
  return {
    team_color: "",
    team_id: "",
    avatar_id: selected.id || "",
    avatar_name: selected.name || "",
    voice_function: selected.role || "comic-song narrator",
    relationship_focus: ["comic-scene", "ensemble", "echo-album"]
  };
}

function mediaDimensions(buffer, extension) {
  if (extension === ".png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if ([".jpg", ".jpeg"].includes(extension)) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (!length) break;
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
}

function mediaType(extension) {
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) return "image";
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(extension)) return "video";
  if ([".mp3", ".wav", ".m4a", ".flac", ".aac"].includes(extension)) return "audio";
  if (extension === ".pdf") return "pdf";
  return "doc";
}

function documentKind(asset) {
  if (asset.metadata.comicMediaRole === "comic-page") return "comic_page";
  if (asset.metadata.comicMediaRole === "comic-pdf") return "comic";
  if (asset.metadata.comicMediaRole === "contact-sheet") return "comic_contact_sheet";
  if (asset.metadata.comicMediaRole === "storyboard") return "comic_storyboard";
  if (asset.metadata.comicMediaRole === "song-audio") return "song_audio";
  return "comic_media";
}

function upsertById(items, next) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index >= 0) items[index] = { ...items[index], ...next };
  else items.push(next);
  return items;
}

function upsertArray(items, next) {
  const copy = [...items];
  upsertById(copy, next);
  return copy;
}

export function mergeSceneGraphExtensions(previous, next) {
  const merged = { ...(previous || {}), ...(next || {}) };
  for (const collection of ["scenes", "places", "timelines", "volumes", "episodes"]) {
    const previousById = new Map((previous?.[collection] || []).map((record) => [record.id, record]));
    merged[collection] = (next?.[collection] || []).map((record) => ({
      ...(previousById.get(record.id) || {}),
      ...record
    }));
  }
  return merged;
}

function existingCreatedAt(items, id, fallback) {
  return items.find((item) => item.id === id)?.createdAt || fallback;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function hydrateManifestLyrics(input, manifestDirectory) {
  const next = structuredClone(input);
  const packages = Array.isArray(next.packages) ? next.packages : next.package ? [next.package] : [];
  for (const comic of packages) {
    const lyricsPath = comic?.song?.lyricsPath;
    if (!lyricsPath || comic.song.lyrics) continue;
    const absoluteLyricsPath = path.isAbsolute(lyricsPath) ? lyricsPath : path.resolve(manifestDirectory, lyricsPath);
    if (!existsSync(absoluteLyricsPath)) throw new Error(`Missing lyricsPath: ${absoluteLyricsPath}`);
    comic.song.lyrics = readFileSync(absoluteLyricsPath, "utf8").trim();
    comic.song.lyricsPath = absoluteLyricsPath;
  }
  return next;
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.comic-song-${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, filePath);
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(value, "utf8"));
}

function fileStamp(value) {
  return value.replace(/[:.]/gu, "-");
}

function titleize(value) {
  return String(value || "").replace(/[-_]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseArgs(argv) {
  const options = { apply: false, root: SCRIPT_ROOT, manifestPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--manifest") options.manifestPath = argv[++index] || "";
    else if (arg.startsWith("--manifest=")) options.manifestPath = arg.slice("--manifest=".length);
    else if (arg === "--root") options.root = path.resolve(argv[++index] || SCRIPT_ROOT);
    else if (arg.startsWith("--root=")) options.root = path.resolve(arg.slice("--root=".length));
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  npm run comic:ingest -- --manifest /absolute/path/to/manifest.json",
    "  npm run comic:ingest -- --manifest /absolute/path/to/manifest.json --apply",
    "",
    "Dry-run is the default. --apply backs up all touched stores, copies media,",
    "upserts Scene/Song/Avatar/media records, and writes a merge report."
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    const report = ingestComicSongManifest(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
