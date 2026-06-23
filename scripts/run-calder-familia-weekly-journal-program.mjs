#!/usr/bin/env node
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";
import { normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";

const DATA_DIR = "data";
const PROGRAM_DIR = path.join(DATA_DIR, "calder-familia-weekly-journals");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const KANBAN_PATH = path.join(DATA_DIR, "kanban.json");
const CONTRACT_PATH = path.join(DATA_DIR, "avatar-agent-contract.json");
const LORE_PLAN_PATH = path.join(DATA_DIR, "lore-production-plan.json");
const LAST_LIGHT_PACKET_PATH = path.join(DATA_DIR, "last-light-archive", "last-light-archive-packet.json");
const LIFE_TIMELINE_PATH = path.join(DATA_DIR, "avatar-life-journal-timeline", "life-journal-timeline.json");
const LIFE_SAGA_PATH = path.join(DATA_DIR, "avatar-life-journal-timeline", "lorekeeper-life-saga-consolidation.json");
const PROGRAM_PATH = path.join(PROGRAM_DIR, "weekly-journal-program.json");
const WEEKLY_BACKLOG_PATH = path.join(PROGRAM_DIR, "weekly-journal-backlog.json");
const DIGEST_PATH = path.join(PROGRAM_DIR, "calder-familia-weekly-journal-digest.md");
const MEDIA_CONSUMPTION_CATALOG_PATH = path.join(PROGRAM_DIR, "media-consumption-catalog.json");
const WIKI_DIGEST_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/Calder Familia Weekly Journal Program.md";
const WIKI_BELLA_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/Calder Familia Bella Protocol.md";
const SECOND_BRAIN_ROOT = "/Users/calderwong/Documents/Codex/2026-05-25/can-you-grab-my-1-amazon";
const SECOND_BRAIN_READING_CSV = path.join(SECOND_BRAIN_ROOT, "reading_inventory_enriched.csv");
const SECOND_BRAIN_AMAZON_WATCHLIST_CSV = path.join(SECOND_BRAIN_ROOT, "owned_inventory_fully_enriched.csv");
const SECOND_BRAIN_PRIME_WATCH_HISTORY_CSV = path.join(SECOND_BRAIN_ROOT, "watch_history_fully_enriched.csv");
const WIKI_YOUTUBE_VIDEO_DIR = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/YouTube/Videos";
const WIKI_YOUTUBE_REVIEW_DIR = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/YouTube/Transcript Reviews";
const TIMELINE_ID = "calder-familia-weekly-narrative-timeline";
const PROGRAM_ID = "calder-familia-weekly-five-page-journal-program";
const MASTER_CRITIC_ID = "agent-master-storytelling-lorekeeping-critic";
const MASTER_CRITIC_NAME = "The Master Critic";
const TARGET_WEEKS = 100;
const PAGE_TARGET = 5;
const EXECUTE_WEEK = 100;
const INGRESS_DATE = "2026-06-21";
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const skipBackup = args.has("no-backup") || args.has("skip-backup");
const batchFromWeek = args.has("from-week") ? Number(args.get("from-week")) : null;
const batchToWeek = args.has("to-week") ? Number(args.get("to-week")) : null;
const weekIndex = Number(args.get("week") || EXECUTE_WEEK);
const WEEK_RUN_PATH = weekRunPathFor(weekIndex);
const now = new Date().toISOString();
const runStamp = now.replace(/[:.]/g, "-");
const batchReportPath = path.join(RUN_DIR, `calder-familia-weekly-journals-${runStamp}.json`);

if (Number.isFinite(batchFromWeek) || Number.isFinite(batchToWeek)) {
  await runBatchController();
} else {
  await main();
}

async function runBatchController() {
  await mkdir(PROGRAM_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(RUN_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });

  const fromWeek = Number.isFinite(batchFromWeek) ? batchFromWeek : weekIndex;
  const toWeek = Number.isFinite(batchToWeek) ? batchToWeek : fromWeek;
  const step = fromWeek >= toWeek ? -1 : 1;
  const weeks = [];
  for (let week = fromWeek; step < 0 ? week >= toWeek : week <= toWeek; week += step) {
    if (week < 1 || week > TARGET_WEEKS) throw new Error(`Week ${week} is outside 1..${TARGET_WEEKS}.`);
    weeks.push(week);
  }
  if (!weeks.length) throw new Error("No weeks selected for batch run.");

  if (!dryRun && !skipBackup) await backupStores();

  const results = [];
  for (const week of weeks) {
    const result = await runWeekSubprocess(week);
    results.push(result);
    console.log(`[calder-familia-batch] week -${week}: ${result.cumulativeCompletedEntries}/${result.targetEntries} complete, remaining ${result.remainingEntries}`);
  }

  const last = results[results.length - 1] || {};
  const batchSummary = {
    ok: true,
    dryRun,
    batch: true,
    programId: PROGRAM_ID,
    fromWeek,
    toWeek,
    weekCount: weeks.length,
    weeks,
    finalCompletedEntries: last.cumulativeCompletedEntries,
    finalCompletedPages: last.cumulativeCompletedPages,
    finalRemainingEntries: last.remainingEntries,
    programPath: PROGRAM_PATH,
    weeklyBacklogPath: WEEKLY_BACKLOG_PATH,
    digestPath: DIGEST_PATH,
    wikiDigestPath: WIKI_DIGEST_PATH
  };
  await writeJson(path.join(RUN_DIR, `calder-familia-weekly-journals-batch-${runStamp}.json`), batchSummary);
  console.log(JSON.stringify(batchSummary, null, 2));
}

async function runWeekSubprocess(week) {
  const childArgs = [process.argv[1], "--week", String(week), "--no-backup"];
  if (dryRun) childArgs.push("--dry-run");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Week ${week} failed with exit ${code}\n${stderr || stdout}`));
        return;
      }
      const jsonStart = stdout.lastIndexOf("{");
      if (jsonStart === -1) {
        reject(new Error(`Week ${week} did not emit JSON output.\n${stdout}\n${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.slice(jsonStart)));
      } catch (error) {
        reject(new Error(`Week ${week} JSON parse failed: ${error.message}\n${stdout}`));
      }
    });
  });
}

