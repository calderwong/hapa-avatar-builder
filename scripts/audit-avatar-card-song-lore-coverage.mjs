#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../src/domain/avatar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const REPORT_DIR = path.join(DATA_DIR, "healing-reports");
const PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";
const SONG_REGISTRY_PATH = process.env.HAPA_SONG_REGISTRY_DATA || "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";

const PATHS = {
  avatarStore: path.join(DATA_DIR, "avatar-store.json"),
  sceneStore: path.join(DATA_DIR, "scene-store.json"),
  itemStore: path.join(DATA_DIR, "item-manager-store.json"),
  tarotStore: path.join(DATA_DIR, "tarot-store.json"),
  songStore: path.join(DATA_DIR, "hapa-songs-store.json"),
  songbook: path.join(DATA_DIR, "dear-papa-songbook.json"),
  productionReadiness: path.join(DATA_DIR, "tarot-production-readiness", "latest-report.json")
};

await main();

async function main() {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const avatarStore = await readJson(PATHS.avatarStore);
  const sceneStore = await readJson(PATHS.sceneStore);
  const itemStore = await readJson(PATHS.itemStore);
  const tarotStore = await readJson(PATHS.tarotStore);
  const songStore = await readJson(PATHS.songStore);
  const songbook = await readJson(PATHS.songbook);
  const productionReadiness = existsSync(PATHS.productionReadiness) ? await readJson(PATHS.productionReadiness) : null;
  const registry = existsSync(SONG_REGISTRY_PATH) ? await readJson(SONG_REGISTRY_PATH) : { songs: [] };

  const avatars = avatarStore.avatars || [];
  const itemCards = itemStore.cards || [];
  const formalTarotCards = tarotStore.cards || [];
  const songs = songStore.songs || [];
  const songCards = songbook.songCards || [];
  const registryDearPapa = (registry.songs || []).filter(isDearPapaRegistrySong);

  const avatarIds = new Set(avatars.map((avatar) => avatar.id).filter(Boolean));
  const songKeys = buildSongKeyIndex(songs, songCards);
  const cardSongIndex = buildCardSongIndex(itemCards);
  const cardAvatarIndex = buildCardAvatarIndex(itemCards);
  const avatarSongIndex = buildAvatarSongIndex(avatars, songs, itemCards);
  const avatarCardIndex = buildAvatarCardIndex(avatars, itemCards);

  const songsWithoutAvatarLinks = songs.filter((song) => !avatarLinksForSong(song, avatarSongIndex).length);
  const songsWithoutItemCards = songs.filter((song) => !cardsForSong(song, cardSongIndex, songKeys).length);
  const avatarsWithoutSongs = avatars.filter((avatar) => !(avatarSongIndex.get(avatar.id) || []).length);
  const avatarsWithoutCards = avatars.filter((avatar) => !(avatarCardIndex.get(avatar.id) || []).length);
  const avatarsWithSparseLore = avatars.filter((avatar) => loreScore(avatar) < 5);
  const itemCardsWithoutAvatars = itemCards.filter(isDrawableCandidate).filter((card) => !collectAvatarRefs(card, avatarIds).length);
  const itemCardsWithoutSongs = itemCards.filter(isDrawableCandidate).filter((card) => !collectSongRefs(card).length);
  const formalTarotWithoutAssets = formalTarotCards.filter((card) => !collectFormalAssets(card).length);
  const formalTarotWithoutAvatarSignal = formalTarotCards.filter((card) => !formalAvatarSignal(card, avatars).length);

  const report = {
    schemaVersion: "hapa.avatar-card-song-lore-coverage-audit.v1",
    runAt: now,
    source: "scripts/audit-avatar-card-song-lore-coverage.mjs",
    recoveredMergeContext: {
      summary: "Canonical Avatar Builder was restored after a duplicate Pinokio/3D Tarot split. This audit treats recovered IDs as source-preserving and flags missing cross-links without deleting divergent records.",
      playlistId: PLAYLIST_ID,
      appRoot: ROOT
    },
    counts: {
      avatars: avatars.length,
      teams: (avatarStore.teams || []).length,
      places: (sceneStore.places || []).length,
      scenes: (sceneStore.scenes || []).length,
      episodes: (sceneStore.episodes || []).length,
      itemCards: itemCards.length,
      formalTarotCards: formalTarotCards.length,
      formalTarotDecks: (tarotStore.decks || []).length,
      formalTarotSets: (tarotStore.sets || []).length,
      dearPapaSongbookCards: songCards.length,
      hapaSongs: songs.length,
      songRegistryDearPapaTracks: registryDearPapa.length,
      itemCardsWithTarotDetails: itemCards.filter((card) => card.tarotCard).length,
      drawableItemCandidates: itemCards.filter(isDrawableCandidate).length,
      songTarotItemCards: itemCards.filter((card) => card.cardType === "song_tarot_card").length,
      avatarTarotItemCards: itemCards.filter((card) => card.cardType === "avatar_tarot_card").length
    },
    songCoverage: {
      withAudio: songs.filter((song) => Boolean(song.audio?.mp3Uri || song.audio?.localPath || song.audio?.audioUrl)).length,
      withStems: songs.filter((song) => (song.stems || []).length > 0).length,
      withLyrics: songs.filter((song) => Boolean(song.lyrics?.text)).length,
      withAvatarLinks: songs.length - songsWithoutAvatarLinks.length,
      withItemCardLinks: songs.length - songsWithoutItemCards.length,
      missingAvatarLinks: summarizeSongs(songsWithoutAvatarLinks),
      missingItemCardLinks: summarizeSongs(songsWithoutItemCards)
    },
    avatarCoverage: {
      withDearPapaSongs: avatars.length - avatarsWithoutSongs.length,
      withoutDearPapaSongs: summarizeAvatars(avatarsWithoutSongs),
      withItemCards: avatars.length - avatarsWithoutCards.length,
      withoutItemCards: summarizeAvatars(avatarsWithoutCards),
      sparseLore: avatarsWithSparseLore.map((avatar) => ({
        id: avatar.id,
        name: avatarName(avatar),
        loreScore: loreScore(avatar),
        missing: missingLoreFields(avatar)
      })).slice(0, 200)
    },
    cardCoverage: {
      drawableWithoutAvatarRefs: summarizeCards(itemCardsWithoutAvatars),
      drawableWithoutSongRefs: summarizeCards(itemCardsWithoutSongs),
      formalTarotWithoutAssets: summarizeFormalCards(formalTarotWithoutAssets),
      formalTarotWithoutAvatarSignal: summarizeFormalCards(formalTarotWithoutAvatarSignal)
    },
    tarotProductionReadiness: productionReadiness ? {
      generatedAt: productionReadiness.generatedAt,
      reportPath: path.relative(ROOT, PATHS.productionReadiness),
      summary: productionReadiness.summary
    } : null,
    samples: {
      avatarSongLinks: [...avatarSongIndex.entries()].slice(0, 20).map(([avatarId, links]) => ({ avatarId, links: links.slice(0, 6) })),
      avatarCardLinks: [...avatarCardIndex.entries()].slice(0, 20).map(([avatarId, links]) => ({ avatarId, links: links.slice(0, 6) }))
    }
  };

  const latestPath = path.join(REPORT_DIR, "latest-avatar-card-song-lore-coverage.json");
  const runPath = path.join(REPORT_DIR, `avatar-card-song-lore-coverage-${stamp}.json`);
  await writeJson(runPath, report);
  await writeJson(latestPath, report);

  console.log(JSON.stringify({
    ok: true,
    reportPath: path.relative(ROOT, latestPath),
    avatars: report.counts.avatars,
    songs: report.counts.hapaSongs,
    songbookCards: report.counts.dearPapaSongbookCards,
    registryDearPapaTracks: report.counts.songRegistryDearPapaTracks,
    songTarotItemCards: report.counts.songTarotItemCards,
    avatarsWithoutSongs: avatarsWithoutSongs.length,
    songsWithoutItemCards: songsWithoutItemCards.length,
    sparseLoreAvatars: avatarsWithSparseLore.length
  }, null, 2));
}

