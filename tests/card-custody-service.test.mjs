import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  applyCardCustodyReceipt,
  openAvatarCardCustodyService,
} from "../server/card-custody-service.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "hapa-card-custody-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("a legacy projection lazily receives one real Hypercore without becoming minted", async (t) => {
  const root = await fixture(t);
  const service = openAvatarCardCustodyService({ root, now: () => "2026-07-20T00:00:00.000Z" });
  const source = {
    id: "legacy-card",
    title: "Legacy Card",
    summary: "A runtime projection promoted at first Stargate use.",
    cardType: "protocol_card",
    tags: ["stargate", "legacy"],
  };

  const first = await service.ensure({ card: source, actorId: "calder", evidenceRef: "test:first-use" });
  assert.equal(first.created, true);
  assert.match(first.receipt.cardCoreKey, /^[a-f0-9]{64}$/u);
  assert.match(first.receipt.cardRecordDigest, /^[a-f0-9]{64}$/u);
  assert.equal(first.receipt.custodyState, "origin_appended");
  assert.equal(first.receipt.minted, false);
  assert.equal(first.receipt.catalogPublished, false);
  assert.equal(first.receipt.commerceEligible, false);
  assert.equal(first.card.custody.hypercoreAppended, true);
  assert.equal(first.card.custody.portableCustody, true);
  assert.equal(first.card.custody.minted, false);

  const second = await service.ensure({ card: source, actorId: "calder", evidenceRef: "test:repeat" });
  assert.equal(second.created, false);
  assert.deepEqual(second.receipt, first.receipt);
  assert.equal((await service.list()).cardCount, 1);
});

test("custody survives a new service instance and opens only the exact Card core", async (t) => {
  const root = await fixture(t);
  const firstService = openAvatarCardCustodyService({ root, now: () => "2026-07-20T00:00:00.000Z" });
  const created = await firstService.ensure({ card: { id: "restart-card", title: "Restart Card" }, actorId: "calder", evidenceRef: "test:restart" });

  const restarted = openAvatarCardCustodyService({ root });
  const index = await restarted.list();
  assert.equal(index.cardCount, 1);
  assert.equal(index.startupPolicy, "registry-projection-only; Card cores open only for exact read or ensure");
  assert.deepEqual(await restarted.get("restart-card"), created.receipt);
  assert.equal(await restarted.get("missing-card"), null);
});

test("live bridge material must be captured before it receives custody", async (t) => {
  const service = openAvatarCardCustodyService({ root: await fixture(t) });
  await assert.rejects(
    service.ensure({ card: { id: "live-phone", title: "Phone", isPhoneCard: true }, actorId: "calder" }),
    /explicitly captured as a Card/u,
  );
  assert.equal((await service.list()).cardCount, 0);
});

test("a custody receipt cannot be applied to a different Card", () => {
  assert.throws(() => applyCardCustodyReceipt({ id: "other" }, {
    schemaVersion: "hapa.card-custody-receipt.v1",
    cardId: "source",
    cardCoreKey: "a".repeat(64),
    cardRecordDigest: "b".repeat(64),
  }), /different Card/u);
});
