import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CloudSun,
  Disc3,
  Hand,
  Layers3,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createEchoDirectorPreviewRuntime,
  resolveEchoDirectorPreviewSourceRect,
  selectEchoDirectorPreviewSource,
} from "../domain/echo-director-preview-runtime.js";
import { createEchoIsfSurface } from "../domain/echo-isf-browser-runtime.js";
import {
  createEchoLiveSignalTracker,
  sampleEchoLiveSignalFrame,
} from "../domain/echo-live-signal-transport.js";
import {
  echoSourceWindowPlaybackRate,
  mapEchoSourceWindowTime,
  normalizeEchoTransitionTimeMapping,
} from "../domain/echo-playback-sync.js";
import {
  normalizeEchoStemFocus,
  resolveVerifiedEchoStemBinding,
} from "../domain/echo-visualizer-audio-envelope.js";
import { createEchoRecordGardenAcceptanceRun } from "../domain/echo-record-garden-acceptance-run.js";
import { ECHO_RECORD_GARDEN_SPATIAL_LAYOUT } from "../domain/echo-record-garden-spatial-layout.js";
import {
  attachEchoRecordObjectPreservingWorldTransform,
  buildEchoRecordFaceContract,
  createEchoRecordEntityRegistry,
  createEchoRecordPlacementLatencyState,
  markEchoRecordPlacementMilestone,
  planEchoRecordGardenRecordResidency,
  summarizeEchoRecordPlacementLatencies,
} from "../domain/echo-record-garden-runtime.js";
import {
  ECHO_RECORD_DISPLAY_RPM,
  ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
  buildEchoRecordDirectorWarmSurfaces,
  buildEchoRecordVisualSurfaces,
  clearEchoRecordGardenPersistedItems,
  echoRecordPerspectiveToken,
  echoRecordVideoPlaybackPlan,
  echoRecordVinylSpinRadians,
  isLegacyEchoRecordDirectionVariant,
  normalizeEchoRecordGardenSnapshot,
  normalizeEchoRecordSummaryRows,
  projectEchoRecordSelectedDirectorCut,
  reconcileEchoRecordGardenSnapshot,
  resolveEchoRecordGardenTableDrop,
  resolveEchoRecordMediaUri,
  selectEchoRecordDirectorShots,
  selectEchoRecordMediaWindow,
  unwrapEchoDirectorProject,
} from "../domain/echo-record-garden.js";
import { localFileApiUri } from "../domain/local-media-uri.js";
import {
  createEchoGardenRoundedBoxGeometry,
  createEchoRecordGardenVisualSystem,
  updateEchoRecordGardenVisualSystem,
} from "./echo-record-garden-visual-system.js";
import { createEchoRecordGardenAudioVisualizer } from "./echo-record-garden-audio-visualizer.js";
import {
  orientEchoGardenSurfaceTowardCamera,
  resolveEchoGardenSurfaceWheelTarget,
} from "./echo-record-garden-facing.js";

const EchoRecordGardenAcceptancePanel = lazy(() => import("./EchoRecordGardenAcceptancePanel.jsx"));

const RECORDS_PER_CRATE = 10;
const SCREEN_COUNT = 1;
const VISIBLE_RECORD_VIDEO_LIMIT = RECORDS_PER_CRATE;
const SCREEN_MEDIA_POOL_LIMIT = VISIBLE_RECORD_VIDEO_LIMIT + 4;
const PRINTED_CARD_VIDEO_LIMIT = 3;
const PROJECT_PACKET_CACHE_LIMIT = 12;
const PLACEMENT_LATENCY_SAMPLE_LIMIT = 100;
const MEDIA_HARD_SEEK_COOLDOWN_SECONDS = 0.25;
const PRIMARY_MEDIA_START_TIMEOUT_MS = 1_500;
const RECORD_GARDEN_STORAGE_KEY = "hapa.echo-record-garden.v1";
const RECORD_GARDEN_DIAGNOSTICS_KEY = "__HAPA_ECHO_RECORD_GARDEN_DIAGNOSTICS__";
const RECORD_GARDEN_CAPTURE_FPS = 30;
const RECORD_GARDEN_CAPTURE_MAX_SECONDS = 180;
const RECORD_GARDEN_CAPTURE_VIDEO_BITS_PER_SECOND = 3_000_000;
const RECORD_GARDEN_WEATHER_PHASES = Object.freeze(["high-noon", "sunset", "night", "sunrise"]);
const RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES = new WeakMap();
const RECORD_CATALOG_SORTS = Object.freeze([
  { id: "album", label: "Album order" },
  { id: "newest-cut", label: "Newest Director cut" },
  { id: "title", label: "Song title" },
  { id: "perspective", label: "Character / perspective" },
]);

function recordGardenDiagnostics() {
  const existing = globalThis[RECORD_GARDEN_DIAGNOSTICS_KEY];
  if (existing && typeof existing === "object") {
    existing.schemaVersion = "hapa.echo-record-garden.diagnostics.v2";
    existing.acceptanceRun ||= { ...createEchoRecordGardenAcceptanceRun(), running: false };
    existing.inputCounts ||= { keyboard: 0, mouse: 0, pen: 0, touch: 0 };
    existing.frameTiming ||= { samples: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, longFrames: 0 };
    existing.contextLosses ??= 0;
    existing.lastPixelSample ||= null;
    existing.cinematicMode ??= false;
    existing.captureStatus ||= "idle";
    existing.captureAudioTracks ??= 0;
    existing.weatherPhase ||= "high-noon";
    existing.visualizerStatus ||= "idle";
    existing.placementLatency ||= {
      latest: null,
      samples: [],
      summary: summarizeEchoRecordPlacementLatencies([]),
    };
    existing.recordCatalogSize ??= 0;
    existing.residentRecordObjects ??= 0;
    existing.residentRecordMedia ??= 0;
    existing.recordObjectEvictions ??= 0;
    return existing;
  }
  const diagnostics = {
    schemaVersion: "hapa.echo-record-garden.diagnostics.v2",
    createdGames: 0,
    disposedGames: 0,
    liveGames: 0,
    liveRenderers: 0,
    selectedSongId: "",
    placedSongId: "",
    audioTime: 0,
    audioState: "idle",
    recordAngle: 0,
    visualSurfaceCount: 0,
    activeVideos: 0,
    mediaFailures: 0,
    bufferedVideos: 0,
    presentedVideos: 0,
    warmingVideos: 0,
    warmReadyVideos: 0,
    waitingVideos: 0,
    mediaPoolSize: 0,
    projectCacheEntries: 0,
    projectCacheEvictions: 0,
    mediaPlayRequests: 0,
    mediaHardSeeks: 0,
    mediaBufferingTransitions: 0,
    contextState: "uninitialized",
    contextLosses: 0,
    cinematicMode: false,
    captureStatus: "idle",
    captureAudioTracks: 0,
    weatherPhase: "high-noon",
    visualizerStatus: "idle",
    placementLatency: {
      latest: null,
      samples: [],
      summary: summarizeEchoRecordPlacementLatencies([]),
    },
    recordCatalogSize: 0,
    residentRecordObjects: 0,
    residentRecordMedia: 0,
    recordObjectEvictions: 0,
    visibilityState: globalThis.document?.visibilityState || "visible",
    rendererMemory: { geometries: 0, textures: 0 },
    directorCutId: "",
    directorCutTitle: "",
    directorCutLegacy: false,
    currentCueId: "",
    inputCounts: { keyboard: 0, mouse: 0, pen: 0, touch: 0 },
    frameTiming: { samples: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, longFrames: 0 },
    lastPixelSample: null,
    acceptanceRun: { ...createEchoRecordGardenAcceptanceRun(), running: false },
    lastError: "",
  };
  globalThis[RECORD_GARDEN_DIAGNOSTICS_KEY] = diagnostics;
  return diagnostics;
}

function recordGardenMonotonicNow() {
  const monotonic = globalThis.performance?.now?.();
  return Number.isFinite(monotonic) ? monotonic : Date.now();
}

function publishRecordGardenPlacementLatency(samples = [], trace = null) {
  if (!trace?.attemptId) return Array.isArray(samples) ? samples : [];
  const retained = (Array.isArray(samples) ? samples : [])
    .filter((sample) => sample?.attemptId !== trace.attemptId);
  const next = [...retained, trace].slice(-PLACEMENT_LATENCY_SAMPLE_LIMIT);
  const diagnostics = recordGardenDiagnostics();
  diagnostics.placementLatency = {
    latest: trace,
    samples: next,
    summary: summarizeEchoRecordPlacementLatencies(next),
  };
  return next;
}

function activeAcceptanceRun() {
  const diagnostics = recordGardenDiagnostics();
  return diagnostics.acceptanceRun?.running ? diagnostics.acceptanceRun : null;
}

function noteAcceptanceAction(kind, payload = {}) {
  const diagnostics = recordGardenDiagnostics();
  const run = diagnostics.acceptanceRun?.running ? diagnostics.acceptanceRun : null;
  if (!run) return;
  if (kind === "placement") {
    run.recordPlacements += 1;
    if (run.lastPlacedSongId && run.lastPlacedSongId !== payload.songId) run.recordChanges += 1;
    run.lastPlacedSongId = String(payload.songId || "");
    if (run.lastPlacedSongId && !run.songsObserved.includes(run.lastPlacedSongId)) {
      run.songsObserved = [...run.songsObserved, run.lastPlacedSongId].slice(-40);
    }
  } else if (kind === "seek") {
    const fromCueId = String(payload.fromCueId || "");
    const toCueId = String(payload.toCueId || "");
    const fromSeconds = Math.max(0, Number(payload.fromSeconds) || 0);
    const toSeconds = Math.max(0, Number(payload.toSeconds) || 0);
    if (!fromCueId || !toCueId || fromCueId === toCueId || Math.abs(toSeconds - fromSeconds) < 0.25) return;
    const transition = {
      fromCueId,
      toCueId,
      fromSeconds,
      toSeconds,
      capturedAt: new Date().toISOString(),
    };
    const existing = Array.isArray(run.seekTransitions) ? run.seekTransitions : [];
    const key = `${fromCueId}->${toCueId}`;
    if (existing.some((item) => `${item?.fromCueId || ""}->${item?.toCueId || ""}` === key)) return;
    run.seekTransitions = [...existing, transition].slice(-20);
    run.seekGestures = run.seekTransitions.length;
    run.lastSeekAtMs = Date.now();
    run.lastSeekSeconds = toSeconds;
  } else if (kind === "surface-page") {
    run.surfacePageChanges += 1;
  } else if (kind === "card-result") {
    run.cardResults += 1;
  } else if (kind === "keyboard") {
    run.keyboardActions += 1;
    diagnostics.inputCounts.keyboard += 1;
  }
  if ((globalThis.innerWidth || Infinity) <= 760) run.compactActions += 1;
}

function noteAcceptancePointer(pointerType = "mouse") {
  const diagnostics = recordGardenDiagnostics();
  const normalized = ["mouse", "pen", "touch"].includes(pointerType) ? pointerType : "mouse";
  diagnostics.inputCounts[normalized] = Number(diagnostics.inputCounts[normalized] || 0) + 1;
  const run = activeAcceptanceRun();
  if (run && (globalThis.innerWidth || Infinity) <= 760) run.compactActions += 1;
}

function browserApiBase(apiBase = "") {
  return String(apiBase || "").replace(/\/+$/, "");
}

function readCachedProjectPacket(cache, key, diagnostics) {
  if (!cache.has(key)) return null;
  const packet = cache.get(key);
  cache.delete(key);
  cache.set(key, packet);
  diagnostics.projectCacheEntries = cache.size;
  return packet;
}

function retainProjectPacket(cache, key, packet, diagnostics) {
  cache.delete(key);
  cache.set(key, packet);
  while (cache.size > PROJECT_PACKET_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
    diagnostics.projectCacheEvictions = Number(diagnostics.projectCacheEvictions || 0) + 1;
  }
  diagnostics.projectCacheEntries = cache.size;
  return packet;
}

function resolveGardenMediaUri(uri = "", apiBase = "") {
  if (!uri) return "";
  const local = localFileApiUri(uri, apiBase);
  if (local) return local;
  if (/^(data:|blob:|https?:)/i.test(uri)) return uri;
  const base = browserApiBase(apiBase);
  if (uri.startsWith("/")) return `${base}${uri}`;
  return uri;
}

function comparableGardenMediaUri(uri = "") {
  const source = String(uri || "");
  if (!source) return "";
  try {
    return new URL(source, globalThis.location?.origin || "http://hapa.local").href;
  } catch {
    return source;
  }
}

function compactTime(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function preferredRecordGardenCaptureMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((candidate) => MediaRecorder.isTypeSupported?.(candidate)) || "";
}

function initialRecordGardenCaptureState() {
  return {
    status: "idle",
    startedAt: "",
    elapsedSeconds: 0,
    durationSeconds: 0,
    cardId: "",
    cardTitle: "",
    error: "",
  };
}

