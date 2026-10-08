
/* Full-sized original flame integration. Opaque depth remains untouched by fire/smoke/haze.
 * Intermediate color targets are disjoint; allocation/resize/disposal belong to host.
 */
'use strict';
window.HapaFireVisuals=function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms;
 const field=HapaRenderer.program(gl,HapaShaders.vertex,HapaFireShaders.field,'Fire / hearth geometry'),
  volume=HapaRenderer.program(gl,HapaShaders.vertex,HapaFireShaders.volume,'Fire / emission absorption'),
  spark=HapaRenderer.program(gl,HapaFireShaders.sparkVertex,HapaFireShaders.sparkFragment,'Fire / finite embers');
 Object.assign(r.programs,{fireField:field,fireVolume:volume,fireSpark:spark});let scratch=null;const scratches=new Map();
 const vao=gl.createVertexArray(),buf=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buf);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,32*32,gl.DYNAMIC_DRAW);
 for(let i=0;i<2;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,32,i*16);}gl.bindVertexArray(null);
 function blit(src,dst){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dst.fbo);
  for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,src.w,src.h,0,0,dst.w,dst.h,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  r.bind(dst);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);}
 r.fireAudit=()=>{if(!scratch||!r.targets.includes(scratch))return {status:'not allocated',attachments:[]};
  const priorRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),priorDraw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),out=[];
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,scratch.fbo);
  for(let a=0;a<2;a++){gl.readBuffer(gl.COLOR_ATTACHMENT0+a);const data=scratch.float?new Float32Array(scratch.w*scratch.h*4):new Uint8Array(scratch.w*scratch.h*4);
   gl.readPixels(0,0,scratch.w,scratch.h,gl.RGBA,scratch.float?gl.FLOAT:gl.UNSIGNED_BYTE,data);let nonfinite=0,negative=0,maximum=0;const error=gl.getError();for(const v of data){if(!Number.isFinite(v))nonfinite++;else{if(v<0)negative++;maximum=Math.max(maximum,v);}}
   out.push({name:a?'fireScratch.emission':'fireScratch.color',error,nonfinite,negative,maximum});}
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,priorRead);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,priorDraw);return {status:'read',dimensions:[scratch.w,scratch.h],attachments:out};};
 const fieldUniforms=q=>({...HapaElementStyle.uniforms(q),uFirePerformance:q.field.performance||[0,1,0,0],uFireGesture:q.field.gesture||[0,0,0,0],uFireShape:q.field.shape,uFireMotion:q.field.motion,uFireOptics:q.field.optics,...(q.sharedWind?HapaWindKernel.uniforms(q.sharedWind.field):{}),uWindFireGain:q.sharedWind?.fireCoupling||0});r.fireUniforms=fieldUniforms;
 r.drawFireLayer=(t,f,options={})=>{
  const s=r.state,c=HapaFire.config(s),q=options.packet||HapaFire.evaluate(r.cache,s,t),places=options.places||HapaFire.emitters(s),target=options.target||r.scene,em=new Array(32).fill(0);places.forEach((v,i)=>em.splice(i*4,4,...v));
  const u={...f.values,...fieldUniforms(q),uResolution:[target.w,target.h],uPV:f.cam.pv,uEye:f.cam.eye,uForward:f.cam.forward,uRight:f.cam.right,uUp:f.cam.up,uFov:f.cam.fov,uFireKind:HapaFire.kind(s),uFireCount:places.length,uFireEmitters:em,uNear:f.cam.near,uFar:f.cam.far};
  // Keep the density gesture; reduce only Balanced optical integration cost for 106.
  const samples=s.quality==='draft'?24:s.quality==='high'?56:q.field.performance?.[0]?32:40;
  if(c.enabled&&c.fuel>0&&places.length){const key=target.w+'x'+target.h;scratch=scratches.get(key);if(!scratch||!r.targets.includes(scratch)){scratch=r.target(target.w,target.h,{count:2,float:r.hdr});scratches.set(key,scratch);}
   r.full(volume,scratch,{...u,uFireSamples:samples,uFireBase:0,uFireBaseEm:1,uFireDepth:2},[target.textures[0],target.textures[1],target.depthTexture]);blit(scratch,target);}
  const particles=options.reflection||q.style?.body?[]:HapaFire.sparks(q,places);
  if(particles.length){r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(spark.p);
   U(gl,spark,{uPV:f.cam.pv,uSizeScale:target.h/450});gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(particles.flatMap(p=>[...p.position,p.size,...p.color,p.alpha])));gl.drawArrays(gl.POINTS,0,particles.length);r.drawCalls++;gl.disable(gl.BLEND);gl.depthMask(true);}
  return {...q,emitters:places,particleCount:particles.length,samplesPerIntersectedEmitter:c.enabled?samples:0,heatLimitPixels:3,depthPolicy:'opaque depth read only; coupled procedural volume',incoming:!!s._incoming,reflection:!!options.reflection};
 };
 r.drawFire=(t,f)=>{
  const s=r.state,c=HapaFire.config(s),q=HapaFire.evaluate(r.cache,s,t),places=HapaFire.emitters(s),target=r.scene,em=new Array(32).fill(0);places.forEach((v,i)=>em.splice(i*4,4,...v));
  const u={...f.values,...fieldUniforms(q),uFireKind:HapaFire.kind(s),uFireCount:places.length,uFireEmitters:em,uFireOpening:q.opening,uFireLength:s._bridge?.length||40,uFireSteps:s.quality==='draft'?80:s.quality==='high'?140:110,uNear:f.cam.near,uFar:f.cam.far};
  r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(field.p);U(gl,field,u);gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;
  r.drawStage?.(t,f,target);
  if(c.media)r.drawMedia(f,t);
  if(s.occluder){const cam=f.cam,center=[0,.15,0],pos=M.add(cam.eye,M.scale(M.sub(center,cam.eye),.50)),mat=M.identity();mat.set([...M.scale(cam.right,1.25),0],0);mat.set([...M.scale(cam.up,1.25),0],4);mat.set([...cam.forward,0],8);mat.set([...pos,1],12);
   gl.useProgram(r.programs.mesh.p);U(gl,r.programs.mesh,{...f.values,uModel:mat,uShape:2,uBlocker:1});gl.bindVertexArray(r.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;}
  const layer=r.drawFireLayer(t,f,{packet:q,places,target});
  const core=places[0].slice(0,3);core[1]+=.6;const proj=M.transform(f.cam.pv,[...core,1]);f.source=core;f.sourceUV=[proj[0]/proj[3]*.5+.5,proj[1]/proj[3]*.5+.5,proj[2]/proj[3]*.5+.5];f.sourceFront=proj[3]>0;
  f.e.values['optics.flare']=0;f.e.values['optics.bloom']*=.28;
  f.fire=layer;r.fireStats=f.fire;return f;
 };
 return{paint:'fire'};
};

