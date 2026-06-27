#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../src/domain/avatar.js";
import { EQUIPMENT_HARDPOINTS } from "../src/domain/item.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const HEALING_REPORT_DIR = path.join(DATA_DIR, "healing-reports");

const PATHS = {
  avatars: path.join(DATA_DIR, "avatar-store.json"),
  items: path.join(DATA_DIR, "item-manager-store.json"),
  songs: path.join(DATA_DIR, "hapa-songs-store.json"),
  inventory: path.join(DATA_DIR, "inventory-store.json"),
  lorePlan: path.join(DATA_DIR, "lore-production-plan.json")
};

await main();

async function main() {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  const runId = `avatar-card-song-kit-enrichment-${stamp}`;
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(RUN_DIR, { recursive: true });
  await fs.mkdir(HEALING_REPORT_DIR, { recursive: true });
  await backupInputs(runId);

  const avatarStore = await readJson(PATHS.avatars);
  const itemStore = await readJson(PATHS.items);
  const songStore = await readJson(PATHS.songs);
  const inventoryStore = await readJson(PATHS.inventory);
  const lorePlan = existsSync(PATHS.lorePlan) ? await readJson(PATHS.lorePlan) : {};

  const avatars = avatarStore.avatars || [];
  const cards = itemStore.cards || [];
  const songs = songStore.songs || [];
  const avatarById = new Map(avatars.map((avatar) => [avatar.id, avatar]));
  const songById = buildSongIndex(songs);
  ensureInventoryStore(inventoryStore, avatars);

  const report = {
    schemaVersion: "hapa.avatar-card-song-kit-enrichment-report.v1",
    runId,
    runAt: now,
    source: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
    agentFrame: {
      genesisUpdateAgent: "Deterministic local Genesis Update pass over avatar/card/song stores.",
      lorekeeper: "hapa-lore-node memory/lore/provenance route; writes journal, context, source refs, and audit reports.",
      cardForge: "hapa-avatar-node cards/standards route; writes hardpoint slots, card song links, and inventory state.",
      canonBoundary: "Generated enrichment is soft canon until human review; existing IDs and human-authored fields are preserved."
    },
    inputCounts: summarizeCoverage(cards, songs, inventoryStore, avatars),
    cardAssignments: [],
    songUpdates: [],
    avatarUpdates: []
  };

  const cardToPlacement = buildCardPlacementMap(inventoryStore);
  const songCardCounts = buildSongCardCountMap(cards, songById);
  const combosByAvatar = new Map();
  const touchedSongs = new Set();

  for (const card of cards) {
    const existingPlacement = firstPlacement(cardToPlacement.get(card.id));
    const avatar = chooseAvatarForCard(card, avatars, avatarById, inventoryStore, existingPlacement);
    const hardpointId = existingPlacement?.hardpointId || chooseHardpointForCard(card);
    const placement = ensureCardSlot(inventoryStore, avatar, card, hardpointId, now, runId);
    rememberPlacement(cardToPlacement, card.id, placement);

    const song = chooseSongForCombination(card, avatar, songs, songById, songCardCounts);
    const reasoning = buildReasoning(avatar, card, song, placement, runId);

    ensureCardAvatarAndSongLinks(card, avatar, song, placement, reasoning, now, runId);
    ensureSongAvatarAndCardLinks(song, avatar, card, reasoning, now, runId);
    incrementSongCardCount(songCardCounts, song);
    touchedSongs.add(song.id);

    const combo = {
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      cardId: card.id,
      cardTitle: card.title || card.name || card.id,
      cardType: card.cardType || `${card.kind || "object"}_card`,
      hardpointId: placement.hardpointId,
      songId: song.songId || song.id,
      songCardId: song.id,
      songTitle: song.title,
      reasoning
    };
    pushCombo(combosByAvatar, avatar.id, combo);
    report.cardAssignments.push({
      cardId: card.id,
      cardTitle: card.title || card.name || card.id,
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      hardpointId: placement.hardpointId,
      songId: song.songId || song.id,
      songTitle: song.title,
      createdSlot: placement.created,
      createdSongLink: reasoning.createdSongLink
    });
  }

  for (const avatar of avatars) {
    const combos = combosByAvatar.get(avatar.id) || [];
    if (!combos.length) continue;
    ensureAvatarKitCombinationMind(avatar, combos, now, runId);
    report.avatarUpdates.push({
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      chosenCombinations: combos.length,
      tarotDeckChoices: avatar.mind?.tarotCardDeck?.length || 0,
      selectedSongs: avatar.mind?.dearPapaSongContext?.selectedSongCards?.length || 0,
      journalEntries: avatar.mind?.journal?.length || 0
    });
  }

  for (const song of songs) {
    report.songUpdates.push({
      songId: song.songId || song.id,
      songCardId: song.id,
      title: song.title,
      avatarLinks: song.attachments?.avatarLinks?.length || 0,
      cardLinks: song.attachments?.cardLinks?.length || 0,
      touchedThisRun: touchedSongs.has(song.id)
    });
  }

  avatarStore.avatars = avatars;
  avatarStore.updatedAt = now;
  avatarStore.kitCombinationEnrichment = {
    schemaVersion: "hapa.avatar-store.kit-combination-enrichment.v1",
    runId,
    runAt: now,
    source: report.source,
    canonBoundary: report.agentFrame.canonBoundary
  };

  itemStore.cards = cards;
  itemStore.auditRuns = [
    ...(itemStore.auditRuns || []),
    {
      id: runId,
      kind: "avatar-card-song-kit-enrichment",
      generatedAt: now,
      cardsProcessed: cards.length,
      songsProcessed: songs.length,
      avatarsProcessed: avatars.length,
      source: report.source,
      canonBoundary: report.agentFrame.canonBoundary
    }
  ];
  itemStore.updatedAt = now;

  songStore.songs = songs;
  songStore.audit = {
    ...(songStore.audit || {}),
    songs: songs.length,
    withAvatars: songs.filter((song) => (song.attachments?.avatarLinks || []).length > 0).length,
    withCardLinks: songs.filter((song) => (song.attachments?.cardLinks || []).length > 0).length,
    storyBeatCount: songs.reduce((sum, song) => sum + (song.storyBeats || []).length, 0),
    generatedAt: now
  };
  songStore.updatedAt = now;

  inventoryStore.updatedAt = now;
  inventoryStore.audit = auditInventory(inventoryStore);

  const nextLorePlan = {
    ...lorePlan,
    kitCombinationEnrichment: {
      schemaVersion: "hapa.lore-production.kit-combination-enrichment.v1",
      runId,
      runAt: now,
      source: report.source,
      ownerNodes: ["hapa-avatar-node", "hapa-lore-node", "hapa-song-registry"],
      rule: "Every card has an avatar hardpoint slot and song link; every song has avatar and card links; avatars journal why the kit/song/card pair belongs.",
      canonBoundary: report.agentFrame.canonBoundary,
      reports: {
        latestRun: path.relative(ROOT, path.join(RUN_DIR, "latest-avatar-card-song-kit-enrichment.json")),
        latestAudit: path.relative(ROOT, path.join(HEALING_REPORT_DIR, "latest-kit-combination-enrichment-audit.json"))
      }
    },
    updatedAt: now
  };

  report.outputCounts = summarizeCoverage(cards, songs, inventoryStore, avatars);

  await writeJson(PATHS.avatars, avatarStore);
  await writeJson(PATHS.items, itemStore);
  await writeJson(PATHS.songs, songStore);
  await writeJson(PATHS.inventory, inventoryStore);
  await writeJson(PATHS.lorePlan, nextLorePlan);

  const runPath = path.join(RUN_DIR, `${runId}.json`);
  const latestRunPath = path.join(RUN_DIR, "latest-avatar-card-song-kit-enrichment.json");
  const latestAuditPath = path.join(HEALING_REPORT_DIR, "latest-kit-combination-enrichment-audit.json");
  await writeJson(runPath, report);
  await writeJson(latestRunPath, report);
  await writeJson(latestAuditPath, {
    schemaVersion: "hapa.kit-combination-enrichment-audit.v1",
    runId,
    runAt: now,
    coverage: report.outputCounts,
    gaps: findCoverageGaps(cards, songs, inventoryStore, avatars),
    reportPath: path.relative(ROOT, latestRunPath)
  });

  console.log(JSON.stringify({
    ok: true,
    runId,
    reportPath: path.relative(ROOT, latestRunPath),
    auditPath: path.relative(ROOT, latestAuditPath),
    cards: cards.length,
    songs: songs.length,
    avatars: avatars.length,
    cardsWithoutAvatar: report.outputCounts.cardsWithoutAvatar,
    cardsWithoutSlot: report.outputCounts.cardsWithoutSlot,
    cardsWithoutSong: report.outputCounts.cardsWithoutSong,
    songsWithoutAvatar: report.outputCounts.songsWithoutAvatar,
    songsWithoutCard: report.outputCounts.songsWithoutCard,
    avatarsWithJournalThisRun: report.avatarUpdates.length
  }, null, 2));
}

