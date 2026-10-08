import {livingLightPerformanceInputs,LIVING_LIGHT_SOURCE_POLICY} from './living-light-performance-inputs.mjs';
const fail=(code,message,statusCode=422)=>{throw Object.assign(Error(message),{code,statusCode});};
/** Protected Living Light adapter over the existing queue and prepared store.
 * It never creates another queue, accepts paths or approves an alignment map. */
export function createLivingLightPerformancePort({readSongStore,resolveOptions,preparation,preparedStore}){
 const song=value=>{if(typeof value!=='string'||!value.trim()||value.length>300)fail('living_light_song_invalid','Select an exact registered Song.');return value;};
 const request=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(value))fail('living_light_request_invalid','A bounded unique preparation request is required.');return value;};
 const selectedJob=({songId,jobId,requestId})=>{
  song(songId);const job=jobId?preparation.get(jobId):requestId?preparation.findRequest(request(requestId)):preparation.latest(songId,LIVING_LIGHT_SOURCE_POLICY);
  if(!job)return null;
  if(job.songId!==songId||job.variantId!==LIVING_LIGHT_SOURCE_POLICY||job.kind==='playback-audio')fail('living_light_job_mismatch','This job belongs to another preparation.',409);
  return job;
 };
 const inputs=async songId=>livingLightPerformanceInputs({songId:song(songId),songStore:await readSongStore(),resolveOptions});
 return {
  async read({songId}){const input=await inputs(songId),result=await preparedStore.load({masterPath:input.masterPath,stems:input.graph.stems.items,lyrics:{},sourcePolicy:LIVING_LIGHT_SOURCE_POLICY,songId});for(const bus of result.performance.buses)bus.provenance=(bus.provenance||[]).map(row=>({id:row.id}));return {...result,songId,sourcePolicy:LIVING_LIGHT_SOURCE_POLICY,audioUri:`hapa-master:${encodeURIComponent(songId)}`};},
  async prepare({songId,requestId}){request(requestId);const old=selectedJob({songId,requestId});if(old)return old;const input=await inputs(songId);const raced=selectedJob({songId,requestId});if(raced)return raced;return preparation.start({kind:'performance',songId,requestId,variantId:LIVING_LIGHT_SOURCE_POLICY,masterPath:input.masterPath,graph:input.graph});},
  status(params){return selectedJob(params)||{status:'idle'};},
  cancel(params){const job=selectedJob(params);if(!job)return {status:'idle'};return preparation.cancel(job.id);},
 };
}
