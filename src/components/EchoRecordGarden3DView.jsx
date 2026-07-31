import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Disc3,
  Hand,
  Layers3,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createEchoRecordVisualCardResolver } from "../domain/echo-record-card-resolution.js";
import {
  ECHO_RECORD_DISPLAY_RPM,
  ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA,
  buildEchoRecordDirectorWarmSurfaces,
  buildEchoRecordVisualSurfaces,
  echoRecordPerspectiveToken,
  echoRecordVideoPlaybackPlan,
  echoRecordVinylSpinRadians,
  normalizeEchoRecordGardenSnapshot,
  normalizeEchoRecordSummaryRows,
  projectEchoRecordSelectedDirectorCut,
  reconcileEchoRecordGardenSnapshot,
  resolveEchoRecordGardenTableDrop,
  resolveEchoRecordMediaUri,
  selectEchoRecordMediaWindow,
  unwrapEchoDirectorProject,
} from "../domain/echo-record-garden.js";
import { localFileApiUri } from "../domain/local-media-uri.js";

const RECORDS_PER_CRATE = 6;
const SCREEN_COUNT = 3;
const SCREEN_MEDIA_POOL_LIMIT = SCREEN_COUNT * 2;
const MEDIA_HARD_SEEK_COOLDOWN_SECONDS = 0.8;
const RECORD_GARDEN_STORAGE_KEY = "hapa.echo-record-garden.v1";
const RECORD_GARDEN_DIAGNOSTICS_KEY = "__HAPA_ECHO_RECORD_GARDEN_DIAGNOSTICS__";

function recordGardenDiagnostics() {
  const existing = globalThis[RECORD_GARDEN_DIAGNOSTICS_KEY];
  if (existing && typeof existing === "object") return existing;
  const diagnostics = {
    schemaVersion: "hapa.echo-record-garden.diagnostics.v1",
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
    waitingVideos: 0,
    mediaPoolSize: 0,
    mediaPlayRequests: 0,
    mediaHardSeeks: 0,
    mediaBufferingTransitions: 0,
    contextState: "uninitialized",
    visibilityState: globalThis.document?.visibilityState || "visible",
    rendererMemory: { geometries: 0, textures: 0 },
    lastError: "",
  };
  globalThis[RECORD_GARDEN_DIAGNOSTICS_KEY] = diagnostics;
  return diagnostics;
}