async function backupInputs(runId) {
  for (const filePath of Object.values(PATHS)) {
    if (!existsSync(filePath)) continue;
    await fs.copyFile(filePath, path.join(BACKUP_DIR, `${path.basename(filePath, ".json")}.before-${runId}.json`));
  }
}

function ensureInventoryStore(inventoryStore, avatars) {
  inventoryStore.schemaVersion = inventoryStore.schemaVersion || "hapa.inventory-store.v1";
  inventoryStore.hardpoints = mergeHardpointCatalog(inventoryStore.hardpoints || EQUIPMENT_HARDPOINTS);
  inventoryStore.avatarInventories = inventoryStore.avatarInventories || [];
  const byAvatarId = new Map(inventoryStore.avatarInventories.map((inventory) => [inventory.avatarId, inventory]));
  for (const avatar of avatars) {
    if (!avatar?.id) continue;
    if (!byAvatarId.has(avatar.id)) {
      const inventory = createAvatarInventory(avatar);
      inventoryStore.avatarInventories.push(inventory);
      byAvatarId.set(avatar.id, inventory);
    }
    const inventory = byAvatarId.get(avatar.id);
    inventory.avatarName = avatarName(avatar);
    inventory.hardpoints = mergeHardpointCatalog(inventory.hardpoints || EQUIPMENT_HARDPOINTS);
    inventory.library = unique(inventory.library || []);
    inventory.deck = unique(inventory.deck || []);
    inventory.hand = unique(inventory.hand || []);
    inventory.trainingDeck = unique(inventory.trainingDeck || []);
    inventory.cardStates = Array.isArray(inventory.cardStates) ? inventory.cardStates : [];
  }
}

function mergeHardpointCatalog(sourceHardpoints = []) {
  const byId = new Map((sourceHardpoints || []).map((hardpoint) => [hardpoint.id, hardpoint]));
  return EQUIPMENT_HARDPOINTS.map((standard) => {
    const source = byId.get(standard.id) || {};
    return {
      ...standard,
      ...source,
      accepts: unique(source.accepts || standard.accepts),
      cardIds: unique(source.cardIds || source.card_ids || []),
      maxCards: Number(source.maxCards || source.max_cards || standard.maxCards || 1)
    };
  });
}

