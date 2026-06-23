#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeInventoryStore, normalizeItemManagerStore } from "../src/domain/item.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const INVENTORY_STORE_PATH = path.join(DATA_DIR, "inventory-store.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MANIFEST_PATH = path.join(DATA_DIR, "avatar-foundation-deck-manifest.json");

const STARTER_CARD_IDS = [
  "protocol-card-love-truth-conviction-vectors",
  "protocol-card-roll-the-tapes-sovereign-memory",
  "protocol-card-protocol-spine-ui-api-cli-parity",
  "hapa-skill-protocol-converse-with-agent-base",
  "hapa-skill-protocol-mint-new-hapa-card-level-3",
  "hapa-skill-protocol-assign-avatar-skill-level-5",
  "node-card-hapa-avatar-node",
  "node-card-hapa-skills-app",
  "node-card-hapa-lore-node"
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

async function main() {
  const now = new Date().toISOString();
  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const cardById = new Map(itemStore.cards.map((card) => [card.id, card]));
  const missing = STARTER_CARD_IDS.filter((id) => !cardById.has(id));
  if (missing.length) throw new Error(`Missing foundation deck cards. Run npm run cards:import-foundation first. Missing: ${missing.join(", ")}`);

  const inventoryStore = normalizeInventoryStore(
    await readJson(INVENTORY_STORE_PATH),
    avatarStore.avatars || [],
    itemStore.cards
  );
  const starterSet = new Set(STARTER_CARD_IDS);
  for (const inventory of inventoryStore.avatarInventories) {
    inventory.deck = unique([...STARTER_CARD_IDS, ...inventory.deck]);
    inventory.library = unique([...inventory.library, ...STARTER_CARD_IDS]);
    inventory.cardStates = [
      ...inventory.cardStates.filter((state) => !starterSet.has(state.cardId) || state.zone !== "deck"),
      ...STARTER_CARD_IDS.map((cardId) => ({
        cardId,
        zone: "deck",
        hardpointId: cardById.get(cardId)?.equipment?.hardpointHints?.[0] || "",
        status: "active",
        reason: "seeded shared Hapa protocol/skill/node Foundation Deck",
        updatedAt: now
      }))
    ];
    inventory.updatedAt = now;
  }

  const nextInventoryStore = normalizeInventoryStore(
    {
      ...inventoryStore,
      updatedAt: now
    },
    avatarStore.avatars || [],
    itemStore.cards
  );
  const manifest = {
    schemaVersion: "hapa.avatar-foundation-deck-manifest.v1",
    generatedAt: now,
    source: "scripts/seed-avatar-foundation-decks.mjs",
    avatarCount: nextInventoryStore.avatarInventories.length,
    cardsPerAvatar: STARTER_CARD_IDS.length,
    deckCards: STARTER_CARD_IDS.map((id) => ({
      id,
      title: cardById.get(id).title,
      kind: cardById.get(id).kind,
      cardType: cardById.get(id).cardType
    }))
  };

  await mkdir(BACKUP_DIR, { recursive: true });
  const stamp = now.replace(/[:.]/g, "-");
  await writeFile(
    path.join(BACKUP_DIR, `inventory-store.before-foundation-deck-seed-${stamp}.json`),
    `${JSON.stringify(inventoryStore, null, 2)}\n`
  );
  await writeFile(INVENTORY_STORE_PATH, `${JSON.stringify(nextInventoryStore, null, 2)}\n`);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Seeded ${STARTER_CARD_IDS.length} foundation deck cards to ${manifest.avatarCount} avatar decks.`);
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
