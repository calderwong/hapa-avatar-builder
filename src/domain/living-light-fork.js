import {LivingLightValidationError,validateJourney,canonicalJSON} from './living-light-contracts.js';
const fail=(code,message)=>{throw new LivingLightValidationError(code,'fork',message);};
const id=(value,label)=>{if(typeof value!=='string'||value.length>256||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(value))fail('invalid_id',label+' must be an exact identifier');};
/** Explicit authored timing conversion. It never maps or stretches measurements.
 * Caller supplies an immutable saved source and the native module resolver. */
export function previewJourneyFork(source,options,{resolveThing}={}){
 if(!options||typeof options!=='object'||Array.isArray(options))fail('invalid_fork','A fork conversion request is required');
 for(const key of Object.keys(options))if(!['sourceRevisionId','targetSongId','title','durationUs','timingPolicy'].includes(key))fail('unknown_field','Unknown fork field: '+key);
 id(options.sourceRevisionId,'Source revision');id(options.targetSongId,'Target Song');
 if(source.revisionId!==options.sourceRevisionId)fail('fork_source_mismatch','The conversion must observe the exact saved source revision');
 validateJourney(source,{resolveThing});
 if(!Number.isSafeInteger(options.durationUs)||options.durationUs<1)fail('invalid_fork_duration','Enter a positive planned duration in integer microseconds');
 if(!['keep-seconds','reset-schedule'].includes(options.timingPolicy))fail('invalid_timing_policy','Choose keep seconds or reset schedule explicitly');
 if(typeof options.title!=='string'||!options.title.trim()||options.title.length>200)fail('invalid_fork_title','Enter a recipe title of at most 200 characters');
 const journey=structuredClone(source);for(const key of ['journeyId','revisionId','parentRevisionId'])delete journey[key];
 journey.title=options.title;journey.songId=options.targetSongId;journey.state='draft-unresolved';journey.sourceBindingRef=null;journey.mediaSlots=[];
 if(journey.motion)journey.motion={reduced:journey.motion.reduced,heldVisualUs:0};
 const handles=new Map(journey.instances.map((item,index)=>[item.instanceId,'ll-fork-use:'+String(index+1)]));
 journey.instances.forEach(item=>{item.instanceId=handles.get(item.instanceId);item.bindings={};delete item.locked;});
 journey.schedule.forEach(row=>{row.instanceId=handles.get(row.instanceId);for(const key of ['fromInstanceId','toInstanceId'])if(row[key])row[key]=handles.get(row[key]);});
 const total=options.durationUs;
 if(options.timingPolicy==='keep-seconds'){
  const final=journey.schedule.at(-1);if(total<=final.startUs)fail('fork_schedule_does_not_fit','The new duration ends before the final interval. Reset the schedule or choose a longer planned duration.');
  final.endUs=total;
 }else{
  const timed=journey.schedule.map(row=>({row,bridge:journey.mode==='tour'&&resolveThing(journey.instances.find(item=>item.instanceId===row.instanceId).thingRef).capabilities.bridge}));
  const bridgeUs=timed.filter(item=>item.bridge).reduce((sum,item)=>sum+item.row.endUs-item.row.startUs,0),dwells=timed.filter(item=>!item.bridge).length,remaining=total-bridgeUs;
  if(!Number.isSafeInteger(remaining)||remaining<dwells)fail('route_duration_unsupported','The new duration cannot contain the retained passage times and a positive interval for every stop.');
  const base=Math.floor(remaining/dwells),extra=remaining-base*dwells;let cursor=0,dwellIndex=0;
  for(const item of timed){const length=item.bridge?item.row.endUs-item.row.startUs:base+(dwellIndex++<extra?1:0);item.row.startUs=cursor;item.row.endUs=cursor+length;cursor=item.row.endUs;}
 }
 validateJourney({...journey,journeyId:'ll-journey:fork-preview',revisionId:'ll-journey-r:fork-preview',parentRevisionId:null},{resolveThing,durationUs:total});
 const rows=source.schedule.map((row,index)=>({sourceInstanceId:row.instanceId,instanceId:journey.schedule[index].instanceId,thingRef:structuredClone(source.instances.find(item=>item.instanceId===row.instanceId).thingRef),before:{startUs:row.startUs,endUs:row.endUs},after:{startUs:journey.schedule[index].startUs,endUs:journey.schedule[index].endUs}}));
 return {schemaVersion:'hapa.living-light.fork-preview.v1',source:{journeyId:source.journeyId,revisionId:source.revisionId,songId:source.songId},target:{songId:options.targetSongId,plannedDurationUs:total,timelineVerification:'authored-plan-only'},timingPolicy:options.timingPolicy,journey,conversion:rows,reset:{sourceBinding:source.sourceBindingRef!==null,signalBindings:source.instances.filter(item=>Object.keys(item.bindings).length).length,locks:source.instances.filter(item=>item.locked).length,mediaSlots:source.mediaSlots.length,heldVisualTime:true},notes:{copied:false,sourceJourneyId:source.journeyId,sourceRevisionId:source.revisionId,thingNotes:'retain-original-identity'},previewOnly:true,finalRenderUnsupported:true};
}
export const forkPreviewContent=value=>canonicalJSON(value);
