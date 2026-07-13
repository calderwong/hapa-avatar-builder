import { slugify } from "./avatar.js";

export const ITEM_MANAGER_STORE_VERSION = "hapa.item-manager-store.v1";
export const ITEM_CARD_VERSION = "hapa.item-card.v1";
export const TAROT_CARD_DETAILS_VERSION = "hapa.tarot-card-details.v1";
export const SHIP_CARD_DETAILS_VERSION = "hapa.ship-card-details.v1";
export const EPISODE_CARD_DETAILS_VERSION = "hapa.episode-card-details.v1";
export const INVENTORY_STORE_VERSION = "hapa.inventory-store.v1";
export const INVENTORY_ATTACH_PACK_VERSION = "hapa.inventory-attach-pack.v1";

export const ITEM_KINDS = ["garden", "ship", "system", "protocol", "skill", "node", "item", "object"];
export const ITEM_CANON_STATUSES = ["hard_canon", "soft_canon", "scaffold", "generated", "disputed"];
export const INVENTORY_ZONES = ["library", "deck", "hand", "training_deck", "equipped", "archive"];

export const EQUIPMENT_HARDPOINTS = [
  {
    id: "node_ship",
    label: "Node / Ship",
    accepts: ["garden", "ship", "system", "node", "object"],
    maxCards: 3,
    description: "Primary operational node, Garden, station, or ship context."
  },
  {
    id: "protocols",
    label: "Protocols",
    accepts: ["protocol", "object", "item"],
    maxCards: 5,
    description: "Protocol cards or objects that govern allowed action."
  },
  {
    id: "skills",
    label: "Skills",
    accepts: ["skill", "object", "item"],
    maxCards: 5,
    description: "Skill cards, node skills, or training objects the avatar can invoke."
  },
  {
    id: "items",
    label: "Items",
    accepts: ["item", "object"],
    maxCards: 9,
    description: "Held kit, tools, weapons, props, tokens, or portable lore objects."
  },
  {
    id: "location",
    label: "Location",
    accepts: ["garden", "ship", "system", "node", "object"],
    maxCards: 2,
    description: "Where the avatar currently is, is stationed, or is narratively anchored."
  },
  {
    id: "equipment",
    label: "Equipment",
    accepts: ["item", "object"],
    maxCards: 6,
    description: "Equipped gear that should enter the avatar context pack."
  }
];

export function createItemManagerScaffold(input = {}) {
  const now = new Date().toISOString();
  return normalizeItemManagerStore({
    schemaVersion: ITEM_MANAGER_STORE_VERSION,
    title: input.title || "Hapa Item Manager",
    cards: input.cards || [],
    auditRuns: input.auditRuns || [],
    agents: input.agents || [createLoreObjectAuditAgent(now)],
    createdAt: now,
    updatedAt: now
  });
}

export function createInventoryStoreScaffold(input = {}) {
  const now = new Date().toISOString();
  return normalizeInventoryStore({
    schemaVersion: INVENTORY_STORE_VERSION,
    avatarInventories: input.avatarInventories || [],
    hardpoints: input.hardpoints || EQUIPMENT_HARDPOINTS,
    createdAt: now,
    updatedAt: now
  }, input.avatars || [], input.itemCards || []);
}

export function createItemCard(input = {}) {
  const now = new Date().toISOString();
  return normalizeItemCard({
    ...input,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  });
}

export function normalizeItemManagerStore(store = {}) {
  const now = new Date().toISOString();
  const cards = uniqueById((Array.isArray(store.cards) ? store.cards : []).map((card) => normalizeItemCard(card)));
  return {
    schemaVersion: store.schemaVersion || store.schema_version || ITEM_MANAGER_STORE_VERSION,
    title: store.title || "Hapa Item Manager",
    cards,
    agents: Array.isArray(store.agents) && store.agents.length ? store.agents.map(normalizeItemAgent) : [createLoreObjectAuditAgent(now)],
    auditRuns: Array.isArray(store.auditRuns || store.audit_runs) ? (store.auditRuns || store.audit_runs) : [],
    audit: auditItemManagerStore({ cards }),
    createdAt: store.createdAt || store.created_at || now,
    updatedAt: store.updatedAt || store.updated_at || now
  };
}

export function normalizeItemCard(card = {}) {
  const now = new Date().toISOString();
  const name = card.name || card.title || "Unnamed Item";
  const kind = ITEM_KINDS.includes(card.kind) ? card.kind : "object";
  const id = card.id || `${kind}-${slugify(name) || Date.now()}`;
  const title = card.title || name;
  const canonStatus = ITEM_CANON_STATUSES.includes(card.canonStatus || card.canon_status)
    ? (card.canonStatus || card.canon_status)
    : "scaffold";

  return {
    id,
    schemaVersion: card.schemaVersion || card.schema_version || ITEM_CARD_VERSION,
    cardType: card.cardType || card.card_type || `${kind}_card`,
    kind,
    title,
    name,
    status: card.status || "active",
    canonStatus,
    summary: card.summary || "",
    description: card.description || "",
    lore: card.lore || "",
    utility: normalizeStringList(card.utility || card.utilityMechanics || card.utility_mechanics),
    broadGameMechanics: normalizeStringList(card.broadGameMechanics || card.broad_game_mechanics),
    tags: unique(card.tags || [kind, "hapa-card"]),
    rank: card.rank || card.quality?.rank || (canonStatus === "hard_canon" ? "canon" : "scaffold"),
    quality: normalizeItemQuality(card.quality || {}, canonStatus),
    locationState: normalizeLocationState(card.locationState || card.location_state || card.location || {}),
    connections: normalizeConnections(card.connections || {}),
    mediaPrompts: normalizeItemMediaPrompts(card.mediaPrompts || card.media_prompts || {}),
    sourceRefs: normalizeSourceRefs(card.sourceRefs || card.source_refs || card.sources),
    mediaAssets: normalizeItemMediaAssets(card.mediaAssets || card.media_assets || card.images || card.sourceRefs || card.source_refs || card.sources),
    songLinks: normalizeTarotLinks(card.songLinks || card.song_links),
    tarotCard: normalizeTarotCardDetails(card.tarotCard || card.tarot_card || {}, card),
    shipCard: normalizeShipCardDetails(card.shipCard || card.ship_card || card.details || {}, kind),
    episodeCard: normalizeEpisodeCardDetails(card.episodeCard || card.episode_card || card.comicCard || card.comic_card || {}, card),
    history: normalizeHistory(card.history || []),
    equipment: normalizeEquipmentProfile(card.equipment || {}, kind),
    containedCards: card.containedCards || [],
    memberOfSets: card.memberOfSets || [],
    skills: card.skills || [],
    telemetry: card.telemetry || {},
    cardRecord: card.cardRecord || {},
    level: card.level || 1,
    experience: card.experience || 0,
    creatorProfile: card.creatorProfile || {},
    sponsorProfile: card.sponsorProfile || {},
    references: card.references || [],
    videoUri: card.videoUri || "",
    videoSources: card.videoSources || [],
    createdAt: card.createdAt || card.created_at || now,
    updatedAt: card.updatedAt || card.updated_at || now
  };
}

