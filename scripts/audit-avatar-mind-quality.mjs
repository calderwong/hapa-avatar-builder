import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(ROOT, "data");
const REPORT_DIR = path.join(DATA_DIR, "healing-reports");

const PATHS = {
  avatarStore: path.join(DATA_DIR, "avatar-store.json"),
  itemStore: path.join(DATA_DIR, "item-manager-store.json"),
  songStore: path.join(DATA_DIR, "hapa-songs-store.json"),
  sceneStore: path.join(DATA_DIR, "scene-store.json"),
  contract: path.join(DATA_DIR, "avatar-mind-choice-contract.json"),
  kanban: path.join(DATA_DIR, "kanban.json")
};

const FORMULA_PATTERNS = [
  /after the recovered app merge/i,
  /acts as the kit card/i,
  /carries the accountability/i,
  /picked Tarot Draw cards/i,
  /source path, team purpose, and repair boundary/i,
  /without enough lore, cards, songs, or relationships/i
];

const GENERIC_ANCHOR_RE = /recovered Hapa avatar whose canon must preserve source path, team purpose, and repair boundary/i;

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function avatarName(avatar) {
  return avatar?.primaryName || avatar?.name || avatar?.id || "Unknown Avatar";
}

function classifyJournal(entry) {
  const text = String(entry.privateEntry || "");
  const wordCount = words(text).length;
  const formulaHits = FORMULA_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  const lower = text.toLowerCase();
  let score = 0;
  if (/\bi\b|\bmy\b|\bme\b/.test(lower)) score += 1;
  if (/\bremember\b|\bfear\b|\bwant\b|\badmit\b|\bpromise\b|\bguilt\b|\bmiss\b|\bchoose\b|\brefuse\b/.test(lower)) score += 1;
  if (formulaHits.length) score -= 2;
  if (/\bsource\b|\bcanon\b|\bconfidence\b|\bclassification\b|\bprotocol\b|\brollback\b|\broute home\b/.test(lower)) score -= 0.5;
  const empty = wordCount < 5 && entry.status !== "tombstoned";
  return {
    wordCount,
    formulaHits,
    empty,
    voiceLikely: score >= 1,
    ledgerLikely: score < 0 || formulaHits.length > 0,
    score
  };
}

function indexStore(values) {
  return new Set((values || []).map((item) => item?.id).filter(Boolean));
}

function validateChoice(choice, contract, indexes) {
  const missingRequired = (contract.requiredFields || []).filter((field) => choice[field] === undefined || choice[field] === null || choice[field] === "");
  const linkTargets = choice.linkTargets || {};
  const missingLinks = [];
  const check = [
    ["avatarIds", indexes.avatars],
    ["cardIds", indexes.cards],
    ["songIds", indexes.songs],
    ["sceneIds", indexes.scenes],
    ["teamIds", indexes.teams],
    ["placeIds", indexes.places],
    ["memoryIds", indexes.memories],
    ["journalEntryIds", indexes.journals],
    ["relationshipIds", indexes.relationships]
  ];
  for (const [field, index] of check) {
    for (const id of linkTargets[field] || []) {
      if (id && !index.has(id)) missingLinks.push({ field, id });
    }
  }
  return {
    id: choice.id,
    missingRequired,
    missingLinks,
    valid: missingRequired.length === 0 && missingLinks.length === 0
  };
}

function buildIndexes(avatarStore, itemStore, songStore, sceneStore) {
  const avatars = avatarStore.avatars || [];
  const memories = new Set();
  const journals = new Set();
  const relationships = new Set();
  const places = indexStore(sceneStore.places || []);
  for (const avatar of avatars) {
    for (const memory of avatar.mind?.memoryLedger || []) memories.add(memory.memoryId || memory.id);
    for (const journal of avatar.mind?.journal || []) journals.add(journal.id);
    for (const relationship of avatar.mind?.relationships || []) relationships.add(relationship.id);
    if (avatar.mind?.gardenNodeAssignment?.gardenId) places.add(avatar.mind.gardenNodeAssignment.gardenId);
  }
  return {
    avatars: indexStore(avatars),
    cards: indexStore(itemStore.cards || []),
    songs: indexStore(songStore.songs || []),
    scenes: indexStore(sceneStore.scenes || []),
    teams: indexStore(avatarStore.teams || []),
    places,
    memories,
    journals,
    relationships
  };
}

