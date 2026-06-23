#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createTarotLibraryDashboard,
  normalizeTarotStore,
  TAROT_ARCANA,
  TAROT_CARD_TYPES,
  TAROT_SUITS
} from "../src/domain/tarot.js";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORE_PATH = process.env.HAPA_TAROT_STORE || path.join(ROOT, "data/tarot-store.json");
const AVATAR_STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const KANBAN_PATH = process.env.HAPA_KANBAN_STORE || path.join(ROOT, "data/kanban.json");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const TOOL_PATH = path.join(ROOT, "artifacts/tools/vision-ocr");
const SWIFT_SOURCE = path.join(ROOT, "scripts/vision-ocr.swift");
const DRY_RUN = process.argv.includes("--dry-run");

const MAJOR_ARCANA = [
  "the fool",
  "the magician",
  "the high priestess",
  "the empress",
  "the emperor",
  "the hierophant",
  "the lovers",
  "the chariot",
  "strength",
  "the hermit",
  "wheel of fortune",
  "justice",
  "the hanged man",
  "death",
  "temperance",
  "the devil",
  "the tower",
  "the star",
  "the moon",
  "the sun",
  "judgement",
  "judgment",
  "the world"
];

const RANK_WORDS = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "page", "knight", "queen", "king"];
const THEME_TAGS = [
  ["celestial", /celestial|star|stars|constellation|moon|lunar|solar|eclipse|astral/i],
  ["lantern", /lantern|light|glow|beacon/i],
  ["ocean", /ocean|sea|tide|wave|shore|coast|water/i],
  ["observatory", /observatory|telescope|astrolabe|archive|compass/i],
  ["choice", /choice|crossroads|path|decision|alignment/i],
  ["destiny", /destiny|fate|cycle|timing|fortune|wheel/i],
  ["healing", /healing|healer|renewal|mend|salve|poultice/i],
  ["guardian", /guardian|protect|ward|oath|honor|shield/i],
  ["romance", /love|lovers|union|heart|romance/i],
  ["craft", /craft|forge|work|labor|practice|mastery/i],
  ["ritual", /ritual|sacred|sigil|oracle|altar/i],
  ["city", /city|cliff|harbor|sanctuary|temple|dome/i],
  ["movement", /dance|motion|flow|pathfinder|journey/i]
];

await main();

async function main() {
  await ensureVisionTool();
  const store = normalizeTarotStore(JSON.parse(await readFile(STORE_PATH, "utf8")));
  const avatarStore = await readAvatarStore();
  const avatarMatchers = buildAvatarMatchers(avatarStore.avatars || []);
  const imageJobs = collectImageJobs(store);
  const vision = await runVision(imageJobs.map((job) => job.path));

  const cardInferences = new Map();
  for (const card of store.cards) {
    const primaryPath = mediaPathForAsset(card.asset);
    const primaryVision = primaryPath ? vision.get(primaryPath) || null : null;
    const inferred = inferCard(card, primaryVision, avatarMatchers);
    cardInferences.set(card.id, inferred);
    applyCardInference(card, inferred);
  }

  const loopReport = enrichLoopVideos(store, vision, cardInferences);
  const avatarLinkReport = applyAvatarLinks(store, cardInferences);
  const dashboard = createTarotLibraryDashboard(store);

  if (!DRY_RUN) {
    await backupFile(STORE_PATH);
    await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await updateKanbanBoard({
      "card-tarot-library-dashboard": "done",
      "card-tarot-vision-tooling": "done",
      "card-tarot-batch-enrichment": "done",
      "card-tarot-loop-association": loopReport.unmatched ? "in_progress" : "done",
      "card-tarot-avatar-linking": "done",
      "card-tarot-review-queue": loopReport.unmatched || dashboard.enrichment.cardsNeedingReview ? "in_progress" : "done"
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    cards: store.cards.length,
    imageJobs: imageJobs.length,
    dashboard,
    loopReport,
    avatarLinkReport
  }, null, 2));
}

