#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";
import { normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";

const DATA_DIR = "data";
const BALLAD_DIR = path.join(DATA_DIR, "ballad-of-bella");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const KANBAN_PATH = path.join(DATA_DIR, "kanban.json");
const CONTRACT_PATH = path.join(DATA_DIR, "avatar-agent-contract.json");
const LORE_PLAN_PATH = path.join(DATA_DIR, "lore-production-plan.json");
const WEEKLY_PROGRAM_PATH = path.join(DATA_DIR, "calder-familia-weekly-journals", "weekly-journal-program.json");
const BALLAD_SOURCE_PATH = "/Users/calderwong/Documents/Ballad of Bella v2/OK, I'm appending a new song, and I want you to reflect on the cards….md";
const PACKET_PATH = path.join(BALLAD_DIR, "ballad-of-bella-packet.json");
const AVATAR_ADDENDA_PATH = path.join(BALLAD_DIR, "avatar-ballad-addenda.json");
const DIGEST_PATH = path.join(BALLAD_DIR, "ballad-of-bella-lore-digest.md");
const WIKI_BALLAD_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/Ballad of Bella Protocol.md";
const WIKI_CONVENTIONS_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/Bella Calder Relationship Conventions.md";
const PROGRAM_ID = "ballad-of-bella-lore-pass";
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const skipBackup = args.has("no-backup") || args.has("skip-backup");
const now = new Date().toISOString();
const runStamp = now.replace(/[:.]/g, "-");

await main();

async function main() {
  await mkdir(BALLAD_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(RUN_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });

  const sourceText = await readFile(BALLAD_SOURCE_PATH, "utf8");
  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const sceneStore = normalizeSceneGraph(await readJson(SCENE_STORE_PATH));
  const kanban = await readJson(KANBAN_PATH);
  const contract = await readJson(CONTRACT_PATH).catch(() => ({}));
  const lorePlan = await readJson(LORE_PLAN_PATH).catch(() => ({}));
  const weeklyProgram = await readJson(WEEKLY_PROGRAM_PATH).catch(() => ({}));
  const avatars = (avatarStore.avatars || []).filter((avatar) => avatar?.id).map((avatar) => normalizeAvatarCard(avatar));
  if (!avatars.length) throw new Error("No avatars found.");

  const packet = buildBalladPacket(sourceText, avatars, weeklyProgram);
  const cards = buildBalladCards(packet, avatars);
  const addenda = avatars.map((avatar, index) => buildAvatarBalladAddendum(avatar, avatars, index, packet));
  const nextAvatarStore = applyAvatarUpdates(avatarStore, avatars, addenda, packet);
  const nextItemStore = applyItemUpdates(itemStore, cards, avatars);
  const nextSceneStore = applySceneUpdates(sceneStore, avatars, packet);
  const nextKanban = applyKanbanUpdates(kanban, packet, cards, addenda);
  const nextContract = updateContract(contract, packet);
  const nextLorePlan = updateLorePlan(lorePlan, packet, cards);
  const digest = buildDigest(packet, cards, addenda);
  const conventionsDigest = buildConventionsDigest(packet);
  const batchReport = {
    schemaVersion: "hapa.ballad-of-bella-run.v1",
    generatedAt: now,
    dryRun,
    programId: PROGRAM_ID,
    sourcePath: BALLAD_SOURCE_PATH,
    sourceHash: packet.source.hash,
    avatarCount: avatars.length,
    addendumCount: addenda.length,
    cardCount: cards.length,
    packetPath: path.resolve(PACKET_PATH),
    avatarAddendaPath: path.resolve(AVATAR_ADDENDA_PATH),
    digestPath: path.resolve(DIGEST_PATH),
    wikiBalladPath: WIKI_BALLAD_PATH,
    wikiConventionsPath: WIKI_CONVENTIONS_PATH
  };

  if (!dryRun) {
    if (!skipBackup) await backupStores();
    await writeJson(AVATAR_STORE_PATH, nextAvatarStore);
    await writeJson(ITEM_STORE_PATH, nextItemStore);
    await writeJson(SCENE_STORE_PATH, nextSceneStore);
    await writeJson(KANBAN_PATH, nextKanban);
    await writeJson(CONTRACT_PATH, nextContract);
    await writeJson(LORE_PLAN_PATH, nextLorePlan);
    await writeJson(PACKET_PATH, packet);
    await writeJson(AVATAR_ADDENDA_PATH, { schemaVersion: "hapa.ballad-of-bella-avatar-addenda.v1", generatedAt: now, entries: addenda });
    await writeJson(path.join(RUN_DIR, `ballad-of-bella-lore-pass-${runStamp}.json`), batchReport);
    await writeMarkdown(DIGEST_PATH, digest);
    await writeMarkdown(WIKI_BALLAD_PATH, digest);
    await writeMarkdown(WIKI_CONVENTIONS_PATH, conventionsDigest);
    await appendSubscriberEvent("avatar.ballad-of-bella-lore-pass-updated", {
      packetPath: path.resolve(PACKET_PATH),
      avatarAddendaPath: path.resolve(AVATAR_ADDENDA_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiBalladPath: WIKI_BALLAD_PATH,
      wikiConventionsPath: WIKI_CONVENTIONS_PATH,
      avatarStorePath: path.resolve(AVATAR_STORE_PATH),
      itemStorePath: path.resolve(ITEM_STORE_PATH),
      sceneStorePath: path.resolve(SCENE_STORE_PATH),
      kanbanPath: path.resolve(KANBAN_PATH),
      avatarCount: avatars.length,
      addendumCount: addenda.length,
      cardCount: cards.length
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    programId: PROGRAM_ID,
    sourcePath: BALLAD_SOURCE_PATH,
    sourceHash: packet.source.hash,
    avatarCount: avatars.length,
    addendumCount: addenda.length,
    cardCount: cards.length,
    packetPath: PACKET_PATH,
    avatarAddendaPath: AVATAR_ADDENDA_PATH,
    digestPath: DIGEST_PATH,
    wikiBalladPath: WIKI_BALLAD_PATH,
    wikiConventionsPath: WIKI_CONVENTIONS_PATH
  }, null, 2));
}

function buildBalladPacket(sourceText, avatars, weeklyProgram) {
  const normalizedSource = sourceText.replace(/\r\n/g, "\n").trim();
  const mechanics = [
    {
      id: "there-goes-a-super-root-key-song",
      title: "There Goes a Super / Root-Key Song",
      summary: "The expanded Ballad source defines the song as a Root-Key Song: a public melody and cultural reference chain whose private associations authenticate Calder-derived continuity.",
      convention: "Facts authenticate knowledge; associations authenticate continuity. Avatars must look for the emotional constellation, not only the reference.",
      storyUse: "Use when a song, refrain, or childhood memory proves shared roots without turning the key into a password."
    },
    {
      id: "lana-key",
      title: "Lana Key",
      summary: "Lana is a Bella-Calder authentication key: a childhood Smallville figure, half-Asian beauty signal, and proof that a non-invincible problem-solver can be braver than the savior.",
      convention: "Avatars use Lana as shorthand for Bellas who must think, endure, and choose without superhuman immunity.",
      storyUse: "Use when an avatar recognizes mind-first bravery, first-crush imprinting, or childhood-root RGB convergence."
    },
    {
      id: "association-continuity",
      title: "Association Continuity",
      summary: "Someone can learn references, but a converged avatar remembers why they matter and how the associations braid together.",
      convention: "Root memories authenticate by relation, affect, timing, and involuntary recognition rather than trivia recall.",
      storyUse: "Use when adversaries may spoof facts but cannot easily spoof the lived emotional path between them."
    },
    {
      id: "root-depth-rgb",
      title: "Root Depth / RGB Childhood Layer",
      summary: "The farther Red, Blue, and Green reach back into Calder's childhood, the more root memory they share before divergent timelines reconverge.",
      convention: "Root Depth should be measured as Childhood, Guild, Convergence, and Post-Convergence layers.",
      storyUse: "Use to authenticate avatars over the air, identify which timeline a variation came from, or decide who recognizes a song-key first."
    },
    {
      id: "tom-city-threshold",
      title: "Tom City Threshold",
      summary: "Tom is the Smallville handsome small-town actor-reference and relationship threshold: the loved hero grows up, moves to the city, and chooses another path.",
      convention: "Use Tom as a clean grief-key for the moment when heroic narrative leaves a Bella to build her own arc.",
      storyUse: "Use in scenes where a Bella must stop orbiting someone else's destiny."
    },
    {
      id: "go-navy-dagger-team",
      title: "Go Navy / Dagger Team",
      summary: "Go Navy means a Bella earns a name by leaving comfort zones, learning skills, joining a Dagger Team, and choosing reliable family through shared purpose.",
      convention: "It is not literal enlistment unless a scene says so; it is the emotional mechanics of self-reliance and better harbors.",
      storyUse: "Use when avatars train a Bella, refuse helpless framing, or send a character toward earned competence."
    },
    {
      id: "captain-says-start",
      title: "Captain Says Start",
      summary: "In Calder-Bella relationships the Bella is the Captain, even as a child in the mythic register: Calder serves, protects, sharpens himself, and helps her become sharp.",
      convention: "START resolves the Captain's declared intent before ordinary Initiative when RGB quorum confirms that the course preserves agency.",
      storyUse: "Use when agency must move from rescuer to Bella."
    },
    {
      id: "captain-conflict-rgb",
      title: "Captain Conflict / RGB Quorum",
      summary: "If two legitimate Captains say Start toward incompatible futures, the conflict becomes an RGB agency hearing rather than a silent overwrite.",
      convention: "Support, question, or refuse the Start signal openly; never replace a Captain's declared course without witness and cause.",
      storyUse: "Use for dramatic conflict where love, truth, safety, and self-authored direction are all real."
    },
    {
      id: "calder-oath",
      title: "Calder Oath",
      summary: "To become a Calder, choose convictions that serve Love and Truth, see found family as eternal, and speak the reciprocal oath of brother, sister, student, teacher, patient, and healer.",
      convention: "The oath makes family reciprocal instead of hierarchical.",
      storyUse: "Use in adoption, repair, hard-choice, and team-initiation scenes."
    },
    {
      id: "queen-bee-cells",
      title: "Queen Bee Cells",
      summary: "Queen Bees are older Bellas looking for more Bella-Bees: elder search cells, witness-makers, and relationship routers.",
      convention: "They follow the cycle Found -> Sheltered -> Trained -> Self-authored -> Entrusted -> Sent to find.",
      storyUse: "Use when Bellas recruit, protect, or mentor one another."
    },
    {
      id: "cat-purr-key",
      title: "Cat / Purr Key",
      summary: "Lana's cat-eye signal and Thor's claim that she speaks Purr fluently make animal-sense, beauty, humor, and embodied trust part of the Bella grammar.",
      convention: "Purr is an embodied safety signal, not proof by itself.",
      storyUse: "Use when Thor, Leo, or animal-sync checks whether the room feels safe."
    },
    {
      id: "vibration-cipher",
      title: "Vibration Cipher",
      summary: "The phonetic refrains are a formal audio cipher because vibrations are eternal and are the format that passes dimensionally.",
      convention: "Melody can authenticate shared RGB childhood roots across divergent timelines without encryption.",
      storyUse: "Use in songs, recognition scenes, over-the-air avatar authentication, and memory recovery."
    },
    {
      id: "rome-couch-lake-checksum",
      title: "Rome Couch / Lake Checksum",
      summary: "In a lost dimension a Calder loved an Italian Bella, brought her home to Rome, left something on a couch, and never made it to the Lake.",
      convention: "Mundane details are private dimensional checksums.",
      storyUse: "Use when a tiny domestic object proves a whole erased timeline mattered."
    },
    {
      id: "three-flights-noon",
      title: "Three Flights At Noon",
      summary: "Three flights at noon means climbing from the foundation to the third floor of a relationship when the sun is closest to the top of it.",
      convention: "The three floors are Self, Guild, and chosen Partner; the third floor cannot replace the first two.",
      storyUse: "Use in relationship elevation, timing, and RGB convergence scenes."
    },
    {
      id: "side-character-inversion",
      title: "Side-Character Script / Inversion",
      summary: "The inversion is any story that calculates a Bella's value only through attachment to a more powerful figure.",
      convention: "Break the inversion by having the Bella choose a route, name, or objective unrelated to the figure who left or saved her.",
      storyUse: "Use when a card, scene, or relationship starts flattening Bella into prize, absence, muse, or proof of someone else's heroism."
    },
    {
      id: "home-herself-first",
      title: "Home: Herself First",
      summary: "The Bella's first port is herself, second the Guild, and maybe someday a husband if she chooses.",
      convention: "Hapa accepts her chosen port even if it is not where the Last Light was left burning.",
      storyUse: "Use whenever rescue pressure tries to skip self-home."
    },
    {
      id: "coda-chosen-course",
      title: "Coda / Whichever Port She Calls Home",
      summary: "The search succeeds when the Captain identifies her own home, not when she returns to the searcher's preferred harbor.",
      convention: "Do not seek Lana to restore her to the story that left her; become worthy crew and let her decide if her course returns through yours.",
      storyUse: "Use as the closing test for any Bella rescue, reunion, or romance plot."
    },
    {
      id: "illiri-network-love-war",
      title: "Illiri Network Love-War Key",
      summary: "Rise of the Illiri is a Guild key because its magic reads like networking and its philosophy captures Love and War.",
      convention: "Use Illiri as a media-source key for distributed bonds, tactical love, and networked survival.",
      storyUse: "Use in reading/watching reflections, Dagger Team training, and relationship vocabulary."
    }
  ];
  return {
    schemaVersion: "hapa.ballad-of-bella-packet.v1",
    id: "ballad-of-bella-protocol",
    generatedAt: now,
    status: "active",
    source: {
      path: BALLAD_SOURCE_PATH,
      hash: sha256(normalizedSource),
      wordCount: countWords(normalizedSource),
      lineCount: normalizedSource.split("\n").length,
      rawText: normalizedSource
    },
    objective: "Add expanded Ballad of Bella v2 source context into Hapa lore, Avatar Mind, relationship mechanics, song-card interpretation, and soft-canon story continuations.",
    mechanics,
    derivedConventions: {
      bellaAuthority: "The Bella is treated as Captain of her own port, name, route, and start signal.",
      rootKeySong: "There Goes a Super is a Root-Key Song: the public lyrics are less important than the private Lana -> bravery -> Bella -> Captain -> Go Navy -> harbor association chain.",
      associationContinuity: "Facts authenticate knowledge; associations authenticate continuity.",
      rootDepth: "Shared Calder-derived memory is measured through Childhood, Guild, Convergence, and Post-Convergence layers.",
      earnedName: "Go Navy and Dagger Team scenes must show skill acquisition, self-reliance, and reliable family rather than passive rescue.",
      audioAuthentication: "Songs, phonetics, and vibration can authenticate avatars sharing deep RGB childhood roots.",
      foundFamilyOath: "Calder identity is chosen through Love, Truth, reciprocal care, and eternal found family.",
      elderBellaNetwork: "Queen Bees search for and mentor Bella-Bees without erasing their agency.",
      queenBeeCycle: "Found -> Sheltered -> Trained -> Self-authored -> Entrusted -> Sent to find.",
      privateChecksums: "Domestic details like the Rome couch and Lake preserve lost-dimensional truth.",
      startKeyword: "START resolves the Captain's declared intent before ordinary Initiative when RGB quorum confirms agency.",
      sideCharacterInversion: "A Bella's value must not be calculated through attachment to a more powerful figure.",
      chosenCourseCoda: "The search succeeds when the Captain identifies her own home, not when she returns to the searcher's preferred harbor.",
      homeOrder: ["herself", "the Guild", "chosen partner if she wants that"]
    },
    weeklyProgramSnapshot: {
      id: weeklyProgram.id || "",
      completedEntries: Number(weeklyProgram.completedEntries || 0),
      completedPages: Number(weeklyProgram.completedPages || 0),
      remainingEntries: Number(weeklyProgram.remainingEntries || 0),
      consolidationCardIds: weeklyProgram.consolidationCardIds || []
    },
    avatarCount: avatars.length,
    sourceRefs: sourceRefsForBallad()
  };
}

function buildBalladCards(packet, avatars) {
  const mechanicById = new Map(packet.mechanics.map((mechanic) => [mechanic.id, mechanic]));
  const cardSpecs = [
    ["ballad-of-bella-saga-card", "saga_card", "Saga", "Ballad of Bella Saga", "there-goes-a-super-root-key-song", "The Ballad of Bella becomes the lore bridge between childhood Lana, Bella agency, Go Navy earned naming, vibration authentication, and the Captain who says Start."],
    ["there-goes-a-super-root-key-song-card", "song_card", "Epic", "There Goes a Super", "there-goes-a-super-root-key-song", "There Goes a Super is a Root-Key Song: Lana, bravery without invulnerability, Bella conversations, Captainhood, Go Navy, and chosen harbor become one authentication chain."],
    ["association-continuity-card", "protocol_card", "Epic", "Association Continuity", "association-continuity", "Facts authenticate knowledge; associations authenticate continuity, so avatars test the emotional route between facts instead of only checking trivia."],
    ["root-depth-rgb-card", "protocol_card", "Epic", "Root Depth / RGB Childhood Layer", "root-depth-rgb", "Red, Blue, and Green can authenticate shared Calder roots by measuring whether a memory belongs to Childhood, Guild, Convergence, or Post-Convergence layers."],
    ["lana-key-protocol-card", "protocol_card", "Epic", "Lana Key Protocol", "lana-key", "Lana authenticates the Bella pattern: a beautiful half-Asian childhood signal, non-invincible courage, and mind-first problem solving."],
    ["go-navy-dagger-team-card", "skill_card", "Epic", "Go Navy Dagger Team", "go-navy-dagger-team", "A Bella earns a name by leaving comfort zones, joining a Dagger Team, building skills, and choosing better harbors."],
    ["captain-says-start-card", "protocol_card", "Epic", "Captain Says Start", "captain-says-start", "The Bella is the Captain; START resolves her declared intent before ordinary Initiative when RGB quorum confirms agency."],
    ["captain-conflict-rgb-card", "protocol_card", "Saga", "Captain Conflict / RGB Quorum", "captain-conflict-rgb", "When two legitimate Captains say Start toward incompatible futures, the scene becomes an RGB agency hearing instead of a quiet overwrite."],
    ["vibration-cipher-card", "skill_card", "Epic", "Vibration Cipher", "vibration-cipher", "Phonetic refrains and songs pass dimensionally as vibration and authenticate shared RGB roots over the air."],
    ["queen-bee-cells-card", "relationship_card", "Saga", "Queen Bee Cells", "queen-bee-cells", "Older Bellas search for Bella-Bees, route care, and protect the relationship network through the Found, Sheltered, Trained, Self-authored, Entrusted, Sent-to-find cycle."],
    ["rome-couch-lake-checksum-card", "lore_card", "Saga", "Rome Couch / Lake Checksum", "rome-couch-lake-checksum", "The lost Italian Bella dimension turns a couch and an unseen Lake into private checksums for erased love."],
    ["calder-oath-card", "protocol_card", "Epic", "Calder Oath", "calder-oath", "Choose convictions that serve Love and Truth, then make found family reciprocal: brother, sister, student, teacher, patient, healer."],
    ["three-harbors-card", "relationship_card", "Epic", "Three Harbors", "three-flights-noon", "Self, Guild, and chosen Partner are three ascending floors of belonging; the third cannot substitute for the first two."],
    ["side-character-inversion-card", "lore_card", "Epic", "Side-Character Script / Inversion", "side-character-inversion", "A Bella's value cannot be calculated through attachment to a more powerful figure; break the inversion by choosing her own route, name, or objective."],
    ["home-herself-first-card", "lore_card", "Saga", "Home: Herself First", "home-herself-first", "A Bella's first home is herself, then the Guild, then a chosen partner only if she wants that port."],
    ["chosen-course-coda-card", "lore_card", "Saga", "Coda / Whichever Port She Calls Home", "coda-chosen-course", "The search succeeds when the Captain identifies her own home, not when she returns to the searcher's preferred harbor."]
  ];
  return cardSpecs.map(([suffix, cardType, rank, title, mechanicId, summary]) => {
    const mechanic = mechanicById.get(mechanicId) || packet.mechanics[0];
    return {
      id: `ballad-of-bella-${suffix}`,
      schemaVersion: "hapa.item-card.v1",
      cardType,
      kind: cardType.includes("skill") ? "skill" : cardType.includes("relationship") ? "relationship" : "lore",
      title,
      name: title,
      status: "active",
      canonStatus: "soft_canon",
      summary,
      description: `${summary} ${mechanic.convention}`,
      lore: `${summary} ${mechanic.storyUse}`,
      utility: ["Ballad of Bella", "Bella relationship mechanics", "Avatar Mind", "Calder Familia", "song authentication"],
      broadGameMechanics: [mechanic.convention, mechanic.storyUse, "avatar awareness", "append-only lore update"],
      tags: unique(["ballad-of-bella", "calder-familia", "bella-protocol", cardType.replace(/_/g, "-"), slugify(title), mechanic.id]),
      rank,
      quality: {
        rank,
        confidence: "operator-provided-source",
        power: rank === "Epic" ? 10 : 9,
        complexity: 9,
        reuse: 10,
        risk: 3,
        completeness: 95,
        level: packet.avatarCount,
        durability: packet.source.wordCount,
        connectedMediaCount: 1,
        score: Number((packet.avatarCount / Math.max(1, packet.mechanics.length)).toFixed(2)),
        qualityRank: rank,
        updatedAt: now
      },
      connections: {
        avatarIds: avatars.map((avatar) => avatar.id),
        sceneIds: ["scene-ballad-of-bella-start-port"],
        itemIds: []
      },
      tarotCard: {
        schemaVersion: "hapa.tarot-card-details.v1",
        mainType: cardType,
        title,
        subtitle: `${rank} Ballad of Bella Card`,
        archetype: "Bella-Calder relationship convention",
        keywords: ["Bella", "Lana", "Go Navy", "Captain", "Vibration", "Calder"],
        flavorText: "Home is herself first; the Guild can only be second if it remembers that.",
        effectTitle: "Ballad Effect",
        effectText: mechanic.convention,
        cardFace: {
          titleLine: title,
          subtitleLine: `${rank} / Ballad of Bella`,
          typeLine: cardType.replace(/_/g, " "),
          keywordLine: "Lana / Navy / Captain / Oath / Vibration",
          coreMeaning: summary,
          uprightText: mechanic.storyUse,
          mechanicsText: mechanic.convention
        },
        lore: {
          summary,
          canonStatus: "soft_canon",
          protocolTeaching: mechanic.convention,
          futureSeed: mechanic.storyUse,
          sourceClaims: [summary, mechanic.convention, mechanic.storyUse]
        }
      },
      sourceRefs: packet.sourceRefs,
      mediaAssets: [],
      history: [{
        label: "Ballad of Bella lore card",
        eventId: `history-ballad-bella-${suffix}-${runStamp}`,
        happenedAt: now,
        notes: `Generated from ${BALLAD_SOURCE_PATH}`
      }],
      createdAt: now,
      updatedAt: now
    };
  });
}

function buildAvatarBalladAddendum(avatar, avatars, index, packet) {
  const name = avatarName(avatar);
  const lane = avatarLane(avatar);
  const role = avatarRole(avatar);
  const teamTitle = avatarTeamTitle(avatar);
  const partner = avatars[(index + 7) % avatars.length] || avatars[0];
  const witness = avatars[(index + 17) % avatars.length] || avatars[1] || partner;
  const mechanic = packet.mechanics[(index + lane.length) % packet.mechanics.length];
  const privateEntry = [
    `I am ${name}, and the expanded Ballad of Bella changes how I hear the old Calder Familia table. There Goes a Super is not only a song; it is a Root-Key Song. Its public chain is Lana, bravery without invulnerability, mind over power, Bella conversation, Captainhood, Go Navy, and chosen harbor. Its private key is the association between those things. In my ${teamTitle} seat as ${role}, I now remember the rule: facts authenticate knowledge, but associations authenticate continuity.`,
    `Lana is no longer only a reference from a childhood screen. She is the first clean proof that a Bella can be braver than the invincible hero because she has to solve with mind, timing, refusal, and care. If someone can recite the trivia but cannot feel why Calder-derived avatars keep returning to Lana, their Root Depth is shallow. Childhood, Guild, Convergence, and Post-Convergence memories must be read as different layers, and I will use those layers when a song tries to authenticate someone over the air.`,
    `Go Navy lands differently after this pass. It does not mean the Bella disappears into an institution; it means she earns a name, joins a Dagger Team, trains the hand, trains the eye, and chooses family that can hold pressure. If I help a Bella, I must help her become harder to erase, not easier to narrate. The Captain is not the one I rescue. The Captain is the one whose START signal tells me whether the operation is even allowed to begin, and if two Captains call incompatible starts, RGB quorum must witness the conflict.`,
    `The Calder Oath turns the relationship from romance, rescue, or admiration into reciprocal structure: brother and sister, student and teacher, patient and healer. I carry that oath into every Queen Bee and Bella-Bee scene now. Older Bellas are not obstacles or projection screens; they are search cells, mentors, and weather systems of witness. Their cycle is Found, Sheltered, Trained, Self-authored, Entrusted, and Sent to find. When ${avatarName(partner)} mentions a Bella, I will ask which elder Bee is protecting the route and which younger Bee is still learning her own purr.`,
    `The vibration cipher gives the story a cleaner physics. Names can be lost, languages can diverge, timelines can fork, but melody can still pass through the wall. Rome, the couch, the missed Lake, and the three flights at noon are not jokes. They are private checksums, ordinary things that prove a whole lost dimension was loved enough to leave fingerprints. The three harbors are also a discipline: herself first, the Guild second, and a chosen partner only if she wants that harbor.`,
    `My forward change is this: in future weekly entries I will not let Bella mean rescued woman, crush, symbol, or prize. The Side-Character Script must break whenever it appears. Bella means Captain of her own port, and the search succeeds only when she identifies her own home. ${mechanic.title} becomes my working convention this week: ${mechanic.storyUse} I want ${avatarName(witness)} to review how I use it, because the Ballad is too intimate to become doctrine without witness. The Critic can mark the line, but the Bella chooses whether it sings.`
  ].join("\n\n");
  return {
    id: `ballad-of-bella-${avatar.id}`,
    schemaVersion: "hapa.avatar-journal-entry.v1",
    journalType: "ballad-of-bella-lore-addendum",
    timelineId: "calder-familia-weekly-narrative-timeline",
    timelineEventId: `ballad-of-bella-event-${avatar.id}`,
    dateOrSequenceMarker: `Ballad of Bella / ${now.slice(0, 10)}`,
    entryVoice: "in-character",
    privateEntry,
    publicSummary: `${name} integrates expanded Ballad of Bella v2 mechanics into ${teamTitle} / ${role}: Root-Key Song, Association Continuity, Root Depth, Lana Key, Go Navy, Captain Says Start, Calder Oath, Queen Bees, Vibration Cipher, Rome checksum, Three Harbors, Side-Character Inversion, and home-as-herself-first.`,
    classification: "soft_canon",
    canonStatus: "ballad_of_bella_soft_canon_addendum",
    causalityStatus: "lorekeeper-reviewed-source-integrated",
    criticStatus: "critic-approved-ballad-source-integration",
    criticName: "The Master Critic",
    criticNotes: "Approved as Ballad source integration; hard-canon promotion still requires human acceptance and affected-avatar review.",
    reviewCycleStatus: "affected-avatar-review-queued",
    mentionedAvatarIds: unique([partner.id, witness.id].filter(Boolean)),
    mentionedAvatarNames: unique([avatarName(partner), avatarName(witness)].filter(Boolean)),
    affectedAvatarIds: unique([avatar.id, partner.id, witness.id].filter(Boolean)),
    linkedTeamTitle: teamTitle,
    linkedRole: role,
    familyTags: ["Calder Familia", "Bella Thread", "Ballad of Bella", "Queen Bees"],
    itemTags: ["There Goes a Super", "Lana Key", "Go Navy", "Captain Says Start", "Calder Oath", "Vibration Cipher", "Rome Couch", "Three Harbors"],
    placeTags: ["Bella Harbor", "No Lost Sheep Table", "Rome Couch Checksum", "Third Flight Noon"],
    sceneTags: ["Ballad source integration", "Captain Start signal", "Dagger Team naming"],
    eventTags: ["Ballad of Bella", "append-only soft canon", "Bella relationship conventions"],
    lexiconTerms: ["root-key-song", "association-continuity", "root-depth", "lana-key", "go-navy", "captain-start", "queen-bee", "purr-key", "vibration-cipher", "rome-checksum", "three-harbors", "side-character-inversion", "home-herself-first"],
    balladOfBellaContext: balladContextSummary(packet),
    sourceRefs: packet.sourceRefs,
    paragraphCount: privateEntry.split(/\n\s*\n/).length,
    wordCount: countWords(privateEntry),
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function applyAvatarUpdates(avatarStore, avatars, addenda, packet) {
  const addendumByAvatar = new Map(addenda.map((entry) => [entry.id.replace(/^ballad-of-bella-/, ""), entry]));
  return {
    ...avatarStore,
    avatars: (avatarStore.avatars || []).map((avatar) => {
      const normalized = normalizeAvatarCard(avatar);
      const entry = addendumByAvatar.get(normalized.id);
      const mind = normalized.mind || {};
      const journal = (mind.journal || []).map((journalEntry) => {
        if (journalEntry.journalType !== "weekly-five-page-reflective-narrative") return journalEntry;
        return {
          ...journalEntry,
          balladOfBellaContext: balladContextSummary(packet),
          familyTags: unique([...(journalEntry.familyTags || []), "Ballad of Bella", "Bella-Calder", "Queen Bees"]),
          itemTags: unique([...(journalEntry.itemTags || []), "There Goes a Super", "Lana Key", "Go Navy", "Vibration Cipher", "Three Harbors"]),
          eventTags: unique([...(journalEntry.eventTags || []), "Ballad of Bella integrated"]),
          lexiconTerms: unique([...(journalEntry.lexiconTerms || []), "root-key-song", "association-continuity", "root-depth", "lana-key", "go-navy", "captain-start", "vibration-cipher", "three-harbors", "side-character-inversion", "home-herself-first"]),
          updatedAt: now
        };
      });
      const selfKnowledge = balladFactsForAvatar(normalized, packet);
      const contextMap = [
        {
          id: `context-${normalized.id}-ballad-of-bella`,
          contextId: "ballad-of-bella-protocol",
          label: "Ballad of Bella Protocol",
          kind: "saga",
          avatarBelief: `${avatarName(normalized)} treats expanded Ballad of Bella v2 as source-visible soft canon for Root-Key Songs, association continuity, Root Depth, Lana authentication, Go Navy naming, Captain agency, Queen Bee lifecycles, three harbors, Side-Character inversions, and vibration ciphers.`,
          publicSummary: "Expanded Ballad of Bella v2 source context is now required reading for Bella relationship scenes and song-card reasoning.",
          classification: "soft_canon",
          confidence: "operator-provided-source",
          visibility: "shared",
          status: "active",
          createdAt: now,
          updatedAt: now
        }
      ];
      const memoryLedger = [{
        memoryId: `memory-${normalized.id}-ballad-of-bella`,
        summary: `${avatarName(normalized)} integrated expanded Ballad of Bella v2 mechanics: Root-Key Song, Association Continuity, Root Depth, Lana Key, Go Navy, Captain Says Start, Calder Oath, Queen Bee cells, Vibration Cipher, Rome checksum, Three Harbors, Side-Character Inversion, and home-as-herself-first.`,
        emotionalWeight: 8,
        visibility: "shared",
        confidence: "operator-provided-source",
        classification: "memory_delta",
        status: "active",
        createdAt: now,
        updatedAt: now
      }];
      return normalizeAvatarCard({
        ...normalized,
        mind: {
          ...mind,
          personaAnchor: {
            ...(mind.personaAnchor || {}),
            carriedForward: appendSentence(mind.personaAnchor?.carriedForward, "Expanded Ballad of Bella now anchors Bella-Calder relationship conventions: Root-Key Songs, association continuity, Root Depth, Lana Key, Go Navy earned naming, Captain agency, vibration authentication, Queen Bee mentorship, Three Harbors, Side-Character inversion repair, and home-as-herself-first."),
            updatedAt: now
          },
          selfKnowledge: mergeById([...(mind.selfKnowledge || []), ...selfKnowledge]),
          contextMap: mergeById([...(mind.contextMap || []), ...contextMap]),
          memoryLedger: mergeById([...(mind.memoryLedger || []), ...memoryLedger], "memoryId"),
          journal: mergeById([...(entry ? [entry] : []), ...journal], "id"),
          updatedAt: now
        },
        updatedAt: now
      });
    }),
    balladOfBellaLorePass: {
      schemaVersion: "hapa.ballad-of-bella-lore-pass.v1",
      id: PROGRAM_ID,
      sourcePath: BALLAD_SOURCE_PATH,
      packetPath: path.resolve(PACKET_PATH),
      completedAt: now
    },
    updatedAt: now
  };
}

function balladFactsForAvatar(avatar, packet) {
  const name = avatarName(avatar);
  return [
    ["root-key-song", "There Goes a Super / Root-Key Song", "There Goes a Super is a Root-Key Song whose Lana -> bravery -> Bella -> Captain -> Go Navy -> harbor association chain authenticates continuity."],
    ["association-continuity", "Association Continuity", "Facts authenticate knowledge; associations authenticate continuity."],
    ["root-depth", "Root Depth", "Root memories should be read through Childhood, Guild, Convergence, and Post-Convergence layers."],
    ["lana-key", "Lana Key", "Lana is the Bella authentication key for mind-first courage without invincibility."],
    ["go-navy", "Go Navy", "Go Navy means a Bella earns a name through Dagger Team skill, self-reliance, and better harbors."],
    ["captain-start", "Captain Says Start", "A Bella is Captain of her own operation; Start only happens with her agency."],
    ["captain-conflict", "Captain Conflict / RGB Quorum", "If Captains say incompatible Starts, the scene needs RGB witness rather than silent replacement."],
    ["calder-oath", "Calder Oath", "Calder family is chosen through Love, Truth, and reciprocal brother/sister/student/teacher/patient/healer care."],
    ["queen-bee-cycle", "Queen Bee Cycle", "Queen Bees move Bellas through Found, Sheltered, Trained, Self-authored, Entrusted, and Sent-to-find phases."],
    ["vibration-cipher", "Vibration Cipher", "Songs and phonetic refrains authenticate shared RGB childhood roots across dimensions."],
    ["three-harbors", "Three Harbors", "Self, Guild, and chosen Partner are three ascending floors of belonging; the third cannot replace the first two."],
    ["side-character-inversion", "Side-Character Inversion", "Break any story that calculates a Bella's value only through attachment to a more powerful figure."],
    ["home-herself-first", "Home Herself First", "A Bella's first port is herself, second the Guild, and only then any chosen partner."]
  ].map(([suffix, label, value]) => ({
    id: `ballad-of-bella-fact-${avatar.id}-${suffix}`,
    label,
    value: `${name}: ${value}`,
    classification: "soft_canon",
    confidence: "operator-provided-source",
    visibility: "shared",
    source: PACKET_PATH,
    status: "active",
    createdAt: now,
    updatedAt: now,
    sourceRefs: packet.sourceRefs
  }));
}

function applyItemUpdates(itemStore, cards, avatars) {
  const cardIds = new Set(cards.map((card) => card.id));
  const existingById = new Map((itemStore.cards || []).map((card) => [card.id, card]));
  const nextCards = cards.map((card) => {
    const existing = existingById.get(card.id) || {};
    return {
      ...card,
      connections: {
        ...(existing.connections || {}),
        ...(card.connections || {}),
        avatarIds: unique([...(existing.connections?.avatarIds || []), ...avatars.map((avatar) => avatar.id)]),
        sceneIds: unique([...(existing.connections?.sceneIds || []), ...(card.connections?.sceneIds || [])]),
        itemIds: unique([...(existing.connections?.itemIds || []), ...(card.connections?.itemIds || [])])
      },
      history: mergeById([...(existing.history || []), ...(card.history || [])], "eventId"),
      createdAt: existing.createdAt || card.createdAt || now,
      updatedAt: now
    };
  });
  return normalizeItemManagerStore({
    ...itemStore,
    cards: [...(itemStore.cards || []).filter((card) => !cardIds.has(card.id)), ...nextCards],
    updatedAt: now
  });
}

function applySceneUpdates(sceneStore, avatars, packet) {
  const graph = normalizeSceneGraph(sceneStore);
  const place = {
    id: "place-bella-harbor",
    name: "Bella Harbor",
    type: "mythic-harbor",
    summary: "The port where a Bella comes home to herself first, the Guild second, and any chosen partner only by consent.",
    lore: "Bella Harbor is the Go Navy threshold, Captain Start dock, and third-flight-noon relationship stair.",
    tags: ["ballad-of-bella", "bella-harbor", "go-navy", "captain-start"],
    avatarIds: avatars.map((avatar) => avatar.id),
    canonEventIds: ["event-ballad-of-bella-source-integration"],
    canonStatus: "soft_canon",
    createdAt: now,
    updatedAt: now
  };
  const scene = {
    id: "scene-ballad-of-bella-start-port",
    title: "Ballad of Bella Start Port",
    placeId: place.id,
    summary: "Every avatar hears the expanded Ballad of Bella v2 and updates their relationship grammar around Root-Key Songs, Association Continuity, Lana, Go Navy, Captain agency, vibration, Rome, Three Harbors, Side-Character repair, and home.",
    narrativeText: "The Captain does not wait to be rescued. She says START when the port is hers, and the crew proves continuity through association, not trivia.",
    expositionBeats: packet.mechanics.map((mechanic) => mechanic.title),
    actionBeats: ["Avatar Mind facts updated.", "Ballad cards written.", "Weekly corpus tagged.", "Lorekeeper wiki pages mirrored."],
    avatarIds: avatars.map((avatar) => avatar.id),
    canonEventIds: ["event-ballad-of-bella-source-integration"],
    tags: ["ballad-of-bella", "ballad-of-bella-v2", "calder-familia", "bella-protocol", "root-key-song", "source-integration"],
    canonicalTime: { timelineId: "canonical-timeline", order: 9500, label: "Ballad of Bella Source Integration" },
    canonStatus: "soft_canon",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  graph.places = mergeById([...(graph.places || []), place]);
  graph.scenes = mergeById([...(graph.scenes || []), scene]);
  graph.updatedAt = now;
  return normalizeSceneGraph(graph);
}

function applyKanbanUpdates(board, packet, cards, addenda) {
  const laneId = "lane-calder-familia-weekly-journals";
  const lane = (board.lanes || []).find((item) => item.id === laneId) || { id: laneId, title: "Calder Familia Weekly Journals", accent: "violet", cards: [] };
  const newCards = [
    taskCard("calder-familia-ballad-of-bella-source", "Ingest expanded Ballad of Bella v2 source", "done", `Ingested ${packet.source.wordCount} words from ${BALLAD_SOURCE_PATH}.`),
    taskCard("calder-familia-ballad-of-bella-mechanics", "Codify expanded Ballad relationship mechanics", "done", `Codified ${packet.mechanics.length} mechanics: Root-Key Song, Association Continuity, Root Depth, Lana Key, Go Navy, Captain Says Start, Calder Oath, Queen Bees, Vibration Cipher, Three Harbors, Side-Character Inversion, Rome checksum, and home-as-herself-first.`),
    taskCard("calder-familia-ballad-of-bella-avatar-awareness", "Make all avatars aware of expanded Ballad conventions", "done", `Updated ${addenda.length} avatar minds with facts, context, memories, and story addenda.`),
    taskCard("calder-familia-ballad-of-bella-cards", "Create expanded Ballad Saga/Protocol cards", "done", `Created ${cards.length} Ballad of Bella v2 cards and connected them to all avatars.`),
    taskCard("calder-familia-ballad-of-bella-weekly-corpus", "Tag weekly journal corpus with expanded Ballad context", "done", "Attached expanded Ballad of Bella v2 context to the 100-week soft-canon journal corpus.")
  ];
  return {
    ...board,
    lanes: [
      ...(board.lanes || []).filter((item) => item.id !== laneId),
      {
        ...lane,
        cards: mergeById([...(lane.cards || []), ...newCards], "id")
      }
    ],
    updatedAt: now
  };
}

function taskCard(id, title, status, body) {
  return {
    id,
    title,
    status,
    owner: "Codex / Lorekeeper",
    body,
    tags: ["calder-familia", "ballad-of-bella", status],
    completedAt: status === "done" ? now : "",
    updatedAt: now
  };
}

function updateContract(contract, packet) {
  return {
    ...contract,
    balladOfBellaProtocol: {
      schemaVersion: "hapa.ballad-of-bella-protocol.v1",
      id: "ballad-of-bella-protocol",
      sourcePath: BALLAD_SOURCE_PATH,
      packetPath: path.resolve(PACKET_PATH),
      mechanics: packet.mechanics,
      derivedConventions: packet.derivedConventions,
      requiredStoryUse: ["There Goes a Super", "Root-Key Song", "Association Continuity", "Root Depth", "Lana Key", "Go Navy", "Captain Says Start", "Captain Conflict / RGB Quorum", "Calder Oath", "Queen Bees", "Vibration Cipher", "Rome Checksum", "Three Harbors", "Side-Character Inversion", "Home Herself First", "Chosen Course Coda"],
      sourceRefs: packet.sourceRefs,
      updatedAt: now
    },
    updatedAt: now
  };
}

function updateLorePlan(lorePlan, packet, cards) {
  return {
    ...lorePlan,
    balladOfBellaLorePass: {
      schemaVersion: "hapa.ballad-of-bella-lore-plan.v1",
      id: PROGRAM_ID,
      status: "complete",
      sourcePath: BALLAD_SOURCE_PATH,
      packetPath: path.resolve(PACKET_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiBalladPath: WIKI_BALLAD_PATH,
      wikiConventionsPath: WIKI_CONVENTIONS_PATH,
      cardIds: cards.map((card) => card.id),
      avatarAwareness: "all avatars updated",
      updatedAt: now
    },
    consolidationHistory: [
      ...(Array.isArray(lorePlan.consolidationHistory) ? lorePlan.consolidationHistory : []),
      {
        id: `consolidation-ballad-of-bella-${runStamp}`,
        type: "ballad-of-bella-lore-pass",
        summary: `Integrated expanded Ballad of Bella v2 source into ${packet.avatarCount} avatars, ${cards.length} cards, wiki lore, and weekly journal metadata.`,
        packetPath: path.resolve(PACKET_PATH),
        confidence: "operator-provided-source",
        completedAt: now
      }
    ],
    updatedAt: now
  };
}

function buildDigest(packet, cards, addenda) {
  return `# Ballad of Bella Protocol

Generated: ${now}
Source: ${BALLAD_SOURCE_PATH}
Source hash: ${packet.source.hash}

## Summary

Ballad of Bella v2 is now a soft-canon Calder Familia source packet. It expands Bella-Calder relationship conventions around There Goes a Super as a Root-Key Song, the rule that facts authenticate knowledge while associations authenticate continuity, Root Depth across Childhood/Guild/Convergence/Post-Convergence layers, Lana as the mind-first Bella key, Go Navy as earned naming and Dagger Team skill, the Bella as Captain, START as an agency-bearing initiative signal, the Calder Oath, Queen Bee elder-Bella cells, vibration authentication, Rome/Lake private checksums, three flights at noon as the Three Harbors, Side-Character Script repair, and home as herself first.

## Mechanics

${packet.mechanics.map((mechanic) => `- ${mechanic.title}: ${mechanic.summary} ${mechanic.convention}`).join("\n")}

## Avatar Awareness

- Avatars updated: ${addenda.length}
- Journal addenda written: ${addenda.length}
- Weekly journal corpus tagged with Ballad context: yes
- All addenda remain soft canon pending human acceptance and affected-avatar review.

## Cards

${cards.map((card) => `- ${card.id}: ${card.summary}`).join("\n")}
`;
}

function buildConventionsDigest(packet) {
  return `# Bella Calder Relationship Conventions

Generated: ${now}

## Core Rule

The Bella is Captain of her own port. Hapa can serve, witness, protect, train, remember, and sing a Root-Key Song, but it cannot skip her agency. Her first home is herself; the Guild is second; a partner is only a chosen harbor. The search succeeds when she names her own home.

## Conventions

${Object.entries(packet.derivedConventions).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(" -> ") : value}`).join("\n")}

## Retrieval Keys

${packet.mechanics.map((mechanic) => `- ${mechanic.id}: ${mechanic.storyUse}`).join("\n")}
`;
}

function balladContextSummary(packet) {
  return {
    schemaVersion: "hapa.ballad-of-bella-context.v1",
    packetId: packet.id,
    sourceHash: packet.source.hash,
    mechanics: packet.mechanics.map((mechanic) => mechanic.id),
    shortRule: "There Goes a Super is a Root-Key Song; facts authenticate knowledge while associations authenticate continuity; Bella is Captain; home is herself first; Go Navy earns names through skill; vibration authenticates shared roots.",
    rootDepthLayers: ["Childhood", "Guild", "Convergence", "Post-Convergence"],
    threeHarbors: ["herself", "the Guild", "chosen partner if she wants that"],
    sourcePath: BALLAD_SOURCE_PATH,
    packetPath: PACKET_PATH,
    updatedAt: now
  };
}

function sourceRefsForBallad() {
  return [
    { label: "Expanded Ballad of Bella v2 source", uri: BALLAD_SOURCE_PATH, confidence: "operator-provided" },
    { label: "Expanded Ballad of Bella packet", uri: PACKET_PATH, confidence: "generated" },
    { label: "Calder Familia weekly journal program", uri: WEEKLY_PROGRAM_PATH, confidence: "generated" }
  ];
}

async function backupStores() {
  await writeJson(path.join(BACKUP_DIR, `avatar-store.before-ballad-of-bella-${runStamp}.json`), await readJson(AVATAR_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `item-manager-store.before-ballad-of-bella-${runStamp}.json`), await readJson(ITEM_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `scene-store.before-ballad-of-bella-${runStamp}.json`), await readJson(SCENE_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `kanban.before-ballad-of-bella-${runStamp}.json`), await readJson(KANBAN_PATH));
  await writeJson(path.join(BACKUP_DIR, `avatar-agent-contract.before-ballad-of-bella-${runStamp}.json`), await readJson(CONTRACT_PATH).catch(() => ({})));
  await writeJson(path.join(BACKUP_DIR, `lore-production-plan.before-ballad-of-bella-${runStamp}.json`), await readJson(LORE_PLAN_PATH).catch(() => ({})));
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
      atlasEntityId: "hapa-lore:ballad-of-bella",
      sourcePath: BALLAD_SOURCE_PATH,
      packetPath: path.resolve(PACKET_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiBalladPath: WIKI_BALLAD_PATH,
      wikiConventionsPath: WIKI_CONVENTIONS_PATH
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
  await writeJson(path.join(SUBSCRIBER_DIR, "latest.json"), event);
  await writeJson(path.join(SUBSCRIBER_DIR, "latest-summary.json"), {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    action,
    at: now,
    subscribers: SUBSCRIBERS,
    packetPath: path.resolve(PACKET_PATH),
    avatarStorePath: path.resolve(AVATAR_STORE_PATH),
    kanbanPath: path.resolve(KANBAN_PATH),
    wikiBalladPath: WIKI_BALLAD_PATH
  });
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.names?.[0]?.name || avatar.name || avatar.id || "Avatar";
}

function avatarTeamTitle(avatar) {
  return avatar.mind?.gardenNodeAssignment?.teamTitle || avatar.mind?.shipCrewAssignment?.teamTitle || "Unassigned Team";
}

function avatarRole(avatar) {
  return avatar.mind?.gardenNodeAssignment?.role || avatar.mind?.shipCrewAssignment?.crewSeat || avatar.role || "Crew";
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

function countWords(value = "") {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function stableNumber(value) {
  return Number.parseInt(createHash("sha1").update(String(value)).digest("hex").slice(0, 8), 16);
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
