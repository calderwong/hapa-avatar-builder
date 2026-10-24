import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createAudioAtlas, alignmentRequest, overlaps, sampleRange, workerOptions, validateAtlasResult } from '../server/audio-atlas.mjs';
import { handleAudioAtlas } from '../server/audio-atlas-routes.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture(t,customRunner){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hapa-atlas-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'scripts'));
 for(const n of ['audio-atlas-worker.py','echo_audio_analysis_cache.py','echo_reconstruction_alignment.py','audio_atlas_stem_alignment.py','audio_atlas_structure.py','audio_atlas_spectrogram.py','audio_atlas_technical.py','audio_atlas_harmony.py'])fs.writeFileSync(path.join(root,'scripts',n),'fixture');
 const audio=path.join(root,'source.wav');fs.writeFileSync(audio,Buffer.concat([Buffer.from('RIFF0000WAVE'),Buffer.alloc(100)]));
 fs.writeFileSync(path.join(root,'data/hapa-songs-store.json'),JSON.stringify({songs:[{id:'song-a',title:'Test',audio:{localPath:audio,mp3Uri:'/source'},stems:[],lyrics:{text:'source lyric'}}]}));
 let calls=0;
 const runner=customRunner|| (async(_root,manifest)=>{
  calls++;const m=JSON.parse(fs.readFileSync(manifest)),asset={id:'master',source_sha256:m.sources[0].sha256,status:'ready',sample_rate_hz:100,sample_count:1000,channels:2,decoded_sha256:'b'.repeat(64),timeline_id:'timeline',features:{frames:[{start_sample:0,end_sample:10,rms:[.1,.2]}]}};
  fs.writeFileSync(path.join(path.dirname(manifest),'result.json'),JSON.stringify({run_id:m.id,song_id:m.song.id,title:'Test',supplied_lyrics:'source lyric',assets:[asset],observations:[{id:'one',subject_id:'master',shape:'instant',start_sample:10,end_sample:10,kind:'hapa.audio.transient',payload:{strength:.3}},{id:'two',subject_id:'master',shape:'instant',start_sample:20,end_sample:20,kind:'hapa.audio.transient',payload:{strength:.5}}],acoustic_index:{embedding_space:'synthetic-space-a',concepts:['singing'],windows:[{id:'a',start_sample:0,end_sample:10,embedding:[1,0],scores:{singing:0.8}},{id:'b',start_sample:10,end_sample:20,embedding:[0.8,0.6],scores:{singing:0.6}}]},coverage:{beats:{state:'unsupported'}},stem_alignment:{status:'unknown'},elapsed_seconds:1}));
 });
 const validatedRunner=async(...args)=>{await runner(...args);const file=path.join(path.dirname(args[1]),'result.json');if(!fs.existsSync(file))return;const r=JSON.parse(fs.readFileSync(file));for(const o of r.observations){const a=r.assets.find(a=>a.id===o.subject_id);Object.assign(o,{timeline_id:a.timeline_id,reference_sample_rate_hz:a.sample_rate_hz,claim_type:'derived',confidence:null,review_state:'unreviewed',provenance:{run_id:r.run_id,source_sha256:a.source_sha256,evidence_asset_id:a.id,analysis_view:{stride:1}}});}fs.writeFileSync(file,JSON.stringify(r));};
 const atlas=createAudioAtlas({root,runner:validatedRunner});t.after(()=>atlas.close());return{root,audio,atlas,calls:()=>calls};
}
test('half-open instant/interval queries include start and exclude end',()=>{
 assert.equal(overlaps({shape:'instant',start_sample:10},10,20),true);assert.equal(overlaps({shape:'instant',start_sample:20},10,20),false);
 assert.equal(overlaps({shape:'interval',start_sample:0,end_sample:10},10,20),false);assert.equal(overlaps({shape:'interval',start_sample:9,end_sample:11},10,20),true);
 assert.throws(()=>sampleRange(0,1.5,20));assert.throws(()=>sampleRange(-1,2,20));assert.throws(()=>sampleRange(5,5,20));assert.throws(()=>sampleRange(0,21,20));
});
test('worker execution isolates flags, credentials and bounded threads',()=>{
 const old=process.env.NODE_OPTIONS;process.env.NODE_OPTIONS='--eval malicious';const options=workerOptions('/tmp');
 if(old===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=old;
 assert.equal(options.shell,false);assert.equal(options.env.NODE_OPTIONS,undefined);assert.equal(options.env.HAPA_AUDIO_ATLAS_WORKER,'1');assert.equal(options.env.OMP_NUM_THREADS,'1');assert.equal(options.env.OPENAI_API_KEY,undefined);
});
test('real owner persists, deduplicates, queries, and survives reconstruction',async t=>{
 const{atlas,root,audio,calls}=fixture(t);const before=digest(fs.readFileSync(audio));const j=await atlas.start('song-a');assert.equal((await atlas.wait(j.id)).state,'complete');
 assert.equal((await atlas.start('song-a')).cache_hit,true);assert.equal(calls(),1);
 assert.equal(atlas.query(j.id,{op:'timeline',start:10,end:20}).observations.length,1);
 assert.equal(atlas.query(j.id,{op:'search',q:'lyric'}).supplied_lyrics_match,true);
 assert.equal(atlas.query(j.id,{op:'brief'}).coverage.beats.state,'unsupported');
 const restored=createAudioAtlas({root});assert.equal(restored.status(j.id).state,'complete');assert.equal(restored.query(j.id,{op:'lyrics'}).text,'source lyric');
 assert.equal(digest(fs.readFileSync(audio)),before);assert.throws(()=>restored.status('../escape'));
});
test('reviews append with concurrency checking and do not replace measurements',async t=>{
 const{atlas}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 const input={revision:0,observation_id:'one',state:'needs_review',reviewer:'test-fixture',note:'synthetic check'};
 assert.equal(atlas.review(j.id,input).revision,1);assert.throws(()=>atlas.review(j.id,input),/conflict/);
 assert.equal(atlas.review(j.id,{...input,revision:1,state:'rejected'}).events.length,2);
 assert.equal(atlas.result(j.id).observations[0].payload.strength,.3);
 assert.equal(atlas.query(j.id,{op:'evidence',q:'one'}).observations[0].review.state,'rejected');
 assert.equal((await atlas.start('song-a')).id,j.id);assert.equal(atlas.reviews(j.id).events.length,2);
});
test('source and implementation changes invalidate cache; corrupt results fail closed',async t=>{
 const{atlas,audio,root,calls}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 fs.appendFileSync(audio,'changed');const second=await atlas.start('song-a');await atlas.wait(second.id);assert.notEqual(second.id,j.id);
 fs.appendFileSync(path.join(root,'scripts/audio-atlas-worker.py'),'revision');const third=await atlas.start('song-a');await atlas.wait(third.id);assert.equal(calls(),3);
 fs.appendFileSync(path.join(root,'data/audio-atlas/runs',third.id,'result.json'),' ');assert.throws(()=>atlas.result(third.id),/integrity/);
});
test('worker failure stays failed; cancellation releases writer for explicit retry',async t=>{
 const{atlas}=fixture(t,async(_r,_m,{signal})=>{await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));});
 const j=await atlas.start('song-a');await assert.rejects(()=>atlas.start('song-a'),/owns this lock/);
 assert.equal((await atlas.cancel(j.id)).state,'cancelled');assert.throws(()=>atlas.result(j.id),/cancelled/);
 const next=await atlas.start('song-a');assert.equal((await atlas.cancel(next.id)).state,'cancelled');
});
test('crashed owner is interrupted, never automatically resumed',async t=>{
 const{atlas,root}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 const f=path.join(root,'data/audio-atlas/jobs',`${j.id}.json`);const job=JSON.parse(fs.readFileSync(f));job.state='running';job.owner_pid=2147483647;fs.writeFileSync(f,JSON.stringify(job));
 assert.equal(atlas.status(j.id).state,'interrupted');assert.equal(JSON.parse(fs.readFileSync(f)).state,'running');
});
test('API denies unauthenticated access and cross-origin requests before dispatch',async()=>{
 let called=false,response;
 const base={res:{},atlas:{list:()=>{called=true;return[];}},readBody:async()=>({}),sendJson:(_r,status,body)=>{response={status,body};},url:new URL('http://127.0.0.1:1234/api/echos/audio-atlas/songs')};
 await handleAudioAtlas({...base,req:{method:'GET',headers:{}},requireAdmin:()=>false});assert.equal(called,false);
 await handleAudioAtlas({...base,req:{method:'GET',headers:{origin:'https://bad.example',host:'127.0.0.1:1234'}},requireAdmin:()=>true});assert.equal(response.status,403);assert.equal(called,false);
 await handleAudioAtlas({...base,req:{method:'GET',headers:{}},requireAdmin:()=>true});assert.equal(response.status,200);assert.equal(called,true);
});

