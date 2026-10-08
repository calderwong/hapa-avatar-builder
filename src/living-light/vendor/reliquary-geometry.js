
window.HapaReliquaryGeometry=(()=>{
/* Original parametric geometry. Reference images are never sampled as textures. */
const V={add:(a,b)=>a.map((v,i)=>v+b[i]),sub:(a,b)=>a.map((v,i)=>v-b[i]),mul:(a,s)=>a.map(v=>v*s),dot:(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm:a=>{let s=Math.hypot(...a)||1;return a.map(v=>v/s)}};
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
class Builder{
 constructor(){this.a=[];this.count=0;}
 vert(p,n,uv,mat,reg){this.a.push(...p,...n,...uv,mat,reg);this.count++;}
 tri(p,q,r,mat,reg=0,uvs=[[0,0],[1,0],[.5,1]]){const n=V.norm(V.cross(V.sub(q,p),V.sub(r,p)));this.vert(p,n,uvs[0],mat,reg);this.vert(q,n,uvs[1],mat,reg);this.vert(r,n,uvs[2],mat,reg);}
 surface(fn,nu,nv,mat,reg=0,uvFn=(u,v)=>[u,v]){
  const at=(u,v)=>{const p=fn(u,v),a=fn(clamp(u+.0001),v),b=fn(u,clamp(v+.0001));let du=V.sub(a,p),dv=V.sub(b,p);if(u>.9999)du=V.sub(p,fn(u-.0001,v));if(v>.9999)dv=V.sub(p,fn(u,v-.0001));return [p,V.norm(V.cross(du,dv)),uvFn(u,v)];};
  let prev=Array.from({length:nu+1},(_,i)=>at(i/nu,0));
  for(let j=1;j<=nv;j++){let row=Array.from({length:nu+1},(_,i)=>at(i/nu,j/nv));for(let i=0;i<nu;i++){for(const a of [prev[i],prev[i+1],row[i],prev[i+1],row[i+1],row[i]])this.vert(a[0],a[1],a[2],mat,reg);}prev=row;}
 }
 tube(points,r,mat=3,reg=0,sides=7){
  let frames=points.map((p,i)=>{let t=V.norm(V.sub(points[Math.min(points.length-1,i+1)],points[Math.max(0,i-1)]));let a=V.norm(V.cross(t,Math.abs(t[2])>.93?[0,1,0]:[0,0,1]));let b=V.norm(V.cross(t,a));return Array.from({length:sides+1},(_,j)=>{let angle=j/sides*TAU,n=V.add(V.mul(a,Math.cos(angle)),V.mul(b,Math.sin(angle)));return [V.add(p,V.mul(n,r)),n,[i/(points.length-1),j/sides]]});});
  for(let i=0;i<frames.length-1;i++)for(let j=0;j<sides;j++)for(const a of [frames[i][j],frames[i+1][j],frames[i][j+1],frames[i][j+1],frames[i+1][j],frames[i+1][j+1]])this.vert(a[0],a[1],a[2],mat,reg);
 }
 gem(p,r,mat=4,reg=0,stretch=1){
 let n=(mat===4||mat===8)?14:8,glass=(mat===4||mat===8),tip=glass?.58:0.;
 for(let i=0;i<n;i++){
  let a=i/n*TAU,b=(i+1)/n*TAU;
  const pt=(rad,angle,h)=>[p[0]+rad*Math.cos(angle),p[1]+rad*Math.sin(angle)*stretch,p[2]+h];
  const uv=(rad,angle)=>[.5+rad*.5*Math.cos(angle),.5+rad*.5*Math.sin(angle)];
  let q=pt(r,a,0),s=pt(r,b,0),top=[p[0],p[1],p[2]+r*.7],bottom=[p[0],p[1],p[2]-r*.55];
  if(glass){let tq=pt(r*.47,a,r*.47),ts=pt(r*.47,b,r*.47),c=[p[0],p[1],p[2]+r*.48];this.tri(q,s,tq,mat,reg,[uv(1,a),uv(1,b),uv(.47,a)]);this.tri(s,ts,tq,mat,reg,[uv(1,b),uv(.47,b),uv(.47,a)]);this.tri(tq,ts,c,mat,reg,[uv(.47,a),uv(.47,b),[.5,.5]]);}else this.tri(q,s,top,mat,reg,[uv(1,a),uv(1,b),[.5,.5]]);
  this.tri(s,q,bottom,mat,reg,[uv(1,b),uv(1,a),[.5,.5]]);
 }
 }
 data(){return new Float32Array(this.a);}
}
function maskP(u,v,dz=0){v=clamp(v,-.99998,.99998);let s=(v+1)/2,w=.93*Math.pow(Math.max(.00001,Math.sin(Math.PI*s)),.69)*(.80+.25*s);return [u/Math.sqrt(Math.max(.00004,1-v*v))*w,-1.20+2.54*s,.43+.245*(1-u*u-v*v)+.016*Math.cos(v*5)+dz];}
function polarP(r,a,dz=.017){return maskP(r*Math.cos(a),r*Math.sin(a),dz);}
function hoodP(u,v){let s=u*2-1,A=Math.abs(s),x=Math.sign(s)*1.78*Math.pow(A,.88),y=1.45-1.93*Math.pow(A,1.52),z=.64+.08*Math.cos(s*Math.PI);x*=1+v*(.48+.20*A);y+=v*(1.02-.64*A);z+=-.97*v+.24*Math.sin(Math.PI*v)+(.02+.10*v)*Math.sin(29*s+2.2*v+1.1*Math.sin(9*s))+.047*Math.sin(53*s+4*v)*v;return [x,y,z];}
function clothFold(i,u,v){const x=(u*2-1)*2.65,sign=i%2?1:-1,base=-1.39-i*.19;return [x,base+sign*.26*x+.14*Math.sin(u*TAU+i*.8)+(v-.5)*(.49+i*.035),.83+.050*i+.13*Math.sin(Math.PI*v)+.19*Math.cos(u*TAU+1.3*i)+.038*Math.sin(u*38+v*3)];}
function buildGeometry(){
 const G={};const make=(name,fn)=>{let b=new Builder;fn(b);G[name]=b.data();};
 make('hood',b=>b.surface(hoodP,256,56,0,2,(u,v)=>[u*2.5,v*.82]));
 make('lining',b=>{
  b.surface((u,v)=>{let p=hoodP(u,0);return [p[0]*(1-.18*v),p[1]-.22*v,p[2]-.49*v+.04*Math.sin(u*30+v*3)]},180,20,1,2);
  b.surface((u,v)=>{const a=u*TAU,th=.01+v*(Math.PI-.02);return [Math.sin(th)*Math.cos(a)*.91,Math.cos(th)*1.28+.02,Math.sin(th)*Math.sin(a)*.66-.04]},80,60,1,1);
 });
 make('cowl',b=>b.surface((u,v)=>{let x=(u-.5)*3.85,y=-2.50+v*4.03;return [x,y,-.13+.12*Math.sin(x*11+y*.8)+.028*Math.sin(x*31-y*2)]},160,96,1,2,(u,v)=>[u*1.5,v*1.5]));
 make('inner-drape',b=>b.surface((u,v)=>{let a=u*TAU,e=polarP(.998,a,-.07);return [e[0]*(1+.92*v),e[1]*(1+.55*v)-.09*v,.35-v*.53+.062*Math.sin(8*a+v*3)*Math.sin(v*Math.PI)+.027*Math.sin(37*a+v*9)]},224,38,1,2,(u,v)=>[u*2,v*1.2]));
 make('folds',b=>{for(let i=0;i<6;i++)b.surface((u,v)=>clothFold(i,u,v),160,22,0,3,(u,v)=>[u*2.8+i*.71,v*.28+i*.42]);});
 make('mask',b=>b.surface((u,v)=>{const y=-.9998+v*1.9996;return maskP((u*2-1)*Math.sqrt(1-y*y),y)},106,126,2,1,(u,v)=>[u,v]));
 make('trim',b=>{
  for(const v of [0,.021,.062,.088])b.tube(Array.from({length:260},(_,i)=>{let p=hoodP(i/259,v);p[2]+=.026;return p}),v===.021?.018:.008,3,2,9);
  for(let i=1;i<184;i++){let p=hoodP(i/184,.047);p[2]+=.019;b.gem(p,.009,3,2);}
  for(let k=0;k<6;k++)for(const v of [.04,.085,.90,.945])b.tube(Array.from({length:170},(_,i)=>{let p=clothFold(k,i/169,v);p[2]+=.017;return p}),v===.04||v===.945?.009:.0035,3,3,7);
  for(const r of [.979,.994])b.tube(Array.from({length:281},(_,i)=>polarP(r,i/280*TAU,.022)),r>.98?.007:.003,3,1,7);
 });
 make('lace',b=>{
  // Differently scaled interlocking leaves, not one repeated polygon.
  const levels=[.12,.26,.43,.63,.80,.953];
  for(let l=0;l<levels.length;l++){
   let r=levels[l],n=l<2?8:12;
   b.tube(Array.from({length:241},(_,i)=>{let a=i/240*TAU;return polarP(r*(1+.04*Math.cos(n*a)),a,.034)}),l<2?.0075:.006,3,1,7);
   if(l===0)continue;
   let r0=levels[l-1];
   for(let j=0;j<n;j++)for(let side of [-1,1]){
    const a0=j/n*TAU+(l%2)*Math.PI/n;
    const pts=Array.from({length:33},(_,i)=>{let f=i/32,rr=r0+(r-r0)*f,a=a0+side*Math.sin(Math.PI*f)*Math.PI/n*.92;return polarP(rr,a,.040)});
    b.tube(pts,.0058+(l===3?.0015:0),3,1,7);
   }
  }
  for(let j=0;j<12;j++){const a=j/12*TAU;b.tube(Array.from({length:72},(_,i)=>{let r=.16+i/71*.785;return polarP(r,a+.045*Math.sin(r*20),.029)}),.0024,3,1,6);}
 });
 make('axis',b=>{for(let j=0;j<8;j++){let a=j/8*TAU;b.tube(Array.from({length:100},(_,i)=>{let r=.21+i/99*.75,aa=a+.022*Math.sin(i/99*Math.PI*5);return polarP(r,aa,.027)}),.0065,3,1,8);let p=polarP(.67,a,.067);b.gem(p,.027,3,1,1.25);}});
 make('micro',b=>{
  for(let l=0;l<5;l++){const r0=.19+l*.145, r1=r0+.15;
   for(let j=0;j<32;j++)for(let side of [-1,1]){let a0=j/32*TAU+l*.053;let pts=Array.from({length:19},(_,i)=>{let u=i/18;return polarP(r0+(r1-r0)*u,a0+side*Math.sin(u*Math.PI)*.079,.016)});b.tube(pts,.0021,7,1,7);}
  }
 });
 make('jewels',b=>{
  for(let l=0;l<4;l++){let r=[.255,.43,.63,.80][l],n=l===0?8:12;for(let j=0;j<n;j++){let a=j/n*TAU+(l%2?0:Math.PI/n),p=polarP(r,a,.060);b.gem(p,l===2?.023:.014,3,1,1.15);b.gem(V.add(p,[0,0,.012]),l===2?.012:.007,l%2?4:8,1,1.15);}}
  for(const v of [-.83,.89]){let p=maskP(0,v,.05);b.gem(p,.040,3,1,1.55);b.gem(V.add(p,[0,0,.019]),.026,4,1,1.4);}
  for(let j=0;j<7;j++){
   let u=[.12,.22,.35,.5,.65,.78,.88][j],v=.22+.04*(j%2),p=hoodP(u,v);p[2]+=.09;
   const radius=j===3?.105:.075;
   for(const r of [radius*1.05,radius*1.21,radius*1.36])b.tube(Array.from({length:70},(_,i)=>[p[0]+r*Math.cos(i/69*TAU),p[1]+r*Math.sin(i/69*TAU),p[2]+.022]),.004,3,2,7);
   b.gem(p,radius*.68,4,2);b.gem(V.add(p,[0,0,radius*.50]),.007,10,2);
   for(let k=0;k<16;k++){const a=k/16*TAU;b.gem([p[0]+radius*1.22*Math.cos(a),p[1]+radius*1.22*Math.sin(a),p[2]+.027],.007,3,2);}
  }
  for(let i=0;i<4;i++){let p=clothFold(i,[.25,.82,.42,.67][i],.51);p[2]+=.049;for(let r of [.10,.13])b.tube(Array.from({length:70},(_,j)=>[p[0]+r*Math.cos(j/69*TAU),p[1]+r*.80*Math.sin(j/69*TAU),p[2]+.01]),.005,3,3,7);b.gem(p,.071,i%2?8:4,3);b.gem(V.add(p,[0,0,.052]),.006,10,3);}
 });
 make('corona',b=>{
  for(let j=0;j<32;j++){let a=j/32*TAU;let pts=Array.from({length:33},(_,i)=>{let f=i/32,r=.068+f*(.27+.035*Math.sin(j*2)),th=a+.08*Math.sin(f*7+j);return maskP(r*Math.cos(th),r*Math.sin(th),.038)});b.tube(pts,.00165,9,1,5);}
  for(let n of [8,16]){let pts=Array.from({length:257},(_,i)=>{let a=i/256*TAU,r=.14+.044*Math.cos(n*a);return maskP(r*Math.cos(a),r*Math.sin(a),.05)});b.tube(pts,.0024,9,1,6);}
 });
 make('core',b=>{
  let p=maskP(0,0,.089),n=8;
  for(let i=0;i<n*2;i++){let a=i/n*Math.PI,aa=(i+1)/n*Math.PI;let r=(i%2===0?.135*(i%4===0?1.45:1):.020),rr=((i+1)%2===0?.135*((i+1)%4===0?1.45:1):.020);b.tri([p[0],p[1],p[2]+.030],[p[0]+r*Math.cos(a),p[1]+r*Math.sin(a),p[2]],[p[0]+rr*Math.cos(aa),p[1]+rr*Math.sin(aa),p[2]],5,1);}
  b.gem(V.add(p,[0,0,.036]),.022,10,1);
 });
 make('room',b=>{
  b.surface((u,v)=>[(u-.5)*30,(v-.5)*24,-4.2],1,1,6,4);
  b.surface((u,v)=>[(u-.5)*20,-2.56,-8+v*16],1,1,6,4);
  for(let k of [-1,1])for(let j=0;j<3;j++){let x=k*(3.8+j*.8);b.surface((u,v)=>[x+.15*Math.cos(u*TAU),v*7-2.6,-3.55+j*.1+.15*Math.sin(u*TAU)],18,2,6,4);}
 });
 make('sanctum',b=>{
  for(const [r,y] of [[3.25,-2.55],[3.12,-2.42],[2.98,-2.30]]){
   b.surface((u,v)=>[Math.cos(u*TAU)*r,y+v*.12,Math.sin(u*TAU)*r],96,2,6,4);
   b.surface((u,v)=>[Math.cos(u*TAU)*r*v,y+.12,Math.sin(u*TAU)*r*v],96,6,6,4);
   b.tube(Array.from({length:193},(_,i)=>[r*Math.cos(i/192*TAU),y+.135,r*Math.sin(i/192*TAU)]),.009,3,4,7);
  }
  for(let k=0;k<3;k++)b.tube(Array.from({length:181},(_,i)=>{let a=i/180*Math.PI;return [(3.0+k*.19)*Math.cos(a),-1.8+(4.45+k*.20)*Math.sin(a),-1.65-k*.15]}),k===0?.047:.015,3,4,9);
 });
 make('halo',b=>{for(let k=0;k<2;k++){
  b.tube(Array.from({length:193},(_,i)=>{let a=i/192*TAU;return [Math.cos(a)*(2.28+k*.16),.18+Math.sin(a)*(2.28+k*.16),-1.20-k*.15]}),.013,11,5+k,8);
  for(let j=0;j<12;j++){let a=j/12*TAU;b.gem([Math.cos(a)*(2.28+k*.16),.18+Math.sin(a)*(2.28+k*.16),-1.20-k*.15],.041,4,5+k);}
 }});
 return G;
}

return {build:buildGeometry};
})();

