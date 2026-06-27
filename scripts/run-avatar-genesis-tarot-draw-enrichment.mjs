#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const HEALING_REPORT_DIR = path.join(DATA_DIR, "healing-reports");

const PATHS = {
  avatars: path.join(DATA_DIR, "avatar-store.json"),
  items: path.join(DATA_DIR, "item-manager-store.json"),
  tarot: path.join(DATA_DIR, "tarot-store.json"),
  scenes: path.join(DATA_DIR, "scene-store.json"),
  songs: path.join(DATA_DIR, "hapa-songs-store.json")
};

const CHOICES_PER_AVATAR = 3;
const SCENES_PER_AVATAR = 2;
const SONGS_PER_AVATAR = 2;
const LOOP_LINKS_PER_AVATAR = 4;
const dryRun = process.argv.includes("--dry-run");

await main();

async function main() {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  const runId = `avatar-genesis-tarot-draw-enrichment-${stamp}`;

  const avatarStore = await readJson(PATHS.avatars);
  const itemStore = await readJson(PATHS.items);
  const tarotStore = await readJson(PATHS.tarot);
  const sceneStore = await readJson(PATHS.scenes);
  const songStore = await readJson(PATHS.songs);

  const avatars = avatarStore.avatars || [];
  const itemCards = itemStore.cards || [];
  const tarotCards = tarotStore.cards || [];
  const scenes = sceneStore.scenes || [];
  const songs = songStore.songs || [];
  const drawCards = itemCards.filter(isTarotDrawCard);
  const tarotByTitle = buildTarotTitleIndex(tarotCards);

  const report = {
    schemaVersion: "hapa.avatar-genesis-tarot-draw-enrichment-report.v1",
    runId,
    runAt: now,
    dryRun,
    source: "scripts/run-avatar-genesis-tarot-draw-enrichment.mjs",
    policy: {
      avatarLoopPool: "Avatar Tarot Draw cards keep the full eligible source pool; the Three.js viewer caps only active screens and preload queue.",
      itemCardLoopLinks: `Each avatar contributes up to ${LOOP_LINKS_PER_AVATAR} representative loop links to chosen Tarot Draw cards so new restored videos enter card relationships without cloning every video onto every card.`,
      canonBoundary: "Generated enrichment is soft canon until human review."
    },
    inputCounts: {
      avatars: avatars.length,
      itemCards: itemCards.length,
      tarotDrawCards: drawCards.length,
      tarotCards: tarotCards.length,
      scenes: scenes.length,
      songs: songs.length,
      avatarVideoLoops: avatars.reduce((sum, avatar) => sum + avatarVideoAssets(avatar).length, 0)
    },
    avatarChoices: [],
    touched: {
      avatars: 0,
      itemCards: 0,
      tarotCards: 0,
      scenes: 0,
      songs: 0,
      mediaLinks: 0,
      journals: 0
    }
  };

  const touchedItemIds = new Set();
  const touchedTarotIds = new Set();
  const touchedSceneIds = new Set();
  const touchedSongIds = new Set();

  for (const avatar of avatars) {
    if (!avatar?.id) continue;
    const avatarNameValue = avatarName(avatar);
    const cards = chooseCardsForAvatar(avatar, drawCards, CHOICES_PER_AVATAR);
    const pickedScenes = chooseScenesForAvatar(avatar, scenes, SCENES_PER_AVATAR);
    const pickedSongs = chooseSongsForAvatar(avatar, songs, SONGS_PER_AVATAR);
    const loopAssets = chooseLoopAssetsForAvatar(avatar, LOOP_LINKS_PER_AVATAR, runId);
    if (!cards.length || !pickedScenes.length || !pickedSongs.length) continue;

    const choices = cards.map((card, index) => {
      const scene = pickedScenes[index % pickedScenes.length];
      const song = pickedSongs[index % pickedSongs.length];
      const loop = loopAssets[index % Math.max(1, loopAssets.length)] || null;
      const choiceId = `avatar-genesis-${slugify(avatar.id)}-${slugify(card.id)}-${slugify(scene.id)}-${slugify(song.id || song.songId || song.title)}`;
      const reason = `${avatarNameValue} chose ${cardTitle(card)} for ${sceneTitle(scene)} with ${songTitle(song)} because the card, scene, song, and avatar loop can play together in the Tarot Draw.`;
      return { choiceId, card, scene, song, loop, reason };
    });

    for (const choice of choices) {
      linkChoiceToItemCard(choice.card, avatar, choice.scene, choice.song, choice.loop, choice.reason, choice.choiceId, now, runId);
      touchedItemIds.add(choice.card.id);
      if (choice.loop?.uri) report.touched.mediaLinks += 1;

      const matchingTarotCard = findMatchingTarotCard(choice.card, tarotByTitle, tarotCards, choice.choiceId);
      if (matchingTarotCard) {
        linkChoiceToTarotCard(matchingTarotCard, avatar, choice.card, choice.scene, choice.song, choice.loop, choice.reason, choice.choiceId, now, runId);
        touchedTarotIds.add(matchingTarotCard.id);
      }

      linkChoiceToScene(choice.scene, avatar, choice.card, choice.song, choice.reason, choice.choiceId, now, runId);
      touchedSceneIds.add(choice.scene.id);

      linkChoiceToSong(choice.song, avatar, choice.card, choice.scene, choice.reason, choice.choiceId, now, runId);
      touchedSongIds.add(choice.song.id);
    }

    journalAvatarChoices(avatar, choices, loopAssets, now, runId);
    report.touched.avatars += 1;
    report.touched.journals += 1;
    report.avatarChoices.push({
      avatarId: avatar.id,
      avatarName: avatarNameValue,
      cardIds: choices.map((choice) => choice.card.id),
      sceneIds: choices.map((choice) => choice.scene.id),
      songIds: choices.map((choice) => choice.song.id || choice.song.songId),
      loopAssetIds: loopAssets.map((asset) => asset.id),
      availableLoopCount: avatarVideoAssets(avatar).length
    });
  }

  report.touched.itemCards = touchedItemIds.size;
  report.touched.tarotCards = touchedTarotIds.size;
  report.touched.scenes = touchedSceneIds.size;
  report.touched.songs = touchedSongIds.size;
  report.outputCounts = {
    avatarGenesisJournals: avatars.reduce((sum, avatar) => sum + (avatar.mind?.journal || []).filter((entry) => entry.journalType === "tarot-draw-avatar-genesis-choice").length, 0),
    itemCardsWithGenesisChoices: itemCards.filter((card) => (card.tarotCard?.avatarLoreLinks || []).some((link) => link.sourcePath === runId)).length,
    itemCardsWithSceneLinks: itemCards.filter((card) => (card.tarotCard?.sceneLinks || []).length).length,
    itemCardsWithSongLinks: itemCards.filter((card) => (card.tarotCard?.songLinks || []).length).length,
    itemCardsWithLoopMediaLinks: itemCards.filter((card) => (card.tarotCard?.mediaLinks || []).some((link) => /avatar-genesis/.test(link.id || ""))).length,
    scenesWithGenesisLinks: scenes.filter((scene) => (scene.avatarTags || []).some((tag) => tag.sourcePath === runId)).length,
    songsWithGenesisLinks: songs.filter((song) => (song.attachments?.cardLinks || []).some((link) => link.sourcePath === runId)).length
  };

  if (!dryRun) {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.mkdir(RUN_DIR, { recursive: true });
    await fs.mkdir(HEALING_REPORT_DIR, { recursive: true });
    await backupInputs(runId);

    avatarStore.avatars = avatars;
    avatarStore.updatedAt = now;
    avatarStore.avatarGenesisTarotDrawEnrichment = {
      schemaVersion: "hapa.avatar-store.tarot-draw-genesis-enrichment.v1",
      runId,
      runAt: now,
      source: report.source,
      policy: report.policy
    };

    itemStore.cards = itemCards;
    itemStore.updatedAt = now;
    itemStore.auditRuns = [
      ...(itemStore.auditRuns || []),
      {
        id: runId,
        kind: "avatar-genesis-tarot-draw-enrichment",
        generatedAt: now,
        avatarsProcessed: report.touched.avatars,
        itemCardsTouched: report.touched.itemCards,
        source: report.source,
        canonBoundary: report.policy.canonBoundary
      }
    ];

    tarotStore.cards = tarotCards;
    tarotStore.updatedAt = now;
    tarotStore.auditRuns = [
      ...(tarotStore.auditRuns || []),
      {
        id: runId,
        kind: "avatar-genesis-tarot-draw-enrichment",
        generatedAt: now,
        tarotCardsTouched: report.touched.tarotCards,
        source: report.source
      }
    ];

    sceneStore.scenes = scenes;
    sceneStore.updatedAt = now;
    sceneStore.auditRuns = [
      ...(sceneStore.auditRuns || []),
      {
        id: runId,
        kind: "avatar-genesis-tarot-draw-enrichment",
        generatedAt: now,
        scenesTouched: report.touched.scenes,
        source: report.source
      }
    ];

    songStore.songs = songs;
    songStore.updatedAt = now;
    songStore.audit = {
      ...(songStore.audit || {}),
      withAvatars: songs.filter((song) => (song.attachments?.avatarLinks || []).length).length,
      withScenes: songs.filter((song) => (song.attachments?.sceneLinks || []).length).length,
      withCardLinks: songs.filter((song) => (song.attachments?.cardLinks || []).length).length,
      generatedAt: now
    };

    await writeJson(PATHS.avatars, avatarStore);
    await writeJson(PATHS.items, itemStore);
    await writeJson(PATHS.tarot, tarotStore);
    await writeJson(PATHS.scenes, sceneStore);
    await writeJson(PATHS.songs, songStore);

    const runPath = path.join(RUN_DIR, `${runId}.json`);
    const latestRunPath = path.join(RUN_DIR, "latest-avatar-genesis-tarot-draw-enrichment.json");
    const latestAuditPath = path.join(HEALING_REPORT_DIR, "latest-avatar-genesis-tarot-draw-enrichment-audit.json");
    await writeJson(runPath, report);
    await writeJson(latestRunPath, report);
    await writeJson(latestAuditPath, {
      schemaVersion: "hapa.avatar-genesis-tarot-draw-enrichment-audit.v1",
      runId,
      runAt: now,
      policy: report.policy,
      inputCounts: report.inputCounts,
      outputCounts: report.outputCounts,
      touched: report.touched,
      reportPath: path.relative(ROOT, latestRunPath)
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    runId,
    reportPath: dryRun ? null : path.relative(ROOT, path.join(RUN_DIR, "latest-avatar-genesis-tarot-draw-enrichment.json")),
    touched: report.touched,
    outputCounts: report.outputCounts
  }, null, 2));
}

