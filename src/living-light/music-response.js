import {canonicalJSON} from '../domain/living-light-contracts.js';
import {sampleLivingLightMusicRole,createLivingLightMusicSampler} from '../domain/living-light-music-response.js';
import {musicOnsetEvents,MUSIC_ONSET_BASIS} from './music-onsets.js';
/** Extend the supplied articulation owner. Each response bank is built in Song
 * time; authored travel keeps Journey time. No model, audio or frame integrator. */
export function createNativeMusicResponse({native,bank,journey,songTimeUs,evaluateArticulation=native.HapaArticulation.evaluate,maxBytes=96*1024**2}){
 const original=evaluateArticulation,entries=new Map(),known=new Set(bank.assets().map(a=>a.assetId));let disposed=false;
 const scheduleAt=time=>{const us=Math.round(time*1e6);return journey.schedule.find(r=>us>=r.startUs&&us<r.endUs)||(us===journey.schedule.at(-1).endUs?journey.schedule.at(-1):null);};
 const responseAt=time=>journey.instances.find(i=>i.instanceId===scheduleAt(time)?.instanceId)?.musicResponse;
 const sample=(response,role,feature,time)=>sampleLivingLightMusicRole(bank,response,role,feature,Math.max(0,Math.min(bank.identity.durationUs,Math.round(time*1e6))),known);
 const samplers=new WeakMap();
 const mapped=(response,role,feature,time)=>{
  if(!samplers.has(response))samplers.set(response,createLivingLightMusicSampler(bank,response));
  const r=samplers.get(response)(role,feature,Math.max(0,Math.min(bank.identity.durationUs,Math.round(time*1e6))));
  return {...r,availability:r.availability==='silent'?'present':r.availability};
 };
 function entry(response){
  const key=canonicalJSON(response);if(entries.has(key)){const value=entries.get(key);entries.delete(key);entries.set(key,value);return value;}
  const roles=Object.keys(response.roles),duration=bank.identity.durationUs/1e6;
  // Include a conservative event budget in addition to native typed arrays.
  const bytes=(Math.ceil(duration*60)+1)*(roles.length*native.HapaArticulation.fields.length*4+12)+roles.length*Math.ceil(duration/.12)*256;
  if(bytes>maxBytes)throw Error('Musical movement exceeds its bounded native response memory.');
  while(entries.size&&(entries.size>=2||[...entries.values()].reduce((n,e)=>n+e.bytes,0)+bytes>maxBytes)){const [old,e]=entries.entries().next().value;native.HapaArticulation.invalidate(e.cache);entries.delete(old);}
  const score={id:journey.songId,duration,fps:30,stems:roles.map(id=>({id,features:{},availability:'present',sha256:canonicalJSON(response.roles[id].sourceRefs),events:musicOnsetEvents(t=>mapped(response,id,'onset',t),duration)})),master:'AA==',travel:[]};
  const cache=new native.HapaCore.FeatureCache(score);cache.get=(role,feature,t)=>mapped(response,role,feature,t);cache.level=t=>bank.sample('master','energy',Math.min(bank.identity.durationUs,Math.round(t*1e6))).value||0;
  const value={cache,bytes,mappedKey:null,mappedStems:null};entries.set(key,value);return value;
 }
 return {
  active:time=>!!responseAt(time),
  blocked:time=>{const response=responseAt(time);return response?Object.keys(response.roles).some(role=>sample(response,role,'energy',songTimeUs(time)/1e6).state==='blocked'):false;},
  get(role,feature,visualTime){if(disposed)throw Error('Released music response');const response=responseAt(visualTime);return response?mapped(response,role,feature,songTimeUs(visualTime)/1e6):null;},
  // Native water/other event consumers use Journey coordinates. Keep their
  // score separate from the Song-time articulation score; never shift audio.
  eventStems(visualTime){
   if(disposed)throw Error('Released music response');const response=responseAt(visualTime);if(!response)return [];
   const selected=entry(response),offsetUs=songTimeUs(visualTime)-Math.round(visualTime*1e6),row=scheduleAt(visualTime);
   const key=offsetUs+':'+row.instanceId;
   if(selected.mappedKey!==key){
    selected.mappedKey=key;selected.mappedStems=selected.cache.score.stems.map(stem=>({...stem,events:stem.events.map(event=>({...event,time:event.time-offsetUs/1e6})).filter(event=>event.time>=row.startUs/1e6&&event.time<row.endUs/1e6)}));
   }
   return selected.mappedStems;
  },
  evaluate(cache,state,visualTime){if(disposed)throw Error('Released music response');const response=responseAt(visualTime);if(!response)return original(cache,state,visualTime);const selected=entry(response),time=songTimeUs(visualTime)/1e6;
   const frame=original(selected.cache,{...state,stems:Object.fromEntries(Object.keys(response.roles).map(role=>[role,{visual:true,strength:1}]))},time);
   // The source extractor has no pan/width/brightness measurements. Do not
   // let inherited missing-pan defaults create an apparent stereo position.
   for(const signal of Object.values(frame.signals)){signal.pan=0;signal.width=0;signal.brightness=0;}
   frame.musicResponse={schemaVersion:response.schemaVersion,preset:response.preset,intensity:response.intensity,songTimeUs:Math.round(time*1e6),roles:Object.fromEntries(Object.keys(response.roles).map(role=>[role,sample(response,role,'energy',time)])),events:{basis:MUSIC_ONSET_BASIS,counts:Object.fromEntries(selected.cache.score.stems.map(s=>[s.id,s.events.length]))}};return frame;
  },
  diagnostics(){return {banks:entries.size,bytes:[...entries.values()].reduce((n,e)=>n+e.bytes,0),limitBytes:maxBytes,events:MUSIC_ONSET_BASIS};},
  dispose(){if(disposed)return;disposed=true;for(const e of entries.values())native.HapaArticulation.invalidate(e.cache);entries.clear();}
 };
}
