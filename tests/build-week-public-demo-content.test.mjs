import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeAvatarCard } from "../src/domain/avatar.js";
import { buildBuildWeekPublicDemoProjection } from "../src/domain/build-week-public-demo.js";
import { normalizeInventoryStore, normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeHapaSongStore } from "../src/domain/song.js";
import { normalizeTarotStore } from "../src/domain/tarot.js";
import { buildPublicDemoGateCards } from "../src/domain/tarot-stargate-derivation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures/build-week/judge-data");
const readJson = async (name) => JSON.parse(await readFile(path.join(fixtureRoot, name), "utf8"));

test("public demo volume keeps the bounded RGB, Echo State, and sampled foundation counts", async () => {
  const avatarStore = await readJson("avatar-store.json");
  const songbook = await readJson("dear-papa-songbook.json");
  const itemStore = normalizeItemManagerStore(await readJson("item-manager-store.json"));

  assert.deepEqual(avatarStore.avatars.map((avatar) => avatar.primaryName), ["Red", "Blue", "Green"]);
  assert.deepEqual(songbook.songCards.map((song) => song.title), ["Red Signal", "Blue Return", "Green Horizon"]);
  assert.equal(songbook.album.title, "Echo State");

  const sampled = itemStore.cards.filter((card) => !card.tags.includes("profile-required"));
  assert.deepEqual(
    sampled.reduce((counts, card) => ({ ...counts, [card.kind]: (counts[card.kind] || 0) + 1 }), {}),
    { protocol: 5, skill: 5, node: 5 }
  );
  assert.equal(itemStore.cards.filter((card) => card.tags.includes("profile-required")).length, 18);
});

test("RGB profile loadout references close over the shipped public Item and Song Cards", async () => {
  const avatarStore = await readJson("avatar-store.json");
  const itemStore = normalizeItemManagerStore(await readJson("item-manager-store.json"));
  const songbook = await readJson("dear-papa-songbook.json");
  const inventory = normalizeInventoryStore(await readJson("inventory-store.json"), avatarStore.avatars.map(normalizeAvatarCard), itemStore.cards);
  const itemIds = new Set(itemStore.cards.map((card) => card.id));
  const songIds = new Set(songbook.songCards.flatMap((song) => [song.id, song.songId]));

  for (const avatar of avatarStore.avatars) {
    assert.equal(avatar.mind.protocolCardLoadout.length, 3, `${avatar.primaryName} protocol loadout`);
    assert.equal(avatar.mind.skillCardLoadout.length, 3, `${avatar.primaryName} skill loadout`);
    for (const card of [...avatar.mind.protocolCardLoadout, ...avatar.mind.skillCardLoadout]) {
      assert.ok(itemIds.has(card.id), `${avatar.primaryName} missing ${card.id}`);
    }
    for (const song of avatar.mind.dearPapaSongContext.selectedSongCards) {
      assert.ok(songIds.has(song.id) || songIds.has(song.songId), `${avatar.primaryName} missing ${song.id}`);
    }
    const avatarInventory = inventory.avatarInventories.find((row) => row.avatarId === avatar.id);
    assert.equal(avatarInventory?.deck.length, 6, `${avatar.primaryName} inventory deck`);
    assert.equal(avatarInventory?.hardpoints.find((row) => row.id === "protocols")?.cardIds.length, 3, `${avatar.primaryName} equipped protocols`);
    assert.equal(avatarInventory?.hardpoints.find((row) => row.id === "skills")?.cardIds.length, 3, `${avatar.primaryName} equipped skills`);
  }
});

