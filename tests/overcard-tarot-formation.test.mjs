import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SCHEMAS, validateFormation } from "@hapa/overcard/core";
import { migrateTarotSceneSnapshot, resolveTarotAttachmentContext, semanticTarotFormation, tarotFormationToSceneSnapshot, tarotSceneSnapshotToFormation } from "../src/overcard/tarotFormationAdapter.js";

const snapshot = {
  schemaVersion: "hapa.tarot-draw.scene-snapshot.v1", id: "scene-red", title: "Red Table", createdAt: "2026-07-11T17:00:00.000Z", avatarName: "Red",
  settings: { layoutId: "cross", backStyle: "hapa", musicVisualizerMode: "rings", centerVisualizerEnabled: true, playing: false },
  camera: { position: { x: 1, y: 4.5, z: 6 }, target: { x: 0, y: .1, z: 0 }, fov: 51 },
  cards: [
    { index: 0, zone: "field", cardId: "card-a", title: "A", card: { id: "card-a", title: "A", imageUri: "/a.png" }, position: { x: 1.25, y: .078, z: -.5 }, rotation: { pitch: .1, yaw: .2, roll: .3, pitchOffset: .04, angleOffset: .05 }, scale: 1.4, stackLayer: 2, placedAt: 4, focusProgress: .7, locked: false },
    { index: 1, zone: "dock", cardId: "card-a", title: "A Copy", card: { id: "card-a", title: "A" }, position: { x: -.8, y: .26, z: 2.1 }, rotation: { pitch: .6, yaw: 0, roll: 0 }, scale: .9, placedAt: 5, locked: true },
    { index: 2, zone: "drop", cardId: "card-b", title: "B", card: { id: "card-b", title: "B" }, position: { x: 2.64, y: .15, z: 1.42 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1, placedAt: 6, locked: true },
    { index: 3, zone: "media", cardId: "card-c", title: "C", card: { id: "card-c", title: "C" }, position: { x: -2.62, y: .14, z: -1.35 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1, placedAt: 7, locked: true },
    { index: 4, zone: "center", cardId: "card-d", title: "D", card: { id: "card-d", title: "D" }, position: { x: 0, y: 1.06, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1, placedAt: 8, locked: true },
  ],
};

test("legacy Tarot Dock/scenes migrate to canonical Formations without pose, zone, settings, camera, or duplicate loss", () => {
  const formation = tarotSceneSnapshotToFormation(snapshot, { avatarId: "red", avatarName: "Red" });
  assert.equal(validateFormation(formation).ok, true); assert.equal(formation.schema, SCHEMAS.formation);
  assert.equal(formation.members.length, 5); assert.equal(new Set(formation.members.map((member) => member.entity.entityId)).size, 5);
  assert.deepEqual(formation.members.map((member) => member.zone), ["field", "dock", "drop", "media", "center"]);
  const restored = tarotFormationToSceneSnapshot(formation);
  assert.deepEqual(restored.cards.map((card) => card.cardId), snapshot.cards.map((card) => card.cardId));
  assert.deepEqual(restored.cards.map((card) => card.zone), snapshot.cards.map((card) => card.zone));
  assert.deepEqual(restored.cards[0].position, snapshot.cards[0].position); assert.deepEqual(restored.cards[0].rotation, snapshot.cards[0].rotation);
  assert.equal(restored.cards[0].scale, 1.4); assert.deepEqual(restored.settings, snapshot.settings); assert.deepEqual(restored.camera, snapshot.camera);
});

test("CSS Overcard and Tarot Three.js round-trip the same semantic Formation", () => {
  const first = tarotSceneSnapshotToFormation(snapshot, { avatarId: "red", avatarName: "Red" });
  const cssSemantic = semanticTarotFormation(first);
  const second = tarotSceneSnapshotToFormation(tarotFormationToSceneSnapshot(first), { avatarId: "red", avatarName: "Red" });
  assert.deepEqual(semanticTarotFormation(second), cssSemantic);
  assert.equal(first.projections.cssOvercard.renderer, "overcard-css-overlay");
  assert.equal(first.projections["hapa-avatar-builder:tarot-3d"].renderer, "builder-tarot-3d");
  const migrated = migrateTarotSceneSnapshot(snapshot, { avatarId: "red", avatarName: "Red" });
  assert.equal(migrateTarotSceneSnapshot(migrated, { avatarId: "red" }).formation.id, migrated.formation.id);
});

test("active Avatar/Deck/Set attachments determine Tarot host and draw collection context", () => {
  const entity = (entityType, entityId) => ({ schema: SCHEMAS.entityRef, sourceSystem: "hapa-avatar-builder", entityType, entityId, availability: "available" });
  const attachment = (id, entityType, entityId, status = "active") => ({ id, status, entity: entity(entityType, entityId), role: entityType === "avatar" ? "host-avatar" : "context", host: { nodeId: "hapa-avatar-builder", hostId: "tarot", processId: "tarot-draw", socketId: `tarot:${entityType}` } });
  const context = resolveTarotAttachmentContext({ a: attachment("a", "avatar", "red"), d: attachment("d", "deck", "deck-red"), s: attachment("s", "set", "set-one"), c: attachment("c", "card", "direct"), paused: attachment("p", "avatar", "blue", "paused") }, { decks: [{ id: "deck-red", cardIds: ["one", "two"] }], sets: [{ id: "set-one", cardIds: ["two", "three"] }] });
  assert.equal(context.hostAvatarId, "red"); assert.deepEqual(context.cardIds, ["direct", "one", "two", "three"]);
  assert.deepEqual(context.collectionRefs.map((ref) => ref.id), ["deck-red", "set-one"]); assert.deepEqual(context.unresolvedCollectionIds, []);
});

test("the live App and Three.js Save/Load paths consume the shared adapter", async () => {
  const [app, tarot] = await Promise.all([readFile(new URL("../src/App.jsx", import.meta.url), "utf8"), readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8")]);
  assert.match(app, /resolveTarotAttachmentContext\(overcardAttachments, normalizedTarotStore\)/);
  assert.match(app, /tarotAttachmentContext\.hostAvatarId/); assert.match(app, /avatarId=\{/);
  assert.match(tarot, /snapshot\.formation = tarotSceneSnapshotToFormation/);
  assert.match(tarot, /migrateTarotSceneSnapshot\(rawSnapshot/); assert.match(tarot, /entry\.group\.scale\.setScalar/);
});