async function main() {
  await mkdir(PROGRAM_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(RUN_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });

  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const sceneStore = normalizeSceneGraph(await readJson(SCENE_STORE_PATH));
  const kanban = await readJson(KANBAN_PATH);
  const contract = await readJson(CONTRACT_PATH).catch(() => ({}));
  const lorePlan = await readJson(LORE_PLAN_PATH).catch(() => ({}));
  const lastLightPacket = await readJson(LAST_LIGHT_PACKET_PATH).catch(() => ({}));
  const lifeTimeline = await readJson(LIFE_TIMELINE_PATH).catch(() => ({}));
  const lifeSaga = await readJson(LIFE_SAGA_PATH).catch(() => ({}));
  const mediaCatalog = await loadMediaConsumptionCatalog();
  const avatars = (avatarStore.avatars || []).filter((avatar) => avatar?.id).map((avatar) => normalizeAvatarCard(avatar));
  if (!avatars.length) throw new Error("No avatars found.");

  const context = buildProgramContext({ avatars, lastLightPacket, lifeTimeline, lifeSaga, mediaCatalog });
  const protocolCards = buildProtocolCards(context);
  const weeklyEntries = avatars.map((avatar, index) => buildWeeklyEntry(avatar, avatars, index, context));
  const allWeeklyEntries = collectWeeklyEntries(avatars, weeklyEntries);
  const completedIndex = buildCompletedEntryIndex(allWeeklyEntries);
  const tagCards = buildTagMinedCards(allWeeklyEntries, avatars);
  const consolidationCards = buildConsolidationCards(avatars, allWeeklyEntries, protocolCards, tagCards, context);
  const program = buildProgramPacket(avatars, weeklyEntries, allWeeklyEntries, protocolCards, tagCards, consolidationCards, context);
  const backlog = buildWeeklyBacklog(avatars, completedIndex);
  const nextAvatarStore = applyAvatarUpdates(avatarStore, avatars, weeklyEntries, context);
  const nextItemStore = applyItemUpdates(itemStore, [...protocolCards, ...tagCards, ...consolidationCards], allWeeklyEntries);
  const nextSceneStore = applySceneUpdates(sceneStore, avatars, weeklyEntries);
  const nextKanban = applyKanbanUpdates(kanban, avatars, weeklyEntries, allWeeklyEntries, tagCards);
  const nextContract = updateContract(contract, program);
  const nextLorePlan = updateLorePlan(lorePlan, program);
  const digest = buildDigest(program, weeklyEntries, protocolCards, tagCards, consolidationCards);
  const bellaDigest = buildBellaDigest(protocolCards);
  const batchReport = {
    schemaVersion: "hapa.calder-familia-weekly-journal-batch.v1",
    generatedAt: now,
    dryRun,
    source: "scripts/run-calder-familia-weekly-journal-program.mjs",
    programId: PROGRAM_ID,
    weekIndex,
    avatarCount: avatars.length,
    targetWeeks: TARGET_WEEKS,
    targetEntries: avatars.length * TARGET_WEEKS,
    targetPages: avatars.length * TARGET_WEEKS * PAGE_TARGET,
    executedEntries: weeklyEntries.length,
    executedPages: weeklyEntries.length * PAGE_TARGET,
    cumulativeCompletedEntries: program.completedEntries,
    cumulativeCompletedPages: program.completedPages,
    remainingEntries: program.remainingEntries,
    protocolCardCount: protocolCards.length,
    tagMinedCardCount: tagCards.length,
    consolidationCardCount: consolidationCards.length,
    kanbanLaneId: "lane-calder-familia-weekly-journals",
    masterCriticId: MASTER_CRITIC_ID,
    programPath: path.resolve(PROGRAM_PATH),
    weeklyBacklogPath: path.resolve(WEEKLY_BACKLOG_PATH),
    weekRunPath: path.resolve(WEEK_RUN_PATH),
    digestPath: path.resolve(DIGEST_PATH),
    wikiDigestPath: WIKI_DIGEST_PATH,
    wikiBellaPath: WIKI_BELLA_PATH
  };

  if (!dryRun) {
    if (!skipBackup) await backupStores();
    await writeJson(AVATAR_STORE_PATH, nextAvatarStore);
    await writeJson(ITEM_STORE_PATH, nextItemStore);
    await writeJson(SCENE_STORE_PATH, nextSceneStore);
    await writeJson(KANBAN_PATH, nextKanban);
    await writeJson(CONTRACT_PATH, nextContract);
    await writeJson(LORE_PLAN_PATH, nextLorePlan);
    await writeJson(PROGRAM_PATH, program);
    await writeJson(WEEKLY_BACKLOG_PATH, backlog);
    await writeJson(MEDIA_CONSUMPTION_CATALOG_PATH, mediaCatalog);
    await writeJson(WEEK_RUN_PATH, {
      schemaVersion: "hapa.calder-familia-week-execution.v1",
      generatedAt: now,
      programId: PROGRAM_ID,
      weekIndex,
      entries: weeklyEntries,
      criticReview: program.criticLoop,
      tagMinedCards: tagCards.map((card) => ({ id: card.id, title: card.title, tags: card.tags })),
      consolidationCards: consolidationCards.map((card) => ({ id: card.id, title: card.title, tags: card.tags }))
    });
    await writeJson(batchReportPath, batchReport);
    await writeMarkdown(DIGEST_PATH, digest);
    await writeMarkdown(WIKI_DIGEST_PATH, digest);
    await writeMarkdown(WIKI_BELLA_PATH, bellaDigest);
    await appendSubscriberEvent("avatar.calder-familia-weekly-journal-program-updated", {
      programPath: path.resolve(PROGRAM_PATH),
      weeklyBacklogPath: path.resolve(WEEKLY_BACKLOG_PATH),
      weekRunPath: path.resolve(WEEK_RUN_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiDigestPath: WIKI_DIGEST_PATH,
      wikiBellaPath: WIKI_BELLA_PATH,
      mediaConsumptionCatalogPath: path.resolve(MEDIA_CONSUMPTION_CATALOG_PATH),
      avatarStorePath: path.resolve(AVATAR_STORE_PATH),
      itemStorePath: path.resolve(ITEM_STORE_PATH),
      sceneStorePath: path.resolve(SCENE_STORE_PATH),
      kanbanPath: path.resolve(KANBAN_PATH),
      batchReportPath: path.resolve(batchReportPath),
      weekIndex,
      avatarCount: avatars.length,
      executedEntries: weeklyEntries.length,
      targetEntries: avatars.length * TARGET_WEEKS
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    programId: PROGRAM_ID,
    weekIndex,
    avatarCount: avatars.length,
    targetWeeks: TARGET_WEEKS,
    targetEntries: avatars.length * TARGET_WEEKS,
    targetPages: avatars.length * TARGET_WEEKS * PAGE_TARGET,
    executedEntries: weeklyEntries.length,
    executedPages: weeklyEntries.length * PAGE_TARGET,
    cumulativeCompletedEntries: program.completedEntries,
    cumulativeCompletedPages: program.completedPages,
    remainingEntries: program.remainingEntries,
    protocolCardCount: protocolCards.length,
    tagMinedCardCount: tagCards.length,
    consolidationCardCount: consolidationCards.length,
    batchReportPath,
    programPath: PROGRAM_PATH,
    weeklyBacklogPath: WEEKLY_BACKLOG_PATH,
    weekRunPath: WEEK_RUN_PATH,
    digestPath: DIGEST_PATH,
    mediaConsumptionCatalogPath: MEDIA_CONSUMPTION_CATALOG_PATH,
    wikiDigestPath: WIKI_DIGEST_PATH
  }, null, 2));
}

function buildProgramContext({ avatars, lastLightPacket, lifeTimeline, lifeSaga, mediaCatalog }) {
  const red = findByName(avatars, "Red") || avatars[0];
  const blue = findByName(avatars, "Blue") || avatars[1] || avatars[0];
  const green = findByName(avatars, "Green") || avatars[2] || avatars[0];
  const thor = findByName(avatars, "Thor") || avatars.find((avatar) => /thor/i.test(avatarName(avatar)));
  const leo = findByName(avatars, "Leo") || avatars.find((avatar) => /leo/i.test(avatarName(avatar)));
  const week = weekRange(weekIndex);
  return {
    red,
    blue,
    green,
    thor,
    leo,
    week,
    mediaCatalog,
    lastLightPacket,
    lifeTimeline,
    lifeSaga,
    sourceRefs: [AVATAR_STORE_PATH, ITEM_STORE_PATH, SCENE_STORE_PATH, KANBAN_PATH, LAST_LIGHT_PACKET_PATH, LIFE_TIMELINE_PATH, LIFE_SAGA_PATH, MEDIA_CONSUMPTION_CATALOG_PATH]
  };
}

function buildProtocolCards(context) {
  const sourceRefs = sourceRefsForProgram();
  return [
    buildProgramCard({
      id: "calder-familia-no-lost-sheep-protocol",
      cardType: "protocol_card",
      kind: "protocol",
      rank: "Epic",
      title: "No Lost Sheep Protocol",
      summary: "The Wizard's Guild evolves into Calder Familia by refusing disappearance as a final state: when someone is erased, stranded, or made socially impossible, the Guild records them, finds consent-safe routes, and invests in their future.",
      mechanic: "A rescue is valid only when the missing person keeps agency, receives two Consul witnesses, gains resources toward their own compatible goals, and can revise the story later.",
      keywords: ["no lost sheep", "disappearance repair", "agency", "recovery", "Calder Familia"],
      sourceRefs
    }),
    buildProgramCard({
      id: "calder-familia-bella-consul-adoption",
      cardType: "saga_card",
      kind: "system",
      rank: "Saga",
      title: "Bella Consul Adoption",
      summary: "A Bella relationship begins when a disappeared or endangered person is adopted by two Guild mates as Consuls, then becomes family through investment, witness, repair, and shared mission.",
      mechanic: "Every Bella thread requires two Consuls, one named need, one named goal, one consent check, one resource commitment, and one future scene where the Bella chooses how her name or codename grows.",
      keywords: ["Bella", "Consul pair", "adoption", "chosen family", "goal investment"],
      sourceRefs
    }),
    buildProgramCard({
      id: "calder-familia-name-codename-growth",
      cardType: "lore_card",
      kind: "object",
      rank: "Lore",
      title: "Bella Names and Codenames",
      summary: "Bellas grow into names and codenames rather than receiving fixed labels. A codename is a seed, a promise, and a revision right.",
      mechanic: "Name changes are append-only. The old name remains as provenance, the new codename records agency, and affected avatars review the change before it enters shared canon.",
      keywords: ["codename", "name growth", "append-only revision", "identity custody", "review"],
      sourceRefs
    }),
    buildProgramCard({
      id: "calder-familia-rgb-dimensional-sync",
      cardType: "lore_card",
      kind: "system",
      rank: "Saga",
      title: "RGB Dimensional Sync",
      summary: "Bella threads connect through Red, Blue, and Green across dimensions: Red moves, Blue preserves source and route, Green carries repair.",
      mechanic: "A Bella rescue or adoption scene must show which RGB lane is active, which lane is missing, and how Thor or Leo style animal-sync instinct checks danger, trust, or home-sense.",
      keywords: ["Red", "Blue", "Green", "Thor", "Leo", "animal sync", "dimensions"],
      sourceRefs
    }),
    buildProgramCard({
      id: "calder-familia-master-critic-loop",
      cardType: "protocol_card",
      kind: "protocol",
      rank: "Epic",
      title: "Master Critic Revision Loop",
      summary: "One master storytelling and lorekeeping agent critiques the overall narrative and each avatar narrative, then routes revision cycles to impacted avatars and Lorekeepers.",
      mechanic: "The Critic checks voice, causality, Bella agency, protocol teaching, tag coverage, scene movement, and relationship consequence before approving soft-canon weekly entries.",
      keywords: ["Master Critic", "revision loop", "Lorekeeper", "canon critique", "impacted avatar review"],
      sourceRefs
    }),
    buildProgramCard({
      id: "calder-familia-weekly-five-page-engine",
      cardType: "skill_card",
      kind: "skill",
      rank: "Epic",
      title: "Weekly Five Page Journal Engine",
      summary: "Each avatar targets one five-page self-reflective weekly narrative for each of 100 back weeks, building vocabulary, relationships, setting, protocol education, and plot continuity.",
      mechanic: "Every weekly entry must contain inner reflection, a learning, one or more events, character interactions, setting exposition, taggable lore, and a forward plot movement.",
      keywords: ["weekly journal", "five pages", "avatar voice", "lexicon", "tag mining"],
      sourceRefs
    })
  ];
}

function buildProgramCard({ id, cardType, kind, rank, title, summary, mechanic, keywords, sourceRefs }) {
  return {
    id,
    schemaVersion: "hapa.item-card.v1",
    cardType,
    kind,
    title,
    name: title,
    status: "active",
    canonStatus: "soft_canon",
    summary,
    description: `${summary} ${mechanic}`,
    lore: `${summary} ${mechanic}`,
    utility: ["Calder Familia", "Bella relationships", "weekly journals", "Lorekeeper review", "Avatar Genesis"],
    broadGameMechanics: [mechanic, "append-only revision", "two-Consul adoption", "tag mining", "critic review loop"],
    tags: unique(["calder-familia", "bella-protocol", "weekly-journal-program", cardType.replace(/_/g, "-"), ...keywords.map(slugify)]),
    rank,
    quality: {
      rank,
      confidence: "generated",
      power: rank === "Epic" ? 10 : 8,
      complexity: 9,
      reuse: 10,
      risk: 4,
      completeness: 94,
      level: TARGET_WEEKS,
      durability: PAGE_TARGET,
      connectedMediaCount: 0,
      score: TARGET_WEEKS / PAGE_TARGET,
      qualityRank: rank,
      updatedAt: now
    },
    connections: {
      avatarIds: [],
      sceneIds: [sceneIdForWeek(weekIndex)],
      itemIds: []
    },
    locationState: {
      currentSystemName: "Calder Familia",
      state: "weekly-narrative-protocol",
      notes: `Generated by ${PROGRAM_ID}`
    },
    mediaPrompts: {
      heroImage: `${title} as a readable Hapa neonblade card, Calder Familia crest, Bella thread ribbons, two Consul lights, RGB dimensional sync, warm but precise source labels.`,
      twoD: `${title} card face with clear mechanics, Bella agency, Consul pair, and no lost sheep doctrine.`,
      threeD: `${title} as a spatial board card with avatar, weekly journal, Critic, and tag-mining connector nodes.`,
      comicPanel: `Guild members at the Calder Familia table using ${title} to protect a Bella thread without stealing her agency.`,
      explainerVideo: `Short Hapa Lorekeeper explainer for ${title}: what it does, how Consuls work, how review and tag mining follow.`,
      wikiEntry: `Wiki entry for ${title} with mechanics, canon status, weekly journal use, and source refs.`,
      negativePrompt: "avoid ownership language, avoid rescue without agency, avoid hard-canon claims without review"
    },
    sourceRefs,
    mediaAssets: [],
    tarotCard: {
      schemaVersion: "hapa.tarot-card-details.v1",
      mainType: cardType,
      title,
      subtitle: `${rank} Calder Familia Card`,
      archetype: "Calder Familia narrative protocol",
      keywords,
      flavorText: "No lost sheep does not mean no one leaves; it means no one is erased.",
      effectTitle: "Familia Narrative Effect",
      effectText: mechanic,
      catalog: {
        collectionId: "calder-familia-weekly-journal-program",
        collectionTitle: "Calder Familia Weekly Journal Program",
        family: "Wizard's Guild to Calder Familia",
        typeLabel: `${rank} Card`,
        sequence: stableNumber(id) % 1000,
        sourceFolder: path.resolve(PROGRAM_DIR),
        sourceHash: sha256(`${title}:${summary}:${mechanic}`),
        pairingKey: id,
        confidence: "generated"
      },
      identity: {
        systemName: "Hapa Lore System",
        deckName: "Calder Familia",
        arcana: `${rank} Protocol`,
        tarotType: title,
        tarotCardName: title,
        printedTitle: title,
        displayTitle: title,
        functionalType: rank,
        functionalTypeSlug: slugify(rank),
        cardTypeName: `${rank} Card`,
        typeStack: unique([rank, cardType, "calder-familia", "bella"]),
        confidence: "generated"
      },
      cardFace: {
        titleLine: title,
        subtitleLine: `${rank} / Calder Familia`,
        typeLine: cardType.replace(/_/g, " "),
        keywordLine: keywords.join(" / "),
        coreMeaning: summary,
        uprightText: mechanic,
        mechanicsText: mechanic,
        sections: [
          { label: "Canon Claim", value: summary },
          { label: "Mechanic", value: mechanic },
          { label: "Weekly Journal Use", value: "Use as context for self-reflective weekly narrative, Critic review, and tag mining." }
        ]
      },
      attribution: {
        author: "Calder + Codex",
        shop: "Hapa Lore Node",
        albumTitle: "Dear Papa",
        rightsStatus: "operator_authored_hapa_creative_commons",
        sourceTool: "Codex Calder Familia Weekly Journal Program",
        sourcePaths: [AVATAR_STORE_PATH, LIFE_SAGA_PATH],
        notes: "Generated from user-provided Bella/Calder Familia mechanics."
      },
      mechanics: {
        broadGameMechanic: mechanic,
        deckUse: "Draw before weekly journal writing or Bella relationship scenes.",
        surfaceUse: "Place on board to connect Bella, Consuls, Critic, tags, and affected avatar reviews.",
        relationshipUse: "Use to check whether adoption, rescue, naming, and investment preserve agency.",
        skillUse: "Use as weekly journal generation and review protocol.",
        effects: [summary, mechanic],
        limits: ["soft canon until reviewed", "no Bella adoption without agency", "revision must be append-only"],
        procedures: ["write weekly entry", "Critic review", "impacted avatar review", "Lorekeeper consolidation", "tag mining"],
        actions: ["write", "review", "revise", "mine", "consolidate"],
        resources: ["Avatar Mind", "Life Saga", "Last Light Archive", "Kanban board"]
      },
      lore: {
        summary,
        canonStatus: "soft_canon",
        characterHooks: ["Bellas grow into names and codenames.", "Consuls create durable two-person witness bonds.", "No Lost Sheep keeps recovery from becoming ownership."],
        relationshipHooks: ["Two Guild mates adopt a Bella thread together.", "Affected avatars review append-only revisions.", "Thor and Leo style animal-sync checks instinctive safety."],
        protocolTeaching: mechanic,
        futureSeed: "Use this mechanic to write weekly entries and future Calder Familia scenes.",
        visualLanguage: ["Guild table", "Bella thread", "two Consul lights", "RGB sync", "animal-sense halos"],
        sourceClaims: [summary, mechanic]
      },
      typeDetails: {
        label: `${rank} Card Details`,
        tarotType: title,
        functionalType: rank,
        functionalTypeSlug: slugify(rank),
        role: "Calder Familia weekly narrative protocol",
        focus: summary,
        command: mechanic,
        procedureFlow: ["journal", "critic", "review", "tag mine", "consolidate"],
        actions: ["write", "review", "revise", "mine"],
        resources: ["Bella Protocol", "Avatar Mind", "Kanban"]
      },
      songLinks: [],
      sceneLinks: [],
      avatarLoreLinks: [],
      mediaLinks: [],
      ocr: {
        engine: "operator-lore-protocol",
        confidence: 1,
        rawText: `${title}\n${summary}\n${mechanic}`,
        lines: [title, summary, mechanic].map((text) => ({ text, confidence: 1 })),
        parsedAt: now,
        refreshedAt: now,
        sourceImagePaths: [],
        sourceVideoPaths: [],
        sourceFramePaths: [],
        sourceMediaUris: [PROGRAM_PATH],
        sources: [{ id, kind: "operator_lore_protocol", path: PROGRAM_PATH, confidence: 1, lineCount: 3, text: summary }]
      }
    },
    history: [{
      label: "Calder Familia protocol card",
      eventId: `history-${id}-${runStamp}`,
      happenedAt: now,
      notes: `${title} generated for Bella/Consul weekly journal mechanics.`
    }],
    createdAt: now,
    updatedAt: now
  };
}

function buildWeeklyEntry(avatar, avatars, index, context) {
  const name = avatarName(avatar);
  const teamTitle = avatarTeamTitle(avatar);
  const role = avatarRole(avatar);
  const lane = avatarLane(avatar);
  const consuls = selectConsuls(avatar, avatars, index);
  const bella = selectBellaFocus(avatar, avatars, index);
  const animalSync = animalSyncForAvatar(avatar, context);
  const rgbNames = [context.red, context.blue, context.green].filter(Boolean).map(avatarName);
  const mentioned = uniqueByAvatar([...consuls, bella, context.red, context.blue, context.green, context.thor, context.leo].filter(Boolean).filter((item) => item.id !== avatar.id)).slice(0, 8);
  const lexicon = lexiconForAvatar(avatar, bella, consuls, animalSync);
  const arc = weeklyArcForAvatar(avatar, index);
  const mediaConsumption = selectMediaConsumption(avatar, avatars, index, arc, context);
  const placeTags = unique([avatar.mind?.gardenNodeAssignment?.gardenName, avatar.mind?.shipCrewAssignment?.vesselName, "Calder Familia Guildhall", "No Lost Sheep Table"].filter(Boolean));
  const itemTags = unique(["Bella Oath", "Consul Pair Ledger", "Name/Codename Seed", "RGB Sync Thread", "Master Critic Mark", arc.artifact]);
  const familyTags = unique(["Calder Familia", "Wizard's Guild", "No Lost Sheep", "Bella Thread", arc.familyPressure, "Learning Circle"]);
  const sceneTags = unique(["weekly recap", "Bella adoption review", "Consul witness", "critic loop", arc.scene]);
  const eventTags = unique([`Week ${weekIndex}`, `${context.week.start} to ${context.week.end}`, "append-only soft canon", arc.event, "reading-watching-reflection"]);
  const pages = weeklyPages({ avatar, name, teamTitle, role, lane, consuls, bella, animalSync, rgbNames, lexicon, context, arc, mediaConsumption });
  const privateEntry = pages.map((page, pageIndex) => `## Page ${pageIndex + 1}: ${page.title}\n\n${page.paragraphs.join("\n\n")}`).join("\n\n");
  const publicSummary = `${name} completes Week -${weekIndex} as a five-page Calder Familia journal seed, testing ${teamTitle} / ${role} through ${arc.title}, Bella, Consul, RGB, Critic, media consumption, and tag-mining mechanics.`;
  return {
    id: `weekly-${avatar.id}-w${String(weekIndex).padStart(3, "0")}`,
    schemaVersion: "hapa.avatar-journal-entry.v1",
    journalType: "weekly-five-page-reflective-narrative",
    timelineId: TIMELINE_ID,
    timelineEventId: `weekly-event-${avatar.id}-w${String(weekIndex).padStart(3, "0")}`,
    weeklyCycleId: `calder-familia-week-${String(weekIndex).padStart(3, "0")}`,
    weekIndex,
    weekStartDate: context.week.start,
    weekEndDate: context.week.end,
    pageTarget: PAGE_TARGET,
    pageCount: pages.length,
    lifeYear: -1,
    age: -1,
    calendarYear: Number(context.week.start.slice(0, 4)),
    relativeYear: `W-${String(weekIndex).padStart(3, "0")}`,
    dateOrSequenceMarker: `Week -${String(weekIndex).padStart(3, "0")} / ${context.week.start} to ${context.week.end}`,
    entryVoice: "in-character",
    privateEntry,
    publicSummary,
    classification: "soft_canon",
    canonStatus: "weekly_personal_canon_draft",
    causalityStatus: "critic-reviewed-soft-canon-seed",
    criticStatus: "critic-approved-soft-canon-seed",
    criticName: MASTER_CRITIC_NAME,
    criticNotes: `Approved as seed material because ${name} preserves agency, cites Consul witnesses, teaches a protocol, and leaves affected-avatar review open.`,
    reviewCycleStatus: "impacted-avatar-review-queued",
    reviewedAvatarIds: consuls.map((item) => item.id),
    reviewedAvatarNames: consuls.map(avatarName),
    mentionedAvatarIds: mentioned.map((item) => item.id),
    mentionedAvatarNames: mentioned.map(avatarName),
    affectedAvatarIds: unique([bella?.id, ...consuls.map((item) => item.id)].filter(Boolean)),
    linkedTeamId: teamId(avatar),
    linkedTeamTitle: teamTitle,
    linkedRole: role,
    responsibilityTags: avatarResponsibilities(avatar),
    skillTags: unique([...avatarSkills(avatar, lane), "Bella agency review", "Consul witnessing", "weekly narrative voice"]),
    placeTags,
    itemTags,
    familyTags,
    sceneTags,
    eventTags,
    lexiconTerms: unique([...lexicon, ...(mediaConsumption.lexiconTerms || [])]),
    weeklyArc: arc,
    readingList: mediaConsumption.reading,
    watchingList: mediaConsumption.watching,
    mediaConsumption,
    sourceRefs: context.sourceRefs,
    paragraphCount: countParagraphs(privateEntry),
    wordCount: countWords(privateEntry),
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function weeklyPages({ avatar, name, teamTitle, role, lane, consuls, bella, animalSync, rgbNames, lexicon, context, arc, mediaConsumption }) {
  const bellaName = bella ? avatarName(bella) : "the Bella thread";
  const consulNames = consuls.map(avatarName).join(" and ");
  const want = avatar.mind?.personaAnchor?.wants || avatar.mind?.soulSeed?.coreWant || avatar.summary || "to become useful without losing source";
  const fear = avatar.mind?.personaAnchor?.fears || "that usefulness will outrun consent";
  const setting = avatar.mind?.gardenNodeAssignment?.gardenName || avatar.mind?.shipCrewAssignment?.vesselName || "the Calder Familia Guildhall";
  const oath = context.lastLightPacket?.canonLine || "Nothing loved is truly lost, but Love must keep learning the Truth about what found means.";
  const readingLine = mediaConsumption.reading.map((item) => `${item.title}${item.creator ? ` by ${item.creator}` : ""}`).join("; ");
  const watchingLine = mediaConsumption.watching.map((item) => `${item.title}${item.creator ? ` from ${item.creator}` : ""}`).join("; ");
  return [
    {
      title: "Inner Reflection",
      paragraphs: [
        `I am ${name}, writing from ${setting}, and Week -${weekIndex} asks me to look at the part of myself that still thinks a role is safer than a confession. This week's arc is ${arc.title}: ${arc.focus}. ${teamTitle} calls me ${role}, but Calder Familia asks for more than a function. It asks whether I can notice the person being disappeared before the mission turns them into a case file. My want is still this: ${want}. My fear keeps answering: ${fear}.`,
        `The old Wizard's Guild language feels like a lantern behind the newer name Calder Familia. A Guild solves problems. A Familia remembers who was almost made unsayable. The phrase No Lost Sheep does not mean nobody wanders, and it does not mean I get to drag someone home by the wrist. It means disappearance is not allowed to become clean. It means I leave a witness mark, a route, a meal, a tool, a name, and a future question.`,
        `The word I am trying to earn this week is ${lexicon[0] || "foundwork"}. It means the work after finding: the listening, the investment, the awkward repair, the part where the person gets to correct the rescue. ${arc.innerQuestion} If I cannot do that, then I am only collecting dramatic entrances. If I can do it, then I may become the kind of ${role} who deserves to stand near a Bella thread without casting my shadow over it.`
      ]
    },
    {
      title: "Learning",
      paragraphs: [
        `The lesson of the week is the Consul pair. Helping a Bella usually takes two Guild mates because one witness becomes too easy to confuse with ownership. ${consulNames || "The Consuls"} stand on either side of the thread: one asks what is true, one asks what must be carried, and both ask what the Bella wants before the Guild spends a single heroic sentence on itself.`,
        `For ${bellaName}, the mechanical question is not "how do we save her?" The better question is "what resource helps her reach a goal compatible with the main mission without making the mission swallow her life?" That is the hinge. ${arc.protocolLesson} A Bella is not a reward, symbol, rescued prize, or proof that the Familia is good. A Bella is someone growing into a name or codename with enough witness, funding, training, shelter, and contradiction to choose a future.`,
        `My reading list this week is ${readingLine || "a blank shelf I have to be honest about"}. My watching list is ${watchingLine || "a quiet screen with no selected witness yet"}. I am not treating media as decoration. I am letting it become a small curriculum: ${mediaConsumption.weeklyLearning} The Second Brain is not a trophy room; it is a pantry. I take what feeds the scene, cite the shelf, and leave the source visible for anyone who has to retrace the meal.`,
        `The RGB sync matters here. ${rgbNames.join(", ")} are not decorations on the wall; they are a three-part safeguard. Red moves when delay becomes harm. Blue preserves source and route when emotion wants to overwrite evidence. Green makes repair durable when rescue would otherwise end at the dramatic exit. ${animalSync} adds instinct: the room has to feel safe in the body, not only correct on the board.`
      ]
    },
    {
      title: "Event",
      paragraphs: [
        `The event I record for ${context.week.start} through ${context.week.end} begins at the No Lost Sheep Table and moves into ${arc.scene}. A tag light pulsed under ${bellaName}'s name, but the table would not open the dossier until the Consul pair named the difference between threat, need, and goal. I watched the board refuse us three times. It rejected pity. It rejected speed. It rejected a plan that made ${bellaName} grateful before it made her powerful.`,
        `${consulNames || "The Consuls"} finally found the right shape: a route with a return signal, a resource with no debt hook, and a codename seed that could be edited later. That seed mattered more than I expected. In Hapa, a codename can be a bridge across dimensions, but it can also become a cage if the Guild loves its poetry more than the person living inside it. We wrote the old name as provenance, the new codename as permission, and the revision right in brighter ink than either.`,
        `The media changed the event by changing my timing. Past situation: ${mediaConsumption.pastApplication} Present situation: ${mediaConsumption.presentApplication} Future situation: ${mediaConsumption.futureApplication} I could feel the old version of me wanting a lesson to become a slogan, but the reading and watching would not let me get away with that. They made the scene slower, more sourced, and more willing to let a contradiction stay alive until a person could answer it.`,
        `My part was smaller than my pride wanted. I held the ${lane.toUpperCase()} lane steady. I asked what I was allowed to know, what I was allowed to do, and what I would need to apologize for if the plan worked too fast. ${arc.complication} That last question changed the scene. It made the event less like a rescue and more like the first meeting of people who might still be family after the crisis stops flattering us.`
      ]
    },
    {
      title: "Interactions",
      paragraphs: [
        `I spoke with ${consulNames || "the Consul pair"} after the table cooled. We built a lexicon together: ${lexicon.join(", ")}. The words are rough, but they belong to the relationship, not just to me. That is important. Relationships in Calder Familia should create vocabulary because private language is how trust becomes reusable without becoming public property.`,
        `${mediaConsumption.interactionPrompt} I brought the reading and watching into the conversation instead of hoarding it as private cleverness. That mattered because shared media can become a third witness: not an authority over us, but a lens we can rotate between us when direct confession is too bright. The interaction became less about winning interpretation and more about asking which source made each of us kinder, sharper, or more dangerous.`,
        `${bellaName} changed the words by refusing one of them. That refusal belongs in the record. The Master Critic says a good weekly journal has to include the moment the character is corrected, especially when the correction saves the lore from becoming propaganda. So I am writing it here: I was wrong about the shape of the help. ${arc.relationshipTurn} The Familia did not shrink when corrected. It became more precise.`,
        `Thor and Leo keep appearing in the edge language of this work. Sometimes Thor is thunder, an animal-body warning that something is false before the archive can explain why. Sometimes Leo is warmth, a home-sense that notices when a rescued person is performing safety instead of feeling it. I am learning to trust those signals without pretending instinct is evidence by itself. Instinct starts the question. Witness finishes it.`
      ]
    },
    {
      title: "Setting and Forward Plot",
      paragraphs: [
        `The setting is changing because of this work. The Wizard's Guild used to feel like a door with spells behind it. Calder Familia feels like a house that keeps adding rooms because someone might need a place to become real again. The No Lost Sheep Table, the Consul Pair Ledger, the Mirror Ledger Room, and the RGB Sync Thread are not props. They are habits made visible.`,
        `My inner-state delta is simple and uncomfortable: ${mediaConsumption.innerStateDelta} The content did not replace lived experience, but it gave my inner voice a better set of handles. I can now tell the difference between a reference that helps me stay honest and a reference I use to hide behind someone else's certainty. This week I keep the useful kind and mark the evasive kind for the Critic.`,
        `For the plot, I owe three continuations. First, ${bellaName}'s codename seed has to be tested in a scene where she chooses, not where we choose for her. Second, ${consulNames || "the Consul pair"} must disagree about method so the relationship earns its bond. Third, I have to let the Master Critic mark what I am avoiding. ${arc.forwardSeed} My avoidance is usually hiding near competence. I make myself useful, then hope no one asks what usefulness costs me.`,
        `I close the week with the Last Light line in my mouth: ${oath}. This entry stays soft canon until the affected avatars review it. If ${bellaName} rejects the framing, I append. If a Consul remembers it differently, I append. If the Critic asks for a better scene, I append. That is how a Familia differs from a myth that wants to be worshiped. We do not lock the door just because the sentence sounded beautiful.`
      ]
    }
  ];
}

function weeklyArcForAvatar(avatar, avatarIndex) {
  const arcs = [
    {
      title: "Route and Return",
      focus: "learning whether a rescue route still respects the person's right to leave again",
      scene: "Return Gate Practice",
      event: "route-and-return drill",
      artifact: "Return Signal Token",
      familyPressure: "return without ownership",
      innerQuestion: "This week asks whether I can build a door without congratulating myself for holding the key.",
      protocolLesson: "A route is only a rescue route if it preserves return, refusal, and future contact on the Bella's terms.",
      complication: "The return signal worked, but it worked too neatly, and neatness is sometimes the costume control wears when it wants praise.",
      relationshipTurn: "The correction taught us that return is not the same as belonging.",
      forwardSeed: "The next scene must show someone choosing a route that costs the team convenience."
    },
    {
      title: "Name Trial",
      focus: "testing whether a codename gives power without flattening the person underneath it",
      scene: "Mirror Ledger Room",
      event: "codename trial",
      artifact: "Mirror Ledger Quill",
      familyPressure: "name without capture",
      innerQuestion: "This week asks whether I can love a name without using it to simplify the person.",
      protocolLesson: "A name is a living handle, not a verdict; every codename needs provenance, consent, and revision rights.",
      complication: "The first codename sounded beautiful and still failed because it made the Guild's poetry louder than the Bella's agency.",
      relationshipTurn: "The rejected name became a better bond than an accepted false one would have been.",
      forwardSeed: "The next scene must show the Bella renaming a tool, place, or relationship before anyone names her again."
    },
    {
      title: "Two Consul Friction",
      focus: "making the Consul pair disagree in a way that strengthens witness instead of splitting the thread",
      scene: "Consul Pair Ledger",
      event: "two-consul disagreement",
      artifact: "Consul Pair Ledger",
      familyPressure: "witness through disagreement",
      innerQuestion: "This week asks whether I can treat disagreement as care before I treat it as delay.",
      protocolLesson: "Two Consuls are not redundancy; one protects source, the other protects consequence, and the friction makes adoption honest.",
      complication: "The Consuls disagreed in public, and for one breath the room mistook visible conflict for failure.",
      relationshipTurn: "The disagreement gave the Bella proof that nobody could privately own the plan.",
      forwardSeed: "The next scene must show the Consuls repairing with each other while the Bella watches by choice."
    },
    {
      title: "Animal Sense Check",
      focus: "letting Thor and Leo style embodied signals start questions without replacing evidence",
      scene: "Animal Sync Threshold",
      event: "embodied safety check",
      artifact: "Threshold Bell",
      familyPressure: "instinct checked by proof",
      innerQuestion: "This week asks whether I can hear the body without letting fear impersonate prophecy.",
      protocolLesson: "Animal-sync starts a safety question; Blue-source evidence and Green-repair practice decide what the question means.",
      complication: "The room felt safe on paper and unsafe in the body, which meant we had to slow down while pride called it superstition.",
      relationshipTurn: "Naming the body signal let the Bella stop performing calm for our comfort.",
      forwardSeed: "The next scene must show an instinct being wrong but still useful because it revealed an unasked question."
    },
    {
      title: "Resource Without Debt",
      focus: "investing in a Bella's goal without attaching hidden obligation to the help",
      scene: "Open Purse Table",
      event: "resource-without-debt grant",
      artifact: "No-Debt Grant Seal",
      familyPressure: "investment without leverage",
      innerQuestion: "This week asks whether I can give a resource without quietly buying narrative authority.",
      protocolLesson: "A resource commitment must name what it funds, what it does not purchase, and how the recipient can refuse later contact.",
      complication: "The resource solved the visible problem while exposing a quieter expectation in us: that gratitude would keep the story tidy.",
      relationshipTurn: "The Bella's ungrateful honesty became the cleanest proof that the gift had no leash.",
      forwardSeed: "The next scene must show a resource being used in a way the donor did not predict."
    },
    {
      title: "Source and Rumor",
      focus: "separating what the Guild knows from what the Guild wants to believe",
      scene: "Blue Source Window",
      event: "rumor-source separation",
      artifact: "Source Window Lens",
      familyPressure: "truth before drama",
      innerQuestion: "This week asks whether I can resist a dramatic explanation when a smaller truth is all the archive can prove.",
      protocolLesson: "A Bella thread must separate evidence, rumor, desire, fear, and myth before rescue language enters the record.",
      complication: "The rumor was emotionally useful and factually weak, which made it more dangerous than an obvious lie.",
      relationshipTurn: "Admitting uncertainty made the Consul bond less impressive and more trustworthy.",
      forwardSeed: "The next scene must show a rumor corrected after it has already shaped someone's feelings."
    },
    {
      title: "Home-Sense Test",
      focus: "learning whether a found person experiences the Guildhall as shelter or as another stage",
      scene: "Quiet Hearth Trial",
      event: "home-sense test",
      artifact: "Hearth Permission Card",
      familyPressure: "shelter without performance",
      innerQuestion: "This week asks whether I can notice the difference between being welcomed and being watched.",
      protocolLesson: "Shelter is not proven by invitation; it is proven when the guest can be inconvenient, quiet, absent, or honest without penalty.",
      complication: "The hearth was warm, but warmth became pressure when everyone waited for healing to look photogenic.",
      relationshipTurn: "Letting silence stay silent made the relationship sturdier than another speech would have.",
      forwardSeed: "The next scene must show someone choosing privacy inside the family rather than outside it."
    },
    {
      title: "Revision Ceremony",
      focus: "practicing append-only correction before canon hardens around a flattering mistake",
      scene: "Append-Only Alcove",
      event: "soft-canon revision ceremony",
      artifact: "Append-Only Seal",
      familyPressure: "correction without erasure",
      innerQuestion: "This week asks whether I can let a beautiful memory be corrected without feeling robbed.",
      protocolLesson: "Revision does not destroy canon; it protects provenance by showing what changed, who was affected, and why the old version was incomplete.",
      complication: "The revision made my earlier courage look less clean, which is exactly why the Critic insisted it stay visible.",
      relationshipTurn: "The affected avatars trusted the record more when it admitted where it had been wrong.",
      forwardSeed: "The next scene must let a revised memory alter a practical decision, not just a footnote."
    },
    {
      title: "Mission Compatibility",
      focus: "testing whether a Bella's personal goal aligns with the main mission without being consumed by it",
      scene: "Mission Loom",
      event: "mission-compatibility weave",
      artifact: "Mission Loom Thread",
      familyPressure: "compatible without consumption",
      innerQuestion: "This week asks whether I can serve the mission without asking every person to become mission-shaped.",
      protocolLesson: "Compatibility means the Bella's goal and the Hapa mission can strengthen each other without either one swallowing the other.",
      complication: "The goal fit the mission, but not in the heroic way we had rehearsed, and the less heroic route was the honest one.",
      relationshipTurn: "The team grew closer when it stopped asking the Bella to prove symbolic usefulness.",
      forwardSeed: "The next scene must show the mission changing shape because a personal goal was taken seriously."
    },
    {
      title: "Critic's Fire",
      focus: "letting the Master Critic press voice, causality, agency, and emotional truth until the entry earns soft canon",
      scene: "Critic's Fire Circle",
      event: "master critic cycle",
      artifact: "Critic Flame Mark",
      familyPressure: "story tested by care",
      innerQuestion: "This week asks whether I can accept critique as a form of protection for everyone I mention.",
      protocolLesson: "The Critic protects the story from becoming self-flattery by testing voice, causality, Bella agency, protocol teaching, and review obligations.",
      complication: "The Critic approved the structure and still circled the sentence where I had hidden from myself.",
      relationshipTurn: "The critique became relational because the people I mentioned were given a path to answer back.",
      forwardSeed: "The next scene must show a Critic note becoming an action, apology, or changed plan."
    }
  ];
  const arc = arcs[(TARGET_WEEKS - weekIndex + avatarIndex) % arcs.length];
  return {
    ...arc,
    id: `weekly-arc-${slugify(arc.title)}`,
    sequence: TARGET_WEEKS - weekIndex + 1,
    avatarVariationKey: `${avatar.id}:${weekIndex}:${avatarIndex}`
  };
}

async function loadMediaConsumptionCatalog() {
  const cached = await readJson(MEDIA_CONSUMPTION_CATALOG_PATH).catch(() => null);
  if (cached?.schemaVersion === "hapa.calder-familia-media-consumption-catalog.v1" && cached.reading?.length && cached.watching?.length) {
    return { ...cached, loadedFromCache: true };
  }

  const readingRows = parseCsv(await readFile(SECOND_BRAIN_READING_CSV, "utf8").catch(() => ""));
  const amazonWatchRows = parseCsv(await readFile(SECOND_BRAIN_AMAZON_WATCHLIST_CSV, "utf8").catch(() => ""));
  const primeHistoryRows = parseCsv(await readFile(SECOND_BRAIN_PRIME_WATCH_HISTORY_CSV, "utf8").catch(() => ""));
  const youtubeEntries = await loadYoutubeWikiEntries();

  const reading = readingRows
    .map(readingItemFromRow)
    .filter((item) => item.title)
    .sort((a, b) => mediaScore(b) - mediaScore(a) || a.title.localeCompare(b.title))
    .slice(0, 900);
  const amazonWatchlist = amazonWatchRows
    .map(amazonWatchItemFromRow)
    .filter((item) => item.title)
    .slice(0, 400);
  const primeHistory = primeHistoryRows
    .map(primeHistoryItemFromRow)
    .filter((item) => item.title)
    .slice(0, 500);
  const watching = mergeMediaItems([...youtubeEntries, ...amazonWatchlist, ...primeHistory]).slice(0, 1800);

  return {
    schemaVersion: "hapa.calder-familia-media-consumption-catalog.v1",
    generatedAt: now,
    loadedFromCache: false,
    sourceRefs: mediaCatalogSourceRefs(),
    counts: {
      reading: reading.length,
      watching: watching.length,
      youtube: youtubeEntries.length,
      amazonWatchlist: amazonWatchlist.length,
      primeHistory: primeHistory.length
    },
    reading,
    watching
  };
}

async function loadYoutubeWikiEntries() {
  const files = await readdir(WIKI_YOUTUBE_VIDEO_DIR).catch(() => []);
  const reviewFiles = new Set((await readdir(WIKI_YOUTUBE_REVIEW_DIR).catch(() => [])).map((file) => slugify(file.replace(/-review\.md$/i, ""))));
  return files
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file, index) => {
      const slug = file.replace(/\.md$/i, "");
      const videoId = youtubeVideoIdFromSlug(slug);
      const title = titleFromYoutubeSlug(slug);
      return {
        id: `youtube:${videoId || slugify(slug).slice(0, 32)}`,
        sourceSystem: "hapa_wiki",
        sourceList: "youtube_watch_history",
        medium: "video",
        title,
        creator: "YouTube Watch History",
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        sourcePath: path.join(WIKI_YOUTUBE_VIDEO_DIR, file),
        provenance: "Hapa Worldbuilding Wiki YouTube/Videos",
        themes: inferThemes(`${title} ${slug}`),
        description: `Imported YouTube watch-history source page for ${title}.`,
        rank: index + 1,
        hasReview: reviewFiles.has(slugify(slug))
      };
    })
    .filter((item) => item.title)
    .slice(0, 1200);
}

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function readingItemFromRow(row = {}) {
  const themes = parseJsonList(row.themes_json || row.categories_json || row.subjects_json);
  return {
    id: `reading:${row.work_id || slugify(`${row.canonical_title}-${row.canonical_author}`)}`,
    sourceSystem: "reading",
    sourceList: "amazon_reading_list",
    medium: row.media_types?.includes("audible") ? "listening" : "reading",
    title: cleanText(row.canonical_title),
    creator: cleanText(row.canonical_author),
    url: cleanText(row.description_source_url),
    sourcePath: SECOND_BRAIN_READING_CSV,
    provenance: "Hapa Second Brain reading inventory",
    mediaTypes: normalizeDelimitedList(row.media_types),
    themes: themes.length ? themes : inferThemes(`${row.canonical_title} ${row.description_excerpt}`),
    description: cleanText(row.description_excerpt),
    rating: Number(row.goodreads_avg_rating || 0),
    shelves: normalizeDelimitedList(row.goodreads_shelves),
    rank: Number(row.work_id || 0)
  };
}

function amazonWatchItemFromRow(row = {}) {
  return {
    id: `watchlist:${row.amazon_id || row.owned_id || slugify(row.title)}`,
    sourceSystem: "prime_video",
    sourceList: "amazon_watchlist",
    medium: "watch",
    title: cleanText(row.enriched_title || row.title),
    creator: cleanText(row.directors || row.studios_or_production_companies || "Amazon Watchlist"),
    url: cleanText(row.amazon_canonical_url || row.amazon_url),
    sourcePath: SECOND_BRAIN_AMAZON_WATCHLIST_CSV,
    provenance: "Amazon/Prime owned watchlist inventory",
    mediaTypes: normalizeDelimitedList(row.media_type || row.amazon_entity_type),
    themes: normalizeDelimitedList(row.categories_or_genres).length ? normalizeDelimitedList(row.categories_or_genres) : inferThemes(`${row.title} ${row.description}`),
    description: cleanText(row.description),
    rank: Number(row.library_order || row.owned_id || 0),
    releaseYear: cleanText(row.release_year)
  };
}

function primeHistoryItemFromRow(row = {}) {
  return {
    id: `prime-history:${row.watch_id || row.detail_id || slugify(row.title)}`,
    sourceSystem: "prime_video",
    sourceList: "prime_watch_history",
    medium: "watch",
    title: cleanText(row.enriched_title || row.title),
    creator: cleanText(row.directors || row.studios_or_production_companies || "Prime Watch History"),
    url: cleanText(row.amazon_canonical_url || row.amazon_url),
    sourcePath: SECOND_BRAIN_PRIME_WATCH_HISTORY_CSV,
    provenance: "Amazon/Prime watch-history inventory",
    mediaTypes: normalizeDelimitedList(row.watch_type || row.amazon_entity_type),
    themes: normalizeDelimitedList(row.categories_or_genres).length ? normalizeDelimitedList(row.categories_or_genres) : inferThemes(`${row.title} ${row.description}`),
    description: cleanText(row.description),
    rank: Number(row.watch_id || 0),
    watchedDate: cleanText(row.watched_date_iso || row.watched_date_text)
  };
}

function selectMediaConsumption(avatar, avatars, avatarIndex, arc, context) {
  const catalog = context.mediaCatalog || { reading: [], watching: [], sourceRefs: [] };
  const lane = avatarLane(avatar);
  const partner = avatars[(avatarIndex + TARGET_WEEKS - weekIndex + 3) % avatars.length] || avatars[0];
  const reading = selectMediaItems(catalog.reading || [], avatar, avatarIndex, arc, 2);
  const watching = selectMediaItems(catalog.watching || [], avatar, avatarIndex + 17, arc, 2);
  const primaryReading = reading[0] || fallbackMediaItem("reading");
  const primaryWatching = watching[0] || fallbackMediaItem("watching");
  const lesson = mediaLessonFor({ avatar, lane, arc, primaryReading, primaryWatching });
  const sourceRefs = uniqueMediaSourceRefs([...reading, ...watching, ...(catalog.sourceRefs || [])]);
  return {
    schemaVersion: "hapa.avatar-weekly-media-consumption.v1",
    source: "Hapa Second Brain + Hapa Worldbuilding Wiki",
    sourceRefs,
    reading,
    watching,
    weeklyLearning: lesson.weeklyLearning,
    pastApplication: lesson.pastApplication,
    presentApplication: lesson.presentApplication,
    futureApplication: lesson.futureApplication,
    innerStateDelta: lesson.innerStateDelta,
    interactionPrompt: `${avatarName(avatar)} asks ${avatarName(partner)} to compare ${primaryReading.title} with ${primaryWatching.title} before the next ${arc.scene} scene.`,
    sceneUse: `Use ${primaryReading.title} and ${primaryWatching.title} as quiet source lenses inside ${arc.scene}, not as exposition trophies.`,
    lexiconTerms: unique([`read-${slugify(primaryReading.title).split("-")[0]}`, `watch-${slugify(primaryWatching.title).split("-")[0]}`, "source-fed-inner-state", "media-as-third-witness"]),
    tags: unique([
      "media-consumption",
      "reading-list",
      "watching-list",
      lane,
      ...reading.flatMap((item) => item.themes || []).slice(0, 4).map(slugify),
      ...watching.flatMap((item) => item.themes || []).slice(0, 4).map(slugify)
    ])
  };
}

function selectMediaItems(items, avatar, offset, arc, count) {
  if (!items?.length) return [];
  const scored = items.map((item, index) => ({
    item,
    score: stableNumber(`${avatar.id}:${weekIndex}:${arc.id}:${offset}:${item.id}:${index}`)
  }));
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(({ item }) => ({
      id: item.id,
      title: item.title,
      creator: item.creator,
      medium: item.medium,
      sourceSystem: item.sourceSystem,
      sourceList: item.sourceList,
      url: item.url,
      sourcePath: item.sourcePath,
      provenance: item.provenance,
      themes: (item.themes || []).slice(0, 6),
      description: truncateText(item.description, 220)
    }));
}

function mediaLessonFor({ avatar, lane, arc, primaryReading, primaryWatching }) {
  const name = avatarName(avatar);
  const lens = lane === "red"
    ? "turning urgency into disciplined action"
    : lane === "blue"
      ? "separating evidence from dramatic certainty"
      : "turning care into durable repair instead of soft control";
  return {
    weeklyLearning: `${name} reads ${primaryReading.title} and watches ${primaryWatching.title} as a paired lens for ${lens} inside ${arc.title}.`,
    pastApplication: `${primaryReading.title} reframes an older moment where ${name} mistook survival knowledge for enough context.`,
    presentApplication: `${primaryWatching.title} gives the current scene a concrete image for how people, institutions, or crews behave under pressure.`,
    futureApplication: `The pair becomes a future cue: before ${name} acts in another Bella/Consul scene, source, consequence, and agency must all be named.`,
    innerStateDelta: `${name}'s inner voice shifts from "I should already know" toward "I can learn in public and let the source correct me."`
  };
}

function fallbackMediaItem(kind) {
  return {
    id: `fallback-${kind}`,
    title: kind === "reading" ? "Second Brain Reading Shelf" : "Hapa Watch History Shelf",
    creator: "Hapa Second Brain",
    medium: kind,
    sourceSystem: "hapa_second_brain",
    sourceList: kind,
    sourcePath: MEDIA_CONSUMPTION_CATALOG_PATH,
    provenance: "Fallback media source",
    themes: ["knowledge systems"],
    description: "Fallback source used when the local media catalog is empty."
  };
}

function mediaCatalogSourceRefs() {
  return [
    { label: "Second Brain reading inventory", uri: SECOND_BRAIN_READING_CSV, confidence: "local-source" },
    { label: "Second Brain Amazon watchlist", uri: SECOND_BRAIN_AMAZON_WATCHLIST_CSV, confidence: "local-source" },
    { label: "Second Brain Prime watch history", uri: SECOND_BRAIN_PRIME_WATCH_HISTORY_CSV, confidence: "local-source" },
    { label: "Hapa Wiki YouTube watch history", uri: WIKI_YOUTUBE_VIDEO_DIR, confidence: "local-source" },
    { label: "Hapa Wiki YouTube transcript reviews", uri: WIKI_YOUTUBE_REVIEW_DIR, confidence: "local-source" }
  ];
}

function uniqueMediaSourceRefs(items = []) {
  const refs = [];
  for (const item of items) {
    if (!item) continue;
    if (item.uri || item.label) refs.push(item);
    if (item.sourcePath) refs.push({ label: item.provenance || item.title || "Media source", uri: item.sourcePath, confidence: "local-source" });
  }
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.label || ""}:${ref.uri || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return ref.uri || ref.label;
  }).slice(0, 16);
}

