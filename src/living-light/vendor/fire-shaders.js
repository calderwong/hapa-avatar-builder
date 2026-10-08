
/* Original Fire Paint renderer: bounded emitter volumes, emission + absorption,
 * separate local lighting, heat distortion of a read-only background, finite sparks.
 */
'use strict';
window.HapaFireShaders=(()=>{
 const common=`precision highp float;precision highp int;
 uniform vec2 uResolution;uniform vec3 uEye,uForward,uRight,uUp;
 uniform mat4 uPV;uniform float uFov,uNear,uFar;
 uniform vec3 uBackground,uBody,uShadow,uAccent,uHighlight,uFog;
 uniform int uFireKind,uFireCount;uniform vec4 uFireEmitters[8];uniform float uFireOpening,uFireLength;
 ${HapaElementStyle.glsl}
 ${HapaFireKernel.glsl}
 `;
 const field=`#version 300 es
 ${common}
 uniform int uFireSteps;
 layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
 float fb(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
 float ft(vec3 p,vec2 t){return length(vec2(length(p.xz)-t.x,p.y))-t.y;}
 float cylinder(vec3 p,float rad,float h){vec2 d=vec2(length(p.xz)-rad,abs(p.y)-h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
 mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
 vec2 fireMap(vec3 p){float d=100.,id=1.;
  if(uFireKind==17){d=fb(p-vec3(0.,-2.1,uFireLength*.5),vec3(4.7,.17,uFireLength*.5+3.));
   for(int i=0;i<8;i++){if(i>=uFireCount)break;vec4 e=uFireEmitters[i];vec3 q=p-e.xyz;
    float plinth=cylinder(q-vec3(0.,-.50,0.),.67,.35),lip=ft(q-vec3(0.,-.04,0.),vec2(.54,.08));d=min(d,min(plinth,lip));}
   for(int i=0;i<6;i++){float z=1.0+float(i)*(uFireLength-2.)/5.;vec3 q=p-vec3(0.,.08,z);float rib=length(vec2(length(q.xy)-4.08,q.z))-.070;
    if(rib<d){d=rib;id=3.;}}
   float rail=length(vec2(abs(p.x)-4.0,p.y+1.4))-.065;if(rail<d){d=rail;id=3.;}
  }else if(uFireKind==16){d=cylinder(p-vec3(0.,-2.1,0.),9.6,.16);float dais=cylinder(p-vec3(0.,-1.7,-.5),2.7,.24);d=min(d,dais);
   for(int i=0;i<8;i++){float j=float(i),a=j*6.2831853/8.;vec3 column=vec3(cos(a)*6.5,0.,sin(a)*6.5-1.4);if(column.z>1.8&&abs(column.x)<3.4)continue;vec3 q=p-column;
    float col=fb(q-vec3(0.,.2,0.),vec3(.30,2.2,.42))-.07;d=min(d,col);}
   for(int i=0;i<5;i++){if(i>=uFireCount)break;vec4 e=uFireEmitters[i];float holder=cylinder(p-e.xyz-vec3(0.,-.30,0.),.74*e.w,.26);d=min(d,holder);}
   for(int i=0;i<3;i++){vec3 q=p-vec3(0.,1.05,-2.9-float(i)*.34);float a=uElementBody==1?0.:.1*sin(uFireMotion.y*.35+float(i))*(.35+uFireOpening);q.xy=rot(a)*q.xy;
    float hoop=length(vec2(length(q.xy)-(3.3+float(i)*.48),q.z))-.048;if(hoop<d){d=hoop;id=3.;}}
  }else{
   d=cylinder(p-vec3(0.,-2.02,0.),10.,.20);
   float ring=ft(p-vec3(0.,-1.67,0.),vec2(1.42,.22));d=min(d,ring);
   for(int i=0;i<12;i++){float a=float(i)*.5235988;vec3 q=p-vec3(cos(a)*1.45,-1.58,sin(a)*1.45);q.xz=rot(a)*q.xz;
    d=min(d,fb(q,vec3(.23,.17,.32))-.09);}
   for(int i=0;i<3;i++){float a=float(i)*2.094395+1.55;vec3 q=p-vec3(cos(a)*3.0,-1.40,sin(a)*3.-.15);q.xz=rot(-a)*q.xz;
    float seat=fb(q,vec3(.42,.18,.9))-.12;seat=min(seat,fb(q-vec3(0.,-.3,0.),vec3(.22,.17,.6)));d=min(d,seat);}
   // Heavy charred logs remain separate from the emissive flame volume.
   for(int i=0;i<3;i++){float a=float(i)*1.0472;vec3 q=p-vec3(0.,-1.48,0.);q.xz=rot(a)*q.xz;
    vec2 dd=vec2(length(q.yz)-.17,abs(q.x)-1.12);float log=min(max(dd.x,dd.y),0.)+length(max(dd,0.))-.02;if(log<d){d=log;id=4.;}}
   vec3 qr=p-vec3(0.,.25,-4.5);float arch=length(vec2(length(qr.xy)-3.7,qr.z))-.055;if(arch<d){d=arch;id=3.;}
   for(int i=0;i<5;i++){float j=float(i);vec3 q=p-vec3(-6.+j*3.,-.1,-5.8-abs(j-2.));d=min(d,fb(q,vec3(.26,1.75,.32))-.08);}
  }
  return vec2(d,id);
 }
 vec3 normalAt(vec3 p,float e){vec2 k=vec2(1.,-1.);return normalize(k.xyy*fireMap(p+k.xyy*e).x+k.yyx*fireMap(p+k.yyx*e).x+k.yxy*fireMap(p+k.yxy*e).x+k.xxx*fireMap(p+k.xxx*e).x);}
 vec3 sky(vec3 d){vec3 c=mix(uFog*.35,uBackground,smoothstep(-.03,.6,d.y));
  float cloud=pow(max(0.,.5+.5*sin(d.x*9.+sin(d.z*14.)+d.y*6.)),6.);c+=uAccent*.035*cloud;
  vec3 moon=normalize(vec3(-.6,.46,-1.));float g=max(0.,dot(d,moon));c+=uHighlight*(pow(g,1500.)*.55+pow(g,40.)*.015);return c;}
 void main(){vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp)),p=uEye;float t=0.,id=1.;bool hit=false;
  for(int i=0;i<148;i++){if(i>=uFireSteps)break;p=uEye+rd*t;vec2 v=fireMap(p);if(v.x<max(.0015,t*.0006)){hit=true;id=v.y;break;}t+=max(v.x*.8,.002);if(t>(uFireKind==17?85.:42.))break;}
  vec3 c=sky(rd),em=vec3(0.);
  if(hit){vec3 n=normalAt(p,max(.002,t*.0007)),l=normalize(vec3(-.5,.8,.2));float lam=max(0.,dot(n,l)),stone=.85+.15*ffNoise(p*5.5);
   vec3 base=mix(uShadow,uBody,.45)*stone;
   if(id>2.5&&id<3.5)base=uHighlight*.46;
   if(id>3.5){base=vec3(.028,.014,.012)*(.65+.35*ffNoise(p*18.));em=vec3(.42,.05,.004)*uFireShape.x*(.4+.6*ffNoise(p*11.));}
   c=base*(.35+.56*lam)+uAccent*.008;
   for(int i=0;i<8;i++){if(i>=uFireCount)break;vec4 e=uFireEmitters[i];vec3 delta=e.xyz+vec3(0.,.55*e.w,0.)-p;float d2=dot(delta,delta),at=1./(1.+d2*.45);vec3 ll=normalize(delta),halfV=normalize(ll-rd);
    float diffuse=max(0.,dot(n,ll)),spec=pow(max(0.,dot(n,halfV)),id>2.5&&id<3.5?32.:9.);
    vec3 warm=ffColor(.45)*(.25+uFireOptics.x)*uFireShape.x;
    c+=(base*diffuse*5.8+spec*.075)*warm*at;}
   float seams=1.-smoothstep(.015,.035,abs(fract(p.x*.32+floor(p.z*.33)*.5)-.5));if(n.y>.5)c*=1.-seams*.13;
   float haze=1.-exp(-t*(uFireKind==17?.018:.025));c=mix(c,sky(rd),haze);em*=1.-haze;
   vec4 clip=uPV*vec4(p,1.);gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.,1.);
  }else gl_FragDepth=1.;if(uElementBody==1){c=hit?vec3(.045):vec3(.008);em=vec3(0.);}
 color=vec4(max(c+em,0.),1.);emission=vec4(em,1.);
 }`;
 const volume=`#version 300 es
 ${common}
 uniform sampler2D uFireBase,uFireBaseEm,uFireDepth;uniform int uFireSamples;
 layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
 float linearDepth(float z){return 2.*uNear*uFar/(uFar+uNear-(z*2.-1.)*(uFar-uNear));}
 vec2 intersectBox(vec3 ro,vec3 rd,vec3 lo,vec3 hi){vec3 inv=vec3(rd.x>=0.?1.:-1.,rd.y>=0.?1.:-1.,rd.z>=0.?1.:-1.)/max(abs(rd),vec3(.000001));
  vec3 aa=(lo-ro)*inv,bb=(hi-ro)*inv,mi=min(aa,bb),ma=max(aa,bb);return vec2(max(max(mi.x,mi.y),mi.z),min(min(ma.x,ma.y),ma.z));}
 void main(){vec2 uv=gl_FragCoord.xy/uResolution,sp=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;vec3 rd=normalize(uForward+tan(uFov*.5)*(sp.x*uRight+sp.y*uUp));
  float bgZ=texture(uFireDepth,uv).r,stop=bgZ>.999999?140.:linearDepth(bgZ)/max(.03,dot(rd,uForward));
  float starts[8],ends[8];
  for(int j=0;j<8;j++){starts[j]=1e5;ends[j]=0.;if(j>=uFireCount)continue;vec4 e=uFireEmitters[j];float r=(1.4+length(uFireMotion.zw)*1.5)*e.w;
   vec2 seg=intersectBox(uEye,rd,e.xyz+vec3(-r,-.03,-r),e.xyz+vec3(r,uFireShape.y*1.6*e.w,r));seg.x=max(seg.x,.08);seg.y=min(seg.y,stop);
   if(seg.y>seg.x){starts[j]=seg.x;ends[j]=seg.y;}}
  vec3 radiance=vec3(0.),flameLight=vec3(0.);float tr=1.,heat=0.,heatFirst=1e5;vec2 distortion=vec2(0.);
  for(int b=0;b<8;b++){int id=0;float first=1e5;for(int j=0;j<8;j++){if(starts[j]<first){first=starts[j];id=j;}}
   if(first>=1e5||tr<.008)break;float end=ends[id];starts[id]=1e5;vec4 emitter=uFireEmitters[id];
   float dt=(end-first)/float(uFireSamples);
   for(int k=0;k<64;k++){if(k>=uFireSamples||tr<.008)break;float t=first+(float(k)+.5)*dt;vec3 p=(uEye+rd*t-emitter.xyz)/emitter.w;vec4 f=ffSample(p);
    if(uElementBody==1)f.zw=vec2(0.);float extinction=f.x*1.25+f.z*.9,tau=1.-exp(-extinction*dt/emitter.w);
    vec3 emit=ffColor(f.y)*(uElementOn>.5?(.38+uFireOptics.x*.40):(.62+uFireOptics.x*.65))*f.x/max(.0001,extinction);
    vec3 smokeCol=mix(uShadow,uAccent,.14)*.25*f.z/max(.0001,extinction);
    if(uElementOn>.5){float edge=ffS(.08,.25,f.x)*(1.-ffS(.45,.9,f.x))*ffS(.12,.62,f.y);emit+=vec3(.32,.08,.007)*edge*uElementContour;smokeCol*=.55;}
    if(uElementBody==1){emit=vec3(.86);smokeCol=vec3(0.);}
    radiance+=tr*tau*(emit+smokeCol);if(uElementBody!=1)flameLight+=tr*tau*emit;
    float hh=f.w*dt/emitter.w*tr;if(hh>.00001){heatFirst=min(heatFirst,t);distortion+=ffCurl(p*2.1,uFireMotion.y).xz*hh;heat+=hh;}
    tr*=1.-tau;
   }
  }
  vec2 offset=clamp(distortion*4.5,vec2(-3.),vec2(3.))/uResolution;
  vec2 shifted=clamp(uv+offset,vec2(.001),vec2(.999));float shiftedZ=texture(uFireDepth,shifted).r;
  // Reject foreground edges: never pull a nearer object through the thermal plume.
  float shiftStop=shiftedZ>.999999?140.:linearDepth(shiftedZ)/max(.03,dot(rd,uForward));
  if(heat<.00001||shiftStop<heatFirst+.04||abs(shiftStop-stop)>max(.8,stop*.10))shifted=uv;
  vec3 base=texture(uFireBase,shifted).rgb,baseEm=texture(uFireBaseEm,shifted).rgb;
  color=vec4(base*tr+radiance,1.);emission=vec4(baseEm*tr+flameLight*(uElementOn>.5?.22:.7),1.);
 }`;
 const sparkVertex=`#version 300 es
 precision highp float;layout(location=0)in vec4 aPosSize;layout(location=1)in vec4 aColor;
 uniform mat4 uPV;uniform float uSizeScale;out vec4 vColor;
 void main(){vec4 p=uPV*vec4(aPosSize.xyz,1.);gl_Position=p;gl_PointSize=clamp(aPosSize.w*uSizeScale/max(1.,p.w*.18),.6,6.);vColor=aColor;}`;
 const sparkFragment=`#version 300 es
 precision highp float;in vec4 vColor;layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
 void main(){float r=length(gl_PointCoord-.5),a=(1.-smoothstep(.08,.5,r))*vColor.a;if(a<.004)discard;vec3 c=vColor.rgb*a;color=vec4(c,a);emission=vec4(c*.65,a);}`;
 return{field,volume,sparkVertex,sparkFragment};
})();

