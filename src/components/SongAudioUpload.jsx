import {useEffect,useId,useRef,useState} from 'react';
import {createAtlasClient} from '../domain/audio-atlas-ui.js';
import {AUDIO_SLOTS,STEM_ROLES,stemRoleKey,suggestStemRole,uploadFileError,slotStatus} from '../domain/song-audio-upload.js';
import './SongAudioUpload.css';
const client=createAtlasClient(import.meta.env.VITE_API_BASE||'');

/** Parent keys by song ID: a staged batch can never migrate to another song. */
export default function SongAudioUpload({songId,title,onSaved}){
 const [opened,setOpened]=useState(false),[snapshot,setSnapshot]=useState(null),[queue,setQueue]=useState([]),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[drag,setDrag]=useState('');
 const live=useRef(true),saving=useRef(false),roleListId=useId();
 const route=`/songs/${encodeURIComponent(songId)}/files`;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function refresh(){
  setError('');setStatus('Checking this song’s files…');
  try{const next=await client.request(route);if(live.current){setSnapshot(next);setStatus('');}return next;}
  catch(e){if(live.current){setError(e.message);setStatus('');}return null;}
 }
 useEffect(()=>{if(opened&&!snapshot)void refresh();},[opened]);
 useEffect(()=>{if(!busy)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 const roles=[...new Set([...(snapshot?.inventory?.wav_stems?.roles||[]).map(r=>r.role),...STEM_ROLES])];
 function stage(files,slot){
  if(saving.current)return;
  const selected=Array.from(files);setError('');setStatus('');
  if(!selected.length)return;
  if(slot.kind==='master'&&selected.length>1){setError('Add one full-song file per format. Use a stems area for multiple files.');return;}
  if(queue.length+selected.length>48){setError('Upload up to 48 files in one batch.');return;}
  const invalid=selected.map(f=>uploadFileError(f,slot,snapshot?.maxBytes)).find(Boolean);if(invalid){setError(invalid);return;}
  if(slot.kind==='master'&&queue.some(q=>q.slot.key===slot.key)){setError('A full-song file in this format is already queued. Remove it first to choose another.');return;}
  setQueue(old=>[...old,...selected.map(file=>({id:crypto.randomUUID(),file,slot,role:slot.kind==='stem'?suggestStemRole(file.name,roles):'',replace:false,state:'ready'}))]);
 }
 const patch=(id,values)=>setQueue(old=>old.map(q=>q.id===id?{...q,...values}:q));
 const existing=q=>q.slot.kind==='master'?snapshot?.inventory[q.slot.format]?.state==='available':snapshot?.inventory[q.slot.key]?.roles.some(r=>stemRoleKey(r.role)===stemRoleKey(q.role)&&r.state==='available');
 const pending=queue.filter(q=>q.state!=='saved');
 const identities=pending.map(q=>q.slot.key+':'+stemRoleKey(q.role));
 const duplicate=new Set(identities).size!==identities.length;
 const ready=snapshot&&pending.length&&!duplicate&&pending.every(q=>(q.slot.kind!=='stem'||/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,79}$/.test(q.role))&&(!existing(q)||q.replace));
 async function save(){
  if(!ready||saving.current)return;saving.current=true;setBusy(true);setError('');
  let revision=snapshot.revision,saved=0;
  try{
   await client.connect();
   for(const q of pending){
    if(!live.current)break;
    setStatus(`Saving ${saved+1} of ${pending.length}: ${q.file.name}… Keep this song open.`);patch(q.id,{state:'saving'});
    const params=new URLSearchParams({kind:q.slot.kind,format:q.slot.format,role:q.role,filename:q.file.name,revision,replace:String(q.replace)});
    try{
     const result=await client.request(`${route}?${params}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:q.file,signal:AbortSignal.timeout(300000)},false);
     revision=result.revision;saved++;if(live.current){setSnapshot(result);patch(q.id,{state:'saved'});}
    }catch(e){if(live.current)patch(q.id,{state:'ready'});throw e;}
   }
   if(live.current)setStatus(`Saved ${saved} ${saved===1?'file':'files'} to ${title||snapshot.title}. File indicators are updated.`);
  }catch(e){
   if(live.current){await refresh();setError(`${saved} files saved. ${e.message} Recheck the file indicators before retrying; saved files stay attached.`);setStatus('');}
  }finally{saving.current=false;if(live.current)setBusy(false);onSaved?.();}
 }
 return <details className="song-audio-upload" onToggle={e=>setOpened(e.currentTarget.open)}>
  <summary>Add audio files · WAV, MP3 & stems</summary>
  {opened&&<div className="song-audio-upload-body" aria-label={`Audio uploads for ${title||snapshot?.title||songId}`} aria-busy={busy}>
   <div className="song-audio-upload-heading"><div><h3>Audio files for {title||snapshot?.title||'this song'}</h3><p>Drop files below or choose them from your computer. Then review and save.</p></div><button type="button" disabled={busy} onClick={refresh}>Recheck song files</button></div>
   <div className="song-audio-drop-grid">{AUDIO_SLOTS.map(slot=>{const result=snapshot?.inventory[slot.key];return <div key={slot.key} className="song-audio-drop" data-drag={drag===slot.key} data-state={result?.state} onDragOver={e=>{e.preventDefault();if(!busy)setDrag(slot.key);}} onDragLeave={()=>setDrag('')} onDrop={e=>{e.preventDefault();setDrag('');stage(e.dataTransfer.files,slot);}}>
    <strong>{slot.label}</strong><span>{slotStatus(result,slot.kind==='stem')}</span>
    {result?.missing_roles?.length>0&&<small>Missing: {result.missing_roles.join(', ')}</small>}
    <label className="song-audio-pick">Drop {slot.kind==='stem'?'files':'a file'} here or <span>choose {slot.label}</span><input aria-label={`Choose ${slot.label}`} type="file" accept={slot.format==='wav'?'.wav,.wave':'.mp3'} multiple={slot.kind==='stem'} disabled={busy||!snapshot} onChange={e=>{stage(e.target.files,slot);e.target.value='';}} /></label>
   </div>;})}</div>
   <p className="song-audio-help">Up to 1 GiB per file. Select extracted stem files together; ZIP folders are not supported here. Counts cover registered roles, not an assumed stem set.</p>
   {queue.length>0&&<div className="song-audio-queue"><h4>Review files before saving to {title||snapshot?.title}</h4>{queue.map(q=><div className="song-audio-queued-file" key={q.id}>
    <div><strong>{q.file.name}</strong><small>{q.slot.label} · {(q.file.size/1024/1024).toFixed(1)} MB {q.state==='saved'?'· ✓ Saved':''}</small></div>
    {q.slot.kind==='stem'&&<label>Stem role<input aria-label={`Stem role for ${q.file.name}`} list={roleListId} value={q.role} maxLength={80} disabled={busy||q.state==='saved'} placeholder="Choose or type a role" onChange={e=>patch(q.id,{role:e.target.value,replace:false})} /></label>}
    {q.state!=='saved'&&existing(q)&&<label className="song-audio-replace"><input type="checkbox" checked={q.replace} disabled={busy} onChange={e=>patch(q.id,{replace:e.target.checked})} />Use this instead of the existing {q.slot.format.toUpperCase()} file (keep old copy)</label>}
    <button type="button" disabled={busy} aria-label={`Remove ${q.file.name} from queue`} onClick={()=>setQueue(old=>old.filter(row=>row.id!==q.id))}>{q.state==='saved'?'Dismiss':'Remove'}</button>
   </div>)}<datalist id={roleListId}>{roles.map(role=><option key={role} value={role}/>)}</datalist>
   {duplicate&&<p role="alert">Two queued files target the same role and format. Change a role or remove a duplicate.</p>}
   <button type="button" className="song-audio-save" disabled={busy||!ready} onClick={save}>{busy?'Saving audio files…':pending.length?`Save ${pending.length} ${pending.length===1?'file':'files'} to this song`:'All files saved'}</button></div>}
   {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="song-audio-upload-error">{error}</p>}
   <small className="song-audio-help">Files are copied into Builder’s local library. Existing sources and saved analysis remain intact; new analysis must be requested separately. Upload checks identify the file format, not its audio quality or alignment.</small>
  </div>}
 </details>;
}