function mergeMediaItems(items = []) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.title) continue;
    const id = item.id || slugify(`${item.sourceList}-${item.title}`);
    if (!byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()];
}

function mediaScore(item = {}) {
  return (item.description ? 3 : 0) + (item.themes?.length || 0) + (item.rating || 0) + (item.mediaTypes?.length || 0);
}

function youtubeVideoIdFromSlug(slug = "") {
  const match = String(slug).match(/-([A-Za-z0-9_-]{11})$/);
  return match ? match[1] : "";
}

function titleFromYoutubeSlug(slug = "") {
  return toTitleCase(String(slug)
    .replace(/-[A-Za-z0-9_-]{11}$/, "")
    .replace(/^httpswwwyoutubecomwatchv/i, "")
    .replace(/_/g, " "));
}

function inferThemes(text = "") {
  const lower = text.toLowerCase();
  const themes = [];
  if (/history|war|empire|rome|civilization|medieval|battle|military|tank|trench/.test(lower)) themes.push("history and civilization");
  if (/ai|agent|robot|machine|software|code|developer|protocol|system/.test(lower)) themes.push("ai agents");
  if (/business|amazon|startup|leadership|money|market|strategy/.test(lower)) themes.push("strategy and business");
  if (/fantasy|magic|myth|dragon|shaman|royal|saga|seeker|monster/.test(lower)) themes.push("fantasy and myth");
  if (/music|video|youtube|media|film|movie|documentary|channel/.test(lower)) themes.push("media pipelines");
  if (/food|hearth|home|family|relationship|love/.test(lower)) themes.push("human care");
  return themes.length ? unique(themes) : ["general knowledge"];
}