function recordGardenRecordingId() {
  return `record-garden-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeWeatherPhase(value = "high-noon") {
  return RECORD_GARDEN_WEATHER_PHASES.includes(value) ? value : "high-noon";
}

function weatherPhaseLabel(value = "high-noon") {
  return normalizeWeatherPhase(value).replace(/-/g, " ");
}

function recordPerspectiveId(record = {}) {
  return String(record?.perspective?.id || record?.perspective || "unassigned");
}

function recordTheme(recordOrPerspective = {}) {
  const token = recordOrPerspective?.accentHex
    ? recordOrPerspective
    : recordOrPerspective?.perspective?.accentHex
      ? recordOrPerspective.perspective
      : echoRecordPerspectiveToken(recordOrPerspective?.perspective || recordOrPerspective);
  return {
    accent: token.accentHex || "#58d8e8",
    deep: "#203039",
    label: token.label || "Unassigned perspective",
  };
}

function recordAvatarName(record = {}) {
  return String(record?.avatar?.name || record?.avatarName || "");
}

function recordDuration(record = {}) {
  return Number(record?.durationSeconds ?? record?.duration) || 0;
}

function recordCoverUri(record = {}) {
  return String(record?.cover?.uri || record?.coverUri || "");
}

function recordLoopVisual(record = {}) {
  const preview = record?.preview || record?.director?.preview || record?.recordPreview || {};
  const videoUri = String(preview.videoUri || preview.video_uri || preview.uri || "");
  const posterUri = String(preview.posterUri || preview.poster_uri || recordCoverUri(record) || "");
  if (!videoUri && !posterUri) return null;
  const faceContract = buildEchoRecordFaceContract({
    record,
    media: {
      uri: videoUri || posterUri,
      posterUri,
      kind: videoUri ? "video" : "image",
      revisionId: preview.cutFingerprint
        || preview.revisionId
        || record?.director?.latestCut?.fingerprint
        || record?.director?.latestCut?.id
        || record?.source?.revisionId
        || "",
    },
    visible: true,
  });
  return {
    id: `record-loop:${record.songId}`,
    sourceId: preview.cardId || preview.mediaId || `record:${record.songId}`,
    songId: record.songId,
    title: record.title,
    kind: videoUri ? "video" : "image",
    kindLabel: "Living Record",
    mediaUri: videoUri || posterUri,
    videoUri,
    imageUri: posterUri,
    posterUri,
    sourceStartSeconds: Math.max(0, Number(preview.sourceStartSeconds ?? preview.source_in_seconds) || 0),
    sourceEndSeconds: Math.max(0, Number(preview.sourceEndSeconds ?? preview.source_out_seconds) || 0),
    durationSeconds: Math.max(0.25, Number(preview.durationSeconds) || 8),
    playbackMode: "loop",
    clockLocked: false,
    source: {
      revisionId: preview.cutFingerprint
        || preview.revisionId
        || record?.director?.latestCut?.fingerprint
        || record?.director?.latestCut?.id
        || record?.source?.revisionId
        || "",
    },
    faceContract,
  };
}

function projectAudioUri(project = {}, apiBase = "") {
  return resolveEchoRecordMediaUri(
    project?.audio_uri
    || project?.audioUri
    || project?.audio?.uri
    || "",
    apiBase,
  );
}

function projectDuration(project = {}) {
  return Number(project?.duration ?? project?.durationSeconds) || 0;
}

function projectSongIdentity(project = {}) {
  return String(project?.song_id || project?.songId || "");
}

function assertRecordGardenProjectIdentity(record = {}, project = {}, apiBase = "") {
  const songId = String(record?.songId || "");
  if (!songId || projectSongIdentity(project) !== songId) {
    throw new Error("The Director project did not match the record selected for placement");
  }
  const summaryAudioUri = resolveGardenMediaUri(record?.audio?.uri || "", apiBase);
  const exactAudioUri = projectAudioUri(project, apiBase);
  if (!exactAudioUri) throw new Error("The exact Director project has no routable audio source");
  if (comparableGardenMediaUri(exactAudioUri) !== comparableGardenMediaUri(summaryAudioUri)) {
    throw new Error("The Director project audio route did not match the placed Record summary");
  }
  const expectedAudioId = String(record.audio?.id || "");
  const exactAudioId = String(
    project.registry_track_id
    || project.registryTrackId
    || project.audio_id
    || project.audioId
    || "",
  );
  if (expectedAudioId && exactAudioId && expectedAudioId !== exactAudioId) {
    throw new Error("The Director project audio identity did not match the placed Record summary");
  }
  return exactAudioUri;
}

function abortError(message = "Audio validation cancelled") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function prepareRecordAudioElement(audio, audioUri, { signal, timeoutMs = 2_500 } = {}) {
  if (!audio || !audioUri) return Promise.reject(new Error("This record has no routable audio source"));
  if (signal?.aborted) return Promise.reject(abortError());
  if (audio.getAttribute("src") === audioUri && audio.readyState >= 1) {
    return Promise.resolve({ duration: Math.max(0, Number(audio.duration) || 0), warmed: true });
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout = 0;
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("error", handleError);
    };
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve({ duration: Math.max(0, Number(audio.duration) || 0), warmed: false });
    };
    const handleReady = () => finish();
    const handleError = () => finish(new Error("This record's audio source could not be decoded"));
    const handleAbort = () => finish(abortError());
    audio.addEventListener("loadedmetadata", handleReady, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
    timeout = globalThis.setTimeout(
      () => finish(new Error("Audio preparation timed out before the record could play")),
      Math.max(800, Number(timeoutMs) || 2_500),
    );
    audio.src = audioUri;
    audio.preload = "auto";
    audio.load();
  });
}

function waitForMediaPresentation(presentation, timeoutMs = PRIMARY_MEDIA_START_TIMEOUT_MS) {
  if (!presentation || typeof presentation.then !== "function") {
    return Promise.resolve({ status: "unavailable" });
  }
  return new Promise((resolve) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: "timeout" });
    }, Math.max(0, Number(timeoutMs) || 0));
    Promise.resolve(presentation)
      .then((result) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(result || { status: "presented" });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve({ status: "failed" });
      });
  });
}

function surfaceKindLabel(surface = {}) {
  return String(surface.role || surface.sourceType || "album visual")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toGardenVisual(surface = {}) {
  const mediaKind = surface?.media?.kind || surface.kind || "unknown";
  const mediaUri = surface?.media?.uri || surface.mediaUri || "";
  const posterUri = surface?.media?.posterUri || surface.posterUri || "";
  const startSeconds = Number(surface?.provenance?.startSeconds ?? surface.startSeconds) || 0;
  const endSeconds = Number(surface?.provenance?.endSeconds ?? surface.endSeconds) || 0;
  return {
    ...surface,
    kind: mediaKind,
    kindLabel: surfaceKindLabel(surface),
    truthLabel: surface?.truth?.label || surface.truthLabel || "Unreviewed source projection",
    card: surface?.attachment?.card || surface.card || null,
    mediaId: surface?.attachment?.lookupId
      || surface?.attachment?.cardId
      || surface?.provenance?.mediaCardId
      || surface.mediaId
      || surface.sourceId
      || "none",
    mediaUri,
    posterUri,
    videoUri: mediaKind === "video" ? mediaUri : "",
    imageUri: mediaKind === "image" ? mediaUri : posterUri,
    startSeconds,
    sourceStartSeconds: Number(
      surface?.provenance?.sourceInSeconds
      ?? surface.sourceStartSeconds,
    ) || 0,
    sourceEndSeconds: Number(
      surface?.provenance?.sourceOutSeconds
      ?? surface.sourceEndSeconds,
    ) || 0,
    sourceDurationSeconds: Number(
      surface?.provenance?.sourceDurationSeconds
      ?? surface.sourceDurationSeconds,
    ) || 0,
    playbackMode: String(
      surface?.provenance?.playbackMode
      || surface.playbackMode
      || "once",
    ),
    timeMapping: surface?.provenance?.timeMapping
      || surface.timeMapping
      || null,
    holdLastFrame: Boolean(
      surface?.provenance?.holdLastFrame
      ?? surface.holdLastFrame,
    ),
    durationSeconds: Math.max(0, endSeconds - startSeconds) || Number(surface.durationSeconds) || 0,
    clockLocked: surface.sourceType === "director-shot",
  };
}

function selectGardenWarmVisuals(
  visibleVisuals = [],
  directorWarmVisuals = [],
  pageWarmVisuals = [],
) {
  const visibleKeys = new Set(visibleVisuals.map((visual) => screenMediaSourceIdentity(visual).key));
  const warmKeys = new Set();
  return [...directorWarmVisuals, ...pageWarmVisuals]
    .filter((visual) => {
      const key = screenMediaSourceIdentity(visual).key;
      if (visibleKeys.has(key) || warmKeys.has(key)) return false;
      warmKeys.add(key);
      return true;
    })
    .slice(0, SCREEN_COUNT);
}

function recordMatchesQuery(record, query, perspective) {
  const needle = String(query || "").trim().toLowerCase();
  if (perspective !== "all" && recordPerspectiveId(record) !== perspective) return false;
  if (!needle) return true;
  return [
    record.title,
    record.songId,
    recordAvatarName(record),
    recordPerspectiveId(record),
  ].some((value) => String(value || "").toLowerCase().includes(needle));
}

function recordDirectorTimestamp(record = {}) {
  const value = record?.director?.latestCut?.updatedAt
    || record?.director?.latestCut?.createdAt
    || record?.source?.updatedAt
    || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function sortEchoRecordCatalog(records = [], sortId = "album") {
  return records.map((record, index) => ({ record, index })).sort((left, right) => {
    if (sortId === "newest-cut") {
      return recordDirectorTimestamp(right.record) - recordDirectorTimestamp(left.record)
        || left.index - right.index;
    }
    if (sortId === "title") {
      return String(left.record?.title || "").localeCompare(String(right.record?.title || ""))
        || left.index - right.index;
    }
    if (sortId === "perspective") {
      return String(recordAvatarName(left.record) || recordPerspectiveId(left.record)).localeCompare(
        String(recordAvatarName(right.record) || recordPerspectiveId(right.record)),
      ) || String(left.record?.title || "").localeCompare(String(right.record?.title || ""))
        || left.index - right.index;
    }
    return left.index - right.index;
  }).map(({ record }) => record);
}

function readGardenPreferences() {
  try {
    return normalizeEchoRecordGardenSnapshot(
      JSON.parse(localStorage.getItem(RECORD_GARDEN_STORAGE_KEY) || "{}"),
    );
  } catch {
    return normalizeEchoRecordGardenSnapshot({});
  }
}

function writeGardenPreferences(value) {
  try {
    localStorage.setItem(RECORD_GARDEN_STORAGE_KEY, JSON.stringify({
      schemaVersion: ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
      selection: {
        selectedSongId: value.selectedSongId || "",
        placedSongId: value.placedSongId || "",
        selectedVisualId: value.selectedVisualId || "",
      },
      catalog: {
        query: String(value.query || "").slice(0, 180),
        perspective: value.perspective || "all",
        sort: value.sort || "album",
        cratePage: Math.max(0, Number(value.cratePage) || 0),
        crateOrder: Array.isArray(value.crateOrder) ? value.crateOrder : [],
      },
      playback: {
        seconds: Math.max(0, Number(value.playbackSeconds) || 0),
        muted: Boolean(value.muted),
      },
      scene: {
        surfacePage: Math.max(0, Number(value.surfacePage) || 0),
        surfaceSongId: value.surfaceSongId || "",
        recordTransforms: value.recordTransforms || {},
        printedCards: normalizeEchoRecordGardenSnapshot({
          scene: { printedCards: value.printedCards },
        }).printedCards,
        camera: value.camera || null,
      },
      cardJob: value.cardJob || null,
      persistedAt: new Date().toISOString(),
    }));
  } catch {
    // The garden remains usable when local storage is unavailable.
  }
}

function initialPlaybackState(currentTime = 0) {
  return {
    playing: false,
    currentTime: Math.max(0, Number(currentTime) || 0),
    duration: 0,
    ready: false,
    error: "",
  };
}

function initialCardResolution(cardJob = null) {
  if (!cardJob) {
    return {
      status: "idle",
      visualId: "",
      songId: "",
      requestKey: "",
      startedAt: null,
      error: "",
      recoverable: true,
    };
  }
  return {
    status: cardJob.status || "interrupted",
    visualId: cardJob.visualId || "",
    songId: cardJob.songId || "",
    requestKey: cardJob.requestKey || "",
    startedAt: cardJob.startedAt || null,
    error: cardJob.error || "The previous Card request was interrupted. Retry from the same visual.",
    recoverable: cardJob.recoverable !== false,
  };
}

function persistedCardJob(cardResolution = {}) {
  if (!cardResolution?.visualId || ["idle", "complete"].includes(cardResolution.status)) return null;
  return {
    status: cardResolution.status,
    visualId: cardResolution.visualId,
    songId: cardResolution.songId || "",
    requestKey: cardResolution.requestKey || "",
    startedAt: cardResolution.startedAt || null,
    error: cardResolution.error || "",
  };
}

function previewCanvasBlendMode(value = "source-over") {
  const normalized = String(value || "source-over").toLowerCase();
  const aliases = {
    add: "lighter",
    additive: "lighter",
    normal: "source-over",
    screen: "screen",
    multiply: "multiply",
    overlay: "overlay",
  };
  return aliases[normalized] || "source-over";
}

function drawDirectorPreviewFallback(context, width, height, frame, label = "DIRECTOR MEDIA PREWARM") {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07171a");
  gradient.addColorStop(0.5, "#173c3c");
  gradient.addColorStop(1, "#33253b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(86,240,207,.34)";
  context.lineWidth = Math.max(2, width / 640);
  for (let x = 0; x < width; x += Math.max(42, width / 22)) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  context.fillStyle = "rgba(4,12,14,.74)";
  context.fillRect(width * 0.045, height * 0.07, width * 0.63, height * 0.2);
  context.fillStyle = "#56f0cf";
  context.font = `700 ${Math.max(14, Math.round(width * 0.018))}px ui-monospace, monospace`;
  context.fillText(label, width * 0.07, height * 0.13);
  context.fillStyle = "#f8f0d8";
  context.font = `800 ${Math.max(22, Math.round(width * 0.032))}px system-ui, sans-serif`;
  context.fillText(String(frame?.song?.title || "Echo State").slice(0, 42), width * 0.07, height * 0.21);
}

export function resolveRecordGardenDirectorSourceRect({
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
  frame,
} = {}) {
  return resolveEchoDirectorPreviewSourceRect({
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    frame,
  });
}

function drawDirectorPreviewMedia(context, element, frame) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const sourceWidth = Number(element?.videoWidth || element?.naturalWidth || element?.width) || 0;
  const sourceHeight = Number(element?.videoHeight || element?.naturalHeight || element?.height) || 0;
  if (!sourceWidth || !sourceHeight) return false;
  const sourceRect = resolveRecordGardenDirectorSourceRect({
    sourceWidth,
    sourceHeight,
    outputWidth: width,
    outputHeight: height,
    frame,
  });
  context.drawImage(
    element,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    sourceRect.destination?.x ?? 0,
    sourceRect.destination?.y ?? 0,
    sourceRect.destination?.width ?? width,
    sourceRect.destination?.height ?? height,
  );
  recordGardenDiagnostics().directorCameraPresentation = sourceRect.presentation;
  return true;
}

function createRecordGardenMasterSignalSource(audio) {
  const tracker = createEchoLiveSignalTracker();
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!audio || !AudioContextClass) {
    const sample = (seconds = 0) => sampleEchoLiveSignalFrame(null, seconds, {
      id: "master",
      label: "Main track",
      source: "record-garden-master-audio",
    }, tracker);
    return {
      sample,
      latest: sample,
      resume: async () => false,
      captureStream: () => null,
      setMonitorMuted(value) { if (audio) audio.muted = Boolean(value); },
      createStem: () => null,
      dispose() {},
    };
  }
  let contextForFailure = null;
  try {
    const context = new AudioContextClass();
    contextForFailure = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.68;
    const source = context.createMediaElementSource(audio);
    const captureDestination = context.createMediaStreamDestination();
    const monitorGain = context.createGain();
    source.connect(analyser);
    analyser.connect(monitorGain);
    monitorGain.connect(context.destination);
    analyser.connect(captureDestination);
    const stemResources = new Set();
    let lastMasterFrame = null;
    let lastMasterSeconds = Number.NEGATIVE_INFINITY;
    const sampleMaster = (seconds = 0) => {
      lastMasterSeconds = Math.max(0, Number(seconds) || 0);
      lastMasterFrame = sampleEchoLiveSignalFrame(analyser, lastMasterSeconds, {
        id: "master",
        label: "Main track",
        source: "record-garden-master-audio-analyser",
        observedAtSeconds: Number(context.currentTime) || lastMasterSeconds,
        sampleRate: context.sampleRate,
        contextState: context.state,
      }, tracker);
      return lastMasterFrame;
    };
    return {
      sample: sampleMaster,
      latest(seconds = 0, { maxAgeSeconds = 1 / 30 } = {}) {
        const clockSeconds = Math.max(0, Number(seconds) || 0);
        if (!lastMasterFrame || Math.abs(clockSeconds - lastMasterSeconds) >= maxAgeSeconds) {
          return sampleMaster(clockSeconds);
        }
        return lastMasterFrame;
      },
      async resume() {
        if (context.state === "suspended") await context.resume();
        return context.state === "running";
      },
      captureStream() {
        return captureDestination.stream;
      },
      setMonitorMuted(value) {
        audio.muted = false;
        monitorGain.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, 0.012);
      },
      createStem(uri, metadata = {}) {
        if (!uri) return null;
        const element = document.createElement("audio");
        element.preload = "auto";
        element.crossOrigin = "anonymous";
        element.playsInline = true;
        element.loop = false;
        element.src = uri;
        const stemAnalyser = context.createAnalyser();
        stemAnalyser.fftSize = 512;
        stemAnalyser.smoothingTimeConstant = 0.68;
        const stemSource = context.createMediaElementSource(element);
        const silentGain = context.createGain();
        silentGain.gain.value = 0;
        stemSource.connect(stemAnalyser);
        stemAnalyser.connect(silentGain);
        silentGain.connect(context.destination);
        const stemTracker = createEchoLiveSignalTracker();
        let status = "loading";
        let disposed = false;
        element.addEventListener("canplay", () => { status = "ready"; });
        element.addEventListener("error", () => { status = "failed"; });
        element.load();
        const resource = {
          uri,
          get status() { return status; },
          sample(seconds = 0, { playing = false } = {}) {
            if (disposed) return null;
            const target = Math.max(0, Number(seconds) || 0);
            if (element.readyState >= 1 && !element.seeking && Math.abs((Number(element.currentTime) || 0) - target) > 0.12) {
              try { element.currentTime = target; } catch {}
            }
            if (playing && status === "ready" && element.paused) element.play().catch(() => {});
            else if (!playing && !element.paused) element.pause();
            return sampleEchoLiveSignalFrame(stemAnalyser, target, {
              id: metadata.id || "stem",
              label: metadata.label || metadata.id || "Stem",
              stemFocus: metadata.stemFocus || metadata.id || "",
              source: "verified-registry-stem",
              truthStatus: metadata.truthStatus || "verified_registry_path",
              observedAtSeconds: Number(context.currentTime) || target,
              sampleRate: context.sampleRate,
              contextState: context.state,
              decoderStatus: status,
            }, stemTracker);
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            status = "disposed";
            element.pause();
            element.removeAttribute("src");
            element.load();
            stemTracker.reset();
            try { stemSource.disconnect(); } catch {}
            try { stemAnalyser.disconnect(); } catch {}
            try { silentGain.disconnect(); } catch {}
            stemResources.delete(resource);
          },
        };
        stemResources.add(resource);
        return resource;
      },
      dispose() {
        [...stemResources].forEach((resource) => resource.dispose());
        tracker.reset();
        captureDestination.stream?.getTracks?.().forEach((track) => {
          try { track.stop(); } catch {}
        });
        try { source.disconnect(); } catch {}
        try { analyser.disconnect(); } catch {}
        try { monitorGain.disconnect(); } catch {}
        try { captureDestination.disconnect(); } catch {}
        if (context.state !== "closed") context.close().catch(() => {});
      },
    };
  } catch {
    if (contextForFailure?.state !== "closed") contextForFailure?.close?.().catch(() => {});
    const sample = (seconds = 0) => sampleEchoLiveSignalFrame(null, seconds, {
      id: "master",
      label: "Main track",
      source: "record-garden-master-audio",
    }, tracker);
    return {
      sample,
      latest: sample,
      resume: async () => false,
      captureStream: () => null,
      setMonitorMuted(value) { if (audio) audio.muted = Boolean(value); },
      createStem: () => null,
      dispose() { tracker.reset(); },
    };
  }
}

function acquireRecordGardenMasterSignalSource(audio) {
  if (!audio || (typeof audio !== "object" && typeof audio !== "function")) {
    const source = createRecordGardenMasterSignalSource(audio);
    return { source, release: () => source.dispose() };
  }
  let entry = RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES.get(audio);
  if (!entry) {
    entry = {
      source: createRecordGardenMasterSignalSource(audio),
      references: 0,
      disposalTimer: 0,
    };
    RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES.set(audio, entry);
  }
  if (entry.disposalTimer) {
    globalThis.clearTimeout(entry.disposalTimer);
    entry.disposalTimer = 0;
  }
  entry.references += 1;
  let released = false;
  return {
    source: entry.source,
    release() {
      if (released) return;
      released = true;
      entry.references = Math.max(0, entry.references - 1);
      if (entry.references) return;
      entry.disposalTimer = globalThis.setTimeout(() => {
        entry.disposalTimer = 0;
        if (entry.references || RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES.get(audio) !== entry) return;
        RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES.delete(audio);
        entry.source.dispose();
      }, 0);
    },
  };
}

function createRecordGardenDirectorPreviewAdapters({ apiBase = "", signalSource = null, showGraph = null, onStatus = null } = {}) {
  const mediaEntries = new Map();
  const isfEntries = new Map();
  const stemEntries = new Map();
  let sequence = 0;

  const trimMedia = () => {
    while (mediaEntries.size > 4) {
      const [oldestKey, oldest] = [...mediaEntries.entries()]
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
      oldest.video?.pause?.();
      oldest.video?.removeAttribute?.("src");
      oldest.image?.removeAttribute?.("src");
      mediaEntries.delete(oldestKey);
    }
  };

  const mediaEntry = (cue) => {
    const uri = resolveGardenMediaUri(cue?.media?.uri || "", apiBase);
    const key = `${cue?.media?.kind || "unknown"}:${uri}`;
    let entry = mediaEntries.get(key);
    if (entry) {
      entry.lastUsed = ++sequence;
      return entry;
    }
    entry = { key, uri, lastUsed: ++sequence, video: null, image: null, status: "loading" };
    if (cue?.media?.kind === "video" && uri) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.src = uri;
      video.addEventListener("loadeddata", () => { entry.status = "ready"; });
      video.addEventListener("error", () => { entry.status = "failed"; });
      video.load();
      entry.video = video;
    } else if (uri) {
      const image = document.createElement("img");
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      image.onload = () => { entry.status = "ready"; };
      image.onerror = () => { entry.status = "failed"; };
      image.src = uri;
      entry.image = image;
    } else {
      entry.status = "failed";
    }
    mediaEntries.set(key, entry);
    trimMedia();
    return entry;
  };

  const media = async ({ context, frame }) => {
    const cue = frame.primaryMediaCue;
    const entry = mediaEntry(cue);
    const video = entry.video;
    if (video && video.readyState >= 1) {
      const sourceStart = Math.max(0, Number(cue.media?.sourceInSeconds) || 0);
      const cueElapsed = Math.max(0, frame.clock.seconds - Number(cue.startSeconds || 0));
      const declaredSourceEnd = Number(cue.media?.sourceOutSeconds);
      const sourceEnd = Number.isFinite(declaredSourceEnd) && declaredSourceEnd > sourceStart
        ? declaredSourceEnd
        : sourceStart + Math.max(0.04, Number(cue.durationSeconds) || 0.04);
      const cueDurationSeconds = Math.max(0.04, Number(cue.durationSeconds) || 0.04);
      const timeMapping = normalizeEchoTransitionTimeMapping(cue.media?.timeMapping, {
        sourceInSeconds: sourceStart,
        sourceOutSeconds: sourceEnd,
        cueDurationSeconds,
      });
      const target = mapEchoSourceWindowTime({
        elapsedSeconds: cueElapsed,
        durationSeconds: video.duration,
        sourceInSeconds: sourceStart,
        sourceOutSeconds: sourceEnd,
        loop: cue.media?.playbackMode === "loop",
        endGuardSeconds: 0.03,
        cueDurationSeconds,
        timeMapping,
      });
      video.loop = cue.media?.playbackMode === "loop" && !timeMapping;
      video.playbackRate = echoSourceWindowPlaybackRate({
        timeMapping,
        sourceInSeconds: sourceStart,
        sourceOutSeconds: sourceEnd,
        cueDurationSeconds,
      });
      if (Math.abs((Number(video.currentTime) || 0) - target) > 0.18) {
        try { video.currentTime = target; } catch {}
      }
      if (frame.clock.playing) video.play().catch(() => {});
      else video.pause();
    }
    const element = video?.readyState >= 2 ? video : entry.image?.complete ? entry.image : null;
    if (!element || !drawDirectorPreviewMedia(context, element, frame)) {
      drawDirectorPreviewFallback(context, context.canvas.width, context.canvas.height, frame);
    }
    return {
      cueId: cue.id,
      mediaId: cue.media?.id || null,
      sourceHash: cue.media?.sourceHash || null,
      status: element ? "presented" : entry.status,
      clockSeconds: frame.clock.seconds,
    };
  };

  const visualizerSignalFrames = (visualizer, frame, masterSignalFrame) => {
    const portableCard = visualizer.portableCard || {};
    const mappedStem = visualizer.stemMap?.find?.((entry) => entry?.role || entry?.stemFocus || entry?.stem)
      || visualizer.stemMap?.[0]
      || null;
    const stemFocus = portableCard.stemFocus
      || mappedStem?.role
      || mappedStem?.stemFocus
      || mappedStem?.stem
      || (typeof mappedStem === "string" ? mappedStem : "")
      || "master";
    const binding = resolveVerifiedEchoStemBinding(showGraph, {
      visualization: { card: { ...portableCard, stemFocus } },
      provenance: { stemFocus },
    });
    const frames = { master: masterSignalFrame };
    if (binding.status !== "verified-stem" || !binding.bus?.audioPath) {
      return {
        frames,
        requestedStem: binding.requested || stemFocus,
        signalStatus: binding.status || "master-fallback",
        fallbackReason: binding.fallbackReason || "",
      };
    }
    const requestedKey = normalizeEchoStemFocus(binding.requestedKey || binding.requested || stemFocus);
    const uri = resolveGardenMediaUri(binding.bus.audioPath, apiBase);
    const key = `${requestedKey}:${uri}`;
    let entry = stemEntries.get(key);
    if (!entry) {
      const resource = signalSource?.createStem?.(uri, {
        id: binding.bus.stemId || binding.requested,
        label: binding.bus.stemType || binding.requested,
        stemFocus: binding.requested,
        truthStatus: binding.bus.truthStatus,
      });
      entry = { resource, lastUsed: ++sequence };
      stemEntries.set(key, entry);
      while (stemEntries.size > 4) {
        const [oldestKey, oldest] = [...stemEntries.entries()]
          .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
        oldest.resource?.dispose?.();
        stemEntries.delete(oldestKey);
      }
    }
    entry.lastUsed = ++sequence;
    const stemFrame = entry.resource?.sample?.(frame.clock.seconds, { playing: frame.clock.playing });
    const stemReady = entry.resource?.status === "ready" && stemFrame?.status === "live";
    if (stemReady) {
      frames[binding.requested] = stemFrame;
      frames[requestedKey] = stemFrame;
    }
    return {
      frames,
      requestedStem: binding.requested,
      signalStatus: stemReady ? "verified-stem" : "verified-stem-buffering-master-fallback",
      fallbackReason: stemReady ? "" : entry.resource?.status || "stem-decoder-unavailable",
    };
  };

  const visualizers = async ({ context, frame }) => {
    const receipts = [];
    const masterSignalFrame = signalSource?.sample?.(frame.clock.seconds)
      || sampleEchoLiveSignalFrame(null, frame.clock.seconds, {
        id: "master",
        label: "Main track",
        source: "record-garden-master-audio",
      });
    for (const visualizer of frame.visualizers) {
      const signalBinding = visualizerSignalFrames(visualizer, frame, masterSignalFrame);
      const sourceId = String(visualizer.sourceId || visualizer.portableCard?.id || "");
      if (!sourceId) throw new Error(`Director visualizer ${visualizer.id || "unknown"} has no exact source ID.`);
      let entry = isfEntries.get(sourceId);
      const card = visualizer.portableCard || {
        id: visualizer.id,
        sourceId,
        shaderId: sourceId,
        parameters: { stemMap: visualizer.stemMap || [] },
      };
      if (!entry) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(960, context.canvas.width);
        canvas.height = Math.round(canvas.width * context.canvas.height / context.canvas.width);
        const surface = createEchoIsfSurface({ canvas, width: canvas.width, height: canvas.height, apiBase });
        entry = { canvas, surface, prepared: surface.prepare(card), lastUsed: ++sequence };
        isfEntries.set(sourceId, entry);
        while (isfEntries.size > 4) {
          const [oldestId, oldest] = [...isfEntries.entries()]
            .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
          oldest.surface.dispose();
          isfEntries.delete(oldestId);
        }
      }
      entry.lastUsed = ++sequence;
      const prepared = await entry.prepared;
      if (prepared?.status !== "ready") {
        throw new Error(`Exact ISF ${sourceId} is ${prepared?.status || "unavailable"}: ${prepared?.error || "prepare failed"}`);
      }
      const result = entry.surface.draw({
        card,
        time: frame.clock.seconds,
        mediaElement: context.canvas,
        mediaIdentity: {
          id: frame.primaryMediaCue?.media?.id || "director-program",
          sourceHash: frame.primaryMediaCue?.media?.sourceHash || frame.primaryMediaCue?.media?.uri || "director-program",
        },
        signalFrames: signalBinding.frames,
        composition: visualizer.composition,
        width: entry.canvas.width,
        height: entry.canvas.height,
      });
      if (result?.status !== "ready") {
        throw new Error(`Exact ISF ${sourceId} draw failed: ${result?.error || result?.status || "unknown"}`);
      }
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1,
        Number(visualizer.composition?.opacity ?? 1)
        * Number(visualizer.composition?.mix ?? 1)
        * Number(visualizer.composition?.transitionAlpha ?? 1),
      ));
      context.globalCompositeOperation = previewCanvasBlendMode(visualizer.composition?.blend);
      context.drawImage(entry.canvas, 0, 0, context.canvas.width, context.canvas.height);
      context.restore();
      receipts.push({
        id: visualizer.id,
        sourceId,
        sourceHash: result.sourceHash,
        status: result.status,
        signalStatus: masterSignalFrame.status,
        signalTruthStatus: masterSignalFrame.truthStatus,
        requestedStem: signalBinding.requestedStem,
        stemSignalStatus: signalBinding.signalStatus,
        stemFallbackReason: signalBinding.fallbackReason,
      });
    }
    return receipts;
  };

  const transition = ({ context, frame }) => {
    const opacity = Math.max(0, Math.min(1, Number(frame.transition?.opacity ?? 1)));
    if (opacity < 1) {
      context.save();
      context.globalCompositeOperation = "destination-in";
      context.fillStyle = `rgba(255,255,255,${opacity})`;
      context.fillRect(0, 0, context.canvas.width, context.canvas.height);
      context.restore();
    }
    if (frame.transition?.kind === "scanline-dissolve") {
      context.save();
      context.globalAlpha = 0.13 * (1 - opacity);
      context.strokeStyle = "#8fffe8";
      for (let y = 0; y < context.canvas.height; y += 8) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(context.canvas.width, y);
        context.stroke();
      }
      context.restore();
    }
    return { ...frame.transition };
  };

  const automation = ({ context, frame }) => {
    const accent = frame.automation?.accents?.at(-1);
    if (accent) {
      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha = Math.max(0, (1 - Number(accent.progress || 0)) * 0.18);
      context.fillStyle = "#f6c96d";
      context.fillRect(0, 0, context.canvas.width, context.canvas.height);
      context.restore();
    }
    return {
      visualTime: frame.automation?.visualTime?.map((event) => event.id) || [],
      accents: frame.automation?.accents?.map((event) => event.id) || [],
      effects: frame.automation?.effects?.map((event) => event.id) || [],
    };
  };

  const lyrics = ({ context, frame }) => {
    const template = frame.lyrics?.templateFrame;
    if (!template?.visible) return { visible: false };
    const text = String(template.displayText || frame.lyrics?.line?.text || "").trim();
    if (!text) return { visible: false };
    const width = context.canvas.width;
    const height = context.canvas.height;
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `800 ${Math.max(26, Math.round(width * 0.038))}px system-ui, sans-serif`;
    const metrics = context.measureText(text);
    const panelWidth = Math.min(width * 0.9, metrics.width + width * 0.08);
    context.fillStyle = "rgba(4,10,14,.72)";
    context.fillRect((width - panelWidth) / 2, height * 0.77, panelWidth, height * 0.13);
    context.fillStyle = "#f8f0d8";
    context.shadowColor = "#56f0cf";
    context.shadowBlur = 14;
    context.fillText(text, width / 2, height * 0.835, panelWidth - width * 0.04);
    context.restore();
    return { visible: true, lineId: frame.lyrics?.line?.id || null, templateId: template.templateId || null };
  };

  return {
    adapters: { media, visualizers, transition, automation, lyrics },
    dispose() {
      mediaEntries.forEach((entry) => {
        entry.video?.pause?.();
        entry.video?.removeAttribute?.("src");
        entry.image?.removeAttribute?.("src");
      });
      mediaEntries.clear();
      isfEntries.forEach((entry) => entry.surface.dispose());
      isfEntries.clear();
      stemEntries.forEach((entry) => entry.resource?.dispose?.());
      stemEntries.clear();
      onStatus?.({ status: "disposed" });
    },
  };
}

function recordGardenAcceptanceReviewEnabled() {
  try {
    return new URLSearchParams(globalThis.location?.search || "").get("recordGardenReview") === "1";
  } catch {
    return false;
  }
}

function createLazyEchoRecordVisualCardResolver(options = {}) {
  let resolver = null;
  let resolverPromise = null;
  let generation = 0;
  const cancelledVisualIds = new Set();
  const ensureResolver = async () => {
    if (resolver) return resolver;
    resolverPromise ||= import("../domain/echo-record-card-resolution.js")
      .then(({ createEchoRecordVisualCardResolver }) => {
        resolver = createEchoRecordVisualCardResolver(options);
        return resolver;
      });
    return resolverPromise;
  };
  const resolve = async (input = {}) => {
    const visualId = String(input?.visual?.id || "");
    const requestGeneration = generation;
    cancelledVisualIds.delete(visualId);
    const activeResolver = await ensureResolver();
    if (requestGeneration !== generation || cancelledVisualIds.has(visualId)) {
      throw abortError("Card resolution cancelled");
    }
    return activeResolver(input);
  };
  resolve.cancelVisual = (visualId = "") => {
    const id = String(visualId || "");
    if (id) cancelledVisualIds.add(id);
    return resolver?.cancelVisual?.(id) ?? Boolean(id);
  };
  resolve.clear = () => {
    generation += 1;
    cancelledVisualIds.clear();
    resolver?.clear?.();
  };
  return resolve;
}

export default function EchoRecordGarden3DView({
  apiBase = "",
  avatars = [],
  sceneGraph = null,
  selectedSongId = "",
  onSelectSong,
  cinematicMode: controlledCinematicMode,
  onCinematicModeChange,
}) {
  const preferences = useMemo(readGardenPreferences, []);
  const acceptanceReviewEnabled = useMemo(recordGardenAcceptanceReviewEnabled, []);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const visualInspectorRef = useRef(null);
  const cinematicToggleRef = useRef(null);
  const cinematicReturnFocusRef = useRef(null);
  const gameRef = useRef(null);
  const directorPreviewRuntimeRef = useRef(null);
  const directorAudioSignalRef = useRef(null);
  const projectCacheRef = useRef(new Map());
  const projectPendingRef = useRef(new Map());
  const requestRef = useRef(0);
  const requestControllerRef = useRef(null);
  const placementControllerRef = useRef(null);
  const placementAttemptRef = useRef(0);
  const placementLatencySamplesRef = useRef(
    recordGardenDiagnostics().placementLatency?.samples || [],
  );
  const hoverPreviewTimerRef = useRef(0);
  const hoverPreviewSongRef = useRef("");
  const persistenceTimerRef = useRef(0);
  const pendingPreferenceRef = useRef(null);
  const cardRequestGenerationRef = useRef(0);
  const cardResolutionRef = useRef(null);
  const pendingCardRevealRef = useRef(false);
  const directorBoundaryRef = useRef("");
  const seekGestureRef = useRef(null);
  const recordingSessionRef = useRef(null);
  const failedCaptureRef = useRef(null);
  const weatherRecordRef = useRef("");
  const weatherCycleRef = useRef(-1);
  const catalogRevalidationAtRef = useRef(0);
  const actionsRef = useRef({});
  const syncDirectorVisualClockRef = useRef(() => {});
  const crateButtonRefs = useRef(new Map());
  const initialSongIdRef = useRef(selectedSongId);
  const crateOrderRef = useRef(preferences.crateOrder);
  const cratePageCountRef = useRef(1);
  const recordTransformsRef = useRef(preferences.recordTransforms);
  const restoredSurfacePageRef = useRef({
    songId: preferences.surfaceSongId || preferences.placedSongId || preferences.selectedSongId,
    consumed: false,
  });
  const [loadState, setLoadState] = useState({ status: "loading", error: "" });
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState(preferences.query);
  const [perspective, setPerspective] = useState(preferences.perspective);
  const [catalogSort, setCatalogSort] = useState(preferences.sort || "album");
  const [cratePage, setCratePage] = useState(preferences.cratePage);
  const [selectedRecordId, setSelectedRecordId] = useState(selectedSongId || preferences.selectedSongId);
  const [placedRecordId, setPlacedRecordId] = useState(preferences.placedSongId);
  const [activeProjectPacket, setActiveProjectPacket] = useState(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [projectLoadError, setProjectLoadError] = useState("");
  const [visuals, setVisuals] = useState([]);
  const [directorCompositeVisual, setDirectorCompositeVisual] = useState(null);
  const [visualsSongId, setVisualsSongId] = useState("");
  const [surfacePage, setSurfacePage] = useState(preferences.surfacePage);
  const [selectedVisualId, setSelectedVisualId] = useState(preferences.selectedVisualId);
  const [recordTransforms, setRecordTransforms] = useState(preferences.recordTransforms);
  const [printedCards, setPrintedCards] = useState(preferences.printedCards || []);
  const [cardResolution, setCardResolution] = useState(() => initialCardResolution(preferences.cardJob));
  const [playback, setPlayback] = useState(() => initialPlaybackState(preferences.playbackSeconds));
  const [directorVisualClock, setDirectorVisualClock] = useState(
    Math.max(0, Number(preferences.playbackSeconds) || 0),
  );
  const [muted, setMuted] = useState(preferences.muted);
  const [notice, setNotice] = useState(
    preferences.cardJob?.status === "interrupted"
      ? "A previous Card request was interrupted. Return to its visual to retry."
      : "Choose a record, then drag it onto the player.",
  );
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [sceneRevision, setSceneRevision] = useState(0);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [localCinematicMode, setLocalCinematicMode] = useState(false);
  const [hoverPreviewRecordId, setHoverPreviewRecordId] = useState("");
  const [weatherPhase, setWeatherPhase] = useState("high-noon");
  const [captureState, setCaptureState] = useState(initialRecordGardenCaptureState);
  const [reducedMotion, setReducedMotion] = useState(() => (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  ));
  const cinematicMode = typeof controlledCinematicMode === "boolean"
    ? controlledCinematicMode
    : localCinematicMode;
  const captureLocked = ["preparing", "recording", "finalizing", "saving"].includes(captureState.status);
  const setCinematicMode = useCallback((nextValue) => {
    const next = typeof nextValue === "function" ? nextValue(cinematicMode) : nextValue;
    setLocalCinematicMode(Boolean(next));
    onCinematicModeChange?.(Boolean(next));
  }, [cinematicMode, onCinematicModeChange]);
  const resolveVisualCard = useMemo(
    () => createLazyEchoRecordVisualCardResolver({ apiBase }),
    [apiBase],
  );
  cardResolutionRef.current = cardResolution;

  useEffect(() => {
    const lease = acquireRecordGardenMasterSignalSource(audioRef.current);
    const signalSource = lease.source;
    directorAudioSignalRef.current = signalSource;
    return () => {
      if (directorAudioSignalRef.current === signalSource) directorAudioSignalRef.current = null;
      lease.release();
    };
  }, []);

  useEffect(() => {
    directorAudioSignalRef.current?.setMonitorMuted?.(muted);
  }, [muted]);

  const enterCinematicMode = useCallback(() => {
    cinematicReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : cinematicToggleRef.current;
    setCinematicMode(true);
    globalThis.requestAnimationFrame?.(() => canvasRef.current?.focus?.());
  }, [setCinematicMode]);

  const exitCinematicMode = useCallback(() => {
    setCinematicMode(false);
    globalThis.requestAnimationFrame?.(() => {
      const target = cinematicReturnFocusRef.current || cinematicToggleRef.current;
      target?.focus?.();
    });
  }, [setCinematicMode]);

  useEffect(() => {
    if (!cinematicMode) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exitCinematicMode();
    };
    globalThis.addEventListener?.("keydown", handleKeyDown);
    return () => globalThis.removeEventListener?.("keydown", handleKeyDown);
  }, [cinematicMode, exitCinematicMode]);

  useEffect(() => {
    if (cinematicMode && sceneError) exitCinematicMode();
  }, [cinematicMode, exitCinematicMode, sceneError]);

  useEffect(() => () => {
    const session = recordingSessionRef.current;
    if (!session) return;
    session.cancelled = true;
    if (session.interval) globalThis.clearInterval(session.interval);
    if (session.timeout) globalThis.clearTimeout(session.timeout);
    if (session.recorder?.state !== "inactive") {
      try { session.recorder.stop(); } catch {}
    }
    session.stream?.getTracks?.().forEach((track) => track.stop());
    recordingSessionRef.current = null;
  }, []);
  const flushPendingGardenPreferences = useCallback(() => {
    if (persistenceTimerRef.current) {
      globalThis.clearTimeout(persistenceTimerRef.current);
      persistenceTimerRef.current = 0;
    }
    const pending = pendingPreferenceRef.current;
    pendingPreferenceRef.current = null;
    if (pending) writeGardenPreferences(pending);
  }, []);
  const project = activeProjectPacket?.project || null;
  const referenceCards = activeProjectPacket?.references || [];
  const activeProjectSongId = placedRecordId || selectedRecordId;
  const syncDirectorVisualClock = useCallback((seconds, { force = false } = {}) => {
    if (!project) {
      directorBoundaryRef.current = "";
      return;
    }
    const clockSeconds = Math.max(0, Number(seconds) || 0);
    const selection = selectEchoRecordDirectorShots(project, clockSeconds);
    const signature = [
      projectSongIdentity(project),
      selection.currentIndex,
      selection.nextIndex,
      selection.current?.id || "gap",
      selection.current?.media?.contentHash || selection.current?.media?.uri || "",
    ].join("|");
    if (!force && directorBoundaryRef.current === signature) return;
    directorBoundaryRef.current = signature;
    setDirectorVisualClock(clockSeconds);
  }, [project]);
  syncDirectorVisualClockRef.current = syncDirectorVisualClock;

  useEffect(() => () => {
    cardRequestGenerationRef.current += 1;
    resolveVisualCard.clear();
  }, [resolveVisualCard]);

  const selectedRecord = useMemo(
    () => records.find((record) => record.songId === selectedRecordId) || null,
    [records, selectedRecordId],
  );
  const placedRecord = useMemo(
    () => records.find((record) => record.songId === placedRecordId) || null,
    [records, placedRecordId],
  );
  useEffect(() => {
    if (!placedRecordId || weatherRecordRef.current === placedRecordId) return;
    weatherRecordRef.current = placedRecordId;
    weatherCycleRef.current = (weatherCycleRef.current + 1) % RECORD_GARDEN_WEATHER_PHASES.length;
    const nextPhase = RECORD_GARDEN_WEATHER_PHASES[weatherCycleRef.current];
    setWeatherPhase(nextPhase);
    gameRef.current?.setWeatherPhase?.(nextPhase);
  }, [placedRecordId]);
  const recordBySongId = useMemo(
    () => new Map(records.map((record) => [record.songId, record])),
    [records],
  );
  useEffect(() => {
    if (placedRecordId || hoverPreviewSongRef.current) return;
    const audio = audioRef.current;
    const record = records.find((candidate) => candidate.songId === selectedRecordId);
    const audioUri = resolveGardenMediaUri(record?.audio?.uri || "", apiBase);
    if (!audio || !audioUri || audio.getAttribute("src") === audioUri) return;
    audio.pause();
    audio.preload = "auto";
    audio.src = audioUri;
    audio.load();
  }, [apiBase, placedRecordId, records, selectedRecordId]);
  const filteredRecords = useMemo(
    () => sortEchoRecordCatalog(
      records.filter((record) => recordMatchesQuery(record, query, perspective)),
      catalogSort,
    ),
    [catalogSort, perspective, query, records],
  );
  const cratePageCount = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PER_CRATE));
  cratePageCountRef.current = cratePageCount;
  const crateRecords = useMemo(() => (
    filteredRecords.slice(cratePage * RECORDS_PER_CRATE, (cratePage + 1) * RECORDS_PER_CRATE)
  ), [cratePage, filteredRecords]);
  const mediaWindow = useMemo(
    () => selectEchoRecordMediaWindow(visuals, surfacePage, {
      visibleCount: SCREEN_COUNT,
      warmCount: SCREEN_COUNT,
    }),
    [surfacePage, visuals],
  );
  const surfacePageCount = mediaWindow.pageCount;
  const visibleVisuals = mediaWindow.visible;
  const directorWarmVisuals = useMemo(() => (
    project
      ? buildEchoRecordDirectorWarmSurfaces({
        project,
        clockSeconds: directorVisualClock,
        count: SCREEN_COUNT * 2,
        apiBase,
      }).map(toGardenVisual)
      : []
  ), [apiBase, directorVisualClock, project]);
  const warmVisuals = useMemo(
    () => selectGardenWarmVisuals(visibleVisuals, directorWarmVisuals, mediaWindow.warm),
    [directorWarmVisuals, mediaWindow.warm, visibleVisuals],
  );
  const selectedVisual = useMemo(
    () => visibleVisuals.find((visual) => visual.id === selectedVisualId) || visibleVisuals[0] || null,
    [selectedVisualId, visibleVisuals],
  );
  const directorVisual = useMemo(
    () => visuals.find((visual) => visual.role === "now-playing"
      || visual.role === "now-playing-hold")
      || visuals.find((visual) => visual.role?.startsWith("now-playing"))
      || null,
    [visuals],
  );
  const visualFamilyCoverage = useMemo(() => ([
    {
      id: "director",
      label: "Director",
      available: visuals.some((visual) => ["now-playing", "up-next"].includes(visual.role)),
    },
    {
      id: "reference",
      label: "References",
      available: visuals.some((visual) => visual.role === "reference"),
    },
    {
      id: "character",
      label: "Characters",
      available: visuals.some((visual) => visual.role === "character"),
    },
    {
      id: "scene",
      label: "Scenes",
      available: visuals.some((visual) => visual.role === "scene"),
    },
  ]), [visuals]);

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;
    const update = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const diagnostics = recordGardenDiagnostics();
    const cut = project?.echo_record_garden_director_cut || null;
    diagnostics.selectedSongId = selectedRecordId || "";
    diagnostics.placedSongId = placedRecordId || "";
    diagnostics.directorCutId = String(cut?.id || "");
    diagnostics.directorCutTitle = String(cut?.title || "");
    diagnostics.directorCutLegacy = isLegacyEchoRecordDirectionVariant(cut || {});
    diagnostics.currentCueId = String(directorVisual?.sourceId || directorVisual?.id || "");
    diagnostics.audioTime = playback.currentTime;
    diagnostics.audioState = playback.playing ? "playing" : placedRecordId ? "paused" : "idle";
    diagnostics.visualSurfaceCount = visuals.length;
    diagnostics.cinematicMode = cinematicMode;
    diagnostics.captureStatus = captureState.status;
    diagnostics.weatherPhase = weatherPhase;
    diagnostics.lastError = sceneError || playback.error || "";
  }, [
    captureState.status,
    cinematicMode,
    placedRecordId,
    playback.currentTime,
    playback.error,
    playback.playing,
    directorVisual,
    project,
    sceneError,
    selectedRecordId,
    visuals.length,
    weatherPhase,
  ]);

  useEffect(() => {
    const run = activeAcceptanceRun();
    if (run && reducedMotion) run.reducedMotionObserved = true;
  }, [reducedMotion]);

  useEffect(() => {
    const handleVisibility = () => {
      const diagnostics = recordGardenDiagnostics();
      diagnostics.visibilityState = document.visibilityState;
      if (document.hidden) {
        gameRef.current?.cancelInteraction?.();
        flushPendingGardenPreferences();
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setNotice("Playback paused while the Record Garden is hidden.");
        }
      }
    };
    const handleWindowBlur = () => gameRef.current?.cancelInteraction?.();
    document.addEventListener("visibilitychange", handleVisibility);
    globalThis.addEventListener?.("blur", handleWindowBlur);
    globalThis.addEventListener?.("pagehide", flushPendingGardenPreferences);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      globalThis.removeEventListener?.("blur", handleWindowBlur);
      globalThis.removeEventListener?.("pagehide", flushPendingGardenPreferences);
    };
  }, [flushPendingGardenPreferences]);

  const captureGardenPreferences = useCallback(() => {
    const sceneSnapshot = gameRef.current?.snapshot?.() || {};
    const crateOrder = records.length
      ? records.map((record) => record.songId)
      : crateOrderRef.current;
    const currentRecordIds = new Set(crateOrder);
    const savedRecordTransforms = Object.fromEntries(
      Object.entries({
        ...recordTransformsRef.current,
        ...recordTransforms,
        ...(sceneSnapshot.recordTransforms || {}),
      }).filter(([songId, transform]) => (
        currentRecordIds.has(songId)
        && transform?.manipulated === true
      )),
    );
    crateOrderRef.current = crateOrder;
    recordTransformsRef.current = savedRecordTransforms;
    return {
      muted,
      query,
      perspective,
      sort: catalogSort,
      cratePage,
      crateOrder,
      selectedSongId: selectedRecordId,
      placedSongId: placedRecordId,
      selectedVisualId,
      surfacePage,
      surfaceSongId: activeProjectSongId,
      playbackSeconds: playback.currentTime,
      recordTransforms: savedRecordTransforms,
      printedCards: printedCards.map((card) => ({
        ...card,
        sceneTransform: sceneSnapshot.printedCardTransforms?.[card.id]
          || card.sceneTransform
          || null,
      })),
      camera: sceneSnapshot.camera || preferences.camera,
      cardJob: persistedCardJob(cardResolution),
    };
  }, [
    activeProjectSongId,
    cameraRevision,
    cardResolution,
    catalogSort,
    cratePage,
    muted,
    perspective,
    placedRecordId,
    playback.currentTime,
    preferences.camera,
    printedCards,
    query,
    recordTransforms,
    records,
    selectedRecordId,
    selectedVisualId,
    surfacePage,
  ]);

  useEffect(() => {
    pendingPreferenceRef.current = captureGardenPreferences();
    if (persistenceTimerRef.current) return;
    persistenceTimerRef.current = globalThis.setTimeout(
      flushPendingGardenPreferences,
      240,
    );
  }, [captureGardenPreferences, flushPendingGardenPreferences]);

  useEffect(() => () => {
    flushPendingGardenPreferences();
  }, [flushPendingGardenPreferences]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setLoadState({ status: "loading", error: "" });
    fetch(`${browserApiBase(apiBase)}/api/echos/director-projects?summary=1`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Album index failed (${response.status})`);
        return response.json();
      })
      .then((payload) => {
        if (disposed) return;
        const normalizedRecords = normalizeEchoRecordSummaryRows(payload);
        const recovered = reconcileEchoRecordGardenSnapshot({
          ...preferences,
          crateOrder: crateOrderRef.current,
          recordTransforms: recordTransformsRef.current,
        }, {
          recordIds: normalizedRecords.map((record) => record.songId),
        });
        const recordsBySongId = new Map(normalizedRecords.map((record) => [record.songId, record]));
        const nextRecords = recovered.crateOrder
          .map((songId) => recordsBySongId.get(songId))
          .filter(Boolean);
        crateOrderRef.current = nextRecords.map((record) => record.songId);
        recordTransformsRef.current = recovered.recordTransforms;
        setRecords(nextRecords);
        setRecordTransforms(recovered.recordTransforms);
        setPrintedCards(recovered.printedCards || []);
        setCratePage(recovered.cratePage);
        if (recovered.cardJob) setCardResolution(initialCardResolution(recovered.cardJob));
        setLoadState({ status: "ready", error: "" });
        const preferred = [
          initialSongIdRef.current,
          recovered.selectedSongId,
          nextRecords[0]?.songId,
        ].find((songId) => nextRecords.some((record) => record.songId === songId));
        if (preferred) setSelectedRecordId(preferred);
        if (nextRecords.some((record) => record.songId === recovered.placedSongId)) {
          setPlacedRecordId(recovered.placedSongId);
        } else {
          setPlacedRecordId("");
          setPlayback(initialPlaybackState());
        }
      })
      .catch((error) => {
        if (disposed || error?.name === "AbortError") return;
        setLoadState({ status: "error", error: error?.message || "Album index unavailable" });
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    apiBase,
    catalogRevision,
    preferences,
  ]);

  useEffect(() => {
    const refreshLatestCuts = () => {
      if (globalThis.document?.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - catalogRevalidationAtRef.current < 750) return;
      catalogRevalidationAtRef.current = now;
      setCatalogRevision((revision) => revision + 1);
    };
    const refreshWhenVisible = () => {
      if (globalThis.document?.visibilityState === "visible") refreshLatestCuts();
    };
    globalThis.addEventListener?.("focus", refreshLatestCuts);
    globalThis.document?.addEventListener?.("visibilitychange", refreshWhenVisible);
    return () => {
      globalThis.removeEventListener?.("focus", refreshLatestCuts);
      globalThis.document?.removeEventListener?.("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const loadRecordProject = useCallback(async (songId) => {
    if (!songId) return null;
    const latestCut = recordBySongId.get(songId)?.director?.latestCut || null;
    const cutRevision = latestCut?.fingerprint
      || latestCut?.updatedAt
      || latestCut?.createdAt
      || latestCut?.timelineCount
      || "unversioned";
    const cacheKey = `${songId}:${latestCut?.id || "base"}:${cutRevision}`;
    const diagnostics = recordGardenDiagnostics();
    const cached = readCachedProjectPacket(projectCacheRef.current, cacheKey, diagnostics);
    if (cached) return cached;
    const pending = projectPendingRef.current.get(cacheKey);
    if (pending) return pending;
    requestControllerRef.current?.abort();
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setNotice("Opening the sleeve and cueing its visual constellation…");
    const base = browserApiBase(apiBase);
    const projectQuery = new URLSearchParams({ songId });
    if (latestCut?.id) projectQuery.set("variantId", latestCut.id);
    const request = Promise.all([
      fetch(`${base}/api/echos/director-project?${projectQuery.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      }),
      fetch(`${base}/api/echos/references/tarot-cards?songId=${encodeURIComponent(songId)}`, {
        signal: controller.signal,
        cache: "no-store",
      }),
    ]).then(async ([projectResponse, referenceResponse]) => {
      if (!projectResponse.ok) throw new Error(`Director project failed (${projectResponse.status})`);
      const projectPayload = await projectResponse.json();
      const referencePayload = referenceResponse.ok ? await referenceResponse.json() : { cards: [] };
      const nextProject = projectEchoRecordSelectedDirectorCut(projectPayload)
        || unwrapEchoDirectorProject(projectPayload);
      if (!nextProject) throw new Error("Director project payload did not include a song");
      if (
        latestCut?.id
        && nextProject.echo_record_garden_director_cut?.id !== latestCut.id
      ) {
        throw new Error(`The most recent Director cut (${latestCut.title || latestCut.id}) was not delivered exactly`);
      }
      const nextReferences = Array.isArray(referencePayload?.cards) ? referencePayload.cards : [];
      const cachedPacket = { project: nextProject, references: nextReferences };
      retainProjectPacket(projectCacheRef.current, cacheKey, cachedPacket, diagnostics);
      return cachedPacket;
    });
    projectPendingRef.current.set(cacheKey, request);
    try {
      const packet = await request;
      if (requestRef.current !== requestId) return packet;
      return packet;
    } finally {
      if (projectPendingRef.current.get(cacheKey) === request) {
        projectPendingRef.current.delete(cacheKey);
      }
    }
  }, [apiBase, recordBySongId]);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
    placementControllerRef.current?.abort();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    projectCacheRef.current.clear();
    projectPendingRef.current.clear();
    recordGardenDiagnostics().projectCacheEntries = 0;
  }, []);

  useEffect(() => {
    if (!activeProjectSongId) {
      setActiveProjectPacket(null);
      setProjectLoadError("");
      return undefined;
    }
    let active = true;
    setProjectLoadError("");
    setActiveProjectPacket((current) => (
      projectSongIdentity(current?.project) === activeProjectSongId ? current : null
    ));
    loadRecordProject(activeProjectSongId)
      .then((packet) => {
        if (!active) return;
        const activeRecord = recordBySongId.get(activeProjectSongId);
        if (!activeRecord) throw new Error("The active Record is no longer present in the Echo catalog");
        if (projectSongIdentity(packet?.project) !== activeProjectSongId) {
          throw new Error("Director project identity did not match the active record");
        }
        if (placedRecordId === activeProjectSongId) {
          assertRecordGardenProjectIdentity(activeRecord, packet?.project, apiBase);
        }
        setActiveProjectPacket(packet);
        setProjectLoadError("");
        const cutTitle = packet.project?.echo_record_garden_director_cut?.title;
        setNotice(
          cutTitle
            ? `${packet.project?.song_title || "Record"} is ready with the most recent Director cut: ${cutTitle}.`
            : `${packet.project?.song_title || "Record"} is ready for the player.`,
        );
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return;
        const message = error?.message || "unknown error";
        setProjectLoadError(message);
        setNotice(`Could not open this sleeve: ${message}`);
      });
    return () => {
      active = false;
    };
  }, [activeProjectSongId, apiBase, loadRecordProject, placedRecordId, projectRevision, recordBySongId]);

  useEffect(() => {
    const activeSongId = projectSongIdentity(project);
    if (!project || !placedRecordId || activeSongId !== placedRecordId) {
      directorPreviewRuntimeRef.current?.runtime?.dispose?.();
      directorPreviewRuntimeRef.current?.adapterBundle?.dispose?.();
      directorPreviewRuntimeRef.current = null;
      setDirectorCompositeVisual(null);
      return undefined;
    }
    let source;
    try {
      source = selectEchoDirectorPreviewSource(project);
    } catch (error) {
      setDirectorCompositeVisual(null);
      setNotice(`Director Preview parity is unavailable: ${error?.message || "the current cut is not hydrated"}`);
      return undefined;
    }
    const outputWidth = Math.min(1280, Math.max(640, Number(source.outputProfile?.width) || 1280));
    const declaredWidth = Math.max(1, Number(source.outputProfile?.width) || 1920);
    const declaredHeight = Math.max(1, Number(source.outputProfile?.height) || 1080);
    const outputHeight = Math.max(360, Math.round(outputWidth * declaredHeight / declaredWidth));
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const initialContext = outputCanvas.getContext("2d");
    if (initialContext) {
      drawDirectorPreviewFallback(initialContext, outputWidth, outputHeight, {
        song: source.song,
      }, "PREPARING EXACT DIRECTOR PREVIEW");
    }
    const adapterBundle = createRecordGardenDirectorPreviewAdapters({
      apiBase,
      signalSource: directorAudioSignalRef.current,
      showGraph: source.showGraph,
      onStatus: (status) => {
        if (status?.status && status.status !== "disposed") {
          recordGardenDiagnostics().directorPreviewAdapterStatus = status.status;
        }
      },
    });
    const runtime = createEchoDirectorPreviewRuntime({
      canvas: outputCanvas,
      source,
      clock: () => {
        const audio = audioRef.current;
        return {
          currentTime: Number(audio?.currentTime) || 0,
          duration: Number(audio?.duration) || projectDuration(project),
          playing: Boolean(audio && !audio.paused && !audio.ended),
          source: "record-garden-master-audio",
        };
      },
      adapters: adapterBundle.adapters,
      strictParity: true,
      manageCanvasSize: false,
      onError: (error, diagnostic) => {
        recordGardenDiagnostics().directorPreviewError = diagnostic;
        setNotice(`Director Preview held its last complete frame: ${error?.message || "parity renderer error"}`);
      },
    });
    const runtimeBinding = { runtime, adapterBundle, canvas: outputCanvas, source };
    directorPreviewRuntimeRef.current = runtimeBinding;
    setDirectorCompositeVisual({
      id: `director-composite:${source.song.id}:${source.cut.id}`,
      canvas: outputCanvas,
      canvasKey: `${source.song.id}:${source.cut.id}:${source.cut.fingerprint || "unfingerprinted"}`,
      songId: source.song.id,
      title: `${source.song.title} · ${source.cut.title}`,
      kind: "director-composite",
      kindLabel: "Exact Director Preview",
      role: "director-composite",
      clockLocked: true,
      sourceType: "director-preview-runtime",
      sourceId: source.cut.id,
      source: {
        revisionId: source.cut.fingerprint || source.cut.id,
        cutId: source.cut.id,
        cutTitle: source.cut.title,
      },
      rights: project.rights || null,
      directorPreview: true,
    });
    runtime.start();
    return () => {
      if (directorPreviewRuntimeRef.current === runtimeBinding) {
        directorPreviewRuntimeRef.current = null;
      }
      runtime.dispose();
      adapterBundle.dispose();
    };
  }, [apiBase, placedRecordId, project]);

  useEffect(() => {
    if (!project) {
      setVisuals([]);
      setVisualsSongId("");
      return;
    }
    const nextVisuals = buildEchoRecordVisualSurfaces({
      project,
      referenceCards,
      avatars,
      sceneGraph,
      clockSeconds: directorVisualClock,
      limit: SCREEN_COUNT * 4,
      apiBase,
    }).map(toGardenVisual);
    setVisuals(nextVisuals);
    setVisualsSongId(projectSongIdentity(project));
    setSelectedVisualId((current) => (
      nextVisuals.some((visual) => visual.id === current) ? current : nextVisuals[0]?.id || ""
    ));
  }, [
    apiBase,
    avatars,
    directorVisualClock,
    project,
    referenceCards,
    sceneGraph,
  ]);

  useEffect(() => {
    const restoredSurface = restoredSurfacePageRef.current;
    if (
      !restoredSurface.consumed
      && activeProjectSongId
      && restoredSurface.songId === activeProjectSongId
    ) {
      restoredSurface.consumed = true;
      return;
    }
    setSurfacePage(0);
  }, [activeProjectSongId]);

  useEffect(() => {
    if (!visuals.length) return;
    setSurfacePage((current) => Math.min(current, Math.max(0, surfacePageCount - 1)));
  }, [surfacePageCount, visuals.length]);

  useEffect(() => {
    if (
      !records.length
      || !cardResolution.songId
      || ["idle", "complete", "unavailable"].includes(cardResolution.status)
      || records.some((record) => record.songId === cardResolution.songId)
    ) return;
    setCardResolution((current) => ({
      ...current,
      status: "unavailable",
      error: "The source song for the interrupted Card request is no longer available.",
      recoverable: false,
    }));
  }, [cardResolution.songId, cardResolution.status, records]);

  useEffect(() => {
    const activeSongId = projectSongIdentity(project);
    if (
      !project
      || visualsSongId !== activeSongId
      || !cardResolution.visualId
      || ["idle", "complete", "unavailable"].includes(cardResolution.status)
      || (cardResolution.songId && cardResolution.songId !== activeSongId)
      || visuals.some((visual) => visual.id === cardResolution.visualId)
    ) return;
    setCardResolution((current) => ({
      ...current,
      status: "unavailable",
      error: "The source visual for the interrupted Card request is no longer available.",
      recoverable: false,
    }));
  }, [
    cardResolution.songId,
    cardResolution.status,
    cardResolution.visualId,
    project,
    visuals,
    visualsSongId,
  ]);

  useEffect(() => {
    const projectSongId = projectSongIdentity(project);
    if (!projectSongId || projectSongId !== placedRecordId) return undefined;
    const audio = audioRef.current;
    const audioUri = projectAudioUri(project, apiBase);
    if (
      !audio
      || !audioUri
      || comparableGardenMediaUri(audio.getAttribute("src")) === comparableGardenMediaUri(audioUri)
    ) return undefined;
    const restoredTime = Math.max(0, Number(playback.currentTime) || 0);
    const restoreTime = () => {
      const duration = Number(audio.duration) || projectDuration(project);
      audio.currentTime = duration > 0 ? Math.min(restoredTime, Math.max(0, duration - 0.05)) : restoredTime;
    };
    audio.pause();
    audio.src = audioUri;
    audio.muted = false;
    directorAudioSignalRef.current?.setMonitorMuted?.(muted);
    audio.addEventListener("loadedmetadata", restoreTime, { once: true });
    audio.load();
    gameRef.current?.setPlacedRecord(placedRecordId);
    setNotice(`${project.song_title || "Record"} restored on the turntable, paused.`);
    return () => audio.removeEventListener("loadedmetadata", restoreTime);
  }, [apiBase, muted, placedRecordId, project]);

  const selectRecord = useCallback((songId, message = "") => {
    if (!songId) return;
    setSelectedRecordId(songId);
    onSelectSong?.(songId);
    if (message) setNotice(message);
    if (globalThis.matchMedia?.("(max-width: 760px)")?.matches) {
      globalThis.requestAnimationFrame?.(() => {
        visualInspectorRef.current?.scrollIntoView?.({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "nearest",
        });
      });
    }
  }, [onSelectSong, reducedMotion]);

  const handleCrateKeyDown = useCallback((event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (!crateRecords.length) return;
    noteAcceptanceAction("keyboard");
    const currentId = event.target?.closest?.("[data-song-id]")?.dataset?.songId || selectedRecordId;
    const currentIndex = Math.max(0, crateRecords.findIndex((record) => record.songId === currentId));
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = crateRecords.length - 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = Math.max(0, currentIndex - 1);
    } else {
      nextIndex = Math.min(crateRecords.length - 1, currentIndex + 1);
    }
    const nextRecord = crateRecords[nextIndex];
    if (!nextRecord) return;
    event.preventDefault();
    selectRecord(nextRecord.songId, `${nextRecord.title} selected.`);
    globalThis.requestAnimationFrame?.(() => crateButtonRefs.current.get(nextRecord.songId)?.focus());
  }, [crateRecords, selectRecord, selectedRecordId]);

  const placeRecord = useCallback(async (songId = selectedRecordId, { autoplay = true } = {}) => {
    if (!songId) return;
    if (captureLocked) {
      setNotice("Stop Record Mode before changing the record; the captured Card keeps one exact song and cut lineage.");
      return;
    }
    if (hoverPreviewTimerRef.current) {
      globalThis.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = 0;
    }
    hoverPreviewSongRef.current = "";
    placementControllerRef.current?.abort();
    const placementController = new AbortController();
    placementControllerRef.current = placementController;
    const record = recordBySongId.get(songId);
    const audio = audioRef.current;
    const audioUri = resolveGardenMediaUri(record?.audio?.uri || "", apiBase);
    const intentAtMs = recordGardenMonotonicNow();
    const warmed = Boolean(
      audio
      && audioUri
      && comparableGardenMediaUri(audio.getAttribute("src")) === comparableGardenMediaUri(audioUri)
      && audio.readyState >= 1
    );
    let placementTrace = {
      ...createEchoRecordPlacementLatencyState({
        recordId: record?.id || `echo-record:${songId}`,
        songId,
        mediaIdentity: [
          record?.audio?.id || "route-only",
          audioUri,
          record?.source?.revisionId || "unversioned",
          record?.director?.latestCut?.fingerprint || record?.director?.latestCut?.id || "base",
        ].join("|"),
        warmed,
        intentAtMs,
        retainedVisual: record?.preview?.posterUri || record?.cover?.uri
          ? "poster"
          : "labelled-fallback",
      }),
      attemptId: `${songId}:${++placementAttemptRef.current}:${Math.round(intentAtMs * 1_000)}`,
    };
    const publishPlacementTrace = () => {
      placementLatencySamplesRef.current = publishRecordGardenPlacementLatency(
        placementLatencySamplesRef.current,
        placementTrace,
      );
    };
    const markPlacement = (milestone, options = {}) => {
      placementTrace = markEchoRecordPlacementMilestone(placementTrace, milestone, {
        atMs: Math.max(intentAtMs, recordGardenMonotonicNow()),
        ...options,
      });
      publishPlacementTrace();
      return placementTrace;
    };
    publishPlacementTrace();

    audio?.pause();
    setSelectedRecordId(songId);
    setPlacedRecordId(songId);
    setPlayback(initialPlaybackState());
    gameRef.current?.setPlacedRecord(songId);
    markPlacement("seated");
    setNotice(`${record?.title || "Record"} is on the platter; audio is cueing while its Director package opens.`);
    try {
      if (!record) throw new Error("The selected Record is no longer present in the Echo catalog");
      if (!audioUri) throw new Error("This record has no routable audio source");
      if (!audio) throw new Error("The Record Garden audio player is unavailable");

      const audioUnlockPromise = autoplay
        ? (() => {
          markPlacement("audio-unlock-start");
          return Promise.resolve(directorAudioSignalRef.current?.resume?.())
          .then((result) => {
            if (placementController.signal.aborted) throw abortError();
            markPlacement("audio-unlocked");
            return result;
          });
        })()
        : Promise.resolve(false);
      const audioPreparationPromise = prepareRecordAudioElement(audio, audioUri, {
        signal: placementController.signal,
      });
      markPlacement("fetch-start");
      const directorPacketPromise = loadRecordProject(songId);
      setNotice(`${record.title || "Record"} is seated; its audio has priority while the latest Director cut hydrates.`);

      const audioPipeline = (async () => {
        const [validation] = await Promise.all([
          audioPreparationPromise,
          audioUnlockPromise,
        ]);
        if (placementController.signal.aborted) throw abortError();
        markPlacement("metadata");
        audio.currentTime = 0;
        audio.muted = false;
        directorAudioSignalRef.current?.setMonitorMuted?.(muted);
        setPlayback({
          ...initialPlaybackState(),
          duration: validation.duration || recordDuration(record),
          ready: validation.duration > 0,
        });
        if (!autoplay) return validation;
        try {
          await audio.play();
        } catch (error) {
          throw new Error(`Playback is waiting for permission: ${error?.message || "press Play again"}`);
        }
        if (placementController.signal.aborted) {
          audio.pause();
          throw abortError();
        }
        markPlacement("decoded");
        markPlacement("audio-start");
        setNotice(`${record.title || "Record"} is playing while its Director visuals finish opening.`);
        return validation;
      })();

      const directorPipeline = (async () => {
        const packet = await directorPacketPromise;
        if (placementController.signal.aborted) throw abortError();
        markPlacement("fetch-complete");
        const nextProject = packet?.project;
        if (!nextProject) throw new Error("The Director project is empty");
        assertRecordGardenProjectIdentity(record, nextProject, apiBase);

        const immediateVisuals = buildEchoRecordVisualSurfaces({
          project: nextProject,
          referenceCards: packet?.references || [],
          avatars,
          sceneGraph,
          clockSeconds: 0,
          limit: SCREEN_COUNT * 4,
          apiBase,
        }).map(toGardenVisual);
        const immediateWindow = selectEchoRecordMediaWindow(immediateVisuals, 0, {
          visibleCount: SCREEN_COUNT,
          warmCount: SCREEN_COUNT,
        });
        const immediateDirectorWarm = buildEchoRecordDirectorWarmSurfaces({
          project: nextProject,
          clockSeconds: 0,
          count: SCREEN_COUNT * 2,
          apiBase,
        }).map(toGardenVisual);
        const immediateDirectorVisual = immediateVisuals.find((visual) => (
          visual.role === "now-playing"
          || visual.role === "now-playing-hold"
          || visual.role?.startsWith("now-playing")
        )) || immediateWindow.visible[0] || null;
        const primaryPresentation = gameRef.current?.setVisuals(immediateWindow.visible, {
          activeSongId: songId,
          directorVisual: immediateDirectorVisual,
          warmVisuals: selectGardenWarmVisuals(
            immediateWindow.visible,
            immediateDirectorWarm,
            immediateWindow.warm,
          ),
        });
        markPlacement("director-graph-ready");
        setActiveProjectPacket(packet);
        noteAcceptanceAction("placement", { songId });
        onSelectSong?.(songId);
        const presentation = await waitForMediaPresentation(primaryPresentation);
        if (placementController.signal.aborted) throw abortError();
        if (["presented", "already-presented"].includes(presentation?.status)) {
          markPlacement("first-frame", { retainedVisual: "retained-frame" });
        }
        if (presentation?.status === "timeout") {
          setNotice(`${nextProject.song_title || "Record"} is playing while its first Director frame finishes decoding.`);
        } else if (presentation?.status === "failed") {
          setNotice(`${nextProject.song_title || "Record"} is playing with its retained visual; the first Director frame could not be presented.`);
        } else {
          setNotice(`${nextProject.song_title || "Record"} is on the turntable with the latest Director cut.`);
        }
        return packet;
      })();

      await Promise.all([audioPipeline, directorPipeline]);
    } catch (error) {
      if (error?.name === "AbortError") {
        markPlacement("cancelled");
        return;
      }
      placementController.abort();
      markPlacement("failed", { error: error?.message || "Record placement failed." });
      if (placementControllerRef.current === placementController) {
        audio?.pause();
        setPlayback((current) => ({
          ...current,
          playing: false,
          error: error?.message || "The record could not be cued.",
        }));
        setProjectLoadError(error?.message || "The record could not be cued.");
        setNotice(`Player could not cue the record: ${error?.message || "unknown error"}`);
      }
    } finally {
      if (placementControllerRef.current === placementController) {
        placementControllerRef.current = null;
      }
    }
  }, [
    apiBase,
    avatars,
    loadRecordProject,
    muted,
    onSelectSong,
    recordBySongId,
    sceneGraph,
    selectedRecordId,
    captureLocked,
  ]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!placedRecordId) {
      await placeRecord(selectedRecordId, { autoplay: true });
      return;
    }
    if (audio.paused) {
      await directorAudioSignalRef.current?.resume?.().catch(() => false);
      await audio.play().catch((error) => {
        setNotice(`Playback is waiting for permission: ${error?.message || "press Play again"}`);
      });
    } else {
      audio.pause();
    }
  }, [placeRecord, placedRecordId, selectedRecordId]);

  const directorCueIdAt = useCallback((seconds) => {
    if (!project) return "";
    const selection = selectEchoRecordDirectorShots(project, Math.max(0, Number(seconds) || 0));
    return String(selection.current?.id || selection.next?.id || "");
  }, [project]);

  const beginSeekGesture = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || seekGestureRef.current) return;
    const fromSeconds = Math.max(0, Number(audio.currentTime) || 0);
    seekGestureRef.current = {
      fromSeconds,
      fromCueId: directorCueIdAt(fromSeconds),
    };
  }, [directorCueIdAt]);

  const commitSeekGesture = useCallback(() => {
    const origin = seekGestureRef.current;
    seekGestureRef.current = null;
    const audio = audioRef.current;
    if (!origin || !audio) return;
    const toSeconds = Math.max(0, Number(audio.currentTime) || 0);
    noteAcceptanceAction("seek", {
      ...origin,
      toSeconds,
      toCueId: directorCueIdAt(toSeconds),
    });
  }, [directorCueIdAt]);

  const cancelSeekGesture = useCallback(() => {
    seekGestureRef.current = null;
  }, []);

  const seekPlayback = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(Number(seconds) || 0, Number(audio.duration) || playback.duration || 0));
    setPlayback((current) => ({ ...current, currentTime: audio.currentTime }));
  }, [playback.duration]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      directorAudioSignalRef.current?.setMonitorMuted?.(next);
      setNotice(next ? "Record player muted." : "Record player sound on.");
      return next;
    });
  }, []);

  const ejectRecord = useCallback(() => {
    if (captureLocked) {
      setNotice("Stop Record Mode before returning the source record to the crate.");
      return;
    }
    placementControllerRef.current?.abort();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlacedRecordId("");
    setPlayback(initialPlaybackState());
    gameRef.current?.setPlacedRecord("");
    setNotice("Record returned to the crate. Choose another sleeve when you are ready.");
  }, [captureLocked]);

  const clearCrateFilters = useCallback(() => {
    setQuery("");
    setPerspective("all");
    setCratePage(0);
    setNotice("Record crate filters cleared.");
  }, []);

  const moveSurfacePage = useCallback((nextPage) => {
    const bounded = Math.max(0, Math.min(surfacePageCount - 1, Number(nextPage) || 0));
    const nextVisible = visuals.slice(bounded * SCREEN_COUNT, (bounded + 1) * SCREEN_COUNT);
    setSurfacePage(bounded);
    if (bounded !== surfacePage) noteAcceptanceAction("surface-page");
    setSelectedVisualId(nextVisible[0]?.id || "");
    if (nextVisible[0]) {
      setNotice(`Showing ${surfaceKindLabel(nextVisible[0])} and nearby album surfaces.`);
    }
  }, [surfacePage, surfacePageCount, visuals]);

  const openCardJobSource = useCallback(() => {
    const sourceSongId = cardResolution.songId;
    const sourceVisualId = cardResolution.visualId;
    if (!sourceSongId || !records.some((record) => record.songId === sourceSongId)) {
      setCardResolution((current) => ({
        ...current,
        status: "unavailable",
        error: "The source song for this Card request is no longer available.",
        recoverable: false,
      }));
      return;
    }
    pendingCardRevealRef.current = true;
    if (placedRecordId && placedRecordId !== sourceSongId) ejectRecord();
    selectRecord(sourceSongId, "Opening the source record for the interrupted Card request…");
    if (visualsSongId !== sourceSongId) return;
    const sourceIndex = visuals.findIndex((visual) => visual.id === sourceVisualId);
    if (sourceIndex < 0) {
      pendingCardRevealRef.current = false;
      setCardResolution((current) => ({
        ...current,
        status: "unavailable",
        error: "The source visual for this Card request is no longer available.",
        recoverable: false,
      }));
      return;
    }
    pendingCardRevealRef.current = false;
    setSurfacePage(Math.floor(sourceIndex / SCREEN_COUNT));
    setSelectedVisualId(sourceVisualId);
    globalThis.requestAnimationFrame?.(() => gameRef.current?.focusVisual(sourceVisualId));
  }, [
    cardResolution.songId,
    cardResolution.visualId,
    ejectRecord,
    placedRecordId,
    records,
    selectRecord,
    visuals,
    visualsSongId,
  ]);

  useEffect(() => {
    if (
      !pendingCardRevealRef.current
      || !cardResolution.songId
      || !cardResolution.visualId
      || visualsSongId !== cardResolution.songId
    ) return;
    pendingCardRevealRef.current = false;
    const sourceIndex = visuals.findIndex((visual) => visual.id === cardResolution.visualId);
    if (sourceIndex < 0) {
      setCardResolution((current) => ({
        ...current,
        status: "unavailable",
        error: "The source visual for this Card request is no longer available.",
        recoverable: false,
      }));
      return;
    }
    setSurfacePage(Math.floor(sourceIndex / SCREEN_COUNT));
    setSelectedVisualId(cardResolution.visualId);
    globalThis.requestAnimationFrame?.(
      () => gameRef.current?.focusVisual(cardResolution.visualId),
    );
    setNotice("The original Card source is selected and ready to retry.");
  }, [
    cardResolution.songId,
    cardResolution.visualId,
    visuals,
    visualsSongId,
  ]);

  const generateCardForVisual = useCallback(async (visual = selectedVisual) => {
    if (!visual) return;
    const previousResolution = cardResolutionRef.current;
    const requestGeneration = cardRequestGenerationRef.current + 1;
    cardRequestGenerationRef.current = requestGeneration;
    if (
      previousResolution?.status === "resolving"
      && previousResolution.visualId
    ) {
      resolveVisualCard.cancelVisual?.(previousResolution.visualId);
    }
    const activeSongId = projectSongIdentity(project);
    const visualSongId = String(visual.songId || "");
    const sourceSongId = visualSongId || activeSongId;
    const startedAt = new Date().toISOString();
    const cardClockSeconds = Math.max(
      0,
      Number(audioRef.current?.currentTime) || playback.currentTime,
    );
    const pendingRequestKey = [
      sourceSongId || "unknown-song",
      visual.id,
      Math.round(cardClockSeconds * 1000),
    ].join("|");
    const pendingResolution = {
      status: "resolving",
      visualId: visual.id,
      songId: sourceSongId,
      requestKey: pendingRequestKey,
      startedAt,
      error: "",
      recoverable: true,
    };
    setSelectedVisualId(visual.id);
    cardResolutionRef.current = pendingResolution;
    setCardResolution(pendingResolution);
    setNotice(`Printing the Hapa Card attached to ${visual.title || "this visual"}…`);
    try {
      if (visualSongId && activeSongId && visualSongId !== activeSongId) {
        throw new Error("The selected visual no longer belongs to the record on the player");
      }
      const resolution = await resolveVisualCard({
        visual,
        project,
        clockSeconds: cardClockSeconds,
      });
      if (requestGeneration !== cardRequestGenerationRef.current) return;
      if (
        visual.resolutionPolicy === "exact-id-or-fail"
        && visual.previewIntent?.card?.id
        && resolution.card?.id !== visual.previewIntent.card.id
      ) {
        throw new Error(`Exact Preview Card identity changed from ${visual.previewIntent.card.id} to ${resolution.card?.id || "missing"}`);
      }
      const printed = resolution.card;
      const attached = {
        ...printed,
        echoRecordAttachment: {
          ...(printed.echoRecordAttachment || {}),
          sourceVisualId: visual.id,
          sourceSongId: visualSongId || activeSongId,
          sourceCardId: visual.attachment?.cardId
            || visual.attachment?.lookupId
            || visual.provenance?.mediaCardId
            || visual.sourceId
            || null,
          sourceRevisionId: printed.revisionId
            || printed.referenceAtlas?.revisionId
            || printed.contentHash
            || printed.content_hash
            || printed.updatedAt
            || printed.updated_at
            || resolution.receipt?.revisionId
            || resolution.receipt?.appearanceId
            || visual.attachment?.card?.revisionId
            || null,
          directorRevisionId: visual.source?.revisionId
            || visual.provenance?.referenceRevisionId
            || visual.provenance?.revisionId
            || null,
          atSeconds: resolution.timestampMs / 1000 || cardClockSeconds,
          surface: "echo-record-garden",
          truthStatus: resolution.truthStatus,
          resolutionSchema: resolution.schemaVersion,
          requestKey: resolution.requestKey,
          printReceipt: resolution.receipt || null,
          previewIntent: visual.previewIntent || null,
          presentation: {
            id: visual.id,
            sourceId: visual.sourceId || visual.mediaId || visual.id,
            songId: visualSongId || activeSongId,
            title: visual.title,
            kind: visual.kind,
            mediaUri: visual.mediaUri,
            videoUri: visual.videoUri,
            imageUri: visual.imageUri,
            posterUri: visual.posterUri,
            sourceStartSeconds: visual.sourceStartSeconds,
            sourceEndSeconds: visual.sourceEndSeconds,
            durationSeconds: visual.durationSeconds,
            playbackMode: "loop",
            clockLocked: false,
            source: visual.source || null,
          },
        },
      };
      setPrintedCards((current) => [attached, ...current.filter((item) => item.id !== attached.id)].slice(0, 5));
      gameRef.current?.spawnPrintedCard(attached);
      const completedResolution = {
        status: "complete",
        visualId: visual.id,
        songId: sourceSongId,
        requestKey: resolution.requestKey || "",
        startedAt,
        error: "",
        recoverable: true,
      };
      cardResolutionRef.current = completedResolution;
      setCardResolution(completedResolution);
      const acceptanceRun = activeAcceptanceRun();
      if (acceptanceRun) {
        acceptanceRun.cardEvidence = [
          ...acceptanceRun.cardEvidence,
          {
            cardId: String(attached.id || ""),
            visualId: String(visual.id || ""),
            sourceSongId: String(visualSongId || activeSongId || ""),
            sourceCardId: String(
              visual.attachment?.cardId
              || visual.attachment?.lookupId
              || visual.provenance?.mediaCardId
              || visual.sourceId
              || "",
            ),
            sourceRevisionId: String(
              attached.echoRecordAttachment?.sourceRevisionId
              || "",
            ),
            cardRevisionId: String(
              attached.echoRecordAttachment?.sourceRevisionId
              || "",
            ),
            cardSchemaVersion: String(attached.schemaVersion || ""),
            truthStatus: String(resolution.truthStatus || ""),
            mode: String(resolution.mode || ""),
            requestKey: String(resolution.requestKey || ""),
            receiptEdition: Math.max(0, Number(resolution.receipt?.edition) || 0),
            receiptAppearanceId: String(resolution.receipt?.appearanceId || ""),
            receiptSongId: String(resolution.receipt?.songId || ""),
            receiptTimestampMs: Math.max(0, Number(resolution.receipt?.timestampMs) || 0),
            capturedAt: new Date().toISOString(),
          },
        ].slice(-10);
        noteAcceptanceAction("card-result");
      }
      if (resolution.mode === "local-unminted-projection") {
        setNotice(`Generated a local, unminted Card projection for ${attached.title || "this visual"}.`);
      } else if (resolution.mode === "authoritative-edition-print") {
        setNotice(`Printed the immutable Song Card attached to ${attached.title || "this visual"}.`);
      } else {
        setNotice(`Generated attached Card: ${attached.title || "Hapa Card"}`);
      }
    } catch (error) {
      if (requestGeneration !== cardRequestGenerationRef.current) return;
      if (error?.name === "AbortError") {
        const idleResolution = initialCardResolution();
        cardResolutionRef.current = idleResolution;
        setCardResolution(idleResolution);
        setNotice(`Cancelled the Card request for ${visual.title || "this visual"}.`);
        return;
      }
      const message = error?.message || "Attached Card resolution failed";
      const blocked = ["rights_or_consent_blocked", "stale_attachment_blocked"].includes(error?.code);
      const failedResolution = {
        status: blocked ? "blocked" : "failed",
        visualId: visual.id,
        songId: sourceSongId,
        requestKey: error?.requestKey || pendingRequestKey,
        startedAt,
        error: message,
        recoverable: !blocked,
      };
      cardResolutionRef.current = failedResolution;
      setCardResolution(failedResolution);
      setNotice(`Could not print this visual's attached Card: ${message}`);
    }
  }, [playback.currentTime, project, resolveVisualCard, selectedVisual]);

  const generateCurrentDirectorPreviewCard = useCallback(async () => {
    const runtime = directorPreviewRuntimeRef.current?.runtime;
    if (!runtime) {
      setNotice("The exact Director Preview is still preparing; click the screen again when its first complete frame appears.");
      return;
    }
    let intent;
    try {
      intent = runtime.createCardPrintIntent({ surface: "echo-record-garden-cinematic-preview" });
    } catch (error) {
      setNotice(`This Director frame cannot print a Card: ${error?.message || "no exact Card is attached"}`);
      return;
    }
    const frame = runtime.snapshot()?.frame || runtime.frame();
    const cue = frame.primaryMediaCue;
    await generateCardForVisual({
      id: `director-preview-card:${intent.requestKey}`,
      songId: intent.song.id,
      title: intent.card.title || cue?.media?.title || `${intent.song.title} Director frame`,
      kind: cue?.media?.kind || "director-preview",
      kindLabel: "Exact Director Preview Card",
      role: "director-preview-exact-card",
      sourceType: "director-preview-exact-card",
      sourceId: intent.card.id,
      mediaId: cue?.media?.id || null,
      mediaUri: cue?.media?.uri || null,
      videoUri: cue?.media?.kind === "video" ? cue.media.uri : null,
      imageUri: cue?.media?.kind === "image" ? cue.media.uri : null,
      sourceStartSeconds: cue?.media?.sourceInSeconds || 0,
      sourceEndSeconds: cue?.media?.sourceOutSeconds
        || (cue?.media?.sourceInSeconds || 0) + (cue?.durationSeconds || 0),
      durationSeconds: cue?.durationSeconds || 0,
      playbackMode: cue?.media?.playbackMode || "once",
      timeMapping: cue?.media?.timeMapping || null,
      clockLocked: false,
      resolutionPolicy: "exact-id-or-fail",
      attachment: {
        cardId: intent.card.id,
        lookupId: intent.card.id,
        freshnessStatus: "current-preview-frame",
      },
      source: {
        revisionId: intent.cut.fingerprint || intent.cut.id,
        cutId: intent.cut.id,
        cueId: intent.cue.id,
      },
      provenance: {
        mediaCardId: intent.card.id,
        revisionId: intent.cut.fingerprint || intent.cut.id,
        frameKey: frame.frameKey,
      },
      previewIntent: intent,
      rights: project?.rights || {},
    });
  }, [generateCardForVisual, project]);

  const finalizeRecordGardenCapture = useCallback(async (session) => {
    if (!session || session.cancelled) return;
    if (session.interval) globalThis.clearInterval(session.interval);
    if (session.timeout) globalThis.clearTimeout(session.timeout);
    const durationSeconds = session.durationSeconds
      || Math.max(0.01, (performance.now() - session.startedAtMs) / 1000);
    session.durationSeconds = durationSeconds;
    const blob = session.blob || new Blob(session.chunks, { type: session.mimeType || "video/webm" });
    session.blob = blob;
    session.stream?.getTracks?.().forEach((track) => track.stop());
    if (recordingSessionRef.current === session) recordingSessionRef.current = null;
    if (!blob.size) {
      setCaptureState((current) => ({
        ...current,
        status: "failed",
        durationSeconds,
        error: "The browser did not produce a playable Garden recording.",
      }));
      setNotice("Record Mode stopped, but no media frames were captured.");
      return;
    }
    setCaptureState((current) => ({
      ...current,
      status: "saving",
      elapsedSeconds: durationSeconds,
      durationSeconds,
      error: "",
    }));
    try {
      const base = browserApiBase(apiBase);
      const sessionResponse = await fetch(`${base}/api/local-ui-session`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!sessionResponse.ok) {
        const failure = await sessionResponse.json().catch(() => ({}));
        throw new Error(failure.message || "The local Builder session could not authorize Card creation.");
      }
      const lineage = session.lineage || {};
      const title = lineage.title || "Echo State · Record Garden Session";
      const response = await fetch(`${base}/api/echo-record-garden/recordings`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": session.mimeType || blob.type || "video/webm",
          "Idempotency-Key": `record-garden:${session.id}`,
          "x-hapa-recording-id": session.id,
          "x-hapa-recording-title": encodeURIComponent(title).slice(0, 600),
          "x-hapa-recording-duration": durationSeconds.toFixed(3),
          "x-hapa-recording-width": String(session.width),
          "x-hapa-recording-height": String(session.height),
          "x-hapa-recording-fps": String(RECORD_GARDEN_CAPTURE_FPS),
          "x-hapa-recording-song-id": String(lineage.songId || "").slice(0, 240),
          "x-hapa-recording-song-title": encodeURIComponent(lineage.songTitle || "").slice(0, 600),
          "x-hapa-recording-cut-id": String(lineage.cutId || "").slice(0, 240),
          "x-hapa-recording-cut-title": encodeURIComponent(lineage.cutTitle || "").slice(0, 600),
          "x-hapa-recording-weather": normalizeWeatherPhase(lineage.weatherPhase),
          "x-hapa-recording-rights": String(lineage.rightsStatus || "review-required-before-public-release").slice(0, 80),
          "x-hapa-recording-audio-tracks": String(session.audioTrackCount),
          "x-hapa-actor-id": "local-record-garden-operator",
        },
        body: blob,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.card?.id) {
        const saveError = new Error(payload.message || payload.error || `Garden recording save failed (${response.status}).`);
        saveError.recordGardenFailure = payload;
        saveError.statusCode = response.status;
        throw saveError;
      }
      const card = payload.card;
      failedCaptureRef.current = null;
      setPrintedCards((current) => [card, ...current.filter((item) => item.id !== card.id)].slice(0, 5));
      gameRef.current?.spawnPrintedCard(card);
      setCaptureState({
        status: "complete",
        startedAt: session.startedAt,
        elapsedSeconds: durationSeconds,
        durationSeconds,
        cardId: card.id,
        cardTitle: card.title || title,
        error: "",
      });
      setNotice(`${card.title || "Record Garden session"} is now a durable local Hapa Card with verified custody.`);
    } catch (error) {
      const failurePayload = error?.recordGardenFailure && typeof error.recordGardenFailure === "object"
        ? error.recordGardenFailure
        : null;
      const durability = failurePayload?.durability && typeof failurePayload.durability === "object"
        ? failurePayload.durability
        : {};
      const durableTransactionRecorded = Boolean(
        failurePayload?.retrySafe
        && Object.values(durability).some(Boolean),
      );
      session.lastSaveFailure = failurePayload;
      failedCaptureRef.current = session;
      setCaptureState((current) => ({
        ...current,
        status: "failed",
        durationSeconds,
        error: error?.message || "The Garden recording could not become a Hapa Card.",
      }));
      setNotice(durableTransactionRecorded
        ? `Record Mode Card save is incomplete; Retry will safely resume its durable transaction: ${error?.message || "Card creation failed"}`
        : `Record Mode capture is preserved in this tab only; Retry will attempt Card creation again: ${error?.message || "Card creation failed"}`);
    }
  }, [apiBase]);

  const stopRecordMode = useCallback(() => {
    const session = recordingSessionRef.current;
    if (!session || session.recorder?.state === "inactive") return false;
    setCaptureState((current) => ({ ...current, status: "finalizing", error: "" }));
    try { session.recorder.requestData?.(); } catch {}
    session.recorder.stop();
    return true;
  }, []);

  const startRecordMode = useCallback(async () => {
    if (["preparing", "recording", "finalizing", "saving"].includes(captureState.status)) return false;
    const canvas = canvasRef.current;
    const mimeType = preferredRecordGardenCaptureMimeType();
    if (!placedRecordId || !playback.playing) {
      const error = "Place and play a record before starting Record Mode so the Card has exact song and cut lineage.";
      setCaptureState({ ...initialRecordGardenCaptureState(), status: "failed", error });
      setNotice(error);
      return false;
    }
    if (!sceneReady || !canvas || typeof canvas.captureStream !== "function" || !mimeType) {
      const error = "This browser cannot capture the live 3D Garden with MediaRecorder.";
      setCaptureState({ ...initialRecordGardenCaptureState(), status: "failed", error });
      setNotice(error);
      return false;
    }
    const activeRecord = recordBySongId.get(placedRecordId);
    const cut = project?.echo_record_garden_director_cut || null;
    if (!activeRecord?.songId || !cut?.id) {
      const error = "Record Mode is waiting for the placed record's exact song and Director cut identity.";
      setCaptureState({ ...initialRecordGardenCaptureState(), status: "failed", error });
      setNotice(error);
      return false;
    }
    setCaptureState({ ...initialRecordGardenCaptureState(), status: "preparing" });
    let provisionalTracks = [];
    let session = null;
    try {
      failedCaptureRef.current = null;
      await directorAudioSignalRef.current?.resume?.();
      const canvasStream = canvas.captureStream(RECORD_GARDEN_CAPTURE_FPS);
      const audioStream = directorAudioSignalRef.current?.captureStream?.();
      const videoTracks = canvasStream?.getVideoTracks?.() || [];
      const audioTracks = (audioStream?.getAudioTracks?.() || []).map((track) => track.clone());
      provisionalTracks = [...videoTracks, ...audioTracks];
      if (!videoTracks.length) throw new Error("The 3D Garden did not expose a captureable video track.");
      if (!audioTracks.length) throw new Error("The mastered Record Garden audio track is unavailable for capture.");
      const stream = new MediaStream([...videoTracks, ...audioTracks]);
      const startedAt = new Date().toISOString();
      const songTitle = activeRecord?.title || project?.song_title || "Echo State";
      session = {
        id: recordGardenRecordingId(),
        startedAt,
        startedAtMs: performance.now(),
        width: Math.max(1, canvas.width || canvas.clientWidth || 1280),
        height: Math.max(1, canvas.height || canvas.clientHeight || 720),
        mimeType,
        stream,
        audioTrackCount: audioTracks.length,
        chunks: [],
        recorder: null,
        interval: 0,
        timeout: 0,
        cancelled: false,
        lineage: {
          title: `${songTitle} · Record Garden Session`,
          songId: activeRecord.songId,
          songTitle,
          cutId: cut.id,
          cutTitle: cut.title || "",
          weatherPhase: normalizeWeatherPhase(weatherPhase),
          rightsStatus: project?.rights?.status
            || project?.rights?.licenseStatus
            || "review-required-before-public-release",
        },
      };
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: RECORD_GARDEN_CAPTURE_VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: 160_000,
      });
      session.recorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (!session.cancelled && event.data?.size) session.chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => void finalizeRecordGardenCapture(session), { once: true });
      recorder.addEventListener("error", (event) => {
        const message = event?.error?.message || "The browser interrupted Record Mode.";
        session.cancelled = true;
        if (session.interval) globalThis.clearInterval(session.interval);
        if (session.timeout) globalThis.clearTimeout(session.timeout);
        session.stream?.getTracks?.().forEach((track) => {
          try { track.stop(); } catch {}
        });
        if (recordingSessionRef.current === session) recordingSessionRef.current = null;
        setCaptureState((current) => ({ ...current, status: "failed", error: message }));
        setNotice(message);
      });
      recordingSessionRef.current = session;
      recorder.start(1_000);
      session.interval = globalThis.setInterval(() => {
        const elapsedSeconds = Math.max(0, (performance.now() - session.startedAtMs) / 1000);
        setCaptureState((current) => current.status === "recording"
          ? { ...current, elapsedSeconds }
          : current);
      }, 250);
      session.timeout = globalThis.setTimeout(() => {
        if (recordingSessionRef.current === session && recorder.state !== "inactive") stopRecordMode();
      }, RECORD_GARDEN_CAPTURE_MAX_SECONDS * 1000);
      setCaptureState({
        status: "recording",
        startedAt,
        elapsedSeconds: 0,
        durationSeconds: 0,
        cardId: "",
        cardTitle: "",
        error: "",
      });
      setNotice("Record Mode is capturing the 3D session and mastered song audio.");
      return true;
    } catch (error) {
      if (session?.interval) globalThis.clearInterval(session.interval);
      if (session?.timeout) globalThis.clearTimeout(session.timeout);
      if (session) session.cancelled = true;
      if (session?.recorder?.state && session.recorder.state !== "inactive") {
        try { session.recorder.stop(); } catch {}
      }
      if (recordingSessionRef.current === session) recordingSessionRef.current = null;
      provisionalTracks.forEach((track) => {
        try { track.stop(); } catch {}
      });
      setCaptureState({
        ...initialRecordGardenCaptureState(),
        status: "failed",
        error: error?.message || "Record Mode could not start.",
      });
      setNotice(error?.message || "Record Mode could not start.");
      return false;
    }
  }, [captureState.status, finalizeRecordGardenCapture, placedRecordId, playback.playing, project, recordBySongId, sceneReady, stopRecordMode, weatherPhase]);

  const retryRecordGardenCaptureSave = useCallback(() => {
    const session = failedCaptureRef.current;
    if (!session || !session.blob) return false;
    void finalizeRecordGardenCapture(session);
    return true;
  }, [finalizeRecordGardenCapture]);

  const toggleRecordMode = useCallback(() => {
    if (captureState.status === "recording") return stopRecordMode();
    void startRecordMode();
    return true;
  }, [captureState.status, startRecordMode, stopRecordMode]);

  const cancelCardResolution = useCallback((visual = selectedVisual) => {
    if (!visual?.id) return;
    cardRequestGenerationRef.current += 1;
    const cancelled = resolveVisualCard.cancelVisual?.(visual.id);
    const idleResolution = initialCardResolution();
    cardResolutionRef.current = idleResolution;
    setCardResolution(idleResolution);
    setNotice(
      cancelled
        ? `Cancelling the Card request for ${visual.title || "this visual"}…`
        : `Card request for ${visual.title || "this visual"} dismissed.`,
    );
  }, [resolveVisualCard, selectedVisual]);

  const stopHoverPreview = useCallback(({ preserveSource = false } = {}) => {
    if (hoverPreviewTimerRef.current) {
      globalThis.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = 0;
    }
    setHoverPreviewRecordId("");
    gameRef.current?.setPreviewRecord?.("");
    if (!hoverPreviewSongRef.current) return;
    hoverPreviewSongRef.current = "";
    const audio = audioRef.current;
    if (!audio || placedRecordId) return;
    audio.pause();
    if (!preserveSource) {
      audio.removeAttribute("src");
      audio.load();
    }
    setPlayback(initialPlaybackState());
  }, [placedRecordId]);

  const startRecordPreview = useCallback(async (songId = "") => {
    if (!songId || placedRecordId) {
      stopHoverPreview();
      return false;
    }
    const record = recordBySongId.get(songId);
    const audioUri = resolveGardenMediaUri(record?.audio?.uri || "", apiBase);
    const audio = audioRef.current;
    if (!record || !audioUri || !audio) return false;
    if (hoverPreviewSongRef.current && hoverPreviewSongRef.current !== songId) audio.pause();
    hoverPreviewSongRef.current = songId;
    if (comparableGardenMediaUri(audio.getAttribute("src")) !== comparableGardenMediaUri(audioUri)) {
      audio.src = audioUri;
      audio.currentTime = 0;
      audio.load();
    }
    audio.muted = false;
    directorAudioSignalRef.current?.setMonitorMuted?.(muted);
    await directorAudioSignalRef.current?.resume?.().catch(() => false);
    try {
      await audio.play();
      if (hoverPreviewSongRef.current !== songId || placedRecordId) {
        audio.pause();
        return false;
      }
      setHoverPreviewRecordId(songId);
      gameRef.current?.setPreviewRecord?.(songId);
      setNotice(`Previewing ${record.title}. Move away to stop, or place it on the player.`);
      return true;
    } catch {
      setHoverPreviewRecordId("");
      gameRef.current?.setPreviewRecord?.("");
      if (hoverPreviewSongRef.current === songId) {
        setNotice(`${record.title} is ready to preview after the next click or key press.`);
      }
      return false;
    }
  }, [apiBase, muted, placedRecordId, recordBySongId, stopHoverPreview]);

  const previewRecordOnHover = useCallback((songId = "") => {
    if (!songId || placedRecordId) {
      stopHoverPreview();
      return;
    }
    if (hoverPreviewTimerRef.current) globalThis.clearTimeout(hoverPreviewTimerRef.current);
    hoverPreviewTimerRef.current = globalThis.setTimeout(() => {
      hoverPreviewTimerRef.current = 0;
      void startRecordPreview(songId);
    }, 260);
  }, [placedRecordId, startRecordPreview, stopHoverPreview]);

  const previewRecordOnDemand = useCallback((songId = "") => {
    if (hoverPreviewTimerRef.current) {
      globalThis.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = 0;
    }
    void startRecordPreview(songId);
  }, [startRecordPreview]);

  const ejectPlacedRecord = useCallback((songId = placedRecordId) => {
    if (!songId || songId !== placedRecordId) return;
    if (captureLocked) {
      setNotice("Stop Record Mode before lifting the source record from the player.");
      return;
    }
    stopHoverPreview({ preserveSource: true });
    const audio = audioRef.current;
    audio?.pause();
    setPlacedRecordId("");
    setPlayback(initialPlaybackState());
    setNotice(`${recordBySongId.get(songId)?.title || "Record"} lifted from the player; playback stopped.`);
  }, [captureLocked, placedRecordId, recordBySongId, stopHoverPreview]);

  const persistedRecordItemCount = new Set([
    ...Object.keys(recordTransforms),
    ...(placedRecordId ? [placedRecordId] : []),
  ]).size;
  const persistedSceneItemCount = persistedRecordItemCount + printedCards.length;
  const clearPersistedSceneItems = useCallback(() => {
    const recordItemCount = new Set([
      ...Object.keys(recordTransformsRef.current),
      ...(placedRecordId ? [placedRecordId] : []),
    ]).size;
    const printedCardCount = printedCards.length;
    const itemCount = recordItemCount + printedCardCount;
    if (!itemCount) {
      setNotice("The saved 3D scene is already clear.");
      return;
    }
    const confirmed = globalThis.confirm?.(
      `Clear ${itemCount} saved 3D item${itemCount === 1 ? "" : "s"}? Moved records will return to their starting positions and printed cards will leave the scene. Source records and cards stay in their libraries.`,
    );
    if (confirmed === false) return;

    stopHoverPreview();
    placementControllerRef.current?.abort();
    placementControllerRef.current = null;
    cardRequestGenerationRef.current += 1;
    if (cardResolutionRef.current?.visualId) {
      resolveVisualCard.cancelVisual?.(cardResolutionRef.current.visualId);
    }
    const idleCardResolution = initialCardResolution();
    cardResolutionRef.current = idleCardResolution;

    const audio = audioRef.current;
    audio?.pause();
    if (audio) audio.currentTime = 0;
    setPlacedRecordId("");
    setPlayback(initialPlaybackState());
    setDirectorVisualClock(0);
    recordTransformsRef.current = {};
    setRecordTransforms({});
    setPrintedCards([]);
    setCardResolution(idleCardResolution);

    if (persistenceTimerRef.current) {
      globalThis.clearTimeout(persistenceTimerRef.current);
      persistenceTimerRef.current = 0;
    }
    pendingPreferenceRef.current = null;
    const clearedPreferences = clearEchoRecordGardenPersistedItems(captureGardenPreferences());
    writeGardenPreferences(clearedPreferences);
    setSceneRevision((revision) => revision + 1);
    setNotice(`Cleared ${itemCount} saved 3D item${itemCount === 1 ? "" : "s"}. Source records and cards were not deleted.`);
  }, [captureGardenPreferences, placedRecordId, printedCards, resolveVisualCard, stopHoverPreview]);

  useEffect(() => () => {
    if (hoverPreviewTimerRef.current) globalThis.clearTimeout(hoverPreviewTimerRef.current);
  }, []);

  actionsRef.current = {
    generateCardForVisual,
    generateCurrentDirectorPreviewCard,
    placeRecord,
    ejectPlacedRecord,
    previewRecordOnHover,
    previewRecordOnDemand,
    selectRecord,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let game;
    setSceneReady(false);
    setSceneError("");
    try {
      game = createEchoRecordGardenGame({
        canvas,
        apiBase,
        getAudioSignal: (seconds) => directorAudioSignalRef.current?.latest?.(seconds, {
          maxAgeSeconds: 1 / 30,
        }) || null,
        onCameraChange: () => setCameraRevision((revision) => revision + 1),
        onRecordTransform: (songId, transform) => {
          setRecordTransforms((current) => {
            const next = { ...current, [songId]: transform };
            recordTransformsRef.current = next;
            return next;
          });
        },
        getAudioClock: () => {
          const audio = audioRef.current;
          return audio ? {
            currentTime: Number(audio.currentTime) || 0,
            duration: Number(audio.duration) || 0,
            playing: !audio.paused && !audio.ended,
          } : null;
        },
        syncDirectorVisuals: (seconds) => syncDirectorVisualClockRef.current?.(seconds),
        onSelectRecord: (songId) => {
          actionsRef.current.selectRecord?.(songId, "Record selected. Drag it to the turntable or use Place on player.");
          actionsRef.current.previewRecordOnDemand?.(songId);
        },
        onDropRecord: (songId) => void actionsRef.current.placeRecord?.(songId, { autoplay: true }),
        onEjectRecord: (songId) => actionsRef.current.ejectPlacedRecord?.(songId),
        onHoverRecord: (songId) => actionsRef.current.previewRecordOnHover?.(songId),
        onBrowsePrevious: () => setCratePage((page) => Math.max(0, page - 1)),
        onBrowseNext: () => setCratePage((page) => Math.min(cratePageCountRef.current - 1, page + 1)),
        onCycleSort: () => setCatalogSort((current) => {
          const index = Math.max(0, RECORD_CATALOG_SORTS.findIndex((option) => option.id === current));
          return RECORD_CATALOG_SORTS[(index + 1) % RECORD_CATALOG_SORTS.length].id;
        }),
        onSelectVisual: (visual) => {
          if (visual?.directorPreview) {
            void actionsRef.current.generateCurrentDirectorPreviewCard?.();
          } else {
            void actionsRef.current.generateCardForVisual?.(visual);
          }
        },
        onPrintedCardTransform: (cardId, transform) => {
          setPrintedCards((current) => current.map((card) => (
            card.id === cardId ? { ...card, sceneTransform: transform } : card
          )));
        },
        onStatus: setNotice,
      });
      game.restoreSnapshot({
        camera: preferences.camera,
        recordTransforms: recordTransformsRef.current,
      });
      gameRef.current = game;
      setSceneReady(true);
      setSceneError("");
    } catch (error) {
      setSceneReady(false);
      setSceneError(error?.message || "The 3D record garden could not start.");
      return undefined;
    }
    return () => {
      game.dispose();
      if (gameRef.current === game) gameRef.current = null;
    };
  }, [apiBase, preferences.camera, sceneRevision]);

  useEffect(() => {
    gameRef.current?.setCaptureLocked?.(captureLocked);
  }, [captureLocked, sceneReady]);

  useEffect(() => {
    gameRef.current?.setWeatherPhase?.(weatherPhase);
  }, [sceneReady, weatherPhase]);

  useEffect(() => {
    gameRef.current?.setRecords(records, {
      selectedRecordId,
      placedRecordId,
      recordTransforms,
      recordInventoryIds: records.map((record) => record.songId),
      visibleRecordIds: crateRecords.map((record) => record.songId),
      catalogPage: cratePage,
      catalogPageCount: cratePageCount,
      catalogSort,
    });
  }, [catalogSort, cratePage, cratePageCount, crateRecords, placedRecordId, recordTransforms, records, selectedRecordId]);

  useEffect(() => {
    gameRef.current?.setVisuals(visibleVisuals, {
      activeSongId: placedRecordId || selectedRecordId,
      directorVisual,
      compositeVisual: directorCompositeVisual,
      warmVisuals,
    });
  }, [directorCompositeVisual, directorVisual, placedRecordId, selectedRecordId, visibleVisuals, warmVisuals]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    printedCards.forEach((card) => game.spawnPrintedCard(card));
  }, [printedCards, sceneReady]);

  useEffect(() => {
    gameRef.current?.setPlayback({
      currentTime: playback.currentTime,
      duration: playback.duration || projectDuration(project) || 0,
      playing: playback.playing,
      reducedMotion,
    });
  }, [playback.currentTime, playback.duration, playback.playing, project, reducedMotion]);

  useEffect(() => {
    if (cratePage >= cratePageCount) setCratePage(Math.max(0, cratePageCount - 1));
  }, [cratePage, cratePageCount]);

  useEffect(() => {
    if (!selectedSongId || selectedSongId === selectedRecordId) return;
    if (records.some((record) => record.songId === selectedSongId)) {
      setSelectedRecordId(selectedSongId);
    }
  }, [records, selectedRecordId, selectedSongId]);

  const sceneStatus = sceneError
    ? "3D unavailable"
    : sceneReady
      ? placedRecord
        ? playback.playing ? "Now spinning" : "Record paused"
        : "Table ready"
      : "Setting the table";
  const captureBusy = captureLocked && captureState.status !== "recording";
  const captureRecording = captureState.status === "recording";
  const captureLabel = captureRecording
    ? `Stop + create Card · ${compactTime(captureState.elapsedSeconds)}`
    : captureBusy
      ? captureState.status === "saving" ? "Creating Hapa Card…" : "Finishing recording…"
      : captureState.status === "complete"
        ? "Record another session"
        : "Record Mode";

  return (
    <section
      className="echo-record-garden tarot-draw-view"
      data-testid="echo-record-garden"
      data-ready={sceneReady ? "true" : "false"}
      data-playing={playback.playing ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-scene-error={sceneError ? "true" : "false"}
      data-player-error={sceneError || playback.error ? "true" : "false"}
      data-cinematic={cinematicMode ? "true" : "false"}
      data-capture-status={captureState.status}
      data-weather-phase={weatherPhase}
      aria-label="Echo State Record Garden 3D album explorer"
    >
      <canvas
        ref={canvasRef}
        data-testid="echo-record-garden-canvas"
        aria-label="Interactive 3D outdoor record table"
        tabIndex={0}
        onKeyDown={(event) => {
          if (!["Enter", " "].includes(event.key)) return;
          const visual = directorCompositeVisual || directorVisual || selectedVisual;
          if (!visual) return;
          event.preventDefault();
          if (visual.directorPreview) void generateCurrentDirectorPreviewCard();
          else void generateCardForVisual(visual);
        }}
      />
      <audio
        ref={audioRef}
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = Number(event.currentTarget.duration) || projectDuration(project);
          setPlayback((current) => ({ ...current, duration, ready: true, error: "" }));
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setPlayback((current) => ({
            ...current,
            currentTime: Number(audio.currentTime) || 0,
            duration: Number(audio.duration) || current.duration,
          }));
        }}
        onPlay={() => {
          directorAudioSignalRef.current?.resume?.().catch(() => false);
          setPlayback((current) => ({ ...current, playing: true, error: "" }));
        }}
        onPause={() => setPlayback((current) => ({ ...current, playing: false }))}
        onEnded={() => setPlayback((current) => ({ ...current, playing: false }))}
        onError={() => setPlayback((current) => ({
          ...current,
          playing: false,
          error: "Audio source could not be decoded.",
        }))}
      />

      <div className="echo-record-garden-mode-dock" aria-label="Record Garden experience modes">
        <button
          ref={cinematicToggleRef}
          className="hapa-btn echo-record-cinematic-toggle"
          data-intent={cinematicMode ? "warning" : "secondary"}
          type="button"
          aria-pressed={cinematicMode}
          aria-label={cinematicMode ? "Exit cinematic mode" : "Enter cinematic mode"}
          onClick={cinematicMode ? exitCinematicMode : enterCinematicMode}
        >
          {cinematicMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          {cinematicMode ? "Exit · Esc" : "Cinematic Mode"}
        </button>
        <button
          className="hapa-btn echo-record-capture-toggle"
          data-intent={captureRecording ? "danger" : "primary"}
          type="button"
          aria-pressed={captureRecording}
          disabled={captureBusy || !sceneReady}
          onClick={toggleRecordMode}
        >
          {captureRecording ? <Square size={13} fill="currentColor" /> : <Radio size={15} />}
          {captureLabel}
        </button>
        {captureState.status === "failed" && failedCaptureRef.current?.blob && (
          <button
            className="hapa-btn echo-record-capture-retry"
            type="button"
            onClick={retryRecordGardenCaptureSave}
          >
            Retry Card save
          </button>
        )}
        <span className="echo-record-weather-readout" aria-live="polite">
          <CloudSun size={14} />
          {weatherPhaseLabel(weatherPhase)}
        </span>
        <span className="echo-record-capture-status" role="status" aria-live="polite">
          {captureState.error || (captureState.status === "complete"
            ? `Card ready · ${captureState.cardTitle}`
            : captureRecording
              ? "Scene + mastered audio"
              : "")}
        </span>
      </div>

      <div
        className="echo-record-garden-chrome"
        hidden={cinematicMode}
        aria-hidden={cinematicMode ? "true" : undefined}
        inert={cinematicMode ? "" : undefined}
      >

      <header className="echo-record-garden-hud tarot-draw-hud">
        <div className="echo-record-garden-title tarot-draw-title">
          <span>3D ECHO STATE EXPLORATION</span>
          <h2>Record Garden</h2>
          <p>Lazy Sunday listening table · Tarot Draw interaction grammar</p>
        </div>
        <div className="echo-record-garden-readouts tarot-draw-readouts" aria-label="Record Garden status">
          <span><strong>{records.length || "—"}</strong><em>records</em></span>
          <span><strong>{placedRecord ? "1" : "0"}</strong><em>on player</em></span>
          <span><strong>{visibleVisuals.length}</strong><em>live surfaces</em></span>
          <span><strong>{printedCards.length}</strong><em>cards printed</em></span>
        </div>
      </header>

      <aside
        className="echo-record-now-playing hapa-panel"
        data-variant="notch"
        data-testid="echo-record-player-slot"
        aria-live="polite"
      >
        <div className="echo-record-now-playing-label">
          <CircleDot size={15} />
          <span>{sceneStatus}</span>
        </div>
        <strong>{placedRecord?.title || selectedRecord?.title || "Choose a record"}</strong>
        <small>
          {placedRecord
            ? `${recordAvatarName(placedRecord) || recordTheme(placedRecord).label} · ${compactTime(playback.currentTime)} / ${compactTime(playback.duration || recordDuration(placedRecord))}`
            : "Pick up any circular record or browse the accessible crate below."}
        </small>
        {project?.echo_record_garden_director_cut?.title && (
          <small data-testid="echo-record-director-cut">
            Most recent Director cut · {project.echo_record_garden_director_cut.title}
          </small>
        )}
        {sceneError && (
          <button
            className="hapa-btn echo-record-retry-scene"
            type="button"
            onClick={() => setSceneRevision((revision) => revision + 1)}
          >
            Retry 3D scene
          </button>
        )}
        {playback.error && (
          <button
            className="hapa-btn echo-record-retry-audio"
            type="button"
            onClick={() => void placeRecord(placedRecordId || selectedRecordId, { autoplay: false })}
          >
            Retry record audio
          </button>
        )}
      </aside>

      <aside
        ref={visualInspectorRef}
        className="echo-record-visual-inspector hapa-panel"
        data-variant="notch"
        tabIndex={-1}
      >
        <div className="echo-record-visual-inspector-head">
          <span><Layers3 size={14} /> Visual surface</span>
          <span className="echo-record-surface-pages">
            <button
              type="button"
              onClick={() => moveSurfacePage(surfacePage - 1)}
              disabled={surfacePage <= 0}
              aria-label="Previous album visual surfaces"
            >
              <ChevronLeft size={14} />
            </button>
            <em>{visuals.length ? `${Math.max(1, visuals.findIndex((item) => item.id === selectedVisual?.id) + 1)} / ${visuals.length}` : "0 / 0"}</em>
            <button
              type="button"
              onClick={() => moveSurfacePage(surfacePage + 1)}
              disabled={surfacePage >= surfacePageCount - 1}
              aria-label="Next album visual surfaces"
            >
              <ChevronRight size={14} />
            </button>
          </span>
        </div>
        <div className="echo-record-source-coverage" aria-label="Album source family coverage">
          {visualFamilyCoverage.map((family) => (
            <span key={family.id} data-state={family.available ? "available" : "missing"}>
              {family.label}: {family.available ? "available" : "missing"}
            </span>
          ))}
        </div>
        {cardResolution.visualId
          && !["idle", "complete"].includes(cardResolution.status)
          && cardResolution.visualId !== selectedVisual?.id && (
          <div className="echo-record-card-actions echo-record-card-recovery">
            <small className="echo-record-card-error" role="alert">
              {cardResolution.error || "A Card request is waiting at its original source visual."}
            </small>
            {cardResolution.status !== "unavailable" && cardResolution.songId && (
              <button
                className="hapa-btn"
                type="button"
                onClick={openCardJobSource}
              >
                Open Card source
              </button>
            )}
          </div>
        )}
        {selectedVisual ? (
          <>
            <strong>{selectedVisual.title}</strong>
            <small>
              {selectedVisual.kindLabel || selectedVisual.kind || "Album visual"} · {selectedVisual.truthLabel || "source-linked"} · {selectedVisual.clockLocked ? "audio-synchronized" : "context only, not time-synchronized"}
            </small>
            <small className="echo-record-rights-status">
              Rights: {selectedVisual.rights?.status === "source-declared"
                ? `${selectedVisual.rights.licenseStatus || "unknown license"} · ${selectedVisual.rights.consentStatus || "unknown consent"}`
                : "review required before public release"}
            </small>
            <div className="echo-record-visual-selector" role="group" aria-label="Visible album surfaces">
              {visibleVisuals.map((visual) => (
                <button
                  key={visual.id}
                  type="button"
                  data-testid="echo-record-visual"
                  data-visual-kind={visual.role || visual.kind || "visual"}
                  className={visual.id === selectedVisual.id ? "active" : ""}
                  aria-pressed={visual.id === selectedVisual.id}
                  onClick={() => {
                    setSelectedVisualId(visual.id);
                    gameRef.current?.focusVisual(visual.id);
                  }}
                >
                  {visual.kindLabel || visual.kind || "Visual"}
                </button>
              ))}
            </div>
            <small className="echo-record-preview-print-hint">
              Click the large Director Preview to print the exact Hapa Card attached to the current visual.
            </small>
            {["failed", "blocked", "interrupted", "unavailable"].includes(cardResolution.status) && cardResolution.visualId === selectedVisual.id && (
              <small className="echo-record-card-error" role="alert">{cardResolution.error}</small>
            )}
          </>
        ) : (
          <div className="echo-record-empty-inspector">
            <p>
              {projectLoadError
                ? `This record sleeve could not be opened: ${projectLoadError}`
                : "Place a record to reveal its Director video, references, character, and scene surfaces."}
            </p>
            {projectLoadError && (
              <button
                className="hapa-btn"
                type="button"
                onClick={() => setProjectRevision((revision) => revision + 1)}
              >
                Retry record sleeve
              </button>
            )}
          </div>
        )}
      </aside>

      {printedCards.length > 0 && (
        <aside className="echo-record-printed-rail" aria-label="Generated Hapa Cards">
          <span>TABLE PRINTS</span>
          {printedCards.slice(0, 3).map((card) => (
            <button
              key={card.id}
              type="button"
              data-testid="echo-record-card-receipt"
              onClick={() => gameRef.current?.focusPrintedCard(card.id)}
              title={card.echoRecordAttachment?.truthStatus || card.truthStatus || "attached card"}
            >
              <strong>{card.title || "Hapa Card"}</strong>
              <small>{printedCardCustodyLabel(card)}</small>
            </button>
          ))}
        </aside>
      )}

      <div className="echo-record-garden-controls tarot-draw-controls">
        <div className="echo-record-transport">
          <button
            className="hapa-btn echo-record-play"
            data-intent={playback.playing ? "warning" : "primary"}
            data-testid="echo-record-play-toggle"
            type="button"
            onClick={() => void togglePlayback()}
            disabled={!selectedRecord || (captureLocked && !placedRecord)}
            aria-label={playback.playing
              ? `Pause ${placedRecord?.title || "record"}`
              : placedRecord
                ? `Play ${placedRecord.title}`
                : `Place and play ${selectedRecord?.title || "selected record"}`}
          >
            {playback.playing ? <Pause size={14} /> : <Play size={14} />}
            {playback.playing ? "Pause" : placedRecord ? "Play" : "Place + Play"}
          </button>
          <button
            className="hapa-btn"
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? "Turn record player sound on" : "Mute record player"}
            aria-pressed={muted}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {muted ? "Sound off" : "Sound on"}
          </button>
          <input
            className="echo-record-scrubber"
            type="range"
            min="0"
            max={Math.max(1, playback.duration || projectDuration(project) || 1)}
            step="0.05"
            value={Math.min(playback.currentTime, playback.duration || projectDuration(project) || 1)}
            onPointerDown={beginSeekGesture}
            onPointerUp={commitSeekGesture}
            onPointerCancel={cancelSeekGesture}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginSeekGesture();
            }}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commitSeekGesture();
            }}
            onBlur={commitSeekGesture}
            onChange={(event) => seekPlayback(event.target.value)}
            aria-label="Record playback position"
            disabled={!placedRecord}
          />
          <span className="echo-record-time">{compactTime(playback.currentTime)} / {compactTime(playback.duration || projectDuration(project))}</span>
          <button
            className="hapa-btn"
            type="button"
            onClick={() => gameRef.current?.resetCamera()}
            aria-label="Reset Record Garden camera"
          >
            <RotateCcw size={14} />
            Reset view
          </button>
          <button
            className="hapa-btn echo-record-clear-items"
            data-testid="echo-record-clear-items"
            type="button"
            onClick={clearPersistedSceneItems}
            disabled={!persistedSceneItemCount || captureLocked}
            aria-label={`Clear ${persistedSceneItemCount} saved 3D item${persistedSceneItemCount === 1 ? "" : "s"} from the Echo Garden scene`}
            title="Remove moved records and printed cards from the saved 3D scene"
          >
            <Trash2 size={14} />
            Clear 3D items
          </button>
          <button
            className="hapa-btn echo-record-eject"
            type="button"
            onClick={ejectRecord}
            disabled={!placedRecord || captureLocked}
            aria-label="Return the playing record to the crate"
          >
            <Disc3 size={14} />
            Return to crate
          </button>
        </div>

        <div className="echo-record-crate-tools">
          <label className="echo-record-search hapa-field">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCratePage(0);
              }}
              placeholder="Search the record crate…"
              aria-label="Search Echo State records"
            />
          </label>
          <label className="echo-record-perspective">
            <span>Perspective</span>
            <select
              value={perspective}
              onChange={(event) => {
                setPerspective(event.target.value);
                setCratePage(0);
              }}
            >
              <option value="all">All records</option>
              <option value="red">Red</option>
              <option value="blue">Blue</option>
              <option value="green">Green</option>
            </select>
          </label>
          <label className="echo-record-perspective echo-record-sort">
            <span>Arrange</span>
            <select
              value={catalogSort}
              onChange={(event) => {
                setCatalogSort(event.target.value);
                setCratePage(0);
              }}
              aria-label="Arrange records in the garden"
            >
              {RECORD_CATALOG_SORTS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <span className="echo-record-result-count" aria-live="polite">
            {filteredRecords.length} of {records.length}
          </span>
          <button
            type="button"
            className="echo-record-clear-filters"
            onClick={clearCrateFilters}
            disabled={!query && perspective === "all"}
          >
            Clear filters
          </button>
          <button
            type="button"
            className="echo-record-page-button"
            onClick={() => setCratePage((page) => Math.max(0, page - 1))}
            disabled={cratePage <= 0}
            aria-label="Previous record crate page"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="echo-record-page-readout">{cratePage + 1} / {cratePageCount}</span>
          <button
            type="button"
            className="echo-record-page-button"
            onClick={() => setCratePage((page) => Math.min(cratePageCount - 1, page + 1))}
            disabled={cratePage >= cratePageCount - 1}
            aria-label="Next record crate page"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div
          className="echo-record-crate"
          role="listbox"
          aria-label="Echo State record crate"
          onKeyDown={handleCrateKeyDown}
        >
          {loadState.status === "loading" && (
            <div className="echo-record-crate-empty"><Loader2 size={16} /> Loading album records…</div>
          )}
          {loadState.status === "error" && (
            <div className="echo-record-crate-empty error">
              <AlertTriangle size={16} />
              <span>{loadState.error}</span>
              <button className="hapa-btn" type="button" onClick={() => setCatalogRevision((revision) => revision + 1)}>
                Retry catalog
              </button>
            </div>
          )}
          {loadState.status === "ready" && filteredRecords.length === 0 && (
            <div className="echo-record-crate-empty">
              <span>No records match this crate filter.</span>
              <button className="hapa-btn" type="button" onClick={clearCrateFilters}>Clear filters</button>
            </div>
          )}
          {crateRecords.map((record) => {
            const theme = recordTheme(record);
            const selected = record.songId === selectedRecordId;
            const placed = record.songId === placedRecordId;
            return (
              <button
                key={record.songId}
                type="button"
                data-testid="echo-record-item"
                data-song-id={record.songId}
                role="option"
                aria-selected={selected}
                tabIndex={selected || (!crateRecords.some((item) => item.songId === selectedRecordId) && record === crateRecords[0]) ? 0 : -1}
                ref={(node) => {
                  if (node) crateButtonRefs.current.set(record.songId, node);
                  else crateButtonRefs.current.delete(record.songId);
                }}
                className={`echo-record-crate-item${selected ? " selected" : ""}${placed ? " placed" : ""}`}
                style={{ "--record-accent": theme.accent }}
                onClick={() => {
                  selectRecord(record.songId, `${record.title} selected.`);
                  previewRecordOnDemand(record.songId);
                }}
                onDoubleClick={() => void placeRecord(record.songId, { autoplay: true })}
                onMouseEnter={() => previewRecordOnHover(record.songId)}
                onMouseLeave={() => previewRecordOnHover("")}
                onFocus={() => previewRecordOnHover(record.songId)}
                onBlur={() => previewRecordOnHover("")}
              >
                <Disc3 size={22} />
                <span>
                  <strong>{record.title}</strong>
                  <small>{recordAvatarName(record) || theme.label} · {compactTime(recordDuration(record))}</small>
                </span>
                <em>{placed ? "PLAYING" : selected ? "HELD" : "BROWSE"}</em>
              </button>
            );
          })}
          <button
            type="button"
            className="hapa-btn echo-record-place"
            data-intent="primary"
            disabled={!selectedRecord || captureLocked}
            onClick={() => void placeRecord(selectedRecordId, { autoplay: true })}
          >
            <Hand size={14} />
            Place on player
          </button>
        </div>
      </div>

      <div className="echo-record-garden-notice" role="status" aria-live="polite">
        {sceneError ? <AlertTriangle size={14} /> : <CircleDot size={14} />}
        <span>{sceneError || playback.error || notice}</span>
      </div>
      {acceptanceReviewEnabled && (
        <Suspense fallback={null}>
          <EchoRecordGardenAcceptancePanel
            apiBase={apiBase}
            captureCheckpoint={() => gameRef.current?.acceptanceSnapshot?.() || null}
          />
        </Suspense>
      )}
      </div>
    </section>
  );
}

