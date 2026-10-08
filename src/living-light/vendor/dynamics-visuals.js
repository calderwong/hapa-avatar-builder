
/* Existing-context laboratory. Six depth-peels + seventh overflow witness;
 * all captured sheets are interleaved with one mixed fire/smoke/condensate integral. */
'use strict';
window.HapaDynamicsVisuals=function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms,S=HapaDynamicsShaders;
 const opaque=HapaRenderer.program(gl,HapaShaders.vertex,S.opaque,'Dynamics / solid laboratory'),layer=HapaRenderer.program(gl,S.layerVertex,S.layerFragment,'Dynamics / transparent depth peel'),volume=HapaRenderer.program(gl,HapaShaders.vertex,S.composite,'Dynamics / interleaved media');
 Object.assign(r.programs,{dynOpaque:opaque,dynLayer:layer,dynComposite:volume});let targets=null,gridId=null,textures=[];const count=6;
 function texture3D(w,h,d,target=gl.TEXTURE_3D){const t=gl.createTexture();gl.bindTexture(target,t);gl.texStorage3D(target,1,gl.RGBA16F,w,h,d);gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.LINEAR);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(target,k,gl.CLAMP_TO_EDGE);textures.push(t);return t;}
 const grid=texture3D(20,16,20),material=texture3D(20,16,20);let layerArray=null,metaArray=null;
 const vao=gl.createVertexArray(),vbo=gl.createBuffer();r.vaos.push(vao);r.buffers.push(vbo);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
 for(const [i,n,offset]of [[0,3,0],[1,3,12],[2,4,24]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,40,offset);}gl.bindVertexArray(null);
 const getTargets=()=>{if(targets&&r.targets.includes(targets.scratch))return targets;
  for(const t of [layerArray,metaArray])if(t){gl.deleteTexture(t);textures=textures.filter(v=>v!==t);}
  layerArray=texture3D(r.width,r.height,count,gl.TEXTURE_2D_ARRAY);metaArray=texture3D(r.width,r.height,count,gl.TEXTURE_2D_ARRAY);
  targets={peels:Array.from({length:count+1},()=>r.target(r.width,r.height,{count:2,depth:true,float:r.hdr})),scratch:r.target(r.width,r.height,{count:2,float:r.hdr})};return targets;};
 function blitColor(src,dst){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dst.fbo);for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,src.w,src.h,0,0,dst.w,dst.h,gl.COLOR_BUFFER_BIT,gl.NEAREST);}r.bind(dst);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);}
 function geometry(q,t){
  const s=q.solver,c=q.config,points=[],groups=[];const unit=M.norm;
  function tri(a,b,d,co){for(const p of [a,b,d])points.push(...p.p,...p.n,...co);}
  function quad(a,b,c,d,co){tri(a,b,c,co);tri(a,c,d,co);}
  function group(name,fn){const from=points.length/10;fn();groups.push({name,first:from,count:points.length/10-from});}
  // Shallow surface uses the persistent numerical wave patch. Fine inherited Water waves are shading-scale.
  const wp=HapaWater.evaluate(r.cache,r.state,t);
  function shallow(x,z){const ix=clamp((x-s.origin[0])/s.h-.5,0,s.nx-1),iz=clamp((z-s.origin[2])/s.h-.5,0,s.nz-1),a=Math.min(s.nx-2,Math.floor(ix)),b=Math.min(s.nz-2,Math.floor(iz)),fx=ix-a,fz=iz-b,H=s.water.height,i=a+s.nx*b;return ((1-fx)*H[i]+fx*H[i+1])*(1-fz)+((1-fx)*H[i+s.nx]+fx*H[i+s.nx+1])*fz;}
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const surf=(x,z)=>{const a=HapaWater.sample(wp,x,z),h=shallow(x,z),dx=(shallow(x+.03,z)-shallow(x-.03,z))/.06,dz=(shallow(x,z+.03)-shallow(x,z-.03))/.06;return{p:[x,-1.52+h+a.height*.12,z],n:unit([-dx-a.slope[0]*.12,1,-dz-a.slope[1]*.12])};};
  group('water',()=>{const n=50;for(let z=0;z<n;z++)for(let x=0;x<n;x++){const x0=-3.1+x*6.2/n,z0=-5.1+z*6.2/n,dx=6.2/n;if(Math.hypot(x0,z0+2)>3.13)continue;quad(surf(x0,z0),surf(x0+dx,z0),surf(x0+dx,z0+dx),surf(x0,z0+dx),[.09,.24,.26,.39]);}});
  // Two intersecting translucent curved veils: actual triangles, not a screen mask.
  if(c.surfaces)for(let side=0;side<2;side++)group('veil-'+side,()=>{const at=(u,v)=>{const a=(u-.5)*1.9,angle=a+(side?Math.PI*.35:-Math.PI*.28),rad=2.34;return{p:[Math.sin(angle)*rad, -1.25+v*3.1,-2+Math.cos(angle)*rad*.56+(side?-.38:0)+.08*Math.sin(v*6+t*.45)],n:unit([Math.sin(angle),.02,Math.cos(angle)])};};for(let j=0;j<16;j++)for(let i=0;i<44;i++)quad(at(i/44,j/16),at((i+1)/44,j/16),at((i+1)/44,(j+1)/16),at(i/44,(j+1)/16),side?[.07,.30,.31,.18]:[.31,.19,.07,.14]);});
  if(c.ink&&c.pigment>0)group('transported-air',()=>{
   // Instantaneous diagnostic curves follow the projected numerical velocity, including obstacle deflection.
   for(let k=0;k<16;k++){let p=[-3.4,-.85+(k%4)*.66,-3.8+Math.floor(k/4)*1.15],prior=null;
    for(let j=0;j<64;j++){const sample=s.sample(p);if(sample.solid)break;const v=sample.velocity,mid=p.map((x,i)=>x+v[i]*.12),vm=s.sample(mid);if(vm.solid)break;const next=p.map((x,i)=>x+vm.velocity[i]*.24);if(next.some((v,i)=>v<s.origin[i]||v>s.origin[i]+[8,6.4,8][i]))break;
     const tangent=unit(vm.velocity),toward=unit(M.sub(r.lastFrame?.cam.eye||[0,2,9],p)),side=unit(M.cross(tangent,toward)),width=.011+.012*Math.sin(j/64*Math.PI),one={p:M.add(p,M.scale(side,-width)),n:toward},two={p:M.add(p,M.scale(side,width)),n:toward};
     if(prior)quad(prior[0],prior[1],two,one,[.15+.07*Math.sin(j*.3),.46,.47,.14*c.pigment]);prior=[one,two];p=next;
    }
   }
  });
  return{data:new Float32Array(points),groups};
 }
 r.drawDynamics=(t,f)=>{
  const q=HapaDynamics.evaluate(r.cache,r.state,t),s=q.solver,c=q.config,T=getTargets(),target=r.scene;
  const u={...f.values,uResolution:[r.width,r.height],uNear:f.cam.near,uFar:f.cam.far,uHot:Math.min(1.5,(q.stats.reactionRate||0)/25)};
  const centers=new Array(40).fill(0),sizes=new Array(40).fill(0),obs=c.obstacles?c.obstacleShapes:[];obs.forEach((o,i)=>{centers.splice(i*4,4,...o.center,o.type==='box'?0:o.type==='sphere'?1:2);sizes.splice(i*4,4,...(o.type==='box'?o.half:[o.radius,o.halfHeight||0,0]),0);});
  r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(opaque.p);U(gl,opaque,{...u,uObstacleCenter:centers,uObstacleSize:sizes,uObstacleCount:obs.length});gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;
  const geo=geometry(q,t);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,geo.data,gl.DYNAMIC_DRAW);
  const groups=r.dynamicsReverse?[...geo.groups].reverse():geo.groups;
  for(let k=0;k<count+1;k++){
   const peel=T.peels[k];r.bind(peel);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LESS);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));gl.clearBufferfv(gl.COLOR,1,new Float32Array(4));gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));gl.useProgram(layer.p);
   U(gl,layer,{...u,uLayer:k,uPrevious:0,uOpaqueDepth:1});r.texture(k?T.peels[k-1].depthTexture:target.depthTexture,0);r.texture(target.depthTexture,1);gl.bindVertexArray(vao);for(const g of groups){gl.drawArrays(gl.TRIANGLES,g.first,g.count);r.drawCalls++;}
  }
  // Separate array storage is only written after peeling has completed, never sampled as a draw attachment.
  gl.activeTexture(gl.TEXTURE0);for(let k=0;k<count;k++){const peel=T.peels[k];gl.bindFramebuffer(gl.READ_FRAMEBUFFER,peel.fbo);for(const [a,texture]of [[0,layerArray],[1,metaArray]]){gl.readBuffer(gl.COLOR_ATTACHMENT0+a);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,k,0,0,r.width,r.height);}}
  const id=q.entry.serial+':'+s.tick;if(gridId!==id){const [a,b]=s.pack();for(const[tex,data]of [[grid,a],[material,b]]){gl.bindTexture(gl.TEXTURE_3D,tex);gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,s.nx,s.ny,s.nz,gl.RGBA,gl.FLOAT,data);}gridId=id;}
  r.bind(T.scratch);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.BLEND);gl.useProgram(volume.p);
  U(gl,volume,{...u,uBase:0,uBaseEmission:1,uDepth:2,uGrid:3,uMaterial:4,uLayers:5,uLayerData:6,uOrigin:s.origin,uExtent:[s.nx*s.h,s.ny*s.h,s.nz*s.h],uGridSize:[s.nx,s.ny,s.nz],uLayerCount:count,uVolume:c.enabled?c.volume*1.6:0,uPigment:c.ink?c.pigment:0,uMode:r.dynamicsMode||0,uOrder:c.orderCorrect?1:0});
  [target.textures[0],target.textures[1],target.depthTexture].forEach((tex,i)=>r.texture(tex,i));for(const[tex,i,tar]of [[grid,3,gl.TEXTURE_3D],[material,4,gl.TEXTURE_3D],[layerArray,5,gl.TEXTURE_2D_ARRAY],[metaArray,6,gl.TEXTURE_2D_ARRAY]]){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(tar,tex);}gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;blitColor(T.scratch,target);gl.depthMask(true);
  f.e.values['optics.flare']=0;f.e.values['optics.bloom']*=.40;f.dynamics={...q.stats,layerBudget:count,surfaceTriangles:geo.data.length/30,obstacles:obs.length,incoming:!!r.state._incoming,visualization:r.dynamicsMode||0,ordering:c.orderCorrect?'peeled surfaces interleaved with one mixed volume':'comparison: volume before all translucent sheets'};r.dynamicsStats=f.dynamics;return f;
 };
 r.dynamicsLayerAudit=()=>{if(!targets||!r.targets.includes(targets.scratch))return{status:'not rendered at current dimensions'};const prev=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),counts=[];
  for(const t of targets.peels){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,t.fbo);gl.readBuffer(gl.COLOR_ATTACHMENT1);const a=new Float32Array(t.w*t.h*4);gl.readPixels(0,0,t.w,t.h,gl.RGBA,gl.FLOAT,a);let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>.5)n++;counts.push(n);}gl.bindFramebuffer(gl.READ_FRAMEBUFFER,prev);return{captured:counts.slice(0,6),overflowPixels:counts[6],capacity:6,completeForImage:counts[6]===0};};
 const prior=r.dispose.bind(r);r.dispose=()=>{for(const t of textures)gl.deleteTexture(t);textures=[];prior();};
 return{binding:'alchemical-court',solver:'finite MAC grid',ordering:'six peeled surface layers plus overflow witness'};
};

