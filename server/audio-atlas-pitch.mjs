import fs from 'node:fs';import path from 'node:path';
export {pitchRequest} from '../src/domain/audio-atlas-pitch.js';
export const PITCH_PACKAGES={librosa:'0.11.0',numpy:'2.4.6',scipy:'1.17.1',numba:'0.67.0',llvmlite:'0.49.0',soxr:'1.1.0'};
const fail=message=>Object.assign(new Error(`Atlas pitch: ${message}`),{statusCode:422});
const check=(v,m)=>{if(!v)throw fail(m);};const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function pitchRuntime(storage,enabled){
 if(!enabled)return null;const file=path.join(storage,'pitch-runtime.json');check(fs.existsSync(file),'configure the existing isolated pYIN runtime first');const c=JSON.parse(fs.readFileSync(file,'utf8'));
 check(path.isAbsolute(c.python||'')&&fs.existsSync(c.python)&&c.packages&&Object.keys(c.packages).length===Object.keys(PITCH_PACKAGES).length&&Object.entries(PITCH_PACKAGES).every(([k,v])=>c.packages[k]===v),'invalid pinned pYIN runtime');return {python:c.python,packages:{...PITCH_PACKAGES}};
}
export function pitchSummary(p){const{frames,...summary}=p;return summary;}
export function validatePitch(result){
 const p=result.pitch_analysis;if(!p)return null;const a=result.assets.find(a=>a.id===p.source_asset_id&&a.status==='ready');
 check(a&&p.source_sha256===a.source_sha256&&p.timeline_id===a.timeline_id&&p.source_sample_rate_hz===a.sample_rate_hz&&p.source_sample_count===a.sample_count&&p.source_channel_count===a.channels,'source identity mismatch');
 check(p.status==='candidate'&&p.method==='librosa-pyin-source-contour.v1'&&integer(p.source_channel)&&p.source_channel<a.channels,'invalid method/channel');
 check(p.analysis_sample_rate_hz===16000&&integer(p.analysis_sample_count,1)&&Math.abs(p.analysis_sample_count-a.sample_count*16000/a.sample_rate_hz)<=1,'invalid resampled view');
 check(p.hop_samples===160&&p.window_samples===1024&&p.centered===true&&p.first_frame_sample===0&&p.pad_mode==='constant zero'&&p.normalization==='none','invalid frame convention');
 check(p.time_map?.numerator===a.sample_rate_hz&&p.time_map?.denominator===16000&&p.time_map?.offset_samples===0&&p.time_map?.rounding==='nearest-half-up'&&p.time_map?.target==='own decoded source timeline','invalid source map');
 check(p.frequency_units==='Hz'&&p.cents_reference_hz===440&&p.cents_units==='1200 * log2(f0_hz / 440)'&&p.resolution_cents===10&&p.quality_qualified===false&&p.polyphonic_separation===false,'invalid units/qualification');
 check(p.parameters?.fmin===50&&p.parameters?.fmax===1100&&p.parameters?.frame_length===1024&&p.parameters?.hop_length===160&&p.parameters?.center===true&&p.parameters?.pad_mode==='constant'&&p.parameters?.resolution===.1&&p.voicing_policy?.minimum_score===.1&&p.voicing_policy?.minimum_rms_dbfs===-70,'invalid estimator policy');
 check(p.parameters.n_thresholds===100&&JSON.stringify(p.parameters.beta_parameters)==='[2,18]'&&p.parameters.boltzmann_parameter===2&&p.parameters.max_transition_rate===35.92&&p.parameters.switch_prob===.01&&p.parameters.no_trough_prob===.01,'invalid pYIN parameters');
 check(p.chunking?.core_samples===480000&&p.chunking?.context_samples===16000&&Array.isArray(p.chunks)&&p.chunks.length===Math.ceil(p.analysis_sample_count/480000),'invalid chunk boundaries');
 for(let i=0;i<p.chunks.length;i++){const c=p.chunks[i],from=i*480000,to=Math.min(p.analysis_sample_count,from+480000);check(c.index===i&&c.core_start_analysis_sample===from&&c.core_end_analysis_sample===to&&c.context_start_analysis_sample===Math.max(0,from-16000)&&c.context_end_analysis_sample===Math.min(p.analysis_sample_count,to+16000),'invalid chunk support');}
 check(Array.isArray(p.frames)&&p.frame_count===p.frames.length&&p.frames.length>0&&p.frames.length<=180001,'invalid frame count');
 let expected=Math.ceil(p.analysis_sample_count/160);while(expected>0&&Math.floor(((expected-1)*160*a.sample_rate_hz+8000)/16000)>=a.sample_count)expected--;check(p.frames.length===expected,'incomplete pitch grid');
 for(let i=0;i<p.frames.length;i++){
  const f=p.frames[i],at=i*160,center=Math.floor((at*a.sample_rate_hz+8000)/16000);
  check(f.analysis_center_sample===at&&f.center_sample===center&&center<a.sample_count&&f.support_start_sample===Math.max(0,Math.floor((at-512)*a.sample_rate_hz/16000))&&f.support_end_sample===Math.min(a.sample_count,Math.ceil((at+512)*a.sample_rate_hz/16000))&&f.chunk_index===Math.floor(at/480000),'invalid frame/source coordinates');
  check(typeof f.raw_voiced==='boolean'&&typeof f.voiced==='boolean'&&finite(f.voicing_score)&&f.voicing_score>=0&&f.voicing_score<=1&&(f.rms_dbfs===null||finite(f.rms_dbfs)),'invalid voicing evidence');
  check(f.raw_f0_hz===null||(finite(f.raw_f0_hz)&&f.raw_f0_hz>=50&&f.raw_f0_hz<=1100),'invalid raw frequency');
  const reason=f.rms_dbfs===null||f.rms_dbfs<-70?'below_energy_floor':f.voicing_score<.1?'low_voicing_score':!f.raw_voiced?'unvoiced_candidate':f.raw_f0_hz===null?'invalid_candidate':null;
  check(f.abstention_reason===reason&&f.voiced===(reason===null),'invalid abstention mask');
  check(f.voiced?(f.f0_hz===f.raw_f0_hz&&finite(f.cents_from_a4)&&Math.abs(f.cents_from_a4-1200*Math.log2(f.f0_hz/440))<1e-8):(f.f0_hz===null&&f.cents_from_a4===null),'frequency/cents disagree with voicing');
 }
 check(p.voiced_frame_count===p.frames.filter(f=>f.voiced).length,'invalid voiced count');
 check(/^[a-f0-9]{64}$/.test(p.analysis_input_sha256),'missing input provenance');
 check(p.runtime?.network==='disabled'&&Object.entries(PITCH_PACKAGES).every(([k,v])=>p.runtime.packages?.[k]===v)&&['ffmpeg_sha256','worker_sha256','helper_sha256'].every(k=>/^[a-f0-9]{64}$/.test(p.runtime[k])),'invalid runtime provenance');return p;
}
export function queryPitch(result,asset,{start,end,limit=1000,offset=0}){
 const p=validatePitch(result);if(!p||p.source_asset_id!==asset.id)return {state:'not_available',asset_id:asset.id,frames:[],notice:p?`Pitch belongs to ${p.source_asset_id}; choose that source, or run pitch analysis for this one.`:'This saved run has no pitch contour. Enable pitch tracking in Analysis settings and analyze explicitly.'};
 check(integer(start)&&integer(end,1)&&end>start&&end<=asset.sample_count&&integer(limit,1)&&limit<=1000&&integer(offset),'invalid query bounds');
 const rows=p.frames.filter(f=>f.center_sample>=start&&f.center_sample<end);
 return {state:'candidate',...pitchSummary(p),asset_id:asset.id,start_sample:start,end_sample:end,total:rows.length,offset,truncated:offset+limit<rows.length,frames:rows.slice(offset,offset+limit)};
}