function isTarotDrawCard(card = {}) {
  const tags = card.tags || [];
  return Boolean(card.tarotCard) ||
    card.cardType === "ship_card" ||
    /tarot/i.test(card.cardType || "") ||
    tags.includes("tarot-card") ||
    tags.includes("loop-video") ||
    Boolean(itemVideoAssets(card).length) ||
    Boolean((card.tarotCard?.mediaLinks || []).some((link) => link.videoUri));
}

function chooseCardsForAvatar(avatar, cards, limit) {
  return cards
    .map((card) => ({ card, score: cardAvatarScore(card, avatar) }))
    .filter(({ score }) => score > -1000)
    .sort((a, b) => b.score - a.score || compareText(cardTitle(a.card), cardTitle(b.card)))
    .slice(0, limit)
    .map(({ card }) => card);
}

function chooseScenesForAvatar(avatar, scenes, limit) {
  return scenes
    .map((scene) => ({ scene, score: sceneAvatarScore(scene, avatar) }))
    .sort((a, b) => b.score - a.score || compareText(sceneTitle(a.scene), sceneTitle(b.scene)))
    .slice(0, limit)
    .map(({ scene }) => scene);
}

function chooseSongsForAvatar(avatar, songs, limit) {
  return songs
    .map((song) => ({ song, score: songAvatarScore(song, avatar) }))
    .sort((a, b) => b.score - a.score || compareText(songTitle(a.song), songTitle(b.song)))
    .slice(0, limit)
    .map(({ song }) => song);
}

