#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createItemCard, normalizeItemManagerStore } from "../src/domain/item.js";
import { slugify } from "../src/domain/avatar.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_DIR = "/Users/calderwong/comics/Dear Papa - Album/card-deck/run2/ships3";
const ITEM_STORE_PATH = process.env.HAPA_ITEM_STORE || path.join(ROOT, "data/item-manager-store.json");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const SHIP_MEDIA_DIR = path.join(MEDIA_DIR, "ship-cards");
const INGEST_DIR = path.join(ROOT, "data/ship-card-ingest/ships3");
const OCR_DIR = path.join(INGEST_DIR, "ocr");
const OCR_FRAME_DIR = path.join(INGEST_DIR, "frames");
const MANIFEST_PATH = path.join(INGEST_DIR, "manifest.json");
const BACKUP_DIR = path.join(ROOT, "data/backups");
const OCR_SCRIPT = path.join(ROOT, "scripts/vision-ocr.swift");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const STAT_LABELS = ["speed", "morale", "supply", "influence"];

const args = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(String(args.get("source") || DEFAULT_SOURCE_DIR));
const limit = Number(args.get("limit") || 0);
const refresh = args.has("refresh");
const dryRun = args.has("dry-run") || args.has("no-write");
const verbose = args.has("verbose");

await main();

async function main() {
  await ensureRuntime();
  const videos = await listVideos(sourceDir);
  const selectedVideos = limit > 0 ? videos.slice(0, limit) : videos;
  const records = [];

  for (let index = 0; index < selectedVideos.length; index += 1) {
    const videoPath = selectedVideos[index];
    const record = await prepareVideoRecord(videoPath, index + 1, selectedVideos.length);
    records.push(record);
    if (verbose) console.log(`[ships3] prepared ${record.id} ${record.source.fileName}`);
  }

  const ocrRecords = await readOrRunOcr(records);
  const cards = records.map((record) => {
    const ocr = ocrRecords.get(record.ocrFramePath) || emptyOcr(record.ocrFramePath);
    const statsOcrs = [
      ocrRecords.get(record.statsFramePath) || emptyOcr(record.statsFramePath),
      ocrRecords.get(record.statsGrayFramePath) || emptyOcr(record.statsGrayFramePath),
      ocrRecords.get(record.statsTightFramePath) || emptyOcr(record.statsTightFramePath)
    ];
    const details = parseShipCardDetails(ocr, record, statsOcrs);
    return {
      record,
      ocr,
      statsOcrs,
      details,
      card: buildShipCard(record, details)
    };
  });
  consolidateDuplicateShipStats(cards);

  const manifest = {
    schemaVersion: "hapa.ship-card-ingest.v1",
    sourceDir,
    generatedAt: new Date().toISOString(),
    dryRun,
    count: cards.length,
    records: cards.map(({ record, details, card, ocr, statsOcrs }) => ({
      id: card.id,
      title: card.title,
      subtitle: details.subtitle,
      tarotNumber: details.tarotNumber,
      keywords: details.keywords,
      stats: details.stats,
      confidence: details.ocr.confidence,
      sourceVideoPath: record.source.path,
      videoUri: record.videoUri,
      firstFrameUri: record.firstFrameUri,
      ocrLineCount: ocr.lines.length,
      statOcrLineCount: statsOcrs.reduce((sum, entry) => sum + entry.lines.length, 0)
    }))
  };

  if (!dryRun) {
    await upsertCards(cards.map((entry) => entry.card));
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    sourceDir,
    videosFound: videos.length,
    cardsPrepared: cards.length,
    itemStoreUpdated: !dryRun,
    manifestPath: MANIFEST_PATH,
    mediaDir: SHIP_MEDIA_DIR,
    sampleCards: manifest.records.slice(0, 8)
  }, null, 2));
}

