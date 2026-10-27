// Score Dust layer in the Director preview (IP-6). Paints the cut's bound
// transparent render at the same place in the stack as the final export:
// over media, shaders and Living Light, under the lyric overlay. Preview and
// export share echoScoreDustLayerFrame and paintEchoScoreDustLayer, so the
// same render frame lands with the same opacity and blend operator.
//
// A layer without a bound render shows its status and can render itself
// here with the existing deterministic transparent export, then bind the
// published render into the working copy of the cut.
import { useEffect, useMemo, useRef, useState } from "react";
import { prepareEchoScorePlayback } from "../domain/echo-visual-score.js";
import { loadEchoScoreDustLayerScore } from "./echo-score-dust-layer-client.js";
import { ensureEchoPreviewRecordingLocalSession } from "../domain/echo-preview-recording.js";
import { bindEchoScoreDustLayerRender, compileEchoScoreDustTrack, echoScoreDustLayerFrame, echoScoreDustLayerVideoAt, paintEchoScoreDustLayer } from "../domain/echo-score-dust-layer.js";
import { decodeSongAudio, exportScoreDustVideo } from "./echo-score-dust-export.js";

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

export default function EchoScoreDustLayerOverlay({ project, audioRef, clockRef, active = true, clean = false, apiBase = "", resolveUri = (uri) => uri, outputProfile, onLayerChange, editingDisabled = false }) {
  const layerKey = JSON.stringify(project?.score_dust_layer ?? null);
  const compiled = useMemo(() => {
    try { return { track: compileEchoScoreDustTrack({ song_id: project?.song_id, duration: project?.duration, score_dust_layer: JSON.parse(layerKey) }), error: null }; }
    catch (error) { return { track: null, error: error.message }; }
  }, [layerKey, project?.song_id, project?.duration]);
  const track = compiled.track, render = track?.layer?.render || null;
  const width = render?.width || outputProfile?.width || 1920, height = render?.height || outputProfile?.height || 1080;
  const canvasRef = useRef(null), videoRef = useRef(null), stateRef = useRef("idle");
  const [playState, setPlayState] = useState("idle");
  const [job, setJob] = useState({ state: "idle", message: "" });
  const controller = useRef(null);

  useEffect(() => {
    if (!active || !render || !canvasRef.current || !videoRef.current) return undefined;
    const canvas = canvasRef.current, video = videoRef.current, ctx = canvas.getContext("2d");
    let raf = 0;
    const publish = (next) => { if (stateRef.current !== next) { stateRef.current = next; setPlayState(next); } };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const audio = audioRef?.current;
      const t = Number(audio?.currentTime ?? clockRef?.current ?? 0), playing = Boolean(audio) && !audio.paused && !audio.ended;
      const frame = echoScoreDustLayerFrame(track, t);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!frame.active) { if (!video.paused) video.pause(); publish("outside-window"); return; }
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
      publish(video.readyState >= 2 && paintEchoScoreDustLayer(ctx, video, frame, canvas.width, canvas.height) ? "painting" : "loading");
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); video.pause(); ctx.clearRect(0, 0, canvas.width, canvas.height); };
  }, [active, track, render, audioRef, clockRef]);

  const renderLayer = async () => {
    const layer = track.layer, start = layer.window.startUs / 1e6, length = (layer.window.endUs - layer.window.startUs) / 1e6;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    try {
      setJob({ state: "running", message: "Loading the layer's score…", progress: 0 });
      const { playback, settings } = await loadBoundPlayback({ apiBase, layer, signal });
      setJob({ state: "running", message: "Loading song audio…", progress: 0 });
      const audio = await decodeSongAudio(`${apiBase}/api/echos/audio-atlas/jobs/${encodeURIComponent(layer.source.atlasRunId)}/audio/master`, { signal });
      const evenWidth = width - (width % 2), evenHeight = height - (height % 2);
      const result = await exportScoreDustVideo({ playback, settings, audio, startSeconds: start, durationSeconds: length, width: evenWidth, height: evenHeight, fps: LAYER_FPS,
        background: "transparent", signal, onProgress: ({ phase, frame, frames }) => setJob({ state: "running", progress: frame / Math.max(1, frames), message: phase === "audio" ? "Encoding audio…" : `Rendering layer frame ${frame} of ${frames}` }) });
      const receipt = result.receipt;
      setJob({ state: "running", message: "Saving the render to Recordings…", progress: 1 });
      await ensureEchoPreviewRecordingLocalSession(apiBase);
      const query = new URLSearchParams({ songId: project.song_id || "", songTitle: project.song_title || "", projectTitle: "Score Dust layer", orientation: receipt.height > receipt.width ? "portrait" : "landscape",
        width: String(receipt.width), height: String(receipt.height), fps: String(receipt.fps), durationMs: String(Math.round(receipt.durationSeconds * 1000)), captureStatus: "complete" });
      const saved = await fetch(`${apiBase}/api/echo/preview-recordings?${query}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "video/webm" }, body: result.blob, signal });
      const recordingId = saved.ok ? (await saved.json().catch(() => ({})))?.recording?.id : null;
      if (!recordingId) throw new Error(`The render could not be saved to Recordings (${saved.status}).`);
      const publishedResponse = await fetch(`${apiBase}/api/echos/score-dust/renders`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordingId }), signal });
      const published = await publishedResponse.json().catch(() => ({}));
      if (!publishedResponse.ok) throw new Error(published.message || `Publishing the render failed (${publishedResponse.status}).`);
      onLayerChange(bindEchoScoreDustLayerRender(layer, { recordingId, uri: published.uri, sha256: published.sha256, receipt }));
      setJob({ state: "done", message: `Rendered ${receipt.frames} frames and bound them to the layer in the working copy. Save the cut to keep it.` });
    } catch (error) {
      setJob({ state: signal.aborted ? "idle" : "error", message: signal.aborted ? "Layer render cancelled." : String(error?.message || error) });
    }
  };

  if (!project?.score_dust_layer) return null;
  const status = compiled.error ? `Score Dust layer is invalid: ${compiled.error}`
    : render ? `Score Dust layer · render ${render.recordingId.slice(0, 8)} · ${track.layer.blend} ${Math.round(track.layer.opacity * 100)}%${playState === "loading" ? " · loading" : ""}`
      : "Score Dust layer needs its render before preview or export.";
  return (
    <div data-testid="echo-score-dust-layer" data-state={compiled.error ? "invalid" : render ? playState : "render-required"} style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }}>
      {render && <>
        <video ref={videoRef} src={resolveUri(render.uri)} muted playsInline preload="auto" crossOrigin="anonymous" aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, opacity: 0.001, left: -10, top: -10 }} />
        <canvas ref={canvasRef} width={width} height={height} aria-label="Score Dust layer" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: active ? "block" : "none", mixBlendMode: echoScoreDustLayerFrame(track, track.layer.window.startUs / 1e6).cssBlend }} />
      </>}
      {(!clean || !render) && <div role="status" style={chip}>
        {status}
        {!render && !compiled.error && (job.state === "running"
          ? <> · {job.message} <button type="button" style={{ marginLeft: 6 }} onClick={() => controller.current?.abort()}>Cancel</button></>
          : <button type="button" style={{ marginLeft: 6 }} disabled={editingDisabled || typeof VideoEncoder !== "function"} onClick={renderLayer} data-testid="score-dust-layer-render">Render layer</button>)}
        {job.state !== "running" && job.message && <div role={job.state === "error" ? "alert" : undefined}>{job.message}</div>}
      </div>}
    </div>
  );
}
