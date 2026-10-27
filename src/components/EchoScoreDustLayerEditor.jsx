// Add, adjust and remove the selected cut's Score Dust layer (IP-6). A new
// layer is bound to the song's current score (latest saved direction and
// verified lyric timing); edits land in the cut's working copy. The preview
// overlay renders the layer; saving the cut keeps it.
import { useCallback, useEffect, useState } from "react";
import { adjustEchoScoreDustLayer, echoScoreDustLayerMatchesScore, planEchoScoreDustLayer, rebindEchoScoreDustLayer, ECHO_SCORE_DUST_LAYER_BLENDS } from "../domain/echo-score-dust-layer.js";
import { currentEchoScoreDustSongScore } from "./echo-score-dust-layer-client.js";

const BLEND_LABELS = Object.freeze({ over: "Over (normal)", screen: "Screen", lighter: "Add (lighter)" });
const WINDOW_MESSAGES = Object.freeze({
  score_dust_layer_window: "The layer must start before it ends, at 0 s or later. Nothing was changed.",
  score_dust_layer_duration: "The layer must end within the song. Nothing was changed.",
});
const box = { margin: "8px 0", padding: "8px 12px", border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, minWidth: 0, fontSize: 13 };
const seconds = (us) => (us / 1e6).toFixed(3);

