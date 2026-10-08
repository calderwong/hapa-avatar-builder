import {validateJourney,canonicalJSON} from './living-light-contracts.js';
import {editableJourney} from './living-light-journey.js';

/** Reference framing is authored, neutral and disposable; it is not a song edit. */
export function livingLightThingStudy({thing,registry,songId,title,durationUs}){
 const use=(value,id)=>({instanceId:id,thingRef:{thingId:value.thingId,revisionId:value.revisionId},parameters:{},bindings:{}});
 let instances=[use(thing,'reference')],schedule=[{instanceId:'reference',startUs:0,endUs:durationUs}];
 if(thing.capabilities.bridge){
  if(durationUs<3000000)throw Error('A passage reference needs at least three seconds.');
  const from=registry.entries.find(t=>t.source.moduleId==='solar-reliquary'),to=registry.entries.find(t=>t.source.moduleId==='tidal-observatory');
  if(!from||!to)throw Error('Reference Location revisions are unavailable.');
  const start=Math.floor(durationUs/4),end=durationUs-start;
  instances=[use(from,'reference-from'),use(thing,'reference'),use(to,'reference-to')];
  schedule=[{instanceId:'reference-from',startUs:0,endUs:start},{instanceId:'reference',startUs:start,endUs:end,fromInstanceId:'reference-from',toInstanceId:'reference-to',entryAnchorId:'entry',exitAnchorId:'exit'},{instanceId:'reference-to',startUs:end,endUs:durationUs}];
 }
 const journey={schemaVersion:'hapa.living-light.journey.v1',journeyId:'ll109:reference:'+songId,revisionId:'ll109:reference-draft',parentRevisionId:null,title:title||thing.title,songId,sourceBindingRef:null,state:'draft-unresolved',mode:thing.capabilities.continuous?'continuous':'tour',seed:109,instances,schedule,actorTreatment:'none',mediaSlots:[]};
 validateJourney(journey,{resolveThing:registry.resolveThing,durationUs});
 return {journey,target:{kind:'thing',id:thing.thingId,revision:thing.revisionId},referenceTimeUs:Math.floor(durationUs/2),context:thing.capabilities.bridge?'Neutral passage reference: Solar Reliquary → Tidal Observatory':'Neutral default reference'};
}

/** A dirty draft must never furnish a thumbnail for its last saved revision. */
export function livingLightSavedStudyTarget(draft,snapshot){
 if(!snapshot||canonicalJSON(editableJourney(snapshot))!==canonicalJSON(draft))return null;
 return {kind:'journey',id:snapshot.journeyId,revision:snapshot.revisionId};
}
export const livingLightStillKey=target=>JSON.stringify([target.kind,target.id,target.revision]);
/** View-local disposable cache. Neither authoring truth nor a media Card store. */
export function createLivingLightStillCache({maxEntries=64,maxBytes=8*1024*1024,maxImageBytes=256*1024}={}){
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>64||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>8*1024*1024||!Number.isSafeInteger(maxImageBytes)||maxImageBytes<1||maxImageBytes>256*1024)throw Error('Invalid still cache bounds');
 const rows=new Map();let bytes=0;
 function put(target,still){
  if(!['thing','journey'].includes(target?.kind)||typeof target.id!=='string'||typeof target.revision!=='string'||target.id.length>256||target.revision.length>256)throw Error('Exact still target required');
  if(typeof still?.dataUrl!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(still.dataUrl)||still.dataUrl.length>maxImageBytes)throw Error('A bounded PNG still is required');
  if(!still.receipt||typeof still.receipt!=='object')throw Error('A capture receipt is required');
  const receipt=structuredClone(still.receipt),size=still.dataUrl.length+new TextEncoder().encode(JSON.stringify(receipt)).byteLength;
  if(size>maxBytes)throw Error('Still exceeds cache capacity');
  const key=livingLightStillKey(target);if(rows.has(key)){bytes-=rows.get(key).bytes;rows.delete(key);}
  while(rows.size>=maxEntries||bytes+size>maxBytes){const oldest=rows.keys().next().value;bytes-=rows.get(oldest).bytes;rows.delete(oldest);}
  rows.set(key,{target:structuredClone(target),dataUrl:still.dataUrl,receipt,bytes:size});bytes+=size;
 }
 return {put,get:target=>{const row=rows.get(livingLightStillKey(target));return row?{...row,target:structuredClone(row.target),receipt:structuredClone(row.receipt)}:null;},clear:()=>{rows.clear();bytes=0;},diagnostics:()=>({entries:rows.size,bytes,maxEntries,maxBytes,maxImageBytes,persistence:'view-session-only',readinessChanged:false})};
}