function cardAvatarScore(card, avatar) {
  let score = stableNumber(`${avatar.id}:${card.id}`) % 100;
  const avatarTokens = avatarSearchTokens(avatar);
  const text = searchableText([
    card.id,
    card.title,
    card.name,
    card.summary,
    card.description,
    card.cardType,
    ...(card.tags || []),
    card.tarotCard?.title,
    card.tarotCard?.lore?.summary,
    ...(card.tarotCard?.keywords || [])
  ]);
  for (const token of avatarTokens) {
    if (text.includes(token)) score += 18;
  }
  if ((card.connections?.avatarIds || []).includes(avatar.id)) score += 220;
  if ((card.tarotCard?.avatarLoreLinks || []).some((link) => link.avatarId === avatar.id)) score += 180;
  if (itemVideoAssets(card).length || (card.tarotCard?.mediaLinks || []).some((link) => link.videoUri)) score += 35;
  if (card.tarotCard) score += 25;
  return score;
}

function sceneAvatarScore(scene, avatar) {
  let score = stableNumber(`${avatar.id}:${scene.id}`) % 100;
  const avatarTokens = avatarSearchTokens(avatar);
  const text = searchableText([
    scene.id,
    scene.title,
    scene.summary,
    scene.quickPitch,
    scene.overallNarrative,
    scene.narrativeText,
    ...(scene.tags || [])
  ]);
  for (const token of avatarTokens) {
    if (text.includes(token)) score += 16;
  }
  if ((scene.avatarTags || []).some((tag) => tag.avatarId === avatar.id)) score += 240;
  if ((scene.assets || []).some((asset) => asset.type === "video" || asset.uri)) score += 20;
  return score;
}