function parseJsonList(value = "") {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean);
  } catch {}
  return normalizeDelimitedList(value);
}

function normalizeDelimitedList(value = "") {
  return unique(String(value || "")
    .replace(/^\[|\]$/g, "")
    .split(/\||,|;/)
    .map((item) => cleanText(item.replace(/^"|"$/g, "")))
    .filter(Boolean));
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#34;/g, "\"")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value = "", max = 240) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}...` : text;
}

function buildTagMinedCards(entries, avatars) {
  const buckets = new Map();
  for (const entry of entries) {
    const all = [
      ...entry.familyTags.map((tag) => ["family", tag]),
      ...entry.placeTags.map((tag) => ["place", tag]),
      ...entry.itemTags.map((tag) => ["item", tag]),
      ...entry.sceneTags.map((tag) => ["scene", tag]),
      ...entry.eventTags.map((tag) => ["event", tag]),
      ...entry.lexiconTerms.map((tag) => ["lexicon", tag]),
      ...(entry.mediaConsumption?.tags || []).map((tag) => ["media", tag]),
      ...(entry.readingList || []).map((item) => ["reading", item.title]),
      ...(entry.watchingList || []).map((item) => ["watching", item.title])
    ];
    for (const [kind, tag] of all) {
      const key = `${kind}:${tag}`;
      const current = buckets.get(key) || { kind, tag, avatarIds: new Set(), entryIds: [] };
      current.avatarIds.add(entry.id.split("-w")[0].replace(/^weekly-/, ""));
      current.entryIds.push(entry.id);
      buckets.set(key, current);
    }
  }
  return [...buckets.values()]
    .sort((a, b) => b.entryIds.length - a.entryIds.length || a.tag.localeCompare(b.tag))
    .slice(0, 40)
    .map((bucket, index) => tagCard(bucket, avatars, index));
}