export function auditItemManagerStore(store = {}) {
  const cards = Array.isArray(store.cards) ? store.cards.map(normalizeItemCard) : [];
  const byKind = Object.fromEntries(ITEM_KINDS.map((kind) => [kind, cards.filter((card) => card.kind === kind).length]));
  const byCanonStatus = ITEM_CANON_STATUSES.reduce((counts, status) => {
    counts[status] = cards.filter((card) => card.canonStatus === status).length;
    return counts;
  }, {});
  const withPrompts = cards.filter((card) => card.mediaPrompts?.twoD && card.mediaPrompts?.threeD).length;
  const withMedia = cards.filter((card) => card.mediaAssets?.length).length;
  const equippedReady = cards.filter((card) => card.equipment?.hardpointHints?.length).length;
  return {
    schemaVersion: "hapa.item-manager-audit.v1",
    total: cards.length,
    byKind,
    byCanonStatus,
    withPrompts,
    withMedia,
    equippedReady,
    percentPrompted: cards.length ? Math.round((withPrompts / cards.length) * 100) : 100,
    percentWithMedia: cards.length ? Math.round((withMedia / cards.length) * 100) : 100,
    generatedAt: new Date().toISOString()
  };
}

export function normalizeInventoryStore(store = {}, avatars = [], itemCards = []) {
  const now = new Date().toISOString();
  const cardIds = new Set((itemCards || []).map((card) => card.id).filter(Boolean));
  const avatarInventories = Array.isArray(store.avatarInventories || store.avatar_inventories)
    ? (store.avatarInventories || store.avatar_inventories)
    : [];
  const byAvatar = new Map(avatarInventories.map((inventory) => [inventory.avatarId || inventory.avatar_id, inventory]));

  for (const avatar of avatars || []) {
    if (!avatar?.id || byAvatar.has(avatar.id)) continue;
    byAvatar.set(avatar.id, createAvatarInventory({ avatarId: avatar.id, avatarName: avatar.primaryName || avatar.id }, now));
  }

  const normalizedInventories = [...byAvatar.values()]
    .map((inventory) => normalizeAvatarInventory(inventory, cardIds, now))
    .sort((a, b) => a.avatarName.localeCompare(b.avatarName));

  return {
    schemaVersion: store.schemaVersion || store.schema_version || INVENTORY_STORE_VERSION,
    hardpoints: normalizeHardpoints(store.hardpoints || EQUIPMENT_HARDPOINTS),
    avatarInventories: normalizedInventories,
    audit: auditInventoryStore({ avatarInventories: normalizedInventories }),
    createdAt: store.createdAt || store.created_at || now,
    updatedAt: store.updatedAt || store.updated_at || now
  };
}

export function equipItemCard(store = {}, avatarInput = {}, itemCard = {}, hardpointId = "items", zone = "equipped") {
  const now = new Date().toISOString();
  const normalizedCard = normalizeItemCard(itemCard);
  const next = normalizeInventoryStore(store);
  const avatarId = avatarInput.avatarId || avatarInput.id;
  const avatarName = avatarInput.avatarName || avatarInput.primaryName || avatarId || "Unknown Avatar";
  let inventory = next.avatarInventories.find((item) => item.avatarId === avatarId);
  if (!inventory) {
    inventory = createAvatarInventory({ avatarId, avatarName }, now);
    next.avatarInventories.push(inventory);
  }

  inventory.avatarName = avatarName;
  inventory.library = unique([...inventory.library, normalizedCard.id]);
  inventory.cardStates = inventory.cardStates
    .filter((state) => state.cardId !== normalizedCard.id)
    .concat({
      cardId: normalizedCard.id,
      zone: INVENTORY_ZONES.includes(zone) ? zone : "equipped",
      hardpointId: hardpointId || "",
      status: "active",
      reason: "equipped through Item Manager",
      updatedAt: now
    });

  inventory.hardpoints = inventory.hardpoints.map((hardpoint) => {
    const cardIds = hardpoint.cardIds.filter((cardId) => cardId !== normalizedCard.id);
    if (hardpoint.id !== hardpointId || zone !== "equipped") return { ...hardpoint, cardIds };
    return {
      ...hardpoint,
      cardIds: unique([normalizedCard.id, ...cardIds]).slice(0, hardpoint.maxCards || 1)
    };
  });

  if (zone !== "equipped") {
    inventory[zoneKey(zone)] = unique([normalizedCard.id, ...(inventory[zoneKey(zone)] || [])]);
  }

  inventory.updatedAt = now;
  next.updatedAt = now;
  next.audit = auditInventoryStore(next);
  return next;
}

export function createInventoryAttachPack(store = {}, itemStore = {}, avatarId = null) {
  const normalizedItems = normalizeItemManagerStore(itemStore);
  const normalizedInventory = normalizeInventoryStore(store, [], normalizedItems.cards);
  const cardsById = new Map(normalizedItems.cards.map((card) => [card.id, card]));
  const inventories = avatarId
    ? normalizedInventory.avatarInventories.filter((inventory) => inventory.avatarId === avatarId)
    : normalizedInventory.avatarInventories;

  return {
    schemaVersion: INVENTORY_ATTACH_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    hardpoints: normalizedInventory.hardpoints,
    avatars: inventories.map((inventory) => ({
      avatarId: inventory.avatarId,
      avatarName: inventory.avatarName,
      zones: {
        library: inventory.library.map((id) => cardsById.get(id)).filter(Boolean),
        deck: inventory.deck.map((id) => cardsById.get(id)).filter(Boolean),
        hand: inventory.hand.map((id) => cardsById.get(id)).filter(Boolean),
        trainingDeck: inventory.trainingDeck.map((id) => cardsById.get(id)).filter(Boolean)
      },
      hardpoints: inventory.hardpoints.map((hardpoint) => ({
        ...hardpoint,
        cards: hardpoint.cardIds.map((id) => cardsById.get(id)).filter(Boolean)
      })),
      cardStates: inventory.cardStates
    }))
  };
}

