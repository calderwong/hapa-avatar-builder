import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const fail=message=>Object.assign(new Error(`Atlas spectrogram: ${message}`),{statusCode:422});
const check=(v,message)=>{if(!v)throw fail(message);};
const integer=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
export function validateSpectrogram(asset){
 const s=asset.spectrogram;if(!s)return null;
 check(/^[a-zA-Z0-9_-]{1,180}$/.test(asset.id),'invalid source identifier');
 check(s.status==='complete'&&s.method==='hapa.channel-stft-display.v1','unsupported measurement');
 check(s.source_asset_id===asset.id&&s.timeline_id===asset.timeline_id&&s.source_sha256===asset.source_sha256&&s.sample_rate_hz===asset.sample_rate_hz&&s.sample_count===asset.sample_count&&s.channels===asset.channels,'source identity mismatch');
 check(s.frequency_units==='Hz'&&s.level_units==='dBFS of peak single-sided FFT-bin amplitude per band; not PSD or loudness'&&s.sparse_snapshots===(s.hop_samples>s.fft_size),'invalid units or snapshot convention');
 check(integer(s.channels,1)&&s.channels<=8&&integer(s.hop_samples,1)&&integer(s.frame_count,1)&&s.frame_count<=4096&&s.frame_count===Math.ceil(s.sample_count/s.hop_samples),'invalid time grid');
 check(integer(s.fft_size,512)&&s.fft_size<=16384&&(s.fft_size&(s.fft_size-1))===0&&s.window==='periodic Hann'&&s.centered===true&&s.first_frame_sample===0,'invalid FFT convention');
 check(s.time_map?.numerator===1&&s.time_map?.denominator===1&&s.time_map?.offset_samples===0&&s.time_map?.target==='own decoded source timeline','invalid source mapping');
 check(integer(s.band_count,1)&&s.band_count<=192&&Array.isArray(s.bands)&&s.bands.length===s.band_count,'invalid frequency budget');
 let cursor=0,hz=0;const binHz=s.sample_rate_hz/s.fft_size;
 for(const b of s.bands){check(b.first_fft_bin===cursor&&integer(b.end_fft_bin,1)&&b.end_fft_bin>cursor&&b.end_fft_bin<=s.fft_size/2+1&&b.low_hz===hz&&b.low_hz===Math.max(0,(cursor-.5)*binHz)&&b.high_hz===Math.min(s.sample_rate_hz/2,(b.end_fft_bin-.5)*binHz),'invalid frequency map');cursor=b.end_fft_bin;hz=b.high_hz;}
 check(cursor===s.fft_size/2+1&&hz===s.sample_rate_hz/2,'incomplete frequency coverage');
 const e=s.encoding;check(e?.dtype==='uint8'&&JSON.stringify(e.axis_order)==='["frame","channel","band"]'&&e.offset_db===-120&&e.step_db===.5&&e.min===0&&e.max===240,'invalid level encoding');
 check(s.artifact===`spectrogram-${asset.id}.u8`&&/^[a-f0-9]{64}$/.test(s.artifact_sha256)&&s.byte_length===s.frame_count*s.channels*s.band_count,'invalid artifact identity');
 return s;
}
export function querySpectrogram(asset,directory,{start,end,channel=0,limit=1000,offset=0}){
 const s=validateSpectrogram(asset);if(!s)return {state:'not_available',asset_id:asset.id,frames:[],notice:'This saved run has no spectrogram. Run a new local analysis to measure it.'};
 const c=Number(channel);check(integer(c)&&c<s.channels,'channel must be a zero-based source channel');
 check(integer(start)&&integer(end,1)&&start<end&&end<=s.sample_count,'invalid source range');
 check(integer(Number(limit),1)&&Number(limit)<=1000&&integer(Number(offset)),'invalid page bounds');
 const bytes=verifySpectrogramArtifact(asset,directory);
 // Include cells intersecting the requested range; FFT support is separately explicit.
 const first=Math.min(s.frame_count-1,Math.floor((start+Math.floor(s.hop_samples/2))/s.hop_samples)),last=Math.min(s.frame_count,Math.floor((end-1+Math.floor(s.hop_samples/2))/s.hop_samples)+1);
 const begin=Math.min(last,first+Number(offset)),finish=Math.min(last,begin+Number(limit));
 const frames=[];for(let i=begin;i<finish;i++){
  const center=i*s.hop_samples,pos=(i*s.channels+c)*s.band_count;
  frames.push({center_sample:center,cell_start_sample:Math.max(0,Math.ceil(center-s.hop_samples/2)),cell_end_sample:i===s.frame_count-1?s.sample_count:Math.min(s.sample_count,Math.ceil(center+s.hop_samples/2)),support_start_sample:Math.max(0,center-s.fft_size/2),support_end_sample:Math.min(s.sample_count,center+s.fft_size/2),values:[...bytes.subarray(pos,pos+s.band_count)]});
 }
 return {state:'complete',asset_id:asset.id,...s,channel:c,start_sample:start,end_sample:end,total:last-first,offset:Number(offset),truncated:finish<last,frames};
}

export function verifySpectrogramArtifact(asset,directory){
 const s=validateSpectrogram(asset);if(!s)return null;
 const file=path.join(directory,s.artifact);let bytes;try{bytes=fs.readFileSync(file);}catch{throw Object.assign(fail('saved spectral evidence is unavailable; explicitly analyze again to rebuild'),{statusCode:409});}
 check(bytes.length===s.byte_length&&createHash('sha256').update(bytes).digest('hex')===s.artifact_sha256,'spectral evidence integrity mismatch; explicitly analyze again to rebuild');
 check(!bytes.some(v=>v>240),'invalid encoded magnitude');return bytes;
}
