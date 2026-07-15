import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Clapperboard,
  Film,
  KanbanSquare,
  Maximize2,
  Minimize2,
  Music,
  Search,
  Volume2,
  VolumeX,
  WandSparkles
} from "lucide-react";
import { normalizePlaybackPowerMode } from "../domain/playback-power-mode.js";
import { echoProjectAudioRoute } from "../domain/echo-audio-route.js";
import { mapEchoSourceTime, planEchoPlaybackCorrection } from "../domain/echo-playback-sync.js";
import {
  echoVisualizerAudioEnvelope,
  normalizeEchoStemFocus,
  resolveVerifiedEchoStemBinding,
} from "../domain/echo-visualizer-audio-envelope.js";
import { createEchoPlaybackEngine } from "../domain/echo-playback-engine.js";
import {
  createEchoIsfSurface,
  createEchoIsfPlaybackPool,
  visualizerLookaheadCards,
} from "../domain/echo-isf-browser-runtime.js";
import { echoIsfRequiredStemFocuses } from "../domain/echo-isf-frame-intent.js";
import {
  createEchoLiveSignalTracker,
  echoStemDecoderRetryDue,
  evaluateEchoStemTransportHealth,
  nextEchoStemDecoderRetryState,
  sampleEchoLiveSignalFrame,
} from "../domain/echo-live-signal-transport.js";
import {
  buildEchoShaderPickerPreviewCard,
  echoLegacyCanvasApproximation,
  echoShaderPickerCategories,
  echoShaderPickerEntry,
  filterEchoShaderPickerShaders,
} from "../domain/echo-shader-picker.js";
import {
  buildVisualizerRendererTruthReceipt,
  resolveVisualizerRendererTruth,
} from "../domain/visualizer-renderer-capability.js";
import VariationLabPanel from "./VariationLabPanel.jsx";
import MultitrackDirectorEditor from "./MultitrackDirectorEditor.jsx";
import SongCardMintPanel from "./SongCardMintPanel.jsx";
import PalmierRoundTripPanel from "./PalmierRoundTripPanel.jsx";
import ShotDecisionInspectorPanel from "./ShotDecisionInspectorPanel.jsx";
import { appendShotPreferenceEvent } from "../domain/shot-decision-inspector.js";
import TasteMemoryPanel from "./TasteMemoryPanel.jsx";
import { appendTasteEvidence, createTasteMemory } from "../domain/human-taste-memory.js";
import AlbumLiveSetPanel from "./AlbumLiveSetPanel.jsx";
import { generateEchoHyperframeScript } from "../domain/echo-hyperframe-script.js";
import {
  ECHO_OUTPUT_PROFILES,
  attachEchoOutputProfile,
  resolveEchoOutputProfile,
} from "../domain/echo-output-profile.js";
import {
  echoCameraCropPresentation,
  echoCameraKeyframeAt,
} from "../domain/echo-camera-framing.js";
import { projectToEditorGraph } from "../domain/multitrack-editor.js";
import {
  buildEchoDirectionForkRequest,
  createEchoDirectionWorkingFork,
  deriveEchoDirectionVariantProject,
  deriveEchoDirectionWorkingProject,
  echoDirectionVariantId,
  echoDirectionVariantOptionLabel,
  echoDirectionVariantTitle,
  groupEchoDirectionVariants,
} from "../domain/echo-direction-variants.js";

const electronApiBase = globalThis.window?.hapaAvatarBuilder?.apiBase;
const API_BASE = electronApiBase || (globalThis.location?.port === "5178" ? "http://127.0.0.1:8787" : "");
const songRegistryApiBase = globalThis.window?.hapaAvatarBuilder?.songRegistryApiBase;
const SONG_REGISTRY_API_BASE = songRegistryApiBase || "http://127.0.0.1:8798";
const ECHO_SAVE_TIMEOUT_MS = 30_000;
const ECHO_PROJECT_DETAIL_TIMEOUT_MS = 15_000;
const ECHO_EXPANDED_PREVIEW_WIDTH = "min(calc(100vw - 32px), calc(177.7778vh - 384px))";
const ECHO_VERTICAL_EXPANDED_PREVIEW_WIDTH = "min(calc(100vw - 32px), calc(56.25vh - 121.5px))";
const ECHO_EXPANDED_PREVIEW_MAX_HEIGHT = "calc(100vh - 216px)";
const ECHO_STEM_DECODER_POOL_LIMIT = 6;

function directorPreviewIsFullscreen(documentRef, previewSurface) {
  const fullscreenElement = documentRef?.fullscreenElement || documentRef?.webkitFullscreenElement || null;
  return Boolean(fullscreenElement && previewSurface && fullscreenElement === previewSurface);
}

