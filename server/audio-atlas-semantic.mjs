import {createHash} from 'node:crypto';

export const SEMANTIC_AXES=Object.freeze(['caption','style','production','lyrical_meaning','vocal_affect','musical_mood']);
const fail=message=>Object.assign(new Error(message),{statusCode:422});
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);

/** Read-only request construction. Never infer, fetch a model, or change a run. */
export function semanticRequest(result,input={}){
  const asset=result.assets?.find(a=>a.id===input.asset_id&&a.status==='ready');
  if(!asset||!digest(asset.source_sha256)||!digest(asset.decoded_sha256)||typeof asset.timeline_id!=='string'||!Number.isSafeInteger(asset.sample_rate_hz)||asset.sample_rate_hz<=0||!Number.isSafeInteger(asset.sample_count))throw fail('Select a ready source with a verified decoded timeline');
  const start=input.start_sample,end=input.end_sample;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>asset.sample_count||end-start>30*asset.sample_rate_hz)throw fail('Description range must be integer source samples, at most30seconds');
  return {source_asset_id:asset.id,source_sha256:asset.source_sha256,decoded_sha256:asset.decoded_sha256,timeline_id:asset.timeline_id,source_sample_rate_hz:asset.sample_rate_hz,start_sample:start,end_sample:end,channel_policy:'arithmetic mean; no normalization',timing_authority:'source excerpt coordinates only; generated prose is not timing authority'};
}

/** Parse one complete JSON object; retain the original text and any framing. */
export function parseSemanticResponse(raw){
  if(typeof raw!=='string'||!raw.trim()||raw.length>20000)throw fail('Invalid bounded semantic response');
  let body=raw.trim(),framing='none';
  if(body.startsWith('```')){
    const match=body.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    if(!match)throw fail('Incomplete or ambiguous semantic response framing');
    body=match[1];framing='markdown-json-fence';
  }
  let value;try{value=JSON.parse(body);}catch{throw fail('Semantic response is not complete JSON');}
  if(!record(value)||Object.keys(value).length!==SEMANTIC_AXES.length||SEMANTIC_AXES.some(k=>!Object.hasOwn(value,k)))throw fail('Semantic response must separate all six axes');
  for(const axis of SEMANTIC_AXES){
    const v=value[axis];
    if(!record(v)||Object.keys(v).sort().join(',')!=='audible_cues,description,uncertainty'||typeof v.description!=='string'||!v.description.trim()||v.description.length>1200||typeof v.uncertainty!=='string'||v.uncertainty.length>600||!Array.isArray(v.audible_cues)||v.audible_cues.length>12||v.audible_cues.some(c=>typeof c!=='string'||!c.trim()||c.length>400))throw fail('Invalid semantic axis: '+axis);
  }
  return {value,framing};
}

/** Model cues remain model claims. Input measurements and source clocks are separate. */
export function validateSemanticProposal({request,raw_response,input_evidence,provenance,eos_observed,synthetic=false}){
  if(!record(request)||!digest(request.source_sha256)||!digest(request.decoded_sha256)||!Number.isSafeInteger(request.start_sample)||!Number.isSafeInteger(request.end_sample)||request.start_sample<0||request.end_sample<=request.start_sample||!Number.isSafeInteger(request.source_sample_rate_hz)||request.source_sample_rate_hz<=0||request.end_sample-request.start_sample>30*request.source_sample_rate_hz||typeof request.timeline_id!=='string'||typeof request.source_asset_id!=='string')throw fail('Invalid source excerpt identity');
  const e=input_evidence;
  if(!record(e)||!digest(e.sha256)||e.sample_rate_hz!==16000||e.channels!==1||!Number.isSafeInteger(e.sample_count)||e.sample_count<1||e.sample_count>480000||!Number.isFinite(e.rms)||!Number.isFinite(e.peak)||e.rms<0||e.peak<e.rms||!Number.isSafeInteger(e.nonzero_sample_count)||e.nonzero_sample_count<0||e.nonzero_sample_count>e.sample_count)throw fail('Invalid measured model-input evidence');
  if((e.nonzero_sample_count===0)!==(e.peak===0&&e.rms===0))throw fail('Inconsistent silence measurements');
  if(typeof synthetic!=='boolean'||!record(provenance)||!digest(provenance.model_manifest_sha256)||!digest(provenance.raw_evidence_sha256)||!digest(provenance.prompt_sha256))throw fail('Missing semantic evidence digests');
  if(!synthetic&&e.sample_count!==Math.ceil((request.end_sample-request.start_sample)*16000/request.source_sample_rate_hz))throw fail('Model input duration differs from selected source range');
  if(typeof raw_response!=='string'||raw_response.length>20000)throw fail('Invalid raw semantic evidence');
  const common={schema_version:'hapa.audio-atlas.semantic-proposal.v1',request,input_evidence:e,provenance,synthetic,raw_response,raw_response_sha256:sha(raw_response),claim_type:'model_inferred',confidence:null,quality_qualified:false,timing_authority:false,review_state:'unreviewed',model_cues_verified:false};
  // An all-zero signal is measured evidence. Do not let fluent model prose override it.
  if(e.nonzero_sample_count===0)return {...common,state:'abstained',reason:'digital_silence',axes:[]};
  if(eos_observed!==true)return {...common,state:'abstained',reason:'incomplete_model_response',axes:[]};
  let parsed;try{parsed=parseSemanticResponse(raw_response);}catch(error){return {...common,state:'abstained',reason:'invalid_model_schema',validation_error:error.message,axes:[]};}
  return {...common,state:'needs_review',framing:parsed.framing,axes:SEMANTIC_AXES.map(axis=>{
    const v=parsed.value[axis],text=[v.description,...v.audible_cues].join(' '),flags=[];
    // Advisory coverage only; this is not a general truth or identity classifier.
    if(/\b(male|female|man|woman|boy|girl)\b/i.test(text))flags.push('identity_wording_outside_requested_scope');
    if(/\b(stereo|pann?ed|centered|left channel|right channel|spatial placement)\b/i.test(text))flags.push('spatial_claim_from_mono_input');
    if(/\b\d{1,2}:\d{2}\b|\b\d+(?:\.\d+)?\s*(?:seconds?|bpm)\b/i.test(text))flags.push('generated_numeric_claim_not_measurement');
    if(axis==='production'&&/\b(close.mic|microphone|unprocessed|recording equipment)\b/i.test(text))flags.push('recording_process_inference');
    if(v.audible_cues.length===0&&v.description.toLowerCase()!=='unknown')flags.push('no_model_cues_supplied');
    return {id:sha({request,axis,raw:sha(raw_response)}),axis,description:v.description,model_audible_cues:v.audible_cues,model_uncertainty_text:v.uncertainty,state:v.description.trim().toLowerCase()==='unknown'?'unknown':'candidate',flags,evidence:[{kind:'source_excerpt',asset_id:request.source_asset_id,timeline_id:request.timeline_id,source_sha256:request.source_sha256,start_sample:request.start_sample,end_sample:request.end_sample}],confidence:null,review_state:'unreviewed'};
  })};
}