export function auditInventoryStore(store = {}) {
  const avatarInventories = Array.isArray(store.avatarInventories) ? store.avatarInventories : [];
  const equippedCards = avatarInventories.flatMap((inventory) =>
    (inventory.hardpoints || []).flatMap((hardpoint) => hardpoint.cardIds || [])
  );
  return {
    schemaVersion: "hapa.inventory-audit.v1",
    avatarCount: avatarInventories.length,
    libraryCards: unique(avatarInventories.flatMap((inventory) => inventory.library || [])).length,
    deckCards: unique(avatarInventories.flatMap((inventory) => inventory.deck || [])).length,
    handCards: unique(avatarInventories.flatMap((inventory) => inventory.hand || [])).length,
    trainingDeckCards: unique(avatarInventories.flatMap((inventory) => inventory.trainingDeck || [])).length,
    equippedCards: unique(equippedCards).length,
    totalEquipments: equippedCards.length,
    generatedAt: new Date().toISOString()
  };
}

function createAvatarInventory(input = {}, now = new Date().toISOString()) {
  return {
    avatarId: input.avatarId || input.id || "",
    avatarName: input.avatarName || input.primaryName || input.name || input.avatarId || "",
    library: [],
    deck: [],
    hand: [],
    trainingDeck: [],
    hardpoints: normalizeHardpoints(EQUIPMENT_HARDPOINTS),
    cardStates: [],
    createdAt: now,
    updatedAt: now
  };
}

function normalizeAvatarInventory(inventory = {}, validCardIds = new Set(), now = new Date().toISOString()) {
  const shouldFilter = validCardIds.size > 0;
  const filterCards = (cards) => unique(normalizeStringList(cards).filter((id) => !shouldFilter || validCardIds.has(id)));
  const hardpoints = normalizeHardpoints(inventory.hardpoints || EQUIPMENT_HARDPOINTS).map((hardpoint) => ({
    ...hardpoint,
    cardIds: filterCards(hardpoint.cardIds)
  }));
  const library = filterCards(inventory.library);
  const deck = filterCards(inventory.deck);
  const hand = filterCards(inventory.hand);
  const trainingDeck = filterCards(inventory.trainingDeck || inventory.training_deck);
  const hardpointCardIds = hardpoints.flatMap((hardpoint) => hardpoint.cardIds || []);
  const cardStates = Array.isArray(inventory.cardStates || inventory.card_states)
    ? (inventory.cardStates || inventory.card_states)
        .map((state) => normalizeCardState(state, validCardIds))
        .filter(Boolean)
    : [];

  return {
    avatarId: inventory.avatarId || inventory.avatar_id || "",
    avatarName: inventory.avatarName || inventory.avatar_name || inventory.avatarId || inventory.avatar_id || "",
    library: unique([...library, ...hardpointCardIds]),
    deck,
    hand,
    trainingDeck,
    hardpoints,
    cardStates,
    createdAt: inventory.createdAt || inventory.created_at || now,
    updatedAt: inventory.updatedAt || inventory.updated_at || now
  };
}

function normalizeCardState(state = {}, validCardIds = new Set()) {
  const cardId = state.cardId || state.card_id || "";
  if (!cardId || (validCardIds.size && !validCardIds.has(cardId))) return null;
  const zone = INVENTORY_ZONES.includes(state.zone) ? state.zone : "library";
  return {
    cardId,
    zone,
    hardpointId: state.hardpointId || state.hardpoint_id || "",
    status: state.status || "active",
    reason: state.reason || "",
    updatedAt: state.updatedAt || state.updated_at || new Date().toISOString()
  };
}

function normalizeHardpoints(hardpoints = EQUIPMENT_HARDPOINTS) {
  const sourceById = new Map((Array.isArray(hardpoints) ? hardpoints : []).map((hardpoint) => [hardpoint.id, hardpoint]));
  return EQUIPMENT_HARDPOINTS.map((standard) => {
    const source = sourceById.get(standard.id) || {};
    return {
      ...standard,
      ...source,
      accepts: normalizeStringList(source.accepts || standard.accepts),
      cardIds: normalizeStringList(source.cardIds || source.card_ids),
      maxCards: Number(source.maxCards || source.max_cards || standard.maxCards || 1)
    };
  });
}

function normalizeLocationState(location = {}) {
  return {
    currentPlaceId: location.currentPlaceId || location.current_place_id || location.placeId || "",
    currentPlaceName: location.currentPlaceName || location.current_place_name || location.placeName || "",
    currentSystemId: location.currentSystemId || location.current_system_id || location.systemId || "",
    currentSystemName: location.currentSystemName || location.current_system_name || location.systemName || "",
    currentShipId: location.currentShipId || location.current_ship_id || location.shipId || "",
    currentShipName: location.currentShipName || location.current_ship_name || location.shipName || "",
    currentGardenId: location.currentGardenId || location.current_garden_id || location.gardenId || "",
    currentGardenName: location.currentGardenName || location.current_garden_name || location.gardenName || "",
    holderAvatarIds: normalizeStringList(location.holderAvatarIds || location.holder_avatar_ids || location.avatarIds),
    locatedAvatarIds: normalizeStringList(location.locatedAvatarIds || location.located_avatar_ids),
    state: location.state || "known",
    notes: location.notes || ""
  };
}

function normalizeConnections(connections = {}) {
  return {
    avatarIds: normalizeStringList(connections.avatarIds || connections.avatar_ids),
    teamIds: normalizeStringList(connections.teamIds || connections.team_ids),
    placeIds: normalizeStringList(connections.placeIds || connections.place_ids),
    sceneIds: normalizeStringList(connections.sceneIds || connections.scene_ids),
    episodeIds: normalizeStringList(connections.episodeIds || connections.episode_ids),
    volumeIds: normalizeStringList(connections.volumeIds || connections.volume_ids),
    itemIds: normalizeStringList(connections.itemIds || connections.item_ids),
    nodeIds: normalizeStringList(connections.nodeIds || connections.node_ids),
    shipIds: normalizeStringList(connections.shipIds || connections.ship_ids),
    creatorCardId: connections.creatorCardId || connections.creator_card_id || "",
    sponsorCardIds: normalizeStringList(connections.sponsorCardIds || connections.sponsor_card_ids)
  };
}

