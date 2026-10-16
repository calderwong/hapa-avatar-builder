import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveEchoRuntimeMediaUri} from '../server/echo-runtime-media-route.mjs';
import {livingLightPerformanceInputs} from '../server/living-light-performance-inputs.mjs';
import {publishEchoPerformance,createPreparedEchoPerformanceStore} from '../server/echo-prepared-performance-store.mjs';
import {buildEchoMusicPerformance} from '../src/domain/echo-music-performance.js';
import {runEchoPreparationStage} from '../server/echo-performance-preparation.mjs';
test('explicit preparation preserves exact IDs, same-role peers, unknown roles and original declaration indexes',()=>{
 const songStore={songs:[{id:'fixture:exact',audio:{localPath:'/fixture/master.wav'},stems:[{id:'archive',kind:'archive-zip',uri:'/fixture/stems.zip'},{id:'first',stemType:'Drums',localPath:'/fixture/a.wav'},{id:'second',stemType:'Drums',localPath:'/fixture/b.wav'},{stemType:'Unmapped texture',uri:'/fixture/u.wav'},{id:'missing',stemType:'Drums'}]}]},before=structuredClone(songStore);
 const x=livingLightPerformanceInputs({songId:'fixture:exact',songStore});
 assert.equal(x.graph.source.identityPolicy,'living-light-assets-v1');assert.deepEqual(x.graph.stems.items.map(s=>s.assetId),['first','second','fixture:exact:declared:3','missing']);
 assert.equal(x.graph.stems.items[2].canonicalRole,null);assert.equal(x.graph.stems.items[3].audioPath,null);assert.equal(x.graph.stems.items[1].audioPath,'/fixture/b.wav');assert.equal(x.masterPath,'/fixture/master.wav');assert.deepEqual(songStore,before);
 songStore.songs[0].stems.push({...songStore.songs[0].stems[1]});assert.throws(()=>livingLightPerformanceInputs({songId:'fixture:exact',songStore}),{code:'living_light_asset_ambiguous'});
});
test('exact master registry routes reject title-only matches, duplicate identities and missing Songs',()=>{
 const songStore={songs:[{id:'exact',audio:{registryTrackId:'registered'},stems:[]}]},resolveOptions={registryPayload:{songs:[{id:'other',title:'registered',localPath:'/wrong.wav'}]},songStorePayload:{songs:[]}};
 assert.throws(()=>livingLightPerformanceInputs({songId:'exact',songStore,resolveOptions}),{code:'living_light_master_unavailable'});
 resolveOptions.registryPayload.songs=[{id:'registered',localPath:'/right.wav'}];assert.equal(livingLightPerformanceInputs({songId:'exact',songStore,resolveOptions}).masterPath,'/right.wav');
 resolveOptions.registryPayload.songs.push({...resolveOptions.registryPayload.songs[0]});assert.throws(()=>livingLightPerformanceInputs({songId:'exact',songStore,resolveOptions}),{code:'living_light_master_unavailable'});
 assert.throws(()=>livingLightPerformanceInputs({songId:'unknown',songStore}),{code:'living_light_song_ambiguous'});
 const duplicateLocal={registryPayload:{songs:[]},songStorePayload:{songs:[{id:'a',registryTrackId:'registered',audio:{localPath:'/a.wav'}},{id:'b',registryTrackId:'registered',audio:{localPath:'/b.wav'}}]}};
 assert.equal(resolveEchoRuntimeMediaUri('/api/song-registry/audio/registered',{...duplicateLocal,exactIdentityOnly:true}).ok,false);
 assert.equal(resolveEchoRuntimeMediaUri('/api/song-registry/audio/registered',duplicateLocal).resolvedPath,'/a.wav');
 const duplicateCards={registryPayload:{songs:[{id:'registered',localPath:'/right.wav'}]},songbookPayload:{songCards:[{id:'dear-papa-song-exact',registryTrackId:'registered'},{id:'dear-papa-song-exact',registryTrackId:'registered'}]},songStorePayload:{songs:[]}};
 assert.equal(resolveEchoRuntimeMediaUri('/api/song-registry/audio/dear-papa-song-exact',{...duplicateCards,exactIdentityOnly:true}).ok,false);
});
test('exact asset publications coexist with legacy Echo and reject swapped role peers or changed declarations',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-exact-publication-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 async function source(name){const file=path.join(root,name);const bytes=Buffer.from('RIFF0000WAVE-'+name);await fs.writeFile(file,bytes);return {path:file,sha256:createHash('sha256').update(bytes).digest('hex')};}
 const master=await source('master.wav'),first=await source('first.wav'),second=await source('second.wav');
 const input={masterPath:master.path,songId:'exact-song',sourcePolicy:'living-light-assets-v1',stems:[{assetId:'a',stemType:'Drums',audioPath:first.path},{assetId:'b',stemType:'Drums',audioPath:second.path},{assetId:'missing',stemType:'Drums',audioPath:path.join(root,'absent.wav')}]};
 const bundle={schemaVersion:'hapa.echo.music-performance.v1',sourcePolicy:input.sourcePolicy,songId:input.songId,masterAudioHash:master.sha256,fingerprint:'original',buses:[{id:'master',role:'master',audioHash:master.sha256},{id:'stem:a',assetId:'a',role:'drums',audioHash:first.sha256,frames:[{t:0}]},{id:'stem:b',assetId:'b',role:'drums',audioHash:second.sha256,frames:[{t:0}]},{id:'stem:missing',assetId:'missing',role:'drums',audioHash:null,frames:[],status:'missing-analysis'}]};
 const checks=[{...master,role:'master'},{...first,role:'drums',assetId:'a'},{...second,role:'drums',assetId:'b'}];
 await publishEchoPerformance({root,bundle,sourceChecks:checks});
 const store=createPreparedEchoPerformanceStore({root});assert.equal((await store.load(input)).performance.buses.length,4);
 await publishEchoPerformance({root,bundle:{schemaVersion:bundle.schemaVersion,masterAudioHash:master.sha256,fingerprint:'legacy',buses:[{id:'master',role:'master',audioHash:master.sha256}]},sourceChecks:[checks[0]]});
 await fs.writeFile(input.stems[2].audioPath,Buffer.from('RIFF0000WAVE-now-present'));
 await assert.rejects(store.load(input),{code:'echo_performance_stem_revision_mismatch'});await fs.rm(input.stems[2].audioPath);
 assert.equal((await store.load(input)).performance.sourcePolicy,input.sourcePolicy);assert.equal((await store.load({masterPath:master.path})).performance.sourcePolicy,undefined);
 await assert.rejects(store.load({...input,stems:[{...input.stems[0],audioPath:second.path},...input.stems.slice(1)]}),{code:'echo_performance_stem_revision_mismatch'});
 await assert.rejects(store.load({...input,stems:input.stems.slice(0,2)}),{code:'echo_performance_stem_revision_mismatch'});
 await assert.rejects(store.load({...input,stems:[...input.stems,{assetId:'new',audioPath:null}]}),{code:'echo_performance_stem_revision_mismatch'});
 await assert.rejects(store.load({...input,songId:'same-bytes-other-song'}),{code:'echo_performance_not_prepared'});
 const masterNamed=structuredClone(bundle);masterNamed.buses[1].role='master';masterNamed.buses[1].declaredRole='Master';
 const masterNamedChecks=checks.map(x=>x.assetId==='a'?{...x,role:'master'}:x);await publishEchoPerformance({root,bundle:masterNamed,sourceChecks:masterNamedChecks});assert.equal((await store.load(input)).performance.buses[1].assetId,'a');
 const badChecks=checks.map(x=>({...x,assetId:x.assetId==='a'?'b':x.assetId==='b'?'a':undefined}));await assert.rejects(publishEchoPerformance({root,bundle,sourceChecks:badChecks}),{code:'echo_performance_source_unverified'});
});
test('published normalized resources retain exact decoded analysis identity and unavailable assets',()=>{
 const hash='a'.repeat(64),d={digest:'b'.repeat(64),frameCount:8000,sampleRate:8000,channels:1,domain:'ffmpeg-analysis-mono-f32le'};
 const result=buildEchoMusicPerformance({telemetry:{schemaVersion:'hapa.stem-telemetry-bundle.v1',sourcePolicy:'living-light-assets-v1',songId:'exact',masterMix:{audioHash:hash,frames:[{t:0,rms:0}]},stems:[{id:'stem:a',assetId:'a',identityPolicy:'living-light-assets-v1',declaredRole:'Unknown texture',role:'unknowntexture',audioHash:hash,decodedAnalysis:d,frames:[{t:0,rms:0}]},{id:'stem:missing',assetId:'missing',identityPolicy:'living-light-assets-v1',role:'drums',frames:[]}]}});
 assert.equal(result.sourcePolicy,'living-light-assets-v1');assert.deepEqual(result.buses[1].decodedAnalysis,d);assert.equal(result.buses[1].declaredRole,'Unknown texture');assert.equal(result.buses[1].featureAvailability.low,false);assert.equal(result.buses[1].featureAvailability.onset,false);assert.equal(result.buses[2].status,'missing-analysis');assert.equal(result.buses[2].audioHash,null);
});
test('actual existing analyzer keeps exact same-role bytes, measured silence, missing state and warm resource reuse',async()=>{
 let output='';await runEchoPreparationStage(process.env.HAPA_PYTHON||'python3',[path.resolve('tests/fixtures/living-light-exact-analysis.py')],{cwd:process.cwd(),timeoutMs:240000,onOutput:text=>{output+=text;}});
 assert.match(output,/"exactAssets": 4/);assert.match(output,/"sourceUnchanged": true/);assert.match(output,/"alignmentApplied": false/);
});

