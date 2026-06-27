#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeItemManagerStore } from "../src/domain/item.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const READINESS_DIR = path.join(DATA_DIR, "tarot-production-readiness");
const RUN_DIR = path.join(READINESS_DIR, "enrichment-runs");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const QUEUE_PATH = path.join(READINESS_DIR, "enrichment-queue.json");
const REGISTRY_PATH = process.env.HAPA_SONG_REGISTRY_DATA || "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";

const args = parseArgs(process.argv.slice(2));
const limit = Number(args.get("limit") || 0);
const dryRun = args.has("dry-run") || args.has("no-write");
const skipVideos = args.has("skip-videos");
const onlyKind = args.get("kind") || "";
const ffmpegPath = process.env.FFMPEG || "ffmpeg";
const width = Number(args.get("width") || 768);
const height = Number(args.get("height") || 1076);
const duration = Number(args.get("duration") || 2.5);
const fps = Number(args.get("fps") || 12);
const fontFile = firstExisting([
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/Library/Fonts/Arial.ttf"
]);

await main();

async function main() {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  const runId = `tarot-production-enrichment-${stamp}`;
  await fs.mkdir(RUN_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const itemStore = await readJson(ITEM_STORE_PATH);
  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const songStore = await readJson(SONG_STORE_PATH);
  const songbook = await readJson(SONGBOOK_PATH);
  const queue = await readJson(QUEUE_PATH);
  const registry = existsSync(REGISTRY_PATH) ? await readJson(REGISTRY_PATH) : { songs: [] };
  const cardsById = new Map((itemStore.cards || []).map((card) => [card.id, card]));
  const songs = songStore.songs || [];
  const songIndex = buildSongIndex(songs, songbook.songCards || [], registry.songs || []);
  const avatarById = new Map((avatarStore.avatars || []).map((avatar) => [avatar.id, avatar]));
  const registryById = new Map((registry.songs || []).map((song) => [song.id, song]));
  const jobs = (queue.jobs || [])
    .filter((job) => job.status === "queued")
    .filter((job) => !onlyKind || job.kind === onlyKind)
    .slice(0, limit > 0 ? limit : undefined);

  if (!dryRun) {
    await fs.copyFile(ITEM_STORE_PATH, path.join(BACKUP_DIR, `item-manager-store.before-${runId}.json`));
    await fs.copyFile(QUEUE_PATH, path.join(BACKUP_DIR, `tarot-enrichment-queue.before-${runId}.json`));
  }

  const report = {
    schemaVersion: "hapa.tarot-production-enrichment-run.v1",
    runId,
    runAt: now,
    source: "scripts/run-tarot-production-enrichment-queue.mjs",
    dryRun,
    input: {
      queueGeneratedAt: queue.generatedAt || "",
      queuedJobs: (queue.jobs || []).filter((job) => job.status === "queued").length,
      selectedJobs: jobs.length,
      limit: limit || null,
      onlyKind: onlyKind || null
    },
    counts: {
      completed: 0,
      failed: 0,
      skipped: 0,
      byKindCompleted: {},
      videosRendered: 0,
      songLinksAttached: 0
    },
    jobs: []
  };

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const card = cardsById.get(job.cardId);
    if (!card) {
      recordJob(report, job, "failed", { reason: "card-not-found" });
      markJob(job, "failed", now, { reason: "card-not-found" });
      continue;
    }
    try {
      if (job.kind === "dear-papa-song-link") {
        const result = attachDearPapaSong(card, songs, songIndex, avatarById, now, runId);
        report.counts.songLinksAttached += result.attached ? 1 : 0;
        complete(report, job, now, result);
      } else if (job.kind === "looping-video") {
        if (skipVideos) {
          recordJob(report, job, "skipped", { reason: "skip-videos" });
          markJob(job, "skipped", now, { reason: "skip-videos" });
          report.counts.skipped += 1;
          continue;
        }
        const result = await renderAndAttachLoop(card, job, registryById, songIndex, runId, now);
        report.counts.videosRendered += result.rendered ? 1 : 0;
        complete(report, job, now, result);
      } else {
        recordJob(report, job, "skipped", { reason: `unsupported-kind:${job.kind}` });
        markJob(job, "skipped", now, { reason: `unsupported-kind:${job.kind}` });
        report.counts.skipped += 1;
      }
    } catch (error) {
      const result = { reason: error.message, stack: error.stack };
      recordJob(report, job, "failed", result);
      markJob(job, "failed", now, result);
      report.counts.failed += 1;
    }
  }

  itemStore.updatedAt = now;
  itemStore.auditRuns = [
    ...(itemStore.auditRuns || []),
    {
      id: runId,
      schemaVersion: "hapa.item-manager-audit-run.v1",
      kind: "tarot-production-enrichment",
      generatedAt: now,
      completedJobs: report.counts.completed,
      videosRendered: report.counts.videosRendered,
      songLinksAttached: report.counts.songLinksAttached,
      source: "scripts/run-tarot-production-enrichment-queue.mjs"
    }
  ];
  queue.updatedAt = now;
  queue.lastEnrichmentRun = {
    runId,
    runAt: now,
    completed: report.counts.completed,
    failed: report.counts.failed,
    skipped: report.counts.skipped,
    videosRendered: report.counts.videosRendered,
    songLinksAttached: report.counts.songLinksAttached
  };
  queue.counts = {
    jobs: (queue.jobs || []).length,
    byKind: countBy(queue.jobs || [], (job) => job.kind),
    byStatus: countBy(queue.jobs || [], (job) => job.status)
  };

  const runPath = path.join(RUN_DIR, `${runId}.json`);
  const latestPath = path.join(RUN_DIR, "latest-enrichment-run.json");
  if (!dryRun) {
    await writeJson(ITEM_STORE_PATH, normalizeItemManagerStore(itemStore));
    await writeJson(QUEUE_PATH, queue);
    await writeJson(runPath, report);
    await writeJson(latestPath, report);
  }

  console.log(JSON.stringify({
    ok: report.counts.failed === 0,
    dryRun,
    runId,
    selectedJobs: jobs.length,
    ...report.counts,
    reportPath: dryRun ? "" : path.relative(ROOT, latestPath)
  }, null, 2));
}

