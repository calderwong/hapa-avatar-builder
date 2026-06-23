#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const MANIFEST_PATH = path.join(DATA_DIR, "mimi-card-shop-ingest", "manifest.json");
const OCR_DIR = path.join(DATA_DIR, "mimi-card-shop-ingest", "ocr");
const REPORT_PATH = path.join(DATA_DIR, "mimi-card-shop-ingest", "tarot-draw-taxonomy-repair-report.json");

const KNOWN_CARD_TYPES = [
  "relationship_tarot_card",
  "skill_card",
  "protocol_card",
  "node_card",
  "ship_card",
  "avatar_tarot_card",
  "song_tarot_card",
  "lore_tarot_card",
  "location_tarot_card",
  "hapa_tarot_card",
  "capability_card",
  "garden_card",
  "item_card",
  "spell_card"
];

const TYPE_META = {
  spell_card: {
    label: "Spell Card",
    short: "Spell",
    kind: "object",
    mechanic: "Play as an activated spell node with cost, risk, upright/inverted outcomes, and visible ritual constraints.",
    relationshipUse: "Use when the avatar relationship is changed by revealed truth, protection, command, grief, or ritual pressure.",
    skillUse: "Use as an explicit spell/action card only when its cost, focus, duration, and limit are visible.",
    protocolTeaching: "Spell cards teach that power needs declared cost, consent, provenance, and rollback paths before it is used."
  },
  garden_card: {
    label: "Garden Card",
    short: "Garden",
    kind: "garden",
    mechanic: "Play as a living place/ecology card that anchors habitat, cultivation, civic order, and long-horizon resource loops.",
    relationshipUse: "Use when a relationship needs a shared place, sanctuary, obligation, or ecology to become real.",
    skillUse: "Use as a place-based capability card when the avatar must cultivate, protect, repair, or govern a living system.",
    protocolTeaching: "Garden cards teach that Hapa spaces are cultivated systems: every choice seeds habitat, memory, and responsibility."
  },
  item_card: {
    label: "Item Card",
    short: "Item",
    kind: "item",
    mechanic: "Play as an equipment/artifact card with utility, maintenance state, owner history, and scene-facing consequences.",
    relationshipUse: "Use when an item carries memory, care, trust, inheritance, repair, or burden between avatars.",
    skillUse: "Use as a concrete tool card when an avatar needs gear, craft, repair, fabrication, or field support.",
    protocolTeaching: "Item cards teach that tools have provenance, condition, affordances, and stewardship duties."
  }
};

