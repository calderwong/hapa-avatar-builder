import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyAtlasVisualTiming} from '../src/domain/audio-atlas-visual-timing.js';
function fixture(){
 const master={id:'master',status:'ready',source_sha256:'a'.repeat(64),decoded_sha256:'b'.repeat(64),timeline_id:'master:clock',sample_rate_hz:48000,sample_count:960000};
 const asset={...master,id:'stem-1',source_sha256:'c'.repeat(64),decoded_sha256:'d'.repeat(64),timeline_id:'stem:clock'};
 asset.alignment_evidence={schema_version:'hapa.audio-atlas.stem-alignment.v1',source_asset_id:asset.id,source_sha256:asset.source_sha256,master_sha256:master.source_sha256,source_timeline_id:asset.timeline_id,master_timeline_id:master.timeline_id,source_rate_hz:48000,master_rate_hz:48000,source_sample_count:960000,master_sample_count:960000,status:'affine_alignment_candidate',lag_convention:'positive places stem samples later on the master clock',analysis_rate_hz:8000,drift_ppm:0,alignment_applied:false,quality_qualified:false,windows:[0,5,10,15].map(start=>({status:'measured',atSearchBoundary:false,correlation:.8,peakMargin:.3,lagSeconds:.1,source_start_sample:start*48000,source_end_sample:(start+4)*48000}))};
 return {resultSha256:'e'.repeat(64),result:{song_id:'song',run_id:'run',assets:[master,asset]},performance:{songId:'song',sourcePolicy:'living-light-assets-v1',durationSeconds:20,masterAudioHash:master.source_sha256,buses:[{id:'master'},{id:'stem:exact',assetId:'exact',audioHash:asset.source_sha256,frames:[{}],decodedAnalysis:{digest:'f'.repeat(64),frameCount:160000,sampleRate:8000}}]}};
}
test('qualifies a bounded constant visual offset without applying the Atlas proposal or changing sources',()=>{
 const f=fixture(),before=JSON.stringify(f),r=qualifyAtlasVisualTiming(f),row=r.rows[0];
 assert.equal(row.state,'qualified');assert.equal(row.offsetUs,100000);
 assert.deepEqual(row.timeMap,[{sourceStartUs:0,sourceEndUs:19000000,songStartUs:100000,songEndUs:19100000}]);
 assert.deepEqual(row.paddingIntervals,[]);assert.equal(r.atlasProposalApplied,false);assert.equal(JSON.stringify(f),before);
 for(const w of f.result.assets[1].alignment_evidence.windows)w.lagSeconds=-.1;
 assert.deepEqual(qualifyAtlasVisualTiming(f).rows[0].timeMap,[{sourceStartUs:100000,sourceEndUs:19000000,songStartUs:0,songEndUs:18900000}]);
});
test('refuses stale identities, weak/contradictory evidence, drift and duration mismatch',()=>{
 const mutations=[f=>f.result.assets[0].source_sha256='f'.repeat(64),f=>f.result.assets[1].alignment_evidence.source_sha256='f'.repeat(64),f=>f.result.assets[1].sample_count++,f=>f.performance.buses[1].decodedAnalysis.frameCount+=1000,f=>f.result.assets[1].alignment_evidence.windows[0].correlation=.17,f=>f.result.assets[1].alignment_evidence.windows[1].lagSeconds=.2,f=>f.result.assets[1].alignment_evidence.drift_ppm=1000,f=>f.result.assets[1].alignment_evidence.windows[1].source_start_sample=0,f=>f.result.assets.push(structuredClone(f.result.assets[1])),f=>f.result.assets[1].alignment_evidence.status='ambiguous_or_insufficient_evidence'];
 for(const mutate of mutations){const f=fixture();mutate(f);const row=qualifyAtlasVisualTiming(f).rows[0];assert.equal(row.state,'unqualified',row.reason);assert.deepEqual(row.timeMap,[]);}
});

import {applyAtlasVisualTiming} from '../src/domain/audio-atlas-visual-timing.js';
test('qualifier and consumer agree on rounded prepared duration at the final source window',()=>{
 for(const offset of [0,.1,-.1]){
  const f=fixture(),p=f.performance;
  p.durationSeconds=19.999975;p.stemSelectionPolicy='coherent-stems-v1';
  const e=f.result.assets[1].alignment_evidence;
  e.windows.at(-1).source_end_sample=960000;
  for(const w of e.windows)w.lagSeconds=offset;
  p.visualTiming=qualifyAtlasVisualTiming(f);
  const row=p.visualTiming.rows[0];assert.equal(row.state,'qualified');
  assert.ok(row.timeMap[0].songEndUs<=Math.floor(p.durationSeconds*1e6));
  assert.doesNotThrow(()=>applyAtlasVisualTiming({songId:p.songId,master:{sourceHash:p.masterAudioHash},stems:[{assetId:'exact',sourceHash:p.buses[1].audioHash}]},p));
 }
});
import {livingLightPreparedBinding} from '../src/domain/living-light-prepared-binding.js';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
import {fixture as signalFixture} from './fixtures/living-light-signals.mjs';