function browserApiBase(apiBase = "") {
  return String(apiBase || "").replace(/\/+$/, "");
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

function compactTime(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
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

function abortError(message = "Audio validation cancelled") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function validateRecordAudioSource(audioUri, { signal, timeoutMs = 8_000 } = {}) {
  if (!audioUri) return Promise.reject(new Error("This record has no routable audio source"));
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const probe = document.createElement("audio");
    let settled = false;
    let timeout = 0;

    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      probe.removeEventListener("loadedmetadata", handleReady);
      probe.removeEventListener("error", handleError);
      probe.removeEventListener("abort", handleError);
      probe.pause();
      probe.removeAttribute("src");
      probe.load();
    };
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      const duration = Math.max(0, Number(probe.duration) || 0);
      cleanup();
      if (error) reject(error);
      else resolve({ duration });
    };
    const handleReady = () => finish();
    const handleError = () => finish(new Error("This record's audio source could not be decoded"));
    const handleAbort = () => finish(abortError());

    probe.preload = "metadata";
    probe.muted = true;
    probe.playsInline = true;
    probe.addEventListener("loadedmetadata", handleReady, { once: true });
    probe.addEventListener("error", handleError, { once: true });
    probe.addEventListener("abort", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
    timeout = globalThis.setTimeout(
      () => finish(new Error("Audio validation timed out before the record could be placed")),
      Math.max(1_000, Number(timeoutMs) || 8_000),
    );
    probe.src = audioUri;
    probe.load();
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

export default function EchoRecordGarden3DView({
  apiBase = "",
  avatars = [],
  sceneGraph = null,
  selectedSongId = "",
  onSelectSong,
}) {
  const preferences = useMemo(readGardenPreferences, []);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const visualInspectorRef = useRef(null);
  const gameRef = useRef(null);
  const projectCacheRef = useRef(new Map());
  const requestRef = useRef(0);
  const requestControllerRef = useRef(null);
  const placementControllerRef = useRef(null);
  const persistenceTimerRef = useRef(0);
  const pendingPreferenceRef = useRef(null);
  const cardRequestGenerationRef = useRef(0);
  const cardResolutionRef = useRef(null);
  const pendingCardRevealRef = useRef(false);
  const actionsRef = useRef({});
  const crateButtonRefs = useRef(new Map());
  const initialSongIdRef = useRef(selectedSongId);
  const crateOrderRef = useRef(preferences.crateOrder);
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
  const [cratePage, setCratePage] = useState(preferences.cratePage);
  const [selectedRecordId, setSelectedRecordId] = useState(selectedSongId || preferences.selectedSongId);
  const [placedRecordId, setPlacedRecordId] = useState(preferences.placedSongId);
  const [activeProjectPacket, setActiveProjectPacket] = useState(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [projectLoadError, setProjectLoadError] = useState("");
  const [visuals, setVisuals] = useState([]);
  const [visualsSongId, setVisualsSongId] = useState("");
  const [surfacePage, setSurfacePage] = useState(preferences.surfacePage);
  const [selectedVisualId, setSelectedVisualId] = useState(preferences.selectedVisualId);
  const [recordTransforms, setRecordTransforms] = useState(preferences.recordTransforms);
  const [printedCards, setPrintedCards] = useState([]);
  const [cardResolution, setCardResolution] = useState(() => initialCardResolution(preferences.cardJob));
  const [playback, setPlayback] = useState(() => initialPlaybackState(preferences.playbackSeconds));
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
  const [reducedMotion, setReducedMotion] = useState(() => (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  ));
  const resolveVisualCard = useMemo(
    () => createEchoRecordVisualCardResolver({ apiBase }),
    [apiBase],
  );
  cardResolutionRef.current = cardResolution;
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
  const recordBySongId = useMemo(
    () => new Map(records.map((record) => [record.songId, record])),
    [records],
  );
  const filteredRecords = useMemo(
    () => records.filter((record) => recordMatchesQuery(record, query, perspective)),
    [perspective, query, records],
  );
  const cratePageCount = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PER_CRATE));
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
        clockSeconds: playback.currentTime,
        count: SCREEN_COUNT * 2,
        apiBase,
      }).map(toGardenVisual)
      : []
  ), [apiBase, playback.currentTime, project]);
  const warmVisuals = useMemo(
    () => selectGardenWarmVisuals(visibleVisuals, directorWarmVisuals, mediaWindow.warm),
    [directorWarmVisuals, mediaWindow.warm, visibleVisuals],
  );
  const selectedVisual = useMemo(
    () => visibleVisuals.find((visual) => visual.id === selectedVisualId) || visibleVisuals[0] || null,
    [selectedVisualId, visibleVisuals],
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
    diagnostics.selectedSongId = selectedRecordId || "";
    diagnostics.placedSongId = placedRecordId || "";
    diagnostics.audioTime = playback.currentTime;
    diagnostics.audioState = playback.playing ? "playing" : placedRecordId ? "paused" : "idle";
    diagnostics.visualSurfaceCount = visuals.length;
    diagnostics.lastError = sceneError || playback.error || "";
  }, [
    placedRecordId,
    playback.currentTime,
    playback.error,
    playback.playing,
    sceneError,
    selectedRecordId,
    visuals.length,
  ]);

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
      cratePage,
      crateOrder,
      selectedSongId: selectedRecordId,
      placedSongId: placedRecordId,
      selectedVisualId,
      surfacePage,
      surfaceSongId: activeProjectSongId,
      playbackSeconds: playback.currentTime,
      recordTransforms: savedRecordTransforms,
      camera: sceneSnapshot.camera || preferences.camera,
      cardJob: persistedCardJob(cardResolution),
    };
  }, [
    activeProjectSongId,
    cameraRevision,
    cardResolution,
    cratePage,
    muted,
    perspective,
    placedRecordId,
    playback.currentTime,
    preferences.camera,
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

  const loadRecordProject = useCallback(async (songId) => {
    if (!songId) return null;
    requestControllerRef.current?.abort();
    const requestId = ++requestRef.current;
    const latestCut = recordBySongId.get(songId)?.director?.latestCut || null;
    const cutRevision = latestCut?.fingerprint
      || latestCut?.updatedAt
      || latestCut?.createdAt
      || latestCut?.timelineCount
      || "unversioned";
    const cacheKey = `${songId}:${latestCut?.id || "base"}:${cutRevision}`;
    const cached = projectCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setNotice("Opening the sleeve and cueing its visual constellation…");
    const base = browserApiBase(apiBase);
    const projectQuery = new URLSearchParams({ songId });
    if (latestCut?.id) projectQuery.set("variantId", latestCut.id);
    const [projectResponse, referenceResponse] = await Promise.all([
      fetch(`${base}/api/echos/director-project?${projectQuery.toString()}`, {
        signal: controller.signal,
      }),
      fetch(`${base}/api/echos/references/tarot-cards?songId=${encodeURIComponent(songId)}`, {
        signal: controller.signal,
      }),
    ]);
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
    projectCacheRef.current.set(cacheKey, cachedPacket);
    if (requestRef.current !== requestId) return cachedPacket;
    return cachedPacket;
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
        if (projectSongIdentity(packet?.project) !== activeProjectSongId) {
          throw new Error("Director project identity did not match the active record");
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
  }, [activeProjectSongId, loadRecordProject, projectRevision]);

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
      clockSeconds: playback.currentTime,
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
    playback.currentTime,
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
    if (!audio || !audioUri || audio.getAttribute("src") === audioUri) return undefined;
    const restoredTime = Math.max(0, Number(playback.currentTime) || 0);
    const restoreTime = () => {
      const duration = Number(audio.duration) || projectDuration(project);
      audio.currentTime = duration > 0 ? Math.min(restoredTime, Math.max(0, duration - 0.05)) : restoredTime;
    };
    audio.pause();
    audio.src = audioUri;
    audio.muted = muted;
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
    placementControllerRef.current?.abort();
    const placementController = new AbortController();
    placementControllerRef.current = placementController;
    try {
      const packet = await loadRecordProject(songId);
      const nextProject = packet?.project;
      if (!nextProject) throw new Error("The Director project is empty");
      if (projectSongIdentity(nextProject) !== songId) {
        throw new Error("The Director project did not match the record selected for placement");
      }
      const audioUri = projectAudioUri(nextProject, apiBase);
      if (!audioUri) throw new Error("This record has no routable audio source");
      const validation = await validateRecordAudioSource(audioUri, {
        signal: placementController.signal,
      });
      if (placementController.signal.aborted) throw abortError();

      const audio = audioRef.current;
      if (!audio) throw new Error("The Record Garden audio player is unavailable");
      audio.pause();
      audio.src = audioUri;
      audio.currentTime = 0;
      audio.muted = muted;
      audio.load();

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
      gameRef.current?.setVisuals(immediateWindow.visible, {
        activeSongId: songId,
        warmVisuals: selectGardenWarmVisuals(
          immediateWindow.visible,
          immediateDirectorWarm,
          immediateWindow.warm,
        ),
      });
      setActiveProjectPacket(packet);
      setSelectedRecordId(songId);
      setPlacedRecordId(songId);
      setPlayback({
        ...initialPlaybackState(),
        duration: validation.duration || projectDuration(nextProject),
        ready: validation.duration > 0,
      });
      onSelectSong?.(songId);
      gameRef.current?.setPlacedRecord(songId);
      setNotice(`${nextProject.song_title || "Record"} is on the turntable.`);
      if (autoplay) {
        await audio.play().catch((error) => {
          setNotice(`Record placed; playback is waiting for permission: ${error?.message || "press Play again"}`);
        });
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      setNotice(`Player could not cue the record: ${error?.message || "unknown error"}`);
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
    sceneGraph,
    selectedRecordId,
  ]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!placedRecordId) {
      await placeRecord(selectedRecordId, { autoplay: true });
      return;
    }
    if (audio.paused) {
      await audio.play().catch((error) => {
        setNotice(`Playback is waiting for permission: ${error?.message || "press Play again"}`);
      });
    } else {
      audio.pause();
    }
  }, [placeRecord, placedRecordId, selectedRecordId]);

  const seekPlayback = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(Number(seconds) || 0, Number(audio.duration) || playback.duration || 0));
    setPlayback((current) => ({ ...current, currentTime: audio.currentTime }));
  }, [playback.duration]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (audioRef.current) audioRef.current.muted = next;
      setNotice(next ? "Record player muted." : "Record player sound on.");
      return next;
    });
  }, []);

  const ejectRecord = useCallback(() => {
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
  }, []);

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
    setSelectedVisualId(nextVisible[0]?.id || "");
    if (nextVisible[0]) {
      setNotice(`Showing ${surfaceKindLabel(nextVisible[0])} and nearby album surfaces.`);
    }
  }, [surfacePageCount, visuals]);

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
      const printed = resolution.card;
      const attached = {
        ...printed,
        echoRecordAttachment: {
          ...(printed.echoRecordAttachment || {}),
          sourceVisualId: visual.id,
          sourceSongId: visualSongId || activeSongId,
          atSeconds: resolution.timestampMs / 1000 || cardClockSeconds,
          surface: "echo-record-garden",
          truthStatus: resolution.truthStatus,
          resolutionSchema: resolution.schemaVersion,
          requestKey: resolution.requestKey,
          printReceipt: resolution.receipt || null,
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

  actionsRef.current = {
    generateCardForVisual,
    placeRecord,
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
        onSelectRecord: (songId) => actionsRef.current.selectRecord?.(songId, "Record selected. Drag it to the turntable or use Place on player."),
        onDropRecord: (songId) => void actionsRef.current.placeRecord?.(songId, { autoplay: true }),
        onSelectVisual: (visual) => void actionsRef.current.generateCardForVisual?.(visual),
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
    gameRef.current?.setRecords(crateRecords, {
      selectedRecordId,
      placedRecordId,
      recordTransforms,
      recordInventoryIds: records.map((record) => record.songId),
    });
  }, [crateRecords, placedRecordId, recordTransforms, records, selectedRecordId]);

  useEffect(() => {
    gameRef.current?.setVisuals(visibleVisuals, {
      activeSongId: placedRecordId || selectedRecordId,
      warmVisuals,
    });
  }, [placedRecordId, selectedRecordId, visibleVisuals, warmVisuals]);

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

  return (
    <section
      className="echo-record-garden tarot-draw-view"
      data-testid="echo-record-garden"
      data-ready={sceneReady ? "true" : "false"}
      data-playing={playback.playing ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-scene-error={sceneError ? "true" : "false"}
      data-player-error={sceneError || playback.error ? "true" : "false"}
      aria-label="Echo State Record Garden 3D album explorer"
    >
      <canvas
        ref={canvasRef}
        data-testid="echo-record-garden-canvas"
        aria-label="Interactive 3D outdoor record table"
      />
      <audio
        ref={audioRef}
        preload="metadata"
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
        onPlay={() => setPlayback((current) => ({ ...current, playing: true, error: "" }))}
        onPause={() => setPlayback((current) => ({ ...current, playing: false }))}
        onEnded={() => setPlayback((current) => ({ ...current, playing: false }))}
        onError={() => setPlayback((current) => ({
          ...current,
          playing: false,
          error: "Audio source could not be decoded.",
        }))}
      />

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
            <div className="echo-record-card-actions">
              <button
                className="hapa-btn echo-record-print-card"
                data-intent="primary"
                data-state={cardResolution.visualId === selectedVisual.id ? cardResolution.status : "idle"}
                data-testid="echo-record-generate-card"
                type="button"
                aria-busy={cardResolution.status === "resolving" && cardResolution.visualId === selectedVisual.id}
                disabled={["resolving", "blocked", "unavailable"].includes(cardResolution.status) && cardResolution.visualId === selectedVisual.id}
                onClick={() => void generateCardForVisual(selectedVisual)}
              >
                {cardResolution.status === "resolving" && cardResolution.visualId === selectedVisual.id
                  ? <Loader2 size={14} className="spin" />
                  : <Sparkles size={14} />}
                {cardResolution.status === "resolving" && cardResolution.visualId === selectedVisual.id
                  ? "Resolving attached Card"
                  : cardResolution.status === "blocked" && cardResolution.visualId === selectedVisual.id
                    ? "Card blocked by source policy"
                    : ["failed", "interrupted"].includes(cardResolution.status) && cardResolution.visualId === selectedVisual.id
                      ? cardResolution.status === "interrupted"
                        ? "Retry interrupted Hapa Card"
                        : "Retry attached Hapa Card"
                      : cardResolution.status === "unavailable" && cardResolution.visualId === selectedVisual.id
                        ? "Card source no longer available"
                      : "Generate attached Hapa Card"}
              </button>
              {cardResolution.status === "resolving" && cardResolution.visualId === selectedVisual.id && (
                <button
                  className="hapa-btn echo-record-cancel-card"
                  type="button"
                  onClick={() => cancelCardResolution(selectedVisual)}
                >
                  Cancel Card request
                </button>
              )}
            </div>
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
              <small>{card.echoRecordAttachment?.truthStatus === "local-unminted-projection" ? "LOCAL · UNMINTED" : "SOURCE CARD"}</small>
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
            disabled={!selectedRecord}
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
            className="hapa-btn echo-record-eject"
            type="button"
            onClick={ejectRecord}
            disabled={!placedRecord}
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
          <span className="echo-record-result-count" aria-live="polite">
            {filteredRecords.length} of {records.length}
          </span>
          <button
            type="button"
            className="echo-record-clear-filters"
            onClick={clearCrateFilters}
            disabled={!query && perspective === "all"}
          >
            Clear
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
                onClick={() => selectRecord(record.songId, `${record.title} selected.`)}
                onDoubleClick={() => void placeRecord(record.songId, { autoplay: true })}
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
            disabled={!selectedRecord}
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
  onCameraChange,
  onRecordTransform,
  onSelectRecord,
  onDropRecord,
  onSelectVisual,
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
  renderer.shadowMap.type = THREE.PCFShadowMap;
  diagnostics.createdGames += 1;
  diagnostics.liveGames += 1;
  diagnostics.liveRenderers += 1;
  diagnostics.contextState = "available";
  diagnostics.lastError = "";
  canvas.dataset.rendererState = "available";
  let activePowerProfileId = "";
  const applyPowerProfile = (reducedMotion = false) => {
    const profile = reducedMotion
      ? ECHO_RECORD_GARDEN_POWER_PROFILES.reduced
      : ECHO_RECORD_GARDEN_POWER_PROFILES.full;
    if (activePowerProfileId === profile.id) return profile;
    const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, profile.pixelRatioCap);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = profile.shadows;
    activePowerProfileId = profile.id;
    diagnostics.powerProfile = profile.id;
    diagnostics.renderPixelRatio = pixelRatio;
    diagnostics.shadowsEnabled = profile.shadows;
    canvas.dataset.powerProfile = profile.id;
    canvas.dataset.renderPixelRatio = pixelRatio.toFixed(2);
    canvas.dataset.shadows = profile.shadows ? "enabled" : "disabled";
    return profile;
  };
  const initialReducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  applyPowerProfile(initialReducedMotion);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa8c9c3);
  scene.fog = new THREE.FogExp2(0x9ab7a9, 0.024);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80);
  const defaultCameraPosition = new THREE.Vector3(0, 5.6, 8.9);
  const defaultCameraTarget = new THREE.Vector3(0, 0.7, 0);
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

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");
  const recordsRoot = new THREE.Group();
  recordsRoot.name = "EchoRecordCrate";
  world.add(recordsRoot);
  const printedCardsRoot = new THREE.Group();
  printedCardsRoot.name = "EchoRecordPrintedCards";
  world.add(printedCardsRoot);

  const sceneResources = createLazySundayScene(world);
  const player = createRecordPlayer(world);
  const screens = createAlbumScreens(world);
  const mediaPool = createScreenMediaPool({
    apiBase,
    renderer,
    diagnostics,
    onMediaError: (visual) => {
      diagnostics.mediaFailures += 1;
      diagnostics.lastError = `Media unavailable: ${visual?.title || "album visual"}`;
      onStatus?.(`${visual?.title || "Album visual"} could not be decoded; its source-labelled fallback remains visible.`);
    },
  });
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.88);
  const dragPoint = new THREE.Vector3();
  const recordEntries = new Map();
  const printedEntries = new Map();
  let restoredRecordTransforms = {};
  let disposed = false;
  let animationFrame = 0;
  let renderedFrames = 0;
  let previousFrameSeconds = 0;
  let heldEntry = null;
  let hoveredEntry = null;
  let selectedRecordId = "";
  let placedRecordId = "";
  let visualRecordId = "";
  let playback = {
    currentTime: 0,
    duration: 0,
    playing: false,
    reducedMotion: initialReducedMotion,
  };
  let activeVisuals = [];

  const setPointer = (event) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1;
  };

  const recordHit = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...recordEntries.values()].map((entry) => entry.root), true);
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData?.recordId) object = object.parent;
      if (object?.userData?.recordId) return recordEntries.get(object.userData.recordId) || null;
    }
    return null;
  };

  const visualHit = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(screens.map((screen) => screen.hitTarget), true);
    return hits[0]?.object?.userData?.visual || hits[0]?.object?.parent?.userData?.visual || null;
  };

  const playerDropReady = (position) => {
    const dx = position.x - player.platterWorld.x;
    const dz = position.z - player.platterWorld.z;
    return Math.hypot(dx, dz) <= 1.2;
  };

  const handlePointerDown = (event) => {
    if (disposed) return;
    setPointer(event);
    const entry = recordHit();
    if (entry) {
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
    if (heldEntry) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        heldEntry.root.position.set(
          THREE.MathUtils.clamp(dragPoint.x, -4.25, 4.25),
          1.12,
          THREE.MathUtils.clamp(dragPoint.z, -2.2, 2.45),
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
    }
    const visual = visualHit();
    renderer.domElement.style.cursor = nextHovered ? "grab" : visual ? "copy" : "default";
  };

  const handlePointerUp = (event) => {
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
      entry.root.position.copy(entry.home);
      onDropRecord?.(entry.record.songId);
      onStatus?.(`Cueing ${entry.record.title}; the platter will switch after its audio is verified.`);
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

  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
  renderer.domElement.addEventListener("lostpointercapture", handlePointerCancel);

  const handleContextLost = (event) => {
    event.preventDefault();
    diagnostics.contextState = "lost";
    diagnostics.lastError = "WebGL context lost";
    canvas.dataset.rendererState = "lost";
    onStatus?.("The 3D renderer paused after losing its graphics context.");
  };
  const handleContextRestored = () => {
    diagnostics.contextState = "restored";
    diagnostics.lastError = "";
    canvas.dataset.rendererState = "available";
    onStatus?.("The 3D renderer recovered its graphics context.");
  };
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

  const resize = () => {
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
        if (entry.record.songId !== visualRecordId) entry.faceMaterial.map = texture;
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
    const nextIds = new Set(records.map((record) => record.songId));
    for (const [songId, entry] of recordEntries) {
      if (nextIds.has(songId)) continue;
      recordsRoot.remove(entry.root);
      disposeRecordEntry(entry);
      recordEntries.delete(songId);
    }
    records.forEach((record, index) => {
      let entry = recordEntries.get(record.songId);
      if (!entry) {
        entry = createRecordEntry(record);
        entry.root.userData.recordId = record.songId;
        entry.root.traverse((object) => { object.userData.recordId = record.songId; });
        recordsRoot.add(entry.root);
        recordEntries.set(record.songId, entry);
      }
      entry.record = record;
      const span = Math.max(1, records.length - 1);
      const normalized = records.length === 1 ? 0 : (index / span) * 2 - 1;
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
      } else {
        entry.manipulated = false;
        entry.home.set(
          normalized * 3.75,
          0.82 + Math.cos(normalized * 1.4) * 0.12,
          2.15 + Math.abs(normalized) * 0.24,
        );
        entry.homeRotation.set(0, normalized * -0.12, normalized * -0.05);
      }
      if (entry !== heldEntry) entry.root.position.copy(entry.home);
      entry.root.rotation.set(
        entry.homeRotation.x,
        entry.homeRotation.y,
        entry.homeRotation.z,
      );
      entry.selected = record.songId === selectedRecordId;
      entry.placed = record.songId === placedRecordId;
      setRecordTexture(entry, recordCoverUri(record));
    });
  };

  const setVisuals = (visuals = [], state = {}) => {
    activeVisuals = visuals.slice(0, SCREEN_COUNT);
    assignAlbumScreenVisuals(screens, activeVisuals, mediaPool);
    mediaPool.warm(state.warmVisuals || []);
    visualRecordId = state.activeSongId || visualRecordId;
    recordEntries.forEach((entry, songId) => {
      if (songId === visualRecordId && screens[0]?.mediaResource?.texture) {
        entry.faceMaterial.map = screens[0].mediaResource.texture;
      } else {
        entry.faceMaterial.map = entry.coverTexture || entry.labelTexture;
      }
      entry.faceMaterial.needsUpdate = true;
    });
    if (screens[0]?.mediaResource?.texture) {
      player.recordMaterials[1].map = screens[0].mediaResource.texture;
      player.recordMaterials[1].color.setHex(0xffffff);
      player.recordMaterials[1].needsUpdate = true;
    }
    diagnostics.visualSurfaceCount = activeVisuals.length;
    diagnostics.activeVideos = screens.filter((screen) => Boolean(screen.mediaResource?.video)).length;
  };

  const setPlacedRecord = (songId) => {
    placedRecordId = songId || "";
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

  const spawnPrintedCard = (card = {}) => {
    if (!card.id) return;
    if (printedEntries.has(card.id)) {
      focusPrintedCard(card.id);
      return;
    }
    const entry = createPrintedCardEntry(card);
    const index = printedEntries.size;
    entry.root.position.set(3.35 - index * 0.38, 1.2 + index * 0.045, -0.58 + index * 0.16);
    entry.root.rotation.set(-0.24, -0.38 + index * 0.05, 0.08);
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
    controls.target.copy(entry.root.position);
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
          manipulated: true,
        };
      } else {
        delete recordTransforms[songId];
      }
    });
    return {
      schemaVersion: "hapa.echo-record-garden.scene.v2",
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      },
      recordTransforms,
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

  const render = (frameTimestamp = 0) => {
    if (disposed) return;
    animationFrame = requestAnimationFrame(render);
    const elapsed = Math.max(0, Number(frameTimestamp) || 0) / 1000;
    const delta = previousFrameSeconds
      ? Math.min(0.05, Math.max(0, elapsed - previousFrameSeconds))
      : 0;
    previousFrameSeconds = elapsed;
    const liveAudioClock = getAudioClock?.();
    const framePlayback = liveAudioClock
      ? {
          ...playback,
          currentTime: Math.max(0, Number(liveAudioClock.currentTime) || 0),
          duration: Math.max(0, Number(liveAudioClock.duration) || playback.duration || 0),
          playing: Boolean(liveAudioClock.playing),
        }
      : playback;
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
      const decorativeYaw = !framePlayback.reducedMotion && selected
        ? Math.sin(elapsed * 0.8) * 0.04
        : 0;
      entry.root.rotation.y = entry.homeRotation.y + decorativeYaw;
    });
    screens.forEach((screen, index) => {
      updateAlbumScreen(screen, {
        playback: framePlayback,
        elapsed,
        reducedMotion: playback.reducedMotion,
        focus: index === 0,
      });
    });
    updateSundayScene(sceneResources, elapsed, playback.reducedMotion);
    renderer.render(scene, camera);
    renderedFrames += 1;
    if (renderedFrames % 30 === 0) {
      diagnostics.audioTime = framePlayback.currentTime;
      diagnostics.audioState = framePlayback.playing ? "playing" : placedRecordId ? "paused" : "idle";
      diagnostics.rendererMemory = {
        geometries: Number(renderer.info.memory.geometries) || 0,
        textures: Number(renderer.info.memory.textures) || 0,
      };
      diagnostics.activeVideos = screens.filter((screen) => Boolean(screen.mediaResource?.video)).length;
      diagnostics.bufferedVideos = screens.filter((screen) => (
        screen.mediaResource?.video
        && screen.mediaResource.mediaState === "ready"
      )).length;
      diagnostics.presentedVideos = screens.filter((screen) => (
        screen.mediaResource?.video
        && screen.mediaResource.hasPresentedFrame
      )).length;
      diagnostics.waitingVideos = screens.filter((screen) => (
        screen.mediaResource?.video
        && !screen.mediaResource.hasPresentedFrame
        && !["failed", "disposed"].includes(screen.mediaResource.mediaState)
      )).length;
      if (diagnostics.contextState === "restored") diagnostics.contextState = "available";
      canvas.dataset.recordAngle = diagnostics.recordAngle.toFixed(6);
      canvas.dataset.audioTime = diagnostics.audioTime.toFixed(3);
      canvas.dataset.activeVideos = String(diagnostics.activeVideos);
      canvas.dataset.bufferedVideos = String(diagnostics.bufferedVideos);
      canvas.dataset.presentedVideos = String(diagnostics.presentedVideos);
      canvas.dataset.warmingVideos = String(diagnostics.warmingVideos);
      canvas.dataset.waitingVideos = String(diagnostics.waitingVideos);
      canvas.dataset.mediaPoolSize = String(diagnostics.mediaPoolSize);
      canvas.dataset.mediaHardSeeks = String(diagnostics.mediaHardSeeks);
      canvas.dataset.rendererMemory = `${diagnostics.rendererMemory.geometries}:${diagnostics.rendererMemory.textures}`;
    }
  };
  render();

  return {
    setRecords,
    setVisuals,
    setPlacedRecord,
    setPlayback,
    spawnPrintedCard,
    focusPrintedCard,
    focusVisual,
    resetCamera,
    restoreSnapshot,
    snapshot,
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
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost, false);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored, false);
      controls.removeEventListener("end", handleControlsEnd);
      controls.dispose();
      recordEntries.forEach(disposeRecordEntry);
      printedEntries.forEach(disposePrintedCardEntry);
      screens.forEach((screen) => {
        if (screen.mediaResource?.poolManaged) mediaPool.release(screen.mediaResource);
        else disposeScreenMediaResource(screen.mediaResource);
        screen.mediaResource = null;
      });
      mediaPool.dispose();
      screens.forEach(disposeAlbumScreen);
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
      diagnostics.waitingVideos = 0;
      diagnostics.mediaPoolSize = 0;
      diagnostics.contextState = diagnostics.liveRenderers ? "available" : "disposed";
      canvas.dataset.rendererState = "disposed";
    },
  };
}

