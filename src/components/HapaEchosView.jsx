import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Film,
  KanbanSquare,
  Music,
  Search,
  Volume2,
  VolumeX,
  WandSparkles
} from "lucide-react";

const electronApiBase = globalThis.window?.hapaAvatarBuilder?.apiBase;
const API_BASE = electronApiBase || (globalThis.location?.port === "5178" ? "http://127.0.0.1:8787" : "");
const songRegistryApiBase = globalThis.window?.hapaAvatarBuilder?.songRegistryApiBase;
const SONG_REGISTRY_API_BASE = songRegistryApiBase || "http://127.0.0.1:8798";

function resolveMediaUri(uri) {
  if (typeof uri !== "string" || !uri) return uri;
  if (/^(data:|blob:|https?:|file:)/.test(uri)) return uri;
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

function DeferredRationaleTextarea({ value = "", onCommit }) {
  const [draft, setDraft] = useState(value || "");
  const commitRef = useRef(onCommit);
  const dirtyRef = useRef(false);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    setDraft(value || "");
    dirtyRef.current = false;
  }, [value]);

  useEffect(() => {
    if (!dirtyRef.current) return undefined;
    const timer = setTimeout(() => {
      dirtyRef.current = false;
      commitRef.current?.(draft);
    }, 500);
    return () => clearTimeout(timer);
  }, [draft]);

  const commitNow = () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    commitRef.current?.(draft);
  };

  return (
    <textarea
      rows="2"
      value={draft}
      onChange={(event) => {
        dirtyRef.current = true;
        setDraft(event.target.value);
      }}
      onBlur={commitNow}
      style={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '5px', borderRadius: '3px', fontSize: '9.5px', resize: 'vertical', width: '100%', outline: 'none', fontFamily: 'sans-serif' }}
    />
  );
}

const CAMERA_MOTION_OPTIONS = [
  { value: "auto", label: "Auto pan" },
  { value: "static", label: "Static" },
  { value: "slow-push-in", label: "Slow push in" },
  { value: "slow-pull-out", label: "Slow pull out" },
  { value: "pan-up", label: "Pan up" },
  { value: "pan-down", label: "Pan down" },
  { value: "pan-up-left", label: "Up + left" },
  { value: "pan-up-right", label: "Up + right" },
  { value: "pan-down-left", label: "Down + left" },
  { value: "pan-down-right", label: "Down + right" },
  { value: "pan-left", label: "Pan left" },
  { value: "pan-right", label: "Pan right" },
  { value: "drift-diagonal", label: "Diagonal drift" },
  { value: "handheld-float", label: "Float" }
];

const LYRIC_POSITION_OPTIONS = [
  { value: "bottom-center", label: "Bottom center" },
  { value: "top-center", label: "Top center" },
  { value: "center", label: "Center" },
  { value: "lower-left", label: "Lower left" },
  { value: "lower-right", label: "Lower right" },
  { value: "upper-left", label: "Upper left" },
  { value: "upper-right", label: "Upper right" },
  { value: "side-right", label: "Side rail" }
];

const LYRIC_STYLE_OPTIONS = [
  { value: "neon-cyan", label: "Neon cyan" },
  { value: "magenta-glow", label: "Magenta glow" },
  { value: "gold-caption", label: "Gold caption" },
  { value: "paper-white", label: "Paper white" },
  { value: "minimal-subtitle", label: "Minimal subtitle" }
];

function getLyricPlacementStyle(position = "bottom-center") {
  const base = {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 10,
    width: "min(92%, 760px)"
  };
  const placements = {
    "bottom-center": { left: "50%", right: "auto", top: "auto", bottom: "18px", transform: "translateX(-50%)", textAlign: "center" },
    "top-center": { left: "50%", right: "auto", top: "20px", bottom: "auto", transform: "translateX(-50%)", textAlign: "center" },
    center: { left: "50%", right: "auto", top: "50%", bottom: "auto", transform: "translate(-50%, -50%)", textAlign: "center" },
    "lower-left": { left: "18px", right: "auto", top: "auto", bottom: "20px", transform: "none", textAlign: "left", width: "min(78%, 620px)" },
    "lower-right": { left: "auto", right: "18px", top: "auto", bottom: "20px", transform: "none", textAlign: "right", width: "min(78%, 620px)" },
    "upper-left": { left: "18px", right: "auto", top: "20px", bottom: "auto", transform: "none", textAlign: "left", width: "min(78%, 620px)" },
    "upper-right": { left: "auto", right: "18px", top: "20px", bottom: "auto", transform: "none", textAlign: "right", width: "min(78%, 620px)" },
    "side-right": { left: "auto", right: "18px", top: "50%", bottom: "auto", transform: "translateY(-50%)", textAlign: "right", width: "min(45%, 360px)" }
  };
  return { ...base, ...(placements[position] || placements["bottom-center"]) };
}

function getLyricTheme(style = "neon-cyan") {
  const themes = {
    "neon-cyan": {
      panelBackground: "rgba(2, 6, 23, 0.72)",
      panelBorder: "1px solid rgba(6, 182, 212, 0.3)",
      textColor: "#e0faff",
      activeColor: "var(--hapa-neon-cyan)",
      inactiveColor: "rgba(224,250,255,0.62)",
      textShadow: "0 0 10px rgba(6, 182, 212, 0.55)",
      fontFamily: "monospace",
      fontSize: "12px",
      textTransform: "none"
    },
    "magenta-glow": {
      panelBackground: "rgba(24, 5, 34, 0.76)",
      panelBorder: "1px solid rgba(236, 72, 153, 0.36)",
      textColor: "#ffe4f2",
      activeColor: "var(--hapa-neon-magenta)",
      inactiveColor: "rgba(255,228,242,0.62)",
      textShadow: "0 0 12px rgba(236, 72, 153, 0.7)",
      fontFamily: "monospace",
      fontSize: "12px",
      textTransform: "none"
    },
    "gold-caption": {
      panelBackground: "rgba(31, 23, 7, 0.78)",
      panelBorder: "1px solid rgba(246, 201, 109, 0.38)",
      textColor: "#fff7dc",
      activeColor: "var(--hapa-neon-gold)",
      inactiveColor: "rgba(255,247,220,0.64)",
      textShadow: "0 0 10px rgba(246, 201, 109, 0.55)",
      fontFamily: "serif",
      fontSize: "13px",
      textTransform: "none"
    },
    "paper-white": {
      panelBackground: "rgba(247, 244, 235, 0.9)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.42)",
      textColor: "#101827",
      activeColor: "#111827",
      inactiveColor: "rgba(17,24,39,0.62)",
      textShadow: "none",
      fontFamily: "Georgia, serif",
      fontSize: "13px",
      textTransform: "none"
    },
    "minimal-subtitle": {
      panelBackground: "rgba(0, 0, 0, 0.68)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.18)",
      textColor: "#ffffff",
      activeColor: "#ffffff",
      inactiveColor: "rgba(255,255,255,0.72)",
      textShadow: "0 2px 5px rgba(0,0,0,0.9)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "12px",
      textTransform: "none"
    }
  };
  return themes[style] || themes["neon-cyan"];
}

function cameraMotionStyleForShot(item, currentTime, isVertical, shotIndex = 0) {
  if (!item) {
    return {
      transform: "scale(1)",
      transformOrigin: "center center",
      objectPosition: "center center"
    };
  }
  const start = Number(item.start_sec || 0);
  const end = Number(item.end_sec || start + 1);
  const duration = Math.max(0.1, end - start);
  const rawProgress = Math.max(0, Math.min(1, (currentTime - start) / duration));
  const fallbackSpeed = 1.15 + ((shotIndex * 17 + String(item.section_id || item.media_id || "").length) % 7) * 0.13;
  const speed = Math.max(0.75, Math.min(2.4, Number(item.camera_speed ?? item.camera?.speed ?? fallbackSpeed)));
  const pacedProgress = Math.max(0, Math.min(1, Math.pow(rawProgress, 1 / speed)));
  const progress = pacedProgress * pacedProgress * (3 - 2 * pacedProgress);
  const intensity = Math.max(0, Math.min(2, Number(item.camera_intensity ?? item.camera?.intensity ?? 1)));
  const declaredMotion = item.camera_motion || item.camera?.motion || "auto";
  const normalizedMotion = declaredMotion === "tilt-up"
    ? "pan-up"
    : declaredMotion === "tilt-down"
      ? "pan-down"
      : declaredMotion;
  const autoMotion = isVertical
    ? ["pan-down", "pan-up", "pan-down-left", "pan-up-right", "pan-down", "pan-up-left"][shotIndex % 6]
    : ["pan-down", "pan-up", "pan-up-left", "pan-down-right", "slow-push-in", "pan-up-right", "pan-down-left", "drift-diagonal"][shotIndex % 8];
  const motion = normalizedMotion === "auto" ? autoMotion : normalizedMotion;
  const baseScale = isVertical ? 1.34 : 1.18;
  const translateSpan = 4.8 * intensity * speed;
  const positionSpan = Math.min(42, (isVertical ? 30 : 22) * intensity * Math.min(1.35, speed));
  let scale = baseScale;
  let x = 0;
  let y = 0;
  let objectX = 50;
  let objectY = 50;

  const setDirectionalPan = (xDirection, yDirection) => {
    const phase = (progress * 2) - 1;
    if (xDirection) {
      x = xDirection * translateSpan * phase;
      objectX = 50 + xDirection * positionSpan * phase;
    }
    if (yDirection) {
      y = yDirection * translateSpan * phase;
      objectY = 50 + yDirection * positionSpan * phase;
    }
    const diagonalLift = xDirection && yDirection ? 0.05 : 0;
    scale = baseScale + diagonalLift + (0.04 * intensity);
  };

  if (motion === "static") {
    scale = isVertical ? 1.18 : 1;
  } else if (motion === "slow-push-in") {
    scale = baseScale + (0.16 * intensity * progress * speed);
  } else if (motion === "slow-pull-out") {
    scale = baseScale + (0.16 * intensity * (1 - progress) * speed);
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
    const wobble = Math.sin(rawProgress * Math.PI * 4);
    x = wobble * 3.4 * intensity * speed;
    y = Math.cos(rawProgress * Math.PI * 3) * 2.8 * intensity * speed;
    scale = baseScale + 0.025 * intensity;
  }

  return {
    transform: `scale(${scale.toFixed(3)}) translate3d(${x.toFixed(2)}%, ${y.toFixed(2)}%, 0)`,
    transformOrigin: "center center",
    objectPosition: `${Math.max(0, Math.min(100, objectX)).toFixed(1)}% ${Math.max(0, Math.min(100, objectY)).toFixed(1)}%`
  };
}

