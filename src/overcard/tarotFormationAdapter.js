import { SCHEMAS, validateFormation } from "@hapa/overcard/core";

export const TAROT_FORMATION_PROJECTION_ID = "hapa-avatar-builder:tarot-3d";
export const TAROT_SCENE_SNAPSHOT_SCHEMA = "hapa.tarot-draw.scene-snapshot.v1";

export function resolveTarotAttachmentContext(attachments, tarotStore = {}) {
  const active = Object.values(attachments || {}).filter((attachment) => attachment?.status === "active" && attachment.host?.nodeId === "hapa-avatar-builder" && attachment.host?.hostId === "tarot");
  const avatar = active.find((attachment) => attachment.entity?.entityType === "avatar" && ["host-avatar", "operator", "manager"].includes(attachment.role || attachment.host?.socketId?.split(":").at(-1))) || active.find((attachment) => attachment.entity?.entityType === "avatar");
  const collections = active.filter((attachment) => ["deck", "set"].includes(attachment.entity?.entityType));
  const directCards = active.filter((attachment) => attachment.entity?.entityType === "card").map((attachment) => attachment.entity.entityId);
  const cardIds = [...directCards];
  for (const attachment of collections) {
    const records = attachment.entity.entityType === "deck" ? tarotStore.decks || [] : tarotStore.sets || [];
    const record = records.find((entry) => entry.id === attachment.entity.entityId);
    cardIds.push(...(record?.cardIds || record?.memberIds || []));
  }
  return {
    schema: "hapa.tarot-attachment-context.v1", hostAvatarId: avatar?.entity?.entityId || null,
    collectionRefs: collections.map((attachment) => ({ id: attachment.entity.entityId, kind: attachment.entity.entityType, revision: attachment.entity.revision || "unversioned" })),
    cardIds: [...new Set(cardIds)], attachmentIds: active.map((attachment) => attachment.id),
    unresolvedCollectionIds: collections.filter((attachment) => !(attachment.entity.entityType === "deck" ? tarotStore.decks || [] : tarotStore.sets || []).some((entry) => entry.id === attachment.entity.entityId)).map((attachment) => attachment.entity.entityId),
  };
}

export function tarotSceneSnapshotToFormation(snapshot, options = {}) {
  if (!snapshot || snapshot.schemaVersion !== TAROT_SCENE_SNAPSHOT_SCHEMA) throw new Error("Unsupported Tarot scene snapshot.");
  const at = snapshot.createdAt || options.at || new Date().toISOString();
  const seen = new Map();
  const memberState = {};
  const members = (snapshot.cards || []).map((item, index) => {
    const originalCardId = String(item.cardId || item.card?.id || `card-${index}`);
    const copyIndex = seen.get(originalCardId) || 0; seen.set(originalCardId, copyIndex + 1);
    const entityId = copyIndex ? `${originalCardId}::copy:${copyIndex}` : originalCardId;
    const memberKey = `hapa-avatar-builder:card:${entityId}`;
    memberState[memberKey] = { originalCardId, card: portable(item.card || null), index: item.index ?? index, stackLayer: item.stackLayer || 0, placedAt: item.placedAt ?? index, focusProgress: item.focusProgress || 0, locked: item.locked === true, pitchOffset: item.rotation?.pitchOffset || 0, angleOffset: item.rotation?.angleOffset || 0 };
    return {
      entity: { schema: SCHEMAS.entityRef, sourceSystem: "hapa-avatar-builder", entityType: "card", entityId, availability: "available", label: item.title || item.card?.title || originalCardId },
      role: zoneRole(item.zone), zone: normalizeZone(item.zone),
      pose: { x: finite(item.position?.x), y: finite(item.position?.y), z: finite(item.position?.z), rotation: [finite(item.rotation?.pitch), finite(item.rotation?.yaw), finite(item.rotation?.roll)], scale: positive(item.scale, 1) },
    };
  });
  const formation = {
    schema: SCHEMAS.formation, id: snapshot.formationId || `tarot:${snapshot.id}`, name: snapshot.title || "Tarot Formation", revision: Math.max(1, Number(snapshot.formationRevision) || 1),
    author: { schema: SCHEMAS.entityRef, sourceSystem: "hapa-avatar-builder", entityType: "avatar", entityId: String(options.avatarId || "local-operator"), availability: "available", label: options.avatarName || snapshot.avatarName || "Local Operator" },
    createdAt: at, updatedAt: at, status: "draft", members, groups: [], bindings: [],
    projections: { [TAROT_FORMATION_PROJECTION_ID]: { renderer: "builder-tarot-3d", preferences: { snapshotVersion: snapshot.schemaVersion, settings: portable(snapshot.settings || {}), camera: portable(snapshot.camera || {}), memberState } }, cssOvercard: { renderer: "overcard-css-overlay", preferences: { semanticSource: TAROT_FORMATION_PROJECTION_ID } } },
  };
  const validation = validateFormation(formation);
  if (!validation.ok) throw new Error(`Tarot Formation is invalid: ${JSON.stringify(validation.issues)}`);
  return validation.value;
}

