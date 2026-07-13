import { SCHEMAS, validateCanonical } from "@hapa/overcard/core";
import { normalizeInventoryStore } from "../domain/item.js";

const SURFACE_ID = "hapa-avatar-builder";
const ZONES = ["library", "deck", "hand", "trainingDeck"];
const CAPACITY = { deck: 9, hand: 9, trainingDeck: 9 };

export function projectInventoryCollections(inventoryStore = {}, itemStore = {}, now = new Date().toISOString()) {
  const cards = new Map((itemStore.cards || []).map((card) => [card.id, card]));
  const collections = [];
  for (const inventory of inventoryStore.avatarInventories || []) {
    for (const zone of ZONES) collections.push(collectionForZone(inventory, zone, cards, now));
    for (const hardpoint of inventory.hardpoints || []) collections.push({
      schema: "hapa.entity-collection.v2", id: collectionId(inventory.avatarId, `equipped:${hardpoint.id}`), sourceSystem: "hapa-avatar-builder",
      owner: { kind: "avatar", id: inventory.avatarId }, kind: "set", name: `${inventory.avatarName} · ${hardpoint.label}`,
      members: (hardpoint.cardIds || []).map((id) => entityForCard(cards.get(id), id)), capacity: hardpoint.maxCards || 1,
      visibility: "private", revision: revisionOf(inventory), updatedAt: inventory.updatedAt || now, activeForSurfaces: [SURFACE_ID],
    });
  }
  for (const collection of collections) {
    const validation = validateCanonical(SCHEMAS.entityCollection, collection);
    if (!validation.ok) throw new Error(`Invalid inventory collection ${collection.id}: ${JSON.stringify(validation.issues)}`);
  }
  return { schema: "hapa.avatar-builder-inventory-collections.v1", nodeId: SURFACE_ID, storeUpdatedAt: inventoryStore.updatedAt || null, collections };
}

export function applyInventoryCollections(inventoryStore = {}, collections = [], options = {}) {
  if (options.expectedUpdatedAt && inventoryStore.updatedAt && options.expectedUpdatedAt !== inventoryStore.updatedAt) {
    return { ok: false, code: "revision_conflict", issues: [{ code: "revision_conflict", message: `Expected ${options.expectedUpdatedAt}, found ${inventoryStore.updatedAt}.` }], store: inventoryStore };
  }
  const byAvatar = new Map();
  const issues = [];
  for (const collection of collections) {
    const validation = validateCanonical(SCHEMAS.entityCollection, collection);
    if (!validation.ok) { issues.push(...validation.issues.map((issue) => ({ ...issue, collectionId: collection.id }))); continue; }
    if (collection.owner.kind !== "avatar" || !collection.id.startsWith(`avatar:${collection.owner.id}:inventory:`)) continue;
    if (collection.capacity && collection.members.length > collection.capacity) issues.push({ code: "capacity", collectionId: collection.id, message: `${collection.name} exceeds ${collection.capacity}; no cards were changed.` });
    const avatar = byAvatar.get(collection.owner.id) || { zones: new Map(), hardpoints: new Map() };
    const zone = collection.id.split(":inventory:")[1];
    if (zone.startsWith("equipped:")) avatar.hardpoints.set(zone.slice("equipped:".length), collection);
    else avatar.zones.set(zone, collection);
    byAvatar.set(collection.owner.id, avatar);
  }
  for (const [avatarId, projected] of byAvatar) {
    const occupancy = new Map();
    for (const zone of ["deck", "hand", "trainingDeck"]) for (const entity of projected.zones.get(zone)?.members || []) {
      const key = entity.entityId; const prior = occupancy.get(key);
      if (prior) issues.push({ code: "incompatible_duplicate", avatarId, entityId: key, message: `${key} is in both ${prior} and ${zone}; no cards were changed.` });
      else occupancy.set(key, zone);
    }
    for (const [hardpointId, collection] of projected.hardpoints) for (const entity of collection.members) {
      const prior = occupancy.get(entity.entityId);
      if (prior) issues.push({ code: "incompatible_duplicate", avatarId, entityId: entity.entityId, message: `${entity.entityId} is in both ${prior} and equipped:${hardpointId}; no cards were changed.` });
      else occupancy.set(entity.entityId, `equipped:${hardpointId}`);
    }
  }
  if (issues.length) return { ok: false, code: issues[0].code, issues, store: inventoryStore };

  const next = structuredClone(inventoryStore);
  const now = options.now || new Date().toISOString();
  for (const inventory of next.avatarInventories || []) {
    const projected = byAvatar.get(inventory.avatarId); if (!projected) continue;
    for (const zone of ZONES) if (projected.zones.has(zone)) inventory[zone] = projected.zones.get(zone).members.map((entity) => entity.entityId);
    inventory.hardpoints = (inventory.hardpoints || []).map((hardpoint) => projected.hardpoints.has(hardpoint.id) ? { ...hardpoint, cardIds: projected.hardpoints.get(hardpoint.id).members.map((entity) => entity.entityId) } : hardpoint);
    const located = new Map();
    for (const zone of ["deck", "hand", "trainingDeck"]) for (const id of inventory[zone] || []) located.set(id, zone === "trainingDeck" ? "training_deck" : zone);
    for (const hardpoint of inventory.hardpoints) for (const id of hardpoint.cardIds || []) located.set(id, "equipped");
    inventory.library = [...new Set([...(inventory.library || []), ...located.keys()])];
    inventory.cardStates = [...located].map(([cardId, zone]) => ({ cardId, zone, hardpointId: zone === "equipped" ? inventory.hardpoints.find((hp) => hp.cardIds.includes(cardId))?.id || "" : "", status: "active", reason: "canonical Overcard collection bridge", updatedAt: now }));
    inventory.updatedAt = now;
  }
  next.updatedAt = now;
  return { ok: true, store: normalizeInventoryStore(next) };
}