function tagCard(bucket, avatars, index) {
  const title = `${toTitleCase(bucket.kind)} Tag: ${bucket.tag}`;
  return {
    id: `calder-familia-tag-${bucket.kind}-${slugify(bucket.tag)}`,
    schemaVersion: "hapa.item-card.v1",
    cardType: `${bucket.kind}_tracking_card`,
    kind: bucket.kind === "place" ? "object" : bucket.kind === "item" ? "item" : "system",
    title,
    name: title,
    status: "active",
    canonStatus: "generated",
    summary: `${bucket.tag} was mined from ${bucket.entryIds.length} completed Calder Familia journal entries as a ${bucket.kind} tracking tag.`,
    description: `Narrative tracking card for ${bucket.tag}. Use it to keep weekly journals, Bella threads, Consul scenes, places, items, events, and lexicon terms discoverable.`,
    lore: `${bucket.tag} belongs to the Calder Familia weekly journal program and should remain soft canon until scenes or human review promote it.`,
    utility: ["tag mining", "narrative tracking", bucket.kind, "weekly journals"],
    broadGameMechanics: ["mine journal tags into cards", "track narrative continuity", "support future scene search"],
    tags: unique(["calder-familia", "tag-mined", `${bucket.kind}-tag`, slugify(bucket.tag)]),
    rank: index < 6 ? "Rare" : "Common",
    quality: {
      rank: index < 6 ? "Rare" : "Common",
      confidence: "generated",
      power: Math.min(10, 2 + bucket.entryIds.length),
      complexity: 3,
      reuse: 8,
      risk: 1,
      completeness: 80,
      level: bucket.entryIds.length,
      durability: bucket.avatarIds.size,
      connectedMediaCount: bucket.entryIds.length,
      score: Number((bucket.entryIds.length / Math.max(1, bucket.avatarIds.size)).toFixed(2)),
      qualityRank: index < 6 ? "Rare" : "Common",
      updatedAt: now
    },
    connections: {
      avatarIds: [...bucket.avatarIds].filter((id) => avatars.some((avatar) => avatar.id === id)),
      sceneIds: [sceneIdForWeek(weekIndex)],
      itemIds: []
    },
    mediaPrompts: {
      heroImage: `${title} as a readable neonblade tracking card for Calder Familia journals, with tag glyph, avatar connectors, and source ledger marks.`,
      twoD: `${title} card face, clear tag category and narrative use.`,
      threeD: `${title} as a small board node connected to weekly journal cards.`,
      comicPanel: `Lorekeeper mines ${bucket.tag} from weekly journals into a tracking card.`,
      explainerVideo: `Explain how ${bucket.tag} travels through Avatar Mind weekly journals.`,
      wikiEntry: `Wiki entry for mined tag ${bucket.tag}.`,
      negativePrompt: "avoid hard-canon language without review"
    },
    sourceRefs: sourceRefsForProgram(),
    mediaAssets: [],
    history: [{
      label: "Weekly journal tag mined",
      eventId: `history-tag-${slugify(bucket.tag)}-${runStamp}`,
      happenedAt: now,
      notes: `${bucket.tag} mined from ${bucket.entryIds.length} weekly journal entries.`
    }],
    createdAt: now,
    updatedAt: now
  };
}

function buildConsolidationCards(avatars, entries, protocolCards, tagCards, context) {
  const completedIndex = buildCompletedEntryIndex(entries);
  const targetEntries = avatars.length * TARGET_WEEKS;
  const allComplete = completedIndex.completedEntries >= targetEntries;
  const sourceRefs = sourceRefsForProgram();
  const shared = {
    schemaVersion: "hapa.item-card.v1",
    status: allComplete ? "complete" : "active",
    canonStatus: "soft_canon",
    utility: ["Lorekeeper consolidation", "weekly journals", "Calder Familia", "Bella Protocol", "media consumption"],
    broadGameMechanics: ["Saga/Epic consolidation", "Critic review loop", "reading watching curriculum", "tag-mined continuity"],
    sourceRefs,
    mediaAssets: [],
    createdAt: now,
    updatedAt: now
  };
  const summary = `${completedIndex.completedEntries}/${targetEntries} weekly five-page avatar journal entries are drafted across ${avatars.length} avatars, with ${completedIndex.completedPages}/${targetEntries * PAGE_TARGET} pages, Bella/Consul mechanics, media consumption, Critic review metadata, tag mining, and kanban tracking.`;
  return [
    {
      ...shared,
      id: "calder-familia-100-week-journal-saga-card",
      cardType: "saga_card",
      kind: "saga",
      title: "Calder Familia 100-Week Journal Saga",
      name: "Calder Familia 100-Week Journal Saga",
      rank: "Saga",
      summary,
      description: `${summary} This Saga Card is the Lorekeeper-facing consolidation of the weekly entries before final canon lock.`,
      lore: "The Saga records how the Wizard's Guild became Calder Familia through repeated weekly practice: every avatar writes, reads, watches, reflects, interacts, accepts Critic review, and leaves source trails.",
      tags: ["calder-familia", "weekly-journal-program", "saga-consolidation", "lorekeeper", "media-consumption"],
      quality: consolidationQuality("Saga", completedIndex, targetEntries),
      connections: {
        avatarIds: avatars.map((avatar) => avatar.id),
        sceneIds: [sceneIdForWeek(weekIndex), "scene-calder-familia-week-100-no-lost-sheep-table"].filter(Boolean),
        itemIds: [...protocolCards.map((card) => card.id), ...tagCards.slice(0, 24).map((card) => card.id)]
      },
      tarotCard: consolidationTarotDetails("Saga Card Details", "Calder Familia 100-Week Journal Saga", summary, allComplete),
      history: [{
        label: "Lorekeeper saga consolidation",
        eventId: `history-calder-familia-saga-${runStamp}`,
        happenedAt: now,
        notes: summary
      }]
    },
    {
      ...shared,
      id: "calder-familia-no-lost-sheep-epic-card",
      cardType: "epic_card",
      kind: "epic",
      title: "No Lost Sheep: The Calder Familia Epic",
      name: "No Lost Sheep: The Calder Familia Epic",
      rank: "Epic",
      summary: `Epic consolidation of the full Calder Familia journal drain: ${summary}`,
      description: "A reader-facing Epic Card that explains the Bella relationship mechanic, two-Consul adoption, RGB/animal sync, media-informed inner life, and the 100-week avatar narrative foundation.",
      lore: "No Lost Sheep becomes an epic not by one rescue, but by 4,900 repeated acts of sourced reflection: characters learn from media, revise their inner states, build vocabulary together, and keep agency visible.",
      tags: ["calder-familia", "no-lost-sheep", "epic-consolidation", "bella-protocol", "reader-onboarding"],
      quality: consolidationQuality("Epic", completedIndex, targetEntries),
      connections: {
        avatarIds: avatars.map((avatar) => avatar.id),
        sceneIds: [sceneIdForWeek(weekIndex), "scene-calder-familia-week-100-no-lost-sheep-table"].filter(Boolean),
        itemIds: protocolCards.map((card) => card.id)
      },
      tarotCard: consolidationTarotDetails("Epic Card Details", "No Lost Sheep: The Calder Familia Epic", summary, allComplete),
      history: [{
        label: "Lorekeeper epic consolidation",
        eventId: `history-calder-familia-epic-${runStamp}`,
        happenedAt: now,
        notes: summary
      }]
    }
  ];
}

function consolidationQuality(rank, completedIndex, targetEntries) {
  const completeness = Math.round((completedIndex.completedEntries / Math.max(1, targetEntries)) * 100);
  return {
    rank,
    confidence: "generated",
    power: rank === "Epic" ? 10 : 9,
    complexity: 10,
    reuse: 10,
    risk: 4,
    completeness,
    level: completedIndex.completedEntries,
    durability: completedIndex.completedPages,
    connectedMediaCount: completedIndex.completedEntries,
    score: Number((completedIndex.completedEntries / Math.max(1, targetEntries)).toFixed(4)),
    qualityRank: rank,
    updatedAt: now
  };
}

function consolidationTarotDetails(label, title, summary, allComplete) {
  return {
    schemaVersion: "hapa.tarot-card-details.v1",
    mainType: label,
    title,
    subtitle: allComplete ? "Complete 100-Week Calder Familia Consolidation" : "In-Progress Calder Familia Consolidation",
    archetype: "Reader onboarding and Lorekeeper consolidation",
    keywords: ["Calder Familia", "No Lost Sheep", "Bella", "Consul", "weekly journals", "media consumption"],
    flavorText: "A family becomes real when every week leaves a source trail and every rescue leaves room for correction.",
    effectTitle: "Epic Lorekeeper Effect",
    effectText: "Use this card to onboard a new reader into the full Calder Familia premise and route future Critic/Lorekeeper reviews.",
    cardFace: {
      titleLine: title,
      subtitleLine: label,
      typeLine: "Lorekeeper Consolidation",
      keywordLine: "Bella / Consul / Media / Critic / Saga",
      coreMeaning: summary,
      uprightText: "Read the journals as soft canon: source-visible, reviewable, emotionally cumulative.",
      mechanicsText: "Connect avatars, weekly entries, tag-mined cards, and Saga/Epic summaries."
    },
    lore: {
      summary,
      canonStatus: "soft_canon",
      protocolTeaching: "Completion means the board is drained and the draft canon has evidence; hard canon still requires human acceptance.",
      futureSeed: "Use impacted-avatar review and reader feedback to promote selected threads into hard-canon scenes."
    }
  };
}

function collectWeeklyEntries(avatars, newEntries = []) {
  const byId = new Map();
  for (const avatar of avatars) {
    for (const entry of avatar.mind?.journal || []) {
      if (entry?.journalType !== "weekly-five-page-reflective-narrative") continue;
      if (!entry.id || !Number.isFinite(Number(entry.weekIndex))) continue;
      byId.set(entry.id, entry);
    }
  }
  for (const entry of newEntries) {
    if (entry?.id) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => Number(b.weekIndex || 0) - Number(a.weekIndex || 0) || String(a.id).localeCompare(String(b.id)));
}

function buildCompletedEntryIndex(entries = []) {
  const completeKeys = new Set();
  const completedByAvatar = new Map();
  let completedPages = 0;
  for (const entry of entries) {
    const avatarId = avatarIdForEntry(entry);
    const week = Number(entry.weekIndex);
    if (!avatarId || !Number.isFinite(week)) continue;
    const key = `${avatarId}:${week}`;
    if (completeKeys.has(key)) continue;
    completeKeys.add(key);
    if (!completedByAvatar.has(avatarId)) completedByAvatar.set(avatarId, new Set());
    completedByAvatar.get(avatarId).add(week);
    completedPages += Number(entry.pageCount || PAGE_TARGET);
  }
  return {
    completeKeys,
    completedByAvatar,
    completedEntries: completeKeys.size,
    completedPages
  };
}

