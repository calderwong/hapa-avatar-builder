import {createLivingLightRecordVisit,loadLivingLightRecordDestination} from '../domain/living-light-record-visit.js';
import { compareEchoSongs } from '../domain/echo-album-navigation.js';
import {livingLightCutMedia} from "../domain/living-light-media.js";
import SongAudioUpload from './SongAudioUpload.jsx';
import { matchesFileFilter } from '../domain/audio-atlas-ui.js';
import SongAudioAvailability, { useSongAudioInventory } from "./SongAudioAvailability.jsx";
import AudioAtlasPanel from "./AudioAtlasPanel.jsx";
import { createEchoScoreDustRenderer } from "./echo-score-dust-renderer.js";
import { useEchoScoreDust } from "./useEchoScoreDust.js";
import EchoScoreDustPanel from "./EchoScoreDustPanel.jsx";
import { echoTimelineMediaInstances, hyperFramesMediaOpacityState } from "../domain/echo-media-presentation.js";
import { prepareEchoAudioPlayback } from '../domain/echo-audio-playback.js';
import { transitionLivingLightAudition } from '../domain/living-light-audition.js';
import { createEchoEmptyShaderMedia } from "../domain/echo-empty-shader-media.js";
import { createEchoIsfHistoryMedia } from "../domain/echo-isf-history-media.js";
import { createImageShotGeometry, selectImageShotRendition } from "../domain/unified-media-catalog.js";
import EchoLyricOverlay from "./EchoLyricOverlay.jsx";
import { paintEchoLyricSurfaceToCanvas } from "../domain/echo-lyric-presentation.js";
import { EchoAccentPresentation } from "../domain/echo-accent-presentation.js";
import { visualTimeFor, echoPreparedPerformanceSignalFrames, evaluateEchoMusicPerformance, echoVisualSignalIsolation, isolateEchoPreparedModulation } from "../domain/hyperframes-visualizer-runtime.js";
import { prepareDirectorModulationTimeline } from "../domain/director-modulation-v2.js";
import EchoPerformancePreparationControl from "./EchoPerformancePreparationControl.jsx";
import EchoPreviewPreparationControl from "./EchoPreviewPreparationControl.jsx";
import { createEchoProxySourcePrefetch } from "../domain/echo-proxy-frame-decoder.js";
import { createEchoPreviewProxySchedule, applyEchoPreviewProjection, echoPreviewHistoryMediaCue, ECHO_PREVIEW_QUALITY_PRESETS, normalizeEchoPreviewQuality, echoPreviewShaderSize, echoPreviewShaderLayers } from "../domain/echo-preview-projection.js";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
const EchoLivingLightPreview = lazy(() => import("./EchoLivingLightPreview.jsx"));
const LivingLightWorkspace = lazy(() => import("./LivingLightWorkspace.jsx"));
import { createPortal } from "react-dom";
import { createEchoPanelLoader } from "../domain/echo-panel-loader.js";
import {
  Clapperboard,
  Download,
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
import { echoProjectAudioRoute, echoLocalMediaApiBase } from "../domain/echo-audio-route.js";
import {
  echoSourceWindowAtEnd,
  echoSourceWindowPlaybackRate,
  mapEchoSourceWindowTime,
  normalizeEchoTransitionTimeMapping,
  echoDecodedPlaybackPhase,
  planEchoPlaybackCorrection,
} from "../domain/echo-playback-sync.js";
import {
  echoVisualizerLayerPresentation,
  echoVisualizerRecipeMix,
  normalizeEchoStemFocus,
  resolveVerifiedEchoStemBinding,
} from "../domain/echo-visualizer-audio-envelope.js";
import { createEchoPlaybackEngine } from "../domain/echo-playback-engine.js";
import { ECHO_PREVIEW_PLAYER_POOL_LIMIT as ECHO_PLAYER_POOL_LIMIT, reconcileEchoPlayerSlots } from "../domain/echo-player-pool.js";
import { createEchoPresentationTimingRecorder, observeEchoPresentedFrames, estimateEchoAudibleClock, createEchoCompositeCadence } from "../domain/echo-presentation-timing.js";
import {
  createEchoIsfSurface,
  ECHO_SHADER_POOL_LIMIT,
  createEchoIsfPlaybackPool,
  visualizerCardsAtTime,
  visualizerLookaheadCards,
} from "../domain/echo-isf-browser-runtime.js";
import { echoIsfRequiredStemFocuses, planEchoIsfLayerComposite } from "../domain/echo-isf-frame-intent.js";
import {
  createEchoLiveSignalTracker,
  echoStemDecoderRetryDue,
  evaluateEchoStemTransportHealth,
  nextEchoStemDecoderRetryState,
  sampleEchoLiveSignalFrame,
} from "../domain/echo-live-signal-transport.js";
import {
  buildEchoShaderSelectionUpdate,
  buildEchoShaderPickerPreviewCard,
  echoLegacyCanvasApproximation,
  echoShaderPickerCategories,
  echoShaderPickerEntry,
  filterEchoShaderPickerShaders,
  formatEchoShaderPreviewError,
} from "../domain/echo-shader-picker.js";
import {
  buildVisualizerRendererTruthReceipt,
  resolveVisualizerRendererTruth,
} from "../domain/visualizer-renderer-capability.js";
import VariationLabPanel from "./VariationLabPanel.jsx";
import MultitrackDirectorEditor from "./MultitrackDirectorEditor.jsx";
import SongCardMintPanel from "./SongCardMintPanel.jsx";
import EchoLyricTimingEditor from "./EchoLyricTimingEditor.jsx";
import PalmierRoundTripPanel from "./PalmierRoundTripPanel.jsx";
import ShotDecisionInspectorPanel from "./ShotDecisionInspectorPanel.jsx";
import { buildShotPreferencePatch } from "../domain/shot-decision-inspector.js";
import TasteMemoryPanel from "./TasteMemoryPanel.jsx";
import AlbumLiveSetPanel from "./AlbumLiveSetPanel.jsx";
import EchoReferenceExplorer from "./EchoReferenceExplorer.jsx";
import { generateEchoHyperframeScript } from "../domain/echo-hyperframe-script.js";
import {
  ECHO_OUTPUT_PROFILES,
  attachEchoOutputProfile,
  resolveEchoOutputProfile,
} from "../domain/echo-output-profile.js";
import {
  echoCameraCoverSourceRect,
  echoProtectedCameraFrame,
  echoCameraKeyframeAt,
  echoCameraMotionPresentation,
} from "../domain/echo-camera-framing.js";
import {
  echoDirectorPreviewMediaTransitionState,
  projectEchoDirectorPreviewFrame,
  projectEchoDirectorPreviewMediaFrame,
  selectEchoDirectorPreviewSource,
} from "../domain/echo-director-preview-runtime.js";
import { selectLatestEchoDirectionScriptVariant } from "../domain/echo-record-garden.js";
import { projectToEditorGraph } from "../domain/multitrack-editor.js";
import { isPortableVisualizerAttachment } from "../domain/portable-visualizer-card.js";
import {
  beginEchoSongCardPlanWait,
  buildEchoDirectionForkRequest,
  createEchoDirectionWorkingFork,
  deriveEchoDirectionVariantProject,
  deriveEchoSavedDirectionPlanningProject,
  deriveEchoDirectionWorkingProject,
  echoDirectionVariantId,
  echoDirectionVariantOptionLabel,
  echoDirectionVariantTitle,
  groupEchoDirectionVariants,
  pinEchoSongCardPlanSnapshot,
  restoreEchoSongCardPlanSnapshot,
} from "../domain/echo-direction-variants.js";
import {
  retainEchoProjectDetails,
  retainEchoSongCardPlans,
  filterEchoDirectorProjectRows,
  inspectEchoDirectorProjectDetail,
} from "../domain/echo-album-navigation.js";
import {
  ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
  normalizeEchoPersistentShaderSlots,
} from "../domain/echo-persistent-shader-slots.js";
import {
  ECHO_LYRIC_FONT_OPTIONS,
  ECHO_LYRIC_TEMPLATES,
  attachEchoLyricContract,
  echoLyricTemplate,
  normalizeEchoLyricContract,
} from "../domain/echo-lyric-contract.js";
import EchoKanbanBoard from "./EchoKanbanBoard.jsx";
import EchoSongIngestPipeline from "./EchoSongIngestPipeline.jsx";
import {
  ECHO_PREVIEW_RECORD_FPS,
  ECHO_PREVIEW_RECORD_MAX_DURATION_MS,
  ECHO_PREVIEW_RECORD_TIMESLICE_MS,
  ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE,
  ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE,
  createEchoPreviewRecordingSession,
  createEchoPreviewSignalCapture,
  createEchoPreviewSignalReplay,
  echoPreviewRecordingQualityLabel,
  ensureEchoPreviewRecordingLocalSession,
  formatEchoPreviewRecordingElapsed,
  echoPreviewRecordingFileName,
  pickEchoPreviewRecordingMimeType,
} from "../domain/echo-preview-recording.js";

const electronApiBase = globalThis.window?.hapaAvatarBuilder?.apiBase;
const API_BASE = electronApiBase || (globalThis.location?.port === "5178" ? "http://127.0.0.1:8787" : "");
const songRegistryApiBase = globalThis.window?.hapaAvatarBuilder?.songRegistryApiBase;
const SONG_REGISTRY_API_BASE = songRegistryApiBase || "http://127.0.0.1:8798";

function echoDirectorPreviewNoise(seed = 0, index = 0) {
  let value = (Number(seed) >>> 0) ^ Math.imul(Number(index) + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 0x100000000;
}
const ECHO_SAVE_TIMEOUT_MS = 30_000;
const ECHO_PROJECT_DETAIL_TIMEOUT_MS = 15_000;
const ECHO_PROJECT_GRAPH_WARMUP_TIMEOUT_MS = 10 * 60_000;
const ECHO_EXPANDED_PREVIEW_WIDTH = "min(calc(100vw - 32px), calc(177.7778vh - 384px))";
const ECHO_VERTICAL_EXPANDED_PREVIEW_WIDTH = "min(calc(100vw - 32px), calc(56.25vh - 121.5px))";
const ECHO_STEM_DECODER_POOL_LIMIT = 6;
const EMPTY_ECHO_CAMERA_KEYFRAMES = Object.freeze([]);

function directorPreviewIsFullscreen(documentRef, previewSurface) {
  const fullscreenElement = documentRef?.fullscreenElement || documentRef?.webkitFullscreenElement || null;
  return Boolean(fullscreenElement && previewSurface && fullscreenElement === previewSurface);
}

async function saveEchoProjectRequest(url, options = {}, recovery = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ECHO_SAVE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    const outcomeUnknown = recovery.outcomeUnknown === true || recovery.editableCut === true;
    if (outcomeUnknown) {
      const unknownError = new Error(recovery.editableCut === true
        ? `${timedOut ? "Save acknowledgment timed out after 30 seconds" : "The save connection ended before acknowledgment"}. The outcome is unknown. Keep this page open and use Check save outcome; the editor will stay locked to the same request ID so it cannot create a duplicate cut.`
        : `${timedOut ? "Save acknowledgment timed out after 30 seconds" : "The save connection ended before acknowledgment"}. The outcome is unknown. Keep this edit open and use Check Legacy save before making more changes or retrying.`);
      unknownError.code = "echo_save_outcome_unknown";
      unknownError.cause = error;
      throw unknownError;
    }
    if (timedOut || error?.name === "AbortError") {
      const timeoutError = new Error("The Builder request timed out after 30 seconds. Retry when the service is available.");
      timeoutError.code = "echo_save_timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function warmEchoProjectGraphsRequest(url, songId, variantId = "") {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ECHO_PROJECT_GRAPH_WARMUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        songId,
        ...(variantId && variantId !== "legacy" ? { variantId } : {}),
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `preview preparation failed (${response.status})`);
    }
    return payload;
  } catch (error) {
    if (timedOut || error?.name === "AbortError") {
      throw new Error("Preview preparation timed out. The service may still finish it in the background; try this cut again shortly.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function resolveMediaUri(uri) {
  if (typeof uri !== "string" || !uri) return uri;
  if (/^(data:|blob:|https?:)/.test(uri)) return uri;
  const base = echoLocalMediaApiBase(API_BASE, globalThis.location);
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
    const base = echoLocalMediaApiBase(API_BASE, globalThis.location);
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

function echoPresentedShotKey(targetShot) {
  const contract = targetShot?.media_contract || targetShot?.mediaContract || {};
  return JSON.stringify([
    targetShot?.media_id || "none",
    resolveMediaUri(shotRuntimeUri(targetShot)),
    Number(targetShot?.start_sec ?? targetShot?.startSeconds) || 0,
    Number(targetShot?.end_sec ?? targetShot?.endSeconds) || 0,
    Number(contract.sourceInSeconds ?? contract.source_in_seconds) || 0,
    Number(contract.sourceOutSeconds ?? contract.source_out_seconds) || 0,
    contract.timeMapping || contract.time_mapping || null,
  ]);
}

function isPresentedEchoVideoElement(element, expectedSourceKey = "") {
  return Boolean(
    element
    && element.isConnected !== false
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
  const sourceKey = echoPresentedShotKey(shot);
  const callbackMatches = callbackBinding?.presented
    && callbackBinding.element
    && callbackBinding.mediaId === mediaId
    && callbackBinding.uri === uri
    && callbackBinding.sourceKey === sourceKey;
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
    recoveredFrom: "current-dom-player",
    shot
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
        error: formatEchoShaderPreviewError(next.error),
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
    }).catch((error) => publish({ status: "compile-error", error }));
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      surface.dispose();
    };
  }, [entry.id, entry.legacyApproximation, entry.manifestEligible, entry.sourceHash]);

  const failure = exactIsfStatusIsFailure(state.status) || state.status === "unsupported";
  const label = state.status === "ready" ? "LIVE PREVIEW READY" : state.status === "approximation" ? "LEGACY APPROXIMATION" : state.status.toUpperCase();
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

const ECHO_VIDEO_LOOKAHEAD_COUNT = ECHO_PLAYER_POOL_LIMIT - 1;
const ECHO_VIDEO_PLAYER_POOL_SIZE = ECHO_VIDEO_LOOKAHEAD_COUNT + 1;
const ECHO_VIDEO_PLAYER_INDICES = Array.from({ length: ECHO_VIDEO_PLAYER_POOL_SIZE }, (_, index) => index);

function PersistentEchoABPlayers({ shot, lookaheadShots = [], maximumDimension = 1280, playing, songTime, style, onBufferState, onPresentedMediaChange, presentationSampleRef, clockRef, audioRef, audioContextRef, sourceIsPortrait = false, cameraKeyframes = EMPTY_ECHO_CAMERA_KEYFRAMES, showGraph = null, shotIndex = 0 }) {
  const imageWrapperRefs = useRef([]);
  const playerRefs = useRef(Array.from({ length: ECHO_VIDEO_PLAYER_POOL_SIZE }, () => null));
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [stageStatus, setStageStatus] = useState("buffering");
  const generationRef = useRef(0);
  const fallbackRef = useRef(null);
  const preparationsRef = useRef(new Map());
  const mountedRef = useRef(true);
  const [poolRevision, setPoolRevision] = useState(0);
  const correctedPresentationKeyRef = useRef("");
  const slotStateRef = useRef(Array.from({ length: ECHO_VIDEO_PLAYER_POOL_SIZE }, () => ({ key: "", status: "idle", frameReady: false, generation: 0, error: "" })));

  // The 30fps camera loop must always compute from the latest shot settings.
  // Camera edits (intensity/speed/motion) do not change media_id or start_sec,
  // so the animation effect cannot rely on its render closure; keep the inputs
  // in a ref that updates every render.
  const cameraCueKey = item => JSON.stringify([Number(item?.startSeconds ?? item?.start_sec),
    Number(item?.endSeconds ?? item?.end_sec), String(item?.media?.id ?? item?.media_id ?? "")]);
  const cameraPathsRef = useRef({ graph: null, paths: new Map() });
  if (cameraPathsRef.current.graph !== showGraph) {
    cameraPathsRef.current = { graph: showGraph, paths: new Map((showGraph?.tracks || []).flatMap(track =>
      (track.cards || []).filter(card => card.media && card.cameraKeyframes?.length)
        .map(card => [cameraCueKey(card), card.cameraKeyframes]))) };
  }
  const cameraInputsRef = useRef(null);
  cameraInputsRef.current = { shot, sourceIsPortrait, cameraKeyframes, cameraPaths: cameraPathsRef.current.paths, shotIndex, songTime, style };
  const shotCameraFrame = (item, time) => echoCameraKeyframeAt(cameraPathsRef.current.paths.get(cameraCueKey(item)) || cameraKeyframes, time);

  const visualShots = [shot, ...lookaheadShots];
  const presentationInputsRef = useRef(null);
  presentationInputsRef.current = { shots: visualShots, instances: echoTimelineMediaInstances(visualShots), playing };

  const shotKey = echoPresentedShotKey;
  const currentShotIdentity = shotKey(shot);

  const waitFor = (video, eventName, timeoutMs, generation) => new Promise((resolve, reject) => {
    if (!mountedRef.current) { reject(new Error("stale-prepare")); return; }
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
    const video = playerRefs.current[slotIndex];
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
    const mediaContract = targetShot.media_contract || targetShot.mediaContract || {};
    const sourceInSeconds = mediaContract.sourceInSeconds ?? mediaContract.source_in_seconds;
    const sourceOutSeconds = mediaContract.sourceOutSeconds ?? mediaContract.source_out_seconds;
    const cueDurationSeconds = Math.max(0, Number(
      (targetShot.end_sec ?? targetShot.endSeconds) - (targetShot.start_sec ?? targetShot.startSeconds),
    ) || 0);
    const timeMapping = normalizeEchoTransitionTimeMapping(
      mediaContract.timeMapping || mediaContract.time_mapping,
      { sourceInSeconds, sourceOutSeconds, cueDurationSeconds },
    );
    const targetPlaybackRate = echoSourceWindowPlaybackRate({
      timeMapping,
      sourceInSeconds,
      sourceOutSeconds,
      cueDurationSeconds,
    });
    video.loop = false;
    video.playbackRate = targetPlaybackRate;
    const target = mapEchoSourceWindowTime({
      elapsedSeconds: offsetSeconds,
      durationSeconds: video.duration,
      sourceInSeconds,
      sourceOutSeconds,
      loop: false,
      cueDurationSeconds,
      timeMapping,
    });
    if (!video.seeking && Math.abs(video.currentTime - target) > 0.08) {
      video.currentTime = target;
      await waitFor(video, "seeked", 3000, generation);
    }
    const holdingLastFrame = echoSourceWindowAtEnd({ elapsedSeconds: offsetSeconds, durationSeconds: video.duration,
      sourceInSeconds, sourceOutSeconds, cueDurationSeconds, timeMapping });
    if (holdingLastFrame) video.pause();
    else await video.play();
    await new Promise((resolve, reject) => {
      let settled = false; const finish = (error) => { if (settled) return; settled = true; window.clearTimeout(timer); error ? reject(error) : resolve(); };
      const timer = window.setTimeout(() => finish(new Error("Echo player first-frame timeout")), 3000);
      if (holdingLastFrame) window.requestAnimationFrame(() => finish());
      else if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => finish());
      else window.requestAnimationFrame(() => finish());
    });
    if (slot.generation !== generation || slot.key !== key || video.videoWidth <= 0 || video.error) throw new Error("stale-or-empty-frame");
    video.pause();
    slot.status = "ready"; slot.frameReady = true; video.dataset.echoSourceKey = key; delete video.dataset.echoPreparingKey;
    return true;
  };

  const prepareOwnedSlot = (index, targetShot, offsetSeconds = 0) => {
    const key = shotKey(targetShot);
    const pending = preparationsRef.current.get(index);
    if (pending) return pending.key === key ? pending.promise : Promise.reject(new Error("busy-player-slot"));
    const generation = slotStateRef.current[index].generation + 1;
    const promise = prepare(index, targetShot, offsetSeconds, generation).catch((error) => {
      const slot = slotStateRef.current[index];
      if (slot.key === key && slot.generation === generation) {
        slot.status = "error"; slot.error = String(error?.message || error);
      }
      throw error;
    }).finally(() => {
      if (preparationsRef.current.get(index)?.promise === promise) preparationsRef.current.delete(index);
      if (mountedRef.current) setPoolRevision((value) => value + 1);
    });
    preparationsRef.current.set(index, { key, promise });
    return promise;
  };

  useEffect(() => {
    if (shotMediaType(shot) !== "video") {
      generationRef.current += 1;
      setStageStatus("ready");
      return undefined;
    }
    const generation = ++generationRef.current; const key = shotKey(shot);
    const targetLookahead = Math.min(ECHO_VIDEO_LOOKAHEAD_COUNT, lookaheadShots.filter((item) => shotMediaType(item) === "video").length);
    setStageStatus("buffering"); onBufferState?.({ status: "buffering", ready: false, currentKey: key, readyLookahead: 0, targetLookahead });
    const activate = (index) => {
      if (!mountedRef.current || generation !== generationRef.current) return;
      activeIndexRef.current = index; setActiveIndex(index); setStageStatus("ready");
      onBufferState?.({ status: "ready", ready: true, currentKey: key, readyLookahead: slotStateRef.current.filter((slot, slotIndex) => slotIndex !== index && slot.status === "ready").length, targetLookahead });
    };
    const loadCurrent = async () => {
      while (mountedRef.current && generation === generationRef.current) {
        // Current takes priority on a far seek. Reuse its pending preparation;
        // otherwise reserve an idle staging slot without replacing a busy owner.
        const plan = reconcileEchoPlayerSlots(slotStateRef.current, [{ assetKey: key, lookahead: 0 }], activeIndexRef.current,
          { busySlotIndices: [...preparationsRef.current.keys()], keyOf: String });
        const index = plan.assignments[0]?.slotIndex;
        if (index !== undefined) {
          const liveTime = Number(clockRef?.current ?? songTime);
          if (await prepareOwnedSlot(index, shot, Math.max(0, liveTime - Number(shot.start_sec || 0)))) activate(index);
          return;
        }
        const pending = [...preparationsRef.current.values()].map((item) => item.promise.catch(() => {}));
        if (!pending.length) throw new Error("No Echo staging player available");
        await Promise.race(pending);
      }
    };
    loadCurrent().catch((error) => {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setStageStatus("fallback"); onBufferState?.({ status: "fallback", ready: true, currentKey: key, error: String(error.message || error), readyLookahead: 0, targetLookahead: 0 });
    });
    return () => { if (generation === generationRef.current) generationRef.current += 1; };
  }, [currentShotIdentity]);

  useEffect(() => {
    if (stageStatus !== "ready") return;
    const key = shotKey(shot);
    const targets = lookaheadShots.filter((item) => shotMediaType(item) === "video").slice(0, ECHO_VIDEO_LOOKAHEAD_COUNT);
    const leases = targets.map((targetShot, index) => ({ assetKey: shotKey(targetShot), lookahead: index + 1, targetShot }));
    const plan = reconcileEchoPlayerSlots(slotStateRef.current, leases, activeIndexRef.current,
      { busySlotIndices: [...preparationsRef.current.keys()], keyOf: String });
    for (const { slotIndex, lease } of plan.assignments) {
      const slot = slotStateRef.current[slotIndex];
      // A failed identity retries when explicitly revisited as current, not on
      // every completion notification from an unrelated lookahead resource.
      if (slot.key === lease.assetKey && ["ready", "preparing", "error"].includes(slot.status)) continue;
      prepareOwnedSlot(slotIndex, lease.targetShot).catch(() => {});
    }
    const readyLookahead = leases.filter((lease) => slotStateRef.current.some((slot) => slot.key === lease.assetKey && slot.status === "ready")).length;
    const errors = leases.flatMap((lease) => slotStateRef.current.filter((slot) => slot.key === lease.assetKey && slot.error).map((slot) => slot.error));
    onBufferState?.({ status: errors.length ? "partial" : "ready", ready: true, currentKey: key,
      ...(errors.length ? { error: `Lookahead video failed: ${errors.join("; ")}` } : {}), readyLookahead, targetLookahead: targets.length });
  }, [stageStatus, currentShotIdentity, poolRevision, lookaheadShots.map((item) => shotKey(item)).join("|")]);

  useEffect(() => {
    const video = playerRefs.current[activeIndex];
    if (!video || shotMediaType(shot) !== "video") return;
    const mediaContract = shot.media_contract || shot.mediaContract || {};
    const sourceInSeconds = mediaContract.sourceInSeconds ?? mediaContract.source_in_seconds;
    const sourceOutSeconds = mediaContract.sourceOutSeconds ?? mediaContract.source_out_seconds;
    const cueDurationSeconds = Math.max(0, Number(
      (shot.end_sec ?? shot.endSeconds) - (shot.start_sec ?? shot.startSeconds),
    ) || 0);
    const timeMapping = normalizeEchoTransitionTimeMapping(
      mediaContract.timeMapping || mediaContract.time_mapping,
      { sourceInSeconds, sourceOutSeconds, cueDurationSeconds },
    );
    const targetPlaybackRate = echoSourceWindowPlaybackRate({
      timeMapping,
      sourceInSeconds,
      sourceOutSeconds,
      cueDurationSeconds,
    });
    let frame = 0, lastSyncAt = -Infinity;
    correctedPresentationKeyRef.current = "";
    const synchronize = (now) => {
      if (video.seeking || slotStateRef.current[activeIndex]?.key !== shotKey(shot)
        || slotStateRef.current[activeIndex]?.status !== "ready") return;
      const masterAudio = audioRef?.current;
      const outputClock = estimateEchoAudibleClock({ audio: masterAudio, context: audioContextRef?.current, nowMs: now });
      const liveSongTime = outputClock.audibleSongTime ?? outputClock.projectedElementSongTime
        ?? Number(clockRef?.current ?? songTime);
      const expected = mapEchoSourceWindowTime({
        elapsedSeconds: Math.max(0, liveSongTime - Number(shot.start_sec || 0)),
        durationSeconds: video.duration,
        sourceInSeconds,
        sourceOutSeconds,
        loop: false,
        cueDurationSeconds,
        timeMapping,
      });
      const presentationKey = `${activeIndex}:${shotKey(shot)}`;
      const observation = presentationSampleRef?.current;
      const presentedSample = playing && !masterAudio?.seeking && observation?.advancing && observation?.element === video
        && observation.sourceKey === shotKey(shot) ? observation.sample : null;
      const phase = echoDecodedPlaybackPhase(presentedSample, { nowMs: now, targetPlaybackRate });
      // Consume cue acquisition only after an actual advancing frame. Reuse the
      // existing presentation observer rather than starting another callback loop.
      const liveFrameSeen = !playing || typeof video.requestVideoFrameCallback !== "function"
        || (presentedSample?.eligible && now - presentedSample.nowMs >= 0 && now - presentedSample.nowMs <= 100);
      const cueEntry = liveFrameSeen && correctedPresentationKeyRef.current !== presentationKey;
      if (cueEntry) correctedPresentationKeyRef.current = presentationKey;
      const correction = planEchoPlaybackCorrection({
        expectedSeconds: expected,
        currentSeconds: video.currentTime,
        seeking: video.seeking,
        cueEntry: cueEntry || !playing,
        paused: !playing,
        targetPlaybackRate,
        presentedSample: phase === null ? null : presentedSample,
        nowMs: now,
        minimumSeconds: Math.max(0, Number(sourceInSeconds) || 0),
        maximumSeconds: mapEchoSourceWindowTime({ elapsedSeconds: Math.max(cueDurationSeconds, Number(video.duration) || 0) + 1,
          durationSeconds: video.duration, sourceInSeconds, sourceOutSeconds, loop: false, cueDurationSeconds, timeMapping }),
      });
      video.__hapaEchoPlaybackCorrection = { ...correction, nowMs: now, sourceKey: shotKey(shot) };
      if (correction.action === "seek") {
        if (presentationSampleRef) presentationSampleRef.current = null;
        video.currentTime = Math.min(Number(video.duration || expected), correction.targetSeconds);
      }
      video.playbackRate = correction.playbackRate;
      const holdingLastFrame = echoSourceWindowAtEnd({ elapsedSeconds: Math.max(0, liveSongTime - Number(shot.start_sec || 0)),
        durationSeconds: video.duration, sourceInSeconds, sourceOutSeconds, cueDurationSeconds, timeMapping })
        || (video.ended && correction.action !== "seek");
      if (playing && video.paused && !holdingLastFrame) video.play().catch((error) => {
        const readyLookahead = slotStateRef.current.filter((candidate, index) => index !== activeIndexRef.current && candidate.status === "ready").length;
        const targetLookahead = Math.min(ECHO_VIDEO_LOOKAHEAD_COUNT, lookaheadShots.filter((item) => shotMediaType(item) === "video").length);
        onBufferState?.({ status: "partial", ready: true, currentKey: shotKey(shot), error: `Current video playback failed: ${String(error?.message || error)}`, readyLookahead, targetLookahead });
      });
      if (holdingLastFrame && !video.paused) video.pause();
      if (!playing && !video.paused) video.pause();
    };
    const tick = (now) => {
      if (now - lastSyncAt >= 1000 / 30) { lastSyncAt = now; synchronize(now); }
      if (playing) frame = window.requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => {
      window.cancelAnimationFrame(frame);
      delete video.__hapaEchoPlaybackCorrection;
    };
  }, [activeIndex, stageStatus, playing, currentShotIdentity, playing ? null : songTime, audioRef, audioContextRef, clockRef, presentationSampleRef]);

  useEffect(() => {
    const sourceKey = shotKey(shot);
    if (shotMediaType(shot) !== "video") return undefined;
    const video = playerRefs.current[activeIndex];
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
      playerIndex: activeIndex,
      shot
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
  }, [activeIndex, stageStatus, currentShotIdentity, shot, onPresentedMediaChange]);

  useEffect(() => {
    let frame = 0, lastPresentationFrame = -1;
    const animateCamera = () => {
      const { shots, instances } = presentationInputsRef.current;
      const { cameraKeyframes: keyframes, cameraPaths, shotIndex: baseIndex, songTime: fallbackTime, style: baseStyle } = cameraInputsRef.current;
      const master = audioRef?.current;
      const seconds = Number(playing && master && !master.paused ? master.currentTime : clockRef?.current ?? fallbackTime);
      const fps = Math.max(1, Number(showGraph?.outputProfile?.fps) || 30);
      const outputFrame = Math.floor(Math.max(0, seconds) * fps + 1e-9);
      if (playing && outputFrame === lastPresentationFrame) {
        frame = window.requestAnimationFrame(animateCamera);
        return;
      }
      lastPresentationFrame = outputFrame;
      // Match the compositor's absolute song frame instead of accumulating a
      // wall-time throttle, which can skip frames at non-multiple refresh rates.
      const time = playing ? outputFrame / fps : seconds;
      const applyCamera = (element, targetShot, index) => {
        if (!element) return;
        const dimensions = resolveEchoShotSourceDimensions(targetShot, element);
        const cameraKeyframe = echoCameraKeyframeAt(cameraPaths.get(cameraCueKey(targetShot)) || keyframes, time);
        const cameraShot = cameraKeyframe ? { ...targetShot, camera_motion: cameraKeyframe.motion || targetShot.camera_motion,
          camera_intensity: cameraKeyframe.intensity ?? targetShot.camera_intensity,
          camera_speed: cameraKeyframe.speed ?? targetShot.camera_speed } : targetShot;
        const camera = cameraMotionStyleForShot(cameraShot, time, dimensions.isPortrait, baseIndex + index, cameraKeyframe?.crop || null);
        const crop = camera.presentation?.crop;
        if (["protected-v2", "section-crop-v1"].includes(crop?.cameraModel)) {
          const parent = element.parentElement;
          const sourceWidth = element.videoWidth || element.naturalWidth;
          const sourceHeight = element.videoHeight || element.naturalHeight;
          if (!(sourceWidth > 0 && sourceHeight > 0 && parent?.clientWidth > 0 && parent?.clientHeight > 0)) return;
          const framed = echoProtectedCameraFrame({ sourceWidth, sourceHeight,
            outputWidth: parent.clientWidth, outputHeight: parent.clientHeight, crop });
          Object.assign(element.style, framed.style);
          element.dataset.echoProtectedCamera = "true";
          return;
        }
        if (element.dataset.echoProtectedCamera === "true") {
          for (const key of ["position", "width", "height", "left", "top", "maxWidth", "maxHeight", "objectFit", "objectPosition", "transform", "transformOrigin", "clipPath"])
            element.style[key] = baseStyle?.[key] || "";
          delete element.dataset.echoProtectedCamera;
        }
        element.style.transform = camera.transform;
        element.style.transformOrigin = camera.transformOrigin;
        element.style.objectPosition = camera.objectPosition;
      };
      for (let slotIndex = 0; slotIndex < playerRefs.current.length; slotIndex += 1) {
        const video = playerRefs.current[slotIndex];
        if (!video) continue;
        const slot = slotStateRef.current[slotIndex];
        const index = shots.findIndex(candidate => shotKey(candidate) === slot.key);
        const targetShot = shots[index];
        const opacity = hyperFramesMediaOpacityState(instances, index, time);
        const ready = slot.status === "ready" && slot.frameReady && video.dataset.echoSourceKey === slot.key;
        const visible = ready && opacity.visible && shotMediaType(targetShot) === "video";
        video.style.opacity = String(visible ? opacity.alpha : 0);
        video.style.zIndex = String(Math.max(0, index) + 1);
        video.dataset.echoPresentationPhase = visible ? opacity.phase : "inactive";
        // The incoming handle holds the first source frame. It cannot consume
        // footage or start an independent clock before the logical cue onset.
        if (visible && index > 0 && time < instances[index].start) {
          const contract = targetShot.media_contract || targetShot.mediaContract || {};
          const first = Math.max(0, Number(contract.sourceInSeconds ?? contract.source_in_seconds) || 0);
          if (!video.paused) video.pause();
          if (!video.seeking && Math.abs(video.currentTime - first) > 0.000001) video.currentTime = first;
        } else if (!visible && slot.status === "ready" && !video.paused) video.pause();
        if (!visible) continue;
        applyCamera(video, targetShot, index);
      }
      for (let index = 0; index < imageWrapperRefs.current.length; index += 1) {
        const wrapper = imageWrapperRefs.current[index];
        if (!wrapper) continue;
        const opacity = hyperFramesMediaOpacityState(instances, index, time);
        wrapper.style.opacity = String(opacity.alpha);
        wrapper.dataset.echoPresentationPhase = opacity.phase;
        if (opacity.visible) applyCamera(wrapper.querySelector("img"), shots[index], index);
      }
      if (playing) frame = window.requestAnimationFrame(animateCamera);
    };
    animateCamera();
    return () => window.cancelAnimationFrame(frame);
  }, [playing, currentShotIdentity, playing ? null : songTime, poolRevision, stageStatus, activeIndex, clockRef, audioRef, showGraph, cameraKeyframes]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
    mountedRef.current = false;
    generationRef.current += 1;
    for (const slot of slotStateRef.current) slot.generation += 1;
    for (const video of playerRefs.current) {
      if (!video) continue;
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* best effort */ }
    }
    };
  }, []);

  return (
    <>
      <div ref={fallbackRef} data-echo-fallback={stageStatus} style={{ ...style, opacity: stageStatus === "ready" ? 0 : 1, position: "absolute", inset: 0, zIndex: 0, background: "radial-gradient(circle at center, rgba(9,28,46,.96), #020617 72%)", transition: "none" }}>
        {(shot.media_contract?.posterUri || shot.media_thumbnail) && <img src={resolveMediaUri(shot.media_contract?.posterUri || shot.media_thumbnail)} alt="Buffered shot fallback" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      {ECHO_VIDEO_PLAYER_INDICES.map((index) => (
        <video
          key={`persistent-echo-player-${index}`}
          ref={(element) => { playerRefs.current[index] = element; }}
          muted
          crossOrigin="anonymous"
          playsInline
          preload="auto"
          data-echo-player={index === activeIndex && shotMediaType(shot) === "video" ? "current" : "standby"}
          data-frame-presented={index === activeIndex && stageStatus === "ready" && shotMediaType(shot) === "video" ? "true" : "false"}
          style={{ ...style, position: 'absolute', inset: 0, opacity: index === activeIndex && stageStatus === "ready" ? 1 : 0, transition: "none", zIndex: index === activeIndex ? 1 : 0 }}
        />
      ))}
      {visualShots.map((imageShot, index) => shotMediaType(imageShot) === "image" ? (
        <div key={shotKey(imageShot)} ref={element => { imageWrapperRefs.current[index] = element; }}
          data-echo-image-layer={index} style={{ position: "absolute", inset: 0, zIndex: index + 1,
            opacity: hyperFramesMediaOpacityState(presentationInputsRef.current.instances, index, songTime).alpha }}>
          <PresentedEchoImage shot={imageShot} maximumDimension={maximumDimension}
            cameraCrop={shotCameraFrame(imageShot, songTime)?.crop}
            onPresentedMediaChange={index === 0 ? onPresentedMediaChange : undefined}
            style={{ ...style, transition: "none", opacity: 1,
              ...(({ transform, transformOrigin, objectPosition }) => ({ transform, transformOrigin, objectPosition }))(cameraMotionStyleForShot(imageShot, songTime, resolveEchoShotSourceDimensions(imageShot).isPortrait, shotIndex + index,
                shotCameraFrame(imageShot, songTime)?.crop || null)) }} />
        </div>
      ) : null)}
    </>
  );
}

