import test from "node:test";
import assert from "node:assert/strict";
import {
  collectEmbeddedSongCardSnapshots,
  collectSongCardConstituentReferences,
  hydrateSongCardConstituentSnapshots,
} from "../src/domain/song-card-constituents.js";
import { compileSongCardAppearanceIndex, querySongCardAppearances } from "../src/domain/song-card-mint.js";

const showGraph = {
  song: { id: "constituent-song", durationSeconds: 3 },
  tracks: [{
    id: "media-a",
    role: "media",
    cards: [
      { id: "cue:item", startSeconds: 0, endSeconds: 1, media: { id: "video:item", cardId: "item-one", cardKind: "item", cardRef: "data/item-manager-store.json#cards/item-one", cardTitle: "Item One" } },
      { id: "cue:scene", startSeconds: 1, endSeconds: 2, media: { id: "video:scene", cardId: "scene-one", cardKind: "scene", cardRef: "data/scene-store.json#scenes/scene-one", cardTitle: "Scene One" } },
      { id: "cue:avatar", startSeconds: 2, endSeconds: 3, media: { id: "video:avatar", cardId: "avatar-one", cardKind: "avatar", cardRef: "data/avatar-store.json#avatars/avatar-one", cardTitle: "Avatar One" } },
    ],
  }],
};

test("constituent hydration freezes canonical Item, Scene, and Avatar Card snapshots", () => {
  const result = hydrateSongCardConstituentSnapshots({
    showGraph,
    cardSnapshots: { "item-one": { id: "item-one", schemaVersion: "hapa.song-card.constituent-media.v1", title: "Synthetic Item Fallback" } },
    itemStore: { cards: [{ id: "item-one", schemaVersion: "hapa.item-card.v1", title: "Canonical Item", revision: 4 }] },
    sceneStore: { scenes: [{ id: "scene-one", schemaVersion: "hapa.scene.v1", title: "Canonical Scene", revision: 5 }] },
    avatarStore: { avatars: [{ id: "avatar-one", schemaVersion: "hapa.avatar-card.v1", primaryName: "Canonical Avatar", revision: 6 }] },
  });

  assert.equal(result.receipt.requestedCount, 3);
  assert.equal(result.receipt.hydratedCount, 3);
  assert.equal(result.receipt.unresolvedCount, 0);
  assert.equal(result.cardSnapshots["item-one"].title, "Canonical Item");
  assert.equal(result.receipt.hydrated.find((row) => row.id === "item-one").replacedSyntheticFallback, true);
  assert.equal(result.cardSnapshots["scene-one"].title, "Canonical Scene");
  assert.equal(result.cardSnapshots["avatar-one"].primaryName, "Canonical Avatar");

  const index = compileSongCardAppearanceIndex({ showGraph, cardSnapshots: result.cardSnapshots });
  assert.equal(querySongCardAppearances(index, 500).primary.snapshot.schemaVersion, "hapa.item-card.v1");
  assert.equal(querySongCardAppearances(index, 1500).primary.snapshot.schemaVersion, "hapa.scene.v1");
  assert.equal(querySongCardAppearances(index, 2500).primary.snapshot.schemaVersion, "hapa.avatar-card.v1");
});

test("embedded snapshots stay authoritative and legacy evidence supplies Card kind, ref, and title", () => {
  const project = {
    timeline: [{
      media_card_id: "avatar-two",
      media_title: "Avatar Two · Motion",
      decision_evidence: {
        sourceEvidence: {
          card: {
            id: "avatar-two",
            kind: "avatar",
            ref: "data/avatar-store.json#avatars/avatar-two",
            title: "Avatar Two",
          },
        },
      },
      media_card_snapshot: { id: "avatar-two", schemaVersion: "hapa.avatar-card.v1", primaryName: "Frozen Avatar Two", revision: 8 },
    }],
  };
  assert.deepEqual(collectSongCardConstituentReferences({ project }), [{
    id: "avatar-two",
    kind: "avatar",
    ref: "data/avatar-store.json#avatars/avatar-two",
    title: "Avatar Two",
  }]);
  assert.equal(collectEmbeddedSongCardSnapshots({ project })["avatar-two"].revision, 8);
  const hydrated = hydrateSongCardConstituentSnapshots({
    project,
    avatarStore: { avatars: [{ id: "avatar-two", primaryName: "Mutable Avatar Two", revision: 9 }] },
  });
  assert.equal(hydrated.cardSnapshots["avatar-two"].primaryName, "Frozen Avatar Two");
  assert.equal(hydrated.receipt.hydratedCount, 0);
  assert.equal(hydrated.receipt.suppliedCount, 1);
});

test("unresolved Card references retain a truthful typed fallback instead of impersonating a store snapshot", () => {
  const result = hydrateSongCardConstituentSnapshots({ showGraph });
  assert.equal(result.receipt.hydratedCount, 0);
  assert.equal(result.receipt.unresolvedCount, 3);
  const index = compileSongCardAppearanceIndex({ showGraph, cardSnapshots: result.cardSnapshots });
  const appearance = querySongCardAppearances(index, 2500).primary;
  assert.equal(appearance.sourceCardKind, "avatar");
  assert.equal(appearance.snapshot.schemaVersion, "hapa.song-card.constituent-media.v1");
  assert.equal(appearance.snapshot.title, "Avatar One");
});
