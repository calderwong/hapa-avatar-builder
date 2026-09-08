import { useEffect, useMemo, useRef, useState } from "react";
import { applyEchoLyricCorrection, inspectEchoLyricManualTiming } from "../domain/echo-lyric-timing-editor.js";
import { echoLyricBoundary } from "../domain/echo-lyric-time.js";

const buttonStyle = { border: "1px solid rgba(34,211,238,.4)", background: "#083047", color: "#cffafe", borderRadius: 5, padding: "7px 10px", fontSize: 13, cursor: "pointer" };
const inputStyle = { background: "#090d16", border: "1px solid #64748b", color: "#fff", borderRadius: 4, padding: "7px", fontSize: 14, maxWidth: "100%", boxSizing: "border-box" };
const rowStyle = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
const seconds = value => Number(value || 0).toFixed(3);

export default function EchoLyricTimingEditor({ project, currentTime = 0, analyserNode = null, disabled = false, onSeek, onPatch }) {
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
  const canvasRef = useRef(null);
  const lineIndex = Math.min(selectedLineIndex, Math.max(0, lines.length - 1));
  const selectedLine = lines[lineIndex] || null;
  const wordIndex = Math.min(selectedWordIndex, Math.max(0, (selectedLine?.words?.length || 1) - 1));
  const selectedWord = selectedLine?.words?.[wordIndex] || null;
  const state = project?.lyric_timing_manual_edit;
  const inspection = useMemo(() => inspectEchoLyricManualTiming(lines, duration), [duration, lines]);
  useEffect(() => { setTextDraft(selectedLine?.text || ""); }, [selectedLine?.text, lineIndex]);
  useEffect(() => { setSelectedLineIndex(0); setSelectedWordIndex(0); setError(""); }, [project?.song_id]);
  const commit = command => {
    if (disabled) return false;
    try {
      const patch = applyEchoLyricCorrection(project, { lineIndex, wordIndex, expectedRevision: state?.revision || 0, ...command });
      if (patch) onPatch?.(patch);
      setError(""); return true;
    } catch (failure) { setError(failure.message); return false; }
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
      frame = requestAnimationFrame(draw);
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
      <p style={{ margin: 0, color: "#94a3b8", lineHeight: 1.5 }}>Changes belong to this cut and persist when you save it. Editing preserves source evidence; it does not verify vocal alignment. Changed words use phrase timing until independently verified.</p>
      <div data-testid="echo-lyric-timing-validation">{inspection.ok ? `${inspection.lineCount} lines · ${inspection.wordCount} words · valid intervals` : `${inspection.issues.length} interval issues to review`}</div>
      {error && <div role="alert" style={{ color: "#fca5a5" }}>{error}</div>}
      <div>
        <div style={{ color: "#94a3b8", marginBottom: 5 }}>Live audio signal · this is not a song-time waveform</div>
        <canvas ref={canvasRef} data-testid="echo-lyric-waveform" aria-label="Live audio signal" style={{ width: "100%", height: 42, display: "block" }} />
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