test('evidence playback survives original replacement and refuses preserved-byte tampering',async t=>{
 const{atlas,audio}=fixture(t);const job=await atlas.start('song-a');await atlas.wait(job.id);
 const preserved=await atlas.audio(job.id,'master');assert.notEqual(preserved,audio);
 const expected=fs.readFileSync(preserved);fs.writeFileSync(audio,'replacement');
 assert.deepEqual(fs.readFileSync(await atlas.audio(job.id,'master')),expected);
 fs.appendFileSync(preserved,'tampered');await assert.rejects(()=>atlas.audio(job.id,'master'),/changed/);
});
test('result validation rejects out-of-bounds and duplicate observations',()=>{
 const base={assets:[{id:'master',status:'ready',sample_count:100,sample_rate_hz:100}],observations:[{id:'one',subject_id:'master',shape:'interval',start_sample:99,end_sample:101}]};
 assert.throws(()=>validateAtlasResult(base),/coordinates/);
 base.observations[0].end_sample=100;assert.equal(validateAtlasResult(base),base);
 base.observations.push({...base.observations[0]});assert.throws(()=>validateAtlasResult(base),/identity/);
});

test('boundary corrections append and preserve original measurements with revision safety',async t=>{
 const{atlas}=fixture(t);const job=await atlas.start('song-a');await atlas.wait(job.id);
 const input={revision:0,observation_id:'one',state:'needs_review',reviewer:'synthetic-test',note:'fixture only',correction:{start_sample:11,end_sample:11,text:'edited'}};
 assert.equal(atlas.review(job.id,input).events[0].correction.start_sample,11);
 assert.equal(atlas.result(job.id).observations[0].start_sample,10);
 assert.equal(atlas.query(job.id,{op:'evidence',q:'one'}).observations[0].review.correction.text,'edited');
 assert.throws(()=>atlas.review(job.id,{...input,revision:1,correction:{start_sample:-1,end_sample:-1}}),/coordinates/);
 assert.throws(()=>atlas.review(job.id,input),/conflict/);
});
test('missing optional beat profile refuses before starting analysis',async t=>{
 const{atlas,calls}=fixture(t);await assert.rejects(()=>atlas.start('song-a',{beats:true}),/Beat This/);assert.equal(calls(),0);
});

