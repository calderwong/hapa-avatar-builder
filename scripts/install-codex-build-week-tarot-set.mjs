#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openAvatarCardCustodyService } from "../server/card-custody-service.mjs";
import { addTarotCard, addTarotSet, normalizeTarotStore } from "../src/domain/tarot.js";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const manifestPath = path.join(root, "config", "codex-build-week-set.json");
const tarotStorePath = path.join(root, "data", "tarot-store.json");
const mediaRoot = path.join(root, "data", "media", "codex-build-week");
const generationReceiptPath = path.join(mediaRoot, "krea2-generation-receipt.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const generation = JSON.parse(await readFile(generationReceiptPath, "utf8"));
const generationById = new Map((generation.cards || []).map((card) => [card.cardId, card]));
const original = normalizeTarotStore(JSON.parse(await readFile(tarotStorePath, "utf8")));
const now = new Date().toISOString();

for (const definition of manifest.cards) {
  const generated = generationById.get(definition.id);
  if (generated?.status !== "succeeded") throw new Error(`Missing successful Krea 2 receipt for ${definition.id}.`);
  const outputPath = path.join(mediaRoot, "cards", `${definition.id}.png`);
  const digest = createHash("sha256").update(await readFile(outputPath)).digest("hex");
  if (digest !== generated.outputSha256) throw new Error(`Generated image digest mismatch for ${definition.id}.`);
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, setId: manifest.id, cards: manifest.cards.length, previousCards: original.cards.length }, null, 2)}\n`);
  process.exit(0);
}

const stamp = now.replace(/[:.]/g, "-");
const backupDir = path.join(root, "data", "backups");
const backupPath = path.join(backupDir, `tarot-store.before-${manifest.id}-${stamp}.json`);
await mkdir(backupDir, { recursive: true });
await copyFile(tarotStorePath, backupPath);

let store = addTarotSet(original, {
  id: manifest.id,
  title: manifest.title,
  description: manifest.description,
  status: manifest.status,
  tags: ["hapa", "tarot", "codex-build-week", "turn-mined", "judge-demo"],
  cardIds: manifest.cards.map((card) => card.id),
  createdAt: original.sets.find((set) => set.id === manifest.id)?.createdAt || now,
  updatedAt: now
});
const custody = openAvatarCardCustodyService({ root: path.join(root, "data", "card-custody") });
const installed = [];

for (const definition of manifest.cards) {
  const generated = generationById.get(definition.id);
  const existing = original.cards.find((card) => card.id === definition.id);
  const imageUri = `/media/codex-build-week/cards/${definition.id}.png`;
  const cardInput = {
    id: definition.id,
    cardId: definition.id,
    title: definition.title,
    cardType: "reference_card",
    number: definition.number,
    suit: "custom",
    arcana: "custom",
    orientation: "upright",
    keywords: definition.keywords,
    meaning: definition.meaning,
    reversedMeaning: definition.reversedMeaning,
    promptNotes: definition.instruction,
    status: "review",
    setIds: [manifest.id],
    deckIds: [],
    tags: ["hapa-card", "codex-build-week", `${definition.category}-card`, "tarot-draw-ready"],
    sourceKind: "codex-build-week-turn-mined-card",
    sourceRefs: definition.sourceTurnIds.map((turnId) => ({ kind: "hapa_turn", id: turnId, label: turnId })),
    assets: [{
      id: `${definition.id}-krea2-image`,
      name: `${definition.title} · Krea 2 proposal`,
      type: "image",
      mimeType: generated.mediaType || "image/png",
      uri: imageUri,
      tags: ["tarot-card", "krea2", "generated-proposal", "human-review"],
      metadata: {
        tarotMediaRole: "primary_image",
        sha256: generated.outputSha256,
        generatedBy: manifest.imageGeneration.provider,
        taskId: generated.taskId,
        preset: generated.preset,
        identityTruth: false,
        humanReviewRequired: true
      }
    }],
    enrichment: {
      status: "enriched",
      method: "hapa-turn-miner+krea2",
      confidence: "high",
      needsReview: true,
      symbolicSummary: definition.meaning,
      textSynopsis: definition.skillProfile?.summary || `${definition.category.toUpperCase()} Card derived from attributed Codex turns during the July 13–20 Build Week window.`,
      loreNotes: definition.skillProfile?.context || "",
      visualDescription: definition.instruction,
      tags: ["codex-build-week", `${definition.category}-card`, "turn-mined", "tarot-draw-ready", "krea2-generated", "unminted"],
      media: {
        codexBuildWeek: {
          schemaVersion: "hapa.codex-build-week-card.v1",
          setId: manifest.id,
          category: definition.category,
          number: definition.number,
          order: definition.order,
          priority: manifest.cards.length + 1 - definition.order,
          dateRange: manifest.dateRange,
          sourcePlatform: "codex",
          sourceTurnIds: definition.sourceTurnIds,
          sourceRefs: definition.sourceTurnIds.map((turnId) => `hapa-turn://${turnId}`),
          derivedBy: manifest.source.derivedBy,
          ...(definition.skillProfile ? { skillProfile: structuredClone(definition.skillProfile) } : {}),
          imageGeneration: {
            provider: manifest.imageGeneration.provider,
            taskId: generated.taskId,
            preset: generated.preset,
            seed: generated.seed,
            artifactId: generated.artifactId,
            outputSha256: generated.outputSha256,
            sourceFixture: generated.sourceFixture,
            sourceBasis: generated.identityUseBasis,
            sourceLicense: manifest.imageGeneration.sourceLicense,
            identityTruth: false,
            humanReviewRequired: true
          },
          lineage: {
            rawTurnsRemainAuthoritative: true,
            sourceCardUnchanged: true,
            generatedOutputIsIdentityTruth: false,
            minted: false,
            canonical: false
          }
        }
      },
      enrichedAt: now
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const custodyResult = await custody.ensure({ card: cardInput, actorId: "calder-wong", evidenceRef: `hapa-turn-miner:set:${manifest.id}` });
  store = addTarotCard(store, custodyResult.card);
  installed.push({ id: definition.id, category: definition.category, custodyCreated: custodyResult.created, imageSha256: generated.outputSha256 });
}

const installedSet = store.sets.find((set) => set.id === manifest.id);
if (installedSet) {
  installedSet.cardIds = manifest.cards.map((card) => card.id);
  installedSet.updatedAt = now;
}
store.updatedAt = now;
await writeFile(tarotStorePath, `${JSON.stringify(store, null, 2)}\n`);
const reportPath = path.join(root, "data", "merge-reports", `${manifest.id}-${stamp}.json`);
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({
  schemaVersion: "hapa.codex-build-week-set-install.v1",
  setId: manifest.id,
  installedAt: now,
  backupPath: path.relative(root, backupPath),
  reportPath: path.relative(root, reportPath),
  previousCards: original.cards.length,
  nextCards: store.cards.length,
  installed
}, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, setId: manifest.id, cards: installed.length, backup: path.relative(root, backupPath), report: path.relative(root, reportPath) }, null, 2)}\n`);