function normalizeItemMediaPrompts(prompts = {}) {
  return {
    heroImage: prompts.heroImage || prompts.hero_image || "",
    twoD: prompts.twoD || prompts["2d"] || prompts.two_d || "",
    threeD: prompts.threeD || prompts["3d"] || prompts.three_d || "",
    comicPanel: prompts.comicPanel || prompts.comic_panel || "",
    explainerVideo: prompts.explainerVideo || prompts.explainer_video || "",
    wikiEntry: prompts.wikiEntry || prompts.wiki_entry || "",
    negativePrompt: prompts.negativePrompt || prompts.negative_prompt || ""
  };
}

function normalizeItemMediaAssets(mediaAssets = []) {
  const list = Array.isArray(mediaAssets) ? mediaAssets : [mediaAssets];
  return uniqueByIdOrUri(list
    .filter(Boolean)
    .map((asset) => {
      const uri = typeof asset === "string" ? asset : (asset.uri || asset.url || asset.path || "");
      const thumbnailUri = typeof asset === "string" ? "" : (asset.thumbnailUri || asset.thumbnail_uri || asset.thumbnail?.uri || "");
      if (!isMediaUri(uri) && !isMediaUri(thumbnailUri)) return null;
      const type = typeof asset === "string" ? inferMediaAssetType(uri) : (asset.type || asset.kind || inferMediaAssetType(uri || thumbnailUri));
      return {
        id: typeof asset === "string" ? `media-${slugify(uri)}` : (asset.id || asset.assetId || asset.asset_id || `media-${slugify(uri || thumbnailUri)}`),
        title: typeof asset === "string" ? "" : (asset.title || asset.name || asset.label || ""),
        type,
        uri,
        thumbnailUri,
        sourceAssetId: typeof asset === "string" ? "" : (asset.sourceAssetId || asset.source_asset_id || asset.assetId || asset.asset_id || ""),
        avatarId: typeof asset === "string" ? "" : (asset.avatarId || asset.avatar_id || ""),
        requirementId: typeof asset === "string" ? "" : (asset.requirementId || asset.requirement_id || ""),
        mimeType: typeof asset === "string" ? "" : (asset.mimeType || asset.mime_type || asset.metadata?.mimeType || ""),
        width: Number(typeof asset === "string" ? 0 : (asset.width || asset.metadata?.width || 0)),
        height: Number(typeof asset === "string" ? 0 : (asset.height || asset.metadata?.height || 0)),
        tags: normalizeStringList(typeof asset === "string" ? [] : asset.tags),
        confidence: typeof asset === "string" ? "soft" : (asset.confidence || "soft"),
        notes: typeof asset === "string" ? "" : (asset.notes || ""),
        metadata: typeof asset === "string" ? {} : (asset.metadata || {}),
        createdAt: typeof asset === "string" ? "" : (asset.createdAt || asset.created_at || ""),
        updatedAt: typeof asset === "string" ? "" : (asset.updatedAt || asset.updated_at || "")
      };
    })
    .filter(Boolean));
}

