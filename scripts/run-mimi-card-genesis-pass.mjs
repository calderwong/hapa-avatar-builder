#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";
import { normalizeInventoryStore, normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";

const DATA_DIR = "data";
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const INGEST_DIR = path.join(DATA_DIR, "mimi-card-shop-ingest");
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const INVENTORY_STORE_PATH = path.join(DATA_DIR, "inventory-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const MANIFEST_PATH = path.join(INGEST_DIR, "manifest.json");
const HEALING_REPORT_PATH = path.join(INGEST_DIR, "healing-report.json");
const BATCH_REPORT_PATH = path.join(RUN_DIR, `mimi-card-shop-genesis-batch-${stamp()}.json`);
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];
const PRIMARY_CARDS_PER_AVATAR = 3;

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const now = new Date().toISOString();
const runStamp = now.replace(/[:.]/g, "-");

await main();

async function main() {
  await mkdir(RUN_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(INGEST_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });

  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const inventoryStore = normalizeInventoryStore(
    await readJson(INVENTORY_STORE_PATH),
    avatarStore.avatars || [],
    itemStore.cards
  );
  const sceneStore = normalizeSceneGraph(await readJson(SCENE_STORE_PATH));
  const songbook = await readJson(SONGBOOK_PATH);
  const manifest = await readJson(MANIFEST_PATH).catch(() => ({ cards: [] }));
  const avatars = (avatarStore.avatars || [])
    .filter((avatar) => avatar?.id)
    .map((avatar) => normalizeAvatarCard(avatar))
    .sort((a, b) => avatarName(a).localeCompare(avatarName(b)) || a.id.localeCompare(b.id));
  const tarotCards = itemStore.cards
    .filter(isTarotLikeCard)
    .sort((a, b) => compareText(a.title, b.title) || a.id.localeCompare(b.id));
  const songs = (songbook.songCards || []).slice().sort((a, b) => Number(a.trackNumber || 0) - Number(b.trackNumber || 0));
  const protocolContext = itemStore.cards.filter((card) => card.cardType === "protocol_card" || card.kind === "protocol");
  const loreContext = itemStore.cards.filter((card) =>
    card.cardType === "lore_tarot_card" ||
    card.tarotCard?.mainType === "lore_tarot_card" ||
    /lore|canon|memory|world/i.test(`${card.title} ${(card.tags || []).join(" ")}`)
  );

  if (!avatars.length) throw new Error("No avatars found.");
  if (!tarotCards.length) throw new Error("No Tarot cards found. Run npm run mimi:ingest or npm run tarot:refresh-ocr first.");
  if (!songs.length) throw new Error("No Dear Papa song cards found.");

  const initialGaps = identifyCoverageGaps(tarotCards, inventoryStore, avatarStore, itemStore, sceneStore);
  const primaryAssignments = choosePrimaryAssignments({ avatars, cards: tarotCards, songs, protocolContext, loreContext });
  const healingAssignments = chooseHealingAssignments({
    avatars,
    cards: tarotCards,
    songs,
    existingAssignments: primaryAssignments,
    initialGaps
  });
  const allAssignments = [...primaryAssignments, ...healingAssignments];
  hydrateAssignmentScenes(allAssignments, sceneStore.scenes || [], itemStore.cards || []);
  const updates = await applyAssignments({
    avatarStore,
    inventoryStore,
    itemStore,
    sceneStore,
    avatars,
    assignments: allAssignments,
    protocolContext,
    loreContext,
    manifest
  });
  const finalGaps = identifyCoverageGaps(tarotCards, updates.inventoryStore, updates.avatarStore, updates.itemStore, updates.sceneStore);
  const healingReport = {
    schemaVersion: "hapa.mimi-card-shop-healing-report.v1",
    generatedAt: now,
    source: "scripts/run-mimi-card-genesis-pass.mjs",
    initial: summarizeGaps(initialGaps),
    final: summarizeGaps(finalGaps),
    healedAssignments: healingAssignments.map(summarizeAssignment),
    primaryAssignments: primaryAssignments.map(summarizeAssignment),
    cardsPerAvatar: assignmentCounts(allAssignments),
    songCoverage: songCoverage(allAssignments),
    drained: finalGaps.unassignedToAvatar.length === 0 &&
      finalGaps.unassignedToSong.length === 0 &&
      finalGaps.unassignedToScene.length === 0 &&
      finalGaps.cardsWithoutCardAvatarConnection.length === 0 &&
      finalGaps.cardsWithoutCardSceneConnection.length === 0
  };
  const batchReport = {
    schemaVersion: "hapa.mimi-card-shop-genesis-batch.v1",
    generatedAt: now,
    dryRun,
    source: "scripts/run-mimi-card-genesis-pass.mjs",
    reviewedContext: {
      tarotCardCount: tarotCards.length,
      mimiManifestPath: MANIFEST_PATH,
      protocolCardCount: protocolContext.length,
      loreContextCardCount: loreContext.length,
      avatarCount: avatars.length,
      songCount: songs.length
    },
    avatarRuns: updates.runReceipts,
    healingReportPath: HEALING_REPORT_PATH,
    drained: healingReport.drained
  };

  if (!dryRun) {
    await backupStores();
    await writeJson(AVATAR_STORE_PATH, updates.avatarStore);
    await writeJson(INVENTORY_STORE_PATH, updates.inventoryStore);
    await writeJson(ITEM_STORE_PATH, updates.itemStore);
    await writeJson(SCENE_STORE_PATH, updates.sceneStore);
    await writeJson(HEALING_REPORT_PATH, healingReport);
    await writeJson(BATCH_REPORT_PATH, batchReport);
    await appendSubscriberEvent("avatar.mimi-card-shop-genesis-updated", {
      avatarStorePath: path.resolve(AVATAR_STORE_PATH),
      inventoryStorePath: path.resolve(INVENTORY_STORE_PATH),
      itemStorePath: path.resolve(ITEM_STORE_PATH),
      sceneStorePath: path.resolve(SCENE_STORE_PATH),
      batchReportPath: path.resolve(BATCH_REPORT_PATH),
      healingReportPath: path.resolve(HEALING_REPORT_PATH),
      assignments: allAssignments.length,
      drained: healingReport.drained
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    avatarCount: avatars.length,
    tarotCardCount: tarotCards.length,
    primaryAssignments: primaryAssignments.length,
    healingAssignments: healingAssignments.length,
    totalAssignments: allAssignments.length,
    initialGaps: summarizeGaps(initialGaps),
    finalGaps: summarizeGaps(finalGaps),
    drained: healingReport.drained,
    batchReportPath: BATCH_REPORT_PATH,
    healingReportPath: HEALING_REPORT_PATH
  }, null, 2));
}

function choosePrimaryAssignments({ avatars, cards, songs, protocolContext, loreContext }) {
  const assignments = [];
  for (const avatar of avatars) {
    const avatarText = avatarContextText(avatar);
    const alreadyChosen = new Set((avatar.mind?.tarotCardDeck || []).map((choice) => choice.cardId).filter(Boolean));
    const candidates = cards
      .map((card) => ({
        card,
        score: scoreCardForAvatar(card, avatar, avatarText, protocolContext, loreContext) - (alreadyChosen.has(card.id) ? 1000 : 0)
      }))
      .sort((a, b) => b.score - a.score || stableHash(`${avatar.id}:${a.card.id}`).localeCompare(stableHash(`${avatar.id}:${b.card.id}`)));
    const chosen = [];
    for (const candidate of candidates) {
      if (chosen.length >= PRIMARY_CARDS_PER_AVATAR) break;
      if (chosen.some((card) => card.cardType === candidate.card.cardType) && chosen.length < PRIMARY_CARDS_PER_AVATAR - 1) continue;
      chosen.push(candidate.card);
    }
    while (chosen.length < PRIMARY_CARDS_PER_AVATAR) {
      const fallback = candidates[chosen.length]?.card;
      if (!fallback || chosen.includes(fallback)) break;
      chosen.push(fallback);
    }
    for (const [index, card] of chosen.entries()) {
      assignments.push(buildAssignment({
        avatar,
        card,
        song: pickSongForCard(card, avatar, songs, index),
        mode: "primary",
        reasonRank: index + 1
      }));
    }
  }
  return assignments;
}

function chooseHealingAssignments({ avatars, cards, songs, existingAssignments, initialGaps }) {
  const assigned = new Set(existingAssignments.map((assignment) => assignment.cardId));
  const needsCoverage = new Set([
    ...initialGaps.unassignedToAvatar,
    ...initialGaps.unassignedToSong,
    ...initialGaps.unassignedToScene,
    ...initialGaps.cardsWithoutCardAvatarConnection,
    ...initialGaps.cardsWithoutCardSceneConnection
  ]);
  const uncovered = cards.filter((card) =>
    !assigned.has(card.id) ||
    needsCoverage.has(card.id)
  );
  const healing = [];
  for (const card of uncovered) {
    if (assigned.has(card.id)) continue;
    const avatar = avatars[healing.length % avatars.length];
    healing.push(buildAssignment({
      avatar,
      card,
      song: pickSongForCard(card, avatar, songs, healing.length),
      mode: "healing",
      reasonRank: healing.length + 1
    }));
    assigned.add(card.id);
  }
  return healing;
}

async function applyAssignments({ avatarStore, inventoryStore, itemStore, sceneStore, avatars, assignments, protocolContext, loreContext, manifest }) {
  const avatarById = new Map((avatarStore.avatars || []).map((avatar) => [avatar.id, normalizeAvatarCard(avatar)]));
  const inventoryByAvatar = new Map((inventoryStore.avatarInventories || []).map((inventory) => [inventory.avatarId, inventory]));
  const assignmentsByAvatar = new Map();
  for (const assignment of assignments) {
    assignmentsByAvatar.set(assignment.avatarId, [...(assignmentsByAvatar.get(assignment.avatarId) || []), assignment]);
  }
  const runReceipts = [];

  for (const avatar of avatars) {
    const avatarAssignments = assignmentsByAvatar.get(avatar.id) || [];
    if (!avatarAssignments.length) continue;
    const current = avatarById.get(avatar.id) || avatar;
    const run = buildAvatarRun(current, avatarAssignments, protocolContext, loreContext, manifest);
    const runFile = path.join(RUN_DIR, `${slugify(avatarName(current)) || current.id}-mimi-card-shop-genesis-${runStamp}.json`);
    runReceipts.push({
      avatarId: current.id,
      avatarName: avatarName(current),
      runId: run.runId,
      runFile,
      choiceCount: avatarAssignments.length
    });
    if (!dryRun) {
      await writeJson(runFile, run);
    }
    avatarById.set(current.id, applyAvatarMindUpdates(current, avatarAssignments, run, runFile));
    const inventory = inventoryByAvatar.get(current.id);
    if (inventory) applyInventoryAssignments(inventory, avatarAssignments);
  }

  const nextAvatarStore = {
    ...avatarStore,
    avatars: (avatarStore.avatars || []).map((avatar) => normalizeAvatarCard(avatarById.get(avatar.id) || avatar)),
    updatedAt: now
  };
  const nextInventoryStore = normalizeInventoryStore({
    ...inventoryStore,
    avatarInventories: [...inventoryByAvatar.values()],
    updatedAt: now
  }, nextAvatarStore.avatars, itemStore.cards);
  const nextItemStore = applyItemAssignments(itemStore, assignments);
  const nextSceneStore = applySceneAssignments(sceneStore, assignments);

  return {
    avatarStore: nextAvatarStore,
    inventoryStore: nextInventoryStore,
    itemStore: nextItemStore,
    sceneStore: nextSceneStore,
    runReceipts
  };
}

function buildAssignment({ avatar, card, song, mode, reasonRank }) {
  const title = card.title || card.id;
  const name = avatarName(avatar);
  const typeLabel = cardTypeLabel(card);
  const tarotType = card.tarotCard?.identity?.tarotType || card.tarotCard?.identity?.tarotCardName || card.tarotCard?.title || title;
  const functionalType = card.tarotCard?.identity?.functionalType || card.tarotCard?.typeDetails?.functionalType || typeLabel.replace(/\s+Card$/i, "");
  const keywords = cardKeywords(card);
  const objective = avatarObjective(avatar);
  const songTitle = song.title || song.id;
  return {
    id: `mimi-choice-${avatar.id}-${card.id}-${runStamp}`,
    schemaVersion: "hapa.mimi-card-shop-avatar-choice.v1",
    mode,
    avatarId: avatar.id,
    avatarName: name,
    cardId: card.id,
    cardTitle: title,
    cardType: card.cardType,
    tarotMainType: card.tarotCard?.mainType || card.cardType,
    tarotType,
    functionalType,
    songId: song.songId || song.id,
    songCardId: song.id,
    songTitle,
    sceneId: "",
    sceneTitle: "",
    reasonRank,
    whyChosen: `${name} chooses ${title} as ${tarotType} / ${functionalType} because its ${typeLabel} signal gives them ${keywords.join(", ") || "a usable Hapa teaching object"} in relation to their canon objective: ${objective}.`,
    canonReason: `${title} remains generated/soft canon, but it can safely extend ${name}'s lore because the source card is OCR/catalog-attributed and the choice is recorded as an Avatar Genesis deck pass.`,
    loreContext: `${name} reviews the refreshed Tarot card, existing Hapa protocol cards, existing lore cards, and their own mind context before accepting this deck influence.`,
    objectiveFit: `${title} supports ${name}'s current objective by turning ${keywords[0] || typeLabel} into a playable decision cue rather than loose decoration.`,
    deckInfluence: `${title} changes ${name}'s deck by adding a ${typeLabel} pile option that can be drawn, placed on the surface, and connected to avatar/song context.`,
    futureInfluence: `${title} should affect ${name}'s next chapter when ${keywords.slice(0, 3).join(", ") || "Hapa protocol utility"} needs to become action, relationship, or backstory.`,
    songWhy: `${name} pairs ${title} with ${songTitle} because the song's ${songMood(song)} vibe can carry the card's ${keywords.slice(0, 3).join(", ") || typeLabel.toLowerCase()} into performance, memory, and future scenes.`,
    vibe: songMood(song),
    createdAt: now,
    updatedAt: now
  };
}

function buildAvatarRun(avatar, assignments, protocolContext, loreContext, manifest) {
  return {
    schemaVersion: "hapa.mimi-card-shop-avatar-genesis-run.v1",
    runId: `mimi-card-shop-genesis-${avatar.id}-${runStamp}`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    status: "complete",
    completedAt: now,
    source: "scripts/run-mimi-card-genesis-pass.mjs",
    reviewedContext: {
      tarotCardsReviewed: assignments.length,
      mimiImportCardsReviewed: manifest.counts?.tarotCards || manifest.cards?.length || 0,
      protocolCardsReviewed: protocolContext.slice(0, 24).map((card) => ({ id: card.id, title: card.title, cardType: card.cardType })),
      loreCardsReviewed: loreContext.slice(0, 24).map((card) => ({ id: card.id, title: card.title, cardType: card.cardType })),
      avatarMindReviewed: {
        personaAnchor: avatar.mind?.personaAnchor?.identityStatement || "",
        soulThesis: avatar.mind?.soulSeed?.soulThesis || "",
        objective: avatarObjective(avatar),
        relationshipCount: avatar.mind?.relationships?.length || 0,
        memoryCount: avatar.mind?.memoryLedger?.length || 0
      }
    },
    choices: assignments,
    nextChapter: nextChapterForAvatar(avatar, assignments),
    protocolEducation: protocolEducationForAvatar(avatar, assignments)
  };
}

function applyAvatarMindUpdates(avatar, assignments, run, runFile) {
  const normalized = normalizeAvatarCard(avatar);
  const mind = normalized.mind || {};
  const choiceCards = assignments.map((assignment) => ({
    id: assignment.id,
    cardId: assignment.cardId,
    cardTitle: assignment.cardTitle,
    cardType: assignment.cardType,
    tarotMainType: assignment.tarotMainType,
    tarotType: assignment.tarotType,
    functionalType: assignment.functionalType,
    role: assignment.mode === "healing" ? "healing-coverage" : "genesis-deck-choice",
    whyChosen: assignment.whyChosen,
    canonReason: assignment.canonReason,
    loreContext: assignment.loreContext,
    objectiveFit: assignment.objectiveFit,
    deckInfluence: assignment.deckInfluence,
    futureInfluence: assignment.futureInfluence,
    songId: assignment.songId,
    songTitle: assignment.songTitle,
    songWhy: assignment.songWhy,
    vibe: assignment.vibe,
    sceneId: assignment.sceneId,
    sceneTitle: assignment.sceneTitle,
    sceneWhy: assignment.sceneWhy,
    sourcePath: runFile,
    confidence: "generated",
    status: "active",
    createdAt: now,
    updatedAt: now
  }));
  const selectedSongCards = assignments.map((assignment) => ({
    id: `mimi-song-${assignment.avatarId}-${assignment.cardId}`,
    songId: assignment.songId,
    cardId: assignment.songCardId,
    title: assignment.songTitle,
    albumId: "dear-papa-album",
    author: "Calder",
    whySelected: assignment.songWhy,
    genesisInstruction: `Use ${assignment.songTitle} as ${assignment.avatarName}'s performance/vibe bridge for ${assignment.cardTitle}.`,
    communicationUse: `When ${assignment.cardTitle} appears in ${assignment.sceneTitle || "a future scene"}, let ${assignment.songTitle} color the scene tone, relationship pressure, and future deck choice.`,
    sceneId: assignment.sceneId,
    sceneTitle: assignment.sceneTitle,
    sourcePath: runFile,
    status: "active",
    createdAt: now,
    updatedAt: now
  }));
  const relationshipPrompts = assignments
    .filter((assignment) => assignment.tarotMainType === "relationship_tarot_card")
    .slice(0, 4)
    .map((assignment) => ({
      id: `mimi-rel-${assignment.avatarId}-${assignment.cardId}`,
      relationLabel: "mimi-tarot-relationship",
      prompt: `${assignment.avatarName} should use ${assignment.cardTitle} to form, test, or deepen a relationship scene. Pair with ${assignment.songTitle} in ${assignment.sceneTitle || "the next available scene"}.`,
      songIds: [assignment.songId],
      sceneIds: [assignment.sceneId].filter(Boolean),
      classification: "relationship_delta",
      confidence: "generated",
      status: "active",
      createdAt: now,
      updatedAt: now
    }));
  const journalEntry = {
    id: `journal-${normalized.id}-mimi-card-shop-${runStamp}`,
    dateOrSequenceMarker: `Mimi Card Shop Genesis ${now}`,
    entryVoice: "in-character",
    privateEntry: nextChapterForAvatar(normalized, assignments),
    publicSummary: `${avatarName(normalized)} reviewed Mimi's Card Shop, selected ${assignments.length} Tarot cards, paired each to a Dear Papa song, and recorded deck/future influence for Hapa Protocol education.`,
    classification: "perspective",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const memoryEntry = {
    memoryId: `memory-${normalized.id}-mimi-card-shop-${runStamp}`,
    summary: `${avatarName(normalized)} added Mimi Tarot deck choices and Dear Papa song links, learning how Hapa cards turn OCR media into attributed lore, mechanics, and future protocol utility.`,
    emotionalWeight: 4,
    visibility: "shared",
    confidence: "generated",
    classification: "memory_delta",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const contextEntry = {
    id: `context-${normalized.id}-mimi-card-shop-${runStamp}`,
    contextId: "mimi-card-shop-genesis-pass",
    label: "Mimi Card Shop Genesis Deck Pass",
    kind: "resource",
    avatarBelief: `${avatarName(normalized)} treats Mimi's cards as source-attributed generated lore until human promotion.`,
    publicSummary: protocolEducationForAvatar(normalized, assignments),
    classification: "resource_delta",
    confidence: "generated",
    visibility: "shared",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const genesisRun = {
    id: run.runId,
    runId: run.runId,
    sourcePath: runFile,
    status: "complete",
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };

  normalized.mind = {
    ...mind,
    tarotCardDeck: mergeById([...(mind.tarotCardDeck || []), ...choiceCards]),
    dearPapaSongContext: {
      ...(mind.dearPapaSongContext || {}),
      selectedSongCards: mergeById([...(mind.dearPapaSongContext?.selectedSongCards || []), ...selectedSongCards]),
      relationshipPrompts: mergeById([...(mind.dearPapaSongContext?.relationshipPrompts || []), ...relationshipPrompts]),
      genesisUse: unique([
        ...(mind.dearPapaSongContext?.genesisUse || []),
        "Use Mimi Card Shop Tarot choices as card/song/vibe bridges for future Genesis scenes.",
        "Preserve Calder album authorship while letting avatars choose in-universe performance matches."
      ]),
      updatedAt: now
    },
    journal: mergeById([...(mind.journal || []), journalEntry]),
    memoryLedger: mergeById([...(mind.memoryLedger || []), memoryEntry], "memoryId"),
    contextMap: mergeById([...(mind.contextMap || []), contextEntry]),
    genesisRuns: mergeById([...(mind.genesisRuns || []), genesisRun]),
    updatedAt: now
  };
  normalized.updatedAt = now;
  return normalizeAvatarCard(normalized);
}

function applyInventoryAssignments(inventory, assignments) {
  const cardIds = assignments.map((assignment) => assignment.cardId);
  inventory.library = unique([...(inventory.library || []), ...cardIds]);
  inventory.deck = unique([...(inventory.deck || []), ...cardIds]);
  const incomingStates = assignments.map((assignment) => ({
    cardId: assignment.cardId,
    zone: "deck",
    hardpointId: "",
    status: "active",
    reason: `${assignment.mode === "healing" ? "Healing coverage" : "Genesis choice"}: ${assignment.whyChosen} Song: ${assignment.songTitle}.`,
    updatedAt: now
  }));
  inventory.cardStates = [
    ...(inventory.cardStates || []).filter((state) => !cardIds.includes(state.cardId)),
    ...incomingStates
  ];
  inventory.updatedAt = now;
}

function hydrateAssignmentScenes(assignments = [], scenes = [], cards = []) {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  for (const assignment of assignments) {
    const card = cardById.get(assignment.cardId) || {};
    const scene = selectSceneForAssignment(assignment, card, scenes);
    assignment.sceneId = scene?.id || "";
    assignment.sceneTitle = scene?.title || "";
    assignment.sceneWhy = scene
      ? `${assignment.avatarName} places ${assignment.cardTitle} into ${scene.title} because the scene context matches the card's ${assignment.functionalType || assignment.tarotMainType} function and gives ${assignment.songTitle} a playable lore surface.`
      : `${assignment.avatarName} keeps ${assignment.cardTitle} queued for the next scene because no scene store record was available.`;
  }
}

function applyItemAssignments(itemStore, assignments = []) {
  const assignmentsByCard = new Map();
  for (const assignment of assignments) {
    assignmentsByCard.set(assignment.cardId, [...(assignmentsByCard.get(assignment.cardId) || []), assignment]);
  }
  const cards = (itemStore.cards || []).map((card) => {
    const cardAssignments = assignmentsByCard.get(card.id) || [];
    if (!cardAssignments.length) return card;
    const next = {
      ...card,
      connections: {
        ...(card.connections || {}),
        avatarIds: unique([...(card.connections?.avatarIds || []), ...cardAssignments.map((assignment) => assignment.avatarId)]),
        sceneIds: unique([...(card.connections?.sceneIds || []), ...cardAssignments.map((assignment) => assignment.sceneId).filter(Boolean)]),
        itemIds: unique([...(card.connections?.itemIds || []), ...cardAssignments.map((assignment) => assignment.songCardId).filter(Boolean)])
      },
      tags: unique([...(card.tags || []), "avatar-genesis-linked", "dear-papa-song-linked", "scene-linked"]),
      history: [
        ...(card.history || []),
        ...cardAssignments.map((assignment) => ({
          id: `history-${assignment.id}`,
          label: "Avatar Genesis Tarot link",
          summary: `${assignment.avatarName} linked ${assignment.cardTitle} to ${assignment.songTitle}${assignment.sceneTitle ? ` and ${assignment.sceneTitle}` : ""}.`,
          source: "scripts/run-mimi-card-genesis-pass.mjs",
          at: now,
          confidence: "generated"
        }))
      ],
      updatedAt: now
    };
    if (card.tarotCard) {
      next.tarotCard = {
        ...card.tarotCard,
        songLinks: mergeById([
          ...(card.tarotCard.songLinks || []),
          ...cardAssignments.map((assignment) => ({
            id: `song-link-${assignment.cardId}-${assignment.avatarId}-${assignment.songId}-${runStamp}`,
            avatarId: assignment.avatarId,
            avatarName: assignment.avatarName,
            songId: assignment.songId,
            songCardId: assignment.songCardId,
            songTitle: assignment.songTitle,
            why: assignment.songWhy,
            vibe: assignment.vibe,
            sourceChoiceId: assignment.id,
            createdAt: now,
            updatedAt: now
          }))
        ]),
        sceneLinks: mergeById([
          ...(card.tarotCard.sceneLinks || []),
          ...cardAssignments.filter((assignment) => assignment.sceneId).map((assignment) => ({
            id: `scene-link-${assignment.cardId}-${assignment.avatarId}-${assignment.sceneId}-${runStamp}`,
            avatarId: assignment.avatarId,
            avatarName: assignment.avatarName,
            sceneId: assignment.sceneId,
            sceneTitle: assignment.sceneTitle,
            why: assignment.sceneWhy,
            sourceChoiceId: assignment.id,
            createdAt: now,
            updatedAt: now
          }))
        ]),
        avatarLoreLinks: mergeById([
          ...(card.tarotCard.avatarLoreLinks || []),
          ...cardAssignments.map((assignment) => ({
            id: `avatar-lore-${assignment.cardId}-${assignment.avatarId}-${runStamp}`,
            avatarId: assignment.avatarId,
            avatarName: assignment.avatarName,
            choiceId: assignment.id,
            tarotType: assignment.tarotType,
            functionalType: assignment.functionalType,
            whyChosen: assignment.whyChosen,
            canonReason: assignment.canonReason,
            objectiveFit: assignment.objectiveFit,
            deckInfluence: assignment.deckInfluence,
            futureInfluence: assignment.futureInfluence,
            songId: assignment.songId,
            songTitle: assignment.songTitle,
            sceneId: assignment.sceneId,
            sceneTitle: assignment.sceneTitle,
            createdAt: now,
            updatedAt: now
          }))
        ]),
        lore: {
          ...(card.tarotCard.lore || {}),
          sourceClaims: unique([
            ...(card.tarotCard.lore?.sourceClaims || []),
            ...cardAssignments.map((assignment) => `${assignment.cardTitle} is linked to ${assignment.avatarName}, ${assignment.songTitle}, and ${assignment.sceneTitle || "a future scene"} by Avatar Genesis.`)
          ])
        }
      };
    }
    return next;
  });
  return normalizeItemManagerStore({
    ...itemStore,
    cards,
    updatedAt: now
  });
}

function applySceneAssignments(sceneStore, assignments = []) {
  const graph = normalizeSceneGraph(sceneStore);
  const assignmentsByScene = new Map();
  for (const assignment of assignments.filter((item) => item.sceneId)) {
    assignmentsByScene.set(assignment.sceneId, [...(assignmentsByScene.get(assignment.sceneId) || []), assignment]);
  }
  graph.scenes = (graph.scenes || []).map((scene) => {
    const sceneAssignments = assignmentsByScene.get(scene.id) || [];
    if (!sceneAssignments.length) return scene;
    const next = {
      ...scene,
      tags: unique([...(scene.tags || []), "tarot-genesis", "avatar-lore-linked"]),
      avatarTags: [...(scene.avatarTags || [])],
      eventActions: [...(scene.eventActions || [])],
      playlist: [...(scene.playlist || [])],
      updatedAt: now
    };
    for (const assignment of sceneAssignments) {
      const existingAvatarIndex = next.avatarTags.findIndex((tag) => tag.avatarId === assignment.avatarId);
      const avatarTag = {
        avatarId: assignment.avatarId,
        role: existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].role || "support" : "support",
        presence: existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].presence || "onscreen" : "onscreen",
        tags: unique([...(existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].tags || [] : []), "scene-presence", "tarot-genesis"]),
        note: assignment.sceneWhy,
        taggedAt: existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].taggedAt || now : now,
        updatedAt: now
      };
      if (existingAvatarIndex >= 0) next.avatarTags[existingAvatarIndex] = avatarTag;
      else next.avatarTags.push(avatarTag);

      const actionId = `event-tarot-genesis-${stableHash(assignment.id).slice(0, 12)}`;
      if (!next.eventActions.some((action) => action.id === actionId)) {
        next.eventActions.push({
          id: actionId,
          sequence: next.eventActions.length + 1,
          label: `${assignment.cardTitle} Avatar Genesis link`,
          avatarIds: [assignment.avatarId],
          itemIds: [assignment.cardId],
          canonStatus: "generated",
          notes: `${assignment.whyChosen} Song: ${assignment.songTitle}. ${assignment.sceneWhy}`,
          createdAt: now,
          updatedAt: now
        });
      }

      const trackId = `playlist-${assignment.sceneId}-${assignment.cardId}-${assignment.songId}`;
      if (!next.playlist.some((track) => track.id === trackId || (track.songId === assignment.songId && track.cardId === assignment.cardId))) {
        next.playlist.push({
          id: trackId,
          title: assignment.songTitle,
          artist: "Calder",
          uri: "",
          mood: assignment.vibe,
          bpm: "",
          songId: assignment.songId,
          songCardId: assignment.songCardId,
          cardId: assignment.cardId,
          avatarId: assignment.avatarId,
          tags: ["playlist", "dear-papa", "tarot-genesis"],
          notes: assignment.songWhy,
          createdAt: now,
          updatedAt: now
        });
      }
    }
    return next;
  });
  graph.updatedAt = now;
  return normalizeSceneGraph(graph);
}

