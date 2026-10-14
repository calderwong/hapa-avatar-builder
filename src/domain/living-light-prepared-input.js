import {livingLightPreparedBinding,livingLightFeatureBytes} from './living-light-prepared-binding.js';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
/** A single host lifetime reads the existing prepared owner at most once.
 * Resolving a saved source never schedules analysis or substitutes a new binding. */
export function createLivingLightPreparedInputResolver({songId,playbackReceipt,performance,request,cache,signal}={}){
 let pending;
 async function selectedPerformance(){
  signal?.throwIfAborted();
  if(performance?.sourcePolicy==='living-light-assets-v1'&&performance.songId===songId)return performance;
  if(!pending)pending=Promise.resolve().then(()=>request('/performance?songId='+encodeURIComponent(songId),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)})).then(result=>{
   if(result?.songId!==songId||result.sourcePolicy!=='living-light-assets-v1'||result.performance?.songId!==songId||result.performance.sourcePolicy!=='living-light-assets-v1')fail('prepared_source_mismatch','Prepared measurements belong to another song or source policy.');
   if(result.sourceValidation?.analysisExecuted!==false||result.sourceValidation.masterAudioHash!==playbackReceipt.sourceHash)fail('prepared_source_mismatch','Prepared measurements do not match the selected song master.');
   return result.performance;
  });
  return pending;
 }
 return async function prepareInput(journey,{signal:entrySignal}={}){
  signal?.throwIfAborted();entrySignal?.throwIfAborted();
  if(journey.songId!==songId)fail('prepared_source_mismatch','The Journey belongs to another song.');
  const bound=journey.sourceBindingRef||journey.instances.some(instance=>Object.keys(instance.bindings).length);
  if(!bound)return {neutralStudy:true};
  if(!playbackReceipt?.sourceHash||!playbackReceipt?.pcmSha256||playbackReceipt.sourceSelection?.kind==='stem')fail('prepared_source_unavailable','Wait for the exact song master before playing this bound Journey.');
  let selected;
  try{selected=await selectedPerformance();}catch(error){
   if(error.code==='echo_performance_not_prepared')throw Object.assign(Error(error.message+' Open Living Light → Song and stem signals to prepare it, then Retry scene.'),{code:error.code});
   throw error;
  }
  signal?.throwIfAborted();entrySignal?.throwIfAborted();
  const binding=livingLightPreparedBinding({songId,performance:selected,playbackReceipt});
  if(journey.sourceBindingRef&&(journey.sourceBindingRef.bindingId!==binding.bindingId||journey.sourceBindingRef.revisionId!==binding.revisionId))fail('prepared_binding_revision_mismatch','The saved audio binding differs from the available prepared revision. Reopen the Journey and explicitly review its source choices; the saved cue has been retained.');
  return {sourceBinding:{sourceHash:playbackReceipt.sourceHash},featureInput:{performance:selected,playbackReceipt,sourceBinding:binding,cache,requiredBytes:livingLightFeatureBytes(selected)}};
 };
}