function main() {
  if (!fs.existsSync(STORE_PATH)) throw new Error(`Missing ${STORE_PATH}`);
  if (!fs.existsSync(MANIFEST_PATH)) throw new Error(`Missing ${MANIFEST_PATH}`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  backup(STORE_PATH, `item-manager-store.before-taxonomy-repair-${stamp}.json`);
  backup(MANIFEST_PATH, `mimi-manifest.before-taxonomy-repair-${stamp}.json`);

  const store = readJson(STORE_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const ocrTypesByRecordId = buildOcrTypeMap();
  const recordBySourcePath = new Map();
  const recordTypeById = new Map();
  const changedRecords = [];
  const changedPairings = [];
  const changedManifestCards = [];
  const changedStoreCards = [];

  for (const record of manifest.records || []) {
    if (record?.sourcePath) recordBySourcePath.set(path.normalize(record.sourcePath), record);
    const explicitType = ocrTypesByRecordId.get(record.id);
    if (!explicitType) continue;
    recordTypeById.set(record.id, explicitType);
    const before = record.mainType || "";
    if (before !== explicitType) {
      record.mainType = explicitType;
      changedRecords.push({ id: record.id, title: record.title, from: before, to: explicitType });
    }
  }

  for (const pairing of manifest.pairings || []) {
    const explicitType = dominantType([...(pairing.imageIds || []), ...(pairing.videoIds || [])].map((id) => recordTypeById.get(id)));
    if (!explicitType) continue;
    const before = pairing.mainType || "";
    if (before !== explicitType) {
      pairing.mainType = explicitType;
      pairing.pairingKey = rewritePairingKey(pairing.pairingKey, explicitType);
      changedPairings.push({ pairingKey: pairing.pairingKey, title: pairing.title, from: before, to: explicitType });
    }
  }

  for (const card of manifest.cards || []) {
    const sourceRecordTypes = (card.sourcePaths || [])
      .map((sourcePath) => recordBySourcePath.get(path.normalize(sourcePath))?.id)
      .map((id) => recordTypeById.get(id));
    const explicitType = dominantType(sourceRecordTypes);
    if (!explicitType) continue;
    const before = card.cardType || "";
    if (before !== explicitType || card.kind !== TYPE_META[explicitType].kind) {
      card.cardType = explicitType;
      card.kind = TYPE_META[explicitType].kind;
      changedManifestCards.push({ id: card.id, title: card.title, from: before, to: explicitType });
    }
  }

  for (const card of store.cards || []) {
    const sourceRecordTypes = sourceRecordIdsForCard(card, recordBySourcePath)
      .map((id) => recordTypeById.get(id));
    const explicitFromText = explicitTypeFromText(JSON.stringify({
      title: card.title,
      cardType: card.cardType,
      summary: card.summary,
      description: card.description,
      lore: card.lore,
      tarotCard: card.tarotCard
    }));
    const explicitType = dominantType([...sourceRecordTypes, explicitFromText].filter(Boolean));
    if (!explicitType) continue;
    const before = card.tarotCard?.mainType || card.cardType || "";
    if (before !== explicitType || card.kind !== TYPE_META[explicitType].kind) {
      applyCardType(card, explicitType, now);
      changedStoreCards.push({ id: card.id, title: card.title, from: before, to: explicitType });
    }
  }

  manifest.generatedAt = now;
  manifest.counts = {
    ...(manifest.counts || {}),
    cardTypes: countBy(manifest.cards || [], (card) => card.cardType || "unknown"),
    repairedExplicitTypes: countBy(changedStoreCards, (entry) => entry.to)
  };
  store.updatedAt = now;
  store.audit = {
    ...(store.audit || {}),
    tarotDrawTaxonomyRepair: {
      runAt: now,
      ocrExplicitTypeCounts: countBy([...ocrTypesByRecordId.values()], (type) => type),
      changedRecordCount: changedRecords.length,
      changedPairingCount: changedPairings.length,
      changedManifestCardCount: changedManifestCards.length,
      changedStoreCardCount: changedStoreCards.length
    }
  };

  writeJson(MANIFEST_PATH, manifest);
  writeJson(STORE_PATH, store);
  writeJson(REPORT_PATH, {
    schemaVersion: "hapa.tarot-draw-taxonomy-repair.v1",
    runAt: now,
    ocrExplicitTypeCounts: countBy([...ocrTypesByRecordId.values()], (type) => type),
    changedRecords,
    changedPairings,
    changedManifestCards,
    changedStoreCards
  });

  console.log(JSON.stringify({
    changedRecords: changedRecords.length,
    changedPairings: changedPairings.length,
    changedManifestCards: changedManifestCards.length,
    changedStoreCards: changedStoreCards.length,
    reportPath: path.relative(ROOT, REPORT_PATH)
  }, null, 2));
}

function buildOcrTypeMap() {
  const map = new Map();
  if (!fs.existsSync(OCR_DIR)) return map;
  for (const fileName of fs.readdirSync(OCR_DIR)) {
    if (!fileName.endsWith(".json")) continue;
    const filePath = path.join(OCR_DIR, fileName);
    const data = readJson(filePath);
    const text = [
      data.text,
      data.rawText,
      data.ocrText,
      data.fullText,
      Array.isArray(data.lines) ? data.lines.map((line) => line.text || line).join(" ") : ""
    ].filter(Boolean).join(" ");
    const explicitType = explicitTypeFromText(text);
    if (explicitType) map.set(fileName.replace(/\.json$/i, ""), explicitType);
  }
  return map;
}

function explicitTypeFromText(value = "") {
  const text = String(value || "").toLowerCase();
  if (/\bspell\s+card\b|\bspell\s+type\b|\btype\s*:\s*spell\b|\bhapa-spl\b/.test(text)) return "spell_card";
  if (/\bgarden\s+type\b|\bgarden\s+card\b|\bmajor\s+arcana\s*\/+\s*garden\b|\bgardens\s*\/\/\s*civilizations\b/.test(text)) return "garden_card";
  if (/\bitem\s+card\b|\bitem\s+type\b|\btype\s*:\s*item\b|\bhapa-itm\b/.test(text)) return "item_card";
  return "";
}

function dominantType(types = []) {
  const counts = new Map();
  for (const type of types.filter(Boolean)) counts.set(type, (counts.get(type) || 0) + 1);
  return ["spell_card", "garden_card", "item_card"]
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))
    .find((type) => counts.has(type)) || "";
}

function sourceRecordIdsForCard(card = {}, recordBySourcePath = new Map()) {
  const ids = new Set();
  const sourcePaths = [
    ...(card.sourceRefs || []).map((ref) => ref.uri),
    ...(card.tarotCard?.attribution?.sourcePaths || []),
    ...(card.tarotCard?.mediaLinks || []).flatMap((link) => [link.sourcePath, link.imageSourcePath, link.videoSourcePath])
  ].filter(Boolean);
  for (const sourcePath of sourcePaths) {
    const record = recordBySourcePath.get(path.normalize(sourcePath));
    if (record?.id) ids.add(record.id);
  }
  const mediaUris = [
    ...(card.mediaAssets || []).flatMap((asset) => [asset.uri, asset.thumbnailUri, asset.notes]),
    ...(card.tarotCard?.mediaLinks || []).flatMap((link) => [link.imageUri, link.videoUri, link.posterUri])
  ].filter(Boolean).join(" ");
  for (const match of mediaUris.matchAll(/\bmimi-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\bmimi-[0-9a-f]{16}\b/gi)) {
    ids.add(match[0].toLowerCase());
  }
  return [...ids];
}

