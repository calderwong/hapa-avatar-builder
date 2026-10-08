
/* Original Electricity Paint kernel. MIT-scoped. No clocks, renderer, audio, or network.
 * A multiscale endpoint-pinned channel, branch grafts and a staged discharge envelope.
 * Normalized artistic quantities; NOT Maxwell, dielectric-breakdown, Ohmic or plasma physics.
 */
'use strict';
window.HapaElectricKernel=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const d=Math.hypot(...a);return d>1e-9?mul(a,1/d):[1,0,0];};
 function hash(id){let h=2166136261;for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
 function seed(id){return (hash(id)%8191)/8191;}
 function validate(f){if(!f||f.schema!=='hapa.paint.electricity.field/1')throw Error('Unknown Electricity field');for(const [k,n]of [['shape',4],['motion',4],['color',3]])if(!Array.isArray(f[k])||f[k].length!==n||!f[k].every(x=>Number.isFinite(x)&&Math.abs(x)<1e6))throw Error('Invalid Electricity '+k);if(f.shape.some(x=>x<0)||f.shape[0]>1||f.shape[1]>1||f.shape[2]>1||f.shape[3]>1)throw Error('Electricity field shape outside 0–1');return true;}
 function point(f,a,b,u,s=0){
  u=clamp(u);const d=sub(b,a),length=Math.hypot(...d),t=norm(d),right=norm(cross(t,Math.abs(t[1])>.90?[0,0,1]:[0,1,0])),up=cross(right,t);
  let x=0,y=0,amp=1,freq=1;const phase=f.motion[0],rough=f.shape[1];
  // Integer harmonics vanish at both terminals. Seed coefficients stay fixed through time.
  for(let i=0;i<6;i++){
   const carrier=Math.sin(Math.PI*freq*u),bendPhase=phase*(.31+i*.097);
   x+=amp*carrier*(Math.sin(s*73.1+i*17.7)*.40+Math.sin(bendPhase+s*11.4+i)*.60);
   y+=amp*carrier*(Math.sin(s*39.7+i*12.13)*.36+Math.cos(bendPhase*.81+s*7.1+i*1.3)*.64);
   freq*=2;amp*=.51;
  }
  const pin=Math.sin(Math.PI*u),amount=length*(.028+.14*rough);
  let p=add(add(a,mul(d,u)),add(mul(right,x*amount),mul(up,y*amount)));
  // Saved curl reach and optional world-space Wind are bounded and zero at terminals.
  p=add(p,mul(up,pin*length*f.shape[2]*.08));
  p=add(p,[pin*pin*f.motion[2]*.13,0,pin*pin*f.motion[3]*.13]);
  return p;
 }
 function branch(f,a,b,fraction,index,s){const start=point(f,a,b,fraction,s),axis=norm(sub(b,a)),right=norm(cross(axis,Math.abs(axis[1])>.9?[0,0,1]:[0,1,0])),up=cross(right,axis),l=Math.hypot(...sub(b,a));
  const angle=s*19+index*2.399,dir=norm(add(mul(axis,.56),add(mul(right,Math.cos(angle)),mul(up,Math.sin(angle)))));
  return{a:start,b:add(start,mul(dir,l*(.17+.06*f.shape[3]))),seed:(s+.19*(index+1))%1,fraction,index};}
 function envelope(age,afterglow=.6,gentle=true){
  if(age<0||age>3)return{leader:0,pulse:0,afterglow:0,front:0};
  const grow=gentle?.24:.16,leader=smooth(age/grow);
  const pulse=smooth((age-grow*.45)/.16)*(1-smooth((age-.47)/.72));
  const after=smooth((age-.32)/.25)*Math.exp(-Math.max(0,age-.52)/(.25+afterglow*1.0))*(1-smooth((age-2.4)/.6));
  return {leader,pulse,afterglow:after,front:1-clamp((age-grow)/(.35+.35*gentle))};
 }
 function nearest(points,p){let best=Infinity,index=-1,along=0,tangent=[1,0,0];for(let i=0;i<points.length-1;i++){const d=sub(points[i+1],points[i]),u=clamp(dot(sub(p,points[i]),d)/Math.max(1e-9,dot(d,d))),dist=Math.hypot(...sub(p,add(points[i],mul(d,u))));if(dist<best){best=dist;index=i;along=(i+u)/(points.length-1);tangent=norm(d);}}return{distance:best,index,along,tangent};}
 const glsl=`
vec3 electricPoint(vec4 shape,vec4 motion,vec3 a,vec3 b,float u,float seed){
 u=clamp(u,0.,1.);vec3 d=b-a;float len=length(d);vec3 t=len>1e-9?d/len:vec3(1,0,0);
 vec3 r=normalize(cross(t,abs(t.y)>.90?vec3(0,0,1):vec3(0,1,0))),v=cross(r,t);
 float x=0.,y=0.,amp=1.,freq=1.;
 for(int i=0;i<6;i++){float j=float(i),wave=sin(3.14159265359*freq*u),ph=motion.x*(.31+j*.097);
 x+=amp*wave*(sin(seed*73.1+j*17.7)*.40+sin(ph+seed*11.4+j)*.60);
 y+=amp*wave*(sin(seed*39.7+j*12.13)*.36+cos(ph*.81+seed*7.1+j*1.3)*.64);freq*=2.;amp*=.51;}
 float pin=sin(3.14159265359*u),amount=len*(.028+.14*shape.y);
 return a+d*u+r*x*amount+v*(y*amount+pin*len*shape.z*.08)+vec3(pin*pin*motion.z*.13,0.,pin*pin*motion.w*.13);
}`;
 return{point,branch,envelope,nearest,validate,seed,hash,glsl,math:{add,sub,mul,dot,cross,norm},version:'1.0.0'};
})();

