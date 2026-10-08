
/* Original shaders: deterministic 3D contour curves, not a screen-space decal.
 * Color roles are deliberately separate. White energy is restricted to tiny nodes.
 * Narrow line cores and broad red halos are distinct analytic profiles.
 */
'use strict';
window.HapaContourShaders=(()=>{
 const common=`
precision highp float;precision highp int;
uniform mat4 uPV;uniform vec3 uEye,uForward,uRight,uUp;
uniform vec2 uResolution;uniform float uFov,uPhase,uLoopScale,uHalo,uNodes,uBlueDepth;
uniform vec4 uLevels;uniform int uMode;uniform float uCarryLimit,uCarryGain;
uniform vec3 uLineHot,uLineCold;
${window.HapaGeometryGLSL}
const float TAU=6.283185307179586;
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float hash1(float x){return fract(sin(x*127.1+311.7)*43758.5453123);}
// c: center, r: radii+bow+tilt, k: family+nest+strength+seed.
vec3 curve(vec3 c,vec4 r,vec4 k,float t){
 float a=t*TAU,n=k.y,seed=k.w;
 float opening=1.+.055*uLevels.x+.032*uLevels.y;
 float shape=1.;
 if(k.x>3.5&&k.x<4.5)shape=.84/max(.72,abs(cos(mod(a+.392699,.785398)-.392699)));
 if(k.x>.5&&k.x<1.5){
  shape=1.+.115*cos(a*4.+seed*.12)+.038*cos(a*12.-uPhase*.13+seed*.25);
 }
 float twist=.036*uPhase+.016*n+.025*sin(uPhase*.33+seed);
 vec2 p=vec2(cos(a),sin(a))*r.xy*shape*opening*(.78+.38*uLoopScale);
 p=turn(r.w+twist)*p;
 float z=r.z*sin(a*2.+uPhase*.19+seed*.8)+.040*sin(n*.4+uPhase*.25)-.052*n;
 float yaw=.18*sin(seed*.70)+.035*sin(uPhase*.29+seed);
 z+=p.x*sin(yaw);p.x*=cos(yaw);
 if(k.x>1.5&&k.x<2.5){ // longitudinal, never enters the open central travel lane
  float phi=seed+uPhase*.11;
  p=vec2(cos(phi+t*2.6),sin(phi+t*2.6))*r.x;
  z=t*r.z;
 }
 if(k.x>4.5&&k.x<5.5)return gdForward(c+vec3(t*r.x,t*r.y,t*r.z));
 if(k.x>5.5){vec2 yz=turn(.62*sin(seed)+.10*sin(uPhase*.25+seed))*vec2(p.y,z);p.y=yz.x;z=yz.y;}
 return gdForward(c+vec3(p,z));
}
`;
 const lineVertex=`#version 300 es
${common}
layout(location=0)in vec3 aCenter;layout(location=1)in vec4 aRadii;layout(location=2)in vec4 aKind;
uniform int uSegments;out float vEdge,vSupport,vAlong,vDistance,vStrength,vSeed,vType;
void main(){
 int corner=gl_VertexID%6,seg=gl_VertexID/6;
 float stepV=(corner==1||corner==2||corner==4)?1.:0.;
 float side=(corner==0||corner==1||corner==3)?-1.:1.;
 float t=(float(seg)+stepV)/float(uSegments);
 vec3 pos=curve(aCenter,aRadii,aKind,t);
 vec3 tangent=normalize(curve(aCenter,aRadii,aKind,t+.001)-curve(aCenter,aRadii,aKind,t-.001));
 vec3 right=normalize(cross(tangent,normalize(uEye-pos)));
 float depth=dot(pos-uEye,uForward),support=5.0+8.*uHalo;
 float pixelWorld=2.*max(.08,depth)*tan(uFov*.5)/uResolution.y;
 gl_Position=uPV*vec4(pos+right*side*support*pixelWorld,1.);
 vEdge=side*support;vSupport=support;vAlong=t;vDistance=length(pos-uEye);vStrength=aKind.z*(uMode==4?uCarryGain:1.);if(uMode==4&&pos.z>uCarryLimit)vStrength=0.;vSeed=aKind.w;vType=aKind.x;
}`;
 const lineFragment=`#version 300 es
${common}
in float vEdge,vSupport,vAlong,vDistance,vStrength,vSeed,vType;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){
 float d=abs(vEdge),core=exp(-d*d/0.42),needle=exp(-d*d/.085);
 float shoulder=exp(-d*d/3.0)*.30,halo=exp(-d*d/(8.+34.*uHalo))*.072*uHalo;
 float travel=.5+.5*cos(vAlong*TAU*3.-uPhase*2.0-vSeed*.27);
 float bead=pow(max(0.,travel),30.);
 float filament=.60+.22*sin(vAlong*TAU*49.+vSeed*3.4);
 float energy=(.66+.22*uLevels.y+.18*uLevels.z)*vStrength*exp(-vDistance*.010);
 vec3 red=uLineHot,copper=mix(uLineHot,vec3(3.,.7,.12),.18);
 vec3 hue=mix(red,copper,.15+.25*travel);
 vec3 col=(hue*(core*(.74+.32*filament)+shoulder)+uLineHot*.78*halo)*energy;

 col+=vec3(3.2,.68,.075)*needle*bead*energy*.66;
 if(vType>2.5&&vType<3.5)col=uLineCold*core*energy;
 if((vType>1.5&&vType<2.5)||(vType>4.5&&vType<5.5))col*=smoothstep(0.,.05,vAlong)*(1.-smoothstep(.95,1.,vAlong));
 if(uGeometryOnly==1)col=vec3(1.)*exp(-d*d/.65)*vStrength;
 if(max(col.r,max(col.g,col.b))<.0001)discard;
 color=vec4(col,0.);emission=vec4(col,0.);
}`;
 const nodeVertex=`#version 300 es
${common}
layout(location=0)in vec3 aCenter;layout(location=1)in vec4 aRadii;layout(location=2)in vec4 aKind;
uniform float uPointMax;out float vSize,vPower,vCore,vZ;
void main(){
 float t=fract(aKind.y+uPhase*(aKind.x>1.5?.016:.009));
 vec3 pos=curve(aCenter,aRadii,vec4(aKind.x,0.,1.,aKind.w),t);
 vec4 clip=uPV*vec4(pos,1.);gl_Position=clip;
 float rad=clamp(33./max(4.,clip.w),.75,2.3)*(0.65+.7*uNodes);
 float support=min(uPointMax,2.*(8.+14.*uHalo+rad*2.));
 gl_PointSize=support;vSize=support;vCore=rad;vZ=clip.w;
 vPower=(uMode==4?(pos.z>uCarryLimit?0.:uCarryGain):1.)*aKind.z*(.55+.55*uNodes)*(.72+.45*uLevels.y+.55*uLevels.z);
}`;
 const nodeFragment=`#version 300 es
${common}
in float vSize,vPower,vCore,vZ;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){
 if(vZ<.12)discard;
 vec2 p=(gl_PointCoord-.5)*vSize;float r=length(p);
 float core=exp(-r*r/(vCore*vCore*.65));
 float aureole=exp(-r*r/(vCore*vCore*4.))*0.35;
 float halo=exp(-r*r/(20.+100.*uHalo))*.075*uHalo;
 float spike=(exp(-abs(p.x)*2.4)+exp(-abs(p.y)*2.4))*exp(-r*.40)*.085;
 vec3 col=(vec3(7.6,7.0,6.3)*core+vec3(3.4,.30,.042)*aureole+vec3(3.1,.06,.010)*(halo+spike))*vPower;
 if(max(col.r,max(col.g,col.b))<.00015)discard;
 color=vec4(col,0.);emission=vec4(col,0.);
}`;
 const dustVertex=`#version 300 es
${common}
layout(location=0)in vec4 aPos;layout(location=1)in vec4 aCell;
out float vPower,vWarm,vZ;
void main(){
 vec3 local=aPos.xyz;
 local.xy=turn(uPhase*.045+aCell.w*.17)*local.xy;
 local.yz=turn(.15*sin(uPhase*.15+aCell.w))*local.yz;
 vec3 pos=gdForward(aCell.xyz+local*(.78+.38*uLoopScale)*(1.+.035*uLevels.x));
 vec4 clip=uPV*vec4(pos,1.);gl_Position=clip;vZ=clip.w;
 gl_PointSize=clamp((1.0+.8*aPos.w)*uResolution.y/720.,.8,2.1);
 vPower=(.10+.20*aPos.w)*(.65+.45*uLevels.w)*exp(-max(0.,clip.w)*.010);
 vWarm=step(.94,aPos.w);
}`;
 const dustFragment=`#version 300 es
precision highp float;in float vPower,vWarm,vZ;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){if(vZ<.1)discard;float d=length(gl_PointCoord-.5),a=1.-smoothstep(.12,.5,d);if(a<.01)discard;
 vec3 col=mix(vec3(.02,.09,3.0),vec3(2.0,.18,.028),vWarm)*a*vPower;
 color=vec4(col,0.);emission=vec4(col*.12,0.);
}`;
 const stage=`#version 300 es
${common}
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){
 vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
 vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));
 float quiet=.52+.22*smoothstep(-.8,.3,rd.y);
 vec3 blue=vec3(.00025,.00015,.033+.08*uBlueDepth)*quiet;if(uGeometryOnly==1)blue=vec3(.006);
 color=vec4(blue,1.);emission=vec4(0.,0.,0.,1.);gl_FragDepth=1.;
}`;
 // Analytic line integral through ellipsoidal blue interiors, clipped at opaque depth.
 const interiors=`#version 300 es
${common}
uniform sampler2D uColor,uEmission,uDepth;uniform float uNear,uFar;
uniform int uCellCount;uniform vec3 uCenters[16],uRadii[16];
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution;
 vec3 rd=normalize(uForward+tan(uFov*.5)*((uv.x-.5)*2.*uResolution.x/uResolution.y*uRight+(uv.y-.5)*2.*uUp));
 float dep=texture(uDepth,uv).r,ndc=dep*2.-1.;
 float end=(2.*uNear*uFar/(uFar+uNear-ndc*(uFar-uNear)))/max(.01,dot(rd,uForward));
 vec3 add=vec3(0.);
 for(int i=0;i<16;i++){if(i>=uCellCount)break;
  vec3 rad=uRadii[i]*(.78+.38*uLoopScale),o=(uEye-uCenters[i])/rad,d=rd/rad;
  float a=dot(d,d),b=dot(o,d),c=dot(o,o)-1.,h=b*b-a*c;if(h<=0.)continue;
  float left=max(0.,(-b-sqrt(h))/a),right=min(end,(-b+sqrt(h))/a);if(right<=left)continue;
  vec3 p=o+d*(left+right)*.5;float boundary=max(0.,1.-dot(p,p));
  float weight=(1.-exp(-(right-left)*.30))*boundary*boundary;
  // Blue fills never become emissive white; warm light remains on separate curves.
  add+=vec3(.00020,.00075,.62)*weight*(.24+.82*uBlueDepth)*(.95+.18*uLevels.w);
 }
 color=vec4(texture(uColor,uv).rgb+add,1.);emission=vec4(texture(uEmission,uv).rgb+add*.045,1.);
}`;
 return{lineVertex,lineFragment,nodeVertex,nodeFragment,dustVertex,dustFragment,stage,interiors};
})();

