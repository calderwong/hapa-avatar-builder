#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, copyFile, lstat, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createItemCard, normalizeItemManagerStore } from "../src/domain/item.js";
import { slugify } from "../src/domain/avatar.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_DIR = "/Users/calderwong/comics/Dear Papa - Album/card-deck/run2/ships3/Mimi's Card Shop";
const DATA_DIR = path.join(ROOT, "data");
const ITEM_STORE_PATH = process.env.HAPA_ITEM_STORE || path.join(DATA_DIR, "item-manager-store.json");
const SUBSCRIBER_DIR = process.env.HAPA_SUBSCRIBER_DIR || path.join(DATA_DIR, "subscribers");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(DATA_DIR, "media");
const MIMI_MEDIA_DIR = path.join(MEDIA_DIR, "mimi-card-shop");
const INGEST_DIR = path.join(DATA_DIR, "mimi-card-shop-ingest");
const OCR_DIR = path.join(INGEST_DIR, "ocr");
const FRAME_DIR = path.join(INGEST_DIR, "frames");
const MANIFEST_PATH = path.join(INGEST_DIR, "manifest.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const OCR_SCRIPT = path.join(ROOT, "scripts", "vision-ocr.swift");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki"];
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
  const existingStore = await readItemStore();
  const knownSources = collectKnownSourcePaths(existingStore);
  const files = await listMediaFiles(sourceDir);
  const incoming = files
    .filter((file) => refresh || !knownSources.has(file.path))
    .slice(0, limit > 0 ? limit : files.length);
  const images = incoming.filter((file) => file.kind === "image");
  const videos = incoming.filter((file) => file.kind === "video");

  const records = [];
  for (let index = 0; index < images.length; index += 1) {
    records.push(await prepareImageRecord(images[index], index + 1, images.length));
  }
  for (let index = 0; index < videos.length; index += 1) {
    records.push(await prepareVideoRecord(videos[index], index + 1, videos.length));
  }

  const ocrRecords = await readOrRunOcr(records);
  for (const record of records) {
    record.ocr = ocrRecords.get(record.ocrPath) || emptyOcr(record.ocrPath);
    record.details = parseTarotDetails(record.ocr, record);
    if (verbose) console.log(`[mimi] ${record.kind} ${record.id} ${record.details.title}`);
  }

  const grouped = groupRecordsIntoCards(records);
  const cards = grouped.map((group, index) => buildMimiTarotCard(group, index + 1));
  const manifest = buildManifest({
    files,
    incoming,
    records,
    grouped,
    cards
  });

  if (!dryRun) {
    await upsertCards(existingStore, cards);
    await appendSubscriberEvent("items.mimi-card-shop-ingested", {
      itemStorePath: ITEM_STORE_PATH,
      manifestPath: MANIFEST_PATH,
      sourceDir,
      newCards: cards.length,
      sourceFiles: incoming.length
    });
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    sourceDir,
    totalMediaFiles: files.length,
    skippedKnownFiles: files.length - incoming.length,
    newImages: images.length,
    newVideos: videos.length,
    cardsPrepared: cards.length,
    itemStoreUpdated: !dryRun,
    manifestPath: MANIFEST_PATH,
    sampleCards: manifest.cards.slice(0, 10)
  }, null, 2));
}

async function ensureRuntime() {
  await mkdir(MIMI_MEDIA_DIR, { recursive: true });
  await mkdir(OCR_DIR, { recursive: true });
  await mkdir(FRAME_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });
}

async function readItemStore() {
  try {
    return normalizeItemManagerStore(JSON.parse(await readFile(ITEM_STORE_PATH, "utf8")));
  } catch {
    return normalizeItemManagerStore({ cards: [] });
  }
}

function collectKnownSourcePaths(store) {
  const paths = new Set();
  for (const card of store.cards || []) {
    for (const ref of card.sourceRefs || []) {
      if (ref.uri && path.isAbsolute(ref.uri)) paths.add(ref.uri);
    }
    const tarotOcr = card.tarotCard?.ocr || {};
    for (const value of [
      ...(tarotOcr.sourceImagePaths || []),
      ...(tarotOcr.sourceVideoPaths || [])
    ]) {
      if (value && path.isAbsolute(value)) paths.add(value);
    }
    const shipVideoPath = card.shipCard?.ocr?.sourceVideoPath;
    if (shipVideoPath && path.isAbsolute(shipVideoPath)) paths.add(shipVideoPath);
  }
  return paths;
}

async function listMediaFiles(dir) {
  const all = [];
  await walk(dir, all);
  return all
    .map((filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const kind = IMAGE_EXTENSIONS.has(ext) ? "image" : VIDEO_EXTENSIONS.has(ext) ? "video" : "";
      return kind ? { kind, path: filePath, ext } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(filePath, out);
    } else if (entry.isFile()) {
      out.push(filePath);
    }
  }
}

