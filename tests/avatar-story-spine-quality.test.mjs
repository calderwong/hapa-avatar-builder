import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const avatarStore = JSON.parse(fs.readFileSync("data/avatar-store.json", "utf8"));
const sceneStore = JSON.parse(fs.readFileSync("data/scene-store.json", "utf8"));
const itemStore = JSON.parse(fs.readFileSync("data/item-manager-store.json", "utf8"));
const reviewQueue = fs.existsSync("data/avatar-mind-human-review-queue.json")
  ? JSON.parse(fs.readFileSync("data/avatar-mind-human-review-queue.json", "utf8"))
  : null;
const storyReport = fs.existsSync("data/healing-reports/latest-avatar-mind-story-spine-report.json")
  ? JSON.parse(fs.readFileSync("data/healing-reports/latest-avatar-mind-story-spine-report.json", "utf8"))
  : null;

const mainAvatarNames = ["Red", "Blue", "Green", "Beth", "M.O.T.H.E.R.", "Calder", "Dancer 45", "Avatar 44"];

function avatarByName(name) {
  return avatarStore.avatars.find((avatar) => avatar.primaryName === name);
}

test("main Avatar Minds have story spines linked to choices, scenes, and voice", () => {
  for (const name of mainAvatarNames) {
    const avatar = avatarByName(name);
    assert.ok(avatar, `${name} should exist`);
    const spine = avatar.mind?.storySpine;
    assert.ok(spine, `${name} should have a story spine`);
    assert.equal(spine.schemaVersion, "hapa.avatar-story-spine.v1");
    assert.equal(spine.canonStatus, "soft_canon");
    assert.ok(spine.coreQuestion?.length > 20, `${name} needs a core question`);
    assert.ok((spine.choiceIds || []).length >= 3, `${name} needs linked choices`);
    assert.ok((spine.sceneIds || []).length >= 1, `${name} needs linked scenes`);
    assert.ok((spine.relationshipIds || []).length >= 1, `${name} needs relationship voice links`);
    assert.ok(avatar.mind?.voiceGuide?.dictionRules?.length >= 3, `${name} needs a voice guide`);
    assert.ok((avatar.mind?.phraseCards || []).some((card) => card.id?.includes("story-spine")), `${name} needs story-spine phrase cards`);
    assert.ok((avatar.mind?.journal || []).some((entry) => entry.journalType === "story-spine-pass"), `${name} needs a story-spine journal`);
  }
});

test("main story scenes and matching item cards exist", () => {
  const scenes = sceneStore.scenes.filter((scene) => (scene.tags || []).includes("main-story-scene-card"));
  assert.ok(scenes.length >= 12, "expected at least 12 main story scene cards");
  for (const scene of scenes.slice(0, 12)) {
    assert.equal(scene.canonStatus, "soft_canon");
    assert.ok((scene.linkedChoiceIds || []).length >= 1, `${scene.id} should link canonical choices`);
    assert.ok((scene.avatarTags || []).length >= 2, `${scene.id} should tag avatars`);
    const card = itemStore.cards.find((item) => item.id === `scene-card-${scene.id}`);
    assert.ok(card, `${scene.id} needs a matching item card`);
    assert.equal(card.cardType, "scene_tracking_card");
    assert.ok(card.connections?.sceneIds?.includes(scene.id), `${card.id} should link back to scene`);
    assert.ok((card.tags || []).includes("main-story-scene-card"));
  }
});

test("canonical choices now link back to generated scene cards", () => {
  for (const name of mainAvatarNames.slice(0, 6)) {
    const avatar = avatarByName(name);
    const linkedChoices = (avatar.mind?.canonicalChoices || []).filter((choice) =>
      (choice.linkTargets?.sceneIds || []).some((sceneId) => sceneId.startsWith("scene-avatar-mind-"))
      && (choice.linkTargets?.cardIds || []).some((cardId) => cardId.startsWith("scene-card-scene-avatar-mind-"))
    );
    assert.ok(linkedChoices.length >= 2, `${name} should have choices linked to scene cards`);
  }
});

test("relationship and annual scene beat passes are present", () => {
  for (const name of mainAvatarNames.slice(0, 6)) {
    const avatar = avatarByName(name);
    assert.ok((avatar.mind?.relationships || []).some((relationship) => relationship.id?.startsWith("relationship-story-spine")), `${name} needs story-spine relationships`);
    assert.ok((avatar.mind?.journal || []).some((entry) => entry.journalType === "relationship-voice-pass"), `${name} needs relationship voice journal`);
    assert.ok((avatar.mind?.annualSceneBeats || []).length >= 3, `${name} needs annual scene beats`);
    assert.ok((avatar.mind?.journal || []).some((entry) => entry.journalType === "annual-scene-beat-pass"), `${name} needs annual scene beat journal`);
  }
});

test("human review queue and reader brief exist", { skip: !reviewQueue || !storyReport }, () => {
  assert.equal(reviewQueue.schemaVersion, "hapa.avatar-mind-human-review-queue.v1");
  assert.ok(reviewQueue.counts.total >= 40, "review queue should contain promoted records");
  assert.ok(reviewQueue.counts.pending >= reviewQueue.counts.total);
  assert.ok(reviewQueue.records.some((record) => record.recordType === "canonical_choice"));
  assert.ok(reviewQueue.records.some((record) => record.recordType === "scene"));
  assert.ok(reviewQueue.records.some((record) => record.recordType === "scene_card"));
  assert.equal(storyReport.schemaVersion, "hapa.avatar-mind-story-spine-report.v1");
  assert.ok(storyReport.counts.storySpines >= mainAvatarNames.length);
  assert.ok(fs.existsSync("data/healing-reports/latest-avatar-mind-reader-brief.md"));
});
