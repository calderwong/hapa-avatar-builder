#!/usr/bin/env node
// Read-only owner audit. One foreground process, no decoding, jobs or analysis.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {LivingLightStore} from '../server/living-light-store.mjs';
import {readEchoSavedCut} from '../server/echo-saved-cut-reader.mjs';
import {validateEchoLivingLightSavedReferences} from '../src/domain/echo-living-light-cues.js';
import {livingLightPerformanceInputs} from '../server/living-light-performance-inputs.mjs';
import {createPreparedEchoPerformanceStore} from '../server/echo-prepared-performance-store.mjs';
import {createEchoSourceInspector} from '../server/echo-source-inventory.mjs';
import {chooseStemSet,stemRoleLabel} from '../src/domain/echo-stem-set.js';
import {livingLightStemDeclarations} from '../src/domain/living-light-source-binding.js';
import {ALBUM_PASS_ID} from '../src/domain/echo-living-light-album-pass.js';

const root=path.resolve(import.meta.dirname,'..');
const output=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6);
if(!output||!path.isAbsolute(output))throw Error('Use --out=/absolute/new-report.json. The audit never prepares audio or changes album records.');
const songStorePath=process.env.HAPA_SONG_STORE||path.join(root,'data/hapa-songs-store.json');
const sourceBytes=await fs.readFile(songStorePath),songStore=JSON.parse(sourceBytes);
const songs=songStore.songs.filter(song=>song.albumTitle==='Dear Papa');
const inspector=createEchoSourceInspector();
const prepared=createPreparedEchoPerformanceStore({root:process.env.HAPA_ECHO_PERFORMANCE_CACHE_ROOT||path.join(root,'data/cache/echo-performance'),inspect:inspector.inspect});
const store=new LivingLightStore({file:path.join(root,'data/living-light/authoring.sqlite3'),registry:createLivingLightRegistry()});
const resolveOptions={root,mediaDir:path.join(root,'data/media'),songStorePath,songbookPath:path.join(root,'data/dear-papa-songbook.json'),songRegistryPath:process.env.HAPA_SONG_REGISTRY_DATA||path.join(process.env.HAPA_SONG_REGISTRY_ROOT||path.join(os.homedir(),'Desktop/hapa-song-registry'),'data/registry.json')};
const report={schemaVersion:'hapa.living-light.album-response-audit.v1',createdAt:new Date().toISOString(),readOnly:true,analysisExecuted:false,sourcePolicy:'living-light-assets-v1',cutId:ALBUM_PASS_ID,songs:[],errors:[]};
const hash=value=>createHash('sha256').update(value).digest('hex');
const protectedFiles=new Map([[songStorePath,hash(sourceBytes)]]),revisions=new Map();
try{
 for(const song of songs){
  const row={songId:song.id,title:song.title,cues:[],journeys:[],prepared:{state:'not-checked'}};
  report.songs.push(row);
  try{
   for(const file of [path.join(root,'data/music-video-projects',song.id+'-video-project.json'),path.join(root,'data/music-video-project-variants',song.id,ALBUM_PASS_ID+'.json')])protectedFiles.set(file,hash(await fs.readFile(file)));
   const project=await readEchoSavedCut({root,songId:song.id,cutId:ALBUM_PASS_ID});
   validateEchoLivingLightSavedReferences(project,ref=>store.journey(ref.journeyId,ref.revisionId));
   const journeys=new Map();
   for(const cue of project.living_light_cues||[]){
    const key=JSON.stringify(cue.journeyRef);
    if(!journeys.has(key)){
     const record=store.journey(cue.journeyRef.journeyId,cue.journeyRef.revisionId),journey=record.journey;
     revisions.set(key,hash(JSON.stringify(journey)));journeys.set(key,journey);
     const bindings=journey.instances.flatMap(instance=>Object.entries(instance.bindings).map(([port,binding])=>({instanceId:instance.instanceId,thingRef:instance.thingRef,port,...binding})));
     row.journeys.push({ref:cue.journeyRef,sourceBindingRef:journey.sourceBindingRef,bindings,mode:journey.sourceBindingRef||bindings.length?'bound':'authored-neutral',instances:journey.instances.map(instance=>({instanceId:instance.instanceId,thingRef:instance.thingRef}))});
    }
    const journey=journeys.get(key),active=journey.schedule.filter(s=>s.startUs<cue.journeyWindow.endUs&&s.endUs>cue.journeyWindow.startUs);
    row.cues.push({cueId:cue.cueId,role:cue.role,window:cue.window,journeyWindow:cue.journeyWindow,journeyRef:cue.journeyRef,sourceBindingRef:cue.sourceBindingRef,activeInstances:active.map(s=>s.instanceId),mode:journey.sourceBindingRef||journey.instances.some(i=>Object.keys(i.bindings).length)?'bound':'authored-neutral'});
   }
   let input,inputFailure;
   try{input=livingLightPerformanceInputs({songId:song.id,songStore,resolveOptions});}
   catch(error){
    inputFailure={state:'unavailable',code:error.code||'unknown',message:error.message};
    // A stem-budget refusal must not hide the master inventory. This isolated
    // master-only resolution is never passed to prepared.load or persisted.
    input=livingLightPerformanceInputs({songId:song.id,songStore:{songs:[{...song,stems:[]}]},resolveOptions});
   }
   row.master=await inspector.inspect(input.masterPath);
   const selected=chooseStemSet(song.stems,{songTitle:song.title,preferDirs:[input.masterPath]});
   const declarations=livingLightStemDeclarations(song);
   row.stems={declared:declarations.length,coherentSetCount:selected.length,coherentSetIds:selected.map(s=>declarations.find(d=>d.stem===s)?.assetId),coherentRoles:selected.map(stemRoleLabel),selectionDiffers:declarations.length!==selected.length,items:inputFailure?declarations.map(({assetId,stem})=>({assetId,declaredRole:stemRoleLabel(stem),sourceState:'not-resolved-input-refused'})):input.graph.stems.items};
   if(inputFailure)row.prepared=inputFailure;
   else try{
    const result=await prepared.load({masterPath:input.masterPath,stems:input.graph.stems.items,lyrics:{},sourcePolicy:'living-light-assets-v1',songId:song.id});
    row.prepared={state:'source-verified',sourceValidation:result.sourceValidation,fingerprint:result.performance.fingerprint,durationSeconds:result.performance.durationSeconds,buses:result.performance.buses.map(bus=>({id:bus.id,assetId:bus.assetId,declaredRole:bus.declaredRole,audioHash:bus.audioHash,frames:bus.frames?.length||0,featureAvailability:bus.featureAvailability,decodedAnalysis:bus.decodedAnalysis}))};
   }catch(error){row.prepared={state:'unavailable',code:error.code||'unknown',message:error.message};}
   // The current shared prepared-binding adapter emits no timing maps. Source
   // verification is explicitly not claimed as synchronized stem admission.
   row.synchronizedStemBinding='unavailable-in-current-prepared-adapter';
  }catch(error){row.error={code:error.code||'unknown',message:error.message};report.errors.push({songId:song.id,...row.error});}
  if(report.songs.length%20===0)console.log(JSON.stringify({checked:report.songs.length,total:songs.length}));
 }
 report.sourceIntegrity={filesChecked:protectedFiles.size,journeyRevisionsChecked:revisions.size,mismatches:[]};
 for(const [file,digest]of protectedFiles)if(hash(await fs.readFile(file))!==digest)report.sourceIntegrity.mismatches.push(file);
 for(const [key,digest]of revisions){const ref=JSON.parse(key);if(hash(JSON.stringify(store.journey(ref.journeyId,ref.revisionId).journey))!==digest)report.sourceIntegrity.mismatches.push(ref);}
 const cues=report.songs.flatMap(s=>s.cues);
 report.summary={songs:songs.length,cues:cues.length,authoredNeutralCues:cues.filter(c=>c.mode==='authored-neutral').length,boundCues:cues.filter(c=>c.mode==='bound').length,readableMasterHeaders:report.songs.filter(s=>s.master?.audioHeaderRecognized&&s.master?.status==='bytes-verified').length,preparedBanks:report.songs.filter(s=>s.prepared.state==='source-verified').length,preparedUnavailable:report.songs.filter(s=>s.prepared.state==='unavailable').length,stemSelectionDifferences:report.songs.filter(s=>s.stems?.selectionDiffers).length,errors:report.errors.length,sourceFilesUnchanged:!report.sourceIntegrity.mismatches.length,...inspector.metrics()};
 report.ok=!report.errors.length&&!report.sourceIntegrity.mismatches.length;
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ok:report.ok,output,...report.summary}));
 if(!report.ok)process.exitCode=1;
}finally{store.close();}
