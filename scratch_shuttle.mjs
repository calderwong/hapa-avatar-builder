#!/usr/bin/env node
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { slugify } from "../src/domain/avatar.js";
import { normalizeItemManagerStore } from "../src/domain/item.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const OCR_SCRIPT = path.join(ROOT, "scripts", "vision-ocr.swift");
const RUN_ID = `tarot-ocr-refresh-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const RUN_DIR = path.join(DATA_DIR, "tarot-ocr-refresh", "runs", RUN_ID);
const CACHE_DIR = path.join(RUN_DIR, "ocr");
const STABLE_CACHE_DIR = path.join(DATA_DIR, "tarot-ocr-refresh", "ocr-cache");
const REPORT_PATH = path.join(DATA_DIR, "tarot-ocr-refresh", "latest-report.json");
const RUN_REPORT_PATH = path.join(RUN_DIR, "report.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups", "tarot-ocr-refresh", RUN_ID);
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("--no-write");
const useCache = args.has("--use-cache");
const limit = Number(argValue("--limit") || 0);
const now = new Date().toISOString();

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|tiff?|bmp)(\?|#|$)/i;
const SECTION_STOPS = [
  "CORE MEANING",
  "UPRIGHT",
  "MECHANICS",
  "INVERTED",
  "VISUAL LANGUAGE",
  "LOCATION TYPE",
  "LOCATION ID",
  "FUNCTION ICONS",
  "ARTIST POINTERS",
  "FEATURES",
  "PROCEDURE FLOW",
  "THEME / ACTION",
  "THEME I ACTION"
];

const MAJOR_ARCANA = [
  [0, "0", "The Fool"],
  [1, "I", "The Magician"],
  [2, "II", "The High Priestess"],
  [3, "III", "The Empress"],
  [4, "IV", "The Emperor"],
  [5, "V", "The Hierophant"],
  [6, "VI", "The Lovers"],
  [7, "VII", "The Chariot"],
  [8, "VIII", "Strength"],
  [9, "IX", "The Hermit"],
  [10, "X", "Wheel Of Fortune"],
  [11, "XI", "Justice"],
  [12, "XII", "The Hanged One"],
  [12, "XII", "The Hanged Man"],
  [13, "XIII", "Death"],
  [14, "XIV", "Temperance"],
  [15, "XV", "The Devil"],
  [16, "XVI", "The Tower"],
  [17, "XVII", "The Star"],
  [18, "XVIII", "The Moon"],
  [19, "XIX", "The Sun"],
  [20, "XX", "Judgement"],
  [21, "XXI", "The World"]
].map(([number, roman, title]) => ({ number, roman, title, upper: title.toUpperCase() }));

const MINOR_RANKS = [
  ["Ace", 1],
  ["Two", 2],
  ["Three", 3],
  ["Four", 4],
  ["Five", 5],
  ["Six", 6],
  ["Seven", 7],
  ["Eight", 8],
  ["Nine", 9],
  ["Ten", 10],
  ["Page", 11],
  ["Knight", 12],
  ["Queen", 13],
  ["King", 14]
];
const MINOR_SUITS = ["Swords", "Cups", "Wands", "Pentacles", "Coins"];
const KNOWN_LOCATION_TYPES = [
  "Command Citadel",
  "The Citadel",
  "Transition Gate",
  "Threshold Outpost",
  "Seed Ark",
  "Transit Spire",
  "Reclamation Gate",
  "Quiet Knowing",
  "Citadel",
  "Garden"
];

const TYPE_RULES = [
  ["location_tarot_card", /\b(LOCATION CARD|LOCATION TYPE|GARDEN TYPE|GARDEN SYSTEM|CITADEL|HAPA-LOC)\b/i],
  ["protocol_card", /\b(PROTOCOL COMMAND|PROTOCOL CARD|\/\/\s*PROTOCOL|^PROTOCOL\b|PROCEDURE FLOW|ESTABLISH ROLES|ISSUE ORDERS)\b/i],
  ["skill_card", /\b(SKILL SET|SKILL CARD|\/\/\s*SKILL|TRAINING|TECHNIQUE|ABILITY)\b/i],
  ["relationship_tarot_card", /\b(RELATIONSHIP|BOND|KINSHIP|TRUST|LOYALTY|ALLIANCE|RIVAL|COUNTERPOINT)\b/i],
  ["node_card", /\b(NODE CARD|ATLAS|SECOND BRAIN|REGISTRY|SERVER|CONSOLE)\b/i],
  ["ship_card", /\b(SHIP CARD|FLEET EFFECT|VESSEL|CRUISER|FRIGATE|CARRIER|HSS)\b/i],
  ["avatar_tarot_card", /\b(AVATAR CARD|AVATAR TAROT|AGENT|CHARACTER)\b/i],
  ["song_tarot_card", /\b(SONG CARD|ALBUM|TRACK|LYRIC|DEAR PAPA)\b/i],
  ["lore_tarot_card", /\b(LORE CARD|CANON|MEMORY|CHAPTER|WORLD BUILDING)\b/i]
];

await main();

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(STABLE_CACHE_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(SUBSCRIBER_DIR, { recursive: true });

  const originalStore = JSON.parse(await fs.readFile(ITEM_STORE_PATH, "utf8"));
  const store = normalizeItemManagerStore(originalStore);
  const tarotCards = store.cards.filter(isTarotLikeCard);
  const targetIndex = collectOcrTargets(limit > 0 ? tarotCards.slice(0, limit) : tarotCards);
  const ocrByPath = await runOcr([...targetIndex.keys()]);
  const changes = [];
  const updatedCards = store.cards.map((card) => {
    if (!isTarotLikeCard(card)) return card;
    const targets = collectCardTargets(card)
      .map((target) => ({ ...target, ocr: ocrByPath.get(target.path) }))
      .filter((target) => target.ocr);
    const oldOcr = card.tarotCard?.ocr || card.shipCard?.ocr || {};
    const refreshed = refreshCard(card, targets, oldOcr);
    if (refreshed.changed) changes.push(refreshed.change);
    return refreshed.card;
  });

  const nextStore = normalizeItemManagerStore({
    ...store,
    cards: updatedCards,
    updatedAt: now
  });

  const report = {
    schemaVersion: "hapa.tarot-ocr-refresh-report.v1",
    runId: RUN_ID,
    generatedAt: now,
    dryRun,
    summary: {
      tarotCards: tarotCards.length,
      limitedCards: limit > 0 ? Math.min(limit, tarotCards.length) : 0,
      ocrTargets: targetIndex.size,
      cardsChanged: changes.length,
      correctedGenericTitles: changes.filter((change) => change.previousTitle !== change.nextTitle && isGenericTitle(change.previousTitle)).length,
      emperorCards: changes.filter((change) => /emperor/i.test(change.nextTitle)).length,
      typeDistribution: distribution(updatedCards.filter(isTarotLikeCard).map((card) => card.tarotCard?.mainType || card.cardType || "unknown"))
    },
    changes,
    examples: changes
      .filter((change) => /emperor|death|fool/i.test(`${change.previousTitle} ${change.nextTitle}`))
      .slice(0, 20)
  };

  if (!dryRun) {
    await fs.writeFile(path.join(BACKUP_DIR, "item-manager-store.before-tarot-ocr-refresh.json"), `${JSON.stringify(originalStore, null, 2)}\n`);
    await fs.writeFile(ITEM_STORE_PATH, `${JSON.stringify(nextStore, null, 2)}\n`);
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(RUN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await appendSubscriberEvents(report);
  } else {
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(RUN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report.summary, null, 2));
  if (dryRun) {
    console.log("Dry run only. No stores were written.");
    console.log(`Report: ${path.relative(ROOT, REPORT_PATH)}`);
  } else {
    console.log(`Report: ${path.relative(ROOT, REPORT_PATH)}`);
    console.log(`Run report: ${path.relative(ROOT, RUN_REPORT_PATH)}`);
    console.log(`Backups: ${path.relative(ROOT, BACKUP_DIR)}`);
  }
}

function isTarotLikeCard(card = {}) {
  return Boolean(card.tarotCard || card.shipCard || /tarot/i.test(card.cardType || "") || (card.tags || []).includes("tarot-card"));
}

function collectOcrTargets(cards = []) {
  const targets = new Map();
  for (const card of cards) {
    for (const target of collectCardTargets(card)) {
      if (!target.path || targets.has(target.path)) continue;
      targets.set(target.path, target);
    }
  }
  return targets;
}

function collectCardTargets(card = {}) {
  const targets = [];
  const add = (uri, kind = "image", source = "") => {
    const resolved = resolveMediaPath(uri);
    if (!resolved || !IMAGE_EXTENSIONS.test(resolved.path)) return;
    targets.push({
      id: hash(resolved.path),
      cardId: card.id,
      kind,
      source,
      path: resolved.path,
      mediaUri: resolved.mediaUri || ""
    });
  };
  for (const asset of card.mediaAssets || []) {
    if (asset.type === "image") add(asset.uri, "image", asset.id || "media-asset");
    add(asset.thumbnailUri, asset.type === "video" ? "video-first-frame" : "thumbnail", asset.id || "media-thumb");
    add(asset.metadata?.thumbnailUri, "thumbnail", asset.id || "metadata-thumb");
    add(asset.metadata?.thumbnail?.uri, "thumbnail", asset.id || "metadata-thumb");
  }
  for (const link of card.tarotCard?.mediaLinks || []) {
    add(link.imageUri, "linked-image", link.id || "media-link");
    add(link.posterUri, "linked-poster", link.id || "media-link");
  }
  for (const sourcePath of [
    ...(card.tarotCard?.ocr?.sourceImagePaths || []),
    ...(card.tarotCard?.ocr?.sourceFramePaths || []),
    card.shipCard?.ocr?.sourceFramePath
  ].filter(Boolean)) {
    add(sourcePath, "ocr-source", "stored-ocr-source");
  }
  const seen = new Set();
  return targets.filter((target) => {
    if (seen.has(target.path)) return false;
    seen.add(target.path);
    return true;
  });
}

function resolveMediaPath(uri = "") {
  if (!uri) return null;
  if (uri.startsWith("/media/")) {
    const filePath = path.join(DATA_DIR, uri);
    return existsSync(filePath) ? { path: filePath, mediaUri: uri } : null;
  }
  if (path.isAbsolute(uri)) return existsSync(uri) ? { path: uri, mediaUri: uri.startsWith(ROOT) ? `/${path.relative(path.join(ROOT, "data"), uri)}` : "" } : null;
  const filePath = path.join(ROOT, uri);
  return existsSync(filePath) ? { path: filePath, mediaUri: uri } : null;
}

async function runOcr(paths = []) {
  const byPath = new Map();
  const pending = [];
  for (const imagePath of paths) {
    const cachePath = path.join(CACHE_DIR, `${hash(imagePath)}.json`);
    const stableCachePath = path.join(STABLE_CACHE_DIR, `${hash(imagePath)}.json`);
    if (useCache) {
      try {
        byPath.set(imagePath, JSON.parse(await fs.readFile(stableCachePath, "utf8")));
        continue;
      } catch {
        try {
          byPath.set(imagePath, JSON.parse(await fs.readFile(cachePath, "utf8")));
          continue;
        } catch {
          // Fall through to refresh OCR.
        }
      }
    }
    pending.push({ imagePath, cachePath, stableCachePath });
  }
  const batchSize = 8;
  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const label = `${Math.min(index + batch.length, pending.length)}/${pending.length}`;
    console.error(`[tarot-ocr] OCR ${label}`);
    const { stdout } = await execFileAsync("swift", [OCR_SCRIPT, ...batch.map((item) => item.imagePath)], {
      maxBuffer: 1024 * 1024 * 48
    });
    const results = JSON.parse(stdout);
    for (const result of results) {
      const entry = batch.find((item) => item.imagePath === result.path);
      if (!entry) continue;
      await fs.writeFile(entry.cachePath, `${JSON.stringify(result, null, 2)}\n`);
      await fs.writeFile(entry.stableCachePath, `${JSON.stringify(result, null, 2)}\n`);
      byPath.set(entry.imagePath, result);
    }
  }
  return byPath;
}

function refreshCard(card, targets, oldOcr = {}) {
  const sourceRecords = targets.map((target) => {
    const lines = normalizeOcrLines(target.ocr?.lines || []);
    return {
      id: target.id,
      kind: target.kind,
      path: target.path,
      mediaUri: target.mediaUri,
      confidence: Number(target.ocr?.confidence || average(lines.map((line) => line.confidence)) || 0),
      lineCount: lines.length,
      text: lines.map((line) => line.text).join("\n"),
      lines
    };
  });
  if (!sourceRecords.length && oldOcr.rawText) {
    sourceRecords.push({
      id: "previous-ocr",
      kind: "previous",
      path: "",
      mediaUri: "",
      confidence: Number(oldOcr.confidence || 0),
      lineCount: oldOcr.lines?.length || 0,
      text: oldOcr.rawText,
      lines: normalizeOcrLines(oldOcr.lines || String(oldOcr.rawText || "").split("\n").map((text) => ({ text })))
    });
  }

  const parsedSources = sourceRecords.map((source) => parseTarotSource(source, card));
  const best = chooseBestParse(parsedSources, card);
  const merged = mergeParses(parsedSources, best, card);
  const previousTitle = card.title || card.tarotCard?.title || card.shipCard?.title || "";
  const previousType = card.tarotCard?.mainType || card.cardType || "";
  const nextTitle = merged.identity.tarotCardName || previousTitle;
  const nextType = merged.mainType || previousType || "hapa_tarot_card";
  const nextKind = kindForCardType(nextType, card.kind);
  const existingTarot = card.tarotCard || tarotFromShipCard(card) || {};
  const previousRank = card.rank;
  const sourceImagePaths = sourceRecords.filter((source) => source.kind !== "video-first-frame").map((source) => source.path).filter(Boolean);
  const sourceFramePaths = sourceRecords.filter((source) => source.kind === "video-first-frame" || /first|frame/i.test(source.kind)).map((source) => source.path).filter(Boolean);
  const rawText = sourceRecords.map((source) => source.text).filter(Boolean).join("\n\n--- OCR SOURCE ---\n\n") || oldOcr.rawText || "";

  const nextTarot = {
    ...existingTarot,
    mainType: nextType,
    tarotNumber: merged.identity.romanNumeral || existingTarot.tarotNumber || card.shipCard?.tarotNumber || "",
    title: nextTitle,
    subtitle: merged.subtitle || existingTarot.subtitle || "",
    archetype: merged.identity.arcana || existingTarot.archetype || existingTarot.subtitle || "",
    keywords: merged.keywords.length ? merged.keywords : existingTarot.keywords || [],
    flavorText: merged.cardFace.coreMeaning || existingTarot.flavorText || "",
    effectTitle: merged.cardFace.mechanicsText ? "Mechanics" : existingTarot.effectTitle || "",
    effectText: merged.cardFace.mechanicsText || existingTarot.effectText || "",
    catalog: {
      ...(existingTarot.catalog || {}),
      collectionId: existingTarot.catalog?.collectionId || "mimi-card-shop",
      collectionTitle: existingTarot.catalog?.collectionTitle || "Mimi's Card Shop",
      family: merged.identity.arcana || existingTarot.catalog?.family || "Hapa Tarot",
      typeLabel: typeLabel(nextType),
      sourceHash: hash(rawText),
      confidence: best.confidence > 0.72 ? "soft" : "generated"
    },
    identity: merged.identity,
    cardFace: merged.cardFace,
    attribution: {
      ...(existingTarot.attribution || {}),
      sourceTool: "apple-vision-tarot-ocr-refresh",
      notes: "Refreshed by all-card Tarot OCR pass; card identity parsed from current media/still frames."
    },
    mechanics: {
      ...(existingTarot.mechanics || {}),
      broadGameMechanic: broadMechanicForType(nextType),
      deckUse: `Draw ${nextTitle} from the ${typeLabel(nextType)} pile; resolve it as ${merged.identity.arcana || "Hapa Tarot"} context from ${merged.identity.systemName}.`,
      surfaceUse: `${nextTitle} can be placed on the surface with its OCR-backed card face, media, avatar, scene, and song links.`,
      effects: unique([...(existingTarot.mechanics?.effects || []), ...merged.cardFace.sections.filter((section) => /mechanic|effect/i.test(section.label)).map((section) => section.value)]),
      limits: unique([...(existingTarot.mechanics?.limits || []), "OCR refresh remains generated/soft canon until human review."]),
      procedures: merged.typeDetails.procedureFlow,
      actions: merged.typeDetails.actions,
      resources: merged.typeDetails.resources,
      costs: merged.typeDetails.costs,
      functionIcons: merged.cardFace.functionIcons,
      statBlocks: merged.typeDetails.stats
    },
    lore: {
      ...(existingTarot.lore || {}),
      summary: loreSummary(nextTitle, nextType, merged),
      visualLanguage: merged.visualLanguage,
      locationType: merged.identity.locationType,
      locationId: merged.identity.locationId,
      sourceClaims: merged.sourceClaims
    },
    typeDetails: merged.typeDetails,
    mediaLinks: existingTarot.mediaLinks || [],
    ocr: {
      ...(existingTarot.ocr || {}),
      engine: "apple-vision",
      confidence: average(sourceRecords.map((source) => source.confidence)),
      rawText,
      lines: sourceRecords.flatMap((source) => source.lines.map((line) => ({
        ...line,
        sourceId: source.id,
        sourceKind: source.kind,
        sourcePath: source.path,
        mediaUri: source.mediaUri
      }))),
      parsedAt: now,
      refreshedAt: now,
      sourceImagePaths: unique([...(existingTarot.ocr?.sourceImagePaths || []), ...sourceImagePaths]),
      sourceVideoPaths: existingTarot.ocr?.sourceVideoPaths || [],
      sourceFramePaths: unique([...(existingTarot.ocr?.sourceFramePaths || []), ...sourceFramePaths]),
      sourceMediaUris: unique(sourceRecords.map((source) => source.mediaUri).filter((uri) => uri.startsWith("/media/"))),
      sources: sourceRecords.map((source) => ({
        id: source.id,
        kind: source.kind,
        path: source.path,
        mediaUri: source.mediaUri,
        confidence: source.confidence,
        lineCount: source.lineCount,
        text: source.text.slice(0, 600)
      }))
    }
  };

  const qualityTags = (card.tags || []).filter((tag) => /^quality-/.test(tag));
  const nextTags = unique([
    ...(card.tags || []).filter((tag) => !/^quality-/.test(tag)),
    "tarot-card",
    "hapa-tarot-system",
    slugify(nextType),
    merged.identity.arcana ? slugify(merged.identity.arcana) : "",
    nextTitle ? slugify(nextTitle) : "",
    merged.identity.suit ? slugify(merged.identity.suit) : "",
    ...qualityTags
  ].filter(Boolean));

  const nextCard = {
    ...card,
    cardType: nextType,
    kind: nextKind,
    title: nextTitle,
    name: nextTitle,
    summary: loreSummary(nextTitle, nextType, merged),
    description: [merged.cardFace.coreMeaning, merged.cardFace.mechanicsText].filter(Boolean).join(" "),
    lore: merged.cardFace.coreMeaning || card.lore,
    utility: merged.keywords,
    broadGameMechanics: unique([
      ...(card.broadGameMechanics || []),
      broadMechanicForType(nextType),
      merged.identity.arcana ? `arcana:${merged.identity.arcana.toLowerCase()}` : "",
      merged.identity.locationType ? `location:${merged.identity.locationType.toLowerCase()}` : ""
    ].filter(Boolean)),
    tags: nextTags,
    rank: previousRank,
    tarotCard: nextTarot,
    updatedAt: now
  };

  const changed = previousTitle !== nextCard.title ||
    previousType !== nextType ||
    (card.tarotCard?.identity?.tarotCardName || "") !== merged.identity.tarotCardName ||
    (card.tarotCard?.identity?.arcana || "") !== merged.identity.arcana ||
    (card.tarotCard?.cardFace?.coreMeaning || "") !== merged.cardFace.coreMeaning;

  return {
    card: nextCard,
    changed,
    change: {
      cardId: card.id,
      previousTitle,
      nextTitle: nextCard.title,
      previousType,
      nextType,
      tarotNumber: nextTarot.tarotNumber,
      arcana: merged.identity.arcana,
      systemName: merged.identity.systemName,
      locationType: merged.identity.locationType,
      locationId: merged.identity.locationId,
      keywordCount: nextTarot.keywords.length,
      ocrSources: sourceRecords.length,
      confidence: nextTarot.ocr.confidence,
      evidence: rawText.slice(0, 260)
    }
  };
}

function parseTarotSource(source, card) {
  const rawText = source.text || "";
  const lines = normalizeOcrLines(source.lines || String(rawText).split("\n").map((text) => ({ text }))).map((line) => line.text);
  const text = normalizeSpaces(lines.join(" "));
  const upper = text.toUpperCase();
  const major = findMajorArcana(upper);
  const minor = major ? null : findMinorArcana(upper);
  const suit = findSuit(upper);
  const mainType = detectMainType(text, card);
  const title = major?.title || minor?.title || findExplicitTitle(lines, text, card);
  const roman = major?.roman || findRomanNearTitle(upper, title) || card.tarotCard?.tarotNumber || card.shipCard?.tarotNumber || "";
  const number = major?.number ?? minor?.number ?? romanToNumber(roman);
  const arcana = major ? "Major Arcana" : minor ? "Minor Arcana" : /MINOR\s+ARCANA/i.test(text) ? "Minor Arcana" : findArcana(text, card);
  const typeDetail = findTypeDetail(text, mainType);
  const locationType = findLocationType(text);
  const locationId = text.match(/\bHAPA-LOC-\d{2}-\d{3}\b/i)?.[0] || "";
  const sections = buildSections(text);
  const coreMeaning = sectionValue(sections, "Core Meaning") || findCoreMeaning(text);
  const mechanicsText = sectionValue(sections, "Mechanics");
  const visualLanguageText = sectionValue(sections, "Visual Language");
  const uprightText = sectionValue(sections, "Upright");
  const invertedText = sectionValue(sections, "Inverted");
  const keywordSegment = textBeforeFirst(text, ["CORE MEANING", "MECHANICS", "UPRIGHT"]);
  const keywords = extractKeywords(keywordSegment, title, mainType, arcana);
  const procedureFlow = extractProcedureFlow(text);
  const actions = extractBullets(sectionValue(sections, "Theme / Action") || mechanicsText).slice(0, 8);
  const functionIcons = extractFunctionIcons(text);
  const confidence = source.confidence || 0;
  const functionalType = functionalTypeForMainType(mainType);
  const tarotType = title;

  return {
    source,
    score: parseScore({ title, major, arcana, mainType, coreMeaning, mechanicsText, confidence }),
    confidence,
    mainType,
    subtitle: [arcana, typeLabel(mainType)].filter(Boolean).join(" // "),
    keywords,
    visualLanguage: extractBullets(visualLanguageText).slice(0, 10),
    sourceClaims: extractSourceClaims(text, title),
    identity: {
      systemName: /HAPA\s+TAROT\s+SYSTEM/i.test(text) ? "Hapa Tarot System" : card.tarotCard?.identity?.systemName || "Hapa Tarot System",
      deckName: card.tarotCard?.identity?.deckName || card.tarotCard?.catalog?.collectionTitle || "Mimi's Card Shop",
      arcana,
      suit: minor?.suit || suit,
      suitElement: suitElement(minor?.suit || suit),
      rank: minor?.rank || "",
      tarotType,
      romanNumeral: roman,
      number: Number(number || 0),
      tarotCardName: title,
      printedTitle: findPrintedTitle(lines, title, roman) || title,
      displayTitle: title,
      titlePrefix: findTitlePrefix(lines, title),
      variantTitle: findVariantTitle(text, title),
      functionalType,
      functionalTypeSlug: mainType,
      cardTypeName: typeLabel(mainType),
      cardTypeDetail: mainType === "location_tarot_card" ? (titleCase(locationType) || typeDetail) : typeDetail,
      typeStack: unique([
        tarotType,
        arcana,
        minor?.suit || suit,
        functionalType
      ]),
      locationType: titleCase(locationType),
      locationId,
      confidence: confidence > 0.72 ? "soft" : "generated"
    },
    cardFace: {
      titleLine: findPrintedTitle(lines, title, roman) || title,
      subtitleLine: findSubtitleLine(lines, title) || [arcana, typeDetail].filter(Boolean).join(" // "),
      typeLine: typeDetail || typeLabel(mainType),
      keywordLine: keywords.join(" • "),
      coreMeaning,
      uprightText,
      invertedText,
      mechanicsText,
      visualLanguageText,
      locationText: findAfterLabel(text, /LOCATION\s+TYPE/i, ["FUNCTION ICONS", "ARTIST POINTERS"]) || "",
      functionIcons,
      sections
    },
    typeDetails: {
      label: typeLabel(mainType),
      tarotType,
      functionalType,
      functionalTypeSlug: mainType,
      role: typeDetail,
      focus: keywords.slice(0, 4).join(", "),
      command: actionLineForType(mainType, title, keywords),
      procedureFlow,
      actions,
      resources: extractResourceWords(text),
      costs: extractCosts(text),
      stats: extractStatSections(text),
      sections: sections.filter((section) => /procedure|theme|location|visual|mechanic|function/i.test(section.label))
    }
  };
}

function chooseBestParse(parses = [], card = {}) {
  const viable = parses.filter((parse) => parse.identity.tarotCardName && !isGenericTitle(parse.identity.tarotCardName));
  return [...(viable.length ? viable : parses)].sort((a, b) =>
    b.score - a.score ||
    b.confidence - a.confidence ||
    String(a.identity.tarotCardName || "").localeCompare(String(b.identity.tarotCardName || ""))
  )[0] || parseTarotSource({ text: card.tarotCard?.ocr?.rawText || card.shipCard?.ocr?.rawText || card.title || "", confidence: 0, lines: [] }, card);
}

function mergeParses(parses = [], best, card = {}) {
  const title = best.identity.tarotCardName || card.tarotCard?.title || card.shipCard?.title || card.title || "Tarot Card";
  const mainType = best.mainType || card.tarotCard?.mainType || card.cardType || "hapa_tarot_card";
  const functionalType = functionalTypeForMainType(mainType);
  const identity = {
    ...best.identity,
    tarotCardName: titleCase(title),
    tarotType: titleCase(best.identity.tarotType || title),
    printedTitle: best.identity.printedTitle || title,
    displayTitle: titleCase(title),
    functionalType,
    functionalTypeSlug: mainType,
    cardTypeName: typeLabel(mainType),
    typeStack: unique([
      best.identity.tarotType || title,
      best.identity.arcana,
      best.identity.suit,
      functionalType
    ])
  };
  const cardFace = {
    ...best.cardFace,
    sections: mergeSections(parses.flatMap((parse) => parse.cardFace.sections || []))
  };
  const keywords = unique([
    ...(best.keywords || []),
    ...parses.flatMap((parse) => parse.keywords || []),
    ...(card.tarotCard?.keywords || []),
    ...(card.shipCard?.keywords || [])
  ]).filter((keyword) => !isGenericKeyword(keyword)).slice(0, 16);
  const typeDetails = {
    ...best.typeDetails,
    tarotType: identity.tarotType,
    functionalType,
    functionalTypeSlug: mainType,
    procedureFlow: unique(parses.flatMap((parse) => parse.typeDetails.procedureFlow || [])).slice(0, 12),
    actions: unique(parses.flatMap((parse) => parse.typeDetails.actions || [])).slice(0, 12),
    resources: unique(parses.flatMap((parse) => parse.typeDetails.resources || [])).slice(0, 12),
    costs: unique(parses.flatMap((parse) => parse.typeDetails.costs || [])).slice(0, 8),
    stats: mergeSections(parses.flatMap((parse) => parse.typeDetails.stats || [])),
    sections: mergeSections(parses.flatMap((parse) => parse.typeDetails.sections || []))
  };
  return {
    mainType,
    subtitle: best.subtitle || [identity.arcana, typeLabel(mainType)].filter(Boolean).join(" // "),
    identity,
    cardFace,
    keywords,
    typeDetails,
    visualLanguage: unique(parses.flatMap((parse) => parse.visualLanguage || [])).slice(0, 12),
    sourceClaims: unique(parses.flatMap((parse) => parse.sourceClaims || [])).slice(0, 10)
  };
}

function buildSections(text = "") {
  const sections = [];
  for (const label of SECTION_STOPS) {
    const value = findAfterLabel(text, new RegExp(escapeRegExp(label), "i"), SECTION_STOPS.filter((stop) => stop !== label));
    if (!value) continue;
    sections.push({
      label: titleCase(label.replace(/\s+I\s+/g, " / ")),
      value,
      items: extractBullets(value).slice(0, 10),
      confidence: "generated"
    });
  }
  return mergeSections(sections);
}

function mergeSections(sections = []) {
  const byLabel = new Map();
  for (const section of sections) {
    if (!section?.label) continue;
    const existing = byLabel.get(section.label) || { label: section.label, value: "", items: [], confidence: section.confidence || "generated" };
    existing.value = longest(existing.value, section.value || "");
    existing.items = unique([...(existing.items || []), ...(section.items || [])]).slice(0, 16);
    byLabel.set(section.label, existing);
  }
  return [...byLabel.values()].filter((section) => section.value || section.items.length);
}

function findMajorArcana(upper = "") {
  const compact = upper.replace(/\s+/g, " ");
  const matches = MAJOR_ARCANA
    .map((arcana) => {
      const titlePattern = arcana.upper.replace(/\s+/g, "\\s+");
      const titleMatch = compact.match(new RegExp(`\\b${titlePattern}\\b`));
      if (!titleMatch) return null;
      const index = titleMatch.index || 0;
      const windowStart = Math.max(0, index - 52);
      const windowEnd = Math.min(compact.length, index + arcana.upper.length + 28);
      const nearby = compact.slice(windowStart, windowEnd);
      const numberSeen = new RegExp(`\\b(${escapeRegExp(arcana.roman)}|${arcana.number})\\.?\\b`).test(nearby);
      const arcanaSeen = /MAJOR\s+ARCANA/.test(compact.slice(Math.max(0, index - 80), Math.min(compact.length, index + 80)));
      return {
        ...arcana,
        index,
        score: (numberSeen ? 6 : 0) + (arcanaSeen ? 5 : 0) + (index < 160 ? 2 : 0)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return matches[0] || null;
}

function findMinorArcana(upper = "") {
  const compact = upper.replace(/\s+/g, " ");
  const matches = [];
  for (const [rank, number] of MINOR_RANKS) {
    for (const suit of MINOR_SUITS) {
      const title = `${rank} of ${suit}`;
      const direct = new RegExp(`\\b${rank.toUpperCase()}\\s+OF\\s+${suit.toUpperCase()}\\b`);
      const compressed = new RegExp(`\\b${rank.toUpperCase()}\\s+${suit.toUpperCase()}\\b`);
      const match = compact.match(direct) || compact.match(compressed);
      if (!match) continue;
      const index = match.index || 0;
      const minorSeen = /MINOR\s+ARCANA/.test(compact.slice(Math.max(0, index - 80), Math.min(compact.length, index + 80)));
      const suitSeen = new RegExp(`\\b${suit.toUpperCase()}\\s+SUIT\\b|\\bSUIT\\s+OF\\s+${suit.toUpperCase()}\\b`).test(compact);
      matches.push({
        title,
        rank,
        suit,
        number,
        index,
        score: (minorSeen ? 8 : 0) + (suitSeen ? 4 : 0) + (index < 160 ? 2 : 0)
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score || a.index - b.index)[0] || null;
}

function findExplicitTitle(lines = [], text = "", card = {}) {
  const existing = card.tarotCard?.title || card.title || "";
  if (existing && !isGenericTitle(existing)) {
    return titleCase(existing);
  }
  const skip = /hapa tarot system|major arcana|minor arcana|core meaning|mechanics|visual language|function icons|location type|upright|inverted/i;
  for (const line of lines.slice(0, 8)) {
    const clean = cleanTitle(line);
    if (!clean || skip.test(clean)) continue;
    const stripped = clean.replace(/^([IVXLCDM]{1,8}|0|[0-9]{1,2})[\s.:-]+/i, "");
    if (words(stripped).length >= 1 && words(stripped).length <= 5) return titleCase(stripped);
  }
  return titleCase(existing || card.shipCard?.title || "Tarot Card");
}

function findPrintedTitle(lines = [], title = "", roman = "") {
  const normalizedTitle = normalizeSpaces(title).toUpperCase();
  for (const line of lines.slice(0, 10)) {
    const upper = line.toUpperCase();
    if (!upper.includes(normalizedTitle)) continue;
    return normalizeSpaces(line);
  }
  return [roman, title].filter(Boolean).join(". ");
}

function findSubtitleLine(lines = [], title = "") {
  const titleIndex = lines.findIndex((line) => line.toLowerCase().includes(String(title || "").toLowerCase()));
  const candidates = lines.slice(Math.max(0, titleIndex + 1), Math.max(0, titleIndex + 5));
  return candidates.find((line) => /arcana|card|set|garden|protocol|location|skill|command/i.test(line)) || "";
}

function findTitlePrefix(lines = [], title = "") {
  const line = lines.find((item) => item.toLowerCase().includes(String(title || "").toLowerCase())) || "";
  const index = line.toLowerCase().indexOf(String(title || "").toLowerCase());
  return index > 0 ? cleanTitle(line.slice(0, index)) : "";
}

function findVariantTitle(text = "", title = "") {
  const after = text.slice(Math.max(0, text.toLowerCase().indexOf(String(title || "").toLowerCase()) + String(title || "").length), Math.max(0, text.toLowerCase().indexOf(String(title || "").toLowerCase()) + String(title || "").length + 80));
  const match = after.match(/\b([A-Z][A-Z\s/&-]{3,42})\b/);
  return match ? titleCase(match[1]) : "";
}

function detectMainType(text = "", card = {}) {
  for (const [type, regex] of TYPE_RULES) {
    if (regex.test(text)) return type;
  }
  return card.tarotCard?.mainType || card.cardType || "hapa_tarot_card";
}

function findTypeDetail(text = "", mainType = "") {
  if (mainType === "protocol_card" && /PROTOCOL\s+COMMAND/i.test(text)) return "Protocol Command";
  if (mainType === "protocol_card" && /PROTOCOL\s+STANDARD/i.test(text)) return "Protocol Standard";
  if (mainType === "skill_card" && /SKILL\s+SET/i.test(text)) return "Skill Set";
  if (mainType === "location_tarot_card" && /LOCATION\s+CARD/i.test(text)) return "Location Card";
  if (mainType === "location_tarot_card" && /GARDEN\s+TYPE|GARDEN\s+SYSTEM/i.test(text)) return "Garden";
  const candidates = [
    text.match(/MAJOR\s+ARCANA\s*\/\/\s*([A-Z][A-Z\s/-]{3,40})/i)?.[1],
    text.match(/MINOR\s+ARCANA\s*\/\/\s*([A-Z][A-Z\s/-]{3,40})/i)?.[1],
    text.match(/\/\/\s*([A-Z][A-Z\s/-]{3,40}?)(?:\s+CORE|\s+MEANING|$)/i)?.[1],
    text.match(/\b(LOCATION CARD|SKILL SET|PROTOCOL COMMAND|GARDEN TYPE|NODE CARD|AVATAR CARD|SONG CARD)\b/i)?.[1]
  ].filter(Boolean);
  return titleCase(candidates[0] || typeLabel(mainType));
}

function findArcana(text = "", card = {}) {
  if (/MAJOR\s+ARCANA/i.test(text)) return "Major Arcana";
  if (/MINOR\s+ARCANA/i.test(text)) return "Minor Arcana";
  return card.tarotCard?.identity?.arcana || card.tarotCard?.catalog?.family || "";
}

function findSuit(text = "") {
  const match = text.match(/\b(SWORDS|CUPS|WANDS|PENTACLES|COINS)\s+SUIT\b/i) || text.match(/\bSUIT\s+OF\s+(SWORDS|CUPS|WANDS|PENTACLES|COINS)\b/i);
  return match ? titleCase(match[1]) : "";
}

function findLocationType(text = "") {
  const window = [
    findAfterLabel(text, /LOCATION\s+TYPE/i, ["LOCATION ID", "FUNCTION ICONS", "ARTIST POINTERS", "HAPA-LOC"]),
    findAfterLabel(text, /GARDEN\s+TYPE/i, ["MECHANICS", "THEME", "VISUAL LANGUAGE", "UPRIGHT"])
  ].find(Boolean) || "";
  const combined = `${window} ${text}`;
  for (const locationType of KNOWN_LOCATION_TYPES) {
    if (new RegExp(`\\b${escapeRegExp(locationType)}\\b`, "i").test(combined)) return locationType;
  }
  const short = window
    .replace(/\b(THE|A|AN)\s+(GUARDIAN|FIRST|HEART|AUTHORITY|FRAMEWORK)\b.*$/i, "")
    .replace(/\b(UPRIGHT|CORE MEANING|MECHANICS)\b.*$/i, "")
    .split(/[.;*•]/)[0];
  const wordsOnly = words(short).slice(0, 4).join(" ");
  return titleCase(wordsOnly);
}

function suitElement(suit = "") {
  const key = suit.toLowerCase();
  if (key === "swords") return "Air";
  if (key === "cups") return "Water";
  if (key === "wands") return "Fire";
  if (key === "pentacles" || key === "coins") return "Earth";
  return "";
}

function extractKeywords(segment = "", title = "", mainType = "", arcana = "") {
  const protectedWords = new Set([
    "hapa", "tarot", "system", "major", "minor", "arcana", "core", "meaning", "card",
    "upright", "inverted", "mechanics", "location", "type", "skill", "set", "protocol",
    "command", "relationship", "avatar", "node", "song", "lore", "garden", "the"
  ]);
  for (const word of words(title)) protectedWords.add(word.toLowerCase());
  for (const word of words(mainType)) protectedWords.add(word.toLowerCase());
  for (const word of words(arcana)) protectedWords.add(word.toLowerCase());

  const pieces = segment
    .replace(/[•+|*#:/]+/g, " ")
    .replace(/\b(IV|IX|V?I{0,3}|X{1,3}|0|[0-9]{1,2})\.?\b/gi, " ")
    .split(/\s{2,}|[,;]/)
    .flatMap((chunk) => chunk.split(/\s+-\s+/))
    .map((chunk) => normalizeSpaces(chunk))
    .flatMap((chunk) => chunk.length > 28 ? words(chunk) : [chunk])
    .map((chunk) => cleanTitle(chunk))
    .filter((chunk) => chunk.length > 2 && chunk.length < 30)
    .filter((chunk) => !protectedWords.has(chunk.toLowerCase()))
    .filter((chunk) => !/^\d+$/.test(chunk))
    .map(titleCase);
  return unique(pieces).slice(0, 12);
}

function extractProcedureFlow(text = "") {
  const flow = findAfterLabel(text, /PROCEDURE\s+FLOW/i, ["VISUAL LANGUAGE", "UPRIGHT", "INVERTED", "FUNCTION ICONS"]);
  return extractBullets(flow).slice(0, 10);
}

function extractFunctionIcons(text = "") {
  const value = findAfterLabel(text, /FUNCTION\s+ICONS/i, ["ARTIST POINTERS", "LOCATION ID", "HAPA PROVERB"]);
  return extractBullets(value).slice(0, 12);
}

function extractResourceWords(text = "") {
  const matches = text.match(/\b(resources?|assets?|personnel|support|supply|logistics|defenses?|signals?|beacons?|platforms?)\b/gi) || [];
  return unique(matches.map(titleCase)).slice(0, 8);
}

function extractCosts(text = "") {
  const costBlock = findAfterLabel(text, /\bCOST\b/i, ["MECHANICS", "VISUAL LANGUAGE", "FUNCTION ICONS"]);
  return extractBullets(costBlock).slice(0, 8);
}

function extractStatSections(text = "") {
  const stats = [];
  for (const label of ["SPEED", "MORALE", "SUPPLY", "INFLUENCE", "FOCUS", "RISK", "POWER"]) {
    const match = text.match(new RegExp(`${label}[^0-9]{0,12}(\\d{1,2})`, "i"));
    if (match) stats.push({ label: titleCase(label), value: match[1], items: [], confidence: "generated" });
  }
  return stats;
}

function extractSourceClaims(text = "", title = "") {
  return unique([
    title ? `${title} is the parsed tarot card identity.` : "",
    /HAPA\s+TAROT\s+SYSTEM/i.test(text) ? "Card belongs to the Hapa Tarot System." : "",
    /MAJOR\s+ARCANA/i.test(text) ? "Card belongs to Major Arcana." : "",
    /MINOR\s+ARCANA/i.test(text) ? "Card belongs to Minor Arcana." : ""
  ].filter(Boolean));
}

function actionLineForType(mainType = "", title = "", keywords = []) {
  const focus = keywords.slice(0, 3).join(", ") || typeLabel(mainType).toLowerCase();
  if (mainType === "location_tarot_card") return `Use ${title} as a place/surface card for ${focus}.`;
  if (mainType === "protocol_card") return `Use ${title} as a protocol command card for ${focus}.`;
  if (mainType === "skill_card") return `Use ${title} as a skill set card for ${focus}.`;
  return `Use ${title} as a ${typeLabel(mainType)} for ${focus}.`;
}

function findAfterLabel(text = "", labelRegex, stopLabels = []) {
  const match = text.match(labelRegex);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  let end = text.length;
  const after = text.slice(start);
  for (const stop of stopLabels) {
    const stopRegex = stop instanceof RegExp ? stop : new RegExp(escapeRegExp(stop), "i");
    const stopMatch = after.match(stopRegex);
    if (stopMatch?.index !== undefined && stopMatch.index > 0) end = Math.min(end, start + stopMatch.index);
  }
  return normalizeSpaces(text.slice(start, end)).slice(0, 1200);
}

function textBeforeFirst(text = "", labels = []) {
  let end = text.length;
  for (const label of labels) {
    const match = text.match(new RegExp(escapeRegExp(label), "i"));
    if (match?.index !== undefined) end = Math.min(end, match.index);
  }
  return text.slice(0, end);
}

function sectionValue(sections = [], label = "") {
  return sections.find((section) => section.label.toLowerCase() === label.toLowerCase())?.value || "";
}

function findCoreMeaning(text = "") {
  return findAfterLabel(text, /CORE\s+MEANING/i, ["MECHANICS", "INVERTED", "VISUAL LANGUAGE", "LOCATION TYPE"]) || "";
}

function extractBullets(value = "") {
  return unique(String(value || "")
    .split(/[•\n]+|(?:\s+-\s+)|(?:\s+\*\s+)/)
    .map((item) => normalizeSpaces(item.replace(/^[^A-Za-z0-9]+/, "")))
    .filter((item) => item.length > 3 && item.length < 180)
    .map((item) => item.replace(/\s+/g, " ")))
    .slice(0, 20);
}

function parseScore({ title, major, arcana, mainType, coreMeaning, mechanicsText, confidence }) {
  return (title && !isGenericTitle(title) ? 20 : 0) +
    (major ? 14 : 0) +
    (arcana ? 8 : 0) +
    (mainType ? 5 : 0) +
    (coreMeaning ? 4 : 0) +
    (mechanicsText ? 3 : 0) +
    Math.round(Number(confidence || 0) * 5);
}

function tarotFromShipCard(card = {}) {
  if (!card.shipCard) return null;
  return {
    mainType: "ship_card",
    tarotNumber: card.shipCard.tarotNumber,
    title: card.shipCard.title || card.title,
    subtitle: card.shipCard.subtitle,
    archetype: card.shipCard.archetype,
    keywords: card.shipCard.keywords || [],
    flavorText: card.shipCard.flavorText,
    effectTitle: card.shipCard.effectTitle,
    effectText: card.shipCard.effectText,
    catalog: {
      collectionId: "ships3-card-deck",
      collectionTitle: "Ships3 Card Deck",
      family: "Dear Papa Tarot",
      typeLabel: "Ship Card"
    },
    mediaLinks: [],
    ocr: card.shipCard.ocr || {}
  };
}

function loreSummary(title, mainType, parsed) {
  const arcana = parsed.identity?.arcana ? `, part of ${parsed.identity.arcana}` : "";
  const type = typeLabel(mainType);
  const core = parsed.cardFace?.coreMeaning ? ` It teaches ${parsed.cardFace.coreMeaning.slice(0, 160)}${parsed.cardFace.coreMeaning.length > 160 ? "..." : ""}` : "";
  return `${title} is a ${type} in the ${parsed.identity?.systemName || "Hapa Tarot System"}${arcana}.${core}`;
}

function broadMechanicForType(mainType = "") {
  if (mainType === "location_tarot_card") return "Play as a location/surface card that defines where a scene, relationship, or mechanic can unfold.";
  if (mainType === "relationship_tarot_card") return "Play as a relationship node that reveals trust, tension, loyalty, and future scene pressure.";
  if (mainType === "skill_card") return "Play as a skill node that teaches a usable avatar move, training habit, or utility function.";
  if (mainType === "protocol_card") return "Play as a protocol node that teaches a rule, boundary, verification step, or governance function.";
  if (mainType === "song_tarot_card") return "Play as a song-vibe node that binds a Dear Papa track to avatar memory and deck mood.";
  if (mainType === "ship_card") return "Play as a fleet/loadout node that moves avatars, scenes, and operational context.";
  if (mainType === "avatar_tarot_card") return "Play as an avatar identity node that shapes backstory, objective, and future chapter pressure.";
  if (mainType === "node_card") return "Play as an infrastructure node that teaches how a Hapa app or registry supports the protocol.";
  return "Play as a Hapa Tarot node that turns image/video lore into deck, surface, and Genesis context.";
}

function kindForCardType(cardType = "", fallback = "object") {
  if (cardType === "ship_card") return "ship";
  if (cardType === "skill_card") return "skill";
  if (cardType === "protocol_card") return "protocol";
  if (cardType === "node_card") return "node";
  return ["garden", "ship", "system", "protocol", "skill", "node", "item", "object"].includes(fallback) ? fallback : "object";
}

function typeLabel(mainType = "") {
  return titleCase(String(mainType || "hapa_tarot_card").replace(/_/g, " "));
}

function functionalTypeForMainType(mainType = "") {
  const labels = {
    avatar_tarot_card: "Avatar",
    hapa_tarot_card: "Hapa Tarot",
    location_tarot_card: "Location",
    lore_tarot_card: "Lore",
    node_card: "Node",
    protocol_card: "Protocol",
    relationship_tarot_card: "Relationship",
    ship_card: "Ship",
    skill_card: "Skill",
    song_tarot_card: "Song"
  };
  if (labels[mainType]) return labels[mainType];
  return titleCase(String(mainType || "card").replace(/_tarot_card$|_card$/g, "").replace(/_/g, " "));
}

function isGenericTitle(title = "") {
  const norm = normalizeSpaces(title);
  if (/^(hapa tarot system|protocol|major arcana|minor arcana|mimi tarot|tarot card|card|unknown|chatgpt image|grok)$/i.test(norm)) {
    return true;
  }
  if (/^[a-f0-9-]{12,64}$/i.test(norm)) return true;
  if (/episodes[a-f0-9]{8,}/i.test(norm)) return true;
  if (/\.mp4|\.png|\.webp/i.test(norm)) return true;
  if (/[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}/i.test(norm)) return true;
  return false;
}

function isGenericKeyword(keyword = "") {
  return /^(hapa|tarot|system|card|major|minor|arcana|core|meaning|upright|inverted|mechanics)$/i.test(normalizeSpaces(keyword));
}

function normalizeOcrLines(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => typeof line === "string" ? { text: line, confidence: 0, box: null } : {
      text: normalizeSpaces(line.text || ""),
      confidence: Number(line.confidence || 0),
      box: line.box || null
    })
    .filter((line) => line.text);
}

function cleanTitle(value = "") {
  return normalizeSpaces(String(value || "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9\s/&.'-]+$/g, "")
    .replace(/\s+/g, " "));
}

function titleCase(value = "") {
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/\b\p{L}/gu, (match) => match.toUpperCase())
    .replace(/\bOf\b/g, "of")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bThe\b/g, "The");
}

function normalizeSpaces(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function words(value = "") {
  return [...String(value || "").matchAll(/\p{L}+/gu)].map((match) => match[0]);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => typeof value === "string" ? normalizeSpaces(value) : value).filter(Boolean))];
}

function longest(a = "", b = "") {
  return String(b || "").length > String(a || "").length ? b : a;
}

function average(values = []) {
  const nums = values.map(Number).filter((value) => Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function distribution(values = []) {
  return values.reduce((counts, value) => {
    counts[value || "unknown"] = (counts[value || "unknown"] || 0) + 1;
    return counts;
  }, {});
}

function romanToNumber(roman = "") {
  const normalized = String(roman || "").toUpperCase().replace(/[^IVXLCDM]/g, "");
  if (!normalized) return 0;
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const value = map[normalized[index]] || 0;
    const next = map[normalized[index + 1]] || 0;
    total += value < next ? -value : value;
  }
  return total;
}

function findRomanNearTitle(upper = "", title = "") {
  if (!title) return "";
  const index = upper.indexOf(title.toUpperCase());
  if (index < 0) return "";
  const before = upper.slice(Math.max(0, index - 24), index);
  return before.match(/\b([IVXLCDM]{1,8}|0|[0-9]{1,2})\.?\s*$/)?.[1] || "";
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hash(value = "") {
  let str = String(value);
  if (path.isAbsolute(str) && str.startsWith(ROOT)) {
    str = path.relative(ROOT, str);
  }
  return crypto.createHash("sha1").update(str).digest("hex").slice(0, 16);
}

function argValue(name) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : "";
}

async function appendSubscriberEvents(report) {
  const event = {
    schemaVersion: "hapa.subscriber-event.v1",
    type: "tarot-ocr-refresh",
    runId: report.runId,
    generatedAt: report.generatedAt,
    summary: report.summary,
    reportPath: "data/tarot-ocr-refresh/latest-report.json"
  };
  for (const subscriber of ["events", "hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"]) {
    await fs.appendFile(path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`), `${JSON.stringify({ ...event, subscriber })}\n`);
  }
}



