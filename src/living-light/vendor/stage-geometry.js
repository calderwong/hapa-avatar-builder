
/* Original 107 stage architecture. Immutable, lazily-built triangle meshes.
 * The stored rest coordinates / anchors are the contract for CPU and GPU deformation.
 * No per-frame topology, imported image assets, particles or ray-marched volumes.
 */
'use strict';
window.HapaStageGeometry=(()=>{
 const PI=Math.PI,sin=Math.sin,cos=Math.cos;
 const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>mul(a,1/(Math.hypot(...a)||1));
 class Builder{
  constructor(quality){this.groups=[[],[],[]];this.objects=[];this.factor=quality==='draft'?.65:quality==='high'?1.35:1;this.quality=quality;}
  surface(fn,nu,nv,o={}){
   const {anchor=[0,0,0],role=0,seed=0,height=1,mat=0,group=0,scale=[1,1],name='surface'}=o;
   nu=Math.max(1,Math.round(nu*this.factor));nv=Math.max(1,Math.round(nv*this.factor));const a=this.groups[group],start=a.length/15;
   const vertex=(u,v)=>{const p=fn(u,v),e=.0001,du=sub(fn(Math.min(1,u+e),v),fn(Math.max(0,u-e),v)),dv=sub(fn(u,Math.min(1,v+e)),fn(u,Math.max(0,v-e))),n=norm(cross(du,dv));a.push(...p,...n,u*scale[0],v*scale[1],...anchor,role,seed,height,mat);};
   for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const u=i/nu,v=j/nv,U=(i+1)/nu,V=(j+1)/nv;vertex(u,v);vertex(U,v);vertex(U,V);vertex(u,v);vertex(U,V);vertex(u,V);}
   this.objects.push({name,group,start,count:a.length/15-start,role,anchor,seed,height,mat});
  }
  box(c,size,o={}){const h=size.map(v=>v/2);for(let axis=0;axis<3;axis++)for(const side of [-1,1]){const k=(axis+1)%3,l=(axis+2)%3;this.surface((u,v)=>{const p=c.slice();p[axis]+=side*h[axis];p[k]+=(u*2-1)*h[k];p[l]+=(v*2-1)*h[l];return p;},axis===1?2:3,axis===1?2:5,{...o,scale:[size[k],size[l]]});}}
  tube(path,radius,o={},segments=24,sides=6){this.surface((u,v)=>{const c=path(u),e=.0001,t=norm(sub(path(Math.min(1,u+e)),path(Math.max(0,u-e)))),a=norm(cross(t,Math.abs(t[1])>.96?[1,0,0]:[0,1,0])),b=cross(t,a),r=typeof radius==='function'?radius(u):radius;return add(c,add(mul(a,cos(v*2*PI)*r),mul(b,sin(v*2*PI)*r)));},segments,sides,{...o,scale:[8,1]});}
  ring(cx,cz,r,w,y,o={}){this.surface((u,v)=>{const a=u*2*PI,R=r+(v-.5)*w;return[cx+sin(a)*R,y,cz+cos(a)*R];},96,3,{...o,scale:[r*2*PI,w]});}
  finish(){return{groups:this.groups.map(a=>new Float32Array(a)),objects:this.objects,triangles:this.groups.reduce((n,a)=>n+a.length/45,0),quality:this.quality,stride:15};}
 }
 const opts=(name,anchor,role,seed,height,mat,group=0)=>({name,anchor,role,seed,height,mat,group});
 function build(id,quality='balanced'){
  const w=HapaStages.worlds.find(w=>w.id===id);if(!w)throw Error('Unknown stage geometry '+id);const b=new Builder(quality),family=w.family;
  // Carved terraces: tangent grain follows circumference rather than a screen-space noise field.
  function rim(cx,cz,r,width,y){b.ring(cx,cz,r,width,y,opts('Carved terrace',[cx,y,cz],0,1,1,0));for(const d of [-.46,.46])b.ring(cx,cz,r+d*width,.034,y+.012,opts('Metal inset',[cx,y,cz],0,1,1,1,1));}
  function scrim(x,y,z,width,height,seed,role=2,mat=3,group=0){const anchor=[x,y,z];b.surface((u,v)=>[x+(u-.5)*width*(.82+.18*sin(v*PI)),y-v*height+.12*cos(u*PI*2)*v,z+.13*sin(u*PI*6)*sin(v*PI*.5)],12,22,{...opts('Suspended scrim',anchor,role,seed,height,mat,group),scale:[width,height]});
   if(group===0){b.tube(u=>[x+(u-.5)*width,y,z],.035,opts('Scrim lintel',anchor,0,seed,height,1,1),8,5);}}
  function pillar(x,z,ht,seed,mat=0,role=1,base=-1.4){const anchor=[x,base,z];b.box([x,base+.15,z],[.85,.30,.85],opts('Carved plinth',anchor,0,seed,ht,0));b.tube(u=>[x+sin(u*PI)*.24,base+u*ht,z-.38*u*u],u=>.22*(1-.42*u),opts('Rooted rib',anchor,role,seed,ht,mat),22,7);}
  function shadePair(z,y=3.8){for(const side of [-1,1])scrim(side*8.4,y,z,3.4,4.2,side+z,7,7,2);}
  if(family==='pressure'){
   rim(0,-2,8,.98,-.883);
   for(let i=0;i<11;i++){const a=-1.48+i*.296,x=sin(a)*9.15,z=-2-cos(a)*9.15,ht=4.6+1.0*cos(a*1.6),seed=i*.73;
    pillar(x,z,ht,seed,0,1,-1.15);
    const anchor=[x,-1.15,z];b.tube(u=>[x*(1-.19*u),-1.15+ht*u,z+1.35*u*u],u=>.10+.075*(1-u),opts('Inward listening rib',anchor,1,seed,ht,1,1),22,6);
    if(i%2===0)scrim(x*.93,ht-1.6,z+.5,1.32,2.85+i%3*.22,seed,2,3);
   }
   for(let i=0;i<10;i++){const a=-1.48+i*.296,da=.296,ht=4.8+.8*cos((a+da/2)*1.6),an=[sin(a)*9.15,-1.15,-2-cos(a)*9.15];
    b.tube(u=>{const aa=a+da*u;return[sin(aa)*9.15,ht-1.6+.38*sin(u*PI),-2-cos(aa)*9.15];},.12,opts('Crescent lintel',an,1,i*.73,ht,0),16,8);
    b.box([sin(a+da/2)*9.45,-.65,-2-cos(a+da/2)*9.45],[1.85,.6,.62],opts('Amphitheatre step',an,0,i,1,0));
   }
   shadePair(-13.4,4.4);
  }else if(family==='rain'){
   rim(0,0,9.25,1.74,-1.196);
   for(let i=0;i<9;i++){const a=-1.45+i*.3625,x=sin(a)*8.6,z=-1.5-cos(a)*8.6,h=4.6+.75*cos(a*2);const an=[x,-1.1,z];
    b.box([x,-.75,z],[.8,.7,.95],opts('Rainstone shoe',an,0,i,1,0));
    b.surface((u,v)=>[x+(u-.5)*1.02,-1.1+v*h,z+.35*sin(v*PI)],6,20,{...opts('Rain-glass shutter',an,3,i*.87,h,4),scale:[1,h]});
    for(const side of [-1,1])b.tube(u=>[x+side*.52,-1.1+u*h,z+.35*sin(u*PI)],.036,opts('Silver shutter stile',an,3,i*.87,h,2,1),20,5);
    if(i<8)b.tube(u=>[x+1.8*u,h-1.1+.24*sin(u*PI),z-.30*u],.045,opts('Canopy tine',an,1,i,h,1,1),10,5);
   }
   shadePair(-15,5);
  }else if(family==='tidal'||family==='windward'){
   const far=family==='tidal',z0=far?-10:-6;
   for(const side of [-1,1]){const x=side*(far?8.9:8.7);for(let j=0;j<3;j++)b.box([x,-2.2-j*.23,z0-j*1.6],[4.3-j*.35,.26,2.4],opts('Tidal terrace',[x,-2.3,z0],0,side,1,2));
    for(let j=0;j<5;j++){const xx=x+(j-2)*.58,zz=z0-1.8-Math.abs(j-2)*.38,h=(far?5.1:3.4)+(far?2.3:1.7)*sin((j+1)*PI/6),an=[xx,-1.9,zz];
     b.surface((u,v)=>[xx+(u-.5)*(.55+.15*sin(v*PI))*(1.-.68*v*v), -1.9+v*h,zz+.65*sin(v*PI)+side*(u-.5)*.6],5,22,{...opts('Wind harp vane',an,6,side+j*.69,h,far?2:3),scale:[.65,h]});
     b.tube(u=>[xx,-1.9+u*h,zz+.65*sin(u*PI)],.045,opts('Wind harp spine',an,6,side+j*.69,h,1,1),20,5);
    }
   }
   // Staggered architectural distance markers; leave the centre of the horizon unobstructed.
   for(const side of [-1,1])for(let j=0;j<9;j++){const x=side*(17+j*2.7),z=-24-j*2,h=1.1+(j%3)*.85;b.box([x,-2+h/2,z],[1.4,h,1.2],opts('Distant sea wall',[x,-2,z],0,j,1,0));}
   for(const side of [-1,1])for(let j=0;j<4;j++){const x=side*(6.1+j*1.35),zz=-8.5-j*1.7,h=2.4+.55*j,an=[x,-1.85,zz];b.surface((u,v)=>[x+(u-.5)*(.48+.08*j)*(1.-.55*v),-1.85+v*h,zz+.28*sin(v*PI)+side*(u-.5)*.34],5,18,{...opts('Near tide vane',an,6,side+j*.43,h,3),scale:[.52+.08*j,h]});}
   
   shadePair(-26,5.2);
  }else if(family==='celestial'){
   // Side fluted velvet apse. Open centre, so the oracle's silhouette remains the hero.
   b.surface((u,v)=>{const a=(u-.5)*3.5;return[sin(a)*7.6,-2.56+v*9.3,-2-cos(a)*5.2+.16*sin(u*86.)];},84,26,{...opts('Fluted velvet chamber',[0,-2.56,-2],1,.5,9.3,3),scale:[23,9.3]});
   for(const side of [-1,1])for(let i=0;i<5;i++){const x=side*(3.6+i*.64),z=-4.6-i*.26;
    scrim(x,4.8-(i%2)*.35,z,.62,8.0-i*.32,i*.8+side,2,3);
    b.tube(u=>[x,-3.3+u*8.2,z-.10],.036,opts('Apse gold stile',[x,-3.3,z],1,i*.8+side,8.2,1,1),22,5);
   }
   for(let j=0;j<20;j++){const a=j*PI*2/20,R=4.5,anchor=[0,.25,-5.4];
    b.tube(u=>{const rr=R+u*1.05,aa=a+.035*sin(u*PI);return[sin(aa)*rr,.25+cos(aa)*rr,-3.88+.14*sin(u*PI)];},.042,opts('Answering bronze rib',anchor,5,j*.55,5,1,1),14,6);
   }
   b.ring(0,-1,4.4,8.6,-2.565,opts('Sanctum outer floor',[0,-2.565,-1],0,1,1,0));
   rim(0,-1,5.9,.7,-2.545);
   for(let i=0;i<28;i++){const a=i*2.39996,R=3.6+(i%7)*.21,x=sin(a)*R,y=.25+cos(a)*R,z=-3.9;const an=[0,.3,z];
    b.box([x,y,z],[.032,.11,.026],opts('Constellation inlay',an,5,i*.38,1,5,1));
   }
   shadePair(-10,4.2);
  }else if(family==='solar'){
   for(let i=0;i<14;i++){const a=i*PI*2/14,anchor=[sin(a)*2.7,.35+cos(a)*2.7,-4.8];
    b.surface((u,v)=>{const aa=a+(u-.5)*(.20+.10*v),R=2.7+v*3.1;return[sin(aa)*R,.35+cos(aa)*R,-4.8+.48*sin(v*PI)];},5,16,{...opts('Heliostat petal',anchor,5,i*.72,3.1,1),scale:[1.1,3.1]});
    b.tube(u=>[sin(a)*(2.7+u*3.1),.35+cos(a)*(2.7+u*3.1),-4.76+.48*sin(u*PI)],.035,opts('Petal inlay',anchor,5,i*.72,3.1,2,1),18,5);
   }
   rim(0,-1,4.5,1.8,-2.58);shadePair(-10,4.0);
  }else if(family==='textile'){
   for(const side of [-1,1])for(let j=0;j<3;j++){const x=side*(3.3+j*1.25),y=3.7-j*.40,z=-3.5-j*1.6;
    scrim(x,y,z,1.5,5.2-j*.35,j*.9+side,2,3);
    for(const edge of [-1,1])b.tube(u=>[x+edge*.78,y-u*5.6,z],.055,opts('Loom upright',[x,y-5.6,z],1,j+side,5.6,1,1),18,5);
   }
   rim(0,-1,5.2,.8,-2.02);shadePair(-12,4.3);
  }else if(family==='hearth'||family==='organ'){
   const organ=family==='organ';rim(0,organ?-.5:0,organ?7.6:6.8,1.6,organ?-1.925:-1.79);
   for(let i=0;i<(organ?13:9);i++){const n=organ?13:9,a=-1.55+i*3.10/(n-1),R=organ?7.3:7.2,x=sin(a)*R,z=(organ?-1:0)-cos(a)*R,h=(organ?4.7:3.8)+(organ?1.7:1.25)*cos(a*1.4),an=[x,-1.8,z];
    b.box([x,-1.48,z],[.86,.65,.86],opts('Basalt buttress',an,0,i,1,0));
    b.tube(u=>[x+(organ?.10:.45)*sin(u*PI),-1.8+u*h,z+.40*u*u],u=>(organ?.24:.34)*(1-.3*u),opts(organ?'Telescoping resonator':'Warm flue',an,organ?4:1,i*.57,h,6),26,8);
    if(organ||i%2===0){const ya=h-1.9;b.surface((u,v)=>[x+(u-.5)*.9,ya-v*2.4,z+.45+.1*sin(v*PI*2)],6,14,{...opts('Copper heat shutter',[x,ya,z+.45],3,i*.71,2.4,1),scale:[.9,2.4]});}
   }
   shadePair(-12,4);
  }else if(family==='porcelain'||family==='copper'){
   const copper=family==='copper';
   for(const side of [-1,1])for(let i=0;i<8;i++){const x=side*(copper?5.05:5.4),z=3.0-i*1.52,h=3.6+.70*sin(i*.8),an=[x,-1.64,z];
    b.box([x,-1.6,z],[.68,.34,1.08],opts('Chapel plinth',an,0,i,1,0));
    b.surface((u,v)=>[x+side*.28*sin(v*PI),-1.64+v*h,z+(u-.5)*(copper?.84:1.13)],6,18,{...opts(copper?'Copper lamella':'Porcelain bellows',an,3,i*.62+side,h,copper?1:2),scale:[1.15,h]});
    b.tube(u=>[x+side*.28*sin(u*PI),-1.64+u*h,z-.46],.045,opts('Baffle seam',an,3,i*.62+side,h,copper?2:1,1),18,5);
    {const high=3.45+i*.05+(i%2)*.12;b.surface((u,v)=>[side*(4.6-u*2.65),high+.65*sin(u*PI),z+(v-.5)*(.72+.08*((i%3)-1))],12,3,{...opts('Articulated vault blade',[side*4.6,-1.64,z],1,i+side,5.7,copper?1:2),scale:[3.35,.82]});}
   }
   // Floor tesserae sit above native plane, confined to side aisles.
   for(const side of [-1,1])for(let j=0;j<7;j++)b.box([side*4.0,-1.641,2-j*1.65],[.95,.022,1.42],opts('Inlaid aisle tile',[side*4,-1.64,0],0,j,1,0,1));
   shadePair(-13,4.7);
  }
  const out=b.finish();out.world=id;out.family=family;return out;
 }
 return{build,Builder};
})();

