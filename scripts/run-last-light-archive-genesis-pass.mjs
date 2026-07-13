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
const ARCHIVE_DATA_DIR = path.join(DATA_DIR, "last-light-archive");
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const INVENTORY_STORE_PATH = path.join(DATA_DIR, "inventory-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const CONTRACT_PATH = path.join(DATA_DIR, "avatar-agent-contract.json");
const LORE_PLAN_PATH = path.join(DATA_DIR, "lore-production-plan.json");
const DEFAULT_ARCHIVE_PATH = "/Users/calderwong/Desktop/The Last Light Archive.txt";
const WIKI_SAGA_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/The Last Light Archive.md";
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const archivePath = String(args.get("archive") || DEFAULT_ARCHIVE_PATH);
const now = new Date().toISOString();
const runStamp = now.replace(/[:.]/g, "-");
const packetPath = path.join(ARCHIVE_DATA_DIR, "last-light-archive-packet.json");
const digestPath = path.join(ARCHIVE_DATA_DIR, "lorekeeper-saga-digest.md");
const batchReportPath = path.join(RUN_DIR, `last-light-archive-genesis-batch-${runStamp}.json`);

async function main() {
  await mkdir(RUN_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(ARCHIVE_DATA_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });

  const archiveText = await readFile(archivePath, "utf8");
  const archiveHash = sha256(archiveText);
  const packet = buildArchivePacket(archiveText, archiveHash);
  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const inventoryStore = normalizeInventoryStore(
    await readJson(INVENTORY_STORE_PATH),
    avatarStore.avatars || [],
    itemStore.cards || []
  );
  const sceneStore = normalizeSceneGraph(await readJson(SCENE_STORE_PATH));
  const songbook = await readJson(SONGBOOK_PATH);
  const contract = await readJson(CONTRACT_PATH).catch(() => ({}));
  const lorePlan = await readJson(LORE_PLAN_PATH).catch(() => ({}));

  const avatars = (avatarStore.avatars || []).filter((avatar) => avatar?.id).map((avatar) => normalizeAvatarCard(avatar));
  const songs = (songbook.songCards || []).slice().sort((a, b) => Number(a.trackNumber || 0) - Number(b.trackNumber || 0));
  if (!avatars.length) throw new Error("No avatars found.");
  if (!songs.length) throw new Error("No Dear Papa song cards found.");

  const conceptCards = LAST_LIGHT_CONCEPTS.map((concept, index) => buildConceptCard(concept, index, songs, packet));
  const sceneUpdates = upsertLastLightScenes(sceneStore, avatars, songs, conceptCards, packet);
  const assignments = buildAvatarAssignments(avatars, conceptCards, songs, sceneUpdates.sceneStore.scenes);
  const nextItemStore = applyConceptCardsAndAssignments(itemStore, conceptCards, assignments, avatars, songs, sceneUpdates.sceneStore.scenes);
  const nextAvatarStore = await applyAvatarArchivePass(avatarStore, avatars, assignments, conceptCards, packet);
  const nextInventoryStore = applyInventoryArchivePass(inventoryStore, nextAvatarStore.avatars, nextItemStore.cards, assignments);
  const nextSceneStore = applySceneArchiveAssignments(sceneUpdates.sceneStore, assignments, conceptCards);
  const nextContract = updateGenesisContract(contract, packet);
  const nextLorePlan = updateLorePlan(lorePlan, packet, assignments, conceptCards, nextSceneStore);
  const digest = buildLorekeeperDigest(packet, assignments, conceptCards, nextSceneStore);
  const batchReport = buildBatchReport(packet, assignments, conceptCards, nextSceneStore, nextAvatarStore);

  if (!dryRun) {
    await backupStores();
    await writeJson(packetPath, packet);
    await writeJson(AVATAR_STORE_PATH, nextAvatarStore);
    await writeJson(INVENTORY_STORE_PATH, nextInventoryStore);
    await writeJson(ITEM_STORE_PATH, nextItemStore);
    await writeJson(SCENE_STORE_PATH, nextSceneStore);
    await writeJson(CONTRACT_PATH, nextContract);
    await writeJson(LORE_PLAN_PATH, nextLorePlan);
    await writeJson(batchReportPath, batchReport);
    await writeMarkdown(digestPath, digest);
    await writeMarkdown(WIKI_SAGA_PATH, digest);
    await appendSubscriberEvent("avatar.last-light-archive-genesis-updated", {
      archivePath,
      archiveSha256: packet.source.sha256,
      packetPath: path.resolve(packetPath),
      digestPath: path.resolve(digestPath),
      wikiSagaPath: WIKI_SAGA_PATH,
      avatarStorePath: path.resolve(AVATAR_STORE_PATH),
      inventoryStorePath: path.resolve(INVENTORY_STORE_PATH),
      itemStorePath: path.resolve(ITEM_STORE_PATH),
      sceneStorePath: path.resolve(SCENE_STORE_PATH),
      contractPath: path.resolve(CONTRACT_PATH),
      lorePlanPath: path.resolve(LORE_PLAN_PATH),
      batchReportPath: path.resolve(batchReportPath),
      avatarCount: avatars.length,
      cardCount: conceptCards.length,
      assignmentCount: assignments.length
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    archivePath,
    archiveSha256: packet.source.sha256,
    avatarCount: avatars.length,
    cardCount: conceptCards.length,
    assignmentCount: assignments.length,
    sceneCount: nextSceneStore.scenes.length,
    batchReportPath,
    packetPath,
    digestPath,
    wikiSagaPath: WIKI_SAGA_PATH
  }, null, 2));
}

const LAST_LIGHT_CONCEPTS = [
  {
    id: "last-light-archive",
    cardType: "epic_card",
    kind: "system",
    title: "The Last Light Archive",
    rank: "Epic",
    lane: "all",
    keywords: ["damaged ritual archive", "three minds", "emotional recurrence", "living songbook"],
    songIds: ["same-sky", "dear-papa", "til-the-light-walks-inn-wandering", "check-one-more"],
    summary: "Dear Papa becomes a damaged ritual archive where Red remembers what had to be done, Green remembers what had to be carried, and Blue remembers who could not be left behind.",
    teaching: "Treat repeated choruses, private jokes, and pop references as source-bearing convergence points instead of decorative noise.",
    mechanic: "When an avatar justifies a song or tarot card, require a Last Light source link, a color-lane perspective, a canon boundary, and a future scene consequence.",
    futureSeed: "The archive becomes the shared memory engine that lets avatars disagree without losing the people they are trying to recover."
  },
  {
    id: "rgb-protocol",
    cardType: "protocol_card",
    kind: "protocol",
    title: "RGB Protocol Light Check",
    rank: "Lore",
    lane: "all",
    keywords: ["love", "truth", "conviction", "quorum", "source partition"],
    songIds: ["red", "same-sky", "spring-grain", "check-the-logs"],
    summary: "RGB Protocol asks each avatar to uncover Truth, form Green Convictions, and let Red action change Blue Truth only after cross-color review.",
    teaching: "The light check prevents love from becoming compulsion: Red asks what must move, Blue asks what is true, Green asks who must be carried.",
    mechanic: "Irreversible story actions require Red/Blue/Green concurrence or a recorded exception with rollback and repair.",
    futureSeed: "Future Genesis choices should cite which color lane is speaking and which lanes have not yet answered."
  },
  {
    id: "red-motion-and-liberty",
    cardType: "saga_card",
    kind: "object",
    title: "Red Motion and Liberty",
    rank: "Saga",
    lane: "red",
    keywords: ["freedom", "motion", "humor", "action before permission", "shadow escalation"],
    songIds: ["that-boy-liberty", "for-the-throat", "the-vector", "iron-mask-traveler", "false-friends-strange-fellows"],
    summary: "Red carries the archive's motion principle: freedom begins as a believable promise that someone will come, then matures into Liberty as sustainable inheritance.",
    teaching: "Red action must stay accountable to proof, humor, rollback, and the person the action is supposed to protect.",
    mechanic: "Use Red cards to open routes, break false cages, or force action only when Blue source and Green repair are visible.",
    futureSeed: "Red-aligned avatars should make drama from the cost of moving first without mistaking heat for truth."
  },
  {
    id: "green-garden-sacrifice",
    cardType: "epic_card",
    kind: "garden",
    title: "Green's Garden Sacrifice",
    rank: "Epic",
    lane: "green",
    keywords: ["stewardship", "shelter", "repair", "black hole garden", "reincarnation"],
    songIds: ["winter-grain", "mediterranean-moisture", "gates-at-the-mountain", "hearing-voices", "am-carraway"],
    summary: "Green evacuates a dimensional civilization into a Garden near the convergence black hole, stays behind, and reincarnates through the long timeline to keep repair alive.",
    teaching: "Green's care is not passivity; it is the civilization-scale willingness to make somewhere worth arriving.",
    mechanic: "Use Green cards to create shelter, stakeholder review, cultivation loops, and recovery scenes after dangerous motion.",
    futureSeed: "Green-aligned avatars should ask what a victory costs the person left holding the door."
  },
  {
    id: "blue-elaine-protocol",
    cardType: "saga_card",
    kind: "object",
    title: "Elaine Protocol",
    rank: "Saga",
    lane: "blue",
    keywords: ["historical person", "interior voice", "protocol", "mystery", "uncertainty"],
    songIds: ["lead-on-elaine", "dear-papa", "navy-wife", "same-sky", "signal-in-the-tide-pipa-night-drift-mix"],
    summary: "Elaine exists as Historical Elaine, Interior Elaine, Elaine Protocol, and Elaine Mystery, preserving the difference between loss, uncertainty, code, and witness.",
    teaching: "Blue protects the archive by refusing to collapse personhood into a single explanation.",
    mechanic: "Any Elaine-linked choice must name which layer is being used and what evidence remains uncertain.",
    futureSeed: "Blue-aligned avatars should create drama from staying loyal to uncertainty without freezing the route home."
  },
  {
    id: "bella-oath",
    cardType: "saga_card",
    kind: "protocol",
    title: "The Bella Oath",
    rank: "Saga",
    lane: "green",
    keywords: ["chosen family", "adopted sister", "trust handshake", "distributed protection", "more than love"],
    songIds: ["boba-tea-strum", "lead-on-elaine", "foreign-hawties", "we-could-call-her-duno", "about-forever-now"],
    summary: "Bella becomes a codename, oath, and chosen-family trust handshake: not ownership, not romance, but a reciprocal duty to find and protect more Bellas.",
    teaching: "The oath turns private affection into distributed care with consent and witness.",
    mechanic: "Use Bella-linked cards to test whether protection is reciprocal, revocable, witnessed, and safe.",
    futureSeed: "Bella drama should ask whether a rescue still honors the person being rescued."
  },
  {
    id: "convergence-war",
    cardType: "epic_card",
    kind: "system",
    title: "The Convergence War",
    rank: "Epic",
    lane: "all",
    keywords: ["timelines", "Artifact", "merge", "contradictory memory", "battlefront"],
    songIds: ["black-hole-spins", "never-meant-for-us", "same-sky", "quitting-the-moon"],
    summary: "Timelines are battlefronts. The Artifact consumes dimensions, and consumed versions of Red, Green, and Blue merge into surviving identities as contradictory but meaningful recollections.",
    teaching: "Contradictory song memories can be converged memories, not failures, when provenance is preserved.",
    mechanic: "Use this card when a card, song, or avatar carries multiple possible histories that must remain co-present.",
    futureSeed: "Future scenes can stage canon conflict as timeline pressure instead of continuity error."
  },
  {
    id: "iron-mask-recognition-weapon",
    cardType: "lore_card",
    kind: "object",
    title: "Iron Mask Recognition Weapon",
    rank: "Lore",
    lane: "red",
    keywords: ["stolen face", "recognition", "goodwill theft", "memory proof", "witness"],
    songIds: ["iron-mask-traveler", "false-friends-strange-fellows", "cross-my-eye", "check-the-logs"],
    summary: "The Iron Mask steals a face and its goodwill, masking the original so people cannot recognize, remember, or believe them.",
    teaching: "Counter recognition theft with private memory proofs, witnesses, songs, and knowledge gates.",
    mechanic: "Use the Iron Mask card to trigger identity verification, witness gathering, and source-safe name recovery.",
    futureSeed: "Iron Mask scenes should make recognition a hard-earned protocol victory."
  },
  {
    id: "porcelain-heaven",
    cardType: "epic_card",
    kind: "system",
    title: "Porcelain Heaven",
    rank: "Epic",
    lane: "blue",
    keywords: ["false consensus", "memory removal", "Soma", "social death", "resistance"],
    songIds: ["never-meant-for-us", "nameless-knew-a-nothing", "check-one-more", "same-sky"],
    summary: "Porcelain Heaven is social death disguised as consensus: a false heaven where memory removal prevents shared recognition and resistance.",
    teaching: "Blue must mark comfort that erases memory as danger, not peace.",
    mechanic: "Use this card to ask what the system made impossible to remember together.",
    futureSeed: "Porcelain Heaven gives future antagonists a seductive, quiet pressure instead of a loud threat."
  },
  {
    id: "songs-as-living-archive",
    cardType: "lore_card",
    kind: "object",
    title: "Songs as Living Archive Entities",
    rank: "Lore",
    lane: "blue",
    keywords: ["songbook", "chorus", "mnemonic salt", "source creature", "recurrence"],
    songIds: ["dear-papa", "same-sky", "hearing-voices", "check-one-more", "west-beach"],
    summary: "Songs in Dear Papa are living archive entities: they carry proof, memory, and relationship pressure across damaged chronology.",
    teaching: "Song choice is an inference act. The avatar must explain what memory, vibe, source, or future consequence the song carries.",
    mechanic: "Every tarot/song link should record why the song was chosen relative to lore, canon, objective, and future scene use.",
    futureSeed: "The music player becomes a playable archive, not a background playlist."
  },
  {
    id: "voice-through-not-for",
    cardType: "protocol_card",
    kind: "protocol",
    title: "Voice Through, Not For",
    rank: "Lore",
    lane: "all",
    keywords: ["consent", "provenance", "revocability", "uncertainty", "voice doctrine"],
    songIds: ["hearing-voices", "check-the-logs", "same-sky", "protocol-for-the-broken"],
    summary: "Calder refuses to speak for voices and instead lets voices speak through him under consent, provenance, revocability, and uncertainty.",
    teaching: "A voice-bearing avatar must cite source, permission, uncertainty, and right of correction.",
    mechanic: "Use this protocol before adopting lore from a person, song, card, or recovered identity.",
    futureSeed: "Future Avatar Genesis runs should make voice custody explicit when a character carries another's memory."
  },
  {
    id: "west-beach-threshold",
    cardType: "saga_card",
    kind: "object",
    title: "West Beach Threshold",
    rank: "Saga",
    lane: "blue",
    keywords: ["threshold", "return route", "waterline", "choice", "memory"],
    songIds: ["west-beach", "same-sky", "navy-wife", "sailor-too"],
    summary: "West Beach is the threshold where memory, grief, route home, and future choice meet without becoming a simple ending.",
    teaching: "A place can be a protocol when it tells the truth about return, loss, and direction.",
    mechanic: "Use West Beach to stage card choices that need a route home before they become action.",
    futureSeed: "West Beach scenes can let avatars meet across timelines without erasing what remains unresolved."
  },
  {
    id: "papa-boat-route",
    cardType: "saga_card",
    kind: "ship",
    title: "Papa's Boat Route",
    rank: "Saga",
    lane: "blue",
    keywords: ["boat", "ferryman", "harbor", "return", "archive route"],
    songIds: ["dear-papa", "navy-wife", "sailor-too", "signal-in-the-tide-pipa-night-drift-mix"],
    summary: "Papa's Boat becomes the ferryman route through memory: a vessel for grief, return, and carrying names across rough water.",
    teaching: "The route home is not always a place; sometimes it is a maintained promise.",
    mechanic: "Use Papa's Boat to link song, scene, and card choices that need transport, witness, or safe return.",
    futureSeed: "The route can carry avatars into the archive without pretending the sea is harmless."
  },
  {
    id: "missing-numbas",
    cardType: "lore_card",
    kind: "object",
    title: "Missing Numbas Guild",
    rank: "Lore",
    lane: "blue",
    keywords: ["missing people", "glitches", "anomalies", "knowledge gates", "recovery"],
    songIds: ["missing-gno-s", "save-point-found-you-in-the-code", "nameless-knew-a-nothing", "check-one-more"],
    summary: "Missing Numbas transforms the MissingNo glitch into a guild mission: find missing people, anomalies, glitches, and names the system could not index.",
    teaching: "A glitch can be a person-shaped evidence trail when the archive is humane enough to look.",
    mechanic: "Use this card to open knowledge gates, anomaly hunts, and source recovery missions.",
    futureSeed: "Missing Numbas gives Archivists and Scouts a shared mission that is playful, technical, and emotionally exact."
  },
  {
    id: "nothing-loved-truth",
    cardType: "epic_card",
    kind: "system",
    title: "Nothing Loved Is Truly Lost",
    rank: "Epic",
    lane: "all",
    keywords: ["central canon line", "found", "truth", "love", "learning"],
    songIds: ["same-sky", "dear-papa", "lead-on-elaine", "about-forever-now"],
    summary: "The central canon line becomes a protocol: nothing loved is truly lost, but Love must keep learning the Truth about what found means.",
    teaching: "Love is not proof by itself. Love has to keep learning or it becomes a trap.",
    mechanic: "Use this card as the final check on song, tarot, and narrative choices: what does found mean here, and who gets to answer?",
    futureSeed: "Every avatar can carry this as a quiet oath that makes recovery active instead of sentimental."
  }
];

const LANE_SONG_FALLBACKS = {
  red: ["that-boy-liberty", "for-the-throat", "iron-mask-traveler", "false-friends-strange-fellows", "protocol-for-the-broken"],
  blue: ["same-sky", "lead-on-elaine", "navy-wife", "dear-papa", "missing-gno-s", "check-one-more"],
  green: ["winter-grain", "mediterranean-moisture", "gates-at-the-mountain", "am-carraway", "boba-tea-strum"],
  all: ["same-sky", "check-one-more", "protocol-for-the-broken", "about-forever-now"]
};

await main();

function buildArchivePacket(archiveText, archiveHash) {
  return {
    schemaVersion: "hapa.last-light-archive.packet.v1",
    id: "last-light-archive-canon-packet",
    title: "The Last Light Archive",
    generatedAt: now,
    source: {
      path: archivePath,
      sha256: archiveHash,
      lineCount: archiveText.split(/\r?\n/).length,
      byteLength: Buffer.byteLength(archiveText, "utf8"),
      reviewedBy: "Codex",
      confidence: "operator_provided_lore_canon_update"
    },
    thesis: "Dear Papa is a damaged ritual archive carried by Red, Green, and Blue: Red remembers what had to be done, Green remembers what had to be carried, and Blue remembers who could not be left behind.",
    canonLine: "Nothing loved is truly lost, but Love must keep learning the Truth about what found means.",
    colorLanes: {
      red: "Freedom, motion, humor, action before permission, and the danger of shadow escalation.",
      green: "Stewardship, shelter, repair, cultivation, and the danger of martyrdom.",
      blue: "Memory, harbor, routes, names, source truth, and the danger of fixation."
    },
    inferenceProtocol: [
      "Before picking a song or Tarot card, review the avatar's own lore, Last Light Archive concepts, the Dear Papa songbook, existing Hapa protocol cards, and active scene context.",
      "State which color lane is speaking and which color lanes must still review the choice.",
      "Separate historical person, interior voice, protocol, mystery, generated scaffold, and hard canon.",
      "Use the RGB Light Check: what must move, what is true, who must be carried, what could be harmed, what can be repaired, and what remains uncertain.",
      "For voices and identities, require consent, provenance, revocability, uncertainty, and correction rights.",
      "Every song or card justification must record lore reason, vibe reason, canon boundary, deck influence, and future scene influence."
    ],
    concepts: LAST_LIGHT_CONCEPTS.map((concept) => ({
      id: concept.id,
      title: concept.title,
      cardType: concept.cardType,
      lane: concept.lane,
      rank: concept.rank,
      summary: concept.summary,
      teaching: concept.teaching,
      mechanic: concept.mechanic,
      futureSeed: concept.futureSeed,
      keywords: concept.keywords,
      songIds: concept.songIds
    })),
    rawExcerpt: archiveText.slice(0, 4000)
  };
}

function buildConceptCard(concept, index, songs, packet) {
  const id = `last-light-${concept.id}`;
  const linkedSongs = resolveSongs(concept.songIds, songs).slice(0, 5);
  const typeLabel = toTitleCase(concept.cardType.replace(/_/g, " "));
  return {
    id,
    schemaVersion: "hapa.item-card.v1",
    cardType: concept.cardType,
    kind: concept.kind,
    title: concept.title,
    name: concept.title,
    status: "active",
    canonStatus: "soft_canon",
    summary: concept.summary,
    description: `${concept.summary} ${concept.teaching} ${concept.mechanic}`,
    lore: `${concept.summary} ${concept.futureSeed}`,
    utility: unique([concept.rank, concept.lane, "Last Light Archive", "Avatar Genesis", "Dear Papa"]),
    broadGameMechanics: unique([
      "avatar genesis lore review",
      "song choice justification",
      "tarot choice justification",
      "RGB Light Check",
      "source provenance",
      concept.mechanic
    ]),
    tags: unique([
      "last-light-archive",
      "dear-papa-lore",
      "avatar-genesis",
      "lore-card",
      concept.cardType.replace(/_/g, "-"),
      `lane-${concept.lane}`,
      ...concept.keywords.map((keyword) => slugify(keyword))
    ]),
    rank: concept.rank,
    quality: {
      rank: concept.rank,
      confidence: "soft",
      power: concept.cardType === "epic_card" ? 9 : concept.cardType === "saga_card" ? 7 : 5,
      complexity: 8,
      reuse: 10,
      risk: concept.cardType === "epic_card" ? 6 : 4,
      completeness: 92,
      level: linkedSongs.length,
      durability: 0,
      medianDurability: 0,
      score: 1,
      qualityRank: concept.rank,
      updatedAt: now
    },
    locationState: {
      currentSystemName: "The Last Light Archive",
      state: "canon-packet-card",
      notes: `Generated from ${packet.source.path}`
    },
    connections: {
      avatarIds: [],
      sceneIds: [],
      itemIds: linkedSongs.map((song) => song.id)
    },
    mediaPrompts: {
      heroImage: `${concept.title} as a Hapa neonblade lore card, readable archive glyphs, Red Blue Green light split, Dear Papa music signal, cinematic but source-grounded.`,
      twoD: `${typeLabel} for ${concept.title}; make the source packet, color lane, doctrine, and future consequence readable.`,
      threeD: `Spatial board card for ${concept.title}, with connector nodes for avatars, songs, scenes, and canon packet source.`,
      comicPanel: `Comic panel where an avatar invokes ${concept.title} and explains the song/card choice through the Last Light Archive.`,
      explainerVideo: `Short Hapa Lorekeeper video explaining ${concept.title}, its RGB lane, song links, and Genesis use.`,
      wikiEntry: `Wiki entry for ${concept.title}: source summary, canon boundary, mechanics, linked songs, and Avatar Genesis instructions.`,
      negativePrompt: "avoid hard-canon promotion without source review, avoid generic fantasy, avoid unreadable tiny text"
    },
    sourceRefs: [{
      label: "The Last Light Archive",
      uri: packet.source.path,
      confidence: "soft",
      notes: `sha256:${packet.source.sha256}`
    }],
    mediaAssets: [],
    tarotCard: {
      schemaVersion: "hapa.tarot-card-details.v1",
      mainType: concept.cardType,
      title: concept.title,
      subtitle: `${concept.rank} Card`,
      archetype: concept.lane === "all" ? "RGB convergence" : `${toTitleCase(concept.lane)} lane`,
      keywords: concept.keywords,
      flavorText: packet.canonLine,
      effectTitle: "Last Light Genesis Effect",
      effectText: concept.mechanic,
      catalog: {
        collectionId: "last-light-archive",
        collectionTitle: "The Last Light Archive",
        family: "Dear Papa Lore",
        typeLabel,
        sequence: index + 1,
        sourceFolder: path.dirname(packet.source.path),
        sourceHash: packet.source.sha256,
        pairingKey: concept.id,
        confidence: "operator-provided"
      },
      identity: {
        systemName: "Hapa Lore System",
        deckName: "The Last Light Archive",
        arcana: `${concept.rank} Canon`,
        tarotType: concept.title,
        tarotCardName: concept.title,
        printedTitle: concept.title,
        displayTitle: concept.title,
        functionalType: concept.rank,
        functionalTypeSlug: slugify(concept.rank),
        cardTypeName: typeLabel,
        typeStack: unique([concept.rank, concept.cardType, `${concept.lane}-lane`, "last-light-archive"]),
        confidence: "operator-provided"
      },
      cardFace: {
        titleLine: concept.title,
        subtitleLine: `${concept.rank} / ${toTitleCase(concept.lane)} Lane`,
        typeLine: typeLabel,
        keywordLine: concept.keywords.join(" / "),
        coreMeaning: concept.summary,
        uprightText: concept.teaching,
        mechanicsText: concept.mechanic,
        sections: [
          { label: "Canon Claim", value: concept.summary },
          { label: "Genesis Use", value: concept.mechanic },
          { label: "Future Seed", value: concept.futureSeed }
        ]
      },
      attribution: {
        author: "Calder",
        shop: "Hapa Lore Node",
        albumTitle: "Dear Papa",
        rightsStatus: "operator_authored_hapa_creative_commons",
        sourceTool: "Codex Last Light Archive Genesis pass",
        sourcePaths: [packet.source.path],
        notes: `Source archive sha256:${packet.source.sha256}`
      },
      mechanics: {
        broadGameMechanic: concept.mechanic,
        deckUse: "Draw as a Lore/Saga/Epic context card before song, tarot, relationship, or scene justification.",
        surfaceUse: "Place on the board to create visible avatar-song-scene canon connectors.",
        relationshipUse: "Use to test whether love, truth, consent, protection, and recovery are being kept distinct.",
        skillUse: "Use as an Avatar Genesis reasoning protocol card.",
        effects: [concept.teaching, concept.futureSeed],
        limits: [
          "Do not promote generated details to hard canon without source review.",
          "Do not collapse historical people, inner voices, protocols, and mysteries into one category."
        ],
        procedures: packet.inferenceProtocol,
        actions: ["review source", "state color lane", "name canon boundary", "record song reason", "record future consequence"],
        resources: linkedSongs.map((song) => song.title),
        costs: ["requires provenance", "requires uncertainty notes", "requires correction rights"]
      },
      lore: {
        summary: concept.summary,
        canonStatus: "soft_canon",
        characterHooks: [
          `Use with ${concept.lane === "all" ? "any avatar" : `${toTitleCase(concept.lane)}-aligned avatars`} when their lore needs a Last Light frame.`,
          concept.futureSeed
        ],
        relationshipHooks: [
          "Ask what love is protecting and what truth has not yet been learned.",
          "Turn song choice into relationship pressure and future scene obligation."
        ],
        protocolTeaching: concept.teaching,
        futureSeed: concept.futureSeed,
        visualLanguage: unique(["RGB light split", "archive signal", "Dear Papa music glyph", ...concept.keywords]),
        sourceClaims: [
          packet.thesis,
          packet.canonLine,
          `${concept.title} derived from operator-provided Last Light Archive review.`
        ]
      },
      typeDetails: {
        label: typeLabel,
        tarotType: concept.title,
        functionalType: concept.rank,
        functionalTypeSlug: slugify(concept.rank),
        role: "Avatar Genesis lore adoption card",
        focus: concept.summary,
        command: "Run the Last Light Archive lens before choosing songs, tarot cards, or narrative drama.",
        procedureFlow: packet.inferenceProtocol,
        actions: ["review", "choose", "justify", "link", "journal", "consolidate"],
        resources: linkedSongs.map((song) => song.title)
      },
      songLinks: linkedSongs.map((song) => ({
        id: `song-link-${id}-${song.songId || song.id}`,
        songId: song.songId || song.id,
        songCardId: song.id,
        songTitle: song.title,
        why: `${song.title} is seeded as a Last Light Archive resonance for ${concept.title}.`,
        vibe: song.mood || "cinematic-lore",
        sourcePath: packet.source.path,
        confidence: "generated",
        createdAt: now,
        updatedAt: now
      })),
      sceneLinks: [],
      avatarLoreLinks: [],
      mediaLinks: [],
      ocr: {
        engine: "operator-archive-review",
        confidence: 1,
        rawText: `${concept.title}\n${concept.summary}\n${concept.teaching}\n${concept.mechanic}`,
        lines: [
          { text: concept.title, confidence: 1 },
          { text: concept.summary, confidence: 1 },
          { text: concept.teaching, confidence: 1 }
        ],
        parsedAt: now,
        refreshedAt: now,
        sourceImagePaths: [],
        sourceVideoPaths: [],
        sourceFramePaths: [],
        sourceMediaUris: [packet.source.path],
        sources: [{
          id: "the-last-light-archive",
          kind: "operator_text_archive",
          path: packet.source.path,
          confidence: 1,
          lineCount: packet.source.lineCount,
          text: concept.summary
        }]
      }
    },
    history: [{
      id: `history-${id}-${runStamp}`,
      label: "Last Light Archive concept card",
      summary: `${concept.title} upserted as a ${concept.rank} card for Avatar Genesis song/tarot reasoning.`,
      source: "scripts/run-last-light-archive-genesis-pass.mjs",
      at: now,
      confidence: "soft"
    }],
    createdAt: now,
    updatedAt: now
  };
}

function upsertLastLightScenes(sceneStore, avatars, songs, conceptCards, packet) {
  const graph = normalizeSceneGraph(sceneStore);
  const avatarIds = avatars.map((avatar) => avatar.id);
  const maxOrder = Math.max(0, ...(graph.scenes || []).map((scene) => Number(scene.canonicalTime?.order || 0)));
  const places = [
    {
      id: "place-last-light-archive-stacks",
      name: "Last Light Archive Stacks",
      type: "dreamspace",
      summary: "A damaged ritual archive where Dear Papa songs, tarot cards, and RGB memory lanes can be reviewed without flattening their contradictions.",
      lore: packet.thesis,
      visualDescription: "Neon library stacks, tide-light on the floor, red blue green source ribbons, and card shelves that hum with songs.",
      imagePrompt: "Hapa neonblade archive stacks with RGB light lanes, music glyph cards, and ocean reflections.",
      tags: ["place", "last-light-archive", "lore-node"],
      avatarIds,
      canonEventIds: ["event-last-light-archive-adoption"],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "place-west-beach-threshold",
      name: "West Beach Threshold",
      type: "landscape",
      summary: "The return-route shoreline where memory, grief, route home, and future choice meet.",
      lore: "West Beach is a place-protocol: it lets avatars ask what return means without forcing every uncertainty closed.",
      visualDescription: "Moonlit waterline, old boat lights, archive cards in the wet sand, and a horizon that looks like a music waveform.",
      imagePrompt: "West Beach at night as a Hapa lore threshold, boat light on the right, RGB reflections, readable tarot cards in the sand.",
      tags: ["place", "west-beach", "last-light-archive"],
      avatarIds: avatarIds.filter((id) => /blue|avatar-2|avatar-25|avatar-39|avatar-42|avatar-44/i.test(id)),
      canonEventIds: ["event-west-beach-return-route"],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "place-green-garden-continuum",
      name: "Green Garden Continuum",
      type: "garden",
      summary: "The evacuated civilization Garden near the convergence black hole, where care becomes infrastructure.",
      lore: "Green's sacrifice teaches that shelter is action with a long memory.",
      visualDescription: "Living Garden arcs around a black hole, with repair lights, harbor gates, and card paths rooted into starlight.",
      imagePrompt: "Green Garden around a supermassive black hole, Hapa neonblade style, living shelter infrastructure and repair glyphs.",
      tags: ["place", "green-garden", "continuum", "last-light-archive"],
      avatarIds: avatarIds.filter((id) => /green|avatar-3|avatar-37|avatar-43|avatar-45/i.test(id)),
      canonEventIds: ["event-green-garden-sacrifice"],
      createdAt: now,
      updatedAt: now
    }
  ];

  const volume = {
    id: "volume-last-light-archive",
    title: "The Last Light Archive",
    volumeNumber: 3,
    seasonTitle: "Avatar Genesis Season 1",
    quickPitch: "Lorekeepers consolidate the Dear Papa archive as an RGB operating myth for song, tarot, and Avatar Genesis choices.",
    episodeIds: ["episode-last-light-archive-adoption", "episode-rgb-light-check", "episode-songs-as-living-archive"],
    archivistAgent: {
      avatarId: "avatar-16",
      avatarName: "Red-Thu",
      role: "Lorekeeper / Archivist consolidator",
      cadence: "after archive ingestion or major Genesis pass",
      loreInstruction: "Preserve source, color lane, canon boundary, song reason, card reason, and future scene consequence."
    },
    screenplayPitch: "The avatars gather around a damaged song archive and learn that recovery is not sentiment: it is protocol, proof, consent, and repair.",
    screenplayPrompt: "Write The Last Light Archive as a lore-rich Hapa season volume. Make songs playable evidence, cards visible arguments, and RGB lanes dramatic without hard-canon overreach.",
    canonConsolidationPlan: "Use this volume as a source packet for Avatar Genesis, tarot/song justifications, relationship drama, and Lorekeeper education. Preserve uncertainty and correction rights.",
    summary: packet.thesis,
    overallNarrative: "The Lorekeepers convert the archive into cards, scenes, and inference protocols so every avatar can choose songs and tarot with source-aware emotional consequence.",
    episodeSummaries: [
      {
        episodeId: "episode-last-light-archive-adoption",
        title: "The Archive Opens",
        quickPitch: "Every avatar reviews the Last Light source packet and receives a lore oath tied to their canon lane.",
        sceneCount: 2,
        avatarCount: avatars.length
      },
      {
        episodeId: "episode-rgb-light-check",
        title: "RGB Light Check",
        quickPitch: "Red, Blue, and Green turn the archive into an operating protocol for irreversible choices.",
        sceneCount: 2,
        avatarCount: avatars.length
      },
      {
        episodeId: "episode-songs-as-living-archive",
        title: "Songs as Living Archive",
        quickPitch: "Song choices become evidence, vibe, and future scene obligations rather than background music.",
        sceneCount: 2,
        avatarCount: avatars.length
      }
    ],
    screenplayOutline: [
      "The archive is opened as a damaged ritual object, not a neutral database.",
      "Avatars split into RGB review lanes and challenge each other's assumptions.",
      "Lore/Saga/Epic cards are dealt as playable memory protocols.",
      "Each avatar chooses songs that teach how they recover, protect, or carry truth.",
      "Archivists consolidate the results into Sagas for education and entertainment."
    ],
    canonDeltas: [
      { id: "delta-last-light-archive", summary: packet.thesis, sourcePath: packet.source.path, confidence: "soft" },
      { id: "delta-rgb-protocol", summary: "Song and tarot justifications now require RGB Light Check reasoning.", sourcePath: packet.source.path, confidence: "soft" },
      { id: "delta-voice-doctrine", summary: "Voice-bearing lore uses consent, provenance, revocability, uncertainty, and correction rights.", sourcePath: packet.source.path, confidence: "soft" }
    ],
    relationshipCollisions: [
      "Red wants motion before the archive has finished speaking.",
      "Blue refuses to simplify Elaine, Bella, or missing names into one category.",
      "Green insists that rescue is not real unless the rescued person can revise the story."
    ],
    placesFeatured: places.map((place) => place.id),
    artifactPaths: [packet.source.path, path.resolve(packetPath), path.resolve(digestPath)],
    canonStatus: "soft_canon",
    status: "done",
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };

  const episodes = [
    {
      id: "episode-last-light-archive-adoption",
      title: "The Archive Opens",
      volumeId: volume.id,
      episodeNumber: 1,
      quickPitch: "The Last Light Archive becomes a source packet every avatar must cite when making new song and tarot choices.",
      overallNarrative: "Lorekeepers gather the avatars at the archive stacks and distribute cards that convert the attachment into source-aware lore.",
      settingTimeline: "after Mimi Card Shop OCR and Tarot Genesis passes",
      expositionGoal: "Explain the archive as damaged ritual memory and assign color-lane review duties.",
      mechanicsTaught: ["source provenance", "RGB Light Check", "Lore/Saga/Epic cards", "song justification"],
      managementSkills: ["source review", "canon boundary tracking", "cross-functional review"],
      avatarIds,
      sceneIds: ["scene-last-light-archive-council", "scene-last-light-card-drafting"],
      placeIds: ["place-last-light-archive-stacks"],
      canonStatus: "soft_canon",
      status: "done",
      completedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "episode-rgb-light-check",
      title: "RGB Light Check",
      volumeId: volume.id,
      episodeNumber: 2,
      quickPitch: "Red, Blue, and Green test the archive against motion, truth, and care.",
      overallNarrative: "The triad learns that love must keep learning truth, and every irreversible choice needs cross-color pressure.",
      settingTimeline: "same archive cycle",
      expositionGoal: "Turn RGB Protocol into an inference checklist for Genesis agents.",
      mechanicsTaught: ["quorum review", "rollback and repair", "uncertainty preservation"],
      managementSkills: ["risk review", "stakeholder mapping", "source classification"],
      avatarIds,
      sceneIds: ["scene-rgb-light-check-table", "scene-iron-mask-recognition-gate"],
      placeIds: ["place-last-light-archive-stacks", "place-west-beach-threshold"],
      canonStatus: "soft_canon",
      status: "done",
      completedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "episode-songs-as-living-archive",
      title: "Songs as Living Archive",
      volumeId: volume.id,
      episodeNumber: 3,
      quickPitch: "Avatars learn to treat songs as evidence-bearing archive entities and explain their picks.",
      overallNarrative: "Every avatar chooses more Dear Papa songs, records the vibe and lore reason, and ties those songs to card and scene futures.",
      settingTimeline: "same archive cycle",
      expositionGoal: "Make the music player and tarot board a visible living archive.",
      mechanicsTaught: ["song-card linking", "avatar lore journaling", "scene playlist provenance"],
      managementSkills: ["narrative documentation", "education synthesis", "canon consolidation"],
      avatarIds,
      sceneIds: ["scene-green-garden-sacrifice-witness", "scene-west-beach-songline"],
      placeIds: ["place-green-garden-continuum", "place-west-beach-threshold"],
      canonStatus: "soft_canon",
      status: "done",
      completedAt: now,
      createdAt: now,
      updatedAt: now
    }
  ];

  const sceneSeed = [
    {
      id: "scene-last-light-archive-council",
      title: "Last Light Archive Council",
      placeId: "place-last-light-archive-stacks",
      episodeId: "episode-last-light-archive-adoption",
      summary: "The avatars review the attachment as a source packet and learn that Dear Papa is a damaged ritual archive, not a chronological album.",
      quickPitch: "Open the archive, split the RGB lanes, and explain why every future song/tarot choice must cite the Last Light lens.",
      overallNarrative: packet.thesis,
      narrativeText: "The archive hums in three colors. Red wants a route, Blue wants the source, Green wants to know who gets carried when the route opens.",
      expositionBeats: [packet.thesis, packet.canonLine],
      actionBeats: ["Lorekeepers deal the first Epic cards.", "Avatars attach song choices to their own canon objectives."],
      characterGrowth: ["Every avatar learns that choosing a song is a source-aware inference act."],
      learningObjectives: ["Use Last Light source packet", "Distinguish lane perspective from hard canon"],
      hapaMechanics: ["Lore/Saga/Epic card drafting", "Avatar Genesis review packet", "subscriber lore fan-out"],
      managementSkills: ["source review", "canon boundary tracking"],
      canonEventIds: ["event-last-light-archive-adoption"],
      tags: ["scene", "last-light-archive", "lorekeeper"],
      canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 1, label: "Last Light 001" }
    },
    {
      id: "scene-last-light-card-drafting",
      title: "Lorekeepers Draft the Last Light Cards",
      placeId: "place-last-light-archive-stacks",
      episodeId: "episode-last-light-archive-adoption",
      summary: "The attachment becomes Lore, Saga, and Epic cards with mechanics, song links, scene hooks, and avatar reasoning slots.",
      quickPitch: "Turn canon into usable cards without losing provenance.",
      overallNarrative: "Cards are written as playable archive objects: each card knows why it exists, how it should be used, and what future scene pressure it creates.",
      narrativeText: "The Card Library Node becomes a loom; each concept receives a frame, a mechanic, and a way to be challenged.",
      expositionBeats: ["Concept cards are typed as Lore, Saga, Epic, or Protocol.", "Each card records source claims and Dear Papa links."],
      actionBeats: ["Cards light up as avatars claim them.", "Connector lines form from card to song to future scene."],
      characterGrowth: ["Archivists learn to entertain without laundering uncertainty."],
      learningObjectives: ["Catalog lore cards", "Preserve source traces"],
      hapaMechanics: ["card library", "avatar lore links", "scene links"],
      managementSkills: ["schema update", "traceability"],
      canonEventIds: ["event-last-light-card-drafting"],
      tags: ["scene", "card-library", "last-light-archive"],
      canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 2, label: "Last Light 002" }
    },
    {
      id: "scene-rgb-light-check-table",
      title: "RGB Light Check Table",
      placeId: "place-last-light-archive-stacks",
      episodeId: "episode-rgb-light-check",
      summary: "Red, Blue, and Green convert love, truth, and conviction into a review protocol for irreversible choices.",
      quickPitch: "Ask what must move, what is true, and who must be carried.",
      overallNarrative: "The RGB table prevents love from becoming compulsion by forcing action to answer to truth and care.",
      narrativeText: "Three lights make one decision only when each color can name what it knows and what it cannot promise.",
      expositionBeats: ["Red names the motion.", "Blue names the evidence.", "Green names the affected people."],
      actionBeats: ["The table rejects a choice with no rollback.", "The table approves a choice with repair attached."],
      characterGrowth: ["Red accepts that speed can wait for proof; Blue accepts that uncertainty can still move; Green accepts that care can command."],
      learningObjectives: ["Run RGB Light Check", "Record canon boundary"],
      hapaMechanics: ["cross-color quorum", "rollback route", "repair owner"],
      managementSkills: ["risk review", "stakeholder impact", "decision logging"],
      canonEventIds: ["event-rgb-light-check"],
      tags: ["scene", "rgb-protocol", "last-light-archive"],
      canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 3, label: "Last Light 003" }
    },
    {
      id: "scene-iron-mask-recognition-gate",
      title: "Iron Mask Recognition Gate",
      placeId: "place-west-beach-threshold",
      episodeId: "episode-rgb-light-check",
      summary: "Avatars test recognition theft with private memory proofs, witnesses, songs, and knowledge gates.",
      quickPitch: "Make recognition a protocol victory.",
      overallNarrative: "The Iron Mask can steal a face, but it cannot survive source-safe witness, correction rights, and songs only the real person can carry.",
      narrativeText: "At the waterline, a stolen face fails to answer a private song cue.",
      expositionBeats: ["The Iron Mask threat is defined.", "The countermeasures are staged."],
      actionBeats: ["A witness chain forms.", "The false face loses social power."],
      characterGrowth: ["Avatars learn that recognition is a maintained commons."],
      learningObjectives: ["Counter recognition theft", "Use knowledge gates"],
      hapaMechanics: ["identity verification", "witness chain", "song proof"],
      managementSkills: ["authentication", "evidence custody"],
      canonEventIds: ["event-iron-mask-recognition"],
      tags: ["scene", "iron-mask", "west-beach", "last-light-archive"],
      canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 4, label: "Last Light 004" }
    },
    {
      id: "scene-green-garden-sacrifice-witness",
      title: "Green Garden Sacrifice Witness",
      placeId: "place-green-garden-continuum",
      episodeId: "episode-songs-as-living-archive",
      summary: "The avatars witness Green's long shelter logic and learn that care can be a civilization-scale action.",
      quickPitch: "Shelter becomes infrastructure, and infrastructure becomes memory.",
      overallNarrative: "Green's sacrifice reframes repair as the work that makes arrival possible after Red opens a route and Blue remembers where it leads.",
      narrativeText: "The Garden arcs around the black hole like a promise with roots.",
      expositionBeats: ["Green's evacuation story is told as soft canon.", "Martyrdom is separated from sustainable stewardship."],
      actionBeats: ["Avatars name who must be carried.", "A new shelter card is linked to a song."],
      characterGrowth: ["Green-aligned avatars learn to carry without disappearing."],
      learningObjectives: ["Use care as action", "Audit sacrifice for consent and sustainability"],
      hapaMechanics: ["Garden shelter", "repair loop", "stakeholder review"],
      managementSkills: ["care planning", "continuity design"],
      canonEventIds: ["event-green-garden-sacrifice"],
      tags: ["scene", "green-garden", "last-light-archive"],
      canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 5, label: "Last Light 005" }
    },
    {
      id: "scene-west-beach-songline",
      title: "West Beach Songline",
      placeId: "place-west-beach-threshold",
      episodeId: "episode-songs-as-living-archive",
      summary: "Songs are played as living archive entities; each avatar records why the song belongs to their lore and future.",
      quickPitch: "Make the music player a playable archive.",
      overallNarrative: "The shore listens while avatars explain their picks: vibe, memory, canon boundary, and future consequence.",
      narrativeText: "The old boat light stays visible on the right while cards settle in the sand.",
      expositionBeats: ["Song choice is defined as an inference act.", "Private jokes become mnemonic salt."],
      actionBeats: ["Avatars add songs to their deck journals.", "Lorekeepers consolidate the saga digest."],
      characterGrowth: ["Avatars learn to be moved by music without surrendering provenance."],
      learningObjectives: ["Record song reasons", "Link song/card/scene"],
      hapaMechanics: ["playlist provenance", "Dear Papa song cards", "future scene seeding"],
      managementSkills: ["documentation", "education", "entertainment synthesis"],
      canonEventIds: ["event-west-beach-songline"],
      tags: ["scene", "songs-as-living-archive", "west-beach", "last-light-archive"],
      canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 6, label: "Last Light 006" }
    }
  ].map((scene) => ({
    ...scene,
    volumeId: volume.id,
    canonStatus: "soft_canon",
    avatarTags: avatarIds.slice(0, 16).map((avatarId) => ({
      avatarId,
      role: "mentioned",
      presence: "mentioned",
      tags: ["last-light-archive"],
      note: "Avatar reviewed this scene as part of the Last Light archive adoption pass.",
      taggedAt: now,
      updatedAt: now
    })),
    playlist: seedScenePlaylist(scene, songs),
    nodes: conceptCards.slice(0, 6).map((card) => ({
      id: `node-${scene.id}-${card.id}`,
      type: "lore-card",
      label: card.title,
      cardId: card.id
    })),
    createdAt: now,
    updatedAt: now
  }));

  graph.places = mergeById([...(graph.places || []), ...places]);
  graph.episodes = mergeById([...(graph.episodes || []), ...episodes]);
  graph.volumes = mergeById([...(graph.volumes || []), volume]);
  graph.scenes = mergeById([...(graph.scenes || []), ...sceneSeed]);
  graph.updatedAt = now;
  return { sceneStore: normalizeSceneGraph(graph), volume, episodes, places, scenes: sceneSeed };
}

