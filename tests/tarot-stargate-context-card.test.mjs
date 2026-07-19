import test from "node:test";
import assert from "node:assert/strict";
import {
  STARGATE_CONTEXT_CARD_SCHEMA,
  STARGATE_CONTEXT_CONNECTION_POLICY,
  buildStargateContextCard,
  isStargateContextCard,
  restoreStargateContextCard,
  stargateContextEnvelopeFromCard,
  validateStargateContextEnvelope
} from "../src/domain/tarot-stargate-context-card.js";
import {
  STARGATE_FORMATION_SCHEMA,
  STARGATE_PROTOCOL_VERSION,
  STARGATE_PUBLIC_DEMO_SECRET,
  buildPublicDemoGateCards,
  deriveStargate,
  resolveStargateCardIdentity
} from "../src/domain/tarot-stargate-derivation.js";
import { addTarotCard, createTarotStore } from "../src/domain/tarot.js";

function fixture() {
  const cards = buildPublicDemoGateCards();
  const members = cards.map((card, index) => resolveStargateCardIdentity(card, { flipped: false }, index).member);
  const formation = { schemaVersion: STARGATE_FORMATION_SCHEMA, purposeCode: "build-week-domino", members };
  const stargate = deriveStargate({
    formation,
    protocolVersion: STARGATE_PROTOCOL_VERSION,
    privacyScope: "invite_only",
    cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET
  });
  const snapshot = {
    schemaVersion: "hapa.tarot-draw.scene-snapshot.v1",
    id: "scene-context-fixture",
    title: "Build Week Return Scene",
    createdAt: "2026-07-18T00:00:00.000Z",
    avatarName: "Hapa",
    settings: { layoutId: "bella" },
    camera: { position: { x: 0, y: 3.18, z: 6.42 }, target: { x: 0, y: 0.86, z: -0.58 }, fov: 46 },
    counts: { cards: cards.length, locked: 0, field: cards.length, skippedTransient: 0 },
    cards: cards.map((card, index) => ({
      index,
      zone: "field",
      cardId: card.id,
      title: card.title,
      card,
      position: { x: index - 1.5, y: 0.46, z: 0.24 },
      rotation: { pitch: 0.58, yaw: 0, roll: 0, pitchOffset: 0, angleOffset: 0 },
      stackLayer: 0,
      placedAt: index,
      focusProgress: 0,
      scale: 1,
      locked: false
    }))
  };
  const sceneCard = {
    id: snapshot.id,
    title: snapshot.title,
    cardType: "reference_card",
    status: "draft",
    drawScene: { schemaVersion: "hapa.tarot-draw.scene-card.v1", snapshotId: snapshot.id },
    sceneSnapshot: snapshot,
    enrichment: { media: { sceneSnapshot: snapshot } }
  };
  return { cards, sceneCard, snapshot, stargate };
}

test("Save Gate creates a proposed portable Card without durable joining authority", () => {
  const { sceneCard, stargate } = fixture();
  const card = buildStargateContextCard({ sceneCard, stargate, origin: { actorId: "calder" } });
  const envelope = stargateContextEnvelopeFromCard(card);
  assert.equal(isStargateContextCard(card), true);
  assert.equal(envelope.schemaVersion, STARGATE_CONTEXT_CARD_SCHEMA);
  assert.equal(envelope.truthStatus, "proposed_unminted");
  assert.equal(envelope.connectionPolicy, STARGATE_CONTEXT_CONNECTION_POLICY);
  assert.equal(envelope.formation.members.length, 4);
  assert.match(card.imageUri, /^data:image\/svg\+xml/);
  assert.match(card.imageUri, /FRESH%20GATE%20PASS%20REQUIRED/);
  const serialized = JSON.stringify(card);
  assert.equal(serialized.includes(stargate.rendezvousTopic), false);
  assert.equal(serialized.includes(stargate.stargateAddress), false);
  assert.equal(serialized.includes(STARGATE_PUBLIC_DEMO_SECRET), false);
  assert.match(envelope.gate.addressRedacted, /^hapa-gate:v1:/);
  validateStargateContextEnvelope(envelope);
});

test("Tarot persistence retains the safe Context envelope and restorable scene", () => {
  const { sceneCard, stargate, snapshot } = fixture();
  const card = buildStargateContextCard({ sceneCard, stargate });
  const store = addTarotCard(createTarotStore(), card);
  const persisted = store.cards.find((entry) => entry.id === card.id);
  assert.ok(persisted);
  assert.equal(isStargateContextCard(persisted), true);
  const restore = restoreStargateContextCard(persisted);
  assert.equal(restore.connected, false);
  assert.equal(restore.requiresFreshGatePass, true);
  assert.equal(restore.snapshot.id, snapshot.id);
  assert.deepEqual(restore.formation.members.map((member) => member.cardId), stargate.canonicalFormation.members.map((member) => member.cardId));
});

test("Context restoration fails closed after snapshot or commitment tampering", () => {
  const { sceneCard, stargate } = fixture();
  const card = buildStargateContextCard({ sceneCard, stargate });
  const changedSnapshot = structuredClone(card);
  changedSnapshot.sceneSnapshot.title = "Changed after sealing";
  changedSnapshot.enrichment.media.sceneSnapshot.title = "Changed after sealing";
  assert.throws(() => restoreStargateContextCard(changedSnapshot), /no longer matches/);
  const changedEnvelope = structuredClone(card.stargateContext);
  changedEnvelope.connectionPolicy = "auto-connect";
  assert.throws(() => validateStargateContextEnvelope(changedEnvelope), /fresh Gate Pass/);
});

test("local path references are omitted from the portable snapshot with an honest count", () => {
  const { sceneCard, stargate } = fixture();
  sceneCard.sceneSnapshot.cards[0].card.imageUri = "/Users/example/private-card.png";
  sceneCard.enrichment.media.sceneSnapshot = sceneCard.sceneSnapshot;
  const card = buildStargateContextCard({ sceneCard, stargate });
  assert.equal(card.stargateContext.scene.omittedLocalReferences, 1);
  assert.equal(card.sceneSnapshot.cards[0].card.imageUri, "[local-reference-omitted:imageUri]");
});
