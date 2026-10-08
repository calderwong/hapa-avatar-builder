
/* Original shaders: bounded cloth coordinates, travelling pigment, analytic corridor.
 * No texture samples from the reference clip, no extra tone mapping.
 */
'use strict';
HapaReliquaryShaders.vertex=HapaReliquaryShaders.vertex.replace('// OCTAVE_REGION_FUNCTIONS',HapaOctave.glsl);
HapaReliquaryShaders.fragment=HapaReliquaryShaders.fragment.replace('// OCTAVE_COLOR_UNIFORMS',`uniform vec4 uRegionA,uRegionB,uRegionPhase,uRegionExtra;uniform float uDye;`)
 .replace('// OCTAVE_DYE_PATTERN',`
 if(kind<1.5){
  float left=1.-smoothstep(-.25,.25,vLocal.x),ph=mix(uRegionPhase.z,uRegionPhase.y,left);
  vec2 flowUV=vec2(vLocal.x*.65,vLocal.y*.65);
  float river=.5+.5*sin(flowUV.y*7.-ph*.70+fbm(flowUV*2.+vec2(uRegionExtra.y*.14,0.))*3.6);
  float seam=pow(river,3.);vec3 dye=mix(uClothTone*.70,uSkyTone*.42,river);
  float wire=smoothstep(.23,.72,texture(uDetail,vUV).r*uEmbroidery);
  base=mix(base,dye,uDye*(1.-wire)*.64);
  em+=uSkyTone*seam*uDye*(.032+.06*uRegionB.z)*(1.-wire);
  rough=clamp(rough-uDye*river*.08,.2,.96);
 }
`);
window.HapaOctaveShaders={
 silkVertex:`#version 300 es
precision highp float;precision highp int;layout(location=0)in vec2 aUV;
uniform mat4 uPV,uModel;uniform vec4 uRegionA,uRegionB,uRegionPhase,uRegionExtra;
uniform float uLength,uLane,uTime;uniform int uMode;uniform vec4 uPhraseShape,uPhrasePacket;
out vec3 vPos,vNormal;out vec2 vUV;out float vActivity;
const float TAU=6.2831853;
vec3 silkPosition(vec2 uv){
 float u=uv.x,v=uv.y-.5,s=mod(uLane,2.)<.5?-1.:1.,phase=s<0.?uRegionPhase.y:uRegionPhase.z;
 float excite=s<0.?uRegionA.y:uRegionA.z;
 float breath=uRegionA.w,open=uRegionA.x,drift=uRegionB.z;
 vec3 p;
 if(uMode==0){
  float root=smoothstep(0.,.20,u),width=(.14+.23*sin(u*3.14159265))*(1.-smoothstep(.83,1.,u)*.90);
  float bend=(.10+.40*excite+.20*breath)*sin(phase-u*8.+uLane)*root;
  p=vec3(s*(1.20+.14*floor(uLane*.5)+.72*sin(u*3.14159265)+.60*u)+s*bend,
         .66-.21*floor(uLane*.5)-u*3.18+root*breath*.16*sin(uRegionPhase.w-u*5.),
         -.20+.11*floor(uLane*.5)+u*.86+(excite*.25+breath*.15)*root*cos(phase-u*7.));
  float delayed=sin(phase*.55-u*4.1-u*u*2.7+uLane*.7);p.x+=s*root*(-uPhraseShape.x*.24+uPhraseShape.y*(.36+.18*delayed));p.y+=root*uPhraseShape.x*.24;p.z+=root*(uPhraseShape.y*.38*delayed-uPhraseShape.z*.08*sin(phase*.33-u*2.));
  float roll=.4*sin(phase*.7-u*5.)+.3*open+root*uPhraseShape.y*.32*delayed;
  p+=vec3(v*width*2.*cos(roll),v*width*.35, v*width*2.*sin(roll));
 }else if(uMode==1||uMode==2){
  float taper=smoothstep(0.,.055,u)*(1.-smoothstep(.94,1.,u));
  float ph=mix(uRegionPhase.y,uRegionPhase.z,mod(uLane,2.));
  float angle=uLane*TAU/6.+.26*sin(u*TAU-ph*.22)+v*(uMode==1?.65:.32)*taper;
  float radius=3.20+.20*sin(u*13.-uRegionPhase.w*.55)+(.1+.20*excite)*sin(u*23.-ph)*taper;
  p=vec3(cos(angle)*radius,sin(angle)*radius,-.45+u*(uLength+1.1));
  p.xy+=normalize(p.xy)*sin(v*6.3+u*11.-ph)*.07*taper;
 }else{
  float a=u*TAU,b=uv.y*TAU;
  float rotate=uRegionExtra.x*.12*(mod(uLane,2.)<.5?1.:-1.);
  a+=rotate;
  float radius=3.15+.07*sin(a*6.+uLane*.7)+.12*uRegionB.y*sin(a*8.);
  float tube=.065+.035*smoothstep(.2,.8,.5+.5*cos(a*12.));
  p=vec3(cos(a)*(radius+cos(b)*tube),sin(a)*(radius+cos(b)*tube),sin(b)*tube);
 }
 return p;
}
void main(){vec3 p=silkPosition(aUV);vec3 du=silkPosition(aUV+vec2(.0003,0.))-p,dv=silkPosition(aUV+vec2(0.,.0003))-p;
 vNormal=normalize(mat3(uModel)*cross(du,dv));
 vec4 w=uModel*vec4(p,1.);vPos=w.xyz;vUV=aUV;vActivity=clamp((mod(uLane,2.)<.5?uRegionA.y:uRegionA.z)+uRegionA.w*.5+uRegionB.z*.25,0.,1.);gl_Position=uPV*w;
}`,
 silkFragment:`#version 300 es
precision highp float;precision highp int;in vec3 vPos,vNormal;in vec2 vUV;in float vActivity;
uniform vec3 uEye,uBody,uAccent,uHighlight,uEmission;uniform vec4 uRegionPhase,uRegionExtra,uRegionA,uRegionB;
uniform float uLane,uDye;uniform int uMode;uniform vec4 uPhrasePacket;uniform vec3 uPhraseTint;
uniform vec2 uPulses[6];uniform float uPulse,uResonance,uWeave;
float hpTunnelPulse(vec3 p){float sum=0.;for(int i=0;i<6;i++){float d=p.z-uPulses[i].x;sum+=exp(-d*d*2.8)*max(0.,uPulses[i].y);}return min(sum,1.35)*max(0.,uPulse)*uResonance;}

layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 vec3 v=normalize(uEye-vPos),l=normalize(vec3(-.45,.85,.7));
 float ph=mix(uRegionPhase.y,uRegionPhase.z,mod(uLane,2.));
 float band=.5+.5*sin(vUV.x*26.-ph*.85+sin(vUV.y*8.+uRegionExtra.y)*2.1);
 float core=pow(band,3.),rim=smoothstep(.40,.493,abs(vUV.y-.5));
 float thread=1.-smoothstep(.08,.08+max(.04,fwidth(vUV.x*180.)),abs(fract(vUV.x*180.)-.5));
 vec3 pigment=mix(uBody*.55,uAccent*.48,(.12+.85*core)*uDye);
 float spec=pow(max(dot(n,normalize(l+v)),0.),38.)*.45;
 float sheen=pow(1.-abs(dot(n,v)),3.)*.26;
 vec3 e=uEmission*core*(.012+.095*vActivity)*uDye+uHighlight*rim*.065;
 vec3 c=pigment*(.28+.70*abs(dot(n,l)))+uHighlight*(spec+rim*.22)+uAccent*sheen+thread*uHighlight*.003;
 if(uMode==3){c=uHighlight*(.16+.48*abs(dot(n,l)))+uAccent*.08;e=uAccent*(.04+.13*abs(uRegionB.y))+.10*uEmission*pow(band,5.);}
 if(uMode>0){float beat=hpTunnelPulse(vPos);e+=uAccent*beat*.30+uHighlight*beat*rim*.22;}
 float path=uMode==0?vUV.x:vPos.z*.018;float dx=path-uPhrasePacket.x;float pulse=exp(-dx*dx*150.);e+=uPhraseTint*pulse*uPhrasePacket.y*.42;
 float fog=exp(-max(0.,length(vPos-uEye)-3.)*.037);
 color=vec4((c+e)*fog,1.);emission=vec4(e*fog,1.);
}`,
 corridor:`#version 300 es
precision highp float;precision highp int;uniform vec2 uResolution;uniform vec3 uEye,uForward,uRight,uUp,uBody,uAccent,uHighlight,uFog;
uniform mat4 uPV;uniform float uFov,uLength,uPhase;uniform int uDesign;uniform vec4 uRegionA,uRegionB;
uniform vec2 uPulses[6];uniform float uPulse,uResonance,uWeave;
float hpTunnelPulse(vec3 p){float sum=0.;for(int i=0;i<6;i++){float d=p.z-uPulses[i].x;sum+=exp(-d*d*2.8)*max(0.,uPulses[i].y);}return min(sum,1.35)*max(0.,uPulse)*uResonance;}

layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){
 vec2 uv=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;
 vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));
 float A=dot(rd.xy,rd.xy),B=2.*dot(uEye.xy,rd.xy),C=dot(uEye.xy,uEye.xy)-22.09;
 float det=B*B-4.*A*C;float dist=det>=0.&&A>.00001?(-B+sqrt(max(det,0.)))/(2.*A):1e4;
 // A flat basalt floor makes the scale and the statues legible.
 float floorHit=rd.y<-.0001?(-2.65-uEye.y)/rd.y:1e4;bool floorOn=floorHit>0.&&floorHit<dist;
 if(floorOn)dist=floorHit;
 vec3 p=uEye+rd*dist;float a=atan(p.y,p.x);
 vec3 c=mix(uFog*.8,vec3(.012,.018,.029),.5),e=vec3(0.);
 if(dist>0.&&dist<110.&&p.z< uLength+8.){
  float rib=pow(.5+.5*cos(p.z*(uDesign==1?.70:1.12)),24.);
  float seam=pow(.5+.5*cos(a*(uDesign==1?8.:12.)),54.)*uWeave;
  float flow=pow(.5+.5*sin(p.z*.8-uPhase*1.3+a*3.),9.);
  c=mix(uBody*.14,vec3(.013,.019,.025),.66)+uHighlight*rib*.028;
  e=uAccent*(seam*.045+flow*.025)+uHighlight*rib*.014;
  if(floorOn){float lanes=exp(-pow(abs(p.x)-1.05,2.)*330.);c=uBody*.08+vec3(.006,.008,.012);e=uAccent*lanes*(.08+.05*flow);}
  float beat=hpTunnelPulse(p);
  float crawl=pow(max(0.,.5+.5*sin(p.z*1.5-uPhase*2.1+a*4.)),15.);
  e+=uAccent*beat*(.19+.22*seam)+uHighlight*beat*.055;
  e+=uAccent*crawl*(seam*.19+(floorOn?.024:0.))*uWeave;
  float fog=exp(-dist*.037);c=mix(uFog*.20,c,fog);e*=fog;
  vec4 clip=uPV*vec4(p,1.);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
 }else{gl_FragDepth=1.;c=uFog*.11;}
 color=vec4(c+e,1.);emission=vec4(e,1.);
}`};

