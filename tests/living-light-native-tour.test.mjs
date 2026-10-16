import {LIVING_LIGHT_VISUAL_HOOKS} from '../src/living-light/native-visuals.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {compileLivingLightNativeTour} from '../src/domain/living-light-native-tour.js';
import {createLivingLightRuntime} from '../src/living-light/runtime.js';
import {editJourneyDraft,editableJourney} from '../src/domain/living-light-journey.js';
const registry=createLivingLightRegistry();
function route(from='solar-reliquary',style='fractal-loom',to='tidal-observatory'){
 const modules=[from,style,to],ids=['location-a','bridge','location-b'];
 const instances=modules.map((module,i)=>{const thing=registry.entries.find(t=>t.source.moduleId===module);return {instanceId:ids[i],thingRef:{thingId:thing.thingId,revisionId:thing.revisionId},parameters:{},bindings:{}};});
 return {schemaVersion:'hapa.living-light.journey.v1',journeyId:'fixture:tour',revisionId:'fixture:r1',parentRevisionId:null,title:'Authored tour',songId:'fixture:song',sourceBindingRef:null,state:'draft-unresolved',mode:'tour',seed:109,instances,schedule:[{instanceId:ids[0],startUs:0,endUs:6000000},{instanceId:ids[1],startUs:6000000,endUs:14000000,fromInstanceId:ids[0],toInstanceId:ids[2],entryAnchorId:'entry',exitAnchorId:'exit'},{instanceId:ids[2],startUs:14000000,endUs:20000000}],actorTreatment:'none',mediaSlots:[]};
}
test('native tour preserves exact authored arrival, references, defaults and independent Location identities',()=>{
 const input=route(),before=structuredClone(input),n=createNativeNamespace(),compiled=compileLivingLightNativeTour(input,{registry,native:n,durationUs:20000000});
 assert.deepEqual(input,before);assert.equal(compiled.score.shots.length,2);
 assert.deepEqual(compiled.score.shots.map(s=>[s.id,s.start,s.end]),[['location-a',0,14],['location-b',14,20]]);
 assert.deepEqual([compiled.passages.baseWorld,compiled.passages.bridges[0].from,compiled.passages.bridges[0].to],['solar-reliquary','solar-reliquary','tidal-observatory']);
 assert.deepEqual([compiled.passages.bridges[0].start,compiled.passages.bridges[0].duration,compiled.passages.bridges[0].arrival],[6,8,14]);
 assert.equal(compiled.passages.bridges[0].style,'fractal-loom');assert.equal(compiled.passages.bridges[0].wallMedia,false);
 assert.deepEqual(compiled.evidence[0].thingRef,input.instances[0].thingRef);
 const replaced=route('solar-reliquary','silken-current','tidal-observatory');
 const other=compileLivingLightNativeTour(replaced,{registry,native:n,durationUs:20000000});
 assert.deepEqual(other.evidence.filter(x=>x.instanceId!=='bridge'),compiled.evidence.filter(x=>x.instanceId!=='bridge'));
});
test('all 23 destination IDs and 21 passage styles resolve without substituting an unknown world; Halo alias remains explicit',()=>{
 const n=createNativeNamespace();
 for(const thing of registry.entries.filter(t=>t.capabilities.destination)){
  const input=route('solar-reliquary','fractal-loom',thing.source.moduleId),out=compileLivingLightNativeTour(input,{registry,native:n,durationUs:20000000});
  assert.equal(out.evidence[2].sourceModuleId,thing.source.moduleId);
  assert.equal(out.evidence[2].renderModuleId,thing.source.moduleId==='halo-vault'?'lumen-arcade':thing.source.moduleId);
  assert.equal(out.evidence[2].alias,thing.source.moduleId==='halo-vault');
 }
 for(const thing of registry.entries.filter(t=>t.capabilities.bridge))assert.equal(compileLivingLightNativeTour(route('solar-reliquary',thing.source.moduleId),{registry,native:n,durationUs:20000000}).passages.bridges[0].style,thing.source.moduleId);
 // This is implementation resolution, not GPU compatibility or readiness promotion.
 assert(registry.entries.every(t=>t.readiness.state==='catalogued'));
});
test('unsupported bridge settings, figures, bindings and broken chains refuse without changing authoring',()=>{
 const n=createNativeNamespace();
 for(const mutate of [x=>x.instances[1].parameters.length=55,x=>x.instances[1].parameters.reveal=.01,x=>x.actorTreatment='traveler',x=>x.instances[1].bindings.energy={source:'master',feature:'rms',onUnavailable:'neutral'},x=>x.schedule[1].toInstanceId='location-a',x=>x.schedule[1].endUs=9000000]){
  const input=route();mutate(input);const before=structuredClone(input);assert.throws(()=>compileLivingLightNativeTour(input,{registry,native:n,durationUs:20000000}));assert.deepEqual(input,before);
 }
});
test('locked destination protects adjacent connections and exact times until explicitly unlocked',()=>{
 const original=editableJourney(route()),locked=editJourneyDraft(original,{type:'lock',instanceId:'location-a',value:true},registry),before=structuredClone(locked);
 for(const action of [{type:'move',instanceId:'location-b',direction:-1},{type:'duration',instanceId:'bridge',durationUs:9000000},{type:'remove',instanceId:'location-a'},{type:'parameter',instanceId:'bridge',key:'length',value:40}])assert.throws(()=>editJourneyDraft(locked,action,registry),/Unlock/);
 assert.deepEqual(locked,before);assert.equal(editJourneyDraft(locked,{type:'title',title:'Renamed'},registry).title,'Renamed');
 const n=createNativeNamespace(),compiled=compileLivingLightNativeTour({...locked,journeyId:'fixture:tour',revisionId:'fixture:r1',parentRevisionId:null},{registry,native:n,durationUs:20000000});
 assert.equal(n.HapaPassages.at({passages:compiled.passages,director:{shots:compiled.score.shots},reduced:false},10).reason,'protected shot');
 const unlocked=editJourneyDraft(locked,{type:'lock',instanceId:'location-a',value:false},registry);
 assert.equal(editJourneyDraft(unlocked,{type:'parameter',instanceId:'bridge',key:'length',value:40},registry).instances[1].parameters.length,40);
});
test('three Locations and two bridges preserve direct/reverse boundary state through the actual native route evaluator',()=>{
 const n={...createNativeNamespace()};let closed=0,painted;
 n.HapaRenderer=class{constructor(canvas,score,cache,state){Object.assign(this,{cache,state,programs:{},buffers:[],vaos:[],targets:[]});}render(t){painted=n.HapaCurrents.route(this.cache,this.state,t);}resize(){}dispose(){closed++;}};
 n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
 const runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n});let generation=0;
 for(const [from,style,to]of [['solar-reliquary','fractal-loom','tidal-observatory'],['solar-reliquary','silken-current','tidal-observatory'],['solar-reliquary','fractal-loom','resonance-vault'],['solar-reliquary','silken-current','resonance-vault'],['tidal-observatory','fractal-loom','solar-reliquary']]){
  runtime.prepare({journeyRevision:route(from,style,to),sourceBinding:{songId:'fixture:song',durationUs:20000000},generation:++generation,neutralStudy:true});
  const times=[0,5999000,6000000,6001000,13999000,14000000,14001000,20000000],frames=times.map(t=>runtime.evaluate({timelineUs:t}));
  for(let i=times.length-1;i>=0;i--){const packet=runtime.evaluate({timelineUs:times[i]});assert.deepEqual(packet.frame,frames[i].frame);runtime.render(packet);assert.deepEqual(painted,packet.frame);}
  assert.equal(frames[0].frame.world,from);assert.equal(frames[4].frame.to,to);assert.equal(frames[5].frame.world,to);assert.equal(frames[7].frame.active,false);
  assert.equal(frames[2].frame.bridge.style,style);for(const f of frames.filter(f=>f.frame.active))assert(Number.isFinite(f.frame.progress)&&f.frame.progress>=0&&f.frame.progress<=1);
 }
 const before=runtime.evaluate({timelineUs:10000000});
 const invalid=route();invalid.instances[1].parameters.length=90;
 assert.throws(()=>runtime.prepare({journeyRevision:invalid,sourceBinding:{songId:'fixture:song',durationUs:20000000},generation:generation+1,neutralStudy:true}));
 assert.deepEqual(runtime.evaluate({timelineUs:10000000}),before);
 runtime.evaluate({timelineUs:15000000});const held=runtime.evaluate({timelineUs:18000000,reducedMotion:true});assert.equal(held.visualUs,15000000);runtime.suspend();runtime.restore();generation++;
 assert.equal(runtime.evaluate({timelineUs:0,reducedMotion:true}).visualUs,15000000);
 runtime.dispose();assert.equal(closed,6);
});
