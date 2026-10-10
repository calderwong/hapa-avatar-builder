import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {releaseOwnedFileLock} from './owned-file-lock.mjs';

const FILES=['README.md','config.json','merges.txt','preprocessor_config.json','pytorch_model.bin','special_tokens_map.json','tokenizer.json','tokenizer_config.json','vocab.json'];
const fail=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});
const sha=value=>createHash('sha256').update(value).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
export function textSearchInput(input={}){
 if(typeof input.text!=='string'||!input.text.trim()||input.text.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.text))throw fail('Enter a sound description of 1–500 characters');
 const limit=input.limit===undefined?8:Number(input.limit);if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('Search limit must be 1–100');
 return {text:input.text.trim(),limit};
}
export function rankTextEmbedding(result,encoded){
 const index=result.acoustic_index,a=result.assets.find(a=>a.id==='master'&&a.status==='ready');
 if(!a||!index||encoded.embedding_space!==index.embedding_space)throw fail('Text/audio embedding spaces differ');
 const vector=encoded.embedding;
 const normalized=v=>Array.isArray(v)&&v.length===512&&v.every(Number.isFinite)&&Math.abs(v.reduce((sum,n)=>sum+n*n,0)-1)<.002;
 if(!normalized(vector)||!Array.isArray(index.windows)||index.windows.length>180)throw fail('Invalid bounded CLAP embedding index');
 const ids=new Set();return index.windows.map(w=>{
   if(typeof w.id!=='string'||ids.has(w.id)||!normalized(w.embedding)||!Number.isSafeInteger(w.start_sample)||!Number.isSafeInteger(w.end_sample)||w.start_sample<0||w.end_sample<=w.start_sample||w.end_sample>a.sample_count)throw fail('Invalid source-bound acoustic window');
   ids.add(w.id);return {id:w.id,evidence_id:w.id,subject_id:a.id,timeline_id:a.timeline_id,source_sha256:a.source_sha256,start_sample:w.start_sample,end_sample:w.end_sample,score:Math.max(-1,Math.min(1,w.embedding.reduce((sum,v,i)=>sum+v*vector[i],0)))};
 }).sort((a,b)=>b.score-a.score||a.start_sample-b.start_sample);
}

