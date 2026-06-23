#!/usr/bin/env node
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOT = path.resolve(process.argv[2] || "/Users/calderwong/pinokio/api/hapa-avatar-builder-desktop/app");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const DEST_DATA = path.join(ROOT, "data");
const SOURCE_DATA = path.join(SOURCE_ROOT, "data");
const BACKUP_DIR = path.join(DEST_DATA, "backups", `pre-pinokio-merge-${STAMP}`);
const REPORT_DIR = path.join(DEST_DATA, "merge-reports");

const STORE_FILES = [
  "avatar-store.json",
  "scene-store.json",
  "kanban.json",
  "media-library.json",
  "tarot-store.json"
];

const report = {
  schemaVersion: "hapa.avatar-builder.pinokio-merge-report.v1",
  runAt: new Date().toISOString(),
  canonicalRoot: ROOT,
  sourceRoot: SOURCE_ROOT,
  backupDir: BACKUP_DIR,
  files: {},
  avatars: {
    before: 0,
    incoming: 0,
    after: 0,
    mergedByIdentity: [],
    imported: [],
    idConflicts: [],
    probableDuplicates: []
  },
  sceneStore: {},
  kanban: {},
  copiedStores: [],
  warnings: []
};

await main();

async function main() {
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
  await backupExistingStores();

  await mergeAvatarStore();
  await mergeSceneStore();
  await mergeKanbanStore();
  await mergeOrCopyStore("media-library.json");
  await mergeOrCopyStore("tarot-store.json");

  const reportPath = path.join(REPORT_DIR, `pinokio-data-merge-${STAMP}.json`);
  await writeJson(reportPath, report);
  console.log(JSON.stringify({ ok: true, reportPath, avatars: report.avatars, copiedStores: report.copiedStores }, null, 2));
}

async function backupExistingStores() {
  for (const fileName of STORE_FILES) {
    const source = path.join(DEST_DATA, fileName);
    if (await exists(source)) {
      const target = path.join(BACKUP_DIR, fileName);
      await copyFile(source, target);
      report.files[fileName] = { backedUp: true, backupPath: target };
    } else {
      report.files[fileName] = { backedUp: false };
    }
  }
}