function normalizeTarotCardDetails(details = {}, card = {}) {
  const source = details && typeof details === "object" ? details : {};
  if (!Object.keys(source).length) return null;
  const ocr = source.ocr || {};
  const catalog = source.catalog || {};
  const attribution = source.attribution || {};
  const mechanics = source.mechanics || {};
  const lore = source.lore || {};
  const identity = source.identity || {};
  const cardFace = source.cardFace || source.card_face || {};
  const typeDetails = source.typeDetails || source.type_details || {};
  const mainType = cleanString(source.mainType || source.main_type || source.type || card.cardType || card.card_type || `${card.kind || "object"}_card`, "hapa_tarot_card");
  const functionalType = tarotFunctionalTypeLabel(mainType);
  return {
    schemaVersion: source.schemaVersion || source.schema_version || TAROT_CARD_DETAILS_VERSION,
    mainType,
    tarotNumber: cleanString(source.tarotNumber || source.tarot_number || source.romanNumeral || source.roman_numeral),
    title: cleanString(source.title || card.title || card.name),
    subtitle: cleanString(source.subtitle),
    archetype: cleanString(source.archetype || source.subtitle),
    keywords: normalizeStringList(source.keywords),
    flavorText: cleanString(source.flavorText || source.flavor_text),
    effectTitle: cleanString(source.effectTitle || source.effect_title),
    effectText: cleanString(source.effectText || source.effect_text),
    catalog: {
      collectionId: cleanString(catalog.collectionId || catalog.collection_id, "mimi-card-shop"),
      collectionTitle: cleanString(catalog.collectionTitle || catalog.collection_title, "Mimi's Card Shop"),
      family: cleanString(catalog.family || source.family, "Dear Papa Tarot"),
      typeLabel: cleanString(catalog.typeLabel || catalog.type_label || source.typeLabel || source.type_label),
      sequence: Number(catalog.sequence || source.sequence || 0),
      sourceFolder: cleanString(catalog.sourceFolder || catalog.source_folder),
      sourceHash: cleanString(catalog.sourceHash || catalog.source_hash),
      pairingKey: cleanString(catalog.pairingKey || catalog.pairing_key),
      confidence: cleanString(catalog.confidence || source.confidence, "generated")
    },
    identity: {
      systemName: cleanString(identity.systemName || identity.system_name || source.systemName || source.system_name, "Hapa Tarot System"),
      deckName: cleanString(identity.deckName || identity.deck_name || catalog.collectionTitle || catalog.collection_title, "Mimi's Card Shop"),
      arcana: cleanString(identity.arcana || identity.family || source.arcana),
      suit: cleanString(identity.suit || source.suit),
      suitElement: cleanString(identity.suitElement || identity.suit_element || source.suitElement || source.suit_element),
      rank: cleanString(identity.rank || source.rank),
      tarotType: cleanString(identity.tarotType || identity.tarot_type || source.tarotType || source.tarot_type || source.title || card.title || card.name),
      romanNumeral: cleanString(identity.romanNumeral || identity.roman_numeral || source.romanNumeral || source.roman_numeral || source.tarotNumber || source.tarot_number),
      number: Number(identity.number || source.number || 0),
      tarotCardName: cleanString(identity.tarotCardName || identity.tarot_card_name || source.tarotCardName || source.tarot_card_name || source.title || card.title || card.name),
      printedTitle: cleanString(identity.printedTitle || identity.printed_title || source.printedTitle || source.printed_title || source.title || card.title || card.name),
      displayTitle: cleanString(identity.displayTitle || identity.display_title || source.displayTitle || source.display_title || source.title || card.title || card.name),
      titlePrefix: cleanString(identity.titlePrefix || identity.title_prefix || source.titlePrefix || source.title_prefix),
      variantTitle: cleanString(identity.variantTitle || identity.variant_title || source.variantTitle || source.variant_title),
      functionalType: cleanString(identity.functionalType || identity.functional_type || identity.hapaCardType || identity.hapa_card_type || source.functionalType || source.functional_type || functionalType),
      functionalTypeSlug: cleanString(identity.functionalTypeSlug || identity.functional_type_slug || identity.hapaCardTypeSlug || identity.hapa_card_type_slug || source.functionalTypeSlug || source.functional_type_slug || source.mainType || source.main_type),
      cardTypeName: cleanString(identity.cardTypeName || identity.card_type_name || catalog.typeLabel || catalog.type_label || functionalType),
      cardTypeDetail: cleanString(identity.cardTypeDetail || identity.card_type_detail || source.cardTypeDetail || source.card_type_detail),
      typeStack: normalizeStringList(identity.typeStack || identity.type_stack || source.typeStack || source.type_stack),
      locationType: cleanString(identity.locationType || identity.location_type || source.locationType || source.location_type),
      locationId: cleanString(identity.locationId || identity.location_id || source.locationId || source.location_id),
      confidence: cleanString(identity.confidence || source.identityConfidence || source.identity_confidence, "generated")
    },
    cardFace: {
      titleLine: cleanString(cardFace.titleLine || cardFace.title_line),
      subtitleLine: cleanString(cardFace.subtitleLine || cardFace.subtitle_line),
      typeLine: cleanString(cardFace.typeLine || cardFace.type_line),
      keywordLine: cleanString(cardFace.keywordLine || cardFace.keyword_line),
      coreMeaning: cleanString(cardFace.coreMeaning || cardFace.core_meaning),
      uprightText: cleanString(cardFace.uprightText || cardFace.upright_text),
      invertedText: cleanString(cardFace.invertedText || cardFace.inverted_text),
      mechanicsText: cleanString(cardFace.mechanicsText || cardFace.mechanics_text),
      visualLanguageText: cleanString(cardFace.visualLanguageText || cardFace.visual_language_text),
      locationText: cleanString(cardFace.locationText || cardFace.location_text),
      functionIcons: normalizeStringList(cardFace.functionIcons || cardFace.function_icons),
      sections: normalizeTarotSections(cardFace.sections)
    },
    attribution: {
      author: cleanString(attribution.author, "Calder"),
      shop: cleanString(attribution.shop, "Mimi's Card Shop"),
      albumTitle: cleanString(attribution.albumTitle || attribution.album_title, "Dear Papa"),
      rightsStatus: cleanString(attribution.rightsStatus || attribution.rights_status, "operator_authored_hapa_creative_commons"),
      sourceTool: cleanString(attribution.sourceTool || attribution.source_tool),
      sourcePaths: normalizeStringList(attribution.sourcePaths || attribution.source_paths),
      notes: cleanString(attribution.notes)
    },
    mechanics: {
      broadGameMechanic: cleanString(mechanics.broadGameMechanic || mechanics.broad_game_mechanic || source.broadGameMechanic || source.broad_game_mechanic),
      deckUse: cleanString(mechanics.deckUse || mechanics.deck_use),
      surfaceUse: cleanString(mechanics.surfaceUse || mechanics.surface_use),
      relationshipUse: cleanString(mechanics.relationshipUse || mechanics.relationship_use),
      skillUse: cleanString(mechanics.skillUse || mechanics.skill_use),
      effects: normalizeStringList(mechanics.effects),
      limits: normalizeStringList(mechanics.limits),
      procedures: normalizeStringList(mechanics.procedures),
      actions: normalizeStringList(mechanics.actions),
      resources: normalizeStringList(mechanics.resources),
      costs: normalizeStringList(mechanics.costs),
      functionIcons: normalizeStringList(mechanics.functionIcons || mechanics.function_icons),
      statBlocks: normalizeTarotSections(mechanics.statBlocks || mechanics.stat_blocks)
    },
    lore: {
      summary: cleanString(lore.summary || source.summary),
      canonStatus: cleanString(lore.canonStatus || lore.canon_status || source.canonStatus || source.canon_status, "generated"),
      characterHooks: normalizeStringList(lore.characterHooks || lore.character_hooks),
      relationshipHooks: normalizeStringList(lore.relationshipHooks || lore.relationship_hooks),
      protocolTeaching: cleanString(lore.protocolTeaching || lore.protocol_teaching),
      futureSeed: cleanString(lore.futureSeed || lore.future_seed),
      visualLanguage: normalizeStringList(lore.visualLanguage || lore.visual_language),
      locationType: cleanString(lore.locationType || lore.location_type),
      locationId: cleanString(lore.locationId || lore.location_id),
      sourceClaims: normalizeStringList(lore.sourceClaims || lore.source_claims)
    },
    typeDetails: {
      label: cleanString(typeDetails.label || typeDetails.typeLabel || typeDetails.type_label || `${functionalType} Card`),
      tarotType: cleanString(typeDetails.tarotType || typeDetails.tarot_type),
      functionalType: cleanString(typeDetails.functionalType || typeDetails.functional_type || typeDetails.hapaCardType || typeDetails.hapa_card_type || functionalType),
      functionalTypeSlug: cleanString(typeDetails.functionalTypeSlug || typeDetails.functional_type_slug || typeDetails.hapaCardTypeSlug || typeDetails.hapa_card_type_slug),
      role: cleanString(typeDetails.role),
      focus: cleanString(typeDetails.focus),
      command: cleanString(typeDetails.command),
      procedureFlow: normalizeStringList(typeDetails.procedureFlow || typeDetails.procedure_flow),
      actions: normalizeStringList(typeDetails.actions),
      resources: normalizeStringList(typeDetails.resources),
      costs: normalizeStringList(typeDetails.costs),
      stats: normalizeTarotSections(typeDetails.stats),
      sections: normalizeTarotSections(typeDetails.sections)
    },
    songLinks: normalizeTarotLinks(source.songLinks || source.song_links),
    sceneLinks: normalizeTarotLinks(source.sceneLinks || source.scene_links),
    avatarLoreLinks: normalizeTarotLinks(source.avatarLoreLinks || source.avatar_lore_links),
    mediaLinks: normalizeTarotMediaLinks(source.mediaLinks || source.media_links),
    ocr: {
      engine: cleanString(ocr.engine, "apple-vision"),
      confidence: Number(ocr.confidence || 0),
      rawText: cleanString(ocr.rawText || ocr.raw_text),
      lines: Array.isArray(ocr.lines) ? ocr.lines.map(normalizeOcrLine) : [],
      parsedAt: ocr.parsedAt || ocr.parsed_at || "",
      refreshedAt: ocr.refreshedAt || ocr.refreshed_at || "",
      sourceImagePaths: normalizeStringList(ocr.sourceImagePaths || ocr.source_image_paths),
      sourceVideoPaths: normalizeStringList(ocr.sourceVideoPaths || ocr.source_video_paths),
      sourceFramePaths: normalizeStringList(ocr.sourceFramePaths || ocr.source_frame_paths),
      sourceMediaUris: normalizeStringList(ocr.sourceMediaUris || ocr.source_media_uris),
      sources: normalizeTarotOcrSources(ocr.sources)
    }
  };
}