function complete(report, job, now, result) {
  markJob(job, "complete", now, result);
  recordJob(report, job, "complete", result);
  report.counts.completed += 1;
  report.counts.byKindCompleted[job.kind] = (report.counts.byKindCompleted[job.kind] || 0) + 1;
}

function attachDearPapaSong(card, songs, songIndex, avatarById, now, runId) {
  const song = chooseSongForCard(card, songs, songIndex, avatarById);
  if (!song) return { attached: false, reason: "no-song-candidate" };
  const songId = song.songId || song.id;
  const songCardId = song.cardId || song.id;
  const registryTrackId = song.audio?.registryTrackId || song.registryTrackId || song.lineage?.registryTrackId || "";
  const avatarId = chooseAvatarIdForCard(card, avatarById, song);
  const avatar = avatarById.get(avatarId);
  const link = {
    id: `tarot-enrichment-song-link-${slug(card.id)}-${slug(songId)}`,
    avatarId: avatarId || "",
    avatarName: avatarName(avatar),
    songId,
    songCardId,
    songTitle: song.title,
    cardId: card.id,
    sourceChoiceId: runId,
    why: `${card.title} is linked to ${song.title} during Tarot production enrichment so the card has playable Dear Papa audio and avatar-readable canon context.`,
    canonReason: "Generated as soft canon from the recovered roster song/card enrichment queue.",
    objectiveFit: "Keeps card, avatar, and song stores mutually discoverable.",
    deckInfluence: "Enables music drop-zone and reading context for this card.",
    futureInfluence: "Human review may swap the song without losing provenance.",
    vibe: song.lore?.mood || song.performancePerspective?.teamColor || "",
    sourcePath: "scripts/run-tarot-production-enrichment-queue.mjs",
    confidence: "generated",
    createdAt: now,
    updatedAt: now
  };
  ensureTarotCardDetails(card);
  card.tarotCard.songLinks = uniqueBy([
    ...(card.tarotCard.songLinks || []),
    link
  ], (item) => item.songCardId || item.songId || item.id);
  card.connections ||= {};
  card.connections.itemIds = unique([...(card.connections.itemIds || []), song.id, song.cardId, song.songId, registryTrackId].filter(Boolean));
  card.connections.avatarIds = unique([...(card.connections.avatarIds || []), avatarId].filter(Boolean));
  card.tags = unique([...(card.tags || []), "dear-papa-song-linked", "tarot-production-enriched"]);
  card.history = [
    ...(card.history || []),
    {
      id: `history-${runId}-${slug(card.id)}-song`,
      event: "dear-papa-song-linked",
      at: now,
      actor: "tarot-production-enrichment",
      note: `Linked ${song.title} to satisfy Tarot production enrichment.`
    }
  ];
  card.updatedAt = now;
  return {
    attached: true,
    songId,
    songTitle: song.title,
    songCardId,
    registryTrackId,
    avatarId
  };
}

