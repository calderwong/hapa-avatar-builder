import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash,randomUUID} from 'node:crypto';
import {createAtlasDescriptions,DESCRIPTION_PROMPT} from '../server/audio-atlas-descriptions.mjs';import {SEMANTIC_AXES} from '../server/audio-atlas-semantic.mjs';
import {acquireOwnedFileLock} from '../server/owned-file-lock.mjs';import {handleAudioAtlas} from '../server/audio-atlas-routes.mjs';import {workerCommand,runWorker,workerOptions} from '../server/audio-atlas.mjs';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');const request={asset_id:'master',start_sample:0,end_sample:48000};
function fixture(t,hook=async()=>{}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-description-test-')),storage=path.join(root,'data');
 for(const p of ['scripts','server','data/runs/run','model','code/mlx_vlm'])fs.mkdirSync(path.join(root,p),{recursive:true});
 fs.writeFileSync(path.join(root,'scripts/audio-atlas-describe.py'),'fixture worker');fs.writeFileSync(path.join(root,'server/audio-atlas-semantic.mjs'),'fixture validator');fs.writeFileSync(path.join(root,'source.mp3'),'source');
 const r={assets:[{id:'master',role:'Master',status:'ready',source_sha256:sha('source'),decoded_sha256:sha('pcm'),timeline_id:'t',sample_rate_hz:48000,channels:2,sample_count:48000*30}],observations:[{id:'beat:1',subject_id:'master',kind:'beat',shape:'instant',start_sample:0,end_sample:0,payload:{text:'beat'},claim_type:'model_inferred',review_state:'unreviewed'},{id:'other',subject_id:'other',start_sample:0,end_sample:1}]};
 fs.writeFileSync(path.join(storage,'runs/run/manifest.json'),JSON.stringify({sources:[{id:'master',sha256:sha('source'),path:path.join(root,'source.mp3')}]}));
 const c={python:process.execPath,python_sha256:sha('python'),ffmpeg:process.execPath,ffmpeg_sha256:sha('ffmpeg'),modelPath:path.join(root,'model'),code_root:path.join(root,'code'),repository:'mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit',revision:'a'.repeat(40),sha256:Object.fromEntries(['config.json','model.safetensors.index.json',...Array.from({length:8},(_,i)=>`file${i}`)].map(n=>[n,sha(n)])),code_sha256:{'mlx_vlm/generate.py':sha('code')}};
 fs.writeFileSync(path.join(storage,'semantic-model.json'),JSON.stringify(c));let calls=0,identity=1;
 const options={root,storage,result:id=>{if(id!=='run')throw Error('unauthorized run');return structuredClone(r);},atomic:(f,v)=>fs.writeFileSync(f,JSON.stringify(v)),lock:()=>acquireOwnedFileLock({lockPath:path.join(storage,'.writer.lock'),schemaVersion:'test',staleLegacyMs:120000}),runtimeIdentity:()=>({revision:identity}),runner:async(_root,file,opts)=>{
   calls++;assert.equal(opts.sandboxNetwork,true);assert.equal(opts.timeoutMs,600000);assert.equal(opts.workerFile,'audio-atlas-describe.py');await hook(file,opts);
   const m=JSON.parse(fs.readFileSync(file)),response=JSON.stringify(Object.fromEntries(SEMANTIC_AXES.map(k=>[k,{description:'Tentative music',audible_cues:['plucked sound'],uncertainty:'unqualified'}])));
   fs.writeFileSync(path.join(path.dirname(file),'raw.json'),JSON.stringify({manifest_sha256:sha(fs.readFileSync(file,'utf8')),worker_sha256:sha('fixture worker'),prompt:DESCRIPTION_PROMPT,model_revision:c.revision,source_sha256:sha('source'),decoded_sha256:sha('pcm'),response,eos_observed:true,token_count:100,model_executed:true,speech_generated:false,network:{os_sandbox:'deny network*',denied_connects:['127.0.0.1','192.0.2.1']},input_evidence:{sha256:sha('input'),sample_rate_hz:16000,channels:1,sample_count:Math.ceil((m.request.end_sample-m.request.start_sample)/3),rms:.1,peak:.5,nonzero_sample_count:Math.ceil((m.request.end_sample-m.request.start_sample)/3)},packages:{test:'fixture'},total_seconds:1,inference_seconds:.5}));
 }};
 const owner=createAtlasDescriptions(options);t.after(async()=>{await owner.close();fs.rmSync(root,{recursive:true,force:true});});return {root,storage,r,c,options,owner,calls:()=>calls,identity:()=>identity++};
}
test('explicit supplemental jobs persist six axes and independent source context; reads never infer',async t=>{
 const f=fixture(t);assert.equal(f.owner.get('run').total,0);assert.equal(f.calls(),0);const j=f.owner.start('run',request);assert.ok(['running','queued'].includes(j.state));
 const p=await f.owner.wait('run',j.id);assert.equal(p.state,'complete');assert.equal(p.proposal_state,'needs_review');assert.equal(p.axes.length,6);assert.equal(p.evidence.observation_total,1);assert.equal(p.evidence.observations[0].id,'beat:1');assert.equal(p.raw_evidence_record.prompt,DESCRIPTION_PROMPT);assert.equal(p.timing_authority,false);
 assert.equal(f.owner.start('run',request).cache_hit,true);assert.equal(f.calls(),1);assert.equal(createAtlasDescriptions(f.options).get('run',j.id).axes.length,6);assert.equal(f.owner.export('run').jobs.length,1);assert.equal(fs.existsSync(path.join(f.storage,'.writer.lock')),false);
});
test('source ranges, unsupported sources and missing runtime fail before execution',t=>{
 const f=fixture(t);assert.throws(()=>f.owner.start('run',{...request,end_sample:31*48000}));assert.throws(()=>f.owner.start('run',{...request,asset_id:'other'}));assert.throws(()=>f.owner.get('other'));assert.throws(()=>f.owner.get('run','../escape'));
 fs.rmSync(path.join(f.storage,'semantic-model.json'));assert.equal(f.owner.capability().configured,false);assert.throws(()=>f.owner.start('run',request),/not configured/);assert.equal(f.calls(),0);
});
test('same request coalesces; independent jobs respect the shared writer lock',async t=>{
 let release;const hold=new Promise(r=>release=r);const f=fixture(t,async()=>hold);const a=f.owner.start('run',request),b=f.owner.start('run',request);assert.equal(a.id,b.id);assert.throws(()=>f.owner.start('run',{...request,end_sample:96000}),/owns this lock/);release();await f.owner.wait('run',a.id);assert.equal(f.calls(),1);
});
test('cancellation waits for cleanup, retains state and removes only owned decode scratch',async t=>{
 const f=fixture(t,async(file,{signal})=>{fs.writeFileSync(path.join(path.dirname(file),'description-decode.f32'),'temporary');await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));});
 const j=f.owner.start('run',request);const p=await f.owner.cancel('run',j.id);assert.equal(p.state,'cancelled');assert.equal(fs.existsSync(path.join(f.storage,'.writer.lock')),false);assert.equal(fs.existsSync(path.join(f.storage,'descriptions',j.id,'description-decode.f32')),false);await assert.rejects(f.owner.cancel('run',j.id),/does not own/);
});
test('failure is durable and does not reject an unobserved background promise',async t=>{
 const f=fixture(t,async()=>{throw Error('deliberate fixture failure');});const j=f.owner.start('run',request);const p=await f.owner.wait('run',j.id);assert.equal(p.state,'failed');assert.match(p.error,/deliberate/);assert.equal(fs.existsSync(path.join(f.storage,'.writer.lock')),false);
});
test('raw tamper refuses read; a new explicit attempt preserves corrupted history',async t=>{
 const f=fixture(t),j=f.owner.start('run',request);await f.owner.wait('run',j.id);const raw=path.join(f.storage,'descriptions',j.id,'raw.json');fs.appendFileSync(raw,' ');assert.throws(()=>f.owner.get('run',j.id),/integrity/);const second=f.owner.start('run',request);assert.notEqual(second.id,j.id);await f.owner.wait('run',second.id);assert.equal(f.calls(),2);assert.ok(fs.existsSync(raw));
});
test('explicit review is append-only, conflict checked and separated from original inference',async t=>{
 const f=fixture(t),j=f.owner.start('run',request),p=await f.owner.wait('run',j.id),file=path.join(f.storage,'descriptions',j.id,'result.json'),before=fs.readFileSync(file,'utf8'),axis=p.axes[0];
 const review={axis_id:axis.id,revision:0,state:'accepted_by_human',reviewer:'synthetic-test',note:'Fixture only',correction:'Fixture edited text'};
 const accepted=f.owner.review('run',j.id,review);assert.equal(accepted.axes[0].effective_description,'Fixture edited text');assert.equal(accepted.axes[0].description,axis.description);assert.equal(accepted.axes[0].review_history.length,1);assert.throws(()=>f.owner.review('run',j.id,review),/conflict/);
 const flagged=f.owner.review('run',j.id,{...review,revision:1,state:'needs_review',correction:'New proposal'});assert.equal(flagged.axes[0].effective_description,'Fixture edited text');assert.equal(flagged.axes[0].review_history.length,2);assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(flagged.quality_qualified,false);
});
test('runtime and immutable result identities invalidate the cache',async t=>{
 const f=fixture(t);const a=f.owner.start('run',request);await f.owner.wait('run',a.id);f.identity();const b=f.owner.start('run',request);await f.owner.wait('run',b.id);assert.notEqual(a.id,b.id);f.r.observations[0].payload.text='different';const c=f.owner.start('run',request);await f.owner.wait('run',c.id);assert.notEqual(b.id,c.id);
});
test('cross-owner progress and orphan evidence stay visible without unsafe resumption',t=>{
 const f=fixture(t),id=randomUUID(),d=path.join(f.storage,'descriptions',id);fs.mkdirSync(d,{recursive:true});const j={id,run_id:'run',state:'running',owner_pid:2147483647,worker_pid:process.pid,created_at:new Date().toISOString()};fs.writeFileSync(path.join(d,'job.json'),JSON.stringify(j));assert.equal(f.owner.get('run',id).state,'orphaned');assert.throws(()=>f.owner.start('run',request),/orphaned/);
 j.owner_pid=process.pid;fs.writeFileSync(path.join(d,'job.json'),JSON.stringify(j));fs.writeFileSync(path.join(d,'progress.json'),JSON.stringify({stage:'fixture progress'}));assert.equal(f.owner.get('run',id).progress.stage,'fixture progress');
});
test('description API preserves auth, same-origin and explicit mutation boundaries',async()=>{
 let count=0,response;const id=randomUUID(),base={res:{},url:new URL('http://127.0.0.1:1234/api/echos/audio-atlas/jobs/run/descriptions'),readBody:async()=>request,sendJson:(_r,status,body)=>response={status,body},atlas:{describe:()=>{count++;return{id,state:'running'};},descriptions:()=>({descriptions:[]}),cancelDescription:async()=>({state:'cancelled'}),reviewDescription:()=>({reviews:{revision:1}})}};
 await handleAudioAtlas({...base,req:{method:'POST',headers:{}},requireAdmin:()=>false});assert.equal(count,0);
 await handleAudioAtlas({...base,req:{method:'POST',headers:{origin:'http://other',host:'127.0.0.1:1234'}},requireAdmin:()=>true});assert.equal(response.status,403);assert.equal(count,0);
 await handleAudioAtlas({...base,req:{method:'GET',headers:{}},requireAdmin:()=>true});assert.equal(count,0);assert.deepEqual(response.body.descriptions,[]);
 await handleAudioAtlas({...base,req:{method:'POST',headers:{}},requireAdmin:()=>true});assert.equal(count,1);assert.equal(response.status,202);
 await handleAudioAtlas({...base,url:new URL(base.url+`/${id}/review`),req:{method:'POST',headers:{}},requireAdmin:()=>true});assert.equal(response.body.reviews.revision,1);
});
test('offline worker boundary has explicit argv/env and actual sandbox timeout cleanup',async t=>{
 const f=fixture(t);const opts={python:process.execPath,workerFile:'fixture.py',sandboxNetwork:true};
 assert.deepEqual(workerCommand(f.root,'manifest.json',opts),{executable:'/usr/bin/sandbox-exec',args:['-p','(version 1) (allow default) (deny network*)',process.execPath,path.join(f.root,'scripts/fixture.py'),'--manifest','manifest.json']});assert.equal(workerOptions(f.root).shell,false);assert.equal(workerOptions(f.root).env.HF_HUB_OFFLINE,'1');assert.equal(workerOptions(f.root).env.NODE_OPTIONS,undefined);
 fs.writeFileSync(path.join(f.root,'scripts/fixture.py'),"if(process.env.HAPA_AUDIO_ATLAS_WORKER!=='1')process.exit(3);setInterval(()=>{},1000)");let pid;
 await assert.rejects(runWorker(f.root,'manifest.json',{...opts,timeoutMs:200,signal:new AbortController().signal,onOutput:()=>{},onSpawn:p=>pid=p}),/cancelled or timed out/);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});