test('acoustic queries rank same-space vectors without launching inference or leaking vectors',async t=>{
 const{atlas,calls}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 const r=atlas.query(j.id,{op:'acoustic',q:'singing'});assert.equal(r.embedding_space,'synthetic-space-a');assert.equal(r.matches[0].id,'a');assert.equal(r.matches[0].embedding,undefined);
 const byAudio=atlas.query(j.id,{op:'acoustic',q:'a'});assert.equal(byAudio.matches[0].id,'b');assert.equal(byAudio.matches[0].score,0.8);
 assert.throws(()=>atlas.query(j.id,{op:'acoustic',q:'unindexed concept'}),/indexed concept/);assert.equal(calls(),1);
});


test('effective correction queries filter and paginate corrected coordinates without changing source evidence',async t=>{
 const {atlas,root}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 const originalBytes=fs.readFileSync(path.join(root,'data/audio-atlas/runs',j.id,'result.json'));
 const draft={revision:0,observation_id:'one',state:'needs_review',reviewer:'synthetic-test',note:'fixture only; not real human evaluation',correction:{start_sample:25,end_sample:25,text:'corrected word'}};
 atlas.review(j.id,draft);
 assert.equal(atlas.query(j.id,{op:'search',view:'effective',q:'corrected word'}).total,0);
 atlas.review(j.id,{...draft,revision:1,state:'accepted_by_human'});
 const hit=atlas.query(j.id,{op:'search',view:'effective',q:'corrected word',start:25,end:26});
 assert.equal(hit.total,1);assert.equal(hit.observations[0].start_sample,25);assert.equal(hit.observations[0].original.start_sample,10);
 assert.equal(hit.observations[0].claim_type,'human_asserted');assert.equal(hit.observations[0].correction_applied,true);
 assert.equal(atlas.query(j.id,{op:'timeline',view:'effective',start:10,end:20}).total,0);
 assert.equal(atlas.query(j.id,{op:'timeline',view:'effective',start:20,end:25}).observations[0].id,'two');
 assert.equal(atlas.query(j.id,{op:'timeline',view:'effective',start:20,end:25}).total,1);
 assert.equal(atlas.query(j.id,{op:'timeline',view:'effective',limit:1,offset:1}).observations[0].id,'one');
 assert.equal(atlas.query(j.id,{op:'timeline',view:'original',start:10,end:20}).observations[0].id,'one');
 assert.equal(atlas.query(j.id,{op:'search',view:'original',q:'corrected word'}).total,0);
 assert.equal(atlas.query(j.id,{op:'evidence',view:'effective',q:'one'}).observations[0].original.start_sample,10);
 assert.throws(()=>atlas.query(j.id,{op:'timeline',view:'proposed'}),/original or effective/);
 const restored=createAudioAtlas({root});assert.equal(restored.query(j.id,{op:'timeline',view:'effective',start:25,end:26}).total,1);
 assert.deepEqual(fs.readFileSync(path.join(root,'data/audio-atlas/runs',j.id,'result.json')),originalBytes);
});

