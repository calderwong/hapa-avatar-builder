import { buildStargateContextCard } from "../src/domain/tarot-stargate-context-card.js";
import {
  STARGATE_FORMATION_SCHEMA,
  STARGATE_PROTOCOL_VERSION,
  STARGATE_PUBLIC_DEMO_SECRET,
  buildPublicDemoGateCards,
  deriveStargate,
  resolveStargateCardIdentity
} from "../src/domain/tarot-stargate-derivation.js";

export function gatePassFixture() {
  const cards = buildPublicDemoGateCards();
  const formation = {
    schemaVersion: STARGATE_FORMATION_SCHEMA,
    purposeCode: "build-week-domino",
    members: cards.map((card, index) => resolveStargateCardIdentity(card, { flipped: false }, index).member)
  };
  const stargate = deriveStargate({
    formation,
    protocolVersion: STARGATE_PROTOCOL_VERSION,
    privacyScope: "invite_only",
    cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET
  });
  const snapshot = {
    schemaVersion: "hapa.tarot-draw.scene-snapshot.v1",
    id: "gate-pass-proof-scene",
    title: "Build Week Gate Pass Scene",
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
  const card = buildStargateContextCard({
    sceneCard: {
      id: snapshot.id,
      title: snapshot.title,
      cardType: "reference_card",
      status: "draft",
      drawScene: { schemaVersion: "hapa.tarot-draw.scene-card.v1", snapshotId: snapshot.id },
      sceneSnapshot: snapshot,
      enrichment: { media: { sceneSnapshot: snapshot } }
    },
    stargate,
    origin: { nodeId: "hapa-avatar-builder", actorId: "test-operator" }
  });
  return {
    card,
    cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET,
    globalCardId: `hapa-card:v1:${Buffer.from("hapa-avatar-builder").toString("base64url")}:${Buffer.from(card.id).toString("base64url")}`,
    revision: 1,
    stargate
  };
}
