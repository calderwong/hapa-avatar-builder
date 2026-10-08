
/* One-context adapter, NOT a nested canvas or an image of the figure.
 * Atelier triangles enter the same HDR color/emission + depth buffers as host media.
 * Each incoming/outgoing view receives its own focus pass before portal sampling.
 */
'use strict';
window.HapaReliquaryVisuals=async function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms,program=HapaRenderer.program,S=HapaReliquaryShaders;
 const scene=program(gl,S.vertex,S.fragment,'Celestial Reliquary / host MRT');r.programs.reliquary=scene;
 r.programs.reliquaryFocus=program(gl,HapaShaders.vertex,S.focus,'per-view linear depth focus');
 const meshes={},textures={};let ready=false,scratch=null,ms=null,geo=HapaReliquaryGeometry.build(),total=0;
 function uploadGeometry(geometry){const collection={};
  for(const [name,data] of Object.entries(geometry)){
   const vao=gl.createVertexArray(),buffer=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buffer);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
   for(const [a,n,o] of [[0,3,0],[1,3,3],[2,2,6],[3,2,8]]){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,n,gl.FLOAT,false,40,o*4);}
   collection[name]={vao,count:data.length/10};
  }gl.bindVertexArray(null);return collection;
 }
 Object.assign(meshes,uploadGeometry(geo));total=Object.values(meshes).reduce((a,m)=>a+m.count/3,0);geo=null;
 const rawLow=HapaReliquaryLOD.build();
 const maskTrim=[];for(let i=0;i<rawLow.trim.length;i+=30)if(rawLow.trim[i+9]===1)maskTrim.push(...rawLow.trim.slice(i,i+30));rawLow.maskTrim=new Float32Array(maskTrim);
 const low=uploadGeometry(rawLow);
 function dropMS(){if(ms){gl.deleteFramebuffer(ms.fbo);for(const x of ms.buffers)gl.deleteRenderbuffer(x);ms=null;}}
 function multisample(){
  const count=r.state.quality==='draft'?0:r.state.quality==='high'?4:2;
  if(ms&&(ms.w!==r.width||ms.h!==r.height||ms.requested!==count))dropMS();
  if(count===0)return null;if(ms)return ms;
  const fmt=r.hdr?gl.RGBA16F:gl.RGBA8;
  const dep=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES)||[]);
  const samples=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,fmt,gl.SAMPLES)||[]).filter(n=>n>1&&n<=count&&dep.includes(n)).sort((a,b)=>b-a)[0];
  if(!samples)return null;
  const fbo=gl.createFramebuffer(),buffers=[];gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
  for(let i=0;i<3;i++){const b=gl.createRenderbuffer();buffers.push(b);gl.bindRenderbuffer(gl.RENDERBUFFER,b);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,i<2?fmt:gl.DEPTH_COMPONENT24,r.width,r.height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,i<2?gl.COLOR_ATTACHMENT0+i:gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,b);}
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteFramebuffer(fbo);buffers.forEach(b=>gl.deleteRenderbuffer(b));return null;}
  ms={fbo,buffers,samples,requested:count,w:r.width,h:r.height};return ms;
 }
 function copyColors(src,dst,depth=false){
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dst.fbo);
  for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  if(depth)gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.DEPTH_BUFFER_BIT,gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
 }
 function actorUniforms(art,u,cam,cfg,model,shift,core,fp=new Float32Array(8),wp=new Float32Array(8)){
  gl.useProgram(scene.p);U(gl,scene,{uPV:cam.pv,uActorModel:model,uRegionA:art.regions.A,uRegionB:art.regions.B,uRegionPhase:art.regions.phase,uRegionExtra:art.regions.extras,uPhraseShape:art.regions.choreo,uPhrasePacket:art.regions.packet,uPhraseTint:art.regions.packetColor,uDye:art.regions.dye,uEye:cam.eye,uShift:shift,uTime:art.time,uMotion:art.motion,uYaw:art.headYaw,uPitch:art.headPitch,uBreath:art.clothAmplitude,uLattice:art.latticeAngle,
   uMaskOpen:art.maskOpen,uBodyLift:art.bodyLift,uBodyRecoil:art.bodyRecoil,uTrimBend:art.trimBend,uTrimPluck:art.trimPluck,uBodyPhase:art.bodyPhase,uLacePhase:art.lacePhase,uVoicePhase:art.voicePhase,uCloudPhase:art.cloudPhase,uCrownPhase:art.crownPhase,uCrownTilt:art.crownTilt,uJewelKick:art.jewelKick,uCurrentGain:art.currentGain,uCorePosition:core,
   uEmbroidery:cfg.embroidery?1:0,uCore:art.core,uSheen:.82,uGold:1,uPulse:art.corePulse,uGoldFlow:art.goldFlow,uNebula:art.nebula,uJewelAccent:art.jewelAccent,uHaloOpen:art.haloOpen,uAnswer:art.trace.answer.final,uCorona:art.corona,uDensity:art.density,uSpotlight:art.spotlight,
   uGoldTone:u.uHighlight,uClothTone:u.uBody,uSkyTone:u.uAccent,uFloorPulses:fp,uWaves:wp,uRoomPulse:r.state.flow?.resonance!==false?1:0,uFabric:0,uDetail:1,uFiber:2});
  r.texture(textures.fabric,0);r.texture(textures.detail,1);r.texture(textures.fiber,2);
 }
 r.drawOracleCopy=(t,f,model,maskOnly=false,fullDetail=false)=>{
  if(!ready)return 0;const cfg=r.state.reliquary,art=HapaReliquary.evaluate(r.cache,r.state,t,f.e),shift=[0,0];
  const cp=HapaReliquary.point([0,.07,.86],10,1,art,shift),core=M.transform(model,[...cp,1]).slice(0,3);
  actorUniforms(art,f.values,f.cam,cfg,model,shift,core);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  let triangles=0;const chosen=maskOnly?['mask','maskTrim','lace','axis','core','corona']:['hood','lining','inner-drape','folds','mask','trim','lace','jewels','corona','core'];
  for(const name of chosen){const m=fullDetail?(meshes[name]||low[name]):low[name];if(!m||name==='corona'&&!cfg.corona||name==='jewels'&&!cfg.jewels)continue;gl.bindVertexArray(m.vao);gl.drawArrays(gl.TRIANGLES,0,m.count);triangles+=m.count/3;r.drawCalls++;}
  return triangles;
 };
 r.disposeReliquary=()=>{dropMS();Object.values(textures).forEach(x=>gl.deleteTexture(x));};
 r.drawReliquary=(t,f)=>{
  const st=r.state,cfg=st.reliquary||HapaReliquary.defaults(),art=HapaReliquary.evaluate(r.cache,st,t,f.e),u=f.values,cam=f.cam;
  const target=r.scene,aa=multisample(),shift=[.018*Math.sin(art.bodyPhase*.6)*art.kinetics.bass.mass*art.motion,0];
  if(aa){gl.bindFramebuffer(gl.FRAMEBUFFER,aa.fbo);gl.viewport(0,0,r.width,r.height);}else r.bind(target);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.005,.005,.009,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  if(!ready)return f;
  r.drawStage?.(t,f,aa||target);
  const fp=new Float32Array(8),wp=new Float32Array(8);
  for(let i=0;i<4;i++){const a=art.pulses[i],w=art.gestureWaves[i];fp[i*2]=a?.age??-100;fp[i*2+1]=a?.strength||0;wp[i*2]=w?.age??-100;wp[i*2+1]=w?.amplitude||0;}
  const core=HapaReliquary.point([0,.07,.86],10,1,art,shift);
  actorUniforms(art,u,cam,cfg,M.identity(),shift,core,fp,wp);
  let drawn=0;for(const [name,mesh]of Object.entries(meshes)){
   if(name==='room'&&f.stage?.enabled)continue;
   if(name==='micro'&&!cfg.micro||name==='corona'&&!cfg.corona||name==='jewels'&&!cfg.jewels||name==='halo'&&!cfg.crown)continue;
   gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count);drawn+=mesh.count/3;r.drawCalls++;
  }
  if(cfg.ribbons)r.drawSilks?.(t,f,M.identity(),art);
  // Shared projected depth: the host's actual video surfaces may occlude the mesh.
  if(cfg.roomMedia)r.drawMedia(f,t);
  // Source visibility follows the actual stellar center, not a second decorative beacon.
  f.source=core;f.values.uSource=core;
  const projected=M.transform(cam.pv,[...core,1]);f.sourceUV=[projected[0]/projected[3]*.5+.5,projected[1]/projected[3]*.5+.5,projected[2]/projected[3]*.5+.5];f.sourceFront=projected[3]>0;
  if(st.occluder){const p=r.programs.mesh,pos=M.add(cam.eye,M.scale(M.sub(core,cam.eye),.5)),model=M.identity();model.set([...M.scale(cam.right,.42),0],0);model.set([...M.scale(cam.up,.42),0],4);model.set([...cam.forward,0],8);model.set([...pos,1],12);
   gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.useProgram(p.p);U(gl,p,{...u,uModel:model,uShape:2,uBlocker:1});gl.bindVertexArray(r.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;
  }
  if(st.effects.dust){gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(r.programs.points.p);U(gl,r.programs.points,{...u,uDust:.10+art.air*.60,uPointScale:r.height/580});gl.bindVertexArray(r.pointVAO);gl.drawArrays(gl.POINTS,0,Math.round(r.pointCount*.22));gl.disable(gl.BLEND);r.drawCalls++;}
  if(aa)copyColors(aa,target,true);
  const point=HapaReliquary.point([0,.07,.82+art.focusMix*.43],10,1,art,shift),fd=Math.max(.2,M.dot(M.sub(point,cam.eye),cam.forward));
  const aperture=art.defocus*45; // bounded artistic CoC, not a recovered physical lens
  if(aperture>.01&&st.debug==='beauty'){
   if(!scratch||!r.targets.includes(scratch))scratch=r.target(r.width,r.height,{count:2,float:r.hdr});
   r.full(r.programs.reliquaryFocus,scratch,{image:0,emissionImage:1,depthImage:2,size:[r.width,r.height],nearPlane:cam.near,farPlane:cam.far,focusDistance:fd,aperture},[target.textures[0],target.textures[1],target.depthTexture]);copyColors(scratch,target,false);
  }
  f.reliquary={...art,focusDistance:fd,aperture,triangles:drawn};f.e.director.subject=art.trace.voice.final>.12?'The stellar voice':art.trace.lace.final>.12?'Gold filigree current':'Celestial Reliquary';
  // Shared finishing still owns bloom and output color conversion. Avoid broad flares on the face.
  f.e.values['optics.bloom']*=.64;f.e.values['optics.flare']*=.16;
  r.reliquaryStats={time:t,triangles:drawn,totalTriangles:total,focusDistance:fd,focusMix:art.focusMix,aperture,msaaSamples:aa?.samples||0,extraRenderbufferBytes:aa?r.width*r.height*((r.hdr?16:8)+4)*aa.samples:0,incoming:!!st._incoming,roles:Object.fromEntries(Object.entries(art.trace).map(([id,x])=>[id,x.final])),readiness:'ready',referenceImagesUsed:false,articulation:{maskOpen:art.maskOpen,bodyLift:art.bodyLift,bodyRecoil:art.bodyRecoil,trimBend:art.trimBend,trimPluck:art.trimPluck,crownPhase:art.crownPhase},cameraInstrument:cam.instrument||null};
  return f;
 };
 // Textures are authorized authored assets, not fetched from the reference video's host.
 for(const [key,name]of Object.entries({fabric:'velvet-base.jpg',detail:'brocade-height.png',fiber:'fiber.png'})){
  const path='assets/reliquary/'+name,bytes=window.HAPA_EMBED?.[path],url=bytes?'data:image/'+(name.endsWith('jpg')?'jpeg':'png')+';base64,'+bytes:path;
  const img=new Image();img.src=url;await img.decode();const texture=gl.createTexture();textures[key]=texture;gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.generateMipmap(gl.TEXTURE_2D);
  const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
 }
 HapaOctaveVisuals(r);
 ready=true;r.reliquaryStats={readiness:'ready',totalTriangles:total};return true;
};