(async () => {
  const store = JSON.parse(await fs.readFile(ITEM_STORE_PATH, "utf8"));
  const card = store.cards.find(c => c.id === "mimi-tarot-shuttle-g7-a-93556ab1");
  const targets = collectCardTargets(card).map(target => {
    const cachePath = path.join(STABLE_CACHE_DIR, `${hash(target.path)}.json`);
    return { ...target, ocr: JSON.parse(fs.readFileSync(cachePath, "utf8")) };
  });
  console.log("Targets processed:", targets.length);
  const sourceRecords = targets.map((target) => {
    const lines = normalizeOcrLines(target.ocr?.lines || []);
    return {
      id: target.id,
      kind: target.kind,
      path: target.path,
      mediaUri: target.mediaUri,
      confidence: Number(target.ocr?.confidence || average(lines.map((line) => line.confidence)) || 0),
      lineCount: lines.length,
      text: lines.map((line) => line.text).join("\n"),
      lines
    };
  });
  const parsedSources = sourceRecords.map((source) => parseTarotSource(source, card));
  console.log("Parsed Sources titles:", parsedSources.map(p => p.identity.tarotCardName));
  const best = chooseBestParse(parsedSources, card);
  console.log("Best title:", best.identity.tarotCardName);
  const merged = mergeParses(parsedSources, best, card);
  console.log("Merged title:", merged.identity.tarotCardName);
})();
