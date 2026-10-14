import LivingLightNavigation from './LivingLightNavigation.jsx';
import {livingLightNavigationMap,createLivingLightExplorer} from '../domain/living-light-navigation.js';
import {normalizeEchoRecordSummaryRows} from '../domain/echo-record-garden.js';
import {resolveLivingLightJourneyMedia} from '../domain/living-light-media-resolution.js';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import LivingLightRegistryProvider,{useLivingLightRegistry} from './LivingLightRegistryProvider.jsx';
import {createLivingLightRuntime} from '../living-light/runtime.js';
import {createLivingLightPreviewDriver} from '../living-light/preview-driver.js';
import EchoLivingLightCueEditor from './EchoLivingLightCueEditor.jsx';
import LivingLightLibrary from './LivingLightLibrary.jsx';
import LivingLightJourneyEditor from './LivingLightJourneyEditor.jsx';
import LivingLightStemAudition from './LivingLightStemAudition.jsx';
import LivingLightSignals from './LivingLightSignals.jsx';
import {createLivingLightFeatureCache} from '../domain/living-light-feature-cache.js';
import {livingLightPreparedBinding,livingLightFeatureBytes} from '../domain/living-light-prepared-binding.js';
import {livingLightThingStudy,livingLightSavedStudyTarget,createLivingLightStillCache} from '../domain/living-light-stills.js';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {editableJourney} from '../domain/living-light-journey.js';
import './LivingLightWorkspace.css';
const EMPTY_MEDIA=Object.freeze([]);
/** Lazy Echo workbench entry. This view never creates an audible source. */
function Workspace({apiBase='',songId,title,duration,audioRef,audioReceipt,preparedPerformance,powerMode,onPlayingChange,songClockRef,audition,sharedHandEnabled=false,openCardRequest,mediaSources=EMPTY_MEDIA,directorProject,directorCutKey,directorTime=0,onDirectorCuesChange,directorEditingDisabled=false}) {
 const {registry,archivedThings}=useLivingLightRegistry(),canvasRef=useRef(null),runtimeRef=useRef(null),driverRef=useRef(null),generationRef=useRef(0);
 const [family,setFamily]=useState('fractal'),[quality,setQuality]=useState('balanced'),[signalMode,setSignalMode]=useState('neutral'),[reduced,setReduced]=useState(()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false),[status,setStatus]=useState('Preparing neutral study…'),[diagnostic,setDiagnostic]=useState(null),[studyRecipe,setStudyRecipe]=useState(null),[addRequest,setAddRequest]=useState(null);
 const [mediaStatus,setMediaStatus]=useState([]),[retainedMedia,setRetainedMedia]=useState(null);
 const [exactPerformance,setExactPerformance]=useState(null),featureCacheRef=useRef(null);
 const [journeyRefreshToken,setJourneyRefreshToken]=useState(0),[openJourneyRequest,setOpenJourneyRequest]=useState(null);
 const [studyReference,setStudyReference]=useState(null),[captureStatus,setCaptureStatus]=useState(''),[capturing,setCapturing]=useState(false),[stillVersion,setStillVersion]=useState(0);
 const stillCache=useMemo(()=>createLivingLightStillCache(),[]),client=useMemo(()=>createLivingLightClient(),[]),captureEpoch=useRef(0),captureBusy=useRef(false);
 useEffect(()=>()=>{captureEpoch.current++;stillCache.clear();},[stillCache]);
 useEffect(()=>{captureEpoch.current++;setCaptureStatus('');},[songId,studyRecipe,family,signalMode]);
 const [albumRecords,setAlbumRecords]=useState([]),[albumStatus,setAlbumStatus]=useState(''),[albumBusy,setAlbumBusy]=useState(false),albumRequest=useRef(null);
 const [exploration,setExploration]=useState(null),explorationRef=useRef(null),[exploreFrame,setExploreFrame]=useState(null),frameKey=useRef(''),[navigationNotice,setNavigationNotice]=useState(''),[navigationCard,setNavigationCard]=useState(null);
 const navigationMap=useMemo(()=>{try{const map=livingLightNavigationMap(studyRecipe,registry);return {...map,journeyRef:studyReference?.target?.kind==='journey'?{journeyId:studyReference.target.id,revisionId:studyReference.target.revision}:null};}catch{return null;}},[studyRecipe,studyReference,registry]);
 const navigationIdentity=JSON.stringify([songId,directorCutKey]);
 useEffect(()=>()=>albumRequest.current?.abort(),[]);
 async function loadAlbum(){
  if(albumRequest.current)return;const controller=new AbortController();albumRequest.current=controller;setAlbumBusy(true);setAlbumStatus('Loading album destinations…');
  try{const response=await fetch(apiBase+'/api/echos/director-projects?summary=1',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]),cache:'no-store'});if(!response.ok)throw Error('Album catalog unavailable');const records=normalizeEchoRecordSummaryRows(await response.json());if(!controller.signal.aborted){setAlbumRecords(records);setAlbumStatus(records.length+' album records loaded. Existing destination pins stay unchanged.');}}
  catch(error){if(!controller.signal.aborted)setAlbumStatus('Album destinations unavailable: '+error.message);}
  finally{albumRequest.current=null;if(!controller.signal.aborted)setAlbumBusy(false);}
 }
 function publishExplore(value){const key=JSON.stringify([value.locationId,value.traveling,value.to]);if(key!==frameKey.current){frameKey.current=key;queueMicrotask(()=>{if(explorationRef.current)setExploreFrame(value);});}return value;}
 function exitExplore(restore=true){const session=explorationRef.current;if(!session)return;const bookmark=session.controller.end();explorationRef.current=null;setExploration(null);setExploreFrame(null);frameKey.current='';if(restore&&session.identity===navigationIdentity&&audioRef.current){audioRef.current.pause();audioRef.current.currentTime=bookmark.timeSeconds;if(songClockRef)songClockRef.current=bookmark.timeSeconds;onPlayingChange?.(false);}setNavigationNotice('Returned to the paused song. Your cut and draft are retained.');}
 function enterExplore(){try{if(!navigationMap)throw Error('Study a Location tour first.');if(audition?.assetId)throw Error('Return to Master before exploring.');const bookmark={songId,cutId:directorCutKey,timeSeconds:audioRef.current?.currentTime||songClockRef?.current||0};audioRef.current?.pause();onPlayingChange?.(false);const controller=createLivingLightExplorer(navigationMap,{bookmark});controller.hold(reducedRef.current);const session={controller,map:navigationMap,identity:navigationIdentity};explorationRef.current=session;setExploration(session);setExploreFrame(controller.sample());setNavigationNotice('Exploring authored motion. Prepared song response is inactive.');}catch(error){setNavigationNotice(error.message);}}
 function navigate(action,id){try{const session=explorationRef.current;if(!session)return;const value=action==='travel'?session.controller.travel(id,{reducedMotion:reducedRef.current}):action==='jump'?session.controller.jump(id):session.controller[action]();setExploreFrame(value);driverRef.current?.redraw();}catch(error){setNavigationNotice(error.message);}}
 useEffect(()=>{if(explorationRef.current)exitExplore();},[navigationIdentity,studyRecipe]);
 useEffect(()=>{if(audition?.assetId&&explorationRef.current)exitExplore(false);},[audition?.assetId]);
 useEffect(()=>{const session=explorationRef.current;if(!session)return;session.controller.hold(powerMode==='hidden'||reduced);if(powerMode!=='hidden')driverRef.current?.redraw();},[powerMode,reduced]);
 useEffect(()=>{
  const hold=()=>{const session=explorationRef.current;if(!session)return;session.controller.hold(document.hidden||powerMode==='hidden'||reduced);if(!document.hidden&&powerMode!=='hidden')driverRef.current?.redraw();};
  const stopAudio=event=>{if(explorationRef.current&&event.target===audioRef.current){audioRef.current.pause();onPlayingChange?.(false);setNavigationNotice('Explore keeps the song paused. Return to song to resume it.');}};
  document.addEventListener('visibilitychange',hold);document.addEventListener('play',stopAudio,true);hold();return()=>{document.removeEventListener('visibilitychange',hold);document.removeEventListener('play',stopAudio,true);};
 },[powerMode,reduced,exploration]);
 useEffect(()=>{if(openCardRequest)setNavigationCard(null);},[openCardRequest?.nonce]);
 useEffect(()=>()=>{explorationRef.current?.controller.end();explorationRef.current=null;},[]);
 const mediaSelectionKey=JSON.stringify([studyRecipe?.mediaSlots||[],mediaSources]);
 useEffect(()=>{
  if(!studyRecipe||powerMode==='hidden')return;
  const controller=new AbortController(),key=mediaSelectionKey;
  resolveLivingLightJourneyMedia(studyRecipe,{sources:mediaSources,request:client.request,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])}).then(sources=>{if(!controller.signal.aborted)setRetainedMedia({key,sources});}).catch(()=>{if(!controller.signal.aborted)setRetainedMedia({key,sources:mediaSources});});
  return()=>controller.abort();
 },[mediaSelectionKey,powerMode,client]);
 const previewMedia=retainedMedia?.key===mediaSelectionKey?retainedMedia.sources:mediaSources;
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
  setMediaStatus([]);
  const runtime=createLivingLightRuntime({canvas,registry,mediaSources:previewMedia,onMediaChange:()=>{setMediaStatus(runtime.diagnostics().media);driverRef.current?.redraw();}});runtimeRef.current=runtime;let driver=null;
  const recipe=studyRecipe?.songId===songId?{...studyRecipe,journeyId:'ll109:study:'+songId,revisionId:'ll109:study-draft',parentRevisionId:null}:{schemaVersion:'hapa.living-light.journey.v1',journeyId:'ll109:study:'+songId,revisionId:'ll109:study-draft',parentRevisionId:null,title:title||songId,songId,sourceBindingRef:null,state:'draft-unresolved',mode:'continuous',seed:109,instances:[{instanceId:'ll109:study-instance',thingRef:{thingId:selected.thingId,revisionId:selected.revisionId},parameters:{},bindings:{}}],schedule:[{instanceId:'ll109:study-instance',startUs:0,endUs:durationUs}],actorTreatment:'none',mediaSlots:[]};
  setDiagnostic(null);
  try{
   if(!featureCacheRef.current)featureCacheRef.current=createLivingLightFeatureCache();
   const exactInput=!exploration&&signalMode==='basic'&&selectedPerformance?.sourcePolicy==='living-light-assets-v1'?{performance:selectedPerformance,playbackReceipt:audioReceipt,sourceBinding:livingLightPreparedBinding({songId,performance:selectedPerformance,playbackReceipt:audioReceipt}),cache:featureCacheRef.current,requiredBytes:livingLightFeatureBytes(selectedPerformance)}:undefined;
   runtime.prepare({journeyRevision:recipe,sourceBinding:{songId,durationUs,sourceHash:audioReceipt?.sourceHash||null,timelineEvidence:audioReceipt?'existing Echo playback receipt':'declared metadata only'},generation:++generationRef.current,neutralStudy:!!exploration||signalMode==='neutral',featureInput:exactInput,basicMasterInput:!exploration&&signalMode==='basic'&&!exactInput?{performance:selectedPerformance,playbackReceipt:audioReceipt}:undefined});
   setMediaStatus(runtime.diagnostics().media);
   setStatus(exploration?'Explore · authored motion, song paused':signalMode==='basic'?'Prepared response · recipe audio choices use exact sources; stem timing remains unverified':'Neutral study · saved audio choices are inactive');
   driver=createLivingLightPreviewDriver({canvas,runtime,getAudio:()=>audioRef.current,getFrame:()=>{
    const audio=audioRef.current,sourceSeconds=audition?.assetId?songClockRef?.current||0:audio?.currentTime||0,rect=canvas.getBoundingClientRect();
    if(explorationRef.current){const frame=publishExplore(explorationRef.current.controller.sample());return {timelineUs:frame.timelineUs,playing:frame.playing,reducedMotion:false,quality:qualityRef.current,viewport:{width:Math.max(64,Math.min(1280,Math.round(rect.width))),height:Math.max(64,Math.min(720,Math.round(rect.height)))}};}
    return {timelineUs:Math.min(durationUs,Math.max(0,Math.round(sourceSeconds*1e6))),playing:!audition?.assetId&&!!audio&&!audio.paused&&!audio.ended,reducedMotion:reducedRef.current,quality:qualityRef.current,viewport:{width:Math.max(64,Math.min(1280,Math.round(rect.width))),height:Math.max(64,Math.min(720,Math.round(rect.height)))}};
   },onStatus:message=>setStatus(message),onError:error=>setStatus('Native preview failed: '+error.message)});
   driverRef.current=driver;setDiagnostic({...runtime.diagnostics(),preview:driver.diagnostics()});
  }catch(e){runtime.dispose();setStatus('Native preview unavailable: '+e.message);}
  return ()=>{driver?.dispose();runtime.dispose();if(driverRef.current===driver)driverRef.current=null;if(runtimeRef.current===runtime)runtimeRef.current=null;};
 },[songId,title,duration,audioReceipt?.sourceHash,audioReceipt?.pcmSha256,audioReceipt?.durationSeconds,selectedPerformance?.fingerprint,signalMode,family,studyRecipe,powerMode,registry,audition?.assetId,previewMedia,exploration]);
 // Motion preference changes keep the existing canvas; the source-time hold belongs to the runtime.
 // Avoid closing over a stale motion preference in the host's frame callback.
 useEffect(()=>{driverRef.current?.redraw();},[reduced,quality]);
 async function toggleAudio(){if(explorationRef.current){setNavigationNotice('Return to song before resuming audio.');return;}const audio=audioRef.current;if(!audio){setStatus('The selected audio is still preparing in Echo.');return;}try{if(audio.paused){await audio.play();onPlayingChange?.(true);}else{audio.pause();onPlayingChange?.(false);}}catch(e){setStatus('Playback could not start: '+e.message);}}
 function studyThing(thing){
  try{
   const reference=livingLightThingStudy({thing,registry,songId,durationUs:Math.round(Number(audioReceipt?.durationSeconds||duration)*1e6)});
   setSignalMode('neutral');setStudyReference(reference);setStudyRecipe(editableJourney(reference.journey));
  }catch(error){setCaptureStatus(error.message);}
 }
 async function capture(){
  if(captureBusy.current)return;
  const runtime=runtimeRef.current,driver=driverRef.current,epoch=captureEpoch.current;
  const reference=studyRecipe?.songId===songId?studyReference:selected&&(!studyRecipe||studyRecipe.songId!==songId)?{target:{kind:'thing',id:selected.thingId,revision:selected.revisionId},context:'Neutral default reference'}:null;
  try{
   if(explorationRef.current)throw Error('Return to song before capturing its Card preview.');
   if(!runtime||!driver||!reference?.target)throw Error('Save and study an exact recipe revision, or choose a reference Thing first.');
   const previewState=driver.diagnostics();if(previewState.failed||previewState.contextLost||previewState.suspended)throw Error('The selected preview is unavailable. Recover it before capturing.');
   if(audioRef.current&&!audioRef.current.paused)throw Error('Pause the selected audio before capturing a Card preview.');
   if(reference.target.kind==='thing'&&signalMode!=='neutral')throw Error('Choose Neutral study to capture reusable Thing defaults.');
   captureBusy.current=true;setCapturing(true);setCaptureStatus('Capturing a small Card preview…');
   if(reference.target.kind==='journey'){
    const saved=await client.request('/journeys/'+encodeURIComponent(reference.target.id)+'/revisions/'+encodeURIComponent(reference.target.revision),{signal:AbortSignal.timeout(30000)});
    if(!livingLightSavedStudyTarget(studyRecipe,saved.journey))throw Error('This study differs from the saved revision. Save and study it again.');
   }
   if(epoch!==captureEpoch.current||runtimeRef.current!==runtime||audioRef.current&&!audioRef.current.paused)throw Error('Study changed during capture. Choose Capture again when paused.');
   let still;
   if(reference.referenceTimeUs!==undefined)still=runtime.captureReferenceStill({timelineUs:reference.referenceTimeUs,quality:qualityRef.current});
   else{driver.redraw();if(driver.diagnostics().failed)throw Error('The selected frame could not be painted.');still=runtime.captureStill();}still.receipt.context=reference.context||'Exact saved recipe revision';
   stillCache.put(reference.target,still);setStillVersion(value=>value+1);setCaptureStatus('Card preview captured for this revision in this workspace session. Qualification and saved notes are unchanged.');
  }catch(error){if(epoch===captureEpoch.current)setCaptureStatus('Preview not captured: '+error.message);}
  finally{if(runtimeRef.current===runtime)driver?.redraw();captureBusy.current=false;setCapturing(false);}
 }
 return <section className="living-light-workspace" aria-label="Living Light workspace">
  <header><div><h3>Living Light</h3><p>{title||songId} · <code>{songId}</code></p></div><span>Foundation preview</span></header>
  <p className="living-light-truth">This is the original native renderer following Echo’s selected song clock. Travel and Location tours follow authored source-time intervals. Prepared signals can drive each use’s saved audio choices. Stem timing remains unavailable until an owner map is applied; broader visual qualification is still being connected.</p>
  {directorProject&&onDirectorCuesChange&&<EchoLivingLightCueEditor project={directorProject} cutKey={directorCutKey} currentTime={directorTime} onChange={onDirectorCuesChange} disabled={directorEditingDisabled} active={powerMode!=='hidden'} refreshToken={journeyRefreshToken}/>}
  <div className="living-light-card-actions"><button type="button" disabled={albumBusy} onClick={loadAlbum}>{albumBusy?'Loading album…':'Load album destinations'}</button><p role="status">{albumStatus}</p></div>
  <LivingLightSignals songId={songId} onPerformance={acceptPerformance}/>
  {audition&&<LivingLightStemAudition songId={songId} audioRef={audioRef} audition={audition}/>}
  <div className="living-light-controls"><label>Audio response <select aria-label="Living Light audio response" value={signalMode} onChange={e=>setSignalMode(e.target.value)}><option value="neutral">Neutral study</option><option value="basic" disabled={!selectedPerformance||!audioReceipt}>Prepared audio choices / basic master</option></select></label><label>{studyingTour?'Start a Tunnel study':'Tunnel family'} <select value={selected?.thingId||family} onChange={e=>{setStudyReference(null);setStudyRecipe(null);setFamily(e.target.value);}}>{[...(!registry.entries.some(t=>t.thingId===selected?.thingId)&&selected?[selected]:[]),...registry.entries.filter(t=>t.variantKind==='continuous-profile')].map(t=><option key={t.thingId} value={t.thingId}>{t.title}</option>)}</select></label><label>Preview quality <select aria-label="Living Light preview quality" value={quality} onChange={e=>setQuality(e.target.value)}><option value="draft">Draft</option><option value="balanced">Balanced</option><option value="high">High</option></select></label><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/> Hold visual motion</label><button type="button" onClick={toggleAudio}>Play / pause selected {audition?.assetId?'stem':'song'}</button><button type="button" onClick={()=>setDiagnostic(runtimeRef.current?{...runtimeRef.current.diagnostics(),preview:driverRef.current?.diagnostics(),stillCache:stillCache.diagnostics()}:null)}>Inspect preview</button></div>
  {studyRecipe?.songId===songId&&<p>Preview recipe: {studyRecipe.title} · {studyingTour?'Location tour':'Continuous Tunnel'}. Changes in the editor take effect when you choose Study this recipe.</p>}
  <canvas ref={canvasRef} aria-label="Native Living Light Journey study" data-testid="living-light-canvas"/>
  <LivingLightNavigation map={exploration?.map||navigationMap} session={exploration} frame={exploreFrame} onEnter={enterExplore} onExit={()=>exitExplore()} onAction={navigate} onInspect={target=>setNavigationCard({target,nonce:crypto.randomUUID()})} records={albumRecords} media={[...mediaSources,...previewMedia]} registry={registry} sharedHandEnabled={sharedHandEnabled} disabled={powerMode==='hidden'}/>
  <p role="status">{navigationNotice}</p>
  <p role="status" data-testid="living-light-status">{status}</p>
  {!!mediaStatus.length&&<ul aria-label="Painted clip status">{mediaStatus.map(entry=><li key={entry.surface.instanceId+entry.surface.surfaceId}>{entry.surface.surfaceId}: {entry.message}</li>)}</ul>}
  <div className="living-light-card-actions"><button type="button" disabled={capturing} onClick={capture}>{capturing?'Capturing…':'Capture Card preview'}</button><button type="button" disabled={capturing} onClick={()=>{stillCache.clear();setStillVersion(value=>value+1);setCaptureStatus('Session previews cleared. Saved Cards and notes are unchanged.');}}>Clear session previews</button><p role="status">{captureStatus}</p></div>
  {diagnostic&&<details><summary>Preview evidence</summary><p>{diagnostic.environment?.backend||'Native WebGL2'} · {diagnostic.canvasCount} canvas · {diagnostic.ownedAudioContexts} view-owned audio contexts · features {diagnostic.features}</p><pre>{JSON.stringify(diagnostic,null,2)}</pre></details>}
  <LivingLightJourneyEditor albumRecords={albumRecords} mediaSources={mediaSources} songId={songId} title={title} durationUs={Math.round(Number(audioReceipt?.durationSeconds||duration)*1e6)||0} registry={registry} showSavedCards={false} openRequest={openJourneyRequest} onSaved={journeySaved} addRequest={addRequest} performance={selectedPerformance?.sourcePolicy==='living-light-assets-v1'?selectedPerformance:null} onPreview={(recipe,reference)=>{setStudyReference(reference);setStudyRecipe(recipe);}}/>
  <LivingLightLibrary sharedHandEnabled={sharedHandEnabled} openCardRequest={navigationCard||openCardRequest} registry={registry} songId={songId} journeyRefreshToken={journeyRefreshToken} onOpenJourney={row=>setOpenJourneyRequest({row,nonce:crypto.randomUUID()})} onAdd={thing=>setAddRequest({thing,nonce:crypto.randomUUID()})} stillCache={stillCache} stillVersion={stillVersion} onUse={studyThing}/>
 </section>;
}

export default function LivingLightWorkspace(props){return <LivingLightRegistryProvider><Workspace {...props}/></LivingLightRegistryProvider>;}