function songAvatarScore(song, avatar) {
  let score = stableNumber(`${avatar.id}:${song.id || song.songId}`) % 100;
  const avatarTokens = avatarSearchTokens(avatar);
  const text = searchableText([
    song.id,
    song.songId,
    song.title,
    song.lore?.summary,
    song.lore?.relationshipLens,
    song.performancePerspective?.voiceName,
    song.performancePerspective?.teamColor,
    ...(song.tags || [])
  ]);
  for (const token of avatarTokens) {
    if (text.includes(token)) score += 20;
  }
  if ((song.attachments?.avatarLinks || []).some((link) => link.avatarId === avatar.id)) score += 260;
  if ((song.attachments?.cardLinks || []).length) score += 12;
  return score;
}

function chooseLoopAssetsForAvatar(avatar, limit, seed) {
  const videos = avatarVideoAssets(avatar);
  if (!videos.length) return [];
  const restored = videos.filter(isRestoredLoopAsset);
  const hero = videos.find((asset) => (asset.tags || []).includes("hero") || asset.requirementId === "loops") || videos[0];
  const remaining = uniqueBy([
    hero,
    ...rotatingWindow(restored, Math.min(restored.length, limit), `${seed}:${avatar.id}:restored`),
    ...rotatingWindow(videos, limit, `${seed}:${avatar.id}:all`)
  ].filter(Boolean), assetKey);
  return remaining.slice(0, limit);
}

function linkChoiceToItemCard(card, avatar, scene, song, loop, reason, choiceId, now, runId) {
  card.tags = uniqueTextList([...(card.tags || []), "tarot-draw-genesis-enriched", "avatar-genesis-choice", "scene-linked", "dear-papa-song-linked", "avatar-loop-pool"]);
  card.connections = normalizeConnections(card.connections);
  addUnique(card.connections.avatarIds, avatar.id);
  addUnique(card.connections.sceneIds, scene.id);
  addUnique(card.connections.itemIds, song.id || song.songId);
  card.tarotCard = card.tarotCard && typeof card.tarotCard === "object" ? card.tarotCard : {};
  card.tarotCard.songLinks = upsertById(card.tarotCard.songLinks || [], tarotLink({
    id: `${choiceId}-song`,
    avatar,
    card,
    scene,
    song,
    why: reason,
    sourcePath: runId,
    now
  }));
  card.songLinks = upsertById(card.songLinks || [], tarotLink({
    id: `${choiceId}-song`,
    avatar,
    card,
    scene,
    song,
    why: reason,
    sourcePath: runId,
    now
  }));
  card.tarotCard.sceneLinks = upsertById(card.tarotCard.sceneLinks || [], tarotLink({
    id: `${choiceId}-scene`,
    avatar,
    card,
    scene,
    song,
    why: reason,
    sourcePath: runId,
    now
  }));
  card.tarotCard.avatarLoreLinks = upsertById(card.tarotCard.avatarLoreLinks || [], tarotLink({
    id: `${choiceId}-avatar`,
    avatar,
    card,
    scene,
    song,
    why: reason,
    sourcePath: runId,
    now
  }));
  if (loop?.uri) {
    card.tarotCard.mediaLinks = upsertById(card.tarotCard.mediaLinks || [], mediaLinkFromLoop(loop, choiceId, reason));
  }
  card.history = [
    {
      id: `${choiceId}-history`,
      type: "avatar-genesis-tarot-draw-choice",
      message: reason,
      at: now,
      source: runId
    },
    ...(card.history || []).filter((entry) => entry.id !== `${choiceId}-history`)
  ].slice(0, 80);
  card.updatedAt = now;
}