test("Tarot Draw public projection exposes RGB, every attached loadout, Echo State, Wisdom, and Stargate Cards", async () => {
  const avatarStore = await readJson("avatar-store.json");
  const avatars = avatarStore.avatars.map(normalizeAvatarCard);
  const itemStore = normalizeItemManagerStore(await readJson("item-manager-store.json"));
  const tarotStore = normalizeTarotStore(await readJson("tarot-store.json"));
  const songbook = await readJson("dear-papa-songbook.json");
  const songStore = normalizeHapaSongStore(await readJson("hapa-songs-store.json"), songbook, { status: "unavailable", songs: [] });
  const gateCards = buildPublicDemoGateCards();
  const projection = buildBuildWeekPublicDemoProjection({
    avatars,
    itemCards: itemStore.cards,
    tarotCards: tarotStore.cards,
    songs: songStore.songs,
    gateCards
  });

  assert.equal(projection.cards.length, 59);
  assert.equal(projection.audit.hiddenFromProduction, 0);
  assert.equal(projection.cards.filter((card) => card.cardType === "avatar_card").length, 3);
  assert.equal(projection.cards.filter((card) => card.cardType === "song_card").length, 3);
  assert.equal(projection.cards.filter((card) => card.tags?.includes("wisdom-set")).length, 16);
  for (const avatar of avatars) {
    assert.ok(projection.cards.some((card) => card.id === `avatar-tarot-${avatar.id}`));
    for (const loadout of [...avatar.mind.protocolCardLoadout, ...avatar.mind.skillCardLoadout]) {
      assert.ok(projection.cards.some((card) => card.id === loadout.id), `${avatar.primaryName} Tarot Draw missing ${loadout.id}`);
    }
  }
  for (const gateCard of gateCards) assert.ok(projection.cards.some((card) => card.id === gateCard.id));
});

test("complete 16-card Build Week Wisdom Set retains membership, art, custody, and review boundaries", async () => {
  const raw = await readJson("tarot-store.json");
  const store = normalizeTarotStore(raw);
  const set = store.sets.find((row) => row.id === "codex-build-week-2026");
  assert.ok(set);
  assert.equal(set.title, "Codex Build Week Wisdom Set");
  assert.equal(set.cardIds.length, 16);
  assert.equal(store.cards.length, 16);
  assert.deepEqual(new Set(set.cardIds), new Set(store.cards.map((card) => card.id)));

  const categories = {};
  for (const card of store.cards) {
    const buildWeek = card.enrichment?.media?.codexBuildWeek;
    assert.ok(buildWeek, `${card.id} lineage`);
    categories[buildWeek.category] = (categories[buildWeek.category] || 0) + 1;
    assert.equal(buildWeek.lineage?.minted, false);
    assert.equal(buildWeek.lineage?.canonical, false);
    assert.equal(buildWeek.imageGeneration?.identityTruth, false);
    assert.match(card.asset?.uri || "", /^\/demo\/wisdom-set\/codex-build-week-.*\.png$/u);
    assert.match(card.cardCoreKey || "", /^[a-f0-9]{64}$/u);
    assert.equal(card.custody?.portableCustody, true);
  }
  assert.deepEqual(categories, { protocol: 4, capability: 4, skill: 4, turn: 4 });
});

test("public tracked fixtures contain no workstation paths or obvious secret material", async () => {
  const names = ["avatar-store.json", "dear-papa-songbook.json", "hapa-songs-store.json", "inventory-store.json", "item-manager-store.json", "tarot-store.json"];
  for (const name of names) {
    const text = await readFile(path.join(fixtureRoot, name), "utf8");
    assert.doesNotMatch(text, /\/Users\//u, name);
    assert.doesNotMatch(text, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, name);
    assert.doesNotMatch(text, /\bsk-[A-Za-z0-9_-]{20,}\b/u, name);
  }
});

test("Echo State song seed normalizes as three builder-ready Song Cards", async () => {
  const songbook = await readJson("dear-papa-songbook.json");
  const store = normalizeHapaSongStore(await readJson("hapa-songs-store.json"), songbook, { status: "unavailable", songs: [] });
  assert.equal(store.songs.length, 3);
  assert.equal(store.audit.withLyrics, 3);
  assert.equal(store.audit.withAvatars, 3);
  assert.equal(store.audit.readyForBuilder, true);
  assert.equal(store.scope.albumTitle, "Echo State");
  assert.equal(store.scope.registryCollection, "echo-state");
});
