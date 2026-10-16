import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightRenderSourceReader} from '../server/living-light-render-source.mjs';
import {fixture} from './fixtures/living-light-signals.mjs';

function setup(){
 const f=fixture(0),calls=[];
 const result={songId:f.songId,sourcePolicy:'living-light-assets-v1',performance:f.performance,sourceValidation:{analysisExecuted:false,masterAudioHash:f.playbackReceipt.sourceHash}};
 const receipt={...f.playbackReceipt,status:'ready',sha256:'f'.repeat(64),path:'/private/cache/audio.wav',sourcePath:'/private/source.wav',leaseId:'owner-private'};
 const read=createLivingLightRenderSourceReader({readPerformance:async args=>{calls.push(['read',args]);return result;},playbackCacheRoot:'/private/cache',preparePlayback:async args=>{calls.push(['playback',args]);return receipt;}});
 return {result,receipt,calls,read,args:{songId:f.songId,masterPath:'/owner/master.wav',sourceMasterSha256:'sha256:'+f.playbackReceipt.sourceHash}};
}
test('render source reuses exact measurements and playback owner, exposing only portable receipt fields',async()=>{
 const f=setup(),result=await f.read(f.args);
 assert.deepEqual(f.calls.map(c=>c[0]),['read','playback']);
 assert.equal(f.calls[1][1].sourcePath,f.args.masterPath);
 assert.equal(result.playbackReceipt.pcmSha256,f.receipt.pcmSha256);
 for(const key of ['path','sourcePath','leaseId'])assert.equal(result.playbackReceipt[key],undefined);
 result.performance.buses[0].frames[0].rawRms=0;assert.equal(f.result.performance.buses[0].frames[0].rawRms,.25);
});
test('wrong song, changed master, policy and analysis claims reject before playback work',async()=>{
 for(const mutate of [f=>f.args.sourceMasterSha256='invalid',f=>f.result.songId='other',f=>f.result.performance.songId='other',f=>f.result.sourcePolicy='legacy',f=>f.result.performance.sourcePolicy='legacy',f=>f.result.sourceValidation.analysisExecuted=true,f=>f.result.sourceValidation.masterAudioHash='f'.repeat(64),f=>f.result.performance.masterAudioHash='f'.repeat(64)]){
  const f=setup();mutate(f);await assert.rejects(f.read(f.args),{code:'local_living_light_source_not_ready'});assert(!f.calls.some(c=>c[0]==='playback'));
 }
});
test('missing measurement and cancellation remain explicit; playback drift and stem substitution refuse',async()=>{
 const missing=createLivingLightRenderSourceReader({readPerformance:async()=>{throw Object.assign(Error('Not prepared'),{code:'echo_performance_not_prepared'});},preparePlayback:()=>assert.fail('Must not decode without measured features')});
 await assert.rejects(missing(setup().args),{code:'echo_performance_not_prepared'});
 const f=setup(),abort=new AbortController();abort.abort();await assert.rejects(f.read({...f.args,signal:abort.signal}),{name:'AbortError'});assert.equal(f.calls.length,0);
 for(const mutate of [f=>f.receipt.sourceHash='f'.repeat(64),f=>f.receipt.status='failed',f=>f.receipt.sourceSelection={kind:'stem'}]){const f=setup();mutate(f);await assert.rejects(f.read(f.args),{code:'local_living_light_source_not_ready'});}
});
