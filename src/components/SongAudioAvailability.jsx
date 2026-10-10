import { useCallback, useEffect, useState } from 'react';
import './SongAudioAvailability.css';
import { createAtlasClient } from '../domain/audio-atlas-ui.js';
const base=import.meta.env.VITE_API_BASE||'';
const client=createAtlasClient(base);
export function useSongAudioInventory(){
 const [state,setState]=useState({status:'loading',songs:{},summary:null,error:''});
 const refresh=useCallback(async()=>{
  setState(old=>({...old,status:'loading',error:''}));
  try{
   await client.connect();
   const result=await client.request('/inventory');
   setState({status:'ready',songs:Object.fromEntries(result.songs.map(s=>[s.id,s])),summary:result.summary,checkedAt:result.checked_at,error:''});
  }catch(e){setState(old=>({...old,status:'error',error:e.message}));}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 return {...state,refresh};
}
const symbols={available:'✓',missing:'✕',partial:'◐',unresolved:'?',unreadable:'!',invalid:'!',loading:'…'};
export default function SongAudioAvailability({entry,details=false,loading=false,error=''}){
 const items=[['WAV',entry?.wav],['MP3',entry?.mp3],['WAV stems',entry?.wav_stems],['MP3 stems',entry?.mp3_stems]];
 return <div className="song-audio-availability" aria-label="Local song audio files">
  <div className="song-audio-badges">{items.map(([label,result])=>{
   const state=loading?'loading':error?'unreadable':result?.state||'unresolved';
   const count=label.endsWith('stems')&&result?` ${result.present}/${result.expected||'?'}`:'';
   const description=`${label}: ${state}${count}${result?.missing_roles?.length?' · Missing: '+result.missing_roles.join(', '):''}${result?.reason?' · '+result.reason:''}${error?' · '+error:''}`;
   return <span key={label} className="song-audio-badge" data-state={state} title={description} aria-label={description}>{symbols[state]} {label}{count} · {state==='available'?'Found':state==='missing'?'Missing':state==='loading'?'Checking':state==='partial'?'Incomplete':state==='unresolved'?'Not checked':'Check failed'}</span>;
  })}</div>
  {details&&entry&&<div className="song-audio-details"><p>Checked {new Date(entry.checked_at).toLocaleTimeString()}. Local files and headers checked; full decoding and original WAV quality are not certified.</p>
   {items.map(([label,result])=><div key={label}><strong>{label}: </strong>{result?.state}{result?.reason&&` — ${result.reason}`}
    {result?.missing_roles?.length>0&&<p>Missing {label}: {result.missing_roles.join(', ')}</p>}
    {result?.files?.map(f=><div key={f.path}>{f.path}</div>)}
   </div>)}
  </div>}
 </div>;
}