export default function EchoScoreDustLayerEditor({ project, apiBase = "", currentTime = 0, editingDisabled = false, onChange }) {
  const layer = project?.score_dust_layer || null, songId = project?.song_id, duration = Number(project?.duration) || 0;
  const [open, setOpen] = useState(Boolean(layer));
  const [score, setScore] = useState({ state: "idle", value: null, message: "" });
  const [draft, setDraft] = useState({ start: "", end: "" });
  const [notice, setNotice] = useState("");

  const loadScore = useCallback(async () => {
    if (!songId) return;
    setScore({ state: "loading", value: null, message: "Reading the song's current Score Dust score…" });
    try { setScore({ state: "ready", value: await currentEchoScoreDustSongScore({ apiBase, songId }), message: "" }); }
    catch (error) { setScore({ state: "error", value: null, message: String(error?.message || error) }); }
  }, [apiBase, songId]);
  useEffect(() => { setScore({ state: "idle", value: null, message: "" }); setNotice(""); }, [songId]);
  useEffect(() => { if (open && score.state === "idle") loadScore(); }, [open, score.state, loadScore]);
  useEffect(() => { setDraft(layer ? { start: seconds(layer.window.startUs), end: seconds(layer.window.endUs) } : { start: "", end: "" }); }, [layer?.window.startUs, layer?.window.endUs, Boolean(layer)]);

  const apply = (change) => {
    try {
      const { layer: next, renderDropped } = adjustEchoScoreDustLayer(layer, change, { songId, durationSeconds: duration });
      onChange(next);
      setNotice(renderDropped ? "The render no longer covers the new window, so it was released. Render the layer again in the preview." : "");
    } catch (error) {
      setNotice(WINDOW_MESSAGES[error?.code] || String(error?.message || error));
      setDraft({ start: seconds(layer.window.startUs), end: seconds(layer.window.endUs) });
    }
  };
  const add = () => {
    const current = score.value;
    try {
      onChange(planEchoScoreDustLayer({ songId, ...current.source, scoreFingerprint: current.scoreFingerprint, seed: current.seed, startSeconds: 0, endSeconds: duration, opacity: 0.85, blend: "over" }));
      setNotice("Layer added for the whole song. Use Render layer in the preview, then save the cut.");
    } catch (error) { setNotice(String(error?.message || error)); }
  };
  const rebind = () => { onChange(rebindEchoScoreDustLayer(layer, score.value)); setNotice("Rebound to the current score; its old render was released. Render the layer again in the preview."); };
  const commitWindow = () => {
    const start = Number(draft.start), end = Number(draft.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) { setNotice("Start and end must be numbers of seconds."); return; }
    if (start !== layer.window.startUs / 1e6 || end !== layer.window.endUs / 1e6) apply({ startSeconds: start, endSeconds: end });
  };
  const atPlayhead = (key) => apply(key === "start" ? { startSeconds: currentTime } : { endSeconds: currentTime });

  const matches = layer && score.value ? echoScoreDustLayerMatchesScore(layer, score.value) : null;
  const disabled = editingDisabled || !songId;
  return (
    <details data-testid="echo-score-dust-layer-editor" open={open} onToggle={(event) => setOpen(event.currentTarget.open)} style={box}>
      <summary>Score Dust layer {layer ? `· ${seconds(layer.window.startUs)}–${seconds(layer.window.endUs)} s · ${layer.render ? "rendered" : "needs render"}` : "· none"}</summary>
      <p style={{ margin: "6px 0", color: "#cbd5e1" }}>Dust drawn over the media, shaders and Living Light, under the lyrics, in preview and final export.</p>
      {score.state === "loading" && <p role="status">{score.message}</p>}
      {score.state === "error" && <p role="alert">{score.message} <button type="button" onClick={loadScore}>Retry</button></p>}
      {score.value && <p data-testid="echo-score-dust-layer-score" style={{ margin: "4px 0", color: "#94a3b8" }}>
        Current score {score.value.scoreFingerprint} · seed {score.value.seed} · direction {score.value.directionSource} · lyric timing {score.value.lyricTiming || "not used"}
      </p>}
      {!layer && <button type="button" data-testid="score-dust-layer-add" disabled={disabled || !score.value} onClick={add}>Add Score Dust layer</button>}
      {layer && <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label>Start (s) <input aria-label="Score Dust layer start" type="number" step="0.001" min="0" max={duration} value={draft.start} disabled={disabled}
          onChange={(event) => setDraft((value) => ({ ...value, start: event.target.value }))} onBlur={commitWindow} onKeyDown={(event) => event.key === "Enter" && commitWindow()} /></label>
        <button type="button" disabled={disabled} onClick={() => atPlayhead("start")}>Start at playhead</button>
        <label>End (s) <input aria-label="Score Dust layer end" type="number" step="0.001" min="0" max={duration} value={draft.end} disabled={disabled}
          onChange={(event) => setDraft((value) => ({ ...value, end: event.target.value }))} onBlur={commitWindow} onKeyDown={(event) => event.key === "Enter" && commitWindow()} /></label>
        <button type="button" disabled={disabled} onClick={() => atPlayhead("end")}>End at playhead</button>
        <label>Opacity <input aria-label="Score Dust layer opacity" type="range" min="0.05" max="1" step="0.05" value={layer.opacity} disabled={disabled}
          onChange={(event) => apply({ opacity: Number(event.target.value) })} /> {Math.round(layer.opacity * 100)}%</label>
        <label>Blend <select aria-label="Score Dust layer blend" value={layer.blend} disabled={disabled} onChange={(event) => apply({ blend: event.target.value })}>
          {Object.keys(ECHO_SCORE_DUST_LAYER_BLENDS).map((key) => <option key={key} value={key}>{BLEND_LABELS[key] || key}</option>)}
        </select></label>
        <button type="button" data-testid="score-dust-layer-remove" disabled={disabled} onClick={() => { onChange(null); setNotice("Layer removed from the working copy. Save the cut to keep the change."); }}>Remove layer</button>
      </div>}
      {layer && <p data-testid="echo-score-dust-layer-binding" style={{ margin: "6px 0 0" }}>
        {layer.render ? `Render ${layer.render.recordingId.slice(0, 8)} is bound.` : "No render yet: use Render layer in the preview."}{" "}
        {matches === true && "Bound to the song's current score."}
        {matches === false && <>This layer uses an older score ({layer.binding.scoreFingerprint}). <button type="button" data-testid="score-dust-layer-rebind" disabled={disabled} onClick={rebind}>Rebind to current score</button></>}
      </p>}
      {notice && <p role="status" style={{ margin: "6px 0 0", color: "#fde68a" }}>{notice}</p>}
      {layer && <p style={{ margin: "4px 0 0", color: "#94a3b8" }}>Changes are in the cut's working copy. Save the cut to keep them.</p>}
    </details>
  );
}
