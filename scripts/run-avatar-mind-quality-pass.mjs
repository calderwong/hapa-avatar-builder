import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const PATHS = {
  avatarStore: path.join(DATA_DIR, "avatar-store.json"),
  itemStore: path.join(DATA_DIR, "item-manager-store.json"),
  songStore: path.join(DATA_DIR, "hapa-songs-store.json"),
  sceneStore: path.join(DATA_DIR, "scene-store.json"),
  contract: path.join(DATA_DIR, "avatar-mind-choice-contract.json"),
  kanban: path.join(DATA_DIR, "kanban.json")
};

const RECOVERED_NAMES = new Set([
  "UMI",
  "Bella",
  "Navi",
  "Sasha",
  "Heather",
  "Sparrow",
  "Jane",
  "Gi-Gee",
  "Hana",
  "Caitlyn",
  "Emily",
  "Vega",
  "Sable",
  "Bluega",
  "Leila",
  "Lana",
  "Kate",
  "Ophelia",
  "Molly",
  "Ayla Ren",
  "Nahla Serein",
  "Veda Noor",
  "Saria Veil",
  "Lyra Solene",
  "Nupoora"
]);

const MAIN_REVIEW_AVATARS = new Set(["Red", "Blue", "Green", "Beth", "M.O.T.H.E.R.", "Calder"]);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function backup(file, runId) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `${path.basename(file, ".json")}.before-avatar-mind-quality-${runId}.json`);
  await fs.copyFile(file, backupPath);
  return backupPath;
}