const ECHO_RECORD_GARDEN_POWER_PROFILES = Object.freeze({
  full: Object.freeze({
    id: "full",
    pixelRatioCap: 1.65,
    shadows: true,
    dropRingPulse: true,
    bokehPulse: true,
    untimedVideoAutoplay: true,
  }),
  reduced: Object.freeze({
    id: "reduced",
    pixelRatioCap: 1,
    shadows: false,
    dropRingPulse: false,
    bokehPulse: false,
    untimedVideoAutoplay: false,
  }),
});

function createEchoRecordGardenGame({
  canvas,
  apiBase = "",
  getAudioClock,
  getAudioSignal,
  syncDirectorVisuals,
  onCameraChange,
  onRecordTransform,
  onSelectRecord,
  onDropRecord,
  onEjectRecord,
  onHoverRecord,
  onBrowsePrevious,
  onBrowseNext,
  onCycleSort,
  onSelectVisual,
  onPrintedCardTransform,
  onStatus,
}) {
  const diagnostics = recordGardenDiagnostics();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  diagnostics.createdGames += 1;
  diagnostics.liveGames += 1;
  diagnostics.liveRenderers += 1;
  diagnostics.contextState = "available";
  diagnostics.lastError = "";
  canvas.dataset.rendererState = "available";
  let activePowerProfileId = "";
  let adaptiveDetailTier = "full";
  const applyPowerProfile = (reducedMotion = false) => {
    const profile = reducedMotion
      ? ECHO_RECORD_GARDEN_POWER_PROFILES.reduced
      : ECHO_RECORD_GARDEN_POWER_PROFILES.full;
    const profileKey = `${profile.id}:${adaptiveDetailTier}`;
    if (activePowerProfileId === profileKey) return profile;
    const basePixelRatio = Math.min(globalThis.devicePixelRatio || 1, profile.pixelRatioCap);
    const pixelRatio = adaptiveDetailTier === "reduced"
      ? Math.max(0.72, basePixelRatio * 0.82)
      : basePixelRatio;
    renderer.setPixelRatio(pixelRatio);
    const shadowsEnabled = profile.shadows && adaptiveDetailTier !== "reduced";
    renderer.shadowMap.enabled = shadowsEnabled;
    activePowerProfileId = profileKey;
    diagnostics.powerProfile = profile.id;
    diagnostics.adaptiveDetailTier = adaptiveDetailTier;
    diagnostics.renderPixelRatio = pixelRatio;
    diagnostics.shadowsEnabled = shadowsEnabled;
    canvas.dataset.powerProfile = profile.id;
    canvas.dataset.adaptiveDetailTier = adaptiveDetailTier;
    canvas.dataset.renderPixelRatio = pixelRatio.toFixed(2);
    canvas.dataset.shadows = shadowsEnabled ? "enabled" : "disabled";
    return profile;
  };
  const initialReducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  applyPowerProfile(initialReducedMotion);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc8e5ed);
  scene.fog = new THREE.FogExp2(0xbcd9d7, 0.0165);

  const camera = new THREE.PerspectiveCamera(47, 1, 0.05, 100);
  const defaultCameraPosition = new THREE.Vector3(0, 6.25, 11.4);
  const defaultCameraTarget = new THREE.Vector3(0, 1.05, -0.35);
  camera.position.copy(defaultCameraPosition);
  camera.lookAt(defaultCameraTarget);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !initialReducedMotion;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 4.5;
  controls.maxDistance = 14;
  controls.minPolarAngle = 0.32;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.copy(defaultCameraTarget);
  const handleControlsEnd = () => onCameraChange?.();
  controls.addEventListener("end", handleControlsEnd);

  const world = new THREE.Group();
  world.name = "EchoRecordGardenWorld";
  scene.add(world);

  const tableInteractionRoot = new THREE.Group();
  tableInteractionRoot.name = "EchoRecordGardenTableInteractionRoot";
  tableInteractionRoot.position.set(
    ECHO_RECORD_GARDEN_SPATIAL_LAYOUT.tableStage.x,
    ECHO_RECORD_GARDEN_SPATIAL_LAYOUT.tableStage.y,
    ECHO_RECORD_GARDEN_SPATIAL_LAYOUT.tableStage.z,
  );
  world.add(tableInteractionRoot);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");
  const recordsRoot = new THREE.Group();
  recordsRoot.name = "EchoRecordCrate";
  tableInteractionRoot.add(recordsRoot);
  const printedCardsRoot = new THREE.Group();
  printedCardsRoot.name = "EchoRecordPrintedCards";
  tableInteractionRoot.add(printedCardsRoot);

  const sceneResources = createLazySundayScene(world, { scene, renderer });
  diagnostics.visualProfile = sceneResources.metrics;
  canvas.dataset.visualProfile = sceneResources.metrics.profileId;
  canvas.dataset.environmentDetailInstances = String(sceneResources.metrics.instancedDetailCount);
  const player = createRecordPlayer(tableInteractionRoot, sceneResources.materialKit);
  const screens = createAlbumScreens(world, sceneResources.materialKit);
  const catalogConsole = createRecordCatalogConsole(tableInteractionRoot, sceneResources.materialKit);
  const audioVisualizer = createEchoRecordGardenAudioVisualizer({ world: tableInteractionRoot });
  diagnostics.visualizerProfile = audioVisualizer.metrics;
  const mediaPool = createScreenMediaPool({
    apiBase,
    renderer,
    diagnostics,
    onMediaError: (visual) => {
      diagnostics.mediaFailures += 1;
      const acceptanceRun = activeAcceptanceRun();
      if (acceptanceRun) acceptanceRun.mediaFailures = Number(acceptanceRun.mediaFailures || 0) + 1;
      diagnostics.lastError = `Media unavailable: ${visual?.title || "album visual"}`;
      onStatus?.(`${visual?.title || "Album visual"} could not be decoded; its source-labelled fallback remains visible.`);
    },
  });
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.88);
  const dragPoint = new THREE.Vector3();
  const tableDragPoint = new THREE.Vector3();
  const recordCatalog = new Map();
  const recordEntries = new Map();
  const recordEntityRegistry = createEchoRecordEntityRegistry();
  const printedEntries = new Map();
  let visibleResidentRecordIds = new Set();
  let recordTitleAtlas = null;
  let recordTitleAtlasSignature = "";
  let restoredRecordTransforms = {};
  let disposed = false;
  let animationFrame = 0;
  let renderedFrames = 0;
  let previousFrameSeconds = 0;
  const frameTimingSamples = [];
  let acceptanceRunId = "";
  let acceptanceDetailTierBeforeRun = null;
  let heldEntry = null;
  let heldPrintedEntry = null;
  let hoveredEntry = null;
  let selectedRecordId = "";
  let placedRecordId = "";
  let previewRecordId = "";
  let visualRecordId = "";
  let captureLocked = false;
  let playback = {
    currentTime: 0,
    duration: 0,
    playing: false,
    reducedMotion: initialReducedMotion,
  };
  let activeVisuals = [];
  let pressureWindows = 0;
  let recoveryWindows = 0;

  const setAdaptiveDetailTier = (tier = "full") => {
    const nextTier = tier === "reduced" ? "reduced" : "full";
    if (adaptiveDetailTier === nextTier) return adaptiveDetailTier;
    adaptiveDetailTier = nextTier;
    sceneResources.setDetailTier?.(nextTier);
    audioVisualizer.setDetailTier?.(nextTier);
    activePowerProfileId = "";
    applyPowerProfile(playback.reducedMotion);
    diagnostics.adaptiveDetailTier = nextTier;
    canvas.dataset.adaptiveDetailTier = nextTier;
    return adaptiveDetailTier;
  };
  sceneResources.setDetailTier?.(adaptiveDetailTier);
  diagnostics.adaptiveDetailTier = adaptiveDetailTier;
  canvas.dataset.adaptiveDetailTier = adaptiveDetailTier;

  const resetAdaptiveTiming = () => {
    frameTimingSamples.length = 0;
    previousFrameSeconds = 0;
    pressureWindows = 0;
    recoveryWindows = 0;
  };

  const setPointer = (event) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1;
  };

  const recordIntersection = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      [...recordEntries.values()].filter((entry) => entry.root.visible).map((entry) => entry.root),
      true,
    );
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData?.recordId) object = object.parent;
      const entry = object?.userData?.recordId ? recordEntries.get(object.userData.recordId) : null;
      if (entry?.root.visible) return { entry, distance: hit.distance };
    }
    return null;
  };
  const recordHit = () => recordIntersection()?.entry || null;

  const visualHit = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(screens.map((screen) => screen.hitTarget), true);
    return hits[0]?.object?.userData?.visual || hits[0]?.object?.parent?.userData?.visual || null;
  };

  const printedCardIntersection = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      [...printedEntries.values()].filter((entry) => entry.root.visible).map((entry) => entry.root),
      true,
    );
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData?.printedCardId) object = object.parent;
      const entry = object?.userData?.printedCardId
        ? printedEntries.get(object.userData.printedCardId)
        : null;
      if (entry?.root.visible) return { entry, distance: hit.distance };
    }
    return null;
  };
  const printedCardHit = () => printedCardIntersection()?.entry || null;

  const catalogControlHit = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(catalogConsole.hitTargets, true);
    return hits[0]?.object?.userData?.catalogAction || "";
  };

  const playerDropReady = (position) => {
    const dx = position.x - player.platterTablePosition.x;
    const dz = position.z - player.platterTablePosition.z;
    return Math.hypot(dx, dz) <= 1.2;
  };

  const handlePointerDown = (event) => {
    if (disposed) return;
    noteAcceptancePointer(event.pointerType);
    setPointer(event);
    const catalogAction = catalogControlHit();
    if (catalogAction) {
      if (catalogAction === "previous") onBrowsePrevious?.();
      else if (catalogAction === "next") onBrowseNext?.();
      else if (catalogAction === "sort") onCycleSort?.();
      onStatus?.(
        catalogAction === "sort"
          ? "Rearranging the Record collection in 3D."
          : "Moving through the Record collection in 3D.",
      );
      event.preventDefault();
      return;
    }
    const printedEntry = printedCardHit();
    if (printedEntry) {
      heldPrintedEntry = printedEntry;
      printedEntry.dragStart.copy(printedEntry.root.position);
      printedEntry.root.position.y = 1.28;
      printedEntry.root.scale.setScalar(1.06);
      controls.enabled = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      onStatus?.(`Holding ${printedEntry.card.title || "the printed Hapa Card"}.`);
      event.preventDefault();
      return;
    }
    const entry = recordHit();
    if (entry) {
      if (captureLocked) {
        onStatus?.("Stop Record Mode before moving the source record; this capture keeps one exact song and cut lineage.");
        event.preventDefault();
        return;
      }
      if (entry.placed) {
        onEjectRecord?.(entry.record.songId);
        placedRecordId = "";
        entry.placed = false;
        attachEchoRecordObjectPreservingWorldTransform(entry.root, recordsRoot);
        entry.root.rotation.set(
          entry.homeRotation.x,
          entry.homeRotation.y,
          entry.homeRotation.z,
        );
        recordEntityRegistry.transition(entry.record.id, "remove", { eventId: `lift:${entry.record.songId}:${Date.now()}` });
        player.record.visible = false;
      } else {
        recordEntityRegistry.transition(entry.record.id, "pickup", {
          eventId: `pickup:${entry.record.songId}:${Date.now()}`,
        });
      }
      heldEntry = entry;
      selectedRecordId = entry.record.songId;
      entry.dragStart.copy(entry.root.position);
      entry.root.position.y = 1.12;
      entry.root.scale.setScalar(1.08);
      controls.enabled = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      onSelectRecord?.(entry.record.songId);
      onStatus?.(`Holding ${entry.record.title}. Move it over the glowing turntable ring.`);
      event.preventDefault();
      return;
    }
    const visual = visualHit();
    if (visual) {
      onSelectVisual?.(visual);
      onStatus?.(`Printing the Card attached to ${visual.title || "this visual"}.`);
      event.preventDefault();
    }
  };

  const handlePointerMove = (event) => {
    if (disposed) return;
    setPointer(event);
    if (heldPrintedEntry) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        tableDragPoint.copy(dragPoint);
        tableInteractionRoot.worldToLocal(tableDragPoint);
        heldPrintedEntry.root.position.set(
          THREE.MathUtils.clamp(tableDragPoint.x, -4.35, 4.35),
          1.28,
          THREE.MathUtils.clamp(tableDragPoint.z, -2.25, 2.45),
        );
        renderer.domElement.style.cursor = "grabbing";
      }
      return;
    }
    if (heldEntry) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        tableDragPoint.copy(dragPoint);
        tableInteractionRoot.worldToLocal(tableDragPoint);
        heldEntry.root.position.set(
          THREE.MathUtils.clamp(tableDragPoint.x, -4.25, 4.25),
          1.12,
          THREE.MathUtils.clamp(tableDragPoint.z, -2.2, 2.45),
        );
        const ready = playerDropReady(heldEntry.root.position);
        player.dropRing.material.opacity = ready ? 0.95 : 0.38;
        player.dropRing.scale.setScalar(ready ? 1.1 : 1);
        renderer.domElement.style.cursor = ready ? "copy" : "grabbing";
      }
      return;
    }
    const nextHovered = recordHit();
    if (hoveredEntry !== nextHovered) {
      if (hoveredEntry) hoveredEntry.hovered = false;
      hoveredEntry = nextHovered;
      if (hoveredEntry) hoveredEntry.hovered = true;
      onHoverRecord?.(hoveredEntry?.record?.songId || "");
    }
    const visual = visualHit();
    const catalogAction = catalogControlHit();
    const printedEntry = printedCardHit();
    renderer.domElement.style.cursor = printedEntry ? "grab" : nextHovered ? "grab" : visual ? "copy" : catalogAction ? "pointer" : "default";
  };

  const handlePointerUp = (event) => {
    if (heldPrintedEntry) {
      const entry = heldPrintedEntry;
      heldPrintedEntry = null;
      entry.home.copy(entry.root.position);
      entry.root.scale.setScalar(1);
      controls.enabled = true;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = "default";
      onPrintedCardTransform?.(entry.card.id, {
        position: entry.root.position.toArray(),
        rotation: entry.root.rotation.toArray().slice(0, 3),
        manipulated: true,
      });
      onStatus?.(`${entry.card.title || "Hapa Card"} placed in the garden.`);
      return;
    }
    if (!heldEntry) return;
    const entry = heldEntry;
    const droppedPosition = entry.root.position.clone();
    const movedDistance = Math.hypot(
      droppedPosition.x - entry.dragStart.x,
      droppedPosition.z - entry.dragStart.z,
    );
    heldEntry = null;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    controls.enabled = true;
    renderer.domElement.style.cursor = "default";
    player.dropRing.material.opacity = 0.38;
    player.dropRing.scale.setScalar(1);
    entry.root.scale.setScalar(1);
    if (playerDropReady(droppedPosition)) {
      attachEchoRecordObjectPreservingWorldTransform(entry.root, player.recordAnchor);
      recordEntityRegistry.transition(entry.record.id, "place", { eventId: `place:${entry.record.songId}:${Date.now()}` });
      entry.root.position.set(0, 0, 0);
      entry.root.rotation.set(0, 0, 0);
      entry.root.scale.setScalar(1.48);
      entry.placed = true;
      placedRecordId = entry.record.songId;
      player.record.visible = true;
      onDropRecord?.(entry.record.songId);
      onStatus?.(`${entry.record.title} is on the platter while its warmed media becomes audible.`);
      return;
    }
    if (movedDistance < 0.16) {
      entry.root.position.copy(entry.home);
      onStatus?.(`${entry.record.title} selected. Drag farther to arrange it on the table.`);
      return;
    }
    const drop = resolveEchoRecordGardenTableDrop({
      position: [droppedPosition.x, entry.home.y, droppedPosition.z],
      occupiedPositions: [...recordEntries.values()]
        .filter((candidate) => candidate !== entry)
        .map((candidate) => candidate.home.toArray()),
    });
    if (!drop.accepted) {
      entry.root.position.copy(entry.home);
      onStatus?.(
        drop.reason === "record-collision"
          ? "That spot is occupied. The record returned to its previous place."
          : "That table position is unavailable. The record returned to its previous place.",
      );
      return;
    }
    entry.home.fromArray(drop.position);
    entry.root.position.copy(entry.home);
    entry.manipulated = true;
    const transform = {
      position: entry.home.toArray(),
      rotation: entry.homeRotation.toArray(),
      ...(entry.cameraFacing ? { orientationMode: "camera-facing" } : {}),
      manipulated: true,
    };
    restoredRecordTransforms = {
      ...restoredRecordTransforms,
      [entry.record.songId]: transform,
    };
    onRecordTransform?.(entry.record.songId, transform);
    onStatus?.(`${entry.record.title} arranged on the table.`);
  };

  const handlePointerCancel = (event = null) => {
    if (heldPrintedEntry) {
      heldPrintedEntry.root.position.copy(heldPrintedEntry.home);
      heldPrintedEntry.root.scale.setScalar(1);
      heldPrintedEntry = null;
      controls.enabled = true;
      if (event?.pointerId != null) renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = "default";
      return;
    }
    if (!heldEntry) return;
    heldEntry.root.position.copy(heldEntry.home);
    heldEntry.root.scale.setScalar(1);
    heldEntry = null;
    controls.enabled = true;
    if (event?.pointerId != null) renderer.domElement.releasePointerCapture?.(event.pointerId);
    renderer.domElement.style.cursor = "default";
    player.dropRing.material.opacity = 0.38;
    player.dropRing.scale.setScalar(1);
  };

  const handleWheel = (event) => {
    if (disposed) return;
    setPointer(event);
    const target = resolveEchoGardenSurfaceWheelTarget({
      heldPrintedEntry,
      heldRecordEntry: heldEntry,
      printedHit: (heldPrintedEntry || heldEntry) ? null : printedCardIntersection(),
      recordHit: (heldPrintedEntry || heldEntry) ? null : recordIntersection(),
    });
    const printedEntry = target?.kind === "printed" ? target.entry : null;
    const recordEntry = target?.kind === "record" ? target.entry : null;
    if (!printedEntry && !recordEntry) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (recordEntry?.placed) {
      onStatus?.("Lift the Record from the player before facing it toward the camera.");
      return;
    }
    const entry = printedEntry || recordEntry;
    if (!orientEchoGardenSurfaceTowardCamera(entry.root, camera)) return;

    if (printedEntry) {
      onPrintedCardTransform?.(entry.card.id, {
        position: entry.home.toArray(),
        rotation: entry.root.rotation.toArray().slice(0, 3),
        manipulated: true,
      });
      onStatus?.(`${entry.card.title || "The Hapa Card"} now faces the camera.`);
      return;
    }

    entry.homeRotation.set(entry.root.rotation.x, entry.root.rotation.y, entry.root.rotation.z);
    entry.manipulated = true;
    entry.cameraFacing = true;
    const transform = {
      position: entry.home.toArray(),
      rotation: entry.homeRotation.toArray(),
      orientationMode: "camera-facing",
      manipulated: true,
    };
    restoredRecordTransforms = {
      ...restoredRecordTransforms,
      [entry.record.songId]: transform,
    };
    onRecordTransform?.(entry.record.songId, transform);
    onStatus?.(`${entry.record.title || "The Record"} now faces the camera.`);
  };

  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
  renderer.domElement.addEventListener("lostpointercapture", handlePointerCancel);
  renderer.domElement.addEventListener("wheel", handleWheel, { passive: false, capture: true });

  const handleContextLost = (event) => {
    event.preventDefault();
    diagnostics.contextState = "lost";
    diagnostics.contextLosses = Number(diagnostics.contextLosses || 0) + 1;
    const acceptanceRun = activeAcceptanceRun();
    if (acceptanceRun) acceptanceRun.contextLosses = Number(acceptanceRun.contextLosses || 0) + 1;
    diagnostics.lastError = "WebGL context lost";
    canvas.dataset.rendererState = "lost";
    onStatus?.("The 3D renderer paused after losing its graphics context.");
  };
  const handleContextRestored = () => {
    try {
      resetAdaptiveTiming();
      sceneResources.rebuildEnvironmentResponse?.();
      diagnostics.contextState = "restored";
      diagnostics.lastError = "";
      canvas.dataset.rendererState = "available";
      onStatus?.("The 3D renderer recovered its graphics context and garden lighting.");
    } catch (error) {
      diagnostics.contextState = "degraded";
      diagnostics.lastError = error?.message || "Environment lighting recovery failed";
      canvas.dataset.rendererState = "degraded";
      onStatus?.("The 3D renderer recovered, but its garden lighting needs a scene retry.");
    }
  };
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

  const resize = () => {
    resetAdaptiveTiming();
    const bounds = canvas.parentElement?.getBoundingClientRect() || canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement || canvas);
  resize();

  const setRecordTexture = (entry, uri) => {
    if (!entry || !uri || entry.textureUri === uri) return;
    entry.textureUri = uri;
    textureLoader.load(
      resolveGardenMediaUri(uri, apiBase),
      (texture) => {
        if (disposed || entry.disposed || entry.textureUri !== uri) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        entry.coverTexture?.dispose?.();
        entry.labelTexture?.dispose?.();
        entry.labelTexture = null;
        entry.coverTexture = texture;
        if (entry.record.songId !== visualRecordId && !entry.mediaResource) entry.faceMaterial.map = texture;
        entry.faceMaterial.color.setHex(0xffffff);
        entry.faceMaterial.needsUpdate = true;
      },
      undefined,
      () => {
        if (!disposed && !entry.disposed && entry.labelTexture) {
          entry.faceMaterial.map = entry.labelTexture;
          entry.faceMaterial.needsUpdate = true;
        }
      },
    );
  };

  const updateRecordTitleAtlas = (residentRecords = []) => {
    const signature = residentRecords.map((record) => [
      record.songId,
      record.title,
      recordAvatarName(record),
      recordTheme(record).accent,
    ].join(":" )).join("\n");
    if (recordTitleAtlas && recordTitleAtlasSignature === signature) return;
    const nextAtlas = residentRecords.length
      ? createRecordTitleAtlas(residentRecords, {
          maxTextureSize: renderer.capabilities.maxTextureSize,
        })
      : null;
    residentRecords.forEach((record) => {
      const entry = recordEntries.get(record.songId);
      const slot = nextAtlas?.slots.get(record.songId);
      if (!entry || !slot) return;
      applyRecordTitleAtlasUv(entry.titleLabel.geometry, slot);
      entry.titleMaterial.map = nextAtlas.texture;
      entry.titleMaterial.opacity = 1;
      entry.titleMaterial.needsUpdate = true;
    });
    const previousAtlas = recordTitleAtlas;
    recordTitleAtlas = nextAtlas;
    recordTitleAtlasSignature = signature;
    previousAtlas?.texture?.dispose?.();
  };

  const setRecords = (records = [], state = {}) => {
    if (Object.hasOwn(state, "selectedRecordId")) {
      selectedRecordId = state.selectedRecordId || "";
    }
    if (Object.hasOwn(state, "placedRecordId")) {
      placedRecordId = state.placedRecordId || "";
    }
    if (state.recordTransforms && typeof state.recordTransforms === "object") {
      const validRecordIds = Array.isArray(state.recordInventoryIds)
        ? new Set(state.recordInventoryIds)
        : null;
      restoredRecordTransforms = Object.fromEntries(
        Object.entries(state.recordTransforms).filter(([songId, transform]) => (
          transform?.manipulated === true
          && (!validRecordIds || validRecordIds.has(songId))
        )),
      );
    }
    diagnostics.selectedSongId = selectedRecordId;
    diagnostics.placedSongId = placedRecordId;
    recordCatalog.clear();
    records.forEach((record) => {
      if (!record?.songId) return;
      recordCatalog.set(record.songId, record);
      recordEntityRegistry.ensure(record);
    });
    const residency = planEchoRecordGardenRecordResidency({
      catalogSongIds: [...recordCatalog.keys()],
      residentSongIds: [...recordEntries.keys()],
      visibleSongIds: Array.isArray(state.visibleRecordIds)
        ? state.visibleRecordIds
        : [...recordCatalog.keys()],
      placedSongId: placedRecordId,
      heldSongId: heldEntry?.record?.songId || "",
      manipulatedSongIds: Object.keys(restoredRecordTransforms),
      visibleLimit: RECORDS_PER_CRATE,
    });
    visibleResidentRecordIds = new Set(residency.visibleSongIds);
    residency.evictSongIds.forEach((songId) => {
      const entry = recordEntries.get(songId);
      if (!entry || entry === heldEntry) return;
      if (hoveredEntry === entry) {
        hoveredEntry = null;
        onHoverRecord?.("");
      }
      entry.root.removeFromParent();
      recordEntityRegistry.unbind(entry.record.id, entry.root);
      disposeRecordEntry(entry);
      recordEntries.delete(songId);
      diagnostics.recordObjectEvictions += 1;
    });
    const visibleRecords = residency.visibleSongIds
      .map((songId) => recordCatalog.get(songId))
      .filter(Boolean);
    const visibleIndex = new Map(visibleRecords.map((record, index) => [record.songId, index]));
    const loopEligibleIds = new Set(
      residency.residentSongIds
        .filter((songId) => songId !== placedRecordId)
        .slice(0, VISIBLE_RECORD_VIDEO_LIMIT),
    );
    residency.residentSongIds.forEach((songId) => {
      const record = recordCatalog.get(songId);
      if (!record) return;
      let entry = recordEntries.get(record.songId);
      if (!entry) {
        entry = createRecordEntry(record);
        entry.root.userData.recordId = record.songId;
        entry.root.traverse((object) => { object.userData.recordId = record.songId; });
        recordsRoot.add(entry.root);
        recordEntries.set(record.songId, entry);
        recordEntityRegistry.ensure(record, { object3d: entry.root });
      } else {
        recordEntityRegistry.ensure(record);
      }
      entry.record = record;
      const index = visibleIndex.get(record.songId);
      const span = Math.max(1, visibleRecords.length - 1);
      const normalized = index == null || visibleRecords.length === 1 ? 0 : (index / span) * 2 - 1;
      const restoredTransform = restoredRecordTransforms[record.songId];
      const restoredPosition = Array.isArray(restoredTransform?.position)
        && restoredTransform.position.length === 3
        && restoredTransform.position.every((value) => Number.isFinite(Number(value)))
        ? restoredTransform.position.map(Number)
        : null;
      const restoredRotation = Array.isArray(restoredTransform?.rotation)
        && restoredTransform.rotation.length === 3
        && restoredTransform.rotation.every((value) => Number.isFinite(Number(value)))
        ? restoredTransform.rotation.map(Number)
        : null;
      if (restoredPosition) {
        entry.home.fromArray(restoredPosition);
        entry.homeRotation.fromArray(restoredRotation || [0, normalized * -0.12, normalized * -0.05]);
        entry.manipulated = true;
        entry.cameraFacing = restoredTransform?.orientationMode === "camera-facing";
      } else {
        entry.manipulated = false;
        entry.cameraFacing = false;
        entry.home.set(
          normalized * 3.75,
          0.82 + Math.cos(normalized * 1.4) * 0.12,
          2.15 + Math.abs(normalized) * 0.24,
        );
        entry.homeRotation.set(0, normalized * -0.12, normalized * -0.05);
      }
      if (!entry.placed && entry.root.parent !== recordsRoot) {
        attachEchoRecordObjectPreservingWorldTransform(entry.root, recordsRoot);
      }
      if (entry !== heldEntry && !entry.placed) entry.root.position.copy(entry.home);
      if (!entry.placed) {
        entry.root.rotation.set(
          entry.homeRotation.x,
          entry.homeRotation.y,
          entry.homeRotation.z,
        );
      }
      entry.selected = record.songId === selectedRecordId;
      entry.placed = record.songId === placedRecordId;
      entry.root.visible = true;
      const loopVisual = loopEligibleIds.has(record.songId) ? recordLoopVisual(record) : null;
      const loopKey = loopVisual ? screenMediaSourceIdentity(loopVisual).key : "";
      if (!loopVisual || entry.mediaResource?.key !== loopKey) {
        if (entry.mediaResource) mediaPool.release(entry.mediaResource);
        entry.mediaResource = loopVisual ? mediaPool.acquire(loopVisual) : null;
        entry.mediaPool = mediaPool;
        entry.loopVisual = loopVisual;
      }
      if (loopVisual) {
        entry.textureUri = "";
        entry.coverTexture?.dispose?.();
        entry.coverTexture = null;
      } else {
        if (!entry.coverTexture && !entry.labelTexture) {
          entry.labelTexture = createRecordLabelTexture(record);
        }
        setRecordTexture(entry, recordCoverUri(record));
      }
      if (entry.mediaResource?.texture && record.songId !== visualRecordId) {
        assignMaterialTexture(entry.faceMaterial, entry.mediaResource.texture);
      } else if (!entry.mediaResource && record.songId !== visualRecordId) {
        assignMaterialTexture(entry.faceMaterial, entry.coverTexture || entry.labelTexture);
      }
    });
    updateRecordTitleAtlas(
      residency.residentSongIds.map((songId) => recordCatalog.get(songId)).filter(Boolean),
    );
    mediaPool.trim();
    diagnostics.recordCatalogSize = recordCatalog.size;
    diagnostics.residentRecordObjects = recordEntries.size;
    diagnostics.residentRecordMedia = [...recordEntries.values()]
      .filter((entry) => Boolean(entry.mediaResource)).length;
    canvas.dataset.recordCatalogSize = String(diagnostics.recordCatalogSize);
    canvas.dataset.residentRecordObjects = String(diagnostics.residentRecordObjects);
    canvas.dataset.residentRecordMedia = String(diagnostics.residentRecordMedia);
    canvas.dataset.recordObjectEvictions = String(diagnostics.recordObjectEvictions);
    player.record.visible = Boolean(placedRecordId);
    if (state.catalogPageCount) {
      catalogConsole.setState?.({
        page: state.catalogPage || 0,
        pageCount: state.catalogPageCount,
        sort: state.catalogSort || "album",
      });
    }
  };

  const setVisuals = (visuals = [], state = {}) => {
    const directorVisual = state.directorVisual
      || visuals.find((visual) => visual?.role === "now-playing"
        || visual?.role === "now-playing-hold"
        || visual?.role?.startsWith("now-playing"))
      || null;
    const masterVisual = state.compositeVisual || directorVisual || visuals[0] || null;
    activeVisuals = masterVisual ? [masterVisual] : [];
    assignAlbumScreenVisuals(screens, activeVisuals, mediaPool);
    const directorPresentation = setPlayerRecordVisual(player, state.compositeVisual || directorVisual, { mediaPool });
    mediaPool.warm(state.warmVisuals || []);
    visualRecordId = state.activeSongId || visualRecordId;
    recordEntries.forEach((entry, songId) => {
      const texture = songId === visualRecordId && player.mediaResource?.texture
        ? player.mediaResource.texture
        : entry.mediaResource?.texture || entry.coverTexture || entry.labelTexture;
      assignMaterialTexture(entry.faceMaterial, texture);
    });
    diagnostics.visualSurfaceCount = activeVisuals.length;
    diagnostics.activeVideos = screens.filter((screen) => Boolean(screen.mediaResource?.video)).length;
    return directorPresentation;
  };

  const setPlacedRecord = (songId) => {
    const previousId = placedRecordId;
    const previousEntry = recordEntries.get(previousId);
    const nextId = songId || "";
    if (previousEntry && previousId !== nextId) {
      const previousEntity = recordEntityRegistry.get(previousEntry.record.id)?.state;
      if (["platter", "playing"].includes(previousEntity?.state)) {
        recordEntityRegistry.transition(previousEntry.record.id, "remove", {
          eventId: `eject:${previousEntry.record.songId}:${Date.now()}`,
        });
      }
      recordEntityRegistry.transition(previousEntry.record.id, "return", {
        eventId: `return:${previousEntry.record.songId}:${Date.now()}`,
      });
      recordEntityRegistry.transition(previousEntry.record.id, "settle", {
        eventId: `settle:${previousEntry.record.songId}:${Date.now()}`,
      });
      if (previousEntry.root.parent !== recordsRoot) {
        attachEchoRecordObjectPreservingWorldTransform(previousEntry.root, recordsRoot);
      }
      previousEntry.placed = false;
      previousEntry.root.visible = visibleResidentRecordIds.has(previousId) || previousEntry.manipulated;
      previousEntry.root.position.copy(previousEntry.home);
      previousEntry.root.rotation.set(
        previousEntry.homeRotation.x,
        previousEntry.homeRotation.y,
        previousEntry.homeRotation.z,
      );
    }
    placedRecordId = nextId;
    const nextEntry = recordEntries.get(nextId);
    if (nextEntry) {
      const entityEntry = recordEntityRegistry.get(nextEntry.record.id);
      if (entityEntry?.state?.state === "crate" || entityEntry?.state?.state === "restored" || entityEntry?.state?.state === "returned") {
        recordEntityRegistry.transition(nextEntry.record.id, "pickup", {
          eventId: `button-pickup:${nextEntry.record.songId}:${Date.now()}`,
        });
      }
      recordEntityRegistry.transition(nextEntry.record.id, "place", {
        eventId: `button-place:${nextEntry.record.songId}:${Date.now()}`,
      });
      if (nextEntry.root.parent !== player.recordAnchor) {
        attachEchoRecordObjectPreservingWorldTransform(nextEntry.root, player.recordAnchor);
      }
      nextEntry.root.position.set(0, 0, 0);
      nextEntry.root.rotation.set(0, 0, 0);
      nextEntry.root.scale.setScalar(1.48);
      nextEntry.root.visible = true;
      nextEntry.placed = true;
    }
    diagnostics.placedSongId = placedRecordId;
    player.record.visible = Boolean(placedRecordId);
  };

  const setPlayback = (next = {}) => {
    playback = {
      ...playback,
      ...next,
      currentTime: Math.max(0, Number(next.currentTime ?? playback.currentTime) || 0),
    };
    applyPowerProfile(playback.reducedMotion);
    controls.enableDamping = !playback.reducedMotion;
    diagnostics.audioTime = playback.currentTime;
    diagnostics.audioState = playback.playing ? "playing" : placedRecordId ? "paused" : "idle";
  };

  const setPreviewRecord = (songId = "") => {
    previewRecordId = String(songId || "");
    return previewRecordId;
  };

  const setCaptureLocked = (nextLocked = false) => {
    captureLocked = Boolean(nextLocked);
    if (captureLocked && heldEntry) handlePointerCancel();
    canvas.dataset.captureLocked = captureLocked ? "true" : "false";
    return captureLocked;
  };

  const setWeatherPhase = (phase = "next") => {
    const progress = sceneResources.setWeatherPhase?.(phase);
    diagnostics.weatherPhase = String(phase || "next");
    canvas.dataset.weatherPhase = diagnostics.weatherPhase;
    return progress;
  };

  const spawnPrintedCard = (card = {}) => {
    if (!card.id) return;
    if (printedEntries.has(card.id)) {
      const existing = printedEntries.get(card.id);
      const transform = card.sceneTransform;
      if (Array.isArray(transform?.position) && transform.position.length === 3) {
        existing.root.position.fromArray(transform.position.map(Number));
        existing.home.copy(existing.root.position);
      }
      if (Array.isArray(transform?.rotation) && transform.rotation.length === 3) {
        existing.root.rotation.fromArray(transform.rotation.map(Number));
      }
      return;
    }
    const printedVideoCount = [...printedEntries.values()]
      .filter((candidate) => Boolean(candidate.mediaResource)).length;
    const entry = createPrintedCardEntry(
      card,
      printedVideoCount < PRINTED_CARD_VIDEO_LIMIT ? mediaPool : null,
    );
    const index = printedEntries.size;
    const transform = card.sceneTransform;
    if (Array.isArray(transform?.position) && transform.position.length === 3) {
      entry.root.position.fromArray(transform.position.map(Number));
    } else {
      entry.root.position.set(3.35 - index * 0.38, 1.2 + index * 0.045, -0.58 + index * 0.16);
    }
    if (Array.isArray(transform?.rotation) && transform.rotation.length === 3) {
      entry.root.rotation.fromArray(transform.rotation.map(Number));
    } else {
      entry.root.rotation.set(-0.24, -0.38 + index * 0.05, 0.08);
    }
    entry.home.copy(entry.root.position);
    printedCardsRoot.add(entry.root);
    printedEntries.set(card.id, entry);
    if (printedEntries.size > 5) {
      const [oldestId, oldest] = printedEntries.entries().next().value;
      printedCardsRoot.remove(oldest.root);
      disposePrintedCardEntry(oldest);
      printedEntries.delete(oldestId);
    }
  };

  const focusPrintedCard = (cardId) => {
    const entry = printedEntries.get(cardId);
    if (!entry) return;
    const nextPosition = new THREE.Vector3(4.5, 3.1, 4.6);
    if (playback.reducedMotion) camera.position.copy(nextPosition);
    else camera.position.lerp(nextPosition, 0.7);
    entry.root.getWorldPosition(tableDragPoint);
    controls.target.copy(tableDragPoint);
    controls.update();
    onCameraChange?.();
  };

  const focusVisual = (visualId) => {
    const screen = screens.find((candidate) => candidate.visual?.id === visualId);
    if (!screen) return;
    const nextPosition = new THREE.Vector3(screen.root.position.x * 0.52, 3.5, 5.6);
    if (playback.reducedMotion) camera.position.copy(nextPosition);
    else camera.position.lerp(nextPosition, 0.72);
    controls.target.set(screen.root.position.x, screen.root.position.y, screen.root.position.z);
    controls.update();
    onCameraChange?.();
  };

  const resetCamera = () => {
    camera.position.copy(defaultCameraPosition);
    controls.target.copy(defaultCameraTarget);
    controls.update();
    onCameraChange?.();
  };

  const snapshot = () => {
    const recordTransforms = Object.fromEntries(
      Object.entries(restoredRecordTransforms)
        .filter(([, transform]) => transform?.manipulated === true),
    );
    recordEntries.forEach((entry, songId) => {
      if (entry.manipulated === true) {
        recordTransforms[songId] = {
          position: entry.home.toArray(),
          rotation: entry.homeRotation.toArray(),
          ...(entry.cameraFacing ? { orientationMode: "camera-facing" } : {}),
          manipulated: true,
        };
      } else {
        delete recordTransforms[songId];
      }
    });
    const printedCardTransforms = Object.fromEntries(
      [...printedEntries.entries()].map(([cardId, entry]) => [cardId, {
        position: entry.root.position.toArray(),
        rotation: entry.root.rotation.toArray().slice(0, 3),
        manipulated: true,
      }]),
    );
    return {
      schemaVersion: "hapa.echo-record-garden.scene.v2",
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      },
      recordTransforms,
      printedCardTransforms,
    };
  };

  const restoreSnapshot = (value = {}) => {
    const cameraState = value?.camera || {};
    const position = Array.isArray(cameraState.position) ? cameraState.position : null;
    const target = Array.isArray(cameraState.target) ? cameraState.target : null;
    if (position?.length === 3 && position.every((entry) => Number.isFinite(Number(entry)))) {
      camera.position.fromArray(position.map(Number));
    }
    if (target?.length === 3 && target.every((entry) => Number.isFinite(Number(entry)))) {
      controls.target.fromArray(target.map(Number));
    }
    if (value?.recordTransforms && typeof value.recordTransforms === "object") {
      restoredRecordTransforms = Object.fromEntries(
        Object.entries(value.recordTransforms)
          .filter(([, transform]) => transform?.manipulated === true),
      );
      recordEntries.forEach((entry, songId) => {
        const transform = restoredRecordTransforms[songId];
        const restoredPosition = Array.isArray(transform?.position)
          && transform.position.length === 3
          && transform.position.every((candidate) => Number.isFinite(Number(candidate)))
          ? transform.position.map(Number)
          : null;
        const restoredRotation = Array.isArray(transform?.rotation)
          && transform.rotation.length === 3
          && transform.rotation.every((candidate) => Number.isFinite(Number(candidate)))
          ? transform.rotation.map(Number)
          : null;
        if (!restoredPosition) return;
        entry.home.fromArray(restoredPosition);
        entry.homeRotation.fromArray(restoredRotation || [0, 0, 0]);
        entry.manipulated = transform.manipulated !== false;
        entry.cameraFacing = transform.orientationMode === "camera-facing";
        if (entry !== heldEntry) entry.root.position.copy(entry.home);
        entry.root.rotation.set(
          entry.homeRotation.x,
          entry.homeRotation.y,
          entry.homeRotation.z,
        );
      });
    }
    controls.update();
  };

  const summarizeFrameTiming = () => {
    if (!frameTimingSamples.length) {
      return { samples: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, longFrames: 0 };
    }
    const sorted = [...frameTimingSamples].sort((left, right) => left - right);
    const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
    return {
      samples: sorted.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: sorted[sorted.length - 1],
      longFrames: sorted.filter((milliseconds) => milliseconds > 50).length,
    };
  };

  const sampleRenderedPixels = () => {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const width = Math.max(1, Number(gl.drawingBufferWidth) || 1);
    const height = Math.max(1, Number(gl.drawingBufferHeight) || 1);
    const patchSize = Math.max(4, Math.min(32, width, height));
    const centers = [[0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]];
    let sampledPixels = 0;
    let nonBlackPixels = 0;
    let luminanceSum = 0;
    let luminanceSquaredSum = 0;
    const buckets = new Set();
    for (const [xRatio, yRatio] of centers) {
      const x = Math.max(0, Math.min(width - patchSize, Math.round(width * xRatio - patchSize / 2)));
      const y = Math.max(0, Math.min(height - patchSize, Math.round(height * yRatio - patchSize / 2)));
      const pixels = new Uint8Array(patchSize * patchSize * 4);
      gl.readPixels(x, y, patchSize, patchSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        sampledPixels += 1;
        if (red + green + blue > 12) nonBlackPixels += 1;
        luminanceSum += luminance;
        luminanceSquaredSum += luminance * luminance;
        buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
      }
    }
    const mean = sampledPixels ? luminanceSum / sampledPixels : 0;
    const sample = {
      capturedAt: new Date().toISOString(),
      width,
      height,
      sampledPixels,
      nonBlackRatio: sampledPixels ? nonBlackPixels / sampledPixels : 0,
      uniqueBuckets: buckets.size,
      luminanceVariance: sampledPixels ? Math.max(0, luminanceSquaredSum / sampledPixels - mean * mean) : 0,
    };
    diagnostics.lastPixelSample = sample;
    return sample;
  };

  const acceptanceSurfaceSnapshot = (slot, visual, resource) => {
    const currentMediaTime = Math.max(0, Number(resource?.video?.currentTime) || 0);
    const expectedMediaTime = Math.max(0, Number(resource?.expectedMediaTime) || 0);
    return {
      slot,
      visualId: String(visual?.id || ""),
      sourceId: String(visual?.sourceId || visual?.source?.id || ""),
      sourceRevisionId: String(visual?.source?.revisionId || visual?.provenance?.revisionId || ""),
      songId: String(visual?.songId || ""),
      role: String(visual?.role || visual?.kind || ""),
      kind: String(visual?.kind || ""),
      title: String(visual?.title || ""),
      resourceKey: String(resource?.key || ""),
      clockLocked: visual?.clockLocked === true,
      generatedVisualizer: resource?.generatedVisualizer === true || visual?.kind === "generated-visualizer",
      imageBacked: Boolean(resource?.texture && !resource?.video && visual),
      mediaState: String(resource?.mediaState || (visual ? "static" : "empty")),
      readyState: Number(resource?.video?.readyState) || 0,
      hasPresentedFrame: resource?.hasPresentedFrame === true || Boolean(resource?.texture && !resource?.video),
      currentMediaTime,
      expectedMediaTime,
      driftSeconds: Math.abs(currentMediaTime - expectedMediaTime),
    };
  };

  const acceptanceSnapshot = () => {
    const audioClock = getAudioClock?.() || playback;
    const pixelSample = sampleRenderedPixels();
    const gl = renderer.getContext();
    const frameTiming = summarizeFrameTiming();
    diagnostics.frameTiming = frameTiming;
    const record = recordEntries.get(placedRecordId)?.record || null;
    const surfaces = [
      ...screens.map((screen, index) => acceptanceSurfaceSnapshot(`screen-${index + 1}`, screen.visual, screen.mediaResource)),
      acceptanceSurfaceSnapshot("record-face", player.visual, player.mediaResource),
    ];
    return {
      id: `record-garden-checkpoint-${Date.now()}`,
      capturedAt: new Date().toISOString(),
      songId: String(placedRecordId || ""),
      songTitle: String(record?.title || ""),
      directorCutId: String(diagnostics.directorCutId || ""),
      directorCutTitle: String(diagnostics.directorCutTitle || ""),
      cueId: String(player.visual?.sourceId || player.visual?.id || diagnostics.currentCueId || ""),
      audioTime: Math.max(0, Number(audioClock?.currentTime) || 0),
      recordAngle: Number(diagnostics.recordAngle) || 0,
      expectedRecordAngle: echoRecordVinylSpinRadians(Number(audioClock?.currentTime) || 0, { rpm: ECHO_RECORD_DISPLAY_RPM }),
      surfaces,
      pixelSample,
      renderer: {
        calls: Number(renderer.info.render.calls) || 0,
        triangles: Number(renderer.info.render.triangles) || 0,
        geometries: Number(renderer.info.memory.geometries) || 0,
        textures: Number(renderer.info.memory.textures) || 0,
      },
      frameTiming,
      environment: {
        visualProfile: sceneResources.metrics,
        viewport: {
          width: Math.max(0, globalThis.innerWidth || 0),
          height: Math.max(0, globalThis.innerHeight || 0),
          drawingBufferWidth: Math.max(0, gl.drawingBufferWidth || 0),
          drawingBufferHeight: Math.max(0, gl.drawingBufferHeight || 0),
          devicePixelRatio: Math.max(0, globalThis.devicePixelRatio || 1),
        },
        prefersReducedMotion: playback.reducedMotion === true,
        maxTouchPoints: Math.max(0, Number(globalThis.navigator?.maxTouchPoints) || 0),
        coarsePointer: globalThis.matchMedia?.("(pointer: coarse)")?.matches === true,
        pointerTypes: Object.entries(diagnostics.inputCounts)
          .filter(([, count]) => Number(count) > 0)
          .map(([type]) => type),
        webgl: { version: String(gl.getParameter(gl.VERSION) || "") },
      },
    };
  };

  const render = (frameTimestamp = 0) => {
    if (disposed) return;
    animationFrame = requestAnimationFrame(render);
    const elapsed = Math.max(0, Number(frameTimestamp) || 0) / 1000;
    const rawDelta = previousFrameSeconds
      ? Math.max(0, elapsed - previousFrameSeconds)
      : 0;
    const delta = Math.min(0.05, rawDelta);
    previousFrameSeconds = elapsed;
    const timingDiscontinuity = document.hidden || rawDelta > 0.25;
    if (timingDiscontinuity) {
      frameTimingSamples.length = 0;
      pressureWindows = 0;
      recoveryWindows = 0;
    } else if (rawDelta > 0) {
      frameTimingSamples.push(rawDelta * 1000);
      const frameSampleLimit = activeAcceptanceRun() ? 12_000 : 600;
      if (frameTimingSamples.length > frameSampleLimit) frameTimingSamples.shift();
    }
    const liveAudioClock = getAudioClock?.();
    const framePlayback = liveAudioClock
      ? {
          ...playback,
          currentTime: Math.max(0, Number(liveAudioClock.currentTime) || 0),
          duration: Math.max(0, Number(liveAudioClock.duration) || playback.duration || 0),
          playing: Boolean(liveAudioClock.playing),
        }
      : playback;
    const acceptanceRun = activeAcceptanceRun();
    if (acceptanceRun) {
      if (acceptanceRunId !== acceptanceRun.startedAt) {
        if (acceptanceDetailTierBeforeRun == null) {
          acceptanceDetailTierBeforeRun = adaptiveDetailTier;
        }
        setAdaptiveDetailTier("full");
        acceptanceRunId = String(acceptanceRun.startedAt || `acceptance-${Date.now()}`);
        frameTimingSamples.length = 0;
      }
      if (framePlayback.reducedMotion) acceptanceRun.reducedMotionObserved = true;
      const clockSeconds = Math.max(0, Number(framePlayback.currentTime) || 0);
      const currentCutId = String(diagnostics.directorCutId || "");
      const continuesSamePlayback = Boolean(
        framePlayback.playing
        && acceptanceRun.lastPlaybackSongId === placedRecordId
        && acceptanceRun.lastPlaybackCutId === currentCutId
        && clockSeconds >= Number(acceptanceRun.lastPlaybackClockSeconds || 0)
      );
      if (continuesSamePlayback) {
        const progress = clockSeconds - Number(acceptanceRun.lastPlaybackClockSeconds || 0);
        if (progress > 0 && progress <= 1) {
          acceptanceRun.playbackSeconds = Number(acceptanceRun.playbackSeconds || 0) + progress;
          acceptanceRun.currentUninterruptedPlaybackSeconds = Number(
            acceptanceRun.currentUninterruptedPlaybackSeconds || 0,
          ) + progress;
          if (
            acceptanceRun.currentUninterruptedPlaybackSeconds
            > Number(acceptanceRun.maxUninterruptedPlaybackSeconds || 0)
          ) {
            acceptanceRun.maxUninterruptedPlaybackSeconds = acceptanceRun.currentUninterruptedPlaybackSeconds;
            acceptanceRun.uninterruptedPlaybackSongId = String(placedRecordId || "");
            acceptanceRun.uninterruptedPlaybackCutId = currentCutId;
          }
        } else if (progress > 1) {
          acceptanceRun.currentUninterruptedPlaybackSeconds = 0;
        }
      } else {
        acceptanceRun.currentUninterruptedPlaybackSeconds = 0;
      }
      acceptanceRun.lastPlaybackClockSeconds = clockSeconds;
      acceptanceRun.lastPlaybackSongId = String(placedRecordId || "");
      acceptanceRun.lastPlaybackCutId = currentCutId;
    } else {
      if (acceptanceRunId && acceptanceDetailTierBeforeRun) {
        setAdaptiveDetailTier(acceptanceDetailTierBeforeRun);
      }
      acceptanceRunId = "";
      acceptanceDetailTierBeforeRun = null;
    }
    if (syncDirectorVisuals) syncDirectorVisuals(framePlayback.currentTime);
    const framePowerProfile = framePlayback.reducedMotion
      ? ECHO_RECORD_GARDEN_POWER_PROFILES.reduced
      : ECHO_RECORD_GARDEN_POWER_PROFILES.full;
    controls.update();
    player.record.visible = Boolean(placedRecordId);
    if (player.record.visible) {
      const displayRecordAngle = echoRecordVinylSpinRadians(framePlayback.currentTime, {
        rpm: ECHO_RECORD_DISPLAY_RPM,
      });
      diagnostics.recordAngle = displayRecordAngle;
      player.record.rotation.y = framePlayback.reducedMotion ? 0 : displayRecordAngle;
      player.labelRing.rotation.y = player.record.rotation.y;
      player.toneArm.rotation.y = THREE.MathUtils.lerp(
        -0.2,
        0.34,
        framePlayback.duration > 0 ? THREE.MathUtils.clamp(framePlayback.currentTime / framePlayback.duration, 0, 1) : 0,
      );
    }
    player.dropRing.material.opacity = heldEntry
      ? player.dropRing.material.opacity
      : framePowerProfile.dropRingPulse
        ? 0.26 + Math.sin(elapsed * 1.4) * 0.08
        : 0.26;
    recordEntries.forEach((entry, songId) => {
      if (entry === heldEntry) return;
      if (entry.placed) {
        entry.root.position.set(0, 0, 0);
        entry.root.rotation.set(0, 0, 0);
        entry.root.scale.setScalar(1.48);
        return;
      }
      const selected = songId === selectedRecordId;
      const targetY = entry.home.y + (selected ? 0.22 : entry.hovered ? 0.12 : 0);
      const scale = selected ? 1.08 : entry.hovered ? 1.035 : 1;
      if (framePlayback.reducedMotion) {
        entry.root.position.y = targetY;
        entry.root.scale.setScalar(scale);
      } else {
        entry.root.position.y = THREE.MathUtils.damp(entry.root.position.y, targetY, 9, delta);
        entry.root.scale.lerp(new THREE.Vector3(scale, scale, scale), Math.min(1, delta * 9));
      }
      entry.edgeMaterial.emissiveIntensity = selected ? 0.66 : entry.hovered ? 0.42 : 0.18;
      const decorativeYaw = !entry.cameraFacing && !framePlayback.reducedMotion && selected
        ? Math.sin(elapsed * 0.8) * 0.04
        : 0;
      entry.root.rotation.y = entry.homeRotation.y + decorativeYaw;
      if (entry.mediaResource && entry.loopVisual && entry.root.visible) {
        updateMediaResourcePlayback(entry.mediaResource, entry.loopVisual, {
          playback: { ...framePlayback, currentTime: elapsed, playing: true },
          elapsed,
          reducedMotion: playback.reducedMotion,
        });
        if (entry.mediaResource.texture && songId !== visualRecordId) {
          assignMaterialTexture(entry.faceMaterial, entry.mediaResource.texture);
        }
      }
    });
    const visualizerRecordId = placedRecordId || previewRecordId;
    const visualizerEntry = recordEntries.get(visualizerRecordId) || null;
    const signalFrame = framePlayback.playing && visualizerEntry
      ? getAudioSignal?.(framePlayback.currentTime)
      : null;
    audioVisualizer.setTarget(visualizerEntry?.root || null);
    audioVisualizer.update({
      fft: signalFrame?.fft,
      active: Boolean(visualizerEntry && framePlayback.playing),
      elapsed,
      delta,
      reducedMotion: framePlayback.reducedMotion,
      heightOffset: visualizerEntry?.placed ? 0.22 : 0.16,
      radius: visualizerEntry?.placed ? 0.92 : 0.76,
      accent: visualizerEntry?.edgeMaterial?.emissive?.getHex?.() || 0x56f0cf,
    });
    diagnostics.visualizerStatus = visualizerEntry && framePlayback.playing
      ? signalFrame?.status === "live" ? "live" : "warming"
      : "idle";
    printedEntries.forEach((entry) => {
      if (!entry.mediaResource || !entry.presentation) return;
      updateMediaResourcePlayback(entry.mediaResource, entry.presentation, {
        playback: { ...framePlayback, currentTime: elapsed, playing: true },
        elapsed,
        reducedMotion: playback.reducedMotion,
      });
      if (entry.mediaResource.texture) applyPrintedCardMediaCover(entry, entry.mediaResource.texture);
    });
    screens.forEach((screen, index) => {
      updateAlbumScreen(screen, {
        playback: framePlayback,
        elapsed,
        reducedMotion: playback.reducedMotion,
        focus: index === 0,
      });
    });
    if (
      player.mediaResource
      && player.visual
      && !screens.some((screen) => screen.mediaResource === player.mediaResource)
    ) {
      updateMediaResourcePlayback(player.mediaResource, player.visual, {
        playback: framePlayback,
        elapsed,
        reducedMotion: playback.reducedMotion,
      });
    }
    if (player.mediaResource?.texture) {
      const activeRecord = recordEntries.get(visualRecordId);
      if (activeRecord) assignMaterialTexture(activeRecord.faceMaterial, player.mediaResource.texture);
    }
    updateSundayScene(sceneResources, elapsed, playback.reducedMotion);
    renderer.render(scene, camera);
    renderedFrames += 1;
    if (!activeAcceptanceRun() && renderedFrames % 120 === 0 && frameTimingSamples.length >= 120) {
      const recentFrameTimes = frameTimingSamples.slice(-120).sort((left, right) => left - right);
      const p95FrameMs = recentFrameTimes[Math.floor((recentFrameTimes.length - 1) * 0.95)] || 0;
      diagnostics.adaptiveP95FrameMs = p95FrameMs;
      if (p95FrameMs > 28) {
        pressureWindows += 1;
        recoveryWindows = 0;
      } else if (p95FrameMs < 19) {
        recoveryWindows += 1;
        pressureWindows = 0;
      } else {
        pressureWindows = 0;
        recoveryWindows = 0;
      }
      if (adaptiveDetailTier === "full" && pressureWindows >= 2) {
        setAdaptiveDetailTier("reduced");
        pressureWindows = 0;
      } else if (adaptiveDetailTier === "reduced" && recoveryWindows >= 4) {
        setAdaptiveDetailTier("full");
        recoveryWindows = 0;
      }
    }
    if (renderedFrames % 30 === 0) {
      diagnostics.audioTime = framePlayback.currentTime;
      diagnostics.audioState = framePlayback.playing ? "playing" : placedRecordId ? "paused" : "idle";
      diagnostics.rendererMemory = {
        geometries: Number(renderer.info.memory.geometries) || 0,
        textures: Number(renderer.info.memory.textures) || 0,
      };
      diagnostics.visualProfile = sceneResources.metrics;
      diagnostics.frameTiming = summarizeFrameTiming();
      diagnostics.activeVideos = screens.filter((screen) => Boolean(
        screen.mediaResource?.video
        || screen.mediaResource?.canvasBacked
        || screen.mediaResource?.generatedVisualizer,
      )).length;
      diagnostics.bufferedVideos = screens.filter((screen) => (
        screen.mediaResource?.mediaState === "ready"
      )).length;
      diagnostics.presentedVideos = screens.filter((screen) => (
        screen.mediaResource?.hasPresentedFrame
      )).length;
      diagnostics.waitingVideos = screens.filter((screen) => (
        screen.mediaResource
        && !screen.mediaResource.hasPresentedFrame
        && !["failed", "disposed"].includes(screen.mediaResource.mediaState)
      )).length;
      const acceptanceMetrics = activeAcceptanceRun();
      if (acceptanceMetrics) {
        acceptanceMetrics.frameTiming = diagnostics.frameTiming;
        acceptanceMetrics.maxWaitingVideos = Math.max(
          Number(acceptanceMetrics.maxWaitingVideos || 0),
          diagnostics.waitingVideos,
        );
        acceptanceMetrics.maxRendererGeometries = Math.max(
          Number(acceptanceMetrics.maxRendererGeometries || 0),
          diagnostics.rendererMemory.geometries,
        );
        acceptanceMetrics.maxRendererTextures = Math.max(
          Number(acceptanceMetrics.maxRendererTextures || 0),
          diagnostics.rendererMemory.textures,
        );
      }
      if (diagnostics.contextState === "restored") diagnostics.contextState = "available";
      canvas.dataset.recordAngle = diagnostics.recordAngle.toFixed(6);
      canvas.dataset.audioTime = diagnostics.audioTime.toFixed(3);
      canvas.dataset.activeVideos = String(diagnostics.activeVideos);
      canvas.dataset.bufferedVideos = String(diagnostics.bufferedVideos);
      canvas.dataset.presentedVideos = String(diagnostics.presentedVideos);
      canvas.dataset.warmingVideos = String(diagnostics.warmingVideos);
      canvas.dataset.warmReadyVideos = String(diagnostics.warmReadyVideos);
      canvas.dataset.waitingVideos = String(diagnostics.waitingVideos);
      canvas.dataset.mediaPoolSize = String(diagnostics.mediaPoolSize);
      canvas.dataset.mediaHardSeeks = String(diagnostics.mediaHardSeeks);
      canvas.dataset.visualizerStatus = diagnostics.visualizerStatus;
      canvas.dataset.rendererMemory = `${diagnostics.rendererMemory.geometries}:${diagnostics.rendererMemory.textures}`;
    }
  };
  render();

  return {
    setRecords,
    setVisuals,
    setPlacedRecord,
    setPlayback,
    setPreviewRecord,
    setCaptureLocked,
    setWeatherPhase,
    spawnPrintedCard,
    focusPrintedCard,
    focusVisual,
    resetCamera,
    restoreSnapshot,
    snapshot,
    acceptanceSnapshot,
    cancelInteraction: () => handlePointerCancel(),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener("lostpointercapture", handlePointerCancel);
      renderer.domElement.removeEventListener("wheel", handleWheel, { capture: true });
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost, false);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored, false);
      controls.removeEventListener("end", handleControlsEnd);
      controls.dispose();
      recordEntries.forEach((entry) => {
        recordEntityRegistry.unbind(entry.record.id, entry.root);
        disposeRecordEntry(entry);
      });
      recordEntries.clear();
      recordCatalog.clear();
      visibleResidentRecordIds = new Set();
      recordTitleAtlas?.texture?.dispose?.();
      recordTitleAtlas = null;
      recordTitleAtlasSignature = "";
      printedEntries.forEach(disposePrintedCardEntry);
      screens.forEach((screen) => {
        if (screen.mediaResource?.poolManaged) mediaPool.release(screen.mediaResource);
        else disposeScreenMediaResource(screen.mediaResource);
        screen.mediaResource = null;
      });
      if (player.mediaResource?.poolManaged) mediaPool.release(player.mediaResource);
      else disposeScreenMediaResource(player.mediaResource);
      player.mediaResource = null;
      player.visual = null;
      mediaPool.dispose();
      screens.forEach(disposeAlbumScreen);
      catalogConsole.dispose();
      audioVisualizer.dispose();
      player.dispose();
      sceneResources.dispose();
      renderer.dispose();
      diagnostics.disposedGames += 1;
      diagnostics.liveGames = Math.max(0, diagnostics.liveGames - 1);
      diagnostics.liveRenderers = Math.max(0, diagnostics.liveRenderers - 1);
      diagnostics.activeVideos = 0;
      diagnostics.bufferedVideos = 0;
      diagnostics.presentedVideos = 0;
      diagnostics.warmingVideos = 0;
      diagnostics.warmReadyVideos = 0;
      diagnostics.waitingVideos = 0;
      diagnostics.mediaPoolSize = 0;
      diagnostics.recordCatalogSize = 0;
      diagnostics.residentRecordObjects = 0;
      diagnostics.residentRecordMedia = 0;
      diagnostics.contextState = diagnostics.liveRenderers ? "available" : "disposed";
      canvas.dataset.rendererState = "disposed";
      canvas.dataset.recordCatalogSize = "0";
      canvas.dataset.residentRecordObjects = "0";
      canvas.dataset.residentRecordMedia = "0";
    },
  };
}

