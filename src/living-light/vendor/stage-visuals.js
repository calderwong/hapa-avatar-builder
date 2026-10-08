
/* Native stage rendering BEFORE elements, with real depth and water reflection.
 * Zero extra render targets. Static geometry cache: at most three world/quality pairs.
 * Inspection is transient and never modifies saved paths, audio or actor recipes.
 */
'use strict';
window.HapaStageVisuals=function(r){
 const gl=r.gl,U=HapaRenderer.uniforms,S=HapaStages,program=HapaRenderer.program(gl,HapaStageShaders.vertex,HapaStageShaders.fragment,'107 / Dancing Stages');r.programs.stage107=program;
 const meshes=new Map();let builds=0,draws=0,submission=0;
 function remove(m){for(const g of m.groups){gl.deleteVertexArray(g.vao);gl.deleteBuffer(g.buf);r.vaos.splice(r.vaos.indexOf(g.vao),1);r.buffers.splice(r.buffers.indexOf(g.buf),1);}}
 function mesh(world,quality){const key=world+':'+quality;let m=meshes.get(key);if(m)return m;
  if(meshes.size>=3){const old=meshes.keys().next().value;remove(meshes.get(old));meshes.delete(old);}
  const cpu=HapaStageGeometry.build(world,quality),groups=cpu.groups.map(a=>{const vao=gl.createVertexArray(),buf=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buf);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);
   for(const [loc,size,offset]of [[0,3,0],[1,3,3],[2,2,6],[3,3,8],[4,4,11]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,60,offset*4);}return{vao,buf,count:a.length/15};});gl.bindVertexArray(null);
  m={cpu,groups};meshes.set(key,m);builds++;return m;
 }
 const zeroWind={mean:[0,0,0,0],detail:[0,0,0,0],origin:[0,0,0,1],surface:[-100,0,0,0],shockOrigins:new Array(16).fill(0),shockShapes:new Array(16).fill(0),thermals:new Array(32).fill(0)};
 r.stageUniforms=q=>!q?.enabled?{uStOn:0,uStBody:0,uStTexture:0,uStClock:0,uStAtmosphere:0,uStFocus:1}:{uStOn:1,uStBody:q.bodyOnly?1:0,uStPhase:q.phase,uStMotion:q.motion,uStTone:q.tone,uStAccent:q.packed,uStEcho:q.echo,uStSeed:(q.config.seed%997)*.013,uStClock:q.clock,uStTexture:q.config.texture,uStAtmosphere:q.config.atmosphere,uStFocus:q.focusScale,uStFamily:q.familyIndex,uStWind:q.wind?1:0,...HapaWindKernel.uniforms(q.wind?.field||zeroWind)};
 const frame=r.frameValues.bind(r);r.frameValues=t=>{const f=frame(t),q=S.evaluate(r.cache,r.state,t);f.stage=q;Object.assign(f.values,r.stageUniforms(q));return f;};
 r.drawStage=(t,f,target=r.scene,options={})=>{
  const q=f.stage;if(!q?.enabled)return 0;const start=performance.now(),m=mesh(q.world,r.state.quality);
  r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.useProgram(program.p);
  U(gl,program,{...f.values,...r.stageUniforms(q),uPV:f.cam.pv,uEye:f.cam.eye,uStClipLevel:options.level??-100,uStReflection:options.reflection?1:0,uStAir:0});
  let triangles=0;for(let i=0;i<3;i++){if(i===1&&(q.config.focus==='minimal'||r.state.quality==='draft'))continue;if(i===2&&(q.bodyOnly||q.config.atmosphere<=.001||r.state.quality==='draft'))continue;const g=m.groups[i];if(!g.count)continue;
   if(i===2){gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}
   gl.bindVertexArray(g.vao);gl.drawArrays(gl.TRIANGLES,0,g.count);triangles+=g.count/3;r.drawCalls++;draws++;
  }
  gl.disable(gl.BLEND);gl.depthMask(true);submission+=performance.now()-start;
  r.stageStats={world:q.world,signature:q.signature,time:q.time,triangles,reflection:!!options.reflection,geometryBuilds:builds,residentMeshes:meshes.size,drawCalls:draws,cpuSubmissionMs:submission,targetsAdded:0,quality:r.state.quality,policy:'depth-writing architecture / opaque shared stage + depth-tested atmospheric scrims; no extra target or simulation'};
  return triangles;
 };
 const oldRender=r.render.bind(r);r.render=(...a)=>{draws=0;submission=0;return oldRender(...a);};
 r.stageInspect=(mode,world,options={})=>{
  if(mode==='off'||mode===false){delete r.state._stageInspect;return null;}
  if(!['beauty','layer','body','rest','freeze','baseline'].includes(mode))throw Error('Unknown stage inspection mode');
  world=world||r.state._stageInspect?.world||r.state.world;const w=S.worlds.find(x=>x.id===world);if(!w)throw Error('Choose a 107 stage first');
  delete r.state._elementInspect;
  let old=r.state._stageInspect,q=old?.world===world?{...old}:null;
  if(!q){const saved=r.state;r.state={...saved,world,_tunnel:false,_pose:undefined};let f;try{f=frame(r.lastTime||0);}finally{r.state=saved;}
   q={world,palette:w.palette,layer:false,body:false,rest:false,freeze:false,baseline:false,time:r.lastTime||0,pose:{eye:[...f.cam.eye],forward:[...f.cam.forward],up:[...f.cam.up],fov:f.cam.fov*180/Math.PI}};}
  if(mode==='beauty')Object.assign(q,{layer:false,body:false,rest:false,freeze:false,baseline:false});else if(mode==='body'){q.body=!q.body;q.layer=q.body;}else q[mode]=!q[mode];
  if(mode==='body'&&q.body)q.baseline=false;
  if(mode==='layer'&&!q.layer)q.body=false;
  if(mode==='baseline'&&q.baseline){q.layer=false;q.body=false;}
  if(mode==='freeze'&&q.freeze)q.time=r.lastTime||0;
  if(options.pose){const p=options.pose;if(!Array.isArray(p.eye)||p.eye.length!==3||!Array.isArray(p.forward)||p.forward.length!==3||![...p.eye,...p.forward,p.fov].every(Number.isFinite)||Math.hypot(...p.forward)<.001||p.fov<20||p.fov>100)throw Error('Invalid stage camera');q.pose=structuredClone(p);}
  r.state._stageInspect=q;return structuredClone(q);
 };
 const oldRoute=r.routeRender.bind(r),oldFinish=r.finishScene.bind(r);
 r.routeRender=t=>{const pr=r.state._stageInspect;if(!pr)return oldRoute(t);
  const saved=r.state;r.state={...saved,world:pr.world,palette:pr.palette,_pose:pr.pose,_tunnel:false,_hideMedia:true,_noPortal:true,showMedia:false,flow:{...saved.flow,edge:!pr.body&&saved.flow?.edge},effects:{...saved.effects,dust:false,bloom:!pr.body&&saved.effects.bloom,flare:false,finish:!pr.body&&saved.effects.finish}};
  try{let f;if(pr.layer){f=r.frameValues(t);r.bind(r.scene);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.depthMask(true);gl.clearColor(.006,.009,.015,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);r.drawStage(t,f);f.e.values['optics.flare']=0;}else f=r.drawScene(t);
   r.routeTelemetry={active:false,stage:'fixed camera / 107 stage inspection',proof:true};f.routeWorld='Stage inspection / '+pr.world;f.stageInspection=structuredClone(pr);return f;
  }finally{r.state=saved;}
 };
 r.finishScene=(t,f)=>{if(r.state._stageInspect?.body){r.full(r.programs.geometryCopy,null,{uImage:0,uResolution:[r.width,r.height]},[r.scene.textures[0]]);return;}return oldFinish(t,f);};
 const elementInspect=r.elementInspect.bind(r);r.elementInspect=(...a)=>{if(a[0]!=='off'&&a[0]!==false)delete r.state._stageInspect;return elementInspect(...a);};
 return{mesh,program,dispose:()=>{for(const m of meshes.values())remove(m);meshes.clear();}};
};