function linkChoiceToTarotCard(tarotCard, avatar, itemCard, scene, song, loop, reason, choiceId, now, runId) {
  tarotCard.avatarLinks = upsertById(tarotCard.avatarLinks || [], {
    id: `${choiceId}-tarot-avatar`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    role: "avatar-genesis-choice",
    reason,
    notes: `Linked from Tarot Draw item card ${cardTitle(itemCard)}.`,
    sourcePath: runId,
    linkedAt: now,
    updatedAt: now
  });
  if (loop?.uri) {
    tarotCard.assets = upsertById(tarotCard.assets || [], {
      id: `${choiceId}-tarot-loop-${slugify(loop.id || loop.uri)}`,
      name: `${avatarName(avatar)} Tarot Draw loop`,
      type: "video",
      uri: loop.uri,
      requirementId: "tarot_card",
      tags: uniqueTextList(["avatar-genesis-choice", "tarot-draw-loop", ...(loop.tags || [])]),
      source: "avatar-genesis-tarot-draw-enrichment",
      metadata: {
        avatarId: avatar.id,
        avatarName: avatarName(avatar),
        sourceAvatarAssetId: loop.id || "",
        sourceChoiceId: choiceId,
        tarotMediaRole: "loop_video",
        originalFileName: loop.metadata?.originalFileName || loop.name || ""
      },
      createdAt: now,
      updatedAt: now
    });
  }
  tarotCard.enrichment = {
    ...(tarotCard.enrichment || {}),
    avatarGenesisTarotDraw: {
      schemaVersion: "hapa.tarot-card.avatar-genesis-choice.v1",
      runId,
      runAt: now,
      sourceItemCardId: itemCard.id,
      sceneId: scene.id,
      songId: song.id || song.songId,
      note: reason
    }
  };
  tarotCard.updatedAt = now;
}

function linkChoiceToScene(scene, avatar, card, song, reason, choiceId, now, runId) {
  scene.tags = uniqueTextList([...(scene.tags || []), "tarot-draw-linked", "avatar-genesis-choice", "dear-papa-song-linked"]);
  scene.avatarTags = upsertById(scene.avatarTags || [], {
    id: `${choiceId}-scene-avatar`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    role: "genesis-choice",
    presence: "tarot-draw-loop",
    tags: ["avatar-genesis-choice", "tarot-draw-linked"],
    note: reason,
    sourcePath: runId,
    taggedAt: now,
    updatedAt: now
  }, (item) => item.id || `${item.avatarId}:${item.role}:${item.sourcePath || ""}`);
  scene.playlist = upsertById(scene.playlist || [], {
    id: `${choiceId}-scene-song`,
    songId: song.songId || song.id,
    songCardId: song.id,
    title: songTitle(song),
    cardId: card.id,
    cardTitle: cardTitle(card),
    role: "tarot-draw-genesis-soundtrack",
    reason,
    sourcePath: runId,
    linkedAt: now,
    updatedAt: now
  });
  scene.updatedAt = now;
}

function linkChoiceToSong(song, avatar, card, scene, reason, choiceId, now, runId) {
  song.attachments = {
    ...(song.attachments || {}),
    avatarLinks: upsertById(song.attachments?.avatarLinks || [], {
      id: `${choiceId}-song-avatar`,
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      role: "avatar-genesis-vocal-context",
      reason,
      sourcePath: runId,
      linkedAt: now,
      updatedAt: now
    }),
    cardLinks: upsertById(song.attachments?.cardLinks || [], {
      id: `${choiceId}-song-card`,
      cardId: card.id,
      cardTitle: cardTitle(card),
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      role: "tarot-draw-genesis-card",
      reason,
      canonReason: "Soft-canon avatar genesis selection.",
      contextReason: `Scene: ${sceneTitle(scene)}.`,
      personaReason: `${avatarName(avatar)} journaled this card/song/scene bundle.`,
      tags: ["tarot-draw", "avatar-genesis-choice"],
      sourcePath: runId,
      linkedAt: now,
      updatedAt: now
    }),
    sceneLinks: upsertById(song.attachments?.sceneLinks || [], {
      id: `${choiceId}-song-scene`,
      sceneId: scene.id,
      sceneTitle: sceneTitle(scene),
      role: "tarot-draw-genesis-scene",
      reason,
      tags: ["tarot-draw", "avatar-genesis-choice"],
      sourcePath: runId,
      linkedAt: now,
      updatedAt: now
    })
  };
  song.storyBeats = upsertById(song.storyBeats || [], {
    id: `${choiceId}-story-beat`,
    title: `${avatarName(avatar)} Tarot Draw choice`,
    beat: reason,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    cardId: card.id,
    sceneId: scene.id,
    sourcePath: runId,
    createdAt: now,
    updatedAt: now
  });
  song.tags = uniqueTextList([...(song.tags || []), "tarot-draw-linked", "avatar-genesis-choice"]);
  song.updatedAt = now;
}