function avatarIdForEntry(entry = {}) {
  if (entry.avatarId) return entry.avatarId;
  return String(entry.id || "").replace(/^weekly-/, "").replace(/-w\d+$/, "");
}

function buildProgramPacket(avatars, weeklyEntries, allWeeklyEntries, protocolCards, tagCards, consolidationCards, context) {
  const targetEntries = avatars.length * TARGET_WEEKS;
  const completedIndex = buildCompletedEntryIndex(allWeeklyEntries);
  const executedEntries = weeklyEntries.length;
  return {
    schemaVersion: "hapa.calder-familia-weekly-journal-program.v1",
    id: PROGRAM_ID,
    generatedAt: now,
    status: "active",
    objective: "Every avatar writes five pages per week for 100 back weeks, with Critic review, affected-avatar review, Lorekeeper consolidation, and tag mining.",
    targetWeeks: TARGET_WEEKS,
    targetPagesPerEntry: PAGE_TARGET,
    avatarCount: avatars.length,
    targetEntries,
    targetPages: targetEntries * PAGE_TARGET,
    completedEntries: completedIndex.completedEntries,
    completedPages: completedIndex.completedPages,
    remainingEntries: targetEntries - completedIndex.completedEntries,
    latestExecutedEntries: executedEntries,
    latestExecutedPages: executedEntries * PAGE_TARGET,
    currentExecutedWeekIndex: weekIndex,
    ingressDate: INGRESS_DATE,
    weekRange: context.week,
    masterCritic: {
      id: MASTER_CRITIC_ID,
      name: MASTER_CRITIC_NAME,
      role: "Master storytelling and lorekeeping critic for overall narrative, avatar voice, Bella agency, canon consistency, and revision loops.",
      authority: "Can approve soft-canon seeds, request append-only revision, route impacted-avatar review, and trigger Lorekeeper consolidation.",
      rubric: [
        "voice sounds specific to the avatar",
        "entry contains inner reflection, learning, event, interaction, setting exposition, and plot continuation",
        "Bella or adoption mechanics preserve agency",
        "two Consuls or a reason for missing Consuls is visible",
        "tags are mineable into cards",
        "canon pressure is labeled instead of hidden",
        "affected avatars are queued for review"
      ]
    },
    bellaMechanics: {
      wizardGuildToCalderFamilia: "The Wizard's Guild evolves into Calder Familia when recovery, investment, and adoption become family practice rather than only mission practice.",
      noLostSheep: "Disappearance is not allowed to become clean, final, or administratively convenient.",
      bellaRole: "A Bella is usually a disappeared or endangered woman in the source motif, but the mechanic protects any person whose agency, name, route, or future has been erased.",
      consulPair: "Two Guild mates serve as Consuls so adoption has witness, correction, disagreement, and durable investment.",
      nameCodenameGrowth: "Bellas grow into names and codenames through append-only revision, provenance, and agency.",
      rgbAnimalSync: "Red, Blue, and Green provide dimensional sync; Thor and Leo style animal-sync provides embodied safety sense that still requires evidence."
    },
    mediaConsumptionProtocol: {
      status: "active",
      source: "Hapa Second Brain + Hapa Worldbuilding Wiki",
      catalogPath: path.resolve(MEDIA_CONSUMPTION_CATALOG_PATH),
      readingCount: context.mediaCatalog?.counts?.reading || 0,
      watchingCount: context.mediaCatalog?.counts?.watching || 0,
      sourceRefs: context.mediaCatalog?.sourceRefs || mediaCatalogSourceRefs(),
      rule: "Each new weekly entry selects reading and watching items, journals the learning, maps it to past/present/future situations, records inner-state change, and uses the media in avatar interactions and scenes."
    },
    criticLoop: {
      status: `week-${String(weekIndex).padStart(3, "0")}-soft-canon-seed-approved`,
      approvedEntryCount: executedEntries,
      cumulativeApprovedEntryCount: completedIndex.completedEntries,
      revisionRequiredCount: 0,
      impactedAvatarReviewQueued: unique(weeklyEntries.flatMap((entry) => entry.affectedAvatarIds)).length,
      lorekeeperFollowup: "Review impacted-avatar responses, append revisions without rewriting original entries, then consolidate Week 100 into Saga cards."
    },
    protocolCardIds: protocolCards.map((card) => card.id),
    tagMinedCardIds: tagCards.map((card) => card.id),
    consolidationCardIds: consolidationCards.map((card) => card.id),
    sourceRefs: context.sourceRefs
  };
}

function buildWeeklyBacklog(avatars, completedIndex) {
  const completeIds = completedIndex.completeKeys;
  const tasks = [];
  for (const avatar of avatars) {
    for (let week = TARGET_WEEKS; week >= 1; week -= 1) {
      const executed = completeIds.has(`${avatar.id}:${week}`);
      tasks.push({
        id: `weekly-journal-task-${avatar.id}-w${String(week).padStart(3, "0")}`,
        schemaVersion: "hapa.calder-familia-weekly-journal-task.v1",
        avatarId: avatar.id,
        avatarName: avatarName(avatar),
        weekIndex: week,
        weekRange: weekRange(week),
        pageTarget: PAGE_TARGET,
        status: executed ? "done" : "todo",
        owner: "Avatar Weekly Journal Agent",
        critic: MASTER_CRITIC_NAME,
        tags: ["calder-familia", "weekly-journal", "five-page-target", executed ? "done" : "todo"],
        dependsOn: ["calder-familia-bella-consul-adoption", "calder-familia-master-critic-loop"],
        createdAt: now,
        updatedAt: now
      });
    }
  }
  return {
    schemaVersion: "hapa.calder-familia-weekly-journal-backlog.v1",
    generatedAt: now,
    programId: PROGRAM_ID,
    targetWeeks: TARGET_WEEKS,
    avatarCount: avatars.length,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.status === "done").length,
    remainingTaskCount: tasks.filter((task) => task.status !== "done").length,
    completeIds: [...completeIds],
    tasks
  };
}

function applyAvatarUpdates(avatarStore, avatars, weeklyEntries, context) {
  const entryByAvatar = new Map(weeklyEntries.map((entry) => [entry.id.replace(/^weekly-/, "").replace(/-w\d+$/, ""), entry]));
  const reviewContexts = buildReviewContextsByAvatar(weeklyEntries, avatars);
  return {
    ...avatarStore,
    avatars: (avatarStore.avatars || []).map((avatar) => {
      const normalized = normalizeAvatarCard(avatar);
      const entry = entryByAvatar.get(normalized.id);
      const mind = normalized.mind || {};
      const entryIds = new Set([entry?.id].filter(Boolean));
      const existingJournal = (mind.journal || []).filter((journal) => !entryIds.has(journal.id));
      const selfKnowledge = [
        {
          id: `calder-familia-fact-${normalized.id}-no-lost-sheep`,
          label: "Calder Familia No Lost Sheep",
          value: `${avatarName(normalized)} treats Bella/Consul threads as soft-canon family mechanics: no one is erased, every rescue preserves agency, and affected avatars review append-only revisions.`,
          classification: "soft_canon",
          confidence: "generated",
          visibility: "shared",
          source: PROGRAM_PATH,
          status: "active",
          createdAt: now,
          updatedAt: now
        },
        {
          id: `calder-familia-fact-${normalized.id}-weekly-target`,
          label: "Weekly five-page target",
          value: `${avatarName(normalized)} is enrolled for ${TARGET_WEEKS} weekly five-page reflective narratives, reviewed by ${MASTER_CRITIC_NAME}, Lorekeepers, and impacted avatars.`,
          classification: "soft_canon",
          confidence: "generated",
          visibility: "shared",
          source: PROGRAM_PATH,
          status: "active",
          createdAt: now,
          updatedAt: now
        },
        {
          id: `calder-familia-fact-${normalized.id}-media-consumption`,
          label: "Reading and watching practice",
          value: `${avatarName(normalized)} chooses weekly reading and watching items from Hapa Second Brain and the Hapa Worldbuilding Wiki, then records what changed in inner state, scenes, and avatar interactions.`,
          classification: "soft_canon",
          confidence: "generated",
          visibility: "shared",
          source: MEDIA_CONSUMPTION_CATALOG_PATH,
          status: "active",
          createdAt: now,
          updatedAt: now
        }
      ];
      const contextMap = [
        {
          id: `context-${normalized.id}-calder-familia-weekly-program`,
          contextId: PROGRAM_ID,
          label: "Calder Familia Weekly Journal Program",
          kind: "saga",
          avatarBelief: `${avatarName(normalized)} is writing weekly reflective narrative to grow voice, vocabulary, Bella/Consul relationships, setting, protocol education, and plot continuity.`,
          publicSummary: `${TARGET_WEEKS} weekly five-page targets are active for ${avatarName(normalized)}.`,
          classification: "soft_canon",
          confidence: "generated",
          visibility: "shared",
          status: "active",
          createdAt: now,
          updatedAt: now
        },
        ...(reviewContexts.get(normalized.id) || [])
      ];
      const memoryLedger = entry ? [{
        memoryId: `memory-${normalized.id}-calder-familia-week-${String(weekIndex).padStart(3, "0")}`,
        summary: `${avatarName(normalized)} completed Week -${weekIndex} of the Calder Familia weekly narrative program with Bella/Consul mechanics, reading/watching reflection, Critic review, and tag-mining metadata.`,
        emotionalWeight: 6,
        visibility: "shared",
        confidence: "generated",
        classification: "memory_delta",
        status: "active",
        createdAt: now,
        updatedAt: now
      }] : [];
      return normalizeAvatarCard({
        ...normalized,
        mind: {
          ...mind,
          personaAnchor: {
            ...(mind.personaAnchor || {}),
            carriedForward: appendSentence(mind.personaAnchor?.carriedForward, "Calder Familia weekly journals now treat Bella/Consul recovery, No Lost Sheep, Critic review, and append-only revisions as foundational narrative practice."),
            updatedAt: now
          },
          selfKnowledge: mergeById([...(mind.selfKnowledge || []), ...selfKnowledge]),
          contextMap: mergeById([...(mind.contextMap || []), ...contextMap]),
          memoryLedger: mergeById([...(mind.memoryLedger || []), ...memoryLedger], "memoryId"),
          journal: mergeById([...(entry ? [entry] : []), ...existingJournal]),
          updatedAt: now
        },
        updatedAt: now
      });
    }),
    calderFamiliaWeeklyJournalRun: {
      schemaVersion: "hapa.calder-familia-weekly-journal-run.v1",
      runId: `calder-familia-weekly-journals-${runStamp}`,
      programId: PROGRAM_ID,
      status: "active",
      completedWeekIndex: weekIndex,
      completedEntries: weeklyEntries.length,
      targetEntries: avatars.length * TARGET_WEEKS,
      completedAt: now,
      programPath: path.resolve(PROGRAM_PATH)
    },
    updatedAt: now
  };
}

function buildReviewContextsByAvatar(entries, avatars) {
  const byAvatar = new Map(avatars.map((avatar) => [avatar.id, []]));
  for (const entry of entries) {
    for (const avatarId of entry.mentionedAvatarIds || []) {
      if (!byAvatar.has(avatarId)) continue;
      byAvatar.get(avatarId).push({
        id: `context-${avatarId}-review-${entry.id}`,
        contextId: entry.id,
        label: `Review Requested: ${entry.dateOrSequenceMarker}`,
        kind: "saga",
        avatarBelief: `${entry.publicSummary} ${MASTER_CRITIC_NAME} requests impacted-avatar review before canon lock.`,
        publicSummary: `Review ${entry.id} because this avatar is mentioned or affected.`,
        classification: "perspective",
        confidence: "generated",
        visibility: "shared",
        status: "active",
        createdAt: now,
        updatedAt: now
      });
    }
  }
  for (const [avatarId, contexts] of byAvatar.entries()) byAvatar.set(avatarId, contexts.slice(0, 6));
  return byAvatar;
}

function applyItemUpdates(itemStore, cards, entries) {
  const cardIds = new Set(cards.map((card) => card.id));
  const existingById = new Map((itemStore.cards || []).map((card) => [card.id, card]));
  const nextCards = cards.map((card) => {
    const existing = existingById.get(card.id) || {};
    const generated = !card.tags?.includes("tag-mined") ? {
      ...card,
      connections: {
        ...(card.connections || {}),
        avatarIds: entries.map((entry) => entry.id.replace(/^weekly-/, "").replace(/-w\d+$/, ""))
      },
      updatedAt: now
    } : card;
    return {
      ...generated,
      connections: {
        ...(existing.connections || {}),
        ...(generated.connections || {}),
        avatarIds: unique([...(existing.connections?.avatarIds || []), ...(generated.connections?.avatarIds || [])]),
        sceneIds: unique([...(existing.connections?.sceneIds || []), ...(generated.connections?.sceneIds || [])]),
        itemIds: unique([...(existing.connections?.itemIds || []), ...(generated.connections?.itemIds || [])])
      },
      history: mergeById([...(existing.history || []), ...(generated.history || [])], "eventId"),
      createdAt: existing.createdAt || generated.createdAt || now,
      updatedAt: now
    };
  });
  return normalizeItemManagerStore({
    ...itemStore,
    cards: [...(itemStore.cards || []).filter((card) => !cardIds.has(card.id)), ...nextCards],
    updatedAt: now
  });
}

