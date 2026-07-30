import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyEchoLyricGlobalOffset,
  inspectEchoLyricManualTiming,
  setEchoLyricLineBoundary,
  shiftEchoLyricLine,
  shiftEchoLyricWord,
  updateEchoLyricLineText,
} from "../domain/echo-lyric-timing-editor.js";

const buttonStyle = {
  border: "1px solid rgba(34,211,238,.35)",
  background: "rgba(8,47,73,.34)",
  color: "#cffafe",
  borderRadius: 4,
  padding: "4px 7px",
  fontSize: 9,
  fontWeight: 700,
  cursor: "pointer",
};

function seconds(value) {
  return Number(value || 0).toFixed(3);
}

export default function EchoLyricTimingEditor({
  project,
  currentTime = 0,
  analyserNode = null,
  disabled = false,
  onSeek,
  onPatch,
}) {
  const duration = Math.max(0.001, Number(project?.duration || 0));
  const lines = Array.isArray(project?.timed_lyrics) ? project.timed_lyrics : [];
  const [selectedLineIndex, setSelectedLineIndex] = useState(0);
  const [selectedWordIndex, setSelectedWordIndex] = useState(0);
  const [globalOffsetMs, setGlobalOffsetMs] = useState(0);
  const canvasRef = useRef(null);
  const selectedLine = lines[Math.min(selectedLineIndex, Math.max(0, lines.length - 1))] || null;
  const selectedWord = selectedLine?.words?.[Math.min(selectedWordIndex, Math.max(0, (selectedLine.words?.length || 1) - 1))] || null;
  const inspection = useMemo(() => inspectEchoLyricManualTiming(lines, duration), [duration, lines]);

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

  const commit = (timedLyrics, action) => {
    const checked = inspectEchoLyricManualTiming(timedLyrics, duration);
    if (!checked.ok || disabled) return;
    onPatch?.({
      timed_lyrics: checked.lines,
      lyric_timing_manual_edit: {
        schemaVersion: "hapa.echo.lyric-manual-edit.v1",
        action,
        lineIndex: selectedLineIndex,
        wordIndex: selectedWordIndex,
        reviewedAt: new Date().toISOString(),
        issueCount: 0,
      },
      lyrics: {
        ...(project?.lyrics || {}),
        timingSource: "measured-manual-review",
        confidence: Math.max(0.9, Number(project?.lyrics?.confidence || 0)),
      },
    });
  };

  const nudgeLine = (delta) => commit(
    shiftEchoLyricLine(lines, selectedLineIndex, delta, duration),
    `shift-line:${delta}`,
  );
  const nudgeWord = (delta) => commit(
    shiftEchoLyricWord(lines, selectedLineIndex, selectedWordIndex, delta, duration),
    `shift-word:${delta}`,
  );

  return (
    <section
      data-testid="echo-lyric-timing-editor"
      style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 300, padding: 10, border: "1px solid rgba(34,211,238,.22)", borderRadius: 6, background: "rgba(2,6,23,.72)", color: "#e2e8f0" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <strong style={{ color: "#67e8f9", fontSize: 11 }}>LYRIC TIMING REVIEW</strong>
          <div style={{ color: "#94a3b8", fontSize: 9 }}>Real preview waveform · measured cue and word correction · changes stay in this Director cut</div>
        </div>
        <span data-testid="echo-lyric-timing-validation" style={{ color: inspection.ok ? "#86efac" : "#fca5a5", fontSize: 9, fontWeight: 700 }}>
          {inspection.ok ? `${inspection.lineCount} LINES · ${inspection.wordCount} WORDS · VALID` : `${inspection.issues.length} TIMING ISSUES`}
        </span>
      </div>

      <div style={{ position: "relative", height: 58, border: "1px solid rgba(148,163,184,.2)", borderRadius: 4, overflow: "hidden" }}>
        <canvas ref={canvasRef} data-testid="echo-lyric-waveform" aria-label="Live song waveform" style={{ width: "100%", height: "100%", display: "block" }} />
        <div style={{ position: "absolute", inset: 0 }}>
          {lines.map((line, index) => (
            <button
              key={`${line.start}-${index}`}
              type="button"
              title={`${seconds(line.start)}–${seconds(line.end)} ${line.text}`}
              onClick={() => { setSelectedLineIndex(index); setSelectedWordIndex(0); onSeek?.(line.start); }}
              style={{
                position: "absolute",
                left: `${Math.max(0, line.start / duration * 100)}%`,
                width: `${Math.max(.25, (line.end - line.start) / duration * 100)}%`,
                top: index === selectedLineIndex ? 3 : 36,
                height: index === selectedLineIndex ? 20 : 15,
                border: index === selectedLineIndex ? "1px solid #f0abfc" : "1px solid rgba(34,211,238,.45)",
                background: index === selectedLineIndex ? "rgba(192,38,211,.48)" : "rgba(8,145,178,.35)",
                padding: 0,
                cursor: "pointer",
              }}
            />
          ))}
          <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, currentTime / duration * 100))}%`, top: 0, bottom: 0, width: 1, background: "#facc15", pointerEvents: "none" }} />
        </div>
      </div>

      {selectedLine ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) auto auto", gap: 8, alignItems: "end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, color: "#94a3b8", fontSize: 9 }}>
              Selected lyric line
              <input
                data-testid="echo-lyric-line-text"
                value={selectedLine.text || ""}
                disabled={disabled}
                onChange={(event) => commit(updateEchoLyricLineText(lines, selectedLineIndex, event.target.value, duration), "edit-line-text")}
                style={{ background: "#090d16", border: "1px solid rgba(255,255,255,.16)", color: "#fff", borderRadius: 4, padding: "6px 8px", fontSize: 11 }}
              />
            </label>
            <label style={{ color: "#94a3b8", fontSize: 9 }}>Start
              <input
                type="number"
                step=".001"
                value={seconds(selectedLine.start)}
                disabled={disabled}
                onChange={(event) => commit(setEchoLyricLineBoundary(lines, selectedLineIndex, "start", event.target.value, duration), "set-line-start")}
                style={{ display: "block", width: 76, background: "#090d16", border: "1px solid rgba(255,255,255,.16)", color: "#fff", borderRadius: 4, padding: "5px" }}
              />
            </label>
            <label style={{ color: "#94a3b8", fontSize: 9 }}>End
              <input
                type="number"
                step=".001"
                value={seconds(selectedLine.end)}
                disabled={disabled}
                onChange={(event) => commit(setEchoLyricLineBoundary(lines, selectedLineIndex, "end", event.target.value, duration), "set-line-end")}
                style={{ display: "block", width: 76, background: "#090d16", border: "1px solid rgba(255,255,255,.16)", color: "#fff", borderRadius: 4, padding: "5px" }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#94a3b8", fontSize: 9 }}>LINE</span>
            {[-.25, -.05, .05, .25].map((delta) => <button key={delta} type="button" disabled={disabled} onClick={() => nudgeLine(delta)} style={buttonStyle}>{delta > 0 ? "+" : ""}{delta * 1000} ms</button>)}
            <button type="button" onClick={() => onSeek?.(selectedLine.start)} style={buttonStyle}>▶ Seek line</button>
            <span style={{ marginLeft: 8, color: "#94a3b8", fontSize: 9 }}>WHOLE SONG</span>
            <input data-testid="echo-lyric-global-offset" type="number" step="10" value={globalOffsetMs} onChange={(event) => setGlobalOffsetMs(Number(event.target.value || 0))} style={{ width: 68, background: "#090d16", border: "1px solid rgba(255,255,255,.16)", color: "#fff", borderRadius: 4, padding: "4px" }} />
            <button type="button" disabled={disabled || !globalOffsetMs} onClick={() => { commit(applyEchoLyricGlobalOffset(lines, globalOffsetMs / 1000, duration), `global-offset:${globalOffsetMs}`); setGlobalOffsetMs(0); }} style={buttonStyle}>Apply ms</button>
          </div>

          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#94a3b8", fontSize: 9 }}>WORD</span>
            {(selectedLine.words || []).map((word, index) => (
              <button
                key={`${word.word}-${index}`}
                type="button"
                onClick={() => { setSelectedWordIndex(index); onSeek?.(word.start); }}
                style={{ ...buttonStyle, borderColor: index === selectedWordIndex ? "#f0abfc" : buttonStyle.border.split(" ").at(-1), background: index === selectedWordIndex ? "rgba(192,38,211,.34)" : buttonStyle.background }}
              >
                {word.word}
              </button>
            ))}
            {selectedWord && [-.05, .05].map((delta) => <button key={delta} type="button" disabled={disabled} onClick={() => nudgeWord(delta)} style={buttonStyle}>{delta > 0 ? "+" : ""}{delta * 1000} ms</button>)}
          </div>
        </>
      ) : (
        <div style={{ color: "#94a3b8", fontSize: 10 }}>This cut has no lyric cues. Instrumental cuts keep Lyrics off.</div>
      )}
    </section>
  );
}