export function tarotFormationToSceneSnapshot(formation, options = {}) {
  const validation = validateFormation(formation);
  if (!validation.ok) throw new Error(`Invalid canonical Tarot Formation: ${JSON.stringify(validation.issues)}`);
  const value = validation.value;
  const preferences = value.projections?.[TAROT_FORMATION_PROJECTION_ID]?.preferences || {};
  const memberState = preferences.memberState || {};
  const cards = value.members.map((member, index) => {
    const key = `${member.entity.sourceSystem}:${member.entity.entityType}:${member.entity.entityId}`;
    const state = memberState[key] || {};
    const originalCardId = state.originalCardId || member.entity.entityId.replace(/::copy:\d+$/, "");
    const sourceCard = options.cardsById?.[originalCardId] || state.card || { id: originalCardId, title: member.entity.label || originalCardId };
    return { index: state.index ?? index, zone: normalizeZone(member.zone || member.role), cardId: originalCardId, title: member.entity.label || sourceCard.title || originalCardId, card: sourceCard,
      position: { x: member.pose.x, y: member.pose.y, z: member.pose.z || 0 },
      rotation: { pitch: member.pose.rotation?.[0] || 0, yaw: member.pose.rotation?.[1] || 0, roll: member.pose.rotation?.[2] || 0, pitchOffset: state.pitchOffset || 0, angleOffset: state.angleOffset || 0 },
      scale: member.pose.scale || 1, stackLayer: state.stackLayer || 0, placedAt: state.placedAt ?? index, focusProgress: state.focusProgress || 0, locked: normalizeZone(member.zone || member.role) !== "field" };
  });
  return { schemaVersion: TAROT_SCENE_SNAPSHOT_SCHEMA, id: options.snapshotId || value.id.replace(/^tarot:/, ""), formationId: value.id, formationRevision: value.revision, title: value.name, createdAt: value.createdAt, avatarName: value.author.label || value.author.entityId,
    settings: preferences.settings || {}, camera: preferences.camera || {}, counts: sceneCounts(cards), cards, formation: value };
}

export function migrateTarotSceneSnapshot(snapshot, options = {}) {
  if (snapshot?.formation?.schema === SCHEMAS.formation) return { ...tarotFormationToSceneSnapshot(snapshot.formation, options), id: snapshot.id || options.snapshotId || snapshot.formation.id.replace(/^tarot:/, "") };
  const formation = tarotSceneSnapshotToFormation(snapshot, options);
  return { ...snapshot, formationId: formation.id, formationRevision: formation.revision, formation };
}

export function semanticTarotFormation(formation) {
  return { id: formation.id, revision: formation.revision, name: formation.name, status: formation.status, members: formation.members.map((member) => ({ entity: member.entity, role: member.role, zone: member.zone, pose: member.pose })), groups: formation.groups, bindings: formation.bindings };
}

function normalizeZone(value) { const zone = String(value || "field").replace(/^zone:/, ""); return zone === "media-pool" ? "media" : ["drop", "media", "center", "dock", "field"].includes(zone) ? zone : "field"; }
function zoneRole(zone) { return normalizeZone(zone) === "media" ? "media-pool" : normalizeZone(zone); }
function finite(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function positive(value, fallback) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback; }
function portable(value) { return JSON.parse(JSON.stringify(value)); }
function sceneCounts(cards) { return { cards: cards.length, locked: cards.filter((item) => item.locked).length, dropZone: cards.filter((item) => item.zone === "drop").length, mediaPool: cards.filter((item) => item.zone === "media").length, center: cards.filter((item) => item.zone === "center").length, dock: cards.filter((item) => item.zone === "dock").length, field: cards.filter((item) => item.zone === "field").length, skippedTransient: 0 }; }
