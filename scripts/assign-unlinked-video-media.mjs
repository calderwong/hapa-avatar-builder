#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";
import { normalizeInventoryStore, normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const runId = `video-media-healing-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const now = new Date().toISOString();
const reportDir = path.join(ROOT, "data/video-linking-pass");
const reportPath = path.join(reportDir, "video-media-link-report.json");
const runReportPath = path.join(reportDir, "runs", `${runId}.json`);
const backupDir = path.join(ROOT, "data/backups/video-linking-pass", runId);

const paths = {
  avatarStore: "data/avatar-store.json",
  itemStore: "data/item-manager-store.json",
  inventoryStore: "data/inventory-store.json",
  sceneStore: "data/scene-store.json",
  mimiManifest: "data/mimi-card-shop-ingest/manifest.json",
  shipManifest: "data/ship-card-ingest/ships3/manifest.json"
};

const QUALITY_TIERS = [
  { key: "common", label: "Common", maxPercentile: 0.34 },
  { key: "uncommon", label: "Uncommon", maxPercentile: 0.54 },
  { key: "rare", label: "Rare", maxPercentile: 0.72 },
  { key: "epic", label: "Epic", maxPercentile: 0.84 },
  { key: "legendary", label: "Legendary", maxPercentile: 0.92 },
  { key: "mythic", label: "Mythic", maxPercentile: 0.97 },
  { key: "divine", label: "Divine", maxPercentile: 0.995 },
  { key: "primordial", label: "Primordial", maxPercentile: 1 }
];

const QUALITY_TAGS = new Set(QUALITY_TIERS.map((tier) => `quality-${tier.key}`));

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "your", "you", "are", "was", "were",
  "card", "cards", "hapa", "tarot", "system", "video", "image", "media", "core", "meaning", "upright",
  "inverted", "major", "minor", "arcana", "source", "scene", "avatar", "dear", "papa"
]);

function readJson(relativePath, fallback = {}) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return fallback;
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function writeJson(absolutePath, value) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function backup(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath) || dryRun) return "";
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, path.basename(relativePath));
  fs.copyFileSync(absolutePath, target);
  return target;
}

function hash(value, length = 10) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, length);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function isVideoUri(uri = "") {
  return /\.(mp4|m4v|mov|webm)(\?|#|$)/i.test(String(uri || ""));
}

function isMediaUri(uri = "") {
  return /^\/media\//.test(String(uri || "")) || /\.(png|jpe?g|webp|gif|svg|mp4|m4v|mov|webm)(\?|#|$)/i.test(String(uri || ""));
}

function assetUri(asset = {}) {
  return asset.uri || asset.url || asset.path || asset.storage?.uri || "";
}

function mediaPosterUri(asset = {}) {
  return asset.thumbnailUri || asset.thumbnail_uri || asset.posterUri || asset.poster_uri || asset.metadata?.thumbnailUri || asset.metadata?.thumbnail?.uri || "";
}

function addVideo(videosByUri, input = {}) {
  const uri = input.uri || input.mediaUri || input.videoUri || assetUri(input.asset);
  if (!uri || !isVideoUri(uri)) return null;
  const entry = videosByUri.get(uri) || {
    uri,
    cardIds: new Set(),
    titles: new Set(),
    posterUris: new Set(),
    sourcePaths: new Set(),
    tags: new Set(),
    sources: [],
    text: ""
  };
  for (const cardId of input.cardIds || (input.cardId ? [input.cardId] : [])) entry.cardIds.add(cardId);
  for (const title of [input.title, input.asset?.title, input.asset?.name].filter(Boolean)) entry.titles.add(title);
  for (const posterUri of [input.posterUri, input.firstFrameUri, input.asset?.thumbnailUri, mediaPosterUri(input.asset)].filter(Boolean)) entry.posterUris.add(posterUri);
  for (const sourcePath of [input.sourcePath, input.sourceVideoPath, input.asset?.metadata?.sourcePath].filter(Boolean)) entry.sourcePaths.add(sourcePath);
  for (const tag of input.tags || input.asset?.tags || []) entry.tags.add(tag);
  entry.sources.push({ source: input.source || "unknown", cardId: input.cardId || "", id: input.id || input.asset?.id || "" });
  entry.text = [entry.text, input.text || "", input.title || "", input.sourcePath || ""].filter(Boolean).join("\n");
  videosByUri.set(uri, entry);
  return entry;
}

function asList(setLike) {
  return Array.isArray(setLike) ? setLike : [...(setLike || [])];
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function flattenText(value, depth = 0) {
  if (depth > 4 || value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item, depth + 1)).join(" ");
  if (typeof value === "object") return Object.values(value).map((item) => flattenText(item, depth + 1)).join(" ");
  return "";
}

function cardText(card = {}) {
  return cleanText([
    card.title,
    card.summary,
    card.description,
    card.lore,
    card.tags,
    card.utility,
    card.broadGameMechanics,
    card.tarotCard?.title,
    card.tarotCard?.subtitle,
    card.tarotCard?.archetype,
    card.tarotCard?.keywords,
    card.tarotCard?.flavorText,
    card.tarotCard?.effectText,
    card.tarotCard?.catalog?.typeLabel,
    card.tarotCard?.lore,
    card.tarotCard?.mechanics,
    card.tarotCard?.ocr?.rawText,
    card.shipCard?.title,
    card.shipCard?.subtitle,
    card.shipCard?.keywords,
    card.shipCard?.flavorText,
    card.shipCard?.effectText,
    card.shipCard?.ocr?.rawText
  ].map((item) => flattenText(item)).join(" "));
}

function avatarText(avatar = {}) {
  return cleanText([
    avatar.primaryName,
    avatar.names?.map((name) => name.name || name),
    avatar.aliases,
    avatar.summary,
    avatar.three_paragraph_background_narrative,
    avatar.mind?.personaAnchor,
    avatar.mind?.soulSeed,
    avatar.mind?.selfKnowledge,
    avatar.mind?.contextMap,
    avatar.mind?.memoryLedger,
    avatar.mind?.protocolCardLoadout,
    avatar.mind?.skillCardLoadout,
    avatar.mind?.tarotCardDeck
  ].map((item) => flattenText(item)).join(" "));
}

function sceneText(scene = {}) {
  return cleanText([
    scene.title,
    scene.summary,
    scene.quickPitch,
    scene.overallNarrative,
    scene.narrativeText,
    scene.expositionBeats,
    scene.actionBeats,
    scene.characterGrowth,
    scene.learningObjectives,
    scene.hapaMechanics,
    scene.managementSkills,
    scene.tags,
    scene.avatarTags?.map((tag) => tag.avatarId)
  ].map((item) => flattenText(item)).join(" "));
}

function tokenize(text = "") {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenScore(aTokens = [], bTokenSet = new Set()) {
  let score = 0;
  const seen = new Set();
  for (const token of aTokens) {
    if (seen.has(token) || !bTokenSet.has(token)) continue;
    seen.add(token);
    score += token.length > 6 ? 2 : 1;
  }
  return score;
}

function briefOcr(card = {}, fallbackText = "") {
  const raw = card.tarotCard?.ocr?.rawText || card.shipCard?.ocr?.rawText || fallbackText || cardText(card);
  return cleanText(raw).slice(0, 220);
}

function typeLabel(card = {}) {
  return cleanText(card.tarotCard?.catalog?.typeLabel || card.cardType || card.kind || "card").replace(/_/g, " ");
}

function buildCardMaps(cards = []) {
  const byId = new Map();
  const byPairing = new Map();
  const byTitle = new Map();
  for (const card of cards) {
    if (card.id) byId.set(card.id, card);
    if (card.tarotCard?.catalog?.pairingKey) byPairing.set(card.tarotCard.catalog.pairingKey, card);
    byTitle.set(`${cleanText(card.title).toLowerCase()}::${String(card.cardType || "").toLowerCase()}`, card);
    byTitle.set(cleanText(card.title).toLowerCase(), card);
  }
  return { byId, byPairing, byTitle };
}

function addManifestVideos(videosByUri, itemMaps, mimiManifest = {}, shipManifest = {}) {
  const mimiRecordById = new Map((mimiManifest.records || []).map((record) => [record.id, record]));
  const pairingByVideoId = new Map();
  for (const pairing of mimiManifest.pairings || []) {
    for (const videoId of pairing.videoIds || []) pairingByVideoId.set(videoId, pairing);
  }
  for (const record of mimiManifest.records || []) {
    if (record.kind !== "video" && !isVideoUri(record.mediaUri)) continue;
    const pairing = pairingByVideoId.get(record.id);
    const card = pairing
      ? itemMaps.byPairing.get(pairing.pairingKey) || itemMaps.byTitle.get(cleanText(pairing.title).toLowerCase())
      : itemMaps.byTitle.get(cleanText(record.title).toLowerCase());
    addVideo(videosByUri, {
      id: record.id,
      uri: record.mediaUri,
      posterUri: record.posterUri,
      sourcePath: record.sourcePath,
      title: pairing?.title || record.title,
      cardId: card?.id,
      tags: [record.mainType, "mimi-card-shop", "tarot-card"],
      source: "mimi-card-shop-manifest",
      text: [
        record.title,
        record.mainType,
        pairing?.title,
        pairing?.pairingKey,
        ...((pairing?.imageIds || []).map((imageId) => mimiRecordById.get(imageId)?.title).filter(Boolean))
      ].join(" ")
    });
  }

  for (const record of shipManifest.records || []) {
    if (!isVideoUri(record.videoUri)) continue;
    const card = itemMaps.byId.get(record.id) || itemMaps.byTitle.get(cleanText(record.title).toLowerCase());
    addVideo(videosByUri, {
      id: record.id,
      uri: record.videoUri,
      posterUri: record.firstFrameUri,
      sourcePath: record.sourceVideoPath,
      title: record.title,
      cardId: card?.id || record.id,
      tags: ["ship-card", "tarot-card", "ships3", ...(record.keywords || [])],
      source: "ship-card-manifest",
      text: [record.title, record.subtitle, record.tarotNumber, record.keywords].join(" ")
    });
  }
}

function collectVideos(itemStore = {}, mimiManifest = {}, shipManifest = {}) {
  const cards = itemStore.cards || [];
  const videosByUri = new Map();
  const itemMaps = buildCardMaps(cards);
  for (const card of cards) {
    for (const asset of card.mediaAssets || []) {
      const uri = assetUri(asset);
      if (asset.type === "video" || isVideoUri(uri)) {
        addVideo(videosByUri, {
          uri,
          asset,
          cardId: card.id,
          title: asset.title || card.title,
          tags: [...(asset.tags || []), ...(card.tags || [])],
          source: "item-card-media",
          text: cardText(card)
        });
      }
    }
    for (const link of card.tarotCard?.mediaLinks || []) {
      if (!isVideoUri(link.videoUri)) continue;
      addVideo(videosByUri, {
        uri: link.videoUri,
        posterUri: link.posterUri,
        cardId: card.id,
        title: card.title,
        tags: card.tags || [],
        source: "tarot-media-link",
        text: cardText(card)
      });
    }
  }
  addManifestVideos(videosByUri, itemMaps, mimiManifest, shipManifest);
  return videosByUri;
}

function collectAssignedVideoUris(itemStore = {}, sceneStore = {}, avatarStore = {}) {
  const tarot = new Set();
  const scene = new Set();
  const avatar = new Set();
  for (const card of itemStore.cards || []) {
    for (const link of card.tarotCard?.mediaLinks || []) {
      if (isVideoUri(link.videoUri)) tarot.add(link.videoUri);
    }
  }
  for (const sceneRecord of sceneStore.scenes || []) {
    for (const asset of sceneRecord.assets || []) {
      const uri = assetUri(asset);
      if (asset.type === "video" || isVideoUri(uri)) scene.add(uri);
    }
  }
  for (const avatarRecord of avatarStore.avatars || []) {
    for (const asset of avatarRecord.assets || []) {
      const uri = assetUri(asset);
      if (asset.type === "video" || isVideoUri(uri)) avatar.add(uri);
    }
  }
  return { tarot, scene, avatar };
}

function buildInventoryCardOwners(inventoryStore = {}) {
  const owners = new Map();
  const add = (cardId, avatarId) => {
    if (!cardId || !avatarId) return;
    if (!owners.has(cardId)) owners.set(cardId, new Set());
    owners.get(cardId).add(avatarId);
  };
  for (const inventory of inventoryStore.avatarInventories || []) {
    const avatarId = inventory.avatarId;
    for (const cardId of [
      ...(inventory.library || []),
      ...(inventory.deck || []),
      ...(inventory.hand || []),
      ...(inventory.trainingDeck || []),
      ...(inventory.hardpoints || []).flatMap((hardpoint) => hardpoint.cardIds || []),
      ...(inventory.cardStates || []).map((state) => state.cardId)
    ]) add(cardId, avatarId);
  }
  return owners;
}

function bestCardForVideo(video, cards, cardIndex) {
  const candidateIds = asList(video.cardIds).filter((cardId) => cardIndex.byId.has(cardId));
  if (candidateIds.length) {
    const cardId = candidateIds.find((id) =>
      (cardIndex.byId.get(id).mediaAssets || []).some((asset) => assetUri(asset) === video.uri) ||
      (cardIndex.byId.get(id).tarotCard?.mediaLinks || []).some((link) => link.videoUri === video.uri)
    ) || candidateIds[0];
    return { card: cardIndex.byId.get(cardId), score: 999, source: "existing-card-reference" };
  }

  const tokens = tokenize([asList(video.titles).join(" "), video.text, asList(video.tags).join(" ")].join(" "));
  let best = { card: null, score: 0, source: "ocr-token-match" };
  for (const card of cards) {
    const score = tokenScore(tokens, new Set(tokenize(cardText(card))));
    if (score > best.score) best = { card, score, source: "ocr-token-match" };
  }
  return best.card ? best : { card: cards[0] || null, score: 0, source: "fallback-first-card" };
}

function selectAvatarsForCard(card, video, avatars, inventoryOwners) {
  const avatarById = new Map(avatars.map((avatar) => [avatar.id, avatar]));
  const existing = unique([
    ...(card.connections?.avatarIds || []),
    ...asList(inventoryOwners.get(card.id))
  ]).filter((avatarId) => avatarById.has(avatarId));
  if (existing.length) return existing.slice(0, 2);

  const tokens = tokenize([cardText(card), video.text, asList(video.titles).join(" ")].join(" "));
  const scored = avatars
    .map((avatar) => ({ avatar, score: tokenScore(tokens, new Set(tokenize(avatarText(avatar)))) }))
    .sort((a, b) => b.score - a.score || String(a.avatar.primaryName || "").localeCompare(String(b.avatar.primaryName || "")));
  const selected = scored.filter((item) => item.score > 0).slice(0, 1).map((item) => item.avatar.id);
  return selected.length ? selected : avatars.slice(0, 1).map((avatar) => avatar.id);
}

function selectSceneForCard(card, video, scenes, avatarIds) {
  const existingScene = (card.connections?.sceneIds || []).map((sceneId) => scenes.find((scene) => scene.id === sceneId)).find(Boolean);
  if (existingScene) return existingScene;

  const tokens = tokenize([cardText(card), video.text, asList(video.titles).join(" ")].join(" "));
  const avatarSet = new Set(avatarIds);
  const scored = scenes
    .map((scene) => {
      const sceneAvatarIds = new Set((scene.avatarTags || []).map((tag) => tag.avatarId).filter(Boolean));
      const avatarScore = [...avatarSet].some((avatarId) => sceneAvatarIds.has(avatarId)) ? 10 : 0;
      return {
        scene,
        score: avatarScore + tokenScore(tokens, new Set(tokenize(sceneText(scene))))
      };
    })
    .sort((a, b) => b.score - a.score || (a.scene.canonicalTime?.order || 0) - (b.scene.canonicalTime?.order || 0));
  return scored[0]?.scene || scenes[0] || null;
}

function ensureCardVideoAsset(card, video, avatarIds, sceneId, reason) {
  const posterUri = asList(video.posterUris)[0] || "";
  const existing = (card.mediaAssets || []).find((asset) => assetUri(asset) === video.uri);
  if (existing) {
    existing.thumbnailUri = existing.thumbnailUri || posterUri;
    existing.avatarId = existing.avatarId || avatarIds[0] || "";
    existing.tags = unique([...(existing.tags || []), "video-healing-pass", "assigned-video"]);
    existing.metadata = {
      ...(existing.metadata || {}),
      cardId: card.id,
      sceneId,
      avatarIds,
      healingPassRunId: runId,
      sourcePaths: unique([...(existing.metadata?.sourcePaths || []), ...asList(video.sourcePaths)]),
      updatedAt: now
    };
    existing.notes = existing.notes || reason;
    existing.updatedAt = now;
    return false;
  }

  card.mediaAssets = [
    ...(card.mediaAssets || []),
    {
      id: `${card.id}-video-${hash(video.uri)}`,
      title: `${card.title} Video`,
      type: "video",
      uri: video.uri,
      thumbnailUri: posterUri,
      sourceAssetId: "",
      avatarId: avatarIds[0] || "",
      requirementId: "card_video",
      mimeType: "video/mp4",
      width: 0,
      height: 0,
      tags: unique(["video", "assigned-video", "video-healing-pass", ...(card.tags || []), ...asList(video.tags)]),
      confidence: "generated",
      notes: reason,
      metadata: {
        cardId: card.id,
        sceneId,
        avatarIds,
        healingPassRunId: runId,
        sourcePaths: asList(video.sourcePaths),
        createdAt: now,
        updatedAt: now
      },
      createdAt: now,
      updatedAt: now
    }
  ];
  return true;
}

function tarotDetailsFromCard(card) {
  const ship = card.shipCard || {};
  return {
    schemaVersion: "hapa.tarot-card-details.v1",
    mainType: card.cardType || `${card.kind || "object"}_card`,
    tarotNumber: ship.tarotNumber || "",
    title: ship.title || card.title,
    subtitle: ship.subtitle || ship.archetype || "",
    archetype: ship.archetype || ship.subtitle || "",
    keywords: unique([...(ship.keywords || []), ...(card.tags || []).slice(0, 8)]),
    flavorText: ship.flavorText || card.lore || card.summary || "",
    effectTitle: ship.effectTitle || "Card Effect",
    effectText: ship.effectText || card.summary || card.description || "",
    catalog: {
      collectionId: card.shipCard ? "ships3-card-deck" : "hapa-card-library",
      collectionTitle: card.shipCard ? "Ships3 Card Deck" : "Hapa Card Library",
      family: "Dear Papa Tarot",
      typeLabel: typeLabel(card),
      sequence: 0,
      sourceFolder: "",
      sourceHash: hash(card.id),
      pairingKey: `${card.cardType || card.kind}::${slugify(card.title)}`,
      confidence: "generated"
    },
    attribution: {
      author: "Calder",
      shop: card.shipCard ? "Ships3 Card Deck" : "Hapa Avatar Builder",
      albumTitle: "Dear Papa",
      rightsStatus: "operator_authored_hapa_creative_commons",
      sourceTool: "video-media-healing-pass",
      sourcePaths: [],
      notes: "Created so card video media has one Tarot Card representation."
    },
    mechanics: {
      broadGameMechanic: (card.broadGameMechanics || [])[0] || "",
      deckUse: "Draw this card from its type pile and connect its media to avatar, scene, and song context.",
      surfaceUse: "Place on the surface as a media-backed canon prompt.",
      relationshipUse: "",
      skillUse: "",
      effects: card.utility || [],
      limits: []
    },
    lore: {
      summary: card.summary || ship.flavorText || "",
      canonStatus: card.canonStatus || "generated",
      characterHooks: [],
      relationshipHooks: [],
      protocolTeaching: "",
      futureSeed: ""
    },
    mediaLinks: [],
    ocr: {
      engine: ship.ocr?.engine || "apple-vision",
      confidence: Number(ship.ocr?.confidence || 0),
      rawText: ship.ocr?.rawText || "",
      lines: ship.ocr?.lines || [],
      parsedAt: ship.ocr?.parsedAt || "",
      sourceImagePaths: [],
      sourceVideoPaths: [],
      sourceFramePaths: []
    }
  };
}

function ensureTarotLink(card, video, reason) {
  if (!card.tarotCard) card.tarotCard = tarotDetailsFromCard(card);
  const posterUri = asList(video.posterUris)[0] || "";
  const imageUri = posterUri || (card.mediaAssets || []).find((asset) => asset.type === "image")?.uri || "";
  card.tarotCard.mediaLinks = Array.isArray(card.tarotCard.mediaLinks) ? card.tarotCard.mediaLinks : [];
  const existing = card.tarotCard.mediaLinks.find((link) => link.videoUri === video.uri);
  if (existing) {
    existing.posterUri = existing.posterUri || posterUri;
    existing.imageUri = existing.imageUri || imageUri;
    existing.reason = existing.reason || reason;
    return false;
  }
  card.tarotCard.mediaLinks.push({
    id: `${card.id}-tarot-video-${hash(video.uri)}`,
    imageAssetId: "",
    videoAssetId: `${card.id}-video-${hash(video.uri)}`,
    imageUri,
    videoUri: video.uri,
    posterUri,
    confidence: "generated",
    reason
  });
  card.tarotCard.attribution = {
    ...(card.tarotCard.attribution || {}),
    sourcePaths: unique([...(card.tarotCard.attribution?.sourcePaths || []), ...asList(video.sourcePaths)])
  };
  card.tarotCard.ocr = {
    ...(card.tarotCard.ocr || {}),
    sourceVideoPaths: unique([...(card.tarotCard.ocr?.sourceVideoPaths || []), ...asList(video.sourcePaths)]),
    sourceFramePaths: unique([...(card.tarotCard.ocr?.sourceFramePaths || []), posterUri].filter(Boolean))
  };
  return true;
}

function ensureConnections(card, avatarIds, sceneId) {
  card.connections = {
    avatarIds: [],
    teamIds: [],
    placeIds: [],
    sceneIds: [],
    episodeIds: [],
    volumeIds: [],
    itemIds: [],
    nodeIds: [],
    shipIds: [],
    ...(card.connections || {})
  };
  card.connections.avatarIds = unique([...(card.connections.avatarIds || []), ...avatarIds]);
  card.connections.sceneIds = unique([...(card.connections.sceneIds || []), sceneId].filter(Boolean));
}

function ensureSourceRef(card, video, reason) {
  const sourceRefs = Array.isArray(card.sourceRefs) ? card.sourceRefs : [];
  if (!sourceRefs.some((source) => source.uri === video.uri)) {
    sourceRefs.push({
      label: "Video media healing assignment",
      uri: video.uri,
      confidence: "generated",
      notes: reason
    });
  }
  card.sourceRefs = sourceRefs;
}

function ensureHistory(card, video, reason) {
  const history = Array.isArray(card.history) ? card.history : [];
  const eventId = `video-healing-${hash(video.uri)}`;
  if (!history.some((event) => event.eventId === eventId)) {
    history.unshift({
      eventId,
      label: "Video media assignment healed",
      happenedAt: now,
      notes: reason
    });
  }
  card.history = history.slice(0, 24);
}

function ensureInventoryChoice(inventoryStore, avatar, card, reason) {
  let inventory = (inventoryStore.avatarInventories || []).find((item) => item.avatarId === avatar.id);
  if (!inventory) {
    inventory = {
      avatarId: avatar.id,
      avatarName: avatar.primaryName || avatar.id,
      library: [],
      deck: [],
      hand: [],
      trainingDeck: [],
      hardpoints: [],
      cardStates: [],
      createdAt: now,
      updatedAt: now
    };
    inventoryStore.avatarInventories = [...(inventoryStore.avatarInventories || []), inventory];
  }
  inventory.avatarName = avatar.primaryName || inventory.avatarName || avatar.id;
  inventory.library = unique([...(inventory.library || []), card.id]);
  inventory.deck = unique([...(inventory.deck || []), card.id]);
  const existingState = (inventory.cardStates || []).find((state) => state.cardId === card.id && state.zone === "deck");
  if (existingState) {
    existingState.reason = existingState.reason || reason;
    existingState.updatedAt = now;
  } else {
    inventory.cardStates = [
      ...(inventory.cardStates || []),
      {
        cardId: card.id,
        zone: "deck",
        hardpointId: "",
        status: "active",
        reason,
        updatedAt: now
      }
    ];
  }
  inventory.updatedAt = now;
}

function ensureAvatarMindChoice(avatar, card, video, reason) {
  avatar.mind = avatar.mind || {};
  avatar.mind.tarotCardDeck = Array.isArray(avatar.mind.tarotCardDeck) ? avatar.mind.tarotCardDeck : [];
  const choiceId = `video-heal-choice-${avatar.id}-${card.id}`;
  if (!avatar.mind.tarotCardDeck.some((choice) => choice.id === choiceId)) {
    const objective = cleanText(avatar.mind?.personaAnchor?.wants || avatar.mind?.soulSeed?.coreWant || avatar.summary || "advance their Hapa canon objectives");
    const evidence = briefOcr(card, video.text);
    avatar.mind.tarotCardDeck.push({
      id: choiceId,
      schemaVersion: "hapa.avatar-tarot-card-choice.v1",
      cardId: card.id,
      cardTitle: card.title,
      cardType: card.cardType || `${card.kind || "object"}_card`,
      tarotMainType: card.tarotCard?.mainType || card.cardType || "hapa_tarot_card",
      role: "video-healing-choice",
      whyChosen: `${avatar.primaryName || avatar.id} claims ${card.title} during the video healing pass because the OCR/card signal (${evidence}) can support their objective: ${objective}.`,
      canonReason: `${card.title} is connected as ${card.canonStatus || "generated"} canon through a stored Builder video, a card link, and a scene media slot.`,
      loreContext: "The Avatar reviewed the card OCR, existing card lore, and their own mind context before accepting this media-backed card into their deck.",
      objectiveFit: reason,
      deckInfluence: `${card.title} adds a video-backed draw target whose Level and Durability now contribute to card quality.`,
      futureInfluence: "Future scenes can draw this card as a media prompt and reuse the linked clip as canon-supporting motion evidence.",
      songId: "",
      songTitle: "",
      songWhy: "",
      vibe: "media-healing",
      sourcePath: "data/video-linking-pass/video-media-link-report.json",
      confidence: "generated",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
  }
  avatar.activity = [
    {
      id: `activity-video-heal-${hash(video.uri)}`,
      type: "video-media-card-choice",
      message: `${avatar.primaryName || avatar.id} linked ${card.title} to a video-backed card and scene.`,
      at: now
    },
    ...(avatar.activity || []).filter((item) => item.id !== `activity-video-heal-${hash(video.uri)}`)
  ].slice(0, 40);
  avatar.updatedAt = now;
}

function ensureSceneVideo(scene, card, video, avatarIds, reason) {
  const posterUri = asList(video.posterUris)[0] || "";
  const existing = (scene.assets || []).find((asset) => assetUri(asset) === video.uri);
  const assetId = existing?.id || `scene-video-${card.id}-${hash(video.uri)}`;
  const baseAsset = {
    id: assetId,
    name: `${card.title} scene video`,
    uri: video.uri,
    type: "video",
    requirementId: "scene_videos",
    tags: unique(["scene", "motion", "clip", "video-healing-pass", ...(card.tags || []), ...asList(video.tags)]),
    source: "video-media-healing-pass",
    notes: reason,
    metadata: {
      ...(existing?.metadata || {}),
      cardId: card.id,
      cardTitle: card.title,
      avatarIds,
      thumbnailUri: posterUri,
      sourcePaths: unique([...(existing?.metadata?.sourcePaths || []), ...asList(video.sourcePaths)]),
      sceneId: scene.id,
      sceneTitle: scene.title,
      sceneRequirementId: "scene_videos",
      sceneRequirementName: "Scene Videos",
      healingPassRunId: runId,
      updatedAt: now
    },
    processing: {
      ...(existing?.processing || {}),
      status: "attached",
      attachedToScene: true,
      sceneId: scene.id,
      attachedAt: existing?.processing?.attachedAt || now
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (posterUri) {
    baseAsset.metadata.thumbnail = {
      ...(existing?.metadata?.thumbnail || {}),
      uri: posterUri
    };
  }
  scene.assets = existing
    ? (scene.assets || []).map((asset) => asset.id === existing.id ? { ...asset, ...baseAsset } : asset)
    : [...(scene.assets || []), baseAsset];

  scene.avatarTags = Array.isArray(scene.avatarTags) ? scene.avatarTags : [];
  for (const avatarId of avatarIds) {
    if (scene.avatarTags.some((tag) => tag.avatarId === avatarId)) continue;
    scene.avatarTags.push({
      avatarId,
      role: "support",
      presence: "onscreen",
      tags: ["scene-presence", "video-healing-pass"],
      note: `${card.title} video assignment`,
      taggedAt: now,
      updatedAt: now
    });
  }

  scene.eventActions = Array.isArray(scene.eventActions) ? scene.eventActions : [];
  const actionId = `video-healing-${hash(video.uri)}`;
  if (!scene.eventActions.some((action) => action.id === actionId)) {
    scene.eventActions.push({
      id: actionId,
      sequence: scene.eventActions.length + 1,
      label: `${card.title} video linked into scene media`,
      avatarIds,
      itemIds: [card.id],
      canonStatus: "draft",
      notes: reason
    });
  }
  scene.updatedAt = now;
}

function collectCardVideoUris(card = {}) {
  const uris = new Set();
  for (const asset of card.mediaAssets || []) {
    const uri = assetUri(asset);
    if (asset.type === "video" || isVideoUri(uri)) uris.add(uri);
  }
  for (const link of card.tarotCard?.mediaLinks || []) {
    if (isVideoUri(link.videoUri)) uris.add(link.videoUri);
  }
  return uris;
}

function collectCardMediaUris(card = {}, sceneMediaByCard = new Map()) {
  const uris = new Set();
  for (const asset of card.mediaAssets || []) {
    for (const uri of [assetUri(asset), mediaPosterUri(asset)]) {
      if (isMediaUri(uri)) uris.add(uri);
    }
  }
  for (const link of card.tarotCard?.mediaLinks || []) {
    for (const uri of [link.imageUri, link.videoUri, link.posterUri]) {
      if (isMediaUri(uri)) uris.add(uri);
    }
  }
  for (const source of card.sourceRefs || []) {
    if (isMediaUri(source.uri)) uris.add(source.uri);
  }
  for (const uri of sceneMediaByCard.get(card.id) || []) {
    if (isMediaUri(uri)) uris.add(uri);
  }
  return uris;
}

function median(values = []) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function qualityTierForPercentile(percentile, level) {
  if (!level) return QUALITY_TIERS[0];
  return QUALITY_TIERS.find((tier) => percentile <= tier.maxPercentile) || QUALITY_TIERS.at(-1);
}

function scoreQuality(cards = [], scenes = []) {
  const sceneMediaByCard = new Map();
  for (const scene of scenes) {
    for (const asset of scene.assets || []) {
      const cardId = asset.metadata?.cardId;
      if (!cardId) continue;
      if (!sceneMediaByCard.has(cardId)) sceneMediaByCard.set(cardId, new Set());
      for (const uri of [assetUri(asset), mediaPosterUri(asset)]) sceneMediaByCard.get(cardId).add(uri);
    }
  }

  const metrics = cards.map((card) => {
    const level = collectCardVideoUris(card).size;
    const durability = Math.max(level, collectCardMediaUris(card, sceneMediaByCard).size);
    return { card, level, durability };
  });
  const medianDurability = Math.max(1, median(metrics.map((item) => item.durability).filter(Boolean)));
  const scored = metrics.map((item) => ({
    ...item,
    score: item.level ? item.level / medianDurability : 0
  }));
  const positiveScores = scored.filter((item) => item.level > 0).map((item) => item.score).sort((a, b) => a - b);

  for (const item of scored) {
    const below = positiveScores.filter((score) => score < item.score).length;
    const equal = positiveScores.filter((score) => score === item.score).length;
    const percentile = item.level && positiveScores.length ? (below + equal / 2) / positiveScores.length : 0;
    const tier = qualityTierForPercentile(percentile, item.level);
    const previousRank = item.card.quality?.previousRank || item.card.rank || "";
    item.card.rank = tier.label;
    item.card.quality = {
      ...(item.card.quality || {}),
      rank: tier.label,
      previousRank,
      qualityRank: tier.label,
      qualityTier: tier.key,
      level: item.level,
      videoCount: item.level,
      durability: item.durability,
      connectedMediaCount: item.durability,
      medianDurability,
      score: Number(item.score.toFixed(4)),
      qualityScore: Number(item.score.toFixed(4)),
      distributionPercentile: Number(percentile.toFixed(4)),
      updatedAt: now
    };
    item.card.tags = unique([
      ...(item.card.tags || []).filter((tag) => !QUALITY_TAGS.has(tag)),
      `quality-${tier.key}`
    ]);
    item.card.updatedAt = now;
  }

  const distribution = Object.fromEntries(QUALITY_TIERS.map((tier) => [tier.label, 0]));
  for (const item of scored) distribution[item.card.quality.qualityRank] = (distribution[item.card.quality.qualityRank] || 0) + 1;
  return { medianDurability, distribution, scored };
}

function appendSubscriberEvents(report) {
  if (dryRun) return;
  const subscriberDir = path.join(ROOT, "data/subscribers");
  fs.mkdirSync(subscriberDir, { recursive: true });
  const event = {
    schemaVersion: "hapa.subscriber-event.v1",
    type: "video-media-healing-pass",
    runId,
    generatedAt: now,
    summary: report.summary,
    reportPath: "data/video-linking-pass/video-media-link-report.json"
  };
  for (const name of ["events", "hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"]) {
    fs.appendFileSync(path.join(subscriberDir, `${name}.ndjson`), `${JSON.stringify({ ...event, subscriber: name })}\n`);
  }
}

const avatarStore = readJson(paths.avatarStore, { avatars: [] });
const itemStore = normalizeItemManagerStore(readJson(paths.itemStore, { cards: [] }));
const inventoryStore = readJson(paths.inventoryStore, { avatarInventories: [] });
const sceneStore = normalizeSceneGraph(readJson(paths.sceneStore, { scenes: [] }));
const mimiManifest = readJson(paths.mimiManifest, { records: [], pairings: [] });
const shipManifest = readJson(paths.shipManifest, { records: [] });

const avatars = (avatarStore.avatars || []).map((avatar) => normalizeAvatarCard(avatar));
const avatarById = new Map(avatars.map((avatar) => [avatar.id, avatar]));
const cards = itemStore.cards || [];
const scenes = sceneStore.scenes || [];
const cardIndex = buildCardMaps(cards);
const videosByUri = collectVideos(itemStore, mimiManifest, shipManifest);
const assignedBefore = collectAssignedVideoUris(itemStore, sceneStore, { avatars });
const inventoryOwners = buildInventoryCardOwners(inventoryStore);
const knownVideos = [...videosByUri.values()];
const unassignedVideos = knownVideos.filter((video) =>
  !assignedBefore.tarot.has(video.uri) &&
  !assignedBefore.scene.has(video.uri) &&
  !assignedBefore.avatar.has(video.uri)
);

const assignments = [];
const unresolved = [];
let cardMediaAssetsCreated = 0;
let tarotLinksCreated = 0;
let sceneLinksCreated = 0;
let avatarChoicesCreated = 0;

for (const video of unassignedVideos) {
  const match = bestCardForVideo(video, cards, cardIndex);
  if (!match.card) {
    unresolved.push({ videoUri: video.uri, reason: "no candidate card" });
    continue;
  }
  const card = match.card;
  const avatarIds = selectAvatarsForCard(card, video, avatars, inventoryOwners);
  const selectedScene = selectSceneForCard(card, video, scenes, avatarIds);
  const evidence = briefOcr(card, video.text);
  const reason = `${typeLabel(card)} "${card.title}" matched by ${match.source}; OCR/card evidence: ${evidence || "title and catalog metadata"}.`;

  const beforeSceneAssetCount = selectedScene?.assets?.length || 0;
  if (ensureCardVideoAsset(card, video, avatarIds, selectedScene?.id || "", reason)) cardMediaAssetsCreated += 1;
  if (ensureTarotLink(card, video, reason)) tarotLinksCreated += 1;
  ensureConnections(card, avatarIds, selectedScene?.id || "");
  ensureSourceRef(card, video, reason);
  ensureHistory(card, video, reason);
  card.updatedAt = now;

  for (const avatarId of avatarIds) {
    const avatar = avatarById.get(avatarId);
    if (!avatar) continue;
    const hadChoice = (avatar.mind?.tarotCardDeck || []).some((choice) => choice.id === `video-heal-choice-${avatar.id}-${card.id}`);
    ensureInventoryChoice(inventoryStore, avatar, card, reason);
    ensureAvatarMindChoice(avatar, card, video, reason);
    if (!hadChoice) avatarChoicesCreated += 1;
  }

  if (selectedScene) {
    ensureSceneVideo(selectedScene, card, video, avatarIds, reason);
    if ((selectedScene.assets || []).length > beforeSceneAssetCount) sceneLinksCreated += 1;
  }

  assignments.push({
    videoUri: video.uri,
    title: asList(video.titles)[0] || card.title,
    cardId: card.id,
    cardTitle: card.title,
    cardType: card.cardType,
    avatarIds,
    avatarNames: avatarIds.map((avatarId) => avatarById.get(avatarId)?.primaryName || avatarId),
    sceneId: selectedScene?.id || "",
    sceneTitle: selectedScene?.title || "",
    matchSource: match.source,
    matchScore: match.score,
    ocrEvidence: evidence,
    reason
  });
}

const quality = scoreQuality(cards, scenes);
const normalizedItemStore = normalizeItemManagerStore({ ...itemStore, cards, updatedAt: now });
const normalizedSceneStore = normalizeSceneGraph({ ...sceneStore, scenes, updatedAt: now });
const normalizedInventoryStore = normalizeInventoryStore({ ...inventoryStore, updatedAt: now }, avatars, normalizedItemStore.cards);
const normalizedAvatarStore = {
  ...avatarStore,
  avatars: avatars.map((avatar) => normalizeAvatarCard(avatar)),
  updatedAt: now
};
const assignedAfter = collectAssignedVideoUris(normalizedItemStore, normalizedSceneStore, normalizedAvatarStore);
const remainingUnassigned = knownVideos.filter((video) =>
  !assignedAfter.tarot.has(video.uri) &&
  !assignedAfter.scene.has(video.uri) &&
  !assignedAfter.avatar.has(video.uri)
);

const report = {
  schemaVersion: "hapa.video-media-healing-pass.v1",
  runId,
  generatedAt: now,
  dryRun,
  summary: {
    knownVideoCount: knownVideos.length,
    unassignedBefore: unassignedVideos.length,
    assignedThisRun: assignments.length,
    unresolved: unresolved.length,
    remainingUnassigned: remainingUnassigned.length,
    cardMediaAssetsCreated,
    tarotLinksCreated,
    sceneLinksCreated,
    avatarChoicesCreated,
    medianDurability: quality.medianDurability,
    qualityDistribution: quality.distribution
  },
  inputs: {
    avatarStore: paths.avatarStore,
    itemStore: paths.itemStore,
    inventoryStore: paths.inventoryStore,
    sceneStore: paths.sceneStore,
    mimiManifest: paths.mimiManifest,
    shipManifest: paths.shipManifest
  },
  assignments,
  unresolved,
  remainingUnassigned: remainingUnassigned.map((video) => ({
    videoUri: video.uri,
    titles: asList(video.titles),
    sources: video.sources
  })).slice(0, 100),
  quality: {
    medianDurability: quality.medianDurability,
    distribution: quality.distribution,
    topCards: quality.scored
      .filter((item) => item.level > 0)
      .sort((a, b) => b.score - a.score || b.durability - a.durability)
      .slice(0, 24)
      .map((item) => ({
        cardId: item.card.id,
        title: item.card.title,
        level: item.level,
        durability: item.durability,
        score: Number(item.score.toFixed(4)),
        rank: item.card.quality.qualityRank
      }))
  }
};

if (!dryRun) {
  for (const relativePath of [paths.avatarStore, paths.itemStore, paths.inventoryStore, paths.sceneStore]) backup(relativePath);
  writeJson(path.join(ROOT, paths.avatarStore), normalizedAvatarStore);
  writeJson(path.join(ROOT, paths.itemStore), normalizedItemStore);
  writeJson(path.join(ROOT, paths.inventoryStore), normalizedInventoryStore);
  writeJson(path.join(ROOT, paths.sceneStore), normalizedSceneStore);
  writeJson(reportPath, report);
  writeJson(runReportPath, report);
  appendSubscriberEvents(report);
}

console.log(JSON.stringify(report.summary, null, 2));
if (dryRun) {
  console.log("Dry run only. No stores were written.");
} else {
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
  console.log(`Run report: ${path.relative(ROOT, runReportPath)}`);
  console.log(`Backups: ${path.relative(ROOT, backupDir)}`);
}
