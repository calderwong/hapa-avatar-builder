
/* Visible Wind: instantaneous field-traced ribbons, finite spherical pressure strokes.
 * The same field couples Fire and Water. Transparent ink is drawn after other media;
 * this is not universal multiple-volume ordering or a conservative particle solver.
 */
'use strict';
window.HapaWindVisuals=function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms,K=HapaWindKernel;
 const program=HapaRenderer.program(gl,HapaWindShaders.vertex,HapaWindShaders.fragment,'Wind / painted air');r.programs.windInk=program;
 const vao=gl.createVertexArray(),buf=gl.createBuffer();r.vaos.push(vao);r.buffers.push(buf);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,200000*4,gl.DYNAMIC_DRAW);
 for(const [i,n,off]of [[0,3,0],[1,2,12],[2,4,20]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,36,off);}gl.bindVertexArray(null);
 const pathStorage=HapaElementPaths.storage();let bufferCapacity=0;
 const originalWaterUniforms=r.waterUniforms;
 r.waterUniforms=q=>({...originalWaterUniforms(q),...(q.sharedWind?K.uniforms(q.sharedWind.field):{}),uWindWaterGain:q.sharedWind?.waterCoupling||0,uWindMemory:q.sharedWind?.memory||0});
 r.waterReflectionExtras=(t,target,f)=>{if(!HapaWind.combined(r.state)||!HapaFire.config(r.state).enabled)return;
  const q=HapaFire.evaluate(r.cache,r.state,t);r.drawFireLayer(t,f,{target,packet:q,places:HapaWind.places(r.state),reflection:true});};
 r.drawConfluence=(t,f)=>{r.drawWater(t,f);const q=HapaFire.evaluate(r.cache,r.state,t),layer=r.drawFireLayer(t,f,{packet:q,places:HapaWind.places(r.state)});
  f.fire=layer;r.fireStats=layer;f.e.values['optics.flare']=0;return f;};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
 function ribbon(out,points,width,tint,alpha,cam,mode=0){
  const edge=[];const N=points.length-1;
  for(let i=0;i<=N;i++){const u=i/N,p=points[i],v=M.norm(M.sub(points[Math.min(i+1,N)],points[Math.max(0,i-1)]));
   // View-facing strip preserves width; its centerline lives entirely in world space.
   let side=M.cross(v,M.sub(cam.eye,p));if(Math.hypot(...side)<.001)side=[1,0,0];side=M.norm(side);
   const taper=Math.pow(Math.max(.03,Math.sin(Math.PI*u)),.65),w=width*taper*(.82+.18*Math.sin(u*14.+mode));
   edge.push([M.add(p,M.scale(side,-w)),M.add(p,M.scale(side,w))]);
  }
  const vert=(idx,side)=>{const u=idx/N;out.push(...edge[idx][side],u,side,...tint,alpha);};
  for(let i=0;i<N;i++){vert(i,0);vert(i,1);vert(i+1,1);vert(i,0);vert(i+1,1);vert(i+1,0);}
 }
 function strokes(packet,f){const out=[],q=packet.field,st=r.state,center=st._tunnel?[0,0,st._bridge.length*.5]:[0,0,-2],phase=packet.phase,sp=Math.hypot(q.mean[0],q.mean[2]),dir=[q.mean[0]/Math.max(sp,.001),0,q.mean[2]/Math.max(sp,.001)],side=[-dir[2],0,dir[0]],count=st._tunnel?30:24;
  for(let k=0;k<count;k++){
   const thin=k>=10,band=k%6,row=Math.floor(k/6),lane=(band-2.5)*1.35;
   let p=st._tunnel?[Math.sin(k*2.399)*3.2,.20+(k%5)*.55,1.0+(k/(count-1))*(st._bridge.length-2.)]:M.add(M.add(center,M.scale(dir,-7.0)),M.scale(side,lane));
   if(!st._tunnel)p[1]=-.52+row*.83+.18*Math.sin(k*1.7);
   const points=[p];const steps=46,dt=thin?.20:.27;
   for(let j=0;j<steps;j++){
    const a=K.sample(q,p).velocity,mid=M.add(p,M.scale(a,dt*.5)),v=K.sample(q,mid).velocity;
    p=M.add(p,M.scale(v,dt));points.push(p);
   }
   const tint=packet.colors[k%2],alpha=(thin?.20:.42)*packet.pigment;
   ribbon(out,points,thin?.013:.065+.013*(k%3),tint,alpha,f.cam,k);
  }
  // Same origin, radius and age as the field's compressive front. No screen-space circles.
  for(const event of packet.events){const age=event.age,R=event.speed*age,env=Math.min(1,age/.10)*Math.max(0,Math.min(1,(event.life-age)/.8))*Math.exp(-age*.21);
   if(R<.035||R>45)continue;
   for(let k=0;k<5;k++){
    const points=[],tilt=k===0?0:(k/4)*Math.PI,axis=k*1.23;
    for(let j=0;j<=110;j++){const a=j/110*Math.PI*2;let p=[R*Math.cos(a),R*Math.sin(a)*Math.sin(tilt),R*Math.sin(a)*Math.cos(tilt)];
     const x=p[0];p[0]=Math.cos(axis)*x-Math.sin(axis)*p[2];p[2]=Math.sin(axis)*x+Math.cos(axis)*p[2];points.push(M.add(event.origin,p));}
    const tint=k%2?packet.colors[0]:packet.colors[1];ribbon(out,points,Math.min(.15,.045+R*.01),tint,packet.pigment*event.strength*env*(k===0?.80:.30),f.cam,k);
   }
  }
  return out;
 }
 r.drawWind=(t,f)=>{if(window.HapaDynamics?.relevant(r.state))return f;if(!HapaWind.relevant(r.state)){r.windStats={time:t,active:false};return f;}
  const packet=HapaWind.evaluate(r.cache,r.state,t),enhanced=HapaElements.enabled(r.state),data=packet.pigment>0?(enhanced?HapaElementPaths.mesh(HapaElementPaths.build(packet,r.state,pathStorage),f.cam,packet.style?.body,r.height):strokes(packet,f)):[],target=r.scene;
  if(data.length){r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
   gl.useProgram(program.p);U(gl,program,{...HapaElementStyle.uniforms(packet),uPV:f.cam.pv,uEye:f.cam.eye,uInkPhase:packet.phase});gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);if(enhanced){if(bufferCapacity<pathStorage.vertices.byteLength){bufferCapacity=pathStorage.vertices.byteLength;gl.bufferData(gl.ARRAY_BUFFER,bufferCapacity,gl.DYNAMIC_DRAW);}gl.bufferSubData(gl.ARRAY_BUFFER,0,data);}else{gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);bufferCapacity=0;}gl.drawArrays(gl.TRIANGLES,0,data.length/9);r.drawCalls++;gl.disable(gl.BLEND);gl.depthMask(true);}
  f.wind={...packet,active:true,inkTriangles:data.length/27,world:r.state.world,tunnel:r.state._bridge?.style||null,incoming:!!r.state._incoming,pathMetrics:enhanced?HapaElementPaths.metrics(pathStorage):null,vertexBufferBytes:bufferCapacity,tracePolicy:enhanced?'art-directed lagged-phase RK2 paths; not transported material history':'RK2 instantaneous streamlines; no persistent advection history'};r.windStats=f.wind;return f;};
 const oldDraw=r.drawScene.bind(r);r.drawScene=(...args)=>{const f=oldDraw(...args);return r.drawWind(args[0],f);};
 return{paint:'wind',confluence:'coupled world-space fields'};
};

