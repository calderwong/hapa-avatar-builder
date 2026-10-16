import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {createLivingLightRegistry} from '../living-light/registry.js';
import {extendLivingLightRegistry,createLivingLightRegistryMemo} from '../domain/living-light-preset.js';
import {canonicalJSON} from '../domain/living-light-contracts.js';
import {createLivingLightClient} from '../domain/living-light-client.js';
const Context=createContext(null);
export const useLivingLightRegistry=()=>useContext(Context);
/** Source entries remain immutable. Heads and pinned historical revisions are separate. */
export default function LivingLightRegistryProvider({children,base}){
 const source=useMemo(()=>base||createLivingLightRegistry(),[base]),client=useMemo(()=>createLivingLightClient(),[]),records=useRef(new Map()),heads=useRef(new Map()),metadata=useRef(new Map()),alive=useRef(true),pageEpoch=useRef(0);
 const [registry,setRegistry]=useState(source),[rows,setRows]=useState({}),[nextOffset,setNextOffset]=useState(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('Loading saved presets…');
 const registryMemo=useMemo(()=>createLivingLightRegistryMemo(),[]);
 function effectiveRegistry(){return registryMemo(source,[...heads.current.values()],[...records.current.values()],{hiddenThingIds:[...metadata.current.values()].filter(row=>row.visibility?.archived).map(row=>row.thing.thingId)});}
 function publish(){if(alive.current){setRegistry(effectiveRegistry());setRows(Object.fromEntries(metadata.current));}}
 async function retain(things){
  const fetched=new Map(),visiting=new Set();let count=0;
  async function get(thing,depth=0){
   if(!thing.thingId.startsWith('ll-preset:')){const admitted=source.resolveThing({thingId:thing.thingId,revisionId:thing.revisionId});if(!admitted||canonicalJSON(admitted)!==canonicalJSON(thing))throw Error('Source definition differs from the local registry');return;}
   const key=thing.thingId+'@'+thing.revisionId;const old=records.current.get(key)||fetched.get(key);if(old){if(canonicalJSON(old)!==canonicalJSON(thing))throw Error('A retained preset revision changed');return;}
   if(depth>32||++count>400||visiting.has(key))throw Error('Preset lineage exceeds the bounded lookup or contains a cycle');visiting.add(key);
   const ref=thing.derivedFrom;if(!ref)throw Error('Preset parent is missing');
   const parentKey=ref.thingId+'@'+ref.revisionId;
   if(!source.resolveThing(ref)&&!records.current.has(parentKey)&&!fetched.has(parentKey))await get((await client.request('/things/'+encodeURIComponent(ref.thingId)+'/revisions/'+encodeURIComponent(ref.revisionId))).thing,depth+1);
   fetched.set(key,thing);visiting.delete(key);
  }
  for(const thing of things)await get(thing);
  if(!alive.current)return;
  const merged=new Map([...records.current,...fetched]);extendLivingLightRegistry(source,[],[...merged.values()]);records.current=merged;
 }
 async function ensure(refs){
  const unique=new Map(refs.map(ref=>[ref.thingId+'@'+ref.revisionId,ref]));if(unique.size>100)throw Error('Too many pinned references');
  const things=[];for(const [key,ref]of unique)if(!source.resolveThing(ref)&&!records.current.has(key))things.push((await client.request('/things/'+encodeURIComponent(ref.thingId)+'/revisions/'+encodeURIComponent(ref.revisionId))).thing);
  await retain(things);publish();return effectiveRegistry();
 }
 async function refresh(offset=0){
  const epoch=++pageEpoch.current;setBusy(true);setStatus('Loading saved presets…');
  try{const page=await client.request('/things?includeArchived=true&limit=100&offset='+offset);await retain(page.things.map(row=>row.thing));if(!alive.current||epoch!==pageEpoch.current)return;
   if(!offset){heads.current=new Map();metadata.current=new Map();}for(const row of page.things){metadata.current.set(row.thing.thingId,row);if(row.thing.thingId.startsWith('ll-preset:'))heads.current.set(row.thing.thingId,row.thing);}
   publish();setNextOffset(page.nextOffset);setStatus('');
  }catch(error){if(alive.current&&epoch===pageEpoch.current)setStatus('Saved presets could not load: '+error.message);throw error;}finally{if(alive.current&&epoch===pageEpoch.current)setBusy(false);}
 }
 async function accept(thing,row){
  pageEpoch.current++;await retain([thing]);if(!alive.current)return;
  const previous=metadata.current.get(thing.thingId),newerDefinition=!previous||Number(row?.revisionNumber||1)>=Number(previous.revisionNumber||1);
  const retainedThing=newerDefinition?thing:previous.thing;
  const visibility=Number(row?.visibility?.revisionNumber||0)>=Number(previous?.visibility?.revisionNumber||0)?row?.visibility:previous?.visibility;
  if(retainedThing.thingId.startsWith('ll-preset:'))heads.current.set(retainedThing.thingId,retainedThing);
  metadata.current.set(thing.thingId,{...previous,...(newerDefinition?row:{}),thing:retainedThing,...(visibility?{visibility}:{})});
  publish();setBusy(false);setStatus('');
 }

 useEffect(()=>{alive.current=true;refresh().catch(()=>{});return()=>{alive.current=false;pageEpoch.current++;};},[source]);
 return <Context.Provider value={{registry,rows,archivedThings:Object.values(rows).filter(row=>row.visibility?.archived).map(row=>row.thing),sourceCount:source.entries.length,ensure,accept,refresh,nextOffset,busy,status}}>{children}</Context.Provider>;
}