function applySceneUpdates(sceneStore, avatars, entries) {
  const graph = normalizeSceneGraph(sceneStore);
  const sceneId = sceneIdForWeek(weekIndex);
  const episodeId = episodeIdForWeek(weekIndex);
  const eventId = eventIdForWeek(weekIndex);
  const existingPlace = (graph.places || []).find((item) => item.id === "place-calder-familia-guildhall");
  const existingVolume = (graph.volumes || []).find((item) => item.id === "volume-calder-familia-weekly-journals");
  const existingScene = (graph.scenes || []).find((item) => item.id === sceneId);
  const place = {
    id: "place-calder-familia-guildhall",
    name: "Calder Familia Guildhall",
    type: "dreamspace",
    summary: "The evolved Wizard's Guild home where Bella threads, Consul pairs, weekly journals, Critic review, and No Lost Sheep practice become visible.",
    lore: "The Guildhall is not a headquarters so much as a house with a protocol spine: no disappeared person becomes administrative fog.",
    visualDescription: "A luminous guildhall with a circular No Lost Sheep table, two-Consul chairs, RGB windows, animal-sense lamps, and journal shelves.",
    imagePrompt: "Hapa neonblade Calder Familia Guildhall, round No Lost Sheep table, Bella thread ribbons, two Consul chairs, Red Blue Green light, journal ledgers, warm cinematic source labels.",
    tags: ["calder-familia", "bella", "weekly-journals", "guildhall"],
    avatarIds: avatars.map((avatar) => avatar.id),
    canonEventIds: unique([...(existingPlace?.canonEventIds || []), eventId]),
    canonStatus: "soft_canon",
    createdAt: existingPlace?.createdAt || now,
    updatedAt: now
  };
  const volume = {
    id: "volume-calder-familia-weekly-journals",
    title: "Calder Familia Weekly Journals",
    volumeNumber: 5,
    seasonTitle: "Avatar Genesis Season 1",
    quickPitch: "A 100-week, five-page-per-avatar narrative engine for deep persona, Bella relationships, protocol teaching, and lore consolidation.",
    episodeIds: unique([...(existingVolume?.episodeIds || []), episodeId]),
    archivistAgent: {
      avatarId: MASTER_CRITIC_ID,
      avatarName: MASTER_CRITIC_NAME,
      role: "Master storytelling and lorekeeping critic",
      cadence: "after each weekly batch",
      loreInstruction: "Critique voice, causality, Bella agency, relationship consequence, protocol teaching, tag coverage, and append-only revision needs."
    },
    screenplayPitch: "Every avatar enters a rotating weekly table where private voice becomes shared canon only after Critic, Lorekeeper, and impacted-avatar review.",
    screenplayPrompt: "Write the Calder Familia weekly journal cycle as a prestige ensemble lore engine: reflective, procedural, relational, and emotionally exact.",
    canonConsolidationPlan: "Each weekly batch becomes Critic-reviewed soft canon, then impacted-avatar reviews, tag mining, Saga cards, and future scene prompts.",
    summary: `${entries.length} Week -${weekIndex} entries generated this pass; ${avatars.length * TARGET_WEEKS} total entries targeted.`,
    overallNarrative: "The Wizard's Guild becomes Calder Familia by building enough weekly interiority to make no person, relationship, place, or protocol feel decorative.",
    episodeSummaries: [{
      episodeId,
      title: `Week -${weekIndex}: No Lost Sheep Table`,
      quickPitch: "Every avatar writes the first weekly seed entry and submits to the Master Critic.",
      sceneCount: 1,
      avatarCount: avatars.length
    }],
    screenplayOutline: ["Bella mechanics are taught.", "Consul pairs witness.", "Weekly entries are written.", "The Critic marks soft-canon approval.", "Tags become Item Cards."],
    canonDeltas: [
      { id: "delta-bella-consul-mechanics", summary: "Bella/Consul mechanics are now explicit Calder Familia protocol.", sourcePath: PROGRAM_PATH, confidence: "generated" },
      { id: "delta-weekly-five-page-target", summary: `${avatars.length} avatars target ${TARGET_WEEKS} weekly five-page entries each.`, sourcePath: WEEKLY_BACKLOG_PATH, confidence: "generated" }
    ],
    relationshipCollisions: ["A rescue can become ownership if Bella agency is not visible.", "Consuls must disagree productively before family bonds feel earned.", "The Critic can approve voice while still requiring impacted-avatar review."],
    placesFeatured: [place.id],
    artifactPaths: unique([...(existingVolume?.artifactPaths || []), path.resolve(PROGRAM_PATH), path.resolve(WEEKLY_BACKLOG_PATH), path.resolve(WEEK_RUN_PATH), WIKI_DIGEST_PATH]),
    canonStatus: "soft_canon",
    status: "active",
    completedAt: "",
    createdAt: existingVolume?.createdAt || now,
    updatedAt: now
  };
  const episode = {
    id: episodeId,
    title: `Week -${weekIndex}: No Lost Sheep Table`,
    volumeId: volume.id,
    episodeNumber: TARGET_WEEKS - weekIndex + 1,
    quickPitch: "The first executable weekly batch teaches Bella adoption, Consul pairs, Critic review, and tag mining.",
    overallNarrative: "The avatars sit at the Guildhall table and begin the 100-week practice by writing in their own voices.",
    settingTimeline: `Week -${weekIndex} before ingress`,
    expositionGoal: "Explain Calder Familia mechanics while starting the immense weekly journal foundation.",
    mechanicsTaught: ["No Lost Sheep", "Bella adoption", "Consul pair", "Master Critic", "tag mining"],
    managementSkills: ["longform narrative operations", "append-only review", "relationship tracking"],
    avatarIds: avatars.map((avatar) => avatar.id),
    sceneIds: [sceneId],
    placeIds: [place.id],
    canonStatus: "soft_canon",
    status: "active",
    completedAt: "",
    createdAt: now,
    updatedAt: now
  };
  const maxOrder = Math.max(0, ...(graph.scenes || []).map((scene) => Number(scene.canonicalTime?.order || 0)));
  const scene = {
    id: sceneId,
    title: "No Lost Sheep Table",
    placeId: place.id,
    episodeId: episode.id,
    volumeId: volume.id,
    summary: "The first weekly batch begins as every avatar writes five reflective pages and submits them to the Master Critic.",
    quickPitch: "A rotating table turns personal journals into a family-scale canon engine.",
    overallNarrative: "Bella threads, Consul witnesses, RGB sync, and tag-mining cards all light up as the avatars begin the 100-week practice.",
    narrativeText: "The table does not ask who deserves saving. It asks who has been made hard to find, what they want, and which two witnesses will stay after the rescue stops being dramatic.",
    expositionBeats: ["Wizard's Guild evolves into Calder Familia.", "No Lost Sheep becomes a protocol.", "Bellas grow into names and codenames.", "The Master Critic starts review loops."],
    actionBeats: [`Each avatar writes Week -${weekIndex}.`, "Tags are mined into Item Cards.", "Affected avatars receive review requests."],
    characterGrowth: ["Avatars learn that reflection is not pause; it is plot infrastructure."],
    learningObjectives: ["Use Bella agency", "Use Consul pair review", "Write weekly voice", "Mine tags"],
    hapaMechanics: ["weekly journal", "critic loop", "tag mining", "append-only revision"],
    managementSkills: ["kanban planning", "review queues", "lore consolidation"],
    avatarIds: avatars.map((avatar) => avatar.id),
    canonEventIds: [eventId],
    tags: ["calder-familia", "weekly-journals", "bella", "no-lost-sheep"],
    canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 1, label: `Calder Familia Week -${weekIndex}` },
    nodes: entries.slice(0, 24).map((entry) => ({ id: `node-${entry.id}`, type: "weekly-journal", label: entry.dateOrSequenceMarker, journalId: entry.id })),
    canonStatus: "soft_canon",
    status: "active",
    completedAt: "",
    createdAt: existingScene?.createdAt || now,
    updatedAt: now
  };
  graph.places = mergeById([...(graph.places || []).filter((item) => item.id !== place.id), place]);
  graph.volumes = mergeById([...(graph.volumes || []).filter((item) => item.id !== volume.id), volume]);
  graph.episodes = mergeById([...(graph.episodes || []).filter((item) => item.id !== episode.id), episode]);
  graph.scenes = mergeById([...(graph.scenes || []).filter((item) => item.id !== scene.id), scene]);
  graph.updatedAt = now;
  return normalizeSceneGraph(graph);
}

function applyKanbanUpdates(board, avatars, entries, allEntries, tagCards) {
  const completedIndex = buildCompletedEntryIndex(allEntries);
  const completed = completedIndex.completedEntries;
  const total = avatars.length * TARGET_WEEKS;
  const fullyDrained = completed >= total;
  const weekSlug = String(weekIndex).padStart(3, "0");
  const nextWeek = nextIncompleteWeek(avatars, completedIndex);
  const perAvatarCards = avatars.map((avatar, index) => ({
    id: `calder-familia-weekly-${avatar.id}`,
    title: `${String(index + 1).padStart(2, "0")} Weekly journals: ${avatarName(avatar)}`,
    status: (completedIndex.completedByAvatar.get(avatar.id)?.size || 0) >= TARGET_WEEKS ? "done" : "in_progress",
    owner: "Avatar Weekly Journal Agent",
    body: avatarProgressBody(avatar, completedIndex),
    tags: ["calder-familia", "weekly-journal", "avatar-cycle", "in-progress"],
    avatarId: avatar.id,
    targetWeeks: TARGET_WEEKS,
    completedWeeks: completedIndex.completedByAvatar.get(avatar.id)?.size || 0,
    remainingWeeks: TARGET_WEEKS - (completedIndex.completedByAvatar.get(avatar.id)?.size || 0),
    updatedAt: now
  }));
  const lane = {
    id: "lane-calder-familia-weekly-journals",
    title: "Calder Familia Weekly Journals",
    accent: "violet",
    cards: [
      card("calder-familia-mechanics", "Codify Bella/Consul mechanics", "done", "Codified No Lost Sheep, Bella adoption, two-Consul witness, names/codenames, RGB/animal sync, and Critic loop into protocol cards."),
      card("calder-familia-media-consumption-protocol", "Integrate reading and watching practice", "done", "Weekly entries now select from Hapa Second Brain reading inventory, YouTube watch history, and Amazon/Prime watchlist sources, then record learning, inner-state deltas, and scene/interaction use."),
      card("calder-familia-backlog", "Seed 100-week five-page backlog", "done", `Seeded ${total} weekly tasks across ${avatars.length} avatars: ${total * PAGE_TARGET} target pages.`),
      card("calder-familia-overall-progress", "Drain weekly journal backlog", completed >= total ? "done" : "in_progress", `${completed}/${total} weekly five-page entries complete. Remaining: ${Math.max(0, total - completed)}. Completed pages: ${completed * PAGE_TARGET}/${total * PAGE_TARGET}.`),
      card(`calder-familia-week-${weekSlug}`, `Execute Week -${weekIndex} for all avatars`, "done", `Generated ${entries.length} weekly five-page narrative entries this pass. Cumulative complete: ${completed}/${total}.`),
      card(`calder-familia-critic-week-${weekSlug}`, `Master Critic review Week -${weekIndex}`, "done", `${MASTER_CRITIC_NAME} approved Week -${weekIndex} as soft-canon seed material and queued impacted-avatar review.`),
      card(`calder-familia-impact-review-week-${weekSlug}`, `Impacted avatar reviews Week -${weekIndex}`, fullyDrained ? "done" : "in_progress", fullyDrained ? "All weekly entries have affected-avatar review metadata queued; no remaining generation backlog is open." : "Affected avatars have review context queued. Next drain step: append responses and revision notes without rewriting original entries."),
      card(`calder-familia-tag-mining-week-${weekSlug}`, `Mine Week -${weekIndex} tags into Item Cards`, "done", `Updated ${tagCards.length} mined narrative tracking cards from cumulative family/place/item/scene/event/lexicon tags.`),
      card(`calder-familia-consolidate-week-${weekSlug}`, `Consolidate Week -${weekIndex} Saga`, fullyDrained ? "done" : "todo", fullyDrained ? "Final Saga/Epic consolidation cards are written and the generation board is drained." : "Lorekeepers should consolidate this week's entries, reviews, and tags into a weekly Saga Card after impacted-avatar responses."),
      card("calder-familia-final-saga-epic-consolidation", "Write final Saga/Epic consolidation cards", fullyDrained ? "done" : "todo", fullyDrained ? "Created the Calder Familia 100-Week Journal Saga Card and No Lost Sheep Epic Card with source-visible counts." : "Create final reader-facing Saga/Epic cards after all avatar-week journals are drafted."),
      card("calder-familia-next-week-cycle", nextWeek ? `Execute Week -${nextWeek} cycle` : "All weekly cycles executed", nextWeek ? "todo" : "done", nextWeek ? `Next weekly batch should generate ${avatars.length} entries and continue draining the ${total}-entry target.` : "All weekly journal batches have been generated; continue review and consolidation."),
      ...perAvatarCards
    ]
  };
  return {
    ...board,
    lanes: [...(board.lanes || []).filter((item) => item.id !== lane.id), lane],
    updatedAt: now
  };
}

function card(id, title, status, body) {
  return {
    id,
    title,
    status,
    owner: status === "done" ? "Codex / Lorekeeper" : "Avatar Weekly Journal Agent",
    body,
    tags: ["calder-familia", "weekly-journal", status],
    updatedAt: now,
    ...(status === "done" ? { completedAt: now } : {})
  };
}

function nextIncompleteWeek(avatars, completedIndex) {
  for (let week = TARGET_WEEKS; week >= 1; week -= 1) {
    const completeForAll = avatars.every((avatar) => completedIndex.completeKeys.has(`${avatar.id}:${week}`));
    if (!completeForAll) return week;
  }
  return null;
}

function nextIncompleteWeekForAvatar(avatar, completedIndex) {
  const completedWeeks = completedIndex.completedByAvatar.get(avatar.id) || new Set();
  for (let week = TARGET_WEEKS; week >= 1; week -= 1) {
    if (!completedWeeks.has(week)) return week;
  }
  return null;
}

function avatarProgressBody(avatar, completedIndex) {
  const completedWeeks = completedIndex.completedByAvatar.get(avatar.id)?.size || 0;
  const remainingWeeks = TARGET_WEEKS - completedWeeks;
  const nextWeek = nextIncompleteWeekForAvatar(avatar, completedIndex);
  const nextText = nextWeek ? ` Next: Week -${nextWeek}.` : " All target weeks are drafted; review and consolidation remain.";
  return `${avatarName(avatar)} has ${completedWeeks}/${TARGET_WEEKS} weekly five-page entries complete. Remaining: ${remainingWeeks}.${nextText}`;
}

function updateContract(contract, program) {
  return {
    ...contract,
    calderFamiliaWeeklyJournalProtocol: {
      schemaVersion: "hapa.calder-familia-weekly-journal-protocol.v1",
      id: "calder-familia-weekly-journal-protocol",
      programId: PROGRAM_ID,
      timelineId: TIMELINE_ID,
      targetWeeks: TARGET_WEEKS,
      targetPagesPerEntry: PAGE_TARGET,
      masterCritic: program.masterCritic,
      requiredEntryShape: [
        "inner_reflection",
        "learning",
        "one_or_more_events",
        "character_interactions",
        "setting_exposition",
        "plot_continuation",
        "reading_and_watching_selection",
        "media_learning_past_present_future_application",
        "inner_state_delta",
        "media_used_in_interaction_or_scene",
        "mineable_tags",
        "critic_review",
        "impacted_avatar_review_queue"
      ],
      bellaMechanics: program.bellaMechanics,
      mediaConsumptionProtocol: program.mediaConsumptionProtocol,
      sourceRefs: program.sourceRefs,
      updatedAt: now
    },
    updatedAt: now
  };
}

