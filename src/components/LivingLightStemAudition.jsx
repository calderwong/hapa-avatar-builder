import {useEffect,useState} from 'react';
/** Select one exact registered asset. Header availability is not decode or
 * alignment proof; preparation owns decoding after an explicit choice. */
export default function LivingLightStemAudition({songId,audioRef,audition}){
 const [stems,setStems]=useState([]),[status,setStatus]=useState('Loading stem sources…'),[sourceSeconds,setSourceSeconds]=useState(0),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();let active=true;setStems([]);setStatus('Loading stem sources…');
  fetch('/api/echos/living-light/catalog?'+new URLSearchParams({songId}),{signal:controller.signal,cache:'no-store'})
   .then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.message||body.error||'Stem sources could not load');const song=body.songs?.find(row=>row.songId===songId);if(!song||body.songs.length!==1)throw Error('Stem catalog does not match the selected Song');if(active){setStems(song.stems);setStatus(song.stems.length?'':'No registered individual stems for this song. Master playback remains available.');}})
   .catch(error=>{if(active)setStatus('Stem sources could not load: '+error.message);});
  return()=>{active=false;controller.abort();};
 },[songId,retry]);
 useEffect(()=>{const audio=audioRef.current;const update=()=>setSourceSeconds(Number(audio?.currentTime||0));update();audio?.addEventListener('timeupdate',update);return()=>audio?.removeEventListener('timeupdate',update);},[audition.assetId,audition.ready,audition.busy]);
 return <fieldset className="living-light-stem-audition"><legend>Listen to a stem</legend>
  <label>Playback source <select aria-label="Living Light playback source" value={audition.assetId||''} onChange={event=>audition.onSelect(event.target.value||null)}>
   <option value="">Song master</option>{stems.map(stem=><option key={stem.assetId} value={stem.assetId} disabled={stem.state!=='available'}>{stem.declaredRole} · {stem.assetId} · {stem.state}</option>)}
  </select></label>
  {status&&<p role="status">{status}</p>}{status.startsWith('Stem sources could not')&&<button type="button" onClick={()=>setRetry(value=>value+1)}>Retry stem list</button>}
  {audition.assetId&&<><p>Source-local audition · song and recipe held at {audition.heldSongSeconds.toFixed(2)}s. Returning to Song master restores that position, paused. Alignment is unverified.</p>
   <label>Stem position <input aria-label="Stem audition position" type="range" min="0" max={audition.durationSeconds||0} step="0.01" value={Math.min(sourceSeconds,audition.durationSeconds||0)} disabled={!audition.ready||audition.busy} onChange={event=>{if(audioRef.current){audioRef.current.currentTime=Number(event.target.value);setSourceSeconds(Number(event.target.value));}}}/></label><span>{sourceSeconds.toFixed(2)}s / {(audition.durationSeconds||0).toFixed(2)}s</span>
   <button type="button" onClick={()=>audition.onSelect(null)}>Return to song master</button></>}
  {audition.busy&&<p role="status">Preparing selected source for precise seeking…</p>}{audition.error&&<p role="alert">{audition.error}</p>}
 </fieldset>;
}
