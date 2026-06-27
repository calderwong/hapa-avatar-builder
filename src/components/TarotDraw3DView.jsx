import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, BookOpenCheck, Camera, CircleDot, Grid3X3, Link2, ListChecks, Maximize2, Mic, Minimize2, Pause, Play, RefreshCw, Route, Shuffle, Sparkles, UserRound, Volume2, Waves, X } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { queryValenTarotReading } from "../domain/valenTarotBridge.js";

const CARD_WIDTH = 0.92;
const CARD_HEIGHT = 1.48;
const CARD_DEPTH = 0.055;
const CARD_TABLE_BASE_Y = 0.078;
const CARD_STACK_GAP = CARD_DEPTH + 0.052;
const CARD_STACK_OVERLAP_X = CARD_WIDTH * 0.86;
const CARD_STACK_OVERLAP_Z = CARD_HEIGHT * 0.86;
const CARD_PITCH_MIN = -0.46;
const CARD_PITCH_MAX = 1.12;
const CARD_FOCUS_OPEN_THRESHOLD = 0.88;
const CARD_FOCUS_CLOSE_THRESHOLD = 0.62;
const CARD_FOCUS_WHEEL_STEP = 0.0018;
const CARD_FOCUS_CAMERA_DISTANCE = 1.72;
const TAROT_DETAIL_ZOOM_MIN = 1;
const TAROT_DETAIL_ZOOM_MAX = 3.5;
const TAROT_DETAIL_ZOOM_STEP = 0.25;
const DROP_ZONE_CARD_BASE_Y = 0.15;
const TABLE_Y = 0;
const BOARD_LIMIT_X = 3.28;
const BOARD_LIMIT_Z = 1.96;
const DECK_POSITION = new THREE.Vector3(-3.18, 0.22, 1.56);
const DROP_ZONE_POSITION = new THREE.Vector3(2.64, 0.105, 1.42);
const MEDIA_POOL_POSITION = new THREE.Vector3(-2.62, 0.105, -1.35);
const DROP_ZONE_RADIUS = 0.62;
const DROP_ZONE_MAGNET_RADIUS = 1.18;
const MEDIA_POOL_RADIUS = 0.6;
const MEDIA_POOL_MAGNET_RADIUS = 1.08;
const MEDIA_POOL_CARD_BASE_Y = 0.14;
const CENTER_VISUALIZER_RADIUS = 0.74;
const CENTER_VISUALIZER_MAGNET_RADIUS = 1.36;
const CENTER_VISUALIZER_CARD_BASE_Y = 1.06;
const CENTER_VISUALIZER_CARD_RADIUS = 0.74;
const DOCK_POSITION = new THREE.Vector3(-0.78, 0.118, 2.1);
const DOCK_HALF_WIDTH = 1.52;
const DOCK_HALF_DEPTH = 0.32;
const DOCK_MAGNET_MARGIN = 0.52;
const DOCK_CARD_BASE_Y = 0.26;
const DOCK_CARD_PITCH = 0.6;
const DOCK_SLOT_SPACING = 0.78;
const DOCK_BACKGROUND_HEIGHT = 8.45;
const DOCK_BACKGROUND_POSITION = new THREE.Vector3(0.08, 4.04, -5.12);
const DOCK_BACKGROUND_SCREEN_Z = 0.075;
const DOCK_BACKGROUND_LIVE_SCREEN_Z = 0.18;
const DOCK_BACKGROUND_RENDER_ORDER = 1;
const DOCK_BACKGROUND_LIVE_RENDER_ORDER = 24;
const DOCK_BACKGROUND_ROTATE_SECONDS = 8.4;
const TAROT_DOCK_SETTINGS_VERSION = 1;
const CARD_VIDEO_FALLBACK_ASPECT = CARD_WIDTH / CARD_HEIGHT;
const DROP_PREVIEW_SCREEN_ASPECT = CARD_VIDEO_FALLBACK_ASPECT;
const ECHO_DIRECTOR_EXPORT_ASPECT = 16 / 9;
const ECHO_DIRECTOR_OVERLAY_WIDTH = 1024;
const ECHO_DIRECTOR_OVERLAY_HEIGHT = 576;
const DROP_PREVIEW_BACK_HEIGHT = 4.85;
const DROP_PREVIEW_SIDE_HEIGHT = 4.12;
const DROP_PREVIEW_TABLE_HEIGHT = 2.82;
const DROP_PREVIEW_ROTATE_SECONDS = 7.4;
const DROP_PREVIEW_ROTATE_STAGGER = 1.45;
const DROP_PREVIEW_QUEUE_MIN = 6;
const TAROT_AUTO_DEAL_MEDIA_CARD_COUNT = 12;
const DROP_PREVIEW_BUFFER_SIZE = Math.max(
  0,
  Number.isFinite(Number(import.meta.env?.VITE_TAROT_DROP_PREVIEW_BUFFER))
    ? Number(import.meta.env?.VITE_TAROT_DROP_PREVIEW_BUFFER)
    : 1
);
const DROP_PREVIEW_ACTIVE_SCREEN_LIMIT = THREE.MathUtils.clamp(
  Number.isFinite(Number(import.meta.env?.VITE_TAROT_DROP_PREVIEW_ACTIVE_SCREENS))
    ? Number(import.meta.env?.VITE_TAROT_DROP_PREVIEW_ACTIVE_SCREENS)
    : 3,
  0,
  4
);
const DROP_PREVIEW_PANEL_LIMIT = THREE.MathUtils.clamp(
  Number.isFinite(Number(import.meta.env?.VITE_TAROT_DROP_PREVIEW_PANELS))
    ? Number(import.meta.env?.VITE_TAROT_DROP_PREVIEW_PANELS)
    : 3,
  1,
  4
);
const VIDEO_EDGE_MATTE_MAX_SIZE = 128;
const VIDEO_EDGE_MATTE_UPDATE_SECONDS = 0.18;
const DROP_PREVIEW_CARD_DEPTH = 0.13;
const DROP_PREVIEW_CARD_MARGIN = 0.2;
const DROP_PREVIEW_CARD_RAIL = 0.072;
const CENTER_PREVIEW_SCREEN_NAME = "dropPreviewBack";
const CAMERA_GALLERY_RECOVERY_DURATION = 0.82;
const CAMERA_GALLERY_RECOVERY_CLOSE_DISTANCE = 5.55;
const CAMERA_GALLERY_RECOVERY_MAX_DISTANCE = 10.9;
const CAMERA_GALLERY_RECOVERY_POSITION = new THREE.Vector3(0, 3.72, 8.72);
const CAMERA_GALLERY_RECOVERY_TARGET = new THREE.Vector3(0, 2.38, -1.62);
const CAMERA_GALLERY_RECOVERY_FOV = 52;
const CAMERA_RAIL_HORIZON_START = Math.PI * 0.36;
const CAMERA_RAIL_HORIZON_END = Math.PI * 0.455;
const TAROT_RENDERER_DPR_CAP = Math.max(0.5, Number(import.meta.env?.VITE_TAROT_RENDERER_DPR_CAP ?? 1) || 1);
const TAROT_ACTIVE_FPS = THREE.MathUtils.clamp(Number(import.meta.env?.VITE_TAROT_ACTIVE_FPS ?? 24) || 24, 12, 60);
const TAROT_IDLE_SECONDS = Math.max(0.1, Number(import.meta.env?.VITE_TAROT_IDLE_SECONDS ?? 0.5) || 0.5);
const TAROT_ACTIVE_FRAME_INTERVAL_SECONDS = 1 / TAROT_ACTIVE_FPS;
const TAROT_IDLE_FRAME_INTERVAL_SECONDS = TAROT_IDLE_SECONDS;
const TAROT_MAX_DELTA_SECONDS = 0.08;
const TAROT_RESIZE_CHECK_SECONDS = 0.5;
const TAROT_DYNAMIC_STACK_INTERVAL_SECONDS = 0.16;
const TAROT_HUD_NORMAL_SECONDS = 1.15;
const TAROT_HUD_DETAIL_SECONDS = 0.25;
const SONG_CARD_MEDIA_SEED_LIMIT = 3;
const CARD_FACE_VIDEO_MAX_ACTIVE = Math.max(0, Number(import.meta.env?.VITE_TAROT_CARD_FACE_VIDEO_LIMIT ?? 3) || 0);
const TAROT_RESTORED_DOCK_CARD_LIMIT = Math.max(0, Number(import.meta.env?.VITE_TAROT_RESTORED_DOCK_CARD_LIMIT ?? 3) || 0);
const TAROT_CARD_POINT_LIGHTS_ENABLED = ["1", "true", "yes", "on"].includes(String(import.meta.env?.VITE_TAROT_CARD_POINT_LIGHTS || "").toLowerCase());
const TAROT_FULL_SCENE_LIGHTS_ENABLED = ["1", "true", "yes", "on"].includes(String(import.meta.env?.VITE_TAROT_FULL_SCENE_LIGHTS || "").toLowerCase());
const TAROT_CARD_FLOAT_MOTION_ENABLED = ["1", "true", "yes", "on"].includes(String(import.meta.env?.VITE_TAROT_CARD_FLOAT_MOTION || "").toLowerCase());
const TAROT_AUTO_DEAL_ENABLED = ["1", "true", "yes", "on"].includes(String(
  import.meta.env?.VITE_ENABLE_TAROT_AUTO_DEAL ||
    import.meta.env?.VITE_ENABLE_TAROT_AUTO_DRAW ||
    ""
).toLowerCase());
const SPREAD_LANE_OFFSET_X = -1.65;
const SPREAD_LANE_SCALE_X = 0.78;
const SPREAD_LANE_MAX_X = 0.58;
const PARKED_DROP_CARD_POSITION = new THREE.Vector3(-0.42, 0.082, 0.88);
const CENTER_VISUALIZER_POSITION = new THREE.Vector3(0, 0.22, 0.02);
const CAMERA_CARD_POSITION = new THREE.Vector3(1.38, 0.72, 0.08);
const CAMERA_CARD_BASE_Y = 0.72;
const CAMERA_CARD_HOLD_Y = 0.92;
const CAMERA_CARD_PITCH = 1.04;
const CAMERA_CARD_ROLL = -0.025;
const CAMERA_CARD_WHEEL_STEP = 0.0042;
const CAMERA_CARD_MIC_WAVE_POINTS = 96;
const CAMERA_CARD_MIC_WAVE_WIDTH = CARD_WIDTH * 0.84;
const CAMERA_CARD_MIC_WAVE_HEIGHT = CARD_HEIGHT * 0.14;
const CAMERA_CARD_MIC_WAVE_Z = -CARD_HEIGHT * 0.36;
const CAMERA_CARD_MIC_PREAMP = 9.5;
const CAMERA_CARD_MIC_RECORD_GAIN = 4.2;
const CAMERA_CARD_MIC_NOISE_FLOOR = 0.0025;
const CAMERA_CARD_MIC_RESPONSE_CURVE = 0.56;
const CAMERA_CARD_TRANSCRIBE_CHUNK_MS = 6200;
const CAMERA_CARD_TRANSCRIBE_GAP_MS = 420;
const CAMERA_CARD_TRANSCRIBE_CAPTURE_GAP_MS = 48;
const CAMERA_CARD_TRANSCRIBE_QUEUE_LIMIT = 24;
const CAMERA_CARD_TRANSCRIBE_MIN_BYTES = 520;
const CAMERA_CARD_TRANSCRIBE_VOICE_LEVEL = 0.004;
const CAMERA_CARD_TRANSCRIBE_QUIET_POLL_MS = 180;
const CAMERA_CARD_TRANSCRIBE_FORCE_AFTER_QUIET_POLLS = 56;
const CAMERA_CARD_TRANSCRIBE_MODEL = "lightning:large-v3";
const CAMERA_CARD_TRANSCRIBE_SOURCE = "hapa-transcribe";
const CAMERA_CARD_TRANSCRIPT_JOURNAL_LIMIT = 24;
const CAMERA_CARD_SPEECH_BUBBLE_WIDTH = CARD_WIDTH * 1.22;
const CAMERA_CARD_SPEECH_BUBBLE_HEIGHT = CARD_HEIGHT * 0.48;
const CAMERA_CARD_SPEECH_BUBBLE_X = CARD_WIDTH * 1.08;
const CAMERA_CARD_SPEECH_BUBBLE_Z = -CARD_HEIGHT * 0.08;
const CAMERA_CARD_SHADER_DEFAULTS = Object.freeze({
  hapaAmount: 0.88,
  goldWarmth: 0.72,
  tealShadow: 0.58,
  inkLines: 0.55,
  goldEdges: 0.32,
  geometry: 0.22,
  grain: 0.28,
  skinProtect: 0.55,
  contrast: 0.38,
  bloomFake: 0.22,
  vignette: 0.42
});
const LYRIC_CRAWL_POSITION = new THREE.Vector3(0, 1.62, -0.34);
const LYRIC_CRAWL_WIDTH = 5.15;
const LYRIC_CRAWL_HEIGHT = 4.7;
const LYRIC_CRAWL_FALLBACK_SECONDS = 154;
const LYRIC_CRAWL_RENDER_ORDER = 1200;
const LYRIC_CRAWL_ANGLE_MIN_DEGREES = 20;
const LYRIC_CRAWL_ANGLE_MAX_DEGREES = 30;
const LYRIC_CRAWL_DEFAULT_ANGLE_DEGREES = 22;
const LYRIC_CRAWL_MAX_TIMED_LINE_CHARS = 92;
const LYRIC_CRAWL_MAX_TIMED_LINE_WORDS = 12;
const LYRIC_CRAWL_EARLY_END_RATIO = 0.86;
const LYRIC_CRAWL_END_PADDING_SECONDS = 3.5;
const HYPERSPACE_FREQUENCY_BINS = 64;
const SPAWN_NETWORK_CENTER = new THREE.Vector3(0.18, 1.84, -0.82);
const SPAWN_NETWORK_CARD_WIDTH = 0.58;
const SPAWN_NETWORK_CARD_HEIGHT = 0.88;
const SPAWN_NETWORK_HUB_SIZE = 0.64;
const SPAWN_NETWORK_MAX_CARDS = 10;

const CARD_BACK_STYLES = [
  { id: "tarot", label: "Tarot", accent: "#00f3ff", accentB: "#ff00ff", title: "HAPA", subtitle: "TAROT" },
  { id: "protocol", label: "Protocol", accent: "#00f3ff", accentB: "#f6c96d", title: "HAPA", subtitle: "PROTOCOL" },
  { id: "node", label: "Node", accent: "#4facfe", accentB: "#39ff14", title: "HAPA", subtitle: "NODE" },
  { id: "avatar", label: "Avatar", accent: "#ff00ff", accentB: "#9d74ff", title: "HAPA", subtitle: "AVATAR" }
];

const CARD_TYPE_BACKS = [
  { id: "skill", label: "Skills", pileIds: ["skill_card", "skill_tarot_card", "skill", "skills"], imageUri: "/media/mimi-card-shop-backs/skills.png", accent: "#ff7448" },
  { id: "protocol", label: "Protocols", pileIds: ["protocol_card", "protocol_tarot_card", "protocol", "protocols"], imageUri: "/media/mimi-card-shop-backs/protocols.png", accent: "#43b7ff" },
  { id: "capability", label: "Capabilities", pileIds: ["capability_card", "capability_tarot_card", "capability", "capabilities"], imageUri: "/media/mimi-card-shop-backs/capabilities.png", accent: "#45f2c8" },
  { id: "lore", label: "Lore", pileIds: ["lore_card", "lore_tarot_card", "lore"], imageUri: "/media/mimi-card-shop-backs/lore.png", accent: "#f6c96d" },
  { id: "garden", label: "Gardens", pileIds: ["garden_card", "garden_tarot_card", "gardens", "garden"], imageUri: "/media/mimi-card-shop-backs/gardens.png", accent: "#79f58f" },
  { id: "item", label: "Items", pileIds: ["item_card", "item_tarot_card", "items", "item"], imageUri: "/media/mimi-card-shop-backs/items.png", accent: "#58c8ff" },
  { id: "location", label: "Locations", pileIds: ["location_card", "location_tarot_card", "locations", "location"], imageUri: "/media/mimi-card-shop-backs/locations.png", accent: "#4facfe" },
  { id: "spell", label: "Spells", pileIds: ["spell_card", "spell_tarot_card", "spells", "spell"], imageUri: "/media/mimi-card-shop-backs/spells.png", accent: "#b48cff" },
  { id: "major_arcana", label: "Major Arcana", pileIds: ["major_arcana", "major_arcana_card"], imageUri: "/media/mimi-card-shop-backs/major-arcana.png", accent: "#f9d76e" },
  { id: "void_shadow", label: "Void / Shadow", pileIds: ["void_shadow", "void_shadow_card", "void", "shadow"], imageUri: "/media/mimi-card-shop-backs/void-shadow.png", accent: "#a472ff" },
  { id: "avatar", label: "Avatars", pileIds: ["avatar_tarot_card", "avatar_card", "avatar", "avatars"], imageUri: "/media/mimi-card-shop-backs/avatars.png", accent: "#00f3ff" },
  { id: "song", label: "Songs", pileIds: ["song_card", "song_cards", "hapa_song", "hapa_song_card", "music", "song", "songs"], imageUri: "/media/mimi-card-shop-backs/lore.png", accent: "#5ed7ff" },
  { id: "ship", label: "Ships", pileIds: ["ship_card", "ship_tarot_card", "ship", "ships"], imageUri: "/media/mimi-card-shop-backs/ships.png", accent: "#78e8ff" }
];

const MUSIC_VISUALIZER_MODES = [
  { id: "anomaly", label: "Anomaly" }
];

function leftLaneSlots(slots) {
  return slots.map(([x, y, z, rotationY]) => [
    THREE.MathUtils.clamp(x * SPREAD_LANE_SCALE_X + SPREAD_LANE_OFFSET_X, -BOARD_LIMIT_X, SPREAD_LANE_MAX_X),
    y,
    z,
    rotationY
  ]);
}

const LAYOUTS = [
  {
    id: "triad",
    label: "Triad",
    icon: Route,
    slots: leftLaneSlots([
      [-1.34, 0, -0.05, -0.08],
      [0, 0, -0.05, 0],
      [1.34, 0, -0.05, 0.08]
    ])
  },
  {
    id: "cross",
    label: "Cross",
    icon: Sparkles,
    slots: leftLaneSlots([
      [0, 0, 0, 0],
      [-1.46, 0, 0, -0.06],
      [1.46, 0, 0, 0.06],
      [0, 0, -1.64, 0],
      [0, 0, 1.64, Math.PI]
    ])
  },
  {
    id: "crown",
    label: "Crown",
    icon: Route,
    slots: leftLaneSlots(Array.from({ length: 7 }, (_, index) => {
      const t = index / 6;
      const x = THREE.MathUtils.lerp(-2.72, 2.72, t);
      const z = -0.05 - Math.sin(t * Math.PI) * 1.34;
      const rot = THREE.MathUtils.lerp(-0.42, 0.42, t);
      return [x, 0, z, rot];
    }))
  },
  {
    id: "grid",
    label: "Nine",
    icon: Grid3X3,
    slots: leftLaneSlots(Array.from({ length: 9 }, (_, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return [(col - 1) * 1.42, 0, (row - 1) * 1.66, (col - 1) * 0.035 + (row - 1) * 0.018];
    }))
  },
  {
    id: "orbit",
    label: "Orbit",
    icon: CircleDot,
    motion: "orbit",
    slots: leftLaneSlots(Array.from({ length: 7 }, (_, index) => {
      const angle = -Math.PI / 2 + (index / 7) * Math.PI * 2;
      const radiusX = index === 0 ? 0 : 2.18;
      const radiusZ = index === 0 ? 0 : 1.28;
      const x = index === 0 ? 0 : Math.cos(angle) * radiusX;
      const z = index === 0 ? 0 : Math.sin(angle) * radiusZ;
      return [x, 0, z, angle * 0.18];
    }))
  },
  {
    id: "wave",
    label: "Wave",
    icon: Waves,
    motion: "wave",
    slots: leftLaneSlots(Array.from({ length: 9 }, (_, index) => {
      const t = index / 8;
      const x = THREE.MathUtils.lerp(-2.88, 2.88, t);
      const z = Math.sin(t * Math.PI * 2) * 0.72;
      const rot = Math.cos(t * Math.PI * 2) * 0.18;
      return [x, 0, z, rot];
    }))
  }
];

function uniqueTarotProfileContacts(contacts = []) {
  const seen = new Set();
  return contacts.filter((contact) => {
    const key = contact?.id || contact?.name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prioritizeTarotProfileMedia(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.imageUri || item?.videoUri)
    .filter((item) => {
      const key = item.id || `${item.imageUri || ""}:${item.videoUri || ""}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      tarotProfileMediaPriority(b) - tarotProfileMediaPriority(a) ||
      String(a.label || a.kind || "").localeCompare(String(b.label || b.kind || ""))
    );
}

function tarotProfileMediaPriority(item = {}) {
  const hasImage = Boolean(item.imageUri);
  const hasLoop = Boolean(item.videoUri);
  return (hasImage && hasLoop ? 80 : hasLoop ? 64 : hasImage ? 32 : 0) + Number(item.priority || 0) * 0.01;
}

function buildTarotProfilePreloadSources(contacts = []) {
  const sources = [];
  const seen = new Set();
  const add = (kind, uri, keyHint = "") => {
    if (!uri) return;
    const key = `${kind}:${uri}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ kind, uri, key: keyHint || key });
  };
  uniqueTarotProfileContacts(contacts).slice(0, 2).forEach((contact) => {
    const profile = contact?.profile || {};
    const mediaWall = prioritizeTarotProfileMedia([
      {
        id: `${contact.id || contact.name || "avatar"}-hero`,
        imageUri: profile.heroImageUri || contact.portraitUri || profile.heroPosterUri || "",
        videoUri: profile.heroLoopUri || profile.heroVideoUri || "",
        posterUri: profile.heroPosterUri || profile.heroImageUri || contact.portraitUri || "",
        priority: 120
      },
      {
        id: `${contact.id || contact.name || "avatar"}-background`,
        imageUri: profile.backgroundPosterUri || profile.heroImageUri || contact.portraitUri || "",
        videoUri: profile.backgroundVideoUri || "",
        posterUri: profile.backgroundPosterUri || profile.heroPosterUri || "",
        priority: 96
      },
      ...(profile.mediaWall || [])
    ]);
    mediaWall.slice(0, 8).forEach((item, index) => {
      add("image", item.imageUri || item.posterUri, `${contact.id || contact.name || "avatar"}-image-${index}`);
      add("video", item.videoUri, `${contact.id || contact.name || "avatar"}-video-${index}`);
    });
  });
  return sources.slice(0, 18);
}

function titleizeTarotLabel(value = "") {
  return String(value || "")
    .replace(/_tarot_card$|_card$/i, "")
    .replace(/\s+Tarot\s+Card$|\s+Card$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function selectedCardFunctionalType(card = {}) {
  return titleizeTarotLabel(
    card.functionalType ||
      card.tarotIdentity?.functionalType ||
      card.typeDetails?.functionalType ||
      card.tarotCatalog?.typeLabel ||
      card.tarotMainType ||
      card.cardType ||
      "Tarot"
  );
}

function buildSelectedCardTypeDetails(card = {}) {
  if (!card?.tarotIdentity && !card?.typeDetails && !card?.cardFace) return null;
  const identity = card.tarotIdentity || {};
  const typeDetails = card.typeDetails || {};
  const cardFace = card.cardFace || {};
  const functionalType = selectedCardFunctionalType(card);
  const tarotType = card.tarotType || identity.tarotType || identity.tarotCardName || card.title;
  const rows = [
    tarotType ? ["Tarot", tarotType] : null,
    functionalType ? ["Type", functionalType] : null,
    identity.arcana ? ["Arcana", identity.arcana] : null,
    identity.suit ? ["Suit", identity.suit] : null,
    identity.rank ? ["Rank", identity.rank] : null,
    identity.romanNumeral ? ["Number", identity.romanNumeral] : null,
    identity.locationType ? ["Location", identity.locationType] : null,
    typeDetails.role ? ["Role", typeDetails.role] : null
  ].filter(Boolean);
  const notes = [
    cardFace.coreMeaning,
    cardFace.mechanicsText || typeDetails.command,
    ...(typeDetails.procedureFlow || []).slice(0, 3)
  ].filter(Boolean).slice(0, 4);
  return rows.length || notes.length ? {
    label: `${functionalType || "Tarot"} Card Details`,
    rows,
    notes
  } : null;
}

function formatSelectedCardValue(value) {
  if (Array.isArray(value)) return value.map(formatSelectedCardValue).filter(Boolean).join(" • ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, nextValue]) => {
        const formatted = formatSelectedCardValue(nextValue);
        return formatted ? `${titleizeTarotLabel(key)}: ${formatted}` : "";
      })
      .filter(Boolean)
      .join(" • ");
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pushSelectedCardRow(rows, label, value) {
  const formatted = formatSelectedCardValue(value);
  if (!formatted) return;
  const key = `${label}:${formatted}`.toLowerCase();
  if (rows.some((row) => row.key === key)) return;
  rows.push({ key, label, value: formatted });
}

function buildSelectedCardDetailRows(card = {}) {
  const rows = [];
  const identity = card.tarotIdentity || {};
  const catalog = card.tarotCatalog || {};
  const typeDetails = card.typeDetails || {};
  const attribution = card.tarotAttribution || {};
  const ocr = card.tarotOcr || {};
  pushSelectedCardRow(rows, "System", identity.systemName || "Hapa Tarot System");
  pushSelectedCardRow(rows, "Deck", identity.deckName || catalog.collectionTitle);
  pushSelectedCardRow(rows, "Tarot", identity.tarotType || identity.tarotCardName || card.tarotType || card.title);
  pushSelectedCardRow(rows, "Type", identity.cardTypeName || typeDetails.label || selectedCardFunctionalType(card));
  pushSelectedCardRow(rows, "Arcana", identity.arcana || card.archetype || catalog.family);
  pushSelectedCardRow(rows, "Suit", identity.suit);
  pushSelectedCardRow(rows, "Rank", identity.rank);
  pushSelectedCardRow(rows, "Number", identity.romanNumeral || identity.number || card.tarotNumber);
  pushSelectedCardRow(rows, "Collection", catalog.collectionId);
  pushSelectedCardRow(rows, "Artist", attribution.author || attribution.shop);
  pushSelectedCardRow(rows, "Canon", card.tarotLore?.canonStatus || attribution.rightsStatus);
  pushSelectedCardRow(rows, "OCR", ocr.confidence ? `${Math.round(Number(ocr.confidence) * 100)}% confidence` : "");
  return rows;
}

function pushSelectedCardSection(sections, label, value) {
  const text = formatSelectedCardValue(value);
  if (!text) return;
  const key = `${label}:${text.slice(0, 120)}`.toLowerCase();
  if (sections.some((section) => section.key === key)) return;
  sections.push({ key, label, text });
}

function buildSelectedCardTextSections(card = {}) {
  const face = card.cardFace || {};
  const mechanics = card.tarotMechanics || {};
  const lore = card.tarotLore || {};
  const typeDetails = card.typeDetails || {};
  const attribution = card.tarotAttribution || {};
  const sections = [];
  pushSelectedCardSection(sections, "Summary", card.summary || lore.summary);
  pushSelectedCardSection(sections, "Core Meaning", face.coreMeaning);
  pushSelectedCardSection(sections, "Upright", face.uprightText);
  pushSelectedCardSection(sections, "Inverted", face.invertedText);
  pushSelectedCardSection(sections, "Mechanics", face.mechanicsText || typeDetails.command || mechanics.broadGameMechanic || mechanics.deckUse);
  pushSelectedCardSection(sections, "Surface Use", mechanics.surfaceUse);
  pushSelectedCardSection(sections, "Relationship Use", mechanics.relationshipUse);
  pushSelectedCardSection(sections, "Skill Use", mechanics.skillUse);
  pushSelectedCardSection(sections, "Visual Language", face.visualLanguageText || lore.visualLanguage);
  pushSelectedCardSection(sections, "Protocol Teaching", lore.protocolTeaching);
  pushSelectedCardSection(sections, "Future Seed", lore.futureSeed);
  pushSelectedCardSection(sections, "Effects", mechanics.effects);
  pushSelectedCardSection(sections, "Limits", mechanics.limits);
  pushSelectedCardSection(sections, "Attribution", [
    attribution.shop,
    attribution.albumTitle,
    attribution.sourceTool,
    attribution.rightsStatus
  ].filter(Boolean));
  (face.sections || []).forEach((section) => {
    pushSelectedCardSection(sections, section.label || "Card Face", section.value || section.items);
  });
  return sections.slice(0, 14);
}

function buildSelectedCardImageSources(card = {}) {
  const sources = [];
  const add = (uri, label = "High-res image") => {
    if (!uri) return;
    const key = String(uri);
    if (sources.some((source) => source.uri === key)) return;
    sources.push({ uri: key, label });
  };
  add(card.highResImageUri, "High-res image");
  add(card.imageUri, "Static image");
  (card.tarotMediaLinks || []).forEach((link, index) => {
    add(link.imageUri, index === 0 ? "Linked still" : `Linked still ${index + 1}`);
    add(link.posterUri, index === 0 ? "Video frame" : `Video frame ${index + 1}`);
  });
  add(card.posterUri, "Poster frame");
  (card.videoSources || []).forEach((source, index) => add(source.posterUri, index === 0 ? "Loop frame" : `Loop frame ${index + 1}`));
  return sources;
}

function clampSelectedCardZoom(value) {
  return Math.round(THREE.MathUtils.clamp(Number(value) || 1, TAROT_DETAIL_ZOOM_MIN, TAROT_DETAIL_ZOOM_MAX) * 100) / 100;
}

function clampLyricCrawlAngleDegrees(value) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : LYRIC_CRAWL_DEFAULT_ANGLE_DEGREES;
  return Math.round(THREE.MathUtils.clamp(safeValue, LYRIC_CRAWL_ANGLE_MIN_DEGREES, LYRIC_CRAWL_ANGLE_MAX_DEGREES));
}

function echoDirectorSongIdForCard(card = {}) {
  if (!card || typeof card !== "object") return "";
  const candidates = [
    card.sourceSongId,
    card.songId,
    card.song_id,
    card.sourceSongCardId,
    ...(card.songLinks || []).flatMap((song) => [
      song.cardId,
      song.songCardId,
      song.song_card_id,
      song.id,
      song.songId,
      song.song_id
    ])
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const direct = candidates.find((value) => value.startsWith("dear-papa-song-")) || candidates[0] || "";
  if (direct) return direct;
  const cardId = String(card.id || "").trim();
  if (cardId.startsWith("song-card-dear-papa-song-")) return cardId.replace(/^song-card-/, "");
  return "";
}

function normalizeEchoDirectorProjectPayload(payload = null) {
  const project = payload?.music_video_project || payload?.project?.music_video_project || payload;
  if (!project?.song_id) return null;
  return project;
}

function echoDirectorProjectForCard(card = {}) {
  if (!card || typeof card !== "object") return null;
  const candidates = [
    card.echoDirectorProject,
    card.echoDirector,
    card.musicVideoProject,
    card.music_video_project,
    card.directorProject,
    card.songDirectorProject,
    ...(card.songLinks || []).flatMap((song) => [
      song?.echoDirectorProject,
      song?.musicVideoProject,
      song?.music_video_project,
      song?.directorProject
    ])
  ];
  return candidates.map(normalizeEchoDirectorProjectPayload).find(Boolean) || null;
}

export default function TarotDraw3DView({ cards = [], avatarName = "Hapa", apiBase = "", soundEnabled = false, productionAudit = null, onResolveEchoProject, onSelectAvatarProfile }) {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const readingRequestRef = useRef(0);
  const readingEnabledRef = useRef(false);
  const baseTarotPiles = useMemo(() => buildTarotPileSummaries(cards), [cards]);
  const [reading, setReading] = useState({ status: "idle" });
  const [readingEnabled, setReadingEnabled] = useState(false);
  const [readingPanelVisible, setReadingPanelVisible] = useState(false);
  const [miniMode, setMiniMode] = useState(false);
  const [cinematicMode, setCinematicMode] = useState(false);
  const [initError, setInitError] = useState(null);
  const [selectedCardImageZoom, setSelectedCardImageZoom] = useState(1);
  const [selectedCardImageIndex, setSelectedCardImageIndex] = useState(0);
  const [cameraJournalVisible, setCameraJournalVisible] = useState(false);
  const [hud, setHud] = useState({
    status: "Preparing table",
    deckCount: cards.length,
    placedCount: 0,
    heldTitle: "",
    focusTitle: "",
    focusContacts: [],
    selectedCard: null,
    selectedDetailsOpen: false,
    selectedFocusProgress: 0,
    cardDetailTarget: null,
    layoutId: LAYOUTS[0].id,
    backStyle: CARD_BACK_STYLES[0].id,
    musicVisualizerMode: MUSIC_VISUALIZER_MODES[0].id,
    centerVisualizerEnabled: false,
    backgroundVisualizerEnabled: false,
    videoBackgroundKeying: false,
    echoShadersEnabled: true,
    lyricsEnabled: true,
    cameraCardEnabled: false,
    cameraCardShaderEnabled: false,
    cameraCardMicEnabled: false,
    cameraCardMicPending: false,
    cameraCardMicError: "",
    cameraCardMicLevel: 0,
    cameraCardTranscriptionEnabled: false,
    cameraCardTranscriptionPending: false,
    cameraCardTranscriptionCapturing: false,
    cameraCardTranscriptionInFlight: false,
    cameraCardTranscriptionQueueDepth: 0,
    cameraCardTranscriptionDropped: 0,
    cameraCardTranscriptionError: "",
    cameraCardTranscript: "",
    cameraCardTranscriptionNotice: "",
    cameraCardTranscriptionLastResult: null,
    cameraCardTranscriptionJournal: [],
    cameraCardPending: false,
    cameraCardError: "",
    lyricCrawlAngleDegrees: LYRIC_CRAWL_DEFAULT_ANGLE_DEGREES,
    playing: true,
    audioReady: false,
    piles: [],
    dropZoneCard: null,
    spawnNetwork: { kind: "", count: 0, avatarName: "" },
    renderer: { calls: 0, triangles: 0, geometries: 0, textures: 0 }
  });
  const selectedCard = hud.selectedCard || null;
  const selectedCardKey = selectedCard?.id || selectedCard?.title || "";
  const selectedDetailsOpen = Boolean(hud.selectedDetailsOpen);
  const cardDetailTarget = hud.cardDetailTarget || null;
  const selectedContacts = selectedCard?.avatarContacts || [];
  const dropZoneCard = hud.dropZoneCard || null;
  const dropZoneEchoSongId = useMemo(() => echoDirectorSongIdForCard(dropZoneCard), [dropZoneCard]);
  const dropZoneContacts = dropZoneCard?.avatarContacts || [];
  const dropZoneEmbeddedEchoProject = useMemo(() => echoDirectorProjectForCard(dropZoneCard), [dropZoneCard]);
  const profileContacts = uniqueTarotProfileContacts([...selectedContacts, ...dropZoneContacts]);
  const profileContactIds = profileContacts.map((contact) => contact.id || contact.name).join("|");
  const dropZonePrimaryContact = dropZoneContacts[0] || null;
  const spawnNetwork = hud.spawnNetwork || { kind: "", count: 0, avatarName: "" };
  const cameraJournalEntries = hud.cameraCardTranscriptionJournal || [];
  const cameraTranscriptionQueueDepth = Number(hud.cameraCardTranscriptionQueueDepth || 0);
  const cameraJournalStatus = hud.cameraCardTranscriptionError ||
    (hud.cameraCardTranscriptionCapturing
      ? `recording${cameraTranscriptionQueueDepth ? `, ${cameraTranscriptionQueueDepth} queued` : ""}`
      : hud.cameraCardTranscriptionInFlight
        ? `transcribing${cameraTranscriptionQueueDepth ? `, ${cameraTranscriptionQueueDepth} queued` : ""}`
        : hud.cameraCardTranscriptionNotice || "ready");
  const tarotPiles = hud.piles?.length ? hud.piles : baseTarotPiles;
  const cardBackPiles = useMemo(() => buildCardBackPileControls(tarotPiles), [tarotPiles]);
  const selectedStats = selectedCard ? Object.entries(selectedCard.stats || {}).filter(([, value]) => value !== undefined && value !== null && value !== "") : [];
  const selectedKeywords = selectedCard ? (selectedCard.keywords || []).slice(0, 5) : [];
  const selectedTypeDetails = selectedCard ? buildSelectedCardTypeDetails(selectedCard) : null;
  const selectedCardDetailRows = useMemo(() => selectedCard ? buildSelectedCardDetailRows(selectedCard) : [], [selectedCard]);
  const selectedCardTextSections = useMemo(() => selectedCard ? buildSelectedCardTextSections(selectedCard) : [], [selectedCard]);
  const selectedCardImageSources = useMemo(() => selectedCard ? buildSelectedCardImageSources(selectedCard) : [], [selectedCard]);
  const selectedCardImage = selectedCardImageSources[Math.min(selectedCardImageIndex, Math.max(selectedCardImageSources.length - 1, 0))] || null;
  const selectedCardZoomPercent = Math.round(selectedCardImageZoom * 100);
  const hasReading = reading.status !== "idle";
  const [profileContact, setProfileContact] = useState(null);
  const activeProfileContact = profileContact && profileContacts.some((contact) => contact.id === profileContact.id)
    ? profileContacts.find((contact) => contact.id === profileContact.id) || profileContact
    : null;
  const activeProfileMediaWall = useMemo(
    () => prioritizeTarotProfileMedia(activeProfileContact?.profile?.mediaWall || []),
    [activeProfileContact]
  );
  const activeProfileMotionMedia = useMemo(
    () => activeProfileMediaWall.filter((item) => item.videoUri),
    [activeProfileMediaWall]
  );
  const activeProfileDisplayMedia = useMemo(
    () => activeProfileMediaWall.filter((item) => item.imageUri || item.videoUri),
    [activeProfileMediaWall]
  );
  const activeProfileRelationshipCards = activeProfileContact?.profile?.relationshipTarotCards || [];
  const activeProfileSkillCards = activeProfileContact?.profile?.skillCards || [];
  const activeProfileHeroMedia = activeProfileDisplayMedia.find((item) => item.imageUri && item.videoUri) ||
    activeProfileDisplayMedia.find((item) => item.videoUri) ||
    activeProfileDisplayMedia.find((item) => item.imageUri) ||
    null;
  const profileHeroImageUri = activeProfileContact?.profile?.heroImageUri ||
    activeProfileHeroMedia?.imageUri ||
    activeProfileHeroMedia?.posterUri ||
    activeProfileContact?.portraitUri ||
    "";
  const profileHeroLoopUri = activeProfileContact?.profile?.heroLoopUri ||
    activeProfileHeroMedia?.videoUri ||
    activeProfileContact?.profile?.heroVideoUri ||
    "";
  const profileHeroPosterUri = activeProfileContact?.profile?.heroPosterUri ||
    activeProfileHeroMedia?.posterUri ||
    profileHeroImageUri ||
    "";
  const profileBackdropVideoUri = activeProfileContact?.profile?.backgroundVideoUri ||
    activeProfileContact?.profile?.heroVideoUri ||
    activeProfileMotionMedia[0]?.videoUri ||
    "";
  const dropZoneProfilePreloadSources = useMemo(
    () => buildTarotProfilePreloadSources(dropZoneContacts),
    [dropZoneContacts]
  );

  const handleReadingRequest = useCallback(async (payload) => {
    if (!readingEnabledRef.current) return;
    const requestId = readingRequestRef.current + 1;
    readingRequestRef.current = requestId;
    if (!payload?.cards?.length) {
      setReading({ status: "idle" });
      return;
    }
    setReading({
      status: "loading",
      title: `${payload.avatarName || avatarName} ${payload.layoutName || "Tarot"} Mirror`,
      sourceLabel: "Consulting Valen",
      cards: payload.cards
    });
    const result = await queryValenTarotReading(payload);
    if (readingRequestRef.current === requestId) setReading(result);
  }, [avatarName]);

  const handleReadingClear = useCallback(() => {
    readingRequestRef.current += 1;
    setReading({ status: "idle" });
  }, []);

  useEffect(() => {
    readingEnabledRef.current = readingEnabled;
  }, [readingEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let game = null;
    try {
      setInitError(null);
      game = createTarotDrawGame({
        canvas,
        cards,
        avatarName,
        apiBase,
        productionAudit,
        soundEnabled,
        onHud: setHud,
        onReadingRequest: handleReadingRequest,
        onReadingClear: handleReadingClear
      });
      gameRef.current = game;
      game.start();
    } catch (error) {
      console.error("Tarot draw setup failed", error);
      setInitError(error);
      game?.dispose?.();
      gameRef.current = null;
      return undefined;
    }
    return () => {
      game.dispose();
      if (gameRef.current === game) gameRef.current = null;
    };
  }, [cards, avatarName, apiBase, productionAudit, handleReadingClear, handleReadingRequest]);

  useEffect(() => {
    gameRef.current?.setSoundEnabled?.(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    let cancelled = false;
    if (dropZoneEmbeddedEchoProject) {
      gameRef.current?.setEchoDirectorProject?.(dropZoneEmbeddedEchoProject);
    }
    if (!dropZoneEchoSongId || typeof onResolveEchoProject !== "function") {
      if (!dropZoneEmbeddedEchoProject) gameRef.current?.setEchoDirectorProject?.(null);
      return () => {
        cancelled = true;
      };
    }
    if (!dropZoneEmbeddedEchoProject) gameRef.current?.setEchoDirectorProject?.(null);
    onResolveEchoProject(dropZoneEchoSongId)
      .then((payload) => {
        if (cancelled) return;
        gameRef.current?.setEchoDirectorProject?.(normalizeEchoDirectorProjectPayload(payload) || dropZoneEmbeddedEchoProject || null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Failed to load Echo director project for Tarot Draw song card", error);
        gameRef.current?.setEchoDirectorProject?.(dropZoneEmbeddedEchoProject || null);
      });
    return () => {
      cancelled = true;
    };
  }, [dropZoneEchoSongId, dropZoneEmbeddedEchoProject, onResolveEchoProject]);

  useEffect(() => {
    if (!profileContact) return;
    if (!profileContacts.some((contact) => contact.id === profileContact.id)) setProfileContact(null);
  }, [profileContact, profileContactIds]);

  useEffect(() => {
    setSelectedCardImageZoom(1);
    setSelectedCardImageIndex(0);
  }, [selectedCardKey, selectedDetailsOpen]);

  useEffect(() => {
    if (selectedCardImageSources.length && selectedCardImageIndex >= selectedCardImageSources.length) setSelectedCardImageIndex(0);
  }, [selectedCardImageIndex, selectedCardImageSources.length]);

  useEffect(() => {
    if (!cinematicMode) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setCinematicMode(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cinematicMode]);

  useEffect(() => {
    if (!profileContact) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setProfileContact(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [profileContact]);

  function callGame(action, ...args) {
    try {
      return gameRef.current?.[action]?.(...args);
    } catch (error) {
      console.error(`Tarot draw action failed: ${action}`, error);
      setInitError(error);
      return undefined;
    }
  }

  function run(action) {
    return () => callGame(action);
  }

  function drawFromPile(pileId) {
    callGame("drawFromPile", pileId);
  }

  function autoDealInstantStart() {
    if (!TAROT_AUTO_DEAL_ENABLED) return undefined;
    callGame("autoDealInstantStart");
  }

  function spawnMusicSlotCards(kind, contact = activeProfileContact || dropZonePrimaryContact) {
    const cardsToSpawn = kind === "skill"
      ? contact?.profile?.skillCards || []
      : contact?.profile?.relationshipTarotCards || [];
    callGame("spawnMusicSlotCards", {
      kind,
      avatar: contact,
      cards: cardsToSpawn
    });
  }

  function wipeSpawnedCards() {
    callGame("wipeSpawnedCards");
  }

  function useSpawnedCardsOnSurface() {
    callGame("useSpawnedCardsOnSurface");
  }

  function toggleVideoBackgroundKeying() {
    callGame("setVideoBackgroundKeying", !hud.videoBackgroundKeying);
  }

  function toggleCameraCard() {
    callGame("setCameraCardEnabled", !hud.cameraCardEnabled);
  }

  function toggleCameraCardShader() {
    callGame("setCameraCardShaderEnabled", !hud.cameraCardShaderEnabled);
  }

  function toggleCameraCardMic() {
    callGame("setCameraCardMicEnabled", !hud.cameraCardMicEnabled);
  }

  function toggleCameraCardTranscription() {
    callGame("setCameraCardTranscriptionEnabled", !hud.cameraCardTranscriptionEnabled);
  }

  function toggleCameraJournal() {
    setCameraJournalVisible((value) => !value);
  }

  function clearCameraCardJournal() {
    callGame("clearCameraCardJournal");
  }

  function toggleLyrics() {
    callGame("setLyricsEnabled", !hud.lyricsEnabled);
  }

  function toggleEchoShaders() {
    callGame("setEchoShadersEnabled", !hud.echoShadersEnabled);
  }

  function setLyricCrawlAngleFromInput(event) {
    callGame("setLyricCrawlAngleDegrees", Number(event.target.value));
  }

  function toggleCenterVisualizer() {
    callGame("setCenterVisualizerEnabled", !hud.centerVisualizerEnabled);
  }

  function toggleBackgroundVisualizer() {
    callGame("setBackgroundVisualizerEnabled", !hud.backgroundVisualizerEnabled);
  }

  function toggleReading() {
    const nextEnabled = !readingEnabledRef.current;
    readingEnabledRef.current = nextEnabled;
    setReadingEnabled(nextEnabled);
    setReadingPanelVisible(nextEnabled);
    if (nextEnabled) {
      callGame("requestReadingNow", "user-toggle");
      return;
    }
    readingRequestRef.current += 1;
    setReading({ status: "idle" });
  }

  function toggleDropZoneProfile() {
    if (!dropZonePrimaryContact) return;
    setProfileContact((current) => current?.id === dropZonePrimaryContact.id ? null : dropZonePrimaryContact);
  }

  function toggleSelectedCardDetails(event) {
    event?.stopPropagation?.();
    callGame("toggleSelectedDetails");
  }

  function openCardDetailTarget(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    callGame("openDetailTarget");
  }

  function clearCardDetailTarget(event) {
    event?.stopPropagation?.();
    callGame("clearHoverTarget");
  }

  function closeSelectedCardDetails(event) {
    event?.stopPropagation?.();
    if (selectedDetailsOpen) callGame("toggleSelectedDetails");
  }

  function handleSelectedCardDetailsWheel(event) {
    if (!selectedCard) return;
    event.preventDefault();
    event.stopPropagation();
    callGame("focusSelectedByWheel", event.deltaY || 0);
  }

  function adjustSelectedCardImageZoom(delta) {
    setSelectedCardImageZoom((current) => clampSelectedCardZoom(current + delta));
  }

  function setSelectedCardImageZoomFromInput(event) {
    setSelectedCardImageZoom(clampSelectedCardZoom(Number(event.target.value)));
  }

  function resetSelectedCardImageZoom() {
    setSelectedCardImageZoom(1);
  }

  function selectSelectedCardImage(index) {
    setSelectedCardImageIndex(index);
    setSelectedCardImageZoom(1);
  }

  function handleSelectedCardImageWheel(event) {
    if (!selectedCardImage) return;
    event.preventDefault();
    event.stopPropagation();
    adjustSelectedCardImageZoom(event.deltaY < 0 ? 0.14 : -0.14);
  }

  function playProfileMediaLoop(event) {
    const video = event.currentTarget.querySelector("video");
    if (video) video.play().catch(() => {});
  }

  function pauseProfileMediaLoop(event) {
    const video = event.currentTarget.querySelector("video");
    if (!video) return;
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Some media elements cannot seek until metadata is available.
    }
  }

  return (
    <section
      className={`tarot-draw-view${miniMode ? " is-mini" : ""}${cinematicMode ? " is-cinematic" : ""}`}
      data-reading-visible={hasReading && readingPanelVisible ? "true" : "false"}
      data-selected={selectedCard ? "true" : "false"}
      data-cinematic={cinematicMode ? "true" : "false"}
      aria-label="3D Tarot Draw"
    >
      <canvas ref={canvasRef} aria-label="Interactive 3D tarot draw table" />
      {dropZoneProfilePreloadSources.length > 0 && (
        <div className="tarot-avatar-profile-preload" aria-hidden="true">
          {dropZoneProfilePreloadSources.map((source) => source.kind === "video" ? (
            <video key={source.key} src={source.uri} muted playsInline preload="metadata" />
          ) : (
            <img key={source.key} src={source.uri} alt="" loading="eager" decoding="async" />
          ))}
        </div>
      )}
      {initError && (
        <div className="tarot-draw-error hapa-panel" data-variant="notch" role="alert">
          <p className="eyebrow">3D Tarot Draw</p>
          <h2>Tarot table paused</h2>
          <span>{initError.message || "The 3D table could not start. Check the console for details."}</span>
        </div>
      )}
      <div className="tarot-draw-hud" aria-live="polite">
        <div className="tarot-draw-title">
          <p className="eyebrow">3D Tarot Draw</p>
          <h2>{avatarName} Spread</h2>
          <span>{hud.status}</span>
        </div>
        <div className="tarot-draw-readouts">
          <span><strong>{hud.deckCount}</strong><em>Deck</em></span>
          <span><strong>{hud.placedCount}</strong><em>Placed</em></span>
          <span><strong>{hud.focusTitle || hud.heldTitle || "None"}</strong><em>Focus</em></span>
          <span><strong>{productionAudit?.imageOnlyCount || 0}</strong><em>Image-only hidden</em></span>
        </div>
      </div>

      {cameraJournalVisible && (
        <aside className="tarot-camera-journal hapa-panel" data-variant="notch" aria-live="polite">
          <header>
            <span>
              <BookOpenCheck size={14} />
              Camera Journal
            </span>
            <button
              className="hapa-btn"
              type="button"
              onClick={clearCameraCardJournal}
              disabled={!cameraJournalEntries.length}
              title="Clear Camera Card transcript history"
            >
              Clear
            </button>
          </header>
          <div className="tarot-camera-journal-status">
            <strong>{hud.cameraCardTranscriptionEnabled ? CAMERA_CARD_TRANSCRIBE_MODEL : "Paused"}</strong>
            <em>{cameraJournalStatus}</em>
          </div>
          <div className="tarot-camera-journal-list">
            {cameraJournalEntries.length ? cameraJournalEntries.map((entry) => (
              <article key={entry.id}>
                <time dateTime={entry.createdAt}>{entry.time}</time>
                <p>{entry.text}</p>
                <span>{entry.model || CAMERA_CARD_TRANSCRIBE_MODEL}</span>
              </article>
            )) : (
              <p className="tarot-camera-journal-empty">Listening for the first entry.</p>
            )}
          </div>
        </aside>
      )}

      <div className="tarot-draw-controls hapa-panel" data-variant="notch">
        <div className="tarot-control-actions" aria-label="Deck actions">
          <button className="hapa-btn" data-intent="primary" type="button" onClick={run("shuffle")}>
            <Shuffle size={14} />
            Shuffle
          </button>
          <button className="hapa-btn" data-intent="warning" type="button" onClick={run("draw")}>
            <Sparkles size={14} />
            Draw
          </button>
	          {TAROT_AUTO_DEAL_ENABLED && (
	            <button className="hapa-btn tarot-auto-deal" data-intent="primary" type="button" onClick={autoDealInstantStart}>
	              <Grid3X3 size={14} />
	              Auto Deal
	            </button>
	          )}
          <button className="hapa-btn" type="button" onClick={run("togglePlaying")}>
            {hud.playing ? <Pause size={14} /> : <Play size={14} />}
            {hud.playing ? "Pause" : "Play"}
          </button>
          <button className="hapa-btn" type="button" onClick={run("clear")}>
            <RefreshCw size={14} />
            Clear
          </button>
          <button className="hapa-btn tarot-mini-toggle" type="button" aria-pressed={miniMode} onClick={() => setMiniMode((value) => !value)}>
            {miniMode ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            {miniMode ? "Full" : "Mini"}
          </button>
          <button
            className="hapa-btn tarot-reading-toggle"
            type="button"
            aria-label={readingEnabled ? "Turn tarot reading off" : "Ask for tarot reading"}
            aria-pressed={readingEnabled}
            data-has-reading={hasReading ? "true" : "false"}
            data-reading-enabled={readingEnabled ? "true" : "false"}
            onClick={toggleReading}
            title={readingEnabled ? "Turn tarot reading off" : "Ask Valen to read the current spread"}
          >
            <BookOpenCheck size={14} />
            {readingEnabled ? "Reading On" : "Ask Reading"}
          </button>
          <button
            className="hapa-btn tarot-cinematic-toggle"
            type="button"
            aria-pressed={cinematicMode}
            onClick={() => setCinematicMode((value) => !value)}
            title={cinematicMode ? "Exit cinematic mode" : "Hide tarot UI for cinematic viewing"}
          >
            <Maximize2 size={14} />
            Cinematic
          </button>
          <button
            className="hapa-btn tarot-music-viz-toggle tarot-center-viz-toggle"
            type="button"
            aria-pressed={Boolean(hud.centerVisualizerEnabled)}
            data-viz="center"
            onClick={toggleCenterVisualizer}
            title={hud.centerVisualizerEnabled ? "Turn the middle music visualizer off" : "Turn the middle music visualizer on"}
          >
            <Waves size={14} />
            Mid {hud.centerVisualizerEnabled ? "On" : "Off"}
          </button>
          <button
            className="hapa-btn tarot-music-viz-toggle tarot-bg-viz-toggle"
            type="button"
            aria-pressed={Boolean(hud.backgroundVisualizerEnabled)}
            data-viz="background"
            onClick={toggleBackgroundVisualizer}
            title={hud.backgroundVisualizerEnabled ? "Turn the background hyperspace visualizer off" : "Turn the background hyperspace visualizer on"}
          >
            <Waves size={14} />
            BG {hud.backgroundVisualizerEnabled ? "On" : "Off"}
          </button>
          <button
            className="hapa-btn tarot-lyrics-toggle"
            type="button"
            aria-pressed={Boolean(hud.lyricsEnabled)}
            onClick={toggleLyrics}
            title={hud.lyricsEnabled ? "Hide lyrics on the table and Echo preview" : "Show lyrics on the table and Echo preview"}
          >
            <ListChecks size={14} />
            Lyrics {hud.lyricsEnabled ? "On" : "Off"}
          </button>
          <button
            className="hapa-btn tarot-echo-shader-toggle"
            type="button"
            aria-pressed={Boolean(hud.echoShadersEnabled)}
            onClick={toggleEchoShaders}
            title={hud.echoShadersEnabled ? "Hide Echo Album shader overlays" : "Show Echo Album shader overlays"}
          >
            <Sparkles size={14} />
            Shaders {hud.echoShadersEnabled ? "On" : "Off"}
          </button>
          <button
            className="hapa-btn tarot-video-key-toggle"
            type="button"
            aria-pressed={hud.videoBackgroundKeying}
            onClick={toggleVideoBackgroundKeying}
            title={hud.videoBackgroundKeying ? "Keep video backgrounds opaque" : "Trace edge matte for pale video backgrounds"}
          >
            <Sparkles size={14} />
            Cutout
          </button>
          <button
            className="hapa-btn tarot-camera-card-toggle"
            type="button"
            aria-pressed={Boolean(hud.cameraCardEnabled)}
            data-pending={hud.cameraCardPending ? "true" : "false"}
            onClick={toggleCameraCard}
            title={hud.cameraCardError ? `Camera Card blocked: ${hud.cameraCardError}` : hud.cameraCardEnabled ? "Remove the live webcam card and release the camera" : "Create a live webcam card in the 3D space"}
          >
            <Camera size={14} />
            {hud.cameraCardPending ? "Camera..." : hud.cameraCardError ? "Camera Blocked" : `Camera ${hud.cameraCardEnabled ? "On" : "Card"}`}
          </button>
          <button
            className="hapa-btn tarot-camera-shader-toggle"
            type="button"
            aria-pressed={Boolean(hud.cameraCardShaderEnabled)}
            onClick={toggleCameraCardShader}
            title={hud.cameraCardShaderEnabled ? "Turn Hapa Grade off on the Camera Card" : "Apply Hapa Grade to the Camera Card"}
          >
            <Sparkles size={14} />
            Grade {hud.cameraCardShaderEnabled ? "On" : "Off"}
          </button>
          <button
            className="hapa-btn tarot-camera-mic-toggle"
            type="button"
            aria-pressed={Boolean(hud.cameraCardMicEnabled)}
            data-pending={hud.cameraCardMicPending ? "true" : "false"}
            onClick={toggleCameraCardMic}
            title={hud.cameraCardMicError ? `Mic blocked: ${hud.cameraCardMicError}` : hud.cameraCardMicEnabled ? "Turn off the Camera Card microphone waveform" : "Turn on microphone waveform for the Camera Card"}
          >
            <Mic size={14} />
            {hud.cameraCardMicPending ? "Mic..." : hud.cameraCardMicError ? "Mic Blocked" : `Mic ${hud.cameraCardMicEnabled ? "On" : "Off"}`}
          </button>
          <button
            className="hapa-btn tarot-camera-transcribe-toggle"
            type="button"
            aria-pressed={Boolean(hud.cameraCardTranscriptionEnabled)}
            data-pending={hud.cameraCardTranscriptionPending ? "true" : "false"}
            onClick={toggleCameraCardTranscription}
            title={hud.cameraCardTranscriptionError ? `Hapa Transcribe blocked: ${hud.cameraCardTranscriptionError}` : hud.cameraCardTranscriptionEnabled ? "Stop continuous large-v3 transcription from the Camera Card microphone" : "Start continuous large-v3 transcription from the Camera Card microphone"}
          >
            <Mic size={14} />
            {hud.cameraCardTranscriptionPending ? "Dictating..." : hud.cameraCardTranscriptionError ? "Dictate Err" : `Dictate ${hud.cameraCardTranscriptionEnabled ? "On" : "Off"}`}
          </button>
          <button
            className="hapa-btn tarot-camera-journal-toggle"
            type="button"
            aria-pressed={cameraJournalVisible}
            onClick={toggleCameraJournal}
            title={cameraJournalVisible ? "Hide the full Camera Card transcript journal" : "Show the full Camera Card transcript journal"}
          >
            <BookOpenCheck size={14} />
            Journal {cameraJournalVisible ? "On" : "Off"}
          </button>
        </div>
        <div className="tarot-control-grid">
          <div className="tarot-control-group tarot-lyric-angle-control" aria-label="Lyrics angle">
            <span><strong>Lyrics</strong><em>Angle</em></span>
            <input
              type="range"
              min={LYRIC_CRAWL_ANGLE_MIN_DEGREES}
              max={LYRIC_CRAWL_ANGLE_MAX_DEGREES}
              step="1"
              value={clampLyricCrawlAngleDegrees(hud.lyricCrawlAngleDegrees)}
              disabled={!hud.lyricsEnabled}
              onChange={setLyricCrawlAngleFromInput}
              aria-label="Lyric crawl angle"
            />
            <output>{clampLyricCrawlAngleDegrees(hud.lyricCrawlAngleDegrees)}°</output>
          </div>
          <div className="tarot-control-group tarot-card-back-controls" aria-label="Card type backs">
            {cardBackPiles.map((pile) => (
              <button
                className={pile.count > 0 ? "" : "is-empty"}
                key={pile.id}
                type="button"
                disabled={!pile.count || !pile.pileId}
                onClick={() => drawFromPile(pile.pileId)}
                style={{ "--back-accent": pile.accent }}
                title={pile.count ? `Deal ${pile.activeLabel}` : `${pile.label} pile empty`}
              >
                <span className="tarot-card-back-thumb" aria-hidden="true">
                  <span>{pile.label.slice(0, 2).toUpperCase()}</span>
                </span>
                <span className="tarot-card-back-meta">
                  <strong>{pile.label}</strong>
                  <em>{pile.count}</em>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {dropZonePrimaryContact && (
        <button
          className="tarot-drop-profile-toggle hapa-panel"
          data-variant="notch"
          type="button"
          aria-pressed={activeProfileContact?.id === dropZonePrimaryContact.id}
          onClick={toggleDropZoneProfile}
          onPointerDown={(event) => event.stopPropagation()}
          title={`Open ${dropZonePrimaryContact.name} Avatar Card from the music slot`}
        >
          {dropZonePrimaryContact.portraitUri ? <img src={dropZonePrimaryContact.portraitUri} alt="" loading="lazy" /> : <UserRound size={16} />}
          <span>
            <strong>Music Slot Avatar</strong>
            <em>{dropZonePrimaryContact.name} / {dropZoneCard?.title || "Locked card"}</em>
          </span>
        </button>
      )}

      {cardDetailTarget && !selectedDetailsOpen && (
        <button
          className="tarot-card-detail-target hapa-panel"
          data-variant="notch"
          type="button"
          aria-label={`Open ${cardDetailTarget.title} Card Details`}
          style={{ left: `${cardDetailTarget.x}px`, top: `${cardDetailTarget.y}px` }}
          onClick={openCardDetailTarget}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerEnter={(event) => event.stopPropagation()}
          onPointerLeave={clearCardDetailTarget}
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          title={`Open ${cardDetailTarget.title} Card Details`}
        >
          <BookOpenCheck size={15} />
          <span>Details</span>
        </button>
      )}

      {selectedCard && selectedDetailsOpen && (
        <aside
          className="tarot-card-detail-panel hapa-panel"
          data-variant="notch"
          data-focus={hud.selectedFocusProgress > CARD_FOCUS_OPEN_THRESHOLD ? "near" : "selected"}
          role="dialog"
          aria-label={`${selectedCard.title} Tarot Card Details`}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <header className="tarot-card-detail-header">
            <span><BookOpenCheck size={14} /> {selectedCardFunctionalType(selectedCard)} Card Details</span>
            <button className="hapa-btn" type="button" aria-label="Close tarot card details" onClick={closeSelectedCardDetails}>
              <X size={14} />
            </button>
          </header>
          <div className="tarot-card-detail-body">
            <section className="tarot-card-detail-visual" aria-label={`${selectedCard.title} high resolution image viewer`}>
              <div
                className="tarot-card-detail-stage"
                data-zoomed={selectedCardImageZoom > 1.05 ? "true" : "false"}
                onWheel={handleSelectedCardImageWheel}
              >
                {selectedCardImage ? (
                  <img
                    src={selectedCardImage.uri}
                    alt={`${selectedCard.title} high resolution tarot card`}
                    loading="eager"
                    draggable="false"
                    style={{ width: `${selectedCardImageZoom * 100}%` }}
                  />
                ) : selectedCard.videoUri ? (
                  <video key={`${selectedCard.id}-detail-loop`} src={selectedCard.videoUri} poster={selectedCard.posterUri || undefined} autoPlay muted loop playsInline preload="metadata" />
                ) : (
                  <UserRound size={52} />
                )}
                <span className="tarot-card-detail-stage-badge">{selectedCardImage?.label || selectedCard.tarotNumber || selectedCard.archetype || "HAPA"}</span>
              </div>
              <div className="tarot-card-detail-zoom-controls" aria-label="Card image zoom controls">
                <button type="button" onClick={() => adjustSelectedCardImageZoom(-TAROT_DETAIL_ZOOM_STEP)} aria-label="Zoom card image out">
                  <Minimize2 size={14} />
                </button>
                <input
                  type="range"
                  min={TAROT_DETAIL_ZOOM_MIN}
                  max={TAROT_DETAIL_ZOOM_MAX}
                  step="0.05"
                  value={selectedCardImageZoom}
                  onChange={setSelectedCardImageZoomFromInput}
                  aria-label="Card image zoom"
                />
                <button type="button" onClick={() => adjustSelectedCardImageZoom(TAROT_DETAIL_ZOOM_STEP)} aria-label="Zoom card image in">
                  <Maximize2 size={14} />
                </button>
                <button type="button" onClick={resetSelectedCardImageZoom} aria-label="Reset card image zoom">
                  <RefreshCw size={13} />
                </button>
                <output>{selectedCardZoomPercent}%</output>
              </div>
              {selectedCardImageSources.length > 1 && (
                <div className="tarot-card-detail-image-strip" aria-label={`${selectedCard.title} available still images`}>
                  {selectedCardImageSources.slice(0, 8).map((source, index) => (
                    <button
                      type="button"
                      key={`${source.uri}-${index}`}
                      aria-pressed={index === selectedCardImageIndex}
                      onClick={() => selectSelectedCardImage(index)}
                      title={source.label}
                    >
                      <img src={source.uri} alt="" loading="lazy" />
                      <span>{source.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedCard.videoUri && selectedCardImage && (
                <div className="tarot-card-detail-loop-preview">
                  <video key={`${selectedCard.id}-detail-mini-loop`} src={selectedCard.videoUri} poster={selectedCard.posterUri || undefined} autoPlay muted loop playsInline preload="metadata" />
                  <span>
                    <strong>Looping Video</strong>
                    <em>{selectedCard.videoSources?.length || 1} media source{(selectedCard.videoSources?.length || 1) === 1 ? "" : "s"}</em>
                  </span>
                </div>
              )}
            </section>
            <section className="tarot-card-detail-copy">
              <div className="tarot-card-detail-title-block">
                <p className="eyebrow">Selected Tarot Card</p>
                <h3>{selectedCard.title}</h3>
                <em>{selectedCard.subtitle || selectedCard.archetype || "Living tarot object"}</em>
              </div>
              {selectedCardDetailRows.length > 0 && (
                <dl className="tarot-card-detail-grid" aria-label={`${selectedCard.title} card identity`}>
                  {selectedCardDetailRows.slice(0, 12).map((row) => (
                    <div key={row.key}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {(selectedKeywords.length > 0 || selectedStats.length > 0) && (
                <div className="tarot-card-detail-chips" aria-label={`${selectedCard.title} keywords and stats`}>
                  {selectedKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                  {selectedStats.slice(0, 8).map(([key, value]) => <span key={key}>{titleizeTarotLabel(key)}: {value}</span>)}
                </div>
              )}
              {selectedTypeDetails && (
                <details className="tarot-card-detail-type" open>
                  <summary>{selectedTypeDetails.label}</summary>
                  <dl>
                    {selectedTypeDetails.rows.map(([label, value]) => (
                      <div key={`${label}:${value}`}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {selectedTypeDetails.notes.length > 0 && (
                    <div>
                      {selectedTypeDetails.notes.map((note) => <p key={note}>{note}</p>)}
                    </div>
                  )}
                </details>
              )}
              {selectedCardTextSections.length > 0 && (
                <div className="tarot-card-detail-sections" aria-label={`${selectedCard.title} readable details`}>
                  {selectedCardTextSections.map((section) => (
                    <article key={section.key}>
                      <h4>{section.label}</h4>
                      <p>{section.text}</p>
                    </article>
                  ))}
                </div>
              )}
              {selectedContacts.length > 0 && (
                <div className="tarot-card-detail-contacts" aria-label={`Avatars linked to ${selectedCard.title}`}>
                  {selectedContacts.map((contact) => (
                    <button
                      className="tarot-inspector-contact"
                      key={contact.id}
                      type="button"
                      aria-pressed={activeProfileContact?.id === contact.id}
                      onClick={() => setProfileContact(contact)}
                    >
                      {contact.portraitUri ? <img src={contact.portraitUri} alt="" loading="lazy" /> : <UserRound size={16} />}
                      <span>
                        <strong>{contact.name}</strong>
                        <em><BadgeCheck size={10} /> {contact.role || "Avatar"}</em>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>
      )}

      {activeProfileContact && (
        <aside
          className="tarot-avatar-profile-panel hapa-panel"
          data-variant="notch"
          role="dialog"
          aria-label={`${activeProfileContact.name} Avatar Card preview`}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          {profileBackdropVideoUri ? (
            <video
              className="tarot-avatar-profile-backdrop-video"
              key={`${activeProfileContact.id}-profile-backdrop`}
              src={profileBackdropVideoUri}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          ) : null}
          <header>
            <span><UserRound size={14} /> Avatar Card</span>
            <button className="hapa-btn" type="button" aria-label="Close avatar profile preview" onClick={() => setProfileContact(null)}>
              <X size={14} />
            </button>
          </header>
          <div className="tarot-avatar-profile-body">
            <div className="tarot-avatar-profile-visual-column">
              <div
                className={`tarot-avatar-profile-media${profileHeroLoopUri ? " has-loop" : ""}`}
                tabIndex={profileHeroLoopUri || profileHeroImageUri ? 0 : -1}
              >
                {profileHeroImageUri && (
                  <img
                    className="tarot-avatar-profile-hero-image"
                    src={profileHeroImageUri}
                    alt=""
                    loading="eager"
                    decoding="async"
                    draggable="false"
                  />
                )}
                {profileHeroLoopUri && (
                  <video
                    className="tarot-avatar-profile-hover-loop"
                    key={`${activeProfileContact.id}-profile-hero-loop`}
                    src={profileHeroLoopUri}
                    poster={profileHeroPosterUri || undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                )}
                {!profileHeroLoopUri && !profileHeroImageUri && <UserRound size={44} />}
              </div>
              {!!activeProfileDisplayMedia.length && (
                <div className="tarot-avatar-profile-media-wall" aria-label={`${activeProfileContact.name} media wall`}>
                  {activeProfileDisplayMedia.slice(0, 8).map((item) => (
                    <figure
                      className={`tarot-avatar-profile-media-tile${item.videoUri ? " has-loop" : " has-still"}`}
                      key={item.id || `${item.imageUri}-${item.videoUri}`}
                      tabIndex={0}
                      onPointerEnter={playProfileMediaLoop}
                      onPointerLeave={pauseProfileMediaLoop}
                      onFocus={playProfileMediaLoop}
                      onBlur={pauseProfileMediaLoop}
                    >
                      {item.imageUri && <img src={item.imageUri} alt="" loading="lazy" decoding="async" draggable="false" />}
                      {item.videoUri && <video src={item.videoUri} poster={item.posterUri || item.imageUri || undefined} muted loop playsInline preload="none" />}
                      {!item.imageUri && !item.videoUri && <UserRound size={24} />}
                      <figcaption>
                        <strong>{item.label || "Media"}</strong>
                        <em>{item.kind || (item.videoUri ? "Loop" : "Still")}</em>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {!!activeProfileContact.profile?.aliases?.length && (
                <div className="tarot-avatar-profile-aliases" aria-label={`${activeProfileContact.name} aliases`}>
                  {activeProfileContact.profile.aliases.map((alias) => <span key={alias}>{alias}</span>)}
                </div>
              )}
              {!!activeProfileContact.songs?.length && (
                <div className="tarot-avatar-profile-songs" aria-label={`${activeProfileContact.name} linked songs`}>
                  {activeProfileContact.songs.slice(0, 4).map((song) => (
                    <span key={song.id || song.title}>
                      <Volume2 size={12} />
                      <strong>{song.title}</strong>
                      <em>{song.sourceLabel || "Dear Papa"}</em>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="tarot-avatar-profile-info-column">
              <div className="tarot-avatar-profile-copy">
                <p className="eyebrow">Linked Avatar</p>
                <h3>{activeProfileContact.name}</h3>
                <em>{activeProfileContact.role || "Avatar"}</em>
                {activeProfileContact.summary && <p>{activeProfileContact.summary}</p>}
              </div>
              <div className="tarot-avatar-profile-grid" aria-label={`${activeProfileContact.name} avatar telemetry`}>
                {(activeProfileContact.profile?.stats || []).map((stat) => (
                  <span key={stat.label}><strong>{stat.value}</strong><em>{stat.label}</em></span>
                ))}
              </div>
              <div className="tarot-avatar-profile-context">
                <span><BadgeCheck size={12} /> {activeProfileContact.profile?.teamLabel || "Team pending"}</span>
                <span><Route size={12} /> {activeProfileContact.profile?.shipLabel || "Ship pending"}</span>
                <span><Sparkles size={12} /> {activeProfileContact.profile?.gardenLabel || "Garden pending"}</span>
              </div>
              <div className="tarot-avatar-profile-spawn-controls" aria-label={`${activeProfileContact.name} relationship and skill card spawns`}>
                <button
                  type="button"
                  disabled={!activeProfileRelationshipCards.length}
                  onClick={() => spawnMusicSlotCards("relationship", activeProfileContact)}
                  title={activeProfileRelationshipCards.length ? `Spawn ${activeProfileRelationshipCards.length} relationship tarot cards for ${activeProfileContact.name}` : `${activeProfileContact.name} has no relationship cards ready`}
                >
                  <Link2 size={14} />
                  <span>Relationships</span>
                  <em>{activeProfileRelationshipCards.length}</em>
                </button>
                <button
                  type="button"
                  disabled={!activeProfileSkillCards.length}
                  onClick={() => spawnMusicSlotCards("skill", activeProfileContact)}
                  title={activeProfileSkillCards.length ? `Spawn ${activeProfileSkillCards.length} skill cards for ${activeProfileContact.name}` : `${activeProfileContact.name} has no skill cards ready`}
                >
                  <ListChecks size={14} />
                  <span>Skills</span>
                  <em>{activeProfileSkillCards.length}</em>
                </button>
                <button
                  type="button"
                  disabled={!spawnNetwork.count}
                  onClick={useSpawnedCardsOnSurface}
                  title={spawnNetwork.count ? `Use ${spawnNetwork.count} spawned cards on the table surface` : "Spawn relationship or skill cards first"}
                >
                  <Sparkles size={14} />
                  <span>Use</span>
                  <em>{spawnNetwork.count || 0}</em>
                </button>
                <button
                  type="button"
                  disabled={!spawnNetwork.count}
                  onClick={wipeSpawnedCards}
                  title={spawnNetwork.count ? "Wipe the spawned floating card network" : "No spawned network to wipe"}
                >
                  <X size={14} />
                  <span>Wipe</span>
                </button>
              </div>
              {!!activeProfileContact.profile?.narrative?.length && (
                <div className="tarot-avatar-profile-narrative">
                  {activeProfileContact.profile.narrative.map((paragraph, index) => (
                    <p key={`${activeProfileContact.id}-narrative-${index}`}>{paragraph}</p>
                  ))}
                </div>
              )}
              {!!activeProfileContact.profile?.loreFacts?.length && (
                <div className="tarot-avatar-profile-facts">
                  {activeProfileContact.profile.loreFacts.map((fact, index) => (
                    <span key={`${activeProfileContact.id}-fact-${index}`}>{fact}</span>
                  ))}
                </div>
              )}
              {!!activeProfileContact.profile?.tags?.length && (
                <div className="tarot-avatar-profile-tags" aria-label={`${activeProfileContact.name} tags`}>
                  {activeProfileContact.profile.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      {hasReading && readingPanelVisible && (
        <aside className="tarot-reading-panel hapa-panel" data-variant="notch" aria-live="polite" aria-label="Valen tarot reading">
          <div className="tarot-reading-head">
            <span><BookOpenCheck size={14} /> Valen Mirror</span>
            <strong>{reading.title || `${avatarName} Mirror`}</strong>
            <em>{reading.sourceLabel || "Atlas26 Valen"}</em>
          </div>
          {reading.status === "loading" ? (
            <p className="tarot-reading-loading">Reading the placed cards...</p>
          ) : (
            <div className="tarot-reading-body">
              <p>{reading.summary}</p>
              {reading.synthesis && <p>{reading.synthesis}</p>}
              {reading.astrologyLayer && <p className="tarot-reading-astro">{reading.astrologyLayer}</p>}
              {!!reading.cardByCard?.length && (
                <ol>
                  {reading.cardByCard.slice(0, 9).map((line, index) => (
                    <li key={`${line}-${index}`}>{line}</li>
                  ))}
                </ol>
              )}
              {reading.reflectionQuestions?.[0] && <p className="tarot-reading-prompt">{reading.reflectionQuestions[0]}</p>}
              {reading.cultivationAction && <p className="tarot-reading-action">{reading.cultivationAction}</p>}
            </div>
          )}
        </aside>
      )}
    </section>
  );
}

function buildTarotPileSummaries(cards = [], allCards = cards) {
  const counts = new Map();
  const labels = new Map();
  for (const card of Array.isArray(allCards) ? allCards : []) {
    for (const id of tarotPileIds(card)) {
      labels.set(id, tarotPileLabel(id));
      counts.set(id, counts.get(id) || 0);
    }
  }
  for (const card of Array.isArray(cards) ? cards : []) {
    for (const id of tarotPileIds(card)) {
      labels.set(id, tarotPileLabel(id));
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return [...labels.entries()]
    .map(([id, label]) => ({
      id,
      label,
      shortLabel: tarotPileShortLabel(id, label),
      count: counts.get(id) || 0
    }))
    .sort((first, second) =>
      tarotPileSortRank(first.id) - tarotPileSortRank(second.id) ||
      first.label.localeCompare(second.label)
    );
}

function buildCardBackPileControls(piles = []) {
  const normalizedPiles = Array.isArray(piles) ? piles : [];
  return CARD_TYPE_BACKS.map((back) => {
    const match = resolveCardBackPile(back, normalizedPiles);
    return {
      ...back,
      pileId: back.id,
      activeLabel: match?.label || back.label,
      count: match?.count || 0
    };
  });
}

function resolveCardBackPile(back = {}, piles = []) {
  const targetIds = cardBackPileAliases(back.id);
  const directMatches = piles.filter((pile) => targetIds.has(normalizePileLookupId(pile.id)));
  if (directMatches.length) {
    return {
      id: back.id,
      label: directMatches[0].label,
      count: directMatches.reduce((sum, pile) => sum + (Number(pile.count) || 0), 0)
    };
  }
  const labelNeedle = normalizePileLookupId(back.label);
  const labelMatches = piles.filter((pile) => {
    const id = normalizePileLookupId(pile.id);
    const label = normalizePileLookupId(pile.label);
    return id.includes(labelNeedle) || label.includes(labelNeedle);
  });
  if (!labelMatches.length) return null;
  return {
    id: back.id,
    label: labelMatches[0].label,
    count: labelMatches.reduce((sum, pile) => sum + (Number(pile.count) || 0), 0)
  };
}

function summarizeAvatarProfileCoverage(cards = []) {
  const contacts = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    for (const contact of card?.avatarContacts || []) {
      const key = contact?.id || contact?.name;
      if (!key || contacts.has(key)) continue;
      contacts.set(key, contact);
    }
  }
  const list = [...contacts.values()];
  const statValue = (contact, label) => Number((contact.profile?.stats || []).find((stat) => stat.label === label)?.value || 0);
  return {
    total: list.length,
    withLore: list.filter((contact) => statValue(contact, "Lore") > 0 || (contact.profile?.loreFacts || []).length > 0).length,
    withMemory: list.filter((contact) => statValue(contact, "Memory") > 0).length,
    withSongs: list.filter((contact) => statValue(contact, "Songs") > 0 || (contact.songs || []).length > 0).length,
    withRelationships: list.filter((contact) => (contact.profile?.relationshipTarotCards || []).length > 0).length,
    withSkills: list.filter((contact) => (contact.profile?.skillCards || []).length > 0).length,
    sampleMissing: list
      .filter((contact) =>
        !(statValue(contact, "Lore") > 0 || (contact.profile?.loreFacts || []).length > 0) ||
        statValue(contact, "Memory") <= 0 ||
        !(statValue(contact, "Songs") > 0 || (contact.songs || []).length > 0)
      )
      .slice(0, 8)
      .map((contact) => ({
        id: contact.id || "",
        name: contact.name || "",
        lore: statValue(contact, "Lore"),
        memory: statValue(contact, "Memory"),
        songs: statValue(contact, "Songs"),
        relationships: (contact.profile?.relationshipTarotCards || []).length,
        skills: (contact.profile?.skillCards || []).length
      }))
  };
}

function cardBackPileAliases(pileId = "") {
  const normalizedId = normalizePileLookupId(pileId);
  const back = CARD_TYPE_BACKS.find((item) =>
    item.id === normalizedId ||
    (item.pileIds || []).some((id) => normalizePileLookupId(id) === normalizedId)
  );
  return new Set((back ? [back.id, ...(back.pileIds || [])] : [normalizedId]).map(normalizePileLookupId));
}

function normalizePileLookupId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function tarotPileId(card = {}) {
  return tarotPileIds(card)[0] || "hapa_tarot_card";
}

function tarotPileIds(card = {}) {
  const identity = card.tarotIdentity || {};
  const typeDetails = card.typeDetails || {};
  const catalog = card.tarotCatalog || {};
  const primaryCandidates = [
    card.functionalType,
    identity.functionalType,
    identity.functionalTypeSlug,
    identity.hapaCardType,
    identity.hapaCardTypeSlug,
    typeDetails.functionalType,
    typeDetails.functionalTypeSlug,
    typeDetails.hapaCardType,
    typeDetails.hapaCardTypeSlug,
    catalog.typeLabel,
    card.cardType,
    card.tarotMainType,
    ...(Array.isArray(identity.typeStack) ? identity.typeStack : [])
  ];
  const ids = primaryCandidates
    .map(normalizeCardPileId)
    .filter(Boolean);
  const fallbackIds = [
    card.sourceKind,
    card.kind
  ].map(normalizeCardPileId).filter(Boolean);
  const uniqueIds = uniqueStrings(ids);
  return uniqueIds.length ? uniqueIds : uniqueStrings(fallbackIds).length ? uniqueStrings(fallbackIds) : ["hapa_tarot_card"];
}

function normalizeCardPileId(value = "") {
  const id = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const aliases = {
    abilities: "capability",
    avatar_card: "avatar",
    avatar_tarot_card: "avatar",
    capability_card: "capability",
    capability_cards: "capability",
    capability_tarot_card: "capability",
    capabilities: "capability",
    garden_card: "garden",
    garden_tarot_card: "garden",
    gardens: "garden",
    item_card: "item",
    item_tarot_card: "item",
    items: "item",
    location_card: "location",
    location_tarot_card: "location",
    locations: "location",
    lore_card: "lore",
    lore_cards: "lore",
    lore_tarot_card: "lore",
    major_arcana_card: "major_arcana",
    hapa_song: "song",
    hapa_song_card: "song",
    music: "song",
    protocol_card: "protocol",
    protocol_tarot_card: "protocol",
    protocols: "protocol",
    shadows: "void_shadow",
    ship_card: "ship",
    ship_tarot_card: "ship",
    ships: "ship",
    song_card: "song",
    song_cards: "song",
    songs: "song",
    skill_card: "skill",
    skill_tarot_card: "skill",
    skills: "skill",
    spell_card: "spell",
    spell_tarot_card: "spell",
    spells: "spell",
    void: "void_shadow",
    void_shadow_card: "void_shadow"
  };
  return aliases[id] || id;
}

function tarotPileLabel(id = "") {
  const known = {
    relationship_tarot_card: "Relationship Tarot",
    skill_card: "Skill Cards",
    skill: "Skills",
    hapa_tarot_card: "Hapa Tarot",
    avatar_tarot_card: "Avatar Tarot",
    avatar: "Avatars",
    protocol_card: "Protocol Cards",
    protocol: "Protocols",
    capability_card: "Capability Cards",
    capability: "Capabilities",
    lore_card: "Lore Cards",
    lore: "Lore Cards",
    garden_card: "Garden Cards",
    garden: "Garden Cards",
    item_card: "Item Cards",
    item: "Item Cards",
    location_card: "Location Cards",
    location: "Location Cards",
    spell_card: "Spell Cards",
    spell: "Spell Cards",
    major_arcana: "Major Arcana",
    void_shadow: "Void / Shadow",
    song_card: "Song Cards",
    song: "Songs",
    node_card: "Node Cards",
    ship_card: "Ship Cards",
    ship: "Ships",
    tarot: "Tarot Cards"
  };
  if (known[id]) return known[id];
  return String(id || "tarot")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function tarotPileShortLabel(id = "", label = tarotPileLabel(id)) {
  const known = {
    relationship_tarot_card: "Rel",
    skill_card: "Skill",
    skill: "Skill",
    hapa_tarot_card: "Hapa",
    avatar_tarot_card: "Avatar",
    avatar: "Avatar",
    protocol_card: "Protocol",
    protocol: "Protocol",
    capability_card: "Ability",
    capability: "Ability",
    lore_card: "Lore",
    lore: "Lore",
    garden_card: "Garden",
    garden: "Garden",
    item_card: "Item",
    item: "Item",
    location_card: "Location",
    location: "Location",
    spell_card: "Spell",
    spell: "Spell",
    major_arcana: "Major",
    void_shadow: "Void",
    node_card: "Node",
    ship_card: "Ship",
    ship: "Ship"
  };
  return known[id] || label.replace(/\bCards?\b/gi, "").trim().slice(0, 12) || "Tarot";
}

function tarotPileSortRank(id = "") {
  const order = [
    "relationship_tarot_card",
    "skill_card",
    "skill",
    "hapa_tarot_card",
    "avatar_tarot_card",
    "avatar",
    "protocol_card",
    "protocol",
    "capability_card",
    "capability",
    "lore_card",
    "lore",
    "garden_card",
    "garden",
    "item_card",
    "item",
    "location_card",
    "location",
    "spell_card",
    "spell",
    "major_arcana",
    "void_shadow",
    "node_card",
    "ship_card",
    "ship"
  ];
  const index = order.indexOf(id);
  return index === -1 ? 100 : index;
}

function tarotDrawSettingsKey(avatarName = "Hapa") {
  const slug = String(avatarName || "hapa")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "hapa";
  return `hapa-tarot-draw-settings:${slug}`;
}

function tarotCameraJournalKey(avatarName = "Hapa") {
  return `${tarotDrawSettingsKey(avatarName)}:camera-journal`;
}

function readTarotDrawSettings(storageKey) {
  if (typeof window === "undefined" || !storageKey) return null;
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== TAROT_DOCK_SETTINGS_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readTarotCameraJournal(storageKey) {
  if (typeof window === "undefined" || !storageKey) return [];
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : [];
    return entries
      .filter((entry) => entry && typeof entry.text === "string" && entry.text.trim())
      .slice(0, CAMERA_CARD_TRANSCRIPT_JOURNAL_LIMIT)
      .map((entry, index) => ({
        id: entry.id || `camera-card-journal-restored-${index}`,
        text: String(entry.text || "").trim(),
        time: entry.time || "",
        createdAt: entry.createdAt || "",
        createdAtMs: Number(entry.createdAtMs || 0),
        source: entry.source || CAMERA_CARD_TRANSCRIBE_SOURCE,
        engine: entry.engine || "",
        model: entry.model || CAMERA_CARD_TRANSCRIBE_MODEL,
        elapsedMs: Number(entry.elapsedMs || 0),
        serviceElapsedSeconds: Number(entry.serviceElapsedSeconds || 0)
      }));
  } catch {
    return [];
  }
}

function writeTarotCameraJournal(storageKey, entries = []) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      entries: (Array.isArray(entries) ? entries : []).slice(0, CAMERA_CARD_TRANSCRIPT_JOURNAL_LIMIT)
    }));
  } catch {
    // A blocked localStorage should not stop dictation or the 3D table.
  }
}

function writeTarotDrawSettings(storageKey, settings) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify({
      version: TAROT_DOCK_SETTINGS_VERSION,
      savedAt: new Date().toISOString(),
      ...settings
    }));
  } catch {
    // Local persistence is a convenience; the table should remain playable if storage is blocked.
  }
}

function createTarotDrawGame({ canvas, cards, avatarName, apiBase = "", productionAudit = null, soundEnabled = false, onHud, onReadingRequest, onReadingClear }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TAROT_RENDERER_DPR_CAP));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.36;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a2033);
  scene.fog = new THREE.FogExp2(0x1b4051, 0.022);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 80);
  camera.position.set(0, 4.65, 5.95);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4.6;
  controls.maxDistance = CAMERA_GALLERY_RECOVERY_MAX_DISTANCE;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 0.05, 0);

  const world = new THREE.Group();
  world.name = "HapaTarotDrawWorld";
  scene.add(world);

  const resources = createResourceLibrary();
  const audio = createTarotAudio(soundEnabled);
  const dropSong = createDropZoneSongPlayer(soundEnabled);
  const board = createBoard(resources);
  const deck = createDeckStack(resources);
  const dropZone = createDropZone(resources);
  const mediaPoolZone = createDropZone(resources, {
    name: "tarotMediaPoolZone",
    position: MEDIA_POOL_POSITION,
    radius: MEDIA_POOL_RADIUS,
    magnetRadius: MEDIA_POOL_MAGNET_RADIUS,
    label: "MEDIA POOL",
    subtitle: "STACK TO FEED SCREENS",
    accent: "#f6c96d",
    secondary: "#ff6df2",
    plus: "+"
  });
  let hyperspaceTunnel = null;
  let centerVisualizer = null;
  let lyricCrawl = null;
  const slotGroup = new THREE.Group();
  const previewGroup = new THREE.Group();
  const sparkGroup = new THREE.Group();
  const spawnNetworkLayer = new THREE.Group();
  previewGroup.name = "tarotDropZonePreviewRig";
  spawnNetworkLayer.name = "tarotSpawnNetworkLayer";
  world.add(board, deck, slotGroup, mediaPoolZone, dropZone, previewGroup, spawnNetworkLayer, sparkGroup);

  addLighting(scene);
  addDepthProps(world, resources);
  addAmbientBackdrop(world);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_Y);
  const pointerWorld = new THREE.Vector3(0, TABLE_Y, 0);
  const focusForward = new THREE.Vector3();
  const focusNormal = new THREE.Vector3();
  const focusUp = new THREE.Vector3();
  const focusRight = new THREE.Vector3();
  const focusPosition = new THREE.Vector3();
  const focusMatrix = new THREE.Matrix4();
  const focusQuaternion = new THREE.Quaternion();
  const detailTargetWorld = new THREE.Vector3();
  const detailTargetScreen = new THREE.Vector3();
  const rngSeed = Math.random() * 1000;
  const settingsKey = tarotDrawSettingsKey(avatarName);
  const cameraJournalKey = tarotCameraJournalKey(avatarName);
  const persistedSettings = readTarotDrawSettings(settingsKey);
  const persistedCameraJournal = readTarotCameraJournal(cameraJournalKey);

  let animationFrame = 0;
  let animationTimer = 0;
  let diagnosticsHandle = null;
  let disposed = false;
  let lastFrameTime = performance.now() / 1000;
  let elapsedTime = 0;
  let playing = true;
  let layoutId = LAYOUTS[0].id;
  let backStyle = CARD_BACK_STYLES.some((style) => style.id === persistedSettings?.backStyle)
    ? persistedSettings.backStyle
    : CARD_BACK_STYLES[0].id;
  let musicVisualizerMode = MUSIC_VISUALIZER_MODES.some((mode) => mode.id === persistedSettings?.musicVisualizerMode)
    ? persistedSettings.musicVisualizerMode
    : MUSIC_VISUALIZER_MODES[0].id;
  let centerVisualizerEnabled = persistedSettings?.centerVisualizerEnabled === true;
  let backgroundVisualizerEnabled = persistedSettings?.backgroundVisualizerEnabled === true;
  let videoBackgroundKeying = Boolean(persistedSettings?.videoBackgroundKeying);
  let echoShadersEnabled = persistedSettings?.echoShadersEnabled !== false;
  let lyricsEnabled = persistedSettings?.lyricsEnabled !== false;
  let cameraCardShaderEnabled = persistedSettings?.cameraCardShaderEnabled === true;
  let lyricCrawlAngleDegrees = clampLyricCrawlAngleDegrees(persistedSettings?.lyricCrawlAngleDegrees);
  let deckCards = shuffleList(cards);
  let placedEntries = [];
  let heldEntry = null;
  let hoveredEntry = null;
  let selectedEntry = null;
  let dropZoneEntry = null;
  let mediaPoolEntries = [];
  let centerVisualizerEntries = [];
  let dockEntries = [];
  let cameraCardEntry = null;
  let cameraCardPending = false;
  let cameraCardError = "";
  let cameraCardMicEnabled = false;
  let cameraCardMicPending = false;
  let cameraCardMicError = "";
  let cameraCardMicStream = null;
  let cameraCardMicContext = null;
  let cameraCardMicSource = null;
  let cameraCardMicAnalyser = null;
  let cameraCardMicRecordGain = null;
  let cameraCardMicCompressor = null;
  let cameraCardMicRecordDestination = null;
  let cameraCardMicRecordStream = null;
  let cameraCardMicData = null;
  let cameraCardMicLevel = 0;
  let cameraCardTranscriptionEnabled = false;
  let cameraCardTranscriptionPending = false;
  let cameraCardTranscriptionCapturing = false;
  let cameraCardTranscriptionInFlight = false;
  let cameraCardTranscriptionQueue = [];
  let cameraCardTranscriptionDropped = 0;
  let cameraCardTranscriptionError = "";
  let cameraCardTranscript = persistedCameraJournal[0]?.text || "";
  let cameraCardTranscriptionNotice = "";
  let cameraCardTranscriptionLastResult = null;
  let cameraCardTranscriptionJournal = persistedCameraJournal;
  let cameraCardTranscriptionQuietPolls = 0;
  let cameraCardTranscriptionChunkIndex = 0;
  let cameraCardTranscriptionTimer = 0;
  let cameraCardTranscriptionStopTimer = 0;
  let cameraCardTranscriptionRecorder = null;
  let cameraCardTranscriptionChunks = [];
  let cameraCardTranscriptionRunId = 0;
  let spawnNetwork = null;
  let dropPreview = null;
  let dropPreviewRefreshFrame = 0;
  let dropPreviewRefreshOptions = null;
  let dropPreviewRebuildFrame = 0;
  let dropPreviewRefreshSuspended = false;
  let dropPreviewSuspendedRebuild = false;
  let dropPreviewSuspendedResetScreens = false;
  let dropPreviewResumeTimer = 0;
  let echoDirectorProject = null;
  let echoDirectorProjectKey = "";
  let echoDirectorTimelineSourceKey = "";
  let status = cards.length ? "Deck online" : "No tarot cards";
  let lastHudTime = 0;
  let lastResizeCheck = -Infinity;
  let lastDynamicStackTime = -Infinity;
  let slotMeshes = [];
  let placementBursts = [];
  let compactMode = null;
  let cameraRailBlend = 0;
  let cameraGalleryRecovery = null;
  let cameraGalleryRecoveryBlend = 0;

  const entryTargetScratch = new THREE.Vector3();
  const drawEulerScratch = new THREE.Euler();
  const drawQuaternionScratch = new THREE.Quaternion();
  const entryQuaternionScratch = new THREE.Quaternion();
  const hoverEulerScratch = new THREE.Euler();
  const hoverQuaternionScratch = new THREE.Quaternion();
  const boardCameraTargetScratch = new THREE.Vector3();
  const horizonCameraTargetScratch = new THREE.Vector3();
  const galleryCameraPositionScratch = new THREE.Vector3();
  const galleryCameraTargetScratch = new THREE.Vector3();
  const deckHitScratch = new THREE.Vector3();
  const hoverPickTargetsScratch = [];
  const hoverHitsScratch = [];
  const deckHitsScratch = [];
  const cameraCardWheelDirectionScratch = new THREE.Vector3();
  const cameraCardPoseScratch = new THREE.Vector3();

  applyCardBackStyle(resources, backStyle);

  const dockTray = createDockTray(resources);
  const dockBackgroundPlayer = createDockBackgroundPlayer({ videoKeying: videoBackgroundKeying });
  world.add(dockBackgroundPlayer.group, dockTray);
  restoreDockFromSettings();
  reshuffleDeck();
  buildSlots(layoutId);
  refreshDockTargets({ snap: true });
  refreshDockBackgroundPlayer({ force: true });
  publishHud();

  const game = {
    start,
    shuffle,
    draw,
    drawFromPile,
    autoDealInstantStart,
    clear,
    autoPlace,
    togglePlaying,
    setSoundEnabled,
    setBackStyle,
    setMusicVisualizerMode,
    setCenterVisualizerEnabled,
    setBackgroundVisualizerEnabled,
    setVideoBackgroundKeying,
    setEchoShadersEnabled,
    setLyricsEnabled,
    setLyricCrawlAngleDegrees,
    setCameraCardEnabled,
    setCameraCardShaderEnabled,
    setCameraCardMicEnabled,
    setCameraCardTranscriptionEnabled,
    setEchoDirectorProject,
    spawnMusicSlotCards,
    wipeSpawnedCards,
    useSpawnedCardsOnSurface,
    toggleSelectedDetails,
    openDetailTarget,
    clearHoverTarget: clearHover,
    focusSelectedByWheel,
    requestReadingNow,
    dispose,
    getDebugState
  };

  function unlockAudioFromGesture() {
    audio.unlock?.();
    dropSong.unlock?.();
    dropSong.play?.();
  }

  function start() {
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", unlockAudioFromGesture, { capture: true });
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerleave", clearHover);
    canvas.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    window.addEventListener("resize", resize);
    resize();
    diagnosticsHandle = {
      kind: "hapa-tarot-draw",
      renderer: renderer.info,
      actions: {
        lockFirstMusicSlotAvatar: diagnosticLockFirstMusicSlotAvatar,
        lockFirstSongCardInDropZone: diagnosticLockFirstSongCardInDropZone,
        recoverPreviewGallery: () => requestPreviewGalleryRecovery(),
        toggleCameraCard: () => setCameraCardEnabled(!cameraCardEntry),
        toggleCameraCardShader: () => setCameraCardShaderEnabled(!cameraCardShaderEnabled),
        toggleCameraCardMic: () => setCameraCardMicEnabled(!cameraCardMicEnabled),
        toggleCameraCardTranscription: () => setCameraCardTranscriptionEnabled(!cameraCardTranscriptionEnabled),
        clearCameraCardJournal,
        enableEchoPreviewOverlays: () => {
          setEchoShadersEnabled(true);
          setLyricsEnabled(true);
          return true;
        },
        spawnRelationshipNetwork: () => spawnNetworkFromDropZone("relationship"),
        spawnSkillNetwork: () => spawnNetworkFromDropZone("skill"),
	        autoDealInstantStart,
	        autoPlaceSpread: () => autoPlace(layoutId),
	        lockFirstMotionCardInDropZone: diagnosticLockFirstMotionCardInDropZone,
	        drawFirstPile: () => {
          const pile = buildTarotPileSummaries(deckCards, cards).find((item) => item.count > 0);
          return pile ? drawFromPile(pile.id) : false;
        },
        drawSongPile: () => drawFromPile("song"),
        wipeSpawnedCards,
        useSpawnedCardsOnSurface
      },
      get state() {
        return getDebugState();
      }
    };
    window.__THREE_GAME_DIAGNOSTICS__ = diagnosticsHandle;
    animate();
  }

  function shuffle() {
    audio.play("shuffle");
    clearDeal();
    reshuffleDeck();
    deck.userData.pulse = 1;
    status = lockedZoneEntries().length ? "Deck shuffled; locked zones held" : "Deck shuffled";
    publishHud(true);
    requestReading("shuffle");
  }

  function draw(options = {}) {
    if (heldEntry) return;
    const suppliedCard = options.card || null;
    if (!suppliedCard && !deckCards.length) {
      audio.play("empty");
      status = "Deck empty";
      publishHud(true);
      return;
    }
    audio.play("draw");
    const card = suppliedCard || deckCards.shift();
    const drawTarget = options.targetPosition?.isVector3 ? options.targetPosition : pointerWorld;
    const drawOrigin = options.originPosition?.isVector3 ? options.originPosition : DECK_POSITION;
    const fromDeckClick = options.source === "deck";
    heldEntry = createCardEntry(card);
    selectEntry(heldEntry);
    heldEntry.state = "held";
    heldEntry.group.position.copy(drawOrigin);
    heldEntry.targetPosition.copy(drawTarget).setY(fromDeckClick ? 0.82 : 0.68);
    heldEntry.baseRotationY = 0.22;
    setCardTargetRotation(heldEntry, -0.2, heldEntry.baseRotationY, 0.08);
    heldEntry.drawAnim = {
      life: 0,
      duration: fromDeckClick ? 0.82 : 0.95,
      from: drawOrigin.clone(),
      spin: Math.PI * (fromDeckClick ? 2.55 : 2.1),
      peak: fromDeckClick ? 1.32 : 1.16
    };
    world.add(heldEntry.group);
    heldEntry.playing = true;
    updateVideoPlayback(heldEntry);
    canvas.style.cursor = "grabbing";
    status = options.statusText || (fromDeckClick ? `Deck draw: ${card.title}` : `Drawn: ${card.title}`);
    createBurst(drawOrigin.x, drawOrigin.z, options.burstColor || 0x00f3ff, 1.0);
    publishHud(true);
  }

  function drawFromPile(pileId) {
    if (heldEntry) return false;
    const normalizedPileId = String(pileId || "").trim().toLowerCase();
    const pileLabel = tarotPileLabel(normalizedPileId);
    const requestedPileIds = cardBackPileAliases(normalizedPileId);
    const cardIndex = deckCards.findIndex((card) =>
      tarotPileIds(card).some((id) => requestedPileIds.has(normalizePileLookupId(id)))
    );
    if (cardIndex < 0) {
      audio.play("empty");
      status = `${pileLabel} pile empty`;
      publishHud(true);
      return false;
    }
    const [card] = deckCards.splice(cardIndex, 1);
    const piles = buildTarotPileSummaries(cards);
    const pileIndex = Math.max(0, piles.findIndex((pile) => requestedPileIds.has(normalizePileLookupId(pile.id))));
    const originPosition = pileDrawOrigin(pileIndex, piles.length);
    deck.userData.pulse = 1;
    if (requestedPileIds.has("song") || isSongCard(card)) {
      const { entry, origin } = createInstantDealEntry(card, 0, { originPosition });
      lockEntryInDropZone(entry);
      animateInstantDealEntry(entry, origin, 0, 0.9);
      selectEntry(entry);
      status = `Song draw: ${card.title}${entry.songAvatarSeedCount ? ` · ${entry.songAvatarSeedCount} avatars loaded` : ""}`;
      publishHud(true);
      requestReading("song-card");
      return true;
    }
    draw({
      card,
      source: "pile",
      originPosition,
      statusText: `${tarotPileShortLabel(normalizedPileId, pileLabel)} pile: ${card.title}`,
      burstColor: 0xf6c96d
    });
    return true;
  }

  function autoDealInstantStart() {
    if (!TAROT_AUTO_DEAL_ENABLED) {
      status = "Auto Deal disabled for stability";
      publishHud(true);
      return false;
    }
    if (heldEntry) return false;
    audio.play("spread");
    clearDeal({ preserveLocked: false });
    reshuffleDeck({ preserveLocked: false });
    if (!deckCards.length) {
      audio.play("empty");
      status = "Auto-deal needs cards";
      publishHud(true);
      return false;
    }

    suspendDropZonePreviewRefresh();
    const musicCard = pullDeckCard(isInstantStartMusicCard) || pullDeckCard(cardHasMotionMedia) || pullDeckCard();
    const centerCard = pullDeckCard(isInstantStartCenterCard) || pullDeckCard(cardHasMotionMedia) || pullDeckCard();
    const mediaCards = [];
    try {
      while (mediaCards.length < TAROT_AUTO_DEAL_MEDIA_CARD_COUNT && deckCards.length) {
        mediaCards.push(pullDeckCard(cardHasMotionMedia) || pullDeckCard());
      }

      const lockedMediaEntries = [];
      let dealIndex = 0;
      for (const card of mediaCards.filter(Boolean)) {
        const { entry, origin } = createInstantDealEntry(card, dealIndex);
        lockEntryInMediaPoolZone(entry);
        animateInstantDealEntry(entry, origin, dealIndex, 0.78);
        lockedMediaEntries.push(entry);
        dealIndex += 1;
      }

      let centerEntry = null;
      if (centerCard) {
        const { entry, origin } = createInstantDealEntry(centerCard, dealIndex);
        lockEntryInCenterVisualizer(entry);
        animateInstantDealEntry(entry, origin, dealIndex, 0.92);
        centerEntry = entry;
        dealIndex += 1;
      }

      let musicEntry = null;
      if (musicCard) {
        const { entry, origin } = createInstantDealEntry(musicCard, dealIndex);
        lockEntryInDropZone(entry);
        animateInstantDealEntry(entry, origin, dealIndex, 0.86);
        musicEntry = entry;
        dealIndex += 1;
      }

      const selectedInstantEntry = musicEntry || centerEntry || lockedMediaEntries.at(-1) || null;
      if (selectedInstantEntry) selectEntry(selectedInstantEntry);
      deck.userData.pulse = 1;
      status = `Auto-deal: ${mediaCards.filter(Boolean).length} media, ${centerEntry ? "center" : "no center"}, ${musicEntry ? "music" : "no music"}`;
      publishHud(true);
      requestReading("auto-deal");
      return true;
    } finally {
      resumeDropZonePreviewRefresh({ delayMs: 850 });
    }
  }

  function pullDeckCard(predicate = () => true) {
    const index = deckCards.findIndex((card) => predicate(card));
    if (index < 0) return null;
    const [card] = deckCards.splice(index, 1);
    return card || null;
  }

  function cardHasMotionMedia(card = {}) {
    return Boolean(card.videoUri || dropZoneVideoSources(card).length);
  }

  function diagnosticLockFirstMotionCardInDropZone() {
    const card = pullDeckCard(cardHasMotionMedia) || cards.find(cardHasMotionMedia);
    if (!card) return false;
    const entry = createCardEntry(card);
    entry.group.position.copy(DECK_POSITION);
    world.add(entry.group);
    lockEntryInDropZone(entry);
    selectEntry(entry);
    return true;
  }

  function diagnosticLockFirstSongCardInDropZone() {
    const hasEchoSongId = (card = {}) => isSongCard(card) && echoDirectorSongIdForCard(card);
    const card = pullDeckCard(hasEchoSongId) || pullDeckCard(isSongCard) || cards.find(hasEchoSongId) || cards.find(isSongCard);
    if (!card) {
      status = "No song card available for Music Zone";
      publishHud(true);
      return false;
    }
    if (dropZoneEntry?.card?.id === card.id) {
      publishHud(true);
      return true;
    }
    const entry = createCardEntry(card);
    entry.group.position.copy(DECK_POSITION);
    entry.targetPosition.copy(DROP_ZONE_POSITION);
    entry.targetPosition.y = DROP_ZONE_CARD_BASE_Y;
    world.add(entry.group);
    lockEntryInDropZone(entry);
    selectEntry(entry);
    return true;
  }

  function isSongCard(card = {}) {
    const pileIds = tarotPileIds(card);
    return Boolean(
      card.sourceKind === "song" ||
      card.kind === "song" ||
      card.cardType === "song_card" ||
      card.functionalType === "Song" ||
      card.songCardVersion ||
      card.sourceSongId ||
      pileIds.includes("song")
    );
  }

  function isInstantStartMusicCard(card = {}) {
    const pileIds = tarotPileIds(card);
    return Boolean(
      isSongCard(card) ||
      card.avatarContacts?.length ||
      pileIds.includes("avatar") ||
      pileIds.includes("avatar_tarot_card") ||
      pileIds.includes("relationship_tarot_card") ||
      pileIds.includes("avatar_card")
    );
  }

  function seedSongTaggedAvatarCards(songEntry) {
    if (!isSongCard(songEntry?.card) || songEntry.songAvatarSeeded) return 0;
    songEntry.songAvatarSeeded = true;
    const avatarCards = songTaggedAvatarCards(songEntry.card)
      .sort((first, second) => Number(cardHasMotionMedia(second)) - Number(cardHasMotionMedia(first)))
      .slice(0, SONG_CARD_MEDIA_SEED_LIMIT);
    if (!avatarCards.length) {
      songEntry.songAvatarSeedCount = 0;
      return 0;
    }

    clearSongSeededMediaPoolEntries();
    const existingAvatarKeys = new Set(mediaPoolEntries.map((entry) => songLinkedAvatarKey(entry.card)).filter(Boolean));
    const originBase = DROP_ZONE_POSITION.clone().add(new THREE.Vector3(-0.16, 0.18, -0.12));
    let seeded = 0;
    avatarCards.forEach((avatarCard, index) => {
      const avatarKey = songLinkedAvatarKey(avatarCard);
      if (avatarKey && existingAvatarKeys.has(avatarKey)) return;
      if (avatarKey) existingAvatarKeys.add(avatarKey);
      const card = {
        ...avatarCard,
        seededFromSongCardId: songEntry.card.id || songEntry.card.sourceSongId || ""
      };
      const entry = createCardEntry(card);
      entry.songSeededFromSongCardId = card.seededFromSongCardId;
      entry.group.position.copy(originBase.clone().add(new THREE.Vector3(index * 0.025, index * 0.018, -index * 0.025)));
      world.add(entry.group);
      lockEntryInMediaPoolZone(entry);
      animateInstantDealEntry(entry, entry.group.position.clone(), index + 1, 0.76);
      seeded += 1;
    });
    songEntry.songAvatarSeedCount = seeded;
    return seeded;
  }

  function songTaggedAvatarCards(card = {}) {
    const parentId = card.id || card.sourceSongId || card.title || "";
    const candidates = [
      ...(Array.isArray(card.linkedAvatarCards) ? card.linkedAvatarCards : []),
      ...(Array.isArray(card.songAvatarCards) ? card.songAvatarCards : []),
      ...(Array.isArray(card.taggedAvatarCards) ? card.taggedAvatarCards : [])
    ];
    const seen = new Set();
    return candidates
      .map((avatarCard, index) => ({
        ...avatarCard,
        id: avatarCard.id || `song-seeded-avatar-${parentId}-${index + 1}`,
        seededFromSongCardId: parentId,
        tags: uniqueStrings([...(avatarCard.tags || []), "song-seeded", "media-pool"])
      }))
      .filter((avatarCard) => {
        const key = songLinkedAvatarKey(avatarCard);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function songLinkedAvatarKey(card = {}) {
    return card.sourceAvatarId ||
      card.avatarId ||
      card.targetAvatarId ||
      card.avatarContacts?.[0]?.id ||
      card.id ||
      card.title ||
      "";
  }

  function clearSongSeededMediaPoolEntries() {
    const seededEntries = mediaPoolEntries.filter((entry) => entry?.songSeededFromSongCardId || entry?.card?.seededFromSongCardId);
    if (!seededEntries.length) return 0;
    for (const entry of seededEntries) {
      mediaPoolEntries = mediaPoolEntries.filter((item) => item !== entry);
      placedEntries = placedEntries.filter((item) => item !== entry);
      if (hoveredEntry === entry) hoveredEntry = null;
      if (selectedEntry === entry) selectedEntry = null;
      disposeEntry(entry);
    }
    refreshMediaPoolStackTargets();
    resolvePlacedCardStacks();
    refreshDropZonePreviewPool({ resetScreens: false });
    return seededEntries.length;
  }

  function isInstantStartCenterCard(card = {}) {
    const pileIds = tarotPileIds(card);
    return [
      "major_arcana",
      "void_shadow",
      "hapa_tarot_card",
      "spell_card",
      "spell"
    ].some((id) => pileIds.includes(id));
  }

  function createInstantDealEntry(card, index = 0, options = {}) {
    const entry = createCardEntry(card);
    const originBase = options.originPosition?.isVector3 ? options.originPosition : DECK_POSITION;
    const origin = originBase.clone().add(new THREE.Vector3(
      ((index % 4) - 1.5) * 0.035,
      index * 0.012,
      (index % 2) * 0.025
    ));
    entry.group.position.copy(origin);
    world.add(entry.group);
    return { entry, origin };
  }

  function animateInstantDealEntry(entry, origin, index = 0, peak = 0.82) {
    entry.drawAnim = {
      life: -index * 0.045,
      duration: 0.92,
      from: origin.clone(),
      spin: Math.PI * (1.2 + index * 0.055),
      peak
    };
    entry.playing = playing;
    updateVideoPlayback(entry);
  }

  function dealFromDeckClick(targetPosition = pointerWorld) {
    if (heldEntry) return;
    if (!deckCards.length) {
      audio.play("empty");
      status = "Deck empty";
      publishHud(true);
      return;
    }
    const card = deckCards.shift();
    const entry = createCardEntry(card);
    const deckDeals = placedEntries.filter((item) => item.fromDeckClick).length;
    const col = deckDeals % 3;
    const row = Math.floor(deckDeals / 3) % 4;
    const targetX = THREE.MathUtils.clamp(DECK_POSITION.x + 0.66 + col * 0.38, -BOARD_LIMIT_X, SPREAD_LANE_MAX_X);
    const targetZ = THREE.MathUtils.clamp(DECK_POSITION.z - 0.52 - row * 0.38, -BOARD_LIMIT_Z, BOARD_LIMIT_Z);
    const blendedX = targetPosition?.isVector3 ? THREE.MathUtils.lerp(targetPosition.x, targetX, 0.72) : targetX;
    entry.state = "placed";
    entry.slotIndex = -1;
    entry.floatMotion = null;
    entry.fromDeckClick = true;
    entry.group.position.copy(DECK_POSITION);
    entry.targetPosition.set(blendedX, CARD_TABLE_BASE_Y, targetZ);
    entry.baseRotationY = -0.16 + col * 0.04;
    setCardTargetRotation(entry, 0, entry.baseRotationY, (col - 1) * 0.012);
    entry.drawAnim = {
      life: 0,
      duration: 0.86,
      from: DECK_POSITION.clone(),
      spin: Math.PI * 1.65,
      peak: 0.82
    };
    entry.placedAt = placedEntries.length;
    entry.playing = playing;
    placedEntries.push(entry);
    world.add(entry.group);
    resolvePlacedCardStacks();
    hoveredEntry = entry;
    entry.hover = true;
    selectEntry(entry);
    updateVideoPlayback(entry);
    audio.play("draw");
    deck.userData.pulse = 1;
    createBurst(DECK_POSITION.x, DECK_POSITION.z, 0x00f3ff, 1.0);
    status = `Deck pop: ${card.title}`;
    canvas.style.cursor = "default";
    publishHud(true);
    requestReading("deck-click");
  }

  function clear() {
    audio.play("clear");
    disposeSpawnNetwork();
    stopDropZonePreview();
    const preservedDock = new Set([...dockEntries.filter(Boolean), cameraCardEntry].filter(Boolean));
    for (const entry of [...placedEntries, heldEntry].filter(Boolean)) {
      if (preservedDock.has(entry)) continue;
      disposeEntry(entry);
    }
    for (const burst of placementBursts) disposeObject(burst.group);
    placedEntries = placedEntries.filter((entry) => preservedDock.has(entry));
    heldEntry = null;
    hoveredEntry = preservedDock.has(hoveredEntry) ? hoveredEntry : null;
    if (!preservedDock.has(selectedEntry)) clearSelectedEntry();
    dropZoneEntry = null;
    mediaPoolEntries = [];
    centerVisualizerEntries = [];
    placementBursts = [];
    sparkGroup.clear();
    dockEntries.forEach((entry, index) => {
      entry.state = "placed";
      entry.hover = entry === hoveredEntry;
      entry.magnetized = false;
      entry.magnetZone = "";
      entry.placedAt = index;
      entry.playing = playing;
      updateVideoPlayback(entry);
    });
    resolvePlacedCardStacks();
    refreshDockTargets({ snap: true });
    reshuffleDeck({ preserveLocked: true });
    refreshDockBackgroundPlayer({ force: true });
    saveTarotDrawSettings();
    status = dockEntries.length ? "Table cleared; Dock preserved" : "Table cleared";
    onReadingClear?.();
    publishHud(true);
  }

  function clearDeal({ preserveLocked = true } = {}) {
    disposeSpawnNetwork();
    const preservedEntries = preserveLocked
      ? new Set(lockedZoneEntries())
      : new Set(cameraCardEntry ? [cameraCardEntry] : []);
    const entriesToRemove = [...placedEntries, heldEntry]
      .filter(Boolean)
      .filter((entry) => !preservedEntries.has(entry));
    for (const entry of entriesToRemove) disposeEntry(entry);
    for (const burst of placementBursts) disposeObject(burst.group);

    placedEntries = preserveLocked
      ? placedEntries.filter((entry) => preservedEntries.has(entry))
      : [];
    heldEntry = null;
    hoveredEntry = preservedEntries.has(hoveredEntry) ? hoveredEntry : null;
    if (!preservedEntries.has(selectedEntry)) clearSelectedEntry();
    placementBursts = [];
    sparkGroup.clear();

    if (!preserveLocked) {
      dropZoneEntry = null;
      mediaPoolEntries = [];
      centerVisualizerEntries = [];
      dockEntries = [];
      stopDropZonePreview();
      refreshDockBackgroundPlayer({ force: true });
      saveTarotDrawSettings();
      onReadingClear?.();
      return;
    }

    dropZoneEntry = placedEntries.find((entry) => entry.lockedDropZone) || null;
    mediaPoolEntries = placedEntries.filter((entry) => entry.lockedMediaPool);
    centerVisualizerEntries = placedEntries.filter((entry) => entry.lockedCenterVisualizer);
    dockEntries = placedEntries.filter((entry) => entry.lockedDock);
    cameraCardEntry = placedEntries.find((entry) => entry.lockedCameraCard) || cameraCardEntry;
    placedEntries.forEach((entry, index) => {
      entry.state = "placed";
      entry.hover = entry === hoveredEntry;
      entry.magnetized = false;
      entry.magnetZone = "";
      entry.placedAt = index;
      entry.playing = playing;
      updateVideoPlayback(entry);
    });
    if (dropZoneEntry) {
      dropZoneEntry.targetPosition.copy(DROP_ZONE_POSITION);
      dropZoneEntry.targetPosition.y = DROP_ZONE_CARD_BASE_Y;
      dropZoneEntry.baseRotationY = 0;
      setCardTargetRotation(dropZoneEntry, 0, dropZoneEntry.baseRotationY, 0);
    }
    refreshMediaPoolStackTargets();
    refreshCenterVisualizerTargets();
    resolvePlacedCardStacks();
    refreshDockTargets({ snap: true });
    refreshDropZonePreviewPool({ resetScreens: false });
    refreshDockBackgroundPlayer({ force: true });
  }

  function lockedZoneEntries() {
    const entries = [];
    for (const entry of placedEntries) {
      if (entry && (entry.lockedDropZone || entry.lockedMediaPool || entry.lockedCenterVisualizer || entry.lockedDock || entry.lockedCameraCard) && !entries.includes(entry)) {
        entries.push(entry);
      }
    }
    if (dropZoneEntry && !entries.includes(dropZoneEntry)) entries.push(dropZoneEntry);
    for (const entry of mediaPoolEntries) {
      if (entry && !entries.includes(entry)) entries.push(entry);
    }
    for (const entry of centerVisualizerEntries) {
      if (entry && !entries.includes(entry)) entries.push(entry);
    }
    for (const entry of dockEntries) {
      if (entry && !entries.includes(entry)) entries.push(entry);
    }
    if (cameraCardEntry && !entries.includes(cameraCardEntry)) entries.push(cameraCardEntry);
    return entries;
  }

  function cardIdentity(card = {}) {
    return card.id || card.sourceId || card.uri || card.videoUri || card.title || "";
  }

  function availableDeckCards({ preserveLocked = true } = {}) {
    if (!preserveLocked) return cards;
    const reserved = new Set(lockedZoneEntries().map((entry) => cardIdentity(entry.card)).filter(Boolean));
    if (!reserved.size) return cards;
    return cards.filter((card) => {
      const key = cardIdentity(card);
      return !key || !reserved.has(key);
    });
  }

  function reshuffleDeck(options = {}) {
    deckCards = shuffleList(availableDeckCards(options));
  }

  function autoPlace(nextLayoutId = layoutId) {
    audio.play("spread");
    clearDeal();
    reshuffleDeck();
    layoutId = nextLayoutId;
    buildSlots(layoutId);
    const layout = LAYOUTS.find((item) => item.id === layoutId) || LAYOUTS[0];
    const slotCandidates = layout.slots
      .map((slot, slotIndex) => ({ slot, slotIndex }))
      .filter(({ slot }) => !slotConflictsWithLockedZone(slot));
    const count = Math.min(slotCandidates.length, deckCards.length);
    for (let index = 0; index < count; index += 1) {
      const card = deckCards.shift();
      const entry = createCardEntry(card);
      const { slot, slotIndex } = slotCandidates[index];
      const [x, _y, z, rotationY] = slot;
      entry.state = "placed";
      entry.slotIndex = slotIndex;
      entry.floatMotion = TAROT_CARD_FLOAT_MOTION_ENABLED ? motionForSlot(layout, slotIndex) : null;
      entry.delay = index * 0.11;
      entry.group.position.copy(DECK_POSITION).add(new THREE.Vector3(0, index * 0.012, 0));
      entry.targetPosition.set(x, CARD_TABLE_BASE_Y, z);
      entry.baseRotationY = rotationY;
      setCardTargetRotation(entry, 0, entry.baseRotationY, 0);
      entry.drawAnim = {
        life: -index * 0.08,
        duration: 1.05,
        from: DECK_POSITION.clone().add(new THREE.Vector3(0, index * 0.018, 0)),
        spin: Math.PI * (1.35 + index * 0.08),
        peak: 0.9 + index * 0.035
      };
      entry.placedAt = placedEntries.length;
      entry.playing = true;
      placedEntries.push(entry);
      world.add(entry.group);
      setTimeout(() => {
        if (!disposed) {
          audio.play("place", { quiet: index > 2 });
          createBurst(x, z, 0xf6c96d, 0.72);
        }
      }, index * 95);
      updateVideoPlayback(entry);
    }
    resolvePlacedCardStacks();
    clearSelectedEntry();
    deck.userData.pulse = 1;
    status = `${layout.label} spread placed`;
    publishHud(true);
    requestReading("layout");
  }

  function togglePlaying() {
    audio.play(playing ? "pause" : "resume");
    playing = !playing;
    for (const entry of [...placedEntries, heldEntry].filter(Boolean)) {
      entry.playing = playing && (entry.state === "placed" || entry.state === "held" || entry === hoveredEntry);
      updateVideoPlayback(entry);
    }
    updateDropZonePreviewPlayback();
    updateDockBackgroundPlayback();
    status = playing ? "Loops playing" : "Loops paused";
    publishHud(true);
  }

  function setSoundEnabled(nextEnabled) {
    audio.setEnabled(nextEnabled);
    dropSong.setEnabled(nextEnabled);
    if (nextEnabled) {
      audio.unlock?.();
      dropSong.unlock?.();
      dropSong.play?.();
    }
    updateDropZonePreviewPlayback();
    updateDockBackgroundPlayback();
    publishHud(true);
  }

  function setBackStyle(nextStyle) {
    if (!CARD_BACK_STYLES.some((style) => style.id === nextStyle)) return;
    backStyle = nextStyle;
    applyCardBackStyle(resources, backStyle);
    deck.userData.pulse = 1;
    audio.play("back");
    status = `Card back: ${CARD_BACK_STYLES.find((style) => style.id === backStyle)?.label || "Hapa"}`;
    saveTarotDrawSettings();
    publishHud(true);
  }

  function setMusicVisualizerMode(nextMode) {
    if (!MUSIC_VISUALIZER_MODES.some((mode) => mode.id === nextMode)) return;
    musicVisualizerMode = nextMode;
    audio.play("back");
    status = `Music visualizer: ${MUSIC_VISUALIZER_MODES.find((mode) => mode.id === musicVisualizerMode)?.label || "Hapa"}`;
    saveTarotDrawSettings();
    publishHud(true);
  }

  function setCenterVisualizerEnabled(nextEnabled) {
    centerVisualizerEnabled = Boolean(nextEnabled);
    audio.play("back");
    status = centerVisualizerEnabled ? "Middle visualizer on" : "Middle visualizer off";
    saveTarotDrawSettings();
    publishHud(true);
  }

  function setEchoDirectorProject(project = null) {
    const nextProject = normalizeEchoDirectorProject(project);
    const nextKey = echoDirectorProjectKeyFor(nextProject);
    if (nextKey === echoDirectorProjectKey) return;
    echoDirectorProject = nextProject;
    echoDirectorProjectKey = nextKey;
    echoDirectorTimelineSourceKey = "";
    if (!dropZoneEntry) {
      publishHud(true);
      return;
    }
    const song = activeDropZoneSong();
    if (song) dropSong.start(song);
    rebuildDropZonePreviewFromBoard();
    if (echoDirectorProjectIsActive()) {
      status = `Echo Album preview: ${echoDirectorProject.song_title || dropZoneEntry.card.title}`;
    }
    publishHud(true);
  }

  function setBackgroundVisualizerEnabled(nextEnabled) {
    backgroundVisualizerEnabled = Boolean(nextEnabled);
    audio.play("back");
    status = backgroundVisualizerEnabled ? "Background hyperspace on" : "Background hyperspace off";
    saveTarotDrawSettings();
    publishHud(true);
  }

  function setVideoBackgroundKeying(nextEnabled) {
    videoBackgroundKeying = Boolean(nextEnabled);
    applyVideoBackgroundKeying(world, videoBackgroundKeying);
    refreshDockBackgroundPlayer({ force: true });
    refreshDropZonePreviewPool({ resetScreens: true });
    refreshCenterPreviewFrame({ createIfMissing: false, force: true });
    audio.play("back");
    status = videoBackgroundKeying ? "Video cutout on" : "Video cutout off";
    saveTarotDrawSettings();
    publishHud(true);
  }

  function setEchoShadersEnabled(nextEnabled) {
    echoShadersEnabled = Boolean(nextEnabled);
    if (!echoShadersEnabled) clearEchoDirectorPreviewOverlays(dropPreview);
    audio.play("back");
    status = echoShadersEnabled ? "Echo shaders on" : "Echo shaders off";
    saveTarotDrawSettings();
    publishHud(true);
  }

  function setCameraCardShaderEnabled(nextEnabled) {
    cameraCardShaderEnabled = Boolean(nextEnabled);
    if (cameraCardEntry) applyCameraCardShaderMode(cameraCardEntry);
    updateDockBackgroundProjectionEffects(elapsedTime + rngSeed);
    audio.play("back", { quiet: true });
    status = cameraCardEntry
      ? `Camera Hapa Grade ${cameraCardShaderEnabled ? "on" : "off"}`
      : `Camera Hapa Grade ${cameraCardShaderEnabled ? "armed" : "off"}`;
    saveTarotDrawSettings();
    publishHud(true);
    return cameraCardShaderEnabled;
  }

  async function setCameraCardMicEnabled(nextEnabled) {
    if (!nextEnabled) {
      stopCameraCardMic();
      cameraCardMicError = "";
      audio.play("back", { quiet: true });
      status = "Camera Card mic off";
      publishHud(true);
      return false;
    }
    if (cameraCardMicEnabled && cameraCardMicAnalyser) {
      if (cameraCardMicContext?.state === "suspended") cameraCardMicContext.resume().catch(() => {});
      if (cameraCardEntry) ensureCameraCardMicWaveform(cameraCardEntry);
      status = cameraCardEntry ? "Camera Card mic live" : "Camera Card mic armed";
      publishHud(true);
      return true;
    }
    if (cameraCardMicPending) return false;
    if (!navigator?.mediaDevices?.getUserMedia) {
      cameraCardMicError = "microphone access is not available in this browser context";
      status = `Mic blocked: ${cameraCardMicError}`;
      publishHud(true);
      return false;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      cameraCardMicError = "Web Audio is not available in this browser context";
      status = `Mic blocked: ${cameraCardMicError}`;
      publishHud(true);
      return false;
    }

    cameraCardMicPending = true;
    cameraCardMicError = "";
    status = "Camera Card mic requesting microphone";
    publishHud(true);
    let stream = null;
    let context = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true
        },
        video: false
      });
      if (disposed) {
        stopMediaStream(stream);
        cameraCardMicPending = false;
        return false;
      }
      context = new AudioContextClass();
      if (context.state === "suspended") await context.resume().catch(() => {});
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const recordGain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const recordDestination = context.createMediaStreamDestination();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.42;
      recordGain.gain.value = CAMERA_CARD_MIC_RECORD_GAIN;
      compressor.threshold.value = -38;
      compressor.knee.value = 28;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      source.connect(analyser);
      source.connect(recordGain);
      recordGain.connect(compressor);
      compressor.connect(recordDestination);
      cameraCardMicStream = stream;
      cameraCardMicContext = context;
      cameraCardMicSource = source;
      cameraCardMicAnalyser = analyser;
      cameraCardMicRecordGain = recordGain;
      cameraCardMicCompressor = compressor;
      cameraCardMicRecordDestination = recordDestination;
      cameraCardMicRecordStream = recordDestination.stream;
      cameraCardMicData = new Uint8Array(analyser.fftSize);
      cameraCardMicLevel = 0;
      cameraCardMicEnabled = true;
      if (cameraCardEntry) ensureCameraCardMicWaveform(cameraCardEntry);
      audio.play("draw", { quiet: true });
      status = cameraCardEntry ? "Camera Card mic live" : "Camera Card mic armed";
      publishHud(true);
      return true;
    } catch (error) {
      stopMediaStream(stream);
      if (context && context.state !== "closed") context.close().catch(() => {});
      if (disposed) return false;
      cameraCardMicEnabled = false;
      cameraCardMicError = cameraCardMicErrorMessage(error);
      status = `Mic blocked: ${cameraCardMicError}`;
      publishHud(true);
      return false;
    } finally {
      cameraCardMicPending = false;
      if (!disposed) publishHud(true);
    }
  }

  function stopCameraCardMic() {
    if (cameraCardTranscriptionEnabled || cameraCardTranscriptionRecorder) stopCameraCardTranscription();
    cameraCardMicEnabled = false;
    cameraCardMicPending = false;
    cameraCardMicLevel = 0;
    removeCameraCardMicWaveform(cameraCardEntry);
    try {
      cameraCardMicSource?.disconnect?.();
      cameraCardMicAnalyser?.disconnect?.();
      cameraCardMicRecordGain?.disconnect?.();
      cameraCardMicCompressor?.disconnect?.();
      cameraCardMicRecordDestination?.disconnect?.();
    } catch {}
    stopMediaStream(cameraCardMicStream);
    stopMediaStream(cameraCardMicRecordStream);
    if (cameraCardMicContext && cameraCardMicContext.state !== "closed") {
      cameraCardMicContext.close().catch(() => {});
    }
    cameraCardMicStream = null;
    cameraCardMicContext = null;
    cameraCardMicSource = null;
    cameraCardMicAnalyser = null;
    cameraCardMicRecordGain = null;
    cameraCardMicCompressor = null;
    cameraCardMicRecordDestination = null;
    cameraCardMicRecordStream = null;
    cameraCardMicData = null;
  }

  async function setCameraCardTranscriptionEnabled(nextEnabled) {
    if (!nextEnabled) {
      stopCameraCardTranscription();
      cameraCardTranscriptionError = "";
      cameraCardTranscriptionNotice = "";
      audio.play("back", { quiet: true });
      status = "Camera Card dictation off";
      publishHud(true);
      return false;
    }
    if (cameraCardTranscriptionEnabled) {
      status = cameraCardTranscriptionCapturing
        ? "Camera Card dictation recording"
        : cameraCardTranscriptionInFlight
          ? "Camera Card dictation transcribing"
          : "Camera Card dictation listening";
      publishHud(true);
      return true;
    }
    if (typeof MediaRecorder === "undefined") {
      cameraCardTranscriptionError = "MediaRecorder is not available in this browser context";
      status = `Hapa Transcribe blocked: ${cameraCardTranscriptionError}`;
      publishHud(true);
      return false;
    }
    const micReady = await setCameraCardMicEnabled(true);
    if (!micReady || !cameraCardMicStream) {
      cameraCardTranscriptionError = cameraCardMicError || "microphone stream is not available";
      status = `Hapa Transcribe blocked: ${cameraCardTranscriptionError}`;
      publishHud(true);
      return false;
    }
    cameraCardTranscriptionEnabled = true;
    cameraCardTranscriptionCapturing = false;
    cameraCardTranscriptionInFlight = false;
    updateCameraCardTranscriptionPending();
    cameraCardTranscriptionError = "";
    cameraCardTranscriptionNotice = "Recording continuously. Transcription will catch up in the queue.";
    cameraCardTranscriptionQuietPolls = 0;
    cameraCardTranscriptionRunId += 1;
    scheduleCameraCardTranscription(80);
    audio.play("draw", { quiet: true });
    status = "Camera Card dictation listening";
    publishHud(true);
    return true;
  }

  function stopCameraCardTranscription() {
    cameraCardTranscriptionEnabled = false;
    cameraCardTranscriptionCapturing = false;
    cameraCardTranscriptionInFlight = false;
    cameraCardTranscriptionQueue = [];
    updateCameraCardTranscriptionPending();
    cameraCardTranscriptionQuietPolls = 0;
    cameraCardTranscriptionRunId += 1;
    if (cameraCardTranscriptionTimer) {
      clearTimeout(cameraCardTranscriptionTimer);
      cameraCardTranscriptionTimer = 0;
    }
    if (cameraCardTranscriptionStopTimer) {
      clearTimeout(cameraCardTranscriptionStopTimer);
      cameraCardTranscriptionStopTimer = 0;
    }
    const recorder = cameraCardTranscriptionRecorder;
    cameraCardTranscriptionRecorder = null;
    cameraCardTranscriptionChunks = [];
    try {
      if (recorder?.state === "recording") recorder.stop();
    } catch {}
  }

  function clearCameraCardJournal() {
    cameraCardTranscriptionJournal = [];
    cameraCardTranscript = "";
    writeTarotCameraJournal(cameraJournalKey, cameraCardTranscriptionJournal);
    cameraCardTranscriptionNotice = cameraCardTranscriptionEnabled
      ? "Camera Card journal cleared. Speak when ready."
      : "";
    status = "Camera Card journal cleared";
    publishHud(true);
    return true;
  }

  function scheduleCameraCardTranscription(delayMs = CAMERA_CARD_TRANSCRIBE_GAP_MS) {
    if (!cameraCardTranscriptionEnabled || !cameraCardMicStream) return false;
    if (cameraCardTranscriptionTimer) clearTimeout(cameraCardTranscriptionTimer);
    const runId = cameraCardTranscriptionRunId;
    cameraCardTranscriptionTimer = setTimeout(() => {
      cameraCardTranscriptionTimer = 0;
      recordCameraCardTranscriptionChunk(runId);
    }, Math.max(0, delayMs));
    return true;
  }

  function recordCameraCardTranscriptionChunk(runId = cameraCardTranscriptionRunId) {
    if (!cameraCardTranscriptionEnabled || runId !== cameraCardTranscriptionRunId || !cameraCardMicStream) return false;
    if (cameraCardTranscriptionRecorder || cameraCardTranscriptionCapturing) {
      scheduleCameraCardTranscription(CAMERA_CARD_TRANSCRIBE_CAPTURE_GAP_MS);
      return false;
    }
    const liveLevel = sampleCameraCardMicActivity();
    cameraCardTranscriptionQuietPolls = 0;
    const mimeType = preferredCameraCardAudioMimeType();
    const recordStream = liveCameraCardRecordStream() || cameraCardMicStream;
    let recorder = null;
    try {
      recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
    } catch (error) {
      cameraCardTranscriptionError = error?.message || "could not start microphone recorder";
      cameraCardTranscriptionEnabled = false;
      cameraCardTranscriptionCapturing = false;
      updateCameraCardTranscriptionPending();
      status = `Hapa Transcribe blocked: ${cameraCardTranscriptionError}`;
      publishHud(true);
      return false;
    }
    cameraCardTranscriptionRecorder = recorder;
    cameraCardTranscriptionChunks = [];
    cameraCardTranscriptionCapturing = true;
    updateCameraCardTranscriptionPending();
    cameraCardTranscriptionError = "";
    cameraCardTranscriptionNotice = cameraCardTranscriptionQueue.length
      ? `Recording... ${cameraCardTranscriptionQueue.length} clip${cameraCardTranscriptionQueue.length === 1 ? "" : "s"} queued.`
      : `Recording speech... mic level ${liveLevel.toFixed(3)}`;
    status = "Camera Card dictation recording";
    publishHud(true);
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) cameraCardTranscriptionChunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const chunks = cameraCardTranscriptionChunks;
      cameraCardTranscriptionChunks = [];
      if (cameraCardTranscriptionRecorder === recorder) cameraCardTranscriptionRecorder = null;
      if (cameraCardTranscriptionStopTimer) {
        clearTimeout(cameraCardTranscriptionStopTimer);
        cameraCardTranscriptionStopTimer = 0;
      }
      cameraCardTranscriptionCapturing = false;
      updateCameraCardTranscriptionPending();
      if (!cameraCardTranscriptionEnabled || runId !== cameraCardTranscriptionRunId) {
        publishHud(true);
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || chunks[0]?.type || "audio/webm" });
      enqueueCameraCardTranscriptionBlob(blob, runId);
      scheduleCameraCardTranscription(CAMERA_CARD_TRANSCRIBE_CAPTURE_GAP_MS);
    });
    recorder.start(1000);
    cameraCardTranscriptionStopTimer = setTimeout(() => {
      try {
        if (recorder.state === "recording") {
          recorder.requestData?.();
          recorder.stop();
        }
      } catch {}
    }, CAMERA_CARD_TRANSCRIBE_CHUNK_MS);
    return true;
  }

  function updateCameraCardTranscriptionPending() {
    cameraCardTranscriptionPending = Boolean(
      cameraCardTranscriptionCapturing ||
      cameraCardTranscriptionInFlight ||
      cameraCardTranscriptionQueue.length
    );
    return cameraCardTranscriptionPending;
  }

  function enqueueCameraCardTranscriptionBlob(blob, runId = cameraCardTranscriptionRunId) {
    if (runId !== cameraCardTranscriptionRunId) return false;
    if (!blob || blob.size < CAMERA_CARD_TRANSCRIBE_MIN_BYTES) {
      cameraCardTranscriptionLastResult = {
        ok: false,
        reason: "small-clip",
        bytes: blob?.size || 0,
        at: Date.now()
      };
      cameraCardTranscriptionNotice = `Tiny audio chunk skipped (${blob?.size || 0} bytes).`;
      status = "Camera Card dictation skipped a tiny chunk";
      updateCameraCardTranscriptionPending();
      publishHud(true);
      return false;
    }
    if (cameraCardTranscriptionQueue.length >= CAMERA_CARD_TRANSCRIBE_QUEUE_LIMIT) {
      cameraCardTranscriptionQueue.shift();
      cameraCardTranscriptionDropped += 1;
      cameraCardTranscriptionNotice = `Transcription queue is full; dropped oldest clip (${cameraCardTranscriptionDropped} total).`;
    }
    cameraCardTranscriptionQueue.push({
      id: `camera-card-transcription-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      blob,
      runId,
      createdAt: Date.now(),
      durationSeconds: CAMERA_CARD_TRANSCRIBE_CHUNK_MS / 1000
    });
    updateCameraCardTranscriptionPending();
    status = cameraCardTranscriptionInFlight
      ? `Camera Card dictation queued ${cameraCardTranscriptionQueue.length} clip${cameraCardTranscriptionQueue.length === 1 ? "" : "s"}`
      : "Camera Card dictation queued speech";
    publishHud(true);
    drainCameraCardTranscriptionQueue();
    return true;
  }

  function drainCameraCardTranscriptionQueue() {
    if (cameraCardTranscriptionInFlight) return false;
    const job = cameraCardTranscriptionQueue.shift();
    if (!job) {
      updateCameraCardTranscriptionPending();
      publishHud(true);
      return false;
    }
    cameraCardTranscriptionInFlight = true;
    updateCameraCardTranscriptionPending();
    status = `Hapa Transcribe large-v3 is reading queued speech (${cameraCardTranscriptionQueue.length} waiting)`;
    publishHud(true);
    transcribeCameraCardBlob(job.blob, job.runId, job)
      .catch((error) => {
        if (job.runId !== cameraCardTranscriptionRunId) return;
        cameraCardTranscriptionError = error?.message || "Hapa Transcribe failed";
        cameraCardTranscriptionEnabled = false;
        cameraCardTranscriptionQueue = [];
        if (cameraCardTranscriptionTimer) {
          clearTimeout(cameraCardTranscriptionTimer);
          cameraCardTranscriptionTimer = 0;
        }
        if (cameraCardTranscriptionStopTimer) {
          clearTimeout(cameraCardTranscriptionStopTimer);
          cameraCardTranscriptionStopTimer = 0;
        }
        cameraCardTranscriptionCapturing = false;
        cameraCardTranscriptionChunks = [];
        try {
          if (cameraCardTranscriptionRecorder?.state === "recording") cameraCardTranscriptionRecorder.stop();
        } catch {}
        status = `Hapa Transcribe blocked: ${cameraCardTranscriptionError}`;
      })
      .finally(() => {
        if (job.runId !== cameraCardTranscriptionRunId) return;
        cameraCardTranscriptionInFlight = false;
        updateCameraCardTranscriptionPending();
        publishHud(true);
        if (cameraCardTranscriptionQueue.length) drainCameraCardTranscriptionQueue();
      });
    return true;
  }

  function liveCameraCardRecordStream() {
    const tracks = cameraCardMicRecordStream?.getAudioTracks?.() || [];
    return tracks.some((track) => track.readyState === "live" && track.enabled !== false)
      ? cameraCardMicRecordStream
      : null;
  }

  async function transcribeCameraCardBlob(blob, runId = cameraCardTranscriptionRunId, job = {}) {
    if (runId !== cameraCardTranscriptionRunId) return null;
    if (!blob || blob.size < CAMERA_CARD_TRANSCRIBE_MIN_BYTES) {
      cameraCardTranscriptionLastResult = {
        ok: false,
        reason: "small-clip",
        bytes: blob?.size || 0,
        at: Date.now()
      };
      cameraCardTranscriptionNotice = `No usable audio captured (${blob?.size || 0} bytes). Speak closer to the mic.`;
      status = "Camera Card dictation did not capture audio";
      updateCameraCardTranscriptionPending();
      publishHud(true);
      return null;
    }
    const dataUrl = await blobToDataUrl(blob);
    const clipExtension = cameraCardTranscriptionClipExtension(blob.type);
    const chunkIndex = cameraCardTranscriptionChunkIndex;
    cameraCardTranscriptionChunkIndex += 1;
    const durationSeconds = Number(job?.durationSeconds || CAMERA_CARD_TRANSCRIBE_CHUNK_MS / 1000);
    status = `Hapa Transcribe large-v3 is reading Camera Card speech (${cameraCardTranscriptionQueue.length} queued)`;
    publishHud(true);
    const response = await fetch(tarotApiUrl("/api/hapa-transcribe/transcribe"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        mimeType: blob.type || "audio/webm",
        name: `tarot-camera-card-${Date.now()}.${clipExtension}`,
        sessionId: `tarot-camera-card-${avatarName || "avatar"}`,
        chunkIndex,
        model: CAMERA_CARD_TRANSCRIBE_MODEL,
        durationSeconds,
        language: "en"
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.message || payload?.error || `Hapa Transcribe returned HTTP ${response.status}`);
    }
    if (runId !== cameraCardTranscriptionRunId) return payload;
    const text = String(payload?.text || "").trim();
    cameraCardTranscriptionLastResult = {
      ok: true,
      text,
      bytes: blob.size,
      inputBytes: Number(payload?.inputBytes || 0),
      submittedBytes: Number(payload?.submittedBytes || 0),
      duration: Number(payload?.duration || 0),
      elapsedMs: Number(payload?.elapsedMs || 0),
      inputMimeType: payload?.inputMimeType || blob.type || "",
      submittedMimeType: payload?.submittedMimeType || "",
      submittedSampleRate: Number(payload?.submittedSampleRate || 0),
      transcriptionFilter: payload?.transcriptionFilter || "off",
      source: payload?.source || CAMERA_CARD_TRANSCRIBE_SOURCE,
      engine: payload?.engine || "",
      model: payload?.model || CAMERA_CARD_TRANSCRIBE_MODEL,
      serviceElapsedSeconds: Number(payload?.serviceElapsedSeconds || 0),
      debugClipPath: payload?.debugClipPath || "",
      attempts: Array.isArray(payload?.attempts) ? payload.attempts : [],
      at: Date.now()
    };
    if (text) {
      cameraCardTranscript = mergeCameraCardTranscript(cameraCardTranscript, text);
      appendCameraCardJournalEntry(text, payload);
      cameraCardTranscriptionError = "";
      cameraCardTranscriptionNotice = cameraCardTranscriptionQueue.length
        ? `${cameraCardTranscriptionQueue.length} queued clip${cameraCardTranscriptionQueue.length === 1 ? "" : "s"} still transcribing.`
        : "";
      status = "Hapa Transcribe saved Camera Card journal entry";
    } else {
      cameraCardTranscriptionNotice = `No words detected (${CAMERA_CARD_TRANSCRIBE_MODEL}, ${formatSeconds(payload?.duration || CAMERA_CARD_TRANSCRIBE_CHUNK_MS / 1000)} clip, ${Math.round(Number(payload?.elapsedMs || 0) / 100) / 10}s STT).`;
      status = "Hapa Transcribe returned no words";
    }
    updateCameraCardTranscriptionPending();
    publishHud(true);
    return payload;
  }

  function preferredCameraCardAudioMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    return [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4"
    ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
  }

  function cameraCardTranscriptionClipExtension(mimeType = "") {
    const normalized = String(mimeType || "").split(";")[0].toLowerCase();
    if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
    if (normalized.includes("mpeg")) return "mp3";
    if (normalized.includes("ogg")) return "ogg";
    if (normalized.includes("wav")) return "wav";
    return "webm";
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("Could not read audio blob")));
      reader.readAsDataURL(blob);
    });
  }

  function mergeCameraCardTranscript(current = "", next = "") {
    const joined = `${String(current || "").trim()} ${String(next || "").trim()}`.trim().replace(/\s+/g, " ");
    return joined.length > 320 ? joined.slice(-320).replace(/^\S+\s+/, "") : joined;
  }

  function appendCameraCardJournalEntry(text = "", payload = {}) {
    const value = String(text || "").trim();
    if (!value) return null;
    const now = new Date();
    const previous = cameraCardTranscriptionJournal[0];
    if (previous && previous.text === value && Date.now() - Number(previous.createdAtMs || 0) < 1_800) {
      return previous;
    }
    const entry = {
      id: `camera-card-journal-${now.getTime()}-${Math.round(Math.random() * 1e6)}`,
      text: value,
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      createdAt: now.toISOString(),
      createdAtMs: now.getTime(),
      source: payload?.source || CAMERA_CARD_TRANSCRIBE_SOURCE,
      engine: payload?.engine || "",
      model: payload?.model || CAMERA_CARD_TRANSCRIBE_MODEL,
      elapsedMs: Number(payload?.elapsedMs || 0),
      serviceElapsedSeconds: Number(payload?.serviceElapsedSeconds || 0)
    };
    cameraCardTranscriptionJournal = [entry, ...cameraCardTranscriptionJournal]
      .slice(0, CAMERA_CARD_TRANSCRIPT_JOURNAL_LIMIT);
    writeTarotCameraJournal(cameraJournalKey, cameraCardTranscriptionJournal);
    return entry;
  }

  function formatSeconds(value = 0) {
    const seconds = Number(value || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return "0.0s";
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }

  function tarotApiUrl(pathname = "") {
    const base = String(apiBase || "").replace(/\/+$/, "");
    return base ? `${base}${pathname}` : pathname;
  }

  function cameraCardMicErrorMessage(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      const runtime = window?.hapaAvatarBuilder?.runtime || "";
      return runtime === "electron"
        ? "permission denied by macOS or Electron microphone privacy settings"
        : "permission denied by this browser shell; use the Hapa desktop app or a system browser";
    }
    if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "no microphone device found";
    if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return "microphone is already in use";
    return error?.message || "microphone request failed";
  }

  function setLyricsEnabled(nextEnabled) {
    lyricsEnabled = Boolean(nextEnabled);
    if (!lyricsEnabled && lyricCrawl) {
      lyricCrawl.userData.activeBlend = 0;
      lyricCrawl.visible = false;
    }
    if (!lyricsEnabled) clearEchoDirectorPreviewOverlays(dropPreview);
    audio.play("back");
    status = lyricsEnabled ? "Lyrics on" : "Lyrics off";
    saveTarotDrawSettings();
    publishHud(true);
  }

  async function setCameraCardEnabled(nextEnabled) {
    if (!nextEnabled) {
      removeCameraCard();
      cameraCardError = "";
      status = "Camera Card off";
      audio.play("back", { quiet: true });
      publishHud(true);
      return false;
    }
    if (cameraCardEntry) {
      selectEntry(cameraCardEntry);
      status = "Camera Card live";
      publishHud(true);
      return true;
    }
    if (cameraCardPending) return false;
    if (!navigator?.mediaDevices?.getUserMedia) {
      cameraCardError = "Camera access is not available in this browser context";
      status = `Camera Card blocked: ${cameraCardError}`;
      publishHud(true);
      return false;
    }

    cameraCardPending = true;
    cameraCardError = "";
    status = "Camera Card requesting webcam";
    publishHud(true);
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      if (disposed) {
        stopMediaStream(stream);
        cameraCardPending = false;
        return false;
      }
      const entry = createCardEntry(createCameraCardData());
      entry.isCameraCard = true;
      entry.liveCamera = true;
      entry.lockedCameraCard = true;
      attachCameraStreamToEntry(entry, stream);
      placeCameraCardEntry(entry);
      cameraCardEntry = entry;
      selectEntry(entry);
      entry.video?.play?.().catch(() => {});
      audio.play("draw", { quiet: true });
      createBurst(CAMERA_CARD_POSITION.x, CAMERA_CARD_POSITION.z, 0x00f3ff, 1.05);
      createBurst(CAMERA_CARD_POSITION.x, CAMERA_CARD_POSITION.z, 0xff6df2, 0.62);
      status = "Camera Card live";
      publishHud(true);
      return true;
    } catch (error) {
      stopMediaStream(stream);
      if (disposed) return false;
      cameraCardError = cameraCardErrorMessage(error);
      status = `Camera Card blocked: ${cameraCardError}`;
      publishHud(true);
      return false;
    } finally {
      cameraCardPending = false;
      if (!disposed) publishHud(true);
    }
  }

  function createCameraCardData() {
    return {
      id: "__hapa_live_camera_card__",
      title: "Camera Card",
      subtitle: "Live webcam feed",
      archetype: "Local Lens",
      tarotNumber: "CAM",
      summary: "A live local camera feed mapped into a 3D tarot card face.",
      keywords: ["camera", "live", "operator", "mirror"],
      tags: ["camera-card", "live-feed"],
      sourceKind: "camera",
      kind: "camera",
      cardType: "camera_card",
      liveCamera: true
    };
  }

  function attachCameraStreamToEntry(entry, stream) {
    const baseMaterial = entry?.baseFaceMaterial || entry?.faceMaterial;
    if (!baseMaterial || !stream) return false;
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.offset.x = 1;
    texture.repeat.x = -1;
    entry.cameraStream = stream;
    entry.video = video;
    entry.videoTexture = texture;
    entry.baseFaceMaterial = baseMaterial;
    baseMaterial.map = texture;
    baseMaterial.emissiveMap = texture;
    baseMaterial.emissive?.setHex?.(0xffffff);
    baseMaterial.emissiveIntensity = 0.18;
    setVideoMaterialSourceAlpha(baseMaterial, false);
    baseMaterial.needsUpdate = true;
    entry.faceMaterial = baseMaterial;
    if (entry.faceMesh) entry.faceMesh.material = baseMaterial;
    entry.videoMatte = createVideoEdgeMatte(video, baseMaterial);
    applyCameraCardShaderMode(entry);
    return true;
  }

  function restoreCameraCardBaseMaterial(entry) {
    const baseMaterial = entry?.baseFaceMaterial || (entry?.faceMaterial !== entry?.cameraShaderMaterial ? entry?.faceMaterial : null);
    if (!entry || !baseMaterial) return false;
    if (entry.faceMesh) entry.faceMesh.material = baseMaterial;
    entry.faceMaterial = baseMaterial;
    entry.cameraShaderEnabled = false;
    return true;
  }

  function disposeCameraCardShaderMaterial(entry) {
    if (!entry) return false;
    const shaderMaterial = entry.cameraShaderMaterial;
    restoreCameraCardBaseMaterial(entry);
    if (shaderMaterial) {
      shaderMaterial.dispose();
      entry.cameraShaderMaterial = null;
      return true;
    }
    return false;
  }

  function applyCameraCardShaderMode(entry) {
    if (!entry?.isCameraCard || !entry.faceMesh) return false;
    if (!cameraCardShaderEnabled || !entry.videoTexture) {
      disposeCameraCardShaderMaterial(entry);
      return false;
    }
    if (!entry.cameraShaderMaterial) {
      entry.cameraShaderMaterial = createCameraCardHapaGradeMaterial(entry.videoTexture);
    }
    entry.cameraShaderMaterial.uniforms.inputImage.value = entry.videoTexture;
    entry.faceMesh.material = entry.cameraShaderMaterial;
    entry.faceMaterial = entry.cameraShaderMaterial;
    entry.cameraShaderEnabled = true;
    updateCameraCardShaderUniforms(entry, elapsedTime + rngSeed);
    return true;
  }

  function ensureCameraCardMicWaveform(entry) {
    if (!entry?.isCameraCard || !cameraCardMicEnabled || !cameraCardMicAnalyser) return null;
    if (!entry.micWaveformGroup) {
      entry.micWaveformGroup = createCameraCardMicWaveformOverlay();
      entry.group.add(entry.micWaveformGroup);
    }
    entry.micWaveformGroup.visible = true;
    return entry.micWaveformGroup;
  }

  function removeCameraCardMicWaveform(entry) {
    if (!entry?.micWaveformGroup) return false;
    entry.micWaveformGroup.parent?.remove(entry.micWaveformGroup);
    disposeObject(entry.micWaveformGroup);
    entry.micWaveformGroup = null;
    return true;
  }

  function ensureCameraCardTranscriptBubble(entry) {
    if (!entry?.isCameraCard) return null;
    if (!entry.transcriptBubbleGroup) {
      entry.transcriptBubbleGroup = createCameraCardTranscriptBubble();
      entry.group.add(entry.transcriptBubbleGroup);
    }
    return entry.transcriptBubbleGroup;
  }

  function removeCameraCardTranscriptBubble(entry) {
    if (!entry?.transcriptBubbleGroup) return false;
    entry.transcriptBubbleGroup.parent?.remove(entry.transcriptBubbleGroup);
    disposeObject(entry.transcriptBubbleGroup);
    entry.transcriptBubbleGroup = null;
    entry.transcriptBubbleTextKey = "";
    return true;
  }

  function cameraCardTranscriptBubbleText() {
    if (cameraCardTranscriptionError) return cameraCardTranscriptionError;
    const latestEntries = cameraCardTranscriptionJournal
      .slice(0, 3)
      .map((entry) => String(entry?.text || "").trim())
      .filter(Boolean);
    if (latestEntries.length) return latestEntries.join("\n");
    if (cameraCardTranscriptionNotice) return cameraCardTranscriptionNotice;
    return cameraCardTranscriptionEnabled ? "Listening..." : "";
  }

  function updateCameraCardTranscriptBubble(entry, elapsed = 0) {
    if (!entry?.isCameraCard) return;
    const displayText = cameraCardTranscriptBubbleText();
    const visible = Boolean(displayText || cameraCardTranscriptionEnabled || cameraCardTranscriptionPending);
    if (!visible) {
      if (entry.transcriptBubbleGroup) entry.transcriptBubbleGroup.visible = false;
      return;
    }
    const bubble = ensureCameraCardTranscriptBubble(entry);
    if (!bubble) return;
    const bubbleX = cameraCardBubbleSideX(entry);
    const pointer = bubbleX < 0 ? "right" : "left";
    const state = cameraCardTranscriptionError
      ? "error"
      : cameraCardTranscriptionCapturing
        ? "listening"
        : cameraCardTranscriptionInFlight || cameraCardTranscriptionQueue.length
          ? "transcribing"
          : cameraCardTranscriptionNotice && !cameraCardTranscriptionJournal.length
            ? "notice"
            : cameraCardTranscriptionEnabled
              ? "live"
              : "idle";
    const textKey = `${state}:${pointer}:${cameraCardTranscriptionQueue.length}:${cameraCardTranscriptionDropped}:${displayText}`;
    if (entry.transcriptBubbleTextKey !== textKey) {
      const texture = createCameraCardTranscriptTexture(displayText, { state, pointer });
      const material = bubble.userData?.bubbleMaterial;
      if (material) {
        material.map?.dispose?.();
        material.map = texture;
        material.opacity = cameraCardTranscriptionError ? 0.96 : 0.9;
        material.needsUpdate = true;
      }
      bubble.userData.texture = texture;
      entry.transcriptBubbleTextKey = textKey;
    }
    bubble.visible = true;
    const pulse = (cameraCardTranscriptionCapturing || cameraCardTranscriptionInFlight) ? (Math.sin(elapsed * 5.4) + 1) * 0.5 : 0;
    bubble.position.y = CARD_DEPTH / 2 + 0.078 + pulse * 0.008;
    bubble.position.x = bubbleX;
    bubble.position.z = CAMERA_CARD_SPEECH_BUBBLE_Z;
  }

  function cameraCardBubbleSideX(entry) {
    const x = Number(entry?.targetPosition?.x ?? entry?.group?.position?.x ?? 0);
    return x > 0.28 ? -CAMERA_CARD_SPEECH_BUBBLE_X : CAMERA_CARD_SPEECH_BUBBLE_X;
  }

  function updateCameraCardMicWaveform(entry, elapsed = 0) {
    if (!entry?.isCameraCard) return;
    if (!cameraCardMicEnabled || !cameraCardMicAnalyser || !cameraCardMicData) {
      if (entry.micWaveformGroup) entry.micWaveformGroup.visible = false;
      return;
    }
    const overlay = ensureCameraCardMicWaveform(entry);
    if (!overlay) return;
    cameraCardMicAnalyser.getByteTimeDomainData(cameraCardMicData);
    const positions = overlay.userData.positions;
    const geometry = overlay.userData.geometry;
    const coreLine = overlay.userData.coreLine;
    const glowLine = overlay.userData.glowLine;
    const plate = overlay.userData.plate;
    if (!positions || !geometry) return;
    let sum = 0;
    const pointCount = CAMERA_CARD_MIC_WAVE_POINTS;
    for (let i = 0; i < pointCount; i += 1) {
      const sampleIndex = Math.min(cameraCardMicData.length - 1, Math.floor((i / Math.max(1, pointCount - 1)) * cameraCardMicData.length));
      const raw = (cameraCardMicData[sampleIndex] - 128) / 128;
      const magnitude = Math.max(0, Math.abs(raw) - CAMERA_CARD_MIC_NOISE_FLOOR);
      const boosted = Math.min(1, Math.pow(magnitude * CAMERA_CARD_MIC_PREAMP, CAMERA_CARD_MIC_RESPONSE_CURVE));
      const shaped = Math.sign(raw) * boosted;
      sum += shaped * shaped;
      const edgeFalloff = Math.sin((i / Math.max(1, pointCount - 1)) * Math.PI);
      const shimmer = Math.sin(elapsed * 4.4 + i * 0.16) * 0.018;
      const targetY = (shaped * 0.86 + shimmer) * CAMERA_CARD_MIC_WAVE_HEIGHT * (0.5 + edgeFalloff * 0.5);
      const offset = i * 3;
      positions[offset + 1] = THREE.MathUtils.lerp(positions[offset + 1], targetY, 0.44);
    }
    cameraCardMicLevel = THREE.MathUtils.lerp(
      cameraCardMicLevel,
      Math.min(1, Math.sqrt(sum / pointCount) * 1.55),
      0.36
    );
    geometry.attributes.position.needsUpdate = true;
    const pulse = 0.35 + cameraCardMicLevel * 0.65;
    if (coreLine?.material) coreLine.material.opacity = 0.52 + pulse * 0.42;
    if (glowLine?.material) glowLine.material.opacity = 0.16 + pulse * 0.26;
    if (plate?.material) plate.material.opacity = 0.1 + pulse * 0.1;
    overlay.position.y = CARD_DEPTH / 2 + 0.052 + cameraCardMicLevel * 0.012;
  }

  function sampleCameraCardMicActivity() {
    if (!cameraCardMicAnalyser || !cameraCardMicData) return Number(cameraCardMicLevel || 0);
    try {
      cameraCardMicAnalyser.getByteTimeDomainData(cameraCardMicData);
    } catch {
      return Number(cameraCardMicLevel || 0);
    }
    let sum = 0;
    for (let i = 0; i < cameraCardMicData.length; i += 1) {
      const raw = (cameraCardMicData[i] - 128) / 128;
      const magnitude = Math.max(0, Math.abs(raw) - CAMERA_CARD_MIC_NOISE_FLOOR);
      const boosted = Math.min(1, Math.pow(magnitude * CAMERA_CARD_MIC_PREAMP, CAMERA_CARD_MIC_RESPONSE_CURVE));
      sum += boosted * boosted;
    }
    const level = Math.min(1, Math.sqrt(sum / Math.max(1, cameraCardMicData.length)) * 1.55);
    cameraCardMicLevel = Math.max(cameraCardMicLevel * 0.82, level);
    return level;
  }

  function cameraCardYawForPosition(position = CAMERA_CARD_POSITION) {
    return Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
  }

  function applyCameraCardPose(entry, position = entry?.targetPosition || CAMERA_CARD_POSITION) {
    if (!entry) return;
    entry.cameraCardBaseY = Number.isFinite(Number(position.y)) ? Number(position.y) : CAMERA_CARD_BASE_Y;
    entry.targetPosition.copy(position);
    entry.baseRotationY = cameraCardYawForPosition(entry.targetPosition);
    setCardTargetRotation(entry, CAMERA_CARD_PITCH, entry.baseRotationY, CAMERA_CARD_ROLL);
  }

  function placeCameraCardEntry(entry) {
    if (!entry) return;
    entry.state = "placed";
    entry.hover = false;
    entry.slotIndex = -1;
    entry.floatMotion = {
      type: "wave",
      index: 0,
      phase: 2.7,
      amplitudeX: 0.035,
      amplitudeZ: 0.026,
      amplitudeY: 0.032,
      speed: 0.42
    };
    entry.lockedDropZone = false;
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = true;
    entry.magnetized = false;
    entry.magnetZone = "";
    entry.group.position.copy(DECK_POSITION).add(new THREE.Vector3(0.22, 0.2, -0.18));
    applyCameraCardPose(entry, CAMERA_CARD_POSITION);
    entry.drawAnim = {
      life: 0,
      duration: 0.84,
      from: entry.group.position.clone(),
      spin: Math.PI * 1.05,
      peak: 0.82
    };
    entry.placedAt = placedEntries.length;
    entry.playing = true;
    if (!placedEntries.includes(entry)) placedEntries.push(entry);
    world.add(entry.group);
    resolvePlacedCardStacks();
  }

  function placeCameraCardAt(entry, hit) {
    if (!entry) return;
    const x = THREE.MathUtils.clamp(hit?.x ?? entry.targetPosition.x, -BOARD_LIMIT_X, BOARD_LIMIT_X);
    const z = THREE.MathUtils.clamp(hit?.z ?? entry.targetPosition.z, -BOARD_LIMIT_Z, BOARD_LIMIT_Z);
    entry.state = "placed";
    entry.hover = false;
    entry.slotIndex = -1;
    entry.floatMotion = {
      type: "wave",
      index: 0,
      phase: 2.7,
      amplitudeX: 0.035,
      amplitudeZ: 0.026,
      amplitudeY: 0.032,
      speed: 0.42
    };
    entry.lockedDropZone = false;
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = true;
    entry.magnetized = false;
    entry.magnetZone = "";
    entry.drawAnim = null;
    entry.delay = 0;
    entry.pitchOffset = 0;
    entry.angleOffset = 0;
    resetCardFocus(entry, { closeDetails: true });
    applyCameraCardPose(entry, new THREE.Vector3(x, CAMERA_CARD_BASE_Y, z));
    entry.placedAt = placedEntries.includes(entry) ? entry.placedAt : placedEntries.length;
    entry.playing = true;
    if (!placedEntries.includes(entry)) placedEntries.push(entry);
    cameraCardEntry = entry;
    selectEntry(entry);
    updateVideoPlayback(entry);
    resolvePlacedCardStacks();
    createBurst(x, z, 0x00f3ff, 0.76);
    status = "Camera Card placed";
    publishHud(true);
  }

  function removeCameraCard() {
    const entry = cameraCardEntry;
    if (cameraCardMicEnabled || cameraCardMicStream) stopCameraCardMic();
    cameraCardEntry = null;
    cameraCardPending = false;
    if (!entry) return;
    placedEntries = placedEntries.filter((item) => item !== entry);
    mediaPoolEntries = mediaPoolEntries.filter((item) => item !== entry);
    centerVisualizerEntries = centerVisualizerEntries.filter((item) => item !== entry);
    dockEntries = dockEntries.filter((item) => item !== entry);
    if (dropZoneEntry === entry) dropZoneEntry = null;
    if (heldEntry === entry) heldEntry = null;
    if (hoveredEntry === entry) hoveredEntry = null;
    if (selectedEntry === entry) selectedEntry = null;
    disposeEntry(entry);
    resolvePlacedCardStacks();
    refreshDropZonePreviewPool({ resetScreens: false });
    refreshDockBackgroundPlayer({ force: true });
    canvas.style.cursor = "default";
  }

  function cameraCardErrorMessage(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      const runtime = window?.hapaAvatarBuilder?.runtime || "";
      return runtime === "electron"
        ? "permission denied by macOS or Electron camera privacy settings"
        : "permission denied by this browser shell; use the Hapa desktop app or a system browser";
    }
    if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "no camera device found";
    if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return "camera is already in use";
    return error?.message || "webcam request failed";
  }

  function stopMediaStream(stream) {
    stream?.getTracks?.().forEach((track) => track.stop());
  }

  function setLyricCrawlAngleDegrees(nextAngle) {
    lyricCrawlAngleDegrees = clampLyricCrawlAngleDegrees(nextAngle);
    if (lyricCrawl) applyLyricCrawlAngle(lyricCrawl, lyricCrawlAngleDegrees);
    status = `Lyrics angle: ${lyricCrawlAngleDegrees}°`;
    saveTarotDrawSettings();
    publishHud(true);
  }

  function spawnMusicSlotCards({ kind = "relationship", avatar = null, cards: spawnCards = [] } = {}) {
    const normalizedCards = normalizeSpawnNetworkCards(spawnCards, kind, avatar);
    if (!avatar) {
      status = "Lock an avatar into the music slot first";
      publishHud(true);
      return false;
    }
    if (!normalizedCards.length) {
      status = `${avatar.name || "Music slot avatar"} has no ${spawnKindLabel(kind).toLowerCase()} to spawn`;
      publishHud(true);
      return false;
    }
    disposeSpawnNetwork();
    spawnNetwork = createSpawnNetwork({
      avatar,
      cards: normalizedCards,
      kind
    });
    spawnNetworkLayer.add(spawnNetwork.group);
    audio.play(kind === "skill" ? "back" : "spread");
    createBurst(SPAWN_NETWORK_CENTER.x, SPAWN_NETWORK_CENTER.z, kind === "skill" ? 0x39ff14 : 0xff6df2, 1.08);
    createBurst(SPAWN_NETWORK_CENTER.x, SPAWN_NETWORK_CENTER.z, 0x00f3ff, 0.72);
    status = `${spawnKindLabel(kind)} spawned for ${avatar.name || "music slot avatar"}`;
    publishHud(true);
    return true;
  }

  function wipeSpawnedCards() {
    if (!spawnNetwork) {
      status = "No spawned card network";
      publishHud(true);
      return false;
    }
    const count = spawnNetwork.cards.length;
    disposeSpawnNetwork();
    audio.play("clear");
    status = `Wiped ${count} spawned cards`;
    publishHud(true);
    return true;
  }

  function useSpawnedCardsOnSurface() {
    if (!spawnNetwork?.cards?.length) {
      status = "Spawn cards before using them on the surface";
      publishHud(true);
      return false;
    }
    const cardsToPlace = spawnNetwork.cards.slice();
    const kind = spawnNetwork.kind;
    const origin = spawnNetwork.origin.clone();
    disposeSpawnNetwork();
    placeSpawnedCardsOnSurface(cardsToPlace, kind, origin);
    return true;
  }

  function placeSpawnedCardsOnSurface(cardsToPlace = [], kind = "relationship", origin = SPAWN_NETWORK_CENTER) {
    const count = Math.min(cardsToPlace.length, SPAWN_NETWORK_MAX_CARDS);
    if (!count) return;
    const perRow = Math.min(4, Math.ceil(Math.sqrt(count * 1.45)));
    const rows = Math.ceil(count / perRow);
    for (let index = 0; index < count; index += 1) {
      const card = cardsToPlace[index];
      const row = Math.floor(index / perRow);
      const rowStart = row * perRow;
      const rowSize = Math.min(perRow, count - rowStart);
      const col = index - rowStart;
      const centeredCol = col - (rowSize - 1) / 2;
      const centeredRow = row - (rows - 1) / 2;
      const x = THREE.MathUtils.clamp(0.08 + centeredCol * 1.02, -1.35, 1.85);
      const z = THREE.MathUtils.clamp(-0.28 + centeredRow * 1.26, -1.42, 0.86);
      const entry = createCardEntry(card);
      entry.state = "placed";
      entry.slotIndex = -1;
      entry.floatMotion = null;
      entry.fromSpawnNetwork = true;
      entry.group.position.copy(origin);
      entry.targetPosition.set(x, CARD_TABLE_BASE_Y, z);
      entry.baseRotationY = centeredCol * -0.045;
      entry.angleOffset = THREE.MathUtils.clamp(centeredCol * -0.015, -0.12, 0.12);
      setCardTargetRotation(entry, 0, entry.baseRotationY, centeredRow * 0.01);
      entry.drawAnim = {
        life: -index * 0.035,
        duration: 0.78,
        from: origin.clone(),
        spin: Math.PI * (0.85 + index * 0.06),
        peak: 0.52 + index * 0.015
      };
      entry.placedAt = placedEntries.length;
      entry.playing = playing;
      placedEntries.push(entry);
      world.add(entry.group);
      updateVideoPlayback(entry);
      setTimeout(() => {
        if (!disposed) createBurst(x, z, kind === "skill" ? 0x39ff14 : 0xff6df2, 0.62);
      }, index * 55);
    }
    resolvePlacedCardStacks();
    selectEntry(placedEntries.at(-1) || selectedEntry);
    audio.play("spread");
    status = `${spawnKindLabel(kind)} used on surface`;
    publishHud(true);
    requestReading("spawn-surface");
  }

  function disposeSpawnNetwork() {
    if (!spawnNetwork) return;
    disposeObject(spawnNetwork.group);
    spawnNetworkLayer.remove(spawnNetwork.group);
    spawnNetwork = null;
  }

  function spawnNetworkFromDropZone(kind = "relationship") {
    const avatar = dropZoneEntry?.card?.avatarContacts?.[0] || null;
    const spawnCards = kind === "skill"
      ? avatar?.profile?.skillCards || []
      : avatar?.profile?.relationshipTarotCards || [];
    return spawnMusicSlotCards({ kind, avatar, cards: spawnCards });
  }

  function diagnosticLockFirstMusicSlotAvatar() {
    const card = cards.find((item) => {
      const contact = item.avatarContacts?.[0];
      return contact?.profile?.relationshipTarotCards?.length || contact?.profile?.skillCards?.length;
    }) || cards.find((item) => item.avatarContacts?.length);
    if (!card) {
      status = "No avatar-linked card available for music slot";
      publishHud(true);
      return false;
    }
    if (dropZoneEntry?.card?.id === card.id) return true;
    const entry = createCardEntry(card);
    entry.group.position.copy(DECK_POSITION);
    entry.targetPosition.copy(DROP_ZONE_POSITION);
    entry.targetPosition.y = DROP_ZONE_CARD_BASE_Y;
    world.add(entry.group);
    lockEntryInDropZone(entry);
    return true;
  }

  function handlePointerMove(event) {
    updatePointer(event);
    const hit = raycastTable();
    if (hit) pointerWorld.copy(hit).setY(TABLE_Y);
    if (heldEntry) {
      const x = THREE.MathUtils.clamp(pointerWorld.x, -BOARD_LIMIT_X, BOARD_LIMIT_X);
      const z = THREE.MathUtils.clamp(pointerWorld.z, -BOARD_LIMIT_Z, BOARD_LIMIT_Z);
      if (heldEntry.isCameraCard) {
        const dockStrength = dockMagnetStrength(pointerWorld);
        const wasMagnetized = heldEntry.magnetized;
        const targetX = THREE.MathUtils.lerp(x, DOCK_POSITION.x, dockStrength);
        const targetZ = THREE.MathUtils.lerp(z, DOCK_POSITION.z, dockStrength);
        const targetY = THREE.MathUtils.lerp(CAMERA_CARD_HOLD_Y, DOCK_CARD_BASE_Y + 0.58, dockStrength);
        heldEntry.magnetized = dockStrength > 0;
        heldEntry.magnetZone = heldEntry.magnetized ? "dock" : "";
        applyCameraCardPose(heldEntry, cameraCardPoseScratch.set(targetX, targetY, targetZ));
        if (heldEntry.magnetized) setCardTargetRotation(heldEntry, DOCK_CARD_PITCH, 0, 0);
        if (heldEntry.magnetized !== wasMagnetized) publishHud(true);
        status = heldEntry.magnetized ? `Dock pulling: ${heldEntry.card.title}` : "Moving Camera Card";
        controls.enabled = false;
        return;
      }
      const activeMagnet = strongestMagnetZone(pointerWorld);
      const magnetZone = activeMagnet.strength > 0 ? activeMagnet.id : "";
      const activeStrength = activeMagnet.strength;
      const activeTarget = activeMagnet.position || DROP_ZONE_POSITION;
      const wasMagnetized = heldEntry.magnetized;
      const previousZone = heldEntry.magnetZone || "";
      heldEntry.magnetized = activeStrength > 0;
      heldEntry.magnetZone = heldEntry.magnetized ? magnetZone : "";
      if (heldEntry.magnetized !== wasMagnetized || heldEntry.magnetZone !== previousZone) {
        status = heldEntry.magnetized
          ? `${magnetZoneLabel(heldEntry.magnetZone)} pulling: ${heldEntry.card.title}`
          : `Holding: ${heldEntry.card.title}`;
        publishHud(true);
      }
      const targetX = THREE.MathUtils.lerp(x, activeTarget.x, activeStrength);
      const targetZ = THREE.MathUtils.lerp(z, activeTarget.z, activeStrength);
      const magnetY = magnetZone === "center" ? CENTER_VISUALIZER_CARD_BASE_Y + 0.32 : magnetZone === "dock" ? DOCK_CARD_BASE_Y + 0.58 : 0.86;
      const targetY = THREE.MathUtils.lerp(0.68, magnetY, activeStrength);
      heldEntry.targetPosition.set(targetX, targetY, targetZ);
      heldEntry.baseRotationY = THREE.MathUtils.lerp(x * -0.18, magnetZone === "media" ? -0.18 : magnetZone === "center" ? 0.36 : magnetZone === "dock" ? 0 : 0, activeStrength);
      setCardTargetRotation(
        heldEntry,
        THREE.MathUtils.lerp(-0.18 + z * 0.035, magnetZone === "center" ? -0.03 : magnetZone === "dock" ? DOCK_CARD_PITCH : -0.1, activeStrength),
        heldEntry.baseRotationY,
        THREE.MathUtils.lerp(x * 0.04, magnetZone === "center" ? 0.05 : magnetZone === "dock" ? 0 : 0, activeStrength)
      );
      controls.enabled = false;
      return;
    }
    controls.enabled = true;
    updateHover();
  }

  function handlePointerDown(event) {
    updatePointer(event);
    if (!heldEntry && isDeckHit()) {
      const hit = raycastTable();
      if (hit) pointerWorld.copy(hit).setY(TABLE_Y);
      dealFromDeckClick(pointerWorld.clone());
      event.preventDefault();
      return;
    }
    if (heldEntry) {
      const hit = raycastTable();
      if (!hit) return;
      placeHeld(hit);
      return;
    }
    updateHover();
    if (hoveredEntry?.isCameraCard) {
      pickUp(hoveredEntry);
      event.preventDefault();
      return;
    }
    if (hoveredEntry) pickUp(hoveredEntry);
  }

  function handleWheel(event) {
    if (heldEntry) {
      const entry = heldEntry;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      const delta = THREE.MathUtils.clamp(event.deltaY || 0, -220, 220);
      if (event.shiftKey || event.altKey) {
        entry.angleOffset = THREE.MathUtils.clamp(entry.angleOffset - delta * 0.0025, -Math.PI * 0.55, Math.PI * 0.55);
        status = `Spun: ${entry.card.title}`;
      } else {
        entry.pitchOffset = THREE.MathUtils.clamp((entry.pitchOffset || 0) - delta * 0.0034, CARD_PITCH_MIN, CARD_PITCH_MAX);
        status = `Tilted: ${entry.card.title}`;
      }
      refreshCardTargetRotation(entry);
      deck.userData.pulse = Math.max(deck.userData.pulse || 0, 0.28);
      audio.play("angle");
      publishHud(true);
      return;
    }
    if (selectedEntry?.isCameraCard) {
      moveSelectedCameraCardByWheel(event);
      return;
    }
    if (recoverPreviewGalleryFromWheel(event)) return;
    if (!selectedEntry) return;
    if (selectedEntry.lockedDock) {
      clearSelectedEntry();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    focusSelectedByWheel(event.deltaY || 0);
  }

  function moveSelectedCameraCardByWheel(event) {
    const entry = selectedEntry;
    if (!entry?.isCameraCard) return false;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    const delta = THREE.MathUtils.clamp(event.deltaY || 0, -220, 220);
    camera.getWorldDirection(cameraCardWheelDirectionScratch);
    cameraCardWheelDirectionScratch.y = 0;
    if (cameraCardWheelDirectionScratch.lengthSq() < 0.0001) cameraCardWheelDirectionScratch.set(0, 0, -1);
    cameraCardWheelDirectionScratch.normalize();
    const next = cameraCardPoseScratch.copy(entry.targetPosition).addScaledVector(cameraCardWheelDirectionScratch, delta * CAMERA_CARD_WHEEL_STEP);
    next.x = THREE.MathUtils.clamp(next.x, -BOARD_LIMIT_X, BOARD_LIMIT_X);
    next.z = THREE.MathUtils.clamp(next.z, -BOARD_LIMIT_Z, BOARD_LIMIT_Z);
    next.y = CAMERA_CARD_BASE_Y;
    applyCameraCardPose(entry, next);
    resolvePlacedCardStacks();
    deck.userData.pulse = Math.max(deck.userData.pulse || 0, 0.2);
    status = delta > 0 ? "Camera Card pushed back" : "Camera Card pulled forward";
    audio.play("angle", { quiet: true });
    publishHud(true);
    return true;
  }

  function recoverPreviewGalleryFromWheel(event) {
    const deltaY = Number(event?.deltaY || 0);
    if (!dropPreview?.screens?.length || deltaY <= 0) return false;
    const focusedCardProgress = selectedEntry && !selectedEntry.lockedDock
      ? Math.max(selectedEntry.focusTargetProgress || 0, selectedEntry.focusProgress || 0)
      : 0;
    const cameraDistance = camera.position.distanceTo(controls.target);
    const forwardCrowded = cameraDistance <= Math.max(
      CAMERA_GALLERY_RECOVERY_CLOSE_DISTANCE,
      controls.minDistance + (compactMode ? 0.75 : 0.95)
    );
    const focusCrowded = focusedCardProgress > 0.18;
    if (!forwardCrowded && !focusCrowded) return false;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    requestPreviewGalleryRecovery();
    if (selectedEntry && !selectedEntry.lockedDock) resetCardFocus(selectedEntry, { closeDetails: true });
    status = "Gallery view: three video frames framed";
    deck.userData.pulse = Math.max(deck.userData.pulse || 0, 0.2);
    audio.play("back", { quiet: true });
    publishHud(true);
    return true;
  }

  function requestPreviewGalleryRecovery() {
    const galleryPosition = galleryCameraPositionScratch
      .copy(CAMERA_GALLERY_RECOVERY_POSITION)
      .add(compactMode ? new THREE.Vector3(0, 0.34, 0.58) : new THREE.Vector3(0, 0, 0));
    const galleryTarget = galleryCameraTargetScratch
      .copy(CAMERA_GALLERY_RECOVERY_TARGET)
      .add(compactMode ? new THREE.Vector3(0, 0.04, -0.12) : new THREE.Vector3(0, 0, 0));
    cameraGalleryRecovery = {
      elapsed: 0,
      duration: compactMode ? CAMERA_GALLERY_RECOVERY_DURATION * 0.92 : CAMERA_GALLERY_RECOVERY_DURATION,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromFov: camera.fov,
      toPosition: galleryPosition.clone(),
      toTarget: galleryTarget.clone(),
      toFov: compactMode ? 57 : CAMERA_GALLERY_RECOVERY_FOV
    };
    cameraGalleryRecoveryBlend = Math.max(cameraGalleryRecoveryBlend, 0.72);
    controls.maxDistance = Math.max(controls.maxDistance, compactMode ? 11.6 : CAMERA_GALLERY_RECOVERY_MAX_DISTANCE);
    return true;
  }

  function selectEntry(entry) {
    if (selectedEntry && selectedEntry !== entry) resetCardFocus(selectedEntry, { closeDetails: true });
    selectedEntry = entry || null;
    updateVideoPlayback();
  }

  function clearSelectedEntry() {
    if (selectedEntry) resetCardFocus(selectedEntry, { closeDetails: true });
    selectedEntry = null;
    updateVideoPlayback();
  }

  function resetCardFocus(entry, { closeDetails = true } = {}) {
    if (!entry) return;
    entry.focusTargetProgress = 0;
    entry.focusProgress = 0;
    entry.autoDetailsOpen = false;
    if (closeDetails) {
      entry.detailsOpen = false;
      entry.manualDetailsOpen = false;
    }
  }

  function resetCardSurfacePose(entry) {
    if (!entry) return;
    entry.drawAnim = null;
    entry.delay = 0;
    entry.pitchOffset = 0;
    entry.angleOffset = 0;
    resetCardFocus(entry, { closeDetails: true });
  }

  function toggleSelectedDetails() {
    if (!selectedEntry) return false;
    const nextOpen = !Boolean(selectedEntry.detailsOpen || selectedEntry.manualDetailsOpen);
    selectedEntry.manualDetailsOpen = nextOpen;
    selectedEntry.detailsOpen = nextOpen;
    if (!nextOpen) selectedEntry.autoDetailsOpen = false;
    status = nextOpen ? `Card Details: ${selectedEntry.card.title}` : `Card Details closed: ${selectedEntry.card.title}`;
    audio.play(nextOpen ? "hover" : "back", { quiet: true });
    publishHud(true);
    return nextOpen;
  }

  function openDetailTarget() {
    const entry = cardDetailTargetEntry();
    if (!entry) return false;
    selectEntry(entry);
    entry.manualDetailsOpen = true;
    entry.detailsOpen = true;
    entry.autoDetailsOpen = false;
    status = `Card Details: ${entry.card.title}`;
    audio.play("hover", { quiet: true });
    publishHud(true);
    return true;
  }

  function focusSelectedByWheel(deltaY = 0) {
    const entry = selectedEntry;
    if (!entry || entry.lockedDock) return false;
    const delta = THREE.MathUtils.clamp(deltaY || 0, -220, 220);
    const current = Number.isFinite(entry.focusTargetProgress) ? entry.focusTargetProgress : entry.focusProgress || 0;
    const next = THREE.MathUtils.clamp(current - delta * CARD_FOCUS_WHEEL_STEP, 0, 1);
    entry.focusTargetProgress = next;
    if (next >= CARD_FOCUS_OPEN_THRESHOLD) {
      entry.detailsOpen = true;
      entry.autoDetailsOpen = true;
    } else if (next <= CARD_FOCUS_CLOSE_THRESHOLD && entry.autoDetailsOpen) {
      entry.autoDetailsOpen = false;
      entry.detailsOpen = Boolean(entry.manualDetailsOpen);
    }
    if (next <= 0.01 && !entry.manualDetailsOpen) {
      entry.detailsOpen = false;
      entry.autoDetailsOpen = false;
    }
    status = next > 0.01 ? `Focus zoom: ${entry.card.title}` : `Returned: ${entry.card.title}`;
    deck.userData.pulse = Math.max(deck.userData.pulse || 0, 0.22);
    audio.play("angle", { quiet: true });
    publishHud(true);
    return true;
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function cardPitch(entry, basePitch = 0) {
    return THREE.MathUtils.clamp(basePitch + (entry?.pitchOffset || 0), CARD_PITCH_MIN, CARD_PITCH_MAX);
  }

  function setCardTargetRotation(entry, basePitch = 0, baseRotationY = entry?.baseRotationY || 0, roll = 0) {
    if (!entry) return;
    entry.basePitch = basePitch;
    entry.baseRotationY = baseRotationY;
    entry.baseRoll = roll;
    entry.targetRotation.set(cardPitch(entry, basePitch), baseRotationY + (entry.angleOffset || 0), roll);
  }

  function refreshCardTargetRotation(entry) {
    if (!entry) return;
    setCardTargetRotation(entry, entry.basePitch || 0, entry.baseRotationY || 0, entry.baseRoll || 0);
  }

  function raycastTable() {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(tablePlane, pointerWorld) ? pointerWorld : null;
  }

  function isDeckHit() {
    raycaster.setFromCamera(pointer, camera);
    deckHitsScratch.length = 0;
    raycaster.intersectObjects(deck.children, true, deckHitsScratch);
    if (deckHitsScratch[0]) return true;
    if (!raycaster.ray.intersectPlane(tablePlane, deckHitScratch)) return false;
    return Math.hypot(deckHitScratch.x - DECK_POSITION.x, deckHitScratch.z - DECK_POSITION.z) <= 0.82;
  }

  function dropZoneDistance(point) {
    return zoneDistance(point, DROP_ZONE_POSITION);
  }

  function mediaPoolDistance(point) {
    return zoneDistance(point, MEDIA_POOL_POSITION);
  }

  function centerVisualizerDistance(point) {
    return zoneDistance(point, CENTER_VISUALIZER_POSITION);
  }

  function dockDistance(point) {
    if (!point) return Infinity;
    const dx = Math.max(0, Math.abs(point.x - DOCK_POSITION.x) - DOCK_HALF_WIDTH);
    const dz = Math.max(0, Math.abs(point.z - DOCK_POSITION.z) - DOCK_HALF_DEPTH);
    return Math.hypot(dx, dz);
  }

  function zoneDistance(point, position) {
    return Math.hypot(point.x - position.x, point.z - position.z);
  }

  function dropZoneMagnetStrength(point) {
    return zoneMagnetStrength(dropZoneDistance(point), DROP_ZONE_RADIUS, DROP_ZONE_MAGNET_RADIUS);
  }

  function mediaPoolMagnetStrength(point) {
    return zoneMagnetStrength(mediaPoolDistance(point), MEDIA_POOL_RADIUS, MEDIA_POOL_MAGNET_RADIUS);
  }

  function centerVisualizerMagnetStrength(point) {
    return zoneMagnetStrength(centerVisualizerDistance(point), CENTER_VISUALIZER_RADIUS, CENTER_VISUALIZER_MAGNET_RADIUS);
  }

  function dockMagnetStrength(point) {
    const distance = dockDistance(point);
    if (distance >= DOCK_MAGNET_MARGIN) return 0;
    return easeOutCubic(1 - distance / DOCK_MAGNET_MARGIN) * 0.94;
  }

  function strongestMagnetZone(point) {
    const zones = [
      { id: "drop", strength: dropZoneMagnetStrength(point), position: DROP_ZONE_POSITION },
      { id: "media", strength: mediaPoolMagnetStrength(point), position: MEDIA_POOL_POSITION },
      { id: "center", strength: centerVisualizerMagnetStrength(point), position: CENTER_VISUALIZER_POSITION },
      { id: "dock", strength: dockMagnetStrength(point), position: DOCK_POSITION }
    ];
    return zones.reduce((best, zone) => zone.strength > best.strength ? zone : best, zones[0]);
  }

  function magnetZoneLabel(zoneId) {
    if (zoneId === "media") return "Media pool";
    if (zoneId === "center") return "Visualizer";
    if (zoneId === "dock") return "Dock";
    return "Drop zone";
  }

  function zoneMagnetStrength(distance, radius, magnetRadius) {
    if (distance >= magnetRadius) return 0;
    const normalized = 1 - THREE.MathUtils.clamp((distance - radius) / (magnetRadius - radius), 0, 1);
    return easeOutCubic(normalized) * 0.92;
  }

  function isDropZoneHit(point) {
    return dropZoneDistance(point) <= DROP_ZONE_MAGNET_RADIUS;
  }

  function isMediaPoolHit(point) {
    return mediaPoolDistance(point) <= MEDIA_POOL_MAGNET_RADIUS;
  }

  function isCenterVisualizerHit(point) {
    return centerVisualizerDistance(point) <= CENTER_VISUALIZER_MAGNET_RADIUS;
  }

  function isDockHit(point) {
    if (!point) return false;
    return Math.abs(point.x - DOCK_POSITION.x) <= DOCK_HALF_WIDTH + DOCK_MAGNET_MARGIN &&
      Math.abs(point.z - DOCK_POSITION.z) <= DOCK_HALF_DEPTH + DOCK_MAGNET_MARGIN;
  }

  function updateHover() {
    raycaster.setFromCamera(pointer, camera);
    hoverPickTargetsScratch.length = 0;
    for (const entry of placedEntries) hoverPickTargetsScratch.push(...entry.pickTargets);
    hoverHitsScratch.length = 0;
    if (hoverPickTargetsScratch.length) raycaster.intersectObjects(hoverPickTargetsScratch, true, hoverHitsScratch);
    const hit = hoverHitsScratch[0];
    const next = hit?.object?.userData?.entry || null;
    if (!next && hoveredEntry?.drawAnim) return;
    if (next === hoveredEntry) return;
    if (hoveredEntry) {
      hoveredEntry.hover = false;
      hoveredEntry.playing = playing && hoveredEntry.state === "placed";
      updateVideoPlayback(hoveredEntry);
    }
    hoveredEntry = next;
    if (hoveredEntry) {
      hoveredEntry.hover = true;
      hoveredEntry.playing = playing;
      updateVideoPlayback(hoveredEntry);
      status = `Focus: ${hoveredEntry.card.title}`;
      canvas.style.cursor = "grab";
      audio.play("hover");
      publishHud(true);
    } else {
      canvas.style.cursor = isDeckHit() ? "pointer" : "default";
    }
  }

  function clearHover(event) {
    if (event?.relatedTarget?.closest?.(".tarot-card-detail-target")) return;
    if (!hoveredEntry) return;
    hoveredEntry.hover = false;
    hoveredEntry.playing = playing && hoveredEntry.state === "placed";
    updateVideoPlayback(hoveredEntry);
    hoveredEntry = null;
    canvas.style.cursor = heldEntry ? "grabbing" : "default";
    publishHud(true);
  }

  function cardDetailTargetEntry() {
    if (!hoveredEntry || selectedEntry?.detailsOpen || heldEntry) return null;
    if (!isCardDetailTargetSettled(hoveredEntry)) return null;
    return hoveredEntry;
  }

  function isCardDetailTargetSettled(entry) {
    return Boolean(
      entry &&
      entry.state === "placed" &&
      !entry.drawAnim &&
      (entry.delay || 0) <= 0
    );
  }

  function projectCardDetailTarget(entry) {
    if (!entry || !isCardDetailTargetSettled(entry)) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    entry.group.getWorldPosition(detailTargetWorld);
    detailTargetWorld.y += 0.32;
    detailTargetScreen.copy(detailTargetWorld).project(camera);
    if (detailTargetScreen.z < -1 || detailTargetScreen.z > 1) return null;
    const x = THREE.MathUtils.clamp(((detailTargetScreen.x + 1) / 2) * rect.width, 58, rect.width - 58);
    const y = THREE.MathUtils.clamp(((-detailTargetScreen.y + 1) / 2) * rect.height, 46, rect.height - 46);
    return {
      id: entry.card.id || entry.card.title || "",
      title: entry.card.title || "Tarot Card",
      x: Math.round(x),
      y: Math.round(y),
      state: entry.state
    };
  }

  function placeHeld(hit) {
    const x = THREE.MathUtils.clamp(hit.x, -BOARD_LIMIT_X, SPREAD_LANE_MAX_X);
    const z = THREE.MathUtils.clamp(hit.z, -BOARD_LIMIT_Z, BOARD_LIMIT_Z);
    const entry = heldEntry;
    heldEntry = null;
    clearSelectedEntry();
    if (entry.isCameraCard) {
      if (isDockHit(hit) || entry.magnetZone === "dock") {
        lockEntryInDock(entry);
        controls.enabled = true;
        canvas.style.cursor = "default";
        return;
      }
      placeCameraCardAt(entry, hit);
      controls.enabled = true;
      canvas.style.cursor = "default";
      return;
    }
    if (isDropZoneHit(hit) || entry.magnetZone === "drop") {
      lockEntryInDropZone(entry);
      controls.enabled = true;
      canvas.style.cursor = "default";
      requestReading("drop-zone");
      return;
    }
    if (isMediaPoolHit(hit) || entry.magnetZone === "media") {
      lockEntryInMediaPoolZone(entry);
      controls.enabled = true;
      canvas.style.cursor = "default";
      requestReading("media-pool");
      return;
    }
    if (isCenterVisualizerHit(hit) || entry.magnetZone === "center") {
      lockEntryInCenterVisualizer(entry);
      controls.enabled = true;
      canvas.style.cursor = "default";
      requestReading("visualizer");
      return;
    }
    if (isDockHit(hit) || entry.magnetZone === "dock") {
      lockEntryInDock(entry);
      controls.enabled = true;
      canvas.style.cursor = "default";
      requestReading("dock");
      return;
    }
    entry.state = "placed";
    entry.hover = false;
    entry.slotIndex = -1;
    entry.floatMotion = null;
    entry.lockedDropZone = false;
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    entry.magnetized = false;
    entry.magnetZone = "";
    resetCardSurfacePose(entry);
    entry.targetPosition.set(x, CARD_TABLE_BASE_Y, z);
    entry.baseRotationY = Math.atan2(x, 5.5) * 0.38;
    setCardTargetRotation(entry, 0, entry.baseRotationY, 0);
    entry.placedAt = placedEntries.length;
    entry.playing = playing;
    placedEntries.push(entry);
    resolvePlacedCardStacks();
    hoveredEntry = entry;
    entry.hover = true;
    updateVideoPlayback(entry);
    audio.play("place");
    createBurst(x, z, 0xf6c96d, 0.94);
    status = `Placed: ${entry.card.title}`;
    controls.enabled = true;
    canvas.style.cursor = "default";
    publishHud(true);
    requestReading("manual");
  }

  function lockEntryInDropZone(entry) {
    if (!entry) return;
    if (dropZoneEntry && dropZoneEntry !== entry) {
      releaseDropZoneEntry({ moveAside: true, keepVideo: false });
    }
    entry.state = "placed";
    entry.hover = false;
    entry.lockedDropZone = true;
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    dockEntries = dockEntries.filter((item) => item !== entry);
    entry.magnetized = false;
    entry.magnetZone = "";
    entry.slotIndex = -1;
    entry.floatMotion = null;
    resetCardSurfacePose(entry);
    entry.targetPosition.copy(DROP_ZONE_POSITION);
    entry.targetPosition.y = DROP_ZONE_CARD_BASE_Y;
    entry.baseRotationY = 0;
    setCardTargetRotation(entry, 0, entry.baseRotationY, 0);
    entry.placedAt = placedEntries.length;
    entry.playing = playing;
	    if (!placedEntries.includes(entry)) placedEntries.push(entry);
	    resolvePlacedCardStacks();
	    dropZoneEntry = entry;
	    if (hoveredEntry === entry) hoveredEntry = null;
	    entry.hover = false;
	    updateVideoPlayback(entry);
	    const songSeedCount = seedSongTaggedAvatarCards(entry);
	    if (hoveredEntry === entry) hoveredEntry = null;
	    entry.hover = false;
    rebuildDropZonePreviewFromBoard();
    audio.play("lock");
    createBurst(DROP_ZONE_POSITION.x, DROP_ZONE_POSITION.z, 0x00f3ff, 1.05);
    createBurst(DROP_ZONE_POSITION.x, DROP_ZONE_POSITION.z, 0xff6df2, 0.64);
    status = `Drop zone locked: ${entry.card.title}${songSeedCount ? ` · ${songSeedCount} avatars loaded` : ""}`;
    publishHud(true);
  }

  function lockEntryInMediaPoolZone(entry) {
    if (!entry) return;
    entry.state = "placed";
    entry.hover = false;
    entry.lockedDropZone = false;
    entry.lockedMediaPool = true;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    dockEntries = dockEntries.filter((item) => item !== entry);
    entry.magnetized = false;
    entry.magnetZone = "";
    entry.slotIndex = -1;
    entry.floatMotion = null;
    resetCardSurfacePose(entry);
    if (!mediaPoolEntries.includes(entry)) mediaPoolEntries.push(entry);
    refreshMediaPoolStackTargets();
    entry.placedAt = placedEntries.length;
	    entry.playing = playing;
	    if (!placedEntries.includes(entry)) placedEntries.push(entry);
	    resolvePlacedCardStacks();
	    if (hoveredEntry === entry) hoveredEntry = null;
	    entry.hover = false;
    updateVideoPlayback(entry);
    refreshDropZonePreviewPool({ resetScreens: !dropPreview });
    audio.play("lock", { quiet: true });
    createBurst(MEDIA_POOL_POSITION.x, MEDIA_POOL_POSITION.z, 0xf6c96d, 1.02);
    createBurst(MEDIA_POOL_POSITION.x, MEDIA_POOL_POSITION.z, 0xff6df2, 0.54);
    status = `Media pool stacked: ${entry.card.title}`;
    publishHud(true);
  }

  function lockEntryInCenterVisualizer(entry) {
    if (!entry) return;
    entry.state = "placed";
    entry.hover = false;
    entry.lockedDropZone = false;
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = true;
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    dockEntries = dockEntries.filter((item) => item !== entry);
    entry.magnetized = false;
    entry.magnetZone = "";
    entry.slotIndex = -1;
    entry.floatMotion = null;
    resetCardSurfacePose(entry);
    if (!centerVisualizerEntries.includes(entry)) centerVisualizerEntries.push(entry);
    refreshCenterVisualizerTargets();
    entry.placedAt = placedEntries.length;
	    entry.playing = playing;
	    if (!placedEntries.includes(entry)) placedEntries.push(entry);
	    resolvePlacedCardStacks();
	    if (hoveredEntry === entry) hoveredEntry = null;
	    entry.hover = false;
    updateVideoPlayback(entry);
    refreshCenterPreviewFrame({ createIfMissing: true, force: true });
    audio.play("lock", { quiet: true });
    createBurst(CENTER_VISUALIZER_POSITION.x, CENTER_VISUALIZER_POSITION.z, 0x8ef7ff, 1.08);
    createBurst(CENTER_VISUALIZER_POSITION.x, CENTER_VISUALIZER_POSITION.z, 0xff6df2, 0.68);
    status = `Visualizer orbit: ${entry.card.title}`;
    publishHud(true);
  }

  function lockEntryInDock(entry) {
    if (!entry) return;
    if (entry === dropZoneEntry) releaseDropZoneEntry({ moveAside: false, keepVideo: false });
    if (entry.lockedMediaPool) releaseMediaPoolEntry(entry, { keepPreview: false });
    if (entry.lockedCenterVisualizer) releaseCenterVisualizerEntry(entry);
    entry.state = "placed";
    resetDockEntryPose(entry);
    entry.lockedDropZone = false;
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = true;
    entry.lockedCameraCard = false;
    if (entry.isCameraCard) cameraCardEntry = entry;
    entry.slotIndex = -1;
    if (!dockEntries.includes(entry)) dockEntries.push(entry);
    entry.placedAt = placedEntries.length;
    entry.playing = playing;
    if (!placedEntries.includes(entry)) placedEntries.push(entry);
    refreshDockTargets();
    resolvePlacedCardStacks();
    refreshDockTargets({ snap: true });
    hoveredEntry = null;
    clearSelectedEntry();
    updateVideoPlayback(entry);
    refreshDockBackgroundPlayer({ force: true });
    saveTarotDrawSettings();
    audio.play("lock", { quiet: true });
    createBurst(entry.targetPosition.x, entry.targetPosition.z, 0xf6c96d, 1.02);
    createBurst(entry.targetPosition.x, entry.targetPosition.z, 0x00f3ff, 0.68);
    dockTray.userData.energy = Math.max(dockTray.userData.energy || 0, 1);
    status = `Dock locked: ${entry.card.title}`;
    publishHud(true);
  }

  function releaseDropZoneEntry({ moveAside = false, keepVideo = false } = {}) {
    const entry = dropZoneEntry;
    dropZoneEntry = null;
    if (!keepVideo) dropSong.stop();
    if (!keepVideo) refreshDropZonePreviewPool({ resetScreens: true });
    if (!entry) return null;
    entry.lockedDropZone = false;
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    entry.magnetized = false;
    entry.magnetZone = "";
    if (moveAside) {
      const index = Math.max(0, placedEntries.indexOf(entry));
      entry.hover = false;
      entry.targetPosition.set(
        PARKED_DROP_CARD_POSITION.x,
        CARD_TABLE_BASE_Y,
        PARKED_DROP_CARD_POSITION.z
      );
      entry.baseRotationY = -0.18;
      resetCardSurfacePose(entry);
      setCardTargetRotation(entry, 0, entry.baseRotationY, 0);
      entry.playing = playing;
      updateVideoPlayback(entry);
      resolvePlacedCardStacks();
    }
    return entry;
  }

  function releaseMediaPoolEntry(entry, { keepPreview = false } = {}) {
    if (!entry) return null;
    mediaPoolEntries = mediaPoolEntries.filter((item) => item !== entry);
    entry.lockedMediaPool = false;
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    entry.magnetized = false;
    entry.magnetZone = "";
    refreshMediaPoolStackTargets();
    resolvePlacedCardStacks();
    if (!keepPreview) refreshDropZonePreviewPool({ resetScreens: false });
    return entry;
  }

  function releaseCenterVisualizerEntry(entry) {
    if (!entry) return null;
    centerVisualizerEntries = centerVisualizerEntries.filter((item) => item !== entry);
    entry.lockedCenterVisualizer = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    entry.magnetized = false;
    entry.magnetZone = "";
    refreshCenterVisualizerTargets();
    resolvePlacedCardStacks();
    refreshCenterPreviewFrame({ createIfMissing: false, force: true });
    return entry;
  }

  function releaseDockEntry(entry) {
    if (!entry) return null;
    dockEntries = dockEntries.filter((item) => item !== entry);
    entry.lockedDock = false;
    entry.lockedCameraCard = false;
    entry.magnetized = false;
    entry.magnetZone = "";
    refreshDockTargets({ snap: true });
    resolvePlacedCardStacks();
    refreshDockBackgroundPlayer({ force: true });
    saveTarotDrawSettings();
    return entry;
  }

  function refreshMediaPoolStackTargets() {
    mediaPoolEntries.forEach((entry, index) => {
      if (!entry) return;
      const angle = index * 2.399;
      const radius = Math.min(0.34, 0.08 + index * 0.022);
      entry.targetPosition.set(
        MEDIA_POOL_POSITION.x + Math.cos(angle) * radius,
        MEDIA_POOL_CARD_BASE_Y,
        MEDIA_POOL_POSITION.z + Math.sin(angle) * radius
      );
      entry.baseRotationY = -0.18 + Math.sin(index * 0.9) * 0.11;
      entry.angleOffset = THREE.MathUtils.clamp(entry.angleOffset, -0.24, 0.24);
      setCardTargetRotation(entry, 0, entry.baseRotationY, (index % 2 ? -1 : 1) * 0.012);
    });
  }

  function refreshCenterVisualizerTargets(elapsed = elapsedTime + rngSeed) {
    const count = centerVisualizerEntries.length;
    if (!count) return;
    const orbit = elapsed * 0.16;
    centerVisualizerEntries.forEach((entry, index) => {
      if (!entry) return;
      const fan = count === 1 ? 0 : (index - (count - 1) / 2) * 0.3;
      const angle = orbit + (index / count) * Math.PI * 2 + fan;
      const radius = count === 1 ? 0 : Math.min(1.18, CENTER_VISUALIZER_CARD_RADIUS + count * 0.045);
      const bob = Math.sin(elapsed * 0.82 + index * 1.31) * 0.075;
      entry.targetPosition.set(
        CENTER_VISUALIZER_POSITION.x + Math.cos(angle) * radius,
        CENTER_VISUALIZER_CARD_BASE_Y + Math.min(0.52, index * 0.045) + bob,
        CENTER_VISUALIZER_POSITION.z + Math.sin(angle) * radius
      );
      entry.baseRotationY = -angle + Math.PI / 2;
      setCardTargetRotation(
        entry,
        -0.05 + Math.sin(elapsed * 0.45 + index) * 0.035,
        entry.baseRotationY,
        Math.sin(elapsed * 0.6 + index * 0.7) * 0.045
      );
    });
  }

  function snapEntryToTarget(entry) {
    if (!entry?.group) return;
    entry.group.position.copy(entry.targetPosition);
    entry.group.quaternion.setFromEuler(entry.targetRotation);
    entry.dynamicStackLift = 0;
  }

  function resetDockEntryPose(entry) {
    if (!entry) return;
    entry.hover = false;
    entry.magnetized = false;
    entry.magnetZone = "";
    entry.floatMotion = null;
    entry.drawAnim = null;
    entry.delay = 0;
    entry.pitchOffset = 0;
    entry.angleOffset = 0;
    resetCardFocus(entry, { closeDetails: true });
    entry.stackLayer = 0;
    entry.dynamicStackLayer = 0;
    entry.dynamicStackLift = 0;
  }

  function refreshDockTargets({ snap = false } = {}) {
    const count = dockEntries.length;
    if (!count) return;
    const usableWidth = DOCK_HALF_WIDTH * 2 - CARD_WIDTH * 0.56;
    const perRow = Math.max(1, Math.min(3, Math.floor(usableWidth / DOCK_SLOT_SPACING) + 1));
    const rowCount = Math.max(1, Math.ceil(count / perRow));
    dockEntries.forEach((entry, index) => {
      if (!entry) return;
      const rowIndex = Math.floor(index / perRow);
      const rowStart = rowIndex * perRow;
      const rowSize = Math.min(perRow, count - rowStart);
      const indexInRow = index - rowStart;
      const centeredIndex = indexInRow - (rowSize - 1) / 2;
      const normalized = rowSize <= 1 ? 0 : centeredIndex / Math.max(1, (rowSize - 1) / 2);
      const rowOffset = rowIndex - (rowCount - 1) / 2;
      const spacing = rowSize <= 1 ? 0 : Math.min(DOCK_SLOT_SPACING, usableWidth / Math.max(1, rowSize - 1));
      const x = DOCK_POSITION.x + centeredIndex * spacing;
      const z = DOCK_POSITION.z - 0.08 + rowOffset * 0.28 + Math.abs(normalized) * 0.018;
      entry.targetPosition.set(x, DOCK_CARD_BASE_Y + rowIndex * 0.018, z);
      entry.baseRotationY = normalized * -0.055;
      if (snap) resetDockEntryPose(entry);
      setCardTargetRotation(entry, DOCK_CARD_PITCH, entry.baseRotationY, normalized * 0.012);
      if (snap) snapEntryToTarget(entry);
    });
  }

  function currentDockBackgroundSources() {
    return uniqueDropZoneVideoSources(dockEntries.flatMap((entry, dockIndex) =>
      dockBackgroundSourcesForEntry(entry, dockIndex)
    ), "", { allowBackgroundless: videoBackgroundKeying });
  }

  function dockBackgroundSourcesForEntry(entry, dockIndex = 0) {
    if (entry?.isCameraCard && entry.cameraStream && entry.video) {
      const sourceId = `dock-live-camera-${entry.card?.id || dockIndex}`;
      return [{
        id: sourceId,
        uri: `hapa-live-camera-card://${sourceId}`,
        sourceUri: `hapa-live-camera-card://${sourceId}`,
        originalUri: `hapa-live-camera-card://${sourceId}`,
        solidUri: `hapa-live-camera-card://${sourceId}`,
        label: `${entry.card?.title || "Camera Card"} / live webcam`,
        title: entry.card?.title || "Camera Card",
        liveCamera: true,
        liveStream: entry.cameraStream,
        liveVideo: entry.video,
        previewAspect: 16 / 9,
        forcePreviewAspect: 16 / 9,
        score: 1000
      }];
    }
    return dropZoneVideoSources(entry.card, { allowBackgroundless: videoBackgroundKeying }).map((source) => ({
      ...source,
      id: `dock-${entry.card.id || dockIndex}-${source.id || source.uri}`,
      label: `${entry.card.title || "Dock card"} / ${source.label || "loop"}`
    }));
  }

  function refreshDockBackgroundPlayer({ force = false } = {}) {
    const sources = currentDockBackgroundSources();
    setDockBackgroundPlayerSources(dockBackgroundPlayer, sources, { force, playing, allowBackgroundless: videoBackgroundKeying });
    updateDockBackgroundPlayback();
  }

  function updateDockBackgroundPlayback() {
    const active = playing && dockEntries.length > 0 && dockBackgroundPlayer.sources?.length > 0;
    if (active) {
      if (dockBackgroundPlayer.screen.video?.paused) dockBackgroundPlayer.screen.video.play().catch(() => {});
    } else if (dockBackgroundPlayer.screen.video && !dockBackgroundPlayer.screen.video.paused) {
      dockBackgroundPlayer.screen.video.pause();
    }
  }

  function updateDockBackgroundProjectionEffects(elapsed = elapsedTime + rngSeed) {
    const screen = dockBackgroundPlayer?.screen;
    const source = screen?.source;
    const liveCameraSource = isLiveCameraVideoSource(source);
    setDockBackgroundProjectionLivePresentation(dockBackgroundPlayer, liveCameraSource);
    setDockBackgroundProjectionGrade(dockBackgroundPlayer, liveCameraSource && cameraCardShaderEnabled, elapsed);
    updateDockBackgroundProjectionMicWaveform(dockBackgroundPlayer, liveCameraSource && cameraCardMicEnabled && cameraCardMicAnalyser && cameraCardMicData, elapsed);
  }

  function updateDockBackgroundProjectionMicWaveform(player, enabled, elapsed = 0) {
    const screen = player?.screen;
    const mesh = screen?.mesh;
    if (!mesh) return;
    if (!enabled) {
      if (screen.micWaveformGroup) screen.micWaveformGroup.visible = false;
      return;
    }
    if (!screen.micWaveformGroup) {
      screen.micWaveformGroup = createCameraCardMicWaveformOverlay();
      screen.micWaveformGroup.name = "dockBackgroundMicWaveform";
      screen.micWaveformGroup.rotation.set(0, 0, 0);
      screen.micWaveformGroup.renderOrder = 8;
      mesh.add(screen.micWaveformGroup);
    }
    const overlay = screen.micWaveformGroup;
    const aspect = Math.max(0.35, Number(mesh.userData.previewAspect || 16 / 9));
    const height = Math.max(1, Number(mesh.userData.previewScreenHeight || DOCK_BACKGROUND_HEIGHT));
    const width = height * aspect;
    const scaleX = (width * 0.78) / Math.max(0.001, CAMERA_CARD_MIC_WAVE_WIDTH);
    const scaleY = (height * 0.20) / Math.max(0.001, CAMERA_CARD_MIC_WAVE_HEIGHT);
    overlay.scale.set(scaleX, scaleY, 1);
    overlay.position.set(0, -height * 0.30, 0.035);
    overlay.visible = true;

    cameraCardMicAnalyser.getByteTimeDomainData(cameraCardMicData);
    const positions = overlay.userData.positions;
    const geometry = overlay.userData.geometry;
    if (!positions || !geometry) return;
    let sum = 0;
    const pointCount = CAMERA_CARD_MIC_WAVE_POINTS;
    for (let i = 0; i < pointCount; i += 1) {
      const sampleIndex = Math.min(cameraCardMicData.length - 1, Math.floor((i / Math.max(1, pointCount - 1)) * cameraCardMicData.length));
      const raw = (cameraCardMicData[sampleIndex] - 128) / 128;
      const magnitude = Math.max(0, Math.abs(raw) - CAMERA_CARD_MIC_NOISE_FLOOR);
      const boosted = Math.min(1, Math.pow(magnitude * CAMERA_CARD_MIC_PREAMP, CAMERA_CARD_MIC_RESPONSE_CURVE));
      const shaped = Math.sign(raw) * boosted;
      sum += shaped * shaped;
      const edgeFalloff = Math.sin((i / Math.max(1, pointCount - 1)) * Math.PI);
      const shimmer = Math.sin(elapsed * 4.4 + i * 0.16) * 0.018;
      positions[i * 3 + 1] = THREE.MathUtils.lerp(
        positions[i * 3 + 1],
        (shaped * 0.86 + shimmer) * CAMERA_CARD_MIC_WAVE_HEIGHT * (0.5 + edgeFalloff * 0.5),
        0.44
      );
    }
    cameraCardMicLevel = THREE.MathUtils.lerp(
      cameraCardMicLevel,
      Math.min(1, Math.sqrt(sum / pointCount) * 1.55),
      0.36
    );
    geometry.attributes.position.needsUpdate = true;
    const pulse = 0.35 + cameraCardMicLevel * 0.65;
    if (overlay.userData.coreLine?.material) overlay.userData.coreLine.material.opacity = 0.52 + pulse * 0.42;
    if (overlay.userData.glowLine?.material) overlay.userData.glowLine.material.opacity = 0.18 + pulse * 0.34;
    if (overlay.userData.plate?.material) overlay.userData.plate.material.opacity = 0.10 + pulse * 0.14;
  }

  function saveTarotDrawSettings() {
    writeTarotDrawSettings(settingsKey, {
      avatarName,
      backStyle,
      musicVisualizerMode,
      centerVisualizerEnabled,
      backgroundVisualizerEnabled,
      videoBackgroundKeying,
      echoShadersEnabled,
      lyricsEnabled,
      cameraCardShaderEnabled,
      cameraCardEnabled: Boolean(cameraCardEntry),
      cameraCardPending,
      cameraCardError,
      lyricCrawlAngleDegrees,
      dockCards: dockEntries.slice(0, TAROT_RESTORED_DOCK_CARD_LIMIT).map((entry) => cardIdentity(entry.card)).filter(Boolean)
    });
  }

  function restoreDockFromSettings() {
    const savedDockCards = Array.isArray(persistedSettings?.dockCards)
      ? persistedSettings.dockCards.slice(0, TAROT_RESTORED_DOCK_CARD_LIMIT)
      : [];
    if (!savedDockCards.length) return;
    const cardsById = new Map(cards.map((card) => [cardIdentity(card), card]).filter(([key]) => key));
    savedDockCards.forEach((cardKey, index) => {
      const card = cardsById.get(cardKey);
      if (!card) return;
      const entry = createCardEntry(card);
      entry.state = "placed";
      entry.lockedDock = true;
      entry.slotIndex = -1;
      resetDockEntryPose(entry);
      entry.placedAt = placedEntries.length;
      entry.playing = playing;
      entry.group.position.set(
        DOCK_POSITION.x + (index - (savedDockCards.length - 1) / 2) * Math.min(DOCK_SLOT_SPACING, 0.82),
        DOCK_CARD_BASE_Y,
        DOCK_POSITION.z
      );
      dockEntries.push(entry);
      placedEntries.push(entry);
      world.add(entry.group);
      updateVideoPlayback(entry);
    });
    if (dockEntries.length) {
      refreshDockTargets({ snap: true });
      status = `Dock restored: ${dockEntries.length}`;
    }
  }

  function echoDirectorProjectIsActive() {
    return Boolean(echoDirectorProject && dropZoneEntry && echoDirectorProjectMatchesCard(echoDirectorProject, dropZoneEntry.card));
  }

  function activeDropZoneSong() {
    if (!dropZoneEntry) return null;
    const baseSong = pickDropZoneSong(dropZoneEntry.card);
    return echoDirectorProjectIsActive()
      ? mergeDropZoneSongWithEchoDirectorProject(baseSong, echoDirectorProject, dropZoneEntry.card)
      : baseSong;
  }

  function currentDropZonePreviewSources() {
    const primarySources = dropZoneEntry ? dropZoneVideoSources(dropZoneEntry.card, { allowBackgroundless: videoBackgroundKeying }) : [];
    const mediaSources = mediaPoolEntries.flatMap((entry, stackIndex) =>
      dropZoneVideoSources(entry.card, { allowBackgroundless: videoBackgroundKeying }).map((source) => ({
        ...source,
        id: `media-pool-${entry.card.id || stackIndex}-${source.id || source.uri}`,
        label: `${entry.card.title || "Media card"} / ${source.label || "loop"}`
      }))
    );
    return uniqueDropZoneVideoSources([...primarySources, ...mediaSources], "", { allowBackgroundless: videoBackgroundKeying });
  }

  function currentCenterPreviewSources() {
    const echoSource = echoDirectorProjectIsActive()
      ? echoDirectorTimelineSourceAtTime(echoDirectorProject, dropSong.snapshot().currentTime)
      : null;
    const orderedCenterEntries = [...centerVisualizerEntries]
      .filter(Boolean)
      .sort((first, second) =>
        (second.placedAt ?? 0) - (first.placedAt ?? 0) ||
        centerVisualizerEntries.indexOf(second) - centerVisualizerEntries.indexOf(first)
      );
    const centerCardSources = orderedCenterEntries.flatMap((entry, stackIndex) =>
      dropZoneVideoSources(entry.card, {
        allowBackgroundless: videoBackgroundKeying,
        preferBackgroundless: videoBackgroundKeying
      }).map((source) => ({
        ...source,
        id: `center-visualizer-${entry.card.id || stackIndex}-${source.id || source.uri}`,
        label: `${entry.card.title || "Center card"} / ${source.label || "loop"}`
      }))
    );
    return uniqueDropZoneVideoSources([
      echoSource,
      ...centerCardSources
    ], "", { allowBackgroundless: videoBackgroundKeying });
  }

  function rebuildDropZonePreviewFromBoard() {
    if (disposed) return;
    if (dropPreviewRefreshSuspended) {
      dropPreviewSuspendedRebuild = true;
      return;
    }
    if (dropPreviewRebuildFrame) return;
    dropPreviewRebuildFrame = window.requestAnimationFrame(() => {
      dropPreviewRebuildFrame = 0;
      rebuildDropZonePreviewFromBoardNow();
    });
  }

  function rebuildDropZonePreviewFromBoardNow() {
    const sources = currentDropZonePreviewSources();
    const centerSources = currentCenterPreviewSources();
    const song = activeDropZoneSong();
    stopDropZonePreview({ stopSong: !song });
    if (!sources.length && !centerSources.length) {
      if (song) dropSong.start(song);
      else dropSong.stop();
      return;
    }
    dropPreview = createDropZonePreviewFromSources(sources.length ? sources : centerSources, song, { videoKeying: videoBackgroundKeying });
    previewGroup.add(dropPreview.group);
    refreshCenterPreviewFrame({ createIfMissing: false, force: true });
    if (song) dropSong.start(song);
    else dropSong.stop();
    updateDropZonePreviewPlayback();
  }

  function refreshDropZonePreviewPool({ resetScreens = false } = {}) {
    if (disposed) return;
    if (dropPreviewRefreshSuspended) {
      dropPreviewSuspendedResetScreens = dropPreviewSuspendedResetScreens || Boolean(resetScreens);
      return;
    }
    dropPreviewRefreshOptions = {
      resetScreens: Boolean(resetScreens || dropPreviewRefreshOptions?.resetScreens)
    };
    if (dropPreviewRefreshFrame) return;
    dropPreviewRefreshFrame = window.requestAnimationFrame(() => {
      dropPreviewRefreshFrame = 0;
      const options = dropPreviewRefreshOptions || {};
      dropPreviewRefreshOptions = null;
      refreshDropZonePreviewPoolNow(options);
    });
  }

  function refreshDropZonePreviewPoolNow({ resetScreens = false } = {}) {
    const sources = currentDropZonePreviewSources();
    const centerSources = currentCenterPreviewSources();
    const song = activeDropZoneSong();
    if (!sources.length && !centerSources.length) {
      if (song) {
        dropSong.start(song);
        stopDropZonePreview({ stopSong: false });
      } else {
        stopDropZonePreview({ stopSong: !dropZoneEntry });
      }
      return;
    }
    if (!dropPreview) {
      dropPreview = createDropZonePreviewFromSources(sources.length ? sources : centerSources, song, { videoKeying: videoBackgroundKeying });
      previewGroup.add(dropPreview.group);
      if (song) dropSong.start(song);
    } else {
      setDropZonePreviewSources(dropPreview, sources, {
        resetScreens: resetScreens && sources.length > 0,
        allowBackgroundless: videoBackgroundKeying
      });
    }
    refreshCenterPreviewFrame({ createIfMissing: false, force: resetScreens });
    updateDropZonePreviewPlayback();
  }

  function refreshCenterPreviewFrame({ createIfMissing = false, force = false } = {}) {
    const centerSources = currentCenterPreviewSources();
    if (!centerSources.length) {
      if (dropPreview) {
        setDropZoneCenterPrioritySources(dropPreview, [], { force, playing, allowBackgroundless: videoBackgroundKeying });
        if (!currentDropZonePreviewSources().length) stopDropZonePreview({ stopSong: !dropZoneEntry });
      }
      return;
    }
    if (!dropPreview && createIfMissing) {
      dropPreview = createDropZonePreviewFromSources(centerSources, null, { videoKeying: videoBackgroundKeying });
      previewGroup.add(dropPreview.group);
    }
    if (!dropPreview) return;
    setDropZoneCenterPrioritySources(dropPreview, centerSources, { force, playing, allowBackgroundless: videoBackgroundKeying });
    updateDropZonePreviewPlayback();
  }

  function suspendDropZonePreviewRefresh() {
    dropPreviewRefreshSuspended = true;
    dropPreviewSuspendedRebuild = false;
    dropPreviewSuspendedResetScreens = false;
  }

  function resumeDropZonePreviewRefresh({ delayMs = 0 } = {}) {
    dropPreviewRefreshSuspended = false;
    const shouldRebuild = dropPreviewSuspendedRebuild;
    const shouldReset = dropPreviewSuspendedResetScreens;
    dropPreviewSuspendedRebuild = false;
    dropPreviewSuspendedResetScreens = false;
    if (!shouldRebuild && !shouldReset) return;
    if (dropPreviewResumeTimer) window.clearTimeout(dropPreviewResumeTimer);
    dropPreviewResumeTimer = window.setTimeout(() => {
      dropPreviewResumeTimer = 0;
      if (disposed) return;
      if (shouldRebuild) rebuildDropZonePreviewFromBoard();
      else refreshDropZonePreviewPool({ resetScreens: shouldReset });
    }, Math.max(0, delayMs));
  }

  function stopDropZonePreview({ stopSong = true } = {}) {
    if (dropPreviewResumeTimer) {
      window.clearTimeout(dropPreviewResumeTimer);
      dropPreviewResumeTimer = 0;
    }
    if (dropPreviewRefreshFrame) {
      window.cancelAnimationFrame(dropPreviewRefreshFrame);
      dropPreviewRefreshFrame = 0;
      dropPreviewRefreshOptions = null;
    }
    if (dropPreviewRebuildFrame) {
      window.cancelAnimationFrame(dropPreviewRebuildFrame);
      dropPreviewRebuildFrame = 0;
    }
    if (stopSong) dropSong.stop();
    if (!dropPreview) return;
    disposeDropZonePreview(dropPreview);
    disposeObject(dropPreview.group);
    previewGroup.remove(dropPreview.group);
    dropPreview = null;
  }

  function updateDropZonePreviewPlayback() {
    const screens = dropPreview?.screens || [];
    const previewActive = Boolean(dropZoneEntry) || mediaPoolEntries.length > 0 || centerVisualizerEntries.length > 0;
    if (!screens.length) {
      dropSong.pause();
      return;
    }
    if (playing && previewActive) {
      let activeScreens = 0;
      screens.forEach((screen) => {
        const shouldPlayScreen = activeScreens < DROP_PREVIEW_ACTIVE_SCREEN_LIMIT;
        if (shouldPlayScreen) {
          activeScreens += 1;
          screen.video?.play().catch(() => {});
        } else {
          screen.video?.pause();
        }
      });
      if (dropZoneEntry) dropSong.play();
      else dropSong.pause();
    } else {
      screens.forEach((screen) => screen.video?.pause());
      dropSong.pause();
    }
  }

  function pickUp(entry) {
    if (entry === dropZoneEntry) {
      releaseDropZoneEntry({ moveAside: false, keepVideo: false });
    }
    if (entry.lockedMediaPool) {
      releaseMediaPoolEntry(entry);
    }
    if (entry.lockedCenterVisualizer) {
      releaseCenterVisualizerEntry(entry);
    }
    if (entry.lockedDock) {
      releaseDockEntry(entry);
    }
    placedEntries = placedEntries.filter((item) => item !== entry);
    resolvePlacedCardStacks();
    heldEntry = entry;
    selectEntry(entry);
    entry.state = "held";
    resetCardFocus(entry, { closeDetails: true });
    entry.hover = false;
    entry.lockedDropZone = false;
    entry.lockedDock = false;
    entry.lockedCameraCard = Boolean(entry.isCameraCard);
    entry.magnetized = false;
    entry.playing = playing;
    if (entry.isCameraCard) {
      applyCameraCardPose(entry, cameraCardPoseScratch.copy(entry.group.position).setY(CAMERA_CARD_HOLD_Y));
      cameraCardEntry = entry;
    } else {
      entry.targetPosition.copy(entry.group.position).setY(0.7);
      entry.baseRotationY = 0.18;
      setCardTargetRotation(entry, -0.18, entry.baseRotationY, 0.07);
    }
    audio.play("pickup");
    createBurst(entry.group.position.x, entry.group.position.z, 0x9d74ff, 0.62);
    status = entry.isCameraCard ? "Camera Card lifted" : `Lifted: ${entry.card.title}`;
    canvas.style.cursor = "grabbing";
    updateVideoPlayback(entry);
    publishHud(true);
    if (!entry.isCameraCard) requestReading("pickup");
  }

  function buildSlots(nextLayoutId) {
    for (const mesh of slotMeshes) disposeObject(mesh);
    slotGroup.clear();
    slotMeshes = [];
    const layout = LAYOUTS.find((item) => item.id === nextLayoutId) || LAYOUTS[0];
    layout.slots.forEach(([x, _y, z, rotationY], index) => {
      const slot = createSlotMarker(resources, index + 1);
      slot.position.set(x, 0.012, z);
      slot.rotation.y = rotationY;
      slot.userData.basePosition = slot.position.clone();
      slot.userData.baseRotationY = rotationY;
      slot.userData.motion = motionForSlot(layout, index);
      slotGroup.add(slot);
      slotMeshes.push(slot);
    });
  }

  function motionForSlot(layout, index) {
    if (!layout?.motion) return null;
    return {
      type: layout.motion,
      index,
      phase: index * 0.83,
      amplitudeX: layout.motion === "orbit" ? 0.16 : 0.08,
      amplitudeZ: layout.motion === "orbit" ? 0.1 : 0.18,
      amplitudeY: layout.motion === "orbit" ? 0.036 : 0.05,
      speed: layout.motion === "orbit" ? 0.45 : 0.62
    };
  }

  function updateSlotMarkers(elapsed) {
    for (const slot of slotMeshes) {
      const base = slot.userData.basePosition;
      if (!base) continue;
      slot.position.copy(base);
      applyMotionOffset(slot.position, slot.userData.motion, elapsed);
      slot.rotation.y = (slot.userData.baseRotationY || 0) + Math.sin(elapsed * 0.45 + (slot.userData.motion?.phase || 0)) * 0.025;
      const halo = slot.userData.refs?.ring;
      if (halo?.material) halo.material.opacity = 0.18 + Math.sin(elapsed * 1.4 + (slot.userData.motion?.phase || 0)) * 0.045;
    }
  }

  function applyMotionOffset(target, motion, elapsed) {
    if (!motion) return target;
    const t = elapsed * motion.speed + motion.phase;
    if (motion.type === "orbit") {
      target.x += Math.cos(t) * motion.amplitudeX;
      target.z += Math.sin(t * 0.92) * motion.amplitudeZ;
      target.y += (Math.sin(t * 1.4) + 1) * motion.amplitudeY;
      return target;
    }
    if (motion.type === "wave") {
      target.x += Math.sin(t * 0.8) * motion.amplitudeX;
      target.z += Math.sin(t) * motion.amplitudeZ;
      target.y += (Math.cos(t * 1.22) + 1) * motion.amplitudeY;
    }
    return target;
  }

  function placedCardBaseY(entry) {
    if (entry?.lockedDropZone) return DROP_ZONE_CARD_BASE_Y;
    if (entry?.lockedMediaPool) return MEDIA_POOL_CARD_BASE_Y;
    if (entry?.lockedCenterVisualizer) return CENTER_VISUALIZER_CARD_BASE_Y;
    if (entry?.lockedDock) return DOCK_CARD_BASE_Y;
    if (entry?.lockedCameraCard) return Number.isFinite(Number(entry.cameraCardBaseY)) ? Number(entry.cameraCardBaseY) : CAMERA_CARD_BASE_Y;
    return CARD_TABLE_BASE_Y;
  }

  function cardFootprintsOverlap(first, second) {
    if (!first?.targetPosition || !second?.targetPosition) return false;
    return cardFootprintPositionsOverlap(first.targetPosition, second.targetPosition);
  }

  function cardFootprintPositionsOverlap(firstPosition, secondPosition) {
    if (!firstPosition || !secondPosition) return false;
    return Math.abs(firstPosition.x - secondPosition.x) < CARD_STACK_OVERLAP_X &&
      Math.abs(firstPosition.z - secondPosition.z) < CARD_STACK_OVERLAP_Z;
  }

  function slotConflictsWithLockedZone(slot) {
    if (!slot || !lockedZoneEntries().length) return false;
    const [x, _y, z] = slot;
    const slotPosition = new THREE.Vector3(x, CARD_TABLE_BASE_Y, z);
    return lockedZoneEntries().some((entry) =>
      cardFootprintPositionsOverlap(slotPosition, entry.targetPosition)
    );
  }

  function projectedPlacedPosition(entry, elapsed, projected = new THREE.Vector3()) {
    projected.copy(entry.targetPosition);
    if (entry.state === "placed" && entry.floatMotion) applyMotionOffset(projected, entry.floatMotion, elapsed);
    return projected;
  }

  function setCardRenderLayer(entry, order) {
    if (!entry?.group) return;
    entry.group.renderOrder = order;
    entry.group.traverse((child) => {
      child.renderOrder = order;
    });
  }

  function resolvePlacedCardStacks() {
    const ordered = placedEntries
      .filter(Boolean)
      .sort((first, second) =>
        (first.placedAt ?? 0) - (second.placedAt ?? 0) ||
        placedEntries.indexOf(first) - placedEntries.indexOf(second)
      );
    const resolved = [];
    ordered.forEach((entry, index) => {
      let layer = 0;
      for (const previous of resolved) {
        if (entry.lockedDock || previous.lockedDock) continue;
        if (cardFootprintsOverlap(entry, previous)) {
          layer = Math.max(layer, (previous.stackLayer || 0) + 1);
        }
      }
      entry.stackLayer = layer;
      entry.targetPosition.y = placedCardBaseY(entry) + layer * CARD_STACK_GAP;
      setCardRenderLayer(entry, 20 + layer * 12 + index);
      resolved.push(entry);
    });
  }

  function resolveDynamicCardStacks(elapsed) {
    const ordered = placedEntries
      .filter(Boolean)
      .sort((first, second) =>
        (first.placedAt ?? 0) - (second.placedAt ?? 0) ||
        placedEntries.indexOf(first) - placedEntries.indexOf(second)
      );
    const resolved = [];
    ordered.forEach((entry) => {
      const projected = projectedPlacedPosition(entry, elapsed, entry.dynamicProjectedPosition || (entry.dynamicProjectedPosition = new THREE.Vector3()));
      let visibleLayer = entry.stackLayer || 0;
      for (const previous of resolved) {
        if (entry.lockedDock || previous.lockedDock) continue;
        if (cardFootprintPositionsOverlap(projected, previous.dynamicProjectedPosition)) {
          visibleLayer = Math.max(visibleLayer, previous.dynamicStackLayer + 1);
        }
      }
      entry.dynamicStackLayer = visibleLayer;
      entry.dynamicStackLift = Math.max(0, visibleLayer - (entry.stackLayer || 0)) * CARD_STACK_GAP;
      resolved.push(entry);
    });
  }

  function createCardEntry(card) {
    const cardFaceVideoUri = solidVideoUriForSource(card);
    const entry = {
      card,
      state: "deck",
      group: new THREE.Group(),
      targetPosition: new THREE.Vector3(),
      targetRotation: new THREE.Euler(),
      hover: false,
      delay: 0,
      placedAt: -1,
      video: null,
      videoTexture: null,
      cameraStream: null,
      videoSourceUri: cardFaceVideoUri,
      videoPosterUri: card.posterUri || "",
      videoKeying: false,
      videoSourceHasAlpha: false,
      videoBackgroundless: card.backgroundless || card.videoBackgroundless || null,
      videoMatte: null,
      faceMesh: null,
      baseFaceMaterial: null,
      faceMaterial: null,
      cameraShaderMaterial: null,
      cameraShaderEnabled: false,
      micWaveformGroup: null,
      transcriptBubbleGroup: null,
      transcriptBubbleTextKey: "",
      posterTexture: null,
      playing: false,
      angleOffset: 0,
      pitchOffset: 0,
      focusProgress: 0,
      focusTargetProgress: 0,
      detailsOpen: false,
      manualDetailsOpen: false,
      autoDetailsOpen: false,
      basePitch: 0,
      baseRoll: 0,
      baseRotationY: 0,
      drawAnim: null,
      slotIndex: -1,
      stackLayer: 0,
      dynamicStackLayer: 0,
      dynamicStackLift: 0,
      floatMotion: null,
      lockedDropZone: false,
      lockedMediaPool: false,
      lockedCenterVisualizer: false,
      lockedDock: false,
      lockedCameraCard: false,
      isCameraCard: Boolean(card.liveCamera),
      liveCamera: Boolean(card.liveCamera),
      fromDeckClick: false,
      magnetized: false,
      magnetZone: "",
      pickTargets: []
    };
    entry.group.name = `TarotCard:${card.title}`;
    const cardMesh = createCardMesh(card, entry, resources);
    entry.group.add(cardMesh);
    const hitTarget = cardMesh.getObjectByName("cardHitTarget");
    entry.refs = {
      signal: cardMesh.getObjectByName("signalLight"),
      neon: cardMesh.getObjectByName("cardNeonLight"),
      halo: cardMesh.getObjectByName("cardHalo"),
      targetLock: cardMesh.getObjectByName("targetLock"),
      face: cardMesh.getObjectByName("videoFace"),
      hitTarget
    };
    entry.pickTargets = hitTarget ? [hitTarget] : [cardMesh];
    for (const target of entry.pickTargets) target.userData.entry = entry;
    return entry;
  }

  function tarotFrameInterval() {
    return tarotHasActiveMotion() ? TAROT_ACTIVE_FRAME_INTERVAL_SECONDS : TAROT_IDLE_FRAME_INTERVAL_SECONDS;
  }

  function tarotHasActiveMotion() {
    if (heldEntry || hoveredEntry || spawnNetwork || placementBursts.length) return true;
    if (cameraCardPending || (cameraCardEntry?.video && !cameraCardEntry.video.paused)) return true;
    if (cameraCardMicEnabled && cameraCardEntry && cameraCardMicAnalyser) return true;
    if (cameraGalleryRecovery || cameraGalleryRecoveryBlend > 0.01) return true;
    if ((deck.userData.pulse || 0) > 0.01) return true;
    if (dropPreview?.group && (dropPreview.group.userData.life || 0) < 1) return true;
    if (dropSongIsActivelyPlaying() || dropPreviewHasPlayingVideo() || dockBackgroundHasPlayingVideo()) return true;
    if (centerVisualizerNeedsActiveLoop() || backgroundVisualizerNeedsActiveLoop()) return true;
    return placedEntries.some((entry) =>
      entry?.drawAnim ||
      entry?.delay > 0 ||
      entry?.hover ||
      (entry?.focusProgress || 0) > 0.001 ||
      (entry?.focusTargetProgress || 0) > 0.001 ||
      entry?.floatMotion ||
      (entry?.video && !entry.video.paused)
    );
  }

  function dropSongIsActivelyPlaying() {
    return playing && Boolean(dropZoneEntry) && Boolean(dropSong.state?.playing) && !dropSong.state?.blocked;
  }

  function dropPreviewHasPlayingVideo() {
    const screens = dropPreview?.screens || [];
    for (const screen of screens) {
      if (screen?.video && !screen.video.paused) return true;
    }
    return false;
  }

  function dockBackgroundHasPlayingVideo() {
    return Boolean(dockBackgroundPlayer.screen?.video && !dockBackgroundPlayer.screen.video.paused);
  }

  function centerVisualizerNeedsActiveLoop() {
    const echoActive = echoDirectorProjectIsActive();
    return (centerVisualizerEnabled || echoActive) && (
      echoActive ||
      (playing && Boolean(dropZoneEntry) && Boolean(dropSong.state?.hasSong)) ||
      centerVisualizerEntries.length > 0 ||
      heldEntry?.magnetZone === "center"
    );
  }

  function backgroundVisualizerNeedsActiveLoop() {
    return backgroundVisualizerEnabled && dropSongIsActivelyPlaying();
  }

  function ensureHyperspaceTunnel() {
    if (!hyperspaceTunnel) {
      hyperspaceTunnel = createMusicHyperspaceTunnel();
      world.add(hyperspaceTunnel);
    }
    return hyperspaceTunnel;
  }

  function ensureCenterVisualizer() {
    if (!centerVisualizer) {
      centerVisualizer = createCenterMusicVisualizer(camera, renderer);
      world.add(centerVisualizer);
    }
    return centerVisualizer;
  }

  function ensureLyricCrawl() {
    if (!lyricCrawl) {
      lyricCrawl = createLyricCrawl({ angleDegrees: lyricCrawlAngleDegrees });
      world.add(lyricCrawl);
    }
    applyLyricCrawlAngle(lyricCrawl, lyricCrawlAngleDegrees);
    return lyricCrawl;
  }

  function scheduleAnimation(delaySeconds = 0) {
    if (disposed) return;
    if (animationTimer) {
      window.clearTimeout(animationTimer);
      animationTimer = 0;
    }
    if (delaySeconds > 0.004) {
      animationTimer = window.setTimeout(() => {
        animationTimer = 0;
        animationFrame = window.requestAnimationFrame(animate);
      }, Math.max(0, delaySeconds * 1000));
      return;
    }
    animationFrame = window.requestAnimationFrame(animate);
  }

  function animate() {
    if (disposed) return;
    const now = performance.now() / 1000;
    const frameInterval = tarotFrameInterval();
    const frameAge = now - lastFrameTime;
    if (frameAge < frameInterval) {
      scheduleAnimation(frameInterval - frameAge);
      return;
    }
    const delta = Math.min(TAROT_MAX_DELTA_SECONDS, Math.max(0, now - lastFrameTime));
    lastFrameTime = now;
    elapsedTime += delta;
    const elapsed = elapsedTime + rngSeed;
    if (elapsedTime - lastResizeCheck > TAROT_RESIZE_CHECK_SECONDS) {
      lastResizeCheck = elapsedTime;
      resize();
    }
    updateCameraRail(delta);
    controls.update();
    deck.rotation.y = Math.sin(elapsed * 0.55) * 0.02;
    deck.position.y = 0.02 + Math.sin(elapsed * 1.2) * 0.01 + (deck.userData.pulse || 0) * 0.025;
    deck.userData.pulse = Math.max(0, (deck.userData.pulse || 0) - delta * 1.8);
    const songBands = dropSong.bands();
    const songPlaying = dropSongIsActivelyPlaying();

    refreshCenterVisualizerTargets(elapsed);
    if (placedEntries.length <= 1) {
      if (placedEntries[0]) {
        placedEntries[0].dynamicStackLayer = placedEntries[0].stackLayer || 0;
        placedEntries[0].dynamicStackLift = 0;
      }
    } else if (elapsedTime - lastDynamicStackTime > TAROT_DYNAMIC_STACK_INTERVAL_SECONDS) {
      lastDynamicStackTime = elapsedTime;
      resolveDynamicCardStacks(elapsed);
    }
    for (const entry of placedEntries) updateEntry(entry, delta, elapsed);
    if (heldEntry) updateEntry(heldEntry, delta, elapsed);
    updateSlotMarkers(elapsed);
    updateDropZone(elapsed, songBands);
    updateDockTray(elapsed);
    updateDockBackgroundPlayerFrame(dockBackgroundPlayer, elapsed, playing && dockEntries.length > 0);
    updateDockBackgroundProjectionEffects(elapsed);
    updateVideoEdgeMattes(elapsed);
    const hyperspaceActive = backgroundVisualizerEnabled && songPlaying;
    if (hyperspaceActive || hyperspaceTunnel?.visible) {
      updateMusicHyperspaceTunnel(ensureHyperspaceTunnel(), elapsed, songBands, hyperspaceActive);
    }
    const centerActive = centerVisualizerNeedsActiveLoop();
    if (centerActive || centerVisualizer?.visible) {
      updateCenterMusicVisualizer(
      ensureCenterVisualizer(),
      elapsed,
      songBands,
      musicVisualizerMode,
      centerActive
      );
    }
    const lyricActive = lyricsEnabled && playing && Boolean(dropZoneEntry) && !echoDirectorProjectIsActive();
    if (lyricActive || lyricCrawl?.visible) {
      updateLyricCrawl(ensureLyricCrawl(), dropSong.snapshot(), elapsed, lyricActive, dropZoneEntry?.card, {
        angleDegrees: lyricCrawlAngleDegrees
      });
    }
    updateSpawnNetwork(spawnNetwork, camera, elapsed);
    updateBursts(delta);
    renderer.render(scene, camera);

    if (cardDetailTargetEntry() && now - lastHudTime > TAROT_HUD_DETAIL_SECONDS) publishHud(true);
    else if (now - lastHudTime > TAROT_HUD_NORMAL_SECONDS) publishHud();
    scheduleAnimation(tarotFrameInterval());
  }

  function updateEntry(entry, delta, elapsed) {
    if (entry.isCameraCard) updateCameraCardShaderUniforms(entry, elapsed);
    if (entry.isCameraCard) updateCameraCardMicWaveform(entry, elapsed);
    if (entry.isCameraCard) updateCameraCardTranscriptBubble(entry, elapsed);
    if (entry.delay > 0) {
      entry.delay -= delta;
      entry.group.rotation.y += delta * 2.5;
      return;
    }
    if (entry.drawAnim) {
      entry.drawAnim.life += delta;
      const t = THREE.MathUtils.clamp(entry.drawAnim.life / entry.drawAnim.duration, 0, 1);
      const ease = easeOutCubic(t);
      const arc = Math.sin(t * Math.PI) * entry.drawAnim.peak;
      const target = entryTargetScratch.copy(entry.targetPosition);
      entry.group.position.lerpVectors(entry.drawAnim.from, target, ease);
      entry.group.position.y += arc;
      const drawRotation = drawEulerScratch.set(
        cardPitch(entry, -0.42 + t * 0.42),
        entry.baseRotationY + entry.angleOffset + (1 - ease) * entry.drawAnim.spin,
        Math.sin(t * Math.PI) * 0.28
      );
      entry.group.quaternion.slerp(drawQuaternionScratch.setFromEuler(drawRotation), 1 - Math.pow(0.0001, delta));
      const signal = entry.refs?.signal;
      if (signal) signal.intensity = 3.4 - ease * 1.1;
      if (t < 1) return;
      entry.drawAnim = null;
    }
    const dockLocked = entry.lockedDock;
    const cameraLocked = entry.lockedCameraCard;
    const lockedZone = entry.lockedDropZone || entry.lockedMediaPool || entry.lockedCenterVisualizer || dockLocked || cameraLocked;
    const lift = entry.lockedCenterVisualizer
      ? (entry.hover ? 0.11 : 0.035)
      : dockLocked
        ? (entry.hover ? 0.035 : 0.006)
        : cameraLocked
          ? (entry.hover ? 0.09 : 0.025)
        : lockedZone ? (entry.hover ? 0.055 : 0.018) : entry.hover ? 0.19 : 0;
    const pulse = Math.sin(elapsed * 2.2 + entry.placedAt) * (entry.state === "placed" ? 0.012 : 0);
    const target = entryTargetScratch.copy(entry.targetPosition);
    if (entry.state === "placed" && entry.floatMotion) {
      applyMotionOffset(target, entry.floatMotion, elapsed);
    }
    if (entry.state === "placed") target.y += (entry.dynamicStackLift || 0) + lift + pulse;
    const desiredFocus = entry === selectedEntry ? (entry.focusTargetProgress || 0) : 0;
    entry.focusProgress = THREE.MathUtils.lerp(entry.focusProgress || 0, desiredFocus, 1 - Math.pow(0.0004, delta));
    if (desiredFocus <= 0 && entry.focusProgress < 0.001) entry.focusProgress = 0;
    const q = entryQuaternionScratch.setFromEuler(entry.targetRotation);
    if (entry.hover && entry.state === "placed") {
      hoverEulerScratch.set(dockLocked ? -0.012 : entry.lockedCenterVisualizer ? -0.045 : lockedZone ? -0.025 : -0.08, 0, lockedZone ? 0.012 : 0.035);
      q.multiply(hoverQuaternionScratch.setFromEuler(hoverEulerScratch));
    }
    applyCardFocusPose(entry, target, q);
    entry.group.position.lerp(target, 1 - Math.pow(0.001, delta));
    entry.group.quaternion.slerp(q, 1 - Math.pow(0.002, delta));
    const signal = entry.refs?.signal;
    const neon = entry.refs?.neon;
    const hoverPulse = (Math.sin(elapsed * 11.5 + entry.placedAt) + 1) * 0.5;
    const neonAccent = entry.hover ? 0x00f3ff : lockedZone ? 0xff6df2 : entry.state === "held" ? 0xf6c96d : 0x8ef7ff;
    if (signal) {
      signal.color.setHex(neonAccent);
      signal.intensity = dockLocked
        ? 1.55 + Math.sin(elapsed * 2.5 + entry.placedAt) * 0.18
        : lockedZone
        ? 5.4 + Math.sin(elapsed * 3.2) * 0.9
        : entry.hover
          ? 7.2 + hoverPulse * 2.1
          : entry.state === "held"
            ? 4.8
            : 1.35 + Math.sin(elapsed * 2 + entry.placedAt) * 0.28;
      signal.distance = entry.hover ? 4.4 : dockLocked ? 1.95 : lockedZone ? 3.8 : entry.state === "held" ? 3.6 : 2.6;
      signal.decay = entry.hover || lockedZone ? 1.12 : 1.45;
    }
    if (neon) {
      neon.color.setHex(entry.hover ? 0xff3df2 : lockedZone ? 0x6ffcff : 0xf6c96d);
      neon.intensity = entry.hover ? 5.8 + hoverPulse * 2.4 : dockLocked ? 0.9 + hoverPulse * 0.18 : lockedZone ? 3.9 + hoverPulse : entry.state === "held" ? 2.8 : 0.55;
      neon.distance = entry.hover ? 3.6 : dockLocked ? 1.85 : lockedZone ? 3.1 : 2.4;
    }
    const halo = entry.refs?.halo;
    if (halo) {
      halo.material.color.setHex(entry.hover ? 0x00f3ff : lockedZone ? 0xff6df2 : 0xf6c96d);
      halo.material.opacity = dockLocked ? 0.1 + hoverPulse * 0.02 : lockedZone ? 0.68 : entry.hover ? 0.72 + hoverPulse * 0.16 : entry.state === "held" ? 0.52 : 0.2;
      halo.scale.setScalar(dockLocked ? 0.99 + Math.sin(elapsed * 2.1 + entry.placedAt) * 0.008 : lockedZone ? 1.16 + Math.sin(elapsed * 2.8) * 0.045 : entry.hover ? 1.18 + hoverPulse * 0.04 : 1);
    }
    updateCardTargetLock(entry.refs?.targetLock, entry.state === "placed" && entry.hover, elapsed, lockedZone);
  }

  function applyCardFocusPose(entry, target, quaternion) {
    const progress = entry?.focusProgress || 0;
    if (progress <= 0.001 || entry.state !== "placed" || entry.lockedDock) return;
    const eased = easeInOutCubic(THREE.MathUtils.clamp(progress, 0, 1));
    camera.getWorldDirection(focusForward).normalize();
    focusPosition.copy(camera.position).addScaledVector(
      focusForward,
      compactMode ? CARD_FOCUS_CAMERA_DISTANCE * 0.9 : CARD_FOCUS_CAMERA_DISTANCE
    );
    focusPosition.addScaledVector(focusForward, -0.18 * eased);
    target.lerp(focusPosition, eased);

    focusNormal.copy(camera.position).sub(target).normalize();
    focusUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    focusUp.addScaledVector(focusNormal, -focusUp.dot(focusNormal));
    if (focusUp.lengthSq() < 0.0001) focusUp.set(0, 0, -1).addScaledVector(focusNormal, focusNormal.z).normalize();
    else focusUp.normalize();
    focusRight.crossVectors(focusNormal, focusUp).normalize();
    focusUp.crossVectors(focusRight, focusNormal).normalize();
    focusMatrix.makeBasis(focusRight, focusNormal, focusUp);
    focusQuaternion.setFromRotationMatrix(focusMatrix);
    quaternion.slerp(focusQuaternion, eased);
  }

  function updateVideoEdgeMattes(elapsed) {
    for (const entry of placedEntries) {
      updateVideoEdgeMatte(entry.videoMatte, elapsed, entry.videoKeying && Boolean(entry.video) && !entry.videoSourceHasAlpha);
    }
    if (heldEntry) updateVideoEdgeMatte(heldEntry.videoMatte, elapsed, heldEntry.videoKeying && Boolean(heldEntry.video) && !heldEntry.videoSourceHasAlpha);
    updateVideoEdgeMatte(
      dockBackgroundPlayer.screen?.matte,
      elapsed,
      videoBackgroundKeying &&
        Boolean(dockBackgroundPlayer.sources?.length) &&
        !isLiveCameraVideoSource(dockBackgroundPlayer.screen?.source) &&
        !videoSourceHasAlpha(dockBackgroundPlayer.screen?.source)
    );
    const screens = dropPreview?.screens || [];
    for (const screen of screens) updateVideoEdgeMatte(screen.matte, elapsed, videoBackgroundKeying && Boolean(screen.source) && !videoSourceHasAlpha(screen.source));
  }

  function updateDropZone(elapsed, songBands = { energy: 0 }) {
    const magnet = heldEntry?.magnetZone === "drop" ? 1 : 0;
    const locked = dropZoneEntry ? 1 : 0;
    const pulse = (Math.sin(elapsed * 2.4) + 1) * 0.5;
    dropZone.userData.energy = THREE.MathUtils.lerp(dropZone.userData.energy || 0, Math.max(magnet, locked * 0.86), 0.08);
    const energy = dropZone.userData.energy || 0;
    dropZone.rotation.y = Math.sin(elapsed * 0.55) * 0.035;
    dropZone.position.y = (dropZone.userData.baseY || DROP_ZONE_POSITION.y) + Math.sin(elapsed * 1.6) * 0.006 + energy * 0.018;
    const refs = dropZone.userData.refs || {};
    const ring = refs.ring;
    if (ring) {
      ring.scale.setScalar(1 + energy * 0.2 + pulse * 0.045);
      ring.material.opacity = 0.34 + energy * 0.38 + pulse * 0.08;
    }
    const core = refs.core;
    if (core) {
      core.material.opacity = 0.2 + energy * 0.42 + pulse * 0.04;
      core.rotation.z = elapsed * 0.12;
    }
    const outer = refs.outer;
    if (outer) {
      outer.scale.setScalar(1 + energy * 0.08 + pulse * 0.025);
      outer.material.opacity = 0.13 + energy * 0.18 + pulse * 0.035;
    }
    const label = refs.label;
    if (label) label.material.opacity = 0.72 + energy * 0.22;
    const light = refs.light;
    if (light) light.intensity = 1.4 + energy * 5.8 + pulse * 0.7;
    updateMediaPoolZone(elapsed, pulse);
    if (dropPreview?.group) {
      dropPreview.group.userData.life = Math.min(1, (dropPreview.group.userData.life || 0) + 0.035);
      const appear = easeOutCubic(dropPreview.group.userData.life);
      updateDropZonePreviewCameraRail(dropPreview, cameraRailBlend);
      syncEchoDirectorPreviewToClock(dropPreview, dropSong.snapshot(), playing && Boolean(dropZoneEntry), elapsed, songBands);
      updateDropZonePreviewScreens(dropPreview, elapsed, playing && Boolean(dropZoneEntry));
      updateDropZonePreviewOpacity(dropPreview, appear, pulse);
      dropPreview.group.rotation.y = Math.sin(elapsed * 0.22) * 0.025;
      dropPreview.group.position.y = Math.sin(elapsed * 0.8) * 0.018;
      updateDropZoneSongVisualizer(dropPreview.group, elapsed, songBands.energy || 0, appear);
    }
  }

  function syncEchoDirectorPreviewToClock(preview, songSnapshot = {}, shouldPlay = false, elapsed = 0, bands = {}) {
    if (!preview || !echoDirectorProjectIsActive()) {
      clearEchoDirectorPreviewOverlays(preview);
      return;
    }
    const source = echoDirectorTimelineSourceAtTime(echoDirectorProject, songSnapshot.currentTime);
    if (!source?.uri) return;
    const sourceKey = `${dropZoneVideoSourceKey(source)}:${source.echoShotIndex ?? ""}`;
    if (sourceKey !== echoDirectorTimelineSourceKey) {
      echoDirectorTimelineSourceKey = sourceKey;
      setDropZoneCenterPrioritySources(preview, [source], {
        force: true,
        playing: shouldPlay,
        allowBackgroundless: videoBackgroundKeying
      });
    }
    const centerScreen = (preview.screens || []).find(isCenterPreviewScreen);
    syncDropZoneScreenVideoToEchoSource(centerScreen, source, shouldPlay);
    updateEchoDirectorPreviewOverlay(centerScreen, source, {
      project: echoDirectorProject,
      songSnapshot,
      elapsed,
      bands,
      shadersEnabled: echoShadersEnabled,
      lyricsEnabled
    });
  }

  function updateMediaPoolZone(elapsed, pulse = 0) {
    const magnet = heldEntry?.magnetZone === "media" ? 1 : 0;
    const stacked = mediaPoolEntries.length ? Math.min(0.9, 0.18 + mediaPoolEntries.length * 0.12) : 0;
    mediaPoolZone.userData.energy = THREE.MathUtils.lerp(mediaPoolZone.userData.energy || 0, Math.max(magnet, stacked), 0.08);
    const energy = mediaPoolZone.userData.energy || 0;
    mediaPoolZone.rotation.y = Math.sin(elapsed * 0.48 + 0.8) * 0.04;
    mediaPoolZone.position.y = (mediaPoolZone.userData.baseY || MEDIA_POOL_POSITION.y) + Math.sin(elapsed * 1.35) * 0.006 + energy * 0.016;
    const refs = mediaPoolZone.userData.refs || {};
    const ring = refs.ring;
    if (ring) {
      ring.scale.setScalar(1 + energy * 0.18 + pulse * 0.04);
      ring.material.opacity = 0.26 + energy * 0.42 + pulse * 0.06;
    }
    const core = refs.core;
    if (core) {
      core.material.opacity = 0.17 + energy * 0.36 + pulse * 0.04;
      core.rotation.z = -elapsed * 0.1;
    }
    const outer = refs.outer;
    if (outer) {
      outer.scale.setScalar(1 + energy * 0.07 + pulse * 0.02);
      outer.material.opacity = 0.12 + energy * 0.2 + pulse * 0.03;
    }
    const label = refs.label;
    if (label) label.material.opacity = 0.68 + energy * 0.24;
    const light = refs.light;
    if (light) light.intensity = 1.0 + energy * 5.2 + pulse * 0.58;
  }

  function updateDockTray(elapsed) {
    const magnet = heldEntry?.magnetZone === "dock" ? 1 : 0;
    const occupied = dockEntries.length ? Math.min(0.9, 0.2 + dockEntries.length * 0.11) : 0;
    dockTray.userData.energy = THREE.MathUtils.lerp(dockTray.userData.energy || 0, Math.max(magnet, occupied), 0.08);
    const energy = dockTray.userData.energy || 0;
    const pulse = (Math.sin(elapsed * 2.1) + 1) * 0.5;
    dockTray.position.y = (dockTray.userData.baseY || DOCK_POSITION.y) + energy * 0.014 + Math.sin(elapsed * 1.15) * 0.004;
    const refs = dockTray.userData.refs || {};
    const base = refs.base;
    if (base?.material) {
      base.material.emissiveIntensity = 0.22 + energy * 0.34;
    }
    const glow = refs.glow;
    if (glow?.material) {
      glow.material.opacity = 0.05 + energy * 0.16 + pulse * 0.018;
      glow.scale.set(1 + energy * 0.035, 1, 1 + energy * 0.08);
    }
    const field = refs.field;
    if (field?.material) {
      field.material.opacity = 0.025 + energy * 0.085 + pulse * 0.014;
      field.scale.set(1 + energy * 0.05, 1 + energy * 0.04, 1);
    }
    const label = refs.label;
    if (label?.material) label.material.opacity = 0.7 + energy * 0.2;
    const light = refs.light;
    if (light) light.intensity = 0.5 + energy * 2.35 + pulse * 0.24;
    for (const child of refs.slots || []) {
      if (!child.material) continue;
      child.material.opacity = 0.12 + energy * 0.18 + Math.max(0, Math.sin(elapsed * 1.7 + child.userData.phase)) * 0.08;
    }
  }

  function updateBursts(delta) {
    placementBursts = placementBursts.filter((burst) => {
      burst.life += delta;
      const t = burst.life / burst.duration;
      burst.group.scale.setScalar(0.35 + t * 2.4);
      burst.group.position.y = 0.035 + t * 0.09;
      burst.group.children.forEach((child, index) => {
        child.material.opacity = Math.max(0, (1 - t) * (index === 0 ? 0.62 : 0.36));
      });
      if (t >= 1) {
        disposeObject(burst.group);
        sparkGroup.remove(burst.group);
        return false;
      }
      return true;
    });
  }

  function createBurst(x, z, color, intensity = 0.55) {
    const group = new THREE.Group();
    group.position.set(x, 0.04, z);
    const ringGeo = new THREE.TorusGeometry(0.42, 0.008, 8, 72);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: intensity, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    const ring2 = ring.clone();
    ring2.material = ringMat.clone();
    ring2.scale.setScalar(0.62);
    group.add(ring, ring2);
    for (let i = 0; i < 12; i += 1) {
      const shard = new THREE.Mesh(resources.sparkGeometry, resources.sparkMaterial.clone());
      const angle = (i / 12) * Math.PI * 2;
      shard.position.set(Math.cos(angle) * 0.22, 0.02, Math.sin(angle) * 0.22);
      shard.rotation.set(Math.random(), angle, Math.random());
      group.add(shard);
    }
    sparkGroup.add(group);
    placementBursts.push({ group, life: 0, duration: 0.78 });
  }

  function cardFaceVideoPriority(entry) {
    if (!entry?.videoSourceUri || !playing || !entry.playing) return -Infinity;
    if (entry === heldEntry) return 1000;
    if (entry === hoveredEntry) return 930;
    if (entry === selectedEntry) return 900;
    if (entry === dropZoneEntry) return 860;
	    if (entry.lockedCenterVisualizer) return 720;
	    if (entry.lockedMediaPool) return 640;
	    if (entry.lockedDock) return 520;
	    if (entry.drawAnim) return 420;
	    if (entry.state === "placed") return 320 + Math.min(80, Math.max(0, entry.placedAt || 0));
	    return -Infinity;
	  }

  function reconcileCardFaceVideoQueue() {
    const entries = [...placedEntries];
    if (heldEntry && !entries.includes(heldEntry)) entries.push(heldEntry);
    const active = CARD_FACE_VIDEO_MAX_ACTIVE > 0
      ? entries
        .map((entry, index) => ({ entry, index, priority: cardFaceVideoPriority(entry) }))
        .filter((item) => item.priority > -Infinity)
        .sort((first, second) =>
          second.priority - first.priority ||
          (second.entry.placedAt ?? -1) - (first.entry.placedAt ?? -1) ||
          first.index - second.index
        )
        .slice(0, CARD_FACE_VIDEO_MAX_ACTIVE)
        .map((item) => item.entry)
      : [];
    const activeSet = new Set(active);
    entries.forEach((entry) => {
      if (entry.liveCamera) {
        if (entry.video && entry.playing && playing) entry.video.play().catch(() => {});
        else if (entry.video && !entry.video.paused) entry.video.pause();
        return;
      }
      if (activeSet.has(entry)) ensureEntryCardFaceVideo(entry);
      else detachEntryCardFaceVideo(entry);
    });
    active.forEach((entry) => {
      if (entry.video && entry.playing && playing) entry.video.play().catch(() => {});
    });
  }

  function ensureEntryCardFaceVideo(entry) {
    if (!entry?.videoSourceUri || entry.video || !entry.faceMaterial) return Boolean(entry?.video);
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    if (entry.videoPosterUri) video.poster = entry.videoPosterUri;
    video.src = entry.videoSourceUri;
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    entry.video = video;
    entry.videoTexture = texture;
    entry.faceMaterial.map = texture;
    entry.faceMaterial.emissiveMap = texture;
    entry.faceMaterial.emissive?.setHex?.(0xffffff);
    entry.faceMaterial.emissiveIntensity = 0.12;
    setVideoMaterialSourceAlpha(entry.faceMaterial, entry.videoSourceHasAlpha);
    entry.faceMaterial.needsUpdate = true;
    entry.videoMatte = createVideoEdgeMatte(video, entry.faceMaterial);
    return true;
  }

  function detachEntryCardFaceVideo(entry) {
    if (!entry) return;
    removeCameraCardMicWaveform(entry);
    removeCameraCardTranscriptBubble(entry);
    const video = entry.video;
    const texture = entry.videoTexture;
    disposeCameraCardShaderMaterial(entry);
    if (!video && !texture) return;
    const faceMaterial = entry.baseFaceMaterial || entry.faceMaterial;
    if (faceMaterial) {
      if (entry.posterTexture) {
        faceMaterial.map = entry.posterTexture;
        faceMaterial.emissiveMap = entry.videoSourceUri ? entry.posterTexture : null;
      }
      faceMaterial.emissiveIntensity = entry.videoSourceUri ? 0.1 : 0.16;
      const keyState = faceMaterial.userData?.hapaVideoBackgroundKey;
      if (keyState) {
        keyState.maskReady = false;
        keyState.maskTexture = videoMaskFallbackTexture();
        if (keyState.uniforms?.uHapaVideoMask) keyState.uniforms.uHapaVideoMask.value = keyState.maskTexture;
        if (keyState.uniforms?.uHapaVideoMaskStrength) keyState.uniforms.uHapaVideoMaskStrength.value = 0;
      }
      faceMaterial.needsUpdate = true;
      entry.faceMaterial = faceMaterial;
      if (entry.faceMesh) entry.faceMesh.material = faceMaterial;
    }
    if (video) {
      video.pause();
      if (video.srcObject) video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    stopMediaStream(entry.cameraStream);
    disposeVideoEdgeMatte(entry.videoMatte);
    texture?.dispose?.();
    entry.video = null;
    entry.videoTexture = null;
    entry.cameraStream = null;
    entry.videoMatte = null;
  }

  function updateVideoPlayback() {
    reconcileCardFaceVideoQueue();
  }

  function publishHud(force = false) {
    const now = performance.now() / 1000;
    if (!force && now - lastHudTime < 0.6) return;
    lastHudTime = now;
    const inspectedEntry = selectedEntry;
    onHud({
      status,
      deckCount: deckCards.length,
      placedCount: placedEntries.length,
      heldTitle: heldEntry?.card.title || "",
      focusTitle: hoveredEntry?.card.title || "",
      focusContacts: [],
      selectedCard: inspectedEntry?.card || null,
      selectedDetailsOpen: Boolean(inspectedEntry && (inspectedEntry.detailsOpen || inspectedEntry.manualDetailsOpen || inspectedEntry.autoDetailsOpen)),
      selectedFocusProgress: Number((inspectedEntry ? Math.max(inspectedEntry.focusTargetProgress || 0, inspectedEntry.focusProgress || 0) : 0).toFixed(3)),
      cardDetailTarget: projectCardDetailTarget(cardDetailTargetEntry()),
      dropZoneCard: dropZoneEntry?.card || null,
      echoDirectorProject: echoDirectorProjectIsActive() ? {
        songId: echoDirectorProject.song_id,
        title: echoDirectorProject.song_title || "",
        timelineCount: Array.isArray(echoDirectorProject.timeline) ? echoDirectorProject.timeline.length : 0,
        visualizerCount: Array.isArray(echoDirectorProject.visualizer_timeline) ? echoDirectorProject.visualizer_timeline.length : 0
      } : null,
      piles: buildTarotPileSummaries(deckCards, cards),
      spawnNetwork: spawnNetwork ? {
        kind: spawnNetwork.kind,
        count: spawnNetwork.cards.length,
        avatarName: spawnNetwork.avatar?.name || ""
      } : { kind: "", count: 0, avatarName: "" },
      layoutId,
      backStyle,
      musicVisualizerMode,
      centerVisualizerEnabled,
      backgroundVisualizerEnabled,
      videoBackgroundKeying,
      echoShadersEnabled,
      lyricsEnabled,
      cameraCardEnabled: Boolean(cameraCardEntry),
      cameraCardPending,
      cameraCardError,
      cameraCardShaderEnabled,
      cameraCardMicEnabled,
      cameraCardMicPending,
      cameraCardMicError,
      cameraCardMicLevel: Number(cameraCardMicLevel.toFixed(3)),
      cameraCardTranscriptionEnabled,
      cameraCardTranscriptionPending,
      cameraCardTranscriptionCapturing,
      cameraCardTranscriptionInFlight,
      cameraCardTranscriptionQueueDepth: cameraCardTranscriptionQueue.length,
      cameraCardTranscriptionDropped,
      cameraCardTranscriptionError,
      cameraCardTranscript,
      cameraCardTranscriptionNotice,
      cameraCardTranscriptionLastResult,
      cameraCardTranscriptionJournal,
      lyricCrawlAngleDegrees,
      playing,
      audioReady: audio.ready,
      renderer: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures
      },
      ambience: {
        exposure: renderer.toneMappingExposure,
        fogDensity: scene.fog?.density || 0,
        background: `#${scene.background.getHexString()}`
      }
    });
  }

  function requestReadingNow(reason = "user-request") {
    return requestReading(reason);
  }

  function requestReading(reason) {
    const readingEntries = placedEntries.filter((entry) => !entry.lockedDock && !entry.isCameraCard);
    if (!readingEntries.length) {
      if (String(reason).startsWith("user")) {
        status = "Place cards before asking for a reading";
        publishHud(true);
      }
      onReadingClear?.();
      return false;
    }
    const layout = LAYOUTS.find((item) => item.id === layoutId) || LAYOUTS[0];
    const ordered = [...readingEntries].sort((first, second) => first.placedAt - second.placedAt);
    onReadingRequest?.({
      readingId: `builder-${layoutId}-${ordered.map((entry) => entry.card.id).join("-")}-${Math.round(performance.now())}`,
      avatarName,
      layoutId,
      layoutName: layout.label,
      reason,
      generatedAt: new Date().toISOString(),
      cards: ordered.map((entry, index) => ({
        id: entry.card.id,
        title: entry.card.title,
        subtitle: entry.card.subtitle,
        archetype: entry.card.archetype,
        tarotNumber: entry.card.tarotNumber,
        summary: entry.card.summary,
        keywords: entry.card.keywords || [],
        stats: entry.card.stats || {},
        tags: entry.card.tags || [],
        avatarContacts: entry.card.avatarContacts || [],
        drawIndex: index,
        positionIndex: index,
        angle: entry.angleOffset,
        pitch: entry.pitchOffset || 0,
        tablePosition: {
          x: Number(entry.targetPosition.x.toFixed(3)),
          z: Number(entry.targetPosition.z.toFixed(3))
        }
      }))
    });
    return true;
  }

  function boardCameraTarget(target = new THREE.Vector3()) {
    return target.set(0, 0.05, compactMode ? -0.15 : 0);
  }

  function horizonCameraTarget(target = new THREE.Vector3()) {
    const previewLift = dropPreview?.group ? 0.86 : 0;
    return target.set(0, compactMode ? 1.78 + previewLift * 0.5 : 2.28 + previewLift, compactMode ? -1.36 : -1.72);
  }

  function cameraPolarFromBoard() {
    const target = boardCameraTarget(boardCameraTargetScratch);
    const horizontal = Math.hypot(camera.position.x - target.x, camera.position.z - target.z);
    const vertical = Math.max(0.001, camera.position.y - target.y);
    return Math.atan2(horizontal, vertical);
  }

  function updateCameraRail(delta) {
    const baseRailBlend = smoothBlend(CAMERA_RAIL_HORIZON_START, CAMERA_RAIL_HORIZON_END, cameraPolarFromBoard());
    if (cameraGalleryRecovery) {
      cameraGalleryRecovery.elapsed += delta;
      const t = THREE.MathUtils.clamp(cameraGalleryRecovery.elapsed / cameraGalleryRecovery.duration, 0, 1);
      const eased = easeInOutCubic(t);
      camera.position.lerpVectors(cameraGalleryRecovery.fromPosition, cameraGalleryRecovery.toPosition, eased);
      controls.target.lerpVectors(cameraGalleryRecovery.fromTarget, cameraGalleryRecovery.toTarget, eased);
      const nextFov = THREE.MathUtils.lerp(cameraGalleryRecovery.fromFov, cameraGalleryRecovery.toFov, eased);
      if (Math.abs(camera.fov - nextFov) > 0.01) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
      cameraGalleryRecoveryBlend = THREE.MathUtils.lerp(cameraGalleryRecoveryBlend, 1, 1 - Math.pow(0.0002, delta));
      cameraRailBlend = Math.max(baseRailBlend, cameraGalleryRecoveryBlend);
      if (t >= 1) cameraGalleryRecovery = null;
      return;
    }
    const holdGalleryLayout = dropPreview?.screens?.length && camera.position.z > (compactMode ? 8.55 : 7.95);
    cameraGalleryRecoveryBlend = THREE.MathUtils.lerp(
      cameraGalleryRecoveryBlend,
      holdGalleryLayout ? 1 : 0,
      1 - Math.pow(0.012, delta)
    );
    if (!holdGalleryLayout && cameraGalleryRecoveryBlend < 0.01) cameraGalleryRecoveryBlend = 0;
    cameraRailBlend = Math.max(baseRailBlend, cameraGalleryRecoveryBlend);
    const horizonTarget = horizonCameraTarget(horizonCameraTargetScratch);
    if (cameraGalleryRecoveryBlend > 0.01) {
      horizonTarget.lerp(CAMERA_GALLERY_RECOVERY_TARGET, cameraGalleryRecoveryBlend);
    }
    const target = boardCameraTarget(boardCameraTargetScratch).lerp(horizonTarget, cameraRailBlend);
    controls.target.lerp(target, 1 - Math.pow(0.006, delta));
    const boardFov = compactMode ? 58 : 48;
    const horizonFov = cameraGalleryRecoveryBlend > 0.05
      ? (compactMode ? 57 : CAMERA_GALLERY_RECOVERY_FOV)
      : (compactMode ? 54 : 45.5);
    const nextFov = THREE.MathUtils.lerp(boardFov, horizonFov, cameraRailBlend);
    if (Math.abs(camera.fov - nextFov) > 0.01) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      const nextCompact = width < 720 || width / height < 0.78;
      if (nextCompact !== compactMode) {
        compactMode = nextCompact;
        camera.fov = compactMode ? 58 : 48;
        camera.position.set(0, compactMode ? 5.6 : 4.65, compactMode ? 7.2 : 5.95);
        controls.minDistance = compactMode ? 5.2 : 4.6;
        controls.maxDistance = compactMode ? 11.6 : CAMERA_GALLERY_RECOVERY_MAX_DISTANCE;
        controls.target.set(0, 0.05, compactMode ? -0.15 : 0);
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

	  function getDebugState() {
	    const activeEntries = [...placedEntries, heldEntry].filter(Boolean);
	    const cardVideoEntries = activeEntries.filter((entry) => Boolean(entry.video));
	    const cardPlayingVideoCount = cardVideoEntries.filter((entry) => entry.video && !entry.video.paused).length;
	    const previewPlayingCount = dropPreview?.screens?.filter((screen) => screen.video && !screen.video.paused).length || 0;
	    const dockBackgroundPlaying = Boolean(dockBackgroundPlayer.screen?.video && !dockBackgroundPlayer.screen.video.paused);
	    return {
      avatarName,
      deckCount: deckCards.length,
      placedCount: placedEntries.length,
      held: heldEntry?.card.title || null,
      hover: hoveredEntry?.card.title || null,
      selected: selectedEntry?.card.title || null,
      layoutId,
      playing,
      backStyle,
      musicVisualizerMode,
      centerVisualizerEnabled,
      backgroundVisualizerEnabled,
      videoBackgroundKeying,
      echoShadersEnabled,
      lyricsEnabled,
      cameraCardShaderEnabled,
      cameraCardMicEnabled,
      cameraCardMicPending,
      cameraCardMicError,
      cameraCardMicLevel: Number(cameraCardMicLevel.toFixed(3)),
      cameraCardTranscriptionEnabled,
      cameraCardTranscriptionPending,
      cameraCardTranscriptionCapturing,
      cameraCardTranscriptionInFlight,
      cameraCardTranscriptionQueueDepth: cameraCardTranscriptionQueue.length,
      cameraCardTranscriptionDropped,
      cameraCardTranscriptionError,
      cameraCardTranscript,
      cameraCardTranscriptionNotice,
      cameraCardTranscriptionLastResult,
      cameraCardTranscriptionJournal,
      lyricCrawlAngleDegrees,
      audioReady: audio.ready,
      audioEnabled: audio.enabled,
      audioEvents: audio.events,
      dropSong: dropSong.state,
      centerVisualizer: {
        mode: musicVisualizerMode,
        enabled: centerVisualizerEnabled,
        active: Boolean(centerVisualizer?.visible),
        blend: Number((centerVisualizer?.userData?.activeBlend || 0).toFixed(3))
      },
      backgroundVisualizer: {
        enabled: backgroundVisualizerEnabled,
        active: Boolean(hyperspaceTunnel?.visible),
        blend: Number((hyperspaceTunnel?.userData?.activeBlend || 0).toFixed(3))
      },
      lyrics: {
        enabled: lyricsEnabled,
        angleDegrees: lyricCrawlAngleDegrees,
        active: Boolean(lyricCrawl?.visible),
        blend: Number((lyricCrawl?.userData?.activeBlend || 0).toFixed(3))
      },
      cameraCard: {
        enabled: Boolean(cameraCardEntry),
        shaderEnabled: cameraCardShaderEnabled,
        shaderActive: Boolean(cameraCardEntry?.cameraShaderEnabled),
        micEnabled: cameraCardMicEnabled,
        micPending: cameraCardMicPending,
        micError: cameraCardMicError,
        micLevel: Number(cameraCardMicLevel.toFixed(3)),
        micWaveform: Boolean(cameraCardEntry?.micWaveformGroup),
        micContextState: cameraCardMicContext?.state || "",
        transcriptionEnabled: cameraCardTranscriptionEnabled,
        transcriptionPending: cameraCardTranscriptionPending,
        transcriptionCapturing: cameraCardTranscriptionCapturing,
        transcriptionInFlight: cameraCardTranscriptionInFlight,
        transcriptionQueueDepth: cameraCardTranscriptionQueue.length,
        transcriptionDropped: cameraCardTranscriptionDropped,
        transcriptionError: cameraCardTranscriptionError,
        transcript: cameraCardTranscript,
        transcriptionNotice: cameraCardTranscriptionNotice,
        transcriptionLastResult: cameraCardTranscriptionLastResult,
        transcriptionJournal: cameraCardTranscriptionJournal,
        pending: cameraCardPending,
        error: cameraCardError,
        hasStream: Boolean(cameraCardEntry?.cameraStream),
        playing: Boolean(cameraCardEntry?.video && !cameraCardEntry.video.paused),
        title: cameraCardEntry?.card?.title || null,
        position: cameraCardEntry ? vector3Summary(cameraCardEntry.targetPosition) : null
      },
      piles: buildTarotPileSummaries(deckCards, cards),
      eligibleCards: cards.length,
      productionAudit: productionAudit ? {
        candidates: productionAudit.candidates || 0,
        productionReady: productionAudit.productionReady || 0,
        hiddenFromProduction: productionAudit.hiddenFromProduction || 0,
        imageOnlyCount: productionAudit.imageOnlyCount || 0,
        missingDearPapaSong: productionAudit.missingDearPapaSong || 0,
        missingResolvedAudio: productionAudit.missingResolvedAudio || 0
      } : null,
      avatarProfileCoverage: summarizeAvatarProfileCoverage(cards),
      heldAngle: heldEntry?.angleOffset || 0,
      heldPitch: heldEntry?.pitchOffset || 0,
      hoverAngle: hoveredEntry?.angleOffset || 0,
      hoverPitch: hoveredEntry?.pitchOffset || 0,
      selectedPitch: selectedEntry?.pitchOffset || 0,
      camera: {
        position: vector3Summary(camera.position),
        target: vector3Summary(controls.target),
        distance: Number(camera.position.distanceTo(controls.target).toFixed(3)),
        fov: Number(camera.fov.toFixed(2)),
        railBlend: Number(cameraRailBlend.toFixed(3)),
        galleryBlend: Number(cameraGalleryRecoveryBlend.toFixed(3)),
        galleryRecoveryActive: Boolean(cameraGalleryRecovery)
      },
      dropZone: {
        active: Boolean(dropZoneEntry),
        cardTitle: dropZoneEntry?.card.title || null,
        echoDirectorProject: echoDirectorProjectIsActive() ? {
          songId: echoDirectorProject.song_id,
          title: echoDirectorProject.song_title || "",
          timelineCount: Array.isArray(echoDirectorProject.timeline) ? echoDirectorProject.timeline.length : 0,
          visualizerCount: Array.isArray(echoDirectorProject.visualizer_timeline) ? echoDirectorProject.visualizer_timeline.length : 0,
          currentTimelineSource: echoDirectorTimelineSourceKey
        } : null,
        previewActive: Boolean(dropPreview),
	        previewPlaying: previewPlayingCount > 0,
	        previewPlayingCount,
        previewScreenCount: dropPreview?.screens?.length || 0,
        previewActiveScreenLimit: DROP_PREVIEW_ACTIVE_SCREEN_LIMIT,
        previewPanelLimit: DROP_PREVIEW_PANEL_LIMIT,
        previewSongVisualizer: Boolean(dropPreview?.group?.getObjectByName("dropZoneSongVisualizer")),
        previewSourceCount: dropPreview?.sources?.length || 0,
        previewQueueCount: dropPreview?.pool?.queue?.length || 0,
        previewBufferCount: dropPreview?.bufferVideos?.filter((video) => video?.src).length || 0,
        previewBufferLimit: DROP_PREVIEW_BUFFER_SIZE,
        previewFrames: previewFrameDiagnostics(dropPreview),
        previewSources: dropPreview?.screens?.map((screen) => screen.source?.label || screen.source?.uri || "") || [],
        centerPreviewSource: dropPreview?.screens?.find(isCenterPreviewScreen)?.source?.label || null,
        centerPreviewFrame: (() => {
          const screen = dropPreview?.screens?.find(isCenterPreviewScreen);
          return {
            aspect: Number((screen?.mesh?.userData?.previewAspect || 0).toFixed(3)),
            exportAspect: Number(ECHO_DIRECTOR_EXPORT_ASPECT.toFixed(3)),
            echoOverlayVisible: Boolean(screen?.echoOverlay?.mesh?.visible),
            echoOverlayOpacity: Number((screen?.echoOverlay?.material?.opacity || 0).toFixed(3)),
            textureRepeat: screen?.texture ? {
              x: Number(screen.texture.repeat.x.toFixed(3)),
              y: Number(screen.texture.repeat.y.toFixed(3))
            } : null,
            shadersEnabled: echoShadersEnabled,
            lyricsEnabled
          };
        })(),
        centerPrioritySources: dropPreview?.centerSources?.map((source) => source.label || source.uri || "") || [],
        songTitle: dropSong.state?.title || null,
        songPlaying: dropSong.state?.playing || false,
        magnetized: Boolean(heldEntry?.magnetized)
      },
      mediaPool: {
        cardCount: mediaPoolEntries.length,
        cardTitles: mediaPoolEntries.map((entry) => entry.card.title),
        sourceCounts: mediaPoolEntries.map((entry) => ({
          title: entry.card.title,
          sources: dropZoneVideoSources(entry.card, { allowBackgroundless: videoBackgroundKeying }).length
        })),
        magnetized: heldEntry?.magnetZone === "media"
      },
      centerVisualizerDrop: {
        cardCount: centerVisualizerEntries.length,
        cardTitles: centerVisualizerEntries.map((entry) => entry.card.title),
        magnetized: heldEntry?.magnetZone === "center"
      },
      dock: {
        cardCount: dockEntries.length,
        cardTitles: dockEntries.map((entry) => entry.card.title),
        magnetized: heldEntry?.magnetZone === "dock",
        persisted: Boolean(dockEntries.length),
        backgroundActive: Boolean(dockBackgroundPlayer.sources?.length),
	        backgroundPlaying: dockBackgroundPlaying,
        backgroundSourceCount: dockBackgroundPlayer.sources?.length || 0,
        backgroundSource: dockBackgroundPlayer.screen?.source?.label || dockBackgroundPlayer.screen?.source?.uri || null
      },
      spawnNetwork: spawnNetwork ? {
        kind: spawnNetwork.kind,
        avatarName: spawnNetwork.avatar?.name || "",
        cardCount: spawnNetwork.cards.length,
        cardTitles: spawnNetwork.cards.map((card) => card.title)
      } : null,
      overlapPairs: overlapPairs(placedEntries),
      stackLayers: placedEntries.map((entry) => ({
        title: entry.card.title,
        layer: entry.stackLayer || 0,
        dynamicLayer: entry.dynamicStackLayer || entry.stackLayer || 0,
        y: Number(entry.targetPosition.y.toFixed(3))
      })),
      activeFps: TAROT_ACTIVE_FPS,
      dpr: renderer.getPixelRatio(),
	      cardFloatMotionEnabled: TAROT_CARD_FLOAT_MOTION_ENABLED,
	      cardFaceVideoLimit: CARD_FACE_VIDEO_MAX_ACTIVE,
	      videoCards: cardVideoEntries.length,
	      videoCardTitles: cardVideoEntries.map((entry) => entry.card.title),
	      playingVideos: cardPlayingVideoCount,
	      cinemaBudget: {
	        cardFaceLimit: CARD_FACE_VIDEO_MAX_ACTIVE,
	        cardFacePlaying: cardPlayingVideoCount,
	        previewPanelLimit: DROP_PREVIEW_PANEL_LIMIT,
	        previewPlaying: previewPlayingCount,
	        dockBackgroundPlaying: dockBackgroundPlaying ? 1 : 0,
	        totalPlaying: cardPlayingVideoCount + previewPlayingCount + (dockBackgroundPlaying ? 1 : 0)
	      },
      sceneStats: collectSceneStats(scene),
      renderer: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures
      }
    };
  }

  function vector3Summary(value = new THREE.Vector3()) {
    return {
      x: Number((value.x || 0).toFixed(3)),
      y: Number((value.y || 0).toFixed(3)),
      z: Number((value.z || 0).toFixed(3))
    };
  }

  function previewFrameDiagnostics(preview = null) {
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const viewportWidth = Math.max(1, canvasRect.width || renderer.domElement.width || 1);
    const viewportHeight = Math.max(1, canvasRect.height || renderer.domElement.height || 1);
    const frames = (preview?.screens || []).slice(0, 3).map((screen) => {
      const object = screen?.rig || screen?.mesh;
      const box = object ? new THREE.Box3().setFromObject(object) : null;
      if (!box || box.isEmpty()) {
        return {
          name: screen?.rig?.name || screen?.mesh?.name || "",
          inView: false,
          box: null
        };
      }
      const corners = [
        [box.min.x, box.min.y, box.min.z],
        [box.min.x, box.min.y, box.max.z],
        [box.min.x, box.max.y, box.min.z],
        [box.min.x, box.max.y, box.max.z],
        [box.max.x, box.min.y, box.min.z],
        [box.max.x, box.min.y, box.max.z],
        [box.max.x, box.max.y, box.min.z],
        [box.max.x, box.max.y, box.max.z]
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z).project(camera));
      const minX = Math.min(...corners.map((point) => point.x));
      const maxX = Math.max(...corners.map((point) => point.x));
      const minY = Math.min(...corners.map((point) => point.y));
      const maxY = Math.max(...corners.map((point) => point.y));
      const screenBox = {
        left: Number((((minX + 1) / 2) * viewportWidth).toFixed(1)),
        right: Number((((maxX + 1) / 2) * viewportWidth).toFixed(1)),
        top: Number((((1 - maxY) / 2) * viewportHeight).toFixed(1)),
        bottom: Number((((1 - minY) / 2) * viewportHeight).toFixed(1))
      };
      screenBox.width = Number((screenBox.right - screenBox.left).toFixed(1));
      screenBox.height = Number((screenBox.bottom - screenBox.top).toFixed(1));
      return {
        name: screen?.rig?.name || screen?.mesh?.name || "",
        inView: screenBox.right > 0 && screenBox.left < viewportWidth && screenBox.bottom > 0 && screenBox.top < viewportHeight,
        box: screenBox,
        world: vector3Summary(object.position)
      };
    });
    const overlaps = [];
    for (let firstIndex = 0; firstIndex < frames.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < frames.length; secondIndex += 1) {
        const first = frames[firstIndex];
        const second = frames[secondIndex];
        if (!first.box || !second.box) continue;
        const overlapWidth = Math.max(0, Math.min(first.box.right, second.box.right) - Math.max(first.box.left, second.box.left));
        const overlapHeight = Math.max(0, Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.top, second.box.top));
        const overlapArea = overlapWidth * overlapHeight;
        const minArea = Math.max(1, Math.min(first.box.width * first.box.height, second.box.width * second.box.height));
        if (overlapArea > minArea * 0.08) {
          overlaps.push({
            first: first.name,
            second: second.name,
            ratio: Number((overlapArea / minArea).toFixed(3))
          });
        }
      }
    }
    return {
      frames,
      allInView: frames.length > 0 && frames.every((frame) => frame.inView),
      overlaps
    };
  }

  function collectSceneStats(root) {
    const stats = {
      objects: 0,
      visible: 0,
      meshes: 0,
      lines: 0,
      lights: 0,
      previewObjects: 0,
      cardObjects: 0,
      zoneObjects: 0,
      names: {}
    };
    root?.traverse?.((child) => {
      stats.objects += 1;
      if (!child.visible) return;
      stats.visible += 1;
      if (child.isMesh) stats.meshes += 1;
      else if (child.isLine || child.isLineSegments) stats.lines += 1;
      else if (child.isLight) stats.lights += 1;
      const name = child.name || child.type || "unnamed";
      if (name.includes("dropPreview")) stats.previewObjects += 1;
      if (name.includes("TarotCard") || name.includes("card")) stats.cardObjects += 1;
      if (name.includes("dropZone") || name.includes("mediaPool") || name.includes("dock")) stats.zoneObjects += 1;
      stats.names[name] = (stats.names[name] || 0) + 1;
    });
    stats.names = Object.fromEntries(
      Object.entries(stats.names)
        .sort((first, second) => second[1] - first[1])
        .slice(0, 18)
    );
    return stats;
  }

  function dispose() {
    disposed = true;
    window.cancelAnimationFrame(animationFrame);
    if (animationTimer) window.clearTimeout(animationTimer);
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerdown", unlockAudioFromGesture, { capture: true });
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointerleave", clearHover);
    canvas.removeEventListener("wheel", handleWheel, { capture: true });
    window.removeEventListener("resize", resize);
    controls.dispose();
    disposeSpawnNetwork();
    stopCameraCardMic();
    stopDropZonePreview();
    disposeDockBackgroundPlayer(dockBackgroundPlayer);
    for (const entry of [...placedEntries, heldEntry].filter(Boolean)) disposeEntry(entry);
    disposeObject(world);
    disposeResourceLibrary(resources);
    dropSong.dispose();
    audio.dispose();
    renderer.dispose();
    if (window.__THREE_GAME_DIAGNOSTICS__ === diagnosticsHandle) delete window.__THREE_GAME_DIAGNOSTICS__;
    diagnosticsHandle = null;
  }

  function disposeEntry(entry) {
    if (entry === cameraCardEntry) cameraCardEntry = null;
    if (entry?.isCameraCard) {
      cameraCardPending = false;
    }
    detachEntryCardFaceVideo(entry);
    disposeObject(entry.group);
    world.remove(entry.group);
  }

  return game;
}

function pileDrawOrigin(index = 0, count = 1) {
  const safeCount = Math.max(1, count);
  const centered = index - (safeCount - 1) / 2;
  return DECK_POSITION.clone().add(new THREE.Vector3(
    THREE.MathUtils.clamp(centered * 0.26, -0.78, 0.78),
    0,
    THREE.MathUtils.clamp(-0.34 - Math.abs(centered) * 0.035, -0.58, -0.18)
  ));
}

function overlapPairs(entries = []) {
  const pairs = [];
  const xLimit = CARD_WIDTH * 0.98;
  const zLimit = CARD_HEIGHT * 0.98;
  for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
      const first = entries[firstIndex];
      const second = entries[secondIndex];
      const firstPosition = first.targetPosition || first.group.position;
      const secondPosition = second.targetPosition || second.group.position;
      if (Math.abs(firstPosition.x - secondPosition.x) < xLimit && Math.abs(firstPosition.z - secondPosition.z) < zLimit) {
        pairs.push([first.card.title, second.card.title]);
      }
    }
  }
  return pairs;
}

function spawnKindLabel(kind = "relationship") {
  return kind === "skill" ? "Skill Cards" : "Relationship Tarot Cards";
}

function normalizeSpawnNetworkCards(cards = [], kind = "relationship", avatar = null) {
  const cardKind = kind === "skill" ? "skill" : "relationship";
  const avatarContact = avatar ? compactSpawnAvatarContact(avatar) : null;
  return (Array.isArray(cards) ? cards : [])
    .filter(Boolean)
    .slice(0, SPAWN_NETWORK_MAX_CARDS)
    .map((card, index) => ({
      id: card.id || `music-slot-${cardKind}-${index + 1}`,
      title: card.title || `${spawnKindLabel(kind)} ${index + 1}`,
      subtitle: card.subtitle || (kind === "skill" ? "Music Slot Skill Card" : "Music Slot Relationship Tarot"),
      archetype: card.archetype || card.role || card.relationLabel || spawnKindLabel(kind),
      tarotNumber: card.tarotNumber || (kind === "skill" ? `S${index + 1}` : `R${index + 1}`),
      summary: card.summary || card.mechanic || card.reason || "",
      keywords: uniqueStrings([...(card.keywords || []), card.relationLabel, card.role, card.family, card.cardType]).slice(0, 7),
      stats: card.stats || {},
      tags: uniqueStrings([...(card.tags || []), "music-slot-spawn", cardKind]),
      sourceKind: card.sourceKind || cardKind,
      kind: card.kind || cardKind,
      cardType: card.cardType || (kind === "skill" ? "skill_card" : "relationship_tarot_card"),
      avatarContacts: avatarContact ? [avatarContact] : [],
      targetAvatarId: card.targetAvatarId || null,
      targetName: card.targetName || "",
      relationLabel: card.relationLabel || "",
      mechanic: card.mechanic || "",
      role: card.role || "",
      family: card.family || ""
    }));
}

function compactSpawnAvatarContact(avatar = {}) {
  const profile = avatar.profile ? {
    ...avatar.profile,
    relationshipTarotCards: [],
    skillCards: []
  } : undefined;
  return {
    id: avatar.id,
    name: avatar.name,
    role: avatar.role,
    summary: avatar.summary,
    portraitUri: avatar.portraitUri,
    songs: avatar.songs || [],
    profile
  };
}

function createSpawnNetwork({ avatar = {}, cards = [], kind = "relationship" } = {}) {
  const theme = spawnNetworkTheme(kind);
  const group = new THREE.Group();
  group.name = `tarotSpawnNetwork:${kind}`;
  group.userData.life = 0;

  const hubCard = {
    title: avatar.name || "Music Slot Avatar",
    subtitle: "Music Slot Avatar",
    archetype: spawnKindLabel(kind),
    tarotNumber: "MS",
    summary: avatar.role || avatar.summary || "Avatar currently locked into the music slot.",
    keywords: [kind === "skill" ? "skill loadout" : "relationship web"]
  };
  const hub = createSpawnNetworkNode(hubCard, theme, {
    hub: true,
    position: SPAWN_NETWORK_CENTER,
    phase: 0
  });
  group.add(hub.group);

  const nodes = [hub];
  const connectors = [];
  cards.forEach((card, index) => {
    const node = createSpawnNetworkNode(card, theme, {
      position: spawnNetworkCardPosition(index, cards.length),
      phase: 0.7 + index * 0.53
    });
    const connector = createSpawnNetworkConnector(hub.group, node.group, theme, index);
    group.add(connector, node.group);
    nodes.push(node);
    connectors.push(connector);
  });

  return {
    group,
    kind,
    avatar,
    cards,
    nodes,
    connectors,
    origin: SPAWN_NETWORK_CENTER.clone(),
    life: 0
  };
}

function spawnNetworkTheme(kind = "relationship") {
  if (kind === "skill") {
    return {
      accent: "#39ff14",
      secondary: "#f6c96d",
      line: 0x39ff14,
      lineSoft: 0xf6c96d,
      label: "SKILL CARD"
    };
  }
  return {
    accent: "#ff6df2",
    secondary: "#00f3ff",
    line: 0xff6df2,
    lineSoft: 0x00f3ff,
    label: "RELATIONSHIP TAROT"
  };
}

function spawnNetworkCardPosition(index, count) {
  const angle = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
  const radiusX = Math.min(2.15, 1.16 + count * 0.075);
  const radiusY = Math.min(1.0, 0.66 + count * 0.035);
  return new THREE.Vector3(
    SPAWN_NETWORK_CENTER.x + Math.cos(angle) * radiusX,
    SPAWN_NETWORK_CENTER.y + Math.sin(angle) * radiusY,
    SPAWN_NETWORK_CENTER.z + Math.sin(angle * 2) * 0.08
  );
}

function createSpawnNetworkNode(card, theme, { hub = false, position = SPAWN_NETWORK_CENTER, phase = 0 } = {}) {
  const width = hub ? SPAWN_NETWORK_HUB_SIZE : SPAWN_NETWORK_CARD_WIDTH;
  const height = hub ? SPAWN_NETWORK_HUB_SIZE : SPAWN_NETWORK_CARD_HEIGHT;
  const group = new THREE.Group();
  group.name = hub ? "spawnNetworkHub" : `spawnNetworkCard:${card.title}`;
  group.position.copy(position);
  group.userData.basePosition = position.clone();
  group.userData.phase = phase;
  group.userData.hub = hub;

  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.08, height + 0.08),
    new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
  );
  backing.position.z = -0.006;
  group.add(backing);

  const texture = createSpawnNetworkCardTexture(card, theme, { hub });
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
  );
  face.name = "spawnNetworkFace";
  face.userData.disposableTexture = texture;
  group.add(face);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width + 0.035, height + 0.035)),
    new THREE.LineBasicMaterial({
      color: theme.line,
      transparent: true,
      opacity: hub ? 0.82 : 0.66,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  frame.name = "spawnNetworkFrame";
  frame.position.z = 0.01;
  group.add(frame);

  const light = new THREE.PointLight(theme.line, hub ? 1.4 : 0.72, hub ? 2.4 : 1.6, 1.45);
  light.name = "spawnNetworkLight";
  light.position.set(0, 0, 0.22);
  group.add(light);

  group.scale.setScalar(0.08);
  return { group, card, hub };
}

function createSpawnNetworkConnector(fromGroup, toGroup, theme, index = 0) {
  const geometry = new THREE.CylinderGeometry(0.028, 0.028, 1, 12, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color: index % 2 ? theme.lineSoft : theme.line,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const beam = new THREE.Mesh(geometry, material);
  beam.name = "spawnNetworkConnector";
  beam.renderOrder = 1380;
  beam.userData.fromGroup = fromGroup;
  beam.userData.toGroup = toGroup;
  beam.userData.phase = index * 0.48;
  return beam;
}

function updateSpawnNetwork(network, camera, elapsed) {
  if (!network) return;
  network.life = Math.min(1, (network.life || 0) + 0.04);
  const appear = easeOutCubic(network.life);
  network.group.position.y = Math.sin(elapsed * 0.72) * 0.018;
  network.nodes.forEach((node, index) => {
    const base = node.group.userData.basePosition || SPAWN_NETWORK_CENTER;
    const phase = node.group.userData.phase || 0;
    const bob = Math.sin(elapsed * 1.34 + phase) * (node.hub ? 0.032 : 0.055);
    node.group.position.copy(base);
    node.group.position.y += bob;
    node.group.lookAt(camera.position);
    const pulse = (Math.sin(elapsed * 2.2 + phase) + 1) * 0.5;
    node.group.scale.setScalar(appear * (node.hub ? 1.04 + pulse * 0.035 : 0.96 + pulse * 0.045));
    const light = node.group.getObjectByName("spawnNetworkLight");
    if (light) light.intensity = appear * (node.hub ? 1.35 + pulse * 0.65 : 0.62 + pulse * 0.38);
    node.group.traverse((child) => {
      if (!child.material) return;
      if (child.material.opacity !== undefined) {
        if (child.material.userData.baseOpacity === undefined) child.material.userData.baseOpacity = child.material.opacity;
        child.material.opacity = child.material.userData.baseOpacity * appear;
      }
    });
    node.group.renderOrder = 1400 + index;
  });
  network.connectors.forEach((connector) => {
    const from = connector.userData.fromGroup?.position;
    const to = connector.userData.toGroup?.position;
    if (!from || !to) return;
    const midpoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const direction = new THREE.Vector3().subVectors(to, from);
    const distance = Math.max(0.001, direction.length());
    connector.position.copy(midpoint);
    connector.scale.set(1, distance, 1);
    connector.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    const pulse = (Math.sin(elapsed * 3.2 + connector.userData.phase) + 1) * 0.5;
    connector.material.opacity = appear * (0.68 + pulse * 0.28);
  });
}

function createSpawnNetworkCardTexture(card = {}, theme = spawnNetworkTheme(), { hub = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = hub ? 512 : 768;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, hexToRgba(theme.accent, 0.38));
  gradient.addColorStop(0.48, "rgba(2, 6, 23, 0.96)");
  gradient.addColorStop(1, hexToRgba(theme.secondary, 0.28));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = hexToRgba(theme.accent, 0.86);
  ctx.lineWidth = hub ? 7 : 8;
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  ctx.strokeStyle = hexToRgba(theme.secondary, 0.56);
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);

  ctx.fillStyle = theme.secondary;
  ctx.font = "800 34px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, card.tarotNumber || (hub ? "MS" : "HAPA"), 52, hub ? 94 : 100, 150);
  ctx.fillStyle = theme.accent;
  ctx.font = "700 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, hub ? "MUSIC SLOT" : theme.label, 52, hub ? 132 : 138, 380);

  ctx.fillStyle = "#f8f3e7";
  ctx.font = hub ? "900 48px Inter, system-ui, sans-serif" : "900 44px Inter, system-ui, sans-serif";
  wrapText(ctx, card.title || "Spawn Card", 52, hub ? 238 : 300, 408, hub ? 52 : 48, hub ? 3 : 4);

  ctx.fillStyle = "#aeb9ca";
  ctx.font = hub ? "600 24px Inter, system-ui, sans-serif" : "600 23px Inter, system-ui, sans-serif";
  wrapText(ctx, card.subtitle || card.archetype || "", 52, hub ? 340 : 472, 408, 30, hub ? 3 : 2);

  if (!hub) {
    ctx.fillStyle = "rgba(248, 243, 231, 0.86)";
    ctx.font = "500 21px Inter, system-ui, sans-serif";
    wrapText(ctx, card.summary || card.mechanic || card.archetype || "", 52, 552, 408, 28, 4);

    const keywords = (card.keywords || card.tags || []).slice(0, 4);
    ctx.font = "700 18px ui-monospace, SFMono-Regular, Menlo, monospace";
    keywords.forEach((keyword, index) => {
      const x = 52 + (index % 2) * 210;
      const y = 704 + Math.floor(index / 2) * 26;
      ctx.fillStyle = hexToRgba(index % 2 ? theme.secondary : theme.accent, 0.16);
      ctx.fillRect(x - 8, y - 19, 184, 24);
      ctx.fillStyle = index % 2 ? theme.secondary : theme.accent;
      fitText(ctx, String(keyword).toUpperCase(), x, y, 166);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCardMesh(card, entry, resources) {
  const group = new THREE.Group();
  group.name = "tarotCardVisual";

  const sideMaterial = resources.cardEdgeMaterial.clone();
  const body = new THREE.Mesh(resources.cardBodyGeometry, sideMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const faceMaterial = createCardFaceMaterial(card, entry);
  const face = new THREE.Mesh(resources.cardFaceGeometry, faceMaterial);
  face.name = "videoFace";
  face.rotation.x = -Math.PI / 2;
  face.position.y = CARD_DEPTH / 2 + 0.004;
  face.castShadow = false;
  group.add(face);
  entry.faceMesh = face;

  const back = new THREE.Mesh(resources.cardFaceGeometry, resources.cardBackMaterial);
  back.rotation.x = Math.PI / 2;
  back.position.y = -CARD_DEPTH / 2 - 0.004;
  group.add(back);

  const edge = new THREE.LineSegments(resources.cardEdgeLinesGeometry, resources.cardLineMaterial.clone());
  edge.name = "cardEdgeLines";
  group.add(edge);

  const halo = new THREE.Mesh(resources.cardHaloGeometry, resources.cardHaloMaterial.clone());
  halo.name = "cardHalo";
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = CARD_DEPTH / 2 + 0.009;
  group.add(halo);

  if (TAROT_CARD_POINT_LIGHTS_ENABLED) {
    const light = new THREE.PointLight(0xf6c96d, 1.1, 2.4, 1.35);
    light.name = "signalLight";
    light.position.set(0, 0.22, 0);
    group.add(light);

    const neonLight = new THREE.PointLight(0xff4df0, 0.55, 2.4, 1.25);
    neonLight.name = "cardNeonLight";
    neonLight.position.set(0, CARD_DEPTH / 2 + 0.24, -CARD_HEIGHT * 0.18);
    group.add(neonLight);
  }

  const plaque = createCardPlaque(card, resources);
  plaque.position.set(0, CARD_DEPTH / 2 + 0.012, CARD_HEIGHT * 0.36);
  plaque.rotation.x = -Math.PI / 2;
  group.add(plaque);

  const targetLock = createCardTargetLock();
  group.add(targetLock);

  const hitTarget = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_WIDTH * 0.66, CARD_HEIGHT * 0.7),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  hitTarget.name = "cardHitTarget";
  hitTarget.rotation.x = -Math.PI / 2;
  hitTarget.position.y = CARD_DEPTH / 2 + 0.026;
  hitTarget.visible = false;
  group.add(hitTarget);

  return group;
}

function createCardTargetLock() {
  const root = new THREE.Group();
  root.name = "targetLock";
  root.visible = false;
  root.userData.active = 0;
  root.position.y = CARD_DEPTH / 2 + 0.032;

  const flat = new THREE.Group();
  flat.name = "targetLockFlat";
  flat.rotation.x = -Math.PI / 2;
  root.add(flat);

  const cyan = new THREE.MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const magenta = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const gold = new THREE.MeshBasicMaterial({
    color: 0xf6c96d,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const outer = new THREE.Mesh(new THREE.RingGeometry(CARD_WIDTH * 0.68, CARD_WIDTH * 0.74, 128), cyan.clone());
  outer.name = "targetLockOuterRing";
  outer.scale.y = CARD_HEIGHT / CARD_WIDTH;
  flat.add(outer);

  const inner = new THREE.Mesh(new THREE.RingGeometry(CARD_WIDTH * 0.5, CARD_WIDTH * 0.515, 96), magenta.clone());
  inner.name = "targetLockInnerRing";
  inner.scale.y = CARD_HEIGHT / CARD_WIDTH;
  flat.add(inner);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_WIDTH * 1.12, CARD_HEIGHT * 1.1)),
    new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  frame.name = "targetLockFrame";
  flat.add(frame);

  const bracketLength = 0.22;
  const bracketThickness = 0.026;
  const x = CARD_WIDTH * 0.58;
  const y = CARD_HEIGHT * 0.57;
  [
    [-x, y, bracketLength, bracketThickness, 0, cyan.clone(), "targetLockCorner"],
    [-x, y, bracketThickness, bracketLength, 0, cyan.clone(), "targetLockCorner"],
    [x, y, bracketLength, bracketThickness, 0, magenta.clone(), "targetLockCorner"],
    [x, y, bracketThickness, bracketLength, 0, magenta.clone(), "targetLockCorner"],
    [-x, -y, bracketLength, bracketThickness, 0, magenta.clone(), "targetLockCorner"],
    [-x, -y, bracketThickness, bracketLength, 0, magenta.clone(), "targetLockCorner"],
    [x, -y, bracketLength, bracketThickness, 0, cyan.clone(), "targetLockCorner"],
    [x, -y, bracketThickness, bracketLength, 0, cyan.clone(), "targetLockCorner"]
  ].forEach(([cx, cy, width, height, rotation, material, name], index) => {
    const bracket = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    bracket.name = name;
    bracket.userData.cornerIndex = index;
    bracket.position.set(
      cx + Math.sign(cx) * (width > height ? -bracketLength * 0.36 : 0),
      cy + Math.sign(cy) * (height > width ? -bracketLength * 0.36 : 0),
      0.002 + index * 0.0004
    );
    bracket.rotation.z = rotation;
    flat.add(bracket);
  });

  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH * 0.92, 0.022), gold.clone());
  sweep.name = "targetLockSweep";
  sweep.position.z = 0.006;
  flat.add(sweep);

  let light = null;
  if (TAROT_CARD_POINT_LIGHTS_ENABLED) {
    light = new THREE.PointLight(0x00f3ff, 0, 2.9, 1.6);
    light.name = "targetLockLight";
    light.position.set(0, 0.34, 0);
    root.add(light);
  }

  root.userData.refs = {
    flat,
    outer,
    inner,
    frame,
    sweep,
    light,
    corners: flat.children.filter((piece) => piece.name === "targetLockCorner")
  };

  return root;
}

function updateCardTargetLock(targetLock, active, elapsed, lockedZone = false) {
  if (!targetLock) return;
  const nextActive = THREE.MathUtils.lerp(targetLock.userData.active || 0, active ? 1 : 0, active ? 0.34 : 0.18);
  targetLock.userData.active = nextActive;
  targetLock.visible = nextActive > 0.02;
  if (!targetLock.visible) return;
  const refs = targetLock.userData.refs || {};
  const beat = (Math.sin(elapsed * 7.2) + 1) * 0.5;
  const scan = Math.sin(elapsed * 4.4);
  const power = nextActive * (0.78 + beat * 0.32);
  targetLock.position.y = CARD_DEPTH / 2 + 0.036 + power * 0.018;
  targetLock.scale.setScalar(1 + nextActive * 0.035 + beat * nextActive * 0.028);

  const flat = refs.flat;
  if (flat) {
    flat.rotation.z = Math.sin(elapsed * 1.2) * 0.018;
  }
  const outer = refs.outer;
  if (outer?.material) {
    outer.rotation.z = elapsed * 0.42;
    outer.material.opacity = nextActive * (0.38 + beat * 0.26);
  }
  const inner = refs.inner;
  if (inner?.material) {
    inner.rotation.z = -elapsed * 0.58;
    inner.material.opacity = nextActive * (0.24 + beat * 0.2);
  }
  const frame = refs.frame;
  if (frame?.material) {
    frame.material.opacity = nextActive * (0.52 + beat * 0.3);
    frame.scale.setScalar(1 + beat * nextActive * 0.045);
  }
  const sweep = refs.sweep;
  if (sweep?.material) {
    sweep.position.y = scan * CARD_HEIGHT * 0.42;
    sweep.material.opacity = nextActive * (0.18 + beat * 0.28);
  }
  const corners = refs.corners || [];
  for (const piece of corners) {
    if (!piece?.material) continue;
    const phase = Math.sin(elapsed * 8.5 + (piece.userData.cornerIndex || 0) * 0.75);
    piece.material.opacity = nextActive * (0.58 + Math.max(0, phase) * 0.34);
    piece.scale.setScalar(1 + nextActive * 0.14 + Math.max(0, phase) * 0.08);
  }
  const light = refs.light;
  if (light) {
    light.intensity = nextActive * (lockedZone ? 4.4 : 6.8) + beat * nextActive * 2.4;
    light.color.setHex(beat > 0.58 ? 0xff00ff : 0x00f3ff);
  }
}

function createCardFaceMaterial(card, entry) {
  const posterTexture = createPosterTexture(card);
  const hasMotion = Boolean(card.videoUri || card.liveCamera || entry.liveCamera);
  const baseMaterial = new THREE.MeshStandardMaterial({
    map: posterTexture,
    transparent: Boolean(entry.videoKeying || entry.videoSourceHasAlpha),
    roughness: hasMotion ? 0.42 : 0.48,
    metalness: hasMotion ? 0.06 : 0.08,
    emissive: hasMotion ? 0xffffff : 0x1b1024,
    emissiveMap: hasMotion ? posterTexture : null,
    emissiveIntensity: hasMotion ? 0.1 : 0.16
  });
  const material = hasMotion || entry.videoKeying
    ? makeVideoBackgroundKeyable(baseMaterial, {
        enabled: Boolean(entry.videoKeying),
        sourceHasAlpha: Boolean(entry.videoSourceHasAlpha),
        threshold: 0.9,
        softness: 0.08
      })
    : baseMaterial;
  material.userData.hapaSolidCardFaceVideo = true;
  entry.posterTexture = posterTexture;
  entry.baseFaceMaterial = material;
  entry.faceMaterial = material;
  return material;
}

function createCameraCardHapaGradeMaterial(videoTexture) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      inputImage: { value: videoTexture },
      uTime: { value: 0 },
      uRenderSize: { value: new THREE.Vector2(1280, 720) },
      hapaAmount: { value: CAMERA_CARD_SHADER_DEFAULTS.hapaAmount },
      goldWarmth: { value: CAMERA_CARD_SHADER_DEFAULTS.goldWarmth },
      tealShadow: { value: CAMERA_CARD_SHADER_DEFAULTS.tealShadow },
      inkLines: { value: CAMERA_CARD_SHADER_DEFAULTS.inkLines },
      goldEdges: { value: CAMERA_CARD_SHADER_DEFAULTS.goldEdges },
      hapaGeometry: { value: CAMERA_CARD_SHADER_DEFAULTS.geometry },
      grain: { value: CAMERA_CARD_SHADER_DEFAULTS.grain },
      skinProtect: { value: CAMERA_CARD_SHADER_DEFAULTS.skinProtect },
      contrast: { value: CAMERA_CARD_SHADER_DEFAULTS.contrast },
      bloomFake: { value: CAMERA_CARD_SHADER_DEFAULTS.bloomFake },
      vignette: { value: CAMERA_CARD_SHADER_DEFAULTS.vignette }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;

      uniform sampler2D inputImage;
      uniform float uTime;
      uniform vec2 uRenderSize;
      uniform float hapaAmount;
      uniform float goldWarmth;
      uniform float tealShadow;
      uniform float inkLines;
      uniform float goldEdges;
      uniform float hapaGeometry;
      uniform float grain;
      uniform float skinProtect;
      uniform float contrast;
      uniform float bloomFake;
      uniform float vignette;

      varying vec2 vUv;

      float sat(float x) { return clamp(x, 0.0, 1.0); }
      vec3 sat3(vec3 x) { return clamp(x, 0.0, 1.0); }

      vec4 readInput(vec2 uv) {
        vec2 sampleUv = clamp(uv, vec2(0.0), vec2(1.0));
        sampleUv.x = 1.0 - sampleUv.x;
        return texture2D(inputImage, sampleUv);
      }

      float luma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float ring(vec2 p, float r, float w) {
        return smoothstep(w, 0.0, abs(length(p) - r));
      }

      float lineGrid(vec2 p, float angle, float width) {
        vec2 d = vec2(cos(angle), sin(angle));
        float distToLine = abs(dot(p, vec2(-d.y, d.x)));
        return smoothstep(width, 0.0, distToLine);
      }

      float skinMask(vec3 c) {
        float y = luma(c);
        float maxc = max(max(c.r, c.g), c.b);
        float minc = min(min(c.r, c.g), c.b);
        float s = (maxc - minc) / max(maxc, 0.001);
        float warm = smoothstep(-0.05, 0.22, c.r - c.g) * smoothstep(0.02, 0.28, c.r - c.b);
        float mid = smoothstep(0.10, 0.35, y) * (1.0 - smoothstep(0.93, 1.0, y));
        float chroma = smoothstep(0.06, 0.35, s);
        return sat(warm * mid * chroma);
      }

      vec3 contrastCurve(vec3 c, float amount) {
        c = mix(c, smoothstep(vec3(0.0), vec3(1.0), c), amount);
        return sat3((c - 0.5) * (1.0 + amount * 0.55) + 0.5);
      }

      vec3 hapaPalette(vec3 c) {
        float y = luma(c);
        vec3 ink = vec3(0.014, 0.020, 0.030);
        vec3 midnight = vec3(0.020, 0.055, 0.090);
        vec3 teal = vec3(0.030, 0.190, 0.210);
        vec3 umber = vec3(0.320, 0.210, 0.130);
        vec3 parchment = vec3(0.740, 0.640, 0.480);
        vec3 antique = vec3(0.940, 0.660, 0.250);
        vec3 bone = vec3(0.980, 0.900, 0.720);

        vec3 pal = mix(ink, midnight, smoothstep(0.02, 0.20, y));
        pal = mix(pal, teal, smoothstep(0.09, 0.38, y) * tealShadow);
        pal = mix(pal, umber, smoothstep(0.24, 0.56, y) * (0.35 + 0.35 * goldWarmth));
        pal = mix(pal, parchment, smoothstep(0.40, 0.76, y) * 0.72);
        pal = mix(pal, antique, smoothstep(0.62, 0.94, y) * goldWarmth);
        pal = mix(pal, bone, smoothstep(0.82, 1.00, y) * 0.65);

        float detail = y * 0.55 + 0.25;
        return sat3(pal * detail + c * 0.33);
      }

      float sobelEdge(vec2 uv) {
        vec2 px = 1.0 / max(uRenderSize, vec2(1.0));

        float tl = luma(readInput(uv + px * vec2(-1.0,  1.0)).rgb);
        float t = luma(readInput(uv + px * vec2( 0.0,  1.0)).rgb);
        float tr = luma(readInput(uv + px * vec2( 1.0,  1.0)).rgb);
        float l = luma(readInput(uv + px * vec2(-1.0,  0.0)).rgb);
        float r = luma(readInput(uv + px * vec2( 1.0,  0.0)).rgb);
        float bl = luma(readInput(uv + px * vec2(-1.0, -1.0)).rgb);
        float b = luma(readInput(uv + px * vec2( 0.0, -1.0)).rgb);
        float br = luma(readInput(uv + px * vec2( 1.0, -1.0)).rgb);

        float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
        float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
        float g = sqrt(gx * gx + gy * gy);
        return smoothstep(0.10, 0.36, g);
      }

      float celestialOverlay(vec2 uv) {
        vec2 aspect = vec2(uRenderSize.x / max(1.0, uRenderSize.y), 1.0);
        vec2 p = (uv - 0.5) * aspect;
        float d = length(p);
        float a = atan(p.y, p.x);

        float rings = 0.0;
        rings += ring(p, 0.18, 0.0025);
        rings += ring(p, 0.31, 0.0020);
        rings += ring(p, 0.47, 0.0018);

        float rays = pow(abs(cos(a * 8.0)), 42.0) * smoothstep(0.06, 0.18, d) * (1.0 - smoothstep(0.48, 0.72, d));
        float cross = lineGrid(p, 0.0, 0.0014) + lineGrid(p, 1.5708, 0.0014) + lineGrid(p, 0.7854, 0.0011) * 0.55 + lineGrid(p, -0.7854, 0.0011) * 0.55;
        cross *= (1.0 - smoothstep(0.45, 0.80, d));

        vec2 cell = floor((uv + vec2(uTime * 0.008, -uTime * 0.005)) * 80.0);
        float star = step(0.992, hash12(cell));
        float sparkle = star * pow(hash12(cell + 19.17), 3.0);

        return sat((rings + rays * 0.65 + cross * 0.20) * hapaGeometry + sparkle * hapaGeometry * 0.55);
      }

      void main() {
        vec2 uv = vUv;
        vec4 src4 = readInput(uv);
        vec3 src = sat3(src4.rgb);

        vec3 c = src;
        c = pow(c, vec3(0.92));
        c = contrastCurve(c, contrast);

        float y = luma(c);
        float sm = skinMask(c) * skinProtect;
        vec3 stylized = hapaPalette(c);

        vec3 skinTone = c * vec3(1.10, 1.00, 0.88) + vec3(0.030, 0.014, 0.000);
        stylized = mix(stylized, sat3(skinTone), sm * 0.72);

        float hot = smoothstep(0.66, 1.0, y);
        stylized += vec3(1.00, 0.62, 0.20) * hot * bloomFake * goldWarmth;

        float e = sobelEdge(uv) * inkLines;
        vec3 ink = vec3(0.018, 0.012, 0.010);
        vec3 gold = vec3(1.00, 0.62, 0.20);
        stylized = mix(stylized, ink, e * (0.42 + 0.30 * (1.0 - y)));
        stylized += gold * e * goldEdges * smoothstep(0.18, 0.72, y);

        float geo = celestialOverlay(uv);
        stylized += vec3(1.00, 0.68, 0.24) * geo * 0.50;
        stylized += vec3(0.08, 0.45, 0.55) * geo * 0.12;

        float n1 = hash12(uv * uRenderSize + uTime * 12.0);
        float n2 = hash12(floor(uv * uRenderSize * 0.33));
        float paper = (n1 - 0.5) * 0.075 + (n2 - 0.5) * 0.045;
        stylized += paper * grain;

        vec2 aspect = vec2(uRenderSize.x / max(1.0, uRenderSize.y), 1.0);
        vec2 p = (uv - 0.5) * aspect;
        float vig = smoothstep(0.92, 0.22, length(p));
        vec3 edgeTone = vec3(0.010, 0.017, 0.028);
        stylized = mix(edgeTone, stylized, mix(1.0, vig, vignette));

        vec3 outColor = sat3(mix(src, sat3(stylized), hapaAmount));
        gl_FragColor = vec4(outColor, src4.a);
      }
    `,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    toneMapped: false
  });
  material.userData.hapaSolidCardFaceVideo = true;
  material.userData.hapaCameraCardShader = true;
  return material;
}

function updateCameraCardShaderUniforms(entry, elapsed = 0) {
  const material = entry?.cameraShaderMaterial;
  if (!entry?.cameraShaderEnabled || !material?.uniforms) return;
  updateCameraCardShaderMaterialUniforms(material, entry.videoTexture, entry.video, elapsed);
}

function updateCameraCardShaderMaterialUniforms(material, videoTexture, video, elapsed = 0) {
  if (!material?.uniforms) return;
  if (videoTexture && material.uniforms.inputImage.value !== videoTexture) {
    material.uniforms.inputImage.value = videoTexture;
  }
  material.uniforms.uTime.value = elapsed;
  const width = Math.max(1, Math.floor(video?.videoWidth || 1280));
  const height = Math.max(1, Math.floor(video?.videoHeight || 720));
  const renderSize = material.uniforms.uRenderSize.value;
  if (renderSize.x !== width || renderSize.y !== height) renderSize.set(width, height);
}

function createCameraCardMicWaveformOverlay() {
  const group = new THREE.Group();
  group.name = "cameraCardMicWaveform";
  group.rotation.x = -Math.PI / 2;
  group.position.set(0, CARD_DEPTH / 2 + 0.052, CAMERA_CARD_MIC_WAVE_Z);
  group.renderOrder = 28;

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(CAMERA_CARD_MIC_WAVE_WIDTH * 1.08, CAMERA_CARD_MIC_WAVE_HEIGHT * 1.72),
    new THREE.MeshBasicMaterial({
      color: 0x04131d,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
  );
  plate.name = "cameraCardMicWavePlate";
  plate.position.z = -0.003;
  group.add(plate);

  const positions = new Float32Array(CAMERA_CARD_MIC_WAVE_POINTS * 3);
  for (let i = 0; i < CAMERA_CARD_MIC_WAVE_POINTS; i += 1) {
    const t = i / Math.max(1, CAMERA_CARD_MIC_WAVE_POINTS - 1);
    positions[i * 3] = THREE.MathUtils.lerp(-CAMERA_CARD_MIC_WAVE_WIDTH / 2, CAMERA_CARD_MIC_WAVE_WIDTH / 2, t);
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0.004;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));

  const glowLine = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  glowLine.name = "cameraCardMicWaveGlow";
  glowLine.position.z = 0.004;
  group.add(glowLine);

  const coreLine = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xf6c96d,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  coreLine.name = "cameraCardMicWaveCore";
  coreLine.position.z = 0.008;
  group.add(coreLine);

  const labelTexture = createMicWaveformLabelTexture();
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(CAMERA_CARD_MIC_WAVE_WIDTH * 0.34, CAMERA_CARD_MIC_WAVE_HEIGHT * 0.34),
    new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      depthTest: false
    })
  );
  label.name = "cameraCardMicWaveLabel";
  label.position.set(-CAMERA_CARD_MIC_WAVE_WIDTH * 0.34, -CAMERA_CARD_MIC_WAVE_HEIGHT * 0.56, 0.01);
  label.userData.disposableTexture = labelTexture;
  group.add(label);

  group.userData = {
    positions,
    geometry,
    plate,
    glowLine,
    coreLine
  };
  return group;
}

function createMicWaveformLabelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(0, 243, 255, 0.66)";
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = "#f6c96d";
  ctx.font = "800 25px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("LIVE MIC", 20, 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCameraCardTranscriptBubble() {
  const group = new THREE.Group();
  group.name = "cameraCardSpeechBubble";
  group.rotation.x = -Math.PI / 2;
  group.position.set(CAMERA_CARD_SPEECH_BUBBLE_X, CARD_DEPTH / 2 + 0.078, CAMERA_CARD_SPEECH_BUBBLE_Z);
  group.renderOrder = 32;

  const texture = createCameraCardTranscriptTexture("", { state: "idle", pointer: "left" });
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
  });
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(CAMERA_CARD_SPEECH_BUBBLE_WIDTH, CAMERA_CARD_SPEECH_BUBBLE_HEIGHT),
    material
  );
  face.name = "cameraCardSpeechBubbleFace";
  face.renderOrder = 33;
  group.add(face);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(CAMERA_CARD_SPEECH_BUBBLE_WIDTH * 0.94, CAMERA_CARD_SPEECH_BUBBLE_HEIGHT * 0.72)),
    new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  frame.name = "cameraCardSpeechBubbleFrame";
  frame.position.z = 0.012;
  frame.renderOrder = 34;
  group.add(frame);

  group.userData = {
    bubbleMaterial: material,
    bubbleMesh: face,
    frame
  };
  return group;
}

function createCameraCardTranscriptTexture(text = "", { state = "idle", pointer = "left" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pointerLeft = pointer === "left";
  const bodyX = pointerLeft ? 54 : 18;
  const bodyY = 24;
  const bodyW = canvas.width - 72;
  const bodyH = canvas.height - 48;
  const accent = state === "error" ? "#ff4d6d" : state === "listening" || state === "transcribing" || state === "notice" ? "#f6c96d" : "#00f3ff";
  const secondary = state === "error" ? "#f6c96d" : "#ff6df2";
  const entries = speechBubbleTextEntries(text || (state === "idle" ? "Waiting for speech..." : "Listening..."));

  ctx.save();
  const gradient = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY + bodyH);
  gradient.addColorStop(0, "rgba(2, 6, 23, 0.94)");
  gradient.addColorStop(0.62, "rgba(4, 19, 29, 0.9)");
  gradient.addColorStop(1, "rgba(20, 9, 33, 0.88)");
  ctx.fillStyle = gradient;
  drawRoundedRectPath(ctx, bodyX, bodyY, bodyW, bodyH, 22);
  ctx.fill();

  ctx.beginPath();
  if (pointerLeft) {
    ctx.moveTo(18, canvas.height * 0.5);
    ctx.lineTo(bodyX + 8, canvas.height * 0.5 - 34);
    ctx.lineTo(bodyX + 8, canvas.height * 0.5 + 34);
  } else {
    ctx.moveTo(canvas.width - 18, canvas.height * 0.5);
    ctx.lineTo(bodyX + bodyW - 8, canvas.height * 0.5 - 34);
    ctx.lineTo(bodyX + bodyW - 8, canvas.height * 0.5 + 34);
  }
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = hexToRgba(accent, 0.82);
  drawRoundedRectPath(ctx, bodyX + 3, bodyY + 3, bodyW - 6, bodyH - 6, 19);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(secondary, 0.34);
  ctx.lineWidth = 2;
  ctx.strokeRect(bodyX + 18, bodyY + 18, bodyW - 36, bodyH - 36);

  ctx.fillStyle = hexToRgba(accent, state === "listening" ? 0.22 : 0.14);
  ctx.fillRect(bodyX + 24, bodyY + bodyH - 45, bodyW - 48, 8);
  ctx.fillStyle = hexToRgba(accent, 0.74);
  const activeWidth = state === "listening" ? bodyW * 0.42 : state === "transcribing" ? bodyW * 0.52 : state === "live" ? bodyW * 0.64 : bodyW * 0.22;
  ctx.fillRect(bodyX + 24, bodyY + bodyH - 45, activeWidth, 8);

  ctx.fillStyle = accent;
  ctx.font = "900 23px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(state === "error" ? "STT BLOCKED" : state === "listening" ? "RECORDING SPEECH" : state === "transcribing" ? "TRANSCRIBING QUEUE" : state === "notice" ? "DICTATION STATUS" : "CAMERA CARD LOG", bodyX + 34, bodyY + 48);

  ctx.font = "800 25px Inter, system-ui, sans-serif";
  entries.forEach((entry, index) => {
    const y = bodyY + 95 + index * 67;
    ctx.fillStyle = index === 0 ? "rgba(248, 243, 231, 0.98)" : "rgba(248, 243, 231, 0.78)";
    wrapText(ctx, entry, bodyX + 34, y, bodyW - 68, 30, index === 0 ? 2 : 1);
    if (index < entries.length - 1) {
      ctx.strokeStyle = "rgba(125, 211, 252, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bodyX + 34, y + 38);
      ctx.lineTo(bodyX + bodyW - 34, y + 38);
      ctx.stroke();
    }
  });

  ctx.fillStyle = "rgba(125, 211, 252, 0.72)";
  ctx.font = "800 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(state === "listening" ? "Capturing without blocking STT" : state === "transcribing" ? "Large-v3 draining queued audio" : state === "notice" ? "Waiting for clearer speech" : "Attached to webcam profile", bodyX + 34, bodyY + bodyH - 21);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speechBubbleTextEntries(value = "") {
  const entries = String(value || "")
    .split(/\n+/)
    .map((line) => compactSpeechBubbleText(line, 148))
    .filter(Boolean)
    .slice(0, 3);
  return entries.length ? entries : ["Waiting for speech..."];
}

function compactSpeechBubbleText(value = "", maxLength = 210) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "Waiting for speech...";
  if (compact.length <= maxLength) return compact;
  return `...${compact.slice(-(maxLength - 3)).replace(/^\S+\s+/, "")}`;
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createCardPlaque(card, resources) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 104;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(246, 201, 109, 0.82)";
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = "#f6c96d";
  ctx.font = "700 24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(card.tarotNumber || card.archetype || "HAPA", 22, 34);
  ctx.fillStyle = "#f8f3e7";
  ctx.font = "800 33px Inter, system-ui, sans-serif";
  fitText(ctx, card.title, 22, 76, 466);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.92, depthWrite: false });
  const mesh = new THREE.Mesh(resources.cardPlaqueGeometry, material);
  mesh.userData.disposableTexture = texture;
  return mesh;
}

function createPosterTexture(card) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  drawPosterCanvas(ctx, card);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (card.posterUri && typeof Image !== "undefined") {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      drawPosterCanvas(ctx, card, image);
      texture.needsUpdate = true;
    };
    image.src = card.posterUri;
  }
  return texture;
}

function drawPosterCanvas(ctx, card, image = null) {
  ctx.clearRect(0, 0, 512, 768);
  if (image) {
    drawCoverImage(ctx, image, 0, 0, 512, 768);
    const overlay = ctx.createLinearGradient(0, 0, 0, 768);
    overlay.addColorStop(0, "rgba(2, 6, 23, 0.08)");
    overlay.addColorStop(0.56, "rgba(2, 6, 23, 0.06)");
    overlay.addColorStop(1, "rgba(2, 6, 23, 0.72)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, 512, 768);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 512, 768);
    gradient.addColorStop(0, "#1b0b28");
    gradient.addColorStop(0.52, "#061424");
    gradient.addColorStop(1, "#02040a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 768);
    ctx.fillStyle = "rgba(0, 243, 255, 0.18)";
    for (let i = 0; i < 18; i += 1) {
      ctx.fillRect(48 + Math.random() * 380, 64 + Math.random() * 620, 2, 80 + Math.random() * 160);
    }
  }
  ctx.strokeStyle = "#f6c96d";
  ctx.lineWidth = 8;
  ctx.strokeRect(24, 24, 464, 720);
  ctx.fillStyle = "#f6c96d";
  ctx.font = "700 46px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(card.tarotNumber || "HAPA", 52, 110);
  ctx.fillStyle = "#f8f3e7";
  ctx.font = "900 52px Inter, system-ui, sans-serif";
  fitText(ctx, card.title, 52, image ? 654 : 392, 408);
  ctx.fillStyle = "#dbeafe";
  ctx.font = "500 24px Inter, system-ui, sans-serif";
  wrapText(ctx, card.subtitle || card.summary || "Living tarot object", 52, image ? 698 : 450, 410, 30, image ? 2 : 5);
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const imageWidth = image.naturalWidth || image.width || width;
  const imageHeight = image.naturalHeight || image.height || height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function createResourceLibrary() {
  const tableTexture = createTableTexture();
  const boardTexture = createBoardTexture();
  const backTextures = Object.fromEntries(CARD_BACK_STYLES.map((style) => [style.id, createCardBackTexture(style)]));
  const activeBackTexture = backTextures[CARD_BACK_STYLES[0].id];
  const cardBodyGeometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_DEPTH, CARD_HEIGHT, 1, 1, 1);
  const cardFaceGeometry = new THREE.PlaneGeometry(CARD_WIDTH * 0.94, CARD_HEIGHT * 0.94, 1, 1);
  const cardPlaqueGeometry = new THREE.PlaneGeometry(CARD_WIDTH * 0.82, CARD_HEIGHT * 0.16);
  const cardEdgeLinesGeometry = new THREE.EdgesGeometry(cardBodyGeometry);
  const cardHaloGeometry = new THREE.RingGeometry(0.55, 0.61, 72);
  [
    cardBodyGeometry,
    cardFaceGeometry,
    cardPlaqueGeometry,
    cardEdgeLinesGeometry,
    cardHaloGeometry
  ].forEach((geometry) => {
    geometry.userData.sharedResource = true;
  });
  const cardBackMaterial = new THREE.MeshStandardMaterial({ map: activeBackTexture, roughness: 0.5, metalness: 0.18, emissive: 0x09062a, emissiveIntensity: 0.18 });
  cardBackMaterial.userData.sharedResource = true;
  return {
    tableTexture,
    boardTexture,
    backTextures,
    cardBodyGeometry,
    cardFaceGeometry,
    cardPlaqueGeometry,
    cardEdgeLinesGeometry,
    cardHaloGeometry,
    cardEdgeMaterial: new THREE.MeshStandardMaterial({ color: 0x34243a, roughness: 0.24, metalness: 0.7, emissive: 0x4a2600, emissiveIntensity: 0.26 }),
    cardBackMaterial,
    cardLineMaterial: new THREE.LineBasicMaterial({ color: 0xf6c96d, transparent: true, opacity: 0.78 }),
    cardHaloMaterial: new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    sparkGeometry: new THREE.TetrahedronGeometry(0.025, 0),
    sparkMaterial: new THREE.MeshBasicMaterial({ color: 0xf6c96d, transparent: true, opacity: 0.82 }),
    tableMaterial: new THREE.MeshStandardMaterial({ map: tableTexture, color: 0x4d6574, roughness: 0.66, metalness: 0.06, emissive: 0x102a32, emissiveIntensity: 0.14 }),
    boardMaterial: new THREE.MeshPhysicalMaterial({ map: boardTexture, color: 0x14344b, roughness: 0.32, metalness: 0.24, clearcoat: 0.58, clearcoatRoughness: 0.22, emissive: 0x063845, emissiveIntensity: 0.28 })
  };
}

function applyCardBackStyle(resources, styleId) {
  const style = CARD_BACK_STYLES.find((item) => item.id === styleId) || CARD_BACK_STYLES[0];
  const texture = resources.backTextures?.[style.id] || resources.backTextures?.[CARD_BACK_STYLES[0].id];
  if (!texture || !resources.cardBackMaterial) return;
  resources.cardBackMaterial.map = texture;
  resources.cardBackMaterial.emissive.set(style.id === "node" ? 0x041a12 : style.id === "protocol" ? 0x1c1200 : 0x09062a);
  resources.cardBackMaterial.needsUpdate = true;
}

function createBoard(resources) {
  const root = new THREE.Group();
  root.name = "tarotBoard";
  const table = new THREE.Mesh(new THREE.BoxGeometry(8.15, 0.18, 5.35), resources.tableMaterial);
  table.position.y = -0.11;
  table.receiveShadow = true;
  root.add(table);

  const board = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.065, 4.65), resources.boardMaterial);
  board.position.y = 0.005;
  board.receiveShadow = true;
  board.castShadow = true;
  root.add(board);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2340, roughness: 0.28, metalness: 0.58, emissive: 0x007c86, emissiveIntensity: 0.34 });
  const railGeoX = new THREE.BoxGeometry(7.58, 0.08, 0.055);
  const railGeoZ = new THREE.BoxGeometry(0.055, 0.08, 4.83);
  [
    [railGeoX, 0, 0.07, -2.43],
    [railGeoX, 0, 0.07, 2.43],
    [railGeoZ, -3.82, 0.07, 0],
    [railGeoZ, 3.82, 0.07, 0]
  ].forEach(([geo, x, y, z]) => {
    const rail = new THREE.Mesh(geo, railMaterial);
    rail.position.set(x, y, z);
    rail.castShadow = true;
    root.add(rail);
  });
  return root;
}

function createDeckStack(resources) {
  const root = new THREE.Group();
  root.name = "tarotDeckStack";
  root.position.copy(DECK_POSITION);
  const dummy = new THREE.Object3D();
  const cards = new THREE.InstancedMesh(resources.cardBodyGeometry, resources.cardBackMaterial, 9);
  cards.name = "tarotDeckStackCards";
  for (let i = 0; i < 9; i += 1) {
    dummy.position.set(i * 0.006, i * 0.012, -i * 0.006);
    dummy.rotation.set(0, i * 0.015, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    cards.setMatrixAt(i, dummy.matrix);
  }
  cards.instanceMatrix.needsUpdate = true;
  root.add(cards);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.62, 72), new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.13;
  root.add(halo);
  return root;
}

function createDockTray(resources) {
  const root = new THREE.Group();
  root.name = "tarotDockTray";
  root.position.copy(DOCK_POSITION);
  root.userData.baseY = DOCK_POSITION.y;
  root.userData.energy = 0;

  const trayWidth = DOCK_HALF_WIDTH * 2 + 0.24;
  const trayDepth = DOCK_HALF_DEPTH * 2 + 0.18;
  const baseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x142637,
    roughness: 0.28,
    metalness: 0.48,
    clearcoat: 0.52,
    clearcoatRoughness: 0.2,
    emissive: 0x082f35,
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.92
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(trayWidth, 0.14, trayDepth), baseMaterial);
  base.name = "dockTrayBase";
  base.position.y = -0.035;
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7c78d,
    roughness: 0.22,
    metalness: 0.82,
    emissive: 0x68440f,
    emissiveIntensity: 0.24
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  [
    [trayWidth, 0.075, 0.07, 0, 0.06, DOCK_HALF_DEPTH + 0.08],
    [trayWidth, 0.06, 0.055, 0, 0.045, -DOCK_HALF_DEPTH - 0.05],
    [0.07, 0.068, trayDepth, -trayWidth / 2 + 0.035, 0.05, 0],
    [0.07, 0.068, trayDepth, trayWidth / 2 - 0.035, 0.05, 0]
  ].forEach(([width, height, depth, x, y, z]) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), railMaterial.clone());
    rail.position.set(x, y, z);
    rail.castShadow = true;
    root.add(rail);
  });

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(trayWidth * 0.96, trayDepth * 1.16),
    glowMaterial.clone()
  );
  glow.name = "dockTrayGlow";
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.052;
  root.add(glow);

  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(trayWidth + DOCK_MAGNET_MARGIN * 1.6, trayDepth + DOCK_MAGNET_MARGIN * 1.48),
    new THREE.MeshBasicMaterial({
      color: 0xff6df2,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  field.name = "dockTrayMagnetField";
  field.rotation.x = -Math.PI / 2;
  field.position.y = 0.048;
  root.add(field);

  const slotCount = 3;
  const slotSpacing = (DOCK_HALF_WIDTH * 2 - CARD_WIDTH * 0.72) / Math.max(1, slotCount - 1);
  const slots = [];
  for (let index = 0; index < slotCount; index += 1) {
    const slot = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH * 0.56, 0.055),
      new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xf6c96d : 0x00f3ff,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    slot.name = "dockTraySlot";
    slot.userData.phase = index * 0.54;
    slot.rotation.x = -Math.PI / 2;
    slot.position.set((index - (slotCount - 1) / 2) * slotSpacing, 0.061, 0.08);
    root.add(slot);
    slots.push(slot);
  }

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.34, 0.24),
    new THREE.MeshBasicMaterial({
      map: createDropZoneLabelTexture({ label: "DOCK", subtitle: "SAVED TRAY" }),
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    })
  );
  label.name = "dockTrayLabel";
  label.rotation.x = -Math.PI / 2;
  label.position.set(-trayWidth / 2 + 0.74, 0.072, -0.19);
  root.add(label);

  const light = new THREE.PointLight(0x00f3ff, 1.1, 3.6);
  light.name = "dockTrayLight";
  light.position.set(0, 0.62, 0.14);
  root.add(light);

  root.userData.refs = { base, glow, field, label, light, slots };
  void resources;
  return root;
}

function createDropZone(resources, options = {}) {
  const position = options.position || DROP_ZONE_POSITION;
  const radius = options.radius || DROP_ZONE_RADIUS;
  const magnetRadius = options.magnetRadius || DROP_ZONE_MAGNET_RADIUS;
  const root = new THREE.Group();
  root.name = options.name || "tarotDropZone";
  root.position.copy(position);
  root.userData.baseY = position.y;
  root.userData.energy = 0;

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.02, 96),
    new THREE.MeshBasicMaterial({
      map: createDropZoneTexture(options),
      color: 0x9ffcff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  core.name = "dropZoneCore";
  core.rotation.x = -Math.PI / 2;
  root.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.08, 0.018, 10, 128),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(options.accent || "#00f3ff"),
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    })
  );
  ring.name = "dropZoneRing";
  ring.rotation.x = Math.PI / 2;
  root.add(ring);

  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(magnetRadius, 0.007, 8, 128),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(options.secondary || "#ff6df2"),
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  );
  outer.name = "dropZoneMagnetField";
  outer.rotation.x = Math.PI / 2;
  root.add(outer);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, 0.22),
    new THREE.MeshBasicMaterial({
      map: createDropZoneLabelTexture(options),
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    })
  );
  label.name = "dropZoneLabel";
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 0.022, -0.84);
  root.add(label);

  const light = new THREE.PointLight(new THREE.Color(options.accent || "#6ffcff"), 1.4, 3.4);
  light.name = "dropZoneLight";
  light.position.set(0, 0.52, 0);
  root.add(light);

  root.userData.refs = { core, ring, outer, label, light };
  void resources;
  return root;
}

function normalizeEchoDirectorProject(project = null) {
  const normalized = normalizeEchoDirectorProjectPayload(project);
  if (!normalized?.song_id) return null;
  return normalized;
}

function echoDirectorProjectKeyFor(project = null) {
  if (!project) return "";
  return [
    project.song_id,
    project.registry_track_id || project.audio_id || "",
    project.updated_at || project.provenance?.generatedAt || "",
    Array.isArray(project.timeline) ? project.timeline.length : 0,
    Array.isArray(project.visualizer_timeline) ? project.visualizer_timeline.length : 0,
    Array.isArray(project.timed_lyrics) ? project.timed_lyrics.length : 0
  ].join("|");
}

function echoDirectorProjectMatchesCard(project = null, card = {}) {
  if (!project?.song_id || !card) return false;
  const songId = echoDirectorSongIdForCard(card);
  if (songId && project.song_id === songId) return true;
  const registryIds = new Set([
    card.registryTrackId,
    card.audio?.registryTrackId,
    ...(card.songLinks || []).flatMap((song) => [
      song.registryId,
      song.registryTrackId,
      song.audio?.registryTrackId,
      song.audioId
    ])
  ].map((value) => String(value || "").trim()).filter(Boolean));
  return Boolean(
    registryIds.size &&
    [project.registry_track_id, project.audio_id].some((value) => registryIds.has(String(value || "").trim()))
  );
}

function mergeDropZoneSongWithEchoDirectorProject(song = null, project = null, card = {}) {
  if (!project) return song;
  const base = song || {};
  const audioId = project.audio_id || project.registry_track_id || "";
  const audioUri = resolveTarotPreviewUri(project.audio_uri || (audioId ? `/api/song-registry/audio/${encodeURIComponent(audioId)}` : ""));
  const timedLyrics = Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [];
  const lyricTiming = timedLyrics.length
    ? {
        source: "echos-director-project",
        trusted: true,
        duration: Number(project.duration || base.duration || 0),
        lines: timedLyrics
      }
    : base.lyricTiming || base.lyricTimings || null;
  return {
    ...base,
    id: base.id || project.song_id,
    songId: project.song_id || base.songId,
    cardId: base.cardId || card.sourceSongId || card.id || "",
    registryId: project.registry_track_id || project.audio_id || base.registryId || "",
    title: project.song_title || base.title || card.title || "Echo Album song",
    audioUri: audioUri || base.audioUri || "",
    coverUri: resolveTarotPreviewUri(project.cover_uri || base.coverUri || card.posterUri || ""),
    duration: Number(project.duration || base.duration || 0),
    lyricsText: timedLyrics.length ? timedLyrics.map((line) => line.text).filter(Boolean).join("\n") : base.lyricsText || "",
    lyricTiming,
    timedLyrics,
    echoDirectorProjectId: project.song_id,
    echoDirectorProjectTitle: project.song_title || "",
    echoDirectorTimelineCount: Array.isArray(project.timeline) ? project.timeline.length : 0,
    echoDirectorVisualizerCount: Array.isArray(project.visualizer_timeline) ? project.visualizer_timeline.length : 0,
    sourceLabel: "Echos Album preview"
  };
}

function echoDirectorTimelineSourceAtTime(project = null, clock = 0) {
  const timeline = Array.isArray(project?.timeline) ? project.timeline : [];
  const videoShots = timeline.filter((shot) => shot?.media_uri && shot.media_id !== "none");
  if (!videoShots.length) return null;
  const duration = Number(project.duration || 0);
  const safeClock = Number.isFinite(Number(clock)) ? Number(clock) : 0;
  const wrappedClock = duration > 0 ? safeClock % duration : safeClock;
  const shotIndex = timeline.findIndex((shot) => shot?.media_uri && wrappedClock >= Number(shot.start_sec || 0) && wrappedClock < Number(shot.end_sec || Infinity));
  const shot = shotIndex >= 0 ? timeline[shotIndex] : videoShots.find((item) => Number(item.start_sec || 0) >= wrappedClock) || videoShots[0];
  const resolvedShotIndex = Math.max(0, timeline.indexOf(shot));
  const visualizer = echoDirectorVisualizerAtTime(project, wrappedClock);
  const uri = resolveTarotPreviewUri(shot.media_uri);
  const seekOffset = Math.max(0, wrappedClock - Number(shot.start_sec || 0));
  const shotStart = Number(shot.start_sec || 0);
  const shotEnd = Number(shot.end_sec || shotStart + 1);
  return {
    id: `echo-director-${project.song_id}-${resolvedShotIndex}`,
    uri,
    originalUri: uri,
    sourceUri: `${uri}#echo-shot-${resolvedShotIndex}-${Number(shot.start_sec || 0).toFixed(2)}`,
    solidUri: uri,
    posterUri: shot.media_thumbnail ? resolveTarotPreviewUri(shot.media_thumbnail) : "",
    label: `${project.song_title || "Echo Album"} / ${shot.section_label || shot.media_title || "timeline shot"}`,
    score: 100000 + resolvedShotIndex,
    echoDirector: true,
    forcePreviewAspect: ECHO_DIRECTOR_EXPORT_ASPECT,
    echoProjectClock: wrappedClock,
    echoShotIndex: resolvedShotIndex,
    echoShotTitle: shot.media_title || "",
    echoSectionLabel: shot.section_label || "",
    echoShotStart: shotStart,
    echoShotEnd: shotEnd,
    echoShotDuration: Math.max(0.1, shotEnd - shotStart),
    echoVisualizerTitle: visualizer?.visualizer_title || "",
    echoTransition: shot.transition || "",
    echoCameraMotion: shot.camera_motion || "",
    echoCameraSpeed: Number(shot.camera_speed ?? shot.camera?.speed ?? 0) || undefined,
    echoCameraIntensity: Number(shot.camera_intensity ?? shot.camera?.intensity ?? 0) || undefined,
    echoIsVertical: echoDirectorShotLooksVertical(shot),
    echoLyricVariant: project.lyric_variant || "phrase-window",
    echoLyricPosition: project.lyric_position || "bottom-center",
    echoLyricStyle: project.lyric_style || "neon-cyan",
    seekOffset,
    hasAlpha: false,
    cutoutMode: "solid"
  };
}

function echoDirectorVisualizerAtTime(project = null, clock = 0) {
  const timeline = Array.isArray(project?.visualizer_timeline) ? project.visualizer_timeline : [];
  if (!timeline.length) return null;
  return timeline.find((item) => clock >= Number(item.start_sec || 0) && clock < Number(item.end_sec || Infinity)) || timeline[0] || null;
}

function echoDirectorShotLooksVertical(shot = {}) {
  const width = Number(shot.media_width || shot.video_width || shot.width || shot.dimensions?.width || 0);
  const height = Number(shot.media_height || shot.video_height || shot.height || shot.dimensions?.height || 0);
  if (width > 0 && height > 0) return height > width;
  const text = [
    shot.media_id,
    shot.media_title,
    shot.media_uri,
    shot.flowType,
    shot.aspect,
    ...(Array.isArray(shot.tags) ? shot.tags : []),
    ...(Array.isArray(shot.actions) ? shot.actions : []),
    ...(Array.isArray(shot.objects) ? shot.objects : [])
  ].filter(Boolean).join(" ").toLowerCase();
  return /vertical|portrait|portrait-framing|tarot|9:16|9x16|768\s*x\s*1168/.test(text);
}

function syncDropZoneScreenVideoToEchoSource(screen = null, source = null, shouldPlay = false) {
  const video = screen?.video;
  if (!video || !source?.echoDirector) return;
  applyEchoDirectorCameraMotionToScreen(screen, source);
  if (shouldPlay && video.paused) video.play().catch(() => {});
  if (!video.duration || video.readyState < 1) return;
  const target = Number(source.seekOffset || 0);
  if (!Number.isFinite(target)) return;
  const duration = Number(video.duration || 0);
  const wrappedTarget = duration > 0.8 ? Math.min(duration - 0.24, target % Math.max(0.8, duration - 0.24)) : target;
  if (Math.abs(Number(video.currentTime || 0) - wrappedTarget) > 0.42) {
    try {
      video.currentTime = Math.max(0, wrappedTarget);
    } catch {
      // Some media backends reject seeks while a newly swapped timeline shot is still decoding.
    }
  }
}

function ensureEchoDirectorPreviewOverlay(screen = null) {
  if (!screen?.rig || !screen?.mesh) return null;
  if (screen.echoOverlay?.mesh) return screen.echoOverlay;
  const canvas = document.createElement("canvas");
  canvas.width = ECHO_DIRECTOR_OVERLAY_WIDTH;
  canvas.height = ECHO_DIRECTOR_OVERLAY_HEIGHT;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const dimensions = dropPreviewDimensions(
    screen.mesh.userData.previewAspect || ECHO_DIRECTOR_EXPORT_ASPECT,
    screen.mesh.userData.previewScreenHeight || 1
  );
  const mesh = new THREE.Mesh(createAspectPlaneGeometry(dimensions.aspect, dimensions.height), material);
  mesh.name = "echoDirectorPreviewOverlay";
  mesh.position.copy(screen.mesh.position);
  mesh.position.z += 0.018;
  mesh.renderOrder = (screen.mesh.renderOrder || 0) + 5;
  mesh.frustumCulled = false;
  screen.rig.add(mesh);
  screen.echoOverlay = { canvas, ctx, texture, material, mesh };
  return screen.echoOverlay;
}

function resizeEchoDirectorOverlayForScreen(screen = null, dimensions = null) {
  const overlay = screen?.echoOverlay;
  if (!overlay?.mesh || !dimensions) return;
  const previous = overlay.mesh.geometry;
  overlay.mesh.geometry = createAspectPlaneGeometry(dimensions.aspect, dimensions.height);
  previous?.dispose?.();
  overlay.mesh.position.copy(screen.mesh.position);
  overlay.mesh.position.z += 0.018;
}

function clearEchoDirectorPreviewOverlay(screen = null) {
  const overlay = screen?.echoOverlay;
  if (!overlay) return;
  overlay.ctx?.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
  if (overlay.texture) overlay.texture.needsUpdate = true;
  if (overlay.mesh) overlay.mesh.visible = false;
  if (overlay.material) overlay.material.opacity = 0;
}

function clearEchoDirectorPreviewOverlays(preview = null) {
  (preview?.screens || []).forEach(clearEchoDirectorPreviewOverlay);
}

function disposeEchoDirectorPreviewOverlay(screen = null) {
  const overlay = screen?.echoOverlay;
  if (!overlay) return;
  if (overlay.mesh?.parent) overlay.mesh.parent.remove(overlay.mesh);
  overlay.texture?.dispose?.();
  overlay.material?.dispose?.();
  overlay.mesh?.geometry?.dispose?.();
  screen.echoOverlay = null;
}

function updateEchoDirectorPreviewOverlay(screen = null, source = null, {
  project = null,
  songSnapshot = {},
  elapsed = 0,
  bands = {},
  shadersEnabled = true,
  lyricsEnabled = true
} = {}) {
  if (!screen || !source?.echoDirector || (!shadersEnabled && !lyricsEnabled)) {
    clearEchoDirectorPreviewOverlay(screen);
    return;
  }
  const overlay = ensureEchoDirectorPreviewOverlay(screen);
  if (!overlay?.ctx) return;
  const { canvas, ctx } = overlay;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (shadersEnabled) drawEchoDirectorShaderOverlay(ctx, source, project, bands, elapsed, width, height);
  if (lyricsEnabled) drawEchoDirectorLyricOverlay(ctx, source, project, songSnapshot, width, height);
  overlay.texture.needsUpdate = true;
  overlay.mesh.visible = true;
  overlay.material.opacity = 0.98 * echoDirectorTransitionOpacityForSource(source);
}

function drawEchoDirectorShaderOverlay(ctx, source = {}, project = null, bands = {}, elapsed = 0, width = ECHO_DIRECTOR_OVERLAY_WIDTH, height = ECHO_DIRECTOR_OVERLAY_HEIGHT) {
  const title = source.echoVisualizerTitle || "";
  if (!title || /^none$/i.test(title)) return;
  const mode = echoDirectorShaderMode(title);
  const energy = THREE.MathUtils.clamp(Number(bands.energy ?? bands.rms ?? 0.18), 0.08, 1);
  const low = THREE.MathUtils.clamp(Number(bands.low ?? energy * 0.85), 0, 1);
  const mid = THREE.MathUtils.clamp(Number(bands.mid ?? energy * 0.72), 0, 1);
  const high = THREE.MathUtils.clamp(Number(bands.high ?? energy * 0.62), 0, 1);
  const hue = project?.perspective === "red" ? 348 : project?.perspective === "green" ? 154 : project?.perspective === "magenta" ? 302 : 188;
  const t = Number(elapsed || 0);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.34 + energy * 0.28;
  if (mode === "waveform-horizon") {
    for (let row = 0; row < 4; row += 1) {
      ctx.beginPath();
      const yBase = height * (0.38 + row * 0.09);
      for (let x = 0; x <= width; x += 10) {
        const y = yBase + Math.sin(x * 0.018 + t * (1.6 + row * 0.2)) * (18 + energy * 46) + Math.cos(x * 0.008 + t) * high * 30;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${hue + row * 18}, 96%, ${58 + row * 6}%, ${0.18 + energy * 0.22})`;
      ctx.lineWidth = 2 + row * 0.6;
      ctx.stroke();
    }
  } else if (mode === "beat-grid-pulse") {
    const grid = 42 - energy * 14;
    ctx.lineWidth = 1;
    for (let x = -grid; x < width + grid; x += grid) {
      ctx.strokeStyle = `hsla(${hue}, 100%, 58%, ${0.06 + low * 0.16})`;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(t + x) * 8, 0);
      ctx.lineTo(x - width * 0.04, height);
      ctx.stroke();
    }
    for (let y = -grid; y < height + grid; y += grid) {
      ctx.strokeStyle = `hsla(${hue + 84}, 100%, 62%, ${0.05 + mid * 0.14})`;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.cos(t + y) * 6);
      ctx.lineTo(width, y - height * 0.03);
      ctx.stroke();
    }
  } else if (mode === "particle-storm" || mode === "starfield-warp") {
    const count = mode === "starfield-warp" ? 72 : 54;
    for (let i = 0; i < count; i += 1) {
      const seed = i * 19.73;
      const angle = seed + t * (0.16 + high * 0.35);
      const radius = ((i * 37 + t * 120 * (0.4 + energy)) % (Math.max(width, height) * 0.72));
      const x = width / 2 + Math.cos(angle) * radius;
      const y = height / 2 + Math.sin(angle * 0.78) * radius * 0.56;
      const size = 1.2 + ((i % 7) * 0.35) + energy * 3;
      ctx.fillStyle = `hsla(${hue + i % 80}, 96%, 68%, ${0.12 + energy * 0.28})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mode === "cymatic-rings" || mode === "kaleido-bloom") {
    const rings = mode === "kaleido-bloom" ? 12 : 8;
    for (let i = 0; i < rings; i += 1) {
      const radius = 42 + i * 34 + Math.sin(t * 1.4 + i) * 14 + energy * 46;
      ctx.strokeStyle = `hsla(${hue + i * 24}, 100%, ${54 + i * 2}%, ${0.08 + energy * 0.12})`;
      ctx.lineWidth = 2 + (i % 3) + high * 5;
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, radius * (1 + mid * 0.3), radius * 0.58, Math.sin(t * 0.3 + i) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (mode === "matrix-rain" || mode === "ascii-art") {
    ctx.font = "700 18px monospace";
    for (let i = 0; i < 90; i += 1) {
      const x = (i * 73 + Math.sin(i) * 30) % width;
      const y = (i * 41 + t * (52 + energy * 96)) % (height + 40) - 20;
      const char = mode === "ascii-art" ? ["#", "/", "*", "+", "0", "1"][i % 6] : String((i + Math.floor(t * 7)) % 2);
      ctx.fillStyle = `hsla(${hue + 100}, 100%, 70%, ${0.06 + energy * 0.18})`;
      ctx.fillText(char, x, y);
    }
  } else {
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, 20, width * 0.5, height * 0.5, width * 0.72);
    gradient.addColorStop(0, `hsla(${hue}, 100%, 64%, ${0.18 + energy * 0.16})`);
    gradient.addColorStop(0.42, `hsla(${hue + 70}, 96%, 56%, ${0.08 + mid * 0.16})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      const y = height * (0.18 + i * 0.105);
      for (let x = 0; x <= width; x += 16) {
        const wave = Math.sin(x * 0.012 + t * (0.8 + i * 0.1)) * (14 + energy * 42);
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.strokeStyle = `hsla(${hue + i * 14}, 100%, 64%, ${0.08 + energy * 0.12})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function echoDirectorShaderMode(title = "") {
  const text = String(title || "").toLowerCase();
  if (text.includes("matrix") || text.includes("rain") || text.includes("code")) return "matrix-rain";
  if (text.includes("ascii") || text.includes("terminal") || text.includes("scanline") || text.includes("glitch")) return "ascii-art";
  if (text.includes("horizon") || text.includes("waveform") || text.includes("linescape") || text.includes("wave")) return "waveform-horizon";
  if (text.includes("grid") || text.includes("pulse") || text.includes("beat") || text.includes("cell") || text.includes("circuit")) return "beat-grid-pulse";
  if (text.includes("particle") || text.includes("storm") || text.includes("star") || text.includes("dust") || text.includes("flots")) return "particle-storm";
  if (text.includes("warp") || text.includes("hyperspace") || text.includes("tunnel") || text.includes("streak")) return "starfield-warp";
  if (text.includes("cymatic") || text.includes("ring") || text.includes("circle") || text.includes("orb") || text.includes("vortex")) return "cymatic-rings";
  if (text.includes("kaleido") || text.includes("bloom") || text.includes("flower") || text.includes("mandala") || text.includes("fractal")) return "kaleido-bloom";
  return "spectrum-nebula";
}

function drawEchoDirectorLyricOverlay(ctx, source = {}, project = null, songSnapshot = {}, width = ECHO_DIRECTOR_OVERLAY_WIDTH, height = ECHO_DIRECTOR_OVERLAY_HEIGHT) {
  const line = echoDirectorLyricLineForClock(project, songSnapshot, Number(source.echoProjectClock ?? songSnapshot.currentTime ?? 0));
  if (!line?.text) return;
  const theme = echoDirectorLyricTheme(project?.lyric_style || source.echoLyricStyle || "neon-cyan");
  const placement = echoDirectorLyricPlacement(project?.lyric_position || source.echoLyricPosition || "bottom-center", width, height);
  const variant = project?.lyric_variant || source.echoLyricVariant || "phrase-window";
  const tokens = Array.isArray(line.words) && line.words.length
    ? line.words.map((word) => ({
        text: word.word || word.text || "",
        active: Number(source.echoProjectClock || 0) >= Number(word.start || 0) && Number(source.echoProjectClock || 0) < Number(word.end || 0),
        completed: Number(source.echoProjectClock || 0) >= Number(word.end || 0)
      })).filter((word) => word.text)
    : String(line.text || "").split(/\s+/).filter(Boolean).map((text) => ({ text, active: true, completed: true }));
  if (!tokens.length) return;

  ctx.save();
  ctx.font = `${theme.weight} ${theme.fontSize}px ${theme.fontFamily}`;
  const rows = echoDirectorLyricRows(ctx, tokens, placement.maxWidth);
  const lineHeight = theme.fontSize * 1.32;
  const contentWidth = Math.min(placement.maxWidth, Math.max(...rows.map((row) => row.width), 160));
  const panelWidth = Math.min(placement.maxWidth + theme.paddingX * 2, contentWidth + theme.paddingX * 2);
  const panelHeight = rows.length * lineHeight + theme.paddingY * 2;
  const { left, top } = echoDirectorLyricPanelPosition(placement, panelWidth, panelHeight);

  ctx.globalAlpha = variant === "minimal-subtitle" ? 0.74 : 0.92;
  echoCanvasRoundRect(ctx, left, top, panelWidth, panelHeight, theme.radius);
  ctx.fillStyle = theme.panelBackground;
  ctx.fill();
  ctx.strokeStyle = theme.panelBorder;
  ctx.lineWidth = variant === "signal-karaoke" ? 3 : 1.5;
  ctx.stroke();

  if (variant === "scanline-ribbon") {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = theme.activeColor;
    for (let y = top + 4; y < top + panelHeight; y += 6) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + panelWidth, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  rows.forEach((row, rowIndex) => {
    let x = placement.align === "center"
      ? left + panelWidth / 2 - row.width / 2
      : placement.align === "right"
        ? left + panelWidth - theme.paddingX - row.width
        : left + theme.paddingX;
    const y = top + theme.paddingY + rowIndex * lineHeight + theme.fontSize;
    row.tokens.forEach((token) => {
      ctx.fillStyle = token.active ? theme.activeColor : token.completed ? theme.textColor : theme.inactiveColor;
      ctx.shadowColor = token.active ? theme.shadowColor : "transparent";
      ctx.shadowBlur = token.active ? theme.shadowBlur : 0;
      ctx.fillText(token.text, x, y);
      x += token.width + row.spaceWidth;
    });
  });
  ctx.restore();
}

function echoDirectorLyricLineForClock(project = null, songSnapshot = {}, clock = 0) {
  const sourceLines = Array.isArray(project?.timed_lyrics) && project.timed_lyrics.length
    ? project.timed_lyrics
    : Array.isArray(songSnapshot?.timedLyrics) && songSnapshot.timedLyrics.length
      ? songSnapshot.timedLyrics
      : Array.isArray(songSnapshot?.lyricTiming?.lines)
        ? songSnapshot.lyricTiming.lines
        : [];
  if (!sourceLines.length) return null;
  const duration = Number(project?.duration || songSnapshot.duration || sourceLines.at(-1)?.end || 0);
  const wrappedClock = duration > 0 ? clock % duration : clock;
  return sourceLines.find((line) => wrappedClock >= Number(line.start || 0) && wrappedClock < Number(line.end || Infinity)) ||
    sourceLines.findLast?.((line) => wrappedClock >= Number(line.start || 0)) ||
    sourceLines[0];
}

function echoDirectorLyricTheme(style = "neon-cyan") {
  const themes = {
    "neon-cyan": {
      panelBackground: "rgba(2, 6, 23, 0.72)",
      panelBorder: "rgba(6, 182, 212, 0.38)",
      textColor: "rgba(224, 250, 255, 0.92)",
      activeColor: "#20f7ff",
      inactiveColor: "rgba(224, 250, 255, 0.58)",
      shadowColor: "rgba(6, 182, 212, 0.8)",
      shadowBlur: 12,
      fontFamily: "monospace",
      fontSize: 30,
      weight: "800",
      paddingX: 26,
      paddingY: 16,
      radius: 9
    },
    "magenta-glow": {
      panelBackground: "rgba(24, 5, 34, 0.76)",
      panelBorder: "rgba(236, 72, 153, 0.42)",
      textColor: "rgba(255, 228, 242, 0.94)",
      activeColor: "#ff6df2",
      inactiveColor: "rgba(255, 228, 242, 0.58)",
      shadowColor: "rgba(236, 72, 153, 0.85)",
      shadowBlur: 14,
      fontFamily: "monospace",
      fontSize: 30,
      weight: "800",
      paddingX: 26,
      paddingY: 16,
      radius: 9
    },
    "gold-caption": {
      panelBackground: "rgba(31, 23, 7, 0.78)",
      panelBorder: "rgba(246, 201, 109, 0.44)",
      textColor: "rgba(255, 247, 220, 0.95)",
      activeColor: "#f6c96d",
      inactiveColor: "rgba(255, 247, 220, 0.62)",
      shadowColor: "rgba(246, 201, 109, 0.8)",
      shadowBlur: 12,
      fontFamily: "Georgia, serif",
      fontSize: 31,
      weight: "800",
      paddingX: 28,
      paddingY: 17,
      radius: 9
    },
    "paper-white": {
      panelBackground: "rgba(247, 244, 235, 0.9)",
      panelBorder: "rgba(255, 255, 255, 0.48)",
      textColor: "#101827",
      activeColor: "#020617",
      inactiveColor: "rgba(17, 24, 39, 0.62)",
      shadowColor: "transparent",
      shadowBlur: 0,
      fontFamily: "Georgia, serif",
      fontSize: 31,
      weight: "800",
      paddingX: 28,
      paddingY: 17,
      radius: 9
    },
    "minimal-subtitle": {
      panelBackground: "rgba(0, 0, 0, 0.68)",
      panelBorder: "rgba(255, 255, 255, 0.22)",
      textColor: "#ffffff",
      activeColor: "#ffffff",
      inactiveColor: "rgba(255, 255, 255, 0.72)",
      shadowColor: "rgba(0, 0, 0, 0.95)",
      shadowBlur: 8,
      fontFamily: "system-ui, sans-serif",
      fontSize: 28,
      weight: "800",
      paddingX: 24,
      paddingY: 14,
      radius: 8
    }
  };
  return themes[style] || themes["neon-cyan"];
}

function echoDirectorLyricPlacement(position = "bottom-center", width = ECHO_DIRECTOR_OVERLAY_WIDTH, height = ECHO_DIRECTOR_OVERLAY_HEIGHT) {
  const safeWidth = Math.min(width * 0.86, 780);
  const placements = {
    "bottom-center": { anchorX: width / 2, anchorY: height - 46, align: "center", valign: "bottom", maxWidth: safeWidth },
    "top-center": { anchorX: width / 2, anchorY: 42, align: "center", valign: "top", maxWidth: safeWidth },
    center: { anchorX: width / 2, anchorY: height / 2, align: "center", valign: "middle", maxWidth: safeWidth },
    "lower-left": { anchorX: 42, anchorY: height - 48, align: "left", valign: "bottom", maxWidth: width * 0.62 },
    "lower-right": { anchorX: width - 42, anchorY: height - 48, align: "right", valign: "bottom", maxWidth: width * 0.62 },
    "upper-left": { anchorX: 42, anchorY: 44, align: "left", valign: "top", maxWidth: width * 0.62 },
    "upper-right": { anchorX: width - 42, anchorY: 44, align: "right", valign: "top", maxWidth: width * 0.62 },
    "side-right": { anchorX: width - 42, anchorY: height / 2, align: "right", valign: "middle", maxWidth: width * 0.42 }
  };
  return placements[position] || placements["bottom-center"];
}

function echoDirectorLyricRows(ctx, tokens = [], maxWidth = 720) {
  const rows = [];
  let current = [];
  let width = 0;
  const spaceWidth = ctx.measureText(" ").width;
  tokens.forEach((token) => {
    const measured = ctx.measureText(token.text).width;
    const nextWidth = width + (current.length ? spaceWidth : 0) + measured;
    if (current.length && nextWidth > maxWidth) {
      rows.push({ tokens: current, width, spaceWidth });
      current = [];
      width = 0;
    }
    current.push({ ...token, width: measured });
    width += (current.length > 1 ? spaceWidth : 0) + measured;
  });
  if (current.length) rows.push({ tokens: current, width, spaceWidth });
  return rows.slice(-3);
}

function echoDirectorLyricPanelPosition(placement, panelWidth, panelHeight) {
  const left = placement.align === "center"
    ? placement.anchorX - panelWidth / 2
    : placement.align === "right"
      ? placement.anchorX - panelWidth
      : placement.anchorX;
  const top = placement.valign === "middle"
    ? placement.anchorY - panelHeight / 2
    : placement.valign === "bottom"
      ? placement.anchorY - panelHeight
      : placement.anchorY;
  return { left, top };
}

function echoCanvasRoundRect(ctx, x, y, width, height, radius = 8) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function resolveTarotPreviewUri(uri = "") {
  if (typeof uri !== "string" || !uri) return "";
  if (/^(data:|blob:|https?:|file:)/.test(uri)) return uri;
  try {
    return new URL(uri, window.location.origin).href;
  } catch {
    return uri;
  }
}

function pickDropZoneSong(card = {}) {
  const cardSongs = (card.songLinks || [])
    .map((song) => ({
      ...song,
      id: song.id || song.songLinkId || song.songCardId || song.cardId || song.songId,
      cardId: song.cardId || song.songCardId || "",
      title: song.title || song.songTitle || "Card song",
      audioUri: song.audioUri || song.audioUrl || song.mp3Uri || song.wavUri || song.audio?.mp3Uri || song.audio?.wavUri || "",
      sourceRank: 2
    }))
    .filter((song) => song?.title);
  const contactSongs = (card.avatarContacts || [])
    .flatMap((contact) => (contact?.songs || []).map((song) => ({
      ...song,
      avatarName: contact.name,
      avatarId: contact.id,
      avatarRole: contact.role,
      audioUri: song.audioUri || song.audioUrl || song.mp3Uri || song.wavUri || song.audio?.mp3Uri || song.audio?.wavUri || "",
      sourceRank: 1
    })))
    .filter((song) => song?.title);
  const songs = uniqueDropZoneSongs([...cardSongs, ...contactSongs]);
  if (!songs.length) return null;
  const directCardSongs = songs.filter((song) => Number(song.sourceRank || 0) >= 2);
  const directPlayableSongs = directCardSongs.filter((song) => dropZoneSongHasPlayableAudio(song));
  const directPlayableSongsWithLyrics = directPlayableSongs.filter((song) => dropZoneSongHasLyrics(song));
  const directCardSongsWithLyrics = directCardSongs.filter((song) => dropZoneSongHasLyrics(song));
  const withLyrics = songs.filter((song) => dropZoneSongHasLyrics(song));
  const playable = songs.filter((song) => dropZoneSongHasPlayableAudio(song));
  const playableWithLyrics = playable.filter((song) => dropZoneSongHasLyrics(song));
  const source = directPlayableSongsWithLyrics.length
    ? directPlayableSongsWithLyrics
    : directPlayableSongs.length
      ? directPlayableSongs
      : playableWithLyrics.length
        ? playableWithLyrics
        : playable.length
          ? playable
          : directCardSongsWithLyrics.length
            ? directCardSongsWithLyrics
            : directCardSongs.length
              ? directCardSongs
              : withLyrics.length
                ? withLyrics
                : songs;
  const seed = String(card.id || card.title || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return source[seed % source.length] || null;
}

function uniqueDropZoneSongs(songs = []) {
  const byKey = new Map();
  songs.forEach((song) => {
    const key = song.cardId || song.songCardId || song.songId || song.id || song.title;
    if (!key) return;
    const current = byKey.get(key);
    if (!current || dropZoneSongQualityScore(song) > dropZoneSongQualityScore(current)) {
      byKey.set(key, song);
    }
  });
  return [...byKey.values()];
}

function dropZoneSongHasLyrics(song = {}) {
  const text = lyricCrawlTextForSong(song);
  return Boolean(text && !/^lyrics are not attached/i.test(text));
}

function dropZoneSongHasPlayableAudio(song = {}) {
  return Boolean(song.audioUri || song.audioUrl || song.mp3Uri || song.wavUri || song.audio?.mp3Uri || song.audio?.wavUri);
}

function dropZoneSongQualityScore(song = {}) {
  return Number(dropZoneSongHasPlayableAudio(song)) * 100 +
    Number(dropZoneSongHasLyrics(song)) * 40 +
    Math.min(9, Number(song.sourceRank || 0)) * 4 +
    Number(Boolean(song.coverUri || song.imageUri || song.posterUri));
}

function createAspectPlaneGeometry(aspect = DROP_PREVIEW_SCREEN_ASPECT, height = 1) {
  const safeAspect = THREE.MathUtils.clamp(Number(aspect) || DROP_PREVIEW_SCREEN_ASPECT, 0.18, 3.2);
  return new THREE.PlaneGeometry(height * safeAspect, height);
}

function dropPreviewDimensions(aspect = DROP_PREVIEW_SCREEN_ASPECT, height = 1) {
  const safeAspect = THREE.MathUtils.clamp(Number(aspect) || DROP_PREVIEW_SCREEN_ASPECT, 0.18, 3.2);
  return {
    aspect: safeAspect,
    width: height * safeAspect,
    height
  };
}

function resizeDropZonePreviewScreen(mesh, aspect) {
  const safeAspect = THREE.MathUtils.clamp(Number(aspect) || DROP_PREVIEW_SCREEN_ASPECT, 0.18, 3.2);
  if (!mesh?.userData?.previewScreenHeight) return;
  const previous = mesh.geometry;
  mesh.geometry = createAspectPlaneGeometry(safeAspect, mesh.userData.previewScreenHeight);
  previous?.dispose?.();
  const dimensions = dropPreviewDimensions(safeAspect, mesh.userData.previewScreenHeight);
  mesh.userData.previewScreenWidth = dimensions.width;
  mesh.userData.previewAspect = dimensions.aspect;
  updateDropZonePreviewCardGeometry(mesh.userData.previewRig, dimensions);
  resizeEchoDirectorOverlayForScreen(mesh.userData.previewScreenRef, dimensions);
}

function dropZoneVideoSourceKey(source = {}) {
  return source?.sourceUri || source?.originalUri || source?.uri || source?.videoUri || source?.id || "";
}

function dropZonePreviewAspectForSource(source = {}, fallbackAspect = DROP_PREVIEW_SCREEN_ASPECT) {
  if (source?.echoDirector) return ECHO_DIRECTOR_EXPORT_ASPECT;
  const forced = Number(source?.forcePreviewAspect || source?.previewAspect || 0);
  if (Number.isFinite(forced) && forced > 0) return forced;
  return fallbackAspect;
}

function resetDropZoneVideoTextureTransform(texture) {
  if (!texture) return;
  texture.offset.set(0, 0);
  texture.repeat.set(1, 1);
  texture.center.set(0, 0);
  texture.needsUpdate = true;
}

function applyEchoDirectorCameraMotionToScreen(screen = null, source = null) {
  if (!screen?.texture || !screen?.video || !source?.echoDirector) {
    if (screen?.mesh?.userData) screen.mesh.userData.echoPreviewOpacity = 1;
    return;
  }
  const video = screen.video;
  const videoAspect = video.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : source.echoIsVertical
      ? 9 / 16
      : ECHO_DIRECTOR_EXPORT_ASPECT;
  const frameAspect = ECHO_DIRECTOR_EXPORT_ASPECT;
  const state = echoDirectorCameraMotionStateForSource(source, videoAspect);
  const cover = echoDirectorCoverTextureWindow(videoAspect, frameAspect, state);
  screen.texture.wrapS = THREE.ClampToEdgeWrapping;
  screen.texture.wrapT = THREE.ClampToEdgeWrapping;
  screen.texture.repeat.set(cover.repeatX, cover.repeatY);
  screen.texture.offset.set(cover.offsetX, cover.offsetY);
  screen.texture.needsUpdate = true;
  if (screen.mesh?.userData) screen.mesh.userData.echoPreviewOpacity = echoDirectorTransitionOpacityForSource(source);
}

function echoDirectorCoverTextureWindow(videoAspect = ECHO_DIRECTOR_EXPORT_ASPECT, frameAspect = ECHO_DIRECTOR_EXPORT_ASPECT, state = {}) {
  const safeVideoAspect = THREE.MathUtils.clamp(Number(videoAspect) || frameAspect, 0.12, 8);
  const safeFrameAspect = THREE.MathUtils.clamp(Number(frameAspect) || ECHO_DIRECTOR_EXPORT_ASPECT, 0.12, 8);
  let repeatX = 1;
  let repeatY = 1;
  if (safeVideoAspect > safeFrameAspect) {
    repeatX = safeFrameAspect / safeVideoAspect;
  } else {
    repeatY = safeVideoAspect / safeFrameAspect;
  }
  const zoom = THREE.MathUtils.clamp(Number(state.scale || 1), 1, 2.65);
  repeatX = THREE.MathUtils.clamp(repeatX / zoom, 0.035, 1);
  repeatY = THREE.MathUtils.clamp(repeatY / zoom, 0.035, 1);
  const objectX = THREE.MathUtils.clamp(Number(state.objectX ?? 50), 0, 100) / 100;
  const objectY = THREE.MathUtils.clamp(Number(state.objectY ?? 50), 0, 100) / 100;
  return {
    repeatX,
    repeatY,
    offsetX: (1 - repeatX) * objectX,
    offsetY: (1 - repeatY) * (1 - objectY)
  };
}

function echoDirectorCameraMotionStateForSource(source = {}, videoAspect = ECHO_DIRECTOR_EXPORT_ASPECT) {
  const shotIndex = Math.max(0, Number(source.echoShotIndex || 0));
  const duration = Math.max(0.1, Number(source.echoShotDuration || 0) || Number(source.duration || 0) || 1);
  const rawProgress = THREE.MathUtils.clamp(Number(source.seekOffset || 0) / duration, 0, 1);
  const fallbackSpeed = 1.15 + ((shotIndex * 17 + String(source.echoSectionLabel || source.echoShotTitle || "").length) % 7) * 0.13;
  const speed = THREE.MathUtils.clamp(Number(source.echoCameraSpeed ?? fallbackSpeed), 0.75, 2.4);
  const pacedProgress = THREE.MathUtils.clamp(Math.pow(rawProgress, 1 / speed), 0, 1);
  const progress = pacedProgress * pacedProgress * (3 - 2 * pacedProgress);
  const intensity = THREE.MathUtils.clamp(Number(source.echoCameraIntensity ?? 1), 0, 2);
  const declaredMotion = source.echoCameraMotion || "auto";
  const normalizedMotion = declaredMotion === "tilt-up"
    ? "pan-up"
    : declaredMotion === "tilt-down"
      ? "pan-down"
      : declaredMotion;
  const isVertical = Boolean(source.echoIsVertical || videoAspect < 0.9);
  const autoMotion = isVertical
    ? ["pan-down", "pan-up", "pan-down-left", "pan-up-right", "pan-down", "pan-up-left"][shotIndex % 6]
    : ["pan-down", "pan-up", "pan-up-left", "pan-down-right", "slow-push-in", "pan-up-right", "pan-down-left", "drift-diagonal"][shotIndex % 8];
  const motion = normalizedMotion === "auto" ? autoMotion : normalizedMotion;
  const baseScale = isVertical ? 1.34 : 1.18;
  const positionSpan = Math.min(42, (isVertical ? 30 : 22) * intensity * Math.min(1.35, speed));
  let scale = baseScale;
  let objectX = 50;
  let objectY = 50;

  const setDirectionalPan = (xDirection, yDirection) => {
    const phase = progress * 2 - 1;
    if (xDirection) objectX = 50 + xDirection * positionSpan * phase;
    if (yDirection) objectY = 50 + yDirection * positionSpan * phase;
    scale = baseScale + (xDirection && yDirection ? 0.05 : 0) + 0.04 * intensity;
  };

  if (motion === "static") {
    scale = isVertical ? 1.18 : 1;
  } else if (motion === "slow-push-in") {
    scale = baseScale + 0.16 * intensity * progress * speed;
  } else if (motion === "slow-pull-out") {
    scale = baseScale + 0.16 * intensity * (1 - progress) * speed;
  } else if (motion === "pan-left") {
    setDirectionalPan(-1, 0);
  } else if (motion === "pan-right") {
    setDirectionalPan(1, 0);
  } else if (motion === "pan-up") {
    setDirectionalPan(0, -1);
  } else if (motion === "pan-down") {
    setDirectionalPan(0, 1);
  } else if (motion === "pan-up-left") {
    setDirectionalPan(-1, -1);
  } else if (motion === "pan-up-right") {
    setDirectionalPan(1, -1);
  } else if (motion === "pan-down-left") {
    setDirectionalPan(-1, 1);
  } else if (motion === "pan-down-right") {
    setDirectionalPan(1, 1);
  } else if (motion === "drift-diagonal") {
    setDirectionalPan(1, -1);
    scale = baseScale + 0.07 * intensity;
  } else if (motion === "handheld-float") {
    objectX = 50 + Math.sin(rawProgress * Math.PI * 4) * 9 * intensity * speed;
    objectY = 50 + Math.cos(rawProgress * Math.PI * 3) * 7 * intensity * speed;
    scale = baseScale + 0.025 * intensity;
  }

  return {
    motion,
    scale,
    objectX: THREE.MathUtils.clamp(objectX, 0, 100),
    objectY: THREE.MathUtils.clamp(objectY, 0, 100)
  };
}

function echoDirectorTransitionOpacityForSource(source = {}) {
  const transition = String(source.echoTransition || "cut").toLowerCase();
  if (!["fade-in", "fade-out", "crossfade", "scanline-dissolve"].includes(transition)) return 1;
  const elapsed = Math.max(0, Number(source.seekOffset || 0));
  const duration = Math.max(0.1, Number(source.echoShotDuration || 0) || 1);
  const remaining = Math.max(0, duration - elapsed);
  let opacity = 1;
  if ((transition === "fade-in" || transition === "crossfade" || transition === "scanline-dissolve") && elapsed < 0.5) {
    opacity = Math.min(opacity, elapsed / 0.5);
  }
  if ((transition === "fade-out" || transition === "crossfade" || transition === "scanline-dissolve") && remaining < 0.5) {
    opacity = Math.min(opacity, remaining / 0.5);
  }
  return THREE.MathUtils.clamp(Math.max(opacity, 0.22), 0, 1);
}

function videoSourceHasAlpha(source = {}) {
  return Boolean(
    source?.hasAlpha ||
    source?.cutoutMode === "backgroundless" ||
    source?.usesBackgroundlessVideo === true
  );
}

function isLiveCameraVideoSource(source = {}) {
  return Boolean(source?.liveCamera || source?.liveStream || source?.liveVideo?.srcObject);
}

function liveCameraStreamForSource(source = {}) {
  return source?.liveStream || source?.stream || source?.liveVideo?.srcObject || null;
}

function readyBackgroundlessUriForSource(source = {}) {
  const backgroundless = source?.backgroundless || source?.videoBackgroundless || null;
  const uri = source?.backgroundlessUri || backgroundless?.uri || backgroundless?.playbackUri || "";
  if (!uri || backgroundless?.ready === false || backgroundless?.hasAlpha === false) return "";
  return uri;
}

function preferBackgroundlessPreviewSource(source = {}) {
  const backgroundlessUri = readyBackgroundlessUriForSource(source);
  if (!backgroundlessUri) return source;
  const solidUri = source.solidUri || source.uri || source.originalUri || source.sourceUri || "";
  return {
    ...source,
    uri: backgroundlessUri,
    solidUri,
    originalUri: source.originalUri || solidUri,
    sourceUri: source.sourceUri || source.originalUri || solidUri,
    hasAlpha: true,
    cutoutMode: "backgroundless",
    usesBackgroundlessVideo: true
  };
}

function prioritizeMiddlePreviewSources(sources = []) {
  return [...sources].sort((a, b) =>
    Number(Boolean(readyBackgroundlessUriForSource(b))) - Number(Boolean(readyBackgroundlessUriForSource(a))) ||
    Number(b.score || 0) - Number(a.score || 0) ||
    String(a.label || "").localeCompare(String(b.label || ""))
  );
}

function solidVideoUriForSource(source = {}) {
  const primaryUri = source.uri || source.videoUri || "";
  const readyBackgroundlessUri = readyBackgroundlessUriForSource(source);
  const isMarkedBackgroundless =
    source.hasAlpha === true ||
    source.usesBackgroundlessVideo === true ||
    source.cutoutMode === "backgroundless";
  const backgroundlessUri = readyBackgroundlessUri || (isMarkedBackgroundless ? primaryUri : "");
  const explicitSolidUri = [source.solidUri, source.originalUri, source.sourceUri, source.videoUri]
    .find((uri) => uri && uri !== backgroundlessUri) || "";
  const isBackgroundlessOnly =
    isMarkedBackgroundless ||
    (backgroundlessUri && primaryUri === backgroundlessUri);
  if (explicitSolidUri) return explicitSolidUri;
  if (isBackgroundlessOnly) return "";
  return primaryUri;
}

function uniqueDropZoneVideoSources(sources = [], fallbackPosterUri = "", { allowBackgroundless = false } = {}) {
  const seen = new Set();
  return sources
    .filter((source) => source?.uri)
    .map((source) => {
      const primarySourceUri = source.uri || source.videoUri || "";
      const readyBackgroundlessSourceUri = readyBackgroundlessUriForSource(source);
      const backgroundlessSourceUri = readyBackgroundlessSourceUri ||
        (source.hasAlpha === true || source.usesBackgroundlessVideo === true || source.cutoutMode === "backgroundless" ? primarySourceUri : "");
      const solidUri = solidVideoUriForSource(source);
      const uri = allowBackgroundless ? source.uri : solidUri;
      const isBackgroundlessOnly =
        source.hasAlpha === true ||
        source.usesBackgroundlessVideo === true ||
        source.cutoutMode === "backgroundless" ||
        (backgroundlessSourceUri && primarySourceUri === backgroundlessSourceUri);
      if (!allowBackgroundless && isBackgroundlessOnly && !solidUri) return null;
      const backgroundless = allowBackgroundless ? source.backgroundless || source.videoBackgroundless || null : null;
      const backgroundlessUri = allowBackgroundless
        ? source.backgroundlessUri || source.backgroundless?.uri || source.videoBackgroundless?.uri || ""
        : "";
      const hasAlpha = allowBackgroundless && videoSourceHasAlpha(source);
      return {
        ...source,
        id: source.id || uri,
        uri,
        originalUri: source.originalUri || source.sourceUri || solidUri || uri,
        sourceUri: source.sourceUri || source.originalUri || solidUri || uri,
        solidUri: solidUri || uri,
        backgroundlessUri,
        posterUri: source.posterUri || fallbackPosterUri || "",
        label: source.label || source.title || "Video loop",
        score: Number(source.score || 0),
        backgroundless,
        hasAlpha,
        usesBackgroundlessVideo: allowBackgroundless && source.usesBackgroundlessVideo === true,
        cutoutMode: hasAlpha ? "backgroundless" : allowBackgroundless ? source.cutoutMode || "edge-matte" : "solid"
      };
    })
    .filter(Boolean)
    .filter((source) => {
      const key = dropZoneVideoSourceKey(source);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function dropZoneVideoSources(card = {}, { preferBackgroundless = false, allowBackgroundless = preferBackgroundless } = {}) {
  const sources = uniqueDropZoneVideoSources([
    ...(Array.isArray(card.videoSources) ? card.videoSources : []),
    card.videoUri ? {
      id: `${card.id || card.title || "card"}-primary-video`,
      uri: card.videoUri,
      originalUri: card.originalVideoUri || card.sourceUri || card.videoUri,
      sourceUri: card.sourceUri || card.originalVideoUri || card.videoUri,
      solidUri: card.solidUri || card.originalVideoUri || card.sourceUri || card.videoUri,
      backgroundlessUri: card.backgroundlessUri || card.backgroundless?.uri || card.videoBackgroundless?.uri || "",
      posterUri: card.posterUri,
      label: card.title || "Card loop",
      backgroundless: card.backgroundless || card.videoBackgroundless || null,
      hasAlpha: Boolean(card.hasAlpha),
      cutoutMode: card.hasAlpha ? "backgroundless" : "solid"
    } : null
  ], card.posterUri || "", { allowBackgroundless });
  return preferBackgroundless && allowBackgroundless
    ? prioritizeMiddlePreviewSources(sources).map(preferBackgroundlessPreviewSource)
    : sources;
}

function createDropZoneMediaPool(sources = [], options = {}) {
  const pool = {
    sources: [],
    queue: [],
    cursor: 0,
    cycles: 0,
    version: 0
  };
  setDropZoneMediaPoolSources(pool, sources, options);
  return pool;
}

function setDropZoneMediaPoolSources(pool, sources = [], options = {}) {
  if (!pool) return null;
  const nextSources = uniqueDropZoneVideoSources(sources, "", options);
  const nextKeys = nextSources.map(dropZoneVideoSourceKey).join("|");
  const currentKeys = (pool.sources || []).map(dropZoneVideoSourceKey).join("|");
  pool.sources = nextSources;
  if (nextKeys !== currentKeys) {
    const allowed = new Set(nextSources.map(dropZoneVideoSourceKey));
    pool.queue = (pool.queue || []).filter((source) => allowed.has(dropZoneVideoSourceKey(source)));
    pool.cursor = nextSources.length ? Math.floor(Math.random() * nextSources.length) : 0;
    pool.version += 1;
  }
  ensureDropZoneMediaQueue(pool);
  return pool;
}

function ensureDropZoneMediaQueue(pool, minSize = DROP_PREVIEW_QUEUE_MIN) {
  if (!pool?.sources?.length) return [];
  const targetSize = Math.min(
    Math.max(DROP_PREVIEW_BUFFER_SIZE, minSize),
    Math.max(DROP_PREVIEW_BUFFER_SIZE, pool.sources.length)
  );
  while (pool.queue.length < targetSize) {
    const index = pool.cursor % pool.sources.length;
    const source = pool.sources[index];
    pool.cursor = (pool.cursor + 1) % pool.sources.length;
    if (pool.cursor === 0) pool.cycles += 1;
    pool.queue.push({
      ...source,
      queueToken: `${pool.version}:${pool.cycles}:${index}:${dropZoneVideoSourceKey(source)}`
    });
  }
  return pool.queue;
}

function nextDropZoneMediaSource(pool, fallbackIndex = 0) {
  if (!pool?.sources?.length) return null;
  ensureDropZoneMediaQueue(pool);
  return pool.queue.shift() || pool.sources[fallbackIndex % pool.sources.length] || null;
}

function peekDropZoneMediaSources(pool, count = DROP_PREVIEW_BUFFER_SIZE) {
  if (!pool?.sources?.length) return [];
  ensureDropZoneMediaQueue(pool, DROP_PREVIEW_QUEUE_MIN);
  return pool.queue.slice(0, count);
}

function primeDropZonePreviewBuffer(preview) {
  if (!preview?.pool) return;
  if (!preview.bufferVideos) preview.bufferVideos = Array.from({ length: DROP_PREVIEW_BUFFER_SIZE }, () => createDropZoneVideoElement());
  const sources = peekDropZoneMediaSources(preview.pool, DROP_PREVIEW_BUFFER_SIZE);
  preview.bufferVideos.forEach((video, index) => {
    const source = sources[index];
    const key = dropZoneVideoSourceKey(source);
    if (!source?.uri || video.dataset.sourceKey === key) return;
    video.pause();
    video.dataset.sourceKey = key;
    if (source.posterUri) video.poster = source.posterUri;
    else video.removeAttribute("poster");
    video.src = source.uri;
    video.preload = "metadata";
    video.load();
  });
}

function createDropZoneVideoElement() {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  return video;
}

let videoMaskFallbackTextureInstance = null;

function videoMaskFallbackTexture() {
  if (videoMaskFallbackTextureInstance) return videoMaskFallbackTextureInstance;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1, 1);
  videoMaskFallbackTextureInstance = new THREE.CanvasTexture(canvas);
  videoMaskFallbackTextureInstance.minFilter = THREE.LinearFilter;
  videoMaskFallbackTextureInstance.magFilter = THREE.LinearFilter;
  videoMaskFallbackTextureInstance.generateMipmaps = false;
  return videoMaskFallbackTextureInstance;
}

function makeVideoBackgroundKeyable(material, { enabled = false, threshold = 0.86, softness = 0.12, sourceHasAlpha = false } = {}) {
  const requestedEnabled = Boolean(enabled);
  const effectiveEnabled = requestedEnabled && !sourceHasAlpha;
  const keyState = {
    requestedEnabled,
    enabled: effectiveEnabled,
    sourceHasAlpha: Boolean(sourceHasAlpha),
    threshold,
    softness,
    maskReady: false,
    maskTexture: videoMaskFallbackTexture(),
    uniforms: null,
    originalDepthWrite: material.depthWrite,
    originalTransparent: material.transparent
  };
  material.userData.hapaVideoBackgroundKey = keyState;
  material.transparent = keyState.originalTransparent || keyState.enabled || keyState.sourceHasAlpha;
  material.depthWrite = keyState.enabled || keyState.sourceHasAlpha ? false : keyState.originalDepthWrite;
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer);
    shader.uniforms.uHapaVideoKeyStrength = { value: keyState.enabled ? 1 : 0 };
    shader.uniforms.uHapaVideoKeyThreshold = { value: keyState.threshold };
    shader.uniforms.uHapaVideoKeySoftness = { value: keyState.softness };
    shader.uniforms.uHapaVideoMaskStrength = { value: keyState.enabled && keyState.maskReady ? 1 : 0 };
    shader.uniforms.uHapaVideoMask = { value: keyState.maskTexture || videoMaskFallbackTexture() };
    keyState.uniforms = shader.uniforms;
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `uniform float uHapaVideoKeyStrength;
uniform float uHapaVideoKeyThreshold;
uniform float uHapaVideoKeySoftness;
uniform float uHapaVideoMaskStrength;
uniform sampler2D uHapaVideoMask;

void main() {`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
        float hapaEdgeMaskAlpha = texture2D(uHapaVideoMask, vMapUv).r;
        float hapaMatteAlpha = mix(1.0, hapaEdgeMaskAlpha, uHapaVideoMaskStrength);
        diffuseColor.a *= mix(1.0, hapaMatteAlpha, uHapaVideoKeyStrength);
        if (uHapaVideoKeyStrength > 0.5 && diffuseColor.a < 0.018) discard;`
    );
  };
  material.customProgramCacheKey = () => "hapa-video-edge-matte-key-v2";
  return material;
}

function setVideoBackgroundKeyOnMaterial(material, enabled) {
  const keyState = material?.userData?.hapaVideoBackgroundKey;
  if (!keyState) return false;
  keyState.requestedEnabled = Boolean(enabled);
  keyState.enabled = keyState.requestedEnabled && !keyState.sourceHasAlpha;
  material.transparent = keyState.originalTransparent || keyState.enabled || keyState.sourceHasAlpha;
  material.depthWrite = keyState.enabled || keyState.sourceHasAlpha ? false : keyState.originalDepthWrite;
  if (keyState.uniforms?.uHapaVideoKeyStrength) {
    keyState.uniforms.uHapaVideoKeyStrength.value = keyState.enabled ? 1 : 0;
  }
  if (keyState.uniforms?.uHapaVideoMaskStrength) {
    keyState.uniforms.uHapaVideoMaskStrength.value = keyState.enabled && keyState.maskReady ? 1 : 0;
  }
  material.needsUpdate = true;
  return true;
}

function setVideoMaterialSourceAlpha(material, sourceOrAlpha) {
  const keyState = material?.userData?.hapaVideoBackgroundKey;
  const hasAlpha = typeof sourceOrAlpha === "boolean" ? sourceOrAlpha : videoSourceHasAlpha(sourceOrAlpha);
  if (!keyState) {
    if (material && hasAlpha) {
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
    return false;
  }
  keyState.sourceHasAlpha = Boolean(hasAlpha);
  return setVideoBackgroundKeyOnMaterial(material, keyState.requestedEnabled);
}

function applyVideoBackgroundKeying(root, enabled) {
  root?.traverse?.((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material].filter(Boolean);
    materials.forEach((material) => {
      if (material?.userData?.hapaSolidCardFaceVideo) return;
      setVideoBackgroundKeyOnMaterial(material, enabled);
    });
  });
}

function createVideoEdgeMatte(video, material) {
  const keyState = material?.userData?.hapaVideoBackgroundKey;
  if (!video || !keyState) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  keyState.maskTexture = texture;
  if (keyState.uniforms?.uHapaVideoMask) keyState.uniforms.uHapaVideoMask.value = texture;
  return {
    video,
    material,
    keyState,
    canvas,
    ctx,
    texture,
    lastUpdate: -Infinity,
    failed: false
  };
}

function updateVideoEdgeMatte(matte, elapsed, enabled) {
  if (!matte?.video || !matte?.keyState) return;
  const { video, keyState } = matte;
  if (!enabled) {
    keyState.maskReady = false;
    if (keyState.uniforms?.uHapaVideoMaskStrength) keyState.uniforms.uHapaVideoMaskStrength.value = 0;
    return;
  }
  if (matte.failed || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    keyState.maskReady = false;
    if (keyState.uniforms?.uHapaVideoMaskStrength) keyState.uniforms.uHapaVideoMaskStrength.value = 0;
    return;
  }
  if (elapsed - matte.lastUpdate < VIDEO_EDGE_MATTE_UPDATE_SECONDS && keyState.maskReady) return;
  matte.lastUpdate = elapsed;
  const scale = VIDEO_EDGE_MATTE_MAX_SIZE / Math.max(video.videoWidth, video.videoHeight);
  const width = Math.max(24, Math.round(video.videoWidth * Math.min(1, scale)));
  const height = Math.max(24, Math.round(video.videoHeight * Math.min(1, scale)));
  if (matte.canvas.width !== width || matte.canvas.height !== height) {
    matte.canvas.width = width;
    matte.canvas.height = height;
  }
  try {
    matte.ctx.drawImage(video, 0, 0, width, height);
    const frame = matte.ctx.getImageData(0, 0, width, height);
    const mask = createEdgeFloodMatte(frame, width, height);
    matte.ctx.putImageData(mask, 0, 0);
    matte.texture.needsUpdate = true;
    keyState.maskReady = true;
    if (keyState.uniforms?.uHapaVideoMask) keyState.uniforms.uHapaVideoMask.value = matte.texture;
    if (keyState.uniforms?.uHapaVideoMaskStrength) keyState.uniforms.uHapaVideoMaskStrength.value = keyState.enabled ? 1 : 0;
  } catch {
    matte.failed = true;
    keyState.maskReady = false;
    if (keyState.uniforms?.uHapaVideoMaskStrength) keyState.uniforms.uHapaVideoMaskStrength.value = 0;
  }
}

function disposeVideoEdgeMatte(matte) {
  matte?.texture?.dispose?.();
}

function createEdgeFloodMatte(frame, width, height) {
  const data = frame.data;
  const refs = edgeMatteReferenceColors(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index] || !edgeMattePixelIsBackground(data, index * 4, refs)) return;
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const rawAlpha = new Uint8Array(width * height);
  for (let i = 0; i < rawAlpha.length; i += 1) rawAlpha[i] = visited[i] ? 0 : 255;
  const output = new ImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let samples = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + ox));
          const sy = Math.max(0, Math.min(height - 1, y + oy));
          total += rawAlpha[sy * width + sx];
          samples += 1;
        }
      }
      const alpha = Math.round(total / samples);
      const offset = (y * width + x) * 4;
      output.data[offset] = alpha;
      output.data[offset + 1] = alpha;
      output.data[offset + 2] = alpha;
      output.data[offset + 3] = 255;
    }
  }
  return output;
}

function edgeMatteReferenceColors(data, width, height) {
  const patch = Math.max(3, Math.min(9, Math.floor(Math.min(width, height) * 0.08)));
  const anchors = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
    [Math.floor((width - patch) / 2), 0],
    [Math.floor((width - patch) / 2), height - patch],
    [0, Math.floor((height - patch) / 2)],
    [width - patch, Math.floor((height - patch) / 2)]
  ];
  return anchors.map(([x, y]) => averageFramePatch(data, width, height, x, y, patch));
}

function averageFramePatch(data, width, height, startX, startY, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = startY; y < Math.min(height, startY + size); y += 1) {
    for (let x = startX; x < Math.min(width, startX + size); x += 1) {
      const offset = (y * width + x) * 4;
      r += data[offset];
      g += data[offset + 1];
      b += data[offset + 2];
      count += 1;
    }
  }
  return count ? [r / count, g / count, b / count] : [245, 245, 238];
}

function edgeMattePixelIsBackground(data, offset, refs) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const a = data[offset + 3];
  if (a < 220) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  const saturation = max > 0 ? (max - min) / max : 0;
  let bestDistance = Infinity;
  for (const ref of refs) {
    const dr = r - ref[0];
    const dg = g - ref[1];
    const db = b - ref[2];
    bestDistance = Math.min(bestDistance, Math.sqrt(dr * dr + dg * dg + db * db));
  }
  const broadCream = brightness > 158 && saturation < 0.3 && bestDistance < 92;
  const closeToEdge = bestDistance < 58;
  return broadCream || closeToEdge;
}

function createDockBackgroundPlayer({ videoKeying = false } = {}) {
  const root = new THREE.Group();
  root.name = "dockBackgroundMediaPlayer";
  root.position.copy(DOCK_BACKGROUND_POSITION);
  root.userData.life = 0;

  const video = createDropZoneVideoElement();
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const screenMaterial = makeVideoBackgroundKeyable(new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    toneMapped: false
  }), { enabled: videoKeying });
  const dimensions = dropPreviewDimensions(16 / 9, DOCK_BACKGROUND_HEIGHT);
  const screenMesh = new THREE.Mesh(createAspectPlaneGeometry(dimensions.aspect, DOCK_BACKGROUND_HEIGHT), screenMaterial);
  screenMesh.name = "dockBackgroundVideoScreen";
  screenMesh.userData.previewScreenHeight = DOCK_BACKGROUND_HEIGHT;
  screenMesh.userData.previewAspect = dimensions.aspect;
  screenMesh.position.z = DOCK_BACKGROUND_SCREEN_Z;
  screenMesh.renderOrder = DOCK_BACKGROUND_RENDER_ORDER;

  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.width + 0.34, dimensions.height + 0.32, 0.18),
    new THREE.MeshPhysicalMaterial({
      color: 0x0c1d2c,
      roughness: 0.24,
      metalness: 0.72,
      clearcoat: 0.48,
      clearcoatRoughness: 0.22,
      emissive: 0x082d38,
      emissiveIntensity: 0.26,
      transparent: true,
      opacity: 0.9
    })
  );
  backing.name = "dockBackgroundBacking";
  backing.position.z = -0.035;
  backing.castShadow = true;
  backing.receiveShadow = true;
  root.add(backing, screenMesh);

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7c78d,
    roughness: 0.2,
    metalness: 0.86,
    emissive: 0x6f4e12,
    emissiveIntensity: 0.3
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const rails = createDockBackgroundRails(dimensions, trimMaterial, glowMaterial);
  rails.name = "dockBackgroundRails";
  rails.position.z = 0.1;
  root.add(rails);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(dimensions.width + 0.82, dimensions.height + 0.66),
    glowMaterial.clone()
  );
  halo.name = "dockBackgroundHalo";
  halo.position.z = -0.09;
  halo.material.opacity = 0.12;
  root.add(halo);

  const light = new THREE.PointLight(0x9ffcff, 1.1, 9.5, 1.2);
  light.name = "dockBackgroundLight";
  light.position.set(0, -1.2, 1.1);
  root.add(light);

  const screen = {
    mesh: screenMesh,
    video,
    texture,
    material: screenMaterial,
    baseMaterial: screenMaterial,
    gradeMaterial: null,
    gradeEnabled: false,
    livePresentation: false,
    micWaveformGroup: null,
    matte: createVideoEdgeMatte(video, screenMaterial),
    source: null,
    sourceIndex: 0,
    loadToken: 0,
    nextSwapAt: null
  };
  return {
    group: root,
    screen,
    backing,
    rails,
    halo,
	    light,
	    refs: {
	      glow: rails.getObjectByName("dockBackgroundGlowEdges")
	    },
	    sources: [],
    pool: createDropZoneMediaPool([]),
    sourceKey: "",
    active: false
  };
}

function createDockBackgroundRails(dimensions, trimMaterial, glowMaterial) {
  const root = new THREE.Group();
  const railDepth = 0.12;
  const railWidth = 0.08;
  const railLengthX = dimensions.width + 0.36;
  const railLengthY = dimensions.height + 0.34;
  const railOffsetX = dimensions.width / 2 + 0.19;
  const railOffsetY = dimensions.height / 2 + 0.18;
  [
    ["dockBackgroundRailTop", railLengthX, railWidth, railDepth, 0, railOffsetY],
    ["dockBackgroundRailBottom", railLengthX, railWidth, railDepth, 0, -railOffsetY],
    ["dockBackgroundRailLeft", railWidth, railLengthY, railDepth, -railOffsetX, 0],
    ["dockBackgroundRailRight", railWidth, railLengthY, railDepth, railOffsetX, 0]
  ].forEach(([name, width, height, depth, x, y]) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), trimMaterial.clone());
    rail.name = name;
    rail.position.set(x, y, 0);
    rail.castShadow = true;
    root.add(rail);
  });
  const source = new THREE.BoxGeometry(dimensions.width + 0.34, dimensions.height + 0.32, 0.16);
  const glow = new THREE.LineSegments(new THREE.EdgesGeometry(source), glowMaterial.clone());
  source.dispose();
  glow.name = "dockBackgroundGlowEdges";
  glow.position.z = 0.04;
  root.add(glow);
  return root;
}

function resizeDockBackgroundScreen(player, aspect) {
  if (!player?.screen?.mesh) return;
  const safeAspect = THREE.MathUtils.clamp(Number(aspect) || 16 / 9, 0.35, 2.8);
  const dimensions = dropPreviewDimensions(safeAspect, DOCK_BACKGROUND_HEIGHT);
  const mesh = player.screen.mesh;
  const previous = mesh.geometry;
  mesh.geometry = createAspectPlaneGeometry(dimensions.aspect, DOCK_BACKGROUND_HEIGHT);
  previous?.dispose?.();
  mesh.userData.previewAspect = dimensions.aspect;
  if (player.backing) {
    const oldBacking = player.backing.geometry;
    player.backing.geometry = new THREE.BoxGeometry(dimensions.width + 0.34, dimensions.height + 0.32, 0.18);
    oldBacking?.dispose?.();
  }
  if (player.halo) {
    const oldHalo = player.halo.geometry;
    player.halo.geometry = new THREE.PlaneGeometry(dimensions.width + 0.82, dimensions.height + 0.66);
    oldHalo?.dispose?.();
  }
  if (player.rails) {
    const oldRails = player.rails;
    const nextRails = createDockBackgroundRails(
      dimensions,
      new THREE.MeshStandardMaterial({
        color: 0xd7c78d,
        roughness: 0.2,
        metalness: 0.86,
        emissive: 0x6f4e12,
        emissiveIntensity: 0.3
      }),
      new THREE.MeshBasicMaterial({
        color: 0x00f3ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    nextRails.name = "dockBackgroundRails";
    nextRails.position.copy(oldRails.position);
    player.group.remove(oldRails);
    disposeObject(oldRails);
    player.group.add(nextRails);
    player.rails = nextRails;
  }
}

function restoreDockBackgroundProjectionMaterial(player) {
  const screen = player?.screen;
  if (!screen?.mesh || !screen.baseMaterial) return false;
  if (screen.mesh.material !== screen.baseMaterial) screen.mesh.material = screen.baseMaterial;
  screen.material = screen.baseMaterial;
  screen.gradeEnabled = false;
  return true;
}

function setDockBackgroundProjectionLivePresentation(player, enabled) {
  const screen = player?.screen;
  const mesh = screen?.mesh;
  if (!screen || !mesh) return false;
  const live = Boolean(enabled);
  const wasLive = Boolean(screen.livePresentation);
  screen.livePresentation = live;
  mesh.userData.liveProjection = live;
  mesh.position.z = live ? DOCK_BACKGROUND_LIVE_SCREEN_Z : DOCK_BACKGROUND_SCREEN_Z;
  mesh.renderOrder = live ? DOCK_BACKGROUND_LIVE_RENDER_ORDER : DOCK_BACKGROUND_RENDER_ORDER;

  const baseMaterial = screen.baseMaterial;
  if (baseMaterial) {
    let baseNeedsUpdate = wasLive !== live;
    if (live) {
      baseMaterial.opacity = 1;
      if (!baseMaterial.transparent) {
        baseMaterial.transparent = true;
        baseNeedsUpdate = true;
      }
      if (baseMaterial.depthWrite) {
        baseMaterial.depthWrite = false;
        baseNeedsUpdate = true;
      }
      if (baseMaterial.depthTest) {
        baseMaterial.depthTest = false;
        baseNeedsUpdate = true;
      }
    } else {
      const keyState = baseMaterial.userData?.hapaVideoBackgroundKey;
      baseMaterial.opacity = player.active ? baseMaterial.opacity : 0.1;
      const nextTransparent = keyState
        ? keyState.originalTransparent || keyState.enabled || keyState.sourceHasAlpha
        : true;
      const nextDepthWrite = keyState?.enabled || keyState?.sourceHasAlpha
        ? false
        : keyState?.originalDepthWrite ?? true;
      if (baseMaterial.transparent !== nextTransparent) {
        baseMaterial.transparent = nextTransparent;
        baseNeedsUpdate = true;
      }
      if (baseMaterial.depthWrite !== nextDepthWrite) {
        baseMaterial.depthWrite = nextDepthWrite;
        baseNeedsUpdate = true;
      }
      if (!baseMaterial.depthTest) {
        baseMaterial.depthTest = true;
        baseNeedsUpdate = true;
      }
    }
    if (baseNeedsUpdate) baseMaterial.needsUpdate = true;
  }

  if (screen.gradeMaterial) {
    const gradeNeedsUpdate =
      screen.gradeMaterial.transparent !== live ||
      screen.gradeMaterial.depthWrite !== false ||
      screen.gradeMaterial.depthTest !== !live;
    screen.gradeMaterial.transparent = live;
    screen.gradeMaterial.depthWrite = false;
    screen.gradeMaterial.depthTest = !live;
    if (gradeNeedsUpdate) screen.gradeMaterial.needsUpdate = true;
  }
  return true;
}

function setDockBackgroundProjectionGrade(player, enabled, elapsed = 0) {
  const screen = player?.screen;
  if (!screen?.mesh || !screen.texture) return false;
  if (!enabled) return restoreDockBackgroundProjectionMaterial(player);
  if (!screen.gradeMaterial) {
    screen.gradeMaterial = createCameraCardHapaGradeMaterial(screen.texture);
    screen.gradeMaterial.side = THREE.DoubleSide;
    screen.gradeMaterial.depthWrite = false;
    screen.gradeMaterial.depthTest = !screen.livePresentation;
    screen.gradeMaterial.transparent = Boolean(screen.livePresentation);
    screen.gradeMaterial.userData.hapaDockProjectionShader = true;
  }
  if (screen.livePresentation) {
    screen.gradeMaterial.transparent = true;
    screen.gradeMaterial.depthWrite = false;
    screen.gradeMaterial.depthTest = false;
  }
  updateCameraCardShaderMaterialUniforms(screen.gradeMaterial, screen.texture, screen.video, elapsed);
  if (screen.mesh.material !== screen.gradeMaterial) screen.mesh.material = screen.gradeMaterial;
  screen.material = screen.gradeMaterial;
  screen.gradeEnabled = true;
  return true;
}

function setDockBackgroundScreenSource(player, source, { sourceIndex = 0, playing = false, seekOffset = 0 } = {}) {
  const screen = player?.screen;
  if (!screen?.video || !source?.uri) return;
  restoreDockBackgroundProjectionMaterial(player);
  const liveSource = isLiveCameraVideoSource(source);
  setDockBackgroundProjectionLivePresentation(player, liveSource);
  const video = screen.video;
  video.pause();
  if (video.srcObject) video.srcObject = null;
  if (source.posterUri) video.poster = source.posterUri;
  else video.removeAttribute("poster");
  screen.source = source;
  screen.sourceIndex = sourceIndex;
  setVideoMaterialSourceAlpha(screen.material, source);
  screen.loadToken = (screen.loadToken || 0) + 1;
  const token = screen.loadToken;
  if (liveSource) {
    const stream = liveCameraStreamForSource(source);
    if (!stream) return;
    video.removeAttribute("src");
    video.srcObject = stream;
    video.loop = false;
    screen.texture.offset.x = 1;
    screen.texture.repeat.x = -1;
    const sourceVideo = source.liveVideo;
    const forcedAspect = Number(source.forcePreviewAspect || 0);
    const liveAspect = forcedAspect || Number(source.previewAspect || 0) ||
      (sourceVideo?.videoWidth && sourceVideo?.videoHeight ? sourceVideo.videoWidth / sourceVideo.videoHeight : 16 / 9);
    resizeDockBackgroundScreen(player, liveAspect);
    video.addEventListener("loadedmetadata", () => {
      if (screen.loadToken !== token) return;
      const aspect = forcedAspect || (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : liveAspect);
      resizeDockBackgroundScreen(player, aspect);
      if (playing) video.play().catch(() => {});
    }, { once: true });
    if (playing) video.play().catch(() => {});
    return;
  }
  screen.texture.offset.x = 0;
  screen.texture.repeat.x = 1;
  video.loop = true;
  video.src = source.uri;
  video.load();
  video.addEventListener("loadedmetadata", () => {
    if (screen.loadToken !== token) return;
    if (video.videoWidth && video.videoHeight) resizeDockBackgroundScreen(player, video.videoWidth / video.videoHeight);
    const duration = Number(video.duration);
    if (duration > 0.8) {
      try {
        video.currentTime = Math.min(Math.max(0, seekOffset), Math.max(0, duration - 0.25));
      } catch {
        // Browser media backends may reject early seeks until a playable frame is decoded.
      }
    }
    if (playing) video.play().catch(() => {});
  }, { once: true });
  if (playing) video.play().catch(() => {});
}

function setDockBackgroundPlayerSources(player, sources = [], { force = false, playing = false, allowBackgroundless = false } = {}) {
  if (!player) return;
  const nextSources = uniqueDropZoneVideoSources(sources, "", { allowBackgroundless });
  const nextKey = nextSources.map(dropZoneVideoSourceKey).join("|");
  const changed = force || nextKey !== player.sourceKey;
  player.sources = nextSources;
  player.sourceKey = nextKey;
  player.active = nextSources.length > 0;
  setDropZoneMediaPoolSources(player.pool, nextSources, { allowBackgroundless });
  if (!nextSources.length) {
    restoreDockBackgroundProjectionMaterial(player);
    setDockBackgroundProjectionLivePresentation(player, false);
    player.screen.video.pause();
    if (player.screen.video.srcObject) player.screen.video.srcObject = null;
    player.screen.video.removeAttribute("src");
    player.screen.video.load();
    player.screen.texture.offset.x = 0;
    player.screen.texture.repeat.x = 1;
    player.screen.source = null;
    player.screen.nextSwapAt = null;
    setVideoMaterialSourceAlpha(player.screen.baseMaterial || player.screen.material, false);
    if (player.screen.baseMaterial) player.screen.baseMaterial.opacity = 0.1;
    if (player.screen.micWaveformGroup) player.screen.micWaveformGroup.visible = false;
    return;
  }
  const currentKey = dropZoneVideoSourceKey(player.screen.source);
  const currentStillAllowed = nextSources.some((source) => dropZoneVideoSourceKey(source) === currentKey);
  if (changed || !currentStillAllowed) {
    const source = nextSources.find(isLiveCameraVideoSource) || nextDropZoneMediaSource(player.pool, 0) || nextSources[0];
    const sourceIndex = Math.max(0, nextSources.findIndex((candidate) => dropZoneVideoSourceKey(candidate) === dropZoneVideoSourceKey(source)));
    player.screen.nextSwapAt = null;
    setDockBackgroundScreenSource(player, source, { sourceIndex, playing, seekOffset: Math.random() * 2 });
  }
}

function updateDockBackgroundPlayerFrame(player, elapsed, shouldPlay = false) {
  if (!player?.screen) return;
  const active = Boolean(player.sources?.length);
  const liveProjection = isLiveCameraVideoSource(player.screen.source);
  const appear = active ? 1 : 0;
  player.group.userData.life = THREE.MathUtils.lerp(player.group.userData.life || 0, appear, 0.035);
  const blend = player.group.userData.life || 0;
  const pulse = (Math.sin(elapsed * 1.35) + 1) * 0.5;
  if (player.screen.material) {
    player.screen.material.opacity = active
      ? liveProjection ? 1 : 0.68 + blend * 0.24 + pulse * 0.018
      : 0.1;
  }
  if (player.backing?.material) {
    player.backing.material.opacity = active ? liveProjection ? 0.86 : 0.74 + blend * 0.16 : 0.48;
    player.backing.material.emissiveIntensity = liveProjection ? 0.36 + blend * 0.28 : 0.18 + blend * 0.34;
  }
  if (player.halo?.material) {
    player.halo.material.opacity = active ? 0.08 + blend * 0.17 + pulse * 0.035 : 0.035;
  }
  if (player.light) {
    player.light.intensity = active ? 1.2 + blend * 5.8 + pulse * 0.8 : 0.45;
  }
  const glow = player.refs?.glow;
  if (glow?.material) glow.material.opacity = active ? 0.18 + blend * 0.32 + pulse * 0.05 : 0.08;
  player.group.rotation.y = Math.sin(elapsed * 0.11) * 0.014;
  player.group.position.y = DOCK_BACKGROUND_POSITION.y + Math.sin(elapsed * 0.55) * 0.018;
  if (!active) return;
  if (shouldPlay) {
    if (player.screen.video?.paused) player.screen.video.play().catch(() => {});
  } else if (player.screen.video && !player.screen.video.paused) {
    player.screen.video.pause();
  }
  if (player.sources.length <= 1) return;
  if (player.screen.nextSwapAt === null) {
    player.screen.nextSwapAt = elapsed + DOCK_BACKGROUND_ROTATE_SECONDS;
    return;
  }
  if (elapsed < player.screen.nextSwapAt) return;
  if (isLiveCameraVideoSource(player.screen.source) && player.sources.some(isLiveCameraVideoSource)) {
    player.screen.nextSwapAt = elapsed + DOCK_BACKGROUND_ROTATE_SECONDS;
    return;
  }
  const source = nextDropZoneMediaSource(player.pool, player.screen.sourceIndex + 1) || player.sources[(player.screen.sourceIndex + 1) % player.sources.length];
  const sourceIndex = Math.max(0, player.sources.findIndex((candidate) => dropZoneVideoSourceKey(candidate) === dropZoneVideoSourceKey(source)));
  player.screen.nextSwapAt = elapsed + DOCK_BACKGROUND_ROTATE_SECONDS;
  setDockBackgroundScreenSource(player, source, {
    sourceIndex,
    playing: shouldPlay,
    seekOffset: (elapsed * 0.31 + sourceIndex * 0.74) % 5
  });
}

function disposeDockBackgroundPlayer(player) {
  if (!player?.screen) return;
  const { video, texture } = player.screen;
  if (player.screen.micWaveformGroup) {
    player.screen.micWaveformGroup.parent?.remove(player.screen.micWaveformGroup);
    disposeObject(player.screen.micWaveformGroup);
    player.screen.micWaveformGroup = null;
  }
  player.screen.gradeMaterial?.dispose?.();
  player.screen.gradeMaterial = null;
  video?.pause();
  if (video?.srcObject) video.srcObject = null;
  video?.removeAttribute("src");
  video?.load();
  disposeVideoEdgeMatte(player.screen.matte);
  texture?.dispose?.();
}

function setDropZoneScreenSource(screen, source, { sourceIndex = screen.sourceIndex || 0, playing = false, seekOffset = 0 } = {}) {
  if (!screen?.video || !source?.uri) return;
  const video = screen.video;
  video.pause();
  if (source.posterUri) video.poster = source.posterUri;
  else video.removeAttribute("poster");
  screen.source = source;
  screen.sourceIndex = sourceIndex;
  setVideoMaterialSourceAlpha(screen.material, source);
  const targetAspect = dropZonePreviewAspectForSource(source, screen.mesh?.userData?.previewAspect || DROP_PREVIEW_SCREEN_ASPECT);
  if (screen.mesh && Math.abs((screen.mesh.userData.previewAspect || 0) - targetAspect) > 0.01) {
    resizeDropZonePreviewScreen(screen.mesh, targetAspect);
  }
  if (source.echoDirector) applyEchoDirectorCameraMotionToScreen(screen, source);
  else {
    resetDropZoneVideoTextureTransform(screen.texture);
    clearEchoDirectorPreviewOverlay(screen);
    if (screen.mesh?.userData) screen.mesh.userData.echoPreviewOpacity = 1;
  }
  screen.loadToken = (screen.loadToken || 0) + 1;
  const token = screen.loadToken;
  video.src = source.uri;
  video.load();
  video.addEventListener("loadedmetadata", () => {
    if (screen.loadToken !== token) return;
    if (video.videoWidth && video.videoHeight) {
      const aspect = dropZonePreviewAspectForSource(source, video.videoWidth / video.videoHeight);
      resizeDropZonePreviewScreen(screen.mesh, aspect);
      if (source.echoDirector) applyEchoDirectorCameraMotionToScreen(screen, source);
    }
    const duration = Number(video.duration);
    if (duration > 0.8) {
      try {
        video.currentTime = Math.min(Math.max(0, seekOffset), Math.max(0, duration - 0.25));
      } catch {
        // Some browser media backends reject early seeks until the first playable frame.
      }
    }
    if (playing) video.play().catch(() => {});
  }, { once: true });
  if (playing) video.play().catch(() => {});
}

function createDropZonePreviewScreen(spec, index, sources, { videoKeying = false } = {}) {
  const sourceIndex = sources.length ? index % sources.length : 0;
  const source = sources[sourceIndex];
  const video = createDropZoneVideoElement();
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = makeVideoBackgroundKeyable(new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    toneMapped: false
  }), { enabled: videoKeying });

  const dimensions = dropPreviewDimensions(DROP_PREVIEW_SCREEN_ASPECT, spec.height);
  const mesh = new THREE.Mesh(createAspectPlaneGeometry(dimensions.aspect, spec.height), material);
  mesh.name = `${spec.name}Video`;
  mesh.userData.previewScreenHeight = spec.height;
  mesh.userData.previewScreenWidth = dimensions.width;
  mesh.userData.previewAspect = dimensions.aspect;
  mesh.userData.previewOpacity = spec.opacity;
  mesh.userData.previewBaseOpacity = spec.opacity;
  mesh.userData.previewCurrentOpacity = spec.opacity;
  mesh.position.z = DROP_PREVIEW_CARD_DEPTH / 2 + 0.012;
  mesh.renderOrder = 3 + index;

  const rig = createDropZonePreviewCardRig(spec, index, mesh, dimensions);
  mesh.userData.previewRig = rig;

  const screen = {
    index,
    rig,
    mesh,
    video,
    texture,
    material,
    matte: createVideoEdgeMatte(video, material),
    source: null,
    sourceIndex,
    nextSwapAt: null,
    loadToken: 0
  };
  mesh.userData.previewScreenRef = screen;
  if (source) setDropZoneScreenSource(screen, source, { sourceIndex, seekOffset: index * 0.72 });
  return screen;
}

function createDropZonePreviewCardRig(spec, index, screenMesh, dimensions) {
  const rig = new THREE.Group();
  rig.name = spec.name;
  rig.userData.previewBaseOpacity = spec.opacity;
  rig.userData.previewCurrentOpacity = spec.opacity;
  rig.userData.previewBasePosition = new THREE.Vector3(...spec.position);
  rig.userData.previewHorizonPosition = new THREE.Vector3(...(spec.horizonPosition || spec.position));
  rig.userData.previewBaseRotation = new THREE.Euler(...spec.rotation);
  rig.userData.previewHorizonRotation = new THREE.Euler(...(spec.horizonRotation || spec.rotation));
  rig.userData.previewHorizonScale = spec.horizonScale || 1;
  rig.userData.previewHorizonOpacity = spec.horizonOpacity ?? spec.opacity;
  rig.position.set(...spec.position);
  rig.rotation.set(...spec.rotation);
  rig.renderOrder = 3 + index;

  const backing = new THREE.Mesh(
    createDropZonePreviewBackingGeometry(dimensions),
    new THREE.MeshPhysicalMaterial({
      color: index === 3 ? 0x12313b : 0x111827,
      roughness: 0.26,
      metalness: 0.64,
      clearcoat: 0.46,
      clearcoatRoughness: 0.24,
      emissive: index % 2 === 0 ? 0x082e36 : 0x2c1232,
      emissiveIntensity: index === 3 ? 0.24 : 0.36,
      transparent: true,
      opacity: index === 3 ? 0.76 : 0.9
    })
  );
  backing.name = "dropPreviewCardBacking";
  backing.position.z = -DROP_PREVIEW_CARD_DEPTH * 0.18;
  backing.castShadow = true;
  backing.receiveShadow = true;
  rig.add(backing);

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7c78d,
    roughness: 0.2,
    metalness: 0.84,
    emissive: 0x6b4c13,
    emissiveIntensity: 0.28
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: index % 2 === 0 ? 0x00f3ff : 0xff6df2,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const rails = createDropZonePreviewRails(dimensions, trimMaterial, glowMaterial);
  rails.name = "dropPreviewCardRails";
  rig.add(rails);

  const halo = new THREE.Mesh(
    createDropZonePreviewHaloGeometry(dimensions),
    glowMaterial.clone()
  );
  halo.name = "dropPreviewCardHalo";
  halo.position.z = -DROP_PREVIEW_CARD_DEPTH * 0.68;
  halo.material.opacity = index === 3 ? 0.12 : 0.2;
  rig.add(halo);

  rig.add(screenMesh);
  rig.userData.previewParts = { backing, rails, halo };
  rig.userData.previewScreen = screenMesh;
  updateDropZonePreviewCardGeometry(rig, dimensions);
  return rig;
}

function createDropZonePreviewBackingGeometry(dimensions) {
  return new THREE.BoxGeometry(
    dimensions.width + DROP_PREVIEW_CARD_MARGIN * 2,
    dimensions.height + DROP_PREVIEW_CARD_MARGIN * 2,
    DROP_PREVIEW_CARD_DEPTH
  );
}

function createDropZonePreviewHaloGeometry(dimensions) {
  return new THREE.PlaneGeometry(
    dimensions.width + DROP_PREVIEW_CARD_MARGIN * 2.8,
    dimensions.height + DROP_PREVIEW_CARD_MARGIN * 2.8
  );
}

function createDropZonePreviewRails(dimensions, trimMaterial, glowMaterial) {
  const root = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), trimMaterial.clone());
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), trimMaterial.clone());
  const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), trimMaterial.clone());
  const right = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), trimMaterial.clone());
  const glowSource = createDropZonePreviewBackingGeometry(dimensions);
  const glow = new THREE.LineSegments(new THREE.EdgesGeometry(glowSource), glowMaterial.clone());
  glowSource.dispose();
  top.name = "dropPreviewCardRailTop";
  bottom.name = "dropPreviewCardRailBottom";
  left.name = "dropPreviewCardRailLeft";
  right.name = "dropPreviewCardRailRight";
  glow.name = "dropPreviewCardGlowEdges";
  root.add(top, bottom, left, right, glow);
  return root;
}

function updateDropZonePreviewCardGeometry(rig, dimensions) {
  if (!rig?.userData?.previewParts) return;
  const { backing, rails, halo } = rig.userData.previewParts;
  if (backing) {
    const previous = backing.geometry;
    backing.geometry = createDropZonePreviewBackingGeometry(dimensions);
    previous?.dispose?.();
  }
  if (halo) {
    const previous = halo.geometry;
    halo.geometry = createDropZonePreviewHaloGeometry(dimensions);
    previous?.dispose?.();
  }
  if (rails) {
    const railLengthX = dimensions.width + DROP_PREVIEW_CARD_MARGIN * 2.06;
    const railLengthY = dimensions.height + DROP_PREVIEW_CARD_MARGIN * 2.06;
    const railOffsetX = dimensions.width / 2 + DROP_PREVIEW_CARD_MARGIN * 0.58;
    const railOffsetY = dimensions.height / 2 + DROP_PREVIEW_CARD_MARGIN * 0.58;
    const railDepth = DROP_PREVIEW_CARD_DEPTH * 0.72;
    [
      ["dropPreviewCardRailTop", railLengthX, DROP_PREVIEW_CARD_RAIL, railDepth, 0, railOffsetY],
      ["dropPreviewCardRailBottom", railLengthX, DROP_PREVIEW_CARD_RAIL, railDepth, 0, -railOffsetY],
      ["dropPreviewCardRailLeft", DROP_PREVIEW_CARD_RAIL, railLengthY, railDepth, -railOffsetX, 0],
      ["dropPreviewCardRailRight", DROP_PREVIEW_CARD_RAIL, railLengthY, railDepth, railOffsetX, 0]
    ].forEach(([name, width, height, depth, x, y]) => {
      const rail = rails.getObjectByName(name);
      if (!rail) return;
      const previous = rail.geometry;
      rail.geometry = new THREE.BoxGeometry(width, height, depth);
      previous?.dispose?.();
      rail.position.set(x, y, DROP_PREVIEW_CARD_DEPTH * 0.34);
      rail.castShadow = true;
      rail.receiveShadow = true;
    });
    const glow = rails.getObjectByName("dropPreviewCardGlowEdges");
    if (glow) {
      const previousGeometry = glow.geometry;
      const glowSource = createDropZonePreviewBackingGeometry(dimensions);
      glow.geometry = new THREE.EdgesGeometry(glowSource);
      glowSource.dispose();
      previousGeometry?.dispose?.();
      glow.position.z = DROP_PREVIEW_CARD_DEPTH * 0.1;
    }
  }
}

function updateDropZonePreviewScreens(preview, elapsed, shouldPlay) {
  const screens = preview?.screens || [];
  const sources = preview?.sources || [];
  const centerSources = preview?.centerSources || [];
  if (!screens.length || (sources.length <= 1 && centerSources.length <= 1)) return;
  if (preview.pool) ensureDropZoneMediaQueue(preview.pool);
  if (preview.centerPool) ensureDropZoneMediaQueue(preview.centerPool);
  screens.forEach((screen) => {
    const centerPriority = isCenterPreviewScreen(screen) && preview.centerPool?.sources?.length;
    const activePool = centerPriority ? preview.centerPool : preview.pool;
    const activeSources = centerPriority ? centerSources : sources;
    if (!activeSources.length || activeSources.length <= 1) return;
    if (screen.nextSwapAt === null) {
      screen.nextSwapAt = elapsed + DROP_PREVIEW_ROTATE_SECONDS + screen.index * DROP_PREVIEW_ROTATE_STAGGER;
      return;
    }
    if (elapsed < screen.nextSwapAt) return;
    const nextSource = activePool ? nextDropZoneMediaSource(activePool, screen.index) : activeSources[(screen.sourceIndex + 1) % activeSources.length];
    const nextIndex = Math.max(0, activeSources.findIndex((source) => dropZoneVideoSourceKey(source) === dropZoneVideoSourceKey(nextSource)));
    screen.nextSwapAt = elapsed + DROP_PREVIEW_ROTATE_SECONDS + screen.index * DROP_PREVIEW_ROTATE_STAGGER * 0.22;
    setDropZoneScreenSource(screen, nextSource || activeSources[nextIndex], {
      sourceIndex: nextIndex,
      playing: shouldPlay && screen.index < DROP_PREVIEW_ACTIVE_SCREEN_LIMIT,
      seekOffset: (elapsed * 0.37 + screen.index * 0.91) % 5
    });
  });
  primeDropZonePreviewBuffer(preview);
}

function isCenterPreviewScreen(screen) {
  return screen?.rig?.name === CENTER_PREVIEW_SCREEN_NAME || screen?.mesh?.name === `${CENTER_PREVIEW_SCREEN_NAME}Video`;
}

function updateDropZonePreviewCameraRail(preview, horizonBlend = 0) {
  (preview?.screens || []).forEach((screen) => {
    const rig = screen?.rig || screen?.mesh;
    if (!rig?.userData?.previewBasePosition) return;
    const blend = THREE.MathUtils.clamp(horizonBlend, 0, 1);
    rig.position.copy(rig.userData.previewBasePosition).lerp(rig.userData.previewHorizonPosition, blend);
    const baseRotation = rig.userData.previewBaseRotation;
    const horizonRotation = rig.userData.previewHorizonRotation || baseRotation;
    if (baseRotation && horizonRotation) {
      rig.rotation.set(
        THREE.MathUtils.lerp(baseRotation.x, horizonRotation.x, blend),
        THREE.MathUtils.lerp(baseRotation.y, horizonRotation.y, blend),
        THREE.MathUtils.lerp(baseRotation.z, horizonRotation.z, blend)
      );
    }
    const scale = THREE.MathUtils.lerp(1, rig.userData.previewHorizonScale || 1, blend);
    rig.scale.setScalar(scale);
    rig.userData.previewCurrentOpacity = THREE.MathUtils.lerp(
      rig.userData.previewBaseOpacity ?? screen.mesh?.userData?.previewOpacity ?? 0.68,
      rig.userData.previewHorizonOpacity ?? screen.mesh?.userData?.previewOpacity ?? 0.68,
      blend
    );
  });
}

function updateDropZonePreviewOpacity(preview, appear = 1, pulse = 0) {
  (preview?.screens || []).forEach((screen) => {
    const rig = screen?.rig || screen?.mesh;
    const screenMesh = screen?.mesh;
    const echoOpacity = Number.isFinite(Number(screenMesh?.userData?.echoPreviewOpacity))
      ? Number(screenMesh.userData.echoPreviewOpacity)
      : 1;
    const opacity = ((rig?.userData?.previewCurrentOpacity || screenMesh?.userData?.previewOpacity || 0.68) * appear + pulse * 0.04) * echoOpacity;
    if (screenMesh?.material) screenMesh.material.opacity = opacity;
    if (screen?.echoOverlay?.material && screen.echoOverlay.mesh?.visible) {
      screen.echoOverlay.material.opacity = THREE.MathUtils.clamp(opacity * 1.08, 0, 0.98);
    }
    const parts = rig?.userData?.previewParts;
    if (parts?.backing?.material) parts.backing.material.opacity = THREE.MathUtils.clamp(0.54 + opacity * 0.28, 0.42, 0.92);
    if (parts?.halo?.material) parts.halo.material.opacity = THREE.MathUtils.clamp(opacity * 0.22 + pulse * 0.04, 0.08, 0.36);
    const rails = parts?.rails;
    rails?.children?.forEach((child) => {
      if (!child.material) return;
      if (child.name === "dropPreviewCardGlowEdges") {
        child.material.opacity = THREE.MathUtils.clamp(opacity * 0.42 + pulse * 0.08, 0.14, 0.62);
      }
    });
  });
}

function disposeDropZonePreview(preview) {
  (preview?.screens || []).forEach((screen) => {
    disposeEchoDirectorPreviewOverlay(screen);
    disposeVideoEdgeMatte(screen?.matte);
    if (!screen?.video) return;
    screen.video.pause();
    screen.video.removeAttribute("src");
    screen.video.load();
  });
  (preview?.bufferVideos || []).forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
}

function createDropZonePreview(card = {}, song = null, options = {}) {
  return createDropZonePreviewFromSources(dropZoneVideoSources(card, {
    allowBackgroundless: Boolean(options.videoKeying),
    preferBackgroundless: Boolean(options.videoKeying)
  }), song, options);
}

function createDropZonePreviewFromSources(rawSources = [], song = null, options = {}) {
  const allowBackgroundless = Boolean(options.videoKeying);
  const sources = uniqueDropZoneVideoSources(rawSources, "", { allowBackgroundless });
  const root = new THREE.Group();
  root.name = "dropZoneSurroundVideoPreview";
  root.userData.life = 0;
  root.userData.song = song || null;

  const panelSpecs = [
    {
      name: "dropPreviewBack",
      height: DROP_PREVIEW_BACK_HEIGHT,
      position: [0.12, 2.2, -3.58],
      horizonPosition: [0.02, 2.76, -4.18],
      horizonScale: 0.78,
      horizonOpacity: 0.94,
      rotation: [0, 0.03, 0],
      horizonRotation: [0, 0, 0],
      opacity: 0.82
    },
    {
      name: "dropPreviewLeft",
      height: DROP_PREVIEW_SIDE_HEIGHT,
      position: [-3.7, 1.86, -0.12],
      horizonPosition: [-5.42, 2.34, -2.48],
      horizonScale: 0.88,
      horizonOpacity: 0.82,
      rotation: [0, Math.PI / 2.36, 0],
      horizonRotation: [0, Math.PI * 0.36, 0],
      opacity: 0.7
    },
    {
      name: "dropPreviewRight",
      height: DROP_PREVIEW_SIDE_HEIGHT,
      position: [3.62, 1.86, -0.08],
      horizonPosition: [5.42, 2.34, -2.48],
      horizonScale: 0.88,
      horizonOpacity: 0.82,
      rotation: [0, -Math.PI / 2.36, 0],
      horizonRotation: [0, -Math.PI * 0.36, 0],
      opacity: 0.7
    },
    {
      name: "dropPreviewTable",
      height: DROP_PREVIEW_TABLE_HEIGHT,
      position: [DROP_ZONE_POSITION.x, 0.066, DROP_ZONE_POSITION.z - 0.03],
      horizonPosition: [DROP_ZONE_POSITION.x, 0.064, DROP_ZONE_POSITION.z - 0.03],
      horizonScale: 0.94,
      horizonOpacity: 0.34,
      rotation: [-Math.PI / 2, 0, 0.02],
      opacity: 0.42
    }
  ];

  const screens = panelSpecs
    .slice(0, DROP_PREVIEW_PANEL_LIMIT)
    .map((spec, index) => createDropZonePreviewScreen(spec, index, sources, options));
  screens.forEach((screen) => root.add(screen.rig || screen.mesh));

  if (song) root.add(createDropZoneSongVisualizer(song));

  const glow = new THREE.PointLight(0xff6df2, 5.4, 6.8);
  glow.name = "dropPreviewVideoGlow";
  glow.position.set(DROP_ZONE_POSITION.x, 1.2, DROP_ZONE_POSITION.z);
  root.add(glow);

  const preview = {
    group: root,
    screens,
    sources,
    pool: createDropZoneMediaPool(sources, { allowBackgroundless }),
    centerSources: [],
    centerPool: null,
    allowBackgroundless,
    bufferVideos: [],
    song
  };
  primeDropZonePreviewBuffer(preview);
  return preview;
}

function setDropZonePreviewSources(preview, sources = [], { resetScreens = false, allowBackgroundless = false } = {}) {
  if (!preview) return;
  const nextSources = uniqueDropZoneVideoSources(sources, "", { allowBackgroundless });
  preview.allowBackgroundless = allowBackgroundless;
  preview.sources = nextSources;
  if (!preview.pool) preview.pool = createDropZoneMediaPool(nextSources, { allowBackgroundless });
  else setDropZoneMediaPoolSources(preview.pool, nextSources, { allowBackgroundless });
  if (resetScreens) {
    preview.screens.forEach((screen, index) => {
      const source = nextSources[index % Math.max(1, nextSources.length)] || nextDropZoneMediaSource(preview.pool, index);
      screen.nextSwapAt = null;
      if (source) {
        setDropZoneScreenSource(screen, source, {
          sourceIndex: Math.max(0, nextSources.findIndex((candidate) => dropZoneVideoSourceKey(candidate) === dropZoneVideoSourceKey(source))),
          playing: false,
          seekOffset: index * 0.72
        });
      }
    });
  }
  primeDropZonePreviewBuffer(preview);
}

function setDropZoneCenterPrioritySources(preview, sources = [], { force = false, playing = false, allowBackgroundless = false } = {}) {
  if (!preview) return;
  const centerSources = uniqueDropZoneVideoSources(sources, "", { allowBackgroundless });
  const centerScreen = (preview.screens || []).find(isCenterPreviewScreen);
  preview.centerSources = centerSources;
  if (!centerSources.length) {
    preview.centerPool = null;
    if (force && centerScreen && preview.sources?.length) {
      const fallback = preview.sources[centerScreen.index % preview.sources.length] || nextDropZoneMediaSource(preview.pool, centerScreen.index);
      if (fallback) {
        centerScreen.nextSwapAt = null;
        setDropZoneScreenSource(centerScreen, fallback, {
          sourceIndex: Math.max(0, preview.sources.findIndex((source) => dropZoneVideoSourceKey(source) === dropZoneVideoSourceKey(fallback))),
          playing,
          seekOffset: centerScreen.index * 0.72
        });
      }
    }
    return;
  }
  if (!preview.centerPool) preview.centerPool = createDropZoneMediaPool(centerSources, { allowBackgroundless });
  else setDropZoneMediaPoolSources(preview.centerPool, centerSources, { allowBackgroundless });
  if (!centerScreen) return;
  const source = centerSources[0];
  const sourceKey = dropZoneVideoSourceKey(source);
  const currentKey = dropZoneVideoSourceKey(centerScreen.source);
  if (force || sourceKey !== currentKey) {
    centerScreen.nextSwapAt = null;
    setDropZoneScreenSource(centerScreen, source, {
      sourceIndex: 0,
      playing,
      seekOffset: Number.isFinite(Number(source.seekOffset)) ? Number(source.seekOffset) : Math.random() * 1.8
    });
  }
}

function createDropZoneSongVisualizer(song = null) {
  const root = new THREE.Group();
  root.name = "dropZoneSongVisualizer";
  root.position.set(DROP_ZONE_POSITION.x, 0.13, DROP_ZONE_POSITION.z);
  root.userData.active = Boolean(song);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.88, 0.01, 8, 128),
    new THREE.MeshBasicMaterial({
      color: song ? 0xf6c96d : 0x00f3ff,
      transparent: true,
      opacity: song ? 0.42 : 0.16,
      depthWrite: false
    })
  );
  baseRing.name = "songVisualizerRing";
  baseRing.rotation.x = Math.PI / 2;
  root.add(baseRing);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.006, 8, 96),
    new THREE.MeshBasicMaterial({
      color: 0xff6df2,
      transparent: true,
      opacity: song ? 0.32 : 0.12,
      depthWrite: false
    })
  );
  innerRing.name = "songVisualizerInnerRing";
  innerRing.rotation.x = Math.PI / 2;
  root.add(innerRing);

  const electricRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.018, 8, 144),
    new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: song ? 0.46 : 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  electricRing.name = "songElectricRing";
  electricRing.rotation.x = Math.PI / 2;
  electricRing.position.y = 0.03;
  root.add(electricRing);

  const electricHalo = new THREE.Mesh(
    new THREE.RingGeometry(1.18, 1.46, 128),
    new THREE.MeshBasicMaterial({
      color: 0xff6df2,
      transparent: true,
      opacity: song ? 0.18 : 0.04,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  electricHalo.name = "songElectricHalo";
  electricHalo.rotation.x = -Math.PI / 2;
  electricHalo.position.y = 0.018;
  root.add(electricHalo);

  const barGeometry = new THREE.BoxGeometry(0.028, 0.18, 0.028);
  for (let index = 0; index < 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    const color = index % 3 === 0 ? 0xf6c96d : index % 3 === 1 ? 0x00f3ff : 0xff6df2;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: song ? 0.64 : 0.2,
      depthWrite: false
    });
    const bar = new THREE.Mesh(barGeometry, material);
    bar.name = "songVisualizerBar";
    bar.userData.baseAngle = angle;
    bar.userData.phase = index * 0.43;
    bar.position.set(Math.cos(angle) * 0.72, 0.09, Math.sin(angle) * 0.72);
    bar.rotation.y = -angle;
    root.add(bar);
  }

  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const color = index % 3 === 0 ? 0x00f3ff : index % 3 === 1 ? 0xff6df2 : 0xf6c96d;
    const bolt = new THREE.Line(
      createElectricBoltGeometry(),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: song ? 0.42 : 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    bolt.name = "songElectricBolt";
    bolt.userData.baseAngle = angle;
    bolt.userData.phase = index * 0.71;
    bolt.userData.radiusStart = 0.36 + (index % 3) * 0.035;
    bolt.userData.radiusEnd = 1.18 + (index % 4) * 0.075;
    root.add(bolt);
  }

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.66, 0.28),
    new THREE.MeshBasicMaterial({
      map: createSongLabelTexture(song),
      transparent: true,
      opacity: song ? 0.86 : 0.42,
      depthWrite: false
    })
  );
  label.name = "songVisualizerLabel";
  label.position.set(0, 0.2, -1.04);
  label.rotation.x = -Math.PI / 2;
  root.add(label);

  const light = new THREE.PointLight(song ? 0xf6c96d : 0x00f3ff, song ? 3.2 : 0.6, 3.4);
  light.name = "songVisualizerLight";
  light.position.set(0, 0.45, 0);
  root.add(light);

  const coreLight = new THREE.PointLight(0x00f3ff, song ? 4.2 : 0.4, 4.8, 1.5);
  coreLight.name = "songElectricCoreLight";
  coreLight.position.set(0, 0.72, 0);
  root.add(coreLight);

  const magentaLight = new THREE.PointLight(0xff00ff, song ? 2.8 : 0.2, 4.2, 1.6);
  magentaLight.name = "songElectricMagentaLight";
  magentaLight.position.set(-0.98, 0.46, -0.42);
  root.add(magentaLight);

  const cyanLight = new THREE.PointLight(0x00f3ff, song ? 2.8 : 0.2, 4.2, 1.6);
  cyanLight.name = "songElectricCyanLight";
  cyanLight.position.set(1.0, 0.42, 0.5);
  root.add(cyanLight);

  return root;
}

function createElectricBoltGeometry(segmentCount = 7) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((segmentCount + 1) * 3), 3));
  geometry.userData.segmentCount = segmentCount;
  return geometry;
}

function updateDropZoneSongVisualizer(previewRoot, elapsed, energy = 0, appear = 1) {
  const visualizer = previewRoot.getObjectByName("dropZoneSongVisualizer");
  if (!visualizer) return;
  const active = visualizer.userData.active;
  const beat = (Math.sin(elapsed * 5.4) + 1) * 0.5;
  const signal = active ? Math.max(energy, 0.1 + (Math.sin(elapsed * 1.7) + 1) * 0.055, beat * 0.14) : 0.04;
  visualizer.rotation.y = Math.sin(elapsed * 0.35) * 0.08;
  visualizer.position.y = 0.13 + signal * 0.16 + Math.sin(elapsed * 1.1) * 0.012;
  const ring = visualizer.getObjectByName("songVisualizerRing");
  if (ring) {
    ring.scale.setScalar(1 + signal * 0.22);
    ring.material.opacity = (active ? 0.34 : 0.12) * appear + signal * 0.34;
  }
  const innerRing = visualizer.getObjectByName("songVisualizerInnerRing");
  if (innerRing) {
    innerRing.scale.setScalar(1 + signal * 0.34);
    innerRing.material.opacity = (active ? 0.22 : 0.08) * appear + signal * 0.28;
  }
  const electricRing = visualizer.getObjectByName("songElectricRing");
  if (electricRing) {
    electricRing.rotation.z = elapsed * 0.28;
    electricRing.scale.setScalar(1 + signal * 0.42 + beat * 0.035);
    electricRing.material.opacity = (active ? 0.28 : 0.04) * appear + signal * 0.78;
  }
  const electricHalo = visualizer.getObjectByName("songElectricHalo");
  if (electricHalo) {
    electricHalo.rotation.z = -elapsed * 0.18;
    electricHalo.scale.setScalar(1 + signal * 0.34);
    electricHalo.material.opacity = (active ? 0.12 : 0.02) * appear + signal * 0.34 + beat * 0.05;
  }
  visualizer.children.forEach((child) => {
    if (child.name === "songVisualizerBar") {
      const wave = (Math.sin(elapsed * 5.2 + child.userData.phase) + 1) * 0.5;
      const height = 0.12 + signal * 1.18 + wave * (active ? 0.24 : 0.05);
      child.scale.set(1, height, 1);
      child.position.y = 0.06 + height * 0.1;
      child.material.opacity = (active ? 0.36 : 0.12) * appear + signal * 0.82 + wave * 0.08;
      return;
    }
    if (child.name === "songElectricBolt") {
      updateElectricBolt(child, elapsed, signal, active, appear);
    }
  });
  const label = visualizer.getObjectByName("songVisualizerLabel");
  if (label) label.material.opacity = (active ? 0.76 : 0.28) * appear + signal * 0.16;
  const light = visualizer.getObjectByName("songVisualizerLight");
  if (light) light.intensity = (active ? 1.6 : 0.25) + signal * 11;
  const coreLight = visualizer.getObjectByName("songElectricCoreLight");
  if (coreLight) {
    coreLight.intensity = ((active ? 4.8 : 0.35) + signal * 18 + beat * 2.2) * appear;
    coreLight.distance = 4.4 + signal * 2.2;
  }
  const magentaLight = visualizer.getObjectByName("songElectricMagentaLight");
  if (magentaLight) magentaLight.intensity = ((active ? 2.6 : 0.12) + signal * 10 + beat * 1.4) * appear;
  const cyanLight = visualizer.getObjectByName("songElectricCyanLight");
  if (cyanLight) cyanLight.intensity = ((active ? 2.8 : 0.12) + signal * 10 + (1 - beat) * 1.3) * appear;
  const previewGlow = previewRoot.getObjectByName("dropPreviewVideoGlow");
  if (previewGlow) {
    previewGlow.intensity = 5.4 + signal * 8 + (active ? beat * 1.8 : 0);
    previewGlow.distance = 6.8 + signal * 1.8;
  }
}

function updateElectricBolt(bolt, elapsed, signal, active, appear) {
  const attribute = bolt.geometry?.getAttribute("position");
  if (!attribute) return;
  const positions = attribute.array;
  const segments = bolt.geometry.userData.segmentCount || 7;
  const baseAngle = bolt.userData.baseAngle || 0;
  const phase = bolt.userData.phase || 0;
  const radiusStart = bolt.userData.radiusStart || 0.36;
  const radiusEnd = bolt.userData.radiusEnd || 1.18;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const jitter = Math.sin(elapsed * 12.5 + phase + index * 1.73) * 0.07 * (0.35 + signal);
    const angle = baseAngle + jitter + Math.sin(elapsed * 2.2 + phase) * 0.035;
    const radius = THREE.MathUtils.lerp(radiusStart, radiusEnd + signal * 0.28, t) + Math.sin(elapsed * 9.5 + phase + index) * 0.025;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 0.09 + t * (0.22 + signal * 0.28) + Math.sin(elapsed * 8.1 + phase + index * 0.61) * 0.025;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  attribute.needsUpdate = true;
  bolt.material.opacity = THREE.MathUtils.clamp(
    ((active ? 0.18 : 0.02) + signal * 0.92 + Math.sin(elapsed * 14 + phase) * 0.08) * appear,
    0,
    1
  );
}

function createMusicHyperspaceTunnel() {
  const root = new THREE.Group();
  root.name = "musicHyperspaceTunnel";
  root.visible = false;
  root.userData.activeBlend = 0;

  const planeConfigs = [
    { name: "hyperspaceFloor", width: 8.6, height: 6.8, position: [0, 0.052, -0.52], rotation: [-Math.PI / 2, 0, 0], lane: 0, colorA: "#00f3ff", colorB: "#ff4df0" },
    { name: "hyperspaceCeiling", width: 8.6, height: 6.8, position: [0, 2.92, -0.52], rotation: [Math.PI / 2, 0, 0], lane: 1, colorA: "#f6c96d", colorB: "#00f3ff" },
    { name: "hyperspaceLeftWall", width: 6.8, height: 2.84, position: [-3.92, 1.48, -0.52], rotation: [0, Math.PI / 2, 0], lane: 2, colorA: "#ff4df0", colorB: "#8ef7ff" },
    { name: "hyperspaceRightWall", width: 6.8, height: 2.84, position: [3.92, 1.48, -0.52], rotation: [0, -Math.PI / 2, 0], lane: 3, colorA: "#8ef7ff", colorB: "#f6c96d" },
    { name: "hyperspaceBackWall", width: 8.4, height: 2.86, position: [0, 1.48, -2.82], rotation: [0, 0, 0], lane: 4, colorA: "#00f3ff", colorB: "#f6c96d" },
    { name: "hyperspaceFarGate", width: 6.8, height: 2.28, position: [0, 1.55, -5.18], rotation: [0, 0, 0], lane: 5, colorA: "#9d74ff", colorB: "#00f3ff" }
  ];

  planeConfigs.forEach((config) => root.add(createMusicHyperspacePlane(config)));
  root.add(createMusicHyperspaceStars());

  root.traverse((child) => {
    child.renderOrder = -2;
  });
  return root;
}

function createMusicHyperspacePlane(config) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(config.width, config.height, 64, 36),
    createMusicHyperspaceMaterial(config)
  );
  mesh.name = config.name;
  mesh.position.set(...config.position);
  mesh.rotation.set(...config.rotation);
  mesh.userData.basePosition = mesh.position.clone();
  mesh.userData.lane = config.lane;
  mesh.userData.isHyperspacePlane = true;
  return mesh;
}

function createMusicHyperspaceMaterial(config) {
  return new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0 },
      u_energy: { value: 0 },
      u_low: { value: 0 },
      u_mid: { value: 0 },
      u_high: { value: 0 },
      u_opacity: { value: 0 },
      u_lane: { value: config.lane || 0 },
      u_color_a: { value: new THREE.Color(config.colorA || "#00f3ff") },
      u_color_b: { value: new THREE.Color(config.colorB || "#ff4df0") },
      u_data_arr: { value: new Float32Array(HYPERSPACE_FREQUENCY_BINS) }
    },
    vertexShader: `
      uniform float u_time;
      uniform float u_energy;
      uniform float u_low;
      uniform float u_mid;
      uniform float u_high;
      uniform float u_lane;
      uniform float u_data_arr[${HYPERSPACE_FREQUENCY_BINS}];
      varying float vSignal;
      varying float vRail;
      varying float vFlow;
      float spectrumAt(float value) {
        int index = int(clamp(floor(value), 0.0, ${HYPERSPACE_FREQUENCY_BINS - 1}.0));
        return u_data_arr[index];
      }
      void main() {
        vec3 p = position;
        float ax = abs(position.x);
        float ay = abs(position.y);
        float laneOffset = u_lane * 7.0;
        float bandA = spectrumAt(mod(floor(ax * 4.0 + ay * 1.8 + laneOffset + u_time * (5.0 + u_high * 14.0)), ${HYPERSPACE_FREQUENCY_BINS}.0));
        float bandB = spectrumAt(mod(floor(ay * 5.0 + ax * 1.2 + laneOffset * 1.7 + u_time * (3.0 + u_low * 8.0)), ${HYPERSPACE_FREQUENCY_BINS}.0));
        float gridPulse = sin(position.x * 2.2 + position.y * 1.7 + u_time * (2.2 + u_mid * 6.0) + laneOffset);
        float inward = 1.0 - smoothstep(0.0, 4.2, length(position.xy) * 0.55);
        float signal = clamp((bandA * 0.64 + bandB * 0.42 + u_energy * 0.35) * (0.72 + inward * 0.46), 0.0, 1.8);
        p.z += gridPulse * (0.025 + u_mid * 0.08) + signal * (0.16 + u_energy * 0.28);
        vSignal = signal;
        vRail = inward;
        vFlow = fract((position.y * 0.08 + position.x * 0.035 + u_time * (0.24 + u_high * 0.38) + u_lane * 0.13));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float u_opacity;
      uniform float u_energy;
      uniform float u_high;
      uniform vec3 u_color_a;
      uniform vec3 u_color_b;
      varying float vSignal;
      varying float vRail;
      varying float vFlow;
      void main() {
        vec3 color = mix(u_color_a, u_color_b, smoothstep(0.05, 0.95, vFlow + vSignal * 0.18));
        color += vec3(1.0, 0.82, 0.42) * max(0.0, vSignal - 0.62) * 0.48;
        float alpha = u_opacity * (0.18 + vSignal * 0.55 + vRail * 0.16 + u_energy * 0.22 + u_high * 0.08);
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.82));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    wireframe: true,
    toneMapped: false
  });
}

function createMusicHyperspaceStars(count = 260) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const palette = [
    new THREE.Color(0x00f3ff),
    new THREE.Color(0xff4df0),
    new THREE.Color(0xf6c96d),
    new THREE.Color(0x8ef7ff)
  ];
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = -4.15 + Math.random() * 8.3;
    positions[index * 3 + 1] = 0.22 + Math.random() * 2.7;
    positions[index * 3 + 2] = -5.75 + Math.random() * 7.75;
    const color = palette[index % palette.length].clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.24);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    seeds[index] = Math.random();
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.026,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const points = new THREE.Points(geometry, material);
  points.name = "musicHyperspaceStars";
  points.userData.basePositions = positions.slice();
  points.userData.seeds = seeds;
  points.userData.isHyperspaceStars = true;
  return points;
}

function updateMusicHyperspaceTunnel(root, elapsed, bands = {}, active = false) {
  if (!root) return;
  const target = active ? 1 : 0;
  root.userData.activeBlend = THREE.MathUtils.lerp(root.userData.activeBlend || 0, target, active ? 0.075 : 0.05);
  const appear = root.userData.activeBlend || 0;
  root.visible = appear > 0.01;
  if (!root.visible) return;

  const energy = THREE.MathUtils.clamp(bands.energy || 0, 0, 1);
  const low = THREE.MathUtils.clamp(bands.low || energy * 0.8, 0, 1);
  const mid = THREE.MathUtils.clamp(bands.mid || energy * 0.7, 0, 1);
  const high = THREE.MathUtils.clamp(bands.high || energy * 0.6, 0, 1);
  const spectrum = bands.spectrum || null;
  root.rotation.y = Math.sin(elapsed * 0.17) * 0.012 * appear;
  root.position.z = Math.sin(elapsed * 0.31) * 0.035 * appear;

  root.children.forEach((child) => {
    if (child.userData?.isHyperspacePlane) {
      updateMusicHyperspacePlane(child, elapsed, { energy, low, mid, high, spectrum }, appear);
    } else if (child.userData?.isHyperspaceStars) {
      updateMusicHyperspaceStars(child, elapsed, { energy, low, mid, high }, appear);
    }
  });
}

function updateMusicHyperspacePlane(mesh, elapsed, bands, appear) {
  const uniforms = mesh.material?.uniforms;
  if (!uniforms) return;
  uniforms.u_time.value = elapsed;
  uniforms.u_energy.value = bands.energy;
  uniforms.u_low.value = bands.low;
  uniforms.u_mid.value = bands.mid;
  uniforms.u_high.value = bands.high;
  uniforms.u_opacity.value = appear * (0.32 + bands.energy * 0.32);
  const data = uniforms.u_data_arr.value;
  for (let index = 0; index < HYPERSPACE_FREQUENCY_BINS; index += 1) {
    const sourceValue = Number(bands.spectrum?.[index] || 0);
    data[index] = THREE.MathUtils.lerp(data[index] || 0, sourceValue, 0.42);
  }
  const base = mesh.userData.basePosition;
  if (base) {
    const lane = Number(mesh.userData.lane || 0);
    mesh.position.copy(base);
    mesh.position.y += Math.sin(elapsed * 0.7 + lane) * 0.018 * appear;
  }
}

function updateMusicHyperspaceStars(points, elapsed, bands, appear) {
  const position = points.geometry?.attributes?.position;
  const base = points.userData.basePositions;
  const seeds = points.userData.seeds;
  if (!position || !base || !seeds) return;
  const values = position.array;
  const zMin = -5.75;
  const zMax = 2.15;
  const zRange = zMax - zMin;
  const speed = 0.34 + bands.energy * 5.6 + bands.high * 2.8;
  for (let index = 0; index < seeds.length; index += 1) {
    const offset = index * 3;
    const seed = seeds[index];
    values[offset] = base[offset] + Math.sin(elapsed * (0.35 + seed * 0.75) + seed * 20) * (0.025 + bands.mid * 0.075);
    values[offset + 1] = base[offset + 1] + Math.cos(elapsed * (0.42 + seed * 0.5) + seed * 18) * (0.02 + bands.low * 0.055);
    const traveled = (elapsed * speed * (0.32 + seed * 0.9) + seed * zRange) % zRange;
    values[offset + 2] = zMax - traveled;
  }
  position.needsUpdate = true;
  if (points.material) {
    points.material.opacity = appear * (0.16 + bands.energy * 0.54 + bands.high * 0.18);
    points.material.size = 0.018 + bands.high * 0.028 + bands.energy * 0.018;
  }
}

function createCenterMusicVisualizer(camera, renderer) {
  const root = new THREE.Group();
  root.name = "centerMusicVisualizer";
  root.position.copy(CENTER_VISUALIZER_POSITION);
  root.visible = false;
  root.userData.activeBlend = 0;
  root.userData.modeWeights = { anomaly: 1 };

  root.add(createCenterAnomalyVisualizer());

  const coreLight = new THREE.PointLight(0x8ef7ff, 0, 4.8, 1.55);
  coreLight.name = "centerVisualizerCoreLight";
  coreLight.position.set(0, 0.55, 0);
  root.add(coreLight);

  const magentaLight = new THREE.PointLight(0xff4df0, 0, 4.2, 1.8);
  magentaLight.name = "centerVisualizerMagentaLight";
  magentaLight.position.set(-0.8, 0.34, -0.5);
  root.add(magentaLight);

  const goldLight = new THREE.PointLight(0xf6c96d, 0, 4.4, 1.7);
  goldLight.name = "centerVisualizerGoldLight";
  goldLight.position.set(0.82, 0.38, 0.55);
  root.add(goldLight);

  root.traverse((child) => {
    child.renderOrder = 4;
  });
  return root;
}

function createCenterAnomalyVisualizer() {
  const group = new THREE.Group();
  group.name = "centerVisualizerAnomaly";

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 4), createAnomalyShaderMaterial());
  core.name = "centerAnomalyCore";
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 56, 32),
    new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    })
  );
  glow.name = "centerAnomalyGlow";
  group.add(glow);

  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 48, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff6df2,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  glass.name = "centerAnomalyWireShell";
  group.add(glass);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.01, 8, 160),
    new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  baseRing.name = "centerAnomalyBaseRing";
  baseRing.rotation.x = Math.PI / 2;
  group.add(baseRing);

  for (let index = 0; index < 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2;
    const material = new THREE.MeshBasicMaterial({
      color: index % 3 === 0 ? 0xf6c96d : index % 3 === 1 ? 0x00f3ff : 0xff6df2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.018), material);
    bar.name = "centerAnomalyBar";
    bar.userData.baseAngle = angle;
    bar.userData.phase = index * 0.31;
    bar.position.set(Math.cos(angle) * 1.08, 0.02, Math.sin(angle) * 1.08);
    bar.rotation.y = -angle;
    group.add(bar);
  }

  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const bolt = new THREE.Line(
      createElectricBoltGeometry(9),
      new THREE.LineBasicMaterial({
        color: index % 2 ? 0xff6df2 : 0x8ef7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    bolt.name = "centerAnomalyBolt";
    bolt.userData.baseAngle = angle;
    bolt.userData.phase = index * 0.83;
    bolt.userData.radiusStart = 0.26;
    bolt.userData.radiusEnd = 0.98 + (index % 3) * 0.08;
    group.add(bolt);
  }

  return group;
}

function createAnomalyShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      energy: { value: 0 },
      low: { value: 0 },
      mid: { value: 0 },
      high: { value: 0 },
      opacity: { value: 0 }
    },
    vertexShader: `
      uniform float time;
      uniform float energy;
      uniform float low;
      uniform float mid;
      uniform float high;
      varying float vSignal;
      varying vec3 vNormalPulse;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * 8.0 + time * 2.1) + cos(p.y * 9.0 - time * 1.7) + sin(p.z * 7.0 + time * 2.8);
        float pulse = 0.035 + energy * 0.22 + low * 0.08 + high * 0.055;
        p += normal * wave * pulse;
        vSignal = clamp(energy + abs(wave) * 0.12 + mid * 0.5, 0.0, 1.0);
        vNormalPulse = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform float high;
      varying float vSignal;
      varying vec3 vNormalPulse;
      void main() {
        vec3 cyan = vec3(0.0, 0.95, 1.0);
        vec3 rose = vec3(1.0, 0.18, 0.9);
        vec3 gold = vec3(1.0, 0.78, 0.35);
        vec3 color = mix(cyan, rose, vSignal);
        color = mix(color, gold, high * 0.55 + abs(vNormalPulse.y) * 0.18);
        gl_FragColor = vec4(color, opacity * (0.45 + vSignal * 0.9));
      }
    `,
    wireframe: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createCenterParticleVisualizer() {
  const group = new THREE.Group();
  group.name = "centerVisualizerParticles";
  group.visible = false;

  const floor = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.68, 96),
    new THREE.MeshBasicMaterial({
      color: 0xf6c96d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  floor.name = "centerParticleFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  group.add(floor);

  const carrier = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.006, 8, 96),
    new THREE.MeshBasicMaterial({
      color: 0xff6df2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  carrier.name = "centerParticleCarrier";
  carrier.rotation.x = Math.PI / 2;
  group.add(carrier);

  const points = new THREE.Points(createCenterParticleGeometry(520), createCenterParticleMaterial());
  points.name = "centerParticleCloud";
  points.position.y = 0.02;
  group.add(points);

  return group;
}

function createCenterParticleGeometry(count = 520) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const palette = [
    new THREE.Color(0x00f3ff),
    new THREE.Color(0xff6df2),
    new THREE.Color(0xf6c96d),
    new THREE.Color(0x9d74ff)
  ];
  for (let index = 0; index < count; index += 1) {
    const height = Math.pow(Math.random(), 1.42);
    const taper = Math.pow(1 - height, 1.18);
    const radius = (0.035 + Math.random() * 0.24) * taper + Math.random() * 0.018;
    const angle = Math.random() * Math.PI * 2;
    const y = -0.04 + height * (0.88 + Math.random() * 0.24);
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
    const color = palette[index % palette.length].clone().lerp(new THREE.Color(0xf6c96d), Math.random() * 0.38);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    seeds[index] = Math.random();
    sizes[index] = 0.44 + Math.random() * 1.25;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aFlameColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  return geometry;
}

function createCenterParticleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      energy: { value: 0 },
      low: { value: 0 },
      mid: { value: 0 },
      high: { value: 0 },
      opacity: { value: 0 }
    },
    vertexShader: `
      uniform float time;
      uniform float energy;
      uniform float low;
      uniform float mid;
      uniform float high;
      uniform float opacity;
      attribute float aSeed;
      attribute float aSize;
      attribute vec3 aFlameColor;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHeat;
      void main() {
        vec3 p = position;
        float height = clamp((p.y + 0.06) / 1.18, 0.0, 1.0);
        float radius = length(p.xz);
        float angle = atan(p.z, p.x);
        float flicker = sin(time * (4.4 + aSeed * 4.8) + aSeed * 31.0);
        flicker += sin(time * (9.0 + aSeed * 5.0) + aSeed * 19.0) * 0.34;
        float drift = time * (0.08 + high * 0.28) + aSeed * 6.28318;
        float twist = sin(time * 0.76 + height * 5.6 + aSeed * 12.0) * (0.08 + high * 0.22);
        radius *= 0.82 + low * 0.18 + flicker * (0.018 + energy * 0.035);
        vec2 sway = vec2(cos(drift * 1.7), sin(drift * 1.25)) * height * (0.022 + energy * 0.052 + high * 0.035);
        p.x = cos(angle + drift * 0.06 + twist) * radius + sway.x;
        p.z = sin(angle + drift * 0.06 + twist) * radius + sway.y;
        p.y += flicker * (0.018 + energy * 0.052) + energy * height * 0.16 + low * (1.0 - height) * 0.05;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (0.72 + energy * 1.65 + high * 0.72 + (1.0 - height) * 0.28) * (74.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
        vHeat = clamp(height + high * 0.28 + mid * 0.12, 0.0, 1.0);
        vColor = aFlameColor;
        vAlpha = opacity * (0.055 + energy * 0.24 + low * 0.08 + high * 0.05) * (1.1 - height * 0.36);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHeat;
      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        float alpha = smoothstep(0.5, 0.05, dist) * vAlpha;
        vec3 ember = vec3(1.0, 0.36, 0.08);
        vec3 rose = vec3(1.0, 0.1, 0.74);
        vec3 cyan = vec3(0.18, 0.92, 1.0);
        vec3 flame = mix(ember, rose, smoothstep(0.24, 0.82, vHeat));
        flame = mix(flame, cyan, smoothstep(0.68, 1.0, vHeat) * 0.48);
        flame = mix(flame, vColor, 0.18);
        gl_FragColor = vec4(flame, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending
  });
}

function createCenterNebulaVisualizer(camera, renderer) {
  const group = new THREE.Group();
  group.name = "centerVisualizerNebula";
  group.visible = false;
  group.userData.weight = 0;

  const texture = createNebulaGlowTexture();
  const system = new NebulaSystem(760);
  const spriteRenderer = new NebulaSpriteRenderer(group, THREE);
  const screenZone = new NebulaScreenZone(camera, renderer, 140);
  const emitterConfigs = [
    {
      phase: 0,
      laneRadius: 0.12,
      colorA: "#f6c96d",
      colorB: "#ff4df0",
      velocity: [0.16, 0.42],
      theta: 34,
      rateCount: [1, 2],
      rateTime: [0.082, 0.16],
      direction: [0.03, 1, 0.02],
      scaleEnd: 2.35
    }
  ];
  const emitters = emitterConfigs.map((config) => createCenterNebulaEmitter(config, texture, screenZone));
  emitters.forEach((emitter) => system.addEmitter(emitter));
  system.addRenderer(spriteRenderer);
  system.emit({});

  const floorGlow = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.72, 120),
    new THREE.MeshBasicMaterial({
      color: 0x8ef7ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  floorGlow.name = "centerNebulaFloorGlow";
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.y = -0.105;
  group.add(floorGlow);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.007, 8, 112),
    new THREE.MeshBasicMaterial({
      color: 0xff5cf2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  halo.name = "centerNebulaHalo";
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.38, 1.18, 48, 1, true),
    new THREE.MeshBasicMaterial({
      map: createNebulaColumnTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  column.name = "centerNebulaLightColumn";
  column.position.y = 0.34;
  group.add(column);

  const cyanLight = new THREE.PointLight(0x00f3ff, 0, 2.8, 1.35);
  cyanLight.name = "centerNebulaCyanLight";
  cyanLight.position.set(-0.18, 0.42, 0.1);
  const roseLight = new THREE.PointLight(0xff4df0, 0, 2.7, 1.42);
  roseLight.name = "centerNebulaRoseLight";
  roseLight.position.set(0.2, 0.5, -0.08);
  const goldLight = new THREE.PointLight(0xf6c96d, 0, 2.6, 1.45);
  goldLight.name = "centerNebulaGoldLight";
  goldLight.position.set(0.04, 0.3, 0.22);
  group.add(cyanLight, roseLight, goldLight);

  group.userData.system = system;
  group.userData.spriteRenderer = spriteRenderer;
  group.userData.emitters = emitters;
  group.userData.spriteTexture = texture;
  return group;
}

function createCenterNebulaEmitter(config, texture, screenZone) {
  const emitter = new NebulaEmitter();
  const sprite = createNebulaSprite(texture, config.colorA);
  emitter
    .setRate(new NebulaRate(new NebulaSpan(config.rateCount[0], config.rateCount[1]), new NebulaSpan(config.rateTime[0], config.rateTime[1])))
    .setInitializers([
      new NebulaBody(sprite),
      new NebulaMass(1),
      new NebulaRadius(0.018, 0.052),
      new NebulaLife(0.74, 1.48),
      new NebulaRadialVelocity(
        new NebulaSpan(config.velocity[0], config.velocity[1]),
        new NebulaVector3D(config.direction[0], config.direction[1], config.direction[2]),
        config.theta
      )
    ])
    .setBehaviours([
      new NebulaAlpha(0.34, 0),
      new NebulaScale(0.22, config.scaleEnd),
      new NebulaColor(config.colorA, config.colorB),
      new NebulaCrossZone(screenZone, "dead")
    ])
    .setPosition({ x: 0, y: 0.1, z: 0 });
  emitter.damping = 0.012;
  emitter.userData = { ...config };
  return emitter;
}

function createNebulaSprite(texture, color = "#00f3ff") {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 7;
  return sprite;
}

function createNebulaGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.12, "rgba(255,255,255,0.92)");
  glow.addColorStop(0.28, "rgba(160,250,255,0.58)");
  glow.addColorStop(0.56, "rgba(255,70,240,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNebulaColumnTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const beam = ctx.createLinearGradient(0, 0, 512, 0);
  beam.addColorStop(0, "rgba(0,0,0,0)");
  beam.addColorStop(0.16, "rgba(0,243,255,0.16)");
  beam.addColorStop(0.5, "rgba(255,255,255,0.28)");
  beam.addColorStop(0.84, "rgba(255,0,255,0.16)");
  beam.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  for (let x = 42; x < 512; x += 68) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 44, 512);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function disposeCenterNebulaVisualizer(group) {
  if (!group) return;
  const system = group.userData.system;
  const emitters = group.userData.emitters || [];
  emitters.forEach((emitter) => {
    emitter.stopEmit?.();
    emitter.removeAllParticles?.();
  });
  if (system) {
    system.canUpdate = false;
    system.emitters?.length && (system.emitters.length = 0);
    system.renderers?.length && (system.renderers.length = 0);
  }
  if (group.userData.spriteTexture) group.userData.spriteTexture.dispose();
}

function updateCenterMusicVisualizer(root, elapsed, bands = {}, mode = "anomaly", active = false) {
  if (!root) return;
  const energy = THREE.MathUtils.clamp(bands.energy || 0, 0, 1);
  const low = THREE.MathUtils.clamp(bands.low || energy * 0.8, 0, 1);
  const mid = THREE.MathUtils.clamp(bands.mid || energy * 0.72, 0, 1);
  const high = THREE.MathUtils.clamp(bands.high || energy * 0.62, 0, 1);
  const beat = (Math.sin(elapsed * 5.2) + 1) * 0.5;
  const target = active ? 1 : 0;
  root.userData.activeBlend = THREE.MathUtils.lerp(root.userData.activeBlend || 0, target, active ? 0.08 : 0.055);
  const appear = root.userData.activeBlend || 0;
  root.visible = appear > 0.012;
  if (!root.visible) return;

  const weights = root.userData.modeWeights || { anomaly: 1 };
  weights.anomaly = THREE.MathUtils.lerp(weights.anomaly ?? 1, 1, 0.13);
  root.userData.modeWeights = weights;
  const anomalyWeight = appear * weights.anomaly;
  const signal = appear * Math.max(energy, active ? 0.1 + beat * 0.07 : 0);

  root.position.y = CENTER_VISUALIZER_POSITION.y + signal * 0.22 + Math.sin(elapsed * 1.25) * 0.018 * appear;
  root.rotation.y = elapsed * 0.09 + high * 0.16;

  updateCenterAnomalyVisualizer(root.getObjectByName("centerVisualizerAnomaly"), elapsed, { energy, low, mid, high, beat }, anomalyWeight, active);

  const coreLight = root.getObjectByName("centerVisualizerCoreLight");
  if (coreLight) {
    coreLight.intensity = anomalyWeight * (0.5 + signal * 18 + low * 3.2);
    coreLight.distance = 2.2 + signal * 1.6 + anomalyWeight * 1.8;
  }
  const magentaLight = root.getObjectByName("centerVisualizerMagentaLight");
  if (magentaLight) {
    magentaLight.intensity = anomalyWeight * (signal * 10 + mid * 2.8 + beat * 0.5);
  }
  const goldLight = root.getObjectByName("centerVisualizerGoldLight");
  if (goldLight) {
    goldLight.intensity = anomalyWeight * (signal * 9 + high * 3.4 + (1 - beat) * 0.42);
  }
}

function updateCenterAnomalyVisualizer(group, elapsed, bands, weight, active) {
  if (!group) return;
  group.visible = weight > 0.012;
  if (!group.visible) return;
  const { energy, low, mid, high, beat } = bands;
  const signal = Math.max(energy, 0.1 + beat * 0.06);
  group.rotation.y = elapsed * (0.18 + high * 0.28);
  group.rotation.x = Math.sin(elapsed * 0.36) * 0.08;
  const core = group.getObjectByName("centerAnomalyCore");
  if (core?.material?.uniforms) {
    core.material.uniforms.time.value = elapsed;
    core.material.uniforms.energy.value = signal;
    core.material.uniforms.low.value = low;
    core.material.uniforms.mid.value = mid;
    core.material.uniforms.high.value = high;
    core.material.uniforms.opacity.value = weight * (0.44 + signal * 0.72);
    core.scale.setScalar(1 + signal * 0.24 + low * 0.06);
  }
  const glow = group.getObjectByName("centerAnomalyGlow");
  if (glow) {
    glow.scale.setScalar(1 + signal * 0.32 + beat * 0.04);
    glow.material.opacity = weight * (0.08 + signal * 0.28);
  }
  const shell = group.getObjectByName("centerAnomalyWireShell");
  if (shell) {
    shell.rotation.y = -elapsed * (0.22 + high * 0.4);
    shell.rotation.z = Math.sin(elapsed * 0.7) * 0.2;
    shell.scale.setScalar(1 + mid * 0.2);
    shell.material.opacity = weight * (0.1 + mid * 0.42);
  }
  const baseRing = group.getObjectByName("centerAnomalyBaseRing");
  if (baseRing) {
    baseRing.rotation.z = elapsed * (0.2 + high * 0.36);
    baseRing.scale.setScalar(1 + signal * 0.28);
    baseRing.material.opacity = weight * (0.15 + signal * 0.62);
  }
  group.children.forEach((child) => {
    if (child.name === "centerAnomalyBar") {
      const wave = (Math.sin(elapsed * 5.6 + child.userData.phase) + 1) * 0.5;
      const height = 0.18 + signal * 0.9 + low * 0.34 + wave * (0.12 + high * 0.2);
      child.scale.set(1, height, 1);
      child.position.y = -0.04 + height * 0.08;
      child.material.opacity = weight * (0.18 + signal * 0.68 + wave * 0.1);
      return;
    }
    if (child.name === "centerAnomalyBolt") {
      updateElectricBolt(child, elapsed, signal, active, weight);
    }
  });
}

function updateCenterParticleVisualizer(group, elapsed, bands, weight) {
  if (!group) return;
  group.visible = weight > 0.012;
  if (!group.visible) return;
  const { energy, low, mid, high, beat } = bands;
  const signal = Math.max(energy, 0.018 + beat * 0.022);
  group.rotation.y = -elapsed * (0.035 + high * 0.08);
  group.scale.setScalar(0.94 + low * 0.08 + signal * 0.08);
  const floor = group.getObjectByName("centerParticleFloor");
  if (floor) {
    floor.scale.setScalar(0.92 + low * 0.16 + signal * 0.08 + beat * 0.018);
    floor.rotation.z = elapsed * (0.035 + high * 0.045);
    floor.material.opacity = weight * (0.018 + signal * 0.075 + mid * 0.018);
  }
  const carrier = group.getObjectByName("centerParticleCarrier");
  if (carrier) {
    carrier.scale.setScalar(0.88 + signal * 0.16 + low * 0.04);
    carrier.rotation.z = elapsed * (0.11 + high * 0.12);
    carrier.material.opacity = weight * (0.035 + signal * 0.12);
  }
  const verticalCarrier = group.getObjectByName("centerParticleVerticalCarrier");
  if (verticalCarrier) {
    verticalCarrier.rotation.y = elapsed * (0.16 + mid * 0.3);
    verticalCarrier.rotation.z = Math.PI / 2 + Math.sin(elapsed * 0.7) * 0.16;
    verticalCarrier.scale.setScalar(1 + mid * 0.24);
    verticalCarrier.material.opacity = weight * (0.12 + high * 0.42);
  }
  const cloud = group.getObjectByName("centerParticleCloud");
  if (cloud?.material?.uniforms) {
    cloud.material.uniforms.time.value = elapsed;
    cloud.material.uniforms.energy.value = signal;
    cloud.material.uniforms.low.value = low;
    cloud.material.uniforms.mid.value = mid;
    cloud.material.uniforms.high.value = high;
    cloud.material.uniforms.opacity.value = weight * (0.72 + beat * 0.04);
  }
}

function updateCenterNebulaVisualizer(group, elapsed, bands, weight, active) {
  if (!group) return;
  const nextWeight = THREE.MathUtils.lerp(group.userData.weight || 0, weight, weight > 0.02 ? 0.16 : 0.08);
  group.userData.weight = nextWeight;
  group.visible = nextWeight > 0.012;
  const system = group.userData.system;
  const emitters = group.userData.emitters || [];
  if (!group.visible) {
    emitters.forEach((emitter) => emitter.stopEmit?.());
    return;
  }

  const { energy, low, mid, high, beat } = bands;
  const signal = Math.max(energy, active ? 0.035 + beat * 0.035 : 0.01);
  const breathing = (Math.sin(elapsed * 2.7) + 1) * 0.5;
  const shouldEmit = nextWeight > 0.05;
  emitters.forEach((emitter, index) => {
    const config = emitter.userData || {};
    if (shouldEmit && !emitter.isEmitting) emitter.emit();
    if (!shouldEmit && emitter.isEmitting) emitter.stopEmit?.();
    const orbitSpeed = 0.16 + index * 0.04 + high * 0.08;
    const angle = elapsed * orbitSpeed + (config.phase || 0);
    const laneRadius = (config.laneRadius || 0.12) + signal * (0.045 + index * 0.012) + Math.sin(elapsed * 1.4 + index) * 0.018;
    emitter.setPosition({
      x: Math.cos(angle) * laneRadius,
      y: 0.1 + signal * 0.2 + Math.sin(elapsed * 2.1 + index) * 0.035,
      z: Math.sin(angle) * laneRadius
    });
    emitter.rotation.set(
      Math.sin(elapsed * 0.7 + index) * 0.22,
      angle + Math.PI * 0.5,
      Math.cos(elapsed * 0.62 + index) * 0.18
    );
  });

  system?.update?.(0.014 + signal * 0.01);
  group.rotation.y = -elapsed * (0.045 + high * 0.08);
  group.scale.setScalar(0.9 + signal * 0.08);

  const floor = group.getObjectByName("centerNebulaFloorGlow");
  if (floor) {
    floor.rotation.z = elapsed * (0.18 + high * 0.28);
    floor.scale.setScalar(0.92 + signal * 0.12 + low * 0.08);
    floor.material.opacity = nextWeight * (0.035 + signal * 0.09 + breathing * 0.018);
  }
  const halo = group.getObjectByName("centerNebulaHalo");
  if (halo) {
    halo.rotation.z = -elapsed * (0.16 + high * 0.18);
    halo.rotation.y = Math.sin(elapsed * 0.6) * 0.08;
    halo.scale.setScalar(0.92 + signal * 0.14 + mid * 0.06);
    halo.material.opacity = nextWeight * (0.045 + signal * 0.13);
  }
  const column = group.getObjectByName("centerNebulaLightColumn");
  if (column) {
    column.rotation.y = elapsed * (0.1 + high * 0.24);
    column.scale.set(0.86 + low * 0.06, 0.92 + signal * 0.22, 0.86 + low * 0.06);
    column.material.opacity = nextWeight * (0.035 + signal * 0.12 + beat * 0.018);
    if (column.material.map) {
      column.material.map.offset.y = elapsed * -0.045;
      column.material.map.offset.x = Math.sin(elapsed * 0.35) * 0.08;
    }
  }

  const cyanLight = group.getObjectByName("centerNebulaCyanLight");
  if (cyanLight) {
    cyanLight.intensity = nextWeight * (0.35 + low * 2.1 + signal * 2.8 + beat * 0.28);
    cyanLight.distance = 1.9 + signal * 0.8;
    cyanLight.position.x = Math.cos(elapsed * 0.9) * (0.14 + low * 0.08);
    cyanLight.position.z = Math.sin(elapsed * 0.9) * (0.14 + low * 0.08);
  }
  const roseLight = group.getObjectByName("centerNebulaRoseLight");
  if (roseLight) {
    roseLight.intensity = nextWeight * (0.25 + mid * 1.8 + signal * 2.2 + breathing * 0.24);
    roseLight.distance = 1.8 + signal * 0.72;
    roseLight.position.x = Math.cos(elapsed * 0.72 + Math.PI * 1.2) * (0.18 + mid * 0.08);
    roseLight.position.z = Math.sin(elapsed * 0.72 + Math.PI * 1.2) * (0.18 + mid * 0.08);
  }
  const goldLight = group.getObjectByName("centerNebulaGoldLight");
  if (goldLight) {
    goldLight.intensity = nextWeight * (0.32 + high * 1.7 + beat * 0.62 + signal * 1.8);
    goldLight.distance = 1.75 + high * 0.86;
    goldLight.position.y = 0.28 + high * 0.16 + beat * 0.05;
  }
}

function createSlotMarker(resources, index) {
  const root = new THREE.Group();
  root.name = `spreadSlot${index}`;
  const material = new THREE.MeshBasicMaterial({ map: createSlotTexture(index), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH * 1.08, CARD_HEIGHT * 1.08), material);
  marker.rotation.x = -Math.PI / 2;
  root.add(marker);
  const ring = new THREE.Mesh(resources.cardHaloGeometry, resources.cardHaloMaterial.clone());
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(0.98);
  root.add(ring);
  root.userData.refs = { marker, ring };
  return root;
}

function addLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xd9fbff, 0x352033, 2.55);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xb8f7ff, TAROT_FULL_SCENE_LIGHTS_ENABLED ? 1.25 : 1.65);
  fill.position.set(3.8, 3.4, 4.2);
  scene.add(fill);
  const tableGlow = new THREE.PointLight(0x8ef7ff, TAROT_FULL_SCENE_LIGHTS_ENABLED ? 14 : 6.5, 5.6);
  tableGlow.position.set(-0.95, 1.1, 0.55);
  scene.add(tableGlow);
  if (!TAROT_FULL_SCENE_LIGHTS_ENABLED) return;
  const key = new THREE.SpotLight(0xfff4df, 620, 16, Math.PI * 0.25, 0.52, 1.45);
  key.position.set(-2.4, 6.8, 3.8);
  key.target.position.set(0, 0, -0.3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.00008;
  scene.add(key, key.target);
  const dawn = new THREE.DirectionalLight(0xffd49a, 1.05);
  dawn.position.set(0.4, 2.8, -4.8);
  const rim = new THREE.PointLight(0xff6df2, 22, 10);
  rim.position.set(3.2, 2.05, -2.8);
  const cyan = new THREE.PointLight(0x5af8ff, 28, 9);
  cyan.position.set(-3.4, 1.55, -2.4);
  const gold = new THREE.PointLight(0xffd286, 34, 8.5);
  gold.position.set(2.25, 1.65, 2.25);
  scene.add(dawn, rim, cyan, gold);
}

function addDepthProps(world, resources) {
  const material = new THREE.MeshStandardMaterial({ color: 0x102235, roughness: 0.5, metalness: 0.32, emissive: 0x06313e, emissiveIntensity: 0.24 });
  const glyphMaterial = new THREE.MeshBasicMaterial({ color: 0x8ef7ff, transparent: true, opacity: 0.28 });
  const dummy = new THREE.Object3D();
  const pillarGeometry = new THREE.BoxGeometry(0.06, 1, 0.06);
  const pillars = new THREE.InstancedMesh(pillarGeometry, material, 18);
  pillars.name = "tarotDepthPillars";
  for (let i = 0; i < 18; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const height = 0.6 + (i % 4) * 0.12;
    dummy.position.set(side * (4.12 + (i % 3) * 0.22), 0.28, -2.42 + (i / 17) * 4.84);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    pillars.setMatrixAt(i, dummy.matrix);
  }
  pillars.instanceMatrix.needsUpdate = true;
  world.add(pillars);

  const glyphGeometry = new THREE.PlaneGeometry(0.14, 0.48);
  const glyphs = new THREE.InstancedMesh(glyphGeometry, glyphMaterial, 24);
  glyphs.name = "tarotDepthGlyphs";
  for (let i = 0; i < 24; i += 1) {
    dummy.position.set(-3.82 + (i % 12) * 0.69, 0.018, i < 12 ? -2.62 : 2.62);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    glyphs.setMatrixAt(i, dummy.matrix);
  }
  glyphs.instanceMatrix.needsUpdate = true;
  world.add(glyphs);
  void resources;
}

function addAmbientBackdrop(world) {
  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(13.4, 6.2),
    new THREE.MeshBasicMaterial({
      map: createHorizonGlowTexture(),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  horizon.name = "tarotAmbientHorizon";
  horizon.position.set(0, 1.72, -4.15);
  world.add(horizon);

  const tabletopGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(7.18, 4.48),
    new THREE.MeshBasicMaterial({
      map: createTableGlowTexture(),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  tabletopGlow.name = "tarotTabletopGlow";
  tabletopGlow.rotation.x = -Math.PI / 2;
  tabletopGlow.position.set(0, 0.045, 0);
  world.add(tabletopGlow);
}

function createHorizonGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "rgba(7, 20, 35, 0)");
  sky.addColorStop(0.38, "rgba(23, 72, 92, 0.82)");
  sky.addColorStop(0.72, "rgba(14, 39, 60, 0.62)");
  sky.addColorStop(1, "rgba(4, 9, 18, 0)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  const dawn = ctx.createRadialGradient(560, 336, 20, 560, 336, 520);
  dawn.addColorStop(0, "rgba(255, 216, 150, 0.58)");
  dawn.addColorStop(0.26, "rgba(120, 250, 255, 0.28)");
  dawn.addColorStop(0.58, "rgba(255, 109, 242, 0.2)");
  dawn.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = dawn;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = "rgba(183, 248, 255, 0.22)";
  for (let y = 230; y < 430; y += 32) {
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.bezierCurveTo(320, y - 28, 700, y + 28, 944, y - 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTableGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cyan = ctx.createRadialGradient(330, 336, 24, 330, 336, 310);
  cyan.addColorStop(0, "rgba(173, 255, 255, 0.52)");
  cyan.addColorStop(0.34, "rgba(0, 243, 255, 0.2)");
  cyan.addColorStop(1, "rgba(0, 243, 255, 0)");
  ctx.fillStyle = cyan;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rose = ctx.createRadialGradient(730, 370, 12, 730, 370, 340);
  rose.addColorStop(0, "rgba(255, 92, 242, 0.4)");
  rose.addColorStop(0.42, "rgba(255, 0, 255, 0.15)");
  rose.addColorStop(1, "rgba(255, 0, 255, 0)");
  ctx.fillStyle = rose;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gold = ctx.createRadialGradient(610, 620, 30, 610, 620, 380);
  gold.addColorStop(0, "rgba(255, 214, 139, 0.34)");
  gold.addColorStop(0.45, "rgba(246, 201, 109, 0.11)");
  gold.addColorStop(1, "rgba(246, 201, 109, 0)");
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTableTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
  gradient.addColorStop(0, "#1d3140");
  gradient.addColorStop(0.5, "#4a6370");
  gradient.addColorStop(1, "#152333");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < 2600; i += 1) {
    const shade = 120 + Math.floor(Math.random() * 90);
    ctx.fillStyle = `rgb(${shade},${shade + 8},${shade + 18})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 512, 1, 1);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(246, 201, 109, 0.24)";
  for (let x = 0; x < 1024; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 80, 512);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1);
  return texture;
}

function createBoardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a1d2d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const radial = ctx.createRadialGradient(512, 360, 50, 512, 360, 540);
  radial.addColorStop(0, "rgba(173,255,255,.34)");
  radial.addColorStop(0.34, "rgba(0,243,255,.2)");
  radial.addColorStop(0.66, "rgba(157,116,255,.15)");
  radial.addColorStop(1, "rgba(7,18,31,.78)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const warm = ctx.createRadialGradient(735, 620, 20, 735, 620, 420);
  warm.addColorStop(0, "rgba(246,201,109,.24)");
  warm.addColorStop(1, "rgba(246,201,109,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(141,248,255,.28)";
  ctx.lineWidth = 2;
  for (let x = 80; x < 1000; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 48);
    ctx.lineTo(x, 720);
    ctx.stroke();
  }
  for (let y = 72; y < 740; y += 96) {
    ctx.beginPath();
    ctx.moveTo(52, y);
    ctx.lineTo(972, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,218,150,.58)";
  ctx.lineWidth = 4;
  ctx.strokeRect(42, 42, 940, 684);
  ctx.strokeStyle = "rgba(255,92,242,.26)";
  for (let r = 110; r < 380; r += 80) {
    ctx.beginPath();
    ctx.ellipse(512, 384, r * 1.22, r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCardBackTexture(style = CARD_BACK_STYLES[0]) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 512, 768);
  gradient.addColorStop(0, style.id === "protocol" ? "#241807" : style.id === "node" ? "#071f1b" : "#26092f");
  gradient.addColorStop(0.48, "#071c2c");
  gradient.addColorStop(1, "#09040c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 768);
  ctx.strokeStyle = "#f6c96d";
  ctx.lineWidth = 8;
  ctx.strokeRect(28, 28, 456, 712);
  ctx.strokeStyle = hexToRgba(style.accent, 0.62);
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.ellipse(256, 384, 60 + i * 22, 96 + i * 32, i * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba(style.accentB, 0.42);
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(256, 384, 132 + i * 28, 50 + i * 20, -0.55 + i * 0.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = hexToRgba(style.accentB, 0.24);
  ctx.beginPath();
  ctx.arc(256, 384, 132, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f8f3e7";
  ctx.font = "900 72px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(style.title || "HAPA", 256, 370);
  ctx.fillStyle = style.accent;
  ctx.font = "700 28px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(style.subtitle || "TAROT", 256, 414);
  ctx.fillStyle = hexToRgba(style.accent, 0.42);
  ctx.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("LOOP BACK", 256, 666);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSlotTexture(index) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 576;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(0,243,255,.72)";
  ctx.lineWidth = 5;
  ctx.strokeRect(16, 16, 352, 544);
  ctx.strokeStyle = "rgba(246,201,109,.48)";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, 312, 504);
  ctx.fillStyle = "rgba(0,243,255,.12)";
  ctx.fillRect(36, 36, 312, 504);
  ctx.fillStyle = "rgba(246,201,109,.72)";
  ctx.font = "900 54px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(String(index).padStart(2, "0"), 192, 304);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDropZoneTexture(options = {}) {
  const accent = options.accent || "#00f3ff";
  const secondary = options.secondary || "#ff6df2";
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(256, 256, 12, 256, 256, 256);
  glow.addColorStop(0, "rgba(246, 201, 109, 0.62)");
  glow.addColorStop(0.28, hexToRgba(accent, 0.42));
  glow.addColorStop(0.62, hexToRgba(secondary, 0.18));
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = hexToRgba(accent, 0.78);
  ctx.lineWidth = 6;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.ellipse(256, 256, 74 + i * 28, 38 + i * 17, i * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = hexToRgba(options.secondary || "#f6c96d", 0.74);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 216, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.font = "900 54px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(options.plus || "+", 256, 278);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDropZoneLabelTexture(options = {}) {
  const accent = options.accent || "#00f3ff";
  const label = options.label || "DROP ZONE";
  const subtitle = options.subtitle || "MAGNETIC PREVIEW";
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(2, 6, 23, 0.74)";
  ctx.fillRect(10, 18, 492, 92);
  ctx.strokeStyle = hexToRgba(accent, 0.72);
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 22, 484, 84);
  ctx.fillStyle = accent;
  ctx.font = "800 34px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  fitText(ctx, label, 256, 59, 420);
  ctx.fillStyle = "#f6c96d";
  ctx.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  fitText(ctx, subtitle, 256, 88, 420);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function lyricCrawlRotationXForAngle(angleDegrees = LYRIC_CRAWL_DEFAULT_ANGLE_DEGREES) {
  return THREE.MathUtils.degToRad(clampLyricCrawlAngleDegrees(angleDegrees) - 90);
}

function applyLyricCrawlAngle(root, angleDegrees = LYRIC_CRAWL_DEFAULT_ANGLE_DEGREES) {
  const clampedAngle = clampLyricCrawlAngleDegrees(angleDegrees);
  const rotationX = lyricCrawlRotationXForAngle(clampedAngle);
  const text = root?.getObjectByName?.("lyricCrawlText");
  const glow = root?.getObjectByName?.("lyricCrawlGlow");
  if (text) text.rotation.set(rotationX, 0, Math.PI);
  if (glow) glow.rotation.set(rotationX, 0, Math.PI);
  if (root) root.userData.angleDegrees = clampedAngle;
}

function createLyricCrawl({ angleDegrees = LYRIC_CRAWL_DEFAULT_ANGLE_DEGREES } = {}) {
  const root = new THREE.Group();
  root.name = "tarotLyricCrawl";
  root.position.copy(LYRIC_CRAWL_POSITION);
  root.renderOrder = LYRIC_CRAWL_RENDER_ORDER;
  root.visible = false;
  root.userData.activeBlend = 0;
  root.userData.songKey = "";
  root.userData.startedAt = 0;
  root.userData.scrollSeconds = LYRIC_CRAWL_FALLBACK_SECONDS;

  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(LYRIC_CRAWL_WIDTH, LYRIC_CRAWL_HEIGHT),
    createLyricCrawlMaterial()
  );
  text.name = "lyricCrawlText";
  text.renderOrder = LYRIC_CRAWL_RENDER_ORDER + 2;
  text.frustumCulled = false;
  root.add(text);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(LYRIC_CRAWL_WIDTH * 1.18, LYRIC_CRAWL_HEIGHT * 1.04),
    new THREE.MeshBasicMaterial({
      map: createLyricCrawlGlowTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  glow.name = "lyricCrawlGlow";
  glow.position.z = -0.018;
  glow.renderOrder = LYRIC_CRAWL_RENDER_ORDER + 1;
  glow.frustumCulled = false;
  root.add(glow);

  const light = new THREE.PointLight(0xf6c96d, 0, 6.2, 1.4);
  light.name = "lyricCrawlLight";
  light.position.set(0, 1.05, -0.36);
  root.add(light);

  applyLyricCrawlAngle(root, angleDegrees);
  return root;
}

function createLyricCrawlMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      crawlMap: { value: createTransparentCanvasTexture() },
      opacity: { value: 0 },
      uvOffsetY: { value: 0 },
      uvRepeatY: { value: 1 },
      energy: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D crawlMap;
      uniform float opacity;
      uniform float uvOffsetY;
      uniform float uvRepeatY;
      uniform float energy;
      varying vec2 vUv;
      void main() {
        float sampleY = 1.0 - (vUv.y * uvRepeatY + uvOffsetY);
        if (sampleY < 0.0 || sampleY > 1.0) discard;
        vec2 crawlUv = vec2(1.0 - vUv.x, sampleY);
        vec4 texel = texture2D(crawlMap, crawlUv);
        float glyphAlpha = smoothstep(0.02, 0.18, texel.a);
        if (glyphAlpha < 0.01) discard;
        float centerGlow = 1.0 + smoothstep(0.1, 0.58, texel.a) * (0.24 + energy * 0.16);
        gl_FragColor = vec4(texel.rgb * centerGlow, glyphAlpha * opacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending
  });
}

function createTransparentCanvasTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}

function createLyricCrawlGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const beam = ctx.createLinearGradient(0, 0, 0, canvas.height);
  beam.addColorStop(0, "rgba(0,0,0,0)");
  beam.addColorStop(0.2, "rgba(0,243,255,0.08)");
  beam.addColorStop(0.5, "rgba(246,201,109,0.15)");
  beam.addColorStop(0.78, "rgba(255,0,255,0.08)");
  beam.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const center = ctx.createRadialGradient(512, 560, 20, 512, 560, 520);
  center.addColorStop(0, "rgba(255,238,190,0.22)");
  center.addColorStop(0.4, "rgba(0,243,255,0.09)");
  center.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = center;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function setLyricCrawlSong(root, song, elapsed) {
  const text = root.getObjectByName("lyricCrawlText");
  const material = text?.material;
  if (!material?.uniforms) return;
  if (root.userData.texture) root.userData.texture.dispose();
  const payload = createLyricCrawlTexture(song);
  root.userData.texture = payload.texture;
  root.userData.songKey = lyricCrawlSongKey(song);
  root.userData.startedAt = elapsed;
  root.userData.scrollSeconds = payload.scrollSeconds;
  root.userData.uvRepeatY = payload.uvRepeatY;
  root.userData.timedLines = lyricCrawlTimedLinesForSong(song);
  material.uniforms.crawlMap.value = payload.texture;
  material.uniforms.uvRepeatY.value = payload.uvRepeatY;
  material.uniforms.uvOffsetY.value = 0;
  text.userData.disposableTexture = payload.texture;
}

function updateLyricCrawl(root, songState = {}, elapsed = 0, active = false, fallbackCard = null, options = {}) {
  if (!root) return;
  applyLyricCrawlAngle(root, options.angleDegrees);
  const fallbackSong = fallbackCard ? lyricCrawlFallbackSong(fallbackCard) : null;
  const song = songState.song || fallbackSong;
  const lyricsText = lyricCrawlDisplayTextForSong(song, fallbackCard);
  const enabled = Boolean(active && song && lyricsText);
  const crawlSong = enabled ? { ...song, lyricsText } : null;
  const key = crawlSong ? lyricCrawlSongKey(crawlSong) : "";
  if (crawlSong && key !== root.userData.songKey) setLyricCrawlSong(root, crawlSong, elapsed);

  const target = enabled ? 1 : 0;
  root.userData.activeBlend = THREE.MathUtils.lerp(root.userData.activeBlend || 0, target, enabled ? 0.08 : 0.12);
  const appear = root.userData.activeBlend || 0;
  root.visible = appear > 0.018;
  if (!root.visible) return;

  const material = root.getObjectByName("lyricCrawlText")?.material;
  const glow = root.getObjectByName("lyricCrawlGlow");
  const light = root.getObjectByName("lyricCrawlLight");
  const duration = Number(songState.duration || song?.duration || root.userData.scrollSeconds || LYRIC_CRAWL_FALLBACK_SECONDS);
  const songClock = Number(songState.currentTime || 0);
  const fallbackClock = elapsed - (root.userData.startedAt || elapsed);
  const clock = songClock > 0 ? songClock : fallbackClock;
  const progress = duration > 0 ? ((clock % duration) / duration) : 0;
  const repeatY = root.userData.uvRepeatY || 1;
  const offsetRange = Math.max(0, 1 - repeatY);
  const timedProgress = lyricCrawlProgressForClock(root.userData.timedLines, clock, duration);
  const energy = THREE.MathUtils.clamp(songState.energy || songState.bands?.energy || 0, 0, 1);

  root.position.y = LYRIC_CRAWL_POSITION.y + Math.sin(elapsed * 0.7) * 0.025 * appear + energy * 0.08;
  root.position.z = LYRIC_CRAWL_POSITION.z - energy * 0.08;
  root.rotation.y = Math.sin(elapsed * 0.28) * 0.025 * appear;
  if (material?.uniforms) {
    material.uniforms.opacity.value = THREE.MathUtils.clamp(appear * 1.35, 0, 1);
    material.uniforms.uvOffsetY.value = (Number.isFinite(timedProgress) ? timedProgress : progress) * offsetRange;
    material.uniforms.energy.value = energy;
  }
  if (glow) {
    glow.material.opacity = appear * (0.2 + energy * 0.2);
    glow.scale.setScalar(1 + energy * 0.05);
  }
  if (light) {
    light.intensity = appear * (3.2 + energy * 10);
    light.distance = 4 + energy * 1.8;
  }
}

function createLyricCrawlTexture(song = {}) {
  const lyrics = lyricCrawlDisplayTextForSong(song);
  const canvas = document.createElement("canvas");
  const width = 2048;
  const fontSize = lyrics.length > 2800 ? 45 : 54;
  const lineHeight = Math.round(fontSize * 1.34);
  const maxWidth = 1520;
  const scratch = document.createElement("canvas").getContext("2d");
  scratch.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  const lyricLines = wrapLyricCrawlLines(scratch, lyrics, maxWidth);
  const contentHeight = 720 + lyricLines.length * lineHeight + 820;
  const height = THREE.MathUtils.clamp(nextPowerOfTwo(contentHeight), 2048, 8192);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.shadowColor = "rgba(0, 243, 255, 0.85)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#00f3ff";
  ctx.font = "900 42px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("DROP SONG SIGNAL", width / 2, 180);

  ctx.shadowColor = "rgba(246, 201, 109, 0.96)";
  ctx.shadowBlur = 34;
  ctx.fillStyle = "#f6c96d";
  ctx.font = "900 86px Inter, system-ui, sans-serif";
  fitText(ctx, String(song.title || "Avatar Song").toUpperCase(), width / 2, 258, 1660);

  ctx.shadowColor = "rgba(255, 109, 242, 0.72)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#dffbff";
  ctx.font = "800 38px ui-monospace, SFMono-Regular, Menlo, monospace";
  const byline = [song.avatarName, song.sourceLabel].filter(Boolean).join(" / ");
  if (byline) fitText(ctx, byline.toUpperCase(), width / 2, 372, 1500);

  ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  let y = 610;
  lyricLines.forEach((line) => {
    if (!line) {
      y += Math.round(lineHeight * 0.62);
      return;
    }
    const isDirection = /^\(|^\[/.test(line);
    ctx.shadowColor = isDirection ? "rgba(0, 243, 255, 0.72)" : "rgba(246, 201, 109, 0.72)";
    ctx.shadowBlur = isDirection ? 18 : 22;
    ctx.fillStyle = isDirection ? "#9eefff" : "#fff1b8";
    ctx.font = `${isDirection ? "800" : "850"} ${isDirection ? Math.round(fontSize * 0.78) : fontSize}px Inter, system-ui, sans-serif`;
    fitText(ctx, line, width / 2, y, maxWidth);
    y += isDirection ? Math.round(lineHeight * 0.86) : lineHeight;
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return {
    texture,
    uvRepeatY: THREE.MathUtils.clamp(1800 / height, 0.14, 1),
    scrollSeconds: estimateLyricCrawlSeconds(song, lyricLines.length)
  };
}

function lyricCrawlTextForSong(song = {}) {
  const timedText = lyricCrawlTimedLinesForSong(song)
    .map((line) => line.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  if (timedText) return timedText;
  const text = String(song?.lyricsText || song?.lyrics?.text || "").trim();
  if (!text || /^lyrics are not attached/i.test(text)) return "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n");
}

function lyricCrawlDisplayTextForSong(song = {}, fallbackCard = null) {
  const lyrics = lyricCrawlTextForSong(song);
  if (lyrics) return lyrics;
  if (!song && !fallbackCard) return "";
  const title = song?.title || fallbackCard?.title || "Drop Zone Card";
  const contactNames = (fallbackCard?.avatarContacts || []).map((contact) => contact.name).filter(Boolean).slice(0, 3);
  return [
    "LYRIC SIGNAL UNAVAILABLE",
    "",
    `${title}`,
    contactNames.length ? `Linked avatar: ${contactNames.join(" / ")}` : "No linked avatar song lyrics were found for this card.",
    "",
    song?.audioUri ? "Audio is linked, but lyric text is not attached yet." : "Drop a card with an avatar song and attached lyrics to start the full crawl."
  ].join("\n");
}

function lyricCrawlFallbackSong(card = {}) {
  if (!card) return null;
  return {
    id: `fallback-${card.id || card.title || "card"}`,
    title: card.title || "Drop Zone Card",
    avatarName: (card.avatarContacts || []).map((contact) => contact.name).filter(Boolean).slice(0, 2).join(" / "),
    sourceLabel: "Lyrics pending",
    duration: LYRIC_CRAWL_FALLBACK_SECONDS,
    lyricsText: ""
  };
}

function lyricCrawlSongKey(song = {}) {
  const text = lyricCrawlDisplayTextForSong(song);
  const timedLines = lyricCrawlTimedLinesForSong(song);
  return [
    song.id,
    song.registryId,
    song.songId,
    song.cardId,
    song.lyricsSha256,
    timedLines.length ? `${timedLines.length}-${timedLines[0]?.start}-${timedLines.at(-1)?.end}` : "",
    hashString(text)
  ].filter(Boolean).join(":");
}

function lyricCrawlTimingPayloadForSong(song = {}) {
  const lyrics = song?.lyrics;
  return song?.lyricTiming ||
    song?.lyricTimings ||
    song?.lyricsTiming ||
    song?.timedLyrics ||
    song?.lyric_timing ||
    song?.lyric_timings ||
    (lyrics && typeof lyrics === "object" ? (lyrics.timing || lyrics.lyricTiming || lyrics.lyricTimings || lyrics.timedLines || lyrics.segments || lyrics.lines) : null) ||
    null;
}

function lyricCrawlTimedLinesForSong(song = {}) {
  const timing = lyricCrawlTimingPayloadForSong(song);
  const sourceLines = Array.isArray(timing)
    ? timing
    : Array.isArray(timing?.lines)
      ? timing.lines
      : Array.isArray(timing?.segments)
        ? timing.segments
        : Array.isArray(timing?.cues)
          ? timing.cues
          : Array.isArray(timing?.timedLines)
            ? timing.timedLines
          : [];
  if (!sourceLines.length) return [];
  const duration = lyricCrawlDurationForSong(song, timing);
  const preserveTiming = Boolean(timing?.trusted || timing?.source === "echos-director-project" || song.echoDirectorProjectId);
  const normalizedLines = sourceLines
    .map((line, index) => {
      const start = lyricCrawlSecondsForTime(line.start ?? line.startTime ?? line.time ?? line.timestampSeconds ?? line.timestamp);
      const rawEnd = lyricCrawlSecondsForTime(line.end ?? line.endTime ?? line.stop ?? line.stopTime);
      const duration = lyricCrawlSecondsForTime(line.duration);
      const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : Number.isFinite(duration) && duration > 0 ? start + duration : start + 2.8;
      return {
        index,
        section: line.section || line.label || "",
        text: cleanLyricCrawlTimedText(line.text || line.line || line.lyric || line.caption || ""),
        start,
        end,
        confidence: Number(line.confidence || timing?.confidence || 0)
      };
    })
    .filter((line) => line.text && Number.isFinite(line.start))
    .flatMap(splitLyricCrawlTimedLine)
    .sort((a, b) => a.start - b.start || a.index - b.index);
  return repairLyricCrawlTimeline(normalizedLines, duration, { preserveTiming });
}

function lyricCrawlDurationForSong(song = {}, timing = null) {
  const duration = Number(song.duration || song.audio?.duration || timing?.duration || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function cleanLyricCrawlTimedText(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/^(verse|chorus|pre[-\s]?chorus|bridge|intro|outro|hook|refrain|lyrics?)\s*\d*[:\-–—]?\s*$/i.test(text)) return "";
  if (/^(title|song title|lyrics?)\s*[:\-–—]\s*/i.test(text)) return "";
  return text;
}

function splitLyricCrawlTimedLine(line = {}) {
  const chunks = splitLyricCrawlTextChunks(line.text);
  if (chunks.length <= 1) return [line];
  const sourceDuration = Math.max(1.2, Number(line.end || 0) - Number(line.start || 0));
  const segmentDuration = sourceDuration / chunks.length;
  return chunks.map((text, index) => ({
    ...line,
    index: line.index + index / 100,
    text,
    start: line.start + segmentDuration * index,
    end: index === chunks.length - 1 ? line.end : line.start + segmentDuration * (index + 1)
  }));
}

function splitLyricCrawlTextChunks(text = "") {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  let current = [];
  for (const word of words) {
    const next = [...current, word];
    const nextText = next.join(" ");
    if (
      current.length &&
      (next.length > LYRIC_CRAWL_MAX_TIMED_LINE_WORDS || nextText.length > LYRIC_CRAWL_MAX_TIMED_LINE_CHARS)
    ) {
      chunks.push(current.join(" "));
      current = [word];
    } else {
      current = next;
    }
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks.flatMap((chunk) => {
    if (chunk.length <= LYRIC_CRAWL_MAX_TIMED_LINE_CHARS * 1.35) return [chunk];
    const parts = chunk.match(new RegExp(`.{1,${LYRIC_CRAWL_MAX_TIMED_LINE_CHARS}}(\\s|$)`, "g"));
    return parts?.map((part) => part.trim()).filter(Boolean) || [chunk];
  });
}

function repairLyricCrawlTimeline(lines = [], duration = 0, { preserveTiming = false } = {}) {
  if (!lines.length) return [];
  const repaired = lines
    .map((line, index) => ({
      ...line,
      index,
      start: Math.max(0, Number(line.start || 0)),
      end: Math.max(Number(line.end || 0), Number(line.start || 0) + 0.8)
    }))
    .sort((a, b) => a.start - b.start || a.index - b.index);

  for (let index = 0; index < repaired.length; index += 1) {
    const line = repaired[index];
    const previous = repaired[index - 1];
    const next = repaired[index + 1];
    if (previous && line.start < previous.start) line.start = previous.start;
    if (previous && line.start < previous.end - 0.2) line.start = Math.max(previous.start, previous.end - 0.2);
    const nextStart = Number(next?.start);
    const estimatedEnd = line.start + estimateTimedLineDuration(line.text);
    line.end = Math.max(line.end, estimatedEnd);
    if (Number.isFinite(nextStart) && nextStart > line.start) {
      line.end = Math.min(line.end, Math.max(line.start + 0.55, nextStart));
    }
  }

  if (duration > 8 && !preserveTiming) {
    const first = repaired[0];
    const last = repaired[repaired.length - 1];
    const targetEnd = Math.max(first.start + 1, duration - Math.min(LYRIC_CRAWL_END_PADDING_SECONDS, duration * 0.025));
    const sourceSpan = Math.max(1, last.end - first.start);
    const endsTooEarly = last.end < duration * LYRIC_CRAWL_EARLY_END_RATIO || duration - last.end > 18;
    const endsTooLate = last.end > duration * 1.08;
    if (endsTooEarly || endsTooLate) {
      const scale = (targetEnd - first.start) / sourceSpan;
      repaired.forEach((line) => {
        line.start = first.start + (line.start - first.start) * scale;
        line.end = first.start + (line.end - first.start) * scale;
      });
    }
    repaired[repaired.length - 1].end = Math.max(repaired[repaired.length - 1].end, targetEnd);
  }

  return repaired.map((line, index) => ({
    ...line,
    index,
    start: Number(line.start.toFixed(3)),
    end: Number(Math.max(line.end, line.start + 0.4).toFixed(3))
  }));
}

function estimateTimedLineDuration(text = "") {
  const wordCount = String(text || "").split(/\s+/).filter(Boolean).length;
  return THREE.MathUtils.clamp(1.6 + wordCount * 0.22, 2.1, 6.8);
}

function lyricCrawlSecondsForTime(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? (value > 10000 ? value / 1000 : value) : NaN;
  const text = String(value).trim();
  if (!text) return NaN;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return numeric > 10000 ? numeric / 1000 : numeric;
  }
  const parts = text.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function lyricCrawlProgressForClock(timedLines = [], clock = 0, duration = 0) {
  if (!timedLines.length || !Number.isFinite(clock)) return NaN;
  const first = timedLines[0];
  const last = timedLines[timedLines.length - 1];
  const timelineEnd = Math.max(Number(duration) || 0, last?.end || 0, last?.start || 0);
  const wrappedClock = timelineEnd > 0 ? clock % timelineEnd : clock;
  if (wrappedClock <= first.start) return 0;
  let activeIndex = timedLines.findIndex((line, index) => {
    const next = timedLines[index + 1];
    const end = Math.max(line.end || line.start + 2.8, next?.start || 0);
    return wrappedClock >= line.start && wrappedClock < end;
  });
  if (activeIndex < 0) activeIndex = timedLines.findLastIndex((line) => wrappedClock >= line.start);
  activeIndex = THREE.MathUtils.clamp(activeIndex, 0, timedLines.length - 1);
  const line = timedLines[activeIndex];
  const next = timedLines[activeIndex + 1];
  const end = Math.max(line.end || line.start + 2.8, next?.start || 0, line.start + 0.8);
  const local = THREE.MathUtils.clamp((wrappedClock - line.start) / Math.max(0.4, end - line.start), 0, 1);
  return THREE.MathUtils.clamp((activeIndex + local) / Math.max(1, timedLines.length - 1), 0, 1);
}

function estimateLyricCrawlSeconds(song = {}, lineCount = 0) {
  const timing = lyricCrawlTimingPayloadForSong(song);
  const timedLines = lyricCrawlTimedLinesForSong(song);
  const duration = Number(song.duration || timing?.duration || timedLines.at(-1)?.end || 0);
  if (Number.isFinite(duration) && duration > 8) return duration;
  return THREE.MathUtils.clamp(72 + lineCount * 1.75, 88, 220);
}

function wrapLyricCrawlLines(ctx, text = "", maxWidth = 1200) {
  const lines = [];
  String(text || "").split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      lines.push("");
      return;
    }
    const words = line.split(/\s+/).filter(Boolean);
    let current = "";
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });
    if (current) lines.push(current);
  });
  return lines;
}

function nextPowerOfTwo(value = 2048) {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

function hashString(value = "") {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function createSongLabelTexture(song = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "rgba(2, 6, 23, 0.84)");
  gradient.addColorStop(0.5, "rgba(10, 34, 50, 0.88)");
  gradient.addColorStop(1, "rgba(49, 18, 58, 0.82)");
  ctx.fillStyle = gradient;
  ctx.fillRect(18, 18, canvas.width - 36, canvas.height - 36);
  ctx.strokeStyle = song ? "rgba(246, 201, 109, 0.82)" : "rgba(0, 243, 255, 0.44)";
  ctx.lineWidth = 5;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
  ctx.fillStyle = song ? "#f6c96d" : "#00f3ff";
  ctx.font = "900 25px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText(song ? "DROP SONG SIGNAL" : "DROP SONG SIGNAL PENDING", 48, 62);
  ctx.fillStyle = "#f8f3e7";
  ctx.font = "900 36px Inter, system-ui, sans-serif";
  const title = song?.title || "No linked avatar song";
  ctx.fillText(trimCanvasText(ctx, title, 470), 48, 105);
  ctx.fillStyle = "#9eefff";
  ctx.font = "800 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  const source = song ? `${song.avatarName || "Avatar"} · ${song.sourceLabel || (song.audioUri ? "Audio linked" : "No audio match")}` : "Linked avatar has no matched full mix";
  ctx.fillText(trimCanvasText(ctx, source, 650), 48, 134);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function trimCanvasText(ctx, text = "", maxWidth = 200) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let next = value;
  while (next.length > 4 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}

function disposeResourceLibrary(resources) {
  Object.values(resources).forEach((resource) => {
    if (resource && typeof resource === "object" && !resource.dispose) {
      Object.values(resource).forEach((nested) => nested?.dispose?.());
      return;
    }
    if (resource?.dispose) resource.dispose();
  });
}

function disposeObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    if (child.geometry && !child.geometry.userData?.sharedResource) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material].filter(Boolean);
    materials.forEach((material) => {
      if (material.userData?.sharedResource) return;
      if (material.map) material.map.dispose();
      if (material.emissiveMap && material.emissiveMap !== material.map) material.emissiveMap.dispose();
      material.dispose?.();
    });
    if (child.userData?.disposableTexture) child.userData.disposableTexture.dispose();
  });
}

function createDropZoneSongPlayer(initialEnabled = false) {
  let enabled = Boolean(initialEnabled);
  let audioElement = null;
  let context = null;
  let source = null;
  let analyser = null;
  let gain = null;
  let frequencyData = null;
  let currentSong = null;
  let playing = false;
  let blocked = false;
  let pendingPlay = false;
  let lastEnergy = 0;
  let lastBands = { low: 0, mid: 0, high: 0, energy: 0 };
  const lastSpectrum = new Float32Array(HYPERSPACE_FREQUENCY_BINS);

  function ensureAudioElement() {
    if (audioElement) return audioElement;
    audioElement = document.createElement("audio");
    audioElement.crossOrigin = "anonymous";
    audioElement.loop = true;
    audioElement.preload = "auto";
    audioElement.volume = 0.78;
    audioElement.dataset.hapaTarotDropSong = "true";
    audioElement.setAttribute("aria-hidden", "true");
    audioElement.style.display = "none";
    document.body?.appendChild(audioElement);
    audioElement.addEventListener("play", () => {
      playing = true;
      blocked = false;
      pendingPlay = false;
    });
    audioElement.addEventListener("pause", () => {
      playing = false;
    });
    audioElement.addEventListener("ended", () => {
      playing = false;
    });
    audioElement.addEventListener("error", () => {
      playing = false;
      blocked = true;
    });
    return audioElement;
  }

  function ensureGraph() {
    if (!enabled) return null;
    const element = ensureAudioElement();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!context || context.state === "closed") context = new AudioContextClass();
    if (context.state === "suspended") context.resume().catch(() => {});
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.76;
      gain = context.createGain();
      gain.gain.value = 0.86;
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
    }
    if (!source) {
      try {
        source = context.createMediaElementSource(element);
        source.connect(analyser).connect(gain).connect(context.destination);
      } catch {
        blocked = true;
      }
    }
    return analyser;
  }

  function unlock() {
    if (!enabled) return;
    const element = ensureAudioElement();
    element.muted = false;
    ensureGraph();
    if (context?.state === "suspended") context.resume().catch(() => {});
  }

  function audioSourceMatches(element, uri) {
    if (!element?.src || !uri) return false;
    try {
      return new URL(element.src, window.location.href).href === new URL(uri, window.location.href).href;
    } catch {
      return element.src === uri;
    }
  }

  function play() {
    if (!enabled || !currentSong?.audioUri) return;
    const element = ensureAudioElement();
    pendingPlay = true;
    unlock();
    element.play()
      .then(() => {
        playing = true;
        blocked = false;
        pendingPlay = false;
      })
      .catch(() => {
        playing = false;
        blocked = true;
        pendingPlay = true;
      });
  }

  function pause() {
    if (audioElement) audioElement.pause();
    playing = false;
    pendingPlay = false;
  }

  function start(song = null) {
    currentSong = song?.audioUri || song?.title ? song : null;
    blocked = false;
    lastEnergy = 0;
    lastBands = { low: 0, mid: 0, high: 0, energy: 0 };
    fadeSpectrum(0);
    if (!currentSong?.audioUri) {
      pause();
      return;
    }
    const element = ensureAudioElement();
    if (!audioSourceMatches(element, currentSong.audioUri)) {
      element.pause();
      element.src = currentSong.audioUri;
      element.load();
    }
    pendingPlay = Boolean(enabled);
    play();
  }

  function stop() {
    pause();
    if (audioElement) {
      audioElement.removeAttribute("src");
      audioElement.load();
    }
    currentSong = null;
    blocked = false;
    pendingPlay = false;
    lastEnergy = 0;
    lastBands = { low: 0, mid: 0, high: 0, energy: 0 };
    fadeSpectrum(0);
  }

  function smoothBands(nextBands) {
    lastBands = {
      low: THREE.MathUtils.lerp(lastBands.low, nextBands.low, 0.36),
      mid: THREE.MathUtils.lerp(lastBands.mid, nextBands.mid, 0.36),
      high: THREE.MathUtils.lerp(lastBands.high, nextBands.high, 0.36),
      energy: THREE.MathUtils.lerp(lastBands.energy, nextBands.energy, 0.42)
    };
    lastEnergy = lastBands.energy;
    return { ...lastBands, spectrum: lastSpectrum };
  }

  function updateSpectrumFromFrequencyData() {
    if (!frequencyData?.length) {
      fadeSpectrum(0);
      return lastSpectrum;
    }
    for (let index = 0; index < HYPERSPACE_FREQUENCY_BINS; index += 1) {
      const ratio = HYPERSPACE_FREQUENCY_BINS <= 1 ? 0 : index / (HYPERSPACE_FREQUENCY_BINS - 1);
      const sourceIndex = Math.min(frequencyData.length - 1, Math.floor(ratio * (frequencyData.length - 1)));
      const target = THREE.MathUtils.clamp((frequencyData[sourceIndex] || 0) / 255, 0, 1);
      lastSpectrum[index] = THREE.MathUtils.lerp(lastSpectrum[index], target, 0.44);
    }
    return lastSpectrum;
  }

  function updateSyntheticSpectrum(energy = 0) {
    const t = performance.now() * 0.001;
    for (let index = 0; index < HYPERSPACE_FREQUENCY_BINS; index += 1) {
      const ratio = index / Math.max(1, HYPERSPACE_FREQUENCY_BINS - 1);
      const wave = (Math.sin(t * (2.2 + ratio * 5.6) + ratio * 18.0) + 1) * 0.5;
      const taper = Math.pow(1 - ratio * 0.68, 1.15);
      const target = THREE.MathUtils.clamp(energy * taper * (0.32 + wave * 0.68), 0, 1);
      lastSpectrum[index] = THREE.MathUtils.lerp(lastSpectrum[index], target, 0.2);
    }
    return lastSpectrum;
  }

  function fadeSpectrum(target = 0) {
    for (let index = 0; index < HYPERSPACE_FREQUENCY_BINS; index += 1) {
      lastSpectrum[index] = THREE.MathUtils.lerp(lastSpectrum[index], target, 0.18);
    }
    return lastSpectrum;
  }

  function averageRange(start, end) {
    if (!frequencyData || end <= start) return 0;
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += frequencyData[index] || 0;
    return THREE.MathUtils.clamp(sum / ((end - start) * 255), 0, 1);
  }

  function bands() {
    if (analyser && frequencyData && audioElement && !audioElement.paused) {
      analyser.getByteFrequencyData(frequencyData);
      updateSpectrumFromFrequencyData();
      const sum = frequencyData.reduce((total, value, index) => total + value * (index < 8 ? 1.35 : 1), 0);
      const next = THREE.MathUtils.clamp(sum / (frequencyData.length * 255), 0, 1);
      return smoothBands({
        low: averageRange(0, 8),
        mid: averageRange(8, 25),
        high: averageRange(25, frequencyData.length),
        energy: next
      });
    }
    if (currentSong) {
      const t = performance.now() * 0.001;
      const softPulse = 0.08 + (Math.sin(t * 4) + 1) * 0.035;
      updateSyntheticSpectrum(softPulse);
      return smoothBands({
        low: softPulse + (Math.sin(t * 1.7) + 1) * 0.025,
        mid: softPulse * 0.82 + (Math.sin(t * 2.8 + 1.2) + 1) * 0.018,
        high: softPulse * 0.62 + (Math.sin(t * 6.4 + 0.4) + 1) * 0.014,
        energy: softPulse
      });
    }
    fadeSpectrum(0);
    return smoothBands({ low: 0, mid: 0, high: 0, energy: 0 });
  }

  function energy() {
    return bands().energy;
  }

  function snapshot() {
    const duration = Number(audioElement?.duration || currentSong?.duration || 0);
    return {
      enabled,
      song: currentSong,
      title: currentSong?.title || "",
      avatarName: currentSong?.avatarName || "",
      audioUri: currentSong?.audioUri || "",
      lyricsText: currentSong?.lyricsText || "",
      lyricTiming: currentSong?.lyricTiming || currentSong?.lyricTimings || null,
      timedLyrics: currentSong?.timedLyrics || currentSong?.lyricTimings || null,
      echoDirectorProjectId: currentSong?.echoDirectorProjectId || "",
      currentTime: Number(audioElement?.currentTime || 0),
      duration: Number.isFinite(duration) ? duration : 0,
      playing,
      blocked,
      pendingPlay,
      hasSong: Boolean(currentSong),
      contextState: context?.state || "",
      mediaPaused: Boolean(audioElement?.paused),
      mediaMuted: Boolean(audioElement?.muted),
      mediaVolume: Number(audioElement?.volume ?? 0),
      mediaReadyState: Number(audioElement?.readyState || 0),
      mediaNetworkState: Number(audioElement?.networkState || 0),
      mediaErrorCode: Number(audioElement?.error?.code || 0),
      mediaSrc: audioElement?.currentSrc || audioElement?.src || "",
      energy: lastEnergy,
      bands: lastBands
    };
  }

  return {
    get state() {
      return {
        enabled,
        title: currentSong?.title || "",
        avatarName: currentSong?.avatarName || "",
        audioUri: currentSong?.audioUri || "",
        lyricsReady: Boolean(currentSong?.lyricsText),
        playing,
        blocked,
        pendingPlay,
        hasSong: Boolean(currentSong),
        contextState: context?.state || "",
        mediaPaused: Boolean(audioElement?.paused),
        mediaMuted: Boolean(audioElement?.muted),
        mediaReadyState: Number(audioElement?.readyState || 0),
        mediaNetworkState: Number(audioElement?.networkState || 0),
        mediaErrorCode: Number(audioElement?.error?.code || 0),
        mediaSrc: audioElement?.currentSrc || audioElement?.src || "",
        energy: lastEnergy,
        bands: lastBands
      };
    },
    setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      if (enabled) {
        unlock();
        play();
      } else {
        pause();
      }
    },
    start,
    unlock,
    play,
    pause,
    stop,
    bands,
    energy,
    snapshot,
    dispose() {
      stop();
      if (source) source.disconnect();
      if (analyser) analyser.disconnect();
      if (gain) gain.disconnect();
      if (context && context.state !== "closed") context.close().catch(() => {});
      source = null;
      analyser = null;
      gain = null;
      context = null;
      frequencyData = null;
      audioElement?.remove();
      audioElement = null;
    }
  };
}

function createTarotAudio(initialEnabled = false) {
  let enabled = Boolean(initialEnabled);
  let context = null;
  let events = 0;
  let lastHover = 0;
  let lastAngle = 0;
  let noiseBuffer = null;

  function getContext() {
    if (!enabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!context) context = new AudioContextClass();
    if (context.state === "suspended") context.resume().catch(() => {});
    return context;
  }

  function tone(ctx, frequency, start, duration, options = {}) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type || "sine";
    osc.frequency.setValueAtTime(frequency, start);
    if (options.to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, options.to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain || 0.05, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.04);
  }

  function noise(ctx, start, duration, options = {}) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = options.filter || "bandpass";
    filter.frequency.setValueAtTime(options.frequency || 900, start);
    filter.Q.setValueAtTime(options.q || 0.8, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain || 0.035, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(start);
    source.stop(start + duration + 0.04);
  }

  function play(kind, options = {}) {
    if (!enabled) return;
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === "hover" && now - lastHover < 0.18) return;
    if (kind === "angle" && now - lastAngle < 0.08) return;
    if (kind === "hover") lastHover = now;
    if (kind === "angle") lastAngle = now;
    events += 1;
    const gainScale = options.quiet ? 0.45 : 1;

    if (kind === "draw") {
      noise(ctx, now, 0.38, { gain: 0.035 * gainScale, frequency: 1200, q: 1.8 });
      tone(ctx, 142, now, 0.22, { type: "sawtooth", to: 360, gain: 0.035 * gainScale });
      tone(ctx, 728, now + 0.14, 0.34, { type: "triangle", to: 1120, gain: 0.045 * gainScale });
      return;
    }
    if (kind === "place") {
      tone(ctx, 88, now, 0.22, { type: "sine", to: 54, gain: 0.055 * gainScale });
      tone(ctx, 392, now + 0.035, 0.18, { type: "triangle", gain: 0.038 * gainScale });
      noise(ctx, now, 0.13, { gain: 0.025 * gainScale, frequency: 260, q: 0.7 });
      return;
    }
    if (kind === "lock") {
      tone(ctx, 154, now, 0.2, { type: "sine", to: 92, gain: 0.05 * gainScale });
      tone(ctx, 512, now + 0.045, 0.2, { type: "triangle", to: 768, gain: 0.036 * gainScale });
      tone(ctx, 1024, now + 0.12, 0.28, { type: "sine", gain: 0.024 * gainScale });
      noise(ctx, now, 0.24, { gain: 0.026 * gainScale, frequency: 520, q: 1.4 });
      return;
    }
    if (kind === "spread") {
      [0, 0.055, 0.11, 0.165].forEach((offset, index) => {
        tone(ctx, 220 + index * 68, now + offset, 0.16, { type: "triangle", gain: 0.026 * gainScale });
      });
      noise(ctx, now, 0.32, { gain: 0.028 * gainScale, frequency: 950, q: 1.1 });
      return;
    }
    if (kind === "shuffle") {
      noise(ctx, now, 0.28, { gain: 0.044 * gainScale, frequency: 680, q: 0.85 });
      tone(ctx, 260, now + 0.05, 0.12, { type: "square", to: 210, gain: 0.018 * gainScale });
      return;
    }
    if (kind === "pickup" || kind === "hover") {
      tone(ctx, kind === "hover" ? 660 : 520, now, 0.12, { type: "triangle", to: kind === "hover" ? 760 : 680, gain: 0.022 * gainScale });
      return;
    }
    if (kind === "angle") {
      tone(ctx, 470, now, 0.08, { type: "triangle", to: 530, gain: 0.012 * gainScale });
      return;
    }
    if (kind === "back") {
      tone(ctx, 312, now, 0.16, { type: "sine", gain: 0.028 * gainScale });
      tone(ctx, 624, now + 0.06, 0.2, { type: "triangle", gain: 0.032 * gainScale });
      return;
    }
    if (kind === "pause" || kind === "resume") {
      tone(ctx, kind === "pause" ? 320 : 420, now, 0.12, { type: "sine", to: kind === "pause" ? 180 : 620, gain: 0.022 * gainScale });
      return;
    }
    if (kind === "empty") {
      tone(ctx, 120, now, 0.14, { type: "sawtooth", to: 82, gain: 0.025 * gainScale });
      return;
    }
    if (kind === "clear") {
      noise(ctx, now, 0.16, { gain: 0.02 * gainScale, frequency: 420, q: 0.65 });
    }
  }

  function unlock() {
    if (enabled) getContext();
  }

  return {
    get ready() {
      return Boolean(context);
    },
    get enabled() {
      return enabled;
    },
    get events() {
      return events;
    },
    setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      if (enabled) unlock();
      if (!enabled && context?.state === "running") context.suspend().catch(() => {});
    },
    unlock,
    play,
    dispose() {
      if (context && context.state !== "closed") context.close().catch(() => {});
      context = null;
      noiseBuffer = null;
    }
  };
}

function shuffleList(values = []) {
  const next = values.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothBlend(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hexToRgba(hex, alpha = 1) {
  const value = String(hex || "#ffffff").replace("#", "");
  const int = Number.parseInt(value.length === 3 ? value.split("").map((char) => char + char).join("") : value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function fitText(ctx, text, x, y, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }
  let clipped = value;
  while (clipped.length > 4 && ctx.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
  ctx.fillText(`${clipped}...`, x, y);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}