async function ensureRuntime() {
  await mkdir(SHIP_MEDIA_DIR, { recursive: true });
  await mkdir(OCR_DIR, { recursive: true });
  await mkdir(OCR_FRAME_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
}

async function listVideos(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

async function prepareVideoRecord(videoPath, position, total) {
  const ext = path.extname(videoPath).toLowerCase() || ".mp4";
  const baseName = path.basename(videoPath, ext);
  const uuid = baseName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase();
  const id = `ship-card-${uuid || stableHash(baseName).slice(0, 16)}`;
  const mediaBase = `${id}${ext}`;
  const firstFrameName = `${id}-first.png`;
  const ocrFrameName = `${id}-ocr.png`;
  const statsFrameName = `${id}-stats.png`;
  const statsGrayFrameName = `${id}-stats-gray.png`;
  const statsTightFrameName = `${id}-stats-tight.png`;
  const linkedVideoPath = path.join(SHIP_MEDIA_DIR, mediaBase);
  const firstFramePath = path.join(SHIP_MEDIA_DIR, firstFrameName);
  const ocrFramePath = path.join(OCR_FRAME_DIR, ocrFrameName);
  const statsFramePath = path.join(OCR_FRAME_DIR, statsFrameName);
  const statsGrayFramePath = path.join(OCR_FRAME_DIR, statsGrayFrameName);
  const statsTightFramePath = path.join(OCR_FRAME_DIR, statsTightFrameName);

  await ensureSymlink(videoPath, linkedVideoPath);
  await extractFrame(videoPath, firstFramePath, []);
  await extractFrame(videoPath, ocrFramePath, [
    "-vf",
    "scale=iw*2:ih*2,format=gray,eq=contrast=1.5:brightness=0.02,unsharp=5:5:1.0"
  ]);
  await extractFrame(videoPath, statsFramePath, [
    "-vf",
    "crop=iw:ih*0.24:0:ih*0.74,scale=iw*5:ih*5"
  ]);
  await extractFrame(videoPath, statsGrayFramePath, [
    "-vf",
    "crop=iw:ih*0.24:0:ih*0.74,scale=iw*5:ih*5,format=gray,eq=contrast=2.2:brightness=0.02,unsharp=7:7:1.2"
  ]);
  await extractFrame(videoPath, statsTightFramePath, [
    "-vf",
    "crop=iw:ih*0.17:0:ih*0.83,scale=iw*4:ih*4"
  ]);

  const media = await probeVideo(videoPath);
  return {
    id,
    position,
    total,
    source: {
      path: videoPath,
      fileName: path.basename(videoPath),
      baseName
    },
    media,
    linkedVideoPath,
    firstFramePath,
    ocrFramePath,
    statsFramePath,
    statsGrayFramePath,
    statsTightFramePath,
    videoUri: `/media/ship-cards/${mediaBase}`,
    firstFrameUri: `/media/ship-cards/${firstFrameName}`
  };
}

async function ensureSymlink(target, linkPath) {
  if (refresh) {
    await rm(linkPath, { force: true });
  }
  try {
    await lstat(linkPath);
    return;
  } catch {
    await symlink(target, linkPath);
  }
}

async function extractFrame(videoPath, framePath, extraArgs = []) {
  if (!refresh) {
    try {
      await lstat(framePath);
      return;
    } catch {
      // Continue and extract.
    }
  }
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    videoPath,
    "-frames:v",
    "1",
    ...extraArgs,
    framePath
  ], { maxBuffer: 1024 * 1024 * 4 });
}

async function probeVideo(videoPath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height,duration",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      videoPath
    ], { maxBuffer: 1024 * 1024 });
    const payload = JSON.parse(stdout);
    const stream = (payload.streams || []).find((item) => item.width && item.height) || {};
    return {
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
      duration: Number(payload.format?.duration || stream.duration || 0),
      mimeType: "video/mp4"
    };
  } catch {
    return {
      width: 0,
      height: 0,
      duration: 0,
      mimeType: "video/mp4"
    };
  }
}

async function readOrRunOcr(records) {
  const byFrame = new Map();
  const pending = [];
  for (const record of records) {
    const entries = [
      { framePath: record.ocrFramePath, cachePath: path.join(OCR_DIR, `${record.id}.json`) },
      { framePath: record.statsFramePath, cachePath: path.join(OCR_DIR, `${record.id}-stats.json`) },
      { framePath: record.statsGrayFramePath, cachePath: path.join(OCR_DIR, `${record.id}-stats-gray.json`) },
      { framePath: record.statsTightFramePath, cachePath: path.join(OCR_DIR, `${record.id}-stats-tight.json`) }
    ];
    for (const entry of entries) {
      if (!refresh) {
        try {
          const cached = JSON.parse(await readFile(entry.cachePath, "utf8"));
          byFrame.set(entry.framePath, cached);
          continue;
        } catch {
          // Continue and OCR.
        }
      }
      pending.push(entry);
    }
  }

  const batchSize = 12;
  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const { stdout } = await execFileAsync("swift", [OCR_SCRIPT, ...batch.map((entry) => entry.framePath)], {
      maxBuffer: 1024 * 1024 * 24
    });
    const results = JSON.parse(stdout);
    for (const result of results) {
      const entry = batch.find((item) => item.framePath === result.path);
      if (!entry) continue;
      await writeFile(entry.cachePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      byFrame.set(entry.framePath, result);
    }
  }
  return byFrame;
}

