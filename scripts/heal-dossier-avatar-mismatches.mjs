import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assignAssetToSlot,
  auditAvatar,
  createAvatarScaffold,
  normalizeAvatarCard,
  slugify
} from "../src/domain/avatar.js";
import { createCharacterSheetScaffold } from "../src/domain/characterSheet.js";
import { normalizeSystemMediaLibrary } from "../src/domain/systemMedia.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const REPORT_DIR = path.join(ROOT, "artifacts/enrichment");

const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const MEDIA_LIBRARY_PATH = path.join(DATA_DIR, "media-library.json");
const TAROT_STORE_PATH = path.join(DATA_DIR, "tarot-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");

const DRY_RUN = process.argv.includes("--dry-run");

const RECOVERED_TEAM_ID = "recovered-dossier-avatars";
const RECOVERED_TEAM_TITLE = "Recovered Dossier Avatars";

const NEW_DOSSIER_AVATARS = [
  {
    id: "ayla-ren",
    primaryName: "Ayla Ren",
    aliases: ["Silent Current", "HV-SCOUT-07"],
    phrases: ["ayla ren", "silent current", "hv-scout-07", "hv 3cout-07", "hv scout 07"],
    summary: "Recovered from Ayla Ren dossier, portrait, and look-book media."
  },
  {
    id: "nahla-serein",
    primaryName: "Nahla Serein",
    aliases: ["Threadline", "HV-SCOUT-21", "Trace Dancer", "Veil Scout", "Signal Runner"],
    phrases: ["nahla serein", "threadline", "hv-scout-21", "hv 3cout-21", "trace dancer", "veil scout", "signal runner"],
    summary: "Recovered from Nahla Serein / Threadline dossier and kit media."
  },
  {
    id: "veda-noor",
    primaryName: "Veda Noor",
    aliases: ["Veda", "Jade Current", "HV-27-VN"],
    phrases: ["veda noor", "jade current", "hv-27-vn", "hv 27 vn"],
    summary: "Recovered from Veda Noor dossier, kit, and look-book media."
  },
  {
    id: "saria-veil",
    primaryName: "Saria Veil",
    aliases: ["Saria", "Velvet Relay", "Social Cipher", "HV-27-SV"],
    phrases: ["saria veil", "velvet relay", "social cipher", "hv-27-sv", "hv 27 sv"],
    summary: "Recovered from Saria Veil dossier, kit, portrait, and look-book media."
  },
  {
    id: "maris",
    primaryName: "Maris",
    aliases: ["Tiderunner", "Frontier Envoy", "HV-721-MARIS", "HV-731-MARIS"],
    phrases: ["maris", "tiderunner", "frontier envoy", "hv-721-maris", "hv-731-maris"],
    summary: "Recovered from Maris frontier envoy dossier and look-book media."
  },
  {
    id: "naya",
    primaryName: "Naya",
    aliases: ["Street Oracle", "Social Infiltrator"],
    phrases: ["naya", "street oracle"],
    summary: "Recovered from Naya kit, portrait, and look-book media."
  },
  {
    id: "zhi-zi",
    primaryName: "Zhi-zi",
    aliases: ["Zhi", "Zhi-Zi", "Zhi-ai", "Courier Dancer"],
    phrases: ["zhi-zi", "zhi zi", "zhi-ai", "zhi ai", "courier dancer"],
    summary: "Recovered from Zhi-zi dossier, kit, and reference media."
  },
  {
    id: "lyra-solene",
    primaryName: "Lyra Solene",
    aliases: ["Lyra", "Velvet Signal", "Parlor Operative", "Social Courier"],
    phrases: ["lyra solene", "velvet signal", "parlor operative", "social courier"],
    summary: "Recovered from Lyra Solene look-book and kit media."
  },
  {
    id: "nupoora",
    primaryName: "Nupoora",
    aliases: ["Nupoora", "The Devil"],
    phrases: ["nupoora", "nupora"],
    summary: "Recovered from Nupoora major arcana character sheet media."
  }
];

