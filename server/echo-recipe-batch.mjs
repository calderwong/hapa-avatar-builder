import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {createAlbumBatch,resumeAlbumBatch,claimAlbumJobs,recordAlbumJobResult,albumBatchQueueView} from '../src/domain/album-batch-orchestrator.js';
import {NARRATIVE_VARIANT_RECIPES} from '../src/domain/echo-director-recipes.js';
import {contentHash} from '../src/domain/echo-director-v2.js';
import {resolveEchoOutputProfile} from '../src/domain/echo-output-profile.js';
import {inspectEchoLocalCodeIdentity} from './echo-delivery-runtime-build.mjs';
import {createEchoSourceInspector} from './echo-source-inventory.mjs';
import {createEchoMediaEvidenceReader} from './echo-media-evidence-index.mjs';
import {validateEchoForkMedia} from './echo-media-eligibility.mjs';
import {resolveEchoRuntimeMediaUri} from './echo-runtime-media-route.mjs';
import {acquireOwnedFileLock,releaseOwnedFileLock} from './owned-file-lock.mjs';
import {validateEchoCompiledShowGraph} from '../src/domain/echo-compiled-show-graph.js';

const ROOT=path.resolve(import.meta.dirname,'..');
const WORKER_ROLE='HAPA_ECHO_RECIPE_BATCH_WORKER';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const alive=pid=>{try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}};
const readJson=async(file,fallback=null)=>{try{const info=await fs.stat(file);if(info.size>192*1024*1024)throw Error('JSON exceeds artifact budget: '+file);return JSON.parse(await fs.readFile(file,'utf8'))}catch(error){if(error.code==='ENOENT')return fallback;throw error}};
async function atomicJson(file,value){const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await fs.rename(temp,file)}finally{await fs.rm(temp,{force:true})}}
async function ensureSnapshot(file,value,directory){
  const bytes=Buffer.from(JSON.stringify(value)+'\n');
  try{if((await fs.readFile(file)).equals(bytes))return;await fs.mkdir(path.join(directory,'invalidated'),{recursive:true});await fs.rename(file,path.join(directory,'invalidated',path.basename(file)+'-'+randomUUID()))}catch(error){if(error.code!=='ENOENT')throw error}
  const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,bytes,{flag:'wx'});await fs.rename(temp,file)}finally{await fs.rm(temp,{force:true})}
}

export function normalizeEchoRecipeBatchRequest(request={}) {
  if(!Array.isArray(request.songs)||!request.songs.length||request.songs.length>12)throw Error('Choose 1–12 explicit songs with prepared project files.');
  const songs=request.songs.map(song=>{if(!/^[-a-zA-Z0-9_]+$/.test(song.id||'')||!song.projectPath)throw Error('Each song needs its exact ID and prepared project path.');return {id:song.id,projectPath:path.resolve(song.projectPath)}});
  if(new Set(songs.map(song=>song.id)).size!==songs.length)throw Error('A song may appear only once in a batch.');
  const recipes=[...new Set(request.recipes||[])];
  if(!recipes.length||recipes.length>5||recipes.some(id=>!NARRATIVE_VARIANT_RECIPES[id]))throw Error('Choose one or more supported narrative recipes.');
  const timingMode=request.timingMode||'preserve';if(!['preserve','supported-cues'].includes(timingMode))throw Error('Unknown timing mode.');
  const changeAmount=request.changeAmount??1;if(!Number.isFinite(changeAmount)||changeAmount<0||changeAmount>1)throw Error('Change amount must be 0–1.');
  const seed=String(request.seed??'album-1');if(seed.length>128)throw Error('Seed exceeds 128 characters.');
  const locks=request.locks||[];if(!Array.isArray(locks)||locks.length>256)throw Error('Locks must be a bounded list.');
  for(const field of ['requiredCharacterIds','requiredSceneIds'])if(request[field]&&(!Array.isArray(request[field])||request[field].length>64||request[field].some(id=>typeof id!=='string'||id.length>240)))throw Error('Choose declared cast and scene IDs.');
  return {schemaVersion:'hapa.echo.recipe-batch-request.v1',songs,recipes,seed,timingMode,changeAmount,locks:structuredClone(locks),requiredCharacterIds:request.requiredCharacterIds||[],requiredSceneIds:request.requiredSceneIds||[],outputProfile:request.outputProfile?resolveEchoOutputProfile(request.outputProfile):null};
}

async function acquireLock(output){
  const owner=acquireOwnedFileLock({lockPath:path.join(output,'.runner-lock.json'),schemaVersion:'hapa.echo.recipe-batch-lock.v1',staleLegacyMs:60000});
  return ()=>releaseOwnedFileLock(owner);
}