async function prepareImageRecord(file, position, total) {
  const meta = await stat(file.path);
  const id = sourceRecordId(file.path, meta);
  const ext = normalizeImageExtension(file.ext);
  const mediaName = `${id}${ext}`;
  const linkedPath = path.join(MIMI_MEDIA_DIR, mediaName);
  await ensureSymlink(file.path, linkedPath);
  const dimensions = await probeImage(file.path);
  return {
    id,
    kind: "image",
    position,
    total,
    source: {
      path: file.path,
      fileName: path.basename(file.path),
      baseName: path.basename(file.path, file.ext),
      size: meta.size,
      modifiedAt: meta.mtime.toISOString()
    },
    linkedPath,
    mediaUri: `/media/mimi-card-shop/${mediaName}`,
    posterUri: `/media/mimi-card-shop/${mediaName}`,
    ocrPath: linkedPath,
    dimensions
  };
}

async function prepareVideoRecord(file, position, total) {
  const meta = await stat(file.path);
  const id = sourceRecordId(file.path, meta);
  const ext = file.ext || ".mp4";
  const mediaName = `${id}${ext}`;
  const firstFrameName = `${id}-first.png`;
  const ocrFrameName = `${id}-ocr.png`;
  const linkedPath = path.join(MIMI_MEDIA_DIR, mediaName);
  const firstFramePath = path.join(MIMI_MEDIA_DIR, firstFrameName);
  const ocrPath = path.join(FRAME_DIR, ocrFrameName);
  await ensureSymlink(file.path, linkedPath);
  await extractFrame(file.path, firstFramePath, []);
  await extractFrame(file.path, ocrPath, [
    "-vf",
    "scale=iw*2:ih*2,format=gray,eq=contrast=1.55:brightness=0.02,unsharp=5:5:1.0"
  ]);
  const media = await probeVideo(file.path);
  return {
    id,
    kind: "video",
    position,
    total,
    source: {
      path: file.path,
      fileName: path.basename(file.path),
      baseName: path.basename(file.path, file.ext),
      size: meta.size,
      modifiedAt: meta.mtime.toISOString()
    },
    linkedPath,
    firstFramePath,
    mediaUri: `/media/mimi-card-shop/${mediaName}`,
    posterUri: `/media/mimi-card-shop/${firstFrameName}`,
    ocrPath,
    dimensions: {
      width: media.width,
      height: media.height,
      duration: media.duration,
      mimeType: media.mimeType
    }
  };
}

async function ensureSymlink(target, linkPath) {
  if (refresh) await rm(linkPath, { force: true });
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
      // Extract below.
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
      mimeType: mimeTypeForPath(videoPath)
    };
  } catch {
    return { width: 0, height: 0, duration: 0, mimeType: mimeTypeForPath(videoPath) };
  }
}

async function probeImage(imagePath) {
  try {
    const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", imagePath], {
      maxBuffer: 1024 * 1024
    });
    return {
      width: Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0),
      height: Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0),
      mimeType: mimeTypeForPath(imagePath)
    };
  } catch {
    return { width: 0, height: 0, mimeType: mimeTypeForPath(imagePath) };
  }
}

async function readOrRunOcr(records) {
  const byPath = new Map();
  const pending = [];
  for (const record of records) {
    const cachePath = path.join(OCR_DIR, `${record.id}.json`);
    if (!refresh) {
      try {
        const cached = JSON.parse(await readFile(cachePath, "utf8"));
        byPath.set(record.ocrPath, cached);
        continue;
      } catch {
        // OCR below.
      }
    }
    pending.push({ record, cachePath });
  }
  const batchSize = 10;
  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const { stdout } = await execFileAsync("swift", [OCR_SCRIPT, ...batch.map((entry) => entry.record.ocrPath)], {
      maxBuffer: 1024 * 1024 * 24
    });
    const results = JSON.parse(stdout);
    for (const result of results) {
      const entry = batch.find((item) => item.record.ocrPath === result.path);
      if (!entry) continue;
      await writeFile(entry.cachePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      byPath.set(entry.record.ocrPath, result);
    }
  }
  return byPath;
}

function parseTarotDetails(ocr, record) {
  const lines = normalizeOcrLines(ocr.lines || []);
  const textLines = lines.map((line) => line.text).filter(Boolean);
  const rawText = textLines.join("\n");
  const titleIndex = findTitleIndex(textLines);
  const title = titleIndex >= 0 ? toTitleCase(cleanHeading(textLines[titleIndex])) : fallbackTitle(record);
  const effectIndex = textLines.findIndex((line) => /effect|mechanic|ability|use|when played/i.test(line));
  const subtitle = findSubtitle(textLines, titleIndex, effectIndex);
  const keywordBlock = findKeywordBlock(lines, titleIndex, effectIndex, subtitle);
  const keywords = keywordBlock.keywords.length ? keywordBlock.keywords : inferKeywords(rawText, title, subtitle);
  const tarotNumber = textLines.find((line) => /^[IVXLCDM]{1,8}$/i.test(line.trim())) || "";
  const effectTitle = effectIndex >= 0 ? toTitleCase(cleanHeading(textLines[effectIndex])) : "";
  const effectText = findEffectText(textLines, effectIndex);
  const flavorText = findFlavorText(textLines, keywordBlock, effectIndex, titleIndex, subtitle);
  const stats = parseStats(textLines);
  const confidence = Number(ocr.confidence || average(lines.map((line) => line.confidence)) || 0);
  const mainType = classifyMainType({
    rawText,
    title,
    subtitle,
    keywords,
    record
  });

  return {
    tarotNumber,
    title,
    subtitle,
    archetype: subtitle,
    keywords,
    flavorText,
    effectTitle,
    effectText,
    stats,
    mainType,
    confidence,
    rawText,
    lines
  };
}

