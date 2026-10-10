import test from 'node:test';import assert from 'node:assert/strict';
import {SEMANTIC_AXES,semanticRequest,parseSemanticResponse,validateSemanticProposal} from '../server/audio-atlas-semantic.mjs';
const h='a'.repeat(64),result={assets:[{id:'master',status:'ready',source_sha256:h,decoded_sha256:h,timeline_id:'pcm:'+h,sample_rate_hz:48000,sample_count:48000*60}]};
const request=semanticRequest(result,{asset_id:'master',start_sample:48000,end_sample:48000*16});
const raw=()=>JSON.stringify(Object.fromEntries(SEMANTIC_AXES.map(k=>[k,{description:'Tentative strummed music',audible_cues:['repeating plucked sounds'],uncertainty:'unqualified interpretation'}])));
const input=()=>({request,raw_response:raw(),input_evidence:{sha256:h,sample_rate_hz:16000,channels:1,sample_count:240000,rms:.1,peak:.5,nonzero_sample_count:239999},provenance:{model_manifest_sha256:h,raw_evidence_sha256:h,prompt_sha256:h},eos_observed:true});
test('description request uses exact own source range, bounds, ready identity and no inference',()=>{
 assert.equal(request.start_sample,48000);assert.equal(request.end_sample,768000);
 for(const x of [{asset_id:'missing',start_sample:0,end_sample:1},{asset_id:'master',start_sample:-1,end_sample:20},{asset_id:'master',start_sample:0,end_sample:48000*31},{asset_id:'master',start_sample:0,end_sample:0},{asset_id:'master',start_sample:1.5,end_sample:20},{asset_id:'master',start_sample:0,end_sample:'20'}])assert.throws(()=>semanticRequest(result,x));
});
test('six independent axes preserve unverified cues, uncertainty and source citation',()=>{
 const p=validateSemanticProposal(input());assert.equal(p.state,'needs_review');assert.equal(p.axes.length,6);assert.equal(p.axes[3].axis,'lyrical_meaning');assert.equal(p.axes[4].axis,'vocal_affect');assert.equal(p.axes[5].axis,'musical_mood');assert.equal(p.confidence,null);assert.equal(p.timing_authority,false);assert.equal(p.quality_qualified,false);assert.equal(p.model_cues_verified,false);assert.equal(p.raw_response,raw());assert.deepEqual(p.axes[0].evidence[0],{kind:'source_excerpt',asset_id:'master',timeline_id:request.timeline_id,source_sha256:h,start_sample:48000,end_sample:768000});
});
test('one complete JSON fence is disclosed; malformed, ambiguous and authority-bearing schema rejected',()=>{
 assert.equal(parseSemanticResponse('```json\n'+raw()+'\n```').framing,'markdown-json-fence');
 for(const text of ['prefix '+raw(),raw()+'\n'+raw(),'```json\n'+raw(),JSON.stringify({...JSON.parse(raw()),accepted:true}),raw().replace('"uncertainty":"unqualified interpretation"','"uncertainty":0'),'[]'])assert.throws(()=>parseSemanticResponse(text));
});
test('all-zero measured input abstains despite fluent hallucinations',()=>{
 const i=input();i.input_evidence={...i.input_evidence,rms:0,peak:0,nonzero_sample_count:0};const p=validateSemanticProposal(i);assert.equal(p.reason,'digital_silence');assert.deepEqual(p.axes,[]);assert.equal(p.raw_response,raw());
});
test('quiet nonzero input is not automatically declared absent',()=>{
 const i=input();i.input_evidence={...i.input_evidence,rms:1e-8,peak:2e-8};assert.equal(validateSemanticProposal(i).state,'needs_review');
});
test('truncated and malformed output never becomes partial accepted axes',()=>{
 const i=input();i.eos_observed=false;assert.equal(validateSemanticProposal(i).reason,'incomplete_model_response');i.eos_observed=true;i.raw_response=raw().slice(0,-2);assert.equal(validateSemanticProposal(i).reason,'invalid_model_schema');
});
test('measurement, duration and digest mismatch fail closed',()=>{
 for(const patch of [{rms:NaN},{peak:.01},{sample_count:100},{channels:2},{sha256:'fake'},{nonzero_sample_count:0}]){const i=input();Object.assign(i.input_evidence,patch);assert.throws(()=>validateSemanticProposal(i));}
 const i=input();i.provenance.raw_evidence_sha256='';assert.throws(()=>validateSemanticProposal(i));
});
test('advisory flags preserve unsupported claims as unreviewed raw evidence',()=>{
 const i=input(),v=JSON.parse(i.raw_response);v.caption.description='A male voice at 10 seconds';v.production.description='A centered stereo close-mic unprocessed recording';i.raw_response=JSON.stringify(v);const p=validateSemanticProposal(i);assert.deepEqual(p.axes[0].flags,['identity_wording_outside_requested_scope','generated_numeric_claim_not_measurement']);assert.deepEqual(p.axes[2].flags,['spatial_claim_from_mono_input','recording_process_inference']);assert.equal(p.review_state,'unreviewed');assert.ok(p.raw_response.includes('male'));
});