function seedScenePlaylist(scene, songs) {
  const ids = scene.id.includes("green") ? LANE_SONG_FALLBACKS.green
    : scene.id.includes("west") || scene.id.includes("iron") ? LANE_SONG_FALLBACKS.blue
    : scene.id.includes("rgb") ? ["that-boy-liberty", "same-sky", "winter-grain"]
    : LANE_SONG_FALLBACKS.all;
  return resolveSongs(ids, songs).slice(0, 4).map((song) => ({
    id: `playlist-${scene.id}-${song.songId || song.id}`,
    title: song.title,
    artist: "Calder",
    uri: "",
    mood: song.mood || "cinematic-lore",
    songId: song.songId || song.id,
    songCardId: song.id,
    tags: ["playlist", "dear-papa", "last-light-archive"],
    notes: `Seeded by ${scene.title} as a Last Light Archive songline.`,
    createdAt: now,
    updatedAt: now
  }));
}

function buildAvatarAssignments(avatars, conceptCards, songs, scenes) {
  const conceptById = new Map(conceptCards.map((card) => [card.id.replace(/^last-light-/, ""), card]));
  const assignments = [];
  for (const avatar of avatars) {
    const lane = avatarLane(avatar);
    const alreadyChosen = new Set((avatar.mind?.tarotCardDeck || []).map((choice) => choice.cardId).filter(Boolean));
    const candidates = scoreConceptsForAvatar(conceptCards, avatar, lane);
    const selected = candidates
      .map((candidate) => candidate.card)
      .filter((card) => !alreadyChosen.has(card.id))
      .slice(0, 2);
    if (!alreadyChosen.has("last-light-nothing-loved-truth") && !selected.some((card) => card.id === "last-light-nothing-loved-truth")) {
      selected.push(conceptById.get("nothing-loved-truth"));
    }
    selected.filter(Boolean).slice(0, 3).forEach((card, index) => {
      const concept = LAST_LIGHT_CONCEPTS.find((item) => `last-light-${item.id}` === card.id) || LAST_LIGHT_CONCEPTS[0];
      const song = pickSongForAvatarConcept(avatar, concept, songs, index);
      const scene = pickSceneForConcept(avatar, concept, scenes);
      assignments.push(buildArchiveAssignment({ avatar, card, concept, song, scene, lane, index }));
    });
  }
  addCoverageAssignments(assignments, avatars, conceptCards, songs, scenes);
  return assignments;
}

