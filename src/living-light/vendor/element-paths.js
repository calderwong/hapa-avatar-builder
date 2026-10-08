
/* Deterministic, bounded lagged-phase Wind traces. This is art direction, NOT
 * transported material history, a CFD solve, or frame-rate integration.
 * Storage belongs to the renderer and is reused at a fixed quality level.
 */
'use strict';
window.HapaElementPaths=(()=>{
 const M=HapaMath,K=HapaWindKernel;
 function storage(){return {lines:Array.from({length:34},()=>({points:Array.from({length:57},()=>[0,0,0]),count:0,width:0,alpha:0,tint:[0,0,0]})),count:0,vertices:new Float32Array(34*56*6*9),used:0};}
 function build(packet,s,out=storage()){
  const q=packet.field,quality=s.quality||'balanced',N=quality==='draft'?28:quality==='high'?56:40;
  const count=quality==='draft'?12:quality==='high'?24:18,L=s._bridge?.length||42,center=s._tunnel?[0,.7,L*.5]:[0,.35,-2.0];
  const phase=packet.phase,seed=(packet.response?.seed||106)%997,shift=seed*.003;
  let lineCount=0;
  const lag={...q,mean:[...q.mean]};
  for(let k=0;k<count;k++){
   const line=out.lines[lineCount++],a=k*2.399963+shift,veil=k<3,fine=k>=10,layer=k%4;
   let p=s._tunnel?[Math.cos(a)*2.9,.15+layer*.56,1.2+(k/(count-1))*(L-2.4)]:[center[0]+Math.cos(a)*(2.2+(k%3)*.52),-.15+layer*.68,center[2]+Math.sin(a)*(2.2+(k%3)*.52)];
   for(let j=0;j<=N;j++){
    const dest=line.points[j];dest[0]=p[0];dest[1]=p[1];dest[2]=p[2];
    // A smoothly offset source phase trails down each path. Current-field amplitudes
    // remain current: this is deliberately not advertised as true advected ink.
    lag.mean[3]=phase-(j/N)*(.90+.12*(k%3));
    const dt=(veil?9.5:fine?7.5:10.5)/N,a=K.sample(lag,p).velocity;
    const v=K.sample(lag,[p[0]+a[0]*dt*.5,p[1]+a[1]*dt*.5,p[2]+a[2]*dt*.5]).velocity;
    p=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt];
    if(s._tunnel){p[0]=Math.max(-4.15,Math.min(4.15,p[0]));p[1]=Math.max(-.8,Math.min(3.65,p[1]));p[2]=Math.max(.15,Math.min(L-.15,p[2]));}
   }
   line.count=N+1;line.width=veil?.15:fine?.012:.048;
   line.alpha=packet.pigment*(veil?.07:fine?.36:.28);line.tint=packet.colors[veil?0:k%2];line.phase=k*.72;line.pressure=false;
  }
  for(const e of packet.events){if(e.strength<=0)continue;
   const R=e.speed*e.age,env=Math.min(1,e.age/.10)*Math.max(0,Math.min(1,(e.life-e.age)/.8))*Math.exp(-e.age*.27);
   if(R<.05||R>32)continue;
   for(let k=0;k<2&&lineCount<out.lines.length;k++){
    const line=out.lines[lineCount++],begin=.4+k*2.4,arc=1.1+.3*Math.sin(e.time*1.3+k),tilt=.35+k*.76;
    for(let j=0;j<=N;j++){const a=begin+j/N*arc,d=line.points[j];d[0]=e.origin[0]+R*Math.cos(a);d[1]=e.origin[1]+R*Math.sin(a)*Math.sin(tilt);d[2]=e.origin[2]+R*Math.sin(a)*Math.cos(tilt);}
    line.count=N+1;line.width=.035+Math.min(.10,R*.006);line.alpha=packet.pigment*e.strength*env*.28;line.tint=packet.colors[1];line.phase=k;line.pressure=true;
   }
  }
  out.count=lineCount;return out;
 }
 function mesh(out,cam,body=false,pixelHeight=450){
  let at=0;const data=out.vertices;
  const vert=(p,u,v,line,coverage=1)=>{data[at++]=p[0];data[at++]=p[1];data[at++]=p[2];data[at++]=u;data[at++]=v;data[at++]=line.tint[0];data[at++]=line.tint[1];data[at++]=line.tint[2];data[at++]=(body?.62:line.alpha)*coverage;};
  for(let k=0;k<out.count;k++){
   const line=out.lines[k],N=line.count-1;let last=null;
   for(let i=0;i<=N;i++){
    const p=line.points[i],t=M.norm(M.sub(line.points[Math.min(i+1,N)],line.points[Math.max(0,i-1)])),u=i/N;
    let side=M.cross(t,M.sub(cam.eye,p));if(Math.hypot(...side)<.001)side=[1,0,0];side=M.norm(side);
    // A small world-space twist adds depth; centerlines are never screen-fixed.
    const up=M.norm(M.cross(t,side)),a=.33*Math.sin(u*7.4+line.phase),edge=M.add(M.scale(side,Math.cos(a)),M.scale(up,Math.sin(a)));
    const natural=line.width*Math.pow(Math.max(.008,Math.sin(Math.PI*u)),.70),pixel=2*Math.tan(cam.fov*.5)*Math.max(.2,Math.hypot(...M.sub(cam.eye,p)))/pixelHeight,w=Math.max(natural,pixel*.43),coverage=natural/w,left=M.add(p,M.scale(edge,-w)),right=M.add(p,M.scale(edge,w));
    if(last){vert(last[0],(i-1)/N,0,line,last[2]);vert(last[1],(i-1)/N,1,line,last[2]);vert(right,u,1,line,coverage);vert(last[0],(i-1)/N,0,line,last[2]);vert(right,u,1,line,coverage);vert(left,u,0,line,coverage);}last=[left,right,coverage];
   }
  }
  out.used=at;return data.subarray(0,at);
 }
 function metrics(out){let curvature=0,length=0,n=0;const points=[];
  for(let k=0;k<Math.min(out.count,18);k++){const l=out.lines[k];for(let j=1;j<l.count;j++){const d=M.sub(l.points[j],l.points[j-1]);length+=Math.hypot(...d);if(j>1){const a=M.norm(d),b=M.norm(M.sub(l.points[j-1],l.points[j-2]));curvature+=Math.acos(Math.max(-1,Math.min(1,M.dot(a,b))));}n++;}points.push([...l.points[Math.floor(l.count*.65)]]);}
  return{sampledPoints:points,totalPathLength:length,meanTurningRadians:n?curvature/n:0};
 }
 return{storage,build,mesh,metrics};
})();