function createLazySundayScene(world) {
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x6f9367, roughness: 0.98 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), grassMaterial);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.58;
  grass.receiveShadow = true;
  world.add(grass);

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x9d6740, roughness: 0.72, metalness: 0.02 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.34, 5.9), woodMaterial);
  table.position.y = -0.22;
  table.receiveShadow = true;
  table.castShadow = true;
  world.add(table);

  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3928, roughness: 0.8 });
  const apron = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.38, 5.66), edgeMaterial);
  apron.position.y = -0.47;
  world.add(apron);

  const clothTexture = createPicnicClothTexture();
  clothTexture.wrapS = THREE.RepeatWrapping;
  clothTexture.wrapT = THREE.RepeatWrapping;
  clothTexture.repeat.set(3.4, 2.2);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 3.5),
    new THREE.MeshStandardMaterial({ map: clothTexture, roughness: 0.93, side: THREE.DoubleSide }),
  );
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.set(-2.2, -0.035, 0.05);
  cloth.receiveShadow = true;
  world.add(cloth);

  const sun = new THREE.DirectionalLight(0xffe2a9, 4.4);
  sun.position.set(-5, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  world.add(sun);

  const sky = new THREE.HemisphereLight(0xe5f6ff, 0x6f7652, 2.3);
  world.add(sky);

  const rim = new THREE.PointLight(0xf6c96d, 18, 10, 2);
  rim.position.set(3.2, 3.2, -2.1);
  world.add(rim);

  const bokeh = new THREE.Group();
  const bokehGeometry = new THREE.SphereGeometry(0.035, 8, 8);
  for (let index = 0; index < 38; index += 1) {
    const baseOpacity = 0.2 + (index % 5) * 0.045;
    const material = new THREE.MeshBasicMaterial({
      color: index % 3 === 0 ? 0xffedaa : 0xd7f6d0,
      transparent: true,
      opacity: baseOpacity,
    });
    const mote = new THREE.Mesh(bokehGeometry, material);
    mote.position.set(
      -6 + ((index * 2.37) % 12),
      0.4 + ((index * 1.73) % 5),
      -5 + ((index * 2.11) % 9),
    );
    mote.userData.phase = index * 0.47;
    mote.userData.baseOpacity = baseOpacity;
    bokeh.add(mote);
  }
  world.add(bokeh);

  const parasol = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.09, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xe7d3a3, roughness: 0.72 }),
  );
  parasol.position.set(-5.2, 2.35, -3.1);
  parasol.rotation.z = -0.08;
  world.add(parasol);

  return {
    bokeh,
    dispose() {
      clothTexture.dispose();
      grass.geometry.dispose();
      grassMaterial.dispose();
      table.geometry.dispose();
      woodMaterial.dispose();
      apron.geometry.dispose();
      edgeMaterial.dispose();
      cloth.geometry.dispose();
      cloth.material.dispose();
      parasol.geometry.dispose();
      parasol.material.dispose();
      bokehGeometry.dispose();
      bokeh.children.forEach((mote) => mote.material.dispose());
    },
  };
}

