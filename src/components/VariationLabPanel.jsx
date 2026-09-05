import React, { useEffect, useMemo, useState } from "react";
import { createVariationLab, loadVariationLab, saveVariationLab, setVariationLock } from "../domain/variation-lab.js";
import { NARRATIVE_VARIANT_RECIPES } from "../domain/echo-director-recipes.js";
import { createEchoNarrativeRecut } from "../domain/echo-narrative-recut.js";

const lockTargets = [
  { targetKind: "decision", targetId: "media-casting", label: "Keep current media" },
];
const editSignature = project => JSON.stringify([project.song_id, project.active_direction_script_variant?.id, project.timeline, project.visualizer_timeline, project.persistent_shader_slots, project.timed_lyrics, project.output_profile, project.director_show_graph_patches, project.mediaConstraints]);

export default function VariationLabPanel({ project, currentTime = 0, onCandidate, disabled = false }) {
  const projectId = project?.song_id || "unknown-song";
  const parentCutId = project?.active_direction_script_variant?.id || "legacy";
  const base = useMemo(() => createVariationLab({ projectId }), [projectId]);
  const [lab, setLab] = useState(base);
  const [recipeId, setRecipeId] = useState("letter-intimate");
  const [seed, setSeed] = useState("take-1");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.min(15, Number(project?.duration) || 15));
  const [candidates, setCandidates] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(null);
  const [allowedSignatures, setAllowedSignatures] = useState([]);
  useEffect(() => {
    setLab(typeof localStorage === "undefined" ? base : loadVariationLab(localStorage, projectId) || base);
    setCandidates([]); setChosen(null); setError(""); setStart(0); setEnd(Math.min(15, Number(project?.duration) || 15));
  }, [projectId, parentCutId, base]);
  useEffect(() => { if (typeof localStorage !== "undefined" && lab.projectId === projectId) saveVariationLab(localStorage, lab); }, [lab, projectId]);
  const isLocked = (target) => lab.locks.some(row => row.targetKind === target.targetKind && row.targetId === target.targetId);
  const toggleLock = (target) => setLab(current => isLocked(target)
    ? { ...current, locks: current.locks.filter(row => row.targetId !== target.targetId) }
    : setVariationLock(current, { ...target, value: "locked" }));
  const generate = () => {
    setError("");
    try {
      const started = performance.now();
      const snapshot = structuredClone(project);
      // Every candidate starts from the same current cut and song range.
      const next = ["A", "B", "C"].map(label => ({ label, ...createEchoNarrativeRecut({ project: snapshot, recipeId, seed: `${seed}:${label}`, range: { startSeconds: Number(start), endSeconds: Number(end) }, locks: lab.locks }) }));
      setAllowedSignatures([editSignature(snapshot), ...next.map(candidate => editSignature(candidate.project))]);
      setCandidates(next); setChosen(null); setElapsed(performance.now() - started);
    } catch (failure) { setCandidates([]); setError(failure.message); }
  };
  const choose = (candidate) => {
    if (disabled) return;
    try {
      if (!allowedSignatures.includes(editSignature(project))) throw new Error("The current cut changed. Generate fresh candidates to preserve those edits.");
      onCandidate?.(candidate.project, candidate.receipt); setChosen(candidate.label); setError("");
    }
    catch (failure) { setError(failure.message); }
  };
  const buttonStyle = { padding: "6px 9px", border: "1px solid #64748b", borderRadius: 4, background: "#111827", color: "#e2e8f0" };
  return <section data-testid="variation-lab" aria-label="Quick director cuts" style={{ display: "grid", gap: 12, padding: 12, border: "1px solid #655091", background: "#080d19", color: "#e2e8f0" }}>
    <div><strong>Quick director cuts</strong><p style={{ margin: "5px 0", fontSize: 12 }}>Create three alternatives from this cut. Compare them in the main player, then choose Save as new cut to keep your favorite.</p>
      <small>Reuses current footage without new analysis or model calls. Timing and lyrics stay fixed; partial boundary shots stay unchanged.</small></div>
    {disabled && <p role="status" style={{ margin: 0 }}>Select a saved direction cut and finish any pending save to use quick recuts.</p>}
    <fieldset disabled={disabled} style={{ display: "flex", flexWrap: "wrap", gap: 10, border: 0, padding: 0 }}>
      <label>Recipe <select aria-label="Director recipe" value={recipeId} onChange={event => setRecipeId(event.target.value)}>{Object.values(NARRATIVE_VARIANT_RECIPES).map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.label}</option>)}</select></label>
      <label>Seed <input aria-label="Cut seed" value={seed} maxLength={128} onChange={event => setSeed(event.target.value)} style={{ width: 100 }} /></label>
      <label>From (s) <input aria-label="Recut start seconds" type="number" min="0" step="0.1" value={start} onChange={event => setStart(event.target.value)} style={{ width: 80 }} /></label>
      <label>To (s) <input aria-label="Recut end seconds" type="number" min="0" step="0.1" max={project?.duration} value={end} onChange={event => setEnd(event.target.value)} style={{ width: 80 }} /></label>
      <button type="button" style={buttonStyle} onClick={() => { setStart(Math.floor(currentTime * 10) / 10); setEnd(Math.min(Number(project.duration), Math.floor(currentTime * 10) / 10 + 15)); }}>Use playhead</button>
      <button type="button" style={buttonStyle} onClick={() => { setStart(0); setEnd(Number(project.duration)); }}>Whole song</button>
      {lockTargets.map(target => <button type="button" key={target.targetId} aria-pressed={isLocked(target)} style={buttonStyle} onClick={() => toggleLock(target)}>{isLocked(target) ? "Locked: " : "Lock: "}{target.label}</button>)}
      <button type="button" style={buttonStyle} onClick={generate}>Generate A/B/C</button>
    </fieldset>
    {error && <p role="alert" style={{ margin: 0, color: "#fca5a5" }}>{error}</p>}
    {candidates.length > 0 && <>
      <small>Generated in {Math.round(elapsed)} ms. A/B/C cover the same range: {candidates[0].receipt.range.startSeconds}–{candidates[0].receipt.range.endSeconds}s. The playhead stays under your control.</small>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>{candidates.map(candidate => {
        const limitations = [...new Set(candidate.receipt.decisions.flatMap(decision => decision.limitations))];
        return <div key={candidate.label} style={{ border: `1px solid ${chosen === candidate.label ? "#6ee7b7" : "#475569"}`, padding: 9 }}>
          <strong>Cut {candidate.label}</strong><p style={{ fontSize: 12 }}>{candidate.receipt.changedShotIndices.length} shots updated</p>
          <button type="button" style={buttonStyle} disabled={disabled} aria-pressed={chosen === candidate.label} onClick={() => choose(candidate)}>{chosen === candidate.label ? "In player" : `Review ${candidate.label} in player`}</button>
          {limitations.length > 0 && <details style={{ fontSize: 11, marginTop: 8 }}><summary>Selection limitations</summary><ul>{limitations.map(item => <li key={item}>{item.replaceAll("-", " ")}</li>)}</ul></details>}
        </div>;
      })}</div>
      {chosen && <p role="status" style={{ fontSize: 12, margin: 0 }}>Cut {chosen} is the current working draft. Choose Save as new cut to keep it, or Cancel working cut to restore its source.</p>}
    </>}
  </section>;
}
