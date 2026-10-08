import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
import {createLivingLightFeatureCache} from '../src/domain/living-light-feature-cache.js';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64),e='e'.repeat(64);
function fixture(count=2){
 const receipt={sourceHash:a,pcmSha256:b,channels:2,fidelity:'source-equivalent-ffmpeg-decoded-float32',sampleRate:48000,durationSeconds:2};
 const frames=()=>Array.from({length:20},(_,i)=>({t:i/10,rms:.5,peak:.5,rawRms:.25,rawPeak:.25,silence:false,low:.1,mid:.2,high:.3,onsetEnvelope:0}));
 const base={originStatus:'verified',originSeconds:0,sourceSampleRate:48000,sourceChannels:2,analysisSampleRate:8000,durationSeconds:2,analyzer:{envelopeFps:10,sampleRate:8000,version:'hapa.stem-telemetry.numpy-rfft-events-cache.v6'},normalization:{method:'per-input-p99-clamp',rmsP99:.5,peakP99:.5,onsetDeltaP99:.1,bandP99:{low:1,mid:2,high:3}},frames:frames()};
 const buses=[{...structuredClone(base),id:'master',role:'master',audioHash:a}];
 const stems=[];
 for(let i=0;i<count;i++){
  const assetId='exact-asset-'+i,sourceHash=i?e:d;
  buses.push({...structuredClone(base),id:'stem:'+assetId,assetId,declaredRole:i?'mystery texture':'Drums',role:i?'mysterytexture':'drums',identityPolicy:'living-light-assets-v1',featureAvailability:{energy:true,peak:true,low:true,mid:true,high:true,onset:true},audioHash:sourceHash,originStatus:'analysis-zero-not-verified-alignment',decodedAnalysis:{digest:c,frameCount:16000,sampleRate:8000,channels:1,domain:'ffmpeg-analysis-mono-f32le'}});
  stems.push({assetId,sourceHash,declaredRole:i?'mystery texture':'Drums',canonicalRole:i?null:'drums',state:'available',alignmentState:'verified',alignmentEvidenceRef:'fixture:synthetic-reviewed-map',timeMap:[{songStartUs:500000,songEndUs:1500000,sourceStartUs:0,sourceEndUs:1000000}],paddingIntervals:[{startUs:0,endUs:500000},{startUs:1500000,endUs:2000000}]});
 }
 return {songId:'fixture-song',playbackReceipt:receipt,performance:{schemaVersion:'hapa.echo.music-performance.v1',version:'absolute-song-time-1',sourceSchemaVersion:'hapa.stem-telemetry-bundle.v1',sourcePolicy:'living-light-assets-v1',songId:'fixture-song',masterAudioHash:a,fingerprint:'sha256:'+c,durationSeconds:2,timebase:{origin:'selected-master-presentation-zero',unit:'seconds'},buses},sourceBinding:{schemaVersion:'hapa.living-light.source-binding.v1',songId:'fixture-song',bindingId:'fixture-binding',revisionId:'fixture-r1',state:'ready',master:{sourceHash:a,decoded:{digest:b,sampleRate:48000,frameCount:96000,durationSeconds:2}},stems}};
}
test('exact assets, explicit offsets and padding sample deterministically without role joins or source edits',()=>{
 const input=fixture(),before=structuredClone(input),bank=createLivingLightFeatureBank(input);
 const sample=bank.sample('exact-asset-0','energy',750000);assert.equal(sample.sourceUs,250000);assert.equal(sample.value,.5);assert.equal(sample.availability,'present');
 assert.equal(bank.sample('exact-asset-0','energy',500000).sourceUs,0);
 assert.equal(bank.sample('exact-asset-0','energy',499999).validity,'explicit-padding');
 assert.equal(bank.sample('exact-asset-0','energy',1500000).value,0);
 assert.equal(bank.sample('exact-asset-0','energy',2000000).availability,'unknown');
 bank.sample('exact-asset-0','energy',1400000);assert.deepEqual(bank.sample('exact-asset-0','energy',750000),sample);
 assert.equal(bank.identity.bytes,20*9+2*20*25);assert.equal(bank.assets()[1].canonicalRole,null);assert.deepEqual(input,before);
 assert.equal(bank.sample('master','energy',0).value,.5);assert.equal(bank.sample('exact-asset-0','beat',0).value,null);
 assert.equal(bank.identity.compatibility.onset.compatibility,'transformed');assert.match(bank.identity.compatibility.onset.units,/no beat certification/);
 bank.dispose();bank.dispose();assert.throws(()=>bank.sample('master','energy',0),{code:'feature_lease_disposed'});
});
test('missing assets, measured silence, unreviewed alignment and uncovered gaps remain distinct',()=>{
 const input=fixture();const stem=input.sourceBinding.stems[0];stem.timeMap=null;stem.paddingIntervals=[];stem.alignmentState='alignment-unverified';
 const bank=createLivingLightFeatureBank(input);assert.equal(bank.sample(stem.assetId,'energy',1000000).reason,'alignment-unverified');bank.dispose();
 const missing=fixture();missing.performance.buses[1].frames=[];missing.performance.buses[1].audioHash=null;missing.sourceBinding.stems[0].state='missing';missing.sourceBinding.stems[0].timeMap=null;missing.sourceBinding.stems[0].paddingIntervals=[];
 const m=createLivingLightFeatureBank(missing);assert.equal(m.sample('exact-asset-0','energy',0).availability,'missing');m.dispose();
 const silent=fixture();for(const f of silent.performance.buses[1].frames)Object.assign(f,{rms:0,peak:0,rawRms:0,rawPeak:0,silence:true,low:0,mid:0,high:0,onsetEnvelope:0});silent.sourceBinding.stems[0].paddingIntervals=[];
 const s=createLivingLightFeatureBank(silent);assert.equal(s.sample('exact-asset-0','energy',500000).availability,'silent');assert.equal(s.sample('exact-asset-0','onset',500000).value,0);assert.equal(s.sample('exact-asset-0','energy',0).availability,'unknown');s.dispose();
});
test('all 12 assets aggregate explicitly; missing contributions cannot be silently replaced with master',()=>{
 const input=fixture(12),bank=createLivingLightFeatureBank(input),assetIds=bank.assets().map(a=>a.assetId);
 for(const operation of ['mean','max','weighted-sum']){const r=bank.aggregate({assetIds,feature:'energy',operation,weights:assetIds.map(()=>1/12)},1000000);assert(Math.abs(r.value-.5)<1e-6);assert.equal(r.contributions.length,12);}
 assert.throws(()=>bank.aggregate({assetIds,feature:'energy',operation:'weighted-sum',weights:assetIds.map(()=>1)},0),{code:'feature_weights_invalid'});
 assert.throws(()=>bank.aggregate({assetIds:[assetIds[0],assetIds[0]],feature:'energy',operation:'max'},0),{code:'feature_aggregation_invalid'});
 assert.throws(()=>bank.sample('Drums','energy',0),{code:'feature_asset_unknown'});bank.dispose();
 input.sourceBinding.stems[0].timeMap=null;input.sourceBinding.stems[0].paddingIntervals=[];input.sourceBinding.stems[0].alignmentState='alignment-unverified';
 const unready=createLivingLightFeatureBank(input);assert.equal(unready.aggregate({assetIds,feature:'energy',operation:'mean'},1000000).value,null);
 const weights=assetIds.map((_,i)=>i===0?0:1/11);assert(Math.abs(unready.aggregate({assetIds,feature:'energy',operation:'weighted-sum',weights},1000000).value-.5)<1e-6);unready.dispose();
});
test('stale, malformed, stretched, oversized and corrupted feature inputs reject before admission',()=>{
 const mutate=[x=>x.performance.buses[1].assetId='wrong',x=>x.performance.buses[1].audioHash=a,x=>x.performance.buses[1].decodedAnalysis.digest=null,x=>x.performance.buses[1].decodedAnalysis.frameCount-=801,x=>x.performance.buses[1].analyzer.version='unknown',x=>x.performance.buses[1].frames[0].low=NaN,x=>x.performance.buses[1].frames.pop(),x=>x.performance.buses[1].frames[3].t=.35,x=>x.performance.buses[1].frames[0].rms=.9,x=>x.performance.buses[1].normalization.onsetDeltaP99=0,x=>x.sourceBinding.stems[0].timeMap[0].sourceEndUs++,x=>x.sourceBinding.stems[0].timeMap[0].sourceEndUs=3000000,x=>x.sourceBinding.stems[0].paddingIntervals[0].endUs=600000,x=>x.sourceBinding.stems[0].alignmentState='candidate',x=>x.sourceBinding.master.decoded.frameCount=48000,x=>x.performance.sourcePolicy='role',x=>x.performance.buses[1].frames[0].rawPeak=1e100,x=>x.performance.buses[1].frames[0].silence=true];
 for(const [index,edit] of mutate.entries()){const f=fixture();edit(f);assert.throws(()=>createLivingLightFeatureBank(f),undefined,`rejected mutation ${index}`);}
 assert.throws(()=>createLivingLightFeatureBank({...fixture(),maxBytes:1179}),{code:'feature_budget_exceeded'});
 const absent=fixture();absent.performance.buses[1].featureAvailability.low=false;absent.performance.buses[1].featureAvailability.onset=false;const partial=createLivingLightFeatureBank(absent);assert.equal(partial.sample('exact-asset-0','low',750000).availability,'unavailable');assert.equal(partial.sample('exact-asset-0','onset',750000).value,null);partial.dispose();
 const zero=fixture(0),bank=createLivingLightFeatureBank(zero);assert.equal(bank.identity.assetCount,0);bank.dispose();
});
test('LRU pins the active source, accounts actual arrays, evicts idle entries and closes every lease',()=>{
 const disposed=[],build=(id,size)=>()=>({identity:{bytes:size,id},sample:()=>id,dispose(){disposed.push(id);}}),cache=createLivingLightFeatureCache({maxBytes:30,maxInactive:2});
 const get=(id,size=10)=>cache.acquire({key:id,requiredBytes:size,create:build(id,size)});
 const a=get('a');assert.throws(()=>get('b'),{code:'feature_cache_source_pinned'});a.release();
 const b=get('b');b.release();const again=get('a');assert.equal(again.sample(),'a');again.release();
 const c=get('c');c.release();assert.deepEqual(disposed,['b']);assert.equal(cache.diagnostics().residentBytes,20);
 const big=get('large',30);assert.equal(cache.diagnostics().residentBytes,30);assert.equal(cache.diagnostics().activeEntries,1);assert.throws(()=>get('oversize',31),{code:'feature_cache_entry_oversize'});
 big.release();big.release();cache.dispose();cache.dispose();assert.equal(cache.diagnostics().residentBytes,0);assert.equal(new Set(disposed).size,4);assert.throws(()=>big.sample(),{code:'feature_lease_disposed'});
});
test('cancelled preparation and 20 source switches retain bounded arrays with no leaked active leases',()=>{
 const cache=createLivingLightFeatureCache({maxBytes:1024,maxInactive:4}),controller=new AbortController();controller.abort();let built=0,closed=0;
 assert.throws(()=>cache.acquire({key:'cancel',signal:controller.signal,create(){built++;}}),{code:'feature_preparation_cancelled'});assert.equal(built,0);
 const build=()=>({identity:{bytes:128},sample:()=>0,dispose(){closed++;}});
 for(let i=0;i<20;i++){const lease=cache.acquire({key:'song-'+i,requiredBytes:128,create:build});assert.equal(cache.diagnostics().activeEntries,1);lease.release();assert(cache.diagnostics().inactiveEntries<=4);assert(cache.diagnostics().residentBytes<=1024);}
 cache.dispose();assert.equal(closed,20);assert.equal(cache.diagnostics().leases,0);
 const c=new AbortController(),one=createLivingLightFeatureCache({maxBytes:1});assert.throws(()=>one.acquire({key:'late',signal:c.signal,create(){c.abort();return {identity:{bytes:1},sample(){},dispose(){closed++;}};}}),{code:'feature_preparation_cancelled'});one.dispose();assert.equal(closed,21);
});