test('proposals preserve accepted decisions; rejection and explicit original acceptance remain reversible assertions',async t=>{
 const{atlas}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 const base={observation_id:'one',reviewer:'synthetic-test',note:'fixture only'};
 atlas.review(j.id,{...base,revision:0,state:'accepted_by_human',correction:{start_sample:30,end_sample:30,text:'accepted'}});
 atlas.review(j.id,{...base,revision:1,state:'needs_review',correction:{start_sample:40,end_sample:40,text:'proposal'}});
 let row=atlas.query(j.id,{op:'evidence',view:'effective',q:'one'}).observations[0];
 assert.equal(row.start_sample,30);assert.equal(row.payload.text,'accepted');assert.equal(row.review.correction.text,'proposal');assert.equal(row.effective_review.state,'accepted_by_human');
 atlas.review(j.id,{...base,revision:2,state:'rejected'});
 assert.equal(atlas.query(j.id,{op:'timeline',view:'effective'}).total,1);assert.equal(atlas.query(j.id,{op:'timeline',view:'original'}).total,2);
 assert.equal(atlas.query(j.id,{op:'evidence',view:'effective',q:'one'}).observations[0].rejected,true);
 atlas.review(j.id,{...base,revision:3,state:'needs_review'});assert.equal(atlas.query(j.id,{op:'timeline',view:'effective'}).total,1);
 atlas.review(j.id,{...base,revision:4,state:'accepted_by_human'});
 row=atlas.query(j.id,{op:'evidence',view:'effective',q:'one'}).observations[0];assert.equal(row.start_sample,10);assert.equal(row.correction_applied,false);assert.equal(row.rejected,false);
 assert.equal(atlas.reviews(j.id).events.length,5);
});

test('authenticated HTTP queries expose the same effective result and reject invalid view values',async t=>{
 const{atlas}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 atlas.review(j.id,{revision:0,observation_id:'one',state:'accepted_by_human',reviewer:'synthetic-test',note:'fixture only',correction:{start_sample:31,end_sample:31,text:'fixture correction'}});
 let response;const base={req:{method:'GET',headers:{}},res:{},atlas,requireAdmin:()=>true,readBody:async()=>({}),sendJson:(_r,status,body)=>response={status,body}};
 await handleAudioAtlas({...base,url:new URL(`http://127.0.0.1/api/echos/audio-atlas/jobs/${j.id}/query?op=search&view=effective&q=fixture%20correction`)});
 assert.equal(response.status,200);assert.equal(response.body.query_view,'effective');assert.equal(response.body.observations[0].start_sample,31);
 await handleAudioAtlas({...base,url:new URL(`http://127.0.0.1/api/echos/audio-atlas/jobs/${j.id}/query?view=invalid`)});assert.equal(response.status,400);
});