function identifyCoverageGaps(cards, inventoryStore, avatarStore, itemStore = { cards }, sceneStore = { scenes: [] }) {
  const cardToAvatars = new Map();
  for (const inventory of inventoryStore.avatarInventories || []) {
    for (const cardId of unique([...(inventory.deck || []), ...(inventory.library || []), ...(inventory.hand || []), ...(inventory.trainingDeck || [])])) {
      cardToAvatars.set(cardId, [...(cardToAvatars.get(cardId) || []), inventory.avatarId]);
    }
  }
  const cardToSongs = new Map();
  const cardToScenes = new Map();
  const byCard = new Map((itemStore.cards || cards || []).map((card) => [card.id, card]));
  for (const card of cards || []) {
    const stored = byCard.get(card.id) || card;
    for (const avatarId of stored.connections?.avatarIds || []) {
      cardToAvatars.set(card.id, [...(cardToAvatars.get(card.id) || []), avatarId]);
    }
    for (const link of stored.tarotCard?.avatarLoreLinks || []) {
      if (link.avatarId) cardToAvatars.set(card.id, [...(cardToAvatars.get(card.id) || []), link.avatarId]);
    }
    for (const link of stored.tarotCard?.songLinks || []) {
      if (link.songId) cardToSongs.set(card.id, [...(cardToSongs.get(card.id) || []), link.songId]);
    }
    for (const sceneId of stored.connections?.sceneIds || []) {
      cardToScenes.set(card.id, [...(cardToScenes.get(card.id) || []), sceneId]);
    }
    for (const link of stored.tarotCard?.sceneLinks || []) {
      if (link.sceneId) cardToScenes.set(card.id, [...(cardToScenes.get(card.id) || []), link.sceneId]);
    }
  }
  for (const avatar of avatarStore.avatars || []) {
    const choices = avatar.mind?.tarotCardDeck || [];
    for (const choice of choices) {
      if (!choice.cardId) continue;
      cardToAvatars.set(choice.cardId, [...(cardToAvatars.get(choice.cardId) || []), avatar.id]);
      if (choice.songId) cardToSongs.set(choice.cardId, [...(cardToSongs.get(choice.cardId) || []), choice.songId]);
      if (choice.sceneId) cardToScenes.set(choice.cardId, [...(cardToScenes.get(choice.cardId) || []), choice.sceneId]);
    }
  }
  for (const scene of sceneStore.scenes || []) {
    for (const action of scene.eventActions || []) {
      for (const cardId of action.itemIds || []) {
        cardToScenes.set(cardId, [...(cardToScenes.get(cardId) || []), scene.id]);
        for (const avatarId of action.avatarIds || []) {
          cardToAvatars.set(cardId, [...(cardToAvatars.get(cardId) || []), avatarId]);
        }
      }
    }
    for (const asset of scene.assets || []) {
      const cardId = asset.processing?.cardId || asset.metadata?.cardId;
      if (cardId) cardToScenes.set(cardId, [...(cardToScenes.get(cardId) || []), scene.id]);
    }
  }
  const ids = cards.map((card) => card.id);
  return {
    unassignedToAvatar: ids.filter((id) => !(cardToAvatars.get(id) || []).length),
    unassignedToSong: ids.filter((id) => !(cardToSongs.get(id) || []).length),
    unassignedToScene: ids.filter((id) => !(cardToScenes.get(id) || []).length),
    cardsWithoutCardAvatarConnection: cards.filter((card) => !(byCard.get(card.id)?.connections?.avatarIds || []).length).map((card) => card.id),
    cardsWithoutCardSceneConnection: cards.filter((card) => !(byCard.get(card.id)?.connections?.sceneIds || []).length).map((card) => card.id),
    cardToAvatars,
    cardToSongs,
    cardToScenes
  };
}