const EXISTING_AVATAR_RULES = [
  { avatarId: "avatar-7", name: "Bo", phrases: ["bo kit", "name bo", "bo squad", "bo leads"] },
  { avatarId: "avatar-52", name: "Molly", phrases: ["molly // kit sheet", "molly //", "molly kit", "name molly"] },
  { avatarId: "red-reaper", name: "Red", phrases: ["red carraway", "red // look book", "red // the", "name red"] },
  { avatarId: "avatar-49", name: "Lana", phrases: ["lana kit sheet", "id hv-lna-07", "hv-lna-07", "name lana", "lana //"] },
  { avatarId: "avatar-6", name: "Nat", phrases: ["name nat", "nat //", "nat kit"] },
  { avatarId: "avatar-2", name: "Blue", phrases: ["blue // the magician", "blue //", "name blue"] },
  { avatarId: "avatar-3", name: "Green", phrases: ["green pentacles", "name green"] },
  { avatarId: "avatar-19", name: "Magda", phrases: ["magda tank", "magda //", "name magda", "tank / shield vanguard", "shield vanguard"] },
  { avatarId: "avatar-24", name: "Rosie", phrases: ["rosie //", "name rosie", "privateer captain"] },
  { avatarId: "avatar-41", name: "Hana", phrases: ["hana //", "name hana"] },
  { avatarId: "avatar-10", name: "M.O.T.H.E.R.", phrases: ["m.o.t.h.e.r.", "m.o.t.h.e.r", "name m.o.t.h.e.r."] },
  { avatarId: "avatar-26", name: "Aurelia", phrases: ["aurelia kaelen virelli", "codename aurelia", "name aurelia"] },
  { avatarId: "avatar-53", name: "UMI", phrases: ["name ume", "umi //"] }
];

const NOISE_PHRASES = [
  "hapa confidential",
  "loadout",
  "belt kit",
  "spy captain",
  "book",
  "frontier envoy / look book",
  "gear & kit",
  "crew survival",
  "verified authenticity",
  "archive dossier",
  "one face. endless expression",
  "independent asset",
  "affiliation hapa",
  "timeline courier",
  "trace dancer veil scout signal runner"
];

const REQUIREMENT_RANK = [
  "character_dossier",
  "kit_sheet",
  "fullbody_concept_art",
  "kit_poses",
  "closeup_emotions",
  "closeup_backgrounds",
  "backgroundless_two_thirds",
  "fullbody_backgroundless",
  "kit_items"
];

const now = new Date().toISOString();
const avatarStore = await readJson(AVATAR_STORE_PATH);
const mediaLibrary = normalizeSystemMediaLibrary(await readJson(MEDIA_LIBRARY_PATH));
const tarotStore = await readJson(TAROT_STORE_PATH);
const sceneStore = await readJson(SCENE_STORE_PATH);

const report = {
  schemaVersion: "hapa.dossier-avatar-heal-report.v1",
  dryRun: DRY_RUN,
  startedAt: now,
  createdAvatars: [],
  reusedAvatars: [],
  mediaMatches: [],
  avatarAssetMoves: [],
  avatarAssetAdds: [],
  mediaRelationshipUpdates: [],
  tarotLinks: [],
  sceneReferences: [],
  skipped: [],
  before: {},
  after: {}
};

avatarStore.avatars = (avatarStore.avatars || []).map((avatar) => normalizeAvatarCard(avatar));
report.before.avatarCount = avatarStore.avatars.length;
report.before.mediaRelationships = mediaLibrary.records.filter((record) => record.relationships?.length).length;

const avatarById = new Map(avatarStore.avatars.map((avatar) => [avatar.id, avatar]));
const createdByRuleId = new Map();

