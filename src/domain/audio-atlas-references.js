import {timingErrorDistribution} from './echo-lyric-timing-editor.js';
const fail=message=>{throw Object.assign(new Error(message),{statusCode:422});};
/** Model words and unaligned supplied tokens stay distinct from reference labels. */
export function timingReferenceTargets(result,assetId){
  const rows=new Map(result.observations.filter(o=>o.subject_id===assetId&&o.kind==='hapa.audio.word_candidate').map(o=>[o.id,{id:o.id,text:o.payload.text,observation_id:o.id,start_sample:o.start_sample,end_sample:o.end_sample,method:o.payload.method||'word candidate'}]));
  const alignment=result.forced_alignment;
  if(alignment?.source_asset_id===assetId)for(const [index,token] of alignment.supplied_tokens.entries()){
    const id=`${assetId}:aligned-word:${index}`;
    if(!rows.has(id))rows.set(id,{id,text:token.text,observation_id:null,start_sample:null,end_sample:null,method:'unresolved supplied word'});
  }
  const suppliedIds=alignment?.source_asset_id===assetId?alignment.supplied_tokens.map((_,index)=>`${assetId}:aligned-word:${index}`):[];
  const suppliedSet=new Set(suppliedIds);
  return [...rows.values()].filter(t=>!suppliedSet.has(t.id)).concat(suppliedIds.map(id=>rows.get(id)));
}
export function validateTimingReference(result,input){
  const a=result.assets.find(a=>a.id===input.asset_id&&a.status==='ready');
  if(!a||input.source_sha256!==a.source_sha256||input.timeline_id!==a.timeline_id)fail('Reference source or timeline does not match this analysis');
  const target=timingReferenceTargets(result,a.id).find(t=>t.id===input.target_id);
  if(!target||input.text!==target.text)fail('Reference target or original word text changed');
  if(!['human','synthetic'].includes(input.label_origin))fail('Declare human or synthetic reference origin');
  if(!['present','not_performed','uncertain','retracted'].includes(input.label))fail('Choose present, not performed, uncertain or retracted');
  if(typeof input.reviewer!=='string'||!input.reviewer.trim()||input.reviewer.length>120||typeof input.note!=='string'||!input.note.trim()||input.note.length>4000)fail('Reference annotator and note are required');
  let bounds=null;
  if(input.label==='present'){
    const {start_sample:start,end_sample:end,uncertainty_samples:uncertainty}=input;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>a.sample_count||!Number.isSafeInteger(uncertainty)||uncertainty<0||uncertainty>a.sample_rate_hz)fail('Reference needs valid source-sample boundaries and uncertainty up to one second');
    bounds={start_sample:start,end_sample:end,uncertainty_samples:uncertainty};
  }else if(['start_sample','end_sample','uncertainty_samples'].some(k=>input[k]!=null))fail('Non-timed reference labels must not contain boundaries');
  return {target_id:target.id,asset_id:a.id,source_sha256:a.source_sha256,timeline_id:a.timeline_id,text:target.text,label:input.label,label_origin:input.label_origin,reviewer:input.reviewer.trim(),note:input.note.trim(),...bounds,status:'operator_entered_reference',identity_assurance:'operator-entered name; not authenticated independent review'};
}
const distribution=values=>({...timingErrorDistribution(values.map(Math.abs)),signedBiasMs:values.length?values.reduce((a,b)=>a+b,0)/values.length:null});
/** Return measured error only against explicitly entered, source-bound references. */
export function timingEvaluation(result,history,assetId){
  const asset=result.assets.find(a=>a.id===assetId&&a.status==='ready');if(!asset)fail('Reference source unavailable');
  const targets=timingReferenceTargets(result,assetId),latest=new Map(),excluded=[];
  for(const entry of history.reference_events||[]){
    if(entry.asset_id!==assetId)continue;
    try{validateTimingReference(result,entry);latest.set(`${entry.label_origin}:${entry.target_id}`,entry);}catch(e){excluded.push({id:entry.id,reason:e.message});}
  }
  const decisions=new Map();for(const event of history.events||[])if(['accepted_by_human','rejected'].includes(event.state))decisions.set(event.observation_id,event);
  const evaluate=(target,origin)=>{
    const reference=latest.get(`${origin}:${target.id}`)||null,decision=decisions.get(target.observation_id),correction=decision?.state==='accepted_by_human'?decision.correction:null;
    const measured=reference?.label==='present',original=target.observation_id!=null;
    const effectiveText=correction?.text??target.text;
    const effectiveEligible=original&&measured&&decision?.state!=='rejected'&&effectiveText===reference.text;
    const error=(sample,boundary)=>(sample-reference[boundary])/asset.sample_rate_hz*1000;
    return {...target,reference,
      original_error_ms:measured&&original?{onset:error(target.start_sample,'start_sample'),offset:error(target.end_sample,'end_sample')}:null,
      effective_error_ms:effectiveEligible?{onset:error(correction?.start_sample??target.start_sample,'start_sample'),offset:error(correction?.end_sample??target.end_sample,'end_sample')}:null,
      effective_exclusion:measured&&!effectiveEligible?(!original?'no_timed_candidate':decision?.state==='rejected'?'candidate_rejected':'corrected_text_differs_from_reference'):null};
  };
  const rows=targets.map(target=>({...evaluate(target,'human'),synthetic_reference:latest.get(`synthetic:${target.id}`)||null}));
  const summary=origin=>{
    const selected=targets.map(target=>evaluate(target,origin)).filter(r=>r.reference&&r.reference.label!=='retracted');
    const timed=selected.filter(r=>r.reference.label==='present');
    return {labelled_targets:selected.length,present:selected.filter(r=>r.reference.label==='present').length,not_performed:selected.filter(r=>r.reference.label==='not_performed').length,uncertain:selected.filter(r=>r.reference.label==='uncertain').length,
      original:{onset:distribution(selected.flatMap(r=>r.original_error_ms?[r.original_error_ms.onset]:[])),offset:distribution(selected.flatMap(r=>r.original_error_ms?[r.original_error_ms.offset]:[]))},
      effective:{onset:distribution(selected.flatMap(r=>r.effective_error_ms?[r.effective_error_ms.onset]:[])),offset:distribution(selected.flatMap(r=>r.effective_error_ms?[r.effective_error_ms.offset]:[]))},
      maximumDeclaredUncertaintyMs:timed.length?Math.max(...timed.map(r=>r.reference.uncertainty_samples/asset.sample_rate_hz*1000)):null};
  };
  return {schema_version:'hapa.audio-atlas.timing-evaluation.v1',run_id:result.run_id,asset_id:assetId,source_role:asset.role,source_sha256:asset.source_sha256,timeline_id:asset.timeline_id,sample_rate_hz:asset.sample_rate_hz,sample_count:asset.sample_count,revision:history.revision,
    target_count:targets.length,human:summary('human'),synthetic:summary('synthetic'),excluded,targets:rows,
    quality_qualified:false,notice:'Operator-entered references; identity and acoustic accuracy are not independently authenticated. Signed error = candidate minus reference. Median/p95 use absolute errors; p95 is nearest rank. Original and effective results use the same references, which corrections never create. Synthetic labels do not enter human metrics.'};
}
