import assert from "node:assert/strict";
import test from "node:test";
import { buildStargateCatalogSyncResultCard } from "../server/stargate-context-mint-service.mjs";

test("Catalog sync observation is pressed into a safe source-only Result Card", () => {
  const sourceCard = { id: "tarot-stargate-context:demo", stargateContext: { revisionId: "r2", contextDigest: "a".repeat(64) } };
  const resultCard = buildStargateCatalogSyncResultCard({
    sourceCard,
    state: "catalog_indexed",
    origin: { cardId: "hapa-card:v1:avatar:demo", eventId: "event-1", eventDigest: `sha256:${"b".repeat(64)}`, originSequence: 1, revision: 1, durableAcknowledgement: true, ledgerPosition: 47 },
    catalog: { state: "catalog_indexed", indexed_revision: 1, subscriber_cursor: 47, identity: { second_card_head_created: false }, commerce: { source_only: true, sellable: false, offer_count: 0 } },
    observedAt: "2026-07-18T12:00:00.000Z"
  });
  assert.equal(resultCard.stargateCatalogSyncResult.schemaVersion, "hapa.stargate-catalog-sync-result.v1");
  assert.equal(resultCard.stargateCatalogSyncResult.source.localCardId, sourceCard.id);
  assert.equal(resultCard.stargateCatalogSyncResult.origin.ledgerPosition, 47);
  assert.equal(resultCard.stargateCatalogSyncResult.catalog.secondCardHeadCreated, false);
  assert.equal(resultCard.stargateCatalogSyncResult.catalog.sourceOnly, true);
  assert.equal(resultCard.stargateCatalogSyncResult.catalog.sellable, false);
  assert.equal(resultCard.stargateCatalogSyncResult.boundaries.joinAuthorityIncluded, false);
  assert.match(resultCard.imageUri, /^data:image\/svg\+xml/);
  assert.equal(JSON.stringify(resultCard).includes("/Users/"), false);
  assert.equal(JSON.stringify(resultCard).includes("gatePass"), false);
});
