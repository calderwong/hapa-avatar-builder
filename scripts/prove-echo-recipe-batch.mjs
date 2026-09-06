#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {getHeapStatistics} from 'node:v8';
import {runEchoRecipeBatch} from '../server/echo-recipe-batch.mjs';
import {deriveEchoDirectionVariantProject} from '../src/domain/echo-direction-variants.js';
import {NARRATIVE_VARIANT_RECIPES} from '../src/domain/echo-director-recipes.js';
const root=path.resolve(import.meta.dirname,'..');
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const output=path.resolve(option('output')||'artifacts/echo-enhancement-current-baseline/recipe-batch-proof');
const cohort=JSON.parse(await fs.readFile(path.join(root,'artifacts/echo-enhancement-current-baseline/cohort.json'))).cohort;
if(cohort.length!==6)throw Error('Expected the explicit six-song review cohort.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=[],songs=[];
await fs.mkdir(path.join(output,'prepared-inputs'),{recursive:true});
for(const row of cohort){
 if([row.songId,row.selectedCut.id].some(id=>!/^[-a-zA-Z0-9_]+$/.test(id)))throw Error('Unsafe cohort identity');
 const projectPath=path.join(root,'data/music-video-projects',row.songId+'-video-project.json'),variantPath=path.join(root,'data/music-video-project-variants',row.songId,row.selectedCut.id+'.json');
 const baseBytes=await fs.readFile(projectPath),variantBytes=await fs.readFile(variantPath);
 sources.push({path:projectPath,sha256:hash(baseBytes)},{path:variantPath,sha256:hash(variantBytes)});
 const base=JSON.parse(baseBytes).music_video_project,variant=JSON.parse(variantBytes);
 const graph=JSON.parse(await fs.readFile(path.join(root,'artifacts/echo-director-v2/album',row.songId,'native-show-graph.json')));
 const project=deriveEchoDirectionVariantProject({...base,director_show_graph:graph},variant);
 const prepared=path.join(output,'prepared-inputs',row.songId+'.json');await fs.writeFile(prepared,JSON.stringify(project)+'\n');
 songs.push({id:row.songId,projectPath:prepared});
}
const request={songs,recipes:Object.keys(NARRATIVE_VARIANT_RECIPES),seed:'album-batch-proof',timingMode:'supported-cues'};
await fs.writeFile(path.join(output,'request.json'),JSON.stringify(request,null,2)+'\n');
const batchOutput=path.join(output,'batch');
const runs=[];
async function run(label,options={}){
 const started=performance.now();
 const batch=await runEchoRecipeBatch({request,output:batchOutput,...options,onProgress:progress=>{if(progress.activeWorker)console.log(JSON.stringify({label,jobId:progress.activeWorker.jobId,pid:progress.activeWorker.pid}))}});
 const result={label,durationMs:performance.now()-started,status:batch.status,jobs:batch.jobs.length,work:batch.work,graphHashes:batch.jobs.map(job=>job.receipt?.graphHash||null)};
 runs.push(result);console.log(JSON.stringify({...result,graphHashes:undefined}));return batch;
}
const paused=await run('cold-first-five',{maxJobs:5});
if(paused.status!=='paused'||paused.work.compiled!==5)throw Error('Initial batch did not pause after five real jobs. Use a fresh proof output.');
const resumed=await run('resume-remaining');
if(resumed.status!=='complete'||resumed.work.compiled!==25||resumed.work.cacheHits!==5)throw Error('Resume did not preserve five completed jobs.');
const warm=await run('warm-verified-cache');
if(warm.status!=='complete'||warm.work.compiled!==0||warm.work.cacheHits!==30||JSON.stringify(runs[1].graphHashes)!==JSON.stringify(runs[2].graphHashes))throw Error('Warm replay did not reuse the same thirty executable graphs.');
const subset=await run('only-three-requested-songs',{request:{...request,songs:songs.slice(0,3),recipes:['performance-kinetic']}});
if(subset.status!=='complete'||subset.jobs.length!==3||subset.jobs.some(job=>!songs.slice(0,3).some(song=>song.id===job.songId))||subset.work.compiled!==0)throw Error('Subset request executed unrelated work.');
const restored=await run('restore-requested-album');
if(restored.status!=='complete'||restored.work.compiled!==0||restored.work.cacheHits!==30)throw Error('Restoring the album request lost valid artifacts.');
for(const source of sources)if(hash(await fs.readFile(source.path))!==source.sha256)throw Error('Source authoring file changed.');
const metrics=restored.jobs.map(job=>job.receipt.metrics);
const results=[];
for(const job of restored.jobs){const artifact=JSON.parse(await fs.readFile(job.producedArtifacts[0]));if(!artifact.receipt.validation.ok)throw Error('Invalid final graph');results.push({songId:job.songId,recipeId:job.variant,graphHash:artifact.receipt.graphHash,movedBoundaries:artifact.receipt.plan.cueReflow.movedBoundaries.length,artifact:job.producedArtifacts[0]})}
const report={schemaVersion:'hapa.echo.recipe-batch-proof.v1',pass:true,scope:'Real local compile workers over six selected cuts and five recipes; graph validation, interruption/resume and verified cache reuse. No final video render or human approval claimed.',runs,results,sourceAuthoringUnchanged:true,sourceHashes:sources,
 maximumWorkerResidentMiB:Math.max(...metrics.map(row=>row.maxResidentSetKilobytes))/1024,parentMaximumResidentMiB:process.resourceUsage().maxRSS/1024,parentHeapLimitMiB:getHeapStatistics().heap_size_limit/1024/1024,workerHeapLimitMiB:1536,maxConcurrentWorkers:1,analysisCalls:0,enrichmentCalls:0,modelCalls:0};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,graphs:results.length,maximumWorkerResidentMiB:report.maximumWorkerResidentMiB,parentMaximumResidentMiB:report.parentMaximumResidentMiB}));