export function PresentedEchoImage({ shot, style, cameraCrop, onPresentedMediaChange, maximumDimension = 1280 }) {
  const imageRef = useRef(null);
  const framingInputs = useRef({ style, cameraCrop });
  framingInputs.current = { style, cameraCrop };
  const [framingError, setFramingError] = useState("");
  const mediaId = String(shot?.media_id || "");
  const imageGeometry = shot?.media_contract?.imageShot || null;
  const imageRenditions = shot?.media_contract?.imageRenditions;
  const [previewChoice, setPreviewChoice] = useState(null);
  const cropWidth = cameraCrop?.width || 1, cropHeight = cameraCrop?.height || 1;
  const cropFit = cameraCrop?.fit || "contain";
  const choosePreview = useCallback(() => {
    const parent = imageRef.current?.parentElement;
    if (!imageGeometry || !parent?.clientWidth || !parent?.clientHeight) return;
    let next;
    try {
      const requestedWidth = parent.clientWidth * Math.min(2, window.devicePixelRatio || 1);
      const requestedHeight = parent.clientHeight * Math.min(2, window.devicePixelRatio || 1);
      const decodeScale = Math.min(1, maximumDimension / Math.max(requestedWidth, requestedHeight));
      const choice = selectImageShotRendition({ geometry: createImageShotGeometry(imageGeometry),
        renditions: imageRenditions || [], outputProfile: { width: Math.ceil(requestedWidth * decodeScale), height: Math.ceil(requestedHeight * decodeScale) },
        crop: { width: cropWidth, height: cropHeight }, fit: cropFit });
      next = { sourceHash: imageGeometry.original?.sha256, uri: choice.selected?.uri || null, status: choice.status, insufficientResolution: choice.insufficientResolution };
    } catch { next = { uri: null, status: "invalid-image-preparation" }; }
    setPreviewChoice(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, [imageGeometry, imageRenditions, cropWidth, cropHeight, cropFit, maximumDimension]);
  const uri = imageGeometry ? (previewChoice?.sourceHash === imageGeometry.original?.sha256 && previewChoice?.uri ? resolveMediaUri(previewChoice.uri) : null) : resolveMediaUri(shotRuntimeUri(shot));
  const sourceKey = `${mediaId}:${uri}`;
  useLayoutEffect(() => { choosePreview(); }, [choosePreview]);
  const applyFraming = useCallback(() => {
    const element = imageRef.current, parent = element?.parentElement;
    if (!element || !parent || !element.naturalWidth || !parent.clientWidth || !parent.clientHeight) return;
    const input = framingInputs.current;
    try {
      if (["protected-v2", "section-crop-v1"].includes(input.cameraCrop?.cameraModel)) {
        const frame = echoProtectedCameraFrame({ sourceWidth: element.naturalWidth, sourceHeight: element.naturalHeight,
          outputWidth: parent.clientWidth, outputHeight: parent.clientHeight, crop: input.cameraCrop });
        Object.assign(element.style, frame.style);
        element.dataset.echoProtectedCamera = "true";
      } else if (element.dataset.echoProtectedCamera === "true") {
        for (const key of ["position", "width", "height", "left", "top", "maxWidth", "maxHeight", "objectFit", "objectPosition", "transform", "transformOrigin", "clipPath"])
          element.style[key] = input.style?.[key] || "";
        delete element.dataset.echoProtectedCamera;
      }
      element.style.visibility = "";
      setFramingError("");
    } catch (error) {
      element.style.visibility = "hidden";
      setFramingError(String(error.message || "image-framing-failed"));
    }
  }, []);
  const publish = () => {
    applyFraming();
    const element = imageRef.current;
    const presented = Boolean(element?.complete && Number(element?.naturalWidth || 0) > 0 && uri && element.currentSrc === new URL(uri, window.location.href).href && element.style.visibility !== "hidden");
    onPresentedMediaChange?.(presented ? { element, kind: "image", mediaId, uri, sourceKey, presented: true } : { element: null, kind: "image", mediaId, uri, sourceKey, presented: false, reason: "image-frame-not-presented" });
  };
  useLayoutEffect(() => { applyFraming(); }, [applyFraming, cameraCrop, style, sourceKey]);
  useEffect(() => {
    const parent = imageRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => { choosePreview(); applyFraming(); });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [applyFraming, choosePreview, sourceKey]);
  useEffect(() => () => {
    onPresentedMediaChange?.({ element: null, kind: "image", mediaId, uri, sourceKey, presented: false, reason: "binding-released" });
  }, [mediaId, uri, sourceKey, onPresentedMediaChange]);
  return <><img ref={imageRef} src={uri || undefined} crossOrigin="anonymous" alt={shot?.media_title || "Echo still"} onLoad={publish} onError={publish} style={style} />
    {(framingError || (imageGeometry && previewChoice && !previewChoice.uri)) && <div role="alert" data-echo-image-framing-error={framingError} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#020617", padding: 20 }}>Image framing is unavailable. Prepare this image again or choose another shot.</div>}</>;
}

const CAMERA_MOTION_OPTIONS = [
  { value: "auto", label: "Auto pan" },
  { value: "static", label: "Static" },
  { value: "slow-push-in", label: "Slow push in" },
  { value: "slow-pull-out", label: "Slow pull out" },
  { value: "pan-up", label: "Pan up" },
  { value: "pan-down", label: "Pan down" },
  { value: "scan-down", label: "Scan down · full height (tall clips)" },
  { value: "scan-up", label: "Scan up · full height (tall clips)" },
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
  { value: "neon-cyan", label: "Neon cyan", textColor: "#e0faff" },
  { value: "magenta-glow", label: "Magenta glow", textColor: "#ffe4f2" },
  { value: "gold-caption", label: "Gold caption", textColor: "#fff7dc" },
  { value: "paper-white", label: "Paper white", textColor: "#101827" },
  { value: "minimal-subtitle", label: "Minimal subtitle", textColor: "#ffffff" }
];

function positiveEchoMediaDimension(...values) {
  for (const value of values) {
    const candidate = Number(value);
    if (Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return 0;
}

function resolveEchoShotSourceDimensions(item = null, mediaElement = null) {
  const mediaContract = item?.media_contract || item?.mediaContract || {};
  const dimensions = mediaContract.dimensions || {};
  const proxy = mediaContract.proxy || {};
  const declaredWidth = positiveEchoMediaDimension(dimensions.width, mediaContract.width);
  const declaredHeight = positiveEchoMediaDimension(dimensions.height, mediaContract.height);
  const decodedWidth = positiveEchoMediaDimension(
    mediaElement?.videoWidth,
    mediaElement?.displayWidth,
    mediaElement?.naturalWidth,
    mediaElement?.width,
  );
  const decodedHeight = positiveEchoMediaDimension(
    mediaElement?.videoHeight,
    mediaElement?.displayHeight,
    mediaElement?.naturalHeight,
    mediaElement?.height,
  );
  const proxyWidth = positiveEchoMediaDimension(proxy.width);
  const proxyHeight = positiveEchoMediaDimension(proxy.height);
  const declaredKnown = declaredWidth > 0 && declaredHeight > 0;
  const decodedKnown = decodedWidth > 0 && decodedHeight > 0;
  const proxyKnown = proxyWidth > 0 && proxyHeight > 0;
  const width = declaredKnown ? declaredWidth : decodedKnown ? decodedWidth : proxyKnown ? proxyWidth : 0;
  const height = declaredKnown ? declaredHeight : decodedKnown ? decodedHeight : proxyKnown ? proxyHeight : 0;
  return {
    width,
    height,
    decodedWidth,
    decodedHeight,
    known: width > 0 && height > 0,
    isPortrait: width > 0 && height > width,
    source: declaredKnown ? "media-contract-dimensions" : decodedKnown ? "decoded-media" : proxyKnown ? "media-contract-proxy" : "unknown",
  };
}

function cameraPresentationForShot(item, currentTime, sourceIsPortrait, shotIndex = 0, cameraCrop = null) {
  if (!item) {
    return echoCameraMotionPresentation({
      timeSeconds: currentTime,
      isPortrait: Boolean(sourceIsPortrait),
      crop: cameraCrop,
    });
  }
  const start = Number(item.start_sec || 0);
  return echoCameraMotionPresentation({
    startSeconds: start,
    endSeconds: Number(item.end_sec || start + 1),
    timeSeconds: currentTime,
    motion: item.camera_motion || item.camera?.motion || "auto",
    intensity: item.camera_intensity ?? item.camera?.intensity ?? 1,
    speed: item.camera_speed ?? item.camera?.speed,
    shotIndex,
    sourceId: item.section_id || item.media_id || "",
    isPortrait: Boolean(sourceIsPortrait),
    crop: cameraCrop,
  });
}

function cameraMotionStyleForShot(item, currentTime, sourceIsPortrait, shotIndex = 0, cameraCrop = null) {
  if (!item) {
    return {
      transform: "scale(1)",
      transformOrigin: "center center",
      objectPosition: "center center",
      presentation: null,
    };
  }
  const presentation = cameraPresentationForShot(
    item,
    currentTime,
    sourceIsPortrait,
    shotIndex,
    cameraCrop,
  );

  return {
    transform: `scale(${presentation.scale.toFixed(3)}) translate3d(${presentation.translateXPercent.toFixed(2)}%, ${presentation.translateYPercent.toFixed(2)}%, 0)`,
    transformOrigin: presentation.crop
      ? `${presentation.transformOriginXPercent.toFixed(3)}% ${presentation.transformOriginYPercent.toFixed(3)}%`
      : "center center",
    objectPosition: `${presentation.objectPositionXPercent.toFixed(1)}% ${presentation.objectPositionYPercent.toFixed(1)}%`,
    presentation,
  };
}

function drawEchoCameraFramedMediaInput({
  canvas,
  mediaElement,
  shot,
  timeSeconds = 0,
  shotIndex = 0,
  cameraCrop = null,
  outputWidth,
  outputHeight,
} = {}) {
  if (!canvas || !mediaElement) return null;
  const dimensions = resolveEchoShotSourceDimensions(shot, mediaElement);
  const sourceWidth = positiveEchoMediaDimension(dimensions.decodedWidth, dimensions.width);
  const sourceHeight = positiveEchoMediaDimension(dimensions.decodedHeight, dimensions.height);
  const width = Math.max(1, Math.round(Number(outputWidth) || 0));
  const height = Math.max(1, Math.round(Number(outputHeight) || 0));
  if (!(sourceWidth > 0 && sourceHeight > 0 && width > 0 && height > 0)) return null;
  const presentation = cameraPresentationForShot(
    shot,
    timeSeconds,
    dimensions.isPortrait,
    shotIndex,
    cameraCrop,
  );
  const sourceRect = echoCameraCoverSourceRect({
    sourceWidth,
    sourceHeight,
    outputWidth: width,
    outputHeight: height,
    presentation,
  });
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  context.clearRect(0, 0, width, height);
  try {
    context.drawImage(
      mediaElement,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      sourceRect.destination?.x ?? 0,
      sourceRect.destination?.y ?? 0,
      sourceRect.destination?.width ?? width,
      sourceRect.destination?.height ?? height,
    );
  } catch {
    context.clearRect(0, 0, width, height);
    return null;
  }
  canvas.dataset.echoMediaInput = "camera-framed";
  canvas.dataset.echoSourceOrientation = dimensions.isPortrait ? "portrait" : "landscape";
  return { canvas, presentation, sourceRect, dimensions };
}

function paintEchoPreviewMediaBase({ context, framedMediaInput, width, height } = {}) {
  const source = framedMediaInput?.canvas;
  const outputWidth = Math.max(1, Math.round(Number(width) || 0));
  const outputHeight = Math.max(1, Math.round(Number(height) || 0));
  if (!context || !source || !(outputWidth > 0 && outputHeight > 0)) return false;
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.filter = "none";
    context.drawImage(source, 0, 0, outputWidth, outputHeight);
    return true;
  } catch {
    return false;
  } finally {
    context.restore();
  }
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
      const cadence = powerMode === "docked" ? 2 : 4;
      const signature = `${shotIndex}:${Math.floor(time * cadence)}`;
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

function detachedEchoVisualizerCards(showGraph = null) {
  return (showGraph?.tracks || [])
    .filter((track) => track?.id === "track-b" || track?.role === "visualizer")
    .flatMap((track) => track?.cards || [])
    .filter((card) => Boolean(
      card?.visualization
      && card?.disabled !== true
      && card?.knockedOut !== true
      && card?.knocked_out !== true
      && String(card?.visualization?.sourceId || card?.visualization?.requestedSourceId || card?.visualization?.card?.id || "").toLowerCase() !== "none"
    ))
    .filter((card) => !isPortableVisualizerAttachment(card));
}

function normalizedRendererRuntimeStatus(status = "") {
  const value = String(status || "").toLowerCase();
  if (value === "error" || value === "failed" || value === "history-error") return "draw-error";
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
    ...(presentation.historyFidelity === "live-unrecorded" ? {
      fallback: { id: `${requestedId}@unrecorded-live`, title: "Live shader history (not seek-reproducible)", route: "unrecorded-live-history" },
      reason: "Live persistent history is not reproducible without a recorded signal take",
    } : {}),
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
      width: Number(slot.width || 0), height: Number(slot.height || 0),
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
    maxSurfaces: Number(diagnostics.maxSurfaces || 0),
    surfaceCount: Number(diagnostics.surfaceCount || 0),
    contextCount: Number(diagnostics.contextCount || diagnostics.contexts || 0),
    programCount: Number(diagnostics.programCount || diagnostics.programs || 0),
    historyCheckpointBytes: Number(diagnostics.historyCheckpointBytes || 0),
    historyCheckpointBudget: diagnostics.historyCheckpointBudget || null,
    historyMedia: diagnostics.historyMedia || null,
    historyLookaheadBytes: diagnostics.historyLookaheadBytes || 0,
    compileTimeMs: diagnostics.compileTimeMs || [],
    preparationTimeMs: diagnostics.preparationTimeMs || [],
    historyPresentationTiming: diagnostics.historyPresentationTiming || [],
    historyJobsPreparing: Number(diagnostics.historyJobsPreparing || 0),
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

function visualizerCompositionInput(card = null, timeSeconds = 0, shader = null, revolvingShaderVisibility = null) {
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
  // Type-aware defaults: an unset layer on a generator is a semi-transparent
  // screen veil so the media underneath stays visible; a filter transforms the
  // frame, so it remains fully opaque with a normal composite. Explicit
  // parameters/layer values always win. Always-on shaders knock out the black
  // plate so visibility can go to 100% without crushing holes in the video.
  const isFilter = String(shader?.shaderType || "").toLowerCase() === "filter";
  const defaultOpacity = isFilter ? 1 : 0.42;
  const defaultBlend = isFilter ? "normal" : "screen";
  const persistent = card?.alwaysOn === true || Boolean(card?.persistentSlotId);
  const groupVisibility = Number(revolvingShaderVisibility);
  const hasGroupVisibility = revolvingShaderVisibility !== null
    && revolvingShaderVisibility !== undefined
    && Number.isFinite(groupVisibility);
  const opacity = !persistent && hasGroupVisibility
    ? Math.max(0, Math.min(1, groupVisibility))
    : Number(parameters.opacity ?? layer.opacity ?? defaultOpacity);
  const mix = Number(parameters.mix ?? layer.mix ?? 1);
  const blend = String(parameters.blendMode || layer.blend || defaultBlend);
  const layerOpacity = Number(parameters.layerOpacity ?? parameters.layer_opacity ?? layer.layerOpacity ?? layer.layer_opacity ?? 1);
  const knockoutRequested = parameters.knockoutBlacks ?? parameters.knockout_blacks ?? layer.knockoutBlacks ?? layer.knockout_blacks ?? persistent;
  const plan = planEchoIsfLayerComposite({
    opacity,
    shaderVisibility: opacity,
    mix,
    blend,
    layerOpacity,
    knockoutBlacks: knockoutRequested,
    transitionAlpha,
  }, { persistent, shaderType: shader?.shaderType });
  return {
    opacity,
    mix,
    blend,
    ...plan,
    target: String(parameters.target || layer.target || "program"),
    transitionAlpha,
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

function HapaEchosView({ selectedSongId, onSelectSong, playbackMode = "active", livingLightOpenRequest }) {
  const clockDiagnostics = globalThis.__HAPA_ECHO_CLOCK_DIAGNOSTICS__ ||= { topLevelRenders: 0, boundaryRenders: 0 };
  clockDiagnostics.topLevelRenders += 1;
  const powerMode = normalizePlaybackPowerMode(playbackMode);
  const [board, setBoard] = useState(null);
  const [audioVisualMode, setAudioVisualMode] = useState("prepared");
  const [captureLiveSignals, setCaptureLiveSignals] = useState(true);
  const [recordedSignalReplay, setRecordedSignalReplay] = useState(null);
  const previewSignalCaptureRef = useRef(null);
  const previewCaptureContextRef = useRef(null);
  const recordingSourceKeyRef = useRef("");
  const [visualSignalSolo, setVisualSignalSolo] = useState({ key: "", role: "" });
  const [preparedAudio, setPreparedAudio] = useState({ status: "idle", key: "", value: null });
  const [preparedAudioRetry, setPreparedAudioRetry] = useState(0);
  const audioInventory = useSongAudioInventory();
  const [audioFileFilter, setAudioFileFilter] = useState("all");
  const [atlasSelection, setAtlasSelection] = useState(null);
  const [gapsReport, setGapsReport] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [panelStatus, setPanelStatus] = useState({});
  const panelLoaderRef = useRef(null);
  const videoDetailControllerRef = useRef(null);
  const [echoOperationNotice, setEchoOperationNotice] = useState("");
  const [exportingMasterReference, setExportingMasterReference] = useState("");
  const [expandedSongId, setExpandedSongId] = useState(null);
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const [activeDirectoryTab, setActiveDirectoryTab] = useState("director");
  const [searchQuery, setSearchQuery] = useState("");
  const [songSort, setSongSort] = useState(() => {
    try { const saved = localStorage.getItem('hapa.echo.song-sort'); return ['name', 'newest', 'oldest'].includes(saved) ? saved : 'name'; }
    catch { return 'name'; }
  });
  useEffect(() => { try { localStorage.setItem('hapa.echo.song-sort', songSort); } catch { /* Sorting still works without preference storage. */ } }, [songSort]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedDetailVideo, setSelectedDetailVideo] = useState(null);
  const [songCardCatalog, setSongCardCatalog] = useState(null);
  const [songCardCatalogLoading, setSongCardCatalogLoading] = useState(false);
  const [songCardCatalogError, setSongCardCatalogError] = useState("");
  const [loadingVideoDetail, setLoadingVideoDetail] = useState(false);
  const [videoPickerQuery, setVideoPickerQuery] = useState("");
  const [shaderPickerQuery, setShaderPickerQuery] = useState("");
  const [shaderCategoryFilter, setShaderCategoryFilter] = useState("all");

  const [directorProjects, setDirectorProjects] = useState([]);
  const projectSummaryBySongRef = useRef(new Map());
  const recentProjectDetailsRef = useRef([]);
  const [livingLightRecipeBusy,setLivingLightRecipeBusy]=useState(false);
  const [livingLightRecordVisitState,setLivingLightRecordVisitState]=useState({state:'idle',canReturn:false,message:''});
  const livingLightVisitContextRef=useRef(null),livingLightSelectionRef=useRef(null),livingLightSeekRef=useRef(null);
  const livingLightRecordVisitRef=useRef(null);
  const livingLightRecordVisit=useMemo(()=>({open:target=>livingLightRecordVisitRef.current.open(target),return:()=>livingLightRecordVisitRef.current.return(),cancel:()=>livingLightRecordVisitRef.current.cancel()}),[]);
  useEffect(()=>{
    const visit=createLivingLightRecordVisit({readCurrent:()=>livingLightVisitContextRef.current.readCurrent(),load:(target,options)=>loadLivingLightRecordDestination(target,{...options,request:livingLightVisitContextRef.current.request}),activate:selection=>livingLightVisitContextRef.current.activate(selection),pause:()=>{audioRef.current?.pause();setIsPlaying(false);},onState:setLivingLightRecordVisitState});
    livingLightRecordVisitRef.current=visit;return()=>{visit.dispose();if(livingLightRecordVisitRef.current===visit)livingLightRecordVisitRef.current=null;};
  },[]);
  const [selectedProjectSongId, setSelectedProjectSongId] = useState(null);
  const selectedProjectSongIdRef = useRef("");
  const [selectedDirectionVariantId, setSelectedDirectionVariantId] = useState("legacy");
  const directionSelectionPreferenceRef = useRef("auto-latest");
  const latestDirectionHydrationKeyRef = useRef("");
  const [workingDirectionFork, setWorkingDirectionFork] = useState(null);
  const [directionForkTransitionPending, setDirectionForkTransitionPending] = useState(false);
  const [directionCutSelectionPending, setDirectionCutSelectionPending] = useState(false);
  const [pendingSavedDirectionCut, setPendingSavedDirectionCut] = useState(null);
  const [pendingLegacyProjectSave, setPendingLegacyProjectSave] = useState(null);
  const [loadingProjectDetail, setLoadingProjectDetail] = useState(false);
  const projectDetailRequestCountRef = useRef(0);
  const projectDetailGenerationBySongRef = useRef(new Map());
  const projectDetailControllerBySongRef = useRef(new Map());
  const [planning, setPlanning] = useState(false);
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState("preview");
  const [livingLightVisited,setLivingLightVisited]=useState(false);
  useEffect(()=>{if(activeWorkbenchTab==='living-light')setLivingLightVisited(true);},[activeWorkbenchTab]);
  useEffect(()=>{if(livingLightOpenRequest)setActiveWorkbenchTab('living-light');},[livingLightOpenRequest?.nonce]);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);
  const currentTimeRef = useRef(0);
  const activeProjectRef = useRef(null);
  const echoPlaybackEngineRef = useRef(null);
  const [echoPlaybackSnapshot, setEchoPlaybackSnapshot] = useState(null);
  const [previewBufferState, setPreviewBufferState] = useState({ status: "idle", ready: false, readyLookahead: 0, targetLookahead: 0 });
  const [previewProjection, setPreviewProjection] = useState(null);
  const [previewQuality, setPreviewQuality] = useState(() => normalizeEchoPreviewQuality());
  const [previewQualityPreset, setPreviewQualityPreset] = useState("full");
  const setPreviewQualityControl = (key, value) => {
    setPreviewQualityPreset("custom");
    setPreviewQuality(current => normalizeEchoPreviewQuality({ ...current, [key]: Number(value) }));
  };
  const previewTimelineRef = useRef([]);
  const directorPreviewFullscreenRef = useRef(null);
  const directorPreviewFullscreenActiveRef = useRef(false);
  const [directorPreviewExpanded, setDirectorPreviewExpanded] = useState(false);
  const [directorPreviewFullscreen, setDirectorPreviewFullscreen] = useState(false);
  const [directorPreviewFullscreenMessage, setDirectorPreviewFullscreenMessage] = useState("");
  // Clean preview mode hides the telemetry HUD and timed-lyric overlays that sit
  // on top of the picture. Persisted per operator so the preference survives reloads.
  const [cleanPreviewMode, setCleanPreviewMode] = useState(() => {
    try { return globalThis.localStorage?.getItem("hapa-echoes-clean-preview") === "1"; } catch { return false; }
  });
  const toggleCleanPreviewMode = useCallback(() => {
    setCleanPreviewMode((current) => {
      const next = !current;
      try { globalThis.localStorage?.setItem("hapa-echoes-clean-preview", next ? "1" : "0"); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  // ---- Director Preview quick capture (preview recordings) ----
  // state: idle | preparing | recording | saving | error
  const [previewRecordingState, setPreviewRecordingState] = useState("idle");
  const [previewRecordingElapsedMs, setPreviewRecordingElapsedMs] = useState(0);
  const [previewRecordingError, setPreviewRecordingError] = useState("");
  const [previewRecordings, setPreviewRecordings] = useState(null); // null = not loaded yet
  const [previewRecordingsError, setPreviewRecordingsError] = useState("");
  const [previewRecordingLastId, setPreviewRecordingLastId] = useState("");
  const previewRecordingActiveRef = useRef(false);
  const previewRecordingStartingRef = useRef(false);
  const previewRecordingFailureMessageRef = useRef("");
  const previewRecordingSessionRef = useRef(null);
  const previewRecordingCanvasRef = useRef(null);
  const previewRecordingStreamRef = useRef(null);
  const previewRecordingAudioTapRef = useRef(null);
  const previewRecordingChunksRef = useRef([]);
  const previewRecordingRafRef = useRef(0);
  const previewRecordingEndedRef = useRef(null);
  const previewRecordingDownloadUrlRef = useRef("");
  // The composite loop reads projected data through refs so a capture that
  // outlives a re-render never reads a stale projection source.
  const activeDirectorPreviewSourceRef = useRef(null);
  const activeShowGraphRef = useRef(null);
  const shaderTypeResolverRef = useRef(null);
  const canvasRef = useRef(null);
  const echoLyricPresentationRef = useRef(null);
  const echoLyricCaptureSurfaceRef = useRef(null);
  const exactIsfPlaybackPoolRef = useRef(null);
  const exactIsfPlaybackPoolIdentityRef = useRef({ variantKey: "", dirtyKey: "", sizeKey: "", dirtyRangeCount: 0, shaderIds: [] });
  const exactIsfPrewarmSignatureRef = useRef("");
  const exactIsfPresentationRef = useRef({ status: "idle", sourceId: "", error: "" });
  const exactIsfLastPresentedCanvasRef = useRef(null);
  const exactIsfMediaInputCanvasRef = useRef(null);
  const emptyIsfMedia = useMemo(() => createEchoEmptyShaderMedia(), []);
  const [exactIsfStatus, setExactIsfStatus] = useState({ status: "idle", sourceId: "", error: "" });
  const presentedMediaRef = useRef(null);
  const presentationTimingRef = useRef(null);
  if (!presentationTimingRef.current) presentationTimingRef.current = createEchoPresentationTimingRecorder();
  const presentationObserverRef = useRef(null);
  const presentationSampleRef = useRef(null);
  const presentationPublishAtRef = useRef(-Infinity);
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
  const [audioPlaybackReceipt, setAudioPlaybackReceipt] = useState(null);
  const audioPlaybackReceiptRef = useRef(null);
  const masterPlaybackReceiptRef = useRef(null);
  const [livingLightAudition, setLivingLightAudition] = useState(null);
  const livingLightAuditionRef = useRef(null);
  const pendingPlaybackRestoreRef = useRef(null);
  const preparedPlaybackSongIdRef = useRef(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPlaybackReady, setAudioPlaybackReady] = useState(false);
  const [audioPlaybackError, setAudioPlaybackError] = useState("");
  const [audioLoadRetryNonce, setAudioLoadRetryNonce] = useState(0);

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
  const visibleDirectorProjects = useMemo(
    () => filterEchoDirectorProjectRows(directorProjects, searchQuery).sort((left, right) => {
      const song = row => ({ ...audioInventory.songs[row.music_video_project.song_id], id: row.music_video_project.song_id, title: row.music_video_project.song_title });
      return compareEchoSongs(song(left), song(right), songSort);
    }),
    [directorProjects, searchQuery, audioInventory.songs, songSort],
  );

  // ---- Song Card Editions shelf (past mints + awaiting operator confirmation) ----
  const songTitleLookup = useMemo(() => {
    const byId = new Map();
    for (const row of directorProjects) {
      const songId = String(row?.music_video_project?.song_id || "");
      const title = String(row?.music_video_project?.song_title || "");
      if (songId && title) byId.set(songId, title);
    }
    for (const song of gapsReport?.songs || []) {
      const songId = String(song?.id || "");
      const title = String(song?.title || "");
      if (songId && title && !byId.has(songId)) byId.set(songId, title);
    }
    return byId;
  }, [directorProjects, gapsReport?.songs]);

  const resolveSongCardTitle = useCallback((songId) => {
    const id = String(songId || "");
    return songTitleLookup.get(id) || (id ? id.slice(0, 8) : "");
  }, [songTitleLookup]);

  const loadSongCardCatalog = useCallback(async () => {
    setSongCardCatalogLoading(true);
    setSongCardCatalogError("");
    try {
      const response = await fetch(`${API_BASE}/api/song-cards`, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `Song Card catalog request failed (${response.status}).`);
      setSongCardCatalog(payload);
    } catch (caught) {
      setSongCardCatalogError(caught?.message || "The Song Card catalog could not be loaded.");
    } finally {
      setSongCardCatalogLoading(false);
    }
  }, []);

  useEffect(() => { void loadSongCardCatalog(); }, [loadSongCardCatalog]);

  const mintedSongCardRows = useMemo(() => {
    const heads = Array.isArray(songCardCatalog?.heads) ? songCardCatalog.heads : [];
    return heads
      .filter((head) => Number(head?.latestEdition) > 0)
      .map((head) => ({
        songId: String(head?.songId || ""),
        title: head?.title || resolveSongCardTitle(head?.songId),
        latestEdition: Number(head?.latestEdition) || 0,
      }))
      .sort((left, right) => right.latestEdition - left.latestEdition);
  }, [songCardCatalog, resolveSongCardTitle]);

  const awaitingSongCardRows = useMemo(() => {
    const rows = Array.isArray(songCardCatalog?.remintSummary) ? songCardCatalog.remintSummary : [];
    const seen = new Set();
    return rows
      .filter((row) => ["render-ready", "ready-for-mint-review"].includes(String(row?.status || "")))
      .filter((row) => {
        const id = String(row?.songId || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((row) => ({
        songId: String(row.songId),
        title: resolveSongCardTitle(row.songId),
        status: String(row.status),
        predictedEdition: Number(row.predictedEdition) || 0,
      }));
  }, [songCardCatalog, resolveSongCardTitle]);

  function openSongCardEditionSong(songId) {
    if (!songId) return;
    if (typeof onSelectSong === "function") onSelectSong(songId);
    setActiveDirectoryTab("director");
    void handleSelectDirectorProjectSong(songId);
  }
  const activeStoredProject = activeDirectorProject?.music_video_project || null;
  const activeDirectionVariants = Array.isArray(activeStoredProject?.direction_script_variants)
    ? activeStoredProject.direction_script_variants
    : [];
  const activeDirectionVariantGroups = useMemo(
    () => groupEchoDirectionVariants(activeDirectionVariants),
    [activeDirectionVariants],
  );
  const latestDirectionVariantSummary = useMemo(
    () => selectLatestEchoDirectionScriptVariant(activeStoredProject),
    [activeStoredProject],
  );
  const activeDirectionVariant = selectedDirectionVariantId === "legacy"
    ? null
    : activeDirectionVariants.find((variant) => (
      echoDirectionVariantId(variant) === selectedDirectionVariantId
      && Array.isArray(variant.timeline)
    )) || null;
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
    const normalizedProject = attachEchoLyricContract(attachEchoOutputProfile(selectedProject));
    return normalizedProject.hyperframe_script
      ? normalizedProject
      : { ...normalizedProject, hyperframe_script: generateEchoHyperframeScript(normalizedProject), hyperframe_script_stale: false };
  }, [activeDirectionVariant, activeStoredProject, directionWorkingForkActive, workingDirectionFork]);
  const livingLightMediaSources = useMemo(() => livingLightCutMedia(activeProject ? {...activeProject, active_direction_script_variant: {id: activeDirectionVariantSelection}} : null, resolveMediaUri), [activeProject, activeDirectionVariantSelection]);
  const previewTimeline = useMemo(() => applyEchoPreviewProjection(activeProject?.timeline || [], previewProjection,
    { songId: selectedProjectSongId, variantId: activeDirectionVariantSelection, maximumDimension: previewQuality.mediaDimension }),
  [activeProject?.timeline, previewProjection, selectedProjectSongId, activeDirectionVariantSelection, previewQuality.mediaDimension]);
  previewTimelineRef.current = previewTimeline;
  const activeOutputProfile = resolveEchoOutputProfile(activeProject);
  const activeLyricContract = normalizeEchoLyricContract(activeProject);
  const activeLyricSourceText = String(
    activeProject?.lyrics?.text
      || activeProject?.lyrics?.sourceText
      || activeProject?.lyric_source?.text
      || "",
  ).trim();
  const activeLyricTimingMissing = activeLyricContract.enabled
    && !activeLyricSourceText
    && !(Array.isArray(activeProject?.timed_lyrics) && activeProject.timed_lyrics.length);
  const activeLyricTimingPending = activeLyricContract.enabled
    && Boolean(activeLyricSourceText)
    && !(Array.isArray(activeProject?.timed_lyrics) && activeProject.timed_lyrics.length);
  const activeShowGraph = useMemo(() => (
    activeProject?.director_show_graph?.tracks ? projectToEditorGraph(activeProject) : null
  ), [activeProject]);
  const requestedPlaybackAssetId = activeWorkbenchTab === 'living-light' && livingLightAudition?.songId === activeProject?.song_id ? livingLightAudition.assetId : null;
  const selectLivingLightPlayback = assetId => {
    if (!activeProject?.song_id || previewRecordingActiveRef.current) return;
    const next = transitionLivingLightAudition(livingLightAuditionRef.current, {songId:activeProject.song_id,assetId,songSeconds:currentTimeRef.current});
    audioRef.current?.pause(); setIsPlaying(false);
    livingLightAuditionRef.current = next; setLivingLightAudition(next);
    currentTimeRef.current = next.heldSongSeconds;
  };
  useEffect(() => {
    const previous = livingLightAuditionRef.current;
    if (!previous || (previous.songId === activeProject?.song_id && activeWorkbenchTab === 'living-light')) return;
    audioRef.current?.pause(); setIsPlaying(false);
    const next = activeProject?.song_id ? transitionLivingLightAudition(previous, {songId:activeProject.song_id,songSeconds:currentTimeRef.current}) : null;
    livingLightAuditionRef.current = next; setLivingLightAudition(next);
  }, [activeProject?.song_id, activeWorkbenchTab]);
  const preparedAudioRoute = echoProjectAudioRoute(activeProject || {}, activeShowGraph).uri || "";
  const recordingSourceKey = useMemo(() => JSON.stringify([selectedProjectSongId, activeDirectionVariantSelection, preparedAudioRoute, activeShowGraph]), [selectedProjectSongId, activeDirectionVariantSelection, preparedAudioRoute, activeShowGraph]);
  recordingSourceKeyRef.current = recordingSourceKey;
  const activeRecordedSignalReplay = audioVisualMode === "replay" && recordedSignalReplay?.sourceKey === recordingSourceKey ? recordedSignalReplay.replay : null;
  const buildPreviewCaptureIdentity = useCallback(async () => {
    const sourceKey = recordingSourceKey;
    const sourceUri = audioRef.current?.currentSrc;
    if (!sourceUri || !activeShowGraph) throw new Error("Wait for the current song and cut to finish loading.");
    const sha = async bytes => "sha256:" + [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
    const audioBytes = await (await fetch(sourceUri, { signal: AbortSignal.timeout(30000) })).arrayBuffer();
    const identity = { songId: String(selectedProjectSongId), cutId: String(activeDirectionVariantSelection || "current"), audioUri: preparedAudioRoute,
      graphSha256: await sha(new TextEncoder().encode(sourceKey)), audioSha256: await sha(audioBytes) };
    if (recordingSourceKeyRef.current !== sourceKey || audioRef.current?.currentSrc !== sourceUri) throw new Error("The song or cut changed while preparing the capture.");
    return identity;
  }, [recordingSourceKey, selectedProjectSongId, activeDirectionVariantSelection, preparedAudioRoute, activeShowGraph]);
  const loadPreviewRecordedSignals = async recording => {
    const sourceKey = recordingSourceKey;
    try {
      await ensureEchoPreviewRecordingLocalSession(API_BASE);
      const response = await fetch(`${API_BASE}/api/echo/preview-recordings/${encodeURIComponent(recording.id)}/signals`, { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || "Recorded signals could not be loaded.");
      const identity = await buildPreviewCaptureIdentity();
      const replay = createEchoPreviewSignalReplay(value, identity);
      if (recordingSourceKeyRef.current !== sourceKey) throw new Error("Select the recorded song and cut before loading its signals.");
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = replay.startSeconds;
      currentTimeRef.current = replay.startSeconds; setCurrentTime(replay.startSeconds); setIsPlaying(false);
      setRecordedSignalReplay({ sourceKey, replay, recordingId: recording.id }); setAudioVisualMode("replay"); setActiveWorkbenchTab("preview"); setPreviewRecordingsError("");
    } catch (error) { setPreviewRecordingsError(`Signals were not loaded: ${error.message}`); }
  };
  const preparedAudioKey = `${selectedProjectSongId || ""}:${activeDirectionVariantSelection}:${preparedAudioRoute}`;
  useEffect(() => {
    if (!selectedProjectSongId || !preparedAudioRoute || audioVisualMode !== "prepared") return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let cancelled = false;
    setPreparedAudio({ status: "loading", key: preparedAudioKey, value: null });
    fetch(`${API_BASE}/api/echos/music-performance?songId=${encodeURIComponent(selectedProjectSongId)}&variantId=${encodeURIComponent(activeDirectionVariantSelection)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Prepared audio is unavailable.");
        if (body.audioUri !== preparedAudioRoute) throw new Error("Prepared audio belongs to a different playback source.");
        if (!cancelled) setPreparedAudio({ status: "ready", key: preparedAudioKey, value: body.performance });
      }).catch(error => {
        if (!cancelled) setPreparedAudio({ status: "unavailable", key: preparedAudioKey, value: null, message: error.name === "AbortError" ? "Prepared audio load timed out. Retry when ready." : error.message });
      }).finally(() => clearTimeout(timeout));
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [preparedAudioKey, preparedAudioRetry, audioVisualMode]);
  const activePreparedPerformance = audioVisualMode === "prepared" && preparedAudio.status === "ready" && preparedAudio.key === preparedAudioKey ? preparedAudio.value : null;
  useEffect(() => { setVisualSignalSolo({ key: preparedAudioKey, role: "" }); }, [preparedAudioKey, audioVisualMode]);
  const visualSignalRoles = useMemo(() => echoVisualSignalIsolation(activePreparedPerformance).availableRoles, [activePreparedPerformance]);
  const activeVisualSignalSolo = activePreparedPerformance && visualSignalSolo.key === preparedAudioKey
    && (visualSignalSolo.role === "__silence__" || visualSignalRoles.includes(visualSignalSolo.role)) ? visualSignalSolo.role : "";
  const visualSignalIsolation = useMemo(() => echoVisualSignalIsolation(activePreparedPerformance, activeVisualSignalSolo), [activePreparedPerformance, activeVisualSignalSolo]);
  // Score Dust: whole-song structure from the Audio Atlas (prepared performance
  // second), an editable direction, and per-frame reflexes in the canvas loop.
  // Ingress: a cue can name Score Dust, or the preview toggle shows it over any
  // Song without editing the Director cut (it is not final-render ready).
  const [scoreDustPreview, setScoreDustPreview] = useState(false);
  const scoreDustPreviewRef = useRef(false);
  useEffect(() => { scoreDustPreviewRef.current = scoreDustPreview; }, [scoreDustPreview]);
  const usesScoreDust = useMemo(() => scoreDustPreview || (activeProject?.visualizer_timeline || []).some((item) => item?.visualizer_id === "builtin:score-dust"), [activeProject, scoreDustPreview]);
  const scoreDust = useEchoScoreDust({
    enabled: usesScoreDust, songId: selectedProjectSongId, apiBase: API_BASE, preparedPerformance: activePreparedPerformance,
    lyricLines: Array.isArray(activeProject?.timed_lyrics) ? activeProject.timed_lyrics : null, lyricAudioHash: activeProject?.lyrics?.audioHash || null,
    durationSeconds: Number(activeProject?.duration) || 600, resolveUri: resolveMediaUri,
  });
  const scoreDustRef = useRef({ key: "", playback: null, settings: null, source: "reflex-only" });
  useEffect(() => {
    scoreDustRef.current = { key: scoreDust.playbackKey, playback: scoreDust.playback, settings: scoreDust.settings, source: scoreDust.source };
  }, [scoreDust.playbackKey, scoreDust.playback, scoreDust.settings, scoreDust.source]);
  const preparedBindingsKey = JSON.stringify(activeShowGraph?.directorV2?.modulationBindings || []);
  const preparedModulationResult = useMemo(() => {
    if (!activePreparedPerformance || preparedBindingsKey === "[]") return { timeline: null, error: null };
    try {
      return { timeline: prepareDirectorModulationTimeline(JSON.parse(preparedBindingsKey), {
        durationSeconds: activePreparedPerformance.durationSeconds, fps: 60, sourceFingerprint: activePreparedPerformance.fingerprint,
        sampleSignals: time => {
          const values = evaluateEchoMusicPerformance(activePreparedPerformance, time);
          return { ...values, cues: { phrase_boundary: values.activeEvents.some(event => ["phrase-end", "phrase-start"].includes(event.kind)) ? 1 : 0 } };
        },
      }), error: null };
    } catch (error) { return { timeline: null, error: error.message }; }
  }, [activePreparedPerformance, preparedBindingsKey]);
  const diagnosticPreparedModulation = useMemo(() => isolateEchoPreparedModulation(preparedModulationResult.timeline, activeVisualSignalSolo), [preparedModulationResult.timeline, activeVisualSignalSolo]);
  const activeShowGraphVisualizerCardsById = useMemo(() => new Map(
    activeShowGraph?.tracks
      ? activeShowGraph.tracks.flatMap((track) => track.cards || []).map((card) => [card.id, card])
      : [],
  ), [activeShowGraph]);
  const activeDirectorPreviewSource = useMemo(() => {
    if (!activeProject?.timeline) return null;
    const activeCutId = activeProject.active_direction_script_variant?.id
      || activeProject.activeDirectionScriptVariant?.id
      || "";
    try {
      return selectEchoDirectorPreviewSource(activeProject, activeCutId
        ? { variantId: activeCutId }
        : { variantId: "legacy-baseline", allowLegacyFallback: true });
    } catch {
      return null;
    }
  }, [activeProject]);
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
    const observer = presentationObserverRef.current;
    if (observer?.element !== presented?.element || observer?.sourceKey !== presented?.sourceKey) {
      observer?.stop();
      presentationObserverRef.current = null;
      presentationSampleRef.current = null;
      if (presented?.kind === "video" && presented.element && presented.shot) {
        const stop = observeEchoPresentedFrames({
          video: presented.element,
          getContext: () => ({ audio: audioRef.current, context: audioContextRef.current, shot: presentedMediaRef.current?.shot || {} }),
          onSample: (sample) => {
            presentationSampleRef.current = { element: presented.element, sourceKey: presented.sourceKey,
              advancing: !presented.element.paused && !presented.element.seeking, sample };
            presentationTimingRef.current.record(sample);
            if (sample.nowMs - presentationPublishAtRef.current >= 1000) {
              presentationPublishAtRef.current = sample.nowMs;
              globalThis.__HAPA_ECHO_PRESENTATION_TIMING__ = presentationTimingRef.current.snapshot();
            }
          },
        });
        presentationObserverRef.current = { element: presented.element, sourceKey: presented.sourceKey, stop };
      }
    }
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

  useEffect(() => {
    if (!isPlaying) globalThis.__HAPA_ECHO_PRESENTATION_TIMING__ = presentationTimingRef.current.snapshot();
  }, [isPlaying]);

  useEffect(() => () => {
    presentationObserverRef.current?.stop();
    presentationObserverRef.current = null;
  }, []);

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
    const engine = echoPlaybackEngineRef.current;
    const nextSong = String(activeProject?.song_id || activeProject?.id || activeProject?.song_title || "");
    const sameSong = Boolean(nextSong && engine?.getSnapshot().projectKey === nextSong);
    engine?.setProject(activeProject, {
      preserveClock: sameSong,
      atSeconds: sameSong ? (audioPlaybackReceiptRef.current?.sourceSelection?.kind === 'stem' ? currentTimeRef.current : audioRef.current?.currentTime ?? currentTimeRef.current) : 0,
    });
  }, [activeProject]);

  useEffect(() => {
    echoPlaybackEngineRef.current?.setPowerMode(powerMode);
  }, [powerMode]);

  useEffect(() => {
    echoPlaybackEngineRef.current?.setPlaying(isPlaying && !requestedPlaybackAssetId);
  }, [isPlaying, requestedPlaybackAssetId]);

  // Prepare source-bound PCM and stream it through the CORS-enabled local file owner.
  // Keep the existing audio element/clock; no large WAV blob or source replacement.
  useEffect(() => {
    if (!activeProject?.song_id) {
      setAudioBlobUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return "";
      });
      setAudioLoading(false);
      setAudioPlaybackReady(false);
      setAudioPlaybackError("");
      return;
    }
    
    let active = true;
    audioRef.current?.pause(); setIsPlaying(false);
    const visitSeek=livingLightSeekRef.current?.songId===activeProject.song_id&&!requestedPlaybackAssetId?livingLightSeekRef.current:null;
    const sourcePosition = visitSeek?visitSeek.timeSeconds:!requestedPlaybackAssetId && preparedPlaybackSongIdRef.current === activeProject.song_id ? currentTimeRef.current : 0;
    if(visitSeek)livingLightSeekRef.current=null;
    preparedPlaybackSongIdRef.current = activeProject.song_id;
    pendingPlaybackRestoreRef.current = {songId:activeProject.song_id,assetId:requestedPlaybackAssetId,seconds:sourcePosition};
    setAudioLoading(true);
    setAudioPlaybackReady(false);
    setAudioPlaybackError("");
    setAudioBlobUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return "";
    });
    setAudioPlaybackReceipt(null);
    audioPlaybackReceiptRef.current = null;
    if (masterPlaybackReceiptRef.current?.songId !== activeProject.song_id) masterPlaybackReceiptRef.current = null;
    setAudioDiagnostics("Preparing audio for precise seeking…");
    
    const audioRoute = echoProjectAudioRoute(activeProject);
    const url = resolveSongRegistryUri(audioRoute.uri);

    if (!url && !requestedPlaybackAssetId) {
      setAudioLoading(false);
      setAudioPlaybackError("This song does not have a playback audio route. Update the Song Registry, then retry.");
      setAudioDiagnostics("Fetch error: no playback audio route");
      return () => {
        active = false;
      };
    }
    
    const controller = new AbortController();
    prepareEchoAudioPlayback({ apiBase: API_BASE, songId: activeProject.song_id, variantId: activeDirectionVariantSelection,
      sourceUri: audioRoute.uri, assetId:requestedPlaybackAssetId, signal: controller.signal, onProgress: message => { if (active) setAudioDiagnostics(message); } })
      .then(({ url: playbackUrl, receipt }) => {
        if (!active) return;
        setAudioPlaybackReceipt(receipt);
        audioPlaybackReceiptRef.current = receipt;
        if (!requestedPlaybackAssetId) masterPlaybackReceiptRef.current = {songId:activeProject.song_id,receipt};
        setAudioBlobUrl(playbackUrl);
        setAudioLoading(false);
        setAudioPlaybackError("");
        setAudioDiagnostics("Audio ready · precise seeking");
      })
      .catch(err => {
        if (!active) return;
        setAudioLoading(false);
        setAudioPlaybackReady(false);
        setAudioPlaybackError(`Playback audio could not be loaded (${err.message || "request failed"}). Click Retry audio.`);
        setAudioDiagnostics(`Fetch error: ${err.message}`);
        console.error("Failed to prepare playback audio:", err);
      });
      
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeProject?.audio_id,
    activeProject?.registry_track_id,
    activeProject?.song_id,
    activeShowGraph?.song?.audioPath,
    audioLoadRetryNonce,
    requestedPlaybackAssetId,
  ]);

  const retryPreviewAudio = useCallback(() => {
    if (previewRecordingActiveRef.current) return;
    setAudioPlaybackError("");
    setAudioPlaybackReady(false);
    setAudioDiagnostics("Retrying playback audio...");
    setAudioLoadRetryNonce((current) => current + 1);
  }, []);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      setAudioBlobUrl(current => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return "";
      });
    };
  }, []);

  const initAudioAnalyser = () => {
    if (!audioRef.current) {
      setAudioDiagnostics("No Audio Element Ref");
      return false;
    }
    if (connectedAudioRef.current === audioRef.current) {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        setAudioDiagnostics("Resuming existing context");
        audioContextRef.current.resume().catch((err) => setAudioDiagnostics("Failed resume: " + err.message));
      } else {
        setAudioDiagnostics(`Connected (existing, state: ${audioContextRef.current?.state})`);
      }
      return true;
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
      return true;
    } catch (e) {
      console.warn("Failed to init audio analyser:", e);
      setAudioDiagnostics(`Init Error: ${e.message || String(e)}`);
      return false;
    }
  };

  // ---- Director Preview quick capture engine ----
  //
  // The capture composites exactly what the operator sees in the preview
  // frame (presented media with its camera framing + the shader canvas) into
  // an offscreen canvas at the output profile's resolution, captures that
  // canvas stream, taps the existing Web Audio analyser graph for the audio
  // track, and records the combined stream with MediaRecorder. The telemetry
  // HUD stays excluded; visible lyrics are painted from the exact Preview
  // lyric frame and measured layout when the Lyrics control is on.
  //
  // Stopping uploads the blob to /api/echo/preview-recordings (quick-capture
  // storage, no minting pipeline). If the upload fails, the blob is saved as
  // a local download so the capture is never silently dropped.
  const livingLightRecordingRef = useRef(null);
  const previewRecordingStagingCanvasRef = useRef(null);
  const livingLightRecordingWaitRef = useRef(null);
  const livingLightRecordingPausedMsRef = useRef(0);
  const releasePreviewRecordingResources = () => {
    livingLightRecordingRef.current?.stop();
    livingLightRecordingWaitRef.current=null;
    livingLightRecordingPausedMsRef.current=0;
    if (previewRecordingRafRef.current) {
      globalThis.cancelAnimationFrame(previewRecordingRafRef.current);
      previewRecordingRafRef.current = 0;
    }
    const tap = previewRecordingAudioTapRef.current;
    if (tap) {
      previewRecordingAudioTapRef.current = null;
      try { if (tap.dest) tap.dest.disconnect(); } catch { /* context may already be closed */ }
      try { tap.stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* track already stopped */ } }); } catch { /* stream gone */ }
    }
    try { previewRecordingStreamRef.current?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* track already stopped */ } }); } catch { /* stream gone */ }
    previewRecordingStreamRef.current = null;
    const ended = previewRecordingEndedRef.current;
    if (ended) {
      previewRecordingEndedRef.current = null;
      try { ended.element.removeEventListener("ended", ended.onEnded); } catch { /* element gone */ }
    }
    if (previewRecordingDownloadUrlRef.current) {
      URL.revokeObjectURL(previewRecordingDownloadUrlRef.current);
      previewRecordingDownloadUrlRef.current = "";
    }
    previewRecordingChunksRef.current = [];
    previewSignalCaptureRef.current = null;
    previewCaptureContextRef.current = null;
    previewRecordingSessionRef.current = null;
    previewRecordingCanvasRef.current = null;
    if(previewRecordingStagingCanvasRef.current){previewRecordingStagingCanvasRef.current.width=0;previewRecordingStagingCanvasRef.current.height=0;}
    previewRecordingStagingCanvasRef.current=null;
    previewRecordingActiveRef.current = false;
    previewRecordingStartingRef.current = false;
  };

  const acquirePreviewRecordingAudioTrack = async () => {
    const audioElement = audioRef.current;
    if (audioPlaybackError) {
      throw new Error(audioPlaybackError);
    }
    if (!audioElement || audioLoading || !audioPlaybackReady || Number(audioElement.readyState || 0) < 2) {
      throw new Error("Audio is still buffering. Wait for Record + Play to become ready.");
    }
    if (!initAudioAnalyser()) {
      throw new Error("The playback audio route could not be connected to the recorder.");
    }
    const context = audioContextRef.current;
    const analyser = analyserNodeRef.current;
    if (!context || !analyser || connectedAudioRef.current !== audioElement || context.state === "closed") {
      throw new Error("The recorder is not connected to the current playback audio.");
    }
    if (context.state !== "running") await context.resume();
    if (context.state !== "running") {
      throw new Error(`Playback audio could not start (AudioContext: ${context.state}).`);
    }
    const destination = context.createMediaStreamDestination();
    analyser.connect(destination);
    const track = destination.stream.getAudioTracks()[0] || null;
    if (!track || track.readyState === "ended") {
      try { destination.disconnect(); } catch { /* destination was never live */ }
      throw new Error("The playback audio route did not produce a live recording track.");
    }
    previewRecordingAudioTapRef.current = {
      dest: destination,
      stream: destination.stream,
      track,
      audioElement,
    };
    return track;
  };

  const compositePreviewRecordingFrame = () => {
    const canvas = previewRecordingStagingCanvasRef.current;
    const output = previewRecordingCanvasRef.current;
    const context = canvas?.getContext?.("2d");
    if (!canvas || !context) return;
    const width = canvas.width;
    const height = canvas.height;
    const audio = audioRef.current;
    const t = audio && !audio.paused
      ? Number(audio.currentTime || currentTimeRef.current)
      : currentTimeRef.current;
    const project = activeProjectRef.current || activeProject;
    const timeline = previewTimelineRef.current;
    const playheadShotIndex = timeline.findIndex((item) => t >= item.start_sec && t < item.end_sec);
    const currentTimelineItem = playheadShotIndex !== -1 && playheadShotIndex !== undefined
      ? timeline[playheadShotIndex]
      : timeline[0];
    const projected = activeDirectorPreviewSourceRef.current
      ? projectEchoDirectorPreviewFrame({
        source: activeDirectorPreviewSourceRef.current,
        timeSeconds: t,
        playing: Boolean(audio && !audio.paused && !audio.ended),
        shaderTypeResolver: shaderTypeResolverRef.current,
      })
      : null;
    const cameraDirectedItem = currentTimelineItem && projected?.camera
      ? {
        ...currentTimelineItem,
        camera_motion: projected.camera.motion,
        camera_intensity: projected.camera.intensity,
        ...(projected.camera.speed === null ? {} : { camera_speed: projected.camera.speed }),
      }
      : currentTimelineItem;
    const binding = resolvePresentedEchoMediaBinding(
      directorPreviewFullscreenRef.current,
      currentTimelineItem,
      presentedMediaRef.current
    );
    const element = binding?.element || null;
    const elementReady = element
      ? (element.tagName === "VIDEO"
        ? Number(element.readyState || 0) >= 2
        : Boolean(element.complete) && Number(element.naturalWidth || 0) > 0)
      : false;
    let mediaDrawn = false;
    if (element && elementReady) {
      const keyframe = echoCameraKeyframeAt(activeShowGraphRef.current?.directorV2?.cameraKeyframes, t);
      mediaDrawn = Boolean(drawEchoCameraFramedMediaInput({
        canvas,
        mediaElement: element,
        shot: cameraDirectedItem,
        timeSeconds: t,
        shotIndex: Number.isInteger(playheadShotIndex) ? playheadShotIndex : 0,
        cameraCrop: projected?.camera?.keyframe?.crop || keyframe?.crop || null,
        outputWidth: width,
        outputHeight: height,
      }));
    }
    if (!mediaDrawn) {
      context.fillStyle = "#020617";
      context.fillRect(0, 0, width, height);
    }
    const shaderCanvas = canvasRef.current;
    if (shaderCanvas && Number(shaderCanvas.width || 0) > 0) {
      try { context.drawImage(shaderCanvas, 0, 0, width, height); } catch { /* shader layer unavailable */ }
    }
    if(project?.living_light_cues?.length){
      const source=livingLightRecordingRef.current;
      if(!source)throw Error('The Living Light capture surface is unavailable.');
      source.draw(context,t,width,height);
    }
    echoLyricPresentationRef.current?.(t);
    paintEchoLyricSurfaceToCanvas(context, echoLyricCaptureSurfaceRef.current, { width, height });
    // Commit only complete pictures; a waiting Journey must never expose its underlying shot.
    output.getContext("2d").drawImage(canvas,0,0,width,height);
  };

  const startPreviewRecordingComposite = () => {
    if (previewRecordingRafRef.current) globalThis.cancelAnimationFrame(previewRecordingRafRef.current);
    const loop = () => {
      if (!previewRecordingActiveRef.current) return;
      try {
        compositePreviewRecordingFrame();
        const waiting=livingLightRecordingWaitRef.current;
        if(waiting){
          livingLightRecordingPausedMsRef.current+=performance.now()-waiting.startedAt;
          livingLightRecordingWaitRef.current=null;
          const recorder=previewRecordingSessionRef.current?.recorder;
          if(recorder?.state==='paused')recorder.resume();
          if(waiting.resumeAudio)audioRef.current?.play().then(()=>setIsPlaying(true)).catch(error=>{
            previewRecordingFailureMessageRef.current='Incomplete take: '+error.message;
            void stopPreviewRecording();
          });
          setAudioDiagnostics('Living Light frame ready; capture resumed');
        }
      } catch (error) {
        if(activeProjectRef.current?.living_light_cues?.length){
          let waiting=livingLightRecordingWaitRef.current;
          if(error.code==='living_light_capture_waiting'&&(!waiting||performance.now()-waiting.startedAt<15000)){
            if(!waiting){
              const audio=audioRef.current;
              waiting={startedAt:performance.now(),resumeAudio:!!audio&&!audio.paused};
              livingLightRecordingWaitRef.current=waiting;
              const recorder=previewRecordingSessionRef.current?.recorder;
              if(recorder?.state==='recording')recorder.pause();
              if(audio){audio.pause();currentTimeRef.current=audio.currentTime;setCurrentTime(audio.currentTime);}
              setIsPlaying(false);setAudioDiagnostics('Waiting for the exact Living Light picture; capture and song paused');
            }
          }else{
            previewRecordingFailureMessageRef.current='Incomplete take: '+(error.message||'Living Light frame failed.');
            audioRef.current?.pause();setIsPlaying(false);void stopPreviewRecording();return;
          }
        }
      }
      previewRecordingRafRef.current = globalThis.requestAnimationFrame(loop);
    };
    previewRecordingRafRef.current = globalThis.requestAnimationFrame(loop);
  };

  const refreshPreviewRecordings = useCallback(async () => {
    try {
      // Admin-gated route: establish the trusted-local-UI session first.
      // A failed bootstrap (remote access) is swallowed so the original
      // route error is the one the operator sees.
      await ensureEchoPreviewRecordingLocalSession(API_BASE).catch(() => {});
      const response = await fetch(`${API_BASE}/api/echo/preview-recordings`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `preview recording list failed: ${response.status}`);
      setPreviewRecordings(Array.isArray(payload.recordings) ? payload.recordings : []);
      setPreviewRecordingsError("");
    } catch (error) {
      setPreviewRecordings([]);
      setPreviewRecordingsError(String(error?.message || error || "preview recording list failed"));
    }
  }, []);

  const deletePreviewRecording = useCallback(async (id) => {
    const recordingId = String(id || "").trim();
    if (!recordingId) return;
    setPreviewRecordings((current) => (current ? current.filter((row) => row.id !== recordingId) : current));
    try {
      await ensureEchoPreviewRecordingLocalSession(API_BASE).catch(() => {});
      const response = await fetch(`${API_BASE}/api/echo/preview-recordings/${encodeURIComponent(recordingId)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `delete failed: ${response.status}`);
    } catch (error) {
      setPreviewRecordingsError(String(error?.message || error || "delete failed"));
      refreshPreviewRecordings();
    }
  }, [refreshPreviewRecordings]);

  const stopPreviewRecording = useCallback(async () => {
    if (!previewRecordingActiveRef.current) return;
    const failureMessage = String(previewRecordingFailureMessageRef.current || "").trim();
    const capturePausedMs=livingLightRecordingPausedMsRef.current+(livingLightRecordingWaitRef.current?performance.now()-livingLightRecordingWaitRef.current.startedAt:0);
    previewRecordingFailureMessageRef.current = "";
    const session = previewRecordingSessionRef.current;
    const capturedContext = previewCaptureContextRef.current;
    const capturedSignals = previewSignalCaptureRef.current?.finish() || null;
    const downloadSignals = () => {
      if (!capturedSignals) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(capturedSignals)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `echo-signals-${capturedContext.identity.cutId}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    setPreviewRecordingState("saving");
    if (previewRecordingRafRef.current) {
      globalThis.cancelAnimationFrame(previewRecordingRafRef.current);
      previewRecordingRafRef.current = 0;
    }
    const ended = previewRecordingEndedRef.current;
    if (ended) {
      previewRecordingEndedRef.current = null;
      try { ended.element.removeEventListener("ended", ended.onEnded); } catch { /* element gone */ }
    }
    let result = { state: "stopped", durationMs: 0, blob: null, error: "no_recorder_session" };
    try {
      result = await session.stop({
        buildResultBlob: () => {
          const recorder = session.recorder;
          const mimeType = String(recorder?.mimeType || "")
            || pickEchoPreviewRecordingMimeType((candidate) => globalThis.MediaRecorder?.isTypeSupported?.(candidate))
            || "video/webm";
          const contentType = mimeType.split(";")[0].trim();
          return new (globalThis.Blob)(previewRecordingChunksRef.current, { type: contentType });
        },
        timeoutMs: 4000,
      });
    } catch (error) {
      result = { state: "error", durationMs: 0, blob: null, error: String(error?.message || error) };
    }
    result.durationMs=Math.max(0,Number(result.durationMs||0)-capturePausedMs);
    let blob = result.blob;
    // Auto-stop at the duration ceiling can finish before this call; the
    // blob may not have been assembled yet, so rebuild it from the chunks.
    if ((!blob || !Number(blob.size || 0)) && previewRecordingChunksRef.current.length) {
      const recorder = session.recorder;
      const mimeType = String(recorder?.mimeType || "")
        || pickEchoPreviewRecordingMimeType((candidate) => globalThis.MediaRecorder?.isTypeSupported?.(candidate))
        || "video/webm";
      blob = new (globalThis.Blob)(previewRecordingChunksRef.current, { type: mimeType.split(";")[0].trim() });
    }
    releasePreviewRecordingResources();
    setPreviewRecordingElapsedMs(0);
    if (!blob || !Number(blob.size || 0)) {
      setPreviewRecordingError("The capture produced no media data. Try again with playback running.");
      setPreviewRecordingState("error");
      return;
    }
    const metadataParams = new URLSearchParams();
    const songId = String(capturedContext?.metadata.songId || "");
    const songTitle = String(capturedContext?.metadata.songTitle || "");
    if (songId) metadataParams.set("songId", songId);
    if (songTitle) metadataParams.set("songTitle", songTitle);
    metadataParams.set("projectTitle", capturedContext?.metadata.projectTitle || "");
    metadataParams.set("orientation", capturedContext?.metadata.orientation || "");
    metadataParams.set("width", String(capturedContext?.metadata.width || 0));
    metadataParams.set("height", String(capturedContext?.metadata.height || 0));
    if (capturedContext?.identity) metadataParams.set("captureIdentity", JSON.stringify(capturedContext.identity));
    metadataParams.set("captureStatus", failureMessage ? "incomplete" : "complete");
    metadataParams.set("captureFailure", failureMessage);
    metadataParams.set("cutId", capturedContext?.metadata.cutId || "");
    metadataParams.set("fps", String(ECHO_PREVIEW_RECORD_FPS));
    metadataParams.set("durationMs", String(Math.round(result.durationMs || 0)));
    let uploaded = null;
    let uploadFailure = "";
    try {
      await ensureEchoPreviewRecordingLocalSession(API_BASE).catch(() => {});
      const response = await fetch(`${API_BASE}/api/echo/preview-recordings?${metadataParams.toString()}`, {
        method: "POST",
        headers: { "Content-Type": String(blob.type || "video/webm") },
        body: blob,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `upload failed: ${response.status}`);
      uploaded = payload.recording || null;
    } catch (error) {
      uploadFailure = String(error?.message || error || "upload failed");
    }
    let signalNotice = "";
    if (uploaded && capturedSignals) {
      try {
        const response = await fetch(`${API_BASE}/api/echo/preview-recordings/${encodeURIComponent(uploaded.id)}/signals`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(capturedSignals) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Signal upload failed.");
        uploaded = payload.recording;
        if (capturedSignals.status !== "complete") signalNotice = `Video saved; signal capture is incomplete (${capturedSignals.reason}).`;
      } catch (error) { signalNotice = `Video saved; signals could not be saved (${error.message}). Signal JSON downloaded separately.`; downloadSignals(); }
    }
    if (uploaded) {
      setPreviewRecordingLastId(String(uploaded.id || ""));
      setPreviewRecordingError(failureMessage || signalNotice);
      setPreviewRecordingState(failureMessage || signalNotice ? "error" : "idle");
      setPreviewRecordings((current) => (current ? [uploaded, ...current] : [uploaded]));
      refreshPreviewRecordings();
      return;
    }
    // Upload failed: hand the operator the file locally so the capture
    // survives. The clip is otherwise unrecoverable once the page unloads.
    downloadSignals();
    const objectUrl = URL.createObjectURL(blob);
    previewRecordingDownloadUrlRef.current = objectUrl;
    const anchor = globalThis.document.createElement("a");
    anchor.href = objectUrl;
    const priorTakeNumbers = (previewRecordings || [])
      .filter((recording) => String(recording.songId || recording.songTitle || "") === (songId || songTitle))
      .map((recording) => Number(recording.recordingNumber || 0))
      .filter((value) => Number.isInteger(value) && value > 0);
    anchor.download = echoPreviewRecordingFileName({
      songTitle: songTitle || capturedContext?.metadata.projectTitle,
      recordingNumber: Math.max(priorTakeNumbers.length, ...priorTakeNumbers, 0) + 1,
      durationMs: result.durationMs,
      createdAt: new Date(),
      mimeType: blob.type,
    });
    globalThis.document.body?.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setPreviewRecordingError(`The capture could not be saved to the Builder (${uploadFailure}). A local download was started instead.`);
    setPreviewRecordingState("error");
  }, [activeOutputProfile, activeProject, previewRecordings, refreshPreviewRecordings, selectedProjectSongId]);

  const startPreviewRecording = useCallback(async () => {
    if (previewRecordingActiveRef.current || previewRecordingStartingRef.current) return;
    if (activeVisualSignalSolo) { setPreviewRecordingError("Restore all visual signals before recording."); return; }
    previewRecordingStartingRef.current = true;
    setPreviewRecordingError("");
    setPreviewRecordingState("preparing");
    let session = null;
    let sessionStarted = false;
    try {
      if (typeof globalThis.MediaRecorder === "undefined") {
        throw new Error("This browser cannot record the preview (MediaRecorder unavailable). Safari on macOS 13 or Chrome/Edge is required.");
      }
      const probeCanvas = globalThis.document.createElement("canvas");
      if (typeof probeCanvas.captureStream !== "function") {
        throw new Error("This browser cannot capture the preview canvas (captureStream unavailable).");
      }
      const project = activeProjectRef.current || activeProject;
      if(project?.living_light_cues?.length){
        const source=livingLightRecordingRef.current;
        if(!source)throw Error('Open Preview and wait for the saved Living Light scene before recording.');
        source.start();
        probeCanvas.width=16;probeCanvas.height=16;
        source.draw(probeCanvas.getContext('2d'),Number(audioRef.current?.currentTime??currentTimeRef.current),16,16);
      }
      const timeline = project?.timeline || [];
      const playhead = Number(currentTimeRef.current || 0);
      const currentItem = timeline.find((item) => playhead >= item.start_sec && playhead < item.end_sec) || timeline[0];
      if (shotMediaType(currentItem) === "video" && !previewBufferState.ready) {
        throw new Error("Video is still buffering. Wait for the preview buffer to become ready.");
      }

      const audioElement = audioRef.current;
      const audioTrack = await acquirePreviewRecordingAudioTrack();
      const identity = (project?.living_light_cues?.length || (audioVisualMode === "live" && captureLiveSignals)) ? await buildPreviewCaptureIdentity() : null;
      const output = activeOutputProfile;
      previewCaptureContextRef.current = { identity, sourceKey: recordingSourceKey, mode: audioVisualMode, metadata: {
        cutId: activeDirectionVariantSelection, songId: String(selectedProjectSongId || project.song_id || project.id || ""), songTitle: project.song_title || "", projectTitle: project.title || "", orientation: output.id, width: output.width, height: output.height,
      } };
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = Math.max(320, Number(output?.width || 1280));
      canvas.height = Math.max(320, Number(output?.height || 720));
      previewRecordingCanvasRef.current = canvas;
      const staging=globalThis.document.createElement("canvas");staging.width=canvas.width;staging.height=canvas.height;previewRecordingStagingCanvasRef.current=staging;
      compositePreviewRecordingFrame();
      const videoTracks = canvas.captureStream(ECHO_PREVIEW_RECORD_FPS).getVideoTracks();
      if (!videoTracks.length) throw new Error("The preview canvas did not produce a live video track.");
      const stream = new (globalThis.MediaStream)([...videoTracks, audioTrack]);
      if (stream.getAudioTracks().length !== 1) {
        throw new Error("The recorder could not attach the playback audio track.");
      }
      previewRecordingStreamRef.current = stream;
      const mimeType = pickEchoPreviewRecordingMimeType((candidate) => globalThis.MediaRecorder.isTypeSupported(candidate));
      const recorder = new (globalThis.MediaRecorder)(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE,
        audioBitsPerSecond: ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE,
      });
      previewRecordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event?.data && Number(event.data.size || 0) > 0) previewRecordingChunksRef.current.push(event.data);
      };
      session = createEchoPreviewRecordingSession({
        recorder,
        maxDurationMs: ECHO_PREVIEW_RECORD_MAX_DURATION_MS,
        onTick: (elapsedMs) => setPreviewRecordingElapsedMs(elapsedMs),
        onAutoStop: () => { stopPreviewRecording(); },
      });
      previewRecordingSessionRef.current = session;
      if (!audioElement.paused) audioElement.pause();
      previewRecordingActiveRef.current = true;
      if (audioVisualMode === "live" && captureLiveSignals) previewSignalCaptureRef.current = createEchoPreviewSignalCapture({ identity });
      session.start(ECHO_PREVIEW_RECORD_TIMESLICE_MS);
      sessionStarted = true;
      startPreviewRecordingComposite();
      await audioElement.play();
      currentTimeRef.current = Number(audioElement.currentTime || currentTimeRef.current);
      setCurrentTime(currentTimeRef.current);
      setIsPlaying(true);
      const onEnded = () => { stopPreviewRecording(); };
      audioElement.addEventListener("ended", onEnded);
      previewRecordingEndedRef.current = { element: audioElement, onEnded };
      previewRecordingStartingRef.current = false;
      setPreviewRecordingElapsedMs(0);
      setPreviewRecordingState("recording");
      setAudioDiagnostics("Recording and playback started together");
    } catch (error) {
      if (sessionStarted && session) {
        try { await session.stop({ timeoutMs: 1000 }); } catch { /* discard failed startup */ }
      }
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
      setIsPlaying(false);
      releasePreviewRecordingResources();
      setPreviewRecordingError(`Recording did not start: ${String(error?.message || error)}`);
      setPreviewRecordingState("error");
    }
  }, [activeOutputProfile, activeProject, audioLoading, audioPlaybackError, audioPlaybackReady, previewBufferState.ready, stopPreviewRecording, activeVisualSignalSolo, buildPreviewCaptureIdentity, recordingSourceKey, audioVisualMode, captureLiveSignals]);

  useEffect(() => {
    const context = previewCaptureContextRef.current;
    if (previewRecordingActiveRef.current && context && (context.sourceKey !== recordingSourceKey || context.mode !== audioVisualMode)) {
      previewSignalCaptureRef.current?.invalidate("source-or-mode-changed");
      previewRecordingFailureMessageRef.current = "Capture stopped because its song, cut, or signal mode changed.";
      stopPreviewRecording();
    }
  }, [recordingSourceKey, audioVisualMode, stopPreviewRecording]);

  // Load the recording shelf once on mount.
  useEffect(() => {
    refreshPreviewRecordings();
  }, [refreshPreviewRecordings]);

  // The preview surface unmounts on tab/power changes; a live capture would
  // otherwise record black frames, so finish (and upload) the clip instead.
  useEffect(() => {
    if ((!["preview", "variation"].includes(activeWorkbenchTab) || powerMode === "hidden") && previewRecordingActiveRef.current) {
      stopPreviewRecording();
    }
  }, [activeWorkbenchTab, powerMode, stopPreviewRecording]);

  // A song change remounts the media elements; finish the capture first.
  useEffect(() => {
    if (previewRecordingActiveRef.current) stopPreviewRecording();
  }, [selectedProjectSongId, stopPreviewRecording]);

  // A refreshed Blob URL remounts the <audio> element. Never let capture keep
  // running against the detached element and quietly turn into a silent file.
  useEffect(() => {
    const capturedElement = previewRecordingAudioTapRef.current?.audioElement || null;
    if (previewRecordingActiveRef.current && capturedElement && audioRef.current !== capturedElement) {
      previewRecordingFailureMessageRef.current = "Playback audio changed during recording. Capture stopped before it could continue silently.";
      void stopPreviewRecording();
    }
  }, [audioBlobUrl, stopPreviewRecording]);

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
    { id: "builtin:score-dust", title: "Score Dust", shaderType: "generator" },
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
  const availableShaderById = useMemo(
    () => new Map(availableShaders.map((shader) => [String(shader.id || ""), shader])),
    [availableShaders],
  );
  const availableShaderByIdRef = useRef(null);
  useEffect(() => {
    availableShaderByIdRef.current = availableShaderById;
  }, [availableShaderById]);
  // Sync the quick-capture composite refs (declared earlier) after their
  // source declarations so effect dependency arrays never hit the TDZ.
  useEffect(() => { activeDirectorPreviewSourceRef.current = activeDirectorPreviewSource; }, [activeDirectorPreviewSource]);
  useEffect(() => { activeShowGraphRef.current = activeShowGraph; }, [activeShowGraph]);
  const shaderTypeResolver = useMemo(
    () => (sourceId) => {
      const shader = availableShaderByIdRef.current?.get(String(sourceId || "")) || null;
      return String(shader?.shaderType || "") || null;
    },
    [],
  );
  useEffect(() => { shaderTypeResolverRef.current = shaderTypeResolver; }, [shaderTypeResolver]);
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
  const [directorHasUnsavedChanges, setDirectorHasUnsavedChanges] = useState(false);
  const [songCardPlanRevisionBySong, setSongCardPlanRevisionBySong] = useState({});
  const [songCardPlanSnapshotBySong, setSongCardPlanSnapshotBySong] = useState({});
  useEffect(() => {
    const retained = directorProjects.filter(row => Array.isArray(row.music_video_project?.timeline)).map(row => row.music_video_project.song_id);
    retained.push(selectedProjectSongId, pendingSavedDirectionCut?.songId, pendingLegacyProjectSave?.songId);
    setSongCardPlanSnapshotBySong(current => retainEchoSongCardPlans(current, retained));
  }, [directorProjects, selectedProjectSongId, pendingSavedDirectionCut?.songId, pendingLegacyProjectSave?.songId, songCardPlanSnapshotBySong]);
  const activeSongCardPlanEntry = activeProject?.song_id
    ? songCardPlanSnapshotBySong[activeProject.song_id] || null
    : null;
  const activeSongCardPlanSnapshotMatches = Boolean(
    activeSongCardPlanEntry?.status === "ready"
      && activeSongCardPlanEntry.cutId === activeDirectionVariantSelection,
  );
  const activeSongCardPlanWaiting = Boolean(
    activeSongCardPlanEntry?.status === "waiting"
      || (activeDirectionVariantSelection !== "legacy" && !activeSongCardPlanSnapshotMatches),
  );
  const activeSongCardPlanProject = activeSongCardPlanSnapshotMatches
    ? activeSongCardPlanEntry.project
    : (!activeSongCardPlanWaiting && activeDirectionVariantSelection === "legacy" ? activeProject : null);
  const activeSongCardPlanShowGraph = activeSongCardPlanSnapshotMatches
    ? activeSongCardPlanEntry.showGraph
    : (!activeSongCardPlanWaiting && activeDirectionVariantSelection === "legacy" ? activeShowGraph : null);
  const activeSongCardPlanningRevision = activeSongCardPlanSnapshotMatches
    ? activeSongCardPlanEntry.revision
    : (activeDirectionVariantSelection === "legacy"
      ? songCardPlanRevisionBySong[activeProject?.song_id] || ""
      : "");
  const directorOperationBusy = savingProject
    || directionForkTransitionPending
    || directionCutSelectionPending
    || Boolean(pendingSavedDirectionCut)
    || Boolean(pendingLegacyProjectSave)
    || loadingProjectDetail;
  const directorEditingLocked = directorOperationBusy || livingLightRecordVisitState.state==='loading';

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
    powerResumePlayingRef.current = powerMode !== "hidden" && Boolean(isPlaying && audio && !audio.paused);
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
    const visit= livingLightSelectionRef.current?.songId===selectedProjectSongId?livingLightSelectionRef.current:null;
    const position=visit?.timeSeconds||0;
    if (audioRef.current) {
      audioRef.current.pause();
      if(!visit)audioRef.current.currentTime = 0;
      audioRef.current.volume = directorMuted ? 0 : directorVolume;
    }
    setIsPlaying(false);
    currentTimeRef.current=position;setCurrentTime(position);
    setSelectedShotIndex(0);
    setSelectedVisualizerIndex(0);
    setActiveTrackTab("video");
    setSaveSuccessMessage("");
    setSaveFeedbackTone("idle");
    setSaveElapsedSeconds(0);
    setPreviewBufferState({ status: "idle", ready: false, readyLookahead: 0, targetLookahead: 0 });
    setPreviewProjection(null);
    presentedMediaRef.current = null;
    presentationObserverRef.current?.stop();
    presentationObserverRef.current = null;
    presentationTimingRef.current.reset();
    presentationPublishAtRef.current = -Infinity;
    globalThis.__HAPA_ECHO_PRESENTATION_TIMING__ = presentationTimingRef.current.snapshot();
    disposeEchoStemDecoderPool(stemDecoderPoolRef.current);
    masterSignalTrackerRef.current?.reset?.();
    exactIsfBindingDiagnosticsRef.current.frameBucket = -1;
    publishExactBindingDiagnostics({ media: null, stem: null, frameReceipt: null, composition: null, playbackPool: null, rendererTruth: null, rendererTruthReceipt: null });
  }, [selectedProjectSongId]);

  // The camera panel edits the selected shot; keep the selection following the
  // playhead so Intensity/Speed changes always target the shot the preview is
  // showing instead of an unselected earlier shot.
  useEffect(() => {
    if (!activeProject?.timeline?.length) return;
    const index = activeProject.timeline.findIndex((item) => currentTime >= item.start_sec && currentTime < item.end_sec);
    if (index !== -1 && index !== selectedShotIndex) setSelectedShotIndex(index);
  }, [currentTime, selectedShotIndex, activeProject]);

  // Playback timer ticker fallback
  useEffect(() => {
    if (!isPlaying || powerMode === "hidden") return;
    let anim;
    let cadenceTimer;

    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        const next = audio.currentTime;
        if (audioPlaybackReceiptRef.current?.sourceSelection?.kind !== 'stem') {
          currentTimeRef.current = next;
          echoPlaybackEngineRef.current?.tick(next, { playing: true });
        }
        // Let the audio element reach its natural end. Project metadata can
        // round a song short; resetting here truncates audio and loses `ended`.
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
    if (audioPlaybackReceiptRef.current?.sourceSelection?.kind === 'stem') return;
    const next = audioRef.current.currentTime;
    currentTimeRef.current = next;
    echoPlaybackEngineRef.current?.tick(next, { playing: isPlaying, reason: "media-timeupdate" });
  };

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (previewRecordingActiveRef.current) stopPreviewRecording();
      releasePreviewRecordingResources();
      exactIsfPlaybackPoolRef.current?.dispose?.();
      exactIsfPlaybackPoolRef.current = null;
      exactIsfPlaybackPoolIdentityRef.current = { variantKey: "", dirtyKey: "", dirtyRangeCount: 0, shaderIds: [] };
      exactIsfPrewarmSignatureRef.current = "";
      exactIsfLastPresentedCanvasRef.current = null;
      exactIsfMediaInputCanvasRef.current = null;
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
    if (!["preview", "variation"].includes(activeWorkbenchTab) || powerMode === "hidden") return;
    let animFrame;
    let cadenceTimer;
    let disposed = false;
    exactIsfBindingDiagnosticsRef.current.frameBucket = -1;

    const horizonHistory = [];
    const particles = [];
    const stars = [];
    const scoreDustRenderer = createEchoScoreDustRenderer();
    let scoreDustKey = "";

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
          ...echoPreviewShaderSize(canvas.width, canvas.height, previewQuality),
          apiBase: API_BASE,
          maxSurfaces: ECHO_SHADER_POOL_LIMIT,
          historyCheckpointMaxBytes: 128 * 1024 * 1024,
        });
      } catch (error) {
        publishExactStatus({ status: "error", sourceId: "", error: String(error?.message || error) });
        return null;
      }
    };

    const ensureExactPlaybackPool = (canvas, showGraph) => {
      const nextIdentity = echoIsfGraphRuntimeIdentity(showGraph);
      const nextSizeKey = `${canvas.width}x${canvas.height}:${previewQuality.shaderScale}`;
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
    
    const silentFft = new Uint8Array(256);
    const silentWave = new Uint8Array(256).fill(128);
    const emptyPreparedStem = { source: "prepared-performance", status: "missing-analysis", rms: 0, beat: 0, energy: 0 };
    const compositeCadence = createEchoCompositeCadence({ fps: activeOutputProfile.fps });
    let nextCompositeReportMs = 0;
    const scheduleRender = () => {
      if (disposed) return;
      if (powerMode === "docked") cadenceTimer = window.setTimeout(() => { animFrame = requestAnimationFrame(render); }, 1000 / 12);
      else animFrame = requestAnimationFrame(render);
    };
    const render = () => {
      const frameStartedMs = performance.now();
      const canvas = canvasRef.current || document.getElementById("director-preview-canvas");
      if (!canvas) {
        animFrame = requestAnimationFrame(render);
        return;
      }
      const cssWidth = Math.max(1, Number(canvas.clientWidth || 0));
      const pixelRatio = Math.max(1, Math.min(1.5, Number(globalThis.devicePixelRatio || 1)));
      const targetWidth = Math.min(activeOutputProfile.width, Math.max(640, Math.round(cssWidth * pixelRatio)));
      const targetHeight = Math.round(targetWidth * activeOutputProfile.height / activeOutputProfile.width);
      const masterClock = audioRef.current;
      const t = masterClock && !masterClock.paused
        ? Number(masterClock.currentTime || currentTimeRef.current)
        : currentTimeRef.current;
      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animFrame = requestAnimationFrame(render);
        return;
      }
      if (!compositeCadence.begin({ nowMs: frameStartedMs, songTime: t,
        playing: Boolean(masterClock && !masterClock.paused && !masterClock.ended && !masterClock.seeking),
        cadenceEnabled: Boolean(activeDirectorPreviewSource) && audioVisualMode !== "live",
        surface: canvas, width: targetWidth, height: targetHeight })) {
        scheduleRender();
        return;
      }
      echoLyricPresentationRef.current?.(t);
      const width = canvas.width;
      const height = canvas.height;
      const shaderSize = echoPreviewShaderSize(width, height, previewQuality);
      ctx.clearRect(0, 0, width, height);
      
      currentTimeRef.current = t;
      const directorPreviewFrame = activeDirectorPreviewSource
        ? projectEchoDirectorPreviewFrame({
          source: activeDirectorPreviewSource,
          timeSeconds: t,
          playing: Boolean(masterClock && !masterClock.paused && !masterClock.ended),
          shaderTypeResolver,
        })
        : null;
      const accentState = EchoAccentPresentation.frame(directorPreviewFrame?.automation?.accents || [], directorPreviewFrame?.clock?.evaluationSeconds ?? directorPreviewFrame?.clock?.selectionSeconds ?? t, { reducedMotion: activeProject?.lyrics?.reducedMotion === true });
      const accentReceipts = [];
      // Optional acceptance observer consumes the frame actually painted here;
      // it does not evaluate a second timeline or add work to ordinary preview.
      const paintObserver = globalThis.__HAPA_ECHO_ON_PAINT__;
      const paintedLayers = typeof paintObserver === "function" ? [] : null;
      const mediaAccentTarget = directorPreviewFrame?.primaryMediaCue;
      if (mediaAccentTarget) accentReceipts.push(...EchoAccentPresentation.paint(ctx, accentState, width, height, { layer: "media-layer", primary: true, instanceId: mediaAccentTarget.id, cardId: mediaAccentTarget.id, trackId: mediaAccentTarget.trackId }));
      const projectedCueIndex = directorPreviewFrame?.primaryMediaCue?.sourceCueIndex;
      const playheadShotIndex = Number.isInteger(projectedCueIndex)
        ? projectedCueIndex
        : activeProject?.timeline?.findIndex(item => t >= item.start_sec && t < item.end_sec);
      const currentTimelineItem = previewTimelineRef.current[playheadShotIndex] || previewTimelineRef.current[0];
      
      const playheadVisIndex = activeProject?.visualizer_timeline?.findIndex(item => t >= item.start_sec && t < item.end_sec);
      const currentVisItem = playheadVisIndex !== -1 && playheadVisIndex !== undefined ? activeProject.visualizer_timeline[playheadVisIndex] : activeProject?.visualizer_timeline?.[0];
      const visualizerTitle = currentVisItem?.visualizer_title || "None";
      const isVideo = shotMediaType(currentTimelineItem) === "video";
      
      const color = activeProject?.perspective === 'red' ? '#ef4444' : activeProject?.perspective === 'green' ? '#10b981' : '#06b6d4';

      const analyserNode = analyserNodeRef.current;

      // Generate or fetch audio inputs
      const timeVal = t;
      const observedAtSeconds = performance.now() / 1000;
      const replayedSignalFrames = audioVisualMode === "replay" ? activeRecordedSignalReplay?.at(t) : null;
      const preparedSignalFrames = audioVisualMode === "replay"
        ? replayedSignalFrames || { master: { source: "recorded-signals", status: "outside-captured-range", rms: 0, beat: 0, energy: 0 } }
        : audioVisualMode === "prepared"
        ? activePreparedPerformance ? echoPreparedPerformanceSignalFrames(activePreparedPerformance, t, { soloStem: activeVisualSignalSolo }) : { master: { source: "prepared-performance", status: "missing-analysis", rms: 0, beat: 0, hook: 0, telemetryRms: 0 } }
        : null;
      const masterSignalFrame = preparedSignalFrames?.master || liveSignalFrame(analyserNode, t, {
        id: "master",
        label: "Master mix",
        source: "echo-master-audio",
        observedAtSeconds,
      }, masterSignalTrackerRef.current);
      const fftList = masterSignalFrame.status === "live" ? masterSignalFrame.fft : silentFft;
      const waveList = masterSignalFrame.status === "live" ? masterSignalFrame.wave : silentWave;
      
      let rms = 0.15;
      let beatFlash = 0;
      let hookFlash = 0;
      let telemetryRms = 0;

      if (masterSignalFrame.status === "live") {
        rms = masterSignalFrame.rms;
        beatFlash = masterSignalFrame.beat;
        hookFlash = masterSignalFrame.hook;
        telemetryRms = masterSignalFrame.telemetryRms;
      } else if (preparedSignalFrames) {
        rms = Number(masterSignalFrame.rms || 0);
        beatFlash = Number(masterSignalFrame.beat || 0);
        hookFlash = 0;
        telemetryRms = rms;
      } else {
        rms = 0; beatFlash = 0; hookFlash = 0; telemetryRms = 0;
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
      const graphActiveVisualizerCardsIncludingQuarantine = hasDirectorShowGraph
        ? directorPreviewFrame
          ? directorPreviewFrame.visualizers.map((visualizer) => activeShowGraphVisualizerCardsById.get(visualizer.id)).filter(Boolean)
          : visualizerCardsAtTime(directorShowGraph, t)
        : [];
      // An image input is a binding requirement, not a quarantine. The verified
      // source loader and frame-intent adapter report actual unavailable inputs.
      const graphActiveVisualizerCards = graphActiveVisualizerCardsIncludingQuarantine;
      const graphVisualizerCards = hasDirectorShowGraph
        ? visualizerLookaheadCards(directorShowGraph, t, 6)
        : [];
      const graphVisualizerCard = graphActiveVisualizerCards[0]
        || graphVisualizerCards[0]
        || null;

      const budgetHoldsAllShaders = directorPreviewFrame?.visualBudget?.status === "within-budget" && directorPreviewFrame.visualizers.length === 0 && directorPreviewFrame.visualBudget.suppressedIds.length > 0;
      if (scoreDustPreviewRef.current) {
        // Preview toggle: Score Dust replaces the cut's visualizers on screen only.
        pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
        publishExactStatus({ status: "idle", sourceId: "", error: "" });
        if (scoreDustKey !== scoreDustRef.current.key) {
          scoreDustKey = scoreDustRef.current.key;
          scoreDustRenderer.setPlayback(scoreDustRef.current.playback, scoreDustRef.current.settings, scoreDustRef.current.source);
        }
        scoreDustRenderer.draw(ctx, { width, height, t, fft: f.fft, beatFlash: f.beatFlash, playing: isPlayingRef.current });
      } else if (hasDirectorShowGraph && budgetHoldsAllShaders) {
        pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
        publishExactStatus({ status: "idle", sourceId: "", error: "" });
      } else if (hasDirectorShowGraph) {
        const pool = ensureExactPlaybackPool(canvas, directorShowGraph);
        if (!graphVisualizerCard) {
          pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
          const missing = { status: "error", sourceId: "", error: "No executable shader card at this graph time" };
          publishExactStatus(missing);
          const heldCanvas = exactIsfLastPresentedCanvasRef.current;
          if (heldCanvas) ctx.drawImage(heldCanvas, 0, 0, width, height);
        } else if (!pool) {
          const heldCanvas = exactIsfLastPresentedCanvasRef.current;
          if (heldCanvas) ctx.drawImage(heldCanvas, 0, 0, width, height);
        } else {
          try {
            const masterAudio = audioRef.current;
            const signalFrames = preparedSignalFrames ? { ...preparedSignalFrames } : {};
            let selectedSignalFrame = preparedSignalFrames?.master || null;
            if (masterSignalFrame.status === "live") {
              signalFrames.master = masterSignalFrame;
              selectedSignalFrame = masterSignalFrame;
            }
            const defaultStemRole = String(graphVisualizerCard?.visualization?.card?.stemFocus || graphVisualizerCard?.visualization?.stemFocus || "master");
            const activeCardsForStemBinding = graphActiveVisualizerCards.length ? graphActiveVisualizerCards : [graphVisualizerCard];
            const currentStemRoles = preparedSignalFrames ? [] : [...new Set(activeCardsForStemBinding
              .flatMap((card) => echoIsfRequiredStemFocuses(card))
              .map((role) => String(role || ""))
              .filter(Boolean))]
              .slice(0, ECHO_STEM_DECODER_POOL_LIMIT);
            const currentBindings = currentStemRoles.map((role) => {
              const card = activeCardsForStemBinding.find((candidate) => (
                echoIsfRequiredStemFocuses(candidate).some((candidateRole) => (
                  normalizedStemFocus(candidateRole) === normalizedStemFocus(role)
                ))
              )) || graphVisualizerCard;
              return {
                role,
                card,
                resource: normalizedStemFocus(role) === "master" ? null : ensureActiveStemBinding(directorShowGraph, card, role),
              };
            });
            const currentResourceKeys = new Set(currentBindings.map((binding) => binding.resource?.key).filter((key) => key && !key.startsWith("master:")));
            const protectedResourceKeys = new Set(currentResourceKeys);
            let lookaheadSlots = preparedSignalFrames ? 0 : Math.max(0, ECHO_STEM_DECODER_POOL_LIMIT - currentResourceKeys.size);
            if (preparedSignalFrames) pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
            for (const lookaheadCard of graphVisualizerCards.filter((card) => !graphActiveVisualizerCards.some((active) => active.id === card.id)).slice(0, 3)) {
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
              const allowSilent = echoStemRoleAllowsSilence(binding.card || graphVisualizerCard, binding.role);
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
            signalFrames.master ||= masterSignalFrame;
            if (previewRecordingActiveRef.current && audioVisualMode === "live") previewSignalCaptureRef.current?.append({ songTime: t, signalFrames });
            selectedSignalFrame = signalFrames[defaultStemRole]
              || signalFrames[normalizedStemFocus(defaultStemRole)]
              || (preparedSignalFrames ? emptyPreparedStem : signalFrames.master || selectedSignalFrame);
            const expectedMediaId = String(currentTimelineItem?.media_id || "");
            const currentPresentedMedia = resolvePresentedEchoMediaBinding(
              directorPreviewFullscreenRef.current,
              currentTimelineItem,
              presentedMediaRef.current
            );
            if (currentPresentedMedia?.recoveredFrom) handlePresentedMediaChange({ ...currentPresentedMedia, recoveredFrom: undefined });
            const currentCameraKeyframe = directorPreviewFrame?.camera?.keyframe
              || echoCameraKeyframeAt(directorShowGraph?.directorV2?.cameraKeyframes, t);
            const cameraDirectedTimelineItem = currentTimelineItem && directorPreviewFrame?.camera
              ? {
                ...currentTimelineItem,
                camera_motion: directorPreviewFrame.camera.motion,
                camera_intensity: directorPreviewFrame.camera.intensity,
                ...(directorPreviewFrame.camera.speed === null ? {} : { camera_speed: directorPreviewFrame.camera.speed }),
              }
              : currentTimelineItem;
            if (!exactIsfMediaInputCanvasRef.current && currentPresentedMedia?.element) {
              exactIsfMediaInputCanvasRef.current = globalThis.document?.createElement?.("canvas") || null;
            }
            const framedMediaInput = currentPresentedMedia?.element
              ? drawEchoCameraFramedMediaInput({
                canvas: exactIsfMediaInputCanvasRef.current,
                mediaElement: currentPresentedMedia.element,
                shot: cameraDirectedTimelineItem,
                timeSeconds: t,
                shotIndex: Number.isInteger(playheadShotIndex) ? playheadShotIndex : 0,
                cameraCrop: currentCameraKeyframe?.crop || null,
                outputWidth: width,
                outputHeight: height,
              })
              : null;
            const mediaBaseDrawn = paintEchoPreviewMediaBase({
              context: ctx,
              framedMediaInput,
              width,
              height,
            });
            // The decoder elements live below this canvas in the DOM, while ISF
            // generator canvases commonly contain an opaque black plate. Put the
            // camera-framed clip in this same pixel stack before screen/lighter
            // shader passes so black is neutral instead of hiding the DOM video.
            canvas.dataset.echoCompositorMediaBase = mediaBaseDrawn ? "camera-framed" : "unavailable";
            const emptyMediaFrame = emptyIsfMedia.at(directorPreviewFrame ? Boolean(directorPreviewFrame.primaryMediaCue) : undefined);
            const graphIdentity = echoIsfGraphRuntimeIdentity(directorShowGraph);
            const sourceLayeredCards = directorPreviewFrame ? graphActiveVisualizerCards : graphActiveVisualizerCards.length ? graphActiveVisualizerCards : [graphVisualizerCard];
            const selectedLayers = echoPreviewShaderLayers(sourceLayeredCards, previewQuality);
            const layeredCards = selectedLayers.admitted;
            pool.beginFrame(layeredCards);
            canvas.dataset.echoPreviewQuality = JSON.stringify({ ...previewQuality, shaderWidth: shaderSize.width, shaderHeight: shaderSize.height,
              compositorWidth: width, compositorHeight: height, admitted: layeredCards.map(card => card.id), omitted: selectedLayers.omitted.map(card => card.id), finalExport: 'unchanged' });
            const visualTimeAt = (card, songTime) => visualTimeFor(
              { automation: directorShowGraph.directorV2 || {} },
              { id: card.id, trackId: card.trackId, visualizerId: exactVisualizerSourceId(card) }, songTime,
              { start: Number(card.startSeconds || 0), duration: Math.max(0, Number(card.endSeconds || 0) - Number(card.startSeconds || 0)) },
            ).visualTimeSeconds;
            const createHistoryResolver = (card) => {
              if (audioVisualMode === "live" || !activeDirectorPreviewSource) return null;
              const decoder = createEchoIsfHistoryMedia({ resolveUri: resolveMediaUri, sourceCache: pool.proxySourceCache });
              const framedCanvas = document.createElement("canvas");
              const timeline = [...previewTimelineRef.current];
              const upcomingSources = createEchoPreviewProxySchedule(activeDirectorPreviewSource.project.timeline, timeline, resolveMediaUri);
              const prefetch = createEchoProxySourcePrefetch({ sourceCache: pool.proxySourceCache });
              return {
                dispose: () => { prefetch.dispose(); decoder.dispose(); },
                getDiagnostics: () => ({ ...decoder.getDiagnostics(), prefetch: prefetch.getDiagnostics() }),
                at: async (songTime, { signal, requiresMedia } = {}) => {
                  const phaseStart = performance.now();
                  const projected = requiresMedia ? projectEchoDirectorPreviewMediaFrame({ source: activeDirectorPreviewSource, timeSeconds: songTime, fps: activeOutputProfile.fps }) : null;
                  const sourceCue = projected?.primaryMediaCue;
                  const cue = echoPreviewHistoryMediaCue(sourceCue, activeDirectorPreviewSource.project.timeline[sourceCue?.sourceCueIndex], timeline[sourceCue?.sourceCueIndex]);
                  const projectedAt = performance.now();
                  const decoded = requiresMedia ? await decoder.at(cue, songTime, { fps: activeOutputProfile.fps, signal, emptyInterval: projected?.primaryMediaCue === null }) : null;
                  if (requiresMedia) prefetch.update(upcomingSources(songTime));
                  const decodedAt = performance.now();
                  const index = cue?.sourceCueIndex;
                  const sourceShot = timeline[index];
                  const camera = projected?.camera;
                  const shot = sourceShot && camera ? { ...sourceShot, camera_motion: camera.motion, camera_intensity: camera.intensity, ...(camera.speed == null ? {} : { camera_speed: camera.speed }) } : sourceShot;
                  const framed = decoded?.receipt?.route === "empty-media-interval" ? { canvas: decoded.element } : decoded?.element ? drawEchoCameraFramedMediaInput({ canvas: framedCanvas, mediaElement: decoded.element, shot, timeSeconds: songTime, shotIndex: Number.isInteger(index) ? index : 0, cameraCrop: camera?.keyframe?.crop || null, outputWidth: width, outputHeight: height }) : null;
                  const signals = audioVisualMode === "replay"
                    ? activeRecordedSignalReplay?.at(songTime) || { master: { source: "recorded-signals", status: "outside-captured-range", rms: 0, beat: 0, energy: 0 } }
                    : activePreparedPerformance ? echoPreparedPerformanceSignalFrames(activePreparedPerformance, songTime, { soloStem: activeVisualSignalSolo }) : { master: emptyPreparedStem };
                  const role = String(card?.visualization?.card?.stemFocus || card?.visualization?.stemFocus || "master");
                  return { visualTime: visualTimeAt(card, songTime), signalFrames: signals, audio: signals[role] || signals[normalizedStemFocus(role)] || emptyPreparedStem,
                    preparedModulation: diagnosticPreparedModulation, mediaElement: framed?.canvas || null,
                    mediaIdentity: cue ? { id: cue.media.id, uri: cue.media.uri, sourceHash: cue.media.sourceHash } : null,
                    mediaFrameReceipt: decoded ? { ...decoded.receipt, preparationMs: { projection: projectedAt - phaseStart, decode: decodedAt - projectedAt, framingAndSignals: performance.now() - decodedAt } } : null,
                    composition: visualizerCompositionInput(card, songTime, availableShaderByIdRef.current?.get(exactVisualizerSourceId(card)) || null, activeProject?.revolving_shader_visibility) };
                },
              };
            };
            const layerPresentations = layeredCards.map((card) => {
              const stemRole = String(card?.visualization?.card?.stemFocus || card?.visualization?.stemFocus || "master");
              const layerSignalFrame = signalFrames[stemRole]
                || signalFrames[normalizedStemFocus(stemRole)]
                || (preparedSignalFrames ? emptyPreparedStem : signalFrames.master || selectedSignalFrame);
              const compositionInput = visualizerCompositionInput(
                card,
                t,
                availableShaderByIdRef.current?.get(
                  String(card?.visualization?.requestedSourceId || card?.visualization?.sourceId || card?.visualization?.card?.id || ""),
                ) || null,
                activeProject?.revolving_shader_visibility,
              );
              const presentation = pool.present(card, {
                presentationLayerKey: card.trackId || card.persistentSlotId || card.id,
                time: t,
                playing: isPlayingRef.current,
                frameRate: activeOutputProfile.fps,
                visualTime: visualTimeAt(card, t),
                historyMode: audioVisualMode === "live" ? "live" : "prepared",
                createHistoryResolver: () => createHistoryResolver(card),
                fft: fftList,
                wave: waveList,
                audio: layerSignalFrame,
                signalFrames,
                preparedModulation: diagnosticPreparedModulation,
                mediaElement: emptyMediaFrame?.element || framedMediaInput?.canvas || null,
                mediaFrameReceipt: emptyMediaFrame?.receipt || null,
                mediaIdentity: !emptyMediaFrame && currentPresentedMedia ? {
                  id: currentPresentedMedia.mediaId,
                  uri: currentPresentedMedia.uri,
                  sourceHash: currentTimelineItem?.media_contract?.sourceHash || currentTimelineItem?.media_sha256 || ""
                } : null,
                composition: compositionInput,
                cacheKey: graphIdentity.variantKey,
                width: shaderSize.width,
                height: shaderSize.height,
              }) || {};
              const requestedShaderId = String(presentation.requestedShaderId || presentation.shaderId || exactVisualizerSourceId(card));
              const presentedShaderId = String(presentation.presentedShaderId || "");
              const heldPreviousFrame = presentation.heldPreviousFrame === true || presentation.heldPrevious === true;
              const namedStatus = String(presentation.handoff || presentation.status || "loading");
              const composition = echoVisualizerLayerPresentation({ composition: presentation.composition || compositionInput,
                signalFrame: layerSignalFrame || masterSignalFrame, recipeMix: echoVisualizerRecipeMix(directorShowGraph) });
              const audioEnvelope = composition.audioEnvelope;
              return {
                card,
                presentation,
                requestedShaderId,
                presentedShaderId,
                heldPreviousFrame,
                namedStatus,
                audioEnvelope,
                composition,
                rendererTruth: exactEchoRendererTruth(card, {
                  ...presentation,
                  status: presentation.status || namedStatus,
                  requestedShaderId,
                  presentedShaderId,
                  heldPreviousFrame,
                }, "echo-avatar-builder"),
              };
            });
            const activeCardIds = new Set(layeredCards.map((card) => card.id));
            const prewarmCards = graphVisualizerCards.filter((card) => !activeCardIds.has(card.id)
              && Number(card.startSeconds) > t && Number(card.startSeconds) <= t + 3)
              .sort((left, right) => Number(left.startSeconds) - Number(right.startSeconds)).slice(0, 2);
            const prewarmSignature = `${graphIdentity.variantKey}:${prewarmCards.map((card) => `${exactVisualizerSourceId(card)}:${card?.visualization?.card?.source?.hash || ""}`).join("|")}`;
            if (prewarmSignature !== exactIsfPrewarmSignatureRef.current) {
              exactIsfPrewarmSignatureRef.current = prewarmSignature;
              const prewarmResult = pool.prewarm({ cards: prewarmCards, cacheKey: graphIdentity.variantKey });
              if (prewarmResult && typeof prewarmResult.catch === "function") prewarmResult.catch(() => {});
            }
            const primaryLayer = layerPresentations[0];
            const readyLayers = layerPresentations.filter(({ presentation, requestedShaderId, presentedShaderId }) => (
              presentation.canvas
              && presentation.status === "ready"
              && presentedShaderId === requestedShaderId
            ));
            const namedStatus = readyLayers.some(({ presentation }) => presentation.historyPending)
              ? "preparing-history"
              : readyLayers.length === layerPresentations.length
              ? "ready"
              : readyLayers.length
                ? "partial"
                : primaryLayer?.namedStatus || "loading";
            const poolDiagnostics = compactEchoIsfPlaybackDiagnostics(
              pool.getDiagnostics?.() || pool.getState?.() || {},
              primaryLayer?.presentation || {},
              graphVisualizerCards,
            );
            // Paused async shader work may settle after this song-time bucket was
            // published. Include its receipt identity while paused so diagnostics
            // catch up without increasing the ordinary playback publish cadence.
            const settledFrameKey = masterClock?.paused
              ? JSON.stringify([
                currentPresentedMedia?.sourceKey || "",
                layerPresentations.map((layer) => [layer.namedStatus, layer.presentedShaderId,
                  layer.presentation?.frameReceipt?.timestampSeconds,
                  layer.presentation?.frameReceipt?.receiptHash,
                  Math.floor(Number(layer.presentation?.historyProgress?.frame ?? -1) / activeOutputProfile.fps)]),
              ])
              : "";
            const frameBucket = `${Math.floor(t * 4)}:${activeVisualSignalSolo}:${settledFrameKey}`;
            if (exactIsfBindingDiagnosticsRef.current.frameBucket !== frameBucket) {
              exactIsfBindingDiagnosticsRef.current.frameBucket = frameBucket;
              globalThis.__HAPA_ECHO_ISF_PLAYBACK_DIAGNOSTICS__ = poolDiagnostics;
              publishExactBindingDiagnostics({
                media: currentPresentedMedia ? {
                  status: framedMediaInput ? "camera-framed" : "presented-unframed",
                  kind: currentPresentedMedia.kind,
                  mediaId: currentPresentedMedia.mediaId,
                  sourceKey: currentPresentedMedia.sourceKey,
                  sourceOrientation: framedMediaInput
                    ? framedMediaInput.dimensions.isPortrait ? "portrait" : "landscape"
                    : "unknown",
                } : { status: "unavailable", kind: shotMediaType(currentTimelineItem), mediaId: expectedMediaId, sourceKey: "", reason: "no-current-presented-media" },
                stem: preparedSignalFrames ? { status: selectedSignalFrame?.status || "missing-analysis", source: audioVisualMode === "replay" ? "recorded-signals" : "prepared-performance", role: defaultStemRole, fingerprint: activePreparedPerformance?.fingerprint || null, alignment: "see-prepared-source-evidence" } : compactStemSignalBinding(stemResource, stemTransport),
                frameReceipt: compactFrameReceipt(primaryLayer?.presentation?.frameReceipt),
                composition: primaryLayer?.composition || null,
                visualSignalIsolation: { ...visualSignalIsolation, atSeconds: t, buses: Object.fromEntries(Object.entries(preparedSignalFrames || {}).map(([role, frame]) => [role, { rms: frame.rms, beat: frame.beat, status: frame.status }])), layers: layerPresentations.map(layer => ({ cardId: layer.card.id, inputs: layer.presentation.frameReceipt?.input?.modulationBindings || [] })) },
                persistentShaderLayers: layerPresentations.map((layer) => ({
                  cardId: layer.card.id,
                  persistentSlotId: layer.card.persistentSlotId || null,
                  requestedShaderId: layer.requestedShaderId,
                  presentedShaderId: layer.presentedShaderId,
                  status: layer.namedStatus,
                  historyPending: layer.presentation.historyPending === true,
                  historyProgress: layer.presentation.historyProgress || null,
                  songFrameIndex: layer.presentation.clock?.songFrameIndex ?? null,
                  mediaFrameReceipt: layer.presentation.mediaFrameReceipt || null,
                })),
                playbackPool: poolDiagnostics,
                rendererTruth: primaryLayer?.rendererTruth?.truth || null,
                rendererTruthReceipt: primaryLayer?.rendererTruth?.receipt || null,
              });
            }
            publishExactStatus({
              status: namedStatus,
              sourceId: primaryLayer?.requestedShaderId || "",
              requestedShaderId: layerPresentations.map((layer) => layer.requestedShaderId).join(","),
              presentedShaderId: readyLayers.map((layer) => layer.presentedShaderId).join(","),
              error: layerPresentations
                .filter((layer) => layer.presentation?.error)
                .map((layer) => String(layer.presentation.error?.message || layer.presentation.error || ""))
                .join("; "),
            });
            if (readyLayers.length) {
              exactIsfLastPresentedCanvasRef.current = readyLayers[0].presentation.canvas;
              for (const layer of readyLayers) {
                const { presentation, composition, audioEnvelope } = layer;
                if (Number(composition.underlayDimAlpha) > 0) {
                  ctx.save();
                  ctx.globalAlpha = Math.max(0, Math.min(1, Number(composition.underlayDimAlpha)));
                  ctx.globalCompositeOperation = "source-over";
                  ctx.fillStyle = "#000";
                  ctx.fillRect(0, 0, width, height);
                  ctx.restore();
                }
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, Number(composition.effectiveAlpha ?? (composition.opacity * composition.mix * composition.transitionAlpha)) || 0));
                ctx.globalCompositeOperation = composition.canvasComposite || "source-over";
                ctx.filter = `brightness(${audioEnvelope.brightness.toFixed(3)}) saturate(${audioEnvelope.saturation.toFixed(3)}) contrast(${audioEnvelope.contrast.toFixed(3)})`;
                ctx.translate(width / 2, height / 2);
                ctx.scale(audioEnvelope.scale, audioEnvelope.scale);
                ctx.drawImage(presentation.canvas, -width / 2, -height / 2, width, height);
                if (paintedLayers) paintedLayers.push({ cueId: layer.card.id, shaderId: layer.presentedShaderId,
                  clock: presentation.clock || null, alpha: ctx.globalAlpha,
                  filter: ctx.filter, blend: ctx.globalCompositeOperation, scale: audioEnvelope.scale,
                  heldPrevious: presentation.heldPrevious === true, historyPending: presentation.historyPending === true });
                ctx.restore();
                // Layer-space overlays follow the same song clock, with no camera
                // scale amplification of the declared frame-area limit.
                if (Number(composition.effectiveAlpha ?? composition.opacity) > 0) accentReceipts.push(...EchoAccentPresentation.paint(ctx, accentState, width, height, { layer: "visualizer-layer", primary: layer === readyLayers[0], instanceId: layer.card.id, cardId: layer.card.id, visualizerId: layer.requestedShaderId, trackId: layer.card.trackId, layerIndex: readyLayers.indexOf(layer) }));
              }
            } else {
              const heldCanvas = exactIsfLastPresentedCanvasRef.current;
              if (heldCanvas) ctx.drawImage(heldCanvas, 0, 0, width, height);
            }
          } catch (error) {
            const failed = { status: "error", sourceId: exactVisualizerSourceId(graphVisualizerCard), error: String(error?.message || error) };
            publishExactStatus(failed);
            const heldCanvas = exactIsfLastPresentedCanvasRef.current;
            if (heldCanvas) ctx.drawImage(heldCanvas, 0, 0, width, height);
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
      } else if (renderMode === "score-dust") {
        // Score Dust: persistent particles directed by the visual score.
        if (scoreDustKey !== scoreDustRef.current.key) {
          scoreDustKey = scoreDustRef.current.key;
          scoreDustRenderer.setPlayback(scoreDustRef.current.playback, scoreDustRef.current.settings, scoreDustRef.current.source);
        }
        scoreDustRenderer.draw(ctx, { width, height, t, fft: f.fft, beatFlash: f.beatFlash, playing: isPlayingRef.current });
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
      const previewTransition = directorPreviewFrame?.transition;
      if (currentTimelineItem && (previewTransition?.kind || currentTimelineItem.transition) === "scanline-dissolve") {
        const elapsed = t - currentTimelineItem.start_sec;
        if (elapsed < 0.5 && elapsed >= 0) {
          const progress = elapsed / 0.5; // 0 to 1
          const glitchLines = Math.floor((1 - progress) * 15);
          const deterministicSeed = previewTransition?.deterministicSeed || 0;
          ctx.fillStyle = activeProject?.perspective === 'red' ? 'rgba(239, 68, 68, 0.4)' : activeProject?.perspective === 'green' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(6, 182, 212, 0.4)';
          for (let i = 0; i < glitchLines; i++) {
            const y2 = echoDirectorPreviewNoise(deterministicSeed, i * 4) * height;
            const h = 2 + echoDirectorPreviewNoise(deterministicSeed, i * 4 + 1) * 8;
            const w = width * (0.3 + echoDirectorPreviewNoise(deterministicSeed, i * 4 + 2) * 0.5);
            const x = echoDirectorPreviewNoise(deterministicSeed, i * 4 + 3) * (width - w);
            ctx.fillRect(x, y2, w, h);
          }
          
          // Also draw horizontal scanline bars
          ctx.strokeStyle = activeProject?.perspective === 'red' ? 'rgba(239, 68, 68, 0.3)' : activeProject?.perspective === 'green' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(6, 182, 212, 0.3)';
          ctx.lineWidth = 1;
          for (let y2 = 0; y2 < height; y2 += 4) {
            if (echoDirectorPreviewNoise(deterministicSeed, 1_000 + y2 / 4) < 0.3 * (1 - progress)) {
              ctx.beginPath();
              ctx.moveTo(0, y2);
              ctx.lineTo(width, y2);
              ctx.stroke();
            }
          }
        }
      }

      canvas.dataset.echoAccentReceipts = JSON.stringify(EchoAccentPresentation.report(accentState, accentReceipts, { excludeLayers: directorPreviewFrame?.lyrics?.visible ? ['lyric-layer'] : [] }));
      canvas.dataset.echoVisualBudget = JSON.stringify(directorPreviewFrame?.visualBudget || null);
      const compositeFinishedMs = performance.now();
      compositeCadence.end(compositeFinishedMs);
      if (compositeFinishedMs >= nextCompositeReportMs) {
        canvas.dataset.echoCompositeTiming = JSON.stringify(compositeCadence.snapshot());
        nextCompositeReportMs = compositeFinishedMs + 250;
      }
      if (paintedLayers) {
        const nowMs = performance.now();
        try { paintObserver({ canvas, frame: directorPreviewFrame, source: activeDirectorPreviewSource,
          performance: activePreparedPerformance, paintedLayers, accentReceipts, nowMs,
          clock: estimateEchoAudibleClock({ audio: masterClock, context: audioContextRef.current, nowMs }) }); }
        catch (error) { globalThis.__HAPA_ECHO_PAINT_OBSERVER_ERROR__ = String(error?.message || error); }
      }
      
      scheduleRender();
    };
    render();
    return () => {
      disposed = true;
      scoreDustRenderer.dispose();
      cancelAnimationFrame(animFrame);
      window.clearTimeout(cadenceTimer);
      pauseEchoStemDecoderPool(stemDecoderPoolRef.current);
      exactIsfPlaybackPoolRef.current?.dispose?.();
      exactIsfPlaybackPoolRef.current = null;
      exactIsfLastPresentedCanvasRef.current = null;
      exactIsfPrewarmSignatureRef.current = "";
    };
  }, [activeDirectorPreviewSource, activeOutputProfile, previewTimeline, previewQuality, activeShowGraphVisualizerCardsById, activeWorkbenchTab, activeProject, powerMode, audioVisualMode, activeRecordedSignalReplay, activePreparedPerformance, preparedModulationResult, diagnosticPreparedModulation, activeVisualSignalSolo, visualSignalIsolation]);

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
    if (!detailSongId) return false;
    recentProjectDetailsRef.current = [detailSongId, ...recentProjectDetailsRef.current.filter(id => id !== detailSongId)].slice(0, 3);
    setDirectorProjects(prev => {
      const nextProject = detail?.music_video_project;
      if (!nextProject?.song_id) return prev;
      const index = prev.findIndex(p => p.music_video_project.song_id === nextProject.song_id);
      const next = prev.slice();
      if (index === -1) next.push(detail); else next[index] = detail;
      return retainEchoProjectDetails(next, projectSummaryBySongRef.current, recentProjectDetailsRef.current,
        [selectedProjectSongIdRef.current, pendingSavedDirectionCut?.songId, pendingLegacyProjectSave?.songId]);
    });
    return true;
  };

  const commitSelectedProjectSongId = (songId) => {
    const nextSongId = String(songId || "").trim();
    selectedProjectSongIdRef.current = nextSongId;
    setSelectedProjectSongId(nextSongId || null);
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

  const fetchPreparedProjectDetail = async (songId, variantId = "", options = {}) => {
    let detailResult = await fetchProjectDetail(
      songId,
      variantId,
      { commit: false, priority: "foreground" },
    );
    let project = detailResult?.detail?.music_video_project;
    if (project?.director_show_graph?.tracks) return detailResult;
    if (!project) throw new Error("the saved script detail could not be loaded");

    const readinessReason = project.director_show_graph_receipt?.reason || "saved preview graph unavailable";
    // A saved cut's script is already immutable and safe to open as an
    // editable copy.  Its final-render graph may still be waiting behind a
    // different album-wide certification run or a stale Builder service, so
    // do not strand the operator on Legacy while that independent work
    // completes. The caller supplies the current verified graph solely as a
    // local editor template; final rendering remains blocked until the exact
    // child certificate exists on a fresh service.
    if (options.allowEditorFallback === true && variantId && variantId !== "legacy") {
      const selected = project.direction_script_variants?.find(row => echoDirectionVariantId(row) === variantId);
      if (selected?.selectionMode === "living-light-album-director") {
        setEchoOperationNotice("Opening the Living Light album pass for editing and live recording. Final render preparation remains separate.");
        return detailResult;
      }
      setEchoOperationNotice("Opening this saved cut as an editable copy while its exact final-render graph certifies in the background…");
      void warmEchoProjectGraphsRequest(
        `${API_BASE}/api/echos/director-project/compile`,
        songId,
        variantId,
      ).catch((error) => {
        console.warn(`Saved Director cut ${variantId} is still awaiting exact render certification:`, error);
      });
      return detailResult;
    }

    if (readinessReason === "server_restart_required") {
      throw new Error("the Builder service was updated and needs one restart before saved final-render graphs can be prepared");
    }

    setEchoOperationNotice("Preparing this song’s saved preview graphs once. Its scripts and cuts remain unchanged…");
    await warmEchoProjectGraphsRequest(
      `${API_BASE}/api/echos/director-project/compile`,
      songId,
      variantId,
    );
    detailResult = await fetchProjectDetail(
      songId,
      variantId,
      { commit: false, priority: "foreground" },
    );
    project = detailResult?.detail?.music_video_project;
    if (!project?.director_show_graph?.tracks) {
      throw new Error(project?.director_show_graph_receipt?.reason || readinessReason);
    }
    return detailResult;
  };

  livingLightVisitContextRef.current={
    readCurrent:()=>({busy:livingLightRecipeBusy||directorOperationBusy||previewRecordingActiveRef.current||previewRecordingStartingRef.current||!!requestedPlaybackAssetId,
      token:JSON.stringify([selectedProjectSongId,activeDirectionVariantSelection,activeStoredProject,workingDirectionFork,directorHasUnsavedChanges]),
      snapshot:{songId:selectedProjectSongId,cutId:activeDirectionVariantSelection,title:activeProject?.song_title||selectedProjectSongId,detail:activeDirectorProject,workingFork:workingDirectionFork,dirty:directorHasUnsavedChanges,timeSeconds:audioRef.current?.currentTime??currentTimeRef.current,cardPlan:songCardPlanSnapshotBySong[selectedProjectSongId]||null}}),
    request:async(route,{signal})=>{const response=await fetch(API_BASE+'/api/echos'+route,{signal,cache:'no-store'});if(!response.ok)throw Error('The destination owner is unavailable ('+response.status+').');return response.json();},
    activate:selection=>{
      const sameSong=selectedProjectSongIdRef.current===selection.songId;
      audioRef.current?.pause();setIsPlaying(false);powerResumePlayingRef.current=false;
      livingLightSelectionRef.current=sameSong?null:selection;
      livingLightSeekRef.current=sameSong&&audioRef.current?null:{songId:selection.songId,timeSeconds:selection.timeSeconds};
      directionSelectionPreferenceRef.current='manual';latestDirectionHydrationKeyRef.current='';
      if(!commitDirectorProjectDetail(selection.detail))throw Error('The destination project could not be selected.');
      commitSelectedProjectSongId(selection.songId);setSelectedDirectionVariantId(selection.cutId);setWorkingDirectionFork(selection.workingFork);setDirectorHasUnsavedChanges(selection.dirty);
      currentTimeRef.current=selection.timeSeconds;setCurrentTime(selection.timeSeconds);if(sameSong&&audioRef.current)audioRef.current.currentTime=selection.timeSeconds;
      if(selection.cardPlan)setSongCardPlanSnapshotBySong(state=>({...state,[selection.songId]:selection.cardPlan}));
      else holdSongCardPlanForExactCutCertificate(selection.songId,selection.cutId);
      setActiveWorkbenchTab('living-light');setEchoOperationNotice('Opened the selected record and exact cut, paused.');
    }
  };
  const openLivingLightRecord=target=>livingLightRecordVisit.open(target);
  const returnLivingLightRecord=()=>{try{livingLightRecordVisit.return();}catch(error){setLivingLightRecordVisitState(state=>({...state,message:error.message}));}};

  const handleSelectDirectorProjectSong = async (songId) => {
    if (!songId || directorEditingLocked || directorHasUnsavedChanges) return;
    if (songId === selectedProjectSongId && activeProjectHasDetail) return;
    commitSelectedProjectSongId(songId);
    setEchoOperationNotice("Track selected. Loading its timeline and saved editing graph…");
    const detailResult = await fetchProjectDetail(songId, "", { commit: false, priority: "foreground" });
    if (selectedProjectSongIdRef.current !== songId) return;
    const selection = inspectEchoDirectorProjectDetail(detailResult?.detail);
    const detailProject = selection.project;
    if (!selection.canOpen) {
      setEchoOperationNotice("That track remains selected, but its timeline did not finish loading. Choose it again to retry.");
      return;
    }
    if (!commitDirectorProjectDetail(detailResult.detail, detailResult.requestGeneration)) {
      setEchoOperationNotice("A newer song refresh superseded this response. The current song remains open; try again.");
      return;
    }
    if (selection.hasEditorGraph) {
      const savedShowGraph = projectToEditorGraph(detailProject);
      queueSongCardPlanForSavedRevision(
        songId,
        detailProject.director_show_graph_receipt?.sourceHash || detailProject.updated_at || "legacy",
        { cutId: "legacy", project: detailProject, showGraph: savedShowGraph },
      );
    }
    setDirectorHasUnsavedChanges(false);
    const latestSavedCut = selectLatestEchoDirectionScriptVariant(detailProject);
    setEchoOperationNotice(latestSavedCut
      ? `${detailProject.song_title || "Song"} opened. Loading its newest saved Director cut…`
      : selection.hasEditorGraph
        ? `${detailProject.song_title || "Song"} opened from its saved Legacy graph.`
        : `${detailProject.song_title || "Song"} opened. Its preview is ready while the editing graph prepares.`);
  };

  const editableDirectionForkFromDetail = (detail, variantId, options = {}) => {
    const project = detail?.music_video_project;
    const variant = project?.direction_script_variants?.find((candidate) => (
      echoDirectionVariantId(candidate) === variantId && Array.isArray(candidate.timeline)
    ));
    if (!project || !variant) return null;
    const projectedProject = attachEchoOutputProfile(deriveEchoDirectionVariantProject(project, variant));
    // A cut's certificate proves that this exact graph may be rendered; it is
    // not a prerequisite for opening the already-persisted script as a new
    // editable copy. Prefer the currently verified Legacy graph, but create a
    // deterministic local editor graph if a song was opened straight into a
    // child cut. The caller leaves Song Card rendering in its waiting state
    // until the exact certificate arrives.
    const fallbackProject = options.fallbackProject?.director_show_graph?.tracks
      ? options.fallbackProject
      : {
        ...projectedProject,
        director_show_graph: projectToEditorGraph(projectedProject),
      };
    const savedProjection = deriveEchoSavedDirectionPlanningProject(project, variant, { fallbackProject });
    const savedProject = savedProjection ? attachEchoOutputProfile(savedProjection) : null;
    const selectedProject = savedProject || (fallbackProject?.director_show_graph?.tracks
      ? {
        ...projectedProject,
        director_show_graph: fallbackProject.director_show_graph,
      }
      : null);
    if (!selectedProject) return null;
    if (!savedProject) selectedProject.editor_graph_fallback = {
      schemaVersion: "hapa.echo.editor-graph-fallback.v1",
      source: "saved-working-snapshot",
      reason: projectedProject?.execution_preview?.reason || "saved-cut-certification-pending",
      preservesPortableCards: true,
      pinnedSavedCut: false,
    };
    return {
      variant,
      savedProject,
      workingFork: createEchoDirectionWorkingFork(selectedProject, variant),
    };
  };

  const fetchVideoDetail = async (video) => {
    if (!video?.id) return;
    videoDetailControllerRef.current?.abort();
    const controller = new AbortController();
    videoDetailControllerRef.current = controller;
    setSelectedDetailVideo(video);
    setLoadingVideoDetail(true);
    try {
      const params = new URLSearchParams({ id: video.id });
      if (video.sourceId) params.set("sourceId", video.sourceId);
      const res = await fetch(`${API_BASE}/api/echos/video-detail?${params}`, { signal: controller.signal });
      if (!res.ok) return;
      const detail = await res.json();
      if (!controller.signal.aborted && videoDetailControllerRef.current === controller) setSelectedDetailVideo(detail);
    } catch (error) {
      if (!controller.signal.aborted) console.error("Failed to load video detail:", error);
    } finally {
      if (videoDetailControllerRef.current === controller) setLoadingVideoDetail(false);
    }
  };

  const fetchState = async (onlyPanel = "") => {
    if (!panelLoaderRef.current) panelLoaderRef.current = createEchoPanelLoader({
      onStatus: (key, value) => setPanelStatus(current => ({ ...current, [key]: value })),
    });
    const panels = {
      catalog: ["director-projects?summary=1", projectsData => {
        if (!Array.isArray(projectsData)) throw new Error("Invalid song catalog response");
        projectSummaryBySongRef.current = new Map(projectsData.map(row => [row.music_video_project.song_id, row]));
        // Refresh summaries while retaining only the bounded working set.
        // Preserve pinned work even if a transient catalog omits its song.
        setDirectorProjects(current => {
          const protectedIds = [selectedProjectSongIdRef.current, pendingSavedDirectionCut?.songId, pendingLegacyProjectSave?.songId];
          const details = new Map(current.map(row => [row.music_video_project.song_id, row]));
          const rows = projectsData.map(row => {
            const detail = details.get(row.music_video_project.song_id);
            return detail?.music_video_project?.timeline ? detail : row;
          });
          for (const id of protectedIds) if (id && !projectSummaryBySongRef.current.has(id) && details.has(id)) rows.push(details.get(id));
          return retainEchoProjectDetails(rows, projectSummaryBySongRef.current, recentProjectDetailsRef.current, protectedIds);
        });
        if (!projectsData.length) return;
        const projectSongIds = new Set(projectsData.map(row => row.music_video_project.song_id));
        const currentSongId = selectedProjectSongIdRef.current;
        const nextSongId = projectSongIds.has(currentSongId) ? currentSongId
          : projectSongIds.has(selectedSongId) ? selectedSongId : projectsData[0].music_video_project.song_id;
        if (!currentSongId || !projectSongIds.has(currentSongId)) {
          commitSelectedProjectSongId(nextSongId);
          fetchProjectDetail(nextSongId, "");
        }
      }],
      board: ["kanban", setBoard],
      gaps: ["gaps?summary=1", gapsData => {
        setGapsReport(gapsData);
        if (gapsData.videos?.length && !selectedDetailVideo) fetchVideoDetail(gapsData.videos[0]);
      }],
      shaders: ["shaders", apiShaders => {
        if (!Array.isArray(apiShaders)) throw new Error("Invalid shader catalog response");
        setAvailableShaders(prev => [...apiShaders, ...prev.filter(shader => !apiShaders.some(item => item.id === shader.id))]);
      }],
    };
    await Promise.all(Object.entries(panels).filter(([key]) => !onlyPanel || key === onlyPanel)
      .map(([key, [endpoint, apply]]) => panelLoaderRef.current.load(key, `${API_BASE}/api/echos/${endpoint}`, apply)));
  };

  const markSongCardPlanUnsaved = () => {
    const songId = activeProject?.song_id || selectedProjectSongId;
    if (!songId) return;
    setDirectorHasUnsavedChanges(true);
    setSongCardPlanSnapshotBySong((current) => beginEchoSongCardPlanWait(
      current,
      songId,
      `unsaved:${activeDirectionVariantSelection || "legacy"}`,
      activeDirectionVariantSelection || "legacy",
      { reusePrevious: true },
    ));
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
    markSongCardPlanUnsaved();
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
    markSongCardPlanUnsaved();
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
    markSongCardPlanUnsaved();
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

  const handleUpdateRevolvingShaderVisibility = (visibility) => {
    if (directorEditingLocked || !activeProject) return;
    const nextVisibility = Math.round(Math.max(0, Math.min(1, Number(visibility) || 0)) * 100) / 100;
    handleUpdateProjectSettings({
      revolving_shader_visibility: nextVisibility,
      visualizer_timeline: (activeProject.visualizer_timeline || []).map((visualizer) => ({
        ...visualizer,
        opacity: nextVisibility,
      })),
    });
  };

  const handleUpdatePersistentShaderSlot = (slotIndex, shader = null) => {
    if (directorEditingLocked || !activeProject) return;
    const slots = normalizeEchoPersistentShaderSlots(activeProject);
    const current = slots[slotIndex];
    if (!current) return;
    const selection = shader
      ? buildEchoShaderSelectionUpdate(shader, {
        stem_focus: current.stem_focus,
        layer_role: current.layer_role,
        blend_mode: current.blend_mode,
        opacity: current.opacity,
        transition: "cut",
        portable_visualizer_card: current.portable_visualizer_card || null,
      })
      : buildEchoShaderSelectionUpdate({ id: "none", title: "None" }, current);
    const nextSlots = slots.map((slot, index) => index === slotIndex ? {
      ...slot,
      enabled: selection.visualizer_id !== "none",
      shader_id: selection.visualizer_id,
      shader_title: selection.visualizer_title,
      native_status: selection.native_status,
      final_render_ready: selection.final_render_ready,
      final_render_reason: selection.final_render_reason,
      final_render_truth: selection.final_render_truth,
      portable_visualizer_card: selection.portable_visualizer_card,
    } : slot);
    handleUpdateProjectSettings({
      persistent_shader_slots_schema: ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
      persistent_shader_slots: nextSlots,
    });
  };

  const handleTogglePersistentShaderSlot = (slotIndex, enabled) => {
    if (directorEditingLocked || !activeProject) return;
    const slots = normalizeEchoPersistentShaderSlots(activeProject);
    const current = slots[slotIndex];
    if (!current || current.shader_id === "none") return;
    const nextSlots = slots.map((slot, index) => index === slotIndex
      ? { ...slot, enabled: enabled === true }
      : slot);
    handleUpdateProjectSettings({
      persistent_shader_slots_schema: ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
      persistent_shader_slots: nextSlots,
    });
  };

  const handleUpdatePersistentShaderOpacity = (slotIndex, opacity) => {
    if (directorEditingLocked || !activeProject) return;
    const slots = normalizeEchoPersistentShaderSlots(activeProject);
    const nextOpacity = Math.round(Math.max(0, Math.min(1, Number(opacity) || 0)) * 100) / 100;
    const nextSlots = slots.map((slot, index) => index === slotIndex
      ? { ...slot, opacity: nextOpacity }
      : slot);
    handleUpdateProjectSettings({
      persistent_shader_slots_schema: ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
      persistent_shader_slots: nextSlots,
    });
  };

  const handleUpdatePersistentShaderLayerOpacity = (slotIndex, opacity) => {
    if (directorEditingLocked || !activeProject) return;
    const slots = normalizeEchoPersistentShaderSlots(activeProject);
    const nextOpacity = Math.round(Math.max(0, Math.min(1, Number(opacity) || 0)) * 100) / 100;
    const nextSlots = slots.map((slot, index) => index === slotIndex
      ? { ...slot, layer_opacity: nextOpacity }
      : slot);
    handleUpdateProjectSettings({
      persistent_shader_slots_schema: ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
      persistent_shader_slots: nextSlots,
    });
  };

  const handleContinueFromDirectionCut = () => {
    if (directorEditingLocked || !activeDirectionVariant || !activeProject) return;
    setDirectorHasUnsavedChanges(false);
    setWorkingDirectionFork(createEchoDirectionWorkingFork(activeProject, activeDirectionVariant));
    setSaveSuccessMessage("Editable working cut started. Its source cut and Legacy current remain unchanged.");
  };

  const handleCancelDirectionFork = () => {
    if (directorEditingLocked) return;
    if (activeProject?.song_id) {
      setSongCardPlanSnapshotBySong((current) => restoreEchoSongCardPlanSnapshot(
        current,
        activeProject.song_id,
        { toReady: true },
      ));
    }
    setWorkingDirectionFork(null);
    setDirectorHasUnsavedChanges(false);
    setSaveSuccessMessage("Working cut discarded. The source cut remains unchanged.");
    setSaveFeedbackTone("success");
  };

  const handleDiscardLegacyChanges = async () => {
    if (directorEditingLocked || !directorHasUnsavedChanges || activeDirectionVariantSelection !== "legacy") return;
    setEchoOperationNotice("Reloading the saved Legacy graph and discarding local changes…");
    const detailResult = await fetchProjectDetail(
      selectedProjectSongId,
      "",
      { commit: false, priority: "foreground" },
    );
    const legacyProject = detailResult?.detail?.music_video_project;
    if (!legacyProject?.director_show_graph?.tracks) {
      setSaveFeedbackTone("error");
      setSaveSuccessMessage("Could not reload the saved Legacy graph. Your local changes remain open and have not been discarded.");
      return;
    }
    if (!commitDirectorProjectDetail(detailResult.detail, detailResult.requestGeneration)) {
      setSaveFeedbackTone("error");
      setSaveSuccessMessage("A newer project refresh superseded the Legacy reload. Your local changes remain open; try Discard Legacy edits again.");
      return;
    }
    const legacyShowGraph = projectToEditorGraph(legacyProject);
    queueSongCardPlanForSavedRevision(
      selectedProjectSongId,
      legacyProject.director_show_graph_receipt?.sourceHash || legacyProject.updated_at || "legacy",
      { cutId: "legacy", project: legacyProject, showGraph: legacyShowGraph },
    );
    setWorkingDirectionFork(null);
    setDirectorHasUnsavedChanges(false);
    setSaveFeedbackTone("success");
    setSaveSuccessMessage("Unsaved Legacy changes discarded. The saved Legacy graph is open again.");
    setEchoOperationNotice("Saved Legacy baseline restored.");
  };

  const beginProjectSave = (songId = "", cutId = "") => {
    if (songId) {
      setSongCardPlanSnapshotBySong((current) => beginEchoSongCardPlanWait(
        current,
        songId,
        `saving:${cutId || "legacy"}`,
        cutId || "legacy",
        { reusePrevious: true },
      ));
    }
    setSavingProject(true);
    setSaveStartedAt(Date.now());
    setSaveElapsedSeconds(0);
    setSaveFeedbackTone("progress");
    setSaveSuccessMessage("");
  };

  const queueSongCardPlanForSavedRevision = (songId, revision = "", snapshot = null) => {
    if (!songId) return;
    const savedRevision = revision || `${Date.now()}`;
    if (snapshot?.project && snapshot?.showGraph?.tracks) {
      setSongCardPlanSnapshotBySong((current) => pinEchoSongCardPlanSnapshot(
        current,
        songId,
        savedRevision,
        snapshot,
      ));
    }
    setSongCardPlanRevisionBySong((current) => ({
      ...current,
      [songId]: savedRevision,
    }));
  };

  const holdSongCardPlanForExactCutCertificate = (songId, cutId) => {
    if (!songId || !cutId) return;
    setSongCardPlanSnapshotBySong((current) => beginEchoSongCardPlanWait(
      current,
      songId,
      `certifying:${cutId}`,
      cutId,
    ));
  };

  const reopenSavedDirectionCut = async (pending, suppliedDetailResult = null) => {
    const songId = pending?.songId || "";
    const variantId = pending?.variantId || "";
    if (!songId || !variantId || !pending?.fallbackProject) return false;
    const opening = { ...pending, status: "opening", reason: "" };
    setPendingSavedDirectionCut(opening);
    setDirectionForkTransitionPending(true);
    setSaveFeedbackTone("progress");
    setSaveSuccessMessage("Cut saved. Opening its protected editable copy…");
    try {
      const detailResult = suppliedDetailResult || await fetchProjectDetail(
        songId,
        variantId,
        { commit: false, priority: "foreground" },
      );
      const detail = detailResult?.detail;
      const hydratedVariant = detail?.music_video_project?.direction_script_variants?.find((variant) => (
        echoDirectionVariantId(variant) === variantId && Array.isArray(variant.timeline)
      ));
      if (!hydratedVariant) throw new Error("its saved metadata is still preparing");
      const editableSelection = editableDirectionForkFromDetail(detail, variantId, {
        fallbackProject: pending.fallbackProject,
      });
      if (!editableSelection) throw new Error("its protected editable copy is still preparing");
      if (!commitDirectorProjectDetail(detail, detailResult.requestGeneration)) {
        throw new Error("a newer detail refresh superseded this response");
      }
      setWorkingDirectionFork(editableSelection.workingFork);
      directionSelectionPreferenceRef.current = "manual";
      latestDirectionHydrationKeyRef.current = "";
      setSelectedDirectionVariantId(variantId);
      setDirectorHasUnsavedChanges(false);
      if (editableSelection.savedProject?.director_show_graph?.tracks) {
        const savedShowGraph = projectToEditorGraph(editableSelection.savedProject);
        const detachedVisualizerCount = detachedEchoVisualizerCards(savedShowGraph).length;
        setSaveSuccessMessage(detachedVisualizerCount === 0
          ? "New append-only direction cut saved and reopened as an editable copy. Every shader card is attached while Song Card preparation continues in Tracks."
          : `New append-only direction cut saved and reopened as an editable copy. ${detachedVisualizerCount} shader ${detachedVisualizerCount === 1 ? "card is" : "cards are"} rebuilding; Song Card preparation will repair ${detachedVisualizerCount === 1 ? "it" : "them"} before offering Render.`);
        queueSongCardPlanForSavedRevision(
          songId,
          variantId || pending.fallbackProject.updated_at,
          {
            cutId: variantId,
            project: editableSelection.savedProject,
            showGraph: savedShowGraph,
          },
        );
      } else {
        setEchoOperationNotice("The cut is saved and editable. Song Card preparation will wait for its saved render graph instead of using the reopened working copy.");
      }
      setPendingSavedDirectionCut(null);
      setSaveFeedbackTone("success");
      return true;
    } catch (error) {
      const reason = error?.message || String(error);
      setPendingSavedDirectionCut({ ...pending, status: "retry", reason });
      setSaveFeedbackTone("error");
      setSaveSuccessMessage(`The cut is saved, but its editable copy could not be reopened because ${reason}. Choose Reopen saved cut; editing stays locked so the saved request cannot conflict with another cut.`);
      setEchoOperationNotice("The saved cut still needs to be reopened. No edits were discarded, and the consumed save ID cannot be reused for different content.");
      return false;
    } finally {
      setDirectionForkTransitionPending(false);
    }
  };

  const handleRecoverPendingDirectionCut = async () => {
    const pending = pendingSavedDirectionCut;
    if (!pending || directionForkTransitionPending || savingProject) return;
    if (pending.status !== "unknown") {
      await reopenSavedDirectionCut(pending);
      return;
    }
    setDirectionForkTransitionPending(true);
    setPendingSavedDirectionCut({ ...pending, status: "opening", reason: "" });
    setSaveFeedbackTone("progress");
    setSaveSuccessMessage("Checking the original save request without changing its content or ID…");
    try {
      let detailResult = await fetchProjectDetail(
        pending.songId,
        pending.variantId,
        { commit: false, priority: "foreground" },
      );
      let hydratedVariant = detailResult?.detail?.music_video_project?.direction_script_variants?.find((variant) => (
        echoDirectionVariantId(variant) === pending.variantId
      ));
      if (!hydratedVariant) {
        const response = await saveEchoProjectRequest(`${API_BASE}/api/echos/direction-variant/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending.request),
        }, { editableCut: true });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || payload.error || "The original save request could not be reconciled.");
        detailResult = null;
      }
      setDirectionForkTransitionPending(false);
      await reopenSavedDirectionCut({ ...pending, status: "opening" }, detailResult);
    } catch (error) {
      const reason = error?.message || String(error);
      setPendingSavedDirectionCut({ ...pending, status: "unknown", reason });
      setDirectionForkTransitionPending(false);
      setSaveFeedbackTone("error");
      setSaveSuccessMessage(`The save outcome is still unknown: ${reason} Keep this page open and choose Check save outcome again. Editing remains locked to the original request ID.`);
    }
  };

  const handleSaveWorkingDirectionFork = async () => {
    if (!directionWorkingForkActive || !workingDirectionFork || !activeProject) return;
    beginProjectSave(activeProject.song_id, activeDirectionVariantSelection);
    try {
      const projectToSave = withFreshHyperframeScript(activeProject);
      const request = buildEchoDirectionForkRequest(workingDirectionFork, projectToSave);
      let payload = {};
      let reconciledDetailResult = null;
      try {
        const response = await saveEchoProjectRequest(`${API_BASE}/api/echos/direction-variant/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }, { editableCut: true });
        payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || payload.error || "Failed to save the new direction cut.");
      } catch (error) {
        if (error?.code !== "echo_save_outcome_unknown" || !request.requestedId) throw error;
        reconciledDetailResult = await fetchProjectDetail(
          projectToSave.song_id,
          request.requestedId,
          { commit: false, priority: "foreground" },
        );
        const reconciledVariant = reconciledDetailResult?.detail?.music_video_project?.direction_script_variants?.find((variant) => (
          echoDirectionVariantId(variant) === request.requestedId
        ));
        if (!reconciledVariant) {
          setPendingSavedDirectionCut({
            status: "unknown",
            songId: projectToSave.song_id,
            variantId: request.requestedId,
            fallbackProject: projectToSave,
            request,
            reason: error.message,
          });
          setSaveFeedbackTone("error");
          setSaveSuccessMessage("The save outcome could not be confirmed. Keep this page open and choose Check save outcome. Editing is locked to the original content and request ID, so the recovery cannot create a conflicting duplicate.");
          setEchoOperationNotice("Save outcome unknown. The current edit is preserved and locked until the original request is reconciled.");
          return;
        }
        payload = { variant: { id: request.requestedId }, idempotentReplay: true, reconciledAfterTimeout: true };
      }
      const savedVariantId = payload.variant?.id || payload.id || request.requestedId || "";
      if (!savedVariantId) throw new Error("The new direction cut was saved without an editable cut identifier.");
      const pendingSavedCut = {
        status: "opening",
        songId: projectToSave.song_id,
        variantId: savedVariantId,
        fallbackProject: projectToSave,
        request,
      };
      setDirectorHasUnsavedChanges(false);
      setSongCardPlanSnapshotBySong((current) => beginEchoSongCardPlanWait(
        current,
        projectToSave.song_id,
        savedVariantId,
        savedVariantId,
        { reusePrevious: true },
      ));
      setPendingSavedDirectionCut(pendingSavedCut);
      setDirectionForkTransitionPending(true);
      setSaveFeedbackTone("success");
      setSaveSuccessMessage(payload.reconciledAfterTimeout
        ? "The timed-out save was found on disk under the same request ID. Opening that one saved cut now; no duplicate was created."
        : "New append-only direction cut saved. Opening its protected editable copy; Legacy current and the source cut are unchanged.");
      void reopenSavedDirectionCut(pendingSavedCut, reconciledDetailResult);
    } catch (error) {
      setSaveFeedbackTone("error");
      setSaveSuccessMessage(`Could not save the new cut: ${error.message || String(error)}`);
    } finally {
      setSavingProject(false);
      setSaveStartedAt(0);
    }
  };

  const finishSavedLegacyProject = async (projectToSave) => {
    try {
      const compileResponse = await saveEchoProjectRequest(`${API_BASE}/api/echos/director-project/compile`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: projectToSave.song_id })
      });
      const compilePayload = await compileResponse.json().catch(() => ({}));
      if (!compileResponse.ok) {
        setSaveFeedbackTone("error");
        setSaveSuccessMessage(`Music video blueprint is saved, but its render graph could not be rebuilt: ${compilePayload.message || compilePayload.error || `compile failed (${compileResponse.status})`}. Choose Save again to retry graph preparation; Discard is no longer shown because the edit is already on disk.`);
        return false;
      }
      const refreshedDetailResult = await fetchProjectDetail(
        projectToSave.song_id,
        "",
        { commit: false, priority: "foreground" },
      );
      const refreshedProject = refreshedDetailResult?.detail?.music_video_project;
      const refreshedInspection = inspectEchoDirectorProjectDetail(refreshedDetailResult?.detail);
      if (!refreshedInspection.canOpen) {
        setSaveFeedbackTone("error");
        setSaveSuccessMessage("Music video blueprint is saved, but the Builder could not reload its playable timeline. Reopen this song; the saved edit remains on disk.");
        return false;
      }
      if (!commitDirectorProjectDetail(refreshedDetailResult.detail, refreshedDetailResult.requestGeneration)) {
        setSaveFeedbackTone("error");
        setSaveSuccessMessage("Music video blueprint and render graph are saved, but a newer project refresh superseded the reload. Reopen this song or choose Save again before rendering; the saved edit will not be described as discarded.");
        return false;
      }
      if (!refreshedInspection.hasEditorGraph) {
        const graphReason = refreshedProject?.director_show_graph_receipt?.reason || "graph preparation is still running";
        setSaveFeedbackTone("success");
        setSaveSuccessMessage(graphReason === "server_restart_required"
          ? "Music video blueprint saved to disk. The current timeline is open; restart the Builder once to load its render graph before rendering."
          : "Music video blueprint saved to disk. The current timeline is open while its render graph finishes preparing.");
        setEchoOperationNotice(graphReason === "server_restart_required"
          ? "Save complete. A Builder restart is required before this saved revision can render."
          : "Save complete. Song Card preparation is continuing separately in Tracks.");
        queueSongCardPlanForSavedRevision(projectToSave.song_id, refreshedProject?.updated_at || projectToSave.updated_at);
        return true;
      }
      setSaveFeedbackTone("success");
      setSaveSuccessMessage("Music video blueprint saved to disk. Song Card preparation is continuing separately in Tracks.");
      queueSongCardPlanForSavedRevision(projectToSave.song_id, projectToSave.updated_at, {
        cutId: "legacy",
        project: refreshedProject,
        showGraph: projectToEditorGraph(refreshedProject),
      });
      return true;
    } catch (error) {
      setSaveFeedbackTone("error");
      setSaveSuccessMessage(`Music video blueprint is saved, but graph preparation stopped: ${error.message || String(error)} Choose Save again to retry; the saved edit will not be described as discarded.`);
      return false;
    }
  };

  const handleRecoverPendingLegacySave = async () => {
    const pending = pendingLegacyProjectSave;
    if (!pending || savingProject || directionForkTransitionPending) return;
    setSavingProject(true);
    setSaveStartedAt(Date.now());
    setSaveFeedbackTone("progress");
    setSaveSuccessMessage("Checking whether the exact Legacy edit reached disk…");
    try {
      const detailResult = await fetchProjectDetail(
        pending.songId,
        "",
        { commit: false, priority: "foreground" },
      );
      const diskProject = detailResult?.detail?.music_video_project;
      if (!diskProject) throw new Error("the saved Legacy project could not be read yet");
      if (String(diskProject.updated_at || "") !== String(pending.project.updated_at || "")) {
        const response = await saveEchoProjectRequest(`${API_BASE}/api/echos/director-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ music_video_project: pending.project }),
        }, { outcomeUnknown: true });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || payload.error || `The exact Legacy save retry failed (${response.status}).`);
        }
      }
      setDirectorProjects((current) => current.map((row) => (
        row.music_video_project.song_id === pending.songId
          ? { music_video_project: pending.project }
          : row
      )));
      setDirectorHasUnsavedChanges(false);
      setPendingLegacyProjectSave({ ...pending, status: "preparing" });
      await finishSavedLegacyProject(pending.project);
      setPendingLegacyProjectSave(null);
    } catch (error) {
      setPendingLegacyProjectSave({ ...pending, status: "unknown", reason: error.message || String(error) });
      setSaveFeedbackTone("error");
      setSaveSuccessMessage(`The Legacy save outcome is still unknown: ${error.message || String(error)} Keep this page open and choose Check Legacy save again; editing remains locked until disk state is known.`);
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
    const projectToSave = withFreshHyperframeScript(activeProject);
    beginProjectSave(activeProject.song_id, "legacy");
    try {
      const res = await saveEchoProjectRequest(`${API_BASE}/api/echos/director-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ music_video_project: projectToSave })
      }, { outcomeUnknown: true });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || `Save failed (${res.status}).`);
      }
      setDirectorProjects((current) => current.map((row) => (
        row.music_video_project.song_id === projectToSave.song_id
          ? { music_video_project: projectToSave }
          : row
      )));
      setDirectorHasUnsavedChanges(false);
      await finishSavedLegacyProject(projectToSave);
    } catch (error) {
      console.error("Save error:", error);
      setSaveFeedbackTone("error");
      if (error?.code === "echo_save_outcome_unknown") {
        setPendingLegacyProjectSave({
          status: "unknown",
          songId: projectToSave.song_id,
          project: projectToSave,
          reason: error.message,
        });
        setSaveSuccessMessage("The Legacy save outcome is unknown. Keep this page open and choose Check Legacy save. Editing and Discard stay locked until the Builder proves whether this exact edit reached disk.");
      } else {
        setSaveSuccessMessage(`Could not save the music video blueprint: ${error.message || String(error)}`);
      }
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
    return () => {
      panelLoaderRef.current?.dispose();
      panelLoaderRef.current = null;
      videoDetailControllerRef.current?.abort();
      for (const request of projectDetailControllerBySongRef.current.values()) request.controller.abort();
    };
  }, []);

  useEffect(() => {
    const visit=livingLightSelectionRef.current?.songId===selectedProjectSongId?livingLightSelectionRef.current:null;
    if(visit){directionSelectionPreferenceRef.current='manual';latestDirectionHydrationKeyRef.current='';setSelectedDirectionVariantId(visit.cutId);setWorkingDirectionFork(visit.workingFork);setDirectorHasUnsavedChanges(visit.dirty);livingLightSelectionRef.current=null;return;}
    directionSelectionPreferenceRef.current = "auto-latest";
    latestDirectionHydrationKeyRef.current = "";
    setSelectedDirectionVariantId("legacy");
    setWorkingDirectionFork(null);
    setDirectionForkTransitionPending(false);
    setDirectionCutSelectionPending(false);
  }, [selectedProjectSongId]);

  useEffect(() => {
    const latestVariantId = latestDirectionVariantSummary?.id || "";
    if (!selectedProjectSongId
      || !activeProjectHasDetail
      || !latestVariantId
      || directionSelectionPreferenceRef.current !== "auto-latest"
      || savingProject
      || directionForkTransitionPending
      || Boolean(pendingSavedDirectionCut)
      || Boolean(pendingLegacyProjectSave)
      || directorHasUnsavedChanges) return undefined;
    if (selectedDirectionVariantId === latestVariantId && activeDirectionVariant) return undefined;
    const hydrationKey = `${selectedProjectSongId}:${latestVariantId}`;
    if (latestDirectionHydrationKeyRef.current === hydrationKey) return undefined;
    latestDirectionHydrationKeyRef.current = hydrationKey;
    let cancelled = false;
    setDirectionCutSelectionPending(true);
    setEchoOperationNotice(`Opening the newest saved Director cut, ${latestDirectionVariantSummary.title || latestVariantId}…`);
    void (async () => {
      try {
        const detailResult = await fetchPreparedProjectDetail(selectedProjectSongId, latestVariantId, {
          allowEditorFallback: true,
        });
        if (cancelled) return;
        const detail = detailResult?.detail;
        const detailProject = detail?.music_video_project;
        const hydratedVariant = detail?.music_video_project?.direction_script_variants?.find((variant) => (
          echoDirectionVariantId(variant) === latestVariantId && Array.isArray(variant.timeline)
        ));
        if (!hydratedVariant) throw new Error("the newest saved script detail could not be loaded");
        const hydratedSelectionId = detailProject?.selected_direction_script_variant_id
          || detailProject?.active_direction_script_variant?.id
          || "";
        if (hydratedSelectionId !== latestVariantId) {
          throw new Error("the server did not certify the requested newest cut as the active projection");
        }
        const editableSelection = editableDirectionForkFromDetail(detail, latestVariantId, {
          fallbackProject: activeProject,
        });
        if (!editableSelection?.savedProject?.director_show_graph?.tracks) {
          throw new Error("a verified editor graph is unavailable while its exact preview graph prepares");
        }
        const savedShowGraph = projectToEditorGraph(editableSelection.savedProject);
        const usingEditorFallback = editableSelection.savedProject?.editor_graph_fallback?.requiresExactCertificate !== false;
        if (!commitDirectorProjectDetail(detail, detailResult.requestGeneration)) {
          throw new Error("a newer project refresh superseded this response");
        }
        if (usingEditorFallback) {
          holdSongCardPlanForExactCutCertificate(selectedProjectSongId, latestVariantId);
        } else {
          queueSongCardPlanForSavedRevision(selectedProjectSongId, latestVariantId, {
            cutId: latestVariantId,
            project: editableSelection.savedProject,
            showGraph: savedShowGraph,
          });
        }
        setWorkingDirectionFork(usingEditorFallback
          ? editableSelection.workingFork
          : null);
        setDirectorHasUnsavedChanges(false);
        setSelectedDirectionVariantId(latestVariantId);
        setEchoOperationNotice(`${echoDirectionVariantTitle(hydratedVariant)} opened as the newest saved Director cut.`);
      } catch (error) {
        if (cancelled) return;
        latestDirectionHydrationKeyRef.current = "";
        setEchoOperationNotice(`Could not open the newest saved Director cut: ${error.message || String(error)}. Legacy remains available; retry the song to try again.`);
      } finally {
        if (!cancelled) setDirectionCutSelectionPending(false);
      }
    })();
    return () => {
      cancelled = true;
      // A cached song can change the selected variant during this effect's
      // first render. Release this cancelled auto-load so its replacement can
      // run; never clear a newer manual selection's lock.
      if (latestDirectionHydrationKeyRef.current === hydrationKey
        && directionSelectionPreferenceRef.current === "auto-latest") {
        latestDirectionHydrationKeyRef.current = "";
        setDirectionCutSelectionPending(false);
      }
    };
  }, [
    activeDirectionVariant,
    activeProjectHasDetail,
    directorHasUnsavedChanges,
    directionForkTransitionPending,
    latestDirectionVariantSummary?.id,
    latestDirectionVariantSummary?.title,
    pendingLegacyProjectSave,
    pendingSavedDirectionCut,
    savingProject,
    selectedDirectionVariantId,
    selectedProjectSongId,
  ]);

  useEffect(() => {
    if (!selectedProjectSongId || activeProjectHasDetail || loadingProjectDetail) return;
    fetchProjectDetail(selectedProjectSongId);
  }, [activeProjectHasDetail, loadingProjectDetail, selectedProjectSongId]);

  const buildFreshProjectScript = (project) => generateEchoHyperframeScript(project);

  const withFreshHyperframeScript = (project) => {
    const normalizedProject = attachEchoLyricContract(attachEchoOutputProfile(project));
    return {
      ...normalizedProject,
      hyperframe_script: buildFreshProjectScript(normalizedProject),
      hyperframe_script_stale: false,
      updated_at: new Date().toISOString()
    };
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

  const handleReferenceSongSelect = useCallback((songId) => {
    if (typeof onSelectSong === "function") onSelectSong(songId);
  }, [onSelectSong]);

  const handleReferenceSeek = useCallback((seconds) => {
    const next = Math.max(0, Number(seconds || 0));
    currentTimeRef.current = next;
    setCurrentTime(next);
    if (audioRef.current) audioRef.current.currentTime = next;
  }, []);

  const handleExportMasterReference = useCallback(async (profile = "full") => {
    const condensed = profile === "condensed";
    const filename = condensed
      ? "echo-album-lyrics-and-main-references.md"
      : "echo-album-master-reference.md";
    setExportingMasterReference(profile);
    setEchoOperationNotice(condensed
      ? "Building the under-3-MB lyrics and main references export…"
      : "Building the wiki-ready Echo Album Master Reference File…");
    try {
      const suffix = condensed ? "?profile=condensed" : "";
      const response = await fetch(`${API_BASE}/api/echos/master-reference${suffix}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || `Export failed (${response.status}).`);
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setEchoOperationNotice(`${condensed ? "Lyrics and main references" : "Master Reference File"} exported (${Math.max(1, Math.round(blob.size / 1024)).toLocaleString()} KiB). Source stores were not changed.`);
    } catch (error) {
      setEchoOperationNotice(`Master Reference export failed: ${error?.message || String(error)}`);
    } finally {
      setExportingMasterReference("");
    }
  }, []);


  const overallScore = gapsReport?.overallScore || 0;
  const legacySongsReport = gapsReport?.songs || [];
  const gapById = new Map(legacySongsReport.map(song => [song.id, song]));
  // The canonical song inventory includes songs absent from the older completeness report.
  const songsReport = audioInventory.summary ? Object.values(audioInventory.songs).map(song => ({
    ...(gapById.get(song.id) || { checklist: {}, score: null, completenessUnavailable: true }),
    id: song.id, title: song.title, createdAt: song.createdAt, addedAt: song.addedAt,
  })) : legacySongsReport;

  const filteredSongs = songsReport.filter(song => {
    return searchQuery === "" || 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (song.songId && song.songId.toLowerCase().includes(searchQuery.toLowerCase()));
  }).sort((left, right) => compareEchoSongs(left, right, songSort));

  return (
    <section className="hapa-echos-view" aria-label="Echos Album App View">
      <header className="hapa-songs-hero hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Echos of Other Eras</p>
          <h2>Echo album workspace</h2>
          <span>Check audio files, listen to stems, and develop song visuals.</span>
        </div>
        <div className="hapa-songs-readouts">
          <StatusChip label="METADATA" value={`${overallScore}%`} tone={overallScore === 100 ? "green" : "rose"} />
          <StatusChip label="SONGS" value={directorProjects.length || "—"} tone="cyan" />
          <StatusChip label="VIDEOS" value={gapsReport?.summary?.totalVideos || 0} tone="fuchsia" />
          <button
            className="hapa-btn"
            data-intent="primary"
            data-testid="echo-master-reference-export"
            type="button"
            disabled={Boolean(exportingMasterReference)}
            onClick={() => handleExportMasterReference("full")}
            title="Export every Echo Album track, lyric, reference association, metadata field, and telemetry record as one cross-linked Markdown file."
          >
            <Download size={14} />
            {exportingMasterReference === "full" ? "Exporting…" : "Export Master Reference"}
          </button>
          <button
            className="hapa-btn"
            data-intent="primary"
            data-testid="echo-condensed-reference-export"
            type="button"
            disabled={Boolean(exportingMasterReference)}
            onClick={() => handleExportMasterReference("condensed")}
            title="Export all Echo Album titles and available lyrics plus curated main references in a Markdown file capped at 3 MB."
          >
            <Download size={14} />
            {exportingMasterReference === "condensed" ? "Exporting…" : "Lyrics + Main References"}
          </button>
        </div>
      </header>

      <AudioAtlasPanel songId={selectedProjectSongId} selection={atlasSelection} inventory={audioInventory} />
      <details className="echo-song-import-disclosure"><summary>Add or import a song</summary><EchoSongIngestPipeline /></details>

      <div aria-label="Echo panel loading status" aria-live="polite" style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 14 }}>
        {Object.entries({ catalog: "Songs", board: "Board", gaps: "Analysis", shaders: "Shaders" }).map(([key, label]) => {
          const status = panelStatus[key] || { state: "loading", message: "Loading…" };
          return status.state === "ready" ? null : (
            <div key={key} role={status.state === "error" ? "alert" : "status"}>
              <strong>{label}:</strong> {status.message}{" "}
              {["error", "partial", "slow"].includes(status.state) && <button className="hapa-btn" type="button" onClick={() => fetchState(key)} aria-label={`Retry ${label.toLowerCase()}`}>Retry</button>}
            </div>
          );
        })}
      </div>

      <div className="echos-workspace-grid" style={{
        display: 'grid',
        gridTemplateColumns: ["director", "references"].includes(activeDirectoryTab) ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.6fr)',
        gap: '20px',
        padding: '10px 0',
        height: 'calc(100vh - 220px)',
        minHeight: '750px',
        maxHeight: '950px' 
      }}>
        {!["director", "references"].includes(activeDirectoryTab) && (
          <div className="echos-left-col" style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%', minHeight: 0, minWidth: 0 }}>
            <div className="panel hapa-panel board-wrap" data-variant="notch" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="section-head hapa-panel-head" style={{ flexShrink: 0 }}>
                <span><KanbanSquare size={15} /> Echos Kanban Board</span>
                <em>{board?.lanes?.reduce((sum, l) => sum + l.cards.length, 0) || 0}</em>
              </div>
              <EchoKanbanBoard board={board} apiBase={API_BASE} onBoardChange={setBoard} onNotice={setEchoOperationNotice} />
            </div>

            <div className="panel hapa-panel" data-variant="notch" style={{ padding: '12px', flexShrink: 0 }}>
              <div className="section-head hapa-panel-head">
                <span><WandSparkles size={15} /> Collaborative Enrichment Operations</span>
              </div>
              <p style={{ fontSize: '11px', opacity: 0.8, margin: '8px 0' }}>
                Enrichment and director planning queue dry-runs by default. Apply mode is reserved for explicit write-capable maintenance passes with backups and provenance stamps.
              </p>
              {echoOperationNotice && (
                <p role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: '10px', color: 'var(--hapa-neon-gold)', margin: '0 0 8px 0' }}>
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
              className={`hapa-btn ${activeDirectoryTab === "references" ? "active" : ""}`}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '11px',
                background: activeDirectoryTab === "references" ? 'rgba(69, 228, 255, 0.15)' : 'rgba(0,0,0,0.2)',
                border: activeDirectoryTab === "references" ? '1px solid #45e4ff' : '1px solid rgba(255,255,255,0.08)',
                color: activeDirectoryTab === "references" ? '#45e4ff' : '#ccc',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s ease'
              }}
              onClick={() => {
                setActiveDirectoryTab("references");
                setSearchQuery("");
              }}
            >
              🕸️ Reference Atlas
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
                  commitSelectedProjectSongId(directorProjects[0].music_video_project.song_id);
                }
              }}
            >
              🎬 Director Workbench
            </button>
            <button
              className={`hapa-btn ${activeDirectoryTab === "editions" ? "active" : ""}`}
              style={{
                flex: 1,
                padding: '6px',
                fontSize: '11px',
                background: activeDirectoryTab === "editions" ? 'rgba(74, 222, 128, 0.15)' : 'rgba(0,0,0,0.2)',
                border: activeDirectoryTab === "editions" ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.08)',
                color: activeDirectoryTab === "editions" ? '#4ade80' : '#ccc',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s ease'
              }}
              onClick={() => {
                setActiveDirectoryTab("editions");
                setSearchQuery("");
                void loadSongCardCatalog();
              }}
            >
              🏷️ Song Card Editions
            </button>
          </div>

          {(activeDirectoryTab === "songs" || activeDirectoryTab === "director") && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '12px', flexShrink: 0 }}>
              Sort songs
              <select aria-label="Sort songs" value={songSort} onChange={event => setSongSort(event.target.value)} title="Uses the saved album entry date. Songs without dates appear last." style={{ background: '#111827', color: '#fff', border: '1px solid #475569', borderRadius: '4px', padding: '6px' }}>
                <option value="name">Name (A–Z)</option>
                <option value="newest">Date created / added — newest first</option>
                <option value="oldest">Date created / added — oldest first</option>
              </select>
            </label>
          )}
          {activeDirectoryTab === "songs" ? (
            <>
              <div className="song-audio-toolbar">
                <div className="section-head hapa-panel-head"><span><Music size={15} /> Song library · {songsReport.length} songs</span></div>
                <p style={{fontSize:13,margin:0}}>Check your audio files, then open a song to listen and review.</p>
                <div className="song-audio-check" role="status"><button disabled={audioInventory.status==='loading'} onClick={audioInventory.refresh}>{audioInventory.status==='loading'?'Checking files…':'Recheck files'}</button><span>{audioInventory.error || (audioInventory.summary ? `${audioInventory.summary.wav} WAV · ${audioInventory.summary.mp3} MP3 · ${audioInventory.summary.complete_wav_stems} WAV stem sets · ${audioInventory.summary.complete_mp3_stems} MP3 stem sets` : 'Checking local sources…')}</span></div>
                <label>Search songs<input placeholder="Search songs by title or ID..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} /></label>
                <label>File availability<select aria-label="File availability" value={audioFileFilter} onChange={e=>setAudioFileFilter(e.target.value)}><option value="all">All songs</option><option value="attention">Any missing or unchecked files</option><option value="wav">WAV missing or unchecked</option><option value="mp3">MP3 missing or unchecked</option><option value="wav_stems">WAV stems incomplete or unchecked</option><option value="mp3_stems">MP3 stems incomplete or unchecked</option></select></label>
                <small>{filteredSongs.filter(song=>matchesFileFilter(audioInventory.songs[song.id],audioFileFilter)).length} matching songs</small>
              </div>
              <div className="songs-gaps-grid" style={{display:'flex',flexDirection:'column',gap:8,flex:1,overflowY:'auto'}}>
                {filteredSongs.filter(song=>matchesFileFilter(audioInventory.songs[song.id],audioFileFilter)).map(song=><article className="song-audio-row hapa-card" data-card-type="media" data-granularity="mini" key={song.id}>
                  <button aria-expanded={expandedSongId===song.id} onClick={()=>setExpandedSongId(expandedSongId===song.id?null:song.id)}><strong>{song.title}</strong><span>{expandedSongId===song.id?'Hide details −':'Details +'}</span></button>
                  <SongAudioAvailability entry={audioInventory.songs[song.id]} loading={audioInventory.status==='loading'} error={audioInventory.error} />
                  {expandedSongId===song.id&&<div className="song-audio-expanded"><SongAudioUpload key={song.id} songId={song.id} title={song.title} onSaved={audioInventory.refresh} /><button onClick={()=>setAtlasSelection({songId:song.id,nonce:Date.now()})}>Open in Audio Atlas →</button><details><summary>File locations & missing stems</summary><SongAudioAvailability entry={audioInventory.songs[song.id]} details loading={audioInventory.status==='loading'} error={audioInventory.error} /></details><details><summary>Other song metadata</summary><p>{song.completenessUnavailable?'Metadata completeness has not been assessed.':`Metadata checklist: ${song.score}% complete. This does not measure audio quality or timing accuracy.`}</p>{Object.entries(song.checklist).map(([key,value])=><p key={key}>{key.replace(/^has/,'').replace(/([A-Z])/g,' $1').trim()}: {value?'Recorded':'Not recorded'}</p>)}</details></div>}
                </article>)}
                {!filteredSongs.some(song=>matchesFileFilter(audioInventory.songs[song.id],audioFileFilter))&&<p>No songs match. Clear the search or choose All songs.</p>}
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
                        aria-label="Search song blueprints"
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
          ) : activeDirectoryTab === "references" ? (
            <EchoReferenceExplorer
              apiBase={API_BASE}
              initialSongId={selectedSongId || selectedProjectSongId || ""}
              currentTime={currentTime}
              onSelectSong={handleReferenceSongSelect}
              onSeek={handleReferenceSeek}
              onNotice={setEchoOperationNotice}
            />
          ) : activeDirectoryTab === "editions" ? (
            <>
              {/* Song Card Editions Shelf */}
              <div className="section-head hapa-panel-head" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><Music size={15} /> Song Card Editions ({mintedSongCardRows.length} minted · {awaitingSongCardRows.length} awaiting confirmation)</span>
                <button
                  type="button"
                  data-testid="echo-song-card-editions-refresh"
                  className="hapa-btn"
                  style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', cursor: songCardCatalogLoading ? 'wait' : 'pointer', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', color: '#ccc', opacity: songCardCatalogLoading ? 0.6 : 1 }}
                  disabled={songCardCatalogLoading}
                  onClick={() => { void loadSongCardCatalog(); }}
                >
                  {songCardCatalogLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {songCardCatalogError && (
                <div data-testid="echo-song-card-editions-error" role="alert" style={{ flexShrink: 0, padding: '8px 10px', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', background: 'rgba(127,29,29,0.18)', color: '#fca5a5', fontSize: '11px' }}>
                  <strong>The editions shelf could not load.</strong> {songCardCatalogError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {awaitingSongCardRows.length > 0 && (
                  <section data-testid="echo-song-card-editions-awaiting" style={{ border: '1px solid rgba(246,201,109,0.4)', borderRadius: '4px', background: 'rgba(120,53,15,0.12)', padding: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f6c96d', marginBottom: '6px' }}>
                      Awaiting your confirmation
                    </div>
                    {awaitingSongCardRows.map((row) => (
                      <div key={row.songId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <strong style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{row.title}</strong>
                          <span style={{ fontSize: '8px', padding: '0.5px 4px', borderRadius: '2px', fontWeight: 'bold', background: 'rgba(246,201,109,0.15)', color: '#f6c96d', border: '1px solid rgba(246,201,109,0.35)', flexShrink: 0 }}>
                            {row.status === "render-ready" ? "FINAL VIDEO READY" : "AWAITING MINT"}
                          </span>
                          {row.predictedEdition > 0 && <span style={{ fontSize: '9px', opacity: 0.6 }}>next · edition {row.predictedEdition}</span>}
                        </div>
                        <button type="button" style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', background: 'rgba(8,54,74,0.9)', border: '1px solid #00f3ff', color: '#bdfbff', borderRadius: '3px', flexShrink: 0 }} onClick={() => openSongCardEditionSong(row.songId)}>
                          Open song
                        </button>
                      </div>
                    ))}
                  </section>
                )}
                {awaitingSongCardRows.length === 0 && !songCardCatalogError && (
                  <div style={{ textAlign: 'center', opacity: 0.5, fontSize: '11px', padding: '12px' }}>
                    No renders are waiting for your confirmation right now.
                  </div>
                )}

                <section data-testid="echo-song-card-editions-minted" style={{ border: '1px solid rgba(74,222,128,0.35)', borderRadius: '4px', background: 'rgba(20,83,45,0.12)', padding: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4ade80', marginBottom: '6px' }}>
                    Minted editions
                  </div>
                  {mintedSongCardRows.map((row) => (
                    <div key={row.songId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <strong style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{row.title}</strong>
                        <span style={{ fontSize: '8px', padding: '0.5px 4px', borderRadius: '2px', fontWeight: 'bold', background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.35)', flexShrink: 0 }}>
                          {row.latestEdition} EDITION{row.latestEdition > 1 ? "S" : ""}
                        </span>
                      </div>
                      <button type="button" style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.25)', color: '#e2e8f0', borderRadius: '3px', flexShrink: 0 }} onClick={() => openSongCardEditionSong(row.songId)}>
                        Open song
                      </button>
                    </div>
                  ))}
                  {mintedSongCardRows.length === 0 && (
                    <div style={{ textAlign: 'center', opacity: 0.5, fontSize: '11px', padding: '12px' }}>
                      No immutable editions minted yet.
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : (
            <>
              {/* Director Workbench View */}
              <div className="section-head hapa-panel-head" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><Film size={15} /> Director Video Blueprint Workbench ({directorProjects.length} plans loaded)</span>
                {(savingProject || directionCutSelectionPending || directionForkTransitionPending || pendingSavedDirectionCut || pendingLegacyProjectSave || saveSuccessMessage) && (
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
                    <span>
                      {savingProject
                        ? saveElapsedSeconds >= 10
                          ? `Saving cut · ${saveElapsedSeconds}s · waiting for disk acknowledgment…`
                          : `Saving cut · ${saveElapsedSeconds}s…`
                        : directionCutSelectionPending
                          ? "Preparing this song’s saved preview graphs…"
                        : directionForkTransitionPending
                          ? pendingSavedDirectionCut?.status === "unknown"
                            ? "Checking the original save outcome…"
                            : "Cut saved · opening its editable copy…"
                          : pendingLegacyProjectSave?.status === "preparing"
                            ? "Legacy edit is on disk · preparing its render graph…"
                          : saveSuccessMessage}
                    </span>
                    {pendingSavedDirectionCut && !directionForkTransitionPending && !savingProject && (
                      <button
                        type="button"
                        data-testid="echo-recover-saved-direction-cut"
                        onClick={handleRecoverPendingDirectionCut}
                        style={{ marginLeft: '8px', background: 'rgba(15,23,42,.8)', border: '1px solid currentColor', color: 'inherit', borderRadius: '3px', padding: '2px 7px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        {pendingSavedDirectionCut.status === "unknown" ? "Check save outcome" : "Reopen saved cut"}
                      </button>
                    )}
                    {pendingLegacyProjectSave?.status === "unknown" && !savingProject && (
                      <button
                        type="button"
                        data-testid="echo-recover-legacy-save"
                        onClick={handleRecoverPendingLegacySave}
                        style={{ marginLeft: '8px', background: 'rgba(15,23,42,.8)', border: '1px solid currentColor', color: 'inherit', borderRadius: '3px', padding: '2px 7px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Check Legacy save
                      </button>
                    )}
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
                    {visibleDirectorProjects.map(p => {
                      const proj = p.music_video_project;
                      const isSelected = selectedProjectSongId === proj.song_id;
                      const perspectiveColor = proj.perspective === 'red' ? 'var(--hapa-neon-red)' : proj.perspective === 'green' ? 'var(--hapa-neon-green)' : 'var(--hapa-neon-cyan)';
                      
                      return (
                        <button
                          type="button"
                          key={proj.song_id} 
                          aria-label={`Open ${proj.song_title}`}
                          aria-pressed={isSelected}
                          disabled={directorEditingLocked || (directorHasUnsavedChanges && !isSelected)}
                          title={directorHasUnsavedChanges && !isSelected ? "Save or cancel the current edit before switching songs." : proj.song_title}
                          onClick={() => { void handleSelectDirectorProjectSong(proj.song_id); }}
                          style={{ 
                            width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '6px 8px', 
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                            border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                            cursor: directorEditingLocked || directorHasUnsavedChanges ? 'not-allowed' : 'pointer',
                            opacity: directorHasUnsavedChanges && !isSelected ? 0.58 : 1,
                            fontSize: '11px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0, marginRight: '8px', color: isSelected ? 'var(--hapa-neon-violet)' : 'inherit', fontWeight: isSelected ? 'bold' : 'normal', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {proj.song_title}
                          </span>
                          
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
                        </button>
                      );
                    })}
                    {directorProjects.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '12px', opacity: 0.5, fontSize: '11px' }}>
                        {panelStatus.catalog?.state === "error"
                          ? "Songs could not be loaded. Use Retry songs above."
                          : !panelStatus.catalog || ["loading", "slow"].includes(panelStatus.catalog.state)
                            ? "Loading saved director plans…"
                            : "No saved director plans were found."}
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
                    const directorPreviewFrame = activeDirectorPreviewSource
                      ? projectEchoDirectorPreviewFrame({
                        source: activeDirectorPreviewSource,
                        timeSeconds: currentTime,
                        playing: isPlaying,
                        shaderTypeResolver,
                      })
                      : null;
                    const projectedCueIndex = directorPreviewFrame?.primaryMediaCue?.sourceCueIndex;
                    const engineOwnsProject = echoPlaybackSnapshot?.projectKey === String(activeProject.song_id || activeProject.id || activeProject.song_title || "");
                    const playheadShotIndex = Number.isInteger(projectedCueIndex)
                      ? projectedCueIndex
                      : engineOwnsProject && echoPlaybackSnapshot.targetShotIndex >= 0
                        ? echoPlaybackSnapshot.targetShotIndex
                        : activeProject.timeline?.findIndex(item => currentTime >= item.start_sec && currentTime < item.end_sec);
                    const currentTimelineItem = previewTimeline[playheadShotIndex] || previewTimeline[0];
                    const lookaheadTimelineItems = previewTimeline.slice(
                      Math.max(0, playheadShotIndex) + 1,
                      Math.max(0, playheadShotIndex) + 1 + ECHO_VIDEO_LOOKAHEAD_COUNT,
                    ) || [];
                    const activeTimelineItem = activeProject.timeline?.[selectedShotIndex] || activeProject.timeline?.[0];
                    const activeVisualizerItem = activeProject.visualizer_timeline?.[selectedVisualizerIndex] || activeProject.visualizer_timeline?.[0];
                    const savedRevolvingShaderVisibility = Number(activeProject.revolving_shader_visibility);
                    const hasSavedRevolvingShaderVisibility = activeProject.revolving_shader_visibility !== null
                      && activeProject.revolving_shader_visibility !== undefined
                      && Number.isFinite(savedRevolvingShaderVisibility);
                    const revolvingShaderVisibility = Math.max(0, Math.min(1, hasSavedRevolvingShaderVisibility
                      ? savedRevolvingShaderVisibility
                      : Number(activeVisualizerItem?.opacity ?? 0.48)));
                    const activePersistentShaderSlots = normalizeEchoPersistentShaderSlots(activeProject);
                    const pendingPreviewProxyCount = previewTimeline.filter((item) => shotMediaType(item) === "video" && item.media_contract?.proxy?.status !== "ready").length;
                    const isVerticalOutput = activeOutputProfile.id === "vertical";
                    const previewRecordingVideoBuffering = shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready;
                    const previewRecordingAudioFailed = Boolean(audioPlaybackError);
                    const previewRecordingAudioBuffering = !previewRecordingAudioFailed && (audioLoading || !audioPlaybackReady);
                    const previewPlaybackStartBlocked = audioLoading
                      || (!previewRecordingAudioFailed && !isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready);
                    const previewRecordingBusy = previewRecordingState === "preparing" || previewRecordingState === "saving";
                    const previewRecordingStartBlocked = previewRecordingState !== "recording"
                      && (Boolean(activeVisualSignalSolo) || previewRecordingBusy || (!previewRecordingAudioFailed && (previewRecordingAudioBuffering || previewRecordingVideoBuffering)));
                    const previewRecordingReadinessLabel = activeVisualSignalSolo ? "RESTORE ALL VISUAL SIGNALS TO RECORD" : previewRecordingState === "preparing"
                      ? "STARTING RECORDING + PLAYBACK"
                      : previewRecordingState === "saving"
                        ? "SAVING RECORDING"
                        : previewRecordingState === "recording"
                          ? (!audioPlaybackReady ? "RECORDING · AUDIO BUFFERING" : !isPlaying ? "RECORDING · PLAYBACK PAUSED" : "RECORDING AUDIO + VIDEO")
                          : previewRecordingAudioFailed
                            ? "RECORD · AUDIO FAILED · RETRY REQUIRED"
                            : previewRecordingAudioBuffering
                              ? "RECORD · BUFFERING AUDIO"
                              : previewRecordingVideoBuffering
                                ? "RECORD · BUFFERING VIDEO"
                                : "RECORD READY · STARTS PLAYBACK";
                    const previewRecordingQualityLabel = echoPreviewRecordingQualityLabel({
                      width: activeOutputProfile?.width,
                      height: activeOutputProfile?.height,
                    });
                    const directorPreviewWidth = isVerticalOutput
                      ? ECHO_VERTICAL_EXPANDED_PREVIEW_WIDTH
                      : ECHO_EXPANDED_PREVIEW_WIDTH;
                    const compactPreviewWidth = isVerticalOutput ? "min(100%, 315px, 31.5vh)" : "100%";

                    const activeShotIndex = playheadShotIndex !== -1 && playheadShotIndex !== undefined ? playheadShotIndex : 0;
                    const activeCameraKeyframe = directorPreviewFrame?.camera?.keyframe
                      || echoCameraKeyframeAt(activeShowGraph?.directorV2?.cameraKeyframes, currentTime);
                    const sharedCameraShot = currentTimelineItem && directorPreviewFrame?.camera
                      ? {
                        ...currentTimelineItem,
                        camera_motion: directorPreviewFrame.camera.motion,
                        camera_intensity: directorPreviewFrame.camera.intensity,
                        ...(directorPreviewFrame.camera.speed === null ? {} : { camera_speed: directorPreviewFrame.camera.speed }),
                      }
                      : currentTimelineItem;
                    const presentedElementForCurrentShot = presentedMediaRef.current?.mediaId === String(currentTimelineItem?.media_id || "")
                      ? presentedMediaRef.current.element
                      : null;
                    const activeShotSourceDimensions = resolveEchoShotSourceDimensions(currentTimelineItem, presentedElementForCurrentShot);
                    const cameraPreviewStyle = cameraMotionStyleForShot(
                      sharedCameraShot,
                      currentTime,
                      activeShotSourceDimensions.isPortrait,
                      activeShotIndex,
                      activeCameraKeyframe?.crop,
                    );

                    const previewTransitionState = directorPreviewFrame?.transition || (currentTimelineItem
                      ? echoDirectorPreviewMediaTransitionState(
                        currentTimelineItem,
                        currentTime,
                        activeOutputProfile.fps,
                      )
                      : null);
                    const previewOpacity = previewTransitionState?.opacity ?? 1;

                    const formatTime = (secs) => {
                      const m = Math.floor(secs / 60);
                      const s = Math.floor(secs % 60);
                      const ms = Math.floor((secs % 1) * 10);
                      return `${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
                    };

                    const handlePlayPause = () => {
                      if (audioPlaybackError) {
                        retryPreviewAudio();
                        return;
                      }
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
                                disabled={loadingProjectDetail || directorEditingLocked || directorHasUnsavedChanges}
                                onChange={async (event) => {
                                  if (directorEditingLocked || directorHasUnsavedChanges) return;
                                  const nextVariantId = event.target.value;
                                  directionSelectionPreferenceRef.current = "manual";
                                  latestDirectionHydrationKeyRef.current = "";
                                  setDirectionCutSelectionPending(true);
                                  setCurrentTime(0);
                                  currentTimeRef.current = 0;
                                  if (audioRef.current) audioRef.current.currentTime = 0;
                                  if (nextVariantId === "legacy") {
                                    setEchoOperationNotice("Loading the saved Legacy graph…");
                                    try {
                                      const legacyDetailResult = await fetchPreparedProjectDetail(selectedProjectSongId, "");
                                      const legacyProject = legacyDetailResult?.detail?.music_video_project;
                                      if (!legacyProject?.director_show_graph?.tracks) {
                                        throw new Error("the saved Legacy preview graph is unavailable");
                                      }
                                      if (!commitDirectorProjectDetail(legacyDetailResult.detail, legacyDetailResult.requestGeneration)) {
                                        throw new Error("a newer project refresh superseded the Legacy response");
                                      }
                                      const legacyShowGraph = projectToEditorGraph(legacyProject);
                                      queueSongCardPlanForSavedRevision(
                                        selectedProjectSongId,
                                        legacyProject.director_show_graph_receipt?.sourceHash || legacyProject.updated_at || "legacy",
                                        { cutId: "legacy", project: legacyProject, showGraph: legacyShowGraph },
                                      );
                                      setWorkingDirectionFork(null);
                                      setDirectorHasUnsavedChanges(false);
                                      setSelectedDirectionVariantId("legacy");
                                      setSaveFeedbackTone("success");
                                      setSaveSuccessMessage("Legacy reopened from its saved graph. Newer cuts and their working copies remain unchanged.");
                                      setEchoOperationNotice("Legacy baseline opened from its saved graph.");
                                    } catch (error) {
                                      setEchoOperationNotice(`Could not load the saved Legacy graph: ${error.message || String(error)}. The current editable cut remains open.`);
                                    } finally {
                                      setDirectionCutSelectionPending(false);
                                    }
                                    return;
                                  }
                                  setSongCardPlanSnapshotBySong((current) => beginEchoSongCardPlanWait(
                                    current,
                                    selectedProjectSongId,
                                    `loading:${nextVariantId}`,
                                    nextVariantId,
                                  ));
                                  setEchoOperationNotice(`Loading ${nextVariantId}…`);
                                  try {
                                    const detailResult = await fetchPreparedProjectDetail(selectedProjectSongId, nextVariantId, {
                                      allowEditorFallback: true,
                                    });
                                    const detail = detailResult?.detail;
                                    const hydratedVariant = detail?.music_video_project?.direction_script_variants?.find((variant) => (
                                      echoDirectionVariantId(variant) === nextVariantId && Array.isArray(variant.timeline)
                                    ));
                                    if (!hydratedVariant) throw new Error("its saved script detail could not be loaded");
                                    const editableSelection = editableDirectionForkFromDetail(detail, nextVariantId, {
                                      fallbackProject: activeProject,
                                    });
                                    if (!editableSelection) throw new Error("its certified card graph is still preparing");
                                    if (!editableSelection.savedProject?.director_show_graph?.tracks) {
                                      throw new Error("a verified editor graph is unavailable while its exact render graph prepares");
                                    }
                                    const savedShowGraph = projectToEditorGraph(editableSelection.savedProject);
                                    const usingEditorFallback = editableSelection.savedProject?.editor_graph_fallback?.requiresExactCertificate !== false;
                                    if (!commitDirectorProjectDetail(detail, detailResult.requestGeneration)) {
                                      throw new Error("a newer detail refresh superseded this response");
                                    }
                                    if (usingEditorFallback) {
                                      holdSongCardPlanForExactCutCertificate(selectedProjectSongId, nextVariantId);
                                    } else {
                                      queueSongCardPlanForSavedRevision(
                                        selectedProjectSongId,
                                        nextVariantId,
                                        {
                                          cutId: nextVariantId,
                                          project: editableSelection.savedProject,
                                          showGraph: savedShowGraph,
                                        },
                                      );
                                    }
                                    setWorkingDirectionFork(editableSelection.workingFork);
                                    setDirectorHasUnsavedChanges(false);
                                    setSelectedDirectionVariantId(nextVariantId);
                                    setSaveFeedbackTone("success");
                                    setSaveSuccessMessage(usingEditorFallback
                                      ? "Editable copy opened from the selected cut. Its exact final-render graph is still certifying, so Render stays unavailable until that receipt arrives; saving still creates a new cut."
                                      : "Editable copy opened from the selected cut. Its higher-quality cards and source lineage are preserved; saving creates a new cut.");
                                    setEchoOperationNotice(usingEditorFallback
                                      ? `${echoDirectionVariantTitle(hydratedVariant)} opened for editing while final-render certification continues.`
                                      : `${echoDirectionVariantTitle(hydratedVariant)} opened for editing.`);
                                  } catch (error) {
                                    setSongCardPlanSnapshotBySong((current) => restoreEchoSongCardPlanSnapshot(
                                      current,
                                      selectedProjectSongId,
                                    ));
                                    setEchoOperationNotice(`Could not open ${nextVariantId} for editing yet: ${error.message || String(error)}. The current editable cut remains open.`);
                                  } finally {
                                    setDirectionCutSelectionPending(false);
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
                                  cursor: loadingProjectDetail || directorEditingLocked
                                    ? 'wait'
                                    : directorHasUnsavedChanges
                                      ? 'not-allowed'
                                      : 'pointer'
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
                              <span style={{ fontSize: '8px', color: directorHasUnsavedChanges ? '#f6c96d' : directionVariantReadOnly ? '#6ee7b7' : '#94a3b8', textAlign: 'right' }}>
                                {directorHasUnsavedChanges
                                  ? directionWorkingForkActive
                                    ? 'Unsaved changes · Save or cancel before switching cuts or songs'
                                    : 'Unsaved Legacy changes · Save or discard before switching cuts or songs'
                                  : directionWorkingForkActive
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
                            {directorHasUnsavedChanges && !directionWorkingForkActive && activeDirectionVariantSelection === "legacy" && (
                              <button
                                type="button"
                                data-testid="echo-discard-legacy-edits"
                                disabled={directorEditingLocked}
                                onClick={handleDiscardLegacyChanges}
                                style={{ background: 'transparent', border: '1px solid #f59e0b', color: '#fcd34d', fontSize: '9px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                Discard Legacy edits
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
                              aria-label="Lyric template"
                              data-testid="echo-lyric-template"
                              value={activeLyricContract.templateId}
                              disabled={directorEditingLocked}
                              onChange={(e) => {
                                const template = echoLyricTemplate(e.target.value);
                                handleUpdateProjectSettings({
                                  lyric_variant: template.legacyVariant,
                                  lyric_template_id: template.id,
                                  lyrics: {
                                    ...activeLyricContract,
                                    legacyVariant: template.legacyVariant,
                                    templateId: template.id,
                                    templateLabel: template.label,
                                  },
                                });
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
                              {ECHO_LYRIC_TEMPLATES.map((template) => (
                                <option key={template.id} value={template.id}>{template.label}</option>
                              ))}
                            </select>
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                border: activeLyricContract.enabled ? '1px solid rgba(34,211,238,0.45)' : '1px solid rgba(148,163,184,0.3)',
                                background: activeLyricContract.enabled ? 'rgba(6,182,212,0.12)' : 'rgba(15,23,42,0.7)',
                                color: activeLyricContract.enabled ? '#a5f3fc' : '#94a3b8',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '9px',
                                fontWeight: 'bold',
                                cursor: directorEditingLocked ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <input
                                type="checkbox"
                                aria-label="Lyrics enabled"
                                data-testid="echo-lyrics-enabled"
                                checked={activeLyricContract.enabled}
                                disabled={directorEditingLocked}
                                onChange={(event) => {
                                  const enabled = event.target.checked;
                                  handleUpdateProjectSettings({
                                    lyrics_enabled: enabled,
                                    lyrics: { ...activeLyricContract, enabled },
                                  });
                                }}
                                style={{ width: '12px', height: '12px', accentColor: '#06b6d4' }}
                              />
                              LYRICS {activeLyricContract.enabled ? 'ON' : 'OFF'}
                            </label>
                            <label style={{ color: "#cbd5e1", fontSize: "10px", display: "flex", alignItems: "center", gap: 5 }} title="Turn off to show the complete phrase without word highlighting, dimming, or word-by-word animation.">
                              <input type="checkbox" aria-label="Highlight individual words" checked={activeLyricContract.highlightWords} disabled={directorEditingLocked}
                                onChange={(event) => handleUpdateProjectSettings({ lyrics: { ...activeLyricContract, highlightWords: event.target.checked } })} />
                              Highlight individual words
                            </label>
                            <label style={{ color: "#cbd5e1", fontSize: "10px", display: "flex", alignItems: "center", gap: 5 }}>
                              <input type="checkbox" aria-label="Reduce lyric motion" checked={activeLyricContract.reducedMotion} disabled={directorEditingLocked}
                                onChange={(event) => handleUpdateProjectSettings({ lyrics: { ...activeLyricContract, reducedMotion: event.target.checked } })} />
                              Reduce lyric motion
                            </label>
                            <label style={{ color:'#cbd5e1',fontSize:'10px',display:'flex',alignItems:'center',gap:5 }}>
                              Lyric motion
                              <input type="range" aria-label="Lyric motion intensity" min="0" max="100" step="5" value={Math.round(activeLyricContract.motionIntensity*100)}
                                disabled={directorEditingLocked || activeLyricContract.reducedMotion} style={{width:70}}
                                onChange={event=>handleUpdateProjectSettings({lyrics:{...activeLyricContract,motionIntensity:Number(event.target.value)/100}})} />
                              <output>{Math.round(activeLyricContract.motionIntensity*100)}%</output>
                            </label>
                            {activeLyricTimingMissing && (
                              <span
                                data-testid="echo-lyrics-source-missing"
                                title="No source-backed lyric text or timing was imported for this non-instrumental track. The Builder will not invent lyrics; import the source lyrics and timing to enable the overlay."
                                style={{ color: '#fbbf24', fontSize: '8px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                              >
                                SOURCE LYRICS MISSING
                              </span>
                            )}
                            {activeLyricTimingPending && (
                              <span
                                data-testid="echo-lyrics-timing-pending"
                                title="Source lyrics are captured. The overlay waits for measured alignment against this exact song audio."
                                style={{ color: '#a5f3fc', fontSize: '8px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                              >
                                LYRICS CAPTURED · TIMING PENDING
                              </span>
                            )}
                            <select
                              aria-label="Lyric position"
                              value={activeProject.lyric_position || "bottom-center"}
                              disabled={directorEditingLocked}
                              onChange={(event) => {
                                const position = event.target.value;
                                handleUpdateProjectSettings({
                                  lyric_position: position,
                                  lyrics: { ...activeLyricContract, position },
                                });
                              }}
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
                              onChange={(event) => {
                                const style = event.target.value;
                                handleUpdateProjectSettings({
                                  lyric_style: style,
                                  lyrics: { ...activeLyricContract, style },
                                });
                              }}
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
                            <label style={{ color:'#cbd5e1',fontSize:'10px',display:'flex',alignItems:'center',gap:5 }}>
                              Font
                              <select
                                aria-label="Lyric font"
                                data-testid="echo-lyric-font"
                                value={activeLyricContract.fontFamily}
                                disabled={directorEditingLocked}
                                onChange={(event) => handleUpdateProjectSettings({
                                  lyrics: { ...activeLyricContract, fontFamily: event.target.value },
                                })}
                                style={{
                                  background: '#090d16',
                                  border: '1px solid rgba(255,255,255,0.15)',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  minWidth: '104px',
                                  outline: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer'
                                }}
                              >
                                {ECHO_LYRIC_FONT_OPTIONS.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label style={{ color:'#cbd5e1',fontSize:'10px',display:'flex',alignItems:'center',gap:5 }}>
                              Size
                              <input
                                type="range"
                                aria-label="Lyric font size"
                                data-testid="echo-lyric-font-size"
                                min="50"
                                max="200"
                                step="5"
                                value={Math.round(activeLyricContract.fontScale*100)}
                                disabled={directorEditingLocked}
                                style={{width:70}}
                                onChange={(event) => handleUpdateProjectSettings({
                                  lyrics: { ...activeLyricContract, fontScale: Number(event.target.value)/100 },
                                })}
                              />
                              <output>{Math.round(activeLyricContract.fontScale*100)}%</output>
                            </label>
                            <label style={{ color:'#cbd5e1',fontSize:'10px',display:'flex',alignItems:'center',gap:5 }}>
                              Color
                              <input
                                type="color"
                                aria-label="Lyric color"
                                data-testid="echo-lyric-color"
                                value={activeLyricContract.textColor || LYRIC_STYLE_OPTIONS.find((option) => option.value === activeLyricContract.style)?.textColor || '#e0faff'}
                                disabled={directorEditingLocked}
                                onChange={(event) => handleUpdateProjectSettings({
                                  lyrics: { ...activeLyricContract, textColor: event.target.value },
                                })}
                                style={{width:28,height:22,padding:0,border:'1px solid rgba(255,255,255,.25)',borderRadius:4,background:'transparent'}}
                              />
                            </label>
                            <button
                              type="button"
                              aria-label="Use lyric theme color"
                              data-testid="echo-lyric-color-reset"
                              disabled={directorEditingLocked || !activeLyricContract.textColor}
                              onClick={() => handleUpdateProjectSettings({
                                lyrics: { ...activeLyricContract, textColor: '' },
                              })}
                              style={{background:'transparent',border:'1px solid rgba(255,255,255,.15)',color:'#cbd5e1',fontSize:'8px',padding:'4px 6px',borderRadius:4,cursor:'pointer'}}
                            >
                              THEME COLOR
                            </button>

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
                                : directionCutSelectionPending
                                  ? "Preparing cut…"
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

                        <details key={activeProject.song_id} aria-label="Selected song audio files" style={{ border: '1px solid var(--hapa-border)', borderRadius: '4px', padding: '8px 10px' }}>
                          <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Audio files · WAV, MP3 &amp; stems</summary>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                            <SongAudioAvailability entry={audioInventory.songs[activeProject.song_id]} loading={audioInventory.status === 'loading'} error={audioInventory.error} />
                            <button type="button" className="hapa-button" onClick={() => setAtlasSelection({ songId: activeProject.song_id, nonce: Date.now() })}>Manage audio files</button>
                          </div>
                        </details>

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
                                LYRICS: <strong style={{ color: activeLyricContract.enabled ? 'var(--hapa-neon-magenta)' : '#94a3b8' }}>{activeLyricContract.enabled ? (activeProject.lyric_variant || 'phrase-window').toUpperCase() : 'OFF'}</strong>
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
                              {['preview', 'lyrics', 'tracks', 'variation', 'live', 'palmier', 'script', 'edl', 'journal', 'recordings', 'living-light'].map(tab => (
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
                                  {tab === 'lyrics' && '🎤 Lyrics'}
                                  {tab === 'tracks' && '🎚 Tracks'}
                                  {tab === 'variation' && '🧬 Variations'}
                                  {tab === 'live' && '🎭 Live Set'}
                                  {tab === 'palmier' && '✂️ Palmier'}
                                  {tab === 'script' && '📄 Script'}
                                  {tab === 'edl' && '📋 EDL Table'}
                                  {tab === 'journal' && '📓 Narrative'}
                                  {tab === 'recordings' && '🎞 Recordings'}
                                  {tab === 'living-light' && '✦ Living Light'}
                                </button>
                              ))}
                            </div>

                            {/* Source-bound PCM, streamed with byte ranges; source MP3 remains unchanged. */}
                            {audioBlobUrl && (
                              <audio 
                                key={audioBlobUrl}
                                ref={audioRef}
                                src={audioBlobUrl}
                                data-echo-audio-fidelity={audioPlaybackReceipt?.fidelity || "unavailable"}
                                data-echo-audio-source-hash={audioPlaybackReceipt?.sourceHash || ""}
                                data-echo-audio-pcm-hash={audioPlaybackReceipt?.pcmSha256 || ""}
                                data-echo-audio-duration={audioPlaybackReceipt?.durationSeconds || ""}
                                data-echo-audio-source-kind={audioPlaybackReceipt?.sourceSelection?.kind || 'master'}
                                data-echo-audio-asset-id={audioPlaybackReceipt?.sourceSelection?.assetId || ''}
                                onLoadedMetadata={() => {
                                  const target = pendingPlaybackRestoreRef.current;
                                  if (target && target.songId === activeProject.song_id && target.assetId === requestedPlaybackAssetId && audioRef.current) {
                                    audioRef.current.currentTime = Math.min(target.seconds, Number(audioRef.current.duration) || target.seconds);
                                    currentTimeRef.current=audioRef.current.currentTime;setCurrentTime(audioRef.current.currentTime);
                                    pendingPlaybackRestoreRef.current = null;
                                  }
                                }}
                                onTimeUpdate={handleTimeUpdate}
                                onEnded={() => setIsPlaying(false)}
                                onLoadedData={() => {
                                  setAudioPlaybackReady(true);
                                  setAudioPlaybackError("");
                                }}
                                onCanPlay={() => {
                                  setAudioPlaybackReady(true);
                                  setAudioPlaybackError("");
                                }}
                                onPlaying={() => {
                                  setAudioPlaybackReady(true);
                                  setAudioPlaybackError("");
                                }}
                                onWaiting={() => setAudioPlaybackReady(false)}
                                onStalled={() => setAudioPlaybackReady(false)}
                                onEmptied={() => setAudioPlaybackReady(false)}
                                onError={() => {
                                  setAudioPlaybackReady(false);
                                  setIsPlaying(false);
                                  setAudioPlaybackError("Playback audio could not be decoded or reached. Click Retry audio.");
                                  setAudioDiagnostics("Playback audio failed");
                                  if (previewRecordingActiveRef.current) {
                                    previewRecordingFailureMessageRef.current = "Playback audio failed during recording. The saved clip may be incomplete.";
                                    void stopPreviewRecording();
                                  }
                                }}
                                crossOrigin="anonymous"
                              />
                            )}

                            {(livingLightRecordVisitState.canReturn||livingLightRecordVisitState.message)&&<section aria-label="Album record visit" className="living-light-navigation"><p role="status">{livingLightRecordVisitState.message}</p>{livingLightRecordVisitState.state==='loading'&&<button type="button" onClick={()=>livingLightRecordVisit.cancel()}>Cancel destination lookup</button>}{livingLightRecordVisitState.canReturn&&<button type="button" disabled={directorEditingLocked||livingLightRecipeBusy} onClick={returnLivingLightRecord}>Return to {livingLightRecordVisitState.originTitle}</button>}</section>}
                            {(activeWorkbenchTab === "living-light" || livingLightVisited) && <div hidden={activeWorkbenchTab!=="living-light"}><Suspense fallback={<p role="status">Loading Living Light…</p>}><LivingLightWorkspace
                              onRecipeBusyChange={setLivingLightRecipeBusy} onOpenRecord={openLivingLightRecord} recordVisit={livingLightRecordVisitState} apiBase={API_BASE} songId={activeProject.song_id} title={activeProject.song_title} duration={activeProject.duration} mediaSources={livingLightMediaSources}
                              directorProject={activeProject} directorCutKey={activeDirectionVariantSelection} directorTime={currentTime} directorEditingDisabled={directorEditingLocked||!activeDirectionVariant} onDirectorCuesChange={cues=>handleUpdateProjectSettings({living_light_cues:cues})}
                              audioRef={audioRef} audioReceipt={requestedPlaybackAssetId ? masterPlaybackReceiptRef.current?.receipt : audioPlaybackReceipt} preparedPerformance={activePreparedPerformance} powerMode={activeWorkbenchTab==="living-light"?powerMode:"hidden"} sharedHandEnabled openCardRequest={livingLightOpenRequest} onPlayingChange={setIsPlaying}
                              songClockRef={currentTimeRef} audition={{assetId:requestedPlaybackAssetId,heldSongSeconds:livingLightAudition?.heldSongSeconds||0,busy:audioLoading,ready:audioPlaybackReady,error:audioPlaybackError,durationSeconds:requestedPlaybackAssetId?audioPlaybackReceipt?.durationSeconds:0,onSelect:selectLivingLightPlayback}}
                            /></Suspense></div>}

                            {/* Keep the comparison session while inspecting Preview or Tracks.
                                The panel resets itself when song/cut identity changes. */}
                            <div hidden={activeWorkbenchTab !== "variation"}>
                                <VariationLabPanel
                                  project={activeProject}
                                  currentTime={currentTime}
                                  disabled={directorEditingLocked || !activeDirectionVariant}
                                  onCandidate={(candidate) => {
                                    if (directorEditingLocked || !activeDirectionVariant) throw new Error("Choose a saved direction cut before reviewing a recut.");
                                    markSongCardPlanUnsaved();
                                    updateSelectedDirectionCut(() => candidate);
                                  }}
                                />
                                <TasteMemoryPanel memory={activeProject.human_taste_memory} onChange={(memory) => handleUpdateProjectSettings({ human_taste_memory: memory })} />
                            </div>

                            {["preview", "variation"].includes(activeWorkbenchTab) && (() => {
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
                                {!isPlaying && (exactIsfBindingDiagnostics.persistentShaderLayers || []).some(layer => layer.historyPending) && (
                                  <div role="status" data-testid="echo-history-preparation" style={{ fontSize: '14px', padding: '8px 12px', color: '#cbd5e1' }}>
                                    Preparing visual effects for this position… {(() => {
                                      const pending = exactIsfBindingDiagnostics.persistentShaderLayers.filter(layer => layer.historyPending);
                                      const fractions = pending.map(layer => Number.isFinite(layer.historyProgress?.frame) && layer.historyProgress?.targetFrame > 0
                                        ? layer.historyProgress.frame / layer.historyProgress.targetFrame : 0);
                                      return `${Math.min(99, Math.max(0, Math.floor(Math.min(...fractions) * 100)))}%`;
                                    })()}
                                  </div>
                                )}
                                {/* Composition Preview Screen */}
                                <div
                                  className="media-preview-container"
                                  data-testid="echo-director-preview-frame"
                                  data-clean-preview={cleanPreviewMode ? "true" : "false"}
                                  data-echo-retained-details={directorProjects.filter(row => Array.isArray(row.music_video_project?.timeline)).length}
                                  data-echo-retained-plans={Object.keys(songCardPlanSnapshotBySong).length}
                                  data-echo-preview-contract={directorPreviewFrame?.schemaVersion || "legacy-local-projection"}
                                  data-echo-preview-frame-key={directorPreviewFrame?.frameKey || ""}
                                  data-echo-preview-media-layers={directorPreviewFrame?.media?.layerCount ?? (currentTimelineItem ? 1 : 0)}
                                  data-echo-preview-shaders={directorPreviewFrame?.visualizers?.length ?? 0}
                                  data-echo-preview-always-ons={directorPreviewFrame?.visualizers?.filter((visualizer) => visualizer.persistent).length ?? activePersistentShaderSlots.filter((slot) => slot.enabled).length}
                                  data-echo-preview-automation={directorPreviewFrame ? JSON.stringify({
                                    visualTime: directorPreviewFrame.automation.visualTime.map((event) => event.id),
                                    accents: directorPreviewFrame.automation.accents.map((event) => event.id),
                                    effects: directorPreviewFrame.automation.effects.map((event) => event.id),
                                  }) : "{}"}
                                  data-export-aspect={`${activeOutputProfile.width}x${activeOutputProfile.height}`}
                                  data-output-profile={activeOutputProfile.id}
                                  style={{ position: 'relative', width: directorPreviewExpanded ? directorPreviewWidth : compactPreviewWidth, height: 'auto', boxSizing: 'border-box', alignSelf: directorPreviewExpanded || isVerticalOutput ? 'center' : 'stretch', aspectRatio: `${activeOutputProfile.width} / ${activeOutputProfile.height}`, maxWidth: '100%', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#020617', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  
                                  {currentTimelineItem && ["video", "image"].includes(shotMediaType(currentTimelineItem)) && (
                                    <PersistentEchoABPlayers
                                      shot={currentTimelineItem}
                                      maximumDimension={previewQuality.mediaDimension}
                                      lookaheadShots={lookaheadTimelineItems}
                                      playing={isPlaying}
                                      songTime={currentTime}
                                      onBufferState={setPreviewBufferState}
                                      onPresentedMediaChange={handlePresentedMediaChange}
                                      clockRef={currentTimeRef}
                                      audioRef={audioRef}
                                      audioContextRef={audioContextRef}
                                      presentationSampleRef={presentationSampleRef}
                                      sourceIsPortrait={activeShotSourceDimensions.isPortrait}
                                      cameraKeyframes={activeShowGraph?.directorV2?.cameraKeyframes}
                                      showGraph={activeShowGraph}
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

                                  {activeProject.living_light_cues?.length>0&&<Suspense fallback={null}><EchoLivingLightPreview project={activeProject} clean={cleanPreviewMode} audioRef={audioRef} clockRef={currentTimeRef}
                                    currentTime={currentTime} active={activeWorkbenchTab==='preview'&&powerMode!=='hidden'}
                                    audioReceipt={audioPlaybackReceipt} preparedPerformance={activePreparedPerformance}
                                    mediaSources={livingLightMediaSources} captureRef={livingLightRecordingRef}/></Suspense>}

                                  {/* Neon HUD Overlay */}
                                  {/* Telemetry badges on the picture; hidden in Clean Preview mode. */}
                                  <div
                                    data-echo-preview-hud={cleanPreviewMode ? "hidden" : "visible"}
                                    style={{ position: 'absolute', top: `${Math.round(activeOutputProfile.safeArea.actionInset * 100)}%`, left: `${Math.round(activeOutputProfile.safeArea.actionInset * 100)}%`, right: isVerticalOutput ? `${Math.round(activeOutputProfile.safeArea.actionInset * 100)}%` : 'auto', display: cleanPreviewMode ? 'none' : 'flex', gap: '6px', flexWrap: 'wrap', pointerEvents: 'none', zIndex: 5 }}>
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
                                        CAM {directorPreviewFrame?.camera?.motion || currentTimelineItem.camera_motion || "auto"} @{Number(directorPreviewFrame?.camera?.speed ?? currentTimelineItem.camera_speed ?? 1.35).toFixed(1)}x
                                      </span>
                                    )}
                                  </div>

                                  <EchoLyricOverlay
                                    presentationRef={echoLyricPresentationRef}
                                    captureSurfaceRef={echoLyricCaptureSurfaceRef}
                                    mediaTracks={activeShowGraph?.tracks}
                                    accentEvents={activeShowGraph?.directorV2?.accentTrack?.events}
                                    contract={directorPreviewFrame?.lyrics?.contract || activeLyricContract}
                                    lines={activeShowGraph?.song?.lyricOverlay?.lines?.length ? activeShowGraph.song.lyricOverlay.lines : activeProject.timed_lyrics}
                                    position={activeProject.lyric_position || "bottom-center"} themeId={activeProject.lyric_style || "neon-cyan"}
                                    outputProfile={activeOutputProfile} clockRef={currentTimeRef} audioRef={audioRef}
                                    initialTime={currentTime} playing={isPlaying} powerMode={powerMode} hidden={cleanPreviewMode}
                                  />
                                </div>

                                <div role="status" style={{ fontSize: 13, padding: 8 }}>
                                  <label>Audio visuals <select aria-label="Audio visuals" value={audioVisualMode} disabled={previewRecordingActiveRef.current || previewRecordingStartingRef.current} onChange={event => setAudioVisualMode(event.target.value)}><option value="prepared">Prepared song timing</option><option value="live">Live monitoring</option>{recordedSignalReplay && <option value="replay">Recorded signals</option>}</select></label>{" "}
                                  <label title="Preview only: shows Score Dust over this Song without changing the Director cut."><input type="checkbox" data-testid="echo-score-dust-toggle" checked={scoreDustPreview} disabled={previewRecordingActiveRef.current} onChange={event => setScoreDustPreview(event.target.checked)} /> Score Dust preview</label>{" "}
                                  {audioVisualMode === "prepared" ? activePreparedPerformance ? "Prepared signals ready. Seeking reuses cached timing." : preparedAudio.message || "Loading prepared timing…" : audioVisualMode === "replay" ? activeRecordedSignalReplay ? `Recorded signals: ${activeRecordedSignalReplay.startSeconds.toFixed(2)}–${activeRecordedSignalReplay.endSeconds.toFixed(2)}s. Outside this interval signals are silent.` : "Select the original song and cut to replay these signals." : "Live monitoring depends on playback history."}
                                  {audioVisualMode === "live" && <label><input type="checkbox" checked={captureLiveSignals} disabled={previewRecordingActiveRef.current} onChange={event => setCaptureLiveSignals(event.target.checked)} /> Save replayable signals with recording (64 MB limit)</label>}
                                  {activePreparedPerformance?.missingData?.unverifiedOrigins?.length > 0 && <span> Stem alignment pending review.</span>}
                                  {activePreparedPerformance?.missingData?.measuredBeats && <span> Beat grid not verified.</span>}
                                  {audioVisualMode === "prepared" && !activePreparedPerformance && <button type="button" className="hapa-btn" onClick={() => setPreparedAudioRetry(value => value + 1)}>Retry prepared audio</button>}
                                  {audioVisualMode === "prepared" && <EchoPerformancePreparationControl key={preparedAudioKey} apiBase={API_BASE} songId={selectedProjectSongId} variantId={activeDirectionVariantSelection} ready={Boolean(activePreparedPerformance)} onReady={() => setPreparedAudioRetry(value => value + 1)} />}
                                  {preparedModulationResult.error && <span role="alert">{preparedModulationResult.error}</span>}
                                  <details data-testid="echo-visual-signal-diagnostics" style={{ marginTop: 8 }}>
                                    <summary>Inspect stem influence</summary>
                                    <label>Visual signal solo <select aria-label="Visual signal solo" value={activeVisualSignalSolo}
                                      disabled={!activePreparedPerformance || ["preparing", "recording", "saving"].includes(previewRecordingState)}
                                      onChange={event => setVisualSignalSolo({ key: preparedAudioKey, role: event.target.value })}>
                                      <option value="">All visual signals</option>
                                      <option value="__silence__">Mute audio influence</option>
                                      {visualSignalRoles.map(role => <option key={role} value={role}>{role === "master" ? "Master mix" : role === "vocals" ? "Lead vocals" : role.replaceAll("-", " ")}</option>)}
                                    </select></label>
                                    <p>Temporary preview diagnostic. Song audio, lyric timing and saved cuts stay unchanged. Time-based animation continues. Restore all signals before recording.</p>
                                    {activeVisualSignalSolo && <button type="button" onClick={() => setVisualSignalSolo({ key: preparedAudioKey, role: "" })}>Restore all visual signals</button>}
                                    <span data-testid="echo-visual-signal-summary">{activeVisualSignalSolo === "__silence__" ? "All audio influence muted." : activeVisualSignalSolo ? `Only ${activeVisualSignalSolo.replaceAll("-", " ")} drives audio-reactive channels.` : "All prepared buses drive their assigned channels."}</span>
                                  </details>
                                </div>
                                {usesScoreDust && (
                                  <EchoScoreDustPanel dust={scoreDust} currentTime={currentTime} exportContext={{
                                    apiBase: API_BASE, songId: selectedProjectSongId, songTitle: activeProject?.song_title || activeProject?.title || "",
                                    // Atlas master bytes when the score came from Atlas; otherwise the player's current source.
                                    audioUrl: scoreDust.kind === "atlas" && scoreDust.runId ? `${API_BASE}/api/echos/audio-atlas/jobs/${encodeURIComponent(scoreDust.runId)}/audio/master` : (audioRef.current?.currentSrc || audioBlobUrl || ""),
                                  }} onSeek={(seconds) => {
                                    currentTimeRef.current = seconds;
                                    echoPlaybackEngineRef.current?.seek(seconds);
                                    setCurrentTime(seconds);
                                    if (audioRef.current) audioRef.current.currentTime = seconds;
                                  }} />
                                )}
                                <fieldset data-testid="echo-preview-quality" disabled={previewRecordingActiveRef.current || previewRecordingStartingRef.current}
                                  style={{ margin: '8px 0', padding: '8px 12px', border: '1px solid rgba(255,255,255,.18)', borderRadius: 6, minWidth: 0, fontSize: 13 }}>
                                  <legend>Preview quality</legend>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                                    <label>Preset <select aria-label="Preview quality preset" value={previewQualityPreset} onChange={event => {
                                      const preset = event.target.value;
                                      if (!ECHO_PREVIEW_QUALITY_PRESETS[preset]) return;
                                      setPreviewQualityPreset(preset); setPreviewQuality({ ...ECHO_PREVIEW_QUALITY_PRESETS[preset] });
                                    }}><option value="full">Full detail</option><option value="balanced">Balanced</option><option value="responsive">Responsive</option>{previewQualityPreset === 'custom' && <option value="custom">Custom</option>}</select></label>
                                    <label>Shader resolution <select aria-label="Preview shader resolution" value={previewQuality.shaderScale} onChange={event => setPreviewQualityControl('shaderScale', event.target.value)}><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label>
                                    <label>Shader layers <select aria-label="Preview shader layers" value={previewQuality.layerLimit} onChange={event => setPreviewQualityControl('layerLimit', event.target.value)}><option value="0">All scheduled</option><option value="4">Up to 4</option><option value="2">Up to 2</option></select></label>
                                    <label>Prepared media size <select aria-label="Preview media size" value={previewQuality.mediaDimension} onChange={event => setPreviewQualityControl('mediaDimension', event.target.value)}><option value="1280">1280 px</option><option value="960">960 px</option><option value="640">640 px</option></select></label>
                                  </div>
                                  <p style={{ margin: '6px 0 0', color: '#cbd5e1' }}>Lyrics stay crisp. Final export uses the saved cut and original media. Quick recordings use the current preview appearance.</p>
                                  <p style={{ margin: '4px 0 0', color: '#94a3b8' }}>Lower layer limits show the first scheduled layers. Use Prepare selected-cut preview to apply a new video size; still images choose available renditions at the selected size; originals remain in use until ready. Changing shader resolution rebuilds effect history.</p>
                                </fieldset>
                                {/* Player Controls */}
                                <div data-testid="echo-director-preview-controls" style={{ display: 'flex', gap: '12px', rowGap: '8px', alignItems: 'center', alignSelf: directorPreviewExpanded ? 'center' : 'stretch', width: directorPreviewExpanded ? directorPreviewWidth : 'auto', maxWidth: '100%', flexWrap: 'wrap', flexShrink: 0, boxSizing: 'border-box', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                  <button 
                                    type="button"
                                    onClick={handlePlayPause}
                                    disabled={previewPlaybackStartBlocked}
                                    style={{
                                      background: previewPlaybackStartBlocked ? 'rgba(255, 255, 255, 0.05)' : previewRecordingAudioFailed ? 'rgba(245,158,11,0.14)' : (isPlaying ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
                                      border: previewPlaybackStartBlocked ? '1px solid rgba(255, 255, 255, 0.1)' : previewRecordingAudioFailed ? '1px solid #f59e0b' : (isPlaying ? '1px solid var(--hapa-neon-red)' : '1px solid var(--hapa-neon-green)'),
                                      color: previewPlaybackStartBlocked ? '#888' : previewRecordingAudioFailed ? '#fbbf24' : (isPlaying ? 'var(--hapa-neon-red)' : 'var(--hapa-neon-green)'),
                                      padding: '5px 12px',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      borderRadius: '4px',
                                      cursor: previewPlaybackStartBlocked ? 'wait' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      flexShrink: 0
                                    }}
                                  >
                                    {previewRecordingAudioFailed ? "↻ Retry audio" : audioLoading ? "⏳ Audio..." : (!isPlaying && shotMediaType(currentTimelineItem) === "video" && !previewBufferState.ready ? "⏳ Buffering video..." : (isPlaying ? "⏸ Pause" : "▶ Play Show"))}
                                  </button>
                                  <span style={{ fontFamily: 'monospace', fontSize: '9px', color: previewBufferState.status === 'fallback' ? 'var(--hapa-neon-gold)' : 'var(--hapa-neon-cyan)', flexShrink: 0 }}>
                                    {previewBufferState.status.toUpperCase()} · {previewBufferState.readyLookahead || 0}/{previewBufferState.targetLookahead || 0} AHEAD
                                  </span>
                                  <button
                                    type="button"
                                    data-testid="echo-director-preview-clean-view"
                                    aria-pressed={cleanPreviewMode}
                                    onClick={toggleCleanPreviewMode}
                                    title={cleanPreviewMode ? "Restore the overlay telemetry and lyrics" : "Hide the overlay telemetry and lyrics for a clean look at the picture"}
                                    style={{
                                      background: cleanPreviewMode ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.05)',
                                      border: `1px solid ${cleanPreviewMode ? 'var(--hapa-neon-cyan)' : 'rgba(255,255,255,0.18)'}`,
                                      color: cleanPreviewMode ? 'var(--hapa-neon-cyan)' : '#cbd5e1',
                                      padding: '5px 10px',
                                      fontSize: '9px',
                                      fontWeight: 'bold',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      flexShrink: 0
                                    }}
                                  >
                                    {cleanPreviewMode ? "◉ Overlays Hidden" : "○ Hide Overlays"}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid="echo-director-preview-record"
                                    data-recording-state={previewRecordingState}
                                    aria-pressed={previewRecordingState === "preparing" || previewRecordingState === "recording" || previewRecordingState === "saving"}
                                    disabled={previewRecordingStartBlocked}
                                    onClick={previewRecordingState === "recording" ? stopPreviewRecording : previewRecordingAudioFailed ? retryPreviewAudio : (previewRecordingState === "idle" || previewRecordingState === "error") ? startPreviewRecording : undefined}
                                    title={previewRecordingState === "recording"
                                      ? "Stop the capture and save it to Recordings"
                                      : previewRecordingAudioFailed
                                        ? audioPlaybackError
                                        : previewRecordingAudioBuffering
                                          ? "Waiting for playback audio to buffer"
                                          : previewRecordingVideoBuffering
                                            ? "Waiting for the current preview video to buffer"
                                            : "Start playback and record its picture + sound together"}
                                    style={{
                                      background: previewRecordingState === "recording" ? 'rgba(239,68,68,0.22)' : previewRecordingAudioFailed ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.05)',
                                      border: `1px solid ${previewRecordingState === "recording" ? 'var(--hapa-neon-rose, #ef4444)' : previewRecordingAudioFailed ? '#f59e0b' : 'rgba(255,255,255,0.18)'}`,
                                      color: previewRecordingState === "recording" ? '#fecaca' : previewRecordingAudioFailed ? '#fbbf24' : '#cbd5e1',
                                      padding: '5px 10px',
                                      fontSize: '9px',
                                      fontWeight: 'bold',
                                      borderRadius: '4px',
                                      cursor: previewRecordingStartBlocked ? 'wait' : 'pointer',
                                      flexShrink: 0,
                                      ...(previewRecordingStartBlocked ? { opacity: 0.7 } : {})
                                    }}
                                  >
                                    {previewRecordingState === "recording"
                                      ? `■ Stop · ${formatEchoPreviewRecordingElapsed(previewRecordingElapsedMs)}`
                                      : previewRecordingState === "preparing"
                                        ? "⏳ Starting audio + video…"
                                        : previewRecordingState === "saving"
                                          ? "⏫ Saving…"
                                          : previewRecordingAudioFailed
                                            ? "↻ Retry audio"
                                            : previewRecordingAudioBuffering
                                              ? "⏳ Buffering audio…"
                                              : previewRecordingVideoBuffering
                                                ? "⏳ Buffering video…"
                                                : "● Record + Play"}
                                  </button>
                                  <span
                                    data-testid="echo-director-preview-record-readiness"
                                    role={previewRecordingAudioFailed ? "alert" : "status"}
                                    aria-live="polite"
                                    style={{ fontFamily: 'monospace', fontSize: '9px', color: previewRecordingAudioFailed || previewRecordingState === "error" ? '#fca5a5' : '#67e8f9', flexShrink: 0 }}
                                  >
                                    {previewRecordingReadinessLabel}
                                  </span>
                                  <span
                                    data-testid="echo-director-preview-record-quality"
                                    data-video-bits-per-second={ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE}
                                    data-audio-bits-per-second={ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE}
                                    title="High-quality full-resolution recording target"
                                    style={{ fontFamily: 'monospace', fontSize: '8px', color: '#a5b4fc', flexShrink: 0 }}
                                  >
                                    {previewRecordingQualityLabel}
                                  </span>
                                  {audioPlaybackError && (
                                    <span
                                      data-testid="echo-director-preview-audio-error"
                                      role="alert"
                                      style={{ width: '100%', color: '#fca5a5', fontSize: '9px', lineHeight: 1.35 }}
                                    >
                                      {audioPlaybackError}
                                    </span>
                                  )}
                                  {previewRecordingError && (
                                    <span
                                      data-testid="echo-director-preview-record-error"
                                      role="alert"
                                      style={{ width: '100%', color: '#fca5a5', fontSize: '9px', lineHeight: 1.35 }}
                                    >
                                      {previewRecordingError}
                                    </span>
                                  )}
                                  <EchoPreviewPreparationControl
                                    key={`${selectedProjectSongId}:${activeDirectionVariantSelection}`}
                                    apiBase={API_BASE} songId={selectedProjectSongId}
                                    variantId={activeDirectionVariantSelection} pendingCount={pendingPreviewProxyCount}
                                    maximumDimension={previewQuality.mediaDimension}
                                    onProjection={setPreviewProjection}
                                  />
                                  
                                  <input 
                                    type="range" 
                                    aria-label="Song playhead seconds"
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

                                {(activeShowGraph || previewBufferState.error || exactIsfBindingDiagnostics.rendererTruth) && (
                                  <div
                                    data-testid="echo-director-preview-diagnostics"
                                    role={(exactIsfStatusIsFailure(exactIsfStatus.status) || exactIsfStatus.error || previewBufferState.error || exactIsfStatusIsFailure(exactIsfBindingDiagnostics.rendererTruth?.status) || exactIsfBindingDiagnostics.rendererTruth?.silentDefault === true || Number(exactIsfBindingDiagnostics.playbackPool?.blackIntervals || 0) > 0) ? "alert" : "status"}
                                    aria-live="polite"
                                    style={{
                                      alignSelf: directorPreviewExpanded ? 'center' : 'stretch',
                                      width: directorPreviewExpanded ? directorPreviewWidth : 'auto',
                                      maxWidth: '100%',
                                      boxSizing: 'border-box',
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: '6px 10px',
                                      padding: '7px 10px',
                                      borderRadius: '4px',
                                      border: (exactIsfStatusIsFailure(exactIsfStatus.status) || exactIsfStatus.error || previewBufferState.error || exactIsfStatusIsFailure(exactIsfBindingDiagnostics.rendererTruth?.status) || exactIsfBindingDiagnostics.rendererTruth?.silentDefault === true || Number(exactIsfBindingDiagnostics.playbackPool?.blackIntervals || 0) > 0) ? '1px solid rgba(248,113,113,0.42)' : '1px solid rgba(34,211,238,0.2)',
                                      background: (exactIsfStatusIsFailure(exactIsfStatus.status) || exactIsfStatus.error || previewBufferState.error || exactIsfStatusIsFailure(exactIsfBindingDiagnostics.rendererTruth?.status) || exactIsfBindingDiagnostics.rendererTruth?.silentDefault === true || Number(exactIsfBindingDiagnostics.playbackPool?.blackIntervals || 0) > 0) ? 'rgba(127,29,29,0.16)' : 'rgba(8,47,73,0.14)',
                                      color: (exactIsfStatusIsFailure(exactIsfStatus.status) || exactIsfStatus.error || previewBufferState.error || exactIsfStatusIsFailure(exactIsfBindingDiagnostics.rendererTruth?.status) || exactIsfBindingDiagnostics.rendererTruth?.silentDefault === true || Number(exactIsfBindingDiagnostics.playbackPool?.blackIntervals || 0) > 0) ? '#fecaca' : '#cffafe',
                                      fontFamily: 'monospace',
                                      fontSize: '9px',
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    {activeShowGraph && (
                                      <span
                                        data-testid="echo-director-preview-isf-status"
                                        data-echo-exact-isf-status={exactIsfStatus.status}
                                      >
                                        ISF {exactIsfStatus.status === "ready" ? "EXACT READY" : String(exactIsfStatus.status || "idle").toUpperCase()}
                                        {exactIsfStatus.sourceId ? ` · ${exactIsfStatus.sourceId}` : ""}
                                        {exactIsfStatus.error ? ` · ${exactIsfStatus.error}` : ""}
                                      </span>
                                    )}
                                    {previewBufferState.error && (
                                      <span data-testid="echo-director-preview-buffer-error">
                                        VIDEO BUFFER · {previewBufferState.error}
                                      </span>
                                    )}
                                    {exactIsfBindingDiagnostics.rendererTruth && (() => {
                                      const truth = exactIsfBindingDiagnostics.rendererTruth;
                                      return (
                                        <span
                                          data-echo-renderer-truth={truth.status}
                                          data-echo-renderer-requested-id={truth.requested?.id || ""}
                                          data-echo-renderer-substitute-id={truth.substitute?.id || ""}
                                          data-echo-renderer-reason={truth.reason || ""}
                                          data-echo-renderer-silent-default={truth.silentDefault === true ? "true" : "false"}
                                          title={JSON.stringify(truth)}
                                        >
                                          RENDER {String(truth.status).toUpperCase()} · {truth.requested?.id || "MISSING ID"}{truth.substitute?.id ? ` → ${truth.substitute.id}` : ""}
                                        </span>
                                      );
                                    })()}
                                    {activeShowGraph && exactIsfBindingDiagnostics.playbackPool && (
                                      <span
                                        data-echo-isf-handoff={exactIsfBindingDiagnostics.playbackPool.handoffStatus || "idle"}
                                        data-echo-isf-current-shader={exactIsfBindingDiagnostics.playbackPool.currentShaderId || ""}
                                        data-echo-isf-requested-shader={exactIsfBindingDiagnostics.playbackPool.requestedShaderId || ""}
                                        data-echo-isf-prewarm-ready={exactIsfBindingDiagnostics.playbackPool.prewarmReadiness?.ready || 0}
                                        data-echo-isf-contexts={exactIsfBindingDiagnostics.playbackPool.contextCount || 0}
                                        data-echo-isf-programs={exactIsfBindingDiagnostics.playbackPool.programCount || 0}
                                        data-echo-isf-history={JSON.stringify({ bytes: exactIsfBindingDiagnostics.playbackPool.historyCheckpointBytes || 0, preparing: exactIsfBindingDiagnostics.playbackPool.historyJobsPreparing || 0, timing: exactIsfBindingDiagnostics.playbackPool.historyPresentationTiming || [], layers: exactIsfBindingDiagnostics.persistentShaderLayers || [] })}
                                        data-echo-isf-source-cache={JSON.stringify(exactIsfBindingDiagnostics.playbackPool.sourceCache || {})}
                                        data-echo-isf-black-intervals={exactIsfBindingDiagnostics.playbackPool.blackIntervals || 0}
                                        data-echo-isf-frame-ms={Number(exactIsfBindingDiagnostics.playbackPool.frameTiming?.lastMs || 0).toFixed(2)}
                                        title={JSON.stringify(exactIsfBindingDiagnostics.playbackPool)}
                                      >
                                        POOL {String(exactIsfBindingDiagnostics.playbackPool.handoffStatus || "IDLE").toUpperCase()} · WARM {exactIsfBindingDiagnostics.playbackPool.prewarmReadiness?.ready || 0}/{exactIsfBindingDiagnostics.playbackPool.prewarmReadiness?.requested || 0} · GL {exactIsfBindingDiagnostics.playbackPool.contextCount || 0}/{exactIsfBindingDiagnostics.playbackPool.programCount || 0} · BLACK {exactIsfBindingDiagnostics.playbackPool.blackIntervals || 0} · {Number(exactIsfBindingDiagnostics.playbackPool.frameTiming?.lastMs || 0).toFixed(1)}MS
                                      </span>
                                    )}
                                    {activeShowGraph && (
                                      <span data-echo-isf-media-binding={exactIsfBindingDiagnostics.media?.status || "unavailable"} title={JSON.stringify(exactIsfBindingDiagnostics.media || {})}>
                                        MEDIA {["presented", "camera-framed", "presented-unframed"].includes(exactIsfBindingDiagnostics.media?.status)
                                          ? String(exactIsfBindingDiagnostics.media?.kind || "LIVE").toUpperCase()
                                          : exactIsfBindingDiagnostics.media?.kind === "generated-visualizer" ? "GENERATED" : "UNAVAILABLE"}
                                      </span>
                                    )}
                                    {activeShowGraph && (
                                      <span data-echo-isf-stem-binding={exactIsfBindingDiagnostics.stem?.status || "master"} title={JSON.stringify(exactIsfBindingDiagnostics.stem || {})}>
                                        STEM {String(exactIsfBindingDiagnostics.stem?.resolvedStem || "MASTER").toUpperCase()}
                                      </span>
                                    )}
                                    {activeShowGraph && (
                                      <span data-echo-isf-frame-receipt={exactIsfBindingDiagnostics.frameReceipt?.receiptHash || "pending"} title={JSON.stringify(exactIsfBindingDiagnostics.frameReceipt || {})}>
                                        FRAME {exactIsfBindingDiagnostics.frameReceipt?.receiptHash ? String(exactIsfBindingDiagnostics.frameReceipt.receiptHash).slice(-8).toUpperCase() : "WAIT"}
                                      </span>
                                    )}
                                  </div>
                                )}

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

                            {activeWorkbenchTab === "recordings" && (
                              <div
                                data-testid="echo-preview-recordings-panel"
                                data-recording-count={previewRecordings?.length ?? 0}
                                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--hapa-neon-cyan)', letterSpacing: '0.08em' }}>
                                    🎞 PREVIEW RECORDINGS {previewRecordings ? `· ${previewRecordings.length}` : ""}
                                  </span>
                                  <button
                                    type="button"
                                    data-testid="echo-preview-recordings-refresh"
                                    onClick={refreshPreviewRecordings}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.18)', color: '#cbd5e1', padding: '4px 10px', fontSize: '9px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    ↻ Refresh
                                  </button>
                                </div>
                                <span style={{ fontSize: '9px', opacity: 0.72, lineHeight: 1.5 }}>
                                  Quick captures of the Director Preview (picture + audio). Press ● Record in the preview to add one. These are scratch clips — they are not Song Card mints and can be deleted freely.
                                </span>
                                {previewRecordingsError && (
                                  <div style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#fecaca', fontSize: '9px' }}>
                                    {previewRecordingsError}
                                  </div>
                                )}
                                {!previewRecordings && !previewRecordingsError && (
                                  <div style={{ padding: '14px', textAlign: 'center', opacity: 0.6, fontSize: '9px' }}>Loading recordings…</div>
                                )}
                                {previewRecordings?.length === 0 && !previewRecordingsError && (
                                  <div style={{ padding: '18px', textAlign: 'center', opacity: 0.6, fontSize: '9px', border: '1px dashed rgba(255,255,255,0.18)', borderRadius: '6px' }}>
                                    No captures yet. Play the preview, press ● Record, then ■ Stop to keep a clip.
                                  </div>
                                )}
                                {previewRecordings?.map((recording) => (
                                  <div
                                    key={recording.id}
                                    data-testid="echo-preview-recording-item"
                                    data-recording-id={recording.id}
                                    style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.25)' }}
                                  >
                                    <video
                                      controls
                                      preload="metadata"
                                      src={`${API_BASE}/api/echo/preview-recordings/${encodeURIComponent(recording.id)}/file`}
                                      style={{ width: '100%', borderRadius: '4px', background: '#020617', aspectRatio: recording.width && recording.height ? `${recording.width} / ${recording.height}` : '16 / 9', maxHeight: '260px', objectFit: 'contain' }}
                                    />
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: '9.5px', fontWeight: 'bold', color: '#e2e8f0' }}>
                                        {recording.captureStatus === "incomplete" ? "Incomplete take · " : ""}{recording.songTitle || recording.songId || "Untitled song"}
                                      </span>
                                      <span style={{ fontFamily: 'monospace', fontSize: '8.5px', color: '#94a3b8' }}>
                                        {recording.createdAt ? new Date(recording.createdAt).toLocaleString() : ""} · {formatEchoPreviewRecordingElapsed(recording.durationMs)} · {recording.width}×{recording.height} · {recording.fps ? `${recording.fps}fps` : ""} · {Math.max(1, Math.round(Number(recording.sizeBytes || 0) / 1024 / 1024))} MB
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <a
                                        data-testid="echo-preview-recording-download"
                                        href={`${API_BASE}/api/echo/preview-recordings/${encodeURIComponent(recording.id)}/file?download=1`}
                                        download={recording.fileName || `${recording.id}.webm`}
                                        style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--hapa-neon-cyan)', background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.4)', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', flexShrink: 0 }}
                                      >
                                        ⬇ Download
                                      </a>
                                      {recording.captureFailure && <span role="status">{recording.captureFailure}</span>}
                                      {recording.signals && <a href={`${API_BASE}/api/echo/preview-recordings/${encodeURIComponent(recording.id)}/signals`} download={`${recording.id}.signals.json`}>Download signals</a>}
                                      {recording.signals?.status === "complete" && <button type="button" data-testid="echo-preview-recording-replay-signals" disabled={previewRecordingActiveRef.current} onClick={() => loadPreviewRecordedSignals(recording)}>Replay signals in current cut</button>}
                                      <span data-testid="echo-preview-recording-signal-status">{recording.signals ? `${recording.signals.status === "complete" ? "Replayable signals" : "Incomplete signals"} · ${recording.signals.frameCount} frames ${recording.signals.reason || ""}` : "Video only · no saved signals"}</span>
                                      <button
                                        type="button"
                                        data-testid="echo-preview-recording-delete"
                                        onClick={() => deletePreviewRecording(recording.id)}
                                        style={{ fontSize: '9px', fontWeight: 'bold', color: '#fecaca', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
                                      >
                                        ✕ Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

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

                            {activeWorkbenchTab === "lyrics" && (
                              activeLyricTimingPending ? (
                                <section
                                  data-testid="echo-lyric-source-awaiting-alignment"
                                  style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 300, padding: 12, border: "1px solid rgba(34,211,238,.32)", borderRadius: 6, background: "rgba(2,6,23,.72)", color: "#e2e8f0" }}
                                >
                                  <strong style={{ color: "#67e8f9", fontSize: 11 }}>SOURCE LYRICS CAPTURED</strong>
                                  <div style={{ color: "#bae6fd", fontSize: 10, lineHeight: 1.45 }}>
                                    These are source-backed lyrics for this exact Suno song. The visual overlay will remain off until measured audio alignment supplies trustworthy cue times.
                                  </div>
                                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 330, padding: 10, borderRadius: 4, background: "rgba(15,23,42,.86)", color: "#f8fafc", fontSize: 11, lineHeight: 1.5 }}>
                                    {activeLyricSourceText}
                                  </pre>
                                </section>
                              ) : (
                                <EchoLyricTimingEditor
                                  project={activeProject}
                                  currentTime={currentTime}
                                  analyserNode={analyserNodeRef.current}
                                  playbackAudioUrl={audioBlobUrl}
                                  playbackAudioReceipt={audioPlaybackReceipt}
                                  disabled={directorEditingLocked || directionVariantReadOnly}
                                  onSeek={handleReferenceSeek}
                                  onPatch={handleUpdateProjectSettings}
                                />
                              )
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
                                  {activeSongCardPlanWaiting || !activeSongCardPlanProject || !activeSongCardPlanShowGraph ? (
                                    <div
                                      data-testid="echo-song-card-plan-waiting"
                                      style={{
                                        padding: "10px 12px",
                                        border: "1px solid rgba(251,191,36,.45)",
                                        borderRadius: 4,
                                        background: "rgba(120,53,15,.16)",
                                        color: "#fde68a",
                                        fontSize: 10,
                                        lineHeight: 1.45,
                                      }}
                                    >
                                      <strong>Save this cut before rendering.</strong>{" "}
                                      Your visualizer edit is intact. The Builder is waiting for this exact saved cut and its rebuilt shader cards; it will not silently render an older version. If Save reports a problem, follow that message and retry Save.
                                    </div>
                                  ) : (
                                    <SongCardMintPanel
                                      compact
                                      songId={echoProjectAudioRoute(activeSongCardPlanProject).id}
                                      project={activeSongCardPlanProject}
                                      showGraph={activeSongCardPlanShowGraph}
                                      planningRevision={activeSongCardPlanningRevision}
                                    />
                                  )}
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
                                🎛️ Shader Tracks · 3 Always On
                              </button>
                            </div>

                            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '10.5px', color: activeTrackTab === "video" ? 'var(--hapa-neon-violet)' : 'var(--hapa-neon-green)', textTransform: 'uppercase' }}>
                                {activeTrackTab === "video" 
                                  ? `🛠️ Edit Shot ${selectedShotIndex + 1} of ${activeProject.timeline?.length || 0}`
                                  : `🛠️ Changing Shader + 3 Always-On Slots`}
                              </strong>
                              <span style={{ fontSize: '9px', opacity: 0.6, background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: '2px' }}>
                                {activeTrackTab === "video" 
                                  ? (activeTimelineItem ? `${activeTimelineItem.start_sec}s - ${activeTimelineItem.end_sec}s` : "")
                                  : (activeVisualizerItem ? `${activeVisualizerItem.start_sec}s - ${activeVisualizerItem.end_sec}s` : "")}
                              </span>
                            </div>

                            {activeTrackTab === "shader" && (
                              <div
                                data-testid="echo-revolving-shader-visibility"
                                style={{ display: 'grid', gridTemplateColumns: 'auto minmax(120px, 1fr) auto', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid rgba(16,185,129,0.28)', background: 'rgba(16,185,129,0.06)', borderRadius: '5px' }}
                              >
                                <strong style={{ fontSize: '9px', color: '#a7f3d0', whiteSpace: 'nowrap' }}>Revolving Vis</strong>
                                <input
                                  type="range"
                                  aria-label="Revolving shader visibility"
                                  aria-valuetext={`${Math.round(revolvingShaderVisibility * 100)} percent for all scheduled revolving shaders`}
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={Math.round(revolvingShaderVisibility * 100)}
                                  disabled={directorEditingLocked || !(activeProject.visualizer_timeline || []).length}
                                  onChange={(event) => handleUpdateRevolvingShaderVisibility(Number(event.target.value) / 100)}
                                  style={{ width: '100%', minWidth: 0, accentColor: '#10b981', cursor: directorEditingLocked ? 'not-allowed' : 'pointer' }}
                                />
                                <output style={{ minWidth: '32px', textAlign: 'right', color: '#86efac', fontSize: '9px', fontVariantNumeric: 'tabular-nums' }}>
                                  {Math.round(revolvingShaderVisibility * 100)}%
                                </output>
                                <span style={{ gridColumn: '1 / -1', fontSize: '7.5px', color: '#94a3b8', lineHeight: 1.25 }}>
                                  One visibility dial for every scheduled changing shader; Always On lanes stay independent.
                                </span>
                              </div>
                            )}

                            {activeTrackTab === "shader" && (
                              <div
                                data-testid="echo-persistent-shader-slots"
                                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '7px', padding: '8px', border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(6,182,212,0.05)', borderRadius: '5px' }}
                              >
                                {activePersistentShaderSlots.map((slot, slotIndex) => {
                                  const selectedShader = availableShaders.find((shader) => shader.id === slot.shader_id) || null;
                                  const readyShaders = availableShaders
                                    .map((shader) => echoShaderPickerEntry(shader))
                                    .filter((shader) => shader.finalRenderReady)
                                    .sort((left, right) => String(left.title || left.id).localeCompare(String(right.title || right.id)));
                                  return (
                                    <div key={slot.id} style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0, padding: '7px', border: slot.enabled ? '1px solid rgba(16,185,129,0.34)' : '1px dashed rgba(148,163,184,0.32)', borderRadius: '4px', background: slot.enabled ? 'rgba(16,185,129,0.06)' : 'rgba(15,23,42,0.48)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '5px', alignItems: 'center' }}>
                                        <strong style={{ fontSize: '9px', color: slot.enabled ? '#a7f3d0' : '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {slotIndex + 1}. {slotIndex === 0 ? 'Ultimate Flame' : slotIndex === 1 ? 'Simple Wave Lines' : 'Open'}
                                        </strong>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '7px', fontWeight: 'bold', color: slot.enabled ? '#86efac' : '#94a3b8', whiteSpace: 'nowrap', cursor: slot.shader_id === "none" ? 'not-allowed' : 'pointer' }}>
                                          <input
                                            type="checkbox"
                                            aria-label={`Always-on shader slot ${slotIndex + 1} enabled`}
                                            checked={slot.enabled}
                                            disabled={slot.shader_id === "none"}
                                            onChange={(event) => handleTogglePersistentShaderSlot(slotIndex, event.target.checked)}
                                            style={{ width: '11px', height: '11px', accentColor: '#10b981' }}
                                          />
                                          {slot.enabled ? 'ON' : slot.shader_id === "none" ? 'OPEN' : 'OFF'}
                                        </label>
                                      </div>
                                      <select
                                        aria-label={`Always-on shader slot ${slotIndex + 1}`}
                                        value={slot.shader_id}
                                        onChange={(event) => {
                                          const shaderId = event.target.value;
                                          handleUpdatePersistentShaderSlot(
                                            slotIndex,
                                            shaderId === "none" ? null : availableShaders.find((shader) => shader.id === shaderId) || null,
                                          );
                                        }}
                                        style={{ width: '100%', minWidth: 0, background: '#050b14', border: '1px solid rgba(16,185,129,0.28)', color: '#f8fafc', padding: '6px', borderRadius: '3px', fontSize: '9px' }}
                                      >
                                        <option value="none">None / leave open</option>
                                        {selectedShader && !echoShaderPickerEntry(selectedShader).finalRenderReady && (
                                          <option value={selectedShader.id}>{selectedShader.title || selectedShader.id} · unavailable</option>
                                        )}
                                        {readyShaders.map((shader) => (
                                          <option key={shader.id} value={shader.id}>{shader.title || shader.id}</option>
                                        ))}
                                      </select>
                                      <span style={{ fontSize: '7.5px', color: '#94a3b8', lineHeight: 1.3 }}>
                                        {slotIndex === 0
                                          ? 'Full song · tracks the main mix'
                                          : slotIndex === 1
                                            ? 'Full song · Lead Vocals → main mix fallback'
                                            : 'Full song when selected · main mix default'}
                                      </span>
                                      <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '5px', fontSize: '7.5px', color: '#cbd5e1' }}>
                                        <span>Vis</span>
                                        <input
                                          type="range"
                                          aria-label={`Always-on shader slot ${slotIndex + 1} shader visibility`}
                                          aria-valuetext={`${Math.round(slot.opacity * 100)} percent`}
                                          min="0"
                                          max="100"
                                          step="1"
                                          value={Math.round(slot.opacity * 100)}
                                          disabled={directorEditingLocked || slot.shader_id === "none"}
                                          onChange={(event) => handleUpdatePersistentShaderOpacity(slotIndex, Number(event.target.value) / 100)}
                                          style={{ width: '100%', minWidth: 0, accentColor: '#22d3ee', cursor: slot.shader_id === "none" ? 'not-allowed' : 'pointer' }}
                                        />
                                        <output style={{ minWidth: '27px', textAlign: 'right', color: '#a5f3fc', fontVariantNumeric: 'tabular-nums' }}>
                                          {Math.round(slot.opacity * 100)}%
                                        </output>
                                      </label>
                                      <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '5px', fontSize: '7.5px', color: '#cbd5e1' }}>
                                        <span>Layer</span>
                                        <input
                                          type="range"
                                          aria-label={`Always-on shader slot ${slotIndex + 1} underlying media visibility`}
                                          aria-valuetext={`${Math.round((slot.layer_opacity ?? 1) * 100)} percent`}
                                          min="0"
                                          max="100"
                                          step="1"
                                          value={Math.round((slot.layer_opacity ?? 1) * 100)}
                                          disabled={directorEditingLocked || slot.shader_id === "none"}
                                          onChange={(event) => handleUpdatePersistentShaderLayerOpacity(slotIndex, Number(event.target.value) / 100)}
                                          style={{ width: '100%', minWidth: 0, accentColor: '#67e8f9', cursor: slot.shader_id === "none" ? 'not-allowed' : 'pointer' }}
                                        />
                                        <output style={{ minWidth: '27px', textAlign: 'right', color: '#a5f3fc', fontVariantNumeric: 'tabular-nums' }}>
                                          {Math.round((slot.layer_opacity ?? 1) * 100)}%
                                        </output>
                                      </label>
                                      <span style={{ fontSize: '7px', color: '#94a3b8', lineHeight: 1.2 }}>
                                        Vis controls the shader · Layer controls the media underneath
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {activeTrackTab === "video" ? (
                              activeTimelineItem ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px' }}>
                                  <ShotDecisionInspectorPanel
                                    shot={activeTimelineItem}
                                    mediaTitles={Object.fromEntries((activeProject.timeline || []).map((shot) => [shot.media_id, shot.media_title || shot.media_id]))}
                                    onReview={directorEditingLocked ? undefined : (review) => {
                                      const current = activeProjectRef.current || activeProject;
                                      if (current.song_id !== activeProject.song_id || current.active_direction_script_variant?.id !== activeProject.active_direction_script_variant?.id) {
                                        throw new Error("The selected cut changed. Reopen its shot inspector.");
                                      }
                                      const shotIndex = activeProject.timeline?.[selectedShotIndex] ? selectedShotIndex : 0;
                                      handleUpdateProjectSettings(buildShotPreferencePatch(current, { ...review, shotIndex, operator: "local-human" }));
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
                                        onClick={() => handleUpdateVisualizer(
                                          selectedVisualizerIndex,
                                          buildEchoShaderSelectionUpdate({ id: "none", title: "None" }, activeVisualizerItem),
                                        )}
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
                                        const unavailableMessage = shader.legacyApproximation
                                          ? "This legacy approximation is not selectable for a saved music video. Choose a Final render ready shader."
                                          : "This shader source is catalogued, but its verified final-render proxy is not available yet. Choose a Final render ready shader.";
                                        const statusLabel = shader.finalRenderReady
                                          ? "FINAL RENDER READY"
                                          : shader.legacyApproximation
                                            ? "LEGACY APPROXIMATION · NOT FINAL READY"
                                            : "SOURCE AVAILABLE · FINAL RENDER UNAVAILABLE";
                                        return (
                                          <button
                                            key={shader.id}
                                            type="button"
                                            disabled={!shader.finalRenderReady}
                                            aria-disabled={shader.finalRenderReady ? "false" : "true"}
                                            title={shader.finalRenderReady ? `Use ${shader.title || shader.id} in Preview and final render` : unavailableMessage}
                                            onClick={() => handleUpdateVisualizer(
                                              selectedVisualizerIndex,
                                              buildEchoShaderSelectionUpdate(shader, activeVisualizerItem),
                                            )}
                                            data-echo-shader-final-render-ready={shader.finalRenderReady ? "true" : "false"}
                                            style={{
                                              textAlign: 'left',
                                              background: selected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(8,15,26,0.94)',
                                              border: selected ? '1px solid var(--hapa-neon-green)' : '1px solid rgba(148,163,184,0.22)',
                                              color: selected ? '#caffea' : '#f8fafc',
                                              borderRadius: '5px',
                                              padding: '10px 12px',
                                              cursor: shader.finalRenderReady ? 'pointer' : 'not-allowed',
                                              opacity: shader.finalRenderReady ? 1 : 0.68,
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
                                              <span data-echo-shader-readiness={shader.readiness} style={{ color: shader.finalRenderReady ? '#86efac' : shader.manifestEligible ? '#bae6fd' : '#fde68a', fontSize: '8.5px', fontWeight: 'bold' }}>{statusLabel}</span>
                                              {categories.map((category) => (
                                                <span key={category} style={{ color: '#bae6fd', border: '1px solid rgba(56,189,248,.26)', borderRadius: '3px', padding: '1px 4px', fontSize: '8px' }}>{category}</span>
                                              ))}
                                            </span>
                                            {!shader.finalRenderReady && <span data-echo-shader-selection-blocker style={{ display: 'block', color: '#f6c96d', fontSize: '8.5px', marginTop: '5px' }}>{unavailableMessage}</span>}
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
                                      Showing all {filteredShaderOptions.length} matching entries · {availableShaders.filter((shader) => echoShaderPickerEntry(shader).finalRenderReady).length} final-render-ready · {availableShaders.filter((shader) => echoShaderPickerEntry(shader).manifestEligible).length} catalogued sources · no result cap.
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
                            style={{ position: 'relative', width: '100%', height: '242px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}
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
                            <div style={{ position: 'absolute', left: '10px', top: '76px', fontSize: '9px', fontWeight: 'bold', color: '#fff', opacity: 0.12, zIndex: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>🎛️ CHANGING SHADER</div>
                            <div style={{ position: 'absolute', left: '10px', top: '120px', fontSize: '9px', fontWeight: 'bold', color: '#fff', opacity: 0.12, zIndex: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>🔥 ALWAYS ON 1</div>
                            <div style={{ position: 'absolute', left: '10px', top: '164px', fontSize: '9px', fontWeight: 'bold', color: '#fff', opacity: 0.12, zIndex: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>〰 ALWAYS ON 2</div>
                            <div style={{ position: 'absolute', left: '10px', top: '208px', fontSize: '9px', fontWeight: 'bold', color: '#fff', opacity: 0.12, zIndex: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>＋ ALWAYS ON 3</div>

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

                            {/* Persistent full-song shader lanes */}
                            {activePersistentShaderSlots.map((slot, slotIndex) => (
                              <div
                                key={`persistent-${slot.id}`}
                                data-echo-persistent-shader-slot={slot.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveTrackTab("shader");
                                }}
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  width: '100%',
                                  top: `${108 + slotIndex * 44}px`,
                                  height: '35px',
                                  boxSizing: 'border-box',
                                  borderRadius: '2px',
                                  border: slot.enabled ? '1px solid rgba(34,211,238,0.52)' : '1px dashed rgba(148,163,184,0.35)',
                                  background: slot.enabled ? 'rgba(6,182,212,0.12)' : 'rgba(15,23,42,0.35)',
                                  color: slot.enabled ? '#cffafe' : '#94a3b8',
                                  padding: '3px 8px',
                                  cursor: 'pointer',
                                  overflow: 'hidden',
                                  zIndex: 2,
                                }}
                                title={`${slot.label}: ${slot.enabled ? `${slot.shader_title} · ${Math.round(slot.opacity * 100)}% shade · full song · ${slot.stem_focus}` : slot.shader_id !== "none" ? `${slot.shader_title} · switched off · ${Math.round(slot.opacity * 100)}% shade` : 'Open slot'}`}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '7.5px', fontWeight: 'bold' }}>
                                  <span>A{slotIndex + 1}: {slot.shader_id !== "none" ? slot.shader_title : 'Open'}</span>
                                  <span>{slot.enabled ? `${Math.round(slot.opacity * 100)}% · ${Number(activeProject.duration || 0).toFixed(1)}s · ALWAYS ON` : slot.shader_id !== "none" ? `${Math.round(slot.opacity * 100)}% · OFF` : 'AVAILABLE'}</span>
                                </div>
                                <div style={{ fontSize: '7px', opacity: 0.76, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {slotIndex === 1 ? 'Lead Vocals → main mix fallback' : slot.shader_id !== "none" ? 'Main mix tracking' : 'Choose a shader per song'}
                                </div>
                              </div>
                            ))}
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
