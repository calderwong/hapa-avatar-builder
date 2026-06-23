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
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const REPORT_DIR = path.join(DATA_DIR, "tarot-media-pair-audit");
const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run");
const visualThreshold = Number(args.get("visual-threshold") || 0.88);
const combinedThreshold = Number(args.get("combined-threshold") || 0.92);
const minVisualForMetadataMatch = Number(args.get("metadata-visual-threshold") || 0.8);
const maxCandidates = Number(args.get("max-candidates") || 100000);
const RUN_ID = `tarot-media-consolidation-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const LATEST_REPORT_PATH = path.join(REPORT_DIR, "consolidation-latest-report.json");
const RUN_REPORT_PATH = path.join(REPORT_DIR, "runs", `${RUN_ID}.json`);

await main();

async function main() {
  const rawStoreText = await fs.readFile(ITEM_STORE_PATH, "utf8");
  const store = normalizeItemManagerStore(JSON.parse(rawStoreText));
  const tarotCards = (store.cards || []).filter(isTarotLikeCard);
  const cards = tarotCards.map(auditCard);
  const imageOnlyCards = cards.filter((card) => card.highResImageUris.length && !card.videoUris.length);
  const videoOnlyCards = cards.filter((card) => !card.highResImageUris.length && card.videoUris.length && card.firstFrameImageUris.length);

  const hashInputs = unique([
    ...imageOnlyCards.flatMap((card) => card.highResImageUris),
    ...videoOnlyCards.flatMap((card) => card.firstFrameImageUris)
  ]);
  const hashes = await hashImages(hashInputs);
  const candidates = buildCandidates(imageOnlyCards, videoOnlyCards, hashes)
    .sort((first, second) => second.score - first.score || second.visualScore - first.visualScore)
    .slice(0, maxCandidates);
  const matches = selectMatches(candidates);

  const cardsById = new Map(store.cards.map((card) => [card.id, card]));
  const touchedCardIds = new Set();
  const now = new Date().toISOString();
  const missingHashUris = hashInputs.filter((uri) => !hashes.has(uri));
  const firstFrameFallbacks = [];

  for (const match of matches) {
    const imageCard = cardsById.get(match.imageCardId);
    const videoCard = cardsById.get(match.videoCardId);
    if (!imageCard || !videoCard) continue;
    const imageAsset = findImageAsset(imageCard, match.imageUri) || makeImageAsset(imageCard, match.imageUri, {
      title: `${imageCard.title || "Tarot"} high-res image`,
      tags: ["tarot-card", "high-res", "image-similarity-source"],
      notes: "Recovered as high-res still during tarot media consolidation."
    });
    const videoAsset = findVideoAsset(videoCard, match.videoUri) || makeVideoAsset(videoCard, match.videoUri, match.firstFrameUri, {
      title: `${videoCard.title || "Tarot"} loop`,
      tags: ["tarot-card", "looping-video", "image-similarity-source"],
      notes: "Recovered as looping video during tarot media consolidation."
    });
    const firstFrameAsset = findImageAsset(videoCard, match.firstFrameUri) || makeImageAsset(videoCard, match.firstFrameUri, {
      title: `${videoCard.title || "Tarot"} first frame`,
      tags: ["tarot-card", "first-frame"],
      notes: "Recovered first frame during tarot media consolidation."
    });

    const imageAssetOnVideoCard = ensureMediaAsset(videoCard, imageAsset, {
      id: `${videoCard.id}-paired-image-${shortHash(match.imageUri)}`,
      sourceAssetId: imageAsset.id,
      title: `${imageCard.title || "Tarot"} high-res still`,
      tags: ["tarot-card", "high-res", "image-similarity-paired"],
      notes: `High-res still paired from ${imageCard.id} by perceptual image similarity.`
    });
    const videoAssetOnImageCard = ensureMediaAsset(imageCard, videoAsset, {
      id: `${imageCard.id}-paired-video-${shortHash(match.videoUri)}`,
      sourceAssetId: videoAsset.id,
      title: `${videoCard.title || "Tarot"} loop`,
      tags: ["tarot-card", "looping-video", "image-similarity-paired"],
      notes: `Loop paired from ${videoCard.id} by perceptual image similarity.`
    });
    ensureMediaAsset(imageCard, firstFrameAsset, {
      id: `${imageCard.id}-paired-first-frame-${shortHash(match.firstFrameUri)}`,
      sourceAssetId: firstFrameAsset.id,
      title: `${videoCard.title || "Tarot"} loop first frame`,
      tags: ["tarot-card", "first-frame", "image-similarity-paired"],
      notes: `First frame paired from ${videoCard.id} by perceptual image similarity.`
    });

    ensureMediaLink(imageCard, {
      imageAssetId: imageAsset.id,
      videoAssetId: videoAssetOnImageCard.id,
      imageUri: match.imageUri,
      videoUri: match.videoUri,
      posterUri: match.firstFrameUri,
      score: match.score,
      reason: `Matched high-res image to first video frame by image similarity (${match.visualScore.toFixed(3)} visual, ${match.score.toFixed(3)} combined).`
    });
    ensureMediaLink(videoCard, {
      imageAssetId: imageAssetOnVideoCard.id,
      videoAssetId: videoAsset.id,
      imageUri: match.imageUri,
      videoUri: match.videoUri,
      posterUri: match.firstFrameUri,
      score: match.score,
      reason: `Consolidated with ${imageCard.title || imageCard.id} high-res still by image similarity (${match.visualScore.toFixed(3)} visual, ${match.score.toFixed(3)} combined).`
    });
    addCardConnection(imageCard, videoCard.id);
    addCardConnection(videoCard, imageCard.id);
    addTag(imageCard, "image-similarity-paired");
    addTag(videoCard, "image-similarity-paired");
    addHistory(imageCard, {
      eventId: `${RUN_ID}-${shortHash(`${imageCard.id}:${videoCard.id}`)}`,
      label: "Tarot media pair consolidated",
      happenedAt: now,
      notes: `Linked high-res image ${path.basename(match.imageUri)} with video ${path.basename(match.videoUri)} from ${videoCard.title || videoCard.id}.`
    });
    addHistory(videoCard, {
      eventId: `${RUN_ID}-${shortHash(`${videoCard.id}:${imageCard.id}`)}`,
      label: "Tarot media pair consolidated",
      happenedAt: now,
      notes: `Linked video ${path.basename(match.videoUri)} with high-res image ${path.basename(match.imageUri)} from ${imageCard.title || imageCard.id}.`
    });
    touchedCardIds.add(imageCard.id);
    touchedCardIds.add(videoCard.id);
  }

  const matchedVideoCardIds = new Set(matches.map((match) => match.videoCardId));
  for (const videoOnly of videoOnlyCards) {
    if (matchedVideoCardIds.has(videoOnly.cardId)) continue;
    const videoCard = cardsById.get(videoOnly.cardId);
    if (!videoCard) continue;
    for (const videoUri of videoOnly.videoUris) {
      const firstFrameUri = videoOnly.firstFrameImageUris[0] || "";
      if (!firstFrameUri) continue;
      const imageAsset = ensureMediaAsset(videoCard, makeImageAsset(videoCard, firstFrameUri, {
        id: `${videoCard.id}-static-first-frame-${shortHash(firstFrameUri)}`,
        title: `${videoCard.title || "Tarot"} static first frame`,
        tags: ["tarot-card", "first-frame", "static-image-fallback"],
        notes: "Using the video first frame as the temporary static card image until a high-res still is found."
      }));
      const videoAsset = findVideoAsset(videoCard, videoUri) || makeVideoAsset(videoCard, videoUri, firstFrameUri, {
        title: `${videoCard.title || "Tarot"} loop`,
        tags: ["tarot-card", "looping-video"],
        notes: "Looping video preserved during first-frame fallback consolidation."
      });
      ensureMediaAsset(videoCard, videoAsset);
      ensureMediaLink(videoCard, {
        imageAssetId: imageAsset.id,
        videoAssetId: videoAsset.id,
        imageUri: firstFrameUri,
        videoUri,
        posterUri: firstFrameUri,
        score: 1,
        reason: "No high-res still matched yet; using the first frame as the static card image for now."
      });
      addTag(videoCard, "first-frame-static-image");
      touchedCardIds.add(videoCard.id);
      firstFrameFallbacks.push({
        cardId: videoCard.id,
        title: videoCard.title,
        videoUri,
        imageUri: firstFrameUri
      });
    }
  }

  const postCards = store.cards.filter(isTarotLikeCard).map(auditCard);
  const report = {
    schemaVersion: "hapa.tarot-media-consolidation.v1",
    runId: RUN_ID,
    generatedAt: now,
    dryRun,
    source: "scripts/consolidate-tarot-media-pairs.mjs",
    thresholds: {
      visualThreshold,
      combinedThreshold,
      minVisualForMetadataMatch
    },
    summary: {
      tarotCards: tarotCards.length,
      imageOnlyBefore: imageOnlyCards.length,
      videoOnlyWithFirstFrameBefore: videoOnlyCards.length,
      candidatePairs: candidates.length,
      matchedPairs: matches.length,
      highResCardsTouched: new Set(matches.map((match) => match.imageCardId)).size,
      videoCardsTouched: new Set(matches.map((match) => match.videoCardId)).size,
      firstFrameFallbacks: firstFrameFallbacks.length,
      touchedCards: touchedCardIds.size,
      missingHashInputs: missingHashUris.length,
      imageOnlyAfterProjected: postCards.filter((card) => card.highResImageUris.length && !card.videoUris.length).length,
      videoOnlyAfterProjected: postCards.filter((card) => !card.highResImageUris.length && card.videoUris.length).length,
      strictHighResPairsAfterProjected: postCards.filter((card) => card.strictHighResPairs.length).length
    },
    matches: matches.slice(0, 500),
    firstFrameFallbacks: firstFrameFallbacks.slice(0, 500),
    missingHashUris: missingHashUris.slice(0, 200),
    topRejectedCandidates: candidates
      .filter((candidate) => !matches.some((match) => match.videoCardId === candidate.videoCardId && match.imageCardId === candidate.imageCardId && match.imageUri === candidate.imageUri))
      .slice(0, 80)
  };

  await fs.mkdir(path.dirname(RUN_REPORT_PATH), { recursive: true });
  await fs.writeFile(RUN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(LATEST_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  if (!dryRun) {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `item-manager-store.before-${RUN_ID}.json`);
    await fs.writeFile(backupPath, rawStoreText);
    await fs.writeFile(ITEM_STORE_PATH, `${JSON.stringify(normalizeItemManagerStore(store), null, 2)}\n`);
    report.summary.backupPath = path.relative(ROOT, backupPath);
    await fs.writeFile(RUN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(LATEST_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    reportPath: path.relative(ROOT, LATEST_REPORT_PATH),
    runReportPath: path.relative(ROOT, RUN_REPORT_PATH),
    ...report.summary
  }, null, 2));
}

function buildCandidates(imageOnlyCards, videoOnlyCards, hashes) {
  const candidates = [];
  for (const imageCard of imageOnlyCards) {
    for (const imageUri of imageCard.highResImageUris) {
      const imageHash = hashes.get(imageUri);
      if (!imageHash) continue;
      for (const videoCard of videoOnlyCards) {
        for (const firstFrameUri of videoCard.firstFrameImageUris) {
          const frameHash = hashes.get(firstFrameUri);
          if (!frameHash) continue;
          const visualScore = compareImageHashes(imageHash, frameHash);
          const metadataScore = metadataMatchScore(imageCard, videoCard);
          const score = Math.min(1, visualScore + metadataScore);
          const accepted = visualScore >= visualThreshold || (
            hasMeaningfulTitleMatch(imageCard, videoCard) &&
            visualScore >= minVisualForMetadataMatch &&
            score >= combinedThreshold
          );
          if (!accepted) continue;
          candidates.push({
            imageCardId: imageCard.cardId,
            imageTitle: imageCard.title,
            imageTarotType: imageCard.tarotType,
            imageFunctionalType: imageCard.functionalType,
            imageUri,
            videoCardId: videoCard.cardId,
            videoTitle: videoCard.title,
            videoTarotType: videoCard.tarotType,
            videoFunctionalType: videoCard.functionalType,
            firstFrameUri,
            videoUri: videoCard.videoUris[0] || "",
            visualScore: Number(visualScore.toFixed(4)),
            metadataScore: Number(metadataScore.toFixed(4)),
            score: Number(score.toFixed(4))
          });
        }
      }
    }
  }
  return candidates;
}

function selectMatches(candidates = []) {
  const usedVideos = new Set();
  const usedImageUris = new Map();
  const matches = [];
  for (const candidate of candidates) {
    if (!candidate.videoUri || !candidate.firstFrameUri || !candidate.imageUri) continue;
    if (usedVideos.has(candidate.videoUri)) continue;
    const imageUseCount = usedImageUris.get(candidate.imageUri) || 0;
    if (imageUseCount >= 3 && candidate.visualScore < 0.92) continue;
    usedVideos.add(candidate.videoUri);
    usedImageUris.set(candidate.imageUri, imageUseCount + 1);
    matches.push(candidate);
  }
  return matches;
}

async function hashImages(uris = []) {
  const results = new Map();
  let completed = 0;
  const queue = [...uris];
  const workers = Array.from({ length: Math.min(6, Math.max(1, queue.length)) }, async () => {
    while (queue.length) {
      const uri = queue.shift();
      const filePath = resolveMediaPath(uri);
      if (!filePath || !existsSync(filePath)) continue;
      try {
        results.set(uri, await perceptualImageHash(filePath));
      } catch (error) {
        if (args.has("verbose")) console.warn(`Could not hash ${uri}: ${error.message}`);
      } finally {
        completed += 1;
        if (args.has("verbose") && completed % 50 === 0) console.warn(`hashed ${completed}/${uris.length}`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function perceptualImageHash(filePath) {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-i", filePath,
    "-frames:v", "1",
    "-vf", "scale=32:32:flags=area,format=gray",
    "-f", "rawvideo",
    "pipe:1"
  ], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 8
  });
  const pixels = Uint8Array.from(stdout);
  if (pixels.length < 1024) throw new Error(`expected 1024 grayscale pixels, got ${pixels.length}`);
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const averageBits = new Uint8Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) {
    averageBits[index] = pixels[index] >= mean ? 1 : 0;
  }
  const differenceBits = new Uint8Array(31 * 32);
  let out = 0;
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 31; x += 1) {
      const left = pixels[y * 32 + x];
      const right = pixels[y * 32 + x + 1];
      differenceBits[out] = left > right ? 1 : 0;
      out += 1;
    }
  }
  return { averageBits, differenceBits };
}

function compareImageHashes(first, second) {
  const averageSimilarity = bitSimilarity(first.averageBits, second.averageBits);
  const differenceSimilarity = bitSimilarity(first.differenceBits, second.differenceBits);
  return averageSimilarity * 0.58 + differenceSimilarity * 0.42;
}

function bitSimilarity(first = [], second = []) {
  const length = Math.min(first.length, second.length);
  if (!length) return 0;
  let same = 0;
  for (let index = 0; index < length; index += 1) {
    if (first[index] === second[index]) same += 1;
  }
  return same / length;
}

function metadataMatchScore(first, second) {
  const firstTitle = normalizeLabel(first.tarotType || first.title);
  const secondTitle = normalizeLabel(second.tarotType || second.title);
  const firstFunctional = normalizeLabel(first.functionalType || first.cardType);
  const secondFunctional = normalizeLabel(second.functionalType || second.cardType);
  let score = 0;
  if (isMeaningfulLabel(firstTitle) && firstTitle === secondTitle) score += 0.08;
  if (isMeaningfulLabel(firstFunctional) && firstFunctional === secondFunctional) score += 0.04;
  const firstCardType = normalizeLabel(first.cardType);
  const secondCardType = normalizeLabel(second.cardType);
  if (isMeaningfulLabel(firstCardType) && firstCardType === secondCardType) score += 0.02;
  return score;
}

function hasMeaningfulTitleMatch(first, second) {
  const firstTitle = normalizeLabel(first.tarotType || first.title);
  const secondTitle = normalizeLabel(second.tarotType || second.title);
  return isMeaningfulLabel(firstTitle) && firstTitle === secondTitle;
}

function auditCard(card) {
  const highResImages = collectHighResImages(card);
  const firstFrameImages = collectFirstFrameImages(card);
  const videos = collectVideos(card);
  const strictHighResPairs = [];
  const firstFramePairs = [];

  for (const link of card.tarotCard?.mediaLinks || []) {
    if (!isVideoUri(link.videoUri)) continue;
    if (isHighResImageUri(link.imageUri)) {
      strictHighResPairs.push({ imageUri: normalizeUri(link.imageUri), videoUri: normalizeUri(link.videoUri), linkId: link.id || "" });
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

function ensureMediaAsset(card, sourceAsset, overrides = {}) {
  if (!card.mediaAssets) card.mediaAssets = [];
  const uri = sourceAsset?.uri || overrides.uri || "";
  const thumbnailUri = sourceAsset?.thumbnailUri || overrides.thumbnailUri || "";
  const existing = card.mediaAssets.find((asset) =>
    (uri && normalizeUri(asset.uri) === normalizeUri(uri)) ||
    (thumbnailUri && normalizeUri(asset.thumbnailUri) === normalizeUri(thumbnailUri))
  );
  if (existing) {
    existing.tags = unique([...(existing.tags || []), ...(overrides.tags || [])]);
    if (overrides.notes && !String(existing.notes || "").includes(overrides.notes)) {
      existing.notes = [existing.notes, overrides.notes].filter(Boolean).join("\n");
    }
    if (!existing.thumbnailUri && thumbnailUri) existing.thumbnailUri = thumbnailUri;
    return existing;
  }
  const nextAsset = {
    ...(sourceAsset || {}),
    ...overrides,
    uri,
    thumbnailUri,
    id: overrides.id || sourceAsset?.id || `media-${shortHash(uri || thumbnailUri)}`,
    type: overrides.type || sourceAsset?.type || inferMediaAssetType(uri || thumbnailUri),
    title: overrides.title || sourceAsset?.title || "",
    sourceAssetId: overrides.sourceAssetId || sourceAsset?.sourceAssetId || sourceAsset?.id || "",
    tags: unique([...(sourceAsset?.tags || []), ...(overrides.tags || [])]),
    confidence: overrides.confidence || sourceAsset?.confidence || "soft",
    notes: overrides.notes || sourceAsset?.notes || "",
    metadata: {
      ...(sourceAsset?.metadata || {}),
      ...(overrides.metadata || {})
    }
  };
  card.mediaAssets.push(nextAsset);
  return nextAsset;
}

function ensureMediaLink(card, { imageAssetId = "", videoAssetId = "", imageUri = "", videoUri = "", posterUri = "", score = 0, reason = "" } = {}) {
  if (!card.tarotCard) card.tarotCard = {};
  if (!Array.isArray(card.tarotCard.mediaLinks)) card.tarotCard.mediaLinks = [];
  const existing = card.tarotCard.mediaLinks.find((link) => normalizeUri(link.videoUri) === normalizeUri(videoUri));
  if (existing) {
    existing.imageAssetId = imageAssetId || existing.imageAssetId || "";
    existing.videoAssetId = videoAssetId || existing.videoAssetId || "";
    existing.imageUri = imageUri || existing.imageUri || "";
    existing.posterUri = posterUri || existing.posterUri || existing.imageUri || "";
    existing.confidence = existing.confidence || "image-similarity";
    existing.reason = reason || existing.reason || "";
    return existing;
  }
  const link = {
    id: `${card.id}-media-pair-${shortHash(`${imageUri}:${videoUri}`)}`,
    imageAssetId,
    videoAssetId,
    imageUri,
    videoUri,
    posterUri,
    confidence: "image-similarity",
    reason: reason || `Consolidated media pair with score ${score.toFixed(3)}.`
  };
  card.tarotCard.mediaLinks.push(link);
  return link;
}

function addCardConnection(card, otherCardId) {
  if (!otherCardId) return;
  if (!card.connections) card.connections = {};
  card.connections.itemIds = unique([...(card.connections.itemIds || []), otherCardId]);
}

function addHistory(card, event) {
  if (!Array.isArray(card.history)) card.history = [];
  if (card.history.some((item) => item.eventId && item.eventId === event.eventId)) return;
  card.history.push(event);
}

function addTag(card, tag) {
  card.tags = unique([...(card.tags || []), tag]);
}

function findImageAsset(card, uri) {
  return (card.mediaAssets || []).find((asset) => normalizeUri(asset.uri) === normalizeUri(uri) && (asset.type === "image" || isImageUri(asset.uri)));
}

function findVideoAsset(card, uri) {
  return (card.mediaAssets || []).find((asset) => normalizeUri(asset.uri) === normalizeUri(uri) && (asset.type === "video" || isVideoUri(asset.uri)));
}

function makeImageAsset(card, uri, overrides = {}) {
  return {
    id: overrides.id || `${card.id}-image-${shortHash(uri)}`,
    title: overrides.title || `${card.title || "Tarot"} image`,
    type: "image",
    uri,
    thumbnailUri: overrides.thumbnailUri || uri,
    sourceAssetId: overrides.sourceAssetId || "",
    avatarId: "",
    requirementId: "",
    mimeType: mimeTypeForUri(uri),
    width: 0,
    height: 0,
    tags: overrides.tags || ["tarot-card", "image"],
    confidence: overrides.confidence || "soft",
    notes: overrides.notes || "",
    metadata: overrides.metadata || {},
    createdAt: "",
    updatedAt: ""
  };
}

function makeVideoAsset(card, uri, thumbnailUri = "", overrides = {}) {
  return {
    id: overrides.id || `${card.id}-video-${shortHash(uri)}`,
    title: overrides.title || `${card.title || "Tarot"} video`,
    type: "video",
    uri,
    thumbnailUri,
    sourceAssetId: overrides.sourceAssetId || "",
    avatarId: "",
    requirementId: "",
    mimeType: mimeTypeForUri(uri),
    width: 0,
    height: 0,
    tags: overrides.tags || ["tarot-card", "video"],
    confidence: overrides.confidence || "soft",
    notes: overrides.notes || "",
    metadata: overrides.metadata || {},
    createdAt: "",
    updatedAt: ""
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

function inferMediaAssetType(uri = "") {
  if (isVideoUri(uri)) return "video";
  if (isImageUri(uri)) return "image";
  return "media";
}

function mimeTypeForUri(uri = "") {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  return "";
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

function normalizeLabel(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isMeaningfulLabel(value = "") {
  const normalized = normalizeLabel(value);
  if (!normalized || normalized === "hapa tarot" || normalized === "tarot" || normalized === "card") return false;
  if (normalized.startsWith("mimi tarot jun")) return false;
  if (/^[0-9a-f]{6,}(?: [0-9a-f]{3,})*$/i.test(normalized)) return false;
  return true;
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

function shortHash(value = "") {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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
