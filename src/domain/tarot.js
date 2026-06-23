import { createMediaAsset, slugify } from "./avatar.js";

export const TAROT_STORE_VERSION = "hapa.tarot-library.v1";
export const TAROT_DECK_VERSION = "hapa.tarot-deck.v1";
export const TAROT_SET_VERSION = "hapa.tarot-set.v1";
export const TAROT_CARD_VERSION = "hapa.tarot-card.v1";
export const TAROT_ATTACH_PACK_VERSION = "hapa.tarot-attach-pack.v1";
export const TAROT_ENRICHMENT_VERSION = "hapa.tarot-enrichment.v1";
export const TAROT_LIBRARY_DASHBOARD_VERSION = "hapa.tarot-library-dashboard.v1";

export const TAROT_ARCANA = ["major", "minor", "oracle", "custom"];
export const TAROT_SUITS = ["major", "wands", "cups", "swords", "pentacles", "custom"];
export const TAROT_CARD_TYPES = ["card_front", "card_back", "oracle_card", "reference_card"];
export const TAROT_CARD_STATUSES = ["intake", "draft", "review", "canon", "retired"];

export const DEFAULT_TAROT_DECK = {
  schemaVersion: TAROT_DECK_VERSION,
  id: "hapa-tarot",
  title: "Hapa Tarot Deck",
  slug: "hapa-tarot",
  subtitle: "Custom symbolic avatar deck",
  description: "A local-first Hapa deck for Tarot cards that can stand alone, belong to decks, or later attach to Avatar Cards.",
  status: "draft",
  tags: ["hapa", "tarot", "custom-deck"],
  cardIds: [],
  backCardId: null,
  avatarLinks: [],
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z"
};

export const DEFAULT_TAROT_SET = {
  schemaVersion: TAROT_SET_VERSION,
  id: "hapa-core-set",
  title: "Hapa Core Set",
  slug: "hapa-core-set",
  description: "A flexible working set for card faces, card backs, alternates, and loop media before final deck assembly.",
  status: "draft",
  tags: ["hapa", "tarot", "set"],
  cardIds: [],
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z"
};

export function createTarotStore(input = {}) {
  return normalizeTarotStore({
    schemaVersion: TAROT_STORE_VERSION,
    decks: input.decks || [DEFAULT_TAROT_DECK],
    sets: input.sets || [DEFAULT_TAROT_SET],
    cards: input.cards || [],
    spreads: input.spreads || [],
    updatedAt: input.updatedAt || new Date().toISOString()
  });
}

export function normalizeTarotStore(input = {}) {
  const now = new Date().toISOString();
  const rawDecks = Array.isArray(input.decks) && input.decks.length ? input.decks : [DEFAULT_TAROT_DECK];
  const rawSets = Array.isArray(input.sets) && input.sets.length ? input.sets : [DEFAULT_TAROT_SET];
  const cards = uniqueById((Array.isArray(input.cards) ? input.cards : []).map(normalizeTarotCard));
  const cardIds = new Set(cards.map((card) => card.id));
  const decks = uniqueById(rawDecks.map(normalizeTarotDeck)).map((deck) => ({
    ...deck,
    cardIds: unique((deck.cardIds || []).filter((cardId) => cardIds.has(cardId))),
    backCardId: cardIds.has(deck.backCardId) ? deck.backCardId : null
  }));
  const sets = uniqueById(rawSets.map(normalizeTarotSet)).map((set) => ({
    ...set,
    cardIds: unique((set.cardIds || []).filter((cardId) => cardIds.has(cardId)))
  }));

  for (const card of cards) {
    card.deckIds = unique((card.deckIds || []).filter((deckId) => decks.some((deck) => deck.id === deckId)));
    card.setIds = unique((card.setIds || []).filter((setId) => sets.some((set) => set.id === setId)));
    for (const deckId of card.deckIds) {
      const deck = decks.find((item) => item.id === deckId);
      if (deck && !deck.cardIds.includes(card.id)) deck.cardIds.push(card.id);
    }
    for (const setId of card.setIds) {
      const set = sets.find((item) => item.id === setId);
      if (set && !set.cardIds.includes(card.id)) set.cardIds.push(card.id);
    }
  }

  return {
    schemaVersion: TAROT_STORE_VERSION,
    decks,
    sets,
    cards,
    spreads: Array.isArray(input.spreads) ? input.spreads : [],
    updatedAt: input.updatedAt || now
  };
}