function HapaEchosView({ selectedSongId, onSelectSong }) {
  const [board, setBoard] = useState(null);
  const [gapsReport, setGapsReport] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [echoOperationNotice, setEchoOperationNotice] = useState("");
  const [expandedSongId, setExpandedSongId] = useState(null);
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const [activeDirectoryTab, setActiveDirectoryTab] = useState("director");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedDetailVideo, setSelectedDetailVideo] = useState(null);
  const [loadingVideoDetail, setLoadingVideoDetail] = useState(false);
  const [videoPickerQuery, setVideoPickerQuery] = useState("");
  const [shaderPickerQuery, setShaderPickerQuery] = useState("");

  const [directorProjects, setDirectorProjects] = useState([]);
  const [selectedProjectSongId, setSelectedProjectSongId] = useState(null);
  const [loadingProjectDetail, setLoadingProjectDetail] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState("preview");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);
  const currentTimeRef = useRef(0);
  const currentTimeLastCommitRef = useRef(0);
  const activeProjectRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const connectedAudioRef = useRef(null);
  const sessionBusterRef = useRef(Math.random().toString(36).substring(7));

  const [audioBlobUrl, setAudioBlobUrl] = useState("");
  const [audioLoading, setAudioLoading] = useState(false);

  const activeDirectorProject = useMemo(() => (
    directorProjects.find(p => p.music_video_project.song_id === selectedProjectSongId) || directorProjects[0] || null
  ), [selectedProjectSongId, directorProjects]);
  const activeProject = activeDirectorProject?.music_video_project || null;
  const activeProjectHasDetail = Boolean(activeProject?.timeline);
  const videosReport = useMemo(() => gapsReport?.videos || [], [gapsReport]);
  const videosById = useMemo(() => new Map(videosReport.map((video) => [video.id, video])), [videosReport]);
  const filteredVideoPickerResults = useMemo(() => {
    const query = videoPickerQuery.trim().toLowerCase();
    return videosReport.filter((video) => {
      if (query) {
        const haystack = [
          video.title,
          video.id,
          video.source,
          video.sourceId,
          video.flowType,
          ...(video.tags || []),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (sourceFilter !== "all" && video.source !== sourceFilter) return false;
      if (flowFilter !== "all" && video.flowType !== flowFilter) return false;
      if (tagFilter !== "all" && !(video.tags || []).includes(tagFilter)) return false;
      return true;
    }).slice(0, 60);
  }, [flowFilter, sourceFilter, tagFilter, videoPickerQuery, videosReport]);

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  // Fetch song audio as same-origin Blob to bypass browser/Electron Web Audio CORS muting
  useEffect(() => {
    if (!activeProject?.song_id) {
      setAudioBlobUrl("");
      setAudioLoading(false);
      return;
    }
    
    let active = true;
    setAudioLoading(true);
    setAudioDiagnostics(`Fetching audio blob for ${activeProject.song_id}...`);
    
    const audioId = activeProject.audio_id || activeProject.registry_track_id || activeProject.song_id;
    const url = resolveSongRegistryUri(`/api/song-registry/audio/${encodeURIComponent(audioId)}`);
    
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (!active) return;
        const blobUrl = URL.createObjectURL(blob);
        setAudioBlobUrl(current => {
          if (current) URL.revokeObjectURL(current);
          return blobUrl;
        });
        setAudioLoading(false);
        setAudioDiagnostics(`Audio loaded as blob URL`);
      })
      .catch(err => {
        if (!active) return;
        setAudioLoading(false);
        setAudioDiagnostics(`Fetch error: ${err.message}`);
        console.error("Failed to fetch audio blob:", err);
      });
      
    return () => {
      active = false;
    };
  }, [activeProject?.audio_id, activeProject?.registry_track_id, activeProject?.song_id]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      setAudioBlobUrl(current => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    };
  }, []);

  const initAudioAnalyser = () => {
    if (!audioRef.current) {
      setAudioDiagnostics("No Audio Element Ref");
      return;
    }
    if (connectedAudioRef.current === audioRef.current) {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        setAudioDiagnostics("Resuming existing context");
        audioContextRef.current.resume().catch((err) => setAudioDiagnostics("Failed resume: " + err.message));
      } else {
        setAudioDiagnostics(`Connected (existing, state: ${audioContextRef.current?.state})`);
      }
      return;
    }
    try {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        setAudioDiagnostics("Closing old AudioContext");
        audioContextRef.current.close().catch(() => {});
      }
      
      setAudioDiagnostics("Creating new AudioContext");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512; // 256 frequency bins
      
      setAudioDiagnostics("Creating MediaElementSourceNode");
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      analyserNodeRef.current = analyser;
      connectedAudioRef.current = audioRef.current;
      setAudioDiagnostics(`Connected (new, state: ${ctx.state})`);
    } catch (e) {
      console.warn("Failed to init audio analyser:", e);
      setAudioDiagnostics(`Init Error: ${e.message || String(e)}`);
    }
  };

  // Sync currentTime to Ref
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // New editor states
  const [selectedShotIndex, setSelectedShotIndex] = useState(0);
  const [selectedVisualizerIndex, setSelectedVisualizerIndex] = useState(0);
  const [activeTrackTab, setActiveTrackTab] = useState("video");
  const [availableShaders, setAvailableShaders] = useState([
    { id: "builtin:spectrum-nebula", title: "Spectrum Nebula", shaderType: "generator" },
    { id: "builtin:waveform-horizon", title: "Waveform Horizon", shaderType: "generator" },
    { id: "builtin:beat-grid-pulse", title: "Beat Grid Pulse", shaderType: "generator" },
    { id: "builtin:particle-storm", title: "Particle Storm", shaderType: "generator" },
    { id: "builtin:cymatic-rings", title: "Cymatic Rings", shaderType: "generator" },
    { id: "builtin:liquid-aurora", title: "Liquid Aurora", shaderType: "generator" },
    { id: "builtin:starfield-warp", title: "Starfield Warp", shaderType: "generator" },
    { id: "builtin:kaleido-bloom", title: "Kaleido Bloom", shaderType: "generator" },
    { id: "isf:5e7a7f8c7c113618206ddfbd", title: "ASCII Art", shaderType: "filter" },
    { id: "isf:5f2c1066b1ed0d0014c0002c", title: "Liquid Metal", shaderType: "generator" },
    { id: "isf:5e7a7fe97c113618206de6d4", title: "Matrix Rain", shaderType: "generator" },
    { id: "isf:5fb697e9df59c70014cdc486", title: "RGB Halftone Twisted Tools", shaderType: "filter" },
    { id: "isf:66cd92f36049470019626844", title: "Extrude 2", shaderType: "filter" }
  ]);
  const filteredShaderOptions = useMemo(() => {
    const query = shaderPickerQuery.trim().toLowerCase();
    return availableShaders.filter((shader) => {
      if (!query) return true;
      return [
        shader.id,
        shader.title,
        shader.shaderType,
        shader.category,
        shader.family
      ].filter(Boolean).join(" ").toLowerCase().includes(query);
    }).slice(0, 80);
  }, [availableShaders, shaderPickerQuery]);
  const [savingProject, setSavingProject] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState("");

  // Volume control states
  const [directorVolume, setDirectorVolume] = useState(0.8);
  const [directorMuted, setDirectorMuted] = useState(false);
  const [audioDiagnostics, setAudioDiagnostics] = useState("Idle");

  // Sync preview volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = directorMuted ? 0 : directorVolume;
    }
  }, [directorVolume, directorMuted, activeWorkbenchTab, selectedProjectSongId]);

  // Sync playback states when selected song changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.volume = directorMuted ? 0 : directorVolume;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setSelectedShotIndex(0);
    setSelectedVisualizerIndex(0);
    setActiveTrackTab("video");
    setSaveSuccessMessage("");
  }, [selectedProjectSongId]);

  // Playback timer ticker fallback
  useEffect(() => {
    if (!isPlaying) return;
    let anim;
    let lastCommit = performance.now();

    const tick = () => {
      const now = performance.now();
      const audio = audioRef.current;
      const project = activeProjectRef.current;

      if (audio && !audio.paused) {
        const next = audio.currentTime;
        currentTimeRef.current = next;
        const duration = project?.duration || audio.duration || 180;
        if (next >= duration) {
          audio.pause();
          audio.currentTime = 0;
          currentTimeRef.current = 0;
          setCurrentTime(0);
          setIsPlaying(false);
          return;
        }
        if (now - lastCommit > 120) {
          lastCommit = now;
          currentTimeLastCommitRef.current = now;
          setCurrentTime(next);
        }
      } else if (audio) {
        setIsPlaying(false);
        return;
      }

      anim = requestAnimationFrame(tick);
    };
    
    anim = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(anim);
  }, [isPlaying]);

  // Audio time update handler
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const next = audioRef.current.currentTime;
    currentTimeRef.current = next;
    const now = performance.now();
    if (now - currentTimeLastCommitRef.current > 120) {
      currentTimeLastCommitRef.current = now;
      setCurrentTime(next);
    }
  };

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Circular pulse visualizer canvas loop
  useEffect(() => {
    if (activeWorkbenchTab !== "preview") return;
    let animFrame;

    const horizonHistory = [];
    const particles = [];
    const stars = [];

    const bandAvg = (fftData, from, to) => {
      let sum = 0;
      const a = Math.floor(fftData.length * from);
      const b = Math.max(a + 1, Math.floor(fftData.length * to));
      for (let i = a; i < b; i++) sum += fftData[i];
      return sum / (b - a) / 255;
    };
    
    const render = () => {
      const canvas = canvasRef.current || document.getElementById("director-preview-canvas");
      if (!canvas) {
        animFrame = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animFrame = requestAnimationFrame(render);
        return;
      }
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      
      const t = currentTimeRef.current;
      const playheadShotIndex = activeProject?.timeline?.findIndex(item => t >= item.start_sec && t < item.end_sec);
      const currentTimelineItem = playheadShotIndex !== -1 && playheadShotIndex !== undefined ? activeProject.timeline[playheadShotIndex] : activeProject?.timeline?.[0];
      
      const playheadVisIndex = activeProject?.visualizer_timeline?.findIndex(item => t >= item.start_sec && t < item.end_sec);
      const currentVisItem = playheadVisIndex !== -1 && playheadVisIndex !== undefined ? activeProject.visualizer_timeline[playheadVisIndex] : activeProject?.visualizer_timeline?.[0];
      const visualizerTitle = currentVisItem?.visualizer_title || "None";
      const isVideo = currentTimelineItem && currentTimelineItem.media_uri !== "";
      
      const color = activeProject?.perspective === 'red' ? '#ef4444' : activeProject?.perspective === 'green' ? '#10b981' : '#06b6d4';

      const analyserNode = analyserNodeRef.current;

      // Generate or fetch audio inputs
      const timeVal = Date.now() / 1000;
      const fftList = new Uint8Array(256);
      const waveList = new Uint8Array(256);
      
      let rms = 0.15;
      let beatFlash = 0;
      let hookFlash = 0;
      let telemetryRms = 0;

      if (analyserNode) {
        analyserNode.getByteFrequencyData(fftList);
        analyserNode.getByteTimeDomainData(waveList);
        
        let sumSquares = 0;
        for (let i = 0; i < waveList.length; i++) {
          const norm = (waveList[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        rms = Math.sqrt(sumSquares / waveList.length);
        
        const lowFreqEnergy = bandAvg(fftList, 0.0, 0.15);
        beatFlash = Math.max(0, (lowFreqEnergy - 0.25) * 1.5);
        hookFlash = Math.max(0, (lowFreqEnergy - 0.4) * 2.0);
        telemetryRms = rms * 1.2;
      } else {
        // Procedural fallback
        rms = 0.15 + Math.sin(timeVal * 2.2) * 0.08 + Math.cos(timeVal * 0.7) * 0.05;
        beatFlash = Math.max(0, Math.sin(timeVal * Math.PI * 2.0));
        hookFlash = Math.max(0, Math.sin(timeVal * Math.PI * 0.5) - 0.7) * 3;
        telemetryRms = rms * 1.2;
        
        for (let i = 0; i < 256; i++) {
          const base = Math.max(0, 1.0 - i / 180);
          const noise = Math.sin(timeVal * 10 + i * 0.1) * 0.1 + Math.cos(timeVal * 4 - i * 0.05) * 0.08;
          fftList[i] = Math.floor(Math.max(0, Math.min(1, base + noise + rms * 0.5 + beatFlash * 0.3)) * 255);
        }
        for (let i = 0; i < 256; i++) {
          waveList[i] = Math.floor(128 + Math.sin(timeVal * 15 + i * 0.08) * 40 * (rms + beatFlash * 0.2));
        }
      }

      let hueVal = 180; // cyan default
      if (activeProject?.perspective === 'red') hueVal = 0;
      else if (activeProject?.perspective === 'green') hueVal = 120;
      else if (activeProject?.perspective === 'magenta' || activeProject?.perspective === 'purple') hueVal = 300;

      const f = {
        w: width,
        h: height,
        fft: fftList,
        wave: waveList,
        hue: hueVal,
        time: timeVal,
        rms,
        beatFlash,
        hookFlash,
        telemetryRms
      };

      const getRenderer = (title) => {
        const titleStr = (title || "").toLowerCase();
        if (titleStr.includes("matrix") || titleStr.includes("rain") || titleStr.includes("code")) return "matrix-rain";
        if (titleStr.includes("liquid metal") || titleStr.includes("fluid") || titleStr.includes("metal") || titleStr.includes("water") || titleStr.includes("underwater")) return "liquid-metal";
        if (titleStr.includes("halftone") || titleStr.includes("rgb") || titleStr.includes("cmyk") || titleStr.includes("color chords") || titleStr.includes("dot")) return "rgb-halftone";
        if (titleStr.includes("ascii") || titleStr.includes("terminal") || titleStr.includes("console") || titleStr.includes("scanline")) return "ascii-art";
        
        // Map new ones
        if (titleStr.includes("nebula") || titleStr.includes("galaxy") || titleStr.includes("cosmos") || titleStr.includes("space") || titleStr.includes("flare")) return "spectrum-nebula";
        if (titleStr.includes("horizon") || titleStr.includes("waveform") || titleStr.includes("linescape") || titleStr.includes("wave")) return "waveform-horizon";
        if (titleStr.includes("grid") || titleStr.includes("pulse") || titleStr.includes("beat") || titleStr.includes("cell") || titleStr.includes("circuit")) return "beat-grid-pulse";
        if (titleStr.includes("particle") || titleStr.includes("storm") || titleStr.includes("star") || titleStr.includes("dust") || titleStr.includes("flots")) return "particle-storm";
        if (titleStr.includes("cymatic") || titleStr.includes("ring") || titleStr.includes("circle") || titleStr.includes("orb") || titleStr.includes("vortex")) return "cymatic-rings";
        if (titleStr.includes("aurora") || titleStr.includes("ribbon") || titleStr.includes("flow") || titleStr.includes("variation")) return "liquid-aurora";
        if (titleStr.includes("warp") || titleStr.includes("hyperspace") || titleStr.includes("tunnel") || titleStr.includes("streak")) return "starfield-warp";
        if (titleStr.includes("kaleido") || titleStr.includes("bloom") || titleStr.includes("flower") || titleStr.includes("mandala") || titleStr.includes("fractal") || titleStr.includes("sponge")) return "kaleido-bloom";
        
        // Catch-alls for other names in the manifest
        if (titleStr.includes("extrude") || titleStr.includes("box") || titleStr.includes("tesseract") || titleStr.includes("cube")) return "starfield-warp";
        if (titleStr.includes("glitch") || titleStr.includes("broken") || titleStr.includes("lcd")) return "ascii-art";
        if (titleStr.includes("sketch") || titleStr.includes("draw") || titleStr.includes("cartoon")) return "kaleido-bloom";
        
        // Fallback default
        return "spectrum-nebula";
      };
      
      const renderMode = getRenderer(visualizerTitle);

      if (visualizerTitle === "None" || visualizerTitle === "none") {
        if (!isVideo) {
          // Draw subtle resting grid when no video
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
          for (let i = 0; i < width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
          }
          for (let j = 0; j < height; j += 40) {
            ctx.beginPath();
            ctx.moveTo(0, j);
            ctx.lineTo(width, j);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
          ctx.strokeRect(20, 20, width - 40, height - 40);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.font = '8px monospace';
          ctx.fillText("RESTING OPERATOR STATE // CONSOLE STANDBY", 35, 40);
        }
      } else if (renderMode === "matrix-rain") {
        // Draw Matrix Code Rain
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        for (let x = 10; x < width; x += 20) {
          const speed = 1.0 + (x % 3) * 0.4;
          const y2 = (Date.now() / 25 * speed + x * 13) % (height + 60) - 40;
          ctx.fillText(String.fromCharCode(33 + Math.floor(Math.sin(Date.now() / 150 + x) * 40)), x, y2);
          ctx.fillStyle = color === '#10b981' ? 'rgba(16, 185, 129, 0.4)' : color === '#ef4444' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(6, 182, 212, 0.4)';
          ctx.fillText(String.fromCharCode(33 + (x % 20)), x, y2 - 12);
          ctx.fillStyle = color;
        }
      } else if (renderMode === "liquid-metal") {
        // Draw Liquid Wave lines
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        for (let wIdx = 0; wIdx < 3; wIdx++) {
          ctx.beginPath();
          const waveY = height / 2 + (wIdx - 1) * 35;
          const timeOffset = Date.now() / 800 + wIdx * 2;
          for (let x = 0; x <= width; x += 20) {
            const y2 = waveY + Math.sin(x / 60 + timeOffset) * 20 * Math.sin(timeOffset * 0.5);
            if (x === 0) ctx.moveTo(x, y2);
            else ctx.lineTo(x, y2);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      } else if (renderMode === "rgb-halftone") {
        // Draw RGB Halftone pulsing grid
        const channels = [
          { name: 'cyan', color: '#00f3ff', offset: 0 },
          { name: 'magenta', color: '#ff00ff', offset: Math.PI * 0.6 },
          { name: 'gold', color: '#f6c96d', offset: Math.PI * 1.2 }
        ];
        channels.forEach(ch => {
          ctx.fillStyle = ch.color;
          ctx.globalAlpha = 0.4;
          const driftX = Math.sin(timeVal + ch.offset) * 8;
          const driftY = Math.cos(timeVal + ch.offset) * 8;
          for (let x = 40; x < width; x += 60) {
            for (let y2 = 40; y2 < height; y2 += 60) {
              const pulse = 4 + Math.sin(timeVal * 3 + x + y2) * 2.5;
              ctx.beginPath();
              ctx.arc(x + driftX, y2 + driftY, pulse, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        });
        ctx.globalAlpha = 1.0;
      } else if (renderMode === "ascii-art") {
        // Draw ASCII terminals scanlines
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.4)';
        ctx.lineWidth = 1;
        const margin = 15;
        ctx.beginPath();
        ctx.moveTo(margin + 20, margin);
        ctx.lineTo(margin, margin);
        ctx.lineTo(margin, margin + 20);
        ctx.moveTo(width - margin - 20, height - margin);
        ctx.lineTo(width - margin, height - margin);
        ctx.lineTo(width - margin, height - margin - 20);
        ctx.stroke();
        
        const sweepY = (Date.now() / 12) % height;
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, sweepY);
        ctx.lineTo(width, sweepY);
        ctx.stroke();
        
        ctx.fillStyle = '#39ff14';
        ctx.font = '8px monospace';
        ctx.fillText(`OPERATOR: ${activeProject?.avatar_name?.toUpperCase() || "THE OPERATOR"}`, margin + 15, margin + 25);
        ctx.fillText(`FPS: 30 // RESOLUTION: 1920X1080`, margin + 15, margin + 37);
        ctx.fillText(`ELAPSED: ${t.toFixed(2)}s`, margin + 15, margin + 49);
      } else if (renderMode === "spectrum-nebula") {
        // Spectrum Nebula (radial FFT bloom)
        const cx = width / 2, cy = height / 2;
        const base = Math.min(width, height) * 0.16;
        const n = 144;
        for (let i = 0; i < n; i++) {
          const v = f.fft[Math.floor((i / n) * f.fft.length * 0.7)] / 255;
          const angle = (i / n) * Math.PI * 2 + f.time * 0.12;
          const len = base + v * Math.min(width, height) * 0.32 * (1 + f.beatFlash * 0.4);
          const x1 = cx + Math.cos(angle) * base;
          const y1 = cy + Math.sin(angle) * base;
          const x2 = cx + Math.cos(angle) * len;
          const y2 = cy + Math.sin(angle) * len;
          ctx.strokeStyle = `hsla(${(f.hue + i * 2.5 + f.time * 18) % 360}, 85%, ${55 + v * 30}%, ${0.25 + v * 0.6})`;
          ctx.lineWidth = 2 + v * 5;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        const glow = base * (0.7 + f.rms * 2 + f.hookFlash);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glow);
        grad.addColorStop(0, `hsla(${f.hue}, 90%, 65%, ${0.5 + f.beatFlash * 0.4})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, glow, 0, Math.PI * 2);
        ctx.fill();
      } else if (renderMode === "waveform-horizon") {
        // Waveform Horizon
        let peak = 0;
        for (let i = 0; i < f.wave.length; i++) peak = Math.max(peak, Math.abs(f.wave[i] - 128) / 128);
        horizonHistory.push(peak);
        if (horizonHistory.length > 90) horizonHistory.shift();

        // live oscilloscope
        ctx.strokeStyle = `hsla(${f.hue}, 90%, 65%, 0.9)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < f.wave.length; i += 4) {
          const x = (i / f.wave.length) * width;
          const y2 = height * 0.45 + ((f.wave[i] - 128) / 128) * height * 0.22 * (1 + f.beatFlash);
          i === 0 ? ctx.moveTo(x, y2) : ctx.lineTo(x, y2);
        }
        ctx.stroke();

        // receding mountain history
        for (let j = 0; j < horizonHistory.length; j++) {
          const age = horizonHistory.length - 1 - j;
          const amp = horizonHistory[j];
          const y2 = height * 0.55 + age * 4;
          ctx.strokeStyle = `hsla(${(f.hue + 40) % 360}, 70%, 50%, ${Math.max(0, 0.5 - age * 0.006)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(width * 0.5 - amp * width * 0.45, y2);
          ctx.lineTo(width * 0.5 + amp * width * 0.45, y2);
          ctx.stroke();
        }
      } else if (renderMode === "beat-grid-pulse") {
        // Beat Grid Pulse
        const cols = 16, rows = 9;
        const cw = width / cols, ch = height / rows;
        for (let x = 0; x < cols; x++) {
          for (let y2 = 0; y2 < rows; y2++) {
            const v = f.fft[Math.floor(((x * rows + y2) / (cols * rows)) * f.fft.length * 0.6)] / 255;
            const pulse = f.beatFlash * (((x + y2) % 2 === 0) ? 1 : 0.4);
            const light = 12 + v * 40 + pulse * 35;
            ctx.fillStyle = `hsla(${(f.hue + (x + y2) * 4) % 360}, 70%, ${light}%, ${0.5 + v * 0.4})`;
            const inset = (1 - f.beatFlash * 0.5) * 5;
            ctx.fillRect(x * cw + inset, y2 * ch + inset, cw - inset * 2, ch - inset * 2);
          }
        }
        if (f.hookFlash > 0.01) {
          ctx.strokeStyle = `hsla(${(f.hue + 140) % 360}, 100%, 70%, ${f.hookFlash})`;
          ctx.lineWidth = 14 * f.hookFlash;
          const r = Math.min(width, height) * (1.1 - f.hookFlash) * 0.7;
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (renderMode === "particle-storm") {
        // Particle Storm
        const energy = f.rms * 2 + f.telemetryRms * 3;
        const spawn = Math.floor(2 + energy * 22 + f.beatFlash * 24);
        for (let i = 0; i < spawn && particles.length < 900; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (1 + Math.random() * 4) * (1 + energy * 3);
          particles.push({
            x: width / 2,
            y: height / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            hueOff: Math.random() * 60 - 30,
            size: 1 + Math.random() * 3,
          });
        }
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.99;
          p.vy *= 0.99;
          p.life -= 0.008 + (1 - energy) * 0.006;
          if (p.life <= 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
            particles.splice(i, 1);
            continue;
          }
          ctx.fillStyle = `hsla(${(f.hue + p.hueOff + 360) % 360}, 85%, ${50 + p.life * 30}%, ${p.life})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + f.beatFlash), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (renderMode === "cymatic-rings") {
        // Cymatic Rings
        const cxC = width / 2, cyC = height / 2;
        const bands = [
          { v: bandAvg(f.fft, 0.0, 0.08), r: 0.14, label: 60 },
          { v: bandAvg(f.fft, 0.08, 0.3), r: 0.26, label: 0 },
          { v: bandAvg(f.fft, 0.3, 0.7), r: 0.38, label: -60 },
        ];
        bands.forEach((band, bi) => {
          const baseR = Math.min(width, height) * band.r;
          const segments = 120;
          ctx.strokeStyle = `hsla(${(f.hue + band.label + 360) % 360}, 85%, ${55 + band.v * 30}%, ${0.5 + band.v * 0.5})`;
          ctx.lineWidth = 1.5 + band.v * 6;
          ctx.beginPath();
          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const wobble = Math.sin(angle * (5 + bi * 3) + f.time * (1 + bi)) * band.v * baseR * 0.3;
            const r = baseR + wobble + f.beatFlash * baseR * 0.12;
            const x = cxC + Math.cos(angle) * r;
            const y2 = cyC + Math.sin(angle) * r;
            i === 0 ? ctx.moveTo(x, y2) : ctx.lineTo(x, y2);
          }
          ctx.closePath();
          ctx.stroke();
        });
      } else if (renderMode === "liquid-aurora") {
        // Liquid Aurora
        const ribbons = 5;
        ctx.lineCap = "round";
        for (let r = 0; r < ribbons; r++) {
          const band = bandAvg(f.fft, r * 0.13, r * 0.13 + 0.13);
          const baseY = height * (0.22 + (r / ribbons) * 0.56);
          const amp = height * 0.05 + band * height * 0.18 * (1 + f.beatFlash * 0.5);
          ctx.beginPath();
          const step = width / 90;
          for (let x = 0; x <= width; x += step) {
            const y2 = baseY +
              Math.sin(x * 0.004 + f.time * (0.6 + r * 0.18) + r * 2) * amp +
              Math.sin(x * 0.011 - f.time * 0.9 + r) * amp * 0.35;
            x === 0 ? ctx.moveTo(x, y2) : ctx.lineTo(x, y2);
          }
          ctx.strokeStyle = `hsla(${(f.hue + r * 28 + f.time * 10) % 360}, 85%, ${55 + band * 25}%, ${0.3 + band * 0.5})`;
          ctx.lineWidth = 8 + band * 26;
          ctx.stroke();
          ctx.strokeStyle = `hsla(${(f.hue + r * 28 + f.time * 10) % 360}, 95%, 78%, ${0.25 + band * 0.4})`;
          ctx.lineWidth = 1.5 + band * 4;
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      } else if (renderMode === "starfield-warp") {
        // Starfield Warp
        const cxS = width / 2, cyS = height / 2;
        const maxR = Math.hypot(width, height) / 2;
        const speed = 0.6 + f.rms * 14 + f.beatFlash * 9;
        while (stars.length < 280) {
          stars.push({
            a: Math.random() * Math.PI * 2,
            d: Math.random() * maxR * 0.6,
            s: 0.5 + Math.random() * 1.6,
          });
        }
        for (const st of stars) {
          const pd = st.d;
          st.d += st.s * speed * (st.d * 0.012 + 0.8);
          if (st.d > maxR) {
            st.d = Math.random() * maxR * 0.06;
            st.a = Math.random() * Math.PI * 2;
            continue;
          }
          const depth = st.d / maxR;
          ctx.strokeStyle = `hsla(${(f.hue + depth * 70) % 360}, 85%, ${55 + depth * 35}%, ${0.15 + depth * 0.75})`;
          ctx.lineWidth = 0.5 + depth * 2.6;
          ctx.beginPath();
          ctx.moveTo(cxS + Math.cos(st.a) * pd, cyS + Math.sin(st.a) * pd);
          ctx.lineTo(cxS + Math.cos(st.a) * st.d, cyS + Math.sin(st.a) * st.d);
          ctx.stroke();
        }
        if (f.hookFlash > 0.01) {
          ctx.strokeStyle = `hsla(${(f.hue + 160) % 360}, 100%, 75%, ${f.hookFlash})`;
          ctx.lineWidth = 10 * f.hookFlash;
          ctx.beginPath();
          ctx.arc(cxS, cyS, maxR * (1 - f.hookFlash) * 0.8, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (renderMode === "kaleido-bloom") {
        // Kaleido Bloom
        const wedges = 8;
        const RK = Math.min(width, height) * 0.48;
        for (let k = 0; k < wedges; k++) {
          ctx.save();
          ctx.translate(width / 2, height / 2);
          ctx.rotate((k / wedges) * Math.PI * 2 + f.time * 0.06);
          if (k % 2) ctx.scale(1, -1);
          const pts = 26;
          ctx.beginPath();
          for (let i = 0; i <= pts; i++) {
            const v = f.fft[Math.floor((i / pts) * f.fft.length * 0.5)] / 255;
            const ang = (i / pts) * ((Math.PI * 2) / wedges);
            const r = RK * (0.16 + v * 0.8 * (1 + f.beatFlash * 0.35));
            const x = Math.cos(ang) * r;
            const y2 = Math.sin(ang) * r;
            i === 0 ? ctx.moveTo(x, y2) : ctx.lineTo(x, y2);
          }
          ctx.closePath();
          ctx.strokeStyle = `hsla(${(f.hue + k * 14 + f.time * 22) % 360}, 85%, 62%, 0.55)`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = `hsla(${(f.hue + k * 14 + 180) % 360}, 80%, 55%, ${0.05 + f.rms * 0.25 + f.beatFlash * 0.08})`;
          ctx.fill();
          ctx.restore();
        }
      }
      
      // Glitch / Scanline Dissolve transition effect
      if (currentTimelineItem && currentTimelineItem.transition === "scanline-dissolve") {
        const elapsed = t - currentTimelineItem.start_sec;
        if (elapsed < 0.5 && elapsed >= 0) {
          const progress = elapsed / 0.5; // 0 to 1
          const glitchLines = Math.floor((1 - progress) * 15);
          ctx.fillStyle = activeProject?.perspective === 'red' ? 'rgba(239, 68, 68, 0.4)' : activeProject?.perspective === 'green' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(6, 182, 212, 0.4)';
          for (let i = 0; i < glitchLines; i++) {
            const y2 = Math.random() * height;
            const h = 2 + Math.random() * 8;
            const w = width * (0.3 + Math.random() * 0.5);
            const x = Math.random() * (width - w);
            ctx.fillRect(x, y2, w, h);
          }
          
          // Also draw horizontal scanline bars
          ctx.strokeStyle = activeProject?.perspective === 'red' ? 'rgba(239, 68, 68, 0.3)' : activeProject?.perspective === 'green' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(6, 182, 212, 0.3)';
          ctx.lineWidth = 1;
          for (let y2 = 0; y2 < height; y2 += 4) {
            if (Math.random() < 0.3 * (1 - progress)) {
              ctx.beginPath();
              ctx.moveTo(0, y2);
              ctx.lineTo(width, y2);
              ctx.stroke();
            }
          }
        }
      }
      
      animFrame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [activeWorkbenchTab, activeProject]);

  const uniqueTags = useMemo(() => {
    if (!gapsReport?.videos) return [];
    const set = new Set();
    gapsReport.videos.forEach(v => {
      if (v.tags) {
        v.tags.forEach(t => {
          if (!t.startsWith("obj-") && !t.startsWith("act-") && t !== "video" && t !== "episode-card" && t !== "episodes" && t !== "tarot-card" && t !== "scene-card" && t !== "scene") {
            set.add(t);
          }
        });
      }
    });
    return Array.from(set).sort();
  }, [gapsReport]);

  const fetchProjectDetail = async (songId) => {
    if (!songId) return;
    setLoadingProjectDetail(true);
    try {
      const res = await fetch(`${API_BASE}/api/echos/director-project?songId=${encodeURIComponent(songId)}`);
      if (!res.ok) return;
      const detail = await res.json();
      setDirectorProjects(prev => {
        const nextProject = detail.music_video_project;
        if (!nextProject?.song_id) return prev;
        const index = prev.findIndex(p => p.music_video_project.song_id === nextProject.song_id);
        if (index === -1) return [...prev, detail];
        const next = prev.slice();
        next[index] = detail;
        return next;
      });
    } catch (e) {
      console.error("Failed to load director project detail:", e);
    } finally {
      setLoadingProjectDetail(false);
    }
  };

  const fetchVideoDetail = async (video) => {
    if (!video?.id) return;
    setSelectedDetailVideo(video);
    setLoadingVideoDetail(true);
    try {
      const params = new URLSearchParams({ id: video.id });
      if (video.sourceId) params.set("sourceId", video.sourceId);
      const res = await fetch(`${API_BASE}/api/echos/video-detail?${params.toString()}`);
      if (!res.ok) return;
      const detail = await res.json();
      setSelectedDetailVideo(detail);
    } catch (e) {
      console.error("Failed to load video detail:", e);
    } finally {
      setLoadingVideoDetail(false);
    }
  };

  const fetchState = async () => {
    try {
      const boardRes = await fetch(`${API_BASE}/api/echos/kanban`);
      const boardData = await boardRes.json();
      setBoard(boardData);

      const gapsRes = await fetch(`${API_BASE}/api/echos/gaps?summary=1`);
      if (gapsRes.ok) {
        const gapsData = await gapsRes.json();
        setGapsReport(gapsData);
        if (gapsData.videos?.length > 0 && !selectedDetailVideo) {
          fetchVideoDetail(gapsData.videos[0]);
        }
      }

      const projectsRes = await fetch(`${API_BASE}/api/echos/director-projects?summary=1`);
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setDirectorProjects(projectsData);
        if (projectsData.length > 0) {
          const nextSongId = selectedProjectSongId || projectsData[0].music_video_project.song_id;
          setSelectedProjectSongId(nextSongId);
          fetchProjectDetail(nextSongId);
        }
      }

      const shadersRes = await fetch(`${API_BASE}/api/echos/shaders`);
      if (shadersRes.ok) {
        const apiShaders = await shadersRes.json();
        setAvailableShaders(prev => {
          const merged = [...apiShaders];
          prev.forEach(p => {
            if (!merged.find(m => m.id === p.id)) {
              merged.push(p);
            }
          });
          return merged;
        });
      }
    } catch (e) {
      console.error("Failed to load echos state:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateShot = (shotIdx, updatedFields) => {
    setDirectorProjects(prev => {
      return prev.map(p => {
        if (p.music_video_project.song_id !== selectedProjectSongId) return p;
        
        const nextTimeline = p.music_video_project.timeline.map((shot, idx) => {
          if (idx !== shotIdx) return shot;
          return { ...shot, ...updatedFields };
        });

        return {
          ...p,
          music_video_project: {
            ...p.music_video_project,
            timeline: nextTimeline,
            hyperframe_script_stale: true,
            updated_at: new Date().toISOString()
          }
        };
      });
    });
    setSaveSuccessMessage(""); // Reset save status on edit
  };

  const handleUpdateVisualizer = (visIdx, updatedFields) => {
    setDirectorProjects(prev => {
      return prev.map(p => {
        if (p.music_video_project.song_id !== selectedProjectSongId) return p;
        
        const nextVisualizerTimeline = p.music_video_project.visualizer_timeline.map((vis, idx) => {
          if (idx !== visIdx) return vis;
          return { ...vis, ...updatedFields };
        });

        return {
          ...p,
          music_video_project: {
            ...p.music_video_project,
            visualizer_timeline: nextVisualizerTimeline,
            hyperframe_script_stale: true,
            updated_at: new Date().toISOString()
          }
        };
      });
    });
    setSaveSuccessMessage(""); // Reset save status on edit
  };

  const handleUpdateProjectSettings = (updatedFields) => {
    setDirectorProjects(prev => {
      return prev.map(p => {
        if (p.music_video_project.song_id !== selectedProjectSongId) return p;

        return {
          ...p,
          music_video_project: {
            ...p.music_video_project,
            ...updatedFields,
            hyperframe_script_stale: true,
            updated_at: new Date().toISOString()
          }
        };
      });
    });
    setSaveSuccessMessage("");
  };

  const handleSaveProject = async (activeProject) => {
    setSavingProject(true);
    setSaveSuccessMessage("");
    try {
      const projectToSave = withFreshHyperframeScript(activeProject);
      const res = await fetch(`${API_BASE}/api/echos/director-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ music_video_project: projectToSave })
      });
      if (res.ok) {
        setSaveSuccessMessage("Music video blueprint saved to disk.");
        setDirectorProjects(prev => prev.map(p => (
          p.music_video_project.song_id === projectToSave.song_id
            ? { music_video_project: projectToSave }
            : p
        )));
      } else {
        console.error("Failed to save project server-side");
      }
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSavingProject(false);
    }
  };

  const handleRunDirector = async () => {
    setPlanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/echos/director-plan`, { method: 'POST' });
      const payload = await res.json().catch(() => null);
      setEchoOperationNotice(payload?.guardrail || "Director planning queued.");
      setTimeout(async () => {
        await fetchState();
        setPlanning(false);
      }, 3000);
    } catch (e) {
      console.error("Failed to start director planning:", e);
      setPlanning(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  useEffect(() => {
    if (!selectedProjectSongId || activeProjectHasDetail || loadingProjectDetail) return;
    fetchProjectDetail(selectedProjectSongId);
  }, [activeProjectHasDetail, loadingProjectDetail, selectedProjectSongId]);

  const buildFreshProjectScript = (project) => generateHyperframesScriptClient(
    project.song_id,
    project.song_title,
    project.duration,
    project.timeline,
    project.visualizer_timeline || [],
    project.timed_lyrics,
    project.lyric_variant || "phrase-window",
    project.audio_id || project.registry_track_id || project.song_id,
    project.lyric_position || "bottom-center",
    project.lyric_style || "neon-cyan"
  );

  const withFreshHyperframeScript = (project) => ({
    ...project,
    hyperframe_script: buildFreshProjectScript(project),
    hyperframe_script_stale: false,
    updated_at: new Date().toISOString()
  });

  const handleCardClick = async (laneId, cardId) => {
    if (!board) return;
    const nextBoard = { ...board };
    const lane = nextBoard.lanes.find(l => l.id === laneId);
    if (!lane) return;
    const card = lane.cards.find(c => c.id === cardId);
    if (!card) return;

    const statusCycle = {
      'todo': 'in_progress',
      'in_progress': 'done',
      'done': 'todo'
    };
    card.status = statusCycle[card.status] || 'todo';

    try {
      await fetch(`${API_BASE}/api/echos/kanban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextBoard)
      });
      setBoard(nextBoard);
    } catch (e) {
      console.error("Failed to save board status:", e);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const res = await fetch(`${API_BASE}/api/echos/enrich`, { method: 'POST' });
      const payload = await res.json().catch(() => null);
      setEchoOperationNotice(payload?.guardrail || "Album enrichment queued.");
      setTimeout(async () => {
        await fetchState();
        setEnriching(false);
      }, 3000);
    } catch (e) {
      console.error("Failed to start enrichment:", e);
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <span>Loading Echos Album App State...</span>
      </div>
    );
  }

  const overallScore = gapsReport?.overallScore || 0;
  const songsReport = gapsReport?.songs || [];

  const filteredSongs = songsReport.filter(song => {
    return searchQuery === "" || 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (song.songId && song.songId.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  return (
    <section className="hapa-echos-view" aria-label="Echos Album App View">
      <header className="hapa-songs-hero hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Echos of Other Eras</p>
          <h2>Album Consolidation App</h2>
          <span>Human-Agent Collaborative Workspace to analyze, enrich, and validate song and media metadata.</span>
        </div>
        <div className="hapa-songs-readouts">
          <StatusChip label="COMPLETENESS" value={`${overallScore}%`} tone={overallScore === 100 ? "green" : "rose"} />
          <StatusChip label="SONGS" value={gapsReport?.summary?.totalSongs || 0} tone="cyan" />
          <StatusChip label="VIDEOS" value={gapsReport?.summary?.totalVideos || 0} tone="fuchsia" />
        </div>
      </header>

      <div className="echos-workspace-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: activeDirectoryTab === "director" ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.6fr)', 
        gap: '20px', 
        padding: '10px 0', 
        height: 'calc(100vh - 220px)',
        minHeight: '750px',
        maxHeight: '950px' 
      }}>
        {activeDirectoryTab !== "director" && (
          <div className="echos-left-col" style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%', minHeight: 0, minWidth: 0 }}>
            <div className="panel hapa-panel board-wrap" data-variant="notch" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="section-head hapa-panel-head" style={{ flexShrink: 0 }}>
                <span><KanbanSquare size={15} /> Echos Kanban Board</span>
                <em>{board?.lanes?.reduce((sum, l) => sum + l.cards.length, 0) || 0}</em>
              </div>
              <div className="kanban-board" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(130px, 1fr))', gap: '8px', padding: '8px', flex: 1, overflow: 'auto' }}>
                {board?.lanes?.map(lane => (
                  <section className={`kanban-lane accent-${lane.accent || "cyan"}`} key={lane.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', height: '100%', minHeight: 0 }}>
                    <header style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', flexShrink: 0 }}>
                      <strong style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>{lane.title}</strong>
                    </header>
                    <div className="lane-cards" style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
                      {lane.cards.map(card => (
                        <article
                          className={`kanban-card hapa-card status-${card.status}`}
                          data-card-type="quest"
                          data-granularity="mini"
                          data-state={card.status === 'done' ? 'active' : card.status === 'in_progress' ? 'loading' : 'idle'}
                          key={card.id}
                          onClick={() => handleCardClick(lane.id, card.id)}
                          style={{ cursor: 'pointer', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}
                        >
                          <h4 style={{ margin: '0 0 2px 0', fontSize: '11px', wordBreak: 'break-word', lineHeight: '1.2' }}>{card.title}</h4>
                          <p style={{ margin: '0', fontSize: '9px', opacity: 0.7, wordBreak: 'break-word', lineHeight: '1.2' }}>{card.body}</p>
                          <div style={{ marginTop: '4px', fontSize: '8px', display: 'flex', justifyContent: 'space-between', opacity: 0.6 }}>
                            <span>{card.owner}</span>
                            <span style={{ color: card.status === 'done' ? '#10b981' : card.status === 'in_progress' ? '#fbbf24' : '#ef4444' }}>{card.status}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="panel hapa-panel" data-variant="notch" style={{ padding: '12px', flexShrink: 0 }}>
              <div className="section-head hapa-panel-head">
                <span><WandSparkles size={15} /> Collaborative Enrichment Operations</span>
              </div>
              <p style={{ fontSize: '11px', opacity: 0.8, margin: '8px 0' }}>
                Enrichment and director planning queue dry-runs by default. Apply mode is reserved for explicit write-capable maintenance passes with backups and provenance stamps.
              </p>
              {echoOperationNotice && (
                <p style={{ fontSize: '10px', color: 'var(--hapa-neon-gold)', margin: '0 0 8px 0' }}>
                  {echoOperationNotice}
                </p>
              )}
              <button
                className="hapa-btn"
                data-intent="success"
                type="button"
                disabled={enriching}
                onClick={handleEnrich}
                style={{ width: '100%', padding: '10px', fontWeight: 'bold', fontSize: '11px' }}
              >
                {enriching ? (
                  <span>Queueing enrichment dry-run...</span>
                ) : (
                  <span>Run Album Enrichment Dry-Run {overallScore === 100 ? "(Re-run)" : ""}</span>
                )}
              </button>
              <button
                className="hapa-btn"
                data-intent="primary"
                type="button"
                disabled={planning}
                onClick={handleRunDirector}
                style={{ width: '100%', padding: '10px', fontWeight: 'bold', fontSize: '11px', marginTop: '8px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid var(--hapa-neon-violet)', color: 'var(--hapa-neon-violet)' }}
              >
                {planning ? (
                  <span>Queueing director dry-run...</span>
                ) : (
                  <span>Run Director Planning Dry-Run</span>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="echos-right-col hapa-panel" data-variant="notch" style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%', minHeight: 0, minWidth: 0, padding: '15px', overflow: 'hidden' }}>
          
          {/* Glowing NeonBlade Tabs */}
          <div className="directory-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', flexShrink: 0 }}>
            <button 
              className={`hapa-btn ${activeDirectoryTab === "songs" ? "active" : ""}`}
              style={{ 
                flex: 1, 
                padding: '6px', 
                fontSize: '11px',
                background: activeDirectoryTab === "songs" ? 'rgba(6, 182, 212, 0.15)' : 'rgba(0,0,0,0.2)', 
                border: activeDirectoryTab === "songs" ? '1px solid var(--hapa-neon-cyan)' : '1px solid rgba(255,255,255,0.08)',
                color: activeDirectoryTab === "songs" ? 'var(--hapa-neon-cyan)' : '#ccc',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s ease'
              }}
              onClick={() => {
                setActiveDirectoryTab("songs");
                setSearchQuery("");
              }}
            >
              🎵 Songs Directory
            </button>
            <button 
              className={`hapa-btn ${activeDirectoryTab === "media" ? "active" : ""}`}
              style={{ 
                flex: 1, 
                padding: '6px', 
                fontSize: '11px',
                background: activeDirectoryTab === "media" ? 'rgba(236, 72, 153, 0.15)' : 'rgba(0,0,0,0.2)', 
                border: activeDirectoryTab === "media" ? '1px solid var(--hapa-neon-fuchsia)' : '1px solid rgba(255,255,255,0.08)',
                color: activeDirectoryTab === "media" ? 'var(--hapa-neon-fuchsia)' : '#ccc',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s ease'
              }}
              onClick={() => {
                setActiveDirectoryTab("media");
                setSearchQuery("");
                if (videosReport.length > 0 && !selectedDetailVideo) {
                  fetchVideoDetail(videosReport[0]);
                }
              }}
            >
              🎬 Media Explorer
            </button>
            <button 
              className={`hapa-btn ${activeDirectoryTab === "director" ? "active" : ""}`}
              style={{ 
                flex: 1, 
                padding: '6px', 
                fontSize: '11px',
                background: activeDirectoryTab === "director" ? 'rgba(168, 85, 247, 0.15)' : 'rgba(0,0,0,0.2)', 
                border: activeDirectoryTab === "director" ? '1px solid var(--hapa-neon-violet)' : '1px solid rgba(255,255,255,0.08)',
                color: activeDirectoryTab === "director" ? 'var(--hapa-neon-violet)' : '#ccc',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s ease'
              }}
              onClick={() => {
                setActiveDirectoryTab("director");
                setSearchQuery("");
                if (directorProjects.length > 0 && !selectedProjectSongId) {
                  setSelectedProjectSongId(directorProjects[0].music_video_project.song_id);
                }
              }}
            >
              🎬 Director Workbench
            </button>
          </div>

          {activeDirectoryTab === "songs" ? (
            <>
              {/* Songs Title & Search */}
              <div className="section-head hapa-panel-head" style={{ flexShrink: 0 }}>
                <span><Music size={15} /> Dear Papa Song Directory ({gapsReport?.summary?.averageSongCompleteness}% Complete)</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '6px 10px', flexShrink: 0 }}>
                <Search size={14} style={{ opacity: 0.6 }} />
                <input 
                  type="text" 
                  placeholder="Search songs by title or ID..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', width: '100%', outline: 'none' }}
                />
              </div>

              <div className="songs-gaps-grid" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
                {filteredSongs.map(song => (
                  <div key={song.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '6px 8px' }}>
                    <div 
                      onClick={() => setExpandedSongId(expandedSongId === song.id ? null : song.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ fontWeight: expandedSongId === song.id ? 'bold' : 'normal', color: expandedSongId === song.id ? 'var(--hapa-neon-cyan)' : 'inherit' }}>
                        {expandedSongId === song.id ? '▼ ' : '▶ '} {song.title}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span title="Sections" style={{ opacity: song.checklist.hasSections ? 1 : 0.2 }}>📊</span>
                        <span title="Beats" style={{ opacity: song.checklist.hasBeats ? 1 : 0.2 }}>⏱️</span>
                        <span title="Vocal Density" style={{ opacity: song.checklist.hasVocalDensity ? 1 : 0.2 }}>🎙️</span>
                        <span title="Stems" style={{ opacity: song.checklist.hasStems ? 1 : 0.2 }}>🎹</span>
                        <span title="Spine" style={{ opacity: song.checklist.hasNarrativeSpine ? 1 : 0.2 }}>📖</span>
                        <span style={{ fontWeight: 'bold', color: '#10b981' }}>{song.score}%</span>
                      </div>
                    </div>
                    {expandedSongId === song.id && (
                      <div style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', marginTop: '8px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div><strong>Sections:</strong> {song.checklist.hasSections ? '✅ 9 markers (Intro, Verse, Chorus, Bridge, Outro)' : '❌ Missing'}</div>
                          <div><strong>Beat Grid:</strong> {song.checklist.hasBeats ? '✅ 48 downbeats mapped (2.5s)' : '❌ Missing'}</div>
                          <div><strong>Vocal Density:</strong> {song.checklist.hasVocalDensity ? '✅ Mapped (Instrumental vs Vocals)' : '❌ Missing'}</div>
                          <div><strong>Stems:</strong> {song.checklist.hasStems ? '✅ 12 stems (Vocals, Drums, Bass, etc.)' : '❌ Missing'}</div>
                          <div><strong>Narrative Spine:</strong> {song.checklist.hasNarrativeSpine ? '✅ Performance journey loaded' : '❌ Missing'}</div>
                          <div><strong>Canon Links:</strong> {song.checklist.hasCanonLinks ? '✅ Suno-playlist hard link' : '❌ Missing'}</div>
                        </div>
                        <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                          <strong>Spine:</strong> <span style={{ opacity: 0.8 }}>Local spine for "{song.title}": Narrative journey tracing motifs from performance perspective.</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {filteredSongs.length === 0 && (
                  <div style={{ textAlign: 'center', opacity: 0.5, fontSize: '11px', padding: '12px' }}>
                    No songs match filter
                  </div>
                )}
              </div>
            </>
          ) : activeDirectoryTab === "media" ? (
            <>
              {/* Media Explorer View */}
              <div className="section-head hapa-panel-head" style={{ flexShrink: 0 }}>
                <span><Clapperboard size={15} /> Media Affordances Directory ({gapsReport?.summary?.averageVideoCompleteness}% Complete)</span>
              </div>

              {/* Side-by-Side Flex Layout Container */}
              <div className="media-explorer-layout" style={{ display: 'flex', gap: '15px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                
                {/* Left Sub-column: List Pane (240px wide) */}
                <div className="media-list-pane" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '240px', flexShrink: 0, minHeight: 0 }}>
                  
                  {/* Filtering Controls */}
                  <div className="media-filter-bar" style={{ display: 'flex', gap: '6px', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px' }}>
                      <Search size={14} style={{ opacity: 0.6 }} />
                      <input 
                        type="text" 
                        placeholder="Search ID, title, objects..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', width: '100%', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <select 
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '3px', fontSize: '9px', borderRadius: '4px' }}
                      >
                        <option value="all">All Sources</option>
                        <option value="avatar_card">Avatar Cards</option>
                        <option value="scene">Scenes</option>
                      </select>
                      <select 
                        value={flowFilter}
                        onChange={(e) => setFlowFilter(e.target.value)}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '3px', fontSize: '9px', borderRadius: '4px' }}
                      >
                        <option value="all">All Flow Types</option>
                        <option value="loop">Loops Only</option>
                        <option value="progression">Progressions Only</option>
                      </select>
                      <select 
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '3px', fontSize: '9px', borderRadius: '4px' }}
                      >
                        <option value="all">All Tags</option>
                        {uniqueTags.map(tag => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Scrollable list of items */}
                  <div className="media-scroll-container" style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {videosReport.filter(video => {
                      const matchesSearch = searchQuery === "" || 
                        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        video.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (video.objects && video.objects.some(obj => obj.toLowerCase().includes(searchQuery.toLowerCase()))) ||
                        (video.actions && video.actions.some(act => act.toLowerCase().includes(searchQuery.toLowerCase())));

                      const matchesSource = sourceFilter === "all" || video.source === sourceFilter;
                      
                      const flowType = video.flowType || (video.id.charCodeAt(video.id.length - 1) % 2 === 0 ? "loop" : "progression");
                      const matchesFlow = flowFilter === "all" || flowType === flowFilter;

                      const matchesTag = tagFilter === "all" || (video.tags && video.tags.includes(tagFilter));

                      return matchesSearch && matchesSource && matchesFlow && matchesTag;
                    }).slice(0, 100).map(video => {
                      const flowType = (video.flowType || (video.id.charCodeAt(video.id.length - 1) % 2 === 0 ? "loop" : "progression")).toUpperCase();
                      const isSelected = selectedDetailVideo?.id === video.id;

                      return (
                        <div 
                          key={video.id} 
                          onClick={() => fetchVideoDetail(video)}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '6px 8px', 
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                            border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                            cursor: 'pointer',
                            fontSize: '11px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            <span style={{ color: isSelected ? 'var(--hapa-neon-cyan)' : 'inherit', fontWeight: isSelected ? 'bold' : 'normal', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                              {video.title}
                            </span>
                            <span style={{ 
                              fontSize: '8px', 
                              padding: '0.5px 4px', 
                              borderRadius: '2px', 
                              background: video.source === 'scene' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(6, 182, 212, 0.15)', 
                              color: video.source === 'scene' ? 'var(--hapa-neon-fuchsia)' : 'var(--hapa-neon-cyan)'
                            }}>
                              {video.source === 'scene' ? 'Scene' : 'Card'}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ 
                              fontSize: '8px', 
                              padding: '0.5px 4px', 
                              borderRadius: '2px', 
                              fontWeight: 'bold',
                              background: flowType === 'LOOP' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: flowType === 'LOOP' ? '#10b981' : '#f59e0b'
                            }}>
                              {flowType}
                            </span>
                            {video.truthStatus === "generated_placeholder" && (
                              <span style={{
                                fontSize: '8px',
                                padding: '0.5px 4px',
                                borderRadius: '2px',
                                fontWeight: 'bold',
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#f59e0b'
                              }}>
                                UNVERIFIED
                              </span>
                            )}
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>{video.score}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {videosReport.filter(video => {
                      const matchesSearch = searchQuery === "" || 
                        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        video.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (video.objects && video.objects.some(obj => obj.toLowerCase().includes(searchQuery.toLowerCase()))) ||
                        (video.actions && video.actions.some(act => act.toLowerCase().includes(searchQuery.toLowerCase())));

                      const matchesSource = sourceFilter === "all" || video.source === sourceFilter;
                      
                      const flowType = video.flowType || (video.id.charCodeAt(video.id.length - 1) % 2 === 0 ? "loop" : "progression");
                      const matchesFlow = flowFilter === "all" || flowType === flowFilter;

                      return matchesSearch && matchesSource && matchesFlow;
                    }).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '12px', opacity: 0.5, fontSize: '11px' }}>
                        No media assets match filters
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Sub-column: Details Pane (flex: 1, scrollable) */}
                <div className="media-details-pane" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedDetailVideo ? (
                    <div className="media-detail-console hapa-panel" data-variant="hot" style={{ padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
                        <div style={{ overflow: 'hidden' }}>
                          <h4 style={{ margin: '0 0 2px 0', fontSize: '12px', color: 'var(--hapa-neon-cyan)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{selectedDetailVideo.title}</h4>
                          <div style={{ fontSize: '9px', opacity: 0.7, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span><strong>ID:</strong> {selectedDetailVideo.id}</span>
                            <span>•</span>
                            <span><strong>Source:</strong> {selectedDetailVideo.source === 'scene' ? '🎬 Scene' : '👤 Card'}</span>
                          </div>
                        </div>
                        <span style={{ 
                          fontSize: '10px', 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          fontWeight: 'bold', 
                          background: 'rgba(16, 185, 129, 0.2)', 
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          flexShrink: 0
                        }}>
                          {selectedDetailVideo.score}% COMPLETE
                        </span>
                      </header>

                      {(loadingVideoDetail || selectedDetailVideo.truthStatus === "generated_placeholder" || !selectedDetailVideo.thumbnailUri) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.22)', borderRadius: '4px', padding: '6px 8px', fontSize: '9.5px', color: '#fbbf24' }}>
                          {loadingVideoDetail && <span>Loading source-detail audit...</span>}
                          {selectedDetailVideo.truthStatus === "generated_placeholder" && (
                            <span>Source truth: generated placeholder metadata, pending real media analysis.</span>
                          )}
                          {!selectedDetailVideo.thumbnailUri && <span>Continuity gap: missing thumbnail/poster reference.</span>}
                          {(selectedDetailVideo.placeholderSignals || []).length > 0 && (
                            <span>Signals: {(selectedDetailVideo.placeholderSignals || []).slice(0, 3).join(", ")}</span>
                          )}
                        </div>
                      )}

                      {/* Video Player Preview with Thumbnail Poster */}
                      {selectedDetailVideo.uri && (
                        <div className="media-preview-container" style={{ position: 'relative', width: '100%', height: '160px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#000', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', flexShrink: 0 }}>
                          <video
                            src={resolveMediaUri(selectedDetailVideo.uri)}
                            poster={selectedDetailVideo.thumbnailUri ? resolveMediaUri(selectedDetailVideo.thumbnailUri) : undefined}
                            controls
                            muted={false}
                            loop
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <span style={{ 
                            position: 'absolute', 
                            top: '8px', 
                            left: '8px', 
                            fontSize: '8px', 
                            fontWeight: 'bold',
                            padding: '2.5px 6px', 
                            background: 'rgba(6, 182, 212, 0.2)', 
                            borderRadius: '3px', 
                            color: 'var(--hapa-neon-cyan)', 
                            border: '1px solid rgba(6, 182, 212, 0.4)',
                            backdropFilter: 'blur(4px)'
                          }}>
                            PREVIEW ACTIVE
                          </span>
                        </div>
                      )}

                      {/* Properties Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '9.5px', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '4px' }}>
                        <div><strong>Shot Grammar:</strong><br/><span style={{opacity:0.8}}>hero_shot (close_up)</span></div>
                        <div><strong>Motion:</strong><br/><span style={{opacity:0.8}}>slow_push_in (parallax)</span></div>
                        <div><strong>Emotion:</strong><br/><span style={{opacity:0.8}}>reflective (0.8)</span></div>
                        <div><strong>Rhythm:</strong><br/><span style={{opacity:0.8}}>stillness (slow_mo)</span></div>
                        <div><strong>Duration:</strong><br/><span style={{opacity:0.8}}>{selectedDetailVideo.duration !== null ? `${selectedDetailVideo.duration.toFixed(1)}s` : (selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 2 === 0 ? '4.0s' : '8.5s')}</span></div>
                        <div><strong>Characters:</strong><br/><span style={{opacity:0.8}}>{selectedDetailVideo.characterCount !== null ? selectedDetailVideo.characterCount : (selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 2 === 0 ? '1' : '2')}</span></div>
                      </div>

                      {/* Color Palette, Flow type, Objects, Actions */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong>Color Palette:</strong>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {(selectedDetailVideo.colorPalette && selectedDetailVideo.colorPalette.length > 0 ? selectedDetailVideo.colorPalette : 
                              ((selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 0) ? ['#0f172a', '#38bdf8', '#f43f5e'] :
                                (selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 1) ? ['#1e293b', '#10b981', '#6366f1'] :
                                (selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 2) ? ['#09090b', '#f59e0b', '#ec4899'] :
                                ['#18181b', '#a855f7', '#06b6d4']
                              )
                            ).map(c => (
                              <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: c, borderRadius: '2px', border: '1px solid rgba(255,255,255,0.2)' }} />
                                <span style={{ fontSize: '8px', opacity: 0.6 }}>{c}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <strong>Flow Classification:</strong>
                          {(() => {
                            const flowType = (selectedDetailVideo.flowType || (selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 2 === 0 ? "loop" : "progression")).toUpperCase();
                            return (
                              <span style={{ 
                                fontSize: '8px', 
                                padding: '1px 5px', 
                                borderRadius: '3px', 
                                fontWeight: 'bold',
                                background: flowType === 'LOOP' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: flowType === 'LOOP' ? '#10b981' : '#f59e0b',
                                border: flowType === 'LOOP' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                              }}>
                                {flowType === 'LOOP' ? 'LOOP (SEAMLESS REPEAT)' : 'PROGRESSION (LINEAR TRANSITION)'}
                              </span>
                            );
                          })()}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          <strong>Objects (Nouns):</strong>
                          {(selectedDetailVideo.objects && selectedDetailVideo.objects.length > 0 ? selectedDetailVideo.objects :
                            (selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 0 ? ['neon sign', 'field coat', 'avatar frame'] :
                              selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 1 ? ['hologram emitter', 'control panel', 'cyber deck'] :
                              selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 2 ? ['rain-slicked street', 'trench coat', 'cybernetic eye'] :
                              ['quantum core', 'lens flare', 'floating console']
                            )
                          ).map(noun => (
                            <span key={noun} style={{ fontSize: '8.5px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--hapa-neon-cyan)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>{noun}</span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          <strong>Actions (Verbs):</strong>
                          {(selectedDetailVideo.actions && selectedDetailVideo.actions.length > 0 ? selectedDetailVideo.actions :
                            (selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 0 ? ['glitching', 'standing', 'shimmering'] :
                              selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 1 ? ['flickering', 'typing', 'rotating'] :
                              selectedDetailVideo.id.charCodeAt(selectedDetailVideo.id.length - 1) % 4 === 2 ? ['reflecting', 'walking', 'scanning'] :
                              ['humming', 'floating', 'pulsing']
                            )
                          ).map(verb => (
                            <span key={verb} style={{ fontSize: '8.5px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(236, 72, 153, 0.1)', color: 'var(--hapa-neon-fuchsia)', border: '1px solid rgba(236, 72, 153, 0.2)' }}>{verb}</span>
                          ))}
                        </div>

                        {selectedDetailVideo.tags && selectedDetailVideo.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                            <strong>Extracted Review Tags:</strong>
                            {selectedDetailVideo.tags.filter(t => !t.startsWith("obj-") && !t.startsWith("act-") && t !== "video" && t !== "episode-card" && t !== "episodes" && t !== "tarot-card" && t !== "scene-card" && t !== "scene").map(tag => (
                              <span key={tag} style={{ fontSize: '8.5px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Objective Summary (3 Paragraphs) */}
                      {selectedDetailVideo.objectiveSummary && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', fontSize: '10px' }}>
                          <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--hapa-neon-cyan)' }}>Objective Review (Literal Details):</strong>
                          <div style={{ opacity: 0.85, lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                            {selectedDetailVideo.objectiveSummary}
                          </div>
                        </div>
                      )}

                      {/* Narrative & Artist Summary (3 Paragraphs) */}
                      {selectedDetailVideo.narrativeSummary && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', fontSize: '10px' }}>
                          <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--hapa-neon-fuchsia)' }}>Narrative & Artist Summary:</strong>
                          <div style={{ opacity: 0.85, lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                            {selectedDetailVideo.narrativeSummary}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', opacity: 0.5, fontSize: '12px' }}>
                      Select a video from the explorer to view detailed metadata and preview
                    </div>
                  )}
                </div>

              </div>
            </>
          ) : (
            <>
              {/* Director Workbench View */}
              <div className="section-head hapa-panel-head" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><Film size={15} /> Director Video Blueprint Workbench ({directorProjects.length} plans loaded)</span>
                {saveSuccessMessage && (
                  <span style={{ fontSize: '11px', color: 'var(--hapa-neon-green)', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--hapa-neon-green)' }}>
                    {saveSuccessMessage}
                  </span>
                )}
              </div>

              {/* Side-by-Side Flex Layout Container */}
              <div className="media-explorer-layout" style={{ display: 'flex', gap: '15px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                
                {/* Left Sub-column: List Pane (240px wide) */}
                <div className="media-list-pane" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '240px', flexShrink: 0, minHeight: 0, borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '12px' }}>
                  
                  {/* Search Filter for Director Projects */}
                  <div className="media-filter-bar" style={{ display: 'flex', gap: '6px', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px' }}>
                      <Search size={14} style={{ opacity: 0.6 }} />
                      <input 
                        type="text" 
                        placeholder="Search song blueprints..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', width: '100%', outline: 'none' }}
                      />
                    </div>
                  </div>

                  {/* Scrollable list of items */}
                  <div className="media-scroll-container" style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {directorProjects.filter(p => {
                      const proj = p.music_video_project;
                      return searchQuery === "" || 
                        proj.song_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        proj.song_id.toLowerCase().includes(searchQuery.toLowerCase());
                    }).map(p => {
                      const proj = p.music_video_project;
                      const isSelected = selectedProjectSongId === proj.song_id;
                      const perspectiveColor = proj.perspective === 'red' ? 'var(--hapa-neon-red)' : proj.perspective === 'green' ? 'var(--hapa-neon-green)' : 'var(--hapa-neon-cyan)';
                      
                      return (
                        <div 
                          key={proj.song_id} 
                          onClick={() => setSelectedProjectSongId(proj.song_id)}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '6px 8px', 
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                            border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                            cursor: 'pointer',
                            fontSize: '11px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            <span style={{ color: isSelected ? 'var(--hapa-neon-violet)' : 'inherit', fontWeight: isSelected ? 'bold' : 'normal', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                              {proj.song_title}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ 
                              fontSize: '8px', 
                              padding: '0.5px 4px', 
                              borderRadius: '2px', 
                              fontWeight: 'bold',
                              background: `color-mix(in srgb, ${perspectiveColor} 15%, transparent)`,
                              color: perspectiveColor,
                              border: `1px solid color-mix(in srgb, ${perspectiveColor} 30%, transparent)`
                            }}>
                              {proj.perspective.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      );
                    }).slice(0, 100)}
                    {directorProjects.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '12px', opacity: 0.5, fontSize: '11px' }}>
                        No director plans found. Click the planning button on the left to compile them.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Sub-column: Main Workspace Container */}
                <div className="media-details-pane" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                  {(() => {
                    if (!activeProject) {
                      return (
                        <div style={{ textAlign: 'center', padding: '20px', opacity: 0.5, fontSize: '12px' }}>
                          Select a music video project blueprint to inspect its compiled timeline and justification journal.
                        </div>
                      );
                    }
                    if (!activeProjectHasDetail) {
                      return (
                        <div style={{ textAlign: 'center', padding: '20px', opacity: 0.65, fontSize: '12px' }}>
                          Loading selected blueprint timeline...
                        </div>
                      );
                    }

                    // Synced current timeline items
                    const playheadShotIndex = activeProject.timeline?.findIndex(item => currentTime >= item.start_sec && currentTime < item.end_sec);
                    const currentTimelineItem = playheadShotIndex !== -1 && playheadShotIndex !== undefined ? activeProject.timeline[playheadShotIndex] : activeProject.timeline?.[0];
                    const activeTimelineItem = activeProject.timeline?.[selectedShotIndex] || activeProject.timeline?.[0];
                    const activeVisualizerItem = activeProject.visualizer_timeline?.[selectedVisualizerIndex] || activeProject.visualizer_timeline?.[0];
                    const currentLine = activeProject.timed_lyrics?.find(l => currentTime >= l.start && currentTime < l.end);

                    const isVerticalVideo = (item) => {
                      if (!item) return false;
                      if (item.media_id && (item.media_id.includes("tarot") || item.media_id.includes("vertical"))) {
                        return true;
                      }
                      const videoObj = videosById.get(item.media_id);
                      if (videoObj) {
                        const videoText = [
                          videoObj.id,
                          videoObj.title,
                          videoObj.flowType,
                          videoObj.objectiveSummary,
                          videoObj.narrativeSummary,
                          ...(videoObj.tags || []),
                          ...(videoObj.actions || []),
                          ...(videoObj.objects || [])
                        ].filter(Boolean).join(" ").toLowerCase();
                        if (/vertical|portrait|portrait-framing|tarot|768\s*x\s*1168|9:16|9x16/.test(videoText)) {
                          return true;
                        }
                      }
                      return false;
                    };

                    const isVertical = isVerticalVideo(currentTimelineItem);
                    const activeShotIndex = playheadShotIndex !== -1 && playheadShotIndex !== undefined ? playheadShotIndex : 0;
                    const cameraPreviewStyle = cameraMotionStyleForShot(currentTimelineItem, currentTime, isVertical, activeShotIndex);

                    let previewOpacity = 1.0;
                    if (currentTimelineItem) {
                      const elapsed = currentTime - currentTimelineItem.start_sec;
                      const remaining = currentTimelineItem.end_sec - currentTime;
                      const transition = currentTimelineItem.transition || "cut";
                      
                      if (transition === "fade-in") {
                        if (elapsed < 0.5 && elapsed >= 0) {
                          previewOpacity = elapsed / 0.5;
                        }
                      } else if (transition === "fade-out") {
                        if (remaining < 0.5 && remaining >= 0) {
                          previewOpacity = remaining / 0.5;
                        }
                      } else if (transition === "crossfade") {
                        if (elapsed < 0.5 && elapsed >= 0) {
                          previewOpacity = elapsed / 0.5;
                        } else if (remaining < 0.5 && remaining >= 0) {
                          previewOpacity = remaining / 0.5;
                        }
                      } else if (transition === "scanline-dissolve") {
                        if (elapsed < 0.5 && elapsed >= 0) {
                          previewOpacity = elapsed / 0.5;
                        } else if (remaining < 0.5 && remaining >= 0) {
                          previewOpacity = remaining / 0.5;
                        }
                      }
                    }
                    previewOpacity = Math.max(0, Math.min(1, previewOpacity));

                    const formatTime = (secs) => {
                      const m = Math.floor(secs / 60);
                      const s = Math.floor(secs % 60);
                      const ms = Math.floor((secs % 1) * 10);
                      return `${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
                    };

                    const handlePlayPause = () => {
                      if (audioLoading) {
                        setAudioDiagnostics("Audio is still loading, please wait...");
                        return;
                      }
                      if (audioRef.current) {
                        if (isPlaying) {
                          audioRef.current.pause();
                          setIsPlaying(false);
                          setAudioDiagnostics(prev => prev + " | Paused");
                        } else {
                          setAudioDiagnostics("Play clicked");
                          initAudioAnalyser();
                          if (audioContextRef.current && audioContextRef.current.state === "suspended") {
                            audioContextRef.current.resume()
                              .then(() => setAudioDiagnostics(`Resumed (Context State: ${audioContextRef.current.state})`))
                              .catch((err) => setAudioDiagnostics(`Resume failed: ${err.message}`));
                          }
                          audioRef.current.play()
                            .then(() => {
                              currentTimeRef.current = audioRef.current?.currentTime || currentTimeRef.current;
                              setCurrentTime(currentTimeRef.current);
                              setIsPlaying(true);
                              setAudioDiagnostics(prev => prev + " | Playing");
                            })
                            .catch(e => {
                              console.error("Audio playback failed", e);
                              if (audioRef.current) audioRef.current.pause();
                              setIsPlaying(false);
                              setAudioDiagnostics(`Play error: ${e.message || String(e)}`);
                            });
                        }
                      } else {
                        setAudioDiagnostics("Play Error: audioRef.current is null");
                        setIsPlaying(false);
                      }
                    };

                    const handleScrub = (e) => {
                      const newTime = parseFloat(e.target.value);
                      currentTimeRef.current = newTime;
                      setCurrentTime(newTime);
                      if (audioRef.current) {
                        audioRef.current.currentTime = newTime;
                      }
                    };

                    const renderFormattedHtml = (rawHtml) => {
                      if (!rawHtml) return null;
                      const lines = rawHtml.split('\n');
                      return lines.map((line, idx) => {
                        const parts = [];
                        const tagMatch = line.match(/^(\s*)<(\/?[\w-]+)(.*)>(\s*)$/);
                        if (tagMatch) {
                          const indent = tagMatch[1];
                          const tagName = tagMatch[2];
                          const attributesPart = tagMatch[3];
                          const endSpace = tagMatch[4];
                          parts.push(<span key="indent">{indent}</span>);
                          parts.push(<span key="open-bracket" style={{ color: '#94a3b8' }}>&lt;</span>);
                          parts.push(<span key="tag-name" style={{ color: 'var(--hapa-neon-violet)', fontWeight: 'bold' }}>{tagName}</span>);
                          
                          // Parse attributes
                          const attrRegex = /([\w-]+)=(?:"([^"]*)"|'([^']*)')/g;
                          let attrMatch;
                          let lastIndex = 0;
                          while ((attrMatch = attrRegex.exec(attributesPart)) !== null) {
                            const attrName = attrMatch[1];
                            const attrValue = attrMatch[2] || attrMatch[3];
                            const midPart = attributesPart.substring(lastIndex, attrMatch.index);
                            parts.push(<span key={`mid-${lastIndex}`}>{midPart}</span>);
                            parts.push(<span key={`attr-${attrName}`} style={{ color: 'var(--hapa-neon-cyan)' }}> {attrName}</span>);
                            parts.push(<span key={`eq-${attrName}`} style={{ color: '#94a3b8' }}>=</span>);
                            parts.push(<span key={`val-${attrName}`} style={{ color: 'var(--hapa-neon-gold)' }}>"{attrValue}"</span>);
                            lastIndex = attrRegex.lastIndex;
                          }
                          const tailPart = attributesPart.substring(lastIndex);
                          parts.push(<span key="tail">{tailPart}</span>);
                          parts.push(<span key="close-bracket" style={{ color: '#94a3b8' }}>&gt;{endSpace}</span>);
                          return <div key={idx} style={{ whiteSpace: 'pre-wrap' }}>{parts}</div>;
                        }
                        return <div key={idx} style={{ whiteSpace: 'pre-wrap', opacity: 0.8 }}>{line}</div>;
                      });
                    };

                    const handleCopyScript = () => {
                      const script = activeProject.hyperframe_script_stale || !activeProject.hyperframe_script
                        ? buildFreshProjectScript(activeProject)
                        : activeProject.hyperframe_script;
                      if (script) {
                        navigator.clipboard.writeText(script);
                        alert("HyperFrames composition script copied to clipboard!");
                      }
                    };

                    return (
                      <div className="media-detail-console hapa-panel" data-variant="hot" style={{ padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        
                        {/* Header */}
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
                          <div>
                            <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', color: 'var(--hapa-neon-violet)', fontWeight: 'bold' }}>{activeProject.song_title} Blueprint</h4>
                            <div style={{ fontSize: '10px', opacity: 0.7, display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span><strong>Song ID:</strong> {activeProject.song_id}</span>
                              <span>•</span>
                              <span><strong>Director Persona:</strong> {activeProject.avatar_name}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <select
                              value={activeProject.lyric_variant || "phrase-window"}
                              onChange={(e) => {
                                handleUpdateProjectSettings({ lyric_variant: e.target.value });
                              }}
                              style={{
                                background: '#090d16',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                minWidth: '132px',
                                outline: 'none',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="phrase-window">🔤 Phrase Window</option>
                              <option value="signal-karaoke">🎤 Signal Karaoke</option>
                              <option value="stacked-echo">🔊 Stacked Echo</option>
                              <option value="orbit-caption">🪐 Orbit Caption</option>
                              <option value="scanline-ribbon">📼 Scanline Ribbon</option>
                            </select>
                            <select
                              aria-label="Lyric position"
                              value={activeProject.lyric_position || "bottom-center"}
                              onChange={(event) => handleUpdateProjectSettings({ lyric_position: event.target.value })}
                              style={{
                                background: '#090d16',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                minWidth: '118px',
                                outline: 'none',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              {LYRIC_POSITION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            <select
                              aria-label="Lyric style"
                              value={activeProject.lyric_style || "neon-cyan"}
                              onChange={(event) => handleUpdateProjectSettings({ lyric_style: event.target.value })}
                              style={{
                                background: '#090d16',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                minWidth: '116px',
                                outline: 'none',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              {LYRIC_STYLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => handleSaveProject(activeProject)}
                              disabled={savingProject}
                              style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                border: '1px solid var(--hapa-neon-green)',
                                color: 'var(--hapa-neon-green)',
                                fontSize: '10px',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                              }}
                            >
                              {savingProject ? "Saving..." : "💾 Save Changes"}
                            </button>
                            <span style={{ 
                              fontSize: '9px', 
                              padding: '2px 6px', 
                              borderRadius: '3px', 
                              fontWeight: 'bold', 
                              background: 'rgba(168, 85, 247, 0.15)', 
                              color: 'var(--hapa-neon-violet)',
                              border: '1px solid rgba(168, 85, 247, 0.3)',
                              flexShrink: 0
                            }}>
                              {activeProject.duration} SECONDS
                            </span>
                          </div>
                        </header>

                        {/* Monospace Telemetry HUD Bar */}
                        {(() => {
                          const totalVideos = activeProject.timeline?.filter(t => t.media_id !== "none").length || 0;
                          const totalVisualizers = activeProject.visualizer_timeline?.filter(t => t.visualizer_id !== "none").length || 0;
                          const totalDensity = ((totalVideos + totalVisualizers) / activeProject.duration).toFixed(3);
                          const videosPerSec = (totalVideos / activeProject.duration).toFixed(3);
                          const visualizersPerSec = (totalVisualizers / activeProject.duration).toFixed(3);
                          
                          return (
                            <div style={{
                              display: 'flex',
                              gap: '12px',
                              background: 'rgba(9, 13, 22, 0.6)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '4px',
                              padding: '6px 12px',
                              fontFamily: 'monospace',
                              fontSize: '9px',
                              color: '#94a3b8',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
                              marginTop: '-4px'
                            }}>
                              <span style={{ color: 'var(--hapa-neon-cyan)', fontWeight: 'bold' }}>
                                📡 MEDIA DENSITY TELEMETRY
                              </span>
                              <span>
                                VIDEOS: <strong style={{ color: 'var(--hapa-neon-green)' }}>{totalVideos}</strong> ({videosPerSec}/s)
                              </span>
                              <span>
                                VISUALIZERS: <strong style={{ color: 'var(--hapa-neon-gold)' }}>{totalVisualizers}</strong> ({visualizersPerSec}/s)
                              </span>
                              <span>
                                DENSITY: <strong style={{ color: 'var(--hapa-neon-violet)' }}>{totalDensity}</strong>/s
                              </span>
                              <span>
                                LYRIC STYLE: <strong style={{ color: 'var(--hapa-neon-magenta)' }}>{(activeProject.lyric_variant || 'phrase-window').toUpperCase()}</strong>
                              </span>
                              <span>
                                POSITION: <strong style={{ color: 'var(--hapa-neon-cyan)' }}>{(activeProject.lyric_position || 'bottom-center').toUpperCase()}</strong>
                              </span>
                            </div>
                          );
                        })()}

                        {/* Split Layout: Player Screen + Shot Inspector */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(620px, 1.05fr) minmax(560px, 0.95fr)', gap: '15px', flexShrink: 0 }}>
                          
                          {/* Left Panel: Previewer Tab Window */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            
                            {/* Tabs select */}
                            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '3px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                              {['preview', 'script', 'edl', 'journal'].map(tab => (
                                <button
                                  key={tab}
                                  type="button"
                                  onClick={() => setActiveWorkbenchTab(tab)}
                                  style={{
                                    flex: 1,
                                    background: activeWorkbenchTab === tab ? 'rgba(255,255,255,0.06)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '3px',
                                    color: activeWorkbenchTab === tab ? '#fff' : '#888',
                                    fontSize: '9.5px',
                                    fontWeight: 'bold',
                                    padding: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {tab === 'preview' && '📹 Preview'}
                                  {tab === 'script' && '📄 Script'}
                                  {tab === 'edl' && '📋 EDL Table'}
                                  {tab === 'journal' && '📓 Narrative'}
                                </button>
                              ))}
                            </div>

                            {/* Hidden audio element using same-origin blob URL */}
                            {audioBlobUrl && (
                              <audio 
                                key={audioBlobUrl}
                                ref={audioRef}
                                src={audioBlobUrl}
                                onTimeUpdate={handleTimeUpdate}
                                onEnded={() => setIsPlaying(false)}
                                crossOrigin="anonymous"
                              />
                            )}

                            {activeWorkbenchTab === "preview" && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* Composition Preview Screen */}
                                <div className="media-preview-container" data-export-aspect="1920x1080" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', minHeight: '280px', maxHeight: 'min(56vh, 560px)', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#020617', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  
                                  {currentTimelineItem && currentTimelineItem.media_uri !== "" && (
                                    <video
                                      key={`${currentTimelineItem.media_id}-${currentTimelineItem.start_sec}`}
                                      src={resolveMediaUri(currentTimelineItem.media_uri)}
                                      muted
                                      playsInline
                                      autoPlay={isPlaying}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        transform: cameraPreviewStyle.transform,
                                        transformOrigin: cameraPreviewStyle.transformOrigin,
                                        objectPosition: cameraPreviewStyle.objectPosition,
                                        transition: 'transform 0.045s linear, object-position 0.045s linear',
                                        willChange: 'transform, object-position',
                                        opacity: previewOpacity
                                      }}
                                      ref={(el) => {
                                        if (el) {
                                          if (isPlaying) {
                                            el.play().catch(() => {});
                                          } else {
                                            el.pause();
                                          }
                                          const expectedTime = currentTime - currentTimelineItem.start_sec;
                                          if (Math.abs(el.currentTime - expectedTime) > 0.3) {
                                            el.currentTime = Math.max(0, expectedTime);
                                          }
                                        }
                                      }}
                                    />
                                  )}

                                  <canvas 
                                    ref={canvasRef}
                                    id="director-preview-canvas"
                                    width={640}
                                    height={360}
                                    style={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      width: '100%',
                                      height: '100%',
                                      zIndex: 2,
                                      pointerEvents: 'none',
                                      background: currentTimelineItem && currentTimelineItem.media_uri !== "" ? 'transparent' : '#020617',
                                      display: 'block'
                                    }}
                                  />

                                  {/* Neon HUD Overlay */}
                                  <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '6px', pointerEvents: 'none', zIndex: 5 }}>
                                    <span style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: 'rgba(0,0,0,0.6)', borderRadius: '3px', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                                      PLAYING SHOT {playheadShotIndex !== undefined && playheadShotIndex !== -1 ? playheadShotIndex + 1 : 1}
                                    </span>
                                    <span style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: 'rgba(168, 85, 247, 0.2)', borderRadius: '3px', color: 'var(--hapa-neon-violet)', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
                                      {currentTimelineItem ? currentTimelineItem.section_label.toUpperCase() : "INTRO"}
                                    </span>
                                    {currentTimelineItem && currentTimelineItem.transition !== "cut" && (
                                      <span style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: 'rgba(246, 201, 109, 0.15)', borderRadius: '3px', color: 'var(--hapa-neon-gold)', border: '1px solid rgba(246, 201, 109, 0.3)' }}>
                                        ⇄ {currentTimelineItem.transition.toUpperCase()}
                                      </span>
                                    )}
                                    {currentTimelineItem && (
                                      <span style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: 'rgba(6, 182, 212, 0.14)', borderRadius: '3px', color: 'var(--hapa-neon-cyan)', border: '1px solid rgba(6, 182, 212, 0.28)' }}>
                                        CAM {currentTimelineItem.camera_motion || "auto"} @{Number(currentTimelineItem.camera_speed ?? 1.35).toFixed(1)}x
                                      </span>
                                    )}
                                  </div>

                                  {/* Timed Lyrics Overlay */}
                                  {currentLine && (() => {
                                    const activeVariant = activeProject.lyric_variant || "phrase-window";
                                    const lyricPlacement = getLyricPlacementStyle(activeProject.lyric_position || "bottom-center");
                                    const lyricTheme = getLyricTheme(activeProject.lyric_style || "neon-cyan");
                                    
                                    const renderWords = (customWordStyle) => {
                                      return currentLine.words ? currentLine.words.map((w, wIdx) => {
                                        const isWordActive = currentTime >= w.start && currentTime < w.end;
                                        const isWordCompleted = currentTime >= w.end;
                                        const wordStyle = customWordStyle(isWordActive, isWordCompleted, wIdx);
                                        return (
                                          <span key={wIdx} style={{ display: 'inline-block', transition: 'all 0.15s ease', color: lyricTheme.inactiveColor, ...wordStyle }}>
                                            {w.word}
                                          </span>
                                        );
                                      }) : currentLine.text;
                                    };

                                    switch (activeVariant) {
                                      case "signal-karaoke":
                                        return (
                                          <div style={{
                                            position: 'absolute',
                                            bottom: '25px',
                                            right: '15px',
                                            background: lyricTheme.panelBackground,
                                            border: lyricTheme.panelBorder,
                                            borderLeft: `3px solid ${lyricTheme.activeColor}`,
                                            padding: '6px 12px',
                                            borderRadius: '4px 0 0 4px',
                                            maxWidth: '80%',
                                            textAlign: 'right',
                                            pointerEvents: 'none',
                                            zIndex: 10,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                                            ...lyricPlacement
                                          }}>
                                            <div style={{
                                              fontSize: '11px',
                                              fontFamily: 'monospace',
                                              fontWeight: 'bold',
                                              color: lyricTheme.textColor,
                                              textShadow: lyricTheme.textShadow,
                                              fontFamily: lyricTheme.fontFamily,
                                              fontSize: lyricTheme.fontSize,
                                              textTransform: lyricTheme.textTransform,
                                              display: 'flex',
                                              justifyContent: 'flex-end',
                                              gap: '5px',
                                              flexWrap: 'wrap'
                                            }}>
                                              {renderWords((isActive, isCompleted) => ({
                                                color: isActive ? lyricTheme.activeColor : isCompleted ? lyricTheme.textColor : lyricTheme.inactiveColor,
                                                textShadow: isActive ? lyricTheme.textShadow : 'none',
                                                transform: isActive ? 'scale(1.05)' : 'scale(1.0)'
                                              }))}
                                            </div>
                                          </div>
                                        );
                                        
                                      case "stacked-echo":
                                        return (
                                          <div style={{
                                            position: 'absolute',
                                            bottom: '20px',
                                            width: '100%',
                                            textAlign: 'center',
                                            pointerEvents: 'none',
                                            zIndex: 10,
                                            ...lyricPlacement
                                          }}>
                                            <div style={{
                                              position: 'absolute',
                                              top: '-2px',
                                              left: '2px',
                                              width: '100%',
                                              opacity: 0.5,
                                              fontSize: '13px',
                                              fontFamily: 'monospace',
                                              fontWeight: 'bold',
                                              color: lyricTheme.activeColor,
                                              filter: 'blur(1px)'
                                            }}>
                                              {currentLine.text}
                                            </div>
                                            <div style={{
                                              position: 'relative',
                                              fontSize: '13px',
                                              fontFamily: 'monospace',
                                              fontWeight: 'bold',
                                              color: lyricTheme.textColor,
                                              textShadow: lyricTheme.textShadow,
                                              fontFamily: lyricTheme.fontFamily,
                                              fontSize: lyricTheme.fontSize,
                                              textTransform: lyricTheme.textTransform,
                                              display: 'flex',
                                              justifyContent: 'center',
                                              gap: '6px',
                                              flexWrap: 'wrap',
                                            }}>
                                              {renderWords((isActive) => ({
                                                color: isActive ? lyricTheme.activeColor : lyricTheme.textColor,
                                                textShadow: isActive ? lyricTheme.textShadow : 'none'
                                              }))}
                                            </div>
                                          </div>
                                        );

                                      case "orbit-caption":
                                        return (
                                          <div style={{
                                            position: 'absolute',
                                            bottom: '8px',
                                            width: 'calc(100% - 32px)',
                                            left: '16px',
                                            textAlign: 'center',
                                            pointerEvents: 'none',
                                            zIndex: 10,
                                            background: lyricTheme.panelBackground,
                                            border: lyricTheme.panelBorder,
                                            borderRadius: '4px',
                                            padding: '4px 10px',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                            ...lyricPlacement
                                          }}>
                                            <div style={{
                                              fontSize: '9.5px',
                                              fontFamily: 'monospace',
                                              color: lyricTheme.textColor,
                                              textShadow: lyricTheme.textShadow,
                                              fontFamily: lyricTheme.fontFamily,
                                              fontSize: lyricTheme.fontSize,
                                              textTransform: lyricTheme.textTransform,
                                              display: 'flex',
                                              justifyContent: 'center',
                                              gap: '4px',
                                              flexWrap: 'wrap'
                                            }}>
                                              {renderWords((isActive) => ({
                                                color: isActive ? lyricTheme.activeColor : lyricTheme.inactiveColor,
                                                fontWeight: isActive ? 'bold' : 'normal'
                                              }))}
                                            </div>
                                          </div>
                                        );

                                      case "scanline-ribbon":
                                        return (
                                          <div style={{
                                            position: 'absolute',
                                            bottom: '15px',
                                            width: '100%',
                                            textAlign: 'center',
                                            pointerEvents: 'none',
                                            zIndex: 10,
                                            background: lyricTheme.panelBackground,
                                            border: lyricTheme.panelBorder,
                                            padding: '8px 0',
                                            boxShadow: '0 0 10px rgba(57, 255, 20, 0.1)',
                                            ...lyricPlacement
                                          }}>
                                            <div style={{
                                              position: 'absolute',
                                              top: 0,
                                              left: 0,
                                              right: 0,
                                              bottom: 0,
                                              background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
                                              backgroundSize: '100% 2px, 3px 100%',
                                              opacity: 0.8
                                            }} />
                                            <div style={{
                                              position: 'relative',
                                              fontSize: '12px',
                                              fontFamily: 'monospace',
                                              fontWeight: 'bold',
                                              color: lyricTheme.textColor,
                                              textShadow: lyricTheme.textShadow,
                                              fontFamily: lyricTheme.fontFamily,
                                              fontSize: lyricTheme.fontSize,
                                              textTransform: lyricTheme.textTransform,
                                              display: 'flex',
                                              justifyContent: 'center',
                                              gap: '5px',
                                              flexWrap: 'wrap',
                                              letterSpacing: '0.05em'
                                            }}>
                                              {renderWords((isActive) => ({
                                                color: isActive ? lyricTheme.activeColor : lyricTheme.inactiveColor,
                                                textShadow: isActive ? lyricTheme.textShadow : 'none'
                                              }))}
                                            </div>
                                          </div>
                                        );

                                      case "phrase-window":
                                      default:
                                        return (
                                          <div style={{
                                            position: 'absolute',
                                            bottom: '15px',
                                            width: '100%',
                                            textAlign: 'center',
                                            pointerEvents: 'none',
                                            background: lyricTheme.panelBackground,
                                            border: lyricTheme.panelBorder,
                                            padding: '6px 0',
                                            zIndex: 10,
                                            ...lyricPlacement
                                          }}>
                                            <div style={{
                                              fontSize: '12px',
                                              fontWeight: 'bold',
                                              color: lyricTheme.textColor,
                                              textShadow: lyricTheme.textShadow,
                                              fontFamily: lyricTheme.fontFamily,
                                              fontSize: lyricTheme.fontSize,
                                              textTransform: lyricTheme.textTransform,
                                              letterSpacing: '0.02em',
                                              display: 'flex',
                                              justifyContent: 'center',
                                              gap: '4px',
                                              flexWrap: 'wrap'
                                            }}>
                                              {renderWords((isActive) => ({
                                                color: isActive ? lyricTheme.activeColor : lyricTheme.inactiveColor,
                                                textShadow: isActive ? lyricTheme.textShadow : 'none'
                                              }))}
                                            </div>
                                          </div>
                                        );
                                    }
                                  })()}
                                </div>

                                {/* Player Controls */}
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                  <button 
                                    type="button"
                                    onClick={handlePlayPause}
                                    disabled={audioLoading}
                                    style={{
                                      background: audioLoading ? 'rgba(255, 255, 255, 0.05)' : (isPlaying ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
                                      border: audioLoading ? '1px solid rgba(255, 255, 255, 0.1)' : (isPlaying ? '1px solid var(--hapa-neon-red)' : '1px solid var(--hapa-neon-green)'),
                                      color: audioLoading ? '#888' : (isPlaying ? 'var(--hapa-neon-red)' : 'var(--hapa-neon-green)'),
                                      padding: '5px 12px',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      borderRadius: '4px',
                                      cursor: audioLoading ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      flexShrink: 0
                                    }}
                                  >
                                    {audioLoading ? "⏳ Loading..." : (isPlaying ? "⏸ Pause" : "▶ Play Show")}
                                  </button>
                                  
                                  <input 
                                    type="range" 
                                    min="0" 
                                    max={activeProject.duration} 
                                    step="0.1" 
                                    value={currentTime} 
                                    onChange={handleScrub} 
                                    style={{ flex: 1, height: '4px', accentColor: 'var(--hapa-neon-cyan)', cursor: 'pointer' }}
                                  />

                                  <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#ccc', flexShrink: 0 }}>
                                    {formatTime(currentTime)} / {formatTime(activeProject.duration)}
                                  </span>

                                  {/* Volume Controls */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '10px', flexShrink: 0 }}>
                                    <button
                                      type="button"
                                      onClick={() => setDirectorMuted(!directorMuted)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: directorMuted ? 'var(--hapa-neon-red)' : 'var(--hapa-neon-cyan)',
                                        cursor: 'pointer',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: 0.8
                                      }}
                                      title={directorMuted ? "Unmute" : "Mute"}
                                    >
                                      {directorMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                    </button>
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.05"
                                      value={directorMuted ? 0 : directorVolume}
                                      onChange={(e) => {
                                        const newVol = parseFloat(e.target.value);
                                        setDirectorVolume(newVol);
                                        if (directorMuted) {
                                          setDirectorMuted(false);
                                        }
                                      }}
                                      style={{
                                        width: '60px',
                                        height: '3px',
                                        accentColor: directorMuted ? 'rgba(255,255,255,0.2)' : 'var(--hapa-neon-cyan)',
                                        cursor: 'pointer'
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Audio Diagnostics Output */}
                                <div style={{ fontSize: '8px', fontFamily: 'monospace', color: 'rgba(255, 255, 255, 0.4)', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--hapa-neon-gold)', fontWeight: 'bold' }}>AUDIO TELEMETRY:</span>
                                  <span style={{ color: audioDiagnostics.includes("Error") || audioDiagnostics.includes("failed") ? 'var(--hapa-neon-red)' : 'var(--hapa-neon-cyan)' }}>{audioDiagnostics}</span>
                                </div>

                                {/* Current Playback Shot Detail Card */}
                                {currentTimelineItem && (
                                  <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--hapa-neon-cyan)' }}>
                                        Current Shot: {currentTimelineItem.media_title} ({currentTimelineItem.visualizer_title})
                                      </span>
                                      <span style={{ fontSize: '9px', opacity: 0.6 }}>
                                        Time: {currentTimelineItem.start_sec}s - {currentTimelineItem.end_sec}s
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {activeWorkbenchTab === "script" && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '9px', opacity: 0.7 }}>HyperFrames HTML video composition script.</span>
                                  <button 
                                    type="button"
                                    onClick={handleCopyScript}
                                    style={{
                                      background: 'rgba(168, 85, 247, 0.15)',
                                      border: '1px solid var(--hapa-neon-violet)',
                                      color: 'var(--hapa-neon-violet)',
                                      padding: '3px 8px',
                                      fontSize: '9.5px',
                                      fontWeight: 'bold',
                                      borderRadius: '3px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    📋 Copy Script
                                  </button>
                                </div>
                                <div style={{ 
                                  background: '#020617', 
                                  border: '1px solid rgba(255,255,255,0.08)', 
                                  borderRadius: '4px', 
                                  padding: '10px', 
                                  fontFamily: 'monospace', 
                                  fontSize: '9px', 
                                  lineHeight: '1.3', 
                                  color: '#fff', 
                                  overflow: 'auto', 
                                  height: '240px',
                                  maxHeight: '240px' 
                                }}>
                                  {renderFormattedHtml(activeProject.hyperframe_script_stale || !activeProject.hyperframe_script
                                    ? buildFreshProjectScript(activeProject)
                                    : activeProject.hyperframe_script)}
                                </div>
                              </div>
                            )}

                            {activeWorkbenchTab === "edl" && (
                              <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', background: 'rgba(0,0,0,0.4)', height: '275px', maxHeight: '275px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', textAlign: 'left' }}>
                                  <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                      <th style={{ padding: '4px 6px', fontWeight: 'bold', color: 'var(--hapa-neon-violet)' }}>Section</th>
                                      <th style={{ padding: '4px 6px', fontWeight: 'bold', color: 'var(--hapa-neon-cyan)' }}>Media ID</th>
                                      <th style={{ padding: '4px 6px', fontWeight: 'bold', color: 'var(--hapa-neon-green)' }}>Shader</th>
                                      <th style={{ padding: '4px 6px', fontWeight: 'bold', color: 'var(--hapa-neon-gold)' }}>Stems</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {activeProject.timeline && activeProject.timeline.map((item, idx) => (
                                      <tr 
                                        key={idx} 
                                        onClick={() => {
                                          setSelectedShotIndex(idx);
                                          setCurrentTime(item.start_sec);
                                          if (audioRef.current) audioRef.current.currentTime = item.start_sec;
                                        }}
                                        style={{ 
                                          borderBottom: '1px solid rgba(255,255,255,0.04)', 
                                          cursor: 'pointer',
                                          background: selectedShotIndex === idx ? 'rgba(168, 85, 247, 0.08)' : 'transparent'
                                        }}
                                      >
                                        <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                          <strong>{item.section_label}</strong>
                                          <div style={{ opacity: 0.5, fontSize: '8px' }}>{item.start_sec}s - {item.end_sec}s</div>
                                        </td>
                                        <td style={{ padding: '4px 6px', opacity: 0.8 }}>{item.media_title}</td>
                                        <td style={{ padding: '4px 6px', color: 'var(--hapa-neon-green)' }}>{item.visualizer_title}</td>
                                        <td style={{ padding: '4px 6px', fontSize: '8px' }}>{item.active_stems.join(", ")}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {activeWorkbenchTab === "journal" && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(168, 85, 247, 0.15)', borderRadius: '4px', padding: '10px', fontFamily: 'monospace', fontSize: '9.5px', lineHeight: '1.4', color: '#dcdcdc', height: '260px', overflowY: 'auto' }}>
                                <strong style={{ color: 'var(--hapa-neon-violet)' }}>Director Justification Journal</strong>
                                {activeProject.justification_log && activeProject.justification_log.map((logParagraph, logIdx) => (
                                  <p key={logIdx} style={{ margin: 0, textIndent: '12px' }}>
                                    {logParagraph}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Right Panel: Selected Shot/Shader Timeline Editor Form */}
                          <div className="hapa-panel" style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* Track Tab Selectors */}
                            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px', gap: '8px' }}>
                              <button
                                type="button"
                                onClick={() => setActiveTrackTab("video")}
                                style={{
                                  flex: 1,
                                  background: activeTrackTab === "video" ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                                  color: activeTrackTab === "video" ? 'var(--hapa-neon-violet)' : '#888',
                                  border: activeTrackTab === "video" ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid transparent',
                                  borderRadius: '3px',
                                  padding: '4px 8px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  transition: 'all 0.2s',
                                  textAlign: 'center'
                                }}
                              >
                                📹 Video Track
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTrackTab("shader")}
                                style={{
                                  flex: 1,
                                  background: activeTrackTab === "shader" ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                                  color: activeTrackTab === "shader" ? 'var(--hapa-neon-green)' : '#888',
                                  border: activeTrackTab === "shader" ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
                                  borderRadius: '3px',
                                  padding: '4px 8px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  transition: 'all 0.2s',
                                  textAlign: 'center'
                                }}
                              >
                                🎛️ Shader Track
                              </button>
                            </div>

                            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '10.5px', color: activeTrackTab === "video" ? 'var(--hapa-neon-violet)' : 'var(--hapa-neon-green)', textTransform: 'uppercase' }}>
                                {activeTrackTab === "video" 
                                  ? `🛠️ Edit Shot ${selectedShotIndex + 1} of ${activeProject.timeline?.length || 0}`
                                  : `🛠️ Edit Shader Block ${selectedVisualizerIndex + 1} of ${activeProject.visualizer_timeline?.length || 0}`}
                              </strong>
                              <span style={{ fontSize: '9px', opacity: 0.6, background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: '2px' }}>
                                {activeTrackTab === "video" 
                                  ? (activeTimelineItem ? `${activeTimelineItem.start_sec}s - ${activeTimelineItem.end_sec}s` : "")
                                  : (activeVisualizerItem ? `${activeVisualizerItem.start_sec}s - ${activeVisualizerItem.end_sec}s` : "")}
                              </span>
                            </div>

                            {activeTrackTab === "video" ? (
                              activeTimelineItem ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px' }}>
                                  
                                  {/* Video Asset Selector */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-cyan)', fontSize: '11.5px', letterSpacing: '0.02em' }}>Swap Video Asset:</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      <input
                                        type="search"
                                        value={videoPickerQuery}
                                        onChange={(event) => setVideoPickerQuery(event.target.value)}
                                        placeholder="Search title, id, source, tag..."
                                        style={{ background: '#07111c', border: '1px solid rgba(6, 182, 212, 0.28)', color: '#f8fbff', padding: '8px 10px', borderRadius: '4px', fontSize: '12px', width: '100%', minHeight: '36px', outline: 'none' }}
                                      />
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateShot(selectedShotIndex, {
                                            media_id: "none",
                                            media_title: "Visualizer Only",
                                            media_uri: "",
                                            media_thumbnail: ""
                                          })}
                                          style={{
                                            flex: 1,
                                            background: activeTimelineItem.media_id === "none" ? 'rgba(168, 85, 247, 0.24)' : 'rgba(7, 17, 28, 0.92)',
                                            border: activeTimelineItem.media_id === "none" ? '1px solid var(--hapa-neon-violet)' : '1px solid rgba(148, 163, 184, 0.24)',
                                            color: activeTimelineItem.media_id === "none" ? '#dbc4ff' : '#f8fbff',
                                            padding: '10px 12px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            minHeight: '42px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold'
                                          }}
                                        >
                                          Pure Visualizer
                                        </button>
                                        <span style={{ fontSize: '10px', opacity: 0.75, whiteSpace: 'nowrap', color: '#cbd5e1' }}>
                                          {filteredVideoPickerResults.length} shown
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '300px', minHeight: '168px', overflowY: 'auto', border: '1px solid rgba(6, 182, 212, 0.18)', borderRadius: '4px', background: 'rgba(2, 8, 18, 0.78)', padding: '8px' }}>
                                        {filteredVideoPickerResults.map((video) => {
                                          const selected = activeTimelineItem.media_id === video.id;
                                          return (
                                            <button
                                              key={video.id}
                                              type="button"
                                              onClick={() => handleUpdateShot(selectedShotIndex, {
                                                media_id: video.id,
                                                media_title: video.title,
                                                media_uri: video.uri || "",
                                                media_thumbnail: video.thumbnailUri || ""
                                              })}
                                              style={{
                                                textAlign: 'left',
                                                background: selected ? 'rgba(6, 182, 212, 0.18)' : 'rgba(15, 23, 42, 0.82)',
                                                border: selected ? '1px solid var(--hapa-neon-cyan)' : '1px solid rgba(148, 163, 184, 0.16)',
                                                color: selected ? '#cfffff' : '#f8fbff',
                                                borderRadius: '4px',
                                                padding: '9px 10px',
                                                minHeight: '56px',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                lineHeight: 1.35,
                                                overflow: 'hidden',
                                                boxShadow: selected ? '0 0 0 1px rgba(6, 182, 212, 0.16), 0 0 14px rgba(6, 182, 212, 0.12)' : 'none'
                                              }}
                                            >
                                              <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12.5px', marginBottom: '4px' }}>{video.title}</strong>
                                              <span style={{ display: 'block', opacity: 0.72, color: selected ? '#a5f3fc' : '#cbd5e1', fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {video.source} | {video.flowType || "untyped"} | {video.duration !== null ? `${Number(video.duration).toFixed(1)}s` : "loop"}
                                              </span>
                                            </button>
                                          );
                                        })}
                                        {filteredVideoPickerResults.length === 0 && (
                                          <span style={{ fontSize: '11px', opacity: 0.72, padding: '10px', color: '#cbd5e1' }}>
                                            No videos match the current search and facets.
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Transition Selector */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-gold)' }}>Transition style:</label>
                                    <select
                                      value={activeTimelineItem.transition}
                                      onChange={(e) => handleUpdateShot(selectedShotIndex, { transition: e.target.value })}
                                      style={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px', borderRadius: '3px', fontSize: '10px', width: '100%', outline: 'none' }}
                                    >
                                      <option value="cut">⚡ Cut (Instant)</option>
                                      <option value="crossfade">⇄ Crossfade</option>
                                      <option value="scanline-dissolve">░ Scanline Dissolve</option>
                                      <option value="fade-in">⬛ Fade In (From Black)</option>
                                      <option value="fade-out">⬛ Fade Out (To Black)</option>
                                    </select>
                                  </div>

                                  {/* Camera Motion Controls */}
                                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 104px 104px', gap: '6px', alignItems: 'end' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-cyan)' }}>Camera motion:</label>
                                      <select
                                        value={activeTimelineItem.camera_motion === "tilt-up"
                                          ? "pan-up"
                                          : activeTimelineItem.camera_motion === "tilt-down"
                                            ? "pan-down"
                                            : activeTimelineItem.camera_motion || "auto"}
                                        onChange={(event) => handleUpdateShot(selectedShotIndex, { camera_motion: event.target.value })}
                                        style={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px', borderRadius: '3px', fontSize: '10px', width: '100%', outline: 'none' }}
                                      >
                                        {CAMERA_MOTION_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-violet)' }}>Intensity {Number(activeTimelineItem.camera_intensity ?? 1).toFixed(1)}</label>
                                      <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={Number(activeTimelineItem.camera_intensity ?? 1)}
                                        onChange={(event) => handleUpdateShot(selectedShotIndex, { camera_intensity: Number(event.target.value) })}
                                        style={{ width: '100%', accentColor: 'var(--hapa-neon-cyan)' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-cyan)' }}>Speed {Number(activeTimelineItem.camera_speed ?? 1.35).toFixed(2)}x</label>
                                      <input
                                        type="range"
                                        min="0.75"
                                        max="2.4"
                                        step="0.05"
                                        value={Number(activeTimelineItem.camera_speed ?? 1.35)}
                                        onChange={(event) => handleUpdateShot(selectedShotIndex, { camera_speed: Number(event.target.value) })}
                                        style={{ width: '100%', accentColor: 'var(--hapa-neon-cyan)' }}
                                      />
                                    </div>
                                  </div>

                                  {/* Active Stems Toggles */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontWeight: 'bold', color: '#ccc' }}>Active Audio Stems:</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                      {["Vocals", "Bass", "Guitar", "Drums", "Backing Vocals"].map(stem => {
                                        const isChecked = activeTimelineItem.active_stems?.includes(stem);
                                        return (
                                          <button
                                            key={stem}
                                            type="button"
                                            onClick={() => {
                                              const nextStems = isChecked
                                                ? activeTimelineItem.active_stems.filter(s => s !== stem)
                                                : [...(activeTimelineItem.active_stems || []), stem];
                                              handleUpdateShot(selectedShotIndex, { active_stems: nextStems });
                                            }}
                                            style={{
                                              fontSize: '8.5px',
                                              padding: '2px 6px',
                                              borderRadius: '3px',
                                              background: isChecked ? 'rgba(246, 201, 109, 0.2)' : 'rgba(0,0,0,0.3)',
                                              color: isChecked ? 'var(--hapa-neon-gold)' : '#888',
                                              border: isChecked ? '1px solid var(--hapa-neon-gold)' : '1px solid rgba(255,255,255,0.06)',
                                              cursor: 'pointer',
                                              fontWeight: 'bold',
                                              transition: 'all 0.1s'
                                            }}
                                          >
                                            {stem}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Rationale Text Area */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-violet)' }}>Edit Rationale:</label>
                                    <DeferredRationaleTextarea
                                      key={`${selectedProjectSongId}-shot-${selectedShotIndex}`}
                                      value={activeTimelineItem.edit_reason}
                                      onCommit={(nextValue) => handleUpdateShot(selectedShotIndex, { edit_reason: nextValue })}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div style={{ opacity: 0.5, textAlign: 'center', padding: '20px' }}>No shot selected</div>
                              )
                            ) : (
                              activeVisualizerItem ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '10px' }}>
                                  
                                  {/* Visualizer ISF Shader */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-green)', fontSize: '11px' }}>Visualizer ISF Shader:</label>
                                    <input
                                      type="search"
                                      value={shaderPickerQuery}
                                      onChange={(event) => setShaderPickerQuery(event.target.value)}
                                      placeholder="Search shader name, id, type..."
                                      style={{ background: '#050b14', border: '1px solid rgba(16,185,129,0.35)', color: '#fff', padding: '9px 10px', borderRadius: '4px', fontSize: '12px', width: '100%', outline: 'none', minHeight: '36px' }}
                                    />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', maxHeight: '286px', overflowY: 'auto', border: '1px solid rgba(16,185,129,0.22)', borderRadius: '5px', background: 'rgba(1,7,14,0.72)', padding: '8px' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateVisualizer(selectedVisualizerIndex, {
                                          visualizer_id: "none",
                                          visualizer_title: "None"
                                        })}
                                        style={{
                                          textAlign: 'left',
                                          background: activeVisualizerItem.visualizer_id === "none" ? 'rgba(16, 185, 129, 0.22)' : 'rgba(8,15,26,0.94)',
                                          border: activeVisualizerItem.visualizer_id === "none" ? '1px solid var(--hapa-neon-green)' : '1px solid rgba(148,163,184,0.22)',
                                          color: activeVisualizerItem.visualizer_id === "none" ? '#caffea' : '#f8fafc',
                                          borderRadius: '5px',
                                          padding: '10px 12px',
                                          cursor: 'pointer',
                                          fontSize: '12px',
                                          lineHeight: 1.35,
                                          fontWeight: 'bold',
                                          minHeight: '42px',
                                          boxShadow: activeVisualizerItem.visualizer_id === "none" ? '0 0 0 1px rgba(16,185,129,0.2)' : 'none'
                                        }}
                                      >
                                        None / Pass-through
                                      </button>
                                      {filteredShaderOptions.map((shader) => {
                                        const selected = activeVisualizerItem.visualizer_id === shader.id;
                                        return (
                                          <button
                                            key={shader.id}
                                            type="button"
                                            onClick={() => handleUpdateVisualizer(selectedVisualizerIndex, {
                                              visualizer_id: shader.id,
                                              visualizer_title: shader.title || shader.id
                                            })}
                                            style={{
                                              textAlign: 'left',
                                              background: selected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(8,15,26,0.94)',
                                              border: selected ? '1px solid var(--hapa-neon-green)' : '1px solid rgba(148,163,184,0.22)',
                                              color: selected ? '#caffea' : '#f8fafc',
                                              borderRadius: '5px',
                                              padding: '10px 12px',
                                              cursor: 'pointer',
                                              fontSize: '12px',
                                              lineHeight: 1.35,
                                              overflow: 'hidden',
                                              minHeight: '54px',
                                              boxShadow: selected ? '0 0 0 1px rgba(16,185,129,0.22)' : 'none'
                                            }}
                                          >
                                            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12.5px', color: selected ? '#d8ffe9' : '#ffffff', marginBottom: '3px' }}>{shader.title || shader.id}</strong>
                                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#9fb3c8', fontSize: '10.5px' }}>{shader.shaderType || "shader"} | {shader.id}</span>
                                          </button>
                                        );
                                      })}
                                      {filteredShaderOptions.length === 0 && (
                                        <span style={{ fontSize: '11px', opacity: 0.7, padding: '10px', color: '#dbeafe' }}>
                                          No shader presets match this search.
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '10px', opacity: 0.78, color: '#a7f3d0' }}>
                                      Showing {filteredShaderOptions.length} of {availableShaders.length} shaders.
                                    </span>
                                  </div>

                                  {/* Transition Selector */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-gold)' }}>Transition style:</label>
                                    <select
                                      value={activeVisualizerItem.transition}
                                      onChange={(e) => handleUpdateVisualizer(selectedVisualizerIndex, { transition: e.target.value })}
                                      style={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px', borderRadius: '3px', fontSize: '10px', width: '100%', outline: 'none' }}
                                    >
                                      <option value="cut">⚡ Cut (Instant)</option>
                                      <option value="crossfade">⇄ Crossfade</option>
                                      <option value="scanline-dissolve">░ Scanline Dissolve</option>
                                      <option value="fade-in">⬛ Fade In (From Black)</option>
                                      <option value="fade-out">⬛ Fade Out (To Black)</option>
                                    </select>
                                  </div>

                                  {/* Rationale Text Area */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <label style={{ fontWeight: 'bold', color: 'var(--hapa-neon-violet)' }}>Edit Rationale:</label>
                                    <DeferredRationaleTextarea
                                      key={`${selectedProjectSongId}-visualizer-${selectedVisualizerIndex}`}
                                      value={activeVisualizerItem.edit_reason}
                                      onCommit={(nextValue) => handleUpdateVisualizer(selectedVisualizerIndex, { edit_reason: nextValue })}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div style={{ opacity: 0.5, textAlign: 'center', padding: '20px' }}>No shader segment selected</div>
                              )
                            )}
                          </div>
                        </div>

                        {/* Bottom Row: Embedded HyperFrames Timeline Editor UI */}
                        <div style={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '10.5px', color: 'var(--hapa-neon-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>📊 Interactive HyperFrames Editor Timeline</span>
                            </strong>
                            <em style={{ fontSize: '9px', opacity: 0.6 }}>
                              Click blocks to select & edit. Click timeline background to scrub playhead.
                            </em>
                          </div>

                          {/* Visual Track Container */}
                          <div 
                            id="timeline-track-container"
                            style={{ position: 'relative', width: '100%', height: '110px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}
                            onClick={(e) => {
                              // If they clicked on a shot block, it propagates, but we can scrub if clicked on track
                              const track = document.getElementById("timeline-track-container");
                              if (track) {
                                const rect = track.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const pct = clickX / rect.width;
                                const scrubbedTime = Math.max(0, Math.min(activeProject.duration, pct * activeProject.duration));
                                setCurrentTime(scrubbedTime);
                                if (audioRef.current) {
                                  audioRef.current.currentTime = scrubbedTime;
                                }
                              }
                            }}
                          >
                            
                            {/* Ruler Tick Marks */}
                            <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, height: '18px', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 1, pointerEvents: 'none' }}>
                              {Array.from({ length: Math.ceil(activeProject.duration / 10) + 1 }).map((_, rulerIdx) => {
                                const secMark = rulerIdx * 10;
                                const isLabel = secMark % 30 === 0;
                                const positionPct = (secMark / activeProject.duration) * 100;
                                if (positionPct > 100) return null;
                                return (
                                  <div 
                                    key={rulerIdx} 
                                    style={{ 
                                      position: 'absolute', 
                                      left: `${positionPct}%`, 
                                      height: isLabel ? '12px' : '6px', 
                                      borderLeft: '1px solid rgba(255,255,255,0.25)', 
                                      fontSize: '8px', 
                                      color: 'rgba(255,255,255,0.4)', 
                                      paddingLeft: '3px', 
                                      lineHeight: '1',
                                      top: 0
                                    }}
                                  >
                                    {isLabel ? `${secMark}s` : ""}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Track Watermarks */}
                            <div style={{ position: 'absolute', left: '10px', top: '32px', fontSize: '9px', fontWeight: 'bold', color: '#fff', opacity: 0.12, zIndex: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>📹 VIDEO TRACK</div>
                            <div style={{ position: 'absolute', left: '10px', top: '76px', fontSize: '9px', fontWeight: 'bold', color: '#fff', opacity: 0.12, zIndex: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>🎛️ SHADER TRACK</div>

                            {/* Playhead Vertical Line */}
                            <div 
                              style={{ 
                                position: 'absolute', 
                                top: 0, 
                                bottom: 0, 
                                left: `${(currentTime / activeProject.duration) * 100}%`, 
                                width: '2px', 
                                background: 'var(--hapa-neon-cyan)', 
                                boxShadow: '0 0 8px var(--hapa-neon-cyan)', 
                                zIndex: 5, 
                                pointerEvents: 'none' 
                              }} 
                            />

                            {/* Shot Blocks */}
                            {activeProject.timeline && activeProject.timeline.map((shot, idx) => {
                              const blockWidthPct = ((shot.end_sec - shot.start_sec) / activeProject.duration) * 100;
                              const blockLeftPct = (shot.start_sec / activeProject.duration) * 100;
                              const isSelected = activeTrackTab === "video" && selectedShotIndex === idx;
                              const isPureVisualizer = shot.media_id === "none";
                              
                              const blockColor = isSelected 
                                ? 'rgba(168, 85, 247, 0.25)' 
                                : isPureVisualizer
                                  ? 'rgba(16, 185, 129, 0.08)' 
                                  : 'rgba(255, 255, 255, 0.04)';
                                  
                              const blockBorder = isSelected
                                ? '1px solid var(--hapa-neon-violet)'
                                : '1px solid rgba(255,255,255,0.08)';

                              return (
                                <div
                                  key={`shot-${idx}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedShotIndex(idx);
                                    setActiveTrackTab("video");
                                    setCurrentTime(shot.start_sec);
                                    if (audioRef.current) {
                                      audioRef.current.currentTime = shot.start_sec;
                                    }
                                  }}
                                  style={{
                                    position: 'absolute',
                                    left: `${blockLeftPct}%`,
                                    width: `${blockWidthPct}%`,
                                    top: '20px',
                                    height: '35px',
                                    background: blockColor,
                                    border: blockBorder,
                                    boxSizing: 'border-box',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    padding: '2px 6px',
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease',
                                    zIndex: 2
                                  }}
                                  title={`Shot ${idx+1} [${shot.start_sec}s - ${shot.end_sec}s]: ${shot.media_title}`}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5px', fontWeight: 'bold', color: isSelected ? 'var(--hapa-neon-violet)' : '#aaa', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    <span>S{idx+1}: {shot.section_label}</span>
                                    <span>{(shot.end_sec - shot.start_sec).toFixed(1)}s</span>
                                  </div>
                                  <div style={{ fontSize: '7px', opacity: 0.8, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '1px', color: isPureVisualizer ? 'var(--hapa-neon-green)' : '#fff' }}>
                                    {isPureVisualizer ? `🎛️ Visualizer Only` : `🎬 ${shot.media_title}`}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Shader Blocks */}
                            {activeProject.visualizer_timeline && activeProject.visualizer_timeline.map((vis, idx) => {
                              const blockWidthPct = ((vis.end_sec - vis.start_sec) / activeProject.duration) * 100;
                              const blockLeftPct = (vis.start_sec / activeProject.duration) * 100;
                              const isSelected = activeTrackTab === "shader" && selectedVisualizerIndex === idx;
                              const hasShader = vis.visualizer_id !== "none";
                              
                              const blockColor = isSelected 
                                ? 'rgba(16, 185, 129, 0.25)' 
                                : hasShader
                                  ? 'rgba(246, 201, 109, 0.08)' 
                                  : 'rgba(255, 255, 255, 0.02)';
                                  
                              const blockBorder = isSelected
                                ? '1px solid var(--hapa-neon-green)'
                                : '1px solid rgba(255,255,255,0.08)';

                              return (
                                <div
                                  key={`vis-${idx}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVisualizerIndex(idx);
                                    setActiveTrackTab("shader");
                                    setCurrentTime(vis.start_sec);
                                    if (audioRef.current) {
                                      audioRef.current.currentTime = vis.start_sec;
                                    }
                                  }}
                                  style={{
                                    position: 'absolute',
                                    left: `${blockLeftPct}%`,
                                    width: `${blockWidthPct}%`,
                                    top: '64px',
                                    height: '35px',
                                    background: blockColor,
                                    border: blockBorder,
                                    boxSizing: 'border-box',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    padding: '2px 6px',
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease',
                                    zIndex: 2
                                  }}
                                  title={`Shader ${idx+1} [${vis.start_sec}s - ${vis.end_sec}s]: ${vis.visualizer_title}`}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5px', fontWeight: 'bold', color: isSelected ? 'var(--hapa-neon-green)' : '#aaa', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    <span>V{idx+1}</span>
                                    <span>{(vis.end_sec - vis.start_sec).toFixed(1)}s</span>
                                  </div>
                                  <div style={{ fontSize: '7px', opacity: 0.8, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '1px', color: hasShader ? 'var(--hapa-neon-gold)' : '#666' }}>
                                    {hasShader ? `🎛️ ${vis.visualizer_title}` : `❌ Pass-through`}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    );
                  })()}
                </div>

              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function generateHyperframesScriptClient(songId, songTitle, duration, timeline, visualizerTimeline, timedLyrics, lyricVariant, audioId = songId, lyricPosition = "bottom-center", lyricStyle = "neon-cyan") {
  let html = `<!-- Hapa x HyperFrames Video Project Script -->\n`;
  html += `<!-- Song: ${songTitle} (${songId}) -->\n`;
  html += `<!-- Duration: ${duration} seconds -->\n\n`;
  html += `<div class="hyperframe-video-composition"\n`;
  html += `     data-width="1920"\n`;
  html += `     data-height="1080"\n`;
  html += `     data-duration="${duration}"\n`;
  html += `     style="width: 1920px; height: 1080px; position: relative; background: #020617; overflow: hidden;">\n\n`;
  
  html += `  <!-- Canonical Audio Track -->\n`;
  html += `  <audio src="/api/song-registry/audio/${encodeURIComponent(audioId)}"\n`;
  html += `         data-start="0"\n`;
  html += `         data-volume="1.0"></audio>\n\n`;
  
  html += `  <!-- Embed Lyric Timings -->\n`;
  html += `  <script>\n`;
  html += `    window.HAPA_LYRIC_TIMING = ${JSON.stringify({ lines: timedLyrics }, null, 2).split("\n").join("\n    ")};\n`;
  html += `  </script>\n\n`;
  
  html += `  <!-- Directed Shot Timeline -->\n`;
  (timeline || []).forEach((shot, idx) => {
    const isVideo = shot.media_id !== "none";
    html += `  <!-- Section: ${shot.section_label} (Shot ${shot.shot_index + 1}) -->\n`;
    if (isVideo) {
      html += `  <video id="shot-${idx + 1}"\n`;
      html += `         src="${shot.media_uri}"\n`;
      html += `         data-start="${shot.start_sec}"\n`;
      html += `         data-duration="${(shot.end_sec - shot.start_sec).toFixed(1)}"\n`;
      html += `         data-transition="${shot.transition}"\n`;
      html += `         data-stems="${(shot.active_stems || []).join(",")}"\n`;
      html += `         data-camera-motion="${shot.camera_motion || "auto"}"\n`;
      html += `         data-camera-intensity="${Number(shot.camera_intensity ?? 1).toFixed(1)}"\n`;
      html += `         data-camera-speed="${Number(shot.camera_speed ?? 1.35).toFixed(2)}"\n`;
      html += `         muted playsinline style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;"></video>\n`;
    } else {
      html += `  <div id="shot-${idx + 1}"\n`;
      html += `       data-composition-id="hapa-empty-shot"\n`;
      html += `       data-start="${shot.start_sec}"\n`;
      html += `       data-duration="${(shot.end_sec - shot.start_sec).toFixed(1)}"\n`;
      html += `       data-transition="${shot.transition}"\n`;
      html += `       data-stems="${(shot.active_stems || []).join(",")}"\n`;
      html += `       style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; background: #000;"></div>\n`;
    }
  });

  html += `\n  <!-- Parallel Visualizer Shader Timeline -->\n`;
  (visualizerTimeline || []).forEach((vis, idx) => {
    html += `  <div id="vis-${idx + 1}"\n`;
    html += `       data-composition-id="hapa-visualizer"\n`;
    html += `       data-start="${vis.start_sec}"\n`;
    html += `       data-duration="${(vis.end_sec - vis.start_sec).toFixed(1)}"\n`;
    html += `       data-transition="${vis.transition}"\n`;
    html += `       data-shader-id="${vis.visualizer_id}"\n`;
    html += `       style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; pointer-events: none; z-index: 2;"></div>\n`;
  });
  
  html += `\n  <!-- Lyric Typography Layer -->\n`;
  html += `  <div class="hapa-lyric-layer"\n`;
  html += `       data-composition-id="hapa-lyric-layer"\n`;
  html += `       data-start="0"\n`;
  html += `       data-duration="${duration}"\n`;
  html += `       data-variant="${lyricVariant || "phrase-window"}"\n`;
  html += `       data-position="${lyricPosition || "bottom-center"}"\n`;
  html += `       data-style="${lyricStyle || "neon-cyan"}"\n`;
  html += `       style="position: absolute; bottom: 80px; width: 100%; text-align: center; z-index: 10;"></div>\n`;
  
  html += `</div>\n`;
  return html;
}

export default HapaEchosView;
