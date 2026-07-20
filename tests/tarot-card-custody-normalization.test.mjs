import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeTarotStore } from "../src/domain/tarot.js";

test("Tarot normalization preserves a verified Card custody receipt", () => {
  const custody = {
    schemaVersion: "hapa.card-custody-receipt.v1",
    cardId: "custody-card",
    cardCoreKey: "a".repeat(64),
    cardRevisionId: "created-1234567890abcdef",
    cardRecordDigest: "b".repeat(64),
    originPublicKey: "c".repeat(64),
    hypercoreAppended: true,
    minted: false,
  };
  const store = normalizeTarotStore({
    cards: [{ id: "custody-card", title: "Custody Card", custody }],
  });
  const card = store.cards[0];
  assert.equal(card.cardId, "custody-card");
  assert.equal(card.cardCoreKey, custody.cardCoreKey);
  assert.equal(card.cardRevisionId, custody.cardRevisionId);
  assert.equal(card.cardRecordDigest, custody.cardRecordDigest);
  assert.deepEqual(card.custody, custody);
});

test("the Item-to-Tarot projection carries existing custody instead of stripping it", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  for (const token of [
    "cardCoreKey: card.cardCoreKey || card.hypercore?.key || card.custody?.cardCoreKey",
    "cardRevisionId: card.cardRevisionId || card.revisionId || card.custody?.cardRevisionId",
    "cardRecordDigest: card.cardRecordDigest || card.recordDigest || card.custody?.cardRecordDigest",
  ]) assert.match(source, new RegExp(token.replace(/[?.|]/gu, "\\$&")));
});