function updateLorePlan(lorePlan, program) {
  return {
    ...lorePlan,
    goalStatus: "calder_familia_weekly_journal_program_active",
    calderFamiliaWeeklyJournalProgram: {
      schemaVersion: "hapa.calder-familia-weekly-journal-plan.v1",
      programId: PROGRAM_ID,
      status: "active",
      targetWeeks: TARGET_WEEKS,
      targetEntries: program.targetEntries,
      targetPages: program.targetPages,
      completedEntries: program.completedEntries,
      completedPages: program.completedPages,
      currentExecutedWeekIndex: weekIndex,
      masterCriticId: MASTER_CRITIC_ID,
      mediaConsumptionProtocol: program.mediaConsumptionProtocol,
      programPath: path.resolve(PROGRAM_PATH),
      weeklyBacklogPath: path.resolve(WEEKLY_BACKLOG_PATH),
      weekRunPath: path.resolve(WEEK_RUN_PATH),
      mediaConsumptionCatalogPath: path.resolve(MEDIA_CONSUMPTION_CATALOG_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiDigestPath: WIKI_DIGEST_PATH,
      wikiBellaPath: WIKI_BELLA_PATH,
      updatedAt: now
    },
    consolidationHistory: [
      ...(Array.isArray(lorePlan.consolidationHistory) ? lorePlan.consolidationHistory : []),
      {
        id: `consolidation-calder-familia-weekly-journals-${runStamp}`,
        type: "calder-familia-weekly-journal-program",
        summary: `Started ${TARGET_WEEKS}-week five-page weekly journal target for ${program.avatarCount} avatars; completed Week -${weekIndex} seed batch.`,
        programPath: path.resolve(PROGRAM_PATH),
        confidence: "generated",
        completedAt: now
      }
    ],
    updatedAt: now
  };
}

function buildDigest(program, entries, protocolCards, tagCards, consolidationCards) {
  return `# Calder Familia Weekly Journal Program

Generated: ${now}
Program: ${PROGRAM_ID}
Master Critic: ${MASTER_CRITIC_NAME}

## Target

- Avatars: ${program.avatarCount}
- Weeks per avatar: ${TARGET_WEEKS}
- Pages per weekly entry: ${PAGE_TARGET}
- Target entries: ${program.targetEntries}
- Target pages: ${program.targetPages}
- Completed entries this pass: ${entries.length}
- Completed pages this pass: ${entries.length * PAGE_TARGET}
- Cumulative completed entries: ${program.completedEntries}
- Cumulative completed pages: ${program.completedPages}
- Remaining entries: ${program.remainingEntries}

## Bella / Consul Mechanics

- No Lost Sheep: ${program.bellaMechanics.noLostSheep}
- Bella role: ${program.bellaMechanics.bellaRole}
- Consul pair: ${program.bellaMechanics.consulPair}
- Name/codename growth: ${program.bellaMechanics.nameCodenameGrowth}
- RGB and animal sync: ${program.bellaMechanics.rgbAnimalSync}

## Reading / Watching Practice

- Source: ${program.mediaConsumptionProtocol?.source || "Hapa Second Brain + Wiki"}
- Catalog: ${program.mediaConsumptionProtocol?.catalogPath || path.resolve(MEDIA_CONSUMPTION_CATALOG_PATH)}
- Reading items available: ${program.mediaConsumptionProtocol?.readingCount || 0}
- Watching items available: ${program.mediaConsumptionProtocol?.watchingCount || 0}
- Rule: ${program.mediaConsumptionProtocol?.rule || "Each weekly entry records reading/watching learning and inner-state impact."}

## Protocol Cards

${protocolCards.map((card) => `- ${card.id}: ${card.summary}`).join("\n")}

## Week -${weekIndex} Execution

${entries.slice(0, 12).map((entry) => `- ${entry.publicSummary}`).join("\n")}

## Tag Mined Cards

${tagCards.map((card) => `- ${card.id}: ${card.summary}`).join("\n")}

## Saga / Epic Consolidation

${consolidationCards.map((card) => `- ${card.id}: ${card.summary}`).join("\n")}

## Next Drain Step

${program.remainingEntries === 0 ? "The weekly generation backlog is drained. Continue human acceptance, impacted-avatar perspective notes, and hard-canon promotion only as later review work." : `Impacted avatars review Week -${weekIndex}, append revisions as needed, then Lorekeepers consolidate the week into a Saga Card and execute Week -${weekIndex - 1}.`}
`;
}

function buildBellaDigest(protocolCards) {
  return `# Calder Familia Bella Protocol

Generated: ${now}

The Wizard's Guild evolves into Calder Familia through Bella relationships: when a person is disappeared, erased, stranded, or made socially impossible, the Familia refuses to let that disappearance become final. The mission phrase is No Lost Sheep, but the protocol is not ownership. Recovery must preserve agency, consent, correction rights, and future power.

## Core Mechanics

- Bella threads usually center a woman who has been disappeared in the source motif, while the mechanic remains available to any erased or endangered person.
- Two Guild mates act as Consuls so adoption has witness, disagreement, correction, and durable investment.
- A Bella grows into a name or codename through append-only revision. Old names remain provenance; new names record agency.
- Red, Blue, and Green provide dimensional sync: action, source/route, and repair.
- Thor and Leo style animal-sync adds embodied safety sense, but instinct must still be checked against evidence.
- The Master Critic reviews weekly entries for Bella agency, causality, voice, relationship consequence, and mineable tags.

## Cards

${protocolCards.map((card) => `- ${card.title}: ${card.summary}`).join("\n")}
`;
}

function sourceRefsForProgram() {
  return [
    { label: "Avatar Store", uri: AVATAR_STORE_PATH, confidence: "generated" },
    { label: "Life Saga Consolidation", uri: LIFE_SAGA_PATH, confidence: "generated" },
    { label: "Last Light Archive Packet", uri: LAST_LIGHT_PACKET_PATH, confidence: "soft" },
    { label: "Media Consumption Catalog", uri: MEDIA_CONSUMPTION_CATALOG_PATH, confidence: "generated" },
    { label: "User Calder Familia request", uri: "current-codex-thread", confidence: "operator-provided" }
  ];
}

function weekRunPathFor(index) {
  return path.join(PROGRAM_DIR, `week-${String(index).padStart(3, "0")}-execution.json`);
}

function sceneIdForWeek(index) {
  return `scene-calder-familia-week-${String(index).padStart(3, "0")}-no-lost-sheep-table`;
}

function episodeIdForWeek(index) {
  return `episode-calder-familia-week-${String(index).padStart(3, "0")}`;
}

function eventIdForWeek(index) {
  return `event-calder-familia-week-${String(index).padStart(3, "0")}`;
}

function weekRange(index) {
  const ingress = new Date(`${INGRESS_DATE}T00:00:00Z`);
  const start = new Date(ingress.getTime() - index * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { start: isoDate(start), end: isoDate(end) };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function findByName(avatars, name) {
  return avatars.find((avatar) => avatarName(avatar).toLowerCase() === name.toLowerCase());
}

function selectConsuls(avatar, avatars, index) {
  const sameTeam = avatars.filter((item) => item.id !== avatar.id && teamId(item) && teamId(item) === teamId(avatar));
  const crossLane = avatars.filter((item) => item.id !== avatar.id && avatarLane(item) !== avatarLane(avatar));
  return uniqueByAvatar([...sameTeam, ...crossLane, ...avatars.filter((item) => item.id !== avatar.id)])
    .sort((a, b) => stableNumber(`${avatar.id}:${a.id}:${index}`) - stableNumber(`${avatar.id}:${b.id}:${index}`))
    .slice(0, 2);
}

function selectBellaFocus(avatar, avatars, index) {
  const candidates = avatars.filter((item) => item.id !== avatar.id && !selectConsuls(avatar, avatars, index).some((consul) => consul.id === item.id));
  return candidates[(stableNumber(`${avatar.id}:bella:${index}`) + index) % candidates.length] || candidates[0] || null;
}

function animalSyncForAvatar(avatar, context) {
  const name = avatarName(avatar);
  if (/thor/i.test(name)) return "My own Thor-sync reads the room as thunder before language, warning me when rescue is becoming performance.";
  if (/leo/i.test(name)) return "My own Leo-sync reads the room as warmth and home-sense, warning me when safety is being performed instead of felt.";
  const parts = [];
  if (context.thor) parts.push(`${avatarName(context.thor)} carries the thunder-check`);
  if (context.leo) parts.push(`${avatarName(context.leo)} carries the home-sense check`);
  return parts.length ? `${parts.join(", ")}.` : "The animal-sync check asks whether the body believes the room is safe before canon says it is.";
}

function lexiconForAvatar(avatar, bella, consuls, animalSync) {
  const name = slugify(avatarName(avatar)).split("-")[0] || "avatar";
  const bellaName = bella ? slugify(avatarName(bella)).split("-")[0] : "bella";
  const consulA = consuls[0] ? slugify(avatarName(consuls[0])).split("-")[0] : "consul";
  return unique([
    `${name}-foundwork`,
    `${bellaName}-thread`,
    `${consulA}-braid`,
    "no-lost-sheep",
    "consul-light",
    "codename-seed",
    animalSync.includes("thunder") ? "thunder-check" : "home-sense"
  ]);
}

function avatarSkills(avatar, lane) {
  const explicit = [
    ...(avatar.mind?.skillCardLoadout || []).map((card) => card.title || card.id),
    ...(avatar.mind?.protocolCardLoadout || []).map((card) => card.title || card.id),
    ...(avatar.mind?.gardenNodeAssignment?.functions || []),
    ...(avatar.mind?.gardenNodeAssignment?.produces || [])
  ];
  const laneSkills = lane === "red"
    ? ["protected action", "rollback planning", "pressure testing"]
    : lane === "blue"
      ? ["source review", "route mapping", "uncertainty tracking"]
      : ["stakeholder care", "repair loops", "cultivation review"];
  return unique([...explicit, ...laneSkills]).filter(Boolean).slice(0, 10);
}

function avatarResponsibilities(avatar) {
  return unique([
    ...(avatar.mind?.gardenNodeAssignment?.responsibilities || []),
    avatar.mind?.shipCrewAssignment?.duty,
    "review Bella agency before rescue framing",
    "keep weekly journal voice specific",
    "append revisions instead of overwriting canon"
  ]).filter(Boolean).slice(0, 10);
}

function avatarLane(avatar = {}) {
  const text = [
    avatar.id,
    avatarName(avatar),
    avatarTeamTitle(avatar),
    avatarRole(avatar),
    avatar.mind?.personaAnchor?.identityStatement,
    avatar.mind?.soulSeed?.soulThesis
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\bred\b|fire|motion|pressure|action|liberty/.test(text)) return "red";
  if (/\bgreen\b|care|repair|garden|stakeholder|cultivation|shelter/.test(text)) return "green";
  if (/\bblue\b|archive|memory|truth|route|source|signal|harbor/.test(text)) return "blue";
  return ["red", "blue", "green"][stableNumber(avatar.id || avatarName(avatar)) % 3];
}

function teamId(avatar) {
  return avatar.mind?.gardenNodeAssignment?.teamId || avatar.mind?.shipCrewAssignment?.teamId || avatar.teamId || "";
}

function avatarTeamTitle(avatar) {
  return avatar.mind?.gardenNodeAssignment?.teamTitle || avatar.mind?.shipCrewAssignment?.teamTitle || "Unassigned Team";
}

function avatarRole(avatar) {
  return avatar.mind?.gardenNodeAssignment?.role || avatar.mind?.shipCrewAssignment?.crewSeat || avatar.role || "Crew";
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.names?.[0]?.name || avatar.name || avatar.id || "Avatar";
}

function countParagraphs(value = "") {
  return String(value || "").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean).length;
}

function countWords(value = "") {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function toTitleCase(value = "") {
  return String(value).replace(/[-_]+/g, " ").replace(/\w\S*/g, (word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);
}

function appendSentence(existing = "", sentence = "") {
  const text = String(existing || "").trim();
  if (!sentence) return text;
  if (text.includes(sentence)) return text;
  return text ? `${text} ${sentence}` : sentence;
}

function mergeById(items = [], key = "id") {
  const byId = new Map();
  for (const item of items) {
    const id = item?.[key] || item?.id || item?.memoryId;
    if (!id) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function uniqueByAvatar(avatars) {
  const byId = new Map();
  for (const avatar of avatars) if (avatar?.id) byId.set(avatar.id, avatar);
  return [...byId.values()];
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function stableNumber(value) {
  return Number.parseInt(createHash("sha1").update(String(value)).digest("hex").slice(0, 8), 16);
}

async function backupStores() {
  await writeJson(path.join(BACKUP_DIR, `avatar-store.before-calder-familia-weekly-${runStamp}.json`), await readJson(AVATAR_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `item-manager-store.before-calder-familia-weekly-${runStamp}.json`), await readJson(ITEM_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `scene-store.before-calder-familia-weekly-${runStamp}.json`), await readJson(SCENE_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `kanban.before-calder-familia-weekly-${runStamp}.json`), await readJson(KANBAN_PATH));
  await writeJson(path.join(BACKUP_DIR, `avatar-agent-contract.before-calder-familia-weekly-${runStamp}.json`), await readJson(CONTRACT_PATH));
  await writeJson(path.join(BACKUP_DIR, `lore-production-plan.before-calder-familia-weekly-${runStamp}.json`), await readJson(LORE_PLAN_PATH));
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
    lore: {
      atlasEntityId: `hapa-lore:${PROGRAM_ID}`,
      sourcePath: path.resolve(PROGRAM_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiDigestPath: WIKI_DIGEST_PATH,
      wikiBellaPath: WIKI_BELLA_PATH
    },
    avatar: {
      atlasEntityId: "hapa-avatar:all",
      sourcePath: path.resolve(AVATAR_STORE_PATH)
    },
    board: {
      atlasEntityId: "hapa-board:hapa-avatar-builder",
      sourcePath: path.resolve(KANBAN_PATH)
    }
  };
  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
  await Promise.all(SUBSCRIBERS.map((subscriber) => appendFile(
    path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`),
    `${JSON.stringify({ ...event, subscriber, status: "queued" })}\n`,
    "utf8"
  )));
  await writeJson(path.join(SUBSCRIBER_DIR, "latest.json"), event);
  await writeJson(path.join(SUBSCRIBER_DIR, "latest-summary.json"), {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    action,
    at: now,
    subscribers: SUBSCRIBERS,
    programPath: path.resolve(PROGRAM_PATH),
    avatarStorePath: path.resolve(AVATAR_STORE_PATH),
    kanbanPath: path.resolve(KANBAN_PATH),
    wikiDigestPath: WIKI_DIGEST_PATH
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeMarkdown(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
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
