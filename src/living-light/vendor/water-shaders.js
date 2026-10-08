
/* Original Hapa Water Paint kernels. Analytic waves/derivatives, bounded optical model.
 * No copied third-party shader code. Reflection is a separately rendered flat-mean-plane view.
 */
'use strict';
window.HapaWaterKernel={glsl:`
uniform vec4 uWaterWaves[4],uWaterRings[6];
uniform float uWaterChop;uniform vec2 uWaterWarp;
// Returns height, dH/dx, dH/dz, crest measure in binding-local coordinates.
vec4 waterField(vec2 p){vec4 o=vec4(0.);vec2 wp=p+vec2(uWaterWarp.x*sin(p.y*.24-uWaterWarp.y),0.);float jac=uWaterWarp.x*.24*cos(p.y*.24-uWaterWarp.y);
 for(int i=0;i<4;i++){vec4 w=uWaterWaves[i];float q=dot(w.xy,wp)-w.w,s=sin(q),c=cos(q);
  o.x+=w.z*(s+uWaterChop*cos(2.*q));o.yz+=w.z*(c-2.*uWaterChop*sin(2.*q))*vec2(w.x,w.y+w.x*jac);o.w+=w.z*pow(max(0.,s),3.);}
 for(int i=0;i<6;i++){vec4 e=uWaterRings[i];if(e.w<=0.)continue;vec2 d=p-e.xy;float r=sqrt(dot(d,d)+.0004),x=r-e.z*2.1,env=exp(-x*x*.9-e.z*.62)*smoothstep(0.,.12,e.z)*(1.-smoothstep(4.9,5.5,e.z)),s=sin(x*5.8),c=cos(x*5.8);
  o.x+=e.w*s*env;o.yz+=e.w*env*(5.8*c-1.8*x*s)*d/r;}
 return o;
}
`};
window.HapaWaterShaders=(()=>{
 const common=`
precision highp float;precision highp int;
${HapaElementStyle.glsl}
uniform vec2 uResolution,uWaterFlow;
uniform vec3 uEye,uForward,uRight,uUp,uBody,uAccent,uHighlight,uShadow,uFog;
uniform mat4 uPV;uniform float uFov,uWaterLevel,uWaterLength,uWaterWind,uWaterLight,uWaterSwell;
uniform int uWaterKind;
const float PI=3.14159265359;
mat2 wrot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float wbox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(0.,max(q.x,max(q.y,q.z)));}
float wring(vec3 p,float r,float thick){return length(vec2(length(p.xy)-r,p.z))-thick;}
vec2 wmin(vec2 a,vec2 b){return a.x<b.x?a:b;}
vec3 wsun(){return normalize(uWaterKind==12?vec3(-.30,.46,-1.):vec3(-.38,.23,-1.));}
vec3 waterSky(vec3 dir){float h=clamp(dir.y,0.,1.),day=uWaterKind==12?.35:1.;
 vec3 horizon=uWaterKind==12?vec3(.021,.046,.085):uFog*.28+uHighlight*.14,zenith=uWaterKind==12?vec3(.003,.007,.021):vec3(.009,.022,.051)+uAccent*.016;
 vec3 c=mix(horizon,zenith,pow(h,.42));float sun=max(0.,dot(dir,wsun()));
 c+=uHighlight*(pow(sun,1200.)*2.8+pow(sun,30.)*.13)*(.45+.65*uWaterLight);
 float cl=sin(dir.x*10.+sin(dir.z*8.+.3))*sin(dir.z*15.-dir.x*5.);
 c+=uHighlight*smoothstep(.14,.62,cl)*.055*smoothstep(.02,.3,h)*(1.-smoothstep(.55,.9,h));
 return max(c,vec3(0.));}
`;
 const field=`#version 300 es
${common}
uniform int uWaterSteps,uReflectionPass;
layout(location=0)out vec4 outColor;layout(location=1)out vec4 outEmission;
vec2 architecture(vec3 p){vec2 h=vec2(1000.,0.);
 if(uWaterKind==14){
  // The inherited +Z passage stays open. Water is an independently drawn interface.
  vec3 q=p;q.z=mod(p.z+2.5,5.)-2.5;
  h=wmin(h,vec2(wring(q,4.4,.095),2.));
  q=p;q.x=abs(q.x)-4.8;h=wmin(h,vec2(wbox(q-vec3(0.,-.5,0.),vec3(.48,2.6,80.)),1.));
  h=wmin(h,vec2(abs(p.y-(uWaterLevel-2.5))-.1,3.));
  q=p;q.z=mod(p.z+3.,6.)-3.;q.x=abs(q.x)-3.82;
  h=wmin(h,vec2(wbox(q-vec3(0.,-.4,0.),vec3(.12,1.5,.12))-.03,2.));
  return h;
 }
 float bed=uWaterKind==12?uWaterLevel-1.1:uWaterLevel-4.5;
 h=vec2(p.y-bed,3.);
 if(uWaterKind==12){
  vec3 q=p;float r=length(p.xz);
  h=wmin(h,vec2(max(abs(r-9.25)-.9,abs(p.y+1.48)-.27),1.));
  h=wmin(h,vec2(max(length(p.xz-vec2(0.,-2.3))-1.12,abs(p.y+1.40)-.29),1.));
  h=wmin(h,vec2(wring(p-vec3(0.,1.15,-2.3),2.27,.085),2.));
  h=wmin(h,vec2(wring(p-vec3(0.,1.15,-2.53),2.47,.045),2.));
  for(int i=0;i<9;i++){float j=float(i),a=-1.42+j*.355;
   vec3 c=vec3(sin(a)*6.75,.35,-cos(a)*6.75-1.5),v=p-c;
   float ht=1.65+.40*cos(j*1.8);h=wmin(h,vec2(wbox(v,vec3(.28,ht,.33))-.07,1.));
   h=wmin(h,vec2(wbox(v-vec3(0.,ht+.11,0.),vec3(.40,.10,.44))-.035,2.));}
  // Five hanging rainglass tines define a visible musical focal point.
  for(int i=0;i<5;i++){float j=float(i)-2.,ht=.75+.22*cos(j);vec3 q=p-vec3(j*.34,.7,-2.26);
   h=wmin(h,vec2(wbox(q,vec3(.026,ht,.045)),2.));}
  h=wmin(h,vec2(length(p-vec3(0.,1.25,-2.20))-.14,4.));
 }else{
  // The old Tidal layout and open windward reach use the same water binding.
  for(int i=0;i<3;i++){float j=float(i);vec3 c=vec3((j-1.)*5.4,-2.10,-1.8-j*1.45),q=p-c;
   float d=max(length(q.xz)-(1.65+(.5-.5*cos(j*2.))*1.),abs(q.y)-.18);
   d=min(d,max(length(q.xz)-1.22,abs(q.y-.20)-.08));h=wmin(h,vec2(d,1.));}
  for(int i=0;i<7;i++){float j=float(i),ht=1.35+1.5*(.5+.5*sin(j*2.17));vec3 q=p-vec3(-19.+j*6.4,-1.5+ht*.5,-19.-3.*sin(j*1.7));h=wmin(h,vec2(wbox(q,vec3(.7,ht*.5,1.1))-.14,1.));}
  h=wmin(h,vec2(wring(p-vec3(0.,1.,-6.2),4.55,.065),2.));
  if(uWaterKind==13){vec3 q=p-vec3(0.,.8,-5.0);q.xy=wrot(.35+.04*uWaterSwell)*q.xy;
   h=wmin(h,vec2(wring(q,2.4,.09),2.));q.xz=wrot(.70)*q.xz;h=wmin(h,vec2(wring(q,2.18,.10),2.));
   h=wmin(h,vec2(length(p-vec3(0.,.8,-5.))-.21,4.));}
 }
 return h;
}
vec3 normalAt(vec3 p,float ep){vec2 e=vec2(ep,0.);return normalize(vec3(architecture(p+e.xyy).x-architecture(p-e.xyy).x,architecture(p+e.yxy).x-architecture(p-e.yxy).x,architecture(p+e.yyx).x-architecture(p-e.yyx).x));}
void main(){vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));
 float t=0.;bool skip=false;
 if(uReflectionPass==1){if(rd.y<=.0001)skip=true;else t=max(0.,(uWaterLevel+.018-uEye.y)/rd.y);}
 vec3 sky=waterSky(rd),col=sky,em=vec3(0.),p;bool hit=false;float mat=0.;
 if(!skip)for(int i=0;i<126;i++){if(i>=uWaterSteps)break;p=uEye+rd*t;vec2 d=architecture(p);if(d.x<max(.002,t*.0008)){hit=true;mat=d.y;break;}t+=max(.004,d.x*.80);if(t>125.)break;}
 if(hit){vec3 n=normalAt(p,max(.002,t*.0007)),sun=wsun(),V=-rd;float diffuse=max(0.,dot(n,sun)),rim=pow(clamp(1.-abs(dot(n,V)),0.,1.),3.);
  vec3 base=mat<1.5?mix(uBody*.36,uHighlight*.24,.6):mat<2.5?uHighlight*.50:mix(uHighlight*.23,uBody*.12,.58);
  if(mat>2.5&&mat<3.5){float seam=min(abs(sin(p.x*1.1)),abs(sin(p.z*1.1)));base*=.88+.12*smoothstep(.015,.06,seam);if(uWaterKind==12&&length(p.xz)>10.1)base=vec3(.013,.025,.037);}
  col=base*(.36+.67*diffuse)+uAccent*rim*.065;
  col+=uHighlight*pow(max(0.,dot(n,normalize(V+sun))),mat<2.5?70.:16.)*.18;
  if(mat>1.5&&mat<2.5)em=uAccent*.018;if(mat>3.5){col=uHighlight*.6;em=uHighlight*(1.1+.7*uWaterLight);}
  float haze=1.-exp(-max(0.,t-12.)*.018);col=mix(col,sky,haze);em*=1.-haze;
  vec4 clip=uPV*vec4(p,1.);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
 }else gl_FragDepth=1.;
 if(uElementBody==1){col=hit?vec3(.045):vec3(.008);em=vec3(0.);}
 outColor=vec4(max(vec3(0.),col+em),1.);outEmission=vec4(em,1.);
}`;
 const vertex=`#version 300 es
precision highp float;precision highp int;layout(location=0)in vec2 aUV;
uniform float uWaterEnhanced;uniform mat4 uPV;uniform float uWaterLevel,uWaterSpan,uWaterLength,uSheetSide,uWaterMeshStep;uniform int uWaterMode,uWaterKind;
${HapaWaterKernel.glsl}
out vec3 vPos;out vec2 vRest;out float vCrest;out vec3 vBaseNormal;
vec3 surface(vec2 uv){if(uWaterMode==0){vec2 p=uWaterKind==14?vec2((uv.x-.5)*uWaterSpan,-2.+uv.y*(uWaterLength+4.)):(uv-.5)*uWaterSpan;if(uWaterEnhanced>.5&&(uWaterKind==5||uWaterKind==13)){vec2 a=uv*2.-1.;p=sign(a)*a*a*uWaterSpan*.5;}vec4 w=waterField(p);return vec3(p.x,uWaterLevel+w.x,p.y);}
 vec2 p=vec2(uv.x*uWaterLength,uv.y*4.0);vec4 w=waterField(p);
 float taper=smoothstep(0.,.07,uv.x)*(1.-smoothstep(.93,1.,uv.x));
 return vec3(uSheetSide*(3.55+w.x*.9*taper),uWaterLevel+.10+uv.y*4.0,-.1+uv.x*(uWaterLength+.2));}
void main(){vec3 p=surface(aUV);vPos=p;
 vRest=uWaterMode==0?p.xz:vec2(aUV.x*uWaterLength,aUV.y*4.);
 vec4 w=waterField(vRest);vCrest=w.w;
 vBaseNormal=uWaterMode==0?normalize(vec3(-w.y,1.,-w.z)):normalize(cross(surface(aUV+vec2(.0003,0.))-p,surface(aUV+vec2(0.,.0003))-p));
 gl_Position=uPV*vec4(p,1.);
}`;
 const fragment=`#version 300 es
${common}
${HapaWaterKernel.glsl}
in vec3 vPos,vBaseNormal;in vec2 vRest;in float vCrest;
uniform sampler2D uWaterBackground,uWaterBackgroundDepth,uWaterReflection;
uniform vec2 uWaterCarry;uniform vec3 uWaterCarryTint;
uniform mat4 uWaterReflectPV;uniform float uWaterNear,uWaterFar,uWaterClarity,uWaterFoam,uWaterDye;uniform int uWaterReflections,uWaterMode;
layout(location=0)out vec4 outColor;layout(location=1)out vec4 outEmission;
float linearZ(float d){return 2.*uWaterNear*uWaterFar/(uWaterFar+uWaterNear-(d*2.-1.)*(uWaterFar-uWaterNear));}
void main(){
 if(uWaterKind==12&&length(vRest)>9.3&&uWaterMode==0)discard;
 vec4 w=waterField(vRest);vec3 n=normalize(vBaseNormal),view=normalize(uEye-vPos);if(dot(n,view)<0.)n=-n;
 if(uElementBody==1){vec3 normal=normalize(vBaseNormal);if(dot(normal,view)<0.)normal=-normal;float shade=.13+.70*max(0.,dot(normal,normalize(vec3(-.35,.85,.4))));outColor=vec4(vec3(shade),1.);outEmission=vec4(0.,0.,0.,1.);return;}
 // Fine capillary waves are shading-only; their footprint fades instead of adding unresolvable geometry.
 vec2 ph=vRest*vec2(19.,24.)+uWaterFlow*vec2(-9.,7.);float aa=max(length(dFdx(ph)),length(dFdy(ph))),footprintFade=1.-smoothstep(1.,3.3,aa);
 vec2 micro=vec2(cos(ph.x+sin(ph.y*.61)),cos(ph.y+sin(ph.x*.73)))*(.015+.095*uWaterWind)*footprintFade;
 if(uWaterMode==0)n=normalize(vec3(-w.y-micro.x,1.,-w.z-micro.y));else n=normalize(n+vec3(0.,micro.x,micro.y));
 if(dot(n,view)<0.)n=-n;
 vec2 uv=gl_FragCoord.xy/uResolution;float surfaceZ=dot(vPos-uEye,uForward),bedZ=linearZ(texture(uWaterBackgroundDepth,uv).r);
 vec2 refrUV=clamp(uv+n.xz*(.005+.012*(1.-uWaterClarity)),vec2(.001),vec2(.999));
 float trial=linearZ(texture(uWaterBackgroundDepth,refrUV).r);if(trial<surfaceZ+.015)refrUV=uv;
 if(uElementOn>.5){bedZ=linearZ(texture(uWaterBackgroundDepth,refrUV).r);}
 float thickness=uWaterMode==0?clamp((max(bedZ,surfaceZ)-surfaceZ)*.75,.02,12.):1.15;
 vec3 under=texture(uWaterBackground,refrUV).rgb;
 // Bounded Beer-Lambert-inspired absorption; scene units are authored, not calibrated ocean meters.
 vec3 absorption=vec3(.42,.095,.049)*mix(2.0,.55,uWaterClarity),trans=exp(-absorption*thickness);
 vec3 deep=vec3(.008,.052,.068)+uAccent*.042;
 if(uElementOn>.5){deep=vec3(.003,.022,.036)+uAccent*.019;trans=exp(-absorption*thickness*1.15);}
 vec3 transmitted=under*trans+deep*(1.-trans);
 float bend=sin(vRest.x*2.6+sin(vRest.y*2.8+uWaterFlow.y*2.)+uWaterFlow.x*1.5);
 float bend2=sin(vRest.y*3.2+sin(vRest.x*1.9-uWaterFlow.x)+uWaterFlow.y*2.3);
 float caustic=pow(max(0.,1.-abs(bend+bend2)*.6),9.)*(1.-smoothstep(2.,8.,thickness));
 if(uElementOn>.5){float receiver=step(surfaceZ+.025,bedZ)*(1.-step(.99999,texture(uWaterBackgroundDepth,refrUV).r));caustic=pow(clamp(length(w.yz)*1.7,0.,1.),3.)*receiver*uElementCaustics;}
 transmitted+=uHighlight*caustic*(uElementOn>.5?.065:(uWaterKind==12?.015:.045))*uWaterLight*trans;
 vec3 refl=waterSky(reflect(-view,n));
 if(uWaterReflections==1&&uWaterMode==0){vec4 rp=uWaterReflectPV*vec4(vPos.x,uWaterLevel,vPos.z,1.);vec2 ru=rp.xy/max(rp.w,.001)*.5+.5;
  ru+=n.xz*.018*(.4+uWaterWind);float border=smoothstep(0.,.045,min(min(ru.x,ru.y),min(1.-ru.x,1.-ru.y)));
  if(rp.w>0.&&border>0.)refl=mix(refl,texture(uWaterReflection,clamp(ru,.001,.999)).rgb,border);}
 float NoV=max(.001,dot(n,view)),fres=.02037+.97963*pow(clamp(1.-NoV,0.,1.),5.);
 vec3 c=mix(transmitted,refl,clamp(fres+(uWaterMode==1?.17:0.),0.,1.));
 // Broad coherent reflection ribbon rather than frame-random glitter.
 vec3 l=wsun(),halfV=normalize(l+view);float NoL=max(0.,dot(n,l)),NoH=max(0.,dot(n,halfV));
 float rough=.055+.16*uWaterWind,a=rough*rough,a2=a*a,den=NoH*NoH*(a2-1.)+1.;
 float D=a2/max(PI*den*den,.000001),G=NoV/(NoV*(1.-rough*.5)+rough*.5);
 float spec=min(3.8,D*.021*NoL*G/max(.16,4.*NoV));c+=uHighlight*spec*(.25+.80*uWaterLight);
 if(uElementOn>.5){float trough=clamp(-w.x/max(.08,uWaterSwell)+.15,0.,1.);c*=1.-.30*trough;}
 float foam=smoothstep(.035,.13,w.w)*smoothstep(.035,.17,length(w.yz))*uWaterFoam;
 float fleck=uElementOn>.5?.5+.5*sin(w.x*37.+w.y*9.+vRest.y*.7):.5+.5*sin(vRest.x*11.+sin(vRest.y*7.)+uWaterFlow.x*2.);foam*=smoothstep(.18,.64,fleck);
 // Foam is lit albedo, not emission. It must not turn into luminous night ink.
 c=mix(c,uHighlight*(.27+.40*NoL),clamp(foam,0.,.80));
 if(uWaterMode==1){float edge=1.-smoothstep(.0,.13,min(vRest.y,4.-vRest.y));c+=uHighlight*edge*.045;}
 float haze=1.-exp(-max(0.,length(vPos-uEye)-18.)*.018);c=mix(c,waterSky(vec3(0.,.01,-1.)),haze);
 float carryX=(uWaterMode==1?vRest.x:dot(vRest,vec2(.45,.65)))-mix(-8.,16.,uWaterCarry.x);
 c+=uWaterCarryTint*exp(-carryX*carryX*.7)*min(1.,uWaterCarry.y)*(.035+.065*fres);
 vec3 edgeLight=vec3(0.);
 if(uElementOn>.5){float crest=smoothstep(.09,.27,w.w)*smoothstep(.10,.33,length(w.yz));float glint=elementCore(1.-NoH,.025)*crest;edgeLight=(vec3(.11,.30,.34)*crest*.022+uHighlight*glint*.11)*uElementContour*uElementLight;c+=edgeLight;}
 outColor=vec4(max(c,vec3(0.)),1.);outEmission=vec4(edgeLight*.24,1.);
}`;
 return{field,vertex,fragment};
})();

HapaWaterShaders.dropVertex=`#version 300 es
precision highp float;layout(location=0)in vec2 aUV;uniform mat4 uPV;uniform vec3 uDrop,uRight,uUp;uniform float uDropAge;out vec2 vUV;
void main(){vUV=aUV;float width=.018+.006*uDropAge;vec3 p=uDrop+uRight*(aUV.x-.5)*width+vec3(0.,(aUV.y-.5)*(.09+.26*uDropAge),0.);gl_Position=uPV*vec4(p,1.);}`;
HapaWaterShaders.dropFragment=`#version 300 es
precision highp float;in vec2 vUV;uniform vec3 uHighlight;layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){vec2 p=vUV*2.-1.;float r=dot(p,p);if(r>1.)discard;color=vec4(uHighlight*(.35+.50*(1.-r)),1.);emission=vec4(0.,0.,0.,1.);}`;

