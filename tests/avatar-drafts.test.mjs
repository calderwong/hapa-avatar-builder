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

test("newer sparse avatar drafts preserve richer server avatar mind during replay", () => {
  const serverAvatar = {
    ...createAvatarScaffold({ id: "red-reaper", names: ["Red"], primaryName: "Red" }),
    summary: "Server canon copy",
    updatedAt: "2026-06-21T10:00:00.000Z"
  };
  serverAvatar.mind = {
    ...serverAvatar.mind,
    personaAnchor: {
      ...serverAvatar.mind.personaAnchor,
      wants: "To keep the fleet alive with disciplined fire-control.",
      fears: "A stray command that harms the people it was meant to protect.",
      willNotSayDirectly: "Every command is a promise."
    },
    selfKnowledge: [
      { id: "fact-red-1", label: "Fire-control lead", value: "Red carries verified truth into action." }
    ],
    relationships: [
      { id: "rel-red-blue", targetAvatarId: "blue-reaper", targetName: "Blue", relationLabel: "protocol counterpart", trust: 7 }
    ]
  };
  const sparseDraft = {
    ...createAvatarScaffold({ id: "red-reaper", names: ["Red"], primaryName: "Red" }),
    summary: "Recovered local media edit",
    updatedAt: "2026-06-21T10:10:00.000Z"
  };
  const drafts = normalizeAvatarDraftStore({
    records: [{ avatar: sparseDraft, savedAt: "2026-06-21T10:10:00.000Z" }]
  });

  const merged = mergeAvatarDrafts([serverAvatar], drafts);

  assert.equal(merged.recoveredCount, 1);
  assert.equal(merged.avatars[0].summary, "Recovered local media edit");
  assert.equal(merged.avatars[0].mind.personaAnchor.wants, serverAvatar.mind.personaAnchor.wants);
  assert.equal(merged.avatars[0].mind.personaAnchor.fears, serverAvatar.mind.personaAnchor.fears);
  assert.equal(merged.avatars[0].mind.personaAnchor.willNotSayDirectly, serverAvatar.mind.personaAnchor.willNotSayDirectly);
  assert.equal(merged.avatars[0].mind.selfKnowledge.length, 1);
  assert.equal(merged.avatars[0].mind.relationships.length, 1);
  assert.equal(merged.pendingRecords[0].avatar.mind.relationships.length, 1);
});

test("compact Overwind avatar mind summaries survive draft merging", () => {
  const compactAvatar = {
    ...createAvatarScaffold({ id: "avatar-green", names: ["Green"], primaryName: "Green" }),
    overwindProjection: "compact",
    updatedAt: "2026-06-21T10:00:00.000Z",
    mind: {
      schemaVersion: "hapa.avatar-mind.v1",
      counts: {
        selfKnowledge: 54,
        memories: 170,
        songCards: 28,
        skillCards: 3
      },
      knownOthers: [
        { id: "avatar-blue", name: "Blue", relationLabel: "truth counterpart", trust: 5, tension: 1, loyalty: 5 }
      ],
      loadout: {
        skillCards: [
          { id: "skill-governance", title: "Governance Consul", role: "governance", mechanic: "Give decisions a proof path.", status: "active" }
        ],
        songCards: [
          { id: "song-green-1", songId: "green-song", title: "Green Song", status: "active" }
        ]
      },
      phraseCards: [
        { id: "phrase-green-1", phrase: "Care carries the delivery date." }
      ],
      context: [
        { id: "context-green-1", label: "Green Consul Garden" }
      ]
    }
  };

  const merged = mergeAvatarDrafts([compactAvatar], {});
  const avatar = merged.avatars[0];

  assert.equal(avatar.mind.counts.selfKnowledge, 54);
  assert.equal(avatar.mind.counts.memories, 170);
  assert.equal(avatar.mind.knownOthers.length, 1);
  assert.equal(avatar.mind.loadout.skillCards.length, 1);
  assert.equal(avatar.mind.loadout.songCards.length, 1);
  assert.equal(avatar.mind.phraseCards.length, 1);
  assert.equal(avatar.mind.context.length, 1);
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