export function isBuilderAvatarCollection(collection) { return collection?.owner?.kind === "avatar" && collection.id?.startsWith(`avatar:${collection.owner.id}:inventory:`); }
export function isBuilderAvatarHandCollection(collection) { return isBuilderAvatarCollection(collection) && collection.kind === "hand"; }
export function selectSharedInventoryHandCollections(collections = []) {
  return collections.filter((collection) => isBuilderAvatarHandCollection(collection) && collection.members?.length > 0);
}
export function collectionId(avatarId, zone) { return `avatar:${avatarId}:inventory:${zone}`; }

function collectionForZone(inventory, zone, cards, now) { return { schema: "hapa.entity-collection.v2", id: collectionId(inventory.avatarId, zone), sourceSystem: "hapa-avatar-builder", owner: { kind: "avatar", id: inventory.avatarId }, kind: zone === "hand" ? "hand" : zone === "library" ? "set" : "deck", name: `${inventory.avatarName} · ${zone === "trainingDeck" ? "Training Deck" : zone[0].toUpperCase() + zone.slice(1)}`, members: (inventory[zone] || []).map((id) => entityForCard(cards.get(id), id)), ...(CAPACITY[zone] ? { capacity: CAPACITY[zone] } : {}), visibility: "private", revision: revisionOf(inventory), updatedAt: inventory.updatedAt || now, activeForSurfaces: [SURFACE_ID] }; }
function entityForCard(card, id) { return { schema: "hapa.entity-ref.v2", sourceSystem: "hapa-avatar-builder", entityType: "card", entityId: id, revision: String(card?.updatedAt || card?.schemaVersion || "unversioned"), availability: card ? "available" : "degraded", label: card?.title || card?.name || id, resolver: { kind: "api", uri: `/api/items/cards/${encodeURIComponent(id)}` }, presentation: { title: card?.title || card?.name || id, subtitle: card?.kind || "Inventory card", ...(card?.mediaAssets?.[0]?.uri ? { thumbnail: card.mediaAssets[0].uri } : {}) } }; }
function revisionOf(inventory) { const value = Number(inventory.overcardRevision); return Number.isInteger(value) && value > 0 ? value : 1; }
