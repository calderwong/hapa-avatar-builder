
/* Original screenshot-guided Contour renderer. Shared WebGL2 context, HDR outputs,
 * projected scene depth. Curves are actual 3D paths; blue interiors are analytic
 * bounded light fields, not collision geometry. All motion is a function of song time.
 */
'use strict';
window.HapaContourVisuals=function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms,S=HapaContourShaders;
 const make=(v,f,label)=>HapaRenderer.program(gl,v,f,label);
 const stage=make(HapaShaders.vertex,S.stage,'Contour 102 / ultramarine void');
 const interior=make(HapaShaders.vertex,S.interiors,'Contour 102 / blue cell light');
 const line=make(S.lineVertex,S.lineFragment,'Contour 102 / instanced 3D light paths');
 const node=make(S.nodeVertex,S.nodeFragment,'Contour 102 / localized hot nodes');
 const dust=make(S.dustVertex,S.dustFragment,'Contour 102 / interior motes');
 Object.assign(r.programs,{contourStage:stage,contourInterior:interior,contourLine:line,contourNode:node,contourDust:dust});
 let scratch=null,layoutKey='',layout=null,bufferUploads=0;const layouts=new Map();
 function vao(sizes,instanced){const vao=gl.createVertexArray(),buffer=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buffer);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const stride=sizes.reduce((a,b)=>a+b,0)*4;let offset=0;
  sizes.forEach((n,i)=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,stride,offset);gl.vertexAttribDivisor(i,instanced?1:0);offset+=4*n;});return{vao,buffer};}
 const loops=vao([3,4,4],true),nodes=vao([3,4,4],false),motes=vao([4,4],false),gate=vao([3,4,4],true);
 const pointMax=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
 function upload(obj,data){gl.bindBuffer(gl.ARRAY_BUFFER,obj.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);bufferUploads++;}
 function makeLayout(mode,length){
  const L=[],N=[],D=[],cells=[];let seed=4017;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const loop=(c,rx,ry,bow,tilt,family,n,strength,id)=>{L.push(...c,rx,ry,bow,tilt,family,n,strength,id);};
  const hot=(c,rx,ry,bow,tilt,family,t,power,id)=>{N.push(...c,rx,ry,bow,tilt,family,t,power,id);};
  function cell(c,rx,ry,id,levels=10,strength=1){
   for(let n=0;n<levels;n++){let sc=.54+.46*Math.pow(.805,n),f=n===0?0:1;
    loop(c,rx*sc,ry*sc,.30*sc,.025*n+(id%2?-.04:.04),f,n,strength*Math.pow(.955,n),id);
   }
   if(cells.length<16)cells.push({c,r:[rx*.51,ry*.55,.94]});
   for(let j=0;j<9;j++)loop(c,rx*.46,ry*.49,.70+j*.01,j*.14,3,0,.075,id+j*.2);
   const count=Math.round(1050*strength);
   for(let n=0;n<count;n++){
    const az=rand()*Math.PI*2,zz=rand()*2-1,rr=Math.pow(rand(),.34),s=Math.sqrt(1-zz*zz);
    D.push(Math.cos(az)*s*rr*rx*.49,Math.sin(az)*s*rr*ry*.51,zz*rr*.7,rand(),...c,id);
   }
   // Smaller satellites carry the nested-outline grammar into the junctions.
   if(strength>.85)for(let j=0;j<4;j++){
    const a=j*Math.PI/2+.27,cc=[c[0]+Math.cos(a)*rx*.94,c[1]+Math.sin(a)*ry*.94,c[2]+.17];
    for(let n=0;n<4;n++){const sc=Math.pow(.72,n);loop(cc,.22*sc,.30*sc,.03,0,1,n,.34*Math.pow(.85,n),id+14+j);}
   }
   // Small convergences sit on the outer curve rather than occupying large white disks.
   for(const t of [.025,.475])hot(c,rx,ry,.30,id%2?-.04:.04,0,t,.82*strength,id);
  }
  if(mode===0){
   cell([0,.40,-1.70],3.05,3.80,1,13,1.0);
   cell([-6.15,1.35,-3.80],2.95,3.35,2,11,.90);
   cell([6.15,1.35,-3.80],2.95,3.35,3,11,.90);
   cell([-3.50,-3.95,-5.7],1.02,1.33,4,7,.58);
   cell([3.50,-3.95,-5.7],1.02,1.33,5,7,.58);
   cell([-3.60,5.02,-6.40],.92,1.12,6,7,.55);
   cell([3.60,5.02,-6.40],.92,1.12,7,7,.55);
   // Larger silhouette arcs frame the smaller recursively scaled cells.
   loop([-7.2,.1,-9],7.4,8.8,.6,.02,1,0,.36,8);
   loop([7.2,.1,-9],7.4,8.8,.6,-.02,1,0,.36,9);
   loop([0,0,-7.8],10.8,6.6,.8,0,0,0,.30,10);
   // Beaded arches connect the three primary cells.
   for(let side of [-1,1])for(let n=0;n<7;n++){
    const sc=Math.pow(.75,n),c=[side*3.15,.42,-1.0];
    loop(c,.77*sc,1.13*sc,.16,0,n%2,0,.75*Math.pow(.93,n),11+side);
    if(n===0)for(let t of [.15,.65])hot(c,.77,1.13,.16,0,0,t,1.1,11+side);
   }
  }else if(mode===2){
   // Prism: one layered, open armillary flower, satellites offset along depth.
   for(let j=0;j<4;j++){
    const cc=[(j-1.5)*2.0,.40,-1.2-j*1.1];
    for(let n=0;n<7;n++)loop(cc,3.0*(1-.065*n),3.05*(1-.065*n),.80, j*.66,6,n,.64*Math.pow(.90,n),8+j);
    for(let n=0;n<3;n++)hot(cc,3.0,3.05,.80,j*.66,6,n/3,.64,8+j);
   }
   cell([-5.7,.5,-5.8],1.06,1.44,21,6,.48);cell([5.7,.5,-5.8],1.06,1.44,22,6,.48);
  }else if(mode===3){
   // Echo: staggered diamond cages, cross-braced light paths and sparse junctions.
   for(let j=0;j<5;j++){
    const cc=[(j-2)*1.95,.55,-1.1-j*.85],rad=2.25;
    for(let n=0;n<4;n++)loop(cc,rad*(1+n*.075),rad*(1+n*.075),.30,j*.09,4,n,.68-n*.10,10+j);
    for(let k=0;k<4;k++){let a=k*Math.PI/2+.785;hot(cc,rad,rad,.30,j*.09,4,k/4,.64,10+j);}
   }
   for(let j=-4;j<=4;j++){
    loop([j*.72,-2.4,-4.8],2.2,5.6,1.8,0,5,0,.30,31+j);
    loop([j*.72,3.2,-3.0],2.2,-5.6,-1.8,0,5,0,.30,44+j);
   }
  }else if(mode===4){
   // Light-contour skeleton added INSIDE the original fractal body, not a replacement.
   const start=length,span=56,continuous=!!r.state._journey,stationBase=continuous?Math.round((start-1)/5.6):0;
   for(let j=0;j<10;j++){
    const z=start+j*5.6,station=stationBase+j;
    for(let n=0;n<3;n++)loop([0,0,z+n*.09],3.07+n*.075,3.10+n*.060,.08,0,n===0?4:1,n,.50-n*.12,50+station);
    for(let side of [-1,1])for(let n=0;n<3;n++)loop([side*2.92,0,z+.6],.37-n*.07,1.15-n*.15,.12,0,1,n,.35,61+station);
    if(station%2===0)for(let k=0;k<4;k++)hot([0,0,z],3.07,3.10,.08,0,4,k/4,.50,50+station);
   }
   for(let j=0;j<4;j++){const angle=j*Math.PI/2+.4+(continuous?start*2.6/span:0);loop([0,0,start],2.96,0,span,0,2,0,.24,angle);}
  }else{
   const end=Math.max(12,length),stations=Math.ceil(end/6.6);
   for(let j=0;j<stations;j++){
    const z=2.1+j*6.6;if(z>end-3.5)continue;
    if(mode===5){
     for(let n=0;n<5;n++)loop([0,0,z+n*.16],3.45+n*.16,3.48+n*.11,.65,(j%2?1:-1)*.18,6,n,.66-n*.09,72+j);
     for(let n=0;n<3;n++)hot([0,0,z],3.45,3.48,.65,.18,6,n/3,.70,72+j);continue;
    }
    if(mode===6){
     for(let n=0;n<4;n++)loop([0,0,z+n*.20],3.52+n*.20,3.60+n*.16,.16,j*.17,4,n,.74-n*.13,82+j);
     for(let k=0;k<4;k++){const a=k*Math.PI/2+.785;const x=Math.cos(a)*3.0,y=Math.sin(a)*3.0;loop([x,y,z],-x*.12,y*.08,Math.min(6.6,end-3.5-z),0,5,0,.47,90+k);hot([0,0,z],3.52,3.60,.16,j*.17,4,k/4,.62,82+j);}continue;
    }
    // Open ribs keep the full central travel lane free. No solid hub on the camera path.
    for(let k=0;k<3;k++)loop([0,0,z+k*.16],5.18+k*.43,4.72+k*.34,.20,0,k===1?1:0,k,.70-k*.14,20+j);
    for(let side of [-1,1])cell([side*4.35,.1,z],1.36,2.08,30+j*2+(side>0?1:0),8,.66);
   }
   // Three longitudinal current rails, outside the camera axis and shortened before the gate.
   for(let j=0;j<3;j++){
    const c=[0,0,1.2],angle=j*Math.PI*2/3+Math.PI/6;
    loop(c,3.06,0,end-5,0,2,0,.44,angle);
    for(let k=0;k<5;k++)hot(c,3.06,0,end-5,0,2,k/5,.78,angle);
   }
  }
  return{L,N,D,cells,mode,length,loopCount:L.length/11,nodeCount:N.length/11,dustCount:D.length/8};
 }
 function select(mode,length){const key=mode+':'+length+(mode===4&&r.state._journey?':continuous':'');if(key!==layoutKey){if(!layouts.has(key))layouts.set(key,makeLayout(mode,length));if(layouts.size>12)layouts.delete(layouts.keys().next().value);layout=layouts.get(key);layoutKey=key;upload(loops,layout.L);upload(nodes,layout.N);upload(motes,layout.D);}return layout;}
 function blit(src,dst){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dst.fbo);for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);}
 r.drawContour=(t,f)=>{
  const state=r.state,c=HapaContour.config(state),q=HapaContour.evaluate(r.cache,state,t),key=HapaGeometryDance.style(state),mode=key==='prism-sanctum'?2:key==='echo-lattice'?3:key==='prism-spindle'?5:key==='echo-drift'?6:state._tunnel?1:0,length=state._bridge?.length||36,proof=!!state._geometryProof;
  const colors=mode===2||mode===5?[[2.1,.017,1.28],[.012,.85,2.0]]:mode===3||mode===6?[[.018,2.9,1.02],[.30,.025,1.9]]:[[3.4,.034,.007],[.024,.060,1.4]];
  const l=select(mode,length),segments=state.quality==='draft'?128:state.quality==='high'?320:224;
  const u={...f.values,uLineHot:colors[0],uLineCold:colors[1],uPhase:proof?0:q.phase,uMode:mode,uLevels:proof?[0,0,0,0]:q.levels,uLoopScale:c.loopScale,uHalo:c.halo,uNodes:c.nodes,uBlueDepth:c.blueDepth,uSegments:segments,uPointMax:pointMax,uCarryLimit:1e4,uCarryGain:1};
  const target=r.scene;
  r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(stage.p);U(gl,stage,u);gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;
  if(state.reliquary.realms.media)r.drawMedia(f,t);
  if(state.occluder){
   const center=mode?[0,0,f.cam.eye[2]+6]:[0,.4,-1.7],p=M.add(f.cam.eye,M.scale(M.sub(center,f.cam.eye),.5)),model=M.identity();model.set([...M.scale(f.cam.right,1.4),0],0);model.set([...M.scale(f.cam.up,1.4),0],4);model.set([...f.cam.forward,0],8);model.set([...p,1],12);
   gl.useProgram(r.programs.mesh.p);U(gl,r.programs.mesh,{...f.values,uModel:model,uShape:2,uBlocker:1});gl.bindVertexArray(r.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;
  }
  if(!proof&&c.blueDepth>0&&l.cells.length){
   if(!scratch||!r.targets.includes(scratch))scratch=r.target(r.width,r.height,{count:2,float:r.hdr});
   const centers=new Float32Array(48),radii=new Float32Array(48);l.cells.forEach((v,i)=>{const qg=f.geometry;centers.set(HapaGeometryDance.forward(v.c,qg),i*3);const d=HapaGeometryDance.components(v.c[2],qg);radii.set([v.r[0]*d.radial,v.r[1]*d.radial,v.r[2]],i*3);});
   r.full(interior,scratch,{...u,uNear:f.cam.near,uFar:f.cam.far,uCenters:centers,uRadii:radii,uCellCount:l.cells.length,uColor:0,uEmission:1,uDepth:2},[target.textures[0],target.textures[1],target.depthTexture]);blit(scratch,target);
  }
  r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.blendEquation(gl.FUNC_ADD);gl.disable(gl.CULL_FACE);
  if(state.effects.dust&&!proof){gl.useProgram(dust.p);U(gl,dust,u);gl.bindVertexArray(motes.vao);gl.drawArrays(gl.POINTS,0,l.dustCount);r.drawCalls++;}
  gl.useProgram(line.p);U(gl,line,u);gl.bindVertexArray(loops.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,segments*6,l.loopCount);r.drawCalls++;
  if(c.nodes>0&&!proof){gl.useProgram(node.p);U(gl,node,u);gl.bindVertexArray(nodes.vao);gl.drawArrays(gl.POINTS,0,l.nodeCount);r.drawCalls++;}
  gl.disable(gl.BLEND);gl.depthMask(true);
  // Analytic red halos do the main work. Shared bloom only finishes the hottest cores.
  f.e.values['optics.flare']=0;f.e.values['optics.bloom']*=.30;f.e.values['finish.amount']=0;
  f.e.director.subject=mode===2?'Prism Sanctum · Light architecture':mode===3?'Echo Lattice · Light architecture':mode===5?'Prism Spindle · Geometry Dance':mode===6?'Harmonic Lattice · Geometry Dance':state._tunnel?'Contour Fold · Geometry Dance':'Contour Gallery · Geometry Dance';
  f.contourU=u;f.source=[0,.4,-1.7];f.sourceFront=false;f.sourceUV=[.5,.5,1];
  const stats={time:t,mode:state._tunnel?'passage':'gallery',backend:'instanced 3D curve ribbons + point cores + analytic bounded interiors',loops:l.loopCount,nodes:l.nodeCount,motes:state.effects.dust?l.dustCount:0,segments,bufferUploads,phase:q.phase,basePhase:q.basePhase,musicalPhase:q.musicalPhase,levels:q.levels,settings:c,incoming:!!state._incoming,opaqueDepth:'preserved; luminous curves do not claim solid surfaces'};
  r.contourStats=stats;f.contour=stats;f.realms={time:t,kind:mode?17:14,levels:q.levels,studyMix:[0,0,1],studyBlend:1,volumeSteps:0,phase:[q.phase,0,0,0],incoming:!!state._incoming,contour102:stats};r.realmStats=f.realms;
  return f;
 };
 r.drawContourCarry=(t,f)=>{
  const c=HapaGeometryDance.config(r.state);if(!c.enabled||c.carry<=0||f.cam.kind!==0||r.state._geometryProof||r.state._journeyInspect==='body')return;
  const L=r.state._bridge?.length||56,start=r.state._journey?Math.floor((f.cam.eye[2]-5.6)/5.6)*5.6+1.:r.state._tunnel?1.0:Math.floor(f.cam.eye[2]/5.6)*5.6+1.;
  const l=select(4,start),segments=r.state.quality==='draft'?112:192;
  const phase=HapaContour.evaluate(r.cache,r.state,t);
  const u={...f.values,uLineHot:r.state._journey?.hot||[3.2,.08,.012],uLineCold:r.state._journey?.cold||[.03,.18,2.0],uPhase:phase.phase,uMode:4,uLevels:phase.levels,uLoopScale:.58,uHalo:.48,uNodes:.40,uBlueDepth:.5,uSegments:segments,uPointMax:pointMax,uCarryLimit:r.state._tunnel?L-4:1e4,uCarryGain:c.carry*c.rails*(r.state._journey?(.22+.78*r.state._journey.weights[0]):1)};
  r.bind(r.scene);gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.disable(gl.CULL_FACE);
  gl.useProgram(line.p);U(gl,line,u);gl.bindVertexArray(loops.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,segments*6,l.loopCount);r.drawCalls++;
  gl.useProgram(node.p);U(gl,node,u);gl.bindVertexArray(nodes.vao);gl.drawArrays(gl.POINTS,0,l.nodeCount);r.drawCalls++;
  gl.disable(gl.BLEND);gl.depthMask(true);f.contourU=u;f.carry={loops:l.loopCount,nodes:l.nodeCount,source:'shared native 3D line profile'};
  f.e.values['optics.bloom']*=.42;f.e.values['optics.flare']=0;f.e.values['finish.amount']=0;
 };
 r.drawContourGate=(target,f,center,radius)=>{
  const u={...f.contourU,uPV:f.cam.pv,uEye:f.cam.eye,uForward:f.cam.forward,uRight:f.cam.right,uUp:f.cam.up,uResolution:[r.width,r.height],uLoopScale:(1.-.78)/.38,uLevels:[0,0,0,0],uPhase:0,uSegments:224,uDanceOn:0,uMode:0,uCarryLimit:1e4,uCarryGain:1};
  const data=[];for(let i=0;i<2;i++)data.push(...center,radius+i*.027,radius+i*.027,0,0,0,0,.7-i*.28,87);
  upload(gate,data);r.bind(target);gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.disable(gl.CULL_FACE);gl.useProgram(line.p);U(gl,line,u);gl.bindVertexArray(gate.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,224*6,2);r.drawCalls++;gl.disable(gl.BLEND);gl.depthMask(true);
 };
 return true;
};