test('contract query and HTTP export share the validated identity projection',async t=>{
 const {atlas}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 const c=atlas.contract(j.id);assert.deepEqual(atlas.query(j.id,{op:'contract',detail:'full'}),c);assert.equal(c.composition.composition_id,null);assert.equal(atlas.query(j.id,{op:'contract'}).omitted.observations,2);assert.throws(()=>atlas.query(j.id,{op:'contract',detail:'garbage'}),/detail/);assert.equal(c.observations[0].span.timeline_id,'timeline');
 let response;await handleAudioAtlas({req:{method:'GET',headers:{}},res:{},atlas,requireAdmin:()=>true,readBody:async()=>({}),sendJson:(_r,status,body)=>response={status,body},url:new URL(`http://127.0.0.1/api/echos/audio-atlas/jobs/${j.id}/export`)});
 assert.equal(response.status,200);assert.deepEqual(response.body.contract,c);assert.equal(response.body.result.observations[0].start_sample,10);
});


test('new malformed payload fails publication rather than completing a job',async t=>{
 const {atlas}=fixture(t,async(_root,manifest)=>{const m=JSON.parse(fs.readFileSync(manifest));fs.writeFileSync(path.join(path.dirname(manifest),'result.json'),JSON.stringify({run_id:m.id,song_id:m.song.id,assets:[{id:'master',source_sha256:m.sources[0].sha256,status:'ready',sample_rate_hz:100,sample_count:1000,channels:1,timeline_id:'timeline'}],observations:[{id:'bad',subject_id:'master',shape:'instant',start_sample:10,end_sample:10,kind:'hapa.audio.transient',payload:{strength:-1}}],coverage:{}}));});
 const j=await atlas.start('song-a');const done=await atlas.wait(j.id);assert.equal(done.state,'failed');assert.match(done.error,/strength/);assert.throws(()=>atlas.result(j.id),/failed/);
});


