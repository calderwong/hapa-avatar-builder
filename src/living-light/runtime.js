import {installLivingLightMedia} from './media-surfaces.js';
import {createLivingLightGraphicsLease} from './graphics-lease.js';
import {createLivingLightFeatureBank} from '../domain/living-light-features.js';
import {livingLightFeatureKey} from '../domain/living-light-prepared-binding.js';
import {createLivingLightSignalRouter} from '../domain/living-light-signal-routing.js';
import {createLivingLightBasicMaster} from '../domain/living-light-basic-master.js';
import {compileLivingLightNativeTour} from '../domain/living-light-native-tour.js';
import {createNativeNamespace} from './native.generated.js';
import {effectiveThingParameters} from '../domain/living-light-preset.js';
import {validateJourney, validateParameterValue} from '../domain/living-light-contracts.js';
import {createLivingLightRegistry} from './registry.js';
/** Native host. Authored routes and limited master response are explicit.
 * Builder owns the audible element, clock, RAF and view visibility. */
export function createLivingLightRuntime({canvas,registry=createLivingLightRegistry(),nativeFactory=createNativeNamespace,mediaSources=[],onMediaChange=()=>{},mediaFactory=installLivingLightMedia,stillCanvasFactory=()=>globalThis.document.createElement('canvas')}={}) {
 if(!canvas)throw Error('Living Light needs a host canvas');
 const native=nativeFactory();let renderer=null,graphicsLease=null,state=null,cache=null,disposed=false,suspended=false,generation=-1,heldVisualUs=null,lastSourceUs=0,prepared=null,masterBank=null,featureLease=null,signalRouter=null;
 let lastPaint=null,media=null,renderSignalUs=null,lastSignalUs=0,heldSignalUs=null,hasEvaluated=false;
 const assertLive=()=>{if(disposed)throw Error('Living Light runtime disposed');};
 const dropRenderer=()=>{lastPaint=null;try{media?.dispose();media=null;renderer?.dispose();}finally{renderer=null;graphicsLease?.dispose();graphicsLease=null;}};
 const drop=()=>{dropRenderer();masterBank?.dispose();masterBank=null;featureLease?.release();featureLease=null;signalRouter=null;if(cache)native.HapaArticulation.invalidate(cache);};
 const makeRenderer=()=>{graphicsLease=createLivingLightGraphicsLease(canvas);try{renderer=new native.HapaRenderer(graphicsLease.canvas,cache.score,cache,state);native.HapaPassageRenderer(renderer);native.HapaGeometryDanceVisuals(renderer);native.HapaJourneyVisuals(renderer);if(prepared?.journeyRevision.mediaSlots.some(slot=>slot.enabled))media=mediaFactory({renderer,native,journey:prepared.journeyRevision,sources:mediaSources,onChange:onMediaChange});}catch(error){dropRenderer();throw error;}};
 const masterFrame=time=>featureLease?.sample('master','energy',time)||masterBank?.sample(time)||null;
 // Apply after inherited Director/articulation evaluation. The Director owns
 // its baselines and otherwise overwrites Core offsets before the GPU sees them.
 const evaluateNative=native.HapaCore.evaluate;
 native.HapaCore.evaluate=(activeCache,activeState,time)=>{
  const frame=evaluateNative(activeCache,activeState,time);
  if(activeCache===cache&&(masterBank||featureLease)){
   const visualUs=Math.round(time*1e6),sourceUs=renderSignalUs??visualUs,measured=masterFrame(sourceUs),routing=signalRouter?.evaluate(visualUs,sourceUs),response={};
   const offsets={...measured.offsets,...routing?.offsets};
   for(const [key,offset]of Object.entries(offsets)){
    const control=native.HapaCore.parameters.find(p=>p.id===key),baseline=frame.values[key];
    const final=Math.max(control.min,Math.min(control.max,baseline+offset));
    frame.values[key]=final;response[key]={baseline,offset,final};
   }
   frame.basicMasterResponse={measurement:measured,parameters:response};
   if(routing)frame.signalRouting=routing;
  }
  return frame;
 };
 function prepare({journeyRevision,sourceBinding,generation:nextGeneration,signal,neutralStudy=false,basicMasterInput,featureInput,journeyDurationUs=sourceBinding?.durationUs}){
  assertLive();if(signal?.aborted)return {state:'cancelled'};
  if(!Number.isSafeInteger(nextGeneration)||nextGeneration<=generation)throw Error('Stale runtime generation');
  const durationUs=sourceBinding?.durationUs;
  if(!Number.isSafeInteger(durationUs)||durationUs<1||durationUs>1800000000||sourceBinding.songId!==journeyRevision.songId)throw Error('Exact bounded song timeline is required (up to 30 minutes)');
  if(!Number.isSafeInteger(journeyDurationUs)||journeyDurationUs<1||journeyDurationUs>1800000000)throw Error('Invalid Journey timeline');
  validateJourney(journeyRevision,{resolveThing:registry.resolveThing,durationUs:journeyDurationUs});
  if(journeyRevision.mode==='continuous'&&journeyRevision.instances.length!==1)throw Error('Continuous family schedules await qualification; select one profile');
  if(journeyRevision.actorTreatment!=='none')throw Error('Figure treatment awaits qualification; choose None');
  const hasBindings=journeyRevision.instances.some(i=>Object.keys(i.bindings).length);
  if((neutralStudy?1:0)+(basicMasterInput?1:0)+(featureInput?1:0)>1)throw Error('Choose exactly one signal mode');
  if(!neutralStudy&&!basicMasterInput&&!featureInput)throw Error('Choose a neutral study or exact prepared basic master response');
  if(hasBindings&&!neutralStudy&&!featureInput)throw Error('Exact prepared asset signals are required for per-instance response');
  const instance=journeyRevision.instances[0],thing=registry.resolveThing(instance.thingRef);
  const tour=journeyRevision.mode==='tour'?compileLivingLightNativeTour(journeyRevision,{registry,native,durationUs:journeyDurationUs}):null;
  const nextBank=basicMasterInput?createLivingLightBasicMaster({...basicMasterInput,songId:journeyRevision.songId}):null;
  let nextLease=null,adopted=false;
  if(featureInput){if(!featureInput.cache)throw Error('The host must own a bounded feature cache');const {performance,playbackReceipt,sourceBinding:binding,cache:owner,requiredBytes}=featureInput;nextLease=owner.acquire({key:livingLightFeatureKey({songId:journeyRevision.songId,performance,playbackReceipt,sourceBinding:binding}),requiredBytes,signal,create:({maxBytes})=>createLivingLightFeatureBank({songId:journeyRevision.songId,performance,playbackReceipt,sourceBinding:binding,maxBytes})});}
  try{
  const nextRouter=hasBindings&&nextLease?createLivingLightSignalRouter({journey:structuredClone(journeyRevision),registry,bank:nextLease}):null;
  const responseIdentity=nextLease?.identity||nextBank?.identity;
  if(responseIdentity&&(responseIdentity.durationUs!==durationUs||responseIdentity.sourceHash!==sourceBinding.sourceHash))throw Error('Basic master differs from selected source timeline');
  // A fresh namespace/cache never retains prototype songs or frames from another song.
  const score=tour?.score||{id:journeyRevision.songId,title:journeyRevision.title,duration:journeyDurationUs/1e6,fps:30,stems:[],master:'AA==',travel:[],shots:[{id:'neutral-study',label:neutralStudy?'Authored resting study · measured features unavailable':'Explicit basic master RMS response',start:0,end:journeyDurationUs/1e6,rig:'portrait',locks:{},palette:'inherit'}]};
  const nextState=native.HapaCore.initialState(score);Object.assign(nextState,{director:native.HapaDirector.create(score),reliquary:native.HapaReliquary.defaults(),flow:{resonance:true,braid:true,edge:true},showMedia:false,videoWeave:false});native.HapaHorizons.init(nextState);
  nextState.reliquary.journey={...native.HapaJourney.defaults(),mode:tour?'standard':'tunnel',family:tour?'auto':thing.source.moduleId,seed:journeyRevision.seed};
  if(!tour)for(const [key,value]of Object.entries(effectiveThingParameters(thing,instance.parameters))){validateParameterValue(thing.parameters[key],value);nextState.reliquary.journey[key]=value;}
  nextState.passages=tour?.passages||{enabled:false,baseWorld:'breathline-weave',bridges:[]};
  if(tour)nextState.world=tour.passages.baseWorld;
  const nextCache=new native.HapaCore.FeatureCache(score);
  drop();masterBank=nextBank;featureLease=nextLease;signalRouter=nextRouter;adopted=true;state=nextState;cache=nextCache;generation=nextGeneration;heldVisualUs=null;heldSignalUs=null;lastSourceUs=0;lastSignalUs=0;renderSignalUs=null;hasEvaluated=false;suspended=false;
  prepared={journeyDurationUs,journeyRevision:structuredClone(journeyRevision),sourceBinding:structuredClone(sourceBinding),neutralStudy:!!neutralStudy,tourEvidence:tour?{version:tour.version,instances:tour.evidence}:null};
  try{makeRenderer();}catch(error){drop();prepared=null;throw error;}
  return {state:neutralStudy?'neutral-study':'basic-master-response',generation,features:signalRouter?'exact-asset-port-response':featureLease?'exact-assets-master-response':masterBank?'basic-master-rms':'unavailable',audibleSourceOwned:false,finalEncoding:'unsupported'};
  }finally{if(!adopted){nextBank?.dispose();nextLease?.release();}}
 }
 function evaluate({timelineUs,signalTimelineUs=timelineUs,playing=false,seed,quality='balanced',reducedMotion=false,viewport}={}){
  assertLive();if(!renderer||suspended)return null;
  if(!Number.isSafeInteger(timelineUs)||timelineUs<0||timelineUs>prepared.journeyDurationUs)throw Error('Source time outside selected timeline');
  if(!Number.isSafeInteger(signalTimelineUs)||signalTimelineUs<0||signalTimelineUs>prepared.sourceBinding.durationUs)throw Error('Signal time outside selected song');
  if(seed!==undefined&&seed!==prepared.journeyRevision.seed)throw Error('Seed must match prepared revision');
  if(!['draft','balanced','high'].includes(quality))throw Error('Unsupported quality');
  if(reducedMotion&&heldVisualUs===null){heldVisualUs=hasEvaluated?lastSourceUs:timelineUs;heldSignalUs=hasEvaluated?lastSignalUs:signalTimelineUs;}
  if(!reducedMotion){heldVisualUs=null;heldSignalUs=null;}
  const visualUs=heldVisualUs??timelineUs,signalUs=heldSignalUs??signalTimelineUs;lastSourceUs=timelineUs;lastSignalUs=signalTimelineUs;hasEvaluated=true;
  if(viewport)resize(viewport);state.quality=quality;
  // Source implementation's reduced flag freezes at zero. Host holds the exact last visual time instead.
  state.reduced=false;
  const measured=masterFrame(signalUs);
  const frame=prepared.tourEvidence?native.HapaCurrents.route(cache,state,visualUs/1e6):native.HapaJourney.evaluate(cache,state,visualUs/1e6);
  return {schemaVersion:'hapa.living-light.frame.v1',generation,timelineUs,visualUs,signalUs,playing,reducedMotion,quality,frame,basicMasterFrame:measured,signalRouting:signalRouter?.evaluate(visualUs,signalUs)||null,signalState:signalRouter?'exact-asset-port-response':featureLease?'exact-assets-master-response':masterBank?'basic-master-rms':'unavailable',motionBasis:'authored-resting-source-time',signalBasis:signalRouter?'explicit exact-source normalized energy/onset offsets; unresolved timing remains unavailable':(masterBank||featureLease)?'source-bound RMS offsets; no stem/event substitution':'neutral'};
 }
 function render(packet){assertLive();lastPaint=null;if(!packet||suspended)return false;if(packet.generation!==generation)throw Error('Stale frame');if(signalRouter?.evaluate(packet.visualUs,packet.signalUs).blocked)return false;masterFrame(packet.signalUs);media?.sync(packet);renderSignalUs=packet.signalUs;try{renderer.render(packet.visualUs/1e6);}finally{renderSignalUs=null;}lastPaint=structuredClone(packet);return true;}
 function resize({width,height}){assertLive();if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>3840||height>3840)throw Error('Invalid viewport');lastPaint=null;renderer?.resize(width,height);}
 function captureStill(){
  assertLive();if(!renderer||suspended||!lastPaint||lastPaint.generation!==generation)throw Error('Paint a current available frame before capturing.');
  if(media?.diagnostics().some(entry=>entry.status!=='ready'||!entry.paintReady))throw Error('Wait for every painted clip to resolve and decode at this time before capturing.');
  const output=stillCanvasFactory();output.width=320;output.height=180;
  try{
   const context=output.getContext('2d');if(!context)throw Error('Still capture is unavailable.');
   context.drawImage(canvas,0,0,320,180);
   const dataUrl=output.toDataURL('image/png');if(dataUrl.length>256*1024)throw Error('Captured image exceeds the small-preview limit.');
   return {dataUrl,receipt:{schemaVersion:'hapa.living-light.still.v1',width:320,height:180,runtime:'ll109-native-host',generation,source:structuredClone(prepared.sourceBinding),recipe:structuredClone(prepared.journeyRevision),timelineUs:lastPaint.timelineUs,visualUs:lastPaint.visualUs,signalUs:lastPaint.signalUs,quality:lastPaint.quality,signalState:lastPaint.signalState,reducedMotion:lastPaint.reducedMotion,environment:structuredClone(renderer.environment||null),qualification:'captured-preview-only',finalEncoding:'unsupported'}};
  }finally{output.width=0;output.height=0;}
 }
 function captureReferenceStill({timelineUs,quality='balanced'}={}){
  const previousHeld=heldVisualUs,previousSource=lastSourceUs,previousHeldSignal=heldSignalUs,previousSignal=lastSignalUs;
  try{const packet=evaluate({timelineUs,quality,reducedMotion:false,viewport:{width:640,height:360}});if(!render(packet))throw Error('The reference frame is unavailable.');return captureStill();}
  finally{heldVisualUs=previousHeld;lastSourceUs=previousSource;heldSignalUs=previousHeldSignal;lastSignalUs=previousSignal;}
 }
 function suspend(){assertLive();lastPaint=null;suspended=true;media?.suspend();}
 function restore(){assertLive();if(!prepared)throw Error('Nothing to restore');dropRenderer();generation++;suspended=false;try{makeRenderer();}catch(error){drop();prepared=null;throw error;}return diagnostics();}
 function diagnostics(){return {prepared:!!renderer,disposed,suspended,generation,canvasCount:renderer?1:0,ownedAudioContexts:0,ownedAnimationLoops:0,media:media?.diagnostics()||[],features:signalRouter?'exact-asset-port-response':featureLease?'exact-assets-master-response':masterBank?'basic-master-rms':'unavailable',featureEvidence:featureLease?.identity||masterBank?.identity||null,assetEvidence:featureLease?.assets()||null,signalRouting:signalRouter?.evaluate(heldVisualUs??lastSourceUs,heldSignalUs??lastSignalUs)||null,tourEvidence:prepared?.tourEvidence||null,environment:renderer?.environment||null,graphicsLease:graphicsLease?.diagnostics()||null,resources:renderer?{programs:Object.keys(renderer.programs).length,buffers:renderer.buffers.length,vaos:renderer.vaos.length,targets:renderer.targets.length}:null,route:renderer?.routeTelemetry||null};}
 function dispose(){if(disposed)return;drop();state=null;cache=null;prepared=null;disposed=true;}
 return {prepare,evaluate,render,resize,captureStill,captureReferenceStill,suspend,restore,dispose,diagnostics};
}
