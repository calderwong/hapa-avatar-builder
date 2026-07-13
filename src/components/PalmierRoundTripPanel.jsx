import React from "react";

export default function PalmierRoundTripPanel({ project }) {
  const packet = project.palmier_roundtrip_packet || null;
  const branches = project.palmier_branch_candidates || [];
  const conflicts = project.palmier_roundtrip_conflicts || [];
  return <div data-testid="palmier-roundtrip-panel" style={{ height: 300, overflow: "auto", padding: 12, background: "#050913", border: "1px solid rgba(246,201,109,.35)", fontFamily: "monospace", fontSize: 9 }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ color: "#f6c96d" }}>PALMIER ROUND-TRIP</strong><span style={{ color: "#8ba2ba" }}>non-destructive child variants only</span></div>
    <p style={{ color: "#bdcad8" }}>{packet ? `${packet.project?.clip_count || 0} clips · ${packet.stems?.length || 0} stems · ${packet.captions?.length || 0} captions` : "No Palmier packet exported for this project yet."}</p>
    <div style={{ color: conflicts.length ? "#ff8a80" : "#5ee5a7" }}>Conflicts: {conflicts.length} · Branch candidates: {branches.length}</div>
    {branches.map((branch) => <div key={branch.id} style={{ marginTop: 8, padding: 8, border: "1px solid #30405a" }}><strong>{branch.id}</strong><div>{branch.approvalStatus} · parent {branch.parentVariantId}</div><div style={{ color: "#8ba2ba" }}>{branch.outputPath}</div></div>)}
  </div>;
}