async function executeWorker({root,inputPath,attemptPath,signal,timeoutMs=120000,onStarted=()=>{}}){
  if(signal?.aborted)return {cancelled:true};
  if(process.env[WORKER_ROLE]==='1')throw Error('Recipe workers cannot launch nested workers.');
  const workerEnv={...process.env,[WORKER_ROLE]:'1'};delete workerEnv.NODE_OPTIONS;
  const log=await fs.open(path.join(attemptPath,'worker.log'),'wx');
  let child,closed,timer,force,cancelled=false,timedOut=false,terminating=false;
  const terminate=()=>{if(!child?.pid||terminating)return;terminating=true;try{process.kill(-child.pid,'SIGTERM')}catch(error){if(error.code!=='ESRCH')throw error}force=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}},5000)};
  const abort=()=>{cancelled=true;terminate()};
  try{
    child=fork(path.join(root,'scripts/echo-recipe-batch-worker.mjs'),['--input='+inputPath,'--output='+attemptPath],{cwd:root,env:workerEnv,detached:true,execArgv:['--max-old-space-size=1536'],stdio:['ignore',log.fd,log.fd,'ipc']});
    closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,workerSignal)=>resolve({code,signal:workerSignal}))});closed.catch(()=>{});
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    timer=setTimeout(()=>{timedOut=true;terminate()},timeoutMs);
    await onStarted(child.pid);
    const status=await closed;
    return {...status,cancelled,timedOut,pid:child.pid};
  }catch(error){terminate();await closed?.catch(()=>{});throw error}
  finally{clearTimeout(timer);clearTimeout(force);signal?.removeEventListener('abort',abort);await log.close()}
}

/** One owned worker at a time. Durable state is projected through the existing
 * album queue; source authoring paths are read only. */