function createLazySundayScene(world, { scene = world?.parent, renderer = null } = {}) {
  if (!world || !scene) throw new Error("Record Garden visual system requires a world and scene");
  return createEchoRecordGardenVisualSystem({ world, scene, renderer });
}

function updateSundayScene(resources, elapsed, reducedMotion) {
  if (reducedMotion) {
    resources.bokeh.rotation.y = 0;
    resources.parasolRoot.rotation.y = 0;
    resources.cloth.rotation.z = -0.04;
    updateEchoRecordGardenVisualSystem(resources, 0, true);
    return;
  }
  resources.bokeh.rotation.y = elapsed * 0.018;
  resources.bokeh.position.y = Math.sin(elapsed * 0.38) * 0.05;
  resources.bokeh.material.opacity = 0.28 + Math.sin(elapsed * 0.7) * 0.07;
  resources.parasolRoot.rotation.y = Math.sin(elapsed * 0.16) * 0.018;
  resources.cloth.rotation.z = -0.04 + Math.sin(elapsed * 0.31) * 0.006;
  updateEchoRecordGardenVisualSystem(resources, elapsed, false);
}

function createRecordPlayer(world, materialKit = null) {
  const root = new THREE.Group();
  root.name = "EchoRecordPlayer";
  root.position.set(1.8, 0.05, 0.22);
  world.add(root);

  const base = new THREE.Mesh(
    createEchoGardenRoundedBoxGeometry(3.25, 0.34, 2.55, 0.12, 4),
    materialKit?.clone?.("deepWood", { color: 0x6d4935, roughness: 0.6 })
      || new THREE.MeshStandardMaterial({ color: 0x3d2f28, roughness: 0.58, metalness: 0.06 }),
  );
  base.position.y = 0.17;
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  const footMaterial = materialKit?.clone?.("charcoal", { color: 0x35322f, roughness: 0.82, metalness: 0.02 })
    || new THREE.MeshStandardMaterial({ color: 0x35322f, roughness: 0.82, metalness: 0.02 });
  for (const [x, z] of [[-1.32, -0.98], [1.32, -0.98], [-1.32, 0.98], [1.32, 0.98]]) {
    const foot = new THREE.Mesh(
      createEchoGardenRoundedBoxGeometry(0.24, 0.07, 0.24, 0.03, 3),
      footMaterial,
    );
    foot.position.set(x, -0.035, z);
    foot.receiveShadow = true;
    root.add(foot);
  }

  const inset = new THREE.Mesh(
    createEchoGardenRoundedBoxGeometry(3.02, 0.08, 2.32, 0.035, 3),
    materialKit?.clone?.("wood", { color: 0xd9bd8b, roughness: 0.62 })
      || new THREE.MeshStandardMaterial({ color: 0xcda96b, roughness: 0.62 }),
  );
  inset.position.y = 0.38;
  root.add(inset);

  const platter = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.08, 0.12, 64),
    materialKit?.clone?.("charcoal", { roughness: 0.3, metalness: 0.72 })
      || new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.32, metalness: 0.7 }),
  );
  platter.position.set(-0.38, 0.5, 0);
  platter.castShadow = true;
  root.add(platter);

  // The platter owns an anchor, not a duplicate vinyl mesh. The selected
  // Record Object3D is reparented here so pickup -> placement -> playback ->
  // eject remains one physical object with one stable identity.
  const recordAnchor = new THREE.Group();
  recordAnchor.name = "EchoRecordPlayerRecordAnchor";
  recordAnchor.position.set(-0.38, 0.61, 0);
  recordAnchor.visible = false;
  root.add(recordAnchor);

  const labelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.37, 0.017, 8, 56),
    new THREE.MeshBasicMaterial({ color: 0xffe6a6, transparent: true, opacity: 0.82 }),
  );
  labelRing.rotation.x = Math.PI / 2;
  labelRing.position.set(-0.38, 0.62, 0);
  root.add(labelRing);

  const spindle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.2, 16),
    materialKit?.clone?.("brass", { roughness: 0.2, metalness: 0.9 })
      || new THREE.MeshStandardMaterial({ color: 0xe9d6a8, metalness: 0.9, roughness: 0.2 }),
  );
  spindle.position.set(-0.38, 0.69, 0);
  root.add(spindle);

  const toneArmPivot = new THREE.Group();
  toneArmPivot.position.set(1.08, 0.68, -0.78);
  root.add(toneArmPivot);
  const toneArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 1.78, 12),
    materialKit?.clone?.("brass", { color: 0xe7d8b7, roughness: 0.28, metalness: 0.72 })
      || new THREE.MeshStandardMaterial({ color: 0xe7d8b7, roughness: 0.28, metalness: 0.72 }),
  );
  toneArm.position.set(-0.62, 0, 0.25);
  toneArm.rotation.z = Math.PI / 2.7;
  toneArmPivot.add(toneArm);
  const needle = new THREE.Mesh(
    createEchoGardenRoundedBoxGeometry(0.16, 0.09, 0.22, 0.025, 3),
    materialKit?.clone?.("deepWood", { color: 0x4a342b, roughness: 0.5 })
      || new THREE.MeshStandardMaterial({ color: 0x31241f, roughness: 0.5 }),
  );
  needle.position.set(-1.05, -0.5, 0.42);
  toneArmPivot.add(needle);

  const dropRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.24, 0.035, 10, 64),
    new THREE.MeshBasicMaterial({ color: 0x56f0cf, transparent: true, opacity: 0.34 }),
  );
  dropRing.rotation.x = Math.PI / 2;
  dropRing.position.set(-0.38, 0.72, 0);
  root.add(dropRing);

  const platterTablePosition = new THREE.Vector3(
    root.position.x + platter.position.x,
    root.position.y + platter.position.y,
    root.position.z + platter.position.z,
  );
  return {
    root,
    record: recordAnchor,
    recordAnchor,
    recordMaterials: [],
    labelRing,
    toneArm: toneArmPivot,
    dropRing,
    platterTablePosition,
    visual: null,
    mediaResource: null,
    dispose() {
      if (!this.mediaResource?.poolManaged) disposeScreenMediaResource(this.mediaResource);
      const geometries = new Set();
      const materials = new Set();
      root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
        else if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    },
  };
}

