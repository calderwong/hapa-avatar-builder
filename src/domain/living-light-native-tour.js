import {validateJourney, LivingLightValidationError,LL_SCHEMAS} from './living-light-contracts.js';
import {effectiveThingParameters} from './living-light-preset.js';
import {IMPLEMENTATIONS} from '../living-light/registry.js';

const fail=(code,path,message)=>{throw new LivingLightValidationError(code,path,message);};
/** Compile authored intervals into the inherited passage score. No replanning,
 * inferred beats, source-time rounding, source mutation, media or transport. */
export function compileLivingLightNativeTour(journey,{registry,native,durationUs}={}) {
 validateJourney(journey,{resolveThing:registry.resolveThing,durationUs});
 if(journey.mode!=='tour')fail('unsupported_mode','mode','A Location tour is required.');
 if(journey.actorTreatment!=='none')fail('actor_treatment_unqualified','actorTreatment','Tour figure treatment is not qualified; choose None.');
 const uses=new Map(journey.instances.map(item=>[item.instanceId,item]));
 const rows=journey.schedule.map(row=>{
  const item=uses.get(row.instanceId),thing=registry.resolveThing(item.thingRef),renderer=thing.rendererRef;
  const expected=IMPLEMENTATIONS[renderer.implementationId];
  if(!expected||renderer.implementationVersion!==expected.version||renderer.sourceDigest!==expected.sourceDigest)fail('renderer_revision_mismatch','thingRef','Only the pinned supplied native implementation can render.');
  if(Object.values(item.bindings).some(binding=>binding.schemaVersion!==LL_SCHEMAS.signalBinding))fail('signal_binding_unqualified','bindings','Re-select legacy signal choices as exact sources before previewing.');
  const sourceId=thing.source.moduleId;
  // Retain Halo's independent Card/notes while declaring the source alias.
  const renderId=thing.variantKind==='destination'&&sourceId==='halo-vault'?'lumen-arcade':sourceId;
  if(thing.variantKind==='destination'&&!native.HapaCore.worlds.some(w=>w.id===renderId))fail('destination_unavailable','thingRef','The pinned destination implementation is unavailable.');
  if(thing.variantKind==='passage-style'&&!native.HapaPassages.styles.includes(renderId))fail('passage_unavailable','thingRef','The pinned passage implementation is unavailable.');
  return {row,item,thing,renderId,parameters:effectiveThingParameters(thing,item.parameters)};
 });
 const destinations=rows.filter(x=>x.thing.capabilities.destination);
 // A native shot extends through its outgoing bridge; the next shot starts at
 // arrival. Destination dwell intervals in the authored recipe remain intact.
 const shots=destinations.map((x,i)=>({id:x.item.instanceId,label:x.thing.title.slice(0,80),start:x.row.startUs/1e6,end:(destinations[i+1]?.row.startUs??durationUs)/1e6,rig:'portrait',locks:{shot:!!x.item.locked,camera:!!x.item.locked},palette:'inherit'}));
 const bridges=rows.filter(x=>x.thing.capabilities.bridge).map(x=>{
  const index=rows.indexOf(x),from=rows[index-1],to=rows[index+1],p=x.parameters;
  // Source r1 exposed broader editing ranges than the inherited renderer.
  // Refuse unsupported values instead of clamping saved authoring silently.
  if(p.length<12||p.length>54||p.reveal<.12||p.reveal>.75||p.continuity<0||p.continuity>1)fail('native_passage_parameter_unsupported','parameters','Native bridges require length 12–54, reveal 0.12–0.75 and continuity 0–1. Saved authoring is kept.');
  return {id:x.item.instanceId,label:x.thing.title.slice(0,80),from:from.renderId,to:to.renderId,fromShot:from.item.instanceId,toShot:to.item.instanceId,start:x.row.startUs/1e6,arrival:x.row.endUs/1e6,duration:(x.row.endUs-x.row.startUs)/1e6,style:x.renderId,entry:.18,length:p.length,reveal:p.reveal,continuity:p.continuity,wallMedia:false,toPalette:'gilded-tide',locked:!!x.item.locked,cueBasis:'Explicit authored source-time interval; no inferred beat or measured event'};
 });
 const score={id:journey.songId,title:journey.title,duration:durationUs/1e6,fps:30,stems:[],master:'AA==',travel:[],shots};
 const passages={schema:'hapa.passages/0.8.9',enabled:true,baseWorld:destinations[0].renderId,polish:true,bridges};
 native.HapaPassages.validate({passages,director:{shots}},score);
 const evidence=rows.map(x=>({instanceId:x.item.instanceId,thingRef:structuredClone(x.item.thingRef),sourceModuleId:x.thing.source.moduleId,renderModuleId:x.renderId,alias:x.thing.source.moduleId!==x.renderId,startUs:x.row.startUs,endUs:x.row.endUs,parameters:x.parameters}));
 return {score,passages,evidence,version:'ll109-authored-tour-to-native-passages-1'};
}
