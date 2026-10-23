import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/living-light-signals.mjs';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
import {createLivingLightFeatureCache} from '../src/domain/living-light-feature-cache.js';
import {livingLightFeatureBytes} from '../src/domain/living-light-prepared-binding.js';
import {suggestLivingLightMusicResponse,sampleLivingLightMusicRole,createLivingLightMusicSampler} from '../src/domain/living-light-music-response.js';
import {createNativeMusicResponse} from '../src/living-light/music-response.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {createLivingLightRuntime} from '../src/living-light/runtime.js';
import {LIVING_LIGHT_VISUAL_HOOKS} from '../src/living-light/native-visuals.js';
import {editJourneyDraft,newJourneyDraft} from '../src/domain/living-light-journey.js';
import {validateMusicResponse} from '../src/domain/living-light-contracts.js';
import {livingLightResponseStatus} from '../src/domain/living-light-response-status.js';
const registry=createLivingLightRegistry();
test('visible source status follows qualified intervals, explicit fallback, direct master and zero-weight choices',()=>{
 const f=input(),bank=createLivingLightFeatureBank(f),response=structuredClone(f.journey.instances[0].musicResponse);
 const status=(time=1e6)=>livingLightResponseStatus({...response,roles:Object.fromEntries(Object.keys(response.roles).map(role=>[role,sampleLivingLightMusicRole(bank,response,role,'energy',time)]))});
 try{
  assert.equal(status().state,'stem-response');assert.deepEqual(status().stemRoles,['bass']);
  const terminal=status(2e6);assert.equal(terminal.state,'master-response');assert.deepEqual(terminal.stemRoles,[]);assert.deepEqual(terminal.fallbackRoles,['bass']);
  response.roles['lead-vocals']={...response.roles.bass,sourceRefs:[{kind:'master'}]};
  const mixed=status();assert.equal(mixed.state,'mixed-response');assert.deepEqual(mixed.masterRoles,['lead-vocals']);assert.match(mixed.message,/master mix drives: lead vocals/);
  response.roles.bass={...response.roles.bass,sourceRefs:[{kind:'stem',assetId:'exact-asset-0'},{kind:'master'}],aggregation:'weighted-sum',weights:[0,1]};
  assert.equal(status().state,'master-response');assert.match(status().message,/measured master mix only/);assert.deepEqual(status().stemRoles,[],'zero-weight stem must not be credited');
  response.roles.bass={...response.roles['lead-vocals'],sourceRefs:[{kind:'stem',assetId:'missing'}],onUnavailable:'neutral'};
  assert.deepEqual(status().unavailableRoles,['bass']);
  delete response.roles['lead-vocals'];assert.equal(status().state,'unavailable');
  response.intensity=0;assert.equal(status().state,'response-off');
  assert.equal(livingLightResponseStatus(null,{features:'unavailable'}).state,'authored-motion');
 }finally{bank.dispose();}
});
test('numeric reconstruction sampler agrees with source evidence across maps, gaps, weights and fallbacks',()=>{
 const f=input(),bank=createLivingLightFeatureBank(f);
 try{for(const aggregation of ['max','mean','weighted-sum'])for(const onUnavailable of ['master','neutral','block']){
  const response=structuredClone(f.journey.instances[0].musicResponse);
  response.roles.bass={...response.roles.bass,sourceRefs:[{kind:'stem',assetId:'exact-asset-0'},{kind:'master'}],aggregation,onUnavailable,...(aggregation==='weighted-sum'?{weights:[.6,.4]}:{})};
  for(const unknown of [false,true]){
   if(unknown)response.roles.bass.sourceRefs[0].assetId='missing';
   const fast=createLivingLightMusicSampler(bank,response);
   for(const t of [0,150000,1000000,1999999,2000000])for(const feature of ['energy','onset','low','mid','high','pan']){
    const detailed=sampleLivingLightMusicRole(bank,response,'bass',feature,t),value=fast('bass',feature,t);
    assert.equal(value.value,detailed.value);assert.equal(['present','silent'].includes(value.availability),['present','silent'].includes(detailed.availability));
   }
  }
 }}finally{bank.dispose();}
});
import {musicOnsetEvents} from '../src/living-light/music-onsets.js';
test('display accents require measured crossings, settle on silence and do not invent events at timing gaps',()=>{
 const events=musicOnsetEvents(t=>({availability:t>=.5&&t<.8?'unknown':'present',value:t<.1||t>=1.1?0:.9}),1.5);
 assert.equal(events.length,1);assert.equal(events[0].time,.1);
 assert.deepEqual(musicOnsetEvents(()=>({availability:'unavailable',value:null}),2),[]);
 assert.deepEqual(musicOnsetEvents(()=>({availability:'present',value:.9}),2),[]);
});
test('qualified onset drives native strikes and water rings at the exact shifted Journey time',()=>{
 const f=input();f.performance.buses[1].declaredRole='Drums';
 f.performance.buses[1].frames.forEach((row,i)=>row.onsetEnvelope=i===10?.9:0);
 f.journey.instances[0].musicResponse=suggestLivingLightMusicResponse(f.performance);
 const n={...createNativeNamespace()};let water,core;
 n.HapaRenderer=class {constructor(canvas,score,cache,state){Object.assign(this,{cache,state,programs:{},buffers:[],vaos:[],targets:[]});}render(t){core=n.HapaCore.evaluate(this.cache,this.state,t);water=n.HapaWater.evaluate(this.cache,{...this.state,world:'rain-court'},t);}resize(){}dispose(){}};
 n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
 const owner=createLivingLightFeatureCache(),runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n});
 try{
  runtime.prepare({journeyRevision:f.journey,sourceBinding:{songId:f.songId,durationUs:2000000,sourceHash:f.playbackReceipt.sourceHash},generation:1,featureInput:{...f,cache:owner,requiredBytes:livingLightFeatureBytes(f.performance)}});
  const packet=runtime.evaluate({timelineUs:550000,signalTimelineUs:1050000});runtime.render(packet);
  assert(core.articulation.signals.drums.strike>0);assert.equal(water.events.length,1);
  assert(Math.abs(water.events[0].time-.4666666667)<1e-7);
  assert.equal(packet.musicResponse.events.counts.drums,1);const expected=structuredClone(water.events);
  runtime.evaluate({timelineUs:900000,signalTimelineUs:900000});
  runtime.render(packet);assert.deepEqual(water.events,expected,'render restores the packet event clock after an intervening evaluation');
  runtime.evaluate({timelineUs:550000,signalTimelineUs:1050000});
  runtime.render(runtime.evaluate({timelineUs:1550000,signalTimelineUs:1700000,reducedMotion:true}));
  assert.deepEqual(water.events,expected);
 }finally{runtime.dispose();owner.dispose();}
 const master=structuredClone(f.journey.instances[0].musicResponse);master.roles.drums.sourceRefs=[{kind:'master'}];
 const bank=createLivingLightFeatureBank(f),native=createNativeNamespace();
 const adapter=createNativeMusicResponse({native,bank,journey:{...f.journey,instances:[{...f.journey.instances[0],musicResponse:master}]},songTimeUs:t=>Math.round(t*1e6)});
 try{assert.equal(adapter.eventStems(1)[0].events.length,0,'master energy cannot masquerade as measured onset');}finally{adapter.dispose();bank.dispose();}
});
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
test('native role isolation and resting comparisons preserve participation through the response adapter',()=>{
 const f=input(),bank=createLivingLightFeatureBank(f),native=createNativeNamespace();
 const response=f.journey.instances[0].musicResponse;
 for(const role of ['lead-vocals','synth','drums'])response.roles[role]=structuredClone(response.roles.bass);
 const host=new native.HapaCore.FeatureCache({id:f.songId,duration:2,fps:30,stems:[],master:'AA==',travel:[]});
 host.score.shots=[{id:'test',start:0,end:2,rig:'portrait',locks:{}}];
 const state=native.HapaCore.initialState(host.score);state.reliquary=native.HapaReliquary.defaults();state.director=native.HapaDirector.create(host.score);
 const adapter=createNativeMusicResponse({native,bank,journey:f.journey,songTimeUs:t=>Math.round(t*1e6)});
 const original=native.HapaArticulation.evaluate;
 native.HapaArticulation.evaluate=(cache,s,t)=>cache===host?adapter.evaluate(cache,s,t):original(cache,s,t);
 try{
  const active=adapter.evaluate(host,state,1.3),disabled={...state,stems:Object.fromEntries(Object.keys(response.roles).map(id=>[id,{visual:false}]))};
  const resting=adapter.evaluate(host,disabled,1.3);
  assert(active.signals.bass.mass>.5);assert.equal(resting.signals.bass.mass,0);
  assert.equal(resting.signals['lead-vocals'].sustain,0);assert.equal(resting.signals.synth.phase,0);
  assert.equal(livingLightResponseStatus(resting.musicResponse).state,'response-off');
  const bassOnly={...disabled,stems:{...disabled.stems,bass:{visual:true}}};
  const isolated=adapter.evaluate(host,bassOnly,1.3);
  assert.equal(isolated.signals.bass.mass,active.signals.bass.mass);assert.equal(isolated.signals['lead-vocals'].mass,0);
  assert.deepEqual(livingLightResponseStatus(isolated.musicResponse).stemRoles,['bass']);
  const waterOn=native.HapaWater.evaluate(host,{...bassOnly,world:'rain-court'},1.3),waterOff=native.HapaWater.evaluate(host,{...disabled,world:'rain-court'},1.3);
  assert(waterOn.swell>waterOff.swell,'bass must change the actual water packet');
  const geometryOn=native.HapaGeometryDance.evaluate(host,bassOnly,1.3),geometryOff=native.HapaGeometryDance.evaluate(host,disabled,1.3);
  assert(geometryOn.shape[0]>geometryOff.shape[0],'bass must change radial geometry');
  const voiceOnly={...disabled,stems:{...disabled.stems,'lead-vocals':{visual:true}}};
  const voice=native.HapaGeometryDance.evaluate(host,voiceOnly,1.3);
  assert(voice.shape[2]>geometryOff.shape[2],'vocal sustain must change lateral motion');
  assert(geometryOn.shape[1]>voice.shape[1],'bass and vocal responses must remain distinct');
  assert.deepEqual(adapter.evaluate(host,bassOnly,1.3),isolated,'mask changes do not poison cached articulation');
 }finally{adapter.dispose();bank.dispose();}
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