import {createEchoPerformancePreparation} from '../server/echo-performance-preparation.mjs';
import {prepareEchoPlaybackAudio,releaseEchoPlaybackAudio} from '../server/echo-playback-audio.mjs';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
test('actual owner pipeline publishes exact partial assets and admits only source-bound master response',async t=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'ll-exact-owner-'));t.after(()=>fs.rm(temporary,{recursive:true,force:true}));
 const wav=async(name,seconds,frequency)=>{
  const frames=8000*seconds,bytes=Buffer.alloc(44+frames*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*frequency/8000)*8000),44+i*2);
  const file=path.join(temporary,name);await fs.writeFile(file,bytes);return file;
 };
 const master=await wav('master.wav',2,220),first=await wav('first.wav',1,80),second=await wav('second.wav',1,440);
 const sourceHashes=await Promise.all([master,first,second].map(async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex')));
 const store={songs:[{id:'fixture-owner',audio:{localPath:master},stems:[{id:'first',stemType:'Drums',localPath:first},{id:'second',stemType:'Drums',localPath:second},{id:'missing',stemType:'Unknown',localPath:path.join(temporary,'absent.wav')}]}]};
 const input=livingLightPerformanceInputs({songId:'fixture-owner',songStore:store}),service=createEchoPerformancePreparation({root:process.cwd(),jobRoot:path.join(temporary,'jobs'),analysisCacheRoot:path.join(temporary,'analysis'),performanceCacheRoot:path.join(temporary,'performance')});t.after(()=>service.close());
 const job=service.start({songId:'fixture-owner',variantId:'living-light-assets-v1',masterPath:master,graph:input.graph});
 const start=Date.now();while(['queued','running','cancelling'].includes(service.get(job.id).status)){if(Date.now()-start>30000)throw Error('Synthetic preparation did not finish within its bounded fixture window');await new Promise(r=>setTimeout(r,20));}
 assert.equal(service.get(job.id).status,'ready',service.get(job.id).message);assert.equal(service.get(job.id).outputTail,'');
 const prepared=await createPreparedEchoPerformanceStore({root:path.join(temporary,'performance')}).load({masterPath:master,stems:input.graph.stems.items,songId:'fixture-owner',sourcePolicy:'living-light-assets-v1'});
 assert.deepEqual(prepared.performance.buses.slice(1).map(b=>b.assetId),['first','second','missing']);assert.equal(prepared.performance.buses[3].frames.length,0);assert.equal(prepared.performance.buses[1].featureAvailability.low,true);
 const receipt=await prepareEchoPlaybackAudio({sourcePath:master,cacheRoot:path.join(temporary,'playback')});t.after(()=>releaseEchoPlaybackAudio(receipt));
 const sourceBinding={schemaVersion:'hapa.living-light.source-binding.v1',songId:'fixture-owner',bindingId:'fixture-binding',revisionId:'fixture-revision',state:'alignment-unverified',master:{sourceHash:receipt.sourceHash,decoded:{digest:receipt.pcmSha256,sampleRate:receipt.sampleRate,frameCount:Math.round(receipt.durationSeconds*receipt.sampleRate),durationSeconds:receipt.durationSeconds}},stems:prepared.performance.buses.slice(1).map(bus=>({assetId:bus.assetId,sourceHash:bus.audioHash,declaredRole:bus.declaredRole,state:bus.frames.length?'available':'missing',alignmentState:'alignment-unverified',timeMap:null}))};
 const bank=createLivingLightFeatureBank({songId:'fixture-owner',performance:prepared.performance,playbackReceipt:receipt,sourceBinding});assert(bank.sample('master','energy',500000).value>0);assert.equal(bank.sample('first','energy',500000).reason,'alignment-unverified');assert.equal(bank.sample('missing','energy',500000).availability,'missing');bank.dispose();
 // Follow the same owner read and managed freeze used by the real renderer.
 const {createLivingLightPerformancePort}=await import('../server/living-light-performance-port.mjs');
 const {createLivingLightRenderSourceReader}=await import('../server/living-light-render-source.mjs');
 const {livingLightPreparedBinding}=await import('../src/domain/living-light-prepared-binding.js');
 const {createLivingLightService}=await import('../server/living-light-service.mjs');
 const {createLivingLightRegistry}=await import('../src/living-light/registry.js');
 const {newJourneyDraft}=await import('../src/domain/living-light-journey.js');
 const {createEchoLivingLightCue}=await import('../src/domain/echo-living-light-editor.js');
 const {prepareSongCardLivingLight}=await import('../server/song-card-living-light.mjs');
 const port=createLivingLightPerformancePort({readSongStore:async()=>store,preparation:service,preparedStore:createPreparedEchoPerformanceStore({root:path.join(temporary,'performance')})});
 const read=createLivingLightRenderSourceReader({readPerformance:params=>port.read(params),playbackCacheRoot:path.join(temporary,'playback')});
 const binding=livingLightPreparedBinding({songId:'fixture-owner',performance:prepared.performance,playbackReceipt:receipt});
 const registry=createLivingLightRegistry(),owner=createLivingLightService({root:temporary,registry,resolveSong:async id=>({id})});t.after(()=>owner.close());
 const draft=newJourneyDraft({songId:'fixture-owner',durationUs:2e6,thing:registry.entries.find(t=>t.capabilities.continuous)},registry);
 draft.sourceBindingRef={bindingId:binding.bindingId,revisionId:binding.revisionId};
 const saved=await owner.saveJourney({journey:draft,expectedRevision:null,idempotencyKey:'test:bound-render'},{mode:'authenticated-api',actor:{actorId:'agent:test',kind:'agent',displayName:'Test'}});
 const project={song_id:'fixture-owner',duration:2,living_light_cues:[createEchoLivingLightCue({journey:saved.journey,cueId:'cue:bound',startUs:0})]};
 const frozen=await prepareSongCardLivingLight({project,owner,root:temporary,cacheRoot:path.join(temporary,'render-inputs'),readPreparedSource:options=>read({...options,masterPath:master,sourceMasterSha256:'sha256:'+sourceHashes[0]})});
 const frozenBinding=livingLightPreparedBinding({songId:'fixture-owner',...frozen.snapshot.preparedSource});
 assert.equal(frozenBinding.revisionId,binding.revisionId);
 const frozenBank=createLivingLightFeatureBank({songId:'fixture-owner',...frozen.snapshot.preparedSource,sourceBinding:frozenBinding});
 try{assert(frozenBank.sample('master','energy',500000).value>0);assert.equal(frozenBank.sample('first','energy',500000).reason,'alignment-unverified');}finally{frozenBank.dispose();}
 assert(!JSON.stringify(frozen.snapshot).includes(temporary));
 const {prepareEchoReadinessLivingLight}=await import('../server/echo-readiness-living-light.mjs');
 const certified=await prepareEchoReadinessLivingLight({project,root:temporary,cacheRoot:path.join(temporary,'readiness'),masterPath:master,sourceMasterSha256:'sha256:'+sourceHashes[0],readPreparedSource:read,ownerFactory:()=>({...owner,close(){}})});
 assert.equal(certified.snapshot.snapshotDigest,frozen.snapshot.snapshotDigest);
 assert.equal(certified.evidence.length,1);
 assert.deepEqual(await Promise.all([master,first,second].map(async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex'))),sourceHashes);
 await service.close();await releaseEchoPlaybackAudio(receipt);
});
