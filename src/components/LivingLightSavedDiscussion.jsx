import {useState} from 'react';
import LivingLightNotes from './LivingLightNotes.jsx';
/** Cue anchors come from the saved snapshot, never a changed unsaved schedule. */
export default function LivingLightSavedDiscussion({identity,selectedId,dirty,onChanged}){
 const [scope,setScope]=useState(null),[range,setRange]=useState(null);
 const observed=identity?.snapshot,row=observed?.schedule.find(item=>item.instanceId===selectedId),instance=observed?.instances.find(item=>item.instanceId===selectedId);
 const validRange=range&&Number.isSafeInteger(range.startUs)&&Number.isSafeInteger(range.endUs)&&range.startUs>=row?.startUs&&range.endUs<=row?.endUs&&range.endUs>range.startUs;
 const target=scope==='journey'?{kind:'journey',journeyId:identity.journeyId,observedRevisionId:identity.revisionId}:scope==='instance'&&row&&instance&&(!range||validRange)?{kind:'instance',journeyId:identity.journeyId,observedRevisionId:identity.revisionId,instanceId:selectedId,...(range?{startUs:range.startUs,endUs:range.endUs}:{}),...(observed.sourceBindingRef?{sourceBindingRevisionId:observed.sourceBindingRef.revisionId}:{})}:null;
 return <div className="living-light-saved-discussion">
  <div className="living-light-card-actions"><button type="button" disabled={!identity} aria-pressed={scope==='journey'} onClick={()=>setScope(scope==='journey'?null:'journey')}>Discuss saved recipe</button><button type="button" disabled={!row||!instance} aria-pressed={scope==='instance'} onClick={()=>{setScope(scope==='instance'?null:'instance');setRange(null);}}>Discuss saved use</button></div>
  {!identity&&<p>Save the recipe before attaching recipe or cue notes.</p>}
  {scope&&dirty&&<p>Discussion observes the saved revision. Your unsaved schedule and overrides remain separate.</p>}
  {scope==='instance'&&row&&<div className="living-light-card-actions"><label><input type="checkbox" checked={!!range} onChange={event=>setRange(event.target.checked?{startUs:row.startUs,endUs:row.endUs}:null)}/> Mark a cue range</label><span>Saved use: {(row.startUs/1e6).toFixed(2)}–{(row.endUs/1e6).toFixed(2)}s</span>{range&&<><label>Cue starts at seconds <input type="number" min={row.startUs/1e6} max={row.endUs/1e6} step="0.001" value={range.startUs/1e6} onChange={event=>setRange(previous=>({...previous,startUs:Math.round(Number(event.target.value)*1e6)}))}/></label><label>Cue ends at seconds <input type="number" min={row.startUs/1e6} max={row.endUs/1e6} step="0.001" value={range.endUs/1e6} onChange={event=>setRange(previous=>({...previous,endUs:Math.round(Number(event.target.value)*1e6)}))}/></label></>}{range&&!validRange&&<p role="status">Choose a nonempty range inside this saved instance.</p>}</div>}
  {target&&<LivingLightNotes key={JSON.stringify(target)} target={target} label={scope==='journey'?'Saved recipe':'Saved instance'} onChanged={onChanged}/>}
 </div>;
}
