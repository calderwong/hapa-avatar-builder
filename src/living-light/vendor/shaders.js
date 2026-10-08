
/* Original Zerbini showcase. Shared linear-light scene/emission/depth contract.
   The weave is appearance, never used as a ray-march distance estimator. */
'use strict';
window.HapaShaders=(()=>{
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.,1.);}`;
const weave=window.HAPA_WEAVE_GLSL;
const common=`
precision highp float;
uniform vec2 uResolution;
uniform vec3 uEye,uForward,uRight,uUp,uSource;
uniform mat4 uPV;
uniform float uTime,uPhase,uFov,uBreath,uWarp,uScale,uEmission,uVocal,uPulse,uMotion,uDust;
uniform vec3 uBackground,uShadow,uBody,uAccent,uHighlight,uEmitColor,uFog;
uniform int uWorld,uWeave,uTextureMode;
uniform float uPassage,uExitZ,uPolish,uResonance;uniform int uThreadMode;
uniform sampler2D uWeaveTex;
uniform vec4 uPhraseCue,uPhrasePacket;uniform vec3 uPhraseTint;
${weave}
${window.HapaGeometryGLSL}
float weaveMask(vec3 p,vec3 n){
 if(uWeave==0)return 0.;
 vec3 weights=pow(abs(n),vec3(4.));weights/=max(.0001,dot(weights,vec3(1.)));
 float a,b,c;
 if(uTextureMode==0){
  a=hapaWeaveField(p.yz*uScale*.36,uPhase*.30,uWarp,.055);
  b=hapaWeaveField(p.xz*uScale*.36,uPhase*.30,uWarp,.055);
  c=hapaWeaveField(p.xy*uScale*.36,uPhase*.30,uWarp,.055);
 }else{
  a=texture(uWeaveTex,fract(p.yz*.17)).r;
  b=texture(uWeaveTex,fract(p.xz*.17)).r;
  c=texture(uWeaveTex,fract(p.xy*.17)).r;
 }
 return dot(vec3(a,b,c),weights);
}
`;
const field=`#version 300 es
${common}
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outEmission;
uniform int uSteps,uIterations;
uniform vec2 uPulses[6];
const float PI=3.14159265359;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float box(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float torus(vec3 p,vec2 r){return length(vec2(length(p.xy)-r.x,p.z))-r.y;}
float menger(vec3 p){
 float d=box(p,vec3(1.));float s=1.;
 for(int i=0;i<4;i++){if(i>=uIterations)break;vec3 a=mod(p*s,2.)-1.;s*=3.;vec3 r=abs(1.-3.*abs(a));float c=(min(max(r.x,r.y),min(max(r.y,r.z),max(r.z,r.x)))-1.)/s;d=max(d,c);}return d;
}
float bulb(vec3 p){
 float outer=length(p);if(outer>1.9)return outer-1.65;
 vec3 z=p;float dr=1.,r=0.;
 for(int i=0;i<8;i++){r=max(length(z),.00001);if(r>2.2)break;float th=acos(clamp(z.z/r,-1.,1.)),ph=atan(z.y,z.x);dr=pow(r,7.)*8.*dr+1.;float zr=pow(r,8.);th*=8.;ph*=8.;z=zr*vec3(sin(th)*cos(ph),sin(th)*sin(ph),cos(th))+p;}
 return .5*log(max(r,.00001))*r/dr;
}
float thread(vec3 p,float shift){
 vec2 c=vec2(sin(p.z*.23+shift+uPhase*.02),cos(p.z*.19+shift-uPhase*.025))*(1.75+.1*uVocal);
 if(uPassage>.5&&uThreadMode==1)c=vec2(sin(p.z*.16+shift+uPhase*.01),cos(p.z*.13+shift))*.85;
  float d=(length(p.xy-c)-(.018+.025*uVocal)*(uPassage>.5?.55:1.))*.75;
  if(uPassage>.5)d=max(d,max(1.5-p.z,p.z-(uExitZ-3.5)));
  return d;
}
vec2 mapWorld(vec3 p){
 vec3 raw=p;if(uWorld==0)p=gdInverse(p);
 vec3 q=p;float d=100.,id=1.;
 if(uWorld==0){
  float cell=floor((p.z+5.)/10.);q.xy=rot(.07*sin(cell*.9)+.06*sin(uPhase*.04)*uMotion)*q.xy;
  float sector=PI/4.,a=mod(atan(q.y,q.x)+sector*.5,sector)-sector*.5;
  q.xy=vec2(cos(a),sin(a))*length(q.xy);q.x-=5.30+uBreath;
  q.z=mod(q.z+5.,10.)-5.;
  d=menger(q/vec3(1.80,1.72,3.65))*1.72;
  float frame=torus(vec3(p.xy,mod(p.z+5.,10.)-5.),vec2(3.34+uBreath,.038));
  if(frame<d){d=frame;id=4.;}
  if(uVocal>.005){float tr=thread(p,0.);if(tr<d){d=tr;id=2.;}tr=thread(p,PI);if(tr<d){d=tr;id=3.;}}
 }else if(uWorld==1){
  q.xz=rot(uPhase*.065*uMotion)*q.xz;q.yz=rot(.25+sin(uPhase*.03)*.08)*q.yz;
  float sc=1.48+uBreath*.32;d=bulb(q/sc)*sc*.68;
 }else if(uWorld==4){
  // Finite open-front chamber. All visible pieces have field depth; the media is separate.
  d=max(length(p.xz)-6.4,abs(p.y+2.2)-.10);id=6.;
  float tier=max(length(p.xz)-4.8,abs(p.y+2.05)-.08);d=min(d,tier);
  float sec=2.*PI/16.;float ang=atan(p.z,p.x);float cell=floor((ang+sec*.5)/sec);
  float local=ang-cell*sec;vec3 c=vec3(cos(local)*length(p.xz)-5.1,p.y+.45,sin(local)*length(p.xz));
  float height=2.05+.65*(.5+.5*cos(cell*1.7));
  float stone=box(c,vec3(.39,height,.36))-.09;
  // Leave the entire front approach open. This is an intentional camera envelope.
  stone=max(stone,min(p.z-.6,3.8-abs(p.x)));
  if(stone<d){d=stone;id=7.;}
  vec3 back=p-vec3(0.,.5,-1.68);
  float arch=torus(back,vec2(3.06,.085));
  if(arch<d){d=arch;id=4.;}
  float podium=max(length(p.xz)-1.05,abs(p.y+1.88)-.12);if(podium<d){d=podium;id=7.;}
 }else if(uWorld==3){
  // Finite recursive rings, a recessed plinth, and flanking rails. No mesh reconstruction.
  d=max(length(p.xz)-5.8,abs(p.y+2.18)-.10);id=6.;
  float step1=max(length(p.xz)-4.35,abs(p.y+2.03)-.09);d=min(d,step1);
  vec3 a=p-vec3(0.,.2,-1.18);
  for(int i=0;i<4;i++){float fi=float(i);float ring=torus(a-vec3(0.,0.,-fi*.24),vec2(2.50+fi*.41+uBreath*.3,.027+fi*.004));if(ring<d){d=ring;id=4.;}}
  vec3 col=p;col.x=abs(col.x)-4.7;col.z+=2.2;
  float rail=box(col,vec3(.065,2.55,.08));if(rail<d){d=rail;id=4.;}
  float plinth=max(length(p.xz)-1.15,abs(p.y+1.85)-.12);if(plinth<d){d=plinth;id=1.;}
 }else{
  // A shallow stepped pedestal; triangle ribbons are separate true mesh geometry.
  d=max(length(p.xz)-5.6,abs(p.y+2.0)-.08);
  float d2=max(length(p.xz)-4.8,abs(p.y+1.85)-.10);d=min(d,d2);
  vec3 a=p-vec3(0.,.2,-.7);
  float arch=torus(a,vec2(2.6+uBreath,.055));
  arch=min(arch,torus(a-vec3(0.,0.,-.35),vec2(3.18,.038)));
  if(arch<d){d=arch;id=4.;}
  vec3 col=p;col.x=abs(col.x)-4.7;col.z+=1.35;
  float columns=box(col,vec3(.10,3.5,.1));if(columns<d){d=columns;id=1.;}
 }
 if(uWorld==0)d*=gdStepScale();
 float lamp=length(raw-uSource)-(uWorld==0?mix(.31,.040,smoothstep(.05,.65,uDanceCarry)):.31);if(uGeometryOnly==0&&lamp<d){d=lamp;id=5.;}
 return vec2(d,id);
}
vec3 normalAt(vec3 p,float e){vec2 k=vec2(1.,-1.);return normalize(k.xyy*mapWorld(p+k.xyy*e).x+k.yyx*mapWorld(p+k.yyx*e).x+k.yxy*mapWorld(p+k.yxy*e).x+k.xxx*mapWorld(p+k.xxx*e).x);}
float ao(vec3 p,vec3 n){float o=(.12-mapWorld(p+n*.12).x)*1.65+(.34-mapWorld(p+n*.34).x)*.62;return clamp(1.-o,.28,1.);}
float impulse(vec3 p){float d=uWorld==0?p.z:length(p),v=0.;for(int i=0;i<6;i++){float x=d-uPulses[i].x;v+=exp(-x*x*(uWorld==0?3.2:34.))*uPulses[i].y;}return min(v,1.3);}
void main(){
 vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
 vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));
 float travel=0.,id=0.;bool hit=false;vec3 p=uEye;
 if(uWorld==3){
  // Exact ray/plane and ray/sphere intersections. The surrounding rings are real triangles.
  float floorT=(-2.13-uEye.y)/rd.y;if(floorT>0.&&floorT<60.&&length((uEye+rd*floorT).xz)<5.8){travel=floorT;hit=true;id=6.;}
  vec3 oc=uEye-uSource;float b=dot(oc,rd),c=dot(oc,oc)-.31*.31,disc=b*b-c;
  if(disc>0.){float sphereT=-b-sqrt(disc);if(sphereT>0.&&(!hit||sphereT<travel)){travel=sphereT;hit=true;id=5.;}}
  p=uEye+rd*travel;
 }else for(int i=0;i<152;i++){if(i>=uSteps)break;p=uEye+rd*travel;vec2 info=mapWorld(p);float eps=max(.0012,travel*.00055);if(info.x<eps){hit=true;id=info.y;break;}travel+=max(info.x*.76,.0025);if(travel>(uWorld==0?78.:30.))break;}
 vec3 bg=uBackground+uFog*.13*pow(max(0.,dot(rd,uForward)),3.);
 float nebula=.5+.5*sin(rd.y*8.+sin(rd.x*6.+uPhase*.02));bg+=uAccent*.008*nebula;
 vec3 color=bg,emission=vec3(0.);
 if(hit){
  vec3 n=uWorld==3?(id>5.5?vec3(0,1,0):normalize(p-uSource)):normalAt(p,max(.0015,travel*.00045));
  vec3 l=normalize(uWorld==0?uEye+vec3(2.2,3.,3.)-p:vec3(4.,5.,5.)-p);
  vec3 sunDir=normalize(uSource-p);float diff=max(0.,dot(n,l));float rim=pow(1.-max(0.,dot(n,-rd)),2.6);float amb=uWorld==3?1.:ao(p,n);
  float pat=weaveMask(uWorld==0?gdInverse(p):p,n);if(uPassage>.5&&uPolish>.5)pat*=.35+.30*exp(-travel*.08);float bands=.5+.5*sin(p.z*.16+p.y*.4);
  vec3 base=mix(uBody,uAccent,bands*.35);base=mix(base,uHighlight,pat*.30);
  color=base*(.23+.92*diff)*amb;
  color+=uHighlight*pow(max(0.,dot(n,normalize(l-rd))),46.)*.48;
  color+=uEmitColor*max(0.,dot(n,sunDir))*.10+uAccent*rim*.12;
  emission=uEmitColor*pat*(.12+uEmission*.78)*(0.3+.7*amb);
  emission+=uHighlight*impulse(p)*(.16+.24*rim)*uPulse;
  if(id>1.5&&id<2.5){color=uHighlight*.18;emission=uEmitColor*(.65+uVocal*2.1)*(uPassage>.5?.58:1.);}
  if(id>2.5&&id<3.5){color=uAccent*.2;emission=uAccent*(.7+uVocal*1.4)*(uPassage>.5?.58:1.);}
  if(id>3.5&&id<4.5){color=uHighlight*.35;emission=uEmitColor*.45;}
  if(id>4.5&&id<5.5){color=uHighlight;emission=uHighlight*3.0;}if(id>5.5){color=base*(.08+.12*diff)*amb;emission*=.09;}
  if(uWorld==4){
   if(id>6.5){float seam=pow(.5+.5*sin(p.y*4.8),22.);float edgeLight=pow(1.-max(0.,dot(n,-rd)),2.);color=mix(uShadow,uBody,.45)*(.35+.8*diff)*amb+uHighlight*pow(max(dot(n,normalize(l-rd)),0.),65.)*.7;emission=uAccent*(seam*.08+edgeLight*.12)*(.25+uEmission);}
   else if(id>5.5){
    float rad=length(p.xz);float rings=pow(.5+.5*cos(rad*6.4),32.);
    float spokes=pow(abs(cos(atan(p.z,p.x)*12.)),85.);
    color+=uAccent*(rings*.07+spokes*.04)*exp(-rad*.16);
    float wave=0.;for(int j=0;j<6;j++){float dist=rad-uPulses[j].x;wave+=exp(-dist*dist*9.)*uPulses[j].y;}
    emission+=uResonance*uEmitColor*min(wave,.85)*(.25+.40*uEmission)*(1.-smoothstep(5.0,6.4,rad));
   }
  }
  if(uWorld>0){float carry=length(p.xz)*.12-uPhrasePacket.x;emission+=uPhraseTint*exp(-carry*carry*110.)*uPhrasePacket.y*.22;}
  float fog=1.-exp(-travel*(uWorld==0?(uPassage>.5?.028:.018):.016));
  color=mix(color,bg,fog);emission*=1.-fog*.64;
  vec4 clip=uPV*vec4(p,1.);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
 }else gl_FragDepth=1.;
 if(uGeometryOnly==1){vec3 nn=hit?normalAt(p,max(.003,travel*.0008)):vec3(0);color=hit?vec3(.16+.64*abs(dot(nn,normalize(vec3(.5,.7,.3))))):vec3(.006);emission=vec3(0);}
 outColor=vec4(max(color+emission,vec3(0.)),1.);
 outEmission=vec4(emission,1.);
}`;
const meshVertex=`#version 300 es
precision highp float;
layout(location=0) in vec2 aUV;
uniform mat4 uPV,uModel;
uniform float uPhase,uVocal,uExitZ;
${window.HapaGeometryGLSL}
uniform highp int uShape;
out vec3 vPos;out vec2 vUV;
void main(){
 float a=aUV.x*6.28318530718,v=aUV.y-.5;
 float r=2.50+v*.68;
 vec3 p=vec3(cos(a)*r,sin(a)*r,.28*sin(a*3.+uPhase*.13)+v*.52*sin(a*2.));
 if(uShape==1)p=vec3(cos(a)*(2.+v*1.5),sin(a)*(2.+v*1.5),.47*sin(a*2.+uPhase*.09)+v*.5);
 if(uShape==2)p=vec3(aUV.x*2.-1.,aUV.y*2.-1.,0.);
 if(uShape==3){float b=aUV.y*6.28318530718;float rr=2.5+cos(b)*.037;p=vec3(cos(a)*rr,sin(a)*rr,sin(b)*.037);}
 if(uShape==4){
  float theta=aUV.x*12.5663706+uPhase*.025,b=aUV.y*6.2831853;
  float taper=smoothstep(0.,.06,aUV.x)*(1.-smoothstep(.94,1.,aUV.x));
  float tube=.075*taper,radius=2.78+cos(b)*tube;
  p=vec3(cos(theta)*radius,sin(theta)*radius,1.2+aUV.x*(uExitZ-3.4)+sin(b)*tube);
 }
 if(uShape!=3&&uShape!=4)p.z+=sin(a*5.+uPhase*.16)*.06*uVocal;
 vec4 w=uModel*vec4(p,1.);if(uShape!=2)w.xyz=gdForward(w.xyz);vPos=w.xyz;vUV=aUV;gl_Position=uPV*w;
}`;
const meshFragment=`#version 300 es
${common}
in vec3 vPos;in vec2 vUV;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outEmission;
uniform highp int uBlocker,uUseMedia,uShape;uniform sampler2D uMediaWeave;
void main(){
 if(uBlocker==1){outColor=vec4(uShadow*1.2,1.);outEmission=vec4(0,0,0,1);return;}
 vec3 n=normalize(cross(dFdx(vPos),dFdy(vPos)));if(!gl_FrontFacing)n=-n;
 float mask=0.;
 if(uWeave==1){if(uTextureMode==1)mask=texture(uWeaveTex,vec2(vUV.x*3.,vUV.y)).r;else mask=hapaWeaveField(vec2(vUV.x*30.,vUV.y*uScale),uPhase*.30,uWarp,.055);}
 float edge=smoothstep(.425,.492,abs(vUV.y-.5));
 vec3 base=mix(uBody*.38,uAccent,.3+mask*.38);
 float diff=.25+.75*max(0.,dot(n,normalize(vec3(2.,4.,5.)-vPos)));
 float spec=pow(max(0.,dot(n,normalize(normalize(uEye-vPos)+normalize(vec3(2.,4.,5.)-vPos)))),30.);
 vec3 emit=uEmitColor*(mask*(.26+uEmission*.8)+edge*.46);
 if(uUseMedia==1&&uShape!=3){vec3 video=texture(uMediaWeave,vec2(fract(vUV.x*2.),vUV.y)).rgb;video=mix(pow((video+.055)/1.055,vec3(2.4)),video/12.92,lessThanEqual(video,vec3(.04045)));base=mix(base,video,.58);emit+=video*.16;}
 if(uShape==4){base=uBody*.3+uAccent*.18;emit=uEmitColor*(.13+.21*uEmission)+uAccent*mask*.16;}
 if(uShape==3){base=uHighlight*.3;emit=uHighlight*(.5+uEmission*.2);}
 float fog=exp(-length(vPos-uEye)*.013);
 outColor=vec4((base*diff+uHighlight*spec*.48+emit)*fog,1.);outEmission=vec4(emit*fog,1.);
}`;
const pointVertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;layout(location=1) in float aSize;
uniform mat4 uPV;uniform vec3 uEye;uniform int uWorld;uniform float uPhase,uDust,uPointScale;
out float vAlpha;
void main(){vec3 p=aPosition;if(uWorld==0)p.z=mod(p.z-uEye.z+48.,96.)-48.+uEye.z;p.x+=.07*sin(uPhase*.12+p.z);p.y+=.08*cos(uPhase*.09+p.x);
 vec4 clip=uPV*vec4(p,1.);gl_Position=clip;gl_PointSize=clamp(aSize*uPointScale/max(1.,clip.w*.22),.7,3.6);vAlpha=(.16+aSize*.1)*uDust*(1.-smoothstep(18.,60.,length(p-uEye)));}`;
