
/* Wind Paint — original reusable world-space field. MIT for this module only.
 * Curl component is analytic; the whole authored field includes compressive pressure
 * waves, buoyancy and damping and is NOT claimed divergence-free or physically solved.
 * Units are scene units / song second. No clock, renderer, audio or mutable solver state.
 */
'use strict';
window.HapaWindKernel=(()=>{
 const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),S=(a,b,x)=>{x=C((x-a)/(b-a));return x*x*(3-2*x);};
 function validate(q){if(!q||q.schema!=='hapa.paint.wind.field/1')throw Error('Invalid Wind field schema');
  for(const [k,n]of [['mean',4],['detail',4],['origin',4],['surface',4],['shockOrigins',16],['shockShapes',16],['thermals',32]])if(!Array.isArray(q[k])||q[k].length!==n||!q[k].every(Number.isFinite))throw Error('Invalid Wind field '+k);
  if(q.mean.slice(0,3).some(x=>Math.abs(x)>8)||q.detail.some(x=>x<0||x>8)||q.origin[3]<.1||q.origin[3]>30||q.surface[2]<0||q.surface[2]>1)throw Error('Wind field bounds');
  for(let i=0;i<4;i++){const j=i*4;if(q.shockShapes[j]<0||q.shockShapes[j]>2||q.shockShapes[j+1]<=0||q.shockShapes[j+2]<=0||q.shockShapes[j+3]<=0)throw Error('Wind pulse bounds');}return true;}
 function curl(p,ph){const [x,y,z]=p,k1=.61,k2=.73,k3=.83;
  return[-.45*(k1*Math.sin(k3*x-ph*.3)*Math.sin(k1*y+ph*.6)+k2*Math.cos(k2*z+ph*.7)*Math.cos(k3*x+ph*.2)),
   -.45*(k2*Math.sin(k1*y+ph)*Math.sin(k2*z-ph*.4)+k3*Math.cos(k3*x-ph*.3)*Math.cos(k1*y+ph*.6)),
   -.45*(k3*Math.sin(k2*z+ph*.7)*Math.sin(k3*x+ph*.2)+k1*Math.cos(k1*y+ph)*Math.cos(k2*z-ph*.4))];}
 function sample(q,p){if(!p||p.length!==3||!p.every(Number.isFinite))throw Error('Wind sample coordinates');
  const [x,y,z]=p,m=q.mean,det=q.detail,o=q.origin;const speed=Math.hypot(m[0],m[2]),dir=[m[0]/Math.max(speed,.0001),m[2]/Math.max(speed,.0001)];
  const a=[x-dir[0]*m[3]*.38,y,z-dir[1]*m[3]*.38],cu=curl(a,m[3]*.16),small=curl(a.map(v=>v*2.07+3.1),m[3]*.21);
  const gust=.5+.5*Math.sin((x*dir[0]+z*dir[1])*.43-m[3]*.7+y*.13),factor=1+det[2]*(gust-.5)*.85;
  const v=[m[0]*factor+det[0]*(cu[0]+small[0]*.28),m[1]+det[0]*(cu[1]+small[1]*.28),m[2]*factor+det[0]*(cu[2]+small[2]*.28)];
  const xx=x-o[0],zz=z-o[2],r2=xx*xx+zz*zz,R=o[3],sw=det[1]*Math.exp(-r2/(R*R))*.8;
  v[0]-=zz*sw;v[2]+=xx*sw;let lift=0;
  for(let i=0;i<8;i++){const j=4*i,e=q.thermals;if(e[j+3]<=0)continue;const dy=y-e[j+1],dx=x-e[j],dz=z-e[j+2];
   const b=e[j+3]*Math.exp(-(dx*dx+dz*dz)/(1.1+Math.max(dy,0)*.3))*S(-.2,.45,dy)*(1-S(2,7,dy));lift+=b;
   v[0]-=dx*b*.09;v[2]-=dz*b*.09;}
  v[1]+=lift*det[3];
  const near=Math.exp(-Math.max(0,y-q.surface[0])*1.8)*q.surface[2],damping=1-near*.38;v[0]*=damping;v[2]*=damping;v[1]*=1-near*.65;
  let pressure=0,front=0;
  for(let i=0;i<4;i++){const j=4*i,e=q.shockOrigins,k=q.shockShapes,age=e[j+3],strength=k[j];if(strength<=0||age<0||age>k[j+3])continue;
   const d=[x-e[j],y-e[j+1],z-e[j+2]],r=Math.sqrt(d.reduce((a,b)=>a+b*b,0)+.0004),w=k[j+2],dist=r-k[j+1]*age,env=S(0,.1,age)*(1-S(k[j+3]-.8,k[j+3],age))*Math.exp(-age*.21);
   const pos=Math.exp(-((dist/w)**2)),neg=.40*Math.exp(-(((dist+w*1.35)/(w*1.2))**2)),pulse=strength*(pos-neg)*env;pressure+=pulse;front+=strength*pos*env;
   for(let k=0;k<3;k++)v[k]+=d[k]/r*pulse*2.0;
  }
  return{velocity:v,pressure,front,gust,thermalLift:lift*det[3],surfaceDamping:near,curl:cu};
 }
 // Extra water response only: fixed-frequency wind chop plus lagged, finite shock wake.
 // The original Water wave field is never retimed or replaced.
 function water(q,p,amount,memory){const [x,z]=p,m=q.mean,speed=Math.hypot(m[0],m[2]),dx=m[0]/Math.max(speed,.0001),dz=m[2]/Math.max(speed,.0001);
  const a=.045*amount*memory*(.35+.65*C(speed,0,2)),phase=m[3]*.65,kx=dx*1.25,kz=dz*1.25,th=x*kx+z*kz-phase,th2=x*(-dz*2.4)+z*(dx*2.4)-phase*1.47;
  let h=a*(Math.sin(th)+.30*Math.sin(th2)),hx=a*(kx*Math.cos(th)-.72*dz*Math.cos(th2)),hz=a*(kz*Math.cos(th)+.72*dx*Math.cos(th2));
  const px=x-q.origin[0],pz=z-q.origin[2],R=q.origin[3],r=Math.sqrt(px*px+pz*pz+.0004),cx=Math.cos(phase*.4),cz=Math.sin(phase*.4),theta=1.2*r-phase+2*(px*cx+pz*cz)/R;
  const amp=.055*amount*memory*q.detail[1]*Math.exp(-(px*px+pz*pz)/(R*R)),sn=Math.sin(theta),co=Math.cos(theta);
  h+=amp*sn;hx+=amp*(co*(1.2*px/r+2*cx/R)-sn*2*px/(R*R));hz+=amp*(co*(1.2*pz/r+2*cz/R)-sn*2*pz/(R*R));
  const chop=.012*amount*memory*q.detail[0],ct=.61*x+.83*z-phase*.77;h+=chop*Math.sin(ct);hx+=chop*.61*Math.cos(ct);hz+=chop*.83*Math.cos(ct);
  for(let i=0;i<4;i++){const j=4*i,e=q.shockOrigins,k=q.shockShapes,age=e[j+3]-(q.surface[3]>.5?0:.17);if(k[j]<=0||age<0||age>k[j+3])continue;
   const u=x-e[j],v=z-e[j+2],dy=q.surface[3]>.5?q.surface[0]-e[j+1]:0,r=Math.sqrt(u*u+v*v+dy*dy+.0004),d=r-k[j+1]*age,width=k[j+2]*1.45,inv=1/(width*width),fall=1/(1+.045*r),env=Math.exp(-d*d*inv-age*.19)*S(0,.12,age)*(1-S(k[j+3]-.8,k[j+3],age)),amp=.20*amount*k[j],sn=Math.sin(d*4.8),co=Math.cos(d*4.8);
   h+=amp*env*sn*fall;const dh=amp*env*fall*(4.8*co-2*d*inv*sn-.045*fall*sn)/r;hx+=dh*u;hz+=dh*v;
  }
  return{height:h,slope:[hx,hz]};
 }
 const glsl=`
uniform vec4 uWindMean,uWindDetail,uWindOrigin,uWindSurface;
uniform vec4 uWindShockOrigins[4],uWindShockShapes[4],uWindThermals[8];
float wiS(float a,float b,float x){x=clamp((x-a)/(b-a),0.,1.);return x*x*(3.-2.*x);}
vec3 wiCurl(vec3 p,float ph){float x=p.x,y=p.y,z=p.z,k1=.61,k2=.73,k3=.83;return -.45*vec3(
 k1*sin(k3*x-ph*.3)*sin(k1*y+ph*.6)+k2*cos(k2*z+ph*.7)*cos(k3*x+ph*.2),
 k2*sin(k1*y+ph)*sin(k2*z-ph*.4)+k3*cos(k3*x-ph*.3)*cos(k1*y+ph*.6),
 k3*sin(k2*z+ph*.7)*sin(k3*x+ph*.2)+k1*cos(k1*y+ph)*cos(k2*z-ph*.4));}
vec4 windField(vec3 p){vec4 m=uWindMean,d=uWindDetail,o=uWindOrigin;float sp=length(m.xz);vec2 dir=m.xz/max(sp,.0001);vec3 a=p-vec3(dir.x,0.,dir.y)*m.w*.38;
 vec3 cu=wiCurl(a,m.w*.16),sm=wiCurl(a*2.07+3.1,m.w*.21);float g=.5+.5*sin(dot(p.xz,dir)*.43-m.w*.7+p.y*.13);
 vec3 v=m.xyz*vec3(1.+d.z*(g-.5)*.85,1.,1.+d.z*(g-.5)*.85)+d.x*(cu+sm*.28);
 vec2 rr=p.xz-o.xz;float sw=d.y*exp(-dot(rr,rr)/(o.w*o.w))*.8;v.xz+=vec2(-rr.y,rr.x)*sw;
 float lift=0.;for(int i=0;i<8;i++){vec4 e=uWindThermals[i];if(e.w<=0.)continue;vec3 dp=p-e.xyz;float b=e.w*exp(-dot(dp.xz,dp.xz)/(1.1+max(dp.y,0.)*.3))*wiS(-.2,.45,dp.y)*(1.-wiS(2.,7.,dp.y));lift+=b;v.xz-=dp.xz*b*.09;}v.y+=lift*d.w;
 float near=exp(-max(0.,p.y-uWindSurface.x)*1.8)*uWindSurface.z;v*=vec3(1.-near*.38,1.-near*.65,1.-near*.38);float pressure=0.;
 for(int i=0;i<4;i++){vec4 e=uWindShockOrigins[i],k=uWindShockShapes[i];float age=e.w;if(k.x<=0.||age<0.||age>k.w)continue;vec3 dp=p-e.xyz;float r=sqrt(dot(dp,dp)+.0004),dist=r-k.y*age,w=k.z,env=wiS(0.,.1,age)*(1.-wiS(k.w-.8,k.w,age))*exp(-age*.21),aa=dist/w,bb=(dist+w*1.35)/(w*1.2);float pulse=k.x*(exp(-aa*aa)-.4*exp(-bb*bb))*env;pressure+=pulse;v+=dp/r*pulse*2.;}
 return vec4(v,pressure);}
vec3 windWater(vec2 p,float amount,float memory){vec4 m=uWindMean;vec2 dir=m.xz/max(length(m.xz),.0001),k=dir*1.25,k2=vec2(-dir.y,dir.x)*2.4;float a=.045*amount*memory*(.35+.65*clamp(length(m.xz),0.,2.)),ph=m.w*.65,t=dot(p,k)-ph,t2=dot(p,k2)-ph*1.47;
 vec3 outp=vec3(a*(sin(t)+.3*sin(t2)),a*(k*cos(t)+.3*k2*cos(t2)));
 vec2 rr=p-uWindOrigin.xz;float R=uWindOrigin.w,rad=sqrt(dot(rr,rr)+.0004);vec2 cv=vec2(cos(ph*.4),sin(ph*.4));float theta=1.2*rad-ph+2.*dot(rr,cv)/R,amp=.055*amount*memory*uWindDetail.y*exp(-dot(rr,rr)/(R*R)),sn=sin(theta),co=cos(theta);
 outp.x+=amp*sn;outp.yz+=amp*(co*(1.2*rr/rad+2.*cv/R)-sn*2.*rr/(R*R));float chop=.012*amount*memory*uWindDetail.x,ct=dot(p,vec2(.61,.83))-ph*.77;outp.x+=chop*sin(ct);outp.yz+=chop*cos(ct)*vec2(.61,.83);
 for(int i=0;i<4;i++){vec4 e=uWindShockOrigins[i],q=uWindShockShapes[i];float age=e.w-(uWindSurface.w>.5?0.:.17);if(q.x<=0.||age<0.||age>q.w)continue;vec2 dp=p-e.xz;float dy=uWindSurface.w>.5?uWindSurface.x-e.y:0.,r=sqrt(dot(dp,dp)+dy*dy+.0004),d=r-q.y*age,w=q.z*1.45,inv=1./(w*w),fall=1./(1.+.045*r),env=exp(-d*d*inv-age*.19)*wiS(0.,.12,age)*(1.-wiS(q.w-.8,q.w,age)),amp=.2*amount*q.x,sn=sin(d*4.8),co=cos(d*4.8);outp.x+=amp*env*sn*fall;outp.yz+=amp*env*fall*(4.8*co-2.*d*inv*sn-.045*fall*sn)*dp/r;}
 return outp;}
`;
 function uniforms(q){return{uWindMean:q.mean,uWindDetail:q.detail,uWindOrigin:q.origin,uWindSurface:q.surface,uWindShockOrigins:q.shockOrigins,uWindShockShapes:q.shockShapes,uWindThermals:q.thermals};}
 return{validate,curl,sample,water,glsl,uniforms};
})();

