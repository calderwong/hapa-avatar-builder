import {useEffect,useMemo,useState} from 'react';
import {createAtlasClient,timeLabel} from '../domain/audio-atlas-ui.js';

export default function AtlasTextSearch({runId,base,onCue}){
 const {request}=useMemo(()=>createAtlasClient(base),[base]);
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[value,setValue]=useState(null),[history,setHistory]=useState([]);
 const route=`/jobs/${runId}/text-search`;
 const refresh=async()=>{const r=await request(route);setHistory(r.queries||[]);};
 useEffect(()=>{let current=true;request(route).then(r=>{if(current)setHistory(r.queries||[]);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[request,route]);
 const pending=busy||history.some(q=>['queued','running'].includes(q.state));
 async function search(e){e.preventDefault();setBusy(true);setError('');setValue(null);
  try{setValue(await request(route,{method:'POST',body:JSON.stringify({text,limit:8}),signal:AbortSignal.timeout(135000)}));}
  catch(e){setError(`${e.message}. Check saved searches before retrying; a lost connection does not establish cancellation.`);}
  finally{setBusy(false);try{await refresh();}catch(e){setError(e.message);}}
 }
 return <section aria-label="Search audio by description"><h3>Describe a sound</h3>
  <p>Search this saved song’s Master audio with your own description, such as “soft guitar under a singing voice”. English relevance is not yet qualified. Each result covers up to ten seconds.</p>
  <form onSubmit={search}><div className="atlas-actions"><label style={{flex:1}}>Sound description<input aria-label="Sound description" value={text} maxLength={500} onChange={e=>setText(e.target.value)} placeholder="Describe what you want to hear" disabled={busy}/></label><button className="hapa-btn atlas-primary" type="submit" disabled={pending||!text.trim()}>{busy?'Encoding & searching locally…':'Encode & search locally'}</button></div></form>
  {pending&&<div className="atlas-actions"><p role="status">Local search may take up to two minutes. Your audio index is reused.</p><button className="hapa-btn" onClick={async()=>{try{await request(route,{method:'DELETE'});await refresh();}catch(e){setError(e.message);}}}>Cancel text search</button></div>}
  {error&&<p role="alert">{error}</p>}
  {value?.matches&&<><p role="status">Results for “{value.query}” · {value.loaded_from_history?'saved result loaded':value.cache_hit?'saved result reused':'local encoding complete'}. Cosine similarity is not a probability or verified sound label.</p><div className="atlas-sound-results">{value.matches.map(m=><button className="hapa-btn" key={m.id} onClick={()=>onCue(m.start_sample/value.sample_rate_hz)}><strong>{timeLabel(m.start_sample/value.sample_rate_hz)}–{timeLabel(m.end_sample/value.sample_rate_hz)}</strong><span>Cue passage · similarity {m.score.toFixed(3)}</span></button>)}</div><details style={{overflowWrap:'anywhere'}}><summary>Search evidence</summary><p>Master source: {value.source_sha256}</p><p>Model space: {value.embedding_space}</p><p>Prompt: {value.prompt}</p><p>Model tokens: {value.token_count}. Saved search: {value.id}. Retrieval quality awaits listening review.</p></details></>}
  <details><summary>Saved text searches · {history.length}</summary><button className="hapa-btn" onClick={()=>refresh().catch(e=>setError(e.message))}>Refresh saved searches</button>{history.length===0&&<p>No text searches saved for this run.</p>}<div className="atlas-sound-results">{history.map(q=><button className="hapa-btn" key={q.id} disabled={busy} onClick={async()=>{setError('');try{const r=await request(`${route}?id=${q.id}`);setValue({...r,loaded_from_history:true});setText(q.query);if(r.state!=='complete')setError(r.error||`Search is ${r.state}. No completed results.`);}catch(e){setError(e.message);}}}>{q.query} · {q.state}</button>)}</div></details>
 </section>;
}