test('alignment excerpt contract refuses invalid ranges, text, source and languages',()=>{
 const valid={sourceId:'stem-1',startSeconds:26,endSeconds:41,text:'Supplied words.'};
 assert.equal(alignmentRequest(valid).startInputSample,416000);
 assert.equal(alignmentRequest(valid).text,valid.text);
 for(const change of [{startSeconds:-1},{endSeconds:26},{endSeconds:57},{text:''},{text:'a'.repeat(4001)},{sourceId:'../source'},{language:'Unknown'},{endSeconds:Infinity},{startSeconds:'26'}])assert.throws(()=>alignmentRequest({...valid,...change}),/Alignment needs/);
 assert.throws(()=>alignmentRequest({...valid,startSeconds:0,endSeconds:0.000001}),/one input sample/);
 assert.equal(alignmentRequest(null),null);
});
function alignmentFixture(t,override){
 const phases=[];
 const f=fixture(t,async(root,manifest,options)=>{
   const m=JSON.parse(fs.readFileSync(manifest)),file=path.join(path.dirname(manifest),'result.json');
   phases.push(options.workerFile||'measurements');
   if(options.workerFile==='audio-atlas-align.py'){
     if(override)return override(root,manifest,options);
     const r=JSON.parse(fs.readFileSync(file));r.forced_alignment={source_asset_id:m.alignment.sourceId,supplied_text:m.alignment.text,request:m.alignment,candidates:[],unresolved:[]};fs.writeFileSync(file,JSON.stringify(r));return;
   }
   fs.writeFileSync(file,JSON.stringify({run_id:m.id,song_id:m.song.id,title:'Fixture',supplied_lyrics:'original lyrics',assets:[{id:'master',role:'Master',status:'ready',sample_count:1000,sample_rate_hz:100,channels:1,source_sha256:m.sources[0].sha256,decoded_sha256:'b'.repeat(64),timeline_id:'timeline',features:{frames:[]}}],observations:[],coverage:{},stem_alignment:{status:'unknown'},elapsed_seconds:1}));
 });
 const model=path.join(f.root,'model');fs.mkdirSync(model);const hashes={};
 for(const name of ['README.md','chat_template.json','config.json','generation_config.json','merges.txt','model.safetensors','model.safetensors.index.json','preprocessor_config.json','tokenizer_config.json','vocab.json']){fs.writeFileSync(path.join(model,name),'fixture');hashes[name]=digest('fixture');}
 for(const name of ['audio-atlas-align.py','audio_atlas_word_alignment.py'])fs.writeFileSync(path.join(f.root,'scripts',name),'fixture');
 fs.mkdirSync(path.join(f.root,'data/audio-atlas'),{recursive:true});
 const config=path.join(f.root,'data/audio-atlas/alignment-model.json');
 fs.writeFileSync(config,JSON.stringify({python:process.execPath,modelPath:model,repository:'mlx-community/Qwen3-ForcedAligner-0.6B-8bit',revision:'a'.repeat(40),sha256:hashes}));
 return {...f,model,config,phases,request:{sourceId:'master',startSeconds:0,endSeconds:1,text:'test words'}};
}
test('alignment persists in immutable runs, shared queries and cache with exact text identity',async t=>{
 const f=alignmentFixture(t);const j=await f.atlas.start('song-a',{alignment:f.request});
 assert.equal((await f.atlas.wait(j.id)).state,'complete');assert.deepEqual(f.phases,['measurements','audio-atlas-align.py']);
 assert.equal(f.atlas.query(j.id,{op:'lyrics'}).text,'original lyrics');
 assert.equal(f.atlas.query(j.id,{op:'lyrics'}).forced_alignment.supplied_text,'test words');
 assert.deepEqual(f.atlas.query(j.id,{op:'brief'}).forced_alignment,f.atlas.result(j.id).forced_alignment);
 assert.equal((await f.atlas.start('song-a',{alignment:f.request})).id,j.id);assert.equal(f.phases.length,2);
 const next=await f.atlas.start('song-a',{alignment:{...f.request,text:'different words'}});await f.atlas.wait(next.id);assert.notEqual(j.id,next.id);
 const restored=createAudioAtlas({root:f.root});assert.equal(restored.query(j.id,{op:'lyrics'}).forced_alignment.supplied_text,'test words');
 fs.appendFileSync(path.join(f.root,'scripts/audio_atlas_word_alignment.py'),'changed');
 const code=await f.atlas.start('song-a',{alignment:f.request});await f.atlas.wait(code.id);assert.notEqual(code.id,j.id);
});
test('alignment requires registered source and all checkpoint hashes before any worker',async t=>{
 const f=alignmentFixture(t);
 await assert.rejects(()=>f.atlas.start('song-a',{alignment:{...f.request,sourceId:'stem-1'}}),/not registered/);
 fs.appendFileSync(path.join(f.model,'model.safetensors'),'tamper');
 await assert.rejects(()=>f.atlas.start('song-a',{alignment:f.request}),/integrity/);assert.equal(f.phases.length,0);
 const config=JSON.parse(fs.readFileSync(f.config));delete config.sha256['config.json'];fs.writeFileSync(f.config,JSON.stringify(config));
 await assert.rejects(()=>f.atlas.start('song-a',{alignment:f.request}),/Invalid pinned/);assert.equal(f.phases.length,0);
});
test('cancelling alignment never publishes the base partial result',async t=>{
 let entered;const ready=new Promise(resolve=>entered=resolve);
 const f=alignmentFixture(t,async(_root,_m,{signal})=>{entered();await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));});
 const j=await f.atlas.start('song-a',{alignment:f.request});await ready;
 assert.equal((await f.atlas.cancel(j.id)).state,'cancelled');assert.throws(()=>f.atlas.result(j.id),/cancelled/);
});
test('authenticated analysis API passes the exact alignment request to its shared owner',async()=>{
 const request={sourceId:'master',startSeconds:0,endSeconds:2,text:'Exact supplied words.'};let seen,response;
 await handleAudioAtlas({req:{method:'POST',headers:{}},res:{},url:new URL('http://127.0.0.1/api/echos/audio-atlas/jobs'),requireAdmin:()=>true,readBody:async()=>({songId:'song-a',alignment:request}),atlas:{start:async(id,options)=>{seen={id,options};return{id:'job'};}},sendJson:(_r,status,body)=>{response={status,body};}});
 assert.equal(response.status,202);assert.deepEqual(seen.options.alignment,request);
});