function addCoverageAssignments(assignments, avatars, conceptCards, songs, scenes) {
  const covered = new Map();
  for (const card of conceptCards) covered.set(card.id, new Set());
  for (const avatar of avatars) {
    for (const choice of avatar.mind?.tarotCardDeck || []) {
      if (covered.has(choice.cardId)) covered.get(choice.cardId).add(avatar.id);
    }
  }
  for (const assignment of assignments) {
    if (covered.has(assignment.cardId)) covered.get(assignment.cardId).add(assignment.avatarId);
  }
  for (const card of conceptCards) {
    if ((covered.get(card.id) || new Set()).size > 0) continue;
    const concept = LAST_LIGHT_CONCEPTS.find((item) => `last-light-${item.id}` === card.id) || LAST_LIGHT_CONCEPTS[0];
    const scored = avatars
      .filter((avatar) => !(avatar.mind?.tarotCardDeck || []).some((choice) => choice.cardId === card.id))
      .map((avatar, index) => ({
        avatar,
        score: scoreConceptsForAvatar([card], avatar, avatarLane(avatar))[0]?.score || 0 + ((stableNumber(`${avatar.id}:${card.id}:coverage`) + index) % 13)
      }))
      .sort((a, b) => b.score - a.score || avatarName(a.avatar).localeCompare(avatarName(b.avatar)));
    const avatar = scored[0]?.avatar || avatars[stableNumber(card.id) % avatars.length];
    if (!avatar) continue;
    const lane = avatarLane(avatar);
    const song = pickSongForAvatarConcept(avatar, concept, songs, 99);
    const scene = pickSceneForConcept(avatar, concept, scenes);
    assignments.push(buildArchiveAssignment({ avatar, card, concept, song, scene, lane, index: 99 }));
    covered.get(card.id).add(avatar.id);
  }
}