function updateSundayScene(resources, elapsed, reducedMotion) {
  resources.bokeh.children.forEach((mote, index) => {
    const phase = mote.userData.phase || index;
    if (reducedMotion) {
      mote.material.opacity = mote.userData.baseOpacity ?? 0.2;
      return;
    }
    mote.position.y += Math.sin(elapsed * 0.48 + phase) * 0.0007;
    mote.position.x += Math.cos(elapsed * 0.21 + phase) * 0.0004;
    mote.material.opacity = 0.16 + Math.sin(elapsed * 0.7 + phase) * 0.055;
  });
}

function createRecordPlayer(world) {
  const root = new THREE.Group();
  root.name = "EchoRecordPlayer";
  root.position.set(1.8, 0.05, 0.22);
  world.add(root);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.25, 0.34, 2.55),
    new THREE.MeshStandardMaterial({ color: 0x3d2f28, roughness: 0.58, metalness: 0.06 }),
  );
  base.position.y = 0.17;
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  const inset = new THREE.Mesh(
    new THREE.BoxGeometry(3.02, 0.08, 2.32),
    new THREE.MeshStandardMaterial({ color: 0xcda96b, roughness: 0.62 }),
  );
  inset.position.y = 0.38;
  root.add(inset);

  const platter = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.08, 0.12, 64),
    new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.32, metalness: 0.7 }),
  );
  platter.position.set(-0.38, 0.5, 0);
  platter.castShadow = true;
  root.add(platter);

  const recordMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.45, metalness: 0.18 }),
    new THREE.MeshStandardMaterial({ color: 0xf1d899, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5 }),
  ];
  const record = new THREE.Mesh(new THREE.CylinderGeometry(1.01, 1.01, 0.045, 72), recordMaterials);
  record.position.set(-0.38, 0.59, 0);
  record.visible = false;
  root.add(record);

  const labelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.37, 0.017, 8, 56),
    new THREE.MeshBasicMaterial({ color: 0xffe6a6, transparent: true, opacity: 0.82 }),
  );
  labelRing.rotation.x = Math.PI / 2;
  labelRing.position.set(-0.38, 0.62, 0);
  root.add(labelRing);

  const spindle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.2, 16),
    new THREE.MeshStandardMaterial({ color: 0xe9d6a8, metalness: 0.9, roughness: 0.2 }),
  );
  spindle.position.set(-0.38, 0.69, 0);
  root.add(spindle);

  const toneArmPivot = new THREE.Group();
  toneArmPivot.position.set(1.08, 0.68, -0.78);
  root.add(toneArmPivot);
  const toneArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 1.78, 12),
    new THREE.MeshStandardMaterial({ color: 0xe7d8b7, roughness: 0.28, metalness: 0.72 }),
  );
  toneArm.position.set(-0.62, 0, 0.25);
  toneArm.rotation.z = Math.PI / 2.7;
  toneArmPivot.add(toneArm);
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.09, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x31241f, roughness: 0.5 }),
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

  const platterWorld = new THREE.Vector3();
  platter.getWorldPosition(platterWorld);
  return {
    root,
    record,
    recordMaterials,
    labelRing,
    toneArm: toneArmPivot,
    dropRing,
    platterWorld,
    mediaResource: null,
    dispose() {
      disposeScreenMediaResource(this.mediaResource);
      root.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
    },
  };
}