for (const rule of NEW_DOSSIER_AVATARS) {
  const existing = findAvatarForRule(avatarStore.avatars, rule);
  if (existing?.id === rule.id || (existing && existing.primaryName === rule.primaryName)) {
    createdByRuleId.set(rule.id, existing.id);
    report.reusedAvatars.push({ id: existing.id, primaryName: existing.primaryName, rule: rule.id });
    continue;
  }
  const avatar = createAvatarScaffold({
    id: uniqueAvatarId(rule.id, avatarById),
    primaryName: rule.primaryName,
    names: [rule.primaryName],
    aliases: rule.aliases,
    summary: rule.summary,
    operatorNotes: `Created by dossier-avatar healing pass from OCR-backed character sheet evidence on ${now}.`
  });
  avatar.tags = unique([...(avatar.tags || []), "recovered-dossier-avatar", "ocr-backed", "needs-human-review"]);
  avatar.characterSheet = createCharacterSheetScaffold(avatar, { tarotStore });
  avatar.activity = [{
    id: `activity-${Date.now()}-${report.createdAvatars.length}`,
    type: "avatar-created-from-dossier",
    message: `${rule.primaryName} created from recovered character dossier evidence.`,
    at: now
  }];
  avatarStore.avatars.push(avatar);
  avatarById.set(avatar.id, avatar);
  createdByRuleId.set(rule.id, avatar.id);
  report.createdAvatars.push({ id: avatar.id, primaryName: avatar.primaryName, aliases: avatar.aliases });
}

ensureRecoveredTeam(avatarStore, [...createdByRuleId.values()]);

const allRules = [
  ...NEW_DOSSIER_AVATARS.map((rule) => ({ ...rule, avatarId: createdByRuleId.get(rule.id), kind: "new-dossier-avatar" })),
  ...EXISTING_AVATAR_RULES.map((rule) => ({ ...rule, kind: "existing-avatar" }))
].filter((rule) => rule.avatarId && avatarById.has(rule.avatarId));

const matchableRecords = new Map();
for (const record of mediaLibrary.records) {
  const text = recordSearchText(record);
  const match = chooseRuleForText(text, allRules);
  if (!match) continue;
  if (isNoiseOnlyMatch(text, match.rule)) {
    report.skipped.push({ id: record.id, name: record.name, reason: "noise-only-match", matched: match.rule.primaryName || match.rule.name });
    continue;
  }
  matchableRecords.set(record.id, { record, match });
}

for (const { record, match } of matchableRecords.values()) {
  const avatar = avatarById.get(match.rule.avatarId);
  const relationship = {
    ownerType: "avatar",
    ownerId: avatar.id,
    ownerName: avatar.primaryName,
    role: avatarRelationshipRole(record)
  };
  const previousRelationships = record.relationships || [];
  const nextRelationships = replaceAvatarRelationships(previousRelationships, relationship);
  const changed = JSON.stringify(previousRelationships) !== JSON.stringify(nextRelationships);
  record.relationships = nextRelationships;
  record.reviewStatus = "attached";
  record.tags = unique([...(record.tags || []), "dossier-healed", "avatar-rerouted", `avatar-${slugify(avatar.primaryName)}`]);
  record.notes = appendNote(record.notes, `Dossier-avatar healer routed to ${avatar.primaryName} from OCR phrase "${match.phrase}".`);
  record.updatedAt = now;
  record.match = {
    ...(record.match || {}),
    schemaVersion: "hapa.dossier-avatar-match.v1",
    method: "ocr-character-dossier-name",
    confidence: match.score >= 0.95 ? "high" : "medium",
    score: match.score,
    name: avatar.primaryName,
    relationship,
    reason: `OCR/title text matched "${match.phrase}".`,
    createdAt: now
  };
  if (changed) {
    report.mediaRelationshipUpdates.push({
      recordId: record.id,
      name: record.name,
      from: previousRelationships,
      to: nextRelationships,
      phrase: match.phrase
    });
  }
  report.mediaMatches.push({ recordId: record.id, name: record.name, mediaType: record.mediaType, avatarId: avatar.id, avatarName: avatar.primaryName, phrase: match.phrase, score: match.score });
}

moveMisattachedAvatarAssets();

for (const rule of allRules) {
  const targetAvatar = avatarById.get(rule.avatarId);
  const candidateRecords = [...matchableRecords.values()]
    .filter(({ match }) => match.rule.avatarId === rule.avatarId)
    .map(({ record, match }) => ({ record, match }));
  if (!candidateRecords.length) continue;
  const nextAvatar = attachBestRecordsToAvatar(targetAvatar, candidateRecords, rule);
  avatarById.set(nextAvatar.id, nextAvatar);
}

