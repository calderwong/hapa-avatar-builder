import fs from 'node:fs/promises';
import path from 'node:path';
import {createAudioAtlas} from './audio-atlas.mjs';
import {qualifyAtlasVisualTiming,applyAtlasVisualTiming,ATLAS_VISUAL_TIMING} from '../src/domain/audio-atlas-visual-timing.js';
import {livingLightPerformanceInputs} from './living-light-performance-inputs.mjs';
import {createEchoSourceInspector} from './echo-source-inventory.mjs';
import {publishEchoPerformance} from './echo-prepared-performance-store.mjs';
const fail=(code,message)=>{throw Object.assign(Error(message),{code,statusCode:409});};

/** Explicit cache publication through existing owners. No Atlas job, proposal
 * mutation or media rewrite. Pin all evidence into the prepared bank so later
 * Atlas runs cannot silently change a saved Journey's timing. */
export async function qualifyLivingLightPreparedTiming({songId,stemSelectionPolicy,root,readSongStore,resolveOptions,preparedStore,performanceCacheRoot=path.join(root,'data/cache/echo-performance'),atlasOwner,inspector=createEchoSourceInspector()}={}){
 if(stemSelectionPolicy!=='coherent-stems-v1')fail('visual_timing_coherent_required','Select one coherent stem set before connecting timing.');
 const input=livingLightPerformanceInputs({songId,songStore:await readSongStore(),resolveOptions,stemSelectionPolicy});
 const load=()=>preparedStore.load({songId,sourcePolicy:'living-light-assets-v1',stemSelectionPolicy,masterPath:input.masterPath,stems:input.graph.stems.items,lyrics:{}});
 const original=await load(),p=original.performance;
 const summary=(performance,reused)=>({songId,stemSelectionPolicy,reused,policy:ATLAS_VISUAL_TIMING,fingerprint:performance.fingerprint,qualified:performance.visualTiming.rows.filter(r=>r.state==='qualified').length,total:performance.visualTiming.rows.length,rows:performance.visualTiming.rows.map(({assetId,state,reason,offsetUs})=>({assetId,state,reason,offsetUs})),sourceAudioChanged:false,atlasProposalApplied:false});
 const validate=performance=>applyAtlasVisualTiming({songId,master:{sourceHash:performance.masterAudioHash},stems:performance.buses.filter(b=>b.id!=='master').map(b=>({assetId:b.assetId,sourceHash:b.audioHash}))},performance);
 if(p.visualTiming){validate(p);return summary(p,true);}
 const atlas=atlasOwner||createAudioAtlas({root}),jobs=atlas.jobs(songId).filter(j=>j.state==='complete').slice(0,16);
 let best=null,bestCount=-1,bytes=0;
 for(const job of jobs){
  if(!atlasOwner){const size=(await fs.stat(path.join(root,'data/audio-atlas/runs',job.id,'result.json'))).size;if(size>64*1024**2||bytes+size>128*1024**2)continue;bytes+=size;}
  const result=atlas.result(job.id); // Owner validates the recorded result hash.
  const candidate=qualifyAtlasVisualTiming({result,resultSha256:job.result_sha256,performance:p});
  const count=candidate.rows.filter(r=>r.state==='qualified').length;
  if(count>bestCount){best=candidate;bestCount=count;}if(count===input.graph.stems.items.length)break;
 }
 if(!best)fail('visual_timing_evidence_unavailable','No bounded completed Atlas result is available for this song.');
 const sources=[{role:'master',path:input.masterPath},...input.graph.stems.items.filter(stem=>p.buses.some(b=>b.assetId===stem.assetId&&b.frames?.length)).map(stem=>({role:stem.declaredRole,assetId:stem.assetId,path:stem.audioPath}))],sourceChecks=[];
 for(const source of sources){const current=await inspector.inspect(source.path),bus=p.buses.find(b=>source.assetId?b.assetId===source.assetId:b.id==='master');if(current.status!=='bytes-verified'||current.sha256!==bus.audioHash)fail('visual_timing_source_changed','Source bytes changed during timing qualification.');sourceChecks.push({...source,...current});}
 if((await load()).performance.fingerprint!==p.fingerprint)fail('visual_timing_preparation_changed','Prepared measurements changed; inspect the current bank before retrying.');
 const bundle={...p,visualTiming:best};
 validate(bundle);
 await publishEchoPerformance({root:performanceCacheRoot,bundle,sourceChecks});
 return summary((await load()).performance,false);
}
