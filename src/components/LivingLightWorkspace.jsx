import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import LivingLightRegistryProvider,{useLivingLightRegistry} from './LivingLightRegistryProvider.jsx';
import {createLivingLightRuntime} from '../living-light/runtime.js';
import {createLivingLightPreviewDriver} from '../living-light/preview-driver.js';
import LivingLightLibrary from './LivingLightLibrary.jsx';
import LivingLightJourneyEditor from './LivingLightJourneyEditor.jsx';
import LivingLightStemAudition from './LivingLightStemAudition.jsx';
import LivingLightSignals from './LivingLightSignals.jsx';
import {createLivingLightFeatureCache} from '../domain/living-light-feature-cache.js';
import {livingLightPreparedBinding,livingLightFeatureBytes} from '../domain/living-light-prepared-binding.js';
import './LivingLightWorkspace.css';
/** Lazy Echo workbench entry. This view never creates an audible source. */
function Workspace({songId,title,duration,audioRef,audioReceipt,preparedPerformance,powerMode,onPlayingChange,songClockRef,audition}) {
 const {registry,archivedThings}=useLivingLightRegistry(),canvasRef=useRef(null),runtimeRef=useRef(null),driverRef=useRef(null),generationRef=useRef(0);
 const [family,setFamily]=useState('fractal'),[quality,setQuality]=useState('balanced'),[signalMode,setSignalMode]=useState('neutral'),[reduced,setReduced]=useState(()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false),[status,setStatus]=useState('Preparing neutral study…'),[diagnostic,setDiagnostic]=useState(null),[studyRecipe,setStudyRecipe]=useState(null),[addRequest,setAddRequest]=useState(null);
 const [exactPerformance,setExactPerformance]=useState(null),featureCacheRef=useRef(null);
 const [journeyRefreshToken,setJourneyRefreshToken]=useState(0),[openJourneyRequest,setOpenJourneyRequest]=useState(null);
 const journeySaved=useCallback(()=>setJourneyRefreshToken(value=>value+1),[]);
 const acceptPerformance=useCallback(value=>setExactPerformance(value),[]);
 const selectedPerformance=exactPerformance?.songId===songId?exactPerformance:preparedPerformance;
 useEffect(()=>()=>{featureCacheRef.current?.dispose();featureCacheRef.current=null;},[]);
 const reducedRef=useRef(reduced),qualityRef=useRef(quality);reducedRef.current=reduced;qualityRef.current=quality;
 const studyingTour=studyRecipe?.songId===songId&&studyRecipe.mode==='tour';
 const selected=[...registry.entries,...archivedThings].find(t=>t.thingId===family)||[...registry.entries,...archivedThings].find(t=>t.variantKind==='continuous-profile'&&t.source.moduleId===family);
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas||powerMode==='hidden')return;
  const durationSeconds=Number(audioReceipt?.durationSeconds||duration);
  if(!songId||!selected||!Number.isFinite(durationSeconds)||durationSeconds<=0){setStatus('Choose a song with a known duration.');return;}
  const durationUs=Math.round(durationSeconds*1e6);
  const runtime=createLivingLightRuntime({canvas,registry});runtimeRef.current=runtime;let driver=null;
  const recipe=studyRecipe?.songId===songId?{...studyRecipe,journeyId:'ll109:study:'+songId,revisionId:'ll109:study-draft',parentRevisionId:null}:{schemaVersion:'hapa.living-light.journey.v1',journeyId:'ll109:study:'+songId,revisionId:'ll109:study-draft',parentRevisionId:null,title:title||songId,songId,sourceBindingRef:null,state:'draft-unresolved',mode:'continuous',seed:109,instances:[{instanceId:'ll109:study-instance',thingRef:{thingId:selected.thingId,revisionId:selected.revisionId},parameters:{},bindings:{}}],schedule:[{instanceId:'ll109:study-instance',startUs:0,endUs:durationUs}],actorTreatment:'none',mediaSlots:[]};
  setDiagnostic(null);
  try{
   if(!featureCacheRef.current)featureCacheRef.current=createLivingLightFeatureCache();
   const exactInput=signalMode==='basic'&&selectedPerformance?.sourcePolicy==='living-light-assets-v1'?{performance:selectedPerformance,playbackReceipt:audioReceipt,sourceBinding:livingLightPreparedBinding({songId,performance:selectedPerformance,playbackReceipt:audioReceipt}),cache:featureCacheRef.current,requiredBytes:livingLightFeatureBytes(selectedPerformance)}:undefined;
   runtime.prepare({journeyRevision:recipe,sourceBinding:{songId,durationUs,sourceHash:audioReceipt?.sourceHash||null,timelineEvidence:audioReceipt?'existing Echo playback receipt':'declared metadata only'},generation:++generationRef.current,neutralStudy:signalMode==='neutral',featureInput:exactInput,basicMasterInput:signalMode==='basic'&&!exactInput?{performance:selectedPerformance,playbackReceipt:audioReceipt}:undefined});
   setStatus(signalMode==='basic'?'Prepared response · recipe audio choices use exact sources; stem timing remains unverified':'Neutral study · saved audio choices are inactive');
   driver=createLivingLightPreviewDriver({canvas,runtime,getAudio:()=>audioRef.current,getFrame:()=>{
    const audio=audioRef.current,sourceSeconds=audition?.assetId?songClockRef?.current||0:audio?.currentTime||0,rect=canvas.getBoundingClientRect();
    return {timelineUs:Math.min(durationUs,Math.max(0,Math.round(sourceSeconds*1e6))),playing:!audition?.assetId&&!!audio&&!audio.paused&&!audio.ended,reducedMotion:reducedRef.current,quality:qualityRef.current,viewport:{width:Math.max(64,Math.min(1280,Math.round(rect.width))),height:Math.max(64,Math.min(720,Math.round(rect.height)))}};
   },onStatus:message=>setStatus(message),onError:error=>setStatus('Native preview failed: '+error.message)});
   driverRef.current=driver;setDiagnostic({...runtime.diagnostics(),preview:driver.diagnostics()});
  }catch(e){runtime.dispose();setStatus('Native preview unavailable: '+e.message);}
  return ()=>{driver?.dispose();runtime.dispose();if(driverRef.current===driver)driverRef.current=null;if(runtimeRef.current===runtime)runtimeRef.current=null;};
 },[songId,title,duration,audioReceipt?.sourceHash,audioReceipt?.pcmSha256,audioReceipt?.durationSeconds,selectedPerformance?.fingerprint,signalMode,family,studyRecipe,powerMode,registry,audition?.assetId]);
 // Motion preference changes keep the existing canvas; the source-time hold belongs to the runtime.
 // Avoid closing over a stale motion preference in the host's frame callback.
 useEffect(()=>{driverRef.current?.redraw();},[reduced,quality]);
 async function toggleAudio(){const audio=audioRef.current;if(!audio){setStatus('The selected audio is still preparing in Echo.');return;}try{if(audio.paused){await audio.play();onPlayingChange?.(true);}else{audio.pause();onPlayingChange?.(false);}}catch(e){setStatus('Playback could not start: '+e.message);}}
 return <section className="living-light-workspace" aria-label="Living Light workspace">
  <header><div><h3>Living Light</h3><p>{title||songId} · <code>{songId}</code></p></div><span>Foundation preview</span></header>
  <p className="living-light-truth">This is the original native renderer following Echo’s selected song clock. Travel and Location tours follow authored source-time intervals. Prepared signals can drive each use’s saved audio choices. Stem timing remains unavailable until an owner map is applied; broader visual qualification is still being connected.</p>
  <LivingLightSignals songId={songId} onPerformance={acceptPerformance}/>
  {audition&&<LivingLightStemAudition songId={songId} audioRef={audioRef} audition={audition}/>}
  <div className="living-light-controls"><label>Audio response <select aria-label="Living Light audio response" value={signalMode} onChange={e=>setSignalMode(e.target.value)}><option value="neutral">Neutral study</option><option value="basic" disabled={!selectedPerformance||!audioReceipt}>Prepared audio choices / basic master</option></select></label><label>{studyingTour?'Start a Tunnel study':'Tunnel family'} <select value={selected?.thingId||family} onChange={e=>{setStudyRecipe(null);setFamily(e.target.value);}}>{[...(!registry.entries.some(t=>t.thingId===selected?.thingId)&&selected?[selected]:[]),...registry.entries.filter(t=>t.variantKind==='continuous-profile')].map(t=><option key={t.thingId} value={t.thingId}>{t.title}</option>)}</select></label><label>Preview quality <select aria-label="Living Light preview quality" value={quality} onChange={e=>setQuality(e.target.value)}><option value="draft">Draft</option><option value="balanced">Balanced</option><option value="high">High</option></select></label><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/> Hold visual motion</label><button type="button" onClick={toggleAudio}>Play / pause selected {audition?.assetId?'stem':'song'}</button><button type="button" onClick={()=>setDiagnostic(runtimeRef.current?{...runtimeRef.current.diagnostics(),preview:driverRef.current?.diagnostics()}:null)}>Inspect preview</button></div>
  {studyRecipe?.songId===songId&&<p>Preview recipe: {studyRecipe.title} · {studyingTour?'Location tour':'Continuous Tunnel'}. Changes in the editor take effect when you choose Study this recipe.</p>}
  <canvas ref={canvasRef} aria-label="Native Living Light Journey study" data-testid="living-light-canvas"/>
  <p role="status" data-testid="living-light-status">{status}</p>
  {diagnostic&&<details><summary>Preview evidence</summary><p>{diagnostic.environment?.backend||'Native WebGL2'} · {diagnostic.canvasCount} canvas · {diagnostic.ownedAudioContexts} view-owned audio contexts · features {diagnostic.features}</p><pre>{JSON.stringify(diagnostic,null,2)}</pre></details>}
  <LivingLightJourneyEditor songId={songId} title={title} durationUs={Math.round(Number(audioReceipt?.durationSeconds||duration)*1e6)||0} registry={registry} showSavedCards={false} openRequest={openJourneyRequest} onSaved={journeySaved} addRequest={addRequest} performance={selectedPerformance?.sourcePolicy==='living-light-assets-v1'?selectedPerformance:null} onPreview={recipe=>setStudyRecipe(recipe)}/>
  <LivingLightLibrary registry={registry} songId={songId} journeyRefreshToken={journeyRefreshToken} onOpenJourney={row=>setOpenJourneyRequest({row,nonce:crypto.randomUUID()})} onAdd={thing=>setAddRequest({thing,nonce:crypto.randomUUID()})} onUse={thing=>{setStudyRecipe(null);setFamily(thing.thingId);}}/>
 </section>;
}

export default function LivingLightWorkspace(props){return <LivingLightRegistryProvider><Workspace {...props}/></LivingLightRegistryProvider>;}
