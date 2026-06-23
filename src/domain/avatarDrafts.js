import { normalizeAvatarCard } from "./avatar.js";

export const AVATAR_DRAFT_STORE_VERSION = "hapa.avatar-builder.avatar-drafts.v1";

export function normalizeAvatarDraftStore(input = {}) {
  const records = Array.isArray(input.records)
    ? input.records
    : Array.isArray(input.avatars)
      ? input.avatars.map((avatar) => ({ avatar, savedAt: input.savedAt || avatar?.updatedAt || null }))
      : Array.isArray(input)
        ? input.map((avatar) => ({ avatar, savedAt: avatar?.updatedAt || null }))
        : [];
  const byId = new Map();
  for (const record of records) {
    const avatarInput = record?.avatar || record;
    if (!avatarInput?.id) continue;
    const avatar = normalizeAvatarCard(avatarInput);
    const savedAt = record?.savedAt || avatar.updatedAt || new Date().toISOString();
    byId.set(avatar.id, {
      avatar,
      savedAt,
      reason: record?.reason || "local-draft"
    });
  }
  return {
    schemaVersion: input.schemaVersion || AVATAR_DRAFT_STORE_VERSION,
    savedAt: input.savedAt || new Date().toISOString(),
    records: Array.from(byId.values())
      .sort((a, b) => Date.parse(b.savedAt || "") - Date.parse(a.savedAt || ""))
  };
}

export function upsertAvatarDraftRecord(store = {}, avatarInput, patch = {}) {
  const normalized = normalizeAvatarDraftStore(store);
  if (!avatarInput?.id) return normalized;
  const avatar = normalizeAvatarCard(avatarInput);
  const record = {
    avatar,
    savedAt: patch.savedAt || new Date().toISOString(),
    reason: patch.reason || "local-draft"
  };
  return normalizeAvatarDraftStore({
    ...normalized,
    savedAt: record.savedAt,
    records: [
      record,
      ...normalized.records.filter((item) => item.avatar.id !== avatar.id)
    ]
  });
}

export function removeAvatarDraftRecord(store = {}, avatarId) {
  const normalized = normalizeAvatarDraftStore(store);
  if (!avatarId) return normalized;
  return normalizeAvatarDraftStore({
    ...normalized,
    records: normalized.records.filter((record) => record.avatar.id !== avatarId)
  });
}

export function mergeAvatarDrafts(serverAvatars = [], draftStore = {}) {
  const serverList = (serverAvatars || [])
    .filter((avatar) => avatar?.id)
    .map((avatar) => normalizeAvatarCard(avatar));
  const serverIndexById = new Map(serverList.map((avatar, index) => [avatar.id, index]));
  const draftRecords = normalizeAvatarDraftStore(draftStore).records;
  const pendingRecords = [];
  const merged = [...serverList];

  for (const record of draftRecords) {
    const { avatar } = record;
    const serverIndex = serverIndexById.get(avatar.id);
    const serverAvatar = Number.isInteger(serverIndex) ? merged[serverIndex] : null;
    if (serverAvatar && !isDraftNewerThanServer(record, serverAvatar)) continue;

    const pendingRecord = {
      ...record,
      existsOnServer: Boolean(serverAvatar)
    };
    pendingRecords.push(pendingRecord);

    if (serverAvatar) {
      merged[serverIndex] = avatar;
    } else {
      merged.unshift(avatar);
      serverIndexById.set(avatar.id, 0);
      for (const [id, index] of serverIndexById.entries()) {
        if (id !== avatar.id) serverIndexById.set(id, index + 1);
      }
    }
  }

  return {
    avatars: merged,
    pendingRecords,
    recoveredCount: pendingRecords.length
  };
}

function isDraftNewerThanServer(record, serverAvatar) {
  const draftTime = Date.parse(record?.savedAt || record?.avatar?.updatedAt || "");
  const serverTime = Date.parse(serverAvatar?.updatedAt || "");
  if (!Number.isFinite(serverTime)) return true;
  if (!Number.isFinite(draftTime)) return false;
  return draftTime > serverTime;
}
