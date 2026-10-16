import {LIVING_LIGHT_VISUAL_HOOKS} from '../src/living-light/native-visuals.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightBasicMaster,BASIC_MASTER_VERSION} from '../src/domain/living-light-basic-master.js';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
function fixture(){return {songId:'song-exact',playbackReceipt:{sourceHash:a,pcmSha256:b,channels:2,fidelity:'source-equivalent-ffmpeg-decoded-float32',sampleRate:48000,durationSeconds:2},performance:{schemaVersion:'hapa.echo.music-performance.v1',version:'absolute-song-time-1',sourceSchemaVersion:'hapa.stem-telemetry-bundle.v1',songId:'song-exact',masterAudioHash:a,fingerprint:'sha256:'+c,durationSeconds:2,timebase:{origin:'selected-master-presentation-zero',unit:'seconds'},buses:[{id:'master',role:'master',audioHash:a,originStatus:'verified',originSeconds:0,sourceSampleRate:48000,sourceChannels:2,analysisSampleRate:24000,durationSeconds:2,analyzer:{envelopeFps:30,sampleRate:24000,version:'hapa.stem-telemetry.numpy-rfft-events-cache.v6'},normalization:{method:'per-input-p99-clamp',rmsP99:.5},frames:Array.from({length:60},(_,i)=>({t:Number((i/30).toFixed(8)),rawRms:i/120,rms:Number((i/60).toFixed(5)),silence:false}))}]}};}
test('basic master keeps native RMS meaning, exact decoded identity and deterministic source-time offsets',()=>{
 const input=fixture(),before=structuredClone(input),bank=createLivingLightBasicMaster(input);
 const sample=bank.sample(500000);assert.equal(sample.value,.25);assert.equal(sample.offsets['material.emission'],.1);assert.equal(sample.offsets['world.breath'],.0125);
 assert.equal(sample.transformationVersion,BASIC_MASTER_VERSION);assert.equal(bank.identity.stemFeatures,'unavailable');assert.equal(bank.identity.events,'unavailable');assert.equal(bank.identity.compatibility,'transformed');assert.equal(bank.identity.bytes,540);
 bank.sample(1700000);assert.deepEqual(bank.sample(500000),sample);assert.deepEqual(input,before);
 assert.doesNotThrow(()=>bank.sample(2000000));assert.throws(()=>bank.sample(2000001),{code:'source_time_outside_master'});
 bank.dispose();bank.dispose();assert.throws(()=>bank.sample(0),{code:'feature_lease_disposed'});
});
test('unknown, stale, short, gapped and semantically inconsistent envelopes refuse before play',()=>{
 const mutations=[x=>x.songId='another-song',x=>x.playbackReceipt.sourceHash=b,x=>x.playbackReceipt.pcmSha256=null,x=>x.performance.masterAudioHash=b,x=>x.performance.buses.push(structuredClone(x.performance.buses[0])),x=>x.performance.buses[0].originStatus='analysis-zero-not-verified-alignment',x=>x.performance.buses[0].originSeconds=.1,x=>x.performance.buses[0].durationSeconds=1,x=>x.performance.buses[0].frames.pop(),x=>x.performance.buses[0].frames[3].t=.9,x=>x.performance.buses[0].frames[0].rawRms=null,x=>x.performance.buses[0].frames[0].rms=.9,x=>x.performance.buses[0].normalization.method='unknown',x=>x.performance.buses[0].analyzer.version='same-field-names',x=>x.performance.fingerprint=null];
 for(const mutate of mutations){const input=fixture();mutate(input);assert.throws(()=>createLivingLightBasicMaster(input));}
});
test('explicit measured silence differs from absent measurements and never manufactures stem events',()=>{
 const input=fixture();for(const f of input.performance.buses[0].frames){f.rawRms=0;f.rms=0;f.silence=true;}
 const bank=createLivingLightBasicMaster(input);assert.equal(bank.sample(1000000).availability,'silent');assert.equal(bank.sample(1000000).value,0);
 input.performance.buses[0].frames=[];assert.throws(()=>createLivingLightBasicMaster(input),{code:'invalid_envelope_coverage'});
});
test('silence at an exact sample uses that sample and finite doubles cannot overflow the retained float curve',()=>{
 const input=fixture();input.performance.buses[0].frames[15]={t:.5,rawRms:0,rms:0,silence:true};
 const bank=createLivingLightBasicMaster(input);assert.equal(bank.sample(500000).availability,'silent');assert.equal(bank.sample(510000).availability,'present');bank.dispose();
 input.performance.buses[0].frames[15]={t:.5,rawRms:1e100,rms:1,silence:false};assert.throws(()=>createLivingLightBasicMaster(input),{code:'invalid_rms_samples'});
});

