
/* Octave 0.8: a shared-context regional performer and three real spatial corridors.
 * Each copy is a lower-tessellation authored mesh, not a portrait/video billboard.
 * All geometry writes the existing linear MRT and projected scene depth.
 */
'use strict';
window.HapaOctaveVisuals=function(r){
 const gl=r.gl,M=HapaMath,U=HapaRenderer.uniforms,S=HapaOctaveShaders;
 const silk=HapaRenderer.program(gl,S.silkVertex,S.silkFragment,'Octave / articulated silk'),field=HapaRenderer.program(gl,HapaShaders.vertex,S.corridor,'Octave / spacious corridor');
 r.programs.octaveSilk=silk;r.programs.octaveField=field;

 // Closed annular sectors: front/back plus inner/outer and angular caps.
 const verts=[],normals=[];
 function tri(a,b,c){const n=M.norm(M.cross(M.sub(b,a),M.sub(c,a)));for(const p of [a,b,c]){verts.push(...p);normals.push(...n);}}
 function quad(a,b,c,d){tri(a,b,c);tri(a,c,d);}
 const pt=(a,r,z)=>[Math.cos(a)*r,Math.sin(a)*r,z];
 for(let k=0;k<12;k++){
  const center=k*Math.PI/6,lo=center-.19,hi=center+.19;
  for(let j=0;j<6;j++){const a=lo+(hi-lo)*j/6,b=lo+(hi-lo)*(j+1)/6;
   const r0=3.10,r1=3.75;quad(pt(a,r0,.07),pt(b,r0,.07),pt(b,r1,.07),pt(a,r1,.07));quad(pt(a,r1,-.07),pt(b,r1,-.07),pt(b,r0,-.07),pt(a,r0,-.07));
   quad(pt(a,r0,-.07),pt(b,r0,-.07),pt(b,r0,.07),pt(a,r0,.07));quad(pt(a,r1,.07),pt(b,r1,.07),pt(b,r1,-.07),pt(a,r1,-.07));
  }
  for(const a of [lo,hi])quad(pt(a,3.1,-.07),pt(a,3.75,-.07),pt(a,3.75,.07),pt(a,3.1,.07));
 }
 const crownVAO=gl.createVertexArray();r.vaos.push(crownVAO);gl.bindVertexArray(crownVAO);
 for(const [data,index]of [[verts,0],[normals,1]]){const b=gl.createBuffer();r.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,0,0);}
 function crown(f,art,z,lane){
  const p=r.programs.collar,u=f.values,angle=(lane%2?1:-1)*(art.regions.extras[0]*.18+art.bodyPhase*.09)+art.regions.B[1]*.055;
  gl.useProgram(p.p);U(gl,p,{uPV:f.cam.pv,uModel:M.model([0,0,z],[0,0,angle]),uEye:f.cam.eye,uAccent:u.uAccent,uHighlight:u.uHighlight,uEnergy:art.regions.B[1]});gl.bindVertexArray(crownVAO);gl.drawArrays(gl.TRIANGLES,0,verts.length/3);r.drawCalls++;
 }

 function uniforms(f,art,model,mode,lane,length=36){
  const q=art.regions,u=f.values;
  const coat=HapaWater.config(r.state).streamers&&HapaWater.config(r.state).enabled;const water=coat?HapaWater.evaluate(r.cache,r.state,art.time):null;
  const fireCfg=HapaFire.config(r.state),fire=fireCfg.streamers&&fireCfg.enabled?HapaFire.evaluate(r.cache,r.state,art.time):null;
  const ec=HapaElectricity.config(r.state),eq=ec.enabled&&ec.streamers?HapaElectricity.evaluate(r.cache,r.state,f.values.uTime):null;
  U(gl,silk,{...f.geometry.uniforms,uElCoat:eq&&!eq.lookLocked?(.16+eq.charge*.44+eq.discharge*.22):0,uElCoatPhase:eq?.phase||0,uElCoatColor:eq?.field.color||[0,0,0],uFireCoat:fire&&!fire.lookLocked?1:0,...(fire?{uFireShape:fire.field.shape,uFireMotion:fire.field.motion,uFireOptics:fire.field.optics}:{}),uWaterCoat:coat?1:0,...(water?{uWaterWaves:water.waves,uWaterRings:water.rings,uWaterChop:water.chop,uWaterWind:water.wind,uWaterFlow:water.flow}:{}),uPV:f.cam.pv,uEye:f.cam.eye,uModel:model,uMode:mode,uLane:lane,uLength:length,uTime:art.time,
   uRegionA:q.A,uRegionB:q.B,uRegionPhase:q.phase,uRegionExtra:q.extras,uPhraseShape:q.choreo,uPhrasePacket:q.packet,uPhraseTint:q.packetColor,
   uPulses:u.uPulses,uPulse:u.uPulse,uResonance:u.uResonance,uWeave:u.uWeave,uBody:u.uBody,uAccent:u.uAccent,uHighlight:u.uHighlight,uEmission:u.uEmitColor,uDye:q.dye});
 }
 function draw(f,art,model,mode,lane,length){
  gl.useProgram(silk.p);uniforms(f,art,model,mode,lane,length);gl.bindVertexArray(r.ribbonVAO);gl.drawArrays(gl.TRIANGLES,0,r.ribbonVertices);r.drawCalls++;
 }
 r.drawSilks=(t,f,model=M.identity(),art=null)=>{
  if(!r.state.reliquary?.ribbons)return;art=art||HapaReliquary.evaluate(r.cache,r.state,t,f.e);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  for(let i=0;i<6;i++)draw(f,art,model,0,i,0);
 };
 r.drawOctaveTunnel=(t,f)=>{
  const st=r.state,b=st._bridge,design=HapaOctave.styles.indexOf(b.style),art=HapaReliquary.evaluate(r.cache,st,t,f.e),q=art.regions,u=f.values;
  r.bind(r.scene);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(field.p);U(gl,field,{...u,uLength:b.length,uDesign:design,uPhase:art.lacePhase*.25+art.bodyPhase*.6,uRegionA:q.A,uRegionB:q.B});gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;
  let actors=0,triangles=0;
  if(st.effects.meshes){
   // Clear central corridor; dynamic geometry stays outside the camera's radius.
   if(design===0){for(let i=0;i<6;i++)draw(f,art,M.identity(),1,i,b.length);}
   if(design===1){
    for(let i=0;i<6;i++){const z=2.8+i*(b.length-5)/5;draw(f,art,M.model([0,0,z]),3,i,b.length);}
    for(let i=0;i<2;i++)draw(f,art,M.model([0,0,0],[0,0,i*Math.PI]),2,i,b.length);
   }
   if(design===2){
    for(let i=0;i<9;i++){const z=1.5+i*(b.length-3)/8,turn=Math.sin(q.extras[0]*.13+i*.4)*.13;
     crown(f,art,z,i);draw(f,art,M.model([0,0,z+.05],[0,0,turn],.98),3,i,b.length);
     if(i%2===0)draw(f,art,M.model([0,0,z+.16],[0,0,-turn],1.06),3,i+1,b.length);
    }
   }
  }
  if(st.reliquary.tunnelFigures){
   const centers=design===1?[6,b.length*.42,b.length*.72]:design===0?[b.length*.76]:[b.length*.26,b.length*.88];
   for(let j=0;j<centers.length;j++)for(const side of [-1,1]){
    const z=centers[j];if(z<f.cam.eye[2]-3.3)continue;
    const size=design===2?.64:design===0?.57:.56;
    const model=M.model([side*(design===0?3.0:2.94),-.24,z],[0,Math.PI-side*.46,0],size);
    triangles+=r.drawOracleCopy(t,f,model,design===2);actors++;
    if(design!==2&&st.reliquary.ribbons)r.drawSilks(t,f,model,art);
   }
  }
  if(b.wallMedia)r.routeMedia?.(f,t);
  // No artificial beacon over the corridor. Destination source handoff remains external.
  f.e.values['optics.flare']=0;f.e.values['optics.bloom']*=.64;
  r.octaveStats={time:t,style:b.style,actorCopies:actors,actorTriangles:triangles,meshSpace:'shared world geometry',entry:b.entry??.27,arrival:b.arrival,regions:q.trace};
  f.octave=r.octaveStats;return f;
 };
 return{styles:HapaOctave.styles,description:'Silk ribbons, actual oracle copies and concentric resonant collars'};
};

