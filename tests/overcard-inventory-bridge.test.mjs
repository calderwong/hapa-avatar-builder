import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyInventoryCollections, collectionId, isBuilderAvatarHandCollection, projectInventoryCollections, selectSharedInventoryHandCollections } from "../src/overcard/inventoryBridge.js";

const at = "2026-07-10T00:00:00.000Z";
const itemStore = { cards: ["red", "blue", "green", "gold", "violet", "cyan", "white", "black", "silver", "amber"].map((id) => ({ id, title: id, kind: "skill", updatedAt: at })) };
const inventory = { schemaVersion: "hapa.inventory-store.v1", updatedAt: at, avatarInventories: [{ avatarId: "avatar-red", avatarName: "Red", library: ["red", "blue"], deck: ["blue"], hand: ["red"], trainingDeck: [], hardpoints: [{ id: "skills", label: "Skills", accepts: ["skill"], maxCards: 2, cardIds: [] }], cardStates: [], createdAt: at, updatedAt: at }] };

test("projects private avatar-scoped Hand, Deck, library, training, and equipped collections", () => {
  const projected = projectInventoryCollections(inventory, itemStore, at);
  assert.equal(projected.collections.find((entry) => entry.id === collectionId("avatar-red", "hand")).owner.kind, "avatar");
  assert.equal(projected.collections.find((entry) => entry.id === collectionId("avatar-red", "hand")).visibility, "private");
  assert.equal(projected.collections.find((entry) => entry.id === collectionId("avatar-red", "deck")).kind, "deck");
  assert.ok(projected.collections.some((entry) => entry.id.endsWith("equipped:skills")));
});

test("automatic shared-state hydration selects only non-empty avatar Hands", () => {
  const collections = projectInventoryCollections(inventory, itemStore, at).collections;
  const selected = selectSharedInventoryHandCollections(collections);
  assert.deepEqual(selected.map((entry) => entry.id), [collectionId("avatar-red", "hand")]);
  assert.equal(selected.every(isBuilderAvatarHandCollection), true);
  assert.equal(selected.some((entry) => ["deck", "set"].includes(entry.kind)), false);
  const empty = structuredClone(collections);
  empty.find((entry) => entry.id === collectionId("avatar-red", "hand")).members = [];
  assert.deepEqual(selectSharedInventoryHandCollections(empty), []);
});

test("canonical move round-trips without incompatible duplicates and preserves library custody", () => {
  const collections = projectInventoryCollections(inventory, itemStore, at).collections;
  const hand = collections.find((entry) => entry.id.endsWith(":hand"));
  const deck = collections.find((entry) => entry.id.endsWith(":deck"));
  hand.members = [];
  deck.members = [deck.members[0], itemStore.cards.find((card) => card.id === "red")].map((value) => value.schema ? value : ({ schema: "hapa.entity-ref.v2", sourceSystem: "hapa-avatar-builder", entityType: "card", entityId: value.id, availability: "available", label: value.title }));
  const result = applyInventoryCollections(inventory, collections, { expectedUpdatedAt: at, now: "2026-07-10T00:01:00.000Z" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.store.avatarInventories[0].hand, []);
  assert.deepEqual(result.store.avatarInventories[0].deck, ["blue", "red"]);
  assert.ok(result.store.avatarInventories[0].library.includes("red"));
});

test("capacity, stale revision, and incompatible duplicate reject atomically without truncating source", () => {
  const collections = projectInventoryCollections(inventory, itemStore, at).collections;
  const hand = collections.find((entry) => entry.id.endsWith(":hand"));
  hand.members = itemStore.cards.map((card) => ({ schema: "hapa.entity-ref.v2", sourceSystem: "hapa-avatar-builder", entityType: "card", entityId: card.id, availability: "available", label: card.title }));
  const before = structuredClone(inventory);
  const capacity = applyInventoryCollections(inventory, collections, { expectedUpdatedAt: at });
  assert.equal(capacity.ok, false);
  assert.equal(capacity.code, "capacity");
  assert.deepEqual(inventory, before);
  const stale = applyInventoryCollections(inventory, projectInventoryCollections(inventory, itemStore, at).collections, { expectedUpdatedAt: "stale" });
  assert.equal(stale.code, "revision_conflict");
  const duplicateCollections = projectInventoryCollections(inventory, itemStore, at).collections;
  duplicateCollections.find((entry) => entry.id.endsWith(":deck")).members.push(duplicateCollections.find((entry) => entry.id.endsWith(":hand")).members[0]);
  const duplicate = applyInventoryCollections(inventory, duplicateCollections, { expectedUpdatedAt: at });
  assert.equal(duplicate.code, "incompatible_duplicate");
  assert.deepEqual(duplicate.store, inventory);
});

test("root bridge imports avatar collections and writes shared revisions through the API", async () => {
  const [main, bridge, api] = await Promise.all([
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/overcard/InventoryCollectionBridge.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(main, /<InventoryCollectionBridge/);
  assert.match(bridge, /state\.upsert/);
  assert.match(bridge, /selectSharedInventoryHandCollections/);
  assert.match(bridge, /expectedUpdatedAt/);
  assert.match(api, /\/api\/overcard\/inventory-collections/);
});