function parseShipCardDetails(ocr, record, statsOcrs = []) {
  const parsedAt = new Date().toISOString();
  const statOcrList = Array.isArray(statsOcrs) ? statsOcrs : [statsOcrs];
  const lines = normalizeOcrLines(ocr.lines || []);
  const statLines = statOcrList.flatMap((statsOcr, index) => normalizeOcrLines(statsOcr.lines || [])
    .map((line) => ({
      ...line,
      sourcePriority: Math.max(1, 3 - index)
    })));
  const textLines = lines.map((line) => line.text).filter(Boolean);
  const statTextLines = statLines.map((line) => line.text).filter(Boolean);
  const rawText = textLines.join("\n");
  const statsRawText = statTextLines.join("\n");
  const romanLine = textLines.find((line) => /^[IVXLCDM]{1,8}$/i.test(line.trim()));
  const effectIndex = textLines.findIndex((line) => /effect/i.test(line));
  const titleIndex = findTitleIndex(textLines);
  const title = titleIndex >= 0 ? toTitleCase(cleanHeading(textLines[titleIndex])) : `Ship Card ${record.position}`;
  const subtitle = findSubtitle(textLines, titleIndex, effectIndex);
  const keywordBlock = findKeywordBlock(lines, titleIndex, effectIndex, subtitle);
  const keywords = keywordBlock.keywords;
  const flavorText = findFlavorText(textLines, keywordBlock, effectIndex, titleIndex, subtitle);
  const effectTitle = effectIndex >= 0 ? toTitleCase(cleanHeading(textLines[effectIndex])) : "";
  const effectText = findEffectText(textLines, effectIndex);
  const stats = parseStats(lines, statLines, rawText, statsRawText);
  const confidence = Number(ocr.confidence || average(lines.map((line) => line.confidence)) || 0);

  return {
    schemaVersion: "hapa.ship-card-details.v1",
    tarotNumber: romanLine || "",
    title,
    subtitle,
    archetype: subtitle,
    keywords,
    flavorText,
    effectTitle,
    effectText,
    stats,
    ocr: {
      engine: ocr.engine || "apple-vision",
      confidence,
      rawText: [rawText, statsRawText].filter(Boolean).join("\n"),
      lines,
      parsedAt,
      sourceVideoPath: record.source.path,
      sourceFramePath: record.firstFramePath
    }
  };
}

function normalizeOcrLines(lines = []) {
  return lines
    .map((line) => ({
      text: normalizeSpaces(line.text || ""),
      confidence: Number(line.confidence || 0),
      box: line.box || null
    }))
    .filter((line) => line.text);
}

function findTitleIndex(lines) {
  const upperCandidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      if (/^[IVXLCDM]{1,8}$/i.test(line.trim())) return false;
      if (/effect|speed|morale|supply|influence/i.test(line)) return false;
      if (/\d/.test(line)) return false;
      const words = wordsOnly(line);
      if (words.length < 1 || words.length > 5) return false;
      return uppercaseRatio(line) > 0.55 || /^the\s+/i.test(line);
    });
  return upperCandidates[0]?.index ?? -1;
}

function findSubtitle(lines, titleIndex, effectIndex) {
  if (titleIndex < 0) return "";
  const stop = effectIndex >= 0 ? effectIndex : Math.min(lines.length, titleIndex + 5);
  for (let index = titleIndex + 1; index < stop; index += 1) {
    const line = lines[index];
    if (!line || /effect|speed|morale|supply|influence/i.test(line)) continue;
    if (/^[IVXLCDM]{1,8}$/i.test(cleanHeading(line))) continue;
    const clean = cleanSubtitleHeading(line);
    const words = wordsOnly(clean);
    if (words.length >= 1 && words.length <= 4 && uppercaseRatio(clean) > 0.5) return toTitleCase(clean);
  }
  return "";
}

