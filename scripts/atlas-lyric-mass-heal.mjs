#!/usr/bin/env node
// Catalog preparation only. Promotion/sync/cut creation remain their existing owners.
import {createHash} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createAudioAtlas} from '../server/audio-atlas.mjs';
import {plan,assemble,alignmentCorroboration} from './atlas-lyric-timing.mjs';
import {evaluateEchoLyricTimingPromotion} from '../src/domain/echo-lyric-promotion.js';
import {echoLyricComparePerformanceMaps,echoLyricPerformanceMap} from '../src/domain/echo-lyric-performance.js';
import {echoLyricHasManualTiming,echoLyricSourceLines,echoLyricRegistryTrackId,echoLyricDuplicateRegistryIds} from '../src/domain/echo-lyric-sync-safety.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opts=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a.slice(2),true]:[a.slice(2,i),a.slice(i+1)];}));
if(!opts.out)throw Error('Usage: atlas-lyric-mass-heal.mjs --out=DIR [--analyze-missing] [--compare-master] [--song=ID]');
if(process.env.HAPA_AUDIO_ATLAS_WORKER)throw Error('Worker cannot coordinate catalog');
const batchId=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve(opts.out),candidateDir=path.join(out,'candidate-batches',batchId),atlas=createAudioAtlas({root}),rows=[];fs.mkdirSync(out,{recursive:true});let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;void atlas.close();});
const report=()=>{const counts=rows.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{});const value={schemaVersion:'hapa.echo.lyric-mass-heal.v1',updatedAt:new Date().toISOString(),mode:'prepared-candidates-not-applied',candidateDir,counts,rows};fs.writeFileSync(path.join(out,'report.json.tmp'),JSON.stringify(value,null,2)+'\n');fs.renameSync(path.join(out,'report.json.tmp'),path.join(out,'report.json'));return counts;};
try{
 const songs=JSON.parse(fs.readFileSync(path.join(root,'data/hapa-songs-store.json'))).songs;
 const duplicateRegistryIds=echoLyricDuplicateRegistryIds(songs);
 const jobs=atlas.jobs().filter(j=>j.state==='complete').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 for(const song of songs){
  if(stopping)break;if(opts.song&&opts.song!==song.id)continue;
  const row={id:song.id,title:song.title,status:'inspecting',startedAt:new Date().toISOString()};rows.push(row);report();
  const folder=path.join(out,'songs',song.id);fs.mkdirSync(folder,{recursive:true});
  try{
   const lyrics=typeof song.lyrics==='string'?song.lyrics:song.lyrics?.text||'';
   if(!lyrics.trim()){row.status='no-written-lyrics';report();continue;}
   if(duplicateRegistryIds.has(echoLyricRegistryTrackId(song))){row.status='held-for-recording-identity';row.error='Multiple catalog records share the canonical timing-source ID; resolve before candidate publication';report();continue;}
   if(echoLyricHasManualTiming(song)){row.status='manual-timing-preserved';report();continue;}
   const alignmentRuns=[];
   const transcripts=new Map(),currentMasterHash=createHash('sha256').update(fs.readFileSync(song.audio.localPath)).digest('hex'),sourceLines=echoLyricSourceLines(song.lyrics);
   for(const job of jobs.filter(j=>j.song_id===song.id)){
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/audio-atlas/runs',job.id,'manifest.json')));
    if(manifest.alignment)alignmentRuns.push(job.id);
    if(!manifest.model)continue;
    try{
      const result=atlas.result(job.id),t=result.transcript_candidate;if(!t?.word_count||result.assets.find(a=>a.id==='master')?.source_sha256!==currentMasterHash)continue;
      const words=result.observations.filter(o=>o.kind==='hapa.audio.word_candidate'&&o.subject_id===t.source_asset_id).map(o=>({text:o.payload.text,start:o.start_sample/o.reference_sample_rate_hz,end:o.end_sample/o.reference_sample_rate_hz}));
      const map=echoLyricPerformanceMap(sourceLines,words),score=map.supportedLines*10000+map.lines.reduce((n,line)=>n+line.matches.length,0);
      if(!transcripts.has(t.source_asset_id)||score>transcripts.get(t.source_asset_id).score)transcripts.set(t.source_asset_id,{run:job.id,result,score});
    }catch{/* corrupt historical evidence cannot qualify */}
   }
   let primary=[...transcripts.values()].find(t=>t.result.assets.some(a=>a.id===t.result.transcript_candidate.source_asset_id&&/^(lead )?vocals$/i.test(a.role)))||transcripts.get('master')||[...transcripts.values()][0];
   if(!primary&&opts['analyze-missing']){row.status='transcribing';report();const start=await atlas.start(song.id,{transcribe:true,transcriptionLanguage:'auto'}),done=await atlas.wait(start.id);if(done.state!=='complete')throw Error(done.error||done.state);primary={run:done.id,result:atlas.result(done.id)};transcripts.set(primary.result.transcript_candidate?.source_asset_id,primary);}
   if(!primary?.result.transcript_candidate?.word_count){row.status='needs-transcription';report();continue;}
   row.transcriptRun=primary.run;
   const first=await plan(atlas,{song:song.id,out:path.join(folder,'primary'),'transcript-run':primary.run});
   let master=transcripts.get('master');
   if(!master&&opts['compare-master']&&primary.result.transcript_candidate.source_asset_id!=='master'){
    row.status='comparing-master';report();const started=await atlas.start(song.id,{transcribe:true,transcriptionBaseRunId:primary.run,transcriptionSourceId:'master',transcriptionLanguage:'auto'}),done=await atlas.wait(started.id);if(done.state!=='complete')throw Error(done.error||done.state);master={run:done.id,result:atlas.result(done.id)};
   }
   let second=null;if(master&&master.run!==primary.run&&master.result.transcript_candidate?.word_count){row.masterTranscriptRun=master.run;second=await plan(atlas,{song:song.id,out:path.join(folder,'master'),'transcript-run':master.run});}
   const corroboration=alignmentCorroboration(atlas,alignmentRuns,primary.run);
   const maps=[first,second].map(p=>p?JSON.parse(fs.readFileSync(p.plan)).performanceMap:null);
   row.conflictingPassages=maps[1]?echoLyricComparePerformanceMaps(maps[0],maps[1],{corroboratingWords:corroboration.words}).conflictingLines:[];
   const attempts=[];
   for(const [kind,p,comparison] of [['primary',first,null],...(second?[['master',second,null],['primary-refined',first,second],['master-refined',second,first],['combined',first,second]]:[])]){
    try{const built=assemble(atlas,{corroboration,plan:p.plan,'comparison-plan':comparison?.plan,'comparison-mode':kind.endsWith('-refined')?'boundaries-only':null,'transcript-only':true,candidates:path.join(folder,kind+'-candidate')});const timing=JSON.parse(fs.readFileSync(built.candidate)),gate=evaluateEchoLyricTimingPromotion(timing,{sourcePathExists:true,sttPathExists:true});attempts.push({...built,kind,gate,unresolvedLines:timing.passageReview?.unresolvedLines,conflictingLines:timing.lines.flatMap((line,i)=>line.alignmentReview?.reason==='cross-source-passage-time-disagreement'?[i]:[])});}catch(error){attempts.push({kind,error:error.message});}
   }
   row.attempts=attempts;const accepted=attempts.filter(a=>a.gate?.accepted&&!row.conflictingPassages.length&&!attempts.some(b=>b.conflictingLines?.length)&&!(['primary','master'].includes(a.kind)&&attempts.some(b=>b.kind===a.kind+'-refined'&&b.gate?.accepted))).sort((a,b)=>b.confidence-a.confidence || Number(b.kind.endsWith('-refined')||b.kind==='combined')-Number(a.kind.endsWith('-refined')||a.kind==='combined'))[0];
   if(accepted){fs.mkdirSync(candidateDir,{recursive:true});for(const suffix of ['.json','.stt.json'])fs.copyFileSync(accepted.candidate.replace(/\.json$/,suffix),path.join(candidateDir,path.basename(accepted.candidate).replace(/\.json$/,suffix)));row.candidate=path.join(candidateDir,path.basename(accepted.candidate));row.confidence=accepted.confidence;row.selectedEvidence=accepted.kind;row.status='accepted-candidate';}
   else row.status='held-for-passage-review';
  }catch(error){row.status='held-for-passage-review';row.error=error.message;}
  row.finishedAt=new Date().toISOString();report();console.log(JSON.stringify({title:row.title,status:row.status,confidence:row.confidence,error:row.error}));
 }
 console.log(JSON.stringify({counts:report(),complete:!stopping}));
}finally{await atlas.close();report();}