avatarStore.avatars = avatarStore.avatars.map((avatar) => avatarById.get(avatar.id) || avatar).map((avatar) => {
  const normalized = normalizeAvatarCard(avatar);
  normalized.characterSheet = createCharacterSheetScaffold(normalized, { tarotStore });
  return normalized;
});

for (const card of tarotStore.cards || []) {
  const text = recordSearchText({ name: card.title, tags: card.keywords || [], intelligence: card.enrichment, asset: card.asset, relationships: [] });
  const assetText = [
    text,
    ...(card.assets || []).map((asset) => assetSearchText(asset))
  ].join("\n");
  const match = chooseRuleForText(assetText, allRules);
  if (!match) continue;
  const avatar = avatarById.get(match.rule.avatarId);
  const existing = (card.avatarLinks || []).some((link) => link.avatarId === avatar.id);
  if (!existing) {
    card.avatarLinks = [
      ...(card.avatarLinks || []),
      {
        avatarId: avatar.id,
        role: "dossier-healed-character-link",
        note: `Linked by dossier-avatar healing pass from OCR phrase "${match.phrase}".`,
        tags: ["dossier-healed", "ocr-backed", "needs-human-review"],
        linkedAt: now
      }
    ];
    card.updatedAt = now;
    report.tarotLinks.push({ cardId: card.id, title: card.title, avatarId: avatar.id, avatarName: avatar.primaryName, phrase: match.phrase });
  }
}

for (const scene of sceneStore.scenes || []) {
  for (const asset of scene.assets || []) {
    const match = chooseRuleForText(assetSearchText(asset), allRules);
    if (!match) continue;
    const avatar = avatarById.get(match.rule.avatarId);
    asset.metadata = {
      ...(asset.metadata || {}),
      dossierAvatarHeal: {
        avatarId: avatar.id,
        avatarName: avatar.primaryName,
        phrase: match.phrase,
        healedAt: now
      }
    };
    asset.tags = unique([...(asset.tags || []), "dossier-healed", `avatar-${slugify(avatar.primaryName)}`]);
    scene.avatarIds = unique([...(scene.avatarIds || []), avatar.id]);
    report.sceneReferences.push({ sceneId: scene.id, sceneTitle: scene.title, assetId: asset.id, avatarId: avatar.id, avatarName: avatar.primaryName, phrase: match.phrase });
  }
}

avatarStore.updatedAt = now;
avatarStore.savedAt = now;
mediaLibrary.updatedAt = now;
tarotStore.updatedAt = now;
sceneStore.updatedAt = now;
report.after.avatarCount = avatarStore.avatars.length;
report.after.createdAvatarCount = report.createdAvatars.length;
report.after.mediaRelationshipUpdates = report.mediaRelationshipUpdates.length;
report.after.avatarAssetAdds = report.avatarAssetAdds.length;
report.after.avatarAssetMoves = report.avatarAssetMoves.length;
report.after.tarotLinks = report.tarotLinks.length;
report.after.sceneReferences = report.sceneReferences.length;
report.completedAt = new Date().toISOString();

await mkdir(REPORT_DIR, { recursive: true });
const reportPath = path.join(REPORT_DIR, "dossier-avatar-heal-report.json");
if (!DRY_RUN) {
  await backupStores();
  await writeJson(AVATAR_STORE_PATH, avatarStore);
  await writeJson(MEDIA_LIBRARY_PATH, mediaLibrary);
  await writeJson(TAROT_STORE_PATH, tarotStore);
  await writeJson(SCENE_STORE_PATH, sceneStore);
}
await writeJson(reportPath, report);

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  createdAvatars: report.createdAvatars.length,
  reusedAvatars: report.reusedAvatars.length,
  mediaMatches: report.mediaMatches.length,
  mediaRelationshipUpdates: report.mediaRelationshipUpdates.length,
  avatarAssetAdds: report.avatarAssetAdds.length,
  avatarAssetMoves: report.avatarAssetMoves.length,
  tarotLinks: report.tarotLinks.length,
  sceneReferences: report.sceneReferences.length,
  before: report.before,
  after: report.after,
  reportPath: path.relative(ROOT, reportPath)
}, null, 2));