function normalizeTarotSections(sections = []) {
  const list = Array.isArray(sections) ? sections : [sections];
  return list
    .filter(Boolean)
    .map((section) => typeof section === "string" ? {
      label: "Section",
      value: cleanString(section),
      items: []
    } : {
      label: cleanString(section.label || section.title || section.key || "Section"),
      value: cleanString(section.value || section.text || section.summary),
      items: normalizeStringList(section.items || section.values),
      confidence: cleanString(section.confidence, "generated")
    })
    .filter((section) => section.value || section.items.length);
}

function normalizeTarotOcrSources(sources = []) {
  const list = Array.isArray(sources) ? sources : [sources];
  return list
    .filter(Boolean)
    .map((source) => typeof source === "string" ? {
      id: cleanString(source),
      kind: "",
      path: cleanString(source),
      mediaUri: "",
      confidence: 0,
      lineCount: 0,
      text: ""
    } : {
      id: cleanString(source.id || source.path || source.mediaUri || source.media_uri),
      kind: cleanString(source.kind || source.type),
      path: cleanString(source.path),
      mediaUri: cleanString(source.mediaUri || source.media_uri || source.uri),
      confidence: Number(source.confidence || 0),
      lineCount: Number(source.lineCount || source.line_count || 0),
      text: cleanString(source.text)
    });
}

function normalizeTarotLinks(links = []) {
  const list = Array.isArray(links) ? links : [links];
  return list
    .filter(Boolean)
    .map((link) => typeof link === "string" ? {
      id: cleanString(link),
      avatarId: "",
      avatarName: "",
      songId: "",
      songCardId: "",
      songTitle: "",
      sceneId: "",
      sceneTitle: "",
      cardId: "",
      choiceId: "",
      sourceChoiceId: "",
      tarotType: "",
      functionalType: "",
      why: "",
      whyChosen: "",
      canonReason: "",
      objectiveFit: "",
      deckInfluence: "",
      futureInfluence: "",
      vibe: "",
      notes: "",
      sourcePath: "",
      confidence: "generated",
      createdAt: "",
      updatedAt: ""
    } : {
      id: cleanString(link.id || link.choiceId || link.choice_id || link.sourceChoiceId || link.source_choice_id || link.songId || link.song_id || link.sceneId || link.scene_id || link.avatarId || link.avatar_id),
      avatarId: cleanString(link.avatarId || link.avatar_id),
      avatarName: cleanString(link.avatarName || link.avatar_name),
      songId: cleanString(link.songId || link.song_id),
      songCardId: cleanString(link.songCardId || link.song_card_id),
      songTitle: cleanString(link.songTitle || link.song_title || link.title),
      sceneId: cleanString(link.sceneId || link.scene_id),
      sceneTitle: cleanString(link.sceneTitle || link.scene_title),
      cardId: cleanString(link.cardId || link.card_id),
      choiceId: cleanString(link.choiceId || link.choice_id),
      sourceChoiceId: cleanString(link.sourceChoiceId || link.source_choice_id),
      tarotType: cleanString(link.tarotType || link.tarot_type),
      functionalType: cleanString(link.functionalType || link.functional_type),
      why: cleanString(link.why || link.reason),
      whyChosen: cleanString(link.whyChosen || link.why_chosen),
      canonReason: cleanString(link.canonReason || link.canon_reason),
      objectiveFit: cleanString(link.objectiveFit || link.objective_fit),
      deckInfluence: cleanString(link.deckInfluence || link.deck_influence),
      futureInfluence: cleanString(link.futureInfluence || link.future_influence),
      vibe: cleanString(link.vibe || link.mood),
      notes: cleanString(link.notes),
      sourcePath: cleanString(link.sourcePath || link.source_path),
      confidence: cleanString(link.confidence, "generated"),
      createdAt: link.createdAt || link.created_at || "",
      updatedAt: link.updatedAt || link.updated_at || ""
    })
    .filter((link) => link.id || link.avatarId || link.songId || link.sceneId || link.choiceId || link.sourceChoiceId);
}

function normalizeTarotMediaLinks(links = []) {
  const list = Array.isArray(links) ? links : [links];
  return list
    .filter(Boolean)
    .map((link) => ({
      id: cleanString(link.id),
      imageAssetId: cleanString(link.imageAssetId || link.image_asset_id),
      videoAssetId: cleanString(link.videoAssetId || link.video_asset_id),
      imageUri: cleanString(link.imageUri || link.image_uri),
      videoUri: cleanString(link.videoUri || link.video_uri),
      posterUri: cleanString(link.posterUri || link.poster_uri),
      confidence: cleanString(link.confidence, "generated"),
      reason: cleanString(link.reason)
    }));
}

