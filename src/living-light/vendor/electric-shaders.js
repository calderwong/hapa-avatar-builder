
/* Original Electricity architecture and luminous 3D channel rendering. MIT-scoped.
 * Opaque scene depth remains authoritative. Channels are endpoint-pinned paths extruded
 * into connected view-facing strips; no reference video or downloaded lightning texture.
 */
'use strict';
window.HapaElectricShaders={
 stage:`#version 300 es
precision highp float;precision highp int;
uniform vec2 uResolution;uniform vec3 uEye,uForward,uRight,uUp,uBody,uAccent,uHighlight,uFog,uBackground;
uniform mat4 uPV;uniform float uFov,uTime,uElPhase,uElCharge,uElStroke,uElLight,uElLength,uLiDetail;uniform int uElKind,uElCount,uElSteps;
uniform vec3 uElA[8],uElB[8],uElColor;layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
float bx(vec3 p,vec3 b){vec3 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.);}
float cy(vec3 p,float r,float h){vec2 d=vec2(length(p.xz)-r,abs(p.y)-h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float ty(vec3 p,vec2 r){return length(vec2(length(p.xz)-r.x,p.y))-r.y;}
float tz(vec3 p,vec2 r){return length(vec2(length(p.xy)-r.x,p.z))-r.y;}
mat2 rt(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec2 choose(vec2 a,vec2 b){return a.x<b.x?a:b;}
vec2 field(vec3 p){
 vec2 r=vec2(100.,1.);float floorZ=uElKind==23?uElLength*.5:-1.6,extent=uElKind==23?uElLength*.5+6.:7.2;
 r=choose(r,vec2(bx(p-vec3(0,-1.84,floorZ),vec3(6.9,.15,extent)),1.));
 if(uElKind!=23){r=choose(r,vec2(cy(p-vec3(0,-1.63,-1.7),4.55,.12),1.));r=choose(r,vec2(cy(p-vec3(0,-1.46,-1.7),1.20,.12),2.));
  vec3 q=p-vec3(0,1.15,-4.45);r=choose(r,vec2(tz(q,vec2(4.15,.085)),2.));r=choose(r,vec2(tz(q-vec3(0,0,-.35),vec2(4.48,.04)),2.));
 }
 for(int i=0;i<8;i++){if(i>=uElCount)break;vec3 a=uElA[i],b=uElB[i];float h=(a.y+1.45)*.5;vec3 q=p-vec3(a.x,a.y-h,a.z);
  r=choose(r,vec2(cy(q,.24,max(.12,h)),3.));r=choose(r,vec2(cy(p-vec3(a.x,-1.34,a.z),.49,.16),2.));
  r=choose(r,vec2(length(p-a)-.18,4.));r=choose(r,vec2(ty(p-(a-vec3(0,.30,0)),vec2(.37,.067)),2.));
  float segment=.24;vec3 d=q;d.y=mod(d.y+.12,segment)-.12;float stack=max(ty(d,vec2(.295,.042)),abs(q.y)-max(.10,h-.18));r=choose(r,vec2(stack,3.));
  if(uElKind!=21){r=choose(r,vec2(length(p-b)-.16,4.));r=choose(r,vec2(ty(p-b,vec2(.30,.046)),2.));}
 }
 if(uElKind==21){vec3 q=p-vec3(0,2.1,-1.7);r=choose(r,vec2(length(q)-.38,4.));q.xz=rt(uElPhase*.09)*q.xz;r=choose(r,vec2(tz(q,vec2(.85,.034)),2.));q.yz=rt(.92)*q.yz;r=choose(r,vec2(tz(q,vec2(1.06,.045)),2.));}
 if(uElKind==22){r=choose(r,vec2(bx(p-vec3(0,-1.08,-.9),vec3(3.22,.13,.45)),2.));
  float arch=length(vec2(p.x*.84,p.y-.15))-2.90;r=choose(r,vec2(max(abs(arch)-.07,abs(p.z+1.4)-.065),2.));}
 if(uElKind==23){for(int i=0;i<6;i++){float z=1.2+float(i)*(uElLength-2.4)/5.;vec3 q=p-vec3(0,.3,z);float arch=tz(q,vec2(4.05,.06));r=choose(r,vec2(arch,2.));}}
 return r;
}
vec3 normalAt(vec3 p,float e){vec2 k=vec2(1,-1);return normalize(k.xyy*field(p+k.xyy*e).x+k.yyx*field(p+k.yyx*e).x+k.yxy*field(p+k.yxy*e).x+k.xxx*field(p+k.xxx*e).x);}
void main(){vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));
 vec3 sky=mix(uBackground,uFog*.65,(1.-smoothstep(-.35,.6,rd.y)));float t=0.;vec2 hit;vec3 p;bool found=false;
 for(int i=0;i<144;i++){if(i>=uElSteps)break;p=uEye+rd*t;hit=field(p);if(hit.x<max(.002,t*.00055)){found=true;break;}t+=max(.003,hit.x*.86);if(t>95.)break;}
 vec3 c=sky,e=vec3(0);if(found){vec3 n=normalAt(p,max(.0025,t*.0006)),l=normalize(vec3(-.6,1.,.5)),v=-rd;float diff=max(0.,dot(n,l)),fres=pow(clamp(1.-abs(dot(n,v)),0.,1.),3.);
  vec3 base=uBody*.45;if(hit.y>2.5&&hit.y<3.5)base=mix(vec3(.40,.49,.51),uBody,.30);if(hit.y>1.5&&hit.y<2.5)base=uHighlight*.58;
  float footprint=max(.001,2.*t*tan(uFov*.5)/uResolution.y),fine=exp(-footprint*60.);vec2 surf=abs(n.y)>.7?p.xz:abs(n.x)>.7?p.zy:p.xy;
  float brush=.5+.5*sin(surf.y*120.+sin(surf.x*9.)*2.);float seam=1.-smoothstep(.015,.015+footprint*4.,min(abs(sin(surf.x*3.14159)),abs(sin(surf.y*6.28318))));
  if(hit.y<3.5)base*=1.+uLiDetail*((brush-.5)*fine*(hit.y<2.5?.19:.07)-.12*seam);
  float rough=hit.y>2.5?20.:54.;c=base*(.22+.71*diff)+uAccent*fres*.06+uHighlight*pow(max(0.,dot(n,normalize(l+v))),rough)*.26;
  float radius=length(p.xz-vec2(0,-1.7)),theta=atan(p.z+1.7,p.x),spacing=abs(sin(radius*5.2));float aa=max(.035,fwidth(radius*5.2));float line=1.-smoothstep(.03,.03+aa,spacing);
  float spoke=pow(abs(cos(theta*6.)),38.);float run=.5+.5*sin(radius*5.-uElPhase*1.3);float circuit=(line*.25+spoke*.16)*(1.-smoothstep(5.2,6.5,radius));
  if(hit.y<1.5){c=base*(.11+.31*diff);e+=uElColor*circuit*(.09+.23*uElCharge+uElStroke*.1)*uElLight;}
  for(int i=0;i<8;i++){if(i>=uElCount)break;vec3 pos=mix(uElA[i],uElB[i],.55),delta=pos-p;float dis=dot(delta,delta);c+=uElColor*(.018+.09*uElCharge+.06*uElStroke)*max(0.,dot(n,normalize(delta)))/(1.+dis*.48)*uElLight;}
  if(hit.y>3.5){c=uHighlight*.22;e=uElColor*(.35+.65*uElCharge+.30*uElStroke)*uElLight;}
  float fog=1.-exp(-t*.024);c=mix(c,sky,fog);e*=1.-fog;
  vec4 clip=uPV*vec4(p,1);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
 }else gl_FragDepth=1.;color=vec4(c+e,1.);emission=vec4(e,1.);
}`,
 arcVertex:`#version 300 es
precision highp float;layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aTangent;layout(location=2)in vec2 aUV;layout(location=3)in vec4 aControl;layout(location=4)in vec2 aMeta;
uniform mat4 uPV;uniform vec3 uEye;uniform float uHeight,uFov;
out vec2 vUV;out vec4 vControl;out vec2 vMeta;out float vFog;
void main(){vec3 v=uEye-aPosition;vec3 side=cross(normalize(aTangent),normalize(v));if(dot(side,side)<.00001)side=vec3(1,0,0);side=normalize(side);
 float projected=2.*length(v)*tan(uFov*.5)/uHeight;float width=max(aControl.y,projected*.80);
 vec3 p=aPosition+side*aUV.y*width;gl_Position=uPV*vec4(p,1);vUV=aUV;vControl=aControl;vMeta=aMeta;vFog=exp(-length(v)*.023);
}`,
 arcFragment:`#version 300 es
precision highp float;in vec2 vUV;in vec4 vControl;in vec2 vMeta;in float vFog;
uniform vec3 uElColor;uniform float uElPhase,uElLight;layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
void main(){float x=abs(vUV.y),aa=max(.02,fwidth(x));if(x>1.)discard;
 float core=1.-smoothstep(.05,.18+aa,x),halo=exp(-x*x*5.5)*(1.-smoothstep(.72,1.,x));
 float tip=1.-smoothstep(vMeta.y-.035,vMeta.y+.025,vUV.x),taper=vMeta.x>.5?1.-smoothstep(.55,1.,vUV.x):1.;
 float traveling=exp(-(vUV.x-vControl.w)*(vUV.x-vControl.w)*160.)*vControl.z;float current=.66+.34*sin(vUV.x*32.-uElPhase*2.7);
 vec3 hot=mix(vec3(.9,.96,1.),uElColor,.15),tint=mix(uElColor,vec3(.51,.22,1.),min(.3,vMeta.x*.09));
 vec3 e=(hot*core*2.20+tint*halo*.83)*(vControl.x*(.75+.25*current)+traveling*.70)*taper*tip*vFog*(.30+.85*uElLight);
 color=vec4(e,0.);emission=vec4(e*.72,0.);
}`
};
// Electric embroidery is material-only on the six existing free streamers.
(()=>{let s=HapaOctaveShaders.silkFragment;const anchor='float fog=exp(-max(0.,length(vPos-uEye)-3.)*.037);';if(!s.includes(anchor))throw Error('Electric streamer anchor missing');
 s=s.replace('uniform float uLane,uDye;', 'uniform float uLane,uDye;uniform float uElCoat,uElCoatPhase;uniform vec3 uElCoatColor;');
 s=s.replace(anchor,`if(uElCoat>0.){float edgeLine=abs(vUV.y-.5-.20*sin(vUV.x*18.+uLane+sin(vUV.x*43.)));float aa=max(.008,fwidth(edgeLine));float wire=1.-smoothstep(.018,.018+aa,edgeLine);float pulse=pow(.5+.5*sin(vUV.x*27.-uElCoatPhase),8.);e+=uElCoatColor*wire*(.10+.80*pulse)*uElCoat;}\n`+anchor);HapaOctaveShaders.silkFragment=s;
})();

