import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarScaffold } from "../src/domain/avatar.js";
import {
  EQUIPMENT_HARDPOINTS,
  auditInventoryStore,
  auditItemManagerStore,
  createInventoryAttachPack,
  createInventoryStoreScaffold,
  createItemCard,
  createItemManagerScaffold,
  equipItemCard,
  normalizeInventoryStore,
  normalizeItemManagerStore
} from "../src/domain/item.js";

test("item manager cards track kind, canon status, prompts, and connections", () => {
  const store = createItemManagerScaffold({
    cards: [
      createItemCard({
        id: "garden-red-forge",
        kind: "garden",
        title: "Red Forge Garden",
        canonStatus: "soft_canon",
        summary: "Stress-tests cards and systems.",
        connections: {
          avatarIds: ["red-reaper"],
          nodeIds: ["hapa-anvil-node"]
        },
        songLinks: [{
          id: "song-link-red-forge",
          songId: "dear-papa-red-forge",
          songTitle: "Red Forge",
          why: "The card uses the song as its kit rhythm."
        }],
        mediaPrompts: {
          twoD: "Wide card art of the Red Forge Garden.",
          threeD: "3D orbital habitat model with red forge decks."
        },
        mediaAssets: [
          {
            id: "asset-red-forge-ref",
            title: "Red Forge Reference",
            type: "image",
            uri: "/media/red-forge-reference.png",
            thumbnailUri: "/media/red-forge-reference-thumb.jpg",
            sourceAssetId: "avatar-red-kit-item-1",
            avatarId: "red-reaper",
            requirementId: "kit_items"
          }
        ]
      })
    ]
  });

  const normalized = normalizeItemManagerStore(store);
  assert.equal(normalized.schemaVersion, "hapa.item-manager-store.v1");
  assert.equal(normalized.cards[0].schemaVersion, "hapa.item-card.v1");
  assert.equal(normalized.cards[0].kind, "garden");
  assert.equal(normalized.cards[0].connections.avatarIds[0], "red-reaper");
  assert.equal(normalized.cards[0].songLinks[0].songId, "dear-papa-red-forge");
  assert.equal(normalized.cards[0].mediaAssets[0].uri, "/media/red-forge-reference.png");
  assert.equal(normalized.cards[0].mediaAssets[0].thumbnailUri, "/media/red-forge-reference-thumb.jpg");
  assert.equal(auditItemManagerStore(normalized).byKind.garden, 1);
  assert.equal(auditItemManagerStore(normalized).withPrompts, 1);
  assert.equal(auditItemManagerStore(normalized).withMedia, 1);
});

test("inventory store creates hardpoints and equips cards without losing existing state", () => {
  const red = createAvatarScaffold({ id: "red-reaper", names: ["Red"], primaryName: "Red" });
  const garden = createItemCard({ id: "garden-red-forge", kind: "garden", title: "Red Forge Garden" });
  const blade = createItemCard({ id: "item-red-blade", kind: "item", title: "Red Blade" });
  let inventory = createInventoryStoreScaffold({ avatars: [red], itemCards: [garden, blade] });

  inventory = equipItemCard(inventory, { avatarId: red.id, avatarName: red.primaryName }, garden, "node_ship", "equipped");
  inventory = equipItemCard(inventory, { avatarId: red.id, avatarName: red.primaryName }, blade, "equipment", "equipped");

  const normalized = normalizeInventoryStore(inventory, [red], [garden, blade]);
  const redInventory = normalized.avatarInventories.find((item) => item.avatarId === "red-reaper");
  assert.equal(EQUIPMENT_HARDPOINTS.length, redInventory.hardpoints.length);
  assert.deepEqual(redInventory.hardpoints.find((item) => item.id === "node_ship").cardIds, ["garden-red-forge"]);
  assert.deepEqual(redInventory.hardpoints.find((item) => item.id === "equipment").cardIds, ["item-red-blade"]);
  assert.equal(redInventory.library.includes("garden-red-forge"), true);
  assert.equal(redInventory.library.includes("item-red-blade"), true);
  assert.equal(auditInventoryStore(normalized).equippedCards, 2);
});

test("inventory attach pack resolves equipped card details for agents", () => {
  const red = createAvatarScaffold({ id: "red-reaper", names: ["Red"], primaryName: "Red" });
  const itemStore = createItemManagerScaffold({
    cards: [
      createItemCard({ id: "ship-red-forge", kind: "ship", title: "HSS Red Forge" })
    ]
  });
  let inventory = createInventoryStoreScaffold({ avatars: [red], itemCards: itemStore.cards });
  inventory = equipItemCard(inventory, { avatarId: red.id, avatarName: red.primaryName }, itemStore.cards[0], "node_ship", "equipped");

  const pack = createInventoryAttachPack(inventory, itemStore, red.id);
  assert.equal(pack.schemaVersion, "hapa.inventory-attach-pack.v1");
  assert.equal(pack.avatars.length, 1);
  assert.equal(pack.avatars[0].hardpoints.find((item) => item.id === "node_ship").cards[0].title, "HSS Red Forge");
});

