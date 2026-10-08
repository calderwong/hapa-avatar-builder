
/* Original Fire Paint field. Renderer/audio independent; coordinates are emitter-local.
 * Analytic curl of a trigonometric potential supplies a deformation vocabulary, not a fluid solve.
 * Normalized heat is an artistic reaction-age coordinate, NOT Kelvin/combustion chemistry.
 */
'use strict';
window.HapaFireKernel=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
 const sm=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
 function validate(q){if(!q||q.schema!=='hapa.paint.fire.field/1')throw Error('Invalid Fire field packet');
  for(const [key,n]of [['shape',4],['motion',4],['optics',4]])if(!Array.isArray(q[key])||q[key].length!==n||q[key].some(x=>!Number.isFinite(x)))throw Error('Invalid Fire field '+key);
  if(q.shape[0]<0||q.shape[0]>1.6||q.shape[1]<.5||q.shape[1]>5||q.shape[2]<0||q.shape[2]>1.5||q.shape[3]<0||q.shape[3]>1.2)throw Error('Fire shape outside bounds');
  for(const k of ['performance','gesture'])if(q[k]!==undefined&&(!Array.isArray(q[k])||q[k].length!==4||!q[k].every(Number.isFinite)))throw Error('Invalid Fire '+k);
  if(Math.abs(q.motion[2])>1.5||Math.abs(q.motion[3])>1.5||q.optics.some(x=>x<0||x>2))throw Error('Fire optics/wind outside bounds');return true;}
 function curl(p,phase){const [x,y,z]=p;
  return[.35*Math.sin(.9*x+phase*.3)*Math.cos(.7*y-phase*.5)-.35*Math.cos(.7*z+phase*.4)*Math.sin(.8*x-phase*.2),
   .45*Math.sin(.8*y+phase*.6)*Math.cos(.9*z-phase*.3)-.45*Math.cos(.9*x+phase*.3)*Math.sin(.7*y-phase*.5),
   .40*Math.sin(.7*z+phase*.4)*Math.cos(.8*x-phase*.2)-.40*Math.cos(.8*y+phase*.6)*Math.sin(.9*z-phase*.3)];}
 function noise(p){return .5+.24*Math.sin(p[0]*1.37+Math.sin(p[2]*1.9)) * Math.sin(p[1]*1.63-p[2]*.4)+.16*Math.sin(p[2]*2.13+p[0]*.72)*Math.cos(p[1]*2.01+p[0]*.3)+.10*Math.cos(p[0]*4.1-p[2]*3.4+p[1]*2.7);}

 function enhanced(q,p,offset=0){
  const [fuel,H,turb,smoke]=q.shape,perf=q.performance,g=q.gesture||[0,0,0,0],phase=q.motion[0]+offset,slow=q.motion[1]+offset*.37;
  let [x,y,z]=p;const yn=Math.max(y,0)/H,gate=sm(.02,.42,yn),width=perf[1];
  const cu=curl([x*1.7,y*1.8-phase*1.2,z*1.7],slow);
  x=(x-q.motion[2]*yn*yn*.9-cu[0]*turb*.22*gate-.24*perf[2]*Math.sin(g[0]+offset-yn*2.6)*gate)/width;
  z=(z-q.motion[3]*yn*yn*.9-cu[2]*turb*.22*gate-.17*perf[2]*Math.cos(g[0]*.73+offset-yn*2.1)*gate)/width;
  let den=0,heat=0;
  for(let i=0;i<5;i++){
   const a=i*2.399963,h=H*(.77+.17*(.5+.5*Math.sin(slow*.67+i*1.83-yn*.95))+.06*Math.sin(g[1]*.4+i)),u=y/h;
   if(u<0||u>1.08)continue;
   const root=i===0?0:.44,ox=Math.cos(a)*root,oz=Math.sin(a)*root;
   const tail=sm(.04,.65,u),sway=(.12+.13*perf[2])*Math.sin(phase*.51-u*3.7+i*2.1)*tail;
   const split=.26*perf[3]*Math.sin(g[1]*.63-u*4.1+i)*sm(.18,.78,u);
   const px=x-ox-sway*Math.cos(a)-split*Math.sin(a),pz=z-oz-sway*Math.sin(a)+split*Math.cos(a);
   const radius=(.285+.14*fuel)*(1-sm(.02,1.02,u))+.018,n=noise([px*3.5+i*.71,y*2.1-phase*1.9,pz*3.5-i*.49]);
   const profile=1-Math.hypot(px,pz)/radius+(n-.5)*(.72+1.05*turb)*sm(.03,.42,u);
   const tongue=sm(-.12,.36,profile)*sm(-.025,.10,y)*(1-sm(.82,1.04,u))*(.38+.62*sm(.18,.70,n));
   den+=tongue*(.42+.48*fuel);heat=Math.max(heat,tongue*(1-sm(.02,.91,u))*(.78+.22*sm(.18,.82,profile)));
  }
  den=Math.min(den,2.5)*sm(0,.10,fuel);
  const r=Math.hypot(x,z),wid=.46+.38*yn,cloud=noise([x*1.8,y*1.2-phase*.7,z*1.8]);
  const soot=sm(.55,.94,yn)*(1-sm(1.12,1.58,yn))*(1-sm(wid*.45,wid,r))*(.3+.7*cloud)*smoke*(1-sm(.12,.55,den))*sm(0,.1,fuel);
  const thermal=(den*.25+soot*.55)*q.optics[1];
  return{density:den,heat:clamp(heat),smoke:soot,thermal:clamp(thermal),flow:[q.motion[2]+cu[0]*turb,.65+cu[1]*turb*.3,q.motion[3]+cu[2]*turb]};
 }
 function sample(q,p,offset=0){if(!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))throw Error('Fire coordinates must be three finite numbers');if(q.performance?.[0])return enhanced(q,p,offset);
  const [fuel,height,turb,smoke]=q.shape,[phase,slow,wx,wz]=q.motion;
  let [x,y,z]=p;const yn=Math.max(y,0)/height,adv=[x*2.6,y*2.2-phase*2.2,z*2.6],cu=curl(adv,slow);
  x-=wx*yn*yn*.9+cu[0]*(.18+turb*.46)*sm(.02,.32,yn);z-=wz*yn*yn*.9+cu[2]*(.18+turb*.46)*sm(.02,.32,yn);
  let den=0,heat=0;
  for(let i=0;i<5;i++){
   const a=i*2.399963,h=height*(.70+.26*(.5+.5*Math.sin(slow*.61+i*1.83))),u=y/h;
   if(u<0||u>1.08)continue;
   const root=i===0?0:.46,ox=Math.cos(a)*root,oz=Math.sin(a)*root;
   const sway=.13*Math.sin(phase*.56-u*6+i*2.1)*sm(.05,.5,u);
   const px=x-ox-sway*Math.cos(a),pz=z-oz-sway*Math.sin(a),radius=(.31+.13*fuel)*(1-sm(.03,1.02,u))+.028;
   const n=noise([px*3.5+i*.71,y*2.2-phase*2.5,pz*3.5-i*.49]);
   const profile=1-Math.hypot(px,pz)/radius+(n-.5)*(1.05+1.30*turb)*sm(.02,.38,u);
   const tongue=sm(-.10,.38,profile)*sm(-.025,.10,y)*(1-sm(.72,1.02,u))*(.35+.65*sm(.18,.64,n));
   den+=tongue*(.44+.50*fuel);
   heat=Math.max(heat,tongue*(1-sm(.06,1.0,u)));
  }
  den=Math.min(den,2.5)*sm(.0,.10,fuel);
  const wid=.40+.39*yn,r=Math.hypot(x,z),cloud=noise([x*2.1,y*1.2-phase*.76,z*2.1]);
  const soot=sm(.42,.82,yn)*(1-sm(1.12,1.58,yn))*(1-sm(wid*.45,wid,r))*(.3+.7*cloud)*smoke*(1-sm(.15,.65,den))*sm(.0,.1,fuel);
  const thermal=(den*.25+soot*.65+sm(.3,.8,yn)*(1-sm(1.1,1.58,yn))*(1-sm(.5,1.1,r))*.25)*q.optics[1];
  return{density:den,heat:clamp(heat),smoke:soot,thermal:clamp(thermal),flow:[wx+cu[0]*turb,.65+cu[1]*turb*.3,wz+cu[2]*turb]};
 }
 function color(heat,palette=0){heat=clamp(heat);const low=palette===1?[.025,.10,.85]:palette===2?[1.2,.028,.10]:[1.25,.025,.002];
  const mid=palette===1?[.04,1.2,2.0]:palette===2?[2.7,.36,.016]:[3.5,.48,.025];
  const high=palette===1?[2.8,3.9,4.5]:[5.4,2.6,.48],a=sm(.03,.38,heat),b=sm(.72,.98,heat);return low.map((v,i)=>mix(mix(v,mid[i],a),high[i],b));}
 const glsl=`
uniform vec4 uFireShape,uFireMotion,uFireOptics,uFirePerformance,uFireGesture;
float ffS(float a,float b,float x){float v=clamp((x-a)/(b-a),0.,1.);return v*v*(3.-2.*v);}
vec3 ffCurl(vec3 p,float ph){return vec3(
 .35*sin(.9*p.x+ph*.3)*cos(.7*p.y-ph*.5)-.35*cos(.7*p.z+ph*.4)*sin(.8*p.x-ph*.2),
 .45*sin(.8*p.y+ph*.6)*cos(.9*p.z-ph*.3)-.45*cos(.9*p.x+ph*.3)*sin(.7*p.y-ph*.5),
 .40*sin(.7*p.z+ph*.4)*cos(.8*p.x-ph*.2)-.40*cos(.8*p.y+ph*.6)*sin(.9*p.z-ph*.3));}
float ffNoise(vec3 p){return .5+.24*sin(p.x*1.37+sin(p.z*1.9))*sin(p.y*1.63-p.z*.4)+.16*sin(p.z*2.13+p.x*.72)*cos(p.y*2.01+p.x*.3)+.10*cos(p.x*4.1-p.z*3.4+p.y*2.7);}

vec4 ffEnhanced(vec3 p,float offset){
 float fuel=uFireShape.x,H=uFireShape.y,turb=uFireShape.z,smoke=uFireShape.w,phase=uFireMotion.x+offset,slow=uFireMotion.y+offset*.37;
 float yn=max(p.y,0.)/H,gate=ffS(.02,.42,yn),width=uFirePerformance.y;vec3 cu=ffCurl(vec3(p.x*1.7,p.y*1.8-phase*1.2,p.z*1.7),slow);
 p.x=(p.x-uFireMotion.z*yn*yn*.9-cu.x*turb*.22*gate-.24*uFirePerformance.z*sin(uFireGesture.x+offset-yn*2.6)*gate)/width;
 p.z=(p.z-uFireMotion.w*yn*yn*.9-cu.z*turb*.22*gate-.17*uFirePerformance.z*cos(uFireGesture.x*.73+offset-yn*2.1)*gate)/width;
 float den=0.,heat=0.;
 for(int i=0;i<5;i++){float fi=float(i),a=fi*2.399963,h=H*(.77+.17*(.5+.5*sin(slow*.67+fi*1.83-yn*.95))+.06*sin(uFireGesture.y*.4+fi)),v=p.y/h;
  if(v<0.||v>1.08)continue;float root=i==0?0.:.44;vec2 o=vec2(cos(a),sin(a))*root;
  float tail=ffS(.04,.65,v),sway=(.12+.13*uFirePerformance.z)*sin(phase*.51-v*3.7+fi*2.1)*tail,split=.26*uFirePerformance.w*sin(uFireGesture.y*.63-v*4.1+fi)*ffS(.18,.78,v);
  vec2 px=p.xz-o-sway*vec2(cos(a),sin(a))-split*vec2(sin(a),-cos(a));
  float radius=(.285+.14*fuel)*(1.-ffS(.02,1.02,v))+.018,n=ffNoise(vec3(px.x*3.5+fi*.71,p.y*2.1-phase*1.9,px.y*3.5-fi*.49));
  float profile=1.-length(px)/radius+(n-.5)*(.72+1.05*turb)*ffS(.03,.42,v);
  float tongue=ffS(-.12,.36,profile)*ffS(-.025,.10,p.y)*(1.-ffS(.82,1.04,v))*(.38+.62*ffS(.18,.70,n));
  den+=tongue*(.42+.48*fuel);heat=max(heat,tongue*(1.-ffS(.02,.91,v))*(.78+.22*ffS(.18,.82,profile)));
 }
 den=min(den,2.5)*ffS(0.,.10,fuel);float r=length(p.xz),wid=.46+.38*yn,cloud=ffNoise(vec3(p.x*1.8,p.y*1.2-phase*.7,p.z*1.8));
 float soot=ffS(.55,.94,yn)*(1.-ffS(1.12,1.58,yn))*(1.-ffS(wid*.45,wid,r))*(.3+.7*cloud)*smoke*(1.-ffS(.12,.55,den))*ffS(0.,.1,fuel);
 return vec4(den,clamp(heat,0.,1.),soot,clamp((den*.25+soot*.55)*uFireOptics.y,0.,1.));
}
vec4 ffSample(vec3 p){if(uFirePerformance.x>.5)return ffEnhanced(p,0.);float fuel=uFireShape.x,H=uFireShape.y,turb=uFireShape.z,smoke=uFireShape.w,phase=uFireMotion.x,slow=uFireMotion.y;
 float yn=max(p.y,0.)/H;vec3 cu=ffCurl(vec3(p.x*2.6,p.y*2.2-phase*2.2,p.z*2.6),slow);
 p.xz-=uFireMotion.zw*yn*yn*.9+cu.xz*(.18+turb*.46)*ffS(.02,.32,yn);
 float den=0.,heat=0.;
 for(int i=0;i<5;i++){float fi=float(i),a=fi*2.399963,h=H*(.70+.26*(.5+.5*sin(slow*.61+fi*1.83))),v=p.y/h;
  if(v<0.||v>1.08)continue;float root=i==0?0.:.46;vec2 o=vec2(cos(a),sin(a))*root;
  float sway=.13*sin(phase*.56-v*6.+fi*2.1)*ffS(.05,.5,v);vec2 px=p.xz-o-sway*vec2(cos(a),sin(a));
  float rad=(.31+.13*fuel)*(1.-ffS(.03,1.02,v))+.028,n=ffNoise(vec3(px.x*3.5+fi*.71,p.y*2.2-phase*2.5,px.y*3.5-fi*.49));
  float profile=1.-length(px)/rad+(n-.5)*(1.05+1.30*turb)*ffS(.02,.38,v);
  float tongue=ffS(-.10,.38,profile)*ffS(-.025,.10,p.y)*(1.-ffS(.72,1.02,v))*(.35+.65*ffS(.18,.64,n));den+=tongue*(.44+.50*fuel);heat=max(heat,tongue*(1.-ffS(.06,1.,v)));}
 den=min(den,2.5)*ffS(0.,.10,fuel);float wid=.40+.39*yn,r=length(p.xz),cloud=ffNoise(vec3(p.x*2.1,p.y*1.2-phase*.76,p.z*2.1));
 float soot=ffS(.42,.82,yn)*(1.-ffS(1.12,1.58,yn))*(1.-ffS(wid*.45,wid,r))*(.3+.7*cloud)*smoke*(1.-ffS(.15,.65,den))*ffS(0.,.1,fuel);
 float thermal=(den*.25+soot*.65+ffS(.3,.8,yn)*(1.-ffS(1.1,1.58,yn))*(1.-ffS(.5,1.1,r))*.25)*uFireOptics.y;
 return vec4(den,clamp(heat,0.,1.),soot,clamp(thermal,0.,1.));}
vec4 ffSampleOffset(vec3 p,float offset){return uFirePerformance.x>.5?ffEnhanced(p,offset):ffSample(p);}
vec3 ffColor(float h){h=clamp(h,0.,1.);
 if(uFirePerformance.x>.5){vec3 low=vec3(.23,.009,.002),mid=vec3(1.65,.19,.008),gold=vec3(2.8,1.02,.085),ivory=vec3(3.7,3.0,1.8);vec3 c=mix(low,mid,ffS(.025,.38,h));c=mix(c,gold,ffS(.56,.88,h));return mix(c,ivory,ffS(.955,.995,h));}int pal=int(uFireOptics.w+.5);vec3 low=pal==1?vec3(.025,.10,.85):pal==2?vec3(1.2,.028,.10):vec3(1.25,.025,.002);
 vec3 mid=pal==1?vec3(.04,1.2,2.):pal==2?vec3(2.7,.36,.016):vec3(3.5,.48,.025),high=pal==1?vec3(2.8,3.9,4.5):vec3(5.4,2.6,.48);
 return mix(mix(low,mid,ffS(.03,.38,h)),high,ffS(.72,.98,h));}
`;
 return{validate,curl,sample,color,glsl};
})();

