import {canonicalJSON} from '../domain/living-light-contracts.js';
import {sampleLivingLightMusicRole} from '../domain/living-light-music-response.js';
/** Extend the supplied articulation owner. Each response bank is built in Song
 * time; authored travel keeps Journey time. No model, audio or frame integrator. */
export function createNativeMusicResponse({native,bank,journey,songTimeUs,evaluateArticulation=native.HapaArticulation.evaluate,maxBytes=96*1024**2}){
 const original=evaluateArticulation,entries=new Map(),known=new Set(bank.assets().map(a=>a.assetId));let disposed=false;
 const responseAt=time=>{const us=Math.round(time*1e6),row=journey.schedule.find(r=>us>=r.startUs&&us<r.endUs)||(us===journey.schedule.at(-1).endUs?journey.schedule.at(-1):null);return journey.instances.find(i=>i.instanceId===row?.instanceId)?.musicResponse;};
 const sample=(response,role,feature,time)=>sampleLivingLightMusicRole(bank,response,role,feature,Math.max(0,Math.min(bank.identity.durationUs,Math.round(time*1e6))),known);
 const mapped=(response,role,feature,time)=>{
  if(!response.roles[role]||!['energy','onset','low','mid','high'].includes(feature))return {value:null,availability:'missing',sourceAssetId:null,confidence:null};
  const r=sample(response,role,feature,time);
  return {...r,availability:r.availability==='silent'?'present':r.availability,sourceAssetId:canonicalJSON(r.fallback?[{kind:'master'}]:r.sourceRefs),confidence:null};
 };
 function entry(response){
  const key=canonicalJSON(response);if(entries.has(key)){const value=entries.get(key);entries.delete(key);entries.set(key,value);return value;}
  const roles=Object.keys(response.roles),duration=bank.identity.durationUs/1e6,bytes=(Math.ceil(duration*60)+1)*(roles.length*native.HapaArticulation.fields.length*4+12);
  if(bytes>maxBytes)throw Error('Musical movement exceeds its bounded native response memory.');
  while(entries.size&&(entries.size>=2||[...entries.values()].reduce((n,e)=>n+e.bytes,0)+bytes>maxBytes)){const [old,e]=entries.entries().next().value;native.HapaArticulation.invalidate(e.cache);entries.delete(old);}
  const score={id:journey.songId,duration,fps:30,stems:roles.map(id=>({id,features:{},availability:'present',sha256:canonicalJSON(response.roles[id].sourceRefs),events:[]})),master:'AA==',travel:[]};
  const cache=new native.HapaCore.FeatureCache(score);cache.get=(role,feature,t)=>mapped(response,role,feature,t);cache.level=t=>bank.sample('master','energy',Math.min(bank.identity.durationUs,Math.round(t*1e6))).value||0;
  const value={cache,bytes};entries.set(key,value);return value;
 }
 return {
  active:time=>!!responseAt(time),
  blocked:time=>{const response=responseAt(time);return response?Object.keys(response.roles).some(role=>sample(response,role,'energy',songTimeUs(time)/1e6).state==='blocked'):false;},
  get(role,feature,visualTime){if(disposed)throw Error('Released music response');const response=responseAt(visualTime);return response?mapped(response,role,feature,songTimeUs(visualTime)/1e6):null;},
  evaluate(cache,state,visualTime){if(disposed)throw Error('Released music response');const response=responseAt(visualTime);if(!response)return original(cache,state,visualTime);const selected=entry(response),time=songTimeUs(visualTime)/1e6;
   const frame=original(selected.cache,{...state,stems:Object.fromEntries(Object.keys(response.roles).map(role=>[role,{visual:true,strength:1}]))},time);
   // The source extractor has no pan/width/brightness measurements. Do not
   // let inherited missing-pan defaults create an apparent stereo position.
   for(const signal of Object.values(frame.signals)){signal.pan=0;signal.width=0;signal.brightness=0;}
   frame.musicResponse={schemaVersion:response.schemaVersion,preset:response.preset,intensity:response.intensity,songTimeUs:Math.round(time*1e6),roles:Object.fromEntries(Object.keys(response.roles).map(role=>[role,sample(response,role,'energy',time)])),events:'unavailable; envelope choreography only'};return frame;
  },
  diagnostics(){return {banks:entries.size,bytes:[...entries.values()].reduce((n,e)=>n+e.bytes,0),limitBytes:maxBytes,events:'unavailable'};},
  dispose(){if(disposed)return;disposed=true;for(const e of entries.values())native.HapaArticulation.invalidate(e.cache);entries.clear();}
 };
}