export function createTarotDeck(input = {}) {
  const now = new Date().toISOString();
  const title = String(input.title || "Untitled Deck").trim();
  const id = input.id || slugify(title) || `tarot-deck-${Date.now()}`;
  return normalizeTarotDeck({
    schemaVersion: TAROT_DECK_VERSION,
    id,
    title,
    slug: input.slug || slugify(title) || id,
    subtitle: input.subtitle || "",
    description: input.description || "",
    status: input.status || "draft",
    tags: input.tags || ["tarot-deck"],
    cardIds: input.cardIds || [],
    backCardId: input.backCardId || null,
    avatarLinks: input.avatarLinks || [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  });
}

export function createTarotSet(input = {}) {
  const now = new Date().toISOString();
  const title = String(input.title || "Untitled Set").trim();
  const id = input.id || slugify(title) || `tarot-set-${Date.now()}`;
  return normalizeTarotSet({
    schemaVersion: TAROT_SET_VERSION,
    id,
    title,
    slug: input.slug || slugify(title) || id,
    description: input.description || "",
    status: input.status || "draft",
    tags: input.tags || ["tarot-set"],
    cardIds: input.cardIds || [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  });
}

export function createTarotCard(input = {}) {
  const now = new Date().toISOString();
  const title = String(input.title || input.name || "Untitled Card").trim();
  const id = input.id || slugify(`${title}-${Date.now()}`) || `tarot-card-${Date.now()}`;
  const assets = normalizeTarotAssets(input, id);
  const primaryAsset = selectPrimaryTarotAsset(assets, input.primaryAssetId);
  return normalizeTarotCard({
    schemaVersion: TAROT_CARD_VERSION,
    id,
    title,
    slug: input.slug || slugify(title) || id,
    cardType: TAROT_CARD_TYPES.includes(input.cardType) ? input.cardType : "card_front",
    number: input.number || "",
    suit: TAROT_SUITS.includes(input.suit) ? input.suit : "custom",
    arcana: TAROT_ARCANA.includes(input.arcana) ? input.arcana : "custom",
    orientation: input.orientation || "upright",
    keywords: input.keywords || [],
    meaning: input.meaning || "",
    reversedMeaning: input.reversedMeaning || "",
    promptNotes: input.promptNotes || "",
    status: TAROT_CARD_STATUSES.includes(input.status) ? input.status : "intake",
    deckIds: input.deckIds || (input.deckId ? [input.deckId] : []),
    setIds: input.setIds || (input.setId ? [input.setId] : []),
    avatarLinks: input.avatarLinks || [],
    asset: primaryAsset,
    assets,
    primaryAssetId: primaryAsset?.id || null,
    enrichment: normalizeTarotEnrichment(input.enrichment),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  });
}

export function addTarotDeck(store, input = {}) {
  const next = clone(normalizeTarotStore(store));
  const deck = createTarotDeck(input);
  const existingIndex = next.decks.findIndex((item) => item.id === deck.id);
  if (existingIndex >= 0) next.decks[existingIndex] = { ...next.decks[existingIndex], ...deck };
  else next.decks.unshift(deck);
  return touchStore(next);
}

export function updateTarotDeck(store, deckId, patch = {}) {
  const next = clone(normalizeTarotStore(store));
  const deckIndex = next.decks.findIndex((deck) => deck.id === deckId);
  if (deckIndex < 0) return next;
  next.decks[deckIndex] = normalizeTarotDeck({
    ...next.decks[deckIndex],
    ...patch,
    id: deckId,
    updatedAt: new Date().toISOString()
  });
  return touchStore(next);
}

export function addTarotSet(store, input = {}) {
  const next = clone(normalizeTarotStore(store));
  const set = createTarotSet(input);
  const existingIndex = next.sets.findIndex((item) => item.id === set.id);
  if (existingIndex >= 0) next.sets[existingIndex] = { ...next.sets[existingIndex], ...set };
  else next.sets.unshift(set);
  return touchStore(next);
}

export function updateTarotSet(store, setId, patch = {}) {
  const next = clone(normalizeTarotStore(store));
  const setIndex = next.sets.findIndex((set) => set.id === setId);
  if (setIndex < 0) return next;
  next.sets[setIndex] = normalizeTarotSet({
    ...next.sets[setIndex],
    ...patch,
    id: setId,
    updatedAt: new Date().toISOString()
  });
  return touchStore(next);
}

export function addTarotCard(store, input = {}) {
  const next = clone(normalizeTarotStore(store));
  const card = createTarotCard(input);
  next.cards = [card, ...next.cards.filter((item) => item.id !== card.id)];
  for (const deckId of card.deckIds) {
    const deck = next.decks.find((item) => item.id === deckId);
    if (deck && !deck.cardIds.includes(card.id)) {
      deck.cardIds.unshift(card.id);
      deck.updatedAt = new Date().toISOString();
    }
  }
  for (const setId of card.setIds) {
    const set = next.sets.find((item) => item.id === setId);
    if (set && !set.cardIds.includes(card.id)) {
      set.cardIds.unshift(card.id);
      set.updatedAt = new Date().toISOString();
    }
  }
  return touchStore(next);
}

export function updateTarotCard(store, cardId, patch = {}) {
  const next = clone(normalizeTarotStore(store));
  const cardIndex = next.cards.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) return next;
  const before = next.cards[cardIndex];
  const card = normalizeTarotCard({
    ...before,
    ...patch,
    id: cardId,
    deckIds: patch.deckIds || before.deckIds || [],
    setIds: patch.setIds || before.setIds || [],
    asset: patch.asset === undefined ? before.asset : patch.asset,
    assets: patch.assets === undefined ? before.assets : patch.assets,
    primaryAssetId: patch.primaryAssetId === undefined ? before.primaryAssetId : patch.primaryAssetId,
    enrichment: patch.enrichment === undefined ? before.enrichment : patch.enrichment,
    updatedAt: new Date().toISOString()
  });
  next.cards[cardIndex] = card;
  for (const deck of next.decks) {
    const shouldContain = card.deckIds.includes(deck.id);
    const hasCard = deck.cardIds.includes(card.id);
    if (shouldContain && !hasCard) deck.cardIds.push(card.id);
    if (!shouldContain && hasCard) deck.cardIds = deck.cardIds.filter((id) => id !== card.id);
    if (shouldContain !== hasCard) deck.updatedAt = new Date().toISOString();
  }
  for (const set of next.sets) {
    const shouldContain = card.setIds.includes(set.id);
    const hasCard = set.cardIds.includes(card.id);
    if (shouldContain && !hasCard) set.cardIds.push(card.id);
    if (!shouldContain && hasCard) set.cardIds = set.cardIds.filter((id) => id !== card.id);
    if (shouldContain !== hasCard) set.updatedAt = new Date().toISOString();
  }
  return touchStore(next);
}

export function setTarotCardDeckMembership(store, cardId, deckIds = []) {
  return updateTarotCard(store, cardId, { deckIds: unique(deckIds) });
}

export function setTarotCardSetMembership(store, cardId, setIds = []) {
  return updateTarotCard(store, cardId, { setIds: unique(setIds) });
}

export function attachTarotCardMedia(store, cardId, assetInput = {}, role = null) {
  const next = clone(normalizeTarotStore(store));
  const cardIndex = next.cards.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) return next;
  const card = next.cards[cardIndex];
  const mediaRole = role || (assetInput.type === "video" ? "loop_video" : "primary_image");
  const asset = normalizeTarotAsset({
    ...assetInput,
    tags: unique([
      ...(assetInput.tags || []),
      mediaRole === "loop_video" ? "tarot-loop" : "tarot-card"
    ]),
    metadata: {
      ...(assetInput.metadata || {}),
      tarotMediaRole: mediaRole
    }
  }, card.id, mediaRole);
  const existingIndex = card.assets.findIndex((item) => item.id === asset.id);
  if (existingIndex >= 0) card.assets[existingIndex] = asset;
  else card.assets.push(asset);
  if (asset.type === "image" && (mediaRole === "primary_image" || !card.primaryAssetId || !card.asset)) {
    card.primaryAssetId = asset.id;
    card.asset = asset;
  } else {
    card.asset = selectPrimaryTarotAsset(card.assets, card.primaryAssetId);
  }
  card.updatedAt = new Date().toISOString();
  next.cards[cardIndex] = normalizeTarotCard(card);
  return touchStore(next);
}

