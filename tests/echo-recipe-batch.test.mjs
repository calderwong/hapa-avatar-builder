import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {inspectEchoLocalCodeIdentity} from '../server/echo-delivery-runtime-build.mjs';
import {runEchoRecipeBatch,normalizeEchoRecipeBatchRequest} from '../server/echo-recipe-batch.mjs';
import {createAlbumBatch,resumeAlbumBatch} from '../src/domain/album-batch-orchestrator.js';

const evidenceReader={get:async()=>({status:'unavailable',reason:'isolated-availability-fixture'})};
async function fixture(t,count=2){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-recipe-batch-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const media=path.join(root,'source.bin');await fs.writeFile(media,'source-byte-availability-fixture');
 const songs=[];
 for(let index=0;index<count;index++){
  const id='fixture-'+index,projectPath=path.join(root,id+'.json');
  const project={song_id:id,song_title:id,duration:9,audio_uri:pathToFileURL(media).href,timed_lyrics:[],visualizer_timeline:[],timeline:Array.from({length:3},(_,i)=>({start_sec:i*3,end_sec:i*3+3,media_id:'media-'+i,media_uri:pathToFileURL(media).href,camera_motion:'static'}))};
  await fs.writeFile(projectPath,JSON.stringify(project));songs.push({id,projectPath});
 }
 const request={songs,recipes:['letter-intimate','performance-kinetic'],seed:'batch-test'};
 const output=path.join(root,'batch');
 return {root,media,request,output,run:options=>runEchoRecipeBatch({request,output,evidenceReader,...options})};
}

test('compile-only batches contain exactly the requested songs/recipes and invalid completed artifacts are requeued',()=>{
 const batch=createAlbumBatch({songs:[{id:'chosen',sourceHash:'source'}],variants:['letter-intimate'],stageIds:['variant-compile']});
 assert.equal(batch.jobs.length,1);assert.equal(batch.jobs[0].stage,'variant-compile');assert.deepEqual(batch.jobs[0].dependencies,[]);
 batch.jobs[0].status='done';assert.equal(resumeAlbumBatch(batch,{}).jobs[0].status,'queued');
 assert.throws(()=>normalizeEchoRecipeBatchRequest({songs:[]}),/explicit songs/);
 assert.throws(()=>normalizeEchoRecipeBatchRequest({songs:[{id:'a',projectPath:'a'},{id:'a',projectPath:'a'}],recipes:['letter-intimate']}),/only once/);
});

test('compiler identities include transitive code and dependency versions while ignoring unrelated files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-code-key-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'package-lock.json'),'{}');await fs.writeFile(path.join(root,'package.json'),'{}');
 await fs.writeFile(path.join(root,'entry.mjs'),"import {value} from './dependency.mjs';\nimport crypto from 'node:crypto';\nexport {value};\n");
 await fs.writeFile(path.join(root,'dependency.mjs'),'export const value=1;');
 const identity=()=>inspectEchoLocalCodeIdentity({root,entries:['entry.mjs']}).sha256;
 const one=identity();await fs.writeFile(path.join(root,'unrelated.mjs'),'not a dependency');assert.equal(identity(),one);
 await fs.writeFile(path.join(root,'dependency.mjs'),'export const value=2;');assert.notEqual(identity(),one);
 const two=identity();await fs.writeFile(path.join(root,'package-lock.json'),'{"version":2}');assert.notEqual(identity(),two);
});

test('real workers pause/resume a selected-song batch and reuse verified deterministic artifacts without recompiling',async t=>{
 const f=await fixture(t),before=await Promise.all(f.request.songs.map(song=>fs.readFile(song.projectPath,'utf8')));
 const paused=await f.run({maxJobs:1});assert.equal(paused.status,'paused');assert.equal(paused.work.compiled,1);assert.equal(paused.jobs.filter(j=>j.status==='done').length,1);
 const resumed=await f.run();assert.equal(resumed.status,'complete');assert.equal(resumed.work.compiled,3);assert.equal(resumed.work.cacheHits,1);
  const hashes=resumed.jobs.map(j=>j.receipt.graphHash);
  const snapshotTimes=await Promise.all(resumed.jobs.map(async job=>(await fs.stat(job.inputSnapshot)).mtimeMs));
  const warm=await f.run();assert.equal(warm.work.compiled,0);assert.equal(warm.work.cacheHits,4);assert.deepEqual(warm.jobs.map(j=>j.receipt.graphHash),hashes);
  assert.deepEqual(await Promise.all(warm.jobs.map(async job=>(await fs.stat(job.inputSnapshot)).mtimeMs)),snapshotTimes,'durable snapshots are not rewritten during warm reuse');
 assert.equal(warm.work.sourceHashing.bytesHashed,0);assert.ok(warm.work.sourceHashing.cacheHits>0);
 for(const job of warm.jobs){const result=JSON.parse(await fs.readFile(job.producedArtifacts[0]));assert.equal(result.receipt.validation.ok,true);assert.equal(result.receipt.rendered,false);assert.equal(result.receipt.modelCalls,0);assert.ok((await fs.stat(job.inputSnapshot)).size>0)}
 assert.deepEqual(await Promise.all(f.request.songs.map(song=>fs.readFile(song.projectPath,'utf8'))),before);
 assert.ok((await fs.readdir(f.output)).every(name=>!name.startsWith('.attempt-')));
});