function findKeywordBlock(lines, titleIndex, effectIndex, subtitle = "") {
  const entries = lines.map((line, index) => ({
    ...(typeof line === "string" ? { text: line, box: null } : line),
    index
  }));
  const start = Math.max(0, titleIndex + 1);
  const stop = effectIndex >= 0 ? effectIndex : entries.length;
  let best = { start: -1, end: -1, keywords: [], score: -Infinity };
  for (let index = start; index < stop; index += 1) {
    const entry = entries[index];
    const line = entry.text;
    if (isCardMetaLine(line, subtitle)) continue;
    if (!isKeywordLine(line) && !(isLikelyKeywordBand(entry) && isKeywordContinuationLine(line))) continue;

    const keywords = splitKeywords(line);
    let end = index;
    for (let next = index + 1; next < stop; next += 1) {
      const nextEntry = entries[next];
      const nextLine = nextEntry.text;
      if (isCardMetaLine(nextLine, subtitle)) continue;
      if (!isKeywordContinuationLine(nextLine) || !isLikelyKeywordBand(nextEntry)) break;
      keywords.push(...splitKeywords(nextLine));
      end = next;
    }

    const uniqueKeywords = [...new Set(keywords)];
    if (uniqueKeywords.length < 2) continue;
    const score = uniqueKeywords.length +
      (/[+|*•·]/.test(line) ? 2 : 0) +
      (isLikelyKeywordBand(entry) ? 2 : 0) +
      (index > titleIndex + 2 ? 0.5 : 0);
    if (score > best.score) {
      best = { start: index, end, keywords: uniqueKeywords, score };
    }
  }
  return {
    start: best.start,
    end: best.end,
    keywords: best.keywords
  };
}

function isLikelyKeywordBand(entry = {}) {
  if (!entry.box) return true;
  const centerY = entry.box.y + (entry.box.height / 2);
  return centerY >= 0.30 && centerY <= 0.39;
}

function findFlavorText(lines, keywordBlock, effectIndex, titleIndex, subtitle = "") {
  const start = keywordBlock.end >= 0 ? keywordBlock.end + 1 : Math.max(0, titleIndex + 1);
  const stop = effectIndex >= 0 ? effectIndex : lines.length;
  return lines
    .slice(start, stop)
    .filter((line) => {
      if (isCardMetaLine(line, subtitle)) return false;
      if (/effect|speed|morale|supply|influence/i.test(line)) return false;
      if (isKeywordLine(line) || isKeywordContinuationLine(line)) return false;
      return /[a-z]/.test(line);
    })
    .join(" ")
    .trim();
}

function findEffectText(lines, effectIndex) {
  if (effectIndex < 0) return "";
  const effectLines = [];
  for (let index = effectIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/speed|morale|supply|influence/i.test(line)) break;
    const numericOnly = line.replace(/[\s.,+;:-]/g, "");
    if (/^\d{2,}$/.test(numericOnly)) break;
    if (/^[0-9\s]+$/.test(line) && wordsOnly(line).length === 0) break;
    effectLines.push(line);
  }
  return effectLines.join(" ").trim();
}

function parseStats(lines = [], statLines = [], rawText = "", statsRawText = "") {
  const slots = new Map();
  for (const source of [
    { kind: "stats", lines: statLines, priority: 2 },
    { kind: "card", lines, priority: 1 }
  ]) {
    for (const candidate of findStatCandidates(source.lines, source.priority)) {
      const current = slots.get(candidate.label);
      if (!current || candidate.score > current.score) {
        slots.set(candidate.label, candidate);
      }
    }
  }

  const result = Object.fromEntries(STAT_LABELS.map((label) => [label, Number(slots.get(label)?.value || 0)]));
  if (Object.values(result).every((value) => value === 0)) {
    const preferredText = statsRawText || rawText;
    const numbers = [...preferredText.matchAll(/(^|[^A-Za-z0-9])(\d{1,2})(?=$|[^A-Za-z0-9])/g)]
      .map((match) => Number(match[2]))
      .filter((value) => Number.isFinite(value));
    const statValues = numbers.slice(-4);
    return Object.fromEntries(STAT_LABELS.map((label, index) => [label, Number(statValues[index] || 0)]));
  }

  return result;
}

