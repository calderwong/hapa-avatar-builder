import assert from "node:assert/strict";
import test from "node:test";
import { createAvatarScaffold } from "../src/domain/avatar.js";
import {
  mergeAvatarDrafts,
  normalizeAvatarDraftStore,
  removeAvatarDraftRecord,
  upsertAvatarDraftRecord
} from "../src/domain/avatarDrafts.js";

test("avatar drafts keep local-only avatars visible and pending for sync", () => {
  const red = createAvatarScaffold({ id: "red-reaper", names: ["Red"], primaryName: "Red" });
  const localOnly = createAvatarScaffold({ id: "avatar-local-emily", names: ["Emily"], primaryName: "Emily" });
  const drafts = upsertAvatarDraftRecord({}, localOnly, { savedAt: "2026-06-21T10:05:00.000Z" });

  const merged = mergeAvatarDrafts([red], drafts);

  assert.equal(merged.recoveredCount, 1);
  assert.equal(merged.pendingRecords[0].avatar.id, "avatar-local-emily");
  assert.equal(merged.pendingRecords[0].existsOnServer, false);
  assert.equal(merged.avatars[0].primaryName, "Emily");
  assert.equal(merged.avatars.some((avatar) => avatar.id === "red-reaper"), true);
});

test("newer avatar drafts override older server avatars until the API replay succeeds", () => {
  const serverAvatar = {
    ...createAvatarScaffold({ id: "avatar-bella", names: ["Bella"], primaryName: "Bella" }),
    summary: "Server copy",
    updatedAt: "2026-06-21T10:00:00.000Z"
  };
  const draftAvatar = {
    ...serverAvatar,
    summary: "Recovered local edit"
  };
  const drafts = normalizeAvatarDraftStore({
    records: [{ avatar: draftAvatar, savedAt: "2026-06-21T10:10:00.000Z" }]
  });

  const merged = mergeAvatarDrafts([serverAvatar], drafts);

  assert.equal(merged.recoveredCount, 1);
  assert.equal(merged.pendingRecords[0].existsOnServer, true);
  assert.equal(merged.avatars[0].summary, "Recovered local edit");
});

test("older avatar drafts are ignored and can be removed after server save wins", () => {
  const serverAvatar = {
    ...createAvatarScaffold({ id: "avatar-sparrow", names: ["Sparrow"], primaryName: "Sparrow" }),
    updatedAt: "2026-06-21T11:00:00.000Z"
  };
  const staleDraft = {
    ...serverAvatar,
    summary: "Old local copy"
  };
  const drafts = normalizeAvatarDraftStore({
    records: [{ avatar: staleDraft, savedAt: "2026-06-21T10:00:00.000Z" }]
  });

  const merged = mergeAvatarDrafts([serverAvatar], drafts);
  const cleared = removeAvatarDraftRecord(drafts, "avatar-sparrow");

  assert.equal(merged.recoveredCount, 0);
  assert.equal(merged.avatars[0].summary, serverAvatar.summary);
  assert.equal(cleared.records.length, 0);
});
