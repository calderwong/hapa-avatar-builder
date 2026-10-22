import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {livingLightPerformanceInputs} from '../server/living-light-performance-inputs.mjs';
import {publishEchoPerformance,createPreparedEchoPerformanceStore} from '../server/echo-prepared-performance-store.mjs';
import {createLivingLightPreparedInputResolver} from '../src/domain/living-light-prepared-input.js';
import {livingLightPreparedBinding} from '../src/domain/living-light-prepared-binding.js';
import {fixture} from './fixtures/living-light-signals.mjs';
import {createEchoPerformancePreparation} from '../server/echo-performance-preparation.mjs';
import {createLivingLightPerformancePort} from '../server/living-light-performance-port.mjs';
const policy='coherent-stems-v1';

test('coherent preparation chooses one generation, prefers WAV per role and keeps exact declaration IDs',()=>{
 const stems=Array.from({length:12},(_,i)=>({id:'old'+i,stemType:'Role '+i,title:'Old (Role '+i+')',localPath:'/old/'+i+'.wav'}));
 for(const format of ['mp3','wav'])for(let i=0;i<12;i++)stems.push({id:format+i,stemType:i===0?'0-lead-vocals':'Role '+i,title:'Current (Role '+i+')',localPath:'/current/stems/'+i+'.'+format});
 const song={id:'song',title:'Current',audio:{localPath:'/current/master.wav'},stems},songStore={songs:[song]},before=JSON.stringify(songStore);
 assert.throws(()=>livingLightPerformanceInputs({songId:'song',songStore}),{code:'living_light_asset_budget'});
 const result=livingLightPerformanceInputs({songId:'song',songStore,stemSelectionPolicy:policy});
 assert.equal(result.graph.source.stemSelectionPolicy,policy);
 assert.equal(result.graph.stems.items.length,12);
 assert(result.graph.stems.items.every(s=>s.assetId.startsWith('wav')));
 assert.equal(result.graph.stems.items[0].declaredRole,'lead-vocals');
 assert.equal(result.graph.stems.items[0].canonicalRole,'lead-vocals');
 assert.equal(JSON.stringify(songStore),before);
 assert.throws(()=>livingLightPerformanceInputs({songId:'song',songStore,stemSelectionPolicy:'unknown'}),{code:'living_light_selection_invalid'});
});

test('coherent publication leaves the legacy prepared fingerprint and source set intact',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-coherent-store-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=async name=>{const bytes=Buffer.from('RIFF0000WAVE-'+name),file=path.join(root,name);await fs.writeFile(file,bytes);return {path:file,sha256:createHash('sha256').update(bytes).digest('hex')};};
 const master=await source('master.wav'),a=await source('a.wav'),b=await source('b.wav');
 const bundle={schemaVersion:'hapa.echo.music-performance.v1',sourcePolicy:'living-light-assets-v1',songId:'song',masterAudioHash:master.sha256,fingerprint:'original',buses:[{id:'master',role:'master',audioHash:master.sha256},{id:'stem:a',assetId:'a',role:'drums',audioHash:a.sha256,frames:[{t:0}]},{id:'stem:b',assetId:'b',role:'drums',audioHash:b.sha256,frames:[{t:0}]}]};
 const checks=[{...master,role:'master'},{...a,role:'drums',assetId:'a'},{...b,role:'drums',assetId:'b'}];
 const input={masterPath:master.path,songId:'song',sourcePolicy:bundle.sourcePolicy,stems:[{assetId:'a',audioPath:a.path},{assetId:'b',audioPath:b.path}]};
 await publishEchoPerformance({root,bundle,sourceChecks:checks});
 const store=createPreparedEchoPerformanceStore({root}),legacy=await store.load(input);
 await assert.rejects(store.load({...input,stemSelectionPolicy:policy}),{code:'echo_performance_not_prepared'});
 await publishEchoPerformance({root,bundle:{...bundle,stemSelectionPolicy:policy,buses:bundle.buses.slice(0,2)},sourceChecks:checks.slice(0,2)});
 const coherent=await store.load({...input,stemSelectionPolicy:policy,stems:input.stems.slice(0,1)});
 assert.equal(coherent.performance.stemSelectionPolicy,policy);
 assert.notEqual(coherent.performance.fingerprint,legacy.performance.fingerprint);
 assert.deepEqual((await store.load(input)).performance,legacy.performance);
 assert.equal((await store.load(input)).performance.fingerprint,legacy.performance.fingerprint);
 await assert.rejects(store.load({...input,stemSelectionPolicy:policy}),{code:'echo_performance_stem_revision_mismatch'});
});

