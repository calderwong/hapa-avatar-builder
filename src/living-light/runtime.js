import {createLivingLightGraphicsLease} from './graphics-lease.js';
import {createLivingLightFeatureBank} from '../domain/living-light-features.js';
import {livingLightFeatureKey} from '../domain/living-light-prepared-binding.js';
import {createLivingLightBasicMaster} from '../domain/living-light-basic-master.js';
import {compileLivingLightNativeTour} from '../domain/living-light-native-tour.js';
import {createNativeNamespace} from './native.generated.js';
import {effectiveThingParameters} from '../domain/living-light-preset.js';
import {validateJourney, validateParameterValue} from '../domain/living-light-contracts.js';
import {createLivingLightRegistry} from './registry.js';
/** Native host. Authored routes and limited master response are explicit.
 * Builder owns the audible element, clock, RAF and view visibility. */
export function createLivingLightRuntime({canvas,registry=createLivingLightRegistry(),nativeFactory=createNativeNamespace}={}) {
 if(!canvas)throw Error('Living Light needs a host canvas');
 const native=nativeFactory();let renderer=null,graphicsLease=null,state=null,cache=null,disposed=false,suspended=false,generation=-1,heldVisualUs=null,lastSourceUs=0,prepared=null,masterBank=null,featureLease=null;
 const assertLive=()=>{if(disposed)throw Error('Living Light runtime disposed');};
 const dropRenderer=()=>{try{renderer?.dispose();}finally{renderer=null;graphicsLease?.dispose();graphicsLease=null;}};
 const drop=()=>{dropRenderer();masterBank?.dispose();masterBank=null;featureLease?.release();featureLease=null;if(cache)native.HapaArticulation.invalidate(cache);};
 const makeRenderer=()=>{graphicsLease=createLivingLightGraphicsLease(canvas);try{renderer=new native.HapaRenderer(graphicsLease.canvas,cache.score,cache,state);native.HapaPassageRenderer(renderer);native.HapaGeometryDanceVisuals(renderer);native.HapaJourneyVisuals(renderer);}catch(error){dropRenderer();throw error;}};
 const masterFrame=time=>featureLease?.sample('master','energy',time)||masterBank?.sample(time)||null;
 // Apply after inherited Director/articulation evaluation. The Director owns
 // its baselines and otherwise overwrites Core offsets before the GPU sees them.
 const evaluateNative=native.HapaCore.evaluate;
 native.HapaCore.evaluate=(activeCache,activeState,time)=>{
  const frame=evaluateNative(activeCache,activeState,time);
  if(activeCache===cache&&(masterBank||featureLease)){
   const measured=masterFrame(Math.round(time*1e6)),response={};
   for(const [key,offset]of Object.entries(measured.offsets)){
    const control=native.HapaCore.parameters.find(p=>p.id===key),baseline=frame.values[key];
    const final=Math.max(control.min,Math.min(control.max,baseline+offset));
    frame.values[key]=final;response[key]={baseline,offset,final};
   }
   frame.basicMasterResponse={measurement:measured,parameters:response};
  }
  return frame;
 };
 function prepare({journeyRevision,sourceBinding,generation:nextGeneration,signal,neutralStudy=false,basicMasterInput,featureInput}){
  assertLive();if(signal?.aborted)return {state:'cancelled'};
  if(!Number.isSafeInteger(nextGeneration)||nextGeneration<=generation)throw Error('Stale runtime generation');
  const durationUs=sourceBinding?.durationUs;
  if(!Number.isSafeInteger(durationUs)||durationUs<1||durationUs>1800000000||sourceBinding.songId!==journeyRevision.songId)throw Error('Exact bounded song timeline is required (up to 30 minutes)');
  validateJourney(journeyRevision,{resolveThing:registry.resolveThing,durationUs});
  if(journeyRevision.mode==='continuous'&&journeyRevision.instances.length!==1)throw Error('Continuous family schedules await qualification; select one profile');
  if(journeyRevision.actorTreatment!=='none')throw Error('Figure treatment awaits qualification; choose None');
  if(journeyRevision.instances.some(i=>Object.keys(i.bindings).length))throw Error('Per-instance signal bindings await qualification');
  if((neutralStudy?1:0)+(basicMasterInput?1:0)+(featureInput?1:0)>1)throw Error('Choose exactly one signal mode');
  if(!neutralStudy&&!basicMasterInput&&!featureInput)throw Error('Choose a neutral study or exact prepared basic master response');
  const instance=journeyRevision.instances[0],thing=registry.resolveThing(instance.thingRef);
  const tour=journeyRevision.mode==='tour'?compileLivingLightNativeTour(journeyRevision,{registry,native,durationUs}):null;
  const nextBank=basicMasterInput?createLivingLightBasicMaster({...basicMasterInput,songId:journeyRevision.songId}):null;
  let nextLease=null,adopted=false;
  if(featureInput){if(!featureInput.cache)throw Error('The host must own a bounded feature cache');const {performance,playbackReceipt,sourceBinding:binding,cache:owner,requiredBytes}=featureInput;nextLease=owner.acquire({key:livingLightFeatureKey({songId:journeyRevision.songId,performance,playbackReceipt,sourceBinding:binding}),requiredBytes,signal,create:({maxBytes})=>createLivingLightFeatureBank({songId:journeyRevision.songId,performance,playbackReceipt,sourceBinding:binding,maxBytes})});}
  try{
  const responseIdentity=nextLease?.identity||nextBank?.identity;
  if(responseIdentity&&(responseIdentity.durationUs!==durationUs||responseIdentity.sourceHash!==sourceBinding.sourceHash))throw Error('Basic master differs from selected source timeline');
  // A fresh namespace/cache never retains prototype songs or frames from another song.
  const score=tour?.score||{id:journeyRevision.songId,title:journeyRevision.title,duration:durationUs/1e6,fps:30,stems:[],master:'AA==',travel:[],shots:[{id:'neutral-study',label:neutralStudy?'Authored resting study · measured features unavailable':'Explicit basic master RMS response',start:0,end:durationUs/1e6,rig:'portrait',locks:{},palette:'inherit'}]};
  const nextState=native.HapaCore.initialState(score);Object.assign(nextState,{director:native.HapaDirector.create(score),reliquary:native.HapaReliquary.defaults(),flow:{resonance:true,braid:true,edge:true},showMedia:false,videoWeave:false});native.HapaHorizons.init(nextState);
  nextState.reliquary.journey={...native.HapaJourney.defaults(),mode:tour?'standard':'tunnel',family:tour?'auto':thing.source.moduleId,seed:journeyRevision.seed};
  if(!tour)for(const [key,value]of Object.entries(effectiveThingParameters(thing,instance.parameters))){validateParameterValue(thing.parameters[key],value);nextState.reliquary.journey[key]=value;}
  nextState.passages=tour?.passages||{enabled:false,baseWorld:'breathline-weave',bridges:[]};
  if(tour)nextState.world=tour.passages.baseWorld;
  const nextCache=new native.HapaCore.FeatureCache(score);
  drop();masterBank=nextBank;featureLease=nextLease;adopted=true;state=nextState;cache=nextCache;generation=nextGeneration;heldVisualUs=null;lastSourceUs=0;suspended=false;
  prepared={journeyRevision:structuredClone(journeyRevision),sourceBinding:structuredClone(sourceBinding),neutralStudy:!!neutralStudy,tourEvidence:tour?{version:tour.version,instances:tour.evidence}:null};
  try{makeRenderer();}catch(error){drop();prepared=null;throw error;}
  return {state:neutralStudy?'neutral-study':'basic-master-response',generation,features:featureLease?'exact-assets-master-response':masterBank?'basic-master-rms':'unavailable',audibleSourceOwned:false,finalEncoding:'unsupported'};
  }finally{if(!adopted){nextBank?.dispose();nextLease?.release();}}
 }
 function evaluate({timelineUs,playing=false,seed,quality='balanced',reducedMotion=false,viewport}={}){
  assertLive();if(!renderer||suspended)return null;
  if(!Number.isSafeInteger(timelineUs)||timelineUs<0||timelineUs>prepared.sourceBinding.durationUs)throw Error('Source time outside selected timeline');
  if(seed!==undefined&&seed!==prepared.journeyRevision.seed)throw Error('Seed must match prepared revision');
  if(!['draft','balanced','high'].includes(quality))throw Error('Unsupported quality');
  if(reducedMotion&&heldVisualUs===null)heldVisualUs=lastSourceUs;
  if(!reducedMotion)heldVisualUs=null;
  const visualUs=heldVisualUs??timelineUs;lastSourceUs=timelineUs;
  if(viewport)resize(viewport);state.quality=quality;
  // Source implementation's reduced flag freezes at zero. Host holds the exact last visual time instead.
  state.reduced=false;
  const measured=masterFrame(visualUs);
  const frame=prepared.tourEvidence?native.HapaCurrents.route(cache,state,visualUs/1e6):native.HapaJourney.evaluate(cache,state,visualUs/1e6);
  return {schemaVersion:'hapa.living-light.frame.v1',generation,timelineUs,visualUs,playing,reducedMotion,quality,frame,basicMasterFrame:measured,signalState:featureLease?'exact-assets-master-response':masterBank?'basic-master-rms':'unavailable',motionBasis:'authored-resting-source-time',signalBasis:(masterBank||featureLease)?'source-bound RMS offsets; no stem/event substitution':'neutral'};
 }
 function render(packet){assertLive();if(!packet||suspended)return false;if(packet.generation!==generation)throw Error('Stale frame');masterFrame(packet.visualUs);renderer.render(packet.visualUs/1e6);return true;}
 function resize({width,height}){assertLive();if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>3840||height>3840)throw Error('Invalid viewport');renderer?.resize(width,height);}
 function suspend(){assertLive();suspended=true;}
 function restore(){assertLive();if(!prepared)throw Error('Nothing to restore');dropRenderer();generation++;suspended=false;try{makeRenderer();}catch(error){drop();prepared=null;throw error;}return diagnostics();}
 function diagnostics(){return {prepared:!!renderer,disposed,suspended,generation,canvasCount:renderer?1:0,ownedAudioContexts:0,ownedAnimationLoops:0,features:featureLease?'exact-assets-master-response':masterBank?'basic-master-rms':'unavailable',featureEvidence:featureLease?.identity||masterBank?.identity||null,assetEvidence:featureLease?.assets()||null,tourEvidence:prepared?.tourEvidence||null,environment:renderer?.environment||null,graphicsLease:graphicsLease?.diagnostics()||null,resources:renderer?{programs:Object.keys(renderer.programs).length,buffers:renderer.buffers.length,vaos:renderer.vaos.length,targets:renderer.targets.length}:null,route:renderer?.routeTelemetry||null};}
 function dispose(){if(disposed)return;drop();state=null;cache=null;prepared=null;disposed=true;}
 return {prepare,evaluate,render,resize,suspend,restore,dispose,diagnostics};
}
