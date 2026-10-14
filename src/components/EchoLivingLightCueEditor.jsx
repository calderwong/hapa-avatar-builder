import {useEffect,useMemo,useRef,useState} from 'react';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {canonicalJSON} from '../domain/living-light-contracts.js';
import {createEchoLivingLightCue,editEchoLivingLightCues,createEchoLivingLightEditHistory} from '../domain/echo-living-light-editor.js';
import './EchoLivingLightCueEditor.css';
const EMPTY=Object.freeze([]),key=j=>`${j.journeyId}@${j.revisionId}`,us=value=>Math.round(Number(value)*1e6);

export default function EchoLivingLightCueEditor({project,cutKey,currentTime=0,onChange,disabled=false,active=true,refreshToken=0,client:providedClient}) {
 const client=useMemo(()=>providedClient||createLivingLightClient(),[providedClient]);
 const cues=project?.living_light_cues||EMPTY,signature=canonicalJSON(cues),songId=project?.song_id;
 const records=useRef(new Map()),epoch=useRef(0),history=useRef(createEchoLivingLightEditHistory(cues));
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(''),[journeyKey,setJourneyKey]=useState(''),[role,setRole]=useState('scene'),[start,setStart]=useState('0'),[sourceStart,setSourceStart]=useState('0'),[sourceEnd,setSourceEnd]=useState('8');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[nextOffset,setNextOffset]=useState(null),[historyState,setHistoryState]=useState(history.current.state());
 const selectedCue=cues.find(cue=>cue.cueId===selected),selectedSignature=selectedCue?canonicalJSON(selectedCue):'';
 const journey=records.current.get(journeyKey);
 const options=[...rows];if(journey&&!options.some(row=>key(row)===journeyKey))options.push(journey);
 const resolveJourney=ref=>records.current.get(`${ref.journeyId}@${ref.revisionId}`);
 function publishRows(){setRows(current=>[...current]);}
 useEffect(()=>{history.current.reset(cues);setHistoryState(history.current.state());setSelected('');setJourneyKey('');records.current.clear();setRows([]);},[songId,cutKey]);
 useEffect(()=>{if(canonicalJSON(history.current.state().present)!==signature){history.current.reset(cues);setHistoryState(history.current.state());setStatus('Cue changes loaded. Undo history starts from this version.');}},[signature]);
 async function load(offset=0){
  const ticket=++epoch.current;setBusy(true);setStatus('Loading saved Journeys…');
  try{const page=await client.request(`/journeys?songId=${encodeURIComponent(songId)}&limit=100&offset=${offset}`);if(ticket!==epoch.current)return;
   const incoming=page.journeys.map(row=>row.journey);for(const item of incoming)records.current.set(key(item),item);
   setRows(current=>offset?[...current,...incoming.filter(item=>!current.some(old=>key(old)===key(item)))]:incoming);setNextOffset(page.nextOffset);setStatus(incoming.length?'Choose a saved Journey or select an existing cue.':'Save a Journey below to use it in this cut.');
  }catch(error){if(ticket===epoch.current)setStatus(error.message);}finally{if(ticket===epoch.current)setBusy(false);}
 }
 useEffect(()=>{if(active&&songId)void load();return()=>{epoch.current++;};},[songId,cutKey,active,refreshToken,client]);
 useEffect(()=>{
  if(!selectedCue)return;
  setRole(selectedCue.role);setStart(String(selectedCue.window.startUs/1e6));setSourceStart(String(selectedCue.journeyWindow.startUs/1e6));setSourceEnd(String(selectedCue.journeyWindow.endUs/1e6));
  const ref=selectedCue.journeyRef,k=`${ref.journeyId}@${ref.revisionId}`;setJourneyKey(k);
  if(records.current.has(k))return;
  let cancelled=false;setStatus('Loading the cue’s exact saved revision…');
  client.request('/journeys/'+encodeURIComponent(ref.journeyId)+'/revisions/'+encodeURIComponent(ref.revisionId)).then(row=>{if(cancelled)return;records.current.set(k,row.journey);publishRows();setStatus('Exact saved revision loaded.');}).catch(error=>{if(!cancelled)setStatus('Cue retained; source unavailable: '+error.message);});
  return()=>{cancelled=true;};
 },[selectedSignature,client]);
 function chooseJourney(value){setJourneyKey(value);const j=records.current.get(value);if(!selectedCue&&j){setSourceStart('0');setSourceEnd(String(j.schedule.at(-1).endUs/1e6));}}
 function apply(action){
  if(disabled||busy)return;
  try{const next=editEchoLivingLightCues(project,action,{resolveJourney,expectedCues:history.current.state().present});history.current.commit(cues,next);onChange(next);setHistoryState(history.current.state());setStatus('Cut draft updated. Use Save as new cut to keep this version.');if(action.type==='insert')setSelected(action.cue.cueId);if(action.type==='remove')setSelected('');}
  catch(error){setStatus(error.message);}
 }
 function insert(){try{if(!journey)throw Error('Choose a saved Journey first.');apply({type:'insert',cue:createEchoLivingLightCue({journey,cueId:'ll-cue:'+crypto.randomUUID(),role,startUs:us(start),journeyWindow:{startUs:us(sourceStart),endUs:us(sourceEnd)}})});}catch(error){setStatus(error.message);}}
 function replay(direction){if(disabled)return;try{const next=history.current[direction](cues);onChange(next);setHistoryState(history.current.state());setStatus(direction==='undo'?'Living Light edit undone.':'Living Light edit restored.');}catch(error){setStatus(error.message);}}
 const windows=journey?.schedule?.filter(row=>role==='transition'?row.fromInstanceId&&row.toInstanceId:!row.fromInstanceId)||[];
 return <section className="echo-light-cues" aria-label="Living Light Director scenes">
  <header><div><h4>Living Light in this cut</h4><p>Place saved Journey Cards as scenes and transitions. Each use keeps its own timing.</p></div><button type="button" disabled={busy||!active} onClick={()=>load()}>Refresh Journeys</button></header>
  <div className="echo-light-cue-list" aria-label="Living Light cues">{cues.length?cues.map(cue=><button type="button" key={cue.cueId} aria-pressed={selected===cue.cueId} onClick={()=>setSelected(cue.cueId)}><strong>{cue.role==='transition'?'Transition':'Scene'}</strong><span>{(cue.window.startUs/1e6).toFixed(2)}–{(cue.window.endUs/1e6).toFixed(2)}s</span><small>{resolveJourney(cue.journeyRef)?.title||cue.journeyRef.journeyId}</small>{(cue.locks.timing||cue.locks.journey)&&<small>Locked: {[cue.locks.timing?'timing':'',cue.locks.journey?'Journey':''].filter(Boolean).join(', ')}</small>}</button>):<p>No Living Light scenes in this cut yet.</p>}</div>
  <div className="echo-light-cue-toolbar"><button type="button" onClick={()=>{setSelected('');setStart(String(Number(currentTime).toFixed(3)));}}>New cue at playhead</button><button type="button" disabled={disabled||!historyState.canUndo} onClick={()=>replay('undo')}>Undo cue edit</button><button type="button" disabled={disabled||!historyState.canRedo} onClick={()=>replay('redo')}>Redo cue edit</button></div>
  <fieldset disabled={disabled||busy}><legend>{selectedCue?'Edit selected cue':'New scene or transition'}</legend>
   <div className="echo-light-cue-fields"><label>Saved Journey<select aria-label="Director saved Journey" value={journeyKey} onChange={e=>chooseJourney(e.target.value)}><option value="">Choose a saved Journey</option>{journeyKey&&!journey&&<option value={journeyKey}>Pinned revision unavailable</option>}{options.map(j=><option key={key(j)} value={key(j)}>{j.title} · {j.revisionId.slice(-8)}</option>)}</select></label>
   <label>Use as<select aria-label="Director Journey role" value={role} onChange={e=>setRole(e.target.value)}><option value="scene">Scene</option><option value="transition">Transition</option></select></label>
   <label>Cut start (seconds)<input aria-label="Director cue start" type="number" min="0" step="0.001" value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label>Journey in (seconds)<input aria-label="Director Journey in" type="number" min="0" step="0.001" value={sourceStart} onChange={e=>setSourceStart(e.target.value)}/></label>
   <label>Journey out (seconds)<input aria-label="Director Journey out" type="number" min="0" step="0.001" value={sourceEnd} onChange={e=>setSourceEnd(e.target.value)}/></label></div>
   {!!windows.length&&<div className="echo-light-cue-toolbar"><span>Use complete {role==='transition'?'passage':'Location'}:</span>{windows.map(row=><button key={row.instanceId} type="button" onClick={()=>{setSourceStart(String(row.startUs/1e6));setSourceEnd(String(row.endUs/1e6));}}>{(row.startUs/1e6).toFixed(1)}–{(row.endUs/1e6).toFixed(1)}s</button>)}</div>}
   <div className="echo-light-cue-toolbar">{selectedCue?<><button type="button" disabled={selectedCue.locks.timing} onClick={()=>apply({type:'move',cueId:selected,startUs:us(start)})}>Move cue</button><button type="button" disabled={selectedCue.locks.timing} onClick={()=>apply({type:'window',cueId:selected,journeyWindow:{startUs:us(sourceStart),endUs:us(sourceEnd)}})}>Apply source window</button><button type="button" disabled={!journey||selectedCue.locks.journey} onClick={()=>apply({type:'swap',cueId:selected,journey,role,journeyWindow:{startUs:us(sourceStart),endUs:us(sourceEnd)}})}>Swap Journey / role</button><button type="button" disabled={selectedCue.locks.timing||selectedCue.locks.journey} onClick={()=>apply({type:'remove',cueId:selected})}>Remove cue</button><label><input type="checkbox" checked={selectedCue.locks.timing} onChange={e=>apply({type:'lock',cueId:selected,lock:'timing',value:e.target.checked})}/>Lock timing</label><label><input type="checkbox" checked={selectedCue.locks.journey} onChange={e=>apply({type:'lock',cueId:selected,lock:'journey',value:e.target.checked})}/>Lock Journey</label></>:<button type="button" disabled={!journey} onClick={insert}>Insert into cut</button>}</div>
  </fieldset>
  {nextOffset!==null&&<button type="button" disabled={busy} onClick={()=>load(nextOffset)}>More saved Journeys</button>}
  <p role="status">{status}</p><p className="echo-light-cue-note">Native passage timing stays intact. Open Preview to play saved Journey scenes. Encoded output is still being connected.</p>
 </section>;
}