function journalAvatarChoices(avatar, choices, loopAssets, now, runId) {
  avatar.mind = avatar.mind && typeof avatar.mind === "object" ? avatar.mind : {};
  const avatarNameValue = avatarName(avatar);
  const choiceLines = choices.map((choice) => `- ${cardTitle(choice.card)} + ${sceneTitle(choice.scene)} + ${songTitle(choice.song)}: ${choice.reason}`);
  const loopCount = avatarVideoAssets(avatar).length;
  const journalId = `${slugify(avatar.id)}-${runId}`;
  avatar.mind.journal = upsertById(avatar.mind.journal || [], {
    id: journalId,
    schemaVersion: "hapa.avatar-journal-entry.v1",
    journalType: "tarot-draw-avatar-genesis-choice",
    dateOrSequenceMarker: "post-video-reattach tarot draw genesis",
    entryVoice: avatarNameValue,
    privateEntry: `${avatarNameValue} picked Tarot Draw cards, scenes, and songs for a rotating loop pool.\n\n${choiceLines.join("\n")}\n\nLoop pool note: ${loopCount} eligible avatar videos remain available to the Tarot Draw queue; representative links attached this run were ${loopAssets.map((asset) => asset.name || asset.id).filter(Boolean).slice(0, 6).join(", ") || "none"}.`,
    publicSummary: `${avatarNameValue} picked ${choices.length} Tarot Draw card/scene/song bundles and linked them to a rolling avatar video loop pool.`,
    mentionedAvatarIds: [avatar.id],
    mentionedAvatarNames: [avatarNameValue],
    itemTags: choices.map((choice) => choice.card.id),
    eventTags: ["avatar-genesis", "tarot-draw", "scene-choice", "song-choice", "rolling-loop-pool"],
    classification: "generated",
    canonStatus: "soft_canon",
    causalityStatus: "causality-review-pending",
    sourceRefs: [
      {
        id: runId,
        title: "Avatar Genesis Tarot Draw Enrichment",
        path: "scripts/run-avatar-genesis-tarot-draw-enrichment.mjs",
        confidence: "generated"
      }
    ],
    status: "active",
    createdAt: now,
    updatedAt: now
  });

  avatar.mind.tarotCardDeck = upsertManyById(avatar.mind.tarotCardDeck || [], choices.map((choice) => ({
    id: `${choice.choiceId}-deck-choice`,
    cardId: choice.card.id,
    cardTitle: cardTitle(choice.card),
    sceneId: choice.scene.id,
    sceneTitle: sceneTitle(choice.scene),
    songId: choice.song.songId || choice.song.id,
    songCardId: choice.song.id,
    songTitle: songTitle(choice.song),
    whyChosen: choice.reason,
    sourcePath: runId,
    chosenAt: now
  }))).slice(0, 260);

  avatar.mind.dearPapaSongContext = avatar.mind.dearPapaSongContext && typeof avatar.mind.dearPapaSongContext === "object" ? avatar.mind.dearPapaSongContext : {};
  avatar.mind.dearPapaSongContext.selectedSongCards = upsertManyById(avatar.mind.dearPapaSongContext.selectedSongCards || [], choices.map((choice) => ({
    id: `${choice.choiceId}-song-choice`,
    songId: choice.song.songId || choice.song.id,
    songCardId: choice.song.id,
    title: songTitle(choice.song),
    cardId: choice.card.id,
    sceneId: choice.scene.id,
    whyChosen: choice.reason,
    sourcePath: runId,
    chosenAt: now
  }))).slice(0, 180);

  avatar.mind.contextMap = upsertManyById(avatar.mind.contextMap || [], choices.map((choice) => ({
    id: `${choice.choiceId}-scene-context`,
    contextId: choice.scene.id,
    label: sceneTitle(choice.scene),
    contextType: "tarot-draw-scene-choice",
    summary: choice.reason,
    cardId: choice.card.id,
    songId: choice.song.songId || choice.song.id,
    sourcePath: runId,
    createdAt: now,
    updatedAt: now
  }))).slice(0, 260);

  avatar.mind.genesisRuns = upsertById(avatar.mind.genesisRuns || [], {
    id: `${runId}:${avatar.id}`,
    runId,
    kind: "avatar-genesis-tarot-draw-enrichment",
    runAt: now,
    choices: choices.length,
    eligibleLoopCount: loopCount,
    loopPoolPolicy: "full pool, bounded runtime queue",
    source: "scripts/run-avatar-genesis-tarot-draw-enrichment.mjs"
  }).slice(0, 80);

  avatar.updatedAt = now;
}

