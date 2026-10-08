
/* 105 renderer integration. Inspection is a native flat-shaded, fixed-pose draw
 * of the SAME geometry; not an image-processing approximation. No private clock.
 */
'use strict';
window.HapaGeometryDanceVisuals=function(r){
 const gl=r.gl,copy=`#version 300 es
 precision highp float;uniform sampler2D uImage;uniform vec2 uResolution;out vec4 color;
 void main(){color=vec4(texture(uImage,gl_FragCoord.xy/uResolution).rgb,1.);}`;
 r.programs.geometryCopy=HapaRenderer.program(gl,HapaShaders.vertex,copy,'Geometry-only proof / no optics');
 const originalDraw=r.drawScene.bind(r),originalRoute=r.routeRender.bind(r);
 r.drawScene=(t)=>{
  const f=originalDraw(t),s=r.state,c=HapaGeometryDance.config(s);
  const isFractal=f.cam.kind===0&&(!s._tunnel||['fractal-loom','thread','threshold','braid','iris-bloom','media-weave'].includes(s._bridge?.style));
  if(isFractal&&c.enabled&&c.carry>0)r.drawContourCarry?.(t,f);
  if(s._geometryProof){f.sourceFront=false;f.e.values['optics.bloom']=0;f.e.values['optics.flare']=0;f.e.values['finish.amount']=0;}
  return f;
 };
 r.geometryInspect=(on,requested)=>{
  if(!on){delete r.state._geometryProof;return;}
  const current=r.state._geometryProof?.style||r.routeTelemetry?.bridge?.style||HapaGeometryDance.style(r.state);
  const family=requested||(['fractal-loom','contour-fold','echo-drift','prism-spindle'].includes(current)?current:'fractal-loom');
  if(!HapaGeometryDance.tunnelStyles.includes(family))throw Error('No fixed-camera geometry probe for '+family);
  r.state._geometryProof={style:family,length:42,pose:{eye:[0,0,7.4],forward:[0,0,1],fov:57}};
 };
 r.routeRender=t=>{
  if(!r.state._geometryProof)return originalRoute(t);
  const saved=r.state,pr=saved._geometryProof;
  const b={id:'geometry-proof',style:pr.style,length:pr.length,start:0,duration:r.score.duration,arrival:r.score.duration,entry:.18};
  const s={...saved,world:'breathline-weave',showMedia:false,effects:{...saved.effects,meshes:false,dust:false,bloom:false,flare:false,finish:false},_tunnel:true,_bridge:b,_noPortal:true,_pose:pr.pose};
  r.state=s;try{r.routeTelemetry={active:false,stage:'fixed camera / geometry only',proof:true,style:pr.style};const f=r.drawScene(t);f.routeWorld='Geometry proof / '+pr.style;return f;}finally{r.state=saved;}
 };
 const frame=r.frameValues.bind(r);
 r.frameValues=t=>{const f=frame(t);if(r.state._geometryProof){Object.assign(f.values,{uPhase:0,uTime:0,uBreath:0,uVocal:0,uPulse:0,uMotion:0,uLoomOn:0,uLoomMix:0,uSource:[1000,1000,1000],uPulses:new Float32Array(12),uPhraseCue:[0,0,0,0],uPhrasePacket:[0,0,0,0]});}return f;};
 return true;
};
// Existing silk meshes gain the same spatial wave, instead of unrelated glow-only movement.
{
 const S=HapaOctaveShaders;
 S.silkVertex=S.silkVertex.replace('const float TAU=',window.HapaGeometryGLSL+'\nconst float TAU=');
 S.silkVertex=S.silkVertex.replace('vec4 w=uModel*vec4(p,1.);vPos=w.xyz;',`vec4 w=uModel*vec4(p,1.);vec3 a=(uModel*vec4(p+du,1.)).xyz,b=(uModel*vec4(p+dv,1.)).xyz;w.xyz=gdForward(w.xyz);a=gdForward(a);b=gdForward(b);vNormal=normalize(cross(a-w.xyz,b-w.xyz));vPos=w.xyz;`);
 // The former analytic cylinder could not change shape. Replace its distance query
 // with the inverse spatial map, keeping the same walls, floor and source clock.
 S.corridor=`#version 300 es
 precision highp float;precision highp int;uniform vec2 uResolution;uniform vec3 uEye,uForward,uRight,uUp,uBody,uAccent,uHighlight,uFog;
 uniform mat4 uPV;uniform float uFov,uLength,uPhase;uniform int uDesign;
 ${window.HapaGeometryGLSL}
 layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
 float body(vec3 p){vec3 q=gdInverse(p);return min(abs(length(q.xy)-4.70)-.055,q.y+2.65)*gdStepScale();}
 void main(){vec2 uv=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));float dist=.03;bool hit=false;vec3 p=uEye;
 for(int i=0;i<104;i++){p=uEye+rd*dist;float d=body(p);if(d<max(.002,dist*.001)){hit=true;break;}dist+=max(.002,d*.72);if(dist>80.)break;}
 vec3 c=uFog*.06,e=vec3(0.);if(hit){vec3 q=gdInverse(p);float a=atan(q.y,q.x),rib=pow(.5+.5*cos(q.z*.95),36.),line=pow(.5+.5*cos(a*12.),72.);c=uBody*.026+uHighlight*rib*.006;e=uAccent*(line*.035+rib*.016);vec4 clip=uPV*vec4(p,1.);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
 if(uGeometryOnly==1){vec2 h=vec2(.004,0);vec3 n=normalize(vec3(body(p+h.xyy)-body(p-h.xyy),body(p+h.yxy)-body(p-h.yxy),body(p+h.yyx)-body(p-h.yyx)));c=vec3(.15+.7*abs(dot(n,normalize(vec3(.5,.7,.3)))));e=vec3(0.);}
 }else gl_FragDepth=1.;color=vec4(c+e,1.);emission=vec4(e,1.);}`;
}