async function saveEchoProjectRequest(url, options = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ECHO_SAVE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut || error?.name === "AbortError") {
      throw new Error("Save stopped after 30 seconds without a disk acknowledgment. The previous cut is unchanged; retry when ready.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function resolveMediaUri(uri) {
  if (typeof uri !== "string" || !uri) return uri;
  if (/^(data:|blob:|https?:)/.test(uri)) return uri;
  const base = API_BASE || "http://127.0.0.1:8787";
  const decodeLocalPath = (value) => { try { return decodeURIComponent(value); } catch { return value; } };
  if (/^file:\/+/.test(uri)) return `${base}/api/local-file?path=${encodeURIComponent(decodeLocalPath(uri.replace(/^file:\/+/, "/")))}`;
  if (/^\/Users\//.test(uri)) return `${base}/api/local-file?path=${encodeURIComponent(decodeLocalPath(uri))}`;
  if (uri.startsWith("/media/") || uri.startsWith("/api/local-file")) {
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

function echoMediaCohort(video = {}) {
  const tags = new Set((video.tags || []).map((tag) => String(tag).toLowerCase()));
  if (tags.has("scroll-fal")) return "fal";
  if (tags.has("scroll-site")) return "scroll-site";
  return "";
}

function echoMediaSourceLabel(video = {}) {
  if (video.source === "scene") return "Scene";
  if (video.source === "avatar_card") return "Avatar Card";
  if (video.source === "system_media") {
    const cohort = echoMediaCohort(video);
    if (cohort === "fal") return "System Media · FAL";
    if (cohort === "scroll-site") return "System Media · Scroll Site";
    return "System Media";
  }
  return video.source || "Media";
}

function echoMediaTagLabel(tag) {
  if (tag === "scroll-site") return "Scroll Site";
  if (tag === "scroll-fal") return "FAL";
  return tag;
}

function shotMediaType(shot) {
  if (shot?.media_contract?.type) return shot.media_contract.type;
  if (!shot?.media_uri || shot.media_id === "none") return "generated-visualizer";
  return /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(shot.media_uri) ? "image" : "video";
}

function shotRuntimeUri(shot) {
  return shot?.media_contract?.runtimeUri || shot?.runtime_media_uri || shot?.media_uri || "";
}

function isPresentedEchoVideoElement(element, expectedSourceKey = "") {
  return Boolean(
    element
    && element.dataset?.echoPlayer === "current"
    && element.dataset?.framePresented === "true"
    && (!expectedSourceKey || element.dataset?.echoSourceKey === expectedSourceKey)
    && Number(element.readyState || 0) >= 2
    && Number(element.videoWidth || 0) > 0
    && !element.seeking
    && !element.error
  );
}

function resolvePresentedEchoMediaBinding(surface, shot, callbackBinding = null) {
  const mediaId = String(shot?.media_id || "");
  const uri = resolveMediaUri(shotRuntimeUri(shot));
  const sourceKey = `${mediaId}:${uri}`;
  const callbackMatches = callbackBinding?.presented
    && callbackBinding.element
    && callbackBinding.mediaId === mediaId
    && callbackBinding.uri === uri;
  if (callbackMatches && (
    callbackBinding.kind !== "video"
    || isPresentedEchoVideoElement(callbackBinding.element, sourceKey)
  )) return callbackBinding;

  const element = surface?.querySelector?.('video[data-echo-player="current"][data-frame-presented="true"]');
  if (!isPresentedEchoVideoElement(element, sourceKey)) return null;
  return {
    element,
    kind: "video",
    mediaId,
    uri,
    sourceKey,
    presented: true,
    recoveredFrom: "current-dom-player"
  };
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

function createEchoShaderPickerMediaInput() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#06132a");
  gradient.addColorStop(0.45, "#06b6d4");
  gradient.addColorStop(1, "#c026d3");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = "#ffffff";
  for (let x = 0; x <= canvas.width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 20px monospace";
  ctx.fillText("HAPA MEDIA INPUT", 20, 100);
  return canvas;
}

function EchoShaderSourcePreview({ shader = null }) {
  const canvasRef = useRef(null);
  const [state, setState] = useState({ status: "idle", sourceId: "", sourceHash: "", error: "" });
  const entry = useMemo(() => echoShaderPickerEntry(shader || {}), [shader]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let disposed = false;
    let animationFrame = 0;
    let lastDrawAt = 0;
    let lastSignature = "";
    const publish = (next = {}) => {
      if (disposed) return;
      const normalized = {
        status: String(next.status || "idle"),
        sourceId: String(next.sourceId || entry.id || ""),
        sourceHash: String(next.sourceHash || entry.sourceHash || ""),
        error: String(next.error || ""),
      };
      const signature = JSON.stringify(normalized);
      if (signature === lastSignature) return;
      lastSignature = signature;
      setState(normalized);
    };
    if (!entry.id) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect?.(0, 0, canvas.width, canvas.height);
      if (ctx) {
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "rgba(148,163,184,.5)";
        ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "800 13px monospace";
        ctx.fillText("NO SHADER / PASS-THROUGH", 24, 54);
      }
      publish({ status: "idle", sourceId: "" });
      return undefined;
    }
    if (!entry.manifestEligible) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect?.(0, 0, canvas.width, canvas.height);
      if (ctx) {
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = entry.legacyApproximation ? "#f6c96d" : "#f87171";
        ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
        ctx.fillStyle = entry.legacyApproximation ? "#fde68a" : "#fecaca";
        ctx.font = "800 13px monospace";
        ctx.fillText(entry.legacyApproximation ? "LEGACY APPROXIMATION" : "UNSUPPORTED", 24, 48);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "11px monospace";
        ctx.fillText((entry.id || "No shader selected").slice(0, 40), 24, 72);
        ctx.fillText("No hash-verified ISF source is attached.", 24, 94);
      }
      publish({ status: entry.legacyApproximation ? "approximation" : "unsupported" });
      return undefined;
    }
    const card = buildEchoShaderPickerPreviewCard(entry);
    const mediaInput = createEchoShaderPickerMediaInput();
    const surface = createEchoIsfSurface({
      canvas,
      width: 320,
      height: 180,
      apiBase: API_BASE,
      onStatus: publish,
    });
    const startedAt = performance.now();
    const draw = (now) => {
      if (disposed) return;
      if (now - lastDrawAt >= 1000 / 24) {
        lastDrawAt = now;
        const time = (now - startedAt) / 1000;
        const pulse = 0.5 + Math.sin(time * 2.1) * 0.5;
        const result = surface.draw({
          card,
          time,
          mediaElement: mediaInput,
          mediaIdentity: { id: "echo-picker-media-input", sourceHash: "generated:picker-grid" },
          signalFrames: {
            master: {
              rms: 0.28 + pulse * 0.42,
              energy: 0.32 + pulse * 0.5,
              beat: pulse,
              low: 0.4 + pulse * 0.4,
              bass: 0.4 + pulse * 0.4,
              mid: 0.35 + (1 - pulse) * 0.35,
              high: 0.3 + pulse * 0.25,
              treble: 0.3 + pulse * 0.25,
              orbit: (time * 0.2) % 1,
              palette: 0.55,
            },
          },
          width: 320,
          height: 180,
        });
        publish(result);
        if (result?.status !== "ready") return;
      }
      animationFrame = requestAnimationFrame(draw);
    };
    surface.prepare(card).then((prepared) => {
      publish(prepared);
      if (!disposed && prepared?.status === "ready") animationFrame = requestAnimationFrame(draw);
    }).catch((error) => publish({ status: "compile-error", error: String(error?.message || error) }));
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      surface.dispose();
    };
  }, [entry.id, entry.legacyApproximation, entry.manifestEligible, entry.sourceHash]);

  const failure = exactIsfStatusIsFailure(state.status) || state.status === "unsupported";
  const label = state.status === "ready" ? "EXACT SOURCE READY" : state.status === "approximation" ? "LEGACY APPROXIMATION" : state.status.toUpperCase();
  return (
    <div
      data-echo-shader-source-preview={entry.id || "none"}
      data-echo-shader-preview-status={state.status}
      data-echo-shader-preview-hash={state.sourceHash}
      style={{ position: "relative", border: `1px solid ${failure ? "rgba(248,113,113,.55)" : "rgba(34,211,238,.4)"}`, borderRadius: "5px", overflow: "hidden", background: "#020617", minHeight: "180px" }}
    >
      <canvas ref={canvasRef} width={320} height={180} style={{ display: "block", width: "100%", aspectRatio: "16 / 9" }} />
      <span style={{ position: "absolute", top: "8px", left: "8px", padding: "3px 6px", borderRadius: "3px", background: "rgba(2,6,23,.82)", border: "1px solid rgba(255,255,255,.2)", color: failure ? "#fecaca" : state.status === "ready" ? "#bbf7d0" : "#cffafe", font: "800 9px monospace" }}>
        {label}
      </span>
      {state.error && <span style={{ position: "absolute", left: "8px", right: "8px", bottom: "8px", padding: "4px 6px", background: "rgba(2,6,23,.86)", color: "#fecaca", font: "9px monospace" }}>{state.error.slice(0, 120)}</span>}
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

function PersistentEchoABPlayers({ shot, lookaheadShots = [], playing, songTime, style, onBufferState, onPresentedMediaChange, clockRef, vertical = false, shotIndex = 0 }) {
  const playerRefs = [useRef(null), useRef(null), useRef(null)];
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [stageStatus, setStageStatus] = useState("buffering");
  const generationRef = useRef(0);
  const fallbackRef = useRef(null);
  const slotStateRef = useRef(Array.from({ length: 3 }, () => ({ key: "", status: "idle", frameReady: false, generation: 0, error: "" })));

  const shotKey = (targetShot) => `${targetShot?.media_id || "none"}:${resolveMediaUri(shotRuntimeUri(targetShot))}`;

  const waitFor = (video, eventName, timeoutMs, generation) => new Promise((resolve, reject) => {
    if (generation !== generationRef.current && eventName !== "lookahead") { reject(new Error("stale-prepare")); return; }
    let settled = false;
    const finish = (error) => {
      if (settled) return; settled = true; window.clearTimeout(timer);
      video.removeEventListener(eventName, ready); video.removeEventListener("error", failed); video.removeEventListener("abort", failed);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish(); const failed = () => finish(new Error(video.error?.message || `Echo player ${eventName} failed`));
    const timer = window.setTimeout(() => finish(new Error(`Echo player ${eventName} timeout`)), timeoutMs);
    video.addEventListener(eventName, ready, { once: true }); video.addEventListener("error", failed, { once: true }); video.addEventListener("abort", failed, { once: true });
  });

  const prepare = async (slotIndex, targetShot, offsetSeconds = 0, generation = generationRef.current) => {
    const video = playerRefs[slotIndex].current;
    if (!video || shotMediaType(targetShot) !== "video") return false;
    const uri = resolveMediaUri(shotRuntimeUri(targetShot));
    const key = shotKey(targetShot); const slot = slotStateRef.current[slotIndex];
    if (slot.key === key && slot.status === "ready" && slot.frameReady && video.readyState >= 2 && video.videoWidth > 0 && !video.error) return true;
    slot.key = key; slot.status = "preparing"; slot.frameReady = false; slot.generation = generation; slot.error = "";
    video.dataset.echoPreparingKey = key;
    if (video.currentSrc !== uri && video.src !== uri) {
      video.removeAttribute("src");
      video.src = uri;
      video.load();
    }
    if (video.readyState < 1) await waitFor(video, "loadedmetadata", 5000, generation);
    if (video.readyState < 2) await waitFor(video, "loadeddata", 5000, generation);
    if (slot.generation !== generation || slot.key !== key) throw new Error("stale-prepare");
    const playbackMode = targetShot.media_contract?.playbackMode || "loop";
    const target = mapEchoSourceTime({ elapsedSeconds: offsetSeconds + Number(targetShot.media_contract?.sourceInSeconds || 0), durationSeconds: video.duration, loop: playbackMode === "loop" });
    if (!video.seeking && Math.abs(video.currentTime - target) > 0.08) {
      video.currentTime = target;
      await waitFor(video, "seeked", 3000, generation);
    }
    await video.play();
    await new Promise((resolve, reject) => {
      let settled = false; const finish = (error) => { if (settled) return; settled = true; window.clearTimeout(timer); error ? reject(error) : resolve(); };
      const timer = window.setTimeout(() => finish(new Error("Echo player first-frame timeout")), 3000);
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => finish());
      else window.requestAnimationFrame(() => finish());
    });
    if (slot.generation !== generation || slot.key !== key || video.videoWidth <= 0 || video.error) throw new Error("stale-or-empty-frame");
    if (!playing) video.pause();
    slot.status = "ready"; slot.frameReady = true; video.dataset.echoSourceKey = key; delete video.dataset.echoPreparingKey;
    return true;
  };

  useEffect(() => {
    if (shotMediaType(shot) !== "video") return undefined;
    const generation = ++generationRef.current; const key = shotKey(shot);
    const reusableIndex = slotStateRef.current.findIndex((slot, index) => slot.key === key && slot.status === "ready" && slot.frameReady && playerRefs[index].current?.readyState >= 2 && playerRefs[index].current?.videoWidth > 0 && !playerRefs[index].current?.error);
    setStageStatus("buffering"); onBufferState?.({ status: "buffering", ready: false, currentKey: key, readyLookahead: 0, targetLookahead: Math.min(2, lookaheadShots.filter((item) => shotMediaType(item) === "video").length) });
    const activate = (index) => {
      if (generation !== generationRef.current) return;
      activeIndexRef.current = index; setActiveIndex(index); setStageStatus("ready");
      onBufferState?.({ status: "ready", ready: true, currentKey: key, readyLookahead: slotStateRef.current.filter((slot, slotIndex) => slotIndex !== index && slot.status === "ready").length, targetLookahead: Math.min(2, lookaheadShots.filter((item) => shotMediaType(item) === "video").length) });
    };
    if (reusableIndex >= 0) activate(reusableIndex);
    else {
      const incomingIndex = [0, 1, 2].find((index) => index !== activeIndexRef.current && slotStateRef.current[index].status !== "preparing") ?? ((activeIndexRef.current + 1) % 3);
      prepare(incomingIndex, shot, Math.max(0, songTime - Number(shot.start_sec || 0)), generation).then((ready) => { if (ready) activate(incomingIndex); }).catch((error) => {
        const slot = slotStateRef.current[incomingIndex]; if (slot.generation === generation) { slot.status = "error"; slot.error = String(error.message || error); }
        if (generation !== generationRef.current) return;
        setStageStatus("fallback"); onBufferState?.({ status: "fallback", ready: true, currentKey: key, error: String(error.message || error), readyLookahead: 0, targetLookahead: 0 });
      });
    }
    return () => { if (generation === generationRef.current) generationRef.current += 1; };
  }, [shot?.media_id, shot?.start_sec, shotRuntimeUri(shot)]);

  useEffect(() => {
    if (stageStatus !== "ready") return;
    const generation = generationRef.current;
    const targets = lookaheadShots.filter((item) => shotMediaType(item) === "video").slice(0, 2);
    targets.forEach((targetShot) => {
      const key = shotKey(targetShot);
      if (slotStateRef.current.some((slot) => slot.key === key && (slot.status === "ready" || slot.status === "preparing"))) return;
      const slotIndex = [0, 1, 2].find((index) => index !== activeIndexRef.current && slotStateRef.current[index].status !== "preparing");
      if (slotIndex === undefined) return;
      prepare(slotIndex, targetShot, 0, generation).then(() => {
        playerRefs[slotIndex].current?.pause();
        const readyLookahead = slotStateRef.current.filter((slot, index) => index !== activeIndexRef.current && slot.status === "ready").length;
        onBufferState?.({ status: "ready", ready: true, currentKey: shotKey(shot), readyLookahead, targetLookahead: targets.length });
      }).catch(() => {});
    });
  }, [stageStatus, lookaheadShots.map((item) => shotKey(item)).join("|")]);

  useEffect(() => {
    const video = playerRefs[activeIndex].current;
    if (!video || shotMediaType(shot) !== "video" || video.seeking) return;
    const expected = mapEchoSourceTime({ elapsedSeconds: Math.max(0, songTime - Number(shot.start_sec || 0)) + Number(shot.media_contract?.sourceInSeconds || 0), durationSeconds: video.duration, loop: (shot.media_contract?.playbackMode || "loop") === "loop" });
    const correction = planEchoPlaybackCorrection({ expectedSeconds: expected, currentSeconds: video.currentTime, seeking: video.seeking });
    if (correction.action === "seek") video.currentTime = Math.min(Number(video.duration || expected), correction.targetSeconds);
    else video.playbackRate = correction.playbackRate;
    if (playing && video.paused) video.play().catch(() => {});
    if (!playing && !video.paused) video.pause();
  }, [activeIndex, playing, shot?.media_id, songTime]);

  useEffect(() => {
    const sourceKey = shotKey(shot);
    const video = playerRefs[activeIndex].current;
    const slot = slotStateRef.current[activeIndex];
    const isCurrentPresentedFrame = Boolean(
      stageStatus === "ready"
      && video
      && slot?.key === sourceKey
      && slot?.frameReady
      && video.dataset.echoSourceKey === sourceKey
      && video.readyState >= 2
      && video.videoWidth > 0
      && !video.error
    );
    onPresentedMediaChange?.(isCurrentPresentedFrame ? {
      element: video,
      kind: "video",
      mediaId: String(shot?.media_id || ""),
      uri: resolveMediaUri(shotRuntimeUri(shot)),
      sourceKey,
      presented: true,
      playerIndex: activeIndex
    } : {
      element: null,
      kind: "video",
      mediaId: String(shot?.media_id || ""),
      uri: resolveMediaUri(shotRuntimeUri(shot)),
      sourceKey,
      presented: false,
      reason: stageStatus === "ready" ? "active-frame-not-presented" : stageStatus
    });
    return () => onPresentedMediaChange?.({ element: null, kind: "video", mediaId: String(shot?.media_id || ""), sourceKey, presented: false, reason: "binding-released" });
  }, [activeIndex, stageStatus, shot?.media_id, shot?.start_sec, shotRuntimeUri(shot), onPresentedMediaChange]);

  useEffect(() => {
    let frame = 0; let previousMs = -Infinity;
    const animateCamera = (now) => {
      if (now - previousMs >= 1000 / 30) {
        previousMs = now;
        const camera = cameraMotionStyleForShot(shot, Number(clockRef?.current ?? songTime), vertical, shotIndex);
        for (const ref of playerRefs) if (ref.current) { ref.current.style.transform = camera.transform; ref.current.style.transformOrigin = camera.transformOrigin; ref.current.style.objectPosition = camera.objectPosition; }
        if (fallbackRef.current) { fallbackRef.current.style.transform = camera.transform; fallbackRef.current.style.transformOrigin = camera.transformOrigin; }
      }
      if (playing) frame = window.requestAnimationFrame(animateCamera);
    };
    frame = window.requestAnimationFrame(animateCamera);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, shot?.media_id, shot?.start_sec, vertical, shotIndex, clockRef]);

  useEffect(() => () => {
    for (const ref of playerRefs) {
      const video = ref.current;
      if (!video) continue;
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* best effort */ }
    }
  }, []);

  return (
    <>
      <div ref={fallbackRef} data-echo-fallback={stageStatus} style={{ ...style, opacity: stageStatus === "ready" ? 0 : 1, position: "absolute", inset: 0, zIndex: 0, background: "radial-gradient(circle at center, rgba(9,28,46,.96), #020617 72%)", transition: "opacity .18s linear" }}>
        {(shot.media_contract?.posterUri || shot.media_thumbnail) && <img src={resolveMediaUri(shot.media_contract?.posterUri || shot.media_thumbnail)} alt="Buffered shot fallback" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      {[0, 1, 2].map((index) => (
        <video
          key={`persistent-echo-player-${index}`}
          ref={playerRefs[index]}
          muted
          crossOrigin="anonymous"
          loop
          playsInline
          preload="auto"
          data-echo-player={index === activeIndex ? "current" : "standby"}
          data-frame-presented={index === activeIndex && stageStatus === "ready" ? "true" : "false"}
          style={{ ...style, position: 'absolute', inset: 0, opacity: index === activeIndex && stageStatus === "ready" ? 1 : 0, transition: `opacity ${shot.transition === "cut" ? .06 : .45}s linear`, zIndex: index === activeIndex ? 1 : 0 }}
        />
      ))}
    </>
  );
}

function PresentedEchoImage({ shot, style, onPresentedMediaChange }) {
  const imageRef = useRef(null);
  const mediaId = String(shot?.media_id || "");
  const uri = resolveMediaUri(shotRuntimeUri(shot));
  const sourceKey = `${mediaId}:${uri}`;
  const publish = () => {
    const element = imageRef.current;
    const presented = Boolean(element?.complete && Number(element?.naturalWidth || 0) > 0);
    onPresentedMediaChange?.(presented ? { element, kind: "image", mediaId, uri, sourceKey, presented: true } : { element: null, kind: "image", mediaId, uri, sourceKey, presented: false, reason: "image-frame-not-presented" });
  };
  useEffect(() => () => {
    onPresentedMediaChange?.({ element: null, kind: "image", mediaId, uri, sourceKey, presented: false, reason: "binding-released" });
  }, [mediaId, uri, sourceKey, onPresentedMediaChange]);
  return <img ref={imageRef} src={uri} crossOrigin="anonymous" alt={shot?.media_title || "Echo still"} onLoad={publish} onError={publish} style={style} />;
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

function getLyricPlacementStyle(position = "bottom-center", outputProfile = null) {
  const profile = resolveEchoOutputProfile(outputProfile);
  const titleInset = `${Math.round(profile.safeArea.titleInset * 100)}%`;
  const lyricBottom = `${Math.round(profile.safeArea.lyricBottom * 100)}%`;
  const isVerticalOutput = profile.id === "vertical";
  const base = {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 10,
    width: isVerticalOutput ? "min(82%, 620px)" : "min(92%, 760px)"
  };
  const placements = {
    "bottom-center": { left: "50%", right: "auto", top: "auto", bottom: lyricBottom, transform: "translateX(-50%)", textAlign: "center" },
    "top-center": { left: "50%", right: "auto", top: titleInset, bottom: "auto", transform: "translateX(-50%)", textAlign: "center" },
    center: { left: "50%", right: "auto", top: "50%", bottom: "auto", transform: "translate(-50%, -50%)", textAlign: "center" },
    "lower-left": { left: titleInset, right: "auto", top: "auto", bottom: lyricBottom, transform: "none", textAlign: "left", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "lower-right": { left: "auto", right: titleInset, top: "auto", bottom: lyricBottom, transform: "none", textAlign: "right", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "upper-left": { left: titleInset, right: "auto", top: titleInset, bottom: "auto", transform: "none", textAlign: "left", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "upper-right": { left: "auto", right: titleInset, top: titleInset, bottom: "auto", transform: "none", textAlign: "right", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "side-right": { left: "auto", right: titleInset, top: "50%", bottom: "auto", transform: "translateY(-50%)", textAlign: "right", width: isVerticalOutput ? "58%" : "min(45%, 360px)" }
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

function cameraMotionStyleForShot(item, currentTime, isVertical, shotIndex = 0, cameraCrop = null) {
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

  const cropPresentation = echoCameraCropPresentation(cameraCrop);
  if (cropPresentation) {
    scale *= cropPresentation.scale;
    objectX = cropPresentation.centerX;
    objectY = cropPresentation.centerY;
  }

  return {
    transform: `scale(${scale.toFixed(3)}) translate3d(${x.toFixed(2)}%, ${y.toFixed(2)}%, 0)`,
    transformOrigin: cropPresentation?.transformOrigin || "center center",
    objectPosition: `${Math.max(0, Math.min(100, objectX)).toFixed(1)}% ${Math.max(0, Math.min(100, objectY)).toFixed(1)}%`
  };
}

function EchoPlaybackClockBoundary({ clockRef, initialTime = 0, active = false, powerMode = "active", project = null, children }) {
  const clockDiagnostics = globalThis.__HAPA_ECHO_CLOCK_DIAGNOSTICS__ ||= { topLevelRenders: 0, boundaryRenders: 0 };
  clockDiagnostics.boundaryRenders += 1;
  const [clockTime, setClockTime] = useState(Number(initialTime) || 0);
  const signatureRef = useRef("");

  useEffect(() => {
    const next = Number(initialTime) || 0;
    clockRef.current = next;
    signatureRef.current = "";
    setClockTime(next);
  }, [clockRef, initialTime]);

  useEffect(() => {
    if (!active || powerMode === "hidden") return undefined;
    let frame = 0;
    const sample = () => {
      const time = Number(clockRef.current) || 0;
      const shotIndex = project?.timeline?.findIndex((item) => time >= item.start_sec && time < item.end_sec) ?? -1;
      const lineIndex = project?.timed_lyrics?.findIndex((line) => time >= line.start && time < line.end) ?? -1;
      const line = lineIndex >= 0 ? project?.timed_lyrics?.[lineIndex] : null;
      const wordIndex = line?.words?.findIndex((word) => time >= word.start && time < word.end) ?? -1;
      const cadence = powerMode === "docked" ? 2 : 4;
      const signature = `${shotIndex}:${lineIndex}:${wordIndex}:${Math.floor(time * cadence)}`;
      if (signature !== signatureRef.current) {
        signatureRef.current = signature;
        setClockTime(time);
      }
      frame = window.requestAnimationFrame(sample);
    };
    frame = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(frame);
  }, [active, clockRef, powerMode, project]);

  return children(clockTime);
}

function echoDirectorGraphVariantId(showGraph = null) {
  return String(showGraph?.directorV2?.variantId || showGraph?.runId || showGraph?.id || "");
}

function echoIsfGraphRuntimeIdentity(showGraph = null) {
  const director = showGraph?.directorV2 || {};
  const variantId = echoDirectorGraphVariantId(showGraph);
  const variantHash = String(director.variantHash || "");
  const dirtyRanges = Array.isArray(director.patchLineage?.dirtyRanges)
    ? director.patchLineage.dirtyRanges.map((range = {}) => ({
      ...range,
      startSeconds: Number(range.startSeconds ?? range.earliestDirtySeconds ?? range.start ?? range.fromSeconds ?? 0),
      endSeconds: Number(range.endSeconds ?? range.endDirtySeconds ?? range.end ?? range.toSeconds ?? 0),
      reason: String(range.reason || range.operation || range.editId || range.id || range.dependencyReasons?.join?.(" + ") || "dirty-range"),
    }))
    : [];
  const visualizerCards = (showGraph?.tracks || [])
    .filter((track) => track?.id === "track-b" || track?.role === "visualizer")
    .flatMap((track) => track?.cards || []);
  const shaderIds = Array.from(new Set(
    visualizerCards
      .map((card) => exactVisualizerSourceId(card))
      .filter(Boolean)
  ));
  return {
    variantId,
    variantHash,
    variantKey: `${variantId}:${variantHash}`,
    dirtyKey: JSON.stringify(dirtyRanges),
    dirtyRanges,
    shaderIds,
  };
}

function exactVisualizerSourceId(card = null) {
  return String(card?.visualization?.sourceId || card?.sourceId || card?.visualization?.card?.id || "");
}

function normalizedRendererRuntimeStatus(status = "") {
  const value = String(status || "").toLowerCase();
  if (value === "error" || value === "failed") return "draw-error";
  if (value.includes("compile")) return "compile-error";
  if (value.includes("input")) return "input-error";
  if (value.includes("hash")) return "hash-error";
  if (value.includes("missing")) return "missing-id";
  if (value.includes("draw")) return "draw-error";
  return value;
}

function legacyEchoRendererTruth(visualizer = null, rendererId = "echo-avatar-builder") {
  if (!visualizer || /^none$/i.test(String(visualizer.visualizer_id || visualizer.visualizer_title || ""))) return null;
  const value = {
    sourceId: String(visualizer.visualizer_id || ""),
    title: String(visualizer.visualizer_title || visualizer.visualizer_id || "Unknown legacy visualizer"),
    startSeconds: Number(visualizer.start_sec),
    endSeconds: Number(visualizer.end_sec),
  };
  const approximation = echoLegacyCanvasApproximation(visualizer);
  const options = approximation.supported
    ? {
      declaration: {
        route: "supported-subset",
        substitute: { id: approximation.mode, title: approximation.mode, route: "legacy-canvas-approximation" },
        reason: approximation.reason,
        fidelityLoss: ["pixel-equivalence-not-verified", "manifest-source-not-executed"],
      },
      route: "supported-subset",
    }
    : {
      declaration: {
        route: "unsupported",
        reason: approximation.reason,
        fidelityLoss: ["requested-shader-not-presented", "legacy-title-and-id-not-recognized"],
      },
      route: "unsupported",
    };
  return {
    value,
    approximation,
    truth: resolveVisualizerRendererTruth(value, rendererId, options),
    receipt: buildVisualizerRendererTruthReceipt(value, { [rendererId]: options }),
  };
}

function exactEchoRendererTruth(card = null, presentation = {}, rendererId = "echo-avatar-builder") {
  if (!card) return null;
  const runtimeStatus = normalizedRendererRuntimeStatus(presentation.status || presentation.handoff || "loading");
  const requestedId = String(presentation.requestedShaderId || presentation.shaderId || exactVisualizerSourceId(card));
  const presentedId = String(presentation.presentedShaderId || "");
  const heldPreviousFrame = presentation.heldPreviousFrame === true || presentation.heldPrevious === true;
  const fallback = heldPreviousFrame && presentedId
    ? { id: `${presentedId}@last-good-frame`, title: `${presentedId} last good frame`, route: "last-good-frame-hold" }
    : null;
  const options = {
    runtimeStatus,
    fallback,
    reason: fallback ? "candidate-not-ready-last-good-frame-held" : "",
  };
  return {
    truth: resolveVisualizerRendererTruth(card, rendererId, options),
    receipt: buildVisualizerRendererTruthReceipt(card, { [rendererId]: options }),
  };
}

function rendererTruthColor(status = "") {
  if (status === "exact") return { color: "#bbf7d0", background: "rgba(16,185,129,.18)", border: "rgba(74,222,128,.42)" };
  if (status === "approximation") return { color: "#fde68a", background: "rgba(245,158,11,.18)", border: "rgba(251,191,36,.45)" };
  if (status === "fallback") return { color: "#fed7aa", background: "rgba(249,115,22,.2)", border: "rgba(251,146,60,.48)" };
  return { color: "#fecaca", background: "rgba(239,68,68,.22)", border: "rgba(248,113,113,.52)" };
}

function compactEchoIsfPlaybackDiagnostics(diagnostics = {}, presentation = {}, lookaheadCards = []) {
  const slots = Array.isArray(diagnostics.slots)
    ? diagnostics.slots.map((slot = {}) => ({
      shaderId: String(slot.shaderId || slot.sourceId || ""),
      status: String(slot.status || (slot.ready ? "ready" : "idle")),
      ready: slot.ready === true || slot.status === "ready",
    })).slice(0, 3)
    : [];
  const prewarmRequested = Math.max(0, lookaheadCards.length - 1);
  const prewarmReady = Number(
    diagnostics.prewarmReady
      ?? diagnostics.prewarm?.ready
      ?? slots.filter((slot) => slot.ready).length
      ?? 0
  );
  const sourceCache = diagnostics.sourceCache || diagnostics.sourceCacheStats || {};
  const blackIntervalDetails = Array.isArray(diagnostics.blackIntervals)
    ? diagnostics.blackIntervals.slice(-8)
    : [];
  const numericBlackIntervals = Number(diagnostics.blackIntervals || 0);
  const blackIntervalCount = blackIntervalDetails.length || (Number.isFinite(numericBlackIntervals) ? Math.max(0, numericBlackIntervals) : 0);
  const frameTiming = diagnostics.frameTiming || diagnostics.timing || {
    lastMs: Number(diagnostics.lastFrameMs || 0),
    averageMs: Number(diagnostics.averageFrameMs || 0),
    maxMs: Number(diagnostics.maxFrameMs || 0),
  };
  return {
    currentShaderId: String(diagnostics.currentShaderId || presentation.presentedShaderId || ""),
    requestedShaderId: String(diagnostics.requestedShaderId || presentation.requestedShaderId || presentation.shaderId || ""),
    handoffStatus: String(diagnostics.handoffStatus || presentation.handoff || presentation.status || "idle"),
    heldPreviousFrame: presentation.heldPreviousFrame === true || presentation.heldPrevious === true,
    prewarmReadiness: {
      ready: Math.max(0, prewarmReady),
      requested: prewarmRequested,
      slots,
    },
    surfaceCount: Number(diagnostics.surfaceCount || 0),
    contextCount: Number(diagnostics.contextCount || diagnostics.contexts || 0),
    programCount: Number(diagnostics.programCount || diagnostics.programs || 0),
    sourceCache,
    handoffs: Number(diagnostics.handoffs || 0),
    heldFrames: Number(diagnostics.heldFrames || 0),
    blackIntervals: blackIntervalCount,
    blackIntervalDetails,
    frameTiming,
  };
}

function exactIsfStatusIsFailure(status = "") {
  return /(error|failed|missing|invalid|hash|compile|draw|input)/i.test(String(status || "idle"));
}

function drawExactIsfDiagnostic(ctx, width, height, { status = "loading", sourceId = "", error = "" } = {}, { preservePixels = false } = {}) {
  const failed = exactIsfStatusIsFailure(status);
  ctx.save();
  ctx.fillStyle = preservePixels ? "rgba(2, 6, 23, 0.72)" : "rgba(2, 6, 23, 0.88)";
  if (preservePixels) ctx.fillRect(20, 20, Math.min(Math.max(280, width * 0.52), width - 40), 82);
  else ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = failed ? "rgba(248, 113, 113, 0.82)" : "rgba(34, 211, 238, 0.72)";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, preservePixels ? Math.min(Math.max(280, width * 0.52), width - 40) : Math.max(1, width - 40), preservePixels ? 82 : Math.max(1, height - 40));
  ctx.fillStyle = failed ? "#fecaca" : "#cffafe";
  ctx.font = "700 12px monospace";
  ctx.fillText(preservePixels ? `EXACT ISF HOLD · ${String(status).toUpperCase()}` : failed ? "EXACT ISF ERROR" : "EXACT ISF LOADING", 36, 52);
  ctx.fillStyle = "rgba(226, 232, 240, 0.82)";
  ctx.font = "10px monospace";
  ctx.fillText(sourceId || "No graph-backed visualizer cue at this time", 36, 72);
  if (error) ctx.fillText(String(error).slice(0, 88), 36, 91);
  ctx.restore();
}

function normalizedStemFocus(value = "") {
  return normalizeEchoStemFocus(value);
}

function verifiedStemBinding(showGraph = null, card = null) {
  return resolveVerifiedEchoStemBinding(showGraph, card);
}

function paletteSignalForPerspective(perspective = "") {
  if (perspective === "red") return 0;
  if (perspective === "green") return 120 / 360;
  if (perspective === "magenta" || perspective === "purple") return 300 / 360;
  return 180 / 360;
}

function liveSignalFrame(analyser, timeSeconds = 0, metadata = {}, tracker = null) {
  return sampleEchoLiveSignalFrame(analyser, timeSeconds, metadata, tracker);
}

function visualizerCompositionInput(card = null, timeSeconds = 0) {
  const layer = card?.visualization?.card?.layer || {};
  const parameters = card?.parameters || {};
  const start = Number(card?.startSeconds || 0);
  const end = Number(card?.endSeconds || start + 1);
  const duration = Math.max(0.001, end - start);
  const transition = String(card?.transition || parameters.transition || layer.transition || "cut").toLowerCase();
  const transitionSeconds = Math.min(duration / 4, Math.max(0.04, Number(parameters.transitionDurationSeconds ?? layer.transitionDurationSeconds ?? 0.35)));
  const transitionAlpha = /(fade|cross|dissolve)/.test(transition)
    ? Math.max(0, Math.min(1, (Number(timeSeconds) - start) / transitionSeconds, (end - Number(timeSeconds)) / transitionSeconds))
    : 1;
  return {
    opacity: Number(parameters.opacity ?? layer.opacity ?? 1),
    mix: Number(parameters.mix ?? layer.mix ?? 1),
    blend: String(parameters.blendMode || layer.blend || "source-over"),
    target: String(parameters.target || layer.target || "program"),
    transitionAlpha
  };
}

function compactFrameReceipt(receipt = null) {
  if (!receipt || typeof receipt !== "object") return null;
  return {
    schemaVersion: receipt.schemaVersion || "",
    timestampSeconds: Number(receipt.timestampSeconds || 0),
    shaderId: receipt.shaderId || "",
    sourceHash: receipt.sourceHash || "",
    card: receipt.card ? { id: receipt.card.id || "", sourceCueIndex: receipt.card.sourceCueIndex ?? null, sourceId: receipt.card.sourceId || "", hash: receipt.card.hash || "" } : null,
    input: receipt.input ? {
      hash: receipt.input.hash || "",
      defaultsApplied: (receipt.input.defaultsApplied || []).length,
      controlsApplied: receipt.input.controlsApplied || [],
      unknownControls: receipt.input.unknownControls || [],
      invalidAudioMapUniforms: receipt.input.invalidAudioMapUniforms || [],
      modulation: (receipt.input.modulationBindings || []).map((binding) => ({ uniform: binding.uniform, signal: binding.signal, status: binding.status }))
    } : null,
    media: receipt.media || null,
    stem: receipt.stem || null,
    composition: receipt.composition || null,
    receiptHash: receipt.receiptHash || ""
  };
}

function compactStemBinding(resource = null) {
  if (!resource) return null;
  return {
    status: resource.status || "master",
    requestedStem: resource.requestedStem || "master",
    requestedKey: resource.requestedKey || "master",
    resolvedStem: resource.status === "ready" ? resource.resolvedStem || resource.requestedStem : "master",
    stemId: resource.status === "ready" ? resource.bus?.stemId || "" : "",
    busId: resource.status === "ready" ? resource.bus?.id || "" : "",
    truthStatus: resource.status === "ready" ? resource.bus?.truthStatus || "" : "master-live-analyser",
    fallbackReason: resource.fallbackReason || resource.playbackError || "",
    playbackBlocked: resource.playbackBlocked === true,
    sourceGeneration: Number(resource.sourceGeneration || 0),
    readyGeneration: Number(resource.readyGeneration || 0),
    readyUriMatches: Boolean(resource.targetUri && resource.readyUri === resource.targetUri),
    contextState: resource.context?.state || "",
    mediaPaused: resource.element ? resource.element.paused === true : null,
    mediaReadyState: Number(resource.element?.readyState || 0),
    mediaCurrentTime: Number(resource.element?.currentTime || 0),
    clockDriftSeconds: resource.lastTransport?.clockDriftSeconds ?? null,
    signalHealth: resource.lastTransport?.signalHealth || null,
    signalDiagnostic: resource.lastTransport?.diagnostic || "",
    decoderFailureCount: Number(resource.failureCount || 0),
    decoderRetryDelayMs: Number(resource.retryDelayMs || 0),
    decoderNextRetryAtMs: resource.nextRetryAtMs ?? null,
    decoderRetryExhausted: resource.retryExhausted === true,
    playbackFailureCount: Number(resource.playbackFailureCount || 0),
    playbackRetryDelayMs: Number(resource.playbackRetryDelayMs || 0),
    playbackNextRetryAtMs: resource.playbackNextRetryAtMs ?? null,
    playbackRetryExhausted: resource.playbackRetryExhausted === true,
  };
}

function echoStemTransportHealth(resource = null, playing = false, options = {}) {
  return evaluateEchoStemTransportHealth(resource, { playing, ...options });
}

function compactStemSignalBinding(resource = null, transport = { usable: false, reason: "" }) {
  const binding = compactStemBinding(resource);
  if (!binding || resource?.status !== "ready" || transport.usable) return binding;
  return {
    ...binding,
    status: "master-fallback",
    resolvedStem: "master",
    stemId: "",
    busId: "",
    truthStatus: "master-live-analyser",
    fallbackReason: transport.reason || binding.fallbackReason || "stem-transport-unavailable"
  };
}

function disposeEchoStemResource(resource = null) {
  if (!resource) return;
  resource.disposed = true;
  try { resource.element?.removeEventListener?.("canplay", resource.markReady); resource.element?.removeEventListener?.("loadeddata", resource.markReady); resource.element?.removeEventListener?.("error", resource.markFailed); } catch { /* best effort */ }
  try { resource.element?.pause?.(); } catch { /* best effort */ }
  try { resource.element?.removeAttribute?.("src"); resource.element?.load?.(); } catch { /* best effort */ }
  try { resource.sourceNode?.disconnect?.(); } catch { /* best effort */ }
  try { resource.analyser?.disconnect?.(); } catch { /* best effort */ }
  try { resource.silentGain?.disconnect?.(); } catch { /* best effort */ }
}

function disposeEchoStemDecoderPool(pool = null) {
  for (const resource of pool?.values?.() || []) disposeEchoStemResource(resource);
  pool?.clear?.();
}

function pauseEchoStemDecoderPool(pool = null, protectedKeys = new Set()) {
  for (const [key, resource] of pool?.entries?.() || []) {
    if (protectedKeys.has(key)) continue;
    try { if (resource?.element && !resource.element.paused) resource.element.pause(); } catch { /* best effort */ }
  }
}

function echoStemDecoderNow() {
  return Number(globalThis.performance?.now?.() ?? Date.now());
}

function nextEchoStemPlaybackRetryState(resource = {}, nowMs = echoStemDecoderNow()) {
  const retry = nextEchoStemDecoderRetryState({ failureCount: resource.playbackFailureCount }, nowMs);
  return {
    playbackFailureCount: retry.failureCount,
    playbackRetryDelayMs: retry.retryDelayMs,
    playbackNextRetryAtMs: retry.nextRetryAtMs,
    playbackRetryExhausted: retry.retryExhausted,
  };
}

function echoStemPlaybackRetryDue(resource = {}, nowMs = echoStemDecoderNow()) {
  return echoStemDecoderRetryDue({
    retryExhausted: resource.playbackRetryExhausted,
    nextRetryAtMs: resource.playbackNextRetryAtMs,
  }, nowMs);
}

function stemCardForRole(card = null, role = "master") {
  return {
    ...(card || {}),
    visualization: {
      ...(card?.visualization || {}),
      card: {
        ...(card?.visualization?.card || {}),
        stemFocus: String(role || "master"),
      },
    },
  };
}

function echoStemRoleAllowsSilence(card = null, role = "master") {
  const requestedKey = normalizedStemFocus(role);
  const decisions = [
    ...(card?.visualization?.stemBindingDecisions || []),
    ...(card?.executionReceipt?.stemBindingDecisions || []),
    card?.visualization?.stemBinding,
    card?.executionReceipt?.stemBinding,
  ].filter(Boolean);
  return decisions.some((decision) => (
    String(decision?.status || "").includes("allow-silent")
    && [decision?.requestedRole, decision?.requestedCanonicalRole, decision?.selectedRole, decision?.selectedCanonicalRole]
      .some((candidate) => normalizedStemFocus(candidate) === requestedKey)
  ));
}

function pruneEchoStemDecoderPool(
  pool,
  protectedKeys = new Set(),
  limit = ECHO_STEM_DECODER_POOL_LIMIT,
  playingKeys = protectedKeys,
) {
  if (!pool) return;
  // Lookahead decoders remain loaded and seeked, but only resources required by
  // the current card may keep advancing with the master clock.
  pauseEchoStemDecoderPool(pool, playingKeys);
  const hardLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const candidates = [...pool.entries()].sort((left, right) => {
    const protectionOrder = Number(protectedKeys.has(left[0])) - Number(protectedKeys.has(right[0]));
    return protectionOrder || Number(left[1]?.lastUsedTick || 0) - Number(right[1]?.lastUsedTick || 0);
  });
  while (pool.size > hardLimit && candidates.length) {
    const [key, resource] = candidates.shift();
    pool.delete(key);
    disposeEchoStemResource(resource);
  }
}

function HapaEchosView({ selectedSongId, onSelectSong, playbackMode = "active" }) {
  const clockDiagnostics = globalThis.__HAPA_ECHO_CLOCK_DIAGNOSTICS__ ||= { topLevelRenders: 0, boundaryRenders: 0 };
  clockDiagnostics.topLevelRenders += 1;
  const powerMode = normalizePlaybackPowerMode(playbackMode);
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
  const [shaderCategoryFilter, setShaderCategoryFilter] = useState("all");

  const [directorProjects, setDirectorProjects] = useState([]);
  const [selectedProjectSongId, setSelectedProjectSongId] = useState(null);
  const [selectedDirectionVariantId, setSelectedDirectionVariantId] = useState("legacy");
  const [workingDirectionFork, setWorkingDirectionFork] = useState(null);
  const [directionForkTransitionPending, setDirectionForkTransitionPending] = useState(false);
  const [loadingProjectDetail, setLoadingProjectDetail] = useState(false);
  const projectDetailRequestCountRef = useRef(0);
  const projectDetailGenerationBySongRef = useRef(new Map());
  const projectDetailControllerBySongRef = useRef(new Map());
  const [planning, setPlanning] = useState(false);
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState("preview");
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);
  const currentTimeRef = useRef(0);
  const activeProjectRef = useRef(null);
  const echoPlaybackEngineRef = useRef(null);
  const [echoPlaybackSnapshot, setEchoPlaybackSnapshot] = useState(null);
  const [previewBufferState, setPreviewBufferState] = useState({ status: "idle", ready: false, readyLookahead: 0, targetLookahead: 0 });
  const [previewPreparation, setPreviewPreparation] = useState({ status: "idle" });
  const directorPreviewFullscreenRef = useRef(null);
  const directorPreviewFullscreenActiveRef = useRef(false);
  const [directorPreviewExpanded, setDirectorPreviewExpanded] = useState(false);
  const [directorPreviewFullscreen, setDirectorPreviewFullscreen] = useState(false);
  const [directorPreviewFullscreenMessage, setDirectorPreviewFullscreenMessage] = useState("");
  const canvasRef = useRef(null);
  const exactIsfPlaybackPoolRef = useRef(null);
  const exactIsfPlaybackPoolIdentityRef = useRef({ variantKey: "", dirtyKey: "", sizeKey: "", dirtyRangeCount: 0, shaderIds: [] });
  const exactIsfPrewarmSignatureRef = useRef("");
  const exactIsfPresentationRef = useRef({ status: "idle", sourceId: "", error: "" });
  const exactIsfLastPresentedCanvasRef = useRef(null);
  const [exactIsfStatus, setExactIsfStatus] = useState({ status: "idle", sourceId: "", error: "" });
  const presentedMediaRef = useRef(null);
  const stemDecoderPoolRef = useRef(new Map());
  const stemDecoderUseTickRef = useRef(0);
  const masterSignalTrackerRef = useRef(null);
  if (!masterSignalTrackerRef.current) masterSignalTrackerRef.current = createEchoLiveSignalTracker();
  const exactIsfBindingDiagnosticsRef = useRef({ signature: "", updates: 0, last: { media: null, stem: null, frameReceipt: null, composition: null, playbackPool: null, rendererTruth: null, rendererTruthReceipt: null } });
  const [exactIsfBindingDiagnostics, setExactIsfBindingDiagnostics] = useState({ media: null, stem: null, frameReceipt: null, composition: null, playbackPool: null, rendererTruth: null, rendererTruthReceipt: null });
  const audioContextRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const connectedAudioRef = useRef(null);
  const sessionBusterRef = useRef(Math.random().toString(36).substring(7));

  const [audioBlobUrl, setAudioBlobUrl] = useState("");
  const [audioLoading, setAudioLoading] = useState(false);

  const closeDirectorPreviewExpanded = useCallback(async () => {
    const documentRef = globalThis.document;
    const previewSurface = directorPreviewFullscreenRef.current;
    if (directorPreviewIsFullscreen(documentRef, previewSurface)) {
      const exitFullscreen = documentRef.exitFullscreen || documentRef.webkitExitFullscreen;
      if (typeof exitFullscreen !== "function") {
        setDirectorPreviewFullscreenMessage("Use Escape to leave native Full Screen before closing the large Preview.");
        return;
      }
      try {
        await Promise.resolve(exitFullscreen.call(documentRef));
      } catch (error) {
        setDirectorPreviewFullscreenMessage(`Could not leave native Full Screen: ${error?.message || "the window denied the request"}.`);
        return;
      }
    }
    setDirectorPreviewExpanded(false);
    setDirectorPreviewFullscreenMessage("");
  }, []);

  const toggleDirectorPreviewExpanded = useCallback(() => {
    if (directorPreviewExpanded) {
      void closeDirectorPreviewExpanded();
      return;
    }
    setDirectorPreviewFullscreenMessage("");
    setDirectorPreviewExpanded(true);
  }, [closeDirectorPreviewExpanded, directorPreviewExpanded]);

  const toggleDirectorPreviewFullscreen = useCallback(async () => {
    const documentRef = globalThis.document;
    const previewSurface = directorPreviewFullscreenRef.current;
    if (!documentRef || !previewSurface) {
      setDirectorPreviewFullscreenMessage("Full Screen is not available until the Preview is open.");
      return;
    }
    if (!directorPreviewExpanded) {
      setDirectorPreviewFullscreenMessage("Expand Preview before requesting native Full Screen.");
      return;
    }

    const fullscreenElement = documentRef.fullscreenElement || documentRef.webkitFullscreenElement || null;
    try {
      if (fullscreenElement === previewSurface) {
        const exitFullscreen = documentRef.exitFullscreen || documentRef.webkitExitFullscreen;
        if (typeof exitFullscreen !== "function") {
          setDirectorPreviewFullscreenMessage("Use Escape to leave Full Screen in this window.");
          return;
        }
        setDirectorPreviewFullscreenMessage("Closing full-screen Preview…");
        await Promise.resolve(exitFullscreen.call(documentRef));
        return;
      }

      if (fullscreenElement) {
        setDirectorPreviewFullscreenMessage("Another full-screen view is active. Leave it before opening the Preview.");
        return;
      }

      if (typeof previewSurface.requestFullscreen === "function") {
        setDirectorPreviewFullscreenMessage("Opening full-screen Preview…");
        await previewSurface.requestFullscreen();
      } else if (typeof previewSurface.webkitRequestFullscreen === "function") {
        setDirectorPreviewFullscreenMessage("Opening full-screen Preview…");
        await Promise.resolve(previewSurface.webkitRequestFullscreen());
      } else {
        setDirectorPreviewFullscreenMessage("Full Screen is not supported in this window.");
      }
    } catch (error) {
      setDirectorPreviewFullscreenMessage(`Full Screen could not start: ${error?.message || "the window denied the request"}.`);
    }
  }, [directorPreviewExpanded]);

  useEffect(() => {
    const documentRef = globalThis.document;
    if (!documentRef?.addEventListener) return undefined;

    const syncDirectorPreviewFullscreen = () => {
      const previewSurface = directorPreviewFullscreenRef.current;
      const previewIsFullscreen = directorPreviewIsFullscreen(documentRef, previewSurface);
      const previewWasFullscreen = directorPreviewFullscreenActiveRef.current;
      directorPreviewFullscreenActiveRef.current = previewIsFullscreen;
      setDirectorPreviewFullscreen(previewIsFullscreen);
      if (previewIsFullscreen) {
        setDirectorPreviewExpanded(true);
        setDirectorPreviewFullscreenMessage("Full-screen Preview active. Press Escape or choose Exit Full Screen to return.");
      } else if (previewWasFullscreen) {
        setDirectorPreviewFullscreenMessage("Exited full-screen Preview.");
      }
    };
    const reportDirectorPreviewFullscreenError = () => {
      directorPreviewFullscreenActiveRef.current = false;
      setDirectorPreviewFullscreen(false);
      setDirectorPreviewFullscreenMessage("Native Full Screen was blocked by this window. Expanded Preview stays open.");
    };

    documentRef.addEventListener("fullscreenchange", syncDirectorPreviewFullscreen);
    documentRef.addEventListener("webkitfullscreenchange", syncDirectorPreviewFullscreen);
    documentRef.addEventListener("fullscreenerror", reportDirectorPreviewFullscreenError);
    documentRef.addEventListener("webkitfullscreenerror", reportDirectorPreviewFullscreenError);
    syncDirectorPreviewFullscreen();
    return () => {
      documentRef.removeEventListener("fullscreenchange", syncDirectorPreviewFullscreen);
      documentRef.removeEventListener("webkitfullscreenchange", syncDirectorPreviewFullscreen);
      documentRef.removeEventListener("fullscreenerror", reportDirectorPreviewFullscreenError);
      documentRef.removeEventListener("webkitfullscreenerror", reportDirectorPreviewFullscreenError);
    };
  }, []);

  useEffect(() => {
    if (!directorPreviewExpanded) return undefined;
    const documentRef = globalThis.document;
    if (!documentRef?.addEventListener) return undefined;
    const body = documentRef.body;
    const previousBodyOverflow = body?.style?.overflow || "";
    if (body?.style) body.style.overflow = "hidden";
    const closeExpandedPreviewOnEscape = (event) => {
      if (event.key === "Escape" && !directorPreviewFullscreenActiveRef.current) {
        setDirectorPreviewExpanded(false);
        setDirectorPreviewFullscreenMessage("");
      }
    };
    documentRef.addEventListener("keydown", closeExpandedPreviewOnEscape);
    return () => {
      documentRef.removeEventListener("keydown", closeExpandedPreviewOnEscape);
      if (body?.style) body.style.overflow = previousBodyOverflow;
    };
  }, [directorPreviewExpanded]);

  const activeDirectorProject = useMemo(() => (
    directorProjects.find(p => p.music_video_project.song_id === selectedProjectSongId) || directorProjects[0] || null
  ), [selectedProjectSongId, directorProjects]);
  const activeStoredProject = activeDirectorProject?.music_video_project || null;
  const activeDirectionVariants = Array.isArray(activeStoredProject?.direction_script_variants)
    ? activeStoredProject.direction_script_variants
    : [];
  const activeDirectionVariantGroups = useMemo(
    () => groupEchoDirectionVariants(activeDirectionVariants),
    [activeDirectionVariants],
  );
  const activeDirectionVariant = selectedDirectionVariantId === "legacy"
    ? null
    : activeDirectionVariants.find((variant) => echoDirectionVariantId(variant) === selectedDirectionVariantId) || null;
  const activeDirectionVariantSelection = activeDirectionVariant ? selectedDirectionVariantId : "legacy";
  const directionWorkingForkActive = Boolean(
    workingDirectionFork
      && activeDirectionVariant
      && workingDirectionFork.sourceVariantId === echoDirectionVariantId(activeDirectionVariant),
  );
  const directionVariantReadOnly = Boolean(activeDirectionVariant && !directionWorkingForkActive);
  const activeProject = useMemo(() => {
    const selectedProject = directionWorkingForkActive
      ? deriveEchoDirectionWorkingProject(workingDirectionFork)
      : (!activeStoredProject || !activeDirectionVariant)
        ? activeStoredProject
        : deriveEchoDirectionVariantProject(activeStoredProject, activeDirectionVariant);
    if (!selectedProject) return null;
    const normalizedProject = attachEchoOutputProfile(selectedProject);
    return normalizedProject.hyperframe_script
      ? normalizedProject
      : { ...normalizedProject, hyperframe_script: generateEchoHyperframeScript(normalizedProject), hyperframe_script_stale: false };
  }, [activeDirectionVariant, activeStoredProject, directionWorkingForkActive, workingDirectionFork]);
  const activeOutputProfile = resolveEchoOutputProfile(activeProject);
  const activeShowGraph = useMemo(() => (
    activeProject?.director_show_graph?.tracks ? projectToEditorGraph(activeProject) : null
  ), [activeProject]);
  const activeIsolatedStems = Array.from(new Set((activeProject?.stems_available || []).map((stem) => String(stem || "").trim()).filter(Boolean)));
  const activeUsesAudioFallback = Boolean(activeProject && activeIsolatedStems.length === 0);
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

  const publishExactBindingDiagnostics = useCallback((patch = {}) => {
    const ledger = exactIsfBindingDiagnosticsRef.current;
    const next = { ...ledger.last, ...patch };
    const signature = JSON.stringify(next);
    if (signature === ledger.signature) return;
    ledger.signature = signature;
    ledger.updates += 1;
    ledger.last = next;
    globalThis.__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__ = {
      schemaVersion: "hapa.echo.isf-binding-diagnostics.v1",
      updates: ledger.updates,
      last: next
    };
    setExactIsfBindingDiagnostics(next);
  }, []);

  const handlePresentedMediaChange = useCallback((binding = null) => {
    const current = presentedMediaRef.current;
    if (binding?.presented && binding.element) {
      presentedMediaRef.current = binding;
    } else if (
      (!current || !binding?.sourceKey || current.sourceKey === binding.sourceKey)
      && !(current?.kind === "video" && isPresentedEchoVideoElement(current.element, current.sourceKey))
    ) {
      presentedMediaRef.current = null;
    }
    const presented = presentedMediaRef.current;
    publishExactBindingDiagnostics({
      media: presented ? {
        status: "presented",
        kind: presented.kind,
        mediaId: presented.mediaId,
        sourceKey: presented.sourceKey
      } : {
        status: "unavailable",
        kind: binding?.kind || "none",
        mediaId: binding?.mediaId || "",
        sourceKey: binding?.sourceKey || "",
        reason: binding?.reason || "no-current-presented-media"
      }
    });
  }, [publishExactBindingDiagnostics]);

  const ensureActiveStemBinding = useCallback((showGraph, card, requestedRole = null) => {
    const bindingCard = requestedRole ? stemCardForRole(card, requestedRole) : card;
    const selection = verifiedStemBinding(showGraph, bindingCard);
    const context = audioContextRef.current;
    const verifiedBus = selection.bus;
    const desiredKey = verifiedBus && context && context.state !== "closed"
      ? `${echoDirectorGraphVariantId(showGraph)}:${verifiedBus.id}:${verifiedBus.audioPath}`
      : `master:${selection.requestedKey}:${selection.fallbackReason || (verifiedBus ? "audio-context-unavailable" : selection.status)}`;

    if (!verifiedBus || !context || context.state === "closed") {
      return {
        key: desiredKey,
        requestedStem: selection.requested,
        requestedKey: selection.requestedKey,
        resolvedStem: "master",
        status: selection.status === "master" ? "master" : "master-fallback",
        fallbackReason: selection.fallbackReason || (verifiedBus ? "audio-context-unavailable" : ""),
        playbackBlocked: false,
        playbackError: "",
        playPending: false,
        lastPlayAttemptAt: 0,
        sourceGeneration: 0,
        readyGeneration: 0,
        readyUri: "",
        bus: null,
        targetUri: ""
      };
    }

    const pool = stemDecoderPoolRef.current;
    let resource = pool.get(desiredKey) || null;
    let retrySeed = { failureCount: 0, sourceGeneration: 0 };
    if (resource && !resource.disposed && resource.context === context) {
      resource.lastUsedTick = ++stemDecoderUseTickRef.current;
      resource.requestedStem = selection.requested;
      resource.requestedKey = selection.requestedKey;
      const decoderFailed = resource.status === "master-fallback" && Number(resource.failureCount || 0) > 0;
      if (!decoderFailed || !echoStemDecoderRetryDue(resource, echoStemDecoderNow())) return resource;
      retrySeed = {
        failureCount: Number(resource.failureCount || 0),
        sourceGeneration: Number(resource.sourceGeneration || 0),
      };
      pool.delete(desiredKey);
      disposeEchoStemResource(resource);
      resource = null;
    }
    if (resource) {
      pool.delete(desiredKey);
      disposeEchoStemResource(resource);
      resource = null;
    }

    const targetUri = resolveMediaUri(verifiedBus.audioPath);
    const sourceGeneration = retrySeed.sourceGeneration + 1;
    try {
      const element = document.createElement("audio");
      element.dataset.echoStemDecoder = "bounded-pool";
      element.preload = "auto";
      element.loop = true;
      element.crossOrigin = "anonymous";
      element.volume = 1;
      const sourceNode = context.createMediaElementSource(element);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      sourceNode.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(context.destination);
      resource = {
        context,
        element,
        sourceNode,
        analyser,
        silentGain,
        signalTracker: createEchoLiveSignalTracker(),
        key: desiredKey,
        requestedStem: selection.requested,
        requestedKey: selection.requestedKey,
        resolvedStem: verifiedBus.stemType || verifiedBus.id,
        status: "loading",
        fallbackReason: "",
        playbackBlocked: false,
        playbackError: "",
        playPending: false,
        lastPlayAttemptAt: 0,
        sourceGeneration,
        readyGeneration: 0,
        readyUri: "",
        bus: verifiedBus,
        targetUri,
        disposed: false,
        lastUsedTick: ++stemDecoderUseTickRef.current,
        failureCount: retrySeed.failureCount,
        retryDelayMs: 0,
        nextRetryAtMs: null,
        retryExhausted: false,
        playbackFailureCount: 0,
        playbackRetryDelayMs: 0,
        playbackNextRetryAtMs: null,
        playbackRetryExhausted: false,
      };
      const eventMatchesGeneration = () => (
        stemDecoderPoolRef.current.get(desiredKey) === resource
        && !resource.disposed
        && resource.sourceGeneration === sourceGeneration
        && resource.targetUri === targetUri
      );
      const markReady = () => {
        if (!eventMatchesGeneration()) return;
        resource.status = "ready";
        resource.readyGeneration = sourceGeneration;
        resource.readyUri = targetUri;
        resource.fallbackReason = "";
        resource.failureCount = 0;
        resource.retryDelayMs = 0;
        resource.nextRetryAtMs = null;
        resource.retryExhausted = false;
        publishExactBindingDiagnostics({ stem: compactStemBinding(resource) });
      };
      const markFailed = () => {
        if (!eventMatchesGeneration()) return;
        Object.assign(resource, nextEchoStemDecoderRetryState(resource, echoStemDecoderNow()));
        resource.status = "master-fallback";
        resource.readyGeneration = 0;
        resource.readyUri = "";
        resource.fallbackReason = element.error?.message || "stem-decoder-error";
        publishExactBindingDiagnostics({ stem: compactStemBinding(resource) });
      };
      resource.markReady = markReady;
      resource.markFailed = markFailed;
      element.addEventListener("canplay", markReady);
      element.addEventListener("loadeddata", markReady);
      element.addEventListener("error", markFailed);
      pool.set(desiredKey, resource);
      element.src = targetUri;
      element.load();
      return resource;
    } catch (error) {
      disposeEchoStemResource(resource);
      pool.delete(desiredKey);
      const retry = nextEchoStemDecoderRetryState({ failureCount: retrySeed.failureCount }, echoStemDecoderNow());
      const fallback = {
        context,
        key: desiredKey,
        requestedStem: selection.requested,
        requestedKey: selection.requestedKey,
        resolvedStem: "master",
        status: "master-fallback",
        fallbackReason: `stem-binding-error:${String(error?.message || error)}`,
        playbackBlocked: false,
        playbackError: "",
        playPending: false,
        lastPlayAttemptAt: 0,
        sourceGeneration,
        readyGeneration: 0,
        readyUri: "",
        bus: verifiedBus,
        targetUri,
        disposed: false,
        lastUsedTick: ++stemDecoderUseTickRef.current,
        ...retry,
      };
      pool.set(desiredKey, fallback);
      publishExactBindingDiagnostics({ stem: compactStemBinding(fallback) });
      return fallback;
    }
  }, [publishExactBindingDiagnostics]);

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const engine = createEchoPlaybackEngine({
      adapter: {
        renderer: "echo-react-ab",
        onSnapshot: (snapshot) => {
          globalThis.__HAPA_ECHO_PLAYBACK_ENGINE__ = snapshot;
          if (snapshot.reason !== "init") setEchoPlaybackSnapshot(snapshot);
        }
      }
    });
    echoPlaybackEngineRef.current = engine;
    return () => {
      engine.destroy();
      if (globalThis.__HAPA_ECHO_PLAYBACK_ENGINE__?.projectKey === engine.getSnapshot().projectKey) {
        delete globalThis.__HAPA_ECHO_PLAYBACK_ENGINE__;
      }
      if (echoPlaybackEngineRef.current === engine) echoPlaybackEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    echoPlaybackEngineRef.current?.setProject(activeProject);
  }, [activeProject]);

  useEffect(() => {
    echoPlaybackEngineRef.current?.setPowerMode(powerMode);
  }, [powerMode]);

  useEffect(() => {
    echoPlaybackEngineRef.current?.setPlaying(isPlaying);
  }, [isPlaying]);

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
    
    const audioRoute = echoProjectAudioRoute(activeProject);
    const url = resolveSongRegistryUri(audioRoute.uri);
    
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
  }, [
    activeProject?.audio_id,
    activeProject?.registry_track_id,
    activeProject?.song_id,
    activeShowGraph?.song?.audioPath,
  ]);

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
        disposeEchoStemDecoderPool(stemDecoderPoolRef.current);
        analyserNodeRef.current = null;
        connectedAudioRef.current = null;
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
  const shaderPickerCategories = useMemo(
    () => echoShaderPickerCategories(availableShaders),
    [availableShaders],
  );
  const filteredShaderOptions = useMemo(() => {
    return filterEchoShaderPickerShaders(availableShaders, {
      query: shaderPickerQuery,
      category: shaderCategoryFilter,
    });
  }, [availableShaders, shaderCategoryFilter, shaderPickerQuery]);
  const [savingProject, setSavingProject] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState("");
  const [saveFeedbackTone, setSaveFeedbackTone] = useState("idle");
  const [saveStartedAt, setSaveStartedAt] = useState(0);
  const [saveElapsedSeconds, setSaveElapsedSeconds] = useState(0);
  const [songCardPlanRevisionBySong, setSongCardPlanRevisionBySong] = useState({});
  const directorEditingLocked = savingProject || directionForkTransitionPending || loadingProjectDetail;

  useEffect(() => {
    if (!savingProject || !saveStartedAt) return undefined;
    const updateElapsed = () => setSaveElapsedSeconds(Math.max(0, Math.floor((Date.now() - saveStartedAt) / 1000)));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(interval);
  }, [saveStartedAt, savingProject]);

  // Volume control states
  const [directorVolume, setDirectorVolume] = useState(0.8);
  const [directorMuted, setDirectorMuted] = useState(false);
  const [audioDiagnostics, setAudioDiagnostics] = useState("Idle");
  const powerResumePlayingRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (powerMode === "active") {
      if (audioContextRef.current?.state === "suspended") audioContextRef.current.resume().catch(() => {});
      if (powerResumePlayingRef.current && audio?.paused) audio.play().catch(() => {});
      powerResumePlayingRef.current = false;
      return;
    }
    powerResumePlayingRef.current = Boolean(isPlaying && audio && !audio.paused);
    if (audio && !audio.paused) audio.pause();
    pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
    if (audioContextRef.current?.state === "running") audioContextRef.current.suspend().catch(() => {});
  }, [powerMode]);

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
    setSaveFeedbackTone("idle");
    setSaveElapsedSeconds(0);
    setPreviewBufferState({ status: "idle", ready: false, readyLookahead: 0, targetLookahead: 0 });
    setPreviewPreparation({ status: "idle" });
    presentedMediaRef.current = null;
    disposeEchoStemDecoderPool(stemDecoderPoolRef.current);
    masterSignalTrackerRef.current?.reset?.();
    exactIsfBindingDiagnosticsRef.current.frameBucket = -1;
    publishExactBindingDiagnostics({ media: null, stem: null, frameReceipt: null, composition: null, playbackPool: null, rendererTruth: null, rendererTruthReceipt: null });
  }, [selectedProjectSongId]);

  // Playback timer ticker fallback
  useEffect(() => {
    if (!isPlaying || powerMode === "hidden") return;
    let anim;
    let cadenceTimer;

    const tick = () => {
      const audio = audioRef.current;
      const project = activeProjectRef.current;

      if (audio && !audio.paused) {
        const next = audio.currentTime;
        currentTimeRef.current = next;
        echoPlaybackEngineRef.current?.tick(next, { playing: true });
        const duration = project?.duration || audio.duration || 180;
        if (next >= duration) {
          audio.pause();
          audio.currentTime = 0;
          currentTimeRef.current = 0;
          setCurrentTime(0);
          setIsPlaying(false);
          return;
        }
      } else if (audio) {
        setIsPlaying(false);
        return;
      }

      if (powerMode === "docked") cadenceTimer = window.setTimeout(() => { anim = requestAnimationFrame(tick); }, 1000 / 12);
      else anim = requestAnimationFrame(tick);
    };
    
    anim = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(anim);
      window.clearTimeout(cadenceTimer);
    };
  }, [isPlaying, powerMode]);

  // Audio time update handler
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const next = audioRef.current.currentTime;
    currentTimeRef.current = next;
    echoPlaybackEngineRef.current?.tick(next, { playing: isPlaying, reason: "media-timeupdate" });
  };

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      exactIsfPlaybackPoolRef.current?.dispose?.();
      exactIsfPlaybackPoolRef.current = null;
      exactIsfPlaybackPoolIdentityRef.current = { variantKey: "", dirtyKey: "", dirtyRangeCount: 0, shaderIds: [] };
      exactIsfPrewarmSignatureRef.current = "";
      exactIsfLastPresentedCanvasRef.current = null;
      disposeEchoStemDecoderPool(stemDecoderPoolRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
      if (globalThis.__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__) delete globalThis.__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__;
      if (globalThis.__HAPA_ECHO_ISF_PLAYBACK_DIAGNOSTICS__) delete globalThis.__HAPA_ECHO_ISF_PLAYBACK_DIAGNOSTICS__;
    };
  }, []);

  // Circular pulse visualizer canvas loop
  useEffect(() => {
    if (activeWorkbenchTab !== "preview" || powerMode === "hidden") return;
    let animFrame;
    let cadenceTimer;
    let disposed = false;

    const horizonHistory = [];
    const particles = [];
    const stars = [];

    const publishExactStatus = (next = {}) => {
      if (disposed) return;
      const normalized = typeof next === "string" ? { status: next } : next || {};
      const sourceId = String(normalized.sourceId || normalized.requestedShaderId || exactIsfPresentationRef.current.sourceId || "");
      const status = String(normalized.status || "idle");
      const error = String(normalized.error?.message || normalized.error || normalized.message || "");
      const previousPresentation = exactIsfPresentationRef.current;
      exactIsfPresentationRef.current = { ...normalized, status, sourceId, error };
      if (
        previousPresentation.status === status
        && previousPresentation.sourceId === sourceId
        && previousPresentation.error === error
      ) return;
      setExactIsfStatus({ status, sourceId, error });
    };

    const createExactPlaybackPool = (canvas) => {
      try {
        return createEchoIsfPlaybackPool({
          width: canvas.width,
          height: canvas.height,
          apiBase: API_BASE,
          maxSurfaces: 3,
        });
      } catch (error) {
        publishExactStatus({ status: "error", sourceId: "", error: String(error?.message || error) });
        return null;
      }
    };

    const ensureExactPlaybackPool = (canvas, showGraph) => {
      const nextIdentity = echoIsfGraphRuntimeIdentity(showGraph);
      const nextSizeKey = `${canvas.width}x${canvas.height}`;
      const previousIdentity = exactIsfPlaybackPoolIdentityRef.current;
      let pool = exactIsfPlaybackPoolRef.current;
      if (!pool) {
        pool = createExactPlaybackPool(canvas);
        exactIsfPlaybackPoolRef.current = pool;
      } else if (
        previousIdentity.variantKey !== nextIdentity.variantKey
        || previousIdentity.dirtyKey !== nextIdentity.dirtyKey
        || previousIdentity.sizeKey !== nextSizeKey
      ) {
        const variantChanged = previousIdentity.variantKey !== nextIdentity.variantKey;
        const sizeChanged = previousIdentity.sizeKey !== nextSizeKey;
        if (variantChanged || sizeChanged) {
          pool.dispose?.();
          exactIsfLastPresentedCanvasRef.current = null;
          exactIsfPrewarmSignatureRef.current = "";
          pool = createExactPlaybackPool(canvas);
          exactIsfPlaybackPoolRef.current = pool;
        }
        const changedDirtyRanges = !variantChanged && !sizeChanged && nextIdentity.dirtyRanges.length > Number(previousIdentity.dirtyRangeCount || 0)
          ? nextIdentity.dirtyRanges.slice(Number(previousIdentity.dirtyRangeCount || 0))
          : nextIdentity.dirtyRanges;
        if (!variantChanged && !sizeChanged) {
          pool.invalidate?.({
            shaderIds: [],
            ranges: changedDirtyRanges,
            cacheKey: "",
          });
          exactIsfPrewarmSignatureRef.current = "";
        }
      }
      exactIsfPlaybackPoolIdentityRef.current = {
        variantKey: nextIdentity.variantKey,
        dirtyKey: nextIdentity.dirtyKey,
        sizeKey: nextSizeKey,
        dirtyRangeCount: nextIdentity.dirtyRanges.length,
        shaderIds: nextIdentity.shaderIds,
      };
      return pool;
    };

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
      const cssWidth = Math.max(1, Number(canvas.clientWidth || 0));
      const pixelRatio = Math.max(1, Math.min(1.5, Number(globalThis.devicePixelRatio || 1)));
      const targetWidth = Math.min(activeOutputProfile.width, Math.max(640, Math.round(cssWidth * pixelRatio)));
      const targetHeight = Math.round(targetWidth * activeOutputProfile.height / activeOutputProfile.width);
      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animFrame = requestAnimationFrame(render);
        return;
      }
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      
      const masterClock = audioRef.current;
      const t = masterClock && !masterClock.paused
        ? Number(masterClock.currentTime || currentTimeRef.current)
        : currentTimeRef.current;
      currentTimeRef.current = t;
      const playheadShotIndex = activeProject?.timeline?.findIndex(item => t >= item.start_sec && t < item.end_sec);
      const currentTimelineItem = playheadShotIndex !== -1 && playheadShotIndex !== undefined ? activeProject.timeline[playheadShotIndex] : activeProject?.timeline?.[0];
      
      const playheadVisIndex = activeProject?.visualizer_timeline?.findIndex(item => t >= item.start_sec && t < item.end_sec);
      const currentVisItem = playheadVisIndex !== -1 && playheadVisIndex !== undefined ? activeProject.visualizer_timeline[playheadVisIndex] : activeProject?.visualizer_timeline?.[0];
      const visualizerTitle = currentVisItem?.visualizer_title || "None";
      const isVideo = shotMediaType(currentTimelineItem) === "video";
      
      const color = activeProject?.perspective === 'red' ? '#ef4444' : activeProject?.perspective === 'green' ? '#10b981' : '#06b6d4';

      const analyserNode = analyserNodeRef.current;

      // Generate or fetch audio inputs
      const timeVal = t;
      const observedAtSeconds = performance.now() / 1000;
      const masterSignalFrame = liveSignalFrame(analyserNode, t, {
        id: "master",
        label: "Master mix",
        source: "echo-master-audio",
        observedAtSeconds,
      }, masterSignalTrackerRef.current);
      const fftList = masterSignalFrame.status === "live" ? masterSignalFrame.fft : new Uint8Array(256);
      const waveList = masterSignalFrame.status === "live" ? masterSignalFrame.wave : new Uint8Array(256);
      
      let rms = 0.15;
      let beatFlash = 0;
      let hookFlash = 0;
      let telemetryRms = 0;

      if (masterSignalFrame.status === "live") {
        rms = masterSignalFrame.rms;
        beatFlash = masterSignalFrame.beat;
        hookFlash = masterSignalFrame.hook;
        telemetryRms = masterSignalFrame.telemetryRms;
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

      const directorShowGraph = activeShowGraph;
      const hasDirectorShowGraph = Boolean(directorShowGraph?.tracks);
      const graphVisualizerCards = hasDirectorShowGraph ? visualizerLookaheadCards(directorShowGraph, t, 3) : [];
      const graphVisualizerCard = graphVisualizerCards[0] || null;

      if (hasDirectorShowGraph) {
        const pool = ensureExactPlaybackPool(canvas, directorShowGraph);
        if (!graphVisualizerCard) {
          pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
          const missing = { status: "error", sourceId: "", error: "No executable Track B card at this graph time" };
          publishExactStatus(missing);
          const heldCanvas = exactIsfLastPresentedCanvasRef.current;
          if (heldCanvas) {
            ctx.drawImage(heldCanvas, 0, 0, width, height);
            drawExactIsfDiagnostic(ctx, width, height, missing, { preservePixels: true });
          } else {
            drawExactIsfDiagnostic(ctx, width, height, missing);
          }
        } else if (!pool) {
          const heldCanvas = exactIsfLastPresentedCanvasRef.current;
          if (heldCanvas) {
            ctx.drawImage(heldCanvas, 0, 0, width, height);
            drawExactIsfDiagnostic(ctx, width, height, exactIsfPresentationRef.current, { preservePixels: true });
          } else {
            drawExactIsfDiagnostic(ctx, width, height, exactIsfPresentationRef.current);
          }
        } else {
          try {
            const masterAudio = audioRef.current;
            const signalFrames = {};
            let selectedSignalFrame = null;
            if (masterSignalFrame.status === "live") {
              signalFrames.master = masterSignalFrame;
              selectedSignalFrame = masterSignalFrame;
            }
            const defaultStemRole = String(graphVisualizerCard?.visualization?.card?.stemFocus || graphVisualizerCard?.visualization?.stemFocus || "master");
            const currentStemRoles = echoIsfRequiredStemFocuses(graphVisualizerCard).slice(0, ECHO_STEM_DECODER_POOL_LIMIT);
            const currentBindings = currentStemRoles.map((role) => ({
              role,
              resource: normalizedStemFocus(role) === "master" ? null : ensureActiveStemBinding(directorShowGraph, graphVisualizerCard, role),
            }));
            const currentResourceKeys = new Set(currentBindings.map((binding) => binding.resource?.key).filter((key) => key && !key.startsWith("master:")));
            const protectedResourceKeys = new Set(currentResourceKeys);
            let lookaheadSlots = Math.max(0, ECHO_STEM_DECODER_POOL_LIMIT - currentResourceKeys.size);
            for (const lookaheadCard of graphVisualizerCards.slice(1, 3)) {
              if (lookaheadSlots <= 0) break;
              for (const role of echoIsfRequiredStemFocuses(lookaheadCard)) {
                if (lookaheadSlots <= 0) break;
                if (normalizedStemFocus(role) === "master") continue;
                const resource = ensureActiveStemBinding(directorShowGraph, lookaheadCard, role);
                if (!resource?.element || resource.disposed) continue;
                const wasKnown = protectedResourceKeys.has(resource.key);
                protectedResourceKeys.add(resource.key);
                if (!wasKnown) lookaheadSlots -= 1;
                const prewarmTime = Number(lookaheadCard.startSeconds || t);
                if (resource.element.readyState >= 1 && resource.element.paused && !resource.element.seeking && Math.abs(Number(resource.element.currentTime || 0) - prewarmTime) > 0.12) {
                  try { resource.element.currentTime = prewarmTime; } catch { /* lookahead decoder may still be binding metadata */ }
                }
              }
            }
            pruneEchoStemDecoderPool(
              stemDecoderPoolRef.current,
              protectedResourceKeys,
              ECHO_STEM_DECODER_POOL_LIMIT,
              currentResourceKeys,
            );

            const targetTime = Number(masterAudio?.currentTime ?? t);
            const shouldPlayStem = isPlayingRef.current && powerMode === "active";
            const sampledFramesByResource = new Map();
            let stemResource = currentBindings.find((binding) => normalizedStemFocus(binding.role) === normalizedStemFocus(defaultStemRole))?.resource || null;
            let stemTransport = { usable: false, reason: stemResource?.status || "master-selected" };

            for (const binding of currentBindings) {
              const resource = binding.resource;
              if (!resource?.element || resource.disposed) continue;
              const stemElement = resource.element;
              if (stemElement.readyState >= 1 && !stemElement.seeking && Math.abs(Number(stemElement.currentTime || 0) - targetTime) > 0.12) {
                try { stemElement.currentTime = targetTime; } catch { /* decoder may still be binding metadata */ }
              }
              if (
                shouldPlayStem
                && resource.status === "ready"
                && resource.readyGeneration === resource.sourceGeneration
                && resource.readyUri === resource.targetUri
                && stemElement.readyState >= 2
                && !stemElement.seeking
                && stemElement.paused
                && !resource.playPending
                && resource.playbackRetryExhausted !== true
                && (resource.playbackNextRetryAtMs == null || echoStemPlaybackRetryDue(resource, echoStemDecoderNow()))
                && performance.now() - resource.lastPlayAttemptAt > 250
              ) {
                resource.playPending = true;
                resource.lastPlayAttemptAt = performance.now();
                const playGeneration = resource.sourceGeneration;
                const playKey = resource.key;
                const playUri = resource.targetUri;
                const isCurrentPlayAttempt = () => (
                  stemDecoderPoolRef.current.get(playKey) === resource
                  && !resource.disposed
                  && resource.sourceGeneration === playGeneration
                  && resource.targetUri === playUri
                );
                Promise.resolve()
                  .then(() => stemElement.play())
                  .then(() => {
                    if (!isCurrentPlayAttempt()) return;
                    resource.playbackBlocked = false;
                    resource.playbackError = "";
                    resource.playbackFailureCount = 0;
                    resource.playbackRetryDelayMs = 0;
                    resource.playbackNextRetryAtMs = null;
                    resource.playbackRetryExhausted = false;
                  })
                  .catch((error) => {
                    if (!isCurrentPlayAttempt()) return;
                    Object.assign(resource, nextEchoStemPlaybackRetryState(resource, echoStemDecoderNow()));
                    resource.playbackBlocked = true;
                    resource.playbackError = `stem-decoder-playback-blocked:${String(error?.message || error)}`;
                    const transport = echoStemTransportHealth(resource, true);
                    publishExactBindingDiagnostics({ stem: compactStemSignalBinding(resource, transport) });
                  })
                  .finally(() => { if (isCurrentPlayAttempt()) resource.playPending = false; });
              } else if (!shouldPlayStem && !stemElement.paused) {
                stemElement.pause();
              }

              let stemFrame = sampledFramesByResource.get(resource.key);
              if (!stemFrame) {
                stemFrame = liveSignalFrame(resource.analyser, t, {
                  id: resource.bus?.stemId || binding.role,
                  label: resource.resolvedStem,
                  source: "verified-registry-stem",
                  stemFocus: binding.role,
                  pathTruthStatus: resource.bus?.truthStatus,
                  observedAtSeconds,
                }, resource.signalTracker);
                sampledFramesByResource.set(resource.key, stemFrame);
              }
              const allowSilent = echoStemRoleAllowsSilence(graphVisualizerCard, binding.role);
              const transport = echoStemTransportHealth(resource, shouldPlayStem, {
                targetTimeSeconds: targetTime,
                stemFrame,
                masterFrame: masterSignalFrame,
                allowSilent,
              });
              resource.lastTransport = transport;
              if (normalizedStemFocus(binding.role) === normalizedStemFocus(defaultStemRole)) stemTransport = transport;
              if (!transport.usable) continue;
              signalFrames[binding.role] = stemFrame;
              signalFrames[normalizedStemFocus(binding.role)] = stemFrame;
              signalFrames[resource.requestedStem] = stemFrame;
              signalFrames[normalizedStemFocus(resource.requestedStem)] = stemFrame;
            }
            selectedSignalFrame = signalFrames[defaultStemRole]
              || signalFrames[normalizedStemFocus(defaultStemRole)]
              || signalFrames.master
              || selectedSignalFrame;
            const expectedMediaId = String(currentTimelineItem?.media_id || "");
            const currentPresentedMedia = resolvePresentedEchoMediaBinding(
              directorPreviewFullscreenRef.current,
              currentTimelineItem,
              presentedMediaRef.current
            );
            if (currentPresentedMedia?.recoveredFrom) presentedMediaRef.current = currentPresentedMedia;
            const compositionInput = visualizerCompositionInput(graphVisualizerCard, t);
            const presentation = pool.present(graphVisualizerCard, {
              time: t,
              fft: fftList,
              wave: waveList,
              audio: selectedSignalFrame,
              signalFrames,
              mediaElement: currentPresentedMedia?.element || null,
              mediaIdentity: currentPresentedMedia ? {
                id: currentPresentedMedia.mediaId,
                uri: currentPresentedMedia.uri,
                sourceHash: currentTimelineItem?.media_contract?.sourceHash || currentTimelineItem?.media_sha256 || ""
              } : null,
              composition: compositionInput,
              cacheKey: echoIsfGraphRuntimeIdentity(directorShowGraph).variantKey,
              width,
              height,
            }) || {};
            const graphIdentity = echoIsfGraphRuntimeIdentity(directorShowGraph);
            const prewarmCards = graphVisualizerCards.slice(1);
            const prewarmSignature = `${graphIdentity.variantKey}:${prewarmCards.map((card) => `${exactVisualizerSourceId(card)}:${card?.visualization?.card?.source?.hash || ""}`).join("|")}`;
            if (prewarmSignature !== exactIsfPrewarmSignatureRef.current) {
              exactIsfPrewarmSignatureRef.current = prewarmSignature;
              const prewarmResult = pool.prewarm({ cards: prewarmCards, cacheKey: graphIdentity.variantKey });
              if (prewarmResult && typeof prewarmResult.catch === "function") prewarmResult.catch(() => {});
            }
            const requestedShaderId = String(presentation.requestedShaderId || presentation.shaderId || exactVisualizerSourceId(graphVisualizerCard));
            const presentedShaderId = String(presentation.presentedShaderId || "");
            const heldPreviousFrame = presentation.heldPreviousFrame === true || presentation.heldPrevious === true;
            const namedStatus = String(presentation.handoff || presentation.status || "loading");
            const audioEnvelope = echoVisualizerAudioEnvelope(selectedSignalFrame || masterSignalFrame);
            const composition = { ...(presentation.composition || compositionInput), audioEnvelope };
            const rendererTruth = exactEchoRendererTruth(graphVisualizerCard, {
              ...presentation,
              status: presentation.status || namedStatus,
              requestedShaderId,
              presentedShaderId,
              heldPreviousFrame,
            }, "echo-avatar-builder");
            const poolDiagnostics = compactEchoIsfPlaybackDiagnostics(pool.getDiagnostics?.() || pool.getState?.() || {}, presentation, graphVisualizerCards);
            const frameBucket = Math.floor(t * 4);
            if (exactIsfBindingDiagnosticsRef.current.frameBucket !== frameBucket) {
              exactIsfBindingDiagnosticsRef.current.frameBucket = frameBucket;
              globalThis.__HAPA_ECHO_ISF_PLAYBACK_DIAGNOSTICS__ = poolDiagnostics;
              publishExactBindingDiagnostics({
                media: currentPresentedMedia ? { status: "presented", kind: currentPresentedMedia.kind, mediaId: currentPresentedMedia.mediaId, sourceKey: currentPresentedMedia.sourceKey } : { status: "unavailable", kind: shotMediaType(currentTimelineItem), mediaId: expectedMediaId, sourceKey: "", reason: "no-current-presented-media" },
                stem: compactStemSignalBinding(stemResource, stemTransport),
                frameReceipt: compactFrameReceipt(presentation.frameReceipt),
                composition,
                playbackPool: poolDiagnostics,
                rendererTruth: rendererTruth?.truth || null,
                rendererTruthReceipt: rendererTruth?.receipt || null,
              });
            }
            publishExactStatus({
              status: namedStatus,
              sourceId: requestedShaderId,
              requestedShaderId,
              presentedShaderId,
              error: String(presentation.error?.message || presentation.error || ""),
            });
            const presentationCanvas = presentation.canvas || exactIsfLastPresentedCanvasRef.current;
            if (presentation.canvas) exactIsfLastPresentedCanvasRef.current = presentation.canvas;
            if (presentationCanvas) {
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, Number(composition.effectiveAlpha ?? (composition.opacity * composition.mix * composition.transitionAlpha)) || 0));
              ctx.globalCompositeOperation = composition.canvasComposite || "source-over";
              ctx.filter = `brightness(${audioEnvelope.brightness.toFixed(3)}) saturate(${audioEnvelope.saturation.toFixed(3)}) contrast(${audioEnvelope.contrast.toFixed(3)})`;
              ctx.translate(width / 2, height / 2);
              ctx.scale(audioEnvelope.scale, audioEnvelope.scale);
              ctx.drawImage(presentationCanvas, -width / 2, -height / 2, width, height);
              ctx.restore();
              if (!presentation.canvas || heldPreviousFrame || presentation.status !== "ready") {
                drawExactIsfDiagnostic(ctx, width, height, {
                  status: namedStatus,
                  sourceId: `${presentedShaderId || "last-good"} → ${requestedShaderId}`,
                  error: presentation.error,
                }, { preservePixels: true });
              }
            } else {
              drawExactIsfDiagnostic(ctx, width, height, {
                status: namedStatus,
                sourceId: requestedShaderId,
                error: presentation.error,
              });
            }
          } catch (error) {
            const failed = { status: "error", sourceId: exactVisualizerSourceId(graphVisualizerCard), error: String(error?.message || error) };
            publishExactStatus(failed);
            const heldCanvas = exactIsfLastPresentedCanvasRef.current;
            if (heldCanvas) {
              ctx.drawImage(heldCanvas, 0, 0, width, height);
              drawExactIsfDiagnostic(ctx, width, height, failed, { preservePixels: true });
            } else {
              drawExactIsfDiagnostic(ctx, width, height, failed);
            }
          }
        }
      } else {
      const legacyRenderer = legacyEchoRendererTruth(currentVisItem, "echo-avatar-builder");
      const renderMode = legacyRenderer?.approximation?.mode || "";
      const legacyFrameBucket = Math.floor(t * 4);
      if (exactIsfBindingDiagnosticsRef.current.legacyFrameBucket !== legacyFrameBucket) {
        exactIsfBindingDiagnosticsRef.current.legacyFrameBucket = legacyFrameBucket;
        publishExactBindingDiagnostics({
          rendererTruth: legacyRenderer?.truth || null,
          rendererTruthReceipt: legacyRenderer?.receipt || null,
          frameReceipt: legacyRenderer ? {
            schemaVersion: "hapa.echo.legacy-renderer-frame-receipt.v1",
            timestampSeconds: Number(t.toFixed(3)),
            requestedId: legacyRenderer.truth.requested.id,
            status: legacyRenderer.truth.status,
            substitute: legacyRenderer.truth.substitute,
            reason: legacyRenderer.truth.reason,
            fidelityLoss: legacyRenderer.truth.fidelityLoss,
          } : null,
          playbackPool: null,
        });
      }

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
      } else if (!renderMode) {
        const truth = legacyRenderer?.truth;
        ctx.save();
        ctx.fillStyle = "rgba(2, 6, 23, 0.9)";
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = "rgba(248,113,113,.78)";
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, width - 40, height - 40);
        ctx.fillStyle = "#fecaca";
        ctx.font = "800 13px monospace";
        ctx.fillText("UNSUPPORTED LEGACY VISUALIZER", 36, 56);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "10px monospace";
        ctx.fillText(String(truth?.requested?.id || currentVisItem?.visualizer_id || "missing-id").slice(0, 78), 36, 80);
        ctx.fillText(String(truth?.reason || "legacy-title-and-id-not-recognized").slice(0, 78), 36, 100);
        ctx.fillText("No substitute rendered.", 36, 120);
        ctx.restore();
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
        ctx.fillText(`FPS: ${activeOutputProfile.fps} // RESOLUTION: ${activeOutputProfile.width}X${activeOutputProfile.height}`, margin + 15, margin + 37);
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
      if (renderMode && legacyRenderer?.truth) {
        ctx.save();
        ctx.fillStyle = "rgba(2,6,23,.78)";
        ctx.fillRect(18, 18, Math.min(360, width - 36), 42);
        ctx.strokeStyle = "rgba(251,191,36,.52)";
        ctx.strokeRect(18, 18, Math.min(360, width - 36), 42);
        ctx.fillStyle = "#fde68a";
        ctx.font = "800 10px monospace";
        ctx.fillText(`APPROXIMATION · ${legacyRenderer.truth.requested.id || "missing-id"}`.slice(0, 56), 30, 36);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "9px monospace";
        ctx.fillText(`SUBSTITUTE ${legacyRenderer.truth.substitute?.id || renderMode} · PIXEL PARITY NOT CLAIMED`.slice(0, 70), 30, 51);
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
      
      if (powerMode === "docked") cadenceTimer = window.setTimeout(() => { animFrame = requestAnimationFrame(render); }, 1000 / 12);
      else animFrame = requestAnimationFrame(render);
    };
    render();
    return () => {
      disposed = true;
      cancelAnimationFrame(animFrame);
      window.clearTimeout(cadenceTimer);
      pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
    };
  }, [activeWorkbenchTab, activeProject, powerMode]);

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

  const commitDirectorProjectDetail = (detail, requestGeneration = null) => {
    const detailSongId = detail?.music_video_project?.song_id;
    if (
      requestGeneration !== null
      && projectDetailGenerationBySongRef.current.get(detailSongId) !== requestGeneration
    ) return false;
    setDirectorProjects(prev => {
      const nextProject = detail?.music_video_project;
      if (!nextProject?.song_id) return prev;
      const index = prev.findIndex(p => p.music_video_project.song_id === nextProject.song_id);
      if (index === -1) return [...prev, detail];
      const next = prev.slice();
      next[index] = detail;
      return next;
    });
    return true;
  };

  const fetchProjectDetail = async (songId, variantId = "", options = {}) => {
    if (!songId) return;
    const requestPriority = options.priority === "foreground" ? 1 : 0;
    const activeRequest = projectDetailControllerBySongRef.current.get(songId);
    if (activeRequest?.priority > requestPriority) return null;
    activeRequest?.controller.abort();
    const controller = new AbortController();
    const requestGeneration = (projectDetailGenerationBySongRef.current.get(songId) || 0) + 1;
    projectDetailGenerationBySongRef.current.set(songId, requestGeneration);
    projectDetailControllerBySongRef.current.set(songId, { controller, priority: requestPriority });
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ECHO_PROJECT_DETAIL_TIMEOUT_MS);
    projectDetailRequestCountRef.current += 1;
    setLoadingProjectDetail(true);
    try {
      const params = new URLSearchParams({ songId });
      if (variantId && variantId !== "legacy") params.set("variantId", variantId);
      const res = await fetch(`${API_BASE}/api/echos/director-project?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) return null;
      const detail = await res.json();
      if (options.commit !== false && !commitDirectorProjectDetail(detail, requestGeneration)) return null;
      return { detail, requestGeneration };
    } catch (e) {
      if (e?.name === "AbortError" && timedOut) {
        console.warn(`Director project detail timed out after ${ECHO_PROJECT_DETAIL_TIMEOUT_MS / 1000} seconds.`);
      } else if (e?.name !== "AbortError") {
        console.error("Failed to load director project detail:", e);
      }
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
      if (projectDetailControllerBySongRef.current.get(songId)?.controller === controller) {
        projectDetailControllerBySongRef.current.delete(songId);
      }
      projectDetailRequestCountRef.current = Math.max(0, projectDetailRequestCountRef.current - 1);
      setLoadingProjectDetail(projectDetailRequestCountRef.current > 0);
    }
  };

  const editableDirectionForkFromDetail = (detail, variantId, options = {}) => {
    const project = detail?.music_video_project;
    const variant = project?.direction_script_variants?.find((candidate) => (
      echoDirectionVariantId(candidate) === variantId && Array.isArray(candidate.timeline)
    ));
    if (!project || !variant) return null;
    const projectedProject = attachEchoOutputProfile(deriveEchoDirectionVariantProject(project, variant));
    const fallbackProject = options.fallbackProject;
    const selectedProject = projectedProject?.director_show_graph?.tracks
      ? projectedProject
      : fallbackProject?.director_show_graph?.tracks
        ? {
          ...projectedProject,
          director_show_graph: fallbackProject.director_show_graph,
          editor_graph_fallback: {
            schemaVersion: "hapa.echo.editor-graph-fallback.v1",
            source: "saved-working-snapshot",
            reason: projectedProject?.execution_preview?.reason || "saved-cut-certification-pending",
            preservesPortableCards: true,
          },
        }
        : null;
    if (!selectedProject) return null;
    return {
      variant,
      workingFork: createEchoDirectionWorkingFork(selectedProject, variant),
    };
  };

  const prepareSmoothPreview = async () => {
    if (!selectedProjectSongId || ["queued", "running"].includes(previewPreparation.status)) return;
    setPreviewPreparation({ status: "running", songId: selectedProjectSongId });
    try {
      const response = await fetch(`${API_BASE}/api/echos/director-preview/prepare?songId=${encodeURIComponent(selectedProjectSongId)}`, { method: "POST" });
      const payload = await response.json(); setPreviewPreparation(payload);
    } catch (error) { setPreviewPreparation({ status: "failed", error: String(error.message || error) }); }
  };

  useEffect(() => {
    if (!selectedProjectSongId || !["queued", "running"].includes(previewPreparation.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/echos/director-preview/prepare?songId=${encodeURIComponent(selectedProjectSongId)}`);
        const payload = await response.json(); setPreviewPreparation(payload);
        if (payload.status === "ready") await fetchProjectDetail(
          selectedProjectSongId,
          selectedDirectionVariantId === "legacy" ? "" : selectedDirectionVariantId,
        );
      } catch { /* the next poll can recover */ }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [previewPreparation.status, selectedDirectionVariantId, selectedProjectSongId]);

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

  const updateSelectedDirectionCut = (updateProject) => {
    if (directorEditingLocked) return false;
    if (!activeDirectionVariant || !activeProject) return false;
    const sourceVariantId = echoDirectionVariantId(activeDirectionVariant);
    setWorkingDirectionFork((current) => {
      const workingFork = current?.sourceVariantId === sourceVariantId
        ? current
        : createEchoDirectionWorkingFork(activeProject, activeDirectionVariant);
      return {
        ...workingFork,
        project: updateProject(workingFork.project),
      };
    });
    setSaveSuccessMessage("");
    return true;
  };

  const handleUpdateShot = (shotIdx, updatedFields) => {
    if (directorEditingLocked) return;
    if (updateSelectedDirectionCut((project) => ({
      ...project,
      timeline: (project.timeline || []).map((shot, idx) => idx === shotIdx ? { ...shot, ...updatedFields } : shot),
      hyperframe_script_stale: true,
      updated_at: new Date().toISOString(),
    }))) return;
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
    if (directorEditingLocked) return;
    if (updateSelectedDirectionCut((project) => ({
      ...project,
      visualizer_timeline: (project.visualizer_timeline || []).map((visualizer, idx) => idx === visIdx ? { ...visualizer, ...updatedFields } : visualizer),
      hyperframe_script_stale: true,
      updated_at: new Date().toISOString(),
    }))) return;
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
    if (directorEditingLocked) return;
    if (updateSelectedDirectionCut((project) => ({
      ...project,
      ...updatedFields,
      hyperframe_script_stale: true,
      updated_at: new Date().toISOString(),
    }))) return;
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

  const handleContinueFromDirectionCut = () => {
    if (directorEditingLocked || !activeDirectionVariant || !activeProject) return;
    setWorkingDirectionFork(createEchoDirectionWorkingFork(activeProject, activeDirectionVariant));
    setSaveSuccessMessage("Editable working cut started. Its source cut and Legacy current remain unchanged.");
  };

  const handleCancelDirectionFork = () => {
    if (directorEditingLocked) return;
    setWorkingDirectionFork(null);
    setSaveSuccessMessage("Working cut discarded. The source cut remains unchanged.");
    setSaveFeedbackTone("success");
  };

  const beginProjectSave = () => {
    setSavingProject(true);
    setSaveStartedAt(Date.now());
    setSaveElapsedSeconds(0);
    setSaveFeedbackTone("progress");
    setSaveSuccessMessage("");
  };

  const queueSongCardPlanForSavedRevision = (songId, revision = "") => {
    if (!songId) return;
    setSongCardPlanRevisionBySong((current) => ({
      ...current,
      [songId]: revision || `${Date.now()}`,
    }));
  };

  const handleSaveWorkingDirectionFork = async () => {
    if (!directionWorkingForkActive || !workingDirectionFork || !activeProject) return;
    beginProjectSave();
    try {
      const projectToSave = withFreshHyperframeScript(activeProject);
      const request = buildEchoDirectionForkRequest(workingDirectionFork, projectToSave);
      const response = await saveEchoProjectRequest(`${API_BASE}/api/echos/direction-variant/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || "Failed to save the new direction cut.");
      const savedVariantId = payload.variant?.id || payload.id || "";
      if (!savedVariantId) throw new Error("The new direction cut was saved without an editable cut identifier.");
      setDirectionForkTransitionPending(true);
      setSaveFeedbackTone("success");
      setSaveSuccessMessage("New append-only direction cut saved. Opening its protected editable copy; Legacy current and the source cut are unchanged.");
      void fetchProjectDetail(projectToSave.song_id, savedVariantId, { commit: false, priority: "foreground" }).then((detailResult) => {
        const detail = detailResult?.detail;
        if (detail) {
          const editableSelection = editableDirectionForkFromDetail(detail, savedVariantId, { fallbackProject: projectToSave });
          if (editableSelection) {
            if (!commitDirectorProjectDetail(detail, detailResult.requestGeneration)) {
              setEchoOperationNotice("The cut is saved, but a newer detail refresh superseded this response. The current working copy remains open unchanged.");
              return;
            }
            setWorkingDirectionFork(editableSelection.workingFork);
            setSelectedDirectionVariantId(savedVariantId);
            setSaveSuccessMessage("New append-only direction cut saved and reopened as an editable copy. Higher-quality cards remain attached while Song Card preparation continues in Tracks.");
          } else {
            setEchoOperationNotice("The cut is saved, but its editable child is still preparing. The current working copy remains open with its higher-quality cards intact.");
          }
          queueSongCardPlanForSavedRevision(projectToSave.song_id, savedVariantId || projectToSave.updated_at);
          return;
        }
        setEchoOperationNotice("The cut is saved, but its editable child could not be refreshed. The current working copy remains open and unchanged; retry the saved cut when ready.");
      }).catch((error) => {
        setEchoOperationNotice(`The cut is saved, but its editable child could not be refreshed: ${error.message || String(error)}. The current working copy remains open.`);
      }).finally(() => {
        setDirectionForkTransitionPending(false);
      });
    } catch (error) {
      setSaveFeedbackTone("error");
      setSaveSuccessMessage(`Could not save the new cut: ${error.message || String(error)}`);
    } finally {
      setSavingProject(false);
      setSaveStartedAt(0);
    }
  };

  const handleSaveProject = async (activeProject) => {
    if (directionWorkingForkActive) {
      await handleSaveWorkingDirectionFork();
      return;
    }
    if (directionVariantReadOnly) {
      setSaveSuccessMessage("This saved cut has no working changes yet. Change any setting or start an editable copy before saving a new cut.");
      setSaveFeedbackTone("error");
      return;
    }
    beginProjectSave();
    try {
      const projectToSave = withFreshHyperframeScript(activeProject);
      const res = await saveEchoProjectRequest(`${API_BASE}/api/echos/director-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ music_video_project: projectToSave })
      });
      if (res.ok) {
        setDirectorProjects(prev => prev.map(p => (
          p.music_video_project.song_id === projectToSave.song_id
            ? { music_video_project: projectToSave }
            : p
        )));
        const compileResponse = await saveEchoProjectRequest(`${API_BASE}/api/echos/director-project/compile`, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songId: projectToSave.song_id })
        });
        const compilePayload = await compileResponse.json().catch(() => ({}));
        if (!compileResponse.ok) {
          setSaveFeedbackTone("error");
          setSaveSuccessMessage(`Music video blueprint saved, but its render graph could not be rebuilt: ${compilePayload.message || compilePayload.error || `compile failed (${compileResponse.status})`}. Your edit is intact; retry Save before rendering.`);
          return;
        }
        setSaveFeedbackTone("success");
        setSaveSuccessMessage("Music video blueprint saved to disk. Song Card preparation is continuing separately in Tracks.");
        queueSongCardPlanForSavedRevision(projectToSave.song_id, projectToSave.updated_at);
      } else {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || `Save failed (${res.status}).`);
      }
    } catch (e) {
      console.error("Save error:", e);
      setSaveFeedbackTone("error");
      setSaveSuccessMessage(`Could not save the music video blueprint: ${e.message || String(e)}`);
    } finally {
      setSavingProject(false);
      setSaveStartedAt(0);
    }
  };

  const handleRunDirector = async () => {
    setPlanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/echos/director-plan?orientation=${encodeURIComponent(activeOutputProfile.id)}`, { method: 'POST' });
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
    setSelectedDirectionVariantId("legacy");
    setWorkingDirectionFork(null);
    setDirectionForkTransitionPending(false);
  }, [selectedProjectSongId]);

  useEffect(() => {
    if (!selectedProjectSongId || activeProjectHasDetail || loadingProjectDetail) return;
    fetchProjectDetail(selectedProjectSongId);
  }, [activeProjectHasDetail, loadingProjectDetail, selectedProjectSongId]);

  const buildFreshProjectScript = (project) => generateEchoHyperframeScript(project);

  const withFreshHyperframeScript = (project) => {
    const normalizedProject = attachEchoOutputProfile(project);
    return {
      ...normalizedProject,
      hyperframe_script: buildFreshProjectScript(normalizedProject),
      hyperframe_script_stale: false,
      updated_at: new Date().toISOString()
    };
  };

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
                        <option value="system_media">System Media</option>
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
                          <option key={tag} value={tag}>{echoMediaTagLabel(tag)}</option>
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
                              background: video.source === 'scene' ? 'rgba(236, 72, 153, 0.15)' : video.source === 'system_media' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                              color: video.source === 'scene' ? 'var(--hapa-neon-fuchsia)' : video.source === 'system_media' ? '#6ee7b7' : 'var(--hapa-neon-cyan)'
                            }}>
                              {echoMediaSourceLabel(video)}
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
                            <span><strong>Source:</strong> {echoMediaSourceLabel(selectedDetailVideo)}</span>
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
                {(savingProject || directionForkTransitionPending || saveSuccessMessage) && (
                  <span
                    data-testid="echo-save-status"
                    role={saveFeedbackTone === "error" ? "alert" : "status"}
                    aria-live="polite"
                    style={{
                      fontSize: '11px',
                      color: saveFeedbackTone === "error" ? 'var(--hapa-neon-red)' : saveFeedbackTone === "progress" ? 'var(--hapa-neon-gold)' : 'var(--hapa-neon-green)',
                      fontWeight: 'bold',
                      background: saveFeedbackTone === "error" ? 'rgba(239, 68, 68, 0.1)' : saveFeedbackTone === "progress" ? 'rgba(246, 201, 109, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: `1px solid ${saveFeedbackTone === "error" ? 'var(--hapa-neon-red)' : saveFeedbackTone === "progress" ? 'var(--hapa-neon-gold)' : 'var(--hapa-neon-green)'}`,
                    }}
                  >
                    {savingProject
                      ? saveElapsedSeconds >= 10
                        ? `Saving cut · ${saveElapsedSeconds}s · waiting for disk acknowledgment…`
                        : `Saving cut · ${saveElapsedSeconds}s…`
                      : directionForkTransitionPending
                        ? "Cut saved · opening its editable copy…"
                      : saveSuccessMessage}
                  </span>
                )}
              </div>

              {/* Side-by-Side Flex Layout Container */}
              <div
                className="media-explorer-layout"
                data-edit-locked={directorEditingLocked ? "true" : "false"}
                aria-busy={directorEditingLocked}
                style={{ display: 'flex', gap: '15px', flex: 1, minHeight: 0, overflow: 'hidden', pointerEvents: directorEditingLocked ? 'none' : 'auto', opacity: directorEditingLocked ? 0.82 : 1, transition: 'opacity 120ms ease' }}
              >
                
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
                          aria-disabled={directorEditingLocked}
                          onClick={() => { if (!directorEditingLocked) setSelectedProjectSongId(proj.song_id); }}
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
                  <EchoPlaybackClockBoundary
                    clockRef={currentTimeRef}
                    initialTime={currentTime}
                    active={isPlaying}
                    powerMode={powerMode}
                    project={activeProject}
                  >
                  {(currentTime) => {
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
                    const engineOwnsProject = echoPlaybackSnapshot?.projectKey === String(activeProject.song_id || activeProject.id || activeProject.song_title || "");
                    const playheadShotIndex = engineOwnsProject && echoPlaybackSnapshot.targetShotIndex >= 0
                      ? echoPlaybackSnapshot.targetShotIndex
                      : activeProject.timeline?.findIndex(item => currentTime >= item.start_sec && currentTime < item.end_sec);
                    const currentTimelineItem = playheadShotIndex !== -1 && playheadShotIndex !== undefined ? activeProject.timeline[playheadShotIndex] : activeProject.timeline?.[0];
                    const lookaheadTimelineItems = activeProject.timeline?.slice(Math.max(0, playheadShotIndex) + 1, Math.max(0, playheadShotIndex) + 3) || [];
                    const activeTimelineItem = activeProject.timeline?.[selectedShotIndex] || activeProject.timeline?.[0];
                    const activeVisualizerItem = activeProject.visualizer_timeline?.[selectedVisualizerIndex] || activeProject.visualizer_timeline?.[0];
                    const currentLine = activeProject.timed_lyrics?.find(l => currentTime >= l.start && currentTime < l.end);
                    const pendingPreviewProxyCount = activeProject.timeline?.filter((item) => item.media_contract?.type === "video" && item.media_contract?.proxy?.status !== "ready").length || 0;
                    const isVerticalOutput = activeOutputProfile.id === "vertical";
                    const directorPreviewWidth = isVerticalOutput
                      ? ECHO_VERTICAL_EXPANDED_PREVIEW_WIDTH
                      : ECHO_EXPANDED_PREVIEW_WIDTH;
                    const compactPreviewWidth = isVerticalOutput ? "min(100%, 315px, 31.5vh)" : "100%";

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

                    const isVerticalSource = isVerticalVideo(currentTimelineItem);
                    const activeShotIndex = playheadShotIndex !== -1 && playheadShotIndex !== undefined ? playheadShotIndex : 0;
                    const activeCameraKeyframe = echoCameraKeyframeAt(activeShowGraph?.directorV2?.cameraKeyframes, currentTime);
                    const cameraPreviewStyle = cameraMotionStyleForShot(currentTimelineItem, currentTime, isVerticalOutput, activeShotIndex, activeCameraKeyframe?.crop);

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
                      if (!isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready) {
                        setAudioDiagnostics("Preview is decoding the current frame and lookahead window...");
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
                      echoPlaybackEngineRef.current?.seek(newTime);
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '210px' }}>
                              <select
                                aria-label="Direction script version"
                                data-testid="echo-direction-version"
                                value={activeDirectionVariantSelection}
                                disabled={loadingProjectDetail || directorEditingLocked}
                                onChange={async (event) => {
                                  if (directorEditingLocked) return;
                                  const nextVariantId = event.target.value;
                                  setCurrentTime(0);
                                  currentTimeRef.current = 0;
                                  if (audioRef.current) audioRef.current.currentTime = 0;
                                  if (nextVariantId === "legacy") {
                                    setWorkingDirectionFork(null);
                                    setSelectedDirectionVariantId("legacy");
                                    return;
                                  }
                                  setEchoOperationNotice(`Loading ${nextVariantId}…`);
                                  const detailResult = await fetchProjectDetail(selectedProjectSongId, nextVariantId, { commit: false, priority: "foreground" });
                                  const detail = detailResult?.detail;
                                  const hydratedVariant = detail?.music_video_project?.direction_script_variants?.find((variant) => (
                                    echoDirectionVariantId(variant) === nextVariantId && Array.isArray(variant.timeline)
                                  ));
                                  if (!hydratedVariant) {
                                    setEchoOperationNotice(`Could not load ${nextVariantId}; the current editable cut remains open.`);
                                    return;
                                  }
                                  try {
                                    const editableSelection = editableDirectionForkFromDetail(detail, nextVariantId);
                                    if (!editableSelection) throw new Error("its certified card graph is still preparing");
                                    if (!commitDirectorProjectDetail(detail, detailResult.requestGeneration)) {
                                      throw new Error("a newer detail refresh superseded this response");
                                    }
                                    setWorkingDirectionFork(editableSelection.workingFork);
                                    setSelectedDirectionVariantId(nextVariantId);
                                    setSaveFeedbackTone("success");
                                    setSaveSuccessMessage("Editable copy opened from the selected cut. Its higher-quality cards and source lineage are preserved; saving creates a new cut.");
                                    setEchoOperationNotice(`${echoDirectionVariantTitle(hydratedVariant)} opened for editing.`);
                                  } catch (error) {
                                    setEchoOperationNotice(`Could not open ${nextVariantId} for editing yet: ${error.message || String(error)}. The current editable cut remains open.`);
                                  }
                                }}
                                style={{
                                  background: '#090d16',
                                  border: directionVariantReadOnly ? '1px solid rgba(16, 185, 129, 0.55)' : '1px solid rgba(255,255,255,0.15)',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  outline: 'none',
                                  fontWeight: 'bold',
                                  cursor: loadingProjectDetail || directorEditingLocked ? 'wait' : 'pointer'
                                }}
                              >
                                <option value="legacy">Legacy baseline</option>
                                {activeDirectionVariantGroups.map((group) => (
                                  <optgroup key={group.id} label={group.label}>
                                    {group.variants.map((variant) => {
                                      const id = echoDirectionVariantId(variant);
                                      return <option key={id} value={id}>{echoDirectionVariantOptionLabel(variant)} · editable copy</option>;
                                    })}
                                  </optgroup>
                                ))}
                              </select>
                              <span style={{ fontSize: '8px', color: directionVariantReadOnly ? '#6ee7b7' : '#94a3b8', textAlign: 'right' }}>
                                {directionWorkingForkActive
                                  ? 'Editable copy · source cut and Legacy stay unchanged · Vertical ready'
                                  : directionVariantReadOnly
                                    ? 'Saved source is protected · any edit starts a new working copy'
                                    : `${activeDirectionVariants.length} saved cut${activeDirectionVariants.length === 1 ? '' : 's'} available · all can be edited`}
                              </span>
                            </div>
                            {directionVariantReadOnly && (
                              <button
                                type="button"
                                data-testid="echo-continue-direction-cut"
                                disabled={directorEditingLocked}
                                onClick={handleContinueFromDirectionCut}
                                style={{ background: 'rgba(157,116,255,.14)', border: '1px solid #9d74ff', color: '#d8c8ff', fontSize: '9px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                Start editable copy
                              </button>
                            )}
                            {directionWorkingForkActive && (
                              <button
                                type="button"
                                data-testid="echo-cancel-direction-cut"
                                disabled={directorEditingLocked}
                                onClick={handleCancelDirectionFork}
                                style={{ background: 'transparent', border: '1px solid #64748b', color: '#cbd5e1', fontSize: '9px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Cancel working cut
                              </button>
                            )}
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '158px', color: '#94a3b8', fontSize: '8px', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              Video orientation
                              <select
                                aria-label="Video orientation"
                                data-testid="echo-output-orientation"
                                value={activeOutputProfile.id}
                                disabled={directorEditingLocked}
                                onChange={(event) => handleUpdateProjectSettings({ output_profile: resolveEchoOutputProfile(event.target.value) })}
                                style={{
                                  background: '#090d16',
                                  border: '1px solid rgba(34, 211, 238, 0.45)',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  outline: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer'
                                }}
                              >
                                {ECHO_OUTPUT_PROFILES.map((profile) => (
                                  <option key={profile.id} value={profile.id}>
                                    {profile.label} · {profile.aspectRatio} · {profile.width}×{profile.height}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <select
                              value={activeProject.lyric_variant || "phrase-window"}
                              disabled={directorEditingLocked}
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
                              disabled={directorEditingLocked}
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
                              disabled={directorEditingLocked}
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
                              data-testid="echo-save-direction-cut"
                              onClick={() => handleSaveProject(activeProject)}
                              disabled={directorEditingLocked || directionVariantReadOnly}
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
                              {savingProject
                                ? `Saving… ${saveElapsedSeconds}s`
                                : directionForkTransitionPending
                                  ? "Opening saved cut…"
                                : directionWorkingForkActive
                                  ? "Save as new cut"
                                  : directionVariantReadOnly
                                    ? "Edit to start a new cut"
                                    : "💾 Save Changes"}
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
                        <div
                          data-testid="echo-director-authoring-split"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(min(560px, 100%), 1fr))',
                            gap: '15px',
                            flexShrink: 0,
                            minWidth: 0
                          }}
                        >
                          
                          {/* Left Panel: Previewer Tab Window */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            
                            {/* Tabs select */}
                            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '3px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                              {['preview', 'tracks', 'variation', 'live', 'palmier', 'script', 'edl', 'journal'].map(tab => (
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
                                  {tab === 'tracks' && '🎚 Tracks'}
                                  {tab === 'variation' && '🧬 Variations'}
                                  {tab === 'live' && '🎭 Live Set'}
                                  {tab === 'palmier' && '✂️ Palmier'}
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

                            {activeWorkbenchTab === "preview" && (() => {
                              const previewSurface = (
                              <div
                                ref={directorPreviewFullscreenRef}
                                role={directorPreviewExpanded ? "dialog" : "region"}
                                aria-modal={directorPreviewExpanded ? "true" : undefined}
                                aria-label="Director Preview playback"
                                data-testid="echo-director-preview-surface"
                                data-expanded={directorPreviewExpanded ? "true" : "false"}
                                data-fullscreen={directorPreviewFullscreen ? "true" : "false"}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '10px',
                                  width: directorPreviewExpanded ? 'auto' : '100%',
                                  minWidth: 0,
                                  ...(directorPreviewExpanded ? {
                                    position: 'fixed',
                                    inset: 0,
                                    zIndex: 2147483000,
                                    height: '100vh',
                                    boxSizing: 'border-box',
                                    padding: '14px 16px 16px',
                                    overflow: 'auto',
                                    overscrollBehavior: 'contain',
                                    background: 'radial-gradient(circle at top, #101b32 0%, #020617 58%)',
                                    border: '1px solid rgba(34, 211, 238, 0.28)',
                                    boxShadow: '0 24px 80px rgba(0,0,0,0.82)',
                                    isolation: 'isolate',
                                    alignItems: 'center',
                                    justifyContent: 'flex-start'
                                  } : {
                                    position: 'relative'
                                  })
                                }}
                              >
                                {directorPreviewExpanded && (
                                  <div
                                    data-testid="echo-director-preview-expanded-header"
                                    style={{
                                      width: directorPreviewWidth,
                                      maxWidth: '100%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: '12px',
                                      flexWrap: 'wrap',
                                      flexShrink: 0,
                                      color: '#dbeafe',
                                      fontFamily: 'monospace'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <strong style={{ color: 'var(--hapa-neon-cyan)', fontSize: '11px', letterSpacing: '0.08em' }}>EXPANDED PREVIEW</strong>
                                      <span style={{ color: '#94a3b8', fontSize: '9px' }}>Complete {activeOutputProfile.aspectRatio} frame · {activeOutputProfile.width}×{activeOutputProfile.height} · playback controls</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <button
                                        type="button"
                                        data-testid="echo-director-preview-fullscreen"
                                        onClick={toggleDirectorPreviewFullscreen}
                                        aria-pressed={directorPreviewFullscreen}
                                        aria-label={directorPreviewFullscreen ? "Exit Director Preview full screen" : "Open Director Preview full screen"}
                                        title={directorPreviewFullscreen ? "Exit native Full Screen (Escape also works)" : "Use native Full Screen"}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '5px',
                                          flexShrink: 0,
                                          padding: '6px 10px',
                                          borderRadius: '4px',
                                          border: '1px solid rgba(34, 211, 238, 0.55)',
                                          background: directorPreviewFullscreen ? 'rgba(34, 211, 238, 0.18)' : 'rgba(34, 211, 238, 0.08)',
                                          color: 'var(--hapa-neon-cyan)',
                                          fontSize: '9px',
                                          fontWeight: 'bold',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        {directorPreviewFullscreen ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
                                        {directorPreviewFullscreen ? "Exit Full Screen" : "Full Screen"}
                                      </button>
                                      <button
                                        type="button"
                                        data-testid="echo-director-preview-close-expanded"
                                        onClick={() => { void closeDirectorPreviewExpanded(); }}
                                        aria-label="Close expanded Director Preview"
                                        title="Return to compact Preview (Escape)"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '5px',
                                          flexShrink: 0,
                                          padding: '6px 10px',
                                          borderRadius: '4px',
                                          border: '1px solid rgba(255,255,255,0.25)',
                                          background: 'rgba(255,255,255,0.07)',
                                          color: '#f8fafc',
                                          fontSize: '9px',
                                          fontWeight: 'bold',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <Minimize2 size={13} aria-hidden="true" />
                                        Compact View
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {/* Composition Preview Screen */}
                                <div
                                  className="media-preview-container"
                                  data-testid="echo-director-preview-frame"
                                  data-export-aspect={`${activeOutputProfile.width}x${activeOutputProfile.height}`}
                                  data-output-profile={activeOutputProfile.id}
                                  style={{ position: 'relative', width: directorPreviewExpanded ? directorPreviewWidth : compactPreviewWidth, height: 'auto', boxSizing: 'border-box', alignSelf: directorPreviewExpanded || isVerticalOutput ? 'center' : 'stretch', aspectRatio: `${activeOutputProfile.width} / ${activeOutputProfile.height}`, minHeight: directorPreviewExpanded || isVerticalOutput ? 0 : '280px', maxWidth: '100%', maxHeight: directorPreviewExpanded ? ECHO_EXPANDED_PREVIEW_MAX_HEIGHT : 'min(56vh, 560px)', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#020617', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  
                                  {currentTimelineItem && shotMediaType(currentTimelineItem) === "video" && (
                                    <PersistentEchoABPlayers
                                      shot={currentTimelineItem}
                                      lookaheadShots={lookaheadTimelineItems}
                                      playing={isPlaying}
                                      songTime={currentTime}
                                      onBufferState={setPreviewBufferState}
                                      onPresentedMediaChange={handlePresentedMediaChange}
                                      clockRef={currentTimeRef}
                                      vertical={isVerticalSource}
                                      shotIndex={activeShotIndex}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        transform: cameraPreviewStyle.transform,
                                        transformOrigin: cameraPreviewStyle.transformOrigin,
                                        objectPosition: cameraPreviewStyle.objectPosition,
                                        transition: 'transform 0.045s linear, object-position 0.045s linear',
                                        willChange: 'transform, object-position',
                                        opacity: 1
                                      }}
                                    />
                                  )}
                                  {currentTimelineItem && shotMediaType(currentTimelineItem) === "image" && (
                                    <PresentedEchoImage
                                      key={`${currentTimelineItem.media_id}-${currentTimelineItem.start_sec}`}
                                      shot={currentTimelineItem}
                                      onPresentedMediaChange={handlePresentedMediaChange}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        transform: cameraPreviewStyle.transform,
                                        transformOrigin: cameraPreviewStyle.transformOrigin,
                                        objectPosition: cameraPreviewStyle.objectPosition,
                                        opacity: 1
                                      }}
                                    />
                                  )}

                                  <canvas 
                                    ref={canvasRef}
                                    id="director-preview-canvas"
                                    width={isVerticalOutput ? 360 : 640}
                                    height={isVerticalOutput ? 640 : 360}
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
                                  <div style={{ position: 'absolute', top: `${Math.round(activeOutputProfile.safeArea.actionInset * 100)}%`, left: `${Math.round(activeOutputProfile.safeArea.actionInset * 100)}%`, right: isVerticalOutput ? `${Math.round(activeOutputProfile.safeArea.actionInset * 100)}%` : 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap', pointerEvents: 'none', zIndex: 5 }}>
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
                                    {exactIsfBindingDiagnostics.rendererTruth && (() => {
                                      const truth = exactIsfBindingDiagnostics.rendererTruth;
                                      const tone = rendererTruthColor(truth.status);
                                      return (
                                        <span
                                          data-echo-renderer-truth={truth.status}
                                          data-echo-renderer-requested-id={truth.requested?.id || ""}
                                          data-echo-renderer-substitute-id={truth.substitute?.id || ""}
                                          data-echo-renderer-reason={truth.reason || ""}
                                          data-echo-renderer-silent-default={truth.silentDefault === true ? "true" : "false"}
                                          title={JSON.stringify(truth)}
                                          style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', borderRadius: '3px', color: tone.color, background: tone.background, border: `1px solid ${tone.border}` }}
                                        >
                                          RENDER {String(truth.status).toUpperCase()} · {truth.requested?.id || "MISSING ID"}{truth.substitute?.id ? ` → ${truth.substitute.id}` : ""}
                                        </span>
                                      );
                                    })()}
                                    {activeShowGraph && (
                                      <span
                                        data-echo-exact-isf-status={exactIsfStatus.status}
                                        title={exactIsfStatus.error || exactIsfStatus.sourceId}
                                        style={{
                                          fontSize: '8px',
                                          fontWeight: 'bold',
                                          padding: '2.5px 6px',
                                          background: exactIsfStatusIsFailure(exactIsfStatus.status) ? 'rgba(239,68,68,0.24)' : 'rgba(34,211,238,0.16)',
                                          borderRadius: '3px',
                                          color: exactIsfStatusIsFailure(exactIsfStatus.status) ? '#fecaca' : '#cffafe',
                                          border: exactIsfStatusIsFailure(exactIsfStatus.status) ? '1px solid rgba(248,113,113,0.55)' : '1px solid rgba(34,211,238,0.38)'
                                        }}
                                      >
                                        ISF {exactIsfStatus.status === "ready" ? "EXACT" : exactIsfStatus.status.toUpperCase()}
                                      </span>
                                    )}
                                    {activeShowGraph && exactIsfBindingDiagnostics.playbackPool && (
                                      <span
                                        data-echo-isf-handoff={exactIsfBindingDiagnostics.playbackPool.handoffStatus || "idle"}
                                        data-echo-isf-current-shader={exactIsfBindingDiagnostics.playbackPool.currentShaderId || ""}
                                        data-echo-isf-requested-shader={exactIsfBindingDiagnostics.playbackPool.requestedShaderId || ""}
                                        data-echo-isf-prewarm-ready={exactIsfBindingDiagnostics.playbackPool.prewarmReadiness?.ready || 0}
                                        data-echo-isf-contexts={exactIsfBindingDiagnostics.playbackPool.contextCount || 0}
                                        data-echo-isf-programs={exactIsfBindingDiagnostics.playbackPool.programCount || 0}
                                        data-echo-isf-source-cache={JSON.stringify(exactIsfBindingDiagnostics.playbackPool.sourceCache || {})}
                                        data-echo-isf-black-intervals={exactIsfBindingDiagnostics.playbackPool.blackIntervals || 0}
                                        data-echo-isf-frame-ms={Number(exactIsfBindingDiagnostics.playbackPool.frameTiming?.lastMs || 0).toFixed(2)}
                                        title={JSON.stringify(exactIsfBindingDiagnostics.playbackPool)}
                                        style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: exactIsfBindingDiagnostics.playbackPool.blackIntervals > 0 ? 'rgba(239,68,68,0.24)' : 'rgba(16,185,129,0.15)', borderRadius: '3px', color: exactIsfBindingDiagnostics.playbackPool.blackIntervals > 0 ? '#fecaca' : '#bbf7d0', border: '1px solid rgba(255,255,255,0.18)' }}
                                      >
                                        POOL {String(exactIsfBindingDiagnostics.playbackPool.handoffStatus || "IDLE").toUpperCase()} · WARM {exactIsfBindingDiagnostics.playbackPool.prewarmReadiness?.ready || 0}/{exactIsfBindingDiagnostics.playbackPool.prewarmReadiness?.requested || 0} · GL {exactIsfBindingDiagnostics.playbackPool.contextCount || 0}/{exactIsfBindingDiagnostics.playbackPool.programCount || 0} · BLACK {exactIsfBindingDiagnostics.playbackPool.blackIntervals || 0} · {Number(exactIsfBindingDiagnostics.playbackPool.frameTiming?.lastMs || 0).toFixed(1)}MS
                                      </span>
                                    )}
                                    {activeShowGraph && (
                                      <span
                                        data-echo-isf-media-binding={exactIsfBindingDiagnostics.media?.status || "unavailable"}
                                        title={JSON.stringify(exactIsfBindingDiagnostics.media || {})}
                                        style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: exactIsfBindingDiagnostics.media?.status === 'presented' ? 'rgba(16,185,129,0.16)' : 'rgba(246,201,109,0.15)', borderRadius: '3px', color: exactIsfBindingDiagnostics.media?.status === 'presented' ? '#bbf7d0' : '#fde68a', border: '1px solid rgba(255,255,255,0.18)' }}
                                      >
                                        MEDIA {exactIsfBindingDiagnostics.media?.status === "presented" ? String(exactIsfBindingDiagnostics.media?.kind || "LIVE").toUpperCase() : "NONE"}
                                      </span>
                                    )}
                                    {activeShowGraph && (
                                      <span
                                        data-echo-isf-stem-binding={exactIsfBindingDiagnostics.stem?.status || "master"}
                                        title={JSON.stringify(exactIsfBindingDiagnostics.stem || {})}
                                        style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: exactIsfBindingDiagnostics.stem?.status === 'ready' ? 'rgba(168,85,247,0.18)' : 'rgba(71,85,105,0.36)', borderRadius: '3px', color: exactIsfBindingDiagnostics.stem?.status === 'ready' ? '#e9d5ff' : '#cbd5e1', border: '1px solid rgba(255,255,255,0.18)' }}
                                      >
                                        STEM {String(exactIsfBindingDiagnostics.stem?.resolvedStem || "MASTER").toUpperCase()}
                                      </span>
                                    )}
                                    {activeShowGraph && (
                                      <span
                                        data-echo-isf-frame-receipt={exactIsfBindingDiagnostics.frameReceipt?.receiptHash || "pending"}
                                        title={JSON.stringify(exactIsfBindingDiagnostics.frameReceipt || {})}
                                        style={{ fontSize: '8px', fontWeight: 'bold', padding: '2.5px 6px', background: 'rgba(6,182,212,0.12)', borderRadius: '3px', color: '#a5f3fc', border: '1px solid rgba(34,211,238,0.3)' }}
                                      >
                                        FRAME {exactIsfBindingDiagnostics.frameReceipt?.receiptHash ? String(exactIsfBindingDiagnostics.frameReceipt.receiptHash).slice(-8).toUpperCase() : "WAIT"}
                                      </span>
                                    )}
                                  </div>

                                  {/* Timed Lyrics Overlay */}
                                  {currentLine && (() => {
                                    const activeVariant = activeProject.lyric_variant || "phrase-window";
                                    const lyricPlacement = getLyricPlacementStyle(activeProject.lyric_position || "bottom-center", activeOutputProfile);
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
                                <div data-testid="echo-director-preview-controls" style={{ display: 'flex', gap: '12px', rowGap: '8px', alignItems: 'center', alignSelf: directorPreviewExpanded ? 'center' : 'stretch', width: directorPreviewExpanded ? directorPreviewWidth : 'auto', maxWidth: '100%', flexWrap: 'wrap', flexShrink: 0, boxSizing: 'border-box', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                  <button 
                                    type="button"
                                    onClick={handlePlayPause}
                                    disabled={audioLoading || (!isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready)}
                                    style={{
                                      background: audioLoading || (!isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready) ? 'rgba(255, 255, 255, 0.05)' : (isPlaying ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
                                      border: audioLoading || (!isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready) ? '1px solid rgba(255, 255, 255, 0.1)' : (isPlaying ? '1px solid var(--hapa-neon-red)' : '1px solid var(--hapa-neon-green)'),
                                      color: audioLoading || (!isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready) ? '#888' : (isPlaying ? 'var(--hapa-neon-red)' : 'var(--hapa-neon-green)'),
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
                                    {audioLoading ? "⏳ Audio..." : (!isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready ? "⏳ Buffering video..." : (isPlaying ? "⏸ Pause" : "▶ Play Show"))}
                                  </button>
                                  <span style={{ fontFamily: 'monospace', fontSize: '9px', color: previewBufferState.status === 'fallback' ? 'var(--hapa-neon-gold)' : 'var(--hapa-neon-cyan)', flexShrink: 0 }}>
                                    {previewBufferState.status.toUpperCase()} · {previewBufferState.readyLookahead || 0}/{previewBufferState.targetLookahead || 0} AHEAD
                                  </span>
                                  {pendingPreviewProxyCount > 0 && (
                                    <button type="button" onClick={prepareSmoothPreview} disabled={["queued", "running"].includes(previewPreparation.status)} style={{ background: 'rgba(168,85,247,.16)', border: '1px solid var(--hapa-neon-violet)', color: 'var(--hapa-neon-violet)', padding: '5px 9px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', cursor: ["queued", "running"].includes(previewPreparation.status) ? 'wait' : 'pointer', flexShrink: 0 }}>
                                      {previewPreparation.status === "queued" ? `QUEUED ${pendingPreviewProxyCount} PROXIES…` : previewPreparation.status === "running" ? `COMPILING ${pendingPreviewProxyCount} PROXIES…` : `COMPILE SMOOTH PREVIEW (${pendingPreviewProxyCount})`}
                                    </button>
                                  )}
                                  
                                  <input 
                                    type="range" 
                                    min="0" 
                                    max={activeProject.duration} 
                                    step="0.1" 
                                    value={currentTime} 
                                    onChange={handleScrub} 
                                    style={{ flex: directorPreviewExpanded ? '1 1 260px' : 1, minWidth: directorPreviewExpanded ? '180px' : 0, height: '4px', accentColor: 'var(--hapa-neon-cyan)', cursor: 'pointer' }}
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

                                  {!directorPreviewExpanded && (
                                    <button
                                      type="button"
                                      data-testid="echo-director-preview-expand"
                                      onClick={toggleDirectorPreviewExpanded}
                                      aria-expanded={directorPreviewExpanded}
                                      aria-label="Open larger Director Preview"
                                      title="Expand Preview inside the app"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '5px',
                                        flexShrink: 0,
                                        padding: '5px 9px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(34, 211, 238, 0.65)',
                                        background: 'rgba(34, 211, 238, 0.08)',
                                        color: 'var(--hapa-neon-cyan)',
                                        fontSize: '9px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <Maximize2 size={13} aria-hidden="true" />
                                      Expand Preview
                                    </button>
                                  )}
                                </div>

                                {directorPreviewExpanded && directorPreviewFullscreenMessage && (
                                  <div
                                    role="status"
                                    aria-live="polite"
                                    data-testid="echo-director-preview-fullscreen-status"
                                    style={{
                                      alignSelf: 'center',
                                      width: directorPreviewWidth,
                                      maxWidth: '100%',
                                      color: directorPreviewFullscreenMessage.includes("not ") || directorPreviewFullscreenMessage.includes("could not") || directorPreviewFullscreenMessage.includes("blocked") ? 'var(--hapa-neon-gold)' : 'var(--hapa-neon-cyan)',
                                      fontFamily: 'monospace',
                                      fontSize: '9px',
                                      textAlign: 'right'
                                    }}
                                  >
                                    {directorPreviewFullscreenMessage}
                                  </div>
                                )}

                                {/* Keep authoring diagnostics below the compact Preview; the large view reserves space for the complete frame and transport. */}
                                {!directorPreviewExpanded && (
                                  <div style={{ fontSize: '8px', fontFamily: 'monospace', color: 'rgba(255, 255, 255, 0.4)', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--hapa-neon-gold)', fontWeight: 'bold' }}>AUDIO TELEMETRY:</span>
                                    <span style={{ color: audioDiagnostics.includes("Error") || audioDiagnostics.includes("failed") ? 'var(--hapa-neon-red)' : 'var(--hapa-neon-cyan)' }}>{audioDiagnostics}</span>
                                  </div>
                                )}

                                {/* Current Playback Shot Detail Card */}
                                {currentTimelineItem && !directorPreviewExpanded && (
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
                              );
                              return directorPreviewExpanded && globalThis.document?.body
                                ? createPortal(previewSurface, globalThis.document.body)
                                : previewSurface;
                            })()}

                            {activeWorkbenchTab === "script" && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '9px', opacity: 0.7 }}>
                                    {directionWorkingForkActive
                                      ? `Editable working cut from ${echoDirectionVariantTitle(activeDirectionVariant)}. Saving creates a new append-only cut.`
                                      : directionVariantReadOnly
                                        ? `Append-only HyperFrames variant: ${echoDirectionVariantTitle(activeDirectionVariant)}. Legacy script remains unchanged.`
                                        : 'Legacy current HyperFrames HTML video composition script.'}
                                  </span>
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

                            {activeWorkbenchTab === "variation" && (
                              <>
                                <VariationLabPanel
                                  project={activeProject}
                                  onPromote={(patch) => handleUpdateProjectSettings({
                                    variation_lab_promotion: patch,
                                    director_patch_lineage: {
                                      ...(activeProject.director_patch_lineage || {}),
                                      parentTreatmentId: patch.parentTreatmentId,
                                      parentCueGraphId: patch.parentCueGraphId,
                                      promotedPatchHash: patch.patchHash,
                                      nonDestructive: true
                                    }
                                  })}
                                />
                                <TasteMemoryPanel memory={activeProject.human_taste_memory} onChange={(memory) => handleUpdateProjectSettings({ human_taste_memory: memory })} />
                              </>
                            )}

                            {activeWorkbenchTab === "tracks" && (
                              <>
                                <MultitrackDirectorEditor
                                  project={activeProject}
                                  showGraph={activeShowGraph}
                                  onPatch={(patch) => handleUpdateProjectSettings({
                                    director_show_graph_patches: [...(activeProject.director_show_graph_patches || []), patch],
                                    director_patch_lineage: {
                                      ...(activeProject.director_patch_lineage || {}),
                                      lastDirtyRange: patch.dirtyRange,
                                      patchCount: Number(activeProject.director_patch_lineage?.patchCount || 0) + 1
                                    }
                                  })}
                                />
                                <div style={{ marginTop: 8 }}>
                                  <SongCardMintPanel
                                    compact
                                    songId={echoProjectAudioRoute(activeProject).id}
                                    project={activeProject}
                                    showGraph={activeShowGraph}
                                    planningRevision={songCardPlanRevisionBySong[activeProject.song_id] || ""}
                                  />
                                </div>
                              </>
                            )}

                            {activeWorkbenchTab === "palmier" && (
                              <PalmierRoundTripPanel project={activeProject} />
                            )}

                            {activeWorkbenchTab === "live" && (
                              <AlbumLiveSetPanel liveSet={activeProject.album_live_set || { schemaVersion: "hapa.showcase.album-live-set.v1", setHash: "not-loaded", entries: [], modes: { audience: { diagnostics: false }, operator: { diagnostics: true } } }} />
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
                                  <ShotDecisionInspectorPanel
                                    shot={activeTimelineItem}
                                    onReview={(review) => {
                                      const result = appendShotPreferenceEvent(activeProject.shot_preference_events || [], { ...review, operator: "local-human" });
                                      const tasteMemory = appendTasteEvidence(activeProject.human_taste_memory?.schemaVersion ? activeProject.human_taste_memory : createTasteMemory(), { scope: "shot", scopeId: review.inspector.shotId, actionEventId: result.event.id, action: review.action, operator: "local-human", feature: `media:${review.targetMediaId || review.inspector.selectedMedia.id}`, targetId: review.targetMediaId || review.inspector.selectedMedia.id, recordedAt: result.event.recordedAt });
                                      handleUpdateProjectSettings({ shot_preference_events: result.events, last_shot_preference_event: result.event, human_taste_memory: tasteMemory });
                                    }}
                                  />
                                  
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
                                                {echoMediaSourceLabel(video)} | {video.flowType || "untyped"} | {video.duration !== null ? `${Number(video.duration).toFixed(1)}s` : "loop"}
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
                                    <label style={{ fontWeight: 'bold', color: '#ccc' }}>{activeUsesAudioFallback ? 'Audio fallback profile:' : 'Active Audio Stems:'}</label>
                                    {activeUsesAudioFallback ? (
                                      <div data-testid="echo-audio-fallback-upgrade" style={{ padding: '7px 8px', border: '1px solid rgba(246,201,109,0.38)', background: 'rgba(246,201,109,0.08)', color: '#f8e2a7', fontSize: '9px', lineHeight: 1.45 }}>
                                        <strong>No isolated stems claimed.</strong> This cut uses deterministic master-mix/section-energy, lyric-density, and manual-cue controls only.
                                        <div style={{ marginTop: '4px', color: '#cbd5e1' }}>Upgrade: attach registry-linked stems or stronger timing, run offline telemetry, then recompile. Media locks and manual cues stay intact.</div>
                                      </div>
                                    ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                      {activeIsolatedStems.map(stem => {
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
                                    )}
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
                                      placeholder="Search shader name, id, type, manifest category..."
                                      style={{ background: '#050b14', border: '1px solid rgba(16,185,129,0.35)', color: '#fff', padding: '9px 10px', borderRadius: '4px', fontSize: '12px', width: '100%', outline: 'none', minHeight: '36px' }}
                                    />
                                    <select
                                      aria-label="Shader manifest category"
                                      value={shaderCategoryFilter}
                                      onChange={(event) => setShaderCategoryFilter(event.target.value)}
                                      style={{ background: '#050b14', border: '1px solid rgba(34,211,238,0.3)', color: '#e2e8f0', padding: '8px 10px', borderRadius: '4px', fontSize: '11px', width: '100%', outline: 'none' }}
                                    >
                                      <option value="all">All manifest categories</option>
                                      {shaderPickerCategories.map((category) => (
                                        <option key={category} value={category}>{category}</option>
                                      ))}
                                    </select>
                                    <EchoShaderSourcePreview
                                      shader={availableShaders.find((shader) => shader.id === activeVisualizerItem.visualizer_id) || null}
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
                                        const categories = shader.categories || [];
                                        const statusLabel = selected
                                          ? shader.manifestEligible ? "LIVE SOURCE PREVIEW" : "LEGACY APPROXIMATION"
                                          : shader.manifestEligible ? "HASHED SOURCE" : "LEGACY APPROXIMATION";
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
                                            <span style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
                                              <span data-echo-shader-readiness={shader.readiness} style={{ color: shader.manifestEligible ? '#86efac' : '#fde68a', fontSize: '8.5px', fontWeight: 'bold' }}>{statusLabel}</span>
                                              {categories.map((category) => (
                                                <span key={category} style={{ color: '#bae6fd', border: '1px solid rgba(56,189,248,.26)', borderRadius: '3px', padding: '1px 4px', fontSize: '8px' }}>{category}</span>
                                              ))}
                                            </span>
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
                                      Showing all {filteredShaderOptions.length} matching entries · {availableShaders.filter((shader) => echoShaderPickerEntry(shader).manifestEligible).length} exact manifest shaders available · no result cap.
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
                              const graphCard = activeShowGraph
                                ? visualizerLookaheadCards(activeShowGraph, Number(vis.start_sec || 0) + 0.0001, 1)[0] || null
                                : null;
                              const truthBundle = graphCard
                                ? exactEchoRendererTruth(graphCard, { status: "declared" }, "echo-avatar-builder")
                                : legacyEchoRendererTruth(vis, "echo-avatar-builder");
                              const rendererTruth = truthBundle?.truth || null;
                              const rendererTone = rendererTruthColor(rendererTruth?.status || "unsupported");
                              
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
                                  data-echo-timeline-renderer-truth={rendererTruth?.status || (hasShader ? "unsupported" : "pass-through")}
                                  data-echo-timeline-requested-id={rendererTruth?.requested?.id || vis.visualizer_id || ""}
                                  data-echo-timeline-substitute-id={rendererTruth?.substitute?.id || ""}
                                  title={rendererTruth
                                    ? JSON.stringify(rendererTruth)
                                    : `Shader ${idx+1} [${vis.start_sec}s - ${vis.end_sec}s]: Pass-through`}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5px', fontWeight: 'bold', color: isSelected ? 'var(--hapa-neon-green)' : '#aaa', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    <span>V{idx+1}</span>
                                    <span>{(vis.end_sec - vis.start_sec).toFixed(1)}s</span>
                                  </div>
                                  <div style={{ fontSize: '7px', opacity: 0.8, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '1px', color: hasShader ? 'var(--hapa-neon-gold)' : '#666' }}>
                                    {hasShader ? `🎛️ ${vis.visualizer_title}` : `❌ Pass-through`}
                                  </div>
                                  {rendererTruth && (
                                    <div style={{ fontSize: '6px', fontWeight: 'bold', color: rendererTone.color, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                      {rendererTruth.status.toUpperCase()}{rendererTruth.substitute?.id ? ` → ${rendererTruth.substitute.id}` : ""}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    );
                  }}
                  </EchoPlaybackClockBoundary>
                </div>

              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default HapaEchosView;