test("ship cards preserve tarot OCR details and stats", () => {
  const card = createItemCard({
    id: "ship-card-the-grove",
    kind: "ship",
    title: "The Grove",
    shipCard: {
      tarotNumber: "I",
      title: "The Grove",
      subtitle: "Habitat Ark",
      keywords: ["Shelter", "Renewal", "Community"],
      flavorText: "A fleet becomes a people when it learns to grow where it dwells.",
      effectTitle: "Fleet Effect",
      effectText: "Friendly ships in this zone gain +1 morale.",
      stats: {
        speed: 4,
        morale: 8,
        supply: 9,
        influence: 7
      },
      ocr: {
        engine: "apple-vision",
        confidence: 0.91,
        rawText: "THE GROVE\nHABITAT ARK",
        lines: [{ text: "THE GROVE", confidence: 0.98 }]
      }
    }
  });

  assert.equal(card.cardType, "ship_card");
  assert.equal(card.shipCard.schemaVersion, "hapa.ship-card-details.v1");
  assert.equal(card.shipCard.title, "The Grove");
  assert.equal(card.shipCard.stats.morale, 8);
  assert.equal(card.shipCard.keywords.includes("Community"), true);
  assert.equal(card.shipCard.ocr.lines[0].text, "THE GROVE");
});

test("general tarot cards preserve OCR, catalog, attribution, mechanics, lore, and linked media", () => {
  const card = createItemCard({
    id: "mimi-tarot-the-fool",
    kind: "object",
    cardType: "relationship_tarot_card",
    title: "The Fool",
    tags: ["tarot-card", "mimi-card-shop"],
    mediaAssets: [{
      id: "mimi-fool-image",
      type: "image",
      uri: "/media/mimi-card-shop/fool.png",
      thumbnailUri: "/media/mimi-card-shop/fool.png"
    }],
    tarotCard: {
      mainType: "relationship_tarot_card",
      tarotNumber: "0",
      title: "The Fool",
      keywords: ["beginning", "trust"],
      catalog: {
        collectionId: "mimi-card-shop",
        typeLabel: "Relationship Tarot Card",
        sequence: 1
      },
      attribution: {
        author: "Calder",
        shop: "Mimi's Card Shop",
        albumTitle: "Dear Papa",
        sourcePaths: ["/source/fool.png"]
      },
      mechanics: {
        deckUse: "Draw from the relationship pile.",
        relationshipUse: "Open a relationship scene."
      },
      lore: {
        summary: "The Fool becomes a soft-canon Hapa relationship prompt.",
        canonStatus: "generated"
      },
      mediaLinks: [{
        id: "mimi-fool-link",
        imageAssetId: "mimi-fool-image",
        videoAssetId: "mimi-fool-video",
        imageUri: "/media/mimi-card-shop/fool.png",
        videoUri: "/media/mimi-card-shop/fool.mp4",
        posterUri: "/media/mimi-card-shop/fool.png"
      }],
      songLinks: [{
        id: "song-link-fool-red",
        avatarId: "red-reaper",
        songId: "11-23-meant-to-meet",
        songTitle: "11_23 Meant to Meet",
        why: "Red uses the song as the card's performance bridge."
      }],
      sceneLinks: [{
        id: "scene-link-fool-red",
        avatarId: "red-reaper",
        sceneId: "scene-core-protocol-red",
        sceneTitle: "Core Protocol: Red Tests the Threshold",
        why: "The scene gives the card a playable surface."
      }],
      avatarLoreLinks: [{
        id: "avatar-lore-fool-red",
        avatarId: "red-reaper",
        avatarName: "Red",
        tarotType: "The Fool",
        functionalType: "Relationship",
        whyChosen: "Red chooses The Fool as a trust threshold."
      }],
      ocr: {
        engine: "apple-vision",
        confidence: 0.94,
        rawText: "THE FOOL",
        lines: [{ text: "THE FOOL", confidence: 0.98 }],
        sourceImagePaths: ["/source/fool.png"]
      }
    }
  });

  const normalized = normalizeItemManagerStore(createItemManagerScaffold({ cards: [card] })).cards[0];
  assert.equal(normalized.tarotCard.schemaVersion, "hapa.tarot-card-details.v1");
  assert.equal(normalized.tarotCard.mainType, "relationship_tarot_card");
  assert.equal(normalized.tarotCard.catalog.collectionId, "mimi-card-shop");
  assert.equal(normalized.tarotCard.attribution.albumTitle, "Dear Papa");
  assert.equal(normalized.tarotCard.mechanics.deckUse.includes("relationship"), true);
  assert.equal(normalized.tarotCard.lore.canonStatus, "generated");
  assert.equal(normalized.tarotCard.mediaLinks[0].videoUri, "/media/mimi-card-shop/fool.mp4");
  assert.equal(normalized.tarotCard.songLinks[0].songId, "11-23-meant-to-meet");
  assert.equal(normalized.tarotCard.sceneLinks[0].sceneId, "scene-core-protocol-red");
  assert.equal(normalized.tarotCard.avatarLoreLinks[0].functionalType, "Relationship");
  assert.equal(normalized.tarotCard.ocr.lines[0].text, "THE FOOL");
});