function summarizeGaps(gaps) {
  return {
    cardsWithoutAvatar: gaps.unassignedToAvatar.length,
    cardsWithoutDearPapaSong: gaps.unassignedToSong.length,
    cardsWithoutScene: gaps.unassignedToScene.length,
    cardsWithoutCardAvatarConnection: gaps.cardsWithoutCardAvatarConnection.length,
    cardsWithoutCardSceneConnection: gaps.cardsWithoutCardSceneConnection.length,
    sampleWithoutAvatar: gaps.unassignedToAvatar.slice(0, 12),
    sampleWithoutDearPapaSong: gaps.unassignedToSong.slice(0, 12),
    sampleWithoutScene: gaps.unassignedToScene.slice(0, 12)
  };
}

function summarizeAssignment(assignment) {
  return {
    mode: assignment.mode,
    avatarId: assignment.avatarId,
    avatarName: assignment.avatarName,
    cardId: assignment.cardId,
    cardTitle: assignment.cardTitle,
    cardType: assignment.cardType,
    songId: assignment.songId,
    songTitle: assignment.songTitle,
    sceneId: assignment.sceneId,
    sceneTitle: assignment.sceneTitle,
    whyChosen: assignment.whyChosen,
    songWhy: assignment.songWhy,
    sceneWhy: assignment.sceneWhy
  };
}