function tarotLink({ id, avatar, card, scene, song, why, sourcePath, now }) {
  return {
    id,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    songId: song.songId || song.id,
    songCardId: song.id,
    songTitle: songTitle(song),
    sceneId: scene.id,
    sceneTitle: sceneTitle(scene),
    cardId: card.id,
    choiceId: id,
    sourceChoiceId: id,
    tarotType: card.tarotCard?.identity?.tarotType || card.tarotCard?.title || cardTitle(card),
    functionalType: card.tarotCard?.typeDetails?.functionalType || card.cardType || "",
    why,
    whyChosen: why,
    canonReason: "Soft-canon avatar genesis selection.",
    objectiveFit: "Tarot Draw card, scene, song, and avatar loop can be surfaced together.",
    deckInfluence: "Avatar-selected Tarot Draw relationship.",
    futureInfluence: "Eligible for rotating avatar loop playback.",
    vibe: song.lore?.mood || song.performancePerspective?.teamColor || "",
    notes: "Generated by avatar genesis Tarot Draw enrichment.",
    sourcePath,
    confidence: "generated",
    createdAt: now,
    updatedAt: now
  };
}

function mediaLinkFromLoop(loop, choiceId, reason) {
  return {
    id: `${choiceId}-loop-${slugify(loop.id || loop.uri)}`,
    videoAssetId: loop.id || "",
    videoUri: loop.uri || "",
    posterUri: thumbnailUriForAsset(loop),
    imageUri: thumbnailUriForAsset(loop),
    confidence: "generated",
    reason
  };
}

function findMatchingTarotCard(itemCard, tarotByTitle, tarotCards, seed) {
  const titleKeys = uniqueTextList([
    itemCard.tarotCard?.title,
    itemCard.tarotCard?.identity?.tarotCardName,
    itemCard.title,
    itemCard.name
  ]).map(slugify);
  for (const key of titleKeys) {
    if (tarotByTitle.has(key)) return tarotByTitle.get(key);
  }
  if (!tarotCards.length) return null;
  return tarotCards[stableNumber(seed) % tarotCards.length] || null;
}

function buildTarotTitleIndex(cards) {
  const index = new Map();
  for (const card of cards || []) {
    const keys = uniqueTextList([
      card.title,
      card.name,
      card.cardName,
      card.asset?.name,
      card.enrichment?.detectedTitle
    ]).map(slugify);
    for (const key of keys) {
      if (key && !index.has(key)) index.set(key, card);
    }
  }
  return index;
}

