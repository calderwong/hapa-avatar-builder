import {useEffect,useMemo,useRef,useState} from 'react';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {effectiveThingParameters} from '../domain/living-light-preset.js';
import {canonicalJSON} from '../domain/living-light-contracts.js';
import {initialPresetDraft,presetDraftKey,readPresetDraft} from '../domain/living-light-preset-draft.js';
import {useLivingLightRegistry} from './LivingLightRegistryProvider.jsx';
/** Saving creates native metadata/custody, never source mutation or note copying. */
export default function LivingLightPresetPanel({thing,parameters={},mode='create',scope='library',onSaved,onUse,disabled=false}){
 const catalog=useLivingLightRegistry(),client=useMemo(()=>createLivingLightClient(),[]),key=presetDraftKey(thing,mode)+':'+scope,touched=useRef(false),live=useRef(true),pending=useRef(null);
 const [draft,setDraft]=useState(()=>{let value;try{value=readPresetDraft(localStorage.getItem(key),thing,mode);}catch{}touched.current=!!value;return value||initialPresetDraft(thing,parameters,mode);}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(null);
 pending.current=draft.pending||null;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(draft));}catch{}},[draft,key]);
 useEffect(()=>{if(!touched.current)setDraft(old=>({...old,parameters:effectiveThingParameters(thing,parameters)}));},[canonicalJSON(parameters)]);
 function change(field,value){touched.current=true;setDraft(old=>({...old,[field]:value,pending:null}));setSaved(null);setMessage('Unsaved preset draft');}
 async function save(){if(busy||disabled)return;const ref=mode==='revise'?thing.derivedFrom:{thingId:thing.thingId,revisionId:thing.revisionId},content={derivedFrom:ref,title:draft.title,summary:draft.summary,parameters:draft.parameters,expectedRevision:mode==='revise'?thing.revisionId:null},fingerprint=canonicalJSON(content),idempotencyKey=pending.current?.fingerprint===fingerprint?pending.current.key:crypto.randomUUID(),next={...draft,pending:{fingerprint,key:idempotencyKey}};
  // Persist the same request identity before dispatch. Ambiguous errors require explicit retry.
  setDraft(next);pending.current=next.pending;try{localStorage.setItem(key,JSON.stringify(next));}catch{}setBusy(true);setMessage('Saving preset…');
  try{const result=await client.request(mode==='revise'?'/things/'+encodeURIComponent(thing.thingId)+'/revisions':'/things',{method:'POST',body:JSON.stringify({...content,idempotencyKey})});if(!live.current)return;setSaved(result);setMessage('Preset saved locally. Its notes are separate; visual qualification is pending.');try{await catalog?.accept(result.thing,result);await onSaved?.(result);}catch{if(live.current)setMessage('Preset saved. The library could not refresh; reload saved presets.');}}
  catch(error){if(live.current)setMessage(error.code==='revision_conflict'?'This preset changed. Your draft is kept. Reload saved presets and compare the latest revision.':error.message);}finally{if(live.current)setBusy(false);}
 }
 return <details className="living-light-preset-panel"><summary>{mode==='revise'?'Revise this preset':'Save as new preset'}</summary><p>{mode==='revise'?'Saved recipes keep their pinned revision.':'Create a separate reusable Card from these settings. Original notes and settings stay on their existing identity.'}</p><label>Preset title <input value={draft.title} maxLength={200} disabled={busy||disabled} onChange={e=>change('title',e.target.value)}/></label><label>Preset description <textarea value={draft.summary} maxLength={4000} disabled={busy||disabled} onChange={e=>change('summary',e.target.value)}/></label>
 {Object.entries(thing.parameters).map(([name,def])=><label key={name}>Preset {name} {def.type==='number'?<input type="number" min={def.min} max={def.max} step="0.01" value={draft.parameters[name]??def.default} disabled={busy||disabled} onChange={e=>change('parameters',{...draft.parameters,[name]:Number(e.target.value)})}/>:<span>{JSON.stringify(draft.parameters[name]??def.default)}</span>}</label>)}
 {!Object.keys(thing.parameters).length&&<p>This Location has no exposed numeric controls. Its new identity and notes remain separate.</p>}
 {onUse&&<button type="button" disabled={busy||disabled} onClick={()=>change('parameters',effectiveThingParameters(thing,parameters))}>Use current instance settings</button>}
 <button type="button" disabled={busy||disabled||!!saved} onClick={save}>{busy?'Saving preset…':mode==='revise'?'Save preset revision':'Save preset Card'}</button>{saved&&onUse&&<button type="button" disabled={busy||disabled} onClick={()=>onUse(saved.thing)}>Use saved preset in this instance</button>}
 <p role="status">{message}</p>{saved&&<p><code>{saved.thing.thingId}</code> · {saved.thing.revisionId} · custody {saved.custody?.state} · publication not acknowledged</p>}
 </details>;
}
