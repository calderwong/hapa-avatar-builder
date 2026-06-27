#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { slugify } from "../src/domain/avatar.js";
import { normalizeItemManagerStore } from "../src/domain/item.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";

const PATHS = {
  avatarStore: path.join(DATA_DIR, "avatar-store.json"),
  itemStore: path.join(DATA_DIR, "item-manager-store.json"),
  songStore: path.join(DATA_DIR, "hapa-songs-store.json"),
  songbook: path.join(DATA_DIR, "dear-papa-songbook.json"),
  lorePlan: path.join(DATA_DIR, "lore-production-plan.json"),
  latestAudit: path.join(DATA_DIR, "healing-reports", "latest-avatar-card-song-lore-coverage.json")
};

await main();

async function main() {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  const runId = `recovered-roster-genesis-healing-${stamp}`;
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(RUN_DIR, { recursive: true });

  for (const filePath of [PATHS.avatarStore, PATHS.itemStore, PATHS.songStore, PATHS.lorePlan]) {
    if (existsSync(filePath)) {
      await fs.copyFile(filePath, path.join(BACKUP_DIR, `${path.basename(filePath, ".json")}.before-${runId}.json`));
    }
  }

  const avatarStore = await readJson(PATHS.avatarStore);
  const itemStore = await readJson(PATHS.itemStore);
  const songStore = await readJson(PATHS.songStore);
  const songbook = await readJson(PATHS.songbook);
  const lorePlan = existsSync(PATHS.lorePlan) ? await readJson(PATHS.lorePlan) : {};
  const latestAudit = existsSync(PATHS.latestAudit) ? await readJson(PATHS.latestAudit) : null;

  const avatars = avatarStore.avatars || [];
  const songs = songStore.songs || [];
  const songCards = songbook.songCards || [];
  const avatarById = new Map(avatars.map((avatar) => [avatar.id, avatar]));
  const songByKey = buildSongIndex(songs, songCards);
  const selectedSongByAvatar = new Map();
  const report = {
    schemaVersion: "hapa.recovered-roster-genesis-healing-report.v1",
    runId,
    runAt: now,
    source: "scripts/run-recovered-roster-genesis-healing-pass.mjs",
    recoveredMergeContext: recoveredContext(),
    inputCounts: {
      avatars: avatars.length,
      songs: songs.length,
      songbookCards: songCards.length,
      itemCards: (itemStore.cards || []).length,
      auditRunAt: latestAudit?.runAt || null
    },
    songTarotCards: {
      created: [],
      reused: []
    },
    avatars: [],
    songAttachmentUpdates: []
  };

  const songTarotCards = ensureSongTarotCards(itemStore, songs, avatarById, now, report);
  const songTarotBySongKey = buildSongTarotIndex(songTarotCards);

  for (let index = 0; index < avatars.length; index += 1) {
    const avatar = avatars[index];
    const before = summarizeAvatarState(avatar);
    const chosenSongs = chooseSongsForAvatar(avatar, songs, index);
    selectedSongByAvatar.set(avatar.id, chosenSongs);
    const chosenCards = chooseCardsForAvatar(avatar, itemStore.cards || [], chosenSongs, songTarotBySongKey, index);
    healAvatarMind(avatar, chosenSongs, chosenCards, runId, now);
    attachCardsToAvatar(itemStore.cards || [], avatar, chosenCards, chosenSongs, songTarotBySongKey, now);
    attachSongsToAvatar(songs, avatar, chosenSongs, runId, now, report);
    const after = summarizeAvatarState(avatar);
    report.avatars.push({
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      selectedSongs: chosenSongs.map((song) => ({ id: song.id, songId: song.songId, title: song.title })),
      selectedCards: chosenCards.map((card) => ({ id: card.id, title: card.title, cardType: card.cardType })),
      before,
      after
    });
  }

  avatarStore.avatars = avatars;
  avatarStore.updatedAt = now;
  avatarStore.recoveredRosterGenesisHealing = {
    schemaVersion: "hapa.avatar-store.recovered-roster-genesis-healing.v1",
    runId,
    runAt: now,
    playlistId: PLAYLIST_ID,
    avatarCount: avatars.length,
    songCount: songs.length,
    context: recoveredContext()
  };

  songStore.songs = songs;
  songStore.audit = auditSongs(songs);
  songStore.updatedAt = now;

  const normalizedItemStore = normalizeItemManagerStore({
    ...itemStore,
    updatedAt: now,
    auditRuns: [
      ...(itemStore.auditRuns || []),
      {
        id: runId,
        schemaVersion: "hapa.item-manager-audit-run.v1",
        kind: "recovered-roster-genesis-healing",
        generatedAt: now,
        avatarCount: avatars.length,
        songCount: songs.length,
        createdSongTarotCards: report.songTarotCards.created.length,
        source: "scripts/run-recovered-roster-genesis-healing-pass.mjs"
      }
    ]
  });

  const nextLorePlan = {
    ...lorePlan,
    recoveredRosterGenesisHealingPass: {
      schemaVersion: "hapa.lore-production.recovered-roster-genesis-healing.v1",
      runId,
      runAt: now,
      avatarCount: avatars.length,
      songCount: songs.length,
      songTarotCardsCreated: report.songTarotCards.created.length,
      context: recoveredContext(),
      reports: {
        run: path.relative(ROOT, path.join(RUN_DIR, `${runId}.json`)),
        latest: path.relative(ROOT, path.join(RUN_DIR, "latest-recovered-roster-genesis-healing.json"))
      }
    },
    updatedAt: now
  };

  report.outputCounts = {
    avatars: avatars.length,
    songs: songs.length,
    songsWithAvatarLinks: songs.filter((song) => (song.attachments?.avatarLinks || []).length > 0).length,
    itemCards: normalizedItemStore.cards.length,
    songTarotItemCards: normalizedItemStore.cards.filter((card) => card.cardType === "song_tarot_card").length,
    avatarsWithDearPapaSelections: avatars.filter((avatar) => (avatar.mind?.dearPapaSongContext?.selectedSongCards || []).length > 0).length,
    avatarsWithTarotDeck: avatars.filter((avatar) => (avatar.mind?.tarotCardDeck || []).length > 0).length,
    avatarsWithGenesisRun: avatars.filter((avatar) => (avatar.mind?.genesisRuns || []).some((run) => run.id === runId)).length
  };

  await writeJson(PATHS.avatarStore, avatarStore);
  await writeJson(PATHS.itemStore, normalizedItemStore);
  await writeJson(PATHS.songStore, songStore);
  await writeJson(PATHS.lorePlan, nextLorePlan);
  const runPath = path.join(RUN_DIR, `${runId}.json`);
  const latestPath = path.join(RUN_DIR, "latest-recovered-roster-genesis-healing.json");
  await writeJson(runPath, report);
  await writeJson(latestPath, report);

  console.log(JSON.stringify({
    ok: true,
    runId,
    reportPath: path.relative(ROOT, latestPath),
    avatars: report.outputCounts.avatars,
    songs: report.outputCounts.songs,
    songTarotCardsCreated: report.songTarotCards.created.length,
    songTarotItemCards: report.outputCounts.songTarotItemCards,
    avatarsWithDearPapaSelections: report.outputCounts.avatarsWithDearPapaSelections,
    avatarsWithGenesisRun: report.outputCounts.avatarsWithGenesisRun
  }, null, 2));
}