function attachBestRecordsToAvatar(avatarInput, candidateRecords, rule) {
  let avatar = normalizeAvatarCard(avatarInput);
  const existingAssetIds = new Set(avatar.assets.map((asset) => asset.id));
  const sorted = candidateRecords
    .slice()
    .sort((a, b) => recordQuality(b.record) - recordQuality(a.record));
  const perRequirementLimit = {
    character_dossier: 2,
    kit_sheet: 2,
    fullbody_concept_art: 8,
    kit_poses: 8,
    closeup_emotions: 8,
    closeup_backgrounds: 5,
    backgroundless_two_thirds: 4,
    fullbody_backgroundless: 9,
    kit_items: 12
  };
  const counts = countBy(avatar.assets.map((asset) => asset.requirementId || "unknown"));
  for (const { record, match } of sorted) {
    if (!record.asset || existingAssetIds.has(record.asset.id)) continue;
    const requirementId = requirementForRecord(record);
    if ((counts[requirementId] || 0) >= (perRequirementLimit[requirementId] || 4)) continue;
    const sourceAsset = record.asset;
    const asset = {
      ...sourceAsset,
      requirementId,
      tags: unique([
        ...(sourceAsset.tags || []),
        ...(record.tags || []),
        "dossier-healed",
        `avatar-${slugify(avatar.primaryName)}`,
        match.rule.kind === "new-dossier-avatar" ? "recovered-dossier-avatar" : "mismatch-healed"
      ]),
      notes: appendNote(sourceAsset.notes, `Assigned to ${avatar.primaryName} by dossier-avatar healer from OCR phrase "${match.phrase}".`),
      metadata: {
        ...(sourceAsset.metadata || {}),
        sourcePath: sourceAsset.metadata?.sourcePath || record.sourcePath,
        folderIngest: sourceAsset.metadata?.folderIngest || {
          sourcePath: record.sourcePath,
          sourceRoots: record.sourceRoots || [],
          sourceRelativePaths: record.sourceRelativePaths || {},
          contentFingerprint: record.contentFingerprint,
          indexedAt: record.createdAt || now
        },
        systemMedia: {
          ...(sourceAsset.metadata?.systemMedia || {}),
          recordId: record.id,
          documentKind: record.documentKind,
          sourceKind: record.sourceKind
        },
        dossierAvatarHeal: {
          avatarId: avatar.id,
          avatarName: avatar.primaryName,
          phrase: match.phrase,
          healedAt: now,
          confidence: match.score >= 0.95 ? "high" : "medium"
        }
      },
      processing: {
        ...(sourceAsset.processing || {}),
        status: "attached",
        attachedToCard: true,
        attachedAt: now,
        dossierAvatarHealedAt: now,
        needsHumanReview: true
      },
      createdAt: sourceAsset.createdAt || now
    };
    const beforeAssetCount = avatar.assets.length;
    avatar = assignAssetToSlot(avatar, asset);
    if (avatar.assets.length > beforeAssetCount) {
      existingAssetIds.add(asset.id);
      counts[requirementId] = (counts[requirementId] || 0) + 1;
      report.avatarAssetAdds.push({
        avatarId: avatar.id,
        avatarName: avatar.primaryName,
        assetId: asset.id,
        recordId: record.id,
        name: asset.name,
        requirementId,
        phrase: match.phrase
      });
    }
  }
  avatar.activity = [
    {
      id: `activity-${Date.now()}-${slugify(rule.primaryName || rule.name || avatar.primaryName)}`,
      type: "dossier-media-healed",
      message: `Dossier-avatar healer evaluated ${candidateRecords.length} matching media records for ${avatar.primaryName}.`,
      at: now
    },
    ...(avatar.activity || [])
  ].slice(0, 40);
  avatar.updatedAt = now;
  return normalizeAvatarCard(avatar);
}

