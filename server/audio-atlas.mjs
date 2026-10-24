import {createAtlasDescriptions} from './audio-atlas-descriptions.mjs';
import {deriveActivity,activitySummary,queryActivity} from './audio-atlas-activity.mjs';
import {validateHarmony,harmonySummary,queryHarmony} from './audio-atlas-harmony.mjs';
import {deriveNotes,notesSummary,queryNotes} from './audio-atlas-notes.mjs';
import {validateRhythm,rhythmSummary,queryRhythm} from './audio-atlas-rhythm.mjs';
import {pitchRequest,pitchRuntime,validatePitch,pitchSummary,queryPitch} from './audio-atlas-pitch.mjs';
import {noiseRange,noiseReport,validateNoiseReference} from './audio-atlas-noise.mjs';
import {validateTechnical,queryTechnical,technicalSummary} from './audio-atlas-technical.mjs';
import {querySpectrogram,validateSpectrogram,verifySpectrogramArtifact} from './audio-atlas-spectrogram.mjs';
import {createAtlasTextSearch} from './audio-atlas-text-search.mjs';
import {validateTimingReference, timingEvaluation} from '../src/domain/audio-atlas-references.js';
import { buildAtlasContract, summarizeAtlasContract, CONTRACT_VERSION } from './audio-atlas-contract.mjs';
import { inspectAudioInventory } from './audio-atlas-inventory.mjs';
import { atlasVisualScore } from './audio-atlas-visual-score.mjs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createEchoSourceInspector } from './echo-source-inventory.mjs';
import { chooseStemSet, stemRoleLabel } from '../src/domain/echo-stem-set.js';
import { acquireOwnedFileLock, releaseOwnedFileLock } from './owned-file-lock.mjs';

import {alignmentRequest} from '../src/domain/audio-atlas-alignment.js';
export {alignmentRequest};
const ALIGNMENT_FILES=['README.md','chat_template.json','config.json','generation_config.json','merges.txt','model.safetensors','model.safetensors.index.json','preprocessor_config.json','tokenizer_config.json','vocab.json'];
async function alignmentConfig(storage,enabled){
  if(!enabled)return null;
  const file=path.join(storage,'alignment-model.json');
  if(!fs.existsSync(file))throw fail('Configure an existing local Qwen3 forced-aligner runtime and pinned model first',422);
  const c=read(file);
  if(!path.isAbsolute(c.python||'')||!path.isAbsolute(c.modelPath||'')||c.repository!=='mlx-community/Qwen3-ForcedAligner-0.6B-8bit'||!/^([a-f0-9]{40})$/.test(c.revision||'')||!c.sha256||
    Object.keys(c.sha256).length!==ALIGNMENT_FILES.length||ALIGNMENT_FILES.some(n=>!/^([a-f0-9]{64})$/.test(c.sha256[n]||'')))throw fail('Invalid pinned alignment model configuration',422);
  for(const name of ALIGNMENT_FILES){
    const digest=createHash('sha256');for await(const chunk of fs.createReadStream(path.join(c.modelPath,name)))digest.update(chunk);
    if(digest.digest('hex')!==c.sha256[name])throw fail('Alignment checkpoint integrity mismatch',409);
  }
  return {python:c.python,modelPath:c.modelPath,repository:c.repository,revision:c.revision,sha256:c.sha256};
}