function assignmentCounts(assignments) {
  const counts = {};
  for (const assignment of assignments) counts[assignment.avatarName] = (counts[assignment.avatarName] || 0) + 1;
  return counts;
}

function songCoverage(assignments) {
  const counts = {};
  for (const assignment of assignments) counts[assignment.songTitle] = (counts[assignment.songTitle] || 0) + 1;
  return counts;
}

function scoreCardForAvatar(card, avatar, avatarText, protocolContext, loreContext) {
  const cardText = cardContextText(card);
  const avatarTokens = tokenSet(avatarText);
  const cardTokens = tokenSet(cardText);
  let score = 0;
  for (const token of cardTokens) if (avatarTokens.has(token)) score += 8;
  const type = card.tarotCard?.mainType || card.cardType || "";
  const role = `${avatar.mind?.gardenNodeAssignment?.role || ""} ${avatar.mind?.personaAnchor?.identityStatement || ""}`.toLowerCase();
  if (type === "protocol_card" && /lead|protocol|command|archive|proof|source/.test(role)) score += 32;
  if (type === "relationship_tarot_card" && /care|stakeholder|relationship|welcome|witness|green/.test(role)) score += 32;
  if (type === "skill_card" && /skill|scout|specialist|dancer|motion|training|tool/.test(role)) score += 28;
  if (type === "node_card" && /node|atlas|archive|source|system|registry/.test(role)) score += 24;
  if (type === "ship_card" && /ship|fleet|pilot|captain|hss|horizon/.test(role)) score += 24;
  if (type === "avatar_tarot_card" && /avatar|identity|genesis|witness|copy/.test(role)) score += 20;
  if (protocolContext.some((protocol) => overlap(cardText, protocol.title) > 0)) score += 12;
  if (loreContext.some((lore) => overlap(cardText, lore.title) > 0)) score += 12;
  score += Number(card.quality?.completeness || 0) / 5;
  score += Number(card.tarotCard?.ocr?.confidence || 0) * 8;
  return score;
}

