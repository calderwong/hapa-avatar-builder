import {echoLivingLightCueAt,validateEchoLivingLightCues,resolveEchoLivingLightCue} from '../domain/echo-living-light-cues.js';
import {createLivingLightRuntime} from './runtime.js';

/** One native renderer on Echo's clock. Only current/next exact recipes are
 * retained; prefetch never creates graphics, decoders or another audio clock. */
export function createEchoLivingLightPreview({canvas,cues,songId,durationUs,resolveJourney,resolveRegistry,resolveMedia=async()=>mediaSources,prepareInput=()=>({neutralStudy:true}),mediaSources=[],runtimeFactory=createLivingLightRuntime,onState=()=>{},onInvalidate=()=>{}}){
 const ordered=structuredClone(validateEchoLivingLightCues(cues,{songId,durationUs})).sort((a,b)=>a.window.startUs-b.window.startUs);
 let disposed=false,suspended=false,runtime=null,activeKey=null,generation=0,lastState='',activeCue=null;
 const failures=new Map(),entries=new Map(),key=cue=>JSON.stringify(cue.journeyRef);
 const publish=value=>{const signature=JSON.stringify(value);if(!disposed&&signature!==lastState){lastState=signature;onState(value);}};
 const drop=()=>{runtime?.dispose();runtime=null;activeKey=null;};
 function retain(wanted){
  const keys=new Set(wanted.map(key));
  for(const [id,entry]of entries)if(!keys.has(id)){entry.controller.abort();entries.delete(id);}
  for(const cue of wanted){const id=key(cue);if(entries.has(id))continue;
   const controller=new AbortController(),entry={controller};entries.set(id,entry);
   Promise.resolve().then(()=>resolveJourney(cue.journeyRef,{signal:controller.signal})).then(async record=>{
    if(disposed||controller.signal.aborted)return;
    const journey=resolveEchoLivingLightCue(cue,{resolveJourney:()=>record});
    const registry=await resolveRegistry(journey,{signal:controller.signal});
    const sources=await resolveMedia(journey,{signal:controller.signal});
    if(disposed||controller.signal.aborted)return;
    entry.journey=journey;entry.registry=registry;entry.sources=sources;onInvalidate();
   }).catch(error=>{if(disposed||controller.signal.aborted)return;entry.error=error;onInvalidate();});
  }
 }
 function evaluate(input={}){
  if(disposed||suspended)return null;
  const hit=echoLivingLightCueAt(ordered,input.timelineUs);activeCue=hit?.cue||null;
  const next=ordered.find(cue=>cue.window.startUs>(hit?.cue.window.startUs??input.timelineUs));
  retain([...(hit?[hit.cue]:[]),...(next?[next]:[])]);
  if(!hit){drop();publish({state:'inactive',cueId:null});return null;}
  const {cue,songUs,journeyUs}=hit,id=key(cue),entry=entries.get(id),useKey=cue.cueId+':'+id;
  if(activeKey!==useKey)drop();
  if(failures.has(useKey)){publish({state:'unavailable',cueId:cue.cueId,message:failures.get(useKey).message});return null;}
  if(entry.error){publish({state:'unavailable',cueId:cue.cueId,message:entry.error.message});return null;}
  if(!entry.journey){publish({state:'loading',cueId:cue.cueId,message:'Loading the exact saved Journey…'});return null;}
  try{
   if(!runtime){
    // Every use gets its own window validation, even if two uses share a revision.
    const journey=resolveEchoLivingLightCue(cue,{resolveJourney:()=>entry.journey});
    const options=prepareInput(journey);
    runtime=runtimeFactory({canvas,registry:entry.registry,mediaSources:entry.sources,onMediaChange:()=>queueMicrotask(()=>{if(!disposed)onInvalidate();})});
    runtime.prepare({...options,journeyRevision:journey,journeyDurationUs:journey.schedule.at(-1).endUs,sourceBinding:{...options.sourceBinding,songId,durationUs},generation:++generation});activeKey=useKey;
   }
   const packet=runtime.evaluate({...input,timelineUs:journeyUs,signalTimelineUs:songUs});
   return packet?{...packet,directorCueId:cue.cueId,directorSongUs:songUs}:null;
  }catch(error){drop();failures.set(useKey,error);publish({state:'unavailable',cueId:cue.cueId,message:error.message});return null;}
 }
 function render(packet){
  if(disposed||suspended||!runtime||packet?.directorCueId!==activeCue?.cueId)return false;
  try{
   const painted=runtime.render(packet),diagnostic=runtime.diagnostics(),media=diagnostic.media||[];
   const waiting=media.filter(row=>row.status!=='ready'||!row.paintReady);
   publish({state:painted?'ready':'unavailable',cueId:activeCue.cueId,role:activeCue.role,message:!painted?'Selected audio choices are unavailable.':waiting.length?'Journey active · painted clips: '+waiting.map(row=>row.message).join(' · '):diagnostic.features==='unavailable'?'Journey active · authored motion':'Journey active · prepared song response',mediaReady:waiting.length===0});
   return painted;
  }catch(error){failures.set(activeKey,error);drop();publish({state:'unavailable',cueId:activeCue?.cueId,message:error.message});return false;}
 }
 return {evaluate,render,suspend(){suspended=true;runtime?.suspend();},restore(){suspended=false;if(runtime){runtime.restore();generation=Math.max(generation,runtime.diagnostics().generation);}},dispose(){if(disposed)return;disposed=true;drop();for(const entry of entries.values())entry.controller.abort();entries.clear();failures.clear();},diagnostics:()=>({disposed,suspended,retainedRecipes:entries.size,activeCueId:activeCue?.cueId||null,native:runtime?.diagnostics()||null,ownedAudioContexts:0,ownedAnimationLoops:0})};
}