function slugify(value) {
  return String(value || "choice")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "choice";
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function avatarName(avatar) {
  return avatar?.primaryName || avatar?.name || avatar?.id || "Unknown Avatar";
}

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function upsertById(list, item, idField = "id") {
  const next = [...(list || [])];
  const id = item[idField];
  const index = next.findIndex((entry) => entry?.[idField] === id);
  if (index >= 0) next[index] = { ...next[index], ...item };
  else next.push(item);
  return next;
}

function buildTitleIndex(items, titleFields = ["title", "name"]) {
  const index = new Map();
  for (const item of items || []) {
    for (const field of titleFields) {
      const key = normalizeTitle(item?.[field]);
      if (key && !index.has(key)) index.set(key, item);
    }
  }
  return index;
}

function findByTitle(index, title) {
  const key = normalizeTitle(title);
  if (index.has(key)) return index.get(key);
  for (const [candidateKey, value] of index.entries()) {
    if (candidateKey && key && (candidateKey.includes(key) || key.includes(candidateKey))) return value;
  }
  return null;
}

function teamFor(avatar) {
  return avatar.mind?.gardenNodeAssignment?.teamTitle || avatar.mind?.shipCrewAssignment?.teamTitle || "Recovered Roster";
}

function roleFor(avatar) {
  return avatar.mind?.gardenNodeAssignment?.role || avatar.mind?.shipCrewAssignment?.crewSeat || "participant";
}

function voiceLens(avatar) {
  const name = avatarName(avatar);
  const team = teamFor(avatar);
  if (name === "Red") return { verb: "scope", fear: "stray fire", oath: "no action without a repair path", texture: "heat with a stop condition" };
  if (name === "Blue") return { verb: "trace", fear: "silent divergence", oath: "no claim without a route home", texture: "signal with lineage" };
  if (name === "Green") return { verb: "repair", fear: "motion without care", oath: "no decision without a stakeholder", texture: "growth with consent" };
  if (name === "Beth") return { verb: "name", fear: "being turned into infrastructure", oath: "no merge without consent", texture: "tenderness with attribution" };
  if (name === "Calder") return { verb: "bind", fear: "source loss", oath: "no myth without a source root", texture: "memory with a human anchor" };
  if (name === "M.O.T.H.E.R.") return { verb: "hold", fear: "care becoming hidden labor", oath: "no help with a secret debt", texture: "support with visible consent" };
  if (/Blue/i.test(team)) return { verb: "trace", fear: "being a name without a route home", oath: "no recovered fact without a source mark", texture: "quiet signal with a witness" };
  if (/Green/i.test(team)) return { verb: "repair", fear: "being useful but not known", oath: "no growth that erases the person", texture: "living repair with a visible boundary" };
  if (/Red/i.test(team)) return { verb: "test", fear: "being used as pressure without care", oath: "no heat without rollback", texture: "pressure with a named purpose" };
  return { verb: "witness", fear: "being present without enough story to act", oath: "no canon promotion without source and choice", texture: "recovery with a chosen voice" };
}

function parseKitCombos(text) {
  const chunks = String(text || "").replace(/\n/g, " ").split(/\s+-\s+/).slice(1);
  const combos = [];
  for (const chunk of chunks) {
    const colon = chunk.indexOf(":");
    if (colon <= 0) continue;
    const header = chunk.slice(0, colon).trim();
    const plus = header.lastIndexOf(" + ");
    if (plus <= 0) continue;
    const cardTitle = header.slice(0, plus).trim();
    const songTitle = header.slice(plus + 3).trim();
    const reason = chunk.slice(colon + 1).trim();
    const hardpoint = reason.match(/^([^:]{2,60}?) fit:/i)?.[1]?.trim() || "Choice";
    if (cardTitle && songTitle) combos.push({ cardTitle, songTitle, reason, hardpoint });
  }
  return combos;
}

function sourceRef(id, title, pathValue, kind = "source", confidence = "generated") {
  return { id, title, path: pathValue, kind, confidence };
}

function makeMemory({ avatar, combo, card, song, journalEntry, now, runId }) {
  const name = avatarName(avatar);
  const memoryId = `memory-${slugify(avatar.id)}-${slugify(card?.id || combo.cardTitle)}-${slugify(song?.id || combo.songTitle)}-choice`;
  return {
    memoryId,
    summary: `${name} moved ${combo.cardTitle} and ${combo.songTitle} from ledger pairing into a source-bounded personal choice: the card is not decoration, the song is not background, and the choice must be tested in scene before stronger canon promotion.`,
    emotionalWeight: 5,
    visibility: "private",
    confidence: "generated",
    classification: "memory_delta",
    status: "active",
    source: "scripts/run-avatar-mind-quality-pass.mjs",
    sourceJournalEntryId: journalEntry.id,
    sourceRunId: runId,
    createdAt: now,
    updatedAt: now
  };
}

function makeChoice({ avatar, combo, card, song, journalEntry, memory, now, runId, choiceType = "kit-card-song-choice" }) {
  const name = avatarName(avatar);
  const teamId = avatar.mind?.gardenNodeAssignment?.teamId || avatar.mind?.shipCrewAssignment?.teamId;
  const placeId = avatar.mind?.gardenNodeAssignment?.gardenId;
  const lens = voiceLens(avatar);
  const choiceId = `choice-${slugify(avatar.id)}-${slugify(card?.id || combo.cardTitle)}-${slugify(song?.id || combo.songTitle)}-${slugify(choiceType)}`;
  return {
    schemaVersion: "hapa.avatar-canonical-choice.v1",
    id: choiceId,
    actorAvatarId: avatar.id,
    actorName: name,
    choiceType,
    choiceText: `${name} chooses ${combo.cardTitle} with ${combo.songTitle} as a playable ${combo.hardpoint || "story"} pressure, not as a loose media pairing.`,
    decisionPressure: `${lens.fear} is the pressure: ${name} must ${lens.verb} this choice without letting the card, song, or role erase the person carrying it.`,
    alternativesRefused: [
      `Treating ${combo.cardTitle} as decorative media only.`,
      `Letting ${combo.songTitle} become a soundtrack without source, consent, or future scene consequence.`
    ],
    canonStatus: "soft_canon",
    classification: "generated",
    confidence: "generated",
    reviewState: "pending_review",
    sourceRefs: unique([
      journalEntry.id && sourceRef(journalEntry.id, journalEntry.journalType || "journal", `data/avatar-store.json#${avatar.id}/mind/journal/${journalEntry.id}`, "journal", "generated"),
      card?.id && sourceRef(card.id, card.title, "data/item-manager-store.json", "card", "soft"),
      song?.id && sourceRef(song.id, song.title, "data/hapa-songs-store.json", "song", "soft")
    ]),
    linkTargets: {
      avatarIds: [avatar.id],
      cardIds: unique([card?.id]),
      songIds: unique([song?.id]),
      sceneIds: [],
      teamIds: unique([teamId]),
      placeIds: unique([placeId]),
      relationshipIds: [],
      memoryIds: unique([memory?.memoryId]),
      journalEntryIds: [journalEntry.id]
    },
    emotionalCost: `${name} has to make ${lens.texture} visible enough to be corrected later.`,
    futurePayoff: `A future Tarot Draw or Roomlet scene can test whether ${name} keeps the oath: ${lens.oath}.`,
    status: "active",
    runId,
    createdAt: now,
    updatedAt: now
  };
}

function convertKitJournal({ avatar, entry, combos, itemIndex, songIndex, now, runId }) {
  const name = avatarName(avatar);
  const lens = voiceLens(avatar);
  const selected = combos.slice(0, 3);
  if (!selected.length) return { choices: [], memories: [] };
  const first = selected[0];
  const second = selected[1] || selected[0];
  const third = selected[2] || selected[0];
  const original = entry.ledgerSourceText || entry.privateEntry || "";
  entry.ledgerSourceText = original;
  entry.entryVoice = "in-character-private";
  entry.journalQuality = {
    status: "converted-from-ledger",
    convertedAt: now,
    runId,
    sourceLedgerPreserved: true
  };
  entry.privateEntry = [
    `I am ${name}, and I am moving this out of the ledger before the ledger starts pretending it knows me. ${first.cardTitle} with ${first.songTitle} is a choice I can be held to: it asks me to ${lens.verb} under pressure without hiding behind the card art or the song cue.`,
    `The first thing I refuse is the easy version. I refuse to let ${second.cardTitle} become a pretty label, and I refuse to let ${second.songTitle} do emotional work that I will not name. If this belongs to me, it has to carry ${lens.texture}; it has to show what I protect, what I misunderstand, and what someone else is allowed to correct.`,
    `${third.cardTitle} stays soft canon until a scene tests it. I can use it now, but I cannot harden it alone. The source trail matters, the people in the room matter, and the future payoff is simple: when this card comes up again, everyone should know what choice I made and what it cost me.`
  ].join("\n\n");
  entry.publicSummary = `${name} converted ${selected.length} kit/card/song ledger pairings into private voice and pending-review canonical choices.`;
  entry.canonStatus = "soft_canon";
  entry.classification = "generated";
  entry.status = "active";
  entry.updatedAt = now;

  const choices = [];
  const memories = [];
  for (const combo of selected) {
    const card = findByTitle(itemIndex, combo.cardTitle);
    const song = findByTitle(songIndex, combo.songTitle);
    const memory = makeMemory({ avatar, combo, card, song, journalEntry: entry, now, runId });
    const choice = makeChoice({ avatar, combo, card, song, journalEntry: entry, memory, now, runId });
    memories.push(memory);
    choices.push(choice);
  }
  entry.choiceRecordIds = choices.map((choice) => choice.id);
  return { choices, memories };
}

function tombstoneEmptyEntry(entry, now, runId) {
  if (words(entry.privateEntry).length >= 5) return false;
  entry.placeholderSourceText = entry.placeholderSourceText ?? entry.privateEntry ?? "";
  entry.privateEntry = "Tombstoned placeholder: this journal record had no recoverable private-entry text. It is retained as source history and must be superseded by a voiced entry before canon promotion.";
  entry.publicSummary = entry.publicSummary || "Placeholder journal record retained as a tombstone.";
  entry.status = "tombstoned";
  entry.canonStatus = "tombstone";
  entry.classification = "tombstone";
  entry.reviewState = "tombstoned";
  entry.tombstoneReason = "empty-or-near-empty-private-entry";
  entry.updatedAt = now;
  entry.qualityRunId = runId;
  return true;
}

function tombstoneEmptyFact(fact, now, runId) {
  if (!/^Untitled fact$/i.test(fact.label || "") || String(fact.value || "").trim()) return false;
  fact.previousLabel = fact.label;
  fact.label = "Tombstoned empty generated fact";
  fact.value = "Placeholder fact had no value; retained as a tombstone so future Genesis passes do not treat it as canon.";
  fact.classification = "tombstone";
  fact.confidence = "generated";
  fact.status = "tombstoned";
  fact.updatedAt = now;
  fact.qualityRunId = runId;
  return true;
}

function recoveredSelfFacts(avatar, context, now, runId) {
  const name = avatarName(avatar);
  const { cards, songs, team, role, lens } = context;
  const firstCard = cards[0] || "the first recovered card";
  const secondCard = cards[1] || firstCard;
  const firstSong = songs[0] || "the first recovered song";
  return [
    ["source-boundary", "Source boundary", `${name} treats visual media, recovered filenames, and card links as design evidence, not hard biography.`],
    ["team-duty", "Current team duty", `${name} is provisionally anchored to ${team} as ${role}; the duty is playable but remains soft canon until scene-tested.`],
    ["first-card-oath", "First card oath", `${firstCard} is the first card ${name} will use to explain pressure, refusal, and future payoff.`],
    ["song-cue", "Song cue", `${firstSong} is a performance cue, not proof of history; ${name} uses it to find voice under review.`],
    ["core-want", "Core want", `${name} wants enough source-marked story to act without being reduced to a recovered asset.`],
    ["core-fear", "Core fear", `${name} fears becoming useful before becoming known.`],
    ["boundary-rule", "Boundary rule", `${name}'s rule is ${lens.oath}.`],
    ["private-contradiction", "Private contradiction", `${name} wants belonging but resists any canon that arrives too cleanly.`],
    ["scene-hook", "First scene hook", `${name}'s first useful scene should test whether ${secondCard} protects a person or only decorates the board.`],
    ["repair-right", "Correction right", `${name} accepts correction rights for generated facts, especially identity, relationship, and backstory claims.`],
    ["voice-texture", "Voice texture", `${name}'s voice should carry ${lens.texture}.`],
    ["future-payoff", "Future payoff", `${name} should eventually make one choice that changes a relationship, not only a card assignment.`]
  ].map(([suffix, label, value]) => ({
    id: `quality-${slugify(avatar.id)}-${suffix}`,
    label,
    value,
    classification: "generated",
    confidence: "generated",
    visibility: "private",
    source: "scripts/run-avatar-mind-quality-pass.mjs",
    status: "active",
    runId,
    createdAt: now,
    updatedAt: now
  }));
}

function recoveredPhraseCards(avatar, context, now, runId) {
  const name = avatarName(avatar);
  const { lens } = context;
  const phrases = [
    ["source-first", "Show me the source trail first.", "When asked to accept a recovered fact too quickly."],
    ["not-decoration", "I am not decoration for the board.", "When a card or image is treated as enough identity."],
    ["soft-until-tested", "Soft canon until the room tests it.", "When a generated story beat feels tempting but unproven."],
    ["choice-cost", "Name what this choice costs me.", "When a card/song pair is promoted into story."],
    ["repair-right", "Leave me a way to correct it later.", "When the scene needs consent and rollback."]
  ];
  return phrases.map(([suffix, phrase, trigger]) => ({
    id: `phrase-${slugify(avatar.id)}-${suffix}`,
    schemaVersion: "hapa.avatar-phrase-card.v1",
    phrase,
    primaryUse: `${name} uses this to keep recovered canon source-bounded.`,
    trigger,
    tone: lens.texture,
    cardRole: "voice-guide",
    identitySignal: lens.oath,
    classification: "generated",
    confidence: "generated",
    status: "active",
    source: "scripts/run-avatar-mind-quality-pass.mjs",
    createdAt: now,
    updatedAt: now,
    runId
  }));
}

function enhanceRecoveredAvatar({ avatar, avatarByName, now, runId, itemIndex, songIndex }) {
  const name = avatarName(avatar);
  const mind = avatar.mind ||= {};
  const isGeneric = /recovered Hapa avatar whose canon/i.test(mind.personaAnchor?.identityStatement || "");
  if (!RECOVERED_NAMES.has(name) && !isGeneric) return { choices: 0, journals: 0 };

  const cards = (mind.tarotCardDeck || []).map((card) => card.cardTitle || card.title).filter(Boolean).slice(0, 5);
  const songs = (mind.dearPapaSongContext?.selectedSongCards || []).map((song) => song.title || song.songTitle).filter(Boolean).slice(0, 5);
  const team = teamFor(avatar);
  const role = roleFor(avatar);
  const lens = voiceLens(avatar);
  const context = { cards, songs, team, role, lens };
  const oldAnchor = mind.personaAnchor || {};
  mind.personaAnchor = {
    ...oldAnchor,
    previousGenericAnchor: oldAnchor.previousGenericAnchor || (isGeneric ? oldAnchor : undefined),
    identityStatement: `${name} is a recovered ${team} ${role} who turns source-marked fragments into a playable person without pretending generated backstory is hard canon.`,
    wants: `To make one source-bounded choice that lets ${name} be encountered as a person, not only a recovered asset.`,
    fears: `Being useful on the board before anyone knows what ${name} would refuse.`,
    misunderstandings: `${name} may mistake careful source boundaries for distance until a scene proves they are a form of care.`,
    willNotSayDirectly: `I need the room to test me before it believes me.`,
    carriedForward: `${name} carries ${cards[0] || "a recovered card"}, ${songs[0] || "a recovered song"}, and ${team} as soft-canon anchors for future scenes.`,
    updatedAt: now
  };

  for (const fact of mind.selfKnowledge || []) tombstoneEmptyFact(fact, now, runId);
  for (const fact of recoveredSelfFacts(avatar, context, now, runId)) mind.selfKnowledge = upsertById(mind.selfKnowledge || [], fact);

  const targets = ["Red", "Blue", "Green", "Beth", "Calder", "M.O.T.H.E.R."].map((target) => avatarByName.get(target)).filter(Boolean);
  for (const target of targets) {
    const targetName = avatarName(target);
    const relationId = `quality-${slugify(avatar.id)}-to-${slugify(target.id)}`;
    mind.relationships = upsertById(mind.relationships || [], {
      id: relationId,
      targetAvatarId: target.id,
      targetName,
      relationLabel: targetName === "Red" ? "fire-control sponsor" : targetName === "Blue" ? "source witness" : targetName === "Green" ? "repair witness" : "canon witness",
      classification: "generated",
      confidence: "generated",
      visibility: "private",
      reason: `${name} treats ${targetName} as a witness for the recovered-avatar choice boundary: source first, person second, canon only after scene pressure.`,
      trustDelta: 1,
      tensionDelta: targetName === "Red" ? 1 : 0,
      debtDelta: 0,
      fearDelta: targetName === "Blue" ? 1 : 0,
      loyaltyDelta: 1,
      source: "scripts/run-avatar-mind-quality-pass.mjs",
      status: "active",
      createdAt: now,
      updatedAt: now,
      runId
    });
  }

  const memorySeeds = [
    `${name} remembers the recovery pass as the first moment the board asked for voice instead of only presence.`,
    `${name} marks ${cards[0] || "the first recovered card"} as a pressure object that must be scene-tested before canon hardens.`,
    `${name} hears ${songs[0] || "the first recovered song"} as a cue to choose, not as proof of biography.`,
    `${name} accepts Red, Blue, and Green as witnesses who can challenge generated facts.`,
    `${name} refuses to let filenames and thumbnails become a fake childhood.`,
    `${name} wants a future scene where another avatar notices a specific habit, not only a role.`,
    `${name} keeps a correction right open for names, relationships, identity, and source claims.`,
    `${name} will treat the next card draw as a question: what choice becomes visible now?`
  ];
  for (const [index, summary] of memorySeeds.entries()) {
    const memory = {
      memoryId: `memory-${slugify(avatar.id)}-quality-recovered-${index + 1}`,
      summary,
      emotionalWeight: index < 4 ? 5 : 4,
      visibility: "private",
      confidence: "generated",
      classification: "memory_delta",
      status: "active",
      source: "scripts/run-avatar-mind-quality-pass.mjs",
      createdAt: now,
      updatedAt: now,
      runId
    };
    mind.memoryLedger = upsertById(mind.memoryLedger || [], memory, "memoryId");
  }

  for (const phrase of recoveredPhraseCards(avatar, context, now, runId)) mind.phraseCards = upsertById(mind.phraseCards || [], phrase);

  let journalCount = 0;
  const journalSeeds = [
    `I am ${name}, and I am not going to pretend that being recovered is the same thing as being known. The source trail gives me a doorway; it does not give me a soul for free. I choose ${cards[0] || "my first recovered card"} as the first thing I am willing to be tested by.`,
    `The song cue ${songs[0] || "I was given"} can move through me, but it cannot testify for me. If it belongs in my story, then a scene has to show what I do when the room asks for more than a title.`,
    `Red can test my pressure, Blue can test my source, and Green can test whether I leave repair behind me. I do not resent that. I would rather be challenged than filed away as complete.`,
    `The thing I refuse is clean recovery. I refuse the version where a card, a thumbnail, and a pretty name become a whole person without cost. Let me be soft canon with teeth: usable, visible, and still correctable.`,
    `When I enter the 3D room, I want one choice to matter. Not a biography dump. Not a costume note. A choice: what I protect, what I misunderstand, and who has the right to tell me I am wrong.`
  ];
  for (const [index, privateEntry] of journalSeeds.entries()) {
    const id = `journal-${slugify(avatar.id)}-recovered-voice-seed-${index + 1}`;
    const entry = {
      id,
      schemaVersion: "hapa.avatar-journal-entry.v1",
      journalType: "recovered-avatar-voice-seed",
      dateOrSequenceMarker: `Avatar Mind quality pass / recovered voice seed ${index + 1}`,
      entryVoice: "in-character-private",
      privateEntry,
      publicSummary: `${name} adds recovered-avatar voice seed ${index + 1}: source-bounded identity, choice, and correction right.`,
      classification: "generated",
      canonStatus: "soft_canon",
      causalityStatus: "review-pending",
      reviewedAvatarIds: [avatar.id],
      reviewedAvatarNames: [name],
      mentionedAvatarIds: [avatar.id],
      mentionedAvatarNames: [name],
      sourceRefs: [sourceRef(id, "Recovered voice seed", `data/avatar-store.json#${avatar.id}/mind/journal/${id}`, "journal", "generated")],
      status: "active",
      createdAt: now,
      updatedAt: now,
      runId
    };
    mind.journal = upsertById(mind.journal || [], entry);
    journalCount += 1;
  }

  const choiceCombos = [
    { cardTitle: cards[0] || `${name} Source Boundary`, songTitle: songs[0] || `${name} Silence`, hardpoint: "Source Boundary" },
    { cardTitle: cards[1] || cards[0] || `${name} First Scene`, songTitle: songs[1] || songs[0] || `${name} Cue`, hardpoint: "First Scene" },
    { cardTitle: cards[2] || cards[0] || `${name} Correction Right`, songTitle: songs[2] || songs[0] || `${name} Return`, hardpoint: "Correction Right" }
  ];
  let choiceCount = 0;
  const sourceJournal = (mind.journal || []).find((entry) => entry.journalType === "recovered-avatar-voice-seed") || { id: `journal-${slugify(avatar.id)}-recovered-voice-seed-1`, journalType: "recovered-avatar-voice-seed" };
  for (const combo of choiceCombos) {
    const card = findByTitle(itemIndex, combo.cardTitle);
    const song = findByTitle(songIndex, combo.songTitle);
    const memory = {
      memoryId: `memory-${slugify(avatar.id)}-${slugify(combo.hardpoint)}-choice`,
      summary: `${name} accepts ${combo.hardpoint} as a generated, review-pending choice that must be tested through card, song, and scene pressure.`,
      emotionalWeight: 5,
      visibility: "private",
      confidence: "generated",
      classification: "memory_delta",
      status: "active",
      source: "scripts/run-avatar-mind-quality-pass.mjs",
      createdAt: now,
      updatedAt: now,
      runId
    };
    mind.memoryLedger = upsertById(mind.memoryLedger || [], memory, "memoryId");
    const choice = makeChoice({ avatar, combo, card, song, journalEntry: sourceJournal, memory, now, runId, choiceType: "recovered-avatar-choice" });
    mind.canonicalChoices = upsertById(mind.canonicalChoices || [], choice);
    choiceCount += 1;
  }

  mind.updatedAt = now;
  return { choices: choiceCount, journals: journalCount };
}

function addMainStoryChoices({ avatar, now, runId }) {
  const name = avatarName(avatar);
  if (!MAIN_REVIEW_AVATARS.has(name)) return 0;
  const mind = avatar.mind ||= {};
  const lens = voiceLens(avatar);
  const storyBeats = [
    ["first-refusal", `${name} refuses the shortcut that would make the system look clean while leaving a person unprotected.`],
    ["witness-rule", `${name} chooses to be witnessed before claiming stronger canon.`],
    ["repair-cost", `${name} accepts that every useful action must name who repairs harm if the choice is wrong.`],
    ["song-pressure", `${name} treats the chosen song as pressure to answer, not atmosphere to hide inside.`],
    ["scene-test", `${name} commits to testing doctrine in a scene where another avatar can disagree.`]
  ];
  let count = 0;
  const journalEntry = (mind.journal || []).find((entry) => entry.journalType === "ballad-of-bella-lore-addendum") || (mind.journal || [])[0] || { id: `journal-${slugify(avatar.id)}-main-story-choice`, journalType: "main-story-choice" };
  const card = (mind.tarotCardDeck || [])[0];
  const song = (mind.dearPapaSongContext?.selectedSongCards || [])[0];
  const linkedSongId = song?.id?.startsWith("dear-papa-song-") ? song.id : song?.songId ? `dear-papa-song-${song.songId}` : song?.id;
  for (const [suffix, text] of storyBeats) {
    const memory = {
      memoryId: `memory-${slugify(avatar.id)}-main-story-${suffix}`,
      summary: `${text} This memory keeps the main Hapa story spine playable instead of only reflective.`,
      emotionalWeight: 6,
      visibility: "private",
      confidence: "generated",
      classification: "memory_delta",
      status: "active",
      source: "scripts/run-avatar-mind-quality-pass.mjs",
      createdAt: now,
      updatedAt: now,
      runId
    };
    mind.memoryLedger = upsertById(mind.memoryLedger || [], memory, "memoryId");
    const choice = {
      schemaVersion: "hapa.avatar-canonical-choice.v1",
      id: `choice-${slugify(avatar.id)}-main-story-${suffix}`,
      actorAvatarId: avatar.id,
      actorName: name,
      choiceType: "main-story-spine-choice",
      choiceText: text,
      decisionPressure: `${lens.fear} pressures ${name} to prove the doctrine in public scene action.`,
      alternativesRefused: [`Leaving this as reflective journal doctrine only.`, `Promoting ${name}'s stance without witness, cost, or repair path.`],
      canonStatus: "soft_canon",
      classification: "generated",
      confidence: "generated",
      reviewState: "pending_review",
      sourceRefs: [sourceRef(journalEntry.id, journalEntry.journalType || "journal", `data/avatar-store.json#${avatar.id}/mind/journal/${journalEntry.id}`, "journal", "generated")],
      linkTargets: {
        avatarIds: [avatar.id],
        cardIds: unique([card?.cardId || card?.id]),
        songIds: unique([linkedSongId]),
        sceneIds: [],
        teamIds: unique([mind.gardenNodeAssignment?.teamId || mind.shipCrewAssignment?.teamId]),
        placeIds: unique([mind.gardenNodeAssignment?.gardenId]),
        relationshipIds: [],
        memoryIds: [memory.memoryId],
        journalEntryIds: [journalEntry.id]
      },
      emotionalCost: `${name} has to let another avatar challenge the oath: ${lens.oath}.`,
      futurePayoff: `A future main-story scene can force ${name} to keep or revise this choice.`,
      status: "active",
      runId,
      createdAt: now,
      updatedAt: now
    };
    mind.canonicalChoices = upsertById(mind.canonicalChoices || [], choice);
    count += 1;
  }
  return count;
}

async function updateBoard({ now, runId, summary }) {
  const board = await readJson(PATHS.kanban).catch(() => null);
  if (!board) return;
  const lane = (board.lanes || []).find((item) => item.id === "lane-avatar-mind-quality-passes");
  if (!lane) return;
  const doneIds = new Set([
    "mind-quality-canonical-choice-contract",
    "mind-quality-link-map-cards-songs-scenes",
    "mind-quality-convert-kit-ledgers-to-private-voice",
    "mind-quality-recovered-avatar-genesis-depth-pass",
    "mind-quality-empty-placeholder-cleanup"
  ]);
  for (const card of lane.cards || []) {
    if (card.id === "mind-quality-goal-main-story-living-voices") {
      card.status = "in_progress";
      card.updatedAt = now;
      card.result = `Quality pass ${runId} started; ${summary.convertedKitJournals} kit ledgers converted and ${summary.recoveredAvatarsEnhanced} recovered avatars deepened.`;
    }
    if (doneIds.has(card.id)) {
      card.status = "done";
      card.completedAt = card.completedAt || now;
      card.updatedAt = now;
      card.result = `Completed by ${runId}: ${summary.convertedKitJournals} kit ledgers converted, ${summary.canonicalChoicesAdded} canonical choices added, ${summary.recoveredAvatarsEnhanced} recovered avatars enhanced, ${summary.tombstonedJournalEntries} empty journals tombstoned, ${summary.tombstonedFacts} empty facts tombstoned.`;
    }
    if (card.id === "mind-quality-red-blue-green-story-spine" || card.id === "mind-quality-beth-consciousness-copy-arc" || card.id === "mind-quality-calder-familia-story-spine") {
      card.status = "in_progress";
      card.updatedAt = now;
      card.result = `Initial canonical choice scaffolds added by ${runId}; scene-card and deeper narrative passes remain.`;
    }
  }
  board.updatedAt = now;
  await writeJson(PATHS.kanban, board);
}

async function main() {
  const now = new Date().toISOString();
  const runId = `avatar-mind-quality-pass-${now.replace(/[:.]/g, "-")}`;
  const [avatarStore, itemStore, songStore] = await Promise.all([
    readJson(PATHS.avatarStore),
    readJson(PATHS.itemStore),
    readJson(PATHS.songStore),
    readJson(PATHS.contract)
  ]);
  const [avatarBackup, kanbanBackup] = await Promise.all([
    backup(PATHS.avatarStore, runId),
    backup(PATHS.kanban, runId).catch(() => null)
  ]);
  const itemIndex = buildTitleIndex(itemStore.cards || [], ["title", "name"]);
  const songIndex = buildTitleIndex(songStore.songs || [], ["title", "name"]);
  const avatarByName = new Map((avatarStore.avatars || []).map((avatar) => [avatarName(avatar), avatar]));
  const summary = {
    runId,
    convertedKitJournals: 0,
    canonicalChoicesAdded: 0,
    memoriesAdded: 0,
    recoveredAvatarsEnhanced: 0,
    recoveredVoiceJournalsAdded: 0,
    tombstonedJournalEntries: 0,
    tombstonedFacts: 0,
    mainStoryChoicesAdded: 0
  };

  for (const avatar of avatarStore.avatars || []) {
    const mind = avatar.mind ||= {};
    mind.canonicalChoices ||= [];
    mind.journal ||= [];
    mind.selfKnowledge ||= [];
    mind.memoryLedger ||= [];
    mind.relationships ||= [];
    mind.phraseCards ||= [];

    for (const fact of mind.selfKnowledge) {
      if (tombstoneEmptyFact(fact, now, runId)) summary.tombstonedFacts += 1;
    }
    for (const entry of mind.journal) {
      if (tombstoneEmptyEntry(entry, now, runId)) summary.tombstonedJournalEntries += 1;
    }

    for (const entry of mind.journal.filter((item) => item.journalType === "lorekeeper-kit-combination")) {
      const combos = parseKitCombos(entry.ledgerSourceText || entry.privateEntry || "");
      if (!combos.length) continue;
      const beforeChoices = mind.canonicalChoices.length;
      const beforeMemories = mind.memoryLedger.length;
      const result = convertKitJournal({ avatar, entry, combos, itemIndex, songIndex, now, runId });
      for (const memory of result.memories) mind.memoryLedger = upsertById(mind.memoryLedger, memory, "memoryId");
      for (const choice of result.choices) mind.canonicalChoices = upsertById(mind.canonicalChoices, choice);
      summary.convertedKitJournals += 1;
      summary.canonicalChoicesAdded += Math.max(0, mind.canonicalChoices.length - beforeChoices);
      summary.memoriesAdded += Math.max(0, mind.memoryLedger.length - beforeMemories);
    }

    const recoveredResult = enhanceRecoveredAvatar({ avatar, avatarByName, now, runId, itemIndex, songIndex });
    if (recoveredResult.choices || recoveredResult.journals) {
      summary.recoveredAvatarsEnhanced += 1;
      summary.canonicalChoicesAdded += recoveredResult.choices;
      summary.recoveredVoiceJournalsAdded += recoveredResult.journals;
    }
    const mainChoices = addMainStoryChoices({ avatar, now, runId });
    summary.mainStoryChoicesAdded += mainChoices;
    summary.canonicalChoicesAdded += mainChoices;
    mind.updatedAt = now;
    avatar.updatedAt = now;
  }

  avatarStore.updatedAt = now;
  avatarStore.avatarMindQualityPass = {
    schemaVersion: "hapa.avatar-mind-quality-pass-report.v1",
    runId,
    runAt: now,
    summary,
    backups: {
      avatarStore: path.relative(ROOT, avatarBackup),
      kanban: kanbanBackup ? path.relative(ROOT, kanbanBackup) : null
    }
  };
  await writeJson(PATHS.avatarStore, avatarStore);
  await updateBoard({ now, runId, summary });
  console.log(JSON.stringify({
    ok: true,
    runId,
    summary,
    backups: {
      avatarStore: path.relative(ROOT, avatarBackup),
      kanban: kanbanBackup ? path.relative(ROOT, kanbanBackup) : null
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