test("item quality preserves video level, durability, score, and tier metadata", () => {
  const card = createItemCard({
    id: "mimi-tarot-quality-test",
    kind: "object",
    title: "Quality Test",
    quality: {
      rank: "Legendary",
      qualityRank: "Legendary",
      qualityTier: "legendary",
      level: 3,
      durability: 8,
      medianDurability: 4,
      score: 0.75,
      distributionPercentile: 0.91,
      updatedAt: "2026-06-20T00:00:00.000Z"
    },
    mediaAssets: [{
      id: "quality-test-video",
      type: "video",
      uri: "/media/quality-test.mp4",
      thumbnailUri: "/media/quality-test.png",
      metadata: {
        healingPassRunId: "video-media-healing-test"
      }
    }]
  });

  assert.equal(card.quality.rank, "Legendary");
  assert.equal(card.quality.qualityRank, "Legendary");
  assert.equal(card.quality.qualityTier, "legendary");
  assert.equal(card.quality.level, 3);
  assert.equal(card.quality.videoCount, 3);
  assert.equal(card.quality.durability, 8);
  assert.equal(card.quality.connectedMediaCount, 8);
  assert.equal(card.quality.medianDurability, 4);
  assert.equal(card.quality.score, 0.75);
  assert.equal(card.quality.distributionPercentile, 0.91);
  assert.equal(card.mediaAssets[0].metadata.healingPassRunId, "video-media-healing-test");
});

test("episode and comic cards preserve OCR, media, tarot, song, and avatar links", () => {
  const card = createItemCard({
    id: "episodes-bella-page-1",
    kind: "object",
    cardType: "lore_tarot_card",
    title: "Ballad of Bella: Page 1",
    tags: ["episode-card", "comic-card", "tarot-card"],
    episodeCard: {
      episodeId: "ballad-of-bella-1",
      episodeTitle: "Ballad of Bella",
      seriesTitle: "Episodes",
      classification: "mixed",
      medium: "comic-and-tarot",
      beats: ["Bella is adopted by the Guild"],
      characters: ["Bella", "Red"],
      locations: ["Guild Hall"],
      themes: ["no lost sheep"],
      comic: {
        pageNumber: 1,
        dialogueLines: ["No lost sheep."]
      },
      tarotLinks: [{ id: "tarot-bella", cardId: "mimi-bella-card", why: "The comic page becomes a lore draw." }],
      songLinks: [{ id: "song-bella", songId: "ballad-of-bella", songTitle: "Ballad of Bella" }],
      avatarLinks: [{ id: "avatar-bella", avatarId: "bella", avatarName: "Bella" }],
      mediaLinks: [{
        id: "episode-page-media",
        imageUri: "/media/episodes/page-1.png",
        videoUri: "/media/episodes/page-1.mp4",
        posterUri: "/media/episodes/page-1-first.png"
      }],
      ocr: {
        engine: "apple-vision",
        confidence: 0.88,
        rawText: "BALLAD OF BELLA\nNO LOST SHEEP",
        lines: [{ text: "BALLAD OF BELLA", confidence: 0.96 }],
        sourceImagePaths: ["/source/page-1.png"],
        sourceVideoPaths: ["/source/page-1.mp4"]
      }
    }
  });

  assert.equal(card.episodeCard.schemaVersion, "hapa.episode-card-details.v1");
  assert.equal(card.episodeCard.episodeTitle, "Ballad of Bella");
  assert.equal(card.episodeCard.classification, "mixed");
  assert.equal(card.episodeCard.beats[0], "Bella is adopted by the Guild");
  assert.equal(card.episodeCard.comic.dialogueLines[0], "No lost sheep.");
  assert.equal(card.episodeCard.tarotLinks[0].cardId, "mimi-bella-card");
  assert.equal(card.episodeCard.songLinks[0].songId, "ballad-of-bella");
  assert.equal(card.episodeCard.avatarLinks[0].avatarId, "bella");
  assert.equal(card.episodeCard.mediaLinks[0].videoUri, "/media/episodes/page-1.mp4");
  assert.equal(card.episodeCard.ocr.lines[0].text, "BALLAD OF BELLA");
});