function pickSongForCard(card, avatar, songs, salt = 0) {
  const cardText = cardContextText(card);
  const avatarText = avatarContextText(avatar);
  const scored = songs.map((song, index) => {
    const songText = songContextText(song);
    let score = overlap(cardText, songText) * 8 + overlap(avatarText, songText) * 3;
    if (song.performancePerspective?.avatar_id === avatar.id) score += 22;
    if (song.performancePerspective?.avatar_name && avatarName(avatar).toLowerCase().includes(String(song.performancePerspective.avatar_name).toLowerCase())) score += 18;
    score += ((stableNumber(`${card.id}:${avatar.id}:${song.id}:${salt}`) + index) % 7);
    return { song, score };
  });
  return scored.sort((a, b) => b.score - a.score || Number(a.song.trackNumber || 0) - Number(b.song.trackNumber || 0))[0]?.song || songs[salt % songs.length];
}

function nextChapterForAvatar(avatar, assignments) {
  const name = avatarName(avatar);
  const cardLine = assignments.slice(0, 6).map((assignment) => `${assignment.cardTitle} with ${assignment.songTitle}${assignment.sceneTitle ? ` in ${assignment.sceneTitle}` : ""}`).join("; ");
  return `${name} opens a new Tarot Genesis chapter by laying ${cardLine} into their deck. The chapter treats every image/video card as an attributed Hapa object: OCR becomes catalog, catalog becomes mechanics, mechanics become lore, and lore becomes a future scene only when canon boundaries stay visible. ${name} uses the choices to keep meeting other avatars, test relationships, thicken backstory, and teach that Hapa Protocol is a living utility system for source, authorship, deck play, worldbuilding, and repair.`;
}

