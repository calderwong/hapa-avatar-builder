import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/living-light-signals.mjs';
import {createLivingLightPreparedInputResolver} from '../src/domain/living-light-prepared-input.js';
import {livingLightPreparedBinding} from '../src/domain/living-light-prepared-binding.js';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
function setup(options={}){
 const input=fixture(0),binding=livingLightPreparedBinding(input),journey={songId:input.songId,sourceBindingRef:{bindingId:binding.bindingId,revisionId:binding.revisionId},instances:[{bindings:{}}]},calls=[];
 const response={songId:input.songId,sourcePolicy:'living-light-assets-v1',performance:input.performance,sourceValidation:{analysisExecuted:false,masterAudioHash:input.playbackReceipt.sourceHash}};
 const resolve=createLivingLightPreparedInputResolver({...input,performance:{sourcePolicy:'ordinary-visualizers'},request:async(...args)=>{calls.push(args);return response;},...options});return {input,journey,calls,response,resolve};
}
test('bound saved cues recover one exact owner bank even when the Director supplies ordinary signals',async()=>{
 const f=setup(),before=structuredClone(f.journey);const [first,second]=await Promise.all([f.resolve(f.journey),f.resolve(f.journey)]);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'/performance?songId=fixture-song');assert.equal(f.calls[0][1].method,undefined);assert.equal(first.featureInput.performance,second.featureInput.performance);
 const bank=createLivingLightFeatureBank({songId:f.input.songId,...first.featureInput});assert.equal(bank.sample('master','energy',500000).value,.5);bank.dispose();assert.deepEqual(f.journey,before);
});
test('neutral scenes neither require audio nor contact the prepared owner; exact resident banks are reused',async()=>{
 const f=setup({playbackReceipt:null});assert.deepEqual(await f.resolve({...f.journey,sourceBindingRef:null}),{neutralStudy:true});assert.equal(f.calls.length,0);
 const input=fixture(0),local=setup({performance:input.performance});await local.resolve(local.journey);assert.equal(local.calls.length,0);
});
test('changed revisions, wrong master or policy and stem audition refuse without neutral fallback',async()=>{
 const f=setup();await assert.rejects(f.resolve({...f.journey,sourceBindingRef:{...f.journey.sourceBindingRef,revisionId:'old'}}),{code:'prepared_binding_revision_mismatch'});
 for(const change of [r=>r.sourceValidation.masterAudioHash='e'.repeat(64),r=>r.performance.songId='other',r=>r.sourcePolicy='ordinary',r=>r.sourceValidation.analysisExecuted=true]){const x=setup();change(x.response);await assert.rejects(x.resolve(x.journey),{code:'prepared_source_mismatch'});}
 const missing=setup({playbackReceipt:null});await assert.rejects(missing.resolve(missing.journey),{code:'prepared_source_unavailable'});assert.equal(missing.calls.length,0);
 const stem=setup({playbackReceipt:{...fixture(0).playbackReceipt,sourceSelection:{kind:'stem'}}});await assert.rejects(stem.resolve(stem.journey),{code:'prepared_source_unavailable'});assert.equal(stem.calls.length,0);
});
test('missing preparation is actionable and not retried; host or recipe cancellation discards late reads',async()=>{
 let calls=0;const f=setup({request:async()=>{calls++;throw Object.assign(Error('No prepared source.'),{code:'echo_performance_not_prepared'});}});for(let i=0;i<2;i++)await assert.rejects(f.resolve(f.journey),error=>{assert.equal((error.message.match(/Song and stem signals/g)||[]).length,1);return true;});assert.equal(calls,1);
 for(const mode of ['host','entry']){let release;const controller=new AbortController();const x=setup({...(mode==='host'?{signal:controller.signal}:{}),request:()=>new Promise(r=>release=r)});const pending=x.resolve(x.journey,mode==='entry'?{signal:controller.signal}:{});await Promise.resolve();controller.abort();release(x.response);await assert.rejects(pending,{name:'AbortError'});}
});
