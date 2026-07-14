#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { execFile, execFileSync, spawn, execSync, exec } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile, stat, readdir, access, rm } from "node:fs/promises";
import fs from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Hypercore from "hypercore";
import {
  auditAvatar,
  backgroundlessPlaybackForAsset,
  createAttachPack,
  createAvatarMindAttachPack,
  createAvatarMindSummary,
  createAvatarScaffold,
  createHealingPromptPacket,
  createHealingQueue,
  createHealingPlan,
  assignAssetToSlot,
  createKanbanFromAudit,
  normalizeAvatarCard,
  registerBackgroundlessVideoVariant,
  videoBackgroundlessSummary,
  upsertAvatarMind
} from "../src/domain/avatar.js";
import {
  attachSceneMedia,
  createPlace,
  createScene,
  createSceneAttachPack,
  createSceneGraphScaffold,
  normalizeSceneGraph
} from "../src/domain/scene.js";
import { normalizeAvatarTeams } from "../src/domain/avatarTeams.js";
import {
  addTarotCard,
  addTarotDeck,
  addTarotSet,
  attachTarotCardMedia,
  createTarotAttachPack,
  createTarotLibraryDashboard,
  createTarotStore,
  linkTarotCardAvatar,
  normalizeTarotStore,
  summarizeTarotStore,
  unlinkTarotCardAvatar,
  updateTarotCard,
  updateTarotDeck,
  updateTarotSet
} from "../src/domain/tarot.js";
import {
  createSystemMediaLibrary,
  normalizeSystemMediaLibrary
} from "../src/domain/systemMedia.js";
import {
  upsertMediaAttachmentRecord,
  withMediaAttachmentRelationship
} from "../src/domain/mediaRelationshipSync.js";
import {
  createInventoryAttachPack,
  createInventoryStoreScaffold,
  createItemCard,
  createItemManagerScaffold,
  equipItemCard,
  normalizeInventoryStore,
  normalizeItemManagerStore
} from "../src/domain/item.js";
import {
  attachSongMedia,
  createHapaSongStoreFromDearPapaSongbook,
  normalizeHapaSong,
  normalizeHapaSongStore,
  upsertSongInStore
} from "../src/domain/song.js";
import {
  blueAvatarHealth,
  blueAvatarTurn,
  proxyBlueAvatarAudio
} from "./blueAvatar.mjs";
import {
  ROOMLET_HOST_CONTROL_ACTIONS,
  buildRoomletHostControlEvent,
  buildRoomletParticipantCards,
  createRoomletTarotInvite
} from "./roomletInvite.mjs";
import { fileStreamTelemetry, streamFileToResponse } from "./file-serving.mjs";
import { EchoIsfAssetCatalog, writeEchoIsfAsset } from "./echo-isf-assets.mjs";
import { buildBuilderEntityCatalog } from "../src/overcard/entityCatalog.js";
import { resolveBuilderRuntimeContext } from "../src/overcard/runtimeContext.js";
import { builderProcessAdapterRegistrations, freezeBuilderRunContext, getBuilderProcessAdapter } from "../src/overcard/processAdapters.js";
import { prepareHellWeekNextRun } from "../src/overcard/hellWeekResponsibility.js";
import { applyInventoryCollections, projectInventoryCollections } from "../src/overcard/inventoryBridge.js";
import { builderHostTargetRegistrations } from "../src/overcard/hostTargets.js";
import { negotiateCapabilities, validateNodeAdapterManifest } from "@hapa/overcard/core";
import { ensureLocalOvercardHost } from "@hapa/overcard/host";
import { AvatarOverwindOrigin } from "./avatar-overwind-origin.mjs";
import { AvatarOverwindSubscriber, resolveOverwindToken } from "./avatar-overwind-subscriber.mjs";
import { MintLedgerError, createSongCardMintController } from "./song-card-mint-controller.mjs";
import { createSongCardRemintStore } from "./song-card-remint-store.mjs";
import { createSongCardLocalRenderBridge } from "./song-card-local-renderer.mjs";
import { createEchoDirectionVariantSummaryIndex } from "./echo-direction-variant-summary-index.mjs";
import { collectSongCardConstituentReferences, hydrateSongCardConstituentSnapshots } from "../src/domain/song-card-constituents.js";
import {
  ECHO_DIRECTION_FORK_PAYLOAD_SCHEMA,
  echoDirectionVariantFingerprint,
  echoDirectionVariantId as domainEchoDirectionVariantId,
  echoDirectionVariantMetadata,
  echoDirectionVariantTitle as domainEchoDirectionVariantTitle,
  pickEchoDirectionVariantProjectPatch,
  summarizeEchoDirectionVariantMetadata,
} from "../src/domain/echo-direction-variants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER_STARTED_AT = new Date().toISOString();
const SERVER_PROCESS_OWNER = process.env.HAPA_AVATAR_PROCESS_OWNER || "standalone-api";
const SERVER_BUILD_SIGNATURE = process.env.HAPA_AVATAR_BUILD_SIGNATURE || createHash("sha256")
  .update(fs.readFileSync(fileURLToPath(import.meta.url)))
  .update(fs.readFileSync(path.join(__dirname, "file-serving.mjs")))
  .digest("hex")
  .slice(0, 16);
const execFileAsync = promisify(execFile);
const DATA_DIR = path.join(ROOT, "data");
const STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const KANBAN_PATH = process.env.HAPA_KANBAN_STORE || path.join(ROOT, "data/kanban.json");
const SCENE_STORE_PATH = process.env.HAPA_SCENE_STORE || path.join(ROOT, "data/scene-store.json");
const TAROT_STORE_PATH = process.env.HAPA_TAROT_STORE || path.join(ROOT, "data/tarot-store.json");
const TAROT_DRAW_FORGE_RUN_DIR = process.env.HAPA_TAROT_DRAW_FORGE_RUN_DIR || path.join(ROOT, "data/tarot-draw-forge-runs");
const SYSTEM_MEDIA_PATH = process.env.HAPA_MEDIA_LIBRARY || path.join(ROOT, "data/media-library.json");
const ITEM_STORE_PATH = process.env.HAPA_ITEM_STORE || path.join(ROOT, "data/item-manager-store.json");
const INVENTORY_STORE_PATH = process.env.HAPA_INVENTORY_STORE || path.join(ROOT, "data/inventory-store.json");
const HAPA_DEV_PROTO_DB_PATH = process.env.HAPA_DEV_PROTO_DB || path.join(process.env.HOME || "/Users/calderwong", "Library", "Application Support", "hapa-ag", "persistence.db");
const HAPA_DEV_PROTO_HYPERCORE_DIR = process.env.HAPA_DEV_PROTO_HYPERCORE_DIR || path.join(process.env.HOME || "/Users/calderwong", "Library", "Application Support", "hapa-ag", "storage");
const SQLITE_BIN = process.env.HAPA_SQLITE_BIN || "/usr/bin/sqlite3";

let latestTarotFrame = null;
let frameCounter = 0;
let activeTarotStreamConsumers = 0;
let tarotStreamBytesAccepted = 0;
let tarotStreamFramesRejectedWithoutConsumer = 0;
const songCardPlaybackSessions = new Map();
const SONG_CARD_PLAYBACK_HEARTBEAT_TTL_MS = 15_000;
const SONG_CARD_RENDER_EXECUTOR_HEARTBEAT_TTL_MS = Math.max(5_000, Number(process.env.HAPA_SONG_CARD_RENDER_EXECUTOR_HEARTBEAT_TTL_MS || 20_000) || 20_000);
const SONG_CARD_RENDER_EXECUTOR_CONFIG = String(process.env.HAPA_SONG_CARD_RENDER_EXECUTOR || "").trim();
let songCardRenderExecutorHeartbeat = null;
let songCardLocalRenderBridge = null;
function activeSongCardPlaybackSessions(now = Date.now()) {
  for (const [sessionId, expiresAt] of songCardPlaybackSessions) if (Number(expiresAt) <= now) songCardPlaybackSessions.delete(sessionId);
  return songCardPlaybackSessions.size;
}
function noteSongCardRenderExecutor(body = {}, now = Date.now()) {
  const executorId = String(body.executorId || body.workerId || "").trim();
  if (!executorId || executorId.length > 240) return false;
  songCardRenderExecutorHeartbeat = {
    executorId,
    adapter: String(body.adapter || SONG_CARD_RENDER_EXECUTOR_CONFIG || "external-worker").trim().slice(0, 240),
    capabilities: Array.isArray(body.capabilities) ? body.capabilities.map((value) => String(value).slice(0, 120)).slice(0, 32) : [],
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: now + SONG_CARD_RENDER_EXECUTOR_HEARTBEAT_TTL_MS,
  };
  return true;
}
function songCardRenderExecutorStatus(now = Date.now()) {
  const connected = Boolean(songCardRenderExecutorHeartbeat && songCardRenderExecutorHeartbeat.expiresAt > now);
  const configured = Boolean(SONG_CARD_RENDER_EXECUTOR_CONFIG);
  const releaseCapable = connected && songCardRenderExecutorHeartbeat.capabilities.includes("release-export");
  const status = connected ? releaseCapable ? "connected" : "incompatible" : configured ? "offline" : "not-installed";
  const external = {
    schemaVersion: "hapa.song-card.render-executor-status.v1",
    available: releaseCapable,
    connected,
    releaseCapable,
    configured,
    status,
    executionModel: connected ? "external-worker" : "planner-only",
    executorId: connected ? songCardRenderExecutorHeartbeat.executorId : null,
    adapter: connected ? songCardRenderExecutorHeartbeat.adapter : SONG_CARD_RENDER_EXECUTOR_CONFIG || null,
    capabilities: connected ? songCardRenderExecutorHeartbeat.capabilities : [],
    lastSeenAt: songCardRenderExecutorHeartbeat?.lastSeenAt || null,
    heartbeatTtlMs: SONG_CARD_RENDER_EXECUTOR_HEARTBEAT_TTL_MS,
    reason: connected
      ? releaseCapable
        ? "A render executor is connected and can finish a release export."
        : "The connected render executor cannot produce a release export."
      : configured
        ? "The configured render executor is not connected."
        : "No Song Card render executor is installed; this service can plan, bind worker artifacts, mint, and export, but cannot render a new cut by itself.",
  };
  let builtIn = null;
  try {
    builtIn = songCardLocalRenderBridge?.status?.() || null;
  } catch (error) {
    builtIn = {
      schemaVersion: "hapa.song-card.render-executor-status.v1",
      available: false,
      releaseCapable: false,
      status: "error",
      executionModel: "built-in-local",
      builtIn: true,
      jobs: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (releaseCapable) return {
    ...external,
    jobs: Array.isArray(builtIn?.jobs) ? builtIn.jobs : [],
    builtInRenderer: builtIn,
  };
  if (builtIn?.available === true && builtIn?.releaseCapable !== false) return {
    ...builtIn,
    schemaVersion: builtIn.schemaVersion || "hapa.song-card.render-executor-status.v1",
    available: true,
    releaseCapable: true,
    builtIn: true,
    executionModel: builtIn.executionModel || "built-in-local",
    externalExecutor: external,
  };
  if (connected) return {
    ...external,
    jobs: Array.isArray(builtIn?.jobs) ? builtIn.jobs : [],
    builtInRenderer: builtIn,
  };
  return {
    ...external,
    jobs: Array.isArray(builtIn?.jobs) ? builtIn.jobs : [],
    builtInRenderer: builtIn,
  };
}
function withSongCardRenderExecutor(payload = {}) {
  const renderExecutor = songCardRenderExecutorStatus();
  return {
    ...payload,
    renderExecutor,
    localRenderJobs: Array.isArray(renderExecutor.jobs) ? renderExecutor.jobs : [],
  };
}
const DEAR_PAPA_SONGBOOK_PATH = process.env.HAPA_DEAR_PAPA_SONGBOOK || path.join(ROOT, "data/dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = process.env.HAPA_SONG_STORE || path.join(ROOT, "data/hapa-songs-store.json");
const SONG_CARD_MINT_ROOT = process.env.HAPA_SONG_CARD_MINT_ROOT || path.join(ROOT, "data/song-card-mints");
const songCardMintController = createSongCardMintController({
  root: SONG_CARD_MINT_ROOT,
  exportRoot: process.env.HAPA_SONG_CARD_EXPORT_ROOT || undefined,
  allowedSourceRoots: [
    ROOT,
    process.env.HAPA_MUSIC_VIZ_ROOT || "/Users/calderwong/Desktop/hapa-music-viz",
    ...String(process.env.HAPA_SONG_CARD_SOURCE_ROOTS || "").split(path.delimiter).map((entry) => entry.trim()).filter(Boolean),
  ],
});
const songCardRemintStore = createSongCardRemintStore({
  root: SONG_CARD_MINT_ROOT,
  controller: songCardMintController,
});
songCardLocalRenderBridge = createSongCardLocalRenderBridge({
  root: SONG_CARD_MINT_ROOT,
  controller: songCardMintController,
  remintStore: songCardRemintStore,
  resolveRegistryMaster: async (songId) => String((await findRegistrySong(songId))?.localPath || "").trim(),
});
const CARD_INPUT_STANDARD_BASE_URL = (process.env.HAPA_CARD_INPUT_STANDARD_URL || "http://127.0.0.1:8896").replace(/\/+$/, "");
const CARD_INPUT_STANDARD_ENABLED = process.env.HAPA_CARD_INPUT_STANDARD_ENABLED !== "0";
const HAPA_DEV_PROTO_DEBUG_URL = String(process.env.HAPA_DEV_PROTO_DEBUG_URL || "").replace(/\/+$/, "");
const HAPA_DEV_PROTO_DEBUG_TOKEN = String(process.env.HAPA_DEV_PROTO_DEBUG_TOKEN || "").trim();
const TAROT_DRAW_FORGE_LTX_BF16_MODEL = "dgrauet/ltx-2.3-mlx";
const TAROT_DRAW_FORGE_LTX_PROMPT_VERSION = "hapa-ltx-2.3-card-loop-v1-no-camera";
const TAROT_DRAW_FORGE_LTX_PROMPT_GUIDE = "https://ltx.io/blog/ltx-2-3-prompt-guide";
const SONG_REGISTRY_ROOT = process.env.HAPA_SONG_REGISTRY_ROOT || "/Users/calderwong/Desktop/hapa-song-registry";
const SONG_REGISTRY_DATA_PATH = process.env.HAPA_SONG_REGISTRY_DATA || path.join(SONG_REGISTRY_ROOT, "data/registry.json");
const DEAR_PAPA_PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";
const VOICEBOX_BASE_URL = (process.env.HAPA_VOICEBOX_URL || "http://127.0.0.1:17493").replace(/\/+$/, "");
const VOICEBOX_CLIENT_ID = process.env.HAPA_VOICEBOX_CLIENT_ID || "hapa-avatar-builder";
const VOICEBOX_MAX_TRANSCRIBE_BYTES = Math.max(256_000, Number(process.env.HAPA_VOICEBOX_MAX_TRANSCRIBE_BYTES || 18_000_000) || 18_000_000);
const VOICEBOX_FFMPEG_PATH = process.env.HAPA_FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
const VOICEBOX_TRANSCRIBE_SAMPLE_RATE = Math.max(16_000, Number(process.env.HAPA_VOICEBOX_TRANSCRIBE_SAMPLE_RATE || 48_000) || 48_000);
const VOICEBOX_TRANSCRIBE_FILTER = process.env.HAPA_VOICEBOX_TRANSCRIBE_FILTER || "off";
const VOICEBOX_TRANSCRIBE_RETRY_FILTER = process.env.HAPA_VOICEBOX_TRANSCRIBE_RETRY_FILTER || "highpass=f=80,lowpass=f=7600,dynaudnorm=f=150:g=5:p=0.85,volume=1.2";
const HAPA_TRANSCRIBE_ROOT = process.env.HAPA_TRANSCRIBE_ROOT || "/Users/calderwong/Documents/Codex/2026-05-25/you-are-an-expert-hapa-protocol/hapa-transcribe/desktop";
const HAPA_TRANSCRIBE_BASE_URL = (process.env.HAPA_TRANSCRIBE_URL || "http://127.0.0.1:8762").replace(/\/+$/, "");
const HAPA_TRANSCRIBE_MODEL = process.env.HAPA_TRANSCRIBE_MODEL || "lightning:large-v3";
const HAPA_TRANSCRIBE_MAX_BYTES = Math.max(256_000, Number(process.env.HAPA_TRANSCRIBE_MAX_BYTES || 18_000_000) || 18_000_000);
const HAPA_TRANSCRIBE_EMPTY_CLIP_DIR = process.env.HAPA_TRANSCRIBE_EMPTY_CLIP_DIR || path.join(ROOT, "artifacts/transcribe-empty-clips");
const HAPA_TRANSCRIBE_SAVE_EMPTY_CLIPS = process.env.HAPA_TRANSCRIBE_SAVE_EMPTY_CLIPS !== "0";
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const HAPA_MUSIC_VIZ_ROOT = process.env.HAPA_MUSIC_VIZ_ROOT || "/Users/calderwong/Desktop/hapa-music-viz";
const ECHO_DIRECTOR_V2_ALBUM_DIR = process.env.HAPA_ECHO_DIRECTOR_V2_ALBUM_DIR || path.join(ROOT, "artifacts/echo-director-v2/album");
const ECHO_DIRECTION_VARIANTS_DIR = process.env.HAPA_ECHO_DIRECTION_VARIANTS_DIR || path.join(DATA_DIR, "music-video-project-variants");
const echoDirectionVariantSummaryIndex = createEchoDirectionVariantSummaryIndex({
  variantsRoot: ECHO_DIRECTION_VARIANTS_DIR,
});
const echoIsfAssets = new EchoIsfAssetCatalog({ musicVizRoot: HAPA_MUSIC_VIZ_ROOT });
const echoDirectorShowGraphCache = new Map();
const echoPreviewPreparationJobs = new Map();
const echoPreviewPreparationQueue = [];
let activeEchoPreviewPreparationSongId = "";

function pumpEchoPreviewPreparationQueue() {
  if (activeEchoPreviewPreparationSongId || !echoPreviewPreparationQueue.length) return;
  const job = echoPreviewPreparationQueue.shift();
  activeEchoPreviewPreparationSongId = job.songId;
  job.status = "running";
  job.startedAt = new Date().toISOString();
  const child = spawn(process.execPath, [path.join(ROOT, "scripts/build-echo-playback-media-v2.mjs"), "--apply", `--song=${job.songId}`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const appendOutput = (chunk) => { job.outputTail = `${job.outputTail}${chunk}`.slice(-12_000); };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  let settled = false;
  const finish = (code, error = null) => {
    if (settled) return;
    settled = true;
    job.exitCode = Number.isInteger(code) ? code : 1;
    job.status = job.exitCode === 0 && !error ? "ready" : "failed";
    job.completedAt = new Date().toISOString();
    if (error) job.error = String(error.message || error);
    activeEchoPreviewPreparationSongId = "";
    pumpEchoPreviewPreparationQueue();
  };
  child.once("error", (error) => finish(1, error));
  child.once("close", (code) => finish(code));
}
const SUBSCRIBER_DIR = process.env.HAPA_SUBSCRIBER_DIR || path.join(ROOT, "data/subscribers");
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki"];
const OVERWIND_DIR = process.env.HAPA_OVERWIND_DIR || path.join(ROOT, "data/overwind");
const AVATAR_OVERWIND_OUTBOX_PATH = process.env.HAPA_AVATAR_OVERWIND_OUTBOX || path.join(OVERWIND_DIR, "origin-outbox.sqlite3");
const AVATAR_OVERWIND_SUBSCRIBER_PATH = process.env.HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB || path.join(OVERWIND_DIR, "subscriber.sqlite3");
const AVATAR_OVERWIND_URL = process.env.HAPA_OVERWIND_URL || "http://127.0.0.1:8788";
const overwindToken = resolveOverwindToken();
const avatarOverwindOrigin = new AvatarOverwindOrigin({
  dbPath: AVATAR_OVERWIND_OUTBOX_PATH,
  overwindUrl: AVATAR_OVERWIND_URL,
  token: overwindToken
});
const avatarOverwindSubscriber = new AvatarOverwindSubscriber({
  dbPath: AVATAR_OVERWIND_SUBSCRIBER_PATH,
  baseUrl: AVATAR_OVERWIND_URL,
  token: overwindToken
});
const OVERWIND_BOOTSTRAP_PATH = path.join(OVERWIND_DIR, "avatar-builder-bootstrap.json");
const OVERWIND_SHELL_BOOTSTRAP_PATH = path.join(OVERWIND_DIR, "avatar-builder-shell-bootstrap.json");
const OVERWIND_BOOTSTRAP_PROJECTION_VERSION = "hapa.overwind.avatar-builder-bootstrap.v5.avatar-loadout-mind-spines";
const OVERWIND_SHELL_BOOTSTRAP_PROJECTION_VERSION = "hapa.overwind.avatar-builder-shell.v7.loadout-mind-spines";
const OVERWIND_SHELL_AVATAR_LIMIT = Number(process.env.HAPA_OVERWIND_SHELL_AVATAR_LIMIT || 72);
const OVERWIND_SHELL_TEAM_MEMBER_LIMIT = Number(process.env.HAPA_OVERWIND_SHELL_TEAM_MEMBER_LIMIT || 48);
const OVERWIND_SHELL_BOARD_CARD_LIMIT = Number(process.env.HAPA_OVERWIND_SHELL_BOARD_CARD_LIMIT || 12);
const OVERWIND_ENTITY_NAMES = [
  "agent_archetype",
  "prompt_contract",
  "schema",
  "harness",
  "persistence_target",
  "avatar_card",
  "scene_card",
  "item_card",
  "tarot_card"
];

const rawJsonCache = new Map();
const normalizedJsonCache = new Map();
const rawJsonInflight = new Map();
const normalizedJsonInflight = new Map();
const jsonStoreReadTelemetry = {
  rawDiskReads: 0,
  rawInflightHits: 0,
  normalizedBuilds: 0,
  normalizedInflightHits: 0
};
let overwindBootstrapCache = null;
let overwindShellBootstrapCache = null;
let hapaTranscribeProcess = null;
let hapaTranscribeStartingAt = 0;
const PHONE_BRIDGE_SESSION_TTL_MS = 1000 * 60 * 45;
const PHONE_BRIDGE_MESSAGE_TTL_MS = 1000 * 60 * 5;
const PHONE_BRIDGE_INVITE_DIR = process.env.HAPA_PHONE_BRIDGE_INVITE_DIR || path.join(DATA_DIR, "phone-bridge-invites");
const phoneBridgeSessions = new Map();
const DEFAULT_WEBRTC_ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
];
const BLUE_AVATAR_OWNER_PATH = process.env.HAPA_BLUE_AVATAR_OWNER_PATH || path.join(DATA_DIR, "blue-avatar-owner.json");
const BLUE_AVATAR_OWNER_TTL_MS = Math.max(5000, Number(process.env.HAPA_BLUE_AVATAR_OWNER_TTL_MS || 16000) || 16000);
const MAX_REQUEST_BYTES = Math.max(64 * 1024, Math.min(32 * 1024 * 1024, Number(process.env.HAPA_AVATAR_MAX_REQUEST_BYTES || 8 * 1024 * 1024)));
const MAX_RETAINED_RAW_JSON_BYTES = Math.max(1024 * 1024, Math.min(64 * 1024 * 1024, Number(process.env.HAPA_AVATAR_RAW_JSON_CACHE_MAX_BYTES || 8 * 1024 * 1024)));
const SONG_CARD_PLAN_TIMEOUT_MS = Math.max(1, Math.min(5 * 60 * 1000, Number(process.env.HAPA_SONG_CARD_PLAN_TIMEOUT_MS || 120_000) || 120_000));
const SONG_CARD_MAX_CONSTITUENT_REFERENCES = Math.max(1, Math.min(4096, Number(process.env.HAPA_SONG_CARD_MAX_CONSTITUENT_REFERENCES || 512) || 512));
const activeSongCardPlanRequests = new Map();
const AVATAR_ADMIN_TOKEN = process.env.HAPA_AVATAR_ADMIN_TOKEN || process.env.HAPA_OVERWIND_TOKEN || "";
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5178", "http://localhost:5178", "http://127.0.0.1:8787", "http://localhost:8787",
  "http://127.0.0.1:8797", "http://localhost:8797",
  ...String(process.env.HAPA_AVATAR_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)
]);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    args.set(arg.slice(2), process.argv[index + 1]?.startsWith("--") ? true : process.argv[index + 1] || true);
  }
}

const port = Number(args.get("port") || process.env.PORT || 8787);
const host = String(args.get("host") || process.env.HAPA_AVATAR_HOST || process.env.HOST || "127.0.0.1");
ALLOWED_ORIGINS.add(`http://127.0.0.1:${port}`);
ALLOWED_ORIGINS.add(`http://localhost:${port}`);
const httpsPortArg = args.get("https-port") ?? process.env.HAPA_AVATAR_HTTPS_PORT ?? "";
const httpsPort = httpsPortArg === true ? port + 1 : Math.max(0, Number(httpsPortArg || 0) || 0);
const httpsHost = String(args.get("https-host") || process.env.HAPA_AVATAR_HTTPS_HOST || host);
const staticDir = args.get("static") ? path.resolve(ROOT, String(args.get("static"))) : null;
const LOCAL_UI_SESSION_COOKIE = `hapa_avatar_local_session_${port}`;
const LOCAL_UI_SESSION_ENABLED = ["127.0.0.1", "localhost", "::1", "0.0.0.0", "::"].includes(host.toLowerCase())
  && (Boolean(staticDir) || process.env.HAPA_AVATAR_TRUST_LOCAL_UI === "1" || args.get("trust-local-ui") === true);
const LOCAL_UI_SESSION_TOKEN = LOCAL_UI_SESSION_ENABLED ? randomBytes(32).toString("base64url") : "";
const SONG_CARD_ARTIFACT_SIGNING_KEY = AVATAR_ADMIN_TOKEN || LOCAL_UI_SESSION_TOKEN;
const HTTPS_CERT_DIR = process.env.HAPA_AVATAR_HTTPS_CERT_DIR || path.join(ROOT, "artifacts/certs/phone-bridge");
const HTTPS_CA_KEY_PATH = process.env.HAPA_AVATAR_HTTPS_CA_KEY || path.join(HTTPS_CERT_DIR, "hapa-phone-bridge-ca.key");
const HTTPS_CA_CERT_PATH = process.env.HAPA_AVATAR_HTTPS_CA_CERT || path.join(HTTPS_CERT_DIR, "hapa-phone-bridge-ca.crt");
const HTTPS_KEY_PATH = process.env.HAPA_AVATAR_HTTPS_KEY || path.join(HTTPS_CERT_DIR, "hapa-phone-bridge.key");
const HTTPS_CERT_PATH = process.env.HAPA_AVATAR_HTTPS_CERT || path.join(HTTPS_CERT_DIR, "hapa-phone-bridge.crt");
const HTTPS_META_PATH = process.env.HAPA_AVATAR_HTTPS_META || path.join(HTTPS_CERT_DIR, "hapa-phone-bridge.json");
const HTTPS_OPENSSL_BIN = process.env.HAPA_OPENSSL_PATH || process.env.OPENSSL_BIN || "openssl";
let httpsBridgeActive = false;
let httpsBridgeStartupError = "";

async function handleServerRequest(req, res) {
  try {
    await route(req, res);
  } catch (error) {
    sendJson(res, Number(error?.statusCode || 500), {
      error: "internal_error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

const server = createHttpServer(handleServerRequest);

let overcardHostHandle = null;
try {
  overcardHostHandle = await ensureLocalOvercardHost({
    nodeId: "hapa-avatar-builder-overcard-host",
    allowedOrigins: [...new Set([
      ...ALLOWED_ORIGINS,
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
    ])].filter((origin) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)),
  });
  process.env.HAPA_OVERCARD_HOST_URL = overcardHostHandle.baseUrl;
  console.log(`Shared Overcard host ${overcardHostHandle.mode}: ${overcardHostHandle.baseUrl}`);
} catch (error) {
  console.warn(`Shared Overcard host unavailable; Builder remains read-only: ${error instanceof Error ? error.message : String(error)}`);
}

const songCardStartupRecovery = await songCardMintController.recover();
await songCardRemintStore.initialize();

server.listen(port, host, () => {
  console.log(`Hapa Avatar Builder API listening on http://${host}:${port}`);
  const recovered = (songCardStartupRecovery.outcomes || []).filter((row) => row.recovered).length;
  if (recovered) console.log(`Song Card mint recovery committed ${recovered} durable edition transaction(s).`);
  warmOverwindBootstrap();
  if (process.env.HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC !== "0") {
    setTimeout(() => avatarOverwindSubscriber.sync().then((result) => {
      console.log(`Overwind Card subscriber ${result.mode}: ${result.applied ?? result.total ?? 0} rows at cursor ${result.cursor ?? result.watermark ?? 0}`);
    }).catch((error) => console.warn(`Overwind Card subscriber sync deferred: ${error instanceof Error ? error.message : String(error)}`)), 1500);
  }
});

async function stopOwnedOvercardHost() {
  await overcardHostHandle?.close();
  overcardHostHandle = null;
}
let shutdownPromise = null;
function shutdownBuilder(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = Promise.allSettled([
    songCardLocalRenderBridge?.shutdown?.({ reason: signal }) || Promise.resolve(),
    stopOwnedOvercardHost(),
  ]).finally(() => process.exit(0));
  return shutdownPromise;
}
process.once("SIGINT", () => { void shutdownBuilder("SIGINT"); });
process.once("SIGTERM", () => { void shutdownBuilder("SIGTERM"); });

if (httpsPort) {
  ensureLocalHttpsCredentials()
    .then((credentials) => {
      const httpsServer = createHttpsServer(credentials, handleServerRequest);
      httpsServer.listen(httpsPort, httpsHost, () => {
        httpsBridgeActive = true;
        console.log(`Hapa Avatar Builder secure phone bridge listening on https://${httpsHost}:${httpsPort}`);
      });
    })
    .catch((error) => {
      httpsBridgeStartupError = error instanceof Error ? error.message : String(error);
      console.warn(`Hapa Avatar Builder secure phone bridge unavailable: ${httpsBridgeStartupError}`);
    });
}

function warmOverwindBootstrap() {
  readPersistedOverwindShellProjection()
    .then((projection) => {
      if (projection) {
        console.log(`Overwind shell cache available at ${OVERWIND_SHELL_BOOTSTRAP_PATH} (${projection.counts?.avatars || 0} avatars, ${projection.counts?.cards || 0} cards)`);
      } else {
        console.log("Overwind shell warmup deferred until the bootstrap endpoint is requested");
      }
    })
    .catch((error) => {
      console.warn(`Overwind shell cache probe skipped: ${error instanceof Error ? error.message : String(error)}`);
    });

  if (process.env.HAPA_OVERWIND_WARM_FULL === "1") {
    setTimeout(() => {
      readOverwindBootstrap(null, false)
        .then((projection) => {
          console.log(`Overwind full bootstrap ready at ${OVERWIND_BOOTSTRAP_PATH} (${projection.counts?.avatars || 0} avatars, ${projection.counts?.cards || 0} cards)`);
        })
        .catch((error) => {
          console.warn(`Overwind full bootstrap warmup skipped: ${error instanceof Error ? error.message : String(error)}`);
        });
    }, 8000);
  }
}

let cachedLedgerData = null;
let cachedLedgerDataAt = 0;
let ledgerScanPromise = null;
const LIVE_LEDGER_CACHE_TTL_MS = Math.max(10_000, Number(process.env.HAPA_LEDGER_CACHE_TTL_MS || 60_000) || 60_000);

function execQuery(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout) => {
      if (err) resolve("0");
      else resolve(stdout.trim());
    });
  });
}

async function getLiveLedgerData({ refresh = false } = {}) {
  const cacheFresh = cachedLedgerData && Date.now() - cachedLedgerDataAt < LIVE_LEDGER_CACHE_TTL_MS;
  if (!refresh && cacheFresh) return cachedLedgerData;
  if (!ledgerScanPromise) {
    ledgerScanPromise = computeLiveLedgerData()
      .then((data) => {
        cachedLedgerData = data;
        cachedLedgerDataAt = Date.now();
        return data;
      })
      .finally(() => {
        ledgerScanPromise = null;
      });
  }
  return ledgerScanPromise;
}

async function walkDirectoryFiles(dir) {
  let count = 0;
  let size = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') return;
        const sub = await walkDirectoryFiles(fullPath);
        count += sub.count;
        size += sub.size;
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        count += 1;
        size += 10157;
      }
    }));
  } catch {}
  return { count, size };
}

async function computeLiveLedgerData() {
  const store = await readStore();
  const avatars = (store.avatars || []).map(a => {
    const firstImgAsset = (a.assets || []).find(as => as.type === 'image');
    const profileImage = firstImgAsset 
      ? (firstImgAsset.metadata?.thumbnailUri || firstImgAsset.uri || '') 
      : '';
      
    return {
      id: a.id,
      name: a.primaryName || a.name || a.names?.[0]?.name || a.id,
      balance: a.balance || 0,
      profileImage: profileImage.replace(/^\/media\//, '')
    };
  });

  // 1. Walk Worldbuilding Wiki files
  let wikiCount = 59134;
  let wikiSize = 600669887;
  try {
    const walk = await walkDirectoryFiles('/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki');
    wikiCount = walk.count;
    wikiSize = walk.size;
  } catch (err) {
    console.error('Error walking wiki:', err);
  }

  // 2. Query Postgres Overwind database for Second Brain and Mind counts
  let sbCount = 78981;
  let mindCount = 267489;
  let dbSize = 12 * 1024 * 1024 * 1024; // 12 GB
  
  const dbPath = '/Users/calderwong/Documents/Codex/2026-05-25/can-you-grab-my-1-amazon/hapa_second_brain/hapa_second_brain.db';
  try {
    const dbStat = await stat(dbPath);
    dbSize = dbStat.size;
  } catch {}

  try {
    const sbQuery = await execQuery('/opt/homebrew/opt/postgresql@16/bin/psql -h 127.0.0.1 -d hapa_overwind -t -A -c "SELECT COUNT(*) FROM hapa_second_brain_content_items;"');
    sbCount = parseInt(sbQuery, 10) || sbCount;
    
    const mindQuery = await execQuery('/opt/homebrew/opt/postgresql@16/bin/psql -h 127.0.0.1 -d hapa_overwind -t -A -c "SELECT COUNT(*) FROM hapa_second_brain_content_chunks;"');
    mindCount = parseInt(mindQuery, 10) || mindCount;
  } catch (err) {
    console.error('Error querying Postgres:', err);
  }

  // Proportional partitioning of DB size
  const totalDbRecords = sbCount + mindCount;
  const sbSize = Math.round(dbSize * (sbCount / totalDbRecords));
  const mindSize = Math.round(dbSize * (mindCount / totalDbRecords));

  // 3. Count images and videos from store
  const imageCounts = {};
  const videoCounts = {};
  const imageSizes = {};
  const videoSizes = {};
  
  avatars.forEach(av => {
    imageCounts[av.id] = 0;
    videoCounts[av.id] = 0;
    imageSizes[av.id] = 0;
    videoSizes[av.id] = 0;
  });

  (store.avatars || []).forEach(av => {
    (av.assets || []).forEach(as => {
      const size = as.metadata?.sizeBytes || as.storage?.sizeBytes || (as.type === 'video' ? 15000000 : 1500000);
      if (as.type === 'image') {
        imageCounts[av.id] = (imageCounts[av.id] || 0) + 1;
        imageSizes[av.id] = (imageSizes[av.id] || 0) + size;
      } else if (as.type === 'video') {
        videoCounts[av.id] = (videoCounts[av.id] || 0) + 1;
        videoSizes[av.id] = (videoSizes[av.id] || 0) + size;
      }
    });
  });

  // 4. Tarot Cards count
  let tarotCount = 195;
  const tarotStorePath = '/Users/calderwong/Desktop/hapa-avatar-builder/data/tarot-store.json';
  try {
    const tarotContent = JSON.parse(await readFile(tarotStorePath, 'utf8'));
    tarotCount = (tarotContent.cards || []).length;
  } catch {}

  // 5. Item Cards count
  let itemCount = 1411;
  const itemStorePath = '/Users/calderwong/Desktop/hapa-avatar-builder/data/item-manager-store.json';
  try {
    const itemContent = JSON.parse(await readFile(itemStorePath, 'utf8'));
    itemCount = (itemContent.items || itemContent.cards || []).length;
  } catch {}

  // 6. Guild Cards count
  let guildCardCount = 1941;
  const devProtoCardsDir = '/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Cards/Hapa Dev Proto Cards/Cards';
  try {
    const entries = await readdir(devProtoCardsDir);
    guildCardCount = entries.filter(e => e.endsWith('.md')).length;
  } catch {}

  // Distribute the global totals among the avatars
  const n = avatars.length;
  const baseWikiCount = Math.floor(wikiCount / n);
  const baseSbCount = Math.floor(sbCount / n);
  const baseMindCount = Math.floor(mindCount / n);
  const baseTarotCount = Math.floor(tarotCount / n);
  const baseItemCount = Math.floor(itemCount / n);
  const baseGuildCount = Math.floor(guildCardCount / n);

  const wikiSizePart = Math.floor(wikiSize / n);
  const sbSizePart = Math.floor(sbSize / n);
  const mindSizePart = Math.floor(mindSize / n);

  avatars.forEach((av, idx) => {
    const isFirst = idx === 0;
    const finalWiki = baseWikiCount + (isFirst ? (wikiCount % n) : 0);
    const finalSb = baseSbCount + (isFirst ? (sbCount % n) : 0);
    const finalMind = baseMindCount + (isFirst ? (mindCount % n) : 0);
    const finalTarot = baseTarotCount + (isFirst ? (tarotCount % n) : 0);
    const finalItem = baseItemCount + (isFirst ? (itemCount % n) : 0);
    const finalGuild = baseGuildCount + (isFirst ? (guildCardCount % n) : 0);

    const finalWikiSize = wikiSizePart + (isFirst ? (wikiSize % n) : 0);
    const finalSbSize = sbSizePart + (isFirst ? (sbSize % n) : 0);
    const finalMindSize = mindSizePart + (isFirst ? (mindSize % n) : 0);

    const imgCount = imageCounts[av.id] || 0;
    const vidCount = videoCounts[av.id] || 0;
    const imgSize = imageSizes[av.id] || 0;
    const vidSize = videoSizes[av.id] || 0;

    av.counts = {
      images: imgCount,
      videos: vidCount,
      mindRecords: finalMind,
      secondBrainRecords: finalSb,
      wikiRecords: finalWiki,
      guildLibraryCards: finalGuild,
      tarotCards: finalTarot,
      itemCards: finalItem,
      total: imgCount + vidCount + finalMind + finalSb + finalWiki + finalGuild + finalTarot + finalItem,
      sizeBytes: imgSize + vidSize + finalMindSize + finalSbSize + finalWikiSize,
      imageSize: imgSize,
      videoSize: vidSize,
      mindSize: finalMindSize,
      secondBrainSize: finalSbSize,
      wikiSize: finalWikiSize,
      guildLibraryCardsSize: finalGuild * 1000,
      tarotCardsSize: finalTarot * 50000,
      itemCardsSize: finalItem * 25000
    };

    const calculatedBalance = 
      imgCount * 1.00 +
      vidCount * 10.00 +
      finalWiki * 0.10 +
      finalSb * 0.10 +
      finalMind * 0.01 +
      finalGuild * 100.00 +
      finalTarot * 50.00 +
      finalItem * 25.00;
      
    av.balance = parseFloat(calculatedBalance.toFixed(2));
  });

  const cards = [];
  avatars.forEach(av => {
    const name = av.name || av.id || "Unknown";
    const seedVal = (name.charCodeAt(0) || 1) + (name.charCodeAt(name.length - 1) || 1);
    const creditLimit = 7643;
    const creditBalance = parseFloat((Math.round((av.balance * 0.08 + (seedVal * 12)) % (creditLimit * 0.28))).toFixed(2));

    cards.push({
      id: `debit-${av.id}`,
      avatarId: av.id,
      cardType: "debit",
      balance: av.balance,
      limit: 0,
      number: "400012345678" + av.id.slice(-4).replace(/[^0-9]/g, '9').padEnd(4, '0'),
      holder: name,
      expiry: "12/30",
      status: "Active",
      rewardsRate: 0.01,
      rewardsBalance: parseFloat((av.balance * 0.01).toFixed(2)),
      profileImage: av.profileImage
    });
    cards.push({
      id: `credit-${av.id}`,
      avatarId: av.id,
      cardType: "credit",
      balance: creditBalance,
      limit: creditLimit,
      number: "510012345678" + av.id.slice(-4).replace(/[^0-9]/g, '9').padEnd(4, '0'),
      holder: name,
      expiry: "12/30",
      status: "Active",
      rewardsRate: 0.02,
      rewardsBalance: 0.0,
      minPayment: parseFloat((creditBalance * 0.05).toFixed(2)),
      statementBalance: creditBalance,
      dueDate: "2026-08-01",
      interestRate: 0.18,
      profileImage: av.profileImage
    });
  });

  const transactions = [];
  let txId = 1;
  const today = new Date();

  avatars.forEach((av) => {
    const debitCardId = `debit-${av.id}`;
    const creditCardId = `credit-${av.id}`;
    
    const dates = [
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2), // 2 days ago
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10), // 10 days ago
      new Date(today.getFullYear(), today.getMonth() - 1, 15), // Last month, middle
      new Date(today.getFullYear(), today.getMonth() - 2, 5), // 2 months ago
      new Date(today.getFullYear(), today.getMonth() - 4, 20), // 4 months ago
      new Date(today.getFullYear(), today.getMonth() - 6, 12), // 6 months ago
      new Date(today.getFullYear(), today.getMonth() - 9, 28), // 9 months ago
      new Date(today.getFullYear(), today.getMonth() - 11, 1) // 11 months ago
    ];

    const formatDateStr = (d) => d.toISOString().split('T')[0];
    const c = av.counts || {};
    
    // 1. Images
    if (c.images > 0) {
      const numTx = Math.min(c.images, 5);
      for (let i = 0; i < numTx; i++) {
        const date = dates[i % dates.length];
        transactions.push({
          id: txId++,
          cardId: debitCardId,
          merchantName: `GUILD MEDIA: IMAGE INGESTION ${i + 1}`,
          amount: 1.00,
          date: formatDateStr(date),
          status: "Completed",
          category: "Inflow",
          hypercore: {
            seq: txId,
            fileName: `image-relic-${i}.png`,
            uri: `did:hapa:media:${av.id}:image-${i}`,
            sizeBytes: 1500000
          }
        });
      }
      if (c.images > numTx) {
        const restAmount = (c.images - numTx) * 1.00;
        const date = dates[dates.length - 1];
        transactions.push({
          id: txId++,
          cardId: debitCardId,
          merchantName: `GUILD MEDIA: BUNDLED IMAGE SYNC`,
          amount: parseFloat(restAmount.toFixed(2)),
          date: formatDateStr(date),
          status: "Completed",
          category: "Inflow",
          hypercore: {
            seq: txId,
            fileName: `bundled-images.tar`,
            uri: `did:hapa:media:${av.id}:images-archive`,
            sizeBytes: (c.images - numTx) * 1500000
          }
        });
      }
    }

    // 2. Videos
    if (c.videos > 0) {
      const numTx = Math.min(c.videos, 3);
      for (let i = 0; i < numTx; i++) {
        const date = dates[(i + 1) % dates.length];
        transactions.push({
          id: txId++,
          cardId: debitCardId,
          merchantName: `GUILD MEDIA: VIDEO LOOP INGESTION ${i + 1}`,
          amount: 10.00,
          date: formatDateStr(date),
          status: "Completed",
          category: "Inflow",
          hypercore: {
            seq: txId,
            fileName: `video-loop-${i}.mp4`,
            uri: `did:hapa:media:${av.id}:video-${i}`,
            sizeBytes: 15000000
          }
        });
      }
      if (c.videos > numTx) {
        const restAmount = (c.videos - numTx) * 10.00;
        const date = dates[dates.length - 2];
        transactions.push({
          id: txId++,
          cardId: debitCardId,
          merchantName: `GUILD MEDIA: BUNDLED VIDEO SYNC`,
          amount: parseFloat(restAmount.toFixed(2)),
          date: formatDateStr(date),
          status: "Completed",
          category: "Inflow",
          hypercore: {
            seq: txId,
            fileName: `bundled-videos.tar`,
            uri: `did:hapa:media:${av.id}:videos-archive`,
            sizeBytes: (c.videos - numTx) * 15000000
          }
        });
      }
    }

    // 3. Wiki Records, Second Brain, Mind, etc. (bundled per timeframe)
    if (c.wikiRecords > 0) {
      const wikiVal = parseFloat((c.wikiRecords * 0.10).toFixed(2));
      for (let i = 0; i < 4; i++) {
        const qAmt = parseFloat((wikiVal / 4).toFixed(2));
        const date = dates[(i * 2) % dates.length];
        transactions.push({
          id: txId++,
          cardId: debitCardId,
          merchantName: `WIKI INGEST: QUARTERLY SYNC ${i + 1}`,
          amount: qAmt,
          date: formatDateStr(date),
          status: "Completed",
          category: "Inflow",
          hypercore: {
            seq: txId,
            fileName: `wiki-sync-q${i + 1}.json`,
            uri: `did:hapa:wiki:${av.id}:sync-q${i + 1}`,
            sizeBytes: Math.round(c.wikiSize / 4)
          }
        });
      }
    }

    if (c.secondBrainRecords > 0) {
      const sbVal = parseFloat((c.secondBrainRecords * 0.10).toFixed(2));
      for (let i = 0; i < 3; i++) {
        const sAmt = parseFloat((sbVal / 3).toFixed(2));
        const date = dates[(i * 3) % dates.length];
        transactions.push({
          id: txId++,
          cardId: debitCardId,
          merchantName: `SECOND BRAIN INGEST: BATCH ${i + 1}`,
          amount: sAmt,
          date: formatDateStr(date),
          status: "Completed",
          category: "Inflow",
          hypercore: {
            seq: txId,
            fileName: `sb-sync-b${i + 1}.json`,
            uri: `did:hapa:secondbrain:${av.id}:sync-b${i + 1}`,
            sizeBytes: Math.round(c.secondBrainSize / 3)
          }
        });
      }
    }

    if (c.mindRecords > 0) {
      const mindVal = parseFloat((c.mindRecords * 0.01).toFixed(2));
      for (let i = 0; i < 2; i++) {
        const mAmt = parseFloat((mindVal / 2).toFixed(2));
        const date = dates[(i * 4) % dates.length];
        transactions.push({
          id: txId++,
          cardId: debitCardId,
          merchantName: `MIND ENGINE RECORD INGEST: PART ${i + 1}`,
          amount: mAmt,
          date: formatDateStr(date),
          status: "Completed",
          category: "Inflow",
          hypercore: {
            seq: txId,
            fileName: `mind-sync-p${i + 1}.json`,
            uri: `did:hapa:mind:${av.id}:sync-p${i + 1}`,
            sizeBytes: Math.round(c.mindSize / 2)
          }
        });
      }
    }

    // 4. Special assets (Guild cards, Tarot cards, Item cards)
    if (c.guildLibraryCards > 0) {
      const amt = parseFloat((c.guildLibraryCards * 100.00).toFixed(2));
      const date = dates[1 % dates.length];
      transactions.push({
        id: txId++,
        cardId: debitCardId,
        merchantName: "GUILD LIBRARY ASSEMBLY CREDITS",
        amount: amt,
        date: formatDateStr(date),
        status: "Completed",
        category: "Inflow",
        hypercore: {
          seq: txId,
          fileName: "guild-cards.db",
          uri: `did:hapa:guild:${av.id}:cards`,
          sizeBytes: c.guildLibraryCardsSize
        }
      });
    }

    if (c.tarotCards > 0) {
      const amt = parseFloat((c.tarotCards * 50.00).toFixed(2));
      const date = dates[3 % dates.length];
      transactions.push({
        id: txId++,
        cardId: debitCardId,
        merchantName: "TAROT DECK ASSEMBLY CREDITS",
        amount: amt,
        date: formatDateStr(date),
        status: "Completed",
        category: "Inflow",
        hypercore: {
          seq: txId,
          fileName: "tarot-deck.json",
          uri: `did:hapa:tarot:${av.id}:cards`,
          sizeBytes: c.tarotCardsSize
        }
      });
    }

    if (c.itemCards > 0) {
      const amt = parseFloat((c.itemCards * 25.00).toFixed(2));
      const date = dates[5 % dates.length];
      transactions.push({
        id: txId++,
        cardId: debitCardId,
        merchantName: "ITEM DECK ASSEMBLY CREDITS",
        amount: amt,
        date: formatDateStr(date),
        status: "Completed",
        category: "Inflow",
        hypercore: {
          seq: txId,
          fileName: "item-deck.json",
          uri: `did:hapa:items:${av.id}:cards`,
          sizeBytes: c.itemCardsSize
        }
      });
    }

    // 5. Credit Card Outflow (Spending)
    const name = av.name || av.id || "Unknown";
    const seedVal = (name.charCodeAt(0) || 1) + (name.charCodeAt(name.length - 1) || 1);
    const creditLimit = 7643;
    const creditBalance = Math.round((av.balance * 0.08 + (seedVal * 12)) % (creditLimit * 0.28)) || 120.00;
    
    const merchantNames = ["OLLAMA CLOUD INFERENCE", "PINOKIO APP STORE", "HERMES INTERFACE", "GITHUB COPILOT"];
    const amt1 = parseFloat((creditBalance * 0.5).toFixed(2));
    const amt2 = parseFloat((creditBalance * 0.3).toFixed(2));
    const amt3 = parseFloat((creditBalance * 0.2).toFixed(2));
    const creditAmts = [amt1, amt2, amt3];

    creditAmts.forEach((amt, i) => {
      if (amt > 0) {
        const date = dates[(i * 2 + 1) % dates.length];
        transactions.push({
          id: txId++,
          cardId: creditCardId,
          merchantName: merchantNames[i % merchantNames.length],
          amount: amt,
          date: formatDateStr(date),
          status: "Completed",
          category: "Outflow",
          merchantAddress: "127.0.0.1 Loopback SW",
          merchantPhone: "HAPA-DEV-555"
        });
      }
    });
  });

  return {
    avatars,
    cards,
    transactions
  };
}

async function route(req, res) {
  if (!setCors(req, res)) {
    sendJson(res, 403, { error: "cors_origin_denied" });
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestProtocol = req.socket?.encrypted ? "https" : "http";
  const url = new URL(req.url || "/", `${requestProtocol}://${req.headers.host || `127.0.0.1:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/local-ui-session" && req.method === "POST") {
    if (!LOCAL_UI_SESSION_ENABLED) {
      sendJson(res, 403, { error: "trusted_local_ui_disabled", failClosed: true });
      return;
    }
    if (!trustedLocalUiRequestContext(req, { bootstrap: true })) {
      sendJson(res, 403, { error: "trusted_local_ui_denied", failClosed: true });
      return;
    }
    res.setHeader("Set-Cookie", localUiSessionCookie(req));
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 201, {
      schemaVersion: "hapa.avatar-builder.local-ui-session.v1",
      ok: true,
      authMode: "trusted-local-ui",
      processScoped: true,
    });
    return;
  }

  if (pathname === "/api/service-identity" && req.method === "GET") {
    const [store, itemStore] = await Promise.all([readStore(), readItemStore()]);
    const projection = loadHellWeekProjection();
    sendJson(res, 200, {
      schemaVersion: "hapa.avatar-builder.service-identity.v1",
      serviceId: "hapa-avatar-builder",
      canonical: true,
      processOwner: SERVER_PROCESS_OWNER,
      buildSignature: SERVER_BUILD_SIGNATURE,
      bind: { host, port, loopback: ["127.0.0.1", "localhost", "::1"].includes(host) },
      populations: {
        canonicalAvatarCards: { count: (store.avatars || []).length, owner: "hapa-avatar-builder", source: STORE_PATH },
        canonicalItemCards: { count: (itemStore.cards || []).length, owner: "hapa-avatar-builder", source: ITEM_STORE_PATH },
        devProtoReadOnlyProjection: { count: projection.ok ? projection.cards.length : 0, owner: "hapa-dev-proto", source: HAPA_DEV_PROTO_DB_PATH },
        combinedViewIsCanonical: false
      },
      overwind: avatarOverwindOrigin.health(),
      legacyPorts: { 8787: "canonical API", 8797: "canonical desktop/static instance of the same service identity" }
    });
    return;
  }

  if (pathname === "/api/tarot/stream-demand" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      activeConsumers: activeTarotStreamConsumers,
      captureRequested: activeTarotStreamConsumers > 0,
      maxFps: 5,
      framesAccepted: frameCounter,
      framesRejectedWithoutConsumer: tarotStreamFramesRejectedWithoutConsumer,
      bytesAccepted: tarotStreamBytesAccepted
    });
    return;
  }

  if (pathname === "/api/tarot/stream-frame" && req.method === "POST") {
    if (activeTarotStreamConsumers <= 0) {
      tarotStreamFramesRejectedWithoutConsumer += 1;
      req.resume();
      sendJson(res, 409, { ok: false, captureRequested: false, reason: "no-active-stream-consumer" });
      return;
    }
    try {
      const chunks = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > 2 * 1024 * 1024) throw new Error("tarot stream frame exceeds 2 MiB limit");
        chunks.push(chunk);
      }
      latestTarotFrame = {
        id: ++frameCounter,
        buffer: Buffer.concat(chunks)
      };
      tarotStreamBytesAccepted += totalBytes;
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === "/api/tarot/stream" && req.method === "GET") {
    res.setHeader("Content-Type", "multipart/x-mixed-replace; boundary=--frame");
    res.setHeader("Cache-Control", "no-cache, private, no-store, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.writeHead(200);

    const boundary = "\r\n--frame\r\n";
    let active = true;
    let lastFrameId = 0;
    activeTarotStreamConsumers += 1;

    const releaseConsumer = () => {
      if (!active) return;
      active = false;
      activeTarotStreamConsumers = Math.max(0, activeTarotStreamConsumers - 1);
      clearInterval(interval);
    };

    const interval = setInterval(() => {
      if (!active) return;
      if (latestTarotFrame && latestTarotFrame.id !== lastFrameId) {
        lastFrameId = latestTarotFrame.id;
        try {
          const buffer = latestTarotFrame.buffer;
          res.write(boundary);
          res.write("Content-Type: image/jpeg\r\n");
          res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
          res.write(buffer);
          res.write("\r\n");
        } catch (e) {
          releaseConsumer();
        }
      }
    }, 40);

    req.on("close", releaseConsumer);
    res.on("close", releaseConsumer);
    res.on("error", releaseConsumer);
    return;
  }

  if ((pathname === "/api/v1/ledger-data" || pathname === "/v1/ledger-data") && req.method === "GET") {
    try {
      const data = await getLiveLedgerData({ refresh: url.searchParams.get("refresh") === "1" });
      sendJson(res, 200, { ok: true, data });
    } catch (err) {
      console.error("Error in ledger-data API:", err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/overcard/catalog" && req.method === "GET") {
    const [core, tarot, songs, songCards] = await Promise.all([
      readBuilderCatalogCoreSources({ forceProjection: url.searchParams.get("refresh") === "1" }),
      readTarotStore(),
      readHapaSongStore(),
      songCardMintController.catalogProjection()
    ]);
    res.setHeader("X-Hapa-Catalog-Core-Sources", core.source);
    sendJson(res, 200, buildBuilderEntityCatalog(
      { avatars: core.avatars, items: core.items, tarot, world: core.world, songs, songCards },
      {
        kinds: String(url.searchParams.get("kinds") || "").split(",").map((value) => value.trim()).filter(Boolean),
        offset: url.searchParams.get("offset"),
        limit: url.searchParams.get("limit"),
        generatedAt: new Date().toISOString()
      }
    ));
    return;
  }

  if (pathname === "/api/overcard/capabilities" && req.method === "GET") {
    const manifest = await readJson(path.join(ROOT, "overcard-adapter.json"));
    const validation = validateNodeAdapterManifest(manifest);
    if (!validation.ok) {
      sendJson(res, 500, { error: "invalid_overcard_adapter", issues: validation.issues });
      return;
    }
    const envelope = negotiateCapabilities(manifest, {
      installed: true,
      running: true,
      compatible: true,
      discoveredVia: ["http"]
    });
    sendJson(res, 200, { ...envelope, hostTargets: builderHostTargetRegistrations().map(({ nodeId, hostId, processId, slots }) => ({ nodeId, hostId, ...(processId ? { processId } : {}), socketId: slots[0]?.id })) });
    return;
  }

  if (pathname === "/api/overcard/host-targets" && req.method === "GET") {
    const targets = builderHostTargetRegistrations();
    sendJson(res, 200, { schema: "hapa.avatar-builder-host-target-registry.v1", nodeId: "hapa-avatar-builder", count: targets.length, targets });
    return;
  }

  if (pathname === "/api/overcard/process-adapters" && req.method === "GET") {
    const adapters = builderProcessAdapterRegistrations();
    sendJson(res, 200, { schema: "hapa.avatar-builder-process-adapter-registry.v1", nodeId: "hapa-avatar-builder", count: adapters.length, adapters });
    return;
  }

  if (pathname.startsWith("/api/overcard/process-adapters/") && pathname.endsWith("/run-context") && req.method === "POST") {
    try {
      const adapterId = decodeURIComponent(pathname.slice("/api/overcard/process-adapters/".length, -"/run-context".length));
      if (!getBuilderProcessAdapter(adapterId)) { sendJson(res, 404, { error: "process_adapter_not_found" }); return; }
      const body = await readBody(req);
      const [avatars, inventory, items, tarot, world, songs] = await Promise.all([readStore(), readInventoryStore(), readItemStore(), readTarotStore(), readSceneStore(), readHapaSongStore()]);
      sendJson(res, 200, freezeBuilderRunContext(adapterId, body, { avatars, teams: { teams: avatars.teams || [], updatedAt: avatars.updatedAt }, inventory, items, tarot, world, songs }));
    } catch (error) {
      sendJson(res, 400, { error: "run_context_invalid", message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (pathname === "/api/overcard/hell-week/prepare-next-run" && req.method === "POST") {
    if (!HAPA_DEV_PROTO_DEBUG_URL || !HAPA_DEV_PROTO_DEBUG_TOKEN) { sendJson(res, 503, { error: "hell_week_runtime_not_configured", fallback: "process-defaults" }); return; }
    try {
      const body = await readBody(req);
      if (body?.confirmed !== true || !body?.confirmationId) { sendJson(res, 409, { error: "explicit_confirmation_required" }); return; }
      const capabilityResponse = await fetch(`${HAPA_DEV_PROTO_DEBUG_URL}/v1/formations/capabilities`, { headers: { Authorization: `Bearer ${HAPA_DEV_PROTO_DEBUG_TOKEN}` } });
      if (!capabilityResponse.ok) throw new Error(`Hell Week capability discovery failed with HTTP ${capabilityResponse.status}.`);
      const remoteCapabilities = await capabilityResponse.json();
      const [avatars, inventory, items, tarot, world, songs] = await Promise.all([readStore(), readInventoryStore(), readItemStore(), readTarotStore(), readSceneStore(), readHapaSongStore()]);
      const prepared = prepareHellWeekNextRun({ binding: body.binding, remoteCapabilities, trustGrant: { granted: true, nodeId: "hapa-dev-proto", grantId: `trust:${body.confirmationId}` }, authorizationGrant: { granted: true, nodeId: "hapa-dev-proto", grantId: `authorization:${body.confirmationId}` }, now: new Date().toISOString(), traceId: body.traceId, settings: body.settings || {}, estimatedToolCalls: body.estimatedToolCalls || 0 }, { avatars, teams: { teams: avatars.teams || [], updatedAt: avatars.updatedAt }, inventory, items, tarot, world, songs });
      const delivery = await fetch(`${HAPA_DEV_PROTO_DEBUG_URL}/v1/hell-week/run-context`, { method: "POST", headers: { Authorization: `Bearer ${HAPA_DEV_PROTO_DEBUG_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ actor: body.actor || "hapa-avatar-builder", runtimeContext: prepared.runtimeContext }) });
      const receipt = await delivery.json().catch(() => null);
      if (!delivery.ok || receipt?.ok === false) throw new Error(receipt?.message || `Hell Week delivery failed with HTTP ${delivery.status}.`);
      sendJson(res, 200, { ok: true, prepared: { adapterId: prepared.adapterId, ownerNodeId: prepared.ownerNodeId, snapshotId: prepared.runtimeContext.snapshotId, bindingId: prepared.runtimeContext.binding?.id, principal: prepared.runtimeContext.principal, formation: prepared.runtimeContext.formation, collectionRefs: prepared.runtimeContext.collectionRefs, sourceRevisions: prepared.runtimeContext.sourceRevisions, fallback: prepared.runtimeContext.fallback, traceId: prepared.runtimeContext.traceId }, receipt: receipt.inbox });
    } catch (error) { sendJson(res, 502, { error: "hell_week_prepare_failed", message: error instanceof Error ? error.message : String(error), fallback: "process-defaults" }); }
    return;
  }

  if (pathname === "/api/overcard/hell-week/binding-control" && req.method === "POST") {
    if (!HAPA_DEV_PROTO_DEBUG_URL || !HAPA_DEV_PROTO_DEBUG_TOKEN) { sendJson(res, 503, { error: "hell_week_runtime_not_configured", nextRun: "process-defaults" }); return; }
    try {
      const body = await readBody(req);
      const response = await fetch(`${HAPA_DEV_PROTO_DEBUG_URL}/v1/hell-week/binding-control`, { method: "POST", headers: { Authorization: `Bearer ${HAPA_DEV_PROTO_DEBUG_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ bindingId: body.bindingId, status: body.status, actor: body.actor || "hapa-avatar-builder" }) });
      const result = await response.json().catch(() => null); if (!response.ok || result?.ok === false) throw new Error(result?.message || `Binding control failed with HTTP ${response.status}.`);
      sendJson(res, 200, result);
    } catch (error) { sendJson(res, 502, { error: "hell_week_binding_control_failed", message: error instanceof Error ? error.message : String(error), nextRun: "process-defaults" }); }
    return;
  }

  if (pathname === "/api/overcard/inventory-collections" && req.method === "GET") {
    const [inventory, items] = await Promise.all([readInventoryStore(), readItemStore()]);
    sendJson(res, 200, projectInventoryCollections(inventory, items));
    return;
  }

  if (pathname === "/api/overcard/inventory-collections" && req.method === "PUT") {
    const body = await readBody(req);
    const inventory = await readInventoryStore();
    const result = applyInventoryCollections(inventory, Array.isArray(body.collections) ? body.collections : [], { expectedUpdatedAt: body.expectedUpdatedAt });
    if (!result.ok) { sendJson(res, result.code === "revision_conflict" ? 409 : 422, result); return; }
    await writeInventoryStore(result.store);
    await appendSubscriberRegistration("inventory.overcard-collections-updated", { inventoryStore: result.store });
    sendJson(res, 200, { ok: true, storeUpdatedAt: result.store.updatedAt, audit: result.store.audit });
    return;
  }

  if (pathname === "/api/overcard/runtime-context/preview" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const [avatars, inventory, items, tarot, world, songs] = await Promise.all([
        readStore(),
        readInventoryStore(),
        readItemStore(),
        readTarotStore(),
        readSceneStore(),
        readHapaSongStore()
      ]);
      sendJson(res, 200, resolveBuilderRuntimeContext(body, {
        avatars,
        teams: { teams: avatars.teams || [], updatedAt: avatars.updatedAt },
        inventory,
        items,
        tarot,
        world,
        songs
      }));
    } catch (error) {
      sendJson(res, 400, { error: "runtime_context_preview_invalid", message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (pathname === "/api/health") {
    const memory = process.memoryUsage();
    sendJson(res, 200, {
      ok: true,
      service: "hapa-avatar-builder",
      store: STORE_PATH,
      runtime: {
        pid: process.pid,
        processOwner: SERVER_PROCESS_OWNER,
        buildSignature: SERVER_BUILD_SIGNATURE,
        startedAt: SERVER_STARTED_AT,
        uptimeSeconds: Math.round(process.uptime()),
        port,
        host,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        openFileCount: processOpenFileCount(),
        fileStreams: fileStreamTelemetry(),
        jsonStores: {
          ...jsonStoreReadTelemetry,
          rawCacheEntries: rawJsonCache.size,
          normalizedCacheEntries: normalizedJsonCache.size,
          rawInflight: rawJsonInflight.size,
          normalizedInflight: normalizedJsonInflight.size
        }
      },
      handoffs: {
        hellWeek: hellWeekHandoffTelemetry()
      },
      time: new Date().toISOString()
    });
    return;
  }

  if (pathname === "/api/phone-bridge/info" && req.method === "GET") {
    sendJson(res, 200, phoneBridgeInfo(req, url));
    return;
  }

  if (pathname === "/api/phone-bridge/invites" && req.method === "POST") {
    sendJson(res, 201, await createPhoneBridgeInvite(req, url, await readBody(req)));
    return;
  }

  const roomletControlMatch = pathname.match(/^\/api\/phone-bridge\/invites\/([a-zA-Z0-9_-]+)\/roomlet-controls$/);
  if (roomletControlMatch && req.method === "GET") {
    sendJson(res, 200, await readRoomletHostControls(roomletControlMatch[1]));
    return;
  }

  if (roomletControlMatch && req.method === "POST") {
    try {
      sendJson(res, 201, await appendRoomletHostControl(roomletControlMatch[1], await readBody(req)));
    } catch (error) {
      sendJson(res, error?.code === "ENOENT" ? 404 : 400, {
        ok: false,
        error: "roomlet_host_control_failed",
        message: error?.message || "Roomlet host control failed."
      });
    }
    return;
  }

  const phoneBridgeInviteMatch = pathname.match(/^\/api\/phone-bridge\/invites\/([a-zA-Z0-9_-]+)\.(html|json|hapa-room)$/);
  if (phoneBridgeInviteMatch && (req.method === "GET" || req.method === "HEAD")) {
    await servePhoneBridgeInviteFile(req, res, phoneBridgeInviteMatch[1], phoneBridgeInviteMatch[2]);
    return;
  }

  if (pathname === "/api/phone-bridge/ca.crt" && req.method === "GET") {
    await servePhoneBridgeCaCertificate(res);
    return;
  }

  if (pathname === "/api/phone-bridge/events" && req.method === "GET") {
    sendJson(res, 200, phoneBridgeReadEvents(url));
    return;
  }

  if (pathname === "/api/phone-bridge/events" && req.method === "POST") {
    sendJson(res, 200, phoneBridgePostEvent(await readBody(req)));
    return;
  }

  if (pathname === "/api/requirements") {
    const { MEDIA_REQUIREMENTS, TAG_LIBRARY } = await import("../src/domain/avatar.js");
    sendJson(res, 200, { requirements: MEDIA_REQUIREMENTS, tags: TAG_LIBRARY });
    return;
  }

  if (pathname === "/api/voicebox/health" && req.method === "GET") {
    sendJson(res, 200, await proxyVoiceboxJson("/health"));
    return;
  }

  if (pathname === "/api/voicebox/profiles" && req.method === "GET") {
    sendJson(res, 200, await proxyVoiceboxJson("/profiles"));
    return;
  }

  if (pathname === "/api/voicebox/captures" && req.method === "GET") {
    sendJson(res, 200, await proxyVoiceboxJson("/captures"));
    return;
  }

  if (pathname === "/api/voicebox/transcribe" && req.method === "POST") {
    sendJson(res, 200, await transcribeVoiceboxAudio(await readBody(req)));
    return;
  }

  if (pathname === "/api/blue-avatar/health" && req.method === "GET") {
    sendJson(res, 200, await blueAvatarHealth());
    return;
  }

  if (pathname === "/api/blue-avatar/owner" && req.method === "GET") {
    sendJson(res, 200, await blueAvatarOwnerStatus());
    return;
  }

  if (pathname === "/api/blue-avatar/owner" && req.method === "POST") {
    sendJson(res, 200, await handleBlueAvatarOwner(await readBody(req), req));
    return;
  }

  if (pathname === "/api/blue-avatar/turn" && req.method === "POST") {
    const body = await readBody(req);
    const ownerCheck = await validateBlueAvatarRequestOwner(body);
    if (!ownerCheck.ok) {
      sendJson(res, 409, ownerCheck);
      return;
    }
    sendJson(res, 200, await blueAvatarTurn(body));
    return;
  }

  const blueAudioMatch = pathname.match(/^\/api\/blue-avatar\/audio\/([^/]+)$/);
  if (blueAudioMatch && req.method === "GET") {
    const ownerCheck = await validateBlueAvatarRequestOwner({
      clientId: url.searchParams.get("clientId") || "",
      sessionId: url.searchParams.get("sessionId") || "",
      surface: url.searchParams.get("surface") || "",
      reason: "blue-avatar-audio"
    }, { allowMissingClient: true, refresh: false });
    if (!ownerCheck.ok) {
      sendJson(res, 409, ownerCheck);
      return;
    }
    await proxyBlueAvatarAudio(res, blueAudioMatch[1]);
    return;
  }

  if (pathname === "/api/hapa-transcribe/health" && req.method === "GET") {
    sendJson(res, 200, await proxyHapaTranscribeHealth(url.searchParams.get("start") === "1"));
    return;
  }

  if (pathname === "/api/hapa-transcribe/transcribe" && req.method === "POST") {
    sendJson(res, 200, await transcribeHapaAudio(await readBody(req)));
    return;
  }

  if (pathname === "/api/overwind/bootstrap" && req.method === "GET") {
    const mode = url.searchParams.get("mode") || "shell";
    if (mode !== "legacy") {
      sendJson(res, 200, await readOverwindShellBootstrap(url.searchParams.get("avatarId") || null));
      return;
    }
    sendJson(res, 200, await readOverwindBootstrap(
      url.searchParams.get("avatarId") || null,
      url.searchParams.get("fullAvatar") === "1"
    ));
    return;
  }

  if (pathname === "/api/overwind/cards" && req.method === "GET") {
    const population = url.searchParams.get("population") || "";
    const result = population
      ? await avatarOverwindSubscriber.population(population, {
          q: url.searchParams.get("q") || "",
          sort: url.searchParams.get("sort") || "-updated_at,card_id"
        })
      : await avatarOverwindSubscriber.search({
          q: url.searchParams.get("q") || "",
          cursor: url.searchParams.get("cursor") || "",
          limit: url.searchParams.get("limit") || 100,
          sort: url.searchParams.get("sort") || "-updated_at,card_id"
        });
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/overwind/library" && req.method === "GET") {
    const [avatarCards, itemCards, avatarStore, itemStore] = await Promise.all([
      avatarOverwindSubscriber.population("avatars"),
      avatarOverwindSubscriber.population("items"),
      readStore(),
      readItemStore()
    ]);
    const localIdFor = (cardId) => {
      try {
        const decoded = Buffer.from(String(cardId).split(":").at(-1), "base64url").toString("utf8");
        return decoded.replace(/^(avatar|item)\//, "");
      } catch { return ""; }
    };
    const project = (cards, records) => {
      const byId = new Map((records || []).map((record) => [String(record.id || record.cardId || record.avatarId || ""), record]));
      return (cards.items || []).map((card) => {
        const localId = localIdFor(card.card_id);
        return {
          ...(byId.get(localId) || {}),
          id: localId || card.card_id,
          _overwind: {
            cardId: card.card_id,
            revision: card.revision,
            eventId: card.event_id,
            eventDigest: card.event_digest,
            ledgerPosition: card.ledger_position,
            truthState: cards.truth_state,
            servingBackend: cards.serving_backend,
            asOfWatermark: cards.as_of_watermark || null,
            localProjection: true
          }
        };
      });
    };
    sendJson(res, 200, {
      schema: "hapa.avatar-builder.overwind-library.v1",
      truth_state: avatarCards.offline || itemCards.offline ? "local-stale" : "overwind-acknowledged",
      consistency_state: avatarCards.offline || itemCards.offline ? "bounded_stale_local_fallback" : "authoritative",
      watermarks: { avatars: avatarCards.as_of_watermark || null, items: itemCards.as_of_watermark || null },
      populations: { avatars: avatarCards.total, items: itemCards.total },
      avatars: project(avatarCards, avatarStore.avatars),
      items: project(itemCards, itemStore.cards),
      teams: avatarStore.teams || [],
      itemStore: { ...itemStore, cards: project(itemCards, itemStore.cards) },
      fallback_policy: avatarCards.fallback_policy || itemCards.fallback_policy || null
    });
    return;
  }

  if (pathname === "/api/overwind/subscriber/status" && req.method === "GET") {
    sendJson(res, 200, { ...avatarOverwindSubscriber.status(), dbPath: AVATAR_OVERWIND_SUBSCRIBER_PATH, overwindUrl: AVATAR_OVERWIND_URL });
    return;
  }

  if (pathname === "/api/overwind/subscriber/rebuild" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await avatarOverwindSubscriber.rebuild());
    return;
  }

  if (pathname === "/api/overwind/subscriber/sync" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await avatarOverwindSubscriber.sync());
    return;
  }

  const overwindCardSurfaceMatch = pathname.match(/^\/api\/overwind\/cards\/([^/]+)(?:\/(history|comments|lineage))?$/);
  if (overwindCardSurfaceMatch) {
    const cardId = decodeURIComponent(overwindCardSurfaceMatch[1]);
    const surface = overwindCardSurfaceMatch[2] || "card";
    if (req.method === "GET") {
      const result = surface === "history" ? await avatarOverwindSubscriber.history(cardId)
        : surface === "comments" ? await avatarOverwindSubscriber.comments(cardId)
          : surface === "lineage" ? await avatarOverwindSubscriber.lineage(cardId)
            : await avatarOverwindSubscriber.get(cardId);
      sendJson(res, 200, result);
      return;
    }
    if (surface === "comments" && req.method === "POST") {
      sendJson(res, 201, await avatarOverwindSubscriber.comment(cardId, await readBody(req)));
      return;
    }
  }

  if (pathname === "/api/overwind/card-origin/status" && req.method === "GET") {
    sendJson(res, 200, { ...avatarOverwindOrigin.health(), outboxPath: AVATAR_OVERWIND_OUTBOX_PATH, overwindUrl: AVATAR_OVERWIND_URL });
    return;
  }

  if (pathname === "/api/overwind/card-origin/sync" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const result = await avatarOverwindOrigin.upload();
    sendJson(res, result.ok ? 200 : 503, result);
    return;
  }

  if (pathname === "/api/overwind/card-origin/migrate-legacy" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await avatarOverwindOrigin.migrateLegacy(SUBSCRIBER_DIR, SUBSCRIBERS));
    return;
  }

  if (pathname === "/api/overwind/card-origin/operation" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const event = avatarOverwindOrigin.appendOperation(body.kind || "item", body.record || {}, body.eventType, body.payload || {}, body.occurredAt);
      sendJson(res, 201, { ok: true, outcome: "committed_pending_ack", event });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (pathname === "/api/kanban") {
    const board = await readJson(KANBAN_PATH);
    sendJson(res, 200, url.searchParams.get("mode") === "shell" ? compactKanbanForOverwindShell(board) : board);
    return;
  }

  if (pathname === "/api/echos/kanban" && req.method === "GET") {
    const boardPath = "/Users/calderwong/Desktop/Echos-of-Other-Eras-Album-App/kanban.json";
    const board = await readJson(boardPath);
    sendJson(res, 200, board);
    return;
  }

  if (pathname === "/api/echos/kanban" && req.method === "POST") {
    const boardPath = "/Users/calderwong/Desktop/Echos-of-Other-Eras-Album-App/kanban.json";
    const body = await readBody(req);
    await writeFile(boardPath, JSON.stringify(JSON.parse(body), null, 2) + "\n");
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === "/api/echos/gaps" && req.method === "GET") {
    const reportPath = path.join(DATA_DIR, "echos-gaps-report.json");
    try {
      const report = await readJson(reportPath);
      if (url.searchParams.get("summary") === "1") {
        sendJson(res, 200, {
          ...report,
          songs: (report.songs || []).map((song) => ({
            id: song.id,
            songId: song.songId,
            title: song.title,
            score: song.score,
            rawPresenceScore: song.rawPresenceScore,
            checklist: song.checklist,
            truthStatus: song.truthStatus,
            placeholderSignals: song.placeholderSignals || []
          })),
          videos: (report.videos || []).map((video) => ({
            id: video.id,
            title: video.title,
            source: video.source,
            sourceId: video.sourceId,
            uri: video.uri,
            thumbnailUri: video.thumbnailUri || "",
            score: video.score,
            truthStatus: video.truthStatus,
            flowType: video.flowType || "",
            ...(video.duration !== null && video.duration !== undefined ? { duration: video.duration } : {}),
            ...(video.characterCount !== null && video.characterCount !== undefined ? { characterCount: video.characterCount } : {}),
            tags: (video.tags || []).filter((tag) => (
              !String(tag).startsWith("obj-") &&
              !String(tag).startsWith("act-")
            )).slice(0, 8)
          }))
        });
        return;
      }
      sendJson(res, 200, report);
    } catch {
      sendJson(res, 404, { error: "report_not_found" });
    }
    return;
  }

  if (pathname === "/api/echos/video-detail" && req.method === "GET") {
    const reportPath = path.join(DATA_DIR, "echos-gaps-report.json");
    const videoId = url.searchParams.get("id");
    const sourceId = url.searchParams.get("sourceId");
    if (!videoId) {
      sendJson(res, 400, { error: "missing_video_id" });
      return;
    }
    try {
      const report = await readJson(reportPath);
      const video = (report.videos || []).find((item) => (
        item.id === videoId && (!sourceId || item.sourceId === sourceId)
      ));
      if (!video) {
        sendJson(res, 404, { error: "video_not_found", id: videoId, sourceId });
        return;
      }
      sendJson(res, 200, video);
    } catch {
      sendJson(res, 404, { error: "report_not_found" });
    }
    return;
  }

  if (pathname === "/api/echos/enrich" && req.method === "POST") {
    const apply = url.searchParams.get("apply") === "1" || url.searchParams.get("mode") === "apply";
    const mode = apply ? "apply" : "dry-run";
    const command = `node scripts/enrich-echos-metadata.mjs ${apply ? "--apply" : "--dry-run"}`;
    import("node:child_process").then(({ exec }) => {
      exec(command, { cwd: ROOT }, (err, stdout, stderr) => {
        if (err) {
          console.error(`Enrichment ${mode} run failed:`, err);
          if (stderr) console.error(stderr);
        } else {
          console.log(`Enrichment ${mode} run success:`, stdout);
        }
      });
    });
    sendJson(res, 202, {
      status: "queued",
      mode,
      apply,
      guardrail: apply ? "writes enabled by explicit apply mode" : "dry-run default; no stores will be written"
    });
    return;
  }

  if (pathname === "/api/echos/director-projects" && req.method === "GET") {
    const projectsDir = path.join(DATA_DIR, "music-video-projects");
    try {
      const exists = await access(projectsDir).then(() => true).catch(() => false);
      if (!exists) {
        sendJson(res, 200, []);
        return;
      }
      const summaryOnly = url.searchParams.get("summary") === "1";
      const files = await readdir(projectsDir);
      const jsonFiles = files.filter(f => f.endsWith(".json"));
      const projectFiles = [];
      for (const file of jsonFiles) {
        try {
          const content = await readFile(path.join(projectsDir, file), "utf-8");
          projectFiles.push({ file, payload: JSON.parse(content) });
        } catch (e) {
          console.error("Failed to parse project file:", file, e);
        }
      }
      const indexedVariants = summaryOnly
        ? await echoDirectionVariantSummaryIndex.variantsForSongs(
          projectFiles.map(({ file, payload }) => payload.music_video_project?.song_id || file.replace(/-video-project\.json$/u, "")),
          readEchoDirectionScriptVariants,
        )
        : null;
      if (indexedVariants) {
        const sources = new Set(indexedVariants.sourceBySong.values());
        res.setHeader("X-Hapa-Echo-Direction-Variant-Summary", sources.size === 1 ? [...sources][0] : "index+authoritative-fallback");
      }
      const projects = [];
      for (const { file, payload } of projectFiles) {
        try {
          if (summaryOnly) {
            const project = payload.music_video_project || {};
            const songId = project.song_id || file.replace(/-video-project\.json$/u, "");
            const fileVariants = indexedVariants.bySong.get(songId) || [];
            const variants = mergeEchoDirectionScriptVariants(fileVariants, project.direction_script_variants);
            projects.push({
              music_video_project: {
                song_id: project.song_id,
                song_title: project.song_title,
                audio_id: project.audio_id || project.registry_track_id || project.song_id,
                registry_track_id: project.registry_track_id || null,
                perspective: project.perspective,
                avatar_name: project.avatar_name,
                duration: project.duration,
                lyric_variant: project.lyric_variant,
                lyric_position: project.lyric_position,
                lyric_style: project.lyric_style,
                lyric_timing_heal: project.lyric_timing_heal || null,
                media_density_telemetry: project.media_density_telemetry || null,
                timeline_count: Array.isArray(project.timeline) ? project.timeline.length : 0,
                visualizer_timeline_count: Array.isArray(project.visualizer_timeline) ? project.visualizer_timeline.length : 0,
                timed_lyrics_count: Array.isArray(project.timed_lyrics) ? project.timed_lyrics.length : 0,
                direction_script_variant_count: variants.length,
                direction_script_variant_summaries: variants.map((variant) => summarizeEchoDirectionScriptVariant(
                  variant,
                  Array.isArray(project.timeline) ? project.timeline.length : 0,
                )),
                updated_at: project.updated_at || null,
                provenance: project.provenance || null
              }
            });
          } else {
            projects.push(payload);
          }
        } catch (e) {
          console.error("Failed to summarize project file:", file, e);
        }
      }
      sendJson(res, 200, projects);
    } catch (e) {
      console.error("Failed to load director projects:", e);
      sendJson(res, 500, { error: "failed_to_load_projects" });
    }
    return;
  }

  if (pathname === "/api/echos/director-project" && req.method === "GET") {
    const songId = url.searchParams.get("songId");
    if (!songId) {
      sendJson(res, 400, { error: "missing_song_id" });
      return;
    }
    const projectsDir = path.join(DATA_DIR, "music-video-projects");
    const safeName = path.basename(songId);
    const filePath = path.join(projectsDir, `${safeName}-video-project.json`);
    const profile = url.searchParams.get("profile") === "source" ? "source" : "editor";
    let selectedVariantId = "";
    try {
      const requestedVariantId = url.searchParams.get("variantId");
      selectedVariantId = requestedVariantId ? safeEchoDirectionPathSegment(requestedVariantId, "variant") : "";
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), {
        error: error?.code || "invalid_variant_id",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    try {
      const payload = await readJson(filePath);
      const hydrated = await hydrateEchoDirectorProjectPayload(payload, safeName, {
        profile,
        selectedVariantId,
      });
      res.setHeader("X-Hapa-Echo-Detail-Profile", profile === "source" ? "source-v1" : "editor-bounded-v1");
      if (selectedVariantId) res.setHeader("X-Hapa-Echo-Selected-Variant", selectedVariantId);
      sendJson(res, 200, hydrated);
    } catch (error) {
      if (error?.code === "direction_variant_not_found") {
        sendJson(res, 404, {
          error: error.code,
          message: error.message,
          songId: safeName,
          variantId: selectedVariantId,
        });
        return;
      }
      sendJson(res, 404, { error: "project_not_found", songId });
    }
    return;
  }

  if (pathname === "/api/echos/director-preview/prepare" && req.method === "GET") {
    const songId = path.basename(url.searchParams.get("songId") || "");
    sendJson(res, 200, echoPreviewPreparationJobs.get(songId) || { songId, status: "idle", progress: null });
    return;
  }

  if (pathname === "/api/echos/director-preview/prepare" && req.method === "POST") {
    const songId = path.basename(url.searchParams.get("songId") || "");
    if (!songId || !fs.existsSync(path.join(DATA_DIR, "music-video-projects", `${songId}-video-project.json`))) {
      sendJson(res, 404, { error: "project_not_found", songId }); return;
    }
    const current = echoPreviewPreparationJobs.get(songId);
    if (["queued", "running"].includes(current?.status)) { sendJson(res, 202, current); return; }
    const job = { schemaVersion: "hapa.echo.preview-preparation.v1", songId, status: "queued", queuedAt: new Date().toISOString(), startedAt: null, completedAt: null, exitCode: null, outputTail: "" };
    echoPreviewPreparationJobs.set(songId, job);
    echoPreviewPreparationQueue.push(job);
    pumpEchoPreviewPreparationQueue();
    sendJson(res, 202, job);
    return;
  }

  if (pathname === "/api/echos/shaders") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      sendJson(res, 405, { error: "method_not_allowed", method: req.method, allow: ["GET"] });
      return;
    }
    try {
      const catalog = await echoIsfAssets.load();
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("ETag", `"sha256-${catalog.manifest.hash}"`);
      sendJson(res, 200, catalog.shaders);
    } catch (error) {
      console.error("Failed to load shaders:", error);
      sendJson(res, 503, {
        error: "echo_shader_catalog_unavailable",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (pathname === "/api/echos/shader-source") {
    if (!isGetOrHead(req)) {
      res.setHeader("Allow", "GET, HEAD");
      sendJson(res, 405, { error: "method_not_allowed", method: req.method, allow: ["GET", "HEAD"] });
      return;
    }
    const shaderId = url.searchParams.get("id") || "";
    if (!shaderId) {
      sendJson(res, 400, { error: "missing_shader_id" });
      return;
    }
    try {
      const requestedHash = url.searchParams.get("sha256") || "";
      const result = await echoIsfAssets.shader(shaderId, requestedHash);
      if (result.status === "missing") {
        sendJson(res, 404, { error: "shader_not_found", shaderId });
        return;
      }
      if (result.status === "hash-mismatch") {
        sendJson(res, 409, {
          error: "shader_source_hash_mismatch",
          shaderId,
          expectedSha256: result.expectedHash,
          requestedSha256: result.requestedHash
        });
        return;
      }
      writeEchoIsfAsset(req, res, result.record, {
        contentType: "text/plain; charset=utf-8",
        shaderId,
        immutable: Boolean(requestedHash)
      });
    } catch (error) {
      sendJson(res, 503, {
        error: "echo_shader_source_unavailable",
        shaderId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (pathname === "/api/echos/isf-runtime.js") {
    if (!isGetOrHead(req)) {
      res.setHeader("Allow", "GET, HEAD");
      sendJson(res, 405, { error: "method_not_allowed", method: req.method, allow: ["GET", "HEAD"] });
      return;
    }
    try {
      const requestedHash = url.searchParams.get("sha256") || "";
      const result = await echoIsfAssets.runtime(requestedHash);
      if (result.status === "hash-mismatch") {
        sendJson(res, 409, {
          error: "isf_runtime_hash_mismatch",
          expectedSha256: result.expectedHash,
          requestedSha256: result.requestedHash
        });
        return;
      }
      writeEchoIsfAsset(req, res, result.record, {
        contentType: "text/javascript; charset=utf-8",
        immutable: Boolean(requestedHash)
      });
    } catch (error) {
      sendJson(res, 503, {
        error: "echo_isf_runtime_unavailable",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (pathname === "/api/echos/director-project" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const proj = body.music_video_project;
      if (!proj || !proj.song_id) {
        sendJson(res, 400, { error: "invalid_project_payload" });
        return;
      }
      const projectsDir = path.join(DATA_DIR, "music-video-projects");
      const filePath = path.join(projectsDir, `${proj.song_id}-video-project.json`);
      const persistedProject = { ...proj };
      if (Array.isArray(persistedProject.direction_script_variants)) {
        const embeddedVariants = persistedProject.direction_script_variants.filter((variant) => variant?.variant_source?.kind !== "append-only-project-variant");
        if (embeddedVariants.length) persistedProject.direction_script_variants = embeddedVariants;
        else delete persistedProject.direction_script_variants;
      }
      await writeFile(filePath, JSON.stringify({ ...body, music_video_project: persistedProject }, null, 2), "utf-8");
      console.log(`[api] Updated music video project plan: ${proj.song_id}`);
      sendJson(res, 200, { success: true });
    } catch (e) {
      console.error("Failed to save director project:", e);
      sendJson(res, 500, { error: "failed_to_save_project" });
    }
    return;
  }

  if (pathname === "/api/echos/direction-variant/fork" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const result = await createEchoDirectionVariantFork(body);
      sendJson(res, 201, result);
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), {
        error: error?.code || "direction_variant_fork_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (pathname === "/api/echos/director-plan" && req.method === "POST") {
    const apply = url.searchParams.get("apply") === "1" || url.searchParams.get("mode") === "apply";
    const mode = apply ? "apply" : "dry-run";
    const command = `node scripts/generate-music-video-plans.mjs ${apply ? "--apply" : "--dry-run"}`;
    import("node:child_process").then(({ exec }) => {
      exec(command, { cwd: ROOT }, (err, stdout, stderr) => {
        if (err) {
          console.error(`Director planning ${mode} run failed:`, err);
          if (stderr) console.error(stderr);
        } else {
          console.log(`Director planning ${mode} run success:`, stdout);
        }
      });
    });
    sendJson(res, 202, {
      status: "queued",
      mode,
      apply,
      guardrail: apply ? "writes enabled by explicit apply mode" : "dry-run default; no project files will be written"
    });
    return;
  }

  if (pathname === "/api/song-cards" && req.method === "GET") {
    try {
      sendJson(res, 200, await songCardMintController.catalogProjection());
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardRootMatch = pathname.match(/^\/api\/song-cards\/([^/]+)$/);
  if (songCardRootMatch && req.method === "GET") {
    try {
      sendJson(res, 200, await songCardMintController.getSongCard(songCardRootMatch[1]));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardPlanMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/plan$/);
  if (songCardPlanMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const songId = decodeURIComponent(songCardPlanMatch[1]);
    const operation = createSongCardPlanOperation(req, res, `song:${songId}`);
    try {
      const body = await readBody(req);
      operation.checkpoint("request-body-read");
      const input = await hydrateSongCardMintInput(body, { signal: operation.signal });
      await yieldSongCardPlanTurn(operation.signal);
      operation.checkpoint("before-mint-planning");
      const plan = await songCardMintController.plan(songId, input);
      operation.checkpoint("after-mint-planning");
      const storedPlan = await songCardMintController.getPlan(plan.planId);
      const proposed = await songCardRemintStore.proposeFromPlan(songId, storedPlan);
      const remintQueue = await songCardRemintStore.view();
      const remintCandidate = proposed
        ? remintQueue.candidates.find((candidate) => candidate.id === proposed.id) || null
        : null;
      sendJson(res, 200, withSongCardRenderExecutor({ plan, remintCandidate }));
    } catch (error) {
      if (!suppressSongCardPlanErrorResponse(res, error)) sendSongCardMintError(res, error);
    } finally {
      operation.dispose();
    }
    return;
  }

  const songCardMintMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/mint$/);
  if (songCardMintMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const songId = decodeURIComponent(songCardMintMatch[1]);
      const result = await songCardRemintStore.mintExplicit({
        songId,
        planId: body.planId,
        edition: body.expectedEdition,
      }, () => songCardMintController.mint(songId, {
          ...body,
          idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
          expectedHeadGeneration: req.headers["if-match"] ?? body.expectedHeadGeneration,
        }));
      const readModel = result.songCard || await songCardMintController.getSongCard(songId);
      const songStoreProjection = await projectSongCardMintHeadToMutableSong(songId, readModel).catch((error) => ({ status: "pending", error: error instanceof Error ? error.message : String(error) }));
      sendJson(res, result.created ? 201 : 200, {
        ...readModel,
        jobId: result.jobId,
        created: result.created,
        reason: result.reason,
        editionNumber: result.edition,
        edition: result.editionRecord || readModel.editions?.find((row) => row.edition === Number(result.edition)) || null,
        downstreamProjection: songStoreProjection,
      });
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardEditionsMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions$/);
  if (songCardEditionsMatch && req.method === "GET") {
    try {
      sendJson(res, 200, { songId: songCardEditionsMatch[1], editions: await songCardMintController.listEditions(songCardEditionsMatch[1]) });
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardEditionMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)$/);
  if (songCardEditionMatch && req.method === "GET") {
    try {
      sendJson(res, 200, await songCardMintController.detail(songCardEditionMatch[1], Number(songCardEditionMatch[2])));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardEditionExportMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/export$/);
  if (songCardEditionExportMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const result = await songCardMintController.exportEdition(
        decodeURIComponent(songCardEditionExportMatch[1]),
        Number(songCardEditionExportMatch[2]),
        { format: body.format || "bundle" },
      );
      sendJson(res, 201, result);
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardCardsAtTimeMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/cards-at-time$/);
  if (songCardCardsAtTimeMatch && req.method === "GET") {
    try {
      const timeMs = Number(url.searchParams.get("timeMs") ?? url.searchParams.get("ms") ?? 0);
      sendJson(res, 200, await songCardMintController.cardsAtTime(songCardCardsAtTimeMatch[1], Number(songCardCardsAtTimeMatch[2]), timeMs));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardPrintMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/print$/);
  if (songCardPrintMatch && req.method === "POST") {
    try {
      const body = await readBody(req);
      sendJson(res, 201, await songCardMintController.print(songCardPrintMatch[1], Number(songCardPrintMatch[2]), Number(body.timeMs || 0), body));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardEventsMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/events$/);
  if (songCardEventsMatch && req.method === "POST") {
    try {
      const body = await readBody(req);
      const event = body.type === "play-summary"
        ? await songCardMintController.recordPlaySummary(songCardEventsMatch[1], Number(songCardEventsMatch[2]), body)
        : await songCardMintController.recordOpen(songCardEventsMatch[1], Number(songCardEventsMatch[2]), body);
      sendJson(res, 202, event);
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardArtifactTicketMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/artifact-ticket$/);
  if (songCardArtifactTicketMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const role = String(body.role || "master");
      await songCardMintController.artifactInfo(songCardArtifactTicketMatch[1], Number(songCardArtifactTicketMatch[2]), role);
      const ticket = issueSongCardArtifactTicket(songCardArtifactTicketMatch[1], Number(songCardArtifactTicketMatch[2]), role);
      sendJson(res, 201, { schemaVersion: "hapa.song-card.artifact-ticket.v1", role, ticket, expiresInMs: 15 * 60 * 1000 });
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardArtifactMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/artifact\/([^/]+)$/);
  if (songCardArtifactMatch && ["GET", "HEAD"].includes(req.method)) {
    if (!authorizeSongCardArtifact(req, res, url, songCardArtifactMatch[1], Number(songCardArtifactMatch[2]), songCardArtifactMatch[3])) return;
    try {
      await serveSongCardEditionArtifact(req, res, await songCardMintController.artifactInfo(songCardArtifactMatch[1], Number(songCardArtifactMatch[2]), songCardArtifactMatch[3]));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardPrivateMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/private-manifest$/);
  if (songCardPrivateMatch && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    try {
      sendJson(res, 200, await songCardMintController.privateManifest(songCardPrivateMatch[1], Number(songCardPrivateMatch[2])));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardVerifyMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/verify$/);
  if (songCardVerifyMatch && req.method === "GET") {
    try {
      sendJson(res, 200, await songCardMintController.verify(songCardVerifyMatch[1], Number(songCardVerifyMatch[2])));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardGovernanceMatch = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/(archive|revoke)$/);
  if (songCardGovernanceMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const result = songCardGovernanceMatch[3] === "archive"
        ? await songCardMintController.archive(songCardGovernanceMatch[1], Number(songCardGovernanceMatch[2]), body)
        : await songCardMintController.revoke(songCardGovernanceMatch[1], Number(songCardGovernanceMatch[2]), body);
      sendJson(res, 200, result);
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardPlanJobMatch = pathname.match(/^\/api\/song-card-mint-jobs\/([^/]+)$/);
  if (songCardPlanJobMatch && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    try {
      const { renderMasterPath: _renderMasterPath, posterPath: _posterPath, ...job } = songCardMintController.publicPlan(await songCardMintController.getPlan(songCardPlanJobMatch[1]));
      sendJson(res, 200, job);
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }
  if (songCardPlanJobMatch && req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    try {
      sendJson(res, 200, await songCardMintController.cancel(songCardPlanJobMatch[1], { reason: url.searchParams.get("reason") || "operator-canceled" }));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  const songCardRetryJobMatch = pathname.match(/^\/api\/song-card-mint-jobs\/([^/]+)\/retry$/);
  if (songCardRetryJobMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      sendJson(res, 200, { plan: await songCardMintController.retry(songCardRetryJobMatch[1]) });
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }

  if (pathname === "/api/song-card-mint/recover" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try { sendJson(res, 200, await songCardMintController.recover()); } catch (error) { sendSongCardMintError(res, error); }
    return;
  }
  if (pathname === "/api/song-card-mint/cleanup-staging" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try { sendJson(res, 200, await songCardMintController.cleanup(await readBody(req))); } catch (error) { sendSongCardMintError(res, error); }
    return;
  }

  if (pathname === "/api/song-card-remints" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    try { sendJson(res, 200, withSongCardRenderExecutor(await songCardRemintStore.view())); } catch (error) { sendSongCardMintError(res, error); }
    return;
  }
  if (pathname === "/api/song-card-remints/executor-status" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, songCardRenderExecutorStatus());
    return;
  }
  if (pathname === "/api/song-card-remints/executor-heartbeat" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      if (!noteSongCardRenderExecutor(body)) {
        sendJson(res, 400, { error: "invalid_render_executor_id", failClosed: true });
        return;
      }
      sendJson(res, 200, songCardRenderExecutorStatus());
    } catch (error) { sendSongCardMintError(res, error); }
    return;
  }
  if (pathname === "/api/song-card-remints/enqueue" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try { sendJson(res, 200, withSongCardRenderExecutor(await songCardRemintStore.enqueue())); } catch (error) { sendSongCardMintError(res, error); }
    return;
  }
  const songCardLocalRenderMatch = pathname.match(/^\/api\/song-card-remints\/([^/]+)\/render-local$/);
  if (songCardLocalRenderMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const candidateId = decodeURIComponent(songCardLocalRenderMatch[1]);
      const started = await songCardLocalRenderBridge.start(candidateId);
      sendJson(res, started?.started === false ? 200 : 202, withSongCardRenderExecutor({
        ...started,
        candidateId,
      }));
    } catch (error) {
      sendSongCardMintError(res, error);
    }
    return;
  }
  if (pathname === "/api/song-card-playback/activity" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const sessionId = String(body.sessionId || "").trim();
      if (!sessionId || sessionId.length > 240) {
        sendJson(res, 400, { error: "invalid_playback_session", failClosed: true });
        return;
      }
      if (body.active === true) songCardPlaybackSessions.set(sessionId, Date.now() + SONG_CARD_PLAYBACK_HEARTBEAT_TTL_MS);
      else songCardPlaybackSessions.delete(sessionId);
      sendJson(res, 200, { schemaVersion: "hapa.song-card.playback-activity.v1", sessionId, active: body.active === true, activeSessionCount: activeSongCardPlaybackSessions(), heartbeatTtlMs: SONG_CARD_PLAYBACK_HEARTBEAT_TTL_MS });
    } catch (error) { sendSongCardMintError(res, error); }
    return;
  }
  if (pathname === "/api/song-card-remints/claim" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      noteSongCardRenderExecutor(body);
      const songCardSessions = activeSongCardPlaybackSessions();
      const serverObservedActive = activeTarotStreamConsumers > 0 || songCardSessions > 0;
      const activePlayback = serverObservedActive || body.activePlayback !== false;
      sendJson(res, 200, {
        ...(await songCardRemintStore.claim({ ...body, activePlayback })),
        renderExecutor: songCardRenderExecutorStatus(),
        playbackPolicy: {
          activePlayback,
          serverObservedActive,
          activeTarotStreamConsumers,
          activeSongCardSessions: songCardSessions,
          defaultProtectedUnlessExplicitlyIdle: true,
        },
      });
    } catch (error) { sendSongCardMintError(res, error); }
    return;
  }
  const songCardRemintActionMatch = pathname.match(/^\/api\/song-card-remints\/([^/]+)\/(approve|cancel)$/);
  if (songCardRemintActionMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const candidateId = decodeURIComponent(songCardRemintActionMatch[1]);
      const body = await readBody(req);
      const action = songCardRemintActionMatch[2];
      const queue = action === "approve"
        ? await songCardRemintStore.approve(candidateId, body)
        : await songCardRemintStore.cancel(candidateId, body);
      const localRenderCancellation = action === "cancel"
        ? await songCardLocalRenderBridge.cancel(candidateId, { reason: body.reason || "operator-canceled-next-mint-render" })
        : null;
      sendJson(res, 200, withSongCardRenderExecutor({
        ...queue,
        ...(localRenderCancellation ? { localRenderCancellation } : {}),
      }));
    } catch (error) { sendSongCardMintError(res, error); }
    return;
  }
  const songCardRemintBindMatch = pathname.match(/^\/api\/song-card-remints\/([^/]+)\/bind-render-plan$/);
  if (songCardRemintBindMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const candidateId = decodeURIComponent(songCardRemintBindMatch[1]);
    const operation = createSongCardPlanOperation(req, res, `remint:${candidateId}`);
    try {
      const body = await readBody(req);
      operation.checkpoint("request-body-read");
      const input = await hydrateSongCardMintInput(body, { signal: operation.signal });
      await yieldSongCardPlanTurn(operation.signal);
      operation.checkpoint("before-remint-plan-binding");
      sendJson(res, 200, await songCardRemintStore.bindRenderPlan(
        candidateId,
        input,
      ));
    } catch (error) {
      if (!suppressSongCardPlanErrorResponse(res, error)) sendSongCardMintError(res, error);
    } finally {
      operation.dispose();
    }
    return;
  }
  const songCardRemintResultMatch = pathname.match(/^\/api\/song-card-remints\/([^/]+)\/jobs\/([^/]+)\/result$/);
  if (songCardRemintResultMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      noteSongCardRenderExecutor(body);
      sendJson(res, 200, withSongCardRenderExecutor(await songCardRemintStore.recordResult(
        decodeURIComponent(songCardRemintResultMatch[1]),
        decodeURIComponent(songCardRemintResultMatch[2]),
        body,
      )));
    } catch (error) { sendSongCardMintError(res, error); }
    return;
  }

  if (pathname === "/api/hapa-songs" && req.method === "GET") {
    sendJson(res, 200, await readHapaSongStore());
    return;
  }

  if (pathname === "/api/song-registry/dear-papa" && req.method === "GET") {
    const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || 500)));
    sendJson(res, 200, await readDearPapaRegistrySongs(limit));
    return;
  }

  const registrySongMatch = pathname.match(/^\/api\/song-registry\/songs\/([^/]+)$/);
  if (registrySongMatch && req.method === "GET") {
    const song = await findRegistrySong(registrySongMatch[1]);
    if (!song) {
      sendJson(res, 404, { error: "song_not_found", id: registrySongMatch[1] });
      return;
    }
    sendJson(res, 200, compactRegistrySong(song, { detail: true }));
    return;
  }

  const registryAudioMatch = pathname.match(/^\/api\/song-registry\/audio\/([^/]+)$/);
  if (registryAudioMatch && req.method === "GET") {
    const song = await findRegistrySong(registryAudioMatch[1]);
    if (!song?.localPath) {
      sendJson(res, 404, { error: "audio_not_found", id: registryAudioMatch[1] });
      return;
    }
    await serveLocalFile(song.localPath, req, res);
    return;
  }

  const registryCoverMatch = pathname.match(/^\/api\/song-registry\/covers\/([^/]+)$/);
  if (registryCoverMatch && req.method === "GET") {
    const song = await findRegistrySong(registryCoverMatch[1]);
    const coverPath = song?.raw?._hapaPlaylistExport?.coverPath;
    if (!coverPath) {
      sendJson(res, 404, { error: "cover_not_found", id: registryCoverMatch[1] });
      return;
    }
    await serveLocalFile(coverPath, req, res);
    return;
  }

  if (pathname === "/api/hapa-songs" && req.method === "PUT") {
    const songbook = await readDearPapaSongbook();
    const store = normalizeHapaSongStore(await readBody(req), songbook);
    await writeHapaSongStore(store);
    await appendSubscriberRegistration("songs.updated", { songStore: store });
    sendJson(res, 200, store);
    return;
  }

  const songMediaMatch = pathname.match(/^\/api\/hapa-songs\/([^/]+)\/media$/);
  if (songMediaMatch && req.method === "POST") {
    const songId = decodeURIComponent(songMediaMatch[1]);
    const body = await readBody(req);
    const store = await readHapaSongStore();
    const song = findSongInStore(store, songId);
    if (!song) {
      sendJson(res, 404, { error: "song_not_found", id: songId });
      return;
    }
    const persistedInput = body.dataUrl ? await persistMedia(body) : body.asset || body;
    const relationship = {
      ownerType: "song",
      ownerId: song.id,
      ownerName: song.title || song.songId || song.id,
      role: body.role || body.options?.role || "song-media"
    };
    const persisted = withMediaAttachmentRelationship(persistedInput, relationship, {
      source: "songs.media-attached",
      tags: ["song-media", "dear-papa"]
    });
    const nextSong = attachSongMedia(song, persisted, body.options || body);
    const songbook = await readDearPapaSongbook();
    const nextStore = upsertSongInStore(store, nextSong, songbook);
    await writeHapaSongStore(nextStore);
    const attachedMedia = (nextSong.media || []).find((media) => media.id === persisted.id) || persisted;
    await syncMediaAttachmentRecord(attachedMedia, relationship, {
      source: "songs.media-attached",
      sourceKind: "song-media",
      tags: ["song-media", "dear-papa"]
    });
    await appendSubscriberRegistration("songs.media-attached", { songStore: nextStore, media: persisted });
    sendJson(res, 201, { song: nextSong, media: persisted, store: nextStore });
    return;
  }

  const songMatch = pathname.match(/^\/api\/hapa-songs\/([^/]+)$/);
  if (songMatch && req.method === "GET") {
    const songId = decodeURIComponent(songMatch[1]);
    const song = findSongInStore(await readHapaSongStore(), songId);
    if (!song) sendJson(res, 404, { error: "hapa_song_not_found", songId });
    else sendJson(res, 200, song);
    return;
  }
  if (songMatch && req.method === "PUT") {
    const songId = decodeURIComponent(songMatch[1]);
    const songbook = await readDearPapaSongbook();
    const store = await readHapaSongStore();
    const currentSong = findSongInStore(store, songId) || {};
    const incomingBody = await readBody(req);
    const incomingSong = normalizeHapaSong({ ...currentSong, ...incomingBody, id: currentSong.id || incomingBody.id || songId });
    const nextStore = upsertSongInStore(store, incomingSong, songbook);
    await writeHapaSongStore(nextStore);
    await appendSubscriberRegistration("songs.song-updated", { songStore: nextStore });
    sendJson(res, 200, findSongInStore(nextStore, songId) || incomingSong);
    return;
  }

  if (pathname === "/api/world" && req.method === "GET") {
    sendJson(res, 200, await readSceneStore());
    return;
  }

  if (pathname === "/api/system-media" && req.method === "GET") {
    const library = await readSystemMediaLibrary();
    sendJson(res, 200, url.searchParams.get("full") === "1" ? library : compactSystemMediaLibrary(library));
    return;
  }

  const systemMediaRecordMatch = pathname.match(/^\/api\/system-media\/records\/([^/]+)$/);
  if (systemMediaRecordMatch && req.method === "PATCH") {
    const library = await patchSystemMediaRecord(systemMediaRecordMatch[1], await readBody(req));
    sendJson(res, 200, compactSystemMediaLibrary(library));
    return;
  }

  if (pathname === "/api/world" && req.method === "PUT") {
    const graph = normalizeSceneGraph(await readBody(req));
    await writeSceneStore(graph);
    await appendSubscriberRegistration("world.updated", { sceneGraph: graph });
    sendJson(res, 200, graph);
    return;
  }

  if (pathname === "/api/world/places" && req.method === "POST") {
    const body = await readBody(req);
    const graph = createPlace(await readSceneStore(), body);
    await writeSceneStore(graph);
    await appendSubscriberRegistration("world.place-created", { sceneGraph: graph });
    sendJson(res, 201, graph);
    return;
  }

  if (pathname === "/api/world/scenes" && req.method === "POST") {
    const body = await readBody(req);
    const graph = createScene(await readSceneStore(), body);
    await writeSceneStore(graph);
    await appendSubscriberRegistration("world.scene-created", { sceneGraph: graph });
    sendJson(res, 201, graph);
    return;
  }

  if (pathname === "/api/world/attach" && req.method === "GET") {
    const graph = await readSceneStore();
    sendJson(res, 200, createSceneAttachPack(graph, url.searchParams.get("sceneId") || null));
    return;
  }

  if (pathname === "/api/items" && req.method === "GET") {
    sendJson(res, 200, await readItemStore());
    return;
  }

  const itemCardDetailMatch = pathname.match(/^\/api\/items\/cards\/([^/]+)$/);
  if (itemCardDetailMatch && req.method === "GET") {
    const cardId = decodeURIComponent(itemCardDetailMatch[1]);
    const itemStore = await readItemStore();
    const card = (itemStore.cards || []).find((entry) => entry.id === cardId);
    if (!card) sendJson(res, 404, { error: "item_card_not_found", cardId });
    else sendJson(res, 200, card);
    return;
  }

  if (pathname === "/api/items" && req.method === "PUT") {
    const itemStore = normalizeItemManagerStore(await readBody(req));
    await writeItemStore(itemStore);
    await appendSubscriberRegistration("items.updated", { itemStore });
    sendJson(res, 200, itemStore);
    return;
  }

  if (pathname === "/api/items/cards" && req.method === "POST") {
    const body = await readBody(req);
    const itemStore = await readItemStore();
    const card = createItemCard(body.card || body);
    itemStore.cards = [card, ...itemStore.cards.filter((item) => item.id !== card.id)];
    itemStore.updatedAt = new Date().toISOString();
    await writeItemStore(itemStore);
    await appendSubscriberRegistration("items.card-upserted", { itemStore });
    sendJson(res, 201, normalizeItemManagerStore(itemStore));
    return;
  }

  if (pathname === "/api/items/attach" && req.method === "GET") {
    const itemStore = await readItemStore();
    const inventoryStore = await readInventoryStore();
    sendJson(res, 200, createInventoryAttachPack(inventoryStore, itemStore, url.searchParams.get("avatarId") || null));
    return;
  }

  if (pathname === "/api/inventory" && req.method === "GET") {
    sendJson(res, 200, await readInventoryStore());
    return;
  }

  if (pathname === "/api/inventory" && req.method === "PUT") {
    const store = await readStore();
    const itemStore = await readItemStore();
    const inventoryStore = normalizeInventoryStore(await readBody(req), store.avatars || [], itemStore.cards || []);
    await writeInventoryStore(inventoryStore);
    await appendSubscriberRegistration("inventory.updated", { inventoryStore });
    sendJson(res, 200, inventoryStore);
    return;
  }

  if (pathname === "/api/inventory/equip" && req.method === "POST") {
    const body = await readBody(req);
    const store = await readStore();
    const itemStore = await readItemStore();
    const inventoryStore = await readInventoryStore();
    const avatar = (store.avatars || []).find((item) => item.id === body.avatarId || item.id === body.avatar_id);
    const card = (itemStore.cards || []).find((item) => item.id === body.cardId || item.id === body.card_id);
    if (!avatar || !card) {
      sendJson(res, 404, { error: "inventory_target_not_found", avatarId: body.avatarId || body.avatar_id, cardId: body.cardId || body.card_id });
      return;
    }
    const nextInventoryStore = equipItemCard(
      inventoryStore,
      { avatarId: avatar.id, avatarName: avatar.primaryName },
      card,
      body.hardpointId || body.hardpoint_id || "items",
      body.zone || "equipped"
    );
    await writeInventoryStore(nextInventoryStore);
    await appendSubscriberRegistration("inventory.card-equipped", { inventoryStore: nextInventoryStore, itemStore });
    sendJson(res, 200, nextInventoryStore);
    return;
  }

  if (pathname === "/api/media/backgroundless" && req.method === "GET") {
    const store = await readStore();
    sendJson(res, 200, createBackgroundlessVideoLibrarySummary(store));
    return;
  }

  if (pathname === "/api/media" && req.method === "POST") {
    const body = await readBody(req);
    const savedInput = await persistMedia(body);
    const relationship = {
      ownerType: "library",
      ownerId: "system-media",
      ownerName: "System Media Library",
      role: "persisted-media"
    };
    const saved = withMediaAttachmentRelationship(savedInput, relationship, {
      source: "media.persisted",
      tags: ["persisted-media", "unassigned"]
    });
    await syncMediaAttachmentRecord(saved, relationship, {
      source: "media.persisted",
      sourceKind: "persisted-media",
      tags: ["persisted-media", "unassigned"]
    });
    await appendSubscriberRegistration("media.persisted", { media: saved });
    sendJson(res, 201, saved);
    return;
  }

  if (pathname.startsWith("/api/tarot/card/") && req.method === "GET") {
    let cardId = pathname.replace(/^\/api\/tarot\/card\//, "");
    if (!cardId) {
      sendJson(res, 400, { error: "missing_card_id" });
      return;
    }
    const tarotStore = await readTarotStore();
    let card = tarotStore.cards.find(c => c.id === cardId);
    if (card) {
      sendJson(res, 200, card);
      return;
    }

    const reportPath = path.join(DATA_DIR, "echos-gaps-report.json");
    let gapsVideo = null;
    try {
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(await fs.promises.readFile(reportPath, "utf8"));
        const video = (report.videos || []).find(v => v.id === cardId);
        if (video) {
          gapsVideo = video;
          if (video.sourceId && video.sourceId !== "none") {
            cardId = video.sourceId;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to check echos-gaps-report.json:", e);
    }

    card = tarotStore.cards.find(c => c.id === cardId);
    if (card) {
      sendJson(res, 200, card);
      return;
    }

    const dbPath = path.join(process.env.HOME || "/Users/calderwong", "Library", "Application Support", "hapa-ag", "persistence.db");
    if (fs.existsSync(dbPath)) {
      try {
        let currentId = cardId;
        let leafVideoUri = null;
        let leafPosterUri = null;
        let visited = new Set();

        const cmd = `sqlite3 "${dbPath}" "SELECT json_object('id', id, 'parent_id', parent_id, 'name', name, 'media_local_path', media_local_path, 'thumbnail', thumbnail, 'created_at', created_at, 'lore', lore, 'content_text', content_text, 'metadata_json', metadata_json, 'media_kind', media_kind) FROM cards WHERE id = '${currentId}' AND is_deleted = 0 LIMIT 1"`;
        const stdout = execSync(cmd, { encoding: 'utf8' });

        if (stdout.trim()) {
          let row = JSON.parse(stdout.trim());
          const leafMeta = row.metadata_json ? JSON.parse(row.metadata_json) : {};
          leafVideoUri = leafMeta.representativeMediaLocalPath ? `/api/local-file?path=${encodeURIComponent(leafMeta.representativeMediaLocalPath)}` : (row.media_local_path || "");
          leafPosterUri = leafMeta.thumbnail || row.thumbnail || "";

          visited.add(row.id);
          let current = row;

          while (current.parent_id && current.parent_id !== "1" && current.parent_id !== "0" && !visited.has(current.parent_id)) {
            try {
              const parentId = current.parent_id;
              const parentCmd = `sqlite3 "${dbPath}" "SELECT json_object('id', id, 'parent_id', parent_id, 'name', name, 'media_local_path', media_local_path, 'thumbnail', thumbnail, 'created_at', created_at, 'lore', lore, 'content_text', content_text, 'metadata_json', metadata_json, 'media_kind', media_kind) FROM cards WHERE id = '${parentId}' AND is_deleted = 0 LIMIT 1"`;
              const parentStdout = execSync(parentCmd, { encoding: 'utf8' });
              if (parentStdout.trim()) {
                const parentRow = JSON.parse(parentStdout.trim());
                visited.add(parentRow.id);
                current = parentRow;
              } else {
                break;
              }
            } catch (err) {
              console.error("Error tracing parent card:", err);
              break;
            }
          }

          const topMeta = current.metadata_json ? JSON.parse(current.metadata_json) : {};

          const cardFace = { sections: [] };
          if (Array.isArray(topMeta.skills) && topMeta.skills.length > 0) {
            const skillsText = topMeta.skills.map(s => `**${s.name}** (${s.type || "Passive"}): ${s.description}`).join("\n\n");
            cardFace.sections.push({
              label: "Skills",
              value: skillsText
            });
          }
          if (topMeta.wants) {
            cardFace.sections.push({
              label: "Wants",
              value: topMeta.wants
            });
          }

          const cardObj = {
            id: current.id,
            title: current.name || topMeta.name || current.id,
            summary: current.lore || topMeta.lore || current.content_text || topMeta.content_text || "",
            meaning: current.lore || topMeta.lore || current.content_text || topMeta.content_text || "",
            description: current.lore || topMeta.lore || current.content_text || topMeta.content_text || "",
            videoUri: leafVideoUri || (topMeta.representativeMediaLocalPath ? `/api/local-file?path=${encodeURIComponent(topMeta.representativeMediaLocalPath)}` : (current.media_local_path || "")),
            posterUri: leafPosterUri || topMeta.thumbnail || current.thumbnail || "",
            media_kind: "video",
            truthStatus: "verified",
            hapaDevProtoCard: true,
            parentCardId: current.id,
            originalCardId: row.id,
            cardFace
          };
          sendJson(res, 200, cardObj);
          return;
        }
      } catch (e) {
        console.error("Error querying card from persistence.db:", e);
      }
    }

    if (gapsVideo) {
      const cardObj = {
        id: gapsVideo.id,
        title: gapsVideo.title || "Video Card",
        description: gapsVideo.narrativeSummary || gapsVideo.objectiveSummary || "Local video asset.",
        videoUri: gapsVideo.uri,
        posterUri: gapsVideo.thumbnailUri || "",
        media_kind: "video",
        truthStatus: gapsVideo.truthStatus || "verified",
        fallbackVideoCard: true
      };
      sendJson(res, 200, cardObj);
      return;
    }

    sendJson(res, 404, { error: "card_not_found", cardId });
    return;
  }

  if (pathname === "/api/tarot" && req.method === "GET") {
    sendJson(res, 200, await readTarotStore());
    return;
  }

  if (pathname === "/api/tarot" && req.method === "PUT") {
    const store = normalizeTarotStore(await readBody(req));
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.updated", { tarot: store });
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/tarot/dashboard" && req.method === "GET") {
    sendJson(res, 200, createTarotLibraryDashboard(await readTarotStore()));
    return;
  }

  if (pathname === "/api/tarot/draw-forge" && req.method === "POST") {
    const body = await readBody(req);
    const packet = await createTarotDrawForge(body, req);
    sendJson(res, 201, packet);
    return;
  }

  if (pathname === "/api/tarot/draw-forge/variation" && req.method === "POST") {
    const body = await readBody(req);
    const packet = await createTarotDrawForgeVariation(body, req);
    const statusCode = packet?.ok === false ? (packet.statusCode || 400) : 201;
    sendJson(res, statusCode, packet);
    return;
  }

  const tarotDrawForgeMatch = pathname.match(/^\/api\/tarot\/draw-forge\/([^/]+)$/);
  if (tarotDrawForgeMatch && req.method === "GET") {
    const packet = await readTarotDrawForge(tarotDrawForgeMatch[1]);
    if (!packet) {
      sendJson(res, 404, { ok: false, error: "draw_forge_run_not_found", id: tarotDrawForgeMatch[1] });
      return;
    }
    sendJson(res, 200, packet);
    return;
  }

  if (pathname === "/api/tarot/decks" && req.method === "POST") {
    const body = await readBody(req);
    const store = addTarotDeck(await readTarotStore(), body);
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.deck-created", { tarot: store });
    sendJson(res, 201, store);
    return;
  }

  const tarotDeckMatch = pathname.match(/^\/api\/tarot\/decks\/([^/]+)$/);
  if (tarotDeckMatch && req.method === "GET") {
    const deckId = decodeURIComponent(tarotDeckMatch[1]);
    const store = await readTarotStore();
    const deck = (store.decks || []).find((entry) => entry.id === deckId);
    if (!deck) sendJson(res, 404, { error: "tarot_deck_not_found", deckId });
    else sendJson(res, 200, deck);
    return;
  }
  if (tarotDeckMatch && req.method === "PUT") {
    const deckId = tarotDeckMatch[1];
    const store = updateTarotDeck(await readTarotStore(), deckId, await readBody(req));
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.deck-updated", { tarot: store });
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/tarot/sets" && req.method === "POST") {
    const body = await readBody(req);
    const store = addTarotSet(await readTarotStore(), body);
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.set-created", { tarot: store });
    sendJson(res, 201, store);
    return;
  }

  const tarotSetMatch = pathname.match(/^\/api\/tarot\/sets\/([^/]+)$/);
  if (tarotSetMatch && req.method === "GET") {
    const setId = decodeURIComponent(tarotSetMatch[1]);
    const store = await readTarotStore();
    const set = (store.sets || []).find((entry) => entry.id === setId);
    if (!set) sendJson(res, 404, { error: "tarot_set_not_found", setId });
    else sendJson(res, 200, set);
    return;
  }
  if (tarotSetMatch && req.method === "PUT") {
    const setId = tarotSetMatch[1];
    const store = updateTarotSet(await readTarotStore(), setId, await readBody(req));
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.set-updated", { tarot: store });
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/tarot/cards" && req.method === "POST") {
    const body = await readBody(req);
    const store = addTarotCard(await readTarotStore(), body);
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.card-created", { tarot: store, media: body.asset || null });
    sendJson(res, 201, store);
    return;
  }

  const tarotCardMatch = pathname.match(/^\/api\/tarot\/cards\/([^/]+)(?:\/([^/]+))?$/);
  if (tarotCardMatch) {
    const cardId = tarotCardMatch[1];
    const action = tarotCardMatch[2];

    if (!action && req.method === "PUT") {
      const store = updateTarotCard(await readTarotStore(), cardId, await readBody(req));
      await writeTarotStore(store);
      await appendSubscriberRegistration("tarot.card-updated", { tarot: store });
      sendJson(res, 200, store);
      return;
    }

    if (action === "media" && req.method === "POST") {
      const body = await readBody(req);
      const currentStore = await readTarotStore();
      const card = (currentStore.cards || []).find((item) => item.id === cardId);
      const role = body.role || body.tarotMediaRole || null;
      const relationship = {
        ownerType: "tarot",
        ownerId: cardId,
        ownerName: card?.title || card?.name || cardId,
        role: role || ((body.asset || body).type === "video" ? "loop_video" : "primary_image")
      };
      const asset = withMediaAttachmentRelationship(body.asset || body, relationship, {
        source: "tarot.card-media-attached",
        tags: ["tarot-media", relationship.role]
      });
      const store = attachTarotCardMedia(currentStore, cardId, asset, role);
      await writeTarotStore(store);
      const updatedCard = (store.cards || []).find((item) => item.id === cardId);
      const attachedAsset = (updatedCard?.assets || []).find((item) => item.id === asset.id) || asset;
      await syncMediaAttachmentRecord(attachedAsset, relationship, {
        source: "tarot.card-media-attached",
        sourceKind: "tarot-media",
        tags: ["tarot-media", relationship.role]
      });
      await appendSubscriberRegistration("tarot.card-media-attached", { tarot: store, media: asset });
      sendJson(res, 200, store);
      return;
    }

    if (action === "avatars" && req.method === "POST") {
      const body = await readBody(req);
      const store = body.detach
        ? unlinkTarotCardAvatar(await readTarotStore(), cardId, body.avatarId)
        : linkTarotCardAvatar(await readTarotStore(), cardId, body.avatarId, body);
      await writeTarotStore(store);
      await appendSubscriberRegistration(body.detach ? "tarot.avatar-unlinked" : "tarot.avatar-linked", { tarot: store });
      sendJson(res, 200, store);
      return;
    }
  }

  if (pathname === "/api/tarot/attach" && req.method === "GET") {
    sendJson(res, 200, createTarotAttachPack(await readTarotStore(), {
      deckId: url.searchParams.get("deckId") || null,
      setId: url.searchParams.get("setId") || null,
      cardId: url.searchParams.get("cardId") || null,
      target: url.searchParams.get("target") || "agent"
    }));
    return;
  }

  if (pathname === "/api/subscribers/status" && req.method === "GET") {
    sendJson(res, 200, await readSubscriberStatus());
    return;
  }

  if (pathname === "/api/subscribers/events" && req.method === "GET") {
    const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit") || 50)));
    sendJson(res, 200, await readSubscriberEvents(limit));
    return;
  }

  if (pathname === "/api/avatar-teams" && req.method === "GET") {
    const store = await readStore({ includeProjections: url.searchParams.get("includeProjections") === "hell-week" });
    sendJson(res, 200, {
      schemaVersion: "hapa.avatar-teams.v1",
      teams: store.teams || [],
      updatedAt: store.updatedAt || null
    });
    return;
  }

  if (pathname === "/api/avatar-teams" && req.method === "PUT") {
    const body = await readBody(req);
    const store = await readStore();
    const teams = normalizeAvatarTeams(body.teams || body, store.avatars || [], { seedCore: false });
    const nextStore = {
      ...store,
      teams,
      updatedAt: new Date().toISOString()
    };
    await writeStore(nextStore);
    await appendSubscriberRegistration("avatar.teams-updated");
    sendJson(res, 200, {
      schemaVersion: "hapa.avatar-teams.v1",
      teams,
      updatedAt: nextStore.updatedAt
    });
    return;
  }

  if (pathname === "/api/hell-week/cards" && req.method === "GET") {
    const projection = loadHellWeekProjection({ force: url.searchParams.get("refresh") === "1" });
    if (!projection.ok) {
      sendJson(res, 503, projection);
      return;
    }
    const selected = filterHellWeekSync(projection, {
      cursor: url.searchParams.get("cursor") || "",
      runId: url.searchParams.get("runId") || ""
    });
    sendJson(res, 200, url.searchParams.get("envelope") === "1" ? selected : selected.cards);
    return;
  }

  if (pathname === "/api/hell-week/sync" && req.method === "GET") {
    const projection = loadHellWeekProjection({ force: url.searchParams.get("refresh") === "1" });
    if (!projection.ok) {
      sendJson(res, 503, projection);
      return;
    }
    sendJson(res, 200, filterHellWeekSync(projection, {
      cursor: url.searchParams.get("cursor") || "",
      runId: url.searchParams.get("runId") || ""
    }));
    return;
  }

  const hellWeekCardDetailMatch = pathname.match(/^\/api\/hell-week\/cards\/([^/]+)$/);
  if (hellWeekCardDetailMatch && req.method === "GET") {
    const projection = loadHellWeekProjection({ force: url.searchParams.get("refresh") === "1" });
    if (!projection.ok) {
      sendJson(res, 503, projection);
      return;
    }
    const cardId = decodeURIComponent(hellWeekCardDetailMatch[1]);
    const card = projection.cards.find((entry) => entry.id === cardId);
    if (!card) {
      sendJson(res, 404, { error: "hell_week_card_not_found", cardId });
      return;
    }
    sendJson(res, 200, await hydrateHellWeekCardDetail(card));
    return;
  }

  const hellWeekFeedbackMatch = pathname.match(/^\/api\/hell-week\/cards\/([^/]+)\/feedback$/);
  if (hellWeekFeedbackMatch && req.method === "POST") {
    const projection = loadHellWeekProjection();
    if (!projection.ok) {
      sendJson(res, 503, projection);
      return;
    }
    const card = projection.cards.find((candidate) => candidate.id === decodeURIComponent(hellWeekFeedbackMatch[1]));
    if (!card) {
      sendJson(res, 404, { ok: false, error: "hell_week_card_not_found" });
      return;
    }
    try {
      sendJson(res, 201, await appendHellWeekFeedback(card, await readBody(req)));
    } catch (error) {
      sendJson(res, error?.statusCode || 400, {
        ok: false,
        error: "hell_week_feedback_invalid",
        message: error?.message || "Hell Week feedback was not accepted."
      });
    }
    return;
  }

  if (pathname === "/api/avatars" && req.method === "GET") {
    const includeProjections = url.searchParams.get("mode") === "projected" || url.searchParams.get("includeProjections") === "hell-week";
    const store = await readStore({
      includeProjections,
      forceProjection: url.searchParams.get("refresh") === "1"
    });
    if (url.searchParams.get("mode") === "index") {
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit") || OVERWIND_SHELL_AVATAR_LIMIT)));
      const avatars = store.avatars || [];
      sendJson(res, 200, {
        schemaVersion: "hapa.avatar-index.v1",
        generatedAt: new Date().toISOString(),
        source: STORE_PATH,
        total: avatars.length,
        offset,
        limit,
        hasMore: offset + limit < avatars.length,
        avatars: avatars.slice(offset, offset + limit).map(compactAvatarForOverwindShell).filter(Boolean),
        teams: compactAvatarTeamsForOverwindShell(store.teams || [])
      });
      return;
    }
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/avatars" && req.method === "PUT") {
    const body = await readBody(req);
    const currentStore = await readStore();
    const avatars = (Array.isArray(body.avatars) ? body.avatars : currentStore.avatars)
      .map((avatar) => normalizeAvatarCard(avatar));
    const store = {
      ...currentStore,
      ...body,
      schemaVersion: body.schemaVersion || currentStore.schemaVersion || "hapa.avatar-store.v1",
      avatars,
      teams: normalizeAvatarTeams(body.teams || currentStore.teams || [], avatars),
      updatedAt: new Date().toISOString()
    };
    await writeStore(store);
    await appendSubscriberRegistration("avatar.store-updated");
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/mind" && req.method === "GET") {
    const store = await readStore({ includeProjections: url.searchParams.get("includeProjections") === "hell-week" });
    sendJson(res, 200, {
      schemaVersion: "hapa.avatar-mind-library.v1",
      avatarCount: store.avatars.length,
      avatars: store.avatars.map((avatar) => createAvatarMindSummary(avatar, store.avatars)),
      generatedAt: new Date().toISOString()
    });
    return;
  }

  if (pathname === "/api/avatars" && req.method === "POST") {
    const body = await readBody(req);
    const store = await readStore();
    const avatar = createAvatarScaffold(body);
    if (store.avatars.some((item) => item.id === avatar.id)) {
      sendJson(res, 409, { error: "avatar_exists", id: avatar.id });
      return;
    }
    store.avatars.push(avatar);
    await writeStore(store);
    await appendSubscriberRegistration("avatar.created", { avatar });
    sendJson(res, 201, avatar);
    return;
  }

  const avatarMatch = pathname.match(/^\/api\/avatars\/([^/]+)(?:\/([^/]+))?$/);
  if (avatarMatch) {
    const avatarId = avatarMatch[1];
    const action = avatarMatch[2];
    const store = await readStore();
    let avatarIndex = store.avatars.findIndex((item) => item.id === avatarId);
    let avatar = store.avatars[avatarIndex];

    if (!avatar && req.method === "GET") {
      const projection = loadHellWeekProjection();
      const projectedAvatar = projection.ok ? projection.cards.find((candidate) => candidate.id === avatarId) : null;
      if (projectedAvatar) {
        store.avatars.push(projectedAvatar);
        avatarIndex = store.avatars.length - 1;
        avatar = projectedAvatar;
      }
    }

    if (!avatar) {
      if (req.method !== "GET") {
        const projection = loadHellWeekProjection();
        if (projection.ok && projection.cards.some((candidate) => candidate.id === avatarId)) {
          sendJson(res, 409, {
            ok: false,
            error: "external_projection_read_only",
            id: avatarId,
            sourceSystem: "hapa-dev-proto",
            feedbackEndpoint: `/api/hell-week/cards/${encodeURIComponent(avatarId)}/feedback`
          });
          return;
        }
      }
      sendJson(res, 404, { error: "avatar_not_found", id: avatarId });
      return;
    }

    if (avatar.isExternalProjection && req.method !== "GET") {
      sendJson(res, 409, {
        ok: false,
        error: "external_projection_read_only",
        id: avatar.id,
        sourceSystem: avatar.projection?.sourceSystem || "hapa-dev-proto",
        feedbackEndpoint: `/api/hell-week/cards/${encodeURIComponent(avatar.id)}/feedback`
      });
      return;
    }

    if (!action && req.method === "GET") {
      sendJson(res, 200, avatar);
      return;
    }

    if (!action && req.method === "PUT") {
      const nextAvatar = await readBody(req);
      if (isStaleAvatarUpdate(avatar, nextAvatar)) {
        sendJson(res, 409, {
          error: "stale_avatar_update",
          id: avatar.id,
          currentUpdatedAt: avatar.updatedAt || null,
          incomingUpdatedAt: nextAvatar?.updatedAt || null
        });
        return;
      }
      store.avatars[avatarIndex] = {
        ...nextAvatar,
        id: avatar.id,
        updatedAt: new Date().toISOString()
      };
      await writeStore(store);
      await appendSubscriberRegistration("avatar.updated", { avatar: store.avatars[avatarIndex] });
      sendJson(res, 200, store.avatars[avatarIndex]);
      return;
    }

    if (action === "audit" && req.method === "GET") {
      sendJson(res, 200, auditAvatar(avatar));
      return;
    }

    if (action === "attach" && req.method === "GET") {
      sendJson(res, 200, createAttachPack(avatar, url.searchParams.get("target") || "agent"));
      return;
    }

    if (action === "mind" && req.method === "GET") {
      sendJson(res, 200, createAvatarMindAttachPack(avatar, store.avatars));
      return;
    }

    if (action === "mind" && req.method === "PUT") {
      const body = await readBody(req);
      const nextAvatar = upsertAvatarMind(avatar, body.mind || body);
      store.avatars[avatarIndex] = nextAvatar;
      await writeStore(store);
      await appendSubscriberRegistration("avatar.mind-updated", { avatar: nextAvatar });
      sendJson(res, 200, {
        avatar: nextAvatar,
        pack: createAvatarMindAttachPack(nextAvatar, store.avatars)
      });
      return;
    }

    if (action === "heal-plan" && req.method === "GET") {
      sendJson(res, 200, {
        avatarId,
        tasks: createHealingPlan(avatar)
      });
      return;
    }

    if (action === "heal-queue" && req.method === "GET") {
      sendJson(res, 200, createHealingQueue(avatar));
      return;
    }

    if (action === "heal-prompt" && req.method === "GET") {
      const selector = url.searchParams.get("jobId") || url.searchParams.get("slotId") || url.searchParams.get("requirementId") || "";
      const packet = createHealingPromptPacket(avatar, selector, {
        extraInstruction: url.searchParams.get("instruction") || ""
      });
      if (!packet) {
        sendJson(res, 404, { error: "healing_task_not_found", avatarId, selector });
        return;
      }
      sendJson(res, 200, packet);
      return;
    }

    if (action === "kanban" && req.method === "GET") {
      sendJson(res, 200, {
        avatarId,
        lanes: createKanbanFromAudit(avatar)
      });
      return;
    }

    if (action === "backgroundless" && req.method === "GET") {
      sendJson(res, 200, videoBackgroundlessSummary(avatar));
      return;
    }

    if (action === "backgroundless" && req.method === "POST") {
      const body = await readBody(req);
      const videoAssetId = body.videoAssetId || body.assetId || body.video_asset_id || body.id;
      if (!videoAssetId) {
        sendJson(res, 400, { error: "missing_video_asset_id", avatarId });
        return;
      }
      const currentVideo = (avatar.assets || []).find((asset) => asset.id === videoAssetId || asset.assetId === videoAssetId);
      if (!currentVideo || currentVideo.type !== "video") {
        sendJson(res, 404, { error: "video_asset_not_found", avatarId, videoAssetId });
        return;
      }
      const nextAvatar = registerBackgroundlessVideoVariant(avatar, videoAssetId, body.variant || body.backgroundless || body);
      const updatedAsset = (nextAvatar.assets || []).find((asset) => asset.id === videoAssetId) || null;
      store.avatars[avatarIndex] = nextAvatar;
      await writeStore(store);
      await appendSubscriberRegistration("avatar.backgroundless-video-updated", { avatar: nextAvatar, media: updatedAsset });
      sendJson(res, 200, {
        avatar: nextAvatar,
        media: updatedAsset,
        playback: updatedAsset ? backgroundlessPlaybackForAsset(updatedAsset) : null,
        summary: videoBackgroundlessSummary(nextAvatar)
      });
      return;
    }

    if (action === "assets" && req.method === "POST") {
      const body = await readBody(req);
      const assetInput = body.asset || body;
      const relationship = {
        ownerType: "avatar",
        ownerId: avatar.id,
        ownerName: avatar.primaryName || avatar.name || avatar.id,
        role: body.slotId || assetInput.requirementId || "avatar-media"
      };
      const syncedAsset = withMediaAttachmentRelationship(assetInput, relationship, {
        source: "avatar.asset-attached",
        tags: ["avatar-media", assetInput.type === "video" ? "avatar-video" : ""]
      });
      const nextAvatar = assignAssetToSlot(avatar, syncedAsset, body.slotId || null);
      store.avatars[avatarIndex] = nextAvatar;
      await writeStore(store);
      const attachedAsset = findAttachedAsset(nextAvatar.assets, syncedAsset);
      await syncMediaAttachmentRecord(attachedAsset || syncedAsset, {
        ...relationship,
        role: attachedAsset?.requirementId || relationship.role
      }, {
        source: "avatar.asset-attached",
        sourceKind: "avatar-media",
        tags: ["avatar-media", attachedAsset?.type === "video" ? "avatar-video" : ""]
      });
      await appendSubscriberRegistration("avatar.asset-attached", { avatar: nextAvatar, media: attachedAsset || syncedAsset });
      sendJson(res, 200, nextAvatar);
      return;
    }
  }

  const sceneMediaMatch = pathname.match(/^\/api\/world\/scenes\/([^/]+)\/media$/);
  if (sceneMediaMatch && req.method === "POST") {
    const sceneId = sceneMediaMatch[1];
    const body = await readBody(req);
    const currentGraph = await readSceneStore();
    const currentScene = (currentGraph.scenes || []).find((scene) => scene.id === sceneId);
    const assetInput = body.asset || body;
    const relationship = {
      ownerType: "scene",
      ownerId: sceneId,
      ownerName: currentScene?.title || currentScene?.name || sceneId,
      role: body.slotId || assetInput.requirementId || "scene-media"
    };
    const syncedAsset = withMediaAttachmentRelationship(assetInput, relationship, {
      source: "world.scene-media-attached",
      tags: ["scene-media"]
    });
    const graph = attachSceneMedia(currentGraph, sceneId, syncedAsset, body.slotId || null);
    await writeSceneStore(graph);
    const scene = (graph.scenes || []).find((item) => item.id === sceneId);
    const attachedAsset = findAttachedAsset(scene?.assets || [], syncedAsset);
    await syncMediaAttachmentRecord(attachedAsset || syncedAsset, {
      ...relationship,
      role: attachedAsset?.requirementId || relationship.role
    }, {
      source: "world.scene-media-attached",
      sourceKind: "scene-media",
      tags: ["scene-media"]
    });
    await appendSubscriberRegistration("world.scene-media-attached", { sceneGraph: graph, media: attachedAsset || syncedAsset });
    sendJson(res, 200, graph);
    return;
  }

  if (pathname === "/api/local-file" && req.method === "GET") {
    const filePath = url.searchParams.get("path") || "";
    await serveLocalFile(filePath, req, res);
    return;
  }

  if (pathname.startsWith("/media/")) {
    const served = await serveMedia(pathname, req, res);
    if (served) return;
  }

  if (pathname.startsWith("/CardAppPrototype")) {
    const cardAppDist = "/Users/calderwong/Desktop/CardAppPrototype/dist";
    const relativePath = pathname.replace(/^\/CardAppPrototype/, "") || "/";
    const served = await serveStatic(cardAppDist, relativePath, req, res);
    if (served) return;
  }

  if (pathname.startsWith("/hapa-live-app")) {
    const liveAppDir = "/Users/calderwong/Desktop/hapa-live-app";
    const relativePath = pathname.replace(/^\/hapa-live-app/, "") || "/";
    const served = await serveStatic(liveAppDir, relativePath, req, res);
    if (served) return;
  }

  if (pathname.startsWith("/hapa-subscriber-app")) {
    const subAppDir = "/Users/calderwong/Desktop/hapa-subscriber-app";
    const relativePath = pathname.replace(/^\/hapa-subscriber-app/, "") || "/";
    const served = await serveStatic(subAppDir, relativePath, req, res);
    if (served) return;
  }

  // API misses must stay API-shaped. Falling through to the SPA would turn a
  // missing shader/runtime asset into a 200 HTML document that looks fetchable
  // until the renderer tries to compile it.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "not_found", path: pathname });
    return;
  }

  if (staticDir) {
    const served = await serveStatic(staticDir, pathname, req, res);
    if (served) return;
  }

  sendJson(res, 404, { error: "not_found", path: pathname });
}
const HELL_WEEK_SCHEMA_VERSION = "hapa.hell-week-handoff.v1";
const HAPA_CARD_ENVELOPE_VERSION = "hapa.card-envelope.v1";
const hellWeekProjectionCache = {
  signature: null,
  result: null,
  lastSuccess: null,
  lastError: null,
  queryCount: 0,
  cacheHits: 0
};
const hellWeekMediaDirectoryIndex = new Map();
const hellWeekMediaPathTelemetry = {
  lookups: 0,
  directoryScans: 0,
  directoryCacheHits: 0
};

function loadHellWeekProjection({ force = false } = {}) {
  const generatedAt = new Date().toISOString();
  try {
    const signature = hellWeekDbSignature();
    if (!force && hellWeekProjectionCache.signature === signature && hellWeekProjectionCache.result?.ok) {
      hellWeekProjectionCache.cacheHits += 1;
      return hellWeekProjectionCache.result;
    }
    hellWeekMediaDirectoryIndex.clear();

    const query = `SELECT json_object(
      'id', id,
      'core_name', core_name,
      'parent_id', parent_id,
      'name', name,
      'media_local_path', media_local_path,
      'thumbnail', thumbnail,
      'created_at', created_at,
      'updated_at', updated_at,
      'lore', lore,
      'content_text', content_text,
      'metadata_json', metadata_json,
      'media_kind', media_kind,
      'hellweek_run_id', hellweek_run_id,
      'is_deleted', is_deleted
    ) FROM cards
    WHERE hellweek_run_id IS NOT NULL OR (parent_id IS NOT NULL AND parent_id != '')`;
    const stdout = execFileSync(SQLITE_BIN, [HAPA_DEV_PROTO_DB_PATH, query], {
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024
    });
    hellWeekProjectionCache.queryCount += 1;

    const rows = stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const liveRows = rows.filter((row) => !Number(row.is_deleted || 0));
    const deletedRows = rows.filter((row) => Number(row.is_deleted || 0));
    const parents = [];
    const childrenByParent = new Map();

    for (const row of liveRows) {
      if (row.parent_id && row.parent_id !== "1" && row.parent_id !== "0") {
        const children = childrenByParent.get(row.parent_id) || [];
        children.push(row);
        childrenByParent.set(row.parent_id, children);
      } else {
        parents.push(row);
      }
    }

    const cards = parents.map((row) => hellWeekAvatarFromRow(row, childrenByParent, generatedAt));
    const tombstones = deletedRows.map((row) => ({
      schemaVersion: "hapa.card-tombstone.v1",
      cardId: row.id,
      sourceSystem: "hapa-dev-proto",
      sourceRunId: row.hellweek_run_id || null,
      deletedAt: row.updated_at || row.created_at || generatedAt
    }));
    const updatedValues = [
      ...cards.map((card) => card.updatedAt),
      ...tombstones.map((tombstone) => tombstone.deletedAt)
    ].filter(Boolean).sort();
    const result = {
      ok: true,
      schemaVersion: HELL_WEEK_SCHEMA_VERSION,
      generatedAt,
      cards,
      tombstones,
      counts: {
        rows: rows.length,
        liveRows: liveRows.length,
        cards: cards.length,
        tombstones: tombstones.length
      },
      cursor: {
        updatedAt: updatedValues.at(-1) || null,
        token: updatedValues.at(-1) || ""
      },
      source: {
        system: "hapa-dev-proto",
        owner: "hapa-dev-proto",
        adapter: "sqlite-readonly",
        path: HAPA_DEV_PROTO_DB_PATH,
        signature
      }
    };
    hellWeekProjectionCache.signature = signature;
    hellWeekProjectionCache.result = result;
    hellWeekProjectionCache.lastSuccess = {
      at: generatedAt,
      count: cards.length,
      cursor: result.cursor.token
    };
    hellWeekProjectionCache.lastError = null;
    return result;
  } catch (error) {
    const failure = {
      ok: false,
      schemaVersion: HELL_WEEK_SCHEMA_VERSION,
      generatedAt,
      cards: [],
      tombstones: [],
      counts: {
        cards: 0,
        lastKnownCards: hellWeekProjectionCache.lastSuccess?.count || 0
      },
      source: {
        system: "hapa-dev-proto",
        owner: "hapa-dev-proto",
        adapter: "sqlite-readonly",
        path: HAPA_DEV_PROTO_DB_PATH
      },
      error: {
        code: error?.code || "HELL_WEEK_SOURCE_UNAVAILABLE",
        dependency: "hapa-dev-proto-sqlite",
        message: error?.message || String(error),
        retryable: true
      },
      lastSuccess: hellWeekProjectionCache.lastSuccess
    };
    hellWeekProjectionCache.lastError = failure.error;
    console.error("Error loading Hell Week cards:", error);
    return failure;
  }
}

function hellWeekDbSignature() {
  const dbInfo = fs.statSync(HAPA_DEV_PROTO_DB_PATH);
  let walPart = "wal:missing";
  try {
    const walInfo = fs.statSync(`${HAPA_DEV_PROTO_DB_PATH}-wal`);
    walPart = `wal:${walInfo.size}:${walInfo.mtimeMs}`;
  } catch {
    // A missing WAL is a valid steady state.
  }
  return `db:${dbInfo.size}:${dbInfo.mtimeMs}|${walPart}`;
}

function hellWeekAvatarFromRow(row, childrenByParent, generatedAt) {
  const id = row.id;
  const name = row.name || "Unnamed Hell Week Card";
  const meta = parseJsonObject(row.metadata_json);
  const assets = [];
  const lineageRows = [row];
  const visited = new Set([id]);

  addHellWeekAsset(assets, row, meta, id, "parent");

  const collectFromNode = (nodeId) => {
    for (const child of childrenByParent.get(nodeId) || []) {
      if (!child?.id || visited.has(child.id)) continue;
      visited.add(child.id);
      lineageRows.push(child);
      addHellWeekAsset(assets, child, parseJsonObject(child.metadata_json), id, "child");
      collectFromNode(child.id);
    }
  };
  collectFromNode(id);

  const slots = [];
  const imageAsset = assets.find((asset) => asset.type === "image");
  const videoAsset = assets.find((asset) => asset.type === "video");
  if (imageAsset) {
    slots.push({
      id: "avatar_concept_photo-1",
      requirementId: "avatar_concept_photo",
      label: "Concept Photo 1",
      required: true,
      assetId: imageAsset.id
    });
  }
  if (videoAsset) {
    slots.push({
      id: "avatar_concept_video-1",
      requirementId: "avatar_concept_video",
      label: "Concept Video 1",
      required: true,
      assetId: videoAsset.id
    });
  }

  const loreText = row.content_text || row.lore || meta.lore || "";
  const skills = Array.isArray(meta.skills) ? meta.skills : [];
  const memberOfSets = Array.isArray(meta.memberOfSets) ? meta.memberOfSets : [];
  const bulletSkills = skills.map((skill) => `• ${skill.name}: ${skill.description}`).join("\n");
  const bulletSets = memberOfSets.map((set) => `• Set: ${set.setName} (${set.addedBy})`).join("\n");
  const sourceRunIds = [...new Set(lineageRows.map((item) => item.hellweek_run_id).filter(Boolean))];
  const updatedAt = lineageRows
    .map((item) => item.updated_at || item.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) || generatedAt;
  const createdAt = row.created_at || updatedAt;
  const sourceCardIds = lineageRows.map((item) => item.id).filter(Boolean);

  return {
    id,
    isHellWeek: true,
    isExternalProjection: true,
    projection: {
      readOnly: true,
      sourceSystem: "hapa-dev-proto",
      projectedBy: "hapa-avatar-builder",
      projectedAt: generatedAt
    },
    handoff: {
      schemaVersion: HAPA_CARD_ENVELOPE_VERSION,
      cardId: id,
      source: {
        system: "hapa-dev-proto",
        store: "sqlite",
        path: HAPA_DEV_PROTO_DB_PATH,
        coreName: row.core_name || null,
        runIds: sourceRunIds
      },
      lineage: {
        parentCardId: row.parent_id || null,
        sourceCardIds
      },
      truthStatus: "verified_source_projection",
      projection: {
        consumer: "hapa-avatar-builder",
        readOnly: true,
        projectedAt: generatedAt
      }
    },
    primaryName: name,
    names: [{ name }],
    slots,
    assets,
    three_paragraph_background_narrative: {
      origin: loreText,
      concept: bulletSkills || "No skills defined.",
      manifesto: bulletSets || "No set associations."
    },
    mind: {
      avatarId: id,
      summary: row.lore || meta.lore || "A forged Hell Week card.",
      characterSheet: `${loreText}\n\n### Skills & Abilities\n${bulletSkills}\n\n### Set Memberships\n${bulletSets}`,
      dossierNotes: [],
      wikiProfiles: [],
      avatarDeck: [],
      skills: skills.map((skill) => ({
        id: slugify(skill.name),
        name: skill.name,
        description: skill.description,
        kind: skill.type || "Passive"
      }))
    },
    updatedAt,
    createdAt
  };
}

async function hydrateHellWeekCardDetail(card) {
  const coreName = card?.handoff?.source?.coreName;
  if (!coreName) return card;

  const sourceRoot = path.resolve(HAPA_DEV_PROTO_HYPERCORE_DIR);
  const corePath = path.resolve(sourceRoot, coreName);
  if (!corePath.startsWith(`${sourceRoot}${path.sep}`) || !fs.existsSync(corePath)) return card;

  const core = new Hypercore(corePath);
  try {
    await core.ready();
    for (let index = core.length - 1; index >= 0; index -= 1) {
      const block = await core.get(index);
      if (!block) continue;
      let record;
      try {
        record = JSON.parse(block.toString());
      } catch {
        continue;
      }
      const sourceCard = record?.card && typeof record.card === "object" ? record.card : record;
      const fullNarrative = [
        sourceCard?.cardData?.lore,
        sourceCard?.card_data?.lore,
        sourceCard?.three_paragraph_background_narrative?.origin,
        sourceCard?.lore
      ].find((value) => typeof value === "string" && value.trim());
      if (!fullNarrative) continue;
      return {
        ...card,
        three_paragraph_background_narrative: {
          ...card.three_paragraph_background_narrative,
          origin: fullNarrative
        },
        mind: {
          ...card.mind,
          summary: fullNarrative
        },
        handoff: {
          ...card.handoff,
          source: {
            ...card.handoff?.source,
            narrativeHydratedFrom: "hypercore"
          }
        }
      };
    }
    return card;
  } catch (error) {
    console.warn(`Hell Week detail hydration failed for ${card.id}: ${error instanceof Error ? error.message : String(error)}`);
    return card;
  } finally {
    await core.close().catch(() => {});
  }
}

function addHellWeekAsset(assets, row, meta, avatarId, role) {
  const primaryPath = cleanHellWeekPath(row.media_local_path || row.thumbnail || meta.mediaLocalPath || meta.representativeMediaLocalPath || "");
  const generatedVideoPath = cleanHellWeekPath(meta.mediaPrompts?.generated_video_local || "");
  for (const [candidatePath, forcedType] of [[primaryPath, null], [generatedVideoPath, "video"]]) {
    if (!candidatePath || !hellWeekMediaPathExists(candidatePath) || assets.some((asset) => asset.path === candidatePath)) continue;
    const isVideo = forcedType === "video" || row.media_kind === "video" || /\.(mp4|m4v|mov|webm)$/i.test(candidatePath);
    assets.push({
      id: `${row.id}-${role}-${isVideo ? "video" : "image"}`,
      avatarId,
      sourceCardId: row.id,
      name: path.basename(candidatePath),
      path: candidatePath,
      uri: `/api/local-file?path=${encodeURIComponent(candidatePath)}`,
      relativePath: candidatePath,
      type: isVideo ? "video" : "image",
      mimeType: isVideo ? "video/mp4" : "image/png",
      tags: isVideo ? ["avatar_concept_video", "video_loop"] : ["avatar_concept_photo", "concept", "front"],
      metadata: {
        sourceSystem: "hapa-dev-proto",
        sourceRunId: row.hellweek_run_id || null
      }
    });
  }
}

function hellWeekMediaPathExists(candidatePath) {
  hellWeekMediaPathTelemetry.lookups += 1;
  const directory = path.dirname(candidatePath);
  let names = hellWeekMediaDirectoryIndex.get(directory);
  if (names === undefined) {
    hellWeekMediaPathTelemetry.directoryScans += 1;
    try {
      names = new Set(fs.readdirSync(directory));
    } catch {
      names = null;
    }
    hellWeekMediaDirectoryIndex.set(directory, names);
  } else {
    hellWeekMediaPathTelemetry.directoryCacheHits += 1;
  }
  return names?.has(path.basename(candidatePath)) === true;
}

function cleanHellWeekPath(value) {
  if (!value) return "";
  let cleaned = String(value).trim().replace(/^file:\/\/\/?/, "");
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep the source path when it is not URI-encoded.
  }
  return cleaned.replace(/\\/g, "/");
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hellWeekHandoffTelemetry() {
  return {
    status: hellWeekProjectionCache.lastError ? "degraded" : hellWeekProjectionCache.lastSuccess ? "healthy" : "unknown",
    sourceOwner: "hapa-dev-proto",
    adapter: "sqlite-readonly",
    sourcePath: HAPA_DEV_PROTO_DB_PATH,
    lastSuccess: hellWeekProjectionCache.lastSuccess,
    lastError: hellWeekProjectionCache.lastError,
    queryCount: hellWeekProjectionCache.queryCount,
    cacheHits: hellWeekProjectionCache.cacheHits,
    mediaPathIndex: {
      lookups: hellWeekMediaPathTelemetry.lookups,
      directoryScans: hellWeekMediaPathTelemetry.directoryScans,
      directoryCacheHits: hellWeekMediaPathTelemetry.directoryCacheHits,
      indexedDirectories: hellWeekMediaDirectoryIndex.size
    }
  };
}

function filterHellWeekSync(result, { cursor = "", runId = "" } = {}) {
  const cursorTime = Date.parse(cursor || "");
  const hasCursor = Number.isFinite(cursorTime);
  const cards = result.cards.filter((card) => {
    if (runId && !(card.handoff?.source?.runIds || []).includes(runId)) return false;
    return !hasCursor || Date.parse(card.updatedAt || "") > cursorTime;
  });
  const tombstones = result.tombstones.filter((tombstone) => {
    if (runId && tombstone.sourceRunId !== runId) return false;
    return !hasCursor || Date.parse(tombstone.deletedAt || "") > cursorTime;
  });
  return {
    ...result,
    cards,
    tombstones,
    counts: {
      ...result.counts,
      selectedCards: cards.length,
      selectedTombstones: tombstones.length
    },
    incremental: {
      cursor: cursor || null,
      runId: runId || null,
      fullRebuild: !cursor && !runId
    }
  };
}

async function appendHellWeekFeedback(card, body = {}) {
  const note = String(body.note || body.message || "").replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!note) {
    const error = new Error("Hell Week feedback requires a non-empty note.");
    error.statusCode = 400;
    throw error;
  }
  const createdAt = new Date().toISOString();
  const event = {
    schemaVersion: "hapa.card-feedback.v1",
    id: `hell-week-feedback-${Date.now()}-${randomBytes(3).toString("hex")}`,
    action: "card.feedback-proposed",
    sourceOwner: "hapa-dev-proto",
    sourceCardId: card.id,
    sourceRunIds: card.handoff?.source?.runIds || [],
    consumer: "hapa-avatar-builder",
    note,
    tags: [...new Set((Array.isArray(body.tags) ? body.tags : []).map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 24),
    mediaRefs: (Array.isArray(body.mediaRefs) ? body.mediaRefs : [])
      .map((ref) => ({
        id: String(ref?.id || "").slice(0, 240),
        uri: String(ref?.uri || "").slice(0, 2000),
        role: String(ref?.role || "feedback-media").slice(0, 120)
      }))
      .filter((ref) => ref.id || ref.uri)
      .slice(0, 24),
    truthStatus: "proposed_feedback_requires_source_owner_review",
    createdAt
  };
  await mkdir(SUBSCRIBER_DIR, { recursive: true });
  const outboxPath = path.join(SUBSCRIBER_DIR, "hapa-dev-proto.ndjson");
  await appendFile(outboxPath, `${JSON.stringify(event)}\n`, "utf8");
  return {
    ok: true,
    event,
    outbox: {
      subscriber: "hapa-dev-proto",
      path: outboxPath,
      appendOnly: true
    }
  };
}

async function readStore({ includeProjections = false, forceProjection = false, signal = null } = {}) {
  throwIfSongCardPlanStopped(signal, "before-avatar-store-read");
  const canonicalStore = await readNormalizedJson(STORE_PATH, "avatar-store", (store) => ({
    ...store,
    avatars: (store.avatars || []).map((avatar) => normalizeAvatarCard(avatar)),
    teams: normalizeAvatarTeams(store.teams, store.avatars || [])
  }), { signal });
  throwIfSongCardPlanStopped(signal, "after-avatar-store-read");
  if (!includeProjections) return canonicalStore;

  const projection = loadHellWeekProjection({ force: forceProjection });
  const canonicalIds = new Set((canonicalStore.avatars || []).map((avatar) => avatar.id));
  const projectedAvatars = projection.ok
    ? projection.cards.filter((avatar) => !canonicalIds.has(avatar.id))
    : [];
  const teams = [...(canonicalStore.teams || [])];
  if (projectedAvatars.length) {
    teams.push({
      schemaVersion: "hapa.avatar-teams.v1",
      id: "hell-week-cards-team",
      title: "Hell Week Cards",
      description: "Read-only cards projected from hapa-dev-proto",
      accent: "pink",
      status: "active",
      virtual: true,
      members: projectedAvatars.map((avatar) => ({
        avatarId: avatar.id,
        role: "Projected Card",
        notes: avatar.mind?.summary || ""
      })),
      createdAt: projection.generatedAt,
      updatedAt: projection.generatedAt
    });
  }
  return {
    ...canonicalStore,
    avatars: [...(canonicalStore.avatars || []), ...projectedAvatars],
    teams,
    externalProjections: {
      hellWeek: {
        ok: projection.ok,
        schemaVersion: projection.schemaVersion,
        count: projectedAvatars.length,
        generatedAt: projection.generatedAt,
        source: projection.source,
        cursor: projection.cursor || null,
        error: projection.error || null
      }
    }
  };
}

async function writeStore(store) {
  const canonicalAvatars = (store.avatars || [])
    .filter((avatar) => !avatar?.isExternalProjection && !avatar?.isHellWeek && !avatar?.projection?.readOnly)
    .map((avatar) => normalizeAvatarCard(avatar));
  const canonicalIds = new Set(canonicalAvatars.map((avatar) => avatar.id));
  const canonicalTeams = normalizeAvatarTeams(
    (store.teams || [])
      .filter((team) => team?.id !== "hell-week-cards-team" && !team?.virtual)
      .map((team) => ({
        ...team,
        members: (team.members || []).filter((member) => canonicalIds.has(member.avatarId))
      })),
    canonicalAvatars
  );
  const canonicalStore = {
    ...store,
    avatars: canonicalAvatars,
    teams: canonicalTeams,
    updatedAt: new Date().toISOString()
  };
  delete canonicalStore.externalProjections;
  const previousStore = await readJson(STORE_PATH).catch(() => ({ avatars: [] }));
  await avatarOverwindOrigin.commitStoreMutation("avatar", previousStore, canonicalStore, () =>
    writeFile(STORE_PATH, `${JSON.stringify(canonicalStore, null, 2)}\n`, "utf8")
  );
  invalidateJsonCache(STORE_PATH);
  return canonicalStore;
}

function isStaleAvatarUpdate(currentAvatar, incomingAvatar) {
  const currentTime = Date.parse(currentAvatar?.updatedAt || "");
  const incomingTime = Date.parse(incomingAvatar?.updatedAt || "");
  if (!Number.isFinite(currentTime) || !Number.isFinite(incomingTime)) return false;
  return incomingTime < currentTime;
}

async function readSceneStore({ signal = null } = {}) {
  try {
    return await readNormalizedJson(SCENE_STORE_PATH, "scene-store", normalizeSceneGraph, { signal });
  } catch (error) {
    if (signal?.aborted) throwIfSongCardPlanStopped(signal, "scene-store-read");
    const graph = createSceneGraphScaffold();
    await writeSceneStore(graph);
    return graph;
  }
}

async function writeSceneStore(graph) {
  await mkdir(path.dirname(SCENE_STORE_PATH), { recursive: true });
  await writeFile(SCENE_STORE_PATH, `${JSON.stringify(normalizeSceneGraph(graph), null, 2)}\n`, "utf8");
  invalidateJsonCache(SCENE_STORE_PATH);
}

async function readTarotStore() {
  try {
    return await readNormalizedJson(TAROT_STORE_PATH, "tarot-store", normalizeTarotStore);
  } catch {
    const store = createTarotStore();
    await writeTarotStore(store);
    return store;
  }
}

async function writeTarotStore(store) {
  await mkdir(path.dirname(TAROT_STORE_PATH), { recursive: true });
  await writeFile(TAROT_STORE_PATH, `${JSON.stringify(normalizeTarotStore(store), null, 2)}\n`, "utf8");
  invalidateJsonCache(TAROT_STORE_PATH);
}

async function createTarotDrawForge(body = {}, req = null) {
  const now = new Date().toISOString();
  const cleanTitle = cleanTitleText(body.title || body.cardTitle || body.intention || "New Hapa Tarot Card");
  const title = cleanTitle || `Hapa Tarot Card ${Date.now()}`;
  const runId = `hapa-tarot-draw-forge-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  const cardId = body.cardId || `tarot-draw-forge-${slugify(title) || Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const avatarLabel = cleanTitleText(body.avatarName || "Hapa");
  const intention = cleanLongText(body.intention || body.seedText || body.prompt || "");
  const lineage = normalizeTarotDrawForgeLineage(body.lineage || body.parent || null);
  const edition = normalizeTarotDrawForgeEdition(body.edition || body.variation || null);
  const card = tarotDrawForgeCard({
    id: cardId,
    runId,
    title,
    avatarName: avatarLabel,
    intention,
    createdAt: now,
    lineage,
    edition
  });
  let store = addTarotCard(await readTarotStore(), card);
  await writeTarotStore(store);

  const savedCard = (store.cards || []).find((item) => item.id === cardId) || card;
  let run = tarotDrawForgeRun({
    id: runId,
    card: savedCard,
    title,
    avatarName: avatarLabel,
    intention,
    prompt: body.prompt || "",
    createdAt: now,
    requestOrigin: requestOrigin(req),
    lineage,
    edition
  });

  const external = await stageExternalTarotDrawForgeRun(run, body);
  if (external?.run) run = mergeTarotDrawForgeRun(run, external.run);
  run.external = external || {
    ok: false,
    baseUrl: CARD_INPUT_STANDARD_BASE_URL,
    error: CARD_INPUT_STANDARD_ENABLED ? "Card Input Standard Run Forge unavailable." : "Card Input Standard forwarding disabled."
  };
  run.updatedAt = new Date().toISOString();
  await writeTarotDrawForgeRun(run);
  store = await updateTarotDrawForgeCardMedia(run, { forceStage: true });
  await appendSubscriberRegistration("tarot.draw-forge-staged", { tarot: store });
  return {
    ok: true,
    card: (store.cards || []).find((item) => item.id === cardId) || savedCard,
    store,
    run,
    external: run.external
  };
}

async function createTarotDrawForgeVariation(body = {}, req = null) {
  const parentId = String(body.parentCardId || body.cardId || body.parentId || "").trim();
  const parentRunId = String(body.parentRunId || "").trim();
  let store = await readTarotStore();
  const parentCard = (store.cards || []).find((item) =>
    item.id === parentId ||
    item.enrichment?.media?.drawForge?.runId === parentRunId
  );
  if (!parentCard) {
    return {
      ok: false,
      statusCode: 404,
      error: "parent_tarot_draw_forge_card_not_found",
      parentCardId: parentId,
      parentRunId
    };
  }
  const parentForge = parentCard.enrichment?.media?.drawForge || {};
  const now = new Date().toISOString();
  const editionNumber = nextTarotDrawForgeEditionNumber(store, parentCard);
  const parentTitle = cleanTitleText(parentCard.title || "Hapa Tarot Card");
  const title = cleanTitleText(body.title || `${parentTitle} / Edition ${editionNumber}`);
  const variationNote = cleanLongText(body.variationNote || body.note || "Create a new edition that preserves the card's core mechanic and lore, but changes the staging, lighting, environmental emphasis, and symbolic accents so the variation reads as a distinct collectible treatment.");
  const baseMeaning = cleanLongText(parentCard.meaning || parentCard.enrichment?.symbolicSummary || "");
  const intention = cleanLongText(body.intention || [
    baseMeaning,
    `Variation direction: ${variationNote}`,
    "Keep the same card identity and function while creating a visibly distinct edition for the same lineage."
  ].filter(Boolean).join(" "));
  const rootCardId = parentForge.lineage?.rootCardId || parentForge.parentCardId || parentCard.id;
  const rootRunId = parentForge.lineage?.rootRunId || parentForge.parentRunId || parentForge.runId || "";
  const lineage = {
    relation: "variation",
    parentCardId: parentCard.id,
    parentRunId: parentForge.runId || parentRunId || "",
    rootCardId,
    rootRunId,
    createdFrom: "hapa-avatar-builder:tarot-draw-forge-variation",
    createdAt: now
  };
  const edition = {
    number: editionNumber,
    label: `Edition ${editionNumber}`,
    variantOf: parentCard.id,
    note: variationNote
  };
  return createTarotDrawForge({
    ...body,
    cardId: body.cardId && body.cardId !== parentCard.id ? body.cardId : `tarot-draw-forge-${slugify(parentTitle) || "card"}-edition-${editionNumber}-${Math.random().toString(16).slice(2, 6)}`,
    title,
    intention,
    avatarName: body.avatarName || parentForge.avatarName || "Hapa",
    prompt: body.prompt || "",
    autoStart: body.autoStart !== false,
    lineage,
    edition
  }, req);
}

async function readTarotDrawForge(runId = "") {
  let run = await readTarotDrawForgeRun(runId);
  if (!run) return null;
  const external = await refreshExternalTarotDrawForgeRun(run);
  if (external?.run) {
    run = mergeTarotDrawForgeRun(run, external.run);
    run.external = {
      ...(run.external || {}),
      ...external,
      run: undefined,
      lastPolledAt: new Date().toISOString()
    };
  }
  run.updatedAt = new Date().toISOString();
  await writeTarotDrawForgeRun(run);
  const store = await updateTarotDrawForgeCardMedia(run);
  const card = (store.cards || []).find((item) => item.id === run.cardId || item.id === run.items?.[0]?.sourceId) || null;
  return {
    ok: true,
    card,
    store,
    run,
    external: run.external || null
  };
}

function tarotDrawForgeCard({ id, runId, title, avatarName, intention, createdAt, lineage = null, edition = null }) {
  const prompt = tarotDrawForgePrompt({ title, avatarName, intention });
  const lineagedKeywords = lineage?.parentCardId ? ["variation", "edition", `parent:${lineage.parentCardId}`] : [];
  return {
    id,
    title,
    cardType: "oracle_card",
    suit: "custom",
    arcana: "custom",
    orientation: "upright",
    status: "draft",
    keywords: unique([
      "tarot-draw-forge",
      "hapa-card",
      "image-loop-pipeline",
      ...lineagedKeywords,
      avatarName ? `avatar:${slugify(avatarName)}` : null
    ]),
    meaning: intention || "A freshly requested Hapa Tarot card entering the image and looping-video production path.",
    promptNotes: prompt,
    setIds: ["hapa-core-set"],
    enrichment: {
      schemaVersion: "hapa.tarot-enrichment.v1",
      status: "draft",
      method: "tarot-draw-forge",
      confidence: "medium",
      visualDescription: "A card object requested from inside the Tarot Draw 3D environment, staged for Flux2 hero image generation and LTX first/last-frame loop animation.",
      symbolicSummary: intention || "A Tarot Draw card being forged from user intent, avatar context, and Hapa card production defaults.",
      loreNotes: "The Tarot table is both interface and workshop: a requested card appears first as an under-construction object, then gains image and loop evidence as generation finishes.",
      tags: ["tarot-draw-forge", "flux2", "ltx-loop", "under-construction"],
      media: {
        drawForge: {
          schemaVersion: "hapa.tarot-draw-forge.v1",
          runId,
          stage: "requested",
          avatarName,
          requestedAt: createdAt,
          imageModel: "Flux2 Klein 9B local",
          loopModel: "LTX 2.3 MLX bf16",
          imageSettings: "768x768, 8 steps, q4, guidance 1.0",
          loopSettings: "512x512, 4.0s, 97 frames, 20+5, CFG 3.0, STG 1.0, low RAM off",
          loopPromptVersion: TAROT_DRAW_FORGE_LTX_PROMPT_VERSION,
          loopPromptGuide: TAROT_DRAW_FORGE_LTX_PROMPT_GUIDE,
          styleTag: "early-2000s brushed-pixel CRPG art fused with comic-book mythic futurism, teal-gold arcane technology, and Hapaverse celestial relic design.",
          rationale: "The avatar/environment request becomes a durable Tarot card first, then the paired media queue adds production evidence as image and video assets arrive.",
          lineage,
          edition,
          parentCardId: lineage?.parentCardId || "",
          parentRunId: lineage?.parentRunId || ""
        }
      },
      enrichedAt: createdAt
    },
    createdAt,
    updatedAt: createdAt
  };
}

function tarotDrawForgeRun({ id, card, title, avatarName, intention, prompt, createdAt, requestOrigin, lineage = null, edition = null }) {
  const imagePrompt = cleanLongText(prompt) || tarotDrawForgePrompt({ title, avatarName, intention });
  const loopPrompt = tarotDrawForgeLoopPrompt({ title, avatarName, intention, lineage, edition });
  return {
    schemaVersion: "hapa.card-media-pipeline-run.v1",
    id,
    source: "hapa-avatar-builder:tarot-draw-forge",
    state: "staged",
    cardId: card.id,
    lineage,
    edition,
    createdAt,
    updatedAt: createdAt,
    requestOrigin,
    defaults: {
      model: "flux2-klein-9b",
      quantize: 4,
      guidance: 1,
      size: "768x768",
      width: 768,
      height: 768,
      keeperSteps: 8,
      steps: 8,
      promptVersion: "hapa-card-flux2-v0.6-reverted-zimage-brief",
      promptAuthoringMode: "human-or-agent-authored-semantic-brief",
      promptAuthoringWarning: "Do not ship large deterministic heuristic prompt batches as if they were Leo/Thor or Codex-authored semantic prompts."
    },
    pairedMediaDefaults: {
      image: {
        model: "flux2-klein-9b",
        quantize: 4,
        guidance: 1,
        width: 768,
        height: 768,
        steps: 8
      },
      video: {
        model: TAROT_DRAW_FORGE_LTX_BF16_MODEL,
        width: 512,
        height: 512,
        seconds: 4,
        frames: 97,
        fps: 24,
        stage1_steps: 20,
        stage2_steps: 5,
        cfg: 3,
        stg: 1,
        low_ram: false
      },
      loopPrompt,
      loopPromptVersion: TAROT_DRAW_FORGE_LTX_PROMPT_VERSION,
      loopPromptGuide: TAROT_DRAW_FORGE_LTX_PROMPT_GUIDE
    },
    pipeline: {
      mode: "image-then-loop-paired",
      label: "Tarot Draw Card Forge",
      executionRule: "Create the card first, generate the Flux2 hero image, then use the same image as first and last frame for the LTX loop.",
      writebackTargets: ["tarot.assets.primary_image", "tarot.assets.loop_video", "tarot.enrichment.media.drawForge"]
    },
    items: [
      {
        order: 1,
        sourceId: card.id,
        cardId: card.id,
        parentCardId: lineage?.parentCardId || "",
        parentRunId: lineage?.parentRunId || "",
        edition,
        title,
        type: "Tarot Draw Forge Card",
        prompt: imagePrompt,
        status: "queued",
        reviewState: "queued",
        model: "flux2-klein-9b",
        quantize: 4,
        guidance: 1,
        width: 768,
        height: 768,
        steps: 8,
        mediaJobs: {
          image: {
            jobId: `img-0001-${card.id}`,
            mediaType: "image",
            status: "queued",
            reviewState: "queued",
            prompt: imagePrompt,
            outputPaths: [],
            settings: {
              model: "flux2-klein-9b",
              quantize: 4,
              guidance: 1,
              width: 768,
              height: 768,
              steps: 8
            }
          },
          loop: {
            jobId: `loop-0001-${card.id}`,
            mediaType: "video-loop",
            status: "blocked",
            reviewState: "waiting-for-image",
            prompt: loopPrompt,
            promptVersion: TAROT_DRAW_FORGE_LTX_PROMPT_VERSION,
            promptGuide: TAROT_DRAW_FORGE_LTX_PROMPT_GUIDE,
            outputPaths: [],
            settings: {
              model: TAROT_DRAW_FORGE_LTX_BF16_MODEL,
              width: 512,
              height: 512,
              seconds: 4,
              frames: 97,
              fps: 24,
              stage1_steps: 20,
              stage2_steps: 5,
              cfg: 3,
              stg: 1,
              low_ram: false
            }
          }
        },
        pipelineState: "image-queued"
      }
    ]
  };
}

function tarotDrawForgeLoopPrompt({ title, avatarName, intention, lineage = null, edition = null }) {
  const subject = cleanLongText(intention) || `the living Hapa card "${title}"`;
  const editionLine = edition?.number
    ? `This is ${edition.label || `Edition ${edition.number}`} in a parented card lineage; keep the same identity and function while letting the motion treatment feel like a distinct collectible variation.`
    : "";
  const avatarLine = avatarName
    ? `Let the requesting avatar influence mood through subtle color temperature, glow cadence, and artifact behavior, but do not write the avatar name or deck labels on screen.`
    : "";
  const parentLine = lineage?.parentCardId
    ? "Preserve continuity with the parent card through recognizable subject silhouette, color family, and symbolic anchors while avoiding copy-pasted motion."
    : "";
  return [
    "No Camera Movement.",
    "Use the provided image as both the first frame and last frame; preserve the composition, framing, silhouettes, card art style, and major shapes from the reference image.",
    `Create a subtle four-second seamless loop for "${title}" that expresses the card's living meaning: ${subject}`,
    editionLine,
    parentLine,
    avatarLine,
    "Animate only gentle internal life: tiny breathing or posture-settling motion in the main character or focal object, cloth or hair barely shifting, cyan crystal pulses, brass relic glints, lantern shimmer, drifting dust, slow mist, background particles, faint glyph-current flow, and low-energy machinery glow.",
    "Keep the scene readable and almost still; motion should feel alive, sacred, and ambient rather than action-heavy.",
    "Loop continuity: all animated elements must return cleanly to their starting positions by the final frame; no jump cut, no scene change, no new shot, no camera pan, no camera tilt, no dolly, no zoom, no rotation.",
    "Avoid text, captions, logos, watermarks, UI labels, new characters, new faces, extra limbs, distorted hands, melting geometry, major object transformation, teleporting elements, sudden flashes, rapid motion, and camera movement."
  ].filter(Boolean).join(" ");
}

function normalizeTarotDrawForgeLineage(lineage = null) {
  if (!lineage || typeof lineage !== "object") return null;
  const normalized = {
    relation: cleanTitleText(lineage.relation || "variation"),
    parentCardId: String(lineage.parentCardId || lineage.cardId || "").trim(),
    parentRunId: String(lineage.parentRunId || lineage.runId || "").trim(),
    rootCardId: String(lineage.rootCardId || lineage.parentCardId || "").trim(),
    rootRunId: String(lineage.rootRunId || lineage.parentRunId || "").trim(),
    createdFrom: cleanTitleText(lineage.createdFrom || "hapa-avatar-builder:tarot-draw-forge"),
    createdAt: lineage.createdAt || new Date().toISOString()
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function normalizeTarotDrawForgeEdition(edition = null) {
  if (!edition || typeof edition !== "object") return null;
  const number = Math.max(1, Math.round(Number(edition.number || edition.edition || 0) || 0));
  return {
    number,
    label: cleanTitleText(edition.label || (number ? `Edition ${number}` : "Edition")),
    variantOf: String(edition.variantOf || edition.parentCardId || "").trim(),
    note: cleanLongText(edition.note || edition.variationNote || "")
  };
}

function nextTarotDrawForgeEditionNumber(store = {}, parentCard = {}) {
  const parentId = parentCard.id || "";
  const parentForge = parentCard.enrichment?.media?.drawForge || {};
  const rootCardId = parentForge.lineage?.rootCardId || parentForge.parentCardId || parentId;
  let highest = 1;
  for (const card of store.cards || []) {
    const forge = card.enrichment?.media?.drawForge || {};
    const editionNumber = Number(forge.edition?.number || 0);
    const sameParent = forge.parentCardId === parentId || forge.lineage?.parentCardId === parentId;
    const sameRoot = rootCardId && (forge.lineage?.rootCardId === rootCardId || forge.parentCardId === rootCardId || card.id === rootCardId);
    if ((sameParent || sameRoot) && editionNumber > highest) highest = editionNumber;
  }
  return highest + 1;
}

function tarotDrawForgePrompt({ title, avatarName, intention }) {
  const subject = cleanLongText(intention) || `a Hapa Tarot card called ${title}`;
  return [
    `Square Hapa Tarot card hero image for "${title}".`,
    `Visualize the card as an actual mythic scene, not a logo or new standalone symbol: ${subject}.`,
    avatarName ? `Let ${avatarName} influence the mood through visible choices in color, posture, artifacts, and environmental storytelling without writing the avatar name into the image.` : "",
    "Show one readable central action with clear foreground, middle ground, and background; symbols should support the story as a shared visual language, not replace the scene.",
    "No lettering, no captions, no UI text, no watermarks, no fake tarot label text.",
    "early-2000s brushed-pixel CRPG art fused with comic-book mythic futurism, teal-gold arcane technology, and Hapaverse celestial relic design."
  ].filter(Boolean).join(" ");
}

async function stageExternalTarotDrawForgeRun(run, body = {}) {
  if (!CARD_INPUT_STANDARD_ENABLED || !CARD_INPUT_STANDARD_BASE_URL) return null;
  const autoStart = body.autoStart !== false;
  try {
    const staged = await fetchJsonWithTimeout(`${CARD_INPUT_STANDARD_BASE_URL}/api/runs`, {
      method: "POST",
      body: { run }
    }, 16_000);
    let started = null;
    if (staged?.ok && autoStart) {
      started = await fetchJsonWithTimeout(`${CARD_INPUT_STANDARD_BASE_URL}/api/runs/start`, {
        method: "POST",
        body: { id: run.id, promptAuthorshipAcknowledged: true }
      }, 16_000);
    }
    return {
      ok: Boolean(staged?.ok),
      baseUrl: CARD_INPUT_STANDARD_BASE_URL,
      stagedAt: new Date().toISOString(),
      startedAt: started?.ok ? new Date().toISOString() : null,
      startRequested: autoStart,
      stageResponse: staged ? { ok: staged.ok, manifestPath: staged.manifestPath, outputDir: staged.outputDir, videoOutputDir: staged.videoOutputDir } : null,
      startResponse: started ? { ok: started.ok, pid: started.pid, logPath: started.logPath, alreadyRunning: started.alreadyRunning } : null,
      run: started?.run || staged?.run || null
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl: CARD_INPUT_STANDARD_BASE_URL,
      startRequested: autoStart,
      error: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString()
    };
  }
}

async function refreshExternalTarotDrawForgeRun(run = {}) {
  const baseUrl = String(run.external?.baseUrl || CARD_INPUT_STANDARD_BASE_URL || "").replace(/\/+$/, "");
  if (!CARD_INPUT_STANDARD_ENABLED || !baseUrl || !run.id) return null;
  try {
    const response = await fetchJsonWithTimeout(`${baseUrl}/api/runs/${encodeURIComponent(run.id)}`, { method: "GET" }, 10_000);
    return {
      ok: Boolean(response?.ok),
      baseUrl,
      run: response?.run || null,
      manifestPath: response?.manifestPath || null
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchJsonWithTimeout(url, { method = "GET", body = null } = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeTarotDrawForgeRun(localRun = {}, externalRun = {}) {
  const merged = {
    ...localRun,
    ...externalRun,
    external: localRun.external || externalRun.external || null,
    cardId: localRun.cardId || externalRun.cardId || externalRun.items?.[0]?.cardId || externalRun.items?.[0]?.sourceId
  };
  if (localRun.pipeline && !merged.pipeline) merged.pipeline = localRun.pipeline;
  if (localRun.pairedMediaDefaults && !merged.pairedMediaDefaults) merged.pairedMediaDefaults = localRun.pairedMediaDefaults;
  return merged;
}

async function updateTarotDrawForgeCardMedia(run = {}, { forceStage = false } = {}) {
  const cardId = run.cardId || run.items?.[0]?.cardId || run.items?.[0]?.sourceId;
  let store = await readTarotStore();
  let card = (store.cards || []).find((item) => item.id === cardId);
  if (!card) return store;
  const item = run.items?.[0] || {};
  const imagePath = firstMediaOutputPath(item.mediaJobs?.image) || firstArrayValue(item.imagePaths);
  const videoPath = firstMediaOutputPath(item.mediaJobs?.loop) || firstArrayValue(item.videoPaths);
  const loopJob = item.mediaJobs?.loop || {};
  const stage = tarotDrawForgeStageFromRun(run);
  const existingForge = card.enrichment?.media?.drawForge || {};
  const drawForge = {
    ...existingForge,
    runId: run.id,
    stage,
    externalState: run.state || "",
    imageStatus: item.mediaJobs?.image?.status || "",
    loopStatus: item.mediaJobs?.loop?.status || "",
    loopQueueState: loopJob.queueState || existingForge.loopQueueState || "",
    loopQueueEnteredAt: loopJob.queueEnteredAt || existingForge.loopQueueEnteredAt || "",
    loopQueueHeartbeatAt: loopJob.queueHeartbeatAt || existingForge.loopQueueHeartbeatAt || "",
    loopQueueWaitSeconds: loopJob.ltxQueueWaitSeconds || existingForge.loopQueueWaitSeconds || null,
    loopBlockedReason: loopJob.blockedReason || existingForge.loopBlockedReason || "",
    loopActiveRunId: loopJob.activeLoop?.runId || existingForge.loopActiveRunId || "",
    imagePath: imagePath || existingForge.imagePath || "",
    videoPath: videoPath || existingForge.videoPath || "",
    imageUri: imagePath ? localFileUriForPath(imagePath) : existingForge.imageUri || "",
    videoUri: videoPath ? localFileUriForPath(videoPath) : existingForge.videoUri || "",
    imagePrompt: item.mediaJobs?.image?.prompt || item.prompt || existingForge.imagePrompt || "",
    loopPrompt: loopJob.prompt || run.pairedMediaDefaults?.loopPrompt || existingForge.loopPrompt || "",
    loopPromptVersion: loopJob.promptVersion || run.pairedMediaDefaults?.loopPromptVersion || existingForge.loopPromptVersion || TAROT_DRAW_FORGE_LTX_PROMPT_VERSION,
    loopPromptGuide: loopJob.promptGuide || existingForge.loopPromptGuide || TAROT_DRAW_FORGE_LTX_PROMPT_GUIDE,
    lineage: run.lineage || existingForge.lineage || null,
    edition: run.edition || existingForge.edition || null,
    parentCardId: run.lineage?.parentCardId || existingForge.parentCardId || "",
    parentRunId: run.lineage?.parentRunId || existingForge.parentRunId || "",
    updatedAt: new Date().toISOString()
  };
  store = updateTarotCard(store, card.id, {
    status: stage === "complete" ? "review" : card.status,
    enrichment: {
      ...(card.enrichment || {}),
      status: stage === "complete" ? "enriched" : card.enrichment?.status || "draft",
      media: {
        ...(card.enrichment?.media || {}),
        drawForge
      },
      tags: unique([...(card.enrichment?.tags || []), "tarot-draw-forge", stage])
    }
  });
  card = (store.cards || []).find((item) => item.id === cardId);
  if (imagePath && !tarotCardHasAssetPath(card, imagePath, "primary_image")) {
    store = attachTarotCardMedia(store, cardId, {
      id: `${cardId}-draw-forge-image`,
      name: `${card.title} hero image`,
      type: "image",
      mimeType: "image/png",
      uri: localFileUriForPath(imagePath),
      source: "tarot-draw-forge",
      tags: ["tarot-card", "tarot-draw-forge", "flux2", "hero-image"],
      storage: { kind: "local-file", path: imagePath },
      metadata: {
        tarotMediaRole: "primary_image",
        drawForgeRunId: run.id,
        sourcePath: imagePath,
        model: item.mediaJobs?.image?.settings?.model || item.model || "flux2-klein-9b",
        promptPath: item.mediaJobs?.image?.promptPath || ""
      }
    }, "primary_image");
    card = (store.cards || []).find((item) => item.id === cardId);
  }
  if (videoPath && !tarotCardHasAssetPath(card, videoPath, "loop_video")) {
    store = attachTarotCardMedia(store, cardId, {
      id: `${cardId}-draw-forge-loop`,
      name: `${card.title} first-last-frame loop`,
      type: "video",
      mimeType: "video/mp4",
      uri: localFileUriForPath(videoPath),
      source: "tarot-draw-forge",
      tags: ["tarot-card", "tarot-draw-forge", "ltx", "loop-video"],
      storage: { kind: "local-file", path: videoPath },
      metadata: {
        tarotMediaRole: "loop_video",
        drawForgeRunId: run.id,
        sourcePath: videoPath,
        thumbnailUri: imagePath ? localFileUriForPath(imagePath) : "",
        firstFramePath: item.mediaJobs?.loop?.firstFramePath || imagePath || "",
        lastFramePath: item.mediaJobs?.loop?.lastFramePath || imagePath || "",
        frames: item.mediaJobs?.loop?.frames || 97,
        model: item.mediaJobs?.loop?.settings?.model || TAROT_DRAW_FORGE_LTX_BF16_MODEL,
        promptPath: item.mediaJobs?.loop?.promptPath || "",
        promptVersion: item.mediaJobs?.loop?.promptVersion || TAROT_DRAW_FORGE_LTX_PROMPT_VERSION,
        promptGuide: item.mediaJobs?.loop?.promptGuide || TAROT_DRAW_FORGE_LTX_PROMPT_GUIDE,
        motionPrompt: item.mediaJobs?.loop?.prompt || run.pairedMediaDefaults?.loopPrompt || "",
        parentCardId: run.lineage?.parentCardId || "",
        parentRunId: run.lineage?.parentRunId || "",
        editionNumber: run.edition?.number || null
      }
    }, "loop_video");
  }
  if (forceStage || imagePath || videoPath || stage !== existingForge.stage) await writeTarotStore(store);
  return store;
}

function tarotDrawForgeStageFromRun(run = {}) {
  const item = run.items?.[0] || {};
  const image = item.mediaJobs?.image || {};
  const loop = item.mediaJobs?.loop || {};
  if (loop.status === "generated" || firstMediaOutputPath(loop) || firstArrayValue(item.videoPaths)) return "complete";
  if (loop.status === "generating") return "video-generating";
  if (image.status === "failed" || loop.status === "failed" || run.state === "failed") return "failed";
  if (image.status === "generated" && ["queued", "blocked", "waiting-for-ltx-slot"].includes(String(loop.status || "").toLowerCase())) return "video-queued";
  if (image.status === "generated" || firstMediaOutputPath(image) || firstArrayValue(item.imagePaths)) return "image-ready";
  if (image.status === "generating" || run.state === "running" || run.state === "starting") return "image-generating";
  return "requested";
}

function firstMediaOutputPath(job = {}) {
  return firstArrayValue(job.outputPaths) || job.outputPath || "";
}

function firstArrayValue(value = []) {
  return Array.isArray(value) && value.length ? String(value[0] || "") : "";
}

function tarotCardHasAssetPath(card = {}, filePath = "", role = "") {
  if (!filePath) return false;
  return (card.assets || []).some((asset) =>
    (role ? asset.metadata?.tarotMediaRole === role : true) &&
    (asset.storage?.path === filePath || asset.metadata?.sourcePath === filePath || asset.uri === localFileUriForPath(filePath))
  );
}

function localFileUriForPath(filePath = "") {
  const text = String(filePath || "");
  if (!text) return "";
  if (/^(https?:|data:|blob:)/i.test(text) || text.startsWith("/media/")) return text;
  if (text.startsWith("/api/local-file")) return text;
  return `/api/local-file?path=${encodeURIComponent(text.replace(/^file:\/\//, ""))}`;
}

async function readTarotDrawForgeRun(runId = "") {
  const safeId = safeArtifactId(runId);
  if (!safeId) return null;
  try {
    return await readJson(path.join(TAROT_DRAW_FORGE_RUN_DIR, `${safeId}.json`));
  } catch {
    return null;
  }
}

async function writeTarotDrawForgeRun(run = {}) {
  const safeId = safeArtifactId(run.id);
  if (!safeId) throw new Error("Missing Tarot Draw Forge run id.");
  await mkdir(TAROT_DRAW_FORGE_RUN_DIR, { recursive: true });
  await writeFile(path.join(TAROT_DRAW_FORGE_RUN_DIR, `${safeId}.json`), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  invalidateJsonCache(path.join(TAROT_DRAW_FORGE_RUN_DIR, `${safeId}.json`));
}

function safeArtifactId(value = "") {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
}

function cleanTitleText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 96);
}

function cleanLongText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1800);
}

function requestOrigin(req = null) {
  return {
    userAgent: req?.headers?.["user-agent"] || "",
    origin: req?.headers?.origin || "",
    referer: req?.headers?.referer || ""
  };
}

async function readSystemMediaLibrary() {
  try {
    return await readNormalizedJson(SYSTEM_MEDIA_PATH, "system-media-library", normalizeSystemMediaLibrary);
  } catch {
    return createSystemMediaLibrary();
  }
}

async function writeSystemMediaLibrary(library) {
  await mkdir(path.dirname(SYSTEM_MEDIA_PATH), { recursive: true });
  await writeFile(SYSTEM_MEDIA_PATH, `${JSON.stringify(normalizeSystemMediaLibrary(library), null, 2)}\n`, "utf8");
  invalidateJsonCache(SYSTEM_MEDIA_PATH);
}

async function syncMediaAttachmentRecord(asset, relationship, options = {}) {
  const library = await readSystemMediaLibrary();
  const nextLibrary = upsertMediaAttachmentRecord(library, asset, relationship, options);
  await writeSystemMediaLibrary(nextLibrary);
  return nextLibrary;
}

function findAttachedAsset(assets = [], sourceAsset = {}) {
  if (!sourceAsset) return null;
  const keys = new Set([
    sourceAsset.id,
    sourceAsset.assetId,
    sourceAsset.uri,
    sourceAsset.metadata?.storage?.path,
    sourceAsset.storage?.path
  ].filter(Boolean));
  return (assets || []).find((asset) =>
    keys.has(asset.id) ||
    keys.has(asset.assetId) ||
    keys.has(asset.uri) ||
    keys.has(asset.metadata?.storage?.path) ||
    keys.has(asset.storage?.path)
  ) || null;
}

async function patchSystemMediaRecord(recordId, patch = {}) {
  const library = await readSystemMediaLibrary();
  const decodedId = decodeURIComponent(recordId);
  const index = library.records.findIndex((record) => record.id === decodedId);
  if (index < 0) {
    const error = new Error(`System media record not found: ${decodedId}`);
    error.statusCode = 404;
    throw error;
  }
  const current = library.records[index];
  const next = {
    ...current,
    ...pickSystemMediaPatch(patch),
    relationships: patch.relationships ? uniqueSystemMediaRelationships(patch.relationships) : current.relationships || [],
    tags: patch.tags ? uniqueStrings(patch.tags) : current.tags || [],
    updatedAt: new Date().toISOString()
  };
  if (next.asset) {
    next.asset = {
      ...next.asset,
      tags: uniqueStrings([...(next.asset.tags || []), ...(patch.tags || [])]),
      metadata: {
        ...(next.asset.metadata || {}),
        systemMedia: {
          ...(next.asset.metadata?.systemMedia || {}),
          documentKind: next.documentKind,
          reviewPriority: next.reviewPriority,
          reviewStatus: next.reviewStatus,
          relationships: next.relationships,
          updatedAt: next.updatedAt
        }
      }
    };
  }
  library.records[index] = next;
  library.updatedAt = next.updatedAt;
  await writeSystemMediaLibrary(library);
  return library;
}

function pickSystemMediaPatch(patch = {}) {
  const allowed = {};
  for (const key of ["documentKind", "reviewPriority", "reviewStatus", "notes", "match"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
  }
  return allowed;
}

function compactSystemMediaLibrary(library) {
  const normalized = normalizeSystemMediaLibrary(library);
  return {
    ...normalized,
    records: normalized.records.map((record) => ({
      id: record.id,
      sourceKind: record.sourceKind,
      name: record.name,
      mediaType: record.mediaType,
      uri: record.uri,
      thumbnailUri: record.thumbnailUri,
      sourcePath: record.sourcePath,
      sourceRoots: record.sourceRoots,
      sourceRelativePaths: record.sourceRelativePaths,
      contentFingerprint: record.contentFingerprint,
      sizeBytes: record.sizeBytes,
      width: record.width,
      height: record.height,
      duration: record.duration,
      documentKind: record.documentKind,
      reviewPriority: record.reviewPriority,
      tags: (record.tags || []).slice(0, 24),
      relationships: record.relationships || [],
      match: record.match || null,
      reviewStatus: record.reviewStatus || null,
      notes: record.notes || "",
      asset: compactSystemMediaAsset(record.asset),
      intelligence: compactMediaIntelligence(record.intelligence),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }))
  };
}

function compactSystemMediaAsset(asset = null) {
  if (!asset) return null;
  const frames = asset.metadata?.frames || asset.state?.keyframes || [];
  return {
    id: asset.id,
    name: asset.name,
    uri: asset.uri,
    type: asset.type,
    requirementId: asset.requirementId,
    tags: asset.tags || [],
    source: asset.source,
    notes: asset.notes || "",
    metadata: {
      originalFileName: asset.metadata?.originalFileName,
      mimeType: asset.metadata?.mimeType,
      sizeBytes: asset.metadata?.sizeBytes,
      width: asset.metadata?.width,
      height: asset.metadata?.height,
      duration: asset.metadata?.duration,
      format: asset.metadata?.format,
      thumbnail: asset.metadata?.thumbnail || null,
      thumbnailUri: asset.metadata?.thumbnailUri || null,
      frames: frames.map((frame) => ({
        id: frame.id,
        marker: frame.marker,
        label: frame.label,
        role: frame.role,
        time: frame.time,
        uri: frame.uri,
        width: frame.width,
        height: frame.height,
        mimeType: frame.mimeType,
        thumbnail: frame.thumbnail || null,
        thumbnailUri: frame.thumbnailUri || frame.thumbnail?.uri || null,
        fingerprint: frame.fingerprint || null,
        createdAt: frame.createdAt || null
      })),
      folderIngest: asset.metadata?.folderIngest || null,
      systemMedia: asset.metadata?.systemMedia || null,
      storage: asset.metadata?.storage ? {
        kind: asset.metadata.storage.kind,
        fileName: asset.metadata.storage.fileName,
        targetPath: asset.metadata.storage.targetPath
      } : null
    },
    state: asset.state?.keyframes ? {
      ...asset.state,
      keyframes: asset.state.keyframes.map((frame) => ({
        id: frame.id,
        marker: frame.marker,
        label: frame.label,
        role: frame.role,
        time: frame.time,
        uri: frame.uri,
        width: frame.width,
        height: frame.height,
        mimeType: frame.mimeType,
        thumbnail: frame.thumbnail || null,
        thumbnailUri: frame.thumbnailUri || frame.thumbnail?.uri || null,
        fingerprint: frame.fingerprint || null,
        createdAt: frame.createdAt || null
      }))
    } : asset.state || null,
    processing: asset.processing || {}
  };
}

function compactMediaIntelligence(intelligence = null) {
  if (!intelligence) return null;
  return {
    schemaVersion: intelligence.schemaVersion,
    status: intelligence.status,
    provider: intelligence.provider,
    model: intelligence.model,
    source: intelligence.source,
    confidence: intelligence.confidence,
    ocr: intelligence.ocr ? {
      status: intelligence.ocr.status,
      lineCount: intelligence.ocr.lineCount || 0,
      lines: (intelligence.ocr.lines || []).slice(0, 16),
      sourceLanguage: intelligence.ocr.sourceLanguage
    } : null,
    vision: intelligence.vision ? {
      status: intelligence.vision.status,
      labels: (intelligence.vision.labels || []).slice(0, 16),
      description: intelligence.vision.description
    } : null,
    classifications: intelligence.classifications || {},
    attributes: intelligence.attributes ? {
      dimensions: intelligence.attributes.dimensions,
      palette: intelligence.attributes.palette,
      textDensity: intelligence.attributes.textDensity,
      visualLabelCount: intelligence.attributes.visualLabelCount,
      productionUse: intelligence.attributes.productionUse
    } : {},
    rankings: intelligence.rankings || {},
    tarotCandidates: (intelligence.tarotCandidates || []).slice(0, 8),
    sheetSignals: {
      identity: (intelligence.sheetSignals?.identity || []).slice(0, 8),
      lore: (intelligence.sheetSignals?.lore || []).slice(0, 8),
      skills: (intelligence.sheetSignals?.skills || []).slice(0, 8),
      persona: (intelligence.sheetSignals?.persona || []).slice(0, 8)
    },
    gaps: (intelligence.gaps || []).slice(0, 8)
  };
}

function uniqueSystemMediaRelationships(relationships = []) {
  const byKey = new Map();
  for (const rel of Array.isArray(relationships) ? relationships : []) {
    if (!rel?.ownerType && !rel?.ownerId) continue;
    byKey.set(`${rel.ownerType}:${rel.ownerId}:${rel.role || ""}`, {
      ownerType: rel.ownerType || "unknown",
      ownerId: rel.ownerId || null,
      ownerName: rel.ownerName || rel.ownerId || "Unknown",
      role: rel.role || "media"
    });
  }
  return [...byKey.values()];
}

function uniqueStrings(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function songCardConstituentKind(value = "") {
  const kind = String(value || "").trim().toLowerCase();
  if (kind.includes("avatar")) return "avatar";
  if (kind.includes("scene")) return "scene";
  if (kind.includes("item") || kind.includes("card")) return "item";
  return "";
}

function songCardReferenceTarget(reference = {}) {
  const ref = String(reference.ref || "").trim();
  const match = /#(cards|scenes|avatars)\/(.+)$/u.exec(ref);
  let id = String(reference.id || "").trim();
  let kind = songCardConstituentKind(reference.kind);
  if (match) {
    kind = match[1] === "cards" ? "item" : match[1] === "scenes" ? "scene" : "avatar";
    try { id = decodeURIComponent(match[2]); } catch { id = match[2]; }
  }
  return { kind, id, referenceId: String(reference.id || "").trim() };
}

function songCardHydrationTargets(references = []) {
  const targets = new Map();
  for (const reference of references) {
    const target = songCardReferenceTarget(reference);
    const key = `${target.kind || "unknown"}:${target.id || target.referenceId}`;
    const current = targets.get(key) || { key, kind: target.kind, id: target.id || target.referenceId, referenceIds: new Set(), references: [] };
    if (target.referenceId) current.referenceIds.add(target.referenceId);
    if (target.id) current.referenceIds.add(target.id);
    current.references.push(reference);
    targets.set(key, current);
  }
  return [...targets.values()];
}

function songCardTargetStoreKinds(targets = []) {
  const kinds = new Set();
  for (const target of targets) {
    if (target.kind) kinds.add(target.kind);
    else for (const kind of ["item", "scene", "avatar"]) kinds.add(kind);
  }
  return [...kinds].sort();
}

function songCardTargetIds(targets = [], kind) {
  const ids = new Set();
  for (const target of targets) {
    if (target.kind && target.kind !== kind) continue;
    if (target.id) ids.add(target.id);
    for (const id of target.referenceIds || []) ids.add(id);
  }
  return ids;
}

function songCardStoreSubset(store = {}, kind, targets = []) {
  const field = kind === "avatar" ? "avatars" : kind === "scene" ? "scenes" : "cards";
  const ids = songCardTargetIds(targets, kind);
  const rows = Array.isArray(store?.[field]) ? store[field] : [];
  return {
    ...store,
    [field]: rows.filter((row) => ids.has(String(row?.id || row?.cardId || ""))),
  };
}

function songCardProjectionStores(projection = {}, targets = []) {
  return {
    itemStore: songCardStoreSubset(projection.items || {}, "item", targets),
    sceneStore: songCardStoreSubset(projection.world || {}, "scene", targets),
    avatarStore: songCardStoreSubset({ avatars: projection.avatars || [] }, "avatar", targets),
  };
}

async function currentSongCardOverwindProjection({ signal = null } = {}) {
  throwIfSongCardPlanStopped(signal, "before-overwind-signature-check");
  const signature = await createOverwindBootstrapSignature(null, false);
  throwIfSongCardPlanStopped(signal, "after-overwind-signature-check");
  if (overwindBootstrapCache?.signature === signature && overwindBootstrapCache.payload) {
    return { status: "current", projection: overwindBootstrapCache.payload, signature };
  }
  const projection = await readPersistedOverwindProjection(signature, { signal });
  if (!projection) return { status: "unavailable-or-stale", projection: null, signature };
  overwindBootstrapCache = { signature, payload: projection };
  return { status: "current", projection, signature };
}

async function readBuilderCatalogCoreSources({ forceProjection = false } = {}) {
  const current = await currentSongCardOverwindProjection();
  if (!current.projection) {
    const [avatars, items, world] = await Promise.all([
      readStore({ includeProjections: true, forceProjection }),
      readItemStore(),
      readSceneStore(),
    ]);
    return { source: "canonical-store-fallback", avatars, items, world };
  }
  const hellWeek = loadHellWeekProjection({ force: forceProjection });
  const externalAvatars = hellWeek.ok ? hellWeek.cards : [];
  return {
    source: "current-signed-overwind-projection",
    avatars: {
      schemaVersion: current.projection.schemaVersion || "hapa.overwind.avatar-builder-bootstrap.v1",
      updatedAt: current.projection.generatedAt || null,
      avatars: [...(current.projection.avatars || []), ...externalAvatars],
      externalProjections: {
        hellWeek: {
          ok: hellWeek.ok,
          count: externalAvatars.length,
          source: HAPA_DEV_PROTO_DB_PATH,
          cursor: hellWeek.cursor || null,
        },
      },
    },
    items: current.projection.items || { cards: [] },
    world: current.projection.world || { scenes: [] },
  };
}

async function loadSongCardCanonicalStores(targets = [], { signal = null } = {}) {
  const kinds = songCardTargetStoreKinds(targets);
  const loaded = await Promise.all(kinds.map(async (kind) => {
    throwIfSongCardPlanStopped(signal, `before-${kind}-constituent-store-read`);
    const store = kind === "avatar"
      ? await readStore({ signal })
      : kind === "scene"
        ? await readSceneStore({ signal })
        : await readItemStore({ signal });
    throwIfSongCardPlanStopped(signal, `after-${kind}-constituent-store-read`);
    return [kind, songCardStoreSubset(store, kind, targets)];
  }));
  const stores = Object.fromEntries(loaded);
  return {
    loadedStoreKinds: kinds,
    itemStore: stores.item || { cards: [] },
    sceneStore: stores.scene || { scenes: [] },
    avatarStore: stores.avatar || { avatars: [] },
  };
}

function combinedSongCardHydrationReceipt({ references, targets, preflight, result, stages, projectionStatus, projectionSignature, loadedStoreKinds }) {
  const hydrated = new Map();
  for (const stage of stages) {
    for (const row of stage.receipt?.hydrated || []) {
      const key = `${row.kind || ""}:${row.id || ""}:${row.ref || ""}`;
      if (!hydrated.has(key)) hydrated.set(key, { ...row, resolutionSource: stage.source });
    }
  }
  return {
    ...result.receipt,
    requestedCount: references.length,
    suppliedCount: preflight.receipt.suppliedCount,
    hydratedCount: hydrated.size,
    unresolvedCount: result.receipt.unresolvedCount,
    hydrated: [...hydrated.values()],
    unresolved: result.receipt.unresolved,
    canonicalTargetCount: targets.length,
    duplicateReferenceCount: Math.max(0, references.length - targets.length),
    projection: {
      status: projectionStatus,
      regeneratedDuringRequest: false,
      sourceSignatureSha256: projectionSignature ? createHash("sha256").update(projectionSignature).digest("hex") : "",
    },
    loadedStoreKinds,
    bounds: {
      referenceLimit: SONG_CARD_MAX_CONSTITUENT_REFERENCES,
      timeoutMs: SONG_CARD_PLAN_TIMEOUT_MS,
    },
  };
}

async function hydrateSongCardMintInput(body = {}, { signal = null } = {}) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const project = input.project || {};
  const showGraph = input.showGraph || {};
  const references = collectSongCardConstituentReferences({ project, showGraph });
  if (!references.length) return input;
  if (references.length > SONG_CARD_MAX_CONSTITUENT_REFERENCES) {
    throw songCardPlanOperationError(
      "SONG_CARD_CONSTITUENT_LIMIT_EXCEEDED",
      `Song Card planning requested ${references.length} constituent references; the limit is ${SONG_CARD_MAX_CONSTITUENT_REFERENCES}.`,
      413,
      { requestedCount: references.length, limit: SONG_CARD_MAX_CONSTITUENT_REFERENCES },
    );
  }
  throwIfSongCardPlanStopped(signal, "before-constituent-hydration");
  const targets = songCardHydrationTargets(references);
  const preflight = hydrateSongCardConstituentSnapshots({
    project,
    showGraph,
    cardSnapshots: input.cardSnapshots || {},
  });
  let hydration = preflight;
  let projectionStatus = preflight.receipt.unresolvedCount ? "not-checked" : "not-needed";
  let projectionSignature = "";
  let loadedStoreKinds = [];
  const stages = [];

  if (hydration.receipt.unresolvedCount) {
    const projection = await currentSongCardOverwindProjection({ signal });
    projectionStatus = projection.status;
    projectionSignature = projection.signature;
    if (projection.projection) {
      const projectionTargets = songCardHydrationTargets(hydration.receipt.unresolved);
      hydration = hydrateSongCardConstituentSnapshots({
        project,
        showGraph,
        cardSnapshots: hydration.cardSnapshots,
        ...songCardProjectionStores(projection.projection, projectionTargets),
      });
      stages.push({ source: "current-overwind-projection", receipt: hydration.receipt });
    }
  }

  if (hydration.receipt.unresolvedCount) {
    await yieldSongCardPlanTurn(signal);
    const canonicalTargets = songCardHydrationTargets(hydration.receipt.unresolved);
    const canonical = await loadSongCardCanonicalStores(canonicalTargets, { signal });
    loadedStoreKinds = canonical.loadedStoreKinds;
    hydration = hydrateSongCardConstituentSnapshots({
      project,
      showGraph,
      cardSnapshots: hydration.cardSnapshots,
      itemStore: canonical.itemStore,
      sceneStore: canonical.sceneStore,
      avatarStore: canonical.avatarStore,
    });
    stages.push({ source: "canonical-store", receipt: hydration.receipt });
  }

  throwIfSongCardPlanStopped(signal, "after-constituent-hydration");
  const receipt = combinedSongCardHydrationReceipt({
    references,
    targets,
    preflight,
    result: hydration,
    stages,
    projectionStatus,
    projectionSignature,
    loadedStoreKinds,
  });
  return {
    ...input,
    cardSnapshots: hydration.cardSnapshots,
    context: {
      ...(input.context || {}),
      constituentHydration: receipt,
    },
  };
}

async function readItemStore({ signal = null } = {}) {
  try {
    return await readNormalizedJson(ITEM_STORE_PATH, "item-store", normalizeItemManagerStore, { signal });
  } catch (error) {
    if (signal?.aborted) throwIfSongCardPlanStopped(signal, "item-store-read");
    const store = createItemManagerScaffold();
    await writeItemStore(store);
    return store;
  }
}

async function writeItemStore(store) {
  await mkdir(path.dirname(ITEM_STORE_PATH), { recursive: true });
  const normalizedStore = normalizeItemManagerStore(store);
  const previousStore = await readJson(ITEM_STORE_PATH).catch(() => ({ cards: [] }));
  await avatarOverwindOrigin.commitStoreMutation("item", previousStore, normalizedStore, () =>
    writeFile(ITEM_STORE_PATH, `${JSON.stringify(normalizedStore, null, 2)}\n`, "utf8")
  );
  invalidateJsonCache(ITEM_STORE_PATH);
}

async function readInventoryStore() {
  try {
    const store = await readStore();
    const itemStore = await readItemStore();
    return await readNormalizedJson(
      INVENTORY_STORE_PATH,
      `inventory-store:${store.updatedAt || ""}:${itemStore.updatedAt || ""}`,
      (inventory) => normalizeInventoryStore(inventory, store.avatars || [], itemStore.cards || [])
    );
  } catch {
    const store = await readStore();
    const itemStore = await readItemStore();
    const inventoryStore = createInventoryStoreScaffold({
      avatars: store.avatars || [],
      itemCards: itemStore.cards || []
    });
    await writeInventoryStore(inventoryStore);
    return inventoryStore;
  }
}

async function writeInventoryStore(store) {
  await mkdir(path.dirname(INVENTORY_STORE_PATH), { recursive: true });
  await writeFile(INVENTORY_STORE_PATH, `${JSON.stringify(normalizeInventoryStore(store), null, 2)}\n`, "utf8");
  invalidateJsonCache(INVENTORY_STORE_PATH);
}

async function readDearPapaSongbook() {
  return readJson(DEAR_PAPA_SONGBOOK_PATH);
}

async function readHapaSongStore() {
  const songbook = await readDearPapaSongbook();
  try {
    return await readNormalizedJson(HAPA_SONG_STORE_PATH, "hapa-song-store", (store) => normalizeHapaSongStore(store, songbook));
  } catch {
    const store = createHapaSongStoreFromDearPapaSongbook(songbook);
    await writeHapaSongStore(store);
    return store;
  }
}

async function writeHapaSongStore(store) {
  const songbook = await readDearPapaSongbook();
  const normalizedStore = normalizeHapaSongStore(store, songbook);
  await mkdir(path.dirname(HAPA_SONG_STORE_PATH), { recursive: true });
  await writeFile(HAPA_SONG_STORE_PATH, `${JSON.stringify(normalizedStore, null, 2)}\n`, "utf8");
  invalidateJsonCache(HAPA_SONG_STORE_PATH);
}

async function projectSongCardMintHeadToMutableSong(songId, readModel) {
  const store = await readHapaSongStore();
  const current = findSongInStore(store, songId);
  if (!current) return { status: "pending", reason: "mutable-song-not-found" };
  const head = readModel?.head || readModel?.card || {};
  const nextSong = normalizeHapaSong({
    ...current,
    songCardMint: {
      schemaVersion: "hapa.song-card.mint-projection.v1",
      headId: head.id || head.headId || `song-card:${current.songId || songId}`,
      latestEdition: Number(readModel?.latestEdition || head.latestEdition || 0),
      editionCount: Array.isArray(readModel?.editions) ? readModel.editions.length : Number(head.editionCount || 0),
      generation: Number(head.generation || head.version || 0),
      latestEditionId: Number(readModel?.latestEdition || head.latestEdition || 0) > 0 ? `${head.id || head.headId}:edition:${readModel?.latestEdition || head.latestEdition}` : "",
      semanticFingerprint: head.semanticFingerprint || head.latestSemanticFingerprint || "",
      publishStatus: readModel?.editions?.[0]?.publishStatus || "unminted",
      editionsHref: `/api/song-cards/${encodeURIComponent(current.songId || songId)}/editions`,
      projectedAt: new Date().toISOString(),
    },
  });
  const songbook = await readDearPapaSongbook();
  const nextStore = upsertSongInStore(store, nextSong, songbook);
  await writeHapaSongStore(nextStore);
  appendSubscriberRegistration("songs.song-card-mint-head-projected", { songStore: nextStore, songCardHead: head }).catch(() => {});
  return { status: "acknowledged", songId: nextSong.songId, headId: nextSong.songCardMint.headId, latestEdition: nextSong.songCardMint.latestEdition };
}

function findSongInStore(store, songId) {
  return (store.songs || []).find((song) => song.id === songId || song.songId === songId || song.cardId === songId) || null;
}

async function readSongRegistry() {
  return readJson(SONG_REGISTRY_DATA_PATH);
}

async function readDearPapaRegistrySongs(limit = 500) {
  const registry = await readSongRegistry();
  const songbook = await readDearPapaSongbook().catch(() => ({ songCards: [] }));
  const orderByRegistryId = dearPapaSongbookOrder(songbook);
  const allSongs = (registry.songs || []).filter(isDearPapaRegistrySong)
    .slice()
    .sort((a, b) =>
      registryPlaylistTrackNumber(a, orderByRegistryId) - registryPlaylistTrackNumber(b, orderByRegistryId)
      || String(a.title || "").localeCompare(String(b.title || ""))
    );
  const songs = allSongs.slice(0, limit);
  return {
    schemaVersion: "hapa.song-registry.api.songs.v1",
    collection: "dear-papa",
    source: {
      registry: "hapa-song-registry",
      registryPath: SONG_REGISTRY_DATA_PATH,
      playlistId: DEAR_PAPA_PLAYLIST_ID,
      proxy: "hapa-avatar-builder"
    },
    total: allSongs.length,
    songs: songs.map((song) => compactRegistrySong(song, { orderByRegistryId }))
  };
}

async function findRegistrySong(id) {
  const registry = await readSongRegistry();
  let decoded = decodeURIComponent(id);

  if (decoded.startsWith("dear-papa-song-")) {
    try {
      const songbook = await readDearPapaSongbook().catch(() => ({ songCards: [] }));
      const card = (songbook.songCards || []).find((c) => c.id === decoded || c.songId === decoded);
      if (card?.registryTrackId) {
        decoded = card.registryTrackId;
      }
    } catch (e) {
      console.warn("Failed to map song ID from songbook:", e);
    }
  }

  return (registry.songs || []).find((song) => song.id === decoded || song.title === decoded) || null;
}

function compactRegistrySong(song, options = {}) {
  const exportInfo = song.raw?._hapaPlaylistExport || {};
  const audioUri = song.localPath ? `/api/song-registry/audio/${encodeURIComponent(song.id)}` : song.audioUrl || null;
  const coverUri = exportInfo.coverPath ? `/api/song-registry/covers/${encodeURIComponent(song.id)}` : song.imageUrl || null;
  const payload = {
    id: song.id,
    title: song.title,
    authors: song.authors || [],
    duration: song.duration || null,
    createdAt: song.createdAt || null,
    model: song.model || null,
    majorModelVersion: song.majorModelVersion || null,
    trackNumber: registryPlaylistTrackNumber(song, options.orderByRegistryId) || null,
    contentType: song.contentType || "song",
    stemCount: song.stemCount || 0,
    stemTypes: song.stemTypes || [],
    tags: song.tags || "",
    localAvailable: Boolean(song.localPath),
    audioUri,
    coverUri,
    lyrics: song.lyrics || "",
    source: {
      registry: "hapa-song-registry",
      collection: isDearPapaRegistrySong(song) ? "dear-papa" : "song-registry",
      playlistId: playlistIdForRegistrySong(song),
      localPath: song.localPath || null
    }
  };
  if (options.detail) {
    payload.lyricTiming = song.lyricTiming || song.lyricTimings || null;
    payload.promptGroupId = song.promptGroupId || null;
    payload.lyricMasterId = song.lyricMasterId || null;
    payload.facets = song.facets || {};
    payload.rawExport = exportInfo;
  }
  return payload;
}

function isDearPapaRegistrySong(song) {
  const exportInfo = song.raw?._hapaPlaylistExport || {};
  return exportInfo.kind === "song" && String(exportInfo.songDir || "").includes(`/playlists/${DEAR_PAPA_PLAYLIST_ID}/songs/`);
}

function playlistIdForRegistrySong(song) {
  const songDir = song.raw?._hapaPlaylistExport?.songDir || "";
  const match = String(songDir).match(/\/playlists\/([^/]+)\/songs\//);
  return match ? match[1] : null;
}

function registryPlaylistTrackNumber(song, orderByRegistryId = new Map()) {
  if (orderByRegistryId?.has(song.id)) return orderByRegistryId.get(song.id);
  const exportInfo = song.raw?._hapaPlaylistExport || {};
  const explicit = Number(exportInfo.trackNumber || exportInfo.index || 0);
  if (explicit) return explicit;
  const sourcePath = String(exportInfo.songDir || song.localPath || "");
  const match = sourcePath.match(/\/songs\/(\d+)\s+-\s+/);
  return match ? Number(match[1]) : 0;
}

function dearPapaSongbookOrder(songbook = {}) {
  const order = new Map();
  for (const card of songbook.songCards || []) {
    const trackNumber = Number(card.trackNumber || 0);
    if (!trackNumber) continue;
    for (const key of [card.registryTrackId, card.lineage?.registryTrackId].filter(Boolean)) {
      if (!order.has(key)) order.set(key, trackNumber);
    }
  }
  return order;
}

async function appendSubscriberRegistration(action, { avatar = null, media = null, sceneGraph = null, itemStore = null, inventoryStore = null, songStore = null, tarot = null } = {}) {
  await mkdir(SUBSCRIBER_DIR, { recursive: true });
  const occurredAt = new Date().toISOString();
  const baseEvent = {
    schemaVersion: "hapa.subscriber-registration.v1",
    id: `subscriber-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    source: "hapa-avatar-builder",
    action,
    occurredAt,
    subscribers: SUBSCRIBERS,
    avatar: avatar ? compactAvatarRegistration(avatar) : null,
    media: media ? compactMediaRegistration(media) : null,
    world: sceneGraph ? compactSceneGraphRegistration(sceneGraph) : null,
    items: itemStore ? compactItemStoreRegistration(itemStore) : null,
    inventory: inventoryStore ? compactInventoryRegistration(inventoryStore) : null,
    songs: songStore ? compactSongStoreRegistration(songStore) : null,
    tarot: tarot ? compactTarotRegistration(tarot) : null
  };

  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(baseEvent)}\n`, "utf8");
  // Legacy per-subscriber NDJSON fan-out is retired. Canonical Card events use
  // the acknowledged Overwind origin outbox; this central file remains only as
  // migration/audit input for older aggregate registration events.
  await writeFile(path.join(SUBSCRIBER_DIR, "latest.json"), `${JSON.stringify(baseEvent, null, 2)}\n`, "utf8");
  await writeFile(path.join(SUBSCRIBER_DIR, "latest-summary.json"), `${JSON.stringify(summarizeSubscriberEvent(baseEvent), null, 2)}\n`, "utf8");
}

function compactSceneGraphRegistration(graph) {
  const normalized = normalizeSceneGraph(graph);
  return {
    atlasEntityId: "hapa-world:scene-graph",
    secondBrainPathHint: "world/scene-graph.md",
    schemaVersion: normalized.schemaVersion,
    places: normalized.places.length,
    scenes: normalized.scenes.length,
    episodes: normalized.episodes?.length || 0,
    volumes: normalized.volumes?.length || 0,
    placeCards: (normalized.places || []).filter((place) => place.placeCard?.id).length,
    timelines: normalized.timelines.length,
    updatedAt: normalized.updatedAt,
    sceneAttachEndpoints: normalized.scenes.slice(0, 24).map((scene) => ({
      sceneId: scene.id,
      title: scene.title,
      endpoint: `/api/world/attach?sceneId=${encodeURIComponent(scene.id)}`
    }))
  };
}

function compactItemStoreRegistration(store) {
  const normalized = normalizeItemManagerStore(store);
  return {
    atlasEntityId: "hapa-items:item-manager",
    secondBrainPathHint: "items/item-manager.md",
    schemaVersion: normalized.schemaVersion,
    total: normalized.cards.length,
    byKind: normalized.audit.byKind,
    byCanonStatus: normalized.audit.byCanonStatus,
    withPrompts: normalized.audit.withPrompts,
    updatedAt: normalized.updatedAt,
    attachEndpoint: "/api/items/attach",
    sampleCards: normalized.cards.slice(0, 24).map((card) => ({
      id: card.id,
      title: card.title,
      kind: card.kind,
      canonStatus: card.canonStatus,
      avatarIds: card.connections.avatarIds,
      placeIds: card.connections.placeIds
    }))
  };
}

function compactInventoryRegistration(store) {
  const normalized = normalizeInventoryStore(store);
  return {
    atlasEntityId: "hapa-inventory:avatar-card-inventory",
    secondBrainPathHint: "items/avatar-inventory.md",
    schemaVersion: normalized.schemaVersion,
    avatarCount: normalized.avatarInventories.length,
    equippedCards: normalized.audit.equippedCards,
    totalEquipments: normalized.audit.totalEquipments,
    libraryCards: normalized.audit.libraryCards,
    updatedAt: normalized.updatedAt,
    attachEndpoint: "/api/items/attach",
    avatarSamples: normalized.avatarInventories.slice(0, 24).map((inventory) => ({
      avatarId: inventory.avatarId,
      avatarName: inventory.avatarName,
      library: inventory.library.length,
      equipped: inventory.hardpoints.reduce((count, hardpoint) => count + hardpoint.cardIds.length, 0)
    }))
  };
}

function compactSongStoreRegistration(store) {
  const songs = Array.isArray(store.songs) ? store.songs : [];
  const audit = store.audit || {};
  return {
    atlasEntityId: "hapa-songs:dear-papa",
    secondBrainPathHint: "songs/dear-papa.md",
    schemaVersion: store.schemaVersion,
    scope: store.scope,
    album: store.album,
    total: songs.length,
    withLyrics: audit.withLyrics || songs.filter((song) => Boolean(song.lyrics?.text)).length,
    withTimings: audit.withTimings || songs.filter((song) => (song.lyricTimings || []).length).length,
    withAvatars: audit.withAvatars || songs.filter((song) => (song.attachments?.avatarLinks || []).length).length,
    withScenes: audit.withScenes || songs.filter((song) => (song.attachments?.sceneLinks || []).length).length,
    withMedia: audit.withMedia || songs.filter((song) => (song.media || []).length).length,
    withVisualizers: audit.withVisualizers || songs.filter((song) => (song.visualizers || []).length).length,
    updatedAt: store.updatedAt,
    attachEndpoint: "/api/hapa-songs",
    sampleSongs: songs.slice(0, 24).map((song) => ({
      id: song.id,
      songId: song.songId,
      title: song.title,
      author: song.author,
      trackNumber: song.trackNumber,
      avatarIds: (song.attachments?.avatarLinks || []).map((link) => link.avatarId).filter(Boolean),
      sceneIds: (song.attachments?.sceneLinks || []).map((link) => link.sceneId).filter(Boolean),
      mediaCount: song.media?.length || 0,
      visualizerCount: song.visualizers?.length || 0,
      lyricsStatus: song.lyrics?.status || "missing"
    }))
  };
}

function compactTarotRegistration(store) {
  const normalized = normalizeTarotStore(store);
  const summary = summarizeTarotStore(normalized);
  return {
    atlasEntityId: "hapa-tarot:library",
    secondBrainPathHint: "tarot/library.md",
    schemaVersion: normalized.schemaVersion,
    updatedAt: normalized.updatedAt,
    summary,
    attachPack: {
      schemaVersion: "hapa.tarot-attach-pack.v1",
      endpoint: "/api/tarot/attach?target=hapa-subscriber",
      cardCount: normalized.cards.length,
      deckCount: normalized.decks.length,
      setCount: normalized.sets.length,
      cardBackCount: summary.cardBacks,
      loopVideoCount: summary.loopVideos
    },
    dashboard: createTarotLibraryDashboard(normalized),
    decks: normalized.decks.slice(0, 24).map((deck) => ({
      atlasEntityId: `hapa-tarot-deck:${deck.id}`,
      id: deck.id,
      title: deck.title,
      status: deck.status,
      cards: deck.cardIds.length,
      backCardId: deck.backCardId,
      endpoint: `/api/tarot/attach?deckId=${encodeURIComponent(deck.id)}&target=hapa-subscriber`
    })),
    sets: normalized.sets.slice(0, 24).map((set) => ({
      atlasEntityId: `hapa-tarot-set:${set.id}`,
      id: set.id,
      title: set.title,
      status: set.status,
      cards: set.cardIds.length,
      endpoint: `/api/tarot/attach?setId=${encodeURIComponent(set.id)}&target=hapa-subscriber`
    })),
    cards: normalized.cards.slice(0, 48).map((card) => ({
      atlasEntityId: `hapa-tarot-card:${card.id}`,
      id: card.id,
      title: card.title,
      status: card.status,
      cardType: card.cardType,
      deckIds: card.deckIds,
      setIds: card.setIds,
      avatarLinks: card.avatarLinks,
      media: card.asset ? compactMediaRegistration(card.asset) : null,
      assetCount: card.assets.length,
      loopVideoCount: card.assets.filter((asset) => asset.type === "video").length,
      endpoint: `/api/tarot/attach?cardId=${encodeURIComponent(card.id)}&target=hapa-subscriber`
    }))
  };
}

function compactAvatarRegistration(avatar) {
  const normalized = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalized);
  const attachPack = createAttachPack(normalized, "hapa-subscriber");
  const mindSummary = createAvatarMindSummary(normalized);
  const media = (normalized.assets || []).map(compactMediaRegistration);
  return {
    atlasEntityId: `hapa-avatar:${normalized.id}`,
    secondBrainPathHint: `avatars/${normalized.id}.md`,
    id: normalized.id,
    primaryName: normalized.primaryName,
    names: normalized.names?.map((item) => item.name) || [normalized.primaryName],
    grade: audit.grade,
    percent: audit.percent,
    required: audit.required,
    filled: audit.filled,
    missing: audit.missing,
    updatedAt: normalized.updatedAt,
    attachPack: {
      schemaVersion: attachPack.schemaVersion,
      avatarCardId: attachPack.avatarCardId,
      target: attachPack.target,
      grade: attachPack.completeness?.grade || audit.grade,
      endpoint: `/api/avatars/${normalized.id}/attach?target=hapa-subscriber`,
      baseReferenceCount: attachPack.baseReferences.length,
      modelReferenceCount: attachPack.modelReferences.length,
      videoBranchCount: attachPack.videoBranches.length,
      backgroundlessReadyCount: media.filter((asset) => asset.backgroundless?.ready).length,
      videoLinkCount: attachPack.videoLinks.length,
      videoMatchQueueCount: attachPack.videoMatchQueue.length
    },
    mind: {
      schemaVersion: mindSummary.schemaVersion,
      endpoint: `/api/avatars/${normalized.id}/mind`,
      updatedAt: mindSummary.updatedAt,
      counts: mindSummary.counts,
      knownOthers: mindSummary.knownOthers.slice(0, 24),
      contextCount: mindSummary.context.length
    },
    media,
    relationships: [
      ...media.map((asset) => ({
        from: `hapa-avatar:${normalized.id}`,
        type: "HAS_MEDIA_ASSET",
        to: asset.atlasEntityId,
        role: asset.requirementId || "media"
      })),
      ...mindSummary.knownOthers.map((relationship) => ({
        from: `hapa-avatar:${normalized.id}`,
        type: "HAS_MIND_RELATIONSHIP",
        to: relationship.id ? `hapa-avatar:${relationship.id}` : `hapa-avatar-name:${slugify(relationship.name)}`,
        role: relationship.relationLabel || "known-other",
        trust: relationship.trust,
        tension: relationship.tension,
        loyalty: relationship.loyalty,
        confidence: relationship.confidence,
        classification: relationship.classification
      }))
    ]
  };
}

function compactMediaRegistration(media) {
  const playback = backgroundlessPlaybackForAsset(media);
  return {
    atlasEntityId: `hapa-media:${media.id || slugify(media.name || media.uri || "asset")}`,
    id: media.id || null,
    name: media.name || null,
    type: media.type || media.mimeType || null,
    uri: media.uri || null,
    playbackUri: playback.ready ? playback.uri : media.uri || null,
    backgroundless: compactBackgroundlessPlayback(playback),
    requirementId: media.requirementId || media.metadata?.sectionRequirementId || null,
    tags: media.tags || [],
    sizeBytes: media.sizeBytes || media.metadata?.sizeBytes || null,
    width: media.metadata?.width || null,
    height: media.metadata?.height || null,
    thumbnail: media.metadata?.thumbnail?.uri || media.metadata?.thumbnailUri || null,
    storage: media.storage || media.metadata?.storage || null,
    updatedAt: media.updatedAt || media.processing?.attachedAt || media.processing?.processedAt || null
  };
}

function compactBackgroundlessPlayback(playback = {}) {
  if (!playback?.state) return null;
  return {
    schemaVersion: playback.state.schemaVersion,
    status: playback.status,
    ready: playback.ready,
    hasAlpha: playback.hasAlpha,
    uri: playback.ready ? playback.uri : null,
    sourceUri: playback.sourceUri,
    posterUri: playback.posterUri || null,
    variantCount: playback.state.variants?.length || 0,
    taskId: playback.state.taskId || null,
    sourceVideoHash: playback.state.sourceVideoHash || null,
    backend: playback.state.backend || null,
    keyer: playback.state.keyer || null,
    codec: playback.state.codec || null,
    updatedAt: playback.state.updatedAt || null
  };
}

function createBackgroundlessVideoLibrarySummary(store = {}) {
  const avatars = (store.avatars || []).map((avatar) => videoBackgroundlessSummary(avatar));
  return {
    schemaVersion: "hapa.backgroundless-video-library.v1",
    generatedAt: new Date().toISOString(),
    avatarCount: avatars.length,
    total: avatars.reduce((sum, avatar) => sum + avatar.total, 0),
    ready: avatars.reduce((sum, avatar) => sum + avatar.ready, 0),
    queued: avatars.reduce((sum, avatar) => sum + avatar.queued, 0),
    processing: avatars.reduce((sum, avatar) => sum + avatar.processing, 0),
    failed: avatars.reduce((sum, avatar) => sum + avatar.failed, 0),
    missing: avatars.reduce((sum, avatar) => sum + avatar.missing, 0),
    avatars
  };
}

async function readOverwindBootstrap(selectedAvatarId = null, includeSelectedAvatar = false) {
  const signature = await createOverwindBootstrapSignature(selectedAvatarId, includeSelectedAvatar);
  if (overwindBootstrapCache?.signature === signature) {
    return overwindBootstrapCache.payload;
  }
  const persistedProjection = await readPersistedOverwindProjection(signature);
  if (persistedProjection) {
    overwindBootstrapCache = {
      signature,
      payload: persistedProjection
    };
    return persistedProjection;
  }
  const [store, board, graph, itemStore, inventoryStore] = await Promise.all([
    readStore(),
    readJson(KANBAN_PATH).catch(() => ({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    readSceneStore(),
    readItemStore(),
    readInventoryStore()
  ]);
  const selectedAvatar = (store.avatars || []).find((avatar) => avatar.id === selectedAvatarId) || store.avatars?.[0] || null;
  const projection = {
    schemaVersion: "hapa.overwind.avatar-builder-bootstrap.v1",
    generatedAt: new Date().toISOString(),
    sourceSignature: signature,
    source: {
      app: "hapa-avatar-builder",
      avatarStore: STORE_PATH,
      worldStore: SCENE_STORE_PATH,
      itemStore: ITEM_STORE_PATH,
      inventoryStore: INVENTORY_STORE_PATH,
      kanbanStore: KANBAN_PATH
    },
    persistence_target: {
      id: "hapa_overwind",
      path: OVERWIND_BOOTSTRAP_PATH,
      entityNames: OVERWIND_ENTITY_NAMES,
      servingMode: "compact-bootstrap-plus-lazy-detail"
    },
    counts: {
      avatars: store.avatars?.length || 0,
      teams: store.teams?.length || 0,
      places: graph.places?.length || 0,
      scenes: graph.scenes?.length || 0,
      cards: itemStore.cards?.length || 0,
      inventories: inventoryStore.avatarInventories?.length || 0
    },
    avatars: (store.avatars || []).map(compactAvatarForOverwind),
    selectedAvatar: includeSelectedAvatar ? selectedAvatar : null,
    selectedAvatarId: selectedAvatar?.id || null,
    teams: store.teams || [],
    world: compactSceneGraphForOverwind(graph),
    items: compactItemStoreForOverwind(itemStore),
    inventory: inventoryStore,
    kanban: board
  };
  await persistOverwindProjection(projection);
  overwindBootstrapCache = {
    signature,
    payload: projection
  };
  return projection;
}

async function readOverwindShellBootstrap(selectedAvatarId = null) {
  const signature = await createOverwindShellBootstrapSignature(selectedAvatarId);
  if (overwindShellBootstrapCache?.signature === signature) {
    return overwindShellBootstrapCache.payload;
  }

  const persistedShell = await readPersistedOverwindShellProjection();
  if (persistedShell?.sourceSignature === signature) {
    overwindShellBootstrapCache = {
      signature,
      payload: persistedShell
    };
    return persistedShell;
  }

  const board = await readJson(KANBAN_PATH).catch(() => ({ schemaVersion: "hapa.kanban.v1", lanes: [] }));
  const fullSignature = await createOverwindBootstrapSignature(selectedAvatarId, false);
  const persistedFullCandidate = await readAnyPersistedOverwindProjection();
  const persistedFullProjection = persistedFullCandidate?.sourceSignature === fullSignature
    ? persistedFullCandidate
    : await readOverwindBootstrap(selectedAvatarId, false).catch(() => null);
  const projection = persistedFullProjection?.avatars?.length
    ? createOverwindShellBootstrapFromProjection(persistedFullProjection, {
        signature,
        selectedAvatarId,
        board,
        freshness: persistedFullProjection.sourceSignature === fullSignature ? "shell-from-current-full-projection" : "shell-from-regenerated-full-projection"
      })
    : (() => {
        const error = new Error("stale_overwind_shell_rejected: no current full projection matches the source signature");
        error.statusCode = 409;
        throw error;
      })();

  await persistOverwindShellProjection(projection).catch((error) => {
    console.warn(`Overwind shell persist skipped: ${error instanceof Error ? error.message : String(error)}`);
  });

  overwindShellBootstrapCache = {
    signature,
    payload: projection
  };
  return projection;
}

async function readPersistedOverwindProjection(signature, { signal = null } = {}) {
  try {
    throwIfSongCardPlanStopped(signal, "before-overwind-projection-read");
    const source = await readFile(OVERWIND_BOOTSTRAP_PATH, { encoding: "utf8", ...(signal ? { signal } : {}) });
    throwIfSongCardPlanStopped(signal, "before-overwind-projection-parse");
    const payload = JSON.parse(source);
    throwIfSongCardPlanStopped(signal, "after-overwind-projection-parse");
    return payload?.sourceSignature === signature ? payload : null;
  } catch (error) {
    if (signal?.aborted) throwIfSongCardPlanStopped(signal, "overwind-projection-read");
    return null;
  }
}

async function readAnyPersistedOverwindProjection() {
  try {
    return JSON.parse(await readFile(OVERWIND_BOOTSTRAP_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function readPersistedOverwindShellProjection() {
  try {
    return JSON.parse(await readFile(OVERWIND_SHELL_BOOTSTRAP_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function createOverwindBootstrapSignature(selectedAvatarId, includeSelectedAvatar) {
  return JSON.stringify({
    projectionVersion: OVERWIND_BOOTSTRAP_PROJECTION_VERSION,
    selectedAvatarId: selectedAvatarId || "",
    includeSelectedAvatar: Boolean(includeSelectedAvatar),
    files: await createOverwindSourceFileParts()
  });
}

async function createOverwindShellBootstrapSignature(selectedAvatarId) {
  return JSON.stringify({
    projectionVersion: OVERWIND_SHELL_BOOTSTRAP_PROJECTION_VERSION,
    selectedAvatarId: selectedAvatarId || "",
    mode: "shell",
    files: await createOverwindSourceFileParts()
  });
}

async function createOverwindSourceFileParts() {
  const sourceFiles = [STORE_PATH, KANBAN_PATH, SCENE_STORE_PATH, ITEM_STORE_PATH, INVENTORY_STORE_PATH];
  return Promise.all(sourceFiles.map(async (filePath) => {
    try {
      const fileStat = await stat(filePath);
      return [path.resolve(filePath), fileStat.mtimeMs, fileStat.size];
    } catch {
      return [path.resolve(filePath), 0, 0];
    }
  }));
}

async function persistOverwindProjection(projection) {
  await mkdir(OVERWIND_DIR, { recursive: true });
  await writeFile(OVERWIND_BOOTSTRAP_PATH, `${JSON.stringify(projection)}\n`, "utf8");
}

async function persistOverwindShellProjection(projection) {
  await mkdir(OVERWIND_DIR, { recursive: true });
  await writeFile(OVERWIND_SHELL_BOOTSTRAP_PATH, `${JSON.stringify(projection)}\n`, "utf8");
}

function createOverwindShellBootstrapFromProjection(sourceProjection = {}, options = {}) {
  const allAvatars = (sourceProjection.avatars || [])
    .map(compactAvatarForOverwindShell)
    .filter(Boolean);
  const avatarWindow = createAvatarShellWindow(allAvatars, options.selectedAvatarId, OVERWIND_SHELL_AVATAR_LIMIT);
  const avatars = avatarWindow.avatars;
  const selectedAvatar = avatars.find((avatar) => avatar.id === options.selectedAvatarId) || avatars[0] || null;
  const counts = {
    avatars: sourceProjection.counts?.avatars || allAvatars.length,
    teams: sourceProjection.counts?.teams || sourceProjection.teams?.length || 0,
    places: sourceProjection.counts?.places || sourceProjection.world?.places?.length || 0,
    scenes: sourceProjection.counts?.scenes || sourceProjection.world?.scenes?.length || 0,
    cards: sourceProjection.counts?.cards || sourceProjection.items?.cards?.length || 0,
    inventories: sourceProjection.counts?.inventories || sourceProjection.inventory?.avatarInventories?.length || 0
  };

  return {
    schemaVersion: OVERWIND_SHELL_BOOTSTRAP_PROJECTION_VERSION,
    generatedAt: new Date().toISOString(),
    sourceSignature: options.signature,
    sourceProjectionSignature: sourceProjection.sourceSignature || null,
    source: {
      ...(sourceProjection.source || {}),
      app: "hapa-avatar-builder",
      shellStore: OVERWIND_SHELL_BOOTSTRAP_PATH
    },
    persistence_target: {
      id: "hapa_overwind_shell",
      path: OVERWIND_SHELL_BOOTSTRAP_PATH,
      entityNames: OVERWIND_ENTITY_NAMES,
      servingMode: "latency-shell-plus-queued-hydration"
    },
    counts,
    avatars,
    avatarIndex: {
      schemaVersion: "hapa.avatar-index-window.v1",
      total: avatarWindow.total,
      loaded: avatars.length,
      limit: avatarWindow.limit,
      hasMore: avatarWindow.hasMore,
      windowed: avatarWindow.windowed,
      selectedAvatarIncluded: Boolean(selectedAvatar),
      indexEndpoint: `/api/avatars?mode=index&limit=${avatarWindow.limit}`,
      detailEndpointTemplate: "/api/avatars/:avatarId"
    },
    selectedAvatar: null,
    selectedAvatarId: selectedAvatar?.id || null,
    teams: compactAvatarTeamsForOverwindShell(sourceProjection.teams || []),
    world: createOverwindShellSceneGraph(counts),
    items: createOverwindShellItemStore(counts),
    inventory: createInventoryStoreScaffold(),
    kanban: compactKanbanForOverwindShell(options.board || sourceProjection.kanban || { schemaVersion: "hapa.kanban.v1", lanes: [] }),
    telemetry: createOverwindShellTelemetry(options.freshness || "shell", counts),
    overwind: {
      projection: "shell",
      targetMs: 500,
      hydrationPolicy: "queue detail stores only after route intent or idle budget"
    }
  };
}

function createFallbackOverwindShellBootstrap(options = {}) {
  const counts = {
    avatars: 0,
    teams: 0,
    places: 0,
    scenes: 0,
    cards: 0,
    inventories: 0
  };
  return {
    schemaVersion: OVERWIND_SHELL_BOOTSTRAP_PROJECTION_VERSION,
    generatedAt: new Date().toISOString(),
    sourceSignature: options.signature,
    sourceProjectionSignature: null,
    source: {
      app: "hapa-avatar-builder",
      shellStore: OVERWIND_SHELL_BOOTSTRAP_PATH
    },
    persistence_target: {
      id: "hapa_overwind_shell",
      path: OVERWIND_SHELL_BOOTSTRAP_PATH,
      entityNames: OVERWIND_ENTITY_NAMES,
      servingMode: "fallback-shell-plus-queued-hydration"
    },
    counts,
    avatars: [],
    avatarIndex: {
      schemaVersion: "hapa.avatar-index-window.v1",
      total: 0,
      loaded: 0,
      limit: OVERWIND_SHELL_AVATAR_LIMIT,
      hasMore: false,
      windowed: false,
      selectedAvatarIncluded: false,
      indexEndpoint: `/api/avatars?mode=index&limit=${OVERWIND_SHELL_AVATAR_LIMIT}`,
      detailEndpointTemplate: "/api/avatars/:avatarId"
    },
    selectedAvatar: null,
    selectedAvatarId: options.selectedAvatarId || null,
    teams: [],
    world: createOverwindShellSceneGraph(counts),
    items: createOverwindShellItemStore(counts),
    inventory: createInventoryStoreScaffold(),
    kanban: compactKanbanForOverwindShell(options.board || { schemaVersion: "hapa.kanban.v1", lanes: [] }),
    telemetry: createOverwindShellTelemetry("fallback-shell", counts),
    overwind: {
      projection: "shell",
      targetMs: 500,
      hydrationPolicy: "serve shell immediately and hydrate authoritative stores on route intent"
    }
  };
}

function createOverwindShellTelemetry(freshness, counts) {
  return {
    schemaVersion: "hapa.overwind.shell-telemetry.v1",
    freshness,
    targetMs: 500,
    generatedAt: new Date().toISOString(),
    waitingState: "Compact shell active; full avatars, world, items, inventory, and media hydrate through queues.",
    queuedHydration: [
      "selected avatar detail",
      "world store on Scenes",
      "item store on Items",
      "full avatar store on Tarot/Songs"
    ],
    counts
  };
}

function createOverwindShellSceneGraph(counts = {}) {
  const scaffold = createSceneGraphScaffold({
    placeName: "World Hydration Queue",
    placeSummary: "Compact shell placeholder. Full places and scenes load when Scenes opens.",
    sceneTitle: "Queued Scene Hydration",
    sceneSummary: "Full scene graph is kept off startup payload for the 500 ms latency target."
  });
  return {
    ...compactSceneGraphForOverwind(scaffold),
    overwindProjection: "shell",
    counts: {
      places: counts.places || 0,
      scenes: counts.scenes || 0
    }
  };
}

function createOverwindShellItemStore(counts = {}) {
  const scaffold = createItemManagerScaffold({ title: "Hapa Item Manager Shell" });
  return {
    ...compactItemStoreForOverwind(scaffold),
    overwindProjection: "shell",
    counts: {
      cards: counts.cards || 0
    }
  };
}

function compactAvatarForOverwindShell(avatar = {}) {
  const id = avatar.id;
  if (!id) return null;
  const primaryName = avatar.primaryName || avatar.name || avatar.names?.[0]?.name || id;
  const mind = avatar.mind && typeof avatar.mind === "object" ? avatar.mind : {};
  const mindSummary = createAvatarMindSummary(avatar);
  const summaryLoadout = mindSummary.loadout || {};
  const shellCounts = mergePositiveCountObjects(mindSummary.counts || {}, mind.counts || {});
  const shellLoadout = {
    protocolCards: firstNonEmptyArray(summaryLoadout.protocolCards, mind.loadout?.protocolCards, mind.protocolCardLoadout),
    skillCards: firstNonEmptyArray(summaryLoadout.skillCards, mind.loadout?.skillCards, mind.skillCardLoadout),
    tarotCards: firstNonEmptyArray(summaryLoadout.tarotCards, mind.loadout?.tarotCards, mind.tarotCardDeck),
    songCards: firstNonEmptyArray(summaryLoadout.songCards, mind.loadout?.songCards, mind.dearPapaSongContext?.selectedSongCards)
  };
  return {
    schemaVersion: avatar.schemaVersion || "hapa.avatar-card.v1",
    id,
    primaryName,
    names: normalizeShellNames(avatar.names, primaryName),
    aliases: compactStringList(avatar.aliases || [], 4, 80),
    status: avatar.status || "active",
    role: avatar.role || mind.shipCrewAssignment?.role || "",
    summary: truncateText(avatar.summary || avatar.operatorNotes || "", 260),
    three_paragraph_background_narrative: "",
    operatorNotes: truncateText(avatar.operatorNotes || "", 160),
    updatedAt: avatar.updatedAt || null,
    slots: [],
    assets: [],
    mind: {
      schemaVersion: mind.schemaVersion || "hapa.avatar-mind.v1",
      endpoint: mind.endpoint || `/api/avatars/${encodeURIComponent(id)}/mind`,
      updatedAt: mind.updatedAt || null,
      counts: shellCounts,
      personaAnchor: compactPersonaAnchorForOverwind(mind.personaAnchor || {}),
      shipCrewAssignment: compactPlainObject(mind.shipCrewAssignment || null, 8, 120),
      gardenNodeAssignment: compactPlainObject(mind.gardenNodeAssignment || null, 8, 120),
      journalCount: shellCounts.journalEntries || mind.journalCount || 0,
      knownOthers: compactMindRelationshipList(mindSummary.knownOthers || mind.knownOthers || [], 4),
      loadout: {
        protocolCards: compactMindReferenceList(shellLoadout.protocolCards, 2),
        skillCards: compactMindReferenceList(shellLoadout.skillCards, 2),
        tarotCards: compactMindReferenceList(shellLoadout.tarotCards, 3),
        songCards: compactMindReferenceList(shellLoadout.songCards, 3)
      },
      phraseCards: compactMindReferenceList(mindSummary.phraseCards || mind.phraseCards || [], 2),
      context: compactMindReferenceList(mindSummary.context || mind.context || [], 2),
      canonicalChoices: compactCanonicalChoiceList(mind.canonicalChoices || [], 6),
      storySpine: compactStorySpine(mind.storySpine || null),
      voiceGuide: compactVoiceGuide(mind.voiceGuide || null),
      weeklyJournalVoiceGuide: compactPlainObject(mind.weeklyJournalVoiceGuide || null, 6, 180),
      annualSceneBeats: compactAnnualSceneBeatList(mind.annualSceneBeats || [], 4)
    },
    audit: compactAuditForOverwindShell(avatar.audit || null),
    overwindProjection: "compact",
    overwind: {
      persistenceTarget: "hapa_overwind_shell",
      detailEndpoint: `/api/avatars/${encodeURIComponent(id)}`,
      hydration: "queued-on-intent"
    }
  };
}

function compactStorySpine(spine = null) {
  if (!spine || typeof spine !== "object") return null;
  return {
    schemaVersion: spine.schemaVersion || "hapa.avatar-story-spine.v1",
    id: spine.id || "",
    title: truncateText(spine.title || "", 140),
    arc: truncateText(spine.arc || "", 360),
    roleInMainStory: truncateText(spine.roleInMainStory || "", 160),
    coreQuestion: truncateText(spine.coreQuestion || "", 220),
    refusal: truncateText(spine.refusal || "", 220),
    choicePressure: truncateText(spine.choicePressure || "", 240),
    stakes: truncateText(spine.stakes || "", 240),
    canonStatus: spine.canonStatus || "soft_canon",
    reviewState: spine.reviewState || "pending_review",
    choiceIds: compactStringList(spine.choiceIds || [], 12, 140),
    sceneIds: compactStringList(spine.sceneIds || [], 12, 140),
    relationshipIds: compactStringList(spine.relationshipIds || [], 12, 140),
    annualSceneBeatIds: compactStringList(spine.annualSceneBeatIds || [], 12, 140),
    updatedAt: spine.updatedAt || null
  };
}

function compactCanonicalChoiceList(choices = [], limit = 6) {
  return (Array.isArray(choices) ? choices : [])
    .filter((choice) => choice && choice.status !== "tombstone" && choice.status !== "tombstoned" && choice.classification !== "tombstone")
    .slice(0, limit)
    .map((choice) => ({
      schemaVersion: choice.schemaVersion || "hapa.avatar-canonical-choice.v1",
      id: choice.id || "",
      actorAvatarId: choice.actorAvatarId || "",
      actorName: choice.actorName || "",
      choiceType: choice.choiceType || "",
      choiceText: truncateText(choice.choiceText || "", 280),
      decisionPressure: truncateText(choice.decisionPressure || "", 260),
      alternativesRefused: compactStringList(choice.alternativesRefused || [], 3, 180),
      canonStatus: choice.canonStatus || "soft_canon",
      classification: choice.classification || "generated",
      confidence: choice.confidence || "generated",
      reviewState: choice.reviewState || "pending_review",
      linkTargets: compactChoiceLinkTargets(choice.linkTargets || {}),
      emotionalCost: truncateText(choice.emotionalCost || "", 220),
      futurePayoff: truncateText(choice.futurePayoff || "", 220),
      status: choice.status || "active",
      updatedAt: choice.updatedAt || null
    }));
}

function compactChoiceLinkTargets(linkTargets = {}) {
  return {
    avatarIds: compactStringList(linkTargets.avatarIds || [], 12, 140),
    cardIds: compactStringList(linkTargets.cardIds || [], 12, 140),
    songIds: compactStringList(linkTargets.songIds || [], 12, 140),
    sceneIds: compactStringList(linkTargets.sceneIds || [], 12, 140),
    teamIds: compactStringList(linkTargets.teamIds || [], 8, 140),
    placeIds: compactStringList(linkTargets.placeIds || [], 8, 140),
    relationshipIds: compactStringList(linkTargets.relationshipIds || [], 12, 160),
    memoryIds: compactStringList(linkTargets.memoryIds || [], 8, 160),
    journalEntryIds: compactStringList(linkTargets.journalEntryIds || [], 8, 160)
  };
}

function compactVoiceGuide(guide = null) {
  if (!guide || typeof guide !== "object") return null;
  return {
    schemaVersion: guide.schemaVersion || "hapa.avatar-voice-guide.v1",
    id: guide.id || "",
    title: truncateText(guide.title || "", 140),
    voicePremise: truncateText(guide.voicePremise || "", 280),
    coreQuestion: truncateText(guide.coreQuestion || "", 220),
    refusalLine: truncateText(guide.refusalLine || "", 220),
    pressureLine: truncateText(guide.pressureLine || "", 220),
    stakesLine: truncateText(guide.stakesLine || "", 220),
    phraseCardIds: compactStringList(guide.phraseCardIds || [], 12, 140),
    updatedAt: guide.updatedAt || null
  };
}

function compactAnnualSceneBeatList(beats = [], limit = 4) {
  return (Array.isArray(beats) ? beats : [])
    .slice(0, limit)
    .map((beat) => ({
      id: beat.id || "",
      sourceJournalEntryId: beat.sourceJournalEntryId || "",
      title: truncateText(beat.title || "", 220),
      beat: truncateText(beat.beat || "", 260),
      sceneIds: compactStringList(beat.sceneIds || [], 6, 140),
      canonStatus: beat.canonStatus || "soft_canon",
      reviewState: beat.reviewState || "pending_review",
      updatedAt: beat.updatedAt || null
    }));
}

function firstNonEmptyArray(...lists) {
  return lists.find((list) => Array.isArray(list) && list.length) ||
    lists.find((list) => Array.isArray(list)) ||
    [];
}

function mergePositiveCountObjects(primary = {}, fallback = {}) {
  return {
    ...(primary || {}),
    ...Object.fromEntries(Object.entries(fallback || {}).filter(([, value]) => Number(value) > 0))
  };
}

function compactAuditForOverwindShell(audit = null) {
  if (!audit || typeof audit !== "object") return null;
  return {
    required: Number(audit.required) || 0,
    filled: Number(audit.filled) || 0,
    missing: Number(audit.missing) || 0,
    percent: Math.round(Number(audit.percent) || 0),
    grade: audit.grade || "",
    complete: Boolean(audit.complete)
  };
}

function compactMindRelationshipList(values = [], limit = 4) {
  return (Array.isArray(values) ? values : []).slice(0, limit).map((item) => ({
    id: item.id || item.avatarId || null,
    name: truncateText(item.name || item.targetName || item.primaryName || "", 80),
    relationLabel: truncateText(item.relationLabel || item.relationship || "", 80),
    trust: Number(item.trust) || 0,
    tension: Number(item.tension) || 0,
    loyalty: Number(item.loyalty) || 0,
    classification: item.classification || item.confidence || ""
  }));
}

function compactMindReferenceList(values = [], limit = 3) {
  return (Array.isArray(values) ? values : []).slice(0, limit).map((item, index) => {
    if (typeof item === "string") return truncateText(item, 100);
    return {
      id: item.id || item.cardId || item.songId || item.title || `ref-${index}`,
      title: truncateText(item.title || item.name || item.label || item.summary || "", 100),
      kind: item.kind || item.cardType || item.type || "",
      status: item.status || "",
      summary: truncateText(item.summary || item.description || item.text || "", 140)
    };
  });
}

function normalizeShellNames(names, primaryName) {
  const sourceNames = Array.isArray(names) && names.length ? names : [{ name: primaryName }];
  return sourceNames.slice(0, 4).map((item) => (
    typeof item === "string" ? { name: item } : { ...item, name: item.name || primaryName }
  ));
}

function pickAvatarShellPreviewAsset(avatar = {}) {
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const asset = assets.find((item) => item.metadata?.thumbnailUri || item.metadata?.thumbnail?.uri || item.metadata?.posterUri)
    || assets.find((item) => item.type === "image")
    || assets[0];
  return asset ? compactMediaForOverwind(asset) : null;
}

function createAvatarShellWindow(avatars = [], selectedAvatarId = null, limit = OVERWIND_SHELL_AVATAR_LIMIT) {
  const deduped = [];
  const seen = new Set();
  for (const avatar of avatars) {
    if (!avatar?.id || seen.has(avatar.id)) continue;
    seen.add(avatar.id);
    deduped.push(avatar);
  }
  const selected = selectedAvatarId ? deduped.find((avatar) => avatar.id === selectedAvatarId) : null;
  const ordered = selected
    ? [selected, ...deduped.filter((avatar) => avatar.id !== selected.id)]
    : deduped;
  const safeLimit = Math.max(1, limit);
  const windowedAvatars = ordered.slice(0, safeLimit);
  return {
    avatars: windowedAvatars,
    total: deduped.length,
    limit: safeLimit,
    hasMore: deduped.length > windowedAvatars.length,
    windowed: deduped.length > windowedAvatars.length
  };
}

function compactAvatarTeamsForOverwindShell(teams = []) {
  return (Array.isArray(teams) ? teams : []).map((team) => ({
    schemaVersion: team.schemaVersion || "hapa.avatar-teams.v1",
    id: team.id,
    title: team.title || team.name || "Untitled Team",
    description: truncateText(team.description || "", 160),
    accent: team.accent || "cyan",
    status: team.status || "active",
    totalMembers: (team.members || []).length,
    members: (team.members || []).slice(0, OVERWIND_SHELL_TEAM_MEMBER_LIMIT).map((member) => ({
      avatarId: typeof member === "string" ? member : member.avatarId,
      role: typeof member === "string" ? "Member" : member.role || "Member",
      notes: typeof member === "string" ? "" : truncateText(member.notes || "", 120),
      joinedAt: typeof member === "string" ? null : member.joinedAt || null
    })),
    createdAt: team.createdAt || null,
    updatedAt: team.updatedAt || null
  })).filter((team) => team.id);
}

function compactKanbanForOverwindShell(board = {}) {
  const lanes = Array.isArray(board.lanes) ? board.lanes : [];
  const compactLanes = lanes.map((lane) => {
    const cards = Array.isArray(lane.cards) ? lane.cards : [];
    return {
      id: lane.id,
      title: lane.title || "Lane",
      accent: lane.accent || "cyan",
      totalCards: cards.length,
      doneCards: cards.filter((card) => card.status === "done").length,
      cards: cards.slice(0, OVERWIND_SHELL_BOARD_CARD_LIMIT).map(compactKanbanCardForOverwindShell)
    };
  });
  const totalCards = lanes.reduce((sum, lane) => sum + (lane.cards?.length || 0), 0);
  const doneCards = lanes.reduce((sum, lane) => sum + (lane.cards || []).filter((card) => card.status === "done").length, 0);
  return {
    schemaVersion: board.schemaVersion || "hapa.kanban-board.v1",
    boardId: board.boardId || "hapa-avatar-builder",
    title: board.title || "Hapa Avatar Builder Delivery Board",
    updatedAt: board.updatedAt || null,
    overwindProjection: "shell",
    totalCards,
    doneCards,
    laneCount: compactLanes.length,
    cardWindowLimit: OVERWIND_SHELL_BOARD_CARD_LIMIT,
    hasMore: compactLanes.some((lane) => lane.totalCards > lane.cards.length),
    lanes: compactLanes
  };
}

function compactKanbanCardForOverwindShell(card = {}) {
  return {
    id: card.id,
    title: card.title || "Untitled card",
    status: card.status || "queued",
    owner: card.owner || "",
    priority: card.priority || "",
    body: truncateText(card.body || card.description || "", 130),
    tags: compactStringList(card.tags || [], 8, 40),
    updatedAt: card.updatedAt || null,
    completedAt: card.completedAt || null,
    notes: (card.notes || []).slice(-1).map((note) => ({
      at: note.at || null,
      text: truncateText(note.text || "", 120)
    }))
  };
}

function compactAvatarForOverwind(avatar) {
  const normalized = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalized);
  const mindSummary = createAvatarMindSummary(normalized);
  return {
    schemaVersion: normalized.schemaVersion,
    id: normalized.id,
    primaryName: normalized.primaryName,
    names: normalized.names || [],
    aliases: normalized.aliases || [],
    status: normalized.status || "active",
    role: normalized.role || normalized.mind?.shipCrewAssignment?.role || "",
    summary: truncateText(normalized.summary || normalized.operatorNotes || normalized.three_paragraph_background_narrative?.paragraphs?.[0] || "", 420),
    three_paragraph_background_narrative: truncateText(normalized.three_paragraph_background_narrative || "", 1800),
    operatorNotes: truncateText(normalized.operatorNotes || "", 420),
    updatedAt: normalized.updatedAt || null,
    slots: (normalized.slots || []).map(compactAvatarSlotForOverwind),
    assets: (normalized.assets || []).map(compactMediaForOverwind),
    mind: {
      schemaVersion: normalized.mind?.schemaVersion || mindSummary.schemaVersion,
      endpoint: `/api/avatars/${encodeURIComponent(normalized.id)}/mind`,
      updatedAt: mindSummary.updatedAt,
      counts: mindSummary.counts,
      personaAnchor: compactPersonaAnchorForOverwind(mindSummary.personaAnchor),
      shipCrewAssignment: normalized.mind?.shipCrewAssignment || null,
      gardenNodeAssignment: normalized.mind?.gardenNodeAssignment || null,
      journalCount: Array.isArray(normalized.mind?.journalEntries) ? normalized.mind.journalEntries.length : 0,
      knownOthers: mindSummary.knownOthers.slice(0, 12),
      loadout: {
        protocolCards: mindSummary.loadout.protocolCards.slice(0, 8),
        skillCards: mindSummary.loadout.skillCards.slice(0, 8),
        tarotCards: mindSummary.loadout.tarotCards.slice(0, 12),
        songCards: mindSummary.loadout.songCards.slice(0, 12)
      },
      phraseCards: mindSummary.phraseCards.slice(0, 8),
      context: mindSummary.context.slice(0, 12),
      canonicalChoices: compactCanonicalChoiceList(normalized.mind?.canonicalChoices || [], 8),
      storySpine: compactStorySpine(normalized.mind?.storySpine || null),
      voiceGuide: compactVoiceGuide(normalized.mind?.voiceGuide || null),
      weeklyJournalVoiceGuide: compactPlainObject(normalized.mind?.weeklyJournalVoiceGuide || null, 6, 180),
      annualSceneBeats: compactAnnualSceneBeatList(normalized.mind?.annualSceneBeats || [], 4)
    },
    audit: {
      grade: audit.grade,
      percent: audit.percent,
      required: audit.required,
      filled: audit.filled,
      missing: audit.missing
    },
    overwindProjection: "compact",
    overwind: {
      persistenceTarget: "hapa_overwind",
      detailEndpoint: `/api/avatars/${encodeURIComponent(normalized.id)}`
    }
  };
}

function compactPersonaAnchorForOverwind(anchor = {}) {
  const source = anchor && typeof anchor === "object" ? anchor : {};
  return {
    identityStatement: truncateText(source.identityStatement || "", 420),
    wants: truncateText(source.wants || "", 420),
    fears: truncateText(source.fears || "", 420),
    misunderstandings: truncateText(source.misunderstandings || "", 420),
    willNotSayDirectly: truncateText(source.willNotSayDirectly || "", 420),
    carriedForward: truncateText(source.carriedForward || "", 420),
    updatedAt: source.updatedAt || null
  };
}

function compactAvatarSlotForOverwind(slot) {
  return {
    id: slot.id,
    requirementId: slot.requirementId,
    label: slot.label,
    required: slot.required !== false,
    assetId: slot.assetId || null,
    preferredTags: slot.preferredTags || []
  };
}

function compactMediaForOverwind(media) {
  const compact = compactMediaRegistration(media);
  return {
    ...compact,
    mimeType: media.mimeType || media.type || null,
    metadata: {
      width: media.metadata?.width || null,
      height: media.metadata?.height || null,
      duration: media.metadata?.duration || media.metadata?.durationSeconds || null,
      posterUri: media.metadata?.posterUri || media.metadata?.thumbnail?.uri || media.metadata?.thumbnailUri || null,
      thumbnailUri: media.metadata?.thumbnail?.uri || media.metadata?.thumbnailUri || null
    }
  };
}

function compactSceneGraphForOverwind(graph) {
  const normalized = normalizeSceneGraph(graph);
  return {
    schemaVersion: normalized.schemaVersion,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    overwindProjection: "compact",
    places: (normalized.places || []).map((place) => ({
      id: place.id,
      name: place.name,
      type: place.type,
      summary: truncateText(place.summary || place.lore || "", 520),
      tags: place.tags || [],
      sceneIds: place.sceneIds || [],
      updatedAt: place.updatedAt || null
    })),
    scenes: (normalized.scenes || []).map((scene) => ({
      id: scene.id,
      title: scene.title,
      placeId: scene.placeId,
      timelineId: scene.timelineId,
      summary: truncateText(scene.summary || scene.narrativeText || scene.lore || "", 620),
      tags: scene.tags || [],
      avatarIds: scene.avatarIds || scene.connections?.avatarIds || [],
      itemIds: scene.itemIds || scene.connections?.itemIds || [],
      mediaAssets: compactMediaList(scene.mediaAssets || scene.assets || [], 6),
      canonicalTime: scene.canonicalTime || null,
      updatedAt: scene.updatedAt || null
    })),
    episodes: (normalized.episodes || []).map((episode) => ({
      id: episode.id,
      title: episode.title,
      summary: truncateText(episode.summary || "", 520),
      sceneIds: episode.sceneIds || [],
      updatedAt: episode.updatedAt || null
    })),
    volumes: (normalized.volumes || []).map((volume) => ({
      id: volume.id,
      title: volume.title,
      summary: truncateText(volume.summary || "", 520),
      episodeIds: volume.episodeIds || [],
      updatedAt: volume.updatedAt || null
    })),
    timelines: normalized.timelines || []
  };
}

function compactItemStoreForOverwind(store) {
  const normalized = normalizeItemManagerStore(store);
  return {
    schemaVersion: normalized.schemaVersion,
    title: normalized.title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    audit: normalized.audit,
    agents: normalized.agents || [],
    auditRuns: [],
    overwindProjection: "compact",
    cards: (normalized.cards || []).map(compactItemCardForOverwind)
  };
}

function compactItemCardForOverwind(card) {
  return {
    id: card.id,
    schemaVersion: card.schemaVersion,
    cardType: card.cardType,
    kind: card.kind,
    title: card.title,
    name: card.name,
    status: card.status,
    canonStatus: card.canonStatus,
    summary: truncateText(card.summary || card.description || card.lore || "", 420),
    description: truncateText(card.description || "", 260),
    lore: truncateText(card.lore || "", 360),
    utility: compactStringList(card.utility, 6, 120),
    broadGameMechanics: compactStringList(card.broadGameMechanics, 6, 120),
    tags: card.tags || [],
    rank: card.rank,
    quality: card.quality || {},
    locationState: card.locationState || {},
    connections: compactConnectionsForOverwind(card.connections || {}),
    songLinks: compactSongLinksForOverwind(card.songLinks || card.tarotCard?.songLinks || card.episodeCard?.songLinks || [], 4),
    mediaAssets: compactMediaList(card.mediaAssets || [], 2),
    tarotCard: compactTarotDetailsForOverwind(card.tarotCard),
    shipCard: compactShipDetailsForOverwind(card.shipCard),
    sourceRefs: compactSourceRefsForOverwind(card.sourceRefs || [], 2),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    overwindProjection: "compact"
  };
}

function compactConnectionsForOverwind(connections = {}) {
  return {
    avatarIds: (connections.avatarIds || []).slice(0, 12),
    sceneIds: (connections.sceneIds || []).slice(0, 12),
    placeIds: (connections.placeIds || []).slice(0, 12),
    itemIds: (connections.itemIds || []).slice(0, 12),
    songIds: (connections.songIds || []).slice(0, 12)
  };
}

function compactTarotDetailsForOverwind(tarot = null) {
  if (!tarot || typeof tarot !== "object") return null;
  return {
    name: tarot.name || tarot.title || tarot.cardName || tarot.card_name || "",
    title: tarot.title || tarot.name || tarot.cardName || tarot.card_name || "",
    system: tarot.system || tarot.tarotSystem || tarot.tarot_system || "",
    type: tarot.type || tarot.cardType || tarot.card_type || "",
    types: compactStringList(tarot.types || tarot.cardTypes || tarot.card_types, 6, 80),
    arcana: tarot.arcana || tarot.arcanaType || tarot.arcana_type || "",
    suit: tarot.suit || "",
    rank: tarot.rank || tarot.number || "",
    catalog: compactPlainObject(tarot.catalog || tarot.cataloging, 12, 160),
    attribution: compactPlainObject(tarot.attribution, 12, 160),
    mechanics: compactPlainObject(tarot.mechanics, 16, 160),
    songLinks: compactSongLinksForOverwind(tarot.songLinks || [], 4),
    lore: truncateText(tarot.lore || tarot.meaning || tarot.description || "", 420),
    ocr: {
      confidence: tarot.ocr?.confidence || tarot.ocrConfidence || tarot.ocr_confidence || null,
      preview: truncateText(tarot.ocr?.text || tarot.ocr?.rawText || tarot.ocrText || tarot.ocr_text || "", 420)
    }
  };
}

function compactSongLinksForOverwind(songLinks = [], limit = 4) {
  return (Array.isArray(songLinks) ? songLinks : [])
    .slice(0, limit)
    .map((link) => ({
      id: link.id || "",
      choiceId: link.choiceId || "",
      sourceChoiceId: link.sourceChoiceId || "",
      songId: link.songId || link.song_id || "",
      songCardId: link.songCardId || link.song_card_id || "",
      songTitle: link.songTitle || link.title || link.name || "",
      cardId: link.cardId || link.card_id || "",
      avatarId: link.avatarId || link.avatar_id || "",
      avatarName: link.avatarName || link.avatar_name || "",
      avatarRole: link.avatarRole || link.avatar_role || link.role || "",
      why: truncateText(link.why || link.songWhy || link.whySelected || link.whyChosen || "", 420),
      canonReason: truncateText(link.canonReason || "", 360),
      objectiveFit: truncateText(link.objectiveFit || "", 260),
      deckInfluence: truncateText(link.deckInfluence || "", 260),
      vibe: truncateText(link.vibe || "", 160),
      notes: truncateText(link.notes || "", 240)
    }))
    .filter((link) => link.songCardId || link.songId || link.songTitle || link.id);
}

function compactShipDetailsForOverwind(shipCard = null) {
  if (!shipCard || typeof shipCard !== "object") return null;
  return compactPlainObject(shipCard, 16, 160);
}

function compactSourceRefsForOverwind(sourceRefs = [], limit = 2) {
  return (Array.isArray(sourceRefs) ? sourceRefs : []).slice(0, limit).map((sourceRef) => ({
    id: sourceRef.id || null,
    label: sourceRef.label || sourceRef.title || sourceRef.name || "",
    type: sourceRef.type || sourceRef.kind || "",
    uri: sourceRef.uri || sourceRef.url || "",
    summary: truncateText(sourceRef.summary || sourceRef.description || "", 160)
  }));
}

function compactMediaList(mediaList, limit = 8) {
  return (Array.isArray(mediaList) ? mediaList : []).slice(0, limit).map(compactMediaForOverwind);
}

function compactStringList(values = [], limit = 8, maxLength = 160) {
  return (Array.isArray(values) ? values : [values])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .slice(0, limit)
    .map((value) => truncateText(value, maxLength));
}

function compactPlainObject(value = null, limit = 12, maxLength = 180) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value ? truncateText(value, maxLength) : null;
  }
  return Object.fromEntries(Object.entries(value).slice(0, limit).map(([key, entry]) => {
    if (Array.isArray(entry)) return [key, compactStringList(entry, 8, maxLength)];
    if (entry && typeof entry === "object") return [key, compactPlainObject(entry, 8, maxLength)];
    return [key, truncateText(entry, maxLength)];
  }));
}

function truncateText(value, maxLength = 600) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

async function readSubscriberStatus() {
  const targetCounts = {};
  for (const subscriber of SUBSCRIBERS) {
    targetCounts[subscriber] = await countNdjson(path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`));
  }
  const latest = await readLatestSubscriberSummary();
  return {
    schemaVersion: "hapa.subscriber-status.v1",
    subscriberDir: SUBSCRIBER_DIR,
    subscribers: SUBSCRIBERS,
    eventCount: await countNdjson(path.join(SUBSCRIBER_DIR, "events.ndjson")),
    targetCounts,
    latest
  };
}

async function readSubscriberEvents(limit = 50) {
  const events = await readNdjson(path.join(SUBSCRIBER_DIR, "events.ndjson"));
  return {
    schemaVersion: "hapa.subscriber-events.v1",
    subscriberDir: SUBSCRIBER_DIR,
    total: events.length,
    events: events.slice(-limit).reverse().map(summarizeSubscriberEvent)
  };
}

async function countNdjson(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    if (!text.trim()) return 0;
    return text.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function readLatestSubscriberSummary() {
  try {
    return JSON.parse(await readFile(path.join(SUBSCRIBER_DIR, "latest-summary.json"), "utf8"));
  } catch {
    const latest = await readLatestNdjson(path.join(SUBSCRIBER_DIR, "events.ndjson"));
    return latest ? summarizeSubscriberEvent(latest) : null;
  }
}

async function readLatestNdjson(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    const latestLine = text.trimEnd().split("\n").filter(Boolean).at(-1);
    return latestLine ? JSON.parse(latestLine) : null;
  } catch {
    return null;
  }
}

function summarizeSubscriberEvent(event) {
  if (!event) return null;
  return {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    source: event.source,
    action: event.action,
    occurredAt: event.occurredAt,
    subscribers: event.subscribers || [],
    avatar: event.avatar ? {
      atlasEntityId: event.avatar.atlasEntityId,
      secondBrainPathHint: event.avatar.secondBrainPathHint,
      id: event.avatar.id,
      primaryName: event.avatar.primaryName,
      grade: event.avatar.grade,
      percent: event.avatar.percent,
      required: event.avatar.required,
      filled: event.avatar.filled,
      missing: event.avatar.missing,
      mediaCount: event.avatar.media?.length || 0,
      relationshipCount: event.avatar.relationships?.length || 0,
      mindEndpoint: event.avatar.mind?.endpoint || `/api/avatars/${event.avatar.id}/mind`,
      mindCounts: event.avatar.mind?.counts || null,
      attachPackEndpoint: event.avatar.attachPack?.endpoint || `/api/avatars/${event.avatar.id}/attach?target=hapa-subscriber`
    } : null,
    media: event.media ? {
      atlasEntityId: event.media.atlasEntityId,
      id: event.media.id,
      name: event.media.name,
      type: event.media.type,
      requirementId: event.media.requirementId,
      uri: event.media.uri
    } : null,
    world: event.world ? {
      atlasEntityId: event.world.atlasEntityId,
      secondBrainPathHint: event.world.secondBrainPathHint,
      schemaVersion: event.world.schemaVersion,
      places: event.world.places,
      scenes: event.world.scenes,
      timelines: event.world.timelines,
      updatedAt: event.world.updatedAt
    } : null,
    items: event.items ? {
      atlasEntityId: event.items.atlasEntityId,
      secondBrainPathHint: event.items.secondBrainPathHint,
      schemaVersion: event.items.schemaVersion,
      total: event.items.total,
      byKind: event.items.byKind,
      withPrompts: event.items.withPrompts,
      updatedAt: event.items.updatedAt
    } : null,
    inventory: event.inventory ? {
      atlasEntityId: event.inventory.atlasEntityId,
      secondBrainPathHint: event.inventory.secondBrainPathHint,
      schemaVersion: event.inventory.schemaVersion,
      avatarCount: event.inventory.avatarCount,
      equippedCards: event.inventory.equippedCards,
      totalEquipments: event.inventory.totalEquipments,
      updatedAt: event.inventory.updatedAt
    } : null,
    songs: event.songs ? {
      atlasEntityId: event.songs.atlasEntityId,
      secondBrainPathHint: event.songs.secondBrainPathHint,
      schemaVersion: event.songs.schemaVersion,
      total: event.songs.total,
      withLyrics: event.songs.withLyrics,
      withAvatars: event.songs.withAvatars,
      withScenes: event.songs.withScenes,
      withMedia: event.songs.withMedia,
      withVisualizers: event.songs.withVisualizers,
      updatedAt: event.songs.updatedAt
    } : null,
    tarot: event.tarot ? {
      atlasEntityId: event.tarot.atlasEntityId,
      secondBrainPathHint: event.tarot.secondBrainPathHint,
      schemaVersion: event.tarot.schemaVersion,
      updatedAt: event.tarot.updatedAt,
      summary: event.tarot.summary,
      attachPackEndpoint: event.tarot.attachPack?.endpoint || "/api/tarot/attach?target=hapa-subscriber"
    } : null
  };
}

async function readNdjson(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function readJson(filePath) {
  return (await readCachedJson(filePath)).value;
}

function awaitJsonStoreFlight(promise, signal, phase) {
  if (!signal) return promise;
  throwIfSongCardPlanStopped(signal, phase);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      try {
        throwIfSongCardPlanStopped(signal, phase);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function readCachedJson(filePath, { signal = null } = {}) {
  throwIfSongCardPlanStopped(signal, "before-json-store-read");
  const resolvedPath = path.resolve(filePath);
  const fileStat = await stat(resolvedPath);
  throwIfSongCardPlanStopped(signal, "after-json-store-stat");
  const cached = rawJsonCache.get(resolvedPath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return cached;
  }
  const currentFlight = rawJsonInflight.get(resolvedPath);
  if (currentFlight && currentFlight.mtimeMs === fileStat.mtimeMs && currentFlight.size === fileStat.size) {
    jsonStoreReadTelemetry.rawInflightHits += 1;
    return awaitJsonStoreFlight(currentFlight.promise, signal, "shared-json-store-read");
  }
  const flight = { mtimeMs: fileStat.mtimeMs, size: fileStat.size, invalidated: false, promise: null };
  flight.promise = (async () => {
    jsonStoreReadTelemetry.rawDiskReads += 1;
    const source = await readFile(resolvedPath, "utf8");
    const entry = {
      value: JSON.parse(source),
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size
    };
    if (!flight.invalidated) rawJsonCache.set(resolvedPath, entry);
    return entry;
  })();
  rawJsonInflight.set(resolvedPath, flight);
  flight.promise.finally(() => {
    if (rawJsonInflight.get(resolvedPath) === flight) rawJsonInflight.delete(resolvedPath);
  }).catch(() => {});
  const entry = await awaitJsonStoreFlight(flight.promise, signal, "json-store-read");
  throwIfSongCardPlanStopped(signal, "after-json-store-parse");
  return entry;
}

async function readNormalizedJson(filePath, cacheKey, normalizer, { signal = null } = {}) {
  const resolvedPath = path.resolve(filePath);
  const normalizedKey = `${cacheKey}:${resolvedPath}`;
  const fileStat = await stat(resolvedPath);
  throwIfSongCardPlanStopped(signal, "after-normalized-json-store-stat");
  let cached = normalizedJsonCache.get(normalizedKey);
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return cached.value;
  }
  const entry = await readCachedJson(filePath, { signal });
  cached = normalizedJsonCache.get(normalizedKey);
  if (cached && cached.mtimeMs === entry.mtimeMs && cached.size === entry.size) return cached.value;
  throwIfSongCardPlanStopped(signal, "before-json-store-normalize");
  const currentFlight = normalizedJsonInflight.get(normalizedKey);
  if (currentFlight && currentFlight.mtimeMs === entry.mtimeMs && currentFlight.size === entry.size) {
    jsonStoreReadTelemetry.normalizedInflightHits += 1;
    return awaitJsonStoreFlight(currentFlight.promise, signal, "shared-json-store-normalize");
  }
  const flight = { resolvedPath, mtimeMs: entry.mtimeMs, size: entry.size, invalidated: false, promise: null };
  flight.promise = Promise.resolve().then(() => {
    jsonStoreReadTelemetry.normalizedBuilds += 1;
    const value = normalizer(entry.value);
    if (!flight.invalidated) normalizedJsonCache.set(normalizedKey, {
      value,
      mtimeMs: entry.mtimeMs,
      size: entry.size
    });
    return value;
  }).finally(() => {
    // The normalized cache is the reusable representation. Retaining the parsed
    // authoring store as well doubles hundreds of megabytes without helping the
    // next normalized read, so large raw trees are released immediately.
    if (entry.size > MAX_RETAINED_RAW_JSON_BYTES) rawJsonCache.delete(resolvedPath);
    if (normalizedJsonInflight.get(normalizedKey) === flight) normalizedJsonInflight.delete(normalizedKey);
  });
  normalizedJsonInflight.set(normalizedKey, flight);
  const value = await awaitJsonStoreFlight(flight.promise, signal, "json-store-normalize");
  throwIfSongCardPlanStopped(signal, "after-json-store-normalize");
  return value;
}

function invalidateJsonCache(filePath) {
  const resolvedPath = path.resolve(filePath);
  rawJsonCache.delete(resolvedPath);
  const rawFlight = rawJsonInflight.get(resolvedPath);
  if (rawFlight) rawFlight.invalidated = true;
  rawJsonInflight.delete(resolvedPath);
  normalizedJsonCache.clear();
  for (const flight of normalizedJsonInflight.values()) flight.invalidated = true;
  normalizedJsonInflight.clear();
  overwindBootstrapCache = null;
}

async function blueAvatarOwnerStatus() {
  const owner = await readBlueAvatarOwner();
  return {
    ok: true,
    owned: Boolean(owner),
    owner: publicBlueAvatarOwner(owner)
  };
}

async function handleBlueAvatarOwner(body = {}, req = null) {
  const action = String(body.action || "claim").toLowerCase();
  const clientId = cleanBlueAvatarOwnerText(body.clientId || body.client_id || "");
  if (!clientId) {
    return {
      ok: false,
      owned: false,
      error: "missing_client_id",
      message: "Blue Avatar owner claims require a clientId."
    };
  }

  const now = Date.now();
  const current = await readBlueAvatarOwner(now);
  if (action === "release") {
    if (current?.clientId === clientId) await writeBlueAvatarOwner(null);
    return {
      ok: true,
      owned: false,
      released: current?.clientId === clientId,
      owner: current?.clientId === clientId ? null : publicBlueAvatarOwner(current)
    };
  }

  if (current && current.clientId !== clientId && body.force !== true) {
    return {
      ok: false,
      owned: false,
      error: "owned_elsewhere",
      message: `Blue Avatar is already owned by ${current.surface || "another surface"}.`,
      owner: publicBlueAvatarOwner(current),
      ttlMs: Math.max(0, Number(current.expiresAt || 0) - now)
    };
  }

  const owner = createBlueAvatarOwnerRecord(body, req, current?.clientId === clientId ? current : null, now);
  await writeBlueAvatarOwner(owner);
  return {
    ok: true,
    owned: true,
    owner: publicBlueAvatarOwner(owner),
    ttlMs: BLUE_AVATAR_OWNER_TTL_MS
  };
}

async function validateBlueAvatarRequestOwner(body = {}, options = {}) {
  const clientId = cleanBlueAvatarOwnerText(body.clientId || body.client_id || "");
  const now = Date.now();
  const current = await readBlueAvatarOwner(now);
  if (!clientId) {
    if (current && !options.allowMissingClient) {
      return {
        ok: false,
        owned: false,
        error: "owned_elsewhere",
        message: `Blue Avatar is owned by ${current.surface || "another surface"}; unscoped requests are paused.`,
        owner: publicBlueAvatarOwner(current),
        ttlMs: Math.max(0, Number(current.expiresAt || 0) - now)
      };
    }
    return { ok: true, owned: Boolean(current), owner: publicBlueAvatarOwner(current) };
  }
  if (current && current.clientId !== clientId) {
    return {
      ok: false,
      owned: false,
      error: "owned_elsewhere",
      message: `Blue Avatar is owned by ${current.surface || "another surface"}; this request was not played here.`,
      owner: publicBlueAvatarOwner(current),
      ttlMs: Math.max(0, Number(current.expiresAt || 0) - now)
    };
  }
  if (options.refresh !== false) {
    const owner = createBlueAvatarOwnerRecord(body, null, current, now);
    await writeBlueAvatarOwner(owner);
    return { ok: true, owned: true, owner: publicBlueAvatarOwner(owner), ttlMs: BLUE_AVATAR_OWNER_TTL_MS };
  }
  return { ok: true, owned: Boolean(current), owner: publicBlueAvatarOwner(current) };
}

async function readBlueAvatarOwner(now = Date.now()) {
  try {
    const raw = await readFile(BLUE_AVATAR_OWNER_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.clientId || Number(parsed.expiresAt || 0) <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeBlueAvatarOwner(owner = null) {
  await mkdir(path.dirname(BLUE_AVATAR_OWNER_PATH), { recursive: true });
  await writeFile(BLUE_AVATAR_OWNER_PATH, `${JSON.stringify(owner || {
    clientId: "",
    releasedAt: new Date().toISOString(),
    expiresAt: 0
  }, null, 2)}\n`);
}

function createBlueAvatarOwnerRecord(body = {}, req = null, previous = null, now = Date.now()) {
  const forwardedFor = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const remoteAddress = forwardedFor || req?.socket?.remoteAddress || "";
  return {
    clientId: cleanBlueAvatarOwnerText(body.clientId || body.client_id || ""),
    sessionId: cleanBlueAvatarOwnerText(body.sessionId || body.session_id || ""),
    surface: cleanBlueAvatarOwnerText(body.surface || body.surfaceName || "Tarot Draw"),
    origin: cleanBlueAvatarOwnerText(body.origin || req?.headers?.origin || ""),
    href: cleanBlueAvatarOwnerText(body.href || ""),
    reason: cleanBlueAvatarOwnerText(body.reason || body.source || ""),
    remoteAddress,
    claimedAt: previous?.claimedAt || now,
    updatedAt: now,
    claimedAtIso: previous?.claimedAtIso || new Date(now).toISOString(),
    updatedAtIso: new Date(now).toISOString(),
    expiresAt: now + BLUE_AVATAR_OWNER_TTL_MS
  };
}

function publicBlueAvatarOwner(owner = null) {
  if (!owner?.clientId) return null;
  return {
    clientId: owner.clientId,
    sessionId: owner.sessionId || "",
    surface: owner.surface || "",
    origin: owner.origin || "",
    href: owner.href || "",
    reason: owner.reason || "",
    claimedAt: owner.claimedAtIso || "",
    updatedAt: owner.updatedAtIso || "",
    expiresAt: owner.expiresAt || 0
  };
}

function cleanBlueAvatarOwnerText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

async function readBody(req) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > MAX_REQUEST_BYTES) {
    const error = new Error(`request_body_too_large: limit=${MAX_REQUEST_BYTES}`); error.statusCode = 413; throw error;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) { const error = new Error(`request_body_too_large: limit=${MAX_REQUEST_BYTES}`); error.statusCode = 413; throw error; }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function songCardPlanOperationError(code, message, statusCode, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function createSongCardPlanOperation(req, res, requestKey) {
  const controller = new AbortController();
  const key = String(requestKey || "song-card-plan");
  let disposed = false;
  const abort = (error) => {
    if (!controller.signal.aborted) controller.abort(error);
  };
  const prior = activeSongCardPlanRequests.get(key);
  const operation = {
    signal: controller.signal,
    abort,
    checkpoint(phase = "planning") {
      if (!controller.signal.aborted) return;
      const reason = controller.signal.reason instanceof Error
        ? controller.signal.reason
        : songCardPlanOperationError("SONG_CARD_PLAN_ABORTED", "Song Card planning was canceled.", 499);
      reason.details = { ...(reason.details || {}), phase };
      throw reason;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timeout);
      req.removeListener("aborted", onRequestAborted);
      res.removeListener("close", onResponseClose);
      if (activeSongCardPlanRequests.get(key) === operation) activeSongCardPlanRequests.delete(key);
    },
  };
  activeSongCardPlanRequests.set(key, operation);
  prior?.abort(songCardPlanOperationError(
    "SONG_CARD_PLAN_SUPERSEDED",
    "A newer request replaced this Song Card plan.",
    409,
    { requestKey: key },
  ));
  const onRequestAborted = () => abort(songCardPlanOperationError(
    "SONG_CARD_PLAN_CLIENT_DISCONNECTED",
    "The Song Card planning request was abandoned by its client.",
    499,
    { clientDisconnected: true },
  ));
  const onResponseClose = () => {
    if (!res.writableEnded) onRequestAborted();
  };
  req.once("aborted", onRequestAborted);
  res.once("close", onResponseClose);
  const timeout = setTimeout(() => abort(songCardPlanOperationError(
    "SONG_CARD_PLAN_TIMED_OUT",
    `Song Card planning exceeded its ${SONG_CARD_PLAN_TIMEOUT_MS}ms safety window.`,
    408,
    { timeoutMs: SONG_CARD_PLAN_TIMEOUT_MS },
  )), SONG_CARD_PLAN_TIMEOUT_MS);
  timeout.unref?.();
  return operation;
}

function throwIfSongCardPlanStopped(signal, phase = "planning") {
  if (!signal?.aborted) return;
  const reason = signal.reason instanceof Error
    ? signal.reason
    : songCardPlanOperationError("SONG_CARD_PLAN_ABORTED", "Song Card planning was canceled.", 499);
  reason.details = { ...(reason.details || {}), phase };
  throw reason;
}

async function yieldSongCardPlanTurn(signal) {
  // Give socket-close and safety-timer events a real timers-phase checkpoint
  // before entering the controller's CPU-heavy canonicalization work.
  await new Promise((resolve) => setTimeout(resolve, Math.min(5, SONG_CARD_PLAN_TIMEOUT_MS)));
  throwIfSongCardPlanStopped(signal, "event-loop-checkpoint");
}

function suppressSongCardPlanErrorResponse(res, error) {
  return res.destroyed
    || res.writableEnded
    || error?.code === "SONG_CARD_PLAN_CLIENT_DISCONNECTED"
    || error?.details?.clientDisconnected === true;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

function isGetOrHead(req) {
  return req.method === "GET" || req.method === "HEAD";
}

const ECHO_EDITOR_GRAPH_OMITTED_DIRECTOR_FIELDS = Object.freeze([
  "audioFallbackProfile",
  "mediaDiversityReport",
  "mediaRoleCamera",
  "rankedMediaCandidates",
  "visualizerLayers",
]);

function compactEchoDirectorShowGraph(graph) {
  if (!graph?.directorV2 || typeof graph.directorV2 !== "object") return graph;
  const compactDirector = { ...graph.directorV2 };
  for (const field of ECHO_EDITOR_GRAPH_OMITTED_DIRECTOR_FIELDS) delete compactDirector[field];
  return {
    ...graph,
    directorV2: compactDirector,
  };
}

function compactEchoDirectionScriptVariant(variant = {}, fallbackTimelineCount = 0) {
  const summary = summarizeEchoDirectionScriptVariant(variant, fallbackTimelineCount);
  return {
    ...summary,
    status: variant.status || null,
    selectionMode: variant.selectionMode || variant.selection_mode || null,
    seed: variant.seed || null,
    sourcePolicy: variant.sourcePolicy || variant.source_policy || null,
    parent: variant.parent || null,
    lineage: variant.lineage || null,
    variant_source: {
      ...(variant.variant_source || {}),
      kind: "append-only-project-variant-summary",
      nonDestructive: true,
      detailProfile: "metadata-only",
    },
  };
}

function echoDirectionVariantNotFound(safeSongId, variantId) {
  const error = new Error(`Direction cut ${variantId} was not found for ${safeSongId}.`);
  error.code = "direction_variant_not_found";
  error.statusCode = 404;
  return error;
}

async function hydrateEchoDirectorProjectPayload(payload, safeSongId, options = {}) {
  const project = payload?.music_video_project || payload;
  if (!project || typeof project !== "object") return payload;
  const sourceProfile = options.profile === "source";
  const selectedVariantId = String(options.selectedVariantId || "").trim();
  const [graphResult, indexedVariants] = await Promise.all([
    readEchoDirectorShowGraph(project, safeSongId),
    sourceProfile
      ? readEchoDirectionScriptVariants(safeSongId)
      : echoDirectionVariantSummaryIndex
        .variantsForSongs([safeSongId], readEchoDirectionScriptVariants)
        .then((result) => result.bySong.get(safeSongId) || []),
  ]);
  const embeddedVariants = Array.isArray(project.direction_script_variants)
    ? project.direction_script_variants
    : [];
  const variantCatalog = mergeEchoDirectionScriptVariants(indexedVariants, embeddedVariants);
  let directionVariants = variantCatalog;
  let deliveredVariantId = null;

  if (!sourceProfile) {
    const fallbackTimelineCount = Array.isArray(project.timeline) ? project.timeline.length : 0;
    directionVariants = variantCatalog.map((variant) => compactEchoDirectionScriptVariant(variant, fallbackTimelineCount));
    if (selectedVariantId) {
      const catalogVariant = variantCatalog.find((variant) => echoDirectionVariantId(variant) === selectedVariantId);
      const selectedVariant = Array.isArray(catalogVariant?.timeline)
        ? catalogVariant
        : await readEchoDirectionScriptVariant(safeSongId, selectedVariantId);
      const embeddedVariant = embeddedVariants.find((variant) => echoDirectionVariantId(variant) === selectedVariantId);
      const fullVariant = selectedVariant || embeddedVariant;
      if (!fullVariant) throw echoDirectionVariantNotFound(safeSongId, selectedVariantId);
      deliveredVariantId = selectedVariantId;
      directionVariants = directionVariants.map((variant) => (
        echoDirectionVariantId(variant) === selectedVariantId ? fullVariant : variant
      ));
      if (!directionVariants.some((variant) => echoDirectionVariantId(variant) === selectedVariantId)) {
        directionVariants.push(fullVariant);
      }
    }
  }

  const graph = sourceProfile ? graphResult.graph : compactEchoDirectorShowGraph(graphResult.graph);
  const detailProfile = sourceProfile ? "source-v1" : "editor-bounded-v1";
  const graphReceipt = {
    ...graphResult.receipt,
    delivery: {
      profile: detailProfile,
      selectedVariantId: deliveredVariantId,
      variantCatalogMode: sourceProfile ? "complete" : "metadata-plus-selected-cut",
      omittedDirectorV2Fields: sourceProfile ? [] : [...ECHO_EDITOR_GRAPH_OMITTED_DIRECTOR_FIELDS],
      fullSourceQuery: `/api/echos/director-project?songId=${encodeURIComponent(safeSongId)}&profile=source`,
    },
  };
  const hydratedProject = {
    ...project,
    direction_script_variants: directionVariants,
    director_detail_profile: detailProfile,
    selected_direction_script_variant_id: deliveredVariantId,
    director_show_graph: graph,
    director_show_graph_receipt: graphReceipt,
  };
  return payload?.music_video_project
    ? { ...payload, music_video_project: hydratedProject }
    : hydratedProject;
}

function echoDirectionVariantRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.direction_script_variants)) return payload.direction_script_variants;
  const candidate = payload.direction_script_variant
    || payload.music_video_project_variant
    || payload.variant
    || payload;
  return candidate && typeof candidate === "object" ? [candidate] : [];
}

function echoDirectionVariantId(variant = {}, fallback = "") {
  return domainEchoDirectionVariantId(variant) || String(fallback || "").trim();
}

function mergeEchoDirectionScriptVariants(...groups) {
  const variants = new Map();
  for (const group of groups) {
    for (const variant of Array.isArray(group) ? group : []) {
      if (!variant || typeof variant !== "object") continue;
      const id = echoDirectionVariantId(variant);
      if (!id || variants.has(id)) continue;
      variants.set(id, variant);
    }
  }
  return [...variants.values()];
}

function summarizeEchoDirectionScriptVariant(variant = {}, fallbackTimelineCount = 0) {
  const metadata = summarizeEchoDirectionVariantMetadata(variant);
  if (variant.variant_source?.indexed && !variant.fingerprint) metadata.fingerprint = null;
  const hasCutMetadata = Boolean(metadata.variationSet || metadata.cut || metadata.densityProfile || metadata.coveragePass !== null);
  const declaredTimelineCount = variant.timelineCount ?? variant.timeline_count;
  const indexedTimelineCount = declaredTimelineCount === null || declaredTimelineCount === undefined || declaredTimelineCount === ""
    ? Number.NaN
    : Number(declaredTimelineCount);
  const hasIndexedHyperframeFlag = typeof (variant.hasHyperframeScript ?? variant.has_hyperframe_script) === "boolean";
  return {
    id: echoDirectionVariantId(variant),
    title: domainEchoDirectionVariantTitle(variant),
    schemaVersion: variant.schemaVersion || variant.schema_version || null,
    createdAt: variant.createdAt || variant.created_at || null,
    timelineCount: Number.isFinite(indexedTimelineCount)
      ? Math.max(0, Math.round(indexedTimelineCount))
      : Array.isArray(variant.timeline) ? variant.timeline.length : Math.max(0, Math.round(Number(fallbackTimelineCount) || 0)),
    hasHyperframeScript: hasIndexedHyperframeFlag
      ? Boolean(variant.hasHyperframeScript ?? variant.has_hyperframe_script)
      : Boolean(variant.hyperframe_script || variant.hyperframeScript),
    nonDestructive: true,
    ...(hasCutMetadata ? metadata : {}),
  };
}

function echoDirectionForkError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function safeEchoDirectionPathSegment(value, kind) {
  const input = String(value || "").trim();
  const pattern = kind === "variant"
    ? /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
    : /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
  if (!pattern.test(input) || path.basename(input) !== input || input === "." || input === "..") {
    throw echoDirectionForkError(`invalid_${kind}_id`, `Invalid ${kind} identifier.`, 400);
  }
  return input;
}

function echoDirectionForkTelemetry(timeline = [], parentTelemetry = {}) {
  const mediaRows = timeline.filter((shot) => shot?.media_id && shot.media_id !== "none" && (shot.media_uri || shot.runtime_media_uri));
  const uniqueMedia = new Set(mediaRows.map((shot) => shot.media_technical_identity || shot.media_contract?.contentHash || shot.media_id)).size;
  return {
    ...parentTelemetry,
    replacementShots: mediaRows.length,
    uniqueMedia,
    humanEdited: true,
  };
}

async function createEchoDirectionVariantFork(body = {}) {
  if (body.schemaVersion && body.schemaVersion !== ECHO_DIRECTION_FORK_PAYLOAD_SCHEMA) {
    throw echoDirectionForkError("invalid_fork_schema", "Unsupported direction cut fork request schema.", 400);
  }
  const songId = safeEchoDirectionPathSegment(body.songId, "song");
  const parentVariantId = safeEchoDirectionPathSegment(body.parentVariantId, "variant");
  const timeline = Array.isArray(body.timeline) ? body.timeline : null;
  if (!timeline?.length) throw echoDirectionForkError("invalid_fork_timeline", "A non-empty direction timeline is required.", 400);
  const projectPath = path.resolve(DATA_DIR, "music-video-projects", `${songId}-video-project.json`);
  const projectsRoot = path.resolve(DATA_DIR, "music-video-projects");
  if (!withinDirectory(projectsRoot, projectPath) || !await access(projectPath).then(() => true).catch(() => false)) {
    throw echoDirectionForkError("project_not_found", "The source song project was not found.", 404);
  }
  const parentVariants = await readEchoDirectionScriptVariants(songId);
  const parentVariant = parentVariants.find((variant) => (
    echoDirectionVariantId(variant) === parentVariantId
      && variant.variant_source?.kind === "append-only-project-variant"
  ));
  if (!parentVariant) throw echoDirectionForkError("parent_variant_not_found", "The append-only source cut was not found.", 404);
  const parentFingerprint = echoDirectionVariantFingerprint(parentVariant);
  if (body.expectedParentFingerprint && String(body.expectedParentFingerprint) !== parentFingerprint) {
    throw echoDirectionForkError("parent_variant_changed", "The source cut changed after this working fork began.", 409);
  }

  const now = new Date().toISOString();
  const requestedId = body.requestedId ? safeEchoDirectionPathSegment(body.requestedId, "variant") : "";
  const parentSlug = parentVariantId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "direction-cut";
  const entropy = randomBytes(8).toString("hex");
  const childId = requestedId || `${parentSlug}-edit-${Date.now().toString(36)}-${entropy.slice(0, 8)}`;
  const parentMetadata = echoDirectionVariantMetadata(parentVariant);
  const editOrdinal = parentVariants.filter((variant) => variant.lineage?.parentVariantId === parentVariantId).length + 1;
  const editLabel = `Edit ${editOrdinal}`;
  const projectPatch = pickEchoDirectionVariantProjectPatch(body.projectPatch || {});
  const visualizerTimeline = Array.isArray(body.visualizerTimeline)
    ? body.visualizerTimeline
    : Array.isArray(parentVariant.visualizer_timeline)
      ? parentVariant.visualizer_timeline
      : undefined;
  const densityTelemetry = body.mediaDensityTelemetry || parentVariant.media_density_telemetry || null;
  const child = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: childId,
    title: `${String(body.title || domainEchoDirectionVariantTitle(parentVariant)).replace(/\s+/g, " ").trim()} · ${editLabel}`.slice(0, 180),
    status: "ready",
    createdAt: now,
    updatedAt: now,
    selectionMode: "human-working-fork",
    variationSet: {
      id: `${parentMetadata.variationSet?.id || "direction"}-edited-cuts`,
      label: `${parentMetadata.variationSet?.label || "Direction"} · Edited cuts`,
      parentSetId: parentMetadata.variationSet?.id || null,
    },
    cut: { ordinal: editOrdinal, label: editLabel, kind: "human-fork" },
    densityProfile: parentMetadata.densityProfile,
    coveragePass: parentMetadata.coveragePass,
    parent: {
      songId,
      projectSha256: parentVariant.parent?.projectSha256 || null,
      variantId: parentVariantId,
      variantFingerprint: parentFingerprint,
      immutableParent: true,
    },
    lineage: {
      kind: "append-only-human-fork",
      parentVariantId,
      parentVariantFingerprint: parentFingerprint,
      sourcePath: parentVariant.variant_source.path,
      createdAt: now,
      nonDestructive: true,
    },
    seed: parentVariant.seed || null,
    sourcePolicy: parentVariant.sourcePolicy || null,
    timeline,
    ...(visualizerTimeline ? { visualizer_timeline: visualizerTimeline } : {}),
    ...(densityTelemetry ? { media_density_telemetry: densityTelemetry } : {}),
    ...(Object.keys(projectPatch).length ? { project_patch: projectPatch } : {}),
    hyperframe_script: String(body.hyperframeScript || ""),
    telemetry: echoDirectionForkTelemetry(timeline, parentVariant.telemetry || {}),
    preservation: {
      sourceVariantUnchanged: true,
      legacyProjectUnchanged: true,
      parentVariantId,
    },
  };
  child.fingerprint = `sha256:${createHash("sha256").update(JSON.stringify(child)).digest("hex")}`;

  const variantsRoot = path.resolve(ECHO_DIRECTION_VARIANTS_DIR);
  const songDirectory = path.resolve(variantsRoot, songId);
  const childPath = path.resolve(songDirectory, `${childId}.json`);
  if (!withinDirectory(variantsRoot, songDirectory) || !withinDirectory(songDirectory, childPath)) {
    throw echoDirectionForkError("direction_variant_path_rejected", "Direction cut path escaped the variant store.", 400);
  }
  await mkdir(songDirectory, { recursive: true });
  try {
    await writeFile(childPath, `${JSON.stringify(child, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") throw echoDirectionForkError("direction_variant_conflict", "A direction cut with that identifier already exists.", 409);
    throw error;
  }
  echoDirectionVariantSummaryIndex.invalidate(songId);
  return {
    success: true,
    variant: summarizeEchoDirectionScriptVariant(child),
    lineage: child.lineage,
  };
}

async function readEchoDirectionScriptVariants(safeSongId) {
  const variantsRoot = path.resolve(ECHO_DIRECTION_VARIANTS_DIR);
  const songDir = path.resolve(variantsRoot, path.basename(String(safeSongId || "")));
  if (!withinDirectory(variantsRoot, songDir)) return [];
  let entries;
  try {
    entries = await readdir(songDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    console.warn(`Failed to read Echo direction variants for ${safeSongId}:`, error);
    return [];
  }

  const variants = [];
  for (const entry of entries.filter((row) => row.isFile() && row.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.resolve(songDir, entry.name);
    if (!withinDirectory(songDir, filePath)) continue;
    try {
      const payload = await readJson(filePath);
      const fallbackId = entry.name.replace(/\.json$/u, "");
      for (const [index, row] of echoDirectionVariantRows(payload).entries()) {
        const id = echoDirectionVariantId(row, `${fallbackId}${index ? `-${index + 1}` : ""}`);
        variants.push({
          ...row,
          id,
          variant_source: {
            kind: "append-only-project-variant",
            path: path.relative(ROOT, filePath),
            nonDestructive: true
          }
        });
      }
    } catch (error) {
      console.warn(`Skipping invalid Echo direction variant ${entry.name}:`, error);
    }
  }
  return mergeEchoDirectionScriptVariants(variants);
}

async function readEchoDirectionScriptVariant(safeSongId, requestedVariantId) {
  const variantsRoot = path.resolve(ECHO_DIRECTION_VARIANTS_DIR);
  const songDir = path.resolve(variantsRoot, path.basename(String(safeSongId || "")));
  if (!withinDirectory(variantsRoot, songDir)) return null;
  let entries;
  try {
    entries = await readdir(songDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn(`Failed to read Echo direction variant ${requestedVariantId} for ${safeSongId}:`, error);
    return null;
  }

  const variantId = String(requestedVariantId || "").trim();
  const candidates = entries
    .filter((row) => row.isFile() && row.name.endsWith(".json"))
    .sort((left, right) => {
      const leftExact = left.name.replace(/\.json$/u, "") === variantId ? 0 : 1;
      const rightExact = right.name.replace(/\.json$/u, "") === variantId ? 0 : 1;
      return leftExact - rightExact || left.name.localeCompare(right.name);
    });
  for (const entry of candidates) {
    const filePath = path.resolve(songDir, entry.name);
    if (!withinDirectory(songDir, filePath)) continue;
    try {
      const payload = await readJson(filePath);
      const fallbackId = entry.name.replace(/\.json$/u, "");
      for (const [index, row] of echoDirectionVariantRows(payload).entries()) {
        const id = echoDirectionVariantId(row, `${fallbackId}${index ? `-${index + 1}` : ""}`);
        if (id !== variantId) continue;
        return {
          ...row,
          id,
          variant_source: {
            kind: "append-only-project-variant",
            path: path.relative(ROOT, filePath),
            nonDestructive: true,
          },
        };
      }
    } catch (error) {
      console.warn(`Skipping invalid Echo direction variant ${entry.name}:`, error);
    }
  }
  return null;
}

async function readEchoDirectorShowGraph(project, safeSongId) {
  const albumRoot = path.resolve(ECHO_DIRECTOR_V2_ALBUM_DIR);
  const graphPath = path.resolve(albumRoot, path.basename(safeSongId), "native-show-graph.json");
  const sourcePath = path.relative(ROOT, graphPath);
  const receiptBase = {
    schemaVersion: "hapa.echo.director-show-graph-receipt.v1",
    source: "compiled-director-v2-album",
    sourcePath,
    projectSongId: project.song_id || safeSongId
  };
  if (!withinDirectory(albumRoot, graphPath)) {
    return {
      graph: null,
      receipt: { ...receiptBase, status: "invalid", reason: "compiled_graph_path_outside_album_root" }
    };
  }

  let cached;
  try {
    const fileStat = await stat(graphPath);
    const signature = `${fileStat.size}:${fileStat.mtimeMs}`;
    cached = echoDirectorShowGraphCache.get(graphPath);
    if (!cached || cached.signature !== signature) {
      const bytes = await readFile(graphPath);
      cached = {
        signature,
        sourceBytes: bytes.byteLength,
        sourceHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        graph: JSON.parse(bytes.toString("utf8"))
      };
      echoDirectorShowGraphCache.set(graphPath, cached);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        graph: null,
        receipt: { ...receiptBase, status: "missing", reason: "compiled_graph_not_found" }
      };
    }
    return {
      graph: null,
      receipt: {
        ...receiptBase,
        status: "invalid",
        reason: "compiled_graph_read_failed",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }

  const graph = cached.graph;
  const graphSongId = String(graph?.song?.id || "").trim();
  const expectedSongIds = new Set([
    project.song_id,
    project.audio_id,
    project.registry_track_id
  ].map((value) => String(value || "").trim()).filter(Boolean));
  const visualizerTrack = (graph?.tracks || []).find((track) => track?.role === "visualizer" || track?.id === "track-b");
  const reasons = [];
  if (graph?.schemaVersion !== "hapa.music-viz.native-show-graph.v2") reasons.push("unexpected_graph_schema");
  if (!graphSongId || !expectedSongIds.has(graphSongId)) reasons.push("graph_song_identity_mismatch");
  if (!visualizerTrack || !Array.isArray(visualizerTrack.cards)) reasons.push("visualizer_track_missing");
  if (!graph?.directorV2?.variantId || !graph?.directorV2?.variantHash) reasons.push("director_variant_identity_missing");
  const receipt = {
    ...receiptBase,
    status: reasons.length ? "invalid" : "ready",
    graphSchemaVersion: graph?.schemaVersion || null,
    graphSongId: graphSongId || null,
    variantId: graph?.directorV2?.variantId || null,
    variantHash: graph?.directorV2?.variantHash || null,
    sourceHash: cached.sourceHash,
    sourceBytes: cached.sourceBytes,
    visualizerCards: Array.isArray(visualizerTrack?.cards) ? visualizerTrack.cards.length : 0,
    ...(reasons.length ? { reason: "compiled_graph_validation_failed", reasons } : {})
  };
  return { graph: reasons.length ? null : graph, receipt };
}

function withinDirectory(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function processOpenFileCount() {
  for (const candidate of ["/dev/fd", "/proc/self/fd"]) {
    try {
      return fs.readdirSync(candidate).length;
    } catch {
      // Try the next platform-specific file descriptor directory.
    }
  }
  return null;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range, Authorization, Idempotency-Key, If-Match, If-Range");
  return true;
}

function loopbackAddress(value = "") {
  const address = String(value || "").toLowerCase();
  return address === "::1" || address === "localhost" || /^127(?:\.\d{1,3}){3}$/.test(address) || /^::ffff:127(?:\.\d{1,3}){3}$/.test(address);
}

function localUiRequestOrigin(req) {
  const source = String(req.headers.origin || req.headers.referer || "").trim();
  if (!source) return "";
  try { return new URL(source).origin; } catch { return ""; }
}

function trustedLocalUiRequestContext(req, { bootstrap = false } = {}) {
  if (!LOCAL_UI_SESSION_ENABLED || !loopbackAddress(req.socket?.remoteAddress)) return false;
  const origin = localUiRequestOrigin(req);
  if (bootstrap && !origin) return false;
  if (origin) {
    let hostname = "";
    try { hostname = new URL(origin).hostname; } catch { return false; }
    if (!loopbackAddress(hostname) || !ALLOWED_ORIGINS.has(origin)) return false;
  }
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;
  return true;
}

function requestCookie(req, name) {
  for (const pair of String(req.headers.cookie || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return "";
}

function timingSafeTextEqual(left, right) {
  const leftBytes = Buffer.from(String(left || ""));
  const rightBytes = Buffer.from(String(right || ""));
  return leftBytes.length > 0 && leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function hasTrustedLocalUiSession(req) {
  return trustedLocalUiRequestContext(req) && timingSafeTextEqual(requestCookie(req, LOCAL_UI_SESSION_COOKIE), LOCAL_UI_SESSION_TOKEN);
}

function localUiSessionCookie(req) {
  return `${LOCAL_UI_SESSION_COOKIE}=${LOCAL_UI_SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict${req.socket?.encrypted ? "; Secure" : ""}`;
}

function requireAdmin(req, res) {
  const authorization = String(req.headers.authorization || "");
  if (AVATAR_ADMIN_TOKEN && timingSafeTextEqual(authorization, `Bearer ${AVATAR_ADMIN_TOKEN}`)) return true;
  if (hasTrustedLocalUiSession(req)) return true;
  if (!AVATAR_ADMIN_TOKEN) { sendJson(res, 503, { error: "admin_auth_not_configured", failClosed: true }); return false; }
  sendJson(res, 401, { error: "unauthorized" });
  return false;
}

function issueSongCardArtifactTicket(songId, edition, role, now = Date.now()) {
  if (!SONG_CARD_ARTIFACT_SIGNING_KEY) throw Object.assign(new Error("Artifact ticket auth is not configured."), { code: "admin_auth_not_configured", statusCode: 503 });
  const payload = Buffer.from(JSON.stringify({ songId: String(songId), edition: Number(edition), role: String(role), expiresAt: now + 15 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", SONG_CARD_ARTIFACT_SIGNING_KEY).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validSongCardArtifactTicket(ticket, songId, edition, role, now = Date.now()) {
  if (!SONG_CARD_ARTIFACT_SIGNING_KEY || typeof ticket !== "string") return false;
  const [payload, suppliedSignature, extra] = ticket.split(".");
  if (!payload || !suppliedSignature || extra !== undefined) return false;
  const expectedSignature = createHmac("sha256", SONG_CARD_ARTIFACT_SIGNING_KEY).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(suppliedSignature, "base64url"); } catch { return false; }
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) return false;
  let value;
  try { value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return false; }
  return value.songId === String(songId) && Number(value.edition) === Number(edition) && value.role === String(role) && Number(value.expiresAt) > now;
}

function authorizeSongCardArtifact(req, res, url, songId, edition, role) {
  if (AVATAR_ADMIN_TOKEN && timingSafeTextEqual(req.headers.authorization, `Bearer ${AVATAR_ADMIN_TOKEN}`)) return true;
  if (hasTrustedLocalUiSession(req)) return true;
  if (validSongCardArtifactTicket(url.searchParams.get("ticket"), songId, edition, role)) return true;
  const authConfigured = Boolean(AVATAR_ADMIN_TOKEN || LOCAL_UI_SESSION_ENABLED);
  sendJson(res, authConfigured ? 401 : 503, { error: authConfigured ? "unauthorized" : "admin_auth_not_configured", failClosed: true });
  return false;
}

function sendSongCardMintError(res, error) {
  const code = String(error?.code || "song_card_mint_failed");
  const notFound = /NOT_FOUND|not_found/i.test(code);
  const conflict = /CONFLICT|MISMATCH|STALE|BLOCKED|EXISTS|CHANGED|HASH/i.test(code);
  const status = Number(error?.statusCode || (notFound ? 404 : conflict ? 409 : error instanceof MintLedgerError ? 400 : 500));
  sendJson(res, status, {
    error: code.toLowerCase(),
    message: error instanceof Error ? error.message : String(error),
    ...(error?.details && typeof error.details === "object" ? { details: error.details } : {}),
    failClosed: true,
  });
}

function parseSongCardRange(header, size) {
  if (!header) return null;
  const match = /^bytes=([^,]+)$/i.exec(String(header).trim());
  if (!match) return { invalid: true };
  const [startText, endText] = match[1].split("-");
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) return { invalid: true };
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
}

async function serveSongCardEditionArtifact(req, res, artifact) {
  const etag = `"sha256-${artifact.sha256}"`;
  if (String(req.headers["if-none-match"] || "") === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" });
    res.end();
    return;
  }
  const ifRange = String(req.headers["if-range"] || "");
  const range = ifRange && ifRange !== etag ? null : parseSongCardRange(req.headers.range, artifact.size);
  if (range?.invalid) {
    res.writeHead(416, { "Content-Range": `bytes */${artifact.size}`, "Accept-Ranges": "bytes", ETag: etag });
    res.end();
    return;
  }
  const headers = {
    "Content-Type": artifact.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${artifact.role === "master" ? "master.mp4" : artifact.role}"`,
    ETag: etag,
    "X-Hapa-Artifact-SHA256": artifact.sha256,
  };
  if (range) {
    headers["Content-Length"] = range.end - range.start + 1;
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${artifact.size}`;
    res.writeHead(206, headers);
  } else {
    headers["Content-Length"] = artifact.size;
    res.writeHead(200, headers);
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = artifact.openReadStream(range ? { start: range.start, end: range.end } : {});
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

async function ensureLocalHttpsCredentials() {
  await mkdir(HTTPS_CERT_DIR, { recursive: true });
  const lanAddresses = localLanIPv4Addresses();
  const desiredSans = [...new Set(["DNS:localhost", "IP:127.0.0.1", "IP:::1", ...lanAddresses.map((address) => `IP:${address}`)])];
  const existingMeta = await readOptionalJson(HTTPS_META_PATH);
  const hasFreshCerts = existingMeta?.kind === "hapa-phone-bridge-local-ca" &&
    Array.isArray(existingMeta.sans) &&
    desiredSans.every((name) => existingMeta.sans.includes(name)) &&
    await fileExists(HTTPS_CA_CERT_PATH) &&
    await fileExists(HTTPS_CA_KEY_PATH) &&
    await fileExists(HTTPS_CERT_PATH) &&
    await fileExists(HTTPS_KEY_PATH);

  if (!hasFreshCerts) {
    await generateLocalHttpsCertificates(desiredSans);
  }

  return {
    key: await readFile(HTTPS_KEY_PATH),
    cert: await readFile(HTTPS_CERT_PATH),
    ca: await readFile(HTTPS_CA_CERT_PATH)
  };
}

async function generateLocalHttpsCertificates(sans) {
  await rm(HTTPS_CA_KEY_PATH, { force: true });
  await rm(HTTPS_CA_CERT_PATH, { force: true });
  await rm(HTTPS_KEY_PATH, { force: true });
  await rm(HTTPS_CERT_PATH, { force: true });
  await rm(path.join(HTTPS_CERT_DIR, "hapa-phone-bridge.csr"), { force: true });
  await rm(path.join(HTTPS_CERT_DIR, "hapa-phone-bridge-ca.srl"), { force: true });

  const csrPath = path.join(HTTPS_CERT_DIR, "hapa-phone-bridge.csr");
  const opensslConfigPath = path.join(HTTPS_CERT_DIR, "hapa-phone-bridge-openssl.cnf");
  await writeFile(opensslConfigPath, localHttpsOpenSslConfig(sans), "utf8");

  await execFileAsync(HTTPS_OPENSSL_BIN, [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "825",
    "-subj",
    "/CN=Hapa Avatar Builder Local CA",
    "-keyout",
    HTTPS_CA_KEY_PATH,
    "-out",
    HTTPS_CA_CERT_PATH
  ]);

  await execFileAsync(HTTPS_OPENSSL_BIN, [
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    HTTPS_KEY_PATH,
    "-out",
    csrPath,
    "-config",
    opensslConfigPath
  ]);

  await execFileAsync(HTTPS_OPENSSL_BIN, [
    "x509",
    "-req",
    "-in",
    csrPath,
    "-CA",
    HTTPS_CA_CERT_PATH,
    "-CAkey",
    HTTPS_CA_KEY_PATH,
    "-CAcreateserial",
    "-out",
    HTTPS_CERT_PATH,
    "-days",
    "825",
    "-sha256",
    "-extfile",
    opensslConfigPath,
    "-extensions",
    "v3_req"
  ]);

  await writeFile(HTTPS_META_PATH, `${JSON.stringify({
    kind: "hapa-phone-bridge-local-ca",
    generatedAt: new Date().toISOString(),
    sans,
    caCertificatePath: HTTPS_CA_CERT_PATH,
    serverCertificatePath: HTTPS_CERT_PATH
  }, null, 2)}\n`, "utf8");
}

function localHttpsOpenSslConfig(sans) {
  const altNames = sans.map((name, index) => {
    const [kind, value] = name.split(/:(.*)/s);
    return `${kind}.${index + 1} = ${value}`;
  }).join("\n");
  return `[req]
prompt = no
distinguished_name = dn
req_extensions = v3_req

[dn]
CN = Hapa Avatar Builder Phone Bridge

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${altNames}
`;
}

async function servePhoneBridgeCaCertificate(res) {
  try {
    const certificate = await readFile(HTTPS_CA_CERT_PATH);
    res.writeHead(200, {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": "attachment; filename=\"hapa-phone-bridge-ca.crt\"",
      "Cache-Control": "no-store"
    });
    res.end(certificate);
  } catch {
    sendJson(res, 404, {
      error: "phone_bridge_ca_not_ready",
      message: httpsBridgeStartupError || "The local HTTPS certificate has not been generated yet."
    });
  }
}

function phoneBridgeInfo(req, url) {
  cleanupPhoneBridgeSessions();
  const session = safePhoneBridgeSessionId(url.searchParams.get("session") || "");
  const record = ensurePhoneBridgeSession(session);
  const origin = publicPhoneBridgeOrigin(req);
  const mobileUrl = `${origin}/phone-card?session=${encodeURIComponent(record.id)}`;
  const certificateUrl = publicPhoneBridgeCertificateUrl(req);
  const eventsUrl = `${origin}/api/phone-bridge/events`;
  const infoUrl = `${origin}/api/phone-bridge/info?session=${encodeURIComponent(record.id)}`;
  return {
    ok: true,
    session: record.id,
    mobileUrl,
    origin,
    certificateUrl,
    iceServers: phoneBridgeIceServers(),
    signal: {
      eventsUrl,
      infoUrl
    },
    httpsEnabled: httpsBridgeActive,
    httpsPort: httpsBridgeActive ? httpsPort : null,
    secureContextLikely: mobileUrl.startsWith("https://") || /^(http:\/\/(localhost|127\.0\.0\.1|\[::1\]))/.test(mobileUrl),
    notes: [
      httpsBridgeActive
        ? "Phone camera and mic use the secure HTTPS phone bridge."
        : "Phone camera and mic usually require HTTPS on mobile browsers.",
      "If the phone warns that the certificate is not trusted, install and trust the Hapa local CA certificate from certificateUrl."
    ],
    expiresAt: new Date(record.createdAt + PHONE_BRIDGE_SESSION_TTL_MS).toISOString()
  };
}

async function createPhoneBridgeInvite(req, url, body = {}) {
  cleanupPhoneBridgeSessions();
  const session = safePhoneBridgeSessionId(body.session || "") || randomPhoneBridgeSessionId("scene");
  const record = ensurePhoneBridgeSession(session);
  const origin = publicPhoneBridgeOrigin(req);
  const desktopOrigin = requestPhoneBridgeOrigin(req);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(record.createdAt + PHONE_BRIDGE_SESSION_TTL_MS).toISOString();
  const inviteId = safePhoneBridgeInviteId(body.inviteId || "") || randomPhoneBridgeInviteId();
  const cardId = safePhoneBridgeInviteId(body.cardId || "") || `webcam-card-${inviteId}`;
  const inviteBaseUrl = `${origin}/api/phone-bridge/invites/${encodeURIComponent(inviteId)}`;
  const htmlUrl = `${inviteBaseUrl}.html`;
  const jsonUrl = `${inviteBaseUrl}.json`;
  const roomletInviteUrl = `${inviteBaseUrl}.hapa-room`;
  const roomletControlUrl = `${inviteBaseUrl}/roomlet-controls`;
  const desktopInviteBaseUrl = `${desktopOrigin}/api/phone-bridge/invites/${encodeURIComponent(inviteId)}`;
  const desktopHtmlUrl = `${desktopInviteBaseUrl}.html`;
  const desktopJsonUrl = `${desktopInviteBaseUrl}.json`;
  const desktopRoomletInviteUrl = `${desktopInviteBaseUrl}.hapa-room`;
  const desktopRoomletControlUrl = `${desktopInviteBaseUrl}/roomlet-controls`;
  const certificateUrl = publicPhoneBridgeCertificateUrl(req);
  const sceneSnapshot = body.sceneSnapshot && typeof body.sceneSnapshot === "object" ? body.sceneSnapshot : null;
  const title = cleanPhoneBridgeInviteTitle(body.title || "Scene Webcam Invitation");
  const avatarName = cleanPhoneBridgeInviteTitle(body.avatarName || sceneSnapshot?.avatarName || "Hapa");
  const iceServers = phoneBridgeIceServers();
  const roomletRoomView = sceneSnapshot?.roomletRoomView || sceneSnapshot?.roomletParticipants || null;
  const roomletNetwork = body.roomletNetwork && typeof body.roomletNetwork === "object"
    ? body.roomletNetwork
    : body.network && typeof body.network === "object"
      ? body.network
      : null;
  const roomletIceToken = body.roomletIceToken && typeof body.roomletIceToken === "object"
    ? body.roomletIceToken
    : body.iceToken && typeof body.iceToken === "object"
      ? body.iceToken
      : null;
  const roomletParticipantCards = buildRoomletParticipantCards(roomletRoomView || [], { inviteId });
  const roomlet = await createRoomletTarotInvite({
    dataDir: DATA_DIR,
    inviteDir: PHONE_BRIDGE_INVITE_DIR,
    sceneDir: path.join(DATA_DIR, "roomlet-scenes"),
    inviteId,
    cardId,
    title,
    avatarName,
    sceneSnapshot,
    roomletRoomView,
    iceServers,
    iceToken: roomletIceToken,
    network: roomletNetwork,
    expiresAt,
    hostBridge: {
      type: "hapa.avatar-builder.roomlet-phone-bridge.v1",
      session: record.id,
      inviteId,
      cardId,
      target: "desktop",
      eventsUrl: `${origin}/api/phone-bridge/events`,
      desktopEventsUrl: `${desktopOrigin}/api/phone-bridge/events`
    }
  });
  const card = {
    id: cardId,
    title: "Invitation Created",
    subtitle: `${title}; waiting for camera`,
    summary: "A live camera invitation card has been linked to the current Tarot Draw scene and is waiting for a phone or webcam to join.",
    archetype: "Remote Lens",
    tarotNumber: "CAM",
    cardType: "webcam_card",
    sourceKind: "webcam-invite",
    kind: "webcam-invite",
    liveCamera: true,
    invitationStatus: "invitation-created",
    tags: ["webcam-card", "phone-card", "scene-invite", "hypercore", "webrtc", "invitation-created"],
    keywords: ["camera", "scene", "invite", "hypercore", "webrtc"],
    lineage: {
      source: "tarot-draw-scene-invite",
      inviteId,
      session,
      sceneSnapshotId: sceneSnapshot?.id || "",
      createdAt
    }
  };
  const invite = {
    schemaVersion: "hapa.phone-bridge.scene-invite.v1",
    id: inviteId,
    status: "invitation-created",
    title,
    avatarName,
    session: record.id,
    cardId,
    createdAt,
    expiresAt,
    hypercore: {
      protocol: "hypercore",
      namespace: "hapa.roomlet.tarot.scene.v1",
      appendOnly: true,
      key: roomlet.sceneCoreKey,
      discoveryKey: roomlet.discoveryKey,
      topic: roomlet.roomTopic,
      roomId: roomlet.invite.roomId,
      inviteType: "hapa.room.invite",
      inviteUrl: roomletInviteUrl,
      desktopInviteUrl: desktopRoomletInviteUrl,
      localInvitePath: roomlet.invitePath
    },
    webrtc: {
      session: record.id,
      eventsUrl: `${origin}/api/phone-bridge/events`,
      infoUrl: `${origin}/api/phone-bridge/info?session=${encodeURIComponent(record.id)}`,
      iceServers,
      secureContextLikely: origin.startsWith("https://") || /^(http:\/\/(localhost|127\.0\.0\.1|\[::1\]))/.test(origin),
      signaling: "hapa-phone-bridge-events"
    },
    links: {
      htmlUrl,
      jsonUrl,
      roomletInviteUrl,
      roomletControlUrl,
      desktopHtmlUrl,
      desktopJsonUrl,
      desktopRoomletInviteUrl,
      desktopRoomletControlUrl,
      phoneCardUrl: `${origin}/phone-card?session=${encodeURIComponent(record.id)}&invite=${encodeURIComponent(inviteId)}&card=${encodeURIComponent(cardId)}`,
      desktopPhoneCardUrl: `${desktopOrigin}/phone-card?session=${encodeURIComponent(record.id)}&invite=${encodeURIComponent(inviteId)}&card=${encodeURIComponent(cardId)}`,
      certificateUrl
    },
    roomlet: {
      invite: roomlet.invite,
      localInvitePath: roomlet.invitePath,
      hostStorageDir: roomlet.hostStorageDir,
      sceneCoreKey: roomlet.sceneCoreKey,
      discoveryKey: roomlet.discoveryKey,
      roomTopic: roomlet.roomTopic,
      participantCards: roomletParticipantCards,
      hostControls: {
        actions: ROOMLET_HOST_CONTROL_ACTIONS,
        permissions: ["room.host.control"],
        controlUrl: roomletControlUrl,
        desktopControlUrl: desktopRoomletControlUrl
      }
    },
    sceneSnapshot,
    card
  };
  invite.integrity = {
    algorithm: "sha256",
    digest: createHash("sha256").update(JSON.stringify(invite)).digest("hex")
  };
  await mkdir(PHONE_BRIDGE_INVITE_DIR, { recursive: true });
  const jsonPath = path.join(PHONE_BRIDGE_INVITE_DIR, `${inviteId}.json`);
  const htmlPath = path.join(PHONE_BRIDGE_INVITE_DIR, `${inviteId}.html`);
  await writeFile(jsonPath, `${JSON.stringify(invite, null, 2)}\n`, "utf8");
  await writeFile(htmlPath, renderPhoneBridgeInviteHtml(invite), "utf8");
  return {
    ok: true,
    invite,
    htmlUrl,
    jsonUrl,
    roomletInviteUrl,
    localHtmlPath: htmlPath,
    localJsonPath: jsonPath,
    localRoomletInvitePath: roomlet.invitePath
  };
}

async function servePhoneBridgeInviteFile(req, res, inviteId = "", ext = "") {
  const safeId = safePhoneBridgeInviteId(inviteId);
  if (!safeId || !["html", "json", "hapa-room"].includes(ext)) {
    sendJson(res, 404, { error: "phone_bridge_invite_not_found" });
    return false;
  }
  const filePath = path.join(PHONE_BRIDGE_INVITE_DIR, `${safeId}.${ext}`);
  return serveLocalFile(filePath, req, res);
}

function roomletHostControlPath(inviteId = "") {
  return path.join(PHONE_BRIDGE_INVITE_DIR, `${safePhoneBridgeInviteId(inviteId)}.roomlet-controls.ndjson`);
}

async function readRoomletHostControls(inviteId = "") {
  const safeId = safePhoneBridgeInviteId(inviteId);
  if (!safeId) return { ok: false, error: "phone_bridge_invite_not_found", controls: [] };
  const controlPath = roomletHostControlPath(safeId);
  try {
    const lines = (await readFile(controlPath, "utf8")).split(/\r?\n/).filter(Boolean);
    return {
      ok: true,
      inviteId: safeId,
      controls: lines.map((line) => JSON.parse(line))
    };
  } catch {
    return { ok: true, inviteId: safeId, controls: [] };
  }
}

async function appendRoomletHostControl(inviteId = "", body = {}) {
  const safeId = safePhoneBridgeInviteId(inviteId);
  if (!safeId) {
    const error = new Error("Phone bridge invite id is required.");
    error.code = "ENOENT";
    throw error;
  }
  const invite = await readOptionalJson(path.join(PHONE_BRIDGE_INVITE_DIR, `${safeId}.json`));
  if (!invite) {
    const error = new Error("Phone bridge invite not found.");
    error.code = "ENOENT";
    throw error;
  }
  const control = buildRoomletHostControlEvent({
    inviteId: safeId,
    roomId: invite.roomlet?.invite?.roomId || invite.hypercore?.roomId || "",
    participantCoreKey: body.participantCoreKey || body.participant_core_key || "",
    action: body.action,
    reason: body.reason || "tarot-host-control",
    actorRole: "host",
    actorPermissions: ["room.host.control"]
  });
  await mkdir(PHONE_BRIDGE_INVITE_DIR, { recursive: true });
  await appendFile(roomletHostControlPath(safeId), `${JSON.stringify(control)}\n`, "utf8");
  return {
    ok: true,
    inviteId: safeId,
    control,
    controlsUrl: `${safeId}/roomlet-controls`
  };
}

function phoneBridgeIceServers() {
  const fromJson = parsePhoneBridgeIceServers(process.env.HAPA_WEBRTC_ICE_SERVERS || "");
  if (fromJson.length) return fromJson;
  const turnUrl = String(process.env.HAPA_WEBRTC_TURN_URL || "").trim();
  if (turnUrl) {
    const server = { urls: splitPhoneBridgeIceUrls(turnUrl) };
    const username = String(process.env.HAPA_WEBRTC_TURN_USERNAME || "").trim();
    const credential = String(process.env.HAPA_WEBRTC_TURN_CREDENTIAL || "").trim();
    if (username) server.username = username;
    if (credential) server.credential = credential;
    return [server, ...DEFAULT_WEBRTC_ICE_SERVERS];
  }
  return DEFAULT_WEBRTC_ICE_SERVERS;
}

function parsePhoneBridgeIceServers(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return normalizePhoneBridgeIceServers(parsed);
    if (parsed && typeof parsed === "object") return normalizePhoneBridgeIceServers([parsed]);
  } catch {
    // Fall through to comma/semicolon parsing.
  }
  return normalizePhoneBridgeIceServers(splitPhoneBridgeIceUrls(text).map((urls) => ({ urls })));
}

function normalizePhoneBridgeIceServers(items = []) {
  return items
    .map((item) => {
      if (typeof item === "string") item = { urls: splitPhoneBridgeIceUrls(item) };
      if (!item || typeof item !== "object") return null;
      const urls = Array.isArray(item.urls) ? item.urls : splitPhoneBridgeIceUrls(item.urls || "");
      const cleanUrls = urls
        .map((value) => String(value || "").trim())
        .filter((value) => /^(stun|turn|turns):/i.test(value))
        .slice(0, 8);
      if (!cleanUrls.length) return null;
      const server = { urls: cleanUrls };
      if (item.username) server.username = String(item.username).slice(0, 200);
      if (item.credential) server.credential = String(item.credential).slice(0, 500);
      return server;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function splitPhoneBridgeIceUrls(raw = "") {
  if (Array.isArray(raw)) return raw;
  return String(raw || "")
    .split(/[;,]\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function randomPhoneBridgeInviteId() {
  return `scene-invite-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function safePhoneBridgeInviteId(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 96);
}

function cleanPhoneBridgeInviteTitle(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function escapePhoneBridgeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPhoneBridgeInviteHtml(invite = {}) {
  const inviteJson = JSON.stringify(invite).replace(/</g, "\\u003c");
  const title = escapePhoneBridgeHtml(invite.title || "Hapa Camera Invitation");
  const cardId = escapePhoneBridgeHtml(invite.cardId || "");
  const topic = escapePhoneBridgeHtml(invite.hypercore?.topic || "");
  const phoneCardUrl = escapePhoneBridgeHtml(invite.links?.phoneCardUrl || "");
  const inviteFileBase = `./${encodeURIComponent(invite.id || "hapa-room")}`;
  const jsonUrl = `${inviteFileBase}.json`;
  const roomletInviteUrl = `${inviteFileBase}.hapa-room`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; --cyan: #00f3ff; --gold: #f6c96d; --ink: #ecfbff; --muted: #9fb5c9; --line: rgba(0, 243, 255, 0.28); }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 22px; color: var(--ink); background: radial-gradient(circle at 24% 14%, rgba(0, 243, 255, 0.16), transparent 28%), radial-gradient(circle at 82% 22%, rgba(246, 201, 109, 0.12), transparent 30%), #020814; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(920px, 100%); display: grid; gap: 16px; }
    section { border: 1px solid var(--line); background: linear-gradient(180deg, rgba(7, 21, 35, 0.92), rgba(3, 9, 20, 0.88)); box-shadow: 0 0 34px rgba(0, 243, 255, 0.12); padding: 18px; clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px); }
    h1 { margin: 0; font-size: clamp(28px, 8vw, 64px); line-height: 0.92; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.5; }
    video { width: 100%; max-height: 58svh; border: 1px solid rgba(246, 201, 109, 0.32); background: #000; object-fit: contain; }
    button, a.button { appearance: none; border: 1px solid var(--line); background: rgba(0, 243, 255, 0.12); color: var(--ink); display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; text-decoration: none; font: 800 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; }
    button:hover, a.button:hover { border-color: var(--cyan); color: var(--cyan); }
    button[disabled] { opacity: 0.55; cursor: wait; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .meta span { display: grid; gap: 4px; border: 1px solid rgba(255,255,255,0.09); padding: 10px; background: rgba(2, 8, 18, 0.68); overflow-wrap: anywhere; }
    .meta strong { color: var(--gold); font: 800 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    #status { color: var(--cyan); font: 800 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; }
    #error { color: #ff7f9b; font-size: 13px; min-height: 1.2em; }
  </style>
</head>
<body>
  <main>
    <section>
      <p id="status">Invitation Created</p>
      <h1>${title}</h1>
      <p>This camera invite is linked to the current Hapa Tarot Draw scene. Start the camera here, or open the full Phone Card controller for flight controls.</p>
    </section>
    <section>
      <video id="preview" playsinline autoplay muted></video>
      <div class="actions">
        <button id="join" type="button">Join With Camera</button>
        <button id="stop" type="button" disabled>Stop Camera</button>
        <a id="phone-card-link" class="button" href="${phoneCardUrl}">Open Phone Card</a>
        <a class="button" href="${jsonUrl}" download="${escapePhoneBridgeHtml(invite.id || "scene-invite")}.json">Invite JSON</a>
        <a class="button" href="${roomletInviteUrl}" download="${escapePhoneBridgeHtml(invite.id || "hapa-room")}.hapa-room">Roomlet Invite</a>
      </div>
      <p id="error"></p>
    </section>
    <section class="meta">
      <span><strong>Card</strong>${cardId}</span>
      <span><strong>Session</strong>${escapePhoneBridgeHtml(invite.session || "")}</span>
      <span><strong>Hypercore Topic</strong>${topic}</span>
      <span><strong>Status</strong>Waiting for camera until a peer joins</span>
    </section>
  </main>
  <script>
    const invite = ${inviteJson};
    const els = {
      status: document.getElementById("status"),
      error: document.getElementById("error"),
      preview: document.getElementById("preview"),
      join: document.getElementById("join"),
      stop: document.getElementById("stop"),
      phoneCardLink: document.getElementById("phone-card-link")
    };
    let pc = null;
    let stream = null;
    let since = 0;
    let pollTimer = 0;
    function setStatus(text) { els.status.textContent = text || "Invitation Created"; }
    function setError(text) { els.error.textContent = text || ""; }
    if (els.phoneCardLink && invite.links.desktopPhoneCardUrl && /^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname)) {
      els.phoneCardLink.href = invite.links.desktopPhoneCardUrl;
    }
    function postEvent(target, type, payload = {}) {
      return fetch(invite.webrtc.eventsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: invite.session, from: "mobile", target, type, payload })
      }).then((response) => response.json().catch(() => null));
    }
    async function pollDesktop() {
      try {
        const url = new URL(invite.webrtc.eventsUrl);
        url.searchParams.set("session", invite.session);
        url.searchParams.set("target", "mobile");
        url.searchParams.set("since", String(since));
        const response = await fetch(url.href);
        const payload = await response.json();
        if (payload && payload.nextSeq) since = Math.max(since, Number(payload.nextSeq) || 0);
        for (const event of (payload && payload.events) || []) {
          if (event.type === "answer" && event.payload && event.payload.sdp && pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(event.payload));
            setStatus("Camera Linked");
          } else if (event.type === "candidate" && event.payload && event.payload.candidate && pc) {
            await pc.addIceCandidate(new RTCIceCandidate(event.payload)).catch(() => {});
          }
        }
      } catch {
        setStatus(pc ? "Pairing" : "Invitation Created");
      } finally {
        pollTimer = window.setTimeout(pollDesktop, 460);
      }
    }
    async function join() {
      setError("");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Camera access is unavailable here. Use HTTPS for phones and remote browsers.");
        return;
      }
      els.join.disabled = true;
      setStatus("Requesting Camera");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: "user" } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        els.preview.srcObject = stream;
        await els.preview.play().catch(() => {});
        pc = new RTCPeerConnection({ iceServers: invite.webrtc.iceServers || [] });
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        pc.onicecandidate = (event) => {
          if (event.candidate) postEvent("desktop", "candidate", event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
        };
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState || "";
          if (state === "connected") setStatus("Camera Live In Scene");
          else if (["failed", "disconnected", "closed"].includes(state)) setStatus("Peer " + state);
        };
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        await postEvent("desktop", "hello", {
          label: "Scene Invite Camera",
          inviteId: invite.id,
          cardId: invite.cardId,
          hypercore: invite.hypercore
        });
        await postEvent("desktop", "offer", pc.localDescription && pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription);
        els.stop.disabled = false;
        setStatus("Waiting For Desktop Answer");
      } catch (error) {
        setError((error && error.message) || "Camera join failed.");
        setStatus("Camera Blocked");
        stream && stream.getTracks && stream.getTracks().forEach((track) => track.stop());
        stream = null;
        els.join.disabled = false;
      }
    }
    function stop() {
      window.clearTimeout(pollTimer);
      pc && pc.close();
      pc = null;
      stream && stream.getTracks && stream.getTracks().forEach((track) => track.stop());
      stream = null;
      els.preview.srcObject = null;
      els.join.disabled = false;
      els.stop.disabled = true;
      setStatus("Invitation Created");
    }
    els.join.addEventListener("click", join);
    els.stop.addEventListener("click", stop);
    postEvent("desktop", "viewer-ready", {
      userAgent: navigator.userAgent,
      inviteId: invite.id,
      cardId: invite.cardId,
      hypercore: invite.hypercore
    }).catch(() => {});
    pollDesktop();
  </script>
</body>
</html>
`;
}

function phoneBridgeReadEvents(url) {
  cleanupPhoneBridgeSessions();
  const session = safePhoneBridgeSessionId(url.searchParams.get("session") || "");
  const target = safePhoneBridgeTarget(url.searchParams.get("target") || "");
  const since = Math.max(0, Number(url.searchParams.get("since") || 0) || 0);
  if (!session || !target) return { ok: false, error: "missing_session_or_target", events: [], nextSeq: since };
  const record = ensurePhoneBridgeSession(session);
  const events = record.events
    .filter((event) => event.target === target && event.seq > since)
    .slice(0, 80);
  const nextSeq = events.reduce((max, event) => Math.max(max, event.seq), since);
  return { ok: true, session: record.id, target, events, nextSeq };
}

function phoneBridgePostEvent(body = {}) {
  cleanupPhoneBridgeSessions();
  const session = safePhoneBridgeSessionId(body.session || "");
  const target = safePhoneBridgeTarget(body.target || "");
  const type = safePhoneBridgeEventType(body.type || "");
  if (!session || !target || !type) return { ok: false, error: "missing_session_target_or_type" };
  const record = ensurePhoneBridgeSession(session);
  const event = {
    seq: ++record.seq,
    id: `phone-bridge-${record.seq}`,
    session: record.id,
    target,
    from: safePhoneBridgeTarget(body.from || "") || "unknown",
    type,
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    createdAt: Date.now()
  };
  record.events.push(event);
  record.lastSeenAt = event.createdAt;
  prunePhoneBridgeEvents(record);
  return { ok: true, session: record.id, seq: event.seq };
}

function ensurePhoneBridgeSession(id = "") {
  const sessionId = safePhoneBridgeSessionId(id) || randomPhoneBridgeSessionId();
  let record = phoneBridgeSessions.get(sessionId);
  if (!record) {
    record = {
      id: sessionId,
      seq: 0,
      events: [],
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    };
    phoneBridgeSessions.set(sessionId, record);
  }
  record.lastSeenAt = Date.now();
  return record;
}

function cleanupPhoneBridgeSessions() {
  const now = Date.now();
  for (const [id, record] of phoneBridgeSessions.entries()) {
    prunePhoneBridgeEvents(record, now);
    if (now - record.lastSeenAt > PHONE_BRIDGE_SESSION_TTL_MS || now - record.createdAt > PHONE_BRIDGE_SESSION_TTL_MS * 2) {
      phoneBridgeSessions.delete(id);
    }
  }
}

function prunePhoneBridgeEvents(record, now = Date.now()) {
  if (!record?.events) return;
  record.events = record.events
    .filter((event) => now - Number(event.createdAt || 0) < PHONE_BRIDGE_MESSAGE_TTL_MS)
    .slice(-240);
}

function safePhoneBridgeSessionId(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function safePhoneBridgeTarget(value = "") {
  const target = String(value || "").trim().toLowerCase();
  return ["desktop", "mobile"].includes(target) ? target : "";
}

function safePhoneBridgeEventType(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "")
    .slice(0, 80);
}

function randomPhoneBridgeSessionId() {
  return `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function publicPhoneBridgeOrigin(req) {
  const explicitHttps = process.env.HAPA_AVATAR_PUBLIC_HTTPS_ORIGIN || "";
  if (/^https:\/\//.test(explicitHttps)) return explicitHttps.replace(/\/+$/, "");
  if (httpsBridgeActive && httpsPort) {
    const publicHost = process.env.HAPA_AVATAR_PUBLIC_HOST || firstLanIPv4Address() || "127.0.0.1";
    const publicPort = process.env.HAPA_AVATAR_PUBLIC_HTTPS_PORT || httpsPort;
    return `https://${publicHost}:${publicPort}`;
  }
  const explicit = process.env.HAPA_AVATAR_PUBLIC_ORIGIN || "";
  if (/^https?:\/\//.test(explicit)) return explicit.replace(/\/+$/, "");
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (req.socket?.encrypted ? "https" : "http");
  const publicHost = process.env.HAPA_AVATAR_PUBLIC_HOST || firstLanIPv4Address() || "127.0.0.1";
  const publicPort = process.env.HAPA_AVATAR_PUBLIC_PORT || port;
  return `${proto}://${publicHost}:${publicPort}`;
}

function requestPhoneBridgeOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (req.socket?.encrypted ? "https" : "http");
  const hostHeader = String(req.headers.host || `127.0.0.1:${port}`).trim();
  return `${proto}://${hostHeader}`.replace(/\/+$/, "");
}

function publicPhoneBridgeCertificateUrl(req) {
  const explicit = process.env.HAPA_AVATAR_PUBLIC_CERTIFICATE_URL || "";
  if (/^https?:\/\//.test(explicit)) return explicit;
  const publicHost = process.env.HAPA_AVATAR_PUBLIC_HOST || firstLanIPv4Address() || "127.0.0.1";
  const publicPort = process.env.HAPA_AVATAR_PUBLIC_PORT || port;
  const proto = req.socket?.encrypted && httpsBridgeActive ? "https" : "http";
  const certificatePort = proto === "https" ? (process.env.HAPA_AVATAR_PUBLIC_HTTPS_PORT || httpsPort || publicPort) : publicPort;
  return `${proto}://${publicHost}:${certificatePort}/api/phone-bridge/ca.crt`;
}

function firstLanIPv4Address() {
  return localLanIPv4Addresses()[0] || "";
}

function localLanIPv4Addresses() {
  const nets = networkInterfaces();
  const addresses = [];
  for (const items of Object.values(nets)) {
    for (const item of items || []) {
      if (item && item.family === "IPv4" && !item.internal) addresses.push(item.address);
    }
  }
  return addresses;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function proxyHapaTranscribeHealth(start = false) {
  const current = await fetchHapaTranscribeHealth().catch((error) => ({ ok: false, error: error.message || String(error) }));
  if (current?.ok || !start) return current;
  await ensureHapaTranscribeBackend();
  return fetchHapaTranscribeHealth();
}

async function transcribeHapaAudio(body = {}) {
  const input = decodeAudioDataUrl(body.dataUrl || body.audioDataUrl || body.audio || "");
  if (!input.buffer.length) throw new Error("Hapa Transcribe requires an audio dataUrl");
  if (input.buffer.length > HAPA_TRANSCRIBE_MAX_BYTES) {
    throw new Error(`Hapa Transcribe clip is too large (${input.buffer.length} bytes)`);
  }

  await ensureHapaTranscribeBackend();

  const mimeType = body.mimeType || input.mimeType || "audio/webm";
  const name = body.name || `tarot-camera-card-${Date.now()}.${extensionForVoiceboxInput(mimeType, "") || "webm"}`;
  const model = body.model || HAPA_TRANSCRIBE_MODEL;
  const sessionId = body.sessionId || body.session_id || "tarot-camera-card";
  const chunkIndex = Number.isFinite(Number(body.chunkIndex ?? body.chunk_index))
    ? Number(body.chunkIndex ?? body.chunk_index)
    : Date.now();
  const form = new FormData();
  form.append("session_id", String(sessionId));
  form.append("chunk_index", String(Math.max(0, Math.floor(chunkIndex))));
  form.append("model", String(model));
  form.append("language", String(body.language || "en"));
  form.append("audio", new Blob([input.buffer], { type: mimeType }), name);

  const startedAt = Date.now();
  const response = await fetch(`${HAPA_TRANSCRIBE_BASE_URL}/v1/transcribe-chunk`, {
    method: "POST",
    body: form
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok || payload?.ok === false) {
    const message = payload?.detail || payload?.message || payload?.error || response.statusText || "Hapa Transcribe failed";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  const transcriptText = String(payload.text || "").trim();
  const debugClipPath = !transcriptText && HAPA_TRANSCRIBE_SAVE_EMPTY_CLIPS
    ? await saveEmptyHapaTranscribeClip(input.buffer, { mimeType, name, model, sessionId, chunkIndex }).catch(() => "")
    : "";
  console.log(`[hapa-transcribe] session=${sessionId} chunk=${Math.max(0, Math.floor(chunkIndex))} model=${model} bytes=${input.buffer.length} textChars=${transcriptText.length} elapsedMs=${Date.now() - startedAt}${debugClipPath ? ` emptyClip=${debugClipPath}` : ""}`);
  return {
    ok: true,
    text: transcriptText,
    duration: Number(body.durationSeconds || body.duration || 0),
    elapsedMs: Date.now() - startedAt,
    source: "hapa-transcribe",
    engine: payload.engine || "",
    model: payload.model || model,
    language: payload.language || body.language || "en",
    inputBytes: input.buffer.length,
    inputMimeType: mimeType,
    segments: Array.isArray(payload.segments) ? payload.segments : [],
    serviceElapsedSeconds: Number(payload.elapsed_seconds || 0),
    receivedAt: payload.received_at || null,
    service: {
      url: HAPA_TRANSCRIBE_BASE_URL,
      defaultModel: HAPA_TRANSCRIBE_MODEL
    },
    debugClipPath
  };
}

async function saveEmptyHapaTranscribeClip(buffer, { mimeType = "audio/webm", name = "", model = "", sessionId = "", chunkIndex = 0 } = {}) {
  await mkdir(HAPA_TRANSCRIBE_EMPTY_CLIP_DIR, { recursive: true });
  const extension = extensionForVoiceboxInput(mimeType, name) || "webm";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeSession = slugify(sessionId || "camera-card") || "camera-card";
  const safeModel = slugify(model || HAPA_TRANSCRIBE_MODEL) || "large-v3";
  const filePath = path.join(
    HAPA_TRANSCRIBE_EMPTY_CLIP_DIR,
    `${stamp}-${safeSession}-${safeModel}-chunk-${Math.max(0, Math.floor(Number(chunkIndex) || 0))}.${extension}`
  );
  await writeFile(filePath, buffer);
  return filePath;
}

async function fetchHapaTranscribeHealth() {
  const response = await fetch(`${HAPA_TRANSCRIBE_BASE_URL}/health`, { signal: AbortSignal.timeout(1_200) });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok || payload?.ok === false) {
    const message = payload?.detail || payload?.message || response.statusText || "Hapa Transcribe health check failed";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return {
    ...payload,
    ok: true,
    url: HAPA_TRANSCRIBE_BASE_URL,
    model: HAPA_TRANSCRIBE_MODEL,
    process: hapaTranscribeProcess?.pid || null
  };
}

async function ensureHapaTranscribeBackend() {
  const health = await fetchHapaTranscribeHealth().catch(() => null);
  if (health?.ok) return health;
  const now = Date.now();
  if (!hapaTranscribeProcess && now - hapaTranscribeStartingAt > 2_500) {
    hapaTranscribeStartingAt = now;
    const scriptPath = path.join(HAPA_TRANSCRIBE_ROOT, "scripts/launch_hapa_transcribe_desktop.sh");
    hapaTranscribeProcess = spawn(scriptPath, ["--run-backend"], {
      cwd: HAPA_TRANSCRIBE_ROOT,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        HAPA_TRANSCRIBE_HOST: "127.0.0.1",
        HAPA_TRANSCRIBE_PORT: new URL(HAPA_TRANSCRIBE_BASE_URL).port || "8762",
        HAPA_TRANSCRIBE_LIVE_MODEL: HAPA_TRANSCRIBE_MODEL
      }
    });
    hapaTranscribeProcess.on("exit", () => {
      hapaTranscribeProcess = null;
    });
    hapaTranscribeProcess.on("error", () => {
      hapaTranscribeProcess = null;
    });
    hapaTranscribeProcess.unref();
  }
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 18_000) {
    const ready = await fetchHapaTranscribeHealth().catch((error) => {
      lastError = error;
      return null;
    });
    if (ready?.ok) return ready;
    await sleep(350);
  }
  throw new Error(`Hapa Transcribe did not become ready at ${HAPA_TRANSCRIBE_BASE_URL}${lastError ? `: ${lastError.message}` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function voiceboxHeaders(extra = {}) {
  return {
    "X-Voicebox-Client-Id": VOICEBOX_CLIENT_ID,
    ...extra
  };
}

async function proxyVoiceboxJson(pathname, init = {}) {
  const response = await fetch(`${VOICEBOX_BASE_URL}${pathname}`, {
    ...init,
    headers: voiceboxHeaders(init.headers || {})
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message = payload?.detail || payload?.message || response.statusText || "Voicebox request failed";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return payload;
}

async function transcribeVoiceboxAudio(body = {}) {
  const input = decodeAudioDataUrl(body.dataUrl || body.audioDataUrl || body.audio || "");
  if (!input.buffer.length) throw new Error("Voicebox transcription requires an audio dataUrl");
  if (input.buffer.length > VOICEBOX_MAX_TRANSCRIBE_BYTES) {
    throw new Error(`Voicebox transcription clip is too large (${input.buffer.length} bytes)`);
  }
  const mimeType = body.mimeType || input.mimeType || "audio/webm";
  const startedAt = Date.now();
  const primaryPrepared = await prepareVoiceboxTranscriptionAudio(input.buffer, {
    mimeType,
    name: body.name || "tarot-mic.webm",
    filter: VOICEBOX_TRANSCRIBE_FILTER
  });
  const attempts = [];
  let prepared = primaryPrepared;
  let payload = await submitVoiceboxTranscription(primaryPrepared, body);
  attempts.push({
    text: String(payload.text || "").trim(),
    duration: Number(payload.duration || 0),
    submittedBytes: primaryPrepared.buffer.length,
    submittedMimeType: primaryPrepared.mimeType,
    sampleRate: primaryPrepared.sampleRate,
    filter: primaryPrepared.filter || "off"
  });

  const shouldRetry = !String(payload.text || "").trim()
    && VOICEBOX_TRANSCRIBE_RETRY_FILTER
    && VOICEBOX_TRANSCRIBE_RETRY_FILTER !== "off"
    && VOICEBOX_TRANSCRIBE_RETRY_FILTER !== (primaryPrepared.filter || "off");
  if (shouldRetry) {
    const retryPrepared = await prepareVoiceboxTranscriptionAudio(input.buffer, {
      mimeType,
      name: body.name || "tarot-mic.webm",
      filter: VOICEBOX_TRANSCRIBE_RETRY_FILTER
    });
    const retryPayload = await submitVoiceboxTranscription(retryPrepared, body);
    attempts.push({
      text: String(retryPayload.text || "").trim(),
      duration: Number(retryPayload.duration || 0),
      submittedBytes: retryPrepared.buffer.length,
      submittedMimeType: retryPrepared.mimeType,
      sampleRate: retryPrepared.sampleRate,
      filter: retryPrepared.filter || "off"
    });
    prepared = retryPrepared;
    payload = retryPayload;
  }

  return {
    ok: true,
    text: String(payload.text || "").trim(),
    duration: Number(payload.duration || 0),
    elapsedMs: Date.now() - startedAt,
    source: "voicebox",
    inputBytes: input.buffer.length,
    submittedBytes: prepared.buffer.length,
    inputMimeType: mimeType,
    submittedMimeType: prepared.mimeType,
    submittedSampleRate: prepared.sampleRate,
    transcriptionFilter: prepared.filter || "off",
    attempts
  };
}

async function submitVoiceboxTranscription(prepared, body = {}) {
  const form = new FormData();
  form.append("file", new Blob([prepared.buffer], { type: prepared.mimeType }), prepared.fileName);
  if (body.language) form.append("language", String(body.language));
  if (body.model) form.append("model", String(body.model));
  const response = await fetch(`${VOICEBOX_BASE_URL}/transcribe`, {
    method: "POST",
    headers: voiceboxHeaders(),
    body: form
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message = payload?.detail || payload?.message || response.statusText || "Voicebox transcription failed";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return payload;
}

async function prepareVoiceboxTranscriptionAudio(buffer, { mimeType = "audio/webm", name = "tarot-mic.webm", filter = "off" } = {}) {
  const safeName = slugify(path.basename(name, path.extname(name))) || `tarot-mic-${Date.now()}`;
  const normalizedFilter = filter && filter !== "off" ? String(filter) : "off";
  if (isVoiceboxWavMime(mimeType, name) && normalizedFilter === "off") {
    return {
      buffer,
      mimeType: "audio/wav",
      fileName: `${safeName}.wav`,
      sampleRate: null,
      filter: normalizedFilter
    };
  }
  const inputExtension = extensionForVoiceboxInput(mimeType, name) || "webm";
  const workDir = path.join(tmpdir(), `hapa-voicebox-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  const inputPath = path.join(workDir, `input.${inputExtension}`);
  const outputPath = path.join(workDir, "voicebox.wav");
  await mkdir(workDir, { recursive: true });
  try {
    await writeFile(inputPath, buffer);
    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-ac", "1",
      "-ar", String(VOICEBOX_TRANSCRIBE_SAMPLE_RATE),
      "-sample_fmt", "s16"
    ];
    if (normalizedFilter !== "off") {
      ffmpegArgs.push("-af", normalizedFilter);
    }
    ffmpegArgs.push(outputPath);
    await execFileAsync(VOICEBOX_FFMPEG_PATH, ffmpegArgs, { timeout: 20_000 });
    const wav = await readFile(outputPath);
    return {
      buffer: wav,
      mimeType: "audio/wav",
      fileName: `${safeName}.wav`,
      sampleRate: VOICEBOX_TRANSCRIBE_SAMPLE_RATE,
      filter: normalizedFilter
    };
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function isVoiceboxWavMime(mimeType = "", name = "") {
  const normalized = String(mimeType || "").toLowerCase();
  const ext = path.extname(String(name || "")).toLowerCase();
  return normalized === "audio/wav" || normalized === "audio/wave" || normalized === "audio/x-wav" || ext === ".wav";
}

function extensionForVoiceboxInput(mimeType = "", name = "") {
  const normalized = String(mimeType || "").split(";")[0].trim().toLowerCase();
  const fromMime = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff"
  }[normalized];
  if (fromMime) return fromMime;
  return extensionForMime(mimeType, name);
}

function decodeAudioDataUrl(value = "") {
  const text = String(value || "");
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i.exec(text);
  if (!match) return { buffer: Buffer.alloc(0), mimeType: "" };
  return {
    buffer: Buffer.from(match[2], "base64"),
    mimeType: match[1] || ""
  };
}

async function persistMedia(body) {
  const dataUrl = String(body.dataUrl || "");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    const error = new Error("Expected dataUrl in data:<mime>;base64,<payload> format");
    error.statusCode = 400;
    throw error;
  }

  const mimeType = body.mimeType || match[1];
  const bytes = Buffer.from(match[2], "base64");
  const baseName = slugify(path.basename(body.name || body.id || `media-${Date.now()}`, path.extname(body.name || ""))) || `media-${Date.now()}`;
  const ext = extensionForMime(mimeType, body.name);
  const fileName = `${baseName}-${Date.now()}-${bytes.length}.${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(filePath, bytes);

  return {
    id: body.id || baseName,
    uri: `/media/${fileName}`,
    name: body.name || fileName,
    mimeType,
    sizeBytes: bytes.length,
    storage: {
      kind: "local-file",
      fileName,
      path: filePath
    }
  };
}

async function serveMedia(pathname, req, res) {
  const root = path.resolve(MEDIA_DIR);
  const relativePath = decodeURIComponent(pathname.replace(/^\/media\/?/, ""));
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const range = parseRange(req.headers.range, info.size);
    if (range) {
      res.writeHead(206, {
        "Content-Type": contentType(filePath),
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      streamFileToResponse(req, res, filePath, { start: range.start, end: range.end });
      return true;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Content-Length": info.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable"
    });
    streamFileToResponse(req, res, filePath);
    return true;
  } catch {
    return false;
  }
}

async function serveLocalFile(filePath, req, res) {
  try {
    const safePath = path.resolve(filePath);
    const info = await stat(safePath);
    if (!info.isFile()) {
      sendJson(res, 404, { error: "file_not_found" });
      return false;
    }
    const origin = req.headers.origin || "*";
    const range = parseRange(req.headers.range, info.size);
    if (range) {
      res.writeHead(206, {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Content-Type": contentType(safePath),
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600"
      });
      streamFileToResponse(req, res, safePath, { start: range.start, end: range.end });
      return true;
    }
    res.writeHead(200, {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Content-Type": contentType(safePath),
      "Content-Length": info.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600"
    });
    streamFileToResponse(req, res, safePath);
    return true;
  } catch {
    sendJson(res, 404, { error: "file_not_found" });
    return false;
  }
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader || !/^bytes=/.test(rangeHeader)) return null;
  const [startText, endText] = rangeHeader.replace(/^bytes=/, "").split("-");
  const start = startText ? Number(startText) : 0;
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return {
    start,
    end: Math.min(end, size - 1)
  };
}

async function serveStatic(root, pathname, req, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.resolve(root, `.${safePath}`);
  if (!filePath.startsWith(root)) return false;

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(root, "index.html");
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    streamFileToResponse(req, res, filePath);
    return true;
  } catch {
    return false;
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".hapa-room": "application/vnd.hapa.room+json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".zip": "application/zip",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json"
  }[ext] || "application/octet-stream";
}

function extensionForMime(mimeType, name = "") {
  const fromName = path.extname(name).replace(".", "").toLowerCase();
  if (fromName) return fromName;
  return {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
    "model/gltf-binary": "glb",
    "model/gltf+json": "gltf"
  }[mimeType] || "bin";
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}