async function mergeAvatarStore() {
  const destPath = path.join(DEST_DATA, "avatar-store.json");
  const sourcePath = path.join(SOURCE_DATA, "avatar-store.json");
  const destStore = await readJson(destPath);
  const sourceStore = await readJson(sourcePath);
  const destAvatars = Array.isArray(destStore.avatars) ? destStore.avatars.map(clone) : [];
  const sourceAvatars = Array.isArray(sourceStore.avatars) ? sourceStore.avatars : [];
  const sourceIdToDestId = new Map();
  const destById = new Map(destAvatars.map((avatar) => [avatar.id, avatar]));
  const destByName = new Map(destAvatars.map((avatar) => [normalName(primaryName(avatar)), avatar]).filter(([name]) => name));

  report.avatars.before = destAvatars.length;
  report.avatars.incoming = sourceAvatars.length;

  for (const incoming of sourceAvatars) {
    const incomingName = primaryName(incoming);
    const incomingNameKey = normalName(incomingName);
    const sameIdentity = incomingNameKey ? destByName.get(incomingNameKey) : null;
    const sameId = incoming.id ? destById.get(incoming.id) : null;

    if (sameIdentity) {
      const merged = mergeAvatar(sameIdentity, incoming, {
        originalId: incoming.id,
        reason: sameIdentity.id === incoming.id ? "same-id-same-identity" : "same-identity-different-id"
      });
      Object.assign(sameIdentity, merged);
      sourceIdToDestId.set(incoming.id, sameIdentity.id);
      report.avatars.mergedByIdentity.push({
        sourceId: incoming.id,
        sourceName: incomingName,
        targetId: sameIdentity.id,
        targetName: primaryName(sameIdentity),
        reason: sameIdentity.id === incoming.id ? "same-id" : "same-name"
      });
      continue;
    }

    if (sameId) {
      const newId = uniqueId(`pinokio-${slugify(incomingName || incoming.id)}`, destById);
      const imported = markImportedAvatar({ ...clone(incoming), id: newId }, incoming.id, "id-conflict-different-identity");
      destAvatars.push(imported);
      destById.set(imported.id, imported);
      if (incomingNameKey) destByName.set(incomingNameKey, imported);
      sourceIdToDestId.set(incoming.id, imported.id);
      report.avatars.idConflicts.push({
        sourceId: incoming.id,
        sourceName: incomingName,
        existingName: primaryName(sameId),
        importedAs: imported.id
      });
      report.avatars.imported.push({ sourceId: incoming.id, sourceName: incomingName, importedAs: imported.id });
      continue;
    }

    const newId = incoming.id && !destById.has(incoming.id)
      ? incoming.id
      : uniqueId(`pinokio-${slugify(incomingName || incoming.id || "avatar")}`, destById);
    const imported = markImportedAvatar({ ...clone(incoming), id: newId }, incoming.id, "new-identity");
    destAvatars.push(imported);
    destById.set(imported.id, imported);
    if (incomingNameKey) destByName.set(incomingNameKey, imported);
    sourceIdToDestId.set(incoming.id, imported.id);
    report.avatars.imported.push({ sourceId: incoming.id, sourceName: incomingName, importedAs: imported.id });
  }

  const mappedTeams = mergeTeams(destStore.teams || [], sourceStore.teams || [], sourceIdToDestId, destAvatars);
  const probableDuplicates = findProbableDuplicates(destAvatars);
  report.avatars.probableDuplicates = probableDuplicates;

  const nextStore = {
    ...destStore,
    avatars: destAvatars,
    teams: mappedTeams,
    pinokioSource: {
      root: SOURCE_ROOT,
      avatarStore: sourcePath,
      sourceUpdatedAt: sourceStore.updatedAt || sourceStore.savedAt || null,
      mergedAt: report.runAt
    },
    hapaDataMerge: {
      ...(destStore.hapaDataMerge || {}),
      latestPinokioMerge: {
        mergedAt: report.runAt,
        sourceRoot: SOURCE_ROOT,
        backupDir: BACKUP_DIR,
        imported: report.avatars.imported.length,
        mergedByIdentity: report.avatars.mergedByIdentity.length,
        idConflicts: report.avatars.idConflicts.length,
        probableDuplicates: probableDuplicates.length
      }
    },
    updatedAt: report.runAt
  };

  report.avatars.after = destAvatars.length;
  await writeJson(destPath, nextStore);
}

function mergeAvatar(base, incoming, provenance) {
  const merged = mergeObjects(base, incoming, { preserveKeys: new Set(["id", "primaryName"]) });
  merged.aliases = uniqueStrings([...(base.aliases || []), ...(incoming.aliases || [])]);
  merged.names = mergeArray(base.names || [], incoming.names || [], nameRecordKey);
  merged.assets = mergeArray(base.assets || [], incoming.assets || [], mediaRecordKey);
  merged.slots = mergeArray(base.slots || [], incoming.slots || [], slotRecordKey);
  merged.tags = uniqueStrings([...(base.tags || []), ...(incoming.tags || []), "pinokio-merged"]);
  merged.updatedAt = newestTime(base.updatedAt, incoming.updatedAt, report.runAt);
  merged.hapaMergeProvenance = mergeProvenance(base.hapaMergeProvenance, provenance);
  return merged;
}

function markImportedAvatar(avatar, originalId, reason) {
  return {
    ...avatar,
    tags: uniqueStrings([...(avatar.tags || []), "pinokio-merge-import", "needs-human-review"]),
    hapaMergeProvenance: mergeProvenance(avatar.hapaMergeProvenance, { originalId, reason }),
    updatedAt: newestTime(avatar.updatedAt, null, report.runAt)
  };
}

function mergeProvenance(existing = null, entry = {}) {
  const records = Array.isArray(existing?.records) ? existing.records : [];
  return {
    schemaVersion: "hapa.avatar-builder.merge-provenance.v1",
    records: [
      ...records,
      {
        source: "pinokio-avatar-builder",
        sourceRoot: SOURCE_ROOT,
        sourceAvatarId: entry.originalId || null,
        reason: entry.reason || "merge",
        mergedAt: report.runAt
      }
    ]
  };
}

