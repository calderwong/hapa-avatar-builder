import React, { useEffect, useMemo, useState } from "react";
import { createVariationLab, loadVariationLab, saveVariationLab, setVariationLock } from "../domain/variation-lab.js";
import { NARRATIVE_VARIANT_RECIPES } from "../domain/echo-director-recipes.js";
import { createEchoNarrativeRecut, echoRecutIdentityOptions } from "../domain/echo-narrative-recut.js";

const lockTargets = [
  { targetKind: "decision", targetId: "media-casting", label: "Keep current media" },
  { targetKind: "decision", targetId: "camera", label: "Keep current camera" },
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
  const [changeAmount, setChangeAmount] = useState(1);
  const [characterId, setCharacterId] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [parentSnapshot, setParentSnapshot] = useState(null);
  const identities = useMemo(() => echoRecutIdentityOptions(parentSnapshot || project), [parentSnapshot, project]);
  useEffect(() => {
    setLab(typeof localStorage === "undefined" ? base : loadVariationLab(localStorage, projectId) || base);
    setCandidates([]); setChosen(null); setError(""); setStart(0); setEnd(Math.min(15, Number(project?.duration) || 15));
    setParentSnapshot(null); setAllowedSignatures([]); setCharacterId(""); setSceneId("");
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
      const next = ["A", "B", "C"].map(label => ({ label, ...createEchoNarrativeRecut({ project: snapshot, recipeId, seed: `${seed}:${label}`, range: { startSeconds: Number(start), endSeconds: Number(end) }, locks: lab.locks, changeAmount, requiredCharacterIds: characterId ? [characterId] : [], requiredSceneIds: sceneId ? [sceneId] : [] }) }));
      setParentSnapshot(snapshot);
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
  const restoreParent = () => {
    if (!parentSnapshot) return;
    choose({ label: "source", project: structuredClone(parentSnapshot), receipt: { action: "restore-comparison-source", parentCutId } });
  };
  const buttonStyle = { padding: "6px 9px", minWidth: 0, font: "inherit", overflowWrap: "anywhere", border: "1px solid #64748b", borderRadius: 4, background: "#111827", color: "#e2e8f0" };
  return <section data-testid="variation-lab" aria-label="Quick director cuts" style={{ display: "grid", minWidth: 0, fontSize: 14, gap: 12, padding: 12, border: "1px solid #655091", background: "#080d19", color: "#e2e8f0" }}>
    <style>{'[data-testid="variation-lab"] label {display:grid;gap:4px;min-width:0} [data-testid="variation-lab"] select,[data-testid="variation-lab"] input {font:inherit;max-width:100%;min-width:0;box-sizing:border-box} [data-testid="variation-lab"] small {font-size:14px}'}</style>
    <div><strong>Quick director cuts</strong><p style={{ margin: "5px 0", fontSize: 14 }}>Create three alternatives from this cut. Compare them in the main player, then choose Save as new cut to keep your favorite.</p>
      <small>Reuses current footage without new analysis or model calls. Timing, lyrics, partial boundary shots and the opening media stay unchanged.</small></div>
    {disabled && <p role="status" style={{ margin: 0 }}>Select a saved direction cut and finish any pending save to use quick recuts.</p>}
    <fieldset disabled={disabled} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", minWidth: 0, gap: 10, border: 0, padding: 0 }}>
      <label>Recipe <select aria-label="Director recipe" value={recipeId} onChange={event => setRecipeId(event.target.value)}>{Object.values(NARRATIVE_VARIANT_RECIPES).map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.label}</option>)}</select></label>
      <label>Seed <input aria-label="Cut seed" value={seed} maxLength={128} onChange={event => setSeed(event.target.value)} style={{ width: 100 }} /></label>
      <label>Change amount <select aria-label="Recut change amount" value={changeAmount} onChange={event => setChangeAmount(Number(event.target.value))}><option value={.25}>Light · 25% of editable shots</option><option value={.5}>Balanced · 50%</option><option value={1}>Full · 100%</option></select></label>
      <label>Cast <select aria-label="Recut cast" value={characterId} disabled={!identities.characterIds.length} onChange={event => setCharacterId(event.target.value)}><option value="">{identities.characterIds.length ? "Any declared cast" : "No declared cast in this cut"}</option>{identities.characterIds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
      <label>Scene <select aria-label="Recut scene" value={sceneId} disabled={!identities.sceneIds.length} onChange={event => setSceneId(event.target.value)}><option value="">{identities.sceneIds.length ? "Any declared scene" : "No declared scenes in this cut"}</option>{identities.sceneIds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
      <label>From (s) <input aria-label="Recut start seconds" type="number" min="0" step="0.1" value={start} onChange={event => setStart(event.target.value)} style={{ width: 80 }} /></label>
      <label>To (s) <input aria-label="Recut end seconds" type="number" min="0" step="0.1" max={project?.duration} value={end} onChange={event => setEnd(event.target.value)} style={{ width: 80 }} /></label>
      <button type="button" style={buttonStyle} onClick={() => { setStart(Math.floor(currentTime * 10) / 10); setEnd(Math.min(Number(project.duration), Math.floor(currentTime * 10) / 10 + 15)); }}>Use playhead</button>
      <button type="button" style={buttonStyle} onClick={() => { setStart(0); setEnd(Number(project.duration)); }}>Whole song</button>
      {lockTargets.map(target => <button type="button" key={target.targetId} aria-pressed={isLocked(target)} style={buttonStyle} onClick={() => toggleLock(target)}>{isLocked(target) ? "Locked: " : "Lock: "}{target.label}</button>)}
      <button type="button" style={buttonStyle} onClick={generate}>Generate A/B/C</button>
    </fieldset>
    <small>Cast and scene choices constrain the shots selected for change. Locked media must also satisfy those choices; unavailable combinations report a limitation. Percentage rounds up to whole editable shots.</small>
    {error && <p role="alert" style={{ margin: 0, color: "#fca5a5" }}>{error}</p>}
    {candidates.length > 0 && <>
      <small>Generated in {Math.round(elapsed)} ms. A/B/C cover the same range: {candidates[0].receipt.range.startSeconds}–{candidates[0].receipt.range.endSeconds}s. The playhead stays under your control.</small>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 8 }}>{candidates.map(candidate => {
        const limitations = [...new Set(candidate.receipt.decisions.flatMap(decision => decision.limitations))];
        return <div key={candidate.label} style={{ border: `1px solid ${chosen === candidate.label ? "#6ee7b7" : "#475569"}`, padding: 9 }}>
          <strong>Cut {candidate.label}</strong><p style={{ fontSize: 14 }}>{candidate.receipt.changedShotIndices.length} shots updated</p>
          <button type="button" style={buttonStyle} disabled={disabled} aria-pressed={chosen === candidate.label} onClick={() => choose(candidate)}>{chosen === candidate.label ? "In player" : `Review ${candidate.label} in player`}</button>
          {limitations.length > 0 && <details style={{ fontSize: 14, marginTop: 8 }}><summary>Selection limitations</summary><ul>{limitations.map(item => <li key={item}>{item.replaceAll("-", " ")}</li>)}</ul></details>}
        </div>;
      })}</div>
      <button type="button" style={buttonStyle} disabled={disabled || !chosen || chosen === "source"} onClick={restoreParent}>Restore comparison source</button>
      {chosen && <p role="status" style={{ fontSize: 14, margin: 0 }}>{chosen === "source" ? "The cut used to generate A/B/C is back in the player. Your earlier working edits are preserved." : `Cut ${chosen} is the current working draft. Choose Save as new cut to keep it, or restore the comparison source.`}</p>}
    </>}
  </section>;
}