function createAvatarInventory(avatar) {
  const now = new Date().toISOString();
  return {
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    library: [],
    deck: [],
    hand: [],
    trainingDeck: [],
    hardpoints: mergeHardpointCatalog(EQUIPMENT_HARDPOINTS),
    cardStates: [],
    createdAt: now,
    updatedAt: now
  };
}

function buildCardPlacementMap(inventoryStore) {
  const placements = new Map();
  for (const inventory of inventoryStore.avatarInventories || []) {
    for (const hardpoint of inventory.hardpoints || []) {
      for (const cardId of hardpoint.cardIds || []) {
        if (!placements.has(cardId)) placements.set(cardId, []);
        placements.get(cardId).push({ avatarId: inventory.avatarId, hardpointId: hardpoint.id });
      }
    }
  }
  return placements;
}

function buildSongIndex(songs) {
  const byId = new Map();
  for (const song of songs) {
    for (const key of songKeys(song)) byId.set(key, song);
  }
  return byId;
}

function buildSongCardCountMap(cards, songById) {
  const counts = new Map();
  for (const card of cards) {
    for (const link of cardSongLinks(card)) {
      const song = songById.get(link.songCardId) || songById.get(link.songId);
      if (song) incrementSongCardCount(counts, song);
    }
  }
  return counts;
}

function chooseAvatarForCard(card, avatars, avatarById, inventoryStore, existingPlacement) {
  if (existingPlacement?.avatarId && avatarById.has(existingPlacement.avatarId)) return avatarById.get(existingPlacement.avatarId);
  const connectedIds = unique([
    ...(card.connections?.avatarIds || []),
    ...(card.tarotCard?.avatarLoreLinks || []).map((link) => link.avatarId)
  ]);
  const connected = connectedIds.map((id) => avatarById.get(id)).filter(Boolean);
  const base = connected.length ? connected : stableSort(avatars, card.id || card.title || "card");
  const hardpointId = chooseHardpointForCard(card);
  const withCapacity = base.find((avatar) => hasHardpointCapacity(inventoryStore, avatar.id, hardpointId));
  if (withCapacity) return withCapacity;
  const fallback = stableSort(avatars, `${card.id || card.title}:fallback`)
    .sort((a, b) => inventoryLoad(inventoryStore, a.id) - inventoryLoad(inventoryStore, b.id))
    .find((avatar) => hasHardpointCapacity(inventoryStore, avatar.id, hardpointId));
  return fallback || base[0] || avatars[0];
}

function chooseHardpointForCard(card) {
  const hints = (card.equipment?.hardpointHints || []).filter((hint) => EQUIPMENT_HARDPOINTS.some((hardpoint) => hardpoint.id === hint));
  if (hints.length) return hints[0];
  if (card.kind === "protocol") return "protocols";
  if (card.kind === "skill") return "skills";
  if (["garden", "ship", "system", "node"].includes(card.kind)) return "node_ship";
  if (card.kind === "item") return "equipment";
  return "items";
}

function ensureCardSlot(inventoryStore, avatar, card, requestedHardpointId, now, runId) {
  const inventory = inventoryStore.avatarInventories.find((item) => item.avatarId === avatar.id);
  const hardpoint = findHardpointWithCapacity(inventory, requestedHardpointId, card.kind);
  const created = !(hardpoint.cardIds || []).includes(card.id);
  if (created) {
    if (hardpoint.cardIds.length >= hardpoint.maxCards) hardpoint.maxCards = hardpoint.cardIds.length + 1;
    hardpoint.cardIds = unique([...(hardpoint.cardIds || []), card.id]);
  }
  inventory.library = unique([...(inventory.library || []), card.id]);
  inventory.cardStates = [
    {
      cardId: card.id,
      zone: "equipped",
      hardpointId: hardpoint.id,
      status: "active",
      reason: `Kit enrichment ${runId}: ${avatarName(avatar)} chose ${card.title || card.name || card.id} as a ${hardpoint.label} card.`,
      updatedAt: now
    },
    ...(inventory.cardStates || []).filter((state) => state.cardId !== card.id || state.hardpointId !== hardpoint.id)
  ];
  inventory.updatedAt = now;
  return {
    avatarId: avatar.id,
    hardpointId: hardpoint.id,
    hardpointLabel: hardpoint.label,
    created
  };
}

function findHardpointWithCapacity(inventory, requestedHardpointId, kind) {
  const hardpoints = inventory.hardpoints || [];
  const requested = hardpoints.find((hardpoint) => hardpoint.id === requestedHardpointId);
  if (requested && hasCapacity(requested)) return requested;
  const compatible = hardpoints.find((hardpoint) => (hardpoint.accepts || []).includes(kind) && hasCapacity(hardpoint));
  if (compatible) return compatible;
  if (requested) return requested;
  return hardpoints.find((hardpoint) => (hardpoint.accepts || []).includes(kind)) || hardpoints.find((hardpoint) => hardpoint.id === "equipment") || hardpoints[0];
}

function hasHardpointCapacity(inventoryStore, avatarId, hardpointId) {
  const inventory = inventoryStore.avatarInventories.find((item) => item.avatarId === avatarId);
  const hardpoint = inventory?.hardpoints?.find((item) => item.id === hardpointId);
  return Boolean(hardpoint && hasCapacity(hardpoint));
}

