#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, lstat, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createItemCard, normalizeItemManagerStore } from "../src/domain/item.js";
import { slugify } from "../src/domain/avatar.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_DIR = "/Users/calderwong/comics/Episodes";
const DATA_DIR = path.join(ROOT, "data");
const ITEM_STORE_PATH = process.env.HAPA_ITEM_STORE || path.join(DATA_DIR, "item-manager-store.json");
const SUBSCRIBER_DIR = process.env.HAPA_SUBSCRIBER_DIR || path.join(DATA_DIR, "subscribers");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(DATA_DIR, "media");
const EPISODES_MEDIA_DIR = path.join(MEDIA_DIR, "episodes");
const INGEST_DIR = path.join(DATA_DIR, "episodes-ingest");
const OCR_DIR = path.join(INGEST_DIR, "ocr");
const FRAME_DIR = path.join(INGEST_DIR, "frames");
const MANIFEST_PATH = path.join(INGEST_DIR, "manifest.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const OCR_SCRIPT = path.join(ROOT, "scripts", "vision-ocr.swift");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const ARTIFACT_EXTENSIONS = new Set([".zip"]);
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];
const STAT_LABELS = ["speed", "morale", "supply", "influence"];
const MAJOR_ARCANA = [
  "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor", "The Hierophant",
  "The Lovers", "The Chariot", "Strength", "The Hermit", "Wheel of Fortune", "Justice",
  "The Hanged Man", "Death", "Temperance", "The Devil", "The Tower", "The Star",
  "The Moon", "The Sun", "Judgement", "Judgment", "The World"
];
const COURT_AND_PIPS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];
const SUITS = ["Swords", "Cups", "Wands", "Pentacles", "Coins"];
const AVATAR_NAMES = [
  "Red", "Blue", "Green", "Thor", "Leo", "Kat", "Calder", "Bella", "Emily", "Sparrow",
  "Rosie", "Isabella", "Aurelia", "Magda", "Lyra", "Mimi", "Falka", "Mara", "Tiny"
];

const args = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(String(args.get("source") || DEFAULT_SOURCE_DIR));
const limit = Number(args.get("limit") || 0);
const refresh = args.has("refresh");
const dryRun = args.has("dry-run") || args.has("no-write");
const verbose = args.has("verbose");
const noOcr = args.has("no-ocr");

await main();

async function main() {
  await ensureRuntime();
  const existingStore = await readItemStore();
  const knownSources = collectKnownSourcePaths(existingStore);
  const files = await listSourceFiles(sourceDir);
  const mediaFiles = files.filter((file) => file.kind === "image" || file.kind === "video");
  const sourceArtifacts = files.filter((file) => file.kind === "artifact");
  const incoming = mediaFiles
    .filter((file) => refresh || !knownSources.has(file.path))
    .slice(0, limit > 0 ? limit : mediaFiles.length);
  const images = incoming.filter((file) => file.kind === "image");
  const videos = incoming.filter((file) => file.kind === "video");

  const records = [];
  for (let index = 0; index < images.length; index += 1) {
    records.push(await prepareImageRecord(images[index], index + 1, images.length));
  }
  for (let index = 0; index < videos.length; index += 1) {
    records.push(await prepareVideoRecord(videos[index], index + 1, videos.length));
  }

  const ocrRecords = noOcr ? new Map() : await readOrRunOcr(records);
  for (const record of records) {
    record.ocr = record.ocrPath ? (ocrRecords.get(record.ocrPath) || emptyOcr(record.ocrPath)) : emptyOcr("");
    record.details = parseEpisodeDetails(record.ocr, record);
    if (verbose) {
      console.log(`[episodes] ${record.kind} ${record.id} ${record.details.title} ${record.details.mainType}`);
    }
  }

  const grouped = groupRecordsIntoCards(records);
  const cards = grouped.map((group, index) => buildEpisodeCard(group, index + 1));
  const manifest = buildManifest({
    files,
    incoming,
    records,
    grouped,
    cards,
    sourceArtifacts
  });

  if (!dryRun) {
    await upsertCards(existingStore, cards);
    await appendSubscriberEvent("items.episodes-ingested", {
      itemStorePath: ITEM_STORE_PATH,
      manifestPath: MANIFEST_PATH,
      sourceDir,
      newCards: cards.length,
      sourceFiles: incoming.length,
      sourceArtifacts: sourceArtifacts.length
    });
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    noOcr,
    sourceDir,
    totalSourceFiles: files.length,
    totalMediaFiles: mediaFiles.length,
    sourceArtifacts: sourceArtifacts.length,
    skippedKnownFiles: mediaFiles.length - incoming.length,
    newImages: images.length,
    newVideos: videos.length,
    cardsPrepared: cards.length,
    itemStoreUpdated: !dryRun,
    manifestPath: MANIFEST_PATH,
    sampleCards: manifest.cards.slice(0, 12)
  }, null, 2));
}

async function ensureRuntime() {
  await mkdir(EPISODES_MEDIA_DIR, { recursive: true });
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
    for (const section of [card.tarotCard?.ocr, card.episodeCard?.ocr]) {
      for (const value of [
        ...(section?.sourceImagePaths || []),
        ...(section?.sourceVideoPaths || []),
        ...(section?.sourceFramePaths || [])
      ]) {
        if (value && path.isAbsolute(value)) paths.add(value);
      }
    }
    for (const value of card.episodeCard?.source?.sourcePaths || []) {
      if (value && path.isAbsolute(value)) paths.add(value);
    }
  }
  return paths;
}

