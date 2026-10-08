
/* Original Hapa simulation bindings. Translucent surface depth is peeled per pixel;
 * mixed media are integrated in common front-to-back order, not by emitter order. */
'use strict';
window.HapaDynamicsShaders=(()=>{
 const view=`precision highp float;precision highp int;
uniform vec2 uResolution;uniform vec3 uEye,uForward,uRight,uUp;uniform mat4 uPV;uniform float uFov,uNear,uFar;
vec3 ray(){vec2 uv=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;return normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));}
float rayDepth(float d,vec3 rd){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear))/max(.001,dot(rd,uForward));}
vec3 sky(vec3 d){vec3 c=mix(vec3(.022,.043,.065),vec3(.003,.009,.022),smoothstep(-.1,.85,d.y));float l=pow(max(0.,dot(d,normalize(vec3(-.5,.4,-.6)))),64.);return c+vec3(.36,.19,.08)*l;}
`;
 const obstacles=`uniform int uObstacleCount;uniform vec4 uObstacleCenter[10],uObstacleSize[10];
float box(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float torus(vec3 p,float r,float w){return length(vec2(length(p.xy)-r,p.z))-w;}
vec2 obstacle(vec3 p){float d=1e4;for(int i=0;i<10;i++){if(i>=uObstacleCount)break;vec3 q=p-uObstacleCenter[i].xyz;float t=uObstacleCenter[i].w,x=0.;if(t<.5)x=box(q,uObstacleSize[i].xyz);else if(t<1.5)x=length(q)-uObstacleSize[i].x;else{q.y-=clamp(q.y,-uObstacleSize[i].y,uObstacleSize[i].y);x=length(q)-uObstacleSize[i].x;}d=min(d,x);}return vec2(d,4.);}
`;
 const opaque=`#version 300 es
${view}${obstacles}
uniform float uHot;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
vec2 map(vec3 p){
 vec2 h=vec2(p.y+2.12,1.);float d;
 // Basin rim and octagonal steps; raised dry hearths intersect the shallow water.
 vec3 q=p-vec3(0,-1.83,-2.);d=max(abs(length(q.xz)-3.32)-.12,abs(q.y)-.21);if(d<h.x)h=vec2(d,2.);
 for(int i=0;i<2;i++){vec3 b=p-vec3(i==0?-1.5:1.5,-1.66,-2.);d=max(length(b.xz)-.56,abs(b.y)-.22);if(d<h.x)h=vec2(d,3.);float rim=length(vec2(length(b.xz)-.51,b.y-.19))-.065;if(rim<h.x)h=vec2(rim,2.);}
 for(int i=0;i<3;i++){float f=float(i);q=p-vec3(0,.17,-4.6-f*.32);d=torus(q,3.35+f*.21,.055);if(d<h.x)h=vec2(d,2.);}
 for(int i=0;i<8;i++){float a=float(i)*.7854;vec3 c=vec3(cos(a)*4.15,-1.0,sin(a)*4.15-2.);d=box(p-c,vec3(.16,1.1,.16));if(d<h.x)h=vec2(d,1.);}
 vec2 ob=obstacle(p);if(ob.x<h.x)h=ob;return h;
}
vec3 normal(vec3 p){vec2 e=vec2(.002,0);return normalize(vec3(map(p+e.xyy).x-map(p-e.xyy).x,map(p+e.yxy).x-map(p-e.yxy).x,map(p+e.yyx).x-map(p-e.yyx).x));}
void main(){vec3 rd=ray(),p;float dist=0.;vec2 hit;bool found=false;
 for(int i=0;i<112;i++){p=uEye+rd*dist;hit=map(p);if(hit.x<.002+dist*.0005){found=true;break;}dist+=max(.002,hit.x*.85);if(dist>45.)break;}
 vec3 c=sky(rd),em=vec3(0);if(found){vec3 n=normal(p),L=normalize(vec3(-3.,6.,4.)-p),V=-rd;float dif=max(0.,dot(n,L)),fres=pow(clamp(1.-dot(n,V),0.,1.),3.);
 vec3 base=hit.y>3.5?vec3(.11,.20,.23):hit.y>1.5&&hit.y<2.5?vec3(.45,.27,.10):vec3(.026,.047,.054);
 c=base*(.35+.85*dif)+vec3(.50,.34,.17)*pow(max(0.,dot(n,normalize(L+V))),48.)*.25+vec3(.08,.17,.20)*fres*.21;
 for(int i=0;i<2;i++){vec3 e=vec3(i==0?-1.5:1.5,-.55,-2.);vec3 delta=e-p;float a=.15*uHot/(.35+dot(delta,delta));c+=vec3(1.2,.26,.025)*a*max(.15,dot(n,normalize(delta)));}
 if(hit.y>1.5&&hit.y<2.5)em=vec3(.35,.16,.025)*.09;
 if(hit.y>3.5){float lines=pow(.5+.5*cos(p.y*13.),18.);em=vec3(.03,.23,.28)*lines*.24;}
 c=mix(c,sky(rd),1.-exp(-dist*.020));vec4 proj=uPV*vec4(p,1.);gl_FragDepth=proj.z/proj.w*.5+.5;
 }else gl_FragDepth=1.;color=vec4(c+em,1);emission=vec4(em,1);
}`;
 const layerVertex=`#version 300 es
precision highp float;precision highp int;layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aNormal;layout(location=2)in vec4 aColor;
uniform mat4 uPV;out vec3 vPosition,vNormal;out vec4 vColor;
void main(){vPosition=aPosition;vNormal=aNormal;vColor=aColor;gl_Position=uPV*vec4(aPosition,1.);}`;
 const layerFragment=`#version 300 es
${view}
in vec3 vPosition,vNormal;in vec4 vColor;uniform sampler2D uPrevious,uOpaqueDepth;uniform int uLayer;uniform float uTime;
layout(location=0)out vec4 color;layout(location=1)out vec4 metadata;
void main(){vec2 uv=gl_FragCoord.xy/uResolution;float z=gl_FragCoord.z;if(z>=texture(uOpaqueDepth,uv).r-.0000001)discard;
 if(uLayer>0&&z<=texture(uPrevious,uv).r+.00000035)discard;
 vec3 N=normalize(vNormal);if(!gl_FrontFacing)N=-N;vec3 V=normalize(uEye-vPosition);float fres=pow(clamp(1.-abs(dot(N,V)),0.,1.),5.);
 float alpha=vColor.a;vec3 c=vColor.rgb;
 if(alpha>.25){vec3 R=reflect(-V,N);float spec=pow(max(0.,dot(R,normalize(vec3(-.5,.45,-.6)))),64.);c=c*.36+sky(R)*(.65+fres*.75)+vec3(.55,.36,.17)*spec;alpha=clamp(alpha+fres*.32,0.,.85);}
 color=vec4(c*alpha,alpha);metadata=vec4(length(vPosition-uEye),0.,0.,1.);
}`;
 const composite=`#version 300 es
${view}
precision highp sampler3D;precision highp sampler2DArray;
uniform sampler2D uBase,uBaseEmission,uDepth;uniform sampler3D uGrid,uMaterial;uniform sampler2DArray uLayers,uLayerData;
uniform vec3 uOrigin,uExtent,uGridSize;uniform float uVolume,uPigment;uniform int uLayerCount,uMode,uOrder;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
vec3 heatColor(float h){vec3 red=vec3(1.8,.10,.005),orange=vec3(3.6,.55,.025),gold=vec3(4.0,1.5,.16);return h<2.2?mix(red,orange,clamp((h-1.05)/1.15,0.,1.)):mix(orange,gold,clamp((h-2.2)/2.,0.,1.));}
void sampleMedium(vec3 p,out vec3 source,out float sigma,out vec3 glow){
 vec3 uv=(p-uOrigin)/uExtent;source=vec3(0);sigma=0.;glow=vec3(0);if(any(lessThan(uv,vec3(0)))||any(greaterThan(uv,vec3(1))))return;
 vec4 g=texture(uGrid,uv),m=texture(uMaterial,uv);if(m.w>.5)return;
 float soot=max(g.y,0.),mist=max(g.z,0.),heat=max(g.x,0.),reaction=max(g.w,0.);
 // Small artistic fine structure modulates the transported reacting field; it cannot create heat/fuel.
 float flame=(.45+.55*smoothstep(.15,.75,.5+.5*sin(p.y*10.+sin(p.x*9.+p.z*7.))))*smoothstep(.92,1.9,heat)*(min(reaction,1.2)*.85+.10*smoothstep(1.3,2.2,heat));
 float fog=mist*16.0,sm=soot*1.0,ink=m.y*.007*uPigment;
 sigma=(sm+fog+flame*.55+ink)*uVolume;
 glow=heatColor(heat)*flame*1.5*uVolume;
 source=(vec3(.09,.13,.16)*sm+vec3(.50,.62,.65)*fog+vec3(.02,.28,.33)*ink)*uVolume+glow;
 if(uMode==1){sigma=(heat*.18+soot*.1)*uVolume;source=heatColor(heat)*sigma*.7;glow=source*.15;}
 if(uMode==2){sigma=mist*16.*uVolume;source=vec3(.58,.75,.82)*sigma;glow=vec3(0);}
}
void main(){vec2 uv=gl_FragCoord.xy/uResolution;vec3 rd=ray();float depth=texture(uDepth,uv).r,maxT=depth<.999999?rayDepth(depth,rd):60.;
 // Ray-box interval; the cursor also consumes transparent sheets outside the gas domain.
 vec3 inv=mix(vec3(-1.),vec3(1.),greaterThanEqual(rd,vec3(0)))/max(abs(rd),vec3(.00001)),a=(uOrigin-uEye)*inv,b=(uOrigin+uExtent-uEye)*inv;
 vec3 lo=min(a,b),hi=max(a,b);float start=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(maxT,min(hi.x,min(hi.y,hi.z)));
 vec3 acc=vec3(0),em=vec3(0);float trans=1.;float ds=max(.024,(end-start)/100.);int layer=0;
 for(int step=0;step<116;step++){
  float at=start+(float(step)+.5)*ds;if(at>end||end<=start)break;
  if(uOrder==1)for(int j=0;j<6;j++){if(layer>=uLayerCount)break;vec4 meta=texture(uLayerData,vec3(uv,float(layer)));if(meta.a<.5||meta.r>at)break;vec4 c=texture(uLayers,vec3(uv,float(layer)));acc+=trans*c.rgb;trans*=1.-c.a;layer++;}
  vec3 src,gl;float sigma;sampleMedium(uEye+rd*at,src,sigma,gl);
  float opacity=1.-exp(-sigma*ds),weight=sigma>.00001?opacity/sigma:ds;acc+=trans*src*weight;em+=trans*gl*weight;trans*=1.-opacity;
 }
 for(int j=0;j<6;j++){if(layer>=uLayerCount)break;vec4 meta=texture(uLayerData,vec3(uv,float(layer)));if(meta.a<.5)break;vec4 c=texture(uLayers,vec3(uv,float(layer)));acc+=trans*c.rgb;trans*=1.-c.a;layer++;}
 color=vec4(max(vec3(0.),acc+trans*texture(uBase,uv).rgb),1.);emission=vec4(max(vec3(0),em+trans*texture(uBaseEmission,uv).rgb),1.);
}`;
 return{opaque,layerVertex,layerFragment,composite};
})();