function normalizeEpisodeCardDetails(details = {}, card = {}) {
  const source = details && typeof details === "object" ? details : {};
  if (!Object.keys(source).length) return null;
  const comic = source.comic || {};
  const ocr = source.ocr || {};
  const catalog = source.catalog || {};
  const sourceInfo = source.source || {};
  return {
    schemaVersion: source.schemaVersion || source.schema_version || EPISODE_CARD_DETAILS_VERSION,
    episodeId: cleanString(source.episodeId || source.episode_id || card.connections?.episodeIds?.[0] || card.connections?.episode_ids?.[0] || card.id),
    episodeTitle: cleanString(source.episodeTitle || source.episode_title || source.title || card.title || card.name),
    seriesTitle: cleanString(source.seriesTitle || source.series_title || catalog.seriesTitle || catalog.series_title, "Episodes"),
    chapter: cleanString(source.chapter || catalog.chapter),
    sequence: Number(source.sequence || catalog.sequence || 0),
    medium: cleanString(source.medium || source.mediaType || source.media_type, "mixed-media"),
    designFamily: cleanString(source.designFamily || source.design_family || catalog.designFamily || catalog.design_family),
    classification: cleanString(source.classification || source.type || source.kind || "episode"),
    title: cleanString(source.title || card.title || card.name),
    subtitle: cleanString(source.subtitle),
    summary: cleanString(source.summary || card.summary || card.description),
    beats: normalizeStringList(source.beats || source.storyBeats || source.story_beats),
    characters: normalizeStringList(source.characters || source.characterNames || source.character_names),
    locations: normalizeStringList(source.locations || source.locationNames || source.location_names),
    themes: normalizeStringList(source.themes || source.themeTags || source.theme_tags),
    mechanics: normalizeStringList(source.mechanics || source.protocolMechanics || source.protocol_mechanics),
    comic: {
      pageTitle: cleanString(comic.pageTitle || comic.page_title || source.pageTitle || source.page_title),
      pageNumber: Number(comic.pageNumber || comic.page_number || source.pageNumber || source.page_number || 0),
      panelCount: Number(comic.panelCount || comic.panel_count || source.panelCount || source.panel_count || 0),
      panelNotes: normalizeStringList(comic.panelNotes || comic.panel_notes),
      dialogueLines: normalizeStringList(comic.dialogueLines || comic.dialogue_lines || source.dialogueLines || source.dialogue_lines),
      narrationLines: normalizeStringList(comic.narrationLines || comic.narration_lines || source.narrationLines || source.narration_lines),
      visualLanguage: normalizeStringList(comic.visualLanguage || comic.visual_language || source.visualLanguage || source.visual_language)
    },
    tarotLinks: normalizeTarotLinks(source.tarotLinks || source.tarot_links),
    songLinks: normalizeTarotLinks(source.songLinks || source.song_links),
    avatarLinks: normalizeTarotLinks(source.avatarLinks || source.avatar_links || source.avatarLoreLinks || source.avatar_lore_links),
    mediaLinks: normalizeTarotMediaLinks(source.mediaLinks || source.media_links),
    ocr: {
      engine: cleanString(ocr.engine, "apple-vision"),
      confidence: Number(ocr.confidence || 0),
      rawText: cleanString(ocr.rawText || ocr.raw_text),
      lines: Array.isArray(ocr.lines) ? ocr.lines.map(normalizeOcrLine) : [],
      parsedAt: ocr.parsedAt || ocr.parsed_at || "",
      refreshedAt: ocr.refreshedAt || ocr.refreshed_at || "",
      sourceImagePaths: normalizeStringList(ocr.sourceImagePaths || ocr.source_image_paths),
      sourceVideoPaths: normalizeStringList(ocr.sourceVideoPaths || ocr.source_video_paths),
      sourceFramePaths: normalizeStringList(ocr.sourceFramePaths || ocr.source_frame_paths),
      sourceMediaUris: normalizeStringList(ocr.sourceMediaUris || ocr.source_media_uris),
      sources: normalizeTarotOcrSources(ocr.sources)
    },
    source: {
      sourceFolder: cleanString(sourceInfo.sourceFolder || sourceInfo.source_folder || catalog.sourceFolder || catalog.source_folder),
      sourcePaths: normalizeStringList(sourceInfo.sourcePaths || sourceInfo.source_paths),
      sourceHash: cleanString(sourceInfo.sourceHash || sourceInfo.source_hash || catalog.sourceHash || catalog.source_hash),
      confidence: cleanString(sourceInfo.confidence || source.confidence, "generated")
    }
  };
}

function normalizeItemQuality(quality = {}, canonStatus = "scaffold") {
  const level = Number(quality.level || quality.videoCount || quality.video_count || 0);
  const durability = Number(quality.durability || quality.connectedMediaCount || quality.connected_media_count || 0);
  const medianDurability = Number(quality.medianDurability || quality.median_durability || 0);
  const score = Number(quality.score || quality.qualityScore || quality.quality_score || 0);
  const qualityRank = quality.qualityRank || quality.quality_rank || quality.tier || quality.rank || "";
  return {
    rank: quality.rank || (canonStatus === "hard_canon" ? "canon" : "scaffold"),
    confidence: quality.confidence || (canonStatus === "hard_canon" ? "hard" : canonStatus === "soft_canon" ? "soft" : "generated"),
    power: Number(quality.power || 1),
    complexity: Number(quality.complexity || 1),
    reuse: Number(quality.reuse || 1),
    risk: Number(quality.risk || 1),
    completeness: Number(quality.completeness || 0),
    level,
    videoCount: level,
    durability,
    connectedMediaCount: durability,
    medianDurability,
    score,
    qualityScore: score,
    qualityRank,
    qualityTier: cleanString(quality.qualityTier || quality.quality_tier || qualityRank).toLowerCase().replace(/\s+/g, "-"),
    previousRank: quality.previousRank || quality.previous_rank || "",
    distributionPercentile: Number(quality.distributionPercentile || quality.distribution_percentile || 0),
    affixes: quality.affixes || [],
    tier: quality.tier || qualityRank || "",
    updatedAt: quality.updatedAt || quality.updated_at || ""
  };
}

