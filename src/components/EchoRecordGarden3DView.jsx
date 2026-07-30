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
import {
  buildEchoRecordVisualSurfaces,
  buildLocalEchoRecordCardProjection,
  echoRecordPerspectiveToken,
  echoRecordVinylSpinRadians,
  normalizeEchoRecordGardenSnapshot,
  normalizeEchoRecordSummaryRows,
  resolveEchoRecordMediaUri,
  unwrapEchoDirectorProject,
} from "../domain/echo-record-garden.js";
import { localFileApiUri } from "../domain/local-media-uri.js";

const RECORDS_PER_CRATE = 6;
const RECORD_RPM = 100 / 3;
const SCREEN_COUNT = 3;
const MEDIA_SYNC_TOLERANCE_SECONDS = 0.24;
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
    mediaId: surface.sourceId || surface.mediaId || "none",
    mediaUri,
    posterUri,
    videoUri: mediaKind === "video" ? mediaUri : "",
    imageUri: mediaKind === "image" ? mediaUri : posterUri,
    startSeconds,
    sourceStartSeconds: Number(surface.sourceStartSeconds) || 0,
    durationSeconds: Math.max(0, endSeconds - startSeconds) || Number(surface.durationSeconds) || 0,
    clockLocked: ["now-playing", "up-next"].includes(surface.role),
  };
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
      schemaVersion: "hapa.echo-record-garden.snapshot.v1",
      selection: {
        selectedSongId: value.selectedSongId || "",
        placedSongId: value.placedSongId || "",
        selectedVisualId: value.selectedVisualId || "",
        perspective: value.perspective || "all",
      },
      playback: {
        seconds: Math.max(0, Number(value.playbackSeconds) || 0),
        muted: Boolean(value.muted),
      },
      camera: value.camera || null,
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
  const gameRef = useRef(null);
  const projectCacheRef = useRef(new Map());
  const requestRef = useRef(0);
  const requestControllerRef = useRef(null);
  const actionsRef = useRef({});
  const initialSongIdRef = useRef(selectedSongId);
  const [loadState, setLoadState] = useState({ status: "loading", error: "" });
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [perspective, setPerspective] = useState(preferences.perspective);
  const [cratePage, setCratePage] = useState(0);
  const [selectedRecordId, setSelectedRecordId] = useState(selectedSongId || preferences.selectedSongId);
  const [placedRecordId, setPlacedRecordId] = useState(preferences.placedSongId);
  const [project, setProject] = useState(null);
  const [referenceCards, setReferenceCards] = useState([]);
  const [visuals, setVisuals] = useState([]);
  const [selectedVisualId, setSelectedVisualId] = useState(preferences.selectedVisualId);
  const [printedCards, setPrintedCards] = useState([]);
  const [playback, setPlayback] = useState(() => initialPlaybackState(preferences.playbackSeconds));
  const [muted, setMuted] = useState(preferences.muted);
  const [notice, setNotice] = useState("Choose a record, then drag it onto the player.");
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  ));

  const selectedRecord = useMemo(
    () => records.find((record) => record.songId === selectedRecordId) || null,
    [records, selectedRecordId],
  );
  const placedRecord = useMemo(
    () => records.find((record) => record.songId === placedRecordId) || null,
    [records, placedRecordId],
  );
  const filteredRecords = useMemo(
    () => records.filter((record) => recordMatchesQuery(record, query, perspective)),
    [perspective, query, records],
  );
  const cratePageCount = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PER_CRATE));
  const crateRecords = useMemo(() => (
    filteredRecords.slice(cratePage * RECORDS_PER_CRATE, (cratePage + 1) * RECORDS_PER_CRATE)
  ), [cratePage, filteredRecords]);
  const selectedVisual = useMemo(
    () => visuals.find((visual) => visual.id === selectedVisualId) || visuals[0] || null,
    [selectedVisualId, visuals],
  );

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
      if (document.hidden && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setNotice("Playback paused while the Record Garden is hidden.");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      writeGardenPreferences({
        muted,
        perspective,
        selectedSongId: selectedRecordId,
        placedSongId: placedRecordId,
        selectedVisualId,
        playbackSeconds: playback.currentTime,
        camera: gameRef.current?.snapshot?.().camera || preferences.camera,
      });
    }, 240);
    return () => globalThis.clearTimeout(timeout);
  }, [
    muted,
    cameraRevision,
    perspective,
    placedRecordId,
    playback.currentTime,
    preferences.camera,
    selectedRecordId,
    selectedVisualId,
  ]);

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
        const nextRecords = normalizeEchoRecordSummaryRows(payload);
        setRecords(nextRecords);
        setLoadState({ status: "ready", error: "" });
        const preferred = [
          initialSongIdRef.current,
          preferences.selectedSongId,
          nextRecords[0]?.songId,
        ].find((songId) => nextRecords.some((record) => record.songId === songId));
        if (preferred) setSelectedRecordId(preferred);
        if (nextRecords.some((record) => record.songId === preferences.placedSongId)) {
          setPlacedRecordId(preferences.placedSongId);
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
  }, [apiBase, preferences.placedSongId, preferences.selectedSongId]);

  const loadRecordProject = useCallback(async (songId) => {
    if (!songId) return null;
    requestControllerRef.current?.abort();
    const requestId = ++requestRef.current;
    const cached = projectCacheRef.current.get(songId);
    if (cached) {
      setProject(cached.project);
      setReferenceCards(cached.references);
      return cached;
    }
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setNotice("Opening the sleeve and cueing its visual constellation…");
    setProject(null);
    setReferenceCards([]);
    const base = browserApiBase(apiBase);
    const [projectResponse, referenceResponse] = await Promise.all([
      fetch(`${base}/api/echos/director-project?songId=${encodeURIComponent(songId)}`, {
        signal: controller.signal,
      }),
      fetch(`${base}/api/echos/references/tarot-cards?songId=${encodeURIComponent(songId)}`, {
        signal: controller.signal,
      }),
    ]);
    if (!projectResponse.ok) throw new Error(`Director project failed (${projectResponse.status})`);
    const projectPayload = await projectResponse.json();
    const referencePayload = referenceResponse.ok ? await referenceResponse.json() : { cards: [] };
    const nextProject = unwrapEchoDirectorProject(projectPayload);
    if (!nextProject) throw new Error("Director project payload did not include a song");
    const nextReferences = Array.isArray(referencePayload?.cards) ? referencePayload.cards : [];
    const cachedPacket = { project: nextProject, references: nextReferences };
    projectCacheRef.current.set(songId, cachedPacket);
    if (requestRef.current !== requestId) return cachedPacket;
    setProject(nextProject);
    setReferenceCards(nextReferences);
    setNotice(`${nextProject?.song_title || "Record"} is ready for the player.`);
    return cachedPacket;
  }, [apiBase]);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }, []);

  useEffect(() => {
    if (!selectedRecordId) return undefined;
    let active = true;
    loadRecordProject(selectedRecordId).catch((error) => {
      if (!active) return;
      setNotice(`Could not open this sleeve: ${error?.message || "unknown error"}`);
    });
    return () => {
      active = false;
    };
  }, [loadRecordProject, selectedRecordId]);

  useEffect(() => {
    if (!project) {
      setVisuals([]);
      return;
    }
    const nextVisuals = buildEchoRecordVisualSurfaces({
      project,
      referenceCards,
      avatars,
      sceneGraph,
      clockSeconds: playback.currentTime,
      limit: SCREEN_COUNT,
      apiBase,
    }).map(toGardenVisual);
    setVisuals(nextVisuals);
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
    const projectSongId = String(project?.song_id || project?.songId || "");
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
  }, [onSelectSong]);

  const placeRecord = useCallback(async (songId = selectedRecordId, { autoplay = true } = {}) => {
    if (!songId) return;
    try {
      const packet = await loadRecordProject(songId);
      const nextProject = packet?.project;
      if (!nextProject) throw new Error("The Director project is empty");
      setSelectedRecordId(songId);
      setPlacedRecordId(songId);
      setPlayback(initialPlaybackState());
      onSelectSong?.(songId);
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      const audioUri = projectAudioUri(nextProject, apiBase);
      if (!audioUri) throw new Error("This record has no routable audio source");
      audio.src = audioUri;
      audio.currentTime = 0;
      audio.muted = muted;
      audio.load();
      gameRef.current?.setPlacedRecord(songId);
      setNotice(`${nextProject.song_title || "Record"} is on the turntable.`);
      if (autoplay) {
        await audio.play();
        setPlayback((current) => ({ ...current, playing: true }));
      }
    } catch (error) {
      setNotice(`Player could not cue the record: ${error?.message || "unknown error"}`);
    }
  }, [apiBase, loadRecordProject, muted, onSelectSong, selectedRecordId]);

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

  const generateCardForVisual = useCallback(async (visual = selectedVisual) => {
    if (!visual) return;
    setSelectedVisualId(visual.id);
    setNotice(`Printing the Hapa Card attached to ${visual.title || "this visual"}…`);
    let card = visual.card || null;
    if (!card && visual.mediaId && visual.mediaId !== "none") {
      try {
        const response = await fetch(`${browserApiBase(apiBase)}/api/tarot/card/${encodeURIComponent(visual.mediaId)}`);
        if (response.ok) card = await response.json();
      } catch {
        // A truth-safe local projection below keeps the interaction available.
      }
    }
    const printed = card || buildLocalEchoRecordCardProjection({
      visual,
      project,
      clockSeconds: playback.currentTime,
    });
    if (!printed) {
      setNotice("This visual does not have enough source context for a local Card projection.");
      return;
    }
    const attached = {
      ...printed,
      echoRecordAttachment: {
        ...(printed.echoRecordAttachment || {}),
        sourceVisualId: visual.id,
        sourceSongId: placedRecord?.songId || selectedRecord?.songId || "",
        atSeconds: playback.currentTime,
        surface: "echo-record-garden",
        truthStatus: card ? "source-card" : "local-unminted-projection",
      },
    };
    setPrintedCards((current) => [attached, ...current.filter((item) => item.id !== attached.id)].slice(0, 5));
    gameRef.current?.spawnPrintedCard(attached);
    setNotice(card
      ? `Generated attached Card: ${attached.title || "Hapa Card"}`
      : `Generated a local, unminted Card projection for ${attached.title || "this visual"}.`);
  }, [apiBase, placedRecord, playback.currentTime, project, selectedRecord, selectedVisual]);

  actionsRef.current = {
    generateCardForVisual,
    placeRecord,
    selectRecord,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let game;
    try {
      game = createEchoRecordGardenGame({
        canvas,
        apiBase,
        onCameraChange: () => setCameraRevision((revision) => revision + 1),
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
      game.restoreSnapshot({ camera: preferences.camera });
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
  }, [apiBase, preferences.camera]);

  useEffect(() => {
    gameRef.current?.setRecords(crateRecords, {
      selectedRecordId,
      placedRecordId,
    });
  }, [crateRecords, placedRecordId, selectedRecordId]);

  useEffect(() => {
    gameRef.current?.setVisuals(visuals, {
      activeSongId: placedRecordId || selectedRecordId,
    });
  }, [placedRecordId, selectedRecordId, visuals]);

  useEffect(() => {
    gameRef.current?.setPlayback({
      currentTime: playback.currentTime,
      duration: playback.duration || projectDuration(project) || 0,
      playing: playback.playing,
      reducedMotion,
    });
  }, [playback.currentTime, playback.duration, playback.playing, project, reducedMotion]);

  useEffect(() => {
    setCratePage(0);
  }, [perspective, query]);

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
          <span><strong>{visuals.length}</strong><em>live surfaces</em></span>
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
      </aside>

      <aside className="echo-record-visual-inspector hapa-panel" data-variant="notch">
        <div className="echo-record-visual-inspector-head">
          <span><Layers3 size={14} /> Visual surface</span>
          <em>{visuals.length ? `${Math.max(1, visuals.findIndex((item) => item.id === selectedVisual?.id) + 1)} / ${visuals.length}` : "0 / 0"}</em>
        </div>
        {selectedVisual ? (
          <>
            <strong>{selectedVisual.title}</strong>
            <small>{selectedVisual.kindLabel || selectedVisual.kind || "Album visual"} · {selectedVisual.truthLabel || "source-linked"}</small>
            <div className="echo-record-visual-selector" role="list" aria-label="Visible album surfaces">
              {visuals.map((visual) => (
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
            <button
              className="hapa-btn echo-record-print-card"
              data-intent="primary"
              data-testid="echo-record-generate-card"
              type="button"
              onClick={() => void generateCardForVisual(selectedVisual)}
            >
              <Sparkles size={14} />
              Generate attached Hapa Card
            </button>
          </>
        ) : (
          <p>Place a record to reveal its Director video, references, character, and scene surfaces.</p>
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
            aria-label={playback.playing ? "Pause record" : "Play selected record"}
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
        </div>

        <div className="echo-record-crate-tools">
          <label className="echo-record-search hapa-field">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the record crate…"
              aria-label="Search Echo State records"
            />
          </label>
          <label className="echo-record-perspective">
            <span>Perspective</span>
            <select value={perspective} onChange={(event) => setPerspective(event.target.value)}>
              <option value="all">All records</option>
              <option value="red">Red</option>
              <option value="blue">Blue</option>
              <option value="green">Green</option>
            </select>
          </label>
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

        <div className="echo-record-crate" role="listbox" aria-label="Echo State record crate">
          {loadState.status === "loading" && (
            <div className="echo-record-crate-empty"><Loader2 size={16} /> Loading album records…</div>
          )}
          {loadState.status === "error" && (
            <div className="echo-record-crate-empty error"><AlertTriangle size={16} /> {loadState.error}</div>
          )}
          {loadState.status === "ready" && crateRecords.length === 0 && (
            <div className="echo-record-crate-empty">No records match this crate filter.</div>
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

function createEchoRecordGardenGame({
  canvas,
  apiBase = "",
  getAudioClock,
  onCameraChange,
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
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  diagnostics.createdGames += 1;
  diagnostics.liveGames += 1;
  diagnostics.liveRenderers += 1;
  diagnostics.contextState = "available";
  diagnostics.lastError = "";
  canvas.dataset.rendererState = "available";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa8c9c3);
  scene.fog = new THREE.FogExp2(0x9ab7a9, 0.024);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80);
  const defaultCameraPosition = new THREE.Vector3(0, 5.6, 8.9);
  const defaultCameraTarget = new THREE.Vector3(0, 0.7, 0);
  camera.position.copy(defaultCameraPosition);
  camera.lookAt(defaultCameraTarget);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
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
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.88);
  const dragPoint = new THREE.Vector3();
  const recordEntries = new Map();
  const printedEntries = new Map();
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
    reducedMotion: false,
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
    heldEntry = null;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    controls.enabled = true;
    renderer.domElement.style.cursor = "default";
    player.dropRing.material.opacity = 0.38;
    player.dropRing.scale.setScalar(1);
    entry.root.scale.setScalar(1);
    if (playerDropReady(entry.root.position)) {
      placedRecordId = entry.record.songId;
      onDropRecord?.(entry.record.songId);
      onStatus?.(`${entry.record.title} dropped on the player.`);
    }
    entry.root.position.copy(entry.home);
  };

  const handlePointerCancel = (event) => {
    if (!heldEntry) return;
    heldEntry.root.position.copy(heldEntry.home);
    heldEntry.root.scale.setScalar(1);
    heldEntry = null;
    controls.enabled = true;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
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
        if (disposed || entry.textureUri !== uri) {
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
        if (!disposed && entry.labelTexture) {
          entry.faceMaterial.map = entry.labelTexture;
          entry.faceMaterial.needsUpdate = true;
        }
      },
    );
  };

  const setRecords = (records = [], state = {}) => {
    selectedRecordId = state.selectedRecordId || selectedRecordId;
    placedRecordId = state.placedRecordId || placedRecordId;
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
      entry.home.set(normalized * 3.75, 0.82 + Math.cos(normalized * 1.4) * 0.12, 2.15 + Math.abs(normalized) * 0.24);
      if (entry !== heldEntry) entry.root.position.copy(entry.home);
      entry.root.rotation.y = normalized * -0.12;
      entry.root.rotation.z = normalized * -0.05;
      entry.selected = record.songId === selectedRecordId;
      entry.placed = record.songId === placedRecordId;
      setRecordTexture(entry, recordCoverUri(record));
    });
  };

  const setVisuals = (visuals = [], state = {}) => {
    activeVisuals = visuals.slice(0, SCREEN_COUNT);
    screens.forEach((screen, index) => {
      setAlbumScreenVisual(screen, activeVisuals[index] || null, {
        apiBase,
        renderer,
      });
    });
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
    camera.position.lerp(new THREE.Vector3(4.5, 3.1, 4.6), 0.7);
    controls.target.copy(entry.root.position);
    controls.update();
    onCameraChange?.();
  };

  const focusVisual = (visualId) => {
    const screen = screens.find((candidate) => candidate.visual?.id === visualId);
    if (!screen) return;
    camera.position.lerp(new THREE.Vector3(screen.root.position.x * 0.52, 3.5, 5.6), 0.72);
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

  const snapshot = () => ({
    schemaVersion: "hapa.echo-record-garden.scene.v1",
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
    },
  });

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
    controls.update();
    player.record.visible = Boolean(placedRecordId);
    if (player.record.visible) {
      const canonicalRecordAngle = echoRecordVinylSpinRadians(framePlayback.currentTime, {
        rpm: RECORD_RPM,
      });
      diagnostics.recordAngle = canonicalRecordAngle;
      player.record.rotation.y = framePlayback.reducedMotion ? 0 : canonicalRecordAngle;
      player.labelRing.rotation.y = player.record.rotation.y;
      player.toneArm.rotation.y = THREE.MathUtils.lerp(
        -0.2,
        0.34,
        framePlayback.duration > 0 ? THREE.MathUtils.clamp(framePlayback.currentTime / framePlayback.duration, 0, 1) : 0,
      );
    }
    player.dropRing.material.opacity = heldEntry
      ? player.dropRing.material.opacity
      : 0.26 + Math.sin(elapsed * 1.4) * 0.08;
    recordEntries.forEach((entry, songId) => {
      if (entry === heldEntry) return;
      const selected = songId === selectedRecordId;
      const targetY = entry.home.y + (selected ? 0.22 : entry.hovered ? 0.12 : 0);
      entry.root.position.y = THREE.MathUtils.damp(entry.root.position.y, targetY, 9, delta);
      const scale = selected ? 1.08 : entry.hovered ? 1.035 : 1;
      entry.root.scale.lerp(new THREE.Vector3(scale, scale, scale), Math.min(1, delta * 9));
      entry.edgeMaterial.emissiveIntensity = selected ? 0.66 : entry.hovered ? 0.42 : 0.18;
      if (!playback.reducedMotion) entry.root.rotation.y += selected ? delta * 0.08 : 0;
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
      if (diagnostics.contextState === "restored") diagnostics.contextState = "available";
      canvas.dataset.recordAngle = diagnostics.recordAngle.toFixed(6);
      canvas.dataset.audioTime = diagnostics.audioTime.toFixed(3);
      canvas.dataset.activeVideos = String(diagnostics.activeVideos);
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
      screens.forEach(disposeAlbumScreen);
      player.dispose();
      sceneResources.dispose();
      renderer.dispose();
      diagnostics.disposedGames += 1;
      diagnostics.liveGames = Math.max(0, diagnostics.liveGames - 1);
      diagnostics.liveRenderers = Math.max(0, diagnostics.liveRenderers - 1);
      diagnostics.activeVideos = 0;
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
    const material = new THREE.MeshBasicMaterial({
      color: index % 3 === 0 ? 0xffedaa : 0xd7f6d0,
      transparent: true,
      opacity: 0.2 + (index % 5) * 0.045,
    });
    const mote = new THREE.Mesh(bokehGeometry, material);
    mote.position.set(
      -6 + ((index * 2.37) % 12),
      0.4 + ((index * 1.73) % 5),
      -5 + ((index * 2.11) % 9),
    );
    mote.userData.phase = index * 0.47;
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
    if (!reducedMotion) {
      mote.position.y += Math.sin(elapsed * 0.48 + phase) * 0.0007;
      mote.position.x += Math.cos(elapsed * 0.21 + phase) * 0.0004;
    }
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
    dispose() {
      root.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
    },
  };
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

function setAlbumScreenVisual(screen, visual, options) {
  if (screen.visual?.id === visual?.id && screen.mediaResource) {
    screen.visual = visual;
    screen.hitTarget.userData.visual = visual;
    return;
  }
  disposeScreenMediaResource(screen.mediaResource);
  screen.visual = visual;
  screen.hitTarget.userData.visual = visual;
  screen.root.userData.visual = visual;
  if (!visual) {
    const texture = createVisualTitleTexture({ title: "Place a record", kindLabel: "ECHO SURFACE STANDBY" });
    screen.mediaResource = { key: "standby", texture, dispose: () => texture.dispose() };
  } else {
    screen.mediaResource = createScreenMediaResource(visual, {
      ...options,
      fallbackTexture: createVisualTitleTexture(visual),
    });
  }
  screen.screenMaterial.map = screen.mediaResource.texture;
  screen.screenMaterial.needsUpdate = true;
}

function updateAlbumScreen(screen, { playback, elapsed, reducedMotion, focus }) {
  const resource = screen.mediaResource;
  const visual = screen.visual;
  if (resource?.video && visual) {
    const video = resource.video;
    const start = Number(visual.startSeconds || 0);
    const sourceStart = Number(visual.sourceStartSeconds || 0);
    const duration = Math.max(0.1, Number(visual.durationSeconds || video.duration || 4));
    const elapsedInVisual = Math.max(0, playback.currentTime - start);
    const expected = sourceStart + (visual.clockLocked === false ? elapsedInVisual % duration : Math.min(elapsedInVisual, duration - 0.04));
    if (Number.isFinite(video.duration) && video.duration > 0 && Math.abs((video.currentTime || 0) - expected) > MEDIA_SYNC_TOLERANCE_SECONDS) {
      try { video.currentTime = Math.min(video.duration - 0.03, Math.max(0, expected)); } catch {}
    }
    if (document.hidden) {
      if (!video.paused) video.pause();
    } else if (playback.playing && visual.clockLocked !== false) {
      if (video.paused) video.play().catch(() => {});
    } else if (!playback.playing && !video.paused) {
      video.pause();
    } else if (visual.clockLocked === false && video.paused) {
      video.play().catch(() => {});
    }
    resource.texture.needsUpdate = video.readyState >= 2;
  }
  screen.glow.material.opacity = focus
    ? 0.11 + (reducedMotion ? 0 : Math.sin(elapsed * 1.2) * 0.025)
    : 0.065;
}

function createScreenMediaResource(visual, { apiBase, renderer, fallbackTexture }) {
  const videoUri = visual.videoUri || (/\.mp4(?:$|\?)/i.test(visual.mediaUri || "") ? visual.mediaUri : "");
  const imageUri = visual.imageUri || visual.posterUri || (!videoUri ? visual.mediaUri : "");
  if (videoUri) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.loop = visual.clockLocked === false;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = resolveGardenMediaUri(videoUri, apiBase);
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    video.load();
    return {
      key: `${visual.id}:${videoUri}`,
      texture,
      video,
      dispose() {
        video.pause();
        video.removeAttribute("src");
        video.load();
        texture.dispose();
        fallbackTexture?.dispose?.();
      },
    };
  }
  if (imageUri) {
    const texture = fallbackTexture;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let loadedTexture = null;
    loader.load(
      resolveGardenMediaUri(imageUri, apiBase),
      (loaded) => {
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
      key: `${visual.id}:${imageUri}`,
      texture,
      dispose() {
        loadedTexture?.dispose?.();
        texture.dispose();
      },
    };
  }
  return {
    key: `${visual.id}:fallback`,
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
    dragStart: new THREE.Vector3(),
    hovered: false,
    selected: false,
    placed: false,
    labelTexture,
    coverTexture: null,
    textureUri: "",
  };
}

function disposeRecordEntry(entry) {
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
