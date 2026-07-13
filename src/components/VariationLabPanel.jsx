import React, { useEffect, useMemo, useState } from "react";
import { createVariationLab, loadVariationLab, promoteVariation, regenerateVariationLab, saveVariationLab, setVariationLock } from "../domain/variation-lab.js";

const lockTargets = [
  { targetKind: "decision", targetId: "media-casting", label: "Media casting" },
  { targetKind: "truth", targetId: "cue-graph", label: "Cue timing" },
  { targetKind: "direction", targetId: "lyric-mode", label: "Lyric direction" },
];

export default function VariationLabPanel({ project, onPromote }) {
  const projectId = project?.song_id || "unknown-song";
  const base = useMemo(() => createVariationLab({ projectId, treatmentId: project?.director_v2?.treatmentId || `treatment:${projectId}`, cueGraphId: project?.director_v2?.cueGraphId || `cue:${projectId}` }), [projectId, project?.director_v2?.treatmentId, project?.director_v2?.cueGraphId]);
  const [lab, setLab] = useState(() => typeof localStorage === "undefined" ? base : loadVariationLab(localStorage, projectId) || base);
  useEffect(() => {
    const saved = typeof localStorage === "undefined" ? null : loadVariationLab(localStorage, projectId);
    setLab(saved ? regenerateVariationLab(saved, base) : base);
  }, [projectId, base]);
  useEffect(() => { if (typeof localStorage !== "undefined") saveVariationLab(localStorage, lab); }, [lab]);
  const isLocked = (target) => lab.locks.some((row) => row.targetKind === target.targetKind && row.targetId === target.targetId);
  const toggleLock = (target) => setLab((current) => isLocked(target)
    ? { ...current, locks: current.locks.filter((row) => !(row.targetKind === target.targetKind && row.targetId === target.targetId)) }
    : setVariationLock(current, { ...target, value: "locked" }));
  const previewMedia = project?.timeline?.filter((shot) => shot.media_thumbnail || shot.media_uri) || [];
  const promote = (variant) => {
    const next = promoteVariation(lab, variant.id, { operator: "Echo Variation Lab", promotedAt: new Date().toISOString() });
    setLab(next);
    onPromote?.(next.promoted);
  };
  return (
    <div data-testid="variation-lab" style={{ display: "flex", flexDirection: "column", gap: 10, height: 320, overflow: "auto", padding: 10, border: "1px solid rgba(157,116,255,.35)", background: "rgba(2,4,10,.92)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div><strong style={{ color: "var(--hapa-neon-violet)" }}>A/B/C Variation Lab</strong><div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>Cheap axes reroll; treatment, cue truth, semantic ranks, telemetry, and affordance analysis are reused (0 expensive decision runs).</div></div>
        <div style={{ fontSize: 9, color: "var(--hapa-neon-green)" }}>Locks persist locally + in promotion patch</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {lockTargets.map((target) => <button key={target.targetId} type="button" onClick={() => toggleLock(target)} style={{ fontSize: 9, padding: "4px 7px", color: isLocked(target) ? "#f6c96d" : "#94a3b8", border: `1px solid ${isLocked(target) ? "#f6c96d" : "#334155"}`, background: isLocked(target) ? "rgba(246,201,109,.12)" : "transparent" }}>{isLocked(target) ? "🔒" : "○"} {target.label}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
        {lab.variants.map((variant, index) => {
          const media = previewMedia[index % Math.max(1, previewMedia.length)] || {};
          const image = media.media_thumbnail || (/\.(png|jpe?g|webp)(?:$|\?)/i.test(media.media_uri || "") ? media.media_uri : "");
          return <div key={variant.id} style={{ border: lab.promoted?.winner.id === variant.id ? "1px solid #39ff14" : "1px solid #273449", padding: 7, background: "rgba(10,18,33,.75)" }}>
            <div style={{ height: 78, background: image ? `center/cover url("${image}")` : "radial-gradient(circle,#153044,#02040a 64%)", display: "grid", placeItems: "center", color: "#f8f3e7", fontSize: 22, fontWeight: 900 }}>{variant.label}</div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#fff" }}><strong>{variant.recipe}</strong> · {variant.previewRange.startSeconds}–{variant.previewRange.startSeconds + variant.previewRange.durationSeconds}s</div>
            <div style={{ fontSize: 8, color: "#94a3b8", lineHeight: 1.4, margin: "5px 0" }}>cut {variant.axes.cutScale} · viz {variant.axes.visualizerMix} · camera {variant.axes.cameraEnergy} · accent {variant.axes.accentDensity} · time {variant.axes.temporalModulation}</div>
            <button type="button" onClick={() => promote(variant)} style={{ width: "100%", fontSize: 9, padding: 4, border: "1px solid #9d74ff", color: "#d8c8ff", background: "rgba(157,116,255,.13)" }}>{lab.promoted?.winner.id === variant.id ? "✓ Promoted patch" : "Promote winner"}</button>
          </div>;
        })}
      </div>
      {lab.promoted && <div style={{ fontSize: 9, color: "#cbd5e1" }}>Winner lineage: {lab.promoted.patchHash.slice(0, 16)} · losers retain recipe/seed/receipt · formats: {lab.promoted.formatVariantInputs.supportedFormats.join(", ")}</div>}
    </div>
  );
}
