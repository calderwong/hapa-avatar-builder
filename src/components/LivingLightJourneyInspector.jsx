import {useEffect,useMemo,useRef,useState} from 'react';
import {createLivingLightClient} from '../domain/living-light-client.js';
import LivingLightSharedCardActions from './LivingLightSharedCardActions.jsx';
import LivingLightNotes from './LivingLightNotes.jsx';
import LivingLightPortablePanel from './LivingLightPortablePanel.jsx';
/** Inspection is an owner read. It never changes the editor, song or preview. */
export default function LivingLightJourneyInspector({reference,songId,registry,onOpen,onClose,onChanged,sharedHandEnabled=false}){
 const client=useMemo(()=>createLivingLightClient(),[]),epoch=useRef(0);
 const [record,setRecord]=useState(null),[busy,setBusy]=useState(true),[status,setStatus]=useState('');
 useEffect(()=>{
  const controller=new AbortController(),ticket=++epoch.current;setRecord(null);setBusy(true);setStatus('Loading the exact saved recipe…');
  const route='/journeys/'+encodeURIComponent(reference.journeyId)+(reference.revisionId?'/revisions/'+encodeURIComponent(reference.revisionId):'');
  client.request(route,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])}).then(value=>{if(epoch.current===ticket){setRecord(value);setStatus('Inspecting a saved revision. Your editor draft and preview are unchanged.');}}).catch(error=>{if(epoch.current===ticket)setStatus('Recipe inspection unavailable: '+error.message);}).finally(()=>{if(epoch.current===ticket)setBusy(false);});
  return()=>{epoch.current++;controller.abort();};
 },[client,reference.journeyId,reference.revisionId]);
 const journey=record?.journey;
 return <aside className="living-light-thing-inspector" aria-label="Saved Journey details and notes">
  <header><div><small>Journey · {journey?.mode==='tour'?'Location tour':'Tunnel recipe'}</small><h4>{journey?.title||'Saved recipe'}</h4></div><button type="button" onClick={onClose}>Close recipe details</button></header>
  <p role="status">{status}</p>
  {journey&&<>
   <p>{journey.instances.length} uses · {(journey.schedule.at(-1).endUs/1e6).toFixed(2)} seconds · Visual qualification pending.</p>
   <p>Song: <code>{journey.songId}</code>{journey.songId!==songId?' · Select this song in Echo before opening its recipe in the editor.':''}</p>
   <button type="button" disabled={busy||journey.songId!==songId} onClick={()=>onOpen?.(record)}>Open saved recipe in editor</button>
   <ol>{journey.schedule.map(row=>{const instance=journey.instances.find(i=>i.instanceId===row.instanceId),thing=registry.resolveThing(instance.thingRef);return <li key={row.instanceId}>{thing?.title||'Pinned module not loaded'} · {(row.startUs/1e6).toFixed(2)}–{(row.endUs/1e6).toFixed(2)}s</li>;})}</ol>
   <details><summary>Source, identity & credits</summary><p>{record.actor?.kind==='agent'?'Agent author':'Local author'} · {record.actor?.displayName} · {record.occurredAt}</p><p>Revision {record.revisionNumber} · <code>{journey.revisionId}</code> · Card custody {record.custody?.state} · publication not acknowledged</p><p>Each use retains its exact module revision and source credits. This recipe is preview only; final rendering is unsupported.</p></details>
   {sharedHandEnabled&&<LivingLightSharedCardActions key={'shared:'+journey.revisionId} target={{kind:'journey',id:journey.journeyId,revision:journey.revisionId}}/>}
   <LivingLightPortablePanel key={'journey-export:'+journey.revisionId} exportsOnly root={{kind:'journey',id:journey.journeyId,revision:journey.revisionId}}/>
   <LivingLightNotes key={'journey-notes:'+journey.journeyId+':'+journey.revisionId} target={{kind:'journey',journeyId:journey.journeyId,observedRevisionId:journey.revisionId}} label={journey.title} onChanged={onChanged}/>
  </>}
 </aside>;
}
