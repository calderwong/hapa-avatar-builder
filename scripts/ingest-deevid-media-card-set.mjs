#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAvatarCard } from "../src/domain/avatar.js";
import { createItemCard, normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";
import { normalizeSystemMediaLibrary } from "../src/domain/systemMedia.js";
import { normalizeTarotStore } from "../src/domain/tarot.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const PATHS = {
  mediaLibrary: process.env.HAPA_MEDIA_LIBRARY || path.join(DATA_DIR, "media-library.json"),
  itemStore: process.env.HAPA_ITEM_STORE || path.join(DATA_DIR, "item-manager-store.json"),
  avatarStore: process.env.HAPA_AVATAR_STORE || path.join(DATA_DIR, "avatar-store.json"),
  sceneStore: process.env.HAPA_SCENE_STORE || path.join(DATA_DIR, "scene-store.json"),
  tarotStore: process.env.HAPA_TAROT_STORE || path.join(DATA_DIR, "tarot-store.json")
};
const DEFAULT_SOURCE_ROOT = path.join(process.env.HOME || process.cwd(), "Desktop", "Deevid Videos");
const SET_ID = "set-deevid-videos";
const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(args.root || process.env.HAPA_DEEVID_ROOT || DEFAULT_SOURCE_ROOT);
const manifestPath = path.resolve(args.manifest || process.env.HAPA_DEEVID_MANIFEST || path.join(sourceRoot, "deevid-video-manifest.json"));
const dryRun = Boolean(args["dry-run"]);
const skipMediaIndex = Boolean(args["skip-media-index"]);
const generatedAt = new Date().toISOString();
const runId = `deevid-media-genesis-${generatedAt.replace(/[:.]/g, "-")}`;

await main();

async function main() {
  await access(sourceRoot);
  await access(manifestPath);
  if (!skipMediaIndex) await runCanonicalMediaIndex(sourceRoot);

  const [manifest, rawMediaLibrary, rawItemStore, rawAvatarStore, rawSceneStore, rawTarotStore] = await Promise.all([
    readJson(manifestPath),
    readJson(PATHS.mediaLibrary),
    readJson(PATHS.itemStore),
    readJson(PATHS.avatarStore),
    readJson(PATHS.sceneStore),
    readJson(PATHS.tarotStore)
  ]);
  const mediaLibrary = normalizeSystemMediaLibrary(rawMediaLibrary);
  const itemStore = normalizeItemManagerStore(rawItemStore);
  const sceneStore = normalizeSceneGraph(rawSceneStore);
  const tarotStore = normalizeTarotStore(rawTarotStore);
  const avatars = (rawAvatarStore.avatars || []).map((avatar) => normalizeAvatarCard(avatar));
  const manifestByFile = new Map(manifest.map((entry) => [entry.filename, entry]));
  const deevidRecords = mediaLibrary.records
    .filter((record) => isDeevidRecord(record, sourceRoot, manifestByFile))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  if (!deevidRecords.length) throw new Error(`No indexed Deevid records found for ${sourceRoot}. Run without --skip-media-index first.`);
  const resolvedEntries = await resolveManifestRecords(manifest, deevidRecords, sourceRoot);
  if (resolvedEntries.length !== manifest.length) {
    throw new Error(`Resolved ${resolvedEntries.length}/${manifest.length} Deevid manifest entries to indexed media records.`);
  }

  const targetIndexes = annotateTargetRarity({
    avatars: buildAvatarTargets(avatars),
    scenes: buildSceneTargets(sceneStore.scenes || []),
    tarot: buildTarotTargets(tarotStore.cards || [])
  });
  const categoryCounts = {};
  const connectorCounts = { avatars: 0, scenes: 0, tarot: 0, cardsWithConnectors: 0 };
  const createdCards = [];
  const symbolicCategoryConnectors = new Set();

  for (const { record, manifestEntry } of resolvedEntries) {
    const sourceRecord = {
      ...record,
      name: manifestEntry.filename,
      sourcePath: path.join(sourceRoot, manifestEntry.filename)
    };
    const understanding = understandRecord(sourceRecord);
    categoryCounts[understanding.category] = (categoryCounts[understanding.category] || 0) + 1;
    const evidenceText = evidenceForRecord(sourceRecord, understanding);
    const connectors = {
      avatars: selectTargets(evidenceText, targetIndexes.avatars, { threshold: 0.84, limit: 3, allowShared: false }),
      scenes: selectTargets(evidenceText, targetIndexes.scenes, { threshold: 0.84, limit: 3 }),
      tarot: selectTargets(evidenceText, targetIndexes.tarot, { threshold: 0.84, limit: 3 })
    };
    if (!connectors.tarot.length && understanding.category === "creature-animal" && !symbolicCategoryConnectors.has(understanding.category)) {
      const strength = targetIndexes.tarot.find((target) => normalizeText(target.name) === "strength");
      if (strength) {
        connectors.tarot.push({
          targetType: "tarot",
          id: strength.id,
          name: strength.name,
          confidence: 0.78,
          reason: "Generated category wisdom bridge: creature/animal imagery may be reviewed through Strength's symbolic lens.",
          classification: "generated_wisdom_connector",
          canonStatus: "soft_canon",
          reviewStatus: "needs-human-review",
          source: "Deevid generated taxonomy and Builder Tarot title"
        });
        symbolicCategoryConnectors.add(understanding.category);
      }
    }
    const connectorTotal = connectors.avatars.length + connectors.scenes.length + connectors.tarot.length;
    if (connectorTotal) connectorCounts.cardsWithConnectors += 1;
    connectorCounts.avatars += connectors.avatars.length;
    connectorCounts.scenes += connectors.scenes.length;
    connectorCounts.tarot += connectors.tarot.length;
    const card = createDeevidCard(sourceRecord, manifestEntry, understanding, connectors);
    createdCards.push(card);
  }

  const setCard = createDeevidSetCard(createdCards, categoryCounts, connectorCounts, manifest.length);
  const deevidIds = new Set([SET_ID, ...createdCards.map((card) => card.id)]);
  const nextItemStore = normalizeItemManagerStore({
    ...itemStore,
    cards: [setCard, ...createdCards, ...(itemStore.cards || []).filter((card) => !deevidIds.has(card.id))],
    auditRuns: [{
      schemaVersion: "hapa.deevid-media-ingest-receipt.v1",
      id: runId,
      runId,
      sourceRoot,
      manifestPath,
      sourceCount: manifest.length,
      indexedCount: resolvedEntries.length,
      cardCount: createdCards.length,
      categoryCounts,
      connectorCounts,
      canonBoundary: "Machine understanding and relationships are generated evidence and soft canon until human review.",
      createdAt: generatedAt
    }, ...(itemStore.auditRuns || []).filter((entry) => entry.id !== runId)].slice(0, 200),
    updatedAt: generatedAt
  });

  const nextMediaLibrary = updateMediaRelationships(mediaLibrary, createdCards);
  const nextAvatars = updateAvatarMinds(avatars, createdCards, targetIndexes);
  const nextSceneStore = updateSceneConnectors(sceneStore, createdCards);
  const nextTarotStore = updateTarotConnectors(tarotStore, createdCards);
  const report = buildReport({
    manifest,
    records: resolvedEntries.map(({ record }) => record),
    createdCards,
    categoryCounts,
    connectorCounts,
    avatarsBefore: avatars,
    avatarsAfter: nextAvatars,
    sceneStoreBefore: sceneStore,
    sceneStoreAfter: nextSceneStore,
    tarotStoreBefore: tarotStore,
    tarotStoreAfter: nextTarotStore
  });

  const reportPath = path.join(DATA_DIR, "merge-reports", "latest-deevid-media-genesis.json");
  if (!dryRun) {
    await Promise.all(Object.values(PATHS).map((filePath) => backupFile(filePath, "deevid-media-genesis")));
    await Promise.all([
      writeJson(PATHS.itemStore, nextItemStore),
      writeJson(PATHS.mediaLibrary, nextMediaLibrary),
      writeJson(PATHS.avatarStore, { ...rawAvatarStore, avatars: nextAvatars, updatedAt: generatedAt }),
      writeJson(PATHS.sceneStore, nextSceneStore),
      writeJson(PATHS.tarotStore, nextTarotStore)
    ]);
  }
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeJson(reportPath, report);
  console.log(JSON.stringify({ ok: true, dryRun, reportPath, ...report.summary }, null, 2));
}

