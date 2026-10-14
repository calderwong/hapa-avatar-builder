import {createEchoLivingLightPreview} from './director-preview.js';

const fault=(code,message)=>Object.assign(Error(message),{code});
const aborted=()=>fault('living_light_offline_aborted','Living Light frame preparation was canceled.');

/** Frame-addressed adapter over the native Director owner. Timers only bound
 * readiness; every picture is evaluated at the requested integer song time.
 * No player, audio clock, RAF, store, network policy or source fallback is owned here. */
export function createEchoLivingLightOfflineRenderer({width,height,fps=30,durationUs,
 canvasFactory=()=>document.createElement('canvas'),previewFactory=createEchoLivingLightPreview,
 frameTimeoutMs=30000,prepareInput,...previewOptions}={}){
 for(const size of [width,height])if(!Number.isSafeInteger(size)||size<1||size>3840)throw Error('Invalid offline output size');
 if(!Number.isSafeInteger(fps)||fps<1||fps>120)throw Error('Offline frame rate must be an integer from 1 to 120');
 if(!Number.isSafeInteger(durationUs)||durationUs<1||durationUs>1800e6)throw Error('Invalid offline song duration');
 if(!Number.isSafeInteger(frameTimeoutMs)||frameTimeoutMs<1||frameTimeoutMs>60000)throw Error('Invalid offline frame timeout');
 const canvas=canvasFactory(),staging=canvasFactory();
 canvas.width=staging.width=width;canvas.height=staging.height=height;
 const context=staging.getContext('2d');if(!context)throw Error('Offline staging canvas is unavailable');
 const frameCount=Math.ceil(durationUs*fps/1e6);
 let disposed=false,pending=null,prepared=null,wake=null,contextLost=false;
 const invalidate=()=>wake?.();
 const lost=event=>{event.preventDefault();contextLost=true;pending?.abort(fault('living_light_offline_context_lost','Living Light graphics context was lost. Restart the render.'));dispose();};
 canvas.addEventListener('webglcontextlost',lost);
 let host;
 const exactInput=async(journey,options)=>{
  const bound=!!journey.sourceBindingRef||journey.instances.some(instance=>Object.keys(instance.bindings||{}).length);
  const input=prepareInput?await prepareInput(journey,options):{neutralStudy:true};
  if(bound&&(!input?.featureInput||input.neutralStudy))throw fault('living_light_offline_source_required','Resolve the exact saved audio choices before rendering this Journey.');
  return input;
 };
 try{host=previewFactory({...previewOptions,canvas,durationUs,prepareInput:exactInput,onInvalidate:invalidate});}
 catch(error){canvas.removeEventListener('webglcontextlost',lost);throw error;}
 function frameTime(frameIndex){
  if(!Number.isSafeInteger(frameIndex)||frameIndex<0||frameIndex>=frameCount)throw fault('living_light_offline_frame_invalid','Frame index is outside the output timeline.');
  return Math.round(frameIndex*1e6/fps);
 }
 function assertLive(){if(contextLost)throw fault('living_light_offline_context_lost','Living Light graphics context was lost. Restart the render.');if(disposed)throw fault('living_light_offline_disposed','Offline Living Light renderer is disposed.');}
 function wait(signal){
  return new Promise((resolve,reject)=>{
   let timer;
   const finish=error=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);if(wake===ready)wake=null;error?reject(error):resolve();};
   const ready=()=>finish(),cancel=()=>finish(signal.reason||aborted());
   wake=ready;signal.addEventListener('abort',cancel,{once:true});
   // Decoders can become ready without a notification; this does not advance time.
   timer=setTimeout(ready,25);if(signal.aborted)cancel();
  });
 }
 async function prepareFrame(frameIndex,{signal}={}){
  assertLive();const songUs=frameTime(frameIndex);
  if(pending)throw fault('living_light_offline_busy','Prepare one Living Light output frame at a time.');
  if(signal?.aborted)throw aborted();
  prepared=null;
  const controller=new AbortController();pending=controller;
  const cancel=()=>controller.abort(aborted());signal?.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(()=>controller.abort(fault('living_light_offline_timeout','Timed out waiting for the exact Living Light output frame.')),frameTimeoutMs);
  try{
   context.clearRect(0,0,width,height);
   for(;;){
    assertLive();if(controller.signal.aborted)throw controller.signal.reason;
    try{
     const receipt=host.capture({timelineUs:songUs,playing:false,reducedMotion:false,quality:'high',viewport:{width,height}},source=>{
      const gl=source.getContext('webgl2');
      if(!gl||gl.isContextLost())throw fault('living_light_offline_context_lost','Living Light graphics context was lost. Restart the render.');
      context.drawImage(source,0,0,width,height);
     });
     assertLive();if(controller.signal.aborted)throw controller.signal.reason;
     prepared={schemaVersion:'hapa.living-light.offline-frame.v1',frameIndex,songUs,width,height,fps,active:receipt!==null,cue:receipt};
     return structuredClone(prepared);
    }catch(error){if(error.code!=='living_light_capture_waiting')throw error;}
    await wait(controller.signal);
   }
  }catch(error){dispose();throw error;}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);pending=null;}
 }
 function paintFrame(frameIndex,target){
  assertLive();frameTime(frameIndex);
  if(pending||prepared?.frameIndex!==frameIndex)throw fault('living_light_offline_unprepared','Prepare this exact Living Light frame before painting it.');
  if(prepared.active)target.drawImage(staging,0,0,width,height);
  return structuredClone(prepared);
 }
 function dispose(){
  if(disposed)return;disposed=true;prepared=null;pending?.abort(aborted());
  canvas.removeEventListener('webglcontextlost',lost);host.dispose();
  canvas.width=canvas.height=staging.width=staging.height=1;
 }
 return {frameCount,frameTime,prepareFrame,paintFrame,dispose,diagnostics:()=>({disposed,contextLost,pending:!!pending,preparedFrame:prepared?.frameIndex??null,frameCount,width,height,fps,native:host.diagnostics(),ownedAudioContexts:0,ownedAnimationLoops:0})};
}