function ensureSongTarotCards(itemStore, songs, avatarById, now, report) {
  itemStore.cards = itemStore.cards || [];
  const existingBySong = buildExistingSongCardIndex(itemStore.cards);
  const createdOrReused = [];
  const usedIds = new Set(itemStore.cards.map((card) => card.id));

  for (let index = 0; index < songs.length; index += 1) {
    const song = songs[index];
    const key = songKey(song);
    const existing = findExistingSongTarotCard(song, existingBySong);
    if (existing) {
      enrichSongTarotCard(existing, song, choosePrimaryAvatarForSong(song, avatarById, index), now);
      report.songTarotCards.reused.push({ id: existing.id, songId: song.songId, title: existing.title });
      createdOrReused.push(existing);
      continue;
    }
    const avatar = choosePrimaryAvatarForSong(song, avatarById, index);
    const id = uniqueId(`song-tarot-${slugify(song.songId || song.title || key)}`, usedIds);
    const card = createSongTarotCard(id, song, avatar, index, now);
    itemStore.cards.push(card);
    existingBySong.set(key, card);
    for (const extraKey of allSongKeys(song)) existingBySong.set(extraKey, card);
    usedIds.add(id);
    report.songTarotCards.created.push({ id, songId: song.songId, title: song.title, avatarId: avatar?.id || "" });
    createdOrReused.push(card);
  }
  return createdOrReused;
}