function buildSongKeyIndex(songs, songCards) {
  const map = new Map();
  for (const song of [...songs, ...songCards]) {
    const keys = songKeys(song);
    const record = {
      id: song.id,
      cardId: song.cardId || song.id,
      songId: song.songId,
      registryTrackId: song.registryTrackId || song.audio?.registryTrackId || song.lineage?.registryTrackId,
      title: song.title
    };
    for (const key of keys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(record);
    }
  }
  return map;
}

function buildCardSongIndex(cards) {
  const index = new Map();
  for (const card of cards) {
    for (const ref of collectSongRefs(card)) {
      for (const key of [ref.songCardId, ref.cardId, ref.songId, ref.registryTrackId, ref.id, slugify(ref.title || "")].filter(Boolean)) {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(summarizeCard(card));
      }
    }
  }
  return index;
}

function buildCardAvatarIndex(cards) {
  const index = new Map();
  for (const card of cards) {
    for (const avatarId of collectAvatarRefs(card)) {
      if (!index.has(avatarId)) index.set(avatarId, []);
      index.get(avatarId).push(summarizeCard(card));
    }
  }
  return index;
}

function buildAvatarSongIndex(avatars, songs, cards) {
  const index = new Map();
  for (const avatar of avatars) {
    const links = [];
    for (const choice of avatar.mind?.dearPapaSongContext?.selectedSongCards || []) {
      links.push({ songId: choice.songId, cardId: choice.cardId, title: choice.title, source: "avatar-mind" });
    }
    for (const choice of avatar.mind?.tarotCardDeck || []) {
      if (choice.songId) links.push({ songId: choice.songId, title: choice.songTitle, cardId: choice.cardId, source: "avatar-tarot-deck" });
    }
    if (links.length) index.set(avatar.id, uniqueBy(links, (link) => `${link.songId}:${link.cardId}:${link.source}`));
  }
  for (const song of songs) {
    for (const link of song.attachments?.avatarLinks || []) {
      const avatarId = link.avatarId;
      if (!avatarId) continue;
      if (!index.has(avatarId)) index.set(avatarId, []);
      index.get(avatarId).push({ songId: song.songId, cardId: song.cardId || song.id, title: song.title, source: "hapa-song-store" });
    }
  }
  for (const card of cards) {
    const songRefs = collectSongRefs(card);
    if (!songRefs.length) continue;
    for (const avatarId of collectAvatarRefs(card)) {
      if (!index.has(avatarId)) index.set(avatarId, []);
      for (const ref of songRefs) {
        index.get(avatarId).push({ songId: ref.songId, cardId: card.id, title: ref.title || card.title, source: "item-card" });
      }
    }
  }
  for (const [avatarId, links] of index.entries()) {
    index.set(avatarId, uniqueBy(links, (link) => `${link.songId}:${link.cardId}:${link.source}`));
  }
  return index;
}

