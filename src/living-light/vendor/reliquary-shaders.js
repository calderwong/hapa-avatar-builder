
/* Atelier material logic adapted to shared linear color / emission / depth. */
window.HapaReliquaryShaders={vertex:`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition; layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV; layout(location=3) in vec2 aKind;
uniform vec2 uShift;uniform mat4 uPV,uActorModel;
uniform float uTime,uMotion,uYaw,uPitch,uBreath,uLattice,uHaloOpen,uAnswer,uCorona;
uniform float uMaskOpen,uBodyLift,uBodyRecoil,uTrimBend,uTrimPluck,uBodyPhase,uLacePhase,uCrownPhase,uCrownTilt,uJewelKick;
out vec3 vPosition,vNormal,vLocal;out vec2 vUV;flat out vec2 vKind;
mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
// OCTAVE_REGION_FUNCTIONS
vec3 deform(vec3 p){
 vec3 rest=p;
 if(aKind.x>8.5&&aKind.x<9.5)p.xy=vec2(0.,.07)+(p.xy-vec2(0.,.07))*(.84+.24*uCorona);
 if(aKind.y<3.5){
  if(aKind.y>.5&&aKind.y<1.5){
   vec2 q=vec2(p.x,p.y-.07);float r=min(1.6,length(q/vec2(.90,1.28))),a=atan(q.y,q.x);
   float edge=1.-clamp((r-.06)/1.1,0.,1.);
   float expand=1.+uMaskOpen*.085*(.35+.65*edge)+uTrimBend*.018*sin(uLacePhase-r*5.+a*2.)*edge;
   p.xy=vec2(0.,.07)+q*expand;
   p.z+=uMaskOpen*.065*edge+uTrimPluck*.6*edge*sin(r*8.+a*4.)+uBodyRecoil;
   float turn=uLattice*(1.-min(1.,r))+uTrimBend*.020*sin(uLacePhase*.7)*edge;
   vec2 v=p.xy-vec2(0.,.07);p.xy=vec2(0.,.07)+vec2(cos(turn)*v.x-sin(turn)*v.y,sin(turn)*v.x+cos(turn)*v.y);
  }else{
   float hem=clamp((-p.y+.25)/2.4,0.,1.);
   p.z+=uBreath*sin(uTime*.70+p.y*.70+p.x*1.2)+uBodyLift*(.4+.6*hem)*sin(uBodyPhase-p.y*1.5)+uBodyRecoil*(.3+.7*hem);
   p.y+=uBodyLift*.30*(1.-hem);p.x+=uBodyLift*.16*sin(uBodyPhase*.6+p.y)*(.25+.75*hem);
  }
 }
 if(aKind.y>4.5){
  vec3 center=vec3(0.,.18,-1.2),q=p-center;float sign=aKind.y<5.5?1.:-1.;
  mat3 H=ry(sign*(.08+uHaloOpen*.25+uCrownTilt))*rx(sign*(.10+.05*sin(uTime*.1)*uMotion))*rz(sign*uCrownPhase);
  q.xy*=1.+uAnswer*.10+.14*uRegionB.x;q.z+=uJewelKick;p=center+H*q;
 }
 if((aKind.x>3.5&&aKind.x<4.5)||(aKind.x>7.5&&aKind.x<8.5))p.z+=uRegionB.w*.014;
 return p+octaveOffset(rest,aKind.y);
}
void main(){
 vec3 p=deform(aPosition),N=normalize(aNormal);
 // Deformation normals come from the same map, retaining faceted gem normals
 // and avoiding the old invented normal offset unrelated to actual displacement.
 vec3 T=normalize(cross(abs(N.z)>.92?vec3(0,1,0):vec3(0,0,1),N)),B=cross(N,T);
 float eps=.0008;vec3 tx=deform(aPosition+T*eps)-p,bx=deform(aPosition+B*eps)-p;
 vec3 n=normalize(cross(tx,bx));
 vLocal=aPosition;
 mat3 rot=aKind.y>3.5?mat3(1.):ry(uYaw)*rx(uPitch);
 p=rot*p;n=rot*n;if(aKind.y<3.5)p.xy+=uShift;
 vec4 w=uActorModel*vec4(p,1.);vPosition=w.xyz;vNormal=normalize(mat3(uActorModel)*n);vUV=aUV;vKind=aKind;gl_Position=uPV*w;
}`,fragment:`#version 300 es
precision highp float;
in vec3 vPosition,vNormal,vLocal;in vec2 vUV;flat in vec2 vKind;
uniform vec2 uShift;uniform mat4 uActorModel;uniform vec3 uEye;uniform sampler2D uFabric,uDetail,uFiber;
uniform float uTime,uEmbroidery,uCore,uSheen,uGold,uPulse,uLacePhase,uVoicePhase,uCloudPhase,uCurrentGain;uniform vec3 uCorePosition;
layout(location=0) out vec4 color;layout(location=1) out vec4 emission;
uniform vec3 uGoldTone,uClothTone,uSkyTone;uniform float uGoldFlow,uNebula,uJewelAccent,uAnswer,uDensity,uRoomPulse,uSpotlight;uniform vec2 uFloorPulses[4],uWaves[4];
uniform vec4 uPhrasePacket;uniform vec3 uPhraseTint;
// OCTAVE_COLOR_UNIFORMS
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=mat2(.80,.60,-.60,.80)*p*2.03+1.7;a*=.5;}return s;}
vec3 Fresnel(vec3 F,float h){return F+(1.-F)*pow(1.-h,5.);}
vec3 lightBRDF(vec3 N,vec3 V,vec3 L,vec3 base,float metal,float rough,vec3 intensity){
 vec3 H=normalize(V+L);float nl=max(dot(N,L),0.),nv=max(dot(N,V),.001),nh=max(dot(N,H),0.),hv=max(dot(H,V),0.);
 float a=rough*rough,aa=a*a,d=nh*nh*(aa-1.)+1.;float D=aa/(3.14159265*d*d+.00001);
 float k=(rough+1.)*(rough+1.)/8.;float G=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));
 vec3 F=Fresnel(mix(vec3(.045),base,metal),hv);vec3 spec=D*G*F/(4.*nv*max(nl,.001)+.00001);
 return ((1.-F)*(1.-metal)*base/3.14159265+spec)*intensity*nl;
}
vec3 env(vec3 r,float rough){
 vec3 s=vec3(.022,.028,.055);
 s+=vec3(1.35,1.12,.79)*pow(max(dot(r,normalize(vec3(-.55,.76,1.))),0.),mix(38.,4.,rough));
 s+=vec3(.10,.66,1.16)*pow(max(dot(r,normalize(vec3(1.,.2,.6))),0.),mix(50.,6.,rough));
 s+=vec3(.28,.10,.60)*pow(max(dot(r,normalize(vec3(-1.,.1,-.45))),0.),mix(50.,8.,rough));
 s+=vec3(.70,.77,.92)*pow(max(dot(r,normalize(vec3(.1,-.7,1.))),0.),mix(42.,5.,rough));return s;
}
void main(){
 vec3 N=normalize(vNormal),V=normalize(uEye-vPosition);if(dot(N,V)<0.)N=-N;
 float kind=vKind.x,metal=0.,rough=.62;vec3 base=vec3(.02),em=vec3(0.);float sheen=0.;
 if(kind<.5){
  base=pow(texture(uFabric,vUV).rgb,vec3(2.2));float h=texture(uDetail,vUV).r*uEmbroidery;
  float wire=smoothstep(.23,.72,h);metal=wire*.97;rough=mix(.74,.34,wire);
  base=mix(mix(base*.55,length(base)*normalize(uClothTone+.001)*.57,.60),mix(vec3(.67,.365,.092),uGoldTone*.65,.35)*uGold,wire);sheen=(1.-wire)*uSheen;
  // Cotangent-space relief from atlas derivatives; no painted video or reference pixels.
  vec3 dpdx=dFdx(vPosition),dpdy=dFdy(vPosition);vec2 dudx=dFdx(vUV),dudy=dFdy(vUV);
  vec3 T=normalize(dpdx*dudy.y-dpdy*dudx.y),B=normalize(-dpdx*dudy.x+dpdy*dudx.x);
  vec2 texel=vec2(1./1536.);float hx=texture(uDetail,vUV+vec2(texel.x,0)).r-texture(uDetail,vUV-vec2(texel.x,0)).r;
  float hy=texture(uDetail,vUV+vec2(0,texel.y)).r-texture(uDetail,vUV-vec2(0,texel.y)).r;
  N=normalize(N-uEmbroidery*(hx*T+hy*B)*.30);
  em+=pow(max(texture(uFabric,vUV).b-.29,0.),3.)*vec3(.02,.06,.15);
  float fiber=texture(uFiber,vUV*2.).r;rough+=.13*(fiber-.5);
 }else if(kind<1.5){base=pow(texture(uFabric,vUV).rgb,vec3(2.2))*.19+vec3(.0008,.0005,.002);rough=.86;sheen=.22*uSheen;
 }else if(kind<2.5){
  vec2 q=vec2(vLocal.x*1.2,(vLocal.y-.07)*.86);float r=length(q),a=atan(q.y,q.x);
  float f=fbm(q*5.+vec2(.022*uTime+uCloudPhase*.08,-.011*uTime));
  base=mix(vec3(.0015,.006,.018),vec3(.019,.009,.050),smoothstep(.37,.77,f));
  base+=vec3(.003,.014,.027)*pow(f,3.)*2.;rough=.65;metal=.10;
  float vein=pow(max(0.,1.-abs(fbm(q*13.)-.5)*7.),4.);em+=vec3(.009,.024,.060)*vein+vec3(.010,.008,.029)*f;
  float arc=pow(max(0.,sin(a*22.+r*49.+.7*sin(a*7.+uTime*.23+uVoicePhase*.7))),10.)*exp(-r*r*32.);
  float cloud=exp(-r*r*17.)*(.3+fbm(q*18.+uTime*.02+uCloudPhase*.1))*(.75+uNebula);
  em+=(vec3(.018,.19,.44)*cloud+vec3(.015,.50,1.45)*arc*.46)*uCore;
  em+=vec3(.12,.004,.27)*exp(-pow(r-.29,2.)*37.)*f*.29;
  vec2 cell=floor(vUV*185.);float star=step(.996,hash(cell));vec2 c=fract(vUV*185.)-.5;float d=length(c);em+=vec3(.31,.52,.89)*star*(1.-smoothstep(.02,.15,d));
  float gild=smoothstep(.65,.86,texture(uDetail,vUV*1.65).r)*uEmbroidery*.33;
  base=mix(base,vec3(.48,.225,.046),gild);metal=mix(metal,.95,gild);rough=mix(rough,.31,gild);
 }else if(kind<3.5||kind>6.5&&kind<7.5){base=vec3(.78,.45,.135)*uGold;metal=.96;rough=kind>6.5?.42:.36;
 }else if(kind<4.5){float rr=length(vUV-.5);float ca=atan(vUV.y-.5,vUV.x-.5);float ct=.30+.70*pow(max(0.,sin(ca*12.+rr*17.)),4.);base=mix(vec3(.003,.025,.12),vec3(.012,.18,.45),ct);metal=.58;rough=.12;em=vec3(.003,.045,.20)*(1.-smoothstep(.0,.54,rr))*uCore;
 }else if(kind<5.5){base=vec3(.90,.51,.15);metal=.8;rough=.21;em=vec3(2.2,1.07,.15)*uCore*uPulse;
 }else if(kind<6.5){base=vec3(.002,.0024,.003);rough=.96;
 }else if(kind<8.5){base=vec3(.055,.012,.19);metal=.69;rough=.14;em=vec3(.035,.001,.12)*uCore;
 }else if(kind<9.5){base=vec3(.008,.28,.44);metal=.5;rough=.22;em=vec3(.025,.61,1.30)*uCore*uPulse;
 }else if(kind>10.5){base=mix(vec3(.58,.34,.14),uGoldTone*.60,.4);metal=.93;rough=.31;em=normalize(uSkyTone+.001)*(.028+.18*uAnswer);}
 else{base=vec3(1.);metal=0.;rough=.2;em=vec3(5.,3.1,1.04)*uCore*uPulse;}
 if(kind>2.5&&kind<3.5||kind>6.5&&kind<7.5){
  base=mix(base,uGoldTone*.82,.35);
  float r=length(vec2(vLocal.x,(vLocal.y-.07)*.80)),a=atan(vLocal.y-.07,vLocal.x);
  float flow=pow(max(0.,.5+.5*sin(r*12.-mix(uTime*.85,uLacePhase*3.,uCurrentGain)+a*3.)),14.);
  em+=mix(vec3(.75,.30,.06),uSkyTone*.75,.3)*flow*uGoldFlow;
  if(kind>6.5)base*=.65+.35*uDensity;
 }
 if(kind>3.5&&kind<4.5||kind>7.5&&kind<8.5){
  float sparkle=pow(max(0.,sin(vPosition.x*9.+vPosition.y*12.-uTime*1.4)),12.);
  em+=vec3(.08,.30,.68)*sparkle*uJewelAccent;
 }
 if(kind>1.5&&kind<2.5||kind>8.5&&kind<9.5)em=mix(em,dot(em,vec3(.2126,.7152,.0722))*normalize(uSkyTone+.001)*2.0,.52);
 if(kind>5.5&&kind<6.5&&vPosition.y< -2.1){
  float rr=length(vPosition.xz),pulse=0.;
  for(int i=0;i<4;i++){
   vec2 e=uFloorPulses[i];float age=e.x;float w=exp(-abs(rr-(.15+age*2.7))*36.)*(1.-smoothstep(1.1,3.,age));
   pulse+=w*e.y*step(0.,age);
   e=uWaves[i];age=e.x;w=exp(-abs(rr-(.20+age*2.8))*28.)*(1.-smoothstep(1.2,3.5,age));pulse+=w*e.y*step(0.,age);
  }
  em+=normalize(uGoldTone+.001)*pulse*.58*uRoomPulse;
 }
 // OCTAVE_DYE_PATTERN
 if(kind<4.5||kind>8.5&&kind<9.5){float path=kind>1.5?length(vec2(vLocal.x,vLocal.y-.07))*.25:(2.2-vLocal.y)*.19;float phase=path-uPhrasePacket.x*1.45;float line=exp(-phase*phase*145.);em+=uPhraseTint*line*uPhrasePacket.y*(kind<1.5?.24:.48);}
 vec3 radiance=vec3(0.);
 radiance+=lightBRDF(N,V,normalize(mat3(uActorModel)*vec3(-2.8,4.2,5.6)),base,metal,rough,vec3(6.8,5.6,4.1));
 radiance+=lightBRDF(N,V,normalize(mat3(uActorModel)*vec3(3.2,.7,3.2)),base,metal,rough,vec3(.65,1.48,2.90));
 radiance+=lightBRDF(N,V,normalize(mat3(uActorModel)*vec3(-3.,1.6,-.6)),base,metal,rough,vec3(.60,.32,1.28));
 radiance+=lightBRDF(N,V,normalize(mat3(uActorModel)*vec3(0.,-3.,4.)),base,metal,rough,vec3(.45,.34,.27));
 vec3 R=reflect(-V,N),F=Fresnel(mix(vec3(.04),base,metal),max(dot(N,V),0.));
 radiance+=env(R,rough)*F*.85+base*(1.-metal)*vec3(.15,.14,.24)+base*metal*.072;
 radiance+=sheen*pow(1.-max(dot(N,V),0.),3.)*vec3(.10,.033,.22)*(.35+.65*max(dot(N,normalize(mat3(uActorModel)*vec3(-1.,2.,3.))),0.));
 if(kind>1.5&&kind<2.5)radiance*=.19;
 if(kind<1.5)radiance*=.72;
 if(kind>.5&&kind<1.5)radiance*=.29;
 if(kind>5.5&&kind<6.5)radiance=max(radiance*.10,vec3(.007,.0065,.008));
 radiance+=em;
 // Low-amplitude core bounce, explicitly an authored point-light approximation.
 vec3 lp=uCorePosition;vec3 delta=lp-vPosition;float dist2=dot(delta,delta);
 if(kind<4.5)radiance+=base*vec3(.025,.11,.19)*uCore*max(dot(N,normalize(delta)),0.)/(.22+dist2)*.60;
 float fog=1.-exp(-max(0.,length(uEye-vPosition)-7.)*.043);
 radiance=mix(radiance,vec3(.010,.012,.019),fog);
 if(kind<1.5||kind>5.5&&kind<6.5){radiance*=1.-uSpotlight*.22;em*=1.-uSpotlight*.22;}
 color=vec4(max(radiance,vec3(0)),1.);emission=vec4(max(em,vec3(0))*(1.-fog),1.);
}`,focus:`#version 300 es
precision highp float;uniform sampler2D image,emissionImage,depthImage;uniform vec2 size;
uniform float nearPlane,farPlane,focusDistance,aperture;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
float linearDepth(vec2 uv){float z=texture(depthImage,uv).r*2.-1.;return 2.*nearPlane*farPlane/(farPlane+nearPlane-z*(farPlane-nearPlane));}
float coc(float z){return clamp((z-focusDistance)/max(.1,z)*aperture,-12.,12.);}
void main(){vec2 uv=gl_FragCoord.xy/size;float z=linearDepth(uv),r=abs(coc(z)),w=1.;vec3 c=texture(image,uv).rgb,e=texture(emissionImage,uv).rgb;
 if(r>.08){for(int i=0;i<24;i++){float fi=float(i)+.5,a=fi*2.39996323;vec2 off=vec2(cos(a),sin(a))*sqrt(fi/24.)*r/size;float zn=linearDepth(uv+off),cn=coc(zn);float wi=zn<z-.025&&abs(cn)<r*.5?.035:1.;c+=texture(image,uv+off).rgb*wi;e+=texture(emissionImage,uv+off).rgb*wi;w+=wi;}}
 color=vec4(c/w,1.);emission=vec4(e/w,1.);
}`};