function createSongTarotCard(id, song, avatar, index, now) {
  const color = song.performancePerspective?.teamColor || song.performancePerspective?.team_color || laneForAvatar(avatar, index);
  const registryTrackId = song.audio?.registryTrackId || song.registryTrackId || song.lineage?.registryTrackId || "";
  const avatarId = avatar?.id || "";
  const avatarDisplayName = avatarName(avatar);
  const summary = `${song.title} is a recovered Dear Papa song tarot card. It keeps the Suno registry track, local audio/stem lineage, and avatar performance perspective attached to the playable 3D Tarot deck.`;
  return {
    id,
    schemaVersion: "hapa.item-card.v1",
    cardType: "song_tarot_card",
    kind: "object",
    title: song.title,
    name: song.title,
    status: "active",
    canonStatus: "soft_canon",
    summary,
    description: `${avatarDisplayName} uses this song as recovered soft canon: a source-traceable Dear Papa track that can become card draw, visualizer prompt, and relationship scene fuel.`,
    lore: song.lore?.summary || summary,
    utility: ["song-card", "tarot-draw", "dear-papa-visualizer", "avatar-genesis"],
    broadGameMechanics: [
      "Draw the song, name the singer perspective, cite the registry track, and attach one repair/action reason.",
      "Use stems and lyrics as media-generation fuel without changing album authorship."
    ],
    tags: unique(["tarot-card", "song-card", "song-tarot-card", "dear-papa", "recovered-roster-genesis", color]),
    rank: "generated",
    quality: {
      canonStatus: "soft_canon",
      confidence: "generated",
      sourceCompleteness: registryTrackId ? "registry-linked" : "song-store-linked"
    },
    connections: {
      avatarIds: avatarId ? [avatarId] : [],
      teamIds: [song.performancePerspective?.teamId || song.performancePerspective?.team_id || ""].filter(Boolean),
      placeIds: [],
      sceneIds: [],
      episodeIds: [],
      volumeIds: [],
      itemIds: unique([song.id, song.cardId, song.songId, registryTrackId].filter(Boolean)),
      nodeIds: ["hapa-song-registry", "hapa-music-viz"],
      shipIds: []
    },
    mediaPrompts: {
      heroImage: `Dear Papa song tarot card for ${song.title}; show ${avatarDisplayName} holding the recovered source path as playable soft canon.`,
      twoD: `Illustrate ${song.title} as a clean card face with ${color || "Hapa"} performance perspective, source-line motifs, and visualizer-ready negative space.`,
      threeD: `Turn ${song.title} into a 3D Tarot draw card with audio-reactive edge light and stem lanes.`,
      comicPanel: `A quiet panel where ${avatarDisplayName} chooses ${song.title} as evidence, promise, and repair route.`,
      explainerVideo: `Show the local audio, stems, lyrics, avatar, and tarot card linking together for ${song.title}.`,
      wikiEntry: `Document ${song.title} as a Dear Papa recovered song card linked to ${avatarDisplayName}.`,
      negativePrompt: "Do not imply a different album author; preserve Calder authorship and soft-canon review boundary."
    },
    sourceRefs: [
      {
        id: `song-store-${song.id}`,
        title: song.title,
        kind: "hapa-song-store",
        path: "data/hapa-songs-store.json",
        confidence: "hard"
      }
    ],
    mediaAssets: song.audio?.coverUri ? [
      {
        id: `${id}-cover`,
        title: `${song.title} cover`,
        type: "image",
        uri: song.audio.coverUri,
        tags: ["cover", "dear-papa", "song-card"],
        confidence: "soft",
        notes: "Suno/registry cover proxy for local Dear Papa track."
      }
    ] : [],
    tarotCard: {
      schemaVersion: "hapa.tarot-card-details.v1",
      mainType: "song_tarot_card",
      tarotNumber: String(index + 1),
      title: song.title,
      subtitle: "Dear Papa Song",
      archetype: `${titleCase(color || "Hapa")} song signal`,
      keywords: unique(["dear-papa", "song", "stems", "visualizer", "soft-canon", color, ...tagList(song).slice(0, 4)]),
      flavorText: "Recovered media becomes playable only when the source path remains visible.",
      effectTitle: "Source-Sung Draw",
      effectText: "When drawn, attach the song to an avatar, cite the registry track, and choose the next repair or relationship beat.",
      catalog: {
        collectionId: "dear-papa-song-tarot",
        collectionTitle: "Dear Papa Song Tarot",
        family: "Dear Papa Tarot",
        typeLabel: "Song Tarot Card",
        sequence: index + 1,
        sourceFolder: "data/hapa-songs-store.json",
        confidence: "generated"
      },
      identity: {
        systemName: "Hapa Tarot System",
        deckName: "Dear Papa Song Tarot",
        tarotType: song.title,
        tarotCardName: song.title,
        printedTitle: song.title,
        displayTitle: song.title,
        functionalType: "Song",
        functionalTypeSlug: "song",
        cardTypeName: "Song Tarot Card",
        confidence: "generated"
      },
      cardFace: {
        titleLine: song.title,
        subtitleLine: "Dear Papa",
        typeLine: "Song Tarot",
        keywordLine: unique(["source", "stems", color || "hapa"]).join(" / "),
        coreMeaning: summary,
        uprightText: "A recovered song becomes an action, scene, or vow because its source path is intact.",
        invertedText: "A song without links becomes atmosphere without canon.",
        mechanicsText: "Name the avatar, cite the registry track, then choose a card or scene to carry the song.",
        visualLanguageText: "Audio-reactive light, source lines, stem lanes, and album-cover recall."
      },
      attribution: {
        author: "Calder",
        shop: "Mimi's Card Shop",
        albumTitle: "Dear Papa",
        rightsStatus: "operator_authored_hapa_creative_commons",
        sourceTool: "scripts/run-recovered-roster-genesis-healing-pass.mjs",
        sourcePaths: ["data/hapa-songs-store.json", "data/dear-papa-songbook.json"],
        notes: "Avatar performance perspective does not change album authorship."
      },
      mechanics: {
        broadGameMechanic: "Draw as a source-sung song card for avatar Genesis, visualizer routing, and repair/action scene selection.",
        deckUse: "3D Tarot song deck",
        surfaceUse: "Song library and Dear Papa visualizer",
        relationshipUse: "Avatar-to-song canon prompt",
        effects: ["attach song to avatar", "route stems to visualizer", "name one repair/action beat"],
        limits: ["soft canon until human review", "do not alter Calder authorship"]
      },
      lore: {
        summary,
        canonStatus: "soft_canon",
        characterHooks: avatarId ? [`${avatarDisplayName} performance perspective`] : [],
        relationshipHooks: song.performancePerspective?.relationshipFocus || [],
        protocolTeaching: "Recovered media needs source path, avatar purpose, and repair boundary.",
        futureSeed: "Promote to hard canon only after human review.",
        sourceClaims: unique([song.id, song.songId, registryTrackId].filter(Boolean))
      },
      songLinks: [
        {
          id: `song-link-${id}`,
          songId: song.songId || song.id,
          songCardId: song.id,
          registryTrackId,
          songTitle: song.title,
          avatarId,
          avatarName: avatarDisplayName,
          role: "source-song",
          why: `${avatarDisplayName} anchors ${song.title} as recovered Dear Papa soft canon.`
        }
      ],
      sceneLinks: [],
      avatarLoreLinks: avatarId ? [
        {
          id: `avatar-link-${id}-${avatarId}`,
          avatarId,
          avatarName: avatarDisplayName,
          role: "performance-perspective",
          why: "Primary avatar anchor for this recovered song card."
        }
      ] : [],
      mediaLinks: [],
      ocr: {}
    },
    history: [
      {
        id: `history-${id}`,
        event: "created",
        at: now,
        actor: "recovered-roster-genesis-healing-pass",
        note: "Created song tarot card from synced Dear Papa song store."
      }
    ],
    equipment: {},
    createdAt: now,
    updatedAt: now
  };
}

