
/* Solid segmented iris: twelve extruded annular sectors, independently folded away.
 * The live doorway below remains a separate render target with its own depth space.
 */
'use strict';
window.HapaHorizonVisuals=function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms;const positions=[],normals=[],PI=Math.PI;
 // A tapered thick blade pointing +X in its own local frame. Small central clearance.
 const segments=7,half=PI/12*.965;
 function point(rad,a,z){return [rad*Math.cos(a),rad*Math.sin(a),z];}
 function tri(a,b,c){const n=M.norm(M.cross(M.sub(b,a),M.sub(c,a)));for(const p of [a,b,c]){positions.push(...p);normals.push(...n);}}
 function quad(a,b,c,d){tri(a,b,c);tri(a,c,d);}
 for(let j=0;j<segments;j++){const a=-half+2*half*j/segments,b=-half+2*half*(j+1)/segments;
  const front=[point(.008,a,.04),point(1.025,a,.04),point(1.025,b,.04),point(.008,b,.04)];quad(...front);quad(point(.008,b,-.04),point(1.025,b,-.04),point(1.025,a,-.04),point(.008,a,-.04));
  quad(point(1.025,a,-.04),point(1.025,b,-.04),point(1.025,b,.04),point(1.025,a,.04));
 }
 for(const a of [-half,half])quad(point(.008,a,-.04),point(1.025,a,-.04),point(1.025,a,.04),point(.008,a,.04));
 const vao=gl.createVertexArray();r.vaos.push(vao);gl.bindVertexArray(vao);for(const [a,i]of [[positions,0],[normals,1]]){const b=gl.createBuffer();r.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(a),gl.STATIC_DRAW);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,0,0);}gl.bindVertexArray(null);
 r.drawIris=(target,f,center,radius,open,angles=[0,0,0])=>{
  const p=r.programs.collar,st=r.state,g=HapaHorizons.evaluate(st,r.renderTime||0);const u=HapaHorizons.smooth(Math.min(1,open+g.charge*.10*open*(1-open)));
  r.bind(target);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(p.p);gl.bindVertexArray(vao);
  const base=M.model(center,angles,radius);
  for(let i=0;i<12;i++){
   const theta=i*PI/6,ring=M.model([0,0,0],[0,0,theta]),blade=M.model([u*1.17,0,-u*.36],[0,-u*.92,u*.12]);
   U(gl,p,{uPV:f.cam.pv,uModel:M.mul(base,M.mul(ring,blade)),uEye:f.cam.eye,uAccent:f.values.uAccent,uHighlight:f.values.uHighlight,uEnergy:.2+g.charge*.4});gl.drawArrays(gl.TRIANGLES,0,positions.length/3);r.drawCalls++;
  }
  r.irisTelemetry={petals:12,open:u,triangles:positions.length/9*12,depthWriting:true};
 };
 return {petals:12,reflectionScope:'analytic sky and field geometry only'};
};

