#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";
import { normalizeInventoryStore, normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";

const DATA_DIR = "data";
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const INGEST_DIR = path.join(DATA_DIR, "episodes-ingest");
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const INVENTORY_STORE_PATH = path.join(DATA_DIR, "inventory-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const MANIFEST_PATH = path.join(INGEST_DIR, "manifest.json");
const ASSOCIATION_REPORT_PATH = path.join(INGEST_DIR, "avatar-association-report.json");
const BATCH_REPORT_PATH = path.join(RUN_DIR, `episodes-genesis-batch-${stamp()}.json`);
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const maxCards = Number(args.get("limit") || 0);
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
  const sceneStore = normalizeSceneGraph(await readJson(SCENE_STORE_PATH));
  const songbook = await readJson(SONGBOOK_PATH);
  const manifest = await readJson(MANIFEST_PATH).catch(() => ({ cards: [] }));
  const avatars = (avatarStore.avatars || [])
    .filter((avatar) => avatar?.id)
    .map((avatar) => normalizeAvatarCard(avatar))
    .sort((a, b) => avatarName(a).localeCompare(avatarName(b)) || a.id.localeCompare(b.id));
  const inventoryStore = normalizeInventoryStore(
    await readJson(INVENTORY_STORE_PATH),
    avatars,
    itemStore.cards
  );
  const episodeCards = itemStore.cards
    .filter(isEpisodeCard)
    .sort((a, b) => compareText(a.title, b.title) || a.id.localeCompare(b.id))
    .slice(0, maxCards > 0 ? maxCards : undefined);
  const songs = (songbook.songCards || []).slice().sort((a, b) => Number(a.trackNumber || 0) - Number(b.trackNumber || 0));
  const scenes = sceneStore.scenes || [];
  const protocolContext = itemStore.cards.filter((card) => card.cardType === "protocol_card" || card.kind === "protocol");
  const loreContext = itemStore.cards.filter((card) =>
    card.cardType === "lore_tarot_card" ||
    card.episodeCard ||
    /lore|canon|memory|world|episode/i.test(`${card.title} ${(card.tags || []).join(" ")}`)
  );

  if (!avatars.length) throw new Error("No avatars found.");
  if (!episodeCards.length) throw new Error("No Episodes cards found. Run npm run episodes:ingest first.");
  if (!songs.length) throw new Error("No Dear Papa song cards found.");

  const assignments = chooseAssignments({ avatars, cards: episodeCards, songs, scenes, protocolContext, loreContext });
  const updates = await applyAssignments({
    avatarStore,
    inventoryStore,
    itemStore,
    sceneStore,
    avatars,
    assignments,
    protocolContext,
    loreContext,
    manifest
  });
  const report = {
    schemaVersion: "hapa.episodes-genesis-association-report.v1",
    generatedAt: now,
    dryRun,
    source: "scripts/run-episodes-genesis-pass.mjs",
    reviewedContext: {
      episodeCardCount: episodeCards.length,
      manifestCards: manifest.cards?.length || 0,
      avatarCount: avatars.length,
      songCount: songs.length,
      sceneCount: scenes.length,
      protocolCardCount: protocolContext.length,
      loreContextCardCount: loreContext.length
    },
    assignments: assignments.map(summarizeAssignment),
    cardsPerAvatar: assignmentCounts(assignments),
    songCoverage: songCoverage(assignments),
    sceneCoverage: sceneCoverage(assignments),
    drained: assignments.length === episodeCards.length &&
      assignments.every((assignment) => assignment.avatarId && assignment.songId && assignment.sceneId)
  };
  const batchReport = {
    schemaVersion: "hapa.episodes-genesis-batch.v1",
    generatedAt: now,
    dryRun,
    source: "scripts/run-episodes-genesis-pass.mjs",
    associationReportPath: ASSOCIATION_REPORT_PATH,
    avatarRuns: updates.runReceipts,
    assignments: assignments.length,
    drained: report.drained
  };

  if (!dryRun) {
    await backupStores();
    await writeJson(AVATAR_STORE_PATH, updates.avatarStore);
    await writeJson(INVENTORY_STORE_PATH, updates.inventoryStore);
    await writeJson(ITEM_STORE_PATH, updates.itemStore);
    await writeJson(SCENE_STORE_PATH, updates.sceneStore);
    await writeJson(ASSOCIATION_REPORT_PATH, report);
    await writeJson(BATCH_REPORT_PATH, batchReport);
    await appendSubscriberEvent("avatar.episodes-genesis-updated", {
      avatarStorePath: path.resolve(AVATAR_STORE_PATH),
      inventoryStorePath: path.resolve(INVENTORY_STORE_PATH),
      itemStorePath: path.resolve(ITEM_STORE_PATH),
      sceneStorePath: path.resolve(SCENE_STORE_PATH),
      batchReportPath: path.resolve(BATCH_REPORT_PATH),
      associationReportPath: path.resolve(ASSOCIATION_REPORT_PATH),
      assignments: assignments.length,
      drained: report.drained
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    episodeCards: episodeCards.length,
    assignments: assignments.length,
    avatarCount: avatars.length,
    songsLinked: Object.keys(report.songCoverage).length,
    scenesLinked: Object.keys(report.sceneCoverage).length,
    drained: report.drained,
    associationReportPath: ASSOCIATION_REPORT_PATH,
    batchReportPath: BATCH_REPORT_PATH
  }, null, 2));
}

function chooseAssignments({ avatars, cards, songs, scenes, protocolContext, loreContext }) {
  const countsByAvatar = new Map();
  return cards.map((card, index) => {
    const avatar = pickAvatarForCard(card, avatars, countsByAvatar, protocolContext, loreContext);
    countsByAvatar.set(avatar.id, (countsByAvatar.get(avatar.id) || 0) + 1);
    const song = pickSongForCard(card, avatar, songs, index);
    const scene = pickSceneForCard(card, avatar, song, scenes, index);
    return buildAssignment({ avatar, card, song, scene, reasonRank: index + 1 });
  });
}

function pickAvatarForCard(card, avatars, countsByAvatar, protocolContext, loreContext) {
  const cardText = cardContextText(card);
  const scored = avatars.map((avatar, index) => {
    const avatarText = avatarContextText(avatar);
    let score = overlap(cardText, avatarText) * 10;
    const type = card.tarotCard?.mainType || card.cardType || "";
    const role = `${avatar.mind?.gardenNodeAssignment?.role || ""} ${avatar.mind?.personaAnchor?.identityStatement || ""}`.toLowerCase();
    if (type === "protocol_card" && /lead|protocol|source|proof|archive|red|blue/.test(role)) score += 36;
    if (type === "relationship_tarot_card" && /care|relationship|welcome|consul|green|bella|witness/.test(role)) score += 36;
    if (type === "skill_card" && /skill|specialist|dancer|motion|training|tool|craft/.test(role)) score += 30;
    if (type === "lore_tarot_card" && /archive|lore|memory|story|source|blue|leo/.test(role)) score += 28;
    if (card.episodeCard?.characters?.some((name) => avatarName(avatar).toLowerCase().includes(String(name).toLowerCase()))) score += 46;
    if (protocolContext.some((protocol) => overlap(cardText, protocol.title) > 0)) score += 10;
    if (loreContext.some((lore) => lore.id !== card.id && overlap(cardText, lore.title) > 0)) score += 10;
    score += Number(card.tarotCard?.ocr?.confidence || 0) * 8;
    score -= (countsByAvatar.get(avatar.id) || 0) * 8;
    score += (stableNumber(`${card.id}:${avatar.id}`) + index) % 7;
    return { avatar, score };
  });
  return scored.sort((a, b) => b.score - a.score || avatarName(a.avatar).localeCompare(avatarName(b.avatar)))[0].avatar;
}

function pickSongForCard(card, avatar, songs, salt = 0) {
  const cardText = cardContextText(card);
  const avatarText = avatarContextText(avatar);
  const scored = songs.map((song, index) => {
    const songText = songContextText(song);
    let score = overlap(cardText, songText) * 9 + overlap(avatarText, songText) * 4;
    if (song.performancePerspective?.avatar_id === avatar.id) score += 24;
    if (song.performancePerspective?.avatar_name && avatarName(avatar).toLowerCase().includes(String(song.performancePerspective.avatar_name).toLowerCase())) score += 18;
    if (/bella/i.test(cardText) && /bella/i.test(songText)) score += 30;
    if (/guild|family|lost sheep/i.test(cardText) && /relationship|home|return|meet|stay/i.test(songText)) score += 12;
    score += ((stableNumber(`${card.id}:${avatar.id}:${song.id}:${salt}`) + index) % 9);
    return { song, score };
  });
  return scored.sort((a, b) => b.score - a.score || Number(a.song.trackNumber || 0) - Number(b.song.trackNumber || 0))[0]?.song || songs[salt % songs.length];
}

function pickSceneForCard(card, avatar, song, scenes, salt = 0) {
  if (!scenes.length) return null;
  const context = `${cardContextText(card)} ${avatarContextText(avatar)} ${songContextText(song)}`;
  const scored = scenes.map((scene, index) => {
    let score = overlap(context, sceneContextText(scene)) * 5;
    if ((scene.avatarTags || []).some((tag) => tag.avatarId === avatar.id)) score += 18;
    if ((scene.playlist || []).some((track) => track.songId === (song.songId || song.id) || track.title === song.title)) score += 10;
    if (scene.episodeId && (card.connections?.episodeIds || []).includes(scene.episodeId)) score += 24;
    score += ((stableNumber(`${card.id}:${avatar.id}:${scene.id}:${salt}`) + index) % 5);
    return { scene, score };
  });
  return scored.sort((a, b) =>
    b.score - a.score ||
    Number(a.scene.canonicalTime?.order || 0) - Number(b.scene.canonicalTime?.order || 0) ||
    compareText(a.scene.title, b.scene.title)
  )[0]?.scene || scenes[0];
}

function buildAssignment({ avatar, card, song, scene, reasonRank }) {
  const title = card.title || card.id;
  const name = avatarName(avatar);
  const typeLabel = cardTypeLabel(card);
  const tarotType = card.tarotCard?.identity?.tarotType || card.tarotCard?.identity?.tarotCardName || card.tarotCard?.title || title;
  const functionalType = card.tarotCard?.identity?.functionalType || card.tarotCard?.typeDetails?.functionalType || typeLabel.replace(/\s+Card$/i, "");
  const keywords = cardKeywords(card);
  const songTitle = song.title || song.id;
  const sceneTitle = scene?.title || "";
  const episodeClass = card.episodeCard?.classification || "episode";
  return {
    id: `episodes-choice-${avatar.id}-${card.id}-${runStamp}`,
    schemaVersion: "hapa.episodes-avatar-choice.v1",
    mode: "episodes-coverage",
    avatarId: avatar.id,
    avatarName: name,
    cardId: card.id,
    cardTitle: title,
    cardType: card.cardType,
    tarotMainType: card.tarotCard?.mainType || card.cardType,
    tarotType,
    functionalType,
    episodeId: card.episodeCard?.episodeId || card.connections?.episodeIds?.[0] || "",
    episodeTitle: card.episodeCard?.episodeTitle || title,
    episodeClassification: episodeClass,
    comicBeats: card.episodeCard?.beats || [],
    songId: song.songId || song.id,
    songCardId: song.id,
    songTitle,
    sceneId: scene?.id || "",
    sceneTitle,
    reasonRank,
    whyChosen: `${name} chooses ${title} because its ${episodeClass} signal gives them ${keywords.join(", ") || "a playable Episodes cue"} in relation to their canon objective: ${avatarObjective(avatar)}.`,
    canonReason: `${title} remains generated/soft canon, but ${name} can safely use it because the Episodes source paths, OCR, media links, and card-type inference are preserved for review.`,
    comicReason: `${name} treats the comic/media layer as story evidence: ${episodeBeat(card)}`,
    objectiveFit: `${title} lets ${name} turn ${keywords[0] || functionalType} into an action, relationship, or teaching scene instead of letting the media sit unattached.`,
    deckInfluence: `${title} changes ${name}'s deck by adding an Episodes ${typeLabel} that can be drawn on the Tarot Table with its motion media and source context.`,
    futureInfluence: `${title} should affect ${name}'s next chapter when ${keywords.slice(0, 3).join(", ") || "episode continuity"} needs to become plot, memory, or Hapa utility.`,
    songWhy: `${name} pairs ${title} with ${songTitle} because the song's ${songMood(song)} vibe carries the card's ${keywords.slice(0, 3).join(", ") || typeLabel.toLowerCase()} into performance, memory, and scene pacing.`,
    sceneWhy: scene
      ? `${name} places ${title} into ${sceneTitle} because the scene can host the card's ${functionalType} signal, the comic/media beat, and the ${songTitle} music bridge.`
      : `${name} keeps ${title} queued for the next scene because no scene store record was available.`,
    vibe: songMood(song),
    createdAt: now,
    updatedAt: now
  };
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
    const runFile = path.join(RUN_DIR, `${slugify(avatarName(current)) || current.id}-episodes-genesis-${runStamp}.json`);
    runReceipts.push({
      avatarId: current.id,
      avatarName: avatarName(current),
      runId: run.runId,
      runFile,
      choiceCount: avatarAssignments.length
    });
    if (!dryRun) await writeJson(runFile, run);
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

function buildAvatarRun(avatar, assignments, protocolContext, loreContext, manifest) {
  return {
    schemaVersion: "hapa.episodes-avatar-genesis-run.v1",
    runId: `episodes-genesis-${avatar.id}-${runStamp}`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    status: "complete",
    completedAt: now,
    source: "scripts/run-episodes-genesis-pass.mjs",
    reviewedContext: {
      episodeCardsReviewed: assignments.length,
      episodesManifestPath: MANIFEST_PATH,
      manifestCardsReviewed: manifest.cards?.length || 0,
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
    episodeId: assignment.episodeId,
    episodeTitle: assignment.episodeTitle,
    episodeClassification: assignment.episodeClassification,
    role: "episodes-comic-tarot-choice",
    whyChosen: assignment.whyChosen,
    canonReason: assignment.canonReason,
    comicReason: assignment.comicReason,
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
    id: `episodes-song-${assignment.avatarId}-${assignment.cardId}`,
    songId: assignment.songId,
    cardId: assignment.songCardId,
    title: assignment.songTitle,
    albumId: "dear-papa-album",
    author: "Calder",
    whySelected: assignment.songWhy,
    genesisInstruction: `Use ${assignment.songTitle} as ${assignment.avatarName}'s performance/vibe bridge for Episodes card ${assignment.cardTitle}.`,
    communicationUse: `When ${assignment.cardTitle} appears in ${assignment.sceneTitle || "a future scene"}, let ${assignment.songTitle} color the comic beat, relationship pressure, and future deck choice.`,
    sceneId: assignment.sceneId,
    sceneTitle: assignment.sceneTitle,
    sourcePath: runFile,
    status: "active",
    createdAt: now,
    updatedAt: now
  }));
  const selectedEpisodeCards = assignments.map((assignment) => ({
    id: `episodes-context-${assignment.avatarId}-${assignment.cardId}`,
    cardId: assignment.cardId,
    cardTitle: assignment.cardTitle,
    episodeId: assignment.episodeId,
    episodeTitle: assignment.episodeTitle,
    classification: assignment.episodeClassification,
    comicReason: assignment.comicReason,
    whyChosen: assignment.whyChosen,
    songId: assignment.songId,
    songTitle: assignment.songTitle,
    sceneId: assignment.sceneId,
    sceneTitle: assignment.sceneTitle,
    sourcePath: runFile,
    createdAt: now,
    updatedAt: now
  }));
  const journalEntry = {
    id: `journal-${normalized.id}-episodes-${runStamp}`,
    dateOrSequenceMarker: `Episodes Genesis ${now}`,
    entryVoice: "in-character",
    privateEntry: nextChapterForAvatar(normalized, assignments),
    publicSummary: `${avatarName(normalized)} reviewed Episodes media, selected ${assignments.length} comic/tarot cards, paired each to a Dear Papa song and scene, and recorded why those media choices matter to their canon and future deck.`,
    classification: "perspective",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const memoryEntry = {
    memoryId: `memory-${normalized.id}-episodes-${runStamp}`,
    summary: `${avatarName(normalized)} added Episodes comic/tarot cards and Dear Papa song links, learning how media cards become attributed lore, mechanics, deck choices, and future scenes.`,
    emotionalWeight: 4,
    visibility: "shared",
    confidence: "generated",
    classification: "memory_delta",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const contextEntry = {
    id: `context-${normalized.id}-episodes-${runStamp}`,
    contextId: "episodes-genesis-pass",
    label: "Episodes Comic/Tarot Genesis Pass",
    kind: "resource",
    avatarBelief: `${avatarName(normalized)} treats Episodes media as source-attributed generated lore until human promotion.`,
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
    episodeComicContext: {
      ...(mind.episodeComicContext || {}),
      selectedEpisodeCards: mergeById([...(mind.episodeComicContext?.selectedEpisodeCards || []), ...selectedEpisodeCards]),
      genesisUse: unique([
        ...(mind.episodeComicContext?.genesisUse || []),
        "Use Episodes cards as comic/tarot/media bridges that preserve source paths, OCR, avatar choice, song match, and scene placement.",
        "Let comics and tarot designs teach Hapa Protocol through narrative beats, relationship pressure, and concrete media lineage."
      ]),
      updatedAt: now
    },
    dearPapaSongContext: {
      ...(mind.dearPapaSongContext || {}),
      selectedSongCards: mergeById([...(mind.dearPapaSongContext?.selectedSongCards || []), ...selectedSongCards]),
      genesisUse: unique([
        ...(mind.dearPapaSongContext?.genesisUse || []),
        "Use Episodes card/song choices as performance bridges for comic scenes and Tarot Table draws."
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
    reason: `Episodes Genesis: ${assignment.whyChosen} Song: ${assignment.songTitle}. Scene: ${assignment.sceneTitle}.`,
    updatedAt: now
  }));
  inventory.cardStates = [
    ...(inventory.cardStates || []).filter((state) => !cardIds.includes(state.cardId)),
    ...incomingStates
  ];
  inventory.updatedAt = now;
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
        episodeIds: unique([...(card.connections?.episodeIds || []), ...cardAssignments.map((assignment) => assignment.episodeId).filter(Boolean)]),
        itemIds: unique([...(card.connections?.itemIds || []), ...cardAssignments.map((assignment) => assignment.songCardId).filter(Boolean)])
      },
      tags: unique([...(card.tags || []), "episodes-genesis-linked", "dear-papa-song-linked", "scene-linked", "avatar-lore-linked"]),
      history: [
        ...(card.history || []),
        ...cardAssignments.map((assignment) => ({
          eventId: `history-${assignment.id}`,
          label: "Episodes Avatar Genesis link",
          happenedAt: now,
          notes: `${assignment.avatarName} linked ${assignment.cardTitle} to ${assignment.songTitle}${assignment.sceneTitle ? ` and ${assignment.sceneTitle}` : ""}.`
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
            id: `episodes-song-link-${assignment.cardId}-${assignment.avatarId}-${assignment.songId}-${runStamp}`,
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
            id: `episodes-scene-link-${assignment.cardId}-${assignment.avatarId}-${assignment.sceneId}-${runStamp}`,
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
            id: `episodes-avatar-lore-${assignment.cardId}-${assignment.avatarId}-${runStamp}`,
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
            ...cardAssignments.map((assignment) => `${assignment.cardTitle} is linked to ${assignment.avatarName}, ${assignment.songTitle}, and ${assignment.sceneTitle || "a future scene"} by Episodes Avatar Genesis.`)
          ])
        }
      };
    }
    if (card.episodeCard) {
      next.episodeCard = {
        ...card.episodeCard,
        avatarLinks: mergeById([
          ...(card.episodeCard.avatarLinks || []),
          ...cardAssignments.map((assignment) => ({
            id: `episodes-card-avatar-${assignment.cardId}-${assignment.avatarId}-${runStamp}`,
            avatarId: assignment.avatarId,
            avatarName: assignment.avatarName,
            cardId: assignment.cardId,
            choiceId: assignment.id,
            why: assignment.whyChosen,
            notes: assignment.comicReason,
            confidence: "generated",
            createdAt: now,
            updatedAt: now
          }))
        ]),
        songLinks: mergeById([
          ...(card.episodeCard.songLinks || []),
          ...cardAssignments.map((assignment) => ({
            id: `episodes-card-song-${assignment.cardId}-${assignment.songId}-${assignment.avatarId}-${runStamp}`,
            avatarId: assignment.avatarId,
            avatarName: assignment.avatarName,
            songId: assignment.songId,
            songCardId: assignment.songCardId,
            songTitle: assignment.songTitle,
            why: assignment.songWhy,
            vibe: assignment.vibe,
            confidence: "generated",
            createdAt: now,
            updatedAt: now
          }))
        ]),
        tarotLinks: mergeById([
          ...(card.episodeCard.tarotLinks || []),
          ...cardAssignments.map((assignment) => ({
            id: `episodes-card-tarot-${assignment.cardId}-${assignment.avatarId}-${runStamp}`,
            avatarId: assignment.avatarId,
            avatarName: assignment.avatarName,
            cardId: assignment.cardId,
            choiceId: assignment.id,
            tarotType: assignment.tarotType,
            functionalType: assignment.functionalType,
            why: assignment.deckInfluence,
            confidence: "generated",
            createdAt: now,
            updatedAt: now
          }))
        ])
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
      tags: unique([...(scene.tags || []), "episodes-genesis", "comic-tarot-linked", "avatar-lore-linked"]),
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
        tags: unique([...(existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].tags || [] : []), "scene-presence", "episodes-genesis"]),
        note: assignment.sceneWhy,
        taggedAt: existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].taggedAt || now : now,
        updatedAt: now
      };
      if (existingAvatarIndex >= 0) next.avatarTags[existingAvatarIndex] = avatarTag;
      else next.avatarTags.push(avatarTag);

      const actionId = `event-episodes-genesis-${stableHash(assignment.id).slice(0, 12)}`;
      if (!next.eventActions.some((action) => action.id === actionId)) {
        next.eventActions.push({
          id: actionId,
          sequence: next.eventActions.length + 1,
          label: `${assignment.cardTitle} Episodes link`,
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
          tags: ["playlist", "dear-papa", "episodes-genesis"],
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

function nextChapterForAvatar(avatar, assignments) {
  const name = avatarName(avatar);
  const cardLine = assignments.slice(0, 8).map((assignment) => `${assignment.cardTitle} with ${assignment.songTitle}${assignment.sceneTitle ? ` in ${assignment.sceneTitle}` : ""}`).join("; ");
  return `${name} opens an Episodes Genesis chapter by laying ${cardLine} into their deck. The chapter treats every comic, card design, and looping video as attributed Hapa evidence: media becomes OCR, OCR becomes catalog, catalog becomes mechanics, mechanics become lore, and lore becomes a future scene only when canon boundaries stay visible. ${name} uses the choices to connect tarot cards, songs, comics, scenes, and avatar objectives into one playable narrative surface.`;
}

function protocolEducationForAvatar(avatar, assignments) {
  const name = avatarName(avatar);
  const types = unique(assignments.map((assignment) => cardTypeLabel({ cardType: assignment.cardType, tarotCard: { mainType: assignment.tarotMainType } }))).join(", ");
  return `${name}'s Episodes pass teaches Hapa Protocol as a loop: ingest mixed media, preserve attribution, OCR images and video first frames, infer tarot/comic/card schemas, connect them to avatars, Dear Papa songs, and scenes, then route the result to Atlas, Second Brain, Wiki, and the Builder. Selected piles: ${types}.`;
}

function isEpisodeCard(card = {}) {
  return Boolean(
    card.episodeCard ||
    card.tarotCard?.catalog?.collectionId === "episodes" ||
    (card.tags || []).includes("episodes") ||
    (card.tags || []).includes("episode-card")
  );
}

function cardKeywords(card) {
  return unique([
    ...(card.tarotCard?.keywords || []),
    ...(card.episodeCard?.themes || []),
    ...(card.episodeCard?.characters || []),
    ...(card.utility || []),
    ...(card.tags || []).filter((tag) => !/episodes|tarot|card|dear-papa/.test(tag))
  ]).slice(0, 10);
}

function episodeBeat(card) {
  return card.episodeCard?.beats?.[0] ||
    card.episodeCard?.comic?.dialogueLines?.[0] ||
    card.tarotCard?.lore?.summary ||
    "the card gives a readable media beat that can become soft-canon only after review.";
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
    avatar.three_paragraph_background_narrative,
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
    card.tarotCard?.identity?.tarotType,
    card.tarotCard?.identity?.functionalType,
    card.tarotCard?.lore?.summary,
    card.tarotCard?.mechanics?.broadGameMechanic,
    card.episodeCard?.classification,
    card.episodeCard?.summary,
    card.episodeCard?.comic?.dialogueLines?.join(" "),
    ...(card.episodeCard?.beats || []),
    ...(card.episodeCard?.characters || []),
    ...(card.episodeCard?.themes || []),
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
    song.lore?.learning_thing,
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

function cardTypeLabel(card) {
  return toTitleCase(String(card.tarotCard?.mainType || card.cardType || "lore_tarot_card").replace(/_/g, " "));
}

function songMood(song) {
  return song.mood || song.lore?.learning_thing || song.performancePerspective?.voice_function || "cinematic-lore";
}

function summarizeAssignment(assignment) {
  return {
    avatarId: assignment.avatarId,
    avatarName: assignment.avatarName,
    cardId: assignment.cardId,
    cardTitle: assignment.cardTitle,
    cardType: assignment.cardType,
    episodeClassification: assignment.episodeClassification,
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

function sceneCoverage(assignments) {
  const counts = {};
  for (const assignment of assignments) counts[assignment.sceneTitle || "unassigned"] = (counts[assignment.sceneTitle || "unassigned"] || 0) + 1;
  return counts;
}

async function backupStores() {
  await writeJson(path.join(BACKUP_DIR, `avatar-store.before-episodes-genesis-${runStamp}.json`), await readJson(AVATAR_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `inventory-store.before-episodes-genesis-${runStamp}.json`), await readJson(INVENTORY_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `item-manager-store.before-episodes-genesis-${runStamp}.json`), await readJson(ITEM_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `scene-store.before-episodes-genesis-${runStamp}.json`), await readJson(SCENE_STORE_PATH));
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
    associationReportPath: path.resolve(ASSOCIATION_REPORT_PATH)
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
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

function mergeById(items = [], key = "id") {
  const byId = new Map();
  for (const item of items) {
    const id = item?.[key] || item?.id || item?.cardId;
    if (!id) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
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

function stableHash(value = "") {
  return createHash("sha1").update(String(value)).digest("hex");
}

function stableNumber(value = "") {
  return parseInt(stableHash(value).slice(0, 8), 16);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function avatarName(avatar) {
  return avatar.primaryName || avatar.name || avatar.names?.[0]?.name || avatar.id || "Avatar";
}

function compareText(a = "", b = "") {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function toTitleCase(value = "") {
  return String(value || "").replace(/_/g, " ").toLowerCase().replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}
