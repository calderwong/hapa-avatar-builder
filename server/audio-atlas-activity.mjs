import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateTechnical} from './audio-atlas-technical.mjs';
import {validatePitch} from './audio-atlas-pitch.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const implementation=sha(fs.readFileSync(new URL(import.meta.url)));
const quantile=(v,q)=>{if(!v.length)return null;const a=[...v].sort((x,y)=>x-y);return a[Math.round(q*(a.length-1))];};
const parameters={entry_floor_dbfs:-60,entry_below_p95_db:35,exit_hysteresis_db:6,entry_hold_frames:3,exit_hold_frames:3};
const limitations=['Energy activity is not instrument detection, phonation, audibility or absence. Leakage, noise and reverb may qualify.', 'Boundaries follow non-centered 100ms source frames; three-frame confirmation is backdated to the first crossing. Acoustic error bounds are unknown.', 'Strongest channel RMS avoids downmix cancellation but can admit channel-specific noise. No gain normalization or automatic noise-floor estimation.', 'Spectral centroid uses existing Hann-windowed arithmetic-mono magnitude spectra; phase cancellation can make it unavailable. It does not identify an instrument.', 'Pitch register is available only on the explicitly analyzed pYIN source/channel. Octave errors and overlapping voices remain possible.', 'Every stem uses its own source clock. This view does not establish synchronized entrances against Master.'];
export function deriveActivity(result,asset){
 const common={schema_version:'hapa.source-activity.v1',method:'hapa.rms-hysteresis-activity.v1',source_asset_id:asset.id,source_sha256:asset.source_sha256,timeline_id:asset.timeline_id,source_sample_rate_hz:asset.sample_rate_hz,source_sample_count:asset.sample_count,declared_role:{label:asset.role||null,claim_type:'imported_declared',acoustically_verified:false},acoustic_family:{state:'unknown',reason:'No instrument-family classifier qualified.'},arrangement_role:{state:'unknown',reason:'Source naming does not establish acoustic arrangement role.'},parameters,quality_qualified:false,limitations};
 const t=validateTechnical(asset);
 if(!t)return {...common,state:'not_available',segments:[],frames:[],notice:'This run has no source-channel technical frames. Analyze locally to add them.'};
 const levels=t.frames.map(f=>{const v=f.rms_dbfs.filter(x=>x!==null);return v.length?Math.max(...v):null;});
 // Include digital silence as -Infinity in the percentile; JSON output uses null.
 const p95=quantile(levels.map(x=>x??-Infinity),.95),entry=Math.max(parameters.entry_floor_dbfs,p95-parameters.entry_below_p95_db),exit=entry-parameters.exit_hysteresis_db;
 const frames=t.frames.map((f,i)=>({index:i,start_sample:f.start_sample,end_sample:f.end_sample,rms_dbfs:f.rms_dbfs,strongest_channel_dbfs:levels[i],threshold_state:levels[i]===null?'digital_silence':levels[i]>=entry?'above_entry':levels[i]>=exit?'within_hysteresis':'below_exit'}));
 const pitch=validatePitch(result),hasPitch=pitch?.source_asset_id===asset.id;
 const featureMap=new Map((asset.features?.frames||[]).map(f=>[f.start_sample,f]));
 const segments=[],rejected=[];
 const emit=(first,last)=>{
  const local=frames.slice(first,last+1),start=local[0].start_sample,end=local.at(-1).end_sample;
  const centroids=local.map(f=>featureMap.get(f.start_sample)).filter((f,i)=>f?.end_sample===local[i].end_sample&&Number.isFinite(f.spectral_centroid_hz)&&f.spectral_centroid_hz>=0).map(f=>f.spectral_centroid_hz);
  const hz=hasPitch?pitch.frames.filter(f=>f.center_sample>=start&&f.center_sample<end&&f.voiced).map(f=>f.f0_hz):[];
  segments.push({id:`${asset.id}:activity:${first}`,state:'candidate',start_sample:start,end_sample:end,frame_start:first,frame_end_exclusive:last+1,acoustic_uncertainty_samples:null,
   onset_support_samples:[local[0].start_sample,local[0].end_sample],offset_support_samples:last+1<frames.length?[frames[last+1].start_sample,frames[last+1].end_sample]:null,ends_at_source_boundary:end===asset.sample_count,
   median_strongest_channel_dbfs:quantile(local.map(f=>f.strongest_channel_dbfs??-Infinity),.5),below_exit_frame_count:local.filter(f=>['below_exit','digital_silence'].includes(f.threshold_state)).length,
   timbre:{state:centroids.length?'measured_proxy':'unknown',spectral_centroid_median_hz:quantile(centroids,.5),measured_frames:centroids.length,total_frames:local.length,evidence_ref:`result.json#/assets/${result.assets.findIndex(a=>a.id===asset.id)}/features/frames`,meaning:'Spectral center of mass; not an instrument or perceptual timbre classification'},
   register:{state:hz.length?'candidate':'unknown',pitch_p10_hz:quantile(hz,.1),pitch_median_hz:quantile(hz,.5),pitch_p90_hz:quantile(hz,.9),voiced_frames:hz.length,source_channel:hasPitch?pitch.source_channel:null,reason:hasPitch?(hz.length?null:'No voiced pitch frames in this span'):'Pitch was not measured on this source',evidence_ref:hasPitch?'result.json#/pitch_analysis/frames':null}});
 };
 let first=null,pending=null,below=null;
 for(let i=0;i<frames.length;i++){
  const level=levels[i]??-Infinity;
  if(first===null){
   if(level>=entry){if(pending===null)pending=i;if(i-pending+1>=3){first=pending;pending=null;}}
   else if(pending!==null){rejected.push({start_sample:frames[pending].start_sample,end_sample:frames[i-1].end_sample,reason:'entry_shorter_than_three_frames'});pending=null;}
  }else if(level<exit){if(below===null)below=i;if(i-below+1>=3){emit(first,below-1);first=null;below=null;}}
  else below=null;
 }
 if(first!==null)emit(first,frames.length-1);
 if(pending!==null)rejected.push({start_sample:frames[pending].start_sample,end_sample:frames.at(-1).end_sample,reason:'entry_shorter_than_three_frames'});
 for(const segment of segments)if(!Number.isFinite(segment.median_strongest_channel_dbfs))segment.median_strongest_channel_dbfs=null;
 return {...common,state:'candidate',thresholds:{entry_dbfs:entry,exit_dbfs:exit,source_p95_strongest_channel_dbfs:Number.isFinite(p95)?p95:null,percentile_scope:'all source frames, including digital silence'},provenance:{kind:'derived_read_only_view',implementation_sha256:implementation,technical_evidence_sha256:sha(JSON.stringify(t)),feature_evidence_sha256:asset.features?sha(JSON.stringify(asset.features)):null,pitch_evidence_sha256:hasPitch?sha(JSON.stringify(pitch)):null},segment_count:segments.length,active_sample_count:segments.reduce((s,v)=>s+v.end_sample-v.start_sample,0),segments,frames,rejected_spans:rejected};
}
export function activitySummary(v){const {segments,frames,rejected_spans,...summary}=v;return summary;}
export function queryActivity(result,asset,{start,end}){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>asset.sample_count||end-start>30*asset.sample_rate_hz)throw Object.assign(new Error('Activity review requires a source window of at most30seconds'),{statusCode:422});
 const v=deriveActivity(result,asset),overlap=f=>f.start_sample<end&&f.end_sample>start;
 return {...activitySummary(v),start_sample:start,end_sample:end,segments:v.segments.filter(overlap),frames:v.frames.filter(overlap),rejected_spans:(v.rejected_spans||[]).filter(overlap),window_complete:true,event_bounds:'Whole source spans, not clipped to window'};
}