function mergeTeams(destTeams, sourceTeams, idMap, avatars) {
  const avatarIds = new Set(avatars.map((avatar) => avatar.id));
  const byKey = new Map();
  for (const team of destTeams || []) {
    byKey.set(teamKey(team), clone(team));
  }
  for (const sourceTeam of sourceTeams || []) {
    const key = teamKey(sourceTeam);
    const target = byKey.get(key) || {
      ...clone(sourceTeam),
      members: []
    };
    const members = mergeArray(
      target.members || [],
      (sourceTeam.members || []).map((member) => ({
        ...member,
        avatarId: idMap.get(member.avatarId) || member.avatarId
      })).filter((member) => avatarIds.has(member.avatarId)),
      (member) => member.avatarId
    );
    byKey.set(key, {
      ...mergeObjects(target, sourceTeam, { preserveKeys: new Set(["id", "title"]) }),
      members,
      updatedAt: newestTime(target.updatedAt, sourceTeam.updatedAt, report.runAt)
    });
  }
  return [...byKey.values()];
}

async function mergeSceneStore() {
  const destPath = path.join(DEST_DATA, "scene-store.json");
  const sourcePath = path.join(SOURCE_DATA, "scene-store.json");
  if (!(await exists(sourcePath))) return;
  if (!(await exists(destPath))) {
    await copyFile(sourcePath, destPath);
    report.copiedStores.push("scene-store.json");
    return;
  }
  const dest = await readJson(destPath);
  const source = await readJson(sourcePath);
  const next = mergeObjects(dest, source, { preserveKeys: new Set(["schemaVersion", "createdAt"]) });
  for (const key of ["places", "scenes", "episodes", "volumes", "timelines"]) {
    next[key] = mergeArray(dest[key] || [], source[key] || [], genericRecordKey);
  }
  next.updatedAt = report.runAt;
  report.sceneStore = {
    before: countCollections(dest, ["places", "scenes", "episodes", "volumes", "timelines"]),
    incoming: countCollections(source, ["places", "scenes", "episodes", "volumes", "timelines"]),
    after: countCollections(next, ["places", "scenes", "episodes", "volumes", "timelines"])
  };
  await writeJson(destPath, next);
}

async function mergeKanbanStore() {
  const destPath = path.join(DEST_DATA, "kanban.json");
  const sourcePath = path.join(SOURCE_DATA, "kanban.json");
  if (!(await exists(sourcePath))) return;
  if (!(await exists(destPath))) {
    await copyFile(sourcePath, destPath);
    report.copiedStores.push("kanban.json");
    return;
  }
  const dest = await readJson(destPath);
  const source = await readJson(sourcePath);
  const lanes = mergeArray(dest.lanes || [], source.lanes || [], (lane) => lane.id || slugify(lane.title || lane.name));
  for (const lane of lanes) {
    const sourceLane = (source.lanes || []).find((item) => (item.id || slugify(item.title || item.name)) === (lane.id || slugify(lane.title || lane.name)));
    const destLane = (dest.lanes || []).find((item) => (item.id || slugify(item.title || item.name)) === (lane.id || slugify(lane.title || lane.name)));
    for (const cardKey of ["cards", "tasks", "items"]) {
      if (destLane?.[cardKey] || sourceLane?.[cardKey]) {
        lane[cardKey] = mergeArray(destLane?.[cardKey] || lane[cardKey] || [], sourceLane?.[cardKey] || [], genericRecordKey);
      }
    }
  }
  const next = {
    ...mergeObjects(dest, source, { preserveKeys: new Set(["boardId", "title", "schemaVersion"]) }),
    lanes,
    updatedAt: report.runAt
  };
  report.kanban = {
    before: { lanes: dest.lanes?.length || 0 },
    incoming: { lanes: source.lanes?.length || 0 },
    after: { lanes: next.lanes?.length || 0 }
  };
  await writeJson(destPath, next);
}

async function mergeOrCopyStore(fileName) {
  const destPath = path.join(DEST_DATA, fileName);
  const sourcePath = path.join(SOURCE_DATA, fileName);
  if (!(await exists(sourcePath))) return;
  if (!(await exists(destPath))) {
    await copyFile(sourcePath, destPath);
    report.copiedStores.push(fileName);
    return;
  }
  const dest = await readJson(destPath);
  const source = await readJson(sourcePath);
  const next = mergeObjects(dest, source, { preserveKeys: new Set(["schemaVersion", "createdAt"]) });
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key])) next[key] = mergeArray(dest[key] || [], source[key] || [], genericRecordKey);
  }
  next.updatedAt = report.runAt;
  await writeJson(destPath, next);
  report.copiedStores.push(`${fileName}:merged`);
}

