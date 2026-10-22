import {prepareEchoPlaybackAudio} from './echo-playback-audio.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPreparedEchoPerformanceStore} from './echo-prepared-performance-store.mjs';
import {createLivingLightPerformancePort} from './living-light-performance-port.mjs';

const fail=message=>{throw Object.assign(Error(message),{code:'local_living_light_source_not_ready',statusCode:409});};

/** Read existing measured features, then obtain the existing playback owner's
 * sample-preserving receipt. This runs inside the supervised render job; it
 * never schedules analysis, applies alignment, or changes a saved binding. */
export function createLivingLightRenderSourceReader({root,resolveOptions={},readPerformance,playbackCacheRoot,preparePlayback=prepareEchoPlaybackAudio}){
 if(!readPerformance){
  const songStorePath=resolveOptions.songStorePath||process.env.HAPA_SONG_STORE||path.join(root,'data/hapa-songs-store.json');
  const port=createLivingLightPerformancePort({readSongStore:async()=>JSON.parse(await fs.readFile(songStorePath,'utf8')),
   resolveOptions:{root,...resolveOptions,songStorePath},
   preparedStore:createPreparedEchoPerformanceStore({root:process.env.HAPA_ECHO_PERFORMANCE_CACHE_ROOT||path.join(root,'data/cache/echo-performance')})});
  readPerformance=params=>port.read(params);
 }
 playbackCacheRoot ||= process.env.HAPA_ECHO_PLAYBACK_CACHE_ROOT||(root&&path.join(root,'data/cache/echo-playback-audio'));
 return async ({songId,masterPath,sourceMasterSha256,signal,stemSelectionPolicy=null})=>{
  signal?.throwIfAborted();
  const expected=String(sourceMasterSha256||'').replace(/^sha256:/,'');
  if(!/^[a-f0-9]{64}$/.test(expected))fail('The render master needs an exact content proof.');
  const result=await readPerformance({songId,...(stemSelectionPolicy?{stemSelectionPolicy}:{})});
  signal?.throwIfAborted();
  if((result?.performance?.stemSelectionPolicy??null)!==stemSelectionPolicy||result?.songId!==songId||result.sourcePolicy!=='living-light-assets-v1'
    ||result.performance?.songId!==songId||result.performance.sourcePolicy!=='living-light-assets-v1'
    ||result.sourceValidation?.analysisExecuted!==false
    ||result.sourceValidation.masterAudioHash!==expected||result.performance.masterAudioHash!==expected){
   fail('Prepared Living Light measurements differ from the render master. Prepare the selected song and review its saved audio choices.');
  }
  const receipt=await preparePlayback({sourcePath:masterPath,cacheRoot:playbackCacheRoot,signal});
  signal?.throwIfAborted();
  if(receipt?.status!=='ready'||receipt.sourceHash!==expected||receipt.sourceSelection?.kind==='stem')fail('The prepared playback source differs from the render master.');
  // File paths, cache bookkeeping and leases belong to the playback owner.
  // Only measurements needed by the shared feature validator travel offline.
  const playbackReceipt=Object.fromEntries(['sourceHash','sha256','pcmSha256','channels','fidelity','sampleRate','durationSeconds'].map(key=>[key,receipt[key]]));
  return {performance:structuredClone(result.performance),playbackReceipt};
 };
}