import {createLivingLightRuntime} from '../src/living-light/runtime.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
test('native host applies explicit basic offsets, holds and restores the same source state, then releases the lease',()=>{
 const registry=createLivingLightRegistry(),n={...createNativeNamespace()},input=fixture();let painted,baselinePaint,closed=0;
 const baselineEvaluate=n.HapaCore.evaluate;
 n.HapaRenderer=class {constructor(canvas,score,cache,state){Object.assign(this,{cache,state,programs:{},buffers:[],vaos:[],targets:[]});}render(t){baselinePaint=baselineEvaluate(this.cache,this.state,t);painted=n.HapaCore.evaluate(this.cache,this.state,t);}resize(){}dispose(){closed++;}};
 n.HapaRenderer.program=()=>({p:{}});for(const hook of LIVING_LIGHT_VISUAL_HOOKS)n[hook]=()=>{};
 const runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>n}),thing=registry.entries.find(t=>t.variantKind==='continuous-profile');
 const recipe={schemaVersion:'hapa.living-light.journey.v1',journeyId:'fixture:journey',revisionId:'fixture:r1',parentRevisionId:null,title:'Fixture',songId:input.songId,sourceBindingRef:null,state:'draft-unresolved',mode:'continuous',seed:109,instances:[{instanceId:'use',thingRef:{thingId:thing.thingId,revisionId:thing.revisionId},parameters:{},bindings:{}}],schedule:[{instanceId:'use',startUs:0,endUs:2000000}],actorTreatment:'none',mediaSlots:[]};
 const prepare={journeyRevision:recipe,sourceBinding:{songId:input.songId,durationUs:2000000,sourceHash:input.playbackReceipt.sourceHash},generation:1,basicMasterInput:input};
 assert.equal(runtime.prepare(prepare).state,'basic-master-response');
 const a=runtime.evaluate({timelineUs:500000});runtime.render(a);assert.equal(a.basicMasterFrame.value,.25);assert(Math.abs(painted.values['material.emission']-baselinePaint.values['material.emission']-.1)<1e-9);assert(Math.abs(painted.values['world.breath']-baselinePaint.values['world.breath']-.0125)<1e-9);
 input.performance.buses[0].frames[15].rms=1;assert.equal(runtime.evaluate({timelineUs:500000}).basicMasterFrame.value,.25);
 const held=runtime.evaluate({timelineUs:1000000,reducedMotion:true});assert.equal(held.visualUs,500000);assert.equal(held.basicMasterFrame.value,.25);
 runtime.suspend();assert.equal(runtime.evaluate({timelineUs:0}),null);runtime.restore();assert.throws(()=>runtime.render(a));
 const restored=runtime.evaluate({timelineUs:1800000,reducedMotion:true});assert.equal(restored.visualUs,500000);assert.equal(restored.basicMasterFrame.value,.25);
 assert.equal(runtime.diagnostics().ownedAudioContexts,0);assert.equal(runtime.diagnostics().ownedAnimationLoops,0);assert.equal(runtime.diagnostics().featureEvidence.bytes,540);
 runtime.prepare({...prepare,generation:3,neutralStudy:true,basicMasterInput:undefined});assert.equal(runtime.diagnostics().features,'unavailable');assert.equal(runtime.diagnostics().featureEvidence,null);
 runtime.evaluate({timelineUs:1000000});
 const neutralHeld=runtime.evaluate({timelineUs:500000,reducedMotion:true});assert.equal(neutralHeld.visualUs,1000000);assert.equal(neutralHeld.signalUs,1000000);
 runtime.dispose();runtime.dispose();assert.equal(closed,3);
});