async function runCanonicalMediaIndex(rootPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts/ingest-folder-videos.mjs"), "--no-attach", rootPath], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Canonical folder-video ingest exited ${code}`)));
  });
}

function createDeevidCard(record, manifestEntry, understanding, connectors) {
  const sourceId = String(manifestEntry?.id || fingerprintSuffix(record.contentFingerprint) || slugify(record.name));
  const id = `card-media-deevid-${sourceId}`;
  const title = titleForRecord(record, sourceId);
  const labels = topLabels(record);
  const connectionDetails = [...connectors.avatars, ...connectors.scenes, ...connectors.tarot];
  return createItemCard({
    id,
    schemaVersion: "hapa.item-card.v1",
    cardType: "media_card",
    kind: "item",
    title,
    name: title,
    status: "active",
    canonStatus: "generated",
    summary: understanding.summary,
    description: `Deevid AI video indexed from local source media. ${understanding.technicalSummary}`,
    lore: "A generated visual fragment available for scene, avatar, and Tarot interpretation. It is evidence for creative possibility, not hard canon or real biography.",
    utility: ["visual reference", "scene seed", "Tarot motif candidate", "Avatar continuity reference"],
    broadGameMechanics: ["draw as visual prompt", "attach after human review", "use as soft-canon scene evidence"],
    tags: unique([
      "media-card", "media-card-set", "deevid", "deevid-ai", "ai-generated-video", "needs-human-review",
      understanding.category, understanding.orientation, understanding.durationBand, record.documentKind,
      ...labels.map((label) => `vision-${slugify(label.identifier)}`),
      ...(record.tags || [])
    ]),
    rank: "scaffold",
    quality: {
      confidence: record.intelligence?.confidence || "generated",
      completeness: record.intelligence ? 0.8 : 0.45,
      videoCount: 1,
      connectedMediaCount: connectionDetails.length,
      score: record.intelligence ? 8 : 5,
      tier: record.intelligence ? "enriched" : "indexed",
      affixes: ["media", "fingerprinted", record.intelligence ? "vision-enriched" : "needs-enrichment", connectionDetails.length ? "linked" : "review-queued"]
    },
    connections: {
      avatarIds: connectors.avatars.map((connector) => connector.id),
      sceneIds: connectors.scenes.map((connector) => connector.id),
      itemIds: connectors.tarot.map((connector) => connector.id)
    },
    sourceRefs: uniqueObjects([
      { label: "Local Deevid source", uri: record.sourcePath || "", confidence: "hard", notes: "Local source path; read-only provenance." },
      manifestEntry?.url ? { label: "Deevid public object", uri: manifestEntry.url, confidence: "hard", notes: `Manifest index ${manifestEntry.index}.` } : null,
      { label: "Avatar Builder media record", uri: `data/media-library.json#${record.id}`, confidence: "hard", notes: record.contentFingerprint || "" }
    ]),
    mediaAssets: [{
      id: record.asset?.id || record.id,
      title,
      type: "video",
      uri: record.uri || record.asset?.uri || "",
      thumbnailUri: record.thumbnailUri || record.asset?.metadata?.thumbnailUri || "",
      sourceAssetId: record.asset?.id || record.id,
      mimeType: record.asset?.metadata?.mimeType || "video/mp4",
      width: record.width || record.asset?.metadata?.width || 0,
      height: record.height || record.asset?.metadata?.height || 0,
      tags: unique(["deevid", "media-card", ...(record.tags || [])]),
      confidence: record.intelligence ? "soft" : "generated",
      notes: understanding.summary,
      metadata: {
        sourcePath: record.sourcePath,
        contentFingerprint: record.contentFingerprint,
        duration: record.duration,
        mediaLibraryRecordId: record.id,
        provider: "Deevid AI"
      }
    }],
    cardRecord: {
      schemaVersion: "hapa.deevid-media-card-record.v1",
      provider: "Deevid AI",
      sourceId,
      sourceIndex: manifestEntry?.index || null,
      contentFingerprint: record.contentFingerprint || null,
      mediaLibraryRecordId: record.id,
      understanding,
      evidence: {
        method: record.intelligence?.provider || "technical-only",
        model: record.intelligence?.model || null,
        ocrSnippets: ocrSnippets(record),
        topVisualLabels: labels,
        confidence: record.intelligence?.confidence || "generated"
      },
      connectors: connectionDetails,
      review: {
        status: "needs-human-review",
        canonStatus: "generated",
        promotionRule: "A human or authored scene must confirm identity, lore, and canon before promotion."
      }
    },
    memberOfSets: [{ setCardId: SET_ID, joinedAt: generatedAt }],
    createdAt: record.createdAt || generatedAt,
    updatedAt: generatedAt
  });
}