async function listSourceFiles(dir) {
  const all = [];
  await walk(dir, all);
  return all
    .map((filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const kind = IMAGE_EXTENSIONS.has(ext)
        ? "image"
        : VIDEO_EXTENSIONS.has(ext)
          ? "video"
          : ARTIFACT_EXTENSIONS.has(ext)
            ? "artifact"
            : "";
      return kind ? { kind, path: filePath, ext } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(filePath, out);
    else if (entry.isFile()) out.push(filePath);
  }
}

async function prepareImageRecord(file, position, total) {
  const meta = await stat(file.path);
  const id = sourceRecordId(file.path, meta);
  const ext = normalizeImageExtension(file.ext);
  const mediaName = `${id}${ext}`;
  const linkedPath = path.join(EPISODES_MEDIA_DIR, mediaName);
  await ensureSymlink(file.path, linkedPath);
  const dimensions = await probeImage(file.path);
  return {
    id,
    kind: "image",
    position,
    total,
    source: sourceMeta(file, meta),
    linkedPath,
    mediaUri: `/media/episodes/${mediaName}`,
    posterUri: `/media/episodes/${mediaName}`,
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
  const linkedPath = path.join(EPISODES_MEDIA_DIR, mediaName);
  const firstFramePath = path.join(EPISODES_MEDIA_DIR, firstFrameName);
  const ocrPath = path.join(FRAME_DIR, ocrFrameName);
  await ensureSymlink(file.path, linkedPath);
  const firstFrameOk = await safeExtractFrame(file.path, firstFramePath, []);
  const ocrFrameOk = await safeExtractFrame(file.path, ocrPath, [
    "-vf",
    "scale=iw*2:ih*2,format=gray,eq=contrast=1.55:brightness=0.02,unsharp=5:5:1.0"
  ]);
  const media = await probeVideo(file.path);
  return {
    id,
    kind: "video",
    position,
    total,
    source: sourceMeta(file, meta),
    linkedPath,
    firstFramePath: firstFrameOk ? firstFramePath : "",
    mediaUri: `/media/episodes/${mediaName}`,
    posterUri: firstFrameOk ? `/media/episodes/${firstFrameName}` : "",
    ocrPath: ocrFrameOk ? ocrPath : "",
    dimensions: {
      width: media.width,
      height: media.height,
      duration: media.duration,
      mimeType: media.mimeType
    }
  };
}

function sourceMeta(file, meta) {
  return {
    path: file.path,
    fileName: path.basename(file.path),
    baseName: path.basename(file.path, file.ext),
    size: meta.size,
    modifiedAt: meta.mtime.toISOString()
  };
}

async function ensureSymlink(target, linkPath) {
  if (refresh) await rm(linkPath, { force: true });
  try {
    await lstat(linkPath);
  } catch {
    await symlink(target, linkPath);
  }
}

async function safeExtractFrame(videoPath, framePath, extraArgs = []) {
  if (!refresh) {
    try {
      await lstat(framePath);
      return true;
    } catch {
      // Extract below.
    }
  }
  try {
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
    return true;
  } catch (error) {
    console.warn(`[episodes] frame extraction failed for ${videoPath}: ${error.message}`);
    return false;
  }
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
    if (!record.ocrPath) continue;
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
    try {
      await runOcrBatch(batch, byPath);
    } catch (batchError) {
      console.warn(`[episodes] OCR batch failed; retrying individually: ${batchError.message}`);
      for (const entry of batch) {
        try {
          await runOcrBatch([entry], byPath);
        } catch (singleError) {
          console.warn(`[episodes] OCR failed for ${entry.record.ocrPath}: ${singleError.message}`);
          byPath.set(entry.record.ocrPath, emptyOcr(entry.record.ocrPath));
        }
      }
    }
  }
  return byPath;
}

async function runOcrBatch(batch, byPath) {
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

function parseEpisodeDetails(ocr, record) {
  const lines = normalizeOcrLines(ocr.lines || []);
  const textLines = lines.map((line) => line.text).filter(Boolean);
  const rawText = textLines.join("\n");
  const titleIndex = findTitleIndex(textLines);
  const fallback = fallbackTitle(record);
  const inferredTarotName = inferTarotName(rawText);
  const detectedTitle = titleIndex >= 0 ? toTitleCase(cleanHeading(textLines[titleIndex])) : "";
  const title = cleanTitle(inferredTarotName || detectedTitle || fallback, fallback);
  const typeStack = inferTypeStack(rawText, title, record);
  const subtitle = findSubtitle(textLines, titleIndex);
  const keywordBlock = findKeywordBlock(lines, titleIndex, subtitle);
  const keywords = keywordBlock.keywords.length ? keywordBlock.keywords : inferKeywords(rawText, title, subtitle);
  const classification = classifyEpisode({ rawText, title, record, typeStack });
  const mainType = classifyMainType({ rawText, title, subtitle, keywords, record, classification, typeStack });
  const effectIndex = textLines.findIndex((line) => /effect|mechanic|ability|use|when played|upright|inverted|cost|feature/i.test(line));
  const tarotNumber = textLines.find((line) => /^[IVXLCDM]{1,8}\.?$/i.test(line.trim()))?.replace(/\.$/, "") || "";
  const effectTitle = effectIndex >= 0 ? toTitleCase(cleanHeading(textLines[effectIndex])) : "";
  const effectText = findEffectText(textLines, effectIndex);
  const flavorText = findFlavorText(textLines, keywordBlock, effectIndex, titleIndex, subtitle);
  const confidence = Number(ocr.confidence || average(lines.map((line) => line.confidence)) || 0);
  const dialogueLines = inferDialogueLines(textLines);
  const beats = inferBeats(textLines, title);
  const characters = inferCharacters(rawText, title);
  const locations = inferLocations(rawText);
  return {
    tarotNumber,
    title,
    subtitle,
    archetype: subtitle,
    keywords,
    flavorText,
    effectTitle,
    effectText,
    stats: parseStats(textLines),
    mainType,
    typeStack,
    classification,
    medium: classification === "comic" ? "comic-page" : classification === "video-loop" ? "looping-video" : "comic-and-tarot",
    confidence,
    rawText,
    lines,
    tarotName: inferredTarotName,
    dialogueLines,
    beats,
    characters,
    locations,
    themes: inferThemes(rawText, keywords, classification)
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

function buildEpisodeCard(group, sequence) {
  const details = group.details;
  const title = details.title || `Episode Card ${sequence}`;
  const mainType = details.mainType || "lore_tarot_card";
  const cardType = mainType;
  const kind = kindForCardType(cardType);
  const id = `episodes-${slugify(title) || "card"}-${stableHash(group.key).slice(0, 8)}`;
  const imageAssets = group.imageRecords.map((record, index) => mediaAssetForRecord(record, id, index));
  const videoAssets = group.videoRecords.map((record, index) => mediaAssetForRecord(record, id, index));
  const fallbackFrameAssets = group.videoRecords
    .filter((record) => !group.imageRecords.length && record.posterUri)
    .map((record, index) => frameAssetForVideo(record, id, index));
  const mediaAssets = [...videoAssets, ...imageAssets, ...fallbackFrameAssets];
  const primaryImage = imageAssets[0] || fallbackFrameAssets[0] || null;
  const primaryVideo = videoAssets[0] || null;
  const sourcePaths = group.records.map((record) => record.source.path);
  const imagePaths = group.imageRecords.map((record) => record.source.path);
  const videoPaths = group.videoRecords.map((record) => record.source.path);
  const framePaths = group.videoRecords.map((record) => record.ocrPath).filter(Boolean);
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
  const episodeId = `episode-${stableHash(group.key).slice(0, 12)}`;

  return createItemCard({
    id,
    cardType,
    kind,
    title,
    name: title,
    status: "active",
    canonStatus: "generated",
    summary: episodeSummary(title, details),
    description: [details.effectText, details.flavorText, details.beats?.slice(0, 2).join(" ")].filter(Boolean).join(" "),
    lore: details.flavorText || details.beats?.join(" ") || details.rawText,
    utility: details.keywords,
    broadGameMechanics: [
      "episode media draw",
      "comic/tarot association",
      "Dear Papa song bridge",
      broadMechanicForType(mainType),
      ...details.keywords.map((keyword) => `keyword:${keyword.toLowerCase()}`)
    ],
    tags: unique([
      "tarot-card",
      "episodes",
      "episode-card",
      details.classification === "comic" || details.classification === "mixed" ? "comic-card" : "",
      details.classification === "tarot" || details.classification === "mixed" ? "tarot-design-card" : "",
      primaryVideo ? "loop-video" : "",
      "dear-papa-episodes",
      mainType,
      details.classification,
      ...details.typeStack.map(slugify),
      ...details.keywords.map(slugify)
    ]),
    rank: "ingested",
    quality: {
      rank: "ingested",
      confidence: details.confidence >= 0.72 ? "soft" : "generated",
      power: Math.max(...Object.values(details.stats || {}), 1),
      complexity: details.effectText || details.dialogueLines?.length ? 3 : 2,
      reuse: Math.max(details.keywords.length + details.beats.length, 1),
      risk: details.confidence >= 0.72 ? 1 : 2,
      completeness: cardCompleteness(details, group),
      level: videoAssets.length,
      durability: mediaAssets.length
    },
    locationState: {
      currentSystemName: "Black Horizon",
      state: "episode-ingested",
      notes: "Episode/Tarot media ingested from the local Episodes folder."
    },
    connections: {
      episodeIds: [episodeId]
    },
    mediaPrompts: {
      heroImage: `Hero still for ${title}, preserving the episode/comic/tarot design and OCR-readable narrative signals.`,
      twoD: `2D card archive rendering of ${title}; keep card frame, panel composition, title, visible text, and lore beats legible.`,
      threeD: `Game-ready 3D spatial card for ${title}: a Tarot Draw media node with looping video, card details, and connector lines.`,
      comicPanel: `Comic continuation panel where avatars interpret ${title} as a lore card and attach it to a song.`,
      explainerVideo: `Explainer loop showing ${title}, its source media, OCR, card type, avatar picks, scenes, and Dear Papa song associations.`,
      wikiEntry: `Wiki entry for ${title} with OCR text, episode/comic classification, media links, provenance, mechanics, lore, and avatar/song picks.`,
      negativePrompt: "avoid unsupported hard-canon claims, avoid unreadable tiny text, avoid replacing source attribution"
    },
    sourceRefs: sourcePaths.map((sourcePath) => ({
      label: "Episodes source media",
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
        collectionId: "episodes",
        collectionTitle: "Episodes",
        family: "Hapa Episodes + Tarot",
        typeLabel: typeLabel(mainType),
        sequence,
        sourceFolder: sourceDir,
        sourceHash: stableHash(sourcePaths.join("|")),
        pairingKey: group.key,
        confidence: details.confidence >= 0.72 ? "soft" : "generated"
      },
      identity: {
        systemName: "Hapa Tarot System",
        deckName: "Episodes",
        arcana: inferArcana(details),
        tarotType: details.tarotName || title,
        tarotCardName: details.tarotName || title,
        printedTitle: title,
        displayTitle: title,
        functionalType: typeLabel(mainType).replace(/\s+Card$/i, ""),
        functionalTypeSlug: mainType,
        cardTypeName: typeLabel(mainType),
        typeStack: details.typeStack,
        confidence: details.confidence >= 0.72 ? "soft" : "generated"
      },
      attribution: {
        author: "Calder",
        shop: "Episodes",
        albumTitle: "Dear Papa",
        rightsStatus: "operator_authored_hapa_creative_commons",
        sourceTool: inferSourceTool(group.records),
        sourcePaths,
        notes: "Ingested locally from Episodes with Apple Vision OCR over images and video first frames."
      },
      mechanics: {
        broadGameMechanic: broadMechanicForType(mainType),
        deckUse: `Can be drawn from the ${typeLabel(mainType)} pile as an Episodes card and used to seed comic, tarot, avatar, song, and scene associations.`,
        surfaceUse: "Can be placed on the Tarot Draw surface as a media card/node with visible links to avatar, comic, song, and scene context.",
        relationshipUse: relationshipUseForType(mainType, details),
        skillUse: skillUseForType(mainType, details),
        effects: effectListForType(mainType, details),
        limits: ["Generated OCR interpretation must stay soft canon until human review."]
      },
      lore: {
        summary: loreSummaryForCard(title, mainType, details),
        canonStatus: "generated",
        characterHooks: details.characters,
        relationshipHooks: relationshipHooks(details),
        protocolTeaching: protocolTeachingForType(mainType, details),
        futureSeed: futureSeedForType(mainType, details),
        visualLanguage: details.themes,
        sourceClaims: [`${title} was created from ${sourcePaths.length} Episodes source media file(s).`]
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
            ? "Linked because OCR/title grouping placed image and video under the same Episodes card identity."
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
        sourceFramePaths: framePaths,
        sourceMediaUris: mediaAssets.map((asset) => asset.uri).filter(Boolean)
      }
    },
    episodeCard: {
      schemaVersion: "hapa.episode-card-details.v1",
      episodeId,
      episodeTitle: title,
      seriesTitle: "Episodes",
      sequence,
      medium: details.medium,
      designFamily: inferDesignFamily(details, group),
      classification: details.classification,
      title,
      subtitle: details.subtitle,
      summary: episodeSummary(title, details),
      beats: details.beats,
      characters: details.characters,
      locations: details.locations,
      themes: details.themes,
      mechanics: effectListForType(mainType, details),
      comic: {
        pageTitle: details.classification === "comic" || details.classification === "mixed" ? title : "",
        pageNumber: sequence,
        panelCount: inferPanelCount(details),
        dialogueLines: details.dialogueLines,
        narrationLines: details.beats,
        visualLanguage: details.themes
      },
      tarotLinks: [{
        id: `${id}-tarot-self-link`,
        cardId: id,
        tarotType: details.tarotName || title,
        functionalType: typeLabel(mainType).replace(/\s+Card$/i, ""),
        why: "The Episodes ingest represents this media as a drawable Tarot Table card while preserving episode/comic context.",
        confidence: "generated",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      mediaLinks: [
        {
          id: `${id}-episode-media-link`,
          imageAssetId: primaryImage?.id || "",
          videoAssetId: primaryVideo?.id || "",
          imageUri: primaryImage?.uri || "",
          videoUri: primaryVideo?.uri || "",
          posterUri: primaryVideo?.thumbnailUri || primaryImage?.thumbnailUri || "",
          confidence: primaryImage && primaryVideo ? "soft" : "generated",
          reason: "Primary Episodes media representation."
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
        sourceFramePaths: framePaths,
        sourceMediaUris: mediaAssets.map((asset) => asset.uri).filter(Boolean)
      },
      source: {
        sourceFolder: sourceDir,
        sourcePaths,
        sourceHash: stableHash(sourcePaths.join("|")),
        confidence: details.confidence >= 0.72 ? "soft" : "generated"
      }
    },
    history: [
      {
        eventId: `episodes-ingest-${id}`,
        label: "Ingested from Episodes",
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
    tags: ["tarot-card", "episodes", "episode-card", record.kind],
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
    tags: ["tarot-card", "episodes", "episode-card", "first-frame"],
    confidence: "soft",
    notes: `First frame extracted from ${record.source.path}`
  };
}

async function upsertCards(existingStore, cards) {
  const backupName = `item-manager-store.before-episodes-ingest-${safeTimestamp()}.json`;
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

function buildManifest({ files, incoming, records, grouped, cards, sourceArtifacts }) {
  return {
    schemaVersion: "hapa.episodes-ingest.v1",
    sourceDir,
    generatedAt: new Date().toISOString(),
    dryRun,
    counts: {
      totalSourceFiles: files.length,
      totalMediaFiles: files.filter((file) => file.kind === "image" || file.kind === "video").length,
      sourceArtifacts: sourceArtifacts.length,
      newSourceFiles: incoming.length,
      imageRecords: records.filter((record) => record.kind === "image").length,
      videoRecords: records.filter((record) => record.kind === "video").length,
      cards: cards.length,
      comicCards: cards.filter((card) => card.episodeCard?.classification === "comic").length,
      tarotCards: cards.filter((card) => card.episodeCard?.classification === "tarot").length,
      mixedCards: cards.filter((card) => card.episodeCard?.classification === "mixed").length
    },
    sourceArtifacts: sourceArtifacts.map((file) => ({
      path: file.path,
      fileName: path.basename(file.path),
      kind: file.kind,
      ext: file.ext,
      notes: "Source artifact recorded for provenance; not directly added to Tarot Draw media."
    })),
    cards: cards.map((card) => ({
      id: card.id,
      title: card.title,
      cardType: card.cardType,
      kind: card.kind,
      classification: card.episodeCard?.classification || "",
      tarotNumber: card.tarotCard?.tarotNumber || "",
      typeStack: card.tarotCard?.identity?.typeStack || [],
      keywords: card.tarotCard?.keywords || [],
      confidence: card.tarotCard?.ocr?.confidence || 0,
      imageCount: (card.mediaAssets || []).filter((asset) => asset.type === "image").length,
      videoCount: (card.mediaAssets || []).filter((asset) => asset.type === "video").length,
      sourcePaths: card.episodeCard?.source?.sourcePaths || card.tarotCard?.attribution?.sourcePaths || []
    })),
    records: records.map((record) => ({
      id: record.id,
      kind: record.kind,
      sourcePath: record.source.path,
      mediaUri: record.mediaUri,
      posterUri: record.posterUri,
      title: record.details.title,
      mainType: record.details.mainType,
      classification: record.details.classification,
      typeStack: record.details.typeStack,
      confidence: record.details.confidence,
      ocrLineCount: record.details.lines.length
    })),
    pairings: grouped.map((group) => ({
      pairingKey: group.key,
      title: group.details.title,
      mainType: group.details.mainType,
      classification: group.details.classification,
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
  await Promise.all(SUBSCRIBERS.map((subscriber) => appendFile(
    path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`),
    `${JSON.stringify({ ...event, subscriber, status: "queued" })}\n`,
    "utf8"
  )));
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
  if (title && !isFallbackishTitle(title)) {
    return `${details.mainType || "lore_tarot_card"}::${title}::${subtitle}`;
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
  const typeStack = unique(records.flatMap((record) => record.details.typeStack || []));
  const characters = unique(records.flatMap((record) => record.details.characters || []));
  const locations = unique(records.flatMap((record) => record.details.locations || []));
  const themes = unique(records.flatMap((record) => record.details.themes || []));
  const beats = unique(records.flatMap((record) => record.details.beats || []));
  const dialogueLines = unique(records.flatMap((record) => record.details.dialogueLines || []));
  const rawText = records.map((record) => record.details.rawText).filter(Boolean).join("\n\n");
  const classification = mergeClassification(records.map((record) => record.details.classification));
  return {
    ...best,
    keywords: keywords.length ? keywords : best.keywords || [],
    typeStack: typeStack.length ? typeStack : best.typeStack || [],
    characters,
    locations,
    themes,
    beats,
    dialogueLines,
    rawText,
    classification,
    medium: classification === "comic" ? "comic-page" : classification === "video-loop" ? "looping-video" : "comic-and-tarot",
    confidence: average(records.map((record) => Number(record.details.confidence || 0))),
    stats: mergeStats(records.map((record) => record.details.stats || {}))
  };
}

function mergeClassification(values = []) {
  const set = new Set(values.filter(Boolean));
  if (set.has("mixed") || (set.has("comic") && set.has("tarot"))) return "mixed";
  if (set.has("tarot")) return "tarot";
  if (set.has("comic")) return "comic";
  if (set.has("video-loop")) return "video-loop";
  return "episode";
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
      if (/^[IVXLCDM]{1,8}\.?$/i.test(line.trim())) return false;
      if (/effect|mechanic|speed|morale|supply|influence|card type|type:/i.test(line)) return false;
      if (/\d{3,}/.test(line)) return false;
      const words = wordsOnly(line);
      if (words.length < 1 || words.length > 9) return false;
      return uppercaseRatio(line) > 0.45 || titleCaseRatio(line) > 0.62 || /^the\s+/i.test(line);
    });
  return candidates[0]?.index ?? -1;
}

function findSubtitle(lines, titleIndex) {
  if (titleIndex < 0) return "";
  const stop = Math.min(lines.length, titleIndex + 8);
  for (let index = titleIndex + 1; index < stop; index += 1) {
    const line = lines[index];
    if (!line || /effect|mechanic|speed|morale|supply|influence|type:/i.test(line)) continue;
    if (/^[IVXLCDM]{1,8}\.?$/i.test(cleanHeading(line))) continue;
    const clean = cleanSubtitleHeading(line);
    const words = wordsOnly(clean);
    if (words.length >= 1 && words.length <= 6 && (uppercaseRatio(clean) > 0.4 || titleCaseRatio(clean) > 0.62)) {
      return toTitleCase(clean);
    }
  }
  return "";
}

function findKeywordBlock(lines, titleIndex, subtitle = "") {
  const entries = lines.map((line, index) => ({ ...line, index }));
  const start = Math.max(0, titleIndex + 1);
  let best = { start: -1, end: -1, keywords: [], score: -Infinity };
  for (let index = start; index < entries.length; index += 1) {
    const entry = entries[index];
    const line = entry.text;
    if (isCardMetaLine(line, subtitle)) continue;
    if (!isKeywordLine(line)) continue;
    const keywords = splitKeywords(line);
    let end = index;
    for (let next = index + 1; next < entries.length; next += 1) {
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
  const stop = effectIndex >= 0 ? effectIndex : Math.min(lines.length, start + 8);
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
    if (/speed|morale|supply|influence|function icons|statistics/i.test(line)) break;
    if (/^[0-9\s]+$/.test(line) && wordsOnly(line).length === 0) break;
    effectLines.push(line);
    if (effectLines.length >= 5) break;
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

function classifyMainType({ rawText = "", title = "", subtitle = "", keywords = [], record = {}, classification = "", typeStack = [] }) {
  const text = `${title} ${subtitle} ${keywords.join(" ")} ${typeStack.join(" ")} ${rawText} ${record.source?.fileName || ""}`.toLowerCase();
  if (/\bspell\s+card\b|\bspell\s+type\b|\btype\s*:\s*spell\b|\bhapa-spl\b/.test(text)) return "spell_card";
  if (/\bgarden\s+type\b|\bgarden\s+card\b|\btype\s*:\s*garden\b|\bmajor\s+arcana\s*\/+\s*garden\b|\bgardens\s*\/\/\s*civilizations\b/.test(text)) return "garden_card";
  if (/\bitem\s+card\b|\bitem\s+type\b|\btype\s*:\s*item\b|\bhapa-itm\b/.test(text)) return "item_card";
  if (/\btype\s*:\s*protocol\b|\bprotocol\s+card\b|\bprotocol\b/.test(text)) return "protocol_card";
  if (/\btype\s*:\s*skill\b|\bskill\s+card\b|\bskill|technique|training|craft|ability|tool|move|practice|competence\b/.test(text)) return "skill_card";
  if (/\brelationship|bond|kinship|trust|loyalty|alliance|rival|family|friend|counterpoint|bella\b/.test(text)) return "relationship_tarot_card";
  if (/\bnode|atlas|second brain|wiki|registry|console|server|station\b/.test(text)) return "node_card";
  if (/\bship|vessel|fleet|cruiser|carrier|frigate|shuttle|hss\b/.test(text)) return "ship_card";
  if (/\bavatar|agent|red|blue|green|mimi|falka|thor|dancer|leo|mara|tiny\b/.test(text)) return "avatar_tarot_card";
  if (/\bsong|album|lyric|dear papa|track|sings|voice\b/.test(text)) return "song_tarot_card";
  if (classification === "comic" || classification === "mixed") return "lore_tarot_card";
  if (/\blore|canon|memory|chapter|story|world|episode|page|panel|saga\b/.test(text)) return "lore_tarot_card";
  return "hapa_tarot_card";
}

function classifyEpisode({ rawText = "", title = "", record = {}, typeStack = [] }) {
  const text = `${title} ${rawText} ${record.source?.fileName || ""} ${typeStack.join(" ")}`.toLowerCase();
  const tarotSignal = /\btarot|arcana|upright|inverted|type\s*:|major arcana|minor arcana|hapa tarot|protocol card|skill card|spell card|garden card|item card|nine of|ace of|king of|queen of|page of|knight of\b/.test(text) || inferTarotName(text);
  const comicSignal = /\bcomic|episode|chapter|page|panel|dialogue|caption|ballad|bella|guild|calder familia|wizard'?s guild|no lost sheep\b/.test(text) || inferDialogueLines(rawText.split(/\n+/)).length >= 2;
  if (tarotSignal && comicSignal) return "mixed";
  if (tarotSignal) return "tarot";
  if (comicSignal) return "comic";
  if (record.kind === "video") return "video-loop";
  return "episode";
}

function inferTypeStack(rawText = "", title = "", record = {}) {
  const text = `${title}\n${rawText}\n${record.source?.fileName || ""}`;
  const types = [];
  const tarotName = inferTarotName(text);
  if (tarotName) types.push(tarotName);
  const patterns = [
    ["Protocol", /\btype\s*:\s*protocol\b|\bprotocol\s+card\b/i],
    ["Skill", /\btype\s*:\s*skill\b|\bskill\s+card\b/i],
    ["Spell", /\btype\s*:\s*spell\b|\bspell\s+card\b/i],
    ["Garden", /\btype\s*:\s*garden\b|\bgarden\s+card\b/i],
    ["Item", /\btype\s*:\s*item\b|\bitem\s+card\b/i],
    ["Location", /\btype\s*:\s*location\b|\blocation\s+card\b/i],
    ["Lore", /\btype\s*:\s*lore\b|\blore\s+card\b/i],
    ["Avatar", /\btype\s*:\s*avatar\b|\bavatar\s+card\b/i],
    ["Relationship", /\btype\s*:\s*relationship\b|\brelationship\s+card\b/i],
    ["Song", /\btype\s*:\s*song\b|\bsong\s+card\b/i]
  ];
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) types.push(label);
  }
  return unique(types);
}

function inferTarotName(text = "") {
  const source = normalizeSpaces(text);
  for (const name of MAJOR_ARCANA) {
    const escaped = name.replace(/\s+/g, "\\s+");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(source)) return name === "Judgment" ? "Judgement" : name;
  }
  for (const rank of COURT_AND_PIPS) {
    for (const suit of SUITS) {
      const pattern = new RegExp(`\\b${rank}\\s+of\\s+${suit}\\b`, "i");
      if (pattern.test(source)) return `${rank} of ${suit}`;
    }
  }
  return "";
}

function inferKeywords(rawText, title, subtitle) {
  const source = `${title} ${subtitle} ${rawText}`;
  const candidates = [
    "relationship", "skill", "protocol", "memory", "canon", "song", "deck", "future", "trust",
    "source", "repair", "signal", "pressure", "garden", "node", "ship", "lore", "choice",
    "bella", "guild", "family", "episode", "comic", "watch", "reading", "ingress"
  ];
  return candidates.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(source)).slice(0, 6).map(toTitleCase);
}

function inferDialogueLines(lines = []) {
  return lines
    .map((line) => normalizeSpaces(line))
    .filter((line) => {
      if (!line || line.length < 10 || line.length > 180) return false;
      if (/^(type|mechanics|statistics|keywords|hapa tarot|major arcana|minor arcana)/i.test(line)) return false;
      return /["'!?]|^\w+[:,]/.test(line) || /\b(I|you|we|they|she|he|don't|can't|won't|remember|listen|look|please)\b/i.test(line);
    })
    .slice(0, 16);
}

function inferBeats(lines = [], title = "") {
  return unique(lines
    .map((line) => normalizeSpaces(line))
    .filter((line) => line && line !== title)
    .filter((line) => line.length >= 24 && line.length <= 220)
    .filter((line) => !/^(type|mechanics|statistics|keywords|function icons|hapa tarot)/i.test(line))
    .slice(0, 14));
}

function inferCharacters(rawText = "", title = "") {
  const text = `${title} ${rawText}`;
  return AVATAR_NAMES.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
}

function inferLocations(rawText = "") {
  const locations = [];
  const patterns = [
    ["Guild", /\bguild\b/i],
    ["Calder Familia", /\bcalder familia\b/i],
    ["Black Horizon", /\bblack horizon\b/i],
    ["HSS Red Forge", /\bhss red forge\b|\bred forge\b/i],
    ["HSS Green Consul", /\bhss green consul\b|\bgreen consul\b/i],
    ["Artifact Transit", /\bartifact transit\b/i],
    ["Garden", /\bgarden\b/i]
  ];
  for (const [label, pattern] of patterns) {
    if (pattern.test(rawText)) locations.push(label);
  }
  return unique(locations);
}

function inferThemes(rawText = "", keywords = [], classification = "") {
  const source = rawText.toLowerCase();
  const themes = [...keywords];
  const candidates = [
    ["No Lost Sheep", /no lost sheep|lost sheep/],
    ["Bella Adoption", /bella|adopt/],
    ["Guild Care", /guild|consul|familia/],
    ["Source Provenance", /source|lineage|attribution/],
    ["Tarot Mechanics", /tarot|arcana|upright|inverted|mechanic/],
    ["Episode Continuity", /episode|chapter|page|panel/],
    ["Music Bridge", /song|album|lyric|dear papa/]
  ];
  for (const [label, pattern] of candidates) {
    if (pattern.test(source)) themes.push(label);
  }
  if (classification) themes.push(toTitleCase(classification));
  return unique(themes).slice(0, 12);
}

function isCardMetaLine(line = "", subtitle = "") {
  const clean = cleanHeading(line);
  if (!clean) return true;
  if (/^[IVXLCDM]{1,8}\.?$/i.test(clean)) return true;
  if (subtitle && toTitleCase(clean) === subtitle) return true;
  return /effect|mechanic|speed|morale|supply|influence|function icons|statistics/i.test(clean);
}

function isKeywordLine(line = "") {
  const keywords = splitKeywords(line);
  if (keywords.length < 2 || keywords.length > 8) return false;
  if (isCardMetaLine(line)) return false;
  const hasSeparator = /[+|*•]/.test(line);
  const hasSentencePunctuation = /[.!?;]/.test(line) || /,\s/.test(line);
  const wordCount = wordsOnly(line).length;
  return hasSeparator || (
    wordCount <= 9 &&
    !hasSentencePunctuation &&
    (uppercaseRatio(line) > 0.35 || titleCaseRatio(line) > 0.62)
  );
}

function isKeywordContinuationLine(line = "") {
  const keywords = splitKeywords(line);
  if (keywords.length < 1 || keywords.length > 4) return false;
  if (isCardMetaLine(line)) return false;
  if (/[.!?;,]/.test(line)) return false;
  return uppercaseRatio(line) > 0.35 || titleCaseRatio(line) > 0.62;
}

function splitKeywords(value = "") {
  const raw = normalizeSpaces(value)
    .replace(/[|*+:/•]+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ");
  return unique(raw.split(/\s{2,}|\s+-\s+|\s+/)
    .map((part) => normalizeSpaces(part))
    .filter((part) => part.length > 2)
    .filter((part) => !/^(the|and|ark|effect|fleet|speed|morale|supply|influence|card|tarot|type|hapa)$/i.test(part))
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
    .replace(/^grok[-_ ]/i, "Episodes")
    .replace(/^chatgpt image/i, "Episode Image")
    .replace(/\s*\(\d+\)$/g, "")
    .replace(/[-_]+/g, " ");
  return toTitleCase(cleanHeading(name || `Episode Card ${record.position}`));
}

function cleanTitle(value, fallback) {
  const title = toTitleCase(cleanHeading(value || fallback));
  if (!title || isFallbackishTitle(title)) return fallback;
  return title;
}

function isFallbackishTitle(title = "") {
  return /^episode(s)?(\s+image|\s+card)?\b/i.test(title) ||
    /^grok[-_ ]/i.test(title) ||
    /^chatgpt image/i.test(title) ||
    /^[a-f0-9-]{20,}$/i.test(title);
}

function typeLabel(mainType = "") {
  return toTitleCase(String(mainType || "lore_tarot_card").replace(/_/g, " "));
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
  return "Play as an Episodes lore node that turns comic/video/tarot media into deck, surface, song, and Genesis context.";
}

function relationshipUseForType(mainType, details) {
  if (mainType === "relationship_tarot_card") return `Use ${details.title} to open a relationship scene around ${details.keywords.join(", ") || "trust and tension"}.`;
  if (details.characters?.length) return `Use ${details.title} when ${details.characters.join(", ")} need the episode media to clarify trust, memory, or obligation.`;
  return `Use ${details.title} when its episode/comic signal changes how an avatar relates to another person, node, or future self.`;
}

function skillUseForType(mainType, details) {
  if (mainType === "skill_card") return `Use ${details.title} as an explicit skill/training card.`;
  if (mainType === "spell_card") return `Use ${details.title} as an activated spell only when its cost, focus, duration, and limit are visible.`;
  return `Use ${details.title} as a lore/action cue when its mechanic is visible in the avatar's canon.`;
}

function effectListForType(mainType, details) {
  const effects = [broadMechanicForType(mainType)];
  if (details.effectText) effects.push(details.effectText);
  if (details.beats?.length) effects.push(`Episode beats: ${details.beats.slice(0, 3).join(" / ")}.`);
  if (details.keywords.length) effects.push(`Keyword focus: ${details.keywords.join(", ")}.`);
  return effects;
}

function loreSummaryForCard(title, mainType, details) {
  const keywordText = details.keywords.length ? ` It carries ${details.keywords.join(", ")} as its main teaching signals.` : "";
  const classText = details.classification ? ` The source reads as ${details.classification} media.` : "";
  return `${title} enters Hapa as an Episodes ${typeLabel(mainType)} discovered through OCR over comic/card/video source media.${classText}${keywordText} Its canon status is generated until a human promotes it.`;
}

function episodeSummary(title, details) {
  const who = details.characters?.length ? ` Characters detected: ${details.characters.join(", ")}.` : "";
  const beat = details.beats?.[0] ? ` First readable beat: ${details.beats[0]}` : "";
  return `${title} is an Episodes import that can be drawn as a Tarot Table card and associated with avatars, songs, comics, and scenes.${who}${beat}`;
}

function relationshipHooks(details) {
  return unique([
    ...(details.keywords || []),
    ...(details.themes || [])
  ].filter((keyword) => /trust|bond|kinship|loyalty|tension|source|repair|choice|memory|bella|guild|family/i.test(keyword))).slice(0, 8);
}

function protocolTeachingForType(mainType, details) {
  if (mainType === "protocol_card") return `${details.title} teaches a protocol boundary or verification move that must remain source-attributed.`;
  if (mainType === "relationship_tarot_card") return `${details.title} teaches that relationship state is operational data, not decoration.`;
  if (mainType === "skill_card") return `${details.title} teaches that skill cards need use, limits, and training context.`;
  return `${details.title} teaches how Episodes media becomes cataloged, attributed, associated, and reusable Hapa context.`;
}

function futureSeedForType(mainType, details) {
  return `${details.title} should influence future chapters when an avatar needs ${(details.keywords || []).join(", ") || typeLabel(mainType).toLowerCase()} language from the Episodes archive.`;
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

function inferDesignFamily(details, group) {
  const names = group.records.map((record) => record.source.fileName.toLowerCase()).join(" ");
  if (details.classification === "comic") return "episode-comic";
  if (details.typeStack?.length > 1) return "hybrid-tarot-card";
  if (names.includes("grok")) return "motion-card-loop";
  if (names.includes("chatgpt")) return "generated-card-image";
  return "episodes-mixed-media";
}

function inferArcana(details) {
  const name = details.tarotName || details.title || "";
  if (MAJOR_ARCANA.some((item) => item.toLowerCase() === name.toLowerCase())) return "Major Arcana";
  if (/\bof\s+(swords|cups|wands|pentacles|coins)\b/i.test(name)) return "Minor Arcana";
  return "";
}

function inferPanelCount(details) {
  if (details.classification !== "comic" && details.classification !== "mixed") return 0;
  const fromDialog = Math.ceil((details.dialogueLines?.length || 0) / 2);
  return Math.max(1, Math.min(9, fromDialog || 1));
}

function cardCompleteness(details, group) {
  let score = 0;
  if (details.title) score += 18;
  if (details.keywords.length) score += 16;
  if (details.effectText || details.beats.length) score += 16;
  if (details.rawText) score += 14;
  if (group.imageRecords.length) score += 14;
  if (group.videoRecords.length) score += 14;
  if (details.characters.length) score += 4;
  if (details.typeStack.length) score += 4;
  return Math.min(100, score);
}

function normalizeSpaces(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanHeading(value = "") {
  return normalizeSpaces(String(value || "")
    .replace(/[•*_]+/g, " ")
    .replace(/^[^A-Za-z0-9IVXLCDM]+|[^A-Za-z0-9.!?'")]+$/g, ""));
}

function cleanSubtitleHeading(value = "") {
  return cleanHeading(value)
    .replace(/\b(card|tarot|type|major arcana|minor arcana)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value = "") {
  return normalizeSpaces(value).toLowerCase().replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function wordsOnly(value = "") {
  return String(value || "").match(/[A-Za-z][A-Za-z'-]*/g) || [];
}

function uppercaseRatio(value = "") {
  const letters = String(value || "").match(/[A-Za-z]/g) || [];
  if (!letters.length) return 0;
  return letters.filter((letter) => letter === letter.toUpperCase()).length / letters.length;
}

function titleCaseRatio(value = "") {
  const words = wordsOnly(value);
  if (!words.length) return 0;
  return words.filter((word) => /^[A-Z][a-z'-]+/.test(word)).length / words.length;
}

function compareText(a = "", b = "") {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function average(values = []) {
  const numeric = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : 0;
}

function clampStat(value) {
  return Math.max(0, Math.min(10, Number(value || 0)));
}

function stableHash(value = "") {
  return createHash("sha1").update(String(value)).digest("hex");
}

function sourceRecordId(filePath, meta) {
  return `episodes-${stableHash(`${filePath}:${meta.size}:${meta.mtimeMs}`).slice(0, 16)}`;
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".zip") return "application/zip";
  return "";
}

function normalizeImageExtension(ext = ".png") {
  const normalized = String(ext || ".png").toLowerCase();
  if (normalized === ".jpeg") return ".jpg";
  return IMAGE_EXTENSIONS.has(normalized) ? normalized : ".png";
}

function emptyOcr(ocrPath) {
  return {
    path: ocrPath,
    engine: "apple-vision",
    confidence: 0,
    rawText: "",
    lines: [],
    error: ocrPath ? "ocr-unavailable" : "no-ocr-source"
  };
}

function parseArgs(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      map.set(key, next);
      index += 1;
    } else {
      map.set(key, true);
    }
  }
  return map;
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}
