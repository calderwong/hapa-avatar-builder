import React from "react";
import { activeTasteEvidence, createTasteMemory, setTasteEvidenceEnabled } from "../domain/human-taste-memory.js";

export default function TasteMemoryPanel({ memory, onChange }) {
  const state = memory?.schemaVersion ? memory : createTasteMemory();
  const evidence = state.events.filter((row) => row.status === "active");
  const isActive = (event) => activeTasteEvidence(state, { [event.scope]: event.scopeId }).some((row) => row.id === event.id);
  return <details data-testid="taste-memory-panel" style={{ marginTop: 8, border: "1px solid rgba(157,116,255,.3)", padding: 7, fontSize: 9 }}>
    <summary style={{ cursor: "pointer", color: "#c8a8ff" }}>Local taste memory · {evidence.length} evidence events · transparent priors only</summary>
    {evidence.slice(-8).reverse().map((event) => <div key={event.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "4px 0", borderTop: "1px solid #202a3a" }}><span>{event.scope}:{event.scopeId} · {event.action} · {event.feature}</span><button type="button" onClick={() => onChange?.(setTasteEvidenceEnabled(state, event.id, !isActive(event), { operator: "local-human" }))}>{isActive(event) ? "Disable" : "Enable"}</button></div>)}
  </details>;
}
