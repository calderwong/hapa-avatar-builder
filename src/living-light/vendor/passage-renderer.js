
/* Two live linear-light scene passes, one optical/display finish. Render-to-texture
 * doorways use screen-projective sampling and mapped virtual cameras. No recursive
 * portals, generic field union, or fabricated video depth. Endpoint anchors curated.
 */
'use strict';
window.HapaPassageRenderer=function(r){
 const M=HapaMath,C=HapaCore,P=HapaPassages,gl=r.gl,U=HapaRenderer.uniforms,program=HapaRenderer.program;
 const vs=`#version 300 es
 precision highp float;layout(location=0)in vec2 aUV;uniform mat4 uPV,uModel;uniform float uRadius;out vec2 vUV;
 void main(){vUV=aUV;gl_Position=uPV*uModel*vec4((aUV-.5)*uRadius*2.,0.,1.);}`;
 const fs=`#version 300 es
 precision highp float;in vec2 vUV;uniform sampler2D uColor,uEmission;uniform vec2 uResolution;uniform float uOpen;uniform vec3 uTint;
 layout(location=0)out vec4 outColor;layout(location=1)out vec4 outEmission;
 void main(){vec2 q=(vUV-.5)*2.;float rad=length(q);if(rad>1.)discard;vec2 uv=gl_FragCoord.xy/uResolution;
 float open=smoothstep(.0,.12,uOpen)* (1.-smoothstep(max(.001,uOpen)-.008,max(.002,uOpen),rad));
 vec3 a=texture(uColor,uv).rgb,b=texture(uEmission,uv).rgb;
 float rim=exp(-abs(rad-uOpen)*120.)*.18*step(.01,uOpen)*(1.-step(.998,uOpen));
 outColor=vec4(mix(vec3(.003,.005,.009),a,open)+uTint*rim,1.);outEmission=vec4(b*open+uTint*rim*.5,1.);}`;
 const rv=`#version 300 es
 precision highp float;layout(location=0)in vec3 aPos;layout(location=1)in vec3 aNormal;uniform mat4 uPV,uModel;out vec3 vNormal;out vec3 vPos;
 void main(){vec4 p=uModel*vec4(aPos,1.);vPos=p.xyz;vNormal=normalize(mat3(uModel)*aNormal);gl_Position=uPV*p;}`;
 const rf=`#version 300 es
 precision highp float;in vec3 vNormal;in vec3 vPos;uniform vec3 uEye,uAccent,uHighlight;uniform float uEnergy;
 layout(location=0)out vec4 outColor;layout(location=1)out vec4 outEmission;
 void main(){vec3 n=normalize(vNormal),l=normalize(vec3(-.4,1.,.55)),v=normalize(uEye-vPos);float df=max(dot(n,l),0.);
 float spec=pow(max(dot(reflect(-l,n),v),0.),42.);float fres=pow(1.-abs(dot(n,v)),3.);
 vec3 base=mix(uAccent*.18,uHighlight*.40,.55);vec3 e=uAccent*fres*(.07+.14*uEnergy);
 outColor=vec4(base*(.22+.8*df)+uHighlight*spec*.6+e,1.);outEmission=vec4(e,1.);}`;
 r.programs.door=program(gl,vs,fs,'projected passage doorway');r.programs.collar=program(gl,rv,rf,'solid threshold collar');
 const vao=gl.createVertexArray();r.vaos.push(vao);gl.bindVertexArray(vao);const pos=[],nor=[];
 const point=(a,b)=>[(1+.055*Math.cos(b))*Math.cos(a),(1+.055*Math.cos(b))*Math.sin(a),.055*Math.sin(b)];
 const normal=(a,b)=>[Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)];
 for(let i=0;i<112;i++)for(let j=0;j<12;j++){const a=i/112*Math.PI*2,A=(i+1)/112*Math.PI*2,b=j/12*Math.PI*2,B=(j+1)/12*Math.PI*2;for(const [x,y]of [[a,b],[A,b],[A,B],[a,b],[A,B],[a,B]]){pos.push(...point(x,y));nor.push(...normal(x,y));}}
 for(const [arr,loc]of [[pos,0],[nor,1]]){const b=gl.createBuffer();r.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}
 gl.bindVertexArray(null);
 const cloneState=(s,world,extra={})=>({...s,world,...extra});
 const native=(s,t)=>M.camera(t,r.width/r.height,s,C.evaluate(r.cache,s,t));
 const pose=(c)=>({eye:c.eye,forward:c.forward,up:c.up,fov:c.fov*180/Math.PI});
 const colors=id=>{const p=C.palettes.find(p=>p.id===id)||C.palettes[0];return Object.fromEntries(Object.entries(p.roles).map(([k,v])=>['u'+k[0].toUpperCase()+k.slice(1),C.linearHex(v)]));};
 function palette(s,world,t){const sh=HapaDirector.shotAt(s.director.shots,s._cueTime??t).shot;return HapaArticulation.palette(colors(sh.lookSnapshot?.palette||(sh.palette&&sh.palette!=='inherit'?sh.palette:s.palette)),r.cache,s,t);}
 function mixColors(a,b,u){return Object.fromEntries(Object.keys(a).map(k=>[k,a[k].map((v,i)=>v+(b[k][i]-v)*u)]));}
 function draw(state,target,t){const oldS=r.state,oldTarget=r.scene,oldMedia=r.mediaManager;r.state=state;r.scene=target;if(state._incoming&&r.incomingMedia)r.mediaManager=r.incomingMedia;try{return r.drawScene(t);}finally{r.state=oldS;r.scene=oldTarget;r.mediaManager=oldMedia;}}
 function door(target,f,source,center,radius,open=1,angles=[0,0,0]){
  if(radius<.003)return;r.bind(target);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  const p=r.programs.door;gl.useProgram(p.p);U(gl,p,{uPV:f.cam.pv,uModel:M.model(center,angles),uRadius:radius,uResolution:[r.width,r.height],uOpen:open,uTint:f.values.uAccent,uColor:0,uEmission:1});r.texture(source.textures[0],0);r.texture(source.textures[1],1);gl.bindVertexArray(r.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;
 }
 function collar(target,f,center,radius,angles=[0,0,0]){
  if((f.contour||f.carry)&&r.drawContourGate){r.drawContourGate(target,f,center,radius);return;}
  if(radius<.02)return;r.bind(target);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);const p=r.programs.collar;gl.useProgram(p.p);U(gl,p,{uPV:f.cam.pv,uModel:M.model(center,angles,radius),uEye:f.cam.eye,uAccent:f.values.uAccent,uHighlight:f.values.uHighlight,uEnergy:f.e.director?.features.vocal||0});gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,pos.length/3);r.drawCalls++;
 }
 r.routeMedia=(f,t)=>{
  if(r.state.showMedia===false)return;const st=r.state,bridge=st._bridge;if(!bridge?.wallMedia&&bridge?.style!=='media-weave')return;
  const p=r.programs.media;gl.useProgram(p.p);gl.bindVertexArray(r.quadVAO);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
  for(let i=0;i<6;i++){const media=r.mediaManager?.slots[i%2?'A':'B'];if(!media)continue;const side=i%2?1:-1,z=3+i*4.2;
   U(gl,p,{uFocal:st.horizons?.focal?.[i%2?'A':'B']||[.5,.5],uSourceTrim:st.horizons?.sourceTrim?1:0,uPV:f.cam.pv,uModel:M.model([side*3.03,0,z],[0,side*.9,bridge.style==='media-weave'?side*.14:0]),uSize:[1.8,2.6],uVideo:0,uMediaAspect:media.width/media.height,uSurfaceAspect:1.8/2.6,uRadiance:.25,uMediaGain:.30,uMask:0,uGrade:1,uEye:f.cam.eye,uHighlight:f.values.uHighlight,uAccent:f.values.uAccent});r.texture(media.texture,0);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;
  }
 };
 r.routeRender=t=>{
  const s=r.state,p=HapaCurrents.route(r.cache,s,t);r.routeTelemetry={...p,bridge:p.bridge?{id:p.bridge.id,style:p.bridge.style,from:p.bridge.from,to:p.bridge.to,start:p.bridge.start,arrival:p.bridge.arrival}:null};
  r.inRoute=p.active;r._routeFrame=p;
  if(!p.active){const f=draw(cloneState(s,p.world,{palette:p.palette||s.palette}),r.scene,t);const last=s.passages?.enabled?s.passages.bridges.filter(b=>b.arrival<=t).at(-1):null;if(last)f.e.values['optics.flare']*=P.smooth((t-last.arrival)/.9);f.routeWorld=p.world;return f;}
  const b=p.bridge,main=r.scene,aux=r.destination,aspect=r.width/r.height;
  const fromState=cloneState(s,b.from,{_noPortal:true,palette:p.palette}),toState=cloneState(s,b.to,{_noPortal:true,_incoming:true,_cueTime:b.arrival,palette:b.toPalette});
  const startColors=palette(fromState,b.from,Math.min(t,b.arrival-.001)),destColors=palette(toState,b.to,t),colorPhase=P.smooth(p.progress)*(1-b.continuity*.45),tunnelColors=mixColors(startColors,destColors,colorPhase);
  toState._colors=destColors;
  if(p.quiet){
   // Freeze both ends at their own boundary pose. A protected outgoing pose must not leak into the incoming world's camera.
   fromState._pose=pose(native(fromState,b.start));toState._pose=pose(native(toState,b.arrival));
   const f=draw(fromState,main,t),g=draw(toState,aux,t);r.finishQuiet?.(f,g,p);f.routeWorld=b.from;f.e.values['optics.flare']*=1-P.smooth(p.u);return f;
  }
  let f,tunnelPose,destFrame;
  const tunnel=cloneState(s,'breathline-weave',{_noPortal:true,_tunnel:true,_bridge:b,_colors:tunnelColors,_polish:s.passages.polish});
  if(p.u<p.entry){
   const base=native(fromState,t),q=P.smooth(p.u/p.entry),anchor=[0,.2,3.0],end=[0,.2,3.35];
   const eye=base.eye.map((v,i)=>v+(end[i]-v)*q),forward=M.norm(base.forward.map((v,i)=>v+([0,0,-1][i]-v)*q));
   fromState._pose={eye,forward,fov:base.fov*180/Math.PI};
   tunnelPose={eye:[-eye[0],eye[1]-.2,3-eye[2]],forward:[-forward[0],forward[1],-forward[2]],fov:base.fov*180/Math.PI};tunnel._pose=tunnelPose;
   draw(tunnel,aux,t);f=draw(fromState,main,t);
   const grow=P.smooth(p.u/.09),radius=2.8*grow;door(main,f,aux,anchor,radius,1);if(s.passages.polish)collar(main,f,[0,.2,3.015],radius*1.025);
   f.e.values['optics.flare']*=1-P.smooth(p.u/p.entry);
   r.routeTelemetry.virtualCamera=tunnelPose;r.routeTelemetry.primary='outgoing + tunnel';
  }else{
   // The same fixed distance route is sampled directly at score time; no free-running integration.
   const z=-.35+b.length*p.progress;tunnelPose={eye:[0,0,z],forward:[0,0,1],fov:s.fov};tunnel._pose=tunnelPose;
   const targetBase=native(toState,t),remaining=b.length-.35-z;
   const destPose={...pose(targetBase),eye:M.add(targetBase.eye,M.scale(targetBase.forward,-remaining))};toState._pose=destPose;
   const g=draw(toState,aux,t);destFrame=g;f=draw(tunnel,main,t);
   // Circular live destination, with an iris that opens before arrival.
   const gate=[0,0,b.length],radius=2.93;door(main,f,aux,gate,radius,['iris-bloom','halo-bloom','crown-engine'].includes(b.style)?1:p.reveal,[0,Math.PI,0]);
   if(['iris-bloom','halo-bloom','crown-engine'].includes(b.style))r.drawIris?.(main,f,[0,0,b.length-.06],radius,p.reveal,[0,Math.PI,0]);
   if(s.passages.polish){collar(main,f,[0,0,b.length-.04],radius*1.026);collar(main,f,[0,0,b.length+.42],radius*1.075);}
   f.e.values['optics.flare']=0;
   // Carry destination's source visibility/optical settings once the portal fills the image.
   const handoff=P.smooth((p.flight-.94)/.06);
   if(handoff>.001){for(const key of ['optics.bloom'])f.e.values[key]=f.e.values[key]*(1-handoff)+g.e.values[key]*handoff;f.sourceUV=g.sourceUV;f.sourceFront=g.sourceFront;}
   r.routeTelemetry.virtualCamera=destPose;r.routeTelemetry.primary='tunnel + destination';
  }
  r.routeTelemetry.camera=pose(f.cam);r.routeTelemetry.destinationCamera=destFrame?pose(destFrame.cam):null;r.routeTelemetry.distance=b.length;r.routeTelemetry.arrivalError=0;r.routeTelemetry.scenePasses=2;
  f.routeWorld=p.u<p.entry?b.from:'breathline-weave';return f;
 };
 // Quiet mode composites scene attachments, not separately tone-mapped pictures.
 const qfs=`#version 300 es
 precision highp float;uniform sampler2D a,b,ea,eb;uniform vec2 size;uniform float amount;layout(location=0)out vec4 c;layout(location=1)out vec4 e;void main(){vec2 uv=gl_FragCoord.xy/size;c=mix(texture(a,uv),texture(b,uv),amount);e=mix(texture(ea,uv),texture(eb,uv),amount);}`;
 r.programs.quiet=program(gl,HapaShaders.vertex,qfs,'quiet passage');
 r.finishQuiet=(f,g,p)=>{
  // No sampling from the same attachment being written. Blit main to a scratch pair.
  if(!r.quietScratch||!r.targets.includes(r.quietScratch)){r.quietScratch=r.target(r.width,r.height,{count:2,float:r.hdr});}
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,r.scene.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,r.quietScratch.fbo);
  for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,r.quietScratch.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  r.full(r.programs.quiet,r.scene,{a:0,b:1,ea:2,eb:3,size:[r.width,r.height],amount:P.smooth(p.u)},[r.quietScratch.textures[0],r.destination.textures[0],r.quietScratch.textures[1],r.destination.textures[1]]);
 };
 return{describe:()=>({backend:'two-pass native WebGL2',portal:'projective linear color/emission; independent scene depth; curated camera mappings',styles:P.styles}),route:t=>P.at(r.state,t)};
};