function applyCardType(card, type, now) {
  const meta = TYPE_META[type];
  const label = meta.label;
  const short = meta.short;
  const title = card.tarotCard?.title || card.title || "Tarot Card";
  card.cardType = type;
  card.kind = meta.kind;
  card.updatedAt = now;
  card.summary = rewriteTypeSentence(card.summary, label);
  card.tags = repairedTags(card.tags, type, label);
  card.broadGameMechanics = repairedMechanics(card.broadGameMechanics, meta.mechanic);
  card.mediaPrompts = {
    ...(card.mediaPrompts || {}),
    heroImage: rewriteTypeSentence(card.mediaPrompts?.heroImage, label),
    explainerVideo: rewriteTypeSentence(card.mediaPrompts?.explainerVideo, label),
    wikiEntry: rewriteTypeSentence(card.mediaPrompts?.wikiEntry, label)
  };
  if (!card.tarotCard) card.tarotCard = {};
  card.tarotCard.mainType = type;
  card.tarotCard.subtitle = rewriteSubtitle(card.tarotCard.subtitle, label);
  card.tarotCard.catalog = {
    ...(card.tarotCard.catalog || {}),
    typeLabel: label,
    pairingKey: rewritePairingKey(card.tarotCard.catalog?.pairingKey, type)
  };
  card.tarotCard.identity = {
    ...(card.tarotCard.identity || {}),
    functionalType: short,
    functionalTypeSlug: type,
    hapaCardType: label,
    hapaCardTypeSlug: type,
    cardTypeName: label,
    cardTypeDetail: label,
    typeLine: label,
    typeStack: unique([
      title,
      card.tarotCard.identity?.arcana || card.tarotCard.archetype || "Dear Papa Tarot",
      short
    ].filter(Boolean))
  };
  card.tarotCard.cardFace = {
    ...(card.tarotCard.cardFace || {}),
    typeLine: label
  };
  card.tarotCard.typeDetails = {
    ...(card.tarotCard.typeDetails || {}),
    label,
    functionalType: short,
    functionalTypeSlug: type,
    role: label,
    command: commandForType(type, title, card.tarotCard.keywords || [])
  };
  card.tarotCard.mechanics = {
    ...(card.tarotCard.mechanics || {}),
    broadGameMechanic: meta.mechanic,
    deckUse: `Draw ${title} from the ${label} pile; resolve it with its OCR-backed card face, media links, avatar links, song links, and scene consequences.`,
    surfaceUse: `${title} can be placed on the surface as a ${label} with visible connectors and type-specific utility.`,
    relationshipUse: meta.relationshipUse,
    skillUse: meta.skillUse,
    effects: repairedMechanics(card.tarotCard.mechanics?.effects, meta.mechanic)
  };
  card.tarotCard.lore = {
    ...(card.tarotCard.lore || {}),
    summary: rewriteTypeSentence(card.tarotCard.lore?.summary, label),
    protocolTeaching: meta.protocolTeaching,
    futureSeed: `${title} should influence future chapters as a ${label} whenever an avatar needs ${short.toLowerCase()} language, cost, and consequence.`
  };
}

function repairedTags(tags = [], type, label) {
  const known = new Set(KNOWN_CARD_TYPES.flatMap((item) => [item, item.replace(/_/g, "-")]));
  return unique([
    ...(Array.isArray(tags) ? tags : []).filter((tag) => !known.has(String(tag).toLowerCase())),
    type,
    label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  ]);
}

function repairedMechanics(values = [], mechanic) {
  const list = Array.isArray(values) ? values : [values].filter(Boolean);
  const filtered = list.filter((value) => !/^Play as (a|an) .*(node|card)|^Play as a Hapa Tarot node/i.test(String(value || "")));
  return unique([mechanic, ...filtered]);
}

function rewriteTypeSentence(value = "", label) {
  if (!value) return value;
  return String(value).replace(/ is an? [A-Za-z /-]+? in the Hapa Tarot System/i, ` is a ${label} in the Hapa Tarot System`);
}

function rewriteSubtitle(value = "", label) {
  if (!value) return `Dear Papa Tarot // ${label}`;
  if (value.includes("//")) return value.replace(/\/\/\s*.*/, `// ${label}`);
  return `${value} // ${label}`;
}

function rewritePairingKey(value = "", type) {
  if (!value) return "";
  const parts = String(value).split("::");
  if (parts.length < 2) return `${type}::${value}`;
  parts[0] = type;
  return parts.join("::");
}

function commandForType(type, title, keywords = []) {
  const focus = Array.isArray(keywords) && keywords.length ? ` for ${keywords.slice(0, 3).join(", ")}` : "";
  if (type === "spell_card") return `Use ${title} as an activated spell${focus}; declare cost, duration, risk, and visible effect.`;
  if (type === "garden_card") return `Use ${title} as a living place/garden${focus}; declare what it cultivates, protects, restores, or governs.`;
  return `Use ${title} as an item/artifact${focus}; declare owner, condition, utility, and consequence.`;
}

function typeLabel(type = "") {
  return TYPE_META[type]?.label || String(type).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countBy(items = [], getter) {
  const counts = {};
  for (const item of items) {
    const key = getter(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function unique(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function backup(filePath, fileName) {
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, fileName));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

main();