test('legacy structure reads remain explicit and structure helper changes invalidate analysis cache',async t=>{
 const {atlas,root}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 const old=atlas.query(j.id,{op:'structure'});assert.equal(old.status,'not_requested');assert.equal(old.quality_qualified,false);assert.deepEqual(old.boundaries,[]);
 fs.appendFileSync(path.join(root,'scripts/audio_atlas_structure.py'),'new structure revision');
 const next=await atlas.start('song-a');await atlas.wait(next.id);assert.notEqual(j.id,next.id);
 assert.equal(atlas.query(j.id,{op:'structure'}).status,'not_requested');
});


test('spectrogram artifacts participate in cache health and legacy query stays explicit',async t=>{
 const {atlas,root,calls}=fixture(t);const j=await atlas.start('song-a');await atlas.wait(j.id);
 assert.equal(atlas.query(j.id,{op:'spectrogram'}).state,'not_available');
 const dir=path.join(root,'data/audio-atlas/runs',j.id),file=path.join(dir,'result.json'),r=JSON.parse(fs.readFileSync(file)),a=r.assets[0],pixels=Buffer.from([10,20]);
 a.spectrogram={status:'complete',method:'hapa.channel-stft-display.v1',source_asset_id:a.id,source_sha256:a.source_sha256,timeline_id:a.timeline_id,sample_rate_hz:a.sample_rate_hz,sample_count:a.sample_count,channels:a.channels,hop_samples:1000,frame_count:1,fft_size:512,window:'periodic Hann',centered:true,first_frame_sample:0,time_map:{numerator:1,denominator:1,offset_samples:0,target:'own decoded source timeline'},band_count:1,bands:[{first_fft_bin:0,end_fft_bin:257,low_hz:0,high_hz:50}],encoding:{dtype:'uint8',axis_order:['frame','channel','band'],offset_db:-120,step_db:.5,min:0,max:240},artifact:'spectrogram-master.u8',artifact_sha256:digest(pixels),byte_length:2,frequency_units:'Hz',level_units:'dBFS of peak single-sided FFT-bin amplitude per band; not PSD or loudness',sparse_snapshots:true};
 fs.writeFileSync(path.join(dir,a.spectrogram.artifact),pixels);fs.writeFileSync(file,JSON.stringify(r));const jobFile=path.join(root,'data/audio-atlas/jobs',j.id+'.json'),job=JSON.parse(fs.readFileSync(jobFile));job.result_sha256=digest(fs.readFileSync(file));fs.writeFileSync(jobFile,JSON.stringify(job));
 assert.equal(atlas.query(j.id,{op:'spectrogram',channel:1}).frames[0].values[0],20);assert.equal(atlas.contract(j.id).feature_arrays.find(f=>f.id==='spectrogram:master').timeline_id,a.timeline_id);
 assert.equal((await atlas.start('song-a')).cache_hit,true);fs.appendFileSync(path.join(dir,a.spectrogram.artifact),'tampered');
 assert.throws(()=>atlas.query(j.id,{op:'spectrogram'}),/integrity/);const fresh=await atlas.start('song-a');await atlas.wait(fresh.id);assert.notEqual(fresh.id,j.id);assert.equal(calls(),2);
});

