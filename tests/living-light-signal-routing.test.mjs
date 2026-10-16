import {LIVING_LIGHT_VISUAL_HOOKS} from '../src/living-light/native-visuals.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fixture} from './fixtures/living-light-signals.mjs';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
import {createLivingLightSignalRouter} from '../src/domain/living-light-signal-routing.js';
import {createLivingLightFeatureCache} from '../src/domain/living-light-feature-cache.js';
import {LL_SCHEMAS,validateSignalBinding} from '../src/domain/living-light-contracts.js';
import {newJourneyDraft,editJourneyDraft,editableJourney} from '../src/domain/living-light-journey.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {createLivingLightRuntime} from '../src/living-light/runtime.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {livingLightFeatureBytes} from '../src/domain/living-light-prepared-binding.js';
import {createLivingLightService} from '../server/living-light-service.mjs';
import {handleLivingLight} from '../server/living-light-routes.mjs';
import {runLivingLightCLI} from '../cli/living-light.mjs';
const registry=createLivingLightRegistry(),thing=registry.entries.find(t=>t.capabilities.continuous);
const master={kind:'master'},stem=id=>({kind:'stem',assetId:id});
const binding=(sourceRefs=[master],extra={})=>({schemaVersion:LL_SCHEMAS.signalBinding,sourceRefs,feature:'energy',aggregation:'max',onUnavailable:'neutral',...extra});
const recipe=()=>newJourneyDraft({songId:'fixture-song',durationUs:2000000,thing},registry);
test('native prepared rendering shares the one-sample endpoint rule and never stretches source time',()=>{
 for(const delta of [-21,21,22]){
  const input=fixture(0),before=structuredClone(input),owner=createLivingLightFeatureCache(),n={...createNativeNamespace()};
  n.HapaRenderer=class {constructor(){this.programs={};this.buffers=[];this.vaos=[];this.targets=[];}resize(){}render(){}dispose(){}};
  n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
  const runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n}),draft=recipe();draft.instances[0].bindings.energy=binding([master]);
  const options={journeyRevision:{...draft,journeyId:'fixture:rounding',revisionId:'fixture:r1',parentRevisionId:null},journeyDurationUs:2000000,
   sourceBinding:{songId:input.songId,durationUs:2000000+delta,sourceHash:input.playbackReceipt.sourceHash},generation:1,featureInput:{...input,cache:owner,requiredBytes:livingLightFeatureBytes(input.performance)}};
  try{
   if(delta===22){assert.throws(()=>runtime.prepare(options),/differs from selected source timeline/);assert.equal(owner.diagnostics().leases,0);continue;}
   runtime.prepare(options);
   const middle=runtime.evaluate({timelineUs:100000,signalTimelineUs:750000});assert.equal(middle.signalUs,750000);assert.equal(middle.visualUs,100000);assert.equal(runtime.render(middle),true);
   const end=runtime.evaluate({timelineUs:2000000,signalTimelineUs:2000000+delta});assert.equal(end.signalUs,Math.min(2000000,2000000+delta));assert.equal(end.visualUs,2000000);assert.equal(runtime.render(end),true);
   assert.throws(()=>runtime.evaluate({timelineUs:0,signalTimelineUs:2000001+delta}),/outside selected song/);
   assert.deepEqual(input,before);
  }finally{runtime.dispose();assert.equal(owner.diagnostics().leases,0);owner.dispose();}
 }
});
test('typed exact identities distinguish arbitrary stem IDs from master; invalid policies and weights reject',()=>{
 const good=binding([master,stem('master'),stem('Guitar / texture #2')],{aggregation:'weighted-sum',weights:[.2,.3,.5]});assert.equal(validateSignalBinding(good),good);
 for(const value of [binding([]),binding([master,master]),binding([stem('a')],{weights:[1]}),binding([master],{schemaVersion:'future'}),binding([master],{aggregation:'weighted-sum',weights:[1.1]}),binding([master,stem('a')],{aggregation:'weighted-sum',weights:[1]}),binding([master,stem('a')],{aggregation:'weighted-sum',weights:[.6,.5]}),binding([master],{feature:'onset',onUnavailable:'master'}),binding([{kind:'master',assetId:'fake'}]),binding([stem('')]),binding([master],{onUnavailable:'hold'})])assert.throws(()=>validateSignalBinding(value));
});
test('same-role and master-named stems remain separate; offsets, half-open intervals and backward seeks are deterministic',()=>{
 const input=fixture(),first=input.sourceBinding.stems[0];first.assetId='master';input.performance.buses[1].assetId='master';input.performance.buses[1].declaredRole='Guitar';input.performance.buses[2].declaredRole='Guitar';
 for(const frame of input.performance.buses[1].frames)Object.assign(frame,{rms:.25,rawRms:.125,onsetEnvelope:.8});
 const bank=createLivingLightFeatureBank(input),journey=recipe();journey.instances[0].bindings={energy:binding([stem('master'),stem('exact-asset-1')],{aggregation:'weighted-sum',weights:[.25,.75]}),onset:binding([stem('master')],{feature:'onset'})};
 const router=createLivingLightSignalRouter({journey,registry,bank}),frame=router.evaluate(750000);assert.equal(frame.ports.energy.effectiveValue,.4375);assert(Math.abs(frame.offsets['world.impulse']-.2)<1e-7);assert.equal(bank.sample(master,'energy',750000).value,.5);assert.equal(bank.sample(stem('master'),'energy',750000).value,.25);
 assert.equal(router.evaluate(499999).ports.energy.selected.availability,'silent');assert.equal(router.evaluate(500000).ports.energy.selected.availability,'present');assert.equal(router.evaluate(1500000).ports.energy.selected.availability,'silent');router.evaluate(1600000);assert.deepEqual(router.evaluate(750000),frame);bank.dispose();
});
test('unknown and unaligned sources retain intent; neutral, explicit master and block never imply a verified stem',()=>{
 const input=fixture();input.sourceBinding.stems[0].timeMap=null;input.sourceBinding.stems[0].paddingIntervals=[];input.sourceBinding.stems[0].alignmentState='alignment-unverified';const bank=createLivingLightFeatureBank(input);
 for(const policy of ['neutral','master','block']){const journey=recipe();journey.instances[0].bindings.energy=binding([stem('exact-asset-0')],{onUnavailable:policy});const r=createLivingLightSignalRouter({journey,registry,bank}).evaluate(750000);assert.equal(r.ports.energy.selected.value,null);assert.equal(r.ports.energy.selected.contributions[0].reason,'alignment-unverified');assert.equal(r.ports.energy.effectiveValue,policy==='master'?.5:0);assert.equal(r.blocked,policy==='block');assert.equal(r.ports.energy.fallback?.assetId,policy==='master'?'master':undefined);}
 const journey=recipe();journey.instances[0].bindings.energy=binding([stem('missing'),master],{aggregation:'weighted-sum',weights:[0,1]});assert.equal(createLivingLightSignalRouter({journey,registry,bank}).evaluate(750000).ports.energy.effectiveValue,.5);journey.instances[0].bindings.energy.weights=[.2,.8];assert.equal(createLivingLightSignalRouter({journey,registry,bank}).evaluate(750000).ports.energy.state,'neutral-unavailable');
 journey.instances[0].bindings.energy={source:'drums',feature:'rms',onUnavailable:'hold'};assert.throws(()=>createLivingLightSignalRouter({journey,registry,bank}),{code:'legacy_signal_binding_unqualified'});bank.dispose();
});
test('draft binding edits are independent, undoable snapshots and protected by use locks',()=>{
 const original=recipe(),id=original.instances[0].instanceId,choice=binding([stem('Guitar / texture #2')],{onUnavailable:'master'}),edited=editJourneyDraft(original,{type:'binding',instanceId:id,portId:'energy',binding:choice},registry);
 assert.deepEqual(original.instances[0].bindings,{});choice.sourceRefs[0].assetId='changed';assert.equal(edited.instances[0].bindings.energy.sourceRefs[0].assetId,'Guitar / texture #2');
 const duplicate=editJourneyDraft(edited,{type:'duplicate',instanceId:id},registry),second=duplicate.instances[1].instanceId,changed=editJourneyDraft(duplicate,{type:'binding',instanceId:second,portId:'energy',binding:binding()},registry);assert.deepEqual(changed.instances[0].bindings,edited.instances[0].bindings);
 const locked=editJourneyDraft(edited,{type:'lock',instanceId:id,value:true},registry);assert.throws(()=>editJourneyDraft(locked,{type:'binding',instanceId:id,portId:'energy',binding:null},registry),/Unlock/);assert.throws(()=>editJourneyDraft(edited,{type:'binding',instanceId:id,portId:'unknown',binding:binding()},registry));assert.deepEqual(editJourneyDraft(edited,{type:'binding',instanceId:id,portId:'energy',binding:null},registry).instances[0].bindings,{});
});
test('Location and passage uses switch exact signal choices at half-open native tour boundaries',()=>{
 const input=fixture(1);input.playbackReceipt.durationSeconds=input.performance.durationSeconds=input.sourceBinding.master.decoded.durationSeconds=20;input.sourceBinding.master.decoded.frameCount=960000;
 for(const bus of input.performance.buses){bus.durationSeconds=20;bus.frames=Array.from({length:200},(_,i)=>({...bus.frames[0],t:i/10}));if(bus.decodedAnalysis)bus.decodedAnalysis.frameCount=160000;}
 for(const f of input.performance.buses[1].frames)Object.assign(f,{rms:.25,rawRms:.125});Object.assign(input.sourceBinding.stems[0],{timeMap:[{songStartUs:0,songEndUs:20000000,sourceStartUs:0,sourceEndUs:20000000}],paddingIntervals:[]});
 const location=registry.entries.find(t=>t.capabilities.destination),next=registry.entries.filter(t=>t.capabilities.destination)[1],bridge=registry.entries.find(t=>t.capabilities.bridge),ref=t=>({thingId:t.thingId,revisionId:t.revisionId});
 let draft=newJourneyDraft({songId:input.songId,durationUs:20000000,thing:location,mode:'tour'},registry);draft=editJourneyDraft(draft,{type:'add',thingRef:ref(next),bridgeRef:ref(bridge)},registry);
 const ids=draft.schedule.map(row=>row.instanceId);draft.instances.find(i=>i.instanceId===ids[0]).bindings.energy=binding();draft.instances.find(i=>i.instanceId===ids[1]).bindings.energy=binding([stem('exact-asset-0')]);draft.instances.find(i=>i.instanceId===ids[2]).bindings.energy=binding([stem('absent')],{onUnavailable:'master'});
 const owner=createLivingLightFeatureCache(),n={...createNativeNamespace()};n.HapaRenderer=class{constructor(){Object.assign(this,{programs:{},buffers:[],vaos:[],targets:[]});}render(){}resize(){}dispose(){}};n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
 const runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n});try{runtime.prepare({journeyRevision:{...draft,journeyId:'fixture:tour',revisionId:'fixture:r1',parentRevisionId:null},sourceBinding:{songId:input.songId,sourceHash:input.playbackReceipt.sourceHash,durationUs:20000000},generation:1,featureInput:{...input,cache:owner,requiredBytes:livingLightFeatureBytes(input.performance)}});
 const before=runtime.evaluate({timelineUs:5999999}).signalRouting,travel=runtime.evaluate({timelineUs:6000000}).signalRouting,after=runtime.evaluate({timelineUs:14000000}).signalRouting;assert.equal(before.instanceId,ids[0]);assert.equal(before.ports.energy.effectiveValue,.5);assert.equal(travel.instanceId,ids[1]);assert.equal(travel.ports.energy.effectiveValue,.25);assert.equal(after.instanceId,ids[2]);assert.equal(after.ports.energy.state,'explicit-master-fallback');assert.equal(runtime.evaluate({timelineUs:20000000}).signalRouting.instanceId,ids[2]);assert.deepEqual(runtime.evaluate({timelineUs:6000000}).signalRouting,travel);
 }finally{runtime.dispose();owner.dispose();}
});
test('protected owner persistence, restart and portable metadata preserve exact sources, weights and fallback',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-signal-routing-')),caller={mode:'authenticated-api',actor:{actorId:'agent:test',kind:'agent',displayName:'Fixture'}};
 let service=createLivingLightService({root,resolveSong:async id=>({id})});
 const fetcher=async(url,options)=>{let response;await handleLivingLight({req:{method:options.method,headers:options.headers},res:{},url:new URL(url),service,authorize:()=>{assert.equal(options.headers.authorization,'Bearer fixture-only');return caller;},readBody:async()=>JSON.parse(options.body),sendJson:(_,status,body)=>{response=new Response(JSON.stringify(body),{status});}});return response;};
 const cli=args=>runLivingLightCLI(args,{env:{HAPA_AVATAR_ADMIN_TOKEN:'fixture-only'},fetcher});
 try{const draft=recipe();draft.instances[0].bindings.energy=binding([master,stem('Guitar / texture #2'),stem('master')],{aggregation:'weighted-sum',weights:[.2,.3,.5],onUnavailable:'master'});const file=path.join(root,'request.json');await fs.writeFile(file,JSON.stringify({journey:draft,expectedRevision:null,idempotencyKey:'fixture-routing-save'}));assert.equal((await cli(['save','--kind','journey','--file',file,'--dry-run'])).valid,true);const saved=await cli(['save','--kind','journey','--file',file]);service.close();service=createLivingLightService({root,resolveSong:async id=>({id})});assert.deepEqual((await cli(['get','--kind','journey','--id',saved.journey.journeyId])).journey.instances[0].bindings,draft.instances[0].bindings);
 const {package:packet}=service.exportPackage({kind:'journey',id:saved.journey.journeyId,revision:saved.journey.revisionId});assert.deepEqual(packet.journey.instances[0].bindings,draft.instances[0].bindings);const preview=await service.importPreview(packet);assert.equal(preview.canCommit,true);assert.deepEqual(preview.journey.instances[0].bindings,draft.instances[0].bindings);assert.equal(service.capabilities().schemas.signalBinding,LL_SCHEMAS.signalBinding);
 const invalid=editableJourney(saved.journey);invalid.instances[0].bindings.energy.weights=[1,1,1];await assert.rejects(service.saveJourney({journey:invalid,expectedRevision:null,idempotencyKey:'invalid-routing'},caller),{code:'signal_weights_excess'});assert.equal(service.listJourneys().total,1);
 }finally{service.close();await fs.rm(root,{recursive:true,force:true});}
});
test('native host applies selected ports after inherited baselines, blocks unavailable painting and releases one cache lease',()=>{
 const input=fixture(),owner=createLivingLightFeatureCache(),n={...createNativeNamespace()};let painted,baseline,draws=0;const nativeEvaluate=n.HapaCore.evaluate;
 n.HapaRenderer=class {constructor(canvas,score,cache,state){Object.assign(this,{cache,state,programs:{},buffers:[],vaos:[],targets:[]});}render(t){draws++;baseline=nativeEvaluate(this.cache,this.state,t);painted=n.HapaCore.evaluate(this.cache,this.state,t);}resize(){}dispose(){}};n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
 const runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n}),draft=recipe();draft.instances[0].bindings.energy=binding([stem('exact-asset-0')]);draft.instances[0].bindings.onset=binding([stem('exact-asset-0')],{feature:'onset'});for(const f of input.performance.buses[1].frames)f.onsetEnvelope=.8;
 const journey={...draft,journeyId:'fixture:journey',revisionId:'fixture:r1',parentRevisionId:null},prepare={journeyRevision:journey,sourceBinding:{songId:input.songId,durationUs:2000000,sourceHash:input.playbackReceipt.sourceHash},generation:1,featureInput:{...input,cache:owner,requiredBytes:livingLightFeatureBytes(input.performance)}};
 assert.equal(runtime.prepare(prepare).features,'exact-asset-port-response');const packet=runtime.evaluate({timelineUs:750000});assert.equal(runtime.render(packet),true);assert(Math.abs(painted.values['material.emission']-baseline.values['material.emission']-.2)<1e-9);assert(Math.abs(painted.values['world.impulse']-baseline.values['world.impulse']-.2)<1e-7);
 runtime.evaluate({timelineUs:1600000});assert.deepEqual(runtime.evaluate({timelineUs:750000}).signalRouting,packet.signalRouting);journey.instances[0].bindings.energy=binding([stem('not-selected')],{onUnavailable:'block'});runtime.prepare({...prepare,generation:2});assert.equal(runtime.render(runtime.evaluate({timelineUs:750000})),false);assert.equal(draws,1);assert.equal(owner.diagnostics().leases,1);runtime.suspend();runtime.restore();assert.equal(runtime.diagnostics().signalRouting.blocked,true);runtime.dispose();assert.equal(owner.diagnostics().leases,0);owner.dispose();assert.equal(owner.diagnostics().residentBytes,0);
});