function buildArchiveAssignment({ avatar, card, concept, song, scene, lane, index }) {
  const name = avatarName(avatar);
  const songTitle = song?.title || song?.songId || "Dear Papa";
  const objective = avatarObjective(avatar);
  const colorDuty = laneDuty(lane);
  return {
    id: `last-light-choice-${avatar.id}-${concept.id}-${runStamp}`,
    schemaVersion: "hapa.last-light-archive-avatar-choice.v1",
    avatarId: avatar.id,
    avatarName: name,
    lane,
    cardId: card.id,
    cardTitle: card.title,
    cardType: card.cardType,
    tarotMainType: card.tarotCard?.mainType || card.cardType,
    tarotType: card.tarotCard?.identity?.tarotType || card.title,
    functionalType: card.tarotCard?.identity?.functionalType || concept.rank,
    songId: song?.songId || song?.id || "",
    songCardId: song?.id || "",
    songTitle,
    sceneId: scene?.id || "",
    sceneTitle: scene?.title || "",
    reasonRank: index + 1,
    whyChosen: `${name} adopts ${card.title} because ${concept.summary} This matches their objective: ${objective}`,
    canonReason: `${card.title} is soft-canon Last Light Archive lore derived from ${archivePath}; ${name} must keep source, uncertainty, and correction rights visible before using it as hard story fact.`,
    loreContext: `${name} reviews the Last Light Archive, their own mind ledger, existing Hapa protocol/lore cards, Dear Papa song cards, and active scene context before making this choice.`,
    objectiveFit: `${card.title} gives ${name} a ${colorDuty} lens for future song, tarot, and relationship choices.`,
    deckInfluence: `${card.title} adds a ${concept.rank} reasoning card to ${name}'s deck so future draws can ask what love, truth, care, and recovery require.`,
    futureInfluence: `${name}'s next chapter should use ${card.title} to create drama where a song choice changes what the avatar protects, remembers, repairs, or refuses to simplify.`,
    songWhy: `${name} pairs ${card.title} with ${songTitle} because the song carries ${songMood(song)} while the card carries ${concept.keywords.slice(0, 3).join(", ")}; together they make a playable proof of ${name}'s lore instead of a loose vibe.`,
    vibe: songMood(song),
    sceneWhy: scene ? `${scene.title} gives ${name}'s ${card.title} choice a visible surface where the song can become evidence, conflict, and future canon pressure.` : "",
    inferenceProtocol: [
      "Run RGB Light Check before irreversible action.",
      "Cite source and canon boundary.",
      "Name song vibe, lore reason, deck influence, and future consequence."
    ],
    createdAt: now,
    updatedAt: now
  };
}