function moveMisattachedAvatarAssets() {
  const moves = [];
  for (const sourceAvatar of avatarStore.avatars) {
    for (const asset of sourceAvatar.assets || []) {
      const text = assetSearchText(asset);
      const match = chooseRuleForText(text, allRules);
      if (!match) continue;
      if (isNoiseOnlyMatch(normalizeText(text), match.rule)) continue;
      const targetAvatar = avatarById.get(match.rule.avatarId);
      if (!targetAvatar || targetAvatar.id === sourceAvatar.id) continue;
      moves.push({ sourceAvatarId: sourceAvatar.id, targetAvatarId: targetAvatar.id, asset, match });
    }
  }

  for (const move of moves) {
    const sourceAvatar = avatarById.get(move.sourceAvatarId);
    const targetAvatar = avatarById.get(move.targetAvatarId);
    if (!sourceAvatar || !targetAvatar) continue;
    if (!(sourceAvatar.assets || []).some((asset) => asset.id === move.asset.id)) continue;

    let nextSource = detachAssetReference(sourceAvatar, move.asset.id, move.match);
    const movedAsset = prepareMovedAsset(move.asset, targetAvatar, move.match);
    let nextTarget = targetAvatar;
    if (!(targetAvatar.assets || []).some((asset) => asset.id === movedAsset.id)) {
      nextTarget = assignAssetToSlot(targetAvatar, movedAsset);
    }
    nextSource = normalizeAvatarCard(nextSource);
    nextTarget = normalizeAvatarCard(nextTarget);
    avatarById.set(nextSource.id, nextSource);
    avatarById.set(nextTarget.id, nextTarget);
    report.avatarAssetMoves.push({
      assetId: move.asset.id,
      name: move.asset.name,
      fromAvatarId: sourceAvatar.id,
      fromAvatarName: sourceAvatar.primaryName,
      toAvatarId: targetAvatar.id,
      toAvatarName: targetAvatar.primaryName,
      phrase: move.match.phrase,
      requirementId: movedAsset.requirementId
    });
  }
}

function detachAssetReference(avatarInput, assetId, match) {
  const avatar = normalizeAvatarCard(avatarInput);
  const asset = avatar.assets.find((item) => item.id === assetId);
  avatar.assets = avatar.assets.filter((item) => item.id !== assetId && item.parentAssetId !== assetId && item.state?.startFrameAssetId !== assetId);
  avatar.slots = avatar.slots
    .map((slot) => (slot.assetId === assetId ? { ...slot, assetId: null } : slot))
    .filter((slot) => !(slot.required === false && !slot.assetId));
  avatar.updatedAt = now;
  avatar.activity = [
    {
      id: `activity-${Date.now()}-dossier-detach-${slugify(assetId)}`,
      type: "dossier-mismatch-detached",
      message: `${asset?.name || assetId} moved out after OCR matched ${match.rule.primaryName || match.rule.name}.`,
      at: now
    },
    ...(avatar.activity || [])
  ].slice(0, 40);
  return avatar;
}

function prepareMovedAsset(asset, targetAvatar, match) {
  const recordLike = {
    name: asset.name,
    mediaType: asset.type,
    documentKind: asset.metadata?.intelligence?.classifications?.documentKind,
    tags: asset.tags || [],
    asset
  };
  const requirementId = requirementForRecord(recordLike);
  return {
    ...asset,
    requirementId,
    tags: unique([
      ...(asset.tags || []),
      "dossier-healed",
      "mismatch-healed",
      `avatar-${slugify(targetAvatar.primaryName)}`
    ]),
    notes: appendNote(asset.notes, `Moved to ${targetAvatar.primaryName} by dossier-avatar healer from OCR phrase "${match.phrase}".`),
    metadata: {
      ...(asset.metadata || {}),
      dossierAvatarHeal: {
        ...(asset.metadata?.dossierAvatarHeal || {}),
        avatarId: targetAvatar.id,
        avatarName: targetAvatar.primaryName,
        phrase: match.phrase,
        movedAt: now
      }
    },
    processing: {
      ...(asset.processing || {}),
      status: "attached",
      attachedToCard: true,
      attachedAt: now,
      dossierAvatarHealedAt: now,
      needsHumanReview: true
    }
  };
}