function mergeObjects(base, incoming, options = {}) {
  if (!isObject(base)) return clone(incoming);
  if (!isObject(incoming)) return clone(base);
  const preserveKeys = options.preserveKeys || new Set();
  const next = clone(base);
  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (preserveKeys.has(key)) continue;
    const baseValue = next[key];
    if (isEmpty(baseValue)) {
      next[key] = clone(incomingValue);
    } else if (isEmpty(incomingValue)) {
      continue;
    } else if (Array.isArray(baseValue) && Array.isArray(incomingValue)) {
      next[key] = mergeArray(baseValue, incomingValue, genericRecordKey);
    } else if (isObject(baseValue) && isObject(incomingValue)) {
      next[key] = mergeObjects(baseValue, incomingValue, options);
    } else if (key === "updatedAt" || key === "savedAt") {
      next[key] = newestTime(baseValue, incomingValue, baseValue);
    }
  }
  return next;
}

function mergeArray(baseItems = [], incomingItems = [], keyFn = genericRecordKey) {
  const result = [];
  const byKey = new Map();
  for (const item of Array.isArray(baseItems) ? baseItems : []) {
    const key = keyFn(item) || JSON.stringify(item);
    const cloned = clone(item);
    result.push(cloned);
    byKey.set(key, cloned);
  }
  for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
    const key = keyFn(item) || JSON.stringify(item);
    if (!byKey.has(key)) {
      const cloned = clone(item);
      result.push(cloned);
      byKey.set(key, cloned);
      continue;
    }
    const existing = byKey.get(key);
    if (isObject(existing) && isObject(item)) {
      Object.assign(existing, mergeObjects(existing, item, { preserveKeys: new Set(["id"]) }));
    }
  }
  return result;
}

function findProbableDuplicates(avatars) {
  const byAlias = new Map();
  for (const avatar of avatars) {
    const keys = uniqueStrings([
      primaryName(avatar),
      ...(avatar.aliases || []),
      ...(avatar.names || []).map((name) => name.name || name)
    ]).map(normalName).filter(Boolean);
    for (const key of keys) {
      if (!byAlias.has(key)) byAlias.set(key, []);
      byAlias.get(key).push({ id: avatar.id, name: primaryName(avatar) });
    }
  }
  return [...byAlias.entries()]
    .filter(([, matches]) => new Set(matches.map((match) => match.id)).size > 1)
    .map(([key, matches]) => ({ key, matches: uniqueBy(matches, (match) => match.id) }));
}

function countCollections(store, keys) {
  return Object.fromEntries(keys.map((key) => [key, Array.isArray(store[key]) ? store[key].length : 0]));
}

function uniqueBy(items, keyFn) {
  const byKey = new Map();
  for (const item of items) byKey.set(keyFn(item), item);
  return [...byKey.values()];
}

function primaryName(avatar = {}) {
  return String(avatar.primaryName || avatar.name || avatar.names?.[0]?.name || avatar.names?.[0] || "").trim();
}

function genericRecordKey(item) {
  if (item === null || item === undefined) return "";
  if (typeof item !== "object") return String(item);
  return item.id || item.cardId || item.assetId || item.uri || item.path || item.fileName || item.title || item.name || "";
}

function mediaRecordKey(item) {
  return item?.id || item?.assetId || item?.uri || item?.metadata?.storage?.fileName || item?.name || "";
}

function slotRecordKey(item) {
  return item?.id || item?.slotId || item?.requirementId || item?.label || "";
}

function nameRecordKey(item) {
  return normalName(item?.name || item);
}

function teamKey(team) {
  return team?.id || slugify(team?.title || team?.name || "team");
}

function uniqueId(seed, byId) {
  const base = slugify(seed) || "pinokio-avatar";
  let id = base;
  let suffix = 2;
  while (byId.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function uniqueStrings(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function normalName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function newestTime(a, b, fallback = "") {
  const aTime = Date.parse(a || "");
  const bTime = Date.parse(b || "");
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) return aTime >= bTime ? a : b;
  if (Number.isFinite(aTime)) return a;
  if (Number.isFinite(bTime)) return b;
  return fallback || new Date().toISOString();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isEmpty(value) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