test('saved coherent and legacy bindings request their own banks and cannot silently substitute',async()=>{
 const f=fixture(0),legacy=f.performance,coherent={...structuredClone(legacy),stemSelectionPolicy:policy,fingerprint:'sha256:'+'c'.repeat(64)},requests=[];
 const binding=performance=>livingLightPreparedBinding({...f,performance});
 const journey=performance=>({songId:f.songId,instances:[],sourceBindingRef:binding(performance)});
 const resolver=createLivingLightPreparedInputResolver({...f,performance:null,request:async url=>{requests.push(url);return {songId:f.songId,sourcePolicy:legacy.sourcePolicy,performance:url.includes('stemSelectionPolicy')?coherent:legacy,sourceValidation:{analysisExecuted:false,masterAudioHash:f.playbackReceipt.sourceHash}};}});
 assert(binding(coherent).bindingId.startsWith('prepared-coherent:'));
 assert.equal((await resolver(journey(coherent))).featureInput.performance.stemSelectionPolicy,policy);
 assert.equal((await resolver(journey(legacy))).featureInput.performance.stemSelectionPolicy,undefined);
 await resolver(journey(coherent));assert.equal(requests.length,2);
 const wrong=createLivingLightPreparedInputResolver({...f,performance:null,request:async()=>({songId:f.songId,sourcePolicy:legacy.sourcePolicy,performance:legacy})});
 await assert.rejects(wrong(journey(coherent)),{code:'prepared_source_mismatch'});
});

test('actual preparation carries coherent selection through analysis, publication and protected owner read',{timeout:60000},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-coherent-owner-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const bytes=Buffer.alloc(44+16000*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(32000,40);
 for(let i=0;i<16000;i++)bytes.writeInt16LE(Math.round(8000*Math.sin(i*2*Math.PI*220/8000)),44+i*2);
 const master=path.join(root,'master.wav'),stem=path.join(root,'stem.wav');await fs.writeFile(master,bytes);await fs.writeFile(stem,bytes);
 const songStore={songs:[{id:'coherent-fixture',title:'Fixture',audio:{localPath:master},stems:[{id:'mp3',stemType:'0-lead-vocals',localPath:path.join(root,'absent.mp3')},{id:'wav',stemType:'Lead Vocals',localPath:stem}]}]};
 const preparedStore=createPreparedEchoPerformanceStore({root:path.join(root,'performance')});
 const service=createEchoPerformancePreparation({root:process.cwd(),jobRoot:path.join(root,'jobs'),analysisCacheRoot:path.join(root,'analysis'),performanceCacheRoot:path.join(root,'performance')});
 t.after(()=>service.close());
 const port=createLivingLightPerformancePort({readSongStore:async()=>songStore,preparation:service,preparedStore});
 const params={songId:'coherent-fixture',requestId:'coherent-fixture-request',stemSelectionPolicy:policy};
 const job=await port.prepare(params);
 try{
  const deadline=Date.now()+45000;
  while(['queued','running','cancelling'].includes(service.get(job.id).status)){
   if(Date.now()>deadline)throw Error('Owned coherent fixture exceeded 45 seconds');
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(port.status(params).status,'ready',port.status(params).message);
  assert.equal(port.status(params).outputTail,'');
  assert.throws(()=>port.status({...params,stemSelectionPolicy:null}),{code:'living_light_job_mismatch'});
  const result=await port.read(params);
  assert.equal(result.performance.stemSelectionPolicy,policy);
  assert.deepEqual(result.performance.buses.map(b=>b.id),['master','stem:wav']);
  assert(result.performance.buses[1].frames.length>1);
  assert.equal(result.sourceValidation.analysisExecuted,false);
  await assert.rejects(port.read({songId:params.songId}),{code:'echo_performance_not_prepared'});
  assert.deepEqual(await fs.readFile(master),bytes);assert.deepEqual(await fs.readFile(stem),bytes);
 }finally{await service.close();}
});
