import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createEchoNarrativeRecut,echoRecutIdentityOptions} from '../src/domain/echo-narrative-recut.js';
import {deriveEchoDirectionVariantProject} from '../src/domain/echo-direction-variants.js';
import {projectToEditorGraph} from '../src/domain/multitrack-editor.js';
const root=path.resolve(import.meta.dirname,'..');
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const cohort=JSON.parse(await fs.readFile(option('cohort')||path.join(root,'artifacts/echo-enhancement-current-baseline/cohort.json'),'utf8')).cohort;
const output=path.resolve(option('output')||path.join(root,'artifacts/echo-recut-cohort-proof'));
if(!Array.isArray(cohort)||cohort.length>12)throw new Error('Supply a bounded explicit cohort');
const hash=value=>createHash('sha256').update(value).digest('hex');
const percentile=(rows,p)=>[...rows].sort((a,b)=>a-b)[Math.ceil(rows.length*p)-1];
const results=[];await fs.mkdir(output,{recursive:true});
for(const row of cohort){
 const result={songId:row.songId,variantId:row.selectedCut.id};
 try{
  if([row.songId,row.selectedCut.id].some(value=>!/^[-a-zA-Z0-9_]+$/.test(value)))throw new Error('Invalid source ID');
  const baseFile=path.join(root,'data/music-video-projects',row.songId+'-video-project.json'),variantFile=path.join(root,'data/music-video-project-variants',row.songId,row.selectedCut.id+'.json');
  const baseBytes=await fs.readFile(baseFile),variantBytes=await fs.readFile(variantFile);
  const base=JSON.parse(baseBytes).music_video_project,variant=JSON.parse(variantBytes);
  const project=deriveEchoDirectionVariantProject(base,variant),sourceJSON=JSON.stringify(project);
  const one=[],three=[],hashes=[],visualHashes=[];let warmReplay;
  for(let run=-2;run<20;run++){
   const started=performance.now(),batch=[],visualBatch=[];
   for(const label of ['A','B','C']){
    const from=performance.now();
    const plan=createEchoNarrativeRecut({project:structuredClone(project),recipeId:'performance-kinetic',seed:`cohort-${Math.max(0,run)}:${label}`,range:{startSeconds:0,endSeconds:Number(project.duration)},changeAmount:run%2===0?.5:1});
    const graph=projectToEditorGraph(plan.project);
    if(run>=0)one.push(performance.now()-from);
    batch.push(hash(JSON.stringify(graph)));
    visualBatch.push(hash(JSON.stringify(plan.project.timeline.map(shot=>[shot.start_sec,shot.end_sec,shot.media_id,shot.runtime_media_uri||shot.media_uri,shot.camera_motion,shot.camera_intensity,shot.camera_speed,shot.camera_focus,shot.transition]))));
    if(plan.project.audio_uri!==project.audio_uri||JSON.stringify(plan.project.timed_lyrics)!==JSON.stringify(project.timed_lyrics))throw new Error('Master or lyrics changed');
    for(const index of plan.receipt.preservedShotIndices)if(JSON.stringify(plan.project.timeline[index])!==JSON.stringify(project.timeline[index]))throw new Error('Preserved source shot changed');
   }
   if(run===-2)warmReplay=batch;
   if(run===0&&JSON.stringify(warmReplay)!==JSON.stringify(batch))throw new Error('Same prepared input and seed produced a different executable graph');
   if(run>=0){three.push(performance.now()-started);hashes.push(batch);visualHashes.push(visualBatch);}
  }
  if(JSON.stringify(project)!==sourceJSON||!(await fs.readFile(baseFile)).equals(baseBytes)||!(await fs.readFile(variantFile)).equals(variantBytes))throw new Error('Source changed during proof');
  Object.assign(result,{pass:percentile(one,.95)<=2000&&percentile(three,.95)<=5000,sourceUnchanged:true,deterministicReplay:true,baseSha256:hash(baseBytes),variantSha256:hash(variantBytes),durationSeconds:project.duration,shots:project.timeline.length,identityOptions:echoRecutIdentityOptions(project),singlePlans:one.length,threePlanBatches:three.length,singleP95Ms:percentile(one,.95),threeP95Ms:percentile(three,.95),singleMaxMs:Math.max(...one),threeMaxMs:Math.max(...three),uniqueCandidateGraphs:new Set(hashes.flat()).size,uniqueVisualSequences:new Set(visualHashes.flat()).size,samples:{singleMs:one,threeMs:three},hashes,visualHashes});
 }catch(error){Object.assign(result,{pass:false,error:error.message});}
 results.push(result);console.log(JSON.stringify({songId:row.songId,pass:result.pass,error:result.error,singleP95Ms:result.singleP95Ms,threeP95Ms:result.threeP95Ms}));
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify({pass:results.length===cohort.length&&results.every(row=>row.pass),scope:'Prepared current-cut recut plus actual editor graph compilation, full song, 20 measured A/B/C batches after two warmups; no decoding, render, network/model calls or live playhead measurement',results},null,2)+'\n');
}
process.exitCode=results.every(row=>row.pass)?0:1;