const pointFragment=`#version 300 es
precision highp float;in float vAlpha;uniform vec3 uHighlight;layout(location=0) out vec4 outColor;layout(location=1) out vec4 outEmission;
void main(){float a=1.-smoothstep(.06,.5,length(gl_PointCoord-.5));if(a<.01)discard;vec3 c=uHighlight*vAlpha*a;outColor=vec4(c,a);outEmission=vec4(c*.3,a);}`;
const visibility=`#version 300 es
precision highp float;out vec4 outColor;
uniform sampler2D uDepth;uniform vec3 uSourceUV;uniform vec2 uSceneSize;uniform int uFront;
void main(){
 float visible=0.;vec2 uv=uSourceUV.xy;
 if(uFront==1&&all(greaterThan(uv,vec2(.002)))&&all(lessThan(uv,vec2(.998)))){
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){float depth=texture(uDepth,uv+vec2(float(x),float(y))*1.2/uSceneSize).r;visible+=step(uSourceUV.z-.000035,depth)/9.;}
 }
 outColor=vec4(visible,visible,visible,1.);
}`;
const blur=`#version 300 es
precision highp float;out vec4 outColor;uniform sampler2D uImage;uniform vec2 uResolution,uDirection;
vec3 hpBloomSample(vec2 uv){vec3 c=texture(uImage,uv).rgb;c=vec3(isnan(c.x)||isinf(c.x)?0.:clamp(c.x,0.,64.),isnan(c.y)||isinf(c.y)?0.:clamp(c.y,0.,64.),isnan(c.z)||isinf(c.z)?0.:clamp(c.z,0.,64.));float peak=max(c.r,max(c.g,c.b));float gate=smoothstep(.09,.42,peak);return c*gate;}
void main(){vec2 uv=gl_FragCoord.xy/uResolution,texel=uDirection/uResolution;vec3 c=hpBloomSample(uv)*.214607;
 c+=(hpBloomSample(uv+texel*1.384615)+hpBloomSample(uv-texel*1.384615))*.308026;
 c+=(hpBloomSample(uv+texel*3.230769)+hpBloomSample(uv-texel*3.230769))*.110827;
 c+=(hpBloomSample(uv+texel*5.176923)+hpBloomSample(uv-texel*5.176923))*.028213;outColor=vec4(c,1.);}`;