async function renderAndAttachLoop(card, job, registryById, songIndex, runId, now) {
  const source = resolveSourceImage(card, registryById, songIndex);
  if (dryRun) {
    return {
      rendered: false,
      planned: true,
      sourceKind: source.kind,
      sourceUri: source.uri || "",
      sourcePath: source.path || ""
    };
  }
  const mediaRoot = path.join(MEDIA_DIR, "tarot-enrichment", runId);
  await fs.mkdir(mediaRoot, { recursive: true });
  const base = `${slug(card.id)}-${shortHash(card.title || card.id)}`;
  const videoPath = path.join(mediaRoot, `${base}.mp4`);
  const posterPath = path.join(mediaRoot, `${base}-poster.jpg`);
  const titleTextPath = path.join(mediaRoot, `${base}.txt`);
  const uriBase = `/media/tarot-enrichment/${runId}`;
  const videoUri = `${uriBase}/${base}.mp4`;
  const posterUri = `${uriBase}/${base}-poster.jpg`;

  if (source.path && existsSync(source.path)) {
    renderImageLoop(source.path, videoPath);
  } else {
    await fs.writeFile(titleTextPath, wrapTitle(card.title || job.cardTitle || "Hapa Tarot Card"), "utf8");
    renderTitleLoop(titleTextPath, videoPath, card);
  }
  renderPoster(videoPath, posterPath);
  const sizeBytes = statSync(videoPath).size;
  const assetId = `tarot-enrichment-loop-${slug(card.id)}`;
  const posterAssetId = `${assetId}-poster`;
  const videoAsset = {
    id: assetId,
    title: `${card.title} looping tarot enrichment`,
    type: "video",
    uri: videoUri,
    thumbnailUri: posterUri,
    sourceAssetId: source.assetId || "",
    avatarId: chooseFirst(card.connections?.avatarIds || []),
    requirementId: "tarot_looping_video",
    mimeType: "video/mp4",
    tags: unique(["tarot-card", "looping-video", "tarot-production-enriched", "generated", "needs-review", ...(card.tags || []).slice(0, 6)]),
    confidence: "generated",
    notes: source.path
      ? "FFmpeg source-attributed loop generated from existing card/source image."
      : "FFmpeg source-attributed title-card loop generated because no source image was attached.",
    metadata: {
      runId,
      jobId: job.id,
      sourceKind: source.kind,
      sourceUri: source.uri || "",
      sourcePath: source.path || "",
      width,
      height,
      duration,
      fps,
      sizeBytes,
      generatedAt: now
    },
    createdAt: now,
    updatedAt: now
  };
  const posterAsset = {
    id: posterAssetId,
    title: `${card.title} looping tarot poster`,
    type: "image",
    uri: posterUri,
    thumbnailUri: posterUri,
    sourceAssetId: assetId,
    avatarId: videoAsset.avatarId,
    requirementId: "tarot_looping_video_poster",
    mimeType: "image/jpeg",
    tags: ["tarot-card", "looping-video-poster", "tarot-production-enriched", "generated"],
    confidence: "generated",
    notes: "Poster frame extracted from generated tarot loop.",
    metadata: { runId, jobId: job.id, generatedAt: now },
    createdAt: now,
    updatedAt: now
  };
  card.mediaAssets = uniqueBy([
    ...(card.mediaAssets || []),
    videoAsset,
    posterAsset
  ], (asset) => asset.uri || asset.id);
  ensureTarotCardDetails(card);
  card.tarotCard.mediaLinks = uniqueBy([
    ...(card.tarotCard.mediaLinks || []),
    {
      id: `media-link-${assetId}`,
      imageAssetId: posterAssetId,
      videoAssetId: assetId,
      imageUri: source.uri && isImageUri(source.uri) ? source.uri : posterUri,
      videoUri,
      posterUri,
      confidence: "generated",
      reason: "Generated by Tarot production enrichment queue to satisfy looping-video readiness."
    }
  ], (link) => link.videoUri || link.id);
  if (card.episodeCard) {
    card.episodeCard.mediaLinks = uniqueBy([
      ...(card.episodeCard.mediaLinks || []),
      {
        id: `episode-media-link-${assetId}`,
        imageAssetId: posterAssetId,
        videoAssetId: assetId,
        imageUri: source.uri && isImageUri(source.uri) ? source.uri : posterUri,
        videoUri,
        posterUri,
        confidence: "generated",
        reason: "Generated by Tarot production enrichment queue to satisfy looping-video readiness."
      }
    ], (link) => link.videoUri || link.id);
  }
  card.tags = unique([...(card.tags || []), "looping-video", "tarot-production-enriched"]);
  card.history = [
    ...(card.history || []),
    {
      id: `history-${runId}-${slug(card.id)}-loop`,
      event: "looping-video-generated",
      at: now,
      actor: "tarot-production-enrichment",
      note: `Generated ${videoUri} for Tarot production readiness.`
    }
  ];
  card.updatedAt = now;
  return {
    rendered: true,
    videoUri,
    posterUri,
    sourceKind: source.kind,
    sourceUri: source.uri || "",
    sourcePath: source.path || "",
    sizeBytes
  };
}

