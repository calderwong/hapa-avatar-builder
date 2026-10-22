import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/living-light-signals.mjs';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
import {createLivingLightFeatureCache} from '../src/domain/living-light-feature-cache.js';
import {livingLightFeatureBytes} from '../src/domain/living-light-prepared-binding.js';
import {suggestLivingLightMusicResponse,sampleLivingLightMusicRole} from '../src/domain/living-light-music-response.js';
import {createNativeMusicResponse} from '../src/living-light/music-response.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {createLivingLightRuntime} from '../src/living-light/runtime.js';
import {LIVING_LIGHT_VISUAL_HOOKS} from '../src/living-light/native-visuals.js';
import {editJourneyDraft,newJourneyDraft} from '../src/domain/living-light-journey.js';
import {validateMusicResponse} from '../src/domain/living-light-contracts.js';
const registry=createLivingLightRegistry();
function input(){
 const f=fixture(1);f.performance.stemSelectionPolicy='coherent-stems-v1';f.performance.buses[1].declaredRole='Bass';
 f.sourceBinding.stems[0].timeMap=[{songStartUs:0,songEndUs:2000000,sourceStartUs:0,sourceEndUs:2000000}];f.sourceBinding.stems[0].paddingIntervals=[];
 f.performance.buses[1].frames.forEach((row,i)=>{row.rms=i<5?.1:.9;row.rawRms=row.rms*.5;});
 const thing=registry.entries.find(t=>t.source.moduleId==='weave'&&t.capabilities.continuous),draft=newJourneyDraft({songId:f.songId,durationUs:2000000,thing},registry);
 draft.instances[0].musicResponse=suggestLivingLightMusicResponse(f.performance);
 const journey={...draft,journeyId:'test-journey',revisionId:'test-r1',parentRevisionId:null};return {...f,journey};
}
test('native articulation consumes exact Song-time envelopes, preserves seeks and missing-signal policy',()=>{
 const f=input(),bank=createLivingLightFeatureBank(f),native=createNativeNamespace(),response=f.journey.instances[0].musicResponse;
 const host=new native.HapaCore.FeatureCache({id:f.songId,duration:2,fps:30,stems:[],master:'AA==',travel:[]}),state={stems:{},reliquary:{}};
 const adapter=createNativeMusicResponse({native,bank,journey:f.journey,songTimeUs:t=>Math.round((t+.5)*1e6)});
 try{
  const quiet=adapter.evaluate(host,state,0),loud=adapter.evaluate(host,state,.8);assert(loud.signals.bass.mass>quiet.signals.bass.mass);
  assert.equal(loud.musicResponse.songTimeUs,1300000);assert.equal(loud.signals.bass.pan,0);assert.equal(adapter.get('bass','brightness',.8).availability,'missing');
  adapter.evaluate(host,state,1.2);assert.deepEqual(adapter.evaluate(host,state,.8),loud);assert(adapter.diagnostics().bytes>0);
  const missing=structuredClone(response);missing.roles.bass.sourceRefs=[{kind:'stem',assetId:'absent'}];
  assert.equal(sampleLivingLightMusicRole(bank,missing,'bass','energy',1000000).state,'explicit-master-fallback');
  assert.equal(sampleLivingLightMusicRole(bank,missing,'bass','onset',1000000).value,null);
  missing.roles.bass.onUnavailable='block';assert.equal(sampleLivingLightMusicRole(bank,missing,'bass','energy',1000000).state,'blocked');
 }finally{adapter.dispose();bank.dispose();}assert.equal(adapter.diagnostics().bytes,0);
});
test('musical settings retain independent scene swaps, duplicate, lock protection and exact draft snapshots',()=>{
 const f=input(),id=f.journey.instances[0].instanceId,response=f.journey.instances[0].musicResponse,before=structuredClone(f.journey);
 const other=registry.entries.find(t=>t.source.moduleId==='glass'&&t.capabilities.continuous);
 const swapped=editJourneyDraft(f.journey,{type:'replace',instanceId:id,thingRef:{thingId:other.thingId,revisionId:other.revisionId}},registry);
 assert.deepEqual(swapped.instances[0].musicResponse,response);assert.deepEqual(f.journey,before);
 const doubled=editJourneyDraft(f.journey,{type:'duplicate',instanceId:id},registry);assert.deepEqual(doubled.instances[1].musicResponse,response);
 const locked=editJourneyDraft(f.journey,{type:'lock',instanceId:id,value:true},registry);assert.throws(()=>editJourneyDraft(locked,{type:'music-response',instanceId:id,value:null},registry),/Unlock/);
 const changed=editJourneyDraft(f.journey,{type:'music-response',instanceId:id,value:{...response,preset:'gentle'}},registry);assert.equal(changed.instances[0].musicResponse.preset,'gentle');assert.deepEqual(f.journey,before);
 for(const bad of [{...response,intensity:NaN},{...response,preset:'random'},{...response,roles:{}},{...response,roles:{unknown:response.roles.bass}}])assert.throws(()=>validateMusicResponse(bad));
});
test('actual native water and tunnel choreography receives music through runtime, including cue offsets and hold',()=>{
 const f=input(),native=createNativeNamespace(),n={...native};let water,core;
 n.HapaRenderer=class {constructor(canvas,score,cache,state){Object.assign(this,{cache,state,programs:{},buffers:[],vaos:[],targets:[]});}render(t){core=n.HapaCore.evaluate(this.cache,this.state,t);water=n.HapaWater.evaluate(this.cache,{...this.state,world:'windward-reach'},t);}resize(){}dispose(){}};
 n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
 const owner=createLivingLightFeatureCache(),runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n});
 try{
  runtime.prepare({journeyRevision:f.journey,sourceBinding:{songId:f.songId,durationUs:2000000,sourceHash:f.playbackReceipt.sourceHash},generation:1,featureInput:{...f,cache:owner,requiredBytes:livingLightFeatureBytes(f.performance)}});
  const first=runtime.evaluate({timelineUs:100000,signalTimelineUs:100000});runtime.render(first);const quiet=water.swell;
  const sameTime=runtime.evaluate({timelineUs:100000,signalTimelineUs:1300000});assert(sameTime.frame.z>first.frame.z);
  const later=runtime.evaluate({timelineUs:800000,signalTimelineUs:1300000});runtime.render(later);assert(water.swell>quiet);assert.equal(core.articulation.musicResponse.songTimeUs,1300000);const loud=water.swell;
  runtime.render(runtime.evaluate({timelineUs:1700000,signalTimelineUs:1800000}));runtime.render(runtime.evaluate({timelineUs:800000,signalTimelineUs:1300000}));assert.equal(water.swell,loud);
  const held=runtime.evaluate({timelineUs:1500000,signalTimelineUs:1700000,reducedMotion:true});runtime.render(held);assert.equal(water.swell,loud);assert(runtime.diagnostics().musicResponse.bytes>0);
 }finally{runtime.dispose();owner.dispose();}assert.equal(owner.diagnostics().leases,0);
});

import {previewJourneyFork} from '../src/domain/living-light-fork.js';
import {createLivingLightPreparedInputResolver} from '../src/domain/living-light-prepared-input.js';
test('cross-song forks reset musical sources and unsaved response drafts request coherent inputs',async()=>{
 const f=input(),fork=previewJourneyFork(f.journey,{sourceRevisionId:f.journey.revisionId,targetSongId:'other-song',title:'Other',durationUs:2000000,timingPolicy:'keep-seconds'},{resolveThing:registry.resolveThing});
 assert.equal(fork.journey.instances[0].musicResponse,undefined);assert.equal(fork.reset.signalBindings,1);
 const result=await createLivingLightPreparedInputResolver({...f,request:()=>{throw Error('Supplied exact bank should be reused');}})(f.journey);
 assert.equal(result.featureInput.performance.stemSelectionPolicy,'coherent-stems-v1');assert.equal(result.neutralStudy,undefined);
});
