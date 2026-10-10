import React,{useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LivingLightWorkspace from '../../src/components/LivingLightWorkspace.jsx';
function Proof(){
 const audioRef=useRef({currentTime:0,paused:true}),[time,setTime]=useState(0);
 const input=useMemo(()=>{
  const sourceHash='a'.repeat(64),pcmSha256='b'.repeat(64);
  return {receipt:{sourceHash,pcmSha256,fidelity:'source-equivalent-ffmpeg-decoded-float32',sampleRate:48000,channels:2,durationSeconds:20},performance:{schemaVersion:'hapa.echo.music-performance.v1',version:'absolute-song-time-1',sourceSchemaVersion:'hapa.stem-telemetry-bundle.v1',songId:'fixture:song',masterAudioHash:sourceHash,fingerprint:'sha256:'+'c'.repeat(64),durationSeconds:20,timebase:{origin:'selected-master-presentation-zero',unit:'seconds'},buses:[{id:'master',role:'master',audioHash:sourceHash,sourceSampleRate:48000,sourceChannels:2,analysisSampleRate:24000,durationSeconds:20,originStatus:'verified',originSeconds:0,analyzer:{version:'hapa.stem-telemetry.numpy-rfft-events-cache.v6',envelopeFps:30,sampleRate:24000},normalization:{method:'per-input-p99-clamp',rmsP99:.5},frames:Array.from({length:600},(_,i)=>({t:Number((i/30).toFixed(8)),rms:Number((i/600).toFixed(5)),rawRms:i/1200,silence:false}))}]}};
 },[]);
 return <main><p>Synthetic native rendering proof: prepared measurements and clock are fixtures. No album playback, analysis, real decoded-source qualification or human approval.</p><div>{[0,6,10,13.999,14,20].map(t=><button key={t} onClick={()=>{audioRef.current.currentTime=t;setTime(t);}}>Seek fixture {t}s</button>)}<span role="status">Fixture clock {time}s</span></div><LivingLightWorkspace songId="fixture:song" title="Synthetic native Location tour" duration={20} audioRef={audioRef} audioReceipt={input.receipt} preparedPerformance={input.performance} powerMode="active"/></main>;
}
createRoot(document.getElementById('root')).render(<Proof/>);
