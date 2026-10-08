
/* Flow 0.7 additions: a finite resonator stage + bounded, true triangle braid.
 * Curated visual design, not physical acoustics. No network/clock/audio ownership. */
'use strict';
HapaCore.worlds.push({id:'resonance-vault',name:'Resonance Vault',subtitle:'Basalt resonators / onset-lit floor / suspended crown',kind:4,modules:['field.resonance-vault','media.surface','material.weave','optics.beacon'],camera:'open-front stage'});
HapaCore.palettes.push({id:'cinder-jade',name:'Cinder & jade',description:'Charcoal stone, oxidized jade and amber seams',roles:{background:'#080f12',shadow:'#13242b',body:'#385961',accent:'#67c5b6',highlight:'#ffe1ac',emission:'#e5a75d',fog:'#13232b'}});
HapaCore.modules.push({id:'field.resonance-vault',version:'0.7.0',kind:'world',outputs:['linearColor','linearEmission','projectedDepth']},{id:'mesh.braided-passage',version:'0.7.0',kind:'geometry',description:'Two depth-writing helical tubes surrounding the existing safe corridor. Camera is not rolled.'});
window.HapaFlowVisuals=function(r){
 const gl=r.gl,U=HapaRenderer.uniforms,M=HapaMath;
 // Original, stateless edge-aware display filter. Not temporal AA or super-resolution.
 const edge=`#version 300 es
 precision highp float;uniform sampler2D image;uniform vec2 size;out vec4 outColor;
 float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
 void main(){vec2 uv=gl_FragCoord.xy/size,p=1./size;vec3 c=texture(image,uv).rgb;
  float n=luma(texture(image,uv+vec2(0,p.y)).rgb),s=luma(texture(image,uv-vec2(0,p.y)).rgb);
  float e=luma(texture(image,uv+vec2(p.x,0)).rgb),w=luma(texture(image,uv-vec2(p.x,0)).rgb);
  float span=max(max(n,s),max(e,w))-min(min(n,s),min(e,w));
  vec2 tangent=normalize(vec2(-(n-s),e-w)+vec2(.00001));
  vec3 a=texture(image,uv+tangent*p*.65).rgb,b=texture(image,uv-tangent*p*.65).rgb;
  outColor=vec4(mix(c,(a+b)*.5,smoothstep(.06,.28,span)*.62),1.);
 }`;
 r.programs.edgePolish=HapaRenderer.program(gl,HapaShaders.vertex,edge,'stateless edge polish');
 r.flowDecor=(f,t)=>{
  const st=r.state,kind=f.cam.kind;if(!st.effects.meshes)return;
  const p=r.programs.mesh,u=f.values;
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(p.p);gl.bindVertexArray(r.ribbonVAO);r.texture(r.pattern.textures[0],0);
  if(st._tunnel&&st._bridge?.style==='braid'&&st.flow?.braid!==false){
   U(gl,p,{...u,uBlocker:0,uUseMedia:0,uShape:4,uExitZ:st._bridge.length});
   for(let i=0;i<2;i++){U(gl,p,{uModel:M.model([0,0,0],[0,0,i*Math.PI]),uEmission:u.uEmission*.60});gl.drawArrays(gl.TRIANGLES,0,r.ribbonVertices);r.drawCalls++;}
  }
  if(kind===4){
   // Shared-depth solid crown behind the media aperture. Quieter than a full screen flash.
   U(gl,p,{...u,uBlocker:0,uUseMedia:0,uShape:3,uEmission:.12});
   for(let i=0;i<3;i++){U(gl,p,{uModel:M.model([0,.5,-1.65-i*.38],[0,0,0],1.22+i*.12)});gl.drawArrays(gl.TRIANGLES,0,r.ribbonVertices);r.drawCalls++;}
  }
 };
 return{world:'resonance-vault',style:'braid'};
};