function isCardMetaLine(line = "", subtitle = "") {
  const clean = cleanHeading(line);
  if (!clean) return true;
  if (/^[IVXLCDM]{1,8}$/i.test(clean)) return true;
  if (subtitle && toTitleCase(clean) === subtitle) return true;
  return /effect|speed|morale|supply|influence/i.test(clean);
}

function isKeywordLine(line = "") {
  const keywords = splitKeywords(line);
  if (keywords.length < 2 || keywords.length > 5) return false;
  if (isCardMetaLine(line)) return false;
  const hasSeparator = /[+|*•·]/.test(line);
  const hasSentencePunctuation = /[.!?;]/.test(line) || /,\s/.test(line);
  const wordCount = wordsOnly(line).length;
  return hasSeparator || (
    wordCount <= 5 &&
    !hasSentencePunctuation &&
    (uppercaseRatio(line) > 0.35 || titleCaseRatio(line) > 0.66)
  );
}

function isKeywordContinuationLine(line = "") {
  const keywords = splitKeywords(line);
  if (keywords.length < 1 || keywords.length > 2) return false;
  if (isCardMetaLine(line)) return false;
  if (/[.!?;,]/.test(line)) return false;
  return uppercaseRatio(line) > 0.35 || titleCaseRatio(line) > 0.66;
}

function findStatCandidates(lines = [], sourcePriority = 1) {
  const labelCenters = findStatLabelCenters(lines);
  if (!labelCenters.length) return [];
  const labelY = Math.min(...labelCenters.map((label) => label.y));
  const candidates = [];

  for (const line of lines) {
    const value = extractStatNumber(line.text);
    if (!value || !line.box) continue;
    const centerX = line.box.x + (line.box.width / 2);
    const centerY = line.box.y + (line.box.height / 2);
    if (centerY >= labelY) continue;
    const nearest = nearestStatLabel(centerX, labelCenters);
    if (!nearest || nearest.distance > 0.18) continue;
    const priority = Number(line.sourcePriority || sourcePriority);
    candidates.push({
      label: nearest.label,
      value,
      confidence: Number(line.confidence || 0),
      score: (priority * 100) + (Number(line.confidence || 0) * 10) - (nearest.distance * 30),
      sourcePriority: priority
    });
  }

  return candidates;
}

function findStatLabelCenters(lines = []) {
  const found = new Map();
  for (const line of lines) {
    if (!line.box) continue;
    const label = statLabelForText(line.text);
    if (!label || found.has(label)) continue;
    found.set(label, {
      label,
      x: line.box.x + (line.box.width / 2),
      y: line.box.y
    });
  }
  if (!found.size) return [];

  return STAT_LABELS.map((label, index) => {
    const existing = found.get(label);
    if (existing) return existing;
    return {
      label,
      x: (index + 0.5) / STAT_LABELS.length,
      y: Math.min(...[...found.values()].map((entry) => entry.y))
    };
  });
}

function nearestStatLabel(centerX, labelCenters) {
  return labelCenters
    .map((label) => ({
      ...label,
      distance: Math.abs(label.x - centerX)
    }))
    .sort((left, right) => left.distance - right.distance)[0] || null;
}

function statLabelForText(text = "") {
  const normalized = String(text || "").toLowerCase().replace(/[^a-z]/g, "");
  return STAT_LABELS.find((label) => normalized === label) || "";
}

function extractStatNumber(text = "") {
  const normalized = normalizeSpaces(text)
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[^0-9]/g, "");
  if (!/^\d{1,2}$/.test(normalized)) return 0;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 && value <= 12 ? value : 0;
}

function consolidateDuplicateShipStats(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const key = duplicateShipKey(entry.details);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const merged = {};
    for (const label of STAT_LABELS) {
      const values = group
        .map((entry) => Number(entry.details.stats?.[label] || 0))
        .filter((value) => value > 0);
      if (!values.length) continue;
      merged[label] = mostCommonNumber(values);
    }

    for (const entry of group) {
      let changed = false;
      for (const label of STAT_LABELS) {
        if (!entry.details.stats[label] && merged[label]) {
          entry.details.stats[label] = merged[label];
          changed = true;
        }
      }
      if (changed) {
        entry.card = buildShipCard(entry.record, entry.details);
      }
    }
  }
}