function createRecordCatalogConsole(world, materialKit = null) {
  const root = new THREE.Group();
  root.name = "EchoRecordSpatialCatalogConsole";
  root.position.set(-4.05, 0.07, 0.15);
  root.rotation.y = 0.22;
  world.add(root);

  const panel = new THREE.Mesh(
    createEchoGardenRoundedBoxGeometry(1.55, 0.18, 2.42, 0.075, 4),
    materialKit?.clone?.("deepWood", { color: 0x563d31, roughness: 0.65, metalness: 0.04 })
      || new THREE.MeshStandardMaterial({ color: 0x34251f, roughness: 0.62, metalness: 0.08 }),
  );
  panel.castShadow = true;
  root.add(panel);

  const titleTexture = createCatalogConsoleTexture({ page: 0, pageCount: 1, sort: "album" });
  const titleMaterial = new THREE.MeshBasicMaterial({ map: titleTexture, toneMapped: false });
  const title = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.72), titleMaterial);
  title.rotation.x = -Math.PI / 2;
  title.position.set(0, 0.105, -0.52);
  root.add(title);

  const specs = [
    { action: "previous", label: "◀", x: -0.46, z: 0.56, color: 0x56f0cf },
    { action: "sort", label: "SORT", x: 0, z: 0.56, color: 0xf6c96d },
    { action: "next", label: "▶", x: 0.46, z: 0.56, color: 0x56f0cf },
  ];
  const buttonAtlasTexture = createCatalogButtonAtlasTexture(specs);
  const hitTargets = specs.map((spec, index) => {
    const material = new THREE.MeshBasicMaterial({ map: buttonAtlasTexture, toneMapped: false });
    const geometry = createEchoGardenRoundedBoxGeometry(0.38, 0.11, 0.5, 0.035, 3);
    applyRecordTitleAtlasUv(geometry, {
      column: index,
      row: 0,
      columns: specs.length,
      rows: 1,
    });
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshStandardMaterial({ color: 0x182324, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x182324, roughness: 0.5 }),
      material,
      new THREE.MeshStandardMaterial({ color: 0x182324, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x182324, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x182324, roughness: 0.5 }),
    ]);
    mesh.position.set(spec.x, 0.13, spec.z);
    mesh.userData.catalogAction = spec.action;
    root.add(mesh);
    return mesh;
  });

  return {
    root,
    hitTargets,
    setState(state = {}) {
      const next = createCatalogConsoleTexture(state);
      const previous = titleMaterial.map;
      titleMaterial.map = next;
      titleMaterial.needsUpdate = true;
      previous?.dispose?.();
    },
    dispose() {
      root.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      titleMaterial.map?.dispose?.();
      buttonAtlasTexture.dispose();
    },
  };
}