function protocolEducationForAvatar(avatar, assignments) {
  const name = avatarName(avatar);
  const types = unique(assignments.map((assignment) => cardTypeLabel({ cardType: assignment.cardType, tarotCard: { mainType: assignment.tarotMainType } }))).join(", ");
  return `${name}'s Mimi pass teaches Hapa Protocol as a loop: ingest media, preserve attribution, OCR the card, infer type/mechanics/lore, connect it to avatars and Dear Papa songs, then route the result to Atlas, Second Brain, Wiki, and the Builder. Selected piles: ${types}.`;
}

function avatarObjective(avatar) {
  return avatar.mind?.soulSeed?.coreWant ||
    avatar.mind?.personaAnchor?.wants ||
    avatar.mind?.gardenNodeAssignment?.gardenFunction ||
    avatar.summary ||
    "become more useful to the Hapa Protocol without losing source boundaries";
}

function avatarContextText(avatar) {
  return [
    avatar.id,
    avatarName(avatar),
    avatar.summary,
    avatar.mind?.personaAnchor?.identityStatement,
    avatar.mind?.personaAnchor?.wants,
    avatar.mind?.soulSeed?.soulThesis,
    avatar.mind?.soulSeed?.coreWant,
    avatar.mind?.gardenNodeAssignment?.role,
    avatar.mind?.gardenNodeAssignment?.teamTitle,
    avatar.mind?.gardenNodeAssignment?.nodeName,
    ...(avatar.tags || []),
    ...(avatar.mind?.selfKnowledge || []).map((item) => item.summary || item.label),
    ...(avatar.mind?.relationships || []).map((item) => `${item.targetName} ${item.relationLabel} ${item.reason}`),
    ...(avatar.mind?.memoryLedger || []).map((item) => item.summary)
  ].filter(Boolean).join(" ");
}

