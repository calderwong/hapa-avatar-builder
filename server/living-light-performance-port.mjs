import {livingLightPerformanceInputs,LIVING_LIGHT_SOURCE_POLICY} from './living-light-performance-inputs.mjs';
import {livingLightStemSelection,LIVING_LIGHT_COHERENT_STEMS} from '../src/domain/living-light-stem-selection.js';
const variant=selection=>LIVING_LIGHT_SOURCE_POLICY+(livingLightStemSelection(selection)?':'+selection:'');
const fail=(code,message,statusCode=422)=>{throw Object.assign(Error(message),{code,statusCode});};
/** Protected Living Light adapter over the existing queue and prepared store.
 * It never creates another queue, accepts paths or approves an alignment map. */
export function createLivingLightPerformancePort({readSongStore,resolveOptions,preparation,preparedStore}){
 const song=value=>{if(typeof value!=='string'||!value.trim()||value.length>300)fail('living_light_song_invalid','Select an exact registered Song.');return value;};
 const request=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(value))fail('living_light_request_invalid','A bounded unique preparation request is required.');return value;};
 const selectedJob=({songId,jobId,requestId,stemSelectionPolicy=null})=>{
  livingLightStemSelection(stemSelectionPolicy);song(songId);const job=jobId?preparation.get(jobId):requestId?preparation.findRequest(request(requestId)):preparation.latest(songId,variant(stemSelectionPolicy));
  if(!job)return null;
  if(job.songId!==songId||job.variantId!==variant(stemSelectionPolicy)||job.kind==='playback-audio')fail('living_light_job_mismatch','This job belongs to another preparation.',409);
  return job;
 };
 const inputs=async (songId,stemSelectionPolicy)=>livingLightPerformanceInputs({songId:song(songId),songStore:await readSongStore(),resolveOptions,stemSelectionPolicy});
 return {
  capabilities:()=>({state:'source-implemented',sourcePolicy:LIVING_LIGHT_SOURCE_POLICY,operations:['read','prepare','status','cancel'],stemSelections:['legacy-declarations',LIVING_LIGHT_COHERENT_STEMS],assetLimit:32,sourcePaths:'owner-resolved',alignment:'no proposal applied',stemVisualization:'unqualified'}),
  async read({songId,stemSelectionPolicy=null}){const input=await inputs(songId,stemSelectionPolicy),result=await preparedStore.load({masterPath:input.masterPath,stems:input.graph.stems.items,lyrics:{},sourcePolicy:LIVING_LIGHT_SOURCE_POLICY,songId,stemSelectionPolicy});for(const bus of result.performance.buses)bus.provenance=(bus.provenance||[]).map(row=>({id:row.id}));return {...result,songId,sourcePolicy:LIVING_LIGHT_SOURCE_POLICY,audioUri:`hapa-master:${encodeURIComponent(songId)}`};},
  async prepare({songId,requestId,stemSelectionPolicy=null}){livingLightStemSelection(stemSelectionPolicy);request(requestId);const old=selectedJob({songId,requestId,stemSelectionPolicy});if(old)return old;const input=await inputs(songId,stemSelectionPolicy);const raced=selectedJob({songId,requestId,stemSelectionPolicy});if(raced)return raced;return preparation.start({kind:'performance',songId,requestId,variantId:variant(stemSelectionPolicy),masterPath:input.masterPath,graph:input.graph});},
  status(params){return selectedJob(params)||{status:'idle'};},
  cancel(params){const job=selectedJob(params);if(!job)return {status:'idle'};return preparation.cancel(job.id);},
 };
}