function enrichSongTarotCard(card, song, avatar, now) {
  card.connections = card.connections || {};
  card.connections.avatarIds = unique([...(card.connections.avatarIds || []), avatar?.id].filter(Boolean));
  card.connections.itemIds = unique([...(card.connections.itemIds || []), ...allSongKeys(song)]);
  card.connections.nodeIds = unique([...(card.connections.nodeIds || []), "hapa-song-registry", "hapa-music-viz"]);
  card.tags = unique([...(card.tags || []), "song-card", "dear-papa", "recovered-roster-genesis"]);
  card.tarotCard = card.tarotCard || {};
  card.tarotCard.songLinks = uniqueBy([
    ...(card.tarotCard.songLinks || []),
    {
      id: `song-link-${card.id}-${song.songId || song.id}`,
      songId: song.songId || song.id,
      songCardId: song.id,
      registryTrackId: song.audio?.registryTrackId || song.registryTrackId || song.lineage?.registryTrackId || "",
      songTitle: song.title,
      avatarId: avatar?.id || "",
      avatarName: avatarName(avatar),
      role: "source-song",
      why: `${avatarName(avatar)} keeps ${song.title} linked to the recovered Dear Papa registry track.`
    }
  ], (link) => link.songCardId || link.songId || link.id);
  card.tarotCard.avatarLoreLinks = uniqueBy([
    ...(card.tarotCard.avatarLoreLinks || []),
    avatar?.id ? {
      id: `avatar-link-${card.id}-${avatar.id}`,
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      role: "performance-perspective",
      why: "Recovered-roster Genesis primary avatar anchor."
    } : null
  ].filter(Boolean), (link) => link.avatarId || link.id);
  card.updatedAt = now;
}