export function linkTarotCardAvatar(store, cardId, avatarId, details = {}) {
  if (!avatarId) return normalizeTarotStore(store);
  const next = clone(normalizeTarotStore(store));
  const card = next.cards.find((item) => item.id === cardId);
  if (!card) return next;
  const existingIndex = card.avatarLinks.findIndex((link) => link.avatarId === avatarId);
  const link = {
    avatarId,
    role: details.role || card.avatarLinks[existingIndex]?.role || "avatar-symbol",
    note: details.note || card.avatarLinks[existingIndex]?.note || "",
    tags: unique(details.tags || card.avatarLinks[existingIndex]?.tags || ["tarot-link"]),
    linkedAt: card.avatarLinks[existingIndex]?.linkedAt || new Date().toISOString()
  };
  if (existingIndex >= 0) card.avatarLinks[existingIndex] = link;
  else card.avatarLinks.push(link);
  card.updatedAt = new Date().toISOString();
  return touchStore(next);
}

export function unlinkTarotCardAvatar(store, cardId, avatarId) {
  const next = clone(normalizeTarotStore(store));
  const card = next.cards.find((item) => item.id === cardId);
  if (!card) return next;
  card.avatarLinks = card.avatarLinks.filter((link) => link.avatarId !== avatarId);
  card.updatedAt = new Date().toISOString();
  return touchStore(next);
}

