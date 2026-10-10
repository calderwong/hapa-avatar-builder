import fs from 'node:fs/promises';
import path from 'node:path';
import {createEchoSourceInspector} from './echo-source-inventory.mjs';
import {inspectSongAudio} from './audio-atlas-inventory.mjs';
import {createAudioAtlas} from './audio-atlas.mjs';
import {projectLivingLightAtlasEvidence} from '../src/domain/living-light-atlas-evidence.js';
const fail=(message)=>{throw Object.assign(new Error(message),{code:'living_light_source_evidence_invalid',statusCode:422});};
/** Explicit selected-song inspection. No analyzer/start/preparation/store mutation. */
export async function readLivingLightSourceEvidence({root,songStorePath=path.join(root,'data/hapa-songs-store.json'),songId,format='mp3',atlasOwner,inspector=createEchoSourceInspector(),maxResultBytes=64*1024**2,maxRuns=16,runOffset=0}={}) {
 if(!Number.isSafeInteger(runOffset)||runOffset<0||runOffset>10000||!['mp3','wav'].includes(format)||!Number.isSafeInteger(maxRuns)||maxRuns<1||maxRuns>16||!Number.isSafeInteger(maxResultBytes)||maxResultBytes<1||maxResultBytes>64*1024**2)fail('Explicit supported format and bounded evidence budgets required');
 const store=JSON.parse(await fs.readFile(songStorePath,'utf8')),song=store.songs?.find(s=>s.id===songId);if(!song)fail('Exact Song ID not found');
 const rows=[{assetId:'master',kind:'master',record:song.audio||{}},...(song.stems||[]).map((s,i)=>({assetId:s.id||`${songId}:declared:${i}`,kind:'stem',record:s})).filter(s=>s.record.kind!=='archive-zip'&&!/\.zip(?:$|\?)/i.test(s.record.localPath||s.record.uri||''))];
 if(new Set(rows.map(r=>r.assetId)).size!==rows.length)fail('Duplicate source declaration ID');
 if(rows.length>100)fail('Source declarations exceed selected-song budget');
 const currentSources=[],availability=[];
 // Sequential requests cap open/hash readers at one, even for repeated roles.
 for(const row of rows){
  const inventory=await inspectSongAudio({id:songId,audio:row.kind==='master'?row.record:{},stems:row.kind==='stem'?[row.record]:[]},{root});
  const inspected=row.kind==='master'?inventory[format]:inventory[format+'_stems'].roles[0];
  const files=inspected?.files||[];availability.push({assetId:row.assetId,kind:row.kind,declaredRole:row.kind==='master'?'Master':row.record.stemType||row.record.kind||row.record.title,state:inspected?.state||'unresolved',candidateCount:files.length});
  for(const file of files){const evidence=await inspector.inspect(file.path);if(evidence.status==='bytes-verified'&&evidence.audioHeaderRecognized&&!currentSources.some(s=>s.assetId===row.assetId&&s.sourceHash===evidence.sha256))currentSources.push({songId,assetId:row.assetId,kind:row.kind,sourceHash:evidence.sha256,bytes:evidence.bytes,format});}
 }
 const atlas=atlasOwner||createAudioAtlas({root,songStore:songStorePath});
 const jobs=atlas.jobs(songId).filter(j=>j.state==='complete').sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||a.id.localeCompare(b.id)),runs=[],issues=[];let bytes=0,nextRunOffset=Math.min(runOffset,jobs.length),visited=0;
 for(let index=runOffset;index<Math.min(jobs.length,runOffset+maxRuns);index++){
  const job=jobs[index],file=path.join(root,'data/audio-atlas/runs',job.id,'result.json'),stat=await fs.stat(file).catch(()=>null);
  if(!stat){issues.push({runId:job.id,state:'file-unavailable'});nextRunOffset=index+1;visited++;continue;}
  if(stat.size>maxResultBytes){issues.push({runId:job.id,state:'result-exceeds-request-budget',requiredBytes:stat.size});nextRunOffset=index+1;visited++;continue;}
  if(stat.size+bytes>maxResultBytes){issues.push({runId:job.id,state:'deferred-to-next-page'});nextRunOffset=index;break;}
  bytes+=stat.size;nextRunOffset=index+1;visited++;
  try{const result=atlas.result(job.id);runs.push(projectLivingLightAtlasEvidence(result,{songId,currentSources}));}
  catch(error){issues.push({runId:job.id,state:'owner-result-rejected',code:error.code||'atlas_result_invalid'});}
 }
 return {schemaVersion:'hapa.living-light.source-evidence.v1',songId,format,availability,currentSources,runs,issues,
  coverage:{ownerCompletedRuns:jobs.length,visitedRuns:visited,inspectedRuns:runs.length,readBudgetBytes:maxResultBytes,resultBytesRead:bytes,runOffset,nextRunOffset,truncated:nextRunOffset<jobs.length},
  verification:'current-source-bytes-and-existing-owner-results',analysisExecuted:false,storeMutation:false,sourcePathsExposed:false};
}