function groupRecordsIntoCards(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = pairingKey(record);
    const group = byKey.get(key) || { key, records: [] };
    group.records.push(record);
    byKey.set(key, group);
  }
  return [...byKey.values()]
    .map((group) => {
      const best = bestDetails(group.records);
      const imageRecords = group.records.filter((record) => record.kind === "image");
      const videoRecords = group.records.filter((record) => record.kind === "video");
      return {
        ...group,
        details: mergeDetails(group.records, best),
        imageRecords,
        videoRecords
      };
    })
    .sort((a, b) => compareText(a.details.title, b.details.title) || a.key.localeCompare(b.key));
}

function buildMimiTarotCard(group, sequence) {
  const details = group.details;
  const title = details.title || `Mimi Tarot Card ${sequence}`;
  const mainType = details.mainType || "hapa_tarot_card";
  const cardType = mainType;
  const kind = kindForCardType(cardType);
  const id = `mimi-tarot-${slugify(title) || "card"}-${stableHash(group.key).slice(0, 8)}`;
  const imageAssets = group.imageRecords.map((record, index) => mediaAssetForRecord(record, id, index));
  const videoAssets = group.videoRecords.map((record, index) => mediaAssetForRecord(record, id, index));
  const fallbackFrameAssets = group.videoRecords
    .filter((record) => !group.imageRecords.length)
    .map((record, index) => frameAssetForVideo(record, id, index));
  const mediaAssets = [...videoAssets, ...imageAssets, ...fallbackFrameAssets];
  const primaryImage = imageAssets[0] || fallbackFrameAssets[0] || null;
  const primaryVideo = videoAssets[0] || null;
  const sourcePaths = group.records.map((record) => record.source.path);
  const imagePaths = group.imageRecords.map((record) => record.source.path);
  const videoPaths = group.videoRecords.map((record) => record.source.path);
  const ocrLines = group.records.flatMap((record) =>
    (record.details.lines || []).map((line) => ({
      ...line,
      sourceId: record.id,
      sourceKind: record.kind,
      sourcePath: record.source.path
    }))
  );
  const ocrRaw = group.records
    .map((record) => record.details.rawText)
    .filter(Boolean)
    .join("\n\n---\n\n");

  return createItemCard({
    id,
    cardType,
    kind,
    title,
    name: title,
    status: "active",
    canonStatus: "generated",
    summary: `${title} is a ${typeLabel(mainType)} from Mimi's Card Shop keyed to ${details.keywords.join(", ") || "Hapa tarot play"}.`,
    description: [details.effectText, details.flavorText].filter(Boolean).join(" "),
    lore: details.flavorText || details.rawText,
    utility: details.keywords,
    broadGameMechanics: [
      "tarot draw pile",
      "avatar deck choice",
      "Dear Papa card link",
      broadMechanicForType(mainType),
      ...details.keywords.map((keyword) => `keyword:${keyword.toLowerCase()}`)
    ],
    tags: [
      "tarot-card",
      "mimi-card-shop",
      "dear-papa-card-deck",
      mainType,
      ...details.keywords.map((keyword) => slugify(keyword))
    ],
    rank: "ingested",
    quality: {
      rank: "ingested",
      confidence: details.confidence >= 0.72 ? "soft" : "generated",
      power: Math.max(...Object.values(details.stats || {}), 1),
      complexity: details.effectText ? 3 : 2,
      reuse: Math.max(details.keywords.length, 1),
      risk: details.confidence >= 0.72 ? 1 : 2,
      completeness: cardCompleteness(details, group)
    },
    locationState: {
      currentSystemName: "Black Horizon",
      state: "card-ingested",
      notes: "Tarot-style card ingested from Dear Papa card-deck run2/ships3/Mimi's Card Shop."
    },
    connections: {},
    mediaPrompts: {
      heroImage: `Hero image for ${title}, a ${typeLabel(mainType)} tarot card with ${details.keywords.join(", ")} as visual doctrine.`,
      twoD: `2D library rendering of ${title}; preserve card frame, title, keywords, lore, and any OCR-readable effect text.`,
      threeD: `Game-ready 3D spatial card for ${title}: make it usable as a floating Tarot Draw node with connector lines.`,
      comicPanel: `Comic panel where an avatar draws ${title} and explains why it belongs in their deck.`,
      explainerVideo: `Explainer video showing ${title}, its type pile, OCR text, linked images/videos, and Dear Papa song association.`,
      wikiEntry: `Wiki entry for ${title} with OCR text, media links, card type, attribution, mechanics, lore, and avatar/song picks.`,
      negativePrompt: "avoid unsupported hard-canon claims, avoid generic trading card, avoid unreadable tiny text"
    },
    sourceRefs: sourcePaths.map((sourcePath) => ({
      label: "Mimi's Card Shop source media",
      uri: sourcePath,
      confidence: "soft",
      notes: path.basename(sourcePath)
    })),
    mediaAssets,
    tarotCard: {
      schemaVersion: "hapa.tarot-card-details.v1",
      mainType,
      tarotNumber: details.tarotNumber,
      title,
      subtitle: details.subtitle,
      archetype: details.archetype,
      keywords: details.keywords,
      flavorText: details.flavorText,
      effectTitle: details.effectTitle,
      effectText: details.effectText,
      catalog: {
        collectionId: "mimi-card-shop",
        collectionTitle: "Mimi's Card Shop",
        family: "Dear Papa Tarot",
        typeLabel: typeLabel(mainType),
        sequence,
        sourceFolder: sourceDir,
        sourceHash: stableHash(sourcePaths.join("|")),
        pairingKey: group.key,
        confidence: details.confidence >= 0.72 ? "soft" : "generated"
      },
      attribution: {
        author: "Calder",
        shop: "Mimi's Card Shop",
        albumTitle: "Dear Papa",
        rightsStatus: "operator_authored_hapa_creative_commons",
        sourceTool: inferSourceTool(group.records),
        sourcePaths,
        notes: "Ingested locally from Mimi's Card Shop with Apple Vision OCR over images and video first frames."
      },
      mechanics: {
        broadGameMechanic: broadMechanicForType(mainType),
        deckUse: `Can be drawn from the ${typeLabel(mainType)} pile and added to avatar decks when it matches canon, lore, objectives, or relationships.`,
        surfaceUse: "Can be placed on the Tarot Draw surface as a spatial card/node with visible links to avatar and song context.",
        relationshipUse: relationshipUseForType(mainType, details),
        skillUse: skillUseForType(mainType, details),
        effects: effectListForType(mainType, details),
        limits: ["Generated OCR interpretation must stay soft canon until human review."]
      },
      lore: {
        summary: loreSummaryForCard(title, mainType, details),
        canonStatus: "generated",
        characterHooks: characterHooks(details),
        relationshipHooks: relationshipHooks(details),
        protocolTeaching: protocolTeachingForType(mainType, details),
        futureSeed: futureSeedForType(mainType, details)
      },
      mediaLinks: [
        {
          id: `${id}-primary-link`,
          imageAssetId: primaryImage?.id || "",
          videoAssetId: primaryVideo?.id || "",
          imageUri: primaryImage?.uri || "",
          videoUri: primaryVideo?.uri || "",
          posterUri: primaryVideo?.thumbnailUri || primaryImage?.thumbnailUri || "",
          confidence: primaryImage && primaryVideo ? "soft" : "generated",
          reason: primaryImage && primaryVideo
            ? "Linked because OCR/title grouping placed image and video under the same Tarot card identity."
            : "Single-media card; first frame or still image is the visual representation."
        }
      ],
      ocr: {
        engine: "apple-vision",
        confidence: details.confidence,
        rawText: ocrRaw,
        lines: ocrLines,
        parsedAt: new Date().toISOString(),
        sourceImagePaths: imagePaths,
        sourceVideoPaths: videoPaths,
        sourceFramePaths: group.videoRecords.map((record) => record.ocrPath)
      }
    },
    shipCard: cardType === "ship_card" ? {
      schemaVersion: "hapa.ship-card-details.v1",
      tarotNumber: details.tarotNumber,
      title,
      subtitle: details.subtitle,
      archetype: details.archetype,
      keywords: details.keywords,
      flavorText: details.flavorText,
      effectTitle: details.effectTitle,
      effectText: details.effectText,
      stats: details.stats,
      ocr: {
        engine: "apple-vision",
        confidence: details.confidence,
        rawText: ocrRaw,
        lines: ocrLines,
        parsedAt: new Date().toISOString(),
        sourceVideoPath: videoPaths[0] || "",
        sourceFramePath: group.videoRecords[0]?.ocrPath || primaryImage?.uri || ""
      }
    } : null,
    history: [
      {
        eventId: `mimi-card-shop-ingest-${id}`,
        label: "Ingested from Mimi's Card Shop",
        happenedAt: new Date().toISOString(),
        notes: `${group.records.length} source media records linked into ${title}.`
      }
    ]
  });
}