function hasCapacity(hardpoint) {
  return (hardpoint.cardIds || []).length < Number(hardpoint.maxCards || 0);
}

function inventoryLoad(inventoryStore, avatarId) {
  const inventory = inventoryStore.avatarInventories.find((item) => item.avatarId === avatarId);
  return (inventory?.hardpoints || []).reduce((sum, hardpoint) => sum + (hardpoint.cardIds || []).length, 0);
}

function chooseSongForCombination(card, avatar, songs, songById, songCardCounts) {
  const existing = cardSongLinks(card)
    .map((link) => songById.get(link.songCardId) || songById.get(link.songId))
    .find(Boolean);
  if (existing) return existing;
  const avatarSongIds = [
    ...(avatar.mind?.dearPapaSongContext?.selectedSongCards || []).flatMap((choice) => [choice.cardId, choice.songId, choice.id]),
    ...songs
      .filter((song) => (song.attachments?.avatarLinks || []).some((link) => link.avatarId === avatar.id))
      .flatMap(songKeys)
  ];
  const candidateSongs = uniqueBy(avatarSongIds.map((id) => songById.get(id)).filter(Boolean), (song) => song.id);
  const pool = candidateSongs.length ? candidateSongs : songs;
  return stableSort(pool, `${card.id || card.title}:${avatar.id}`)
    .sort((a, b) => (songCardCounts.get(a.id) || 0) - (songCardCounts.get(b.id) || 0))
    [0] || songs[0];
}

function ensureCardAvatarAndSongLinks(card, avatar, song, placement, reasoning, now, runId) {
  card.connections = normalizeConnections(card.connections || {});
  card.connections.avatarIds = unique([...(card.connections.avatarIds || []), avatar.id]);
  card.connections.itemIds = unique([...(card.connections.itemIds || []), song.id, song.songId, song.audio?.registryTrackId].filter(Boolean));
  card.connections.nodeIds = unique([...(card.connections.nodeIds || []), "hapa-avatar-node", "hapa-lore-node", "hapa-song-registry"]);
  card.equipment = {
    ...(card.equipment || {}),
    hardpointHints: unique([placement.hardpointId, ...(card.equipment?.hardpointHints || [])]),
    equipRules: unique([
      ...(card.equipment?.equipRules || []),
      `Chosen by ${avatarName(avatar)} during ${runId}; pair with ${song.title} and cite soft-canon reasoning before promotion.`
    ]),
    effects: unique([...(card.equipment?.effects || []), `Kit-song bridge: ${song.title}`]),
    limits: unique([...(card.equipment?.limits || []), "Generated pairing remains soft canon until human review."])
  };
  const link = cardSongLink(card, avatar, song, placement, reasoning, now, runId);
  const before = cardSongLinks(card).length;
  card.songLinks = uniqueBy([link, ...(card.songLinks || [])], (item) => item.id || `${item.songCardId}:${item.avatarId}`);
  if (!card.tarotCard) card.tarotCard = createGeneratedTarotCard(card, avatar, song, placement, reasoning, now, runId);
  card.tarotCard.songLinks = uniqueBy([link, ...(card.tarotCard.songLinks || [])], (item) => item.id || `${item.songCardId}:${item.avatarId}`);
  card.tarotCard.avatarLoreLinks = uniqueBy([
    avatarLoreLink(card, avatar, song, placement, reasoning, now, runId),
    ...(card.tarotCard.avatarLoreLinks || [])
  ], (item) => item.id || item.avatarId);
  card.tarotCard.lore = {
    ...(card.tarotCard.lore || {}),
    canonStatus: card.tarotCard.lore?.canonStatus || "soft_canon",
    summary: card.tarotCard.lore?.summary || `${card.title || card.name || card.id} is now a kit card for ${avatarName(avatar)} and a song-linked Tarot draw surface for ${song.title}.`,
    characterHooks: unique([...(card.tarotCard.lore?.characterHooks || []), avatarName(avatar)]),
    relationshipHooks: unique([...(card.tarotCard.lore?.relationshipHooks || []), reasoning.personaReason]),
    protocolTeaching: card.tarotCard.lore?.protocolTeaching || "Cards become playable canon when avatar slot, song, context, and source reasoning travel together.",
    futureSeed: card.tarotCard.lore?.futureSeed || "Human review may promote this generated pairing to harder canon."
  };
  card.tags = unique([...(card.tags || []), "kit-combination-enriched", "avatar-slotted-card", "song-linked-card", placement.hardpointId]);
  card.sourceRefs = uniqueBy([
    ...(card.sourceRefs || []),
    {
      id: runId,
      label: "Avatar Card Song Kit Enrichment Pass",
      uri: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
      confidence: "generated",
      notes: reasoning.canonReason
    }
  ], (item) => item.id || item.uri || item.label);
  card.history = uniqueBy([
    {
      eventId: `history-${runId}-${card.id}`,
      label: "kit-combination-enriched",
      happenedAt: now,
      notes: `${avatarName(avatar)} slotted this card to ${placement.hardpointLabel} and paired it with ${song.title}.`
    },
    ...(card.history || [])
  ], (item) => item.eventId || item.label);
  card.updatedAt = now;
  reasoning.createdSongLink = cardSongLinks(card).length > before;
}

