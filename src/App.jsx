import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BadgeCheck,
  BookOpen,
  Box,
  Brain,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clipboard,
  CreditCard,
  Film,
  Flame,
  FileJson,
  GitBranch,
  Grid3X3,
  Image as ImageIcon,
  ImagePlus,
  KanbanSquare,
  Layers3,
  Link2,
  ListChecks,
  Loader2,
  MapPin,
  Maximize2,
  Music,
  Pause,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Route,
  Search,
  Shuffle,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import CreatorCardSetsView from "./components/CreatorCardSetsView.jsx";
import { builderPickupDataset } from "./overcard/pickup.js";
import { BUILDER_HOST_TARGETS, getBuilderHostTarget, getBuilderOvercardManagementTarget, resolveBuilderHostAlias } from "./overcard/hostTargets.js";
import BuilderMenuHostTab from "./overcard/BuilderMenuHostTab.jsx";
import { useOvercardAttachments } from "@hapa/overcard/react";
import { resolveBuilderViewContext } from "./overcard/viewContext.js";
import { resolveTarotAttachmentContext } from "./overcard/tarotFormationAdapter.js";
import BuilderHeaderHand from "./overcard/BuilderHeaderHand.jsx";
import dearPapaSongbook from "../data/dear-papa-songbook.json";
import hapaSongsStoreSeed from "../data/hapa-songs-store.json";
import balladOfBellaPacket from "../data/ballad-of-bella/ballad-of-bella-packet.json";
import kanbanSeed from "../data/kanban.json";
import {
  ASSET_NODE_TYPES,
  AVATAR_MIND_VERSION,
  backgroundlessPlaybackForAsset,
  BUILD_BOARD,
  AVATAR_MODEL_REQUIREMENT,
  AVATAR_MODEL_REQUIREMENT_ID,
  CONTEXT_KINDS,
  DIRECTION_CHANNELS,
  DIRECTION_OPTIONS,
  MIND_CONFIDENCE_LEVELS,
  MIND_FACT_CLASSIFICATIONS,
  MIND_VISIBILITY_LEVELS,
  VIDEO_LOOP_TAG_GROUPS,
  VIDEO_FRAME_MARKERS,
  VIDEO_LINK_TYPES,
  RELATIONSHIP_METRICS,
  MEDIA_REQUIREMENTS,
  TAG_GROUPS,
  appendAssetNode,
  attachAvatarModel,
  attachVideoBranch,
  auditAvatar,
  connectVideoEndFrame,
  assignAssetToSlot,
  createAttachPack,
  createAvatarMindSummary,
  createAvatarScaffold,
  createHealingQueue,
  createVideoBranchMap,
  createVideoTransitionMap,
  createKanbanFromAudit,
  createMediaAsset,
  detachAssetFromAvatar,
  createVideoFrameMatchQueue,
  inferAssetKind,
  moveAssetToRequirement,
  normalizeAvatarMind,
  normalizeAvatarCard,
  renameAvatarIdentity,
  reorderRequirementAssets,
  setAssetDirection,
  setAvatarModelDefaultAnimation,
  setAvatarModelStats,
  setVideoReverseLoopValidation,
  tagDefinitionById,
  tagQualityForAsset,
  requirementById,
  toggleAssetTag,
  upsertAvatarMind,
  withAssetDirection,
  withVideoFrames,
  videoBranchesForAsset
} from "./domain/avatar.js";
import {
  PLACE_TYPES,
  SCENE_AVATAR_ROLES,
  SCENE_MEDIA_REQUIREMENTS,
  addPlaylistTrack,
  attachSceneMedia,
  auditSceneGraph,
  createPlace,
  createScene,
  createSceneAttachPack,
  createSceneGraphScaffold,
  detachSceneMedia,
  normalizeSceneGraph,
  removeAvatarFromScene,
  sceneRequirementById,
  setSceneTimeline,
  tagAvatarInScene,
  tagAvatarInSceneMedia,
  updatePlace,
  updateScene
} from "./domain/scene.js";
import {
  AVATAR_TEAM_ROLES,
  assignAvatarToTeam,
  createAvatarTeam,
  createAvatarTeamGroups,
  findAvatarTeamMembership,
  normalizeAvatarTeams,
  updateAvatarTeamMember
} from "./domain/avatarTeams.js";
import {
  mergeAvatarDrafts,
  normalizeAvatarDraftStore,
  removeAvatarDraftRecord,
  upsertAvatarDraftRecord
} from "./domain/avatarDrafts.js";
import {
  EQUIPMENT_HARDPOINTS,
  ITEM_KINDS,
  createInventoryStoreScaffold,
  createItemCard,
  createItemManagerScaffold,
  equipItemCard,
  normalizeInventoryStore,
  normalizeItemManagerStore
} from "./domain/item.js";
import {
  HAPA_SONG_VISUALIZER_CATALOG,
  addSongStoryBeat,
  attachAvatarToSong,
  attachSceneToSong,
  attachSongMedia,
  attachVisualizerToSong,
  createHapaSongStoreFromDearPapaSongbook,
  detachAvatarFromSong,
  detachSceneFromSong,
  detachVisualizerFromSong,
  normalizeHapaSongStore,
  upsertSongInStore
} from "./domain/song.js";
import { referenceCatalogIndex } from "./domain/song-reference-graph.js";
import {
  addTarotCard,
  addTarotDeck,
  addTarotSet,
  attachTarotCardMedia,
  createTarotAttachPack,
  createTarotDeck,
  createTarotLibraryDashboard,
  createTarotSet,
  createTarotStore,
  linkTarotCardAvatar,
  normalizeTarotStore,
  setTarotCardDeckMembership,
  setTarotCardSetMembership,
  summarizeTarotStore,
  unlinkTarotCardAvatar,
  updateTarotCard,
  updateTarotDeck,
  updateTarotSet
} from "./domain/tarot.js";
import TarotLibraryView, {
  tarotCollectionEntityId,
  tarotCollectionKind,
  tarotDeckCollectionId,
  tarotSetCollectionId,
  tarotTitleFromAsset
} from "./components/TarotLibraryView.jsx";
import HellWeekView from "./components/HellWeekView.jsx";
import SongCardMintPanel from "./components/SongCardMintPanel.jsx";
import { localFileApiUri } from "./domain/local-media-uri.js";

const ThreeAvatarViewer = lazy(() => import("./components/ThreeAvatarViewer.jsx"));
const TarotDraw3DView = lazy(() => import("./components/TarotDraw3DView.jsx"));
const HapaEchosView = lazy(() => import("./components/HapaEchosView.jsx"));
const PhoneCardMobileView = lazy(() => import("./components/PhoneCardMobileView.jsx"));

const EMPTY_TAROT_DRAW_PROJECTION = {
  cards: [],
  audit: { ready: 0, blocked: 0, missingMedia: 0 },
  state: "queued"
};

function initialAvatarBuilderView() {
  try {
    const view = new URLSearchParams(globalThis.location?.search || "").get("view") || "";
    return resolveBuilderHostAlias(view, "builder");
  } catch {
    return "builder";
  }
}

const electronApiBase = globalThis.window?.hapaAvatarBuilder?.apiBase;
const BUILDER_HOST_ICONS = {
  grid: Grid3X3, brain: Brain, scenes: Clapperboard, items: Box, loops: Route, lookbook: BookOpen,
  lore: Archive, songs: Music, echos: Sparkles, kanban: KanbanSquare, "avatar-card": BadgeCheck,
  bank: CreditCard, "tarot-library": Tags, "hell-week": Flame, "tarot-draw": Sparkles, "creator-sets": Users,
};
const API_BASE = electronApiBase || (["5177", "5178"].includes(globalThis.location?.port) ? "http://127.0.0.1:8787" : "");
const songRegistryApiBase = globalThis.window?.hapaAvatarBuilder?.songRegistryApiBase;
const SONG_REGISTRY_API_BASE = songRegistryApiBase || "http://127.0.0.1:8798";
const SONG_REGISTRY_DETAIL_PREFETCH_LIMIT = Math.max(0, Number(import.meta.env?.VITE_SONG_REGISTRY_DETAIL_PREFETCH_LIMIT ?? 0) || 0);

function resolveMediaUri(uri) {
  if (typeof uri !== "string" || !uri) return uri;
  const localUri = localFileApiUri(uri, API_BASE);
  if (localUri) return localUri;
  if (/^(data:|blob:|https?:)/.test(uri)) return uri;
  if (uri.startsWith("/media/")) {
    const base = API_BASE || "http://127.0.0.1:8787";
    return `${base}${uri}`;
  }
  return uri;
}

function resolveSongRegistryUri(uri) {
  if (typeof uri !== "string" || !uri) return uri;
  if (/^(data:|blob:|https?:|file:)/.test(uri)) return uri;
  if (uri.startsWith("/api/song-registry/")) {
    const base = API_BASE || "http://127.0.0.1:8787";
    return `${base}${uri}`;
  }
  if (uri.startsWith("/api/") && SONG_REGISTRY_API_BASE) return `${SONG_REGISTRY_API_BASE}${uri}`;
  return uri;
}

const FALLBACK_AVATARS = [
  createAvatarScaffold({
    id: "red-reaper",
    names: ["Red", "Reaper"],
    primaryName: "Red",
    aliases: ["Reaper"],
    summary: "Fallback Red/Reaper scaffold. The local API store loads the full card when available.",
    operatorNotes: "Fallback only; live media assets are kept in data/avatar-store.json and served by the API."
  })
];

const INTAKE_SEED = [];
const FALLBACK_SCENE_GRAPH = createSceneGraphScaffold();
const FALLBACK_TAROT_STORE = createTarotStore();
const FALLBACK_ITEM_MANAGER = createItemManagerScaffold();
const FALLBACK_INVENTORY_STORE = createInventoryStoreScaffold();
const ITEM_GROUP_MODES = [
  { id: "type", label: "Type" },
  { id: "avatar", label: "Avatar" },
  { id: "place", label: "Place" }
];
const FOUNDATION_CARD_FAMILIES = [
  {
    kind: "protocol",
    label: "Protocol Cards",
    shortLabel: "Protocols",
    icon: GitBranch,
    tone: "cyan",
    caption: "Operating doctrine, permission gates, rollback rules, and delegation patterns."
  },
  {
    kind: "skill",
    label: "Skill Cards",
    shortLabel: "Skills",
    icon: ListChecks,
    tone: "green",
    caption: "Reusable learned moves, procedures, workflows, and avatar training actions."
  },
  {
    kind: "node",
    label: "Node Cards",
    shortLabel: "Nodes",
    icon: Route,
    tone: "fuchsia",
    caption: "Hapa functional nodes mapped to Gardens, ships, services, and operational surfaces."
  }
];
const WORLD_DRAFT_STORAGE_KEY = "hapa-avatar-builder-world-draft-v1";
const AVATAR_DRAFT_STORAGE_KEY = "hapa-avatar-builder-avatar-drafts-v1";
const WORLD_SYNC_LABELS = {
  loading: "LOAD",
  saved: "SAVED",
  syncing: "SYNC",
  draft: "DRAFT"
};
const DEAR_PAPA_SONG_CARDS = Array.isArray(dearPapaSongbook.songCards) ? dearPapaSongbook.songCards : [];
const FALLBACK_SONG_LIBRARY = {
  status: "cold",
  songs: [],
  total: 0,
  error: null
};
const FALLBACK_HAPA_SONG_STORE = normalizeHapaSongStore(hapaSongsStoreSeed, dearPapaSongbook, FALLBACK_SONG_LIBRARY);
const LORE_READER_PAGE_SIZE = 48;
const LORE_KIND_FILTERS = [
  { id: "all", label: "All Lore", icon: Archive },
  { id: "saga", label: "Sagas", icon: BookOpen },
  { id: "journal", label: "Journals", icon: CalendarClock },
  { id: "card", label: "Cards", icon: BadgeCheck },
  { id: "scene", label: "Scenes", icon: Clapperboard },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "context", label: "Context", icon: MapPin }
];
const LORE_SORT_MODES = [
  { id: "curated", label: "Curated" },
  { id: "newest", label: "Newest" },
  { id: "timeline", label: "Timeline" },
  { id: "avatar", label: "Avatar" }
];

function mergeOverwindAvatars(compactAvatars = [], selectedAvatar = null) {
  const byId = new Map();
  for (const avatar of compactAvatars || []) {
    if (avatar?.id) byId.set(avatar.id, normalizeOverwindAvatar(avatar));
  }
  if (selectedAvatar?.id) {
    byId.set(selectedAvatar.id, normalizeOverwindAvatar(selectedAvatar));
  }
  return Array.from(byId.values());
}

function normalizeOverwindAvatar(avatar = {}) {
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

function isCompactOverwindAvatar(avatar) {
  return avatar?.overwindProjection === "compact";
}

function createInitialQueueJobs() {
  return [
    createQueueJob("overwind-bootstrap", "Overwind shell bootstrap", {
      status: "queued",
      kind: "bootstrap",
      detail: "Loading compact app shell before full stores.",
      available: "Fallback shell remains usable.",
      queuedNext: "Avatar detail, world, items, board, tarot, and media queues hydrate on intent."
    })
  ];
}

function createQueueJob(id, label, patch = {}) {
  const now = new Date().toISOString();
  return {
    id,
    label,
    kind: patch.kind || "background",
    status: patch.status || "queued",
    detail: patch.detail || "",
    available: patch.available || "",
    queuedNext: patch.queuedNext || "",
    blocking: Boolean(patch.blocking),
    updatedAt: patch.updatedAt || now,
    startedAt: patch.startedAt || (patch.status === "loading" ? now : null),
    finishedAt: patch.finishedAt || (["ready", "failed", "stale"].includes(patch.status) ? now : null),
    error: patch.error || ""
  };
}

function upsertQueueJobState(jobs, id, label, patch = {}) {
  const now = new Date().toISOString();
  const existing = jobs.find((job) => job.id === id);
  const nextPatch = {
    ...patch,
    updatedAt: now
  };
  if (patch.status === "loading" && !existing?.startedAt) nextPatch.startedAt = now;
  if (["ready", "failed", "stale"].includes(patch.status)) nextPatch.finishedAt = now;
  const nextJob = existing
    ? { ...existing, label: label || existing.label, ...nextPatch }
    : createQueueJob(id, label || id, nextPatch);
  const without = jobs.filter((job) => job.id !== id);
  return [nextJob, ...without]
    .sort((a, b) => Number(Boolean(b.blocking)) - Number(Boolean(a.blocking)) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 24);
}

function buildQueueSummary(jobs = []) {
  const counts = jobs.reduce((memo, job) => {
    memo[job.status] = (memo[job.status] || 0) + 1;
    return memo;
  }, {});
  const active = jobs.filter((job) => ["queued", "loading", "partial", "stale"].includes(job.status));
  const blockers = active.filter((job) => job.blocking);
  return {
    schemaVersion: "hapa.queue-buffer-summary.v1",
    state: blockers.length ? "blocking" : active.length ? "background" : "ready",
    total: jobs.length,
    active: active.length,
    blockers: blockers.length,
    counts,
    activeLabels: active.slice(0, 4).map((job) => job.label),
    lastError: jobs.find((job) => job.status === "failed")?.error || ""
  };
}

function displayAuditForAvatar(avatar) {
  if (isCompactOverwindAvatar(avatar) && avatar?.audit) {
    const percent = Number(avatar.audit.percent ?? 0);
    const required = Number(avatar.audit.required ?? 0);
    const filled = Number(avatar.audit.filled ?? 0);
    const missing = Number(avatar.audit.missing ?? Math.max(0, required - filled));
    return {
      avatarId: avatar.id,
      primaryName: avatar.primaryName || avatar.id,
      required,
      filled,
      missing,
      percent,
      xp: Math.round(percent * 12.5 + filled * 7),
      level: Math.max(1, Math.floor((percent * 12.5 + filled * 7) / 180) + 1),
      grade: avatar.audit.grade || (percent >= 100 ? "complete" : percent >= 72 ? "fieldable" : percent >= 36 ? "seeded" : "scaffold"),
      complete: percent >= 100 || missing === 0,
      byRequirement: []
    };
  }
  return auditAvatar(avatar);
}

function displayPortraitForAvatar(avatar) {
  if (isCompactOverwindAvatar(avatar)) return null;
  return defaultCloseupEmotionAsset(avatar);
}

function createDisplayMindPack(avatar) {
  if (isCompactOverwindAvatar(avatar) && avatar?.mind) {
    const compactLoadout = avatar.mind.loadout || {};
    const protocolCards = preferSummaryList(compactLoadout.protocolCards, avatar.mind.protocolCardLoadout);
    const skillCards = preferSummaryList(compactLoadout.skillCards, avatar.mind.skillCardLoadout);
    const tarotCards = preferSummaryList(compactLoadout.tarotCards, avatar.mind.tarotCardDeck);
    const songCards = preferSummaryList(compactLoadout.songCards, avatar.mind.dearPapaSongContext?.selectedSongCards);
    const mind = {
      personaAnchor: avatar.mind.personaAnchor || {},
      selfKnowledge: [],
      memoryLedger: [],
      relationships: [],
      contextMap: [],
      phraseCards: avatar.mind.phraseCards || [],
      protocolCardLoadout: protocolCards,
      skillCardLoadout: skillCards,
      tarotCardDeck: tarotCards,
      canonicalChoices: avatar.mind.canonicalChoices || [],
      storySpine: avatar.mind.storySpine || null,
      voiceGuide: avatar.mind.voiceGuide || null,
      weeklyJournalVoiceGuide: avatar.mind.weeklyJournalVoiceGuide || null,
      annualSceneBeats: avatar.mind.annualSceneBeats || []
    };
    const counts = {
      selfKnowledge: 0,
      relationships: 0,
      context: 0,
      memories: 0,
      journalEntries: 0,
      phraseCards: 0,
      songCards: 0,
      consciousnessCopies: 0,
      protocolCards: 0,
      skillCards: 0,
      tarotCards: 0,
      tombstones: 0,
      ...(avatar.mind.counts || {})
    };
    return {
      schemaVersion: "hapa.avatar-mind-display-pack.v1",
      avatarId: avatar.id,
      primaryName: avatar.primaryName || avatar.id,
      generatedAt: new Date().toISOString(),
      mind,
      summary: {
        schemaVersion: "hapa.avatar-mind-summary.v1",
        avatarId: avatar.id,
        primaryName: avatar.primaryName || avatar.id,
        counts,
        personaAnchor: avatar.mind.personaAnchor || {},
        gardenNodeAssignment: avatar.mind.gardenNodeAssignment || {},
        shipCrewAssignment: avatar.mind.shipCrewAssignment || {},
        knownOthers: avatar.mind.knownOthers || [],
        consciousnessCopies: [],
        phraseCards: avatar.mind.phraseCards || [],
        context: avatar.mind.context || [],
        loadout: {
          protocolCards,
          skillCards,
          tarotCards,
          songCards
        }
      },
      telemetry: {
        state: "compact",
        detail: "Showing shell mind summary; full avatar mind hydrates on idle or edit intent."
      }
    };
  }
  return {
    schemaVersion: "hapa.avatar-mind-display-pack.v1",
    avatarId: avatar.id,
    primaryName: avatar.primaryName || avatar.id,
    generatedAt: new Date().toISOString(),
    mind: normalizeAvatarMind(avatar.mind, avatar),
    summary: createAvatarMindSummary(avatar)
  };
}

export default function App({ overcardAdapter }) {
  if (globalThis.location?.pathname === "/phone-card") {
    return (
      <Suspense fallback={<div className="empty-state"><Loader2 size={22} /><span>Loading Phone Card</span></div>}>
        <PhoneCardMobileView apiBase={API_BASE} />
      </Suspense>
    );
  }

  const [avatars, setAvatars] = useState(FALLBACK_AVATARS);
  const [avatarTeams, setAvatarTeams] = useState([]);
  const [expandedTeamIds, setExpandedTeamIds] = useState(["core-protocol-team"]);
  const [board, setBoard] = useState(kanbanSeed);
  const [sceneGraph, setSceneGraph] = useState(FALLBACK_SCENE_GRAPH);
  const [tarotStore, setTarotStore] = useState(FALLBACK_TAROT_STORE);
  const [itemManager, setItemManager] = useState(FALLBACK_ITEM_MANAGER);
  const [avatarDataMode, setAvatarDataMode] = useState("fallback");
  const [worldDataMode, setWorldDataMode] = useState("fallback");
  const [itemDataMode, setItemDataMode] = useState("fallback");
  const [boardDataMode, setBoardDataMode] = useState("fallback");
  const [inventoryStore, setInventoryStore] = useState(FALLBACK_INVENTORY_STORE);
  const [songLibrary, setSongLibrary] = useState(FALLBACK_SONG_LIBRARY);
  const [hapaSongStore, setHapaSongStore] = useState(FALLBACK_HAPA_SONG_STORE);
  const [songDataMode, setSongDataMode] = useState("fallback");
  const [tarotDataMode, setTarotDataMode] = useState("fallback");
  const [selectedHapaSongId, setSelectedHapaSongId] = useState(FALLBACK_HAPA_SONG_STORE.songs[0]?.id || null);
  const [selectedAvatarId, setSelectedAvatarId] = useState(FALLBACK_AVATARS[0]?.id || null);
  const [profileTrailIds, setProfileTrailIds] = useState([]);
  const [profileReturnRoute, setProfileReturnRoute] = useState(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState(FALLBACK_SCENE_GRAPH.places[0]?.id || null);
  const [selectedSceneId, setSelectedSceneId] = useState(FALLBACK_SCENE_GRAPH.scenes[0]?.id || null);
  const [selectedTarotDeckId, setSelectedTarotDeckId] = useState(tarotDeckCollectionId(FALLBACK_TAROT_STORE.decks[0]?.id));
  const [selectedTarotCardId, setSelectedTarotCardId] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(FALLBACK_ITEM_MANAGER.cards[0]?.id || null);
  const [selectedInventoryAvatarId, setSelectedInventoryAvatarId] = useState(FALLBACK_AVATARS[0]?.id || null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedSceneAssetId, setSelectedSceneAssetId] = useState(null);
  const [intake, setIntake] = useState(INTAKE_SEED);
  const [activeView, setActiveView] = useState(initialAvatarBuilderView);
  const [bankViewMode, setBankViewMode] = useState("individual"); // "individual" or "guild"
  const [search, setSearch] = useState("");
  const [sound, setSound] = useState(() => localStorage.getItem("hapa-avatar-sound") === "on");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [apiState, setApiState] = useState("local");
  const [worldSyncState, setWorldSyncState] = useState("loading");
  const [tarotSyncState, setTarotSyncState] = useState("loading");
  const [expandedAsset, setExpandedAsset] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [identityDraft, setIdentityDraft] = useState({ primaryName: "", aliases: "" });
  const [teamDraft, setTeamDraft] = useState({ title: "", role: "Support", notes: "" });
  const [uploadJobs, setUploadJobs] = useState([]);
  const [subscriberStatus, setSubscriberStatus] = useState(null);
  const [selectedLoopVideoId, setSelectedLoopVideoId] = useState(null);
  const [lookBookPage, setLookBookPage] = useState(0);
  const [lookBookReader, setLookBookReader] = useState(false);
  const [routePending, setRoutePending] = useState(false);
  const [creatorContextSetId, setCreatorContextSetId] = useState(null);
  const [viewContextStatus, setViewContextStatus] = useState(null);
  const [avatarCardMenuOpen, setAvatarCardMenuOpen] = useState(false);
  const [attachPack, setAttachPack] = useState(null);
  const [sceneAttachPack, setSceneAttachPack] = useState(null);
  const [healingQueue, setHealingQueue] = useState(null);
  const [tarotDrawProjection, setTarotDrawProjection] = useState(EMPTY_TAROT_DRAW_PROJECTION);
  const [tarotDrawSceneArmed, setTarotDrawSceneArmed] = useState(false);
  const [tarotDrawHostAvatarId, setTarotDrawHostAvatarId] = useState(FALLBACK_AVATARS[0]?.id || null);
  const [queueJobs, setQueueJobs] = useState(createInitialQueueJobs);
  const persistTimers = useRef(new Map());
  const scenePersistTimer = useRef(0);
  const tarotPersistTimer = useRef(0);
  const teamsPersistTimer = useRef(0);
  const routeTimer = useRef(0);
  const viewContextPreviousRef = useRef(new Map());
  const inspectorRef = useRef(null);
  const avatarDetailRequestRef = useRef(0);
  const echoDirectorPrewarmVideosRef = useRef(new Map());
  const overwindLibraryHydratorRef = useRef(null);
  const overwindLibraryHydrationPromiseRef = useRef(null);

  useEffect(() => {
    const restoreRoute = () => {
      const route = new URLSearchParams(globalThis.location?.search || "").get("view") || "builder";
      setActiveView(resolveBuilderHostAlias(route, "builder"));
    };
    globalThis.addEventListener?.("popstate", restoreRoute);
    return () => globalThis.removeEventListener?.("popstate", restoreRoute);
  }, []);
  const echoDirectorProjectCacheRef = useRef(new Map());
  const overcardAttachments = useOvercardAttachments();

  const resolveEchoDirectorProject = useCallback(async (songId) => {
    if (!songId) return null;
    const cached = echoDirectorProjectCacheRef.current.get(songId);
    if (cached) return Promise.resolve(cached);
    const path = `/api/echos/director-project?songId=${encodeURIComponent(songId)}`;
    const bases = [...new Set([
      API_BASE,
      "",
      globalThis.location?.origin || "",
      "http://127.0.0.1:8787"
    ].filter((base) => typeof base === "string"))];
    for (const base of bases) {
      try {
        const response = await fetch(`${base}${path}`);
        if (!response.ok) continue;
        const payload = await response.json();
        const project = payload?.music_video_project || payload?.project?.music_video_project || payload || null;
        if (project) echoDirectorProjectCacheRef.current.set(songId, project);
        return project;
      } catch {
        // Try the next local origin; Electron shells may load UI and API from different loopback ports.
      }
    }
    return null;
  }, []);

  useEffect(() => {
    const prewarmVideos = echoDirectorPrewarmVideosRef.current;
    let disposed = false;
    ["dear-papa-song-dear-papa", "dear-papa-song-catch-the-rabbit"].forEach((songId) => {
      resolveEchoDirectorProject(songId).then((project) => {
        const firstShot = project?.timeline?.find((shot) => shot?.media_id !== "none" && (shot?.media_contract?.runtimeUri || shot?.runtime_media_uri || shot?.media_uri));
        const uri = firstShot?.media_contract?.runtimeUri || firstShot?.runtime_media_uri || firstShot?.media_uri || "";
        if (!uri || typeof document === "undefined") return;
        const key = new URL(uri, globalThis.location?.origin || "http://127.0.0.1").href;
        if (prewarmVideos.has(key)) return;
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.dataset.echoPrewarmStartedAt = String(performance.now());
        const release = () => {
          video.pause();
          video.removeAttribute("src");
          video.load();
        };
        video.addEventListener("loadeddata", () => {
          if (disposed) {
            release();
            return;
          }
          video.dataset.echoPrewarmReady = "true";
          video.dataset.echoPrewarmLatencyMs = String(Math.max(0, performance.now() - Number(video.dataset.echoPrewarmStartedAt || performance.now())));
          prewarmVideos.set(key, video);
        }, { once: true });
        video.addEventListener("error", release, { once: true });
        video.src = uri;
        video.load();
      }).catch(() => {});
    });
    return () => {
      disposed = true;
      prewarmVideos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      prewarmVideos.clear();
    };
  }, [resolveEchoDirectorProject]);

  const selectedAvatarRaw = avatars.find((avatar) => avatar.id === selectedAvatarId) || avatars[0];
  const selectedAvatar = useMemo(
    () => selectedAvatarRaw ? normalizeOverwindAvatar(selectedAvatarRaw) : null,
    [selectedAvatarRaw]
  );
  const isBuilderView = activeView === "builder";
  const isMindView = activeView === "mind";
  const isLoopsView = activeView === "loops";
  const isLookBookView = activeView === "lookbook";
  const isLoreView = activeView === "lore";
  const isKanbanView = activeView === "kanban";
  const isItemsView = activeView === "items";
  const isSongsView = activeView === "songs";
  const isProtocolView = activeView === "protocol";
  const isTarotLibraryView = activeView === "tarot-library";
  const isTarotDrawView = activeView === "tarot";
  const audit = useMemo(() => selectedAvatar ? auditAvatar(selectedAvatar) : null, [selectedAvatar]);
  const selectedAvatarPortrait = useMemo(
    () => selectedAvatar ? displayPortraitForAvatar(selectedAvatar) : null,
    [selectedAvatar]
  );
  const avatarPortraits = useMemo(
    () => new Map(avatars.map((avatar) => [avatar.id, displayPortraitForAvatar(avatar)])),
    [avatars]
  );
  const avatarAudits = useMemo(
    () => new Map(avatars.map((avatar) => [avatar.id, displayAuditForAvatar(avatar)])),
    [avatars]
  );
  const profileTrail = useMemo(
    () => profileTrailIds.map((avatarId) => avatars.find((avatar) => avatar.id === avatarId)).filter(Boolean),
    [profileTrailIds, avatars]
  );
  const normalizedAvatarTeams = useMemo(
    () => normalizeAvatarTeams(avatarTeams, avatars),
    [avatarTeams, avatars]
  );
  const avatarTeamGroups = useMemo(
    () => createAvatarTeamGroups(normalizedAvatarTeams, avatars),
    [normalizedAvatarTeams, avatars]
  );
  const selectedAvatarMembership = useMemo(
    () => findAvatarTeamMembership(normalizedAvatarTeams, selectedAvatar?.id),
    [normalizedAvatarTeams, selectedAvatar?.id]
  );
  const selectedAvatarAsset = useMemo(
    () => isBuilderView || isLoopsView || isLookBookView
      ? selectedAvatar?.assets.find((asset) => asset.id === selectedAssetId) || null
      : null,
    [isBuilderView, isLoopsView, isLookBookView, selectedAvatar, selectedAssetId]
  );
  const selectedAsset = selectedAvatarAsset || intake.find((asset) => asset.id === selectedAssetId) || null;
  const selectedTagQuality = useMemo(
    () => isBuilderView && selectedAsset ? tagQualityForAsset(selectedAsset) : null,
    [isBuilderView, selectedAsset]
  );
  const videoBranchMap = useMemo(
    () => isBuilderView && selectedAvatar ? createVideoBranchMap(selectedAvatar) : new Map(),
    [isBuilderView, selectedAvatar]
  );
  const videoTransitionMap = useMemo(
    () => (isBuilderView || isLoopsView) && selectedAvatar ? createVideoTransitionMap(selectedAvatar) : { links: [], outgoing: new Map(), incoming: new Map() },
    [isBuilderView, isLoopsView, selectedAvatar]
  );
  const selectedImageBranches = useMemo(
    () => isBuilderView && selectedAvatar && selectedAvatarAsset?.type === "image" ? videoBranchesForAsset(selectedAvatar, selectedAvatarAsset.id) : [],
    [isBuilderView, selectedAvatar, selectedAvatarAsset]
  );
  const selectedVideoParent = useMemo(
    () => isBuilderView && selectedAvatar && selectedAvatarAsset?.type === "video"
      ? selectedAvatar.assets.find((asset) => asset.id === (selectedAvatarAsset.parentAssetId || selectedAvatarAsset.state?.startFrameAssetId)) || null
      : null,
    [isBuilderView, selectedAvatar, selectedAvatarAsset]
  );
  const videoBranchCount = useMemo(
    () => selectedAvatar ? selectedAvatar.assets.filter((asset) => asset.type === "video" && (asset.parentAssetId || asset.state?.startFrameAssetId)).length : 0,
    [selectedAvatar]
  );
  const videoLinkCount = videoTransitionMap.links.length;
  const loopVideos = useMemo(
    () => selectedAvatar ? selectedAvatar.assets.filter((asset) => asset.type === "video") : [],
    [selectedAvatar]
  );
  const seedFrameAssets = useMemo(
    () => (isLoopsView || isLookBookView) && selectedAvatar
      ? selectedAvatar.slots
          .map((slot) => selectedAvatar.assets.find((asset) => asset.id === slot.assetId && asset.type === "image"))
          .filter(Boolean)
      : [],
    [isLoopsView, isLookBookView, selectedAvatar]
  );
  const selectedLoopVideo = useMemo(
    () => loopVideos.find((asset) => asset.id === selectedLoopVideoId) || loopVideos[0] || null,
    [loopVideos, selectedLoopVideoId]
  );
  const videoMatchQueue = useMemo(
    () => isLoopsView && selectedAvatar ? createVideoFrameMatchQueue(selectedAvatar, { threshold: 0.9 }) : [],
    [isLoopsView, selectedAvatar]
  );
  const modelAssets = useMemo(
    () => selectedAvatar ? selectedAvatar.assets.filter((asset) => asset.type === "model" || asset.requirementId === AVATAR_MODEL_REQUIREMENT_ID) : [],
    [selectedAvatar]
  );
  const activeModelAsset = useMemo(
    () => isBuilderView ? modelAssets.find((asset) => asset.state?.active) || modelAssets[0] || null : null,
    [isBuilderView, modelAssets]
  );
  const avatarBoard = useMemo(() => isKanbanView && selectedAvatar ? createKanbanFromAudit(selectedAvatar) : [], [isKanbanView, selectedAvatar]);
  const healingQueueTotal = healingQueue?.total ?? audit?.missing ?? 0;
  const mindPack = useMemo(
    () => (isMindView || isProtocolView) && selectedAvatar ? createDisplayMindPack(selectedAvatar) : null,
    [isMindView, isProtocolView, selectedAvatar]
  );
  const normalizedSceneGraph = useMemo(() => normalizeSceneGraph(sceneGraph), [sceneGraph]);
  const sceneAudit = useMemo(() => auditSceneGraph(normalizedSceneGraph), [normalizedSceneGraph]);
  const normalizedItemManager = useMemo(() => normalizeItemManagerStore(itemManager), [itemManager]);
  const normalizedInventoryStore = useMemo(
    () => normalizeInventoryStore(inventoryStore, avatars, normalizedItemManager.cards),
    [inventoryStore, avatars, normalizedItemManager.cards]
  );
  const selectedItem = useMemo(
    () => normalizedItemManager.cards.find((card) => card.id === selectedItemId) || normalizedItemManager.cards[0] || null,
    [normalizedItemManager, selectedItemId]
  );
  const selectedAvatarInventory = useMemo(
    () => normalizedInventoryStore.avatarInventories.find((inventory) => inventory.avatarId === selectedAvatar?.id) || null,
    [normalizedInventoryStore.avatarInventories, selectedAvatar?.id]
  );
  const normalizedTarotStore = useMemo(() => normalizeTarotStore(tarotStore), [tarotStore]);
  const tarotAttachmentContext = useMemo(
    () => resolveTarotAttachmentContext(overcardAttachments, normalizedTarotStore),
    [overcardAttachments, normalizedTarotStore]
  );
  const tarotDrawHostAvatarRaw = useMemo(
    () => avatars.find((avatar) => avatar.id === tarotAttachmentContext.hostAvatarId) || avatars.find((avatar) => avatar.id === tarotDrawHostAvatarId) || selectedAvatarRaw || avatars[0] || null,
    [avatars, tarotAttachmentContext.hostAvatarId, tarotDrawHostAvatarId, selectedAvatarRaw]
  );
  const tarotDrawHostAvatar = useMemo(
    () => tarotDrawHostAvatarRaw ? normalizeOverwindAvatar(tarotDrawHostAvatarRaw) : null,
    [tarotDrawHostAvatarRaw]
  );
  const tarotDrawHostInventory = useMemo(
    () => normalizedInventoryStore.avatarInventories.find((inventory) => inventory.avatarId === tarotDrawHostAvatar?.id) || null,
    [normalizedInventoryStore.avatarInventories, tarotDrawHostAvatar?.id]
  );
  const normalizedHapaSongStore = useMemo(
    () => normalizeHapaSongStore(hapaSongStore, dearPapaSongbook, songLibrary),
    [hapaSongStore, songLibrary]
  );
  const tarotDrawCards = tarotDrawProjection.cards;
  const tarotDrawProductionAudit = tarotDrawProjection.audit;
  const tarotDrawProjectionReady = tarotDrawProjection.cards.length > 0 && (
    tarotDrawProjection.state === "ready" ||
    tarotDrawProjection.state === "refreshing"
  );
  const tarotDrawSceneLive = tarotDrawSceneArmed && tarotDrawProjectionReady;
  const tarotDrawStageVisible = Boolean((isTarotDrawView && (tarotDrawHostAvatar || selectedAvatar)) || (tarotDrawSceneArmed && (tarotDrawHostAvatar || selectedAvatar)));
  const tarotDrawStageDocked = tarotDrawStageVisible && !isTarotDrawView;
  const tarotDrawPlaybackMode = isTarotDrawView ? "active" : (tarotDrawSceneLive ? "docked" : "hidden");
  const avatarCardFocusActive = isProtocolView && !avatarCardMenuOpen;
  const appShellClasses = [
    "app-shell",
    activeView === "lookbook" && lookBookReader ? "reader-mode-active" : "",
    isProtocolView ? "avatar-card-route" : "",
    avatarCardFocusActive ? "avatar-card-focus" : "",
    tarotDrawStageDocked ? "tarot-scene-docked-active" : ""
  ].filter(Boolean).join(" ");
  const selectedHapaSong = useMemo(
    () => normalizedHapaSongStore.songs.find((song) => song.id === selectedHapaSongId || song.songId === selectedHapaSongId)
      || normalizedHapaSongStore.songs[0]
      || null,
    [normalizedHapaSongStore.songs, selectedHapaSongId]
  );
  const selectedPlace = useMemo(
    () => normalizedSceneGraph.places.find((place) => place.id === selectedPlaceId) || normalizedSceneGraph.places[0] || null,
    [normalizedSceneGraph, selectedPlaceId]
  );
  const scenesForPlace = useMemo(
    () => normalizedSceneGraph.scenes
      .filter((scene) => !selectedPlace?.id || scene.placeId === selectedPlace.id)
      .sort((a, b) => Number(a.canonicalTime?.order || 0) - Number(b.canonicalTime?.order || 0)),
    [normalizedSceneGraph, selectedPlace]
  );
  const selectedScene = useMemo(
    () => normalizedSceneGraph.scenes.find((scene) => scene.id === selectedSceneId)
      || scenesForPlace[0]
      || normalizedSceneGraph.scenes[0]
      || null,
    [normalizedSceneGraph, selectedSceneId, scenesForPlace]
  );
  const selectedSceneAsset = useMemo(
    () => selectedScene?.assets.find((asset) => asset.id === selectedSceneAssetId) || null,
    [selectedScene, selectedSceneAssetId]
  );
  const tarotSummary = useMemo(() => summarizeTarotStore(normalizedTarotStore), [normalizedTarotStore]);
  const tarotDashboard = useMemo(() => createTarotLibraryDashboard(normalizedTarotStore), [normalizedTarotStore]);
  const selectedTarotCollectionKind = tarotCollectionKind(selectedTarotDeckId);
  const selectedTarotCollectionEntityId = tarotCollectionEntityId(selectedTarotDeckId);
  const selectedTarotDeck = useMemo(
    () => selectedTarotCollectionKind === "deck"
      ? normalizedTarotStore.decks.find((deck) => deck.id === selectedTarotCollectionEntityId) || null
      : null,
    [normalizedTarotStore, selectedTarotCollectionEntityId, selectedTarotCollectionKind]
  );
  const selectedTarotSet = useMemo(
    () => selectedTarotCollectionKind === "set"
      ? normalizedTarotStore.sets.find((set) => set.id === selectedTarotCollectionEntityId) || null
      : null,
    [normalizedTarotStore, selectedTarotCollectionEntityId, selectedTarotCollectionKind]
  );
  const tarotCardsForDeck = useMemo(() => {
    if (selectedTarotCollectionKind === "standalone") {
      return normalizedTarotStore.cards.filter((card) => !card.deckIds.length && !card.setIds.length);
    }
    if (selectedTarotCollectionKind === "set") {
      if (!selectedTarotSet) return normalizedTarotStore.cards;
      const setOrder = new Map(selectedTarotSet.cardIds.map((cardId, index) => [cardId, index]));
      return normalizedTarotStore.cards
        .filter((card) => card.setIds.includes(selectedTarotSet.id))
        .sort((a, b) => (setOrder.get(a.id) ?? 9999) - (setOrder.get(b.id) ?? 9999));
    }
    if (!selectedTarotDeck) return normalizedTarotStore.cards;
    const deckOrder = new Map(selectedTarotDeck.cardIds.map((cardId, index) => [cardId, index]));
    return normalizedTarotStore.cards
      .filter((card) => card.deckIds.includes(selectedTarotDeck.id))
      .sort((a, b) => (deckOrder.get(a.id) ?? 9999) - (deckOrder.get(b.id) ?? 9999));
  }, [normalizedTarotStore, selectedTarotCollectionKind, selectedTarotDeck, selectedTarotSet]);
  const selectedTarotCard = useMemo(
    () => normalizedTarotStore.cards.find((card) => card.id === selectedTarotCardId)
      || tarotCardsForDeck[0]
      || normalizedTarotStore.cards[0]
      || null,
    [normalizedTarotStore, selectedTarotCardId, tarotCardsForDeck]
  );
  const tarotAttachPack = useMemo(
    () => isTarotLibraryView ? createTarotAttachPack(normalizedTarotStore, {
      deckId: selectedTarotDeck?.id || null,
      setId: selectedTarotSet?.id || null,
      cardId: selectedTarotCard?.id || null,
      target: "avatar-builder"
    }) : null,
    [isTarotLibraryView, normalizedTarotStore, selectedTarotCard, selectedTarotDeck, selectedTarotSet]
  );
  const queueSummary = useMemo(() => buildQueueSummary(queueJobs), [queueJobs]);
  const expandedAssetRecord = assetFromExpansionState(expandedAsset);
  const filteredIntake = useMemo(() => intake.filter((asset) =>
    [asset.name, asset.requirementId, ...(asset.tags || [])].join(" ").toLowerCase().includes(search.toLowerCase())
  ), [intake, search]
  );
  const activeViewContext = useMemo(
    () => resolveBuilderViewContext(activeView, Object.values(overcardAttachments)),
    [activeView, overcardAttachments]
  );

  useEffect(() => {
    const previous = viewContextPreviousRef.current.get(activeView);
    if (!activeViewContext.attachments.length) {
      if (previous) {
        setSelectedAvatarId(previous.avatarId); setSelectedItemId(previous.itemId); setSelectedSceneId(previous.sceneId);
        setSelectedLoopVideoId(previous.loopId); setSelectedHapaSongId(previous.songId); setSelectedTarotDeckId(previous.tarotDeckId);
        setSelectedTarotCardId(previous.tarotCardId); setCreatorContextSetId(previous.creatorSetId);
        viewContextPreviousRef.current.delete(activeView);
      }
      setViewContextStatus(null);
      return;
    }
    if (!previous) viewContextPreviousRef.current.set(activeView, { avatarId: selectedAvatarId, itemId: selectedItemId, sceneId: selectedSceneId, loopId: selectedLoopVideoId, songId: selectedHapaSongId, tarotDeckId: selectedTarotDeckId, tarotCardId: selectedTarotCardId, creatorSetId: creatorContextSetId });
    const unsupported = [...activeViewContext.unsupported]; const applied = [];
    for (const action of activeViewContext.actions) {
      if (action.action === "select-avatar" && avatars.some((item) => item.id === action.entityId)) { setSelectedAvatarId(action.entityId); applied.push(action.label); }
      else if (action.action === "select-item" && normalizedItemManager.cards.some((item) => item.id === action.entityId)) { setSelectedItemId(action.entityId); applied.push(action.label); }
      else if (action.action === "select-scene" && normalizedSceneGraph.scenes.some((item) => item.id === action.entityId)) { const scene = normalizedSceneGraph.scenes.find((item) => item.id === action.entityId); if (scene?.placeId) setSelectedPlaceId(scene.placeId); setSelectedSceneId(action.entityId); applied.push(action.label); }
      else if (action.action === "select-loop" && loopVideos.some((item) => item.id === action.entityId)) { setSelectedLoopVideoId(action.entityId); applied.push(action.label); }
      else if (action.action === "select-song" && normalizedHapaSongStore.songs.some((item) => item.id === action.entityId || item.songId === action.entityId)) { setSelectedHapaSongId(action.entityId); applied.push(action.label); }
      else if (action.action === "select-tarot-card" && normalizedTarotStore.cards.some((item) => item.id === action.entityId)) { setSelectedTarotCardId(action.entityId); applied.push(action.label); }
      else if (action.action === "select-tarot-deck" && normalizedTarotStore.decks.some((item) => item.id === action.entityId)) { setSelectedTarotDeckId(tarotDeckCollectionId(action.entityId)); applied.push(action.label); }
      else if (action.action === "select-tarot-set" && normalizedTarotStore.sets.some((item) => item.id === action.entityId)) { setSelectedTarotDeckId(tarotSetCollectionId(action.entityId)); applied.push(action.label); }
      else if (action.action === "select-creator-set" && normalizedItemManager.cards.some((item) => item.id === action.entityId && item.cardType === "set")) { setCreatorContextSetId(action.entityId); applied.push(action.label); }
      else unsupported.push({ ...action, reason: `${action.label} is unavailable in the current source projection; attachment is retained but inert.` });
    }
    setViewContextStatus({ route: activeView, contextMode: activeViewContext.contextMode, applied, unsupported, labels: activeViewContext.labels });
  }, [activeView, activeViewContext, avatars, creatorContextSetId, loopVideos, normalizedHapaSongStore.songs, normalizedItemManager.cards, normalizedSceneGraph.scenes, normalizedTarotStore, selectedAvatarId, selectedHapaSongId, selectedItemId, selectedLoopVideoId, selectedSceneId, selectedTarotCardId, selectedTarotDeckId]);

  useEffect(() => {
    localStorage.setItem("hapa-avatar-sound", sound ? "on" : "off");
  }, [sound]);

  useEffect(() => {
    window.__HAPA_QUEUE_INSPECTOR__ = {
      summary: queueSummary,
      jobs: queueJobs
    };
  }, [queueJobs, queueSummary]);

  useEffect(() => {
    if (!selectedAvatar) return;
    const aliases = selectedAvatar.aliases?.length
      ? selectedAvatar.aliases
      : selectedAvatar.names?.map((item) => item.name).filter((name) => name !== selectedAvatar.primaryName).slice(0, 2) || [];
    setIdentityDraft({
      primaryName: selectedAvatar.primaryName || "",
      aliases: aliases.join(", ")
    });
  }, [selectedAvatarId]);

  useEffect(() => {
    setTeamDraft((draft) => ({
      ...draft,
      teamId: selectedAvatarMembership?.team?.id || "__ungrouped",
      role: selectedAvatarMembership?.member?.role || draft.role || "Support",
      notes: selectedAvatarMembership?.member?.notes || ""
    }));
  }, [selectedAvatar?.id, selectedAvatarMembership?.team?.id, selectedAvatarMembership?.member?.role, selectedAvatarMembership?.member?.notes]);

  useEffect(() => {
    if (!loopVideos.length) {
      setSelectedLoopVideoId(null);
      return;
    }
    setSelectedLoopVideoId((current) => (current && loopVideos.some((video) => video.id === current) ? current : loopVideos[0].id));
  }, [loopVideos]);

  useEffect(() => {
    if (!isBuilderView || !selectedAvatar) {
      setAttachPack(null);
      return undefined;
    }
    setAttachPack(null);
    updateQueueJob("derived-attach-pack", "Builder attach pack", {
      status: "queued",
      kind: "derived-data",
      detail: "Builder is usable; agent attach pack is queued for idle rebuild.",
      available: "Avatar media slots and intake controls are visible.",
      queuedNext: "Rebuild compact agent packet from selected avatar."
    });
    return scheduleIdleTask(() => {
      setAttachPack(createAttachPack(selectedAvatar, "agent-process"));
      markQueueReady("derived-attach-pack", "Builder attach pack", "Attach pack rebuilt from selected avatar.");
    }, 520);
  }, [isBuilderView, selectedAvatar]);

  useEffect(() => {
    if (!isKanbanView || !selectedAvatar) {
      setHealingQueue(null);
      return undefined;
    }
    setHealingQueue(null);
    updateQueueJob("derived-healing-queue", "Healing prompt queue", {
      status: "queued",
      kind: "derived-data",
      detail: "Kanban can render; healing prompts are queued to avoid blocking board paint.",
      available: "Build board and audit counts are visible.",
      queuedNext: "Create GPT Image 2 prompt packets for missing Avatar Card slots."
    });
    return scheduleIdleTask(() => {
      setHealingQueue(createHealingQueue(selectedAvatar));
      markQueueReady("derived-healing-queue", "Healing prompt queue", "Healing prompt queue rebuilt.");
    }, 900);
  }, [isKanbanView, selectedAvatar]);

  useEffect(() => {
    if (!tarotDrawSceneArmed) {
      return undefined;
    }
    if (tarotDrawProjection.cards.length) {
      return undefined;
    }
    if (avatarDataMode !== "full" && avatarDataMode !== "fallback") {
      ensureFullAvatarStoreLoaded();
      setTarotDrawProjection((current) => current.cards.length
        ? { ...current, state: "refreshing" }
        : {
            ...EMPTY_TAROT_DRAW_PROJECTION,
            state: "loading"
          });
      updateQueueJob("full-avatar-store", "Full avatar store", {
        status: avatarDataMode === "loading-full" ? "loading" : "queued",
        kind: "store",
        detail: "Tarot Draw needs full avatar loop assets before building song/video panels.",
        available: "Tarot Draw route shell remains visible.",
        queuedNext: "Build the playable draw projection after full avatar media hydrates.",
        blocking: false
      });
      return undefined;
    }
    setTarotDrawProjection((current) => current.cards.length
      ? { ...current, state: "refreshing" }
      : {
          ...EMPTY_TAROT_DRAW_PROJECTION,
          state: "loading"
        });
    updateQueueJob("derived-tarot-draw-projection", "Tarot Draw projection", {
      status: "queued",
      kind: "derived-data",
      detail: "3D table shell is visible; drawable card projection is queued.",
      available: "Tarot Draw route shell and controls are usable.",
      queuedNext: "Build playable card/song/avatar draw projection."
    });
    return scheduleDeferredLoad(() => {
      setTarotDrawProjection(buildTarotDrawProjection(
        normalizedItemManager.cards,
        tarotDrawHostInventory,
        avatars,
        normalizedInventoryStore,
        songLibrary,
        normalizedHapaSongStore,
        tarotAttachmentContext
      ));
      markQueueReady("derived-tarot-draw-projection", "Tarot Draw projection", "Drawable Tarot projection ready.");
    }, 900);
  }, [tarotDrawSceneArmed, avatarDataMode, normalizedItemManager.cards, tarotDrawHostInventory, tarotDrawHostAvatar?.id, avatars, normalizedInventoryStore, songLibrary, normalizedHapaSongStore, tarotAttachmentContext]);

  useEffect(() => {
    if (!isTarotDrawView || tarotDrawSceneArmed) {
      return undefined;
    }
    setTarotDrawHostAvatarId(tarotAttachmentContext.hostAvatarId || selectedAvatar?.id || tarotDrawHostAvatarId || FALLBACK_AVATARS[0]?.id || null);
    return scheduleDeferredLoad(() => {
      setTarotDrawSceneArmed(true);
    }, 650);
  }, [isTarotDrawView, tarotDrawSceneArmed, selectedAvatar?.id, tarotDrawHostAvatarId, tarotAttachmentContext.hostAvatarId]);

  useEffect(() => {
    if (activeView !== "scenes" || !selectedScene) {
      setSceneAttachPack(null);
      return undefined;
    }
    const sceneId = selectedScene.id;
    setSceneAttachPack(null);
    updateQueueJob("derived-scene-attach-pack", "Scene attach pack", {
      status: "queued",
      kind: "derived-data",
      detail: "Scene panel is usable; agent scene packet is queued.",
      available: "Place and scene summaries are visible.",
      queuedNext: "Build scene attach pack for selected scene."
    });
    return scheduleIdleTask(() => {
      setSceneAttachPack(createSceneAttachPack(normalizedSceneGraph, sceneId));
      markQueueReady("derived-scene-attach-pack", "Scene attach pack", "Scene attach pack rebuilt.");
    }, 520);
  }, [activeView, normalizedSceneGraph, selectedScene?.id]);

  useEffect(() => () => {
    for (const timer of persistTimers.current.values()) {
      window.clearTimeout(timer);
    }
    persistTimers.current.clear();
    window.clearTimeout(scenePersistTimer.current);
    window.clearTimeout(tarotPersistTimer.current);
    window.clearTimeout(teamsPersistTimer.current);
    window.clearTimeout(routeTimer.current);
  }, []);

  useEffect(() => {
    let alive = true;
    updateQueueJob("overwind-bootstrap", "Overwind shell bootstrap", {
      status: "loading",
      kind: "bootstrap",
      detail: "Loading compact Overwind shell projection.",
      available: "Fallback shell remains usable.",
      queuedNext: "Full stores hydrate only after route intent or idle budget.",
      blocking: true
    });

    const performOverwindLibraryHydration = () => fetch(`${API_BASE}/api/overwind/library`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Overwind library ${res.status}`))))
      .then((library) => {
        if (!alive) return library;
        const avatarDraftMerge = mergeAvatarDrafts(library.avatars || [], readAvatarDraftStore());
        const nextAvatars = avatarDraftMerge.avatars;
        const nextItemStore = normalizeItemManagerStore(library.itemStore || { ...FALLBACK_ITEM_MANAGER, cards: library.items || [] });
        setAvatars(nextAvatars);
        setAvatarTeams(normalizeAvatarTeams(library.teams || [], nextAvatars));
        setItemManager(nextItemStore);
        setInventoryStore((current) => normalizeInventoryStore(current, nextAvatars, nextItemStore.cards));
        setAvatarDataMode(library.truth_state === "overwind-acknowledged" ? "overwind" : "local-stale");
        setItemDataMode(library.truth_state === "overwind-acknowledged" ? "overwind" : "local-stale");
        updateQueueJob("overwind-card-plane", "Overwind Card plane", {
          status: library.truth_state === "overwind-acknowledged" ? "ready" : "degraded",
          kind: "sync",
          detail: `${library.populations?.avatars || 0} avatar Cards + ${library.populations?.items || 0} item Cards; ${library.truth_state}; watermark ${library.watermarks?.avatars || library.watermarks?.items || "cached"}.`,
          available: library.truth_state === "overwind-acknowledged" ? "Search, history, comments, and lineage are served by Overwind." : "Bounded local-stale projection remains available.",
          queuedNext: library.truth_state === "overwind-acknowledged" ? "Delta sync continues in the background." : "Automatic Overwind retry is available.",
          blocking: false
        });
        return library;
      });

    const hydrateOverwindLibrary = () => {
      if (overwindLibraryHydrationPromiseRef.current) return overwindLibraryHydrationPromiseRef.current;
      const promise = performOverwindLibraryHydration().catch((error) => {
        if (overwindLibraryHydrationPromiseRef.current === promise) overwindLibraryHydrationPromiseRef.current = null;
        throw error;
      });
      overwindLibraryHydrationPromiseRef.current = promise;
      return promise;
    };
    overwindLibraryHydratorRef.current = hydrateOverwindLibrary;

    const loadLegacyStores = () => Promise.all([
      hydrateOverwindLibrary(),
      fetch(`${API_BASE}/api/kanban`).then((res) => res.json()),
      fetch(`${API_BASE}/api/world`).then((res) => (res.ok ? res.json() : FALLBACK_SCENE_GRAPH)).catch(() => FALLBACK_SCENE_GRAPH),
      fetch(`${API_BASE}/api/inventory`).then((res) => (res.ok ? res.json() : FALLBACK_INVENTORY_STORE)).catch(() => FALLBACK_INVENTORY_STORE)
    ])
      .then(([library, kanban, world, inventory]) => {
        if (!alive) return;
        const graph = normalizeSceneGraph(world || FALLBACK_SCENE_GRAPH);
        const localDraft = readWorldDraft();
        const draftGraph = localDraft?.graph ? normalizeSceneGraph(localDraft.graph) : null;
        const shouldUseDraft = draftGraph && isSceneGraphDraftNewer(draftGraph, graph);
        const activeGraph = shouldUseDraft ? draftGraph : graph;
        const serverAvatars = library.avatars || FALLBACK_AVATARS;
        const avatarDraftMerge = mergeAvatarDrafts(serverAvatars, readAvatarDraftStore());
        const nextAvatars = avatarDraftMerge.avatars;
        const nextItemStore = normalizeItemManagerStore(library.itemStore || FALLBACK_ITEM_MANAGER);
        setAvatars(nextAvatars);
        setAvatarDataMode(library.truth_state === "overwind-acknowledged" ? "overwind" : "local-stale");
        setAvatarTeams(normalizeAvatarTeams(library.teams || [], nextAvatars));
        setBoard(kanban || kanbanSeed);
        setBoardDataMode("full");
        setSceneGraph(activeGraph);
        setWorldDataMode("full");
        setItemManager(nextItemStore);
        setItemDataMode(library.truth_state === "overwind-acknowledged" ? "overwind" : "local-stale");
        setInventoryStore(normalizeInventoryStore(inventory || FALLBACK_INVENTORY_STORE, nextAvatars, nextItemStore.cards));
        setSelectedPlaceId(activeGraph.places[0]?.id || null);
        setSelectedSceneId(activeGraph.scenes[0]?.id || null);
        setSelectedAvatarId(nextAvatars[0]?.id || null);
        setSelectedInventoryAvatarId(nextAvatars[0]?.id || null);
        setSelectedItemId(nextItemStore.cards[0]?.id || null);
        setApiState(shouldUseDraft ? "local" : "api");
        setWorldSyncState(shouldUseDraft ? "draft" : "saved");
        markQueueReady("overwind-bootstrap", "Overwind shell bootstrap", "Legacy full-store fallback completed after shell miss.");
        if (shouldUseDraft) notify("Recovered unsynced world draft; retry sync when ready");
        if (avatarDraftMerge.recoveredCount) {
          notify(`Recovered ${avatarDraftMerge.recoveredCount} local avatar draft${avatarDraftMerge.recoveredCount === 1 ? "" : "s"}`);
          syncAvatarDraftRecords(avatarDraftMerge.pendingRecords, "startup");
        }
        window.setTimeout(refreshSubscriberStatus, 0);
      });

    fetch(`${API_BASE}/api/overwind/bootstrap?mode=shell`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Overwind bootstrap ${res.status}`))))
      .then((bootstrap) => {
        if (!alive) return;
        const bootstrapMode = bootstrap.overwind?.projection === "shell" || bootstrap.schemaVersion === "hapa.overwind.avatar-builder-shell.v1"
          ? "shell"
          : "compact";
        const graph = normalizeSceneGraph(bootstrap.world || FALLBACK_SCENE_GRAPH);
        const localDraft = readWorldDraft();
        const draftGraph = localDraft?.graph ? normalizeSceneGraph(localDraft.graph) : null;
        const shouldUseDraft = draftGraph && isSceneGraphDraftNewer(draftGraph, graph);
        const activeGraph = shouldUseDraft ? draftGraph : graph;
        const serverAvatars = mergeOverwindAvatars(bootstrap.avatars || [], bootstrap.selectedAvatar);
        const avatarDraftMerge = mergeAvatarDrafts(serverAvatars, readAvatarDraftStore());
        const nextAvatars = avatarDraftMerge.avatars;
        const nextItemStore = normalizeItemManagerStore(bootstrap.items || FALLBACK_ITEM_MANAGER);
        setAvatars(nextAvatars.length ? nextAvatars : FALLBACK_AVATARS);
        setAvatarDataMode(bootstrapMode);
        setAvatarTeams(normalizeAvatarTeams(bootstrap.teams || [], nextAvatars.length ? nextAvatars : FALLBACK_AVATARS));
        setBoard(bootstrap.kanban || kanbanSeed);
        setBoardDataMode(bootstrap.kanban?.overwindProjection === "shell" ? "shell" : "full");
        setSceneGraph(activeGraph);
        setWorldDataMode(shouldUseDraft ? "draft" : bootstrapMode);
        setItemManager(nextItemStore);
        setItemDataMode(bootstrapMode);
        setInventoryStore(normalizeInventoryStore(
          bootstrap.inventory || FALLBACK_INVENTORY_STORE,
          nextAvatars.length ? nextAvatars : FALLBACK_AVATARS,
          nextItemStore.cards
        ));
        setSelectedPlaceId(activeGraph.places[0]?.id || null);
        setSelectedSceneId(activeGraph.scenes[0]?.id || null);
        setSelectedAvatarId(bootstrap.selectedAvatarId || nextAvatars[0]?.id || FALLBACK_AVATARS[0]?.id || null);
        setSelectedInventoryAvatarId(bootstrap.selectedAvatarId || nextAvatars[0]?.id || FALLBACK_AVATARS[0]?.id || null);
        setSelectedItemId(nextItemStore.cards[0]?.id || null);
        setApiState(shouldUseDraft ? "local" : "api");
        setWorldSyncState(shouldUseDraft ? "draft" : "saved");
        markQueueReady(
          "overwind-bootstrap",
          "Overwind shell bootstrap",
          bootstrap.telemetry?.waitingState || "Compact shell ready; full detail stores are queued."
        );
        if (shouldUseDraft) notify("Recovered unsynced world draft; retry sync when ready");
        if (avatarDraftMerge.recoveredCount) {
          notify(`Recovered ${avatarDraftMerge.recoveredCount} local avatar draft${avatarDraftMerge.recoveredCount === 1 ? "" : "s"}`);
          syncAvatarDraftRecords(avatarDraftMerge.pendingRecords, "startup");
        }
        window.setTimeout(refreshSubscriberStatus, 0);
        updateQueueJob("overwind-card-plane", "Overwind Card plane", {
          status: "queued",
          kind: "sync",
          detail: "Compact shell is active; the full Card library remains cold until a view needs Avatar or Item authoring records.",
          available: "Echos and other shell-backed views remain responsive.",
          queuedNext: "Hydrate the full Card library on explicit route intent.",
          blocking: false
        });
      })
      .catch(() => loadLegacyStores())
      .catch(() => {
        if (!alive) return;
        const localDraft = readWorldDraft();
        if (localDraft?.graph) {
          const draftGraph = normalizeSceneGraph(localDraft.graph);
          setSceneGraph(draftGraph);
          setSelectedPlaceId(draftGraph.places[0]?.id || null);
          setSelectedSceneId(draftGraph.scenes[0]?.id || null);
        }
        const avatarDraftMerge = mergeAvatarDrafts(FALLBACK_AVATARS, readAvatarDraftStore());
        const nextAvatars = avatarDraftMerge.avatars.length ? avatarDraftMerge.avatars : FALLBACK_AVATARS;
        setAvatars(nextAvatars);
        setApiState("local");
        setAvatarTeams(normalizeAvatarTeams([], nextAvatars));
        setAvatarDataMode("fallback");
        setItemManager(FALLBACK_ITEM_MANAGER);
        setItemDataMode("fallback");
        setBoardDataMode("fallback");
        setInventoryStore(normalizeInventoryStore(FALLBACK_INVENTORY_STORE, nextAvatars, FALLBACK_ITEM_MANAGER.cards));
        setWorldSyncState("draft");
        setWorldDataMode("fallback");
        updateQueueJob("overwind-bootstrap", "Overwind shell bootstrap", {
          status: "failed",
          kind: "bootstrap",
          detail: "API shell unavailable; local fallback data is active.",
          available: "Fallback avatars, world, items, and board are visible.",
          queuedNext: "Retry API when the local server is reachable.",
          blocking: false,
          error: "Overwind bootstrap failed"
        });
        if (avatarDraftMerge.recoveredCount) {
          setSelectedAvatarId(nextAvatars[0]?.id || null);
          setSelectedInventoryAvatarId(nextAvatars[0]?.id || null);
          notify(`Recovered ${avatarDraftMerge.recoveredCount} local avatar draft${avatarDraftMerge.recoveredCount === 1 ? "" : "s"} in local mode`);
        }
      });
    return () => {
      alive = false;
      if (overwindLibraryHydratorRef.current === hydrateOverwindLibrary) overwindLibraryHydratorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const needsFullCardLibrary = getBuilderHostTarget(activeView).lazyLoad
      .some((entry) => entry.store === "avatars" || entry.store === "items");
    if (!needsFullCardLibrary) return undefined;
    const timer = window.setTimeout(() => {
      overwindLibraryHydratorRef.current?.().catch((error) => updateQueueJob("overwind-card-plane", "Overwind Card plane", {
        status: "degraded",
        kind: "sync",
        detail: `Overwind hydration deferred: ${error.message}`,
        available: "Compact shell remains available.",
        queuedNext: "Retry Overwind Card hydration.",
        blocking: false
      }));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [activeView]);

  useEffect(() => {
    setTarotSyncState("queued");
    updateQueueJob("tarot-store", "Tarot library store", {
      status: "queued",
      kind: "store",
      detail: "Tarot Library data is cold until the Tarot workspace opens.",
      available: "Fallback Tarot shell and deck controls remain visible.",
      queuedNext: "Load full Tarot deck/card store on Tarot Library intent."
    });
  }, []);

  useEffect(() => {
    if (activeView === "echos") return undefined;
    if (!selectedAvatarId) return undefined;
    const currentAvatar = avatars.find((avatar) => avatar.id === selectedAvatarId);
    if (!currentAvatar || isCompactOverwindAvatar(currentAvatar)) {
      let cancelIdle = null;
      const delayMs = activeView === "protocol" ? 2400 : 1600;
      const timer = window.setTimeout(() => {
        cancelIdle = scheduleIdleTask(() => {
          ensureAvatarLoaded(selectedAvatarId, { force: true });
        }, 900);
      }, delayMs);
      return () => {
        window.clearTimeout(timer);
        cancelIdle?.();
      };
    }
    return undefined;
  }, [selectedAvatarId, avatars, activeView]);

  useEffect(() => {
    const cleanups = [];
    const defer = (loader, delayMs) => {
      const cleanup = scheduleDeferredLoad(loader, delayMs);
      cleanups.push(cleanup);
    };
    const loaders = { world: ensureWorldStoreLoaded, items: ensureItemStoreLoaded, kanban: ensureKanbanStoreLoaded, tarot: ensureTarotStoreLoaded, avatars: ensureFullAvatarStoreLoaded, "song-registry": ensureSongRegistryLoaded, songs: ensureHapaSongStoreLoaded };
    for (const entry of getBuilderHostTarget(activeView).lazyLoad) if (loaders[entry.store]) defer(loaders[entry.store], entry.delay);
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }, [activeView]);

  useEffect(() => {
    updateQueueJob("song-registry", "Dear Papa song registry", {
      status: "queued",
      kind: "store",
      detail: "Song registry is cold until Songs or Tarot needs it.",
      available: "Bundled Dear Papa fallback stays available.",
      queuedNext: "Load bounded registry page on route intent."
    });
  }, []);

  function cue(kind = "select") {
    if (!sound) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = kind === "drop" ? 420 : kind === "copy" ? 680 : 280;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  }

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2200);
  }

  function refreshSubscriberStatus() {
    fetch(`${API_BASE}/api/subscribers/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => {
        if (status) setSubscriberStatus(status);
      })
      .catch(() => {});
  }

  function updateQueueJob(id, label, patch = {}) {
    setQueueJobs((current) => upsertQueueJobState(current, id, label, patch));
  }

  function markQueueReady(id, label, detail = "Ready") {
    updateQueueJob(id, label, {
      status: "ready",
      detail,
      blocking: false
    });
  }

  function ensureSongRegistryLoaded() {
    if (songLibrary.status === "ready" || songLibrary.status === "loading") return;
    const registryListUrl = resolveSongRegistryUri("/api/song-registry/dear-papa?limit=500");
    const registryDetailUrl = (songId) => resolveSongRegistryUri(`/api/song-registry/songs/${encodeURIComponent(songId)}`);
    setSongLibrary((current) => ({ ...current, status: "loading", error: null }));
    updateQueueJob("song-registry", "Dear Papa song registry", {
      status: "loading",
      kind: "store",
      detail: "Loading bounded Dear Papa registry page.",
      available: "Bundled Dear Papa fallback remains usable.",
      queuedNext: "Optionally prefetch top song details within the configured cap.",
      blocking: false
    });
    fetch(registryListUrl)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Song Registry ${res.status}`))))
      .then(async (payload) => {
        const songs = Array.isArray(payload.songs) ? payload.songs : [];
        if (!SONG_REGISTRY_DETAIL_PREFETCH_LIMIT) {
          setSongLibrary({
            status: "ready",
            songs,
            total: Number(payload.total) || songs.length,
            error: null
          });
          markQueueReady("song-registry", "Dear Papa song registry", `${songs.length} registry songs loaded.`);
          return;
        }
        const detailResults = await Promise.allSettled(
          songs
            .slice(0, SONG_REGISTRY_DETAIL_PREFETCH_LIMIT)
            .filter((song) => song?.id)
            .map((song) =>
              fetch(registryDetailUrl(song.id))
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null)
            )
        );
        const detailsById = new Map(detailResults
          .map((result) => (result.status === "fulfilled" ? result.value : null))
          .filter((detail) => detail?.id)
          .map((detail) => [detail.id, detail]));
        setSongLibrary({
          status: "ready",
          songs: songs.map((song) => ({ ...song, ...(detailsById.get(song.id) || {}) })),
          total: Number(payload.total) || songs.length,
          error: null
        });
        markQueueReady("song-registry", "Dear Papa song registry", `${songs.length} registry songs loaded.`);
      })
      .catch((error) => {
        setSongLibrary({
          status: "error",
          songs: [],
          total: 0,
          error: error?.message || "Song Registry unavailable"
        });
        updateQueueJob("song-registry", "Dear Papa song registry", {
          status: "failed",
          kind: "store",
          detail: "Song registry unavailable; bundled fallback remains active.",
          available: "Fallback Dear Papa songbook is usable.",
          queuedNext: "Retry when Songs or Tarot needs live registry data.",
          blocking: false,
          error: error?.message || "Song Registry unavailable"
        });
      });
  }

  function syncAvatarDraftRecords(records = [], source = "avatar drafts") {
    const pendingRecords = records.filter((record) => record?.avatar?.id);
    if (!pendingRecords.length) return;
    Promise.allSettled(pendingRecords.map(async (record) => {
      const avatar = {
        ...record.avatar,
        updatedAt: record.savedAt || record.avatar.updatedAt || new Date().toISOString()
      };
      if (!record.existsOnServer) {
        const createResponse = await fetch(`${API_BASE}/api/avatars`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: avatar.id,
            names: (avatar.names || []).map((item) => item.name || item),
            primaryName: avatar.primaryName,
            summary: avatar.summary,
            operatorNotes: avatar.operatorNotes
          })
        });
        if (!createResponse.ok && createResponse.status !== 409) {
          throw new Error(`Avatar draft create failed: ${createResponse.status}`);
        }
      }
      const updateResponse = await fetch(`${API_BASE}/api/avatars/${encodeURIComponent(avatar.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(avatar)
      });
      if (!updateResponse.ok) {
        throw new Error(`Avatar draft save failed: ${updateResponse.status}`);
      }
      clearAvatarDraft(avatar.id);
      return avatar.id;
    }))
      .then((results) => {
        const savedCount = results.filter((result) => result.status === "fulfilled").length;
        const failedCount = results.length - savedCount;
        if (savedCount) {
          refreshSubscriberStatus();
          notify(`${savedCount} recovered avatar draft${savedCount === 1 ? "" : "s"} synced from ${source}`);
        }
        if (failedCount) {
          setApiState("local");
          notify(`${failedCount} avatar draft${failedCount === 1 ? "" : "s"} still local; API retry available`);
        }
      });
  }

  function updateJob(jobId, patch) {
    setUploadJobs((current) => current.map((job) => (job.id === jobId ? { ...job, ...patch } : job)));
  }

  function dismissJob(jobId, delay = 1800) {
    window.setTimeout(() => {
      setUploadJobs((current) => current.filter((job) => job.id !== jobId));
    }, delay);
  }

  function replaceAvatar(nextAvatar, message) {
    upsertAvatarDraft(nextAvatar, apiState === "api" ? "pending-api-save" : "local-mode-save");
    setAvatars((current) => current.map((avatar) => (avatar.id === nextAvatar.id ? nextAvatar : avatar)));
    setSelectedAvatarId(nextAvatar.id);
    if (message) notify(message);
    if (apiState === "api") {
      window.clearTimeout(persistTimers.current.get(nextAvatar.id));
      updateQueueJob("avatar-save", "Avatar save queue", {
        status: "queued",
        kind: "write",
        detail: `${nextAvatar.primaryName || nextAvatar.id} saved locally; API write queued.`,
        available: "Optimistic avatar changes are already visible.",
        queuedNext: "Persist Avatar Card JSON to local API.",
        blocking: false
      });
      persistTimers.current.set(
        nextAvatar.id,
        window.setTimeout(() => {
          persistTimers.current.delete(nextAvatar.id);
          updateQueueJob("avatar-save", "Avatar save queue", {
            status: "loading",
            kind: "write",
            detail: `Persisting ${nextAvatar.primaryName || nextAvatar.id} to API.`,
            available: "Optimistic avatar changes remain visible.",
            queuedNext: "Clear local draft after API save.",
            blocking: false
          });
          fetch(`${API_BASE}/api/avatars/${nextAvatar.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nextAvatar)
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Avatar save failed: ${res.status}`);
              clearAvatarDraft(nextAvatar.id);
              refreshSubscriberStatus();
              markQueueReady("avatar-save", "Avatar save queue", `${nextAvatar.primaryName || nextAvatar.id} saved to API.`);
            })
            .catch((error) => {
              setApiState("local");
              updateQueueJob("avatar-save", "Avatar save queue", {
                status: "failed",
                kind: "write",
                detail: "Avatar save stayed local; API retry remains available.",
                available: "Local draft preserves the edit.",
                queuedNext: "Retry when API is ready.",
                blocking: false,
                error: error?.message || "Avatar save failed"
              });
            });
        }, 120)
      );
    }
  }

  function ensureAvatarLoaded(avatarId, options = {}) {
    if (!avatarId) return Promise.resolve(null);
    const currentAvatar = avatars.find((avatar) => avatar.id === avatarId);
    if (!options.force && currentAvatar && !isCompactOverwindAvatar(currentAvatar)) {
      markQueueReady("selected-avatar-detail", "Selected avatar detail", `${currentAvatar.primaryName || avatarId} already loaded.`);
      return Promise.resolve(currentAvatar);
    }
    const requestId = avatarDetailRequestRef.current + 1;
    avatarDetailRequestRef.current = requestId;
    updateQueueJob("selected-avatar-detail", "Selected avatar detail", {
      status: "loading",
      kind: "avatar-detail",
      detail: `Loading detail for ${currentAvatar?.primaryName || avatarId}.`,
      available: currentAvatar ? "Compact shell avatar remains visible while detail loads." : "Avatar rail remains usable.",
      queuedNext: "Apply full Avatar Card only if this is still the latest selection.",
      blocking: false
    });
    return fetch(`${API_BASE}/api/avatars/${encodeURIComponent(avatarId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Avatar load failed: ${res.status}`))))
      .then((avatar) => {
        const normalizedAvatar = normalizeAvatarCard(avatar);
        if (requestId !== avatarDetailRequestRef.current) {
          updateQueueJob("selected-avatar-detail", "Selected avatar detail", {
            status: "stale",
            kind: "avatar-detail",
            detail: `${normalizedAvatar.primaryName || avatarId} detail arrived after a newer selection.`,
            available: "Newest selected avatar stays visible.",
            queuedNext: "Ignore stale response.",
            blocking: false
          });
          return normalizedAvatar;
        }
        setAvatars((current) => {
          if (current.some((item) => item.id === normalizedAvatar.id)) {
            return current.map((item) => (item.id === normalizedAvatar.id ? normalizedAvatar : item));
          }
          return [normalizedAvatar, ...current];
        });
        markQueueReady("selected-avatar-detail", "Selected avatar detail", `${normalizedAvatar.primaryName || avatarId} detail ready.`);
        return normalizedAvatar;
      })
      .catch((error) => {
        updateQueueJob("selected-avatar-detail", "Selected avatar detail", {
          status: "failed",
          kind: "avatar-detail",
          detail: `Could not load ${currentAvatar?.primaryName || avatarId}; compact shell remains visible.`,
          available: "Compact avatar data is still usable.",
          queuedNext: "Retry on next selection or explicit avatar intent.",
          blocking: false,
          error: error?.message || "Avatar detail load failed"
        });
        return null;
      });
  }

  function ensureFullAvatarStoreLoaded() {
    if (avatarDataMode === "full" || avatarDataMode === "loading-full") return;
    setAvatarDataMode("loading-full");
    updateQueueJob("full-avatar-store", "Full avatar store", {
      status: "loading",
      kind: "store",
      detail: "Hydrating full avatar store after route intent.",
      available: "Compact avatar shell and selected detail remain usable.",
      queuedNext: "Merge server avatars with local drafts.",
      blocking: false
    });
    fetch(`${API_BASE}/api/avatars`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Avatar store load failed: ${res.status}`))))
      .then((store) => {
        const serverAvatars = store.avatars || FALLBACK_AVATARS;
        const serverIds = new Set(serverAvatars.map((avatar) => avatar.id).filter(Boolean));
        const volatileDraftRecords = avatars
          .filter((avatar) => avatar?.id && !serverIds.has(avatar.id))
          .map((avatar) => ({ avatar, savedAt: new Date().toISOString(), reason: "visible-local-avatar" }));
        const avatarDraftMerge = mergeAvatarDrafts(serverAvatars, {
          ...readAvatarDraftStore(),
          records: [
            ...readAvatarDraftStore().records,
            ...volatileDraftRecords
          ]
        });
        const nextAvatars = avatarDraftMerge.avatars;
        setAvatars(nextAvatars);
        setAvatarTeams(normalizeAvatarTeams(store.teams || [], nextAvatars));
        setInventoryStore((current) => normalizeInventoryStore(current, nextAvatars, itemManager.cards));
        setAvatarDataMode("full");
        markQueueReady("full-avatar-store", "Full avatar store", `${nextAvatars.length} avatars loaded.`);
        if (avatarDraftMerge.recoveredCount) {
          notify(`Recovered ${avatarDraftMerge.recoveredCount} local avatar draft${avatarDraftMerge.recoveredCount === 1 ? "" : "s"}`);
          syncAvatarDraftRecords(avatarDraftMerge.pendingRecords, "full avatar load");
        }
      })
      .catch((error) => {
        setAvatarDataMode((current) => (current === "loading-full" ? "compact" : current));
        updateQueueJob("full-avatar-store", "Full avatar store", {
          status: "failed",
          kind: "store",
          detail: "Full avatar store stayed cold; compact shell remains active.",
          available: "Avatar rail and selected shell avatar are usable.",
          queuedNext: "Retry on next full-avatar route intent.",
          blocking: false,
          error: error?.message || "Avatar store load failed"
        });
      });
  }

  function ensureWorldStoreLoaded() {
    if (worldDataMode === "full" || worldDataMode === "loading" || worldDataMode === "draft") return;
    setWorldDataMode("loading");
    updateQueueJob("world-store", "World store", {
      status: "loading",
      kind: "store",
      detail: "Hydrating places and scenes after Scenes intent.",
      available: "World shell counts and placeholders remain visible.",
      queuedNext: "Replace shell scene graph with full world store.",
      blocking: false
    });
    fetch(`${API_BASE}/api/world`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`World load failed: ${res.status}`))))
      .then((world) => {
        const graph = normalizeSceneGraph(world || FALLBACK_SCENE_GRAPH);
        setSceneGraph(graph);
        setSelectedPlaceId((current) => current && graph.places.some((place) => place.id === current) ? current : graph.places[0]?.id || null);
        setSelectedSceneId((current) => current && graph.scenes.some((scene) => scene.id === current) ? current : graph.scenes[0]?.id || null);
        setWorldDataMode("full");
        markQueueReady("world-store", "World store", `${graph.places.length} places and ${graph.scenes.length} scenes loaded.`);
      })
      .catch((error) => {
        setWorldDataMode((current) => (current === "loading" ? "compact" : current));
        updateQueueJob("world-store", "World store", {
          status: "failed",
          kind: "store",
          detail: "World store failed; shell scene graph remains visible.",
          available: "Scene shell is usable.",
          queuedNext: "Retry when Scenes opens again.",
          blocking: false,
          error: error?.message || "World load failed"
        });
      });
  }

  function ensureItemStoreLoaded() {
    if (itemDataMode === "full" || itemDataMode === "loading") return;
    setItemDataMode("loading");
    updateQueueJob("item-store", "Item store", {
      status: "loading",
      kind: "store",
      detail: "Hydrating item cards after Items intent.",
      available: "Item shell counts remain visible.",
      queuedNext: "Normalize item and inventory references.",
      blocking: false
    });
    Promise.all([
      fetch(`${API_BASE}/api/items`).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Item load failed: ${res.status}`)))),
      fetch(`${API_BASE}/api/inventory`).then((res) => (res.ok ? res.json() : FALLBACK_INVENTORY_STORE)).catch(() => FALLBACK_INVENTORY_STORE)
    ])
      .then(([store, inventory]) => {
        const nextItemStore = normalizeItemManagerStore(store || FALLBACK_ITEM_MANAGER);
        const nextInventoryStore = normalizeInventoryStore(inventory || FALLBACK_INVENTORY_STORE, avatars, nextItemStore.cards);
        setItemManager(nextItemStore);
        setInventoryStore(nextInventoryStore);
        setSelectedItemId((current) => current && nextItemStore.cards.some((card) => card.id === current) ? current : nextItemStore.cards[0]?.id || null);
        setItemDataMode("full");
        markQueueReady("item-store", "Item store", `${nextItemStore.cards.length} item cards and ${nextInventoryStore.avatarInventories.length} inventories loaded.`);
      })
      .catch((error) => {
        setItemDataMode((current) => (current === "loading" ? "compact" : current));
        updateQueueJob("item-store", "Item store", {
          status: "failed",
          kind: "store",
          detail: "Item store failed; shell item catalog remains visible.",
          available: "Item shell is usable.",
          queuedNext: "Retry when Items opens again.",
          blocking: false,
          error: error?.message || "Item load failed"
        });
      });
  }

  function ensureHapaSongStoreLoaded() {
    if (songDataMode === "full" || songDataMode === "loading") return;
    setSongDataMode("loading");
    updateQueueJob("hapa-song-store", "Hapa song store", {
      status: "loading",
      kind: "store",
      detail: "Loading Hapa song links after song/Tarot intent.",
      available: "Dear Papa registry summary remains visible.",
      queuedNext: "Normalize song-to-avatar and song-to-scene links.",
      blocking: false
    });
    fetch(`${API_BASE}/api/hapa-songs`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Hapa Songs load failed: ${res.status}`))))
      .then((store) => {
        const nextStore = normalizeHapaSongStore(store || FALLBACK_HAPA_SONG_STORE, dearPapaSongbook, songLibrary);
        setHapaSongStore(nextStore);
        setSelectedHapaSongId((current) => current && nextStore.songs.some((song) => song.id === current) ? current : nextStore.songs[0]?.id || null);
        setSongDataMode("full");
        setApiState("api");
        markQueueReady("hapa-song-store", "Hapa song store", `${nextStore.songs.length} Hapa song cards loaded.`);
      })
      .catch(() => {
        const nextStore = createHapaSongStoreFromDearPapaSongbook(dearPapaSongbook, songLibrary);
        setHapaSongStore(nextStore);
        setSelectedHapaSongId((current) => current && nextStore.songs.some((song) => song.id === current) ? current : nextStore.songs[0]?.id || null);
        setSongDataMode("fallback");
        updateQueueJob("hapa-song-store", "Hapa song store", {
          status: "stale",
          kind: "store",
          detail: "Song API unavailable; Dear Papa fallback generated.",
          available: "Fallback song cards are usable.",
          queuedNext: "Retry when song/Tarot route opens again.",
          blocking: false
        });
      });
  }

  function ensureTarotStoreLoaded() {
    if (tarotDataMode === "full" || tarotDataMode === "loading") return;
    setTarotDataMode("loading");
    setTarotSyncState("loading");
    updateQueueJob("tarot-store", "Tarot library store", {
      status: "loading",
      kind: "store",
      detail: "Loading Tarot decks and card records after Tarot Library intent.",
      available: "Fallback Tarot shell remains visible.",
      queuedNext: "Normalize decks, sets, cards, backs, and links.",
      blocking: false
    });
    fetch(`${API_BASE}/api/tarot`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Tarot load failed: ${res.status}`))))
      .then((store) => {
        const tarotLibrary = normalizeTarotStore(store || FALLBACK_TAROT_STORE);
        setTarotStore(tarotLibrary);
        setSelectedTarotDeckId((current) => current || tarotDeckCollectionId(tarotLibrary.decks[0]?.id));
        setSelectedTarotCardId((current) => current && tarotLibrary.cards.some((card) => card.id === current) ? current : tarotLibrary.cards[0]?.id || null);
        setTarotSyncState("saved");
        setTarotDataMode("full");
        markQueueReady("tarot-store", "Tarot library store", `${tarotLibrary.cards.length} Tarot cards loaded.`);
      })
      .catch((error) => {
        setTarotSyncState("draft");
        setTarotDataMode("fallback");
        updateQueueJob("tarot-store", "Tarot library store", {
          status: "failed",
          kind: "store",
          detail: "Tarot store failed; fallback deck remains visible.",
          available: "Fallback Tarot controls are usable.",
          queuedNext: "Retry when Tarot Library opens again.",
          blocking: false,
          error: error?.message || "Tarot load failed"
        });
      });
  }

  function ensureKanbanStoreLoaded() {
    if (boardDataMode === "full" || boardDataMode === "loading") return;
    setBoardDataMode("loading");
    updateQueueJob("kanban-store", "Kanban board store", {
      status: "loading",
      kind: "store",
      detail: "Loading full Kanban board after Kanban route intent.",
      available: "Shell board lanes and total counts are visible.",
      queuedNext: "Replace capped shell cards with the full board store.",
      blocking: false
    });
    fetch(`${API_BASE}/api/kanban`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Kanban load failed: ${res.status}`))))
      .then((nextBoard) => {
        setBoard(nextBoard || kanbanSeed);
        setBoardDataMode("full");
        markQueueReady("kanban-store", "Kanban board store", `${nextBoard?.lanes?.length || 0} lanes loaded.`);
      })
      .catch((error) => {
        setBoardDataMode((current) => (current === "loading" ? "shell" : current));
        updateQueueJob("kanban-store", "Kanban board store", {
          status: "failed",
          kind: "store",
          detail: "Full Kanban store failed; shell board remains visible.",
          available: "Capped board lanes and counts are usable.",
          queuedNext: "Retry when Kanban opens again.",
          blocking: false,
          error: error?.message || "Kanban load failed"
        });
      });
  }

  function queueSceneGraphPersist(graph, options = {}) {
    const normalizedGraph = normalizeSceneGraph(graph);
    saveWorldDraft(normalizedGraph);
    setWorldSyncState("syncing");
    updateQueueJob("world-save", "World save queue", {
      status: "queued",
      kind: "write",
      detail: "World graph saved locally; API write queued.",
      available: "Updated places and scenes are visible immediately.",
      queuedNext: "Persist world store to local API.",
      blocking: false
    });
    window.clearTimeout(scenePersistTimer.current);
    scenePersistTimer.current = window.setTimeout(() => {
      updateQueueJob("world-save", "World save queue", {
        status: "loading",
        kind: "write",
        detail: "Persisting world graph to API.",
        available: "Local world draft remains active.",
        queuedNext: "Clear local world draft after API save.",
        blocking: false
      });
      fetch(`${API_BASE}/api/world`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedGraph)
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Scene graph save failed: ${res.status}`);
          await res.json().catch(() => null);
          clearWorldDraft();
          setApiState("api");
          setWorldSyncState("saved");
          if (options.successMessage) notify(options.successMessage);
          refreshSubscriberStatus();
          markQueueReady("world-save", "World save queue", "World graph saved to API.");
        })
        .catch((error) => {
          setApiState("local");
          setWorldSyncState("draft");
          if (options.failMessage) notify(options.failMessage);
          updateQueueJob("world-save", "World save queue", {
            status: "failed",
            kind: "write",
            detail: "World graph stayed in local draft mode.",
            available: "Local world draft remains visible.",
            queuedNext: "Retry world sync from the top bar.",
            blocking: false,
            error: error?.message || "World save failed"
          });
        });
    }, options.immediate ? 0 : 140);
  }

  function replaceSceneGraph(nextGraph, message) {
    const graph = normalizeSceneGraph(nextGraph);
    saveWorldDraft(graph);
    setSceneGraph(graph);
    if (!graph.places.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(graph.places[0]?.id || null);
    }
    if (!graph.scenes.some((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(graph.scenes[0]?.id || null);
    }
    if (message) notify(message);
    queueSceneGraphPersist(graph, {
      failMessage: apiState === "api" ? "World saved locally; API retry available" : ""
    });
  }

  function queueTarotPersist(store, options = {}) {
    const normalized = normalizeTarotStore(store);
    setTarotSyncState("syncing");
    updateQueueJob("tarot-save", "Tarot save queue", {
      status: "queued",
      kind: "write",
      detail: "Tarot edits are local; API write queued.",
      available: "Updated deck/card state is visible immediately.",
      queuedNext: "Persist Tarot store to local API.",
      blocking: false
    });
    window.clearTimeout(tarotPersistTimer.current);
    tarotPersistTimer.current = window.setTimeout(() => {
      updateQueueJob("tarot-save", "Tarot save queue", {
        status: "loading",
        kind: "write",
        detail: "Persisting Tarot store to API.",
        available: "Local Tarot edits remain active.",
        queuedNext: "Refresh subscriber status after save.",
        blocking: false
      });
      fetch(`${API_BASE}/api/tarot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized)
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Tarot save failed: ${res.status}`);
          await res.json().catch(() => null);
          setApiState("api");
          setTarotSyncState("saved");
          if (options.successMessage) notify(options.successMessage);
          refreshSubscriberStatus();
          markQueueReady("tarot-save", "Tarot save queue", "Tarot store saved to API.");
        })
        .catch((error) => {
          setApiState("local");
          setTarotSyncState("draft");
          if (options.failMessage) notify(options.failMessage);
          updateQueueJob("tarot-save", "Tarot save queue", {
            status: "failed",
            kind: "write",
            detail: "Tarot save stayed local; retry remains available.",
            available: "Local Tarot edits remain visible.",
            queuedNext: "Retry on next Tarot save.",
            blocking: false,
            error: error?.message || "Tarot save failed"
          });
        });
    }, options.immediate ? 0 : 160);
  }

  function replaceTarotStore(nextStore, message) {
    const store = normalizeTarotStore(nextStore);
    setTarotStore(store);
    const collectionKind = tarotCollectionKind(selectedTarotDeckId);
    const collectionEntityId = tarotCollectionEntityId(selectedTarotDeckId);
    const hasCollection = collectionKind === "standalone"
      || (collectionKind === "deck" && store.decks.some((deck) => deck.id === collectionEntityId))
      || (collectionKind === "set" && store.sets.some((set) => set.id === collectionEntityId));
    if (!hasCollection) {
      setSelectedTarotDeckId(tarotDeckCollectionId(store.decks[0]?.id));
    }
    if (!store.cards.some((card) => card.id === selectedTarotCardId)) {
      setSelectedTarotCardId(store.cards[0]?.id || null);
    }
    if (message) notify(message);
    queueTarotPersist(store, {
      failMessage: apiState === "api" ? "Tarot saved locally; API retry available" : ""
    });
  }

  function replaceItemManager(nextStore, message) {
    const store = normalizeItemManagerStore(nextStore);
    setItemManager(store);
    if (!store.cards.some((card) => card.id === selectedItemId)) {
      setSelectedItemId(store.cards[0]?.id || null);
    }
    if (message) notify(message);
    updateQueueJob("item-save", "Item save queue", {
      status: "loading",
      kind: "write",
      detail: "Persisting item manager store to API.",
      available: "Optimistic item changes are already visible.",
      queuedNext: "Refresh item subscribers after save.",
      blocking: false
    });
    fetch(`${API_BASE}/api/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store)
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Item save failed: ${res.status}`);
        setApiState("api");
        refreshSubscriberStatus();
        markQueueReady("item-save", "Item save queue", "Item manager store saved to API.");
      })
      .catch((error) => {
        setApiState("local");
        updateQueueJob("item-save", "Item save queue", {
          status: "failed",
          kind: "write",
          detail: "Item save stayed local; retry remains available.",
          available: "Optimistic item state remains visible.",
          queuedNext: "Retry on next item edit.",
          blocking: false,
          error: error?.message || "Item save failed"
        });
      });
  }

  function handleCreateItemCard(input) {
    const card = createItemCard(input);
    const nextStore = normalizeItemManagerStore({
      ...normalizedItemManager,
      cards: [card, ...normalizedItemManager.cards.filter((item) => item.id !== card.id)],
      updatedAt: new Date().toISOString()
    });
    setSelectedItemId(card.id);
    replaceItemManager(nextStore, `${card.title} item card created`);
    cue("copy");
  }

  function handleUpdateItemCard(cardId, patch, message = "Item card updated") {
    const nextStore = normalizeItemManagerStore({
      ...normalizedItemManager,
      cards: normalizedItemManager.cards.map((card) =>
        card.id === cardId ? createItemCard({ ...card, ...patch, id: card.id, updatedAt: new Date().toISOString() }) : card
      ),
      updatedAt: new Date().toISOString()
    });
    replaceItemManager(nextStore, message);
    cue("copy");
  }

  function replaceInventoryStore(nextStore, message) {
    const store = normalizeInventoryStore(nextStore, avatars, normalizedItemManager.cards);
    setInventoryStore(store);
    if (message) notify(message);
    fetch(`${API_BASE}/api/inventory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store)
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Inventory save failed: ${res.status}`);
        setApiState("api");
        refreshSubscriberStatus();
      })
      .catch(() => setApiState("local"));
  }

  function replaceHapaSongStore(nextStore, message = "") {
    const store = normalizeHapaSongStore(nextStore, dearPapaSongbook, songLibrary);
    setHapaSongStore(store);
    setSelectedHapaSongId((current) => current && store.songs.some((song) => song.id === current) ? current : store.songs[0]?.id || null);
    if (message) notify(message);
    fetch(`${API_BASE}/api/hapa-songs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store)
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Hapa Songs save failed: ${res.status}`);
        setApiState("api");
        setSongDataMode("full");
        refreshSubscriberStatus();
      })
      .catch(() => {
        setApiState("local");
        setSongDataMode("fallback");
      });
  }

  function handleUpdateHapaSong(nextSong, message = "Song updated") {
    const nextStore = upsertSongInStore(normalizedHapaSongStore, nextSong, dearPapaSongbook, songLibrary);
    setSelectedHapaSongId(nextSong.id);
    replaceHapaSongStore(nextStore, message);
    cue("copy");
  }

  function handleSongAvatarToggle(songId, avatarId) {
    const song = normalizedHapaSongStore.songs.find((item) => item.id === songId);
    const avatar = avatars.find((item) => item.id === avatarId);
    if (!song || !avatar) return;
    const exists = (song.attachments?.avatarLinks || []).some((link) => link.avatarId === avatarId);
    const nextSong = exists ? detachAvatarFromSong(song, avatarId) : attachAvatarToSong(song, avatar);
    handleUpdateHapaSong(nextSong, exists ? `${avatar.primaryName} detached from ${song.title}` : `${avatar.primaryName} attached to ${song.title}`);
  }

  function handleSongSceneToggle(songId, sceneId) {
    const song = normalizedHapaSongStore.songs.find((item) => item.id === songId);
    const scene = normalizedSceneGraph.scenes.find((item) => item.id === sceneId);
    if (!song || !scene) return;
    const exists = (song.attachments?.sceneLinks || []).some((link) => link.sceneId === sceneId);
    const nextSong = exists ? detachSceneFromSong(song, sceneId) : attachSceneToSong(song, scene);
    handleUpdateHapaSong(nextSong, exists ? `${scene.title} detached from ${song.title}` : `${scene.title} attached to ${song.title}`);
  }

  async function handleSongMediaUpload(songId, files) {
    const song = normalizedHapaSongStore.songs.find((item) => item.id === songId);
    if (!song) return;
    const assets = await processLocalFiles([...files], "song-media", "song_media", `Attach media to ${song.title}`);
    if (!assets.length) {
      notify("No song media selected");
      return;
    }
    let nextSong = song;
    for (const asset of assets) {
      nextSong = attachSongMedia(nextSong, asset, {
        source: "hapa-avatar-builder-song-upload",
        notes: `Uploaded directly into ${song.title}.`
      });
    }
    handleUpdateHapaSong(nextSong, `Attached ${assets.length} media asset${assets.length === 1 ? "" : "s"} to ${song.title}`);
    cue("drop");
  }

  function handleSongVisualizerToggle(songId, visualizerId) {
    const song = normalizedHapaSongStore.songs.find((item) => item.id === songId);
    const visualizer = (normalizedHapaSongStore.visualizerCatalog || HAPA_SONG_VISUALIZER_CATALOG).find((item) => item.id === visualizerId);
    if (!song || !visualizer) return;
    const exists = (song.visualizers || []).some((link) => link.id === visualizerId);
    const nextSong = exists ? detachVisualizerFromSong(song, visualizerId) : attachVisualizerToSong(song, visualizer);
    handleUpdateHapaSong(nextSong, exists ? `${visualizer.label} removed from ${song.title}` : `${visualizer.label} attached to ${song.title}`);
  }

  function handleSongStoryBeat(songId, input) {
    const song = normalizedHapaSongStore.songs.find((item) => item.id === songId);
    if (!song) return;
    const nextSong = addSongStoryBeat(song, input);
    handleUpdateHapaSong(nextSong, `Story beat added to ${song.title}`);
  }

  function handleEquipItemCard({ avatarId, cardId, hardpointId, zone }) {
    const avatar = avatars.find((item) => item.id === avatarId);
    const card = normalizedItemManager.cards.find((item) => item.id === cardId);
    if (!avatar || !card) return;
    const nextStore = equipItemCard(
      normalizedInventoryStore,
      { avatarId: avatar.id, avatarName: avatar.primaryName },
      card,
      hardpointId || "items",
      zone || "equipped"
    );
    setSelectedInventoryAvatarId(avatar.id);
    setSelectedItemId(card.id);
    replaceInventoryStore(nextStore, `${card.title} equipped to ${avatar.primaryName}`);
    cue("drop");
  }

  async function processLocalFiles(files, source = "file-picker", requirementId = "local_preview", label = "Media upload") {
    const mediaFiles = [...files].filter(isSupportedLocalAsset);
    if (!mediaFiles.length) return [];
    const jobId = `upload-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
    const startedAt = Date.now();
    setUploadJobs((current) => [
      {
        id: jobId,
        label,
        status: "processing",
        stage: "Queue accepted",
        detail: `${mediaFiles.length} file${mediaFiles.length === 1 ? "" : "s"} ready`,
        total: mediaFiles.length,
        completed: 0,
        percent: 1,
        startedAt
      },
      ...current
    ].slice(0, 4));
    await waitForPaint();

    const assets = [];
    for (let index = 0; index < mediaFiles.length; index += 1) {
      const file = mediaFiles[index];
      const updateStage = ({ stage, detail, progress = 0 }) => {
        const percent = Math.max(1, Math.min(99, Math.round(((index + progress) / mediaFiles.length) * 100)));
        setUploadJobs((current) => current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                stage,
                detail: detail || file.name,
                activeFile: file.name,
                completed: index,
                percent
              }
            : job
        ));
      };
      updateStage({ stage: "Reading file", detail: file.name, progress: 0.08 });
      await waitForPaint();
      const asset = await assetFromFile(file, source, requirementId, updateStage);
      assets.push(asset);
      setUploadJobs((current) => current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              stage: "Asset staged",
              detail: asset.name,
              activeFile: file.name,
              completed: index + 1,
              percent: Math.round(((index + 1) / mediaFiles.length) * 100)
            }
          : job
      ));
      await waitForPaint();
    }

    setUploadJobs((current) => current.map((job) =>
      job.id === jobId
        ? {
            ...job,
            status: "complete",
            stage: "Ready",
            detail: `${assets.length} asset${assets.length === 1 ? "" : "s"} available`,
            completed: mediaFiles.length,
            percent: 100
          }
        : job
    ));
    window.setTimeout(() => {
      setUploadJobs((current) => current.filter((job) => job.id !== jobId));
    }, 1800);
    return assets;
  }

  function revealInspectorForSelection() {
    window.requestAnimationFrame(() => {
      const inspector = inspectorRef.current;
      if (!inspector) return;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      inspector.scrollTop = 0;

      const rect = inspector.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 78);
      const horizontallyVisible = rect.right > 0 && rect.left < window.innerWidth;
      const needsViewportReveal =
        visibleHeight < Math.min(260, rect.height) ||
        !horizontallyVisible ||
        window.getComputedStyle(inspector).position === "static";

      if (needsViewportReveal) {
        inspector.scrollIntoView({ block: "start", inline: "nearest", behavior });
      }
    });
  }

  function selectAsset(assetId) {
    setSelectedAssetId(assetId);
    if (assetId) revealInspectorForSelection();
  }

  async function createNewAvatar() {
    const jobId = `avatar-create-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
    const startedAt = Date.now();
    setUploadJobs((current) => [
      {
        id: jobId,
        label: "Avatar scaffold",
        status: "processing",
        stage: "Creating local card",
        detail: "Preparing slots, card, sync registration",
        total: 4,
        completed: 0,
        percent: 8,
        startedAt
      },
      ...current
    ].slice(0, 4));
    notify("Creating avatar scaffold...");
    await waitForPaint();

    const avatar = createAvatarScaffold({
      names: [`Avatar ${avatars.length + 1}`],
      summary: "New scaffold awaiting media.",
      operatorNotes: "Created in Hapa Avatar Builder."
    });
    upsertAvatarDraft(avatar, "new-avatar-scaffold");
    setAvatars((current) => [avatar, ...current]);
    setSelectedAvatarId(avatar.id);
    setSelectedAssetId(null);
    setActiveView("builder");
    updateJob(jobId, {
      stage: "Local scaffold ready",
      detail: `${avatar.primaryName} has ${avatar.slots.length} target slots`,
      completed: 1,
      percent: 42
    });
    await waitForPaint();

    if (apiState === "api") {
      updateJob(jobId, {
        stage: "Registering subscribers",
        detail: "Writing Hapa Atlas and Second Brain outbox events",
        completed: 2,
        percent: 68
      });
      fetch(`${API_BASE}/api/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: avatar.id,
          names: avatar.names.map((item) => item.name),
          primaryName: avatar.primaryName,
          summary: avatar.summary,
          operatorNotes: avatar.operatorNotes
        })
      })
        .then((res) => {
          if (!res.ok && res.status !== 409) throw new Error(`Avatar create failed: ${res.status}`);
          clearAvatarDraft(avatar.id);
          updateJob(jobId, {
            status: "complete",
            stage: "Scaffold online",
            detail: `${avatar.primaryName} queued for Atlas + Second Brain`,
            completed: 4,
            percent: 100
          });
          notify(`${avatar.primaryName} scaffold ready; Atlas + Second Brain queued`);
          refreshSubscriberStatus();
          dismissJob(jobId);
        })
        .catch(() => {
          setApiState("local");
          updateJob(jobId, {
            status: "complete",
            stage: "Local scaffold ready",
            detail: "API unavailable; local card remains editable",
            completed: 4,
            percent: 100
          });
          notify(`${avatar.primaryName} scaffold ready in local mode`);
          dismissJob(jobId);
        });
    } else {
      updateJob(jobId, {
        status: "complete",
        stage: "Local scaffold ready",
        detail: `${avatar.primaryName} is ready for media`,
        completed: 4,
        percent: 100
      });
      dismissJob(jobId);
    }
    cue("select");
  }

  function handleRenameAvatar(event) {
    event.preventDefault();
    if (!selectedAvatar) return;
    const formData = new FormData(event.currentTarget);
    const draft = {
      primaryName: String(formData.get("primaryName") || identityDraft.primaryName || ""),
      aliases: String(formData.get("aliases") || identityDraft.aliases || "")
    };
    setIdentityDraft(draft);
    const nextAvatar = renameAvatarIdentity(selectedAvatar, draft);
    replaceAvatar(nextAvatar, `Renamed avatar to ${nextAvatar.names.map((item) => item.name).join(" / ")}`);
    cue("copy");
  }

  function handleMindPatch(patch, message = "") {
    if (!selectedAvatar) return;
    const nextAvatar = upsertAvatarMind(selectedAvatar, patch);
    replaceAvatar(nextAvatar, message);
    if (message) cue("copy");
  }

  function queueAvatarTeamsPersist(nextTeams, options = {}) {
    const teams = normalizeAvatarTeams(nextTeams, avatars);
    updateQueueJob("team-save", "Team save queue", {
      status: "queued",
      kind: "write",
      detail: "Team assignment saved locally; API write queued.",
      available: "Updated team rail is visible immediately.",
      queuedNext: "Persist avatar team grouping to local API.",
      blocking: false
    });
    window.clearTimeout(teamsPersistTimer.current);
    teamsPersistTimer.current = window.setTimeout(() => {
      updateQueueJob("team-save", "Team save queue", {
        status: "loading",
        kind: "write",
        detail: "Persisting avatar team grouping to API.",
        available: "Optimistic team rail remains visible.",
        queuedNext: "Refresh team subscribers after save.",
        blocking: false
      });
      fetch(`${API_BASE}/api/avatar-teams`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams })
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Team save failed: ${res.status}`);
          const saved = await res.json().catch(() => null);
          if (saved?.teams) setAvatarTeams(saved.teams);
          setApiState("api");
          if (options.successMessage) notify(options.successMessage);
          refreshSubscriberStatus();
          markQueueReady("team-save", "Team save queue", "Avatar team grouping saved to API.");
        })
        .catch((error) => {
          setApiState("local");
          if (options.failMessage) notify(options.failMessage);
          updateQueueJob("team-save", "Team save queue", {
            status: "failed",
            kind: "write",
            detail: "Team save stayed local; retry remains available.",
            available: "Optimistic team rail remains visible.",
            queuedNext: "Retry on next team edit.",
            blocking: false,
            error: error?.message || "Team save failed"
          });
        });
    }, options.immediate ? 0 : 140);
  }

  function replaceAvatarTeams(nextTeams, message) {
    const teams = normalizeAvatarTeams(nextTeams, avatars);
    setAvatarTeams(teams);
    if (message) notify(message);
    queueAvatarTeamsPersist(teams, {
      failMessage: "Team changes saved locally; API retry available"
    });
  }

  function toggleTeamExpanded(teamId) {
    setExpandedTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId]
    );
  }

  function handleCreateAvatarTeam(event) {
    event.preventDefault();
    const title = teamDraft.title.trim() || `Avatar Team ${normalizedAvatarTeams.length + 1}`;
    const team = createAvatarTeam({
      title,
      description: "Local Avatar Builder team grouping."
    });
    replaceAvatarTeams([...normalizedAvatarTeams, team], `${team.title} created`);
    setExpandedTeamIds((current) => current.includes(team.id) ? current : [...current, team.id]);
    setTeamDraft((draft) => ({ ...draft, title: "", teamId: team.id }));
    cue("copy");
  }

  function handleSaveAvatarTeamAssignment(event) {
    event.preventDefault();
    if (!selectedAvatar) return;
    let nextTeams = assignAvatarToTeam(
      normalizedAvatarTeams,
      selectedAvatar.id,
      teamDraft.teamId,
      teamDraft.role || "Support"
    );
    if (teamDraft.teamId && teamDraft.teamId !== "__ungrouped") {
      nextTeams = updateAvatarTeamMember(nextTeams, selectedAvatar.id, {
        role: teamDraft.role || "Support",
        notes: teamDraft.notes || ""
      });
      setExpandedTeamIds((current) => current.includes(teamDraft.teamId) ? current : [...current, teamDraft.teamId]);
    }
    replaceAvatarTeams(
      nextTeams,
      teamDraft.teamId === "__ungrouped"
        ? `${selectedAvatar.primaryName} moved to Ungrouped`
        : `${selectedAvatar.primaryName} team role saved`
    );
    cue("drop");
  }

  async function handleDrop(event, requirementId, slotId = null, anchorAsset = null) {
    event.preventDefault();
    if (!selectedAvatar) return;
    const draggedSlotId = event.dataTransfer.getData("application/x-hapa-slot-id");
    const draggedRequirementId = event.dataTransfer.getData("application/x-hapa-requirement-id");
    const draggedAssetId =
      event.dataTransfer.getData("application/x-hapa-asset-id") ||
      selectedAvatar.slots.find((slot) => slot.id === draggedSlotId)?.assetId ||
      null;
    if (draggedSlotId) {
      if (slotId && draggedRequirementId === requirementId && draggedSlotId !== slotId) {
        handleSectionReorder(requirementId, draggedSlotId, slotId);
      } else if (draggedRequirementId !== requirementId && draggedAssetId) {
        handleRequirementMove(draggedAssetId, draggedRequirementId, requirementId, slotId);
      }
      return;
    }

    const droppedFiles = [...(event.dataTransfer.files || [])];
    const assets = droppedFiles.length
      ? await processLocalFiles(droppedFiles, "slot-drop", requirementId, `Attach to ${requirementById(requirementId)?.shortLabel || "section"}`)
      : await assetsFromDrop(event, requirementId, [...intake, ...selectedAvatar.assets]);
    if (!assets.length) return;

    const videoAssets = assets.filter((asset) => asset.type === "video");
    if (videoAssets.length) {
      if (anchorAsset?.type === "image") {
        attachVideosToImage(anchorAsset, videoAssets);
        return;
      }
      addAssetsToIntake(videoAssets, "Video staged. Select an image state to branch it.");
      return;
    }

    let nextAvatar = selectedAvatar;
    const assignmentSlotId = anchorAsset ? null : slotId;
    for (const asset of assets) {
      nextAvatar = assignAssetToSlot(nextAvatar, { ...asset, requirementId }, assignmentSlotId);
    }
    const targetLabel = requirementById(requirementId)?.shortLabel || "section";
    const attachMessage = anchorAsset
      ? `Added ${assets.length} asset${assets.length === 1 ? "" : "s"} to ${targetLabel}; existing card preserved`
      : `Attached ${assets.length} asset${assets.length === 1 ? "" : "s"}`;
    replaceAvatar(nextAvatar, attachMessage);
    selectAsset(assets.at(-1).id);
    setIntake((current) => current.filter((asset) => !assets.some((dropped) => dropped.id === asset.id)));
    cue("drop");
  }

  function handleRequirementMove(assetId, sourceRequirementId, targetRequirementId, targetSlotId = null) {
    if (!selectedAvatar || !assetId) return;
    const movedBefore = selectedAvatar.assets.find((asset) => asset.id === assetId);
    const sourceLabel = requirementById(sourceRequirementId)?.label || sourceRequirementId || "Avatar";
    const targetRequirement = requirementById(targetRequirementId);
    const targetLabel = targetRequirement?.label || targetRequirementId || "Avatar";
    const nextAvatar = moveAssetToRequirement(selectedAvatar, assetId, targetRequirementId, targetSlotId);
    const movedAfter = nextAvatar.assets.find((asset) => asset.id === assetId);
    const nextAudit = auditAvatar(nextAvatar).byRequirement.find((item) => item.id === targetRequirementId);
    replaceAvatar(
      nextAvatar,
      `${movedAfter?.name || movedBefore?.name || "Asset"} moved: ${sourceLabel} -> ${targetLabel}. ${sectionAuditReadout(nextAudit)} Sync queued.`
    );
    selectAsset(assetId);
    cue("drop");
  }

  function handleSectionReorder(requirementId, sourceSlotId, targetSlotId) {
    if (!selectedAvatar) return;
    const movedAssetId = selectedAvatar.slots.find((slot) => slot.id === sourceSlotId)?.assetId || null;
    const nextAvatar = reorderRequirementAssets(selectedAvatar, requirementId, sourceSlotId, targetSlotId);
    replaceAvatar(nextAvatar, "Section default order updated");
    if (movedAssetId) selectAsset(movedAssetId);
    cue("drop");
  }

  function attachVideosToImage(parentAsset, videoAssets) {
    if (!selectedAvatar || !parentAsset || parentAsset.type !== "image") return;
    let nextAvatar = selectedAvatar;
    for (const video of videoAssets) {
      nextAvatar = attachVideoBranch(nextAvatar, video, parentAsset.id);
    }
    replaceAvatar(nextAvatar, `Attached ${videoAssets.length} video branch${videoAssets.length === 1 ? "" : "es"}`);
    selectAsset(videoAssets.at(-1).id);
    setIntake((current) => current.filter((asset) => !videoAssets.some((video) => video.id === asset.id)));
    cue("drop");
  }

  async function handleVideoBranchDrop(event, parentAsset) {
    event.preventDefault();
    if (!parentAsset || !selectedAvatar) return;
    const droppedFiles = [...(event.dataTransfer.files || [])];
    const assets = droppedFiles.length
      ? await processLocalFiles(droppedFiles, "video-branch", parentAsset.requirementId || "video_branch", "Video branch upload")
      : await assetsFromDrop(event, parentAsset.requirementId, [...intake, ...selectedAvatar.assets]);
    const videos = assets.filter((asset) => asset.type === "video");
    if (!videos.length) {
      notify("Drop video files or staged video assets onto an image state");
      return;
    }
    attachVideosToImage(parentAsset, videos);
  }

  async function handleVideoPicker(event, parentAsset) {
    const assets = await processLocalFiles([...event.target.files], "video-branch", parentAsset?.requirementId || "video_branch", "Video branch upload");
    event.target.value = "";
    const videos = assets.filter((asset) => asset.type === "video");
    if (!videos.length) {
      notify("No local videos selected");
      return;
    }
    attachVideosToImage(parentAsset, videos);
  }

  async function handleAvatarModelDrop(event) {
    event.preventDefault();
    if (!selectedAvatar) return;
    const droppedFiles = [...(event.dataTransfer.files || [])];
    const assets = droppedFiles.length
      ? await processLocalFiles(droppedFiles, "3d-avatar-upload", AVATAR_MODEL_REQUIREMENT_ID, "3D avatar upload")
      : await assetsFromDrop(event, AVATAR_MODEL_REQUIREMENT_ID, [...intake, ...selectedAvatar.assets]);
    const models = assets.filter((asset) => asset.type === "model");
    if (!models.length) {
      notify("Drop a GLB or GLTF animated avatar file");
      return;
    }
    attachModelsToAvatar(models);
  }

  async function handleAvatarModelPicker(event) {
    const assets = await processLocalFiles([...event.target.files], "3d-avatar-upload", AVATAR_MODEL_REQUIREMENT_ID, "3D avatar upload");
    event.target.value = "";
    const models = assets.filter((asset) => asset.type === "model");
    if (!models.length) {
      notify("No GLB or GLTF avatar model selected");
      return;
    }
    attachModelsToAvatar(models);
  }

  function attachModelsToAvatar(models) {
    if (!selectedAvatar) return;
    let nextAvatar = selectedAvatar;
    for (const model of models) {
      nextAvatar = attachAvatarModel(nextAvatar, model);
    }
    replaceAvatar(nextAvatar, `Attached ${models.length} 3D avatar file${models.length === 1 ? "" : "s"}`);
    selectAsset(models.at(-1).id);
    setIntake((current) => current.filter((asset) => !models.some((model) => model.id === asset.id)));
    cue("drop");
  }

  function handleAvatarModelReady(assetId, stats) {
    if (!selectedAvatar || !assetId) return;
    const asset = selectedAvatar.assets.find((item) => item.id === assetId);
    if (modelStatsMatch(asset, stats)) return;
    const nextAvatar = setAvatarModelStats(selectedAvatar, assetId, stats);
    replaceAvatar(nextAvatar);
  }

  function handleAvatarModelDefaultAnimation(assetId, clipName) {
    if (!selectedAvatar || !assetId || !clipName) return;
    const nextAvatar = setAvatarModelDefaultAnimation(selectedAvatar, assetId, clipName);
    const updatedAsset = nextAvatar.assets.find((asset) => asset.id === assetId) || null;
    if (updatedAsset) {
      setExpandedAsset((current) => expansionMatchesAsset(current, assetId) ? updateAssetExpansion(current, updatedAsset) : current);
    }
    replaceAvatar(nextAvatar, `${clipName} set as default animation`);
    cue("select");
  }

  async function handleIntakeDrop(event) {
    event.preventDefault();
    const assets = await processLocalFiles([...event.dataTransfer.files], "local-drop", "local_preview", "Media intake upload");
    if (!assets.length) {
      notify("Drop local image or video files here to preview them");
      return;
    }
    addAssetsToIntake(assets);
  }

  async function handleLocalPicker(event) {
    const assets = await processLocalFiles([...event.target.files], "file-picker", "local_preview", "Media intake upload");
    event.target.value = "";
    if (!assets.length) {
      notify("No local images or videos selected");
      return;
    }
    addAssetsToIntake(assets);
  }

  function addAssetsToIntake(assets, message = null) {
    setIntake((current) => {
      const existing = new Set(current.map((asset) => asset.id));
      return [...assets.filter((asset) => !existing.has(asset.id)), ...current];
    });
    selectAsset(assets[0].id);
    notify(message || `Previewing ${assets.length} local media asset${assets.length === 1 ? "" : "s"}`);
    cue("select");
  }

  function handleTag(tag) {
    if (!selectedAvatar || !selectedAsset) return;
    if (selectedAvatarAsset) {
      const nextAvatar = toggleAssetTag(selectedAvatar, selectedAsset.id, tag);
      replaceAvatar(nextAvatar);
    } else {
      setIntake((current) =>
        current.map((asset) =>
          asset.id === selectedAsset.id
            ? {
                ...asset,
                tags: asset.tags.includes(tag)
                  ? asset.tags.filter((item) => item !== tag)
                  : [...asset.tags, tag]
              }
            : asset
        )
      );
    }
    cue("select");
  }

  function handleAssetTag(assetId, tag) {
    if (!selectedAvatar || !assetId) return;
    const avatarAsset = selectedAvatar.assets.find((asset) => asset.id === assetId);
    if (avatarAsset) {
      replaceAvatar(toggleAssetTag(selectedAvatar, assetId, tag));
      setSelectedAssetId(assetId);
    } else {
      setIntake((current) =>
        current.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                tags: asset.tags.includes(tag)
                  ? asset.tags.filter((item) => item !== tag)
                  : [...asset.tags, tag]
              }
            : asset
        )
      );
    }
    cue("select");
  }

  function handleAppendAssetNode(assetId, node) {
    if (!selectedAvatar || !assetId) return;
    const nextAvatar = appendAssetNode(selectedAvatar, assetId, node);
    replaceAvatar(nextAvatar, "Node appended to asset");
    setSelectedAssetId(assetId);
    cue("copy");
  }

  function handleDirectionTag(channel, direction) {
    if (!selectedAvatar || !selectedAsset) return;
    if (selectedAvatarAsset) {
      const nextAvatar = setAssetDirection(selectedAvatar, selectedAsset.id, channel, direction);
      replaceAvatar(nextAvatar);
    } else {
      setIntake((current) =>
        current.map((asset) =>
          asset.id === selectedAsset.id ? withAssetDirection(asset, channel, direction) : asset
        )
      );
    }
    cue("select");
  }

  function handleVideoEndLink(videoAsset, targetAssetId, details) {
    if (!selectedAvatar || !videoAsset || !targetAssetId) return;
    const nextAvatar = connectVideoEndFrame(selectedAvatar, videoAsset.id, targetAssetId, details);
    replaceAvatar(nextAvatar, "Linked video end frame");
    cue("drop");
  }

  function handleReverseLoopValidation(videoAssetId, validation) {
    if (!selectedAvatar || !videoAssetId) return;
    const nextAvatar = setVideoReverseLoopValidation(selectedAvatar, videoAssetId, validation);
    replaceAvatar(nextAvatar, validation?.acceptable ? "Reverse loop validated" : "Reverse loop reviewed");
    setSelectedLoopVideoId(videoAssetId);
    cue("copy");
  }

  function handleValidateFrameMatch(candidate) {
    if (!selectedAvatar || !candidate) return;
    const video = selectedAvatar.assets.find((asset) => asset.id === candidate.fromVideoId);
    if (!video) return;
    handleVideoEndLink(video, candidate.toVideoId, {
      id: `validated-${candidate.id}`,
      linkType: candidate.suggestedLinkType || "continuity",
      humanLabel: candidate.humanLabel,
      reason: candidate.reason,
      agentInstruction: candidate.agentInstruction
    });
    setSelectedLoopVideoId(candidate.fromVideoId);
  }

  function handleDeleteAsset(asset) {
    if (!asset) return;
    if (selectedAvatar?.assets.some((item) => item.id === asset.id)) {
      const nextAvatar = detachAssetFromAvatar(selectedAvatar, asset.id);
      replaceAvatar(nextAvatar, `Detached ${asset.name}`);
    } else {
      setIntake((current) => current.filter((item) => item.id !== asset.id));
      notify(`Deleted ${asset.name}`);
    }
    if (selectedAssetId === asset.id) setSelectedAssetId(null);
    if (expandedAssetRecord?.id === asset.id) setExpandedAsset(null);
    cue("drop");
  }

  function handleCreatePlace() {
    const nextGraph = createPlace(normalizedSceneGraph, { name: `Place ${normalizedSceneGraph.places.length + 1}` });
    const newPlace = nextGraph.places[0];
    setSelectedPlaceId(newPlace.id);
    const nextWithScene = createScene(nextGraph, {
      placeId: newPlace.id,
      title: `${newPlace.name} Scene 1`
    });
    setSelectedSceneId(nextWithScene.scenes[0].id);
    replaceSceneGraph(nextWithScene, `${newPlace.name} created`);
    cue("copy");
  }

  function handleCreateScene() {
    if (!selectedPlace) return;
    const nextGraph = createScene(normalizedSceneGraph, {
      placeId: selectedPlace.id,
      title: `${selectedPlace.name} Scene ${scenesForPlace.length + 1}`
    });
    setSelectedSceneId(nextGraph.scenes[0].id);
    replaceSceneGraph(nextGraph, "Scene scaffold created");
    cue("copy");
  }

  function handleUpdatePlace(patch) {
    if (!selectedPlace) return;
    replaceSceneGraph(updatePlace(normalizedSceneGraph, selectedPlace.id, patch));
  }

  function handleUpdateScene(patch) {
    if (!selectedScene) return;
    replaceSceneGraph(updateScene(normalizedSceneGraph, selectedScene.id, patch));
  }

  function handleUpdateSceneTimeline(patch) {
    if (!selectedScene) return;
    replaceSceneGraph(setSceneTimeline(normalizedSceneGraph, selectedScene.id, patch));
  }

  async function handleSceneMediaDrop(event, requirementId, slotId = null) {
    event.preventDefault();
    if (!selectedScene) return;
    const droppedFiles = [...(event.dataTransfer.files || [])];
    const assets = droppedFiles.length
      ? await processLocalFiles(droppedFiles, "scene-drop", requirementId, `Attach to ${sceneRequirementById(requirementId)?.shortLabel || "scene"}`)
      : await assetsFromDrop(event, requirementId, [...intake, ...(selectedScene.assets || [])]);
    if (!assets.length) return;

    let nextGraph = normalizedSceneGraph;
    for (const asset of assets) {
      nextGraph = attachSceneMedia(nextGraph, selectedScene.id, { ...asset, requirementId }, slotId);
    }
    replaceSceneGraph(nextGraph, `Attached ${assets.length} scene asset${assets.length === 1 ? "" : "s"}`);
    setSelectedSceneAssetId(assets.at(-1).id);
    setSelectedAssetId(null);
    setIntake((current) => current.filter((asset) => !assets.some((dropped) => dropped.id === asset.id)));
    cue("drop");
  }

  function handleSceneAssetDelete(asset) {
    if (!selectedScene || !asset) return;
    const nextGraph = detachSceneMedia(normalizedSceneGraph, selectedScene.id, asset.id);
    replaceSceneGraph(nextGraph, `Detached ${asset.name}`);
    if (selectedSceneAssetId === asset.id) setSelectedSceneAssetId(null);
    if (expandedAssetRecord?.id === asset.id) setExpandedAsset(null);
    cue("drop");
  }

  function inferExpansionCollection(asset) {
    if (!asset) return [];
    const avatarAssets = selectedAvatar?.assets || [];
    if (avatarAssets.some((item) => item.id === asset.id)) return avatarAssets;
    const sceneAssets = selectedScene?.assets || [];
    if (sceneAssets.some((item) => item.id === asset.id)) return sceneAssets;
    if (intake.some((item) => item.id === asset.id)) return intake;
    return [asset];
  }

  function openExpandedAsset(asset, collection = null) {
    if (!asset) return;
    const scopedAssets = Array.isArray(collection) && collection.length ? collection : inferExpansionCollection(asset);
    setExpandedAsset(createAssetExpansion(asset, scopedAssets));
  }

  function navigateExpandedAsset(delta) {
    setExpandedAsset((current) => {
      const expansion = normalizeAssetExpansion(current);
      if (!expansion || expansion.assets.length <= 1) return expansion;
      const nextIndex = wrapIndex(expansion.index + delta, expansion.assets.length);
      return {
        ...expansion,
        index: nextIndex,
        asset: expansion.assets[nextIndex]
      };
    });
  }

  function handleSceneAvatarToggle(avatarId) {
    if (!selectedScene || !avatarId) return;
    const exists = selectedScene.avatarTags.some((tag) => tag.avatarId === avatarId);
    const nextGraph = exists
      ? removeAvatarFromScene(normalizedSceneGraph, selectedScene.id, avatarId)
      : tagAvatarInScene(normalizedSceneGraph, selectedScene.id, avatarId, { role: "lead", tags: ["scene-presence"] });
    replaceSceneGraph(nextGraph, exists ? "Avatar removed from scene" : "Avatar tagged into scene");
    cue("select");
  }

  function handleSceneAvatarRole(avatarId, role) {
    if (!selectedScene || !avatarId) return;
    const existing = selectedScene.avatarTags.find((tag) => tag.avatarId === avatarId);
    replaceSceneGraph(tagAvatarInScene(normalizedSceneGraph, selectedScene.id, avatarId, {
      ...existing,
      role,
      tags: existing?.tags || ["scene-presence"]
    }));
    cue("select");
  }

  function handleSceneMediaAvatarTag(assetId, avatarId) {
    if (!selectedScene || !assetId || !avatarId) return;
    replaceSceneGraph(tagAvatarInSceneMedia(normalizedSceneGraph, selectedScene.id, assetId, avatarId, {
      role: "visible",
      tags: ["in-frame"]
    }), "Avatar tagged in media");
    setSelectedSceneAssetId(assetId);
    cue("select");
  }

  function handleAddPlaylistTrack(track) {
    if (!selectedScene) return;
    replaceSceneGraph(addPlaylistTrack(normalizedSceneGraph, selectedScene.id, track), "Playlist track added");
    cue("copy");
  }

  function handleCreateTarotDeck() {
    const deck = createTarotDeck({
      title: `Hapa Deck ${normalizedTarotStore.decks.length + 1}`,
      subtitle: "Custom Hapa Tarot branch",
      description: "New deck branch awaiting Tarot card uploads and symbolic notes."
    });
    const nextStore = addTarotDeck(normalizedTarotStore, deck);
    setSelectedTarotDeckId(tarotDeckCollectionId(deck.id));
    setSelectedTarotCardId(null);
    replaceTarotStore(nextStore, `${deck.title} created`);
    cue("copy");
  }

  function handleCreateTarotSet() {
    const set = createTarotSet({
      title: `Hapa Set ${normalizedTarotStore.sets.length + 1}`,
      description: "Working set for card fronts, backs, alternates, and loop media."
    });
    const nextStore = addTarotSet(normalizedTarotStore, set);
    setSelectedTarotDeckId(tarotSetCollectionId(set.id));
    setSelectedTarotCardId(null);
    replaceTarotStore(nextStore, `${set.title} created`);
    cue("copy");
  }

  function handleUpdateTarotDeck(deckId, patch) {
    replaceTarotStore(updateTarotDeck(normalizedTarotStore, deckId, patch));
  }

  function handleUpdateTarotSet(setId, patch) {
    replaceTarotStore(updateTarotSet(normalizedTarotStore, setId, patch));
  }

  function handleUpdateTarotCard(cardId, patch) {
    replaceTarotStore(updateTarotCard(normalizedTarotStore, cardId, patch));
  }

  function handleSetTarotDeckMembership(cardId, deckId, enabled) {
    const card = normalizedTarotStore.cards.find((item) => item.id === cardId);
    if (!card) return;
    const deckIds = enabled
      ? [...card.deckIds, deckId]
      : card.deckIds.filter((id) => id !== deckId);
    replaceTarotStore(setTarotCardDeckMembership(normalizedTarotStore, cardId, deckIds), enabled ? "Card added to deck" : "Card removed from deck");
    cue("select");
  }

  function handleSetTarotSetMembership(cardId, setId, enabled) {
    const card = normalizedTarotStore.cards.find((item) => item.id === cardId);
    if (!card) return;
    const setIds = enabled
      ? [...card.setIds, setId]
      : card.setIds.filter((id) => id !== setId);
    replaceTarotStore(setTarotCardSetMembership(normalizedTarotStore, cardId, setIds), enabled ? "Card added to set" : "Card removed from set");
    cue("select");
  }

  function handleTarotAvatarToggle(cardId, avatarId) {
    const card = normalizedTarotStore.cards.find((item) => item.id === cardId);
    if (!card || !avatarId) return;
    const isLinked = card.avatarLinks.some((link) => link.avatarId === avatarId);
    const nextStore = isLinked
      ? unlinkTarotCardAvatar(normalizedTarotStore, cardId, avatarId)
      : linkTarotCardAvatar(normalizedTarotStore, cardId, avatarId, {
          role: "avatar-symbol",
          tags: ["tarot-link", "avatar-anchor"]
        });
    replaceTarotStore(nextStore, isLinked ? "Avatar link removed" : "Avatar linked to Tarot card");
    cue("select");
  }

  async function handleTarotUpload(files, options = {}) {
    const assets = await processLocalFiles(files, "tarot-card-upload", "tarot_card", "Tarot card upload");
    const imageAssets = assets.filter((asset) => asset.type === "image");
    const videoAssets = assets.filter((asset) => asset.type === "video");
    if (!imageAssets.length && !videoAssets.length) {
      notify("Choose image or video files for Tarot uploads");
      return;
    }
    let nextStore = normalizedTarotStore;
    const deckIds = selectedTarotCollectionKind === "deck" && selectedTarotDeck ? [selectedTarotDeck.id] : [];
    const setIds = selectedTarotCollectionKind === "set" && selectedTarotSet ? [selectedTarotSet.id] : [];
    for (const asset of imageAssets) {
      nextStore = addTarotCard(nextStore, {
        title: tarotTitleFromAsset(asset),
        cardType: options.cardType || "card_front",
        deckIds,
        setIds,
        status: "intake",
        suit: "custom",
        arcana: "custom",
        keywords: ["intake", "hapa"],
        asset
      });
    }
    const uploadedCard = imageAssets.length ? nextStore.cards[0] || null : null;
    const videoTargetId = options.cardId || uploadedCard?.id || selectedTarotCard?.id || null;
    if (videoAssets.length && !videoTargetId) {
      notify("Select a Tarot card before uploading loop videos");
      return;
    }
    for (const asset of videoAssets) {
      nextStore = attachTarotCardMedia(nextStore, videoTargetId, {
        ...asset,
        tags: [...(asset.tags || []), "tarot-loop"],
        notes: "Looping Tarot card video attached to this card record."
      }, "loop_video");
    }
    if (uploadedCard) setSelectedTarotCardId(uploadedCard.id);
    else if (videoTargetId) setSelectedTarotCardId(videoTargetId);
    const cardCopy = imageAssets.length ? `${imageAssets.length} card${imageAssets.length === 1 ? "" : "s"}` : "";
    const loopCopy = videoAssets.length ? `${videoAssets.length} loop video${videoAssets.length === 1 ? "" : "s"}` : "";
    replaceTarotStore(nextStore, `Uploaded ${[cardCopy, loopCopy].filter(Boolean).join(" and ")}`);
    cue("drop");
  }

  async function handleTarotPicker(event) {
    await handleTarotUpload([...event.target.files]);
    event.target.value = "";
  }

  async function handleTarotLoopPicker(event) {
    await handleTarotUpload([...event.target.files], { cardId: selectedTarotCard?.id || null });
    event.target.value = "";
  }

  async function handleTarotDrop(event) {
    event.preventDefault();
    await handleTarotUpload([...(event.dataTransfer.files || [])]);
  }

  function showHoverPreview(asset, event, meta = {}) {
    setHoverPreview({
      asset,
      x: event.clientX,
      y: event.clientY,
      ...meta
    });
  }

  function hideHoverPreview() {
    setHoverPreview(null);
  }

  async function copyAttachPack() {
    if (!attachPack) return;
    await navigator.clipboard?.writeText(JSON.stringify(attachPack, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    cue("copy");
  }

  async function copyHealingPrompt(job) {
    if (!job?.promptPacket) return;
    await navigator.clipboard?.writeText(JSON.stringify(job.promptPacket, null, 2));
    notify(`Copied GPT Image 2 prompt for ${job.slotId}`);
    cue("copy");
  }

  const totalCards = board.totalCards ?? board.lanes?.reduce((sum, lane) => sum + (lane.totalCards ?? lane.cards.length), 0) ?? BUILD_BOARD.flatMap((lane) => lane.cards).length;
  const completeCards = board.doneCards ?? board.lanes?.reduce((sum, lane) => sum + (lane.doneCards ?? lane.cards.filter((card) => card.status === "done").length), 0) ?? 0;
  const avatarTelemetryValue = avatarDataMode === "loading-full"
    ? "HYDRATING"
    : avatarDataMode === "full"
      ? avatars.length
      : `${avatars.length} ${avatarDataMode.toUpperCase()}`;
  const avatarTelemetryTone = avatarDataMode === "full" ? "cyan" : avatarDataMode === "loading-full" ? "gold" : "gold";
  const boardTelemetryValue = boardDataMode === "loading"
    ? "HYDRATING"
    : boardDataMode === "full"
      ? `${completeCards}/${totalCards}`
      : `${completeCards}/${totalCards} ${boardDataMode.toUpperCase()}`;
  const itemTelemetryValue = itemDataMode === "loading"
    ? "HYDRATING"
    : itemDataMode === "full"
      ? normalizedItemManager.audit.total
      : `${normalizedItemManager.audit.total} ${itemDataMode.toUpperCase()}`;
  const itemTelemetryTone = itemDataMode === "full" ? "cyan" : itemDataMode === "loading" ? "gold" : "gold";
  const queueTelemetryValue = queueSummary.active ? `${queueSummary.active} ACTIVE` : "READY";

  function scheduleDeferredLoad(loader, delayMs = 650) {
    let cancelIdle = null;
    const timer = window.setTimeout(() => {
      cancelIdle = scheduleIdleTask(loader, 900);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelIdle?.();
    };
  }

  function flashRoutePending() {
    setRoutePending(true);
    window.clearTimeout(routeTimer.current);
    routeTimer.current = window.setTimeout(() => setRoutePending(false), 380);
  }

  function switchView(nextView) {
    const resolvedView = resolveBuilderHostAlias(nextView, "builder");
    if (resolvedView === activeView) return;
    flashRoutePending();
    setActiveView(resolvedView);
    const url = new URL(globalThis.location.href); url.searchParams.set("view", resolvedView); globalThis.history?.replaceState?.(null, "", url);
    if (resolvedView === "protocol") setAvatarCardMenuOpen(false);
    if (resolvedView !== "protocol") setProfileReturnRoute(null);
  }

  function openOvercardManagement(kind) {
    const target = getBuilderOvercardManagementTarget(kind);
    const nextView = target?.launchAction?.view;
    if (!nextView || nextView === activeView) return;
    flashRoutePending();
    setActiveView(nextView);
    const url = new URL(globalThis.location.href);
    url.searchParams.set("view", nextView);
    globalThis.history?.pushState?.({ source: "overcard-management", returnView: activeView }, "", url);
  }

  function toggleAvatarCardMenu() {
    setAvatarCardMenuOpen((value) => !value);
    cue("select");
  }

  function revealShowcaseTop() {
    window.requestAnimationFrame(() => {
      const showcase = document.querySelector(".avatar-showcase-view");
      if (!showcase) return;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      showcase.scrollTo({ top: 0, behavior });
      showcase.scrollIntoView({ block: "start", inline: "nearest", behavior });
    });
  }

  function selectAvatarFromRail(avatarId) {
    if (activeView === "protocol") {
      openAvatarProfile(avatarId);
      return;
    }
    setSelectedAvatarId(avatarId);
    setSelectedAssetId(null);
    ensureAvatarLoaded(avatarId);
    cue("select");
  }

  function openAvatarProfile(avatarId, options = {}) {
    const targetAvatar = avatars.find((item) => item.id === avatarId);
    if (!targetAvatar) return;
    ensureAvatarLoaded(avatarId);
    const returnRoute = options.returnView
      ? {
          view: options.returnView,
          label: options.returnLabel || titleizeItemLabel(options.returnView),
          sourceCardId: options.sourceCardId || ""
        }
      : null;
    if (returnRoute) {
      setProfileReturnRoute(returnRoute);
    } else if (activeView !== "protocol") {
      setProfileReturnRoute(null);
    }
    if (avatarId === selectedAvatarId) {
      if (activeView !== "protocol") {
        flashRoutePending();
        setActiveView("protocol");
        setAvatarCardMenuOpen(false);
      }
      revealShowcaseTop();
      return;
    }

    const shouldPushCurrent = options.pushCurrent !== false && selectedAvatarId;
    setProfileTrailIds((current) => {
      const withoutCurrentOrTarget = current.filter((id) => id !== selectedAvatarId && id !== avatarId);
      return shouldPushCurrent
        ? [selectedAvatarId, ...withoutCurrentOrTarget].slice(0, 8)
        : withoutCurrentOrTarget.slice(0, 8);
    });
    flashRoutePending();
    setSelectedAvatarId(avatarId);
    setSelectedAssetId(null);
    setActiveView("protocol");
    if (activeView !== "protocol") setAvatarCardMenuOpen(false);
    cue("select");
    revealShowcaseTop();
  }

  function returnToProfileOrigin() {
    if (!profileReturnRoute?.view) return;
    const targetView = profileReturnRoute.view;
    setProfileReturnRoute(null);
    setAvatarCardMenuOpen(false);
    flashRoutePending();
    setActiveView(targetView);
    cue("select");
  }

  function backToPreviousProfile() {
    const [previousAvatarId, ...rest] = profileTrailIds;
    if (!previousAvatarId) return;
    const targetAvatar = avatars.find((item) => item.id === previousAvatarId);
    setProfileTrailIds(rest);
    if (!targetAvatar) return;
    flashRoutePending();
    setSelectedAvatarId(previousAvatarId);
    setSelectedAssetId(null);
    ensureAvatarLoaded(previousAvatarId);
    setActiveView("protocol");
    cue("select");
    revealShowcaseTop();
  }

  const isEmbed = useMemo(() => new URLSearchParams(globalThis.location?.search || "").get("embed") === "true", []);

  useEffect(() => {
    if (isEmbed) {
      ensureTarotStoreLoaded();
    }
  }, [isEmbed]);

  if (isEmbed) {
    return (
      <div className="tarot-persistent-stage is-active" style={{ width: "100vw", height: "100vh", position: "absolute", top: 0, left: 0, zIndex: 9999, background: "#000" }}>
        <Suspense fallback={<div className="tarot-draw-view tarot-draw-loading" style={{ color: "#00f3ff", display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><span>Preparing tarot table...</span></div>}>
          <TarotDraw3DView
            playbackMode="active"
            avatarName={(tarotDrawHostAvatar || selectedAvatar || avatars[0] || FALLBACK_AVATARS[0]).primaryName}
            avatarId={(tarotDrawHostAvatar || selectedAvatar || avatars[0] || FALLBACK_AVATARS[0]).id}
            cards={tarotStore.cards}
            productionAudit={tarotDrawProductionAudit}
            apiBase={API_BASE}
            soundEnabled={sound}
            onResolveEchoProject={resolveEchoDirectorProject}
            prewarmedEchoVideos={echoDirectorPrewarmVideosRef.current}
            onTarotForgeCreated={(packet) => {}}
            onTarotSceneSaved={(packet) => {}}
            onSelectAvatarProfile={(avatarId) => {}}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={appShellClasses}>
      <div className="scanline" />
      <header className="topbar hapa-panel" data-variant="notch">
        <div className="brand-block">
          <div className="brand-mark"><Layers3 size={22} /></div>
          <div>
            <h1>Hapa Avatar Builder</h1>
            <p>neonblade+ media card assembly</p>
          </div>
        </div>

        <BuilderHeaderHand
          adapter={overcardAdapter}
          onOpenManager={(intent) => openOvercardManagement(intent.kind)}
          onOpenLibrary={() => openOvercardManagement("library")}
        />

        <div className="telemetry">
          <StatusChip label="API" value={apiState.toUpperCase()} tone={apiState === "api" ? "green" : "gold"} />
          <StatusChip
            label="WORLD"
            value={WORLD_SYNC_LABELS[worldSyncState] || worldSyncState.toUpperCase()}
            tone={worldSyncState === "saved" ? "green" : worldSyncState === "syncing" ? "cyan" : "gold"}
          />
          <StatusChip label="AVATARS" value={avatarTelemetryValue} tone={avatarTelemetryTone} />
          <StatusChip label="PLACES" value={sceneAudit.places} tone="green" />
          <StatusChip label="SCENES" value={sceneAudit.scenes} tone="gold" />
          <StatusChip label="TAROT" value={`${tarotSummary.cards}/${tarotSummary.decks}`} tone="rose" />
          <StatusChip label="ITEMS" value={itemTelemetryValue} tone={itemTelemetryTone} />
          <StatusChip label="EQUIP" value={normalizedInventoryStore.audit.totalEquipments} tone="green" />
          <StatusChip label="BOARD" value={boardTelemetryValue} tone={boardDataMode === "full" ? "fuchsia" : "gold"} />
          <StatusChip label="QUEUE" value={queueTelemetryValue} tone={queueSummary.blockers ? "orange" : queueSummary.active ? "gold" : "green"} />
          <StatusChip label="SONGS" value={normalizedHapaSongStore.audit.songs} tone="rose" />
          <StatusChip label="VIDEOS" value={videoBranchCount} tone="orange" />
          <StatusChip label="LINKS" value={videoLinkCount} tone="fuchsia" />
          <StatusChip label="3D" value={modelAssets.length} tone="cyan" />
          {audit && <StatusChip label="HEAL" value={healingQueueTotal} tone={healingQueueTotal ? "orange" : "green"} />}
          <StatusChip label="SYNC" value={subscriberStatus ? subscriberStatus.eventCount : 0} tone={apiState === "api" ? "green" : "gold"} />
          {audit && <StatusChip label="GRADE" value={audit.grade.toUpperCase()} tone={audit.complete ? "green" : "orange"} />}
        </div>

        <div className="top-actions">
          {worldSyncState !== "saved" && (
            <IconButton
              label="Retry world sync"
              onClick={() => queueSceneGraphPersist(normalizedSceneGraph, {
                immediate: true,
                successMessage: "World synced to API",
                failMessage: "World still local; retry available"
              })}
            >
              <RefreshCw size={18} />
            </IconButton>
          )}
          <IconButton label={sound ? "Mute tones" : "Enable tones"} onClick={() => setSound((value) => !value)}>
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </IconButton>
          <IconButton label="New avatar scaffold" onClick={createNewAvatar}>
            <Plus size={18} />
          </IconButton>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar panel hapa-panel" data-variant="notch">
          <AvatarTeamRail
            groups={avatarTeamGroups}
            expandedTeamIds={expandedTeamIds}
            selectedAvatarId={selectedAvatar?.id}
            avatarAudits={avatarAudits}
            avatarPortraits={avatarPortraits}
            onToggle={toggleTeamExpanded}
            onSelect={selectAvatarFromRail}
          />

          {audit && (
            <div className="level-panel">
              <div className={`avatar-core ${selectedAvatarPortrait ? "has-portrait" : ""}`} style={{ "--level-size": `${126 + audit.percent * 0.54}px` }}>
                <div className="avatar-core-ring" />
                {selectedAvatarPortrait && (
                  <div className="avatar-core-portrait" aria-hidden="true">
                    <AssetVisual asset={selectedAvatarPortrait} mode="preview" eager />
                  </div>
                )}
                <strong>{selectedAvatar.primaryName}</strong>
                <span>LVL {audit.level}</span>
              </div>
              <div className="xp-readout">
                <span>XP {audit.xp}</span>
                <em>{audit.filled}/{audit.required}</em>
              </div>
              <ProgressBar value={audit.percent} />
            </div>
          )}

          {selectedAvatar && (
            <form className="identity-panel hapa-panel" data-variant="resting" onSubmit={handleRenameAvatar}>
              <div className="section-head hapa-panel-head compact">
                <span><BadgeCheck size={14} /> Avatar Identity</span>
                <em>{selectedAvatar.names.length} name{selectedAvatar.names.length === 1 ? "" : "s"}</em>
              </div>
              <label>
                <span>Primary name</span>
                <BufferedTextInput
                  name="primaryName"
                  value={identityDraft.primaryName}
                  onCommit={(value) => setIdentityDraft((draft) => ({ ...draft, primaryName: value }))}
                  placeholder="Avatar name"
                />
              </label>
              <label>
                <span>Second name / alias</span>
                <BufferedTextInput
                  name="aliases"
                  value={identityDraft.aliases}
                  onCommit={(value) => setIdentityDraft((draft) => ({ ...draft, aliases: value }))}
                  placeholder="Optional callsign"
                />
              </label>
              <button className="hapa-btn" data-intent="primary" type="submit">
                <BadgeCheck size={14} />
                Save Identity
              </button>
            </form>
          )}

          {selectedAvatar && (
            <TeamAssignmentPanel
              selectedAvatar={selectedAvatar}
              teams={normalizedAvatarTeams}
              draft={teamDraft}
              membership={selectedAvatarMembership}
              onDraft={setTeamDraft}
              onCreate={handleCreateAvatarTeam}
              onSave={handleSaveAvatarTeamAssignment}
            />
          )}

          <nav className="view-tabs hapa-tabs" role="tablist" aria-label="Avatar Builder views">
            {BUILDER_HOST_TARGETS.map((target) => {
              const Icon = BUILDER_HOST_ICONS[target.iconId] || Grid3X3;
              return <BuilderMenuHostTab key={target.id} target={target} active={activeView === target.route} onActivate={() => switchView(target.route)} icon={<Icon size={16} />} />;
            })}
          </nav>

          <QueueBufferInspector jobs={queueJobs} summary={queueSummary} />
        </aside>

        {viewContextStatus && (
          <div className="builder-view-context-status hapa-panel" data-variant={viewContextStatus.unsupported.length ? "warning" : "notch"} role="status">
            <strong>{viewContextStatus.contextMode} shaping {getBuilderHostTarget(viewContextStatus.route).label}</strong>
            <span>{viewContextStatus.applied.length ? `Applied: ${viewContextStatus.applied.join(", ")}` : "No supported selector action; attachments remain context-only."}</span>
            {viewContextStatus.unsupported.map((item) => <small key={item.attachmentId}>{item.reason}</small>)}
          </div>
        )}

        {routePending && (
          <div className="route-pending hapa-panel" data-variant="hot" aria-live="polite">
            <RefreshCw size={14} />
            <span>arming workflow</span>
          </div>
        )}

        {activeView === "builder" && selectedAvatar && audit && (
          <section className="builder-view">
            <div className="panel hapa-panel intake-panel" data-variant="resting">
              <div className="section-head hapa-panel-head">
                <span><Upload size={15} /> Media Intake</span>
                <em>{filteredIntake.length}</em>
              </div>
              <label className="search-box hapa-field">
                <Search size={15} />
                <BufferedTextInput value={search} onCommit={setSearch} placeholder="filter media" debounceMs={140} />
              </label>
              <input
                id="local-image-picker"
                className="file-input"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleLocalPicker}
              />
              <label className="local-picker hapa-btn" data-intent="primary" htmlFor="local-image-picker">
                <ImagePlus size={17} />
                <span>Preview Local Media</span>
              </label>
              <div
                className="drop-import hapa-panel"
                data-variant="notch"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleIntakeDrop}
              >
                <Upload size={19} />
                <span>Drop media to preview</span>
              </div>
              <div className="intake-grid">
                {filteredIntake.length ? filteredIntake.map((asset) => (
                  <MediaTile
                    key={asset.id}
                    asset={asset}
                    selected={selectedAssetId === asset.id}
                    onSelect={() => selectAsset(asset.id)}
                    onExpand={openExpandedAsset}
                    onDelete={handleDeleteAsset}
                    onPreview={showHoverPreview}
                    onPreviewHide={hideHoverPreview}
                  />
                )) : (
                  <div className="intake-empty hapa-panel" data-variant="resting">
                    <ImagePlus size={22} />
                    <strong>No staged media</strong>
                    <span>Preview or drop local image/video files to begin sorting.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bucket-stage">
              <div className="stage-header panel hapa-panel" data-variant="hot">
                <div>
                  <p className="eyebrow">Selected Avatar</p>
                  <h2>{selectedAvatar.names.map((item) => item.name).join(" / ")}</h2>
                </div>
                <div className="progress-cluster">
                  <CircularScore value={audit.percent} />
                  <div>
                    <strong>{audit.missing} missing</strong>
                    <span>{audit.complete ? "complete" : "healing queue active"}</span>
                  </div>
                </div>
              </div>

              <AvatarModelPanel
                activeModel={activeModelAsset}
                modelAssets={modelAssets}
                selectedAssetId={selectedAssetId}
                onDrop={handleAvatarModelDrop}
                onPick={handleAvatarModelPicker}
                onSelect={selectAsset}
                onExpand={openExpandedAsset}
                onDelete={handleDeleteAsset}
                onModelReady={handleAvatarModelReady}
                onDefaultAnimation={handleAvatarModelDefaultAnimation}
              />

              <div className="requirements-grid">
                {MEDIA_REQUIREMENTS.map((requirement) => {
                  const requirementAudit = audit.byRequirement.find((item) => item.id === requirement.id);
                  const slots = selectedAvatar.slots.filter((slot) => slot.requirementId === requirement.id);
                  return (
                    <RequirementPanel
                      key={requirement.id}
                      requirement={requirement}
                      requirementAudit={requirementAudit}
                      slots={slots}
                      assets={selectedAvatar.assets}
                      videoBranchMap={videoBranchMap}
                      selectedAssetId={selectedAssetId}
                      onSelectAsset={selectAsset}
                      onDrop={handleDrop}
                      onExpand={openExpandedAsset}
                      onDelete={handleDeleteAsset}
                      onPreview={showHoverPreview}
                      onPreviewHide={hideHoverPreview}
                    />
                  );
                })}
              </div>
            </div>

            <aside className="panel hapa-panel inspector" data-variant="notch" ref={inspectorRef}>
              <div className="section-head hapa-panel-head">
                <span><Tags size={15} /> Tag Matrix</span>
                <em>{selectedAsset ? `${selectedAsset.tags.length} · ${selectedTagQuality?.rank || "SEED"}` : 0}</em>
              </div>

              {selectedAsset ? (
                <>
                  <div className="asset-preview-large hapa-card" data-card-type={assetCardType(selectedAsset)} data-granularity="detail" data-state="selected">
                    <AssetVisual asset={selectedAsset} controls={selectedAsset.type === "video"} mode="preview" />
                    <strong>{selectedAsset.name}</strong>
                    <span>{requirementById(selectedAsset.requirementId)?.label || "Local preview awaiting slot"}</span>
                    <button className="detail-button hapa-btn" data-intent="primary" onClick={() => openExpandedAsset(selectedAsset)}>
                      <Maximize2 size={14} />
                      Expand
                    </button>
                    <button className="delete-detail-button hapa-btn" data-intent="danger" onClick={() => handleDeleteAsset(selectedAsset)}>
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                  <DirectionTagger asset={selectedAsset} onTag={handleDirectionTag} />
                  <TagMatrix
                    key={selectedAsset.id}
                    asset={selectedAsset}
                    quality={selectedTagQuality}
                    onTag={handleTag}
                  />
                  {selectedAvatarAsset?.type === "image" && (
                    <VideoBranchPanel
                      parentAsset={selectedAvatarAsset}
                      branches={selectedImageBranches}
                      incomingLinks={videoTransitionMap.incoming.get(selectedAvatarAsset.id) || []}
                      onDrop={handleVideoBranchDrop}
                      onPick={handleVideoPicker}
                      onSelect={selectAsset}
                      onExpand={openExpandedAsset}
                      onDelete={handleDeleteAsset}
                    />
                  )}
                  {selectedAvatarAsset?.type === "video" && (
                    <VideoStatePanel
                      video={selectedAvatarAsset}
                      parentAsset={selectedVideoParent}
                      assets={selectedAvatar.assets}
                      links={videoTransitionMap.outgoing.get(selectedAvatarAsset.id) || []}
                      onSelectParent={selectAsset}
                      onSelectAsset={selectAsset}
                      onConnectEndFrame={handleVideoEndLink}
                    />
                  )}
                </>
              ) : (
                <div className="empty-state hapa-panel" data-variant="resting">
                  <Radar size={30} />
                  <span>No asset selected</span>
                </div>
              )}

              <div className="attach-panel">
                <div className="section-head hapa-panel-head compact">
                  <span><Clipboard size={15} /> Attach Pack</span>
                  <button onClick={copyAttachPack}>{copied ? "Copied" : "Copy"}</button>
                </div>
                <DeferredJsonPre value={attachPack} placeholder="Preparing avatar pack..." />
              </div>
            </aside>
          </section>
        )}

        {activeView === "mind" && selectedAvatar && mindPack && (
          <AvatarMindView
            avatar={selectedAvatar}
            avatars={avatars}
            mindPack={mindPack}
            onPatch={handleMindPatch}
          />
        )}

        {activeView === "scenes" && (
          <ScenesWorkflowView
            graph={normalizedSceneGraph}
            audit={sceneAudit}
            avatars={avatars}
            places={normalizedSceneGraph.places}
            scenesForPlace={scenesForPlace}
            selectedPlace={selectedPlace}
            selectedScene={selectedScene}
            selectedSceneAsset={selectedSceneAsset}
            selectedSceneAssetId={selectedSceneAssetId}
            attachPack={sceneAttachPack}
            onCreatePlace={handleCreatePlace}
            onCreateScene={handleCreateScene}
            onSelectPlace={(placeId) => {
              const nextPlace = normalizedSceneGraph.places.find((place) => place.id === placeId);
              const nextScene = normalizedSceneGraph.scenes.find((scene) => scene.placeId === placeId);
              flashRoutePending();
              setSelectedPlaceId(placeId);
              setSelectedSceneId(nextScene?.id || selectedSceneId);
              setSelectedSceneAssetId(null);
              notify(`${nextPlace?.name || "Place"} selected`);
              cue("select");
            }}
            onSelectScene={(sceneId) => {
              flashRoutePending();
              setSelectedSceneId(sceneId);
              setSelectedSceneAssetId(null);
              cue("select");
            }}
            onUpdatePlace={handleUpdatePlace}
            onUpdateScene={handleUpdateScene}
            onUpdateTimeline={handleUpdateSceneTimeline}
            onDropMedia={handleSceneMediaDrop}
            onSelectAsset={(assetId) => {
              setSelectedSceneAssetId(assetId);
              setSelectedAssetId(null);
              cue("select");
            }}
            onExpand={openExpandedAsset}
            onDeleteAsset={handleSceneAssetDelete}
            onToggleAvatar={handleSceneAvatarToggle}
            onAvatarRole={handleSceneAvatarRole}
            onTagMediaAvatar={handleSceneMediaAvatarTag}
            onAddPlaylistTrack={handleAddPlaylistTrack}
          />
        )}

        {isItemsView && (
          <ItemManagerView
            itemStore={normalizedItemManager}
            inventoryStore={normalizedInventoryStore}
            avatars={avatars}
            selectedItem={selectedItem}
            selectedItemId={selectedItemId}
            selectedAvatarId={selectedInventoryAvatarId}
            onSelectItem={(cardId) => {
              setSelectedItemId(cardId);
              cue("select");
            }}
            onSelectAvatar={setSelectedInventoryAvatarId}
            onCreateItem={handleCreateItemCard}
            onUpdateItem={handleUpdateItemCard}
            onEquipItem={handleEquipItemCard}
          />
        )}

        {activeView === "loops" && selectedAvatar && (
          <VideoLoopsView
            avatar={selectedAvatar}
            videos={loopVideos}
            seedFrames={seedFrameAssets}
            selectedVideo={selectedLoopVideo}
            selectedAssetId={selectedAssetId}
            transitionMap={videoTransitionMap}
            matchQueue={videoMatchQueue}
            onSelectVideo={(assetId) => {
              setSelectedLoopVideoId(assetId);
              setSelectedAssetId(assetId);
              cue("select");
            }}
            onSelectAsset={selectAsset}
            onExpand={openExpandedAsset}
            onTagVideo={handleAssetTag}
            onConnectEndFrame={handleVideoEndLink}
            onReverseLoopValidation={handleReverseLoopValidation}
            onValidateCandidate={handleValidateFrameMatch}
          />
        )}

        {activeView === "lookbook" && selectedAvatar && (
          <LookBookView
            avatar={selectedAvatar}
            seedFrames={seedFrameAssets}
            page={lookBookPage}
            selectedAssetId={selectedAssetId}
            onPage={setLookBookPage}
            onSelectAsset={selectAsset}
            onExpand={openExpandedAsset}
            onAppendNode={handleAppendAssetNode}
            readerMode={lookBookReader}
            onReaderMode={setLookBookReader}
          />
        )}

        {isLoreView && (
          <LoreReaderView
            avatars={avatars}
            itemCards={normalizedItemManager.cards}
            sceneGraph={normalizedSceneGraph}
            board={board}
            selectedAvatarId={selectedAvatar?.id}
            onSelectAvatar={(avatarId) => {
              setSelectedAvatarId(avatarId);
              cue("select");
            }}
          />
        )}

        {isSongsView && (
          <HapaSongsView
            store={normalizedHapaSongStore}
            dataMode={songDataMode}
            selectedSong={selectedHapaSong}
            selectedSongId={selectedHapaSongId}
            avatars={avatars}
            sceneGraph={normalizedSceneGraph}
            songLibrary={songLibrary}
            onSelectSong={(songId) => {
              setSelectedHapaSongId(songId);
              cue("select");
            }}
            onToggleAvatar={handleSongAvatarToggle}
            onToggleScene={handleSongSceneToggle}
            onUploadMedia={handleSongMediaUpload}
            onToggleVisualizer={handleSongVisualizerToggle}
            onAddStoryBeat={handleSongStoryBeat}
            onOpenAvatar={openAvatarProfile}
            onExpandAsset={openExpandedAsset}
          />
        )}
        {activeView === "echos" && (
          <Suspense fallback={<div className="empty-state"><Loader2 size={22} /><span>Loading Echos Album</span></div>}>
            <HapaEchosView
              playbackMode="active"
              selectedSongId={selectedHapaSongId}
              onSelectSong={setSelectedHapaSongId}
            />
          </Suspense>
        )}

        {activeView === "kanban" && selectedAvatar && (
          <section className="kanban-view">
            <HealingQueuePanel queue={healingQueue} onCopyPrompt={copyHealingPrompt} />
            <Board title="Build Board" lanes={board.lanes || BUILD_BOARD} />
            <Board title={`${selectedAvatar.primaryName} Healing Board`} lanes={avatarBoard} />
          </section>
        )}

        {isTarotLibraryView && (
          <TarotLibraryView
            store={normalizedTarotStore}
            summary={tarotSummary}
            dashboard={tarotDashboard}
            avatars={avatars}
            selectedDeckId={selectedTarotDeckId}
            selectedDeck={selectedTarotDeck}
            selectedSet={selectedTarotSet}
            selectedCard={selectedTarotCard}
            selectedCardId={selectedTarotCard?.id || selectedTarotCardId}
            cardsForDeck={tarotCardsForDeck}
            attachPack={tarotAttachPack}
            syncState={tarotSyncState}
            onCreateDeck={handleCreateTarotDeck}
            onCreateSet={handleCreateTarotSet}
            onSelectDeck={(deckId) => {
              setSelectedTarotDeckId(deckId);
              setSelectedTarotCardId(null);
              cue("select");
            }}
            onSelectCard={(cardId) => {
              setSelectedTarotCardId(cardId);
              cue("select");
            }}
            onUpdateDeck={handleUpdateTarotDeck}
            onUpdateSet={handleUpdateTarotSet}
            onUpdateCard={handleUpdateTarotCard}
            onSetDeckMembership={handleSetTarotDeckMembership}
            onSetSetMembership={handleSetTarotSetMembership}
            onToggleAvatar={handleTarotAvatarToggle}
            onUpload={handleTarotPicker}
            onUploadLoop={handleTarotLoopPicker}
            onDrop={handleTarotDrop}
            onExpand={openExpandedAsset}
            onPreview={showHoverPreview}
            onPreviewHide={hideHoverPreview}
          />
        )}

        {activeView === "hell-week" && (
          <HellWeekView
            avatars={avatars}
            onExpand={openExpandedAsset}
            onPreview={showHoverPreview}
            onPreviewHide={hideHoverPreview}
          />
        )}

        {activeView === "creator-sets" && (
          <CreatorCardSetsView
            itemStore={normalizedItemManager}
            avatars={avatars}
            selectedAvatarId={selectedAvatarId}
            contextSetId={creatorContextSetId}
            onCreateItem={handleCreateItemCard}
            onUpdateItem={handleUpdateItemCard}
          />
        )}

        {tarotDrawStageVisible && (tarotDrawHostAvatar || selectedAvatar) && (
          <div
            className={`tarot-persistent-stage ${isTarotDrawView ? "is-active" : "is-docked"}`}
            data-scene-live={tarotDrawSceneLive ? "true" : "false"}
            aria-label={tarotDrawStageDocked ? "Live docked Tarot Draw scene" : "Active Tarot Draw scene"}
          >
            {tarotDrawStageDocked && (
              <div className="tarot-live-dock-bar hapa-panel" data-variant="hot">
                <span><Sparkles size={14} /> Live Tarot Scene</span>
                <button className="hapa-btn" data-intent="primary" type="button" onClick={() => switchView("tarot")}>
                  <Maximize2 size={14} />
                  Return
                </button>
              </div>
            )}
            {tarotDrawSceneArmed && tarotDrawProjectionReady ? (
              <Suspense fallback={<div className="tarot-draw-view tarot-draw-loading"><Loader2 size={26} /> <span>Preparing tarot table</span></div>}>
                <TarotDraw3DView
                  playbackMode={tarotDrawPlaybackMode}
                  avatarName={(tarotDrawHostAvatar || selectedAvatar).primaryName}
                  avatarId={(tarotDrawHostAvatar || selectedAvatar).id}
                  cards={tarotDrawCards}
                  productionAudit={tarotDrawProductionAudit}
                  apiBase={API_BASE}
                  soundEnabled={sound}
                  onResolveEchoProject={resolveEchoDirectorProject}
                  prewarmedEchoVideos={echoDirectorPrewarmVideosRef.current}
                  onTarotForgeCreated={(packet) => {
                    if (!packet?.store) return;
                    const store = normalizeTarotStore(packet.store);
                    setTarotStore(store);
                    setTarotDataMode("full");
                    setTarotSyncState("saved");
                    if (packet.card?.id) setSelectedTarotCardId(packet.card.id);
                  }}
                  onTarotSceneSaved={(packet) => {
                    if (!packet?.store) return;
                    const store = normalizeTarotStore(packet.store);
                    setTarotStore(store);
                    setTarotDataMode("full");
                    setTarotSyncState("saved");
                    if (packet.card?.id) setSelectedTarotCardId(packet.card.id);
                  }}
                  onSelectAvatarProfile={(avatarId, options = {}) => openAvatarProfile(avatarId, { returnView: "tarot", returnLabel: "Tarot Draw", ...options })}
                />
              </Suspense>
            ) : isTarotDrawView ? (
              <div className="tarot-draw-view tarot-draw-loading">
                <Loader2 size={26} />
                <span>{tarotDrawSceneArmed ? "Preparing playable tarot deck" : "Queueing 3D tarot table"}</span>
              </div>
            ) : null}
          </div>
        )}

        {activeView === "protocol" && selectedAvatar && mindPack && (
          <AvatarShowcaseView
            avatar={selectedAvatar}
            avatars={avatars}
            audit={audit}
            mindPack={mindPack}
            inventoryStore={normalizedInventoryStore}
            itemStore={normalizedItemManager}
            songLibrary={songLibrary}
            onExpandAsset={openExpandedAsset}
            onSelectAvatarProfile={openAvatarProfile}
            onBackProfile={backToPreviousProfile}
            profileTrail={profileTrail}
            profileReturnRoute={profileReturnRoute}
            menuOpen={avatarCardMenuOpen}
            onToggleFullMenu={toggleAvatarCardMenu}
            onReturnToProfileOrigin={returnToProfileOrigin}
          />
        )}

        {activeView === "bank" && selectedAvatar && (
          <div className="hapa-bank-embed" style={{ width: '100%', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', padding: '24px', boxSizing: 'border-box', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--hapa-line)', paddingBottom: '12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard className="text-[var(--hapa-neon-cyan)]" size={20} />
                  <h2 style={{ fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '0.1em', color: '#fff', margin: 0 }}>HAPA BANK NODE INTERFACE</h2>
                </div>
                <div className="hapa-segmented" style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    className={`hapa-btn text-[10px] uppercase font-mono ${bankViewMode === 'individual' ? 'active' : ''}`}
                    onClick={() => setBankViewMode('individual')}
                    style={{ padding: '2px 8px', minHeight: '22px', fontSize: '10px' }}
                  >
                    Individual
                  </button>
                  <button 
                    className={`hapa-btn text-[10px] uppercase font-mono ${bankViewMode === 'guild' ? 'active' : ''}`}
                    onClick={() => setBankViewMode('guild')}
                    style={{ padding: '2px 8px', minHeight: '22px', fontSize: '10px' }}
                  >
                    Guild Ledger
                  </button>
                </div>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: '9px', color: 'var(--hapa-muted)', textTransform: 'uppercase' }}>
                {bankViewMode === 'individual' ? `AVATAR RESOLVED: ${selectedAvatar.id.toUpperCase()}` : 'CONSOLIDATED GUILD LEDGER'}
              </span>
            </div>
            <iframe 
              src={bankViewMode === 'individual' 
                ? `${window.location.origin}/CardAppPrototype/#/?avatarId=${selectedAvatar.id}&embed=true`
                : `${window.location.origin}/CardAppPrototype/#/guild?embed=true`} 
              style={{ width: '100%', height: '100%', minHeight: '600px', flexGrow: 1, border: '1px solid var(--hapa-line)', borderRadius: '8px', backgroundColor: 'rgba(0, 0, 0, 0.35)' }}
              title="Hapa Bank App"
            />
          </div>
        )}
      </main>

      {expandedAssetRecord && (
        <AssetDetailModal
          asset={expandedAssetRecord}
          assets={expandedAsset?.assets || [expandedAssetRecord]}
          activeIndex={expandedAsset?.index || 0}
          onClose={() => setExpandedAsset(null)}
          onNavigate={navigateExpandedAsset}
          onDefaultAnimation={handleAvatarModelDefaultAnimation}
        />
      )}
      {hoverPreview && !expandedAssetRecord && (
        <HoverPreviewCard preview={hoverPreview} />
      )}
      {uploadJobs.length > 0 && <UploadProcessingOverlay jobs={uploadJobs} />}
      {toast && <div className="toast"><Sparkles size={15} /> {toast}</div>}
    </div>
  );
}

function AvatarTeamRail({ groups, expandedTeamIds, selectedAvatarId, avatarAudits, avatarPortraits, onToggle, onSelect }) {
  const visibleCount = groups.reduce((sum, group) => sum + group.members.length, 0);
  return (
    <section className="avatar-team-rail" aria-label="Avatar teams">
      <div className="section-head hapa-panel-head">
        <span><Users size={15} /> Avatar Teams</span>
        <em>{visibleCount}</em>
      </div>
      <div className="avatar-team-list">
        {groups.map((group) => {
          const expanded = expandedTeamIds.includes(group.id);
          const hasSelected = group.members.some((member) => member.avatar.id === selectedAvatarId);
          return (
            <article
              className={`avatar-team-group hapa-card ${expanded ? "expanded" : ""} ${hasSelected ? "contains-selected" : ""}`}
              data-card-type={group.virtual ? "resource" : "avatar"}
              data-granularity="mini"
              data-state={hasSelected ? "selected" : "idle"}
              key={group.id}
            >
              <button className="avatar-team-toggle" type="button" onClick={() => onToggle(group.id)}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>
                  <strong>{group.title}</strong>
                  <small>{group.description || group.status}</small>
                </span>
                <em>{group.members.length}</em>
              </button>
              {expanded && (
                <div className="avatar-team-members">
                  {group.members.length ? group.members.map(({ avatar, role }) => {
                    const cardAudit = avatarAudits.get(avatar.id) || displayAuditForAvatar(avatar);
                    const portraitAsset = avatarPortraits.get(avatar.id);
                    return (
                      <button
                        {...builderPickupDataset({ id: avatar.id, entityType: "avatar", title: avatar.primaryName, subtitle: role || avatar.role, uri: `/api/avatars/${encodeURIComponent(avatar.id)}` })}
                        className={`avatar-row hapa-card ${avatar.id === selectedAvatarId ? "active" : ""}`}
                        data-card-type="avatar"
                        data-granularity="mini"
                        data-state={avatar.id === selectedAvatarId ? "selected" : "idle"}
                        key={avatar.id}
                        type="button"
                        onClick={() => onSelect(avatar.id)}
                      >
                        <div className={`avatar-orb ${portraitAsset ? "has-portrait" : ""}`} style={{ "--progress": `${cardAudit.percent}%` }}>
                          {portraitAsset ? <AssetVisual asset={portraitAsset} mode="thumb" /> : <span>{avatar.primaryName.slice(0, 1)}</span>}
                        </div>
                        <span>
                          <strong>{avatar.primaryName}</strong>
                          <small>{role || avatar.names.map((name) => name.name).join(" / ")}</small>
                        </span>
                        <em>{cardAudit.percent}%</em>
                      </button>
                    );
                  }) : (
                    <div className="team-empty-row">
                      <span>No members yet</span>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TeamAssignmentPanel({ selectedAvatar, teams, draft, membership, onDraft, onCreate, onSave }) {
  if (!selectedAvatar) return null;
  return (
    <section className="team-management-panel hapa-panel" data-variant="resting">
      <div className="section-head hapa-panel-head compact">
        <span><UserPlus size={14} /> Groupings & Teams</span>
        <em>{membership?.team?.title || "Ungrouped"}</em>
      </div>
      <form className="team-create-form" onSubmit={onCreate}>
        <label>
          <span>New team</span>
          <input
            value={draft.title || ""}
            onChange={(event) => onDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Create team"
          />
        </label>
        <button className="hapa-btn" data-intent="secondary" type="submit">
          <Plus size={13} />
          New
        </button>
      </form>
      <form className="team-role-form" onSubmit={onSave}>
        <label>
          <span>{selectedAvatar.primaryName} team</span>
          <select
            value={draft.teamId || membership?.team?.id || "__ungrouped"}
            onChange={(event) => onDraft((current) => ({ ...current, teamId: event.target.value }))}
          >
            <option value="__ungrouped">Ungrouped</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.title}</option>)}
          </select>
        </label>
        <label>
          <span>Role</span>
          <select
            value={draft.role || membership?.member?.role || "Support"}
            onChange={(event) => onDraft((current) => ({ ...current, role: event.target.value }))}
          >
            {AVATAR_TEAM_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
        <label className="team-notes-field">
          <span>Role notes</span>
          <input
            value={draft.notes || ""}
            onChange={(event) => onDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Optional team note"
          />
        </label>
        <button className="hapa-btn" data-intent="primary" type="submit">
          <BadgeCheck size={13} />
          Save Team Role
        </button>
      </form>
    </section>
  );
}

function ItemManagerView({
  itemStore,
  inventoryStore,
  avatars,
  selectedItem,
  selectedItemId,
  selectedAvatarId,
  onSelectItem,
  onSelectAvatar,
  onCreateItem,
  onUpdateItem,
  onEquipItem
}) {
  const [kindFilter, setKindFilter] = useState("all");
  const [groupMode, setGroupMode] = useState("type");
  const [selectedGroupKey, setSelectedGroupKey] = useState("all");
  const [sortMode, setSortMode] = useState("title");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [equipHardpoint, setEquipHardpoint] = useState("items");
  const [equipZone, setEquipZone] = useState("equipped");
  const [createDraft, setCreateDraft] = useState({
    title: "",
    kind: "object",
    summary: "",
    canonStatus: "scaffold"
  });
  const [editDraft, setEditDraft] = useState(() => itemDraftFromCard(selectedItem));

  useEffect(() => {
    setEditDraft(itemDraftFromCard(selectedItem));
    const hintedHardpoint = selectedItem?.equipment?.hardpointHints?.[0];
    if (hintedHardpoint) setEquipHardpoint(hintedHardpoint);
    if (["protocol", "skill", "node"].includes(selectedItem?.kind)) setEquipZone("deck");
  }, [selectedItem?.id]);

  useEffect(() => {
    setSelectedGroupKey("all");
  }, [groupMode]);

  const avatarById = useMemo(() => new Map(avatars.map((avatar) => [avatar.id, avatar])), [avatars]);
  const telemetry = useMemo(() => buildItemCatalogTelemetry(itemStore.cards, inventoryStore, avatarById), [itemStore.cards, inventoryStore, avatarById]);
  const groupEntries = useMemo(() => buildItemGroupEntries(itemStore.cards, groupMode, avatarById), [itemStore.cards, groupMode, avatarById]);
  const activeGroup = groupEntries.find((entry) => entry.key === selectedGroupKey) || groupEntries[0] || null;
  const foundationFamilies = useMemo(() => FOUNDATION_CARD_FAMILIES.map((family) => {
    const cards = itemStore.cards.filter((card) => card.kind === family.kind);
    const mediaCards = cards.filter((card) => itemPreviewUri(card)).slice(0, 4);
    const deckCount = (inventoryStore.avatarInventories || []).reduce((total, inventory) => {
      const deckIds = [
        ...(inventory.library || []),
        ...(inventory.deck || []),
        ...(inventory.hand || []),
        ...(inventory.trainingDeck || [])
      ];
      return total + deckIds.filter((cardId) => cards.some((card) => card.id === cardId)).length;
    }, 0);
    return {
      ...family,
      count: cards.length,
      mediaCount: cards.filter((card) => (card.mediaAssets || []).length).length,
      deckCount,
      samples: mediaCards
    };
  }), [itemStore.cards, inventoryStore.avatarInventories]);

  const filteredCards = sortItemCards(itemStore.cards.filter((card) => {
    const matchesKind = kindFilter === "all" || card.kind === kindFilter;
    const matchesGroup = selectedGroupKey === "all" || itemGroupKeys(card, groupMode, avatarById).includes(selectedGroupKey);
    const matchesMedia = mediaFilter === "all" || (mediaFilter === "with_media" ? (card.mediaAssets || []).length > 0 : !(card.mediaAssets || []).length);
    const haystack = [
      card.title,
      card.kind,
      card.summary,
      card.lore,
      card.canonStatus,
      itemPrimaryAvatarLabel(card, avatarById),
      itemPrimaryPlaceLabel(card),
      ...(card.tags || []),
      ...(card.connections?.avatarIds || []),
      ...(card.connections?.placeIds || [])
    ].join(" ").toLowerCase();
    return matchesKind && matchesGroup && matchesMedia && haystack.includes(query.toLowerCase());
  }), sortMode, avatarById);
  const selectedAvatar = avatars.find((avatar) => avatar.id === selectedAvatarId) || avatars[0] || null;
  const selectedInventory = inventoryStore.avatarInventories.find((inventory) => inventory.avatarId === selectedAvatar?.id) || null;
  const cardById = new Map(itemStore.cards.map((card) => [card.id, card]));
  const selectedMediaAssets = selectedItem?.mediaAssets || [];
  const avatarDeckZones = selectedInventory ? [
    { id: "library", label: "Library", cardIds: selectedInventory.library || [] },
    { id: "deck", label: "Avatar Deck", cardIds: selectedInventory.deck || [] },
    { id: "hand", label: "Hand", cardIds: selectedInventory.hand || [] },
    { id: "training", label: "Training Deck", cardIds: selectedInventory.trainingDeck || [] }
  ] : [];

  function selectCardFamily(kind) {
    setKindFilter(kind);
    setGroupMode("type");
    setSelectedGroupKey("all");
    setMediaFilter("all");
    setQuery("");
    const firstCard = itemStore.cards.find((card) => card.kind === kind);
    if (firstCard) onSelectItem(firstCard.id);
  }

  function submitCreate(event) {
    event.preventDefault();
    if (!createDraft.title.trim()) return;
    onCreateItem({
      ...createDraft,
      tags: [createDraft.kind, "manual-cms"],
      sourceRefs: [{ label: "Item Manager manual create", confidence: "soft" }]
    });
    setCreateDraft({ title: "", kind: "object", summary: "", canonStatus: "scaffold" });
  }

  function submitEdit(event) {
    event.preventDefault();
    if (!selectedItem) return;
    onUpdateItem(selectedItem.id, {
      title: editDraft.title,
      name: editDraft.title,
      kind: editDraft.kind,
      canonStatus: editDraft.canonStatus,
      summary: editDraft.summary,
      description: editDraft.description,
      lore: editDraft.lore,
      utility: splitLines(editDraft.utility),
      broadGameMechanics: splitLines(editDraft.broadGameMechanics),
      tags: splitTags(editDraft.tags),
      rank: editDraft.rank,
      locationState: {
        currentPlaceName: editDraft.currentPlaceName,
        currentSystemName: editDraft.currentSystemName,
        currentShipName: editDraft.currentShipName,
        currentGardenName: editDraft.currentGardenName,
        holderAvatarIds: splitTags(editDraft.holderAvatarIds),
        state: editDraft.locationState
      },
      connections: {
        avatarIds: splitTags(editDraft.avatarIds),
        teamIds: splitTags(editDraft.teamIds),
        placeIds: splitTags(editDraft.placeIds),
        sceneIds: splitTags(editDraft.sceneIds),
        nodeIds: splitTags(editDraft.nodeIds),
        shipIds: splitTags(editDraft.shipIds)
      },
      mediaPrompts: {
        heroImage: editDraft.heroImagePrompt,
        twoD: editDraft.twoDPrompt,
        threeD: editDraft.threeDPrompt,
        comicPanel: editDraft.comicPanelPrompt,
        explainerVideo: editDraft.explainerVideoPrompt,
        wikiEntry: editDraft.wikiEntryPrompt,
        negativePrompt: editDraft.negativePrompt
      },
      equipment: {
        hardpointHints: splitTags(editDraft.hardpointHints),
        equipRules: splitLines(editDraft.equipRules),
        effects: splitLines(editDraft.effects),
        limits: splitLines(editDraft.limits)
      }
    }, `${editDraft.title || selectedItem.title} item card saved`);
  }

  return (
    <section className="item-manager-view">
      <div className="item-command-header panel hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Item Manager CMS</p>
          <h2>Cards, Decks, Protocols, Skills, Nodes</h2>
          <span>{itemStore.schemaVersion}</span>
        </div>
        <div className="item-readouts">
          <StatusChip label="CARDS" value={itemStore.audit.total} tone="cyan" />
          <StatusChip label="PROTOCOLS" value={itemStore.audit.byKind.protocol || 0} tone="cyan" />
          <StatusChip label="SKILLS" value={itemStore.audit.byKind.skill || 0} tone="green" />
          <StatusChip label="NODES" value={itemStore.audit.byKind.node || 0} tone="fuchsia" />
          <StatusChip label="ITEMS" value={itemStore.audit.byKind.item || 0} tone="orange" />
          <StatusChip label="MEDIA" value={itemStore.audit.withMedia || telemetry.withMedia} tone="cyan" />
          <StatusChip label="DECK" value={inventoryStore.audit.deckCards} tone="gold" />
          <StatusChip label="EQUIP" value={inventoryStore.audit.totalEquipments} tone="green" />
        </div>
      </div>

      <section className="panel hapa-panel item-dashboard-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><Radar size={15} /> Catalog Dashboard</span>
          <em>{activeGroup?.label || "All items"}</em>
        </div>
        <div className="item-telemetry-grid">
          <div>
            <strong>{telemetry.total}</strong>
            <span>Total cards</span>
          </div>
          <div>
            <strong>{telemetry.withMedia}</strong>
            <span>Linked media</span>
          </div>
          <div>
            <strong>{telemetry.equipped}</strong>
            <span>Equipped slots</span>
          </div>
          <div>
            <strong>{filteredCards.length}</strong>
            <span>Visible items</span>
          </div>
          <div>
            <strong>{telemetry.avatarGroups}</strong>
            <span>Avatar groups</span>
          </div>
          <div>
            <strong>{telemetry.placeGroups}</strong>
            <span>Place groups</span>
          </div>
        </div>
        <div className="item-layer-controls" aria-label="Item abstraction layers">
          {ITEM_GROUP_MODES.map((mode) => (
            <button
              className={groupMode === mode.id ? "active" : ""}
              key={mode.id}
              type="button"
              onClick={() => setGroupMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="item-group-grid" aria-label={`${groupMode} item groups`}>
          {groupEntries.map((entry) => (
            <button
              className={selectedGroupKey === entry.key ? "active" : ""}
              key={entry.key}
              type="button"
              onClick={() => setSelectedGroupKey(entry.key)}
            >
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.caption}</small>
              </span>
              <em>{entry.count}</em>
            </button>
          ))}
        </div>
        <div className="foundation-card-library" aria-label="Foundation card library">
          <header>
            <span><Layers3 size={15} /> Foundation Card Library</span>
            <em>{foundationFamilies.reduce((total, family) => total + family.count, 0)} cards</em>
          </header>
          <div className="foundation-card-family-grid">
            {foundationFamilies.map((family) => {
              const Icon = family.icon;
              return (
                <button
                  className={kindFilter === family.kind ? "active" : ""}
                  data-family={family.kind}
                  key={family.kind}
                  type="button"
                  onClick={() => selectCardFamily(family.kind)}
                >
                  <span className="foundation-family-icon"><Icon size={18} /></span>
                  <span className="foundation-family-copy">
                    <strong>{family.label}</strong>
                    <small>{family.caption}</small>
                  </span>
                  <span className="foundation-family-readouts">
                    <em>{family.count}</em>
                    <small>{family.mediaCount} media · {family.deckCount} deck refs</small>
                  </span>
                  <span className="foundation-family-media" aria-hidden="true">
                    {family.samples.length ? family.samples.map((card) => (
                      <i key={card.id}>
                        <img src={resolveMediaUri(itemPreviewUri(card))} alt="" loading="lazy" />
                      </i>
                    )) : <i><Box size={14} /></i>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="panel hapa-panel item-catalog-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><Box size={15} /> Individual Items</span>
          <em>{filteredCards.length}</em>
        </div>
        <label className="search-box hapa-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="filter individual items" />
        </label>
        <div className="item-sort-controls">
          <label>
            <span>Sort</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="title">Title</option>
              <option value="kind">Type</option>
              <option value="avatar">Avatar</option>
              <option value="place">Place</option>
              <option value="media">Media first</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
          <label>
            <span>Media</span>
            <select value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="with_media">Linked</option>
              <option value="without_media">Missing</option>
            </select>
          </label>
        </div>
        <div className="item-kind-tabs">
          {["all", ...ITEM_KINDS].map((kind) => (
            <button
              data-kind={kind}
              key={kind}
              className={kindFilter === kind ? "active" : ""}
              type="button"
              onClick={() => setKindFilter(kind)}
            >
              <strong>{itemKindFilterLabel(kind)}</strong>
              <small>{kind === "all" ? itemStore.cards.length : itemStore.audit.byKind[kind] || 0}</small>
            </button>
          ))}
        </div>
        <form className="item-create-form" onSubmit={submitCreate}>
          <input
            value={createDraft.title}
            onChange={(event) => setCreateDraft((draft) => ({ ...draft, title: event.target.value }))}
            placeholder="new card title"
          />
          <select
            value={createDraft.kind}
            onChange={(event) => setCreateDraft((draft) => ({ ...draft, kind: event.target.value }))}
          >
            {ITEM_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
          <input
            value={createDraft.summary}
            onChange={(event) => setCreateDraft((draft) => ({ ...draft, summary: event.target.value }))}
            placeholder="short summary"
          />
          <button className="hapa-btn" data-intent="primary" type="submit">
            <Plus size={14} />
            Create
          </button>
        </form>
        <div className="item-card-list">
          {filteredCards.length ? filteredCards.map((card) => {
            const previewUri = itemPreviewUri(card);
            const quality = itemQualityMetrics(card);
            return (
              <button
                {...builderPickupDataset({ id: card.id, entityType: card.cardType === "set" ? "set" : "card", title: card.title, subtitle: card.kind, thumbnail: previewUri, updatedAt: card.updatedAt, uri: `/api/items/cards/${encodeURIComponent(card.id)}` })}
                className={`item-card-row hapa-card ${previewUri ? "has-media" : ""} ${selectedItemId === card.id ? "selected" : ""}`}
                data-card-type={itemCardType(card)}
                data-quality-rank={quality.tier}
                data-state={selectedItemId === card.id ? "selected" : "idle"}
                key={card.id}
                type="button"
                onClick={() => onSelectItem(card.id)}
              >
                {previewUri && (
                  <span className="item-row-thumb" aria-hidden="true">
                    <img src={resolveMediaUri(previewUri)} alt="" loading="lazy" />
                  </span>
                )}
                <span>
                  <strong>{card.title}</strong>
                  <small>{card.kind} · {card.canonStatus}</small>
                </span>
                <em className="item-card-quality-badge">
                  {quality.rank}
                  <span>LV {quality.level} · DUR {quality.durability}</span>
                </em>
              </button>
            );
          }) : (
            <div className="intake-empty hapa-panel" data-variant="resting">
              <Box size={22} />
              <strong>No item cards</strong>
              <span>Run the audit agent or create the first card.</span>
            </div>
          )}
        </div>
      </aside>

      <section className="panel hapa-panel item-editor-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><FileJson size={15} /> Card Record</span>
          <em>{selectedItem?.kind || "none"}</em>
        </div>
        {selectedItem ? (
          <form className="item-editor-form" onSubmit={submitEdit}>
            {selectedMediaAssets.length > 0 && (
              <div className="item-media-strip" aria-label="Linked item media">
                {selectedMediaAssets.map((asset) => (
                  <ItemMediaLink
                    asset={asset}
                    key={asset.id || asset.uri || asset.thumbnailUri}
                    title={selectedItem.title}
                  />
                ))}
              </div>
            )}
            <div className="item-editor-grid">
              <label>
                <span>Title</span>
                <input value={editDraft.title} onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))} />
              </label>
              <label>
                <span>Kind</span>
                <select value={editDraft.kind} onChange={(event) => setEditDraft((draft) => ({ ...draft, kind: event.target.value }))}>
                  {ITEM_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label>
                <span>Canon</span>
                <select value={editDraft.canonStatus} onChange={(event) => setEditDraft((draft) => ({ ...draft, canonStatus: event.target.value }))}>
                  {["hard_canon", "soft_canon", "scaffold", "generated", "disputed"].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>
                <span>Rank</span>
                <input value={editDraft.rank} onChange={(event) => setEditDraft((draft) => ({ ...draft, rank: event.target.value }))} />
              </label>
              <label className="wide">
                <span>Summary</span>
                <textarea value={editDraft.summary} onChange={(event) => setEditDraft((draft) => ({ ...draft, summary: event.target.value }))} rows={2} />
              </label>
              <label className="wide">
                <span>Description</span>
                <textarea value={editDraft.description} onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))} rows={3} />
              </label>
              <label className="wide">
                <span>Lore / canon description</span>
                <textarea value={editDraft.lore} onChange={(event) => setEditDraft((draft) => ({ ...draft, lore: event.target.value }))} rows={4} />
              </label>
              <label>
                <span>Current place</span>
                <input value={editDraft.currentPlaceName} onChange={(event) => setEditDraft((draft) => ({ ...draft, currentPlaceName: event.target.value }))} />
              </label>
              <label>
                <span>Current ship</span>
                <input value={editDraft.currentShipName} onChange={(event) => setEditDraft((draft) => ({ ...draft, currentShipName: event.target.value }))} />
              </label>
              <label>
                <span>Current Garden</span>
                <input value={editDraft.currentGardenName} onChange={(event) => setEditDraft((draft) => ({ ...draft, currentGardenName: event.target.value }))} />
              </label>
              <label>
                <span>Current system</span>
                <input value={editDraft.currentSystemName} onChange={(event) => setEditDraft((draft) => ({ ...draft, currentSystemName: event.target.value }))} />
              </label>
              <label className="wide">
                <span>Utility mechanics</span>
                <textarea value={editDraft.utility} onChange={(event) => setEditDraft((draft) => ({ ...draft, utility: event.target.value }))} rows={3} />
              </label>
              <label className="wide">
                <span>Broad game mechanics</span>
                <textarea value={editDraft.broadGameMechanics} onChange={(event) => setEditDraft((draft) => ({ ...draft, broadGameMechanics: event.target.value }))} rows={3} />
              </label>
              <label className="wide">
                <span>2D prompt</span>
                <textarea value={editDraft.twoDPrompt} onChange={(event) => setEditDraft((draft) => ({ ...draft, twoDPrompt: event.target.value }))} rows={3} />
              </label>
              <label className="wide">
                <span>3D prompt</span>
                <textarea value={editDraft.threeDPrompt} onChange={(event) => setEditDraft((draft) => ({ ...draft, threeDPrompt: event.target.value }))} rows={3} />
              </label>
              <label className="wide">
                <span>Hero image prompt</span>
                <textarea value={editDraft.heroImagePrompt} onChange={(event) => setEditDraft((draft) => ({ ...draft, heroImagePrompt: event.target.value }))} rows={3} />
              </label>
              <label className="wide">
                <span>Avatar IDs</span>
                <input value={editDraft.avatarIds} onChange={(event) => setEditDraft((draft) => ({ ...draft, avatarIds: event.target.value }))} />
              </label>
              <label className="wide">
                <span>Tags</span>
                <input value={editDraft.tags} onChange={(event) => setEditDraft((draft) => ({ ...draft, tags: event.target.value }))} />
              </label>
              <label className="wide">
                <span>Hardpoint hints</span>
                <input value={editDraft.hardpointHints} onChange={(event) => setEditDraft((draft) => ({ ...draft, hardpointHints: event.target.value }))} />
              </label>
            </div>
            <button className="hapa-btn" data-intent="primary" type="submit">
              <BadgeCheck size={14} />
              Save Card
            </button>
          </form>
        ) : (
          <div className="empty-state hapa-panel" data-variant="resting">
            <Box size={30} />
            <span>Select or create an item card</span>
          </div>
        )}
      </section>

      <aside className="panel hapa-panel item-inventory-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><Archive size={15} /> Avatar Inventory</span>
          <em>{selectedAvatar?.primaryName || "none"}</em>
        </div>
        <label>
          <span>Avatar</span>
          <select value={selectedAvatar?.id || ""} onChange={(event) => onSelectAvatar(event.target.value)}>
            {avatars.map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.primaryName}</option>)}
          </select>
        </label>
        <label>
          <span>Hardpoint</span>
          <select value={equipHardpoint} onChange={(event) => setEquipHardpoint(event.target.value)}>
            {EQUIPMENT_HARDPOINTS.map((hardpoint) => <option key={hardpoint.id} value={hardpoint.id}>{hardpoint.label}</option>)}
          </select>
        </label>
        <label>
          <span>Zone</span>
          <select value={equipZone} onChange={(event) => setEquipZone(event.target.value)}>
            {["equipped", "library", "deck", "hand", "training_deck"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
        <button
          className="hapa-btn"
          data-intent="primary"
          type="button"
          disabled={!selectedAvatar || !selectedItem}
          onClick={() => onEquipItem({
            avatarId: selectedAvatar.id,
            cardId: selectedItem.id,
            hardpointId: equipHardpoint,
            zone: equipZone
          })}
        >
          <Sparkles size={14} />
          Add / Equip Card
        </button>

        <div className="item-hardpoint-list">
          {selectedInventory ? selectedInventory.hardpoints.map((hardpoint) => (
            <article className="item-hardpoint-card hapa-card" data-card-type="resource" data-state={hardpoint.cardIds.length ? "active" : "idle"} key={hardpoint.id}>
              <header>
                <strong>{hardpoint.label}</strong>
                <em>{hardpoint.cardIds.length}/{hardpoint.maxCards}</em>
              </header>
              <small>{hardpoint.description}</small>
              <div className="item-equipped-list">
                {hardpoint.cardIds.length ? hardpoint.cardIds.map((cardId) => {
                  const card = cardById.get(cardId);
                  return (
                    <button
                      className={`item-equipped-card${card ? " has-card" : ""}${itemHasVideo(card) ? " has-video" : ""}`}
                      key={cardId}
                      type="button"
                      onClick={() => onSelectItem(cardId)}
                    >
                      {card ? <MediaCardThumb card={card} /> : <span className="media-card-thumb is-empty"><Box size={14} /></span>}
                      <span className="item-equipped-copy">
                        <strong>{card?.title || cardId}</strong>
                        <small>{card ? itemCardMetaLabel(card) : "missing card"}</small>
                      </span>
                    </button>
                  );
                }) : <span>Empty</span>}
              </div>
            </article>
          )) : (
            <div className="empty-state hapa-panel" data-variant="resting">
              <Archive size={26} />
              <span>No inventory record yet</span>
            </div>
          )}
        </div>
        {selectedInventory && (
          <div className="avatar-deck-zones">
            <div className="section-head hapa-panel-head">
              <span><Layers3 size={14} /> Avatar Deck Zones</span>
              <em>{selectedInventory.deck.length}</em>
            </div>
            {avatarDeckZones.map((zone) => (
              <article className="avatar-deck-zone" key={zone.id}>
                <header>
                  <strong>{zone.label}</strong>
                  <em>{zone.cardIds.length}</em>
                </header>
                <div className="item-equipped-list compact">
                  {zone.cardIds.length ? zone.cardIds.slice(0, 12).map((cardId) => {
                    const card = cardById.get(cardId);
                    return (
                      <button
                        className={`item-equipped-card${card ? " has-card" : ""}${itemHasVideo(card) ? " has-video" : ""}`}
                        key={`${zone.id}-${cardId}`}
                        type="button"
                        onClick={() => onSelectItem(cardId)}
                      >
                        {card ? <MediaCardThumb card={card} /> : <span className="media-card-thumb is-empty"><Box size={14} /></span>}
                        <span className="item-equipped-copy">
                          <strong>{card?.title || cardId}</strong>
                          <small>{card ? itemCardMetaLabel(card) : "missing card"}</small>
                        </span>
                      </button>
                    );
                  }) : <span>Empty</span>}
                  {zone.cardIds.length > 12 && <span>+{zone.cardIds.length - 12} more</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </aside>
    </section>
  );
}

function AvatarShowcaseView({
  avatar,
  avatars,
  audit,
  mindPack,
  inventoryStore,
  itemStore,
  songLibrary,
  profileTrail = [],
  profileReturnRoute = null,
  menuOpen = false,
  onExpandAsset,
  onSelectAvatarProfile,
  onBackProfile,
  onToggleFullMenu,
  onReturnToProfileOrigin
}) {
  const [activeGalleryId, setActiveGalleryId] = useState("identity");
  const [expandedCardId, setExpandedCardId] = useState(null);
  const summary = mindPack.summary;
  const mind = mindPack.mind;
  const introductionParagraphs = useMemo(
    () => splitBackgroundNarrative(avatar.three_paragraph_background_narrative),
    [avatar.three_paragraph_background_narrative]
  );
  const heroVideo = useMemo(() => pickAvatarHeroVideo(avatar), [avatar]);
  const heroAsset = useMemo(() => pickAvatarHeroImage(avatar), [avatar]);
  const backdropAssets = useMemo(() => pickAvatarBackdropVideos(avatar), [avatar]);
  const galleryGroups = useMemo(() => buildAvatarShowcaseGalleryGroups(avatar), [avatar]);
  const kitAssets = useMemo(() => (avatar.assets || []).filter(isAvatarKitAsset), [avatar.assets]);
  const showcaseAssets = useMemo(
    () => uniqueAssetCollection([heroAsset, ...galleryGroups.flatMap((group) => group.assets)]),
    [heroAsset, galleryGroups]
  );
  const activeGallery = galleryGroups.find((group) => group.id === activeGalleryId) || galleryGroups[0] || { assets: [] };
  const videoBranchMap = useMemo(() => createVideoBranchMap(avatar), [avatar]);
  const inventory = inventoryStore.avatarInventories.find((item) => item.avatarId === avatar.id) || null;
  const itemById = useMemo(() => new Map(itemStore.cards.map((card) => [card.id, card])), [itemStore.cards]);
  const equippedCards = inventory
    ? inventory.hardpoints.flatMap((hardpoint) => hardpoint.cardIds.map((cardId) => ({ hardpoint, card: itemById.get(cardId) })).filter((entry) => entry.card))
    : [];
  const inventoryTarotCards = useMemo(
    () => buildAvatarTarotCards(inventory, itemById),
    [inventory, itemById]
  );
  const mindTarotChoiceCards = useMemo(
    () => buildMindTarotChoiceShowcaseCards(summary.loadout.tarotCards, avatar, itemById),
    [summary.loadout.tarotCards, avatar, itemById]
  );
  const tarotCards = useMemo(
    () => uniqueShowcaseCards([...inventoryTarotCards, ...mindTarotChoiceCards]).slice(0, 18),
    [inventoryTarotCards, mindTarotChoiceCards]
  );
  const loadoutSections = useMemo(
    () => buildShowcaseLoadoutSections(inventory, itemById, summary, avatar),
    [inventory, itemById, summary, avatar]
  );
  const loadoutCardById = useMemo(
    () => new Map(loadoutSections.flatMap((section) => section.cards.map((card) => [card.id, card]))),
    [loadoutSections]
  );
  const expandedCard = expandedCardId ? itemById.get(expandedCardId) || loadoutCardById.get(expandedCardId) : null;
  const facts = mind.selfKnowledge.filter((item) => item.status !== "tombstone").slice(0, 7);
  const memories = mind.memoryLedger.filter((item) => item.status !== "tombstone").slice(0, 4);
  const phraseCards = summary.phraseCards.slice(0, 9);
  const storySpine = mind.storySpine || null;
  const canonicalChoices = useMemo(
    () => (mind.canonicalChoices || []).filter(isActiveMindRecord).slice(0, 6),
    [mind.canonicalChoices]
  );
  const annualSceneBeats = (mind.annualSceneBeats || []).filter(isActiveMindRecord).slice(0, 4);
  const relationshipCards = summary.knownOthers.slice(0, 8);
  const relationshipProfileCards = useMemo(
    () => relationshipCards.map((relationship) => {
      const targetAvatar = relationshipTargetAvatar(relationship, avatars);
      return {
        relationship,
        targetAvatar,
        portrait: targetAvatar ? defaultCloseupEmotionAsset(targetAvatar) : null
      };
    }),
    [relationshipCards, avatars]
  );
  const songCards = useMemo(() => summary.loadout.songCards.slice(0, 3), [summary.loadout.songCards]);
  const consciousnessCopies = summary.consciousnessCopies.slice(0, 3);
  const speechPortraits = useMemo(() => closeupSpeechPortraits(avatar), [avatar]);
  const [activeSongId, setActiveSongId] = useState(() => songChoiceKey(songCards[0] || {}));
  const [songPlaying, setSongPlaying] = useState(false);
  const [showSongLyrics, setShowSongLyrics] = useState(false);
  const teamLabel = avatar.mind?.gardenNodeAssignment?.teamName || avatar.mind?.gardenNodeAssignment?.teamId || "Unassigned team";
  const roleLabel = avatar.mind?.gardenNodeAssignment?.role || avatar.mind?.shipCrewAssignment?.role || "Avatar";
  const gardenLabel = summary.gardenNodeAssignment?.gardenName || "Garden pending";
  const shipLabel = summary.shipCrewAssignment?.vesselName || summary.gardenNodeAssignment?.shipName || "Ship pending";
  const identityLine = mind.personaAnchor.identityStatement || avatar.summary || summary.soulSeed?.soulThesis || "Avatar identity is still emerging.";
  const activeSong = songCards.find((song) => songChoiceKey(song) === activeSongId) || songCards[0] || null;
  const backdropPlaylist = useMemo(
    () => (backdropAssets.length ? backdropAssets : [heroVideo || heroAsset].filter(Boolean)),
    [backdropAssets, heroAsset, heroVideo]
  );
  const activeMindTarotChoiceCount = (summary.loadout.tarotCards || []).filter(isActiveMindRecord).length;
  const tarotChoiceTotal = Math.max(tarotCards.length, inventoryTarotCards.length + activeMindTarotChoiceCount);
  const tarotChoiceOverflowCount = Math.max(0, tarotChoiceTotal - tarotCards.length);
  const loadoutSectionCardCount = loadoutSections.reduce((count, section) => count + section.cards.length, 0);

  useEffect(() => {
    if (expandedCardId && !itemById.has(expandedCardId) && !loadoutCardById.has(expandedCardId)) setExpandedCardId(null);
  }, [expandedCardId, itemById, loadoutCardById]);

  useEffect(() => {
    const fallbackId = songChoiceKey(songCards[0] || {});
    if (!songCards.some((song) => songChoiceKey(song) === activeSongId)) {
      setActiveSongId(fallbackId);
      setSongPlaying(false);
      setShowSongLyrics(false);
    }
  }, [activeSongId, songCards]);

  function handleGalleryKeyDown(event) {
    const scroller = event.currentTarget;
    const pageStep = Math.max(240, scroller.clientHeight * 0.82);
    const keyScroll = {
      ArrowDown: 180,
      ArrowUp: -180,
      PageDown: pageStep,
      PageUp: -pageStep
    };
    if (event.key === "Home") {
      event.preventDefault();
      scroller.scrollTo({ top: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    } else if (keyScroll[event.key]) {
      event.preventDefault();
      scroller.scrollBy({ top: keyScroll[event.key], behavior: "smooth" });
    }
  }

  return (
    <section className="avatar-showcase-view">
      <ShowcaseBackdrop assets={backdropPlaylist} />

      <header className="avatar-showcase-hero hapa-card" data-card-type="avatar" data-granularity="hero" data-state="active">
        <div className="showcase-hero-copy">
          <p className="eyebrow">Avatar Card</p>
          <h2>{avatar.primaryName}</h2>
          <div className="showcase-name-row">
            {(avatar.names || []).slice(0, 5).map((name) => <span key={name.name || name}>{name.name || name}</span>)}
          </div>
          <p className="showcase-thesis">{showcaseText(identityLine, "Avatar identity is still emerging.")}</p>
          <div className="showcase-hero-chips">
            <span><Users size={13} /> {teamLabel}</span>
            <span><BadgeCheck size={13} /> {roleLabel}</span>
            <span><MapPin size={13} /> {gardenLabel}</span>
            <span><Route size={13} /> {shipLabel}</span>
          </div>
        </div>
        <div className="showcase-portrait-frame">
          {heroAsset ? <AssetVisual asset={heroAsset} mode="full" eager /> : <Brain size={58} />}
          {heroVideo && (
            <video
              className="showcase-portrait-loop"
              src={resolveMediaUri(heroVideo.uri)}
              poster={resolveMediaUri(thumbnailUriForAsset(heroVideo) || heroAsset?.uri || "")}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          )}
          {heroAsset && (
            <button className="showcase-magnify hapa-btn" aria-label={`Expand ${heroAsset.name}`} type="button" onClick={() => onExpandAsset(heroAsset, showcaseAssets)}>
              <Search size={15} />
            </button>
          )}
        </div>
        <div className="showcase-hero-readouts">
          <StatusChip label="LEVEL" value={audit?.level || 1} tone="gold" />
          <StatusChip label="MEDIA" value={avatar.assets.length} tone="fuchsia" />
          <StatusChip label="FACTS" value={summary.counts.selfKnowledge} tone="cyan" />
          <StatusChip label="KIT" value={kitAssets.length} tone="green" />
        </div>
      </header>

      <ShowcaseProfileNav
        avatar={avatar}
        profileTrail={profileTrail}
        profileReturnRoute={profileReturnRoute}
        onBackProfile={onBackProfile}
        onSelectAvatarProfile={onSelectAvatarProfile}
        onReturnToProfileOrigin={onReturnToProfileOrigin}
        menuOpen={menuOpen}
        onToggleFullMenu={onToggleFullMenu}
      />

      {introductionParagraphs.length > 0 && (
        <section className="showcase-introduction panel hapa-panel" data-variant="resting" aria-label={`${avatar.primaryName} introduction`}>
          <div className="section-head hapa-panel-head">
            <span><BookOpen size={15} /> Introduction</span>
            <em>{introductionParagraphs.length} paragraphs</em>
          </div>
          <div className="showcase-introduction-copy">
            {introductionParagraphs.map((paragraph, index) => (
              <p key={`${avatar.id}-intro-${index}`}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      <section className="showcase-stats panel hapa-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><Radar size={15} /> Character Telemetry</span>
          <em>{summary.schemaVersion}</em>
        </div>
        <ShowcaseStatMeter label="Completion" value={audit?.percent || 0} />
        <ShowcaseStatMeter label="Lore Density" value={Math.min(100, summary.counts.selfKnowledge * 3)} />
        <ShowcaseStatMeter label="Relationship Web" value={Math.min(100, summary.counts.relationships * 8)} />
        <ShowcaseStatMeter label="Media Coverage" value={Math.min(100, avatar.assets.length)} />
        <ShowcaseStatMeter label="Loadout Depth" value={Math.min(100, (loadoutSectionCardCount + kitAssets.length) * 6)} />
      </section>

      <section className="showcase-gallery panel hapa-panel" data-variant="hot">
        <div className="section-head hapa-panel-head">
          <span><ImageIcon size={15} /> Visual Archive</span>
          <em>{activeGallery.assets.length}</em>
        </div>
        <div className="showcase-gallery-tabs">
          {galleryGroups.map((group) => (
            <button className={activeGallery.id === group.id ? "active" : ""} key={group.id} type="button" onClick={() => setActiveGalleryId(group.id)}>
              {group.label}
              <em>{group.assets.length}</em>
            </button>
          ))}
        </div>
        <div className="showcase-carousel" aria-label={`${activeGallery.label} media`} tabIndex={0} onKeyDown={handleGalleryKeyDown}>
          {activeGallery.assets.length ? activeGallery.assets.map((asset, index) => (
            <ShowcaseMediaTile
              asset={asset}
              branch={asset.type === "image" ? (videoBranchMap.get(asset.id) || [])[0] : null}
              index={index}
              key={asset.id}
              onExpand={(assetToExpand) => onExpandAsset(assetToExpand, activeGallery.assets)}
            />
          )) : (
            <div className="showcase-empty">
              <ImageIcon size={26} />
              <span>No media in this lane</span>
            </div>
          )}
        </div>
      </section>

      <section className="showcase-dossier panel hapa-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><BookOpen size={15} /> Dossier</span>
          <em>{summary.counts.selfKnowledge}</em>
        </div>
        <div className="showcase-copy-stack">
          <article>
            <p className="eyebrow"><Sparkles size={13} /> Soul Thesis</p>
            <strong>{showcaseText(summary.soulSeed?.soulThesis || mind.personaAnchor.carriedForward || avatar.summary, "Soul thesis pending")}</strong>
          </article>
          <article>
            <p className="eyebrow"><CheckCircle2 size={13} /> Wants</p>
            <span>{showcaseText(mind.personaAnchor.wants, "Not recorded")}</span>
          </article>
          <article>
            <p className="eyebrow"><Radar size={13} /> Fears</p>
            <span>{showcaseText(mind.personaAnchor.fears, "Not recorded")}</span>
          </article>
          <article>
            <p className="eyebrow"><VolumeX size={13} /> Will Not Say Directly</p>
            <span>{showcaseText(mind.personaAnchor.willNotSayDirectly, "Not recorded")}</span>
          </article>
        </div>
        <div className="showcase-fact-grid">
          {facts.map((fact) => (
            <div className="showcase-fact" key={fact.id}>
              <strong><BadgeCheck size={13} /> {fact.label}</strong>
              <span>{showcaseText(fact.value, "Fact pending")}</span>
              <em>{fact.classification} · {fact.confidence}</em>
            </div>
          ))}
        </div>
      </section>

      {(storySpine || canonicalChoices.length > 0) && (
        <section className="showcase-canon panel hapa-panel" data-variant="notch">
          <div className="section-head hapa-panel-head">
            <span><GitBranch size={15} /> Story Spine</span>
            <em>{canonicalChoices.length} choices</em>
          </div>
          {storySpine && (
            <article className="showcase-story-spine">
              <div>
                <p className="eyebrow"><Sparkles size={13} /> {storySpine.canonStatus || "soft_canon"} · {storySpine.reviewState || "pending_review"}</p>
                <strong>{showcaseText(storySpine.title, "Story spine pending")}</strong>
                <span>{showcaseText(storySpine.arc || storySpine.coreQuestion, "Arc pending")}</span>
              </div>
              <div className="showcase-spine-readouts">
                <StatusChip label="SCENES" value={(storySpine.sceneIds || []).length} tone="cyan" />
                <StatusChip label="RELS" value={(storySpine.relationshipIds || []).length} tone="fuchsia" />
                <StatusChip label="BEATS" value={(storySpine.annualSceneBeatIds || annualSceneBeats || []).length} tone="gold" />
              </div>
            </article>
          )}
          <div className="showcase-canon-choice-grid">
            {canonicalChoices.map((choice) => (
              <article className="showcase-canon-choice hapa-card" data-card-type="lore" data-granularity="mini" data-state="active" key={choice.id}>
                <p className="eyebrow"><CheckCircle2 size={13} /> {choice.canonStatus || "soft_canon"} · {choice.reviewState || "review"}</p>
                <strong>{showcaseText(choice.choiceText, "Choice pending")}</strong>
                <span>{showcaseText(choice.decisionPressure || choice.futurePayoff, "Choice pressure pending")}</span>
                <em>
                  {(choice.linkTargets?.sceneIds || []).length} scenes · {(choice.linkTargets?.cardIds || []).length} cards · {(choice.linkTargets?.journalEntryIds || []).length} journals
                </em>
              </article>
            ))}
          </div>
          {annualSceneBeats.length > 0 && (
            <div className="showcase-annual-beats">
              {annualSceneBeats.map((beat) => (
                <span key={beat.id}><Route size={12} /> {showcaseText(beat.title, "Annual beat")}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="showcase-loadout panel hapa-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><Archive size={15} /> Inventory & Loadout</span>
          <em>{loadoutSectionCardCount}</em>
        </div>
        <div className="showcase-loadout-sections">
          {loadoutSections.length ? loadoutSections.map((section) => (
            <ShowcaseLoadoutSection
              key={section.id}
              section={section}
              onExpandCard={(card) => setExpandedCardId(card.id)}
            />
          )) : <span className="showcase-muted">Inventory and mind loadout pending</span>}
        </div>
      </section>

      <section className="showcase-relationships panel hapa-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><Users size={15} /> Relationships</span>
          <em>{summary.counts.relationships}</em>
        </div>
        <div className="showcase-relationship-grid">
          {relationshipProfileCards.map(({ relationship, targetAvatar, portrait }) => (
            <button
              className="showcase-relation hapa-card"
              data-card-type="avatar"
              data-granularity="mini"
              data-state={targetAvatar ? "active" : "idle"}
              data-target-avatar-id={targetAvatar?.id || ""}
              disabled={!targetAvatar}
              key={`${relationship.id || relationship.name}-${relationship.relationLabel}`}
              type="button"
              aria-label={targetAvatar ? `Open ${targetAvatar.primaryName} Avatar Card` : `${relationship.name} profile unavailable`}
              onClick={() => targetAvatar && onSelectAvatarProfile?.(targetAvatar.id)}
            >
              <span className="relation-portrait" aria-hidden="true">
                {portrait ? <AssetVisual asset={portrait} mode="thumb" /> : <i>{(relationship.name || "?").slice(0, 1)}</i>}
              </span>
              <span className="relation-body">
                <span className="relation-title-row">
                  <strong>{relationship.name}</strong>
                  {targetAvatar && <em>Open Card <ChevronRight size={12} /></em>}
                </span>
                <span className="relation-label">
                  {relationship.relationLabel || "relationship"}
                  {relationship.sourceCount > 1 && <b>{relationship.sourceCount} refs</b>}
                </span>
                <span className="relation-meters">
                  <ShowcaseMiniMeter label="Trust" value={relationship.trust} />
                  <ShowcaseMiniMeter label="Tension" value={relationship.tension} />
                  <ShowcaseMiniMeter label="Loyalty" value={relationship.loyalty} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {tarotCards.length > 0 && (
        <section className="showcase-tarot panel hapa-panel" data-variant="hot">
          <div className="section-head hapa-panel-head">
            <span><Sparkles size={15} /> Card Choices</span>
            <em>{tarotCards.length}{tarotChoiceOverflowCount > 0 ? `/${tarotChoiceTotal}` : ""}</em>
          </div>
          <div className="showcase-tarot-grid">
            {tarotCards.map((card) => (
              <ShowcaseTarotCard card={card} key={card.id} />
            ))}
          </div>
        </section>
      )}

      <section className="showcase-voice panel hapa-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><Volume2 size={15} /> Voice, Songs, Copies</span>
          <em>{phraseCards.length}</em>
        </div>
        <div className="showcase-speech-grid">
          {phraseCards.map((card, index) => {
            const portrait = speechPortraits[index % Math.max(1, speechPortraits.length)] || heroAsset;
            return (
              <article className="showcase-speech-card hapa-card" data-card-type="avatar" data-granularity="mini" data-state="active" key={card.id}>
                <div className="speech-avatar">
                  {portrait ? <AssetVisual asset={portrait} mode="thumb" /> : <span>{avatar.primaryName.slice(0, 1)}</span>}
                </div>
                <div className="speech-bubble">
                  <strong>{card.phrase}</strong>
                  <span>{card.trigger || card.primaryUse || card.cardRole || "signature reaction"}</span>
                </div>
              </article>
            );
          })}
        </div>
        <ShowcaseSongPlayer
          activeSong={activeSong}
          isPlaying={songPlaying}
          onSelectSong={(song) => {
            setActiveSongId(songChoiceKey(song));
            setSongPlaying(true);
          }}
          onToggleLyrics={() => setShowSongLyrics((value) => !value)}
          onTogglePlay={() => setSongPlaying((value) => !value)}
          onPlaybackEnded={() => setSongPlaying(false)}
          showLyrics={showSongLyrics}
          songLibrary={songLibrary}
          songs={songCards}
        />
        <div className="showcase-copy-mini-grid">
          {consciousnessCopies.map((copy) => (
            <article className="showcase-copy-card hapa-card" data-card-type="lore" data-granularity="mini" data-state="idle" key={copy.copyId || copy.id}>
              <GitBranch size={14} />
              <strong>{copy.copyName || copy.name}</strong>
              <span>{showcaseText(copy.mission || copy.identityRelation, "consciousness copy")}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="showcase-manifest panel hapa-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><FileJson size={15} /> Manifest & Contract</span>
          <em>{avatar.schemaVersion}</em>
        </div>
        <div className="showcase-contract-grid">
          {MEDIA_REQUIREMENTS.map((requirement) => (
            <div className="contract-row" key={requirement.id}>
              <strong>{requirement.label}</strong>
              <span>{requirement.required || `${avatar.names.length} names x ${requirement.requiredPerName}`}</span>
            </div>
          ))}
        </div>
        <DeferredJsonPre value={avatar} placeholder="Preparing avatar manifest..." />
      </section>

      {expandedCard && (
        <ShowcaseCardDetailModal
          card={expandedCard}
          onClose={() => setExpandedCardId(null)}
        />
      )}
    </section>
  );
}

function splitBackgroundNarrative(value = "") {
  return String(value || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 3);
}

const SHOWCASE_BACKDROP_IMAGE_PLAY_MS = 4000;
const SHOWCASE_BACKDROP_CROSSFADE_MS = 900;
const SHOWCASE_BACKDROP_QUEUE_SIZE = 4;

function showcaseAssetKey(asset) {
  return String(asset?.id || asset?.uri || asset?.path || asset?.name || "empty");
}

function showcaseSlotReadyKey(slot, asset) {
  return `${slot}:${showcaseAssetKey(asset)}`;
}

function createShowcaseBackdropQueue(playlist) {
  if (!playlist.length) return [];
  const queueSize = Math.min(SHOWCASE_BACKDROP_QUEUE_SIZE, playlist.length);
  return Array.from({ length: queueSize }, (_, index) => playlist[index % playlist.length] || null);
}

function isShowcaseVideoAsset(asset) {
  if (!asset || asset.type !== "video") return false;
  return Boolean(mediaSourceForAsset(asset, "full")?.fullUri);
}

function ShowcaseBackdrop({ assets = [] }) {
  const playlist = useMemo(() => (Array.isArray(assets) ? assets : [assets]).filter(Boolean), [assets]);
  const playlistKey = playlist.map((asset) => asset.id || asset.uri || asset.name).join("|");
  const refillTimersRef = useRef([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeSlot, setActiveSlot] = useState(0);
  const [advanceRequested, setAdvanceRequested] = useState(false);
  const [fadingSlots, setFadingSlots] = useState(() => new Set());
  const [readySlots, setReadySlots] = useState(() => new Set());
  const [slotAssets, setSlotAssets] = useState(() => createShowcaseBackdropQueue(playlist));
  const canCycle = playlist.length > 1;
  const queueSize = slotAssets.length;
  const activeAsset = slotAssets[activeSlot] || null;
  const activeIsVideo = isShowcaseVideoAsset(activeAsset);
  const nextSlot = canCycle && queueSize > 1 ? (activeSlot + 1) % queueSize : null;
  const nextReadyKey = nextSlot !== null && slotAssets[nextSlot] ? showcaseSlotReadyKey(nextSlot, slotAssets[nextSlot]) : null;

  useEffect(() => {
    setActiveIndex(0);
    setActiveSlot(0);
    setAdvanceRequested(false);
    setFadingSlots(new Set());
    setReadySlots(new Set());
    setSlotAssets(createShowcaseBackdropQueue(playlist));
    return () => {
      for (const timer of refillTimersRef.current) window.clearTimeout(timer);
      refillTimersRef.current = [];
    };
  }, [playlistKey]);

  useEffect(() => {
    if (!canCycle || !advanceRequested || nextSlot === null || !nextReadyKey || !readySlots.has(nextReadyKey)) return undefined;
    const retiringSlot = activeSlot;
    const nextIndex = (activeIndex + 1) % playlist.length;
    const refillIndex = (nextIndex + queueSize - 1) % playlist.length;
    const retiringAsset = slotAssets[retiringSlot];
    const refillAsset = playlist[refillIndex] || null;
    const shouldResetReady = showcaseAssetKey(retiringAsset) !== showcaseAssetKey(refillAsset);
    setFadingSlots((current) => {
      const nextFading = new Set(current);
      nextFading.add(retiringSlot);
      return nextFading;
    });
    setActiveIndex(nextIndex);
    setActiveSlot(nextSlot);
    setAdvanceRequested(false);
    const refillTimer = window.setTimeout(() => {
      setFadingSlots((current) => {
        const nextFading = new Set(current);
        nextFading.delete(retiringSlot);
        return nextFading;
      });
      setSlotAssets((current) => {
        const nextSlots = [...current];
        nextSlots[retiringSlot] = refillAsset;
        return nextSlots;
      });
      if (shouldResetReady) {
        setReadySlots((current) => {
          const nextReady = new Set();
          for (const key of current) {
            if (!key.startsWith(`${retiringSlot}:`)) nextReady.add(key);
          }
          return nextReady;
        });
      }
      refillTimersRef.current = refillTimersRef.current.filter((timer) => timer !== refillTimer);
    }, SHOWCASE_BACKDROP_CROSSFADE_MS);
    refillTimersRef.current.push(refillTimer);
    return undefined;
  }, [activeIndex, activeSlot, advanceRequested, canCycle, nextReadyKey, nextSlot, playlist, queueSize, readySlots, slotAssets]);

  useEffect(() => {
    if (!canCycle || advanceRequested || activeIsVideo) return undefined;
    const timer = window.setTimeout(() => {
      setAdvanceRequested(true);
    }, SHOWCASE_BACKDROP_IMAGE_PLAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, activeIsVideo, activeSlot, advanceRequested, canCycle]);

  function handleBufferReady(slot) {
    const readyAsset = slotAssets[slot];
    if (!readyAsset) return;
    setReadySlots((current) => {
      const nextReady = new Set(current);
      nextReady.add(showcaseSlotReadyKey(slot, readyAsset));
      return nextReady;
    });
  }

  function requestAdvance() {
    if (!canCycle || advanceRequested) return;
    setAdvanceRequested(true);
  }

  if (!playlist.length) return <div className="showcase-backdrop" />;
  return (
    <div className="showcase-backdrop" aria-hidden="true">
      {slotAssets.map((asset, slot) => (
        <ShowcaseBackdropLayer
          key={`${slot}-${asset?.id || asset?.uri || "empty"}`}
          asset={asset}
          active={slot === activeSlot}
          fading={fadingSlots.has(slot)}
          loop={!canCycle}
          onEnded={slot === activeSlot ? requestAdvance : undefined}
          onReady={() => handleBufferReady(slot)}
        />
      ))}
    </div>
  );
}

function ShowcaseBackdropLayer({ asset, active, fading = false, loop = false, onEnded, onReady }) {
  const videoRef = useRef(null);
  const source = asset ? mediaSourceForAsset(asset, "full") : null;
  const playing = active || fading;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    if (!playing) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Some streaming videos reject seeks until metadata is available.
      }
      return undefined;
    }
    if (active) {
      try {
        video.currentTime = 0;
      } catch {
        // Some streaming videos reject seeks until metadata is available.
      }
    }
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
    return undefined;
  }, [active, playing, source?.fullUri]);

  if (!asset) return null;
  const className = `showcase-backdrop-layer ${active ? "is-active" : "is-buffer"}${fading ? " is-fading" : ""}`;
  if (asset.type === "video" && source?.fullUri) {
    return (
      <video
        ref={videoRef}
        className={className}
        src={source.fullUri}
        poster={source.posterUri}
        muted
        loop={loop}
        playsInline
        preload="auto"
        onCanPlay={onReady}
        onEnded={onEnded}
      />
    );
  }
  if (source?.uri) {
    return <img className={className} src={source.uri} alt="" onLoad={onReady} />;
  }
  return null;
}

function ShowcaseMediaTile({ asset, branch, index, onExpand }) {
  const hoverAsset = branch || (asset.type === "video" ? asset : null);
  const hoverSource = hoverAsset ? mediaSourceForAsset(hoverAsset, "full") : null;
  return (
    <article className={`showcase-media-tile ${index === 0 ? "featured" : ""} hapa-card`} data-card-type={assetCardType(asset)} data-granularity="standard" data-state="idle" aria-label={asset.name} title={asset.name}>
      <div className="showcase-media-stage">
        <AssetVisual asset={asset} mode={index === 0 ? "full" : "preview"} eager={index === 0} />
        {hoverSource?.fullUri && (
          <video
            className="showcase-hover-loop"
            src={hoverSource.fullUri}
            poster={hoverSource.posterUri || hoverSource.uri}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        <button className="showcase-magnify hapa-btn" aria-label={`Expand ${asset.name}`} type="button" onClick={() => onExpand(asset)}>
          <Search size={15} />
        </button>
      </div>
      <footer>
        <strong>{asset.name}</strong>
        <span>{requirementById(asset.requirementId)?.shortLabel || asset.type}</span>
        {branch && <em><Film size={12} /> loop</em>}
      </footer>
    </article>
  );
}

function ShowcaseTarotCard({ card }) {
  const previewAsset = itemPreviewAsset(card);
  const videoAsset = itemVideoAsset(card);
  const imageUri = itemPreviewUri(card);
  const videoUri = videoAsset?.uri ? resolveMediaUri(videoAsset.uri) : "";
  const posterUri = itemMediaPosterUri(videoAsset || previewAsset || {}) || imageUri;
  const stats = card.shipCard?.stats || {};
  const keywords = card.shipCard?.keywords || [];
  const tarotNumber = card.shipCard?.tarotNumber || card.shipCard?.romanNumeral || "";
  return (
    <article className="showcase-tarot-card hapa-card" data-card-type="ship" data-state={videoUri ? "active" : "idle"}>
      <div className="tarot-media-stage">
        {imageUri ? (
          <img src={resolveMediaUri(imageUri)} alt="" loading="lazy" />
        ) : (
          <span className="tarot-fallback"><Sparkles size={24} /></span>
        )}
        {videoUri && (
          <video
            className="tarot-hover-loop"
            src={videoUri}
            poster={resolveMediaUri(posterUri)}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        {videoUri && <span className="tarot-loop-badge"><Film size={12} /> loop</span>}
      </div>
      <div className="tarot-card-copy">
        <span>{tarotNumber || card.shipCard?.archetype || "Tarot"}</span>
        <strong>{card.shipCard?.title || card.title}</strong>
        <em>{card.shipCard?.subtitle || card.shipCard?.archetype || itemCardMetaLabel(card)}</em>
        {keywords.length > 0 && (
          <div className="tarot-keywords">
            {keywords.slice(0, 3).map((keyword) => <i key={keyword}>{keyword}</i>)}
          </div>
        )}
        <p>{showcaseText(card.shipCard?.flavorText || card.shipCard?.effectText || card.summary, "Tarot card details pending.")}</p>
        <div className="tarot-stats">
          <span>S{stats.speed || 0}</span>
          <span>M{stats.morale || 0}</span>
          <span>SU{stats.supply || 0}</span>
          <span>I{stats.influence || 0}</span>
        </div>
      </div>
    </article>
  );
}

function ShowcaseProfileNav({
  avatar,
  profileTrail = [],
  profileReturnRoute = null,
  menuOpen = false,
  onBackProfile,
  onSelectAvatarProfile,
  onReturnToProfileOrigin,
  onToggleFullMenu
}) {
  return (
    <nav className="showcase-profile-nav hapa-panel" data-variant="notch" data-testid="profile-nav" aria-label="Avatar profile navigation">
      <button
        className="profile-menu-toggle hapa-btn"
        data-intent={menuOpen ? "warning" : "primary"}
        type="button"
        aria-pressed={menuOpen}
        onClick={onToggleFullMenu}
      >
        {menuOpen ? <ChevronLeft size={15} /> : <Grid3X3 size={15} />}
        {menuOpen ? "Focus Card" : "Full Menu"}
      </button>
      {profileReturnRoute && (
        <button className="profile-origin-back-button hapa-btn" data-intent="warning" type="button" onClick={onReturnToProfileOrigin}>
          <ChevronLeft size={15} />
          {profileReturnRoute.label}
        </button>
      )}
      <button className="profile-back-button hapa-btn" type="button" disabled={!profileTrail.length} onClick={onBackProfile}>
        <ChevronLeft size={15} />
        Back
      </button>
      <div className="showcase-breadcrumb" aria-label="Avatar Card breadcrumb">
        <span>Avatar Card</span>
        <ChevronRight size={13} />
        <strong>{avatar.primaryName}</strong>
        <em>{avatar.id}</em>
      </div>
      <div className="profile-trail-band" aria-label="Recently viewed Avatar Cards">
        <span>Recent</span>
        {profileTrail.length ? profileTrail.map((trailAvatar) => {
          const portrait = defaultCloseupEmotionAsset(trailAvatar);
          return (
            <button className="profile-trail-chip" key={trailAvatar.id} type="button" onClick={() => onSelectAvatarProfile?.(trailAvatar.id)}>
              {portrait ? <AssetVisual asset={portrait} mode="thumb" /> : <i>{trailAvatar.primaryName.slice(0, 1)}</i>}
              <strong>{trailAvatar.primaryName}</strong>
            </button>
          );
        }) : (
          <em>Profile trail arms after first jump</em>
        )}
      </div>
    </nav>
  );
}

function ShowcaseSongPlayer({ songs, activeSong, isPlaying, showLyrics, songLibrary = FALLBACK_SONG_LIBRARY, onSelectSong, onTogglePlay, onToggleLyrics, onPlaybackEnded }) {
  const audioRef = useRef(null);
  const [audioState, setAudioState] = useState("idle");
  const activeCard = findDearPapaSongCard(activeSong || {});
  const registryTrack = findSongRegistryTrack(activeSong || {}, songLibrary, activeCard);
  const lyricsText = songLyricsText(activeSong || {}, registryTrack);
  const vibeText = songVibeText(activeSong || {}, activeCard);
  const perspective = activeSong?.perspective || activeCard?.performancePerspective || {};
  const perspectiveLabel = perspective.avatarName || perspective.avatar_name || perspective.teamId || perspective.team_id || "Hapa";
  const audioSrc = registryTrack?.audioUri && registryTrack.localAvailable !== false
    ? resolveSongRegistryUri(registryTrack.audioUri)
    : "";
  const sourceLabel = songSourceLabel(songLibrary, registryTrack, audioState);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || audio.src === audioSrc) return;
    audio.pause();
    audio.load();
    setAudioState(audioSrc ? "ready" : "missing");
  }, [audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioSrc) {
      audio.pause();
      setAudioState(songLibrary.status === "ready" ? "missing" : songLibrary.status || "idle");
      return;
    }
    if (!isPlaying) {
      audio.pause();
      setAudioState((current) => (current === "playing" ? "paused" : current || "ready"));
      return;
    }
    setAudioState("loading");
    audio.play()
      .then(() => setAudioState("playing"))
      .catch(() => setAudioState("blocked"));
  }, [audioSrc, isPlaying, songLibrary.status]);

  if (!songs.length) {
    return (
      <div className="showcase-song-player empty">
        <Music size={18} />
        <span>Playlist pending</span>
      </div>
    );
  }

  return (
    <article className="showcase-song-player hapa-card" data-card-type="media" data-granularity="detail" data-state={isPlaying ? "active" : "idle"} data-playing={isPlaying ? "true" : "false"}>
      <audio
        className="song-audio-node"
        ref={audioRef}
        src={audioSrc || undefined}
        preload="metadata"
        crossOrigin="anonymous"
        onCanPlay={() => setAudioState((current) => (current === "loading" ? "ready" : current))}
        onEnded={() => {
          setAudioState("ended");
          onPlaybackEnded?.();
        }}
        onError={() => setAudioState("error")}
        onPause={() => setAudioState((current) => (current === "playing" ? "paused" : current))}
        onPlay={() => setAudioState("playing")}
      />
      <header className="song-player-head">
        <button className="song-play-toggle hapa-btn" data-icon-only type="button" aria-label={isPlaying ? "Pause active song" : "Play active song"} disabled={!audioSrc} onClick={onTogglePlay}>
          {isPlaying ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <div>
          <span>{perspectiveLabel} Signal</span>
          <strong>{activeSong?.title || "Song card"}</strong>
          <em className="song-source-readout">{sourceLabel}</em>
        </div>
        <button className="song-lyrics-toggle hapa-btn" type="button" aria-pressed={showLyrics} aria-label={showLyrics ? "Hide lyrics" : "Show lyrics"} onClick={onToggleLyrics}>
          <BookOpen size={14} />
          Lyrics
        </button>
      </header>
      <div className="song-visualizer" aria-hidden="true">
        <span className="song-orbit-core">
          <Music size={18} />
        </span>
        {Array.from({ length: 32 }, (_, index) => (
          <i
            key={index}
            style={{
              "--angle": `${index * 11.25}deg`,
              "--pulse": `${9 + ((index * 7) % 13)}px`,
              "--delay": `${index * 46}ms`
            }}
          />
        ))}
      </div>
      <p>{vibeText}</p>
      <div className="song-track-list" aria-label="Avatar playlist">
        {songs.map((song) => {
          const key = songChoiceKey(song);
          const card = findDearPapaSongCard(song);
          const track = findSongRegistryTrack(song, songLibrary, card);
          const trackLabel = songRegistryTrackLabel(songLibrary, track);
          return (
            <button className={songChoiceKey(activeSong || {}) === key ? "active" : ""} key={key} type="button" aria-label={`Play ${song.title}`} onClick={() => onSelectSong(song)}>
              <Music size={13} />
              <span>{song.title}</span>
              <em>{trackLabel}</em>
            </button>
          );
        })}
      </div>
      {showLyrics && (
        <pre className="song-lyrics-panel">{lyricsText}</pre>
      )}
    </article>
  );
}

function HapaSongsView({
  store,
  dataMode,
  selectedSong,
  selectedSongId,
  avatars,
  sceneGraph,
  songLibrary,
  onSelectSong,
  onToggleAvatar,
  onToggleScene,
  onUploadMedia,
  onToggleVisualizer,
  onAddStoryBeat,
  onOpenAvatar,
  onExpandAsset
}) {
  const [query, setQuery] = useState("");
  const [storyDraft, setStoryDraft] = useState({
    authorType: "human",
    avatarId: "",
    sceneId: "",
    body: ""
  });
  const songs = store.songs || [];
  const visualizerCatalog = store.visualizerCatalog?.length ? store.visualizerCatalog : HAPA_SONG_VISUALIZER_CATALOG;
  const referenceCatalog = store.referenceCatalog || [];
  const referencesById = useMemo(() => referenceCatalogIndex(referenceCatalog), [referenceCatalog]);
  const referenceGraphEdges = store.referenceGraphEdges || [];
  const registryLoadedCount = Array.isArray(songLibrary?.songs) ? songLibrary.songs.length : 0;
  const registryTotal = Number(songLibrary?.total) || registryLoadedCount;
  const sourceLabel = dataMode === "full" ? "API" : dataMode === "loading" ? "LOADING" : "FALLBACK";
  const placesById = useMemo(() => new Map((sceneGraph.places || []).map((place) => [place.id, place])), [sceneGraph.places]);
  const songRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return songs.filter((song) => {
      if (!needle) return true;
      return [
        song.title,
        song.songId,
        song.author,
        song.lyrics?.status,
        song.lore?.summary,
        ...(song.referenceConnectors || []).flatMap((connector) => [connector.referenceTitle, connector.referenceId]),
        ...(song.tags || [])
      ].join(" ").toLowerCase().includes(needle);
    });
  }, [query, songs]);
  const selectedSongCard = selectedSong ? findDearPapaSongCard(selectedSong) : null;
  const registryTrack = selectedSong ? findSongRegistryTrack(selectedSong, songLibrary, selectedSongCard) : null;
  const lyricsText = selectedSong ? (selectedSong.lyrics?.text || songLyricsText(selectedSong, registryTrack)) : "";
  const audioSrc = selectedSong?.audio?.mp3Uri
    ? resolveSongRegistryUri(selectedSong.audio.mp3Uri)
    : registryTrack?.audioUri
      ? resolveSongRegistryUri(registryTrack.audioUri)
      : "";
  const linkedAvatarIds = new Set((selectedSong?.attachments?.avatarLinks || []).map((link) => link.avatarId).filter(Boolean));
  const linkedSceneIds = new Set((selectedSong?.attachments?.sceneLinks || []).map((link) => link.sceneId).filter(Boolean));
  const linkedVisualizerIds = new Set((selectedSong?.visualizers || []).map((link) => link.id).filter(Boolean));
  const mediaInputId = `song-media-${String(selectedSong?.id || "none").replace(/[^a-z0-9_-]+/gi, "-")}`;
  const selectedAuthorAvatar = avatars.find((avatar) => avatar.id === storyDraft.avatarId) || null;
  const selectedReferenceIds = new Set((selectedSong?.referenceConnectors || []).map((connector) => connector.referenceId));
  const selectedReferenceGraphEdges = referenceGraphEdges.filter((edge) => (
    selectedReferenceIds.has(edge.fromReferenceId) || selectedReferenceIds.has(edge.toReferenceId)
  ));
  const selectedCandidateCount = (selectedSong?.referenceConnectors || []).filter((connector) => (
    connector.evidence?.classification?.startsWith("candidate") || connector.evidence?.classification?.startsWith("comparative")
  )).length;

  useEffect(() => {
    if (!selectedSong) return;
    setStoryDraft((draft) => ({
      ...draft,
      sceneId: draft.sceneId && (sceneGraph.scenes || []).some((scene) => scene.id === draft.sceneId) ? draft.sceneId : selectedSong.attachments?.sceneLinks?.[0]?.sceneId || "",
      avatarId: draft.avatarId && avatars.some((avatar) => avatar.id === draft.avatarId) ? draft.avatarId : selectedSong.attachments?.avatarLinks?.[0]?.avatarId || ""
    }));
  }, [selectedSong?.id, avatars, sceneGraph.scenes]);

  function submitStoryBeat(event) {
    event.preventDefault();
    if (!selectedSong || !storyDraft.body.trim()) return;
    onAddStoryBeat?.(selectedSong.id, {
      ...storyDraft,
      authorName: storyDraft.authorType === "avatar"
        ? selectedAuthorAvatar?.primaryName || "Avatar"
        : storyDraft.authorType === "lorekeeper"
          ? "Lorekeeper"
          : "Hapa operator",
      body: storyDraft.body.trim(),
      tags: ["dear-papa", "song-story", storyDraft.authorType]
    });
    setStoryDraft((draft) => ({ ...draft, body: "" }));
  }

  return (
    <section className="hapa-songs-view" aria-label="Hapa Songs Builder">
      <header className="hapa-songs-hero hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Hapa Songs</p>
          <h2>Dear Papa Song Builder</h2>
          <span>Manage the Dear Papa album only: lyrics, stems, media, lineage, visualizers, avatars, scenes, and story beats.</span>
        </div>
        <div className="hapa-songs-readouts">
          <StatusChip label="SONGS" value={store.audit?.songs || songs.length} tone="rose" />
          <StatusChip label="LYRICS" value={store.audit?.withLyrics || 0} tone="cyan" />
          <StatusChip label="AVATARS" value={store.audit?.withAvatars || 0} tone="fuchsia" />
          <StatusChip label="SCENES" value={store.audit?.withScenes || 0} tone="gold" />
          <StatusChip label="MEDIA" value={store.audit?.withMedia || 0} tone="green" />
          <StatusChip label="VIZ" value={store.audit?.withVisualizers || 0} tone="orange" />
        </div>
      </header>

      <aside className="songs-library-panel hapa-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><Music size={15} /> Dear Papa</span>
          <em>{sourceLabel} · {songRows.length}/{songs.length}</em>
        </div>
        <label className="search-box hapa-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, lore, status, tags" />
        </label>
        <div className="song-library-telemetry" aria-label="Dear Papa song load telemetry">
          <span><strong>{songRows.length}</strong><em>visible</em></span>
          <span><strong>{songs.length}</strong><em>loaded</em></span>
          <span><strong>{registryTotal || "cold"}</strong><em>registry</em></span>
          {query.trim() && (
            <button type="button" onClick={() => setQuery("")}>
              <X size={12} /> clear
            </button>
          )}
        </div>
        <div className="song-row-list" role="list" aria-label="Dear Papa songs">
          {songRows.map((song) => {
            const active = selectedSongId === song.id || selectedSong?.id === song.id;
            const completeSignals = [
              song.lyrics?.text,
              (song.attachments?.avatarLinks || []).length,
              (song.attachments?.sceneLinks || []).length,
              (song.media || []).length,
              (song.visualizers || []).length
            ].filter(Boolean).length;
            return (
              <button
                className={`song-row hapa-card ${active ? "selected" : ""}`}
                data-card-type="media"
                data-state={active ? "selected" : "idle"}
                key={song.id}
                type="button"
                onClick={() => onSelectSong?.(song.id)}
              >
                <span className="song-row-track">{String(song.trackNumber || "--").padStart(2, "0")}</span>
                <span className="song-row-copy">
                  <strong>{song.title}</strong>
                  <em>{song.lyrics?.status || "lyrics pending"} · {song.author}</em>
                </span>
                <output>{completeSignals}/5</output>
              </button>
            );
          })}
          {!songRows.length && (
            <div className="empty-state inline">
              <Search size={18} />
              <span>No songs match this filter. {songs.length} Dear Papa songs are loaded.</span>
            </div>
          )}
        </div>
      </aside>

      <section className="song-detail-panel hapa-panel" data-variant="resting">
        {selectedSong ? (
          <>
            <div className="song-detail-title">
              <div>
                <p className="eyebrow">Track {selectedSong.trackNumber}</p>
                <h2>{selectedSong.title}</h2>
                <span>{selectedSong.albumTitle} · {selectedSong.author} · {selectedSong.loreStatus}</span>
              </div>
              <div className="song-scope-badge">
                <Music size={16} />
                <strong>Dear Papa Only</strong>
                <em>{selectedSong.songId}</em>
              </div>
            </div>

            <div className="song-schema-grid">
              <StatusChip label="LYRICS" value={selectedSong.lyrics?.status || "missing"} tone={selectedSong.lyrics?.text ? "cyan" : "orange"} />
              <StatusChip label="TIMINGS" value={selectedSong.lyricTimings?.length || 0} tone="fuchsia" />
              <StatusChip label="STEMS" value={selectedSong.stems?.length || 0} tone="green" />
              <StatusChip label="MEDIA" value={selectedSong.media?.length || 0} tone="gold" />
              <StatusChip label="AVATARS" value={selectedSong.attachments?.avatarLinks?.length || 0} tone="rose" />
              <StatusChip label="SCENES" value={selectedSong.attachments?.sceneLinks?.length || 0} tone="cyan" />
              <StatusChip label="REFERENCES" value={selectedSong.referenceConnectors?.length || 0} tone="orange" />
              <StatusChip label="CANDIDATES" value={selectedCandidateCount} tone="gold" />
            </div>

            {audioSrc && (
              <div className="song-audio-card hapa-card" data-card-type="media" data-state="active">
                <div>
                  <strong><Play size={14} /> Registry Audio</strong>
                  <span>{selectedSong.audio?.sourceNode || "hapa-song-registry"} · {formatDuration(selectedSong.audio?.duration || registryTrack?.duration)}</span>
                </div>
                <audio controls preload="metadata" src={audioSrc} crossOrigin="anonymous" />
              </div>
            )}

            <SongCardMintPanel
              viewerOnly
              compact
              songId={selectedSong.audio?.registryTrackId || selectedSong.songId || selectedSong.id}
            />

            <div className="song-lore-stack">
              <article className="song-lore-card hapa-card" data-card-type="lore">
                <span>Summary</span>
                <p>{showcaseText(selectedSong.lore?.summary, "Song lore summary pending.")}</p>
              </article>
              <article className="song-lore-card hapa-card" data-card-type="skill">
                <span>Learning</span>
                <p>{showcaseText(selectedSong.lore?.learningThing, "Learning hook pending.")}</p>
              </article>
              <article className="song-lore-card hapa-card" data-card-type="protocol">
                <span>Mechanic</span>
                <p>{showcaseText(selectedSong.lore?.broadGameMechanic, "Game mechanic pending.")}</p>
              </article>
            </div>

            <section className="song-reference-panel hapa-card" data-card-type="protocol" aria-label="Reference connectors">
              <div className="section-head hapa-panel-head compact">
                <span><Link2 size={14} /> Reference connectors</span>
                <em>{selectedSong.referenceConnectors?.length || 0} lyric edges · {selectedCandidateCount} reviewable · {selectedSong.contextualLayers?.length || 0} layers</em>
              </div>
              {(selectedSong.contextualLayers || []).length > 0 && (
                <div className="song-context-layer-list">
                  {(selectedSong.contextualLayers || []).map((layer) => (
                    <article key={layer.id}>
                      <strong>{layer.label}</strong>
                      <p>{layer.summary}</p>
                      <span>{layer.changesExpositionBy}</span>
                    </article>
                  ))}
                </div>
              )}
              <div className="song-reference-list">
                {(selectedSong.referenceConnectors || []).map((connector) => {
                  const reference = referencesById.get(connector.referenceId);
                  const evidenceClass = connector.evidence?.classification || connector.confidence;
                  const reviewable = evidenceClass?.startsWith("candidate") || evidenceClass?.startsWith("comparative");
                  return (
                    <article className={`song-reference-card ${reviewable ? "is-reviewable" : "is-direct"}`} key={connector.id}>
                      <header>
                        <div>
                          <strong>{reference?.title || connector.referenceTitle}</strong>
                          <span>{connector.relationType} · line {connector.target?.lineStart} · {Math.round((connector.evidence?.score ?? 1) * 100)}%</span>
                        </div>
                        {reference?.source?.url && (
                          <a href={reference.source.url} target="_blank" rel="noreferrer" aria-label={`Open source for ${reference.title}`}>
                            <Link2 size={13} /> source
                          </a>
                        )}
                      </header>
                      <div className="song-reference-evidence">
                        <b>{reviewable ? "REVIEWABLE INFERENCE" : "DIRECT LYRIC EVIDENCE"}</b>
                        {(connector.evidence?.channels || []).map((channel) => <span key={channel}>{channel}</span>)}
                      </div>
                      <blockquote>{connector.target?.lyricText}</blockquote>
                      <dl>
                        <div><dt>Surface</dt><dd>{connector.semanticEffect?.withoutContext}</dd></div>
                        <div><dt>Context loaded</dt><dd>{connector.semanticEffect?.withContext}</dd></div>
                        <div><dt>Thematic shift</dt><dd>{connector.semanticEffect?.thematicShift}</dd></div>
                        <div><dt>Exposition</dt><dd>{connector.semanticEffect?.expositionFunction}</dd></div>
                      </dl>
                      <footer>
                        {(connector.semanticEffect?.traversalEdges || []).map((edge) => <span key={edge}>{edge}</span>)}
                      </footer>
                      {connector.evidence?.caveat && <p className="song-reference-caveat">{connector.evidence.caveat}</p>}
                    </article>
                  );
                })}
                {!(selectedSong.referenceConnectors || []).length && (
                  <div className="empty-state inline">
                    <Link2 size={18} />
                    <span>No source-backed lyric connector has been matched on this song yet.</span>
                  </div>
                )}
              </div>
              {selectedReferenceGraphEdges.length > 0 && (
                <div className="song-reference-routes" aria-label="Cross-reference traversal routes">
                  <div className="section-head hapa-panel-head compact">
                    <span><GitBranch size={13} /> Cross-reference routes</span>
                    <em>{selectedReferenceGraphEdges.length} comparative edges</em>
                  </div>
                  {selectedReferenceGraphEdges.map((edge) => (
                    <article key={edge.id}>
                      <strong>{referencesById.get(edge.fromReferenceId)?.title || edge.fromReferenceId}</strong>
                      <span>{edge.relationType} · {Math.round((edge.score || 0) * 100)}%</span>
                      <strong>{referencesById.get(edge.toReferenceId)?.title || edge.toReferenceId}</strong>
                      <p>{edge.rationale}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="song-lineage-panel">
              <div className="section-head hapa-panel-head compact">
                <span><GitBranch size={14} /> Schema, Attribution, Lineage</span>
                <em>{selectedSong.schemaVersion}</em>
              </div>
              <div className="song-lineage-grid">
                <span><strong>Author</strong>{selectedSong.authorship?.author || selectedSong.author}</span>
                <span><strong>Rights</strong>{selectedSong.authorship?.rightsStatus}</span>
                <span><strong>Source Card</strong>{selectedSong.lineage?.sourceCardId || selectedSong.cardId}</span>
                <span><strong>Lyrics Source</strong>{selectedSong.lineage?.lyricsSourceId || selectedSong.lyrics?.sourceId || "pending"}</span>
                <span><strong>Registry</strong>{selectedSong.audio?.registryTrackId || "not linked"}</span>
                <span><strong>Review</strong>{selectedSong.enrichment?.needsHumanReview ? "needs review" : "clear"}</span>
              </div>
            </div>

            <div className="song-lyrics-reader hapa-card" data-card-type="lore">
              <div className="section-head hapa-panel-head compact">
                <span><BookOpen size={14} /> Lyrics</span>
                <em>{compactNumber(lyricsText.split(/\s+/).filter(Boolean).length)} words</em>
              </div>
              <pre>{lyricsText || "Lyrics pending."}</pre>
            </div>
          </>
        ) : (
          <div className="empty-state hapa-panel" data-variant="resting">
            <Music size={28} />
            <span>Select a song to manage its Hapa data.</span>
          </div>
        )}
      </section>

      <aside className="song-ops-panel hapa-panel" data-variant="notch">
        {selectedSong ? (
          <>
            <div className="section-head hapa-panel-head">
              <span><Users size={15} /> Avatars</span>
              <em>{linkedAvatarIds.size}</em>
            </div>
            <div className="song-chip-grid avatar-links">
              {avatars.map((avatar) => {
                const linked = linkedAvatarIds.has(avatar.id);
                return (
                  <button
                    className={linked ? "active" : ""}
                    key={avatar.id}
                    type="button"
                    onClick={() => onToggleAvatar?.(selectedSong.id, avatar.id)}
                    onDoubleClick={() => onOpenAvatar?.(avatar.id, { returnView: "songs", returnLabel: "Hapa Songs" })}
                  >
                    <span>{avatar.primaryName?.slice(0, 1) || "A"}</span>
                    <strong>{avatar.primaryName}</strong>
                  </button>
                );
              })}
            </div>

            <div className="section-head hapa-panel-head">
              <span><Clapperboard size={15} /> Scenes</span>
              <em>{linkedSceneIds.size}</em>
            </div>
            <div className="song-scene-stack">
              {(sceneGraph.scenes || []).slice(0, 80).map((scene) => {
                const place = placesById.get(scene.placeId);
                const linked = linkedSceneIds.has(scene.id);
                return (
                  <button className={linked ? "active" : ""} key={scene.id} type="button" onClick={() => onToggleScene?.(selectedSong.id, scene.id)}>
                    <strong>{scene.title}</strong>
                    <span>{place?.name || scene.placeId || "Unplaced"} · {scene.canonicalTime?.label || "beat"}</span>
                  </button>
                );
              })}
            </div>

            <div className="song-media-upload">
              <div className="section-head hapa-panel-head">
                <span><Upload size={15} /> Song Media</span>
                <em>{selectedSong.media?.length || 0}</em>
              </div>
              <input
                id={mediaInputId}
                className="file-input"
                type="file"
                accept="image/*,video/*,audio/*,.mp3,.wav,.m4a,.flac,.zip,.txt,.md,.pdf"
                multiple
                onChange={(event) => {
                  onUploadMedia?.(selectedSong.id, event.target.files || []);
                  event.target.value = "";
                }}
              />
              <label className="song-media-drop hapa-btn" data-intent="primary" htmlFor={mediaInputId}>
                <Upload size={15} />
                Upload media, stems, lyrics
              </label>
              <div className="song-media-grid">
                {(selectedSong.media || []).map((asset) => (
                  <article className="song-media-card hapa-card" data-card-type="media" key={asset.id}>
                    <div className="song-media-thumb">
                      <AssetVisual asset={asset} mode="thumb" />
                    </div>
                    <strong>{asset.name}</strong>
                    <span>{asset.type} · {asset.attribution?.source || asset.source || "local"}</span>
                    <button className="hapa-btn" type="button" onClick={() => onExpandAsset?.(asset, selectedSong.media)}>
                      <Maximize2 size={13} /> View
                    </button>
                  </article>
                ))}
              </div>
            </div>

            <div className="section-head hapa-panel-head">
              <span><Radar size={15} /> Visualizers</span>
              <em>{linkedVisualizerIds.size}</em>
            </div>
            <div className="song-visualizer-grid">
              {visualizerCatalog.map((visualizer) => {
                const linked = linkedVisualizerIds.has(visualizer.id);
                return (
                  <button className={linked ? "active" : ""} key={visualizer.id} type="button" onClick={() => onToggleVisualizer?.(selectedSong.id, visualizer.id)}>
                    <Sparkles size={14} />
                    <strong>{visualizer.label}</strong>
                    <span>{visualizer.category || visualizer.family}</span>
                  </button>
                );
              })}
            </div>

            <form className="song-story-form" onSubmit={submitStoryBeat}>
              <div className="section-head hapa-panel-head">
                <span><BookOpen size={15} /> Story Beats</span>
                <em>{selectedSong.storyBeats?.length || 0}</em>
              </div>
              <div className="song-story-controls">
                <select value={storyDraft.authorType} onChange={(event) => setStoryDraft((draft) => ({ ...draft, authorType: event.target.value }))}>
                  <option value="human">Human note</option>
                  <option value="avatar">Avatar voice</option>
                  <option value="lorekeeper">Lorekeeper</option>
                </select>
                <select value={storyDraft.avatarId} onChange={(event) => setStoryDraft((draft) => ({ ...draft, avatarId: event.target.value }))}>
                  <option value="">Avatar lens</option>
                  {avatars.map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.primaryName}</option>)}
                </select>
                <select value={storyDraft.sceneId} onChange={(event) => setStoryDraft((draft) => ({ ...draft, sceneId: event.target.value }))}>
                  <option value="">Scene link</option>
                  {(sceneGraph.scenes || []).map((scene) => <option key={scene.id} value={scene.id}>{scene.title}</option>)}
                </select>
              </div>
              <textarea
                value={storyDraft.body}
                onChange={(event) => setStoryDraft((draft) => ({ ...draft, body: event.target.value }))}
                placeholder="Add what this song teaches, where it lands in canon, and what changes for the avatar or scene."
              />
              <button className="hapa-btn" data-intent="success" type="submit" disabled={!storyDraft.body.trim()}>
                <Plus size={14} />
                Add Beat
              </button>
            </form>
            <div className="song-story-list">
              {(selectedSong.storyBeats || []).map((beat) => (
                <article className="song-story-card hapa-card" data-card-type="lore" key={beat.id}>
                  <strong>{beat.authorName || beat.authorType}</strong>
                  <p>{beat.body}</p>
                  <span>{beat.beatType} · {beat.sceneId || "unscened"} · {beat.createdAt}</span>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Tags size={28} />
            <span>Song operations arm after selection.</span>
          </div>
        )}
      </aside>
    </section>
  );
}


function ShowcaseStatMeter({ label, value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="showcase-stat-meter">
      <header>
        <span>{label}</span>
        <strong>{Math.round(safeValue)}</strong>
      </header>
      <div><span style={{ width: `${safeValue}%` }} /></div>
    </div>
  );
}

function ShowcaseMiniMeter({ label, value }) {
  const safeValue = Math.max(0, Math.min(3, Number(value) || 0));
  return (
    <span className="showcase-mini-meter">
      <em>{label}</em>
      <i style={{ width: `${(safeValue / 3) * 100}%` }} />
    </span>
  );
}

function ItemMediaLink({ asset = {}, title = "" }) {
  const isVideo = isVideoAsset(asset);
  const posterUri = itemMediaPosterUri(asset);
  const previewUri = posterUri || asset.uri || asset.thumbnailUri || "";
  const href = resolveMediaUri(asset.uri || previewUri);
  const dimensions = asset.width && asset.height ? `${asset.width}x${asset.height}` : "";
  const meta = [
    asset.requirementId || asset.type || "media",
    dimensions,
    asset.confidence || "soft"
  ].filter(Boolean).join(" · ");

  function playPreview(event) {
    if (!isVideo) return;
    const video = event.currentTarget.querySelector("video");
    if (!video) return;
    video.play().catch(() => {});
  }

  function resetPreview(event) {
    if (!isVideo) return;
    const video = event.currentTarget.querySelector("video");
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }

  return (
    <a
      className={`item-media-link ${isVideo ? "is-video" : "is-image"}`}
      data-media-type={isVideo ? "video" : "image"}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={asset.title || title}
      onBlur={resetPreview}
      onFocus={playPreview}
      onMouseEnter={playPreview}
      onMouseLeave={resetPreview}
    >
      <span className="item-media-preview">
        {isVideo && asset.uri ? (
          <video
            src={resolveMediaUri(asset.uri)}
            poster={resolveMediaUri(posterUri)}
            muted
            playsInline
            loop
            preload="metadata"
          />
        ) : (
          <img src={resolveMediaUri(previewUri)} alt={asset.title || title} loading="lazy" />
        )}
        <span className="item-media-type-badge">
          {isVideo ? <Film size={12} /> : <ImageIcon size={12} />}
          {isVideo ? "Video" : "Image"}
        </span>
        {isVideo && <span className="item-media-play-badge"><Play size={14} /></span>}
      </span>
      <span className="item-media-copy">
        <strong>{asset.title || (isVideo ? "Source video" : "Source image")}</strong>
        <small>{meta}</small>
      </span>
    </a>
  );
}

function ShowcaseLoadoutSection({ section, onExpandCard }) {
  const visibleCards = section.cards.slice(0, section.limit || section.cards.length);
  const overflowCount = Math.max(0, section.cards.length - visibleCards.length);
  return (
    <article className="showcase-hardpoint showcase-card-section" data-section-type={section.type} data-empty={section.cards.length ? "false" : "true"}>
      <header>
        <span>
          <strong>{section.label}</strong>
          {section.description && <small>{section.description}</small>}
        </span>
        <em>{section.cards.length}{section.max ? `/${section.max}` : ""}</em>
      </header>
      <div className="showcase-card-preview-grid">
        {visibleCards.length ? visibleCards.map((card) => (
          <ShowcaseCardPreview
            card={card}
            key={`${section.id}-${card.id}`}
            onExpand={() => onExpandCard(card)}
          />
        )) : <span className="showcase-muted showcase-empty-card-slot">Empty</span>}
        {overflowCount > 0 && <span className="showcase-muted showcase-overflow-card">+{overflowCount} more</span>}
      </div>
    </article>
  );
}

function ShowcaseCardPreview({ card, onExpand }) {
  const previewUri = itemPreviewUri(card);
  const videoAsset = itemVideoAsset(card);
  const videoUri = videoAsset?.uri ? resolveMediaUri(videoAsset.uri) : "";
  const posterUri = itemMediaPosterUri(videoAsset || itemPreviewAsset(card) || {}) || previewUri;
  const Icon = itemCardIcon(card);
  const summary = itemCardSummary(card);
  const cardType = itemCardType(card);
  const quality = itemQualityMetrics(card);
  return (
    <button
      className={`showcase-card-preview hapa-card${previewUri ? " has-media" : ""}${videoUri ? " has-loop" : ""}`}
      data-card-type={cardType}
      data-granularity="mini"
      data-quality-rank={quality.tier}
      data-state={videoUri ? "active" : "idle"}
      type="button"
      aria-label={`Expand ${card.title}`}
      onClick={onExpand}
    >
      <span className="showcase-card-preview-media" aria-hidden="true">
        {previewUri ? (
          <img src={resolveMediaUri(previewUri)} alt="" loading="lazy" />
        ) : (
          <i><Icon size={18} /></i>
        )}
        {videoUri && (
          <video
            src={videoUri}
            poster={resolveMediaUri(posterUri)}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        {videoUri && <em><Film size={10} /> Loop</em>}
      </span>
      <span className="showcase-card-preview-copy">
        <span className="showcase-card-preview-topline">
          <strong>{card.shipCard?.title || card.title}</strong>
          <small>{itemCardMetaLabel(card)}</small>
        </span>
        {summary && <span className="showcase-card-preview-summary">{summary}</span>}
        <span className="showcase-card-preview-pills">
          {card.canonStatus && <i>{card.canonStatus.replace(/_/g, " ")}</i>}
          <i className="card-quality-badge">{quality.rank}</i>
          <i>LV {quality.level}</i>
          <i>DUR {quality.durability}</i>
          {(card.mediaAssets || []).length > 0 && <i>{card.mediaAssets.length} media</i>}
        </span>
      </span>
      <span className="showcase-card-expand-badge"><Maximize2 size={12} /> Expand</span>
    </button>
  );
}

function ShowcaseCardDetailModal({ card, onClose }) {
  const previewUri = itemPreviewUri(card);
  const previewAsset = itemPreviewAsset(card);
  const videoAsset = itemVideoAsset(card);
  const videoUri = videoAsset?.uri ? resolveMediaUri(videoAsset.uri) : "";
  const posterUri = itemMediaPosterUri(videoAsset || previewAsset || {}) || previewUri;
  const Icon = itemCardIcon(card);
  const typeLabel = itemCardMetaLabel(card);
  const cardType = itemCardType(card);
  const tarotDetails = card.tarotCard || {};
  const shipDetails = card.shipCard || {};
  const stats = shipDetails.stats || tarotStatsFromDetails(tarotDetails);
  const keywords = shipDetails.keywords?.length ? shipDetails.keywords : tarotDetails.keywords || [];
  const detailSections = buildItemCardDetailSections(card);
  const connectionChips = itemConnectionChips(card).slice(0, 10);
  const locationLabel = itemLocationLabel(card);
  const quality = itemQualityMetrics(card);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop showcase-card-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${card.title} expanded card`} onClick={onClose}>
      <section className="showcase-card-modal hapa-card" data-card-type={cardType} data-granularity="detail" data-quality-rank={quality.tier} data-state="selected" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">
              <span>{typeLabel}</span>
              {card.canonStatus && <em>{card.canonStatus.replace(/_/g, " ")}</em>}
              <em className="card-quality-badge">{quality.rank}</em>
            </p>
            <h2>{shipDetails.title || tarotDetails.title || card.title}</h2>
          </div>
          <button className="icon-button hapa-btn" data-icon-only type="button" aria-label="Close expanded card" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="showcase-card-detail-layout">
          <div className="showcase-card-presentation-art" data-media={previewUri || videoUri ? "available" : "fallback"}>
            {videoUri ? (
              <video src={videoUri} poster={resolveMediaUri(posterUri)} controls muted={false} loop playsInline preload="metadata" />
            ) : previewUri ? (
              <img src={resolveMediaUri(previewUri)} alt="" loading="eager" />
            ) : (
              <span><Icon size={54} /></span>
            )}
            <div className="showcase-card-art-readouts">
              <span>Level {quality.level}</span>
              <span>Durability {quality.durability}</span>
              <span>Quality {quality.rank}</span>
              {(card.mediaAssets || []).length > 0 && <span>{card.mediaAssets.length} media</span>}
              {videoUri && <span><Film size={12} /> loop</span>}
              {(tarotDetails.tarotNumber || shipDetails.tarotNumber) && <span>{tarotDetails.tarotNumber || shipDetails.tarotNumber}</span>}
            </div>
          </div>

          <div className="showcase-card-presentation-copy">
            <div className="showcase-card-title-block">
              <span>{shipDetails.subtitle || tarotDetails.subtitle || shipDetails.archetype || tarotDetails.archetype || typeLabel}</span>
              <strong>{itemCardSummary(card) || "Card details are being assembled."}</strong>
              {itemCardBody(card) && <p>{itemCardBody(card)}</p>}
            </div>

            {(keywords.length > 0 || connectionChips.length > 0 || locationLabel) && (
              <div className="showcase-card-chip-field">
                {keywords.slice(0, 6).map((keyword) => <i key={`keyword-${keyword}`}>{keyword}</i>)}
                {locationLabel && <i><MapPin size={11} /> {locationLabel}</i>}
                {connectionChips.map((chip) => <i key={chip.key}>{chip.label}</i>)}
              </div>
            )}

            {Object.keys(stats).length > 0 && (
              <div className="showcase-card-stat-grid" aria-label="Card stats">
                {Object.entries(stats).map(([key, value]) => (
                  <span key={key}>
                    <em>{key}</em>
                    <strong>{value}</strong>
                  </span>
                ))}
              </div>
            )}

            <div className="showcase-card-detail-sections">
              {detailSections.map((section) => (
                <section key={section.id} className={section.prominence ? `is-${section.prominence}` : undefined}>
                  <h3>{section.label}</h3>
                  {Array.isArray(section.value) ? (
                    <ul>
                      {section.value.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : (
                    <p>{section.value}</p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>

        <footer>
          {(card.tags || []).slice(0, 12).map((tag) => <span key={tag}><Tags size={11} /> {tag}</span>)}
        </footer>
      </section>
    </div>
  );
}

function ShowcaseItemChip({ card }) {
  const hasVideo = itemHasVideo(card);
  const quality = itemQualityMetrics(card);
  return (
    <span className={`showcase-item-chip${card.cardType === "ship_card" ? " ship-card" : ""}${hasVideo ? " has-video" : ""}`} data-quality-rank={quality.tier}>
      <MediaCardThumb card={card} />
      <span className="showcase-item-chip-copy">
        <strong>{card.title}</strong>
        <em>{itemCardMetaLabel(card)} · {quality.rank}</em>
      </span>
      {hasVideo && <span className="showcase-chip-video"><Film size={11} /> Video</span>}
    </span>
  );
}

function MediaCardThumb({ card }) {
  const previewUri = itemPreviewUri(card);
  const hasVideo = itemHasVideo(card);
  const quality = itemQualityMetrics(card);
  return (
    <span className={`media-card-thumb${previewUri ? " has-preview" : ""}${hasVideo ? " has-video" : ""}`} data-quality-rank={quality.tier}>
      {previewUri ? (
        <img src={resolveMediaUri(previewUri)} alt="" loading="lazy" />
      ) : (
        <i aria-hidden="true"><Box size={14} /></i>
      )}
      {hasVideo && <em><Film size={10} /></em>}
    </span>
  );
}

function itemHasVideo(card = {}) {
  return (card?.mediaAssets || []).some((asset) => isVideoAsset(asset));
}

function itemQualityMetrics(card = {}) {
  const quality = card.quality || {};
  const rawRank = quality.qualityRank || quality.rank || card.rank || "Common";
  const rank = titleizeItemLabel(rawRank);
  const tier = String(quality.qualityTier || rawRank || "common")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-") || "common";
  const videoCount = itemVideoAssets(card).length;
  const linkedVideoCount = (card.tarotCard?.mediaLinks || []).filter((link) => link.videoUri && isVideoAsset({ uri: link.videoUri })).length;
  const level = Number(quality.level || quality.videoCount || Math.max(videoCount, linkedVideoCount, 0));
  const durability = Number(quality.durability || quality.connectedMediaCount || Math.max((card.mediaAssets || []).length, level, 0));
  return {
    rank,
    tier,
    level,
    durability,
    score: Number(quality.score || quality.qualityScore || 0),
    medianDurability: Number(quality.medianDurability || 0)
  };
}

function buildShowcaseLoadoutSections(inventory = null, itemById = new Map(), summary = {}, avatar = {}) {
  const hardpointSections = inventory ? (inventory.hardpoints || []).map((hardpoint) => ({
    id: hardpoint.id,
    label: hardpoint.label,
    description: hardpoint.description || "",
    type: hardpoint.id,
    max: hardpoint.maxCards,
    cards: (hardpoint.cardIds || []).map((cardId) => itemById.get(cardId)).filter(Boolean),
    limit: hardpoint.id === "items" ? 9 : 6
  })) : [];
  const deckSections = inventory ? [
    { id: "deck", label: "Avatar Deck", type: "deck", cardIds: inventory.deck || [], limit: 9 },
    { id: "hand", label: "Hand", type: "hand", cardIds: inventory.hand || [], limit: 9 },
    { id: "training", label: "Training Deck", type: "training", cardIds: inventory.trainingDeck || [], limit: 9 }
  ].map((zone) => ({
    ...zone,
    cards: zone.cardIds.map((cardId) => itemById.get(cardId)).filter(Boolean)
  })) : [];
  const mindLoadoutSections = [
    buildMindLoadoutSection("mind-protocol-loadout", "Mind Protocols", "protocol", summary.loadout?.protocolCards, avatar),
    buildMindLoadoutSection("mind-skill-loadout", "Mind Skills", "skill", summary.loadout?.skillCards, avatar)
  ].filter(Boolean);
  return [...hardpointSections, ...deckSections, ...mindLoadoutSections].filter((section) =>
    section.cards.length || ["node_ship", "protocols", "skills", "items", "location", "equipment", "deck"].includes(section.id)
  );
}

function buildMindLoadoutSection(id, label, type, cards = [], avatar = {}) {
  const activeCards = (cards || [])
    .filter(isActiveMindRecord)
    .map((card, index) => mindLoadoutCardToShowcaseCard(card, type, avatar, index));
  if (!activeCards.length) return null;
  const avatarName = avatar.primaryName || avatar.name || avatar.id || "Avatar";
  return {
    id,
    label,
    description: `${avatarName} recovered ${type} loadout`,
    type: `mind-${type}`,
    cards: uniqueShowcaseCards(activeCards),
    limit: 6
  };
}

function mindLoadoutCardToShowcaseCard(card = {}, type = "protocol", avatar = {}, index = 0) {
  const kind = type === "skill" ? "skill" : "protocol";
  const avatarId = avatar.id || avatar.primaryName || "avatar";
  const title = card.title || titleizeItemLabel(card.id || `${kind} card`);
  const allowedUses = card.allowedUses || [];
  const limits = card.limits || [];
  const summary = showcaseText(
    card.mechanic || card.whyChosen || card.learningThing || card.role,
    `${avatar.primaryName || avatar.name || "Avatar"} ${kind} loadout card.`
  );
  return {
    id: `mind-${kind}-${stableCardSlug(card.id || `${avatarId}-${title}-${index}`)}`,
    title,
    kind,
    cardType: card.cardType || `${kind}_card`,
    summary,
    description: card.whyChosen || card.learningThing || summary,
    lore: card.source ? `Recovered from ${card.source}.` : "",
    canonStatus: card.status || "active",
    tags: uniqueLocal([kind, "mind-loadout", card.family, card.role, card.cardType, ...allowedUses]).slice(0, 10),
    broadGameMechanics: [card.mechanic].filter(Boolean),
    utility: uniqueLocal([card.learningThing, card.whyChosen]).slice(0, 4),
    equipment: {
      hardpointHints: [kind],
      effects: allowedUses,
      limits
    },
    connections: {
      avatarIds: [avatar.id].filter(Boolean)
    },
    quality: {
      rank: "Mind",
      level: Math.max(1, Math.min(9, allowedUses.length + 1)),
      durability: Math.max(1, Math.min(9, limits.length + 1))
    },
    sourceMindCard: card
  };
}

function buildMindTarotChoiceShowcaseCards(choices = [], avatar = {}, itemById = new Map()) {
  return uniqueShowcaseCards((choices || [])
    .filter(isActiveMindRecord)
    .map((choice, index) => mindTarotChoiceToShowcaseCard(choice, avatar, itemById, index)))
    .sort((a, b) =>
      Number(Boolean(itemPreviewUri(b))) - Number(Boolean(itemPreviewUri(a))) ||
      itemCardResolutionScore(b) - itemCardResolutionScore(a) ||
      compareText(a.title, b.title)
    )
    .slice(0, 18);
}

function mindTarotChoiceToShowcaseCard(choice = {}, avatar = {}, itemById = new Map(), index = 0) {
  const sourceCard = itemById.get(choice.cardId) || {};
  const sourceTarot = sourceCard.tarotCard || {};
  const sourceShip = sourceCard.shipCard || {};
  const sourceIdentity = sourceTarot.identity || {};
  const sourceFace = sourceTarot.cardFace || {};
  const sourceTypeDetails = sourceTarot.typeDetails || {};
  const sourceLore = sourceTarot.lore || {};
  const avatarName = avatar.primaryName || avatar.name || avatar.id || "Avatar";
  const arcana = AVATAR_TAROT_MAJOR_ARCANA[index % AVATAR_TAROT_MAJOR_ARCANA.length];
  const role = choice.role || choice.tarotMainType || sourceIdentity.functionalType || "deck-choice";
  const title = choice.cardTitle || choice.title || sourceCard.title || titleizeItemLabel(choice.cardId || "Card Choice");
  const subtitle = choice.songTitle ? `${avatarName} / ${choice.songTitle}` : `${avatarName} Tarot Draw choice`;
  const summary = showcaseText(
    choice.whyChosen || choice.objectiveFit || sourceCard.summary || sourceCard.description,
    `${avatarName} selected ${title} for the Tarot Draw deck.`
  );
  const effectText = showcaseText(
    choice.deckInfluence || choice.futureInfluence || choice.canonReason || sourceTarot.effectText || sourceShip.effectText,
    ""
  );
  const keywords = uniqueLocal([
    ...(sourceShip.keywords || []),
    ...(sourceTarot.keywords || []),
    ...arcana.keywords,
    role,
    choice.songTitle,
    choice.vibe
  ]).slice(0, 6);
  return {
    ...sourceCard,
    id: `mind-choice-${stableCardSlug(choice.id || choice.cardId || `${avatar.id || avatarName}-${title}-${index}`)}`,
    sourceItemId: sourceCard.id || choice.cardId || "",
    title,
    kind: sourceCard.kind || "item",
    cardType: sourceCard.cardType || choice.cardType || "hapa_tarot_card",
    summary,
    description: sourceCard.description || summary,
    lore: choice.loreContext || sourceCard.lore || choice.canonReason || "",
    canonStatus: choice.status || sourceCard.canonStatus || "active",
    tags: uniqueLocal([
      ...(sourceCard.tags || []),
      "mind-card-choice",
      "tarot-draw",
      role,
      choice.cardType,
      choice.tarotMainType,
      choice.songTitle,
      choice.confidence
    ]).slice(0, 12),
    quality: sourceCard.quality || mindTarotChoiceQuality(choice),
    connections: {
      ...(sourceCard.connections || {}),
      avatarIds: uniqueLocal([...(sourceCard.connections?.avatarIds || []), avatar.id])
    },
    shipCard: {
      ...sourceShip,
      title,
      subtitle: sourceShip.subtitle || subtitle,
      archetype: sourceShip.archetype || titleizeItemLabel(role || arcana.title),
      tarotNumber: sourceShip.tarotNumber || sourceIdentity.romanNumeral || arcana.number,
      keywords,
      flavorText: sourceShip.flavorText || summary,
      effectText: sourceShip.effectText || effectText,
      stats: sourceShip.stats || mindTarotChoiceStats(choice, index)
    },
    tarotCard: {
      ...sourceTarot,
      schemaVersion: sourceTarot.schemaVersion || "hapa.avatar-tarot-choice-showcase.v1",
      title: sourceTarot.title || title,
      subtitle: sourceTarot.subtitle || subtitle,
      flavorText: sourceTarot.flavorText || summary,
      effectText: sourceTarot.effectText || effectText,
      identity: {
        ...sourceIdentity,
        tarotType: sourceIdentity.tarotType || sourceIdentity.tarotCardName || arcana.title,
        functionalType: sourceIdentity.functionalType || titleizeItemLabel(role),
        arcana: sourceIdentity.arcana || "Major Arcana",
        romanNumeral: sourceIdentity.romanNumeral || arcana.number
      },
      typeDetails: {
        ...sourceTypeDetails,
        role: sourceTypeDetails.role || role,
        procedureFlow: sourceTypeDetails.procedureFlow || choice.whyChosen || ""
      },
      cardFace: {
        ...sourceFace,
        coreMeaning: sourceFace.coreMeaning || choice.objectiveFit || summary,
        mechanicsText: sourceFace.mechanicsText || choice.deckInfluence || choice.futureInfluence || ""
      },
      lore: {
        ...sourceLore,
        visualLanguage: sourceLore.visualLanguage || choice.loreContext || ""
      }
    },
    sourceMindChoice: choice
  };
}

function mindTarotChoiceQuality(choice = {}) {
  return {
    rank: "Choice",
    level: Math.max(1, Math.min(9, 2 + Number(Boolean(choice.songTitle)) + Number(Boolean(choice.objectiveFit)) + Number(Boolean(choice.deckInfluence)))),
    durability: Math.max(1, Math.min(9, 2 + Number(Boolean(choice.canonReason)) + Number(Boolean(choice.futureInfluence)) + Number(choice.confidence === "generated")))
  };
}

function mindTarotChoiceStats(choice = {}, index = 0) {
  return {
    speed: Math.min(9, 3 + (index % 3) + Number(Boolean(choice.songTitle))),
    morale: Math.min(9, 4 + Number(Boolean(choice.whyChosen)) + Number(Boolean(choice.canonReason))),
    supply: Math.min(9, 4 + Number(Boolean(choice.objectiveFit)) + Number(Boolean(choice.deckInfluence))),
    influence: Math.min(9, 4 + Number(Boolean(choice.futureInfluence)) + Number(Boolean(choice.vibe)))
  };
}

function isActiveMindRecord(record = {}) {
  return Boolean(record) && record.status !== "tombstone" && record.classification !== "tombstone";
}

function uniqueShowcaseCards(cards = []) {
  const seen = new Set();
  return (cards || []).filter((card) => {
    const key = String(card?.id || card?.sourceItemId || card?.cardId || card?.title || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemSemanticType(card = {}) {
  const kind = String(card.kind || "").toLowerCase();
  const cardType = String(card.cardType || "").toLowerCase();
  const tags = (card.tags || []).map((tag) => String(tag || "").toLowerCase());
  const hints = (card.equipment?.hardpointHints || []).map((hint) => String(hint || "").toLowerCase());
  const has = (...tokens) => tokens.some((token) => tags.includes(token) || hints.includes(token) || cardType.includes(token) || kind === token);
  if (card.shipCard || has("ship", "ship_card")) return "ship";
  if (has("protocol", "protocols", "protocol_card")) return "protocol";
  if (has("skill", "skills", "skill_card")) return "skill";
  if (has("node", "nodes", "node_card")) return "node";
  if (has("garden", "place", "location", "system", "garden_card", "place_card", "location_card", "system_card")) return "location";
  if (has("item", "equipment", "item_card")) return "item";
  if (has("media", "image", "video")) return "media";
  return kind || "resource";
}

function itemCardIcon(card = {}) {
  const type = itemSemanticType(card);
  if (type === "protocol") return GitBranch;
  if (type === "skill") return ListChecks;
  if (type === "node") return Route;
  if (type === "ship") return Archive;
  if (type === "location") return MapPin;
  if (type === "media") return ImageIcon;
  return Box;
}

function itemCardMetaLabel(card = {}) {
  const type = itemSemanticType(card);
  if (type === "protocol") return "Protocol Card";
  if (type === "skill") return "Skill Card";
  if (type === "node") return "Node Card";
  if (type === "ship") return "Ship Card";
  if (type === "location") {
    if (card.kind === "garden" || card.cardType === "garden_card") return "Garden Card";
    if (card.kind === "system" || card.cardType === "system_card") return "System Card";
    return "Location Card";
  }
  if (type === "item") return "Item Card";
  if (type === "media") return "Media Card";
  return titleizeItemLabel(card.kind || card.cardType || "Resource Card");
}

function itemCardSummary(card = {}) {
  return showcaseText(
    card.shipCard?.effectText ||
      card.summary ||
      card.description ||
      card.lore ||
      card.shipCard?.flavorText,
    ""
  );
}

function itemCardBody(card = {}) {
  const value = card.shipCard?.flavorText ||
    card.tarotCard?.cardFace?.coreMeaning ||
    card.tarotCard?.flavorText ||
    card.description ||
    card.lore ||
    (card.utility || [])[0] ||
    (card.broadGameMechanics || [])[0] ||
    "";
  const summary = itemCardSummary(card);
  return value && value !== summary ? showcaseText(value, "") : "";
}

function itemTarotFunctionalType(card = {}) {
  const tarotDetails = card.tarotCard || {};
  const raw = tarotDetails.identity?.functionalType ||
    tarotDetails.typeDetails?.functionalType ||
    tarotDetails.catalog?.typeLabel ||
    itemCardMetaLabel(card);
  return titleizeItemLabel(String(raw || "Tarot")
    .replace(/_tarot_card$|_card$/i, "")
    .replace(/\s+Tarot\s+Card$|\s+Card$/i, "")
    .replace(/_/g, " "));
}

function itemTarotTypeRows(card = {}) {
  const tarotDetails = card.tarotCard || {};
  const identity = tarotDetails.identity || {};
  const typeDetails = tarotDetails.typeDetails || {};
  const tarotType = identity.tarotType || identity.tarotCardName || tarotDetails.title || card.title;
  const functionalType = itemTarotFunctionalType(card);
  return [
    tarotType ? `Tarot: ${tarotType}` : "",
    functionalType ? `Type: ${functionalType}` : "",
    identity.arcana ? `Arcana: ${identity.arcana}` : "",
    identity.suit ? `Suit: ${identity.suit}` : "",
    identity.rank ? `Rank: ${identity.rank}` : "",
    identity.romanNumeral ? `Number: ${identity.romanNumeral}` : "",
    identity.locationType ? `Location: ${identity.locationType}` : "",
    typeDetails.role ? `Role: ${typeDetails.role}` : ""
  ].filter(Boolean);
}

function buildItemCardDetailSections(card = {}) {
  const sections = [];
  const tarotDetails = card.tarotCard || {};
  const cardFace = tarotDetails.cardFace || {};
  const typeDetails = tarotDetails.typeDetails || {};
  const push = (id, label, value, prominence = "") => {
    if (Array.isArray(value)) {
      const cleaned = value.map((item) => String(item || "").trim()).filter(Boolean);
      if (cleaned.length) sections.push({ id, label, value: cleaned.slice(0, 8), prominence });
      return;
    }
    const text = String(value || "").trim();
    if (text) sections.push({ id, label, value: text, prominence });
  };
  if (tarotDetails.schemaVersion) {
    push("tarot-type", `${itemTarotFunctionalType(card)} Card Details`, itemTarotTypeRows(card), "primary");
    push("tarot-core", "Core Meaning", cardFace.coreMeaning || tarotDetails.flavorText);
    push("tarot-mechanics", "Mechanics", cardFace.mechanicsText || tarotDetails.effectText);
    push("tarot-procedure", "Procedure Flow", typeDetails.procedureFlow);
    push("tarot-visual", "Visual Language", tarotDetails.lore?.visualLanguage || cardFace.visualLanguageText);
  }
  push("effect", "Effect", card.shipCard?.effectText);
  push("utility", "Utility", card.utility);
  push("mechanics", "Game Mechanics", card.broadGameMechanics);
  push("lore", "Lore", card.lore);
  push("effects", "Equipped Effects", card.equipment?.effects);
  push("limits", "Limits", card.equipment?.limits);
  push("prompt", "Presentation Prompt", card.mediaPrompts?.heroImage || card.mediaPrompts?.twoD);
  return sections.slice(0, 6);
}

function itemConnectionChips(card = {}) {
  const groups = [
    ["avatar", card.connections?.avatarIds],
    ["team", card.connections?.teamIds],
    ["place", card.connections?.placeIds],
    ["node", card.connections?.nodeIds],
    ["ship", card.connections?.shipIds]
  ];
  return groups.flatMap(([label, values]) => (values || []).slice(0, 3).map((value) => ({
    key: `${label}:${value}`,
    label: `${label}: ${titleizeItemLabel(value)}`
  })));
}

function itemLocationLabel(card = {}) {
  const location = card.locationState || {};
  return location.currentPlaceName ||
    location.currentGardenName ||
    location.currentShipName ||
    location.currentSystemName ||
    location.state ||
    "";
}

const AVATAR_TAROT_MAJOR_ARCANA = [
  { number: "0", title: "The Fool", keywords: ["beginning", "trust", "threshold"], element: "air" },
  { number: "I", title: "The Magician", keywords: ["will", "craft", "translation"], element: "air" },
  { number: "II", title: "The High Priestess", keywords: ["listening", "hidden pattern", "threshold"], element: "water" },
  { number: "III", title: "The Empress", keywords: ["growth", "body", "abundance"], element: "earth" },
  { number: "IV", title: "The Emperor", keywords: ["structure", "boundary", "command"], element: "fire" },
  { number: "V", title: "The Hierophant", keywords: ["teaching", "tradition", "vow"], element: "earth" },
  { number: "VI", title: "The Lovers", keywords: ["choice", "alignment", "devotion"], element: "air" },
  { number: "VII", title: "The Chariot", keywords: ["direction", "discipline", "momentum"], element: "water" },
  { number: "VIII", title: "Strength", keywords: ["courage", "patience", "gentleness"], element: "fire" },
  { number: "IX", title: "The Hermit", keywords: ["retreat", "discernment", "inner authority"], element: "earth" },
  { number: "X", title: "Wheel of Fortune", keywords: ["cycle", "turning", "chance"], element: "fire" },
  { number: "XI", title: "Justice", keywords: ["balance", "truth", "consequence"], element: "air" },
  { number: "XII", title: "The Hanged One", keywords: ["surrender", "reframe", "suspension"], element: "water" },
  { number: "XIII", title: "Death", keywords: ["ending", "release", "renewal"], element: "water" },
  { number: "XIV", title: "Temperance", keywords: ["integration", "pace", "alchemy"], element: "fire" },
  { number: "XV", title: "The Devil", keywords: ["bond", "materiality", "choice"], element: "earth" },
  { number: "XVI", title: "The Tower", keywords: ["disruption", "truth pressure", "release"], element: "fire" },
  { number: "XVII", title: "The Star", keywords: ["hope", "orientation", "renewal"], element: "air" },
  { number: "XVIII", title: "The Moon", keywords: ["dream", "uncertainty", "intuition"], element: "water" },
  { number: "XIX", title: "The Sun", keywords: ["revelation", "warmth", "vitality"], element: "fire" },
  { number: "XX", title: "Judgement", keywords: ["calling", "reckoning", "return"], element: "fire" },
  { number: "XXI", title: "The World", keywords: ["completion", "integration", "wholeness"], element: "earth" }
];

// Keep item cards from cloning huge avatar libraries, while avatar Tarot cards
// still expose the full rolling pool to the runtime queue.
const TAROT_ITEM_AVATAR_LOOP_SOURCE_WINDOW = Math.max(3, Number(import.meta.env?.VITE_TAROT_ITEM_AVATAR_LOOP_SOURCE_WINDOW || 12));
const TAROT_PROFILE_AVATAR_LOOP_TILE_LIMIT = Math.max(1, Number(import.meta.env?.VITE_TAROT_PROFILE_AVATAR_LOOP_TILE_LIMIT || 4));

function buildTarotDrawProjection(cards = [], avatarInventory = null, avatars = [], inventoryStore = {}, songLibrary = FALLBACK_SONG_LIBRARY, hapaSongStore = null, attachmentContext = null) {
  const candidates = buildTarotDrawCards(cards, avatarInventory, avatars, inventoryStore, songLibrary, hapaSongStore);
  const requested = new Set(attachmentContext?.cardIds || []);
  const matching = requested.size ? candidates.filter((card) => requested.has(card.id)) : [];
  const scopedCandidates = requested.size && matching.length ? matching : candidates;
  const audit = auditTarotDrawProductionCandidates(scopedCandidates, songLibrary);
  return {
    cards: audit.productionCards,
    audit,
    attachmentContext: attachmentContext ? { ...attachmentContext, matchedCardIds: matching.map((card) => card.id), fallbackUsed: requested.size > 0 && matching.length === 0 } : null,
    state: "ready"
  };
}

function getYoutubeThumbnailUrl(url) {
  if (!url || typeof url !== "string") return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://img.youtube.com/vi/${match[2]}/mqdefault.jpg` : null;
}

function buildTarotDrawCards(cards = [], avatarInventory = null, avatars = [], inventoryStore = {}, songLibrary = FALLBACK_SONG_LIBRARY, hapaSongStore = null) {
  const resolveAvatarContact = createTarotAvatarContactResolver(songLibrary, avatars, hapaSongStore);
  const priorityIds = new Set([
    ...(avatarInventory?.hardpoints || []).flatMap((hardpoint) => hardpoint.cardIds || []),
    ...(avatarInventory?.deck || []),
    ...(avatarInventory?.hand || []),
    ...(avatarInventory?.trainingDeck || [])
  ]);
  const avatarById = new Map((avatars || []).map((avatar) => [avatar.id, avatar]).filter(([id]) => id));
  const selectedAvatar = avatarById.get(avatarInventory?.avatarId);
  const avatarIdsByCard = buildCardAvatarAssociationMap(inventoryStore);
  
  const creatorCardById = new Map(
    cards
      .filter((c) => c.cardType === "creator_card")
      .map((c) => [c.id, c])
  );
  const sponsorCardById = new Map(
    cards
      .filter((c) => c.cardType === "creator_sponsor_card")
      .map((c) => [c.id, c])
  );

  const itemDrawCards = cards
    .filter((card) => {
      const tags = card.tags || [];
      return card.cardType === "ship_card" ||
        card.kind === "ship" ||
        Boolean(card.shipCard) ||
        Boolean(card.tarotCard) ||
        tags.includes("tarot-card") ||
        /_tarot_card$/.test(card.cardType || "") ||
        ["creator_card", "creator_content_card", "creator_sponsor_card", "set"].includes(card.cardType);
    })
    .map((card) => {
      const tarotDetails = card.tarotCard || {};
      const shipDetails = card.shipCard || {};
      const mediaChoice = chooseProductionCardMedia(card);
      const videoAsset = mediaChoice.videoAsset || itemVideoAsset(card);
      let videoUri = mediaChoice.videoUri || "";
      let previewUri = mediaChoice.previewUri || "";

      // Fallback preview URIs and video loops for Creator Cards
      if (card.cardType === "creator_content_card") {
        const ref = card.sourceRefs?.[0];
        const url = typeof ref === "string" ? ref : ref?.uri || ref?.label || "";
        if (!previewUri) {
          const ytThumb = getYoutubeThumbnailUrl(url);
          if (ytThumb) {
            previewUri = ytThumb;
          }
        }
      } else if (card.cardType === "creator_card" && !previewUri) {
        previewUri = card.creatorProfile?.profilePhotos?.youtube || card.mediaAssets?.[0]?.uri || "";
      } else if (card.cardType === "creator_sponsor_card" && !previewUri) {
        previewUri = card.sponsorProfile?.logo || card.mediaAssets?.[0]?.uri || "";
      }

      if (!videoUri && !previewUri) return null;
      const highResImageUri = mediaChoice.highResImageUri || previewUri;
      const avatarIds = uniqueLocal([
        ...(avatarIdsByCard.get(card.id) || []),
        ...extractAssociatedAvatarIds(card),
        ...extractAssociatedAvatarIds(videoAsset || {})
      ]).filter((avatarId) => avatarById.has(avatarId));
      const isCreatorRelated = ["creator_card", "creator_content_card", "creator_sponsor_card"].includes(card.cardType);
      if (!avatarIds.length && selectedAvatar?.id && !isCreatorRelated) {
        avatarIds.push(selectedAvatar.id);
      }
      const avatarContacts = avatarIds
        .map((avatarId) => avatarById.get(avatarId))
        .filter(Boolean)
        .map(resolveAvatarContact)
        .filter(Boolean);
      const videoSources = buildItemTarotVideoSources(card, videoAsset, avatarIds, avatarById);
      const songLinks = buildTarotDrawSongLinks([
        ...(tarotDetails.songLinks || []),
        ...(card.episodeCard?.songLinks || []),
        ...(card.songLinks || [])
      ], songLibrary, hapaSongStore);

      // Resolve creator contacts
      const creatorIds = [];
      if (card.cardType === "creator_card") {
        creatorIds.push(card.id);
      } else if (card.connections?.creatorCardId) {
        creatorIds.push(card.connections.creatorCardId);
      }
      const creatorContacts = creatorIds
        .map((id) => creatorCardById.get(id))
        .filter(Boolean)
        .map((creatorCard) => ({
          id: creatorCard.id,
          name: creatorCard.creatorProfile?.name || creatorCard.title,
          role: "Creator",
          portraitUri: creatorCard.creatorProfile?.profilePhotos?.youtube || creatorCard.imageUri || "",
          profile: creatorCard.creatorProfile || null,
          card: creatorCard
        }))
        .filter(Boolean);

      // Resolve sponsor contacts
      const sponsorIds = [];
      if (card.cardType === "creator_sponsor_card") {
        sponsorIds.push(card.id);
      } else if (Array.isArray(card.connections?.sponsorCardIds)) {
        sponsorIds.push(...card.connections.sponsorCardIds);
      }
      const sponsorContacts = sponsorIds
        .map((id) => sponsorCardById.get(id))
        .filter(Boolean)
        .map((sponsorCard) => ({
          id: sponsorCard.id,
          name: sponsorCard.title,
          role: "Sponsor",
          portraitUri: sponsorCard.sponsorProfile?.logo || sponsorCard.imageUri || "",
          profile: sponsorCard.sponsorProfile || null,
          card: sponsorCard
        }))
        .filter(Boolean);

      return {
        id: card.id,
        title: tarotDetails.title || shipDetails.title || card.title,
        subtitle: tarotDetails.subtitle || shipDetails.subtitle || tarotDetails.catalog?.typeLabel || "",
        archetype: tarotDetails.archetype || shipDetails.archetype || tarotDetails.catalog?.family || "",
        tarotNumber: tarotDetails.tarotNumber || shipDetails.tarotNumber || shipDetails.romanNumeral || "",
        summary: showcaseText(
          tarotDetails.lore?.summary ||
            tarotDetails.effectText ||
            tarotDetails.flavorText ||
            shipDetails.effectText ||
            shipDetails.flavorText ||
            card.summary ||
            card.description,
          "Living Hapa tarot card."
        ),
        keywords: tarotDetails.keywords?.length ? tarotDetails.keywords : shipDetails.keywords || [],
        stats: shipDetails.stats || tarotStatsFromDetails(tarotDetails),
        tags: card.tags || [],
        sourceKind: tarotDetails.mainType ? "tarot" : card.kind || (card.cardType === "ship_card" || card.shipCard ? "ship" : "item"),
        kind: card.kind || "",
        cardType: card.cardType || "",
        tarotMainType: tarotDetails.mainType || card.cardType || "",
        tarotCatalog: tarotDetails.catalog || null,
        tarotIdentity: tarotDetails.identity || null,
        cardFace: tarotDetails.cardFace || null,
        typeDetails: tarotDetails.typeDetails || null,
        tarotMechanics: tarotDetails.mechanics || null,
        tarotLore: tarotDetails.lore || null,
        tarotAttribution: tarotDetails.attribution || null,
        tarotOcr: tarotDetails.ocr || null,
        tarotMediaLinks: (tarotDetails.mediaLinks || []).map((link) => ({
          ...link,
          imageUri: link.imageUri ? resolveMediaUri(link.imageUri) : "",
          videoUri: link.videoUri ? resolveMediaUri(link.videoUri) : "",
          posterUri: link.posterUri ? resolveMediaUri(link.posterUri) : ""
        })),
        tarotType: tarotDetails.identity?.tarotType || tarotDetails.identity?.tarotCardName || tarotDetails.title || "",
        functionalType: tarotDetails.identity?.functionalType || tarotDetails.typeDetails?.functionalType || "",
        highResImageUri: highResImageUri ? resolveMediaUri(highResImageUri) : "",
        imageUri: previewUri ? resolveMediaUri(previewUri) : "",
        videoUri: videoUri ? resolveMediaUri(videoUri) : "",
        originalVideoUri: mediaChoice.originalVideoUri ? resolveMediaUri(mediaChoice.originalVideoUri) : videoAsset?.uri ? resolveMediaUri(videoAsset.uri) : "",
        backgroundless: mediaChoice.backgroundless || videoSources[0]?.backgroundless || null,
        backgroundlessUri: mediaChoice.backgroundlessUri || videoSources[0]?.backgroundlessUri || "",
        hasAlpha: Boolean(mediaChoice.hasAlpha || videoSources[0]?.hasAlpha),
        posterUri: previewUri ? resolveMediaUri(previewUri) : "",
        videoSources,
        songLinks,
        productionMediaPriority: mediaChoice.priority,
        productionMediaReason: mediaChoice.reason,
        priority: priorityIds.has(card.id) ? 1 : 0,
        videoScore: mediaResolutionScore(videoAsset || {}) || mediaResolutionScore(itemPreviewAsset(card) || {}),
        avatarContacts,
        creatorContacts,
        sponsorContacts,
        creatorProfile: card.creatorProfile || null,
        sponsorProfile: card.sponsorProfile || null,
        description: card.description || "",
        connections: card.connections || null,
        sourceRefs: card.sourceRefs || null
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      b.priority - a.priority ||
      b.videoScore - a.videoScore ||
      compareText(a.title, b.title)
    );
  const avatarDrawCards = buildAvatarThemeTarotCards(avatars, selectedAvatar, songLibrary, hapaSongStore, resolveAvatarContact);
  const songDrawCards = buildHapaSongTarotCards(hapaSongStore, avatars, songLibrary, resolveAvatarContact);
  return uniqueDrawCards([...itemDrawCards, ...avatarDrawCards, ...songDrawCards]).sort((a, b) =>
    b.priority - a.priority ||
    b.videoScore - a.videoScore ||
    compareText(a.title, b.title)
  );
}

function auditTarotDrawProductionCandidates(cards = [], songLibrary = FALLBACK_SONG_LIBRARY) {
  const candidates = uniqueDrawCards(cards);
  const records = candidates.map((card) => {
    const hasLoopingVideo = cardHasProductionLoop(card);
    const hasDisplayImage = Boolean(card.highResImageUri || card.imageUri || card.posterUri);
    const isSongDrawCard = cardIsSongDrawCard(card);
    const hasDropZoneSong = cardHasDropZoneSong(card);
    const hasResolvedAudio = cardHasResolvedDropZoneAudio(card);
    const songDrawReady = isSongDrawCard && hasDropZoneSong;
    const isCreatorSetCard = ["creator_card", "creator_content_card", "creator_sponsor_card", "set"].includes(card.cardType);
    const productionReady = hasLoopingVideo || songDrawReady || isCreatorSetCard;
    const imageOnly = hasDisplayImage && !hasLoopingVideo && !songDrawReady && !isCreatorSetCard;
    const reasons = [
      !productionReady ? "missing-looping-video" : "",
      imageOnly ? "image-only-production-hidden" : ""
    ].filter(Boolean);
    const warnings = [
      !hasDropZoneSong ? "missing-dear-papa-song" : "",
      hasDropZoneSong && !hasResolvedAudio ? "missing-resolved-audio" : ""
    ].filter(Boolean);
    return {
      card,
      id: card.id,
      title: card.title,
      cardType: card.cardType || card.tarotMainType || card.sourceKind || "",
      hasLoopingVideo,
      hasDisplayImage,
      hasDropZoneSong,
      hasResolvedAudio,
      imageOnly,
      productionReady,
      reasons,
      warnings
    };
  });
  const productionRecords = records.filter((record) => record.productionReady);
  const queuedRecords = records.filter((record) => !record.productionReady);
  const songEnrichmentRecords = records.filter((record) => !record.hasDropZoneSong || (record.hasDropZoneSong && !record.hasResolvedAudio));
  return {
    schemaVersion: "hapa.tarot-draw-production-audit.v2",
    generatedAt: new Date().toISOString(),
    policy: "Production draw cards require at least one looping video, except Hapa Song cards, which are drawable music-slot control cards when they carry a song payload. Dear Papa song links are optional enrichment for visual cards and do not hide otherwise playable video cards. Image-only non-song cards are hidden from production draw and queued for media enrichment.",
    requireResolvedAudio: false,
    candidates: candidates.length,
    productionReady: productionRecords.length,
    hiddenFromProduction: queuedRecords.length,
    imageOnlyCount: records.filter((record) => record.imageOnly).length,
    missingLoopingVideo: records.filter((record) => !record.hasLoopingVideo).length,
    missingDearPapaSong: records.filter((record) => !record.hasDropZoneSong).length,
    missingResolvedAudio: records.filter((record) => record.hasDropZoneSong && !record.hasResolvedAudio).length,
    productionCards: productionRecords.map((record) => record.card),
    enrichmentQueue: queuedRecords.map(({ card, ...record }) => record).slice(0, 240),
    songEnrichmentQueue: songEnrichmentRecords.map(({ card, ...record }) => record).slice(0, 240),
    sampleHidden: queuedRecords.slice(0, 18).map(({ card, ...record }) => record)
  };
}

function cardHasProductionLoop(card = {}) {
  return Boolean(card.videoUri || (card.videoSources || []).some((source) => source?.uri));
}

function cardIsSongDrawCard(card = {}) {
  return Boolean(card.sourceSongId || card.sourceKind === "song" || card.kind === "song" || card.cardType === "song_card" || card.songCardVersion);
}

function cardHasDropZoneSong(card = {}) {
  if (dropZoneSongCandidatesForCard(card).some((song) => song?.title || song?.songTitle || song?.songId || song?.cardId || song?.audioUri)) return true;
  return cardIsSongDrawCard(card);
}

function cardHasResolvedDropZoneAudio(card = {}) {
  return dropZoneSongCandidatesForCard(card).some((song) =>
    Boolean(song?.audioUri || song?.audioUrl || song?.mp3Uri || song?.wavUri || song?.audio?.mp3Uri || song?.audio?.wavUri)
  );
}

function dropZoneSongCandidatesForCard(card = {}) {
  return [
    ...(card.songLinks || []),
    ...(card.avatarContacts || []).flatMap((contact) => contact?.songs || [])
  ];
}

function createTarotAvatarContactResolver(songLibrary = FALLBACK_SONG_LIBRARY, allAvatars = [], hapaSongStore = null) {
  const contacts = new Map();
  return (avatar = null) => {
    if (!avatar) return null;
    const key = avatar.id || avatar.primaryName || avatar.name;
    if (!key) return tarotAvatarContact(avatar, songLibrary, allAvatars, hapaSongStore);
    if (!contacts.has(key)) {
      contacts.set(key, tarotAvatarContact(avatar, songLibrary, allAvatars, hapaSongStore));
    }
    return contacts.get(key);
  };
}

function buildAvatarThemeTarotCards(avatars = [], selectedAvatar = null, songLibrary = FALLBACK_SONG_LIBRARY, hapaSongStore = null, resolveAvatarContact = createTarotAvatarContactResolver(songLibrary, avatars, hapaSongStore)) {
  return (avatars || [])
    .map((avatar, index) => {
      const videoAsset = pickAvatarTarotVideo(avatar);
      if (!videoAsset?.uri) return null;
      const videoSources = tarotVideoSourcesForAvatar(avatar);
      const primaryVideoSource = videoSources[0] || tarotVideoSourceFromAsset(videoAsset, `${avatar.primaryName || avatar.name || avatar.id || "Avatar"} featured loop`);
      const arcana = AVATAR_TAROT_MAJOR_ARCANA[index % AVATAR_TAROT_MAJOR_ARCANA.length];
      const role = avatar.mind?.gardenNodeAssignment?.role || avatar.mind?.shipCrewAssignment?.role || avatar.teamRole || "Avatar";
      const name = avatar.primaryName || avatar.name || avatar.id || "Avatar";
      const posterUri = thumbnailUriForAsset(videoAsset) || defaultCloseupEmotionAsset(avatar)?.uri || "";
      const summary = showcaseText(
        avatar.summary || avatar.three_paragraph_background_narrative || avatar.operatorNotes,
        `${name} carries ${arcana.title.toLowerCase()} through Hapa avatar lore.`
      );
      return {
        id: `avatar-tarot-${avatar.id}`,
        title: `${name} / ${arcana.title}`,
        subtitle: `${role} · Avatar Major Arcana`,
        archetype: arcana.title,
        tarotNumber: arcana.number,
        summary,
        keywords: uniqueLocal([...arcana.keywords, role, arcana.element]).slice(0, 6),
        stats: {
          resonance: Math.min(9, 5 + (avatar.mind?.phraseCards?.length || 0)),
          continuity: Math.min(9, 4 + (avatar.mind?.memoryLedger?.length || 0)),
          signal: Math.min(9, 5 + (avatar.assets?.length || 0) % 5),
          loopPool: videoSources.length
        },
        tags: uniqueLocal(["tarot-card", "avatar-tarot", "major-arcana", arcana.element, ...(avatar.tags || [])]),
        sourceKind: "avatar",
        kind: "avatar",
        cardType: "avatar_tarot_card",
        highResImageUri: posterUri ? resolveMediaUri(posterUri) : "",
        imageUri: posterUri ? resolveMediaUri(posterUri) : "",
        videoUri: primaryVideoSource?.uri || resolveMediaUri(videoAsset.uri),
        originalVideoUri: primaryVideoSource?.originalUri || resolveMediaUri(videoAsset.uri),
        backgroundless: primaryVideoSource?.backgroundless || null,
        backgroundlessUri: primaryVideoSource?.backgroundlessUri || "",
        hasAlpha: Boolean(primaryVideoSource?.hasAlpha),
        posterUri: posterUri ? resolveMediaUri(posterUri) : "",
        videoSources,
        videoPool: buildAvatarLoopPoolDescriptor(avatar, videoSources),
        priority: selectedAvatar?.id === avatar.id ? 2 : 0,
        videoScore: avatarAssetResolutionScore(videoAsset),
        avatarContacts: [resolveAvatarContact(avatar)].filter(Boolean)
      };
    })
    .filter(Boolean);
}

function buildHapaSongTarotCards(songStore = {}, avatars = [], songLibrary = FALLBACK_SONG_LIBRARY, resolveAvatarContact = createTarotAvatarContactResolver(songLibrary, avatars, songStore)) {
  const songs = Array.isArray(songStore?.songs) ? songStore.songs : Array.isArray(songStore) ? songStore : [];
  if (!songs.length) return [];
  const avatarLookup = createSongAvatarLookup(avatars);
  return songs
    .map((song, index) => {
      const songLink = tarotHapaSongLink(song, songLibrary);
      const avatarContacts = linkedSongAvatarContacts(song, avatarLookup, songLibrary, avatars, songStore, resolveAvatarContact);
      const linkedAvatarCards = avatarContacts
        .slice(0, 8)
        .map((contact, avatarIndex) => buildSongLinkedAvatarTarotCard(song, contact, avatarIndex, songLink))
        .filter(Boolean);
      const songMediaSources = songMediaVideoSources(song);
      const avatarMediaSources = linkedAvatarCards.flatMap((card) => card.videoSources || []);
      const videoSources = uniqueTarotVideoSources([...songMediaSources, ...avatarMediaSources]);
      const posterUri = songLink.coverUri ||
        linkedAvatarCards.find((card) => card.posterUri)?.posterUri ||
        avatarContacts.find((contact) => contact.portraitUri)?.portraitUri ||
        "";
      const summary = showcaseText(
        song.lore?.summary ||
          song.lore?.relationshipLens ||
          song.lore?.genesisUse ||
          song.enrichment?.notes,
        `${song.title || "Dear Papa"} opens a Hapa song scene.`
      );
      return {
        id: `song-card-${song.id || song.songId || index}`,
        sourceSongId: song.id || song.songId || "",
        title: song.title || `Dear Papa Song ${index + 1}`,
        subtitle: "Dear Papa Song Card",
        archetype: "Hapa Song",
        tarotNumber: song.trackNumber ? `S${song.trackNumber}` : "SONG",
        summary,
        keywords: uniqueLocal([
          "dear-papa",
          "song-card",
          "music-slot",
          song.lore?.mood,
          song.performancePerspective?.teamColor,
          ...(song.tags || [])
        ]).slice(0, 8),
        stats: {
          track: Number(song.trackNumber || index + 1),
          avatars: avatarContacts.length,
          scenes: song.attachments?.sceneLinks?.length || 0,
          media: (song.media || []).length,
          stems: (song.stems || []).length
        },
        tags: uniqueLocal(["tarot-card", "song-card", "hapa-song", "dear-papa", ...(song.tags || [])]),
        sourceKind: "song",
        kind: "song",
        cardType: "song_card",
        functionalType: "Song",
        tarotMainType: "song_card",
        songCardVersion: song.schemaVersion || "",
        songAttachments: song.attachments || {},
        songVisualizers: song.visualizers || [],
        songStoryBeats: song.storyBeats || [],
        highResImageUri: posterUri,
        imageUri: posterUri,
        videoUri: videoSources[0]?.uri || "",
        originalVideoUri: videoSources[0]?.originalUri || videoSources[0]?.sourceUri || "",
        backgroundless: videoSources[0]?.backgroundless || null,
        backgroundlessUri: videoSources[0]?.backgroundlessUri || "",
        hasAlpha: Boolean(videoSources[0]?.hasAlpha),
        posterUri,
        videoSources,
        songLinks: songLink ? [songLink] : [],
        avatarContacts,
        linkedAvatarCards,
        priority: 4,
        videoScore: 1200000 + avatarContacts.length * 1000 + videoSources.length * 100
      };
    })
    .filter(Boolean);
}

function createSongAvatarLookup(avatars = []) {
  const byId = new Map();
  const byName = new Map();
  for (const avatar of avatars || []) {
    if (!avatar) continue;
    if (avatar.id) byId.set(avatar.id, avatar);
    [
      avatar.primaryName,
      avatar.name,
      avatar.id,
      ...(avatar.names || []).map((name) => name?.name || name),
      ...(avatar.aliases || [])
    ].forEach((name) => {
      const key = normalizeAvatarLookupName(name);
      if (key && !byName.has(key)) byName.set(key, avatar);
    });
  }
  return { byId, byName };
}

function linkedSongAvatarContacts(song = {}, avatarLookup = createSongAvatarLookup([]), songLibrary = FALLBACK_SONG_LIBRARY, allAvatars = [], hapaSongStore = null, resolveAvatarContact = createTarotAvatarContactResolver(songLibrary, allAvatars, hapaSongStore)) {
  const links = [
    ...(song.attachments?.avatarLinks || []),
    ...(song.avatarLinks || [])
  ];
  if (song.performancePerspective?.avatarId || song.performancePerspective?.avatarName) {
    links.push({
      avatarId: song.performancePerspective.avatarId,
      avatarName: song.performancePerspective.avatarName,
      role: song.performancePerspective.voiceFunction || "performance-perspective",
      reason: "Seeded from Dear Papa song perspective."
    });
  }
  const seen = new Set();
  return links
    .map((link) => {
      const avatar = avatarLookup.byId.get(link.avatarId) ||
        avatarLookup.byName.get(normalizeAvatarLookupName(link.avatarName)) ||
        avatarLookup.byName.get(normalizeAvatarLookupName(link.name));
      const contact = avatar ? resolveAvatarContact(avatar) : {
        id: link.avatarId || normalizeAvatarLookupName(link.avatarName || link.name),
        name: link.avatarName || link.name || "Tagged Avatar",
        role: link.role || "song-linked-avatar",
        summary: link.reason || "",
        portraitUri: "",
        songs: [],
        profile: {
          mediaWall: [],
          relationshipTarotCards: [],
          skillCards: [],
          tags: link.tags || [],
          stats: []
        }
      };
      return {
        ...contact,
        songLinkReason: link.reason || contact.songLinkReason || "",
        songLinkRole: link.role || contact.songLinkRole || contact.role,
        songLinkTags: uniqueLocal([...(contact.songLinkTags || []), ...(link.tags || [])])
      };
    })
    .filter((contact) => {
      const key = contact?.id || normalizeAvatarLookupName(contact?.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildSongLinkedAvatarTarotCard(song = {}, contact = {}, index = 0, songLink = null) {
  const profile = contact.profile || {};
  const mediaTiles = prioritizeSongAvatarMedia(profile.mediaWall || []);
  const tileSources = mediaTiles
    .filter((tile) => tile.videoUri)
    .map((tile, tileIndex) => ({
      id: tile.id || `${contact.id || contact.name}-song-tile-${tileIndex + 1}`,
      uri: tile.videoUri,
      originalUri: tile.originalVideoUri || tile.sourceUri || tile.videoUri,
      sourceUri: tile.sourceUri || tile.originalVideoUri || tile.videoUri,
      posterUri: tile.posterUri || tile.imageUri || contact.portraitUri || "",
      label: `${contact.name || "Avatar"} / ${tile.label || tile.kind || "song loop"}`,
      score: Number(tile.priority || 0),
      backgroundless: tile.backgroundless || null,
      backgroundlessUri: tile.backgroundlessUri || tile.backgroundless?.uri || "",
      hasAlpha: Boolean(tile.hasAlpha),
      cutoutMode: tile.cutoutMode || (tile.hasAlpha ? "backgroundless" : "edge-matte")
    }));
  const fallbackSources = [
    profile.heroLoopUri ? {
      id: `${contact.id || contact.name}-song-hero-loop`,
      uri: profile.heroLoopUri,
      originalUri: profile.heroOriginalVideoUri || profile.heroLoopUri,
      sourceUri: profile.heroSourceUri || profile.heroOriginalVideoUri || profile.heroLoopUri,
      posterUri: profile.heroPosterUri || profile.heroImageUri || contact.portraitUri || "",
      label: `${contact.name || "Avatar"} hero loop`,
      score: 80,
      backgroundless: profile.heroBackgroundless || null,
      backgroundlessUri: profile.heroBackgroundless?.uri || "",
      hasAlpha: Boolean(profile.heroHasAlpha),
      cutoutMode: profile.heroHasAlpha ? "backgroundless" : "edge-matte"
    } : null,
    profile.backgroundVideoUri ? {
      id: `${contact.id || contact.name}-song-background-loop`,
      uri: profile.backgroundVideoUri,
      originalUri: profile.backgroundOriginalVideoUri || profile.backgroundVideoUri,
      sourceUri: profile.backgroundSourceUri || profile.backgroundOriginalVideoUri || profile.backgroundVideoUri,
      posterUri: profile.backgroundPosterUri || profile.heroImageUri || contact.portraitUri || "",
      label: `${contact.name || "Avatar"} background loop`,
      score: 72,
      backgroundless: profile.backgroundless || null,
      backgroundlessUri: profile.backgroundless?.uri || "",
      hasAlpha: Boolean(profile.backgroundHasAlpha),
      cutoutMode: profile.backgroundHasAlpha ? "backgroundless" : "edge-matte"
    } : null
  ].filter(Boolean);
  const videoSources = uniqueTarotVideoSources([...tileSources, ...fallbackSources]);
  const posterUri = videoSources[0]?.posterUri || profile.heroImageUri || contact.portraitUri || songLink?.coverUri || "";
  const title = `${contact.name || "Avatar"} / ${song.title || "Dear Papa"}`;
  return {
    id: `song-avatar-card-${stableCardSlug(song.id || song.songId || song.title)}-${stableCardSlug(contact.id || contact.name || index)}`,
    title,
    subtitle: `${contact.songLinkRole || contact.role || "Song-linked Avatar"} · Song Scene`,
    archetype: "Tagged Avatar",
    tarotNumber: `A${index + 1}`,
    summary: showcaseText(
      contact.songLinkReason ||
        contact.summary ||
        profile.narrative?.[0] ||
        song.lore?.relationshipLens,
      `${contact.name || "Avatar"} is tagged to ${song.title || "this Dear Papa song"}.`
    ),
    keywords: uniqueLocal([
      "song-avatar",
      "media-pool",
      contact.role,
      contact.songLinkRole,
      ...(contact.songLinkTags || []),
      ...(profile.tags || [])
    ]).slice(0, 8),
    stats: {
      media: mediaTiles.length,
      songs: contact.songs?.length || 0,
      loops: videoSources.length
    },
    tags: uniqueLocal(["tarot-card", "avatar-tarot", "song-seeded", "media-pool", ...(contact.songLinkTags || [])]),
    sourceKind: "avatar",
    kind: "avatar",
    cardType: "avatar_tarot_card",
    sourceAvatarId: contact.id || "",
    sourceSongId: song.id || song.songId || "",
    seededFromSongCardId: `song-card-${song.id || song.songId || stableCardSlug(song.title)}`,
    highResImageUri: posterUri,
    imageUri: posterUri,
    videoUri: videoSources[0]?.uri || "",
    originalVideoUri: videoSources[0]?.originalUri || videoSources[0]?.sourceUri || "",
    backgroundless: videoSources[0]?.backgroundless || null,
    backgroundlessUri: videoSources[0]?.backgroundlessUri || "",
    hasAlpha: Boolean(videoSources[0]?.hasAlpha),
    posterUri,
    videoSources,
    songLinks: songLink ? [songLink] : [],
    avatarContacts: [contact],
    priority: 3,
    videoScore: 900000 + videoSources.length * 100 + mediaTiles.length
  };
}

function prioritizeSongAvatarMedia(items = []) {
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
      Number(Boolean(b.videoUri)) - Number(Boolean(a.videoUri)) ||
      Number(b.priority || 0) - Number(a.priority || 0) ||
      compareText(a.label || a.kind, b.label || b.kind)
    );
}

function tarotHapaSongLink(song = {}, songLibrary = FALLBACK_SONG_LIBRARY) {
  const base = tarotContactSong({
    id: song.id,
    cardId: song.cardId || song.id,
    songCardId: song.cardId || song.id,
    songId: song.songId,
    title: song.title,
    duration: song.audio?.duration,
    lyrics: song.lyrics,
    lyricTiming: songLyricTimingPayload(song)
  }, songLibrary) || {};
  const audioUri = resolveSongRegistryUri(song.audio?.mp3Uri || song.audio?.wavUri || base.audioUri || "");
  const coverUri = resolveSongRegistryUri(song.audio?.coverUri || base.coverUri || "");
  return {
    ...base,
    id: song.id || base.id || song.songId || "",
    songId: song.songId || base.songId || "",
    cardId: song.cardId || song.id || base.cardId || "",
    songCardId: song.cardId || song.id || base.songCardId || "",
    title: song.title || base.title || "Dear Papa song",
    audioUri,
    coverUri,
    duration: Number(song.audio?.duration || base.duration || 0),
    lyricsText: song.lyrics?.text || base.lyricsText || "",
    lyricTiming: songLyricTimingPayload(song) || base.lyricTiming || null,
    lyricsStatus: song.lyrics?.status || base.lyricsStatus || "",
    lyricsSha256: song.lyrics?.sha256 || base.lyricsSha256 || "",
    localAvailable: Boolean(audioUri),
    sourceLabel: audioUri ? "Dear Papa full mix" : base.sourceLabel || "Dear Papa song",
    vibe: showcaseText(song.lore?.relationshipLens || song.lore?.summary || base.vibe, "Dear Papa scene signal.")
  };
}

function songLyricTimingPayload(song = {}) {
  const lines = (song.lyricTimings || [])
    .map((line, index) => ({
      index,
      section: line.section || "",
      text: line.text || "",
      start: Number(line.start || 0),
      end: Number(line.end || 0),
      duration: Math.max(0, Number(line.end || 0) - Number(line.start || 0)),
      confidence: Number(line.confidence || 0)
    }))
    .filter((line) => line.text);
  if (!lines.length) return null;
  return {
    duration: Number(song.audio?.duration || 0),
    lines
  };
}

function songMediaVideoSources(song = {}) {
  return (song.media || [])
    .filter((media) => media?.uri && (media.type === "video" || isVideoAsset(media)))
    .map((media, index) => tarotVideoSourceFromAsset(
      { ...media, id: media.id || `${song.id || song.songId || "song"}-media-${index + 1}` },
      media.name || media.title || `${song.title || "Song"} media loop`
    ))
    .filter(Boolean);
}

function pickAvatarTarotVideo(avatar = {}) {
  const videos = pickAvatarBackdropVideos(avatar);
  return videos.find((asset) => (asset.tags || []).includes("hero") || asset.requirementId === "loops") ||
    videos[0] ||
    pickAvatarHeroVideo(avatar);
}

function uniqueDrawCards(cards = []) {
  const seen = new Set();
  return cards.filter((card) => {
    const key = card?.id || `${card?.sourceKind}:${card?.title}:${card?.videoUri}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCardAvatarAssociationMap(inventoryStore = {}) {
  const map = new Map();
  const add = (cardId, avatarId) => {
    if (!cardId || !avatarId) return;
    const list = map.get(cardId) || [];
    if (!list.includes(avatarId)) list.push(avatarId);
    map.set(cardId, list);
  };
  for (const inventory of inventoryStore.avatarInventories || []) {
    const avatarId = inventory.avatarId;
    [
      ...(inventory.hardpoints || []).flatMap((hardpoint) => hardpoint.cardIds || []),
      ...(inventory.deck || []),
      ...(inventory.hand || []),
      ...(inventory.trainingDeck || []),
      ...(inventory.cardStates || [])
        .filter((state) => state.status === "active" && state.zone !== "library")
        .map((state) => state.cardId)
    ].forEach((cardId) => add(cardId, avatarId));
  }
  return map;
}

function extractAssociatedAvatarIds(record = {}) {
  return uniqueLocal([
    ...asList(record.avatarIds),
    ...asList(record.avatar_ids),
    ...asList(record.associatedAvatarIds),
    ...asList(record.associated_avatar_ids),
    ...asList(record.connections?.avatarIds),
    record.avatarId,
    record.avatar_id,
    record.ownerAvatarId,
    record.owner_avatar_id,
    record.createdForAvatarId,
    record.created_for_avatar_id
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function tarotAvatarContact(avatar = {}, songLibrary = FALLBACK_SONG_LIBRARY, allAvatars = [], hapaSongStore = null) {
  const portrait = defaultCloseupEmotionAsset(avatar);
  const portraitUri = portrait ? resolveMediaUri(thumbnailUriForAsset(portrait) || portrait.uri) : "";
  const heroVideo = pickAvatarHeroVideo(avatar);
  const heroSource = heroVideo ? tarotVideoSourceFromAsset(heroVideo, `${avatar.primaryName || avatar.name || avatar.id || "Avatar"} hero loop`) : null;
  const heroVideoUri = heroSource?.uri || "";
  const heroPosterUri = heroSource?.posterUri || (heroVideo ? resolveMediaUri(thumbnailUriForAsset(heroVideo) || portrait?.uri || "") : "");
  const mediaWall = buildAvatarContactMediaWall(avatar);
  const heroMediaTile = mediaWall.find((tile) => tile.imageUri && tile.videoUri) ||
    mediaWall.find((tile) => tile.imageUri) ||
    mediaWall.find((tile) => tile.videoUri) ||
    null;
  const backgroundMediaTile = mediaWall.find((tile) => tile.videoUri) || null;
  const mindSummary = avatarMindSummaryForTarot(avatar, allAvatars);
  const normalizedMind = normalizeAvatarMind(avatar.mind, avatar);
  const selectedSongCards = (avatar.mind?.dearPapaSongContext?.selectedSongCards || [])
    .filter((song) => song?.status !== "tombstone")
    .slice(0, 3);
  const linkedStoreSongs = avatarLinkedHapaSongs(avatar, hapaSongStore).slice(0, 3);
  const songCards = uniqueTarotContactSongs(
    [...selectedSongCards, ...linkedStoreSongs]
      .map((song) => tarotContactSong(song, songLibrary, hapaSongStore))
      .filter(Boolean)
  ).slice(0, 3);
  const mind = avatar.mind || {};
  const persona = mind.personaAnchor || {};
  const teamLabel = mind.gardenNodeAssignment?.teamName || mind.gardenNodeAssignment?.teamId || "Unassigned team";
  const gardenLabel = mind.gardenNodeAssignment?.gardenName || "Garden pending";
  const shipLabel = mind.shipCrewAssignment?.vesselName || mind.gardenNodeAssignment?.shipName || "Ship pending";
  const narrative = splitBackgroundNarrative(avatar.three_paragraph_background_narrative || avatar.summary || avatar.description).slice(0, 3);
  const loreFacts = [
    persona.identityStatement,
    persona.carriedForward,
    persona.wants ? `Wants: ${showcaseText(persona.wants, "")}` : "",
    persona.fears ? `Fears: ${showcaseText(persona.fears, "")}` : ""
  ].map((item) => showcaseText(item, "")).filter(Boolean).slice(0, 4);
  const aliases = (avatar.names || [])
    .map((name) => name?.name || name)
    .filter(Boolean)
    .slice(0, 5);
  return {
    id: avatar.id,
    name: avatar.primaryName || avatar.name || avatar.id || "Avatar",
    role: avatar.mind?.gardenNodeAssignment?.role || avatar.mind?.shipCrewAssignment?.role || avatar.teamRole || avatar.role || "Avatar",
    summary: showcaseText(avatar.summary || avatar.description || avatar.three_paragraph_background_narrative, ""),
    portraitUri,
    songs: songCards,
    profile: {
      aliases,
      teamLabel,
      gardenLabel,
      shipLabel,
      heroVideoUri,
      heroPosterUri,
      heroOriginalVideoUri: heroSource?.originalUri || (heroVideo?.uri ? resolveMediaUri(heroVideo.uri) : ""),
      heroSourceUri: heroSource?.sourceUri || "",
      heroBackgroundless: heroSource?.backgroundless || null,
      heroHasAlpha: Boolean(heroSource?.hasAlpha),
      heroImageUri: heroMediaTile?.imageUri || portraitUri,
      heroLoopUri: heroMediaTile?.videoUri || heroVideoUri,
      backgroundVideoUri: backgroundMediaTile?.videoUri || heroVideoUri,
      backgroundPosterUri: backgroundMediaTile?.posterUri || heroPosterUri || heroMediaTile?.imageUri || portraitUri,
      backgroundOriginalVideoUri: backgroundMediaTile?.originalVideoUri || heroSource?.originalUri || "",
      backgroundSourceUri: backgroundMediaTile?.sourceUri || heroSource?.sourceUri || "",
      backgroundless: backgroundMediaTile?.backgroundless || heroSource?.backgroundless || null,
      backgroundHasAlpha: Boolean(backgroundMediaTile?.hasAlpha || heroSource?.hasAlpha),
      mediaWall,
      relationshipTarotCards: buildRelationshipTarotCardsForAvatar(avatar, mindSummary),
      skillCards: buildSkillCardsForAvatar(avatar, normalizedMind, mindSummary),
      narrative,
      loreFacts,
      tags: (avatar.tags || []).slice(0, 8),
      stats: [
        { label: "Media", value: avatar.assets?.length || 0 },
        { label: "Lore", value: Number(mindSummary.counts?.selfKnowledge || (mind.selfKnowledge || []).filter((item) => item.status !== "tombstone").length || 0) },
        { label: "Memory", value: Number(mindSummary.counts?.memories || (mind.memoryLedger || []).filter((item) => item.status !== "tombstone").length || 0) },
        { label: "Songs", value: Number(mindSummary.counts?.songCards || songCards.length || 0) }
      ]
    }
  };
}

function buildRelationshipTarotCardsForAvatar(avatar = {}, mindSummary = {}) {
  const avatarName = avatar.primaryName || avatar.name || avatar.id || "Avatar";
  return (mindSummary.knownOthers || [])
    .slice(0, 10)
    .map((relationship, index) => {
      const arcana = relationshipArcanaForMetrics(relationship, index);
      const targetName = relationship.name || relationship.targetName || "Unknown";
      const relationLabel = relationship.relationLabel || "relationship";
      return {
        id: `relationship-tarot-${stableCardSlug(avatar.id || avatarName)}-${stableCardSlug(targetName || relationship.id || index)}`,
        title: `${targetName} / ${relationLabel}`,
        subtitle: `${avatarName} Relationship Tarot`,
        archetype: arcana.title,
        tarotNumber: arcana.number,
        summary: showcaseText(
          `${avatarName} and ${targetName}: trust ${relationship.trust || 0}, tension ${relationship.tension || 0}, loyalty ${relationship.loyalty || 0}.`,
          `${avatarName} relationship signal.`
        ),
        keywords: uniqueLocal([
          relationLabel,
          ...(relationship.relationLabels || []),
          relationship.confidence,
          relationship.classification,
          ...arcana.keywords
        ]).slice(0, 7),
        stats: {
          trust: Math.round(Number(relationship.trust) || 0),
          tension: Math.round(Number(relationship.tension) || 0),
          loyalty: Math.round(Number(relationship.loyalty) || 0),
          debt: Math.round(Number(relationship.debt) || 0),
          fear: Math.round(Number(relationship.fear) || 0)
        },
        tags: uniqueLocal(["relationship-tarot", "music-slot-spawn", relationLabel, relationship.classification]),
        sourceKind: "relationship",
        kind: "relationship",
        cardType: "relationship_tarot_card",
        targetAvatarId: relationship.id || null,
        targetName,
        relationLabel,
        sourceCount: relationship.sourceCount || 1
      };
    });
}

function relationshipArcanaForMetrics(relationship = {}, index = 0) {
  const trust = Number(relationship.trust) || 0;
  const tension = Number(relationship.tension) || 0;
  const fear = Number(relationship.fear) || 0;
  const debt = Number(relationship.debt) || 0;
  const loyalty = Number(relationship.loyalty) || 0;
  if (tension >= 6) return arcanaByTitle("The Tower");
  if (fear >= 6) return arcanaByTitle("The Moon");
  if (trust >= 6 && loyalty >= 6) return arcanaByTitle("The Lovers");
  if (debt >= 5) return arcanaByTitle("Justice");
  if (loyalty >= 5) return arcanaByTitle("Strength");
  if (trust <= -4 || loyalty <= -4) return arcanaByTitle("Death");
  return AVATAR_TAROT_MAJOR_ARCANA[(index + 6) % AVATAR_TAROT_MAJOR_ARCANA.length];
}

function arcanaByTitle(title) {
  return AVATAR_TAROT_MAJOR_ARCANA.find((item) => item.title === title) || AVATAR_TAROT_MAJOR_ARCANA[0];
}

function avatarMindSummaryForTarot(avatar = {}, allAvatars = []) {
  const base = createAvatarMindSummary(avatar, allAvatars);
  const compactMind = avatar?.mind && typeof avatar.mind === "object" ? avatar.mind : {};
  const compactCounts = compactMind.counts && typeof compactMind.counts === "object" ? compactMind.counts : {};
  const compactLoadout = compactMind.loadout && typeof compactMind.loadout === "object" ? compactMind.loadout : {};
  return {
    ...base,
    personaAnchor: {
      ...base.personaAnchor,
      ...(compactMind.personaAnchor || {})
    },
    gardenNodeAssignment: compactMind.gardenNodeAssignment || base.gardenNodeAssignment,
    shipCrewAssignment: compactMind.shipCrewAssignment || base.shipCrewAssignment,
    counts: {
      ...base.counts,
      ...Object.fromEntries(Object.entries(compactCounts).filter(([, value]) => Number(value) > 0))
    },
    knownOthers: preferSummaryList(base.knownOthers, compactMind.knownOthers),
    context: preferSummaryList(base.context, compactMind.context),
    phraseCards: preferSummaryList(base.phraseCards, compactMind.phraseCards),
    loadout: {
      protocolCards: preferSummaryList(base.loadout?.protocolCards, compactLoadout.protocolCards),
      skillCards: preferSummaryList(base.loadout?.skillCards, compactLoadout.skillCards),
      tarotCards: preferSummaryList(base.loadout?.tarotCards, compactLoadout.tarotCards),
      songCards: preferSummaryList(base.loadout?.songCards, compactLoadout.songCards)
    },
    updatedAt: compactMind.updatedAt || base.updatedAt
  };
}

function preferSummaryList(primary = [], fallback = []) {
  return Array.isArray(primary) && primary.length ? primary : Array.isArray(fallback) ? fallback : [];
}

function buildSkillCardsForAvatar(avatar = {}, mind = {}, mindSummary = null) {
  const avatarName = avatar.primaryName || avatar.name || avatar.id || "Avatar";
  const compactSkillCards = mindSummary?.loadout?.skillCards || [];
  const sourceCards = (mind.skillCardLoadout || []).length ? mind.skillCardLoadout : compactSkillCards;
  return (sourceCards || [])
    .filter((card) => card.status !== "tombstone")
    .slice(0, 10)
    .map((card, index) => ({
      id: `skill-spawn-${stableCardSlug(avatar.id || avatarName)}-${stableCardSlug(card.id || card.title || index)}`,
      title: card.title || "Untitled Skill",
      subtitle: `${avatarName} Skill Card`,
      archetype: card.role || card.family || "Skill",
      tarotNumber: `S${index + 1}`,
      summary: showcaseText(card.mechanic || card.whyChosen || card.learningThing || card.role, `${avatarName} skill loadout card.`),
      keywords: uniqueLocal([
        card.family,
        card.cardType,
        card.role,
        card.learningThing,
        ...(card.allowedUses || [])
      ]).slice(0, 7),
      stats: {
        uses: (card.allowedUses || []).length,
        limits: (card.limits || []).length,
        active: card.status === "active" ? 1 : 0
      },
      tags: uniqueLocal(["skill-card", "music-slot-spawn", card.family, card.cardType, card.role]),
      sourceKind: "skill",
      kind: "skill",
      cardType: card.cardType || "skill_card",
      mechanic: card.mechanic,
      role: card.role,
      family: card.family,
      allowedUses: card.allowedUses || [],
      limits: card.limits || []
    }));
}

function stableCardSlug(value = "") {
  return String(value || "card")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "card";
}

function avatarLinkedHapaSongs(avatar = {}, hapaSongStore = null) {
  const songs = hapaSongStoreSongs(hapaSongStore);
  if (!songs.length || !avatar) return [];
  const avatarIds = new Set([
    avatar.id,
    avatar.avatarId,
    avatar.sourceAvatarId
  ].map((value) => String(value || "").trim()).filter(Boolean));
  const avatarNames = new Set([
    avatar.primaryName,
    avatar.name,
    ...(avatar.names || []).map((name) => name?.name || name),
    ...(avatar.aliases || [])
  ].map((value) => normalizeAvatarLookupName(value)).filter(Boolean));
  return songs
    .filter((song) => {
      const perspective = song.performancePerspective ? [{
        avatarId: song.performancePerspective.avatarId || song.performancePerspective.avatar_id,
        avatarName: song.performancePerspective.avatarName || song.performancePerspective.avatar_name
      }] : [];
      const links = [
        ...(song.attachments?.avatarLinks || []),
        ...(song.avatarLinks || []),
        ...perspective
      ];
      return links.some((link) =>
        avatarIds.has(String(link.avatarId || link.avatar_id || "").trim()) ||
        avatarNames.has(normalizeAvatarLookupName(link.avatarName || link.avatar_name || link.name))
      );
    })
    .sort((a, b) =>
      Number(a.trackNumber || 0) - Number(b.trackNumber || 0) ||
      compareText(a.title, b.title)
    );
}

function uniqueTarotContactSongs(songs = []) {
  const byKey = new Map();
  for (const song of songs || []) {
    const key = song.cardId || song.songCardId || song.songId || song.id || normalizeSongTitle(song.title);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, song);
  }
  return [...byKey.values()];
}

function buildAvatarContactMediaWall(avatar = {}) {
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const branchMap = createVideoBranchMap(avatar);
  const portrait = defaultCloseupEmotionAsset(avatar);
  const fallbackImageUri = thumbnailUriForAsset(portrait) || portrait?.uri || "";
  const imageTiles = assets
    .filter((asset) => asset.type === "image" && (asset.uri || thumbnailUriForAsset(asset)))
    .sort((a, b) => showcaseAssetSort(a, b, branchMap))
    .map((asset) => {
      const loop = (branchMap.get(asset.id) || []).find((video) => video?.uri) || null;
      return avatarContactMediaTile(asset, loop, thumbnailUriForAsset(asset) || asset.uri, avatarMediaKindLabel(asset));
    });
  const loopUris = new Set(imageTiles.flatMap((tile) => [tile.videoUri, tile.originalVideoUri]).filter(Boolean));
  const videoTiles = rotatingAvatarLoopWindow(
    pickAvatarBackdropVideos(avatar),
    TAROT_PROFILE_AVATAR_LOOP_TILE_LIMIT,
    `${avatar.id || avatar.primaryName || avatar.name || "avatar"}:profile-media-wall`
  )
    .filter((asset) => asset?.uri && !loopUris.has(resolveMediaUri(asset.uri)) && !loopUris.has(resolveMediaUri(playbackUriForVideoAsset(asset))))
    .map((asset, index) => avatarContactMediaTile(asset, asset, thumbnailUriForAsset(asset) || fallbackImageUri, index === 0 ? "Featured loop" : "Loop"));
  const seen = new Set();
  return [...imageTiles, ...videoTiles]
    .filter((tile) => tile.imageUri || tile.videoUri)
    .filter((tile) => {
      const key = `${tile.imageUri || ""}:${tile.videoUri || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(avatarContactMediaTileSort)
    .slice(0, 12);
}

function avatarContactMediaTile(asset = {}, loop = null, imageUri = "", kind = "Media") {
  const playback = loop ? backgroundlessPlaybackForAsset(loop) : null;
  const backgroundless = loop ? backgroundlessTarotInfoForAsset(loop) : null;
  const loopUri = loop?.uri ? playbackUriForVideoAsset(loop) : "";
  const posterUri = loop ? playback?.posterUri || thumbnailUriForAsset(loop) || imageUri : imageUri;
  return {
    id: `${asset.id || asset.uri || asset.name || "media"}:${loop?.id || loop?.uri || "still"}`,
    imageUri: imageUri ? resolveMediaUri(imageUri) : "",
    videoUri: loopUri ? resolveMediaUri(loopUri) : "",
    originalVideoUri: loop?.uri ? resolveMediaUri(loop.uri) : "",
    sourceUri: playback?.sourceUri ? resolveMediaUri(playback.sourceUri) : "",
    solidUri: loop?.uri ? resolveMediaUri(loop.uri) : "",
    backgroundlessUri: playback?.ready ? resolveMediaUri(playback.uri) : "",
    posterUri: posterUri ? resolveMediaUri(posterUri) : "",
    label: asset.name || asset.title || avatarMediaKindLabel(asset),
    kind,
    backgroundless,
    hasAlpha: false,
    cutoutMode: "solid",
    priority: avatarContactMediaPriority(Boolean(imageUri), Boolean(loop?.uri), asset)
  };
}

function avatarContactMediaTileSort(a = {}, b = {}) {
  return Number(b.priority || 0) - Number(a.priority || 0) ||
    compareText(a.label || a.kind, b.label || b.kind);
}

function avatarContactMediaPriority(hasImage = false, hasLoop = false, asset = {}) {
  return (hasImage && hasLoop ? 80 : hasLoop ? 64 : hasImage ? 32 : 0) +
    (asset.metadata?.defaultForSection || asset.processing?.defaultForSection ? 8 : 0) +
    Math.min(7, Math.round(avatarAssetResolutionScore(asset) / 400000));
}

function avatarMediaKindLabel(asset = {}) {
  return showcaseText(asset.requirementId || asset.cardType || asset.type || "Media", "Media").replaceAll("_", " ");
}

function tarotContactSong(song = {}, songLibrary = FALLBACK_SONG_LIBRARY, hapaSongStore = null) {
  if (!song) return null;
  const card = findDearPapaSongCard(song);
  const storeSong = findHapaSongInStore(song, hapaSongStore, card);
  const track = findSongRegistryTrack(song, songLibrary, card, storeSong);
  const audioUri = resolveSongRegistryUri(
    song.audioUri ||
      song.audio_uri ||
      song.audio?.mp3Uri ||
      song.audio?.wavUri ||
      storeSong?.audio?.mp3Uri ||
      storeSong?.audio?.wavUri ||
      track?.audioUri ||
      track?.audioUrl ||
      ""
  );
  const coverUri = song.coverUri || song.cover_uri || song.audio?.coverUri || storeSong?.audio?.coverUri || track?.coverUri
    ? resolveSongRegistryUri(song.coverUri || song.cover_uri || song.audio?.coverUri || storeSong?.audio?.coverUri || track?.coverUri)
    : "";
  return {
    id: songChoiceKey(song) || storeSong?.id || card?.id || track?.id || "",
    songId: song.songId || song.song_id || storeSong?.songId || card?.songId || card?.song_id || "",
    cardId: song.cardId || song.card_id || storeSong?.cardId || storeSong?.id || card?.id || "",
    songCardId: song.songCardId || song.song_card_id || storeSong?.cardId || storeSong?.id || card?.id || "",
    registryId: track?.id || storeSong?.audio?.registryTrackId || "",
    title: song.title || song.songTitle || storeSong?.title || card?.title || track?.title || "Avatar song",
    perspective: song.perspective || storeSong?.performancePerspective || card?.performancePerspective || {},
    audioUri,
    coverUri,
    duration: Number(song.duration || song.audio?.duration || storeSong?.audio?.duration || track?.duration || track?.lyricTiming?.duration || card?.duration || 0),
    lyricsText: songLyricsText(song, track, storeSong),
    lyricTiming: songLyricTiming(song, track, card, storeSong),
    lyricsStatus: song.lyrics?.status || storeSong?.lyrics?.status || card?.lyrics?.status || "",
    lyricsSha256: song.lyricsSha256 || song.lyrics_sha256 || song.lyrics?.sha256 || storeSong?.lyrics?.sha256 || card?.lyrics?.sha256 || "",
    localAvailable: Boolean(audioUri || track?.localAvailable),
    sourceLabel: songRegistryTrackLabel(songLibrary, track),
    vibe: songVibeText(song, storeSong || card)
  };
}

function buildTarotDrawSongLinks(songLinks = [], songLibrary = FALLBACK_SONG_LIBRARY, hapaSongStore = null) {
  const byKey = new Map();
  (songLinks || [])
    .map((link) => tarotDrawSongLink(link, songLibrary, hapaSongStore))
    .filter(Boolean)
    .forEach((song) => {
      const key = song.cardId || song.songCardId || song.songId || song.id || song.title;
      if (!key) return;
      const current = byKey.get(key);
      if (!current || tarotSongPayloadScore(song) > tarotSongPayloadScore(current)) {
        byKey.set(key, song);
      }
    });
  return [...byKey.values()];
}

function tarotDrawSongLink(link = {}, songLibrary = FALLBACK_SONG_LIBRARY, hapaSongStore = null) {
  const normalized = {
    ...link,
    id: link.id || link.choiceId || link.sourceChoiceId || link.songCardId || link.cardId || link.songId,
    cardId: link.songCardId || link.cardId || link.card_id,
    songCardId: link.songCardId || link.cardId || link.card_id,
    songId: link.songId || link.song_id,
    title: link.songTitle || link.title || link.name,
    songTitle: link.songTitle || link.title || link.name
  };
  const song = tarotContactSong(normalized, songLibrary, hapaSongStore);
  if (!song) return null;
  return {
    ...song,
    id: normalized.id || song.id,
    songLinkId: link.id || "",
    songCardId: normalized.songCardId || song.cardId || "",
    avatarId: link.avatarId || link.avatar_id || song.perspective?.avatar_id || "",
    avatarName: link.avatarName || link.avatar_name || song.perspective?.avatar_name || "",
    avatarRole: link.avatarRole || link.avatar_role || "",
    why: link.why || link.songWhy || link.whySelected || "",
    sourceLabel: song.sourceLabel || link.vibe || "Card song",
    vibe: link.vibe || song.vibe
  };
}

function tarotSongPayloadScore(song = {}) {
  return Number(Boolean(song.audioUri || song.audioUrl || song.mp3Uri || song.wavUri || song.audio?.mp3Uri || song.audio?.wavUri)) * 100 +
    Number(Boolean(song.lyricsText || song.lyrics?.text || song.lyricTiming || song.lyricsTiming || song.timedLyrics)) * 30 +
    Number(Boolean(song.coverUri || song.imageUri || song.posterUri)) * 5 +
    Math.min(4, Number(song.sourceRank || 0));
}

function mediaResolutionScore(asset = {}) {
  const width = Number(asset.width || asset.metadata?.width || asset.metadata?.naturalWidth || asset.processing?.width || 0);
  const height = Number(asset.height || asset.metadata?.height || asset.metadata?.naturalHeight || asset.processing?.height || 0);
  return width * height;
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function songChoiceKey(song = {}) {
  return song.id || song.songCardId || song.cardId || song.card_id || song.songId || song.song_id || normalizeSongTitle(song.songTitle || song.title) || "";
}

function normalizeSongTitle(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/['’"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findDearPapaSongCard(song = {}) {
  if (!song || !DEAR_PAPA_SONG_CARDS.length) return null;
  const directKeys = new Set([
    song.id,
    song.songCardId,
    song.song_card_id,
    song.cardId,
    song.card_id,
    song.songId,
    song.song_id
  ].map((key) => String(key || "").trim()).filter(Boolean));
  const byDirectKey = DEAR_PAPA_SONG_CARDS.find((card) => [card.id, card.cardId, card.card_id, card.songId, card.song_id].some((key) => directKeys.has(String(key || "").trim())));
  if (byDirectKey) return byDirectKey;
  const title = normalizeSongTitle(song.songTitle || song.title || song.name);
  return DEAR_PAPA_SONG_CARDS.find((card) => normalizeSongTitle(card.title || card.name) === title) || null;
}

function hapaSongStoreSongs(hapaSongStore = null) {
  if (Array.isArray(hapaSongStore)) return hapaSongStore;
  if (Array.isArray(hapaSongStore?.songs)) return hapaSongStore.songs;
  return [];
}

function findHapaSongInStore(song = {}, hapaSongStore = null, card = null) {
  const songs = hapaSongStoreSongs(hapaSongStore);
  if (!songs.length) return null;
  const directKeys = new Set([
    song.id,
    song.hapaSongId,
    song.hapaSongCardId,
    song.songCardId,
    song.song_card_id,
    song.cardId,
    song.card_id,
    song.songId,
    song.song_id,
    song.registryId,
    song.registrySongId,
    song.registryTrackId,
    song.songRegistryId,
    song.sunoSongId,
    song.sunoId,
    card?.id,
    card?.cardId,
    card?.songId,
    card?.song_id,
    card?.registrySongId,
    card?.songRegistryId,
    card?.sunoSongId,
    card?.sunoId
  ].map((key) => String(key || "").trim()).filter(Boolean));
  if (directKeys.size) {
    const byDirectKey = songs.find((candidate) => [
      candidate.id,
      candidate.cardId,
      candidate.songId,
      candidate.audio?.registryTrackId,
      candidate.registryTrackId,
      candidate.registrySongId,
      candidate.songRegistryId,
      candidate.sunoSongId,
      candidate.sunoId
    ].some((key) => directKeys.has(String(key || "").trim())));
    if (byDirectKey) return byDirectKey;
  }

  const titles = new Set([
    song.title,
    song.name,
    song.songTitle,
    card?.title,
    card?.name,
    card?.songTitle
  ].map(normalizeSongTitle).filter(Boolean));
  if (!titles.size) return null;
  return songs.find((candidate) => titles.has(normalizeSongTitle(candidate.title || candidate.name || candidate.songTitle))) || null;
}

function findSongRegistryTrack(song = {}, songLibrary = FALLBACK_SONG_LIBRARY, card = null, hapaSong = null) {
  const tracks = Array.isArray(songLibrary?.songs) ? songLibrary.songs : [];
  if (!tracks.length) return null;
  const directKeys = new Set([
    song.registrySongId,
    song.songRegistryId,
    song.sunoSongId,
    song.sunoId,
    song.registryId,
    song.registryTrackId,
    song.audio?.registryTrackId,
    song.songCardId,
    song.song_card_id,
    song.cardId,
    song.card_id,
    song.songId,
    song.song_id,
    hapaSong?.audio?.registryTrackId,
    hapaSong?.registryTrackId,
    hapaSong?.registrySongId,
    hapaSong?.songRegistryId,
    hapaSong?.sunoSongId,
    hapaSong?.sunoId,
    hapaSong?.id,
    hapaSong?.cardId,
    hapaSong?.songId,
    card?.registrySongId,
    card?.songRegistryId,
    card?.sunoSongId,
    card?.sunoId,
    card?.id,
    card?.cardId,
    card?.songId,
    card?.song_id
  ].map((key) => String(key || "").trim()).filter(Boolean));
  if (directKeys.size) {
    const byDirectKey = tracks.find((track) => directKeys.has(String(track.id || "").trim()));
    if (byDirectKey) return byDirectKey;
  }

  const titles = new Set([
    song.title,
    song.name,
    song.songTitle,
    hapaSong?.title,
    hapaSong?.name,
    hapaSong?.songTitle,
    card?.title,
    card?.name,
    card?.songTitle
  ].map(normalizeSongTitle).filter(Boolean));
  if (!titles.size) return null;
  return tracks.find((track) => titles.has(normalizeSongTitle(track.title || track.name))) || null;
}

function songLyricTiming(song = {}, registryTrack = null, card = null, hapaSong = null) {
  const timing = song.lyricTiming ||
    song.lyricTimings ||
    song.lyric_timing ||
    song.lyric_timings ||
    song.lyricsTiming ||
    song.timedLyrics ||
    songLyricTimingPayload(hapaSong || {}) ||
    hapaSong?.lyricTiming ||
    hapaSong?.lyricsTiming ||
    hapaSong?.timedLyrics ||
    registryTrack?.lyricTiming ||
    registryTrack?.lyricTimings ||
    registryTrack?.lyric_timing ||
    registryTrack?.lyric_timings ||
    registryTrack?.lyricsTiming ||
    registryTrack?.timedLyrics ||
    card?.lyricTiming ||
    card?.lyricsTiming ||
    card?.lyrics?.timing ||
    null;
  if (!timing || typeof timing !== "object") return null;
  const lines = Array.isArray(timing.lines) ? timing.lines : Array.isArray(timing.segments) ? timing.segments : [];
  if (!lines.length) return timing;
  return {
    ...timing,
    duration: Number(timing.duration || registryTrack?.duration || song.duration || hapaSong?.audio?.duration || card?.duration || 0),
    lines: lines.map((line, index) => ({
      index: Number.isFinite(Number(line.index)) ? Number(line.index) : index,
      section: line.section || line.label || "",
      text: line.text || line.line || line.lyric || "",
      start: Number(line.start ?? line.startTime ?? line.time ?? line.timestampSeconds ?? 0),
      end: Number(line.end ?? line.endTime ?? line.stop ?? 0),
      duration: Number(line.duration || 0),
      timestamp: line.timestamp || line.timecode || "",
      confidence: Number(line.confidence || timing.confidence || 0)
    })).filter((line) => String(line.text || "").trim())
  };
}

function songRegistryTrackLabel(songLibrary = FALLBACK_SONG_LIBRARY, track = null) {
  if (track?.localAvailable) return "Full mix";
  if (songLibrary.status === "loading") return "Syncing";
  if (songLibrary.status === "error") return "Registry off";
  return "No audio";
}

function songSourceLabel(songLibrary = FALLBACK_SONG_LIBRARY, track = null, audioState = "idle") {
  if (track?.localAvailable) {
    const duration = formatSongDuration(track.duration);
    const stateLabel = audioState === "playing" ? "playing" : audioState === "blocked" ? "click play" : "local full mix";
    return ["Song Registry", stateLabel, duration].filter(Boolean).join(" · ");
  }
  if (songLibrary.status === "loading") return "Song Registry · loading Dear Papa";
  if (songLibrary.status === "error") return `Song Registry · ${songLibrary.error || "offline"}`;
  return "Song Registry · no full mix matched";
}

function formatSongDuration(duration) {
  const totalSeconds = Math.round(Number(duration) || 0);
  if (!totalSeconds) return "";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function songLyricsText(song = {}, registryTrack = null, hapaSong = null) {
  const directLyrics = song.lyrics?.text || song.lyricsText || "";
  if (typeof directLyrics === "string" && directLyrics.trim()) return directLyrics.trim();

  const storeLyrics = hapaSong?.lyrics?.text || hapaSong?.lyricsText || "";
  if (typeof storeLyrics === "string" && storeLyrics.trim()) return storeLyrics.trim();

  const registryLyrics = registryTrack?.lyrics;
  if (typeof registryLyrics === "string" && registryLyrics.trim()) return registryLyrics.trim();

  const card = findDearPapaSongCard(song);
  const cardLyrics = card?.lyrics?.text || "";
  if (typeof cardLyrics === "string" && cardLyrics.trim()) return cardLyrics.trim();

  const candidatePreview = card?.lyrics?.candidateMatches?.[0]?.preview || hapaSong?.lyrics?.candidateMatches?.[0]?.preview;
  if (candidatePreview) {
    return `${candidatePreview}\n\nLyric source match is pending review in the Dear Papa songbook.`;
  }

  return showcaseText(hapaSong?.lore?.summary || card?.lore?.summary || song.genesisInstruction || song.communicationUse, "Lyrics are not attached to this song card yet.");
}

function songVibeText(song = {}, card = null) {
  return showcaseText(
    song.genesisInstruction ||
      song.whySelected ||
      song.communicationUse ||
      card?.lore?.summary ||
      card?.lore?.broad_game_mechanic,
    "Playlist signal pending."
  );
}

function closeupSpeechPortraits(avatar = {}) {
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const closeups = assets
    .filter((asset) => asset.requirementId === "closeup_emotions" && (asset.type === "image" || asset.uri || thumbnailUriForAsset(asset)))
    .sort(showcaseAssetSort);
  if (closeups.length) return closeups;
  const fallback = defaultCloseupEmotionAsset(avatar);
  return fallback ? [fallback] : [];
}

function relationshipTargetAvatar(relationship = {}, avatars = []) {
  const directId = relationship.targetAvatarId || relationship.targetId || relationship.id;
  const directAvatar = avatars.find((avatar) => avatar.id === directId);
  if (directAvatar) return directAvatar;

  const targetNames = [
    relationship.targetName,
    relationship.name,
    relationship.label
  ]
    .flatMap((value) => String(value || "").split(/[\/,|]+/))
    .map((value) => normalizeAvatarLookupName(value))
    .filter(Boolean);
  if (!targetNames.length) return null;

  return avatars.find((avatar) => {
    const avatarNames = [
      avatar.primaryName,
      ...(avatar.names || []).map((name) => name.name || name),
      ...(avatar.aliases || [])
    ].map((value) => normalizeAvatarLookupName(value));
    return avatarNames.some((name) => targetNames.includes(name));
  }) || null;
}

function normalizeAvatarLookupName(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/['’"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function showcaseText(value, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => showcaseText(item, "")).filter(Boolean).join(" · ") || fallback;
  if (typeof value === "object") {
    return value.summary || value.label || value.title || value.name || value.voiceFunction || value.relationshipFocus ||
      Object.entries(value)
        .slice(0, 4)
        .map(([key, entryValue]) => `${titleizeItemLabel(key)}: ${showcaseText(entryValue, "")}`)
        .filter((item) => !item.endsWith(": "))
        .join(" · ") ||
      fallback;
  }
  return fallback;
}

function LoreReaderView({ avatars, itemCards, sceneGraph, board, selectedAvatarId, onSelectAvatar }) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [avatarFilter, setAvatarFilter] = useState("all");
  const [sortMode, setSortMode] = useState("curated");
  const [page, setPage] = useState(0);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [segmentIndex, setSegmentIndex] = useState(0);
  const readerTopRef = useRef(null);
  const entries = useMemo(
    () => buildLoreReaderEntries({ avatars, itemCards, sceneGraph, board }),
    [avatars, itemCards, sceneGraph, board]
  );
  const avatarOptions = useMemo(
    () => avatars
      .map((avatar) => ({ id: avatar.id, name: avatar.primaryName || avatar.names?.[0]?.name || avatar.id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [avatars]
  );
  const countsByKind = useMemo(() => {
    const counts = { all: entries.length };
    for (const entry of entries) counts[entry.kind] = (counts[entry.kind] || 0) + 1;
    return counts;
  }, [entries]);
  const filteredEntries = useMemo(() => {
    const searchNeedle = query.trim().toLowerCase();
    return entries
      .filter((entry) => kindFilter === "all" || entry.kind === kindFilter)
      .filter((entry) => avatarFilter === "all" || entry.avatarIds.includes(avatarFilter))
      .filter((entry) => !searchNeedle || entry.searchText.includes(searchNeedle))
      .sort((a, b) => compareLoreEntries(a, b, sortMode));
  }, [entries, kindFilter, avatarFilter, query, sortMode]);
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / LORE_READER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleEntries = filteredEntries.slice(safePage * LORE_READER_PAGE_SIZE, (safePage + 1) * LORE_READER_PAGE_SIZE);
  const selectedEntry = filteredEntries.find((entry) => entry.id === selectedEntryId) || filteredEntries[0] || entries[0] || null;
  const segments = useMemo(() => splitLoreIntoSegments(selectedEntry?.body || selectedEntry?.summary || ""), [selectedEntry?.id, selectedEntry?.body, selectedEntry?.summary]);
  const activeSegment = segments[Math.min(segmentIndex, Math.max(0, segments.length - 1))] || segments[0] || null;
  const totalWords = filteredEntries.reduce((sum, entry) => sum + entry.wordCount, 0);
  const currentAvatarName = avatarOptions.find((avatar) => avatar.id === selectedAvatarId)?.name || "Selected Avatar";
  const featuredEntries = useMemo(
    () => entries
      .filter((entry) => entry.featured)
      .sort((a, b) => compareLoreEntries(a, b, "curated"))
      .slice(0, 5),
    [entries]
  );

  useEffect(() => {
    setPage(0);
  }, [query, kindFilter, avatarFilter, sortMode]);

  useEffect(() => {
    if (!filteredEntries.length) return;
    if (!selectedEntryId || !filteredEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedEntryId]);

  useEffect(() => {
    setSegmentIndex(0);
    readerTopRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (page === safePage) return;
    setPage(safePage);
  }, [page, safePage]);

  function setFilter(nextKind) {
    setKindFilter(nextKind);
  }

  function selectEntry(entryId) {
    setSelectedEntryId(entryId);
  }

  function jumpSegment(delta) {
    setSegmentIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(0, segments.length - 1)));
  }

  return (
    <section className="lore-reader-view" aria-label="Lore Reader">
      <header className="lore-reader-hero hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Lore Reader</p>
          <h2>Hapa Saga Console</h2>
          <span>Chunked reading for sagas, avatar journals, cards, scenes, memory, and context.</span>
        </div>
        <div className="lore-reader-readouts">
          <StatusChip label="ENTRIES" value={entries.length} tone="fuchsia" />
          <StatusChip label="FILTERED" value={filteredEntries.length} tone="cyan" />
          <StatusChip label="WORDS" value={compactNumber(totalWords)} tone="gold" />
          <StatusChip label="AVATARS" value={avatars.length} tone="green" />
          <StatusChip label="CARDS" value={countsByKind.card || 0} tone="cyan" />
          <StatusChip label="PAGE" value={`${safePage + 1}/${pageCount}`} tone="orange" />
        </div>
      </header>

      <aside className="lore-source-rail hapa-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><Archive size={15} /> Sources</span>
          <em>{entries.length}</em>
        </div>
        <div className="lore-kind-stack" role="list" aria-label="Lore type filters">
          {LORE_KIND_FILTERS.map((filter) => {
            const Icon = filter.icon;
            const active = kindFilter === filter.id;
            return (
              <button
                key={filter.id}
                className={active ? "active" : ""}
                type="button"
                onClick={() => setFilter(filter.id)}
                aria-pressed={active}
              >
                <Icon size={15} />
                <span>{filter.label}</span>
                <output>{countsByKind[filter.id] || 0}</output>
              </button>
            );
          })}
        </div>

        <label className="lore-field">
          <span>Avatar lens</span>
          <select value={avatarFilter} onChange={(event) => setAvatarFilter(event.target.value)}>
            <option value="all">All avatars</option>
            <option value={selectedAvatarId || ""}>{currentAvatarName}</option>
            {avatarOptions.map((avatar) => (
              <option key={avatar.id} value={avatar.id}>{avatar.name}</option>
            ))}
          </select>
        </label>

        <label className="lore-field">
          <span>Sort</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
            {LORE_SORT_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>
        </label>

        <div className="section-head hapa-panel-head compact">
          <span><Sparkles size={15} /> Featured</span>
          <em>jump</em>
        </div>
        <div className="lore-featured-list">
          {featuredEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={selectedEntry?.id === entry.id ? "active" : ""}
              onClick={() => {
                setFilter(entry.kind);
                selectEntry(entry.id);
              }}
            >
              <strong>{entry.title}</strong>
              <span>{entry.typeLabel}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="lore-library-panel hapa-panel" data-variant="resting">
        <div className="lore-toolbar">
          <label className="search-box hapa-field">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search lore, tags, avatars, source refs"
            />
          </label>
          <div className="lore-page-controls">
            <button className="hapa-btn" type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={safePage <= 0}>
              <ChevronLeft size={15} /> Prev
            </button>
            <span>{safePage + 1} / {pageCount}</span>
            <button className="hapa-btn" type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={safePage >= pageCount - 1}>
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="lore-stream" role="list" aria-label="Filtered lore entries">
          {visibleEntries.length ? visibleEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`lore-entry-card hapa-card ${selectedEntry?.id === entry.id ? "selected" : ""}`}
              data-card-type={entry.cardType}
              data-state={selectedEntry?.id === entry.id ? "selected" : "idle"}
              onClick={() => selectEntry(entry.id)}
              role="listitem"
            >
              <span className="lore-entry-beam" aria-hidden="true" />
              <div className="lore-entry-head">
                <small>{entry.typeLabel}</small>
                <output>{entry.readTime} min</output>
              </div>
              <strong>{entry.title}</strong>
              <p>{entry.summary}</p>
              <div className="lore-entry-meta">
                {entry.avatarNames.slice(0, 2).map((name) => <span key={`${entry.id}-${name}`}>{name}</span>)}
                {entry.dateLabel ? <span>{entry.dateLabel}</span> : null}
                <span>{entry.wordCount} words</span>
              </div>
              <div className="lore-entry-tags">
                {entry.tags.slice(0, 5).map((tag) => <span key={`${entry.id}-${tag}`}>{tag}</span>)}
              </div>
            </button>
          )) : (
            <div className="lore-empty-state hapa-panel" data-variant="notch">
              <Search size={28} />
              <strong>No lore entries match that filter</strong>
              <span>Clear the query or switch source lanes.</span>
            </div>
          )}
        </div>
      </section>

      <aside className="lore-reader-detail hapa-panel" data-variant="notch" ref={readerTopRef}>
        {selectedEntry ? (
          <>
            <div className="lore-detail-topline">
              <span>{selectedEntry.typeLabel}</span>
              <output>{selectedEntry.wordCount} words · {selectedEntry.readTime} min</output>
            </div>
            <h2>{selectedEntry.title}</h2>
            <p className="lore-detail-summary">{selectedEntry.summary}</p>

            <div className="lore-detail-actions">
              {selectedEntry.avatarIds.length ? (
                <button className="hapa-btn" type="button" data-intent="primary" onClick={() => onSelectAvatar?.(selectedEntry.avatarIds[0])}>
                  <Users size={14} /> Open Avatar
                </button>
              ) : null}
              <button className="hapa-btn" type="button" onClick={() => navigator.clipboard?.writeText(selectedEntry.body)}>
                <Clipboard size={14} /> Copy Text
              </button>
            </div>

            <div className="lore-passage-frame">
              <div className="lore-passage-head">
                <span>Passage {Math.min(segmentIndex + 1, segments.length)} of {segments.length}</span>
                <output>{activeSegment?.wordCount || 0} words</output>
              </div>
              <div className="lore-passage-body">
                {activeSegment ? renderLoreParagraphs(activeSegment.text) : <p>No readable text is available for this entry yet.</p>}
              </div>
              <div className="lore-passage-controls">
                <button className="hapa-btn" type="button" onClick={() => jumpSegment(-1)} disabled={segmentIndex <= 0}>
                  <ChevronLeft size={15} /> Previous
                </button>
                <button className="hapa-btn" type="button" onClick={() => jumpSegment(1)} disabled={segmentIndex >= segments.length - 1}>
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="lore-segment-map" aria-label="Passage map">
              {segments.map((segment, index) => (
                <button
                  key={segment.id}
                  type="button"
                  className={index === segmentIndex ? "active" : ""}
                  onClick={() => setSegmentIndex(index)}
                  aria-label={`Open passage ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <div className="lore-detail-tags">
              {selectedEntry.tags.slice(0, 18).map((tag) => <span key={`${selectedEntry.id}-detail-${tag}`}>{tag}</span>)}
            </div>

            <details className="lore-full-text">
              <summary>Full text and provenance</summary>
              <div className="lore-full-text-body">
                {renderLoreParagraphs(selectedEntry.body)}
              </div>
              <div className="lore-source-refs">
                {selectedEntry.sourceRefs.length ? selectedEntry.sourceRefs.map((ref, index) => (
                  <span key={`${selectedEntry.id}-ref-${index}`}>{ref.label || "source"} · {ref.uri || ref}</span>
                )) : <span>source: live Avatar Builder store</span>}
              </div>
            </details>
          </>
        ) : (
          <div className="lore-empty-state">
            <Archive size={30} />
            <strong>No lore selected</strong>
          </div>
        )}
      </aside>
    </section>
  );
}

function buildLoreReaderEntries({ avatars = [], itemCards = [], sceneGraph = {}, board = {} }) {
  const entries = [];
  const avatarNameById = new Map(avatars.map((avatar) => [avatar.id, avatar.primaryName || avatar.names?.[0]?.name || avatar.id]));

  function addEntry(entry) {
    const body = cleanLoreText(entry.body || entry.summary || "");
    if (!body || countLoreWords(body) < 3) return;
    const avatarIds = uniqueTextList(entry.avatarIds || []);
    const avatarNames = uniqueTextList([
      ...(entry.avatarNames || []),
      ...avatarIds.map((avatarId) => avatarNameById.get(avatarId)).filter(Boolean)
    ]);
    const tags = uniqueTextList(entry.tags || []);
    const sourceRefs = normalizeLoreSourceRefs(entry.sourceRefs || []);
    const summary = compactLoreText(entry.summary || firstLoreParagraph(body), 260);
    const wordCount = countLoreWords(body);
    const normalized = {
      id: entry.id,
      kind: entry.kind || "context",
      cardType: entry.cardType || cardTypeForLoreKind(entry.kind, tags),
      typeLabel: entry.typeLabel || titleCaseWords(entry.kind || "context"),
      title: compactLoreText(entry.title || "Untitled lore", 96),
      subtitle: entry.subtitle || "",
      summary,
      body,
      avatarIds,
      avatarNames,
      tags,
      sourceRefs,
      dateLabel: entry.dateLabel || "",
      sortRank: Number(entry.sortRank ?? loreKindRank(entry.kind)),
      sortOrder: Number(entry.sortOrder ?? 0),
      updatedAt: entry.updatedAt || "",
      featured: Boolean(entry.featured),
      wordCount,
      readTime: Math.max(1, Math.ceil(wordCount / 220))
    };
    normalized.searchText = [
      normalized.title,
      normalized.subtitle,
      normalized.summary,
      normalized.body,
      normalized.typeLabel,
      normalized.dateLabel,
      normalized.avatarNames.join(" "),
      normalized.tags.join(" "),
      normalized.sourceRefs.map((ref) => `${ref.label || ""} ${ref.uri || ""}`).join(" ")
    ].join(" ").toLowerCase();
    entries.push(normalized);
  }

  if (balladOfBellaPacket?.source?.rawText) {
    addEntry({
      id: "lore-source-ballad-of-bella-v2",
      kind: "saga",
      cardType: "lore",
      typeLabel: "Source Packet",
      title: "Ballad of Bella v2",
      summary: "Expanded source for the Root-Key Song, Association Continuity, Lana Key, Go Navy, START, Three Harbors, Queen Bees, and Side-Character inversion doctrine.",
      body: [
        balladOfBellaPacket.objective,
        balladOfBellaPacket.source.rawText,
        "Mechanics",
        ...(balladOfBellaPacket.mechanics || []).map((mechanic) => `${mechanic.title}: ${mechanic.summary} ${mechanic.convention} ${mechanic.storyUse}`)
      ].filter(Boolean).join("\n\n"),
      tags: ["ballad-of-bella-v2", "root-key-song", "association-continuity", "bella-calder", "saga"],
      sourceRefs: balladOfBellaPacket.sourceRefs || [],
      updatedAt: balladOfBellaPacket.generatedAt,
      sortRank: 0,
      featured: true
    });
  }

  for (const card of itemCards || []) {
    const cardBody = uniqueTextList([
      card.summary,
      card.description,
      card.lore,
      ...(Array.isArray(card.utility) ? card.utility : []),
      ...(Array.isArray(card.broadGameMechanics) ? card.broadGameMechanics : []),
      card.tarotCard?.cardFace?.coreMeaning,
      card.tarotCard?.cardFace?.uprightText,
      card.tarotCard?.cardFace?.mechanicsText,
      card.tarotCard?.lore?.summary,
      card.tarotCard?.lore?.protocolTeaching,
      card.tarotCard?.lore?.futureSeed
    ]).join("\n\n");
    if (!cardBody) continue;
    const cardTags = uniqueTextList([
      card.kind,
      card.cardType,
      card.rank,
      card.quality?.qualityRank,
      ...(card.tags || []),
      ...(card.tarotCard?.keywords || [])
    ]);
    const avatarIds = uniqueTextList(card.connections?.avatarIds || []);
    addEntry({
      id: `lore-card-${card.id}`,
      kind: "card",
      cardType: cardTypeForLoreKind("card", cardTags),
      typeLabel: titleCaseWords(String(card.cardType || card.kind || "card").replace(/_/g, " ")),
      title: card.title || card.name || card.id,
      summary: card.summary || card.description || card.tarotCard?.lore?.summary || cardBody,
      body: cardBody,
      avatarIds,
      tags: cardTags,
      sourceRefs: card.sourceRefs || [],
      updatedAt: card.updatedAt || card.createdAt,
      sortRank: String(card.id || "").startsWith("ballad-of-bella-") ? 4 : 18,
      featured: String(card.id || "").startsWith("ballad-of-bella-")
    });
  }

  for (const avatarRaw of avatars || []) {
    const avatar = normalizeAvatarCard(avatarRaw);
    const avatarName = avatar.primaryName || avatar.id;
    const mind = normalizeAvatarMind(avatar.mind, avatar);
    const personaBody = uniqueTextList([
      mind.personaAnchor.identityStatement,
      mind.personaAnchor.wants,
      mind.personaAnchor.fears,
      mind.personaAnchor.misunderstandings,
      mind.personaAnchor.willNotSayDirectly,
      mind.personaAnchor.carriedForward,
      mind.soulSeed.soulThesis,
      mind.placementBackstorySeed.prompt
    ]).join("\n\n");
    addEntry({
      id: `lore-avatar-persona-${avatar.id}`,
      kind: "context",
      cardType: "avatar",
      typeLabel: "Avatar Dossier",
      title: `${avatarName} Persona Anchor`,
      summary: mind.personaAnchor.identityStatement || `${avatarName} avatar persona and role context.`,
      body: personaBody,
      avatarIds: [avatar.id],
      tags: ["avatar", "persona", avatarName, mind.gardenNodeAssignment.teamTitle, mind.gardenNodeAssignment.role],
      updatedAt: mind.personaAnchor.updatedAt,
      sortRank: 14
    });

    for (const entry of mind.journal || []) {
      if (entry.status === "tombstone") continue;
      const journalType = entry.journalType || "journal";
      const isWeekly = journalType === "weekly-five-page-reflective-narrative";
      const isBallad = journalType === "ballad-of-bella-lore-addendum";
      const isAnnual = journalType === "annual-life-canon";
      addEntry({
        id: `lore-journal-${avatar.id}-${entry.id}`,
        kind: "journal",
        cardType: "lore",
        typeLabel: isBallad ? "Ballad Addendum" : isWeekly ? "Weekly Journal" : isAnnual ? "Life Journal" : titleCaseWords(journalType.replace(/-/g, " ")),
        title: isBallad
          ? `${avatarName} · Ballad of Bella Addendum`
          : isWeekly
            ? `${avatarName} · Week ${String(entry.weekIndex || 0).padStart(3, "0")} · ${entry.weeklyArc?.title || entry.dateOrSequenceMarker || "Weekly Canon"}`
            : isAnnual
              ? `${avatarName} · Life Year ${entry.lifeYear}`
              : `${avatarName} · ${entry.dateOrSequenceMarker || journalType}`,
        summary: entry.publicSummary || entry.weeklyArc?.forwardSeed || firstLoreParagraph(entry.privateEntry),
        body: entry.privateEntry || entry.publicSummary,
        avatarIds: uniqueTextList([avatar.id, ...(entry.mentionedAvatarIds || []), ...(entry.affectedAvatarIds || [])]),
        avatarNames: entry.mentionedAvatarNames || [],
        tags: [
          journalType,
          entry.canonStatus,
          entry.causalityStatus,
          entry.criticStatus,
          entry.linkedTeamTitle,
          entry.linkedRole,
          ...(entry.familyTags || []),
          ...(entry.placeTags || []),
          ...(entry.itemTags || []),
          ...(entry.sceneTags || []),
          ...(entry.eventTags || []),
          ...(entry.lexiconTerms || []),
          ...(entry.skillTags || []),
          ...(entry.responsibilityTags || [])
        ],
        sourceRefs: entry.sourceRefs || [],
        dateLabel: entry.weekStartDate || entry.dateOrSequenceMarker || (entry.calendarYear ? String(entry.calendarYear) : ""),
        sortRank: isBallad ? 2 : isAnnual ? 22 : isWeekly ? 28 : 25,
        sortOrder: isWeekly ? Number(entry.weekIndex || 0) : isAnnual ? Number(entry.lifeYear || 0) : Number(entry.calendarYear || 0),
        updatedAt: entry.updatedAt || entry.createdAt,
        featured: isBallad
      });
    }

    const activeMemories = (mind.memoryLedger || []).filter((memory) => memory.status !== "tombstone" && memory.summary);
    if (activeMemories.length) {
      addEntry({
        id: `lore-memory-digest-${avatar.id}`,
        kind: "memory",
        cardType: "avatar",
        typeLabel: "Memory Digest",
        title: `${avatarName} Memory Ledger`,
        summary: `${activeMemories.length} memory ledger entries collected for ${avatarName}.`,
        body: activeMemories.map((memory, index) => [
          `${index + 1}. ${memory.summary}`,
          memory.classification ? `Class: ${memory.classification}` : "",
          Number.isFinite(Number(memory.emotionalWeight)) ? `Emotional weight: ${memory.emotionalWeight}` : "",
          memory.confidence ? `Confidence: ${memory.confidence}` : ""
        ].filter(Boolean).join("\n")).join("\n\n"),
        avatarIds: [avatar.id],
        tags: ["memory", "digest", avatarName, ...activeMemories.flatMap((memory) => [memory.classification, memory.confidence, memory.visibility])],
        updatedAt: activeMemories[0]?.updatedAt || activeMemories[0]?.createdAt,
        sortRank: 48
      });
    }

    const activeContexts = (mind.contextMap || []).filter((context) => context.status !== "tombstone" && (context.publicSummary || context.avatarBelief || context.label || context.contextId));
    if (activeContexts.length) {
      addEntry({
        id: `lore-context-digest-${avatar.id}`,
        kind: "context",
        cardType: "protocol",
        typeLabel: "Context Digest",
        title: `${avatarName} Context Map`,
        summary: `${activeContexts.length} context mappings collected for ${avatarName}.`,
        body: activeContexts.map((context, index) => [
          `${index + 1}. ${context.label || context.contextId || "Context"}`,
          context.publicSummary,
          context.avatarBelief,
          context.kind ? `Kind: ${context.kind}` : "",
          context.contextId ? `Context id: ${context.contextId}` : ""
        ].filter(Boolean).join("\n")).join("\n\n"),
        avatarIds: [avatar.id],
        tags: ["context", "digest", avatarName, ...activeContexts.flatMap((context) => [context.kind, context.classification, context.confidence, context.contextId])],
        updatedAt: activeContexts[0]?.updatedAt || activeContexts[0]?.createdAt,
        sortRank: activeContexts.some((context) => String(context.contextId || "").includes("ballad-of-bella")) ? 5 : 42,
        featured: activeContexts.some((context) => String(context.contextId || "").includes("ballad-of-bella"))
      });
    }

    const activeFacts = (mind.selfKnowledge || []).filter((fact) => fact.status !== "tombstone" && (fact.value || fact.label));
    if (activeFacts.length) {
      addEntry({
        id: `lore-self-knowledge-digest-${avatar.id}`,
        kind: "context",
        cardType: "resource",
        typeLabel: "Self Knowledge Digest",
        title: `${avatarName} Self Knowledge`,
        summary: `${activeFacts.length} self-knowledge facts collected for ${avatarName}.`,
        body: activeFacts.map((fact, index) => [
          `${index + 1}. ${fact.label || "Fact"}`,
          fact.value,
          fact.classification ? `Class: ${fact.classification}` : "",
          fact.source ? `Source: ${fact.source}` : ""
        ].filter(Boolean).join("\n")).join("\n\n"),
        avatarIds: [avatar.id],
        tags: ["fact", "digest", avatarName, ...activeFacts.flatMap((fact) => [fact.label, fact.classification, fact.confidence, fact.visibility])],
        sourceRefs: activeFacts.flatMap((fact) => fact.sourceRefs || [fact.source].filter(Boolean)).slice(0, 20),
        updatedAt: activeFacts[0]?.updatedAt || activeFacts[0]?.createdAt,
        sortRank: activeFacts.some((fact) => String(fact.id || "").includes("ballad-of-bella")) ? 6 : 44
      });
    }
  }

  for (const place of sceneGraph.places || []) {
    addEntry({
      id: `lore-place-${place.id}`,
      kind: "scene",
      cardType: "node",
      typeLabel: "Place Lore",
      title: place.name || place.id,
      summary: place.summary || place.lore,
      body: [place.summary, place.lore].filter(Boolean).join("\n\n"),
      avatarIds: place.avatarIds || [],
      tags: ["place", place.type, ...(place.tags || [])],
      updatedAt: place.updatedAt || place.createdAt,
      sortRank: String(place.id || "").includes("bella") ? 7 : 34
    });
  }

  for (const scene of sceneGraph.scenes || []) {
    addEntry({
      id: `lore-scene-${scene.id}`,
      kind: "scene",
      cardType: "node",
      typeLabel: "Scene",
      title: scene.title || scene.id,
      summary: scene.summary || scene.narrativeText,
      body: [
        scene.summary,
        scene.narrativeText,
        ...(scene.expositionBeats || []),
        ...(scene.actionBeats || [])
      ].filter(Boolean).join("\n\n"),
      avatarIds: scene.avatarIds || [],
      tags: ["scene", scene.placeId, ...(scene.tags || [])],
      dateLabel: scene.canonicalTime?.label || "",
      sortOrder: Number(scene.canonicalTime?.order || 0),
      updatedAt: scene.updatedAt || scene.createdAt,
      sortRank: String(scene.id || "").includes("ballad-of-bella") ? 7 : 32,
      featured: String(scene.id || "").includes("ballad-of-bella")
    });
  }

  const boardCards = (board.lanes || []).flatMap((lane) => (lane.cards || []).map((card) => ({ ...card, laneTitle: lane.title })));
  const loreBoardCards = boardCards.filter((card) => /lore|bella|journal|saga|canon/i.test(`${card.title} ${card.body} ${card.tags?.join(" ")}`));
  if (loreBoardCards.length) {
    addEntry({
      id: "lore-production-board-summary",
      kind: "context",
      cardType: "quest",
      typeLabel: "Lore Workboard",
      title: "Lore Production Board",
      summary: `${loreBoardCards.length} lore-adjacent kanban tasks are visible in the local board state.`,
      body: loreBoardCards.map((card) => `${card.laneTitle || "Lane"} / ${card.status || "status"}: ${card.title}\n${card.body || ""}`).join("\n\n"),
      tags: ["kanban", "lore-production", "board"],
      sortRank: 50
    });
  }

  return entries;
}

function compareLoreEntries(a, b, sortMode) {
  if (sortMode === "newest") return dateScore(b.updatedAt) - dateScore(a.updatedAt) || a.title.localeCompare(b.title);
  if (sortMode === "timeline") return a.sortOrder - b.sortOrder || a.sortRank - b.sortRank || a.title.localeCompare(b.title);
  if (sortMode === "avatar") {
    const avatarCompare = (a.avatarNames[0] || "").localeCompare(b.avatarNames[0] || "");
    return avatarCompare || a.sortRank - b.sortRank || a.title.localeCompare(b.title);
  }
  return a.sortRank - b.sortRank || dateScore(b.updatedAt) - dateScore(a.updatedAt) || a.title.localeCompare(b.title);
}

function splitLoreIntoSegments(value = "") {
  const text = cleanLoreText(value);
  if (!text) return [];
  const preparedBlocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => countLoreWords(block) > 360 ? splitLongLoreBlock(block) : [block]);
  const segments = [];
  let current = [];
  let currentWords = 0;
  const maxWords = 240;
  for (const block of preparedBlocks.length ? preparedBlocks : [text]) {
    const blockWords = countLoreWords(block);
    if (current.length && currentWords + blockWords > maxWords) {
      segments.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }
    current.push(block);
    currentWords += blockWords;
  }
  if (current.length) segments.push(current.join("\n\n"));
  return segments.map((segment, index) => ({
    id: `segment-${index + 1}`,
    text: segment,
    wordCount: countLoreWords(segment)
  }));
}

function splitLongLoreBlock(block) {
  const sentences = block.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  if (sentences.length < 2) return [block];
  const chunks = [];
  let current = [];
  let words = 0;
  for (const sentence of sentences) {
    const sentenceWords = countLoreWords(sentence);
    if (current.length && words + sentenceWords > 220) {
      chunks.push(current.join(" "));
      current = [];
      words = 0;
    }
    current.push(sentence);
    words += sentenceWords;
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

function renderLoreParagraphs(value = "") {
  return cleanLoreText(value)
    .split(/\n\s*\n/)
    .map((block, index) => {
      const text = block.trim();
      if (!text) return null;
      if (/^#{1,4}\s+/.test(text)) return <h3 key={index}>{text.replace(/^#{1,4}\s+/, "")}</h3>;
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line))) {
        return (
          <ul key={index}>
            {lines.map((line) => <li key={line}>{line.replace(/^[-*]\s+/, "")}</li>)}
          </ul>
        );
      }
      return <p key={index}>{text}</p>;
    });
}

function normalizeLoreSourceRefs(sourceRefs = []) {
  if (!Array.isArray(sourceRefs)) return normalizeLoreSourceRefs([sourceRefs]);
  return sourceRefs
    .map((ref) => {
      if (!ref) return null;
      if (typeof ref === "string") return { label: "source", uri: ref };
      return {
        label: ref.label || ref.title || ref.name || "source",
        uri: ref.uri || ref.path || ref.sourcePath || ref.source_path || "",
        confidence: ref.confidence || ""
      };
    })
    .filter((ref) => ref && (ref.label || ref.uri));
}

function cardTypeForLoreKind(kind = "context", tags = []) {
  const text = [kind, ...tags].join(" ").toLowerCase();
  if (/skill/.test(text)) return "skill";
  if (/protocol|tarot/.test(text)) return "protocol";
  if (/avatar|memory|journal/.test(text)) return "avatar";
  if (/scene|place|node/.test(text)) return "node";
  if (/media|song|video/.test(text)) return "media";
  if (/quest|kanban|board/.test(text)) return "quest";
  return "lore";
}

function loreKindRank(kind = "context") {
  return { saga: 0, card: 18, journal: 26, scene: 34, memory: 48, context: 52 }[kind] ?? 60;
}

function uniqueTextList(values = []) {
  return [...new Set((values || [])
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => value === undefined || value === null ? "" : String(value).trim())
    .filter(Boolean))];
}

function cleanLoreText(value = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u2028/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function firstLoreParagraph(value = "") {
  return cleanLoreText(value).split(/\n\s*\n/).find(Boolean) || "";
}

function compactLoreText(value = "", maxLength = 180) {
  const text = cleanLoreText(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function countLoreWords(value = "") {
  return cleanLoreText(value).split(/\s+/).filter(Boolean).length;
}

function dateScore(value = "") {
  const score = Date.parse(value || "");
  return Number.isFinite(score) ? score : 0;
}

function titleCaseWords(value = "") {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function compactNumber(value = 0) {
  const number = Number(value) || 0;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${Math.round(number / 1000)}K`;
  return String(number);
}

function AvatarMindView({ avatar, avatars, mindPack, onPatch }) {
  const mind = normalizeAvatarMind(avatar.mind, avatar);
  const summary = mindPack.summary;
  const otherAvatars = avatars.filter((item) => item.id !== avatar.id);
  const activeJournal = mind.journal
    .filter((entry) => entry.status !== "tombstone")
    .sort((a, b) =>
      Number(a.lifeYear ?? 9999) - Number(b.lifeYear ?? 9999) ||
      Number(a.calendarYear || 0) - Number(b.calendarYear || 0) ||
      String(a.dateOrSequenceMarker || "").localeCompare(String(b.dateOrSequenceMarker || ""))
    );
  const annualJournal = activeJournal.filter((entry) => entry.journalType === "annual-life-canon");
  const journalYears = new Set(annualJournal.map((entry) => entry.lifeYear).filter((year) => Number.isFinite(Number(year)) && Number(year) >= 0));
  const reviewedNames = new Set(activeJournal.flatMap((entry) => entry.reviewedAvatarNames || []));

  function updatePersona(field, value) {
    onPatch({
      personaAnchor: {
        ...mind.personaAnchor,
        [field]: value,
        updatedAt: new Date().toISOString()
      }
    });
  }

  function updateCollection(collection, idField, id, patch, message = "") {
    onPatch({
      [collection]: mind[collection].map((item) =>
        item[idField] === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item
      )
    }, message);
  }

  function addCollectionItem(collection, item, message) {
    onPatch({ [collection]: [item, ...mind[collection]] }, message);
  }

  function tombstoneCollectionItem(collection, idField, id, message) {
    updateCollection(collection, idField, id, {
      classification: "tombstone",
      status: "tombstone"
    }, message);
  }

  async function copyMindPack() {
    await navigator.clipboard?.writeText(JSON.stringify(mindPack, null, 2));
  }

  return (
    <section className="mind-view">
      <div className="mind-command-header panel hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Avatar Mind And Relationships</p>
          <h2>{avatar.primaryName}</h2>
          <span>{AVATAR_MIND_VERSION}</span>
        </div>
        <div className="mind-readouts">
          <StatusChip label="FACTS" value={summary.counts.selfKnowledge} tone="cyan" />
          <StatusChip label="OTHERS" value={summary.counts.relationships} tone="fuchsia" />
          <StatusChip label="CONTEXT" value={summary.counts.context} tone="gold" />
          <StatusChip label="MEMORY" value={summary.counts.memories} tone="green" />
          <StatusChip label="JOURNAL" value={summary.counts.journalEntries || 0} tone="gold" />
          <StatusChip label="PHRASES" value={summary.counts.phraseCards || 0} tone="cyan" />
          <StatusChip label="SONGS" value={summary.counts.songCards || 0} tone="fuchsia" />
          <StatusChip label="COPIES" value={summary.counts.consciousnessCopies || 0} tone="green" />
          <StatusChip label="LOADOUT" value={(summary.counts.protocolCards || 0) + (summary.counts.skillCards || 0)} tone="gold" />
          <StatusChip label="TOMBS" value={summary.counts.tombstones} tone="orange" />
        </div>
      </div>

      <section className="mind-pane mind-persona panel hapa-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><Brain size={15} /> Persona Anchor</span>
          <em>{mind.personaAnchor.updatedAt?.slice(0, 10) || "seed"}</em>
        </div>
        <MindTextField label="Identity statement" value={mind.personaAnchor.identityStatement} onChange={(value) => updatePersona("identityStatement", value)} rows={3} />
        <div className="mind-two-up">
          <MindTextField label="Wants" value={mind.personaAnchor.wants} onChange={(value) => updatePersona("wants", value)} rows={3} />
          <MindTextField label="Fears" value={mind.personaAnchor.fears} onChange={(value) => updatePersona("fears", value)} rows={3} />
          <MindTextField label="Misunderstands" value={mind.personaAnchor.misunderstandings} onChange={(value) => updatePersona("misunderstandings", value)} rows={3} />
          <MindTextField label="Will not say directly" value={mind.personaAnchor.willNotSayDirectly} onChange={(value) => updatePersona("willNotSayDirectly", value)} rows={3} />
        </div>
        <MindTextField label="Carried forward" value={mind.personaAnchor.carriedForward} onChange={(value) => updatePersona("carriedForward", value)} rows={3} />

        <div className="section-head hapa-panel-head compact">
          <span><Radar size={15} /> Black Horizon Loadout</span>
          <em>{mind.gardenNodeAssignment.updatedAt?.slice(0, 10) || "seed"}</em>
        </div>
        <div className="mind-list compact">
          <article className="mind-record hapa-card" data-card-type="protocol" data-state="idle">
            <div className="mind-record-grid">
              <MindTextField label="Team" value={mind.gardenNodeAssignment.teamTitle || mind.shipCrewAssignment.teamTitle} onChange={(value) => onPatch({ gardenNodeAssignment: { ...mind.gardenNodeAssignment, teamTitle: value } })} />
              <MindTextField label="Garden" value={mind.gardenNodeAssignment.gardenName} onChange={(value) => onPatch({ gardenNodeAssignment: { ...mind.gardenNodeAssignment, gardenName: value } })} />
              <MindTextField label="Node" value={mind.gardenNodeAssignment.nodeName || mind.gardenNodeAssignment.nodeId} onChange={(value) => onPatch({ gardenNodeAssignment: { ...mind.gardenNodeAssignment, nodeName: value } })} />
              <MindTextField label="Ship" value={mind.gardenNodeAssignment.shipName || mind.shipCrewAssignment.vesselName} onChange={(value) => onPatch({ gardenNodeAssignment: { ...mind.gardenNodeAssignment, shipName: value } })} />
            </div>
            <MindTextField label="Placement seed" value={mind.placementBackstorySeed.prompt} onChange={(value) => onPatch({ placementBackstorySeed: { ...mind.placementBackstorySeed, prompt: value } })} rows={3} />
            <div className="mind-record-actions">
              <span>{summary.loadout.protocolCards.length} protocol cards</span>
              <span>{summary.loadout.skillCards.length} skill cards</span>
            </div>
          </article>
          {[...summary.loadout.protocolCards, ...summary.loadout.skillCards].length ? (
            [...summary.loadout.protocolCards, ...summary.loadout.skillCards].map((card) => (
              <article className="mind-memory-row" key={card.id}>
                <span>{card.title}</span>
                <output>{card.cardType}</output>
              </article>
            ))
          ) : <MindEmpty icon={<Tags size={22} />} label="No Protocol or Skill loadout cards yet" />}
        </div>

        <div className="section-head hapa-panel-head compact">
          <span><GitBranch size={15} /> Consciousness Link</span>
          <em>{mind.consciousnessContext.updatedAt?.slice(0, 10) || "seed"}</em>
        </div>
        <div className="mind-list compact">
          <article className="mind-record hapa-card" data-card-type="lore" data-state="idle">
            <div className="mind-record-grid">
              <MindTextField label="Mechanic" value={mind.consciousnessContext.mechanicId} onChange={(value) => onPatch({ consciousnessContext: { ...mind.consciousnessContext, mechanicId: value } })} />
              <MindTextField label="Prime role" value={mind.consciousnessContext.primeAvatar.horizonRole} onChange={(value) => onPatch({ consciousnessContext: { ...mind.consciousnessContext, primeAvatar: { ...mind.consciousnessContext.primeAvatar, horizonRole: value } } })} />
              <MindTextField label="Prime station" value={mind.consciousnessContext.primeAvatar.gardenName || mind.consciousnessContext.primeAvatar.shipName} onChange={(value) => onPatch({ consciousnessContext: { ...mind.consciousnessContext, primeAvatar: { ...mind.consciousnessContext.primeAvatar, gardenName: value } } })} />
              <MindTextField label="Message cadence" value={mind.consciousnessContext.messageTraffic.cadence} onChange={(value) => onPatch({ consciousnessContext: { ...mind.consciousnessContext, messageTraffic: { ...mind.consciousnessContext.messageTraffic, cadence: value } } })} />
            </div>
            <MindTextField label="Identity rule" value={mind.consciousnessContext.primeAvatar.identityContinuityRule} onChange={(value) => onPatch({ consciousnessContext: { ...mind.consciousnessContext, primeAvatar: { ...mind.consciousnessContext.primeAvatar, identityContinuityRule: value } } })} rows={2} />
            <MindTextField label="Merge consent" value={mind.consciousnessContext.messageTraffic.mergeConsentRule} onChange={(value) => onPatch({ consciousnessContext: { ...mind.consciousnessContext, messageTraffic: { ...mind.consciousnessContext.messageTraffic, mergeConsentRule: value } } })} rows={2} />
            <div className="mind-record-actions">
              <span>{summary.consciousnessCopies.length} colonial copies</span>
              <span>{mind.consciousnessContext.canonStatus || "canon status pending"}</span>
            </div>
          </article>
          {summary.consciousnessCopies.length ? (
            summary.consciousnessCopies.map((copy) => (
              <article className="mind-memory-row" key={copy.id}>
                <span>{copy.copyName}</span>
                <output>{copy.destination || copy.divergenceStatus || "seeded"}</output>
              </article>
            ))
          ) : <MindEmpty icon={<GitBranch size={22} />} label="No colonial consciousness copies yet" />}
        </div>

        <div className="section-head hapa-panel-head compact">
          <span><Music size={15} /> Dear Papa Songbook</span>
          <em>{mind.dearPapaSongContext.updatedAt?.slice(0, 10) || "seed"}</em>
        </div>
        <div className="mind-list compact">
          <article className="mind-record hapa-card" data-card-type="lore" data-state="idle">
            <div className="mind-record-grid">
              <MindTextField label="Album" value={mind.dearPapaSongContext.albumTitle} onChange={(value) => onPatch({ dearPapaSongContext: { ...mind.dearPapaSongContext, albumTitle: value } })} />
              <MindTextField label="Author" value={mind.dearPapaSongContext.author} onChange={(value) => onPatch({ dearPapaSongContext: { ...mind.dearPapaSongContext, author: value } })} />
              <MindTextField label="Singer lens" value={mind.dearPapaSongContext.performancePerspective.avatarName || mind.dearPapaSongContext.performancePerspective.teamColor} onChange={(value) => onPatch({ dearPapaSongContext: { ...mind.dearPapaSongContext, performancePerspective: { ...mind.dearPapaSongContext.performancePerspective, avatarName: value } } })} />
              <MindTextField label="Lore status" value={mind.dearPapaSongContext.loreStatus} onChange={(value) => onPatch({ dearPapaSongContext: { ...mind.dearPapaSongContext, loreStatus: value } })} />
            </div>
            <MindTextField label="Authorship rule" value={mind.dearPapaSongContext.authorshipRule} onChange={(value) => onPatch({ dearPapaSongContext: { ...mind.dearPapaSongContext, authorshipRule: value } })} rows={2} />
            <MindTextField label="Genesis use" value={mind.dearPapaSongContext.genesisUse.join(", ")} onChange={(value) => onPatch({ dearPapaSongContext: { ...mind.dearPapaSongContext, genesisUse: value.split(",").map((item) => item.trim()).filter(Boolean) } })} rows={2} />
            <div className="mind-record-actions">
              <span>{summary.loadout.songCards.length} selected song cards</span>
              <span>{mind.dearPapaSongContext.songCardIndexPath || "song card index pending"}</span>
            </div>
          </article>
          {summary.loadout.songCards.length ? (
            summary.loadout.songCards.map((card) => (
              <article className="mind-memory-row" key={card.id}>
                <span>{card.title}</span>
                <output>{card.perspective?.avatarName || card.perspective?.teamColor || "Songbook"}</output>
              </article>
            ))
          ) : <MindEmpty icon={<Music size={22} />} label="No Dear Papa song cards selected yet" />}
        </div>

        <div className="section-head hapa-panel-head compact">
          <span><Tags size={15} /> Self Knowledge</span>
          <button onClick={() => addCollectionItem("selfKnowledge", {
            id: `fact-${Date.now()}`,
            label: "New self fact",
            value: "",
            classification: "soft_canon",
            confidence: "soft",
            visibility: "private",
            source: "human-ui",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, "Self fact added")}>
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="mind-list">
          {mind.selfKnowledge.length ? mind.selfKnowledge.map((fact) => (
            <article className="mind-record hapa-card" data-card-type="resource" data-state={fact.status === "tombstone" ? "error" : "idle"} key={fact.id}>
              <div className="mind-record-grid">
                <MindTextField label="Label" value={fact.label} onChange={(value) => updateCollection("selfKnowledge", "id", fact.id, { label: value })} />
                <MindSelect label="Class" value={fact.classification} options={MIND_FACT_CLASSIFICATIONS} onChange={(value) => updateCollection("selfKnowledge", "id", fact.id, { classification: value })} />
                <MindSelect label="Confidence" value={fact.confidence} options={MIND_CONFIDENCE_LEVELS} onChange={(value) => updateCollection("selfKnowledge", "id", fact.id, { confidence: value })} />
                <MindSelect label="Visibility" value={fact.visibility} options={MIND_VISIBILITY_LEVELS} onChange={(value) => updateCollection("selfKnowledge", "id", fact.id, { visibility: value })} />
              </div>
              <MindTextField label="Value" value={fact.value} onChange={(value) => updateCollection("selfKnowledge", "id", fact.id, { value })} rows={3} />
              <div className="mind-record-actions">
                <span>{fact.source || "manual"}</span>
                <button className="hapa-btn" data-intent="danger" onClick={() => tombstoneCollectionItem("selfKnowledge", "id", fact.id, "Fact tombstoned")}>
                  <Trash2 size={13} /> Tombstone
                </button>
              </div>
            </article>
          )) : <MindEmpty icon={<Radar size={22} />} label="No self facts yet" />}
        </div>
      </section>

      <section className="mind-pane mind-relationships panel hapa-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><Users size={15} /> Relationship Map</span>
          <button onClick={() => addCollectionItem("relationships", {
            id: `relationship-${Date.now()}`,
            targetAvatarId: otherAvatars[0]?.id || "",
            targetName: otherAvatars[0]?.primaryName || "",
            relationLabel: "known-other",
            trust: 0,
            tension: 0,
            debt: 0,
            fear: 0,
            loyalty: 0,
            reason: "",
            classification: "relationship_delta",
            confidence: "soft",
            visibility: "private",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, "Relationship mapping added")}>
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="mind-list">
          {mind.relationships.length ? mind.relationships.map((relationship) => (
            <article className="mind-record hapa-card" data-card-type="avatar" data-state={relationship.status === "tombstone" ? "error" : "idle"} key={relationship.id}>
              <div className="mind-record-grid">
                <label>
                  <span>Target avatar</span>
                  <select
                    value={relationship.targetAvatarId}
                    onChange={(event) => {
                      const target = otherAvatars.find((item) => item.id === event.target.value);
                      updateCollection("relationships", "id", relationship.id, {
                        targetAvatarId: event.target.value,
                        targetName: target?.primaryName || relationship.targetName
                      });
                    }}
                  >
                    <option value="">Unlinked</option>
                    {otherAvatars.map((item) => <option key={item.id} value={item.id}>{item.primaryName}</option>)}
                  </select>
                </label>
                <MindTextField label="Target name" value={relationship.targetName} onChange={(value) => updateCollection("relationships", "id", relationship.id, { targetName: value })} />
                <MindTextField label="Label" value={relationship.relationLabel} onChange={(value) => updateCollection("relationships", "id", relationship.id, { relationLabel: value })} />
                <MindSelect label="Confidence" value={relationship.confidence} options={MIND_CONFIDENCE_LEVELS} onChange={(value) => updateCollection("relationships", "id", relationship.id, { confidence: value })} />
              </div>
              <div className="mind-metric-grid">
                {RELATIONSHIP_METRICS.map((metric) => (
                  <label className="mind-meter" key={metric}>
                    <span>{metric}</span>
                    <input
                      type="range"
                      min="-10"
                      max="10"
                      value={relationship[metric]}
                      onChange={(event) => updateCollection("relationships", "id", relationship.id, { [metric]: Number(event.target.value) })}
                    />
                    <output>{relationship[metric]}</output>
                  </label>
                ))}
              </div>
              <MindTextField label="Reason" value={relationship.reason} onChange={(value) => updateCollection("relationships", "id", relationship.id, { reason: value })} rows={3} />
              <div className="mind-record-actions">
                <MindSelect label="Class" value={relationship.classification} options={MIND_FACT_CLASSIFICATIONS} onChange={(value) => updateCollection("relationships", "id", relationship.id, { classification: value })} />
                <button className="hapa-btn" data-intent="danger" onClick={() => tombstoneCollectionItem("relationships", "id", relationship.id, "Relationship tombstoned")}>
                  <Trash2 size={13} /> Tombstone
                </button>
              </div>
            </article>
          )) : <MindEmpty icon={<Link2 size={22} />} label="No relationship mappings yet" />}
        </div>
      </section>

      <aside className="mind-pane mind-context panel hapa-panel" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><MapPin size={15} /> Context Map</span>
          <button onClick={() => addCollectionItem("contextMap", {
            id: `context-${Date.now()}`,
            contextId: "",
            label: "New context",
            kind: "scene",
            avatarBelief: "",
            publicSummary: "",
            classification: "perspective",
            confidence: "perspective",
            visibility: "private",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, "Context mapping added")}>
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="mind-list">
          {mind.contextMap.length ? mind.contextMap.map((context) => (
            <article className="mind-record hapa-card" data-card-type="protocol" data-state={context.status === "tombstone" ? "error" : "idle"} key={context.id}>
              <div className="mind-record-grid">
                <MindTextField label="Label" value={context.label} onChange={(value) => updateCollection("contextMap", "id", context.id, { label: value })} />
                <MindTextField label="Context id" value={context.contextId} onChange={(value) => updateCollection("contextMap", "id", context.id, { contextId: value })} />
                <MindSelect label="Kind" value={context.kind} options={CONTEXT_KINDS} onChange={(value) => updateCollection("contextMap", "id", context.id, { kind: value })} />
                <MindSelect label="Class" value={context.classification} options={MIND_FACT_CLASSIFICATIONS} onChange={(value) => updateCollection("contextMap", "id", context.id, { classification: value })} />
              </div>
              <MindTextField label="Avatar belief" value={context.avatarBelief} onChange={(value) => updateCollection("contextMap", "id", context.id, { avatarBelief: value })} rows={3} />
              <MindTextField label="Public summary" value={context.publicSummary} onChange={(value) => updateCollection("contextMap", "id", context.id, { publicSummary: value })} rows={3} />
              <div className="mind-record-actions">
                <MindSelect label="Confidence" value={context.confidence} options={MIND_CONFIDENCE_LEVELS} onChange={(value) => updateCollection("contextMap", "id", context.id, { confidence: value })} />
                <button className="hapa-btn" data-intent="danger" onClick={() => tombstoneCollectionItem("contextMap", "id", context.id, "Context tombstoned")}>
                  <Trash2 size={13} /> Tombstone
                </button>
              </div>
            </article>
          )) : <MindEmpty icon={<MapPin size={22} />} label="No context mappings yet" />}
        </div>

        <div className="section-head hapa-panel-head compact">
          <span><BookOpen size={15} /> Memory Ledger</span>
          <button onClick={() => addCollectionItem("memoryLedger", {
            memoryId: `memory-${Date.now()}`,
            summary: "New memory",
            emotionalWeight: 0,
            visibility: "private",
            confidence: "soft",
            classification: "memory_delta",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, "Memory entry added")}>
            <Plus size={13} /> Memory
          </button>
        </div>
        <div className="mind-list compact">
          {mind.memoryLedger.slice(0, 8).map((memory) => (
            <article className="mind-memory-row" key={memory.memoryId}>
              <MindTextField label="Memory" value={memory.summary} onChange={(value) => updateCollection("memoryLedger", "memoryId", memory.memoryId, { summary: value })} rows={2} />
              <label className="mind-meter">
                <span>weight</span>
                <input type="range" min="-10" max="10" value={memory.emotionalWeight} onChange={(event) => updateCollection("memoryLedger", "memoryId", memory.memoryId, { emotionalWeight: Number(event.target.value) })} />
                <output>{memory.emotionalWeight}</output>
              </label>
            </article>
          ))}
          {!mind.memoryLedger.length && <MindEmpty icon={<BookOpen size={22} />} label="No memory ledger entries yet" />}
        </div>

        <div className="section-head hapa-panel-head compact">
          <span><CalendarClock size={15} /> Journal Timeline</span>
          <button onClick={() => addCollectionItem("journal", {
            id: `journal-${Date.now()}`,
            journalType: "freeform",
            timelineId: "avatar-life-canon-timeline",
            timelineEventId: "",
            lifeYear: -1,
            age: -1,
            calendarYear: 0,
            relativeYear: "",
            dateOrSequenceMarker: new Date().toISOString().slice(0, 10),
            entryVoice: "in-character",
            privateEntry: "",
            publicSummary: "",
            classification: "perspective",
            canonStatus: "personal_canon_draft",
            causalityStatus: "causality-review-pending",
            reviewedAvatarIds: [],
            reviewedAvatarNames: [],
            linkedTeamId: mind.gardenNodeAssignment.teamId || mind.shipCrewAssignment.teamId,
            linkedTeamTitle: mind.gardenNodeAssignment.teamTitle || mind.shipCrewAssignment.teamTitle,
            linkedRole: mind.gardenNodeAssignment.role || mind.shipCrewAssignment.crewSeat,
            responsibilityTags: mind.gardenNodeAssignment.responsibilities || [],
            skillTags: [],
            sourceRefs: ["human-ui"],
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, "Journal entry added")}>
            <Plus size={13} /> Entry
          </button>
        </div>
        <div className="mind-journal-summary">
          <span>{annualJournal.length} annual entries</span>
          <span>{journalYears.size} life years</span>
          <span>{reviewedNames.size} reviewed avatars</span>
        </div>
        <div className="mind-journal-list">
          {activeJournal.length ? activeJournal.map((entry) => (
            <article className="mind-journal-entry hapa-card" data-card-type="lore" data-state={entry.status === "tombstone" ? "error" : "idle"} key={entry.id}>
              <div className="mind-journal-entry-head">
                <div>
                  <strong>{entry.dateOrSequenceMarker || `Life Year ${entry.lifeYear}`}</strong>
                  <span>{entry.journalType.replace(/-/g, " ")} · {entry.entryVoice}</span>
                </div>
                <output>{Number(entry.lifeYear) >= 0 ? `Y${String(entry.lifeYear).padStart(2, "0")}` : "FREE"}</output>
              </div>
              <div className="mind-journal-pills">
                {entry.calendarYear ? <span>{entry.calendarYear}</span> : null}
                {entry.relativeYear ? <span>{entry.relativeYear}</span> : null}
                {entry.canonStatus ? <span>{entry.canonStatus}</span> : null}
                {entry.causalityStatus ? <span>{entry.causalityStatus}</span> : null}
                {entry.linkedRole ? <span>{entry.linkedRole}</span> : null}
                {entry.weekIndex ? <span>Week -{entry.weekIndex}</span> : null}
                {entry.pageCount ? <span>{entry.pageCount}/{entry.pageTarget || 5} pages</span> : null}
                {entry.wordCount ? <span>{entry.wordCount} words</span> : null}
                {entry.criticStatus ? <span>{entry.criticStatus}</span> : null}
                {entry.paragraphCount ? <span>{entry.paragraphCount} paragraphs</span> : null}
              </div>
              <MindTextField label="Public summary" value={entry.publicSummary} onChange={(value) => updateCollection("journal", "id", entry.id, { publicSummary: value })} rows={2} />
              <MindTextField label="Journal entry" value={entry.privateEntry} onChange={(value) => updateCollection("journal", "id", entry.id, { privateEntry: value, paragraphCount: value.split(/\n\s*\n/).filter(Boolean).length })} rows={8} />
              <div className="mind-journal-meta">
                <span>Team: {entry.linkedTeamTitle || "unassigned"}</span>
                <span>Timeline: {entry.timelineId || "none"}</span>
                <span>Event: {entry.timelineEventId || "unregistered"}</span>
                {entry.weekStartDate || entry.weekEndDate ? <span>Week: {entry.weekStartDate || "open"} to {entry.weekEndDate || "open"}</span> : null}
                {entry.criticName ? <span>Critic: {entry.criticName}</span> : null}
                {entry.reviewCycleStatus ? <span>Review: {entry.reviewCycleStatus}</span> : null}
                {entry.criticNotes ? <span>Notes: {entry.criticNotes}</span> : null}
              </div>
              {(entry.reviewedAvatarNames || []).length ? (
                <div className="mind-journal-review">
                  {(entry.reviewedAvatarNames || []).map((name) => <span key={`${entry.id}-${name}`}>{name}</span>)}
                </div>
              ) : null}
              <div className="mind-journal-tags">
                {(entry.skillTags || []).slice(0, 8).map((tag) => <span key={`${entry.id}-skill-${tag}`}>{tag}</span>)}
                {(entry.responsibilityTags || []).slice(0, 8).map((tag) => <span key={`${entry.id}-resp-${tag}`}>{tag}</span>)}
                {(entry.mentionedAvatarNames || []).slice(0, 8).map((tag) => <span data-tag-kind="avatar" key={`${entry.id}-avatar-${tag}`}>{tag}</span>)}
                {(entry.familyTags || []).slice(0, 8).map((tag) => <span data-tag-kind="family" key={`${entry.id}-family-${tag}`}>{tag}</span>)}
                {(entry.placeTags || []).slice(0, 8).map((tag) => <span data-tag-kind="place" key={`${entry.id}-place-${tag}`}>{tag}</span>)}
                {(entry.itemTags || []).slice(0, 8).map((tag) => <span data-tag-kind="item" key={`${entry.id}-item-${tag}`}>{tag}</span>)}
                {(entry.lexiconTerms || []).slice(0, 8).map((tag) => <span data-tag-kind="lexicon" key={`${entry.id}-lexicon-${tag}`}>{tag}</span>)}
              </div>
              <div className="mind-record-actions">
                <MindSelect label="Class" value={entry.classification} options={MIND_FACT_CLASSIFICATIONS} onChange={(value) => updateCollection("journal", "id", entry.id, { classification: value })} />
                <button className="hapa-btn" data-intent="danger" onClick={() => tombstoneCollectionItem("journal", "id", entry.id, "Journal entry tombstoned")}>
                  <Trash2 size={13} /> Tombstone
                </button>
              </div>
            </article>
          )) : <MindEmpty icon={<CalendarClock size={22} />} label="No journal entries yet" />}
        </div>

        <div className="mind-pack-panel">
          <div className="section-head hapa-panel-head compact">
            <span><FileJson size={15} /> Mind Pack</span>
            <button onClick={copyMindPack}>Copy</button>
          </div>
          <DeferredJsonPre value={mindPack.summary} placeholder="Preparing mind summary..." />
        </div>
      </aside>
    </section>
  );
}

function BufferedTextInput(props) {
  return <BufferedTextControl as="input" {...props} />;
}

function BufferedTextArea(props) {
  return <BufferedTextControl as="textarea" {...props} />;
}

function BufferedTextControl({ as: Component, value, onCommit, debounceMs = 520, onBlur, ...props }) {
  const textValue = value == null ? "" : String(value);
  const [draft, setDraft] = useState(textValue);
  const draftRef = useRef(textValue);
  const committedRef = useRef(textValue);
  const commitRef = useRef(onCommit);
  const timerRef = useRef(0);
  const idleCancelRef = useRef(null);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (textValue === committedRef.current) return;
    committedRef.current = textValue;
    draftRef.current = textValue;
    setDraft(textValue);
  }, [textValue]);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    idleCancelRef.current?.();
  }, []);

  function cancelPendingCommit() {
    window.clearTimeout(timerRef.current);
    idleCancelRef.current?.();
    idleCancelRef.current = null;
  }

  function flush(nextValue = draftRef.current) {
    cancelPendingCommit();
    if (nextValue === committedRef.current) return;
    committedRef.current = nextValue;
    commitRef.current?.(nextValue);
  }

  function scheduleCommit(nextValue) {
    cancelPendingCommit();
    timerRef.current = window.setTimeout(() => {
      idleCancelRef.current = scheduleIdleTask(() => {
        idleCancelRef.current = null;
        flush(nextValue);
      }, 520);
    }, debounceMs);
  }

  return (
    <Component
      {...props}
      value={draft}
      onChange={(event) => {
        const nextValue = event.target.value;
        draftRef.current = nextValue;
        setDraft(nextValue);
        scheduleCommit(nextValue);
      }}
      onBlur={(event) => {
        flush(event.target.value);
        onBlur?.(event);
      }}
    />
  );
}

function MindTextField({ label, value, onChange, rows = 1 }) {
  const field = rows > 1
    ? <BufferedTextArea rows={rows} value={value || ""} onCommit={onChange} />
    : <BufferedTextInput value={value || ""} onCommit={onChange} />;
  return (
    <label className="mind-field">
      <span>{label}</span>
      {field}
    </label>
  );
}

function MindSelect({ label, value, options, onChange }) {
  return (
    <label className="mind-field">
      <span>{label}</span>
      <select value={value || options[0]} onChange={(event) => onChange(event.target.value)}>
        {options.map((optionValue) => <option key={optionValue} value={optionValue}>{optionValue}</option>)}
      </select>
    </label>
  );
}

function MindEmpty({ icon, label }) {
  return (
    <div className="mind-empty hapa-panel" data-variant="resting">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function UploadProcessingOverlay({ jobs }) {
  return (
    <aside className="upload-queue" aria-live="polite">
      {jobs.map((job) => (
        <article className="upload-job-card hapa-card" data-state={job.status === "complete" ? "complete" : "channeling"} key={job.id}>
          <div className="upload-orbit">
            {job.status === "complete" ? <CheckCircle2 size={19} /> : <Loader2 size={19} />}
          </div>
          <div className="upload-job-body">
            <div>
              <strong>{job.label}</strong>
              <span>{job.completed}/{job.total}</span>
            </div>
            <p>{job.stage}</p>
            <small>{job.detail}</small>
            <ProgressBar value={job.percent} />
          </div>
        </article>
      ))}
    </aside>
  );
}

function ScenesWorkflowView({
  graph,
  audit,
  avatars,
  places,
  scenesForPlace,
  selectedPlace,
  selectedScene,
  selectedSceneAsset,
  selectedSceneAssetId,
  attachPack,
  onCreatePlace,
  onCreateScene,
  onSelectPlace,
  onSelectScene,
  onUpdatePlace,
  onUpdateScene,
  onUpdateTimeline,
  onDropMedia,
  onSelectAsset,
  onExpand,
  onDeleteAsset,
  onToggleAvatar,
  onAvatarRole,
  onTagMediaAvatar,
  onAddPlaylistTrack
}) {
  const selectedSceneAudit = audit.byScene.find((item) => item.id === selectedScene?.id);
  const timeline = graph.timelines.find((item) => item.id === selectedScene?.canonicalTime?.timelineId || selectedScene?.timelineId) || graph.timelines[0];

  return (
    <section className="scenes-workflow-view">
      <div className="scene-command-header panel hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">World Assembly</p>
          <h2>{selectedScene?.title || "Scene Workflow"}</h2>
          <span>{selectedPlace?.name || "No place"} / {timeline?.name || "Canonical Timeline"}</span>
        </div>
        <div className="scene-readouts">
          <StatusChip label="PLACES" value={audit.places} tone="green" />
          <StatusChip label="SCENES" value={audit.scenes} tone="gold" />
          <StatusChip label="EPISODES" value={audit.episodes || 0} tone="cyan" />
          <StatusChip label="VOLUMES" value={audit.volumes || 0} tone="fuchsia" />
          <StatusChip label="PLACE CARDS" value={audit.placeCards || 0} tone="green" />
          <StatusChip label="MEDIA" value={audit.media} tone="fuchsia" />
          <StatusChip label="CAST" value={audit.avatarTags} tone="cyan" />
          <StatusChip label="SONGS" value={audit.playlistTracks} tone="orange" />
        </div>
      </div>

      <aside className="panel hapa-panel place-rail" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><MapPin size={15} /> Places</span>
          <button type="button" onClick={onCreatePlace}>New</button>
        </div>
        <div className="place-list">
          {places.map((place) => (
            <button
              className={`place-row hapa-card ${place.id === selectedPlace?.id ? "active" : ""}`}
              data-card-type="resource"
              data-granularity="mini"
              data-state={place.id === selectedPlace?.id ? "selected" : "idle"}
              key={place.id}
              onClick={() => onSelectPlace(place.id)}
            >
              <MapPin size={16} />
              <span>
                <strong>{place.name}</strong>
                <small>{place.type} / {graph.scenes.filter((scene) => scene.placeId === place.id).length} scenes / {(place.avatarIds || []).length} avatars</small>
              </span>
            </button>
          ))}
        </div>

        {selectedPlace && (
          <form className="place-editor hapa-panel" data-variant="resting" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>Place name</span>
              <BufferedTextInput value={selectedPlace.name} onCommit={(value) => onUpdatePlace({ name: value })} />
            </label>
            <label>
              <span>Place type</span>
              <select value={selectedPlace.type} onChange={(event) => onUpdatePlace({ type: event.target.value })}>
                {PLACE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span>Place tags</span>
              <BufferedTextInput value={(selectedPlace.tags || []).join(", ")} onCommit={(value) => onUpdatePlace({ tags: splitTagInput(value) })} />
            </label>
            <label>
              <span>Place summary</span>
              <BufferedTextArea value={selectedPlace.summary || ""} onCommit={(value) => onUpdatePlace({ summary: value })} />
            </label>
            <label>
              <span>Place lore</span>
              <BufferedTextArea value={selectedPlace.lore || ""} onCommit={(value) => onUpdatePlace({ lore: value, placeCard: { ...(selectedPlace.placeCard || {}), lore: value } })} />
            </label>
            <label>
              <span>Visual description</span>
              <BufferedTextArea value={selectedPlace.visualDescription || ""} onCommit={(value) => onUpdatePlace({ visualDescription: value, placeCard: { ...(selectedPlace.placeCard || {}), visualDescription: value } })} />
            </label>
            <label>
              <span>Image prompt</span>
              <BufferedTextArea value={selectedPlace.imagePrompt || selectedPlace.placeCard?.imagePrompt || ""} onCommit={(value) => onUpdatePlace({ imagePrompt: value, placeCard: { ...(selectedPlace.placeCard || {}), imagePrompt: value } })} />
            </label>
          </form>
        )}
      </aside>

      <section className="scene-stage">
        <div className="scene-list-panel panel hapa-panel" data-variant="notch">
          <div className="section-head hapa-panel-head">
            <span><Clapperboard size={15} /> Scenes In Place</span>
            <button type="button" onClick={onCreateScene}>New Scene</button>
          </div>
          <div className="scene-row-list">
            {scenesForPlace.map((scene) => (
              <button
                className={`scene-row hapa-card ${scene.id === selectedScene?.id ? "selected" : ""}`}
                data-card-type="lore"
                data-granularity="mini"
                data-state={scene.id === selectedScene?.id ? "selected" : "idle"}
                key={scene.id}
                onClick={() => onSelectScene(scene.id)}
              >
                <CalendarClock size={16} />
                <span>
                  <strong>{scene.title}</strong>
                  <small>{scene.canonicalTime?.label || "beat"} / {scene.avatarTags.length} avatars / {scene.assets.length} media</small>
                </span>
                <em>{scene.canonicalTime?.order || 1}</em>
              </button>
            ))}
          </div>
        </div>

        {selectedScene ? (
          <>
            <section className="scene-editor-panel panel hapa-panel" data-variant="hot">
              <div className="scene-editor-grid">
                <label>
                  <span>Scene title</span>
                  <BufferedTextInput value={selectedScene.title} onCommit={(value) => onUpdateScene({ title: value })} />
                </label>
                <label>
                  <span>Scene tags</span>
                  <BufferedTextInput value={(selectedScene.tags || []).join(", ")} onCommit={(value) => onUpdateScene({ tags: splitTagInput(value) })} />
                </label>
                <label className="wide">
                  <span>Scene summary</span>
                  <BufferedTextArea value={selectedScene.summary || ""} onCommit={(value) => onUpdateScene({ summary: value })} />
                </label>
                <label>
                  <span>Quick pitch</span>
                  <BufferedTextArea value={selectedScene.quickPitch || ""} onCommit={(value) => onUpdateScene({ quickPitch: value, promptPack: { ...(selectedScene.promptPack || {}), quickPitch: value } })} />
                </label>
                <label className="wide">
                  <span>Overall narrative</span>
                  <BufferedTextArea value={selectedScene.overallNarrative || ""} onCommit={(value) => onUpdateScene({ overallNarrative: value })} />
                </label>
                <label className="wide">
                  <span>Narrative text</span>
                  <BufferedTextArea value={selectedScene.narrativeText || ""} onCommit={(value) => onUpdateScene({ narrativeText: value })} />
                </label>
                <label className="wide">
                  <span>Production prompt</span>
                  <BufferedTextArea value={selectedScene.productionPrompt || ""} onCommit={(value) => onUpdateScene({ productionPrompt: value, promptPack: { ...(selectedScene.promptPack || {}), comicPanelPrompt: value } })} />
                </label>
                <label>
                  <span>Learning objectives</span>
                  <BufferedTextInput value={(selectedScene.learningObjectives || []).join(", ")} onCommit={(value) => onUpdateScene({ learningObjectives: splitTagInput(value) })} />
                </label>
                <label>
                  <span>Hapa mechanics</span>
                  <BufferedTextInput value={(selectedScene.hapaMechanics || []).join(", ")} onCommit={(value) => onUpdateScene({ hapaMechanics: splitTagInput(value) })} />
                </label>
                <label>
                  <span>Management skills</span>
                  <BufferedTextInput value={(selectedScene.managementSkills || []).join(", ")} onCommit={(value) => onUpdateScene({ managementSkills: splitTagInput(value) })} />
                </label>
                <label>
                  <span>Aesthetic mood</span>
                  <BufferedTextInput value={selectedScene.aesthetic?.mood || ""} onCommit={(value) => onUpdateScene({ aesthetic: { ...(selectedScene.aesthetic || {}), mood: value } })} />
                </label>
                <label>
                  <span>Palette</span>
                  <BufferedTextInput value={selectedScene.aesthetic?.palette || ""} onCommit={(value) => onUpdateScene({ aesthetic: { ...(selectedScene.aesthetic || {}), palette: value } })} />
                </label>
                <label>
                  <span>Lighting</span>
                  <BufferedTextInput value={selectedScene.aesthetic?.lighting || ""} onCommit={(value) => onUpdateScene({ aesthetic: { ...(selectedScene.aesthetic || {}), lighting: value } })} />
                </label>
                <label>
                  <span>Camera</span>
                  <BufferedTextInput value={selectedScene.aesthetic?.camera || ""} onCommit={(value) => onUpdateScene({ aesthetic: { ...(selectedScene.aesthetic || {}), camera: value } })} />
                </label>
              </div>
              <SceneTimelineBand
                scene={selectedScene}
                timelines={graph.timelines}
                sceneAudit={selectedSceneAudit}
                onUpdateTimeline={onUpdateTimeline}
              />
            </section>

            <SceneAvatarCasting
              avatars={avatars}
              scene={selectedScene}
              onToggleAvatar={onToggleAvatar}
              onAvatarRole={onAvatarRole}
            />

            <div className="scene-media-grid">
              {SCENE_MEDIA_REQUIREMENTS.map((requirement) => (
                <SceneMediaBucket
                  key={requirement.id}
                  requirement={requirement}
                  scene={selectedScene}
                  selectedAssetId={selectedSceneAssetId}
                  onDropMedia={onDropMedia}
                  onSelectAsset={onSelectAsset}
                  onExpand={onExpand}
                  onDeleteAsset={onDeleteAsset}
                />
              ))}
            </div>

            <ScenePlaylistPanel scene={selectedScene} onAddPlaylistTrack={onAddPlaylistTrack} />
          </>
        ) : (
          <div className="empty-state hapa-panel" data-variant="resting">
            <Clapperboard size={28} />
            <span>Create a scene scaffold to begin.</span>
          </div>
        )}
      </section>

      <aside className="panel hapa-panel scene-inspector" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><Clipboard size={15} /> Scene Detail</span>
          <em>{selectedSceneAsset ? "media" : "pack"}</em>
        </div>
        <SceneAssetInspector
          scene={selectedScene}
          asset={selectedSceneAsset}
          avatars={avatars}
          onExpand={onExpand}
          onDeleteAsset={onDeleteAsset}
          onTagMediaAvatar={onTagMediaAvatar}
        />
        <div className="attach-panel scene-attach-panel">
          <div className="section-head hapa-panel-head compact">
            <span><FileJson size={15} /> Scene Attach Pack</span>
            <em>{selectedScene?.id || "none"}</em>
          </div>
          <DeferredJsonPre value={attachPack} placeholder="Preparing scene pack..." />
        </div>
      </aside>
    </section>
  );
}

function DeferredJsonPre({ value, placeholder = "Preparing manifest..." }) {
  const [text, setText] = useState("");

  useEffect(() => {
    let alive = true;
    setText("");
    const cancel = scheduleIdleTask(() => {
      if (alive) setText(compactForDisplay(value));
    }, 320);
    return () => {
      alive = false;
      cancel();
    };
  }, [value]);

  return <pre aria-busy={!text}>{text || placeholder}</pre>;
}

function SceneTimelineBand({ scene, timelines, sceneAudit, onUpdateTimeline }) {
  return (
    <section className="scene-timeline-band hapa-panel" data-variant="resting">
      <div className="section-head hapa-panel-head compact">
        <span><CalendarClock size={14} /> Canonical Timeline</span>
        <em>{sceneAudit ? `${sceneAudit.filledMedia}/${sceneAudit.requiredMedia} media` : "scaffold"}</em>
      </div>
      <div className="timeline-controls">
        <label>
          <span>Timeline</span>
          <select value={scene.canonicalTime?.timelineId || scene.timelineId} onChange={(event) => onUpdateTimeline({ timelineId: event.target.value })}>
            {timelines.map((timeline) => <option key={timeline.id} value={timeline.id}>{timeline.name}</option>)}
          </select>
        </label>
        <label>
          <span>Order</span>
          <BufferedTextInput type="number" value={scene.canonicalTime?.order || 1} onCommit={(value) => onUpdateTimeline({ order: value })} />
        </label>
        <label>
          <span>Beat label</span>
          <BufferedTextInput value={scene.canonicalTime?.label || ""} onCommit={(value) => onUpdateTimeline({ label: value })} />
        </label>
        <label>
          <span>Starts at</span>
          <BufferedTextInput value={scene.canonicalTime?.startsAt || ""} onCommit={(value) => onUpdateTimeline({ startsAt: value })} placeholder="date, beat, or story time" />
        </label>
        <label>
          <span>Duration</span>
          <BufferedTextInput value={scene.canonicalTime?.duration || ""} onCommit={(value) => onUpdateTimeline({ duration: value })} placeholder="00:03:00" />
        </label>
      </div>
    </section>
  );
}

function SceneAvatarCasting({ avatars, scene, onToggleAvatar, onAvatarRole }) {
  const tagged = new Map((scene.avatarTags || []).map((tag) => [tag.avatarId, tag]));
  return (
    <section className="scene-casting-panel panel hapa-panel" data-variant="notch">
      <div className="section-head hapa-panel-head">
        <span><Tags size={15} /> Avatar Scene Tags</span>
        <em>{tagged.size}</em>
      </div>
      <div className="scene-avatar-grid">
        {avatars.map((avatar) => {
          const tag = tagged.get(avatar.id);
          const portrait = defaultCloseupEmotionAsset(avatar);
          return (
            <article
              className={`scene-avatar-chip hapa-card ${tag ? "selected" : ""}`}
              data-card-type="avatar"
              data-granularity="mini"
              data-state={tag ? "selected" : "idle"}
              key={avatar.id}
            >
              <button type="button" onClick={() => onToggleAvatar(avatar.id)}>
                <div className={`avatar-orb ${portrait ? "has-portrait" : ""}`} style={{ "--progress": tag ? "100%" : "0%" }}>
                  {portrait ? <AssetVisual asset={portrait} mode="thumb" /> : <span>{avatar.primaryName.slice(0, 1)}</span>}
                </div>
                <span>
                  <strong>{avatar.primaryName}</strong>
                  <small>{tag ? tag.presence : "not tagged"}</small>
                </span>
              </button>
              {tag && (
                <select value={tag.role} onChange={(event) => onAvatarRole(avatar.id, event.target.value)}>
                  {SCENE_AVATAR_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SceneMediaBucket({ requirement, scene, selectedAssetId, onDropMedia, onSelectAsset, onExpand, onDeleteAsset }) {
  const assetMap = useMemo(() => new Map((scene.assets || []).map((asset) => [asset.id, asset])), [scene.assets]);
  const slots = scene.mediaSlots
    .filter((slot) => slot.requirementId === requirement.id)
    .sort((a, b) => Number(a.required === false) - Number(b.required === false));
  const filledSlots = slots.filter((slot) => slot.assetId);
  const openTargets = slots.filter((slot) => slot.required !== false && !slot.assetId).length;
  const overfill = filledSlots.filter((slot) => slot.required === false).length;
  const requiredCount = slots.filter((slot) => slot.required !== false).length;
  const filledRequired = slots.filter((slot) => slot.required !== false && slot.assetId).length;

  return (
    <section
      className={`scene-media-bucket hapa-panel accent-${requirement.accent}`}
      data-variant="notch"
      data-card-type="media"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropMedia(event, requirement.id)}
    >
      <header>
        <div>
          <p>{requirement.shortLabel}</p>
          <h3>{requirement.label}</h3>
        </div>
        <div className="bucket-count">
          <strong>{filledRequired}/{requiredCount}</strong>
          {overfill > 0 && <em>+{overfill} overfill</em>}
        </div>
      </header>
      <ProgressBar value={requiredCount ? Math.round((filledRequired / requiredCount) * 100) : 100} />
      <div
        className="bucket-drop-strip"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDropMedia(event, requirement.id)}
      >
        <Upload size={15} />
        <span>{openTargets > 0 ? `${openTargets} open` : "overfill"}</span>
      </div>
      <div className="scene-media-cards">
        {filledSlots.length ? filledSlots.map((slot, index) => {
          const asset = assetMap.get(slot.assetId);
          if (!asset) return null;
          return (
            <article
              className={`scene-media-card hapa-card ${selectedAssetId === asset.id ? "selected" : ""}`}
              data-card-type={assetCardType(asset)}
              data-granularity={index === 0 ? "standard" : "mini"}
              data-state={selectedAssetId === asset.id ? "selected" : "idle"}
              key={slot.id}
              role="button"
              tabIndex={0}
              draggable
              onClick={() => onSelectAsset(asset.id)}
              onDoubleClick={() => onExpand(asset)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copyMove";
                event.dataTransfer.setData("application/x-hapa-asset-id", asset.id);
                event.dataTransfer.setData("application/json", JSON.stringify(asset));
                event.dataTransfer.setData("text/plain", asset.id);
              }}
              onDrop={(event) => {
                event.stopPropagation();
                onDropMedia(event, requirement.id, slot.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectAsset(asset.id);
                }
              }}
            >
              <div className="scene-media-visual">
                <AssetVisual asset={asset} mode={index === 0 ? "preview" : "thumb"} />
              </div>
              <span className="scene-order">{index === 0 ? "Default" : `#${index + 1}`}</span>
              <strong>{asset.name}</strong>
              <small>{asset.metadata?.originalFileName || asset.type}</small>
              <button className="expand-button" title="Expand scene media" aria-label={`Expand ${asset.name}`} onClick={(event) => {
                event.stopPropagation();
                onExpand(asset);
              }}>
                <Maximize2 size={13} />
              </button>
              <button className="delete-button" title="Delete scene media" aria-label={`Delete ${asset.name}`} onClick={(event) => {
                event.stopPropagation();
                onDeleteAsset(asset);
              }}>
                <Trash2 size={13} />
              </button>
              {slot.required === false && <em className="overfill-chip">overfill</em>}
            </article>
          );
        }) : (
          <div className="scene-bucket-empty">
            {sceneMediaIcon(requirement.id)}
            <span>Drop {requirement.shortLabel.toLowerCase()} media</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ScenePlaylistPanel({ scene, onAddPlaylistTrack }) {
  const [draft, setDraft] = useState({ title: "", artist: "", uri: "", mood: "", bpm: "", note: "" });
  const canSubmit = draft.title.trim() || draft.uri.trim();

  function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    onAddPlaylistTrack(draft);
    setDraft({ title: "", artist: "", uri: "", mood: "", bpm: "", note: "" });
  }

  return (
    <section className="scene-playlist-panel panel hapa-panel" data-variant="notch">
      <div className="section-head hapa-panel-head">
        <span><Music size={15} /> Scene Playlist</span>
        <em>{scene.playlist.length}</em>
      </div>
      <form className="playlist-form" onSubmit={submit}>
        <input value={draft.title} onChange={(event) => setDraft((item) => ({ ...item, title: event.target.value }))} placeholder="song title" />
        <input value={draft.artist} onChange={(event) => setDraft((item) => ({ ...item, artist: event.target.value }))} placeholder="artist" />
        <input value={draft.uri} onChange={(event) => setDraft((item) => ({ ...item, uri: event.target.value }))} placeholder="url or music id" />
        <input value={draft.mood} onChange={(event) => setDraft((item) => ({ ...item, mood: event.target.value }))} placeholder="mood" />
        <input value={draft.bpm} onChange={(event) => setDraft((item) => ({ ...item, bpm: event.target.value }))} placeholder="bpm" />
        <button className="hapa-btn" data-intent="primary" type="submit" disabled={!canSubmit}>
          <Plus size={14} />
          Add Track
        </button>
      </form>
      <div className="playlist-track-list">
        {scene.playlist.length ? scene.playlist.map((track, index) => (
          <article className="playlist-track hapa-card" data-card-type="resource" data-granularity="mini" key={track.id}>
            <Music size={14} />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist || "unknown artist"} / {track.mood || "mood unset"} {track.bpm ? `/ ${track.bpm} bpm` : ""}</small>
            </span>
            <em>{index + 1}</em>
          </article>
        )) : (
          <div className="scene-bucket-empty">
            <Music size={22} />
            <span>No songs queued</span>
          </div>
        )}
      </div>
    </section>
  );
}

function SceneAssetInspector({ scene, asset, avatars, onExpand, onDeleteAsset, onTagMediaAvatar }) {
  if (!scene) {
    return (
      <div className="empty-state hapa-panel" data-variant="resting">
        <Clapperboard size={28} />
        <span>No scene selected</span>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="scene-summary-card hapa-card" data-card-type="lore" data-granularity="detail" data-state="active">
        <Clapperboard size={32} />
        <strong>{scene.title}</strong>
        <span>{scene.summary || "Scene scaffold awaiting media and tags."}</span>
        <div className="scene-summary-stats">
          <em>{scene.assets.length} media</em>
          <em>{scene.avatarTags.length} avatars</em>
          <em>{scene.playlist.length} songs</em>
        </div>
      </div>
    );
  }

  const taggedAvatars = new Set((asset.metadata?.avatarTags || []).map((tag) => tag.avatarId));

  return (
    <div className="scene-asset-detail hapa-card" data-card-type={assetCardType(asset)} data-granularity="detail" data-state="selected">
      <AssetVisual asset={asset} controls={asset.type === "video"} mode="preview" />
      <strong>{asset.name}</strong>
      <span>{sceneRequirementById(asset.metadata?.sceneRequirementId || asset.requirementId)?.label || asset.type}</span>
      <div className="scene-detail-actions">
        <button className="hapa-btn" data-intent="primary" onClick={() => onExpand(asset)}>
          <Maximize2 size={14} />
          Expand
        </button>
        <button className="hapa-btn" data-intent="danger" onClick={() => onDeleteAsset(asset)}>
          <Trash2 size={14} />
          Delete
        </button>
      </div>
      <div className="scene-media-avatar-tags">
        <p className="eyebrow">Avatars visible in this media</p>
        {avatars.map((avatar) => (
          <button
            key={avatar.id}
            className={taggedAvatars.has(avatar.id) ? "active" : ""}
            type="button"
            onClick={() => onTagMediaAvatar(asset.id, avatar.id)}
          >
            <span>{avatar.primaryName.slice(0, 2).toUpperCase()}</span>
            <strong>{avatar.primaryName}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function VideoLoopsView({
  avatar,
  videos,
  seedFrames,
  selectedVideo,
  selectedAssetId,
  transitionMap,
  matchQueue,
  onSelectVideo,
  onSelectAsset,
  onExpand,
  onTagVideo,
  onConnectEndFrame,
  onReverseLoopValidation,
  onValidateCandidate
}) {
  const detailPanelRef = useRef(null);
  const [activeSeedId, setActiveSeedId] = useState(null);
  const [sourceFrameMarker, setSourceFrameMarker] = useState("last");
  const parentAsset = selectedVideo
    ? avatar.assets.find((asset) => asset.id === (selectedVideo.parentAssetId || selectedVideo.state?.startFrameAssetId)) || null
    : null;
  const selectedLinks = selectedVideo ? transitionMap.outgoing.get(selectedVideo.id) || [] : [];
  const targetAssets = useMemo(
    () => avatar.assets.filter((asset) => selectedVideo && asset.id !== selectedVideo.id && (asset.type === "image" || asset.type === "video")),
    [avatar.assets, selectedVideo]
  );
  const [targetId, setTargetId] = useState("");
  const [targetDropHot, setTargetDropHot] = useState(null);
  const [linkType, setLinkType] = useState("continuity");
  const [humanLabel, setHumanLabel] = useState("");
  const [reason, setReason] = useState("");
  const [agentInstruction, setAgentInstruction] = useState("");
  const [reverseMode, setReverseMode] = useState("forward-back");
  const [reverseNote, setReverseNote] = useState("");

  useEffect(() => {
    setTargetId((current) => (current && targetAssets.some((asset) => asset.id === current) ? current : ""));
  }, [targetAssets]);

  useEffect(() => {
    if (!seedFrames.some((seed) => seed.id === activeSeedId)) setActiveSeedId(null);
  }, [seedFrames, activeSeedId]);

  function submitLink(event) {
    event.preventDefault();
    if (!selectedVideo || !targetId) return;
    const target = targetAssets.find((asset) => asset.id === targetId);
    const targetFrame = target ? connectionFrameForAsset(target) : null;
    onConnectEndFrame(selectedVideo, targetId, {
      fromFrame: sourceFrameMarker,
      targetFrame: targetFrame?.marker || target?.type || null,
      targetFrameAssetId: targetFrame?.id || null,
      targetFrameUri: targetFrame?.uri || target?.metadata?.thumbnailUri || target?.uri || null,
      linkType,
      humanLabel: humanLabel || `${sourceFrameMarker} to ${targetFrame?.marker || target?.name || "target"}`,
      reason: reason || "Visual snap connection selected in the Loops Builder.",
      agentInstruction: agentInstruction || "Use the selected source and target frames as the continuity route endpoints."
    });
  }

  const seedRows = useMemo(
    () => seedFrames.map((seed) => ({
      seed,
      branches: videos.filter((video) => (video.parentAssetId || video.state?.startFrameAssetId) === seed.id)
    })),
    [seedFrames, videos]
  );
  const filteredVideos = useMemo(
    () => activeSeedId
      ? videos.filter((video) => (video.parentAssetId || video.state?.startFrameAssetId) === activeSeedId)
      : videos,
    [activeSeedId, videos]
  );
  const activeSeed = seedFrames.find((seed) => seed.id === activeSeedId) || null;
  const sourceFrames = useMemo(() => selectedVideo ? framesForAsset(selectedVideo) : [], [selectedVideo]);
  const selectedSourceFrame = sourceFrames.find((frame) => frame.marker === sourceFrameMarker) ||
    sourceFrames.find((frame) => frame.marker === "last") ||
    sourceFrames.at(-1) ||
    null;
  const selectedTargetAsset = targetAssets.find((asset) => asset.id === targetId) || null;
  const selectedTargetFrame = selectedTargetAsset ? connectionFrameForAsset(selectedTargetAsset) : null;

  useEffect(() => {
    if (!filteredVideos.length) return;
    if (!selectedVideo || !filteredVideos.some((video) => video.id === selectedVideo.id)) {
      onSelectVideo(filteredVideos[0].id);
    }
  }, [filteredVideos, selectedVideo, onSelectVideo]);

  useEffect(() => {
    if (!sourceFrames.length) {
      setSourceFrameMarker("last");
      return;
    }
    setSourceFrameMarker((current) => sourceFrames.some((frame) => frame.marker === current) ? current : (sourceFrames.find((frame) => frame.marker === "last") || sourceFrames.at(-1)).marker);
  }, [sourceFrames]);

  function revealRouteComposer() {
    window.requestAnimationFrame(() => {
      const panel = detailPanelRef.current;
      if (!panel) return;
      panel.closest(".loops-view")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      panel.scrollIntoView({ block: "start", inline: "nearest" });
      window.requestAnimationFrame(() => {
        panel.scrollTop = 0;
      });
    });
  }

  function selectSeed(seed, branches) {
    const nextSeedId = activeSeedId === seed.id ? null : seed.id;
    setActiveSeedId(nextSeedId);
    onSelectAsset(seed.id);
    if (nextSeedId && branches[0]) onSelectVideo(branches[0].id);
    revealRouteComposer();
  }

  function selectRouteVideo(videoId) {
    onSelectVideo(videoId);
    revealRouteComposer();
  }

  function handleSourceDragStart(frame, event) {
    setSourceFrameMarker(frame.marker);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-hapa-source-frame", frame.marker);
  }

  function handleTargetDrop(asset, event) {
    event.preventDefault();
    const marker = event.dataTransfer.getData("application/x-hapa-source-frame");
    if (marker) setSourceFrameMarker(marker);
    setTargetId(asset.id);
    setTargetDropHot(asset.id);
    window.setTimeout(() => setTargetDropHot(null), 420);
  }

  function validateReverseLoop(acceptable) {
    if (!selectedVideo) return;
    onReverseLoopValidation(selectedVideo.id, {
      mode: reverseMode,
      acceptable,
      note: reverseNote
    });
  }

  return (
    <section className="loops-view">
      <div className="loops-header panel hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Video Route Workbench</p>
          <h2>{avatar.primaryName} Seed Frames</h2>
        </div>
        <div className="loop-stats">
          <StatusChip label="VIDEOS" value={activeSeed ? `${filteredVideos.length}/${videos.length}` : videos.length} tone="orange" />
          <StatusChip label="ROUTES" value={transitionMap.links.length} tone="fuchsia" />
          <StatusChip label="QUEUE" value={matchQueue.length} tone="cyan" />
        </div>
      </div>

      <div className="loops-grid">
        <section className="panel hapa-panel loop-seeds-panel" data-variant="notch">
          <div className="section-head hapa-panel-head">
            <span><Grid3X3 size={15} /> Seed Frames</span>
            <em>{seedRows.length}</em>
          </div>
          <div className="loop-seed-list">
            {seedRows.length ? seedRows.map(({ seed, branches }) => (
              <button
                className={`loop-seed-row hapa-card ${activeSeedId === seed.id ? "selected" : ""}`}
                data-card-type="media"
                data-granularity="mini"
                data-state={activeSeedId === seed.id ? "selected" : branches.length ? "active" : "idle"}
                data-branch-count={branches.length}
                key={seed.id}
                onClick={() => selectSeed(seed, branches)}
              >
                <AssetVisual asset={seed} mode="thumb" />
                <span>
                  <strong>{seed.name}</strong>
                  <small>{branches.length} branch{branches.length === 1 ? "" : "es"} / {requirementById(seed.requirementId)?.shortLabel || seed.requirementId}</small>
                </span>
                <em>{activeSeedId === seed.id ? "filter" : seed.metadata?.defaultForSection ? "seed" : `#${seed.metadata?.sectionOrder || "?"}`}</em>
              </button>
            )) : (
              <div className="branch-empty hapa-panel" data-variant="resting">
                <Radar size={18} />
                <span>No seed frames attached</span>
              </div>
            )}
          </div>
        </section>

        <section className="panel hapa-panel loop-video-panel" data-variant="notch">
          <div className="section-head hapa-panel-head">
            <span><Film size={15} /> Route Clips</span>
            <em>{activeSeed ? `${filteredVideos.length}/${videos.length}` : videos.length}</em>
          </div>
          {activeSeed && (
            <button className="loop-filter-chip hapa-card" data-card-type="media" data-granularity="chip" data-state="selected" onClick={() => setActiveSeedId(null)}>
              <GitBranch size={13} />
              <span>{activeSeed.name}</span>
              <em>clear</em>
            </button>
          )}
          <div className="loop-video-list">
            {filteredVideos.length ? filteredVideos.map((video) => (
              <button
                className={`loop-video-row hapa-card ${selectedVideo?.id === video.id ? "selected" : ""}`}
                data-card-type="media"
                data-granularity="mini"
                data-state={selectedVideo?.id === video.id ? "selected" : "idle"}
                key={video.id}
                onClick={() => selectRouteVideo(video.id)}
              >
                <AssetVisual asset={video} mode="thumb" />
                <span>
                  <strong>{video.name}</strong>
                  <small>{formatDuration(video.metadata?.duration)} / {(video.state?.outLinks || []).length} end links</small>
                </span>
                <GitBranch size={14} />
              </button>
            )) : (
              <div className="branch-empty hapa-panel" data-variant="resting">
                <Film size={18} />
                <span>{activeSeed ? "No clips branch from this seed" : "No route clips yet"}</span>
              </div>
            )}
          </div>
        </section>

        <section className="panel hapa-panel loop-detail-panel" data-variant="notch" ref={detailPanelRef}>
          <div className="section-head hapa-panel-head">
            <span><Route size={15} /> First/Mid/Last Route</span>
            <em>{selectedVideo ? selectedVideo.tags.length : 0}</em>
          </div>
          {selectedVideo ? (
            <>
              <form className="loop-link-form hapa-panel" data-variant="resting" onSubmit={submitLink}>
                <div className="section-head hapa-panel-head compact">
                  <span><Link2 size={14} /> Snap Frame Connector</span>
                  <em>{selectedTargetAsset ? "armed" : `${targetAssets.length} states`}</em>
                </div>
                <VisualFrameConnector
                  sourceFrames={sourceFrames}
                  selectedSourceFrame={selectedSourceFrame}
                  targetAssets={targetAssets}
                  selectedTargetAsset={selectedTargetAsset}
                  selectedTargetFrame={selectedTargetFrame}
                  hotTargetId={targetDropHot}
                  onSourceSelect={(frame) => setSourceFrameMarker(frame.marker)}
                  onSourceDragStart={handleSourceDragStart}
                  onTargetSelect={(asset) => setTargetId(asset.id)}
                  onTargetDrop={handleTargetDrop}
                />
                <label>
                  <span>Link type</span>
                  <select value={linkType} onChange={(event) => setLinkType(event.target.value)}>
                    {VIDEO_LINK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <span>Human label</span>
                  <input value={humanLabel} onChange={(event) => setHumanLabel(event.target.value)} placeholder="route label" />
                </label>
                <label>
                  <span>Why it links</span>
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="visual or story continuity" />
                </label>
                <label>
                  <span>Agent instruction</span>
                  <textarea value={agentInstruction} onChange={(event) => setAgentInstruction(event.target.value)} placeholder="how an agent should traverse this route" />
                </label>
                <button className="hapa-btn" data-intent="primary" type="submit" disabled={!targetId}>
                  <Link2 size={14} />
                  Connect Route
                </button>
              </form>

              <div className="loop-route-stage">
                <div className="route-state-card hapa-card" data-card-type="media" data-granularity="standard" data-state="active">
                  <p className="eyebrow">Seed Frame</p>
                  {parentAsset ? <AssetVisual asset={parentAsset} mode="preview" /> : <Radar size={34} />}
                  <strong>{parentAsset?.name || "No seed frame"}</strong>
                  {parentAsset && <button className="hapa-btn" data-intent="primary" onClick={() => onSelectAsset(parentAsset.id)}>Open Seed</button>}
                </div>
                <div className="route-clip-card hapa-card" data-card-type="media" data-granularity="detail" data-state="selected">
                  <div className="route-clip-hero">
                    <AssetVisual asset={selectedVideo} controls mode="full" />
                    <button className="expand-button visible" title="Expand video" aria-label={`Expand ${selectedVideo.name}`} onClick={() => onExpand(selectedVideo)}>
                      <Maximize2 size={13} />
                    </button>
                  </div>
                  <strong>{selectedVideo.name}</strong>
                  <span>{formatDuration(selectedVideo.metadata?.duration)} / {formatMegabytes(selectedVideo.metadata?.sizeBytes)}</span>
                  <VideoFrameStrip frames={selectedVideo.metadata?.frames || selectedVideo.state?.keyframes} />
                </div>
                <div className="route-link-card hapa-card" data-card-type="media" data-granularity="standard" data-state={selectedLinks.length ? "active" : "idle"}>
                  <p className="eyebrow">End Links</p>
                  {selectedLinks.length ? selectedLinks.map((link) => (
                    <button key={link.id} className="link-map-row hapa-card" data-card-type="media" data-granularity="mini" onClick={() => onSelectAsset(link.targetAssetId)}>
                      <GitBranch size={13} />
                      <span>
                        <b>{link.humanLabel || link.targetName}</b>
                        <small>{link.linkType} / {link.reason || "no reason set"}</small>
                      </span>
                    </button>
                  )) : (
                    <div className="branch-empty hapa-panel" data-variant="resting">
                      <Link2 size={18} />
                      <span>No validated end link</span>
                    </div>
                  )}
                </div>
              </div>

              <ReverseLoopPanel
                video={selectedVideo}
                mode={reverseMode}
                note={reverseNote}
                onMode={setReverseMode}
                onNote={setReverseNote}
                onValidate={validateReverseLoop}
              />

              <div className="loop-subtags-panel">
                {VIDEO_LOOP_TAG_GROUPS.map((group) => (
                  <div className="loop-tag-group hapa-panel" data-variant="resting" style={tagAccentStyle(group.accent)} key={group.id}>
                    <div className="section-head hapa-panel-head compact">
                      <span><Tags size={14} /> {group.label}</span>
                      <em>{group.tags.filter((tag) => selectedVideo.tags.includes(tag.id)).length}/{group.tags.length}</em>
                    </div>
                    <div className="loop-tag-grid">
                      {group.tags.map((tag) => (
                        <button
                          key={tag.id}
                          className={selectedVideo.tags.includes(tag.id) ? "active" : ""}
                          onClick={() => onTagVideo(selectedVideo.id, tag.id)}
                        >
                          <span>{tag.icon}</span>
                          <strong>{tag.label}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state hapa-panel" data-variant="resting">
              <Film size={28} />
              <span>Select or upload a video branch</span>
            </div>
          )}
        </section>

        <section className="panel hapa-panel loop-match-panel" data-variant="notch">
          <div className="section-head hapa-panel-head">
            <span><ListChecks size={15} /> High-Likeness Queue</span>
            <em>{matchQueue.length}</em>
          </div>
          <div className="candidate-list">
            {matchQueue.length ? matchQueue.slice(0, 12).map((candidate) => (
              <article className="candidate-card hapa-card" data-card-type="media" data-granularity="standard" data-state="active" key={candidate.id}>
                <div className="candidate-frames">
                  <figure>
                    <img src={resolveMediaUri(candidate.fromFrameUri)} alt="" loading="lazy" decoding="async" />
                    <figcaption>last</figcaption>
                  </figure>
                  <Shuffle size={18} />
                  <figure>
                    <img src={resolveMediaUri(candidate.toFrameUri)} alt="" loading="lazy" decoding="async" />
                    <figcaption>first</figcaption>
                  </figure>
                </div>
                <strong>{Math.round(candidate.score * 100)}% match</strong>
                <span>{candidate.reason}</span>
                <button className="hapa-btn" data-intent="success" onClick={() => onValidateCandidate(candidate)}>
                  <CheckCircle2 size={14} />
                  Validate
                </button>
              </article>
            )) : (
              <div className="branch-empty hapa-panel" data-variant="resting">
                <ListChecks size={18} />
                <span>No high-probability matches queued</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function ReverseLoopPanel({ video, mode, note, onMode, onNote, onValidate }) {
  const validation = video.state?.loop?.reversePlayback || null;
  return (
    <section className="reverse-loop-panel hapa-panel" data-variant="resting">
      <div className="section-head hapa-panel-head compact">
        <span><Shuffle size={14} /> Reverse Loop Lab</span>
        <em>{validation?.acceptable ? "accepted" : validation ? "reviewed" : "untested"}</em>
      </div>
      <div className="reverse-loop-grid">
        <ReverseLoopPreview video={video} mode={mode} />
        <div className="reverse-loop-controls">
          <label>
            <span>Playback test</span>
            <select value={mode} onChange={(event) => onMode(event.target.value)}>
              <option value="forward-back">Forward then back</option>
              <option value="back-forward">Back then forward</option>
              <option value="triple-pass">Forward/back, back/forward, forward/back</option>
            </select>
          </label>
          <label>
            <span>Reviewer note</span>
            <textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="identity drift, snap point, trim note, or why this reverse loop works" />
          </label>
          <div className="reverse-loop-actions">
            <button className="hapa-btn" data-intent="success" type="button" onClick={() => onValidate(true)}>
              <CheckCircle2 size={14} />
              Accept Reverse Loop
            </button>
            <button className="hapa-btn" data-intent="danger" type="button" onClick={() => onValidate(false)}>
              <X size={14} />
              Reject
            </button>
          </div>
          {validation && (
            <div className="reverse-loop-status hapa-card" data-card-type="media" data-granularity="chip" data-state={validation.acceptable ? "active" : "idle"}>
              <strong>{validation.acceptable ? "Reverse loop approved" : "Reverse loop rejected"}</strong>
              <span>{validation.mode} / {validation.note || "no note"}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReverseLoopPreview({ video, mode }) {
  const videoRef = useRef(null);
  const animationRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState("ready");

  useEffect(() => {
    setPlaying(false);
    setPhase("ready");
    cancelAnimationFrame(animationRef.current);
    const element = videoRef.current;
    if (element) {
      element.pause();
      element.currentTime = 0;
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [video.id, mode]);

  function playPattern() {
    const element = videoRef.current;
    if (!element) return;
    const pattern = reversePatternForMode(mode);
    const mediaDuration = Number.isFinite(element.duration) ? element.duration : Number(video.metadata?.duration);
    const duration = Math.max(0.35, Number.isFinite(mediaDuration) ? mediaDuration : 1);
    let phaseIndex = 0;
    let phaseStartedAt = performance.now();
    setPlaying(true);

    function tick(now) {
      const direction = pattern[phaseIndex];
      const elapsed = (now - phaseStartedAt) / 1000;
      const progress = Math.min(1, elapsed / duration);
      element.currentTime = direction > 0 ? duration * progress : duration * (1 - progress);
      setPhase(direction > 0 ? "forward" : "reverse");

      if (progress >= 1) {
        phaseIndex += 1;
        if (phaseIndex >= pattern.length) {
          setPlaying(false);
          setPhase("complete");
          return;
        }
        phaseStartedAt = now;
      }
      animationRef.current = requestAnimationFrame(tick);
    }

    element.pause();
    animationRef.current = requestAnimationFrame(tick);
  }

  function stopPattern() {
    cancelAnimationFrame(animationRef.current);
    setPlaying(false);
    setPhase("paused");
  }

  return (
    <div className="reverse-loop-preview">
      <video ref={videoRef} src={resolveMediaUri(video.uri)} muted={false} playsInline preload="metadata" />
      <div className="reverse-loop-hud">
        <span>{phase}</span>
        <strong>{modeLabel(mode)}</strong>
      </div>
      <button className="hapa-btn" data-intent={playing ? "danger" : "primary"} type="button" onClick={playing ? stopPattern : playPattern}>
        <Play size={14} />
        {playing ? "Stop Test" : "Play Test"}
      </button>
    </div>
  );
}

function VisualFrameConnector({
  sourceFrames,
  selectedSourceFrame,
  targetAssets,
  selectedTargetAsset,
  selectedTargetFrame,
  hotTargetId,
  onSourceSelect,
  onSourceDragStart,
  onTargetSelect,
  onTargetDrop
}) {
  return (
    <div className="frame-connector-panel">
      <div className="connector-endpoint source">
        <p className="eyebrow">Drag Source Frame</p>
        <div className="connector-frame-grid">
          {sourceFrames.length ? sourceFrames.map((frame) => (
            <button
              type="button"
              key={frame.id || frame.marker}
              draggable
              className={`connector-frame-card hapa-card ${selectedSourceFrame?.marker === frame.marker ? "selected" : ""}`}
              data-card-type="media"
              data-granularity="mini"
              data-state={selectedSourceFrame?.marker === frame.marker ? "selected" : "idle"}
              onClick={() => onSourceSelect(frame)}
              onDragStart={(event) => onSourceDragStart(frame, event)}
            >
              <FrameThumb frame={frame} />
              <strong>{frame.marker}</strong>
            </button>
          )) : (
            <div className="branch-empty hapa-panel" data-variant="resting">
              <Radar size={18} />
              <span>No video frames</span>
            </div>
          )}
        </div>
      </div>
      <div className="connector-beam" aria-hidden="true">
        <GitBranch size={18} />
        <span>snap</span>
      </div>
      <div className="connector-endpoint targets">
        <p className="eyebrow">Drop On Target State</p>
        <div className="connector-target-grid">
          {targetAssets.map((asset) => {
            const targetFrame = connectionFrameForAsset(asset);
            return (
              <button
                type="button"
                key={asset.id}
                className={`connector-target-card hapa-card ${selectedTargetAsset?.id === asset.id ? "selected" : ""} ${hotTargetId === asset.id ? "snap-hot" : ""}`}
                data-card-type="media"
                data-granularity="mini"
                data-state={selectedTargetAsset?.id === asset.id ? "selected" : "idle"}
                onClick={() => onTargetSelect(asset)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onTargetDrop(asset, event)}
              >
                <FrameThumb frame={targetFrame} fallbackAsset={asset} />
                <span>
                  <strong>{asset.name}</strong>
                  <small>{asset.type === "video" ? `${targetFrame?.marker || "first"} frame` : requirementById(asset.requirementId)?.shortLabel || asset.requirementId}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="connector-readout hapa-card" data-card-type="media" data-granularity="chip" data-state={selectedTargetAsset ? "selected" : "idle"}>
        <strong>{selectedSourceFrame?.marker || "source"}</strong>
        <GitBranch size={14} />
        <span>{selectedTargetAsset ? `${selectedTargetAsset.name} · ${selectedTargetFrame?.marker || selectedTargetAsset.type}` : "Choose a target visually"}</span>
      </div>
    </div>
  );
}

function FrameThumb({ frame, fallbackAsset = null }) {
  const uri = frame?.thumbnail?.uri || frame?.thumbnailUri || frame?.uri || (fallbackAsset ? thumbnailUriForAsset(fallbackAsset) : null) || fallbackAsset?.uri || null;
  if (!uri) return <Radar size={26} />;
  return <img src={resolveMediaUri(uri)} alt="" loading="lazy" decoding="async" />;
}

function framesForAsset(asset = {}) {
  return (asset.metadata?.frames || asset.state?.keyframes || []).filter(Boolean);
}

function connectionFrameForAsset(asset = {}) {
  if (asset.type === "video") {
    const frames = framesForAsset(asset);
    return frames.find((frame) => frame.marker === "first") || frames[0] || {
      id: asset.id,
      marker: "video",
      uri: thumbnailUriForAsset(asset) || asset.uri
    };
  }
  return {
    id: asset.id,
    marker: "image",
    uri: thumbnailUriForAsset(asset) || asset.uri,
    width: asset.metadata?.width,
    height: asset.metadata?.height
  };
}

function reversePatternForMode(mode) {
  if (mode === "back-forward") return [-1, 1];
  if (mode === "triple-pass") return [1, -1, -1, 1, 1, -1];
  return [1, -1];
}

function modeLabel(mode) {
  if (mode === "back-forward") return "Back then forward";
  if (mode === "triple-pass") return "FB / BF / FB";
  return "Forward then back";
}

function LookBookView({ avatar, seedFrames, page, selectedAssetId, onPage, onSelectAsset, onExpand, onAppendNode, readerMode, onReaderMode }) {
  const maxPage = Math.max(0, Math.ceil(seedFrames.length / 2) - 1);
  const safePage = Math.min(page, maxPage);
  const leftAsset = seedFrames[safePage * 2] || null;
  const rightAsset = seedFrames[safePage * 2 + 1] || null;
  const activeAsset = seedFrames.find((asset) => asset.id === selectedAssetId) || leftAsset || rightAsset;
  const [nodeType, setNodeType] = useState(ASSET_NODE_TYPES[0].id);
  const [nodeBody, setNodeBody] = useState("");

  useEffect(() => {
    if (page !== safePage) onPage(safePage);
  }, [page, safePage, onPage]);

  useEffect(() => {
    if (!readerMode) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "ArrowRight") onPage(Math.min(maxPage, safePage + 1));
      if (event.key === "ArrowLeft") onPage(Math.max(0, safePage - 1));
      if (event.key === "Escape") onReaderMode(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readerMode, maxPage, safePage, onPage, onReaderMode]);

  function appendNode(event) {
    event.preventDefault();
    if (!activeAsset || !nodeBody.trim()) return;
    const definition = ASSET_NODE_TYPES.find((item) => item.id === nodeType);
    onAppendNode(activeAsset.id, {
      type: nodeType,
      label: definition?.label || "Look Book node",
      body: nodeBody
    });
    setNodeBody("");
  }

  return (
    <section className={`lookbook-view ${readerMode ? "reader-mode" : ""}`}>
      <div className="lookbook-header panel hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Look Book Mode</p>
          <h2>{avatar.primaryName} Seed Frames</h2>
        </div>
        <div className="lookbook-controls">
          <button className="reader-toggle hapa-btn" data-intent={readerMode ? "danger" : "primary"} onClick={() => onReaderMode(!readerMode)}>
            {readerMode ? <X size={16} /> : <Maximize2 size={16} />}
            <span>{readerMode ? "Exit Reader" : "Reader Mode"}</span>
          </button>
          <button className="icon-button hapa-btn" data-icon-only aria-label="Previous spread" onClick={() => onPage(Math.max(0, safePage - 1))} disabled={safePage <= 0}>
            <ChevronLeft size={18} />
          </button>
          <StatusChip label="SPREAD" value={`${safePage + 1}/${maxPage + 1}`} tone="cyan" />
          <button className="icon-button hapa-btn" data-icon-only aria-label="Next spread" onClick={() => onPage(Math.min(maxPage, safePage + 1))} disabled={safePage >= maxPage}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="lookbook-shell hapa-panel" data-variant="notch">
        <div className="lookbook-spread" key={`${leftAsset?.id || "blank"}-${rightAsset?.id || "blank"}`}>
          <LookBookPage asset={leftAsset} side="left" selected={selectedAssetId === leftAsset?.id} onSelectAsset={onSelectAsset} onExpand={onExpand} readerMode={readerMode} />
          <LookBookPage asset={rightAsset} side="right" selected={selectedAssetId === rightAsset?.id} onSelectAsset={onSelectAsset} onExpand={onExpand} readerMode={readerMode} />
        </div>
      </div>

      <aside className="lookbook-node-panel panel hapa-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><Plus size={15} /> Append Node</span>
          <em>{activeAsset?.metadata?.nodes?.length || 0}</em>
        </div>
        {activeAsset ? (
          <>
            <button className="lookbook-active-asset hapa-card" data-card-type="media" data-granularity="mini" data-state="selected" onClick={() => onSelectAsset(activeAsset.id)}>
              <AssetVisual asset={activeAsset} mode="thumb" />
              <span>
                <strong>{activeAsset.name}</strong>
                <small>{requirementById(activeAsset.requirementId)?.label || activeAsset.requirementId}</small>
              </span>
            </button>
            <form className="lookbook-node-form" onSubmit={appendNode}>
              <label>
                <span>Node type</span>
                <select value={nodeType} onChange={(event) => setNodeType(event.target.value)}>
                  {ASSET_NODE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
              </label>
              <label>
                <span>Node text</span>
                <textarea value={nodeBody} onChange={(event) => setNodeBody(event.target.value)} placeholder="route, story, prompt, or continuity note" />
              </label>
              <button className="hapa-btn" data-intent="primary" type="submit" disabled={!nodeBody.trim()}>
                <Plus size={14} />
                Append Node
              </button>
            </form>
            <div className="asset-node-list">
              {(activeAsset.metadata?.nodes || []).slice(0, 5).map((node) => (
                <article className="asset-node-card hapa-card" data-card-type="protocol" data-granularity="mini" key={node.id}>
                  <strong>{node.label}</strong>
                  <span>{node.body}</span>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="branch-empty hapa-panel" data-variant="resting">
            <BookOpen size={18} />
            <span>No seed frames available</span>
          </div>
        )}
      </aside>
    </section>
  );
}

function LookBookPage({ asset, side, selected, onSelectAsset, onExpand, readerMode = false }) {
  if (!asset) {
    return (
      <article className={`lookbook-page ${side} empty`} data-side={side}>
        <div className="lookbook-page-inner">
          <Radar size={34} />
          <strong>Awaiting seed frame</strong>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`lookbook-page ${side} ${selected ? "selected" : ""}`}
      data-side={side}
      role="button"
      tabIndex={0}
      onClick={() => onSelectAsset(asset.id)}
      onDoubleClick={() => onExpand(asset)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectAsset(asset.id);
        }
      }}
    >
      <div className="lookbook-page-inner">
        <div className="lookbook-page-media">
          <AssetVisual asset={asset} mode={readerMode ? "reader" : "preview"} eager={readerMode} />
          <button
            className="expand-button visible"
            title="Expand image"
            aria-label={`Expand ${asset.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onExpand(asset);
            }}
          >
            <Maximize2 size={13} />
          </button>
        </div>
        <footer>
          <p className="eyebrow">{requirementById(asset.requirementId)?.shortLabel || asset.requirementId}</p>
          <strong>{asset.name}</strong>
          <span>{asset.metadata?.originalFileName || "source file preserved"}</span>
          <div>
            {(asset.tags || []).slice(0, 4).map((tag) => <TagPill key={tag} tagId={tag} />)}
          </div>
        </footer>
      </div>
    </article>
  );
}

function AvatarModelPanel({ activeModel, modelAssets, selectedAssetId, onDrop, onPick, onSelect, onExpand, onDelete, onModelReady, onDefaultAnimation }) {
  const inputId = "avatar-3d-model-picker";
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    setViewerOpen(false);
  }, [activeModel?.id, activeModel?.uri]);

  return (
    <section
      className="avatar-model-panel hapa-panel"
      data-variant="notch"
      data-card-type="avatar"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="model-setup-grid">
        <div className="model-upload-stack">
          <div className="section-head hapa-panel-head compact">
            <span><Layers3 size={15} /> {AVATAR_MODEL_REQUIREMENT.label}</span>
            <em>{modelAssets.length}</em>
          </div>
          <div className="model-drop-zone hapa-panel" data-variant="resting">
            <input
              id={inputId}
              className="file-input"
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json,application/octet-stream"
              multiple
              onChange={onPick}
            />
            <label className="model-picker hapa-btn" data-intent="primary" htmlFor={inputId}>
              <Upload size={16} />
              <span>Upload 3D Avatar</span>
            </label>
            <div className="model-drop-copy">
              <Radar size={18} />
              <span>Drop animated GLB/GLTF rig here</span>
            </div>
          </div>
        </div>
        <div className="model-asset-list">
          <div className="model-list-head">
            <span>Attached rigs</span>
            <em>{activeModel ? "active" : "empty"}</em>
          </div>
          {modelAssets.length ? modelAssets.map((model) => (
            <article
              key={model.id}
              className={`model-asset-row hapa-card ${selectedAssetId === model.id ? "selected" : ""}`}
              data-card-type="avatar"
              data-granularity="mini"
              data-state={selectedAssetId === model.id ? "selected" : model.state?.active ? "active" : "idle"}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(model.id)}
              onDoubleClick={() => onExpand(model)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(model.id);
                }
              }}
            >
              <AssetVisual asset={model} />
              <span>
                <strong>{model.name}</strong>
                <small>{model.metadata?.model?.animations ?? 0} clips / {formatMegabytes(model.metadata?.sizeBytes)}</small>
                {model.state?.defaultAnimation && <small className="model-default-readout">Default: {model.state.defaultAnimation}</small>}
              </span>
              <em>{model.state?.active ? "active" : "rig"}</em>
              <span className="row-actions">
                <span
                  role="button"
                  tabIndex={0}
                  className="mini-action"
                  aria-label={`Expand ${model.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpand(model);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onExpand(model);
                    }
                  }}
                >
                  <Maximize2 size={12} />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="mini-action danger"
                  aria-label={`Delete ${model.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(model);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete(model);
                    }
                  }}
                >
                  <Trash2 size={12} />
                </span>
              </span>
            </article>
          )) : (
            <div className="branch-empty hapa-panel" data-variant="resting">
              <Layers3 size={18} />
              <span>No rig attached</span>
            </div>
          )}
        </div>
      </div>
      <div className="avatar-model-viewer-shell">
        <div className="model-viewer-toolbar">
          <div>
            <p className="eyebrow">3D Visualizer</p>
            <strong>{viewerOpen ? "Loaded on demand" : "Unloaded"}</strong>
            <span>{activeModel ? "Renderer and GLTF fetch stay paused until opened." : "Upload or select a rig to enable preview."}</span>
          </div>
          {viewerOpen ? (
            <button className="hapa-btn" data-intent="warning" type="button" onClick={() => setViewerOpen(false)}>
              <Pause size={14} />
              Unload Viewer
            </button>
          ) : (
            <button className="hapa-btn" data-intent="primary" type="button" onClick={() => setViewerOpen(true)} disabled={!activeModel}>
              <Play size={14} />
              Load 3D Viewer
            </button>
          )}
        </div>
        {viewerOpen ? (
          <Suspense fallback={<ThreeViewerLoading asset={activeModel} />}>
            <ThreeAvatarViewer
              asset={activeModel ? { ...activeModel, uri: resolveMediaUri(activeModel.uri) } : activeModel}
              onReady={(stats) => activeModel && onModelReady(activeModel.id, stats)}
              onDefaultClipChange={(clipName) => activeModel && onDefaultAnimation(activeModel.id, clipName)}
            />
          </Suspense>
        ) : (
          <ThreeViewerUnloaded asset={activeModel} />
        )}
      </div>
    </section>
  );
}

function ThreeViewerLoading({ asset }) {
  return (
    <div className="three-avatar-viewer" data-state={asset ? "asset" : "empty"}>
      <div className="three-stage three-stage-loading">
        <div className="asset-glyph avatar_3d_model">
          <span>3D</span>
          <em>{asset ? "loading" : "standby"}</em>
        </div>
        <div className="three-stage-hud">
          <span>Loading 3D stage</span>
          <strong>{asset?.name || "No 3D avatar uploaded"}</strong>
        </div>
      </div>
    </div>
  );
}

function ThreeViewerUnloaded({ asset }) {
  return (
    <div className="three-viewer-gate hapa-panel" data-variant="resting" data-state={asset ? "ready" : "empty"}>
      <div className="asset-glyph avatar_3d_model">
        <span>3D</span>
        <em>{asset ? "idle" : "empty"}</em>
      </div>
      <div>
        <p className="eyebrow">Visualizer Standby</p>
        <strong>{asset?.name || "No 3D avatar selected"}</strong>
        <span>{asset ? "Open the viewer when you want the full rig preview, animation controls, and camera modes." : "Attach a GLB/GLTF rig before loading the viewer."}</span>
      </div>
    </div>
  );
}

function DirectionTagger({ asset, onTag }) {
  const direction = asset.metadata?.direction || {};
  return (
    <section className="direction-panel hapa-panel" data-variant="resting">
      <div className="section-head hapa-panel-head compact">
        <span><Tags size={15} /> Direction Vector</span>
        <em>{DIRECTION_CHANNELS.filter((channel) => direction[channel.id]).length}/3</em>
      </div>
      <div className="direction-controls">
        {DIRECTION_CHANNELS.map((channel) => (
          <DirectionControl
            key={channel.id}
            channel={channel}
            value={direction[channel.id]}
            onChange={(nextDirection) => onTag(channel.id, nextDirection)}
          />
        ))}
      </div>
    </section>
  );
}

function DirectionControl({ channel, value, onChange }) {
  const selected = DIRECTION_OPTIONS.find((option) => option.id === value) || null;
  return (
    <div className="direction-control">
      <header>
        <strong>{channel.label}</strong>
        <span>{selected?.label || "untagged"}</span>
      </header>
      <div className="direction-pad" aria-label={`${channel.label} direction selector`}>
        <div className="direction-axis horizontal" />
        <div className="direction-axis vertical" />
        <div className="direction-center">
          <span style={{ "--angle": `${selected?.angle ?? 0}deg` }} />
          <em>{selected?.shortLabel || "--"}</em>
        </div>
        {DIRECTION_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={option.id === value ? "active" : ""}
            style={{ "--x": option.x, "--y": option.y }}
            title={`${channel.label}: ${option.label}`}
            aria-label={`${channel.label} ${option.label}`}
            onClick={() => onChange(option.id)}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagMatrix({ asset, quality, onTag }) {
  const firstNeeded = quality?.groups.find((group) => group.state === "missing" || group.state === "partial");
  const firstActive = firstNeeded || quality?.groups.find((group) => group.matches.length) || quality?.groups[0];
  const [activeGroupId, setActiveGroupId] = useState(firstActive?.id || TAG_GROUPS[0]?.id);
  const activeGroup = quality?.groups.find((group) => group.id === activeGroupId) || firstActive;
  const selectedTags = new Set(asset.tags || []);

  useEffect(() => {
    setActiveGroupId(firstActive?.id || TAG_GROUPS[0]?.id);
  }, [asset.id, firstActive?.id]);

  if (!quality || !activeGroup) return null;

  return (
    <section className="tag-console hapa-panel" data-variant="resting">
      <div className="tag-quality-card" data-rank={quality.rank}>
        <div className="quality-ring" style={{ "--quality": `${quality.percent}%` }}>
          <strong>{quality.rank}</strong>
          <span>{quality.percent}%</span>
        </div>
        <div>
          <p className="eyebrow">Asset Quality</p>
          <h3>{quality.completedGroups}/{quality.requiredGroups} groups locked</h3>
          <span>{quality.missingGroups.length ? `${quality.missingGroups.length} missing group${quality.missingGroups.length === 1 ? "" : "s"}` : "all required groups satisfied"}</span>
        </div>
      </div>

      <div className="tag-group-rail" role="tablist" aria-label="Tag groups">
        {quality.groups.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={group.id === activeGroup.id}
            className={`tag-group-tab ${group.id === activeGroup.id ? "active" : ""}`}
            data-state={group.state}
            style={tagAccentStyle(group.accent)}
            onClick={() => setActiveGroupId(group.id)}
          >
            <span className="tag-group-icon">{group.icon}</span>
            <strong>{group.shortLabel || group.label}</strong>
            <em>{tagGroupReadout(group)}</em>
          </button>
        ))}
      </div>

      <div
        className="tag-menu-card"
        data-state={activeGroup.state}
        style={tagAccentStyle(activeGroup.accent)}
      >
        <header>
          <div>
            <p className="eyebrow">{activeGroup.icon} {activeGroup.label}</p>
            <h3>{tagGroupStatusText(activeGroup)}</h3>
            <span>{activeGroup.description}</span>
          </div>
          <strong>{activeGroup.required ? `${activeGroup.completed}/${activeGroup.required}` : activeGroup.matches.length ? "tagged" : "optional"}</strong>
        </header>

        {activeGroup.matches.length > 0 && (
          <div className="active-tag-row" aria-label={`${activeGroup.label} active tags`}>
            {activeGroup.matches.slice(0, 6).map((tag) => (
              <TagPill key={tag.id} tagId={tag.id} fallback={tag} />
            ))}
          </div>
        )}

        <div className="tag-token-grid">
          {activeGroup.tags.map((tag) => {
            const active = selectedTags.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className={active ? "active" : ""}
                aria-pressed={active}
                onClick={() => onTag(tag.id)}
              >
                <span>{tag.icon}</span>
                <strong>{tag.label}</strong>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TagPill({ tagId, fallback = null }) {
  const definition = fallback || tagDefinitionById(tagId);
  return (
    <span className="tag-pill" style={tagAccentStyle(definition.accent)}>
      <i>{definition.icon}</i>
      <b>{definition.label}</b>
    </span>
  );
}

function dataTransferHas(event, type) {
  return Array.from(event.dataTransfer?.types || []).includes(type);
}

function splitTagInput(value) {
  return String(value || "")
    .split(/[,#]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sceneMediaIcon(requirementId) {
  if (requirementId === "scene_space_3d") return <Box size={22} />;
  if (requirementId === "scene_videos") return <Film size={22} />;
  if (requirementId === "scene_comics") return <BookOpen size={22} />;
  return <ImageIcon size={22} />;
}

function sectionAuditReadout(auditItem) {
  if (!auditItem) return "";
  const overfill = auditItem.overfill > 0 ? ` +${auditItem.overfill} overfill.` : ".";
  return `${auditItem.filled}/${auditItem.required}${overfill}`;
}

function previewSectionSlots(slots, sourceSlotId, targetSlotId) {
  if (!sourceSlotId || !targetSlotId || sourceSlotId === targetSlotId) return slots;
  const sourceIndex = slots.findIndex((slot) => slot.id === sourceSlotId);
  const targetIndex = slots.findIndex((slot) => slot.id === targetSlotId);
  if (sourceIndex < 0 || targetIndex < 0) return slots;

  const assetIds = slots.map((slot) => slot.assetId);
  const [movedAssetId] = assetIds.splice(sourceIndex, 1);
  assetIds.splice(targetIndex, 0, movedAssetId);

  return slots.map((slot, index) => ({
    ...slot,
    assetId: assetIds[index],
    previewShift: assetIds[index] !== slot.assetId
  }));
}

function SectionSelectionDock({ asset, requirement, slot, slotOrder, branchCount, onExpand, onDelete }) {
  return (
    <article
      className="section-selection-dock hapa-card"
      data-card-type={assetCardType(asset)}
      data-granularity="detail"
      data-state="selected"
      aria-live="polite"
    >
      <div className="selection-dock-visual">
        <AssetVisual asset={asset} controls={asset.type === "video"} />
      </div>
      <div className="selection-dock-copy">
        <p className="eyebrow">Selected in {requirement.shortLabel}</p>
        <strong>{asset.name}</strong>
        <span>{asset.metadata?.originalFileName || asset.metadata?.originalAssetName || requirement.label}</span>
        <div className="selection-dock-meta">
          <em>{slot.required === false ? "Overfill" : `Slot ${slotOrder}`}</em>
          <em>{asset.tags?.length || 0} tags</em>
          {branchCount > 0 && <em><GitBranch size={11} /> {branchCount}</em>}
        </div>
      </div>
      <div className="selection-dock-actions">
        <button
          className="hapa-btn detail-button"
          data-intent="primary"
          type="button"
          onClick={() => onExpand(asset)}
        >
          <Maximize2 size={13} />
          Expand
        </button>
        <button
          className="hapa-btn delete-detail-button"
          data-intent="danger"
          type="button"
          onClick={() => onDelete(asset)}
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>
    </article>
  );
}

function RequirementPanel({ requirement, requirementAudit, slots, assets, videoBranchMap, selectedAssetId, onSelectAsset, onDrop, onExpand, onDelete, onPreview, onPreviewHide }) {
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const orderedSlots = useMemo(
    () => [...slots].sort((a, b) => Number(a.required === false) - Number(b.required === false)),
    [slots]
  );
  const filledSlots = orderedSlots.filter((slot) => slot.assetId);
  const [dragState, setDragState] = useState({ sourceSlotId: null, targetSlotId: null, sourceAssetId: null });
  const previewFilledSlots = useMemo(
    () => previewSectionSlots(filledSlots, dragState.sourceSlotId, dragState.targetSlotId),
    [filledSlots, dragState.sourceSlotId, dragState.targetSlotId]
  );
  const defaultSlot = previewFilledSlots[0] || null;
  const defaultAsset = defaultSlot ? assetMap.get(defaultSlot.assetId) : null;
  const defaultBranchCount = defaultAsset ? videoBranchMap.get(defaultAsset.id)?.length || 0 : 0;
  const openTargets = slots.filter((slot) => slot.required !== false && !slot.assetId).length;
  const draggedAsset = dragState.sourceAssetId ? assetMap.get(dragState.sourceAssetId) : null;
  const dragTargetIndex = previewFilledSlots.findIndex((slot) => slot.id === dragState.targetSlotId);
  const dragTargetLabel = dragTargetIndex === 0 ? "Default" : dragTargetIndex > 0 ? `#${dragTargetIndex + 1}` : "";
  const clearSlotDrag = () => setDragState({ sourceSlotId: null, targetSlotId: null, sourceAssetId: null });
  const beginSlotDrag = (event, slot, asset) => {
    if (!asset) return;
    setDragState({ sourceSlotId: slot.id, targetSlotId: slot.id, sourceAssetId: asset.id });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-hapa-slot-id", slot.id);
    event.dataTransfer.setData("application/x-hapa-requirement-id", requirement.id);
    event.dataTransfer.setData("application/x-hapa-asset-id", asset.id);
    event.dataTransfer.setData("text/plain", asset.id);
  };
  const allowSlotDrop = (event, slot = null) => {
    event.preventDefault();
    const isSlotMove = dataTransferHas(event, "application/x-hapa-slot-id");
    event.dataTransfer.dropEffect = isSlotMove ? "move" : "copy";
    if (!slot || !isSlotMove) return;
    setDragState((current) => {
      if (!current.sourceSlotId || current.targetSlotId === slot.id) return current;
      return { ...current, targetSlotId: slot.id };
    });
  };

  return (
    <section
      className={`bucket-panel hapa-panel accent-${requirement.accent}`}
      data-variant="notch"
      data-card-type={requirementCardType(requirement.id)}
      data-state={dragState.sourceSlotId ? "dragging" : "idle"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        clearSlotDrag();
        onDrop(event, requirement.id);
      }}
    >
      <header>
        <div>
          <p>{requirement.shortLabel}</p>
          <h3>{requirement.label}</h3>
        </div>
        <div className="bucket-count">
          <strong>{requirementAudit.filled}/{requirementAudit.required}</strong>
          {requirementAudit.overfill > 0 && <em>+{requirementAudit.overfill} overfill</em>}
        </div>
      </header>
      <ProgressBar value={requirementAudit.percent} />
      <div
        className="bucket-drop-strip"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          clearSlotDrag();
          onDrop(event, requirement.id);
        }}
      >
        <Upload size={15} />
        <span>{openTargets > 0 ? `${openTargets} open` : "overfill"}</span>
      </div>
      {draggedAsset && dragTargetLabel && (
        <div className="section-drag-readout" aria-live="polite">
          <Grid3X3 size={13} />
          <span>Reorder preview</span>
          <strong>{draggedAsset.name}</strong>
          <em>{dragTargetLabel}</em>
        </div>
      )}
      {defaultAsset && (
        <article
          className={`section-hero hapa-card ${selectedAssetId === defaultAsset.id ? "selected" : ""} ${dragState.sourceAssetId === defaultAsset.id ? "dragging-asset" : ""} ${dragState.targetSlotId === defaultSlot.id ? "drop-target" : ""} ${defaultSlot.previewShift ? "preview-shift" : ""}`}
          data-card-type={assetCardType(defaultAsset)}
          data-granularity="standard"
          data-state={dragState.sourceAssetId === defaultAsset.id ? "dragging" : selectedAssetId === defaultAsset.id ? "selected" : "active"}
          data-slot-id={defaultSlot.id}
          data-asset-id={defaultAsset.id}
          data-order="1"
          draggable
          role="button"
          tabIndex={0}
          onClick={() => onSelectAsset(defaultAsset.id)}
          onDoubleClick={() => onExpand(defaultAsset)}
          onDragStart={(event) => beginSlotDrag(event, defaultSlot, defaultAsset)}
          onDragOver={(event) => allowSlotDrop(event, defaultSlot)}
          onDragEnter={(event) => allowSlotDrop(event, defaultSlot)}
          onDragEnd={clearSlotDrag}
          onDrop={(event) => {
            event.stopPropagation();
            clearSlotDrag();
            onDrop(event, requirement.id, defaultSlot.id, defaultAsset);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectAsset(defaultAsset.id);
            }
          }}
        >
          <div className="section-hero-visual">
            <AssetThumbnail
              asset={defaultAsset}
              onPreview={onPreview}
              onPreviewHide={onPreviewHide}
              meta={{ attached: true, defaultForSection: true, slotLabel: "Default" }}
            />
            <span className="default-chip">Default</span>
            {defaultBranchCount > 0 && <em className="branch-chip"><GitBranch size={11} /> {defaultBranchCount}</em>}
          </div>
          <div className="section-hero-copy">
            <p className="eyebrow">Section Hero</p>
            <strong>{defaultAsset.name}</strong>
            <span>{defaultAsset.metadata?.originalFileName || defaultAsset.metadata?.originalAssetName || "source file preserved"}</span>
          </div>
          <button
            className="expand-button"
            title="Expand default image"
            aria-label={`Expand ${defaultAsset.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onExpand(defaultAsset);
            }}
          >
            <Maximize2 size={13} />
          </button>
        </article>
      )}
      <div className="slot-grid">
        {previewFilledSlots.map((slot, index) => {
          const asset = assetMap.get(slot.assetId);
          if (!asset) return null;
          const branchCount = asset ? videoBranchMap.get(asset.id)?.length || 0 : 0;
          const isDefault = index === 0;
          return (
            <Fragment key={slot.id}>
              <div
                className={`slot hapa-card ${asset ? "filled" : ""} ${isDefault ? "default" : ""} ${slot.required === false ? "overfill" : ""} ${selectedAssetId === asset?.id ? "selected" : ""} ${dragState.sourceAssetId === asset.id ? "dragging-asset" : ""} ${dragState.targetSlotId === slot.id ? "drop-target" : ""} ${slot.previewShift ? "preview-shift" : ""}`}
                data-card-type={assetCardType(asset)}
                data-granularity="mini"
                data-state={dragState.sourceAssetId === asset.id ? "dragging" : selectedAssetId === asset?.id ? "selected" : "idle"}
                data-priority={slot.required === false ? "3" : "2"}
                data-slot-id={slot.id}
                data-asset-id={asset.id}
                data-order={index + 1}
                role="button"
                tabIndex={0}
                draggable={Boolean(asset)}
                onClick={() => asset && onSelectAsset(asset.id)}
                onDoubleClick={() => asset && onExpand(asset)}
                onDragStart={(event) => beginSlotDrag(event, slot, asset)}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && asset) {
                    event.preventDefault();
                    onSelectAsset(asset.id);
                  }
                }}
                onDragOver={(event) => allowSlotDrop(event, slot)}
                onDragEnter={(event) => allowSlotDrop(event, slot)}
                onDragEnd={clearSlotDrag}
                onDrop={(event) => {
                  event.stopPropagation();
                  clearSlotDrag();
                  onDrop(event, requirement.id, slot.id, asset);
                }}
              >
                <AssetThumbnail
                  asset={asset}
                  onPreview={onPreview}
                  onPreviewHide={onPreviewHide}
                  meta={{ attached: true, overfill: slot.required === false, defaultForSection: isDefault, slotLabel: slot.label }}
                />
                <em className="slot-order">{isDefault ? "Default" : `#${index + 1}`}</em>
                <span>{asset.name}</span>
                {branchCount > 0 && <em className="branch-chip"><GitBranch size={11} /> {branchCount}</em>}
                <button
                  className="expand-button"
                  title="Expand image"
                  aria-label={`Expand ${asset.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpand(asset);
                  }}
                >
                  <Maximize2 size={13} />
                </button>
                <button
                  className="delete-button"
                  title="Delete asset"
                  aria-label={`Delete ${asset.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(asset);
                  }}
                >
                  <Trash2 size={13} />
                </button>
                {slot.required === false && <em className="overfill-chip">overfill</em>}
              </div>
              {selectedAssetId === asset.id && (
                <SectionSelectionDock
                  asset={asset}
                  requirement={requirement}
                  slot={slot}
                  slotOrder={index + 1}
                  branchCount={branchCount}
                  onExpand={onExpand}
                  onDelete={onDelete}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function MediaTile({ asset, selected, onSelect, onExpand, onDelete, onPreview, onPreviewHide }) {
  return (
    <article
      className={`media-tile hapa-card ${selected ? "selected" : ""}`}
      data-card-type={assetCardType(asset)}
      data-granularity="mini"
      data-state={selected ? "selected" : "idle"}
      data-priority="2"
      role="button"
      tabIndex={0}
      draggable
      onClick={onSelect}
      onDoubleClick={() => onExpand(asset)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-hapa-asset-id", asset.id);
        event.dataTransfer.setData("text/plain", asset.id);
        if (!asset.uri?.startsWith("data:")) {
          event.dataTransfer.setData("application/json", JSON.stringify(asset));
        }
      }}
    >
      <AssetThumbnail
        asset={asset}
        onPreview={onPreview}
        onPreviewHide={onPreviewHide}
        meta={{ attached: false, slotLabel: "Media Intake" }}
      />
      <strong>{asset.name}</strong>
      <span>{requirementById(asset.requirementId)?.shortLabel || "LOCAL IMAGE"}</span>
      <button
        className="expand-button"
        title="Expand image"
        aria-label={`Expand ${asset.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onExpand(asset);
        }}
      >
        <Maximize2 size={13} />
      </button>
      <button
        className="delete-button"
        title="Delete preview"
        aria-label={`Delete ${asset.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(asset);
        }}
      >
        <Trash2 size={13} />
      </button>
    </article>
  );
}

function AssetThumbnail({ asset, onPreview, onPreviewHide, meta }) {
  return (
    <div
      className="asset-thumb"
      onPointerEnter={(event) => onPreview(asset, event, meta)}
      onPointerLeave={onPreviewHide}
      onMouseEnter={(event) => onPreview(asset, event, meta)}
      onMouseLeave={onPreviewHide}
      onFocus={(event) => onPreview(asset, event, meta)}
      onBlur={onPreviewHide}
      tabIndex={-1}
    >
      <AssetVisual asset={asset} mode="thumb" />
    </div>
  );
}

function AssetVisual({ asset, controls = false, mode = "preview", eager = false }) {
  const source = mediaSourceForAsset(asset, mode);
  const [loaded, setLoaded] = useState(false);
  const mediaRef = useRef(null);

  useEffect(() => {
    setLoaded(false);
  }, [source?.uri, asset?.id, mode]);

  useEffect(() => {
    const node = mediaRef.current;
    if (!node) return;
    if (node.tagName === "IMG" && node.complete) setLoaded(true);
    if (node.tagName === "VIDEO" && node.readyState > 0) setLoaded(true);
  }, [source?.uri, source?.fullUri, asset?.id, mode]);

  if (!asset) return null;

  const canShowVideo = asset.type === "video" && controls && source?.fullUri && isRenderableMediaUri(source.fullUri);
  if (canShowVideo) {
    return (
      <div className={`asset-visual-shell mode-${mode} ${loaded ? "loaded" : "loading"}`} data-loading={loaded ? "ready" : "loading"}>
        {!loaded && <span className="media-loading-badge">loading media</span>}
        <video
          ref={mediaRef}
          className="asset-image asset-video"
          src={source.fullUri}
          poster={source.posterUri || undefined}
          controls={controls}
          muted={!controls}
          playsInline
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
          onLoadedMetadata={() => setLoaded(true)}
        />
      </div>
    );
  }

  if (source?.uri && isRenderableMediaUri(source.uri)) {
    const isFullRequest = mode === "full" || mode === "reader" || eager;
    return (
      <div className={`asset-visual-shell mode-${mode} ${loaded ? "loaded" : "loading"}`} data-loading={loaded ? "ready" : "loading"}>
        {!loaded && <span className="media-loading-badge">{source.kind === "thumbnail" ? "loading thumb" : "loading media"}</span>}
        <img
          ref={mediaRef}
          className="asset-image"
          src={source.uri}
          alt=""
          loading={isFullRequest ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={isFullRequest ? "high" : "low"}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </div>
    );
  }

  const tag = asset?.tags?.[0] || "media";
  return (
    <div className={`asset-glyph ${asset?.requirementId || ""}`}>
      <span>{asset?.name?.slice(0, 2).toUpperCase() || "AV"}</span>
      <em>{tag}</em>
    </div>
  );
}

function mediaSourceForAsset(asset, mode = "preview") {
  if (!asset) return null;
  const thumbnailUri = thumbnailUriForAsset(asset);
  const fullUri = asset.uri || thumbnailUri;
  const resolvedThumbnailUri = resolveMediaUri(thumbnailUri);
  const resolvedFullUri = resolveMediaUri(fullUri);
  const canRenderFullAsImage = asset.type === "image";
  if (mode === "thumb") {
    return {
      uri: resolvedThumbnailUri || (canRenderFullAsImage ? resolvedFullUri : null),
      fullUri: resolvedFullUri,
      posterUri: resolvedThumbnailUri || undefined,
      kind: thumbnailUri ? "thumbnail" : "full"
    };
  }
  if (mode === "reader" || mode === "full") {
    return {
      uri: asset.type === "video"
        ? resolvedThumbnailUri || resolvedFullUri
        : canRenderFullAsImage
          ? resolvedFullUri || resolvedThumbnailUri
          : resolvedThumbnailUri,
      fullUri: resolvedFullUri,
      posterUri: resolvedThumbnailUri || undefined,
      kind: "full"
    };
  }
  return {
    uri: resolvedThumbnailUri || (canRenderFullAsImage ? resolvedFullUri : null),
    fullUri: resolvedFullUri,
    posterUri: resolvedThumbnailUri || undefined,
    kind: thumbnailUri ? "thumbnail" : "full"
  };
}

function thumbnailUriForAsset(asset = {}) {
  if (!asset) return null;
  if (asset.metadata?.thumbnailUri) return asset.metadata.thumbnailUri;
  if (asset.metadata?.thumbnail?.uri) return asset.metadata.thumbnail.uri;
  const frames = asset.metadata?.frames || asset.state?.keyframes || [];
  const firstFrame = frames.find((frame) => frame.marker === "first") || frames[0];
  return firstFrame?.thumbnail?.uri || firstFrame?.thumbnailUri || firstFrame?.uri || null;
}

function defaultCloseupEmotionAsset(avatar = {}) {
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const slotted = (Array.isArray(avatar.slots) ? avatar.slots : [])
    .filter((slot) => slot.requirementId === "closeup_emotions" && slot.assetId)
    .map((slot) => assetById.get(slot.assetId))
    .filter(Boolean);
  const seen = new Set(slotted.map((asset) => asset.id));
  const unslotted = assets.filter((asset) => asset.requirementId === "closeup_emotions" && !seen.has(asset.id));
  const candidates = [...slotted, ...unslotted];
  const isUsablePortrait = (asset) => asset?.type === "image" || thumbnailUriForAsset(asset) || asset?.uri;

  return candidates.find((asset) => asset?.type === "image" && asset.metadata?.defaultForSection) ||
    candidates.find((asset) => asset?.type === "image" && asset.processing?.defaultForSection) ||
    candidates.find((asset) => asset?.metadata?.defaultForSection && isUsablePortrait(asset)) ||
    candidates.find((asset) => asset?.processing?.defaultForSection && isUsablePortrait(asset)) ||
    candidates.find((asset) => asset?.type === "image") ||
    candidates.find(isUsablePortrait) ||
    null;
}

function modelStatsMatch(asset, stats = {}) {
  const model = asset?.metadata?.model || {};
  const numericKeys = ["vertices", "objects", "animations"];
  const numbersMatch = numericKeys.every((key) => Number(model[key] || 0) === Number(stats[key] || 0));
  if (!numbersMatch) return false;
  return clipsSignature(model.clips) === clipsSignature(stats.clips) &&
    JSON.stringify(model.bounds || null) === JSON.stringify(stats.bounds || null);
}

function clipsSignature(clips = []) {
  return (Array.isArray(clips) ? clips : [])
    .map((clip) => `${clip.name || ""}:${Number(clip.duration || 0).toFixed(3)}`)
    .join("|");
}

function isRenderableMediaUri(uri) {
  return typeof uri === "string" && (/^\/sample\//.test(uri) || /^\/media\//.test(uri) || /^https?:/.test(uri) || uri.startsWith("data:") || uri.startsWith("blob:"));
}

function HoverPreviewCard({ preview }) {
  const asset = preview.asset;
  const requirement = requirementById(asset.requirementId);
  const width = 340;
  const height = 430;
  const viewportWidth = globalThis.window?.innerWidth || 1440;
  const viewportHeight = globalThis.window?.innerHeight || 900;
  const left = Math.max(12, Math.min(preview.x + 18, viewportWidth - width - 12));
  const top = Math.max(12, Math.min(preview.y + 18, viewportHeight - height - 12));
  const dimensions = asset.metadata?.width && asset.metadata?.height
    ? `${asset.metadata.width}x${asset.metadata.height}`
    : "size unknown";
  const tags = (asset.tags || []).slice(0, 6);

  return (
    <aside
      className="hover-preview-card hapa-card"
      data-card-type={assetCardType(asset)}
      data-granularity="detail"
      data-state="active"
      style={{ left, top }}
    >
      <div className="hover-preview-media">
        <AssetVisual asset={asset} mode="preview" />
      </div>
      <div className="hover-preview-body">
        <p className="eyebrow">{requirement?.shortLabel || preview.slotLabel || "Asset"}</p>
        <h3>{asset.name}</h3>
        <div className="hover-preview-metrics">
          <span>{dimensions}</span>
          {asset.metadata?.duration != null && <span>{formatDuration(asset.metadata.duration)}</span>}
          <span>{asset.source || "manual"}</span>
          <span>{asset.processing?.status || "asset"}</span>
          {preview.attached && <span>card</span>}
          {preview.defaultForSection && <span>default</span>}
          {preview.overfill && <span>overfill</span>}
        </div>
        <div className="hover-preview-tags">
          {tags.length ? tags.map((tag) => <TagPill key={tag} tagId={tag} />) : <span>untagged</span>}
        </div>
      </div>
    </aside>
  );
}

function createAssetExpansion(asset, collection = []) {
  if (!asset) return null;
  const assets = uniqueAssetCollection([...(Array.isArray(collection) ? collection : []), asset]);
  const index = Math.max(0, assets.findIndex((item) => item.id === asset.id));
  return {
    asset: assets[index] || asset,
    assets: assets.length ? assets : [asset],
    index
  };
}

function normalizeAssetExpansion(expansion) {
  if (!expansion) return null;
  if (expansion.asset) {
    const assets = uniqueAssetCollection([...(Array.isArray(expansion.assets) ? expansion.assets : []), expansion.asset]);
    const index = Math.max(0, assets.findIndex((asset) => asset.id === expansion.asset.id));
    return {
      asset: assets[index] || expansion.asset,
      assets: assets.length ? assets : [expansion.asset],
      index
    };
  }
  return createAssetExpansion(expansion, [expansion]);
}

function assetFromExpansionState(expansion) {
  return expansion?.asset || expansion || null;
}

function expansionMatchesAsset(expansion, assetId) {
  return assetFromExpansionState(expansion)?.id === assetId;
}

function updateAssetExpansion(expansion, asset) {
  const normalized = normalizeAssetExpansion(expansion);
  if (!normalized || !asset) return normalized;
  const assets = normalized.assets.map((item) => item.id === asset.id ? asset : item);
  const index = Math.max(0, assets.findIndex((item) => item.id === asset.id));
  return {
    ...normalized,
    assets,
    index,
    asset: assets[index] || asset
  };
}

function uniqueAssetCollection(assets = []) {
  const seen = new Set();
  return assets.filter((asset) => {
    if (!asset?.id || seen.has(asset.id)) return false;
    seen.add(asset.id);
    return asset.type === "model" || Boolean(asset.uri || thumbnailUriForAsset(asset));
  });
}

function wrapIndex(index, length) {
  if (!length) return 0;
  return ((index % length) + length) % length;
}

function AssetDetailModal({ asset, assets = [], activeIndex = 0, onClose, onNavigate, onDefaultAnimation }) {
  const carouselAssets = useMemo(() => uniqueAssetCollection([...(Array.isArray(assets) ? assets : []), asset]), [asset, assets]);
  const assetIndex = carouselAssets.findIndex((item) => item.id === asset.id);
  const safeIndex = assetIndex >= 0 ? assetIndex : Math.min(activeIndex, Math.max(0, carouselAssets.length - 1));
  const activeAsset = carouselAssets[safeIndex] || asset;
  const stageRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [zoomLoaded, setZoomLoaded] = useState(false);
  const requirement = requirementById(activeAsset.requirementId);
  const isModel = activeAsset.type === "model";
  const isZoomableImage = activeAsset.type === "image";
  const canNavigate = carouselAssets.length > 1;
  const source = isZoomableImage ? mediaSourceForAsset(activeAsset, "full") : null;
  const dimensions = activeAsset.metadata?.width && activeAsset.metadata?.height
    ? `${activeAsset.metadata.width} x ${activeAsset.metadata.height}`
    : isModel && activeAsset.metadata?.model?.bounds
      ? `${activeAsset.metadata.model.bounds.width} x ${activeAsset.metadata.model.bounds.height} x ${activeAsset.metadata.model.bounds.depth}`
      : "dimensions unknown";
  const zoomPercent = Math.round(zoom * 100);
  const naturalWidth = Number(activeAsset.metadata?.width) || 1600;
  const zoomStyle = zoom > 1
    ? {
        width: `${Math.round(naturalWidth * zoom)}px`,
        maxWidth: "none",
        maxHeight: "none"
      }
    : undefined;

  useEffect(() => {
    setZoom(1);
    setZoomLoaded(false);
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, [activeAsset.id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeTag = document.activeElement?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(activeTag)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (canNavigate && event.key === "ArrowLeft") {
        event.preventDefault();
        onNavigate?.(-1);
      } else if (canNavigate && event.key === "ArrowRight") {
        event.preventDefault();
        onNavigate?.(1);
      } else if (isZoomableImage && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        setZoom((current) => Math.min(6, Number((current + (current < 2 ? 1 : 0.75)).toFixed(2))));
      } else if (isZoomableImage && event.key === "-") {
        event.preventDefault();
        setZoom((current) => Math.max(1, Number((current - 0.75).toFixed(2))));
      } else if (isZoomableImage && event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canNavigate, isZoomableImage, onClose, onNavigate]);

  function setZoomLevel(nextZoom, event = null) {
    const stage = stageRef.current;
    const boundedZoom = Math.max(1, Math.min(6, Number(nextZoom.toFixed(2))));
    if (!stage || !event) {
      setZoom(boundedZoom);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const anchorX = event.clientX - rect.left + stage.scrollLeft;
    const anchorY = event.clientY - rect.top + stage.scrollTop;
    const viewportX = event.clientX - rect.left;
    const viewportY = event.clientY - rect.top;
    const ratio = boundedZoom / zoom;
    setZoom(boundedZoom);
    requestAnimationFrame(() => {
      stage.scrollLeft = Math.max(0, anchorX * ratio - viewportX);
      stage.scrollTop = Math.max(0, anchorY * ratio - viewportY);
    });
  }

  function zoomIn(event = null) {
    setZoomLevel(zoom + (zoom < 2 ? 1 : 0.75), event);
  }

  function zoomOut() {
    setZoomLevel(zoom - 0.75);
  }

  function resetZoom() {
    setZoomLevel(1);
    stageRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${activeAsset.name} detail viewer`} onClick={onClose}>
      <section
        className={`asset-modal hapa-card ${canNavigate ? "has-carousel" : ""}`}
        data-card-type={assetCardType(activeAsset)}
        data-granularity="detail"
        data-state="selected"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">
              {requirement?.label || "Image detail"}
              {canNavigate && <span className="asset-carousel-count">{safeIndex + 1} / {carouselAssets.length}</span>}
            </p>
            <h2>{activeAsset.name}</h2>
          </div>
          <div className="asset-modal-actions">
            {isZoomableImage && (
              <div className="asset-zoom-toolbar" aria-label="Image zoom controls">
                <button className="icon-button hapa-btn" data-icon-only type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={zoomOut}>
                  <ZoomOut size={17} />
                </button>
                <span className="asset-zoom-readout">{zoomPercent}%</span>
                <button className="icon-button hapa-btn" data-icon-only type="button" aria-label="Zoom in" disabled={zoom >= 6} onClick={() => zoomIn()}>
                  <ZoomIn size={17} />
                </button>
                <button className="icon-button hapa-btn" data-icon-only type="button" aria-label="Reset zoom" disabled={zoom === 1} onClick={resetZoom}>
                  <RefreshCw size={16} />
                </button>
              </div>
            )}
          </div>
          <button className="icon-button hapa-btn" data-icon-only aria-label="Close image detail" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {canNavigate && (
          <>
            <button className="asset-modal-nav previous hapa-btn" type="button" aria-label="Previous asset" onClick={() => onNavigate?.(-1)}>
              <ChevronLeft size={24} />
            </button>
            <button className="asset-modal-nav next hapa-btn" type="button" aria-label="Next asset" onClick={() => onNavigate?.(1)}>
              <ChevronRight size={24} />
            </button>
          </>
        )}
        <div className={`asset-modal-stage ${isZoomableImage ? "zoomable" : ""} ${zoom > 1 ? "zoomed" : ""}`} ref={stageRef}>
          {isModel ? (
            <Suspense fallback={<ThreeViewerLoading asset={activeAsset} />}>
              <ThreeAvatarViewer
                asset={{ ...activeAsset, uri: resolveMediaUri(activeAsset.uri) }}
                onDefaultClipChange={(clipName) => onDefaultAnimation?.(activeAsset.id, clipName)}
              />
            </Suspense>
          ) : isZoomableImage && source?.uri ? (
            <div
              className={`asset-zoom-frame ${zoom > 1 ? "is-zoomed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Zoom ${activeAsset.name}`}
              onClick={zoomIn}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  zoomIn();
                }
              }}
            >
              {!zoomLoaded && <span className="media-loading-badge">loading media</span>}
              <img
                className="asset-image asset-zoom-image"
                src={source.uri}
                alt=""
                loading="eager"
                decoding="async"
                fetchPriority="high"
                style={zoomStyle}
                onLoad={() => setZoomLoaded(true)}
                onError={() => setZoomLoaded(true)}
              />
            </div>
          ) : (
            <AssetVisual asset={activeAsset} controls={activeAsset.type === "video"} mode="full" eager />
          )}
        </div>
        <footer>
          <span>{dimensions}</span>
          {activeAsset.metadata?.duration != null && <span>{formatDuration(activeAsset.metadata.duration)}</span>}
          {isModel && <span>{activeAsset.metadata?.model?.animations ?? 0} clips</span>}
          <span>{activeAsset.metadata?.mimeType || activeAsset.type}</span>
          <span>{activeAsset.processing?.status || "asset"}</span>
          {activeAsset.processing?.attachedToCard && <span>attached to card</span>}
        </footer>
      </section>
    </div>
  );
}

function VideoBranchPanel({ parentAsset, branches, incomingLinks = [], onDrop, onPick, onSelect, onExpand, onDelete }) {
  const inputId = `video-branch-picker-${parentAsset.id}`;
  return (
    <section className="video-branch-panel hapa-panel" data-variant="resting">
      <div className="section-head hapa-panel-head compact">
        <span><GitBranch size={15} /> Video Branches</span>
        <em>{branches.length}</em>
      </div>
      <input
        id={inputId}
        className="file-input"
        type="file"
        accept="video/*"
        multiple
        onChange={(event) => onPick(event, parentAsset)}
      />
      <label className="video-picker hapa-btn" data-intent="warning" htmlFor={inputId}>
        <Film size={16} />
        <span>Add Video Branch</span>
      </label>
      <div
        className="video-drop-zone hapa-panel"
        data-variant="notch"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDrop(event, parentAsset)}
      >
        <GitBranch size={16} />
        <span>Drop videos onto this state</span>
      </div>
      <div className="video-branch-list">
        {branches.length ? branches.map((branch) => (
          <div
            key={branch.id}
            className="video-branch-row hapa-card"
            data-card-type="media"
            data-granularity="mini"
            data-state="idle"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(branch.id)}
            onDoubleClick={() => onExpand(branch)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(branch.id);
              }
            }}
          >
            <AssetVisual asset={branch} />
            <div>
              <strong>{branch.name}</strong>
              <span>{branch.tags.slice(0, 4).join(" / ") || "untagged"}</span>
              <VideoFrameStrip frames={branch.metadata?.frames || branch.state?.keyframes} compact />
            </div>
            <em>{formatDuration(branch.metadata?.duration)}</em>
            <button
              className="expand-button"
              title="Expand video"
              aria-label={`Expand ${branch.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onExpand(branch);
              }}
            >
              <Maximize2 size={13} />
            </button>
            <button
              className="delete-button"
              title="Delete video branch"
              aria-label={`Delete ${branch.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(branch);
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )) : (
          <div className="branch-empty hapa-panel" data-variant="resting">
            <Play size={18} />
            <span>No video branches</span>
          </div>
        )}
      </div>
      {incomingLinks.length > 0 && (
        <div className="incoming-link-list">
          <strong>End-frame arrivals</strong>
          {incomingLinks.map((link) => (
            <button key={link.id} className="link-map-row hapa-card" data-card-type="media" data-granularity="mini" data-state="idle" onClick={() => onSelect(link.fromAssetId)}>
              <GitBranch size={13} />
              <span>
                <b>{link.fromName}</b>
                <small>{link.linkType} / {link.reason || "no reason set"}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function VideoStatePanel({ video, parentAsset, assets, links, onSelectParent, onSelectAsset, onConnectEndFrame }) {
  const targetAssets = useMemo(
    () => assets.filter((asset) => asset.id !== video.id && (asset.type === "image" || asset.type === "video")),
    [assets, video.id]
  );
  const [targetId, setTargetId] = useState("");
  const [linkType, setLinkType] = useState(VIDEO_LINK_TYPES[0]);
  const [humanLabel, setHumanLabel] = useState("");
  const [reason, setReason] = useState("");
  const [agentInstruction, setAgentInstruction] = useState("");

  useEffect(() => {
    setTargetId((current) => (current && targetAssets.some((asset) => asset.id === current) ? current : targetAssets[0]?.id || ""));
  }, [targetAssets]);

  function submitLink(event) {
    event.preventDefault();
    if (!targetId) return;
    onConnectEndFrame(video, targetId, {
      linkType,
      humanLabel,
      reason,
      agentInstruction
    });
  }

  return (
    <section className="video-state-panel hapa-panel" data-variant="resting">
      <div className="section-head hapa-panel-head compact">
        <span><Link2 size={15} /> Start State</span>
        <em>{video.state?.branchIndex ? `B${video.state.branchIndex}` : "video"}</em>
      </div>
      {parentAsset ? (
        <button
          className="state-link-row hapa-card"
          data-card-type={assetCardType(parentAsset)}
          data-granularity="mini"
          data-state="idle"
          onClick={() => onSelectParent(parentAsset.id)}
        >
          <AssetVisual asset={parentAsset} />
          <span>
            <strong>{parentAsset.name}</strong>
            <small>{requirementById(parentAsset.requirementId)?.shortLabel || parentAsset.requirementId}</small>
          </span>
          <GitBranch size={15} />
        </button>
      ) : (
        <div className="branch-empty hapa-panel" data-variant="resting">
          <Radar size={18} />
          <span>Missing start frame</span>
        </div>
      )}
      <div className="section-head hapa-panel-head compact">
        <span><Film size={15} /> Captured Frames</span>
        <em>{(video.metadata?.frames || video.state?.keyframes || []).length}/3</em>
      </div>
      <VideoFrameStrip frames={video.metadata?.frames || video.state?.keyframes} />
      <form className="video-link-form" onSubmit={submitLink}>
        <div className="section-head hapa-panel-head compact">
          <span><GitBranch size={15} /> Link Last Frame</span>
          <em>{links.length}</em>
        </div>
        <label>
          <span>Target state</span>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            {targetAssets.filter((asset) => asset.type === "image").map((asset) => (
              <option key={asset.id} value={asset.id}>Image / {asset.name}</option>
            ))}
            {targetAssets.filter((asset) => asset.type === "video").map((asset) => (
              <option key={asset.id} value={asset.id}>Video / {asset.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Why it links</span>
          <select value={linkType} onChange={(event) => setLinkType(event.target.value)}>
            {VIDEO_LINK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          <span>Human label</span>
          <input value={humanLabel} onChange={(event) => setHumanLabel(event.target.value)} placeholder="e.g. helmet turn resolves into close-up" />
        </label>
        <label>
          <span>Reason</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What visual continuity or story beat connects the end frame to the target?" />
        </label>
        <label>
          <span>Agent instruction</span>
          <textarea value={agentInstruction} onChange={(event) => setAgentInstruction(event.target.value)} placeholder="How should an agent use this transition when planning a sequence?" />
        </label>
        <button className="hapa-btn" data-intent="primary" type="submit" disabled={!targetId}>
          <Link2 size={14} />
          Connect End Frame
        </button>
      </form>
      <div className="video-map-list">
        {links.length ? links.map((link) => (
          <button
            key={link.id}
            className="link-map-row hapa-card"
            data-card-type="media"
            data-granularity="mini"
            data-state="idle"
            onClick={() => onSelectAsset(link.targetAssetId)}
          >
            <GitBranch size={13} />
            <span>
              <b>{link.humanLabel || link.targetName}</b>
              <small>{link.linkType} / {link.reason || "no reason set"}</small>
            </span>
          </button>
        )) : (
          <div className="branch-empty hapa-panel" data-variant="resting">
            <Link2 size={18} />
            <span>No end-frame links</span>
          </div>
        )}
      </div>
    </section>
  );
}

function VideoFrameStrip({ frames = [], compact = false }) {
  const frameMap = new Map((frames || []).map((frame) => [frame.marker, frame]));
  return (
    <div className={`video-frame-strip ${compact ? "compact" : ""}`}>
      {VIDEO_FRAME_MARKERS.map((marker) => {
        const frame = frameMap.get(marker.id);
        return (
          <figure key={marker.id} className={frame ? "filled" : ""}>
            {frame ? <img src={resolveMediaUri(frame.uri)} alt="" loading="lazy" decoding="async" /> : <span />}
            <figcaption>{marker.id}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function HealingQueuePanel({ queue, onCopyPrompt }) {
  const jobs = queue?.jobs || [];
  const firstJob = jobs[0] || null;
  if (!queue) {
    return (
      <div className="panel hapa-panel heal-queue-panel" data-variant="resting">
        <div className="section-head hapa-panel-head">
          <span><WandSparkles size={15} /> Codex Heal Queue</span>
          <em>queued</em>
        </div>
        <div className="heal-queue-summary">
          <StatusChip label="QUEUE" value="IDLE" tone="gold" />
          <StatusChip label="WORK" value="PROMPTS" tone="cyan" />
        </div>
        <div className="heal-complete-state">
          <Loader2 size={20} />
          <strong>Preparing prompt packets</strong>
          <span>Kanban is usable while the full healing queue builds in idle time.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="panel hapa-panel heal-queue-panel" data-variant={jobs.length ? "hot" : "notch"}>
      <div className="section-head hapa-panel-head">
        <span><WandSparkles size={15} /> Codex Heal Queue</span>
        <em>{jobs.length ? `${jobs.length} queued` : "complete"}</em>
      </div>
      <div className="heal-queue-summary">
        <StatusChip label="MODEL" value={queue?.model || "gpt-image-2"} tone="cyan" />
        <StatusChip label="CODEX" value={queue?.codexTool || "image_gen"} tone="fuchsia" />
        <StatusChip label="MISSING" value={queue?.completeness?.missing || 0} tone={jobs.length ? "orange" : "green"} />
        <StatusChip label="HIGH" value={queue?.highPriority || 0} tone={queue?.highPriority ? "orange" : "green"} />
      </div>
      {firstJob ? (
        <article className="heal-job-card hapa-card" data-state="channeling">
          <header>
            <div>
              <small>{firstJob.requirementId}</small>
              <h3>{firstJob.title}</h3>
            </div>
            <strong>{firstJob.slotId}</strong>
          </header>
          <p>{firstJob.promptPreview}</p>
          <div className="heal-job-meta">
            <span><ImageIcon size={14} /> {firstJob.referenceCount} refs</span>
            <span><CheckCircle2 size={14} /> {firstJob.acceptanceCriteria.length} checks</span>
            <span>{firstJob.priority}</span>
          </div>
          <div className="heal-attach-plan">
            <span>Attach to</span>
            <strong>{firstJob.attachPlan?.slotId}</strong>
            <em>{firstJob.attachPlan?.statusAfterAttach}</em>
          </div>
          <button className="hapa-btn" data-intent="primary" onClick={() => onCopyPrompt(firstJob)}>
            <Clipboard size={15} />
            Copy GPT Image 2 Packet
          </button>
        </article>
      ) : (
        <div className="heal-complete-state">
          <CheckCircle2 size={20} />
          <strong>Avatar library target reached</strong>
          <span>No healing jobs are needed for this Avatar Card.</span>
        </div>
      )}
    </div>
  );
}

function QueueBufferInspector({ jobs, summary }) {
  const activeJobs = jobs.filter((job) => ["queued", "loading", "partial", "stale", "failed"].includes(job.status)).slice(0, 5);
  const visibleJobs = activeJobs.length ? activeJobs : jobs.slice(0, 3);
  return (
    <section
      className="queue-buffer-inspector hapa-panel"
      data-variant="resting"
      data-queue-state={summary.state}
      aria-label="Queue and buffer inspector"
    >
      <div className="section-head hapa-panel-head compact">
        <span><Radar size={14} /> Queue / Buffer</span>
        <em>{summary.active ? `${summary.active} active` : "ready"}</em>
      </div>
      <div className="queue-buffer-metrics">
        <span><strong>{summary.counts.loading || 0}</strong><small>loading</small></span>
        <span><strong>{summary.counts.queued || 0}</strong><small>queued</small></span>
        <span><strong>{summary.counts.failed || 0}</strong><small>failed</small></span>
      </div>
      <div className="queue-buffer-list">
        {visibleJobs.map((job) => (
          <article className={`queue-buffer-job status-${job.status}`} key={job.id} data-state={job.status}>
            <div>
              {job.status === "loading" ? <Loader2 size={13} /> : <ListChecks size={13} />}
              <strong>{job.label}</strong>
              <em>{job.status}</em>
            </div>
            <p>{job.detail || job.available || "Ready."}</p>
            {(job.available || job.queuedNext) && (
              <small>{[job.available, job.queuedNext].filter(Boolean).join(" Next: ")}</small>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Board({ title, lanes }) {
  const visibleCardLimit = 12;
  return (
    <div className="panel hapa-panel board-wrap" data-variant="notch">
      <div className="section-head hapa-panel-head">
        <span><KanbanSquare size={15} /> {title}</span>
        <em>{lanes.reduce((sum, lane) => sum + (lane.totalCards ?? lane.cards.length), 0)}</em>
      </div>
      <div className="kanban-board">
        {lanes.map((lane) => {
          const visibleCards = lane.cards.slice(0, visibleCardLimit);
          const laneTotal = lane.totalCards ?? lane.cards.length;
          const hiddenCount = Math.max(0, laneTotal - visibleCards.length);
          return (
            <section className={`kanban-lane accent-${lane.accent || "cyan"}`} key={lane.id}>
              <header>
                <strong>{lane.title}</strong>
                <span>{laneTotal}</span>
              </header>
              {visibleCards.map((card) => (
                <article
                  className={`kanban-card hapa-card status-${card.status}`}
                  data-card-type="quest"
                  data-granularity="mini"
                  data-state={kanbanCardState(card.status)}
                  key={card.id}
                >
                  <div>
                    <BadgeCheck size={14} />
                    <span>{card.status}</span>
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
              {hiddenCount > 0 && (
                <div className="kanban-card hapa-card board-overflow-card" data-card-type="quest" data-granularity="mini" data-state="idle">
                  <div>
                    <ListChecks size={14} />
                    <span>buffered</span>
                  </div>
                  <h3>{hiddenCount} more cards</h3>
                  <p>Visible lane render is capped for route latency; full board data remains loaded in the local store.</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function itemDraftFromCard(card) {
  if (!card) {
    return {
      title: "",
      kind: "object",
      canonStatus: "scaffold",
      rank: "scaffold",
      summary: "",
      description: "",
      lore: "",
      utility: "",
      broadGameMechanics: "",
      currentPlaceName: "",
      currentShipName: "",
      currentGardenName: "",
      currentSystemName: "",
      holderAvatarIds: "",
      locationState: "known",
      avatarIds: "",
      teamIds: "",
      placeIds: "",
      sceneIds: "",
      nodeIds: "",
      shipIds: "",
      heroImagePrompt: "",
      twoDPrompt: "",
      threeDPrompt: "",
      comicPanelPrompt: "",
      explainerVideoPrompt: "",
      wikiEntryPrompt: "",
      negativePrompt: "",
      tags: "",
      hardpointHints: "",
      equipRules: "",
      effects: "",
      limits: ""
    };
  }
  return {
    title: card.title || "",
    kind: card.kind || "object",
    canonStatus: card.canonStatus || "scaffold",
    rank: card.rank || "",
    summary: card.summary || "",
    description: card.description || "",
    lore: card.lore || "",
    utility: (card.utility || []).join("\n"),
    broadGameMechanics: (card.broadGameMechanics || []).join("\n"),
    currentPlaceName: card.locationState?.currentPlaceName || "",
    currentShipName: card.locationState?.currentShipName || "",
    currentGardenName: card.locationState?.currentGardenName || "",
    currentSystemName: card.locationState?.currentSystemName || "",
    holderAvatarIds: (card.locationState?.holderAvatarIds || []).join(", "),
    locationState: card.locationState?.state || "known",
    avatarIds: (card.connections?.avatarIds || []).join(", "),
    teamIds: (card.connections?.teamIds || []).join(", "),
    placeIds: (card.connections?.placeIds || []).join(", "),
    sceneIds: (card.connections?.sceneIds || []).join(", "),
    nodeIds: (card.connections?.nodeIds || []).join(", "),
    shipIds: (card.connections?.shipIds || []).join(", "),
    heroImagePrompt: card.mediaPrompts?.heroImage || "",
    twoDPrompt: card.mediaPrompts?.twoD || "",
    threeDPrompt: card.mediaPrompts?.threeD || "",
    comicPanelPrompt: card.mediaPrompts?.comicPanel || "",
    explainerVideoPrompt: card.mediaPrompts?.explainerVideo || "",
    wikiEntryPrompt: card.mediaPrompts?.wikiEntry || "",
    negativePrompt: card.mediaPrompts?.negativePrompt || "",
    tags: (card.tags || []).join(", "),
    hardpointHints: (card.equipment?.hardpointHints || []).join(", "),
    equipRules: (card.equipment?.equipRules || []).join("\n"),
    effects: (card.equipment?.effects || []).join("\n"),
    limits: (card.equipment?.limits || []).join("\n")
  };
}

function splitLines(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isVideoAsset(asset = {}) {
  return asset.type === "video" || /^video\//i.test(asset.mimeType || "") || /\.(mp4|m4v|mov|webm)$/i.test(String(asset.uri || ""));
}

function isImageAsset(asset = {}) {
  return asset.type === "image" || /^image\//i.test(asset.mimeType || "") || isImageLikeUri(asset.uri);
}

function isImageLikeUri(uri = "") {
  return /^data:image\//i.test(String(uri || "")) || /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(String(uri || ""));
}

function itemMediaPosterUri(asset = {}) {
  const candidates = [
    asset.thumbnailUri,
    asset.thumbnail?.uri,
    asset.metadata?.thumbnailUri,
    asset.metadata?.thumbnail?.uri,
    isImageAsset(asset) ? asset.uri : ""
  ];
  return candidates.find((uri) => isImageLikeUri(uri)) || "";
}

function backgroundlessTarotInfoForAsset(asset = {}) {
  const playback = backgroundlessPlaybackForAsset(asset);
  if (!playback.state) return null;
  return {
    schemaVersion: playback.state.schemaVersion,
    status: playback.status,
    ready: playback.ready,
    hasAlpha: playback.hasAlpha,
    uri: playback.ready ? resolveMediaUri(playback.uri) : "",
    sourceUri: playback.sourceUri ? resolveMediaUri(playback.sourceUri) : "",
    originalUri: asset.uri ? resolveMediaUri(asset.uri) : "",
    posterUri: playback.posterUri ? resolveMediaUri(playback.posterUri) : "",
    variantCount: playback.state.variants?.length || 0,
    taskId: playback.state.taskId || "",
    sourceVideoHash: playback.state.sourceVideoHash || "",
    updatedAt: playback.state.updatedAt || ""
  };
}

function playbackUriForVideoAsset(asset = {}) {
  return asset.uri || "";
}

function chooseProductionCardMedia(card = {}) {
  const assets = card?.mediaAssets || [];
  const videoAssets = itemVideoAssets(card);
  const imageAssets = assets
    .filter((asset) => !isVideoAsset(asset) && asset.uri && isImageAsset(asset))
    .sort((a, b) =>
      mediaResolutionScore(b) - mediaResolutionScore(a) ||
      Number(Boolean(itemMediaPosterUri(b))) - Number(Boolean(itemMediaPosterUri(a))) ||
      compareText(a.name || a.title, b.name || b.title)
    );
  const mediaLinks = [
    ...(card?.tarotCard?.mediaLinks || []),
    ...(card?.episodeCard?.mediaLinks || [])
  ];
  const pairedLinkChoices = mediaLinks
    .filter((link) => link?.videoUri)
    .map((link, index) => {
      const imageAsset = imageAssets.find((asset) => sameMediaUri(asset.uri, link.imageUri));
      const videoAsset = videoAssets.find((asset) => sameMediaUri(asset.uri, link.videoUri));
      const backgroundless = videoAsset ? backgroundlessTarotInfoForAsset(videoAsset) : null;
      const imageUri = link.imageUri || imageAsset?.uri || link.posterUri || thumbnailUriForAsset(videoAsset) || itemMediaPosterUri(videoAsset || {});
      const previewUri = imageUri || link.posterUri || itemMediaPosterUri(videoAsset || {});
      return {
        priority: imageUri ? 3 : 2,
        reason: imageUri ? "paired-high-res-image-loop" : "linked-loop",
        highResImageUri: imageUri,
        previewUri,
        videoUri: videoAsset ? playbackUriForVideoAsset(videoAsset) : link.videoUri,
        originalVideoUri: link.videoUri,
        backgroundless,
        backgroundlessUri: backgroundless?.ready ? backgroundless.uri : "",
        hasAlpha: false,
        cutoutMode: "solid",
        videoAsset,
        score: (imageAsset ? mediaResolutionScore(imageAsset) : 0) + (videoAsset ? mediaResolutionScore(videoAsset) : 0) + 2000000 - index
      };
    });
  const bestPaired = pairedLinkChoices.sort((a, b) => b.score - a.score)[0];
  if (bestPaired?.videoUri) return bestPaired;

  const bestImage = imageAssets[0] || null;
  const bestVideo = videoAssets[0] || null;
  if (bestImage && bestVideo) {
    const backgroundless = backgroundlessTarotInfoForAsset(bestVideo);
    return {
      priority: 3,
      reason: "high-res-image-with-card-loop",
      highResImageUri: bestImage.uri,
      previewUri: itemMediaPosterUri(bestImage) || bestImage.uri || itemMediaPosterUri(bestVideo),
      videoUri: playbackUriForVideoAsset(bestVideo),
      originalVideoUri: bestVideo.uri,
      backgroundless,
      backgroundlessUri: backgroundless?.ready ? backgroundless.uri : "",
      hasAlpha: false,
      cutoutMode: "solid",
      videoAsset: bestVideo,
      score: mediaResolutionScore(bestImage) + mediaResolutionScore(bestVideo) + 1000000
    };
  }
  if (bestVideo) {
    const posterUri = itemMediaPosterUri(bestVideo) || thumbnailUriForAsset(bestVideo) || "";
    const backgroundless = backgroundlessTarotInfoForAsset(bestVideo);
    return {
      priority: 2,
      reason: "looping-video-only",
      highResImageUri: posterUri,
      previewUri: posterUri,
      videoUri: playbackUriForVideoAsset(bestVideo),
      originalVideoUri: bestVideo.uri,
      backgroundless,
      backgroundlessUri: backgroundless?.ready ? backgroundless.uri : "",
      hasAlpha: false,
      cutoutMode: "solid",
      videoAsset: bestVideo,
      score: mediaResolutionScore(bestVideo)
    };
  }
  const previewUri = itemPreviewUri(card);
  return {
    priority: previewUri ? 1 : 0,
    reason: previewUri ? "image-only-audit-hidden" : "no-production-media",
    highResImageUri: bestImage?.uri || previewUri || "",
    previewUri: previewUri || bestImage?.uri || "",
    videoUri: "",
    originalVideoUri: "",
    backgroundless: null,
    backgroundlessUri: "",
    hasAlpha: false,
    cutoutMode: "solid",
    videoAsset: null,
    score: mediaResolutionScore(bestImage || itemPreviewAsset(card) || {})
  };
}

function sameMediaUri(left = "", right = "") {
  if (!left || !right) return false;
  return normalizeComparableMediaUri(left) === normalizeComparableMediaUri(right);
}

function normalizeComparableMediaUri(uri = "") {
  return String(uri || "").split("?")[0].replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "/");
}

function itemPreviewUri(card) {
  const assets = card?.mediaAssets || [];
  const imageAsset = assets.find((asset) => itemMediaPosterUri(asset) && !isVideoAsset(asset));
  if (imageAsset) return itemMediaPosterUri(imageAsset);
  const videoAsset = assets.find((asset) => isVideoAsset(asset) && itemMediaPosterUri(asset));
  if (videoAsset) return itemMediaPosterUri(videoAsset);
  const anyPoster = assets.find((asset) => itemMediaPosterUri(asset));
  if (anyPoster) return itemMediaPosterUri(anyPoster);
  return "";
}

function itemCardType(card) {
  if (!card) return "resource";
  const semanticType = itemSemanticType(card);
  if (["protocol", "skill", "node", "ship", "location", "item", "media"].includes(semanticType)) return semanticType;
  return "resource";
}

function itemPreviewAsset(card) {
  const assets = card?.mediaAssets || [];
  return assets.find((asset) => itemMediaPosterUri(asset) && !isVideoAsset(asset)) ||
    assets.find((asset) => itemMediaPosterUri(asset)) ||
    assets.find((asset) => asset.uri) ||
    null;
}

function itemVideoAsset(card) {
  return itemVideoAssets(card)[0] || null;
}

function itemVideoAssets(card) {
  return (card?.mediaAssets || [])
    .filter((asset) => isVideoAsset(asset) && asset.uri)
    .sort((a, b) =>
      mediaResolutionScore(b) - mediaResolutionScore(a) ||
      compareText(a.name || a.title, b.name || b.title)
    );
}

function tarotVideoSourceFromAsset(asset = {}, label = "Video loop") {
  if (!asset?.uri) return null;
  const playback = backgroundlessPlaybackForAsset(asset);
  const backgroundless = backgroundlessTarotInfoForAsset(asset);
  const posterUri = itemMediaPosterUri(asset) || thumbnailUriForAsset(asset) || "";
  return {
    id: asset.id || asset.assetId || asset.uri,
    uri: resolveMediaUri(asset.uri),
    originalUri: resolveMediaUri(asset.uri),
    sourceUri: resolveMediaUri(playback.sourceUri || asset.uri),
    solidUri: resolveMediaUri(asset.uri),
    backgroundlessUri: playback.ready ? resolveMediaUri(playback.uri) : "",
    posterUri: posterUri ? resolveMediaUri(posterUri) : "",
    label: label || asset.name || asset.title || "Video loop",
    score: mediaResolutionScore(asset) || avatarAssetResolutionScore(asset),
    backgroundless,
    hasAlpha: false,
    cutoutMode: "solid"
  };
}

function uniqueTarotVideoSources(sources = []) {
  const seen = new Set();
  return sources
    .filter((source) => source?.uri)
    .filter((source) => {
      const key = source.sourceUri || source.originalUri || source.uri || source.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function tarotVideoSourcesForAvatar(avatar = {}, options = {}) {
  const name = avatar.primaryName || avatar.name || avatar.id || "Avatar";
  const poolAssets = pickAvatarBackdropVideos(avatar);
  const windowSize = Number(options.windowSize || 0);
  const projectedAssets = windowSize > 0 && poolAssets.length > windowSize
    ? rotatingAvatarLoopWindow(poolAssets, windowSize, options.seed || avatar.id || name)
    : poolAssets;
  return projectedAssets
    .map((asset, index) => {
      const source = tarotVideoSourceFromAsset(asset, `${name} loop ${index + 1}`);
      if (!source) return null;
      return {
        ...source,
        avatarId: avatar.id || "",
        avatarName: name,
        poolKind: "avatar-loop-pool",
        poolIndex: Math.max(0, poolAssets.findIndex((candidate) => candidate === asset || candidate.id === asset.id)),
        poolEligibleCount: poolAssets.length,
        poolProjectionWindow: windowSize > 0 ? Math.min(windowSize, poolAssets.length) : poolAssets.length
      };
    })
    .filter(Boolean);
}

function buildAvatarLoopPoolDescriptor(avatar = {}, videoSources = []) {
  return {
    schemaVersion: "hapa.tarot-draw.avatar-loop-pool.v1",
    kind: "avatar-loop-pool",
    avatarId: avatar.id || "",
    avatarName: avatar.primaryName || avatar.name || avatar.id || "Avatar",
    eligibleCount: videoSources.length,
    projectedCount: videoSources.length,
    staticCap: false,
    policy: "runtime-cursor-queue",
    activeScreenLimit: 3,
    preloadQueueMin: 6,
    note: "Every eligible avatar loop remains in the pool; only active screens and preload queue are bounded."
  };
}

function rotatingAvatarLoopWindow(assets = [], windowSize = 12, seed = "") {
  if (!assets.length) return [];
  const limit = Math.max(1, Math.min(windowSize, assets.length));
  const offset = stableLoopOffset(seed, assets.length);
  const windowed = [];
  for (let index = 0; index < assets.length && windowed.length < limit; index += 1) {
    windowed.push(assets[(offset + index) % assets.length]);
  }
  return windowed;
}

function stableLoopOffset(seed = "", modulo = 1) {
  const length = Math.max(1, modulo);
  let hash = 2166136261;
  for (const char of String(seed || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function buildItemTarotVideoSources(card = {}, primaryVideoAsset = null, avatarIds = [], avatarById = new Map()) {
  const title = card.tarotCard?.title || card.shipCard?.title || card.title || "Tarot card";
  const dbSources = (Array.isArray(card.videoSources) ? card.videoSources : []).map((source) => ({
    ...source,
    uri: resolveMediaUri(source.uri),
    originalUri: resolveMediaUri(source.originalUri || source.sourceUri || source.uri),
    sourceUri: resolveMediaUri(source.sourceUri || source.originalUri || source.uri),
    solidUri: resolveMediaUri(source.solidUri || source.uri),
    posterUri: source.posterUri ? resolveMediaUri(source.posterUri) : ""
  }));
  const itemSources = [
    ...dbSources,
    primaryVideoAsset,
    ...itemVideoAssets(card)
  ].filter(Boolean).map((asset, index) => {
    // If it's already a formatted source object, just return it
    if (asset.uri && asset.id && asset.label) return asset;
    return tarotVideoSourceFromAsset(asset, index === 0 ? `${title} card loop` : `${title} alternate loop`);
  });
  const linkedSources = (card.tarotCard?.mediaLinks || [])
    .filter((link) => link?.videoUri)
    .map((link, index) => ({
      id: link.id || `${card.id || title}-linked-loop-${index + 1}`,
      uri: resolveMediaUri(link.videoUri),
      originalUri: link.originalVideoUri || link.sourceUri || link.videoUri ? resolveMediaUri(link.originalVideoUri || link.sourceUri || link.videoUri) : "",
      sourceUri: link.sourceUri || link.originalVideoUri || link.videoUri ? resolveMediaUri(link.sourceUri || link.originalVideoUri || link.videoUri) : "",
      posterUri: link.posterUri || link.imageUri ? resolveMediaUri(link.posterUri || link.imageUri) : "",
      label: index === 0 ? `${title} linked loop` : `${title} linked alternate loop`,
      score: 0,
      backgroundless: link.backgroundless || null,
      backgroundlessUri: link.backgroundless?.ready && link.backgroundless?.uri ? resolveMediaUri(link.backgroundless.uri) : "",
      hasAlpha: false,
      cutoutMode: "solid"
    }));
  const avatarSources = avatarIds
    .map((avatarId) => avatarById.get(avatarId))
    .filter(Boolean)
    .flatMap((avatar) => tarotVideoSourcesForAvatar(avatar, {
      windowSize: TAROT_ITEM_AVATAR_LOOP_SOURCE_WINDOW,
      seed: `${card.id || title}:${avatar.id || avatar.primaryName || avatar.name || "avatar"}`
    }));
  return uniqueTarotVideoSources([...itemSources, ...linkedSources, ...avatarSources]);
}

function tarotStatsFromDetails(details = {}) {
  if (!details?.schemaVersion) return {};
  return {
    keywords: details.keywords?.length || 0,
    ocr: Math.round(Number(details.ocr?.confidence || 0) * 100),
    links: details.mediaLinks?.length || 0
  };
}

function pickAvatarHeroVideo(avatar = {}) {
  const videos = (avatar.assets || []).filter((asset) => asset.type === "video" && asset.uri);
  return videos.find((asset) => asset.requirementId === "loops" || (asset.tags || []).includes("hero")) ||
    videos.find((asset) => asset.parentAssetId || asset.state?.startFrameAssetId) ||
    videos[0] ||
    null;
}

function pickAvatarBackdropVideos(avatar = {}) {
  return (avatar.assets || [])
    .filter((asset) => asset.type === "video" && asset.uri)
    .sort((a, b) =>
      heroVideoRank(b) - heroVideoRank(a) ||
      avatarAssetResolutionScore(b) - avatarAssetResolutionScore(a) ||
      compareText(a.name, b.name)
    );
}

function pickAvatarHeroImage(avatar = {}) {
  const assets = avatar.assets || [];
  return defaultCloseupEmotionAsset(avatar) ||
    assets.find((asset) => asset.type === "image" && asset.requirementId === "fullbody_concept_art") ||
    assets.find((asset) => asset.type === "image" && asset.requirementId === "character_dossier") ||
    assets.find((asset) => asset.type === "image" && asset.uri) ||
    null;
}

const AVATAR_KIT_REQUIREMENT_IDS = new Set(["kit_sheet", "kit_poses", "kit_items"]);

function isAvatarKitAsset(asset = {}) {
  return AVATAR_KIT_REQUIREMENT_IDS.has(asset.requirementId);
}

function buildAvatarShowcaseGalleryGroups(avatar = {}) {
  const assets = (avatar.assets || []).filter((asset) => asset.uri || thumbnailUriForAsset(asset));
  const branchMap = createVideoBranchMap(avatar);
  const byLane = [
    {
      id: "identity",
      label: "Identity",
      assets: assets.filter((asset) => ["character_dossier", "fullbody_concept_art", "backgroundless_two_thirds"].includes(asset.requirementId))
    },
    {
      id: "emotion",
      label: "Emotion",
      assets: assets.filter((asset) => asset.requirementId === "closeup_emotions")
    },
    {
      id: "kit",
      label: "Kit",
      assets: assets.filter(isAvatarKitAsset)
    },
    {
      id: "motion",
      label: "Motion",
      assets: assets.filter((asset) => asset.type === "video" || asset.requirementId === "video_reverse_loops")
    },
    {
      id: "archive",
      label: "Archive",
      assets: assets.filter((asset) => !["character_dossier", "fullbody_concept_art", "backgroundless_two_thirds", "closeup_emotions", "kit_sheet", "kit_poses", "kit_items", "video_reverse_loops"].includes(asset.requirementId))
    }
  ];
  const seen = new Set();
  return byLane
    .map((group) => ({
      ...group,
      assets: group.assets
        .filter((asset) => {
          const key = `${group.id}:${asset.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => showcaseAssetSort(a, b, branchMap))
    }))
    .filter((group) => group.assets.length || group.id === "identity");
}

function showcaseAssetSort(a, b, branchMap = new Map()) {
  const aLoop = assetLoopPriority(a, branchMap);
  const bLoop = assetLoopPriority(b, branchMap);
  const aDefault = a.metadata?.defaultForSection || a.processing?.defaultForSection ? 1 : 0;
  const bDefault = b.metadata?.defaultForSection || b.processing?.defaultForSection ? 1 : 0;
  return bLoop - aLoop ||
    avatarAssetResolutionScore(b) - avatarAssetResolutionScore(a) ||
    bDefault - aDefault ||
    compareText(a.name, b.name);
}

function assetLoopPriority(asset = {}, branchMap = new Map()) {
  const branches = branchMap.get(asset.id) || [];
  if (asset.type === "image" && branches.some((branch) => branch.uri)) return 3;
  if (asset.type === "video" && asset.uri) return 2;
  if (asset.parentAssetId || asset.state?.startFrameAssetId) return 1;
  return 0;
}

function heroVideoRank(asset = {}) {
  const tags = asset.tags || [];
  return (tags.includes("hero") ? 4 : 0) +
    (asset.requirementId === "fullbody_concept_art" ? 3 : 0) +
    (asset.parentAssetId || asset.state?.startFrameAssetId ? 2 : 0) +
    (asset.requirementId === "video_reverse_loops" ? 1 : 0);
}

function avatarAssetResolutionScore(asset = {}) {
  const width = Number(asset.width || asset.metadata?.width || asset.metadata?.naturalWidth || asset.processing?.width || 0);
  const height = Number(asset.height || asset.metadata?.height || asset.metadata?.naturalHeight || asset.processing?.height || 0);
  return width * height;
}

function buildAvatarTarotCards(inventory = null, itemById = new Map()) {
  if (!inventory) return [];
  const orderedIds = [
    ...inventory.hardpoints.flatMap((hardpoint) => hardpoint.cardIds || []),
    ...(inventory.deck || []),
    ...(inventory.hand || []),
    ...(inventory.trainingDeck || [])
  ];
  const seen = new Set();
  return orderedIds
    .map((cardId) => itemById.get(cardId))
    .filter((card) => {
      if (!card || seen.has(card.id)) return false;
      seen.add(card.id);
      return card.cardType === "ship_card" || card.kind === "ship" || Boolean(card.shipCard);
    })
    .sort((a, b) =>
      Number(Boolean(itemVideoAsset(b))) - Number(Boolean(itemVideoAsset(a))) ||
      itemCardResolutionScore(b) - itemCardResolutionScore(a) ||
      compareText(a.title, b.title)
    )
    .slice(0, 12);
}

function itemCardResolutionScore(card = {}) {
  return Math.max(0, ...(card.mediaAssets || []).map((asset) => {
    const width = Number(asset.width || asset.metadata?.width || 0);
    const height = Number(asset.height || asset.metadata?.height || 0);
    return width * height;
  }));
}

function buildItemCatalogTelemetry(cards = [], inventoryStore = {}, avatarById = new Map()) {
  const avatarGroupKeys = new Set();
  const placeGroupKeys = new Set();
  for (const card of cards) {
    itemGroupKeys(card, "avatar", avatarById).forEach((key) => {
      if (key !== "all" && key !== "avatar:unassigned") avatarGroupKeys.add(key);
    });
    itemGroupKeys(card, "place", avatarById).forEach((key) => {
      if (key !== "all" && key !== "place:unplaced") placeGroupKeys.add(key);
    });
  }
  return {
    total: cards.length,
    withMedia: cards.filter((card) => (card.mediaAssets || []).length).length,
    withoutMedia: cards.filter((card) => !(card.mediaAssets || []).length).length,
    equipped: inventoryStore?.audit?.totalEquipments || 0,
    prompted: cards.filter((card) => card.mediaPrompts?.twoD && card.mediaPrompts?.threeD).length,
    avatarGroups: avatarGroupKeys.size,
    placeGroups: placeGroupKeys.size
  };
}

function buildItemGroupEntries(cards = [], mode = "type", avatarById = new Map()) {
  const byKey = new Map();
  const ensure = (key, label, caption = "") => {
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label,
        caption,
        count: 0,
        mediaCount: 0,
        equippedReady: 0
      });
    }
    return byKey.get(key);
  };

  ensure("all", "All Items", `${cards.length} total`);
  for (const card of cards) {
    const mediaCount = (card.mediaAssets || []).length ? 1 : 0;
    const equippedReady = (card.equipment?.hardpointHints || []).length ? 1 : 0;
    const allEntry = byKey.get("all");
    allEntry.mediaCount += mediaCount;
    allEntry.equippedReady += equippedReady;

    for (const key of itemGroupKeys(card, mode, avatarById)) {
      if (key === "all") continue;
      const entry = ensure(key, itemGroupLabel(key, mode, avatarById), itemGroupCaption(key, mode));
      entry.count += 1;
      entry.mediaCount += mediaCount;
      entry.equippedReady += equippedReady;
    }
  }
  byKey.get("all").count = cards.length;

  return [...byKey.values()]
    .map((entry) => ({
      ...entry,
      caption: `${entry.caption}${entry.caption ? " · " : ""}${entry.mediaCount} media`
    }))
    .sort((a, b) => {
      if (a.key === "all") return -1;
      if (b.key === "all") return 1;
      if (mode === "type") return itemTypeSortRank(a.key) - itemTypeSortRank(b.key) || a.label.localeCompare(b.label);
      return b.count - a.count || a.label.localeCompare(b.label);
    });
}

function itemGroupKeys(card, mode = "type", avatarById = new Map()) {
  if (!card) return ["all"];
  if (mode === "type") return [`type:${card.kind || "object"}`];
  if (mode === "avatar") {
    const ids = uniqueLocal([
      ...(card.connections?.avatarIds || []),
      ...(card.locationState?.holderAvatarIds || []),
      ...(card.locationState?.locatedAvatarIds || []),
      ...(card.mediaAssets || []).map((asset) => asset.avatarId)
    ]);
    return ids.length ? ids.map((id) => `avatar:${id}`) : ["avatar:unassigned"];
  }
  if (mode === "place") {
    const places = itemPlaceRefs(card);
    return places.length ? places.map((place) => place.key) : ["place:unplaced"];
  }
  return ["all"];
}

function itemGroupLabel(key, mode = "type", avatarById = new Map()) {
  if (key === "all") return "All Items";
  const [, rawValue = ""] = key.split(":");
  const value = rawValue || "unknown";
  if (mode === "type") return titleizeItemLabel(value);
  if (mode === "avatar") {
    if (value === "unassigned") return "Unassigned";
    return avatarById.get(value)?.primaryName || avatarById.get(value)?.names?.[0]?.name || titleizeItemLabel(value);
  }
  if (mode === "place") return value === "unplaced" ? "Unplaced" : titleizeItemLabel(value);
  return titleizeItemLabel(value);
}

function itemKindFilterLabel(kind = "all") {
  if (kind === "all") return "All";
  if (kind === "protocol") return "Protocols";
  if (kind === "skill") return "Skills";
  if (kind === "node") return "Nodes";
  return titleizeItemLabel(kind);
}

function itemGroupCaption(key, mode = "type") {
  if (key === "all") return "Catalog";
  if (mode === "type") return "Type layer";
  if (mode === "avatar") return "Avatar layer";
  if (mode === "place") return "Place layer";
  return "Group";
}

function itemTypeSortRank(key = "") {
  const order = [
    "all",
    "type:protocol",
    "type:skill",
    "type:node",
    "type:garden",
    "type:ship",
    "type:system",
    "type:item",
    "type:object"
  ];
  const rank = order.indexOf(key);
  return rank === -1 ? order.length : rank;
}

function sortItemCards(cards = [], sortMode = "title", avatarById = new Map()) {
  return [...cards].sort((a, b) => {
    if (sortMode === "kind") return compareText(a.kind, b.kind) || compareText(a.title, b.title);
    if (sortMode === "avatar") return compareText(itemPrimaryAvatarLabel(a, avatarById), itemPrimaryAvatarLabel(b, avatarById)) || compareText(a.title, b.title);
    if (sortMode === "place") return compareText(itemPrimaryPlaceLabel(a), itemPrimaryPlaceLabel(b)) || compareText(a.title, b.title);
    if (sortMode === "media") return ((b.mediaAssets || []).length - (a.mediaAssets || []).length) || compareText(a.title, b.title);
    if (sortMode === "updated") return compareText(b.updatedAt, a.updatedAt) || compareText(a.title, b.title);
    return compareText(a.title, b.title);
  });
}

function itemPrimaryAvatarLabel(card, avatarById = new Map()) {
  const key = itemGroupKeys(card, "avatar", avatarById)[0] || "";
  return itemGroupLabel(key, "avatar", avatarById);
}

function itemPrimaryPlaceLabel(card) {
  return itemPlaceRefs(card)[0]?.label || "Unplaced";
}

function itemPlaceRefs(card) {
  if (!card) return [];
  const location = card.locationState || {};
  const places = [
    location.currentPlaceName && { key: `place:${location.currentPlaceName}`, label: location.currentPlaceName },
    location.currentGardenName && { key: `place:${location.currentGardenName}`, label: location.currentGardenName },
    location.currentShipName && { key: `place:${location.currentShipName}`, label: location.currentShipName },
    location.currentSystemName && { key: `place:${location.currentSystemName}`, label: location.currentSystemName },
    ...(card.connections?.placeIds || []).map((id) => ({ key: `place:${id}`, label: id }))
  ].filter(Boolean);
  const byKey = new Map();
  for (const place of places) byKey.set(place.key, place);
  return [...byKey.values()];
}

function compareText(left = "", right = "") {
  return String(left || "").localeCompare(String(right || ""), undefined, { numeric: true, sensitivity: "base" });
}

function titleizeItemLabel(value = "") {
  return String(value || "")
    .replace(/^place:/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Unknown";
}

function uniqueLocal(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function assetCardType(asset) {
  if (!asset) return "media";
  if (asset.type === "model" && asset.requirementId === AVATAR_MODEL_REQUIREMENT_ID) return "avatar";
  if (asset.type === "model") return "resource";
  if (asset.type === "video" || asset.type === "image") return "media";
  if (asset.requirementId === "character_dossier") return "protocol";
  if (asset.requirementId === "kit_items" || asset.requirementId === "kit_sheet") return "resource";
  return "media";
}

function requirementCardType(requirementId) {
  if (requirementId === AVATAR_MODEL_REQUIREMENT_ID) return "avatar";
  if (requirementId === "character_dossier") return "protocol";
  if (requirementId === "kit_items" || requirementId === "kit_sheet") return "resource";
  return "media";
}

function tagAccentStyle(accent = "cyan") {
  const accents = {
    cyan: "var(--hapa-neon-cyan)",
    fuchsia: "var(--hapa-neon-magenta)",
    magenta: "var(--hapa-neon-magenta)",
    violet: "var(--hapa-neon-violet)",
    green: "var(--hapa-neon-green)",
    gold: "var(--hapa-neon-gold)",
    orange: "#ff9f1c",
    blue: "var(--hapa-neon-blue)",
    rose: "var(--hapa-neon-rose)",
    red: "var(--hapa-neon-red)"
  };
  return { "--tag-accent": accents[accent] || accents.cyan };
}

function tagGroupReadout(group) {
  if (group.required > 0) return `${group.completed}/${group.required}`;
  if (group.matches.length > 0) return `${group.matches.length}`;
  return "opt";
}

function tagGroupStatusText(group) {
  if (group.required === 0) return group.matches.length ? "Optional signals present" : "Optional menu";
  if (group.state === "complete") return "Group complete";
  if (group.state === "partial") return `${group.missing} signal${group.missing === 1 ? "" : "s"} missing`;
  return "Missing required signal";
}

function kanbanCardState(status) {
  if (status === "active") return "active";
  if (status === "blocked" || status === "error") return "error";
  return "idle";
}

function toneToIntent(tone) {
  if (tone === "green") return "success";
  if (tone === "orange" || tone === "gold") return "warning";
  if (tone === "rose" || tone === "red") return "danger";
  return "primary";
}

function StatusChip({ label, value, tone }) {
  return (
    <div className={`status-chip hapa-readout tone-${tone}`} data-intent={toneToIntent(tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button className="icon-button hapa-btn" data-icon-only aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="progress-track hapa-progress" style={{ "--pg-value": `${Math.max(0, Math.min(100, value))}%` }} aria-label={`Progress ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function CircularScore({ value }) {
  return (
    <div className="circular-score" style={{ "--score": `${value * 3.6}deg` }}>
      <span>{value}%</span>
    </div>
  );
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function formatMegabytes(bytes) {
  if (!Number.isFinite(bytes)) return "size --";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 1 : 2)} MB`;
}

function compactForDisplay(value) {
  if (!value) return "";
  return JSON.stringify(
    value,
    (key, item) => {
      if (key === "uri" && typeof item === "string" && item.length > 220) {
        return `${item.slice(0, 120)}... [${item.length.toLocaleString()} chars]`;
      }
      if (typeof item === "string" && item.length > 4000) {
        return `${item.slice(0, 220)}... [${item.length.toLocaleString()} chars]`;
      }
      return item;
    },
    2
  );
}

async function assetsFromDrop(event, requirementId, knownAssets = []) {
  const files = [...(event.dataTransfer.files || [])];
  if (files.length) {
    return assetsFromFiles(files, "slot-drop", requirementId);
  }

  const assetId = event.dataTransfer.getData("application/x-hapa-asset-id") || event.dataTransfer.getData("text/plain");
  const knownAsset = knownAssets.find((asset) => asset.id === assetId);
  if (knownAsset) return [knownAsset];

  const json = event.dataTransfer.getData("application/json");
  if (!json) return [];
  try {
    return [JSON.parse(json)];
  } catch {
    return [];
  }
}

async function assetsFromFiles(files, source = "file-picker", requirementId = "local_preview") {
  const mediaFiles = files.filter(isSupportedLocalAsset);
  const assets = [];
  for (const file of mediaFiles) {
    assets.push(await assetFromFile(file, source, requirementId));
    await waitForPaint();
  }
  return assets;
}

async function assetFromFile(file, source = "file-picker", requirementId = "local_preview", onStage = null) {
  onStage?.({ stage: "Reading file", detail: file.name, progress: 0.08 });
  const dataUrl = await fileToDataUrl(file);
  await waitForPaint();
  const type = inferLocalAssetKind(file);
  const mimeType = mimeTypeForFile(file, type);
  const assetId = `local-${file.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${file.lastModified || Date.now()}-${file.size}`;
  onStage?.({
    stage: type === "video" ? "Extracting first/mid/last frames" : type === "image" ? "Reading image dimensions" : "Reading model metadata",
    detail: file.name,
    progress: 0.28
  });
  await waitForPaint();
  const mediaMeta = type === "video"
    ? await videoMetadataWithFrames(dataUrl, file, assetId, onStage)
    : type === "image"
      ? await imageMetadataWithThumbnail(dataUrl, file, assetId, onStage)
      : type === "audio"
        ? await audioMetadata(dataUrl, file)
        : fileBundleMetadata(file, type);
  await waitForPaint();
  onStage?.({ stage: "Persisting local media", detail: file.name, progress: 0.78 });
  const persisted = await persistLocalMedia(file, dataUrl, mimeType);
  await waitForPaint();
  onStage?.({ stage: "Creating Avatar Card asset", detail: file.name, progress: 0.92 });
  const asset = createMediaAsset({
    id: assetId,
    name: file.name,
    uri: persisted?.uri || dataUrl,
    type,
    requirementId,
    tags: localAssetTags(type),
    source,
    notes: localAssetNotes(type),
    metadata: {
      originalFileName: file.name,
      mimeType,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      width: mediaMeta.width,
      height: mediaMeta.height,
      duration: mediaMeta.duration,
      format: mediaMeta.format,
      thumbnail: mediaMeta.thumbnail || null,
      thumbnailUri: mediaMeta.thumbnail?.uri || null,
      storage: persisted?.storage || null
    },
    processing: {
      status: "previewed",
      attachedToCard: false
    }
  });
  return type === "video" ? withVideoFrames(asset, mediaMeta.frames) : asset;
}

function isSupportedLocalAsset(file) {
  const inferred = inferAssetKind(file.name);
  return file.type.startsWith("image/")
    || file.type.startsWith("video/")
    || file.type.startsWith("audio/")
    || ["model", "archive", "doc"].includes(inferred);
}

function inferLocalAssetKind(file) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return inferAssetKind(file.name);
}

function localAssetTags(type) {
  if (type === "video") return ["local", "preview", "video", "branch", "motion"];
  if (type === "audio") return ["local", "preview", "audio", "song", "dear-papa"];
  if (type === "archive") return ["local", "preview", "stems", "archive", "dear-papa"];
  if (type === "doc") return ["local", "preview", "lyrics", "notes", "dear-papa"];
  if (type === "model") return ["local", "preview", "3d-avatar", "model", "rig", "animation"];
  return ["local", "preview", "reference"];
}

function localAssetNotes(type) {
  if (type === "video") return "Local video previewed for attachment as a branch from an image state.";
  if (type === "audio") return "Local audio previewed for attachment to a Hapa Song record.";
  if (type === "archive") return "Local stem/archive bundle previewed for attachment to a Hapa Song record.";
  if (type === "doc") return "Local document previewed for attachment to song lyrics, notes, or lineage.";
  if (type === "model") return "Local animated avatar model previewed for attachment to the Avatar Card.";
  return "Local image previewed in the intake tray before slot assignment.";
}

function mimeTypeForFile(file, type) {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (type === "model") return "application/octet-stream";
  if (type === "archive") return "application/octet-stream";
  if (type === "audio") return "audio/*";
  return "application/octet-stream";
}

function fileBundleMetadata(file, type = "file") {
  const extension = file.name.split(".").pop()?.toLowerCase() || "model";
  return {
    width: null,
    height: null,
    duration: null,
    format: extension,
    fileKind: type
  };
}

async function audioMetadata(dataUrl, file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const extension = file.name.split(".").pop()?.toLowerCase() || "audio";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve({
        width: null,
        height: null,
        duration: Number.isFinite(audio.duration) ? audio.duration : null,
        format: extension
      });
      audio.src = "";
    };
    const timer = window.setTimeout(finish, 2400);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish();
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish();
    };
    audio.src = dataUrl;
  });
}

async function persistLocalMedia(file, dataUrl, mimeType = file.type) {
  try {
    const response = await fetch(`${API_BASE}/api/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `media-${file.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${file.lastModified || Date.now()}-${file.size}`,
        name: file.name,
        mimeType,
        dataUrl
      })
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function saveWorldDraft(graph) {
  try {
    localStorage.setItem(WORLD_DRAFT_STORAGE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      graph
    }));
  } catch {
    // Browser storage is a safety net; the UI remains usable without it.
  }
}

function readWorldDraft() {
  try {
    const raw = localStorage.getItem(WORLD_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearWorldDraft() {
  try {
    localStorage.removeItem(WORLD_DRAFT_STORAGE_KEY);
  } catch {
    // No-op when storage is unavailable.
  }
}

function readAvatarDraftStore() {
  try {
    const raw = localStorage.getItem(AVATAR_DRAFT_STORAGE_KEY);
    return normalizeAvatarDraftStore(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeAvatarDraftStore({});
  }
}

function writeAvatarDraftStore(store) {
  try {
    const normalized = normalizeAvatarDraftStore(store);
    if (normalized.records.length === 0) {
      localStorage.removeItem(AVATAR_DRAFT_STORAGE_KEY);
      return normalized;
    }
    localStorage.setItem(AVATAR_DRAFT_STORAGE_KEY, JSON.stringify({
      ...normalized,
      savedAt: new Date().toISOString()
    }));
    return normalized;
  } catch {
    return normalizeAvatarDraftStore(store);
  }
}

function upsertAvatarDraft(avatar, reason = "local-draft") {
  const nextStore = upsertAvatarDraftRecord(readAvatarDraftStore(), avatar, { reason });
  return writeAvatarDraftStore(nextStore);
}

function clearAvatarDraft(avatarId) {
  return writeAvatarDraftStore(removeAvatarDraftRecord(readAvatarDraftStore(), avatarId));
}

function isSceneGraphDraftNewer(draftGraph, apiGraph) {
  if (!draftGraph) return false;
  if (!apiGraph) return true;
  const draftTime = Date.parse(draftGraph.updatedAt || draftGraph.createdAt || 0);
  const apiTime = Date.parse(apiGraph.updatedAt || apiGraph.createdAt || 0);
  if (Number.isFinite(draftTime) && Number.isFinite(apiTime) && draftTime !== apiTime) {
    return draftTime > apiTime;
  }
  return sceneGraphFootprint(draftGraph) > sceneGraphFootprint(apiGraph);
}

function sceneGraphFootprint(graph = {}) {
  const scenes = Array.isArray(graph.scenes) ? graph.scenes : [];
  return scenes.reduce((sum, scene) => (
    sum
    + 1
    + (Array.isArray(scene.assets) ? scene.assets.length : 0)
    + (Array.isArray(scene.avatarTags) ? scene.avatarTags.length : 0)
    + (Array.isArray(scene.playlist) ? scene.playlist.length : 0)
  ), Array.isArray(graph.places) ? graph.places.length : 0);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function waitForPaint() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function scheduleIdleTask(callback, timeout = 300) {
  if (typeof window === "undefined") {
    const timer = setTimeout(callback, 0);
    return () => clearTimeout(timer);
  }
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(callback, Math.min(timeout, 120));
  return () => window.clearTimeout(timer);
}

function imageMetadata(uri) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = uri;
  });
}

async function imageMetadataWithThumbnail(uri, file, assetId, onStage = null) {
  try {
    const image = await loadImage(uri);
    onStage?.({ stage: "Creating small image thumbnail", detail: file.name, progress: 0.58 });
    await waitForPaint();
    const thumbnail = await persistCanvasThumbnail({
      source: image,
      id: `${assetId}-thumb`,
      name: `${file.name.replace(/\.[^.]+$/, "")}-thumb.jpg`,
      maxWidth: 360,
      mimeType: "image/jpeg",
      quality: 0.76
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      thumbnail
    };
  } catch {
    return imageMetadata(uri);
  }
}

function loadImage(uri) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = uri;
  });
}

async function videoMetadataWithFrames(uri, file, assetId, onStage = null) {
  const base = await videoMetadata(uri);
  let frames = [];
  try {
    frames = await captureVideoFrameSet(uri, file, assetId, base, onStage);
  } catch (error) {
    console.warn("Hapa video frame extraction failed", error);
  }
  const firstFrame = frames.find((frame) => frame.marker === "first") || frames[0];
  return {
    ...base,
    frames,
    thumbnail: firstFrame?.thumbnail || (firstFrame ? {
      uri: firstFrame.uri,
      width: firstFrame.width,
      height: firstFrame.height,
      mimeType: firstFrame.mimeType
    } : null)
  };
}

function videoMetadata(uri) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) ? video.duration : null
      });
    };
    video.onerror = () => resolve({ width: null, height: null, duration: null });
    video.src = uri;
  });
}

function captureVideoFrameSet(uri, file, assetId, metadata = {}, onStage = null) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = async () => {
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : metadata.duration;
        const frameTimes = frameTimesForDuration(duration);
        const frames = [];
        for (let index = 0; index < VIDEO_FRAME_MARKERS.length; index += 1) {
          const marker = VIDEO_FRAME_MARKERS[index];
          const time = frameTimes[marker.id] ?? 0;
          onStage?.({
            stage: `Capturing ${marker.label.toLowerCase()}`,
            detail: file.name,
            progress: 0.34 + index * 0.12
          });
          await waitForPaint();
          await seekVideo(video, time);
          const frame = await captureVideoFrame(video, file, assetId, marker, time);
          frames.push(frame);
          await waitForPaint();
        }
        resolve(frames);
      } catch (error) {
        reject(error);
      }
    };
    video.onerror = () => reject(new Error(`Could not load video for frame extraction: ${file.name}`));
    video.src = uri;
  });
}

function frameTimesForDuration(duration) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const last = safeDuration > 0.12 ? safeDuration - 0.08 : safeDuration;
  return {
    first: safeDuration > 0.05 ? 0.02 : 0,
    mid: safeDuration ? safeDuration / 2 : 0,
    last
  };
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    window.setTimeout(finish, 1800);
    try {
      video.currentTime = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? video.duration : time));
    } catch {
      finish();
    }
  });
}

async function captureVideoFrame(video, file, assetId, marker, time) {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 360;
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, width, height);
  const fingerprint = canvasFingerprint(canvas);
  const thumbnail = await persistCanvasThumbnail({
    source: canvas,
    id: `${assetId}-frame-${marker.id}-thumb`,
    name: `${file.name.replace(/\.[^.]+$/, "")}-${marker.id}-thumb.jpg`,
    maxWidth: 240,
    mimeType: "image/jpeg",
    quality: 0.72
  });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const frameId = `${assetId}-frame-${marker.id}`;
  const persisted = await persistGeneratedMedia({
    id: frameId,
    name: `${baseName}-${marker.id}-frame.jpg`,
    mimeType: "image/jpeg",
    dataUrl
  });
  return {
    id: frameId,
    marker: marker.id,
    label: marker.label,
    role: marker.role,
    time,
    uri: persisted?.uri || dataUrl,
    width,
    height,
    mimeType: "image/jpeg",
    storage: persisted?.storage || null,
    thumbnail,
    fingerprint,
    createdAt: new Date().toISOString()
  };
}

async function persistCanvasThumbnail({ source, id, name, maxWidth = 320, mimeType = "image/jpeg", quality = 0.76 }) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width || 1;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height || 1;
  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, width, height);
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const persisted = await persistGeneratedMedia({
    id,
    name,
    mimeType,
    dataUrl
  });
  return {
    id,
    uri: persisted?.uri || dataUrl,
    width,
    height,
    mimeType,
    storage: persisted?.storage || null,
    createdAt: new Date().toISOString()
  };
}

function canvasFingerprint(canvas, size = 8) {
  try {
    const sample = document.createElement("canvas");
    sample.width = size;
    sample.height = size;
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    const luma = [];
    for (let index = 0; index < data.length; index += 4) {
      luma.push(Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722));
    }
    return { kind: "luma-grid", size, luma };
  } catch {
    return null;
  }
}

async function persistGeneratedMedia({ id, name, mimeType, dataUrl }) {
  try {
    const response = await fetch(`${API_BASE}/api/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, mimeType, dataUrl })
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
