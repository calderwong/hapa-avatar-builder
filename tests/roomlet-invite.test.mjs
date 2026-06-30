import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_ROOMLET_ROOT,
  ROOMLET_HOST_CONTROL_ACTIONS,
  buildRoomletHostControlEvent,
  buildRoomletParticipantCards,
  buildRoomletSceneRecord,
  createRoomletTarotInvite,
  roomletParticipantsFromRoomView
} from "../server/roomletInvite.mjs";

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const roomletAvailable = await pathExists(path.join(process.env.HAPA_ROOMLET_ROOT || DEFAULT_ROOMLET_ROOT, "sidecar/src/demo-room.js"));
const participantCoreKey = "a".repeat(64);

const roomletRoomViewFixture = {
  events: [
    {
      type: "hapa.roomlet.participant.presence",
      participantCoreKey,
      displayName: "Mira Webcam",
      role: "webcam_card",
      status: "heartbeat",
      presence: "webcam_card_live",
      media: { kind: "webcam_card", localTrackKinds: ["audio", "video"] },
      createdAt: "2026-06-29T20:00:00.000Z"
    },
    {
      type: "hapa.roomlet.chat.message",
      participantCoreKey,
      displayName: "Mira Webcam",
      text: "I can see the Tarot table.",
      createdAt: "2026-06-29T20:00:02.000Z"
    }
  ]
};

test("buildRoomletSceneRecord maps Tarot snapshot cards and includes a webcam card", () => {
  const record = buildRoomletSceneRecord({
    inviteId: "test-invite",
    cardId: "webcam-card-test",
    title: "Test Tarot Scene",
    avatarName: "Hapa",
    sceneSnapshot: {
      id: "scene-test",
      title: "Snapshot Scene",
      cards: [
        {
          cardId: "major-arcana-1",
          zone: "field",
          position: { x: 0.25, y: 0.1, z: -0.5 },
          card: { id: "major-arcana-1", title: "The Magician", summary: "As above, so below." }
        }
      ]
    }
  });

  assert.equal(record.type, "hapa.scene.card");
  assert.equal(record.scene.title, "Snapshot Scene");
  assert.equal(record.scene.cards[0].id, "major-arcana-1");
  assert.deepEqual(record.scene.cards[0].position, [0.25, 0.1, -0.5]);
  assert.equal(record.scene.cards.some((card) => card.type === "webcam_card"), true);
  assert.match(record.source.sceneSnapshotHash, /^[0-9a-f]{64}$/);
});

test("Roomlet room-view events become Tarot participant scene cards", () => {
  const participants = roomletParticipantsFromRoomView(roomletRoomViewFixture);
  assert.equal(participants.length, 1);
  assert.equal(participants[0].displayName, "Mira Webcam");
  assert.equal(participants[0].lastChat, "I can see the Tarot table.");

  const participantCards = buildRoomletParticipantCards(roomletRoomViewFixture, { inviteId: "round-trip" });
  assert.equal(participantCards.length, 1);
  assert.equal(participantCards[0].type, "webcam_card");
  assert.equal(participantCards[0].participantCoreKey, participantCoreKey);
  assert.equal(participantCards[0].hostControls.length, ROOMLET_HOST_CONTROL_ACTIONS.length);

  const record = buildRoomletSceneRecord({
    inviteId: "round-trip",
    title: "Round Trip Tarot Scene",
    roomletRoomView: roomletRoomViewFixture,
    sceneSnapshot: { id: "scene-round-trip", title: "Round Trip", cards: [] }
  });
  assert.equal(record.scene.cards.some((card) => card.participantCoreKey === participantCoreKey), true);
});

test("Roomlet host control events require host capability", () => {
  const control = buildRoomletHostControlEvent({
    inviteId: "round-trip",
    roomId: "hapa-avatar-round-trip",
    participantCoreKey,
    action: "mute",
    actorRole: "host",
    actorPermissions: ["room.host.control"],
    reason: "test"
  });
  assert.equal(control.type, "hapa.roomlet.host.control");
  assert.equal(control.action, "mute");
  assert.equal(control.status, "mute_requested");

  assert.throws(() => buildRoomletHostControlEvent({
    participantCoreKey,
    action: "ban",
    actorRole: "host",
    actorPermissions: ["room.host.control"]
  }), /Unsupported Roomlet host control action/);

  assert.throws(() => buildRoomletHostControlEvent({
    participantCoreKey,
    action: "remove",
    actorRole: "viewer",
    actorPermissions: []
  }), /requires host role/);
});

test("createRoomletTarotInvite writes a signed .hapa-room backed by a Scene Core", { skip: !roomletAvailable }, async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "hapa-avatar-roomlet-invite-"));
  try {
    const result = await createRoomletTarotInvite({
      dataDir,
      inviteId: "scene-invite-test",
      cardId: "webcam-card-test",
      title: "Test Tarot Scene",
      avatarName: "Hapa",
      sceneSnapshot: {
        id: "scene-test",
        title: "Snapshot Scene",
        cards: []
      },
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      hostBridge: {
        type: "hapa.avatar-builder.roomlet-phone-bridge.v1",
        session: "scene-session-test",
        inviteId: "scene-invite-test",
        cardId: "webcam-card-test",
        target: "desktop",
        eventsUrl: "https://hapa.local/api/phone-bridge/events",
        desktopEventsUrl: "http://127.0.0.1:8787/api/phone-bridge/events"
      }
    });

    const invite = JSON.parse(await readFile(result.invitePath, "utf8"));
    assert.equal(invite.type, "hapa.room.invite");
    assert.equal(invite.version, 1);
    assert.equal(invite.roomId, "hapa-avatar-scene-invite-test");
    assert.match(invite.scene.sceneCoreKey, /^[0-9a-f]{64}$/);
    assert.match(invite.scene.roomTopic, /^[0-9a-f]{64}$/);
    assert.match(invite.scene.ownerPublicKey, /^[0-9a-f]{64}$/);
    assert.equal(invite.capability.role, "webcam_card");
    assert.equal(invite.webrtc.enabled, true);
    assert.equal(invite.network.mode, "fixture");
    assert.equal(invite.network.fixtureHostStorageDir, result.hostStorageDir);
    assert.equal(invite.extensions.avatarBuilderPhoneBridge.session, "scene-session-test");
    assert.equal(invite.extensions.avatarBuilderPhoneBridge.target, "desktop");
    assert.equal(result.sceneCoreKey, invite.scene.sceneCoreKey);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