function applyConceptCardsAndAssignments(itemStore, conceptCards, assignments, avatars = [], songs = [], scenes = []) {
  const conceptAssignments = mergeById([
    ...collectExistingAvatarConceptAssignments(avatars, conceptCards, songs, scenes),
    ...assignments
  ]);
  const assignmentsByCard = groupBy(conceptAssignments, "cardId");
  const cards = conceptCards.map((card) => {
    const cardAssignments = assignmentsByCard.get(card.id) || [];
    return {
      ...card,
      connections: {
        ...(card.connections || {}),
        avatarIds: unique(cardAssignments.map((assignment) => assignment.avatarId)),
        sceneIds: unique(cardAssignments.map((assignment) => assignment.sceneId).filter(Boolean)),
        itemIds: unique([
          ...(card.connections?.itemIds || []),
          ...cardAssignments.map((assignment) => assignment.songCardId).filter(Boolean)
        ])
      },
      tags: unique([...(card.tags || []), "avatar-genesis-linked", "dear-papa-song-linked", "scene-linked"]),
      quality: {
        ...(card.quality || {}),
        durability: unique(cardAssignments.map((assignment) => `${assignment.avatarId}:${assignment.songId}:${assignment.sceneId}`)).length,
        connectedMediaCount: unique(cardAssignments.map((assignment) => `${assignment.avatarId}:${assignment.songId}:${assignment.sceneId}`)).length,
        updatedAt: now
      },
      tarotCard: {
        ...(card.tarotCard || {}),
        songLinks: mergeById([
          ...(card.tarotCard?.songLinks || []),
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
            sourcePath: archivePath,
            confidence: "generated",
            createdAt: now,
            updatedAt: now
          }))
        ]),
        sceneLinks: mergeById([
          ...(card.tarotCard?.sceneLinks || []),
          ...cardAssignments.filter((assignment) => assignment.sceneId).map((assignment) => ({
            id: `scene-link-${assignment.cardId}-${assignment.avatarId}-${assignment.sceneId}-${runStamp}`,
            avatarId: assignment.avatarId,
            avatarName: assignment.avatarName,
            sceneId: assignment.sceneId,
            sceneTitle: assignment.sceneTitle,
            why: assignment.sceneWhy,
            sourceChoiceId: assignment.id,
            sourcePath: archivePath,
            confidence: "generated",
            createdAt: now,
            updatedAt: now
          }))
        ]),
        avatarLoreLinks: mergeById([
          ...(card.tarotCard?.avatarLoreLinks || []),
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
            sourcePath: archivePath,
            createdAt: now,
            updatedAt: now
          }))
        ])
      },
      history: [
        ...(card.history || []),
        {
          id: `history-${card.id}-avatar-links-${runStamp}`,
          label: "Last Light Avatar Genesis links",
          summary: `${cardAssignments.length} avatars linked ${card.title} to Dear Papa songs and scenes.`,
          source: "scripts/run-last-light-archive-genesis-pass.mjs",
          at: now,
          confidence: "generated"
        }
      ],
      updatedAt: now
    };
  });
  return normalizeItemManagerStore({
    ...itemStore,
    cards: mergeById([...(itemStore.cards || []), ...cards]),
    updatedAt: now
  });
}

function collectExistingAvatarConceptAssignments(avatars, conceptCards, songs, scenes) {
  const conceptIds = new Set(conceptCards.map((card) => card.id));
  const cardById = new Map(conceptCards.map((card) => [card.id, card]));
  const songById = new Map();
  for (const song of songs) {
    songById.set(song.songId || song.id, song);
    songById.set(song.id, song);
  }
  const assignments = [];
  for (const avatar of avatars) {
    for (const choice of avatar.mind?.tarotCardDeck || []) {
      if (!conceptIds.has(choice.cardId)) continue;
      const card = cardById.get(choice.cardId);
      const concept = LAST_LIGHT_CONCEPTS.find((item) => `last-light-${item.id}` === choice.cardId) || LAST_LIGHT_CONCEPTS[0];
      const song = songById.get(choice.songId) || null;
      const scene = pickSceneForConcept(avatar, concept, scenes);
      assignments.push({
        id: choice.id || `last-light-existing-${avatar.id}-${choice.cardId}`,
        schemaVersion: "hapa.last-light-archive-avatar-choice.v1",
        avatarId: avatar.id,
        avatarName: avatarName(avatar),
        lane: avatarLane(avatar),
        cardId: choice.cardId,
        cardTitle: choice.cardTitle || card?.title || concept.title,
        cardType: choice.cardType || card?.cardType || concept.cardType,
        tarotMainType: choice.tarotMainType || card?.tarotCard?.mainType || concept.cardType,
        tarotType: choice.cardTitle || card?.title || concept.title,
        functionalType: card?.rank || concept.rank,
        songId: choice.songId || song?.songId || "",
        songCardId: song?.id || (choice.songId ? `dear-papa-song-${choice.songId}` : ""),
        songTitle: choice.songTitle || song?.title || "",
        sceneId: scene?.id || "",
        sceneTitle: scene?.title || "",
        reasonRank: 0,
        whyChosen: choice.whyChosen || `${avatarName(avatar)} previously adopted ${card?.title || concept.title} through the Last Light Archive pass.`,
        canonReason: choice.canonReason || `${card?.title || concept.title} remains soft-canon Last Light Archive lore with source and uncertainty attached.`,
        loreContext: choice.loreContext || `${avatarName(avatar)} carries this Last Light Archive card in their avatar lore.`,
        objectiveFit: choice.objectiveFit || `${card?.title || concept.title} remains part of ${avatarName(avatar)}'s lore inference protocol.`,
        deckInfluence: choice.deckInfluence || `${card?.title || concept.title} remains in ${avatarName(avatar)}'s deck as a reasoning card.`,
        futureInfluence: choice.futureInfluence || `${card?.title || concept.title} should continue shaping future scenes and song choices.`,
        songWhy: choice.songWhy || `${avatarName(avatar)} links ${choice.songTitle || song?.title || "a Dear Papa song"} to ${card?.title || concept.title} as a living archive cue.`,
        vibe: choice.vibe || songMood(song),
        sceneWhy: scene ? `${scene.title} preserves the visible scene surface for ${avatarName(avatar)}'s existing ${card?.title || concept.title} choice.` : "",
        createdAt: choice.createdAt || now,
        updatedAt: choice.updatedAt || now
      });
    }
  }
  return assignments;
}