function ensureSongAvatarAndCardLinks(song, avatar, card, reasoning, now, runId) {
  song.attachments = song.attachments || {};
  song.attachments.avatarLinks = uniqueBy([
    {
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      role: "kit-combination-avatar",
      reason: reasoning.why,
      tags: unique(["kit-combination", "dear-papa", "soft-canon", runId]),
      linkedAt: now
    },
    ...(song.attachments.avatarLinks || [])
  ], (item) => item.avatarId || item.avatarName);
  song.attachments.cardLinks = uniqueBy([
    {
      cardId: card.id,
      cardTitle: card.title || card.name || card.id,
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      role: "kit-tarot-card",
      reason: reasoning.why,
      canonReason: reasoning.canonReason,
      contextReason: reasoning.contextReason,
      personaReason: reasoning.personaReason,
      tags: unique(["kit-combination", card.kind, card.cardType, "soft-canon"]),
      linkedAt: now
    },
    ...(song.attachments.cardLinks || [])
  ], (item) => item.cardId || item.cardTitle);
  song.storyBeats = uniqueBy([
    {
      id: `song-beat-${song.id}-${card.id}-${avatar.id}`,
      authorType: "lorekeeper-agent",
      authorName: "Hapa Lorekeeper",
      avatarId: avatar.id,
      beatType: "kit-combination",
      body: reasoning.why,
      tags: ["kit-combination", "card-song-avatar", "soft-canon"],
      createdAt: now
    },
    ...(song.storyBeats || [])
  ], (item) => item.id);
  song.updatedAt = now;
}

