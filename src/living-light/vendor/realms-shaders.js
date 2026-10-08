
/* DERIVATIVE SHADERS — Creative Commons Attribution–NonCommercial–ShareAlike 3.0.
 * UltimateKaliCircuits: mojovideotech, based on Kali, shadertoy.com/view/XlX3Rj.
 * SpaceIsThePlace: mojovideotech, based on Kali, shadertoy.com/view/XlfGRj.
 * CloudVortex: mojovideotech, based on Protean Clouds by nimitz, shadertoy.com/view/3l23Rh.
 * Adapted 2026-09-29 for Hapa: host camera, stem phases, guarded arithmetic, actual
 * surface/depth integration, original architecture, host linear color and quality caps.
 * Named, pinned mirror sources and complete credits: SHADER_CREDITS.md.
 * These are adaptations, NOT pixel-identical ports or verified editor-ID revisions.
 */
'use strict';
window.HapaRealmShaders=(()=>{
 const shared=`
precision highp float;precision highp int;
uniform vec2 uResolution;uniform mat4 uPV;
uniform vec3 uEye,uForward,uRight,uUp,uBody,uAccent,uHighlight,uShadow,uFog,uEmitColor;
uniform vec4 uRealmPhase,uRealmLevels;
uniform vec3 uStudyMix;
uniform float uFov,uRealmDetail,uRealmAtmosphere,uRealmExpression,uRealmRadiance,uRealmLength,uStudyBlend;
uniform int uRealm,uRealmSteps;uniform vec4 uPhraseCue,uPhrasePacket;uniform vec3 uPhraseTint;uniform float uRealmAction;
uniform vec2 uPulses[6];uniform float uPulse;
${window.HapaGeometryGLSL}
const float PI=3.14159265359;
mat2 rr(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 ray(){vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;return normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));}
float bx(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float ring(vec3 p,float rad,float thick){return length(vec2(length(p.xy)-rad,p.z))-thick;}
vec2 pick(vec2 a,vec2 b){return a.x<b.x?a:b;}
float sat(float x){return clamp(x,0.,1.);}
bool realmTunnel(){return uRealm==10||uRealm==11||uRealm>=15;}
float realmPulse(vec3 p){float v=0.,d=realmTunnel()?p.z:length(p.xz);for(int i=0;i<6;i++){float x=d-uPulses[i].x;v+=exp(-x*x*3.2)*max(0.,uPulses[i].y);}return min(v,1.4)*uPulse;}
`;
 const circuits=`
vec3 kaliTraps(vec2 z){
 float ot=10000.,ot2=10000.,iteration=1.;
 for(int i=0;i<9;i++){
  z=abs(z)/clamp(dot(z,z),.1,.5)-1.7;
  float len=length(z);
  float o=min(max(abs(min(z.x,z.y)),-len+.25),abs(len-.25));
  if(o<ot){ot=o;iteration=float(i)+1.;}
  ot2=min(ot2,len*.1);
 }
 return vec3(max(0.,ot),max(0.,ot2),iteration);
}
vec3 circuitInk(vec2 uv,float footprint){
 vec3 trap=kaliTraps(uv*.018+vec2(.015,.493));
 float w=.0024*trap.z*(.65+.70*uRealmDetail);
 float aa=clamp(footprint*.035,.0003,.018);
 float line=1.-smoothstep(max(0.,w-aa),w+aa,trap.x);
 float node=1.-smoothstep(w*.65,w*1.4+aa,trap.y);
 float trace=.35+.65*(.5+.5*sin(trap.z*.7-uRealmPhase.x*2.+trap.y*36.));
 float farFade=1.-smoothstep(.04,.22,footprint);
 vec3 dye=mix(uAccent,uHighlight,.35+.55*node);
 return dye*(line*(.12+.55*trace)+node*(.3+.45*uRealmLevels.x))*farFade*uRealmDetail;
}
`;
 const studies=`
vec3 prismInk(vec2 uv,float footprint){
 vec2 q=uv;
 q*=1.+.040*sin(q.y*.22+uRealmPhase.z*.95);
 q+=vec2(sin(q.y*.20+uRealmPhase.x*.62),cos(q.x*.17-uRealmPhase.y*.48))*.12;
 float r=length(q),a=atan(q.y,q.x),aa=max(.008,footprint*.72);
 float spoke=abs(sin(a*6.+uRealmPhase.x*1.55+r*.24));
 float band=abs(fract(r*.52-uRealmPhase.y*.12+.03*sin(a*6.+uRealmPhase.x*.8))-.5);
 float petalShape=abs(r-(1.40+.28*sin(a*6.+uRealmPhase.x*.42)));
 float beadTrack=abs(fract(r*.36-a*1.08-uRealmPhase.z*.16)-.5);
 float core=1.-smoothstep(.016,.016+aa*.72,spoke);
 float ring=1.-smoothstep(.017,.017+aa*.70,band);
 float petal=1.-smoothstep(.042,.042+aa*1.24,petalShape);
 float halo=1.-smoothstep(.11,.11+aa*2.9,petalShape);
 float bead=1.-smoothstep(.050,.050+aa*1.9,beadTrack);
 vec3 spec=mix(vec3(.10,.88,1.34),vec3(1.24,.10,.84),.46+.40*sin(a*3.1+r*.46+uRealmPhase.y*.55));
 spec=mix(spec,vec3(1.48,1.18,1.36),.10+.18*bead);
 return spec*(core*.46+ring*.34+petal*.94+halo*.24+bead*.30)*(1.-smoothstep(.10,.30,footprint))*uRealmDetail;
}
vec3 latticeInk(vec2 uv,float footprint){
 vec2 q=uv+vec2(uRealmPhase.x*1.18,-uRealmPhase.z*.95);
 q+=vec2(sin(uv.y*.55+uRealmPhase.y*1.65),sin(uv.x*.42-uRealmPhase.x*1.35))*.20;
 vec2 g=abs(fract(q*vec2(.55,.74))-.5);float aa=max(.008,footprint*.72);
 float x=1.-smoothstep(.017,.017+aa,g.x);
 float y=1.-smoothstep(.017,.017+aa,g.y);
 float diag=1.-smoothstep(.026,.026+aa,abs(fract((q.x+q.y)*.40+.11*sin(q.y*.2+uRealmPhase.y))-.5));
 float diag2=1.-smoothstep(.026,.026+aa,abs(fract((q.x-q.y)*.44+.08*sin(q.x*.18-uRealmPhase.x))-.5));
 float sweep=.5+.5*sin((q.x-q.y)*1.45-uRealmPhase.z*3.4);
 float node=x*y;
 float halo=max(max(x,y),max(diag,diag2));
 vec3 spec=mix(vec3(.50,.11,1.16),vec3(.03,1.16,.76),.30+.46*sweep);
 spec=mix(spec,vec3(1.24,1.10,1.34),.12+.22*node);
 return spec*(halo*(.36+.54*sweep)+pow(halo,3.)*.18+node*.42)*(1.-smoothstep(.10,.30,footprint))*uRealmDetail;
}
vec3 contourInk(vec2 uv,float footprint){
 vec2 q=uv*vec2(.84,.96);
 q.x+=sin(uv.y*.32+uRealmPhase.x*1.68)*1.08;
 q.y+=sin(uv.x*.16-uRealmPhase.y*1.08)*.24;
 float aa=max(.008,footprint*.58);
 float archCenter=q.x*.32+sin(q.y*.19+uRealmPhase.x*.82)*.96;
 float arch=abs(length(vec2(archCenter,q.y*.084))-(1.62+.26*sin(q.y*.16+uRealmPhase.y*.54)));
 float archLine=1.-smoothstep(.024,.024+aa*1.12,arch);
 float archHalo=1.-smoothstep(.12,.12+aa*3.6,arch);
 float arch2=abs(length(vec2(archCenter*.82,q.y*.072))-(1.16+.18*sin(q.y*.14+uRealmPhase.z*.42)));
 float archLine2=1.-smoothstep(.020,.020+aa,arch2);
 vec2 beadCell=vec2(q.x*.18+.30*sin(q.y*.20+uRealmPhase.x*1.16),fract(q.y*.12+.10*sin(q.x*.08)-uRealmPhase.z*.18)-.5);
 float bead=1.-smoothstep(.11,.11+aa*2.6,length(beadCell));
 vec2 nodeCell=vec2(q.x*.11+.44*sin(q.y*.12+uRealmPhase.y*.88),fract(q.y*.078-uRealmPhase.x*.10)-.5);
 float node=1.-smoothstep(.16,.16+aa*3.0,length(nodeCell));
 float spine=1.-smoothstep(.016,.016+aa,abs(q.x*.16+.16*sin(q.y*.28+uRealmPhase.x*1.52)));
 float foldWave=sin(q.x*.64+sin(q.y*.30+uRealmPhase.x*1.36)*2.6+uRealmPhase.y*.74);
 float contour=1.-smoothstep(.046,.046+aa*1.18,abs(foldWave));
 float filament=1.-smoothstep(.017,.017+aa,abs(fract((foldWave+q.y*.08)*3.0)-.5));
 float spark=1.-smoothstep(.08,.08+aa*2.0,abs(fract((q.y*.11-q.x*.09)-uRealmPhase.z*.12)-.5));
 vec3 warm=mix(vec3(1.10,.14,.04),vec3(1.44,.76,.40),.30+.48*bead);
 vec3 hot=vec3(1.30,.84,.56);
 vec3 cool=vec3(.08,.20,1.14);
 vec3 spec=mix(cool,warm,.42+.28*archLine+.24*archLine2+.22*node);
 spec=mix(spec,hot,.18+.22*bead+.26*node+.10*spine);
 return spec*(archLine*.82+archLine2*.60+archHalo*.16+bead*.90+node*.98+spine*.24+contour*.20+filament*.28+spark*.14)*(1.-smoothstep(.10,.34,footprint))*uRealmDetail;
}
vec3 studySurface(vec2 coord,float footprint,vec3 bias){
 vec3 weights=max(vec3(.0001),uStudyMix*max(vec3(.0001),bias));
 weights.z*=uRealm>=12?1.26:1.12;
 weights/=max(weights.x+weights.y+weights.z,.0001);
 return prismInk(coord,footprint)*weights.x + latticeInk(coord,footprint)*weights.y + contourInk(coord,footprint)*weights.z;
}
`;
 const field=`#version 300 es
${shared}
${circuits}
${studies}
layout(location=0)out vec4 outColor;layout(location=1)out vec4 outEmission;
vec2 map(vec3 p){if(realmTunnel())p=gdInverse(p);
 float breath=uRealmLevels.y*uRealmExpression;
 float turn=uRealmPhase.w*.18;float gather=uPhraseCue.x*uRealmAction,opening=uPhraseCue.y*uRealmAction;
 vec2 h=vec2(1000.,0.);
 if(realmTunnel()){
  float wall=abs(length(p.xy)-4.30)-.15;
  h=uRealm==11?vec2(1000.,1.):vec2(wall,1.);
  vec3 q=p;q.z=mod(q.z+3.,6.)-3.;
  h=pick(h,vec2(ring(q,3.95,.09),2.));
  h=pick(h,vec2(abs(p.y+2.83)-.09,1.));
  if(uRealm==10){
   float a=atan(p.y,p.x),sector=PI/4.;a=mod(a+sector*.5,sector)-sector*.5;
   q=vec3(cos(a),sin(a),0.)*length(p.xy);q.z=mod(p.z+1.5,3.)-1.5;q.x-=4.03;
   h=pick(h,vec2(bx(q,vec3(.17,.30,.43))-.045,3.));
  }else if(uRealm==11){
   q=p;q.z=mod(q.z+4.,8.)-4.;q.xy=rr(.22*sin(p.z*.2))*q.xy;
   h=pick(h,vec2(ring(q,3.5,.032),2.));
  }else if(uRealm==15){
   float a=atan(p.y,p.x),sector=PI/6.;a=mod(a+sector*.5,sector)-sector*.5;
   q=vec3(cos(a),sin(a),0.)*length(p.xy);q.z=mod(p.z+1.7,3.4)-1.7;q.x-=4.04;
   h=pick(h,vec2(bx(q,vec3(.15,.34,.40))-.05,3.));
   vec3 s=p;s.z=mod(s.z+2.0,4.0)-2.0;h=pick(h,vec2(ring(s,2.45,.028),4.));
  }else if(uRealm==16){
   q=p;q.z=mod(q.z+2.2,4.4)-2.2;q.xy=rr(.12*sin(p.z*.35))*q.xy;
   vec3 m=q;m.x=abs(m.x)-3.35;h=pick(h,vec2(bx(m,vec3(.07,3.0,.18))-.02,3.));
   vec3 n=q;n.y=abs(n.y)-2.18;h=pick(h,vec2(bx(n,vec3(3.1,.06,.20))-.02,3.));
   }else if(uRealm==17){
   q=p;q.z=mod(q.z+2.8,5.6)-2.8;float a=atan(q.y,q.x);float rad=length(q.xy)-(3.64+.36*sin(a*4.+q.z*.65+uRealmPhase.x));
   h=pick(h,vec2(abs(rad)-.048,2.));
   vec3 hub=q;hub.z=mod(hub.z+0.72,1.44)-0.72;float gem=(dot(abs(hub*vec3(1.0,1.20,0.78)),vec3(1.0))-.88)*.52;h=pick(h,vec2(gem,4.));
   vec3 orb=q;orb.z=mod(orb.z+0.72,1.44)-0.72;h=pick(h,vec2(ring(orb,1.06,.030),4.));
   vec3 w=q;w.x=abs(w.x)-2.50;w.y+=.18*sin(q.z*1.4+uRealmPhase.y);h=pick(h,vec2(bx(w,vec3(.16,2.36,.16))-.03,3.));
  }
  return h;
 }
 float platform=max(length(p.xz)-6.2,abs(p.y+2.35)-.13);
 h=vec2(platform,1.);
 for(int i=0;i<3;i++){float j=float(i);h=pick(h,vec2(max(length(p.xz)-(3.9-j*.82),abs(p.y+2.09-j*.15)-.095),1.));}
 vec3 c=p-vec3(0.,.65,0.);
 if(uRealm==7){
  for(int i=0;i<3;i++){float j=float(i);vec3 q=p-vec3(0.,.55,-1.45-j*.55);q.xy=rr(.04*sin(turn+j))*q.xy;h=pick(h,vec2(ring(q,2.72+j*.42,.085),2.));}
  vec3 col=p;col.x=abs(col.x)-4.55;col.y-=.9;col.z+=1.1;h=pick(h,vec2(bx(col,vec3(.57,3.4,.75))-.13,3.));
  for(int i=0;i<3;i++){float j=float(i);vec3 q=c;q.xz=rr(turn*(j==1.?-.55:.55)+j*.85)*q.xz;q.yz=rr((.55+j*.28)*(1.-gather*.48)+opening*(j-1.)*.34)*q.yz;q.z-=opening*(j-1.)*.23;h=pick(h,vec2(ring(q,1.45+j*.32+breath*.06+opening*.38-gather*.12,.050),2.));}
  if(uRealmAction>.001){for(int i=0;i<8;i++){float j=float(i),a=j*PI*.25;vec3 v=c;v.xy=rr(a)*v.xy;v.x-=1.12+opening*.78-gather*.16;v.xz=rr(-.5+opening*.95+breath*.12)*v.xz;h=pick(h,vec2(bx(v,vec3(.12,.28,.12))-.036,2.));}}
  vec3 crystal=c;crystal.xz=rr(turn*.55)*crystal.xz;float oct=(dot(abs(crystal),vec3(1.))-.82-breath*.05)*.57735;h=pick(h,vec2(oct,4.));
 }else if(uRealm==8){
  for(int i=0;i<4;i++){float j=float(i);vec3 q=c;q.z-=opening*(j-1.5)*.32;q.xz=rr((j*.74+turn*(j<2.?1.:-.7))*(1.-opening*.76))*q.xz;q.yz=rr((.3+j*.62)*(1.-opening*.82))*q.yz;h=pick(h,vec2(ring(q,2.15+j*.29,.042+.008*j),2.));}
  h=pick(h,vec2(length(c)-.57,4.));
  for(int i=0;i<5;i++){float j=float(i),ang=j*1.2566;vec3 q=p-vec3(cos(ang)*7.4,-1.5,sin(ang)*7.4-4.);h=pick(h,vec2(bx(q,vec3(.48,1.35,.48))-.08,3.));}
 }else if(uRealm==12){
  // Keep supporting pylons out of the camera's central sightline: the prism rings are the hero.
  for(int i=0;i<4;i++){float j=float(i),side=mod(j,2.)<.5?-1.:1.,row=floor(j*.5);vec3 q=p-vec3(side*4.70,.10,-2.0-row*2.9);h=pick(h,vec2(bx(q,vec3(.15,1.45,.17))-.025,3.));}
  for(int i=0;i<5;i++){float j=float(i);vec3 q=c;q.xy=rr(j*.628+turn*.20)*q.xy;q.yz=rr(.15*j+opening*.18)*q.yz;h=pick(h,vec2(ring(q,1.05+j*.30,.040+.005*j),2.));}
  vec3 pr=c;pr.xy=rr(turn*.5)*pr.xy;float gem=(dot(abs(pr),vec3(1.0,1.15,1.0))-.82-breath*.04)*.58;h=pick(h,vec2(gem,4.));
 }else if(uRealm==13){
  for(int i=0;i<4;i++){float j=float(i);vec3 q=p-vec3(0.,.6,-1.1-j*.85);q.xy=rr((j-1.5)*.11+turn*.08)*q.xy;q.xz=rr(opening*(j-1.5)*.12)*q.xz;h=pick(h,vec2(ring(q,1.95+j*.35,.095),2.));}
  // Frame the lattice with slim side posts, not a foreground slab.
  for(int i=0;i<4;i++){float j=float(i),side=mod(j,2.)<.5?-1.:1.,row=floor(j*.5);vec3 col=p-vec3(side*4.78,.20,-2.1-row*2.8);h=pick(h,vec2(bx(col,vec3(.11,2.0,.18))-.03,3.));}
  vec3 mesh=c;mesh.xy=rr(turn*.34)*mesh.xy;mesh.x=abs(mesh.x)-1.25;mesh.y=abs(mesh.y)-.95;h=pick(h,vec2(bx(mesh,vec3(.05,.95,1.25))-.02,4.));h=pick(h,vec2(bx(mesh.zyx,vec3(1.25,.95,.05))-.02,4.));
  }else if(uRealm==14){
  for(int i=0;i<6;i++){float j=float(i);vec3 q=p-vec3(0.,.64,-.55-j*.82);q.xy=rr((j-2.5)*.08+turn*.06)*q.xy;float a=atan(q.y,q.x);float rib=length(q.xy)-(2.02+j*.30+.28*sin(a*4.+j*.42+turn*3.8));h=pick(h,vec2(abs(rib)-.058,2.));}
  for(int i=0;i<5;i++){float j=float(i);vec3 hub=p-vec3(0.,.64,-.90-j*.96);hub.xy=rr(-turn*.16+j*.10)*hub.xy;float gem=(dot(abs(hub*vec3(1.0,1.26,0.84)),vec3(1.0))-.68)*.54;h=pick(h,vec2(gem,4.));}
  for(int i=0;i<5;i++){float j=float(i);vec3 orb=p-vec3(0.,.68,-.88-j*.96);orb.xy=rr(turn*.10+j*.06)*orb.xy;h=pick(h,vec2(ring(orb,1.05+.06*sin(j+turn*2.0),.030),4.));}
  // Side blades preserve the contour silhouette while leaving the center visible.
  for(int i=0;i<4;i++){float j=float(i),side=mod(j,2.)<.5?-1.:1.,row=floor(j*.5);vec3 q=p-vec3(side*4.34,.04,-2.28-row*2.70);q.y+=.22*sin(j+turn*3.6);h=pick(h,vec2(bx(q,vec3(.11,1.66,.22))-.024,3.));}
  vec3 core=c;core.xy=rr(-turn*.23+.8)*core.xy;h=pick(h,vec2(ring(core,1.34,.040),4.));
 }else{
  for(int i=0;i<5;i++){float j=float(i);vec3 q=p-vec3(0.,.7,-1.-j*.72);q.xy=rr((j-2.)*.18*(1.-opening*.45)+turn*.08)*q.xy;q.xz=rr(opening*(j-2.)*.10)*q.xz;h=pick(h,vec2(ring(q,2.1+j*.43,.10),2.));}
  vec3 q=c;q.xy=rr(turn*.34)*q.xy;h=pick(h,vec2(bx(q,vec3(.12,1.12,.12))-.05,4.));
  q=c;q.xy=rr(-turn*.31+.8)*q.xy;h=pick(h,vec2(ring(q,1.25,.055),2.));
 }
 return h;
}
vec2 danceMap(vec3 p){vec2 q=map(p);if(realmTunnel())q.x*=gdStepScale();return q;}
vec3 normalAt(vec3 p,float e){vec2 k=vec2(1.,-1.);return normalize(k.xyy*map(p+k.xyy*e).x+k.yyx*map(p+k.yyx*e).x+k.yxy*map(p+k.yxy*e).x+k.xxx*map(p+k.xxx*e).x);}
void main(){
 vec3 rd=ray(),p=uEye;float dist=.04,id=0.;bool hit=false;
 for(int i=0;i<144;i++){if(i>=uRealmSteps)break;p=uEye+rd*dist;vec2 q=danceMap(p);if(q.x<max(.0017,dist*.00075)){hit=true;id=q.y;break;}dist+=max(.002,q.x*.73);if(dist>90.)break;}
 vec3 c=uFog*.075,em=vec3(0.);
 if(hit){
  vec3 n=normalAt(p,max(.002,dist*.0008)),l=normalize(vec3(-.45,.8,.6));float df=max(dot(n,l),0.);
  float edge=pow(clamp(1.-abs(dot(n,-rd)),0.,1.),3.);
  c=mix(uShadow*.32,uBody*.33,.32+.55*df)+uAccent*edge*.08;
  if(id>1.5&&id<2.5){c=uHighlight*(.12+.55*df);em=uAccent*(.10+.16*uRealmLevels.x);}
  else if(id>3.5){c=uBody*.16;em=mix(uAccent,uHighlight,.22)*(.65+.75*uRealmLevels.x)*uRealmRadiance;}
  bool prismStudy=(uRealm==12||uRealm==15),echoStudy=(uRealm==13||uRealm==16),contourStudy=(uRealm==14||uRealm==17);
  if(prismStudy){
   if(id>1.5&&id<2.5){c=mix(uShadow*.18,uBody*.18,.52+.24*df);em=mix(uEmitColor,uAccent,.52)*(.18+.26*uRealmLevels.x);}
   else if(id>3.5){c=mix(uShadow*.12,uAccent*.08,.38);em=mix(uEmitColor,uAccent,.45)*(.42+.62*uRealmRadiance);}
   else c*=.52;
  }else if(echoStudy){
   if(id>1.5&&id<2.5){c=mix(uShadow*.20,uBody*.22,.54+.20*df);em=mix(uAccent,uEmitColor,.44)*(.17+.24*uRealmLevels.x);}
   else if(id>3.5){c=mix(uShadow*.14,uBody*.10,.48);em=mix(uAccent,uEmitColor,.52)*(.40+.60*uRealmRadiance);}
   else c*=.56;
  }else if(contourStudy){
   if(id>1.5&&id<2.5){c=mix(uShadow*.18,uBody*.16,.58+.16*df);em=mix(uAccent,uEmitColor,.28)*(.18+.28*uRealmLevels.x);}
   else if(id>3.5){c=mix(uShadow*.10,uBody*.08,.40);em=mix(uAccent,uEmitColor,.34)*(.30+.48*uRealmRadiance);}
   else c*=.46;
  }
  float footprint=dist*tan(uFov*.5)*2./uResolution.y/max(.22,abs(dot(n,-rd)));
  vec2 coord=abs(n.y)>.68?p.xz:(abs(n.x)>.65?p.zy:p.xy);
  vec3 studyBias=uRealm==12||uRealm==15?vec3(1.65,.20,.10)
   :uRealm==13||uRealm==16?vec3(.10,1.72,.16)
   :uRealm==14||uRealm==17?vec3(.10,.18,1.72)
   :uRealm==7||uRealm==10?vec3(.16,1.12,.18)
   :uRealm==8?vec3(1.10,.34,.16)
   :uRealm==9||uRealm==11?vec3(.16,.20,1.16)
   :vec3(.45,.45,.45);
  vec3 studyField=studySurface(coord,footprint,studyBias);
  if(uRealm==7||uRealm==10)em+=circuitInk(coord,footprint)*(id<1.5?.27:1.15);
  else if(id<1.5){float r=length(p.xz),gr=abs(fract(r*.58)-.5),aa=max(.002,footprint*.55);float grid=1.-smoothstep(.015,.015+aa,gr);em+=uAccent*grid*.075*uRealmDetail;}
  float studyGlow=uRealm>=12?2.02:(id<1.5?.48:.88);
  em+=studyField*studyGlow*uStudyBlend;
  c+=studyField*(uRealm>=12?.074:.036)*uStudyBlend;
  float wave=realmPulse(p);em+=uAccent*wave*.20+uHighlight*wave*.065;
  float journey=realmTunnel()?p.z*.020:length(p.xz)*.12;float delta=journey-uPhrasePacket.x;float carrier=exp(-delta*delta*110.)*uPhrasePacket.y;em+=uPhraseTint*carrier*(id<1.5?.22:.70);
  if(uRealmAction>.001){if(id>3.5)em*=1.+uPhraseCue.y*.65;else em*=1.-uPhraseCue.y*.18;}
  float highlight=pow(max(dot(n,normalize(l-rd)),0.),58.);c+=uHighlight*highlight*.6;
  float fog=1.-exp(-dist*(uRealm>=12?.012:.018));c=mix(c,uFog*(uRealm>=12?.035:.08),fog);em*=1.-fog*.82;
  vec4 clip=uPV*vec4(p,1.);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
 }else gl_FragDepth=1.;
 outColor=vec4(max(c+em,vec3(0.)),1.);outEmission=vec4(max(em,vec3(0.)),1.);
}`;
 const volume=`#version 300 es
${shared}
uniform sampler2D uSceneColor,uSceneEmission,uSceneDepth;
uniform float uNear,uFar;uniform int uVolumeOnly;uniform vec2 uFullSize;
layout(location=0)out vec4 outColor;layout(location=1)out vec4 outEmission;
const mat3 m3=mat3(.33338,.56034,-.71817,-.87887,.32651,-.15323,.15162,.69596,.61339)*1.93;
vec2 displace(float z){return vec2(sin(z*.22),cos(z*.175))*2.;}
vec2 cloudMap(vec3 p){
 float T=uRealmPhase.y,prm=.50+.11*sin(T*.4)+.11*uRealmLevels.y*uRealmExpression;
 vec3 q=p;vec2 center=displace(p.z+T)*.32;
 q.xy-=center;
 p.xy*=rr(sin(p.z+T)*(.1+prm*.05)+T*.09);
 float cl=dot(q.xy,q.xy),amp=.1+prm*.2,d=0.,z=1.,trk=1.75+.25*uRealmExpression*uRealmLevels.w;
 p*=.61;
 for(int i=0;i<5;i++){p+=sin(p.zxy*.75*trk+T*trk*.8)*amp;d-=abs(dot(cos(p),sin(p.yzx))*z);z*=.57;trk*=1.4;p=p*m3;}
 d=abs(d+prm*3.)+prm*.3-2.5;
 return vec2(d+cl*.2+.25,cl);
}
float stellar(vec3 p){
 p=abs(vec3(.85)-mod(p,vec3(1.7)));float previous=0.,variation=0.;
 for(int i=0;i<7;i++){p=abs(p)/max(dot(p,p),.0005)-.89;float len=min(length(p),40.);variation+=abs(len-previous);previous=len;}
 return min(variation*variation*variation*.002,2.2);
}
float stellarCloud(vec3 p){
 float accum=0.,prev=0.,tw=0.;for(int i=0;i<7;i++){float mag=dot(p,p);p=abs(p)/max(mag,.025)+vec3(-.5,-.4,-1.5);float w=exp(-float(i)/7.);accum+=w*exp(-7.*pow(abs(mag-prev),2.3));tw+=w;prev=mag;}return max(0.,5.*accum/tw-.7);
}
vec3 studyTint(){
 return mix(vec3(.10,.76,1.24),vec3(1.20,.09,.76),.54)*uStudyMix.x + mix(vec3(.46,.12,1.12),vec3(.06,1.08,.74),.48)*uStudyMix.y + mix(vec3(.10,.26,1.06),vec3(1.22,.28,.08),.56)*uStudyMix.z;
}
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution;vec3 rd=ray();vec3 base=texture(uSceneColor,uv).rgb,srcEm=texture(uSceneEmission,uv).rgb;
 float dep=texture(uSceneDepth,uv).r;if(uVolumeOnly==1){vec2 px=.5/uFullSize;dep=min(min(texture(uSceneDepth,uv+px).r,texture(uSceneDepth,uv-px).r),min(texture(uSceneDepth,uv+vec2(px.x,-px.y)).r,texture(uSceneDepth,uv+vec2(-px.x,px.y)).r));}float z=dep*2.-1.;
 float viewDepth=2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));
 float limit=min(56.,viewDepth/max(.03,dot(rd,uForward)));
 vec3 sum=vec3(0.);float trans=1.;
 if(uRealm==8){
  float ds=limit/float(uRealmSteps);vec3 tint=studyTint();
  for(int i=0;i<60;i++){if(i>=uRealmSteps)break;float t=(float(i)+.5)*ds;vec3 p=uEye+rd*t;
   float veil=smoothstep(2.8,8.,t)*(1.-smoothstep(45.,56.,t))*smoothstep(6.,11.,length(p));
   vec3 sp=p*.16+vec3(.12*uRealmPhase.z,.10*uRealmPhase.z,uRealmPhase.z*.27);
   float v=stellar(sp),fog=stellarCloud(sp*.32+vec3(1.,-1.3,0.));
   float align=uPhraseCue.y*uRealmAction;veil*=1.-align*.45*exp(-dot(p.xy,p.xy)*.055);float fine=pow(clamp(v*.76,0.,1.),2.);vec3 tone=mix(uAccent,uHighlight,sat(v*.32));tone=mix(tone,uEmitColor,.16*(.5+.5*sin(t*.27+uRealmPhase.z)));
   tone=mix(tone,tint,.30*min(uStudyBlend,1.45));
   float trail=length(p.xz)*.037-uPhrasePacket.x;vec3 carry=uPhraseTint*exp(-trail*trail*80.)*uPhrasePacket.y*.065;sum+=(tone*fine*.10+uAccent*fog*.005+carry)*veil*ds*uRealmAtmosphere*(.65+.45*uRealmLevels.w)*exp(-t*.028);
  }
 }else if(uRealm==9||uRealm==11){
  float ds=limit/float(uRealmSteps);vec3 tint=studyTint();
  for(int i=0;i<60;i++){if(i>=uRealmSteps||trans<.025)break;float t=(float(i)+.5)*ds;vec3 pos=uEye+rd*t;
   vec3 samplePos=pos*.58+vec3(0.,0.,uRealmPhase.y*.16);vec2 mp=cloudMap(samplePos);
   float envelope=uRealm==11?smoothstep(1.85,3.8,length(pos.xy))*(1.-smoothstep(5.4,8.,length(pos.xy))):smoothstep(1.8,4.8,length(pos.xz))*(1.-smoothstep(12.,26.,length(pos.xz)));
   float aperture=uPhraseCue.y*uRealmAction;float clearMask=uRealm==11?smoothstep(2.0+aperture*.55,3.7+aperture*.50,length(pos.xy)):smoothstep(2.3+aperture*1.25,4.6+aperture*1.20,length(pos.xz));envelope*=mix(1.,clearMask,aperture*.90);
   float den=sat(mp.x-.30)*envelope*smoothstep(.6,2.,t)*uRealmAtmosphere;
   float alpha=1.-exp(-den*.25*ds);
   float diff=sat((mp.x-cloudMap(samplePos+vec3(.42,.55,.22)).x)*.55+.36);
   vec3 tone=mix(uAccent*.36,uHighlight*.62,sat(diff+.12*sin(pos.z*.4+uRealmPhase.y)));
   tone=mix(tone,tint,.36*min(uStudyBlend,1.45));
   tone+=uAccent*realmPulse(pos)*.16;float trail=(uRealm==11?pos.z*.02:length(pos.xz)*.055)-uPhrasePacket.x;tone+=uPhraseTint*exp(-trail*trail*80.)*uPhrasePacket.y*.20;
   sum+=trans*alpha*tone*(.55+uRealmRadiance*.66);trans*=1.-alpha;
  }
 }else if(uRealm==12||uRealm==15){
  float ds=limit/float(uRealmSteps);vec3 tint=mix(studyTint(),mix(uHighlight,uAccent,.5),.45);
  for(int i=0;i<60;i++){if(i>=uRealmSteps||trans<.03)break;float t=(float(i)+.5)*ds;vec3 pos=uEye+rd*t;float radial=length(pos.xy);
   float envelope=smoothstep(1.1,2.2,radial)*(1.-smoothstep(4.9,6.0,radial))*smoothstep(.4,2.2,t);
   float petals=.5+.5*sin(atan(pos.y,pos.x)*6.+pos.z*.5+uRealmPhase.x*2.);float den=envelope*(.08+.14*petals)*uRealmAtmosphere;
   float alpha=1.-exp(-den*ds);vec3 tone=mix(uEmitColor,uAccent,.45+.40*petals);tone=mix(tone,tint,.52+.28*min(uStudyBlend,1.25));
   tone+=uPhraseTint*exp(-pow(radial*.09-uPhrasePacket.x,2.)*80.)*uPhrasePacket.y*.18;sum+=trans*alpha*tone*(.44+uRealmRadiance*.42);trans*=1.-alpha;
  }
  }else if(uRealm==14||uRealm==17){
  float ds=limit/float(uRealmSteps);vec3 tint=mix(studyTint(),mix(uAccent,uFog,.48),.42);
  for(int i=0;i<60;i++){if(i>=uRealmSteps||trans<.03)break;float t=(float(i)+.5)*ds;vec3 pos=uEye+rd*t;float radial=length(pos.xy);
   float folds=.5+.5*sin(pos.x*.84+sin(pos.y*.38+uRealmPhase.x*1.55)*2.75+pos.z*.30);
   float filaments=1.-smoothstep(.68,.97,abs(sin(pos.z*.76+folds*4.4+uRealmPhase.z*1.92)));
   float arches=1.-smoothstep(.15,.78,abs(length(vec2(pos.x*.24+sin(pos.z*.18+uRealmPhase.x)*1.02,pos.y*.15))-(1.54+.28*sin(pos.z*.22+uRealmPhase.y))));
   vec2 nodeCell=vec2(pos.x*.18+.42*sin(pos.z*.20+uRealmPhase.y),fract(pos.z*.22-uRealmPhase.x*.14)-.5);
   float nodes=1.-smoothstep(.14,.42,length(nodeCell));
   float envelope=smoothstep(1.2,2.5,radial)*(1.-smoothstep(5.4,7.2,radial))*smoothstep(.4,2.0,t);
   float den=envelope*(.02+.05*folds+.07*filaments+.09*arches+.08*nodes)*uRealmAtmosphere;
   float alpha=1.-exp(-den*ds);
   vec3 tone=mix(vec3(.02,.03,.20),mix(uAccent,uEmitColor,.34),.18+.42*folds);
   tone=mix(tone,tint,.30+.22*min(uStudyBlend,1.25));
   tone+=vec3(1.10,.48,.24)*(filaments*.05+arches*.10+nodes*.12);
   tone+=uAccent*realmPulse(pos)*.08;
   sum+=trans*alpha*tone*(.30+uRealmRadiance*.26);trans*=1.-alpha;
  }
 }
 if(uVolumeOnly==1){outColor=vec4(sum,trans);outEmission=vec4(sum*.26,viewDepth);return;}
 outColor=vec4(base*trans+sum,1.);outEmission=vec4(srcEm*trans+sum*.26,1.);
}`;
 return{field,volume};
})();

