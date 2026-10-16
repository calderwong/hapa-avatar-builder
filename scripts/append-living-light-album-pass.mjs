#!/usr/bin/env node
// Foreground local owner operation: no models, renders, workers or network calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {LivingLightStore} from '../server/living-light-store.mjs';
import {openAvatarCardCustodyService} from '../server/card-custody-service.mjs';
import {readEchoSavedCut,echoSavedVariantRows} from '../server/echo-saved-cut-reader.mjs';
import {deriveEchoDirectionVariantProject} from '../src/domain/echo-direction-variants.js';
import {validateEchoLivingLightSavedReferences} from '../src/domain/echo-living-light-cues.js';
import {ALBUM_PASS_ID,planLivingLightAlbumSong,buildLivingLightAlbumVariant} from '../src/domain/echo-living-light-album-pass.js';

const root=path.resolve(import.meta.dirname,'..'),data=path.join(root,'data');
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const output=arg('plan');if(!output)throw Error('Use --plan=/absolute/manifest.json; add --apply to apply that exact prepared manifest.');
const planPath=path.resolve(output),apply=process.argv.includes('--apply');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
const registry=createLivingLightRegistry(),store=new LivingLightStore({file:path.join(data,'living-light/authoring.sqlite3'),registry});
const actor={actorId:'agent:living-light-album-director',kind:'agent',displayName:'Codex Living Light album Director'};
const songs=(await read(path.join(data,'hapa-songs-store.json'))).songs.filter(s=>s.albumTitle==='Dear Papa');
const songIds=new Set(songs.map(s=>s.id));
const safeSource=relative=>{const absolute=path.resolve(root,relative);if(!absolute.startsWith(data+path.sep))throw Error('Source outside authoring root');return absolute;};
const checkSources=async sources=>{for(const [relative,digest]of Object.entries(sources))if(sha(await fs.readFile(safeSource(relative)))!==digest)throw Error('Source changed: '+relative);};
try{
 if(!apply){
  const manifest={schemaVersion:'hapa.echo.living-light-album-pass.v1',id:ALBUM_PASS_ID,createdAt:new Date().toISOString(),album:'Dear Papa',songCount:songs.length,sources:{},songs:[],errors:[],authority:{mode:'write',source:'current user instruction',request:'Prioritize a Living Light Director run for the entire album; preserve live recordings; renderer is not a gate'},boundary:{analysisCalls:0,renderCalls:0,publication:false,originalCuts:'preserved',motion:'authored-neutral unless existing Living Light cues are retained'}};
  for(const song of songs){try{
   const projectPath=path.join(data,'music-video-projects',song.id+'-video-project.json'),projectBytes=await fs.readFile(projectPath),payload=JSON.parse(projectBytes),base=payload.music_video_project||payload;
   if(base.song_id!==song.id)throw Error('Song/project identity mismatch');
   manifest.sources[path.relative(root,projectPath)]=sha(projectBytes);
   const directory=path.join(data,'music-video-project-variants',song.id);let chosen=null;
   for(const file of (await fs.readdir(directory)).filter(n=>n.endsWith('.json'))){
    const filePath=path.join(directory,file),bytes=await fs.readFile(filePath);manifest.sources[path.relative(root,filePath)]=sha(bytes);
    for(const variant of echoSavedVariantRows(JSON.parse(bytes))){
     if(!variant.id||variant.id===ALBUM_PASS_ID||!variant.timeline?.length)continue;
     const time=Date.parse(variant.createdAt||variant.updatedAt||'1970-01-01');
     if(!chosen||time>chosen.time)chosen={parent:variant,file:path.relative(root,filePath),time};
    }
   }
   if(!chosen)throw Error('No saved parent cut');
   const project=deriveEchoDirectionVariantProject(base,chosen.parent),proposal=planLivingLightAlbumSong(project,registry);
   if(!proposal.existing)store.validateJourneyDraft(proposal.journey);
   else validateEchoLivingLightSavedReferences(project,r=>store.journey(r.journeyId,r.revisionId));
   // Exercise the same projection before the first write, with a temporary identity.
   const placeholder=proposal.existing?null:{...proposal.journey,journeyId:'ll-journey:planned',revisionId:'ll-journey-r:planned',parentRevisionId:null};
   buildLivingLightAlbumVariant({base,parent:chosen.parent,project,plan:proposal,journey:placeholder,createdAt:manifest.createdAt});
   manifest.songs.push({songId:song.id,title:song.title,parentId:chosen.parent.id,parentFile:chosen.file,projectFile:path.relative(root,projectPath),proposal});
  }catch(error){manifest.errors.push({songId:song.id,title:song.title,error:error.message});}}
  await write(planPath,manifest);console.log(JSON.stringify({plan:planPath,songs:songs.length,planned:manifest.songs.length,errors:manifest.errors,priorFiles:Object.keys(manifest.sources).length}));
 }else{
  const manifest=await read(planPath);if(manifest.id!==ALBUM_PASS_ID||manifest.schemaVersion!=='hapa.echo.living-light-album-pass.v1'||manifest.errors.length)throw Error('Apply requires a complete error-free prepared album plan');
  if(manifest.songs.length!==songIds.size||new Set(manifest.songs.map(s=>s.songId)).size!==songIds.size||manifest.songs.some(s=>!songIds.has(s.songId)))throw Error('Album membership changed');
  await checkSources(manifest.sources);
  const digest=sha(await fs.readFile(planPath)),backupRoot=path.join(data,'backups',ALBUM_PASS_ID+'-'+digest.slice(0,12));
  await fs.mkdir(backupRoot,{recursive:true});
  const dbBackup=path.join(backupRoot,'authoring.sqlite3');
  if(!await fs.stat(dbBackup).catch(()=>null)){const db=new DatabaseSync(store.file,{readOnly:true});try{await backup(db,dbBackup);}finally{db.close();}}
  for(const song of manifest.songs)for(const relative of [song.parentFile,song.projectFile]){const target=path.join(backupRoot,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(safeSource(relative),target,1).catch(error=>{if(error.code!=='EEXIST')throw error;});}
  const custody=openAvatarCardCustodyService({root:path.join(data,'card-custody')}),results=[];
  const receiptPath=planPath.replace(/\.json$/,'.results.ndjson');
  for(const song of manifest.songs){
   const childPath=path.join(data,'music-video-project-variants',song.songId,ALBUM_PASS_ID+'.json');
   let result;
   try{
    const basePayload=await read(safeSource(song.projectFile)),base=basePayload.music_video_project||basePayload,parent=echoSavedVariantRows(await read(safeSource(song.parentFile))).find(v=>v.id===song.parentId);
    const project=deriveEchoDirectionVariantProject(base,parent);let journey=null;
    if(!song.proposal.existing){
     const saved=store.saveJourney({journey:song.proposal.journey,expectedRevision:null,idempotencyKey:`${ALBUM_PASS_ID}:${song.songId}`},actor);journey=saved.journey;
     for(const id of [...new Set(journey.instances.map(i=>i.thingRef.thingId)),journey.journeyId])if(!store.identity(id)?.custody){const intent=store.pendingCustody(id),born=await custody.ensure({card:intent.payload,actorId:actor.actorId,evidenceRef:`echo:${ALBUM_PASS_ID}`});store.recordCustody(id,born.receipt);}
    }
    const {variant}=buildLivingLightAlbumVariant({base,parent,project,plan:song.proposal,journey,createdAt:manifest.createdAt});
    const existing=await read(childPath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(existing&&JSON.stringify(existing)!==JSON.stringify(variant))throw Error('Append-only child conflict');
    if(!existing){await checkSources({[song.parentFile]:manifest.sources[song.parentFile],[song.projectFile]:manifest.sources[song.projectFile]});await write(childPath,variant);}
    const reopened=await readEchoSavedCut({root,songId:song.songId,cutId:ALBUM_PASS_ID});
    validateEchoLivingLightSavedReferences(reopened,r=>store.journey(r.journeyId,r.revisionId));
    if(reopened.living_light_cues.length!==variant.project_patch.living_light_cues.length||reopened.director_show_graph.livingLight.cues.length!==reopened.living_light_cues.length)throw Error('Saved projection omitted cues');
    result={songId:song.songId,title:song.title,status:'saved-and-reopened',parentId:parent.id,cutId:ALBUM_PASS_ID,cues:reopened.living_light_cues.length,paintedSources:song.proposal.paintedSources??'preserved',journey:journey?{journeyId:journey.journeyId,revisionId:journey.revisionId,custody:store.journey(journey.journeyId).custody.state}:null,reused:!!existing};
   }catch(error){result={songId:song.songId,title:song.title,status:'failed',error:error.message};}
   results.push(result);await fs.appendFile(receiptPath,JSON.stringify(result)+'\n');console.log(JSON.stringify({completed:results.length,total:manifest.songs.length,...result}));
   if(result.status==='failed')break; // Reconcile the exact failed owner operation before retrying.
  }
  await checkSources(manifest.sources);
  const report={manifestSha256:digest,backupRoot,originalFilesUnchanged:Object.keys(manifest.sources).length,songs:results,covered:results.filter(r=>r.status==='saved-and-reopened').length,total:manifest.songs.length};
  await fs.writeFile(planPath.replace(/\.json$/,'.report.json'),JSON.stringify(report,null,2)+'\n');
  if(report.covered!==report.total)process.exitCode=1;
 }
}finally{store.close();}