function createDeevidSetCard(cards, categoryCounts, connectorCounts, manifestCount) {
  return createItemCard({
    id: SET_ID,
    cardType: "set",
    kind: "item",
    title: "Deevid Videos",
    name: "Deevid Videos",
    status: "active",
    canonStatus: "generated",
    summary: `${cards.length} Deevid AI videos indexed as evidence-bearing media cards across ${Object.keys(categoryCounts).length} generated categories.`,
    description: "Repeatable media-card set backed by local video fingerprints, keyframes, Vision/OCR understanding, tags, review state, and confidence-gated Hapa connectors.",
    lore: "The Deevid collection is a visual possibility field. Its clips may seed Avatar, Scene, and Tarot interpretation, but remain generated evidence until an authored act promotes them.",
    tags: ["set", "media-card-set", "deevid", "deevid-ai", "video-library", "needs-human-review", "avatar-genesis-input"],
    utility: ["browse generated video corpus", "filter by category and visual labels", "seed scene and Tarot review", "trace provenance to source clip"],
    broadGameMechanics: ["draw a visual fragment", "review a connector", "promote soft canon through authored scene"],
    connections: {
      avatarIds: unique(cards.flatMap((card) => card.connections.avatarIds)),
      sceneIds: unique(cards.flatMap((card) => card.connections.sceneIds)),
      itemIds: unique(cards.flatMap((card) => card.connections.itemIds))
    },
    containedCards: cards.map((card) => ({ cardId: card.id, addedAt: generatedAt, addedBy: "deevid-media-genesis" })),
    sourceRefs: [
      { label: "Deevid Videos source folder", uri: sourceRoot, confidence: "hard", notes: `${manifestCount} manifest entries.` },
      { label: "Deevid source manifest", uri: manifestPath, confidence: "hard", notes: "Public object URLs and stable Deevid IDs." }
    ],
    cardRecord: {
      schemaVersion: "hapa.deevid-media-card-set.v1",
      runId,
      categoryCounts,
      connectorCounts,
      indexedCount: cards.length,
      sourceManifestCount: manifestCount,
      reviewStatus: "needs-human-review",
      canonBoundary: "Generated evidence only; no hard-canon or biographical claims are inferred."
    },
    quality: {
      confidence: "soft",
      completeness: cards.length === manifestCount ? 1 : cards.length / Math.max(1, manifestCount),
      videoCount: cards.length,
      connectedMediaCount: cards.reduce((sum, card) => sum + card.connections.avatarIds.length + card.connections.sceneIds.length + card.connections.itemIds.length, 0),
      score: cards.length === manifestCount ? 10 : 7,
      tier: cards.length === manifestCount ? "complete-index" : "partial-index",
      affixes: ["media", "set", "fingerprinted", "vision-enriched", "provenance-bearing"]
    },
    createdAt: generatedAt,
    updatedAt: generatedAt
  });
}