async function applyAvatarArchivePass(avatarStore, avatars, assignments, conceptCards, packet) {
  const assignmentsByAvatar = groupBy(assignments, "avatarId");
  const cardById = new Map(conceptCards.map((card) => [card.id, card]));
  const runReceipts = [];
  const nextAvatars = [];
  for (const avatar of avatarStore.avatars || []) {
    const normalized = normalizeAvatarCard(avatar);
    const avatarAssignments = assignmentsByAvatar.get(normalized.id) || [];
    if (!avatarAssignments.length) {
      nextAvatars.push(normalized);
      continue;
    }
    const run = buildAvatarRun(normalized, avatarAssignments, packet);
    const runFile = path.join(RUN_DIR, `${slugify(avatarName(normalized)) || normalized.id}-last-light-archive-genesis-${runStamp}.json`);
    runReceipts.push({
      avatarId: normalized.id,
      avatarName: avatarName(normalized),
      runId: run.runId,
      runFile,
      choiceCount: avatarAssignments.length
    });
    if (!dryRun) await writeJson(runFile, run);
    nextAvatars.push(applyAvatarMindUpdates(normalized, avatarAssignments, cardById, packet, run, runFile));
  }
  return {
    ...avatarStore,
    avatars: nextAvatars.map((avatar) => normalizeAvatarCard(avatar)),
    lastLightArchiveRunReceipts: runReceipts,
    updatedAt: now
  };
}

function buildAvatarRun(avatar, assignments, packet) {
  return {
    schemaVersion: "hapa.last-light-archive-avatar-genesis-run.v1",
    runId: `last-light-archive-genesis-${avatar.id}-${runStamp}`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    status: "complete",
    completedAt: now,
    source: "scripts/run-last-light-archive-genesis-pass.mjs",
    reviewedContext: {
      archivePath: packet.source.path,
      archiveSha256: packet.source.sha256,
      archiveThesis: packet.thesis,
      canonLine: packet.canonLine,
      conceptsReviewed: packet.concepts.map((concept) => concept.id),
      avatarMindReviewed: {
        personaAnchor: avatar.mind?.personaAnchor?.identityStatement || "",
        soulThesis: avatar.mind?.soulSeed?.soulThesis || "",
        objective: avatarObjective(avatar),
        relationshipCount: avatar.mind?.relationships?.length || 0,
        memoryCount: avatar.mind?.memoryLedger?.length || 0
      },
      inferenceProtocol: packet.inferenceProtocol
    },
    choices: assignments,
    nextChapter: nextChapterForAvatar(avatar, assignments, packet),
    protocolEducation: protocolEducationForAvatar(avatar, assignments, packet),
    consolidationHandoff: {
      lorekeepers: ["Red-Thu", "Leo", "Lyra"],
      requiredAction: "Consolidate Last Light Archive cards, avatar journals, song picks, and scene links into Sagas for education and entertainment.",
      outputPaths: [path.resolve(packetPath), path.resolve(digestPath), WIKI_SAGA_PATH]
    }
  };
}