test('qualified timing reaches exact feature sampling, reverse seek and unknown boundaries',()=>{
 const f=fixture(),s=signalFixture(1),p=s.performance;
 p.songId=f.performance.songId;p.durationSeconds=20;p.stemSelectionPolicy='coherent-stems-v1';
 for(const b of p.buses){b.durationSeconds=20;b.frames=Array.from({length:200},(_,i)=>({...b.frames[0],t:i/10,rms:i/200,rawRms:i/400}));}
 p.buses[1].assetId='exact';p.buses[1].audioHash=f.performance.buses[1].audioHash;
 p.buses[1].decodedAnalysis={...p.buses[1].decodedAnalysis,...f.performance.buses[1].decodedAnalysis};
 p.visualTiming=qualifyAtlasVisualTiming({...f,performance:p});
 const playbackReceipt={...s.playbackReceipt,durationSeconds:20},args={songId:p.songId,performance:p,playbackReceipt};
 const sourceBinding=livingLightPreparedBinding(args),bank=createLivingLightFeatureBank({...args,sourceBinding});
 try{
  assert.equal(sourceBinding.stems[0].alignmentScope,'visual-envelope-constant-offset');
  const at=bank.sample('exact','energy',5100000);assert.equal(at.sourceUs,5000000);assert.equal(at.value,.25);
  bank.sample('exact','energy',15100000);assert.deepEqual(bank.sample('exact','energy',5100000),at);
  assert.equal(bank.sample('exact','energy',0).reason,'unmapped-song-interval');
  assert.equal(bank.sample('exact','energy',19100000).reason,'unmapped-song-interval');
 }finally{bank.dispose();}
 for(const mutate of [x=>x.visualTiming.rows[0].sourceHash='0'.repeat(64),x=>x.visualTiming.rows[0].timeMap[0].sourceStartUs=-1,x=>x.visualTiming.rows[0].timeMap[0].sourceEndUs=21000000,x=>x.visualTiming.rows[0].sourceDecodedDigest='0'.repeat(64),x=>x.visualTiming.rows[0].state='unqualified',x=>x.stemSelectionPolicy=null]){
  const bad=structuredClone(p);mutate(bad);assert.throws(()=>livingLightPreparedBinding({...args,performance:bad}),{code:'visual_timing_identity_mismatch'});
 }
 const legacy=structuredClone(p);delete legacy.visualTiming;delete legacy.stemSelectionPolicy;
 assert.equal(livingLightPreparedBinding({...args,performance:legacy}).stems[0].timeMap,null);
 const unqualified=structuredClone(p);unqualified.visualTiming.rows[0]={assetId:'exact',state:'unqualified',reason:'weak',timeMap:[],paddingIntervals:[]};
 assert.equal(livingLightPreparedBinding({...args,performance:unqualified}).stems[0].alignmentState,'alignment-unverified');
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {publishEchoPerformance,createPreparedEchoPerformanceStore} from '../server/echo-prepared-performance-store.mjs';
import {qualifyLivingLightPreparedTiming} from '../server/audio-atlas-visual-timing.mjs';

test('owner publishes checked evidence once, preserves legacy bank and refuses changed bytes',{timeout:10000},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-visual-timing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=async name=>{const bytes=Buffer.from('RIFF0000WAVE-'+name),file=path.join(root,name);await fs.writeFile(file,bytes);return {path:file,sha256:createHash('sha256').update(bytes).digest('hex')};};
 const master=await source('master.wav'),stem=await source('stem.wav'),f=fixture(),p=f.performance;
 p.schemaVersion='hapa.echo.music-performance.v1';p.fingerprint='original';p.masterAudioHash=master.sha256;p.buses[0].audioHash=master.sha256;p.buses[1].audioHash=stem.sha256;
 f.result.assets[0].source_sha256=master.sha256;f.result.assets[1].source_sha256=stem.sha256;
 Object.assign(f.result.assets[1].alignment_evidence,{master_sha256:master.sha256,source_sha256:stem.sha256});
 const sourceChecks=[{...master,role:'master'},{...stem,assetId:'exact',role:'Drums'}],preparedStore=createPreparedEchoPerformanceStore({root});
 const input={songId:'song',sourcePolicy:p.sourcePolicy,masterPath:master.path,stems:[{assetId:'exact',audioPath:stem.path}],lyrics:{}};
 await publishEchoPerformance({root,bundle:p,sourceChecks});const old=(await preparedStore.load(input)).performance.fingerprint;
 await publishEchoPerformance({root,bundle:{...p,stemSelectionPolicy:'coherent-stems-v1'},sourceChecks});
 const before=(await preparedStore.load({...input,stemSelectionPolicy:'coherent-stems-v1'})).performance.fingerprint;
 let reads=0;const args={songId:'song',stemSelectionPolicy:'coherent-stems-v1',root,performanceCacheRoot:root,preparedStore,readSongStore:async()=>({songs:[{id:'song',title:'Song',audio:{localPath:master.path},stems:[{id:'exact',stemType:'Drums',localPath:stem.path}]}]}),atlasOwner:{jobs:()=>[{id:'run',state:'complete',result_sha256:f.resultSha256}],result:()=>{reads++;return structuredClone(f.result);}}};
 const result=await qualifyLivingLightPreparedTiming(args);assert.equal(result.qualified,1);assert.equal(result.reused,false);assert.notEqual(result.fingerprint,before);
 assert.equal((await preparedStore.load(input)).performance.fingerprint,old);
 assert.equal((await qualifyLivingLightPreparedTiming(args)).fingerprint,result.fingerprint);assert.equal(reads,1);
 await assert.rejects(qualifyLivingLightPreparedTiming({...args,stemSelectionPolicy:null}),{code:'visual_timing_coherent_required'});
 await fs.appendFile(stem.path,'changed');await assert.rejects(qualifyLivingLightPreparedTiming(args),{code:'echo_performance_source_changed'});
});