function analyzeAvatars(avatarStore, contract, indexes) {
  const journalTypes = {};
  const emptyEntries = [];
  const formulaEntries = [];
  const voiceEntries = [];
  const ledgerEntries = [];
  const genericAnchors = [];
  const thinAvatars = [];
  const placeholderFacts = [];
  const choiceValidations = [];
  const avatarRows = [];
  let totalJournals = 0;
  let totalChoices = 0;

  for (const avatar of avatarStore.avatars || []) {
    const mind = avatar.mind || {};
    const journals = mind.journal || [];
    const choices = mind.canonicalChoices || [];
    totalJournals += journals.length;
    totalChoices += choices.length;

    const row = {
      id: avatar.id,
      name: avatarName(avatar),
      selfKnowledge: (mind.selfKnowledge || []).length,
      relationships: (mind.relationships || []).length,
      contextMap: (mind.contextMap || []).length,
      memoryLedger: (mind.memoryLedger || []).length,
      journal: journals.length,
      canonicalChoices: choices.length,
      phraseCards: (mind.phraseCards || []).length,
      tarotCardDeck: (mind.tarotCardDeck || []).length,
      genericAnchor: GENERIC_ANCHOR_RE.test(mind.personaAnchor?.identityStatement || "")
    };
    avatarRows.push(row);

    if (row.genericAnchor) genericAnchors.push({ id: avatar.id, name: row.name });
    if (row.genericAnchor || row.selfKnowledge <= 2 || row.memoryLedger <= 1 || row.journal <= 4) thinAvatars.push(row);

    for (const fact of mind.selfKnowledge || []) {
      if (/^Untitled fact$/i.test(fact.label || "") && !String(fact.value || "").trim() && fact.status !== "tombstoned") {
        placeholderFacts.push({ avatarId: avatar.id, avatarName: row.name, factId: fact.id });
      }
    }

    for (const entry of journals) {
      journalTypes[entry.journalType || "missing"] = (journalTypes[entry.journalType || "missing"] || 0) + 1;
      const quality = classifyJournal(entry);
      const item = {
        avatarId: avatar.id,
        avatarName: row.name,
        id: entry.id,
        journalType: entry.journalType,
        wordCount: quality.wordCount,
        formulaHits: quality.formulaHits
      };
      if (quality.empty) emptyEntries.push(item);
      if (quality.formulaHits.length) formulaEntries.push(item);
      if (quality.voiceLikely) voiceEntries.push(item);
      if (quality.ledgerLikely) ledgerEntries.push(item);
    }

    for (const choice of choices) {
      choiceValidations.push({
        avatarId: avatar.id,
        avatarName: row.name,
        ...validateChoice(choice, contract, indexes)
      });
    }
  }

  avatarRows.sort((a, b) => {
    const scoreA = a.selfKnowledge + a.relationships + Math.min(a.memoryLedger, 40) + Math.min(a.journal, 40) + Math.min(a.tarotCardDeck, 20) + Math.min(a.canonicalChoices, 10);
    const scoreB = b.selfKnowledge + b.relationships + Math.min(b.memoryLedger, 40) + Math.min(b.journal, 40) + Math.min(b.tarotCardDeck, 20) + Math.min(b.canonicalChoices, 10);
    return scoreA - scoreB;
  });

  return {
    counts: {
      avatars: avatarStore.avatars?.length || 0,
      totalJournals,
      totalChoices,
      emptyEntries: emptyEntries.length,
      formulaEntries: formulaEntries.length,
      voiceEntries: voiceEntries.length,
      ledgerEntries: ledgerEntries.length,
      genericAnchors: genericAnchors.length,
      thinAvatars: thinAvatars.length,
      placeholderFacts: placeholderFacts.length,
      invalidChoices: choiceValidations.filter((item) => !item.valid).length
    },
    journalTypes,
    emptyEntries,
    formulaEntries,
    genericAnchors,
    thinAvatars,
    placeholderFacts,
    choiceValidations: choiceValidations.filter((item) => !item.valid).slice(0, 100),
    avatarRows
  };
}

