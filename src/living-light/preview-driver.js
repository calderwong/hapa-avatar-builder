/** The host has one frame handle only while its existing master player moves.
 * Paused seeks/resize/controls redraw once. Media capture follows replacement
 * audio elements without owning a decoder, audible clock or second player. */
export function createLivingLightPreviewDriver({canvas,runtime,getAudio,getFrame,documentTarget=globalThis.document,requestFrame=globalThis.requestAnimationFrame,cancelFrame=globalThis.cancelAnimationFrame,resizeObserverFactory=globalThis.ResizeObserver?(callback=>new globalThis.ResizeObserver(callback)):null,onStatus=()=>{},onError=()=>{}}={}) {
 let disposed=false,failed=false,contextLost=false,suspended=false,handle=null,lastPicture=null,draws=0,lastSignalStatus=null;
 const events=['play','playing','pause','ended','timeupdate','seeking','seeked','loadedmetadata','emptied','durationchange','ratechange'];
 const cancel=()=>{if(handle!==null){cancelFrame(handle);handle=null;}};
 const stop=error=>{cancel();failed=true;onError(error);};
 const visible=()=>!documentTarget.hidden&&!contextLost;
 function draw(force=false){
  if(disposed||failed||!visible())return null;
  try{
   const input=getFrame(),packet=runtime.evaluate(input);
   if(packet?.signalRouting){
    const routing=packet.signalRouting,ports=Object.entries(routing.ports).map(([port,value])=>`${port}: ${value.state}`),message=(routing.blocked?'Visual response blocked; waiting for selected signals. ':'Audio choices · ')+ports.join(' · ');
    if(message!==lastSignalStatus){onStatus(message);lastSignalStatus=message;}
   }
   const picture=packet?`${packet.generation}:${packet.visualUs}:${!!input.playing}:${!!input.reducedMotion}:${packet.quality}:${input.viewport?.width}:${input.viewport?.height}`:null;
   if(packet&&(force||picture!==lastPicture)&&runtime.render(packet)!==false){lastPicture=picture;draws++;}
   return input;
  }catch(error){stop(error);return null;}
 }
 function synchronize(force=false){
  if(disposed)return;cancel();
  const input=draw(force);
  // Holding the picture has no frame work, even when the audible source plays.
  if(input?.playing&&!input.reducedMotion&&!failed&&visible())handle=requestFrame(tick);
 }
 function tick(){handle=null;synchronize();}
 function media(event){if(event.target===getAudio())synchronize();}
 function suspend(){cancel();if(!suspended){runtime.suspend();suspended=true;}}
 function recover(){
  if(disposed||failed||!visible())return;
  try{if(suspended){runtime.restore();suspended=false;lastPicture=null;}synchronize(true);}
  catch(error){stop(error);}
 }
 function visibility(){if(documentTarget.hidden)suspend();else recover();}
 function lost(event){if(disposed)return;event.preventDefault();contextLost=true;suspend();onStatus('Graphics context lost; waiting for recovery…');}
 function restored(){if(disposed)return;contextLost=false;recover();if(!failed)onStatus('Graphics restored · selected source time retained');}
 for(const event of events)documentTarget.addEventListener(event,media,true);
 documentTarget.addEventListener('visibilitychange',visibility);
 canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
 const observer=resizeObserverFactory?.(()=>synchronize(true));observer?.observe(canvas);
 if(documentTarget.hidden)suspend();else synchronize(true);
 function dispose(){
  if(disposed)return;disposed=true;cancel();observer?.disconnect();
  for(const event of events)documentTarget.removeEventListener(event,media,true);
  documentTarget.removeEventListener('visibilitychange',visibility);
  canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
  runtime.dispose();
 }
 return {redraw:()=>synchronize(true),dispose,diagnostics:()=>({disposed,failed,contextLost,suspended,pendingFrames:handle===null?0:1,draws,audibleSourcesOwned:0})};
}