function duplicateShipKey(details = {}) {
  const title = normalizeSpaces(details.title).toLowerCase();
  const subtitle = normalizeSpaces(details.subtitle).replace(/\s+[a-z]$/i, "").replace(/\s*[-–]+$/g, "").toLowerCase();
  const keywords = (details.keywords || []).map((keyword) => normalizeSpaces(keyword).toLowerCase()).sort().join("|");
  if (!title || !subtitle || !keywords) return "";
  return `${title}::${subtitle}::${keywords}`;
}

function mostCommonNumber(values = []) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] || 0;
}

function buildShipCard(record, details) {
  const title = details.title || `Ship Card ${record.position}`;
  const subtitle = details.subtitle || "Tarot Ship Card";
  const keywords = details.keywords.length ? details.keywords : [subtitle].filter(Boolean);
  const effectSummary = [details.effectTitle, details.effectText].filter(Boolean).join(": ");
  const statSummary = Object.entries(details.stats)
    .filter(([, value]) => value)
    .map(([key, value]) => `${toTitleCase(key)} ${value}`);
  const id = record.id;

  return createItemCard({
    id,
    cardType: "ship_card",
    kind: "ship",
    title,
    name: title,
    status: "active",
    canonStatus: "generated",
    summary: `${title} is a ${subtitle} Ship Card keyed to ${keywords.join(", ") || "fleet play"}.`,
    description: [effectSummary, statSummary.join(", ")].filter(Boolean).join(" "),
    lore: details.flavorText,
    utility: keywords,
    broadGameMechanics: [
      "fleet card",
      "ship loadout",
      "zone effect",
      "tarot-style teaching card",
      ...keywords.map((keyword) => `keyword:${keyword.toLowerCase()}`)
    ],
    tags: [
      "ship",
      "ship-card",
      "tarot-card",
      "dear-papa-card-deck",
      "ships3",
      ...keywords.map((keyword) => slugify(keyword))
    ],
    rank: "ingested",
    quality: {
      rank: "ingested",
      confidence: details.ocr.confidence >= 0.72 ? "soft" : "generated",
      power: Math.max(...Object.values(details.stats), 1),
      complexity: details.effectText ? 3 : 1,
      reuse: keywords.length || 1,
      risk: details.ocr.confidence >= 0.72 ? 1 : 2,
      completeness: cardCompleteness(details)
    },
    locationState: {
      currentSystemName: "Black Horizon",
      currentShipId: id,
      currentShipName: title,
      state: "card-ingested",
      notes: "Tarot-style Ship Card ingested from Dear Papa card-deck run2/ships3."
    },
    connections: {
      shipIds: [id]
    },
    mediaPrompts: {
      heroImage: `Hero image for ${title}, a ${subtitle} tarot-style Hapa Ship Card with ${keywords.join(", ")} as visual doctrine.`,
      twoD: `2D card-library rendering of ${title}; preserve tarot frame, ship silhouette, keywords, fleet effect, and stats.`,
      threeD: `Game-ready 3D model prompt for ${title}: build the ship shown in the card art as a readable Hapa vessel with ${subtitle} design language.`,
      comicPanel: `Comic panel where a crew plays the ${title} Ship Card and its fleet effect changes the zone.`,
      explainerVideo: `Explainer video showing ${title}, its keywords, stat spread, and how its ship effect teaches fleet mechanics.`,
      wikiEntry: `Wiki entry for ${title} Ship Card with OCR text, stats, source video, first frame, and canon status.`,
      negativePrompt: "avoid generic spaceship card, avoid unreadable text, avoid unsupported canon claims"
    },
    sourceRefs: [
      {
        label: "Dear Papa Album card-deck run2 ships3 source video",
        uri: record.source.path,
        confidence: "soft",
        notes: record.source.fileName
      },
      {
        label: "Extracted first frame",
        uri: record.firstFramePath,
        confidence: "soft",
        notes: "Generated by scripts/ingest-ship-cards.mjs"
      },
      {
        label: "Apple Vision OCR",
        uri: record.ocrFramePath,
        confidence: details.ocr.confidence >= 0.72 ? "soft" : "generated",
        notes: `Average confidence ${details.ocr.confidence.toFixed(3)}`
      }
    ],
    mediaAssets: [
      {
        id: `${id}-video`,
        title: `${title} Ship Card Video`,
        type: "video",
        uri: record.videoUri,
        thumbnailUri: record.firstFrameUri,
        mimeType: record.media.mimeType,
        width: record.media.width,
        height: record.media.height,
        tags: ["ship-card", "tarot-card", "source-video", "ships3"],
        confidence: "soft",
        notes: `Symlinked from ${record.source.path}`
      },
      {
        id: `${id}-first-frame`,
        title: `${title} First Frame`,
        type: "image",
        uri: record.firstFrameUri,
        thumbnailUri: record.firstFrameUri,
        mimeType: "image/png",
        width: record.media.width,
        height: record.media.height,
        tags: ["ship-card", "tarot-card", "first-frame", "ships3"],
        confidence: "soft",
        notes: "First frame extracted from source video."
      }
    ],
    shipCard: details,
    history: [
      {
        eventId: `ship-card-ingest-${record.id}`,
        label: "Ingested from ships3 video deck",
        happenedAt: details.ocr.parsedAt,
        notes: `Source: ${record.source.fileName}`
      }
    ]
  });
}

