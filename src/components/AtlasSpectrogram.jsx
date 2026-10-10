import {readSpectrogramWindow} from '../domain/audio-atlas-spectrogram.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createAtlasClient,timeLabel} from '../domain/audio-atlas-ui.js';
const colors=[[4,8,20],[57,17,98],[150,30,101],[240,96,58],[255,237,168]];
function color(value,floor){const scaled=Math.max(0,Math.min(1,(-120+value*.5-floor)/-floor))*4,i=Math.min(3,Math.floor(scaled)),t=scaled-i;return `rgb(${colors[i].map((v,j)=>Math.round(v+(colors[i+1][j]-v)*t)).join(',')})`;}

export default function AtlasSpectrogram({runId,asset,start,base,onCue}){
 const canvas=useRef(null),{request}=useMemo(()=>createAtlasClient(base),[base]);
 const [channel,setChannel]=useState(0),[scale,setScale]=useState('log'),[floor,setFloor]=useState(-80),[reload,setReload]=useState(0);
 const [data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const sr=asset.sample_rate_hz,from=Math.min(asset.sample_count-1,Math.max(0,Math.round(start*sr))),to=Math.min(asset.sample_count,Math.round((start+30)*sr));
 useEffect(()=>{
  if(!asset.spectrogram)return;let live=true;const abort=new AbortController();setLoading(true);setData(null);setError('');
  readSpectrogramWindow(request,`/jobs/${runId}/query?op=spectrogram&asset=${encodeURIComponent(asset.id)}&start=${from}&end=${to}&channel=${channel}&limit=1000`,abort.signal).then(v=>{if(live)setData(v);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;abort.abort();};
 },[runId,asset.id,asset.spectrogram,from,to,channel,reload,request]);
 useEffect(()=>{
  if(!data?.frames?.length||!canvas.current)return;
  const ctx=canvas.current.getContext('2d'),w=960,h=300,left=55,right=950,top=10,bottom=270,max=sr/2,min=scale==='log'?20:0;
  const y=f=>bottom-(scale==='log'?Math.log(Math.max(min,f)/min)/Math.log(max/min):f/max)*(bottom-top);
  const x=s=>left+(s-from)/(to-from)*(right-left);
  ctx.fillStyle='#040814';ctx.fillRect(0,0,w,h);const palette=Array.from({length:241},(_,i)=>color(i,floor));
  for(const frame of data.frames){const a=Math.max(left,x(frame.cell_start_sample)),b=Math.min(right,x(frame.cell_end_sample));if(b<=a)continue;
   data.bands.forEach((band,j)=>{const hi=Math.max(top,y(band.high_hz)),lo=Math.min(bottom,y(band.low_hz));if(lo<=hi)return;ctx.fillStyle=palette[frame.values[j]];ctx.fillRect(a,hi,Math.ceil(b-a),Math.ceil(lo-hi));});
  }
  ctx.font='12px system-ui';ctx.textAlign='right';ctx.fillStyle='#cbd5e1';
  const ticks=scale==='log'?[20,100,500,1000,4000,max]:[0,max/4,max/2,max*3/4,max];
  for(const f of [...new Set(ticks)].filter(f=>f<=max)){const yy=y(f);ctx.fillStyle='#cbd5e1';ctx.fillText(f>=1000?`${+(f/1000).toFixed(1)}k`:`${Math.round(f)}`,left-6,Math.max(14,Math.min(bottom,yy+4)));ctx.strokeStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();}
  ctx.textAlign='left';ctx.fillText(timeLabel(from/sr),left,292);ctx.textAlign='right';ctx.fillText(timeLabel(to/sr),right,292);
 },[data,scale,floor,sr,from,to]);
 if(!asset.spectrogram)return <div className="atlas-content"><h3>Spectrogram</h3><p>This saved analysis has no spectral measurements. Run a new local analysis from Analysis settings to add them. Missing measurements do not mean silence.</p></div>;
 return <section className="atlas-content" aria-label="Spectrogram review"><h3>Spectrogram · {asset.role}</h3>
  <p>Inspect frequency content on this source’s own timeline. Original channels stay separate. Use the player and window controls above to listen and move through the song.</p>
  <div className="atlas-actions"><label>Source channel<select aria-label="Spectrogram channel" value={channel} onChange={e=>setChannel(Number(e.target.value))}>{Array.from({length:asset.channels},(_,i)=><option value={i} key={i}>Channel {i+1}</option>)}</select></label><label>Frequency scale<select aria-label="Frequency scale" value={scale} onChange={e=>setScale(e.target.value)}><option value="log">Logarithmic · 20 Hz to Nyquist</option><option value="linear">Linear · DC to Nyquist</option></select></label><label>Display floor<select aria-label="Spectrogram display floor" value={floor} onChange={e=>setFloor(Number(e.target.value))}>{[-60,-80,-100,-120].map(v=><option value={v} key={v}>{v} dBFS</option>)}</select></label><button className="hapa-btn" onClick={()=>onCue(from/sr)}>Cue window start</button></div>
  {loading&&<p role="status">Loading saved spectrum…</p>}
  {error&&<div role="alert"><p>{error}</p><button className="hapa-btn" onClick={()=>setReload(v=>v+1)}>Retry spectrum</button></div>}
  {!loading&&!error&&data&&!data.frames.length&&<p>No spectral snapshots in this range. No inference of silence.</p>}
  {data?.frames.length>0&&<><canvas ref={canvas} width="960" height="300" style={{width:'100%',height:'auto',display:'block',marginTop:16}} role="img" aria-label={`${asset.role}, source channel ${channel+1}, ${timeLabel(from/sr)} to ${timeLabel(to/sr)}, ${scale==='log'?'20 Hz':'DC'} to ${sr/2} Hz; dark is ${floor} dBFS or lower, light is 0 dBFS`}/><div style={{display:'flex',alignItems:'center',gap:12}}><span>{floor} dBFS</span><span aria-hidden="true" style={{height:12,flex:1,background:'linear-gradient(to right,rgb(4,8,20),rgb(57,17,98),rgb(150,30,101),rgb(240,96,58),rgb(255,237,168))'}}/><span>0 dBFS</span></div><p>Peak FFT-bin amplitude per frequency band; not loudness or spectral power density. {data.frame_count} source snapshots · {(data.hop_samples/sr*1000).toFixed(2)} ms between centers · {(data.fft_size/sr*1000).toFixed(2)} ms Hann window. {scale==='log'?'Below 20 Hz is hidden in this view.':''}</p>{data.sparse_snapshots&&<p>Coarse overview: gaps between FFT windows are unsampled. Wider colored cells show the nearest snapshot; they do not fill those gaps with new measurements.</p>}{data.truncated&&<p>This query is paginated. Shorten the window or use API/CLI pagination for remaining snapshots.</p>}<details><summary>Source, method and display limits</summary><p style={{overflowWrap:'anywhere'}}>Source {data.source_sha256} · timeline {data.timeline_id}</p><p>{data.normalization}. Centered at exact source samples; zero padding at file edges attenuates edge-window values. No resampling, downmix, source gain change or timing shift.</p><ul>{data.display_limitations.map(s=><li key={s}>{s}</li>)}</ul><p>Encoded at 0.5 dB per step. Silence is shown at the display floor; a floor-colored band can also contain quieter energy.</p><a className="hapa-btn" href={`${base}/api/echos/audio-atlas/jobs/${runId}/query?op=spectrogram&asset=${encodeURIComponent(asset.id)}&start=${from}&end=${to}&channel=${channel}&limit=1000`} target="_blank" rel="noreferrer">Open spectral evidence</a></details></>}
 </section>;
}
