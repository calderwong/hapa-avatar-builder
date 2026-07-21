import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTarotCard } from "../src/domain/tarot.js";

const manifest = JSON.parse(await readFile(new URL("../config/codex-build-week-set.json", import.meta.url), "utf8"));

test("Codex Build Week Set balances Turn, Skill, Capability, and Protocol Cards", () => {
  assert.equal(manifest.schemaVersion, "hapa.codex-build-week-set.v1");
  assert.equal(manifest.cards.length, 16);
  const counts = Object.groupBy(manifest.cards, (card) => card.category);
  for (const category of ["turn", "skill", "capability", "protocol"]) assert.equal(counts[category]?.length, 4);
  assert.equal(new Set(manifest.cards.map((card) => card.id)).size, manifest.cards.length);
  assert.deepEqual(manifest.cards.map((card) => card.order), Array.from({ length: 16 }, (_, index) => index + 1));
});

test("every Build Week Card carries mined Turn lineage and bounded Krea art direction", () => {
  for (const card of manifest.cards) {
    assert.match(card.id, /^codex-build-week-/);
    assert.ok(card.sourceTurnIds.length >= 1);
    for (const turnId of card.sourceTurnIds) assert.match(turnId, /^ai_turn:[a-f0-9]{16}$/);
    assert.match(card.sourceFixture, /\.png$/);
    assert.ok(card.instruction.length > 80);
    assert.match(card.instruction, /no (letters|text|readable text)/i);
    assert.equal(Number.isInteger(card.seed), true);
  }
  assert.equal(manifest.imageGeneration.provider, "hapa-krea2-identity-node");
  assert.equal(manifest.imageGeneration.sourceBasis, "synthetic_nonhuman");
  assert.equal(manifest.imageGeneration.identityTruth, false);
});

test("Tarot card creation preserves a verified custody receipt", () => {
  const digest = "a".repeat(64);
  const card = createTarotCard({
    id: "custodied-card",
    title: "Custodied Card",
    cardCoreKey: digest,
    cardRevisionId: "created-1234",
    cardRecordDigest: digest,
    originPublicKey: digest,
    custody: {
      schemaVersion: "hapa.card-custody-receipt.v1",
      cardId: "custodied-card",
      cardCoreKey: digest,
      cardRevisionId: "created-1234",
      cardRecordDigest: digest,
      durableReceipt: true
    }
  });
  assert.equal(card.cardCoreKey, digest);
  assert.equal(card.cardRecordDigest, digest);
  assert.equal(card.custody?.durableReceipt, true);
});

test("Tarot Draw lazy-loads explicit Tarot library Cards without weakening the default media gate", async () => {
  const [appSource, hostTargetsSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/overcard/hostTargets.js", import.meta.url), "utf8")
  ]);
  assert.match(appSource, /buildTarotLibraryDrawCards\(tarotLibraryCards\)/);
  assert.match(appSource, /includes\("tarot-draw-ready"\)/);
  assert.match(appSource, /ensureTarotStoreLoaded/);
  assert.match(hostTargetsSource, /store: "tarot"/);
});