function screenMediaSourceIdentity(visual = {}) {
  const videoUri = visual.videoUri || (/\.mp4(?:$|\?)/i.test(visual.mediaUri || "") ? visual.mediaUri : "");
  const imageUri = visual.imageUri || visual.posterUri || (!videoUri ? visual.mediaUri : "");
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
      ]
    : [];
  return {
    videoUri,
    imageUri,
    revision: String(revision),
    key: JSON.stringify([
      videoUri ? "video" : imageUri ? "image" : "fallback",
      videoUri || imageUri || "",
      String(revision),
      mode,
      ...clipIdentity,
    ]),
  };
}

function setPlayerRecordVisual(player, visual, { apiBase, renderer }) {
  const identity = screenMediaSourceIdentity(visual);
  if ((!identity.videoUri && !identity.imageUri) || player.mediaResource?.key === identity.key) return;
  disposeScreenMediaResource(player.mediaResource);
  const resource = createScreenMediaResource(visual, {
    apiBase,
    renderer,
    fallbackTexture: createVisualTitleTexture(visual, { round: true }),
  });
  player.mediaResource = resource;
  player.recordMaterials[1].map = resource.texture;
  player.recordMaterials[1].color.setHex(0xffffff);
  player.recordMaterials[1].needsUpdate = true;
}

