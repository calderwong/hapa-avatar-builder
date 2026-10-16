import {useEffect,useMemo,useState} from 'react';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {resolveLivingLightMediaSources} from '../domain/living-light-media-resolution.js';
import {LIVING_LIGHT_DESTINATION_SCHEMA,livingLightRecordDestination,livingLightDestinationKey,livingLightDestinationAvailability} from '../domain/living-light-navigation.js';
import LivingLightSharedCardActions from './LivingLightSharedCardActions.jsx';
export function LivingLightDestinationEditor({value,onChange,disabled,records=[],media=[],registry}){
 const options=[...records.flatMap(record=>{const target=livingLightRecordDestination(record);return target?[{target,label:'Record · '+record.title}]:[];}),...media.map(source=>({target:{schemaVersion:LIVING_LIGHT_DESTINATION_SCHEMA,kind:'media',ref:source.ref},label:'Clip · '+source.title})),...registry.entries.map(thing=>({target:{schemaVersion:LIVING_LIGHT_DESTINATION_SCHEMA,kind:'card',ref:{kind:'thing',id:thing.thingId,revision:thing.revisionId}},label:'Card · '+thing.title}))];
 const selected=value?livingLightDestinationKey(value):'';
 return <label>What lives at this Location <select aria-label="Location destination" disabled={disabled} value={selected} onChange={event=>onChange(event.target.value?options.find(row=>livingLightDestinationKey(row.target)===event.target.value).target:null)}>
  <option value="">No destination yet</option>{value&&!options.some(row=>livingLightDestinationKey(row.target)===selected)&&<option value={selected}>Retained destination · exact saved reference</option>}{options.map(row=><option key={livingLightDestinationKey(row.target)} value={livingLightDestinationKey(row.target)}>{row.label}</option>)}
 </select></label>;
}
export default function LivingLightNavigation({map,session,frame,onEnter,onExit,onAction,onInspect,records,media,registry,sharedHandEnabled,disabled,following=false,active=true,client:injectedClient,onOpenRecord,recordVisitBusy=false}){
 const current=map?.locations.find(row=>row.id===frame?.locationId)||map?.locations[0],target=current?.target;
 const client=useMemo(()=>injectedClient||createLivingLightClient(),[injectedClient]),[lookup,setLookup]=useState(null),[retry,setRetry]=useState(0);
 const lookupKey=JSON.stringify([!!session,!!frame?.traveling,active,target,media||[]]);
 useEffect(()=>{
  if(!session||frame?.traveling||!active||target?.kind!=='media')return;
  const controller=new AbortController(),key=lookupKey;setLookup({key,state:'loading',sources:[]});
  resolveLivingLightMediaSources([target.ref],{sources:media,request:client.request,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])}).then(sources=>{if(!controller.signal.aborted)setLookup({key,state:sources.length?'ready':'unavailable',sources});}).catch(()=>{if(!controller.signal.aborted)setLookup({key,state:'unavailable',sources:[]});});
  return()=>controller.abort();
 },[lookupKey,client,retry]);
 const currentLookup=lookup?.key===lookupKey?lookup:null;
 const resolved=target?livingLightDestinationAvailability(target,{records,media:currentLookup?.sources?.length?currentLookup.sources:media,registry}):null;
 return <section className="living-light-navigation" aria-label={following?"Follow Director route":"Explore the album"}>
  <header><h4>{following?"Follow Director":"Explore the album"}</h4><p>{following?"Locations follow the saved cue and the song clock. Hold motion keeps the visible Location in place.":"Travel the tour’s tunnels and discover what lives at each Location."}</p></header>
  {!map?<p>{following?"No Location route is painted at this song time.":"Choose a Location tour and Study this recipe to open its route."}</p>:<>
   {!session?<button type="button" disabled={disabled} onClick={onEnter}>Enter this route</button>:<>
    <p role="status">{frame?.traveling?'Traveling to '+map.locations.find(row=>row.id===frame.to)?.title:'At '+current.title} · {following?"Following the Director cue.":"Explore pauses the song and keeps your cut and draft in place."}</p>
    {!following&&<div className="living-light-card-actions"><button type="button" onClick={()=>onAction('back')}>Back</button><button type="button" onClick={()=>onAction('home')}>Home</button><button type="button" disabled={!frame?.traveling} onClick={()=>onAction('stop')}>Stop travel</button><button type="button" onClick={onExit}>Return to song</button></div>}
   </>}
   <ol className="living-light-journey-strip" aria-label="Album Locations">{map.locations.map(place=><li key={place.id}><button type="button" disabled={!session||following} aria-current={session&&current.id===place.id?'location':undefined} onClick={()=>onAction('jump',place.id)}>{following?"Location":"Direct jump"} · {place.title}</button></li>)}</ol>
   {session&&!frame?.traveling&&<>
    {!following&&<div className="living-light-card-actions">{map.edges.filter(edge=>edge.from===current.id).map(edge=><button type="button" key={edge.id} onClick={()=>onAction('travel',edge.to)}>Travel {edge.title} → {map.locations.find(place=>place.id===edge.to)?.title}</button>)}</div>}
    <article className="living-light-card"><small>Location destination</small><h5>{resolved?.title||current.title}</h5>
     {!target?<p>Assign a record, clip or Card to this Location in Journey recipes, then Study it again.</p>:<>
      <p>{resolved.message||'Exact source declaration available'}</p>
      {target.kind==='record'&&resolved.record&&<>{resolved.state==='available'&&<p>{resolved.record.title} · {Math.round(resolved.record.durationSeconds)} seconds · {resolved.record.director.timelineCount} media uses</p>}<p>Cut {target.ref.cutId}</p>{onOpenRecord&&<button type="button" disabled={recordVisitBusy||!active} onClick={()=>onOpenRecord(target)}>Open this record</button>}<p>{resolved.record.rights?.notice||'Media remains with its original owner.'}</p></>}
      {target.kind==='media'&&currentLookup?.state==='loading'&&<p role="status">Loading the exact destination clip…</p>}
      {target.kind==='media'&&currentLookup?.state==='unavailable'&&<button type="button" onClick={()=>setRetry(value=>value+1)}>Retry destination clip</button>}
      {active&&target.kind==='media'&&resolved.source&&<video key={livingLightDestinationKey(target)} src={resolved.source.uri} controls muted playsInline preload="metadata" aria-label={'Destination clip · '+resolved.title} style={{width:'100%',maxHeight:240}}/>}
      {target.kind==='card'&&<><button type="button" onClick={()=>onInspect(target.ref)}>Inspect destination Card</button>{sharedHandEnabled&&<LivingLightSharedCardActions key={livingLightDestinationKey(target)} target={target.ref}/>}</>}
     </>}
     <button type="button" onClick={()=>onInspect({kind:'thing',id:current.thingRef.thingId,revision:current.thingRef.revisionId})}>Inspect this Location Card</button>
     {sharedHandEnabled&&<LivingLightSharedCardActions key={current.id+':'+current.thingRef.revisionId} target={{kind:'thing',id:current.thingRef.thingId,revision:current.thingRef.revisionId}}/>}
    </article>
   </>}
  </>}
 </section>;
}
