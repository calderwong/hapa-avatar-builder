import { useEffect, useMemo, useRef, useState } from "react";
import { DUST_FORMATION_FAMILIES } from "../domain/echo-dust-swarm.js";
import { ECHO_VISUAL_SCORE_CAMERA_MODES, ECHO_VISUAL_SCORE_EVENT_RESPONSES, ECHO_VISUAL_SCORE_PULSES, placeCameraMove } from "../domain/echo-visual-score.js";
import { applyDustLook, extractDustLook, BUILTIN_DUST_LOOKS, dustLookSlug } from "../domain/echo-score-dust-looks.js";
import { DUST_LYRIC_FONTS, normalizeLyricControl } from "../domain/echo-score-dust-lyrics.js";
import { interpretDustCue, suggestDustDirection, SCORE_DUST_CUE_EXAMPLES } from "../domain/echo-score-dust-director.js";
import { probeScoreDustGpu } from "./echo-score-dust-gpu.js";
import { splitSectionAt, mergeSectionBoundary, moveSectionBoundary, editSectionCue, resetSectionCue } from "../domain/echo-score-dust-sections.js";
import { createAtlasClient } from "../domain/audio-atlas-ui.js";
import { DUST_COLOUR_MODES, DUST_COLOUR_PRESET_LABELS, DUST_FLASH_LIMIT_PER_SECOND, DUST_BACKGROUND_KINDS, normalizeDustBackground, hexToHsl, hslToHex } from "../domain/echo-score-dust-colour.js";
import { decodeSongAudio, exportScoreDustVideo, SCORE_DUST_EXPORT_FORMATS, SCORE_DUST_EXPORT_BACKGROUNDS } from "./echo-score-dust-export.js";
import { ensureEchoPreviewRecordingLocalSession } from "../domain/echo-preview-recording.js";
import { useScoreDustSession } from "./useScoreDustSession.js";
import { DUST_STEM_LABELS } from "../domain/echo-score-dust-stems.js";
import "./EchoScoreDustPanel.css";

const EVENT_KINDS = ["lift", "fall", "build", "break", "change"];
const COLOUR_MODE_LABELS = { palette: "Palette", frequency: "By frequency", speed: "By speed", height: "Along the shape", depth: "By depth", picture: "From the picture" };
const COLOUR_SWITCHES = [["crossfadeSeconds", "Crossfade between sections"], ["liftFlash", "Flash on lifts"], ["breakDesaturate", "Drain colour in breaks"], ["brighterReturns", "Brighter returns"]];
const BACKGROUND_LABELS = { black: "Black (preview shows the stage)", solid: "Solid colour", gradient: "Gradient", palette: "Follows section colours" };
const title = (text) => String(text || "").replace(/^./, (c) => c.toUpperCase());
const CAMERA_LABELS = { hold: "Hold still", drift: "Slow drift", orbit: "Orbit", push: "Push in" };
const EVENT_LABELS = { lift: "Energy lift", fall: "Energy fall", build: "Gradual build", break: "Quiet break", change: "Spectral change" };
const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const hsl = (c, alpha = 1) => `hsl(${c.h} ${Math.round(c.s * 100)}% ${Math.round(c.l * 100)}% / ${alpha})`;

function sourceSummary(dust) {
  if (dust.status === "loading") return "Loading the Song's Audio Atlas timeline…";
  if (dust.kind === "atlas") return `Audio Atlas run ${dust.runId} · ${dust.saved ? `saved direction r${dust.saved.revision}${dust.savedInvalid ? " is invalid and was skipped; using the default" : dust.saved.timelineFingerprint !== dust.timeline?.fingerprint ? " (saved for a different analysis; check motif groups)" : ""}` : "default direction"}${dust.dirty ? " · unsaved edits" : ""}`;
  if (dust.kind === "prepared") return "Prepared performance timing (no repeat or lift evidence). Analyze this Song in Audio Atlas with Detect beats for full structure.";
  return `Live reflex only. ${dust.message || "No song structure available."} Analyze this Song in Audio Atlas with Detect beats to direct it.`;
}

/** Score timeline: motif per section, lifts, phrases and the playhead. Click to seek. */
function ScoreStrip({ dust, currentTime, onSeek }) {
  const { score, timeline } = dust;
  if (!score) return null;
  const duration = score.durationSeconds || 1, x = (t) => (t / duration) * 1000;
  const motifs = new Map(score.motifs.map((m) => [m.id, m]));
  const seek = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek?.(Math.max(0, Math.min(duration, ((event.clientX - box.left) / box.width) * duration)));
  };
  return (
    <svg className="score-dust-strip" viewBox="0 0 1000 92" preserveAspectRatio="none" role="img" onClick={seek}
      aria-label={`Visual score: ${score.cues.length} cues, ${score.events.length} events, ${score.phrases.length} phrases, ${(score.cameraMoves || []).length} camera moves. Click to seek.`}>
      {score.cues.map((cue) => {
        const motif = motifs.get(cue.motifId), palette = score.palettes[motif.paletteId];
        return (
          <g key={cue.id}>
            <title>{`${time(cue.start)}–${time(cue.end)} · ${motif.family} (${motif.repeatGroup}) · ${cue.reason}`}</title>
            <rect x={x(cue.start)} y={6} width={Math.max(1, x(cue.end) - x(cue.start) - 1)} height={40} fill={hsl(palette[0], 0.32 + 0.5 * cue.busy[1])} className={cue.edited || cue.mergedCueIds || cue.id.includes("-split-") ? "score-dust-strip-edited" : undefined} />
            <rect x={x(cue.start)} y={42} width={Math.max(1, x(cue.end) - x(cue.start) - 1)} height={4} fill={hsl(palette[1] || palette[0])} />
            {x(cue.end) - x(cue.start) > 60 && <text x={x(cue.start) + 5} y={22} className="score-dust-strip-label">{motif.family}</text>}
            {x(cue.end) - x(cue.start) > 60 && <text x={x(cue.start) + 5} y={36} className="score-dust-strip-sub">{motif.repeatGroup.replace("group-", "")}</text>}
          </g>
        );
      })}
      {(timeline?.downbeats || []).filter((_, i) => i % 4 === 0).map((t) => <line key={`d${t}`} x1={x(t)} x2={x(t)} y1={46} y2={50} className="score-dust-strip-bar" />)}
      {score.events.map((event) => (
        <g key={event.id}>
          <title>{`${EVENT_LABELS[event.kind] || event.kind} at ${time(event.at)} → ${event.response}`}</title>
          <path d={`M${x(event.at)} 4 l5 -4 h-10 z`} className={`score-dust-strip-event is-${event.response}`} transform={`translate(0 ${event.kind === "lift" ? 6 : 2})`} />
          <line x1={x(event.at)} x2={x(event.at)} y1={6} y2={46} className={`score-dust-strip-event-line is-${event.response}`} />
        </g>
      ))}
      {score.phrases.map((phrase) => (
        <g key={phrase.id}>
          <title>{`“${phrase.text}” ${time(phrase.start)}–${time(phrase.end)}${phrase.burst ? " · burst" : ""}`}</title>
          <rect x={x(phrase.start)} y={56} width={Math.max(2, x(phrase.end) - x(phrase.start))} height={10} className={phrase.burst ? "score-dust-strip-phrase is-burst" : "score-dust-strip-phrase"} />
        </g>
      ))}
      {(score.cameraMoves || []).map((move) => (
        <g key={move.id || move.start} data-testid="score-dust-strip-camera">
          <title>{`Camera: ${CAMERA_LABELS[move.mode] || move.mode} ${time(move.start)}–${time(move.end)}`}</title>
          <rect x={x(move.start)} y={70} width={Math.max(2, x(move.end) - x(move.start))} height={16} rx={3} className={`score-dust-strip-camera is-${move.mode}`} />
          {x(move.end) - x(move.start) > 40 && <text x={x(move.start) + 4} y={81} className="score-dust-strip-camera-label">{move.mode}</text>}
        </g>
      ))}
      <line x1={x(currentTime)} x2={x(currentTime)} y1={0} y2={92} className="score-dust-strip-playhead" />
    </svg>
  );
}

