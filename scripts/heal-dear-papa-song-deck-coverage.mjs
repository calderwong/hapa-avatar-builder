#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const REPORT_PATH = path.join(DATA_DIR, "dear-papa-song-coverage-audit.json");

function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  backup(ITEM_STORE_PATH, `item-manager-store.before-song-coverage-heal-${stamp}.json`);
  backup(AVATAR_STORE_PATH, `avatar-store.before-song-coverage-heal-${stamp}.json`);

  const songbook = readJson(SONGBOOK_PATH);
  const itemStore = readJson(ITEM_STORE_PATH);
  const avatarStore = readJson(AVATAR_STORE_PATH);
  const songs = songbook.songCards || [];
  const cards = itemStore.cards || [];
  const avatars = avatarStore.avatars || [];
  const avatarsById = new Map(avatars.map((avatar) => [avatar.id, avatar]).filter(([id]) => id));
  const missingBefore = auditMissingSongs(songs, cards, avatarsById);
  const healed = [];
  const candidates = drawableTarotCards(cards);

  missingBefore.forEach((entry, index) => {
    const song = entry.song;
    const avatar = chooseAvatar(song, avatars, avatarsById, index);
    const card = chooseCardForSong(song, avatar, candidates, index);
    if (!avatar || !card) return;
    const choice = buildChoice({ song, avatar, card, now });
    attachChoiceToCard(card, choice, now);
    attachChoiceToAvatar(avatar, choice, now);
    healed.push({
      songId: choice.songId,
      songTitle: choice.songTitle,
      avatarId: choice.avatarId,
      avatarName: choice.avatarName,
      cardId: choice.cardId,
      cardTitle: choice.cardTitle,
      cardType: choice.cardType,
      why: choice.why
    });
  });

  itemStore.updatedAt = now;
  itemStore.audit = {
    ...(itemStore.audit || {}),
    dearPapaSongCoverageHeal: {
      runAt: now,
      missingBefore: missingBefore.length,
      healedCount: healed.length
    }
  };
  avatarStore.updatedAt = now;
  avatarStore.dearPapaSongCoverageHeal = {
    schemaVersion: "hapa.dear-papa-song-coverage-heal.v1",
    runAt: now,
    missingBefore: missingBefore.map((entry) => ({
      songId: entry.song.songId || entry.song.id,
      title: entry.song.title
    })),
    healed
  };

  const missingAfter = auditMissingSongs(songs, cards, avatarsById);
  writeJson(ITEM_STORE_PATH, itemStore);
  writeJson(AVATAR_STORE_PATH, avatarStore);
  writeJson(REPORT_PATH, {
    schemaVersion: "hapa.dear-papa-song-coverage-audit.v1",
    runAt: now,
    songCount: songs.length,
    missingBefore: missingBefore.map((entry) => entry.summary),
    healed,
    missingAfter: missingAfter.map((entry) => entry.summary)
  });

  console.log(JSON.stringify({
    songCount: songs.length,
    missingBefore: missingBefore.length,
    healed: healed.length,
    missingAfter: missingAfter.length,
    reportPath: path.relative(ROOT, REPORT_PATH)
  }, null, 2));
}

function auditMissingSongs(songs, cards, avatarsById) {
  return songs
    .map((song) => {
      const keys = songKeys(song);
      const linked = cards.filter((card) =>
        cardHasSong(card, keys) &&
        cardHasAvatar(card, avatarsById) &&
        isDrawableCard(card)
      );
      return {
        song,
        linked,
        summary: {
          songId: song.songId || song.id,
          title: song.title,
          keys: [...keys]
        }
      };
    })
    .filter((entry) => !entry.linked.length);
}

function songKeys(song = {}) {
  return new Set([
    song.id,
    song.songId,
    song.cardId,
    song.songId ? `dear-papa-song-${song.songId}` : ""
  ].filter(Boolean));
}