function healAvatarMind(avatar, chosenSongs, chosenCards, runId, now) {
  avatar.mind = avatar.mind || {};
  const mind = avatar.mind;
  const name = avatarName(avatar);
  const lane = laneForAvatar(avatar);
  mind.schemaVersion = mind.schemaVersion || "hapa.avatar-mind.v1";
  mind.personaAnchor = {
    identityStatement: mind.personaAnchor?.identityStatement || `${name} is a recovered Hapa avatar whose canon must preserve source path, team purpose, and repair boundary.`,
    wants: mind.personaAnchor?.wants || "To become useful, source-traceable, and emotionally coherent inside the restored Hapa roster.",
    fears: mind.personaAnchor?.fears || "Being present in the roster without enough lore, cards, songs, or relationships to act consistently.",
    misunderstandings: mind.personaAnchor?.misunderstandings || "May treat recovered soft canon as final before human review.",
    willNotSayDirectly: mind.personaAnchor?.willNotSayDirectly || "The merge made continuity precious because divergence already happened once.",
    carriedForward: appendSentence(
      mind.personaAnchor?.carriedForward || "",
      "Recovered-roster Genesis pass acknowledges the duplicate Pinokio/3D Tarot split was merged back into the canonical app; preserve IDs and treat new fills as soft canon pending human review."
    ),
    updatedAt: now
  };
  mind.soulSeed = mind.soulSeed || {
    schemaVersion: "hapa.avatar-soul-seed.v1",
    avatarId: avatar.id,
    avatarName: name,
    runId,
    soulThesis: `${name} exists to keep ${lane} lane choices playable, sourced, and repairable after the roster recovery.`,
    publicConcept: `${name} is a Hapa avatar restored into the canonical 3D Tarot build with song, card, and lore links.`,
    privateTruth: "Continuity is a promise, not just a data shape.",
    formativeWound: "A duplicate app split made the roster feel present but partially disconnected.",
    coreWant: "Consistent canon, useful relationships, and a clear card/song loadout.",
    coreFear: "Silent divergence between avatar, card, song, and lore stores.",
    contradiction: "Recovered canon can be true enough to guide play while still needing review.",
    identitySignals: [lane, "recovered-roster", "soft-canon", "source-path"],
    canonBoundaryNotes: ["Generated Genesis details remain soft canon until promoted.", "Existing IDs and human-authored lore take priority."],
    source: { runId, sourcePath: "scripts/run-recovered-roster-genesis-healing-pass.mjs" },
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  mind.dearPapaSongContext = {
    ...(mind.dearPapaSongContext || {}),
    schemaVersion: "hapa.avatar-dear-papa-song-context.v1",
    albumId: "dear-papa-album",
    albumTitle: "Dear Papa",
    author: "Calder",
    authorshipRule: "Album authorship is Calder; avatar performance perspectives are in-universe lore lenses.",
    loreStatus: "hapa_lore_not_hard_canon",
    perspectiveRule: "Each song selection is recovered soft canon until human review.",
    performancePerspective: mind.dearPapaSongContext?.performancePerspective || perspectiveForLane(lane, avatar),
    selectedSongCards: uniqueBy([
      ...(mind.dearPapaSongContext?.selectedSongCards || []),
      ...chosenSongs.map((song) => songChoiceForAvatar(avatar, song, runId, now))
    ], (choice) => choice.cardId || choice.songId),
    relationshipPrompts: uniqueBy([
      ...(mind.dearPapaSongContext?.relationshipPrompts || []),
      relationshipPromptForAvatar(avatar, chosenSongs, runId, now)
    ], (prompt) => prompt.id),
    sourceAnchors: unique([...(mind.dearPapaSongContext?.sourceAnchors || []), "data/dear-papa-songbook.json", "data/hapa-songs-store.json", `suno-playlist:${PLAYLIST_ID}`]),
    songCardIndexPath: "data/dear-papa-songbook.json",
    rawCardManifestPath: "/Users/calderwong/Desktop/suno-library/playlists/369daf97-0e07-4c49-a7a2-2a6f0b18353b/manifest.json",
    genesisUse: unique([...(mind.dearPapaSongContext?.genesisUse || []), "Recovered-roster Genesis pass uses the 79-song Dear Papa playlist as soft-canon relationship fuel."]),
    status: "active",
    updatedAt: now
  };
  mind.selfKnowledge = uniqueBy([
    ...(mind.selfKnowledge || []),
    {
      id: `${avatar.id}-recovered-roster-context`,
      fact: `${name} was reviewed in the recovered-roster Genesis pass after the duplicate Pinokio/3D Tarot split was merged back into the canonical app.`,
      classification: "generated",
      confidence: "generated",
      visibility: "shared",
      source: "scripts/run-recovered-roster-genesis-healing-pass.mjs",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (fact) => fact.id || fact.fact);
  mind.contextMap = uniqueBy([
    ...(mind.contextMap || []),
    {
      id: `${avatar.id}-canonical-recovery-context`,
      contextId: "canonical-avatar-builder-recovered-merge-2026-06-23",
      label: "Canonical Avatar Builder recovered merge",
      kind: "canon",
      avatarBelief: "The roster was put back together; my new song/card/lore links are source-traceable soft canon until reviewed.",
      publicSummary: "Recovered merge context for Avatar/Card/Song/Lore healing.",
      classification: "generated",
      confidence: "generated",
      visibility: "shared",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (context) => context.id || context.contextId);
  mind.memoryLedger = uniqueBy([
    ...(mind.memoryLedger || []),
    {
      memoryId: `${avatar.id}-merge-healing-memory`,
      summary: `${name} remembers the app recovery as a continuity event: songs, cards, lore, and avatar identity must now cite each other.`,
      emotionalWeight: 4,
      visibility: "shared",
      confidence: "generated",
      classification: "memory_delta",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (memory) => memory.memoryId || memory.id);
  mind.tarotCardDeck = uniqueBy([
    ...(mind.tarotCardDeck || []),
    ...chosenCards.map((card) => tarotChoiceForAvatar(avatar, card, chosenSongs[0], runId, now))
  ], (choice) => choice.cardId || choice.id);
  mind.genesisRuns = uniqueBy([
    ...(mind.genesisRuns || []),
    {
      id: runId,
      schemaVersion: "hapa.avatar-genesis-run.v1",
      runType: "recovered-roster-genesis-healing",
      title: "Recovered Roster Genesis Healing Pass",
      sourcePath: "scripts/run-recovered-roster-genesis-healing-pass.mjs",
      summary: `${name} received recovered-merge-aware song, tarot, lore, memory, and context links.`,
      canonStatus: "soft_canon",
      reviewedInputs: ["data/avatar-store.json", "data/hapa-songs-store.json", "data/item-manager-store.json", "data/dear-papa-songbook.json"],
      outputRefs: chosenCards.map((card) => card.id),
      songIds: chosenSongs.map((song) => song.songId || song.id),
      status: "complete",
      createdAt: now,
      updatedAt: now
    }
  ], (run) => run.id);
  mind.updatedAt = now;
  avatar.updatedAt = now;
}

function chooseSongsForAvatar(avatar, songs, index) {
  const lane = laneForAvatar(avatar, index);
  const existingIds = new Set((avatar.mind?.dearPapaSongContext?.selectedSongCards || []).map((choice) => choice.songId).filter(Boolean));
  const directlyLinked = songs.filter((song) => (song.attachments?.avatarLinks || []).some((link) => link.avatarId === avatar.id));
  const laneLinked = songs.filter((song) => (song.performancePerspective?.teamColor || "").toLowerCase() === lane);
  const stable = songs.slice().sort((a, b) => stableNumber(`${avatar.id}:${a.id}`) - stableNumber(`${avatar.id}:${b.id}`));
  const picks = uniqueBy([
    ...songs.filter((song) => existingIds.has(song.songId || song.id)),
    ...directlyLinked,
    ...laneLinked,
    ...stable
  ], (song) => song.id || song.songId);
  return picks.slice(0, 3);
}

function chooseCardsForAvatar(avatar, cards, chosenSongs, songTarotBySongKey, index) {
  const direct = cards.filter((card) => (card.connections?.avatarIds || []).includes(avatar.id));
  const songCards = chosenSongs.map((song) => songTarotBySongKey.get(songKey(song))).filter(Boolean);
  const nameKey = slugify(avatarName(avatar));
  const nameMatched = cards.filter((card) => `${card.title || ""} ${(card.tags || []).join(" ")} ${card.summary || ""}`.toLowerCase().includes(nameKey.replace(/-/g, " ")));
  const drawable = cards.filter((card) => card.tarotCard || (card.tags || []).includes("tarot-card"));
  const stable = drawable.slice().sort((a, b) => stableNumber(`${avatar.id}:${a.id}:${index}`) - stableNumber(`${avatar.id}:${b.id}:${index}`));
  return uniqueBy([...songCards, ...direct, ...nameMatched, ...stable], (card) => card.id).slice(0, 5);
}

function attachCardsToAvatar(cards, avatar, chosenCards, chosenSongs, songTarotBySongKey, now) {
  const chosenSongIds = new Set(chosenSongs.flatMap((song) => [...allSongKeys(song)]));
  for (const card of chosenCards) {
    card.connections = card.connections || {};
    card.connections.avatarIds = unique([...(card.connections.avatarIds || []), avatar.id]);
    card.updatedAt = now;
    if (card.cardType === "song_tarot_card") {
      card.tarotCard = card.tarotCard || {};
      card.tarotCard.avatarLoreLinks = uniqueBy([
        ...(card.tarotCard.avatarLoreLinks || []),
        {
          id: `avatar-link-${card.id}-${avatar.id}`,
          avatarId: avatar.id,
          avatarName: avatarName(avatar),
          role: "selected-by-avatar",
          why: "Avatar selected this recovered Dear Papa song/card during Genesis healing."
        }
      ], (link) => link.avatarId || link.id);
    }
  }
  for (const song of chosenSongs) {
    const card = songTarotBySongKey.get(songKey(song));
    if (!card) continue;
    card.connections = card.connections || {};
    card.connections.avatarIds = unique([...(card.connections.avatarIds || []), avatar.id]);
    card.connections.itemIds = unique([...(card.connections.itemIds || []), ...chosenSongIds]);
    card.updatedAt = now;
  }
}

function attachSongsToAvatar(songs, avatar, chosenSongs, runId, now, report) {
  const chosenIds = new Set(chosenSongs.map((song) => song.id));
  for (const song of songs) {
    if (!chosenIds.has(song.id)) continue;
    song.attachments = song.attachments || {};
    song.attachments.avatarLinks = uniqueBy([
      ...(song.attachments.avatarLinks || []),
      {
        avatarId: avatar.id,
        avatarName: avatarName(avatar),
        role: "recovered-roster-genesis-selection",
        reason: `${avatarName(avatar)} selected ${song.title} during recovered-roster Genesis healing.`,
        tags: ["dear-papa", "recovered-roster-genesis", laneForAvatar(avatar)],
        linkedAt: now
      }
    ], (link) => link.avatarId || link.avatarName);
    song.updatedAt = now;
    report.songAttachmentUpdates.push({ songId: song.songId || song.id, avatarId: avatar.id });
  }
}

function songChoiceForAvatar(avatar, song, runId, now) {
  return {
    id: `${avatar.id}-dear-papa-${slugify(song.songId || song.title)}`,
    schemaVersion: "hapa.avatar-dear-papa-song-choice.v1",
    songId: song.songId || song.id,
    cardId: song.cardId || song.id,
    title: song.title,
    albumId: "dear-papa-album",
    author: "Calder",
    perspective: song.performancePerspective || perspectiveForLane(laneForAvatar(avatar), avatar),
    whySelected: `${avatarName(avatar)} uses ${song.title} as recovered soft canon to connect song, card, and lore after the app merge.`,
    genesisInstruction: "Use the song only with source path, authorship, and review boundary visible.",
    communicationUse: "Relationship prompt, card draw cue, visualizer seed, and memory continuity check.",
    lyricsSha256: song.lyrics?.sha256 || "",
    sourcePath: "data/hapa-songs-store.json",
    sourceRunId: runId,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function relationshipPromptForAvatar(avatar, songs, runId, now) {
  return {
    id: `${avatar.id}-recovered-song-relationship-prompt`,
    targetAvatarId: "",
    targetName: "Recovered roster",
    relationLabel: "songbook-continuity",
    prompt: `${avatarName(avatar)} should explain how ${songs.map((song) => song.title).join(", ")} helps the restored roster keep song, card, lore, and avatar identity in sync.`,
    songIds: songs.map((song) => song.songId || song.id),
    classification: "perspective",
    confidence: "generated",
    status: "active",
    sourceRunId: runId,
    createdAt: now,
    updatedAt: now
  };
}

function tarotChoiceForAvatar(avatar, card, song, runId, now) {
  return {
    id: `${avatar.id}-tarot-${slugify(card.id)}`,
    schemaVersion: "hapa.avatar-tarot-card-choice.v1",
    cardId: card.id,
    cardTitle: card.tarotCard?.title || card.title,
    cardType: card.cardType || "hapa_tarot_card",
    tarotMainType: card.tarotCard?.mainType || card.cardType || "hapa_tarot_card",
    role: card.cardType === "song_tarot_card" ? "song-card-anchor" : "recovered-roster-anchor",
    whyChosen: `${avatarName(avatar)} uses ${card.title} to make recovered roster canon playable and traceable.`,
    canonReason: "Generated as soft canon during recovered-roster Genesis healing.",
    loreContext: recoveredContext(),
    objectiveFit: "Connect avatar identity to cards, Dear Papa songs, and source-aware action.",
    deckInfluence: "Adds a drawable card choice with song/lore context.",
    futureInfluence: "Human review can promote, swap, or refine this choice.",
    songId: song?.songId || song?.id || "",
    songTitle: song?.title || "",
    songWhy: song ? `${song.title} provides the music/lore lens for this tarot choice.` : "",
    vibe: laneForAvatar(avatar),
    sourcePath: "scripts/run-recovered-roster-genesis-healing-pass.mjs",
    confidence: "generated",
    status: "active",
    createdAt: now,
    updatedAt: now,
    sourceRunId: runId
  };
}

function buildExistingSongCardIndex(cards) {
  const index = new Map();
  for (const card of cards) {
    if (card.cardType !== "song_tarot_card" && !(card.tags || []).includes("song-card")) continue;
    for (const key of [
      card.songId,
      card.registryTrackId,
      ...(card.connections?.itemIds || []),
      ...((card.tarotCard?.songLinks || []).flatMap((link) => [link.songId, link.songCardId, link.registryTrackId, link.songTitle ? slugify(link.songTitle) : ""]))
    ].filter(Boolean)) {
      if (!index.has(key)) index.set(key, card);
    }
  }
  return index;
}

function findExistingSongTarotCard(song, index) {
  for (const key of allSongKeys(song)) {
    if (index.has(key)) return index.get(key);
  }
  return null;
}

function buildSongTarotIndex(cards) {
  const index = new Map();
  for (const card of cards) {
    const keys = [
      ...(card.connections?.itemIds || []),
      ...((card.tarotCard?.songLinks || []).flatMap((link) => [link.songId, link.songCardId, link.registryTrackId, link.songTitle ? slugify(link.songTitle) : ""]))
    ].filter(Boolean);
    for (const key of keys) index.set(key, card);
  }
  return index;
}

function buildSongIndex(songs, songCards) {
  const index = new Map();
  for (const song of [...songs, ...songCards]) {
    for (const key of allSongKeys(song)) index.set(key, song);
  }
  return index;
}

function choosePrimaryAvatarForSong(song, avatarById, index) {
  const perspectiveId = song.performancePerspective?.avatarId || song.performancePerspective?.avatar_id;
  if (perspectiveId && avatarById.has(perspectiveId)) return avatarById.get(perspectiveId);
  for (const link of song.attachments?.avatarLinks || []) {
    if (avatarById.has(link.avatarId)) return avatarById.get(link.avatarId);
  }
  const fallbackIds = ["avatar-2", "red-reaper", "avatar-3"];
  return avatarById.get(fallbackIds[index % fallbackIds.length]) || [...avatarById.values()][index % Math.max(avatarById.size, 1)] || null;
}

function perspectiveForLane(lane, avatar) {
  const map = {
    red: {
      teamColor: "red",
      teamId: "red-team",
      avatarId: avatar?.id || "red-reaper",
      avatarName: avatarName(avatar),
      voiceFunction: "protection, fire-control, pressure, rollback, and repair",
      relationshipFocus: ["protection", "pressure", "repair"]
    },
    blue: {
      teamColor: "blue",
      teamId: "blue-team",
      avatarId: avatar?.id || "avatar-2",
      avatarName: avatarName(avatar),
      voiceFunction: "source path, memory, signal, and return-route intelligence",
      relationshipFocus: ["truth filtering", "lineage", "route home"]
    },
    green: {
      teamColor: "green",
      teamId: "green-team",
      avatarId: avatar?.id || "avatar-3",
      avatarName: avatarName(avatar),
      voiceFunction: "stakeholder care, embodiment, delivery, and repair loop",
      relationshipFocus: ["care", "stakeholders", "repair loop"]
    }
  };
  return map[lane] || map.blue;
}

function laneForAvatar(avatar = {}, index = 0) {
  const text = `${avatar.id || ""} ${avatarName(avatar)} ${avatar.teamId || avatar.team || ""} ${avatar.mind?.gardenNodeAssignment?.teamId || ""}`.toLowerCase();
  if (text.includes("red")) return "red";
  if (text.includes("green")) return "green";
  if (text.includes("blue")) return "blue";
  return ["blue", "red", "green"][index % 3];
}

function auditSongs(songs) {
  return {
    songs: songs.length,
    withLyrics: songs.filter((song) => Boolean(song.lyrics?.text)).length,
    withTimings: songs.filter((song) => (song.lyricTimings || []).length > 0).length,
    withAudio: songs.filter((song) => Boolean(song.audio?.mp3Uri || song.audio?.localPath)).length,
    withStems: songs.filter((song) => (song.stems || []).length > 0).length,
    withAvatars: songs.filter((song) => (song.attachments?.avatarLinks || []).length > 0).length,
    withScenes: songs.filter((song) => (song.attachments?.sceneLinks || []).length > 0).length,
    withMedia: songs.filter((song) => (song.media || []).length > 0).length,
    withVisualizers: songs.filter((song) => (song.visualizers || []).length > 0).length,
    storyBeatCount: songs.reduce((sum, song) => sum + (song.storyBeats || []).length, 0),
    readyForBuilder: songs.length > 0
  };
}

function summarizeAvatarState(avatar) {
  return {
    selectedSongs: (avatar.mind?.dearPapaSongContext?.selectedSongCards || []).length,
    tarotDeck: (avatar.mind?.tarotCardDeck || []).length,
    selfKnowledge: (avatar.mind?.selfKnowledge || []).length,
    contextMap: (avatar.mind?.contextMap || []).length,
    memoryLedger: (avatar.mind?.memoryLedger || []).length,
    genesisRuns: (avatar.mind?.genesisRuns || []).length
  };
}

function allSongKeys(song = {}) {
  return unique([
    song.id,
    song.cardId,
    song.songId,
    song.registryTrackId,
    song.audio?.registryTrackId,
    song.lineage?.registryTrackId,
    song.title ? slugify(song.title) : ""
  ].filter(Boolean));
}

function tagList(song = {}) {
  if (Array.isArray(song.tags)) return song.tags;
  if (typeof song.tags === "string") return song.tags.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function songKey(song = {}) {
  return song.id || song.cardId || song.songId || song.audio?.registryTrackId || slugify(song.title || "song");
}

function avatarName(avatar = {}) {
  return avatar?.primaryName || avatar?.name || avatar?.names?.[0]?.name || avatar?.id || "Avatar";
}

function recoveredContext() {
  return "The Avatar Builder roster was put back together after a duplicate Pinokio/3D Tarot split. Preserve recovered IDs, cross-link avatars/cards/songs/lore, and keep newly generated canon as soft canon until human review.";
}

function appendSentence(text, sentence) {
  if (String(text || "").includes(sentence)) return text || sentence;
  return [text, sentence].filter(Boolean).join(" ");
}

function titleCase(value = "") {
  return String(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values, getKey) {
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

function uniqueId(base, used) {
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function stableNumber(value) {
  return Number.parseInt(crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8), 16);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
