#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { normalizeItemManagerStore } from "../src/domain/item.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const REPORT_DIR = path.join(DATA_DIR, "tarot-media-pair-audit");
const RUN_ID = `tarot-media-pair-audit-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const RUN_REPORT_PATH = path.join(REPORT_DIR, "runs", `${RUN_ID}.json`);
const LATEST_REPORT_PATH = path.join(REPORT_DIR, "latest-report.json");
const args = parseArgs(process.argv.slice(2));
const minHighResEdge = Number(args.get("min-edge") || 1024);
const sampleSize = Number(args.get("sample-size") || 40);
const writeReport = !args.has("dry-run") && !args.has("no-write");

await main();

async function main() {
  const store = normalizeItemManagerStore(JSON.parse(await fs.readFile(ITEM_STORE_PATH, "utf8")));
  const tarotCards = (store.cards || []).filter(isTarotLikeCard);
  const uniqueImages = new Map();
  const uniqueVideos = new Map();
  const cards = tarotCards.map((card) => auditCard(card, uniqueImages, uniqueVideos));

  const imageRecords = [...uniqueImages.values()];
  await hydrateImageDimensions(imageRecords);

  const unpairedImages = imageRecords.filter((image) => !image.pairedVideoUris.size);
  const lowResolutionImages = imageRecords.filter((image) =>
    image.dimensions?.width && image.dimensions?.height &&
    Math.max(image.dimensions.width, image.dimensions.height) < minHighResEdge
  );
  const unknownResolutionImages = imageRecords.filter((image) => !image.dimensions);
  const imageOnlyCards = cards.filter((card) => card.highResImageUris.length && !card.videoUris.length);
  const videoOnlyCards = cards.filter((card) => !card.highResImageUris.length && card.videoUris.length);
  const missingStrictPairCards = cards.filter((card) => card.highResImageUris.length && card.videoUris.length && !card.strictHighResPairs.length);
  const firstFramePairOnlyCards = cards.filter((card) => card.videoUris.length && !card.strictHighResPairs.length && card.firstFramePairs.length);
  const noMediaCards = cards.filter((card) => !card.highResImageUris.length && !card.videoUris.length);

  const report = {
    schemaVersion: "hapa.tarot-media-pair-audit.v1",
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    source: "scripts/audit-tarot-media-pairs.mjs",
    policy: {
      standard: "Each tarot card should have at least one high-res card image and at least one looping video, connected by tarotCard.mediaLinks.imageUri + videoUri.",
      highResMinEdge: minHighResEdge,
      excludesAsHighResImage: ["video first frames", "poster-only images", "thumbnail-only images"]
    },
    summary: {
      tarotCards: tarotCards.length,
      uniqueHighResImages: imageRecords.length,
      uniqueLoopingVideos: uniqueVideos.size,
      uniqueHighResImagesWithPairedVideo: imageRecords.filter((image) => image.pairedVideoUris.size).length,
      uniqueHighResImagesWithoutPairedVideo: unpairedImages.length,
      lowResolutionHighResImageCandidates: lowResolutionImages.length,
      unknownResolutionHighResImageCandidates: unknownResolutionImages.length,
      cardsWithHighResImageAndVideo: cards.filter((card) => card.highResImageUris.length && card.videoUris.length).length,
      cardsWithStrictHighResImageVideoPair: cards.filter((card) => card.strictHighResPairs.length).length,
      cardsWithHighResImageNoVideo: imageOnlyCards.length,
      cardsWithVideoNoHighResImage: videoOnlyCards.length,
      cardsWithHighResImageAndVideoButNoStrictPair: missingStrictPairCards.length,
      cardsUsingFirstFrameAsOnlyPairImage: firstFramePairOnlyCards.length,
      cardsWithNoImageOrVideo: noMediaCards.length
    },
    samples: {
      uniqueHighResImagesWithoutPairedVideo: unpairedImages.slice(0, sampleSize).map(summarizeImage),
      cardsWithHighResImageNoVideo: imageOnlyCards.slice(0, sampleSize).map(summarizeCard),
      cardsWithVideoNoHighResImage: videoOnlyCards.slice(0, sampleSize).map(summarizeCard),
      cardsWithHighResImageAndVideoButNoStrictPair: missingStrictPairCards.slice(0, sampleSize).map(summarizeCard),
      cardsUsingFirstFrameAsOnlyPairImage: firstFramePairOnlyCards.slice(0, sampleSize).map(summarizeCard),
      lowResolutionHighResImageCandidates: lowResolutionImages.slice(0, sampleSize).map(summarizeImage),
      unknownResolutionHighResImageCandidates: unknownResolutionImages.slice(0, sampleSize).map(summarizeImage)
    },
    cards
  };

  if (writeReport) {
    await fs.mkdir(path.dirname(RUN_REPORT_PATH), { recursive: true });
    await fs.writeFile(RUN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(LATEST_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    ok: true,
    reportPath: writeReport ? path.relative(ROOT, LATEST_REPORT_PATH) : "",
    runReportPath: writeReport ? path.relative(ROOT, RUN_REPORT_PATH) : "",
    ...report.summary
  }, null, 2));
}

function auditCard(card, uniqueImages, uniqueVideos) {
  const highResImages = collectHighResImages(card);
  const firstFrameImages = collectFirstFrameImages(card);
  const videos = collectVideos(card);
  const strictHighResPairs = [];
  const firstFramePairs = [];

  for (const image of highResImages) {
    const record = ensureImage(uniqueImages, image.uri);
    record.cardIds.add(card.id);
    record.cardTitles.add(card.title);
    record.sources.add(image.source);
  }
  for (const videoUri of videos) {
    const record = uniqueVideos.get(videoUri) || { uri: videoUri, cardIds: new Set(), cardTitles: new Set() };
    record.cardIds.add(card.id);
    record.cardTitles.add(card.title);
    uniqueVideos.set(videoUri, record);
  }

  for (const link of card.tarotCard?.mediaLinks || []) {
    if (!isVideoUri(link.videoUri)) continue;
    if (isHighResImageUri(link.imageUri)) {
      strictHighResPairs.push({ imageUri: normalizeUri(link.imageUri), videoUri: normalizeUri(link.videoUri), linkId: link.id || "" });
      const image = ensureImage(uniqueImages, link.imageUri);
      image.pairedVideoUris.add(normalizeUri(link.videoUri));
      image.cardIds.add(card.id);
      image.cardTitles.add(card.title);
      image.sources.add("tarot-media-link");
    } else if (isImageUri(link.imageUri) || isImageUri(link.posterUri)) {
      firstFramePairs.push({
        imageUri: normalizeUri(link.imageUri || link.posterUri),
        videoUri: normalizeUri(link.videoUri),
        linkId: link.id || ""
      });
    }
  }

  return {
    cardId: card.id,
    title: card.title,
    cardType: card.cardType,
    tarotMainType: card.tarotCard?.mainType || card.cardType || "",
    tarotType: card.tarotCard?.identity?.tarotType || card.tarotCard?.identity?.tarotCardName || card.tarotCard?.title || card.title,
    functionalType: card.tarotCard?.identity?.functionalType || card.tarotCard?.typeDetails?.functionalType || "",
    highResImageUris: highResImages.map((image) => image.uri),
    firstFrameImageUris: firstFrameImages.map((image) => image.uri),
    videoUris: videos,
    strictHighResPairs,
    firstFramePairs
  };
}

function collectHighResImages(card = {}) {
  const images = [];
  for (const asset of card.mediaAssets || []) {
    const uri = normalizeUri(asset.uri || asset.url || asset.path || "");
    if ((asset.type === "image" || isImageUri(uri)) && isHighResImageUri(uri)) {
      images.push({ uri, source: "media-asset" });
    }
  }
  for (const link of card.tarotCard?.mediaLinks || []) {
    if (isHighResImageUri(link.imageUri)) images.push({ uri: normalizeUri(link.imageUri), source: "tarot-media-link" });
  }
  return uniqueByUri(images);
}

function collectFirstFrameImages(card = {}) {
  const images = [];
  for (const asset of card.mediaAssets || []) {
    const uri = normalizeUri(asset.uri || asset.thumbnailUri || "");
    if ((asset.type === "image" || isImageUri(uri)) && isLikelyVideoFrame(uri)) {
      images.push({ uri, source: "first-frame-asset" });
    }
    if (isLikelyVideoFrame(asset.thumbnailUri)) images.push({ uri: normalizeUri(asset.thumbnailUri), source: "thumbnail" });
  }
  for (const link of card.tarotCard?.mediaLinks || []) {
    for (const uri of [link.imageUri, link.posterUri]) {
      if (isLikelyVideoFrame(uri)) images.push({ uri: normalizeUri(uri), source: "tarot-media-link-frame" });
    }
  }
  return uniqueByUri(images);
}

function collectVideos(card = {}) {
  const videos = [];
  for (const asset of card.mediaAssets || []) {
    const uri = normalizeUri(asset.uri || asset.url || asset.path || "");
    if (asset.type === "video" || isVideoUri(uri)) videos.push(uri);
  }
  for (const link of card.tarotCard?.mediaLinks || []) {
    if (isVideoUri(link.videoUri)) videos.push(normalizeUri(link.videoUri));
  }
  return unique(videos);
}

function ensureImage(uniqueImages, uri) {
  const normalized = normalizeUri(uri);
  const existing = uniqueImages.get(normalized);
  if (existing) return existing;
  const record = {
    uri: normalized,
    path: resolveMediaPath(normalized),
    dimensions: null,
    cardIds: new Set(),
    cardTitles: new Set(),
    sources: new Set(),
    pairedVideoUris: new Set()
  };
  uniqueImages.set(normalized, record);
  return record;
}

async function hydrateImageDimensions(images = []) {
  for (const image of images) {
    if (!image.path || !existsSync(image.path)) continue;
    image.dimensions = await probeImage(image.path);
  }
}

async function probeImage(filePath) {
  try {
    const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath], {
      maxBuffer: 1024 * 1024
    });
    const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
    const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

function summarizeCard(card) {
  return {
    cardId: card.cardId,
    title: card.title,
    cardType: card.cardType,
    tarotType: card.tarotType,
    functionalType: card.functionalType,
    highResImageCount: card.highResImageUris.length,
    firstFrameImageCount: card.firstFrameImageUris.length,
    videoCount: card.videoUris.length,
    strictPairCount: card.strictHighResPairs.length,
    highResImageUris: card.highResImageUris.slice(0, 3),
    videoUris: card.videoUris.slice(0, 3)
  };
}

function summarizeImage(image) {
  return {
    uri: image.uri,
    dimensions: image.dimensions,
    cardIds: [...image.cardIds].slice(0, 6),
    cardTitles: [...image.cardTitles].slice(0, 6),
    sources: [...image.sources].sort(),
    pairedVideoUris: [...image.pairedVideoUris].slice(0, 3)
  };
}

function isTarotLikeCard(card = {}) {
  return Boolean(card.tarotCard || card.shipCard || /tarot/i.test(card.cardType || "") || (card.tags || []).includes("tarot-card"));
}

function isHighResImageUri(uri = "") {
  return isImageUri(uri) && !isLikelyVideoFrame(uri) && !/thumbnail|poster/i.test(String(uri));
}

function isLikelyVideoFrame(uri = "") {
  return /(?:^|[-_/])(first|frame|poster|thumb|thumbnail)(?:[-_.]|$)/i.test(String(uri || ""));
}

function isImageUri(uri = "") {
  return /\.(png|jpe?g|webp|gif|tiff?|bmp)(\?|#|$)/i.test(String(uri || ""));
}

function isVideoUri(uri = "") {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(uri || ""));
}

function resolveMediaPath(uri = "") {
  if (!uri) return "";
  if (uri.startsWith("/media/")) return path.join(DATA_DIR, uri);
  if (path.isAbsolute(uri)) return uri;
  return path.join(ROOT, uri);
}

function normalizeUri(uri = "") {
  return String(uri || "").trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueByUri(items = []) {
  const byUri = new Map();
  for (const item of items) {
    if (!item.uri) continue;
    byUri.set(item.uri, item);
  }
  return [...byUri.values()];
}

function parseArgs(argv = []) {
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