test('one-song edits invalidate only that song and corrupt outputs cannot remain cache hits',async t=>{
 const f=await fixture(t);const first=await f.run();
 const file=f.request.songs[0].projectPath,project=JSON.parse(await fs.readFile(file));project.song_title='Edited title';await fs.writeFile(file,JSON.stringify(project));
 const changed=await f.run();assert.equal(changed.work.compiled,2);assert.equal(changed.work.cacheHits,2);
 assert.deepEqual(changed.jobs.filter(j=>j.songId==='fixture-1').map(j=>j.receipt.graphHash),first.jobs.filter(j=>j.songId==='fixture-1').map(j=>j.receipt.graphHash));
 await fs.writeFile(changed.jobs[0].producedArtifacts[0],'truncated');
 const repaired=await f.run();assert.equal(repaired.status,'complete');assert.equal(repaired.work.compiled,1);assert.equal(repaired.work.cacheHits,3);
 assert.ok((await fs.readdir(path.join(f.output,'invalidated'))).length>0);
});

test('cancelling an actual owned worker persists interruption, releases its lock and resumes cleanly',async t=>{
 const f=await fixture(t,1),controller=new AbortController();let workerPid;
 const cancelled=await f.run({signal:controller.signal,onProgress:event=>{if(event.activeWorker){workerPid=event.activeWorker.pid;controller.abort()}}});
 assert.equal(cancelled.status,'cancelled');assert.ok(workerPid);assert.throws(()=>process.kill(workerPid,0),error=>error.code==='ESRCH');
 assert.equal(cancelled.activeWorker,null);await assert.rejects(fs.access(path.join(f.output,'.runner-lock.json')));
 const resumed=await f.run();assert.equal(resumed.status,'complete');assert.equal(resumed.work.compiled,2);
});

test('a live runner excludes another writer and source changes during a worker prevent publication',async t=>{
 const f=await fixture(t,1);let tested=false,changed=false;
 const result=await f.run({onProgress:async event=>{
  if(!tested){tested=true;await assert.rejects(f.run(),error=>String(error.code).startsWith('OWNED_FILE_LOCK_'))}
  if(event.activeWorker&&!changed){changed=true;await fs.writeFile(f.media,'changed-during-compile')}
 }});
 assert.equal(result.status,'failed');assert.ok(result.jobs.some(job=>job.logs.some(line=>line.includes('Source bytes changed'))));
 assert.equal(result.work.compiled,0);
 const resumed=await f.run();assert.equal(resumed.status,'complete');assert.equal(resumed.work.compiled,2);
});

test('resume recovers a dead-owner running state and removes only owned partial attempts',async t=>{
 const f=await fixture(t,1);const paused=await f.run({maxJobs:0});
 const child=spawn(process.execPath,['--version'],{stdio:'ignore'});await new Promise(resolve=>child.once('close',resolve));
 paused.jobs[0].status='running';paused.activeWorker={pid:child.pid,jobId:paused.jobs[0].id};
 await fs.writeFile(path.join(f.output,'batch.json'),JSON.stringify(paused));
 await fs.writeFile(path.join(f.output,'.runner-lock.json'),JSON.stringify({schemaVersion:'hapa.echo.recipe-batch-lock.v1',pid:child.pid,token:'a'.repeat(64),createdAt:new Date().toISOString()}));
 const attempt=path.join(f.output,'.attempt-'+randomUUID());await fs.mkdir(attempt);await fs.writeFile(path.join(attempt,'result.json'),'partial');
 const resumed=await f.run();assert.equal(resumed.status,'complete');assert.equal(resumed.work.compiled,2);await assert.rejects(fs.access(attempt));
});


test('batch sources use the same /media route root as the app',async t=>{
 const f=await fixture(t,1),mediaDir=path.join(f.root,'media-api');await fs.mkdir(mediaDir);await fs.copyFile(f.media,path.join(mediaDir,'clip.bin'));
 const project=JSON.parse(await fs.readFile(f.request.songs[0].projectPath));
 for(const shot of project.timeline)shot.media_uri='/media/clip.bin';
 await fs.writeFile(f.request.songs[0].projectPath,JSON.stringify(project));
 const previous=process.env.HAPA_MEDIA_DIR;process.env.HAPA_MEDIA_DIR=mediaDir;
 try{const batch=await f.run();assert.equal(batch.status,'complete');assert.equal(batch.work.compiled,2)}
 finally{if(previous===undefined)delete process.env.HAPA_MEDIA_DIR;else process.env.HAPA_MEDIA_DIR=previous}
});

test('worker rejects unowned direct entry before reading inputs',async()=>{
 const env={...process.env};delete env.HAPA_ECHO_RECIPE_BATCH_WORKER;delete env.NODE_OPTIONS;
 const child=spawn(process.execPath,['scripts/echo-recipe-batch-worker.mjs','--input=/invalid','--output=/invalid'],{env});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});
 assert.equal(code,1);assert.match(stderr,/owned parent IPC channel and role/);
});