function updateMediaRelationships(library, cards) {
  const byRecordId = new Map();
  for (const card of cards) {
    const recordId = card.cardRecord.mediaLibraryRecordId;
    if (!byRecordId.has(recordId)) byRecordId.set(recordId, []);
    byRecordId.get(recordId).push(card);
  }
  return normalizeSystemMediaLibrary({
    ...library,
    records: library.records.map((record) => {
      const recordCards = byRecordId.get(record.id) || [];
      if (!recordCards.length) return record;
      const relationships = uniqueRelationships([
        ...(record.relationships || []).filter((rel) => rel.role !== "deevid-media-card" && rel.role !== "deevid-media-set"),
        ...recordCards.map((card) => ({ ownerType: "card", ownerId: card.id, ownerName: card.title, role: "deevid-media-card" })),
        { ownerType: "card", ownerId: SET_ID, ownerName: "Deevid Videos", role: "deevid-media-set" }
      ]);
      const primaryCard = recordCards[0];
      return {
        ...record,
        sourceKind: "deevid-video",
        reviewStatus: "carded-needs-review",
        tags: unique([...(record.tags || []), "deevid", "deevid-ai", "media-card", ...recordCards.map((card) => card.cardRecord.understanding.category)]),
        relationships,
        notes: `${primaryCard.summary} ${recordCards.length > 1 ? `${recordCards.length} manifest entries share these media bytes. ` : ""}Generated understanding; human review required before canon promotion.`,
        updatedAt: generatedAt
      };
    }),
    batches: [{
      id: runId,
      runId,
      sourceRoot,
      manifestPath,
      dryRun,
      totals: { records: cards.length, cards: cards.length, setCards: 1 },
      createdAt: generatedAt
    }, ...(library.batches || []).filter((batch) => batch.id !== runId)].slice(0, 30),
    updatedAt: generatedAt
  });
}

async function resolveManifestRecords(manifest, records, rootPath) {
  const byFileName = new Map();
  const byFingerprint = new Map(records.map((record) => [record.contentFingerprint, record]).filter(([fingerprint]) => fingerprint));
  for (const record of records) {
    const names = unique([
      path.basename(record.sourcePath || ""),
      record.name,
      ...Object.values(record.sourceRelativePaths || {}).map((value) => path.basename(value || ""))
    ]);
    for (const name of names) if (name) byFileName.set(name, record);
  }
  const resolved = [];
  for (const manifestEntry of manifest) {
    let record = byFileName.get(manifestEntry.filename) || null;
    if (!record) {
      const filePath = path.join(rootPath, manifestEntry.filename);
      const fingerprint = await partialFileFingerprint(filePath);
      record = byFingerprint.get(fingerprint) || null;
    }
    if (record) resolved.push({ manifestEntry, record });
  }
  return resolved;
}

