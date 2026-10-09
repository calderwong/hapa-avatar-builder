import { useEffect, useMemo, useRef, useState } from "react";
import { applyEchoLyricCorrection, inspectEchoLyricManualTiming, summarizeEchoLyricOnsetReview } from "../domain/echo-lyric-timing-editor.js";
import { readEchoPlaybackWaveform } from "../domain/echo-audio-playback.js";
import { echoLyricBoundary } from "../domain/echo-lyric-time.js";
import { assessEchoLyricPrecision } from "../domain/echo-lyric-precision.js";

const buttonStyle = { border: "1px solid rgba(34,211,238,.4)", background: "#083047", color: "#cffafe", borderRadius: 5, padding: "7px 10px", fontSize: 13, cursor: "pointer" };
const inputStyle = { background: "#090d16", border: "1px solid #64748b", color: "#fff", borderRadius: 4, padding: "7px", fontSize: 14, maxWidth: "100%", boxSizing: "border-box" };
const rowStyle = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
const seconds = value => Number(value || 0).toFixed(3);

export default function EchoLyricTimingEditor({ project, currentTime = 0, analyserNode = null, playbackAudioUrl = "", playbackAudioReceipt = null, disabled = false, onSeek, onPatch }) {
  const duration = Math.max(.001, Number(project?.duration || 0));
  const lines = Array.isArray(project?.timed_lyrics) ? project.timed_lyrics : [];
  const [selectedLineIndex, setSelectedLineIndex] = useState(0);
  const [selectedWordIndex, setSelectedWordIndex] = useState(0);
  const [globalOffsetMs, setGlobalOffsetMs] = useState(0);
  const [textDraft, setTextDraft] = useState("");
  const [splitAt, setSplitAt] = useState("");
  const [splitLeft, setSplitLeft] = useState("");
  const [splitRight, setSplitRight] = useState("");
  const [error, setError] = useState("");
  const [correctionNotice, setCorrectionNotice] = useState("");
  const canvasRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const [waveform, setWaveform] = useState(null);
  const [waveformStatus, setWaveformStatus] = useState("");
  const [waveformZoom, setWaveformZoom] = useState("word");
  const [waveformPage, setWaveformPage] = useState(0);
  const [waveformRetry, setWaveformRetry] = useState(0);
  const [referenceTime, setReferenceTime] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [ambiguityMs, setAmbiguityMs] = useState(25);
  const lineIndex = Math.min(selectedLineIndex, Math.max(0, lines.length - 1));
  const selectedLine = lines[lineIndex] || null;
  const wordIndex = Math.min(selectedWordIndex, Math.max(0, (selectedLine?.words?.length || 1) - 1));
  const selectedWord = selectedLine?.words?.[wordIndex] || null;
  const state = project?.lyric_timing_manual_edit;
  const focus = waveformZoom === "word" && selectedWord ? selectedWord : selectedLine;
  const windowSize = Math.min(8, 4 * 1024 ** 2 / ((playbackAudioReceipt?.sampleRate || 48000) * (playbackAudioReceipt?.channels || 2) * 4));
  const windowStart = Math.max(0, echoLyricBoundary(focus, "start") - .5) + waveformPage * windowSize;
  const windowEnd = Math.min(duration, echoLyricBoundary(focus, "end") + .5, windowStart + windowSize);
  const waveformKey = JSON.stringify([playbackAudioUrl, playbackAudioReceipt?.sourceHash, playbackAudioReceipt?.pcmSha256, windowStart, windowEnd, waveformRetry]);
  const currentWaveform = waveform?.key === waveformKey ? waveform : null;
  const onsetReview = useMemo(() => summarizeEchoLyricOnsetReview(project, playbackAudioReceipt?.sourceHash), [project, playbackAudioReceipt?.sourceHash]);
  const precision = useMemo(() => assessEchoLyricPrecision(project), [project]);
  useEffect(() => { setWaveformPage(0); setReferenceTime(""); }, [lineIndex, wordIndex, waveformZoom, project?.song_id]);
  useEffect(() => {
    setWaveform(null);
    if (!playbackAudioUrl || !playbackAudioReceipt || !focus) { setWaveformStatus("Prepare playback audio to review its waveform."); return undefined; }
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setWaveformStatus("Loading source waveform…");
    readEchoPlaybackWaveform({ url: playbackAudioUrl, receipt: playbackAudioReceipt, startSeconds: windowStart, endSeconds: windowEnd, signal: controller.signal })
      .then(result => { if (active) { setWaveform({ ...result, key: waveformKey }); setWaveformStatus(""); } })
      .catch(failure => { if (active) setWaveformStatus(controller.signal.aborted ? "Waveform request timed out. Retry when playback audio is ready." : failure.message); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [waveformKey]);
  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || !currentWaveform) return undefined;
    const draw = () => {
      const width = Math.max(1, canvas.clientWidth), height = 100;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * scale); canvas.height = height * scale;
      const context = canvas.getContext("2d"); context.scale(scale, scale);
      context.fillStyle = "#0f172a"; context.fillRect(0, 0, width, height);
      context.strokeStyle = "#67e8f9"; context.beginPath();
      for (const [index, peak] of currentWaveform.peaks.entries()) {
        const x = (index + .5) / currentWaveform.peaks.length * width;
        context.moveTo(x, (1 - Math.max(-1, Math.min(1, peak.maximum))) * height / 2);
        context.lineTo(x, (1 - Math.max(-1, Math.min(1, peak.minimum))) * height / 2);
      }
      context.stroke();
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas);
    return () => observer.disconnect();
  }, [currentWaveform]);
  const seekReference = value => { const time = Number(value); if (Number.isFinite(time)) { setReferenceTime(seconds(time)); onSeek?.(time); } };
  const downloadReview = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(onsetReview, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "echo-lyric-onset-review.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const inspection = useMemo(() => inspectEchoLyricManualTiming(lines, duration), [duration, lines]);
  useEffect(() => { setTextDraft(selectedLine?.text || ""); }, [selectedLine?.text, lineIndex]);
  useEffect(() => { setSelectedLineIndex(0); setSelectedWordIndex(0); setError(""); }, [project?.song_id]);
  const commit = command => {
    if (disabled) return false;
    try {
      const patch = applyEchoLyricCorrection(project, { lineIndex, wordIndex, expectedRevision: state?.revision || 0, ...command });
      if (patch) onPatch?.(patch);
      const offsetAction = ["shift-word", "shift-line", "global-offset"].includes(command.type);
      if (offsetAction) {
        const before = command.type === "shift-word" ? selectedWord : command.type === "global-offset" ? lines[0] : selectedLine;
        const after = command.type === "shift-word" ? patch?.timed_lyrics?.[lineIndex]?.words?.[wordIndex] : patch?.timed_lyrics?.[command.type === "global-offset" ? 0 : lineIndex];
        const applied = after ? (echoLyricBoundary(after, "start") - echoLyricBoundary(before, "start")) * 1000 : 0;
        const requested = Number(command.deltaSeconds) * 1000;
        setCorrectionNotice(Math.abs(applied - requested) > .01 ? `Moved ${applied.toFixed(0)} ms of the requested ${requested.toFixed(0)} ms; stopped at a neighboring cue or song boundary.` : `Moved ${applied.toFixed(0)} ms.`);
      } else setCorrectionNotice("");
      setError(""); return true;
    } catch (failure) { setCorrectionNotice(""); setError(failure.message); return false; }
  };
  const chooseLine = index => { setSelectedLineIndex(index); setSelectedWordIndex(0); setError(""); onSeek?.(echoLyricBoundary(lines[index], "start")); };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    let frame = 0;
    const data = analyserNode ? new Uint8Array(analyserNode.fftSize || 2048) : null;
    const draw = () => {
      const width = canvas.clientWidth || 800;
      const height = canvas.clientHeight || 56;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#020617";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgba(34,211,238,.72)";
      context.lineWidth = 1.25;
      context.beginPath();
      if (data && typeof analyserNode.getByteTimeDomainData === "function") {
        analyserNode.getByteTimeDomainData(data);
        for (let index = 0; index < data.length; index += 1) {
          const x = index / Math.max(1, data.length - 1) * width;
          const y = data[index] / 255 * height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
      } else {
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
      }
      context.stroke();
      if (data) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyserNode]);


  return (
    <section data-testid="echo-lyric-timing-editor" aria-label="Lyric timing review" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 14, border: "1px solid #155e75", borderRadius: 6, background: "#020617", color: "#e2e8f0", fontSize: 14 }}>
      <div style={{ ...rowStyle, justifyContent: "space-between" }}>
        <strong style={{ color: "#67e8f9", fontSize: 16 }}>Lyric timing review</strong>
        <button type="button" style={buttonStyle} disabled={disabled || !state?.undo?.length} onClick={() => commit({ type: "undo" })}>Undo lyric correction</button>
      </div>
      <p style={{ margin: 0, color: "#94a3b8", lineHeight: 1.5 }}>Changes belong to this cut and persist when you save it. Editing preserves source evidence; it does not verify vocal alignment. Changed words animate on your corrected timing and stay marked unverified until independently checked.</p>
      <div data-testid="echo-lyric-precision" style={{ display: "grid", gap: 5, padding: 10, border: `1px solid ${precision.exactSyllableReady ? "#22c55e" : "#a16207"}`, borderRadius: 5, background: precision.exactSyllableReady ? "rgba(20,83,45,.2)" : "rgba(113,63,18,.18)" }}>
        <strong>{precision.label} · animation: {precision.animationUnit}</strong>
        <span>{precision.counts.matchedWords}/{precision.counts.words} words have direct STT anchors · {precision.counts.trustworthySyllables}/{precision.counts.syllables} syllables have explicit acoustic/review evidence</span>
        <span>{precision.beatMappingReady ? `${precision.beatCount} measured beats available for bar/beat/subdivision labels.` : "Count mapping unavailable until a measured beat grid and reviewed syllable onsets both exist."}</span>
        {!precision.exactSyllableReady && <span style={{ color: "#fbbf24" }}>Not syllable-exact. Existing cue times remain useful as candidates, but must not drive exact mouth/phoneme animation.</span>}
      </div>
      <div data-testid="echo-lyric-timing-validation">{inspection.ok ? `${inspection.lineCount} lines · ${inspection.wordCount} words · valid intervals` : `${inspection.issues.length} interval issues to review`}</div>
      {correctionNotice && <div role="status" data-testid="echo-lyric-correction-notice">{correctionNotice}</div>}
      {error && <div role="alert" style={{ color: "#fca5a5" }}>{error}</div>}
      <div>
        <div style={{ color: "#94a3b8", marginBottom: 5 }}>Live audio signal · this is not a song-time waveform</div>
        <canvas ref={canvasRef} data-testid="echo-lyric-waveform" aria-label="Live audio signal" style={{ width: "100%", height: 42, display: "block" }} />
      </div>
      <div aria-label="Source waveform review" style={{ display: "grid", gap: 8 }}>
        <div style={rowStyle}>
          <strong>Source waveform · prepared master</strong>
          <label>Zoom <select aria-label="Waveform zoom" style={inputStyle} value={waveformZoom} onChange={event => setWaveformZoom(event.target.value)}><option value="word">Selected word</option><option value="phrase">Selected phrase</option></select></label>
          <button type="button" style={buttonStyle} disabled={!waveformPage} onClick={() => setWaveformPage(page => page - 1)}>Previous waveform window</button>
          <button type="button" style={buttonStyle} disabled={windowEnd >= Math.min(duration, echoLyricBoundary(focus, "end") + .5)} onClick={() => setWaveformPage(page => page + 1)}>Next waveform window</button>
        </div>
        {waveformStatus && <div style={rowStyle}><span role="status">{waveformStatus}</span><button type="button" style={buttonStyle} disabled={!playbackAudioUrl || waveformStatus.startsWith("Loading")} onClick={() => setWaveformRetry(value => value + 1)}>Retry waveform</button></div>}
        {currentWaveform && <>
          <div style={{ position: "relative", overflow: "hidden" }}>
            <canvas ref={sourceCanvasRef} aria-label="Prepared master waveform; use the seek slider below" data-testid="echo-source-waveform" style={{ width: "100%", height: 100, display: "block", cursor: "crosshair" }} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); seekReference(currentWaveform.startSeconds + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (currentWaveform.endSeconds - currentWaveform.startSeconds)); }} />
            {(selectedLine?.words || []).map((word, index) => <div key={index} title={word.word || word.text} style={{ position: "absolute", top: 0, bottom: 0, borderLeft: `1px solid ${index === wordIndex ? "#f0abfc" : "#94a3b8"}`, left: `${(echoLyricBoundary(word, "start") - currentWaveform.startSeconds) / (currentWaveform.endSeconds - currentWaveform.startSeconds) * 100}%`, pointerEvents: "none" }} />)}
            <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: "#facc15", left: `${(currentTime - currentWaveform.startSeconds) / (currentWaveform.endSeconds - currentWaveform.startSeconds) * 100}%`, pointerEvents: "none" }} />
          </div>
          <label>Seek waveform · {seconds(currentWaveform.startSeconds)}–{seconds(currentWaveform.endSeconds)} s
            <input aria-label="Seek source waveform" type="range" min={currentWaveform.startSeconds} max={currentWaveform.endSeconds} step=".001" value={Math.max(currentWaveform.startSeconds, Math.min(currentWaveform.endSeconds, currentTime))} onChange={event => seekReference(event.target.value)} style={{ width: "100%" }} />
          </label>
          <span style={{ color: "#94a3b8" }}>All playback channels · {(currentWaveform.peakResolutionSeconds * 1000).toFixed(1)} ms per peak · word-start markers are existing timing, not detected vocals.{currentWaveform.limited ? " Display limited by the waveform byte budget." : ""}</span>
        </>}
        {selectedWord && <details><summary>Record a vocal-onset reference for “{selectedWord.word || selectedWord.text}”</summary>
          <p>Listen and choose the vocal onset. This records your observation without changing timing or alignment confidence.</p>
          <div style={rowStyle}>
            <label>Annotator<input aria-label="Onset annotator" value={reviewer} onChange={event => setReviewer(event.target.value)} style={{ ...inputStyle, display: "block", width: 180 }} /></label>
            <label>Reference onset (seconds)<input aria-label="Reference onset seconds" type="number" min="0" max={duration} step=".001" value={referenceTime} onChange={event => setReferenceTime(event.target.value)} style={{ ...inputStyle, display: "block", width: 170 }} /></label>
            <button type="button" style={buttonStyle} onClick={() => setReferenceTime(seconds(currentTime))}>Use playhead as reference</button>
            <label>Uncertainty (ms)<input aria-label="Onset uncertainty milliseconds" type="number" min="0" max="1000" value={ambiguityMs} onChange={event => setAmbiguityMs(event.target.value)} style={{ ...inputStyle, display: "block", width: 130 }} /></label>
            <button type="button" style={buttonStyle} disabled={disabled || !currentWaveform || !reviewer.trim() || referenceTime === "" || ambiguityMs === ""} onClick={() => commit({ type: "reference-onset", atSeconds: referenceTime, ambiguityMs, reviewer, audioHash: currentWaveform.sourceHash })}>Record onset reference</button>
          </div>
        </details>}
        <div data-testid="echo-onset-review-summary">
          {onsetReview.referencedWords} / {onsetReview.wordCount} words referenced
          {onsetReview.referencedWords > 0 && <> · imported median / p95: {onsetReview.importedCandidate.medianMs == null ? "unknown" : `${onsetReview.importedCandidate.medianMs.toFixed(1)} / ${onsetReview.importedCandidate.p95Ms.toFixed(1)} ms`} · corrected median / p95: {onsetReview.corrected.medianMs.toFixed(1)} / {onsetReview.corrected.p95Ms.toFixed(1)} ms · declared uncertainty up to {onsetReview.maximumDeclaredAmbiguityMs} ms</>}
          {onsetReview.rejected.length > 0 && <> · {onsetReview.rejected.length} stale or invalid references excluded</>}
        </div>
        <button type="button" style={{ ...buttonStyle, justifySelf: "start" }} disabled={!onsetReview.referencedWords} onClick={downloadReview}>Download onset review</button>
      </div>
      <div aria-label="Lyric phrase timeline" style={{ position: "relative", height: 32, background: "#0f172a", border: "1px solid #475569" }}>
        {lines.map((line, index) => <button key={index} type="button" aria-label={`Seek line ${index + 1}: ${line.text}`} title={`${seconds(echoLyricBoundary(line, "start"))}–${seconds(echoLyricBoundary(line, "end"))} ${line.text}`}
          onClick={() => chooseLine(index)} style={{ position: "absolute", left: `${echoLyricBoundary(line, "start") / duration * 100}%`, width: `${Math.max(.25, (echoLyricBoundary(line, "end") - echoLyricBoundary(line, "start")) / duration * 100)}%`, top: 3, bottom: 3, padding: 0, background: index === lineIndex ? "#a21caf" : "#155e75", border: "1px solid #67e8f9" }} />)}
        <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, currentTime / duration * 100))}%`, top: 0, bottom: 0, width: 2, background: "#facc15", pointerEvents: "none" }} />
      </div>
      {selectedLine ? <>
        <label style={{ display: "grid", gap: 5 }}>Selected lyric line
          <select aria-label="Selected lyric line" value={lineIndex} onChange={event => chooseLine(Number(event.target.value))} style={inputStyle}>
            {lines.map((line, index) => <option key={index} value={index}>{index + 1}. {line.text}</option>)}
          </select>
        </label>
        <div style={rowStyle}>
          <button type="button" disabled={disabled} style={buttonStyle} aria-pressed={selectedLine.manualTimingLocked === true} onClick={() => commit({ type: "lock-line", locked: !selectedLine.manualTimingLocked })}>{selectedLine.manualTimingLocked ? "Unlock line" : "Lock line"}</button>
          <button type="button" style={buttonStyle} onClick={() => onSeek?.(echoLyricBoundary(selectedLine, "start"))}>Seek line</button>
          <span>Line nudge</span>
          {[-.25, -.05, .05, .25].map(delta => <button key={delta} type="button" disabled={disabled} aria-label={`Nudge line ${delta * 1000} milliseconds`} onClick={() => commit({ type: "shift-line", deltaSeconds: delta })} style={buttonStyle}>{delta > 0 ? "+" : ""}{delta * 1000} ms</button>)}
        </div>
        <div style={rowStyle}>
          {["start", "end"].map(boundary => <label key={boundary}>Line {boundary} (seconds)<input aria-label={`Line ${boundary} seconds`} type="number" step=".001" value={seconds(echoLyricBoundary(selectedLine, boundary))} disabled={disabled} onChange={event => commit({ type: "line-boundary", boundary, value: event.target.value })} style={{ ...inputStyle, display: "block", width: 125 }} /></label>)}
          <label>Whole-song offset (ms)<input aria-label="Whole-song lyric offset milliseconds" data-testid="echo-lyric-global-offset" type="number" step="10" value={globalOffsetMs} disabled={disabled} onChange={event => setGlobalOffsetMs(event.target.value)} style={{ ...inputStyle, display: "block", width: 140 }} /></label>
          <button type="button" disabled={disabled || !Number(globalOffsetMs)} onClick={() => { if (commit({ type: "global-offset", deltaSeconds: Number(globalOffsetMs) / 1000 })) setGlobalOffsetMs(0); }} style={buttonStyle}>Apply offset</button>
        </div>
        <label style={{ display: "grid", gap: 5 }}>Correct line text (clears obsolete word alignment)
          <input data-testid="echo-lyric-line-text" value={textDraft} disabled={disabled} onChange={event => setTextDraft(event.target.value)} style={inputStyle} />
        </label>
        <button type="button" disabled={disabled || textDraft === selectedLine.text} onClick={() => commit({ type: "line-text", text: textDraft })} style={{ ...buttonStyle, alignSelf: "start" }}>Apply text correction</button>
        {!!selectedLine.words?.length && <label style={{ display: "grid", gap: 5 }}>Selected word
          <select aria-label="Selected lyric word" value={wordIndex} style={inputStyle} onChange={event => { const index = Number(event.target.value); setSelectedWordIndex(index); onSeek?.(echoLyricBoundary(selectedLine.words[index], "start")); }}>
            {selectedLine.words.map((word, index) => <option key={index} value={index}>{index + 1}. {word.word || word.text} · {seconds(echoLyricBoundary(word, "start"))}–{seconds(echoLyricBoundary(word, "end"))}s{word.manualTimingLocked ? " · locked" : ""}</option>)}
          </select>
        </label>}
        {selectedWord && <>
          <div style={rowStyle}>
            <button type="button" disabled={disabled} style={buttonStyle} aria-pressed={selectedWord.manualTimingLocked === true} onClick={() => commit({ type: "lock-word", locked: !selectedWord.manualTimingLocked })}>{selectedWord.manualTimingLocked ? "Unlock word" : "Lock word"}</button>
            <span>Word nudge</span>
            {[-.05, .05].map(delta => <button key={delta} type="button" disabled={disabled} aria-label={`Nudge word ${delta * 1000} milliseconds`} onClick={() => commit({ type: "shift-word", deltaSeconds: delta })} style={buttonStyle}>{delta > 0 ? "+" : ""}{delta * 1000} ms</button>)}
            <button type="button" disabled={disabled || wordIndex >= selectedLine.words.length - 1} style={buttonStyle} onClick={() => commit({ type: "merge-word" })}>Merge with next word</button>
          </div>
          <details><summary>Split the selected word</summary>
            <div style={{ ...rowStyle, marginTop: 10 }}>
              <label>First word<input aria-label="First split word" value={splitLeft} disabled={disabled} onChange={event => setSplitLeft(event.target.value)} style={{ ...inputStyle, display: "block", width: 160 }} /></label>
              <label>Second word<input aria-label="Second split word" value={splitRight} disabled={disabled} onChange={event => setSplitRight(event.target.value)} style={{ ...inputStyle, display: "block", width: 160 }} /></label>
              <label>Split at (song seconds)<input aria-label="Word split song seconds" type="number" step=".001" value={splitAt} disabled={disabled} onChange={event => setSplitAt(event.target.value)} style={{ ...inputStyle, display: "block", width: 160 }} /></label>
              <button type="button" style={buttonStyle} onClick={() => setSplitAt(seconds(currentTime))}>Use playhead</button>
              <button type="button" disabled={disabled || splitAt === "" || !splitLeft.trim() || !splitRight.trim()} style={buttonStyle} onClick={() => commit({ type: "split-word", atSeconds: splitAt, left: splitLeft, right: splitRight })}>Split word</button>
            </div>
          </details>
          <div style={rowStyle}>
            <button type="button" disabled={disabled || wordIndex === 0} style={buttonStyle} onClick={() => commit({ type: "split-line", beforeWordIndex: wordIndex })}>Split line before selected word</button>
            <button type="button" disabled={disabled || lineIndex >= lines.length - 1} style={buttonStyle} onClick={() => commit({ type: "merge-line" })}>Merge with next line</button>
          </div>
        </>}
      </> : <p>No timed lyric cues are available for this cut.</p>}
      {!!state?.history?.length && <details><summary>Correction history · {state.history.length} actions · last {state.undo?.length || 0} edits undoable</summary>
        <ol>{state.history.slice(-12).map(entry => <li key={entry.id}>{entry.type} · line {entry.index + 1} · {entry.at}</li>)}</ol>
      </details>}
    </section>
  );
}