function replaceAvatarRelationships(relationships, relationship) {
  const nonAvatar = relationships.filter((rel) => rel.ownerType !== "avatar");
  return uniqueRelationships([...nonAvatar, relationship]);
}

function relationshipKey(rel) {
  return `${rel.ownerType || "unknown"}:${rel.ownerId || ""}:${rel.role || ""}`;
}

function uniqueRelationships(relationships = []) {
  const byKey = new Map();
  for (const rel of relationships) {
    if (!rel?.ownerType || !rel?.ownerId) continue;
    byKey.set(relationshipKey(rel), {
      ownerType: rel.ownerType,
      ownerId: rel.ownerId,
      ownerName: rel.ownerName || rel.ownerId,
      role: rel.role || "media"
    });
  }
  return [...byKey.values()];
}

function avatarRelationshipRole(record) {
  const requirement = requirementForRecord(record);
  if (record.mediaType === "video") return "avatar-video";
  return requirement;
}

function requirementForRecord(record) {
  const text = normalizeText(recordSearchText(record));
  const kind = record.documentKind || record.asset?.metadata?.intelligence?.classifications?.documentKind || "";
  if (record.mediaType === "video") {
    if (/portrait|face|expression|emotion|calm|smirk|focused|serious/.test(text)) return "closeup_emotions";
    if (/kit|pose|look book|full body|front|side|back/.test(text)) return "kit_poses";
    if (/comic|scene|cinematic|look book|outfit|variation/.test(text)) return "fullbody_concept_art";
    return "fullbody_concept_art";
  }
  if (kind === "character_dossier" || /dossier|signal operative file|operator profile|profile data/.test(text)) return "character_dossier";
  if (kind === "kit_sheet" || /kit sheet|gear|loadout|equipment|tools/.test(text)) return "kit_sheet";
  if (/portrait|face|expression|emotion|calm|smirk|focused|serious/.test(text)) return "closeup_emotions";
  if (/pose|front view|side view|back view/.test(text)) return "kit_poses";
  if (/backgroundless|transparent/.test(text)) return "fullbody_backgroundless";
  if (/two thirds|2\/3/.test(text)) return "backgroundless_two_thirds";
  if (/look book|outfit|concept|cinematic|comic|scene/.test(text)) return "fullbody_concept_art";
  return "fullbody_concept_art";
}

function recordQuality(record) {
  const requirement = requirementForRecord(record);
  const requirementScore = REQUIREMENT_RANK.length - REQUIREMENT_RANK.indexOf(requirement);
  const text = recordSearchText(record);
  const textScore = Math.min(100, Math.floor(text.length / 250));
  const mediaScore = record.mediaType === "image" ? 20 : 10;
  const priorityScore = record.reviewPriority === "high" ? 8 : record.reviewPriority === "normal" ? 4 : 0;
  return requirementScore * 100 + textScore + mediaScore + priorityScore;
}

function chooseRuleForText(textInput, rules) {
  const text = normalizeText(textInput);
  if (!text) return null;
  let best = null;
  for (const rule of rules) {
    for (const phrase of rule.phrases || []) {
      const normalizedPhrase = normalizeText(phrase);
      if (!normalizedPhrase || normalizedPhrase.length < 3) continue;
      if (!containsPhrase(text, normalizedPhrase)) continue;
      const score = phraseScore(normalizedPhrase, text);
      if (!best || score > best.score) best = { rule, phrase, score };
    }
  }
  return best;
}

function phraseScore(phrase, text) {
  let score = 0.7 + Math.min(0.25, phrase.length / 80);
  if (text.includes(`${phrase} //`) || text.includes(`${phrase} kit`) || text.includes(`${phrase} look book`)) score += 0.08;
  if (/^[a-z]+ [a-z]+/.test(phrase)) score += 0.05;
  return Number(Math.min(0.99, score).toFixed(3));
}