test('Director offset samples current song signals while native route and media retain Journey time',()=>{
 const input=fixture(),owner=createLivingLightFeatureCache(),n={...createNativeNamespace()};let painted,baseline;
 const original=n.HapaCore.evaluate;
 n.HapaRenderer=class{constructor(canvas,score,cache,state){Object.assign(this,{cache,state,programs:{},buffers:[],vaos:[],targets:[]});}render(t){baseline=original(this.cache,this.state,t);painted=n.HapaCore.evaluate(this.cache,this.state,t);}resize(){}dispose(){}};n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
 const draft=recipe();draft.schedule[0].endUs=1000000;draft.instances[0].bindings.energy=binding([stem('exact-asset-0')]);
 const runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n});
 try{
 runtime.prepare({journeyRevision:{...draft,journeyId:'fixture:offset',revisionId:'fixture:r1',parentRevisionId:null},journeyDurationUs:1000000,sourceBinding:{songId:input.songId,durationUs:2000000,sourceHash:input.playbackReceipt.sourceHash},generation:1,featureInput:{...input,cache:owner,requiredBytes:livingLightFeatureBytes(input.performance)}});
 const frame=runtime.evaluate({timelineUs:100000,signalTimelineUs:750000});assert.equal(frame.visualUs,100000);assert.equal(frame.signalUs,750000);assert.equal(frame.signalRouting.ports.energy.effectiveValue,.5);assert.equal(runtime.render(frame),true);assert(Math.abs(painted.values['material.emission']-baseline.values['material.emission']-.2)<1e-9);
 const held=runtime.evaluate({timelineUs:200000,signalTimelineUs:850000,reducedMotion:true});assert.equal(held.visualUs,100000);assert.equal(held.signalUs,750000);
 const silent=runtime.evaluate({timelineUs:100000,signalTimelineUs:100000});assert.equal(silent.signalRouting.ports.energy.effectiveValue,0);runtime.render(silent);assert(Math.abs(painted.values['material.emission']-baseline.values['material.emission'])<1e-9);assert.deepEqual(runtime.evaluate({timelineUs:100000,signalTimelineUs:750000}).signalRouting,frame.signalRouting);
 assert.throws(()=>runtime.evaluate({timelineUs:1000001,signalTimelineUs:750000}),/outside/);assert.throws(()=>runtime.evaluate({timelineUs:1,signalTimelineUs:2000001}),/outside/);
 }finally{runtime.dispose();owner.dispose();}
});
