import {useEffect,useMemo,useRef,useState} from 'react';
import {paintEchoCampfireRecording} from '../domain/echo-campfire-recording.js';
import {buildEchoCampfirePreviewPacket} from '../domain/echo-campfire-preview.js';
import {loadEchoCampfireSpectrum} from './echo-campfire-spectrum-client.js';
import {createCampfireClockAdapter} from '../../vendor/campfire-stage/src/echo/clock-stage-adapter.js';

// A replacement preview must wait for its predecessor's GPU stage to finish
// closing, even across React unmount/remount. Failed cleanup blocks successors.
let previousTeardown=Promise.resolve();
// Echo retains transport, audio, lyrics and live recording. Campfire supplies
// its existing painted surface; it never starts a second stage for capture.
export default function EchoCampfirePreview({songId,dust,audioReceipt,audioRef,clockRef,apiBase='',width=640,height=360,onState=()=>{},captureRef}){
 const canvas=useRef(null),[message,setMessage]=useState('Preparing Campfire…'),[phase,setPhase]=useState('loading'),callback=useRef(onState);callback.current=onState;
 const prepared=useMemo(()=>{
  try{return buildEchoCampfirePreviewPacket(dust,songId);}
  catch(error){return {packet:null,message:error.message};}
 },[songId,dust.score,dust.timeline,dust.direction,dust.settings,dust.saved,dust.currentLyricLines,dust.dirty,dust.savedInvalid,dust.validation,dust.status,dust.message]);
 const packet=prepared.packet;
 const source=String(audioReceipt?.sourceHash||'').replace(/^sha256:/,'').toLowerCase();
 const master=String(packet?.timeline?.source?.sourceSha256||'').toLowerCase();
 const sourceKind=audioReceipt?.sourceSelection?.kind||'master';
 const identity=packet?`score-scenes-v1:${packet.timeline.source.songId}:${master}:${packet.sourceRevision}:${packet.score.fingerprint}:${width}x${height}`:'';
 useEffect(()=>{
  let alive=true,stage=null,frame=0,pending=null,lastStatus='',predecessorError=null;const abort=new AbortController();
  let hasPicture=false,captureError=null;
  const captureSource={draw:(context,time,w,h)=>paintEchoCampfireRecording(context,{canvas:canvas.current,ready:alive&&hasPicture,error:captureError},w,h)};
  if(captureRef)captureRef.current=captureSource;
  const predecessor=previousTeardown;let release,rejectRelease;
  previousTeardown=new Promise((resolve,reject)=>{release=resolve;rejectRelease=reject;});
  previousTeardown.catch(()=>{});
  const report=(status,text)=>{if(status==='error'||status==='unavailable')captureError=text;const signature=`${status}:${text}`;if(!alive||signature===lastStatus)return;lastStatus=signature;setPhase(status);setMessage(text);callback.current({status,message:text});};
  const fail=text=>report('unavailable',text);
  report('loading','Preparing Campfire…');
  const startup=(async()=>{
   try{await predecessor;}catch(error){predecessorError=error;throw error;}
   if(!alive)return;
   if(!packet){fail(prepared.message);return;}
   if(!source||source!==master||sourceKind==='stem'){fail('Campfire needs the matching master recording.');return;}
   report('loading','Preparing Campfire…');
   const spectrum=await loadEchoCampfireSpectrum(packet,{apiBase,signal:abort.signal,onProgress:text=>report('loading',text)});
   if(!alive)return;
   stage=await createCampfireClockAdapter({packet,spectrum,width,height,fps:30,key:identity,canvas:canvas.current,reducedMotion:!!packet.playSettings?.reducedMotion,onStatus:value=>{
    if(canvas.current){canvas.current.dataset.requestedFrame=String(value.requestedFrame);canvas.current.dataset.presentedFrame=String(value.presentedFrame);canvas.current.dataset.stageStatus=value.status;}
    if(value.presentedFrame>=0)hasPicture=true;
    if(value.status==='error')report('error',value.message||'Campfire preview failed.');
    else if(value.status==='ready'){const warnings=[value.constructionNotice,...(value.pictureWarnings||[]).map(w=>`Fallback: ${w.assetId} (${w.reason})`)].filter(Boolean);report('ready',`Campfire preview · ${prepared.mode}${warnings.length?` · ${warnings.join('; ')}`:''}`);}
    else if(value.status==='catching-up'&&value.presentedFrame>=0&&value.requestedFrame-value.presentedFrame>30)report('catching-up','Campfire is rebuilding the requested song position…');
   }});
   if(!alive)return;
   const tick=()=>{if(!alive||!stage)return;const t=Number.isFinite(audioRef.current?.currentTime)?audioRef.current.currentTime:Number(clockRef.current)||0;
    try { const next=stage.request(Math.max(0,t));if(next!==pending){pending=next;next.catch(error=>report('error',error.message||'Campfire preview failed.'));} }
    catch(error){report('error',error.message||'Campfire preview failed.');return;}
    frame=requestAnimationFrame(tick);
   };tick();
  })();
  startup.catch(error=>{if(alive&&error.name!=='AbortError')report('error',error.message||'Campfire preview failed.');});
  return ()=>{alive=false;if(captureRef?.current===captureSource)captureRef.current=null;abort.abort();cancelAnimationFrame(frame);void (async()=>{try{await startup.catch(()=>{});if(predecessorError)throw predecessorError;if(stage)await stage.close();release();}catch(error){rejectRelease(error);}})();};
 },[packet,prepared.message,prepared.mode,identity,source,master,sourceKind,apiBase,width,height,audioRef,clockRef,captureRef]);
 return <><canvas ref={canvas} aria-label="Campfire stage preview" style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:3,pointerEvents:'none',display:(phase==='ready'||phase==='catching-up')?'block':'none'}}/><span role="status" style={{position:'absolute',left:8,bottom:8,zIndex:6,color:'#fff',background:'rgba(0,0,0,.75)',fontSize:11,padding:'4px 7px',pointerEvents:'none'}}>{message}</span></>;
}