function renderImageLoop(inputPath, outputPath) {
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p`;
  runFfmpeg([
    "-y",
    "-loglevel", "error",
    "-loop", "1",
    "-framerate", String(fps),
    "-t", String(duration),
    "-i", inputPath,
    "-vf", vf,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "32",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath
  ]);
}

function renderTitleLoop(titleTextPath, outputPath, card) {
  const subtitle = `${card.cardType || "hapa_card"} | Hapa Tarot Enrichment`;
  const filters = [
    `drawtext=${fontFile ? `fontfile=${escapeFilterPath(fontFile)}:` : ""}textfile=${escapeFilterPath(titleTextPath)}:fontcolor=0xF8FAFC:fontsize=52:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2-60:box=1:boxcolor=0x00000066:boxborderw=24`,
    `drawtext=${fontFile ? `fontfile=${escapeFilterPath(fontFile)}:` : ""}text=${escapeDrawText(subtitle)}:fontcolor=0x8BD3FF:fontsize=24:x=(w-text_w)/2:y=h-150`,
    `drawtext=${fontFile ? `fontfile=${escapeFilterPath(fontFile)}:` : ""}text=${escapeDrawText("source-attributed generated loop")}:fontcolor=0xC7D2FE:fontsize=20:x=(w-text_w)/2:y=h-105`,
    "format=yuv420p"
  ].join(",");
  runFfmpeg([
    "-y",
    "-loglevel", "error",
    "-f", "lavfi",
    "-i", `color=c=0x101522:s=${width}x${height}:r=${fps}:d=${duration}`,
    "-vf", filters,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "32",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath
  ]);
}

function renderPoster(videoPath, posterPath) {
  runFfmpeg([
    "-y",
    "-loglevel", "error",
    "-i", videoPath,
    "-frames:v", "1",
    "-vf", "scale=384:-2",
    posterPath
  ]);
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || result.stdout || args.join(" ")}`);
  }
}

function resolveSourceImage(card, registryById, songIndex) {
  const mediaImage = findImageAsset(card);
  if (mediaImage?.path) return mediaImage;
  const registryTrackId = findRegistryTrackId(card, songIndex);
  const registrySong = registryTrackId ? registryById.get(registryTrackId) : null;
  const coverPath = registrySong?.raw?._hapaPlaylistExport?.coverPath || "";
  if (coverPath && existsSync(coverPath)) {
    return {
      kind: "registry-cover",
      uri: `/api/song-registry/covers/${encodeURIComponent(registryTrackId)}`,
      path: coverPath,
      assetId: `registry-cover-${registryTrackId}`
    };
  }
  return { kind: "title-card", uri: "", path: "", assetId: "" };
}

