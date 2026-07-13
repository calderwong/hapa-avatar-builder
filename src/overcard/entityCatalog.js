const ENTITY_SCHEMA = "hapa.entity-ref.v2";

export function buildBuilderEntityCatalog(sources = {}, options = {}) {
  const records = [
    ...(sources.avatars?.avatars || []).map((avatar) => avatarRecord(avatar, sources.avatars)),
    ...(sources.items?.cards || []).map((card) => itemRecord(card, sources.items)),
    ...(sources.tarot?.cards || []).map((card) => tarotRecord("card", card, sources.tarot)),
    ...(sources.tarot?.decks || []).map((deck) => tarotRecord("deck", deck, sources.tarot)),
    ...(sources.tarot?.sets || []).map((set) => tarotRecord("set", set, sources.tarot)),
    ...(sources.world?.scenes || []).map((scene) => sceneRecord(scene, sources.world)),
    ...(sources.songs?.songs || []).map((song) => songRecord(song, sources.songs)),
    ...(sources.songCards?.heads || []).map((head) => songCardHeadRecord(head)),
    ...(sources.songCards?.editions || []).map((edition) => songCardEditionRecord(edition)),
    ...(sources.future || []).map(futureRecord),
  ].filter(Boolean);
  const kinds = new Set((options.kinds || []).filter(Boolean));
  const filtered = kinds.size ? records.filter((record) => kinds.has(record.ref.entityType)) : records;
  filtered.sort((left, right) => `${left.ref.entityType}:${left.ref.presentation?.title || left.ref.entityId}`.localeCompare(`${right.ref.entityType}:${right.ref.presentation?.title || right.ref.entityId}`));
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
  const entities = filtered.slice(offset, offset + limit);
  return {
    schema: "hapa.overcard-builder-catalog.v1",
    nodeId: "hapa-avatar-builder",
    generatedAt: options.generatedAt || new Date().toISOString(),
    total: filtered.length,
    offset,
    limit,
    hasMore: offset + entities.length < filtered.length,
    nextOffset: offset + entities.length < filtered.length ? offset + entities.length : null,
    countsByKind: countBy(records, (record) => record.ref.entityType),
    entities,
  };
}

function avatarRecord(avatar, store) {
  if (!avatar?.id) return null;
  const projected = Boolean(avatar.isExternalProjection || avatar.isHellWeek || avatar.projection?.readOnly);
  const sourceSystem = projected ? "hapa-dev-proto" : "hapa-avatar-builder";
  const detailUri = projected
    ? `/api/hell-week/cards/${encodeURIComponent(avatar.id)}`
    : `/api/avatars/${encodeURIComponent(avatar.id)}`;
  return catalogRecord({
    sourceSystem,
    entityType: projected ? "card" : "avatar",
    entityId: avatar.id,
    revision: revisionOf(avatar, store),
    title: avatar.primaryName || avatar.title || avatar.name || avatar.id,
    subtitle: projected ? "Hell Week · read-only projection" : avatar.role || "Avatar Card",
    thumbnail: avatarThumbnail(avatar),
    rendererId: projected ? "builder-hell-week-card" : "avatar-builder-avatar",
    detailUri,
    attachPackUri: projected ? detailUri : `/api/avatars/${encodeURIComponent(avatar.id)}/attach`,
    sourceOwner: sourceSystem,
    readOnly: projected,
  });
}

function itemRecord(card, store) {
  if (!card?.id) return null;
  const cardType = String(card.cardType || card.kind || "card").toLowerCase();
  const entityType = cardType === "set" ? "set" : cardType.includes("node") ? "node" : cardType.includes("tool") ? "tool" : "card";
  const creator = cardType.startsWith("creator_") || cardType === "set";
  return catalogRecord({
    sourceSystem: "hapa-avatar-builder",
    entityType,
    entityId: card.id,
    revision: revisionOf(card, store),
    title: card.title || card.name || card.id,
    subtitle: creator ? "Creator Set" : card.kind || card.cardType || "Item Card",
    thumbnail: thumbnailOf(card),
    rendererId: creator ? "builder-creator-card" : "builder-item-card",
    detailUri: `/api/items/cards/${encodeURIComponent(card.id)}`,
    attachPackUri: `/api/items/attach?cardId=${encodeURIComponent(card.id)}`,
    sourceOwner: "hapa-avatar-builder",
    readOnly: false,
  });
}

function tarotRecord(entityType, entity, store) {
  if (!entity?.id) return null;
  const segment = entityType === "card" ? "cards" : entityType === "deck" ? "decks" : "sets";
  return catalogRecord({
    sourceSystem: "hapa-avatar-builder",
    entityType,
    entityId: entity.id,
    revision: revisionOf(entity, store),
    title: entity.title || entity.name || entity.id,
    subtitle: `Tarot ${entityType}`,
    thumbnail: thumbnailOf(entity),
    rendererId: `builder-tarot-${entityType}`,
    detailUri: entityType === "card" ? `/api/tarot/card/${encodeURIComponent(entity.id)}` : `/api/tarot/${segment}/${encodeURIComponent(entity.id)}`,
    attachPackUri: `/api/tarot/attach?${entityType}Id=${encodeURIComponent(entity.id)}`,
    sourceOwner: "hapa-avatar-builder",
    readOnly: false,
  });
}

