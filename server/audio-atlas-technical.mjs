const check=(v,message)=>{if(!v)throw Object.assign(new Error(`Atlas technical measurements: ${message}`),{statusCode:422});};
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const nullable=v=>v===null||finite(v);
const roundEven=n=>n-Math.floor(n)===.5?Math.floor(n)+(Math.floor(n)%2):Math.round(n);
export function technicalSummary(t){const {frames,...summary}=t;return summary;}
export function validateTechnical(asset){
 const t=asset.technical;if(!t)return null;
 check(t.status==='complete'&&t.method==='hapa.pcm-technical.v1','unsupported method');
 check(t.source_asset_id===asset.id&&t.source_sha256===asset.source_sha256&&t.timeline_id===asset.timeline_id&&t.sample_rate_hz===asset.sample_rate_hz&&t.sample_count===asset.sample_count&&t.channels===asset.channels,'source identity mismatch');
 check(integer(t.channels,1)&&t.channels<=8&&integer(t.sample_count,1)&&integer(t.sample_rate_hz,1),'invalid source dimensions');
 check(t.hop_samples===Math.max(1,roundEven(t.sample_rate_hz/10))&&t.window_samples===t.hop_samples&&t.centered===false&&t.first_frame_sample===0&&t.normalization==='none','invalid frame conventions');
 check(t.time_map?.numerator===1&&t.time_map?.denominator===1&&t.time_map?.offset_samples===0&&t.time_map?.target==='own decoded source timeline','invalid time map');
 check(t.thresholds?.at_or_above_full_scale===1&&t.thresholds?.near_full_scale===.999&&t.units?.rms_dbfs==='dBFS, RMS relative to amplitude 1'&&t.units?.peak_dbfs==='dBFS, sample peak relative to amplitude 1','invalid units or thresholds');
 check(Array.isArray(t.frames)&&t.frames.length===Math.ceil(t.sample_count/t.hop_samples),'incomplete frames');
 const array=(a,predicate)=>Array.isArray(a)&&a.length===t.channels&&a.every(predicate);
 const totals=Array(t.channels).fill(0),near=Array(t.channels).fill(0);
 const corr=v=>v===null||(t.channels===2&&finite(v)&&Math.abs(v)<=1);
 for(let i=0;i<t.frames.length;i++){
  const f=t.frames[i],start=i*t.hop_samples,end=Math.min(t.sample_count,start+t.hop_samples);
  check(f.start_sample===start&&f.end_sample===end,'invalid frame support');
  check(array(f.rms_dbfs,nullable)&&array(f.peak_dbfs,nullable)&&corr(f.stereo_correlation),'invalid frame measurements');
  check(array(f.at_or_above_full_scale,v=>integer(v)&&v<=end-start)&&array(f.near_full_scale,v=>integer(v)&&v<=end-start),'invalid clipping counts');
  for(let c=0;c<t.channels;c++){check(f.near_full_scale[c]>=f.at_or_above_full_scale[c],'inconsistent threshold counts');totals[c]+=f.at_or_above_full_scale[c];near[c]+=f.near_full_scale[c];}
 }
 const s=t.summary;check(s&&array(s.rms_dbfs,nullable)&&array(s.peak_dbfs,nullable)&&array(s.crest_db,v=>v===null||(finite(v)&&v>=-1e-10))&&array(s.dc_offset,finite)&&corr(s.stereo_correlation),'invalid summary');
 check(JSON.stringify(totals)===JSON.stringify(s.at_or_above_full_scale)&&JSON.stringify(near)===JSON.stringify(s.near_full_scale),'summary counts do not match frames');
 const q=t.quiet_level;check(q?.noise_floor_dbfs===null&&array(q.rms_p10_dbfs,nullable)&&q.window_count===Math.floor(t.sample_count/t.hop_samples)&&typeof q.reason==='string','invalid quiet-level qualification');
 const l=t.loudness;check(['complete','failed','unsupported'].includes(l?.status),'missing loudness status');
 if(l.status==='complete'){
  check(t.channels<=2&&l.channel_layout===(t.channels===1?'mono':'stereo')&&l.dual_mono===false&&l.report_precision_db===.01,'invalid loudness weighting');
  for(const k of ['integrated_lufs','true_peak_dbtp','loudness_range_lu','gate_threshold_lufs'])check(nullable(l[k]),`invalid ${k}`);
  check(l.loudness_range_lu===null||l.loudness_range_lu>=0,'invalid loudness range');
  check(t.sample_count>=.4*t.sample_rate_hz||l.integrated_lufs===null,'short audio has integrated loudness');
  check(t.sample_count>=3*t.sample_rate_hz||l.loudness_range_lu===null,'short audio has loudness range');
 }else check(typeof l.reason==='string'&&l.reason.length>0,'missing loudness failure reason');
 return t;
}
export function queryTechnical(asset,{start,end,limit=1000,offset=0}){
 const t=validateTechnical(asset);if(!t)return {state:'not_available',asset_id:asset.id,frames:[],notice:'This saved run has no technical measurements. Run a new local analysis to add them.'};
 check(integer(start)&&integer(end,1)&&start<end&&end<=t.sample_count&&integer(limit,1)&&limit<=1000&&integer(offset),'invalid query bounds');
 const rows=t.frames.filter(f=>f.start_sample<end&&f.end_sample>start);
 return {state:'complete',asset_id:asset.id,...technicalSummary(t),start_sample:start,end_sample:end,summary_scope:'entire source, not query window',total:rows.length,offset,truncated:offset+limit<rows.length,frames:rows.slice(offset,offset+limit)};
}
