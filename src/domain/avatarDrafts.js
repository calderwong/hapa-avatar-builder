import { normalizeAvatarCard, normalizeAvatarMind } from "./avatar.js";

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
    .map((avatar) => normalizeAvatarCardPreservingCompactMind(avatar));
  const serverIndexById = new Map(serverList.map((avatar, index) => [avatar.id, index]));
  const draftRecords = normalizeAvatarDraftStore(draftStore).records;
  const pendingRecords = [];
  const merged = [...serverList];

  for (const record of draftRecords) {
    const { avatar } = record;
    const serverIndex = serverIndexById.get(avatar.id);
    const serverAvatar = Number.isInteger(serverIndex) ? merged[serverIndex] : null;
    if (serverAvatar && !isDraftNewerThanServer(record, serverAvatar)) continue;
    const avatarForMerge = serverAvatar ? mergeServerAvatarWithDraft(serverAvatar, avatar, record) : avatar;

    const pendingRecord = {
      ...record,
      avatar: avatarForMerge,
      existsOnServer: Boolean(serverAvatar)
    };
    pendingRecords.push(pendingRecord);

    if (serverAvatar) {
      merged[serverIndex] = avatarForMerge;
    } else {
      merged.unshift(avatarForMerge);
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

function mergeServerAvatarWithDraft(serverAvatar, draftAvatar, record = {}) {
  const server = normalizeAvatarCardPreservingCompactMind(serverAvatar);
  const draft = normalizeAvatarCard(draftAvatar);
  const merged = {
    ...server,
    ...draft,
    names: meaningfulArray(draft.names) ? draft.names : server.names,
    aliases: meaningfulArray(draft.aliases) ? draft.aliases : server.aliases,
    summary: meaningfulText(draft.summary) ? draft.summary : server.summary,
    operatorNotes: meaningfulText(draft.operatorNotes) ? draft.operatorNotes : server.operatorNotes,
    three_paragraph_background_narrative: meaningfulText(draft.three_paragraph_background_narrative)
      ? draft.three_paragraph_background_narrative
      : server.three_paragraph_background_narrative,
    slots: mergeCollectionsByKey(server.slots, draft.slots),
    assets: mergeCollectionsByKey(server.assets, draft.assets),
    activity: mergeCollectionsByKey(server.activity, draft.activity),
    mind: mergeAvatarMind(server, draft),
    updatedAt: record.savedAt || draft.updatedAt || server.updatedAt
  };
  return normalizeAvatarCardPreservingCompactMind(merged);
}

function normalizeAvatarCardPreservingCompactMind(avatar = {}) {
  const normalized = normalizeAvatarCard(avatar);
  if (avatar?.overwindProjection !== "compact" || !avatar.mind || typeof avatar.mind !== "object") {
    return normalized;
  }
  normalized.mind = {
    ...normalized.mind,
    endpoint: avatar.mind.endpoint || normalized.mind.endpoint,
    counts: avatar.mind.counts || normalized.mind.counts,
    knownOthers: avatar.mind.knownOthers || normalized.mind.knownOthers,
    loadout: avatar.mind.loadout || normalized.mind.loadout,
    phraseCards: avatar.mind.phraseCards || normalized.mind.phraseCards,
    context: avatar.mind.context || normalized.mind.context,
    journalCount: avatar.mind.journalCount ?? normalized.mind.journalCount
  };
  return normalized;
}

function mergeAvatarMind(serverAvatar, draftAvatar) {
  const serverMind = normalizeAvatarMind(serverAvatar.mind, serverAvatar);
  const draftMind = normalizeAvatarMind(draftAvatar.mind, draftAvatar);
  const draftMindIsRicher = payloadScore(draftMind) >= payloadScore(serverMind);
  const preferDraft = (serverValue, draftValue) => mergeValue(serverValue, draftValue, true);
  const preferRicherMind = (serverValue, draftValue) => mergeValue(serverValue, draftValue, draftMindIsRicher);

  const merged = {
    ...serverMind,
    ...draftMind,
    personaAnchor: preferDraft(serverMind.personaAnchor, draftMind.personaAnchor),
    soulSeed: preferRicherMind(serverMind.soulSeed, draftMind.soulSeed),
    soulSeedContext: preferRicherMind(serverMind.soulSeedContext, draftMind.soulSeedContext),
    blackHorizonContext: preferRicherMind(serverMind.blackHorizonContext, draftMind.blackHorizonContext),
    consciousnessContext: preferRicherMind(serverMind.consciousnessContext, draftMind.consciousnessContext),
    dearPapaSongContext: preferRicherMind(serverMind.dearPapaSongContext, draftMind.dearPapaSongContext),
    gardenNodeAssignment: preferRicherMind(serverMind.gardenNodeAssignment, draftMind.gardenNodeAssignment),
    shipCrewAssignment: preferRicherMind(serverMind.shipCrewAssignment, draftMind.shipCrewAssignment),
    protocolCardLoadout: mergeCollectionsByKey(serverMind.protocolCardLoadout, draftMind.protocolCardLoadout),
    skillCardLoadout: mergeCollectionsByKey(serverMind.skillCardLoadout, draftMind.skillCardLoadout),
    tarotCardDeck: mergeCollectionsByKey(serverMind.tarotCardDeck, draftMind.tarotCardDeck),
    placementBackstorySeed: preferRicherMind(serverMind.placementBackstorySeed, draftMind.placementBackstorySeed),
    selfKnowledge: mergeCollectionsByKey(serverMind.selfKnowledge, draftMind.selfKnowledge),
    relationships: mergeCollectionsByKey(serverMind.relationships, draftMind.relationships),
    contextMap: mergeCollectionsByKey(serverMind.contextMap, draftMind.contextMap),
    memoryLedger: mergeCollectionsByKey(serverMind.memoryLedger, draftMind.memoryLedger),
    phraseCards: mergeCollectionsByKey(serverMind.phraseCards, draftMind.phraseCards),
    journal: mergeCollectionsByKey(serverMind.journal, draftMind.journal),
    genesisRuns: mergeCollectionsByKey(serverMind.genesisRuns, draftMind.genesisRuns),
    updatedAt: latestIso(serverMind.updatedAt, draftMind.updatedAt)
  };

  if (merged.dearPapaSongContext) {
    merged.dearPapaSongContext = {
      ...merged.dearPapaSongContext,
      selectedSongCards: mergeCollectionsByKey(serverMind.dearPapaSongContext?.selectedSongCards, draftMind.dearPapaSongContext?.selectedSongCards),
      relationshipPrompts: mergeCollectionsByKey(serverMind.dearPapaSongContext?.relationshipPrompts, draftMind.dearPapaSongContext?.relationshipPrompts)
    };
  }

  if (merged.consciousnessContext) {
    merged.consciousnessContext = {
      ...merged.consciousnessContext,
      colonialCopies: mergeCollectionsByKey(serverMind.consciousnessContext?.colonialCopies, draftMind.consciousnessContext?.colonialCopies)
    };
  }

  return normalizeAvatarMind(merged, draftAvatar);
}

function mergeValue(serverValue, draftValue, draftWins = true) {
  if (Array.isArray(serverValue) || Array.isArray(draftValue)) {
    return mergeCollectionsByKey(serverValue, draftValue);
  }
  if (isPlainRecord(serverValue) || isPlainRecord(draftValue)) {
    const serverRecord = isPlainRecord(serverValue) ? serverValue : {};
    const draftRecord = isPlainRecord(draftValue) ? draftValue : {};
    const merged = {};
    for (const key of new Set([...Object.keys(serverRecord), ...Object.keys(draftRecord)])) {
      merged[key] = mergeValue(serverRecord[key], draftRecord[key], draftWins);
    }
    return merged;
  }
  if (draftWins) {
    return hasMeaningfulValue(draftValue) ? draftValue : serverValue;
  }
  return hasMeaningfulValue(serverValue) ? serverValue : draftValue;
}

function mergeCollectionsByKey(serverItems = [], draftItems = []) {
  const merged = new Map();
  for (const item of Array.isArray(serverItems) ? serverItems : []) {
    const key = collectionKey(item);
    if (key) merged.set(key, item);
  }
  for (const item of Array.isArray(draftItems) ? draftItems : []) {
    const key = collectionKey(item);
    if (!key) continue;
    const current = merged.get(key);
    merged.set(key, current ? mergeValue(current, item, true) : item);
  }
  return Array.from(merged.values());
}

function collectionKey(item = {}) {
  if (!item || typeof item !== "object") return "";
  return item.id ||
    item.assetId ||
    item.memoryId ||
    item.contextId ||
    item.cardId ||
    item.songId ||
    item.registryTrackId ||
    item.uri ||
    item.name ||
    item.label ||
    "";
}

function payloadScore(value) {
  if (!hasMeaningfulValue(value)) return 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + 5 + payloadScore(item), 0);
  if (isPlainRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => !["schemaVersion", "createdAt", "updatedAt"].includes(key))
      .reduce((sum, [, item]) => sum + payloadScore(item), 0);
  }
  if (typeof value === "string") return value.trim().length ? Math.min(value.trim().length, 120) : 0;
  return 1;
}

function hasMeaningfulValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => !["schemaVersion", "createdAt", "updatedAt"].includes(key))
      .some(([, item]) => hasMeaningfulValue(item));
  }
  return true;
}

function meaningfulArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function meaningfulText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function latestIso(first, second) {
  const firstTime = Date.parse(first || "");
  const secondTime = Date.parse(second || "");
  if (Number.isFinite(firstTime) && Number.isFinite(secondTime)) return firstTime >= secondTime ? first : second;
  return second || first || new Date().toISOString();
}
