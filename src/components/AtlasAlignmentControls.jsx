import {alignmentRequest} from '../domain/audio-atlas-alignment.js';
export function alignmentDraft(draft) {
  if (!draft.enabled) return {value: null, error: ''};
  try {
    if (draft.start === '' || draft.end === '') throw new Error('Choose the start and end of the passage.');
    return {value: alignmentRequest({sourceId: draft.sourceId, text: draft.text, startSeconds: Number(draft.start), endSeconds: Number(draft.end)}), error: ''};
  } catch (e) { return {value: null, error: e.message}; }
}
export default function AtlasAlignmentControls({draft, onChange, sources = [], disabled}) {
  const update = patch => onChange({...draft, ...patch});
  const {error} = alignmentDraft(draft);
  return <div className="atlas-alignment-controls">
    <label><input type="checkbox" checked={draft.enabled} disabled={disabled} onChange={e => update({enabled: e.target.checked})} /> Align supplied words to a passage</label>
    {draft.enabled && <fieldset disabled={disabled}><legend>English passage · up to 30 seconds</legend>
      <p>Choose the vocal source when available, then paste only the words for this passage. This estimates their timing; it does not verify what was sung.</p>
      <label>Alignment source<select aria-label="Alignment source" value={draft.sourceId} onChange={e => update({sourceId: e.target.value})}>{sources.map(s => <option key={s.id} value={s.id}>{s.role}</option>)}</select></label>
      <div className="atlas-actions"><label>Passage start (seconds)<input aria-label="Passage start (seconds)" type="number" min="0" step="0.001" value={draft.start} onChange={e => update({start: e.target.value})} /></label><label>Passage end (seconds)<input aria-label="Passage end (seconds)" type="number" min="0" step="0.001" value={draft.end} onChange={e => update({end: e.target.value})} /></label></div>
      <label>Words for this passage<textarea aria-label="Words for this passage" maxLength="4000" rows="4" value={draft.text} onChange={e => update({text: e.target.value})} /></label>
      {error && <p role="status">{error}</p>}<small>Original lyrics and saved reviews are preserved. Silent or invalid word intervals remain unresolved.</small>
    </fieldset>}
  </div>;
}
export function AlignmentResult({value, onReview}) {
  if (!value) return null;
  return <article className="atlas-alignment-result"><h3>Supplied-word timing</h3>
    <p>{value.candidates.length} word candidates · {value.unresolved.length} unresolved · not reviewed</p>
    <p>{value.notice}</p><pre>{value.supplied_text}</pre>
    <button className="hapa-btn" disabled={!value.candidates.length} onClick={onReview}>Review aligned words</button>
    {value.unresolved.length > 0 && <details><summary>Words that need attention</summary><ul>{value.unresolved.map((row,i) => <li key={i}><strong>{row.supplied_token_index != null ? value.supplied_tokens[row.supplied_token_index]?.text : row.normalized_text || 'Passage'}</strong> · {(row.reasons || [row.reason]).join(', ').replaceAll('_', ' ')}</li>)}</ul></details>}
    <small>English · Qwen3 forced alignment · {value.request.startSeconds}–{value.request.endSeconds}s on the selected source. Accuracy has not been qualified.</small>
  </article>;
}
