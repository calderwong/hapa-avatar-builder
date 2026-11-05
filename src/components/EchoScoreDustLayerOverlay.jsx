// Score Dust layer in the Director preview (IP-6). Paints the cut's bound
// transparent render at the same place in the stack as the final export:
// over media, shaders and Living Light, under the lyric overlay. Preview and
// export share echoScoreDustLayerFrame and paintEchoScoreDustLayer, so the
// same render frame lands with the same opacity and blend operator.
//
// A layer without a bound render shows its status and can render itself
// here with the existing deterministic transparent export, then bind the
// published render into the working copy of the cut. The render belongs to
// the page (echo-score-dust-render-jobs), not to this panel: switching tab or
// reloading the cut while it runs reattaches to it, and a finished render is
// bound the next time the layer is shown. A render published earlier for this
// exact score is offered again instead of rendering anew.
import { useEffect, useMemo, useRef, useState } from "react";
import { paintEchoScoreDustRecording } from "../domain/echo-score-dust-recording.js";
import { prepareEchoScorePlayback } from "../domain/echo-visual-score.js";
import { loadEchoScoreDustLayerScore } from "./echo-score-dust-layer-client.js";
import { ensureEchoPreviewRecordingLocalSession } from "../domain/echo-preview-recording.js";
import { bindEchoScoreDustLayerRender, compileEchoScoreDustTrack, echoScoreDustLayerFrame, echoScoreDustLayerVideoAt, paintEchoScoreDustLayer } from "../domain/echo-score-dust-layer.js";
import { decodeSongAudio, exportScoreDustVideo } from "./echo-score-dust-export.js";
import { cancelEchoScoreDustLayerRender, clearEchoScoreDustLayerRender, echoScoreDustLayerRenderJob, echoScoreDustLayerRenderKey, retryEchoScoreDustLayerSave, startEchoScoreDustLayerRender, subscribeEchoScoreDustLayerRender } from "./echo-score-dust-render-jobs.js";

const LAYER_FPS = 30;
const chip = { position: "absolute", left: 8, bottom: 8, maxWidth: "70%", fontSize: 11, color: "#e2e8f0", background: "#020617c8", padding: "4px 6px", borderRadius: 3, pointerEvents: "auto", textShadow: "0 1px 2px #000" };

/** Load the layer's own score (the editor's binding request) and check it is still the bound one. */
async function loadBoundPlayback({ apiBase, layer, signal }) {
  const { value, scoreFingerprint, seed, settings } = await loadEchoScoreDustLayerScore({ apiBase, source: layer.source, signal });
  if (scoreFingerprint !== layer.binding.scoreFingerprint || seed !== layer.binding.seed) {
    throw new Error(`The song's analysis or lyric timing changed since this layer was planned (score ${scoreFingerprint.slice(0, 10)} ≠ ${layer.binding.scoreFingerprint.slice(0, 10)}). Rebind the layer to the current score.`);
  }
  return { playback: prepareEchoScorePlayback(value.score, value.timeline, { pulse: settings.pulse }), settings };
}

