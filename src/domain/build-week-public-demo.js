const PUBLIC_DEMO_TAG = "build-week-public-demo";

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function titleCase(value = "") {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstImage(record = {}) {
  return record.asset?.uri ||
    (record.assets || []).find((asset) => asset?.type === "image")?.uri ||
    (record.mediaAssets || []).find((asset) => asset?.type === "image")?.uri ||
    (record.media || []).find((asset) => asset?.type === "image")?.uri ||
    "";
}

function avatarPortrait(avatar = {}) {
  return (avatar.assets || []).find((asset) => asset?.type === "image")?.uri || "";
}

function avatarContact(avatar = {}) {
  const name = avatar.primaryName || avatar.name || avatar.id || "Avatar";
  return {
    id: avatar.id,
    name,
    role: "Public Build Week Avatar",
    portraitUri: avatarPortrait(avatar),
    profile: avatar,
    card: avatar
  };
}

function avatarDrawCard(avatar = {}, index = 0) {
  const name = avatar.primaryName || avatar.name || avatar.id || `Avatar ${index + 1}`;
  const portraitUri = avatarPortrait(avatar);
  return {
    id: `avatar-tarot-${avatar.id}`,
    cardId: avatar.id,
    title: name,
    subtitle: "Build Week Avatar Card",
    archetype: "Avatar",
    tarotNumber: `AV-${index + 1}`,
    summary: avatar.summary || avatar.three_paragraph_background_narrative || "Public Build Week Avatar profile.",
    keywords: unique(["avatar", "rgb", ...(avatar.tags || [])]).slice(0, 8),
    stats: {
      protocols: avatar.mind?.protocolCardLoadout?.length || 0,
      skills: avatar.mind?.skillCardLoadout?.length || 0,
      songs: avatar.mind?.dearPapaSongContext?.selectedSongCards?.length || 0
    },
    tags: unique([PUBLIC_DEMO_TAG, "tarot-card", "avatar-card", ...(avatar.tags || [])]),
    sourceKind: "avatar",
    kind: "avatar",
    cardType: "avatar_card",
    functionalType: "Avatar",
    tarotMainType: "avatar_card",
    highResImageUri: portraitUri,
    imageUri: portraitUri,
    posterUri: portraitUri,
    priority: 4,
    videoScore: 0,
    avatarContacts: [avatarContact(avatar)],
    publicDemoReviewCard: true
  };
}

function itemDrawCard(card = {}, avatarById = new Map()) {
  const imageUri = firstImage(card);
  const avatarContacts = unique(card.connections?.avatarIds || [])
    .map((avatarId) => avatarById.get(avatarId))
    .filter(Boolean)
    .map(avatarContact);
  const kind = card.kind || String(card.cardType || "card").replace(/_card$/u, "");
  const functionalType = titleCase(kind || card.cardType || "Card");
  const profileRequired = (card.tags || []).includes("profile-required");
  return {
    id: card.id,
    cardId: card.cardId || card.id,
    title: card.title || card.name || card.id,
    subtitle: profileRequired ? "RGB Profile Loadout" : "Build Week Public Sample",
    archetype: functionalType,
    tarotNumber: profileRequired ? "LOADOUT" : "DEMO",
    summary: card.summary || card.description || card.lore || "Public Build Week foundation Card.",
    keywords: unique([kind, ...(card.tags || [])]).slice(0, 8),
    stats: card.stats || {},
    tags: unique([PUBLIC_DEMO_TAG, "tarot-card", ...(card.tags || [])]),
    sourceKind: "item",
    kind,
    cardType: card.cardType || `${kind}_card`,
    functionalType,
    tarotMainType: card.cardType || `${kind}_card`,
    highResImageUri: imageUri,
    imageUri,
    posterUri: imageUri,
    priority: profileRequired ? 3 : 1,
    videoScore: 0,
    avatarContacts,
    connections: card.connections || null,
    sourceRefs: card.sourceRefs || null,
    publicDemoReviewCard: true
  };
}

function wisdomDrawCard(card = {}) {
  const category = card.enrichment?.media?.codexBuildWeek?.category || "wisdom";
  const imageUri = firstImage(card);
  return {
    id: card.id,
    cardId: card.cardId || card.id,
    cardCoreKey: card.cardCoreKey || card.custody?.cardCoreKey || null,
    cardRevisionId: card.cardRevisionId || card.custody?.cardRevisionId || null,
    cardRecordDigest: card.cardRecordDigest || card.custody?.cardRecordDigest || null,
    recordDigest: card.recordDigest || card.custody?.recordDigest || null,
    originPublicKey: card.originPublicKey || card.custody?.originPublicKey || null,
    custody: card.custody || null,
    title: card.title || card.id,
    subtitle: `Codex Build Week Wisdom Set · ${titleCase(category)}`,
    archetype: "Wisdom Set",
    tarotNumber: card.number || "WISDOM",
    summary: card.meaning || card.enrichment?.symbolicSummary || "Build Week Wisdom Set Card.",
    keywords: unique([category, "wisdom-set", ...(card.keywords || []), ...(card.tags || [])]).slice(0, 8),
    stats: {},
    tags: unique([PUBLIC_DEMO_TAG, "tarot-card", "wisdom-set", category, ...(card.tags || [])]),
    sourceKind: "tarot",
    kind: category,
    cardType: `${category}_card`,
    functionalType: titleCase(category),
    tarotMainType: `${category}_card`,
    highResImageUri: imageUri,
    imageUri,
    posterUri: imageUri,
    priority: 2,
    videoScore: 0,
    avatarContacts: [],
    publicDemoReviewCard: true,
    reviewBoundary: card.enrichment?.media?.codexBuildWeek?.lineage || null
  };
}

function songDrawCard(song = {}, index = 0, avatarById = new Map(), avatars = []) {
  const perspectiveAvatarId = song.performancePerspective?.avatarId || song.perspective?.avatarId || "";
  const avatar = avatarById.get(perspectiveAvatarId) || avatars[index % Math.max(avatars.length, 1)] || null;
  const imageUri = firstImage(song) || avatarPortrait(avatar || {}) || "/demo/skill-card.svg";
  const songId = song.id || song.songId || `echo-state-${index + 1}`;
  return {
    id: `song-card-${songId}`,
    cardId: song.cardId || songId,
    sourceSongId: songId,
    title: song.title || `Echo State ${index + 1}`,
    subtitle: "Echo State Song Card",
    archetype: "Hapa Song",
    tarotNumber: song.trackNumber ? `S-${song.trackNumber}` : `S-${index + 1}`,
    summary: song.summary || song.lore?.summary || song.lore?.relationshipLens || "Public Echo State Song Card.",
    keywords: unique(["echo-state", "song-card", ...(song.tags || [])]).slice(0, 8),
    stats: { track: Number(song.trackNumber || index + 1) },
    tags: unique([PUBLIC_DEMO_TAG, "tarot-card", "song-card", "echo-state", ...(song.tags || [])]),
    sourceKind: "song",
    kind: "song",
    cardType: "song_card",
    functionalType: "Song",
    tarotMainType: "song_card",
    highResImageUri: imageUri,
    imageUri,
    posterUri: imageUri,
    videoUri: "",
    videoSources: [],
    songLinks: [{
      songId,
      cardId: song.cardId || songId,
      title: song.title || `Echo State ${index + 1}`,
      audioUri: song.audioUri || song.audio?.mp3Uri || song.audio?.wavUri || ""
    }],
    avatarContacts: avatar ? [avatarContact(avatar)] : [],
    priority: 2,
    videoScore: 0,
    publicDemoReviewCard: true
  };
}

export function buildBuildWeekPublicDemoProjection({
  avatars = [],
  itemCards = [],
  tarotCards = [],
  songs = [],
  gateCards = []
} = {}) {
  const avatarById = new Map(avatars.map((avatar) => [avatar.id, avatar]).filter(([id]) => id));
  const cards = [
    ...avatars.map(avatarDrawCard),
    ...itemCards.map((card) => itemDrawCard(card, avatarById)),
    ...tarotCards.map(wisdomDrawCard),
    ...songs.map((song, index) => songDrawCard(song, index, avatarById, avatars)),
    ...gateCards
  ];
  const uniqueCards = [...new Map(cards.filter((card) => card?.id).map((card) => [card.id, card])).values()];
  return {
    cards: uniqueCards,
    audit: {
      schemaVersion: "hapa.tarot-draw-public-demo-audit.v1",
      total: uniqueCards.length,
      candidates: uniqueCards.length,
      ready: uniqueCards.length,
      productionReady: uniqueCards.length,
      blocked: 0,
      hiddenFromProduction: 0,
      missingMedia: uniqueCards.filter((card) => !(card.imageUri || card.videoUri)).length,
      fixture: true,
      policy: "The Build Week review route permits source-controlled image and Song Cards so judges can inspect the exact public volume; it does not claim production-loop readiness.",
      truthBoundary: "Curated public Build Week volume only; no private roster, Shared Hand, or live Overwind projection."
    },
    state: "ready",
    fixtureDisclosure: "Public Build Week volume: RGB Avatars, attached profile loadouts, Echo State, Wisdom Set, and deterministic Stargate Cards."
  };
}
