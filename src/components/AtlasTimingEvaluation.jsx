import {useEffect, useState} from 'react';
import {correctionSamples} from '../domain/audio-atlas-ui.js';
const metric=value=>value==null?'—':`${value.toFixed(1)} ms`;
export default function AtlasTimingEvaluation({runId, assetId, request, base, onSaved, onCue}) {
  const [report,setReport]=useState(null),[targetId,setTargetId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
  const [label,setLabel]=useState('present'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[uncertainty,setUncertainty]=useState(''),[reviewer,setReviewer]=useState(''),[note,setNote]=useState('');
  useEffect(()=>{let live=true;setBusy(true);setReport(null);setError('');request(`/jobs/${runId}/query?op=timing-evaluation&asset=${encodeURIComponent(assetId)}`).then(r=>{if(live){setReport(r);setTargetId(id=>r.targets.some(t=>t.id===id)?id:r.targets[0]?.id||'');}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[runId,assetId,refresh,request]);
  useEffect(()=>{setStart('');setEnd('');setUncertainty('');setNote('');setLabel('present');setNotice('');},[targetId,runId,assetId]);
  const target=report?.targets.find(t=>t.id===targetId);
  const targetIndex=report?.targets.findIndex(t=>t.id===targetId)??-1;
  const cueTarget=target?.start_sample!=null?target:report?.targets.slice(0,targetIndex).reverse().find(t=>t.start_sample!=null);
  const bounds=report?correctionSamples(start,end,report.sample_rate_hz,report.sample_count):null;
  const ambiguity=uncertainty.trim()===''?NaN:Math.round(Number(uncertainty)*report?.sample_rate_hz/1000);
  const valid=target&&reviewer.trim()&&note.trim()&&(label!=='present'||(bounds&&Number.isSafeInteger(ambiguity)&&ambiguity>=0&&ambiguity<=report.sample_rate_hz));
  const save=async()=>{
    if(!valid)return;setBusy(true);setError('');setNotice('Saving reference…');
    try{await request(`/jobs/${runId}/reference`,{method:'POST',body:JSON.stringify({revision:report.revision,asset_id:assetId,source_sha256:report.source_sha256,timeline_id:report.timeline_id,target_id:target.id,text:target.text,label_origin:'human',label,reviewer,note,...(label==='present'?{...bounds,uncertainty_samples:ambiguity}:{})})});setRefresh(v=>v+1);onSaved?.();setNotice('Reference saved. Analysis and corrections are unchanged.');}
    catch(e){setError(e.message);setNotice('Reference was not confirmed saved. Reload the report before retrying.');}finally{setBusy(false);}
  };
  return <div className="atlas-content"><h3>Timing accuracy · {report?.source_role||'selected source'}</h3>
    <p>Compare word candidates with timing you independently mark while listening. Leave uncertain or unperformed words explicitly labelled. Saving a reference does not change or accept a candidate.</p>
    {error&&<p role="alert">{error} <button className="hapa-btn" onClick={()=>setRefresh(v=>v+1)}>Reload report</button></p>}
    <p role="status">{busy?'Loading timing references…':notice}</p>
    {report&&<><p>{report.human.labelled_targets} of {report.target_count} words have human-entered references. {report.human.not_performed} marked not performed; {report.human.uncertain} uncertain.</p>
      {!report.human.present&&<p>No human timing references yet. Accuracy is unknown.</p>}
      <div style={{overflowX:'auto'}}><table className="atlas-stem-timing"><thead><tr><th>Comparison</th><th>Measured boundaries</th><th>Median absolute error</th><th>p95 absolute error</th><th>Signed bias</th></tr></thead><tbody>{[['Original onset',report.human.original.onset],['Original offset',report.human.original.offset],['Effective onset',report.human.effective.onset],['Effective offset',report.human.effective.offset]].map(([name,m])=><tr key={name}><td>{name}</td><td>{m.count}</td><td>{metric(m.medianMs)}</td><td>{metric(m.p95Ms)}</td><td>{metric(m.signedBiasMs)}</td></tr>)}</tbody></table></div>
      <p>{report.human.maximumDeclaredUncertaintyMs==null?'No timed reference uncertainty has been entered.':`Declared reference uncertainty up to ${metric(report.human.maximumDeclaredUncertaintyMs)}.`} Effective results apply explicit accepted corrections; text changes or rejected candidates may exclude them from comparison.</p>
      {report.synthetic.labelled_targets>0&&<p>{report.synthetic.labelled_targets} synthetic test labels are excluded from these human metrics.</p>}
      {report.targets.length?<details><summary>Record a timing reference</summary><fieldset disabled={busy} className="atlas-reference-form"><legend>Listen to this source before entering a reference</legend>
        <label>Reference word<select aria-label="Reference word" value={targetId} onChange={e=>setTargetId(e.target.value)}>{report.targets.map((t,i)=><option key={t.id} value={t.id}>{i+1}. {t.text} · {t.start_sample==null?'unresolved':`${(t.start_sample/report.sample_rate_hz).toFixed(3)}s`}</option>)}</select></label>
        <button className="hapa-btn" disabled={!cueTarget||busy} onClick={()=>onCue?.(Math.max(0,cueTarget.start_sample/report.sample_rate_hz-0.5))}>Cue word context</button>
        {target?.reference&&<p>Last reference: {target.reference.label.replaceAll('_',' ')} · {target.reference.reviewer}. A new entry preserves the previous one in history.</p>}
        <label>What is audible?<select aria-label="Reference label" value={label} onChange={e=>setLabel(e.target.value)}><option value="present">Word is performed</option><option value="not_performed">Word is not performed</option><option value="uncertain">Uncertain / cannot isolate</option><option value="retracted">Retract the previous reference</option></select></label>
        {label==='present'&&<div className="atlas-actions"><label>Reference start (seconds)<input aria-label="Reference start (seconds)" type="number" min="0" step="any" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Reference end (seconds)<input aria-label="Reference end (seconds)" type="number" min="0" step="any" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>Uncertainty (milliseconds)<input aria-label="Reference uncertainty (milliseconds)" type="number" min="0" max="1000" step="any" value={uncertainty} onChange={e=>setUncertainty(e.target.value)}/></label></div>}
        <label>Annotator name<input aria-label="Reference annotator" value={reviewer} maxLength="120" onChange={e=>setReviewer(e.target.value)}/></label><label>Listening notes<textarea aria-label="Reference listening notes" value={note} maxLength="4000" onChange={e=>setNote(e.target.value)}/></label>
        <small>Enter both word boundaries and your uncertainty. Candidate times are deliberately not prefilled. Your name records attribution, not independent identity verification.</small>
        <button className="hapa-btn" disabled={!valid||busy} onClick={save}>Save timing reference</button>
      </fieldset></details>:<p>This source has no word candidates. Choose Vocals above, or run transcription or supplied-word alignment.</p>}
      <a className="hapa-btn" href={`${base}/api/echos/audio-atlas/jobs/${runId}/query?op=timing-evaluation&asset=${encodeURIComponent(assetId)}`} target="_blank" rel="noreferrer">Open timing error report</a>
      <details><summary>Evaluation limits</summary><p>{report.notice}</p><p>{report.excluded.length} invalid or stale reference records excluded.</p></details>
    </>}
  </div>;
}