function normalizeShipCardDetails(details = {}, kind = "object") {
  const source = details && typeof details === "object" ? details : {};
  if (kind !== "ship" && !Object.keys(source).length) {
    return null;
  }
  const stats = source.stats || {};
  const ocr = source.ocr || {};
  return {
    schemaVersion: source.schemaVersion || source.schema_version || SHIP_CARD_DETAILS_VERSION,
    tarotNumber: source.tarotNumber || source.tarot_number || source.romanNumeral || source.roman_numeral || "",
    title: source.title || "",
    subtitle: source.subtitle || "",
    archetype: source.archetype || "",
    keywords: normalizeStringList(source.keywords),
    flavorText: source.flavorText || source.flavor_text || "",
    effectTitle: source.effectTitle || source.effect_title || "",
    effectText: source.effectText || source.effect_text || "",
    stats: {
      speed: Number(stats.speed || 0),
      morale: Number(stats.morale || 0),
      supply: Number(stats.supply || 0),
      influence: Number(stats.influence || 0)
    },
    ocr: {
      engine: ocr.engine || "",
      confidence: Number(ocr.confidence || 0),
      rawText: ocr.rawText || ocr.raw_text || "",
      lines: Array.isArray(ocr.lines) ? ocr.lines.map(normalizeOcrLine) : [],
      parsedAt: ocr.parsedAt || ocr.parsed_at || "",
      sourceVideoPath: ocr.sourceVideoPath || ocr.source_video_path || "",
      sourceFramePath: ocr.sourceFramePath || ocr.source_frame_path || ""
    }
  };
}

function normalizeOcrLine(line = {}) {
  if (typeof line === "string") {
    return {
      text: line,
      confidence: 0,
      box: null
    };
  }
  return {
    text: line.text || "",
    confidence: Number(line.confidence || 0),
    box: line.box || null
  };
}

function normalizeEquipmentProfile(equipment = {}, kind = "object") {
  return {
    hardpointHints: normalizeStringList(equipment.hardpointHints || equipment.hardpoint_hints || defaultHardpointHints(kind)),
    equipRules: normalizeStringList(equipment.equipRules || equipment.equip_rules),
    effects: normalizeStringList(equipment.effects),
    limits: normalizeStringList(equipment.limits)
  };
}

function normalizeSourceRefs(sourceRefs = []) {
  const list = Array.isArray(sourceRefs) ? sourceRefs : [sourceRefs];
  return list
    .filter(Boolean)
    .map((source) => typeof source === "string" ? { label: source, uri: "", confidence: "soft" } : {
      label: source.label || source.title || source.id || "source",
      uri: source.uri || source.path || "",
      confidence: source.confidence || "soft",
      notes: source.notes || ""
    });
}

function normalizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter(Boolean)
    .map((event) => typeof event === "string" ? {
      label: event,
      eventId: "",
      happenedAt: "",
      notes: ""
    } : {
      eventId: event.eventId || event.event_id || "",
      label: event.label || event.title || "history event",
      happenedAt: event.happenedAt || event.happened_at || event.timestamp || "",
      notes: event.notes || event.summary || ""
    });
}

function normalizeItemAgent(agent = {}) {
  return {
    id: agent.id || "agent-lore-object-auditor",
    title: agent.title || agent.name || "Lore Object Audit Agent",
    role: agent.role || "Audit avatar backstories, scenes, and kit assets into Item Manager cards.",
    cadence: agent.cadence || "rerun after Genesis, episode, volume, or kit changes",
    inputs: normalizeStringList(agent.inputs || ["avatar-store", "scene-store", "black-horizon-foundation", "kit-items"]),
    outputs: normalizeStringList(agent.outputs || ["item cards", "inventory states", "image prompts", "source refs"]),
    instructions: normalizeStringList(agent.instructions || [
      "Extract named Gardens, Ships, Systems, Items, and Objects.",
      "Classify confidence and canon status.",
      "Attach avatar, place, scene, and source backrefs.",
      "Generate 2D and 3D image prompts for every card."
    ]),
    status: agent.status || "active",
    updatedAt: agent.updatedAt || agent.updated_at || new Date().toISOString()
  };
}

function createLoreObjectAuditAgent(now = new Date().toISOString()) {
  return normalizeItemAgent({
    id: "agent-lore-object-auditor",
    title: "Lore Object Audit Agent",
    updatedAt: now
  });
}

function defaultHardpointHints(kind) {
  if (kind === "garden" || kind === "ship" || kind === "system" || kind === "node") return ["node_ship", "location"];
  if (kind === "protocol") return ["protocols"];
  if (kind === "skill") return ["skills"];
  if (kind === "item") return ["items", "equipment"];
  return ["items"];
}

function zoneKey(zone) {
  if (zone === "training_deck") return "trainingDeck";
  if (INVENTORY_ZONES.includes(zone)) return zone;
  return "library";
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return unique(value.map((item) => String(item || "").trim()).filter(Boolean));
  if (value === undefined || value === null || value === "") return [];
  return unique(String(value).split(",").map((item) => item.trim()).filter(Boolean));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function uniqueById(values = []) {
  const byId = new Map();
  for (const value of values) {
    if (!value?.id) continue;
    byId.set(value.id, value);
  }
  return [...byId.values()];
}

function uniqueByIdOrUri(values = []) {
  const byKey = new Map();
  for (const value of values) {
    const key = value?.uri || value?.thumbnailUri || value?.id;
    if (!key) continue;
    byKey.set(key, value);
  }
  return [...byKey.values()];
}

function isMediaUri(uri = "") {
  return typeof uri === "string" && (
    uri.startsWith("/media/") ||
    uri.startsWith("data:image/") ||
    uri.startsWith("data:video/") ||
    /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov)$/i.test(uri.split("?")[0] || "")
  );
}

function inferMediaAssetType(uri = "") {
  if (/\.(mp4|webm|mov)$/i.test(String(uri).split("?")[0] || "") || String(uri).startsWith("data:video/")) return "video";
  return "image";
}

function cleanString(value, fallback = "") {
  const text = value === undefined || value === null ? "" : String(value);
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed || fallback;
}

function tarotFunctionalTypeLabel(mainType = "") {
  const labels = {
    avatar_tarot_card: "Avatar",
    hapa_tarot_card: "Hapa Tarot",
    location_tarot_card: "Location",
    lore_tarot_card: "Lore",
    node_card: "Node",
    protocol_card: "Protocol",
    relationship_tarot_card: "Relationship",
    ship_card: "Ship",
    skill_card: "Skill",
    song_tarot_card: "Song"
  };
  if (labels[mainType]) return labels[mainType];
  return cleanString(String(mainType || "Card").replace(/_tarot_card$|_card$/g, "").replace(/_/g, " "))
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