function markdownReport(report) {
  const lines = [];
  lines.push("# Avatar Mind Quality Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Counts");
  for (const [key, value] of Object.entries(report.counts)) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push("## Journal Types");
  for (const [key, value] of Object.entries(report.journalTypes).sort((a, b) => b[1] - a[1])) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push("## Thin / Generic Avatars");
  for (const avatar of report.thinAvatars.slice(0, 40)) {
    lines.push(`- ${avatar.name} (${avatar.id}): self ${avatar.selfKnowledge}, relationships ${avatar.relationships}, memories ${avatar.memoryLedger}, journals ${avatar.journal}, choices ${avatar.canonicalChoices}${avatar.genericAnchor ? " - generic anchor" : ""}`);
  }
  lines.push("");
  lines.push("## Empty Or Placeholder Content");
  lines.push(`- Empty journal entries needing tombstone or voice: ${report.emptyEntries.length}`);
  lines.push(`- Empty Untitled facts needing tombstone or rewrite: ${report.placeholderFacts.length}`);
  lines.push("");
  lines.push("## Formula Ledger Hotspots");
  lines.push(`- Entries with formula ledger phrasing: ${report.formulaEntries.length}`);
  for (const entry of report.formulaEntries.slice(0, 20)) lines.push(`- ${entry.avatarName}: ${entry.journalType} / ${entry.id}`);
  lines.push("");
  lines.push("## Choice Contract Validation");
  lines.push(`- Total canonical choices: ${report.counts.totalChoices}`);
  lines.push(`- Invalid canonical choices: ${report.counts.invalidChoices}`);
  for (const choice of report.choiceValidations.slice(0, 20)) lines.push(`- ${choice.avatarName}: ${choice.id} missingRequired=${choice.missingRequired.join(",") || "none"} missingLinks=${choice.missingLinks.length}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function maybeUpdateBoard(reportPath) {
  if (!process.argv.includes("--update-board")) return;
  const board = await readJson(PATHS.kanban).catch(() => null);
  if (!board) return;
  const lane = (board.lanes || []).find((item) => item.id === "lane-avatar-mind-quality-passes");
  if (!lane) return;
  const now = new Date().toISOString();
  for (const card of lane.cards || []) {
    if (card.id === "mind-quality-audit-ledger-vs-voice") {
      card.status = "done";
      card.completedAt = card.completedAt || now;
      card.updatedAt = now;
      card.result = `Latest audit written to ${path.relative(ROOT, reportPath)}.`;
    }
  }
  board.updatedAt = now;
  await writeJson(PATHS.kanban, board);
}

async function main() {
  const [avatarStore, itemStore, songStore, sceneStore, contract] = await Promise.all([
    readJson(PATHS.avatarStore),
    readJson(PATHS.itemStore),
    readJson(PATHS.songStore),
    readJson(PATHS.sceneStore),
    readJson(PATHS.contract)
  ]);
  const generatedAt = new Date().toISOString();
  const indexes = buildIndexes(avatarStore, itemStore, songStore, sceneStore);
  const analysis = analyzeAvatars(avatarStore, contract, indexes);
  const report = {
    schemaVersion: "hapa.avatar-mind-quality-audit.v1",
    generatedAt,
    source: "scripts/audit-avatar-mind-quality.mjs",
    contract: {
      path: path.relative(ROOT, PATHS.contract),
      schemaVersion: contract.schemaVersion,
      requiredFields: contract.requiredFields
    },
    ...analysis
  };
  const jsonPath = path.join(REPORT_DIR, "latest-avatar-mind-quality-audit.json");
  const mdPath = path.join(REPORT_DIR, "latest-avatar-mind-quality-audit.md");
  await writeJson(jsonPath, report);
  await fs.writeFile(mdPath, markdownReport(report), "utf8");
  await maybeUpdateBoard(jsonPath);
  console.log(JSON.stringify({
    ok: true,
    reportPath: path.relative(ROOT, jsonPath),
    markdownPath: path.relative(ROOT, mdPath),
    counts: report.counts
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