function createCatalogConsoleTexture({ page = 0, pageCount = 1, sort = "album" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 288;
  const context = canvas.getContext("2d");
  context.fillStyle = "#071519";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#56f0cf";
  context.lineWidth = 8;
  context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  context.fillStyle = "#56f0cf";
  context.font = "700 24px ui-monospace, monospace";
  context.fillText("3D RECORD LIBRARY", 34, 58);
  context.fillStyle = "#f8f3e7";
  context.font = "800 54px system-ui";
  context.fillText(`${Math.max(1, Number(page) + 1)} / ${Math.max(1, Number(pageCount) || 1)}`, 34, 138);
  context.fillStyle = "#f6c96d";
  context.font = "700 22px ui-monospace, monospace";
  context.fillText(String(sort || "album").replace(/-/g, " ").toUpperCase(), 34, 206);
  context.fillStyle = "rgba(248,243,231,.68)";
  context.font = "600 17px system-ui";
  context.fillText("Browse and sort inside the garden", 34, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCatalogButtonAtlasTexture(specs = []) {
  const source = specs.length ? specs : [{ label: "•", color: 0x56f0cf }];
  const canvas = document.createElement("canvas");
  canvas.width = 256 * source.length;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  source.forEach(({ label = "", color = 0x56f0cf }, index) => {
    const x = index * 256;
    context.fillStyle = "#0a171a";
    context.fillRect(x, 0, 256, 128);
    context.strokeStyle = `#${Number(color).toString(16).padStart(6, "0")}`;
    context.lineWidth = 8;
    context.strokeRect(x + 5, 5, 246, 118);
    context.fillStyle = "#f8f3e7";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = label.length > 2 ? "800 34px system-ui" : "800 58px system-ui";
    context.fillText(label, x + 128, 64);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function screenMediaSourceIdentity(visual = {}) {
  visual = visual && typeof visual === "object" ? visual : {};
  const canvasKey = visual.canvas && typeof visual.canvas.getContext === "function"
    ? String(visual.canvasKey || visual.id || "director-canvas")
    : "";
  const videoUri = visual.videoUri || (/\.mp4(?:$|\?)/i.test(visual.mediaUri || "") ? visual.mediaUri : "");
  const imageUri = visual.imageUri || visual.posterUri || (!videoUri ? visual.mediaUri : "") || "";
  const revision = visual.source?.revisionId
    || visual.provenance?.referenceRevisionId
    || visual.provenance?.revisionId
    || visual.provenance?.contentHash
    || visual.attachment?.card?.revisionId
    || visual.attachment?.cardId
    || "";
  const mode = visual.clockLocked === false ? "ambient-loop" : "audio-clock";
  const clipIdentity = mode === "audio-clock"
    ? [
        visual.sourceId || visual.mediaId || "",
        Math.max(0, Number(visual.startSeconds) || 0),
        Math.max(0, Number(visual.sourceStartSeconds) || 0),
        Math.max(0, Number(visual.sourceEndSeconds) || 0),
        Math.max(0, Number(visual.durationSeconds) || 0),
        visual.playbackMode || "once",
        visual.timeMapping || null,
      ]
    : [];
  return {
    canvasKey,
    videoUri,
    imageUri,
    revision: String(revision),
    key: JSON.stringify([
      canvasKey ? "canvas" : videoUri ? "video" : imageUri ? "image" : "fallback",
      canvasKey,
      videoUri || "",
      imageUri || "",
      String(revision),
      mode,
      ...clipIdentity,
    ]),
  };
}

function assignMaterialTexture(material, texture) {
  if (!material || !texture || material.map === texture) return false;
  material.map = texture;
  material.color?.setHex?.(0xffffff);
  material.needsUpdate = true;
  return true;
}

function setPlayerRecordVisual(player, visual, { mediaPool }) {
  if (!visual || typeof visual !== "object") {
    const previous = player.mediaResource;
    player.visual = null;
    player.mediaResource = null;
    if (previous) mediaPool.release(previous);
    return null;
  }
  const identity = screenMediaSourceIdentity(visual);
  if (player.mediaResource?.key === identity.key) {
    player.visual = visual || null;
    return player.mediaResource?.firstFramePromise || null;
  }
  const previous = player.mediaResource;
  player.visual = visual || null;
  player.mediaResource = visual ? mediaPool.acquire(visual) : null;
  if (previous) mediaPool.release(previous);
  return player.mediaResource?.firstFramePromise || null;
}

function createAlbumScreens(world, materialKit = null) {
  const specs = [
    ECHO_RECORD_GARDEN_SPATIAL_LAYOUT.screen,
  ];
  return specs.map((spec, index) => {
    const root = new THREE.Group();
    root.name = `EchoAlbumScreen${index + 1}`;
    root.position.set(spec.x, spec.y, spec.z);
    root.rotation.y = spec.ry;
    root.scale.setScalar(spec.scale);
    world.add(root);

    const frame = new THREE.Mesh(
      createEchoGardenRoundedBoxGeometry(7.44, 4.34, 0.2, 0.085, 4),
      materialKit?.clone?.("deepWood", { color: 0x604337, roughness: 0.52, metalness: 0.05 })
        || new THREE.MeshStandardMaterial({ color: 0x3c2b24, roughness: 0.48, metalness: 0.08 }),
    );
    frame.castShadow = true;
    root.add(frame);

    const standbyTexture = createVisualTitleTexture({ title: "Echo surface", kindLabel: "WAITING FOR RECORD" });
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: standbyTexture,
      color: 0xffffff,
      toneMapped: false,
      fog: false,
    });
    const hitTarget = new THREE.Mesh(new THREE.PlaneGeometry(7.08, 3.98), screenMaterial);
    hitTarget.position.z = 0.106;
    root.add(hitTarget);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(7.66, 4.56),
      new THREE.MeshBasicMaterial({
        color: 0xf0c98b,
        transparent: true,
        opacity: 0.055,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.z = -0.02;
    root.add(glow);
    return {
      root,
      frame,
      hitTarget,
      screenMaterial,
      glow,
      visual: null,
      mediaResource: {
        key: "initial-standby",
        texture: standbyTexture,
        dispose: () => standbyTexture.dispose(),
      },
      index,
    };
  });
}

function setScreenVideoPlaying(resource, shouldPlay) {
  const video = resource?.video;
  if (!video || resource.mediaState === "disposed" || resource.mediaState === "failed") return;
  resource.desiredPlaying = Boolean(shouldPlay);
  if (!resource.desiredPlaying) {
    video.playbackRate = 1;
    if (!video.paused) video.pause();
    return;
  }
  if (!video.paused || resource.playPending || Date.now() < resource.nextPlayAttemptAt) return;
  resource.diagnostics.mediaPlayRequests += 1;
  resource.nextPlayAttemptAt = Date.now() + 250;
  resource.playPending = Promise.resolve(video.play())
    .catch(() => {
      resource.nextPlayAttemptAt = Date.now() + 1_000;
    })
    .finally(() => {
      resource.playPending = null;
      if (!resource.desiredPlaying && !video.paused) video.pause();
    });
}

function createScreenMediaPool({
  apiBase,
  renderer,
  diagnostics,
  limit = SCREEN_MEDIA_POOL_LIMIT,
  onMediaError,
}) {
  const entries = new Map();
  let sequence = 0;
  let warmSignature = "";

  const updateDiagnostics = () => {
    diagnostics.mediaPoolSize = entries.size;
    diagnostics.bufferedVideos = [...entries.values()].filter(({ resource }) => (
      resource.mediaState === "ready"
    )).length;
    diagnostics.presentedVideos = [...entries.values()].filter(({ resource }) => (
      resource.hasPresentedFrame
    )).length;
    diagnostics.warmingVideos = [...entries.values()].filter(({ resource, warm }) => (
      warm && resource
    )).length;
    diagnostics.warmReadyVideos = [...entries.values()].filter(({ resource, warm }) => (
      warm && resource.hasPresentedFrame
    )).length;
    diagnostics.waitingVideos = [...entries.values()].filter(({ resource }) => (
      resource.video
      && !resource.hasPresentedFrame
      && !["failed", "disposed"].includes(resource.mediaState)
    )).length;
  };

  const trim = () => {
    if (entries.size <= limit) {
      updateDiagnostics();
      return;
    }
    const removable = [...entries.values()]
      .filter((entry) => entry.references === 0 && !entry.warm)
      .sort((left, right) => left.lastUsed - right.lastUsed);
    while (entries.size > limit && removable.length) {
      const entry = removable.shift();
      entries.delete(entry.key);
      entry.resource.dispose();
    }
    updateDiagnostics();
  };

  const makeRoomForOptionalEntry = () => {
    if (entries.size < limit) return true;
    const removable = [...entries.values()]
      .filter((entry) => entry.references === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed);
    while (entries.size >= limit && removable.length) {
      const entry = removable.shift();
      entries.delete(entry.key);
      entry.resource.dispose();
    }
    updateDiagnostics();
    return entries.size < limit;
  };

  const ensureEntry = (visual, { optional = false } = {}) => {
    const identity = screenMediaSourceIdentity(visual);
    let entry = entries.get(identity.key);
    if (!entry) {
      const hasRoom = makeRoomForOptionalEntry();
      if (optional && !hasRoom) return null;
      const resource = createScreenMediaResource(visual, {
        apiBase,
        renderer,
        diagnostics,
        fallbackTexture: createVisualTitleTexture(visual),
        onMediaError,
      });
      resource.poolManaged = true;
      entry = {
        key: identity.key,
        resource,
        references: 0,
        warm: false,
        lastUsed: ++sequence,
      };
      entries.set(identity.key, entry);
    }
    return entry;
  };

  return {
    acquire(visual) {
      const entry = ensureEntry(visual);
      entry.references += 1;
      entry.lastUsed = ++sequence;
      updateDiagnostics();
      return entry.resource;
    },
    tryAcquire(visual) {
      const entry = ensureEntry(visual, { optional: true });
      if (!entry) return null;
      entry.references += 1;
      entry.lastUsed = ++sequence;
      updateDiagnostics();
      return entry.resource;
    },
    release(resource) {
      const entry = resource?.poolManaged ? entries.get(resource.key) : null;
      if (!entry) {
        disposeScreenMediaResource(resource);
        return;
      }
      entry.references = Math.max(0, entry.references - 1);
      entry.lastUsed = ++sequence;
      if (entry.references === 0) setScreenVideoPlaying(entry.resource, false);
      trim();
    },
    warm(visuals = []) {
      const nextWarmSignature = visuals
        .slice(0, SCREEN_COUNT)
        .map((visual) => screenMediaSourceIdentity(visual).key)
        .join("\n");
      if (warmSignature === nextWarmSignature) {
        updateDiagnostics();
        return;
      }
      warmSignature = nextWarmSignature;
      entries.forEach((entry) => { entry.warm = false; });
      const warmKeys = new Set();
      visuals.slice(0, SCREEN_COUNT).forEach((visual) => {
        const entry = ensureEntry(visual, { optional: true });
        if (!entry) {
          warmSignature = "";
          return;
        }
        if (warmKeys.has(entry.key) || entry.references > 0) return;
        warmKeys.add(entry.key);
        entry.warm = true;
        entry.lastUsed = ++sequence;
        setScreenVideoPlaying(entry.resource, false);
      });
      trim();
      updateDiagnostics();
    },
    trim,
    dispose() {
      entries.forEach(({ resource }) => resource.dispose());
      entries.clear();
      warmSignature = "";
      updateDiagnostics();
    },
  };
}

function assignAlbumScreenVisuals(screens, visuals, mediaPool) {
  const assignments = screens.map((screen, index) => {
    const visual = visuals[index] || null;
    if (!visual) {
      if (screen.mediaResource?.key === "standby") {
        return { visual, resource: screen.mediaResource };
      }
      const texture = createVisualTitleTexture({
        title: "Place a record",
        kindLabel: "ECHO SURFACE STANDBY",
      });
      return {
        visual,
        resource: { key: "standby", texture, dispose: () => texture.dispose() },
      };
    }
    const key = screenMediaSourceIdentity(visual).key;
    if (screen.mediaResource?.key === key) {
      return { visual, resource: screen.mediaResource };
    }
    return { visual, resource: mediaPool.acquire(visual) };
  });

  screens.forEach((screen, index) => {
    const assignment = assignments[index];
    const previous = screen.mediaResource;
    if (previous !== assignment.resource) mediaPool.release(previous);
    screen.visual = assignment.visual;
    screen.mediaResource = assignment.resource;
    screen.hitTarget.userData.visual = assignment.visual;
    screen.root.userData.visual = assignment.visual;
    assignMaterialTexture(screen.screenMaterial, assignment.resource.texture);
  });
  mediaPool.trim();
}

function updateMediaResourcePlayback(resource, visual, { playback, elapsed, reducedMotion }) {
  resource?.updateFrame?.(playback.currentTime, {
    playing: playback.playing,
    reducedMotion,
  });
  resource?.releaseSupersededTextures?.();
  if (resource?.video && visual && resource.mediaState !== "failed") {
    const video = resource.video;
    const plan = echoRecordVideoPlaybackPlan({
      clockSeconds: playback.currentTime,
      startSeconds: visual.startSeconds,
      durationSeconds: visual.durationSeconds || video.duration,
      sourceStartSeconds: visual.sourceStartSeconds,
      sourceEndSeconds: visual.sourceEndSeconds,
      playbackMode: visual.playbackMode,
      timeMapping: visual.timeMapping,
      holdLastFrame: visual.holdLastFrame,
      clockLocked: visual.clockLocked !== false,
      playbackPlaying: playback.playing,
      documentHidden: document.hidden,
      reducedMotion,
      videoCurrentTime: video.currentTime,
      videoDuration: video.duration,
      readyState: video.readyState,
    });
    resource.expectedMediaTime = plan.expectedSeconds;
    if (
      plan.shouldSeek
      && video.readyState >= 1
      && elapsed - resource.lastHardSeekAt >= MEDIA_HARD_SEEK_COOLDOWN_SECONDS
    ) {
      try {
        video.currentTime = plan.seekSeconds;
        resource.lastHardSeekAt = elapsed;
        resource.diagnostics.mediaHardSeeks += 1;
      } catch {}
    }
    if (
      !video.requestVideoFrameCallback
      && video.readyState >= 2
      && (
        !resource.hasPresentedFrame
        || Math.abs((Number(video.currentTime) || 0) - resource.lastPresentedVideoTime) > 0.001
      )
    ) {
      resource.presentVideoFrame?.();
    }
    video.playbackRate = plan.playbackRate;
    setScreenVideoPlaying(resource, plan.shouldPlay);
  }
}

function updateAlbumScreen(screen, { playback, elapsed, reducedMotion, focus }) {
  const resource = screen.mediaResource;
  const visual = screen.visual;
  updateMediaResourcePlayback(resource, visual, { playback, elapsed, reducedMotion });
  if (resource?.texture) assignMaterialTexture(screen.screenMaterial, resource.texture);
  screen.glow.material.color.setHex(focus ? 0x72d9cf : 0xf0c98b);
  screen.glow.material.opacity = focus
    ? 0.11 + (reducedMotion ? 0 : Math.sin(elapsed * 1.2) * 0.025)
    : 0.065;
}

function createGeneratedDirectorVisualizerResource(visual, { diagnostics, fallbackTexture }) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  let disposed = false;
  let lastFrame = -1;

  const updateFrame = (clockSeconds = 0, { reducedMotion = false } = {}) => {
    if (disposed || !context) return;
    const frame = reducedMotion ? 0 : Math.floor(Math.max(0, Number(clockSeconds) || 0) * 30);
    if (frame === lastFrame) return;
    lastFrame = frame;
    const time = reducedMotion ? 0 : frame / 30;
    const width = canvas.width;
    const height = canvas.height;
    const hue = (190 + time * 17) % 360;
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 72% 10%)`);
    gradient.addColorStop(0.5, `hsl(${(hue + 42) % 360} 78% 19%)`);
    gradient.addColorStop(1, `hsl(${(hue + 105) % 360} 75% 8%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.globalAlpha = 0.2;
    context.strokeStyle = "#8fffe8";
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 48) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 48) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.globalAlpha = 1;

    for (let band = 0; band < 3; band += 1) {
      const centerY = height * (0.38 + band * 0.16);
      context.beginPath();
      for (let x = 0; x <= width; x += 5) {
        const normalized = x / width;
        const amplitude = 24 + band * 9;
        const y = centerY
          + Math.sin(normalized * Math.PI * (8 + band * 2) + time * (2.2 + band * 0.4)) * amplitude
          + Math.sin(normalized * Math.PI * 22 - time * 1.3) * 8;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = band === 0 ? "#69ffe1" : band === 1 ? "#f7d777" : "#cb8bff";
      context.lineWidth = 4 - band * 0.6;
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = 16;
      context.stroke();
    }
    context.shadowBlur = 0;
    context.fillStyle = "rgba(6, 12, 18, 0.72)";
    context.fillRect(36, 30, 465, 76);
    context.fillStyle = "#7dffe6";
    context.font = "700 21px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText("DIRECTOR VISUALIZER", 58, 60);
    context.fillStyle = "#f7f1db";
    context.font = "600 25px system-ui, sans-serif";
    context.fillText(String(visual.title || "Visualizer Only").slice(0, 34), 58, 91);
    texture.needsUpdate = true;
  };
  updateFrame(visual.startSeconds || 0);
  return {
    key: screenMediaSourceIdentity(visual).key,
    texture,
    diagnostics,
    mediaState: "ready",
    generatedVisualizer: true,
    hasPresentedFrame: true,
    firstFramePromise: Promise.resolve({ status: "generated-visualizer" }),
    updateFrame,
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      fallbackTexture?.dispose?.();
    },
  };
}

function createScreenMediaResource(visual, {
  apiBase,
  renderer,
  diagnostics = recordGardenDiagnostics(),
  fallbackTexture,
  onMediaError,
}) {
  const identity = screenMediaSourceIdentity(visual);
  const { videoUri, imageUri } = identity;
  if (identity.canvasKey && visual.canvas) {
    const texture = new THREE.CanvasTexture(visual.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    let disposed = false;
    return {
      key: identity.key,
      texture,
      diagnostics,
      mediaState: "ready",
      hasPresentedFrame: true,
      canvasBacked: true,
      firstFramePromise: Promise.resolve({ status: "director-composite-canvas" }),
      updateFrame() {
        if (!disposed) texture.needsUpdate = true;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        texture.dispose();
        fallbackTexture?.dispose?.();
      },
    };
  }
  if (visual.kind === "generated-visualizer") {
    return createGeneratedDirectorVisualizerResource(visual, {
      diagnostics,
      fallbackTexture,
    });
  }
  if (videoUri) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.loop = visual.clockLocked === false;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = resolveGardenMediaUri(videoUri, apiBase);
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;
    let posterImage = null;
    let posterTexture = null;
    let fallbackTextureOwned = true;
    let resolveFirstFrame;
    let firstFrameSettled = false;
    const firstFramePromise = new Promise((resolve) => {
      resolveFirstFrame = resolve;
    });
    const settleFirstFrame = (status) => {
      if (firstFrameSettled) return;
      firstFrameSettled = true;
      resolveFirstFrame?.({ status });
    };
    const disposeFallbackTexture = () => {
      if (!fallbackTextureOwned) return;
      fallbackTextureOwned = false;
      fallbackTexture.dispose();
    };
    const disposePosterTexture = () => {
      posterTexture?.dispose?.();
      posterTexture = null;
      if (!posterImage) return;
      posterImage.onload = null;
      posterImage.onerror = null;
      posterImage.removeAttribute("src");
      posterImage = null;
    };
    const resource = {
      key: identity.key,
      texture: fallbackTexture,
      video,
      videoTexture,
      diagnostics,
      mediaState: "loading",
      hasPresentedFrame: false,
      lastPresentedVideoTime: Number.NaN,
      expectedMediaTime: Math.max(0, Number(visual.sourceStartSeconds) || 0),
      desiredPlaying: false,
      playPending: null,
      nextPlayAttemptAt: 0,
      lastHardSeekAt: Number.NEGATIVE_INFINITY,
      frameCallback: 0,
      disposed: false,
      firstFramePromise,
      presentVideoFrame: (metadata) => presentVideoFrame(metadata),
      releaseSupersededTextures() {
        if (resource.texture === posterTexture && posterTexture) {
          disposeFallbackTexture();
        }
        if (resource.hasPresentedFrame && resource.texture === videoTexture) {
          disposePosterTexture();
          disposeFallbackTexture();
        }
      },
      dispose() {
        if (resource.disposed) return;
        resource.disposed = true;
        resource.mediaState = "disposed";
        resource.desiredPlaying = false;
        video.removeEventListener("loadedmetadata", handleMetadata);
        video.removeEventListener("loadeddata", handleLoadedData);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("playing", handlePlaying);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("stalled", handleWaiting);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
        if (resource.frameCallback && video.cancelVideoFrameCallback) {
          video.cancelVideoFrameCallback(resource.frameCallback);
        }
        disposePosterTexture();
        video.pause();
        video.removeAttribute("src");
        video.load();
        settleFirstFrame("disposed");
        videoTexture.dispose();
        disposeFallbackTexture();
      },
    };
    const presentVideoFrame = (metadata = null) => {
      if (resource.disposed || video.readyState < 2 || video.seeking) return false;
      const mediaTime = Math.max(0, Number(metadata?.mediaTime ?? video.currentTime) || 0);
      const expected = Math.max(0, Number(resource.expectedMediaTime) || 0);
      if (
        visual.clockLocked !== false
        && Math.abs(mediaTime - expected) > 0.12
      ) return false;
      resource.hasPresentedFrame = true;
      resource.lastPresentedVideoTime = mediaTime;
      resource.mediaState = video.readyState >= 3 ? "ready" : "buffering";
      resource.texture = videoTexture;
      videoTexture.needsUpdate = true;
      settleFirstFrame("presented");
      return true;
    };
    const scheduleFrame = () => {
      if (resource.disposed || !video.requestVideoFrameCallback || resource.frameCallback) return;
      resource.frameCallback = video.requestVideoFrameCallback((_now, metadata) => {
        resource.frameCallback = 0;
        if (resource.disposed) return;
        presentVideoFrame(metadata);
        scheduleFrame();
      });
    };
    const prepareFirstFrame = () => {
      if (resource.disposed || video.readyState < 2) return;
      if (!resource.hasPresentedFrame) resource.mediaState = "first-frame-pending";
      presentVideoFrame({ mediaTime: video.currentTime });
      if (video.requestVideoFrameCallback) scheduleFrame();
    };
    const handleMetadata = () => {
      const sourceStart = Math.max(0, Number(visual.sourceStartSeconds) || 0);
      const declaredEnd = Math.max(0, Number(visual.sourceEndSeconds) || 0);
      const holdEnd = declaredEnd > sourceStart
        ? declaredEnd
        : sourceStart + Math.max(0.1, Number(visual.durationSeconds) || 0.1);
      const initialTarget = visual.holdLastFrame
        ? Math.max(sourceStart, holdEnd - 0.04)
        : sourceStart;
      resource.expectedMediaTime = initialTarget;
      if (Math.abs((Number(video.currentTime) || 0) - initialTarget) > 0.04) {
        try { video.currentTime = initialTarget; } catch {}
      }
    };
    const handleLoadedData = () => {
      if (resource.disposed) return;
      prepareFirstFrame();
    };
    const handleCanPlay = () => prepareFirstFrame();
    const handlePlaying = () => {
      prepareFirstFrame();
      scheduleFrame();
    };
    const handleSeeked = () => prepareFirstFrame();
    const handleWaiting = () => {
      if (resource.disposed || resource.mediaState === "failed") return;
      if (resource.hasPresentedFrame && resource.mediaState !== "buffering") {
        diagnostics.mediaBufferingTransitions += 1;
        const acceptanceRun = activeAcceptanceRun();
        if (acceptanceRun) {
          acceptanceRun.bufferingTransitions = Number(acceptanceRun.bufferingTransitions || 0) + 1;
        }
      }
      resource.mediaState = resource.hasPresentedFrame ? "buffering" : "first-frame-pending";
    };
    const handleError = () => {
      if (resource.disposed || resource.mediaState === "failed") return;
      resource.mediaState = "failed";
      resource.desiredPlaying = false;
      if (!video.paused) video.pause();
      resource.texture = resource.hasPresentedFrame
        ? videoTexture
        : posterTexture || fallbackTexture;
      settleFirstFrame("failed");
      diagnostics.lastError = `Media unavailable: ${visual.title || "album visual"}`;
      onMediaError?.(visual);
    };
    if (imageUri) {
      posterImage = document.createElement("img");
      posterImage.crossOrigin = "anonymous";
      posterImage.decoding = "async";
      posterImage.onload = () => {
        if (resource.disposed) return;
        posterTexture?.dispose?.();
        posterTexture = new THREE.Texture(posterImage);
        posterTexture.colorSpace = THREE.SRGBColorSpace;
        posterTexture.minFilter = THREE.LinearFilter;
        posterTexture.magFilter = THREE.LinearFilter;
        posterTexture.generateMipmaps = false;
        posterTexture.needsUpdate = true;
        if (resource.hasPresentedFrame) return;
        const sourceStart = Math.max(0, Number(visual.sourceStartSeconds) || 0);
        if (
          visual.holdLastFrame
          || Math.abs((Number(resource.expectedMediaTime) || 0) - sourceStart) > 0.12
        ) return;
        resource.texture = posterTexture;
      };
      posterImage.onerror = () => {};
      posterImage.src = resolveGardenMediaUri(imageUri, apiBase);
    }
    video.addEventListener("loadedmetadata", handleMetadata);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    video.load();
    return resource;
  }
  if (imageUri) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let loadedTexture = null;
    let disposed = false;
    let fallbackTextureOwned = true;
    let resolveFirstFrame;
    const firstFramePromise = new Promise((resolve) => {
      resolveFirstFrame = resolve;
    });
    const resource = {
      key: identity.key,
      texture: fallbackTexture,
      mediaState: "loading",
      firstFramePromise,
      releaseSupersededTextures() {
        if (fallbackTextureOwned && resource.texture === loadedTexture && loadedTexture) {
          fallbackTextureOwned = false;
          fallbackTexture.dispose();
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        resolveFirstFrame?.({ status: "disposed" });
        loadedTexture?.dispose?.();
        if (fallbackTextureOwned) {
          fallbackTextureOwned = false;
          fallbackTexture.dispose();
        }
      },
    };
    loadedTexture = loader.load(
      resolveGardenMediaUri(imageUri, apiBase),
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        loadedTexture = loaded;
        resource.texture = loaded;
        resource.mediaState = "ready";
        resolveFirstFrame?.({ status: "image" });
      },
      undefined,
      () => {
        resource.mediaState = "failed";
        diagnostics.lastError = `Media unavailable: ${visual.title || "album visual"}`;
        onMediaError?.(visual);
        resolveFirstFrame?.({ status: "failed" });
      },
    );
    return resource;
  }
  return {
    key: identity.key,
    texture: fallbackTexture,
    mediaState: "fallback",
    firstFramePromise: Promise.resolve({ status: "fallback" }),
    dispose: () => fallbackTexture.dispose(),
  };
}

function disposeScreenMediaResource(resource) {
  resource?.dispose?.();
}

function disposeAlbumScreen(screen) {
  disposeScreenMediaResource(screen.mediaResource);
  screen.root.traverse((object) => {
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  });
}

function createRecordEntry(record) {
  const theme = recordTheme(record);
  const root = new THREE.Group();
  root.name = `EchoRecord:${record.songId}`;
  const labelTexture = createRecordLabelTexture(record);
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x111217,
    roughness: 0.34,
    metalness: 0.35,
    emissive: new THREE.Color(theme.accent),
    emissiveIntensity: 0.18,
  });
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: labelTexture,
    color: 0xffffff,
    roughness: 0.52,
    metalness: 0.08,
  });
  const backMaterial = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.55 });
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.055, 64),
    [edgeMaterial, faceMaterial, backMaterial],
  );
  disc.castShadow = true;
  disc.receiveShadow = true;
  root.add(disc);

  const groove = new THREE.Mesh(
    new THREE.TorusGeometry(0.47, 0.008, 6, 64),
    new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.38 }),
  );
  groove.rotation.x = Math.PI / 2;
  groove.position.y = 0.034;
  root.add(groove);

  const titleMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthWrite: false,
  });
  const titleLabel = new THREE.Mesh(new THREE.CircleGeometry(0.255, 48), titleMaterial);
  titleLabel.rotation.x = -Math.PI / 2;
  titleLabel.position.y = 0.064;
  titleLabel.renderOrder = 4;
  root.add(titleLabel);

  const center = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.075, 16),
    new THREE.MeshStandardMaterial({ color: 0xf6e6bd, metalness: 0.72, roughness: 0.24 }),
  );
  center.position.y = 0.055;
  root.add(center);

  return {
    record,
    root,
    disc,
    faceMaterial,
    edgeMaterial,
    backMaterial,
    groove,
    center,
    titleLabel,
    titleMaterial,
    home: new THREE.Vector3(),
    homeRotation: new THREE.Vector3(),
    dragStart: new THREE.Vector3(),
    manipulated: false,
    cameraFacing: false,
    hovered: false,
    selected: false,
    placed: false,
    labelTexture,
    coverTexture: null,
    mediaResource: null,
    textureUri: "",
    disposed: false,
  };
}

