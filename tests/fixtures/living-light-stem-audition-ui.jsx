import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LivingLightWorkspace from '../../src/components/LivingLightWorkspace.jsx';
import {prepareEchoAudioPlayback} from '../../src/domain/echo-audio-playback.js';
import {transitionLivingLightAudition} from '../../src/domain/living-light-audition.js';
function Proof(){
 const audioRef=useRef(null),clockRef=useRef(0),selectionRef=useRef(null),restoreRef=useRef(0);
 const [selection,setSelection]=useState(null),[url,setUrl]=useState('/master.wav'),[receipt,setReceipt]=useState(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[songTime,setSongTime]=useState(0);
 const assetId=selection?.assetId||null;
 function select(assetId){audioRef.current?.pause();const next=transitionLivingLightAudition(selectionRef.current,{songId:'fixture:song',assetId,songSeconds:clockRef.current});selectionRef.current=next;restoreRef.current=next.restoreSeconds;setSelection(next);setReady(false);setUrl('');}
 useEffect(()=>{
  if(!assetId){setUrl('/master.wav');setReceipt(null);setBusy(false);return;}
  const controller=new AbortController();let active=true;setBusy(true);setError('');setReceipt(null);
  prepareEchoAudioPlayback({songId:'fixture:song',assetId,signal:controller.signal}).then(value=>{if(active){setReceipt(value.receipt);setUrl(value.url);setBusy(false);}}).catch(error=>{if(active){setBusy(false);setError(error.message);}});
  return()=>{active=false;controller.abort();};
 },[assetId]);
 return <main><p>Synthetic source-local audition proof. The real decoder and player handle disposable WAV fixtures; this does not qualify album alignment, full Hapa Echo delivery or human acceptance.</p>
  <button onClick={()=>{if(audioRef.current&&!assetId){audioRef.current.pause();audioRef.current.currentTime=7.5;clockRef.current=7.5;setSongTime(7.5);}}}>Seek master to 7.5s</button>
  <p data-testid="audition-proof-clock">Song clock {songTime.toFixed(2)}s · source {assetId||'master'} · {ready?'ready':'loading'}</p>
  {url&&<audio muted key={url} ref={audioRef} src={url} data-testid="audition-proof-player" data-asset-id={assetId||'master'} data-source-hash={receipt?.sourceHash||''} data-pcm-hash={receipt?.pcmSha256||''} onLoadedMetadata={()=>{if(audioRef.current)audioRef.current.currentTime=restoreRef.current;}} onLoadedData={()=>setReady(true)} onTimeUpdate={()=>{if(!selectionRef.current?.assetId){clockRef.current=audioRef.current?.currentTime||0;setSongTime(clockRef.current);}}}/>}
  <LivingLightWorkspace songId="fixture:song" title="Synthetic stem audition" duration={20} audioRef={audioRef} audioReceipt={{durationSeconds:20}} songClockRef={clockRef} powerMode="active" audition={{assetId,heldSongSeconds:selection?.heldSongSeconds||0,busy,ready,error,durationSeconds:receipt?.durationSeconds||0,onSelect:select}}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<Proof/>);
