import React, { useMemo } from "react";
import { inspectStoredShotDecision } from "../domain/shot-decision-inspector.js";

export default function ShotDecisionInspectorPanel({ shot, onReview }) {
  const inspector = useMemo(() => inspectStoredShotDecision(shot), [shot]);
  return <details data-testid="shot-decision-inspector" style={{ border: "1px solid rgba(80,227,255,.25)", padding: 7, background: "#06101b" }}>
    <summary style={{ cursor: "pointer", color: "#50e3ff", fontWeight: 700 }}>Why this shot? · {inspector.reviewStatus}</summary>
    <div style={{ marginTop: 6, fontSize: 9 }}>
      <div>Score: {inspector.selectedScore.utility ?? "unmeasured"} · confidence: {inspector.selectedScore.confidence ?? "unmeasured"} ({inspector.selectedScore.confidenceBasis})</div>
      <div>Cues: {inspector.cueEvidence.join(" · ") || "none stored"}</div>
      <div>Renderer: {inspector.rendererTruth.type || inspector.rendererTruth.status || "unknown"} · risks: {inspector.continuityRisks.join(", ") || "none stored"}</div>
      <div style={{ marginTop: 5 }}>{inspector.alternatives.slice(0, 3).map((row) => <button key={row.mediaId} type="button" title={JSON.stringify(row.components || row.rejectionReason)} onClick={() => onReview?.({ inspector, action: "replace", targetMediaId: row.mediaId, rationale: "Selected stored alternative from shot inspector." })} style={{ marginRight: 4 }}>{row.title || row.mediaId} · {row.utility ?? "?"}</button>)}</div>
      <div style={{ marginTop: 5 }}><button type="button" onClick={() => onReview?.({ inspector, action: "pin", targetMediaId: inspector.selectedMedia.id, rationale: "Pinned current stored selection from shot inspector." })}>Pin</button> <button type="button" onClick={() => onReview?.({ inspector, action: "ban", targetMediaId: inspector.selectedMedia.id, rationale: "Banned current stored selection from shot inspector." })}>Ban</button></div>
    </div>
  </details>;
}
