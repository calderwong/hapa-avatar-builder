import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AvatarOverwindOrigin } from "../server/avatar-overwind-origin.mjs";
import { AvatarOverwindSubscriber } from "../server/avatar-overwind-subscriber.mjs";
import { StargateContextReturnResolver } from "../server/stargate-context-return-resolver.mjs";
import { buildStargateContextCard } from "../src/domain/tarot-stargate-context-card.js";
import {
  STARGATE_FORMATION_SCHEMA,
  STARGATE_PROTOCOL_VERSION,
  STARGATE_PUBLIC_DEMO_SECRET,
  buildPublicDemoGateCards,
  deriveStargate,
  resolveStargateCardIdentity
} from "../src/domain/tarot-stargate-derivation.js";

function fixtureCard() {
  const cards = buildPublicDemoGateCards();
  const formation = {
    schemaVersion: STARGATE_FORMATION_SCHEMA,
    purposeCode: "catalog-return-test",
    members: cards.map((card, index) => resolveStargateCardIdentity(card, { flipped: false }, index).member)
  };
  const stargate = deriveStargate({ formation, protocolVersion: STARGATE_PROTOCOL_VERSION, privacyScope: "invite_only", cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET });
  const snapshot = {
    schemaVersion: "hapa.tarot-draw.scene-snapshot.v1",
    id: "catalog-return-scene",
    title: "Catalog Return Scene",
    createdAt: "2026-07-18T00:00:00.000Z",
    avatarName: "Hapa",
    settings: { layoutId: "bella" },
    camera: { position: { x: 0, y: 3.18, z: 6.42 }, target: { x: 0, y: 0.86, z: -0.58 }, fov: 46 },
    counts: { cards: cards.length, locked: 0, field: cards.length, skippedTransient: 0 },
    cards: cards.map((card, index) => ({ index, zone: "field", cardId: card.id, title: card.title, card, position: { x: index - 1.5, y: 0.46, z: 0.24 }, rotation: { pitch: 0.58, yaw: 0, roll: 0, pitchOffset: 0, angleOffset: 0 }, stackLayer: 0, placedAt: index, focusProgress: 0, scale: 1, locked: false }))
  };
  return buildStargateContextCard({
    sceneCard: { id: snapshot.id, title: snapshot.title, cardType: "reference_card", status: "draft", drawScene: { schemaVersion: "hapa.tarot-draw.scene-card.v1", snapshotId: snapshot.id }, sceneSnapshot: snapshot, enrichment: { media: { sceneSnapshot: snapshot } } },
    stargate,
    origin: { nodeId: "hapa-avatar-builder", actorId: "test-operator" }
  });
}

test("Catalog return resolves the pinned origin revision without Catalog or connection authority", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hapa-stargate-return-"));
  const origin = new AvatarOverwindOrigin({ dbPath: path.join(dir, "origin.sqlite3"), overwindUrl: "http://127.0.0.1:1" });
  const subscriber = new AvatarOverwindSubscriber({ dbPath: path.join(dir, "subscriber.sqlite3"), baseUrl: "http://127.0.0.1:1", token: "fixture" });
  try {
    const card = fixtureCard();
    const staged = await origin.commitCardMint("tarot", card, async () => {});
    origin.appendOperation("tarot", { ...card, title: "A newer Return Card title" }, "card.revised");
    const resolver = new StargateContextReturnResolver({ origin, subscriber });
    const result = await resolver.resolve({ cardId: staged.event.card_id, expectedRevision: 1, sourceNode: "hapa-avatar-builder" });
    assert.equal(result.card.title, card.title);
    assert.equal(result.identity.pinnedRevision, 1);
    assert.equal(result.identity.sourceHeadRevision, 2);
    assert.equal(result.identity.newerRevisionAvailable, true);
    assert.equal(result.restore.connected, false);
    assert.equal(result.restore.requiresFreshGatePass, true);
    assert.equal(result.restore.autoConnect, false);
    assert.deepEqual(result.effects, { catalog_contacted: false, p2p_joined: false, pass_requested: false, external_writes: 0 });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("rendezvousTopic"), false);
    assert.equal(serialized.includes("cohortSecret"), false);
  } finally {
    subscriber.close();
    origin.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("subscriber cache can restore an exact Return Card while Overwind and Catalog are offline", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hapa-stargate-return-cache-"));
  const origin = new AvatarOverwindOrigin({ dbPath: path.join(dir, "origin.sqlite3"), overwindUrl: "http://127.0.0.1:1" });
  const subscriber = new AvatarOverwindSubscriber({ dbPath: path.join(dir, "subscriber.sqlite3"), baseUrl: "http://127.0.0.1:1", token: "fixture" });
  try {
    const card = fixtureCard();
    const cardId = `hapa-card:v1:${Buffer.from("hapa-avatar-builder").toString("base64url")}:${Buffer.from(card.id).toString("base64url")}`;
    subscriber.remember([{ card_id: cardId, card_type: "stargate_context", title: card.title, revision: 4, event_id: "event:4", event_digest: "sha256:event4", ledger_position: 44, envelope: { content: { authoritative: card } } }], 44);
    const result = await new StargateContextReturnResolver({ origin, subscriber }).resolve({ cardId, expectedRevision: 4, sourceNode: "hapa-avatar-builder" });
    assert.equal(result.custody.resolver, "subscriber-cache-exact");
    assert.equal(result.custody.offline, true);
    assert.equal(result.custody.catalogRequired, false);
    assert.equal(result.restore.connected, false);
  } finally {
    subscriber.close();
    origin.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
