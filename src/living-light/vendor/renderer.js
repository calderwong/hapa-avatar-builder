
/* Native WebGL2 reference backend, no third-party runtime or network dependencies.
   Linear scene + selective emission + shared sampled depth + optical composition.
   Same host-independent module/parameter contract can feed a qualified Three adapter. */
'use strict';
window.HapaRenderer=(()=>{
const C=HapaCore,M=HapaMath,S=HapaShaders;
// Portable math is applied to the actual compiled source, including ISF fixtures.
function safeShader(source){
 const squareArgs=['r-.29','(r-.095)*60.','(rr-rad)*90.','abs(p.x)-1.05'];
 for(const x of squareArgs)source=source.split('pow('+x+',2.)').join('hpSquare('+x+')');
 source=source.replace(/pow\(1\.-abs\(dot\(n,v\)\),3\.\)/g,'pow(max(0.,1.-abs(dot(n,v))),3.)')
  .replace(/pow\(1\.-abs\(dot\(n,-rd\)\),3\.\)/g,'pow(max(0.,1.-abs(dot(n,-rd))),3.)')
  .replace('pow(1.-h,5.)','pow(clamp(1.-h,0.,1.),5.)')
  .replace('pow(1.-max(dot(N,V),0.),3.)','pow(clamp(1.-max(dot(N,V),0.),0.,1.),3.)')
  .replace(/pow\(1\.-max\(0\.,dot\(n,-rd\)\),(2\.6|2\.)\)/g,'pow(clamp(1.-max(0.,dot(n,-rd)),0.,1.),$1)')
  .replace('pow(1.-max(0.,dot(-rd,n)),4.5)','pow(clamp(1.-max(0.,dot(-rd,n)),0.,1.),4.5)')
  .replace(/\bnormalize\s*\(/g,'hpNormalize(');
 const helpers=`
precision highp float;
float hpSquare(float x){return x*x;}
vec2 hpNormalize(vec2 v){float d=dot(v,v);return d>1e-18?v*inversesqrt(d):vec2(0.);}
vec3 hpNormalize(vec3 v){float d=dot(v,v);return d>1e-18?v*inversesqrt(d):vec3(0.,0.,1.);}
vec4 hpNormalize(vec4 v){float d=dot(v,v);return d>1e-18?v*inversesqrt(d):vec4(0.);}
`;
 return source.replace(/(#version[^\n]*\n)/,'$1'+helpers);
}
function program(gl,vertex,fragment,label){
 vertex=safeShader(vertex);fragment=safeShader(fragment);
 const shaders=[gl.VERTEX_SHADER,gl.FRAGMENT_SHADER].map((type,i)=>{const s=gl.createShader(type);gl.shaderSource(s,i?fragment:vertex);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const msg=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(`${label}: ${msg}`);}return s;});
 const p=gl.createProgram();for(const s of shaders)gl.attachShader(p,s);gl.linkProgram(p);for(const s of shaders)gl.deleteShader(s);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(label+': '+gl.getProgramInfoLog(p));
 const uniforms=new Map();for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p,i);uniforms.set(u.name.replace(/\[0\]$/,''),{type:u.type,size:u.size,name:u.name,loc:gl.getUniformLocation(p,u.name)});}
 return{p,label,uniforms,vertexSource:vertex,fragmentSource:fragment};
}
function setUniforms(gl,p,data){
 for(const [k,v] of Object.entries(data)){const u=p.uniforms.get(k.replace(/\[0\]$/,''));if(!u||v===undefined)continue;switch(u.type){
  case gl.FLOAT: if(typeof v==='number')gl.uniform1f(u.loc,v);else gl.uniform1fv(u.loc,v);break;
  case gl.INT:case gl.BOOL:case gl.SAMPLER_2D:case gl.SAMPLER_3D:case gl.SAMPLER_2D_ARRAY:gl.uniform1i(u.loc,v);break;
  case gl.FLOAT_VEC2:gl.uniform2fv(u.loc,v);break;case gl.FLOAT_VEC3:gl.uniform3fv(u.loc,v);break;case gl.FLOAT_VEC4:gl.uniform4fv(u.loc,v);break;
  case gl.FLOAT_MAT4:gl.uniformMatrix4fv(u.loc,false,v);break;
 }}
}
class SpatialRenderer{
 constructor(canvas,score,cache,state){
  this.canvas=canvas;this.score=score;this.cache=cache;this.state=state;
  const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl)throw Error('WebGL 2 is required. Enable browser graphics acceleration.');this.gl=gl;
  this.hdr=!!gl.getExtension('EXT_color_buffer_float');this.timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.gpuStatus=this.timer?'pending':'unsupported';this.gpuMs=null;this.gpuSamples=[];this.lastGpuSample=null;
  const info=gl.getExtension('WEBGL_debug_renderer_info');this.environment={backend:'native WebGL2 reference',vendor:gl.getParameter(info?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(info?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),version:gl.getParameter(gl.VERSION),userAgent:navigator.userAgent,hdr:this.hdr,gpuTimerAvailable:!!this.timer};
  const gen=HapaISF.compileSource(HAPA_WEAVE_ISF),finish=HapaISF.compileSource(HAPA_FINISH_ISF);
  this.isfAdmission={generator:gen.meta,filter:finish.meta,supported:'single-pass generator and image filter fixtures only',notSupported:['feedback','multipass','audio textures','vertex companions','arbitrary ISF library']};
  this.programs={media:program(gl,S.mediaVertex,S.mediaFragment,'video surfaces'),field:program(gl,S.vertex,S.field,'world field'),mesh:program(gl,S.meshVertex,S.meshFragment,'3D ribbons'),points:program(gl,S.pointVertex,S.pointFragment,'motes'),generator:program(gl,S.vertex,gen.fragment,'original ISF weave'),visibility:program(gl,S.vertex,S.visibility,'depth visibility'),blur:program(gl,S.vertex,S.blur,'selective bloom'),composite:program(gl,S.vertex,S.composite,'optical composition'),finish:program(gl,S.vertex,finish.fragment,'original ISF finish')};
  this.buffers=[];this.vaos=[];this.targets=[];this.makeGeometry();this.width=0;this.height=0;this.frame=0;this.stats={};this.lastTime=0;this.historyReset='initial';this.needsPattern=true;
  this.resize(640,360);
 }
 makeGeometry(){
  const gl=this.gl;
  const attribute=(arr,index,size)=>{const b=gl.createBuffer();this.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,0,0);};
  this.fullVAO=gl.createVertexArray();this.vaos.push(this.fullVAO);gl.bindVertexArray(this.fullVAO);attribute([-1,-1,3,-1,-1,3],0,2);
  this.ribbonVAO=gl.createVertexArray();this.vaos.push(this.ribbonVAO);gl.bindVertexArray(this.ribbonVAO);const uv=[];let seg=196,w=12;
  for(let i=0;i<seg;i++)for(let j=0;j<w;j++){const a=[i/seg,j/w],b=[(i+1)/seg,j/w],c=[(i+1)/seg,(j+1)/w],d=[i/seg,(j+1)/w];uv.push(...a,...b,...c,...a,...c,...d);}attribute(uv,0,2);this.ribbonVertices=uv.length/2;
  this.quadVAO=gl.createVertexArray();this.vaos.push(this.quadVAO);gl.bindVertexArray(this.quadVAO);attribute([0,0,1,0,1,1,0,0,1,1,0,1],0,2);
  this.pointVAO=gl.createVertexArray();this.vaos.push(this.pointVAO);gl.bindVertexArray(this.pointVAO);const points=[],sizes=[];let seed=17483;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<740;i++){points.push((rand()-.5)*24,(rand()-.5)*20,(rand()-.5)*96);sizes.push(.7+rand()*1.8);}attribute(points,0,3);attribute(sizes,1,1);this.pointCount=sizes.length;gl.bindVertexArray(null);
 }
 target(w,h,{count=1,depth=false,float=false}={}){
  const gl=this.gl,fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);const textures=[];
  for(let i=0;i<count;i++){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,float?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0);textures.push(t);}
  let depthTexture=null;
  if(depth){depthTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,depthTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTexture,0);}
  gl.drawBuffers(textures.map((_,i)=>gl.COLOR_ATTACHMENT0+i));const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);if(status!==gl.FRAMEBUFFER_COMPLETE)throw Error('Framebuffer incomplete: '+status);
  // Initialize every attachment, including a destination not yet rendered at this size.
  const depthMask=gl.getParameter(gl.DEPTH_WRITEMASK);gl.depthMask(true);for(let i=0;i<count;i++)gl.clearBufferfv(gl.COLOR,i,new Float32Array([0,0,0,1]));if(depth)gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));gl.depthMask(depthMask);
  const o={fbo,textures,depthTexture,w,h,float,count};this.targets.push(o);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return o;
 }
 deleteTargets(){const gl=this.gl;for(const t of this.targets){for(const x of t.textures)gl.deleteTexture(x);if(t.depthTexture)gl.deleteTexture(t.depthTexture);gl.deleteFramebuffer(t.fbo);}this.targets=[];}
 resize(w,h){w=Math.max(64,Math.round(w));h=Math.max(64,Math.round(h));if(w===this.width&&h===this.height)return;
  this.deleteTargets();this.quietScratch=null;this.width=this.canvas.width=w;this.height=this.canvas.height=h;const bW=Math.ceil(w/2),bH=Math.ceil(h/2);
  this.scene=this.target(w,h,{count:2,depth:true,float:this.hdr});this.destination=this.target(w,h,{count:2,depth:true,float:this.hdr});this.bloomA=this.target(bW,bH,{float:this.hdr});this.bloomB=this.target(bW,bH,{float:this.hdr});this.display=this.target(w,h);this.edgeInput=this.target(w,h);this.pattern=this.target(384,384);this.visibility=this.target(1,1);this.needsPattern=true;this.historyReset='resize';
 }
 bind(target){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?.w||this.width,target?.h||this.height);}
 texture(tex,unit){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);}
 full(program,target,data,textures=[]){const gl=this.gl;this.bind(target);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.BLEND);gl.useProgram(program.p);setUniforms(gl,program,data);textures.forEach((t,i)=>this.texture(t,i));gl.bindVertexArray(this.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;}
 colors(){if(this.state._colors)return this.state._colors;const cf=this.state.cut?HapaEditorial.frame(this.state,this.state._cueTime??this.renderTime??0):null;const id=cf?.palette&&cf.palette!=='inherit'?cf.palette:this.state.palette;const p=C.palettes.find(p=>p.id===id)||C.palettes[0];const base=Object.fromEntries(Object.entries(p.roles).map(([k,v])=>['u'+k[0].toUpperCase()+k.slice(1),C.linearHex(v)]));return HapaArticulation.palette(base,this.cache,this.state,this.renderTime||0);}
 pollGPU(){
  const gl=this.gl;if(!this.timer)return;
  if(gl.getParameter(this.timer.GPU_DISJOINT_EXT)){for(const q of this.pending)gl.deleteQuery(q.query);this.pending=[];this.gpuMs=null;this.gpuStatus='disjoint';return;}
  while(this.pending.length&&gl.getQueryParameter(this.pending[0].query,gl.QUERY_RESULT_AVAILABLE)){const q=this.pending.shift();this.gpuMs=gl.getQueryParameter(q.query,gl.QUERY_RESULT)/1e6;this.gpuStatus='valid';const sample={frame:q.frame,world:q.world,time:q.time,resolution:q.resolution,ms:this.gpuMs};this.gpuSamples.push(sample);if(this.gpuSamples.length>256)this.gpuSamples.shift();this.lastGpuSample=sample;gl.deleteQuery(q.query);}
 }
 frameValues(t){
  const state=this.state,e=C.evaluate(this.cache,state,t),v=e.values,cam=M.camera(t,this.width/this.height,state,e),palette=this.colors();
  // An actual emissive world-space beacon rides an authored rail in the corridor.
  // It is not an always-visible screen flare; the geometry/depth controls visibility.
  let source=cam.kind===0?[1.85+Math.sin(e.phase*.09)*.75,1.15+Math.sin(e.phase*.06)*.45,22+e.phase*1.0]:[2.25+.55*Math.sin(e.phase*.08),1.5,-.90];
  if(cam.kind===5)source=[-5.2,3.0,-6.8];
  if(state.beaconTest)source=M.add(M.add(cam.eye,M.scale(cam.forward,7)),M.scale(cam.right,1.4));
  const toward=M.norm(M.sub(cam.eye,source)),front=M.add(source,M.scale(toward,.33));const proj=M.transform(cam.pv,[...front,1]);const sourceUV=[proj[0]/proj[3]*.5+.5,proj[1]/proj[3]*.5+.5,proj[2]/proj[3]*.5+.5];
  const events=this.score.stems.find(s=>s.id==='drums')?.events||[];let k=events.length-1;while(k>=0&&events[k].time>t)k--;const pulses=new Float32Array(12);
  for(let i=0;i<6;i++){const ev=events[k-i];if(!ev||t-ev.time>4||!state.stems.drums.visual||this.cache.fixture!=='song'){pulses[i*2]=-10000;continue;}const age=t-ev.time,origin=state._tunnel?(-.35+(state._bridge?.length||28)*HapaCurrents.progress(this.cache,state,state._bridge,ev.time)):-7+this.cache.phase(ev.time)*1.0;pulses[i*2]=cam.kind===0?origin+4+age*10:1.25+age*1.9;pulses[i*2+1]=ev.strength*Math.exp(-age*.85)*state.response;}
  if(this.cache.fixture==='impulse'){pulses[0]=cam.kind===0?cam.eye[2]+4+(t%4-1)*10:1.25+(t%4-1)*1.9;pulses[1]=v['world.impulse'];}
  const gestures=HapaHorizons.evaluate(state,t),gw=new Float32Array(8);for(let i=0;i<4;i++){const w=gestures.waves[i];gw[i*2]=w?w.age:-100;gw[i*2+1]=w?w.amplitude:0;}
  const dominant=Math.max(e.director?.features.vocal||0,e.director?.features.guitar||0),attention=state.horizons?.attention?.82-.20*dominant:1;
  const cq=e.currents;const values={uPhraseCue:cq.cue,uPhrasePacket:cq.packetUniform,uPhraseTint:cq.packet.color,uGestureWaves:gw,uOpenGesture:gestures.open,uSpotlight:gestures.spotlight,uAttention:Math.max(.38,attention-gestures.spotlight*.24),uFilter:state.horizons?.filter?1:0,uReflections:state.horizons?.reflections?1:0,...palette,uEmitColor:palette.uEmission,uResolution:[this.width,this.height],uEye:cam.eye,uForward:cam.forward,uRight:cam.right,uUp:cam.up,uPV:cam.pv,uFov:cam.fov,uSource:source,uTime:t,uPhase:e.phase*(state.reduced?.18:1),uWorld:cam.kind,uPassage:state._tunnel?1:0,uThreadMode:state._bridge?.style==='thread'?1:0,uExitZ:state._bridge?.length||28,uPolish:state._polish?1:0,uResonance:state.flow?.resonance===false?0:1,uBreath:v['world.breath'],uWarp:v['material.warp'],uScale:v['material.scale'],uEmission:v['material.emission'],uVocal:v['vocal.presence'],uPulse:v['world.impulse'],uMotion:state.reduced?.08:v['camera.motion'],uDust:v['atmosphere.dust'],uWeave:state.effects.weave?1:0,uTextureMode:state.materialMode==='texture'?1:0,uWeaveTex:0,uPulses:pulses,uSteps:state.quality==='high'?148:state.quality==='draft'?68:104,uIterations:state.quality==='high'?4:3};
  const loom=HapaLoom.evaluate(this.cache,state,t,{frame:e,cam});Object.assign(values,loom.uniforms);
  const geometry=HapaGeometryDance.evaluate(this.cache,state,t,{kin:e.articulation,macro:e.director?.values});Object.assign(values,geometry.uniforms);
  // Distinct uEmission scalar and uEmitColor vector, never mix intensity into role RGB.
  return {e,values,cam,source,sourceUV,sourceFront:proj[3]>0,loom,geometry};
 }
 drawScene(t){
  const gl=this.gl;this.renderTime=t;

  const cut=this.state.cut?HapaEditorial.frame(this.state,t):null;const f=this.frameValues(t),u=f.values,v=f.e.values,state=this.state,decorPhase=u.uPhase;this.lastFrame=f;
  if(this.needsPattern||state.materialMode==='texture'||state.debug==='pattern'){
   this.full(this.programs.generator,this.pattern,{RENDERSIZE:[384,384],TIME:t,TIMEDELTA:1/30,FRAMEINDEX:Math.floor(t*30),patternScale:v['material.scale'],warp:v['material.warp'],lineWidth:.065,useHostPhase:1,hostPhase:decorPhase*.30,colorA:[0,0,0,1],colorB:[1,1,1,1],gain:1,maskOnly:1});this.needsPattern=false;
  }
  if(HapaElectricity.active(state)&&this.drawElectricity)return this.drawElectricity(t,f);
  if(HapaDynamics.relevant(state)&&this.drawDynamics)return this.drawDynamics(t,f);
  if(HapaWind.combined(state)&&this.drawConfluence)return this.drawConfluence(t,f);
  if(HapaFire.active(state)&&this.drawFire)return this.drawFire(t,f);
  if(HapaWater.enabled(state)&&this.drawWater)return this.drawWater(t,f);
  if((f.cam.kind>=7||(state._tunnel&&HapaRealms.styles.includes(state._bridge?.style)))&&this.drawRealms)return this.drawRealms(t,f);
  if(state._tunnel&&HapaOctave.styles.includes(state._bridge?.style)&&this.drawOctaveTunnel)return this.drawOctaveTunnel(t,f);
  if(f.cam.kind===6&&this.drawReliquary)return this.drawReliquary(t,f);
  this.bind(this.scene);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.programs.field.p);setUniforms(gl,this.programs.field,u);this.texture(this.pattern.textures[0],0);gl.bindVertexArray(this.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;
  this.drawStage?.(t,f,this.scene);
  if(state.effects.meshes){
   const p=this.programs.mesh;gl.useProgram(p.p);setUniforms(gl,p,{...u,uBlocker:0,uMediaWeave:1,uUseMedia:state.videoWeave&&this.mediaManager?.slots.A?1:0});if(this.mediaManager?.slots.A)this.texture(this.mediaManager.slots.A.texture,1);gl.bindVertexArray(this.ribbonVAO);
   let models;
   if(f.cam.kind===0){const z=6+f.e.phase*1.0;models=[M.model([-3.05,0,z],[.22,1.0,decorPhase*.009],.82),M.model([3.05,0,z+10],[-.22,-1.0,-decorPhase*.008],.82),M.model([0,0,z+21],[0,0,decorPhase*.003],1.15)];}
   else if(f.cam.kind===1)models=[M.model([0,0,0],[.6,.30,decorPhase*.016],1),M.model([0,0,0],[1.16,-.6,-decorPhase*.013],1.04)];
   else if(f.cam.kind===5)models=[M.model([-5.3,1.0,-1.6],[.04,.5,.05],1.0),M.model([5.4,1.15,-4.7],[-.04,-.38,-.12],1.14),M.model([0,1.6,-7.8],[.08,.08,.08],.85)];
   else if(f.cam.kind===4)models=[M.model([-3.6,.15,-.2],[.3,.4,decorPhase*.009],.48),M.model([3.6,.15,-.2],[-.3,-.4,-decorPhase*.009],.48)];
   else if(f.cam.kind===3)models=[M.model([-3.65,.12,-.50],[.25,.4,decorPhase*.008],.52),M.model([3.65,.12,-.50],[-.25,-.4,-decorPhase*.009],.52),M.model([0,.2,-1.25],[0,0,decorPhase*.006],1.30)];
   else models=[M.model([0,.2,0],[.75,.1,decorPhase*.017],1),M.model([0,.2,0],[-.7,.65,-decorPhase*.014],.87),M.model([0,.2,0],[1.35,-.3,decorPhase*.008],.72)];
   for(const model of models){setUniforms(gl,p,{uModel:model,uShape:f.cam.kind===5?5:f.cam.kind===2?1:0});gl.drawArrays(gl.TRIANGLES,0,this.ribbonVertices);this.drawCalls++;}
   if(f.cam.kind===3){for(let i=0;i<4;i++){setUniforms(gl,p,{uModel:M.model([0,.2,-1.18-i*.24],[0,0,0],1+i*.164),uShape:3});gl.drawArrays(gl.TRIANGLES,0,this.ribbonVertices);this.drawCalls++;}}
  }
  this.drawMedia?.(f,t);this.flowDecor?.(f,t);
  if(state.occluder){
   const pos=M.add(f.cam.eye,M.scale(M.sub(f.source,f.cam.eye),.50)),b=M.identity(),r=M.scale(f.cam.right,.7),up=M.scale(f.cam.up,.7),fw=f.cam.forward;b.set([...r,0],0);b.set([...up,0],4);b.set([...fw,0],8);b.set([...pos,1],12);
   gl.useProgram(this.programs.mesh.p);setUniforms(gl,this.programs.mesh,{...u,uModel:b,uShape:2,uBlocker:1});gl.bindVertexArray(this.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);this.drawCalls++;
  }
  if(state.effects.dust){
   gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(this.programs.points.p);setUniforms(gl,this.programs.points,{...u,uPointScale:this.height/420});gl.bindVertexArray(this.pointVAO);gl.drawArrays(gl.POINTS,0,f.cam.kind===5?Math.round(this.pointCount*.16):Math.round(this.pointCount*(state.horizons?.attention?.65:1)));gl.disable(gl.BLEND);this.drawCalls++;
  }
  return f;
 }
 finishScene(t,f){
  if(this.state._geometryProof){const g=this.gl,p=this.programs.geometryCopy;this.full(p,null,{uImage:0,uResolution:[this.width,this.height]},[this.scene.textures[0]]);return;}
  const u=f.values,v=f.e.values,state=this.state,cut=state.cut?HapaEditorial.frame(state,t):null;
  this.full(this.programs.visibility,this.visibility,{uDepth:0,uSourceUV:f.sourceUV,uSceneSize:[this.width,this.height],uFront:f.sourceFront?1:0},[this.scene.depthTexture]);
  if(state.effects.bloom){this.full(this.programs.blur,this.bloomA,{uImage:0,uResolution:[this.bloomA.w,this.bloomA.h],uDirection:[2.5,0]},[this.scene.textures[1]]);
  this.full(this.programs.blur,this.bloomB,{uImage:0,uResolution:[this.bloomB.w,this.bloomB.h],uDirection:[0,2.5]},[this.bloomA.textures[0]]);}
  const portal=this.mediaManager?.slots[cut?.slot||'A'];const portalBlend=!this.inRoute&&state.showMedia!==false&&f.cam.kind>=2&&f.cam.kind<6&&portal?cut?.fullBlend||0:0;
  const debug=['beauty','depth','emission','pattern','visibility'].indexOf(state.debug);
  this.full(this.programs.composite,state.flow?.edge!==false&&this.programs.edgePolish&&state.debug==='beauty'?this.edgeInput:state.effects.finish?this.display:null,{uPortalFocal:state.horizons?.focal?.[cut?.slot||'A']||[.5,.5],uPortalVideo:6,uPortalBlend:portalBlend,uPortalAspect:portal?portal.width/portal.height:1,uVideoGain:state.mediaGain??.9,uScene:0,uBloom:1,uDepth:2,uVisibility:3,uEmissionTex:4,uWeaveTex:5,uResolution:[this.width,this.height],uSourceUV:f.sourceUV,uHighlight:u.uHighlight,uAccent:u.uAccent,uFlare:state.effects.flare?v['optics.flare']:0,uBloomGain:state.effects.bloom?v['optics.bloom']:0,uExposure:v['optics.exposure'],uDebug:Math.max(0,debug)},[this.scene.textures[0],this.bloomB.textures[0],this.scene.depthTexture,this.visibility.textures[0],this.scene.textures[1],this.pattern.textures[0],portal?.texture||this.scene.textures[0]]);
  if(state.flow?.edge!==false&&this.programs.edgePolish&&state.debug==='beauty')this.full(this.programs.edgePolish,state.effects.finish?this.display:null,{image:0,size:[this.width,this.height]},[this.edgeInput.textures[0]]);
  if(state.effects.finish)this.full(this.programs.finish,null,{inputImage:0,RENDERSIZE:[this.width,this.height],TIME:t,TIMEDELTA:1/30,FRAMEINDEX:Math.floor(t*30),amount:v['finish.amount'],enabled:state.effects.finish&&debug<=0?1:0},[this.display.textures[0]]);
 }
 render(t){
  const gl=this.gl;if(gl.isContextLost())return;
  const start=performance.now();this.renderTime=t;this.pollGPU();this.drawCalls=0;let query=null;
  if(this.timer&&this.pending.length<6){query=gl.createQuery();gl.beginQuery(this.timer.TIME_ELAPSED_EXT,query);}
  this.mediaManager?.upload();
  let f;
  try{f=this.routeRender?this.routeRender(t):this.drawScene(t);this.lastFrame=f;this.finishScene(t,f);}
  finally{if(query){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pending.push({query,frame:this.frame+1,world:f?.routeWorld||this.state.world,passageId:this.routeTelemetry?.bridge?.id||null,time:t,resolution:[this.width,this.height]});}}
  this.frame++;this.lastTime=t;
  this.stats={cpuSubmissionMs:performance.now()-start,gpuMs:this.gpuMs,gpuTimingStatus:this.gpuStatus,gpuSample:this.lastGpuSample,internalResolution:[this.width,this.height],drawCalls:this.drawCalls,frame:this.frame,quality:this.state.quality,world:f.routeWorld||this.state.world,hdr:this.hdr,estimatedTargetBytes:this.targets.reduce((s,t)=>s+t.w*t.h*(t.count*(t.float?8:4)+(t.depthTexture?4:0)),0),passage:this.routeTelemetry||null,historyResetReason:this.historyReset};this.historyReset=null;return this.stats;
 }
 drawMedia(f,t){
  if(this.state._hideMedia)return;if(this.routeMedia&&this.state._tunnel)return this.routeMedia(f,t);if(!this.mediaManager||this.state.showMedia===false)return;
  const gl=this.gl,p=this.programs.media,d=f.e.director?.values||{reveal:.5,density:.5,radiance:.5};
  const cf=this.state.cut?HapaEditorial.frame(this.state,this.state._cueTime??t):null;const kind=f.cam.kind,z=kind===0?f.cam.eye[2]+19:1.45;
  let surfaces;
  if(kind===0)surfaces=[{slot:'A',pos:[0,.0,z],angles:[0,0,0],size:[4.45,3.05],mask:0},{slot:'B',pos:[-3.,.0,z-7],angles:[0,.72,0],size:[2.35,2.9],mask:0},{slot:'B',pos:[3.,.0,z+4],angles:[0,-.65,0],size:[2.35,2.9],mask:0}];
  else if(kind===5)surfaces=[{slot:'A',pos:[0,.2,1.45],angles:[0,0,0],size:[3.2+d.reveal*.6,3.2+d.reveal*.6],mask:this.state.mediaShape==='cards'?0:1},{slot:'B',pos:[-5.3,1.0,-1.55],angles:[0,.5,.05],size:[1.8,2.9],mask:0},{slot:'B',pos:[5.4,1.15,-4.65],angles:[0,-.38,-.12],size:[2.0,3.15],mask:0}];
  else if(kind===6||kind>=7)surfaces=[{slot:'A',pos:[-3.55,.0,-1.45],angles:[0,.24,0],size:[1.65,2.40],mask:0},{slot:'B',pos:[3.55,.0,-1.45],angles:[0,-.24,0],size:[1.65,2.40],mask:0}];
  else if(kind===1)surfaces=[{slot:'A',pos:[-3.1,.15,1.15],angles:[0,.20,0],size:[2.65,3.3],mask:0},{slot:'B',pos:[3.1,.15,1.05],angles:[0,-.30,0],size:[2.65,3.3],mask:0}];
  else surfaces=[{slot:'A',pos:[0,.2,z],angles:[0,0,0],size:[3.4+d.reveal*.55,3.4+d.reveal*.55],mask:this.state.mediaShape==='cards'?0:1},{slot:'B',pos:[-3.25-d.reveal*.45,.25,-.2],angles:[0,.33,0],size:[1.65+d.density*.55,2.65],mask:0},{slot:'B',pos:[3.25+d.reveal*.45,.25,-.2],angles:[0,-.33,0],size:[1.65+d.density*.55,2.65],mask:0}];
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(p.p);gl.bindVertexArray(this.quadVAO);
  this.surfaceTransforms=[];for(const s of surfaces){const logical=s.slot,layout=cf?.layout?.[logical]||{x:0,y:0,z:0,scale:1,yaw:0};s.pos=s.pos.map((v,i)=>v+[layout.x,layout.y,layout.z][i]);s.angles[1]+=layout.yaw;s.size=s.size.map(v=>v*layout.scale);const mediaSlot=logical==='A'?(cf?.slot||'A'):(cf?.slot==='B'?'A':'B');s.slot=mediaSlot;this.surfaceTransforms.push({logical,...s});const media=this.mediaManager.slots[mediaSlot];if(!media||media.status!=='ready')continue;
   if(logical==='B'&&d.density<.1)continue;
   setUniforms(gl,p,{uFocal:this.state.horizons?.focal?.[mediaSlot]||[.5,.5],uSourceTrim:this.state.horizons?.sourceTrim?1:0,uPV:f.cam.pv,uModel:M.model(s.pos,s.angles),uSize:s.size,uVideo:0,uMediaAspect:media.width/media.height,uSurfaceAspect:s.size[0]/s.size[1],uRadiance:d.radiance,uMediaGain:(this.state.mediaGain??.9)*(logical==='A'?1+f.values.uSpotlight*.35:1-f.values.uSpotlight*.50)*(logical==='B'?.72+.22*(1-(f.e.director?.features.vocal||0)):1),uMask:s.mask,uGrade:this.state.gradeMedia?1:0,uEye:f.cam.eye,uHighlight:f.values.uHighlight,uAccent:f.values.uAccent});this.texture(media.texture,0);gl.drawArrays(gl.TRIANGLES,0,6);this.drawCalls++;
  }
 }
 sampleVisibility(){const gl=this.gl,p=new Uint8Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,this.visibility.fbo);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return p[0]/255;}
 numericAudit(){
  const gl=this.gl,result={mode:this.hdr?'RGBA16F':'RGBA8',attachments:[],note:'Counts source invalid/nonfinite components, not aesthetic black pixels'};
  for(const [name,target]of [['scene',this.scene],['destination',this.destination]]){
   gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);
   for(let a=0;a<2;a++){
    gl.readBuffer(gl.COLOR_ATTACHMENT0+a);
    const data=this.hdr?new Float32Array(this.width*this.height*4):new Uint8Array(this.width*this.height*4);
    gl.readPixels(0,0,this.width,this.height,gl.RGBA,this.hdr?gl.FLOAT:gl.UNSIGNED_BYTE,data);
    const error=gl.getError();let nonfinite=0,negative=0,maximum=0;
    if(!error)for(let i=0;i<data.length;i++){const v=data[i];if(!Number.isFinite(v))nonfinite++;else{if(v<0)negative++;maximum=Math.max(maximum,v);}}
    result.attachments.push({name:name+(a?'.emission':'.color'),error,nonfinite,negative,maximum});
   }
  }gl.bindFramebuffer(gl.FRAMEBUFFER,null);return result;
 }
 reset(reason){this.historyReset=reason;this.needsPattern=true;/* All animations are evaluated at absolute score time; no persistent feedback. */}
 readbackBarrier(){const gl=this.gl,p=new Uint8Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
 pixels(){const gl=this.gl,p=new Uint8Array(this.width*this.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,this.width,this.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
 dispose(){const gl=this.gl;this.deleteTargets();for(const p of Object.values(this.programs))gl.deleteProgram(p.p);for(const b of this.buffers)gl.deleteBuffer(b);for(const v of this.vaos)gl.deleteVertexArray(v);for(const q of this.pending)gl.deleteQuery(q.query);this.pending=[];this.disposeReliquary?.();}
}
SpatialRenderer.program=program;SpatialRenderer.uniforms=setUniforms;SpatialRenderer.safeShader=safeShader;return SpatialRenderer;
})();