export function createTarotAttachPack(store, { deckId = null, setId = null, cardId = null, target = "agent" } = {}) {
  const normalized = normalizeTarotStore(store);
  const deck = deckId ? normalized.decks.find((item) => item.id === deckId) || null : null;
  const set = setId ? normalized.sets.find((item) => item.id === setId) || null : null;
  const cards = cardId
    ? normalized.cards.filter((card) => card.id === cardId)
    : deck
      ? deck.cardIds.map((id) => normalized.cards.find((card) => card.id === id)).filter(Boolean)
      : set
        ? set.cardIds.map((id) => normalized.cards.find((card) => card.id === id)).filter(Boolean)
        : normalized.cards;
  const references = cards.map((card) => ({
    id: card.id,
    title: card.title,
    number: card.number,
    suit: card.suit,
    arcana: card.arcana,
    status: card.status,
    cardType: card.cardType,
    keywords: card.keywords,
    meaning: card.meaning,
    reversedMeaning: card.reversedMeaning,
    deckIds: card.deckIds,
    setIds: card.setIds,
    avatarLinks: card.avatarLinks,
    asset: card.asset ? {
      id: card.asset.id,
      name: card.asset.name,
      uri: card.asset.uri,
      type: card.asset.type,
      thumbnail: card.asset.metadata?.thumbnail?.uri || card.asset.metadata?.thumbnailUri || null,
      storage: card.asset.storage || card.asset.metadata?.storage || null
    } : null,
    assets: card.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      uri: asset.uri,
      type: asset.type,
      role: asset.metadata?.tarotMediaRole || (asset.type === "video" ? "loop_video" : "card_media"),
      thumbnail: asset.metadata?.thumbnail?.uri || asset.metadata?.thumbnailUri || null,
      storage: asset.storage || asset.metadata?.storage || null
    })),
    loopVideos: card.assets
      .filter((asset) => asset.type === "video")
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        uri: asset.uri,
        thumbnail: asset.metadata?.thumbnail?.uri || asset.metadata?.thumbnailUri || null,
        frames: asset.metadata?.frames || asset.state?.keyframes || []
      }))
  }));

  return {
    schemaVersion: TAROT_ATTACH_PACK_VERSION,
    target,
    deck: deck ? {
      id: deck.id,
      title: deck.title,
      status: deck.status,
      tags: deck.tags,
      backCardId: deck.backCardId
    } : null,
    set: set ? {
      id: set.id,
      title: set.title,
      status: set.status,
      tags: set.tags
    } : null,
    cardId,
    setId,
    cards: references,
    avatarLinks: references.flatMap((card) =>
      (card.avatarLinks || []).map((link) => ({
        ...link,
        cardId: card.id,
        cardTitle: card.title
      }))
    ),
    instructions: [
      "Use Tarot cards as symbolic references, not as Avatar Card slot replacements.",
      "Use cardType=card_back records as selectable backs for readings, previews, and deck presentation.",
      "Use loopVideos when card animation, card reveal motion, or animated reading state is needed.",
      "Prefer card-level avatarLinks when a reading, prompt, or deck spread needs a specific character anchor.",
      "Cards without avatarLinks remain standalone deck symbolism and can be attached later."
    ],
    createdAt: new Date().toISOString()
  };
}

