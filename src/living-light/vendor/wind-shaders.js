
/* Original Wind Paint bindings. Source-time field, real geometry ribbons and pressure fronts.
 * Wind changes are downstream of baseline packets. No runtime PDE or cross-portal physics.
 */
'use strict';
(()=>{
 const W=HapaWindKernel.glsl,old=HapaWaterKernel.glsl;
 const joint=old.replace('vec4 waterField(vec2 p)','vec4 baseWaterField(vec2 p)')+W+`
 uniform float uWindWaterGain,uWindMemory;
 vec4 waterField(vec2 p){vec4 a=baseWaterField(p);if(uWindWaterGain>0.){vec3 w=windWater(p,uWindWaterGain,uWindMemory);a.xyz+=w;}return a;}
 `;
 for(const key of ['vertex','fragment']){if(!HapaWaterShaders[key].includes(old))throw Error('Water field hook missing: '+key);HapaWaterShaders[key]=HapaWaterShaders[key].replace(old,joint);}
 // Confluence is an authored new basin and brazier ensemble, not a replacement of old shores.
 const architecture=`
 if(uWaterKind==18||uWaterKind==20){
  h=vec2(p.y-(uWaterLevel-1.6),3.);
  if(uWaterKind==18){
   float r=length(p.xz-vec2(0.,-2.));h=wmin(h,vec2(max(abs(r-8.0)-.55,abs(p.y+1.2)-.30),1.));
   for(int i=0;i<3;i++){vec3 c=i==0?vec3(-3.,-.78,-1.8):i==1?vec3(3.,-.78,-1.8):vec3(0.,-.72,-5.1);vec3 q=p-c;
    h=wmin(h,vec2(max(length(q.xz)-.87,abs(q.y+.64)-.62),1.));
    h=wmin(h,vec2(max(abs(length(q.xz)-.79)-.10,abs(q.y+.04)-.16),2.));
    h=wmin(h,vec2(wring(q-vec3(0.,1.15,-.53),1.75,.036),2.));
   }
   for(int i=0;i<9;i++){float a=-1.5+float(i)*.375;vec3 c=vec3(sin(a)*7.,.4,-cos(a)*7.-2.);vec3 q=p-c;
    float ht=1.15+.6*sin(float(i)*1.7);h=wmin(h,vec2(wbox(q,vec3(.085,ht,.09))-.025,2.));}
  }else{
   vec3 q=p;q.z=mod(p.z+2.75,5.5)-2.75;h=wmin(h,vec2(wring(q-vec3(0.,.5,0.),4.55,.066),2.));
   for(int i=0;i<4;i++)for(int j=0;j<2;j++){vec3 c=vec3(j==0?-3.40:3.40,-.70,3.5+float(i)*(uWaterLength-7.)/3.);vec3 q=p-c;
    h=wmin(h,vec2(max(length(q.xz)-.76,abs(q.y+.68)-.66),1.));
    h=wmin(h,vec2(max(abs(length(q.xz)-.68)-.10,abs(q.y+.05)-.15),2.));}
   q=p;q.x=abs(q.x)-4.7;h=wmin(h,vec2(wbox(q-vec3(0.,-1.1,0.),vec3(.14,.34,80.)),1.));
  }return h;
 }
 `;
 HapaWaterShaders.field=HapaWaterShaders.field.replace('vec2 architecture(vec3 p){vec2 h=vec2(1000.,0.);','vec2 architecture(vec3 p){vec2 h=vec2(1000.,0.);'+architecture);
 HapaWaterShaders.vertex=HapaWaterShaders.vertex.replace('uWaterKind==14?vec2','(uWaterKind==14||uWaterKind==20)?vec2');
 // Dawn/silver atmosphere; the Fire layer itself supplies the stronger warm accents.
 for(const key of ['field','fragment'])HapaWaterShaders[key]=HapaWaterShaders[key].replace('uWaterKind==12?.35:1.','(uWaterKind==12||uWaterKind==18)?.35:1.');
 // Confluence's restrained twilight separates fire, reflective water and painted air.
 for(const key of ['field','fragment']){
  HapaWaterShaders[key]=HapaWaterShaders[key].replace('vec3 c=mix(horizon,zenith,pow(h,.42));',`if(uWaterKind==18||uWaterKind==20){horizon=vec3(.017,.038,.073);zenith=vec3(.002,.008,.027);}
  vec3 c=mix(horizon,zenith,pow(h,.42));`);
  HapaWaterShaders[key]=HapaWaterShaders[key].replace('return max(c,vec3(0.));}',`if(uWaterKind==18||uWaterKind==20)c=mix(c,c*.20+vec3(.006,.013,.025),.67);return max(c,vec3(0.));}`);
 }
 HapaWaterShaders.fragment=HapaWaterShaders.fragment.replace('if(uWaterKind==12&&length(vRest)>9.3&&uWaterMode==0)discard;',
 'if(uWaterKind==12&&length(vRest)>9.3&&uWaterMode==0)discard;if(uWaterKind==18&&length(vRest-vec2(0.,-2.))>7.46&&uWaterMode==0)discard;');
 // Shader-side flame deformation matches HapaWind.sampleFire exactly in emitter-local space.
 const flame=`
 ${W}
 uniform float uWindFireGain;
 vec4 windFlame(vec3 p,vec4 e){
  float off=dot(e.xyz,vec3(.73,.31,1.17));if(uWindFireGain<=0.)return ffSampleOffset(p,off);
  vec4 w=windField(e.xyz+p*e.w);float yn=clamp(p.y/max(.2,uFireShape.y),0.,1.2);
  vec3 q=p;q.xz-=clamp(w.xz*.38*uWindFireGain*yn*yn,vec2(-1.3),vec2(1.3));
  q.y*=1.+clamp(w.w,-.5,1.)*.28*uWindFireGain;
  return ffSampleOffset(q,off);
 }
 `;
 HapaFireShaders.volume=HapaFireShaders.volume.replace(' void main(){vec2 uv=',flame+'\n void main(){vec2 uv=');
 HapaFireShaders.volume=HapaFireShaders.volume.replace('vec4 f=ffSample(p);','vec4 f=windFlame(p,emitter);');
 HapaFireShaders.volume=HapaFireShaders.volume.replace('float r=(1.4+length(uFireMotion.zw)*1.5)*e.w;','float r=(1.4+length(uFireMotion.zw)*1.5+(uWindFireGain>0.?1.4:0.))*e.w;');
})();
window.HapaWindShaders={
 vertex:`#version 300 es
 precision highp float;layout(location=0)in vec3 aPos;layout(location=1)in vec2 aUV;layout(location=2)in vec4 aTint;
 uniform mat4 uPV;out vec2 vUV;out vec4 vTint;out vec3 vPos;
 void main(){vUV=aUV;vTint=aTint;vPos=aPos;gl_Position=uPV*vec4(aPos,1.);}`,
 fragment:`#version 300 es
 precision highp float;
 ${HapaElementStyle.glsl}
 in vec2 vUV;in vec4 vTint;in vec3 vPos;uniform vec3 uEye;uniform float uInkPhase;
 layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
 void main(){
  float across=abs(vUV.y*2.-1.);
  if(uElementBody==1){float a=(1.-smoothstep(.25,.98,across))*vTint.a;color=vec4(vec3(.9)*a,a);emission=vec4(0.,0.,0.,a);return;}
  if(uElementOn>.5){float tip=pow(max(0.,sin(vUV.x*3.14159265)),.6),profile=exp(-across*across*3.8),fog=exp(-max(0.,length(vPos-uEye)-11.)*.028);float a=clamp(profile*tip*vTint.a*fog,0.,.36);if(a<.001)discard;float edge=elementCore(across-.42,.11)*uElementContour;vec3 c=vTint.rgb*(.44+.55*uElementLight)+vec3(.18,.29,.33)*edge*.18; color=vec4(c*a,a);emission=vec4(c*a*edge*.085, a);return;}
  float edge=1.-smoothstep(.40,.99,across);
  float tip=smoothstep(0.,.065,vUV.x)*(1.-smoothstep(.85,1.,vUV.x));
  float pigment=.64+.36*sin(vUV.x*26.-uInkPhase*1.3+sin(vUV.y*8.));
  float grain=.78+.22*sin(vUV.x*147.+vUV.y*31.)*sin(vUV.y*66.-vUV.x*31.);
  float fog=exp(-max(0.,length(vPos-uEye)-9.)*.025);
  float alpha=clamp(edge*tip*pigment*grain*vTint.a*fog,0.,.77);if(alpha<.002)discard;
  vec3 c=vTint.rgb*alpha;color=vec4(c,alpha);emission=vec4(c*.14,alpha);
 }`
};

