import {validateTechnical} from './audio-atlas-technical.mjs';
const fail=message=>{throw Object.assign(new Error(message),{statusCode:422});};
const db=x=>x>0?10*Math.log10(x):null;
/** Exact energy aggregation over already measured complete source frames. */
export function noiseRange(asset,start,end){
 const t=validateTechnical(asset);if(!t)fail('This saved run has no technical measurements; explicitly analyze again first');
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>asset.sample_count||(end-start)>30*asset.sample_rate_hz)fail('Choose a valid source range of at most 30 seconds');
 const rows=t.frames.filter(f=>f.start_sample<end&&f.end_sample>start),from=rows[0].start_sample,to=rows.at(-1).end_sample,count=to-from;
 if(count>30*asset.sample_rate_hz)fail('Expanded frame range exceeds 30 seconds; choose a shorter interval');
 const power=Array(asset.channels).fill(0),peak=Array(asset.channels).fill(null);
 for(const f of rows)for(let c=0;c<asset.channels;c++){
  power[c]+=(f.rms_dbfs[c]===null?0:10**(f.rms_dbfs[c]/10))*(f.end_sample-f.start_sample);
  if(f.peak_dbfs[c]!==null)peak[c]=peak[c]===null?f.peak_dbfs[c]:Math.max(peak[c],f.peak_dbfs[c]);
 }
 return {method:'hapa.source-frame-reference-rms.v1',asset_id:asset.id,source_sha256:asset.source_sha256,timeline_id:asset.timeline_id,sample_rate_hz:asset.sample_rate_hz,channels:asset.channels,
  requested_start_sample:start,requested_end_sample:end,start_sample:from,end_sample:to,sample_count:count,frame_count:rows.length,snapped:from!==start||to!==end,
  rms_dbfs:power.map(p=>db(p/count)),peak_dbfs:peak,normalization:'none',centered:false,time_map:t.time_map,
  units:'dBFS, broadband unweighted RMS including DC; amplitude 1 reference',
  missing_values:'null dBFS means zero energy in the measured reference; no finite logarithm',
  interpretation:'Measured level of the selected content. It estimates noise only if the selected interval contains only representative noise. No source separation, denoising, whole-song noise assumption or SNR inference.'};
}
export function validateNoiseReference(result,input){
 const asset=result.assets.find(a=>a.id===input.asset_id&&a.status==='ready');
 if(!asset||input.source_sha256!==asset.source_sha256||input.timeline_id!==asset.timeline_id)fail('Noise reference source/timeline mismatch');
 if(!['human','agent','synthetic'].includes(input.label_origin))fail('Declare human, agent or synthetic reference origin');
 if(!['noise_only','retracted'].includes(input.label))fail('Choose noise only or retracted');
 if(typeof input.reviewer!=='string'||!input.reviewer.trim()||input.reviewer.length>120||typeof input.note!=='string'||!input.note.trim()||input.note.length>4000)fail('An attributed name and explanation are required');
 const level=input.label==='noise_only'?noiseRange(asset,input.start_sample,input.end_sample):null;
 // Persist only the exact range the operator reviewed, never silently snap on save.
 if(level?.snapped)fail('Preview the frame-aligned range and save those exact boundaries');
 if(input.label==='retracted'&&(input.start_sample!=null||input.end_sample!=null))fail('Retraction must not include a measurement range');
 return {asset_id:asset.id,source_sha256:asset.source_sha256,timeline_id:asset.timeline_id,label_origin:input.label_origin,label:input.label,reviewer:input.reviewer.trim(),note:input.note.trim(),...(level?{start_sample:level.start_sample,end_sample:level.end_sample}:{}),claim_type:input.label_origin==='human'?'human_asserted':input.label_origin==='agent'?'agent_asserted':'synthetic_test',identity_assurance:'operator-entered attribution, not authenticated listening verification'};
}
export function noiseReport(result,history,assetId){
 const asset=result.assets.find(a=>a.id===assetId&&a.status==='ready');if(!asset)fail('Noise reference source unavailable');
 const latest=new Map(),events=[],excluded=[];
 for(const event of history.noise_reference_events||[]){if(event.asset_id!==assetId)continue;try{validateNoiseReference(result,event);latest.set(event.label_origin,event);events.push(event);}catch(e){excluded.push({id:event.id,reason:e.message});}}
 const lane=origin=>{const entry=latest.get(origin);return !entry||entry.label==='retracted'?{state:entry?'retracted':'not_available',reference:entry||null,measurement:null}:{state:'declared_reference',reference:entry,measurement:noiseRange(asset,entry.start_sample,entry.end_sample)};};
 return {schema_version:'hapa.audio-atlas.noise-reference.v1',run_id:result.run_id,asset_id:assetId,source_sha256:asset.source_sha256,timeline_id:asset.timeline_id,sample_rate_hz:asset.sample_rate_hz,sample_count:asset.sample_count,revision:history.revision,human:lane('human'),agent:lane('agent'),synthetic:lane('synthetic'),events,excluded,quality_qualified:false,notice:'Noise-only is an attributed assertion about a selected interval, not acoustic ground truth. Synthetic and agent references never become human references. Saving or retracting preserves original audio, measurements and earlier assertions.'};
}
