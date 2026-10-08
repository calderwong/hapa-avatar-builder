
/* Original Living Light shaders. Linear color/emission; one host output transform.
 * Fine texture is filtered material appearance, not microgeometry.
 * Air integrates local source illumination up to opaque eye depth; not GI/shadowed transport.
 */
'use strict';
window.HapaLumenShaders={stage:`#version 300 es
precision highp float;precision highp int;
uniform vec2 uResolution;uniform vec3 uEye,uForward,uRight,uUp,uBody,uAccent,uHighlight,uFog,uBackground;
uniform mat4 uPV;uniform float uFov,uTime,uElPhase,uElCharge,uElStroke,uElLight,uElLength,uLiDetail,uLiLight;
uniform int uElKind,uElCount,uElSteps;uniform vec3 uElA[8],uElB[8],uElColor;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
float boxD(vec3 p,vec3 b){vec3 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.);}
float cyl(vec3 p,float r,float h){vec2 d=vec2(length(p.xz)-r,abs(p.y)-h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float tor(vec3 p,float r,float w){return length(vec2(length(p.xy)-r,p.z))-w;}
float ringY(vec3 p,float r,float w){return length(vec2(length(p.xz)-r,p.y))-w;}
float cap(vec3 p,vec3 a,vec3 b,float r){vec3 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),.00001),0.,1.))-r;}
vec2 mn(vec2 a,vec2 b){return a.x<b.x?a:b;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float arch(vec3 p,float radius,float tube){return min(max(tor(p,radius,tube),-p.y),min(cap(p,vec3(-radius,-2.6,0),vec3(-radius,0,0),tube),cap(p,vec3(radius,-2.6,0),vec3(radius,0,0),tube)));}
vec2 field(vec3 p){
 bool tunnel=uElKind==26;float L=uElLength,center=tunnel?L*.5:-2.2,ext=tunnel?L*.5+4.:8.;
 vec2 r=vec2(boxD(p-vec3(0,-1.82,center),vec3(5.45,.16,ext)),1.);
 if(tunnel){
  // End stations stay clear of the portal plane so nothing blocks its final full-frame handoff.
  for(int i=0;i<7;i++){float z=2.+float(i)*(L-7.0)/6.;vec3 q=p-vec3(0,1.0,z);
   r=mn(r,vec2(arch(q,4.20,.18),2.));r=mn(r,vec2(arch(q-vec3(0,0,.08),4.00,.064),4.));
   r=mn(r,vec2(boxD(p-vec3(-4.25,-.55,z),vec3(.32,1.12,.27)),3.));r=mn(r,vec2(boxD(p-vec3(4.25,-.55,z),vec3(.32,1.12,.27)),3.));
  }
  // Actual luminous floor conduits, with an open two-unit center lane.
  r=mn(r,vec2(boxD(p-vec3(-2.10,-1.625,center),vec3(.035,.021,ext)),4.));
  r=mn(r,vec2(boxD(p-vec3(2.10,-1.625,center),vec3(.035,.021,ext)),4.));
 }else if(uElKind==24){
  for(int i=0;i<3;i++){vec3 q=p-vec3(0,1.0,-2.-float(i)*2.15);float rad=4.05+float(i)*.14;
   r=mn(r,vec2(arch(q,rad,.18),3.));r=mn(r,vec2(arch(q-vec3(0,0,.06),rad-.23,.055),4.));}
  r=mn(r,vec2(cyl(p-vec3(0,-1.58,-2.1),2.10,.10),2.));
  vec3 q=p-vec3(0,1.68,-2.1);q.xz=rot(.30)*q.xz;
  r=mn(r,vec2(tor(q,1.22,.083),2.));r=mn(r,vec2(tor(q-vec3(0,0,.05),1.07,.038),4.));
  q.yz=rot(1.0)*q.yz;r=mn(r,vec2(tor(q,1.55,.043),4.));
  r=mn(r,vec2(length(p-vec3(0,1.86,-2.1))-.22,4.));
 }else{
  for(int i=0;i<4;i++){float z=.5-float(i)*2.6;for(int j=0;j<2;j++){float side=j==0?-1.:1.;
   r=mn(r,vec2(boxD(p-vec3(side*3.48,.18,z),vec3(.34,1.9,.46))-.07,1.));
   r=mn(r,vec2(boxD(p-vec3(side*3.34,.2,z+.49),vec3(.045,1.52,.035)),4.));
   r=mn(r,vec2(boxD(p-vec3(side*3.55,-1.32,z),vec3(.57,.28,.68)),2.));}
   vec3 q=p-vec3(0,1.5,z);r=mn(r,vec2(arch(q,3.40,.085),2.));r=mn(r,vec2(arch(q-vec3(0,0,.06),3.21,.047),4.));
  }
  r=mn(r,vec2(cyl(p-vec3(0,-1.47,-4.4),1.28,.24),2.));
  vec3 q=p-vec3(0,1.35,-4.4);q.yz=rot(.50)*q.yz;r=mn(r,vec2(tor(q,1.45,.078),3.));r=mn(r,vec2(tor(q,1.22,.04),4.));
 }
 for(int i=0;i<8;i++){if(i>=uElCount)break;vec3 a=uElA[i],b=uElB[i];float h=(a.y+1.48)*.5;
  r=mn(r,vec2(cyl(p-vec3(a.x,a.y-h,a.z),.18,max(.1,h)),3.));r=mn(r,vec2(cyl(p-vec3(a.x,-1.45,a.z),.34,.20),2.));
  r=mn(r,vec2(ringY(p-(a-vec3(0,.18,0)),.28,.038),2.));r=mn(r,vec2(length(p-a)-.13,4.));r=mn(r,vec2(length(p-b)-.12,4.));
 }
 return r;
}
vec3 normalAt(vec3 p,float e){vec2 k=vec2(1,-1);return normalize(k.xyy*field(p+k.xyy*e).x+k.yyx*field(p+k.yyx*e).x+k.yxy*field(p+k.yxy*e).x+k.xxx*field(p+k.xxx*e).x);}
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 neon(float z){return mix(uElColor,mix(vec3(.58,.22,.88),uAccent,.3),.35+.25*sin(z*.45));}
void main(){vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));
 vec3 sky=mix(uBackground*.55,uFog*.42,1.-smoothstep(-.4,.6,rd.y));float t=0.;vec2 hit=vec2(100.,0.);vec3 p;bool found=false;
 for(int i=0;i<164;i++){if(i>=uElSteps+24)break;p=uEye+rd*t;hit=field(p);if(hit.x<max(.0015,t*.00042)){found=true;break;}t+=max(.002,hit.x*.78);if(t>110.)break;}
 vec3 c=sky,e=vec3(0.);if(found){
  vec3 n=normalAt(p,max(.002,t*.00050)),v=-rd,l=normalize(vec3(-.4,1.,.55));float diff=max(0.,dot(n,l)),nv=clamp(dot(n,v),0.,1.),rim=pow(1.-nv,3.);
  float footprint=max(.001,2.*t*tan(uFov*.5)/uResolution.y),fine=exp(-footprint*32.),fine2=exp(-footprint*100.);
  vec2 q=abs(n.y)>.65?p.xz:abs(n.x)>.65?p.zy:p.xy;
  float grain=noise(p*19.),brush=.5+.5*sin(q.y*120.+noise(p*5.)*5.);float seams=min(abs(sin(q.x*3.14159)),abs(sin(q.y*3.14159*.5)));
  float seam=1.-smoothstep(.018,.018+max(.03,footprint*6.),seams);
  vec3 base=uBody*.35;float rough=40.;
  if(hit.y<1.5){base=mix(uBody*.14,uBody*.25,noise(p*1.2));base*=1.+uLiDetail*((grain-.5)*.24*fine-seam*.28);rough=30.;}
  else if(hit.y<2.5){base=mix(vec3(.24,.13,.061),uHighlight*.38,.6);base*=1.+uLiDetail*(brush-.5)*.40*fine2;rough=90.-uLiDetail*24.*brush*fine2;}
  else if(hit.y<3.5){base=mix(vec3(.18,.23,.29),uBody,.50);base*=1.+uLiDetail*((grain-.5)*.10*fine-seam*.25);rough=62.;}
  c=base*(.25+.8*diff)+uHighlight*pow(max(0.,dot(n,normalize(l+v))),rough)*.19+uAccent*rim*.018;
  // Actual material-bound travel channels. No screen tint or duplicated tone mapping.
  if(hit.y<1.5){float lines=1.-smoothstep(.018,.018+footprint*2.8,abs(sin(q.x*4.8+sin(q.y*.9))));float move=pow(.5+.5*sin(q.y*2.1-uElPhase*1.6),6.);
   e+=neon(p.z)*lines*(.01+.06*move)*uLiDetail*uLiLight;
  }
  for(int i=0;i<8;i++){if(i>=uElCount)break;vec3 pos=mix(uElA[i],uElB[i],.55),d=pos-p;float d2=dot(d,d);float nd=max(0.,dot(n,normalize(d)));
   float spec=pow(max(0.,dot(n,normalize(normalize(d)+v))),rough);
   c+=neon(pos.z)*(nd*.20+spec*.08)*uLiLight*(.4+.5*uElCharge+.2*uElStroke)/(1.+d2*.38);
  }
  if(hit.y>3.5){vec3 ink=neon(p.z);float face=pow(nv,4.);c=ink*.12;e=mix(ink,mix(ink,vec3(.92,.97,1.),.6),face)*(.42+.84*face+.2*uElCharge)*uLiLight;}
  float fog=1.-exp(-t*.016);c=mix(c,sky,fog);e*=1.-fog;vec4 clip=uPV*vec4(p,1);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
 }else gl_FragDepth=1.;color=vec4(max(c+e,vec3(0)),1.);emission=vec4(max(e,vec3(0)),1.);
}`,
 volume:`#version 300 es
precision highp float;precision highp int;
uniform sampler2D uSceneColor,uSceneEmission,uSceneDepth;uniform vec2 uResolution;
uniform vec3 uEye,uForward,uRight,uUp,uElA[8],uElB[8],uElColor,uAccent;
uniform float uFov,uNear,uFar,uLiAir,uLiLight,uElPhase,uElCharge,uElStroke;uniform int uElCount,uLiSteps;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
float distanceSegment(vec3 p,vec3 a,vec3 b){vec3 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),.00001),0.,1.));}
void main(){vec2 uv=gl_FragCoord.xy/uResolution,ndc=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
 vec3 rd=normalize(uForward+tan(uFov*.5)*(ndc.x*uRight+ndc.y*uUp));float z=texture(uSceneDepth,uv).r;
 float eyeDepth=(2.*uNear*uFar)/(uFar+uNear-(2.*z-1.)*(uFar-uNear));float end=min(55.,eyeDepth/max(.01,dot(rd,uForward)));
 vec3 orig=texture(uSceneColor,uv).rgb,oldE=texture(uSceneEmission,uv).rgb,scatter=vec3(0.);float trans=1.,dt=end/float(uLiSteps);
 for(int j=0;j<40;j++){if(j>=uLiSteps)break;float t=(float(j)+.5)*dt;vec3 p=uEye+rd*t;float env=.64+.22*sin(p.y*1.7+p.x*.45+uElPhase*.07)*sin(p.z*.55-p.y*.30);
  float density=uLiAir*.014*env;vec3 incident=vec3(0.);
  for(int i=0;i<8;i++){if(i>=uElCount)break;float d=distanceSegment(p,uElA[i],uElB[i]);vec3 axis=normalize(mix(uElA[i],uElB[i],.5)-p);float ct=dot(axis,-rd),g=.28,den=max(.1,1.+g*g-2.*g*ct);float phase=(1.-g*g)/pow(den,1.5);
   vec3 tint=mix(uElColor,mix(vec3(.58,.22,.88),uAccent,.3),.30+.22*sin(uElA[i].z*.45));
   incident+=tint*(2.2/(.32+d*d*2.0)+2.0*exp(-d*d*5.))*phase*(.40+.40*uElCharge+.14*uElStroke)*uLiLight;
  }
  float tr=exp(-density*dt);scatter+=trans*(1.-tr)*incident;trans*=tr;
 }
 color=vec4(orig*trans+scatter,1.);emission=vec4(oldE*trans+scatter*.30,1.);
}`};

