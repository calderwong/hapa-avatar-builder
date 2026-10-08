
/* Transactional media slots. Old source survives failed replacement. Never executes URL code.
   Public URLs must allow CORS and browser decoding. Arbitrary file:// paths are not supported;
   use an explicit File selection or local HTTP endpoint. A hapa:// URI requires a resolver. */
'use strict';
window.HapaMediaRegistry={
 'builtin:tidal-atlas':{uri:'assets/media/tidal-atlas.mp4',name:'Tidal Atlas',credit:'Original procedural fixture · CC0-1.0',license:'CC0-1.0',kind:'bundled-video'},
 'builtin:solar-silk':{uri:'assets/media/solar-silk.mp4',name:'Solar Silk',credit:'Original procedural fixture · CC0-1.0',license:'CC0-1.0',kind:'bundled-video'},
 'public:nasa-moon':{uri:'https://svs.gsfc.nasa.gov/vis/a000000/a004600/a004619/moontour_notitle_360p30.mp4',name:'NASA Moon Tour · silent, no titles',credit:"Source: NASA Scientific Visualization Studio / Ernie Wright. No endorsement.",license:'Public domain visual material per NASA SVS, subject to noted exceptions and media guidelines',kind:'remote-video',sourcePage:'https://svs.gsfc.nasa.gov/4619/',networkQualification:'Publisher URL reviewed; remote bytes/CORS not qualified in build environment.'}
};
window.HapaMedia=class{
 constructor(renderer,transport){this.r=renderer;this.gl=renderer.gl;this.transport=transport;this.slots={A:null,B:null};this.generations={A:0,B:0};this.pending={A:null,B:null};this.errors={A:null,B:null};this.resolvers=new Map();this.disposed=false;}
 registerResolver(scheme,fn){if(!/^[a-z][a-z0-9+-]*$/.test(scheme)||['http','https','blob','data','javascript','file','assets','builtin','public'].includes(scheme))throw Error('Reserved or invalid resolver scheme.');if(typeof fn!=='function')throw Error('Resolver must be a function.');this.resolvers.set(scheme,fn);return()=>this.resolvers.delete(scheme);}
 async resolve(input){
  if(input instanceof File){if(!/\.(mp4|webm|mov|m4v)$/i.test(input.name)&&!input.type.startsWith('video/'))throw Error('Select an MP4 or WebM video.');if(input.size>1024*1024*1024)throw Error('Prototype file limit is 1 GiB.');const uri=URL.createObjectURL(input);return{uri,originalUri:null,name:input.name,credit:'User-selected local file; rights not inferred.',license:'user-supplied',kind:'local-file',contentHash:await HapaHash(new Uint8Array(await input.arrayBuffer())),localFile:{name:input.name,size:input.size,lastModified:input.lastModified},cleanup:()=>URL.revokeObjectURL(uri)};}
  if(typeof input!=='string'||!input.trim()||input.length>8192)throw Error('A non-empty video URI is required.');input=input.trim();
  let record=HapaMediaRegistry[input]?{...HapaMediaRegistry[input],originalUri:input}:{uri:input,originalUri:input,name:'Custom video',credit:'User-supplied source; rights not verified.',license:'user-supplied',kind:'remote-video'};
  const scheme=record.uri.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  if(scheme&&!['http','https','blob'].includes(scheme)){
   const resolver=this.resolvers.get(scheme);if(!resolver)throw Error(`No ${scheme} resolver is registered. Use a File picker or a CORS-enabled HTTP video URL.`);
   const resolved=await resolver(record.uri,{purpose:'video-texture'});if(!resolved||typeof resolved.uri!=='string')throw Error('Resolver must return {uri, ...metadata}.');record={...record,...resolved,originalUri:input,kind:'resolved-video'};
  }
  if(!record.uri.startsWith('assets/')){
   const url=new URL(record.uri,location.href);if(!['http:','https:','blob:'].includes(url.protocol))throw Error('Only video HTTP(S)/blob sources or registered resolvers are allowed.');if(url.username||url.password)throw Error('Credentials in URLs are not accepted. Use a local harness resolver.');
  }
  record.contentHash=window.HAPA_MEDIA_HASHES?.[record.originalUri]||record.contentHash;record.uri=this.transport.asset(record.uri,'video/mp4');return record;
 }
 async set(slot,input){
  if(!['A','B'].includes(slot))throw Error('Unknown media slot.');const generation=++this.generations[slot];this.pending[slot]?.cancel?.();this.errors[slot]=null;
  let record;try{record=await this.resolve(input);}catch(e){if(generation===this.generations[slot])this.errors[slot]=e.message;throw e;}
  if(generation!==this.generations[slot]||this.disposed){record.cleanup?.();throw Error('Superseded source request.');}
  const video=document.createElement('video');video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto';video.loop=true;video.style.display='none';document.body.appendChild(video);
  const obj={...record,video,texture:null,dirty:true,frameCount:0,mediaTime:0,offset:0,rate:1,status:'loading',slot,disposed:false};
  try{
   await new Promise((resolve,reject)=>{
    let finished=false;const finish=e=>{if(finished)return;finished=true;clearTimeout(timer);video.removeEventListener('loadeddata',ready);video.removeEventListener('error',error);e?reject(e):resolve();};
    const ready=()=>finish(),error=()=>finish(Error('Video could not be loaded. Check URL, CORS, codec, and network access.'));
    const timer=setTimeout(()=>finish(Error('Video load timed out; prior source retained.')),18000);
    obj.cancel=()=>finish(Error('Superseded source request.'));this.pending[slot]=obj;
    video.addEventListener('loadeddata',ready);video.addEventListener('error',error);video.src=record.uri;video.load();
   });
   if(generation!==this.generations[slot]||this.disposed)throw Error('Superseded source request.');
   if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('This prototype needs a finite seekable clip, not a live stream.');
   const gl=this.gl;obj.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,obj.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
   const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Video texture upload failed: WebGL '+error);
   obj.status='ready';obj.width=video.videoWidth;obj.height=video.videoHeight;obj.duration=video.duration;
   const frame=(now,metadata)=>{if(obj.disposed)return;obj.dirty=true;obj.mediaTime=metadata.mediaTime;obj.frameCount++;obj.vfc=video.requestVideoFrameCallback(frame);};if(video.requestVideoFrameCallback)obj.vfc=video.requestVideoFrameCallback(frame);video.addEventListener('seeked',()=>obj.dirty=true);
   const previous=this.slots[slot];this.slots[slot]=obj;this.pending[slot]=null;if(previous)this.destroy(previous);
   this.syncSlot(obj,this.transport.now(),this.transport.playing(),true);this.onChange?.(slot);return this.info(slot);
  }catch(e){this.destroy(obj);if(generation===this.generations[slot]){this.pending[slot]=null;this.errors[slot]=e.message;}throw e;}
 }
 target(obj,t){if(this.r.state.cut){const m=HapaEditorial.sourceTime(this.r.state,obj.slot,t,obj.duration);obj.cue=m;return m.target;}return ((t*obj.rate+obj.offset)%obj.duration+obj.duration)%obj.duration;}
 syncSlot(obj,t,playing,force=false){
  if(!obj||obj.status!=='ready')return;const video=obj.video,target=this.target(obj,t);let drift=video.currentTime-target;
  if(Math.abs(drift)>obj.duration*.5)drift+=drift>0?-obj.duration:obj.duration;
  obj.drift=drift;obj.targetTime=target;
  if((force||Math.abs(drift)>(playing?.2:.025))&&!video.seeking)video.currentTime=Math.max(0,Math.min(obj.duration-.001,target));
  const rate=obj.cue?.rate??1;video.playbackRate=Math.max(.25,rate||1);if(rate===0)playing=false;
  if(playing&&video.paused)video.play().catch(e=>{obj.playError=e.message;});if(!playing&&!video.paused)video.pause();
  if(!video.requestVideoFrameCallback)obj.dirty=true;
 }
 sync(t,playing,force=false){for(const obj of Object.values(this.slots))this.syncSlot(obj,t,playing,force);}
 async seekExact(t){
  await Promise.all(Object.values(this.slots).filter(Boolean).map(obj=>new Promise((resolve,reject)=>{
   const v=obj.video;v.pause();const target=Math.min(obj.duration-.001,this.target(obj,t));obj.targetTime=target;
   if(Math.abs(v.currentTime-target)<.008&&!v.seeking){obj.drift=v.currentTime-target;obj.dirty=true;return resolve();}
   const done=()=>{clearTimeout(timer);v.removeEventListener('seeked',done);obj.drift=v.currentTime-target;obj.mediaTime=v.currentTime;obj.dirty=true;resolve();};const timer=setTimeout(()=>{v.removeEventListener('seeked',done);reject(Error('Source seek timed out: '+obj.slot));},4000);v.addEventListener('seeked',done,{once:true});v.currentTime=target;
  })));
 }
 upload(){if(this.offline)return;const gl=this.gl;for(const obj of Object.values(this.slots)){if(!obj?.dirty||obj.video.readyState<2)continue;gl.bindTexture(gl.TEXTURE_2D,obj.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,obj.video);obj.dirty=false;}catch(e){obj.status='texture-error';this.errors[obj.slot]=e.message;}finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}}}
 async offlineFrames(frames){
  this.offline=true;const gl=this.gl;
  for(const slot of ['A','B']){const input=frames[slot],o=this.slots[slot];if(!input||!o)throw Error('Offline export requires both resolved frames');if(!input.startsWith('data:image/'))throw Error('Offline frame must be an explicit image data URI');
   o.video.pause();this.offlineCache??=new Map();let img=this.offlineCache.get(input);if(!img){img=new Image();img.src=input;await img.decode();this.offlineCache.set(input,img);if(this.offlineCache.size>64)this.offlineCache.delete(this.offlineCache.keys().next().value);}gl.bindTexture(gl.TEXTURE_2D,o.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);o.dirty=false;
  }
 }
 info(slot){const o=this.slots[slot];return o?{slot,name:o.name,status:o.status,width:o.width,height:o.height,duration:o.duration,mediaTime:o.video.currentTime,targetTime:o.targetTime,drift:o.drift,frameCount:o.frameCount,kind:o.kind,sourceRef:o.originalUri,contentHash:o.contentHash||window.HAPA_MEDIA_HASHES?.[o.originalUri]||null,credit:o.credit,localFile:o.localFile||null,error:this.errors[slot],pending:!!this.pending[slot]}:{slot,status:'empty',error:this.errors[slot],pending:!!this.pending[slot]};}
 snapshot(){return ['A','B'].map(s=>{const x=this.info(s);if(x.sourceRef?.startsWith('http')){const u=new URL(x.sourceRef);x.sourceRef=u.origin+u.pathname;x.queryOmitted=true;}return x;});}
 destroy(obj){if(!obj||obj.disposed)return;obj.disposed=true;const v=obj.video;v.pause();if(obj.vfc!==undefined)v.cancelVideoFrameCallback?.(obj.vfc);v.removeAttribute('src');v.load();v.remove();if(obj.texture)this.gl.deleteTexture(obj.texture);obj.cleanup?.();}
 dispose(){this.disposed=true;for(const s of ['A','B']){this.generations[s]++;this.pending[s]?.cancel?.();this.destroy(this.slots[s]);this.slots[s]=null;}}
};