function createAlbumScreens(world) {
  const specs = [
    { x: -2.62, y: 2.1, z: -2.08, ry: 0.18, scale: 0.92 },
    { x: 0, y: 2.36, z: -2.42, ry: 0, scale: 1.15 },
    { x: 2.68, y: 2.04, z: -2.04, ry: -0.18, scale: 0.92 },
  ];
  return specs.map((spec, index) => {
    const root = new THREE.Group();
    root.name = `EchoAlbumScreen${index + 1}`;
    root.position.set(spec.x, spec.y, spec.z);
    root.rotation.y = spec.ry;
    root.scale.setScalar(spec.scale);
    world.add(root);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.72, 1.72, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x3c2b24, roughness: 0.48, metalness: 0.08 }),
    );
    frame.castShadow = true;
    root.add(frame);

    const standbyTexture = createVisualTitleTexture({ title: "Echo surface", kindLabel: "WAITING FOR RECORD" });
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: standbyTexture,
      color: 0xffffff,
      toneMapped: false,
    });
    const hitTarget = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.48), screenMaterial);
    hitTarget.position.z = 0.076;
    root.add(hitTarget);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.82, 1.82),
      new THREE.MeshBasicMaterial({
        color: index === 1 ? 0xf6c96d : 0x72d9cf,
        transparent: true,
        opacity: 0.09,
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

  const updateDiagnostics = () => {
    diagnostics.mediaPoolSize = entries.size;
    diagnostics.bufferedVideos = [...entries.values()].filter(({ resource }) => (
      resource.video && resource.mediaState === "ready"
    )).length;
    diagnostics.presentedVideos = [...entries.values()].filter(({ resource }) => (
      resource.video && resource.hasPresentedFrame
    )).length;
    diagnostics.warmingVideos = [...entries.values()].filter(({ resource, warm }) => (
      warm && resource.video
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

  const ensureEntry = (visual) => {
    const identity = screenMediaSourceIdentity(visual);
    let entry = entries.get(identity.key);
    if (!entry) {
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
      entries.forEach((entry) => { entry.warm = false; });
      const warmKeys = new Set();
      visuals.slice(0, SCREEN_COUNT).forEach((visual) => {
        const entry = ensureEntry(visual);
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
    screen.screenMaterial.map = assignment.resource.texture;
    screen.screenMaterial.needsUpdate = true;
  });
  mediaPool.trim();
}

function updateAlbumScreen(screen, { playback, elapsed, reducedMotion, focus }) {
  const resource = screen.mediaResource;
  const visual = screen.visual;
  if (resource?.video && visual && resource.mediaState !== "failed") {
    const video = resource.video;
    const plan = echoRecordVideoPlaybackPlan({
      clockSeconds: playback.currentTime,
      startSeconds: visual.startSeconds,
      durationSeconds: visual.durationSeconds || video.duration,
      sourceStartSeconds: visual.sourceStartSeconds,
      sourceEndSeconds: visual.sourceEndSeconds,
      playbackMode: visual.playbackMode,
      clockLocked: visual.clockLocked !== false,
      playbackPlaying: playback.playing,
      documentHidden: document.hidden,
      reducedMotion,
      videoCurrentTime: video.currentTime,
      videoDuration: video.duration,
      readyState: video.readyState,
    });
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
  screen.glow.material.opacity = focus
    ? 0.11 + (reducedMotion ? 0 : Math.sin(elapsed * 1.2) * 0.025)
    : 0.065;
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
  if (videoUri) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.loop = visual.clockLocked === false || visual.playbackMode === "loop";
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = resolveGardenMediaUri(videoUri, apiBase);
    const texture = fallbackTexture;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    let fallbackImage = texture.image;
    let posterImage = null;
    const resource = {
      key: identity.key,
      texture,
      video,
      diagnostics,
      mediaState: "loading",
      hasPresentedFrame: false,
      lastPresentedVideoTime: Number.NaN,
      desiredPlaying: false,
      playPending: null,
      nextPlayAttemptAt: 0,
      lastHardSeekAt: Number.NEGATIVE_INFINITY,
      frameCallback: 0,
      disposed: false,
      presentVideoFrame: () => presentVideoFrame(),
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
        video.removeEventListener("error", handleError);
        if (resource.frameCallback && video.cancelVideoFrameCallback) {
          video.cancelVideoFrameCallback(resource.frameCallback);
        }
        if (posterImage) {
          posterImage.onload = null;
          posterImage.onerror = null;
          posterImage.removeAttribute("src");
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
        texture.dispose();
      },
    };
    const presentVideoFrame = () => {
      if (resource.disposed || video.readyState < 2) return false;
      resource.hasPresentedFrame = true;
      resource.lastPresentedVideoTime = Number(video.currentTime) || 0;
      resource.mediaState = video.readyState >= 3 ? "ready" : "buffering";
      texture.image = video;
      texture.needsUpdate = true;
      return true;
    };
    const scheduleFrame = () => {
      if (resource.disposed || !video.requestVideoFrameCallback || resource.frameCallback) return;
      resource.frameCallback = video.requestVideoFrameCallback(() => {
        resource.frameCallback = 0;
        if (resource.disposed) return;
        presentVideoFrame();
        scheduleFrame();
      });
    };
    const prepareFirstFrame = () => {
      if (resource.disposed || video.readyState < 2) return;
      if (!resource.hasPresentedFrame) resource.mediaState = "first-frame-pending";
      if (video.requestVideoFrameCallback) scheduleFrame();
      else presentVideoFrame();
    };
    const handleMetadata = () => {
      const sourceStart = Math.max(0, Number(visual.sourceStartSeconds) || 0);
      if (sourceStart > 0 && Math.abs((Number(video.currentTime) || 0) - sourceStart) > 0.04) {
        try { video.currentTime = sourceStart; } catch {}
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
    const handleWaiting = () => {
      if (resource.disposed || resource.mediaState === "failed") return;
      if (resource.mediaState !== "buffering") diagnostics.mediaBufferingTransitions += 1;
      resource.mediaState = resource.hasPresentedFrame ? "buffering" : "first-frame-pending";
    };
    const handleError = () => {
      if (resource.disposed || resource.mediaState === "failed") return;
      resource.mediaState = "failed";
      resource.desiredPlaying = false;
      if (!video.paused) video.pause();
      texture.image = fallbackImage;
      texture.needsUpdate = true;
      diagnostics.lastError = `Media unavailable: ${visual.title || "album visual"}`;
      onMediaError?.(visual);
    };
    if (imageUri) {
      posterImage = document.createElement("img");
      posterImage.crossOrigin = "anonymous";
      posterImage.decoding = "async";
      posterImage.onload = () => {
        if (resource.disposed) return;
        fallbackImage = posterImage;
        if (resource.hasPresentedFrame) return;
        texture.image = fallbackImage;
        texture.needsUpdate = true;
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
    video.addEventListener("error", handleError);
    video.load();
    return resource;
  }
  if (imageUri) {
    const texture = fallbackTexture;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let loadedTexture = null;
    let disposed = false;
    loader.load(
      resolveGardenMediaUri(imageUri, apiBase),
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        loadedTexture = loaded;
        texture.image = loaded.image;
        texture.needsUpdate = true;
      },
      undefined,
      () => {},
    );
    return {
      key: identity.key,
      texture,
      dispose() {
        if (disposed) return;
        disposed = true;
        loadedTexture?.dispose?.();
        texture.dispose();
      },
    };
  }
  return {
    key: identity.key,
    texture: fallbackTexture,
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
    home: new THREE.Vector3(),
    homeRotation: new THREE.Vector3(),
    dragStart: new THREE.Vector3(),
    manipulated: false,
    hovered: false,
    selected: false,
    placed: false,
    labelTexture,
    coverTexture: null,
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
  entry.root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
}

function createPrintedCardEntry(card) {
  const root = new THREE.Group();
  root.name = `EchoPrintedCard:${card.id}`;
  const texture = createPrintedCardTexture(card);
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.04,
  });
  const cardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.055, 1.18),
    [
      new THREE.MeshStandardMaterial({ color: 0x1d1513 }),
      new THREE.MeshStandardMaterial({ color: 0x1d1513 }),
      new THREE.MeshStandardMaterial({ color: 0x1d1513 }),
      new THREE.MeshStandardMaterial({ color: 0x1d1513 }),
      faceMaterial,
      new THREE.MeshStandardMaterial({ color: 0x08212b }),
    ],
  );
  cardMesh.castShadow = true;
  root.add(cardMesh);
  const halo = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.018, 1.26),
    new THREE.MeshBasicMaterial({ color: 0x56f0cf, transparent: true, opacity: 0.16 }),
  );
  halo.position.y = -0.05;
  root.add(halo);
  return { card, root, cardMesh, texture };
}

function disposePrintedCardEntry(entry) {
  entry.texture?.dispose?.();
  entry.root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
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

function createPicnicClothTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f1dec4";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(191,82,67,.72)";
  for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 27, 256);
  for (let y = 0; y < 256; y += 64) ctx.fillRect(0, y, 256, 27);
  ctx.fillStyle = "rgba(130,43,38,.32)";
  for (let x = 0; x < 256; x += 64) {
    for (let y = 0; y < 256; y += 64) ctx.fillRect(x, y, 27, 27);
  }
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