export function summarizeTarotStore(store) {
  const normalized = normalizeTarotStore(store);
  const linkedCardCount = normalized.cards.filter((card) => card.avatarLinks.length > 0).length;
  const standaloneCardCount = normalized.cards.filter((card) => card.deckIds.length === 0 && card.setIds.length === 0).length;
  return {
    decks: normalized.decks.length,
    sets: normalized.sets.length,
    cards: normalized.cards.length,
    cardBacks: normalized.cards.filter((card) => card.cardType === "card_back").length,
    loopVideos: normalized.cards.reduce((sum, card) => sum + card.assets.filter((asset) => asset.type === "video").length, 0),
    linkedCards: linkedCardCount,
    avatarLinks: normalized.cards.reduce((sum, card) => sum + card.avatarLinks.length, 0),
    standaloneCards: standaloneCardCount,
    canonCards: normalized.cards.filter((card) => card.status === "canon").length
  };
}

export function createTarotLibraryDashboard(store) {
  const normalized = normalizeTarotStore(store);
  const loopAssets = normalized.cards.flatMap((card) =>
    card.assets.filter((asset) => asset.type === "video").map((asset) => ({ card, asset }))
  );
  const enrichedCards = normalized.cards.filter((card) => card.enrichment?.status === "enriched" || card.enrichment?.ocrText);
  const needsReviewCards = normalized.cards.filter((card) => card.enrichment?.needsReview || card.enrichment?.confidence === "low");
  const linkedCards = normalized.cards.filter((card) => card.avatarLinks.length);
  const allTags = normalized.cards.flatMap((card) => card.keywords || []);
  return {
    schemaVersion: TAROT_LIBRARY_DASHBOARD_VERSION,
    updatedAt: normalized.updatedAt,
    summary: summarizeTarotStore(normalized),
    counts: {
      cardTypes: countBy(normalized.cards, (card) => card.cardType || "card_front"),
      suits: countBy(normalized.cards, (card) => card.suit || "custom"),
      arcana: countBy(normalized.cards, (card) => card.arcana || "custom"),
      statuses: countBy(normalized.cards, (card) => card.status || "intake"),
      decks: Object.fromEntries(normalized.decks.map((deck) => [deck.title, deck.cardIds.length])),
      sets: Object.fromEntries(normalized.sets.map((set) => [set.title, set.cardIds.length]))
    },
    enrichment: {
      cardsEnriched: enrichedCards.length,
      cardsPending: normalized.cards.length - enrichedCards.length,
      cardsNeedingReview: needsReviewCards.length,
      ocrCards: normalized.cards.filter((card) => card.enrichment?.ocrText).length,
      visualLabelCards: normalized.cards.filter((card) => card.enrichment?.visualLabels?.length).length,
      avatarLinkedCards: linkedCards.length
    },
    media: {
      totalAssets: normalized.cards.reduce((sum, card) => sum + card.assets.length, 0),
      loopVideos: loopAssets.length,
      enrichedLoopVideos: loopAssets.filter(({ asset }) => asset.metadata?.tarotEnrichment?.status === "enriched").length,
      loopVideosNeedingReview: loopAssets.filter(({ asset }) => asset.metadata?.tarotEnrichment?.needsReview).length,
      loopsByCard: normalized.cards
        .map((card) => ({
          cardId: card.id,
          title: card.title,
          loops: card.assets.filter((asset) => asset.type === "video").length
        }))
        .filter((item) => item.loops)
        .sort((a, b) => b.loops - a.loops)
    },
    topTags: Object.entries(countBy(allTags, (tag) => tag))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 32)
      .map(([tag, count]) => ({ tag, count }))
  };
}