function disposeRecordEntry(entry) {
  if (entry.disposed) return;
  entry.disposed = true;
  entry.textureUri = "";
  entry.labelTexture?.dispose?.();
  entry.coverTexture?.dispose?.();
  if (entry.mediaResource?.poolManaged) entry.mediaPool?.release?.(entry.mediaResource);
  else disposeScreenMediaResource(entry.mediaResource);
  entry.root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
}

function createPrintedCardEntry(card, mediaPool = null) {
  const root = new THREE.Group();
  root.name = `EchoPrintedCard:${card.id}`;
  const texture = createPrintedCardTexture(card);
  const overlayTexture = createPrintedCardOverlayTexture(card);
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x10252a,
    roughness: 0.34,
    metalness: 0.22,
    emissive: new THREE.Color(0x56f0cf),
    emissiveIntensity: 0.12,
  });
  const cardMesh = new THREE.Mesh(
    createEchoGardenRoundedBoxGeometry(1.04, 0.06, 1.48, 0.055, 4),
    edgeMaterial,
  );
  cardMesh.castShadow = true;
  cardMesh.receiveShadow = true;
  root.add(cardMesh);
  const halo = new THREE.Mesh(
    createEchoGardenRoundedBoxGeometry(1.11, 0.018, 1.55, 0.065, 4),
    new THREE.MeshBasicMaterial({ color: 0x56f0cf, transparent: true, opacity: 0.16 }),
  );
  halo.position.y = -0.05;
  root.add(halo);
  const presentation = card?.echoRecordAttachment?.presentation || null;
  const mediaResource = presentation && mediaPool ? mediaPool.tryAcquire(presentation) : null;
  const videoMaterial = new THREE.MeshBasicMaterial({
    map: mediaResource?.texture || texture,
    color: 0xffffff,
    toneMapped: false,
  });
  const videoFace = new THREE.Mesh(new THREE.PlaneGeometry(0.99, 1.43), videoMaterial);
  videoFace.rotation.x = -Math.PI / 2;
  videoFace.position.set(0, 0.036, 0);
  videoFace.renderOrder = 3;
  root.add(videoFace);
  const overlayMaterial = new THREE.MeshBasicMaterial({
    map: overlayTexture,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const overlayFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.44), overlayMaterial);
  overlayFace.rotation.x = -Math.PI / 2;
  overlayFace.position.set(0, 0.039, 0);
  overlayFace.renderOrder = 4;
  root.add(overlayFace);
  root.userData.printedCardId = card.id;
  root.traverse((object) => { object.userData.printedCardId = card.id; });
  const entry = {
    card,
    root,
    cardMesh,
    texture,
    overlayTexture,
    overlayFace,
    overlayMaterial,
    videoFace,
    videoMaterial,
    mediaResource,
    mediaPool,
    presentation,
    home: root.position.clone(),
    dragStart: new THREE.Vector3(),
    videoUvKey: "",
  };
  applyPrintedCardMediaCover(entry, mediaResource?.texture || texture);
  return entry;
}

