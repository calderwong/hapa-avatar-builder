import AtlasNoiseReference from './AtlasNoiseReference.jsx';
import {useEffect,useState} from 'react';
import {timeLabel} from '../domain/audio-atlas-ui.js';
const fmt=(n,unit='')=>n==null?'Unavailable':`${n.toFixed(2)}${unit?` ${unit}`:''}`;
export default function AtlasTechnical({runId,asset,start,request,base,onCue}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 const from=Math.min(asset.sample_count-1,Math.max(0,Math.round(start*asset.sample_rate_hz))),to=Math.min(asset.sample_count,from+30*asset.sample_rate_hz);
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');setData(null);
  request(`/jobs/${runId}/query?op=technical&asset=${encodeURIComponent(asset.id)}&start=${from}&end=${to}&limit=1000`).then(v=>{if(!cancelled)setData(v);}).catch(e=>{if(!cancelled)setError(e.message||'Unable to load measurements.');}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[runId,asset.id,from,to,request,retry]);
 const l=data?.loudness,s=data?.summary,frames=data?.frames||[],flags=frames.filter(f=>f.near_full_scale.some(v=>v>0));
 return <section className="atlas-content" aria-label="Audio measurements" aria-busy={loading}><h3>Audio measurements · {asset.role}</h3>
  {loading&&<p role="status">Loading source measurements…</p>}
  {error&&<div role="alert"><p>{error}</p><button className="hapa-btn" onClick={()=>setRetry(v=>v+1)}>Retry measurements</button></div>}
  {data?.state==='not_available'&&<p>{data.notice}</p>}
  {s&&<><p>Whole-source measurements. Use the listening window below to investigate level warnings. These measurements do not grade the song.</p>
   <dl className="atlas-technical-summary"><div><dt>Integrated loudness</dt><dd>{fmt(l?.integrated_lufs,'LUFS')}</dd><small>{l?.reason||l?.integrated_missing_reason||'Gated loudness across the full source'}</small></div><div><dt>True peak</dt><dd>{fmt(l?.true_peak_dbtp,'dBTP')}</dd><small>{l?.reason||l?.true_peak_missing_reason||'192 kHz oversampled estimate'}</small></div><div><dt>Loudness range</dt><dd>{fmt(l?.loudness_range_lu,'LU')}</dd><small>{l?.reason||l?.range_missing_reason||'Content- and duration-dependent'}</small></div><div><dt>Stereo correlation</dt><dd>{fmt(s.stereo_correlation)}</dd><small>−1 opposed · 0 uncorrelated · +1 matching. Requires two varying channels.</small></div></dl>
   {l?.status!=='complete'&&<p role="status">Loudness measurement {l?.status}: {l?.reason}</p>}
   <div style={{overflowX:'auto'}}><table className="atlas-stem-timing"><caption>Whole-source channel levels</caption><thead><tr><th>Channel</th><th>RMS</th><th>Sample peak</th><th>At/above full scale</th><th>Near full scale</th><th>Quiet-level estimate</th></tr></thead><tbody>{s.rms_dbfs.map((r,i)=><tr key={i}><th>{i+1}</th><td>{fmt(r,'dBFS')}</td><td>{fmt(s.peak_dbfs[i],'dBFS')}</td><td>{s.at_or_above_full_scale[i]} samples</td><td>{s.near_full_scale[i]} samples</td><td>{fmt(data.quiet_level.rms_p10_dbfs[i],'dBFS')}</td></tr>)}</tbody></table></div>
   <p>{data.clipping_notice}</p><p>Automatic isolated-noise estimate: unavailable. {data.quiet_level.reason} The quiet-level column is the 10th percentile of 100 ms RMS windows.</p>
   <AtlasNoiseReference key={`${runId}-${asset.id}`} runId={runId} asset={asset} request={request} onCue={onCue}/>
   <h4>Level warnings in the listening window · {timeLabel(from/asset.sample_rate_hz)}–{timeLabel(to/asset.sample_rate_hz)}</h4>
   {data.truncated&&<p role="alert">Only part of this window was returned. Open the source evidence for pagination.</p>}
   <p>{flags.length?`${flags.length} windows have samples near or above full scale. Cue a window to inspect the sound.`:'No near-full-scale samples in this window. This does not rule out earlier clipping or other distortion.'}</p>
   <div className="atlas-structure-transitions">{flags.slice(0,30).map(f=><button className="hapa-btn" key={f.start_sample} onClick={()=>onCue(f.start_sample/asset.sample_rate_hz)}>{timeLabel(f.start_sample/asset.sample_rate_hz)} · {f.near_full_scale.join(' / ')} samples by channel</button>)}</div>{flags.length>30&&<small>Showing the first 30 warning windows.</small>}
   <details><summary>Measurement conventions and evidence</summary><p>100 ms non-centered windows use exact source samples; the final partial window keeps its real length. Levels use amplitude 1 as full scale. No gain or channel mixing is applied to PCM metrics. Null dB values include zero energy; they are never substituted with 0 dBFS.</p><p>Full scale: |sample| ≥ 1. Near full scale: |sample| ≥ 0.999. Correlation removes each channel mean; it does not identify an acoustic cause. Loudness uses FFmpeg’s input statistics with mono compensation disabled; normalized output is discarded.</p><p>Source: {data.source_sha256}</p><a className="hapa-btn" href={`${base}/api/echos/audio-atlas/jobs/${runId}/query?op=technical&asset=${encodeURIComponent(asset.id)}&start=${from}&end=${to}&limit=1000`} target="_blank" rel="noreferrer">Open measurement evidence</a></details>
  </>}
 </section>;
}