function containsPhrase(text, phrase) {
  if (phrase.length <= 4) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}([^a-z0-9]|$)`).test(text);
  }
  return text.includes(phrase);
}

function isNoiseOnlyMatch(text, rule) {
  if (NOISE_PHRASES.some((phrase) => text.includes(normalizeText(phrase))) && !(rule.phrases || []).some((phrase) => {
    const normalized = normalizeText(phrase);
    return normalized.length >= 7 && text.includes(normalized);
  })) {
    return true;
  }
  return false;
}

function findAvatarForRule(avatars, rule) {
  return avatars.find((avatar) => {
    if (avatar.id === rule.id) return true;
    const terms = [avatar.primaryName, ...(avatar.aliases || []), ...(avatar.names || []).map((item) => item.name)].map(normalizeText);
    return terms.includes(normalizeText(rule.primaryName));
  });
}

function uniqueAvatarId(baseId, avatarById) {
  let id = slugify(baseId);
  let index = 2;
  while (avatarById.has(id)) {
    id = `${slugify(baseId)}-${index}`;
    index += 1;
  }
  return id;
}

function ensureRecoveredTeam(store, avatarIds) {
  const teams = Array.isArray(store.teams) ? store.teams : [];
  let team = teams.find((item) => item.id === RECOVERED_TEAM_ID);
  if (!team) {
    team = {
      schemaVersion: "hapa.avatar-teams.v1",
      id: RECOVERED_TEAM_ID,
      title: RECOVERED_TEAM_TITLE,
      description: "Recovered from character dossier OCR and media relationship repair.",
      accent: "fuchsia",
      status: "active",
      members: [],
      createdAt: now,
      updatedAt: now
    };
    teams.push(team);
  }
  const existing = new Set(team.members.map((member) => member.avatarId));
  for (const avatarId of avatarIds) {
    if (existing.has(avatarId)) continue;
    team.members.push({
      avatarId,
      role: "Recovered",
      notes: "Created from character dossier healing pass.",
      joinedAt: now,
      updatedAt: now
    });
  }
  team.updatedAt = now;
  store.teams = teams;
}

function recordSearchText(record) {
  return [
    record.name,
    record.sourcePath,
    record.documentKind,
    ...(record.tags || []),
    ...(record.relationships || []).map((rel) => `${rel.ownerName} ${rel.role}`),
    record.intelligence?.ocr?.text,
    record.intelligence?.vision?.description,
    ...(record.intelligence?.ocr?.lines || []).map((line) => line.text || line),
    assetSearchText(record.asset)
  ].filter(Boolean).join("\n");
}

function assetSearchText(asset = {}) {
  if (!asset) return "";
  const intelligence = asset.metadata?.intelligence || asset.metadata?.tarotEnrichment || null;
  return [
    asset.name,
    asset.notes,
    asset.requirementId,
    ...(asset.tags || []),
    asset.metadata?.originalFileName,
    asset.metadata?.sourcePath,
    intelligence?.ocr?.text,
    intelligence?.vision?.description,
    ...(intelligence?.ocr?.lines || []).map((line) => line.text || line)
  ].filter(Boolean).join("\n");
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendNote(existing = "", note = "") {
  if (!note) return existing || "";
  if (!existing) return note;
  if (existing.includes(note)) return existing;
  return `${existing}\n${note}`;
}

function countBy(items = []) {
  return items.reduce((counts, item) => {
    counts[item] = (counts[item] || 0) + 1;
    return counts;
  }, {});
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function backupStores() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const suffix = timestampForFile();
  await Promise.all([
    copyFile(AVATAR_STORE_PATH, path.join(BACKUP_DIR, `avatar-store.dossier-heal-${suffix}.json`)),
    copyFile(MEDIA_LIBRARY_PATH, path.join(BACKUP_DIR, `media-library.dossier-heal-${suffix}.json`)),
    copyFile(TAROT_STORE_PATH, path.join(BACKUP_DIR, `tarot-store.dossier-heal-${suffix}.json`)),
    copyFile(SCENE_STORE_PATH, path.join(BACKUP_DIR, `scene-store.dossier-heal-${suffix}.json`))
  ]);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