function cardHasSong(card = {}, keys = new Set()) {
  return (card.connections?.itemIds || []).some((id) => keys.has(id)) ||
    (card.tarotCard?.songLinks || []).some((link) =>
      keys.has(link.songId) ||
      keys.has(link.songCardId) ||
      keys.has(link.id)
    );
}

function cardHasAvatar(card = {}, avatarsById = new Map()) {
  return (card.connections?.avatarIds || []).some((id) => avatarsById.has(id)) ||
    (card.tarotCard?.songLinks || []).some((link) => avatarsById.has(link.avatarId));
}

function isDrawableCard(card = {}) {
  return Boolean(card.tarotCard || card.shipCard || (card.tags || []).includes("tarot-card") || /_card$/.test(card.cardType || ""));
}

function drawableTarotCards(cards = []) {
  return cards
    .filter(isDrawableCard)
    .filter((card) => card.tarotCard)
    .filter((card) => (card.mediaAssets || []).some((asset) => asset.uri))
    .sort((a, b) =>
      mediaScore(b) - mediaScore(a) ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );
}

function mediaScore(card = {}) {
  const assets = card.mediaAssets || [];
  const video = assets.some((asset) => asset.type === "video" || /^video\//.test(asset.mimeType || ""));
  const image = assets.some((asset) => asset.type === "image" || /^image\//.test(asset.mimeType || ""));
  const linkedAvatars = card.connections?.avatarIds?.length || 0;
  return (video ? 10 : 0) + (image ? 5 : 0) + linkedAvatars;
}

function chooseAvatar(song = {}, avatars = [], avatarsById = new Map(), index = 0) {
  const perspective = song.performancePerspective || {};
  const preferredId = perspective.avatar_id || perspective.avatarId;
  if (preferredId && avatarsById.has(preferredId)) return avatarsById.get(preferredId);
  const preferredName = String(perspective.avatar_name || perspective.avatarName || "").toLowerCase();
  if (preferredName) {
    const byName = avatars.find((avatar) => String(avatar.primaryName || avatar.name || "").toLowerCase() === preferredName);
    if (byName) return byName;
  }
  return avatars[index % Math.max(avatars.length, 1)] || null;
}

function chooseCardForSong(song = {}, avatar = {}, candidates = [], index = 0) {
  const songText = `${song.title || ""} ${song.mood || ""} ${song.learningThing || ""} ${song.lore?.summary || ""}`.toLowerCase();
  const preferred = candidates.filter((card) => (card.connections?.avatarIds || []).includes(avatar.id));
  const pool = preferred.length ? preferred : candidates;
  const scored = pool.map((card, poolIndex) => ({
    card,
    score: cardSongScore(card, songText) + mediaScore(card) + ((poolIndex + index) % 7) * 0.01
  }));
  scored.sort((a, b) => b.score - a.score || stableNumber(`${song.songId || song.id}:${a.card.id}`) - stableNumber(`${song.songId || song.id}:${b.card.id}`));
  return scored[0]?.card || null;
}

function cardSongScore(card = {}, songText = "") {
  const cardText = [
    card.title,
    card.cardType,
    card.tarotCard?.mainType,
    card.tarotCard?.archetype,
    ...(card.tarotCard?.keywords || []),
    card.summary,
    card.description
  ].filter(Boolean).join(" ").toLowerCase();
  const words = uniqueWords(songText).filter((word) => word.length > 4).slice(0, 24);
  return words.reduce((sum, word) => sum + (cardText.includes(word) ? 1 : 0), 0);
}

function buildChoice({ song, avatar, card, now }) {
  const songId = song.songId || String(song.id || "").replace(/^dear-papa-song-/, "");
  const songCardId = song.id || `dear-papa-song-${songId}`;
  const avatarName = avatar.primaryName || avatar.name || avatar.id;
  const cardTitle = card.tarotCard?.title || card.title;
  const cardType = card.tarotCard?.mainType || card.cardType || "tarot_card";
  const typeLabel = card.tarotCard?.catalog?.typeLabel || card.tarotCard?.identity?.cardTypeName || labelForType(cardType);
  const objective = avatar.mind?.personaAnchor?.wants || avatar.summary || "to keep Hapa coherent, useful, and emotionally legible";
  const vibe = song.mood || song.lore?.learning_thing || "Dear Papa signal";
  const keywords = (card.tarotCard?.keywords || []).slice(0, 4).join(", ") || typeLabel;
  const idBase = `${avatar.id}-${card.id}-${songId}`;
  const why = `${avatarName} chooses ${cardTitle} for ${song.title} because the ${typeLabel} turns the song's ${vibe} into playable canon: ${keywords}. Relative to ${avatarName}'s objective, it gives the deck a scene-ready reason to draw, place, and explain the song instead of leaving it as dead media.`;
  return {
    id: `coverage-heal-${slug(idBase)}`,
    sourceChoiceId: `coverage-heal-choice-${slug(idBase)}`,
    schemaVersion: "hapa.avatar-tarot-card-choice.v1",
    avatarId: avatar.id,
    avatarName,
    cardId: card.id,
    cardTitle,
    cardType,
    tarotMainType: cardType,
    typeLabel,
    songId,
    songCardId,
    songTitle: song.title,
    sceneId: card.connections?.sceneIds?.[0] || "",
    sceneTitle: "",
    role: "song-coverage-heal-genesis-choice",
    why,
    whyChosen: why,
    canonReason: `${cardTitle} remains generated/soft canon, but this heal records source-attributed deck/song coverage so ${song.title} can be pulled through an Avatar and Tarot card.`,
    loreContext: `${avatarName} reviews Dear Papa song context, Hapa Tarot card data, existing Avatar objectives, and current deck coverage before accepting the link.`,
    objectiveFit: `${song.title} supports ${avatarName}'s current objective: ${objective}.`,
    deckInfluence: `${cardTitle} now carries ${song.title} as a drawable song-linked ${typeLabel}; when pulled, it can open Avatar lore, media, and scene context.`,
    futureInfluence: `${song.title} should influence future ${avatarName} scenes when ${keywords} need song-backed emotional exposition.`,
    songWhy: why,
    vibe,
    confidence: "generated",
    status: "active",
    sourcePath: "scripts/heal-dear-papa-song-deck-coverage.mjs",
    createdAt: now,
    updatedAt: now
  };
}

function attachChoiceToCard(card, choice, now) {
  card.connections ||= {};
  card.connections.avatarIds = unique([...(card.connections.avatarIds || []), choice.avatarId]);
  card.connections.itemIds = unique([...(card.connections.itemIds || []), choice.songCardId]);
  card.tarotCard ||= {};
  card.tarotCard.songLinks = uniqueBy([
    ...(card.tarotCard.songLinks || []),
    {
      id: `song-link-${choice.id}`,
      avatarId: choice.avatarId,
      avatarName: choice.avatarName,
      songId: choice.songId,
      songCardId: choice.songCardId,
      songTitle: choice.songTitle,
      sceneId: choice.sceneId,
      sceneTitle: choice.sceneTitle,
      cardId: choice.cardId,
      choiceId: choice.id,
      sourceChoiceId: choice.sourceChoiceId,
      tarotType: card.tarotCard.identity?.tarotType || "",
      functionalType: card.tarotCard.identity?.functionalType || "",
      why: choice.why,
      whyChosen: choice.whyChosen,
      canonReason: choice.canonReason,
      objectiveFit: choice.objectiveFit,
      deckInfluence: choice.deckInfluence,
      futureInfluence: choice.futureInfluence,
      vibe: choice.vibe,
      notes: "Added by Dear Papa song coverage heal so every album song can enter the drawable deck through Avatar lore.",
      sourcePath: choice.sourcePath,
      confidence: choice.confidence,
      createdAt: now,
      updatedAt: now
    }
  ], (link) => link.songCardId || link.songId);
  card.tarotCard.lore ||= {};
  card.tarotCard.lore.songCoverageNotes = uniqueBy([
    ...(card.tarotCard.lore.songCoverageNotes || []),
    {
      songId: choice.songId,
      songTitle: choice.songTitle,
      avatarId: choice.avatarId,
      avatarName: choice.avatarName,
      why: choice.why,
      createdAt: now
    }
  ], (note) => `${note.songId}:${note.avatarId}`);
  card.updatedAt = now;
}

function attachChoiceToAvatar(avatar, choice, now) {
  avatar.mind ||= {};
  avatar.mind.tarotCardDeck = uniqueBy([
    ...(avatar.mind.tarotCardDeck || []),
    {
      id: choice.id,
      schemaVersion: choice.schemaVersion,
      cardId: choice.cardId,
      cardTitle: choice.cardTitle,
      cardType: choice.cardType,
      tarotMainType: choice.tarotMainType,
      role: choice.role,
      whyChosen: choice.whyChosen,
      canonReason: choice.canonReason,
      loreContext: choice.loreContext,
      objectiveFit: choice.objectiveFit,
      deckInfluence: choice.deckInfluence,
      futureInfluence: choice.futureInfluence,
      songId: choice.songId,
      songTitle: choice.songTitle,
      songWhy: choice.songWhy,
      vibe: choice.vibe,
      sourcePath: choice.sourcePath,
      confidence: choice.confidence,
      status: choice.status,
      createdAt: now,
      updatedAt: now
    }
  ], (entry) => `${entry.cardId}:${entry.songId}`);
  avatar.mind.dearPapaSongContext ||= {};
  avatar.mind.dearPapaSongContext.selectedSongCards = uniqueBy([
    ...(avatar.mind.dearPapaSongContext.selectedSongCards || []),
    {
      id: `${slug(avatar.id)}-dear-papa-song-${slug(choice.songId)}-coverage-heal`,
      schemaVersion: "hapa.avatar-dear-papa-song-choice.v1",
      songId: choice.songId,
      cardId: choice.songCardId,
      title: choice.songTitle,
      albumId: "dear-papa-album",
      author: "Calder",
      perspective: {
        avatarId: choice.avatarId,
        avatarName: choice.avatarName
      },
      whySelected: choice.why,
      genesisInstruction: `Use ${choice.songTitle} with ${choice.cardTitle} to keep Avatar deck, song, and scene lore connected.`,
      communicationUse: "tarot_deck_song_coverage_heal",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (entry) => entry.cardId || entry.songId);
  avatar.mind.journal = [
    ...(avatar.mind.journal || []),
    {
      id: `journal-${choice.id}`,
      schemaVersion: "hapa.avatar-journal-entry.v1",
      journalType: "dear-papa-song-coverage-heal",
      timelineId: "hapa-avatar-builder-tarot-draw-repair",
      timelineEventId: choice.id,
      pageTarget: 0,
      pageCount: 0,
      wordCount: choice.why.split(/\s+/).length,
      criticStatus: "coverage-heal-soft-canon",
      criticName: "Lorekeeper Coverage Auditor",
      criticNotes: "Soft-canon repair: song now has an Avatar/Card route into the drawable Tarot deck.",
      mentionedAvatarIds: [choice.avatarId],
      mentionedAvatarNames: [choice.avatarName],
      itemTags: [choice.cardTitle, choice.songTitle],
      eventTags: ["Dear Papa song coverage", "Tarot Draw repair", "Avatar Genesis deck heal"],
      sceneTags: [choice.sceneId].filter(Boolean),
      body: choice.why,
      createdAt: now,
      updatedAt: now
    }
  ];
  avatar.mind.updatedAt = now;
  avatar.updatedAt = now;
}

function uniqueWords(value = "") {
  return [...new Set(String(value).toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

function labelForType(type = "") {
  return String(type || "Tarot Card")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slug(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

function stableNumber(value = "") {
  return Number.parseInt(crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8), 16);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values = [], keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function backup(filePath, fileName) {
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, fileName));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

main();
