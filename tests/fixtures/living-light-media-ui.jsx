import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LivingLightMediaControls from '../../src/components/LivingLightMediaControls.jsx';
import {createLivingLightRuntime} from '../../src/living-light/runtime.js';
import {createLivingLightPreviewDriver} from '../../src/living-light/preview-driver.js';
import {createLivingLightRegistry} from '../../src/living-light/registry.js';
import {newJourneyDraft,editJourneyDraft,useJourneyPassage} from '../../src/domain/living-light-journey.js';
import {livingLightCutMedia} from '../../src/domain/living-light-media.js';
const registry=createLivingLightRegistry(),ref=t=>({thingId:t.thingId,revisionId:t.revisionId});
function Proof(){
 const [a,setA]=useState(''),[b,setB]=useState(''),[sourceInput,setSourceInput]=useState([]),[draft,setDraft]=useState(()=>newJourneyDraft({songId:'fixture:song',title:'Painted surface proof',durationUs:20000000,thing:registry.entries.find(t=>t.capabilities.continuous)},registry)),[selected,setSelected]=useState(null),[study,setStudy]=useState(draft),[message,setMessage]=useState('No source loaded'),[evidence,setEvidence]=useState(null),[mounted,setMounted]=useState(true);
 const canvas=useRef(),runtime=useRef(),driver=useRef(),clock=useRef({time:0,playing:false,started:0,hold:false});
 const sources=useMemo(()=>livingLightCutMedia({song_id:'fixture:song',timeline:sourceInput.map((uri,i)=>({id:'shot:'+i,media_id:'fixture:clip:'+i,media_uri:uri,media_title:'Clip '+(i+1)}))}),[sourceInput]);
 const instance=draft.instances.find(i=>i.instanceId===selected)||draft.instances[0],thing=registry.resolveThing(instance.thingRef);
 useEffect(()=>{
  if(!mounted)return;
  const r=createLivingLightRuntime({canvas:canvas.current,registry,mediaSources:sources,onMediaChange:()=>{driver.current?.redraw();setMessage(r.diagnostics().media.map(e=>e.message).join(' · '));}});runtime.current=r;
  try{r.prepare({journeyRevision:{...study,journeyId:'fixture:journey',revisionId:'fixture:revision',parentRevisionId:null},sourceBinding:{songId:'fixture:song',durationUs:20000000},generation:1,neutralStudy:true});driver.current=createLivingLightPreviewDriver({canvas:canvas.current,runtime:r,getAudio:()=>null,getFrame:()=>({timelineUs:Math.round((clock.current.playing?(clock.current.time+(performance.now()-clock.current.started)/1000)%20:clock.current.time)*1e6),playing:clock.current.playing,reducedMotion:clock.current.hold,viewport:{width:800,height:450}}),onError:e=>setMessage(e.message)});setMessage('Native preview prepared');}catch(e){setMessage(e.message);}
  return()=>{driver.current?.dispose();r.dispose();driver.current=null;runtime.current=null;};
 },[study,sources,mounted]);
 const seek=t=>{clock.current.time=t;clock.current.started=performance.now();driver.current?.redraw();};
 function tour(){const d=useJourneyPassage(null,{mode:'new',songId:'fixture:song',durationUs:20000000,title:'Portal and passage proof',fromRef:ref(registry.entries.find(t=>t.source.moduleId==='solar-reliquary')),toRef:ref(registry.entries.find(t=>t.source.moduleId==='tidal-observatory')),passageRef:ref(registry.entries.find(t=>t.source.moduleId==='media-weave'))},registry).draft;setDraft(d);setStudy(d);setSelected(d.instances[0].instanceId);seek(0);}
 return <main style={{fontFamily:'sans-serif',background:'#101624',color:'#fff',padding:20}}><h1>Painted Journey proof</h1><p>Isolated UI fixture: supplied local clip routes, synthetic clock, real native renderer and production placement controls. No owner-store writes or album playback claims.</p><label>Clip A URI <input aria-label="Clip A URI" value={a} onChange={e=>setA(e.target.value)}/></label><label>Clip B URI <input aria-label="Clip B URI" value={b} onChange={e=>setB(e.target.value)}/></label><button onClick={()=>setSourceInput([a,b].filter(Boolean))}>Load supplied sources</button>
 <div>{[0,2,6,10,14,19].map(t=><button key={t} onClick={()=>seek(t)}>Seek {t}s</button>)}<button onClick={()=>{clock.current.playing=!clock.current.playing;clock.current.started=performance.now();driver.current?.redraw();}}>Toggle playback</button><button onClick={()=>{clock.current.hold=!clock.current.hold;driver.current?.redraw();}}>Hold / release motion</button><button onClick={()=>setEvidence(runtime.current?.diagnostics()||{disposed:true})}>Inspect</button><button onClick={()=>setMounted(!mounted)}>{mounted?'Leave preview':'Return to preview'}</button><button onClick={tour}>New portal tour</button></div>
 {mounted&&<canvas ref={canvas} style={{width:800,maxWidth:'100%',height:450}}/>}<p role="status">{message}</p>
 <div>{draft.instances.map(i=><button key={i.instanceId} onClick={()=>setSelected(i.instanceId)}>{registry.resolveThing(i.thingRef).title}</button>)}</div>
 <LivingLightMediaControls {...{thing,sources}} instanceId={instance.instanceId} slots={draft.mediaSlots} onChange={(surfaceId,placement)=>{try{setDraft(editJourneyDraft(draft,{type:'media',instanceId:instance.instanceId,surfaceId,placement},registry));setMessage('Draft applied; study to preview');}catch(e){setMessage(e.message);}}}/><button onClick={()=>setStudy(structuredClone(draft))}>Study draft</button><pre>{JSON.stringify(evidence,null,2)}</pre></main>;
}
const root=createRoot(document.getElementById('root'));root.render(<Proof/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