function cardCompleteness(details) {
  const checks = [
    details.title,
    details.subtitle,
    details.keywords.length,
    details.flavorText,
    details.effectTitle,
    details.effectText,
    Object.values(details.stats).some(Boolean),
    details.ocr.rawText
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

async function upsertCards(cards) {
  let existingStore;
  try {
    existingStore = normalizeItemManagerStore(JSON.parse(await readFile(ITEM_STORE_PATH, "utf8")));
  } catch {
    existingStore = normalizeItemManagerStore({ cards: [] });
  }
  const backupName = `item-manager-store.before-ship-card-ingest-${safeTimestamp()}.json`;
  try {
    await writeFile(path.join(BACKUP_DIR, backupName), `${JSON.stringify(existingStore, null, 2)}\n`, "utf8");
  } catch {
    // Backup failure should not prevent a local generated store write.
  }

  const incomingById = new Map(cards.map((card) => [card.id, card]));
  const retained = existingStore.cards.filter((card) => !incomingById.has(card.id));
  const refreshedCards = cards.map((card) => {
    const previous = existingStore.cards.find((item) => item.id === card.id);
    return previous ? createItemCard({ ...card, createdAt: previous.createdAt || card.createdAt }) : card;
  });
  const nextStore = normalizeItemManagerStore({
    ...existingStore,
    cards: [...refreshedCards, ...retained],
    updatedAt: new Date().toISOString()
  });
  await writeFile(ITEM_STORE_PATH, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
}

function emptyOcr(framePath) {
  return {
    path: framePath,
    engine: "apple-vision",
    confidence: 0,
    text: "",
    lines: []
  };
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

function normalizeSpaces(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitKeywords(value = "") {
  const raw = normalizeSpaces(value)
    .replace(/[|*+•·:;]+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ");
  return [...new Set(raw.split(/\s{2,}|\s+-\s+|\s+/)
    .map((part) => normalizeSpaces(part))
    .filter((part) => part.length > 2)
    .filter((part) => !/^(the|and|ark|effect|fleet|speed|morale|supply|influence)$/i.test(part))
    .map(toTitleCase))];
}

function wordsOnly(value = "") {
  return [...String(value || "").matchAll(/\p{L}+/gu)].map((match) => match[0]);
}

function uppercaseRatio(value = "") {
  const letters = wordsOnly(value).join("");
  if (!letters) return 0;
  const upper = [...letters].filter((letter) => letter === letter.toUpperCase()).length;
  return upper / letters.length;
}

function titleCaseRatio(value = "") {
  const words = wordsOnly(value).filter((word) => word.length > 1);
  if (!words.length) return 0;
  const titled = words.filter((word) => /^\p{Lu}/u.test(word));
  return titled.length / words.length;
}

function toTitleCase(value = "") {
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/\b\p{L}/gu, (match) => match.toUpperCase());
}

function cleanHeading(value = "") {
  return normalizeSpaces(value)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9\s'-]+$/g, "")
    .trim();
}

function cleanSubtitleHeading(value = "") {
  return cleanHeading(value).replace(/\s+[a-z]$/g, "").trim();
}

function average(values = []) {
  const nums = values.filter((value) => Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