function findImageAsset(card = {}) {
  const candidates = [
    ...(card.mediaAssets || []).flatMap((asset) => [
      { uri: asset.uri, assetId: asset.id },
      { uri: asset.thumbnailUri, assetId: asset.id }
    ]),
    ...(card.tarotCard?.mediaLinks || []).flatMap((link) => [
      { uri: link.imageUri, assetId: link.imageAssetId },
      { uri: link.posterUri, assetId: link.imageAssetId }
    ]),
    ...(card.episodeCard?.mediaLinks || []).flatMap((link) => [
      { uri: link.imageUri, assetId: link.imageAssetId },
      { uri: link.posterUri, assetId: link.imageAssetId }
    ])
  ].filter((candidate) => isImageUri(candidate.uri));
  for (const candidate of candidates) {
    const localPath = uriToLocalPath(candidate.uri);
    if (localPath && existsSync(localPath)) {
      return { kind: "card-image", uri: candidate.uri, path: localPath, assetId: candidate.assetId || "" };
    }
  }
  return null;
}

function findRegistryTrackId(card, songIndex) {
  const refs = [
    ...(card.tarotCard?.songLinks || []),
    ...(card.episodeCard?.songLinks || []),
    ...(card.songLinks || [])
  ];
  for (const ref of refs) {
    const direct = ref.registryTrackId || ref.registry_track_id;
    if (direct) return direct;
    const song = songIndex.byKey.get(ref.songCardId || ref.songId || ref.id || "") ||
      songIndex.byTitle.get(normalizeSongTitle(ref.songTitle || ref.title || ""));
    const id = song?.audio?.registryTrackId || song?.registryTrackId || song?.lineage?.registryTrackId || song?.id;
    if (id) return id;
  }
  for (const id of card.connections?.itemIds || []) {
    const song = songIndex.byKey.get(id);
    const registryTrackId = song?.audio?.registryTrackId || song?.registryTrackId || song?.lineage?.registryTrackId || song?.id;
    if (registryTrackId) return registryTrackId;
  }
  return "";
}

