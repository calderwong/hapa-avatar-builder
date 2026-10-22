import {validateLivingLightDestination} from './living-light-navigation.js';
import {validateLivingLightMedia} from './living-light-media.js';
/** Shared validators for native authoring, API and CLI. No I/O or executable records. */
export const LL_SCHEMAS = Object.freeze({thing:'hapa.living-light.thing.v1',journey:'hapa.living-light.journey.v1',source:'hapa.living-light.source-binding.v1',features:'hapa.living-light.features.v1',signalBinding:'hapa.living-light.signal-binding.v1',note:'hapa.living-light.note.v1'});
export class LivingLightValidationError extends Error {
  constructor(code, path, message) { super(message); this.name='LivingLightValidationError'; this.code=code; this.path=path; this.status=422; }
}
const fail=(code,path,message)=>{throw new LivingLightValidationError(code,path,message);};
const object=(v,p)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail('invalid_object',p,'Expected an object');return v;};
const string=(v,p,max=1024)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('invalid_string',p,'Expected nonempty bounded text');return v;};
const id=(v,p)=>{string(v,p,256);if(!/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(v))fail('invalid_id',p,'Expected a stable namespaced identifier');return v;};
const choices=(v,list,p)=>{if(!list.includes(v))fail('invalid_enum',p,'Unsupported value');};
const number=(v,min,max,p,integer=false)=>{if(!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isSafeInteger(v)))fail('invalid_number',p,'Number outside supported range');};
const array=(v,p,max=200)=>{if(!Array.isArray(v)||v.length>max)fail('invalid_array',p,'Expected a bounded array');return v;};
const keys=(v,allowed,p)=>{for(const k of Object.keys(v))if(!allowed.includes(k))fail('unknown_field',p+'.'+k,'Unknown field');};
const digest=(v,p)=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail('invalid_digest',p,'Expected SHA-256');};
const schema=(v,type)=>{object(v,type);if(v.schemaVersion!==LL_SCHEMAS[type])fail('unsupported_schema','schemaVersion','Unsupported schema version');};
export function canonicalJSON(value) {
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isFinite(value))fail('nonfinite','digest','Nonfinite semantic value');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
  object(value,'digest');return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
}
export function validateActor(actor) {
  object(actor,'actor');keys(actor,['actorId','kind','displayName','instanceId'],'actor');
  id(actor.actorId,'actor.actorId');choices(actor.kind,['human','agent'],'actor.kind');string(actor.displayName,'actor.displayName',200);
  if(actor.instanceId!==undefined)id(actor.instanceId,'actor.instanceId');return actor;
}
export function validateRef(ref,path='ref') {object(ref,path);keys(ref,['thingId','revisionId'],path);id(ref.thingId,path+'.thingId');id(ref.revisionId,path+'.revisionId');return ref;}
/** Master and a stem literally named "master" remain different identities. */
export function signalSourceKey(ref,path='sourceRef') {
  object(ref,path);choices(ref.kind,['master','stem'],path+'.kind');keys(ref,ref.kind==='master'?['kind']:['kind','assetId'],path);
  if(ref.kind==='stem')string(ref.assetId,path+'.assetId',300);
  return JSON.stringify(ref.kind==='master'?['master']:['stem',ref.assetId]);
}
export function validateSignalBinding(binding,port,path='binding') {
  object(binding,path);
  if(binding.schemaVersion!==LL_SCHEMAS.signalBinding)fail('unsupported_signal_binding',path,'Choose a versioned exact-source binding');
  keys(binding,['schemaVersion','sourceRefs','feature','aggregation','weights','onUnavailable'],path);
  const refs=array(binding.sourceRefs,path+'.sourceRefs',33),identities=refs.map((ref,i)=>signalSourceKey(ref,path+'.sourceRefs.'+i));
  if(!refs.length||new Set(identities).size!==refs.length)fail('duplicate_signal_source',path,'Choose one or more distinct exact sources');
  choices(binding.feature,['energy','onset'],path+'.feature');
  if(port&&binding.feature!==port.feature)fail('signal_feature_mismatch',path+'.feature','Use the feature accepted by this port');
  choices(binding.aggregation,['max','mean','weighted-sum'],path+'.aggregation');
  if(binding.aggregation==='weighted-sum'){
    const weights=array(binding.weights,path+'.weights',33);
    if(weights.length!==refs.length)fail('signal_weights_mismatch',path+'.weights','One explicit weight per source is required');
    weights.forEach((weight,i)=>number(weight,0,1,path+'.weights.'+i));
    if(weights.reduce((total,weight)=>total+weight,0)>1+1e-12)fail('signal_weights_excess',path+'.weights','Weights must total at most one');
  }else if(binding.weights!==undefined)fail('unexpected_signal_weights',path+'.weights','Weights belong only to weighted sum');
  choices(binding.onUnavailable,['neutral','block','master'],path+'.onUnavailable');
  if(binding.onUnavailable==='master'&&binding.feature!=='energy')fail('signal_fallback_unavailable',path,'Master fallback provides energy only');
  return binding;
}
export const LIVING_LIGHT_MUSIC_ROLES=['lead-vocals','backing-vocals','bass','drums','guitar','keyboard','synth','strings','percussion','brass','woodwinds','other'];
export function validateMusicResponse(value,path='musicResponse'){
 object(value,path);keys(value,['schemaVersion','preset','intensity','roles'],path);
 if(value.schemaVersion!=='hapa.living-light.music-response.v1')fail('unsupported_music_response',path,'Choose a supported musical response');
 choices(value.preset,['gentle','dance','surge'],path+'.preset');number(value.intensity,0,1.5,path+'.intensity');
 object(value.roles,path+'.roles');if(!Object.keys(value.roles).length)fail('empty_music_response',path,'Choose an explicit source for at least one movement role');
 for(const [role,binding]of Object.entries(value.roles)){choices(role,LIVING_LIGHT_MUSIC_ROLES,path+'.roles');validateSignalBinding(binding,{feature:'energy'},path+'.roles.'+role);}
 return value;
}
export function validateParameter(def,path='parameter') {
  object(def,path);keys(def,['type','units','min','max','default','values','length'],path);
  choices(def.type,['number','boolean','enum','vector'],path+'.type');string(def.units,path+'.units',100);
  if(['number','vector'].includes(def.type)){number(def.min,-1e12,1e12,path+'.min');number(def.max,def.min,1e12,path+'.max');}
  if(def.type==='vector')number(def.length,2,4,path+'.length',true);
  if(def.type==='enum'){array(def.values,path+'.values',100);if(!def.values.length||new Set(def.values).size!==def.values.length)fail('invalid_enum',path,'Empty or duplicate enum');def.values.forEach(v=>string(v,path+'.values',100));}
  validateParameterValue(def,def.default,path+'.default');return def;
}
export function validateParameterValue(def,value,path='parameter') {
  if(def.type==='number')number(value,def.min,def.max,path);
  else if(def.type==='boolean'){if(typeof value!=='boolean')fail('invalid_boolean',path,'Expected boolean');}
  else if(def.type==='enum')choices(value,def.values,path);
  else if(def.type==='vector'){array(value,path,4);if(value.length!==def.length)fail('invalid_vector',path,'Wrong vector length');value.forEach((v,i)=>number(v,def.min,def.max,path+'.'+i));}
  else fail('invalid_type',path,'Unsupported parameter type');
}
export function validateThing(thing,{implementations}={}) {
  schema(thing,'thing');keys(thing,['schemaVersion','thingId','revisionId','kind','variantKind','title','summary','tags','previewRef','rendererRef','source','parameters','signalPorts','capabilities','aliasOf','derivedFrom','worldRefs','readiness'],'thing');
  id(thing.thingId,'thingId');id(thing.revisionId,'revisionId');choices(thing.kind,['tunnel','location'],'kind');choices(thing.variantKind,['continuous-profile','passage-style','destination'],'variantKind');
  if((thing.kind==='location')!==(thing.variantKind==='destination'))fail('kind_mismatch','kind','Location must be a destination');
  string(thing.title,'title',200);string(thing.summary,'summary',4000);array(thing.tags,'tags',50).forEach(v=>string(v,'tags',80));
  if(thing.previewRef!==null){object(thing.previewRef,'previewRef');keys(thing.previewRef,['mediaId'],'previewRef');id(thing.previewRef.mediaId,'previewRef.mediaId');}
  const r=object(thing.rendererRef,'rendererRef');keys(r,['implementationId','implementationVersion','sourceDigest'],'rendererRef');id(r.implementationId,'rendererRef.implementationId');id(r.implementationVersion,'rendererRef.implementationVersion');digest(r.sourceDigest,'rendererRef.sourceDigest');
  if(!implementations||!Object.hasOwn(implementations,r.implementationId))fail('unknown_renderer','rendererRef','Renderer must be registered locally');
  const admitted=implementations[r.implementationId];if(admitted.version!==r.implementationVersion||admitted.sourceDigest!==r.sourceDigest)fail('renderer_revision_mismatch','rendererRef','Pinned implementation differs');
  const source=object(thing.source,'source');keys(source,['artifactDigest','moduleId','sourceRefs','attribution','creditRefs','rights'],'source');digest(source.artifactDigest,'source.artifactDigest');string(source.moduleId,'source.moduleId',200);array(source.sourceRefs,'source.sourceRefs',50).forEach(v=>string(v,'source.sourceRefs',1000));string(source.attribution,'source.attribution',2000);array(source.creditRefs,'source.creditRefs',50).forEach(v=>string(v,'source.creditRefs'));string(source.rights,'source.rights',2000);
  object(thing.parameters,'parameters');if(Object.keys(thing.parameters).length>64)fail('parameter_limit','parameters','Too many controls');for(const [k,def]of Object.entries(thing.parameters)){id(k,'parameters.key');validateParameter(def,'parameters.'+k);}
  array(thing.signalPorts,'signalPorts',64).forEach((p,i)=>{const path='signalPorts.'+i;object(p,path);keys(p,['portId','feature','required','onUnavailable'],path);id(p.portId,path);string(p.feature,path+'.feature',100);if(typeof p.required!=='boolean')fail('invalid_boolean',path,'Explicit requirement needed');choices(p.onUnavailable,['neutral','hold','block'],path+'.onUnavailable');});
  const c=object(thing.capabilities,'capabilities');keys(c,['continuous','bridge','destination','transitionIds','anchors','qualityTiers','finalEncoding'],'capabilities');for(const k of ['continuous','bridge','destination'])if(typeof c[k]!=='boolean')fail('invalid_boolean','capabilities.'+k,'Expected boolean');
  array(c.transitionIds,'transitionIds',100).forEach(v=>id(v,'transitionIds'));array(c.anchors,'anchors',20).forEach(v=>id(v,'anchors'));array(c.qualityTiers,'qualityTiers',3).forEach(v=>choices(v,['draft','balanced','high'],'qualityTiers'));if(c.finalEncoding!=='unsupported')fail('unqualified_final','capabilities.finalEncoding','Phase 1 final encoding is unsupported');
  for(const k of ['aliasOf','derivedFrom'])if(thing[k]!=null)validateRef(thing[k],k);
  array(thing.worldRefs,'worldRefs',100).forEach(r=>{object(r,'worldRef');keys(r,['kind','entityId'],'worldRef');choices(r.kind,['place','scene'],'worldRef.kind');id(r.entityId,'worldRef.entityId');});
  const readiness=object(thing.readiness,'readiness');keys(readiness,['state','reasons','evidenceRefs'],'readiness');choices(readiness.state,['catalogued','blocked','preview-ready'],'readiness.state');array(readiness.reasons,'readiness.reasons',50).forEach(v=>string(v,'reason',2000));array(readiness.evidenceRefs,'readiness.evidenceRefs',100).forEach(v=>string(v,'evidenceRef',1000));if(readiness.state==='preview-ready'&&!readiness.evidenceRefs.length)fail('missing_evidence','readiness','Readiness requires evidence');return thing;
}
export function validateInstance(instance,{resolveThing},path='instance') {
  object(instance,path);keys(instance,['instanceId','thingRef','parameters','bindings','locked','destination','musicResponse'],path);id(instance.instanceId,path+'.instanceId');validateRef(instance.thingRef,path+'.thingRef');
  const thing=resolveThing?.(instance.thingRef);if(!thing)fail('unknown_revision',path+'.thingRef','Pinned Thing revision is unavailable');
  object(instance.parameters,path+'.parameters');for(const [k,v]of Object.entries(instance.parameters)){if(!Object.hasOwn(thing.parameters,k))fail('unknown_parameter',path+'.parameters.'+k,'Unknown control');validateParameterValue(thing.parameters[k],v,path+'.parameters.'+k);}
  object(instance.bindings,path+'.bindings');for(const [port,b]of Object.entries(instance.bindings)){const definition=thing.signalPorts.find(p=>p.portId===port);if(!definition)fail('unknown_port',path+'.bindings.'+port,'Unknown signal port');object(b,path+'.bindings');if(b.schemaVersion!==undefined){validateSignalBinding(b,definition,path+'.bindings.'+port);continue;}keys(b,['source','feature','onUnavailable','aggregation','weights'],path+'.bindings');id(b.source,'bindings.source');string(b.feature,'bindings.feature',100);choices(b.onUnavailable,['neutral','hold','block'],'bindings.onUnavailable');if(b.aggregation!==undefined)choices(b.aggregation,['max','mean','weighted-sum'],'bindings.aggregation');if(b.weights!==undefined)array(b.weights,'bindings.weights',200).forEach(v=>number(v,0,1,'bindings.weight'));}
  if(instance.musicResponse!==undefined)validateMusicResponse(instance.musicResponse,path+'.musicResponse');
  if(instance.destination!==undefined){if(!thing.capabilities.destination)fail('invalid_navigation_target',path+'.destination','Only Locations have album destinations');validateLivingLightDestination(instance.destination);}
  if(instance.locked!==undefined&&typeof instance.locked!=='boolean')fail('invalid_boolean',path+'.locked','Expected boolean');return thing;
}
export function validateJourney(journey,{resolveThing,durationUs}={}) {
  schema(journey,'journey');keys(journey,['schemaVersion','journeyId','revisionId','parentRevisionId','title','songId','sourceBindingRef','state','mode','seed','instances','schedule','actorTreatment','motion','mediaSlots'],'journey');
  for(const k of ['journeyId','revisionId','songId'])id(journey[k],k);if(journey.parentRevisionId!==null)id(journey.parentRevisionId,'parentRevisionId');string(journey.title,'title',200);
  if(journey.sourceBindingRef!==null){object(journey.sourceBindingRef,'sourceBindingRef');keys(journey.sourceBindingRef,['bindingId','revisionId'],'sourceBindingRef');id(journey.sourceBindingRef.bindingId,'bindingId');id(journey.sourceBindingRef.revisionId,'bindingRevisionId');}
  choices(journey.state,['draft-unresolved','draft','ready'],'state');if(journey.state==='ready'&&journey.sourceBindingRef===null)fail('unresolved_source','state','Ready needs a source binding');choices(journey.mode,['continuous','tour'],'mode');number(journey.seed,0,4294967295,'seed',true);choices(journey.actorTreatment,['apparition','traveler','none'],'actorTreatment');
  const instances=new Map();array(journey.instances,'instances',100).forEach((instance,i)=>{if(instances.has(instance.instanceId))fail('duplicate_instance','instances','Duplicate instance ID');instances.set(instance.instanceId,{instance,thing:validateInstance(instance,{resolveThing},'instances.'+i)});});
  const schedule=array(journey.schedule,'schedule',100);if(!schedule.length)fail('empty_schedule','schedule','Schedule is required');const limit=durationUs??Number.MAX_SAFE_INTEGER;number(limit,1,Number.MAX_SAFE_INTEGER,'durationUs',true);let end=0,bridges=0;
  schedule.forEach((row,i)=>{object(row,'schedule.'+i);keys(row,['instanceId','startUs','endUs','fromInstanceId','toInstanceId','entryAnchorId','exitAnchorId'],'schedule.'+i);const record=instances.get(row.instanceId);if(!record)fail('unknown_instance','schedule.'+i,'Instance unavailable');number(row.startUs,0,limit,'startUs',true);number(row.endUs,row.startUs+1,limit,'endUs',true);if(row.startUs!==end)fail('schedule_coverage','schedule.'+i,'Intervals must be ordered, adjacent and half-open');end=row.endUs;
   if(journey.mode==='continuous'){if(!record.thing.capabilities.continuous)fail('unsupported_mode','schedule','Requires a continuous Thing');if(Object.keys(row).length!==3)fail('unexpected_anchor','schedule','Continuous interval has no bridge endpoints');}
   else {const bridge=record.thing.capabilities.bridge;if(bridge){bridges++;if((row.endUs-row.startUs)<4000000||(row.endUs-row.startUs)>60000000)fail('route_duration_unsupported','schedule','Legacy bridges support 4–60 seconds');const before=schedule[i-1],after=schedule[i+1];if(!before||!after||row.fromInstanceId!==before.instanceId||row.toInstanceId!==after.instanceId||!instances.get(before.instanceId)?.thing.capabilities.destination||!instances.get(after.instanceId)?.thing.capabilities.destination)fail('route_chain','schedule','Bridge must name adjacent destination instances');for(const k of ['entryAnchorId','exitAnchorId'])if(!record.thing.capabilities.anchors.includes(row[k]))fail('unknown_anchor','schedule.'+k,'Unknown bridge anchor');}
    else if(!record.thing.capabilities.destination||i%2!==0)fail('route_chain','schedule','Tours alternate destination and bridge intervals');}
  });if(bridges>12)fail('bridge_limit','schedule','Maximum twelve legacy bridges');if(durationUs!==undefined&&end!==durationUs)fail('schedule_coverage','schedule','Schedule must cover the supplied source duration');
  if(journey.motion!==undefined){object(journey.motion,'motion');keys(journey.motion,['reduced','heldVisualUs'],'motion');if(typeof journey.motion.reduced!=='boolean')fail('invalid_boolean','motion.reduced','Expected boolean');number(journey.motion.heldVisualUs,0,limit,'heldVisualUs',true);}
  array(journey.mediaSlots,'mediaSlots',8).forEach(slot=>{object(slot,'mediaSlot');if(slot.schemaVersion===undefined){keys(slot,['enabled','cutRef','mediaRef','sourceTimeMap','trim','loopPolicy','fit','crop','surfaceRef'],'mediaSlot');if(slot.enabled!==false)fail('media_unqualified','mediaSlot','Enabled media needs a versioned placement');}canonicalJSON(slot);});validateLivingLightMedia(journey.mediaSlots,{instances:journey.instances,resolveThing,songId:journey.songId});return journey;
}
export function validateNote(note) {
  schema(note,'note');keys(note,['schemaVersion','noteId','revisionId','parentRevisionId','target','body','actor','createdAt','editedAt','eventType'],'note');id(note.noteId,'noteId');id(note.revisionId,'revisionId');if(note.parentRevisionId!==null)id(note.parentRevisionId,'parentRevisionId');validateActor(note.actor);choices(note.eventType,['created','edited','retracted'],'eventType');
  if(typeof note.body!=='string'||new TextEncoder().encode(note.body).length>16384)fail('invalid_body','body','Note must be inert text at most 16 KiB');
  for(const key of ['createdAt','editedAt'])if(typeof note[key]!=='string'||!Number.isFinite(Date.parse(note[key])))fail('invalid_time',key,'Expected a timestamp');
  const t=object(note.target,'target');choices(t.kind,['thing','journey','instance'],'target.kind');const allowed=t.kind==='thing'?['kind','thingId','observedRevisionId']:t.kind==='journey'?['kind','journeyId','observedRevisionId']:['kind','journeyId','observedRevisionId','instanceId','sourceBindingRevisionId','startUs','endUs'];keys(t,allowed,'target');id(t[t.kind==='thing'?'thingId':'journeyId'],'target.id');if(t.kind!=='thing'||t.observedRevisionId!==undefined)id(t.observedRevisionId,'target.observedRevisionId');if(t.kind==='instance'){id(t.instanceId,'target.instanceId');id(t.observedRevisionId,'target.observedRevisionId');if(t.sourceBindingRevisionId!==undefined)id(t.sourceBindingRevisionId,'target.sourceBindingRevisionId');if(t.startUs!==undefined||t.endUs!==undefined){number(t.startUs,0,Number.MAX_SAFE_INTEGER,'target.startUs',true);number(t.endUs,t.startUs+1,Number.MAX_SAFE_INTEGER,'target.endUs',true);}}return note;
}
export function secondsToTimelineUs(seconds){number(seconds,0,Number.MAX_SAFE_INTEGER/1e6,'seconds');return Math.round(seconds*1e6);}
