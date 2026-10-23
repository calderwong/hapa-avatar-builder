import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/living-light-signals.mjs';
import {createLivingLightFeatureBank} from '../src/domain/living-light-features.js';
import {suggestLivingLightMusicResponse} from '../src/domain/living-light-music-response.js';
import {auditLivingLightResponseCue} from '../src/domain/living-light-response-audit.js';
function input(){
 const f=fixture(1);f.performance.stemSelectionPolicy='coherent-stems-v1';
 f.performance.buses.forEach(bus=>bus.frames.forEach((r,i)=>{r.rms=.1+i*.04;r.rawRms=r.rms*.5;}));
 const response=suggestLivingLightMusicResponse(f.performance),bank=createLivingLightFeatureBank(f);
 const cue={cueId:'offset',window:{startUs:500000,endUs:2000000},journeyWindow:{startUs:0,endUs:1500000},mapping:'offset-1x',clock:'echo-song'};
 const journey={instances:[{instanceId:'a',musicResponse:response}],schedule:[{instanceId:'a',startUs:0,endUs:1500000}]};
 return {cue,journey,bank,response};
}
test('audit follows Song source and Journey instance clocks across qualified spans and padding',()=>{
 const f=input();try{
  const result=auditLivingLightResponseCue(f);
  assert.equal(result.counts.samples,6);assert.equal(result.counts.stem,6);
  assert.equal(result.quiet.songUs,1500000,'verified zero padding remains a silent stem, not fallback');
  assert.equal(result.quiet.journeyUs,1000000);
  assert(result.roles.drums.range>0);assert.deepEqual(result.issues,[]);
  f.journey.schedule[0].endUs=1000000;
  assert.equal(auditLivingLightResponseCue(f).counts.unbound,2);
 }finally{f.bank.dispose();}
});
test('audit identifies master fallback, zero-weight sources, flat/off and blocked choices without changing them',()=>{
 const f=input();try{
  const binding=f.response.roles.drums;
  binding.sourceRefs=[{kind:'stem',assetId:'missing'}];
  assert.equal(auditLivingLightResponseCue(f).counts.masterOnly,6);
  binding.sourceRefs=[{kind:'stem',assetId:'exact-asset-0'},{kind:'master'}];binding.aggregation='weighted-sum';binding.weights=[0,1];
  assert.equal(auditLivingLightResponseCue(f).counts.stem,0);
  f.response.intensity=0;assert.deepEqual(auditLivingLightResponseCue(f).issues,['off']);
  f.response.intensity=1;binding.sourceRefs=[{kind:'stem',assetId:'missing'}];binding.aggregation='max';delete binding.weights;binding.onUnavailable='block';
  const before=structuredClone(f.journey),blocked=auditLivingLightResponseCue(f);
  assert.equal(blocked.counts.blocked,6);assert.equal(blocked.counts.unavailable,6);assert.deepEqual(f.journey,before);
  const flat={...f,bank:{...f.bank,sample:()=>({value:0,availability:'silent'})}};
  binding.sourceRefs=[{kind:'master'}];assert(auditLivingLightResponseCue(flat).issues.includes('flat-sampled-envelope'));
  assert.throws(()=>auditLivingLightResponseCue({...f,hz:1000}));
 }finally{f.bank.dispose();}
});