export const ATLAS_VERSION = 'hapa.audio-atlas.v1';
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const fail = (message, statusCode=400) => Object.assign(new Error(message), { statusCode });
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
function atomic(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=`${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600});fs.renameSync(temp,file); }
  finally { fs.rmSync(temp,{force:true}); }
}
const safeId = id => { if (!/^[a-zA-Z0-9_-]{1,180}$/.test(String(id))) throw fail('Invalid Atlas identifier'); return id; };
export function overlaps(row,start,end) {
  return row.shape==='instant' ? row.start_sample>=start && row.start_sample<end : row.start_sample<end && row.end_sample>start;
}
export function sampleRange(start,end,count) {
  const a=Number(start??0),b=Number(end??count);
  if (!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<=a||b>count) throw fail('Range must be integer samples with 0 <= start < end <= sample count');
  return [a,b];
}
export function validateAtlasResult(r){
  if(!Array.isArray(r.assets)||!r.assets.length||!Array.isArray(r.observations))throw fail('Invalid Atlas result');
  const assets=new Map(r.assets.map(a=>[a.id,a]));if(assets.size!==r.assets.length)throw fail('Duplicate asset identity');
  const ids=new Set();validatePitch(r);validateRhythm(r);validateHarmony(r);
  for(const a of r.assets.filter(a=>a.status==='ready')){validateSpectrogram(a);validateTechnical(a);}
  for(const a of r.assets.filter(a=>a.status==='ready'))if(!Number.isSafeInteger(a.sample_count)||a.sample_count<=0||!Number.isSafeInteger(a.sample_rate_hz)||a.sample_rate_hz<=0)throw fail('Invalid reference timeline');
  for(const o of r.observations){
    const a=assets.get(o.subject_id);
    if(ids.has(o.id)||!a||a.status!=='ready'||!Number.isSafeInteger(o.start_sample)||!Number.isSafeInteger(o.end_sample)||o.start_sample<0||o.end_sample>a.sample_count||
      (o.shape==='instant'?o.start_sample!==o.end_sample||o.start_sample>=a.sample_count:o.shape!=='interval'||o.end_sample<=o.start_sample))throw fail('Invalid observation coordinates or identity');
    ids.add(o.id);
  }
  return r;
}
export function workerOptions(root) {
  return {cwd:root,shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],
    env:Object.fromEntries([...['PATH','HOME','TMPDIR','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]),
      ['HAPA_AUDIO_ATLAS_WORKER','1'],['NUMBA_NUM_THREADS','1'],['OMP_NUM_THREADS','1'],['OPENBLAS_NUM_THREADS','1'],['VECLIB_MAXIMUM_THREADS','1'],['HF_HUB_OFFLINE','1'],['TRANSFORMERS_OFFLINE','1'],['HF_HUB_DISABLE_TELEMETRY','1'],['PYTHONDONTWRITEBYTECODE','1'],['TOKENIZERS_PARALLELISM','false'],['RAYON_NUM_THREADS','1']])};
}
function runtimeIdentity(python){
  const executable=path.isAbsolute(python)?python:(process.env.PATH||'').split(path.delimiter).map(d=>path.join(d,python)).find(p=>fs.existsSync(p));
  if(!executable)return {python,unresolved:true};
  const pythonRoot=path.resolve(path.dirname(executable),'..');
  const lib=path.join(pythonRoot,'lib'),packages=[];
  if(fs.existsSync(lib))for(const version of fs.readdirSync(lib).filter(n=>/^python[0-9]/.test(n))){
    const site=path.join(lib,version,'site-packages');
    if(fs.existsSync(site))for(const name of fs.readdirSync(site).filter(n=>n.endsWith('.dist-info')).sort()){
      const metadata=path.join(site,name,'METADATA');if(fs.existsSync(metadata))packages.push([name,hash(fs.readFileSync(metadata))]);
    }
  }
  const decoder=(process.env.PATH||'').split(path.delimiter).map(d=>path.join(d,'ffmpeg')).find(p=>fs.existsSync(p));
  return {python_sha256:hash(fs.readFileSync(executable)),packages,ffmpeg_sha256:decoder?hash(fs.readFileSync(decoder)):null};
}
export function workerCommand(root,manifest,{python,workerFile='audio-atlas-worker.py',sandboxNetwork=false}) {
  const args=[path.join(root,'scripts',workerFile),'--manifest',manifest];
  if(!sandboxNetwork)return {executable:python,args};
  if(process.platform!=='darwin'||!fs.existsSync('/usr/bin/sandbox-exec'))throw fail('The offline listener requires the macOS sandbox',422);
  return {executable:'/usr/bin/sandbox-exec',args:['-p','(version 1) (allow default) (deny network*)',python,...args]};
}
export function runWorker(root,manifest,{signal,onOutput,onSpawn=()=>{},python,workerFile='audio-atlas-worker.py',timeoutMs=600000,sandboxNetwork=false}) {
  if (process.env.HAPA_AUDIO_ATLAS_WORKER) throw fail('Atlas worker may not recursively coordinate');
  return new Promise((resolve,reject)=>{
    let child,timer,killTimer,reason=null,settled=false;
    const kill=sig=>{if(child?.pid)try{process.platform==='win32'?child.kill(sig):process.kill(-child.pid,sig);}catch(e){if(e.code!=='ESRCH')onOutput(e.message);}};
    const stop=()=>{reason=fail('Analysis cancelled or timed out',409);kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),2000);};
    const done=e=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);signal.removeEventListener('abort',stop);e?reject(e):resolve();};
    try {
      const command=workerCommand(root,manifest,{python,workerFile,sandboxNetwork});
      child=spawn(command.executable,command.args,workerOptions(root));
      onSpawn(child.pid);
      child.stdout.on('data',b=>onOutput(String(b)));child.stderr.on('data',b=>onOutput(String(b)));
      child.once('error',done);child.once('close',code=>{if(reason)kill('SIGKILL');done(reason||(code===0?null:fail(`Audio worker exited ${code}`,500)));});
      signal.addEventListener('abort',stop,{once:true});timer=setTimeout(stop,Math.max(100,Math.min(600000,timeoutMs)));if(signal.aborted)stop();
    } catch(e){kill('SIGKILL');done(e);}
  });
}

/** Derived analysis owner under the existing Builder. Song/media identity stays in the song store. */
export function createAudioAtlas({root,storage=path.join(root,'data/audio-atlas'),songStore=path.join(root,'data/hapa-songs-store.json'),python=process.env.HAPA_PYTHON||'python3',runner=runWorker}={}) {
  const active=new Map();
  const lock=()=>acquireOwnedFileLock({lockPath:path.join(storage,'.writer.lock'),schemaVersion:'hapa.audio-atlas.lock.v1',staleLegacyMs:120000});
  const jobFile=id=>path.join(storage,'jobs',`${safeId(id)}.json`);
  const directory=id=>path.join(storage,'runs',safeId(id));
  function songs(){return read(songStore).songs||[];}
  function list(){return songs().map(s=>({id:s.id,title:s.title,stem_count:(s.stems||[]).filter(x=>x.localPath).length,sources:[{id:'master',role:'Master'},...(s.stems||[]).filter(x=>x.localPath).map((x,i)=>({id:`stem-${i+1}`,role:x.kind||x.stemType||x.title||`Stem ${i+1}`}))]}));}
  function jobs(songId){
    const folder=path.join(storage,'jobs');
    return (fs.existsSync(folder)?fs.readdirSync(folder):[]).filter(n=>/^[a-zA-Z0-9_-]+\.json$/.test(n)).map(n=>status(n.slice(0,-5))).filter(j=>!songId||j.song_id===songId).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  }
  function status(id){
    if(!fs.existsSync(jobFile(id)))throw fail('Atlas job not found',404);
    const j=read(jobFile(id));
    if(['queued','running','cancelling'].includes(j.state)&&!active.has(id)) {
      try{process.kill(j.owner_pid,0);}catch(e){if(e.code==='ESRCH'){if(j.worker_pid){try{process.kill(j.worker_pid,0);return {...j,state:'orphaned',message:'Worker remains alive after owner exit. No replacement worker will start.'};}catch{}}return {...j,state:'interrupted',message:'Worker owner exited. Explicit analysis retry reuses ready results; no background restart.'};}}
    }
    if(['queued','running','cancelling'].includes(j.state)&&fs.existsSync(path.join(directory(id),'progress.json')))j.progress=read(path.join(directory(id),'progress.json'));
    return j;
  }
  function result(id){
    const j=status(id);if(j.state!=='complete')throw fail(`Atlas result is ${j.state}`,409);
    const bytes=fs.readFileSync(path.join(directory(id),'result.json'));
    if(hash(bytes)!==j.result_sha256)throw fail('Atlas result integrity mismatch',409);
    const value=JSON.parse(bytes);validateAtlasResult(value);return value;
  }
  async function start(songId,{transcribe=false,beats=false,acoustic=false,alignment=null,pitch=null,alignmentBaseRunId=null,transcriptionBaseRunId=null,transcriptionSourceId=null,transcriptionLanguage='en'}={}){
    textSearch.ensureNoOrphans();descriptions.ensureNoOrphans();
    alignment=alignmentRequest(alignment);pitch=pitchRequest(pitch);
    if(alignmentBaseRunId && (!alignment || transcribe || beats || acoustic || pitch)) throw fail('Analysis reuse is only available for alignment-only requests',422);
    if(transcriptionBaseRunId && (!transcribe || alignment || alignmentBaseRunId || beats || acoustic || pitch)) throw fail('Transcription reuse requires transcription-only request',422);
    if(transcriptionSourceId && !transcribe) throw fail('Transcription source requires transcription',422);
    if(!['en','auto'].includes(transcriptionLanguage)) throw fail('Transcription language must be en or auto',422);
    const transcriptionOnly=Boolean(transcriptionBaseRunId);
    alignmentBaseRunId=alignmentBaseRunId||transcriptionBaseRunId;
    if(alignmentBaseRunId) safeId(alignmentBaseRunId);
    safeId(songId);
    const song=songs().find(s=>s.id===songId);if(!song)throw fail('Song not found',404);
    if(alignment&&!list().find(s=>s.id===songId).sources.some(s=>s.id===alignment.sourceId))throw fail('Alignment source is not registered for this song',422);
    const alignConfig=await alignmentConfig(storage,alignment);
    if(pitch&&!list().find(s=>s.id===songId).sources.some(s=>s.id===pitch.sourceId))throw fail('Pitch source is not registered for this song',422);
    const pitchConfig=pitchRuntime(storage,pitch);
    const configFile=path.join(storage,'local-model.json');
    const config=transcribe&&fs.existsSync(configFile)?read(configFile):null;
    if(transcribe&&(!config?.python||!config?.modelPath))throw fail('Configure an existing local MLX Whisper runtime and model before requesting transcription',422);
    if(jobs().some(j=>j.state==='orphaned'))throw fail('An orphaned analysis worker is still alive; resolve its recorded process before retry',409);
    const beatFile=path.join(storage,'beat-model.json');
    const beatConfig=beats&&fs.existsSync(beatFile)?read(beatFile):null;
    if(beats&&(!beatConfig?.python||!beatConfig?.checkpoint))throw fail('Configure the project-local Beat This runtime and checkpoint first',422);
    const beatModel=beatConfig?{...beatConfig,sha256:hash(fs.readFileSync(beatConfig.checkpoint))}:null;
    const clapFile=path.join(storage,'clap-model.json');
    const clapConfig=acoustic&&fs.existsSync(clapFile)?read(clapFile):null;
    if(acoustic&&(!clapConfig?.python||!clapConfig?.modelPath))throw fail('Configure local CLAP audio and text encoders first',422);
    if(clapConfig)for(const [name,expected] of Object.entries(clapConfig.sha256))if(hash(fs.readFileSync(path.join(clapConfig.modelPath,name)))!==expected)throw fail('CLAP model integrity mismatch',409);
    const lease=lock();let handedOff=false;
    try{
      const inspector=createEchoSourceInspector();
      const sources=[];
      // One stem set only (one generation, one record per role; WAV preferred via localPath), never every file.
      const stemSet=chooseStemSet(song.stems||[],{songTitle:song.title,preferDirs:[song.audio?.localPath]}).filter(s=>s.localPath);
      for(const [index,row] of [song.audio,...stemSet].entries()){
        const info=await inspector.inspect(row?.localPath);
        if(info.status!=='bytes-verified'||!info.audioHeaderRecognized)throw fail(`Unreadable registered ${index?'stem':'master'} audio`,422);
        sources.push({id:index?`stem-${index}`:'master',role:index?(row.kind||row.stemType||row.title):'Master',path:row.localPath,uri:index?row.uri:row.wavUri||row.mp3Uri,sha256:info.sha256});
      }
      if(transcriptionSourceId&&!sources.some(s=>s.id===transcriptionSourceId))throw fail('Transcription source is not registered for this song',422);
      if(sources.length>25)throw fail('At most 24 stems per analysis');
      // Never analyze duplicate stems: one record per role and each file at most once.
      const stemRoles=sources.slice(1).map(s=>stemRoleLabel({stemType:s.role}).toLowerCase().replace(/[^a-z0-9]+/g,''));
      if(new Set(stemRoles).size!==stemRoles.length)throw fail('Duplicate stem roles in one analysis; choose one stem set',422);
      const sourceFiles=sources.map(s=>fs.realpathSync(s.path));
      if(new Set(sourceFiles).size!==sourceFiles.length)throw fail('The same audio file appears twice in one analysis',422);
      // No total-custody cap (removed 2026-10-09, Calder): assets decode one at a time under per-asset decode budgets.
      const lyrics=typeof song.lyrics==='string'?song.lyrics:song.lyrics?.text||'';
      const code=['scripts/audio-atlas-worker.py','scripts/echo_audio_analysis_cache.py','scripts/echo_reconstruction_alignment.py','scripts/audio_atlas_stem_alignment.py','scripts/audio_atlas_structure.py','scripts/audio_atlas_spectrogram.py','scripts/audio_atlas_technical.py','scripts/audio_atlas_harmony.py',...(pitch?['scripts/audio-atlas-pitch.py','scripts/audio_atlas_pitch.py']:[]),...(beats?['scripts/audio-atlas-beats.py','scripts/audio_atlas_rhythm.py']:[]),...(acoustic?['scripts/audio-atlas-clap.py']:[]),...(alignment?['scripts/audio-atlas-align.py','scripts/audio_atlas_word_alignment.py']:[])].map(p=>hash(fs.readFileSync(path.join(root,p))));
      const model=config?{path:config.modelPath,revision:path.basename(config.modelPath),
        weights_sha256:hash(fs.readFileSync(path.join(config.modelPath,'weights.npz'))),
        config_sha256:hash(fs.readFileSync(path.join(config.modelPath,'config.json')))}:null;
      const selectedPython=config?.python||alignConfig?.python||pitchConfig?.python||python;
      let alignmentBase=null,alignmentBaseHash=null;
      if(alignmentBaseRunId){
        alignmentBase=result(alignmentBaseRunId);buildAtlasContract(alignmentBase);
        alignmentBaseHash=status(alignmentBaseRunId).result_sha256;
        if(alignmentBase.song_id!==songId || alignmentBase.assets.length!==sources.length || sources.some(source=>!alignmentBase.assets.some(asset=>asset.id===source.id&&asset.role===source.role&&asset.status==='ready'&&asset.source_sha256===source.sha256))) throw fail('Reused analysis source set differs from current song audio',409);
        for(const asset of alignmentBase.assets) verifySpectrogramArtifact(asset,directory(alignmentBaseRunId));
      }
      const key=hash({transcriptionSourceId,transcriptionLanguage,transcriptionOnly,alignmentBaseRunId,alignmentBaseHash,version:ATLAS_VERSION,contractVersion:CONTRACT_VERSION,songId,sources,lyrics,timing:song.lyricTimings,code,python:selectedPython,runtime:runtimeIdentity(selectedPython),beatRuntime:beatModel?runtimeIdentity(beatModel.python):null,model,beatModel,clapConfig,clapRuntime:clapConfig?runtimeIdentity(clapConfig.python):null,alignment,alignmentModel:alignConfig,alignmentRuntime:alignConfig?runtimeIdentity(alignConfig.python):null,...(pitch?{pitch,pitchConfig,pitchRuntime:runtimeIdentity(pitchConfig.python)}:{})});
      for(const old of jobs(songId).filter(j=>j.key===key&&j.state==='complete')){
        try{const cached=result(old.id);buildAtlasContract(cached);for(const a of cached.assets)verifySpectrogramArtifact(a,directory(old.id));return {...old,cache_hit:true};}catch{/* Corrupt output never qualifies as a cache hit. */}
      }
      const id=randomUUID(),dir=directory(id);fs.mkdirSync(dir,{recursive:true});
      // Preserve bytes through the existing Builder media directory, not a second song catalog.
      const mediaRoot=path.join(root,'data/media/audio-atlas');fs.mkdirSync(mediaRoot,{recursive:true});
      for(const source of sources){
        const extension=path.extname(source.path).toLowerCase();
        const preserved=path.join(mediaRoot,source.sha256+extension);
        if(!fs.existsSync(preserved)){
          const temp=preserved+'.'+id+'.tmp';
          try{await fsp.copyFile(source.path,temp,fs.constants.COPYFILE_EXCL);
            if((await createEchoSourceInspector().inspect(temp)).sha256!==source.sha256)throw fail('Source changed during custody copy');
            await fsp.rename(temp,preserved);
          }finally{await fsp.rm(temp,{force:true});}
        }
        if((await createEchoSourceInspector().inspect(preserved)).sha256!==source.sha256)throw fail('Preserved source integrity mismatch');
        source.original_path=source.path;source.path=preserved;source.uri=`/api/echos/audio-atlas/jobs/${id}/audio/${source.id}`;
      }
      const manifest={id,transcription_only:transcriptionOnly,transcription:{source_id:transcriptionSourceId,language:transcriptionLanguage},song:{id:songId,title:song.title,lyrics,lyricTimings:song.lyricTimings||[]},sources,model,beats:beatModel,clap:clapConfig,alignment,alignment_model:alignConfig,pitch,pitch_runtime:pitchConfig,alignment_base:alignmentBaseRunId?{run_id:alignmentBaseRunId,result_sha256:alignmentBaseHash}:null};
      atomic(path.join(dir,'manifest.json'),manifest);
      const job={id,song_id:songId,title:song.title,key,state:'queued',created_at:new Date().toISOString(),owner_pid:process.pid,policy:'local-private',cache_hit:false};
      atomic(jobFile(id),job);
      const controller=new AbortController();const handle={controller,promise:null};active.set(id,handle);
      const update=patch=>{Object.assign(job,patch,{updated_at:new Date().toISOString()});atomic(jobFile(id),job);};
      handle.promise=(async()=>{
        try{
          update({state:'running'});
          if(alignmentBase){
            // Reuse source-bound measurements, not prior words, reviews or inferred alignment.
            const assets=structuredClone(alignmentBase.assets);
            for(const asset of assets){
              const bytes=verifySpectrogramArtifact(asset,directory(alignmentBaseRunId));
              if(bytes) fs.writeFileSync(path.join(dir,asset.spectrogram.artifact),bytes);
              asset.source_uri=sources.find(source=>source.id===asset.id).uri;
            }
            const reused={schema_version:alignmentBase.schema_version,run_id:id,song_id:songId,title:song.title,
              supplied_lyrics:lyrics,imported_word_candidates:song.lyricTimings||[],assets,observations:[],coverage:{},
              stem_alignment:{status:'unknown'},elapsed_seconds:0,
              measurement_reuse:{run_id:alignmentBaseRunId,result_sha256:alignmentBaseHash,source_hashes_verified:true,scope:'asset measurements only; no prior word candidates or review inherited'}};
            validateAtlasResult(reused);buildAtlasContract(reused);atomic(path.join(dir,'result.json'),reused);
            if(transcriptionOnly) await runner(root,path.join(dir,'manifest.json'),{python:selectedPython,signal:controller.signal,onSpawn:pid=>update({worker_pid:pid}),onOutput:text=>{job.output_tail=(job.output_tail||'').concat(text).slice(-2500);}});
          }else{
          await runner(root,path.join(dir,'manifest.json'),{python:selectedPython,signal:controller.signal,onSpawn:pid=>update({worker_pid:pid}),onOutput:text=>{job.output_tail=(job.output_tail||'').concat(text).slice(-2500);}});
          }
          if(controller.signal.aborted)throw fail('Analysis cancelled');
          if(beatModel){
            atomic(path.join(dir,'progress.json'),{stage:'beats',role:'Beat This CPU',completed:sources.length,total:sources.length});
            await runner(root,path.join(dir,'manifest.json'),{python:beatModel.python,workerFile:'audio-atlas-beats.py',signal:controller.signal,onSpawn:pid=>update({worker_pid:pid}),onOutput:text=>{job.output_tail=(job.output_tail||'').concat(text).slice(-2500);}});
            if(controller.signal.aborted)throw fail('Analysis cancelled');
          }
          if(clapConfig){
            atomic(path.join(dir,'progress.json'),{stage:'acoustic',role:'CLAP CPU',completed:0,total:1});
            await runner(root,path.join(dir,'manifest.json'),{python:clapConfig.python,workerFile:'audio-atlas-clap.py',signal:controller.signal,onSpawn:pid=>update({worker_pid:pid}),onOutput:text=>{job.output_tail=(job.output_tail||'').concat(text).slice(-2500);}});
            if(controller.signal.aborted)throw fail('Analysis cancelled');
          }
          if(alignConfig){
            atomic(path.join(dir,'progress.json'),{stage:'alignment',role:'Qwen3 supplied-text alignment',completed:0,total:1});
            await runner(root,path.join(dir,'manifest.json'),{python:alignConfig.python,workerFile:'audio-atlas-align.py',signal:controller.signal,onSpawn:pid=>update({worker_pid:pid}),onOutput:text=>{job.output_tail=(job.output_tail||'').concat(text).slice(-2500);}});
            if(controller.signal.aborted)throw fail('Analysis cancelled');
          }
          if(pitchConfig){
            atomic(path.join(dir,'progress.json'),{stage:'pitch',role:'pYIN pitch candidates',completed:0,total:1});
            await runner(root,path.join(dir,'manifest.json'),{python:pitchConfig.python,workerFile:'audio-atlas-pitch.py',signal:controller.signal,onSpawn:pid=>update({worker_pid:pid}),onOutput:text=>{job.output_tail=(job.output_tail||'').concat(text).slice(-2500);}});
            if(controller.signal.aborted)throw fail('Analysis cancelled');
          }
          // Check all inputs again before publishing a complete result.
          const verify=createEchoSourceInspector();for(const s of sources)if((await verify.inspect(s.original_path||s.path)).sha256!==s.sha256)throw fail('Source changed before publication');
          const r=read(path.join(dir,'result.json'));validateAtlasResult(r);buildAtlasContract(r);
          if(r.run_id!==id||r.song_id!==songId||r.assets?.[0]?.status!=='ready')throw fail('Invalid worker result');
          update({state:'complete',result_sha256:hash(fs.readFileSync(path.join(dir,'result.json'))),elapsed_seconds:r.elapsed_seconds});
        }catch(e){update({state:controller.signal.aborted?'cancelled':'failed',error:e.message});}
        finally{active.delete(id);releaseOwnedFileLock(lease);}
      })();
      handedOff=true;return {...job};
    }finally{if(!handedOff)releaseOwnedFileLock(lease);}
  }
  async function wait(id){await active.get(id)?.promise;return status(id);}
  async function cancel(id){const h=active.get(id);if(!h)throw fail('Only this process can cancel its active worker',409);h.controller.abort();await h.promise;return status(id);}
  function reviews(id){result(id);const f=path.join(directory(id),'reviews.json');return fs.existsSync(f)?read(f):{revision:0,events:[]};}
  function review(id,input){
    const lease=lock();try{
      const r=result(id),current=reviews(id);
      if(input.revision!==current.revision)throw fail('Review revision conflict',409);
      if(!r.observations.some(o=>o.id===input.observation_id))throw fail('Observation not found',404);
      if(!['accepted_by_human','rejected','needs_review'].includes(input.state)||typeof input.reviewer!=='string'||!input.reviewer.trim()||!input.note?.trim())throw fail('State, reviewer and note are required');
      const observation=r.observations.find(o=>o.id===input.observation_id);
      let correction=null;
      if(input.correction){
        const asset=r.assets.find(a=>a.id===observation.subject_id),c=input.correction;
        const start=Number(c.start_sample),end=Number(c.end_sample);
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>asset.sample_count||(observation.shape==='instant'?start!==end||start>=asset.sample_count:end<=start))throw fail('Correction must use valid source sample coordinates');
        if(c.text!==undefined&&(typeof c.text!=='string'||c.text.length>1000))throw fail('Invalid correction text');
        correction={start_sample:start,end_sample:end,...(c.text!==undefined?{text:c.text}:{}),claim_type:'human_asserted',source_timeline_id:observation.timeline_id};
      }
      const event={correction,id:randomUUID(),observation_id:input.observation_id,state:input.state,reviewer:input.reviewer.slice(0,120),note:input.note.slice(0,4000),created_at:new Date().toISOString()};
      const next={...current,revision:current.revision+1,events:[...current.events,event]};atomic(path.join(directory(id),'reviews.json'),next);return next;
    }finally{releaseOwnedFileLock(lease);}
  }
  function reference(id,input){
    const lease=lock();try{
      const r=result(id),current=reviews(id);
      if(input.revision!==current.revision)throw fail('Reference revision conflict',409);
      const event={...validateTimingReference(r,input),id:randomUUID(),created_at:new Date().toISOString()};
      const next={...current,revision:current.revision+1,reference_events:[...(current.reference_events||[]),event]};
      atomic(path.join(directory(id),'reviews.json'),next);return next;
    }finally{releaseOwnedFileLock(lease);}
  }
  function noiseReference(id,input){
    const lease=lock();try{
      const r=result(id),current=reviews(id);
      if(input.revision!==current.revision)throw fail('Noise reference revision conflict',409);
      const event={...validateNoiseReference(r,input),id:randomUUID(),created_at:new Date().toISOString()};
      const next={...current,revision:current.revision+1,noise_reference_events:[...(current.noise_reference_events||[]),event]};
      atomic(path.join(directory(id),'reviews.json'),next);return noiseReport(r,next,event.asset_id);
    }finally{releaseOwnedFileLock(lease);}
  }
  function visualScore(id,input={}){return atlasVisualScore(result(id),input);}
  function query(id,options={}){
    const {op='brief',asset='master',start,end,q='',kind='',limit=100,offset=0,view='original',detail='summary',channel=0}=options;
    if(op==='visual-score')return visualScore(id,options);
    if(!['original','effective'].includes(view))throw fail('Query view must be original or effective');
    const r=result(id);if(op==='contract'){if(!['summary','full'].includes(detail))throw fail('Contract detail must be summary or full');const c=buildAtlasContract(r);return detail==='full'?c:summarizeAtlasContract(c);}const a=r.assets.find(x=>x.id===asset);if(!a||a.status!=='ready')throw fail('Asset unavailable',404);
    if(op==='structure'){if(asset!=='master')throw fail('Structure evidence is currently measured on Master only',422);return r.musical_structure||{status:'not_requested',regions:[],boundaries:[],repeats:[],transitions:[],frames:[],quality_qualified:false,notice:'This saved run predates structure analysis. Explicitly analyze again to measure it.'};}
    if(op==='noise')return noiseReport(r,reviews(id),asset);
    if(op==='timing-evaluation')return timingEvaluation(r,reviews(id),asset);
    const [from,to]=sampleRange(start,end,a.sample_count);
    const count=Math.max(1,Math.min(1000,Number(limit)||100)),skip=Math.max(0,Math.floor(Number(offset)||0));
    if(op==='brief')return {schema_version:ATLAS_VERSION,run_id:id,song_id:r.song_id,title:r.title,
      duration_seconds:r.assets[0].sample_count/r.assets[0].sample_rate_hz,coverage:r.coverage,stem_alignment:r.stem_alignment,individual_stem_alignment:r.individual_stem_alignment||[],
      assets:r.assets.map(({features,technical,...item})=>({...item,technical:technical?technicalSummary(technical):null})),observation_count:r.observations.length,
      harmony_analysis:r.harmony_analysis?harmonySummary(r.harmony_analysis):null,note_analysis:notesSummary(deriveNotes(r)),musical_structure:r.musical_structure||null,rhythm_analysis:r.rhythm_analysis?rhythmSummary(r.rhythm_analysis):null,pitch_analysis:r.pitch_analysis?pitchSummary(r.pitch_analysis):null,
      forced_alignment:r.forced_alignment||null,word_timing_notice:r.word_timing_notice,beat_analysis:r.beat_analysis||null,acoustic_concepts:r.acoustic_index?.concepts||[],elapsed_seconds:r.elapsed_seconds,real_time_factor:r.real_time_factor,
      summary:`Measured ${r.assets.filter(x=>x.status==='ready').length} audio assets. ${r.observations.filter(o=>o.kind==='hapa.audio.transient').length} energy transients; these are not beats. Stem origins remain individually unverified.`};
    if(op==='activity')return queryActivity(r,a,{start:from,end:to});
    if(op==='harmony')return queryHarmony(r,a,{start:from,end:to});
    if(op==='notes')return queryNotes(r,a,{start:from,end:to});
    if(op==='rhythm')return queryRhythm(r,a,{start:from,end:to,limit:count,offset:skip});
    if(op==='pitch')return queryPitch(r,a,{start:from,end:to,limit:count,offset:skip});
    if(op==='noise-preview')return noiseRange(a,from,to);
    if(op==='technical')return queryTechnical(a,{start:from,end:to,limit:count,offset:skip});
    if(op==='spectrogram')return querySpectrogram(a,directory(id),{start:from,end:to,channel,limit:count,offset:skip});
    if(op==='curves')return {asset_id:asset,timeline_id:a.timeline_id,sample_rate_hz:a.sample_rate_hz,...a.features,frames:a.features.frames.filter(f=>f.start_sample<to&&f.end_sample>from).slice(skip,skip+count)};
    if(op==='lyrics')return {text:r.supplied_lyrics,claim_type:'imported_declared',alignment:'unaligned supplied text',imported_word_candidates:r.imported_word_candidates,notice:r.word_timing_notice,transcript_candidate:r.transcript_candidate||null,forced_alignment:r.forced_alignment||null};
    if(op==='acoustic'){
      const index=r.acoustic_index;if(!index)throw fail('This run has no acoustic embedding index',422);
      if(asset!=='master')throw fail('This acoustic profile indexes only the master timeline',422);
      let rows;
      if(index.concepts.includes(q))rows=index.windows.map(w=>({...w,score:w.scores[q]}));
      else {
        const reference=index.windows.find(w=>w.id===q);if(!reference)throw fail('Choose an indexed concept or an acoustic window ID',422);
        rows=index.windows.filter(w=>w.id!==q).map(w=>({...w,score:w.embedding.reduce((sum,v,i)=>sum+v*reference.embedding[i],0)}));
      }
      return {run_id:id,embedding_space:index.embedding_space,query:q,score_semantics:'cosine similarity, not probability',matches:rows.filter(w=>overlaps({...w,shape:'interval'},from,to)).sort((a,b)=>b.score-a.score).slice(0,count).map(({embedding,scores,...w})=>({...w,subject_id:'master',evidence_id:w.id})),concepts:index.concepts};
    }
    if(!['timeline','search','evidence'].includes(op))throw fail('Unknown Atlas query');
    const reviewEvents=reviews(id),latest=new Map(),decisions=new Map();
    for(const event of reviewEvents.events){
      latest.set(event.observation_id,event);
      // A new proposal never revokes an earlier explicit decision.
      if(['accepted_by_human','rejected'].includes(event.state))decisions.set(event.observation_id,event);
    }
    const project=o=>{
      const decision=decisions.get(o.id)||null;
      const applied=view==='effective'&&decision?.state==='accepted_by_human'&&decision.correction;
      const original={start_sample:o.start_sample,end_sample:o.end_sample,payload:o.payload,claim_type:o.claim_type};
      return {...o,...(applied?{start_sample:applied.start_sample,end_sample:applied.end_sample,
        payload:{...o.payload,...(applied.text!==undefined?{text:applied.text}:{})},claim_type:'human_asserted'}:{}),
        original,review:latest.get(o.id)||null,effective_review:decision,correction_applied:Boolean(applied),
        rejected:decision?.state==='rejected',query_view:view};
    };
    let observations=r.observations.filter(o=>o.subject_id===asset).map(project);
    // Evidence always remains addressable, including rejected observations.
    if(op==='evidence')observations=observations.filter(o=>o.id===q);
    else {
      observations=observations.filter(o=>(view==='original'||!o.rejected)&&overlaps(o,from,to)&&(!kind||o.kind===kind));
      if(op==='search')observations=observations.filter(o=>JSON.stringify(o.payload).toLowerCase().includes(String(q).toLowerCase())||o.kind.toLowerCase().includes(String(q).toLowerCase()));
    }
    observations.sort((a,b)=>a.start_sample-b.start_sample||a.end_sample-b.end_sample||a.id.localeCompare(b.id));
    return {run_id:id,timeline_id:a.timeline_id,sample_rate_hz:a.sample_rate_hz,total:observations.length,offset:skip,review_revision:reviewEvents.revision,
      query_view:view,view_semantics:view==='effective'?'Latest explicit decisions: accepted corrections applied, rejected observations excluded from search/timeline; proposals do not replace prior decisions. Unreviewed candidates remain candidates.':'Immutable original text and timing, including rejected candidates, with review history metadata.',
      observations:observations.slice(skip,skip+count),
      ...(op==='search'?{search_type:'lexical',supplied_lyrics_match:String(q).trim()?r.supplied_lyrics.toLowerCase().includes(String(q).toLowerCase()):false,acoustic_retrieval:r.acoustic_index?'available via op=acoustic':'not indexed in this run'}:{})};
  }

  async function audio(id,assetId){
    safeId(assetId);const r=result(id);const manifest=read(path.join(directory(id),'manifest.json'));
    const source=manifest.sources.find(s=>s.id===assetId),asset=r.assets.find(a=>a.id===assetId);
    if(!source||asset?.status!=='ready')throw fail('Evidence audio not found',404);
    const actual=await createEchoSourceInspector().inspect(source.path);
    if(actual.sha256!==asset.source_sha256)throw fail('Evidence audio changed',409);
    return source.path;
  }
  const textSearch=createAtlasTextSearch({root,storage,result,lock,atomic,runner,runtimeIdentity,checkAnalysis:()=>{descriptions.ensureNoOrphans();if(jobs().some(j=>j.state==='orphaned'))throw fail('An orphaned analysis worker remains alive',409);}});
  const descriptions=createAtlasDescriptions({root,storage,result,lock,atomic,runner,runtimeIdentity,checkAnalysis:()=>{textSearch.ensureNoOrphans();if(jobs().some(j=>j.state==='orphaned'))throw fail('An orphaned analysis worker remains alive',409);}});
  return {visualScore,derived:id=>{const r=result(id);return {notes:deriveNotes(r),activity:r.assets.map(a=>deriveActivity(r,a)),descriptions:descriptions.export(id)};},describe:descriptions.start,descriptions:descriptions.get,waitDescription:descriptions.wait,cancelDescription:descriptions.cancel,reviewDescription:descriptions.review,searchText:textSearch.start,textSearches:textSearch.get,cancelTextSearch:textSearch.cancel,contract:id=>buildAtlasContract(result(id)),inventory:()=>inspectAudioInventory(songs(),{root}),audio,list,jobs,status,start,wait,cancel,result,query,review,reviews,reference,noiseReference,close:async()=>{for(const h of active.values())h.controller.abort();await Promise.allSettled([descriptions.close(),textSearch.close(),...[...active.values()].map(h=>h.promise)]);}};
}