const composite=`#version 300 es
precision highp float;out vec4 outColor;
uniform sampler2D uScene,uBloom,uDepth,uVisibility,uEmissionTex,uWeaveTex,uPortalVideo;
uniform float uPortalBlend,uPortalAspect,uVideoGain;
uniform vec2 uResolution;uniform vec3 uSourceUV,uHighlight,uAccent;
uniform float uFlare,uBloomGain,uExposure;uniform int uDebug;
vec3 hpFinite(vec3 x){return vec3(isnan(x.x)||isinf(x.x)?0.:clamp(x.x,0.,64.),isnan(x.y)||isinf(x.y)?0.:clamp(x.y,0.,64.),isnan(x.z)||isinf(x.z)?0.:clamp(x.z,0.,64.));}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 linearToSrgb(vec3 c){return mix(1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,12.92*c,lessThanEqual(c,vec3(.0031308)));}
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution;
 vec3 c=hpFinite(texture(uScene,uv).rgb);
 if(uBloomGain>0.)c+=hpFinite(texture(uBloom,uv).rgb)*uBloomGain;
 float vis=texture(uVisibility,vec2(.5)).r;
 if(uFlare>0. && vis>0. && !any(isnan(uSourceUV)) && !any(isinf(uSourceUV))){
 vec2 asp=vec2(uResolution.x/uResolution.y,1.);vec2 p=(uv-uSourceUV.xy)*asp;float r=length(p);
 float core=exp(-r*r*430.);float glow=exp(-r*r*36.)*.055;
 float streak=exp(-abs(p.y)*380.)*exp(-abs(p.x)*3.5)*.24;
 float diagonal=exp(-abs(p.y-p.x*.47)*450.)*exp(-r*9.)*.055;
 float iris=exp(-pow((r-.095)*60.,2.))*.016;
 vec3 flare=uHighlight*(core*.52+glow+streak+diagonal+iris);
 vec2 axis=vec2(.5)-uSourceUV.xy;
 for(int i=0;i<4;i++){float f=.52+float(i)*.42;vec2 center=uSourceUV.xy+axis*(1.+f);vec2 q=(uv-center)*asp;float rr=length(q);float rad=.024+float(i)*.015;float ghost=exp(-pow((rr-rad)*90.,2.))*.010;flare+=mix(uAccent,uHighlight,float(i)/3.)*ghost;}
 c+=hpFinite(flare)*vis*uFlare;
 }
 c*=1.-.16*smoothstep(.3,.90,length((uv-.5)*vec2(1.,.85)));
 if(uPortalBlend>0.){vec2 puv=uv;float asp=uResolution.x/uResolution.y;if(uPortalAspect>asp)puv.x=.5+(puv.x-.5)*asp/uPortalAspect;else puv.y=.5+(puv.y-.5)*uPortalAspect/asp;vec3 pc=texture(uPortalVideo,puv).rgb;pc=mix(pow((pc+.055)/1.055,vec3(2.4)),pc/12.92,lessThanEqual(pc,vec3(.04045)));c=mix(c,pc*uVideoGain,uPortalBlend);}
 c=linearToSrgb(aces(max(c,vec3(0.))*uExposure));
 float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,1.07);c=pow(max(c,vec3(0.)),vec3(.96));
 if(uDebug==1){float z=texture(uDepth,uv).r;float near=.08,far=140.;float lin=2.*near*far/(far+near-(z*2.-1.)*(far-near));c=vec3(1.-exp(-lin*.09));}
 if(uDebug==2)c=linearToSrgb(aces(texture(uEmissionTex,uv).rgb));
 if(uDebug==3)c=vec3(texture(uWeaveTex,uv).r);
 if(uDebug==4)c=vec3(vis);
 outColor=vec4(c,1.);
}`;
return{vertex,field,meshVertex,meshFragment,pointVertex,pointFragment,visibility,blur,composite};
})();

