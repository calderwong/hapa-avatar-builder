#!/usr/bin/env node
// One foreground process. Read existing banks/receipts only; no child processes,
// decoding, generation, preparation, render, queue or authoring mutations.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {LivingLightStore} from '../server/living-light-store.mjs';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {createLivingLightPerformancePort} from '../server/living-light-performance-port.mjs';
import {createPreparedEchoPerformanceStore} from '../server/echo-prepared-performance-store.mjs';
import {readEchoSavedCut} from '../server/echo-saved-cut-reader.mjs';
import {validateEchoLivingLightSavedReferences} from '../src/domain/echo-living-light-cues.js';
import {livingLightPreparedBinding,livingLightTimelineWithinSource} from '../src/domain/living-light-prepared-binding.js';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
import {auditLivingLightResponseCue} from '../src/domain/living-light-response-audit.js';
import {MUSIC_PASS_ID} from '../src/domain/echo-living-light-album-pass.js';
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const root=path.resolve(import.meta.dirname,'..'),data=path.join(root,'data'),output=arg('out'),planPath=arg('plan');
if(!output||!path.isAbsolute(output)||!planPath||!path.isAbsolute(planPath))throw Error('Use --plan=/absolute/music-response-plan.json --out=/absolute/new-report.json');
try{await fs.access(output);throw Error('Report already exists; choose a new output path');}catch(error){if(error.code!=='ENOENT')throw error;}
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const plan=await read(planPath),songFile=path.join(data,'hapa-songs-store.json'),songBytes=await fs.readFile(songFile),songStore=JSON.parse(songBytes);
if(plan.id!==MUSIC_PASS_ID||plan.errors?.length)throw Error('An error-free Music Response preparation plan is required');
const songs=songStore.songs.filter(s=>s.albumTitle==='Dear Papa');
if(songs.length!==plan.songs.length||new Set(plan.songs.map(s=>s.songId)).size!==songs.length||songs.some(s=>!plan.songs.some(p=>p.songId===s.id)))throw Error('Album membership differs from the receipt plan');
const store=new LivingLightStore({file:path.join(data,'living-light/authoring.sqlite3'),registry:createLivingLightRegistry()});
const resolveOptions={root,mediaDir:path.join(data,'media'),songStorePath:songFile,songbookPath:path.join(data,'dear-papa-songbook.json'),songRegistryPath:process.env.HAPA_SONG_REGISTRY_DATA||path.join(os.homedir(),'Desktop/hapa-song-registry/data/registry.json')};
const port=createLivingLightPerformancePort({readSongStore:()=>songStore,resolveOptions,preparedStore:createPreparedEchoPerformanceStore({root:path.join(data,'cache/echo-performance')})});
const report={schemaVersion:'hapa.living-light.music-response-audit.v1',createdAt:new Date().toISOString(),readOnly:true,analysisJobs:0,planSha256:sha(await fs.readFile(planPath)),songs:[],errors:[]};
const protectedFiles=new Map([[songFile,sha(songBytes)]]),revisions=new Map();
try{
 for(const song of songs){
  const row={songId:song.id,title:song.title,cues:[]};report.songs.push(row);
  try{
   const cutFile=path.join(data,'music-video-project-variants',song.id,MUSIC_PASS_ID+'.json');protectedFiles.set(cutFile,sha(await fs.readFile(cutFile)));
   const project=await readEchoSavedCut({root,songId:song.id,cutId:MUSIC_PASS_ID});
   validateEchoLivingLightSavedReferences(project,ref=>store.journey(ref.journeyId,ref.revisionId));
   const proposal=plan.songs.find(s=>s.songId===song.id).proposal,{performance}=await port.read({songId:song.id,stemSelectionPolicy:'coherent-stems-v1'});
   if(performance.fingerprint!==proposal.performanceFingerprint)throw Error('Prepared source revision changed; refresh the source receipt plan');
   const playbackReceipt=proposal.playbackReceipt,sourceBinding=livingLightPreparedBinding({songId:song.id,performance,playbackReceipt});
   if(!livingLightTimelineWithinSource(Math.round(playbackReceipt.durationSeconds*1e6),Math.round(project.duration*1e6),playbackReceipt.sampleRate))throw Error('Saved timeline exceeds the prepared source');
   const bank=createLivingLightFeatureBank({songId:song.id,performance,playbackReceipt,sourceBinding});
   try{for(const cue of project.living_light_cues||[]){
    const ref=cue.journeyRef,key=JSON.stringify(ref),journey=store.journey(ref.journeyId,ref.revisionId).journey;
    revisions.set(key,sha(JSON.stringify(journey)));
    if(cue.sourceBindingRef?.bindingId!==sourceBinding.bindingId||cue.sourceBindingRef?.revisionId!==sourceBinding.revisionId)throw Error('Saved cue refers to a different prepared source');
    row.cues.push(auditLivingLightResponseCue({cue,journey,bank}));
   }}finally{bank.dispose();}
   if(!row.cues.length)throw Error('Music Response cut contains no Living Light cues');
  }catch(error){row.error=error.message;report.errors.push({songId:song.id,message:error.message});}
  if(report.songs.length%20===0)console.log(JSON.stringify({checked:report.songs.length,total:songs.length}));
 }
 const mismatches=[];
 for(const [file,digest]of protectedFiles)if(sha(await fs.readFile(file))!==digest)mismatches.push(file);
 for(const [key,digest]of revisions){const ref=JSON.parse(key);if(sha(JSON.stringify(store.journey(ref.journeyId,ref.revisionId).journey))!==digest)mismatches.push(ref);}
 const cues=report.songs.flatMap(s=>s.cues);
 report.integrity={files:protectedFiles.size,revisions:revisions.size,mismatches};
 report.summary={songs:songs.length,cues:cues.length,errors:report.errors.length,flaggedCues:cues.filter(c=>c.issues.length).length,stemCues:cues.filter(c=>c.counts.stem>0).length,masterOnlyCues:cues.filter(c=>!c.counts.stem&&c.counts.masterOnly>0).length,issues:Object.fromEntries(['unbound','off','blocked','unavailable','flat-sampled-envelope'].map(k=>[k,cues.filter(c=>c.issues.includes(k)).length]))};
 report.ok=!report.errors.length&&!mismatches.length;
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ok:report.ok,...report.summary,output}));if(!report.ok)process.exitCode=1;
}finally{store.close();}