async function ensureVisionTool() {
  let needsBuild = true;
  try {
    const [toolStat, sourceStat] = await Promise.all([stat(TOOL_PATH), stat(SWIFT_SOURCE)]);
    needsBuild = sourceStat.mtimeMs > toolStat.mtimeMs;
  } catch {
    needsBuild = true;
  }
  if (!needsBuild) return;
  await mkdir(path.dirname(TOOL_PATH), { recursive: true });
  await execFile("swiftc", [SWIFT_SOURCE, "-o", TOOL_PATH], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
}

async function readAvatarStore() {
  try {
    return JSON.parse(await readFile(AVATAR_STORE_PATH, "utf8"));
  } catch {
    return { avatars: [] };
  }
}

function collectImageJobs(store) {
  const jobs = [];
  const seen = new Set();
  const add = (kind, id, asset, frame = null) => {
    const filePath = frame?.uri ? mediaPathForUri(frame.uri) : mediaPathForAsset(asset);
    if (!filePath || seen.has(filePath)) return;
    seen.add(filePath);
    jobs.push({ kind, id, assetId: asset?.id || null, frame: frame?.marker || null, path: filePath });
  };

  for (const card of store.cards) {
    if (card.asset?.type === "image") add("card", card.id, card.asset);
    for (const asset of card.assets || []) {
      if (asset.type !== "video") continue;
      const frames = asset.metadata?.frames || asset.state?.keyframes || [];
      for (const frame of frames) add("loop-frame", card.id, asset, frame);
    }
  }
  return jobs;
}

async function runVision(paths) {
  const results = new Map();
  const existingPaths = [];
  for (const filePath of paths) {
    try {
      await access(filePath, fsConstants.R_OK);
      existingPaths.push(filePath);
    } catch {
      results.set(filePath, { path: filePath, ok: false, textLines: [], labels: [], error: "missing" });
    }
  }

  for (const chunk of chunkArray(existingPaths, 80)) {
    const { stdout } = await execFile(TOOL_PATH, chunk, { cwd: ROOT, maxBuffer: 80 * 1024 * 1024 });
    for (const line of stdout.split("\n").filter(Boolean)) {
      const result = JSON.parse(line);
      results.set(result.path, result);
    }
  }
  return results;
}

function inferCard(card, vision, avatarMatchers) {
  const lines = (vision?.textLines || []).map((item) => item.text).filter(Boolean);
  const ocrText = lines.join("\n");
  const text = normalizeText(ocrText);
  const detectedTitle = detectTitle(lines, card.title);
  const detectedSuit = detectSuit(text, detectedTitle);
  const detectedArcana = detectArcana(text, detectedTitle, detectedSuit);
  const detectedNumber = detectNumber(lines, detectedTitle);
  const detectedCardType = detectCardType(text, detectedTitle, lines);
  const detectedAvatars = detectAvatars(lines, avatarMatchers, detectedTitle);
  const weakTitle = isWeakDetectedTitle(detectedTitle, lines);
  const tags = unique([
    "tarot",
    "hapa",
    "vision-ocr",
    detectedCardType,
    detectedSuit,
    detectedArcana,
    detectedNumber ? `rank-${slugTag(detectedNumber)}` : null,
    ...detectedAvatars.map((avatar) => `avatar-${slugTag(avatar.primaryName)}`),
    ...extractKeywordTags(lines),
    ...extractThemeTags(ocrText),
    ...(vision?.labels || []).slice(0, 8).map((label) => slugTag(label.identifier))
  ]);
  const confidence = weakTitle ? "low" : lines.length >= 3 || detectedTitle !== card.title ? "high" : lines.length ? "medium" : "low";
  return {
    cardId: card.id,
    detectedTitle,
    detectedSuit,
    detectedArcana,
    detectedNumber,
    detectedCardType,
    detectedAvatars,
    tags,
    confidence,
    needsReview: confidence === "low" || weakTitle,
    ocrText,
    ocrLines: lines,
    visualLabels: vision?.labels || [],
    visualDescription: buildVisualDescription(card, lines, vision?.labels || [], detectedTitle, detectedCardType, detectedSuit, detectedArcana),
    symbolicSummary: buildSymbolicSummary(lines, detectedTitle, detectedSuit, detectedArcana, detectedAvatars),
    textSynopsis: buildTextSynopsis(lines),
    loreNotes: buildLoreNotes(lines, detectedTitle, detectedCardType),
    sourceTextSnippets: lines.slice(0, 18),
    enrichedAt: new Date().toISOString()
  };
}

function applyCardInference(card, inferred) {
  card.title = inferred.detectedTitle || card.title;
  card.cardType = TAROT_CARD_TYPES.includes(inferred.detectedCardType) ? inferred.detectedCardType : card.cardType;
  card.suit = TAROT_SUITS.includes(inferred.detectedSuit) ? inferred.detectedSuit : card.suit;
  card.arcana = TAROT_ARCANA.includes(inferred.detectedArcana) ? inferred.detectedArcana : card.arcana;
  card.number = inferred.detectedNumber || card.number || "";
  const previousMachineTags = new Set(card.enrichment?.tags || []);
  const humanKeywords = (card.keywords || []).filter((tag) => !previousMachineTags.has(tag));
  card.keywords = unique([...humanKeywords, ...inferred.tags]).slice(0, 80);
  card.meaning = card.meaning || inferred.symbolicSummary;
  card.promptNotes = [
    inferred.visualDescription,
    "",
    "OCR / source text synopsis:",
    inferred.textSynopsis
  ].filter(Boolean).join("\n");
  card.enrichment = {
    schemaVersion: "hapa.tarot-enrichment.v1",
    status: "enriched",
    method: "macos-vision-ocr-vnclassifyimage",
    confidence: inferred.confidence,
    needsReview: inferred.needsReview,
    ocrText: inferred.ocrText,
    ocrLines: inferred.ocrLines,
    visualLabels: inferred.visualLabels,
    detectedTitle: inferred.detectedTitle,
    detectedNumber: inferred.detectedNumber,
    detectedSuit: inferred.detectedSuit,
    detectedArcana: inferred.detectedArcana,
    detectedCardType: inferred.detectedCardType,
    detectedAvatars: inferred.detectedAvatars,
    visualDescription: inferred.visualDescription,
    symbolicSummary: inferred.symbolicSummary,
    textSynopsis: inferred.textSynopsis,
    loreNotes: inferred.loreNotes,
    sourceTextSnippets: inferred.sourceTextSnippets,
    tags: inferred.tags,
    media: {
      primaryAssetId: card.asset?.id || null,
      primaryAssetUri: card.asset?.uri || null
    },
    enrichedAt: inferred.enrichedAt
  };
  card.updatedAt = new Date().toISOString();
}

function enrichLoopVideos(store, vision, cardInferences) {
  const cardIndex = new Map(store.cards.map((card) => [card.id, card]));
  const cardsByTitle = buildCardMatchIndex(store.cards, cardInferences);
  const originalVideos = [];
  for (const card of store.cards) {
    for (const asset of card.assets || []) {
      if (asset.type === "video") originalVideos.push({ sourceCardId: card.id, asset });
    }
    card.assets = (card.assets || []).filter((asset) => asset.type !== "video");
  }

  let total = 0;
  let moved = 0;
  let matched = 0;
  let unmatched = 0;

  for (const { sourceCardId, asset } of originalVideos) {
    total += 1;
    const sourceCard = cardIndex.get(sourceCardId);
    const loopInference = inferLoop(asset, vision);
    const target = matchLoopToCard(loopInference, cardsByTitle, sourceCardId);
    const targetCard = target?.cardId ? cardIndex.get(target.cardId) : null;
    const needsReview = !targetCard || target.score < 5;
    const destination = targetCard && target.score >= 5 ? targetCard : sourceCard;
    if (!destination) continue;
    if (targetCard && target.score >= 5) {
      matched += 1;
      if (targetCard.id !== sourceCardId) moved += 1;
    } else {
      unmatched += 1;
    }
    destination.assets = uniqueByIdAssets([
      ...(destination.assets || []),
      enrichLoopAsset(asset, loopInference, target, needsReview)
    ]);
    destination.updatedAt = new Date().toISOString();
  }

  for (const card of store.cards) {
    card.assets = uniqueByIdAssets(card.assets || []);
    card.asset = card.assets.find((asset) => asset.id === card.primaryAssetId && asset.type === "image") ||
      card.assets.find((asset) => asset.type === "image") ||
      null;
    card.primaryAssetId = card.asset?.id || null;
  }

  return { total, matched, moved, unmatched };
}

function inferLoop(asset, vision) {
  const frames = asset.metadata?.frames || asset.state?.keyframes || [];
  const frameResults = frames.map((frame) => {
    const filePath = mediaPathForUri(frame.uri);
    const result = filePath ? vision.get(filePath) : null;
    return {
      marker: frame.marker,
      uri: frame.uri,
      lines: (result?.textLines || []).map((line) => line.text).filter(Boolean),
      labels: result?.labels || []
    };
  });
  const lines = frameResults.flatMap((frame) => frame.lines);
  const detectedTitle = detectTitle(lines, asset.name || "");
  const text = normalizeText(lines.join("\n"));
  return {
    assetId: asset.id,
    detectedTitle,
    detectedSuit: detectSuit(text, detectedTitle),
    detectedArcana: detectArcana(text, detectedTitle, detectSuit(text, detectedTitle)),
    detectedNumber: detectNumber(lines, detectedTitle),
    ocrText: lines.join("\n"),
    frameResults,
    tags: unique(["tarot-loop", "vision-ocr", ...extractKeywordTags(lines), ...extractThemeTags(lines.join("\n"))]),
    enrichedAt: new Date().toISOString()
  };
}

function enrichLoopAsset(asset, loopInference, target, needsReview) {
  return {
    ...asset,
    tags: unique([...(asset.tags || []), ...loopInference.tags, target?.cardId ? "matched-loop" : null, needsReview ? "needs-review" : null]),
    metadata: {
      ...(asset.metadata || {}),
      tarotEnrichment: {
        schemaVersion: "hapa.tarot-loop-enrichment.v1",
        status: "enriched",
        method: "macos-vision-ocr-frame-set",
        confidence: target?.score >= 7 ? "high" : target?.score >= 5 ? "medium" : "low",
        needsReview,
        detectedTitle: loopInference.detectedTitle,
        detectedSuit: loopInference.detectedSuit,
        detectedArcana: loopInference.detectedArcana,
        detectedNumber: loopInference.detectedNumber,
        matchedCardId: target?.cardId || null,
        matchScore: target?.score || 0,
        ocrText: loopInference.ocrText,
        frameResults: loopInference.frameResults,
        tags: loopInference.tags,
        enrichedAt: loopInference.enrichedAt
      }
    }
  };
}

function applyAvatarLinks(store, cardInferences) {
  let linked = 0;
  let skippedExisting = 0;
  for (const card of store.cards) {
    const inferred = cardInferences.get(card.id);
    for (const avatar of inferred?.detectedAvatars || []) {
      if (card.avatarLinks.some((link) => link.avatarId === avatar.id)) {
        skippedExisting += 1;
        continue;
      }
      card.avatarLinks.push({
        avatarId: avatar.id,
        role: "tarot-ocr-anchor",
        note: `Linked from local Vision OCR match on "${avatar.matchedText}" while enriching ${card.title}.`,
        tags: ["tarot-link", "vision-ocr", "avatar-anchor"],
        linkedAt: new Date().toISOString()
      });
      linked += 1;
    }
  }
  return { linked, skippedExisting };
}

function buildCardMatchIndex(cards, cardInferences) {
  return cards.map((card) => {
    const inferred = cardInferences.get(card.id);
    return {
      cardId: card.id,
      title: card.title,
      key: matchKey(inferred?.detectedTitle || card.title),
      suit: inferred?.detectedSuit || card.suit,
      arcana: inferred?.detectedArcana || card.arcana,
      number: inferred?.detectedNumber || card.number || "",
      tokens: usefulTokens(inferred?.detectedTitle || card.title)
    };
  });
}

function matchLoopToCard(loop, cardIndex, currentCardId) {
  const loopKey = matchKey(loop.detectedTitle);
  const loopTokens = usefulTokens(loop.detectedTitle);
  let best = null;
  for (const card of cardIndex) {
    let score = 0;
    if (loopKey && card.key && loopKey === card.key) score += 8;
    if (loopKey && card.key && (loopKey.includes(card.key) || card.key.includes(loopKey))) score += 4;
    const overlap = loopTokens.filter((token) => card.tokens.includes(token)).length;
    score += overlap;
    if (loop.detectedSuit && loop.detectedSuit === card.suit) score += 1;
    if (loop.detectedArcana && loop.detectedArcana === card.arcana) score += 1;
    if (loop.detectedNumber && normalizeText(loop.detectedNumber) === normalizeText(card.number)) score += 2;
    if (card.cardId === currentCardId) score += 0.5;
    if (!best || score > best.score) best = { cardId: card.cardId, score, title: card.title };
  }
  return best;
}

function detectTitle(lines, fallback) {
  const cleaned = lines.map(cleanOcrLine).filter(Boolean);
  const joined = normalizeText(cleaned.join(" "));
  const dossier = cleaned.find((line) => /archetype dossier/i.test(line));
  if (dossier) {
    const dossierIndex = cleaned.indexOf(dossier);
    const previous = cleaned[dossierIndex - 1] || "";
    const prefix = /^(red|blue|green|yellow|pink|purple)$/i.test(previous) ? `${previous} ` : "";
    return titleCase(`${prefix}${dossier}`);
  }
  const cardBack = cleaned.find((line) => /card back/i.test(line));
  if (cardBack) return titleCase(cardBack);
  const concept = cleaned.find((line) => /concept sheet|template themes|symbol \/ icon library/i.test(line));
  if (concept && !cleaned.some((line) => MAJOR_ARCANA.some((title) => containsPhrase(line, title)))) return titleCase(concept);
  for (const title of MAJOR_ARCANA) {
    const key = normalizeTitle(title);
    if (containsPhrase(joined, key) || joined.includes(key.replace(/\s+/g, ""))) return title.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  const minorTitle = cleaned.find((line) =>
    /\b(ace|two|three|four|five|six|seven|eight|nine|ten|page|knight|queen|king)\s+of\s+(wands|cups|swords|pentacles)\b/i.test(line)
  );
  if (minorTitle) return titleCase(minorTitle);
  const meaningful = cleaned.find((line) =>
    line.length >= 3 &&
    !/^(hapa|hapa-verse|tarot deck|concept sheet|artist notes|symbolism notes|color palette|visual themes|material|finish|template themes)$/i.test(line) &&
    !/^\W+$/.test(line)
  );
  return titleCase(meaningful || fallback || "Untitled Tarot Card");
}

function detectSuit(text, title) {
  const haystack = `${text} ${normalizeText(title)}`;
  if (/pentacle|pentacles|coin|coins|earth|forest green|green/.test(haystack)) return "pentacles";
  if (/cup|cups|water|tide|ocean|blue/.test(haystack)) return "cups";
  if (/wand|wands|fire|ember|red/.test(haystack)) return "wands";
  if (/sword|swords|air|blade|yellow/.test(haystack)) return "swords";
  if (MAJOR_ARCANA.some((item) => containsPhrase(title, normalizeTitle(item)))) return "major";
  return "custom";
}

function detectArcana(text, title, suit) {
  const haystack = `${text} ${normalizeText(title)}`;
  if (MAJOR_ARCANA.some((item) => containsPhrase(title, normalizeTitle(item)))) return "major";
  if (["pentacles", "cups", "wands", "swords"].includes(suit)) return "minor";
  if (/oracle/.test(haystack)) return "oracle";
  return "custom";
}

function isWeakDetectedTitle(title, lines) {
  const normalized = normalizeText(title);
  if (!normalized || normalized.length < 4) return true;
  if (/^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx|xxi|vil|xil|xii|ace)$/.test(normalized)) return true;
  if (normalized === "ace" && !lines.some((line) => /of\s+(wands|cups|swords|pentacles)/i.test(line))) return true;
  return false;
}

function detectNumber(lines, title) {
  const joined = normalizeText(`${lines.join(" ")} ${title}`);
  const roman = lines.map(cleanOcrLine).find((line) => /^(0?[ivxlcdm]+|\b[ivxlcdm]+\b)$/i.test(line.trim()));
  if (roman) return roman.trim().toUpperCase();
  const rank = RANK_WORDS.find((item) => new RegExp(`\\b${item}\\b`, "i").test(joined));
  if (rank) return titleCase(rank);
  return "";
}

function detectCardType(text, title, lines) {
  const haystack = `${text} ${normalizeText(title)}`;
  if (/card back/.test(haystack) && !/variation|concept sheet|template|themes|exploration/.test(haystack)) return "card_back";
  if (/archetype dossier|concept sheet|template themes|symbol|icon library|palette|material|visual language|suite role guide|card back variations/.test(haystack)) return "reference_card";
  if (/oracle/.test(haystack)) return "oracle_card";
  if (lines.length > 30 && /notes|guide|palette|dossier/i.test(lines.join(" "))) return "reference_card";
  return "card_front";
}

function buildAvatarMatchers(avatars) {
  const raw = [];
  const counts = new Map();
  for (const avatar of avatars) {
    const names = [
      avatar.primaryName,
      ...(avatar.names || []).map((item) => item.name || item),
      ...(avatar.aliases || [])
    ].filter(Boolean);
    for (const name of names) {
      const key = normalizeName(name);
      if (!key || key.length < 3) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      raw.push({ id: avatar.id, primaryName: avatar.primaryName, matchedText: name, key });
    }
  }
  return raw.filter((item) => counts.get(item.key) === 1 || normalizeName(item.primaryName) === item.key);
}

function detectAvatars(lines, matchers, title) {
  const firstLines = normalizeText(lines.slice(0, 12).join(" "));
  const fullText = normalizeText(lines.join(" "));
  const titleText = normalizeText(title);
  const matches = [];
  for (const matcher of matchers) {
    const isColorName = ["red", "blue", "green", "pink", "purple", "yellow"].includes(matcher.key);
    const sourceText = isColorName ? `${titleText} ${firstLines}` : fullText;
    if (new RegExp(`(^|\\s)${escapeRegExp(matcher.key)}(\\s|$)`).test(sourceText)) {
      if (!matches.some((item) => item.id === matcher.id)) matches.push(matcher);
    }
  }
  return matches;
}

function extractKeywordTags(lines) {
  const tags = [];
  for (const line of lines.slice(0, 16)) {
    if (!/[•·|]/.test(line) && !/ [A-Z]{3,} /.test(line)) continue;
    for (const part of line.split(/[•·|,;:]/)) {
      const tag = slugTag(part);
      if (tag && tag.length > 2 && tag.length < 28) tags.push(tag);
    }
  }
  return tags;
}

function extractThemeTags(text) {
  return THEME_TAGS.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function buildVisualDescription(card, lines, labels, title, cardType, suit, arcana) {
  const labelText = labels.slice(0, 10).map((label) => `${label.identifier} ${(label.confidence * 100).toFixed(0)}%`).join(", ");
  const ocrLead = lines.slice(0, 10).join(" / ");
  return [
    `${title} is cataloged as a ${tarotCardTypeHuman(cardType)} in the ${suit} suit with ${arcana} arcana behavior.`,
    `Local Vision OCR found ${lines.length} text line${lines.length === 1 ? "" : "s"} on the primary image. The visible hierarchy begins with: ${ocrLead || "no readable text"}.`,
    `Vision image classification reads the surface as ${labelText || "unclassified media"}, which suggests a designed card/reference image rather than an unstructured photo.`,
    `As a Hapa Tarot library object, this record should be treated as a lore-bearing visual asset: typography, title plaques, palette notes, symbols, and body text are all preserved for future prompt, reading, avatar, and Second Brain use.`,
    `Original upload title was "${card.title}", primary asset is "${card.asset?.name || "none"}".`
  ].join(" ");
}

function buildSymbolicSummary(lines, title, suit, arcana, avatars) {
  const signal = lines.find((line) => /•|choice|destiny|earth|water|fire|air|love|cycle|healing|guardian/i.test(line)) || lines[1] || "";
  const avatarText = avatars.length ? ` It appears anchored to ${avatars.map((avatar) => avatar.primaryName).join(", ")} by OCR/name evidence.` : "";
  return `${title} carries ${suit}/${arcana} symbolism. ${signal ? `Primary textual signal: ${signal}.` : "No strong textual signal was detected."}${avatarText}`;
}

function buildTextSynopsis(lines) {
  if (!lines.length) return "No OCR text was recovered from this asset.";
  return lines.slice(0, 80).join("\n");
}

function buildLoreNotes(lines, title, cardType) {
  const lower = normalizeText(lines.join(" "));
  const notes = [];
  if (/hapa-verse|hapa verse/.test(lower)) notes.push("Explicitly marked as Hapa-verse material.");
  if (/oath|signature|lore/.test(lower)) notes.push("Contains lore/oath/signature language suitable for Second Brain extraction.");
  if (/visual language|iconography|palette|material/.test(lower)) notes.push("Contains production-design metadata useful for future art direction and deck consistency.");
  if (/meaning|upright|reversed|destiny|choice/.test(lower)) notes.push("Contains symbolic interpretation language suitable for reading logic.");
  return notes.length
    ? `${title} (${tarotCardTypeHuman(cardType)}): ${notes.join(" ")}`
    : `${title} (${tarotCardTypeHuman(cardType)}): OCR did not expose a specialized lore section, but the text has been preserved for later interpretation.`;
}

async function updateKanbanBoard(statuses) {
  try {
    const board = JSON.parse(await readFile(KANBAN_PATH, "utf8"));
    for (const lane of board.lanes || []) {
      for (const card of lane.cards || []) {
        if (statuses[card.id]) card.status = statuses[card.id];
      }
    }
    await writeFile(KANBAN_PATH, `${JSON.stringify(board, null, 2)}\n`, "utf8");
  } catch {
    // Kanban refresh should not fail the enrichment pass.
  }
}

async function backupFile(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(ROOT, "data/backups", `${path.basename(filePath)}.tarot-enrichment-${timestamp}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(filePath, backupPath);
}

function mediaPathForAsset(asset) {
  if (!asset?.uri) return null;
  return mediaPathForUri(asset.uri);
}

function mediaPathForUri(uri) {
  if (!uri) return null;
  if (uri.startsWith("/media/")) return path.join(MEDIA_DIR, uri.slice("/media/".length));
  if (uri.startsWith("file://")) return new URL(uri).pathname;
  if (path.isAbsolute(uri)) return uri;
  return null;
}

function cleanOcrLine(line) {
  return String(line || "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/0ffortune/g, "of fortune")
    .replace(/offortune/g, "of fortune")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value = "") {
  return normalizeText(value).replace(/^the /, "");
}

function normalizeName(value = "") {
  return normalizeText(value).replace(/^a /, "");
}

function matchKey(value = "") {
  return usefulTokens(value).join(" ");
}

function containsPhrase(text, phrase) {
  const haystack = ` ${normalizeText(text)} `;
  const needle = normalizeText(phrase);
  if (!needle) return false;
  return new RegExp(`\\b${escapeRegExp(needle).replace(/\\s+/g, "\\\\s+")}\\b`).test(haystack);
}

function usefulTokens(value = "") {
  const stop = new Set(["the", "a", "an", "of", "and", "card", "tarot", "deck", "hapa", "verse", "image", "jun", "pm", "am"]);
  return normalizeText(value).split(" ").filter((token) => token.length > 1 && !stop.has(token));
}

function slugTag(value = "") {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1)
    .slice(0, 5)
    .join("-");
}

function titleCase(value = "") {
  return cleanOcrLine(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bOf\b/g, "of")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bThe\b/g, "The");
}

function tarotCardTypeHuman(type) {
  return {
    card_front: "card front",
    card_back: "card back",
    oracle_card: "oracle card",
    reference_card: "reference card"
  }[type] || type;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function uniqueByIdAssets(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
