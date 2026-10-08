
/* Water Paint bindings. Original shared-context geometry, reflection and refraction.
 * No texture is sampled while attached to the active draw framebuffer.
 */
'use strict';
window.HapaWaterVisuals=function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms;
 const opaque=HapaRenderer.program(gl,HapaShaders.vertex,HapaWaterShaders.field,'Water / shore architecture'),
  surface=HapaRenderer.program(gl,HapaWaterShaders.vertex,HapaWaterShaders.fragment,'Water Paint / displaced surface');
 const drop=HapaRenderer.program(gl,HapaWaterShaders.dropVertex,HapaWaterShaders.dropFragment,'Water / source-timed rain');r.programs.waterRain=drop;
 r.programs.waterArchitecture=opaque;r.programs.waterSurface=surface;
 let background=null,mirror=null;
 const n=192,uv=[];
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){const a=[i/n,j/n],b=[(i+1)/n,j/n],c=[(i+1)/n,(j+1)/n],d=[i/n,(j+1)/n];uv.push(...a,...b,...c,...a,...c,...d);}
 const vao=gl.createVertexArray(),buf=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buf);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.bindVertexArray(null);
 function wf(q){return{uWaterWaves:q.waves,uWaterRings:q.rings,uWaterChop:q.chop};}
 r.waterUniforms=q=>({...HapaElementStyle.uniforms(q),...wf(q),uWaterWarp:q.warp||[0,0],uWaterEnhanced:q.style?.on?1:0,uWaterWind:q.wind,uWaterFlow:q.flow,uWaterLight:q.light,uWaterFoam:q.foam,uWaterClarity:q.clarity,uWaterCarry:[q.carry?.progress||0,q.animated&&!q.lookLocked?(q.carry?.strength||0):0],uWaterCarryTint:q.carry?.color||[0,0,0]});
 function sceneDraw(target,f,q,reflection=false){const s=r.state;const u={...f.values,...HapaElementStyle.uniforms(q),uPV:f.cam.pv,uEye:f.cam.eye,uForward:f.cam.forward,uRight:f.cam.right,uUp:f.cam.up,uFov:f.cam.fov,uResolution:[target.w,target.h],uWaterKind:q.binding.kind,uWaterLevel:q.binding.level,uWaterLight:q.light,uWaterWind:q.wind,uWaterFlow:q.flow,uWaterLength:s._bridge?.length||40,uWaterSwell:q.swell,uWaterSteps:s.quality==='draft'?72:s.quality==='high'?124:100,uReflectionPass:reflection?1:0};
  r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(opaque.p);U(gl,opaque,u);gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;
  r.drawStage?.(q.time??r.lastTime,f,target,{reflection,level:q.binding.level});
  if(q.binding.kind===5&&s.effects.meshes&&!q.style?.body){const p=r.programs.mesh;gl.useProgram(p.p);U(gl,p,{...f.values,uPV:f.cam.pv,uEye:f.cam.eye,uBlocker:0,uMediaWeave:1,uUseMedia:s.videoWeave&&r.mediaManager?.slots.A?1:0,uShape:5});r.texture(r.pattern.textures[0],0);if(r.mediaManager?.slots.A)r.texture(r.mediaManager.slots.A.texture,1);gl.bindVertexArray(r.ribbonVAO);
   for(const mat of [M.model([-5.3,1.,-1.6],[.04,.5,.05]),M.model([5.4,1.15,-4.7],[-.04,-.38,-.12],1.14),M.model([0,1.6,-7.8],[.08,.08,.08],.85)]){U(gl,p,{uModel:mat});gl.drawArrays(gl.TRIANGLES,0,r.ribbonVertices);r.drawCalls++;}}
  if(!reflection&&s.occluder){const p=r.programs.mesh,model=M.identity(),center=[0,-.2,-2.3],pos=M.add(f.cam.eye,M.scale(M.sub(center,f.cam.eye),.5));model.set([...M.scale(f.cam.right,1.4),0],0);model.set([...M.scale(f.cam.up,1.4),0],4);model.set([...f.cam.forward,0],8);model.set([...pos,1],12);
   gl.useProgram(p.p);U(gl,p,{...f.values,uPV:f.cam.pv,uEye:f.cam.eye,uModel:model,uBlocker:1,uShape:2});gl.bindVertexArray(r.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;}
  return u;
 }
 function copyScene(src,dst){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dst.fbo);
  for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.DEPTH_BUFFER_BIT,gl.NEAREST);r.bind(dst);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);}
 r.drawWater=(t,f)=>{
  const q=HapaWater.evaluate(r.cache,r.state,t),s=r.state,c=HapaWater.config(s),b=q.binding,target=r.scene;
  if(!background||!r.targets.includes(background))background=r.target(r.width,r.height,{count:2,depth:true,float:r.hdr});
  if(!mirror||!r.targets.includes(mirror))mirror=r.target(Math.ceil(r.width/2),Math.ceil(r.height/2),{count:2,depth:true,float:r.hdr});
  if(s._elementInspect?.element==='wind'){sceneDraw(target,f,q,false);r.waterStats={...q,inspectionHidden:true};return f;}
  const cam=f.cam,mirrorCam=M.fromPose({eye:[cam.eye[0],2*b.level-cam.eye[1],cam.eye[2]],forward:[cam.forward[0],-cam.forward[1],cam.forward[2]],up:[cam.up[0],-cam.up[1],cam.up[2]],fov:cam.fov*180/Math.PI},r.width/r.height,cam.kind);
  if(c.reflections){const mf={...f,cam:mirrorCam};sceneDraw(mirror,mf,q,true);r.waterReflectionExtras?.(t,mirror,mf,q);}
  const u=sceneDraw(background,f,q,false);copyScene(background,target);
  // Opaque snapshot and mirror are separate read-only textures during surface draw.
  r.bind(target);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(surface.p);
  U(gl,surface,{...u,...r.waterUniforms(q),uWaterReflectPV:mirrorCam.pv,uWaterNear:cam.near,uWaterFar:cam.far,uWaterBackground:0,uWaterBackgroundDepth:1,uWaterReflection:2,uWaterReflections:c.reflections?1:0,uWaterSpan:b.span,uWaterMode:0,uSheetSide:1,uWaterMeshStep:b.span/n});
  r.texture(background.textures[0],0);r.texture(background.depthTexture,1);r.texture(mirror.textures[0],2);gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,uv.length/2);r.drawCalls++;
  if(b.kind===14&&s.effects.meshes){U(gl,surface,{uWaterMode:1,uWaterReflections:0,uWindWaterGain:0});gl.bindVertexArray(r.ribbonVAO);
   for(const side of [-1,1]){U(gl,surface,{uSheetSide:side});gl.drawArrays(gl.TRIANGLES,0,r.ribbonVertices);r.drawCalls++;}}
  if(!q.style?.body&&q.animated&&q.drops.length){gl.useProgram(drop.p);gl.bindVertexArray(r.quadVAO);for(const d of q.drops){const y=b.level+Math.pow(d.until/.42,1.6)*3.5;U(gl,drop,{uPV:cam.pv,uDrop:[d.x,y,d.z],uRight:cam.right,uUp:cam.up,uDropAge:d.until/.42,uHighlight:u.uHighlight});gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;}}
  const core=b.kind===12?[0,1.25,-2.2]:b.kind===14?[0,0,(s._bridge?.length||36)-1]:[0,.8,-5.];const proj=M.transform(cam.pv,[...core,1]);f.source=core;f.sourceUV=[proj[0]/proj[3]*.5+.5,proj[1]/proj[3]*.5+.5,proj[2]/proj[3]*.5+.5];f.sourceFront=proj[3]>0;
  f.e.values['optics.flare']=0;f.e.values['optics.bloom']*=.38;
  f.water={...q,incoming:!!s._incoming,triangles:uv.length/6+(b.kind===14?r.ribbonVertices*2/3:0),reflection:c.reflections?'half-resolution mean-plane architecture / sky': 'analytic sky only',refraction:'foreground-depth-guarded opaque scene sample',reflectionResolution:[mirror.w,mirror.h]};r.waterStats=f.water;
  return f;
 };
 return{paint:'water',geometryTriangles:uv.length/6};
};