function disposePrintedCardEntry(entry) {
  if (entry.mediaResource?.poolManaged) entry.mediaPool?.release?.(entry.mediaResource);
  else disposeScreenMediaResource(entry.mediaResource);
  entry.texture?.dispose?.();
  entry.overlayTexture?.dispose?.();
  entry.root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
}

function printedCardMediaDimensions(texture) {
  const image = texture?.image || texture?.source?.data || null;
  return {
    width: Math.max(0, Number(image?.videoWidth || image?.naturalWidth || image?.width) || 0),
    height: Math.max(0, Number(image?.videoHeight || image?.naturalHeight || image?.height) || 0),
  };
}

function applyPrintedCardMediaCover(entry, texture) {
  if (!entry?.videoFace?.geometry || !texture) return false;
  assignMaterialTexture(entry.videoMaterial, texture);
  const { width, height } = printedCardMediaDimensions(texture);
  const key = `${texture.uuid || "texture"}:${width}x${height}`;
  if (entry.videoUvKey === key) return false;
  entry.videoUvKey = key;
  const targetAspect = 0.99 / 1.43;
  const sourceAspect = width > 0 && height > 0 ? width / height : targetAspect;
  let uMinimum = 0;
  let uMaximum = 1;
  let vMinimum = 0;
  let vMaximum = 1;
  if (sourceAspect > targetAspect) {
    const visibleWidth = targetAspect / sourceAspect;
    uMinimum = (1 - visibleWidth) / 2;
    uMaximum = 1 - uMinimum;
  } else if (sourceAspect < targetAspect) {
    const visibleHeight = sourceAspect / targetAspect;
    vMinimum = (1 - visibleHeight) / 2;
    vMaximum = 1 - vMinimum;
  }
  const uv = entry.videoFace.geometry.getAttribute("uv");
  for (let index = 0; index < uv.count; index += 1) {
    const sourceU = uv.getX(index) >= 0.5 ? 1 : 0;
    const sourceV = uv.getY(index) >= 0.5 ? 1 : 0;
    uv.setXY(
      index,
      sourceU ? uMaximum : uMinimum,
      sourceV ? vMaximum : vMinimum,
    );
  }
  uv.needsUpdate = true;
  return true;
}

function createRecordLabelTexture(record = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const theme = recordTheme(record);
  const gradient = ctx.createRadialGradient(256, 220, 18, 256, 256, 256);
  gradient.addColorStop(0, theme.accent);
  gradient.addColorStop(0.42, theme.deep);
  gradient.addColorStop(1, "#0b0d11");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(255,255,255,.15)";
  ctx.lineWidth = 2;
  for (let radius = 80; radius < 250; radius += 13) {
    ctx.beginPath();
    ctx.arc(256, 256, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(4,9,13,.78)";
  ctx.beginPath();
  ctx.arc(256, 256, 156, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(256, 256, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f8f3e7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 27px system-ui";
  wrapCanvasText(ctx, record.title || "Echo State", 256, 225, 250, 34, 3);
  ctx.fillStyle = "#f6c96d";
  ctx.font = "700 16px ui-monospace, monospace";
  ctx.fillText(String(recordAvatarName(record) || theme.label || "ECHO STATE").toUpperCase(), 256, 315);
  ctx.fillStyle = "#0b0d11";
  ctx.beginPath();
  ctx.arc(256, 256, 20, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawRecordTitleLabel(context, record = {}, {
  x = 0,
  y = 0,
  size = 512,
} = {}) {
  const theme = recordTheme(record);
  context.save();
  context.translate(x, y);
  context.scale(size / 512, size / 512);
  context.fillStyle = "rgba(4,9,13,.88)";
  context.beginPath();
  context.arc(256, 256, 246, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = theme.accent;
  context.lineWidth = 15;
  context.beginPath();
  context.arc(256, 256, 232, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#f8f3e7";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "800 40px system-ui";
  wrapCanvasText(context, record.title || "Echo State", 256, 190, 360, 50, 3);
  context.fillStyle = "#f6c96d";
  context.font = "700 24px ui-monospace, monospace";
  context.fillText(String(recordAvatarName(record) || "ECHO STATE").toUpperCase(), 256, 340);
  context.fillStyle = "#05070a";
  context.beginPath();
  context.arc(256, 256, 34, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function createRecordTitleAtlas(records = [], { maxTextureSize = 4096 } = {}) {
  const source = records.filter((record) => record?.songId);
  const columns = Math.max(1, Math.ceil(Math.sqrt(source.length || 1)));
  const rows = Math.max(1, Math.ceil(source.length / columns));
  const textureLimit = Math.max(512, Math.floor(Number(maxTextureSize) || 4096));
  const cellSize = Math.max(96, Math.min(256, Math.floor(textureLimit / Math.max(columns, rows))));
  const canvas = document.createElement("canvas");
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const slots = new Map();
  source.forEach((record, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawRecordTitleLabel(context, record, {
      x: column * cellSize,
      y: row * cellSize,
      size: cellSize,
    });
    slots.set(record.songId, { column, row, columns, rows });
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { texture, slots, columns, rows, cellSize };
}

function applyRecordTitleAtlasUv(geometry, {
  column = 0,
  row = 0,
  columns = 1,
  rows = 1,
} = {}) {
  const uv = geometry?.getAttribute?.("uv");
  if (!uv) return false;
  const baseUv = geometry.userData.recordTitleBaseUv
    || Float32Array.from(uv.array);
  geometry.userData.recordTitleBaseUv = baseUv;
  for (let index = 0; index < uv.count; index += 1) {
    const sourceU = baseUv[index * 2];
    const sourceV = baseUv[index * 2 + 1];
    uv.setXY(
      index,
      (column + sourceU) / Math.max(1, columns),
      (rows - row - 1 + sourceV) / Math.max(1, rows),
    );
  }
  uv.needsUpdate = true;
  return true;
}

function createVisualTitleTexture(visual = {}, { round = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#143b3f");
  gradient.addColorStop(0.5, "#765b45");
  gradient.addColorStop(1, "#1f4153");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(4,12,17,.62)";
  ctx.fillRect(34, 34, canvas.width - 68, canvas.height - 68);
  ctx.strokeStyle = "rgba(246,201,109,.7)";
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
  ctx.fillStyle = "#56f0cf";
  ctx.font = "700 22px ui-monospace, monospace";
  ctx.fillText(String(visual.kindLabel || visual.kind || "ECHO VISUAL").toUpperCase(), 72, 98);
  ctx.fillStyle = "#f8f3e7";
  ctx.font = "800 42px system-ui";
  wrapCanvasText(ctx, visual.title || "Echo State surface", 72, 182, 810, 52, 4, "left");
  ctx.fillStyle = "#f6c96d";
  ctx.font = "600 20px ui-monospace, monospace";
  ctx.fillText(String(visual.truthLabel || "SOURCE-LINKED · CLICK TO PRINT CARD").toUpperCase(), 72, 470);
  if (round) {
    const circleCanvas = document.createElement("canvas");
    circleCanvas.width = 512;
    circleCanvas.height = 512;
    const circleCtx = circleCanvas.getContext("2d");
    circleCtx.beginPath();
    circleCtx.arc(256, 256, 250, 0, Math.PI * 2);
    circleCtx.clip();
    circleCtx.drawImage(canvas, 0, 0, 512, 512);
    const circleTexture = new THREE.CanvasTexture(circleCanvas);
    circleTexture.colorSpace = THREE.SRGBColorSpace;
    return circleTexture;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPrintedCardTexture(card = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 880;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 640, 880);
  gradient.addColorStop(0, "#112f36");
  gradient.addColorStop(0.55, "#49382d");
  gradient.addColorStop(1, "#06151e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 880);
  ctx.strokeStyle = "#56f0cf";
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, 580, 820);
  ctx.strokeStyle = "#f6c96d";
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, 544, 784);
  ctx.fillStyle = "#56f0cf";
  ctx.font = "700 21px ui-monospace, monospace";
  ctx.fillText("ECHO RECORD GARDEN // HAPA CARD", 74, 96);
  ctx.fillStyle = "#f8f3e7";
  ctx.font = "800 43px system-ui";
  wrapCanvasText(ctx, card.title || "Attached Visual Card", 74, 176, 492, 52, 5, "left");
  ctx.fillStyle = "rgba(248,243,231,.74)";
  ctx.font = "500 24px system-ui";
  wrapCanvasText(ctx, card.summary || card.meaning || "A Card generated from a source-linked visual on the 3D record table.", 74, 455, 492, 34, 7, "left");
  ctx.fillStyle = "#f6c96d";
  ctx.font = "700 19px ui-monospace, monospace";
  ctx.fillText(
    card.echoRecordAttachment?.truthStatus === "local-unminted-projection"
      ? "LOCAL PROJECTION · UNMINTED"
      : "SOURCE CARD · ATTACHED",
    74,
    784,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function printedCardCustodyLabel(card = {}) {
  if (card?.custody?.durableReceipt === true || card?.truthStatus === "durable-local-card") {
    return "DURABLE LOCAL HAPA CARD";
  }
  if (card?.echoRecordAttachment?.truthStatus === "local-unminted-projection") {
    return "LOCAL PROJECTION · NOT PUBLICLY MINTED";
  }
  return "SOURCE-LINKED HAPA CARD";
}

function createPrintedCardOverlayTexture(card = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 920;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  const topShade = context.createLinearGradient(0, 0, 0, 240);
  topShade.addColorStop(0, "rgba(3,12,16,.9)");
  topShade.addColorStop(0.7, "rgba(3,12,16,.48)");
  topShade.addColorStop(1, "rgba(3,12,16,0)");
  context.fillStyle = topShade;
  context.fillRect(0, 0, canvas.width, 260);

  const bottomShade = context.createLinearGradient(0, 650, 0, 920);
  bottomShade.addColorStop(0, "rgba(3,12,16,0)");
  bottomShade.addColorStop(0.42, "rgba(3,12,16,.68)");
  bottomShade.addColorStop(1, "rgba(3,12,16,.94)");
  context.fillStyle = bottomShade;
  context.fillRect(0, 620, canvas.width, 300);

  context.strokeStyle = "rgba(86,240,207,.95)";
  context.lineWidth = 9;
  context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  context.strokeStyle = "rgba(246,201,109,.82)";
  context.lineWidth = 2;
  context.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);

  context.fillStyle = "#56f0cf";
  context.font = "700 18px ui-monospace, monospace";
  context.fillText("ECHO RECORD GARDEN // HAPA CARD", 58, 76);
  context.fillStyle = "#f8f3e7";
  context.font = "800 39px system-ui";
  wrapCanvasText(context, card.title || "Attached Visual Card", 58, 126, 524, 45, 3, "left");

  context.fillStyle = "#f6c96d";
  context.font = "700 17px ui-monospace, monospace";
  context.fillText(printedCardCustodyLabel(card), 58, 830);
  context.fillStyle = "rgba(248,243,231,.82)";
  context.font = "600 17px system-ui";
  context.fillText("Looping source media · hover + drag · scroll to orient", 58, 865);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4, align = "center") {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const usedWords = lines.join(" ").split(/\s+/).length;
  if (usedWords < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 3 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  const previousAlign = ctx.textAlign;
  ctx.textAlign = align;
  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  ctx.textAlign = previousAlign;
}