export default function EchoScoreDustLayerOverlay({ project, audioRef, clockRef, active = true, clean = false, apiBase = "", resolveUri = (uri) => uri, outputProfile, onLayerChange, editingDisabled = false, captureRef }) {
  const layerKey = JSON.stringify(project?.score_dust_layer ?? null);
  const compiled = useMemo(() => {
    try { return { track: compileEchoScoreDustTrack({ song_id: project?.song_id, duration: project?.duration, score_dust_layer: JSON.parse(layerKey) }), error: null }; }
    catch (error) { return { track: null, error: error.message }; }
  }, [layerKey, project?.song_id, project?.duration]);
  const track = compiled.track, render = track?.layer?.render || null;
  const width = render?.width || outputProfile?.width || 1920, height = render?.height || outputProfile?.height || 1080;
  const canvasRef = useRef(null), videoRef = useRef(null), stateRef = useRef("idle");
  const [playState, setPlayState] = useState("idle");
  const captureSurfaceRef = useRef({ painted: false });
  useEffect(() => {
    if (!captureRef || !active) return undefined;
    const source = { draw: (context, time, outputWidth, outputHeight) => {
      if (compiled.error) throw new Error(`Score Dust layer is invalid: ${compiled.error}`);
      return paintEchoScoreDustRecording(context, track, { ...captureSurfaceRef.current, canvas: canvasRef.current, error: videoRef.current?.error }, time, outputWidth, outputHeight);
    } };
    captureRef.current = source;
    return () => { if (captureRef.current === source) captureRef.current = null; };
  }, [captureRef, active, track, compiled.error]);
  const renderKey = echoScoreDustLayerRenderKey(track?.layer);
  const [job, setJob] = useState(() => echoScoreDustLayerRenderJob(renderKey));
  const [savedRender, setSavedRender] = useState(null);
  const onLayerChangeRef = useRef(onLayerChange); onLayerChangeRef.current = onLayerChange;
  // Follow this layer's page-level render, whichever panel started it.
  useEffect(() => {
    setJob(echoScoreDustLayerRenderJob(renderKey));
    return renderKey ? subscribeEchoScoreDustLayerRender(renderKey, setJob) : undefined;
  }, [renderKey]);
  // A finished render is bound as soon as this layer is shown and editable.
  useEffect(() => {
    if (!track || render || job?.state !== "done" || !job.result || editingDisabled) return;
    try {
      onLayerChangeRef.current(bindEchoScoreDustLayerRender(track.layer, job.result));
      clearEchoScoreDustLayerRender(renderKey);
    } catch (error) { console.warn("Score Dust render could not be bound:", error); }
  }, [track, render, job, renderKey, editingDisabled]);
  // A render published earlier for exactly this score is offered again.
  useEffect(() => {
    setSavedRender(null);
    if (!track || render || job?.state === "running") return undefined;
    const controller = new AbortController();
    const { scoreFingerprint, seed } = track.layer.binding;
    fetch(`${apiBase}/api/echos/score-dust/renders?${new URLSearchParams({ scoreFingerprint, seed: String(seed) })}`, { credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { renders: [] }))
      .then((value) => {
        for (const entry of value.renders || []) {
          try {
            bindEchoScoreDustLayerRender(track.layer, { recordingId: entry.recordingId, uri: entry.uri, sha256: entry.sha256, receipt: entry.receipt });
            setSavedRender(entry);
            return;
          } catch { /* A render that does not cover this layer's window is not offered. */ }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [track, render, job?.state, apiBase]);

  useEffect(() => {
    if (!active || !render || !canvasRef.current || !videoRef.current) return undefined;
    const canvas = canvasRef.current, video = videoRef.current, ctx = canvas.getContext("2d");
    let raf = 0;
    captureSurfaceRef.current = { painted: false };
    const publish = (next) => { if (stateRef.current !== next) { stateRef.current = next; setPlayState(next); } };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const audio = audioRef?.current;
      const t = Number(audio?.currentTime ?? clockRef?.current ?? 0), playing = Boolean(audio) && !audio.paused && !audio.ended;
      const frame = echoScoreDustLayerFrame(track, t);
      // The blend can change per section, so the browser compositor follows it frame by frame.
      if (frame.active && canvas.style.mixBlendMode !== frame.cssBlend) canvas.style.mixBlendMode = frame.cssBlend;
      if (!frame.active) {
        if (!video.paused) video.pause();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        captureSurfaceRef.current = { painted: false };
        publish("outside-window"); return;
      }
      // Follow the song clock: play along while the song plays; when paused,
      // seek to the export's exact frame target (the middle of the source frame).
      if (playing) {
        const rate = audio.playbackRate || 1;
        if (video.playbackRate !== rate) video.playbackRate = rate;
        if (video.paused) { video.currentTime = frame.seekSeconds; video.play().catch(() => {}); }
        else if (Math.abs(video.currentTime - frame.sourceSeconds) > 2 / render.fps && !video.seeking) video.currentTime = frame.seekSeconds;
      } else {
        if (!video.paused) video.pause();
        if (!video.seeking && !echoScoreDustLayerVideoAt(video, frame)) video.currentTime = frame.seekSeconds;
      }
      // Keep the last visible Dust picture during a decoder seek, as with the
      // underlying preview media. Both Preview and live capture sample it.
      if (video.readyState >= 2) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const painted = paintEchoScoreDustLayer(ctx, video, frame, canvas.width, canvas.height);
        captureSurfaceRef.current = { painted, blend: frame.canvasComposite };
        publish(painted ? "painting" : "loading");
      } else publish("loading");
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); video.pause(); captureSurfaceRef.current = { painted: false }; ctx.clearRect(0, 0, canvas.width, canvas.height); };
  }, [active, track, render, audioRef, clockRef]);

  const renderLayer = () => {
    const layer = track.layer, start = layer.window.startUs / 1e6, length = (layer.window.endUs - layer.window.startUs) / 1e6;
    startEchoScoreDustLayerRender(renderKey, { render: async ({ signal, report }) => {
      report({ progress: 0, message: "Loading the layer's score…" });
      const { playback, settings } = await loadBoundPlayback({ apiBase, layer, signal });
      report({ message: "Loading song audio…" });
      const audio = await decodeSongAudio(`${apiBase}/api/echos/audio-atlas/jobs/${encodeURIComponent(layer.source.atlasRunId)}/audio/master`, { signal });
      const evenWidth = width - (width % 2), evenHeight = height - (height % 2);
      const result = await exportScoreDustVideo({ playback, settings, audio, startSeconds: start, durationSeconds: length, width: evenWidth, height: evenHeight, fps: LAYER_FPS,
        background: "transparent", signal, onProgress: ({ phase, frame, frames }) => report({ progress: frame / Math.max(1, frames), message: phase === "audio" ? "Encoding audio…" : `Rendering layer frame ${frame} of ${frames}` }) });
      return { blob: result.blob, receipt: result.receipt };
    }, save: async ({ blob, receipt }, { signal, report }) => {
      report({ progress: 1, message: "Saving the render to Recordings…" });
      await ensureEchoPreviewRecordingLocalSession(apiBase);
      const query = new URLSearchParams({ songId: project.song_id || "", songTitle: project.song_title || "", projectTitle: "Score Dust layer", orientation: receipt.height > receipt.width ? "portrait" : "landscape",
        width: String(receipt.width), height: String(receipt.height), fps: String(receipt.fps), durationMs: String(Math.round(receipt.durationSeconds * 1000)), captureStatus: "complete" });
      const saved = await fetch(`${apiBase}/api/echo/preview-recordings?${query}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "video/webm" }, body: blob, signal });
      const recordingId = saved.ok ? (await saved.json().catch(() => ({})))?.recording?.id : null;
      if (!recordingId) throw new Error(`The render (${Math.round(blob.size / 1e6)} MB) could not be saved to Recordings (${saved.status}). The rendered frames are kept: retry the save.`);
      // Publishing with the receipt records the render, so it is found again for this score after a reload.
      const publishedResponse = await fetch(`${apiBase}/api/echos/score-dust/renders`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordingId, receipt, layerId: layer.layerId }), signal });
      const published = await publishedResponse.json().catch(() => ({}));
      if (!publishedResponse.ok) throw new Error(published.message || `Publishing the render failed (${publishedResponse.status}).`);
      return { recordingId, uri: published.uri, sha256: published.sha256, receipt };
    } });
  };
  const useSavedRender = () => {
    if (!savedRender) return;
    onLayerChangeRef.current(bindEchoScoreDustLayerRender(track.layer, { recordingId: savedRender.recordingId, uri: savedRender.uri, sha256: savedRender.sha256, receipt: savedRender.receipt }));
  };

  if (!project?.score_dust_layer) return null;
  const status = compiled.error ? `Score Dust layer is invalid: ${compiled.error}`
    : render ? `Score Dust layer · render ${render.recordingId.slice(0, 8)} · ${track.layer.segments ? `${track.layer.segments.length} section looks at ${Math.round(track.layer.opacity * 100)}%` : `${track.layer.blend} ${Math.round(track.layer.opacity * 100)}%`}${playState === "loading" ? " · loading" : ""}`
      : "Score Dust layer needs its render before preview or export.";
  return (
    <div data-testid="echo-score-dust-layer" data-state={compiled.error ? "invalid" : render ? playState : "render-required"} style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }}>
      {render && <>
        <video ref={videoRef} src={resolveUri(render.uri)} muted playsInline preload="auto" crossOrigin="anonymous" aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, opacity: 0.001, left: -10, top: -10 }} />
        <canvas ref={canvasRef} width={width} height={height} aria-label="Score Dust layer" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: active ? "block" : "none", mixBlendMode: echoScoreDustLayerFrame(track, track.layer.window.startUs / 1e6).cssBlend }} />
      </>}
      {(!clean || !render) && <div role="status" style={chip}>
        {status}
        {!render && !compiled.error && (job?.state === "running"
          ? <> · {job.message} <button type="button" style={{ marginLeft: 6 }} onClick={() => cancelEchoScoreDustLayerRender(renderKey)}>Cancel</button></>
          : job?.state === "done" ? <> · {editingDisabled ? "Rendered. Open the cut's editable copy to bind it." : job.message}</>
          : <>
            {job?.rendered && job.state === "error" && <button type="button" style={{ marginLeft: 6 }} onClick={() => retryEchoScoreDustLayerSave(renderKey)} data-testid="score-dust-layer-retry-save">Retry save (keeps the rendered frames)</button>}
            {savedRender && <button type="button" style={{ marginLeft: 6 }} disabled={editingDisabled} onClick={useSavedRender} data-testid="score-dust-layer-use-saved">Use finished render ({new Date(savedRender.publishedAt).toLocaleString()})</button>}
            <button type="button" style={{ marginLeft: 6 }} disabled={editingDisabled || typeof VideoEncoder !== "function"} onClick={renderLayer} data-testid="score-dust-layer-render">{savedRender ? "Render again" : "Render layer"}</button>
          </>)}
        {job && job.state !== "running" && job.state !== "done" && job.message && <div role={job.state === "error" ? "alert" : undefined}>{job.message}</div>}
      </div>}
    </div>
  );
}