function mediaAssetForRecord(record, cardId, index) {
  return {
    id: `${cardId}-${record.kind}-${index + 1}`,
    title: `${record.details.title || record.source.baseName} ${record.kind === "video" ? "Video" : "Image"}`,
    type: record.kind,
    uri: record.mediaUri,
    thumbnailUri: record.posterUri,
    mimeType: record.dimensions.mimeType || mimeTypeForPath(record.source.path),
    width: Number(record.dimensions.width || 0),
    height: Number(record.dimensions.height || 0),
    tags: ["tarot-card", "mimi-card-shop", record.kind],
    confidence: "soft",
    notes: `Symlinked from ${record.source.path}`
  };
}

function frameAssetForVideo(record, cardId, index) {
  return {
    id: `${cardId}-first-frame-${index + 1}`,
    title: `${record.details.title || record.source.baseName} First Frame`,
    type: "image",
    uri: record.posterUri,
    thumbnailUri: record.posterUri,
    mimeType: "image/png",
    width: Number(record.dimensions.width || 0),
    height: Number(record.dimensions.height || 0),
    tags: ["tarot-card", "mimi-card-shop", "first-frame"],
    confidence: "soft",
    notes: `First frame extracted from ${record.source.path}`
  };
}

async function upsertCards(existingStore, cards) {
  const backupName = `item-manager-store.before-mimi-card-shop-ingest-${safeTimestamp()}.json`;
  await writeFile(path.join(BACKUP_DIR, backupName), `${JSON.stringify(existingStore, null, 2)}\n`, "utf8");
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

function buildManifest({ files, incoming, records, grouped, cards }) {
  return {
    schemaVersion: "hapa.mimi-card-shop-ingest.v1",
    sourceDir,
    generatedAt: new Date().toISOString(),
    dryRun,
    counts: {
      totalMediaFiles: files.length,
      newSourceFiles: incoming.length,
      imageRecords: records.filter((record) => record.kind === "image").length,
      videoRecords: records.filter((record) => record.kind === "video").length,
      tarotCards: cards.length
    },
    cards: cards.map((card) => ({
      id: card.id,
      title: card.title,
      cardType: card.cardType,
      kind: card.kind,
      tarotNumber: card.tarotCard?.tarotNumber || "",
      keywords: card.tarotCard?.keywords || [],
      confidence: card.tarotCard?.ocr?.confidence || 0,
      imageCount: (card.mediaAssets || []).filter((asset) => asset.type === "image").length,
      videoCount: (card.mediaAssets || []).filter((asset) => asset.type === "video").length,
      sourcePaths: card.tarotCard?.attribution?.sourcePaths || []
    })),
    records: records.map((record) => ({
      id: record.id,
      kind: record.kind,
      sourcePath: record.source.path,
      mediaUri: record.mediaUri,
      posterUri: record.posterUri,
      title: record.details.title,
      mainType: record.details.mainType,
      confidence: record.details.confidence,
      ocrLineCount: record.details.lines.length
    })),
    pairings: grouped.map((group) => ({
      pairingKey: group.key,
      title: group.details.title,
      mainType: group.details.mainType,
      imageIds: group.imageRecords.map((record) => record.id),
      videoIds: group.videoRecords.map((record) => record.id)
    }))
  };
}

async function appendSubscriberEvent(action, payload = {}) {
  const now = new Date().toISOString();
  const event = {
    schemaVersion: "hapa.subscriber-registration.v1",
    id: `subscriber-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    action,
    source: "hapa-avatar-builder",
    at: now,
    subscribers: SUBSCRIBERS,
    payload,
    items: {
      atlasEntityId: "hapa-items:item-manager",
      schemaVersion: "hapa.item-manager-store.v1",
      sourcePath: ITEM_STORE_PATH,
      manifestPath: MANIFEST_PATH
    }
  };
  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
  await writeFile(path.join(SUBSCRIBER_DIR, "latest.json"), `${JSON.stringify(event, null, 2)}\n`, "utf8");
  await writeFile(path.join(SUBSCRIBER_DIR, "latest-summary.json"), `${JSON.stringify({
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    action: event.action,
    at: event.at,
    subscribers: event.subscribers,
    itemStorePath: ITEM_STORE_PATH,
    manifestPath: MANIFEST_PATH
  }, null, 2)}\n`, "utf8");
}

function pairingKey(record) {
  const details = record.details || {};
  const title = normalizeSpaces(details.title).toLowerCase();
  const subtitle = normalizeSpaces(details.subtitle).toLowerCase();
  if (title && !/^mimi tarot card|^chatgpt image|^grok[-_ ]/i.test(title)) {
    return `${details.mainType || "hapa_tarot_card"}::${title}::${subtitle}`;
  }
  return `${record.kind}::${record.id}`;
}

function bestDetails(records) {
  return [...records].sort((a, b) =>
    (b.details.confidence || 0) - (a.details.confidence || 0) ||
    (b.details.rawText || "").length - (a.details.rawText || "").length
  )[0]?.details || {};
}

function mergeDetails(records, best) {
  const keywords = unique(records.flatMap((record) => record.details.keywords || []));
  const rawText = records.map((record) => record.details.rawText).filter(Boolean).join("\n\n");
  return {
    ...best,
    keywords: keywords.length ? keywords : best.keywords || [],
    rawText,
    confidence: average(records.map((record) => Number(record.details.confidence || 0))),
    stats: mergeStats(records.map((record) => record.details.stats || {}))
  };
}

function mergeStats(statsList) {
  const merged = {};
  for (const label of STAT_LABELS) {
    const values = statsList.map((stats) => Number(stats[label] || 0)).filter((value) => value > 0);
    merged[label] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  }
  return merged;
}

function findTitleIndex(lines) {
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      if (/^[IVXLCDM]{1,8}$/i.test(line.trim())) return false;
      if (/effect|mechanic|speed|morale|supply|influence|card type/i.test(line)) return false;
      if (/\d{3,}/.test(line)) return false;
      const words = wordsOnly(line);
      if (words.length < 1 || words.length > 7) return false;
      return uppercaseRatio(line) > 0.48 || titleCaseRatio(line) > 0.66 || /^the\s+/i.test(line);
    });
  return candidates[0]?.index ?? -1;
}

function findSubtitle(lines, titleIndex, effectIndex) {
  if (titleIndex < 0) return "";
  const stop = effectIndex >= 0 ? effectIndex : Math.min(lines.length, titleIndex + 6);
  for (let index = titleIndex + 1; index < stop; index += 1) {
    const line = lines[index];
    if (!line || /effect|mechanic|speed|morale|supply|influence/i.test(line)) continue;
    if (/^[IVXLCDM]{1,8}$/i.test(cleanHeading(line))) continue;
    const clean = cleanSubtitleHeading(line);
    const words = wordsOnly(clean);
    if (words.length >= 1 && words.length <= 5 && (uppercaseRatio(clean) > 0.42 || titleCaseRatio(clean) > 0.65)) {
      return toTitleCase(clean);
    }
  }
  return "";
}

function findKeywordBlock(lines, titleIndex, effectIndex, subtitle = "") {
  const entries = lines.map((line, index) => ({ ...line, index }));
  const start = Math.max(0, titleIndex + 1);
  const stop = effectIndex >= 0 ? effectIndex : entries.length;
  let best = { start: -1, end: -1, keywords: [], score: -Infinity };
  for (let index = start; index < stop; index += 1) {
    const entry = entries[index];
    const line = entry.text;
    if (isCardMetaLine(line, subtitle)) continue;
    if (!isKeywordLine(line)) continue;
    const keywords = splitKeywords(line);
    let end = index;
    for (let next = index + 1; next < stop; next += 1) {
      const nextLine = entries[next].text;
      if (!isKeywordContinuationLine(nextLine)) break;
      keywords.push(...splitKeywords(nextLine));
      end = next;
    }
    const uniqueKeywords = unique(keywords);
    const score = uniqueKeywords.length + (/[+|*]/.test(line) ? 2 : 0);
    if (uniqueKeywords.length >= 2 && score > best.score) best = { start: index, end, keywords: uniqueKeywords, score };
  }
  return best;
}

function findFlavorText(lines, keywordBlock, effectIndex, titleIndex, subtitle = "") {
  const start = keywordBlock.end >= 0 ? keywordBlock.end + 1 : Math.max(0, titleIndex + 1);
  const stop = effectIndex >= 0 ? effectIndex : lines.length;
  return lines
    .slice(start, stop)
    .filter((line) => {
      if (isCardMetaLine(line, subtitle)) return false;
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
    if (/^[0-9\s]+$/.test(line) && wordsOnly(line).length === 0) break;
    effectLines.push(line);
  }
  return effectLines.join(" ").trim();
}

function parseStats(lines = []) {
  const joined = lines.join(" ");
  const stats = Object.fromEntries(STAT_LABELS.map((label) => [label, 0]));
  for (const label of STAT_LABELS) {
    const match = joined.match(new RegExp(`${label}[^0-9]{0,12}(\\d{1,2})`, "i"));
    if (match) stats[label] = clampStat(match[1]);
  }
  if (Object.values(stats).every((value) => value === 0)) {
    const numbers = [...joined.matchAll(/(^|[^A-Za-z0-9])(\d{1,2})(?=$|[^A-Za-z0-9])/g)]
      .map((match) => clampStat(match[2]))
      .filter(Boolean)
      .slice(-4);
    STAT_LABELS.forEach((label, index) => {
      stats[label] = numbers[index] || 0;
    });
  }
  return stats;
}

function classifyMainType({ rawText = "", title = "", subtitle = "", keywords = [], record = {} }) {
  const text = `${title} ${subtitle} ${keywords.join(" ")} ${rawText} ${record.source?.fileName || ""}`.toLowerCase();
  if (/\bspell\s+card\b|\bspell\s+type\b|\btype\s*:\s*spell\b|\bhapa-spl\b/.test(text)) return "spell_card";
  if (/\bgarden\s+type\b|\bgarden\s+card\b|\bmajor\s+arcana\s*\/+\s*garden\b|\bgardens\s*\/\/\s*civilizations\b/.test(text)) return "garden_card";
  if (/\bitem\s+card\b|\bitem\s+type\b|\btype\s*:\s*item\b|\bhapa-itm\b/.test(text)) return "item_card";
  if (/\brelationship|bond|kinship|trust|loyalty|alliance|rival|family|friend|counterpoint\b/.test(text)) return "relationship_tarot_card";
  if (/\bskill|technique|training|craft|ability|tool|move|practice|competence\b/.test(text)) return "skill_card";
  if (/\bprotocol|rule|governance|standard|ritual|contract|canon|auth|verification\b/.test(text)) return "protocol_card";
  if (/\bnode|atlas|second brain|wiki|registry|console|server|station\b/.test(text)) return "node_card";
  if (/\bship|vessel|fleet|cruiser|carrier|frigate|shuttle|hss\b/.test(text)) return "ship_card";
  if (/\bavatar|agent|red|blue|green|mimi|falka|thor|dancer|leo|mara|tiny\b/.test(text)) return "avatar_tarot_card";
  if (/\bsong|album|lyric|dear papa|track|sings|voice\b/.test(text)) return "song_tarot_card";
  if (/\blore|canon|memory|chapter|story|world\b/.test(text)) return "lore_tarot_card";
  return "hapa_tarot_card";
}

function inferKeywords(rawText, title, subtitle) {
  const source = `${title} ${subtitle} ${rawText}`;
  const candidates = [
    "relationship", "skill", "protocol", "memory", "canon", "song", "deck", "future", "trust",
    "source", "repair", "signal", "pressure", "garden", "node", "ship", "lore", "choice"
  ];
  return candidates.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(source)).slice(0, 4).map(toTitleCase);
}

function isCardMetaLine(line = "", subtitle = "") {
  const clean = cleanHeading(line);
  if (!clean) return true;
  if (/^[IVXLCDM]{1,8}$/i.test(clean)) return true;
  if (subtitle && toTitleCase(clean) === subtitle) return true;
  return /effect|mechanic|speed|morale|supply|influence/i.test(clean);
}

function isKeywordLine(line = "") {
  const keywords = splitKeywords(line);
  if (keywords.length < 2 || keywords.length > 6) return false;
  if (isCardMetaLine(line)) return false;
  const hasSeparator = /[+|*]/.test(line);
  const hasSentencePunctuation = /[.!?;]/.test(line) || /,\s/.test(line);
  const wordCount = wordsOnly(line).length;
  return hasSeparator || (
    wordCount <= 7 &&
    !hasSentencePunctuation &&
    (uppercaseRatio(line) > 0.35 || titleCaseRatio(line) > 0.66)
  );
}

function isKeywordContinuationLine(line = "") {
  const keywords = splitKeywords(line);
  if (keywords.length < 1 || keywords.length > 3) return false;
  if (isCardMetaLine(line)) return false;
  if (/[.!?;,]/.test(line)) return false;
  return uppercaseRatio(line) > 0.35 || titleCaseRatio(line) > 0.66;
}

function splitKeywords(value = "") {
  const raw = normalizeSpaces(value)
    .replace(/[|*+:/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ");
  return unique(raw.split(/\s{2,}|\s+-\s+|\s+/)
    .map((part) => normalizeSpaces(part))
    .filter((part) => part.length > 2)
    .filter((part) => !/^(the|and|ark|effect|fleet|speed|morale|supply|influence|card|tarot)$/i.test(part))
    .map(toTitleCase));
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

function fallbackTitle(record) {
  const name = record.source.baseName
    .replace(/^grok[-_ ]/i, "")
    .replace(/^chatgpt image/i, "Mimi Tarot")
    .replace(/[-_]+/g, " ");
  return toTitleCase(cleanHeading(name || `Mimi Tarot Card ${record.position}`));
}

function typeLabel(mainType = "") {
  return toTitleCase(String(mainType || "hapa_tarot_card").replace(/_/g, " "));
}

function broadMechanicForType(mainType = "") {
  if (mainType === "spell_card") return "Play as an activated spell node with cost, risk, upright/inverted outcomes, and visible ritual constraints.";
  if (mainType === "garden_card") return "Play as a living place/ecology card that anchors habitat, cultivation, civic order, and long-horizon resource loops.";
  if (mainType === "item_card") return "Play as an equipment/artifact card with utility, maintenance state, owner history, and scene-facing consequences.";
  if (mainType === "relationship_tarot_card") return "Play as a relationship node that reveals trust, tension, loyalty, and future scene pressure.";
  if (mainType === "skill_card") return "Play as a skill node that teaches a usable avatar move, training habit, or utility function.";
  if (mainType === "protocol_card") return "Play as a protocol node that teaches a rule, boundary, verification step, or governance function.";
  if (mainType === "song_tarot_card") return "Play as a song-vibe node that binds a Dear Papa track to avatar memory and deck mood.";
  if (mainType === "ship_card") return "Play as a fleet/loadout node that moves avatars, scenes, and operational context.";
  if (mainType === "avatar_tarot_card") return "Play as an avatar identity node that shapes backstory, objective, and future chapter pressure.";
  if (mainType === "node_card") return "Play as an infrastructure node that teaches how a Hapa app or registry supports the protocol.";
  return "Play as a Hapa Tarot node that turns image/video lore into deck, surface, and Genesis context.";
}

function relationshipUseForType(mainType, details) {
  if (mainType === "relationship_tarot_card") return `Use ${details.title} to open a relationship scene around ${details.keywords.join(", ") || "trust and tension"}.`;
  if (mainType === "spell_card") return `Use ${details.title} when a spell changes trust, protection, command, grief, or ritual pressure between avatars.`;
  if (mainType === "garden_card") return `Use ${details.title} when a relationship needs a shared place, sanctuary, obligation, or ecology to become real.`;
  if (mainType === "item_card") return `Use ${details.title} when an item carries memory, care, trust, inheritance, repair, or burden between avatars.`;
  return `Use ${details.title} when its keywords change how an avatar relates to another person, node, or future self.`;
}

function skillUseForType(mainType, details) {
  if (mainType === "skill_card") return `Use ${details.title} as an explicit skill/training card.`;
  if (mainType === "spell_card") return `Use ${details.title} as an activated spell only when its cost, focus, duration, and limit are visible.`;
  if (mainType === "garden_card") return `Use ${details.title} as a place-based capability when the avatar must cultivate, protect, repair, or govern a living system.`;
  if (mainType === "item_card") return `Use ${details.title} as a concrete tool when an avatar needs gear, craft, repair, fabrication, or field support.`;
  return `Use ${details.title} as a supporting utility only when its mechanic is visible in the avatar's canon.`;
}

function effectListForType(mainType, details) {
  const effects = [broadMechanicForType(mainType)];
  if (details.effectText) effects.push(details.effectText);
  if (details.keywords.length) effects.push(`Keyword focus: ${details.keywords.join(", ")}.`);
  return effects;
}

function loreSummaryForCard(title, mainType, details) {
  const keywordText = details.keywords.length ? ` It carries ${details.keywords.join(", ")} as its main teaching signals.` : "";
  return `${title} enters Hapa as a ${typeLabel(mainType)} discovered through Mimi's Card Shop OCR.${keywordText} Its canon status is generated until a human promotes it.`;
}

function characterHooks(details) {
  return unique([
    ...(details.keywords || []).slice(0, 4),
    details.subtitle,
    details.effectTitle
  ].filter(Boolean));
}

function relationshipHooks(details) {
  return (details.keywords || [])
    .filter((keyword) => /trust|bond|kinship|loyalty|tension|source|repair|choice|memory/i.test(keyword))
    .slice(0, 5);
}

function protocolTeachingForType(mainType, details) {
  if (mainType === "protocol_card") return `${details.title} teaches a protocol boundary or verification move that must remain source-attributed.`;
  if (mainType === "relationship_tarot_card") return `${details.title} teaches that relationship state is operational data, not decoration.`;
  if (mainType === "skill_card") return `${details.title} teaches that skill cards need use, limits, and training context.`;
  if (mainType === "spell_card") return `${details.title} teaches that power needs declared cost, consent, provenance, and rollback paths before it is used.`;
  if (mainType === "garden_card") return `${details.title} teaches that Hapa spaces are cultivated systems: every choice seeds habitat, memory, and responsibility.`;
  if (mainType === "item_card") return `${details.title} teaches that tools have provenance, condition, affordances, and stewardship duties.`;
  return `${details.title} teaches how Tarot media becomes cataloged, attributed, and reusable Hapa context.`;
}

function futureSeedForType(mainType, details) {
  return `${details.title} should influence future chapters when an avatar needs ${details.keywords.join(", ") || typeLabel(mainType).toLowerCase()} language.`;
}

function kindForCardType(cardType = "") {
  if (cardType === "ship_card") return "ship";
  if (cardType === "skill_card") return "skill";
  if (cardType === "protocol_card") return "protocol";
  if (cardType === "node_card") return "node";
  if (cardType === "garden_card") return "garden";
  if (cardType === "item_card") return "item";
  return "object";
}

function inferSourceTool(records = []) {
  const names = records.map((record) => record.source.fileName.toLowerCase()).join(" ");
  if (names.includes("grok")) return "grok-video";
  if (names.includes("chatgpt")) return "chatgpt-image";
  return "mixed-local-media";
}

function cardCompleteness(details, group) {
  const checks = [
    details.title,
    details.mainType,
    details.keywords.length,
    details.rawText,
    details.flavorText || details.effectText,
    group.imageRecords.length || group.videoRecords.length,
    group.imageRecords.length && group.videoRecords.length
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function sourceRecordId(filePath, meta) {
  const uuid = path.basename(filePath).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase();
  return `mimi-${uuid || stableHash(`${filePath}:${meta.size}:${meta.mtimeMs}`).slice(0, 16)}`;
}

function normalizeImageExtension(ext = "") {
  const normalized = ext.toLowerCase();
  if (normalized === ".jpeg") return ".jpg";
  return normalized || ".png";
}

function mimeTypeForPath(filePath = "") {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  return "image/png";
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

function normalizeSpaces(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compareText(left = "", right = "") {
  return String(left || "").localeCompare(String(right || ""));
}

function average(values = []) {
  const nums = values.filter((value) => Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function clampStat(value) {
  const number = Number(String(value || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(number) && number >= 0 && number <= 12 ? number : 0;
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
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
