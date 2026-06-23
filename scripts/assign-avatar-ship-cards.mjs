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
const ASSIGNMENT_PATH = path.join(DATA_DIR, "ship-card-ingest", "ships3", "avatar-ship-assignments.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const SHIP_HARDPOINT_ID = "node_ship";
const SHIP_CARDS_PER_AVATAR = 3;
const ASSIGNMENT_OFFSETS = [0, 17, 34];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.name || avatar.id || "Unknown Avatar";
}

function shipSortKey(card = {}) {
  const tarotNumber = Number(card.shipCard?.tarotNumber || 0);
  const numberKey = Number.isFinite(tarotNumber) && tarotNumber > 0 ? String(tarotNumber).padStart(4, "0") : "9999";
  return `${numberKey} ${card.title || card.id}`;
}

function cardHasVideo(card = {}) {
  return (card.mediaAssets || []).some((asset) => asset?.type === "video" && asset.uri);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function pickShipCards(shipCards, avatarIndex) {
  const base = avatarIndex * 2;
  return unique(ASSIGNMENT_OFFSETS.map((offset) => shipCards[(base + offset) % shipCards.length]?.id)).slice(0, SHIP_CARDS_PER_AVATAR);
}

function assignmentForAvatar(avatar, avatarIndex, shipCardsById, shipCards) {
  const cardIds = pickShipCards(shipCards, avatarIndex);
  return {
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    hardpointId: SHIP_HARDPOINT_ID,
    cardIds,
    cards: cardIds.map((cardId) => {
      const card = shipCardsById.get(cardId);
      return {
        id: card.id,
        title: card.title,
        keywords: card.shipCard?.keywords || card.tags?.slice(4, 8) || [],
        effectTitle: card.shipCard?.effectTitle || "",
        stats: card.shipCard?.stats || {},
        videoUri: (card.mediaAssets || []).find((asset) => asset.type === "video")?.uri || "",
        thumbnailUri: (card.mediaAssets || []).find((asset) => asset.type === "image")?.uri || ""
      };
    })
  };
}

async function main() {
  const now = new Date().toISOString();
  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const inventoryStore = normalizeInventoryStore(
    await readJson(INVENTORY_STORE_PATH),
    avatarStore.avatars || [],
    itemStore.cards
  );

  const avatars = [...(avatarStore.avatars || [])]
    .filter((avatar) => avatar?.id)
    .sort((a, b) => avatarName(a).localeCompare(avatarName(b)) || a.id.localeCompare(b.id));
  const shipCards = itemStore.cards
    .filter((card) => card.cardType === "ship_card" && card.kind === "ship" && cardHasVideo(card))
    .sort((a, b) => shipSortKey(a).localeCompare(shipSortKey(b)) || a.id.localeCompare(b.id));

  if (!avatars.length) throw new Error("No avatars found in avatar-store.json.");
  if (shipCards.length < SHIP_CARDS_PER_AVATAR) {
    throw new Error(`Need at least ${SHIP_CARDS_PER_AVATAR} video-backed ship cards, found ${shipCards.length}.`);
  }

  const shipCardsById = new Map(shipCards.map((card) => [card.id, card]));
  const inventoryByAvatar = new Map(inventoryStore.avatarInventories.map((inventory) => [inventory.avatarId, inventory]));
  const assignments = avatars.map((avatar, index) => assignmentForAvatar(avatar, index, shipCardsById, shipCards));

  for (const assignment of assignments) {
    const inventory = inventoryByAvatar.get(assignment.avatarId);
    if (!inventory) continue;
    const hardpoint = inventory.hardpoints.find((item) => item.id === SHIP_HARDPOINT_ID);
    if (!hardpoint) continue;

    hardpoint.cardIds = assignment.cardIds;
    inventory.library = unique([...inventory.library, ...assignment.cardIds]);
    inventory.cardStates = [
      ...inventory.cardStates.filter((state) => state.hardpointId !== SHIP_HARDPOINT_ID && !assignment.cardIds.includes(state.cardId)),
      ...assignment.cardIds.map((cardId) => ({
        cardId,
        zone: "equipped",
        hardpointId: SHIP_HARDPOINT_ID,
        status: "active",
        reason: "seeded three video-backed tarot ship cards for avatar ship loadout",
        updatedAt: now
      }))
    ];
    inventory.updatedAt = now;
  }

  const nextInventoryStore = normalizeInventoryStore(
    {
      ...inventoryStore,
      avatarInventories: [...inventoryByAvatar.values()],
      updatedAt: now
    },
    avatars,
    itemStore.cards
  );
  const manifest = {
    schemaVersion: "hapa.avatar-ship-card-assignments.v1",
    generatedAt: now,
    source: "scripts/assign-avatar-ship-cards.mjs",
    hardpointId: SHIP_HARDPOINT_ID,
    cardsPerAvatar: SHIP_CARDS_PER_AVATAR,
    avatarCount: assignments.length,
    shipCardPoolCount: shipCards.length,
    assignmentStrategy: "sorted avatars receive three sorted ship cards using offsets 0, 17, and 34 with base index*2; overlap is intentional",
    assignments
  };

  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(path.dirname(ASSIGNMENT_PATH), { recursive: true });
  const stamp = now.replace(/[:.]/g, "-");
  await writeFile(
    path.join(BACKUP_DIR, `inventory-store.before-ship-card-assignment-${stamp}.json`),
    `${JSON.stringify(inventoryStore, null, 2)}\n`
  );
  await writeFile(INVENTORY_STORE_PATH, `${JSON.stringify(nextInventoryStore, null, 2)}\n`);
  await writeFile(ASSIGNMENT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Assigned ${SHIP_CARDS_PER_AVATAR} ship cards to ${assignments.length} avatars from ${shipCards.length} video-backed ship cards.`);
  console.log(`Wrote ${path.relative(ROOT, ASSIGNMENT_PATH)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