async function partialFileFingerprint(filePath) {
  const info = await stat(filePath);
  const hash = (await import("node:crypto")).createHash("sha256");
  hash.update(`hapa-partial-video-v1:${info.size}:`);
  const chunkSize = Math.min(1024 * 1024, Math.max(1, info.size));
  const offsets = [...new Set([
    0,
    Math.max(0, Math.floor(info.size / 2) - Math.floor(chunkSize / 2)),
    Math.max(0, info.size - chunkSize)
  ])];
  const handle = await open(filePath, "r");
  try {
    for (const offset of offsets) {
      const buffer = Buffer.alloc(Math.min(chunkSize, info.size - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function updateAvatarMinds(avatars, cards) {
  const byAvatar = groupCardsByConnection(cards, "avatarIds");
  return avatars.map((avatar) => {
    const linked = byAvatar.get(avatar.id) || [];
    if (!linked.length) return avatar;
    const categorySummary = summarizeCategories(linked);
    const contextId = `context-deevid-media-set-${avatar.id}`;
    const memoryId = `memory-deevid-wisdom-${avatar.id}`;
    const choiceId = `choice-deevid-canon-boundary-${avatar.id}`;
    const genesisId = `genesis-deevid-media-${avatar.id}`;
    const mind = avatar.mind || {};
    return normalizeAvatarCard({
      ...avatar,
      mind: {
        ...mind,
        contextMap: upsertById(mind.contextMap, {
          id: contextId,
          contextId: SET_ID,
          label: "Deevid Videos media set",
          kind: "lore",
          avatarBelief: `${avatar.primaryName} treats ${linked.length} machine-matched Deevid clips (${categorySummary}) as visual questions, not memories or biography.`,
          publicSummary: `${avatar.primaryName} has ${linked.length} soft-canon Deevid media connectors awaiting scene review.`,
          classification: "soft_canon",
          confidence: "soft",
          visibility: "shared",
          status: "active",
          createdAt: generatedAt,
          updatedAt: generatedAt
        }),
        memoryLedger: upsertMemory(mind.memoryLedger, {
          memoryId,
          summary: `${avatar.primaryName} learned the Deevid boundary: a visual resemblance can seed a question or scene, but only witnessed action, provenance, and consent can harden it into canon.`,
          emotionalWeight: 4,
          visibility: "shared",
          confidence: "soft",
          classification: "memory_delta",
          status: "active",
          createdAt: generatedAt,
          updatedAt: generatedAt
        }),
        canonicalChoices: upsertById(mind.canonicalChoices, {
          id: choiceId,
          schemaVersion: "hapa.avatar-canonical-choice.v1",
          title: "Deevid evidence stays soft until scene-tested",
          summary: `${avatar.primaryName} will use the linked Deevid cards as prompts while refusing to treat machine similarity as identity, biography, or hard canon.`,
          actorAvatarId: avatar.id,
          actorName: avatar.primaryName,
          choiceType: "media-canon-boundary",
          choiceText: "Review provenance, invite contradiction, and require an authored scene before canon promotion.",
          decisionPressure: `${linked.length} generated clips may resemble known Hapa people, places, or symbols.`,
          choice: "Review provenance, invite contradiction, and require an authored scene before canon promotion.",
          alternativesRefused: ["Treat visual resemblance as identity", "Infer biography from generated media", "Promote a machine match directly to hard canon"],
          canonStatus: "soft_canon",
          classification: "generated",
          confidence: "generated",
          reviewState: "pending_review",
          sourceRefs: linked.slice(0, 12).map((card) => ({ id: card.id, type: "media-card", path: `data/item-manager-store.json#${card.id}`, confidence: "generated" })),
          linkTargets: {
            avatarIds: [avatar.id],
            cardIds: [SET_ID, ...linked.slice(0, 24).map((card) => card.id)],
            songIds: [],
            sceneIds: unique(linked.flatMap((card) => card.connections.sceneIds)).slice(0, 24),
            teamIds: [],
            placeIds: [],
            relationshipIds: [],
            memoryIds: [memoryId],
            journalEntryIds: []
          },
          connectorLinks: {
            mediaSetId: SET_ID,
            mediaCardIds: linked.slice(0, 24).map((card) => card.id),
            sceneIds: unique(linked.flatMap((card) => card.connections.sceneIds)).slice(0, 24),
            tarotCardIds: unique(linked.flatMap((card) => card.connections.itemIds)).slice(0, 24)
          },
          emotionalCost: `${avatar.primaryName} accepts uncertainty and delayed canon rather than the comfort of a fast visual answer.`,
          futurePayoff: "Promote only the connectors that survive human review and an authored scene or Tarot interpretation.",
          status: "active",
          createdAt: generatedAt,
          updatedAt: generatedAt
        }),
        genesisRuns: upsertById(mind.genesisRuns, {
          id: genesisId,
          runId,
          sourcePath: `data/merge-reports/latest-deevid-media-genesis.json#avatars/${avatar.id}`,
          status: "complete",
          completedAt: generatedAt,
          createdAt: generatedAt,
          updatedAt: generatedAt
        }),
        updatedAt: generatedAt
      },
      activity: [{
        id: `activity-deevid-media-genesis-${avatar.id}`,
        type: "avatar-genesis-media-connectors",
        message: `${linked.length} Deevid media connectors added as soft-canon evidence`,
        at: generatedAt
      }, ...(avatar.activity || []).filter((entry) => entry.id !== `activity-deevid-media-genesis-${avatar.id}`)].slice(0, 40),
      updatedAt: generatedAt
    });
  });
}

function updateSceneConnectors(sceneStore, cards) {
  const byScene = groupCardsByConnection(cards, "sceneIds");
  return normalizeSceneGraph({
    ...sceneStore,
    scenes: (sceneStore.scenes || []).map((scene) => {
      const linked = byScene.get(scene.id) || [];
      if (!linked.length) return scene;
      const nodeId = `node-deevid-media-genesis-${scene.id}`;
      return {
        ...scene,
        nodes: [{
          id: nodeId,
          type: "wisdom-connector",
          label: "Deevid media possibilities",
          body: `${linked.length} generated Deevid clips may support this scene (${summarizeCategories(linked)}). They remain soft-canon candidates until editorial review.`,
          source: runId,
          mediaSetId: SET_ID,
          mediaCardIds: linked.slice(0, 36).map((card) => card.id),
          canonStatus: "soft_canon",
          confidence: "generated",
          createdAt: generatedAt,
          updatedAt: generatedAt
        }, ...(scene.nodes || []).filter((node) => node.id !== nodeId)],
        tags: unique([...(scene.tags || []), "deevid-media-connected", "needs-connector-review"]),
        updatedAt: generatedAt
      };
    }),
    updatedAt: generatedAt
  });
}

function updateTarotConnectors(tarotStore, cards) {
  const byTarot = groupCardsByConnection(cards, "itemIds");
  return normalizeTarotStore({
    ...tarotStore,
    cards: (tarotStore.cards || []).map((tarot) => {
      const linked = byTarot.get(tarot.id) || [];
      if (!linked.length) return tarot;
      const prior = tarot.enrichment || {};
      return {
        ...tarot,
        enrichment: {
          ...prior,
          schemaVersion: prior.schemaVersion || "hapa.tarot-enrichment.v1",
          status: "enriched-needs-review",
          method: "deevid-media-genesis-bridge",
          confidence: "generated",
          needsReview: true,
          symbolicSummary: [prior.symbolicSummary, `${linked.length} Deevid clips offer generated visual echoes for ${tarot.title}; interpretive use remains soft canon.`].filter(Boolean).join(" "),
          loreNotes: [prior.loreNotes, `Deevid connector run ${runId}; promotion requires a reviewed draw, scene, or authored lore decision.`].filter(Boolean).join(" "),
          sourceTextSnippets: unique([...(prior.sourceTextSnippets || []), ...linked.slice(0, 12).map((card) => card.summary)]).slice(0, 40),
          tags: unique([...(prior.tags || []), "deevid-media-connected", "wisdom-connector", "needs-connector-review"]),
          media: {
            ...(prior.media || {}),
            deevidMediaSetId: SET_ID,
            deevidMediaCardIds: linked.slice(0, 36).map((card) => card.id),
            deevidConnectorRunId: runId
          },
          enrichedAt: generatedAt
        },
        updatedAt: generatedAt
      };
    }),
    updatedAt: generatedAt
  });
}

function understandRecord(record) {
  const labels = topLabels(record);
  const labelIds = labels.map((label) => slugify(label.identifier));
  const text = normalizeText([record.name, record.documentKind, ...(record.tags || []), ...labelIds, ...ocrSnippets(record)].join(" "));
  const categoryRules = [
    ["character-portrait", ["people", "person", "adult", "child", "face", "portrait", "human", "clothing", "hair"]],
    ["creature-animal", ["animal", "bird", "cat", "dog", "horse", "fish", "insect", "wildlife"]],
    ["place-environment", ["landscape", "sky", "mountain", "building", "structure", "room", "city", "forest", "water", "road", "vehicle"]],
    ["object-prop", ["object", "tool", "weapon", "furniture", "food", "machine", "device", "instrument"]],
    ["text-interface", ["document", "screenshot", "sign", "text", "printed", "screen", "interface"]],
    ["abstract-effects", ["art", "pattern", "light", "smoke", "fire", "color", "abstract", "animation"]]
  ];
  let category = "uncategorized-visual";
  let bestHits = [];
  for (const [name, terms] of categoryRules) {
    const hits = terms.filter((term) => text.includes(term));
    if (hits.length > bestHits.length) {
      category = name;
      bestHits = hits;
    }
  }
  const width = Number(record.width || record.asset?.metadata?.width || 0);
  const height = Number(record.height || record.asset?.metadata?.height || 0);
  const duration = Number(record.duration || record.asset?.metadata?.duration || 0);
  const orientation = width && height ? (width > height * 1.1 ? "landscape" : height > width * 1.1 ? "portrait" : "square") : "orientation-unknown";
  const durationBand = duration <= 0 ? "duration-unknown" : duration <= 5 ? "micro-loop" : duration <= 15 ? "short-clip" : duration <= 60 ? "medium-clip" : "long-clip";
  const visionDescription = record.intelligence?.vision?.description || "";
  const labelSummary = labels.slice(0, 6).map((label) => `${humanize(label.identifier)} ${Math.round(Number(label.confidence || 0) * 100)}%`).join(", ");
  const summary = visionDescription || `A ${orientation} ${durationBand.replace(/-/g, " ")} categorized as ${category.replace(/-/g, " ")}${labelSummary ? `; visual labels: ${labelSummary}` : ""}.`;
  return {
    schemaVersion: "hapa.deevid-media-understanding.v1",
    category,
    categoryEvidence: bestHits,
    orientation,
    durationBand,
    summary,
    technicalSummary: `${width || "unknown"}x${height || "unknown"}, ${duration ? `${duration.toFixed(2)} seconds` : "duration unknown"}, ${record.documentKind || "video"}.`,
    reviewStatus: "needs-human-review",
    confidence: record.intelligence?.confidence || "generated"
  };
}

function buildAvatarTargets(avatars) {
  return avatars.map((avatar) => targetRecord("avatar", avatar.id, avatar.primaryName || avatar.id, [
    avatar.primaryName,
    ...(avatar.aliases || []),
    ...(avatar.names || []).map((name) => name.name),
    ...(avatar.tags || []),
    avatar.summary,
    avatar.three_paragraph_background_narrative,
    avatar.mind?.personaAnchor?.identityStatement,
    avatar.mind?.soulSeed?.soulThesis
  ], [avatar.primaryName]));
}

function buildSceneTargets(scenes) {
  return scenes.map((scene) => targetRecord("scene", scene.id, scene.title || scene.id, [
    scene.title, scene.summary, scene.quickPitch, scene.overallNarrative, scene.narrativeText,
    ...(scene.tags || []), ...(scene.learningObjectives || []), ...(scene.hapaMechanics || [])
  ], [scene.title]));
}

function buildTarotTargets(cards) {
  return cards.map((card) => targetRecord("tarot", card.id, card.title || card.id, [
    card.title, card.slug, card.meaning, card.reversedMeaning, ...(card.keywords || []), ...(card.enrichment?.tags || []), card.enrichment?.symbolicSummary
  ], [card.title, card.slug]));
}

function targetRecord(kind, id, name, values, exactNames) {
  const ambiguousExactNames = new Set(["red", "blue", "green", "black", "white", "gold"]);
  const genericTarotNames = new Set(["hapa", "the fool", "the magician", "the high priestess", "the empress", "the emperor", "the hierophant", "the lovers", "the chariot", "strength", "the hermit", "wheel of fortune", "justice", "the hanged man", "death", "temperance", "the devil", "the tower", "the star", "the moon", "the sun", "judgement", "the world"]);
  const tokens = meaningfulTokens(values.join(" "));
  return {
    kind,
    id,
    name,
    exactNames: unique(exactNames.map((value) => normalizeText(value)).filter((value) => value.length >= 4 && !ambiguousExactNames.has(value) && (kind !== "tarot" || !genericTarotNames.has(value)))),
    tokens: unique(tokens).slice(0, 180)
  };
}

function annotateTargetRarity(indexes) {
  const allTargets = [...indexes.avatars, ...indexes.scenes, ...indexes.tarot];
  const frequency = new Map();
  for (const target of allTargets) {
    for (const token of new Set(target.tokens)) frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  const annotate = (target) => ({
    ...target,
    rareTokens: target.tokens.filter((token) => (frequency.get(token) || 0) <= 4)
  });
  return {
    avatars: indexes.avatars.map(annotate),
    scenes: indexes.scenes.map(annotate),
    tarot: indexes.tarot.map(annotate)
  };
}

function selectTargets(evidenceText, targets, { threshold, limit, allowShared = true }) {
  const normalizedEvidence = normalizeText(evidenceText);
  const evidenceTokens = new Set(meaningfulTokens(normalizedEvidence));
  return targets.map((target) => {
    const exact = target.exactNames.find((name) => containsPhrase(normalizedEvidence, name));
    const hits = target.tokens.filter((token) => evidenceTokens.has(token));
    const distinctiveHits = (target.rareTokens || []).filter((token) => evidenceTokens.has(token) && token.length >= 5);
    let score = exact ? 0.96 : 0;
    if (!exact && allowShared && distinctiveHits.length >= 2) {
      score = Math.min(0.92, 0.76 + distinctiveHits.length * 0.04 + distinctiveHits.filter((token) => token.length >= 8).length * 0.02);
    }
    if (score < threshold) return null;
    return {
      targetType: target.kind,
      id: target.id,
      name: target.name,
      confidence: Number(score.toFixed(3)),
      reason: exact ? `Exact target name found in filename/OCR/vision evidence: ${exact}` : `Shared rare evidence terms: ${distinctiveHits.slice(0, 6).join(", ")}`,
      classification: "generated_connector",
      canonStatus: "soft_canon",
      reviewStatus: "needs-human-review",
      source: "local Vision/OCR and Builder target text"
    };
  }).filter(Boolean).sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name)).slice(0, limit);
}

function evidenceForRecord(record, understanding) {
  return [
    record.name,
    ...topLabels(record).map((label) => label.identifier),
    ...ocrSnippets(record, 120)
  ].filter(Boolean).join(" ");
}

function containsPhrase(haystack, phrase) {
  return ` ${haystack} `.includes(` ${phrase} `);
}

function topLabels(record) {
  return (record.intelligence?.vision?.labels || [])
    .filter((label) => label?.identifier && Number(label.confidence || 0) >= 0.12)
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))
    .slice(0, 12);
}

function ocrSnippets(record, limit = 24) {
  const lines = record.intelligence?.ocr?.lines || [];
  const seen = new Set();
  const output = [];
  for (const line of lines) {
    const text = String(line?.text || line || "").trim();
    const key = normalizeText(text);
    if (!key || seen.has(key) || key.length < 3) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function titleForRecord(record, sourceId) {
  const base = path.basename(record.name || "", path.extname(record.name || ""));
  const parts = base.split("_").filter(Boolean);
  const hint = parts.slice(2, -1).join(" ").trim();
  if (hint && !/^\d+$/.test(hint) && hint.length >= 4) return `Deevid: ${humanize(hint)} (${sourceId})`;
  return `Deevid Video ${sourceId}`;
}

function isDeevidRecord(record, rootPath, manifestByFile) {
  const sourcePath = path.resolve(record.sourcePath || record.asset?.metadata?.folderIngest?.sourcePath || "/");
  const relative = path.relative(rootPath, sourcePath);
  const underRoot = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  return underRoot || manifestByFile.has(path.basename(sourcePath)) || (record.sourceRoots || []).includes(path.basename(rootPath));
}

function groupCardsByConnection(cards, key) {
  const grouped = new Map();
  for (const card of cards) {
    for (const id of card.connections?.[key] || []) {
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(card);
    }
  }
  return grouped;
}

function summarizeCategories(cards) {
  const counts = {};
  for (const card of cards) {
    const category = card.cardRecord?.understanding?.category || "uncategorized-visual";
    counts[category] = (counts[category] || 0) + 1;
  }
  return Object.entries(counts).sort((left, right) => right[1] - left[1]).slice(0, 4).map(([category, count]) => `${category} ${count}`).join(", ");
}

function buildReport({ manifest, records, createdCards, categoryCounts, connectorCounts, avatarsBefore, avatarsAfter, sceneStoreBefore, sceneStoreAfter, tarotStoreBefore, tarotStoreAfter }) {
  const connectedAvatarIds = new Set(createdCards.flatMap((card) => card.connections.avatarIds));
  const connectedSceneIds = new Set(createdCards.flatMap((card) => card.connections.sceneIds));
  const connectedTarotIds = new Set(createdCards.flatMap((card) => card.connections.itemIds));
  return {
    schemaVersion: "hapa.deevid-media-genesis-report.v1",
    runId,
    generatedAt,
    source: { root: sourceRoot, manifestPath, manifestCount: manifest.length },
    summary: {
      sourceVideos: manifest.length,
      indexedMediaRecords: records.length,
      mediaCards: createdCards.length,
      mediaSets: 1,
      enrichedCards: createdCards.filter((card) => card.cardRecord?.evidence?.method !== "technical-only").length,
      categories: Object.keys(categoryCounts).length,
      cardsWithConnectors: connectorCounts.cardsWithConnectors,
      connectedAvatars: connectedAvatarIds.size,
      connectedScenes: connectedSceneIds.size,
      connectedTarotCards: connectedTarotIds.size,
      connectorEdges: connectorCounts.avatars + connectorCounts.scenes + connectorCounts.tarot
    },
    categoryCounts,
    connectorCounts,
    validation: {
      manifestCoverageComplete: records.length === manifest.length && createdCards.length === manifest.length,
      uniqueCardIds: new Set(createdCards.map((card) => card.id)).size === createdCards.length,
      allCardsInSet: createdCards.every((card) => card.memberOfSets.some((membership) => membership.setCardId === SET_ID)),
      allCardsHaveMedia: createdCards.every((card) => card.mediaAssets.length === 1 && card.mediaAssets[0].uri),
      allCardsHaveProvenance: createdCards.every((card) => card.sourceRefs.length >= 2 && card.cardRecord?.contentFingerprint),
      allConnectorsSoftCanon: createdCards.every((card) => (card.cardRecord?.connectors || []).every((connector) => connector.canonStatus === "soft_canon" && connector.reviewStatus === "needs-human-review")),
      avatarMindConnectorsAdded: avatarsAfter.filter((avatar) => connectedAvatarIds.has(avatar.id) && avatar.mind?.genesisRuns?.some((run) => run.runId === runId)).length,
      scenesConnected: sceneStoreAfter.scenes.filter((scene) => connectedSceneIds.has(scene.id) && scene.nodes?.some((node) => node.source === runId)).length,
      tarotCardsConnected: tarotStoreAfter.cards.filter((card) => connectedTarotIds.has(card.id) && card.enrichment?.media?.deevidConnectorRunId === runId).length,
      avatarCountStable: avatarsBefore.length === avatarsAfter.length,
      sceneCountStable: sceneStoreBefore.scenes.length === sceneStoreAfter.scenes.length,
      tarotCountStable: tarotStoreBefore.cards.length === tarotStoreAfter.cards.length
    },
    canonBoundary: {
      status: "generated_soft_canon",
      statement: "Vision/OCR descriptions and semantic matches are evidence-weighted hypotheses. They do not establish real identity, biography, authored lore, or hard canon.",
      promotionGate: "Human review plus an authored scene, Tarot interpretation, or explicit canon decision."
    },
    cards: createdCards.map((card) => ({
      id: card.id,
      title: card.title,
      category: card.cardRecord.understanding.category,
      summary: card.summary,
      sourceId: card.cardRecord.sourceId,
      mediaLibraryRecordId: card.cardRecord.mediaLibraryRecordId,
      connections: card.connections,
      connectorDetails: card.cardRecord.connectors
    }))
  };
}

async function backupFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    return;
  }
  const backupPath = path.join(DATA_DIR, "backups", `${path.basename(filePath)}.${label}-${generatedAt.replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(filePath, backupPath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function upsertById(items = [], record) {
  return [record, ...(items || []).filter((item) => item.id !== record.id)];
}

function upsertMemory(items = [], record) {
  return [record, ...(items || []).filter((item) => (item.memoryId || item.id) !== record.memoryId)];
}

function uniqueRelationships(items = []) {
  const byKey = new Map();
  for (const item of items.filter(Boolean)) byKey.set(`${item.ownerType}:${item.ownerId}:${item.role}`, item);
  return [...byKey.values()];
}

function uniqueObjects(items = []) {
  const byKey = new Map();
  for (const item of items.filter(Boolean)) byKey.set(`${item.label}:${item.uri}`, item);
  return [...byKey.values()];
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function meaningfulTokens(value) {
  const stop = new Set(["about", "across", "after", "again", "against", "also", "another", "balanced", "because", "before", "being", "black", "blue", "breath", "breathing", "builder", "canon", "card", "could", "current", "deevid", "every", "first", "flame", "frozen", "generated", "gold", "green", "hapa", "into", "labels", "machine", "media", "needs", "other", "pattern", "prime", "replay", "scene", "should", "soft", "source", "structure", "summary", "their", "there", "these", "this", "though", "through", "video", "visual", "where", "which", "while", "white", "with", "would"]);
  return normalizeText(value).split(" ").filter((token) => token.length >= 4 && !stop.has(token) && !/^\d+$/.test(token));
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value = "") {
  return normalizeText(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

function humanize(value = "") {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

function fingerprintSuffix(value = "") {
  return String(value || "").replace(/^sha256:/, "").slice(0, 16);
}
