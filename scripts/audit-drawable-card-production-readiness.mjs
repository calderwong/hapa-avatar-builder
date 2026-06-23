#!/usr/bin/env node
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeItemManagerStore } from "../src/domain/item.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const KANBAN_PATH = path.join(DATA_DIR, "kanban.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DEAR_PAPA_SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const SONG_REGISTRY_DATA_PATH = process.env.HAPA_SONG_REGISTRY_DATA || "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";
const DEAR_PAPA_PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";
const REPORT_DIR = path.join(DATA_DIR, "tarot-production-readiness");
const RUN_ID = `tarot-production-readiness-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const RUN_REPORT_PATH = path.join(REPORT_DIR, "runs", `${RUN_ID}.json`);
const LATEST_REPORT_PATH = path.join(REPORT_DIR, "latest-report.json");
const QUEUE_PATH = path.join(REPORT_DIR, "enrichment-queue.json");

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const sampleSize = Number(args.get("sample-size") || 60);

await main();

async function main() {
  const now = new Date().toISOString();
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const songbook = await readJson(DEAR_PAPA_SONGBOOK_PATH).catch(() => ({ songCards: [] }));
  const hapaSongStore = await readJson(HAPA_SONG_STORE_PATH).catch(() => ({ songs: [] }));
  const registry = existsSync(SONG_REGISTRY_DATA_PATH) ? await readJson(SONG_REGISTRY_DATA_PATH) : { songs: [] };
  const songIndex = buildDearPapaSongIndex(songbook, hapaSongStore, registry);
  const candidates = (itemStore.cards || [])
    .filter(isDrawableCandidate)
    .map((card) => auditCard(card, songIndex));
  const productionReady = candidates.filter((card) => card.productionReady);
  const missingLoopingVideo = candidates.filter((card) => !card.hasLoopingVideo);
  const missingDearPapaSong = candidates.filter((card) => !card.hasDearPapaSong);
  const missingPlayableAudio = candidates.filter((card) => card.hasDearPapaSong && !card.hasPlayableDearPapaAudio);
  const imageOnly = candidates.filter((card) => card.imageOnly);
  const queueJobs = buildEnrichmentJobs(candidates, now);
  const report = {
    schemaVersion: "hapa.tarot-production-readiness-audit.v1",
    runId: RUN_ID,
    generatedAt: now,
    source: "scripts/audit-drawable-card-production-readiness.mjs",
    policy: {
      standard: "Every card eligible for Tarot Draw production must have at least one looping video. A playable Dear Papa song is optional music-slot enrichment and should not hide otherwise playable video cards.",
      displayPriority: [
        "high-resolution image paired with looping video/on-hover motion",
        "looping video with poster/first frame",
        "image-only assets are counted and queued, but hidden from production draw",
        "missing Dear Papa songs are counted and queued as music enrichment"
      ],
      queuePath: path.relative(ROOT, QUEUE_PATH)
    },
    summary: {
      drawableCandidates: candidates.length,
      productionReady: productionReady.length,
      hiddenFromProduction: candidates.length - productionReady.length,
      withLoopingVideo: candidates.filter((card) => card.hasLoopingVideo).length,
      missingLoopingVideo: missingLoopingVideo.length,
      withDearPapaSong: candidates.filter((card) => card.hasDearPapaSong).length,
      missingDearPapaSong: missingDearPapaSong.length,
      withPlayableDearPapaAudio: candidates.filter((card) => card.hasPlayableDearPapaAudio).length,
      missingPlayableDearPapaAudio: missingPlayableAudio.length,
      imageOnlyProductionHidden: imageOnly.length,
      queuedEnrichmentJobs: queueJobs.length
    },
    samples: {
      imageOnlyProductionHidden: imageOnly.slice(0, sampleSize).map(summarizeAuditCard),
      missingLoopingVideo: missingLoopingVideo.slice(0, sampleSize).map(summarizeAuditCard),
      missingDearPapaSong: missingDearPapaSong.slice(0, sampleSize).map(summarizeAuditCard),
      missingPlayableDearPapaAudio: missingPlayableAudio.slice(0, sampleSize).map(summarizeAuditCard)
    },
    cards: candidates
  };
  const queue = {
    schemaVersion: "hapa.tarot-production-enrichment-queue.v1",
    runId: RUN_ID,
    generatedAt: now,
    sourceReportPath: path.relative(ROOT, LATEST_REPORT_PATH),
    standard: report.policy.standard,
    counts: {
      jobs: queueJobs.length,
      byKind: countBy(queueJobs, (job) => job.kind),
      byStatus: countBy(queueJobs, (job) => job.status)
    },
    jobs: queueJobs
  };

  if (!dryRun) {
    await fs.mkdir(path.dirname(RUN_REPORT_PATH), { recursive: true });
    await fs.writeFile(RUN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fs.writeFile(LATEST_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fs.writeFile(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
    await upsertKanban(report, queue, now);
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    reportPath: dryRun ? "" : path.relative(ROOT, LATEST_REPORT_PATH),
    runReportPath: dryRun ? "" : path.relative(ROOT, RUN_REPORT_PATH),
    queuePath: dryRun ? "" : path.relative(ROOT, QUEUE_PATH),
    ...report.summary
  }, null, 2));
}

function auditCard(card, songIndex) {
  const videoUris = collectVideoUris(card);
  const imageUris = collectImageUris(card);
  const pairedMedia = collectPairedMedia(card);
  const songLinks = collectSongRefs(card);
  const matchedSongs = matchDearPapaSongs(songLinks, songIndex);
  const hasLoopingVideo = videoUris.length > 0;
  const hasDearPapaSong = matchedSongs.length > 0;
  const hasPlayableDearPapaAudio = matchedSongs.some((song) => song.audioUri || song.localAvailable || song.audioUrl);
  const imageOnly = imageUris.length > 0 && !hasLoopingVideo;
  const productionReady = hasLoopingVideo;
  return {
    cardId: card.id,
    title: card.title,
    cardType: card.cardType,
    tarotMainType: card.tarotCard?.mainType || card.cardType || "",
    kind: card.kind,
    tags: card.tags || [],
    collectionId: card.tarotCard?.catalog?.collectionId || card.episodeCard?.seriesTitle || "",
    hasLoopingVideo,
    hasImage: imageUris.length > 0,
    imageOnly,
    hasPairedHighResImageAndLoop: pairedMedia.length > 0,
    hasDearPapaSong,
    hasPlayableDearPapaAudio,
    productionReady,
    videoUris,
    imageUris,
    pairedMedia,
    songRefs: songLinks,
    matchedSongs: matchedSongs.map((song) => ({
      id: song.id,
      songId: song.songId,
      title: song.title,
      audioUri: song.audioUri || "",
      localAvailable: Boolean(song.localAvailable)
    })),
    reasons: [
      !hasLoopingVideo ? "missing-looping-video" : "",
      imageOnly ? "image-only-production-hidden" : ""
    ].filter(Boolean),
    warnings: [
      !hasDearPapaSong ? "missing-dear-papa-song" : "",
      hasDearPapaSong && !hasPlayableDearPapaAudio ? "missing-playable-dear-papa-audio" : ""
    ].filter(Boolean)
  };
}

function buildEnrichmentJobs(cards, now) {
  const jobs = [];
  for (const card of cards) {
    if (!card.hasLoopingVideo) {
      jobs.push(enrichmentJob({
        card,
        kind: "looping-video",
        title: `Create looping video for ${card.title}`,
        body: `${card.title} is drawable by schema but hidden from production because it has no looping video. Prioritize motion media generated from its best high-resolution image or OCR/card concept.`
      }, now));
    }
    if (!card.hasDearPapaSong) {
      jobs.push(enrichmentJob({
        card,
        kind: "dear-papa-song-link",
        title: `Attach Dear Papa song to ${card.title}`,
        body: `${card.title} has no Dear Papa song link for the music-player drop zone. Keep the card drawable if it has looping video, and have an avatar choose a song plus canon/lore reason when enriching music.`
      }, now));
    } else if (!card.hasPlayableDearPapaAudio) {
      jobs.push(enrichmentJob({
        card,
        kind: "dear-papa-audio-link",
        title: `Resolve playable Dear Papa audio for ${card.title}`,
        body: `${card.title} has a Dear Papa song reference, but the audit could not resolve playable audio from the song registry. Link or repair the registry ID/audio source.`
      }, now));
    }
  }
  return jobs;
}

function enrichmentJob({ card, kind, title, body }, now) {
  return {
    id: `tarot-production-${kind}-${slug(card.cardId)}`,
    cardId: card.cardId,
    cardTitle: card.title,
    cardType: card.cardType,
    kind,
    title,
    body,
    status: "queued",
    priority: card.imageOnly || kind === "looping-video" ? "high" : "medium",
    acceptanceCriteria: [
      "Card remains source-attributed.",
      "Card has at least one looping video URI.",
      "Card is eligible for production Tarot Draw after the looping video check passes.",
      "Playable Dear Papa song references are available to the music drop zone when present."
    ],
    reasons: card.reasons,
    warnings: card.warnings,
    createdAt: now,
    updatedAt: now
  };
}

async function upsertKanban(report, queue, now) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const board = await readJson(KANBAN_PATH).catch(() => ({ schemaVersion: "hapa.kanban-board.v1", lanes: [] }));
  await fs.writeFile(path.join(BACKUP_DIR, `kanban.before-tarot-production-readiness-${RUN_ID}.json`), `${JSON.stringify(board, null, 2)}\n`, "utf8");
  const lane = ensureLane(board, "lane-tarot-draw-repair", "Tarot Draw Repair", "cyan");
  const summary = report.summary;
  const cards = [
    taskCard({
      id: "tarot-production-readiness-audit",
      title: "Audit drawable card production readiness",
      status: "done",
      body: `Audited ${summary.drawableCandidates} drawable candidates. ${summary.productionReady} pass production; ${summary.hiddenFromProduction} are hidden/queued.`,
      tags: ["tarot-draw", "production-readiness", "audit"],
      completedAt: now,
      updatedAt: now
    }),
    taskCard({
      id: "tarot-production-readiness-loop-video-enrichment",
      title: "Enrich cards missing looping videos",
      status: summary.missingLoopingVideo ? "queued" : "done",
      body: `${summary.missingLoopingVideo} drawable candidates are missing looping videos. See ${path.relative(ROOT, QUEUE_PATH)}.`,
      tags: ["tarot-draw", "looping-video", "enrichment"],
      updatedAt: now
    }),
    taskCard({
      id: "tarot-production-readiness-song-enrichment",
      title: "Enrich cards missing playable Dear Papa songs",
      status: summary.missingDearPapaSong || summary.missingPlayableDearPapaAudio ? "queued" : "done",
      body: `${summary.missingDearPapaSong} cards lack Dear Papa song links; ${summary.missingPlayableDearPapaAudio} have song refs without resolved playable audio. These are music-slot enrichment tasks, not production draw blockers. See ${path.relative(ROOT, QUEUE_PATH)}.`,
      tags: ["tarot-draw", "dear-papa", "music-slot", "enrichment"],
      updatedAt: now
    }),
    taskCard({
      id: "tarot-production-readiness-image-only-counter",
      title: "Track image-only cards hidden from production",
      status: summary.imageOnlyProductionHidden ? "queued" : "done",
      body: `${summary.imageOnlyProductionHidden} drawable candidates are image-only and should not be shown in production until motion media is attached.`,
      tags: ["tarot-draw", "image-only", "production-hidden"],
      updatedAt: now
    })
  ];
  lane.cards = mergeById([...(lane.cards || []), ...cards], "id");
  board.updatedAt = now;
  await fs.writeFile(KANBAN_PATH, `${JSON.stringify(board, null, 2)}\n`, "utf8");
}

function taskCard(input) {
  return {
    owner: "Codex",
    ...input
  };
}

function ensureLane(board, id, title, accent = "cyan") {
  board.lanes ||= [];
  let lane = board.lanes.find((item) => item.id === id);
  if (!lane) {
    lane = { id, title, accent, cards: [] };
    board.lanes.push(lane);
  }
  lane.cards ||= [];
  return lane;
}

function isDrawableCandidate(card = {}) {
  const tags = card.tags || [];
  return card.cardType === "ship_card" ||
    card.kind === "ship" ||
    Boolean(card.shipCard) ||
    Boolean(card.tarotCard) ||
    tags.includes("tarot-card") ||
    /_tarot_card$/.test(card.cardType || "");
}

function collectVideoUris(card = {}) {
  return unique([
    ...(card.mediaAssets || []).filter(isVideoAsset).map((asset) => asset.uri),
    ...(card.tarotCard?.mediaLinks || []).map((link) => link.videoUri),
    ...(card.episodeCard?.mediaLinks || []).map((link) => link.videoUri)
  ].filter(isVideoUri).map(normalizeUri));
}

function collectImageUris(card = {}) {
  return unique([
    ...(card.mediaAssets || []).filter(isImageAsset).flatMap((asset) => [asset.uri, asset.thumbnailUri]),
    ...(card.tarotCard?.mediaLinks || []).flatMap((link) => [link.imageUri, link.posterUri]),
    ...(card.episodeCard?.mediaLinks || []).flatMap((link) => [link.imageUri, link.posterUri])
  ].filter(isImageUri).map(normalizeUri));
}

function collectPairedMedia(card = {}) {
  return [
    ...(card.tarotCard?.mediaLinks || []),
    ...(card.episodeCard?.mediaLinks || [])
  ]
    .filter((link) => isVideoUri(link.videoUri) && isImageUri(link.imageUri || link.posterUri))
    .map((link) => ({
      imageUri: normalizeUri(link.imageUri || link.posterUri),
      videoUri: normalizeUri(link.videoUri),
      linkId: link.id || ""
    }));
}

function collectSongRefs(card = {}) {
  const linkRefs = [
    ...(card.tarotCard?.songLinks || []),
    ...(card.episodeCard?.songLinks || []),
    ...(card.songLinks || [])
  ];
  const connectionRefs = (card.connections?.itemIds || []).map((id) => ({ id, songCardId: id }));
  const selfRefs = /song/i.test(`${card.cardType || ""} ${card.tarotCard?.mainType || ""}`)
    ? [{ id: card.id, songCardId: card.id, songId: card.songId || card.sourceSongId || "", title: card.title }]
    : [];
  return [...linkRefs, ...connectionRefs, ...selfRefs]
    .map((link) => ({
      id: link.id || "",
      songId: link.songId || link.song_id || "",
      songCardId: link.songCardId || link.song_card_id || link.cardId || link.card_id || "",
      title: link.songTitle || link.song_title || link.title || link.name || "",
      audioUri: link.audioUri || link.audio_uri || "",
      avatarId: link.avatarId || link.avatar_id || "",
      source: link.sourcePath || link.source || ""
    }))
    .filter((link) => link.id || link.songId || link.songCardId || link.title || link.audioUri);
}

function buildDearPapaSongIndex(songbook = {}, hapaSongStore = {}, registry = {}) {
  const records = [];
  for (const card of songbook.songCards || []) {
    records.push({
      id: card.id,
      cardId: card.cardId || card.id,
      songId: card.songId,
      title: card.title,
      localAvailable: false,
      audioUri: "",
      source: "dear-papa-songbook"
    });
  }
  for (const song of hapaSongStore.songs || []) {
    records.push({
      id: song.id,
      cardId: song.cardId || song.id,
      songId: song.songId,
      title: song.title,
      localAvailable: Boolean(song.audio?.mp3Uri || song.audio?.wavUri),
      audioUri: song.audio?.mp3Uri || song.audio?.wavUri || "",
      source: "hapa-songs-store"
    });
  }
  for (const song of (registry.songs || []).filter(isDearPapaRegistrySong)) {
    records.push({
      id: song.id,
      cardId: song.id,
      songId: song.id,
      title: song.title,
      localAvailable: Boolean(song.localPath),
      audioUri: song.localPath ? `/api/song-registry/audio/${encodeURIComponent(song.id)}` : song.audioUrl || "",
      audioUrl: song.audioUrl || "",
      source: "hapa-song-registry"
    });
  }
  const byKey = new Map();
  const byTitle = new Map();
  for (const record of records) {
    for (const key of [record.id, record.cardId, record.songId]) {
      if (key) setPreferredSongRecord(byKey, String(key), record);
    }
    const title = normalizeSongTitle(record.title);
    if (title) setPreferredSongRecord(byTitle, title, record);
  }
  return { records, byKey, byTitle };
}

function setPreferredSongRecord(index, key, record) {
  const existing = index.get(key);
  if (!existing || songRecordScore(record) > songRecordScore(existing)) {
    index.set(key, record);
  }
}

function songRecordScore(record = {}) {
  return [
    record.audioUri || record.audioUrl ? 4 : 0,
    record.localAvailable ? 2 : 0,
    record.source === "hapa-songs-store" ? 1 : 0
  ].reduce((sum, score) => sum + score, 0);
}

function matchDearPapaSongs(refs = [], songIndex) {
  const matches = [];
  for (const ref of refs) {
    if (ref.audioUri) {
      matches.push({ id: ref.id || ref.songId || ref.title, songId: ref.songId, title: ref.title || "Linked Dear Papa song", audioUri: ref.audioUri, localAvailable: true });
      continue;
    }
    const direct = [ref.songCardId, ref.songId, ref.id]
      .map((key) => songIndex.byKey.get(String(key || "")))
      .find(Boolean);
    const byTitle = songIndex.byTitle.get(normalizeSongTitle(ref.title));
    if (direct || byTitle) matches.push(direct || byTitle);
  }
  return uniqueBy(matches, (song) => song.id || song.songId || normalizeSongTitle(song.title));
}

function isDearPapaRegistrySong(song = {}) {
  const exportInfo = song.raw?._hapaPlaylistExport || {};
  return exportInfo.kind === "song" && String(exportInfo.songDir || "").includes(`/playlists/${DEAR_PAPA_PLAYLIST_ID}/songs/`);
}

function summarizeAuditCard(card) {
  return {
    cardId: card.cardId,
    title: card.title,
    cardType: card.cardType,
    tarotMainType: card.tarotMainType,
    reasons: card.reasons,
    videoCount: card.videoUris.length,
    imageCount: card.imageUris.length,
    songCount: card.matchedSongs.length
  };
}

function isVideoAsset(asset = {}) {
  return asset?.type === "video" || /^video\//i.test(asset?.mimeType || "") || isVideoUri(asset?.uri);
}

function isImageAsset(asset = {}) {
  return asset?.type === "image" || /^image\//i.test(asset?.mimeType || "") || isImageUri(asset?.uri);
}

function isVideoUri(uri = "") {
  return /\.(mp4|m4v|mov|webm)(\?.*)?$/i.test(String(uri || ""));
}

function isImageUri(uri = "") {
  return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(String(uri || "")) || /^data:image\//i.test(String(uri || ""));
}

function normalizeUri(uri = "") {
  return String(uri || "").trim();
}

function normalizeSongTitle(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[''`"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function mergeById(items = [], key = "id") {
  const byId = new Map();
  for (const item of items) {
    const id = item?.[key];
    if (!id) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function uniqueBy(items = [], selector = (item) => item.id) {
  const byKey = new Map();
  for (const item of items) {
    const key = selector(item);
    if (!key) continue;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

function slug(value = "") {
  return String(value || "card")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "card";
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function parseArgs(argv = []) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      map.set(key, next);
      index += 1;
    } else {
      map.set(key, true);
    }
  }
  return map;
}
