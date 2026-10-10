import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {createAtlasTextSearch,textSearchInput,rankTextEmbedding} from '../server/audio-atlas-text-search.mjs';
import {acquireOwnedFileLock} from '../server/owned-file-lock.mjs';
import {handleAudioAtlas} from '../server/audio-atlas-routes.mjs';
import {runWorker} from '../server/audio-atlas.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const unit=axis=>Array.from({length:512},(_,i)=>i===axis?1:0);
const names=['README.md','config.json','merges.txt','preprocessor_config.json','pytorch_model.bin','special_tokens_map.json','tokenizer.json','tokenizer_config.json','vocab.json'];
function fixture(t,{runner,checkAnalysis}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hapa-atlas-text-test-')),storage=path.join(root,'data');fs.mkdirSync(storage);fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'model'));
 fs.writeFileSync(path.join(root,'scripts/audio-atlas-clap.py'),'fixture');
 const c={python:process.execPath,modelPath:path.join(root,'model'),revision:'a'.repeat(40),sha256:{}};
 for(const n of names){fs.writeFileSync(path.join(c.modelPath,n),n);c.sha256[n]=sha(n);}
 fs.writeFileSync(path.join(storage,'clap-model.json'),JSON.stringify(c));
 const space=`laion/clap-htsat-unfused:${c.revision}:${c.sha256['pytorch_model.bin']}`;
 const r={assets:[{id:'master',status:'ready',timeline_id:'t',source_sha256:'b'.repeat(64),sample_rate_hz:100,sample_count:2000}],acoustic_index:{embedding_space:space,model_hashes:c.sha256,package_version:'fixture',windows:[{id:'one',start_sample:0,end_sample:1000,embedding:unit(0)},{id:'two',start_sample:1000,end_sample:2000,embedding:unit(1)}]}};
 let calls=0,identity=1;
 const write=file=>{const m=JSON.parse(fs.readFileSync(file));fs.writeFileSync(path.join(path.dirname(file),'text-embedding.json'),JSON.stringify({query:m.text,prompt:m.prompt,embedding:unit(0),embedding_space:space,model_hashes:c.sha256,package_version:'fixture',token_count:7,network:'disabled',elapsed_seconds:.1}));};
 const options={root,storage,result:id=>{if(id!=='run')throw new Error('unauthorized run');return structuredClone(r);},atomic:(p,v)=>fs.writeFileSync(p,JSON.stringify(v)),lock:()=>acquireOwnedFileLock({lockPath:path.join(storage,'.writer.lock'),schemaVersion:'test',staleLegacyMs:120000}),runtimeIdentity:()=>({revision:identity}),checkAnalysis,
 runner:async(...args)=>{calls++;if(runner)await runner(...args);write(args[1]);}};
 const owner=createAtlasTextSearch(options);t.after(async()=>{await owner.close();fs.rmSync(root,{recursive:true,force:true});});return{root,storage,r,c,owner,options,calls:()=>calls,identity:()=>identity++,write};
}
test('description and result budgets reject invalid inputs',()=>{
 for(const v of [null,{}, {text:''},{text:'\0'},{text:'x'.repeat(501)},{text:'hi',limit:0},{text:'hi',limit:1.5}])assert.throws(()=>textSearchInput(v));
 assert.deepEqual(textSearchInput({text:'  guitar  '}),{text:'guitar',limit:8});
});
test('ranking is finite, normalized, source bounded and space specific',t=>{
 const {r}=fixture(t);const e={embedding:unit(0),embedding_space:r.acoustic_index.embedding_space};
 const rows=rankTextEmbedding(r,e);assert.equal(rows[0].score,1);assert.equal(rows[1].score,0);assert.equal(rows[0].source_sha256,r.assets[0].source_sha256);
 assert.throws(()=>rankTextEmbedding(r,{...e,embedding_space:'other'}));
 for(const bad of [[0],unit(0).map(()=>0),unit(0).map(()=>NaN),unit(0).map(x=>x*2)])assert.throws(()=>rankTextEmbedding(r,{...e,embedding:bad}));
 for(const change of [w=>w.end_sample=2001,w=>w.start_sample=-1,w=>w.start_sample=.5,w=>w.id='one']){const copy=structuredClone(r);change(copy.acoustic_index.windows[1]);assert.throws(()=>rankTextEmbedding(copy,e));}
});
test('explicit encoding persists source evidence; read/history/restart never infer; repeat caches',async t=>{
 const f=fixture(t);assert.deepEqual(f.owner.get('run').queries,[]);assert.equal(f.calls(),0);
 const first=await f.owner.start('run',{text:'soft guitar',limit:1});assert.equal(first.state,'complete');assert.equal(first.matches.length,1);assert.equal(first.quality_qualified,false);
 assert.equal(f.owner.get('run',first.id,2).matches.length,2);assert.equal(f.calls(),1);
 assert.equal((await f.owner.start('run',{text:'soft guitar',limit:2})).cache_hit,true);assert.equal(f.calls(),1);
 assert.equal(createAtlasTextSearch(f.options).get('run',first.id).id,first.id);assert.throws(()=>f.owner.get('other',first.id),/unauthorized/);assert.throws(()=>f.owner.get('run','../escape'));
 assert.equal(fs.existsSync(path.join(f.storage,'.writer.lock')),false);
});
test('concurrent identical queries coalesce with caller-specific limits',async t=>{
 let release,spawned;const started=new Promise(r=>spawned=r),hold=new Promise(r=>release=r);
 const f=fixture(t,{runner:async()=>{spawned();await hold;}});const first=f.owner.start('run',{text:'voice',limit:1});await started;
 const second=f.owner.start('run',{text:'voice',limit:2});await new Promise(r=>setTimeout(r,30));release();
 const [a,b]=await Promise.all([first,second]);assert.equal(a.id,b.id);assert.equal(a.matches.length,1);assert.equal(b.matches.length,2);assert.equal(f.calls(),1);
});
test('checkpoint, embedding space, package identity and evidence tamper fail closed',async t=>{
 const f=fixture(t);const first=await f.owner.start('run',{text:'voice'});
 fs.appendFileSync(path.join(f.storage,'text-searches',first.id,'text-embedding.json'),' ');assert.throws(()=>f.owner.get('run',first.id),/integrity/);
 const second=await f.owner.start('run',{text:'voice'});assert.notEqual(first.id,second.id);
 f.r.acoustic_index.embedding_space='wrong';await assert.rejects(f.owner.start('run',{text:'x'}),/does not match/);f.r.acoustic_index.embedding_space=second.embedding_space;
 fs.appendFileSync(path.join(f.c.modelPath,'vocab.json'),'tamper');await assert.rejects(f.owner.start('run',{text:'x'}),/integrity/);assert.equal(f.calls(),2);
});
test('runtime, implementation and immutable analysis identities invalidate query cache',async t=>{
 const f=fixture(t);let prior=await f.owner.start('run',{text:'voice'});
 for(const change of [f.identity,()=>fs.appendFileSync(path.join(f.root,'scripts/audio-atlas-clap.py'),'change'),()=>f.r.title='new result']){change();const next=await f.owner.start('run',{text:'voice'});assert.notEqual(prior.id,next.id);prior=next;}
 assert.equal(f.calls(),4);
});
test('cancellation owns cleanup, retains cancelled history and releases global lock',async t=>{
 let spawned;const ready=new Promise(r=>spawned=r);const f=fixture(t,{runner:async(_r,_m,{signal,timeoutMs,workerFile})=>{assert.equal(timeoutMs,120000);assert.equal(workerFile,'audio-atlas-clap.py');spawned();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}});
 const promise=f.owner.start('run',{text:'voice'});const rejected=assert.rejects(promise,/cancelled/);await ready;
 await assert.rejects(f.owner.start('run',{text:'different'}),/owns this lock/);assert.equal((await f.owner.cancel('run')).state,'cancelled');await rejected;assert.equal(fs.existsSync(path.join(f.storage,'.writer.lock')),false);
});
test('dead owners and live orphans stay visible and block only unsafe restart',async t=>{
 const f=fixture(t);const id=randomUUID(),dir=path.join(f.storage,'text-searches',id);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'job.json');const row={id,run_id:'run',state:'running',owner_pid:2147483647,created_at:new Date().toISOString()};
 fs.writeFileSync(file,JSON.stringify(row));assert.equal(f.owner.get('run').queries[0].state,'interrupted');
 fs.writeFileSync(file,JSON.stringify({...row,worker_pid:process.pid}));assert.equal(f.owner.get('run').queries[0].state,'orphaned');await assert.rejects(f.owner.start('run',{text:'voice'}),/orphaned/);assert.equal(f.calls(),0);
});
test('analysis orphan gate refuses encoding and bad worker output retains failure',async t=>{
 const f=fixture(t,{checkAnalysis:()=>{throw new Error('analysis orphan');}});await assert.rejects(f.owner.start('run',{text:'voice'}),/analysis orphan/);assert.equal(f.calls(),0);
 const g=fixture(t,{runner:async()=>{throw new Error('bad worker');}});await assert.rejects(g.owner.start('run',{text:'voice'}),/bad worker/);assert.equal(g.owner.get('run').queries[0].state,'failed');assert.equal(fs.existsSync(path.join(g.storage,'.writer.lock')),false);
});
test('API text search authenticates before dispatch and GET does not encode',async()=>{
 let calls=0,response;const base={res:{},url:new URL('http://127.0.0.1:1234/api/echos/audio-atlas/jobs/run/text-search'),readBody:async()=>({text:'voice'}),sendJson:(_r,status,body)=>response={status,body},atlas:{searchText:async()=>{calls++;return{query:'voice'};},textSearches:()=>({queries:[]}),cancelTextSearch:async()=>({state:'cancelled'})}};
 await handleAudioAtlas({...base,req:{method:'POST',headers:{}},requireAdmin:()=>false});assert.equal(calls,0);
 await handleAudioAtlas({...base,req:{method:'POST',headers:{origin:'http://bad',host:'127.0.0.1:1234'}},requireAdmin:()=>true});assert.equal(response.status,403);assert.equal(calls,0);
 await handleAudioAtlas({...base,req:{method:'GET',headers:{}},requireAdmin:()=>true});assert.deepEqual(response.body.queries,[]);assert.equal(calls,0);
 await handleAudioAtlas({...base,req:{method:'POST',headers:{}},requireAdmin:()=>true});assert.equal(calls,1);assert.equal(response.status,202);
 await handleAudioAtlas({...base,req:{method:'DELETE',headers:{}},requireAdmin:()=>true});assert.equal(response.body.state,'cancelled');
});
test('real subprocess timeout/abort cleans process group and role cannot recurse',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,'scripts/test-worker.py'),"if(process.env.HAPA_AUDIO_ATLAS_WORKER!=='1'||process.env.NODE_OPTIONS)process.exit(3);setInterval(()=>{},1000);");
 for(const mode of ['timeout','abort']){let pid;const controller=new AbortController();await assert.rejects(runWorker(f.root,'fixture',{python:process.execPath,workerFile:'test-worker.py',timeoutMs:150,signal:controller.signal,onOutput:()=>{},onSpawn:p=>{pid=p;if(mode==='abort')controller.abort();}}),/cancelled or timed out/);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});}
 const old=process.env.HAPA_AUDIO_ATLAS_WORKER;process.env.HAPA_AUDIO_ATLAS_WORKER='1';try{assert.throws(()=>runWorker(f.root,'fixture',{}),/recursively/);}finally{if(old===undefined)delete process.env.HAPA_AUDIO_ATLAS_WORKER;else process.env.HAPA_AUDIO_ATLAS_WORKER=old;}
});
