import assert from "node:assert/strict";
import test from "node:test";
import { buildBuilderEntityCatalog } from "../src/overcard/entityCatalog.js";
import { projectBuilderCatalog } from "../src/overcard/hostAdapter.js";

const sources = {
  avatars: {
    updatedAt: "2026-07-11T08:00:00.000Z",
    avatars: [
      { id: "red", primaryName: "Red", role: "Operator", updatedAt: "avatar-r2", mind: { privateFacts: ["not in catalog"] }, assets: [{ type: "image", uri: "/media/red.png" }] },
      { id: "hell-card", primaryName: "Hell Card", isExternalProjection: true, projection: { readOnly: true }, updatedAt: "hell-r4", mind: { privateFacts: ["not in catalog"] } },
    ],
  },
  items: {
    updatedAt: "items-r3",
    cards: [
      { id: "protocol", title: "Protocol Card", cardType: "protocol_card", description: "large detail" },
      { id: "creator-set", title: "Creator Set", cardType: "set", mediaAssets: [{ uri: "/media/set.png" }] },
      { id: "node-card", title: "Node Card", cardType: "node_card" },
    ],
  },
  tarot: {
    updatedAt: "tarot-r5",
    cards: [{ id: "tarot-red", title: "Red Tarot", assets: [{ uri: "/media/tarot.png", metadata: { huge: "omitted" } }] }],
    decks: [{ id: "red-deck", title: "Red Deck", cardIds: ["tarot-red"] }],
    sets: [{ id: "red-set", title: "Red Set", cardIds: ["tarot-red"] }],
  },
  world: { updatedAt: "world-r2", scenes: [{ id: "hell-scene", title: "Hell Scene", timeline: { full: "omitted" } }] },
  songs: { updatedAt: "songs-r7", songs: [{ id: "red-song", title: "Red Song", author: "Hapa", lyrics: { text: "not in catalog" } }] },
};

test("Builder catalog emits compact traceable refs for every supported entity family", () => {
  const response = buildBuilderEntityCatalog(sources, { generatedAt: "2026-07-11T09:00:00.000Z", limit: 100 });
  assert.equal(response.schema, "hapa.overcard-builder-catalog.v1");
  assert.equal(response.total, 10);
  assert.deepEqual(response.countsByKind, { avatar: 1, card: 3, set: 2, node: 1, deck: 1, scene: 1, song: 1 });
  for (const entry of response.entities) {
    assert.equal(entry.ref.schema, "hapa.entity-ref.v2");
    assert.ok(entry.ref.sourceSystem);
    assert.ok(entry.ref.revision);
    assert.match(entry.ref.resolver.uri, /^\/api\//);
    assert.ok(entry.rendererId);
    assert.ok(entry.sourceOwner);
    assert.equal(entry.placementAllowed, true);
  }
  const projected = response.entities.find((entry) => entry.ref.entityId === "hell-card");
  assert.equal(projected.ref.sourceSystem, "hapa-dev-proto");
  assert.equal(projected.readOnly, true);
  assert.equal(projected.sourceMutationAllowed, false);
  assert.equal(projected.placementAllowed, true);
  assert.match(projected.detailUri, /\/api\/hell-week\/cards\/hell-card/);

  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /privateFacts|not in catalog|"lyrics"|"timeline"|"cardIds"/);
  assert.ok(Buffer.byteLength(serialized) < 20_000);
});

test("catalog pagination and kind filters avoid hydrating the full source stores", () => {
  const first = buildBuilderEntityCatalog(sources, { kinds: ["card"], limit: 2, offset: 0 });
  assert.equal(first.entities.length, 2);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextOffset, 2);
  assert.equal(first.entities.every((entry) => entry.ref.entityType === "card"), true);
  const second = buildBuilderEntityCatalog(sources, { kinds: ["card"], limit: 2, offset: first.nextOffset });
  assert.equal(second.entities.length, 1);
  assert.equal(second.hasMore, false);
});

test("root adapter projects compact catalog entries by composite identity", () => {
  const response = buildBuilderEntityCatalog(sources, { limit: 100 });
  const projection = projectBuilderCatalog(response);
  const red = projection.catalog["hapa-avatar-builder:avatar:red"];
  assert.equal(red.entityId, "red");
  assert.equal(red.rendererId, "avatar-builder-avatar");
  assert.equal(red.detailUri, "/api/avatars/red");
  assert.equal(red.resolver.uri, red.detailUri);
});

test("catalog distinguishes mutable songs, stable Song Card heads, and immutable editions", () => {
  const response = buildBuilderEntityCatalog({
    songs: { songs: [{ id: "dear-papa", title: "Dear Papa" }] },
    songCards: {
      heads: [{ schemaVersion: "hapa.song-card.v2", id: "song-card:dear-papa", songId: "dear-papa", title: "Dear Papa", generation: 2, latestEdition: 2 }],
      editions: [{ schemaVersion: "hapa.song-card.edition.v1", id: "song-card:dear-papa:edition:1", songId: "dear-papa", edition: 1, semanticFingerprint: "sha256:e1", publishStatus: "private-demo" }],
    },
  }, { limit: 100 });
  assert.deepEqual(response.countsByKind, { song: 1, "song-card": 1, "song-card-edition": 1 });
  const mutable = response.entities.find((row) => row.ref.entityType === "song");
  const head = response.entities.find((row) => row.ref.entityType === "song-card");
  const edition = response.entities.find((row) => row.ref.entityType === "song-card-edition");
  assert.equal(mutable.sourceMutationAllowed, true);
  assert.equal(head.sourceMutationAllowed, false);
  assert.equal(edition.sourceMutationAllowed, false);
  assert.match(head.detailUri, /\/api\/song-cards\/dear-papa$/);
  assert.match(edition.detailUri, /\/editions\/1$/);
});