const EXPORT_RANGES = {
  clip: "15 s clip from playhead",
  section: "Current section",
  shot: "Current shot of the cut",
  song: "Whole song",
  loop: "8 s seamless loop from playhead",
};

/** Deterministic export: frames at exact song times, saved to Preview Recordings. */
function ScoreDustExport({ dust, currentTime, exportContext }) {
  const [range, setRange] = useState("clip"), [format, setFormat] = useState("landscape"), [fps, setFps] = useState(30);
  const hasCut = Boolean(exportContext?.shots?.some((shot) => shot?.media_uri || shot?.media_contract?.runtimeUri));
  const [background, setBackground] = useState(hasCut ? "cut" : "score");
  const [job, setJob] = useState({ state: "idle" });
  const controller = useRef(null), download = useRef("");
  useEffect(() => () => { controller.current?.abort(); if (download.current) URL.revokeObjectURL(download.current); }, []);
  const supported = typeof VideoEncoder === "function";
  const run = async () => {
    const playback = dust.playback, duration = playback.score.durationSeconds, at = Math.min(currentTime, duration - 0.5);
    const cue = playback.stateAt(at).cue;
    const shot = (exportContext?.shots || []).find((s) => at >= Number(s.start_sec) && at < Number(s.end_sec));
    if (range === "shot" && !shot) { setJob({ state: "error", message: "No cut shot under the playhead." }); return; }
    const plan = range === "song" ? { start: 0, length: duration } : range === "section" ? { start: cue.start, length: cue.end - cue.start }
      : range === "shot" ? { start: Number(shot.start_sec), length: Math.min(duration, Number(shot.end_sec)) - Number(shot.start_sec) }
      : range === "loop" ? { start: Math.max(1.5, at), length: 8, bridge: 1.5 } : { start: at, length: 15 };
    controller.current = new AbortController();
    if (download.current) { URL.revokeObjectURL(download.current); download.current = ""; }
    setJob({ state: "running", message: "Loading song audio…", progress: 0 });
    try {
      let audio = null;
      if (exportContext?.audioUrl) { try { audio = await decodeSongAudio(exportContext.audioUrl, { signal: controller.current.signal }); } catch { audio = null; } }
      const result = await exportScoreDustVideo({ playback, settings: dust.settings, audio, startSeconds: plan.start, durationSeconds: plan.length, loopBridgeSeconds: plan.bridge || 0,
        format, fps, stems: dust.stems, background, shots: exportContext?.shots || null, resolveUri: exportContext?.resolveUri, signal: controller.current.signal,
        onProgress: ({ phase, frame, frames }) => setJob({ state: "running", progress: frame / Math.max(1, frames), message: phase === "audio" ? "Encoding audio…" : `Rendering frame ${frame} of ${frames}` }) });
      download.current = URL.createObjectURL(result.blob);
      const r = result.receipt;
      let saved = "", recordingId = null;
      try {
        await ensureEchoPreviewRecordingLocalSession(exportContext?.apiBase || "");
        const query = new URLSearchParams({ songId: exportContext?.songId || "", songTitle: exportContext?.songTitle || "", projectTitle: `Score Dust · ${EXPORT_RANGES[range]}`,
          orientation: r.height > r.width ? "portrait" : "landscape", width: String(r.width), height: String(r.height), fps: String(r.fps), durationMs: String(Math.round(r.durationSeconds * 1000)), captureStatus: "complete" });
        const response = await fetch(`${exportContext?.apiBase || ""}/api/echo/preview-recordings?${query}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "video/webm" }, body: result.blob });
        saved = response.ok ? "Saved to Recordings." : `Not saved to Recordings (${response.status}); download it below.`;
        if (response.ok) recordingId = (await response.json().catch(() => ({})))?.recording?.id || null;
      } catch (error) { saved = `Not saved to Recordings (${error.message}); download it below.`; }
      const mediaNote = r.background === "transparent" ? " · transparent (alpha)" : r.background === "cut" ? ` · over the cut (${r.media.drawn} media frames${r.media.unavailable.length ? `, ${r.media.unavailable.length} source${r.media.unavailable.length === 1 ? "" : "s"} unavailable` : ""})` : "";
      setJob({ state: "done", receipt: r, recordingId, loop: range === "loop", message: `${r.frames} frames · ${(r.bytes / 1048576).toFixed(1)} MB · ${r.audio ? "with song audio" : "no audio"}${mediaNote}${r.loopBridgeSeconds ? ` · ${r.loopBridgeSeconds}s loop bridge` : ""}. ${saved}` });
    } catch (error) {
      setJob({ state: controller.current?.signal.aborted ? "idle" : "error", message: controller.current?.signal.aborted ? "Export cancelled." : String(error?.message || error) });
    }
  };
  return (
    <fieldset className="score-dust-export">
      <legend>Export video <span>exact song-time frames</span></legend>
      <label>Range <select aria-label="Export range" value={range} onChange={(e) => setRange(e.target.value)}>{Object.entries(EXPORT_RANGES).filter(([k]) => k !== "shot" || exportContext?.shots?.length).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Format <select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value)}>{Object.entries(SCORE_DUST_EXPORT_FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      <label>Background <select aria-label="Export background" value={background} onChange={(e) => setBackground(e.target.value)}>
        {Object.entries(SCORE_DUST_EXPORT_BACKGROUNDS).map(([k, v]) => <option key={k} value={k} disabled={k === "cut" && !hasCut}>{v}{k === "cut" && !hasCut ? " (none in this cut)" : ""}</option>)}
      </select></label>
      <label>FPS <select aria-label="Export frame rate" value={fps} onChange={(e) => setFps(Number(e.target.value))}><option value={30}>30</option><option value={60}>60</option></select></label>
      {job.state === "running"
        ? <><progress value={job.progress || 0} max={1} aria-label="Export progress" /><button type="button" className="hapa-btn" onClick={() => controller.current?.abort(new Error("Export cancelled"))}>Cancel</button></>
        : <button type="button" className="hapa-btn" disabled={!supported || !dust.playback} onClick={run} data-testid="score-dust-export">Export video</button>}
      {!supported && <span className="score-dust-hint">This browser has no WebCodecs encoder.</span>}
      {job.message && <span role={job.state === "error" ? "alert" : "status"} className="score-dust-hint">{job.message}</span>}
      {job.state === "done" && download.current && <a className="hapa-btn" href={download.current} download={`score-dust-${exportContext?.songId || "song"}-${Math.round(job.receipt.startSeconds)}s.webm`}>Download .webm</a>}
      {job.state === "done" && job.recordingId && <AttachLoop job={job} exportContext={exportContext} />}
      {job.state === "done" && job.recordingId && exportContext?.placeInCut && job.receipt.background !== "transparent" && <PlaceInCut job={job} exportContext={exportContext} />}
    </fieldset>
  );
}

/** Score background: black, solid, gradient, or following the section palette. */
function BackgroundControls({ background, update }) {
  const bg = normalizeDustBackground(background);
  const set = (patch) => update((current) => ({ background: { ...normalizeDustBackground(current.background), ...patch } }));
  return (
    <>
      <label>Background <select aria-label="Background" value={bg.kind} onChange={(e) => (e.target.value === "black" ? update(() => ({ background: undefined })) : set({ kind: e.target.value }))}>
        {DUST_BACKGROUND_KINDS.map((k) => <option key={k} value={k}>{BACKGROUND_LABELS[k]}</option>)}
      </select></label>
      {(bg.kind === "solid" || bg.kind === "gradient") && (
        <label className="score-dust-swatches"><input type="color" aria-label="Background colour" value={bg.colour} onChange={(e) => set({ colour: e.target.value })} />
          {bg.kind === "gradient" && <input type="color" aria-label="Background second colour" value={bg.colour2} onChange={(e) => set({ colour2: e.target.value })} />}</label>
      )}
      {(bg.kind === "gradient" || bg.kind === "palette") && (
        <label>Shape <select aria-label="Background shape" value={bg.shape} onChange={(e) => set({ shape: e.target.value })}><option value="radial">Radial</option><option value="linear">Top to bottom</option></select></label>
      )}
    </>
  );
}

/** Live detail: the exact CPU swarm, or the dense GPU swarm for preview. */
function DetailTier({ settings, update }) {
  const gpu = useMemo(() => probeScoreDustGpu(), []);
  const set = (patch) => update((current) => ({ playSettings: { ...(current.playSettings || {}), ...patch } }));
  return (
    <>
      <label>Detail <select aria-label="Detail tier" value={settings?.renderer || "cpu"} onChange={(e) => set({ renderer: e.target.value })}>
        <option value="cpu">Exact (CPU, up to 4k live)</option>
        <option value="gpu" disabled={!gpu.ok}>Dense (GPU){gpu.ok ? "" : " — unavailable"}</option>
      </select></label>
      {settings?.renderer === "gpu" && <label>Particles <select aria-label="GPU particle count" value={settings.gpuParticleCount} onChange={(e) => set({ gpuParticleCount: Number(e.target.value) })}>
        {[20000, 40000, 60000, 80000].map((n) => <option key={n} value={n}>{n.toLocaleString("en-US")}</option>)}
      </select></label>}
      <span className="score-dust-hint">{gpu.ok ? "Dense is preview only; exports and recordings stay on the exact CPU swarm." : gpu.reason}</span>
    </>
  );
}

/** Direct with words, or start from a suggestion (local rules; nothing is sent anywhere). */
function ScoreDustDirector({ dust }) {
  const [text, setText] = useState(""), [result, setResult] = useState(null);
  const apply = (cue) => {
    const value = interpretDustCue(cue, { timeline: dust.timeline, score: dust.score, direction: dust.direction });
    if (value.understood) dust.setDraft(() => value.direction);
    setResult({ kind: "cue", steps: value.steps, unknown: value.unknown });
  };
  const suggest = () => {
    const value = suggestDustDirection({ timeline: dust.timeline, mood: dust.song?.mood || "", tags: dust.song?.tags || [], lyricLines: dust.lyricLines, title: dust.song?.title || "" });
    dust.setDraft(() => value.direction);
    setResult({ kind: "suggest", reasons: value.reasons });
  };
  return (
    <fieldset className="score-dust-director" data-testid="score-dust-director">
      <legend>Direct with words <span>plain-language cues; section names are inferred, so they are “likely”</span></legend>
      <textarea rows={2} aria-label="Direction cue" placeholder={`e.g. ${SCORE_DUST_CUE_EXAMPLES[0]}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
      <span className="score-dust-moves">
        <button type="button" className="hapa-btn" disabled={!text.trim()} onClick={() => apply(text)} data-testid="score-dust-cue-apply">Apply cue</button>
        <button type="button" className="hapa-btn" onClick={suggest} data-testid="score-dust-suggest">Suggest a direction{dust.song?.mood ? ` (${dust.song.mood})` : ""}</button>
      </span>
      <span className="score-dust-moves">{SCORE_DUST_CUE_EXAMPLES.map((example) => <button key={example} type="button" className="score-dust-chip" onClick={() => setText(example)}>{example}</button>)}</span>
      {result?.kind === "cue" && (
        <ul className="score-dust-phrases" data-testid="score-dust-cue-result">
          {result.steps.map((s, i) => <li key={`s${i}`}>“{s.said}” → {s.did.join("; ")}</li>)}
          {result.unknown.map((u, i) => <li key={`u${i}`} className="score-dust-unknown">Not understood: “{u}”</li>)}
        </ul>
      )}
      {result?.kind === "suggest" && <ul className="score-dust-phrases" data-testid="score-dust-suggest-result">{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      {result && <span className="score-dust-hint">Applied as unsaved edits; use Discard edits to undo.</span>}
    </fieldset>
  );
}

/** A repeat group's picture: shape only, a cast Avatar, a text logo or an SVG logo. */
function MotifPicture({ group, current, options, update }) {
  const file = useRef(null), [error, setError] = useState("");
  const set = (ref) => update((d) => { const images = { ...(d.images || {}) }; if (ref) images[group] = ref; else delete images[group]; return { images }; });
  const value = current?.kind === "text" ? "text" : current?.kind === "svg" ? "svg" : current?.assetId || "";
  const choose = (v) => {
    setError("");
    if (v === "text") set({ assetId: `text:${group}`, kind: "text", text: "HAPA", label: "Text logo" });
    else if (v === "svg") file.current?.click();
    else { const option = options.find((o) => o.assetId === v); set(option ? { assetId: option.assetId, url: option.url, label: option.label, avatarId: option.avatarId, ...(option.kind ? { kind: option.kind } : {}) } : null); }
  };
  const readSvg = (event) => {
    const picked = event.target.files?.[0]; event.target.value = "";
    if (!picked) return;
    if (!/svg/.test(picked.type) && !/\.svg$/i.test(picked.name)) { setError("Choose an .svg file."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "").replace(/^data:[^;,]*/, "data:image/svg+xml");
      if (url.length > 32 * 1024) { setError("SVG logos must be under 32 KB; simplify the file or use an Avatar picture."); return; }
      set({ assetId: `svg:${group}:${picked.name.slice(0, 40)}`, kind: "svg", url, label: picked.name.slice(0, 60) });
    };
    reader.readAsDataURL(picked);
  };
  return (
    <>
      <select aria-label={`Picture for ${group}`} value={value} onChange={(e) => choose(e.target.value)}>
        <option value="">Shape only</option>
        <option value="text">Text logo…</option>
        <option value="svg">{current?.kind === "svg" ? `SVG: ${current.label}` : "SVG logo file…"}</option>
        {options.map((o) => <option key={o.assetId} value={o.assetId}>{o.kind === "model" ? "3D model" : "Picture"}: {o.label}</option>)}
      </select>
      <input ref={file} type="file" accept=".svg,image/svg+xml" hidden onChange={readSvg} aria-label={`SVG logo for ${group}`} />
      {current?.kind === "text" && <input type="text" maxLength={24} aria-label={`Logo text for ${group}`} value={current.text}
        onChange={(e) => set({ ...current, text: e.target.value.slice(0, 24) || " " })} />}
      {error && <span role="alert" className="score-dust-hint">{error}</span>}
    </>
  );
}

/** Which lyric lines become dust words, in what font, and whether word by word. */
function ScoreDustLyrics({ dust, update, onSeek, lyricStatus }) {
  const { score, direction } = dust, control = normalizeLyricControl(direction.lyrics, direction.lyricPhrases);
  const set = (patch) => update((current) => {
    const next = { lyrics: { ...normalizeLyricControl(current.lyrics, current.lyricPhrases), ...patch } };
    return current.lyricPhrases !== undefined ? { ...next, lyricPhrases: undefined } : next;
  });
  const lines = (dust.lyricLines || []).map((line, index) => ({ index, text: String(line?.text || "").trim(), start: Number(line?.start ?? line?.startSeconds) })).filter((l) => l.text && Number.isFinite(l.start));
  const shownWords = score.phrases.filter((p) => p.wordOf).length;
  return (
    <fieldset data-testid="score-dust-lyrics">
      <legend>Lyrics <span>words formed from dust</span></legend>
      <label>Show <select aria-label="Lyric lines" value={control.pick} disabled={Boolean(direction.phrases)} onChange={(e) => set({ pick: e.target.value })}>
        <option value="hooks">Hooks, chosen automatically</option><option value="chosen" disabled={!lines.length}>Lines I choose</option><option value="off">No words</option>
      </select></label>
      {control.pick === "hooks" && <label>Up to <input type="number" min="1" max="16" step="1" aria-label="Maximum hooks" value={control.max} onChange={(e) => set({ max: Math.min(16, Math.max(1, Math.floor(Number(e.target.value) || 1))) })} /> hooks</label>}
      <label>Font <select aria-label="Lyric font" value={control.font} onChange={(e) => set({ font: e.target.value })}>
        {Object.entries(DUST_LYRIC_FONTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select></label>
      <label>Case <select aria-label="Lyric case" value={control.textCase} onChange={(e) => set({ textCase: e.target.value })}>
        <option value="as-sung">As written</option><option value="upper">UPPER</option><option value="lower">lower</option>
      </select></label>
      <label><input type="checkbox" aria-label="Word by word" checked={control.wordByWord} onChange={(e) => set({ wordByWord: e.target.checked })} /> Word by word (needs word timing)</label>
      <span className="score-dust-hint">
        {direction.phrases ? `${score.phrases.length} phrases set by direction.`
          : lyricStatus ? (lyricStatus.status === "audio-mismatch" ? "Lyric timing belongs to different audio; no words shown." : `${score.phrases.length - shownWords + new Set(score.phrases.filter((p) => p.wordOf).map((p) => p.wordOf)).size} line${score.phrases.length === 1 ? "" : "s"} shown${shownWords ? ` as ${shownWords} words` : ""}.${lyricStatus.skipped?.length ? ` ${lyricStatus.skipped.length} chosen line${lyricStatus.skipped.length === 1 ? "" : "s"} skipped (overlap or no timing).` : ""}`)
            : control.pick === "off" ? "Words off." : "No timed lyrics for this Song."}
      </span>
      {control.pick === "chosen" && lines.length > 0 && (
        <ul className="score-dust-phrases score-dust-lyric-lines">{lines.map((line) => (
          <li key={line.index}><label><input type="checkbox" aria-label={`Show line ${line.index + 1}`} checked={control.lines.includes(line.index)}
            onChange={(e) => set({ lines: e.target.checked ? [...control.lines, line.index] : control.lines.filter((i) => i !== line.index) })} />
            <button type="button" onClick={() => onSeek?.(line.start)}>{time(line.start)}</button> {line.text}</label></li>
        ))}</ul>
      )}
      {control.pick !== "chosen" && score.phrases.length > 0 && <ul className="score-dust-phrases">{score.phrases.filter((p) => !p.wordOf || p.id.endsWith("-w0")).map((p) => <li key={p.id}><button type="button" onClick={() => onSeek?.(p.start)}>{time(p.start)}</button> “{p.wordOf ? score.phrases.filter((w) => w.wordOf === p.wordOf).map((w) => w.text).join(" ") : p.text}”{p.burst ? " · burst" : ""}</li>)}</ul>}
    </fieldset>
  );
}

/** Edit the section under the playhead: boundaries and this occurrence's look. */
function ScoreDustSection({ dust, currentTime, onSeek, update }) {
  const { score } = dust, cues = score.cues, duration = score.durationSeconds;
  const index = Math.max(0, cues.findIndex((c) => currentTime >= c.start && currentTime < c.end)), cue = cues[index];
  if (!cue) return null;
  const motif = score.motifs.find((m) => m.id === cue.motifId), group = score.motifs.find((m) => m.repeatGroup === motif.repeatGroup && !m.occurrenceOf) || motif;
  const patch = dust.direction.sections?.cues?.[cue.id] || {}, min = 0.5;
  const sections = (fn) => update((current) => ({ sections: fn(current.sections || {}) }));
  const canSplit = currentTime - cue.start >= min && cue.end - currentTime >= min;
  const busy = (cue.busy[0] + cue.busy[1]) / 2;
  return (
    <fieldset data-testid="score-dust-section">
      <legend>Section <span>{time(cue.start)}–{time(cue.end)} · {motif.repeatGroup.replace("group-", "Group ")} #{(cue.occurrence ?? 0) + 1}{cue.edited || cue.mergedCueIds || cue.id.includes("-split-") ? " · edited" : ""}</span></legend>
      <span className="score-dust-moves">
        <button type="button" className="hapa-btn" disabled={!canSplit} onClick={() => sections((s) => splitSectionAt(s, currentTime))} data-testid="score-dust-section-split">Split at playhead</button>
        <button type="button" className="hapa-btn" disabled={index === 0} onClick={() => sections((s) => mergeSectionBoundary(s, cue.start))}>Merge with previous</button>
        <button type="button" className="hapa-btn" disabled={index === cues.length - 1} onClick={() => sections((s) => mergeSectionBoundary(s, cue.end))} data-testid="score-dust-section-merge-next">Merge with next</button>
      </span>
      <label>Starts <input type="number" step="0.1" aria-label="Section start" disabled={index === 0} value={cue.start}
        onChange={(e) => { const to = Number(e.target.value); if (to > cues[index - 1].start + min && to < cue.end - min) sections((s) => moveSectionBoundary(s, cue.start, to)); }} /></label>
      <label>Ends <input type="number" step="0.1" aria-label="Section end" disabled={index === cues.length - 1} value={cue.end}
        onChange={(e) => { const to = Number(e.target.value); if (to > cue.start + min && to < Math.min(duration, cues[index + 1]?.end ?? duration) - min) sections((s) => moveSectionBoundary(s, cue.end, to)); }} /></label>
      <label>Shape here <select aria-label="Formation for this section" value={patch.family || ""} onChange={(e) => sections((s) => editSectionCue(s, cue.id, { family: e.target.value || undefined }))}>
        <option value="">Same as group ({group.family})</option>
        {DUST_FORMATION_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select></label>
      {dust.pictures?.options?.length > 0 && (
        <label>Picture here <select aria-label="Picture for this section" value={patch.image === null ? "none" : patch.image?.assetId || ""}
          onChange={(e) => { const v = e.target.value, option = dust.pictures.options.find((o) => o.assetId === v); sections((s) => editSectionCue(s, cue.id, { image: v === "" ? undefined : v === "none" ? null : { assetId: option.assetId, url: option.url, label: option.label, avatarId: option.avatarId, ...(option.kind ? { kind: option.kind } : {}) } })); }}>
          <option value="">Same as group</option><option value="none">Shape only</option>
          {dust.pictures.options.map((o) => <option key={o.assetId} value={o.assetId}>{o.label}</option>)}
        </select></label>
      )}
      <label>Density <input type="range" min="0.05" max="1" step="0.05" aria-label="Density for this section" value={cue.density}
        onChange={(e) => sections((s) => editSectionCue(s, cue.id, { density: Number(e.target.value) }))} /></label>
      <label>Busy <input type="range" min="0.07" max="0.93" step="0.01" aria-label="Busy for this section" value={busy}
        onChange={(e) => { const v = Number(e.target.value); sections((s) => editSectionCue(s, cue.id, { busy: [Math.max(0, v - 0.07), Math.min(1, v + 0.07)] })); }} /></label>
      <span className="score-dust-moves">
        <button type="button" className="hapa-btn" onClick={() => onSeek?.(cue.start)}>Seek to start</button>
        <button type="button" className="hapa-btn" onClick={() => sections((s) => resetSectionCue(s, cue))} data-testid="score-dust-section-reset">Reset this section</button>
      </span>
      {score.sectionEdits?.skipped?.length > 0 && <span className="score-dust-hint">{score.sectionEdits.skipped.length} edit{score.sectionEdits.skipped.length === 1 ? "" : "s"} skipped; see notes.</span>}
    </fieldset>
  );
}

/** Camera moves authored against the score; each new move wins its span. */
function ScoreDustCamera({ dust, currentTime, onSeek, update }) {
  const [mode, setMode] = useState("orbit");
  const { score, direction } = dust, duration = score.durationSeconds;
  const moves = direction.cameraMoves || [];
  const place = (move) => update((current) => ({ cameraMoves: placeCameraMove(current.cameraMoves || [], move, { duration }) }));
  const addAtPlayhead = () => {
    const cue = dust.playback?.stateAt(Math.min(currentTime, duration - 0.01)).cue;
    const start = Math.max(0, currentTime), end = Math.min(duration, Math.max(start + 2, cue ? cue.end : start + 8));
    place({ mode, start, end });
  };
  const replace = (index, patch) => update((current) => {
    const rest = (current.cameraMoves || []).filter((_, i) => i !== index), move = { ...(current.cameraMoves || [])[index], ...patch };
    return { cameraMoves: move.end > move.start ? placeCameraMove(rest, move, { duration }) : rest };
  });
  return (
    <fieldset data-testid="score-dust-camera">
      <legend>Camera <span>moves on the strip; each new move wins its span</span></legend>
      <label>Move <select aria-label="Camera move" value={mode} onChange={(e) => setMode(e.target.value)}>
        {ECHO_VISUAL_SCORE_CAMERA_MODES.map((m) => <option key={m} value={m}>{CAMERA_LABELS[m] || m}</option>)}
      </select></label>
      <button type="button" className="hapa-btn" onClick={addAtPlayhead} data-testid="score-dust-camera-add">Add from playhead to section end</button>
      {moves.length > 0 ? (
        <ul className="score-dust-moves">{moves.map((move, index) => (
          <li key={move.id || index}>
            <button type="button" onClick={() => onSeek?.(move.start)} title="Seek to this move">{time(move.start)}</button>
            <select aria-label={`Camera move ${index + 1} mode`} value={move.mode} onChange={(e) => replace(index, { mode: e.target.value })}>
              {ECHO_VISUAL_SCORE_CAMERA_MODES.map((m) => <option key={m} value={m}>{CAMERA_LABELS[m] || m}</option>)}
            </select>
            <input type="number" step="0.1" min="0" aria-label={`Camera move ${index + 1} start`} value={move.start} onChange={(e) => replace(index, { start: Number(e.target.value) })} />
            <input type="number" step="0.1" min="0" aria-label={`Camera move ${index + 1} end`} value={move.end} onChange={(e) => replace(index, { end: Number(e.target.value) })} />
            <button type="button" className="hapa-btn" aria-label={`Remove camera move ${index + 1}`} onClick={() => update((current) => ({ cameraMoves: (current.cameraMoves || []).filter((_, i) => i !== index) }))}>Remove</button>
          </li>
        ))}</ul>
      ) : <span className="score-dust-hint">No authored moves; each section uses its scored camera.</span>}
    </fieldset>
  );
}

/** Named looks shared by every Song: colour, instruments, moments and comfort. */
function ScoreDustLooks({ dust, apiBase }) {
  const client = useMemo(() => createAtlasClient(apiBase), [apiBase]);
  const [looks, setLooks] = useState(BUILTIN_DUST_LOOKS), [chosen, setChosen] = useState(""), [name, setName] = useState(""), [message, setMessage] = useState("");
  const refresh = () => client.request("/visual-score-looks").then((value) => setLooks(value.looks)).catch((error) => setMessage(`Saved looks unavailable (${error.message}); built-ins shown.`));
  useEffect(() => { refresh(); }, [client]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = looks.find((l) => (l.slug || dustLookSlug(l.name)) === chosen);
  const save = async () => {
    try {
      const value = await client.request("/visual-score-looks", { method: "POST", body: JSON.stringify({ name, look: extractDustLook(dust.direction) }) });
      setMessage(`Saved look “${value.look.name}” r${value.look.revision}. It is available on every Song.`); setName(""); setChosen(value.look.slug); refresh();
    } catch (error) { setMessage(error.message); }
  };
  const remove = async () => {
    try { await client.request("/visual-score-looks", { method: "POST", body: JSON.stringify({ name: selected.name, deleted: true }) }); setMessage(`Removed “${selected.name}”; its history is kept.`); setChosen(""); refresh(); }
    catch (error) { setMessage(error.message); }
  };
  return (
    <fieldset data-testid="score-dust-looks">
      <legend>Looks <span>reusable across songs</span></legend>
      <label>Look <select aria-label="Look" value={chosen} onChange={(e) => setChosen(e.target.value)}>
        <option value="">Choose a look…</option>
        {looks.map((l) => <option key={l.slug || l.name} value={l.slug || dustLookSlug(l.name)}>{l.name}{l.builtin ? " (built-in)" : ""}</option>)}
      </select></label>
      <button type="button" className="hapa-btn" disabled={!selected} onClick={() => { dust.setDraft((current) => applyDustLook(current, selected.look)); setMessage(`Applied “${selected.name}”. Shapes, pictures, words and camera moves are unchanged.`); }} data-testid="score-dust-look-apply">Apply</button>
      {selected && !selected.builtin && <button type="button" className="hapa-btn" onClick={remove}>Remove</button>}
      <input type="text" aria-label="New look name" placeholder="Name this look" maxLength={48} value={name} onChange={(e) => setName(e.target.value)} />
      <button type="button" className="hapa-btn" disabled={!dustLookSlug(name)} onClick={save} data-testid="score-dust-look-save">Save current look</button>
      {message && <span role="status" className="score-dust-hint">{message}</span>}
    </fieldset>
  );
}

/** Put a finished render on the shots it covers, as video media in the working copy of the cut. */
function PlaceInCut({ job, exportContext }) {
  const [state, setState] = useState({ state: "idle", message: "" });
  const place = async () => {
    setState({ state: "working", message: "Publishing the render as media…" });
    try {
      const response = await fetch(`${exportContext.apiBase || ""}/api/echos/score-dust/renders`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordingId: job.recordingId }) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.message || `Publish failed (${response.status})`);
      const result = exportContext.placeInCut({ ...value, startSeconds: job.receipt.startSeconds, durationSeconds: job.receipt.durationSeconds, width: job.receipt.width, height: job.receipt.height, receipt: job.receipt });
      if (result.error) throw new Error(result.error);
      const skipped = result.skipped.length ? ` ${result.skipped.length} shot${result.skipped.length === 1 ? "" : "s"} skipped (${[...new Set(result.skipped.map((s) => s.reason))].join("; ")}).` : "";
      setState({ state: result.placed ? "done" : "error", message: result.placed ? `Placed on ${result.placed} shot${result.placed === 1 ? "" : "s"} in the working copy. Save the cut to keep it.${skipped}` : `No shot lies fully inside this render.${skipped} Export the section or whole song.` });
    } catch (error) { setState({ state: "error", message: error.message }); }
  };
  return (
    <span className="score-dust-attach" data-testid="score-dust-place">
      <button type="button" className="hapa-btn" disabled={state.state === "working"} onClick={place} data-testid="score-dust-place-button">Use in the cut (working copy)</button>
      {state.message && <span role={state.state === "error" ? "alert" : "status"} className="score-dust-hint">{state.message}</span>}
    </span>
  );
}

/** Attach a finished export to this Song's card or a Tarot card's loop videos. */
function AttachLoop({ job, exportContext }) {
  const apiBase = exportContext?.apiBase || "";
  const [cards, setCards] = useState([]), [target, setTarget] = useState("song"), [state, setState] = useState({ state: "idle", message: "" });
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/api/tarot`, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null))
      .then((store) => { if (!cancelled && store) setCards((store.cards || []).map((c) => ({ id: c.id, title: c.title || c.id })).slice(0, 500)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [apiBase]);
  const attach = async () => {
    setState({ state: "working", message: "Attaching…" });
    try {
      const body = { recordingId: job.recordingId, receipt: job.receipt, title: `Score Dust ${job.loop ? "loop" : "clip"} · ${exportContext?.songTitle || exportContext?.songId || "song"}`,
        target: target === "song" ? { kind: "song", songId: exportContext?.songId } : { kind: "tarot", cardId: target.slice(6) } };
      const response = await fetch(`${apiBase}/api/echos/score-dust/loops`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.message || `Attach failed (${response.status})`);
      setState({ state: "done", message: target === "song" ? `Attached to this Song's card (${value.loops} Score Dust loop${value.loops === 1 ? "" : "s"}).` : `Attached to ${cards.find((c) => `tarot:${c.id}` === target)?.title || "the Tarot card"} (${value.loops} loop video${value.loops === 1 ? "" : "s"}).` });
    } catch (error) { setState({ state: "error", message: error.message }); }
  };
  return (
    <span className="score-dust-attach" data-testid="score-dust-attach">
      <label>{job.loop ? "Attach loop to" : "Attach clip to"} <select aria-label="Attach to" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="song">This Song's card</option>
        {cards.length > 0 && <optgroup label="Tarot card loop videos">{cards.map((c) => <option key={c.id} value={`tarot:${c.id}`}>{c.title}</option>)}</optgroup>}
      </select></label>
      <button type="button" className="hapa-btn" disabled={state.state === "working"} onClick={attach} data-testid="score-dust-attach-button">Attach</button>
      {state.message && <span role={state.state === "error" ? "alert" : "status"} className="score-dust-hint">{state.message}</span>}
    </span>
  );
}

const REACTION_LABELS = { spark: "✦", heart: "♥", wave: "〜", fire: "🔥", clap: "👏" };

/** Owner tools for phones and other computers: invite link + QR, guests, hand-off, reactions. */
function InviteDevices({ session }) {
  const [invite, setInvite] = useState(null), [qr, setQr] = useState(""), [message, setMessage] = useState("");
  const create = async () => {
    try {
      const value = await session.invite({ ttlMinutes: 60, maxUses: 5 });
      setInvite(value); setMessage("");
      const QRCode = (await import("qrcode")).default;
      setQr(await QRCode.toDataURL(value.link, { margin: 1, width: 180 }));
    } catch (error) { setMessage(error.message); }
  };
  const s = session.session || {}, guests = s.guests || [], recent = (s.reactions || []).filter((r) => Date.now() - r.atRoomMs < 15000 || (s.reactions || []).indexOf(r) >= (s.reactions || []).length - 5);
  return (
    <div className="score-dust-invite" data-testid="score-dust-invite">
      <button type="button" className="hapa-btn" onClick={create} data-testid="score-dust-invite-create">{invite ? "New invite link" : "Invite phones and other devices"}</button>
      {invite && (
        <span className="score-dust-hint">
          <a href={invite.link} target="_blank" rel="noreferrer" data-testid="score-dust-invite-link">Open link</a> · works for {invite.usesLeft} sign-ins until {new Date(invite.expiresAtRoomMs).toLocaleTimeString()} ·{" "}
          <button type="button" className="score-dust-chip" onClick={() => navigator.clipboard?.writeText(invite.link)}>Copy</button>
        </span>
      )}
      {qr && <img src={qr} alt="QR code for the guest link" width={120} height={120} className="score-dust-qr" />}
      <span className="score-dust-hint">Guests sign in with a name, see the same dust, can react, and can drive play only if you hand them control.{s.controller && s.controller !== "owner" ? ` ${guests.find((g) => g.id === s.controller)?.name || "A guest"} has control.` : ""}</span>
      {guests.length > 0 && (
        <ul className="score-dust-phrases" data-testid="score-dust-guests">{guests.map((g) => (
          <li key={g.id}>{g.online ? "●" : "○"} {g.name}
            {s.controller === g.id
              ? <button type="button" className="score-dust-chip" onClick={() => session.handControl("owner")}>Take control back</button>
              : <button type="button" className="score-dust-chip" onClick={() => session.handControl(g.id)}>Give control</button>}
            <button type="button" className="score-dust-chip" onClick={() => session.revokeGuest(g.id)}>Remove</button>
          </li>
        ))}</ul>
      )}
      {recent.length > 0 && <span className="score-dust-hint" data-testid="score-dust-reactions">{recent.map((r) => `${REACTION_LABELS[r.kind] || r.kind} ${r.name}`).join("  ")}</span>}
      {message && <span role="alert" className="score-dust-hint">{message}</span>}
    </div>
  );
}

/** Shared listening: everyone renders locally from the same score, seed and schedule. */
function ScoreDustListenTogether({ dust, songId, apiBase, controls, audioUri = null }) {
  const session = useScoreDustSession({ apiBase, songId, dust, audioUri, ...controls });
  const [joinId, setJoinId] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <fieldset className="score-dust-export" data-testid="score-dust-listen-together">
      <legend>Listen together <span>shared timing and direction; each screen renders its own dust</span></legend>
      {session.role === "none" ? (
        <>
          <button type="button" className="hapa-btn" onClick={session.host} disabled={!dust.score} data-testid="score-dust-host">Host session</button>
          <input type="text" aria-label="Session id" placeholder="Session id or link" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
          <button type="button" className="hapa-btn" disabled={!joinId.trim()} onClick={() => session.join(joinId.includes("scoreDustSession=") ? new URL(joinId, location.href).searchParams.get("scoreDustSession") : joinId)} data-testid="score-dust-join">Join</button>
        </>
      ) : (
        <>
          <span className="score-dust-hint" data-testid="score-dust-session-status">
            {session.role === "host" ? "Hosting" : "Joined"} · r{session.session?.revision} · {session.session?.state}
            {session.offsetMs !== null ? ` · clock offset ${Math.round(session.offsetMs)} ms (delay ${Math.round(session.delayMs)} ms)` : ""}
            {session.role === "peer" ? ` · ${session.corrections} correction${session.corrections === 1 ? "" : "s"}` : ""}
          </span>
          {session.role === "host" && <button type="button" className="hapa-btn" onClick={() => { navigator.clipboard?.writeText(session.joinLink).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? "Link copied" : "Copy join link"}</button>}
          <code className="score-dust-hint" data-testid="score-dust-session-id">{session.session?.id}</code>
          <button type="button" className="hapa-btn" onClick={session.leave}>Leave</button>
          {session.role === "host" && <InviteDevices session={session} />}
        </>
      )}
      {session.message && <span role="status" className="score-dust-hint">{session.message}</span>}
    </fieldset>
  );
}

export default function EchoScoreDustPanel({ dust, currentTime = 0, onSeek, exportContext = null, sessionControls = null }) {
  const [note, setNote] = useState("");
  if (!dust?.enabled) return null;
  const { score, validation, settings, direction } = dust;
  const motifById = score ? new Map(score.motifs.map((m) => [m.id, m])) : new Map();
  // One-occurrence motifs (section edits) are edited in the Section box, not here.
  const groups = score ? score.motifs.filter((motif) => !motif.occurrenceOf).map((motif) => ({ motif, returns: score.cues.filter((c) => motifById.get(c.motifId)?.repeatGroup === motif.repeatGroup).length, palette: score.palettes[motif.paletteId] })) : [];
  const update = (patch) => dust.setDraft((current) => ({ ...current, ...patch(current) }));
  const lyricStatus = score?.phraseSource?.kind === "lyrics" ? score.phraseSource : null;
  return (
    <section className="score-dust-panel" data-testid="echo-score-dust-panel" aria-label="Score Dust direction">
      <header>
        <strong>Score Dust</strong>
        <span className={`score-dust-source is-${dust.kind}`}>{sourceSummary(dust)}</span>
      </header>
      <ScoreStrip dust={dust} currentTime={currentTime} onSeek={onSeek} />
      {validation && !validation.ok && (
        <ul className="score-dust-errors" role="alert">{validation.errors.map((e, i) => <li key={i}><code>{e.code}</code> {e.message}</li>)}</ul>
      )}
      {validation?.warnings?.length > 0 && (
        <details className="score-dust-warnings"><summary>{validation.warnings.length} note{validation.warnings.length === 1 ? "" : "s"}</summary>
          <ul>{validation.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul></details>
      )}
      {score && (
        <div className="score-dust-controls">
          <ScoreDustDirector dust={dust} />
          <fieldset>
            <legend>Motifs <span>one shape and palette per repeating section</span></legend>
            {groups.map(({ motif, returns, palette }) => (
              <label key={motif.id} className="score-dust-motif" title={motif.reason}>
                <span className="score-dust-swatches">{palette.map((c, i) => (
                  <input key={i} type="color" aria-label={`${motif.repeatGroup} colour ${i + 1}`} value={hslToHex(c)}
                    onChange={(event) => update((current) => {
                      const next = palette.map((p) => ({ ...p })), picked = hexToHsl(event.target.value);
                      if (picked) next[i] = picked;
                      return { palettes: { ...(current.palettes || {}), [motif.repeatGroup]: next } };
                    })} />
                ))}</span>
                <span>{motif.repeatGroup.replace("group-", "Group ")} · {returns ? `${returns}×` : "unused"}</span>
                <select aria-label={`Formation for ${motif.repeatGroup}`} value={direction.families?.[motif.repeatGroup] || ""}
                  onChange={(event) => update((current) => {
                    const families = { ...(current.families || {}) };
                    if (event.target.value) families[motif.repeatGroup] = event.target.value; else delete families[motif.repeatGroup];
                    return { families };
                  })}>
                  <option value="">Auto ({motif.family})</option>
                  {DUST_FORMATION_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
                </select>
                <MotifPicture group={motif.repeatGroup} current={direction.images?.[motif.repeatGroup]} options={dust.pictures?.options || []} update={update} />
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Look and timing</legend>
            <label>Base hue <input type="range" min="0" max="359" step="1" aria-label="Base hue"
              value={Number.isFinite(direction.baseHue) ? direction.baseHue : Math.round(groups[0]?.palette[0]?.h ?? 180)}
              onChange={(event) => update(() => ({ baseHue: Number(event.target.value) }))} /></label>
            <label>Pulse <select aria-label="Beat pulse" value={settings?.pulse || "normal"}
              onChange={(event) => update((current) => ({ playSettings: { ...(current.playSettings || {}), pulse: event.target.value } }))}>
              {ECHO_VISUAL_SCORE_PULSES.map((pulse) => <option key={pulse} value={pulse}>{pulse}{dust.timeline?.tempo?.alternativesBpm ? ` · ${dust.timeline.tempo.alternativesBpm[pulse].toFixed(1)} BPM` : ""}</option>)}
            </select></label>
            {dust.timeline?.tempo?.ambiguous && <span className="score-dust-hint">Tempo is ambiguous; half time may feel truer.</span>}
            <label>Seed <input type="number" min="0" step="1" aria-label="Performance seed" value={settings?.seed ?? 0}
              onChange={(event) => update((current) => ({ playSettings: { ...(current.playSettings || {}), seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) } }))} /></label>
            <button type="button" className="hapa-btn" onClick={() => update((current) => ({ playSettings: { ...(current.playSettings || {}), seed: Math.floor(Math.random() * 2 ** 31) } }))}>Vary</button>
            <DetailTier settings={settings} update={update} />
          </fieldset>
          <fieldset data-testid="score-dust-colour">
            <legend>Colour</legend>
            <label>Mode <select aria-label="Colour mode" value={score.colour?.mode || "palette"} onChange={(e) => update((current) => ({ colour: { ...(current.colour || {}), mode: e.target.value } }))}>
              {DUST_COLOUR_MODES.map((m) => <option key={m} value={m}>{COLOUR_MODE_LABELS[m]}</option>)}
            </select></label>
            <label>Preset <select aria-label="Colour preset" value={direction.colour?.preset || ""} onChange={(e) => update((current) => ({ colour: { ...(current.colour || {}), preset: e.target.value || null } }))}>
              <option value="">Generated</option>
              <option value="album" disabled={!dust.album}>{dust.album ? `Album colour · ${title(dust.album.phase)} · ${dust.album.teamColour}` : "Album colour (Song not in the album)"}</option>
              {Object.entries(DUST_COLOUR_PRESET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
            {direction.colour?.preset === "album" && score.colour?.album && <span className="score-dust-hint" data-testid="score-dust-album">Track {score.colour.album.position} of {score.colour.album.of}: {score.colour.album.phase} phase, {score.colour.album.teamColour} perspective.</span>}
            {direction.colour?.preset && direction.palettes && Object.keys(direction.palettes).length > 0 && (
              <button type="button" className="hapa-btn" onClick={() => update(() => ({ palettes: {} }))}>Apply preset to edited sections</button>
            )}
            <BackgroundControls background={direction.background} update={update} />
            {COLOUR_SWITCHES.map(([key, label]) => (
              <label key={key}><input type="checkbox" aria-label={label}
                checked={key === "crossfadeSeconds" ? (score.colour?.crossfadeSeconds ?? 1.2) > 0 : score.colour?.[key] !== false}
                onChange={(e) => update((current) => ({ colour: { ...(current.colour || {}), [key]: key === "crossfadeSeconds" ? (e.target.checked ? 1.2 : 0) : e.target.checked } }))} /> {label}</label>
            ))}
          </fieldset>
          <fieldset data-testid="score-dust-comfort">
            <legend>Comfort</legend>
            <label><input type="checkbox" aria-label="Reduced motion" checked={Boolean(settings?.reducedMotion)}
              onChange={(e) => update((current) => ({ playSettings: { ...(current.playSettings || {}), reducedMotion: e.target.checked } }))} /> Reduced motion</label>
            <label>Bright flashes <select aria-label="Bright flash limit" value={settings?.flashLimitPerSecond ?? DUST_FLASH_LIMIT_PER_SECOND}
              onChange={(e) => update((current) => ({ playSettings: { ...(current.playSettings || {}), flashLimitPerSecond: Number(e.target.value) } }))}>
              <option value={3}>Up to 3 per second</option><option value={2}>Up to 2 per second</option><option value={1}>Up to 1 per second</option><option value={0}>None</option>
            </select></label>
            <span className="score-dust-hint">Flashes never exceed 3 per second. Reduced motion follows your system setting until you change it here.</span>
          </fieldset>
          <fieldset data-testid="score-dust-instruments">
            <legend>Instruments</legend>
            {Object.entries(DUST_STEM_LABELS).map(([group, label]) => {
              const available = dust.stems?.available.includes(group);
              return (
                <label key={group} title={available ? `From ${dust.stems.roles[group].join(", ")}` : "No separated stem for this instrument"}>
                  <span style={{ minWidth: 150, opacity: available ? 1 : 0.5 }}>{label}</span>
                  <input type="range" min="0" max="1" step="0.05" aria-label={`${group} response`} disabled={!available}
                    value={score.stemResponses?.[group] ?? 1}
                    onChange={(e) => update((current) => ({ stemResponses: { ...(current.stemResponses || {}), [group]: Number(e.target.value) } }))} />
                </label>
              );
            })}
            <span className="score-dust-hint">{dust.stems ? `Stems: ${dust.stems.available.join(", ")} (prepared song timing).` : "No separated stems loaded. Choose Audio visuals → Prepared song timing on a song with stems."}</span>
          </fieldset>
          <ScoreDustSection dust={dust} currentTime={currentTime} onSeek={onSeek} update={update} />
          <ScoreDustCamera dust={dust} currentTime={currentTime} onSeek={onSeek} update={update} />
          <ScoreDustLooks dust={dust} apiBase={exportContext?.apiBase || ""} />
          <fieldset>
            <legend>Moments</legend>
            {EVENT_KINDS.filter((kind) => score.events.some((e) => e.kind === kind)).map((kind) => (
              <label key={kind}>{EVENT_LABELS[kind]} ({score.events.filter((e) => e.kind === kind).length})
                <select aria-label={`Response to ${EVENT_LABELS[kind]}`} value={direction.eventResponses?.[kind] || ""}
                  onChange={(event) => update((current) => {
                    const eventResponses = { ...(current.eventResponses || {}) };
                    if (event.target.value) eventResponses[kind] = event.target.value; else delete eventResponses[kind];
                    return { eventResponses };
                  })}>
                  <option value="">Auto ({score.events.find((e) => e.kind === kind)?.response})</option>
                  {ECHO_VISUAL_SCORE_EVENT_RESPONSES.map((response) => <option key={response} value={response}>{response}</option>)}
                </select></label>
            ))}
            {!score.events.length && <span className="score-dust-hint">No lifts or breaks in the evidence.</span>}
          </fieldset>
          <ScoreDustLyrics dust={dust} update={update} onSeek={onSeek} lyricStatus={lyricStatus} />
        </div>
      )}
      {dust.playback && <ScoreDustExport dust={dust} currentTime={currentTime} exportContext={exportContext} />}
      {sessionControls && <ScoreDustListenTogether dust={dust} songId={exportContext?.songId} apiBase={exportContext?.apiBase || ""} controls={sessionControls} audioUri={exportContext?.audioUrl || null} />}
      <footer>
        {dust.kind === "atlas" ? (
          <>
            <input type="text" aria-label="Direction note" placeholder="What changed and why" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
            <button type="button" className="hapa-btn" disabled={!dust.dirty || !validation?.ok || dust.saveState.state === "saving"} onClick={() => dust.save(note).then(() => setNote(""))}>
              {dust.saveState.state === "saving" ? "Saving…" : `Save direction r${(dust.saved?.revision || 0) + 1}`}
            </button>
            <button type="button" className="hapa-btn" disabled={!dust.dirty} onClick={dust.discard}>Discard edits</button>
          </>
        ) : <span className="score-dust-hint">Edits preview locally; saving needs an Audio Atlas run.</span>}
        {dust.saveState.message && <span role={dust.saveState.state === "error" ? "alert" : "status"}>{dust.saveState.message}</span>}
        {dust.ledger.length > 0 && <span className="score-dust-hint">{dust.ledger.length} saved revision{dust.ledger.length === 1 ? "" : "s"}; earlier ones are kept.</span>}
      </footer>
    </section>
  );
}