function buildAvatarCardIndex(avatars, cards) {
  const index = buildCardAvatarIndex(cards);
  for (const avatar of avatars) {
    const links = index.get(avatar.id) || [];
    for (const choice of avatar.mind?.tarotCardDeck || []) {
      if (choice.cardId) links.push({ cardId: choice.cardId, title: choice.cardTitle, cardType: choice.cardType, source: "avatar-mind" });
    }
    if (links.length) index.set(avatar.id, uniqueBy(links, (link) => `${link.cardId}:${link.source || ""}`));
  }
  return index;
}

function avatarLinksForSong(song, avatarSongIndex) {
  const keys = songKeys(song);
  const links = [];
  for (const [avatarId, records] of avatarSongIndex.entries()) {
    if (records.some((record) => keys.has(record.songId) || keys.has(record.cardId))) links.push(avatarId);
  }
  return links;
}

function cardsForSong(song, cardSongIndex, songKeyIndex) {
  const keys = new Set([...songKeys(song)]);
  for (const key of [...keys]) {
    for (const record of songKeyIndex.get(key) || []) {
      for (const extra of [record.id, record.cardId, record.songId, record.registryTrackId, slugify(record.title || "")].filter(Boolean)) keys.add(extra);
    }
  }
  const cards = [];
  for (const key of keys) cards.push(...(cardSongIndex.get(key) || []));
  return uniqueBy(cards, (card) => card.id);
}

function collectSongRefs(card = {}) {
  const refs = [];
  for (const link of card.tarotCard?.songLinks || []) {
    refs.push({
      id: link.id,
      songId: link.songId || link.song_id,
      songCardId: link.songCardId || link.song_card_id,
      registryTrackId: link.registryTrackId || link.registry_track_id,
      title: link.songTitle || link.title
    });
  }
  for (const id of card.connections?.itemIds || []) {
    if (String(id).includes("song")) refs.push({ id, songId: id, songCardId: id });
  }
  if (card.cardType === "song_tarot_card") {
    refs.push({
      id: card.id,
      songId: card.songId || card.tarotCard?.songLinks?.[0]?.songId,
      songCardId: card.cardId || card.id,
      registryTrackId: card.registryTrackId || card.tarotCard?.songLinks?.[0]?.registryTrackId,
      title: card.title
    });
  }
  return refs.filter((ref) => ref.id || ref.songId || ref.songCardId || ref.registryTrackId || ref.title);
}

