/* 109 one-pass journey adapter. Shared context, source clock, actor geometry, HDR/depth.
 * Native fracture field is retained. Added rib topology is static; only uniforms move.
 */
'use strict';
window.HapaJourneyVisuals=function(r){
 const J=HapaJourney,M=HapaMath,gl=r.gl,U=HapaRenderer.uniforms;
 const prior=r.routeRender.bind(r),values=r.frameValues.bind(r);
 const program=HapaRenderer.program(gl,HapaJourneyShaders.vertex,HapaJourneyShaders.fragment,'109 / continuous musical ribs');
 r.programs.journeyRibs=program;
 const vao=gl.createVertexArray(),buf=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buf);
 gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);
 // One tube parametric mesh, instanced over a bounded forward window.
 const vertices=[];for(let i=0;i<160;i++)for(let j=0;j<6;j++){const a=i/160,b=(i+1)/160,c=j/6,d=(j+1)/6;vertices.push(a,c,b,c,b,d,a,c,b,d,a,d);}
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.bindVertexArray(null);
 r.frameValues=t=>{
  const f=values(t),q=r.state._journey;
  Object.assign(f.values,{uJourneyOn:q?1:0,uJAnchor:q?.weights[0]??0,uJShape:q?.shape||[1,1,0,0],uJPocket:q?.pocket||[0,1,0,0],uJSpacing:q?.spacing||10});
  if(q){
   const c=f.values;
   // Quiet recursive body remains the background; localized ribs carry the hot colors.
   c.uBody=[.018,.055,.090];c.uAccent=q.cold.map(x=>x*.22);c.uEmitColor=q.cold.map(x=>x*.32);c.uHighlight=[.86,.72,.50];
   c.uBackground=[.0006,.0012,.004];c.uFog=[.008,.018,.037];
   c.uDanceLength=0; // no artificial entry/exit damping in the continuous corridor
   f.geometry.length=0;
   if(r.state._journeyInspect==='body'){
    Object.assign(c,{uGeometryOnly:1,uVocal:0,uPulse:0,uSource:[100000,100000,100000],uLoomOn:0,uLoomMix:0});
   }
  }
  return f;
 };
 function ribs(q,f){
  if(q.weights[0]>.999)return 0;
  r.bind(r.scene);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.useProgram(program.p);U(gl,program,{...f.values,uJWeights:q.weights,uJBase:Math.floor((f.cam.eye[2]-8)/7.6)*7.6,uJClock:q.clock,uJIntensity:q.intensity*(1-q.weights[0]),uJHot:q.hot,uJCold:q.cold,uJProof:r.state._journeyInspect==='body'?1:0});
  gl.bindVertexArray(vao);gl.drawArraysInstanced(gl.TRIANGLES,0,vertices.length/2,24);r.drawCalls++;return vertices.length/6*24;
 }
 r.routeRender=t=>{
  const s=r.state;if(!J.active(s)){r.journeyStats={active:false,mode:'standard'};return prior(t);}
  const inspect=s._journeyInspect,at=s._journeyFreeze??t,q=J.evaluate(r.cache,s,at);
  const b={id:'journey-109',style:'fractal-loom',journey:true,length:10000,start:0,duration:r.score.duration,arrival:r.score.duration,entry:0,wallMedia:false};
  const drawTime=q.moving?at:0;
  if(inspect==='body')q.pocket=[0,1,0,0];
  const st={...s,world:'breathline-weave',_tunnel:true,_bridge:b,_journey:q,_noPortal:true,_polish:true,
   _pose:{eye:inspect==='body'?[0,0,7.4]:q.eye,forward:inspect==='body'?[0,0,1]:q.forward,fov:s.fov},
   effects:{...s.effects,meshes:false,dust:false},showMedia:false};
  if(inspect==='body'){st.effects.bloom=false;st.effects.flare=false;st.effects.finish=false;}
  let f,triangles=0,actor=0;
  r.state=st;r.inRoute=true;
  try{
   f=r.drawScene(drawTime);triangles=ribs(q,f);
   // An actual 3D instance from Before the first step, not a captured picture.
   if(q.subject&&inspect!=='body'){
    const a=q.subject;const model=M.model(a.position,[0,a.yaw,0],a.scale);
    const actorFrame={...f,values:{...f.values,uBody:[.11,.035,.24],uAccent:[.045,.42,.95],uHighlight:[.96,.67,.25]}};
    r.bind(r.scene);actor=r.drawOracleCopy?.(drawTime,actorFrame,model,false,s.quality==='high')||0;
   }
  }finally{r.state=s;}
  f.e={...f.e,values:{...f.e.values},director:{...f.e.director}};
  f.e.values['optics.flare']=0;f.e.values['finish.amount']=0;
  if(inspect==='body'){f.e.values['optics.bloom']=0;f.e.values['optics.exposure']=1;}
  const caption=q.subject&&q.subject.distance<24?(q.subject.style==='traveler'?'Reliquary Traveler':'Before the first step · Passing apparition'):q.name+' · Continuous Geometry Dance';
  f.e.director.shot={...f.e.director.shot,label:caption};f.e.director.subject=q.subject?'The same sculpted avatar / moving through real tunnel depth':'Non-stop source-time journey / Standard route preserved';
  f.routeWorld='Tunnel Worlds / '+q.name;f.sourceFront=false;
  r.routeTelemetry={active:true,mode:q.mode,stage:'continuous',world:'breathline-weave',to:null,bridge:null,camera:{eye:f.cam.eye,forward:f.cam.forward},scenePasses:1,family:q.family,chapter:q.chapter,distance:q.z,coverage:1};
  r.journeyStats={active:true,time:t,renderTime:drawTime,mode:q.mode,family:q.family,name:q.name,weights:q.weights,z:q.z,chapter:q.chapter,blend:q.blend,scenePasses:1,ribTriangles:triangles,actorTriangles:actor,subject:q.subject,pocket:q.pocket,geometryProof:inspect==='body',sourceClock:true};
  return f;
 };
 return true;
};