function normalizeTarotDeck(deck = {}) {
  const now = new Date().toISOString();
  const title = String(deck.title || "Untitled Deck").trim();
  const id = deck.id || slugify(title) || `tarot-deck-${Date.now()}`;
  return {
    schemaVersion: TAROT_DECK_VERSION,
    id,
    title,
    slug: deck.slug || slugify(title) || id,
    subtitle: deck.subtitle || "",
    description: deck.description || "",
    status: deck.status || "draft",
    tags: unique(deck.tags || ["tarot-deck"]),
    cardIds: unique(deck.cardIds || []),
    backCardId: deck.backCardId || null,
    avatarLinks: normalizeAvatarLinks(deck.avatarLinks || []),
    createdAt: deck.createdAt || now,
    updatedAt: deck.updatedAt || deck.createdAt || now
  };
}

function normalizeTarotSet(set = {}) {
  const now = new Date().toISOString();
  const title = String(set.title || "Untitled Set").trim();
  const id = set.id || slugify(title) || `tarot-set-${Date.now()}`;
  return {
    schemaVersion: TAROT_SET_VERSION,
    id,
    title,
    slug: set.slug || slugify(title) || id,
    description: set.description || "",
    status: set.status || "draft",
    tags: unique(set.tags || ["tarot-set"]),
    cardIds: unique(set.cardIds || []),
    createdAt: set.createdAt || now,
    updatedAt: set.updatedAt || set.createdAt || now
  };
}

function normalizeTarotCard(card = {}) {
  const now = new Date().toISOString();
  const title = String(card.title || "Untitled Card").trim();
  const id = card.id || slugify(title) || `tarot-card-${Date.now()}`;
  const assets = normalizeTarotAssets(card, id);
  const primaryAsset = selectPrimaryTarotAsset(assets, card.primaryAssetId);
  return {
    schemaVersion: TAROT_CARD_VERSION,
    id,
    title,
    slug: card.slug || slugify(title) || id,
    cardType: TAROT_CARD_TYPES.includes(card.cardType) ? card.cardType : "card_front",
    number: card.number || "",
    suit: TAROT_SUITS.includes(card.suit) ? card.suit : "custom",
    arcana: TAROT_ARCANA.includes(card.arcana) ? card.arcana : "custom",
    orientation: card.orientation || "upright",
    keywords: unique(card.keywords || []),
    meaning: card.meaning || "",
    reversedMeaning: card.reversedMeaning || "",
    promptNotes: card.promptNotes || "",
    status: TAROT_CARD_STATUSES.includes(card.status) ? card.status : "intake",
    deckIds: unique(card.deckIds || []),
    setIds: unique(card.setIds || []),
    avatarLinks: normalizeAvatarLinks(card.avatarLinks || []),
    asset: primaryAsset,
    assets,
    primaryAssetId: primaryAsset?.id || null,
    enrichment: normalizeTarotEnrichment(card.enrichment),
    createdAt: card.createdAt || now,
    updatedAt: card.updatedAt || card.createdAt || now
  };
}