/** Extension of Atlas's existing lock, immutable result, worker and cleanup owner. */
export function createAtlasTextSearch({root,storage,result,lock,atomic,runner,runtimeIdentity,checkAnalysis=()=>{}}){
 const folder=path.join(storage,'text-searches'),active=new Map();
 const directory=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw fail('Invalid text-search ID');return path.join(folder,id);};
 const state=row=>['queued','running'].includes(row.state)&&!active.has(row.id)&&!alive(row.owner_pid)?{...row,state:row.worker_pid&&alive(row.worker_pid)?'orphaned':'interrupted'}:row;
 function records(){return (fs.existsSync(folder)?fs.readdirSync(folder):[]).filter(id=>/^[a-f0-9-]{36}$/.test(id)).map(id=>path.join(folder,id,'job.json')).filter(f=>fs.existsSync(f)).map(f=>state(read(f)));}
 function ensureNoOrphans(){if(records().some(j=>j.state==='orphaned'))throw fail('An orphaned text-search worker is still alive; resolve its recorded process before retry',409);}
 function get(runId,id,limit=8){
   result(runId);if(!id)return {queries:records().filter(j=>j.run_id===runId).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100)};
   const dir=directory(id),file=path.join(dir,'job.json');if(!fs.existsSync(file))throw fail('Text search not found',404);
   const job=state(read(file));if(job.run_id!==runId)throw fail('Text search not found in this run',404);
   if(job.state!=='complete')return job;
   const bytes=fs.readFileSync(path.join(dir,'result.json'));if(sha(bytes)!==job.result_sha256)throw fail('Text-search result integrity mismatch',409);
   const value=JSON.parse(bytes);if(sha(fs.readFileSync(path.join(dir,'text-embedding.json')))!==value.raw_evidence_sha256)throw fail('Text-search raw evidence integrity mismatch',409);return {...job,...value,matches:value.matches.slice(0,Math.max(1,Math.min(100,Number(limit)||8)))};
 }
 async function start(runId,input){
   const {text,limit}=textSearchInput(input),r=result(runId),index=r.acoustic_index;
   if(!index?.embedding_space||!index.model_hashes||!index.package_version)throw fail('This analysis needs a pinned CLAP audio index; enable Find sounds in a new analysis');
   const a=r.assets.find(a=>a.id==='master'&&a.status==='ready');if(!a)throw fail('Master source unavailable');
   // Only this authorized immutable run's master windows can enter the ranking.
   const configFile=path.join(storage,'clap-model.json');if(!fs.existsSync(configFile))throw fail('Configure the existing local CLAP text encoder first');
   const c=read(configFile);if(!path.isAbsolute(c.python||'')||!path.isAbsolute(c.modelPath||'')||!(/^[a-f0-9]{40}$/).test(c.revision||'')||Object.keys(c.sha256||{}).length!==FILES.length||FILES.some(n=>!(/^[a-f0-9]{64}$/).test(c.sha256?.[n]||'')))throw fail('Invalid pinned CLAP configuration');
   const space=`laion/clap-htsat-unfused:${c.revision}:${c.sha256['pytorch_model.bin']}`;
   if(space!==index.embedding_space||FILES.some(n=>index.model_hashes[n]!==c.sha256[n]))throw fail('Configured CLAP encoder does not match this audio index');
   for(const name of FILES){const h=createHash('sha256');for await(const b of fs.createReadStream(path.join(c.modelPath,name)))h.update(b);if(h.digest('hex')!==c.sha256[name])throw fail('CLAP checkpoint integrity mismatch',409);}
   const runtime=runtimeIdentity(c.python),key=sha(JSON.stringify({runId,result_sha256:sha(JSON.stringify(r)),text,space,model:c.sha256,runtime,code:sha(fs.readFileSync(path.join(root,'scripts/audio-atlas-clap.py'))),coordinator:sha(fs.readFileSync(fileURLToPath(import.meta.url)))}));
   ensureNoOrphans();const existing=records();
   for(const old of existing.filter(j=>j.run_id===runId&&j.key===key)){
     const handle=active.get(old.id);if(handle){await handle.promise;return {...get(runId,old.id,limit),cache_hit:true};}
     if(old.state==='complete'){try{return {...get(runId,old.id,limit),cache_hit:true};}catch{/* Preserve corrupt artifact and create a new explicit attempt. */}}
   }
   checkAnalysis();const lease=lock();let owned=false;
   try{
     if(existing.length>=256)throw fail('Text-search artifact budget reached (256); retain/export and prune through the owner before more queries');
     const id=randomUUID(),dir=directory(id);fs.mkdirSync(dir,{recursive:true});
     const manifest={operation:'text-query',id,run_id:runId,text,prompt:`The sound of ${text}.`,clap:c,embedding_space:space,package_version:index.package_version,source_sha256:a.source_sha256};
     atomic(path.join(dir,'manifest.json'),manifest);
     const job={id,run_id:runId,key,query:text,state:'queued',owner_pid:process.pid,created_at:new Date().toISOString(),policy:'local-private',cache_hit:false};
     const update=patch=>{Object.assign(job,patch,{updated_at:new Date().toISOString()});atomic(path.join(dir,'job.json'),job);};update({});
     const handle={controller:new AbortController(),promise:null};active.set(id,handle);
     handle.promise=(async()=>{
       try{
         update({state:'running'});
         await runner(root,path.join(dir,'manifest.json'),{python:c.python,workerFile:'audio-atlas-clap.py',timeoutMs:120000,signal:handle.controller.signal,onSpawn:pid=>update({worker_pid:pid}),onOutput:()=>{}});
         if(handle.controller.signal.aborted)throw fail('Text search cancelled',409);
         const rawFile=path.join(dir,'text-embedding.json'),raw=read(rawFile);
         if(raw.query!==text||raw.prompt!==manifest.prompt||raw.package_version!==index.package_version||raw.network!=='disabled'||FILES.some(n=>raw.model_hashes?.[n]!==c.sha256[n])||!Number.isInteger(raw.token_count)||raw.token_count<1||raw.token_count>128)throw fail('Text encoder evidence differs from request');
         const current=result(runId);if(sha(JSON.stringify(current))!==sha(JSON.stringify(r)))throw fail('Source analysis changed during search',409);
         const matches=rankTextEmbedding(current,raw),value={schema_version:'hapa.audio-atlas.text-search.v1',run_id:runId,query:text,prompt:manifest.prompt,embedding_space:space,
           source_asset_id:'master',timeline_id:a.timeline_id,source_sha256:a.source_sha256,sample_rate_hz:a.sample_rate_hz,score_semantics:'cosine similarity; not probability, verified presence or absence',matches,
           raw_evidence:'text-embedding.json',raw_evidence_sha256:sha(fs.readFileSync(rawFile)),package_version:raw.package_version,runtime,token_count:raw.token_count,network:'disabled',quality_qualified:false,elapsed_seconds:raw.elapsed_seconds};
         atomic(path.join(dir,'result.json'),value);update({state:'complete',result_sha256:sha(fs.readFileSync(path.join(dir,'result.json')))});
         return {...job,...value,matches:matches.slice(0,limit)};
       }catch(e){update({state:handle.controller.signal.aborted?'cancelled':'failed',error:e.message});throw e;}
       finally{active.delete(id);releaseOwnedFileLock(lease);}
     })();owned=true;return await handle.promise;
   }finally{if(!owned)releaseOwnedFileLock(lease);}
 }
 async function cancel(runId){result(runId);const row=records().find(j=>j.run_id===runId&&active.has(j.id));if(!row)throw fail('No text search owned by this process for this run',409);const handle=active.get(row.id);handle.controller.abort();try{await handle.promise;}catch{}return get(runId,row.id);}
 async function close(){const handles=[...active.values()];for(const h of handles)h.controller.abort();await Promise.allSettled(handles.map(h=>h.promise));}
 return {start,get,cancel,close,ensureNoOrphans};
}
