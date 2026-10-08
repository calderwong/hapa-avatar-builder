
/* Same-context Electricity binding. Opaque staging -> emissive channel strips -> old finish.
 * Channels depth-test without writing solid depth. No read/write texture feedback or extra clock.
 */
'use strict';
window.HapaElectricVisuals=function(r){
 const gl=r.gl,U=HapaRenderer.uniforms,M=HapaMath,K=HapaElectricKernel,E=HapaElectricity,S=HapaElectricShaders;
 const stage=HapaRenderer.program(gl,HapaShaders.vertex,S.stage,'Electricity / porcelain staging'),arc=HapaRenderer.program(gl,S.arcVertex,S.arcFragment,'Electricity / branching channels');r.programs.electricStage=stage;r.programs.electricArc=arc;
 const lumenStage=HapaRenderer.program(gl,HapaShaders.vertex,HapaLumenShaders.stage,'Living Light / native architecture');const air=HapaRenderer.program(gl,HapaShaders.vertex,HapaLumenShaders.volume,'Living Light / illuminated air');r.programs.lumenStage=lumenStage;r.programs.lumenAir=air;let airTarget=null;
 function scatter(f,u){if(u.uLiAir<=.0001||u.uLiLight<=.0001)return false;if(!airTarget||!r.targets.includes(airTarget))airTarget=r.target(r.width,r.height,{count:2,float:r.hdr});
  r.full(air,airTarget,{...u,uNear:f.cam.near,uFar:f.cam.far,uLiSteps:r.state.quality==='draft'?20:r.state.quality==='high'?40:28,uSceneColor:0,uSceneEmission:1,uSceneDepth:2},[r.scene.textures[0],r.scene.textures[1],r.scene.depthTexture]);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,airTarget.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,r.scene.fbo);for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i?[gl.NONE,gl.COLOR_ATTACHMENT1]:[gl.COLOR_ATTACHMENT0]);gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}r.bind(r.scene);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);return true;
 }
 const vao=gl.createVertexArray(),buf=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buf);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,1800000,gl.DYNAMIC_DRAW);
 const stride=14*4;for(const [loc,size,offset]of [[0,3,0],[1,3,3],[2,2,6],[3,4,8],[4,2,12]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,offset*4);}
 function mesh(q,paths){const out=[];for(const p of paths){const n=p.branch?24:64,points=Array.from({length:n+1},(_,i)=>K.point(q.field,p.a,p.b,i/n,p.seed));const normals=points.map((x,i)=>K.math.norm(K.math.sub(points[Math.min(i+1,n)],points[Math.max(0,i-1)])));
   function vertex(i,side){out.push(...points[i],...normals[i],i/n,side,p.energy,p.width,p.pulse,p.front,p.branch,p.growth);}
   for(let i=0;i<n;i++){vertex(i,-1);vertex(i+1,-1);vertex(i+1,1);vertex(i,-1);vertex(i+1,1);vertex(i,1);}
  }return new Float32Array(out);}
 r.drawElectricity=(t,f)=>{
  const s=r.state,q=E.evaluate(r.cache,s,t),c=E.config(s),layout=E.layout(s),paths=E.paths(q,layout),a=new Array(24).fill(0),b=new Array(24).fill(0);layout.forEach((v,i)=>{a.splice(i*3,3,...v.a);b.splice(i*3,3,...v.b);});
  const lc=HapaLumen.config(s),isNative=HapaLumen.native(s);
  const u={...f.values,uLiDetail:lc.enabled?lc.detail:0,uLiAir:lc.enabled?lc.air:0,uLiLight:lc.enabled?lc.light*(.60+.40*q.radiance):0,uElKind:E.kind(s),uElCount:layout.length,uElA:a,uElB:b,uElColor:q.field.color,uElCharge:q.enabled?q.charge:0,uElStroke:q.discharge,uElPhase:q.phase,uElLight:c.enabled?c.light*q.radiance:0,uElLength:s._bridge?.length||40,uElSteps:s.quality==='draft'?76:s.quality==='high'?140:112};
  r.bind(r.scene);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const staging=isNative?lumenStage:stage;gl.useProgram(staging.p);U(gl,staging,u);gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;
  r.drawStage?.(t,f,r.scene);
  if(c.media)r.drawMedia(f,t);
  if(s.occluder){const cam=f.cam,center=E.kind(s)===23?[0,1,cam.eye[2]+5]:[0,1.2,-1.4],pos=M.add(cam.eye,M.scale(M.sub(center,cam.eye),.5)),mat=M.identity();mat.set([...M.scale(cam.right,1.5),0],0);mat.set([...M.scale(cam.up,1.5),0],4);mat.set([...cam.forward,0],8);mat.set([...pos,1],12);gl.useProgram(r.programs.mesh.p);U(gl,r.programs.mesh,{...f.values,uModel:mat,uShape:2,uBlocker:1});gl.bindVertexArray(r.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;}
  const volumeDrawn=scatter(f,u);
  const data=mesh(q,paths);if(data.length){gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);gl.useProgram(arc.p);U(gl,arc,{uPV:f.cam.pv,uEye:f.cam.eye,uFov:f.cam.fov,uHeight:r.height,uElColor:q.field.color,uElLight:c.light*q.radiance,uElPhase:q.phase});gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);gl.drawArrays(gl.TRIANGLES,0,data.length/14);r.drawCalls++;gl.disable(gl.BLEND);gl.depthMask(true);}
  f.e.values['optics.flare']=0;f.e.values['optics.bloom']*=lc.enabled?(.40+.40*lc.glow):.40;
  f.electricity={...q,channels:layout.length,pathCount:paths.length,triangles:data.length/42,depth:'opaque retained; luminous strips are depth-tested only',incoming:!!s._incoming};r.electricStats=f.electricity;r.lumenStats={time:t,world:s.world,tunnel:s._bridge?.style||null,native:isNative,volumeDrawn,air:lc.air,detail:lc.detail,light:lc.light,sourceCount:layout.length,steps:s.quality==='draft'?20:s.quality==='high'?40:28,incoming:!!s._incoming,depthPolicy:'Opaque depth retained; no volume surface depth',method:'view-ray local scattering, no shadows or multiple scattering'};return f;
 };
 return{paint:'electricity'};
};

