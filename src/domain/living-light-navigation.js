import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {livingLightCardTarget} from '../overcard/livingLight.js';
import {validateLivingLightMediaReferences} from './living-light-media-resolution.js';
export const LIVING_LIGHT_DESTINATION_SCHEMA='hapa.living-light.destination.v1';
const fail=message=>{throw Object.assign(Error(message),{code:'invalid_navigation_target',statusCode:422});};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))fail('Choose a supported exact destination.');};
const id=value=>typeof value==='string'&&value.trim()&&value.length<=300;
export function validateLivingLightDestination(value){
 exact(value,['schemaVersion','kind','ref']);if(value.schemaVersion!==LIVING_LIGHT_DESTINATION_SCHEMA)fail('Unsupported destination version.');
 if(value.kind==='record'){
  exact(value.ref,['songId','cutId','sourceRevision']);if(!id(value.ref.songId)||!id(value.ref.cutId)||!/^[a-f0-9]{64}$/.test(value.ref.sourceRevision))fail('Choose an exact album record declaration.');
 }else if(value.kind==='media')validateLivingLightMediaReferences([value.ref]);
 else if(value.kind==='card')livingLightCardTarget(value.ref);
 else fail('Choose an album record, clip or Living Light Card.');return value;
}
export const livingLightDestinationKey=value=>!value?'none':JSON.stringify([value.schemaVersion,value.kind,...(value.kind==='record'?[value.ref.songId,value.ref.cutId,value.ref.sourceRevision]:value.kind==='media'?[value.ref.songId,value.ref.cutId,value.ref.shotId,value.ref.mediaId,value.ref.sourceRevision]:[value.ref.kind,value.ref.id,value.ref.revision])]);
/** Reuses normalized Record Garden declarations. The hash pins metadata, not
 * video/audio bytes or a claim that a mutable source cut is immutable. */
export function livingLightRecordDestination(record){
 const cutId=record?.preview?.latestCutId||record?.director?.latestCut?.id||'legacy';
 const revision=record?.source?.revisionId,contentHash=record?.source?.contentHash,cutFingerprint=record?.preview?.cutFingerprint;
 if(!id(record?.songId)||!(revision||contentHash||cutFingerprint))return null;
 return {schemaVersion:LIVING_LIGHT_DESTINATION_SCHEMA,kind:'record',ref:{songId:record.songId,cutId,sourceRevision:bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([record.songId,cutId,revision||null,contentHash||null,cutFingerprint||null]))))}};
}
export function livingLightDestinationAvailability(target,{records=[],media=[],registry}={}){
 if(!target)return {state:'empty',message:'Choose what belongs at this Location.'};validateLivingLightDestination(target);
 if(target.kind==='record'){
  const record=records.find(row=>livingLightDestinationKey(livingLightRecordDestination(row))===livingLightDestinationKey(target));
  return record?{state:'available',record,title:record.title}:{state:'unavailable',message:'This exact album declaration is missing or changed. Reload the catalog or choose a replacement.'};
 }
 if(target.kind==='media'){
  const source=media.find(row=>livingLightDestinationKey({schemaVersion:LIVING_LIGHT_DESTINATION_SCHEMA,kind:'media',ref:row.ref})===livingLightDestinationKey(target));
  return source?{state:'available',source,title:source.title}:{state:'unavailable',message:'This exact clip is unavailable. Its saved reference is kept.'};
 }
 const thing=target.ref.kind==='thing'?registry?.resolveThing({thingId:target.ref.id,revisionId:target.ref.revision}):null;
 return thing?{state:'available',thing,title:thing.title}:{state:'unresolved',message:'Open this exact saved Card through its owner.'};
}
/** A projection of one authored route: no second route store or renderer. */
export function livingLightNavigationMap(journey,registry){
 if(journey?.mode!=='tour')throw Error('Study a Location tour to explore its route.');
 const locations=[],edges=[];const uses=new Map(journey.instances.map(item=>[item.instanceId,item]));
 for(const row of journey.schedule){
  const item=uses.get(row.instanceId),thing=registry.resolveThing(item?.thingRef);if(!thing)throw Error('A pinned route revision is unavailable.');
  if(thing.capabilities.destination){if(item.destination)validateLivingLightDestination(item.destination);locations.push({id:item.instanceId,title:thing.title,thingRef:structuredClone(item.thingRef),startUs:row.startUs,endUs:row.endUs,target:item.destination?structuredClone(item.destination):null});}
  else if(thing.capabilities.bridge)edges.push({id:item.instanceId,title:thing.title,from:row.fromInstanceId,to:row.toInstanceId,startUs:row.startUs,endUs:row.endUs});
  else throw Error('This route contains an unsupported passage.');
 }
 for(const edge of edges)if(!locations.some(row=>row.id===edge.from)||!locations.some(row=>row.id===edge.to)||edge.endUs-edge.startUs<4e6||edge.endUs-edge.startUs>60e6)throw Error('A tunnel has missing endpoints or an unsupported duration.');
 if(!locations.length)throw Error('This route has no Locations.');
 return {schemaVersion:'hapa.living-light.navigation-map.v1',journeyRef:journey.journeyId&&journey.revisionId?{journeyId:journey.journeyId,revisionId:journey.revisionId}:null,locations,edges,home:locations[0].id};
}
/** Explicit Explore clock. Sampling never changes the Echo player or draft.
 * Back/Home are direct returns; forward travel plays a complete authored bridge. */
export function createLivingLightExplorer(map,{now=()=>performance.now(),bookmark}={}){
 let current=map.home,travel=null,past=[],held=false,disposed=false;
 const location=id=>{const value=map.locations.find(row=>row.id===id);if(!value)throw Error('Choose an existing Location.');return value;};
 function sample(){
  if(disposed)throw Error('Exploration has ended.');
  if(travel){const elapsed=held?travel.elapsedUs:travel.elapsedUs+Math.max(0,now()-travel.startedMs)*1000;
   if(elapsed>=travel.edge.endUs-travel.edge.startUs){current=travel.edge.to;travel=null;}else return {locationId:current,timelineUs:Math.floor(travel.edge.startUs+elapsed),playing:!held,traveling:true,to:travel.edge.to};
  }
  return {locationId:current,timelineUs:location(current).startUs,playing:false,traveling:false};
 }
 function jump(id,remember=true){location(id);sample();if(remember&&id!==current)past=[...past.slice(-49),current];current=id;travel=null;return sample();}
 return {sample,travel(id,{reducedMotion=false}={}){sample();if(travel)throw Error('Finish or stop this passage before choosing another.');const edge=map.edges.find(row=>row.from===current&&row.to===id);if(!edge)throw Error('Choose a connected next Location, or use Direct jump.');past=[...past.slice(-49),current];if(reducedMotion){current=id;return sample();}travel={edge,elapsedUs:0,startedMs:now()};return sample();},jump,
  back(){sample();if(!past.length)return sample();const target=past.pop();return jump(target,false);},home(){return jump(map.home);},
  hold(value){if(held===value)return sample();if(travel){if(value)travel.elapsedUs+=Math.max(0,now()-travel.startedMs)*1000;travel.startedMs=now();}held=value;return sample();},
  stop(){travel=null;return sample();},end(){disposed=true;travel=null;return structuredClone(bookmark);},diagnostics:()=>({historyCount:past.length,disposed})};
}