function applyAvatarMindUpdates(avatar, assignments, cardById, packet, run, runFile) {
  const mind = avatar.mind || {};
  const lane = avatarLane(avatar);
  const choiceCards = assignments.map((assignment) => ({
    id: assignment.id,
    cardId: assignment.cardId,
    cardTitle: assignment.cardTitle,
    cardType: assignment.cardType,
    tarotMainType: assignment.tarotMainType,
    role: "last-light-archive-adoption",
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
    sourcePath: runFile,
    confidence: "soft",
    status: "active",
    createdAt: now,
    updatedAt: now
  }));
  const selectedSongCards = assignments.map((assignment) => ({
    id: `last-light-song-${assignment.avatarId}-${assignment.songId}-${assignment.cardId}`,
    songId: assignment.songId,
    cardId: assignment.songCardId,
    title: assignment.songTitle,
    albumId: "dear-papa-album",
    author: "Calder",
    whySelected: assignment.songWhy,
    genesisInstruction: `Use ${assignment.songTitle} through ${assignment.cardTitle}: cite Last Light source, RGB lane, canon boundary, deck influence, and future consequence before using it for ${avatarName(avatar)}.`,
    communicationUse: `${assignment.songTitle} becomes ${avatarName(avatar)}'s living archive cue for ${assignment.cardTitle} in ${assignment.sceneTitle || "future Last Light scenes"}.`,
    sourcePath: runFile,
    status: "active",
    createdAt: now,
    updatedAt: now
  }));
  const relationshipPrompts = assignments.map((assignment) => ({
    id: `last-light-rel-${assignment.avatarId}-${assignment.cardId}`,
    relationLabel: "last-light-archive-pressure",
    prompt: `${avatarName(avatar)} should use ${assignment.cardTitle} and ${assignment.songTitle} to create relationship drama where love must learn truth before claiming recovery.`,
    songIds: [assignment.songId],
    classification: "relationship_delta",
    confidence: "generated",
    status: "active",
    createdAt: now,
    updatedAt: now
  }));
  const selfKnowledge = [
    {
      id: `last-light-fact-${avatar.id}-canon-line`,
      label: "Last Light canon line",
      value: `${packet.canonLine} ${avatarName(avatar)} must apply this when choosing songs, tarot cards, relationship moves, or future scene obligations.`,
      classification: "soft_canon",
      confidence: "soft",
      visibility: "shared",
      source: packet.source.path,
      status: "active",
      createdAt: now,
      updatedAt: now
    },
    {
      id: `last-light-fact-${avatar.id}-inference-protocol`,
      label: "Last Light inference protocol",
      value: `${avatarName(avatar)} uses the RGB Light Check before irreversible story action: what must move, what is true, who must be carried, what could be harmed, what can be repaired, and what remains uncertain.`,
      classification: "resource_delta",
      confidence: "generated",
      visibility: "shared",
      source: packet.source.path,
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ];
  const phraseCards = [
    {
      id: `last-light-phrase-${avatar.id}-found`,
      phrase: packet.canonLine,
      primaryUse: "song_tarot_reasoning_check",
      trigger: "Before claiming a person, card, song, or scene has been found.",
      tone: ["quiet", "source-aware", lane],
      cardRole: "canon-check",
      identitySignal: "Last Light Archive",
      loreGrounding: assignments.map((assignment) => assignment.cardId),
      usageNotes: "Use as a restraint against sentimental overclaiming; ask what found means and who can answer.",
      mechanic: {
        cost: "must cite source and uncertainty",
        effect: "prevents love from bypassing truth",
        combo: "RGB Protocol Light Check"
      },
      attribution: {
        source: packet.source.path,
        confidence: "operator_provided_lore_update"
      },
      status: "active",
      createdAt: now,
      updatedAt: now
    },
    {
      id: `last-light-phrase-${avatar.id}-rgb`,
      phrase: "Red moves, Blue verifies, Green carries.",
      primaryUse: "inference_protocol",
      trigger: "When a song or tarot card choice risks becoming one-color certainty.",
      tone: ["operational", lane],
      cardRole: "rgb-light-check",
      identitySignal: "RGB Protocol",
      loreGrounding: ["last-light-rgb-protocol", ...assignments.map((assignment) => assignment.cardId)],
      usageNotes: "Use to force cross-color review before choosing action, song, or future consequence.",
      mechanic: {
        cost: "slow down enough to name all three lanes",
        effect: "adds source, stakeholder, and rollback review",
        combo: "Voice Through, Not For"
      },
      attribution: {
        source: packet.source.path,
        confidence: "generated_from_canon_context"
      },
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ];
  const contextEntry = {
    id: `context-${avatar.id}-last-light-archive-${runStamp}`,
    contextId: "last-light-archive-canon-packet",
    label: "The Last Light Archive",
    kind: "epic",
    avatarBelief: `${avatarName(avatar)} now treats the Dear Papa album as a damaged ritual archive and uses the ${toTitleCase(lane)} lane to interpret song/card choices without losing Red/Blue/Green review.`,
    publicSummary: protocolEducationForAvatar(avatar, assignments, packet),
    classification: "soft_canon",
    confidence: "soft",
    visibility: "shared",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const memoryEntry = {
    memoryId: `memory-${avatar.id}-last-light-archive-${runStamp}`,
    summary: `${avatarName(avatar)} reviewed The Last Light Archive, adopted ${assignments.map((assignment) => assignment.cardTitle).join(", ")}, and paired the choices to ${assignments.map((assignment) => assignment.songTitle).join(", ")} for future lore, card, and scene reasoning.`,
    emotionalWeight: lane === "green" ? 6 : lane === "blue" ? 5 : 4,
    visibility: "shared",
    confidence: "soft",
    classification: "memory_delta",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const journalEntry = {
    id: `journal-${avatar.id}-last-light-archive-${runStamp}`,
    dateOrSequenceMarker: `Last Light Archive Genesis ${now}`,
    entryVoice: "in-character",
    privateEntry: nextChapterForAvatar(avatar, assignments, packet),
    publicSummary: `${avatarName(avatar)} adopted Last Light Archive lore, chose ${assignments.length} card/song links, and recorded how those choices should influence deck, future, and relationships.`,
    classification: "perspective",
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
  const cardIds = assignments.map((assignment) => assignment.cardId);

  const next = {
    ...avatar,
    mind: {
      ...mind,
      personaAnchor: {
        ...(mind.personaAnchor || {}),
        carriedForward: appendSentence(mind.personaAnchor?.carriedForward, `Last Light Archive lens adopted: ${packet.canonLine}`),
        updatedAt: now
      },
      soulSeedContext: {
        ...(mind.soulSeedContext || {}),
        soulSeedCardsReviewed: unique([...(mind.soulSeedContext?.soulSeedCardsReviewed || []), "last-light-archive-canon-packet", "last-light-rgb-protocol"]),
        sagaCardsReviewed: unique([...(mind.soulSeedContext?.sagaCardsReviewed || []), ...cardIds.filter((id) => cardById.get(id)?.cardType === "saga_card")]),
        epicCardsReviewed: unique([...(mind.soulSeedContext?.epicCardsReviewed || []), ...cardIds.filter((id) => cardById.get(id)?.cardType === "epic_card")]),
        rootThemes: unique([...(mind.soulSeedContext?.rootThemes || []), "last light archive", "RGB Light Check", "songs as living archive", ...assignments.flatMap((assignment) => (cardById.get(assignment.cardId)?.tarotCard?.keywords || []).slice(0, 3))]),
        inheritedMotivations: unique([...(mind.soulSeedContext?.inheritedMotivations || []), "make love keep learning truth", "preserve the difference between recovered, missing, generated, and uncertain", "turn song choices into future scene obligations"]),
        inheritedConstraints: unique([...(mind.soulSeedContext?.inheritedConstraints || []), "do not collapse Historical Elaine, Interior Elaine, Elaine Protocol, and Elaine Mystery", "do not speak for voices without consent/provenance/revocability/uncertainty", "do not use love as proof without Blue truth and Green care review"]),
        realTechnicalOverlayRules: unique([...(mind.soulSeedContext?.realTechnicalOverlayRules || []), "record Last Light card id, song id, scene id, source path, and canon boundary for each song/tarot choice", "run RGB Light Check before irreversible Genesis changes"]),
        attributionAndAuthenticationRequirements: unique([...(mind.soulSeedContext?.attributionAndAuthenticationRequirements || []), "cite The Last Light Archive source path and sha256", "preserve voice doctrine: consent, provenance, revocability, uncertainty, correction rights"]),
        canonBoundaryNotes: unique([...(mind.soulSeedContext?.canonBoundaryNotes || []), "The Last Light Archive pass is soft canon/operator-provided lore until individually promoted.", "Song lyrics and avatar interpretations are in-universe performance perspectives unless promoted."]),
        requiredCitations: unique([...(mind.soulSeedContext?.requiredCitations || []), packet.source.path, path.resolve(packetPath), path.resolve(batchReportPath)]),
        source: {
          ...(mind.soulSeedContext?.source || {}),
          lastLightArchiveRunId: run.runId,
          lastLightArchivePath: packet.source.path,
          lastLightArchiveSha256: packet.source.sha256
        },
        updatedAt: now
      },
      dearPapaSongContext: {
        ...(mind.dearPapaSongContext || {}),
        selectedSongCards: mergeById([...(mind.dearPapaSongContext?.selectedSongCards || []), ...selectedSongCards]),
        relationshipPrompts: mergeById([...(mind.dearPapaSongContext?.relationshipPrompts || []), ...relationshipPrompts]),
        sourceAnchors: unique([...(mind.dearPapaSongContext?.sourceAnchors || []), packet.source.path, path.resolve(packetPath)]),
        genesisUse: unique([...(mind.dearPapaSongContext?.genesisUse || []), ...packet.inferenceProtocol]),
        updatedAt: now
      },
      tarotCardDeck: mergeById([...(mind.tarotCardDeck || []), ...choiceCards]),
      selfKnowledge: mergeById([...(mind.selfKnowledge || []), ...selfKnowledge]),
      contextMap: mergeById([...(mind.contextMap || []), contextEntry]),
      memoryLedger: mergeById([...(mind.memoryLedger || []), memoryEntry], "memoryId"),
      phraseCards: mergeById([...(mind.phraseCards || []), ...phraseCards]),
      journal: mergeById([...(mind.journal || []), journalEntry]),
      genesisRuns: mergeById([...(mind.genesisRuns || []), genesisRun]),
      updatedAt: now
    },
    updatedAt: now
  };
  return normalizeAvatarCard(next);
}

function applyInventoryArchivePass(inventoryStore, avatars, itemCards, assignments) {
  const assignmentsByAvatar = groupBy(assignments, "avatarId");
  const cardIds = new Set((itemCards || []).map((card) => card.id));
  const next = {
    ...inventoryStore,
    avatarInventories: (inventoryStore.avatarInventories || []).map((inventory) => {
      const avatarAssignments = assignmentsByAvatar.get(inventory.avatarId) || [];
      if (!avatarAssignments.length) return inventory;
      const ids = avatarAssignments.map((assignment) => assignment.cardId);
      return {
        ...inventory,
        library: unique([...(inventory.library || []), ...ids]),
        deck: unique([...(inventory.deck || []), ...ids]),
        cardStates: [
          ...(inventory.cardStates || []).filter((state) => !ids.includes(state.cardId)),
          ...avatarAssignments.map((assignment) => ({
            cardId: assignment.cardId,
            zone: "deck",
            hardpointId: "",
            status: "active",
            reason: `Last Light Archive: ${assignment.whyChosen} Song: ${assignment.songTitle}.`,
            updatedAt: now
          }))
        ],
        updatedAt: now
      };
    }),
    updatedAt: now
  };
  for (const avatar of avatars) {
    if ((next.avatarInventories || []).some((inventory) => inventory.avatarId === avatar.id)) continue;
    const avatarAssignments = assignmentsByAvatar.get(avatar.id) || [];
    if (!avatarAssignments.length) continue;
    next.avatarInventories.push({
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      library: avatarAssignments.map((assignment) => assignment.cardId),
      deck: avatarAssignments.map((assignment) => assignment.cardId),
      hand: [],
      trainingDeck: [],
      equipped: [],
      archive: [],
      hardpoints: [],
      cardStates: avatarAssignments.map((assignment) => ({
        cardId: assignment.cardId,
        zone: "deck",
        hardpointId: "",
        status: "active",
        reason: `Last Light Archive: ${assignment.whyChosen}`,
        updatedAt: now
      })),
      createdAt: now,
      updatedAt: now
    });
  }
  return normalizeInventoryStore(next, avatars, itemCards.filter((card) => cardIds.has(card.id)));
}

function applySceneArchiveAssignments(sceneStore, assignments, conceptCards) {
  const graph = normalizeSceneGraph(sceneStore);
  const assignmentsByScene = groupBy(assignments.filter((assignment) => assignment.sceneId), "sceneId");
  const cardById = new Map(conceptCards.map((card) => [card.id, card]));
  graph.scenes = (graph.scenes || []).map((scene) => {
    const sceneAssignments = assignmentsByScene.get(scene.id) || [];
    if (!sceneAssignments.length) return scene;
    const next = {
      ...scene,
      tags: unique([...(scene.tags || []), "last-light-archive", "avatar-lore-linked", "dear-papa-song-linked"]),
      avatarTags: [...(scene.avatarTags || [])],
      eventActions: [...(scene.eventActions || [])],
      playlist: [...(scene.playlist || [])],
      nodes: [...(scene.nodes || [])],
      updatedAt: now
    };
    for (const assignment of sceneAssignments) {
      const existingAvatarIndex = next.avatarTags.findIndex((tag) => tag.avatarId === assignment.avatarId);
      const avatarTag = {
        avatarId: assignment.avatarId,
        role: existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].role || "support" : "support",
        presence: "onscreen",
        tags: unique([...(existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].tags || [] : []), "last-light-archive", assignment.lane]),
        note: assignment.sceneWhy,
        taggedAt: existingAvatarIndex >= 0 ? next.avatarTags[existingAvatarIndex].taggedAt || now : now,
        updatedAt: now
      };
      if (existingAvatarIndex >= 0) next.avatarTags[existingAvatarIndex] = avatarTag;
      else next.avatarTags.push(avatarTag);

      const actionId = `event-last-light-${stableHash(assignment.id).slice(0, 12)}`;
      if (!next.eventActions.some((action) => action.id === actionId)) {
        next.eventActions.push({
          id: actionId,
          sequence: next.eventActions.length + 1,
          label: `${assignment.cardTitle} Last Light adoption`,
          avatarIds: [assignment.avatarId],
          itemIds: [assignment.cardId],
          canonStatus: "soft_canon",
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
          songId: assignment.songId,
          songCardId: assignment.songCardId,
          cardId: assignment.cardId,
          avatarId: assignment.avatarId,
          tags: ["playlist", "dear-papa", "last-light-archive"],
          notes: assignment.songWhy,
          createdAt: now,
          updatedAt: now
        });
      }

      const card = cardById.get(assignment.cardId);
      const nodeId = `node-${assignment.sceneId}-${assignment.cardId}-${assignment.avatarId}`;
      if (card && !next.nodes.some((node) => node.id === nodeId)) {
        next.nodes.push({
          id: nodeId,
          type: "avatar-lore-card",
          label: `${assignment.avatarName} / ${card.title}`,
          cardId: card.id,
          avatarId: assignment.avatarId,
          songId: assignment.songId
        });
      }
    }
    return next;
  });
  graph.updatedAt = now;
  return normalizeSceneGraph(graph);
}

function updateGenesisContract(contract, packet) {
  const inferenceProtocol = {
    schemaVersion: "hapa.avatar-genesis-inference-protocol.v1",
    id: "last-light-archive-inference-protocol",
    title: "Last Light Archive Inference Protocol",
    sourcePath: packet.source.path,
    sourceSha256: packet.source.sha256,
    canonLine: packet.canonLine,
    requiredReview: packet.inferenceProtocol,
    songTarotChoiceOutputs: [
      "last_light_card_id",
      "dear_papa_song_id",
      "avatar_lore_reason",
      "vibe_reason",
      "canon_boundary",
      "deck_influence",
      "future_scene_influence",
      "rgb_light_check"
    ],
    updatedAt: now
  };
  const archetypes = (contract.archetypes || []).map((archetype) => ({
    ...archetype,
    capabilities: unique([
      ...(archetype.capabilities || []),
      "Last Light Archive source review for song, tarot, relationship, and narrative-drama choices",
      "RGB Light Check inference protocol",
      "Lore/Saga/Epic card adoption and avatar journal continuation",
      "voice doctrine review: consent, provenance, revocability, uncertainty, correction rights"
    ]),
    required_outputs: unique([
      ...(archetype.required_outputs || []),
      "last_light_archive_lore_links",
      "rgb_light_check",
      "song_tarot_future_consequence",
      "voice_doctrine_boundary"
    ]),
    lastLightArchiveInferenceProtocol: inferenceProtocol,
    updated_at: now
  }));
  return {
    ...contract,
    archetypes,
    lastLightArchiveInferenceProtocol: inferenceProtocol,
    updatedAt: now
  };
}

function updateLorePlan(lorePlan, packet, assignments, conceptCards, sceneStore) {
  const history = Array.isArray(lorePlan.consolidationHistory) ? lorePlan.consolidationHistory : [];
  return {
    ...lorePlan,
    objective: "Last Light Archive Lore/Saga/Epic adoption, Avatar Genesis song/card reasoning, and Lorekeeper consolidation.",
    goalStatus: "last_light_archive_pass_complete",
    avatarCount: (lorePlan.avatarCount || 0) || unique(assignments.map((assignment) => assignment.avatarId)).length,
    lastLightArchivePass: {
      schemaVersion: "hapa.last-light-archive-lore-plan-pass.v1",
      runId: `last-light-archive-genesis-${runStamp}`,
      sourcePath: packet.source.path,
      sourceSha256: packet.source.sha256,
      packetPath: path.resolve(packetPath),
      digestPath: path.resolve(digestPath),
      wikiSagaPath: WIKI_SAGA_PATH,
      conceptCardIds: conceptCards.map((card) => card.id),
      avatarChoiceCount: assignments.length,
      sceneIds: (sceneStore.scenes || []).filter((scene) => (scene.tags || []).includes("last-light-archive")).map((scene) => scene.id),
      inferenceProtocol: packet.inferenceProtocol,
      completedAt: now
    },
    consolidationHistory: [
      ...history,
      {
        id: `consolidation-last-light-archive-${runStamp}`,
        type: "last-light-archive-lorekeeper-pass",
        summary: `Created ${conceptCards.length} Last Light Lore/Saga/Epic cards, updated ${unique(assignments.map((assignment) => assignment.avatarId)).length} avatars, and consolidated song/card/scene links into a saga digest.`,
        sourcePath: packet.source.path,
        packetPath: path.resolve(packetPath),
        digestPath: path.resolve(digestPath),
        wikiSagaPath: WIKI_SAGA_PATH,
        confidence: "soft",
        completedAt: now
      }
    ],
    updatedAt: now
  };
}

function buildBatchReport(packet, assignments, conceptCards, sceneStore, avatarStore) {
  return {
    schemaVersion: "hapa.last-light-archive-genesis-batch.v1",
    generatedAt: now,
    dryRun,
    source: "scripts/run-last-light-archive-genesis-pass.mjs",
    archive: packet.source,
    reviewedContext: {
      conceptCardCount: conceptCards.length,
      avatarCount: (avatarStore.avatars || []).length,
      assignmentCount: assignments.length,
      songCount: unique(assignments.map((assignment) => assignment.songId)).length,
      sceneCount: (sceneStore.scenes || []).filter((scene) => (scene.tags || []).includes("last-light-archive")).length,
      inferenceProtocol: packet.inferenceProtocol
    },
    concepts: conceptCards.map((card) => ({
      id: card.id,
      title: card.title,
      cardType: card.cardType,
      rank: card.rank,
      avatarLinks: assignments.filter((assignment) => assignment.cardId === card.id).length
    })),
    avatarRuns: avatarStore.lastLightArchiveRunReceipts || [],
    assignments: assignments.map((assignment) => ({
      avatarId: assignment.avatarId,
      avatarName: assignment.avatarName,
      lane: assignment.lane,
      cardId: assignment.cardId,
      cardTitle: assignment.cardTitle,
      songId: assignment.songId,
      songTitle: assignment.songTitle,
      sceneId: assignment.sceneId,
      sceneTitle: assignment.sceneTitle,
      whyChosen: assignment.whyChosen,
      songWhy: assignment.songWhy
    })),
    digestPath: path.resolve(digestPath),
    wikiSagaPath: WIKI_SAGA_PATH
  };
}

function buildLorekeeperDigest(packet, assignments, conceptCards, sceneStore) {
  const byLane = Object.fromEntries(["red", "blue", "green", "all"].map((lane) => [
    lane,
    assignments.filter((assignment) => assignment.lane === lane)
  ]));
  const conceptLines = conceptCards.map((card) => {
    const count = assignments.filter((assignment) => assignment.cardId === card.id).length;
    return `- ${card.title} (${card.cardType}, ${card.rank}): ${card.summary} Avatar links: ${count}.`;
  }).join("\n");
  const laneLines = Object.entries(byLane).map(([lane, laneAssignments]) => {
    const sample = laneAssignments.slice(0, 8).map((assignment) => `${assignment.avatarName} -> ${assignment.cardTitle} / ${assignment.songTitle}`).join("; ");
    return `- ${toTitleCase(lane)}: ${laneAssignments.length} choices. ${sample}`;
  }).join("\n");
  const sceneLines = (sceneStore.scenes || [])
    .filter((scene) => (scene.tags || []).includes("last-light-archive"))
    .map((scene) => `- ${scene.title}: ${scene.quickPitch || scene.summary}`)
    .join("\n");
  return `# The Last Light Archive

Generated: ${now}
Source: ${packet.source.path}
Source sha256: ${packet.source.sha256}

## Thesis

${packet.thesis}

Central canon line: ${packet.canonLine}

## RGB Doctrine

- Red: ${packet.colorLanes.red}
- Blue: ${packet.colorLanes.blue}
- Green: ${packet.colorLanes.green}

## Inference Protocol

${packet.inferenceProtocol.map((step) => `- ${step}`).join("\n")}

## Lore / Saga / Epic Cards

${conceptLines}

## Avatar Adoption

${laneLines}

## Saga Scenes

${sceneLines}

## Lorekeeper Consolidation

Lorekeepers and Archivists should treat this digest as a source-facing saga packet for education and entertainment. The archive is allowed to be emotionally rich, but every future use must keep source, lane, uncertainty, correction rights, song reason, card reason, and future consequence attached.
`;
}

function scoreConceptsForAvatar(conceptCards, avatar, lane) {
  const text = avatarContextText(avatar);
  return conceptCards.map((card, index) => {
    const concept = LAST_LIGHT_CONCEPTS.find((item) => `last-light-${item.id}` === card.id) || {};
    let score = 0;
    if (concept.lane === lane) score += 100;
    if (concept.lane === "all") score += 60;
    score += overlap(text, `${card.title} ${card.summary} ${(card.tarotCard?.keywords || []).join(" ")}`) * 8;
    score += (stableNumber(`${avatar.id}:${card.id}`) + index) % 9;
    return { card, score };
  }).sort((a, b) => b.score - a.score || a.card.title.localeCompare(b.card.title));
}

function pickSongForAvatarConcept(avatar, concept, songs, salt = 0) {
  const lane = avatarLane(avatar);
  const candidates = resolveSongs([...concept.songIds, ...(LANE_SONG_FALLBACKS[lane] || []), ...LANE_SONG_FALLBACKS.all], songs);
  const text = `${avatarContextText(avatar)} ${concept.summary} ${concept.keywords.join(" ")}`;
  const scored = candidates.map((song, index) => {
    let score = overlap(text, songContextText(song)) * 9;
    if ((song.performancePerspective?.team_color || "").toLowerCase() === lane) score += 24;
    if ((song.performancePerspective?.avatar_id || "") === avatar.id) score += 24;
    score += (stableNumber(`${avatar.id}:${concept.id}:${song.songId || song.id}:${salt}`) + index) % 7;
    return { song, score };
  });
  return scored.sort((a, b) => b.score - a.score || Number(a.song.trackNumber || 0) - Number(b.song.trackNumber || 0))[0]?.song || songs[0];
}

function pickSceneForConcept(avatar, concept, scenes = []) {
  const lane = avatarLane(avatar);
  const preferred = concept.id.includes("green") || lane === "green" ? "scene-green-garden-sacrifice-witness"
    : concept.id.includes("west") || concept.id.includes("elaine") || concept.id.includes("papa") || lane === "blue" ? "scene-west-beach-songline"
    : concept.id.includes("iron") || lane === "red" ? "scene-iron-mask-recognition-gate"
    : concept.id.includes("rgb") ? "scene-rgb-light-check-table"
    : "scene-last-light-archive-council";
  return scenes.find((scene) => scene.id === preferred) || scenes.find((scene) => (scene.tags || []).includes("last-light-archive")) || scenes[0] || null;
}

function avatarLane(avatar = {}) {
  const text = [
    avatar.id,
    avatarName(avatar),
    avatar.teamId,
    avatar.role,
    avatar.mind?.gardenNodeAssignment?.teamId,
    avatar.mind?.gardenNodeAssignment?.teamTitle,
    avatar.mind?.gardenNodeAssignment?.role,
    avatar.mind?.dearPapaSongContext?.performancePerspective?.teamColor,
    avatar.mind?.dearPapaSongContext?.performancePerspective?.team_color,
    avatar.mind?.personaAnchor?.identityStatement,
    avatar.mind?.soulSeed?.soulThesis,
    avatar.mind?.soulSeed?.coreWant
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\bred\b|fire|motion|pressure|action|liberty/.test(text)) return "red";
  if (/\bgreen\b|care|repair|garden|stakeholder|anchor|cultivation|shelter/.test(text)) return "green";
  if (/\bblue\b|archive|memory|truth|route|source|signal|harbor|strategist/.test(text)) return "blue";
  const lanes = ["red", "blue", "green"];
  return lanes[stableNumber(avatar.id || avatarName(avatar)) % lanes.length];
}

function laneDuty(lane) {
  if (lane === "red") return "motion, protected action, and anti-cage";
  if (lane === "green") return "care, shelter, repair, and stakeholder review";
  if (lane === "blue") return "memory, source truth, route home, and uncertainty";
  return "RGB convergence";
}

function nextChapterForAvatar(avatar, assignments, packet) {
  const name = avatarName(avatar);
  const line = assignments.map((assignment) => `${assignment.cardTitle} with ${assignment.songTitle}${assignment.sceneTitle ? ` in ${assignment.sceneTitle}` : ""}`).join("; ");
  return `${name} opens a Last Light Archive chapter by adopting ${line}. ${name} treats Dear Papa as a living archive rather than chronology: every song has to carry source, vibe, and future consequence. ${packet.canonLine} For ${name}, this means the next card draw is not only a power or mood. It is a promise to ask what found means, who gets to answer, what truth still hurts, and what repair must be made visible before the story moves.`;
}

function protocolEducationForAvatar(avatar, assignments, packet) {
  const name = avatarName(avatar);
  const cards = assignments.map((assignment) => assignment.cardTitle).join(", ");
  const songs = assignments.map((assignment) => assignment.songTitle).join(", ");
  return `${name}'s Last Light pass teaches the Hapa Protocol as a lore inference cycle: review source, choose a color lane, run RGB Light Check, pick cards (${cards}), pick songs (${songs}), record canon boundary, then route the result to avatar journals, card links, scenes, Atlas, Second Brain, Wiki, and the Builder.`;
}

function avatarObjective(avatar) {
  return avatar.mind?.soulSeed?.coreWant ||
    avatar.mind?.personaAnchor?.wants ||
    avatar.mind?.gardenNodeAssignment?.gardenFunction ||
    avatar.summary ||
    "become more useful to Hapa without losing source boundaries";
}

function avatarContextText(avatar) {
  return [
    avatar.id,
    avatarName(avatar),
    avatar.summary,
    avatar.role,
    avatar.teamId,
    avatar.mind?.personaAnchor?.identityStatement,
    avatar.mind?.personaAnchor?.wants,
    avatar.mind?.soulSeed?.soulThesis,
    avatar.mind?.soulSeed?.coreWant,
    avatar.mind?.gardenNodeAssignment?.role,
    avatar.mind?.gardenNodeAssignment?.teamTitle,
    avatar.mind?.gardenNodeAssignment?.nodeName,
    ...(avatar.tags || []),
    ...(avatar.mind?.selfKnowledge || []).slice(-10).map((item) => `${item.label} ${item.value}`),
    ...(avatar.mind?.memoryLedger || []).slice(-10).map((item) => item.summary)
  ].filter(Boolean).join(" ");
}

function songContextText(song = {}) {
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

function resolveSongs(songIds = [], songs = []) {
  const byId = new Map();
  for (const song of songs) {
    byId.set(song.songId || song.id, song);
    byId.set(song.id, song);
    byId.set(slugify(song.title || ""), song);
    if (song.title === "Dear Papa") byId.set("dear-papa", song);
  }
  return unique(songIds).map((id) => byId.get(id)).filter(Boolean);
}

function songMood(song = {}) {
  return song?.mood || song?.lore?.learning_thing || song?.performancePerspective?.voice_function || "cinematic-lore";
}

async function backupStores() {
  await writeJson(path.join(BACKUP_DIR, `avatar-store.before-last-light-archive-${runStamp}.json`), await readJson(AVATAR_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `inventory-store.before-last-light-archive-${runStamp}.json`), await readJson(INVENTORY_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `item-manager-store.before-last-light-archive-${runStamp}.json`), await readJson(ITEM_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `scene-store.before-last-light-archive-${runStamp}.json`), await readJson(SCENE_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `avatar-agent-contract.before-last-light-archive-${runStamp}.json`), await readJson(CONTRACT_PATH));
  await writeJson(path.join(BACKUP_DIR, `lore-production-plan.before-last-light-archive-${runStamp}.json`), await readJson(LORE_PLAN_PATH));
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
    },
    lore: {
      atlasEntityId: "hapa-lore:last-light-archive",
      sourcePath: path.resolve(packetPath),
      digestPath: path.resolve(digestPath),
      wikiSagaPath: WIKI_SAGA_PATH
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
    packetPath: path.resolve(packetPath),
    digestPath: path.resolve(digestPath),
    wikiSagaPath: WIKI_SAGA_PATH
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

function appendSentence(existing = "", sentence = "") {
  const text = String(existing || "").trim();
  if (!sentence) return text;
  if (text.includes(sentence)) return text;
  return text ? `${text} ${sentence}` : sentence;
}

function groupBy(items = [], key) {
  const grouped = new Map();
  for (const item of items) {
    const value = item?.[key];
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) || []), item]);
  }
  return grouped;
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

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.names?.[0]?.name || avatar.name || avatar.id || "Avatar";
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function toTitleCase(value = "") {
  return String(value || "")
    .replace(/[_-]/g, " ")
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