function sceneRecord(scene, store) {
  if (!scene?.id) return null;
  return catalogRecord({
    sourceSystem: "hapa-avatar-builder",
    entityType: "scene",
    entityId: scene.id,
    revision: revisionOf(scene, store),
    title: scene.title || scene.name || scene.id,
    subtitle: "Scene",
    thumbnail: thumbnailOf(scene),
    rendererId: "builder-scene-card",
    detailUri: `/api/world/attach?sceneId=${encodeURIComponent(scene.id)}`,
    attachPackUri: `/api/world/attach?sceneId=${encodeURIComponent(scene.id)}`,
    sourceOwner: "hapa-avatar-builder",
    readOnly: false,
  });
}

function songRecord(song, store) {
  const id = song?.id || song?.songId;
  if (!id) return null;
  return catalogRecord({
    sourceSystem: "hapa-avatar-builder",
    entityType: "song",
    entityId: id,
    revision: revisionOf(song, store),
    title: song.title || song.name || id,
    subtitle: song.author || "Hapa Song",
    thumbnail: thumbnailOf(song),
    rendererId: "builder-song-card",
    detailUri: `/api/hapa-songs/${encodeURIComponent(id)}`,
    attachPackUri: `/api/hapa-songs/${encodeURIComponent(id)}`,
    sourceOwner: "hapa-avatar-builder",
    readOnly: false,
  });
}

function songCardHeadRecord(head) {
  if (!head?.id || !head?.songId) return null;
  return catalogRecord({
    sourceSystem: "hapa-avatar-builder",
    entityType: "song-card",
    entityId: head.id,
    revision: `generation:${Number(head.generation || 0)}`,
    title: head.title || head.songId,
    subtitle: `Song Card · Edition ${Number(head.latestEdition || 0) || "unminted"}`,
    rendererId: "builder-minted-song-card",
    detailUri: `/api/song-cards/${encodeURIComponent(head.songId)}`,
    attachPackUri: `/api/song-cards/${encodeURIComponent(head.songId)}`,
    sourceOwner: "hapa-avatar-builder/song-card-mint-ledger",
    readOnly: true,
  });
}

function songCardEditionRecord(edition) {
  if (!edition?.id || !edition?.songId || !Number(edition.edition)) return null;
  return catalogRecord({
    sourceSystem: "hapa-avatar-builder",
    entityType: "song-card-edition",
    entityId: edition.id,
    revision: edition.semanticFingerprint || edition.manifestHash || `edition:${edition.edition}`,
    title: `${edition.title || edition.songTitle || edition.songId} · Edition ${edition.edition}`,
    subtitle: `Immutable Song Card · ${edition.publishStatus || "private-demo"}`,
    rendererId: "builder-minted-song-card-edition",
    detailUri: `/api/song-cards/${encodeURIComponent(edition.songId)}/editions/${edition.edition}`,
    attachPackUri: `/api/song-cards/${encodeURIComponent(edition.songId)}/editions/${edition.edition}`,
    sourceOwner: "hapa-avatar-builder/song-card-mint-ledger",
    readOnly: true,
  });
}

function futureRecord(record) {
  if (!record?.sourceSystem || !record?.entityType || !record?.entityId || !record?.resolverUri) return null;
  return catalogRecord({
    ...record,
    revision: record.revision || "unversioned",
    title: record.title || record.entityId,
    sourceOwner: record.sourceOwner || record.sourceSystem,
    readOnly: record.readOnly !== false,
  });
}

function catalogRecord(input) {
  return {
    ref: {
      schema: ENTITY_SCHEMA,
      sourceSystem: input.sourceSystem,
      entityType: input.entityType,
      entityId: input.entityId,
      revision: input.revision,
      availability: "available",
      label: input.title,
      resolver: { kind: "api", uri: input.detailUri || input.resolverUri },
      presentation: {
        title: input.title,
        subtitle: input.subtitle || "",
        ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
      },
    },
    rendererId: input.rendererId || "hapa-entity-fallback",
    sourceOwner: input.sourceOwner,
    revision: input.revision,
    detailUri: input.detailUri || input.resolverUri,
    attachPackUri: input.attachPackUri || input.detailUri || input.resolverUri,
    readOnly: Boolean(input.readOnly),
    placementAllowed: true,
    sourceMutationAllowed: !input.readOnly,
  };
}

function revisionOf(record, store) {
  return String(record.revision || record.updatedAt || record.schemaVersion || store?.updatedAt || store?.schemaVersion || "unversioned");
}

function avatarThumbnail(avatar) {
  const assets = avatar.assets || [];
  const asset = assets.find((entry) => entry?.metadata?.thumbnailUri || entry?.metadata?.thumbnail?.uri || entry?.type === "image") || assets[0];
  return asset?.metadata?.thumbnailUri || asset?.metadata?.thumbnail?.uri || asset?.metadata?.posterUri || asset?.uri || "";
}

function thumbnailOf(record) {
  return record.thumbnailUri || record.imageUri || record.coverUri || record.asset?.uri || record.media?.uri || record.mediaAssets?.[0]?.thumbnailUri || record.mediaAssets?.[0]?.uri || record.assets?.[0]?.uri || "";
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