function itemVideoAssets(card = {}) {
  return (card.mediaAssets || []).filter((asset) => asset?.uri && (asset.type === "video" || /video\//.test(asset.metadata?.mimeType || "")));
}

function avatarVideoAssets(avatar = {}) {
  return (avatar.assets || [])
    .filter((asset) => asset?.uri && (asset.type === "video" || /video\//.test(asset.metadata?.mimeType || "")))
    .sort((a, b) =>
      loopRank(b) - loopRank(a) ||
      assetResolutionScore(b) - assetResolutionScore(a) ||
      compareText(a.name || a.id, b.name || b.id)
    );
}

function loopRank(asset = {}) {
  const tags = asset.tags || [];
  return (isRestoredLoopAsset(asset) ? 8 : 0) +
    (tags.includes("hero") ? 4 : 0) +
    (asset.requirementId === "loops" ? 3 : 0) +
    (asset.parentAssetId || asset.state?.startFrameAssetId ? 2 : 0) +
    (asset.requirementId === "video_reverse_loops" ? 1 : 0);
}

function isRestoredLoopAsset(asset = {}) {
  const haystack = searchableText([
    ...(asset.tags || []),
    asset.source,
    asset.requirementId,
    asset.metadata?.restoreRunId,
    asset.metadata?.restoredFrom,
    asset.metadata?.originalFileName,
    asset.metadata?.sourcePath,
    asset.notes
  ]);
  return /restore|restored|reattach|recovered|pinokio-history|media-library-relationship/.test(haystack);
}

function thumbnailUriForAsset(asset = {}) {
  return asset.metadata?.thumbnailUri ||
    asset.thumbnailUri ||
    asset.metadata?.thumbnail?.uri ||
    asset.thumbnail?.uri ||
    (asset.metadata?.frames || asset.state?.keyframes || asset.frames || []).find((frame) => frame?.uri)?.uri ||
    "";
}

function assetResolutionScore(asset = {}) {
  const width = Number(asset.width || asset.metadata?.width || asset.metadata?.naturalWidth || asset.processing?.width || 0);
  const height = Number(asset.height || asset.metadata?.height || asset.metadata?.naturalHeight || asset.processing?.height || 0);
  return width * height;
}

function normalizeConnections(connections = {}) {
  return {
    avatarIds: uniqueTextList(connections.avatarIds || connections.avatar_ids || []),
    sceneIds: uniqueTextList(connections.sceneIds || connections.scene_ids || []),
    itemIds: uniqueTextList(connections.itemIds || connections.item_ids || []),
    nodeIds: uniqueTextList(connections.nodeIds || connections.node_ids || []),
    placeIds: uniqueTextList(connections.placeIds || connections.place_ids || []),
    episodeIds: uniqueTextList(connections.episodeIds || connections.episode_ids || [])
  };
}

function avatarSearchTokens(avatar = {}) {
  return uniqueTextList([
    avatar.id,
    avatar.primaryName,
    avatar.name,
    avatar.title,
    avatar.slug,
    avatar.teamRole,
    avatar.mind?.gardenNodeAssignment?.role,
    avatar.mind?.shipCrewAssignment?.role,
    ...(avatar.aliases || []),
    ...(avatar.tags || [])
  ])
    .map((value) => value.toLowerCase())
    .filter((value) => value.length > 2);
}

function searchableText(parts = []) {
  return parts.flatMap((part) => {
    if (!part) return [];
    if (Array.isArray(part)) return part;
    if (typeof part === "object") return Object.values(part);
    return [part];
  }).join(" ").toLowerCase();
}

function cardTitle(card = {}) {
  return card.tarotCard?.title || card.shipCard?.title || card.title || card.name || card.id || "Tarot card";
}

function sceneTitle(scene = {}) {
  return scene.title || scene.name || scene.id || "Scene";
}

function songTitle(song = {}) {
  return song.title || song.name || song.songId || song.id || "Dear Papa song";
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.name || avatar.title || avatar.id || "Avatar";
}

function addUnique(list, value) {
  if (!value) return list;
  if (!list.includes(value)) list.push(value);
  return list;
}

function upsertManyById(list, entries, keyFn = (item) => item.id) {
  return entries.reduce((next, entry) => upsertById(next, entry, keyFn), list);
}

function upsertById(list = [], entry = {}, keyFn = (item) => item.id) {
  const key = keyFn(entry);
  if (!key) return [entry, ...list];
  const filtered = (list || []).filter((item) => keyFn(item) !== key);
  return [entry, ...filtered];
}

function uniqueBy(list = [], keyFn = (item) => item) {
  const seen = new Set();
  return list.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assetKey(asset = {}) {
  return asset.id || asset.uri || asset.name;
}

function uniqueTextList(list = []) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [list])
    .flat()
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function rotatingWindow(list = [], limit = 1, seed = "") {
  if (!list.length) return [];
  const count = Math.max(1, Math.min(limit, list.length));
  const offset = stableNumber(seed) % list.length;
  const result = [];
  for (let index = 0; index < list.length && result.length < count; index += 1) {
    result.push(list[(offset + index) % list.length]);
  }
  return result;
}

function stableNumber(value = "") {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function compareText(a = "", b = "") {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base", numeric: true });
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "item";
}

async function backupInputs(runId) {
  const backupDir = path.join(BACKUP_DIR, runId);
  await fs.mkdir(backupDir, { recursive: true });
  for (const filePath of Object.values(PATHS)) {
    if (!existsSync(filePath)) continue;
    await fs.copyFile(filePath, path.join(backupDir, path.basename(filePath)));
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
