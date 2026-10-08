import LivingLightPortablePanel from './LivingLightPortablePanel.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import LivingLightNotes from './LivingLightNotes.jsx';
import LivingLightPresetPanel from './LivingLightPresetPanel.jsx';
import LivingLightThingHistory from './LivingLightThingHistory.jsx';
import LivingLightVisibilityControls from './LivingLightVisibilityControls.jsx';
import {useLivingLightRegistry} from './LivingLightRegistryProvider.jsx';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {livingLightLibraryCards,filterLivingLightLibrary} from '../domain/living-light-library.js';
import useLivingLightJourneyLibrary from './useLivingLightJourneyLibrary.js';
import LivingLightJourneyInspector from './LivingLightJourneyInspector.jsx';
import LivingLightCardStill from './LivingLightCardStill.jsx';

const label=thing=>thing.kind==='location'?'Location':thing.variantKind==='continuous-profile'?'Continuous Tunnel':'Bridge Tunnel';

/** Catalog and discussion consume one metadata service; tiles allocate no GL/audio. */
export default function LivingLightLibrary({registry:sourceRegistry,onUse,onAdd,songId,journeyRefreshToken,onOpenJourney,stillCache,stillVersion}){
 const catalog=useLivingLightRegistry(),registry=catalog?.registry||sourceRegistry;
 const client=useMemo(()=>createLivingLightClient(),[]),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[selectedId,setSelectedId]=useState(null),[heads,setHeads]=useState({}),[status,setStatus]=useState(''),[showArchived,setShowArchived]=useState(false),[selectedRecord,setSelectedRecord]=useState(null);
 const selectionEpoch=useRef(0);
 const journeys=useLivingLightJourneyLibrary(songId,journeyRefreshToken),[readiness,setReadiness]=useState('all'),[tag,setTag]=useState('all'),[journeyRef,setJourneyRef]=useState(null);
 const headRow=catalog?.rows[selectedId]||heads[selectedId],archivedThings=catalog?.archivedThings||[],selected=selectedRecord?.thing.thingId===selectedId?selectedRecord.thing:registry.entries.find(t=>t.thingId===selectedId)||archivedThings.find(t=>t.thingId===selectedId),historical=!!selected&&!!headRow&&selected.revisionId!==headRow.currentHead,target=selected?{kind:'thing',thingId:selected.thingId,observedRevisionId:selected.revisionId}:null;
 const cards=livingLightLibraryCards({things:[...registry.entries,...(showArchived?archivedThings:[])],thingRows:{...heads,...catalog?.rows},journeys:journeys.rows}),visible=filterLivingLightLibrary(cards,{kind:filter,search,readiness,tag}),tags=[...new Set(cards.flatMap(card=>card.tags))].sort();
 useEffect(()=>{setJourneyRef(null);},[songId]);
 function inspectJourney(reference){selectionEpoch.current++;setSelectedId(null);setSelectedRecord(null);setJourneyRef(reference);}
 useEffect(()=>{if(journeyRefreshToken)catalog?.refresh().catch(()=>{});},[journeyRefreshToken]);
 useEffect(()=>{
  const controller=new AbortController();let live=true;
  client.request('/things?limit=200',{signal:controller.signal}).then(result=>{if(live){setHeads(Object.fromEntries(result.things.map(row=>[row.thing.thingId,row])));}}).catch(error=>{if(live&&error.name!=='AbortError')setStatus('Discussion connection unavailable. You can still browse the source library.');});
  return()=>{live=false;controller.abort();};
 },[client,registry]);
 useEffect(()=>{selectionEpoch.current++;if(selectedId)refreshHead(selectedId).catch(()=>{});return()=>{selectionEpoch.current++;};},[selectedId]);
 async function refreshHead(thingId){const head=await client.request('/things/'+encodeURIComponent(thingId));setHeads(previous=>({...previous,[thingId]:head}));await catalog?.accept(head.thing,head);}
 async function inspectRevision(row){const epoch=selectionEpoch.current;const exact=await client.request('/things/'+encodeURIComponent(row.thing.thingId)+'/revisions/'+encodeURIComponent(row.thing.revisionId));await catalog?.ensure([{thingId:exact.thing.thingId,revisionId:exact.thing.revisionId}]);if(epoch===selectionEpoch.current)setSelectedRecord(exact);}
 return <section className="living-light-things" aria-label="Tunnel, Location and Journey library">
  <LivingLightPortablePanel key="portable-library" root={selected?{kind:"thing",id:selected.thingId,revision:selected.revisionId}:null} onImported={()=>Promise.all([catalog?.refresh(),journeys.refresh()])}/>
  <div className="living-light-library-heading"><div><h4>Tunnels, Locations & Journeys</h4><p>{catalog?.sourceCount||registry.entries.filter(t=>!t.derivedFrom).length} source definitions · {registry.entries.filter(t=>t.derivedFrom).length} loaded presets · {journeys.rows.length} loaded recipes for this song. Saved notes stay with each identity.</p></div><label>Search Cards <input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Cathedral, cloud, recipe…"/></label></div>
  {catalog&&<label><input type="checkbox" checked={showArchived} onChange={event=>setShowArchived(event.target.checked)}/> Show archived Cards ({archivedThings.length} loaded)</label>}
  <div className="living-light-library-filters" aria-label="Card filters">{[['all','All Cards'],['tunnel','Tunnels'],['location','Locations'],['journey','Journeys']].map(([value,text])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{text}</button>)}<label>Readiness <select aria-label="Card readiness" value={readiness} onChange={event=>setReadiness(event.target.value)}><option value="all">Any readiness</option><option value="preview-ready">Preview ready</option><option value="awaiting">Awaiting qualification</option></select></label><label>Tag <select aria-label="Card tag" value={tag} onChange={event=>setTag(event.target.value)}><option value="all">Any tag</option>{tags.map(value=><option key={value} value={value}>{value}</option>)}</select></label><span>{visible.length} loaded Cards shown</span></div>
  <div className="living-light-library">{visible.map(card=>card.kind==='journey'?<article key={card.key} className={'living-light-card'+(journeyRef?.journeyId===card.row.journey.journeyId?' selected':'')}>
   <LivingLightCardStill key={card.row.journey.revisionId+':'+stillVersion} still={stillCache?.get({kind:'journey',id:card.row.journey.journeyId,revision:card.row.journey.revisionId})} kind="journey" title={card.title}/>
   <small>Journey · Awaiting visual qualification</small><h5>{card.title}</h5><p>{card.summary}</p><p>{card.noteCount===null?'Notes not loaded':card.noteCount+' notes'}</p><p className="living-light-card-source">{card.source}</p>
   <div className="living-light-card-actions"><button type="button" aria-pressed={journeyRef?.journeyId===card.row.journey.journeyId} onClick={()=>inspectJourney(card.row.journey)}>Inspect & notes</button><button type="button" disabled={journeys.busy} onClick={()=>onOpenJourney?.(card.row)}>Open saved recipe</button></div>
  </article>:(()=>{const thing=card.thing;return <article key={card.key} className={'living-light-card'+(selectedId===thing.thingId?' selected':'')}>
   <LivingLightCardStill key={thing.revisionId+':'+stillVersion} still={stillCache?.get({kind:'thing',id:thing.thingId,revision:thing.revisionId})} kind={thing.kind} title={thing.title}/>
   <small>{label(thing)} · {thing.readiness.state==='preview-ready'?'Preview ready':'Awaiting visual qualification'}</small><h5>{thing.title}</h5><p>{thing.summary}</p><p>{(catalog?.rows[thing.thingId]||heads[thing.thingId])?.noteCount!==undefined?(catalog?.rows[thing.thingId]||heads[thing.thingId]).noteCount+' notes':'Notes not loaded'}{catalog?.rows[thing.thingId]?.visibility?.archived?' · Archived':''}</p>
   <p className="living-light-card-source">{card.source}</p>
   {card.usedIn.length>0&&<details><summary>Used in {card.usedIn.length} saved recipes</summary>{card.usedIn.map(row=><p key={row.journeyId}><button type="button" onClick={()=>inspectJourney(row)}>{row.title}</button></p>)}</details>}
   <div className="living-light-card-actions"><button type="button" aria-pressed={selectedId===thing.thingId} onClick={()=>{selectionEpoch.current++;setJourneyRef(null);setSelectedRecord(null);setSelectedId(thing.thingId);}}>Inspect & notes</button><button type="button" disabled={!!catalog?.rows[thing.thingId]?.visibility?.archived} onClick={()=>onAdd?.(thing)}>Add to recipe</button>{onUse&&<button type="button" disabled={!!catalog?.rows[thing.thingId]?.visibility?.archived} onClick={()=>onUse?.(thing)}>Study reference</button>}</div>
  </article>;})())}</div>
  <div className="living-light-card-actions"><button type="button" disabled={journeys.busy} onClick={()=>journeys.refresh()}>Reload Journey Cards</button>{journeys.nextOffset!==null&&<button type="button" disabled={journeys.busy} onClick={()=>journeys.refresh(journeys.nextOffset)}>More Journey Cards</button>}<p role="status">{journeys.status}</p></div>
  {catalog&&<div className="living-light-card-actions"><button type="button" disabled={catalog.busy} onClick={()=>catalog.refresh().catch(()=>{})}>Reload saved presets</button>{catalog.nextOffset!==null&&<button type="button" disabled={catalog.busy} onClick={()=>catalog.refresh(catalog.nextOffset).catch(()=>{})}>More saved presets</button>}<p role="status">{catalog.status}</p></div>}
  {visible.length===0&&<p>No matching loaded Cards. Try another filter, or load the next page.</p>}
  {journeyRef&&<LivingLightJourneyInspector key={journeyRef.journeyId+':'+journeyRef.revisionId} reference={journeyRef} songId={songId} registry={registry} onClose={()=>setJourneyRef(null)} onOpen={onOpenJourney} onChanged={()=>journeys.refresh()}/>}
  {selected&&<aside className="living-light-thing-inspector" aria-label={selected.title+' details and notes'}>
   <header><div><small>{label(selected)}</small><h4>{selected.title}</h4></div><button type="button" onClick={()=>{selectionEpoch.current++;setSelectedRecord(null);setSelectedId(null);}}>Close details</button></header>
   <p role="status">{status}</p>{historical&&<p>Inspecting retained revision {selectedRecord?.revisionNumber}. The latest Card and recipe drafts are unchanged. <button type="button" onClick={()=>setSelectedRecord(null)}>View latest Thing revision</button></p>}<p>Defaults in this revision: {Object.entries(selected.parameters).map(([key,def])=>key+' '+JSON.stringify(def.default)+' '+def.units).join(' · ')||'No exposed controls'}</p><button type="button" disabled={!!headRow?.visibility?.archived} onClick={()=>onAdd?.(selected)}>Add this exact revision to recipe</button>
   {headRow&&!historical&&<LivingLightVisibilityControls key={"visibility:"+selectedId} row={headRow} onSaved={async row=>{await catalog?.accept(row.thing,row);setHeads(previous=>({...previous,[selectedId]:row}));}}/>}
   <LivingLightThingHistory key={"history:"+selectedId} thingId={selectedId} onInspect={inspectRevision}/>
   <p>{selected.summary}</p>{selected.derivedFrom&&<p>Preset of {registry.resolveThing(selected.derivedFrom)?.title||selected.derivedFrom.thingId} · exact parent {selected.derivedFrom.revisionId}. Notes were not copied.</p>}{selected.aliasOf&&<p>This retains a separate identity and notes as an alias of {registry.resolveThing(selected.aliasOf)?.title||selected.aliasOf.thingId}.</p>}
   <details><summary>Source, identity & credits</summary><p>{selected.source.attribution}</p><p>{selected.source.rights}</p><code>{selected.thingId}</code><p>Revision {selected.revisionId} · {(selectedRecord||headRow)?.actor?.kind==='agent'?'Agent author':(selectedRecord||headRow)?.actor?.kind==='human'?'Local operator author':'Source definition'} · Card custody {headRow?.custody?.state||'not-created'} · publication not acknowledged</p></details>
   <p>These notes apply to {selected.title} wherever it is used.</p>
   {headRow?.usedIn?.length>0&&<details><summary>Used in saved recipes</summary>{headRow.usedIn.map(row=><p key={row.journeyId}><button type="button" onClick={()=>inspectJourney(row)}>{row.title}</button></p>)}</details>}
   <LivingLightPresetPanel key={selected.thingId+':create:'+selected.revisionId} thing={selected} onSaved={()=>{setStatus('Preset saved locally; source settings and old recipes are retained.');return refreshHead(selected.thingId);}}/>{selected.derivedFrom&&!historical&&<LivingLightPresetPanel key={selected.thingId+':revise:'+selected.revisionId} thing={selected} mode="revise" onSaved={()=>{setStatus('Preset saved locally; source settings and old recipes are retained.');return refreshHead(selected.thingId);}}/>}
   <LivingLightNotes key={"notes:"+selected.thingId} target={target} label={selected.title} onChanged={()=>refreshHead(selected.thingId)}/>

  </aside>}
  {!selected&&status&&<p role="status">{status}</p>}
 </section>;
}