function collectAvatarRefs(card = {}, validAvatarIds = null) {
  const refs = [
    ...(card.connections?.avatarIds || []),
    ...((card.tarotCard?.avatarLoreLinks || []).map((link) => link.avatarId || link.avatar_id)),
    ...((card.tarotCard?.songLinks || []).map((link) => link.avatarId || link.avatar_id))
  ].filter(Boolean);
  return unique(validAvatarIds ? refs.filter((id) => validAvatarIds.has(id)) : refs);
}

function collectFormalAssets(card = {}) {
  return [
    ...(card.mediaAssets || []),
    ...(card.assets || []),
    card.image,
    card.imagePath,
    card.mediaUri
  ].filter(Boolean);
}

function formalAvatarSignal(card, avatars) {
  const text = `${card.title || ""} ${(card.keywords || []).join(" ")} ${card.meaning || ""}`.toLowerCase();
  return avatars.filter((avatar) => {
    const name = avatarName(avatar).toLowerCase();
    return name && text.includes(name);
  }).map((avatar) => avatar.id);
}

function loreScore(avatar) {
  const mind = avatar.mind || {};
  return [
    mind.personaAnchor?.identityStatement,
    mind.soulSeed?.soulThesis,
    mind.dearPapaSongContext?.selectedSongCards?.length,
    mind.tarotCardDeck?.length,
    mind.selfKnowledge?.length,
    mind.contextMap?.length,
    mind.memoryLedger?.length,
    mind.genesisRuns?.length
  ].filter(Boolean).length;
}

function missingLoreFields(avatar) {
  const mind = avatar.mind || {};
  return [
    !mind.personaAnchor?.identityStatement ? "personaAnchor.identityStatement" : "",
    !mind.soulSeed?.soulThesis ? "soulSeed.soulThesis" : "",
    !(mind.dearPapaSongContext?.selectedSongCards || []).length ? "dearPapaSongContext.selectedSongCards" : "",
    !(mind.tarotCardDeck || []).length ? "tarotCardDeck" : "",
    !(mind.selfKnowledge || []).length ? "selfKnowledge" : "",
    !(mind.contextMap || []).length ? "contextMap" : "",
    !(mind.memoryLedger || []).length ? "memoryLedger" : "",
    !(mind.genesisRuns || []).length ? "genesisRuns" : ""
  ].filter(Boolean);
}

function isDrawableCandidate(card = {}) {
  return Boolean(card.tarotCard || card.shipCard || (card.tags || []).includes("tarot-card") || /_card$/.test(card.cardType || ""));
}

function isDearPapaRegistrySong(song = {}) {
  const exportInfo = song.raw?._hapaPlaylistExport || {};
  return exportInfo.kind === "song" && String(exportInfo.songDir || song.localPath || "").includes(`/playlists/${PLAYLIST_ID}/songs/`);
}

function songKeys(song = {}) {
  return new Set([
    song.id,
    song.cardId,
    song.songId,
    song.registryTrackId,
    song.audio?.registryTrackId,
    song.lineage?.registryTrackId,
    song.title ? slugify(song.title) : ""
  ].filter(Boolean));
}

function summarizeSongs(songs) {
  return songs.slice(0, 300).map((song) => ({
    id: song.id,
    songId: song.songId,
    registryTrackId: song.registryTrackId || song.audio?.registryTrackId || song.lineage?.registryTrackId,
    title: song.title,
    trackNumber: song.trackNumber
  }));
}

function summarizeAvatars(avatars) {
  return avatars.slice(0, 300).map((avatar) => ({ id: avatar.id, name: avatarName(avatar), teamId: avatar.teamId || avatar.team }));
}

function summarizeCards(cards) {
  return cards.slice(0, 300).map(summarizeCard);
}

function summarizeCard(card) {
  return {
    id: card.id,
    title: card.title,
    cardType: card.cardType,
    kind: card.kind,
    avatarIds: collectAvatarRefs(card),
    songRefs: collectSongRefs(card).slice(0, 8)
  };
}

function summarizeFormalCards(cards) {
  return cards.slice(0, 300).map((card) => ({
    id: card.id,
    title: card.title,
    cardType: card.cardType,
    suit: card.suit,
    arcana: card.arcana
  }));
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.name || avatar.names?.[0]?.name || avatar.id || "Unnamed Avatar";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = getKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
