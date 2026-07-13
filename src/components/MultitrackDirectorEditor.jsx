import React, { useEffect, useMemo, useState } from "react";
import { applyMultitrackOperation, buildMultitrackProjection, projectToEditorGraph, replayMultitrackPatches } from "../domain/multitrack-editor.js";

export default function MultitrackDirectorEditor({ project, showGraph, onPatch }) {
  const initial = useMemo(() => showGraph ? replayMultitrackPatches(showGraph, project?.director_show_graph_patches || []) : projectToEditorGraph(project), [showGraph, project]);
  const [graph, setGraph] = useState(initial);
  const [selected, setSelected] = useState(null);
  const projection = useMemo(() => buildMultitrackProjection(graph), [graph]);
  useEffect(() => { setGraph(initial); setSelected(null); }, [initial]);
  const apply = (kind, values = {}) => {
    if (!selected?.id || !graph.tracks.some((track) => track.cards.some((card) => card.id === selected.id))) return;
    const result = applyMultitrackOperation(graph, { id: `ui:${kind}:${selected.id}`, kind, cardId: selected.id, ...values });
    setGraph(result.graph);
    onPatch?.(result.patch);
  };
  return (
    <div data-testid="multitrack-director-editor" style={{ height: 340, overflow: "auto", padding: 8, background: "#02040a", border: "1px solid rgba(0,243,255,.25)", fontFamily: "monospace" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 9 }}><strong style={{ color: "#00f3ff" }}>MULTITRACK DIRECTOR</strong><span style={{ color: "#94a3b8" }}>All controls emit show-graph patches + precise dirty ranges</span></div>
      {projection.lanes.map((lane) => <div key={lane.id} style={{ display: "grid", gridTemplateColumns: "116px 1fr", minHeight: 32, borderTop: "1px solid #172033" }}>
        <div style={{ padding: "7px 6px", color: "#cbd5e1", fontSize: 9 }}>{lane.label}<div style={{ color: "#64748b", fontSize: 8 }}>{lane.kind}</div></div>
        <div style={{ position: "relative", minHeight: 32, background: "linear-gradient(90deg,#0b1324 1px,transparent 1px)", backgroundSize: `${100 / 12}% 100%` }}>
          {lane.items.map((item) => <button key={item.id} type="button" onClick={() => setSelected({ ...item, laneId: lane.id })} title={`${item.label} · ${item.readiness} · ${JSON.stringify(item.rendererSupport)}`} style={{ position: "absolute", left: `${Math.max(0, item.startSeconds) / projection.durationSeconds * 100}%`, width: `${Math.max(.5, (item.endSeconds - item.startSeconds) / projection.durationSeconds * 100)}%`, top: 4, height: 24, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", padding: "2px 4px", textAlign: "left", fontSize: 8, color: item.knockedOut ? "#64748b" : "#f8f3e7", background: item.knockedOut ? "#111827" : lane.kind === "visualizer" ? "#56205f" : lane.kind === "media" ? "#163b53" : lane.kind === "effects" ? "#5b2a23" : "#273449", border: selected?.id === item.id ? "1px solid #f6c96d" : "1px solid #475569" }}>{item.label}<span style={{ opacity: .65 }}> · {item.readiness}</span></button>)}
        </div>
      </div>)}
      {selected && <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 5, alignItems: "center", padding: 7, background: "#08101eee", borderTop: "1px solid #9d74ff", fontSize: 8 }}>
        <strong style={{ color: "#f6c96d", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" }}>{selected.label}</strong>
        <span style={{ color: "#94a3b8" }}>ready: {selected.readiness} · renderer: {typeof selected.rendererSupport === "string" ? selected.rendererSupport : "inspectable"}</span>
        <button type="button" onClick={() => apply("knock-card", { knockedOut: !selected.knockedOut })}>Knock</button>
        <button type="button" onClick={() => apply("set-opacity", { opacity: Math.max(0, Number(selected.opacity ?? 1) - .1) })}>Opacity −</button>
        <button type="button" onClick={() => apply("set-blend", { blendMode: selected.blendMode === "screen" ? "plus-lighter" : "screen" })}>Blend</button>
        <button type="button" onClick={() => apply("set-stem-map", { stemMap: ["master:rms"] })}>Stem → master</button>
        <button type="button" onClick={() => apply("set-camera", { motion: "roi-push", intensity: 1.1 })}>ROI camera</button>
      </div>}
    </div>
  );
}
