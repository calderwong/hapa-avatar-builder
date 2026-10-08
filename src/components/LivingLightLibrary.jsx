import LivingLightPortablePanel from './LivingLightPortablePanel.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import LivingLightNotes from './LivingLightNotes.jsx';
import LivingLightPresetPanel from './LivingLightPresetPanel.jsx';
import LivingLightThingHistory from './LivingLightThingHistory.jsx';
import LivingLightVisibilityControls from './LivingLightVisibilityControls.jsx';
import {useLivingLightRegistry} from './LivingLightRegistryProvider.jsx';
import {createLivingLightClient} from '../domain/living-light-client.js';

const label=thing=>thing.kind==='location'?'Location':thing.variantKind==='continuous-profile'?'Continuous Tunnel':'Bridge Tunnel';

/** Catalog and discussion consume one metadata service; tiles allocate no GL/audio. */
export default function LivingLightLibrary({registry:sourceRegistry,onUse,onAdd}){
 const catalog=useLivingLightRegistry(),registry=catalog?.registry||sourceRegistry;
 const client=useMemo(()=>createLivingLightClient(),[]),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[selectedId,setSelectedId]=useState(null),[heads,setHeads]=useState({}),[status,setStatus]=useState(''),[showArchived,setShowArchived]=useState(false),[selectedRecord,setSelectedRecord]=useState(null);
 const selectionEpoch=useRef(0);
 const headRow=catalog?.rows[selectedId]||heads[selectedId],archivedThings=catalog?.archivedThings||[],selected=selectedRecord?.thing.thingId===selectedId?selectedRecord.thing:registry.entries.find(t=>t.thingId===selectedId)||archivedThings.find(t=>t.thingId===selectedId),historical=!!selected&&!!headRow&&selected.revisionId!==headRow.currentHead,target=selected?{kind:'thing',thingId:selected.thingId,observedRevisionId:selected.revisionId}:null;
 const visible=[...registry.entries,...(showArchived?archivedThings:[])].filter(t=>(filter==='all'||t.kind===filter)&&(search.trim()===''||[t.title,t.summary,...t.tags].join(' ').toLowerCase().includes(search.trim().toLowerCase())));
 useEffect(()=>{
  const controller=new AbortController();let live=true;
  client.request('/things?limit=200',{signal:controller.signal}).then(result=>{if(live){setHeads(Object.fromEntries(result.things.map(row=>[row.thing.thingId,row])));}}).catch(error=>{if(live&&error.name!=='AbortError')setStatus('Discussion connection unavailable. You can still browse the source library.');});
  return()=>{live=false;controller.abort();};
 },[client,registry]);
 useEffect(()=>{selectionEpoch.current++;if(selectedId)refreshHead(selectedId).catch(()=>{});return()=>{selectionEpoch.current++;};},[selectedId]);
 async function refreshHead(thingId){const head=await client.request('/things/'+encodeURIComponent(thingId));setHeads(previous=>({...previous,[thingId]:head}));await catalog?.accept(head.thing,head);}
 async function inspectRevision(row){const epoch=selectionEpoch.current;const exact=await client.request('/things/'+encodeURIComponent(row.thing.thingId)+'/revisions/'+encodeURIComponent(row.thing.revisionId));await catalog?.ensure([{thingId:exact.thing.thingId,revisionId:exact.thing.revisionId}]);if(epoch===selectionEpoch.current)setSelectedRecord(exact);}
 return <section className="living-light-things" aria-label="Tunnel and Location library">
  <LivingLightPortablePanel key="portable-library" root={selected?{kind:"thing",id:selected.thingId,revision:selected.revisionId}:null} onImported={()=>catalog?.refresh()}/>
  <div className="living-light-library-heading"><div><h4>Tunnels & Locations</h4><p>{catalog?.sourceCount||registry.entries.filter(t=>!t.derivedFrom).length} source definitions · {registry.entries.filter(t=>t.derivedFrom).length} loaded presets · saved notes stay with each identity across songs.</p></div><label>Search things <input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Cathedral, cloud, electric…"/></label></div>
  {catalog&&<label><input type="checkbox" checked={showArchived} onChange={event=>setShowArchived(event.target.checked)}/> Show archived Cards ({archivedThings.length} loaded)</label>}
  <div className="living-light-library-filters" aria-label="Thing filters">{[['all','All things'],['tunnel','Tunnels'],['location','Locations']].map(([value,text])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{text}</button>)}<span>{visible.length} shown</span></div>
  <div className="living-light-library">{visible.map(thing=><article key={thing.thingId} className={'living-light-card'+(selectedId===thing.thingId?' selected':'')}>
   <div className={'living-light-card-still '+thing.kind} aria-label="Still preview not yet captured"><span>{thing.kind==='location'?'◇':'◎'}</span><small>Preview not yet captured</small></div>
   <small>{label(thing)} · {thing.readiness.state==='preview-ready'?'Preview ready':'Awaiting visual qualification'}</small><h5>{thing.title}</h5><p>{thing.summary}</p><p>{(catalog?.rows[thing.thingId]||heads[thing.thingId])?.noteCount!==undefined?(catalog?.rows[thing.thingId]||heads[thing.thingId]).noteCount+' notes':'Notes not loaded'}{catalog?.rows[thing.thingId]?.visibility?.archived?' · Archived':''}</p>
   <div className="living-light-card-actions"><button type="button" aria-pressed={selectedId===thing.thingId} onClick={()=>{selectionEpoch.current++;setSelectedRecord(null);setSelectedId(thing.thingId);}}>Inspect & notes</button><button type="button" disabled={!!catalog?.rows[thing.thingId]?.visibility?.archived} onClick={()=>onAdd?.(thing)}>Add to recipe</button>{thing.variantKind==='continuous-profile'&&<button type="button" disabled={!!catalog?.rows[thing.thingId]?.visibility?.archived} onClick={()=>onUse?.(thing)}>Study this Tunnel</button>}</div>
  </article>)}</div>
  {catalog&&<div className="living-light-card-actions"><button type="button" disabled={catalog.busy} onClick={()=>catalog.refresh().catch(()=>{})}>Reload saved presets</button>{catalog.nextOffset!==null&&<button type="button" disabled={catalog.busy} onClick={()=>catalog.refresh(catalog.nextOffset).catch(()=>{})}>More saved presets</button>}<p role="status">{catalog.status}</p></div>}
  {visible.length===0&&<p>No matching things. Try another name or filter.</p>}
  {selected&&<aside className="living-light-thing-inspector" aria-label={selected.title+' details and notes'}>
   <header><div><small>{label(selected)}</small><h4>{selected.title}</h4></div><button type="button" onClick={()=>{selectionEpoch.current++;setSelectedRecord(null);setSelectedId(null);}}>Close details</button></header>
   <p role="status">{status}</p>{historical&&<p>Inspecting retained revision {selectedRecord?.revisionNumber}. The latest Card and recipe drafts are unchanged. <button type="button" onClick={()=>setSelectedRecord(null)}>View latest Thing revision</button></p>}<p>Defaults in this revision: {Object.entries(selected.parameters).map(([key,def])=>key+' '+JSON.stringify(def.default)+' '+def.units).join(' · ')||'No exposed controls'}</p><button type="button" disabled={!!headRow?.visibility?.archived} onClick={()=>onAdd?.(selected)}>Add this exact revision to recipe</button>
   {headRow&&!historical&&<LivingLightVisibilityControls key={"visibility:"+selectedId} row={headRow} onSaved={async row=>{await catalog?.accept(row.thing,row);setHeads(previous=>({...previous,[selectedId]:row}));}}/>}
   <LivingLightThingHistory key={"history:"+selectedId} thingId={selectedId} onInspect={inspectRevision}/>
   <p>{selected.summary}</p>{selected.derivedFrom&&<p>Preset of {registry.resolveThing(selected.derivedFrom)?.title||selected.derivedFrom.thingId} · exact parent {selected.derivedFrom.revisionId}. Notes were not copied.</p>}{selected.aliasOf&&<p>This retains a separate identity and notes as an alias of {registry.resolveThing(selected.aliasOf)?.title||selected.aliasOf.thingId}.</p>}
   <details><summary>Source, identity & credits</summary><p>{selected.source.attribution}</p><p>{selected.source.rights}</p><code>{selected.thingId}</code><p>Revision {selected.revisionId} · {(selectedRecord||headRow)?.actor?.kind==='agent'?'Agent author':(selectedRecord||headRow)?.actor?.kind==='human'?'Local operator author':'Source definition'} · Card custody {headRow?.custody?.state||'not-created'} · publication not acknowledged</p></details>
   <p>These notes apply to {selected.title} wherever it is used.</p>
   {headRow?.usedIn?.length>0&&<details><summary>Used in saved recipes</summary>{headRow.usedIn.map(row=><p key={row.journeyId}>{row.title}</p>)}</details>}
   <LivingLightPresetPanel key={selected.thingId+':create:'+selected.revisionId} thing={selected} onSaved={()=>{setStatus('Preset saved locally; source settings and old recipes are retained.');return refreshHead(selected.thingId);}}/>{selected.derivedFrom&&!historical&&<LivingLightPresetPanel key={selected.thingId+':revise:'+selected.revisionId} thing={selected} mode="revise" onSaved={()=>{setStatus('Preset saved locally; source settings and old recipes are retained.');return refreshHead(selected.thingId);}}/>}
   <LivingLightNotes key={"notes:"+selected.thingId} target={target} label={selected.title} onChanged={()=>refreshHead(selected.thingId)}/>

  </aside>}
  {!selected&&status&&<p role="status">{status}</p>}
 </section>;
}
