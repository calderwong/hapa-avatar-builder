
/* Original, MIT-scoped Hapa Dynamics kernel. Finite MAC-grid gas + shallow surface.
 * Persistent fixed-step state; normalized artistic chemistry/heat, not engineering CFD.
 * No DOM/audio/GPU dependency. CG pressure projection, solid face boundaries,
 * semi-Lagrangian transport, local reaction and an explicit phase-change energy budget. */
'use strict';
(function(root){
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)), smooth=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
function obstacleDistance(p,o){
 const q=p.map((x,i)=>x-o.center[i]);
 if(o.type==='sphere')return Math.hypot(...q)-o.radius;
 if(o.type==='capsule'){q[1]-=clamp(q[1],-o.halfHeight,o.halfHeight);return Math.hypot(...q)-o.radius;}
 const d=q.map((v,i)=>Math.abs(v)-o.half[i]);return Math.hypot(...d.map(v=>Math.max(0,v)))+Math.min(0,Math.max(...d));
}
function heatExchange(gas,liquid,energy,dt,rate=10){
 // gas heat capacity is one; liquid capacity is mass*1. Boiling threshold 1,
 // latent heat 4.8. Every local transfer below is balanced, in normalized units.
 if(liquid<1e-9)return{gas,liquid:0,energy:0,vapor:0,transfer:0};
 const t=energy/liquid,limit=Math.max(0,gas-t)/(1+1/liquid);
 let q=Math.min(limit,Math.max(0,gas-t)*liquid*rate*dt);gas-=q;energy+=q;
 if(energy/liquid>1){const m=Math.min(liquid,Math.max(0,(energy-liquid)/4.8));liquid-=m;energy-=m*5.8;if(liquid<1e-8){gas+=Math.max(0,energy);energy=0;}return{gas,liquid,energy:Math.max(0,energy),vapor:m,transfer:q};}
 return{gas,liquid,energy,vapor:0,transfer:q};
}
class Solver{
 constructor(opts={}){
  this.nx=opts.nx??20;this.ny=opts.ny??16;this.nz=opts.nz??20;this.h=opts.h??.4;this.dt=opts.dt??.05;
  if(![this.nx,this.ny,this.nz].every(n=>Number.isInteger(n)&&n>=4&&n<=64)||!Number.isFinite(this.h)||this.h<.1||this.h>2||!Number.isFinite(this.dt)||this.dt<=0||this.dt>.1)throw Error('Invalid finite solver grid / time step');
  this.origin=opts.origin||[-4,-1.6,-6];this.obstacles=opts.obstacles||[];this.N=this.nx*this.ny*this.nz;this.tick=0;
  this.cfg={reaction:true,projection:true,obstacles:true,boiling:true,condensation:true,...opts};
  const {nx:x,ny:y,nz:z,N}=this;
  this.u=new Float32Array((x+1)*y*z);this.v=new Float32Array(x*(y+1)*z);this.w=new Float32Array(x*y*(z+1));
  this.tmpU=this.u.slice();this.tmpV=this.v.slice();this.tmpW=this.w.slice();this.solid=new Uint8Array(N);
  this.ch={};this.tmp={};for(const k of ['heat','fuel','oxygen','soot','vapor','mist','wet','wetEnergy','burn','ink']){this.ch[k]=new Float32Array(N);this.tmp[k]=new Float32Array(N);}this.ch.oxygen.fill(1);
  for(const k of ['p','div','cgR','cgD','cgQ','cgZ','diag'])this[k]=new Float32Array(N);
  this.neighbors=new Int32Array(N*6).fill(-2);this.flow=new Float32Array(N*3);this.centers=new Float32Array(N*3);
  this.water={height:new Float32Array(x*z),speed:new Float32Array(x*z),mass:new Float32Array(x*z),energy:new Float32Array(x*z),boil:new Float32Array(x*z)};
  this.water.mass.fill(.12);this.water.energy.fill(.12*.15);
  this.stats={};this.totalBurn=0;this.totalVapor=0;this.totalCondensed=0;this.injectedWater=0;this.totalQuench=0;
  this.rasterize();
 }
 idx(x,y,z){return x+this.nx*(y+this.ny*z);}
 position(x,y,z){return[this.origin[0]+(x+.5)*this.h,this.origin[1]+(y+.5)*this.h,this.origin[2]+(z+.5)*this.h];}
 rasterize(){
  const {nx,ny,nz,h,N}=this;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=this.idx(x,y,z),p=this.position(x,y,z);this.centers.set(p,i*3);this.solid[i]=this.cfg.obstacles&&this.obstacles.some(o=>obstacleDistance(p,o)<0)?1:0;}
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const i=this.idx(x,y,z);let diag=0;const pts=[[x-1,y,z],[x+1,y,z],[x,y-1,z],[x,y+1,z],[x,y,z-1],[x,y,z+1]];
   pts.forEach(([a,b,c],j)=>{let n=-2;if(a>=0&&a<nx&&b>=0&&b<ny&&c>=0&&c<nz)n=this.solid[this.idx(a,b,c)]?-1:this.idx(a,b,c);else if(b<0)n=-1;this.neighbors[i*6+j]=n;if(n!==-1)diag++;});
   this.diag[i]=this.solid[i]?1:Math.max(diag,1)/(h*h);
  }
 }
 // Grid samplers accept lattice-space coordinates, including staggered half-cell offsets.
 sampleArray(a,nx,ny,nz,x,y,z){
  x=clamp(x,0,nx-1);y=clamp(y,0,ny-1);z=clamp(z,0,nz-1);const ix=Math.min(nx-2,Math.floor(x)),iy=Math.min(ny-2,Math.floor(y)),iz=Math.min(nz-2,Math.floor(z)),fx=x-ix,fy=y-iy,fz=z-iz,i=ix+nx*(iy+ny*iz),j=nx*ny;
  const l00=a[i]*(1-fx)+a[i+1]*fx,l10=a[i+nx]*(1-fx)+a[i+nx+1]*fx,l01=a[i+j]*(1-fx)+a[i+j+1]*fx,l11=a[i+j+nx]*(1-fx)+a[i+j+nx+1]*fx;
  return (l00*(1-fy)+l10*fy)*(1-fz)+(l01*(1-fy)+l11*fy)*fz;
 }
 velocity(x,y,z,out=[0,0,0]){const {nx,ny,nz}=this;out[0]=this.sampleArray(this.u,nx+1,ny,nz,x+.5,y,z);out[1]=this.sampleArray(this.v,nx,ny+1,nz,x,y+.5,z);out[2]=this.sampleArray(this.w,nx,ny,nz+1,x,y,z+.5);return out;}
 blocked(x,y,z){x=Math.round(x);y=Math.round(y);z=Math.round(z);return x>=0&&x<this.nx&&y>=0&&y<this.ny&&z>=0&&z<this.nz&&this.solid[this.idx(x,y,z)]===1;}
 sampleScalar(a,x,y,z){
  // Renormalize around blocked voxel centers; do not borrow transported density from solids.
  const {nx,ny,nz}=this;x=clamp(x,0,nx-1);y=clamp(y,0,ny-1);z=clamp(z,0,nz-1);const ix=Math.min(nx-2,Math.floor(x)),iy=Math.min(ny-2,Math.floor(y)),iz=Math.min(nz-2,Math.floor(z)),f=[x-ix,y-iy,z-iz];let sum=0,w=0;
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){const at=this.idx(ix+i,iy+j,iz+k);if(this.solid[at])continue;const wt=(i?f[0]:1-f[0])*(j?f[1]:1-f[1])*(k?f[2]:1-f[2]);sum+=a[at]*wt;w+=wt;}return w>1e-8?sum/w:0;
 }
 enforce(){
  const {nx,ny,nz,u,v,w,solid}=this,at=(x,y,z)=>x>=0&&x<nx&&y>=0&&y<ny&&z>=0&&z<nz?solid[this.idx(x,y,z)]:0;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<=nx;x++)if(at(x-1,y,z)||at(x,y,z))u[x+(nx+1)*(y+ny*z)]=0;
  for(let z=0;z<nz;z++)for(let y=0;y<=ny;y++)for(let x=0;x<nx;x++)if(y===0||at(x,y-1,z)||at(x,y,z))v[x+nx*(y+(ny+1)*z)]=0;
  for(let z=0;z<=nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(at(x,y,z-1)||at(x,y,z))w[x+nx*(y+ny*z)]=0;
 }
 divergence(){const {nx,ny,nz,h,u,v,w}=this;let sum=0,n=0,max=0;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=this.idx(x,y,z);if(this.solid[i]){this.div[i]=0;continue;}const iu=x+(nx+1)*(y+ny*z),iv=x+nx*(y+(ny+1)*z);const d=(u[iu+1]-u[iu]+v[iv+nx]-v[iv]+w[i+nx*ny]-w[i])/h;this.div[i]=d;sum+=d*d;n++;max=Math.max(max,Math.abs(d));}return{rms:Math.sqrt(sum/Math.max(n,1)),max};}
 applyA(a,out){const {N,h}=this,inv=1/(h*h);for(let i=0;i<N;i++){if(this.solid[i]){out[i]=0;continue;}let n=this.diag[i]*a[i];for(let j=0;j<6;j++){const k=this.neighbors[i*6+j];if(k>=0)n-=a[k]*inv;}out[i]=n;}}
 project(){
  this.enforce();const before=this.divergence(),{N,p,cgR:r,cgD:d,cgQ:q,cgZ:z}=this;p.fill(0);let rz=0;
  for(let i=0;i<N;i++){r[i]=-this.div[i];z[i]=r[i]/this.diag[i];d[i]=z[i];rz+=r[i]*z[i];}
  const initial=rz;let iter=0;
  if(this.cfg.projection)for(;iter<(this.cfg.iterations||36)&&rz>Math.max(initial*1e-9,1e-12);iter++){
   this.applyA(d,q);let dq=0;for(let i=0;i<N;i++)dq+=d[i]*q[i];if(dq<1e-20)break;const alpha=rz/dq;
   let nrz=0;for(let i=0;i<N;i++){p[i]+=alpha*d[i];r[i]-=alpha*q[i];z[i]=r[i]/this.diag[i];nrz+=r[i]*z[i];}const beta=nrz/Math.max(rz,1e-30);for(let i=0;i<N;i++)d[i]=z[i]+beta*d[i];rz=nrz;
  }
  if(this.cfg.projection){const {nx,ny,nz,h,u,v,w}=this,P=(x,y,z)=>x<0||x>=nx||y<0||y>=ny||z<0||z>=nz?0:p[this.idx(x,y,z)],solid=(x,y,z)=>x>=0&&x<nx&&y>=0&&y<ny&&z>=0&&z<nz&&this.solid[this.idx(x,y,z)];
   for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<=nx;i++)if(!solid(i-1,j,k)&&!solid(i,j,k))u[i+(nx+1)*(j+ny*k)]-=(P(i,j,k)-P(i-1,j,k))/h;
   for(let k=0;k<nz;k++)for(let j=1;j<=ny;j++)for(let i=0;i<nx;i++)if(!solid(i,j-1,k)&&!solid(i,j,k))v[i+nx*(j+(ny+1)*k)]-=(P(i,j,k)-P(i,j-1,k))/h;
   for(let k=0;k<=nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(!solid(i,j,k-1)&&!solid(i,j,k))w[i+nx*(j+ny*k)]-=(P(i,j,k)-P(i,j,k-1))/h;
  }
  this.enforce();const after=this.divergence();this.stats.projection={before:before.rms,after:after.rms,max:after.max,iterations:iter,relativeResidual:Math.sqrt(rz/Math.max(initial,1e-30))};return this.stats.projection;
 }
 advectVelocity(){const {nx,ny,nz,dt,h}=this,vel=[0,0,0];
  for(const [src,dst,sx,sy,sz,off]of [[this.u,this.tmpU,nx+1,ny,nz,[-.5,0,0]],[this.v,this.tmpV,nx,ny+1,nz,[0,-.5,0]],[this.w,this.tmpW,nx,ny,nz+1,[0,0,-.5]]]){
   for(let k=0;k<sz;k++)for(let j=0;j<sy;j++)for(let i=0;i<sx;i++){const x=i+off[0],y=j+off[1],z=k+off[2];this.velocity(x,y,z,vel);let bx=x-dt/h*vel[0],by=y-dt/h*vel[1],bz=z-dt/h*vel[2];if(this.blocked(bx,by,bz)||this.blocked((x+bx)/2,(y+by)/2,(z+bz)/2)){bx=x;by=y;bz=z;}dst[i+sx*(j+sy*k)]=this.sampleArray(src,sx,sy,sz,bx-off[0],by-off[1],bz-off[2])*.999;}
  }
  [this.u,this.tmpU]=[this.tmpU,this.u];[this.v,this.tmpV]=[this.tmpV,this.v];[this.w,this.tmpW]=[this.tmpW,this.w];this.enforce();
 }
 step(input={}){
  const {nx,ny,nz,h,dt,N,ch,water}=this;const wind=input.wind||[.65,0,.12],fuel=Math.max(0,input.fuel??.7),heatGain=Math.max(0,input.heat??1),chemistry=this.cfg.reaction,at=this.tick*dt;
  this.advectVelocity();const tmp=[0,0,0];
  // Force relaxation toward supplied far-field wind; buoyancy derives from transported heat.
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<=nx;i++){const id=i+(nx+1)*(j+ny*k),x=this.origin[0]+i*h,y=this.origin[1]+(j+.5)*h,z=this.origin[2]+(k+.5)*h;this.u[id]+=(wind[0]+.14*(input.curl||0)*Math.sin(z*1.2+at*.9)*Math.sin(y*1.3)-this.u[id])*dt*.72;}
  for(let k=0;k<=nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const id=i+nx*(j+ny*k),x=this.origin[0]+(i+.5)*h,y=this.origin[1]+(j+.5)*h;this.w[id]+=(wind[2]+.14*(input.curl||0)*Math.cos(x*1.2+at*.7)*Math.sin(y*1.3)-this.w[id])*dt*.72;}
  for(let k=0;k<nz;k++)for(let j=1;j<ny;j++)for(let i=0;i<nx;i++){const id=i+nx*(j+(ny+1)*k),a=this.idx(i,j,k),b=this.idx(i,j-1,k);this.v[id]+=dt*(.55*(ch.heat[a]+ch.heat[b])*.5-.09*(ch.soot[a]+ch.mist[a])-.13*this.v[id]);}
  if(input.pressure){const c=input.pressure.origin||[0,.3,-2],amp=input.pressure.strength||1;
   for(const [arr,sx,sy,sz,off,axis]of [[this.u,nx+1,ny,nz,[0,.5,.5],0],[this.v,nx,ny+1,nz,[.5,0,.5],1],[this.w,nx,ny,nz+1,[.5,.5,0],2]])for(let k=0;k<sz;k++)for(let j=0;j<sy;j++)for(let i=0;i<sx;i++){const d=[this.origin[0]+(i+off[0])*h-c[0],this.origin[1]+(j+off[1])*h-c[1],this.origin[2]+(k+off[2])*h-c[2]],r=Math.hypot(...d);arr[i+sx*(j+sy*k)]+=amp*.8*d[axis]/Math.max(r,.2)*Math.exp(-r*r*.32);}
  }
  // Velocity cap before projection; CFL is diagnosed after projection rather than hiding errors.
  for(const a of [this.u,this.v,this.w])for(let i=0;i<a.length;i++)a[i]=clamp(a[i],-3.5,3.5);
  this.project();
  // Transport heat, reactants and visible tracers by the projected field. Liquids settle faster.
  const keys=['heat','fuel','oxygen','soot','vapor','mist','wet','wetEnergy','ink'];
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
   const id=this.idx(i,j,k);this.velocity(i,j,k,tmp);this.flow.set(tmp,id*3);if(this.solid[id]){for(const key of keys)this.tmp[key][id]=0;continue;}
   let bx=i-dt/h*tmp[0],by=j-dt/h*tmp[1],bz=k-dt/h*tmp[2];if(this.blocked(bx,by,bz)||this.blocked((i+bx)*.5,(j+by)*.5,(k+bz)*.5)){bx=i;by=j;bz=k;}
   for(const key of keys){const sy=key==='wet'||key==='wetEnergy'?by+dt/h*1.25:key==='mist'?by+dt/h*.18:by;let val=this.sampleScalar(ch[key],bx,sy,bz);if(key==='oxygen'&&(bx<0||bx>nx-1||by>ny-1||bz<0||bz>nz-1))val=1;
    if(key==='heat')val*=Math.exp(-dt*.14);if(key==='soot'||key==='ink')val*=Math.exp(-dt*.045);this.tmp[key][id]=Math.max(0,val);}
  }
  for(const key of keys){[ch[key],this.tmp[key]]=[this.tmp[key],ch[key]];}
  const emitters=input.emitters||[[-1.5,-1.15,-2],[1.5,-1.15,-2]];let burnSum=0,vapSum=0,condSum=0,wetSum=0;
  ch.burn.fill(0);water.boil.fill(0);
  for(let id=0;id<N;id++){
   if(this.solid[id])continue;const x=this.centers[id*3],y=this.centers[id*3+1],z=this.centers[id*3+2];
   let src=0;for(const e of emitters){const r2=(x-e[0])**2+(z-e[2])**2;src+=Math.exp(-r2/.26-(y-e[1])**2/.095);}src=Math.min(1,src);
   ch.fuel[id]+=dt*fuel*3.1*src;
   if(at<.7||input.ignite)ch.heat[id]+=src*dt*(input.ignite?60:20);
   ch.oxygen[id]+=(1-ch.oxygen[id])*dt*(.08+.15*Math.min(1,Math.abs(wind[0])));
   if(input.quench){const q=input.quench,origin=q.origin||emitters[0],r2=(x-origin[0])**2+(z-origin[2])**2,mask=Math.exp(-r2/(q.radius||1.3)**2)*smooth(-1.6,-.9,y)*(1-smooth(1.0,2.2,y));const m=(q.strength||1)*dt*2.8*mask;ch.wet[id]+=m;ch.wetEnergy[id]+=m*.12;this.injectedWater+=m;}
   if(input.ink!==false&&x<this.origin[0]+h*1.6&&Math.abs(y-.1)<.8&&Math.abs(z+2)<1.7)ch.ink[id]+=dt*(.9+(input.voice||0));
   if(ch.wet[id]>1e-6){
    if(this.cfg.boiling){const exchange=heatExchange(ch.heat[id],ch.wet[id],ch.wetEnergy[id],dt,22);ch.heat[id]=exchange.gas;ch.wet[id]=exchange.liquid;ch.wetEnergy[id]=exchange.energy;ch.vapor[id]+=exchange.vapor;vapSum+=exchange.vapor;this.totalQuench+=exchange.transfer;}
    else{const Q=Math.min(ch.heat[id]*.3,ch.wet[id]*dt*3);ch.heat[id]-=Q;ch.wetEnergy[id]+=Q;}
   }
   const gate=smooth(1.15,1.80,ch.heat[id]),wetGate=1/(1+ch.wet[id]*9);
   const reacted=chemistry?Math.min(ch.fuel[id],ch.oxygen[id]/.65,dt*3.8*ch.fuel[id]*ch.oxygen[id]*gate*wetGate):0;
   ch.fuel[id]-=reacted;ch.oxygen[id]-=reacted*.65;ch.heat[id]+=reacted*3.8*heatGain;ch.soot[id]+=reacted*.085;ch.burn[id]=reacted/dt;burnSum+=reacted;
   // Cooling gas converts invisible vapor into a visible condensate field; latent energy returns.
   if(this.cfg.condensation&&ch.heat[id]<.9){const m=Math.min(ch.vapor[id]*(1-Math.exp(-dt*1.4*(1-ch.heat[id]/.9))),Math.max(0,.9-ch.heat[id])/4.8);ch.vapor[id]-=m;ch.mist[id]+=m;ch.heat[id]+=m*4.8;condSum+=m;}
   ch.heat[id]=clamp(ch.heat[id],0,6);ch.fuel[id]=clamp(ch.fuel[id],0,3);ch.oxygen[id]=clamp(ch.oxygen[id]);
   ch.soot[id]=clamp(ch.soot[id],0,3);ch.vapor[id]=clamp(ch.vapor[id],0,5);ch.mist[id]=clamp(ch.mist[id],0,5);
   wetSum+=ch.wet[id];
  }
  // Thermal contact with a shallow water patch; remove exactly the transferred heat from gas.
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
   const a=x+nx*z,g=this.idx(x,0,z),g1=this.idx(x,1,z);if(this.solid[g])continue;
   const temp=water.energy[a]/Math.max(water.mass[a],1e-8),hot=ch.heat[g1],Q=Math.min(hot*.45,Math.max(0,hot-temp)*dt*.85);ch.heat[g1]-=Q;water.energy[a]+=Q;
   // Deposited liquid carries its sensible energy into the patch.
   const deposit=ch.wet[g]*.45;ch.wet[g]-=deposit;const E=ch.wetEnergy[g]*.45;ch.wetEnergy[g]-=E;water.mass[a]+=deposit;water.energy[a]+=E;
   if(this.cfg.boiling&&water.mass[a]>0&&water.energy[a]>water.mass[a]){const mass=Math.min(water.mass[a],(water.energy[a]-water.mass[a])/4.8);water.mass[a]-=mass;water.energy[a]-=mass*5.8;water.energy[a]=Math.max(0,water.energy[a]);if(water.mass[a]<1e-8){ch.heat[g1]+=water.energy[a];water.energy[a]=0;}ch.vapor[g1]+=mass;water.boil[a]=mass/dt;vapSum+=mass;}
   water.energy[a]*=Math.exp(-dt*.008);
  }
  // Linearized shallow-water wave equation on the same horizontal footprint.
  const hh=water.height,ss=water.speed;for(let z=1;z<nz-1;z++)for(let x=1;x<nx-1;x++){const i=x+nx*z;const nb=[i-1,i+1,i-nx,i+nx],lap=nb.reduce((s,j)=>s+hh[j]-hh[i],0)/(h*h);ss[i]+=dt*(1.3*lap-.9*ss[i]+.025*wind[0]*Math.sin(x*.6+at)+water.boil[i]*.04);}
  if(input.pressure)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const i=x+nx*z,p=this.position(x,0,z);ss[i]+=(input.pressure.strength||1)*.12*Math.exp(-((p[0])**2+(p[2]+2)**2)*.6);}
  for(let i=0;i<hh.length;i++)hh[i]=clamp(hh[i]+dt*ss[i],-.22,.22);
  this.totalBurn+=burnSum;this.totalVapor+=vapSum;this.totalCondensed+=condSum;this.tick++;
  let heat=0,soot=0,mist=0,vapor=0,reaction=0,leftReaction=0,rightReaction=0,maxVel=0,ink=0,waterMass=0,maxWaterTemp=0,blockedDensity=0;
  for(let i=0;i<N;i++){heat+=ch.heat[i];soot+=ch.soot[i];mist+=ch.mist[i];vapor+=ch.vapor[i];reaction+=ch.burn[i];if(this.centers[i*3]<0)leftReaction+=ch.burn[i];else rightReaction+=ch.burn[i];ink+=ch.ink[i];maxVel=Math.max(maxVel,Math.hypot(this.flow[i*3],this.flow[i*3+1],this.flow[i*3+2]));if(this.solid[i])blockedDensity+=ch.soot[i]+ch.mist[i]+ch.ink[i];}
  for(let i=0;i<water.mass.length;i++){waterMass+=water.mass[i];if(water.mass[i]>.0001)maxWaterTemp=Math.max(maxWaterTemp,water.energy[i]/water.mass[i]);}
  Object.assign(this.stats,{tick:this.tick,time:this.tick*dt,cells:N,reactionRate:reaction,leftReaction,rightReaction,heat,soot,mist,vapor,wet:wetSum,waterMass,maxWaterTemp,boilingMass:vapSum,condensedMass:condSum,totalBurn:this.totalBurn,totalVapor:this.totalVapor,totalCondensed:this.totalCondensed,injectedWater:this.injectedWater,maxVelocity:maxVel,cfl:maxVel*dt/h,blockedDensity,ink});
  return this.stats;
 }
 sample(p){const c=p.map((v,i)=>(v-this.origin[i])/this.h-.5),vel=this.velocity(...c);return{position:p,velocity:vel,solid:this.blocked(...c),...Object.fromEntries(Object.entries(this.ch).map(([k,a])=>[k,this.sampleScalar(a,...c)]))};}
 snapshot(){return{tick:this.tick,u:this.u.slice(),v:this.v.slice(),w:this.w.slice(),ch:Object.fromEntries(Object.entries(this.ch).map(([k,a])=>[k,a.slice()])),water:Object.fromEntries(Object.entries(this.water).map(([k,a])=>[k,a.slice()])),stats:structuredClone(this.stats),totals:[this.totalBurn,this.totalVapor,this.totalCondensed,this.injectedWater,this.totalQuench]};}
 restore(s){this.tick=s.tick;for(const k of ['u','v','w'])this[k].set(s[k]);for(const[k,v]of Object.entries(s.ch))this.ch[k].set(v);for(const[k,v]of Object.entries(s.water))this.water[k].set(v);this.stats=structuredClone(s.stats);[this.totalBurn,this.totalVapor,this.totalCondensed,this.injectedWater,this.totalQuench]=s.totals;}
 pack(){const a=new Float32Array(this.N*4),b=new Float32Array(this.N*4);for(let i=0;i<this.N;i++){a.set([this.ch.heat[i],this.ch.soot[i],this.ch.mist[i],this.ch.burn[i]],i*4);b.set([this.ch.vapor[i],this.ch.ink[i],this.ch.wet[i],this.solid[i]],i*4);}return[a,b];}
}
const out={Solver,heatExchange,obstacleDistance};root.HapaDynamicsKernel=out;if(typeof module!=='undefined')module.exports=out;
})(typeof window!=='undefined'?window:globalThis);

