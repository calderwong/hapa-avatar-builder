import {useState} from 'react';
import {timeLabel} from '../domain/audio-atlas-ui.js';
export default function AtlasStructure({value,runId,base,onCue}){
 const [selected,setSelected]=useState('');
 if(!value)return <div className="atlas-content"><h3>Song structure</h3><p>This saved analysis has no structure measurements. Run a new local analysis from Analysis settings to add them.</p></div>;
 const rate=value.sample_rate_hz,seconds=sample=>sample/rate,regions=value.regions||[],region=regions.find(r=>r.id===selected)||regions[0];
 const peak=Math.max(.001,...value.frames.map(f=>f.novelty));
 const points=value.frames.map(f=>`${(f.sample/value.sample_count*900).toFixed(2)},${(75-f.novelty/peak*65).toFixed(2)}`).join(' ');
 const names=Object.fromEntries(regions.map(r=>[r.id,r]));
 return <div className="atlas-content atlas-structure"><h3>Song structure · Master</h3>
  <p>Explore changes in sound and passages with similar spectral patterns. Original analysis. These regions are candidates; verse, chorus and other musical roles have not been assigned.</p>
  <p>{value.boundaries.length} boundary candidates · {regions.length} acoustic regions · {value.repeat_candidates_total} similar-passage candidates</p>
  {value.boundaries.length===0&&<p>No distinct boundaries detected by this method. That does not establish a single-section song.</p>}
  <svg viewBox="0 0 900 85" preserveAspectRatio="none" role="img" aria-label="Acoustic novelty across the master: peaks indicate measured changes, not verified section boundaries" style={{width:'100%',height:85}}><polyline points={points} fill="none" stroke="var(--atlas-accent)" strokeWidth="1.5"/>{value.boundaries.map(b=><line key={b.sample} x1={b.sample/value.sample_count*900} x2={b.sample/value.sample_count*900} y1="0" y2="80" stroke="currentColor" opacity=".4"/>)}</svg>
  <small>Full song, 0:00 to {timeLabel(seconds(value.sample_count))}. Peaks show spectral/energy change; vertical lines mark selected boundary candidates.</small>
  {region&&<><div className="atlas-actions"><label>Acoustic region<select aria-label="Acoustic region" value={region.id} onChange={e=>setSelected(e.target.value)}>{regions.map(r=><option key={r.id} value={r.id}>{r.label} · {timeLabel(seconds(r.start_sample))}–{timeLabel(seconds(r.end_sample))}</option>)}</select></label><button className="hapa-btn" onClick={()=>onCue(seconds(region.start_sample))}>Cue region</button></div><p>{region.label}: {timeLabel(seconds(region.start_sample))}–{timeLabel(seconds(region.end_sample))}. Mean frame RMS {region.mean_rms_dbfs.toFixed(1)} dBFS. Musical role unknown.</p></>}
  <details><summary>Similar passages · {value.repeats.length} shown{value.repeat_candidates_truncated?' (top 24)':''}</summary>
    <p>Similarity compares 16 relative-time spectral/energy bins. It can confuse similar instrumentation with repetition; scores are not probabilities. Listen to both passages.</p>
    {value.repeats.length?value.repeats.map((r,i)=><div className="atlas-actions" key={`${r.left_id}:${r.right_id}`}><span>{i+1}. Similarity {r.similarity.toFixed(3)}</span><button className="hapa-btn" onClick={()=>onCue(seconds(names[r.left_id].start_sample))}>Listen to {names[r.left_id].label}</button><button className="hapa-btn" onClick={()=>onCue(seconds(names[r.right_id].start_sample))}>Compare {names[r.right_id].label}</button></div>):<p>No passage pairs met this method's threshold.</p>}
  </details>
  <details><summary>Transitions and energy changes · {value.transitions.length}</summary><p>Build, drop and break labels describe acoustic evidence; musical function still needs listening review.</p><div className="atlas-structure-transitions">{value.transitions.map((t,i)=><button className="hapa-btn" key={i} onClick={()=>onCue(seconds(t.start_sample))}>{timeLabel(seconds(t.start_sample))}–{timeLabel(seconds(t.end_sample))} · {t.kind.replaceAll('_',' ')} · {t.delta_db==null?`${t.rise_db.toFixed(1)} dB rise`:`${t.delta_db.toFixed(1)} dB change`}</button>)}</div></details>
  <details><summary>Method, evidence and limits</summary><p>{value.method}. Mono 8 kHz analysis, 250 ms grid, 512 ms centered spectral windows and four seconds of context on each side. Grid precision does not establish acoustic boundary accuracy.</p><ul>{value.limitations.map(t=><li key={t}>{t}</li>)}</ul><p>Source {value.source_sha256}. Original audio and Director cuts are unchanged.</p><a className="hapa-btn" href={`${base}/api/echos/audio-atlas/jobs/${runId}/query?op=structure&asset=master`} target="_blank" rel="noreferrer">Open structure evidence</a></details>
 </div>;
}