function normalizeTarotEnrichment(enrichment = null) {
  if (!enrichment || typeof enrichment !== "object") return null;
  return {
    schemaVersion: enrichment.schemaVersion || TAROT_ENRICHMENT_VERSION,
    status: enrichment.status || "draft",
    method: enrichment.method || "manual",
    confidence: enrichment.confidence || "medium",
    needsReview: Boolean(enrichment.needsReview),
    ocrText: enrichment.ocrText || "",
    ocrLines: Array.isArray(enrichment.ocrLines) ? enrichment.ocrLines.map(String).filter(Boolean) : [],
    visualLabels: Array.isArray(enrichment.visualLabels) ? enrichment.visualLabels : [],
    detectedTitle: enrichment.detectedTitle || "",
    detectedNumber: enrichment.detectedNumber || "",
    detectedSuit: enrichment.detectedSuit || "",
    detectedArcana: enrichment.detectedArcana || "",
    detectedCardType: enrichment.detectedCardType || "",
    detectedAvatars: Array.isArray(enrichment.detectedAvatars) ? enrichment.detectedAvatars : [],
    visualDescription: enrichment.visualDescription || "",
    symbolicSummary: enrichment.symbolicSummary || "",
    textSynopsis: enrichment.textSynopsis || "",
    loreNotes: enrichment.loreNotes || "",
    sourceTextSnippets: Array.isArray(enrichment.sourceTextSnippets) ? enrichment.sourceTextSnippets.map(String).filter(Boolean) : [],
    media: enrichment.media && typeof enrichment.media === "object" ? enrichment.media : {},
    tags: unique(enrichment.tags || []),
    enrichedAt: enrichment.enrichedAt || null
  };
}

function normalizeTarotAssets(source = {}, cardId = "") {
  const rawAssets = [
    ...(source.asset ? [source.asset] : []),
    ...(Array.isArray(source.assets) ? source.assets : [])
  ].filter(Boolean);
  return uniqueById(rawAssets.map((asset) => normalizeTarotAsset(asset, cardId, asset.metadata?.tarotMediaRole))).filter(Boolean);
}

function normalizeTarotAsset(asset = {}, cardId = "", role = null) {
  const mediaRole = role || asset.metadata?.tarotMediaRole || (asset.type === "video" ? "loop_video" : "primary_image");
  return createMediaAsset({
    ...asset,
    id: asset.id || `${cardId}-${mediaRole}-${Date.now()}`,
    requirementId: "tarot_card",
    tags: unique(["tarot-card", mediaRole === "loop_video" ? "tarot-loop" : null, ...(asset.tags || [])]),
    source: asset.source || "tarot-upload",
    notes: asset.notes || "Tarot card media attached to the Hapa Tarot library.",
    processing: {
      status: "attached",
      attachedToTarotCard: true,
      ...(asset.processing || {})
    },
    metadata: {
      ...(asset.metadata || {}),
      tarotCardId: cardId,
      tarotMediaRole: mediaRole
    }
  });
}

function selectPrimaryTarotAsset(assets = [], preferredId = null) {
  return assets.find((asset) => preferredId && asset.id === preferredId && asset.type === "image") ||
    assets.find((asset) => asset.metadata?.tarotMediaRole === "primary_image" && asset.type === "image") ||
    assets.find((asset) => asset.type === "image") ||
    null;
}

function normalizeAvatarLinks(links = []) {
  return links
    .filter((link) => link?.avatarId)
    .map((link) => ({
      avatarId: link.avatarId,
      role: link.role || "avatar-symbol",
      note: link.note || "",
      tags: unique(link.tags || ["tarot-link"]),
      linkedAt: link.linkedAt || new Date().toISOString()
    }));
}

function touchStore(store) {
  return normalizeTarotStore({
    ...store,
    updatedAt: new Date().toISOString()
  });
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function uniqueById(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function countBy(items = [], selector = (item) => item) {
  return items.reduce((counts, item) => {
    const key = String(selector(item) || "unknown").trim() || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