test('alignment can reuse exact-source measurements without running the measurement worker again',async t=>{
 const f=alignmentFixture(t);const base=await f.atlas.start('song-a');await f.atlas.wait(base.id);
 const original=fs.readFileSync(path.join(f.root,'data/audio-atlas/runs',base.id,'result.json'));
 const job=await f.atlas.start('song-a',{alignment:f.request,alignmentBaseRunId:base.id});
 assert.equal((await f.atlas.wait(job.id)).state,'complete');
 assert.deepEqual(f.phases,['measurements','audio-atlas-align.py']);
 const r=f.atlas.result(job.id);assert.equal(r.measurement_reuse.run_id,base.id);assert.equal(r.run_id,job.id);
 assert.equal(r.measurement_reuse.result_sha256,digest(original));
 assert.equal(r.forced_alignment.supplied_text,f.request.text);
 assert.deepEqual(fs.readFileSync(path.join(f.root,'data/audio-atlas/runs',base.id,'result.json')),original);
 assert.equal((await f.atlas.start('song-a',{alignment:f.request,alignmentBaseRunId:base.id})).cache_hit,true);
});
test('measurement reuse refuses changed audio, corrupt parents and non-alignment operations',async t=>{
 const f=alignmentFixture(t);const base=await f.atlas.start('song-a');await f.atlas.wait(base.id);
 await assert.rejects(()=>f.atlas.start('song-a',{alignmentBaseRunId:base.id}),/alignment-only/);
 fs.appendFileSync(f.audio,'changed');
 await assert.rejects(()=>f.atlas.start('song-a',{alignment:f.request,alignmentBaseRunId:base.id}),/source set differs/);
 assert.deepEqual(f.phases,['measurements']);
 const file=path.join(f.root,'data/audio-atlas/runs',base.id,'result.json');fs.appendFileSync(file,' ');
 await assert.rejects(()=>f.atlas.start('song-a',{alignment:f.request,alignmentBaseRunId:base.id}),/integrity mismatch/);
});

test('transcription source and language are explicit, source-bound, and reuse does not inherit words',async t=>{
 const seen=[];
 const f=fixture(t,async(_root,manifest)=>{
  const m=JSON.parse(fs.readFileSync(manifest));seen.push(m);
  const file=path.join(path.dirname(manifest),'result.json');
  if(m.transcription_only){const r=JSON.parse(fs.readFileSync(file));assert.deepEqual(r.observations,[]);r.transcript_candidate={source_asset_id:m.transcription.source_id,word_count:0};fs.writeFileSync(file,JSON.stringify(r));return;}
  fs.writeFileSync(file,JSON.stringify({run_id:m.id,song_id:m.song.id,title:'Test',supplied_lyrics:'source lyric',assets:[{id:'master',role:'Master',source_sha256:m.sources[0].sha256,status:'ready',sample_rate_hz:100,sample_count:1000,channels:1,decoded_sha256:'b'.repeat(64),timeline_id:'timeline',features:{frames:[]}}],observations:[],coverage:{},stem_alignment:{status:'unknown'},elapsed_seconds:1}));
 });
 const model=path.join(f.root,'model');fs.mkdirSync(model);fs.writeFileSync(path.join(model,'weights.npz'),'fixture');fs.writeFileSync(path.join(model,'config.json'),'{}');
 fs.mkdirSync(path.join(f.root,'data/audio-atlas'),{recursive:true});fs.writeFileSync(path.join(f.root,'data/audio-atlas/local-model.json'),JSON.stringify({python:process.execPath,modelPath:model}));
 const base=await f.atlas.start('song-a');await f.atlas.wait(base.id);
 const request={transcribe:true,transcriptionBaseRunId:base.id,transcriptionSourceId:'master',transcriptionLanguage:'auto'};
 const job=await f.atlas.start('song-a',request);assert.equal((await f.atlas.wait(job.id)).state,'complete');assert.equal(seen.length,2);assert.equal(seen[1].transcription_only,true);assert.deepEqual(seen[1].transcription,{source_id:'master',language:'auto'});
 assert.equal((await f.atlas.start('song-a',request)).cache_hit,true);
 await assert.rejects(()=>f.atlas.start('song-a',{...request,beats:true}),/transcription-only/);
 await assert.rejects(()=>f.atlas.start('song-a',{...request,transcriptionSourceId:'stem-100'}),/not registered/);
 await assert.rejects(()=>f.atlas.start('song-a',{...request,transcriptionLanguage:'invented'}),/language/);
 fs.appendFileSync(f.audio,'changed');await assert.rejects(()=>f.atlas.start('song-a',request),/source set differs/);
});