function chooseSongForCard(card, songs, songIndex, avatarById) {
  const refs = [
    ...(card.tarotCard?.songLinks || []),
    ...(card.episodeCard?.songLinks || [])
  ];
  for (const ref of refs) {
    const song = songIndex.byKey.get(ref.songCardId || ref.songId || ref.id || "") ||
      songIndex.byTitle.get(normalizeSongTitle(ref.songTitle || ref.title || ""));
    if (song) return song;
  }
  const avatarSongIds = (card.connections?.avatarIds || [])
    .flatMap((avatarId) => avatarById.get(avatarId)?.mind?.dearPapaSongContext?.selectedSongCards || [])
    .map((choice) => choice.songId || choice.cardId)
    .filter(Boolean);
  for (const key of avatarSongIds) {
    const song = songIndex.byKey.get(key);
    if (song) return song;
  }
  const cardText = normalizeTokens(`${card.title || ""} ${(card.tags || []).join(" ")} ${card.summary || ""} ${card.lore || ""}`);
  const scored = songs.map((song, index) => ({
    song,
    score: overlapScore(cardText, normalizeTokens(`${song.title || ""} ${(song.tags || []).join(" ")} ${song.lore?.summary || ""} ${song.lore?.learningThing || ""}`)) +
      ((stableNumber(`${card.id}:${song.id}`) + index) % 11) * 0.01
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.song || null;
}

function chooseAvatarIdForCard(card, avatarById, song) {
  for (const avatarId of card.connections?.avatarIds || []) {
    if (avatarById.has(avatarId)) return avatarId;
  }
  for (const link of song?.attachments?.avatarLinks || []) {
    if (avatarById.has(link.avatarId)) return link.avatarId;
  }
  return song?.performancePerspective?.avatarId || song?.performancePerspective?.avatar_id || "";
}

function ensureTarotCardDetails(card) {
  if (card.tarotCard) return;
  card.tarotCard = {
    schemaVersion: "hapa.tarot-card-details.v1",
    mainType: card.cardType || "hapa_card",
    tarotNumber: "",
    title: card.title,
    subtitle: "Enriched Hapa Card",
    archetype: card.cardType || "hapa_card",
    keywords: unique([...(card.tags || []), card.cardType, card.kind]).slice(0, 12),
    flavorText: "",
    effectTitle: "Production Enriched",
    effectText: "This card was given media/song links by the Tarot production enrichment queue.",
    catalog: {
      collectionId: "tarot-production-enrichment",
      collectionTitle: "Tarot Production Enrichment",
      family: "Hapa Tarot",
      typeLabel: card.cardType || "Hapa Card",
      sequence: 0,
      confidence: "generated"
    },
    identity: {
      systemName: "Hapa Tarot System",
      deckName: "Production Enriched Cards",
      tarotType: card.title,
      tarotCardName: card.title,
      printedTitle: card.title,
      displayTitle: card.title,
      functionalType: card.cardType || "Hapa Card",
      functionalTypeSlug: slug(card.cardType || "hapa-card"),
      cardTypeName: card.cardType || "Hapa Card",
      confidence: "generated"
    },
    cardFace: {},
    attribution: {
      author: "Calder",
      shop: "Mimi's Card Shop",
      albumTitle: "Dear Papa",
      rightsStatus: "operator_authored_hapa_creative_commons",
      sourceTool: "scripts/run-tarot-production-enrichment-queue.mjs",
      sourcePaths: ["data/tarot-production-readiness/enrichment-queue.json"],
      notes: "Generated enrichment metadata; soft canon until human review."
    },
    mechanics: {},
    lore: {
      summary: card.summary || card.description || "",
      canonStatus: "soft_canon",
      sourceClaims: [card.id]
    },
    typeDetails: {},
    songLinks: [],
    sceneLinks: [],
    avatarLoreLinks: [],
    mediaLinks: [],
    ocr: {}
  };
}

function buildSongIndex(songs, songCards, registrySongs) {
  const records = [];
  for (const song of songs) records.push(song);
  for (const card of songCards) records.push(card);
  for (const song of registrySongs) records.push({
    id: song.id,
    songId: song.id,
    cardId: song.id,
    title: song.title,
    registryTrackId: song.id,
    audio: { registryTrackId: song.id }
  });
  const byKey = new Map();
  const byTitle = new Map();
  for (const song of records) {
    for (const key of [song.id, song.cardId, song.songId, song.registryTrackId, song.audio?.registryTrackId, song.lineage?.registryTrackId].filter(Boolean)) {
      if (!byKey.has(key)) byKey.set(key, song);
    }
    const title = normalizeSongTitle(song.title);
    if (title && !byTitle.has(title)) byTitle.set(title, song);
  }
  return { byKey, byTitle };
}

function markJob(job, status, now, result = {}) {
  job.status = status;
  job.updatedAt = now;
  if (status === "complete") job.completedAt = now;
  if (status === "failed") job.failedAt = now;
  job.result = result;
}

function recordJob(report, job, status, result = {}) {
  report.jobs.push({
    id: job.id,
    kind: job.kind,
    cardId: job.cardId,
    cardTitle: job.cardTitle,
    status,
    result
  });
}

function uriToLocalPath(uri = "") {
  if (!uri.startsWith("/media/")) return "";
  const relative = decodeURIComponent(uri.replace(/^\/media\/?/, ""));
  const resolved = path.resolve(MEDIA_DIR, relative);
  const root = path.resolve(MEDIA_DIR);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return "";
  return resolved;
}

function isImageUri(uri = "") {
  return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(String(uri || ""));
}

function wrapTitle(title = "") {
  const ascii = String(title || "Hapa Tarot Card")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96) || "Hapa Tarot Card";
  const words = ascii.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > 20) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).join("\n");
}

function escapeDrawText(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function escapeFilterPath(filePath = "") {
  return String(filePath)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function normalizeSongTitle(title = "") {
  return slug(String(title || "").replace(/[_-]+/g, " "));
}

function normalizeTokens(text = "") {
  return new Set(String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3));
}

function overlapScore(a, b) {
  let score = 0;
  for (const token of a) if (b.has(token)) score += 1;
  return score;
}

function avatarName(avatar = {}) {
  return avatar?.primaryName || avatar?.name || avatar?.names?.[0]?.name || avatar?.id || "";
}

function chooseFirst(list = []) {
  return list.find(Boolean) || "";
}

function slug(value = "") {
  return String(value || "item")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96) || "item";
}

function shortHash(value = "") {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8);
}

function stableNumber(value) {
  return Number.parseInt(crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8), 16);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values = [], getKey) {
  const seen = new Set();
  const output = [];
  for (const value of values.filter(Boolean)) {
    const key = getKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function countBy(values = [], getKey) {
  const counts = {};
  for (const value of values) {
    const key = getKey(value) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function firstExisting(paths = []) {
  return paths.find((candidate) => candidate && existsSync(candidate)) || "";
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, true);
    } else {
      parsed.set(key, next);
      index += 1;
    }
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