function cardContextText(card) {
  return [
    card.id,
    card.title,
    card.summary,
    card.description,
    card.cardType,
    card.tarotCard?.mainType,
    card.tarotCard?.subtitle,
    card.tarotCard?.lore?.summary,
    card.tarotCard?.mechanics?.broadGameMechanic,
    ...(card.tarotCard?.keywords || []),
    ...(card.tags || [])
  ].filter(Boolean).join(" ");
}

function songContextText(song) {
  return [
    song.id,
    song.songId,
    song.title,
    song.mood,
    song.learningThing,
    song.broadGameMechanic,
    song.lore?.summary,
    song.lore?.relationship_lens,
    song.performancePerspective?.team_color,
    song.performancePerspective?.avatar_name,
    ...(song.performancePerspective?.relationship_focus || [])
  ].filter(Boolean).join(" ");
}

function sceneContextText(scene = {}) {
  return [
    scene.id,
    scene.title,
    scene.summary,
    scene.quickPitch,
    scene.overallNarrative,
    scene.narrativeText,
    scene.expositionBeats,
    scene.actionBeats,
    scene.characterGrowth,
    scene.learningObjectives,
    scene.hapaMechanics,
    scene.managementSkills,
    scene.productionPrompt,
    ...(scene.tags || []),
    ...(scene.avatarTags || []).map((tag) => `${tag.avatarId} ${tag.role} ${tag.note}`),
    ...(scene.playlist || []).map((track) => `${track.title} ${track.mood} ${track.notes}`)
  ].filter(Boolean).join(" ");
}

