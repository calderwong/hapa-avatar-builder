import {livingLightMediaKey,livingLightMediaTime} from '../domain/living-light-media.js';

/** Bounded native depth surfaces. Echo owns time/audio/RAF; this adapter owns
 * at most two muted decoders and their textures. No vendor source is changed. */
export function installLivingLightMedia({renderer:r,native,journey,sources=[],onChange=()=>{},videoFactory=()=>document.createElement('video')}){
 const gl=r.gl,entries=[],previousDraw=r.drawScene.bind(r);let disposed=false,clockUs=0,playing=false;
 const notify=()=>{if(!disposed)onChange();};
 const activeRow=()=>journey.schedule.find(row=>clockUs>=row.startUs&&clockUs<row.endUs)||journey.schedule.at(-1);
 function visibleInstance(){
  const row=activeRow();
  if(journey.mode==='continuous')return row.instanceId;
  if(row.fromInstanceId)return r.state._tunnel?row.instanceId:r.state._incoming?row.toInstanceId:row.fromInstanceId;
  return row.instanceId;
 }
 function destroy(entry){
  clearTimeout(entry.timer);clearTimeout(entry.seekTimer);const video=entry.video;
  if(video){for(const [type,fn]of entry.listeners)video.removeEventListener(type,fn);video.pause();video.removeAttribute('src');video.load();video.remove();}
  if(entry.texture)gl.deleteTexture(entry.texture);
 }
 try{for(const slot of journey.mediaSlots.filter(s=>s.enabled)){
  const source=sources.find(s=>livingLightMediaKey(s.ref)===livingLightMediaKey(slot.mediaRef));
  const row=journey.schedule.find(row=>row.instanceId===slot.surfaceRef.instanceId);
  const entry={slot,row,status:source?'loading':'unresolved',message:source?'Loading clip…':'Open the exact source cut, or explicitly replace this clip.',listeners:[],video:null,texture:null,desired:null,settled:null,dirty:false};entries.push(entry);
  if(!source)continue;
  const video=videoFactory();entry.video=video;video.muted=true;video.defaultMuted=true;video.volume=0;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';video.loop=false;
  const listen=(type,fn)=>{entry.listeners.push([type,fn]);video.addEventListener(type,fn);};
  const error=message=>{if(disposed)return;clearTimeout(entry.timer);clearTimeout(entry.seekTimer);video.pause();entry.paintReady=false;entry.status='error';entry.message=message;notify();};
  listen('error',()=>error('Clip could not decode. Placement retained; choose another source.'));
  listen('loadeddata',()=>{
   if(disposed||entry.status!=='loading')return;
   try{livingLightMediaTime(slot,row,row.startUs,video.duration);if(!(video.videoWidth>0&&video.videoHeight>0))throw Error('Clip has no decoded picture.');
    entry.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,entry.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    clearTimeout(entry.timer);entry.status='ready';entry.message='Muted clip follows the recipe clock';entry.dirty=true;notify();
   }catch(e){error(e.message);}
  });
  listen('seeked',()=>{if(disposed||entry.status!=='ready')return;clearTimeout(entry.seekTimer);entry.settled=entry.desired;entry.dirty=true;notify();});
  entry.fail=error;
  entry.timer=setTimeout(()=>error('Clip loading timed out. Study the recipe again to retry.'),15000);
  video.src=source.uri;video.load();
 }}catch(error){for(const entry of entries)destroy(entry);throw error;}
 function sync(entry){
  const video=entry.video;if(entry.status!=='ready')return false;
  const target=livingLightMediaTime(entry.slot,entry.row,clockUs,video.duration),moving=playing&&clockUs>=entry.row.startUs&&clockUs<entry.row.endUs;
  const discontinuity=entry.lastClockUs!==undefined&&(clockUs<entry.lastClockUs||Math.abs(clockUs-entry.lastClockUs)>250000);
  entry.lastClockUs=clockUs;entry.target=target;
  const terminal=livingLightMediaTime({...entry.slot,loopPolicy:'hold'},entry.row,Number.MAX_SAFE_INTEGER,video.duration),holding=moving&&entry.slot.loopPolicy==='hold'&&target>=terminal;
  const needSeek=!video.seeking&&(moving&&!holding?(discontinuity||Math.abs(video.currentTime-target)>.12||video.currentTime<entry.slot.trim.inUs/1e6||video.currentTime>terminal):(entry.settled!==target&&Math.abs(video.currentTime-target)>.001));
  if(needSeek){entry.desired=target;entry.dirty=false;clearTimeout(entry.seekTimer);entry.seekTimer=setTimeout(()=>entry.fail('Clip seek timed out. Study the recipe again to retry.'),5000);try{video.currentTime=target;}catch{entry.fail('Clip could not seek to the requested frame.');return false;}}
  if(holding)video.pause();
  else if(moving&&video.paused&&!entry.playPending&&!entry.playDenied){entry.playPending=true;Promise.resolve(video.play()).catch(()=>{if(!disposed){entry.playDenied=true;entry.message='Clip playback was denied; pause and play again.';notify();}}).finally(()=>{entry.playPending=false;});}
  else if(!moving){if(!video.paused)video.pause();entry.playDenied=false;}
  if(video.seeking||needSeek||video.readyState<2)return false;
  gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);entry.dirty=false;}
  catch{entry.status='error';entry.message='Video texture unavailable. Source may not permit this use.';video.pause();notify();return false;}
  finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}
  return true;
 }
 function paint(frame,entry){
  const surface=entry.slot.surfaceRef.surfaceId,tunnel=r.state._tunnel||r.state._journey;
  const side=surface==='wall-left'?1:-1,base=Math.floor(frame.cam.eye[2]/12)*12;
  const panels=tunnel?[0,1,2].map(i=>({pos:[side*2.65,0,base+8+i*12],angles:[0,side*.9,0],size:[2.2,2.8]})):[{pos:[0,.2,1.45],angles:[0,0,0],size:[3.4,3.4]}];
  r.bind(r.scene);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  const p=r.programs.media;gl.useProgram(p.p);gl.bindVertexArray(r.quadVAO);
  for(const panel of panels){native.HapaRenderer.uniforms(gl,p,{uPV:frame.cam.pv,uModel:native.HapaMath.model(panel.pos,panel.angles),uSize:panel.size,uVideo:0,uMediaAspect:entry.video.videoWidth/entry.video.videoHeight,uSurfaceAspect:panel.size[0]/panel.size[1],uRadiance:.25,uMediaGain:entry.slot.brightness,uMask:surface==='portal'?1:0,uGrade:1,uEye:frame.cam.eye,uHighlight:frame.values.uHighlight,uAccent:frame.values.uAccent});r.texture(entry.texture,0);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;}
 }
 // Wrap the complete scene path: specialized Location renderers return before
 // the original generic drawMedia hook. The final optical pass remains native.
 r.drawScene=function(time){const frame=previousDraw(time),id=visibleInstance();for(const entry of entries)if(entry.slot.surfaceRef.instanceId===id&&entry.paintReady)paint(frame,entry);return frame;};
 return {
  sync(packet){clockUs=packet.visualUs;playing=packet.playing&&!packet.reducedMotion;for(const entry of entries)entry.paintReady=sync(entry);},
  suspend(){playing=false;for(const e of entries)e.video?.pause();},
  diagnostics:()=>entries.map(e=>({surface:e.slot.surfaceRef,mediaRef:e.slot.mediaRef,status:e.status,message:e.message,paintReady:!!e.paintReady,targetSeconds:e.target??null,decodedSeconds:e.video?.currentTime??null,muted:e.video?.muted??true,paused:e.video?.paused??true})),
  dispose(){if(disposed)return;disposed=true;r.drawScene=previousDraw;for(const entry of entries)destroy(entry);}
 };
}