function ensureAvatarKitCombinationMind(avatar, combos, now, runId) {
  avatar.mind = avatar.mind || {};
  avatar.mind.tarotCardDeck = uniqueBy([
    ...(avatar.mind.tarotCardDeck || []),
    ...combos.map((combo) => ({
      id: `kit-choice-${combo.avatarId}-${combo.cardId}-${combo.songCardId}`,
      schemaVersion: "hapa.avatar-tarot-card-choice.v1",
      cardId: combo.cardId,
      cardTitle: combo.cardTitle,
      cardType: combo.cardType,
      tarotMainType: combo.cardType,
      role: `kit-${combo.hardpointId}`,
      whyChosen: combo.reasoning.why,
      canonReason: combo.reasoning.canonReason,
      loreContext: combo.reasoning.contextReason,
      objectiveFit: combo.reasoning.objectiveFit,
      deckInfluence: combo.reasoning.deckInfluence,
      futureInfluence: combo.reasoning.futureInfluence,
      songId: combo.songId,
      songTitle: combo.songTitle,
      songWhy: combo.reasoning.songWhy,
      vibe: combo.reasoning.vibe,
      sourcePath: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
      confidence: "generated",
      status: "active",
      createdAt: now,
      updatedAt: now
    }))
  ], (choice) => choice.id || `${choice.cardId}:${choice.songId}`);
  avatar.mind.dearPapaSongContext = {
    ...(avatar.mind.dearPapaSongContext || {}),
    selectedSongCards: uniqueBy([
      ...(avatar.mind.dearPapaSongContext?.selectedSongCards || []),
      ...combos.map((combo) => ({
        id: `kit-song-${combo.avatarId}-${combo.songCardId}`,
        schemaVersion: "hapa.avatar-dear-papa-song-choice.v1",
        songId: combo.songId,
        cardId: combo.songCardId,
        title: combo.songTitle,
        albumId: "dear-papa-album",
        author: "Calder",
        whySelected: combo.reasoning.songWhy,
        genesisInstruction: combo.reasoning.deckInfluence,
        communicationUse: combo.reasoning.personaReason,
        sourcePath: "data/hapa-songs-store.json",
        status: "active",
        createdAt: now,
        updatedAt: now
      }))
    ], (choice) => choice.cardId || choice.songId || choice.id),
    genesisUse: unique([
      ...(avatar.mind.dearPapaSongContext?.genesisUse || []),
      "Kit-combination enrichment pairs avatar hardpoints, Tarot cards, and Dear Papa songs with canon/context/persona reasons."
    ]),
    status: "active",
    updatedAt: now
  };
  avatar.mind.contextMap = uniqueBy([
    ...(avatar.mind.contextMap || []),
    {
      id: `${avatar.id}-kit-combination-context`,
      contextId: "avatar-card-song-kit-enrichment",
      label: "Avatar/Card/Song kit combination enrichment",
      kind: "canon",
      avatarBelief: `${avatarName(avatar)} now treats kit cards and songs as paired evidence: no card should be played without an avatar slot, song, and reason.`,
      publicSummary: `${avatarName(avatar)} chose ${combos.length} card/song kit combinations for soft-canon review.`,
      classification: "generated",
      confidence: "generated",
      visibility: "shared",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (context) => context.id || context.contextId);
  avatar.mind.selfKnowledge = uniqueBy([
    ...(avatar.mind.selfKnowledge || []),
    {
      id: `${avatar.id}-kit-combination-rule`,
      label: "Kit combination rule",
      value: `${avatarName(avatar)} chooses Tarot cards with matching Dear Papa songs only when canon, context, and persona all have a readable reason.`,
      classification: "generated",
      confidence: "generated",
      visibility: "shared",
      source: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (fact) => fact.id || fact.label);
  avatar.mind.journal = uniqueBy([
    ...(avatar.mind.journal || []),
    avatarJournalEntry(avatar, combos, now, runId)
  ], (entry) => entry.id);
  avatar.mind.genesisRuns = uniqueBy([
    ...(avatar.mind.genesisRuns || []),
    {
      id: runId,
      runId,
      schemaVersion: "hapa.avatar-genesis-run.v1",
      runType: "kit-combination-enrichment",
      title: "Avatar Card Song Kit Enrichment",
      sourcePath: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
      summary: `${avatarName(avatar)} chose ${combos.length} Tarot card and Dear Papa song kit combinations with canon/context/persona reasoning.`,
      lorekeeper: "hapa-lore-node",
      cardForge: "hapa-avatar-node",
      canonStatus: "soft_canon",
      outputRefs: combos.map((combo) => `${combo.cardId}:${combo.songCardId}`),
      status: "complete",
      completedAt: now,
      createdAt: now,
      updatedAt: now
    }
  ], (run) => run.id || run.runId);
  avatar.mind.updatedAt = now;
  avatar.updatedAt = now;
}

function avatarJournalEntry(avatar, combos, now, runId) {
  const topCombos = combos.slice(0, 8);
  const lines = topCombos.map((combo) => `- ${combo.cardTitle} + ${combo.songTitle}: ${combo.reasoning.objectiveFit}`).join("\n");
  return {
    id: `${avatar.id}-kit-combination-journal-${runId}`,
    schemaVersion: "hapa.avatar-journal-entry.v1",
    journalType: "lorekeeper-kit-combination",
    dateOrSequenceMarker: "post-merge kit combination enrichment",
    entryVoice: "lorekeeper",
    privateEntry: `${avatarName(avatar)} chose ${combos.length} Tarot card and Dear Papa song kit combinations after the recovered app merge.\n\n${lines}\n\nLorekeeper note: these are soft-canon kit links. The choice is valid only because card slot, song, canon reason, context reason, and persona reason are all attached together.`,
    publicSummary: `${avatarName(avatar)} chose ${combos.length} card/song kit combinations with explicit canon, context, and persona reasoning.`,
    mentionedAvatarIds: [avatar.id],
    mentionedAvatarNames: [avatarName(avatar)],
    itemTags: unique(combos.slice(0, 24).map((combo) => combo.cardId)),
    eventTags: ["kit-combination", "genesis-update", "lorekeeper-review", "soft-canon"],
    classification: "generated",
    canonStatus: "soft_canon",
    causalityStatus: "causality-review-pending",
    reviewedAvatarIds: [avatar.id],
    reviewedAvatarNames: [avatarName(avatar)],
    responsibilityTags: ["avatar-slot", "tarot-card", "dear-papa-song", "canon-reasoning"],
    sourceRefs: [
      {
        id: runId,
        title: "Avatar Card Song Kit Enrichment",
        path: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
        confidence: "generated"
      }
    ],
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function createGeneratedTarotCard(card, avatar, song, placement, reasoning, now, runId) {
  return {
    schemaVersion: "hapa.tarot-card-details.v1",
    mainType: card.cardType || `${card.kind || "object"}_card`,
    tarotNumber: "",
    title: card.title || card.name || card.id,
    subtitle: "Kit Combination Card",
    archetype: `${placement.hardpointLabel} / ${avatarName(avatar)}`,
    keywords: unique(["kit-combination", placement.hardpointId, card.kind, "dear-papa", "soft-canon"]),
    flavorText: "A card becomes playable when its avatar slot and song can explain each other.",
    effectTitle: "Chosen Kit Pair",
    effectText: reasoning.objectiveFit,
    catalog: {
      collectionId: "hapa-kit-combination-tarot",
      collectionTitle: "Hapa Kit Combination Tarot",
      family: "Dear Papa Tarot",
      typeLabel: "Kit Combination Card",
      sequence: 0,
      sourceFolder: "data/item-manager-store.json",
      confidence: "generated"
    },
    identity: {
      systemName: "Hapa Tarot System",
      deckName: "Hapa Kit Combination Tarot",
      tarotType: card.title || card.name || card.id,
      tarotCardName: card.title || card.name || card.id,
      printedTitle: card.title || card.name || card.id,
      displayTitle: card.title || card.name || card.id,
      functionalType: placement.hardpointLabel,
      functionalTypeSlug: placement.hardpointId,
      cardTypeName: card.cardType || `${card.kind || "object"}_card`,
      confidence: "generated"
    },
    cardFace: {
      titleLine: card.title || card.name || card.id,
      subtitleLine: song.title,
      typeLine: placement.hardpointLabel,
      keywordLine: unique([placement.hardpointId, card.kind, "song-linked"]).join(" / "),
      coreMeaning: reasoning.why,
      uprightText: reasoning.canonReason,
      invertedText: "A card without avatar, song, and reason becomes disconnected inventory.",
      mechanicsText: reasoning.deckInfluence,
      visualLanguageText: "Show the card as a hardpoint object with audio-reactive Dear Papa edge light."
    },
    attribution: {
      author: "Calder",
      shop: "Mimi's Card Shop",
      albumTitle: "Dear Papa",
      rightsStatus: "operator_authored_hapa_creative_commons",
      sourceTool: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
      sourcePaths: ["data/item-manager-store.json", "data/hapa-songs-store.json", "data/avatar-store.json"],
      notes: `Generated by ${runId}; soft canon until human review.`
    },
    mechanics: {
      broadGameMechanic: "Draw the card with its chosen avatar and song; cite canon/context/persona reasoning before using it in a scene.",
      deckUse: "Avatar kit Tarot draw",
      surfaceUse: "Avatar Builder protocol view and 3D Tarot",
      relationshipUse: "Reveal why the avatar can carry this card now.",
      effects: [reasoning.objectiveFit],
      limits: ["Soft canon until human review."]
    },
    lore: {
      summary: reasoning.why,
      canonStatus: "soft_canon",
      characterHooks: [avatarName(avatar)],
      relationshipHooks: [reasoning.personaReason],
      protocolTeaching: "Slot, song, context, and persona must stay attached.",
      futureSeed: reasoning.futureInfluence,
      sourceClaims: [card.id, song.id, song.songId].filter(Boolean)
    },
    songLinks: [],
    sceneLinks: [],
    avatarLoreLinks: [],
    mediaLinks: [],
    ocr: {}
  };
}

function cardSongLink(card, avatar, song, placement, reasoning, now, runId) {
  return {
    id: `song-link-${slugify(card.id)}-${slugify(song.id)}-${slugify(avatar.id)}`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    songId: song.songId || song.id,
    songCardId: song.id,
    songTitle: song.title,
    cardId: card.id,
    choiceId: `choice-${slugify(avatar.id)}-${slugify(card.id)}-${slugify(song.id)}`,
    tarotType: card.tarotCard?.identity?.tarotType || card.title || card.name || card.id,
    functionalType: placement.hardpointLabel,
    why: reasoning.why,
    whyChosen: reasoning.why,
    canonReason: reasoning.canonReason,
    objectiveFit: reasoning.objectiveFit,
    deckInfluence: reasoning.deckInfluence,
    futureInfluence: reasoning.futureInfluence,
    vibe: reasoning.vibe,
    notes: reasoning.contextReason,
    sourcePath: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
    confidence: "generated",
    createdAt: now,
    updatedAt: now,
    runId
  };
}

function avatarLoreLink(card, avatar, song, placement, reasoning, now, runId) {
  return {
    id: `avatar-lore-${slugify(card.id)}-${slugify(avatar.id)}`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    cardId: card.id,
    choiceId: `choice-${slugify(avatar.id)}-${slugify(card.id)}-${slugify(song.id)}`,
    tarotType: card.tarotCard?.identity?.tarotType || card.title || card.name || card.id,
    functionalType: placement.hardpointLabel,
    why: reasoning.why,
    whyChosen: reasoning.why,
    canonReason: reasoning.canonReason,
    objectiveFit: reasoning.objectiveFit,
    deckInfluence: reasoning.deckInfluence,
    futureInfluence: reasoning.futureInfluence,
    vibe: reasoning.vibe,
    notes: reasoning.personaReason,
    sourcePath: "scripts/run-avatar-card-song-kit-enrichment-pass.mjs",
    confidence: "generated",
    createdAt: now,
    updatedAt: now,
    runId
  };
}

function buildReasoning(avatar, card, song, placement, runId) {
  const persona = avatar.mind?.personaAnchor || {};
  const context = avatar.mind?.contextMap?.find((entry) => entry.status !== "tombstone") || {};
  const cardTitle = card.title || card.name || card.id;
  const songTitle = song.title || song.songId || song.id;
  const want = persona.wants || "to become useful and source-traceable inside the restored Hapa roster";
  const fear = persona.fears || "silent divergence between avatar, card, song, and lore stores";
  const contextLabel = context.label || "the recovered canonical Avatar Builder merge";
  return {
    why: `${avatarName(avatar)} pairs ${cardTitle} with ${songTitle} in ${placement.hardpointLabel} because the card gives the kit an action surface while the song gives the choice an emotional and source-traceable rhythm.`,
    canonReason: `Soft-canon ${runId}: preserve existing card, song, and avatar IDs; generated links remain reviewable until human promotion.`,
    contextReason: `${contextLabel}: this pairing keeps card, song, and avatar evidence attached after the duplicate app divergence was repaired.`,
    personaReason: `${avatarName(avatar)} wants ${want}; the pairing answers that want while naming the risk of ${fear}.`,
    objectiveFit: `${placement.hardpointLabel} fit: ${cardTitle} acts as the kit card, ${songTitle} acts as the performance/canon soundtrack, and ${avatarName(avatar)} carries the accountability.`,
    deckInfluence: `When drawn, use ${songTitle} to decide how ${avatarName(avatar)} activates ${cardTitle} without losing source provenance.`,
    futureInfluence: `A future lorekeeper can promote or revise this combo after human review, but must keep the avatar slot and song link together.`,
    songWhy: `${songTitle} is chosen because it gives ${cardTitle} a Dear Papa signal that can be heard, cited, and visualized.`,
    vibe: unique([song.lore?.mood, card.kind, placement.hardpointId, "soft-canon"]).filter(Boolean).join(" / ")
  };
}

function summarizeCoverage(cards, songs, inventoryStore, avatars) {
  const placements = buildCardPlacementMap(inventoryStore);
  const cardIdsWithSlot = new Set(placements.keys());
  const songsWithCards = songIdsWithCardLinks(cards, songs);
  return {
    avatars: avatars.length,
    cards: cards.length,
    songs: songs.length,
    inventoryAvatars: inventoryStore.avatarInventories?.length || 0,
    cardsWithAvatar: cards.filter((card) => (card.connections?.avatarIds || []).length > 0).length,
    cardsWithSlot: cards.filter((card) => cardIdsWithSlot.has(card.id)).length,
    cardsWithSong: cards.filter((card) => cardSongLinks(card).length > 0).length,
    cardsWithTarotDetails: cards.filter((card) => card.tarotCard).length,
    songsWithAvatar: songs.filter((song) => (song.attachments?.avatarLinks || []).length > 0).length,
    songsWithCard: songs.filter((song) => (song.attachments?.cardLinks || []).length > 0 || songsWithCards.has(song.id) || songsWithCards.has(song.songId)).length,
    cardsWithoutAvatar: cards.filter((card) => !(card.connections?.avatarIds || []).length).length,
    cardsWithoutSlot: cards.filter((card) => !cardIdsWithSlot.has(card.id)).length,
    cardsWithoutSong: cards.filter((card) => !cardSongLinks(card).length).length,
    songsWithoutAvatar: songs.filter((song) => !(song.attachments?.avatarLinks || []).length).length,
    songsWithoutCard: songs.filter((song) => !(song.attachments?.cardLinks || []).length && !songsWithCards.has(song.id) && !songsWithCards.has(song.songId)).length,
    totalSlotPlacements: [...placements.values()].reduce((sum, list) => sum + list.length, 0)
  };
}

function findCoverageGaps(cards, songs, inventoryStore, avatars) {
  const placements = buildCardPlacementMap(inventoryStore);
  const songsWithCards = songIdsWithCardLinks(cards, songs);
  return {
    cardsWithoutAvatar: cards.filter((card) => !(card.connections?.avatarIds || []).length).map(cardSummary).slice(0, 50),
    cardsWithoutSlot: cards.filter((card) => !placements.has(card.id)).map(cardSummary).slice(0, 50),
    cardsWithoutSong: cards.filter((card) => !cardSongLinks(card).length).map(cardSummary).slice(0, 50),
    songsWithoutAvatar: songs.filter((song) => !(song.attachments?.avatarLinks || []).length).map(songSummary).slice(0, 50),
    songsWithoutCard: songs.filter((song) => !(song.attachments?.cardLinks || []).length && !songsWithCards.has(song.id) && !songsWithCards.has(song.songId)).map(songSummary).slice(0, 50),
    avatarsWithoutJournal: avatars.filter((avatar) => !(avatar.mind?.journal || []).length).map((avatar) => ({ id: avatar.id, name: avatarName(avatar) })).slice(0, 50)
  };
}

function auditInventory(inventoryStore) {
  const placements = buildCardPlacementMap(inventoryStore);
  return {
    schemaVersion: "hapa.inventory-audit.v1",
    avatarCount: inventoryStore.avatarInventories?.length || 0,
    libraryCards: unique((inventoryStore.avatarInventories || []).flatMap((inventory) => inventory.library || [])).length,
    deckCards: unique((inventoryStore.avatarInventories || []).flatMap((inventory) => inventory.deck || [])).length,
    handCards: unique((inventoryStore.avatarInventories || []).flatMap((inventory) => inventory.hand || [])).length,
    trainingDeckCards: unique((inventoryStore.avatarInventories || []).flatMap((inventory) => inventory.trainingDeck || [])).length,
    equippedCards: placements.size,
    totalEquipments: [...placements.values()].reduce((sum, list) => sum + list.length, 0),
    generatedAt: new Date().toISOString()
  };
}

function songIdsWithCardLinks(cards) {
  const ids = new Set();
  for (const card of cards) {
    for (const link of cardSongLinks(card)) {
      for (const key of [link.songCardId, link.songId].filter(Boolean)) ids.add(key);
    }
  }
  return ids;
}

function cardSongLinks(card) {
  return [
    ...(card.songLinks || []),
    ...(card.tarotCard?.songLinks || []),
    ...(card.episodeCard?.songLinks || [])
  ].filter(Boolean);
}

function firstPlacement(placements = []) {
  return Array.isArray(placements) && placements.length ? placements[0] : null;
}

function rememberPlacement(map, cardId, placement) {
  const list = map.get(cardId) || [];
  if (!list.some((item) => item.avatarId === placement.avatarId && item.hardpointId === placement.hardpointId)) {
    list.push(placement);
  }
  map.set(cardId, list);
}

function normalizeConnections(connections = {}) {
  return {
    avatarIds: unique(connections.avatarIds || connections.avatar_ids || []),
    teamIds: unique(connections.teamIds || connections.team_ids || []),
    placeIds: unique(connections.placeIds || connections.place_ids || []),
    sceneIds: unique(connections.sceneIds || connections.scene_ids || []),
    episodeIds: unique(connections.episodeIds || connections.episode_ids || []),
    volumeIds: unique(connections.volumeIds || connections.volume_ids || []),
    itemIds: unique(connections.itemIds || connections.item_ids || []),
    nodeIds: unique(connections.nodeIds || connections.node_ids || []),
    shipIds: unique(connections.shipIds || connections.ship_ids || [])
  };
}

function songKeys(song) {
  return unique([song.id, song.songId, song.cardId, song.audio?.registryTrackId, song.lineage?.registryTrackId, slugify(song.title || "")]);
}

function incrementSongCardCount(counts, song) {
  counts.set(song.id, (counts.get(song.id) || 0) + 1);
}

function pushCombo(map, avatarId, combo) {
  if (!map.has(avatarId)) map.set(avatarId, []);
  map.get(avatarId).push(combo);
}

function avatarName(avatar) {
  return avatar?.primaryName || avatar?.names?.[0]?.name || avatar?.name || avatar?.id || "Unknown Avatar";
}

function cardSummary(card) {
  return { id: card.id, title: card.title || card.name || card.id, kind: card.kind, cardType: card.cardType };
}

function songSummary(song) {
  return { id: song.id, songId: song.songId, title: song.title };
}

function stableSort(values, salt) {
  return [...values].sort((a, b) => stableNumber(`${salt}:${a.id}`) - stableNumber(`${salt}:${b.id}`));
}

function stableNumber(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function uniqueBy(values = [], keyFn = (item) => item?.id) {
  const byKey = new Map();
  for (const value of values.filter(Boolean)) {
    const key = keyFn(value);
    if (!key) continue;
    byKey.set(key, value);
  }
  return [...byKey.values()];
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