export async function runEchoRecipeBatch({request,output,root=ROOT,signal,onProgress=()=>{},maxJobs=Infinity,retryFailed=false,evidenceReader=null,workerTimeoutMs=120000}={}){
  const specification=normalizeEchoRecipeBatchRequest(request),directory=path.resolve(output||'');
  if(!output)throw Error('A separate batch output directory is required.');
  const codeRoot=path.resolve(root),artifactRoot=path.join(codeRoot,'artifacts');
  if((directory===codeRoot||directory.startsWith(codeRoot+path.sep))&&directory!==artifactRoot&&!directory.startsWith(artifactRoot+path.sep))throw Error('Choose an artifact directory outside source authoring data.');
  if(specification.songs.some(song=>song.projectPath.startsWith(directory+path.sep)))throw Error('Keep prepared source files outside the batch output directory.');
  if(!(maxJobs===Infinity||Number.isInteger(maxJobs)&&maxJobs>=0)||!(workerTimeoutMs>0&&workerTimeoutMs<=120000))throw Error('Invalid bounded batch settings.');
  await fs.mkdir(directory,{recursive:true});const unlock=await acquireLock(directory);
  const statePath=path.join(directory,'batch.json');let state;
  const persist=async()=>{state.updatedAt=new Date().toISOString();await atomicJson(statePath,state);await atomicJson(path.join(directory,'queue-view.json'),albumBatchQueueView(state));await onProgress({status:state.status,preparation:state.preparation,activeWorker:state.activeWorker,jobs:state.jobs.map(({id,status,attempts,cacheHit})=>({id,status,attempts,cacheHit})),work:state.work})};
  try{
    const prior=await readJson(statePath),hashCache=await readJson(path.join(directory,'source-hashes.json'),{}),inspector=createEchoSourceInspector({cache:hashCache});
    if(prior?.activeWorker?.pid&&alive(prior.activeWorker.pid))throw Error('The previous owned worker is still exiting. Resume after it stops.');
    for(const entry of await fs.readdir(directory))if(/^\.attempt-[a-f0-9-]{36}$/.test(entry))await fs.rm(path.join(directory,entry),{recursive:true,force:true});
    state={schemaVersion:'hapa.echo.executable-recipe-batch.v1',status:'preparing',request:specification,jobs:prior?.jobs||[],work:{compiled:0,cacheHits:0},createdAt:prior?.createdAt||new Date().toISOString()};await persist();
    const compiler=inspectEchoLocalCodeIdentity({root,entries:['scripts/echo-recipe-batch-worker.mjs','server/echo-recipe-batch.mjs']});
    const reader=evidenceReader||createEchoMediaEvidenceReader({root,indexPath:path.join(root,'data/echo-media-evidence/index.json')});
    const mediaPaths={root,mediaDir:process.env.HAPA_MEDIA_DIR||path.join(root,'data/media'),songRegistryPath:process.env.HAPA_SONG_REGISTRY_DATA||path.join(os.homedir(),'Desktop/hapa-song-registry/data/registry.json'),songbookPath:path.join(root,'data/dear-papa-songbook.json'),mediaEvidenceReader:reader};
    const snapshots=new Map(),preparedSongs=[];
    for(const song of specification.songs){
      if(signal?.aborted)throw Object.assign(Error('Batch preparation cancelled.'),{name:'AbortError'});
      state.preparation={songId:song.id,stage:'source-validation',completed:preparedSongs.length,total:specification.songs.length};await persist();
      const bytes=await fs.readFile(song.projectPath);if(bytes.length>64*1024*1024)throw Error('Prepared project exceeds 64 MiB: '+song.id);
      const value=JSON.parse(bytes),project=structuredClone(value.music_video_project||value.project||value);
      if(project.song_id!==song.id||!Array.isArray(project.timeline)||!project.timeline.length)throw Error('Prepared project does not match requested song: '+song.id);
      if(specification.outputProfile)project.output_profile=specification.outputProfile;
      const availability=await validateEchoForkMedia(project.timeline,project.mediaConstraints||{},mediaPaths);project.timeline=availability.preparedTimeline;
      const uris=new Set(project.timeline.filter(shot=>shot.media_id!=='none'&&!shot.knockedOut&&shot.media_contract?.type!=='generated-visualizer').map(shot=>shot.runtime_media_uri||shot.media_contract?.runtimeUri||shot.media_uri||shot.media_contract?.originalUri));
      for(const uri of [project.audio_uri||project.audio_path,...(project.director_show_graph?.stems?.items||[]).map(stem=>stem.audioPath)])if(uri)uris.add(uri);
      const sourceHashes=[];
      for(const uri of uris){const route=resolveEchoRuntimeMediaUri(uri,mediaPaths);if(!route.ok)throw Error('Prepare a local source for '+uri);const source=await inspector.inspect(route.resolvedPath);if(source.status!=='bytes-verified')throw Error('Source validation failed: '+source.path);sourceHashes.push({path:source.path,sha256:source.sha256,bytes:source.bytes})}
      sourceHashes.sort((a,b)=>a.path.localeCompare(b.path));
      const snapshot={project,sourceHashes,sourceFile:{path:song.projectPath,sha256:digest(bytes)},compilerHash:compiler.sha256};
      if(digest(await fs.readFile(song.projectPath))!==snapshot.sourceFile.sha256)throw Error('Prepared project changed during validation: '+song.id);
      snapshots.set(song.id,snapshot);preparedSongs.push({id:song.id,sourceHash:contentHash(snapshot)});
    }
    await atomicJson(path.join(directory,'source-hashes.json'),inspector.cache);
    state=createAlbumBatch({songs:preparedSongs,variants:specification.recipes,stageIds:['variant-compile'],budgets:{cpu:1,gpu:0,disk:1,decoders:0,cacheGB:.1}});
    state.schemaVersion='hapa.echo.executable-recipe-batch.v1';state.request=specification;state.compiler=compiler;state.createdAt=prior?.createdAt||new Date().toISOString();
    state.work={compiled:0,cacheHits:0,sourceHashing:inspector.metrics(),maxConcurrency:1,workerHeapLimitMiB:1536,analysisCalls:0,enrichmentCalls:0,modelCalls:0};
    const artifactIndex={};
    for(const job of state.jobs){
      const options={recipeId:job.variant,seed:`${specification.seed}:${job.songId}:${job.variant}`,timingMode:specification.timingMode,changeAmount:specification.changeAmount,locks:specification.locks,requiredCharacterIds:specification.requiredCharacterIds,requiredSceneIds:specification.requiredSceneIds};
      const input={...snapshots.get(job.songId),options};job.inputHash=contentHash(input);job.artifactHash=job.inputHash;
      const old=prior?.jobs?.find(row=>row.id===job.id&&row.inputHash===job.inputHash);if(old)Object.assign(job,old);
      if(job.status==='cancelled'||retryFailed&&job.status==='failed'){job.status='queued';job.attempts=0}
      let cached;try{cached=await readJson(path.join(directory,'jobs',job.artifactHash,'receipt.json'))}catch{cached=null}
      if(cached?.inputHash===job.inputHash){try{const bytes=await fs.readFile(path.join(directory,'jobs',job.artifactHash,'result.json'));const result=JSON.parse(bytes);if(digest(bytes)===cached.resultSha256&&result.inputHash===job.inputHash&&result.compilerHash===compiler.sha256&&cached.graphHash===result.graph?.directorV2?.variantHash&&validateEchoCompiledShowGraph({project:result.project,sourceProject:input.project,graph:result.graph}).ok)artifactIndex[job.artifactHash]={valid:true,receipt:cached,artifacts:[path.join(directory,'jobs',job.artifactHash,'result.json')]}}catch{}}
      job.cacheHit=Boolean(artifactIndex[job.artifactHash]);if(job.cacheHit)state.work.cacheHits++;
      snapshots.set(job.id,{...input,inputHash:job.inputHash});
      job.inputSnapshot=path.join(directory,'inputs',job.inputHash+'.json');await fs.mkdir(path.dirname(job.inputSnapshot),{recursive:true});await ensureSnapshot(job.inputSnapshot,snapshots.get(job.id),directory);
    }
    state=resumeAlbumBatch(state,artifactIndex);await persist();
    for(;;){
      if(signal?.aborted){state.status='cancelled';break}
      if(state.work.compiled>=maxJobs){state.status=state.jobs.some(job=>job.status==='queued')?'paused':'complete';break}
      const claim=claimAlbumJobs(state);state=claim.batch;const id=claim.claimedJobIds[0];if(!id)break;
      const job=state.jobs.find(row=>row.id===id),attemptPath=path.join(directory,'.attempt-'+randomUUID());await fs.mkdir(attemptPath);
      const inputPath=job.inputSnapshot;await persist();
      try{
        const result=await executeWorker({root,inputPath,attemptPath,signal,timeoutMs:workerTimeoutMs,onStarted:async pid=>{state.activeWorker={pid,jobId:id,startedAt:new Date().toISOString()};await persist()}});
        state.activeWorker=null;
        if(result.cancelled){state=recordAlbumJobResult(state,id,{cancelled:true,message:'Worker cancelled; resume will retry this compile.'});state.status='cancelled';await persist();break}
        if(result.code!==0){const failure=await readJson(path.join(attemptPath,'failure.json'));throw Object.assign(Error(failure?.message||`Worker ended: ${JSON.stringify(result)}`),{details:failure})}
        const bytes=await fs.readFile(path.join(attemptPath,'result.json')),artifact=JSON.parse(bytes);
        if(artifact.inputHash!==job.inputHash||!artifact.receipt?.validation?.ok)throw Error('Worker result does not match the queued snapshot.');
        const snapshot=snapshots.get(id);
        if(digest(await fs.readFile(snapshot.sourceFile.path))!==snapshot.sourceFile.sha256)throw Error('Prepared project changed during compilation; resume with the new input.');
        for(const source of snapshot.sourceHashes)if((await inspector.inspect(source.path)).sha256!==source.sha256)throw Error('Source bytes changed during compilation; prepare the updated media.');
        if(inspectEchoLocalCodeIdentity({root,entries:compiler.entries}).sha256!==compiler.sha256)throw Error('Compiler changed during this run; restart the batch.');
        const receipt={inputHash:job.inputHash,inputSnapshot:job.inputSnapshot,resultSha256:digest(bytes),graphHash:artifact.receipt.graphHash,metrics:await readJson(path.join(attemptPath,'metrics.json')),completedAt:new Date().toISOString()};
        await atomicJson(path.join(attemptPath,'receipt.json'),receipt);
        const destination=path.join(directory,'jobs',job.artifactHash);await fs.mkdir(path.dirname(destination),{recursive:true});
        try{await fs.access(destination);await fs.mkdir(path.join(directory,'invalidated'),{recursive:true});await fs.rename(destination,path.join(directory,'invalidated',job.artifactHash+'-'+randomUUID()))}catch(error){if(error.code!=='ENOENT')throw error}
        await fs.rename(attemptPath,destination);state.work.compiled++;
        state=recordAlbumJobResult(state,id,{ok:true,receipt,artifacts:[path.join(destination,'result.json')],durationSeconds:receipt.metrics.durationMs/1000});
      }catch(error){state=recordAlbumJobResult(state,id,{ok:false,retryable:false,message:error.message});state.jobs.find(row=>row.id===id).failure=error.details||{message:error.message}}
      finally{state.activeWorker=null;await fs.rm(attemptPath,{recursive:true,force:true});await persist()}
    }
    if(!['cancelled','paused'].includes(state.status))state.status=state.jobs.some(job=>job.status==='failed')?'failed':state.jobs.every(job=>['done','cached'].includes(job.status))?'complete':'paused';
    await persist();return state;
  }catch(error){if(state){state.status=signal?.aborted?'cancelled':'failed';state.failure={message:error.message};await persist()}throw error}
  finally{await unlock()}
}
