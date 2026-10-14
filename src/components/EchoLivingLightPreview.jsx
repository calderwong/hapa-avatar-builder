import {useEffect,useMemo,useRef,useState} from 'react';
import LivingLightRegistryProvider,{useLivingLightRegistry} from './LivingLightRegistryProvider.jsx';
import {resolveLivingLightJourneyMedia} from '../domain/living-light-media-resolution.js';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {createLivingLightFeatureCache} from '../domain/living-light-feature-cache.js';
import {createLivingLightPreparedInputResolver} from '../domain/living-light-prepared-input.js';
import {createEchoLivingLightPreview} from '../living-light/director-preview.js';
import {createLivingLightPreviewDriver} from '../living-light/preview-driver.js';
const EMPTY=Object.freeze([]);
export function EchoLivingLightPreviewSurface({project,audioRef,clockRef,currentTime,active=true,clean=false,audioReceipt,preparedPerformance,mediaSources=EMPTY,client:injectedClient,registryResolver,onFrame,onPreviewState,captureRef}){
 const observerRef=useRef();observerRef.current={onFrame,onPreviewState};
 const catalog=useLivingLightRegistry(),resolverRef=useRef();resolverRef.current=registryResolver||catalog?.ensure;
 const canvasRef=useRef(),driverRef=useRef(),stateRef=useRef(null),[state,setState]=useState({state:'inactive'}),[hold,setHold]=useState(()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false);
 const [retry,setRetry]=useState(0);
 const holdRef=useRef(hold);holdRef.current=hold;
 const client=useMemo(()=>injectedClient||createLivingLightClient(),[injectedClient]);
 const cuesKey=JSON.stringify(project?.living_light_cues||[]),songId=project?.song_id,durationUs=Math.round(Number(project?.duration)*1e6);
 useEffect(()=>{
  if(!active||!canvasRef.current)return;
  const cache=createLivingLightFeatureCache(),controller=new AbortController();let driver,host;
  const prepareInput=createLivingLightPreparedInputResolver({songId,playbackReceipt:audioReceipt,performance:preparedPerformance,request:client.request,cache,signal:controller.signal});
  const update=value=>{stateRef.current=value;setState(value);observerRef.current.onPreviewState?.(value);};
  update({state:'loading',message:'Preparing saved Journey cues…'});
  try{
   host=createEchoLivingLightPreview({canvas:canvasRef.current,cues:JSON.parse(cuesKey),songId,durationUs,mediaSources,
    resolveMedia:(journey,{signal})=>resolveLivingLightJourneyMedia(journey,{sources:mediaSources,request:client.request,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])}),
    resolveJourney:(ref,options)=>client.request('/journeys/'+encodeURIComponent(ref.journeyId)+'/revisions/'+encodeURIComponent(ref.revisionId),{signal:AbortSignal.any([options.signal,AbortSignal.timeout(30000)])}),
    resolveRegistry:journey=>resolverRef.current(journey.instances.map(instance=>instance.thingRef)),
    prepareInput,onState:update,onFrame:value=>observerRef.current.onFrame?.(value),onInvalidate:()=>driver?.redraw()});
   const readFrame=()=>{
    const audio=audioRef?.current,rect=canvasRef.current.getBoundingClientRect(),scale=Math.min(1,1280/Math.max(1,rect.width),1280/Math.max(1,rect.height));
    return {timelineUs:Math.max(0,Math.round(Number(audio?.currentTime??clockRef?.current??0)*1e6)),playing:!!audio&&!audio.paused&&!audio.ended,reducedMotion:holdRef.current,quality:'balanced',viewport:{width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round(rect.height*scale))}};
   };
   driver=createLivingLightPreviewDriver({canvas:canvasRef.current,runtime:host,getAudio:()=>audioRef?.current,getFrame:readFrame,onError:error=>update({state:'unavailable',cueId:stateRef.current?.cueId,message:error.message})});driverRef.current=driver;
   if(captureRef)captureRef.current={start:()=>driver.setExternalClock(true),stop:()=>driver.setExternalClock(false),draw:(context,time,width,height)=>host.capture({...readFrame(),timelineUs:Math.round(time*1e6),viewport:{width:Math.max(1,Math.round(width*Math.min(1,1280/Math.max(width,height)))),height:Math.max(1,Math.round(height*Math.min(1,1280/Math.max(width,height))))}},source=>context.drawImage(source,0,0,width,height))};
  }catch(error){update({state:'unavailable',message:error.message});host?.dispose();}
  return()=>{controller.abort();if(captureRef)captureRef.current=null;driver?.dispose();host?.dispose();cache.dispose();if(driverRef.current===driver)driverRef.current=null;};
 },[active,cuesKey,songId,durationUs,client,mediaSources,audioReceipt,preparedPerformance,retry,captureRef]);
 useEffect(()=>{driverRef.current?.redraw();},[currentTime,hold]);
 const visible=active&&state.state!=='inactive';
 return <div data-testid="echo-living-light-preview" data-state={active?state.state:'inactive'} data-cue-id={state.cueId||''} style={{position:'absolute',inset:0,zIndex:3,display:visible?'block':'none',background:'#020617',pointerEvents:'none'}}>
  <canvas ref={canvasRef} aria-label="Living Light Director scene" style={{width:'100%',height:'100%',display:'block',visibility:state.state==='ready'?'visible':'hidden'}}/>
  {(!clean||state.state!=='ready')&&<div role="status" style={{position:'absolute',top:8,left:8,right:8,fontSize:12,color:'#e2e8f0',textShadow:'0 1px 3px #000'}}>{state.message}{state.state==='unavailable'&&<button style={{pointerEvents:'auto',marginLeft:8}} onClick={()=>setRetry(value=>value+1)}>Retry scene</button>}</div>}
  {!clean&&<label style={{position:'absolute',right:8,bottom:8,color:'#fff',fontSize:12,pointerEvents:'auto',background:'#020617b8',padding:4}}><input type="checkbox" checked={hold} onChange={event=>setHold(event.target.checked)}/> Hold motion</label>}
 </div>;
}
export default function EchoLivingLightPreview(props){return props.project?.living_light_cues?.length?<LivingLightRegistryProvider><EchoLivingLightPreviewSurface {...props}/></LivingLightRegistryProvider>:null;}