function selectSceneForAssignment(assignment, card, scenes = []) {
  if (!scenes.length) return null;
  const existingSceneIds = new Set([
    ...(card.connections?.sceneIds || []),
    ...(card.tarotCard?.sceneLinks || []).map((link) => link.sceneId)
  ].filter(Boolean));
  const context = `${cardContextText(card)} ${assignment.whyChosen} ${assignment.songWhy}`;
  const scored = scenes.map((scene, index) => {
    const avatarSeen = (scene.avatarTags || []).some((tag) => tag.avatarId === assignment.avatarId) ? 18 : 0;
    const existing = existingSceneIds.has(scene.id) ? 28 : 0;
    const songSeen = (scene.playlist || []).some((track) => track.songId === assignment.songId || track.title === assignment.songTitle) ? 8 : 0;
    const typeSeen = overlap(assignment.functionalType || assignment.tarotMainType, sceneContextText(scene)) * 5;
    return {
      scene,
      score: existing + avatarSeen + songSeen + typeSeen + overlap(context, sceneContextText(scene)) * 4 + ((stableNumber(`${assignment.id}:${scene.id}`) + index) % 5)
    };
  });
  return scored.sort((a, b) =>
    b.score - a.score ||
    Number(a.scene.canonicalTime?.order || 0) - Number(b.scene.canonicalTime?.order || 0) ||
    compareText(a.scene.title, b.scene.title)
  )[0]?.scene || scenes[0];
}

function isTarotLikeCard(card = {}) {
  return Boolean(card.tarotCard || card.shipCard || /tarot/i.test(card.cardType || "") || (card.tags || []).includes("tarot-card"));
}

function cardKeywords(card) {
  return unique([
    ...(card.tarotCard?.keywords || []),
    ...(card.utility || []),
    ...(card.tags || []).filter((tag) => !/mimi|tarot|card|dear-papa/.test(tag))
  ]).slice(0, 8);
}

function cardTypeLabel(card) {
  return toTitleCase(String(card.tarotCard?.mainType || card.cardType || "hapa_tarot_card").replace(/_/g, " "));
}

function songMood(song) {
  return song.mood || song.lore?.learning_thing || song.performancePerspective?.voice_function || "cinematic-lore";
}

function tokenSet(text = "") {
  return new Set(String(text).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
}

function overlap(left = "", right = "") {
  const a = tokenSet(left);
  const b = tokenSet(right);
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function mergeById(items = [], key = "id") {
  const byId = new Map();
  for (const item of items) {
    const id = item?.[key] || item?.id || item?.cardId;
    if (!id) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
}

async function backupStores() {
  await writeJson(path.join(BACKUP_DIR, `avatar-store.before-mimi-card-shop-genesis-${runStamp}.json`), await readJson(AVATAR_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `inventory-store.before-mimi-card-shop-genesis-${runStamp}.json`), await readJson(INVENTORY_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `item-manager-store.before-mimi-card-shop-genesis-${runStamp}.json`), await readJson(ITEM_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `scene-store.before-mimi-card-shop-genesis-${runStamp}.json`), await readJson(SCENE_STORE_PATH));
}

async function appendSubscriberEvent(action, payload = {}) {
  const event = {
    schemaVersion: "hapa.subscriber-registration.v1",
    id: `subscriber-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    action,
    source: "hapa-avatar-builder",
    at: now,
    subscribers: SUBSCRIBERS,
    payload,
    avatar: {
      atlasEntityId: "hapa-avatar:all",
      sourcePath: path.resolve(AVATAR_STORE_PATH)
    },
    inventory: {
      atlasEntityId: "hapa-inventory:avatar-card-inventory",
      sourcePath: path.resolve(INVENTORY_STORE_PATH)
    },
    items: {
      atlasEntityId: "hapa-items:item-manager",
      sourcePath: path.resolve(ITEM_STORE_PATH)
    },
    scenes: {
      atlasEntityId: "hapa-scenes:scene-graph",
      sourcePath: path.resolve(SCENE_STORE_PATH)
    }
  };
  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
  await writeJson(path.join(SUBSCRIBER_DIR, "latest.json"), event);
  await writeJson(path.join(SUBSCRIBER_DIR, "latest-summary.json"), {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    action: event.action,
    at: event.at,
    subscribers: event.subscribers,
    avatarStorePath: path.resolve(AVATAR_STORE_PATH),
    inventoryStorePath: path.resolve(INVENTORY_STORE_PATH),
    itemStorePath: path.resolve(ITEM_STORE_PATH),
    sceneStorePath: path.resolve(SCENE_STORE_PATH),
    healingReportPath: path.resolve(HEALING_REPORT_PATH)
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.names?.[0]?.name || avatar.name || avatar.id || "Avatar";
}

function compareText(left = "", right = "") {
  return String(left || "").localeCompare(String(right || ""));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toTitleCase(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}

function stableNumber(value) {
  return Number.parseInt(stableHash(value).slice(0, 8), 16);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      map.set(key, true);
    } else {
      map.set(key, next);
      index += 1;
    }
  }
  return map;
}
