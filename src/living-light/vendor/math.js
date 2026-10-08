
'use strict';
window.HapaMath=(()=>{
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s);
const norm=a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=(a,b)=>{const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
const transform=(m,v)=>Array.from({length:4},(_,i)=>m[i]*v[0]+m[4+i]*v[1]+m[8+i]*v[2]+m[12+i]*(v[3]??1));
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function model(pos,angles=[0,0,0],s=1){let m=identity();let [x,y,z]=angles;let c=Math.cos(x),d=Math.sin(x);m=mul(m,[1,0,0,0,0,c,d,0,0,-d,c,0,0,0,0,1]);c=Math.cos(y);d=Math.sin(y);m=mul(m,[c,0,-d,0,0,1,0,0,d,0,c,0,0,0,0,1]);c=Math.cos(z);d=Math.sin(z);m=mul(m,[c,d,0,0,-d,c,0,0,0,0,1,0,0,0,0,1]);for(let i=0;i<12;i++)m[i]*=s;m[12]=pos[0];m[13]=pos[1];m[14]=pos[2];return m;}
function camera(t,aspect,state,evalFrame){
 const kind=HapaCore.worlds.find(w=>w.id===state.world).kind,m=evalFrame.values['camera.motion'];
 const d=evalFrame.director?.values||{intimacy:.6,reveal:.5},phase=evalFrame.phase;
 const still=state.camera==='still'||state.reduced,clock=still?0:t;
 let eye,target;
 if(kind===0){const z=still?-7:-7+phase;eye=[.18*Math.sin(clock*.07)*m,.13*Math.cos(clock*.06)*m,z];target=[0,.05,z+12];}
 else{
  // Bounded orbit from absolute transport phase. Motion adjusts excursion, not time scale.
  const a=still?.11:.12+Math.sin(phase*.023)*.50*m;
  const closeness=still?.65:d.intimacy;const r=kind===1?9.3+(1-closeness)*2.5:8.6+(1-closeness)*3.3;
  eye=[Math.sin(a)*r,1.25+(1-closeness)*.6+.18*Math.sin(clock*.04)*m,Math.cos(a)*r];target=[0,.12,.5];if(kind===5){eye=[Math.sin(a)*r,1.75+(1-closeness)*1.2,Math.cos(a)*r+1.4];target=[0,-.05,-1.8];}
 }
 if(kind===6){
  const cfg=state.reliquary||HapaReliquary.defaults(),ix=still?.78:d.intimacy;
  let r=cfg.framing==='close'?4.9:cfg.framing==='portrait'?6.7:cfg.framing==='chamber'?10.7:6.0+(1-ix)*4.0;
  const a=still?0:Math.sin(phase*.010)*.15*m;
  eye=[Math.sin(a)*r,.05+(cfg.framing==='chamber'?.65:0),Math.cos(a)*r];target=[0,-.30,0];
 }

 if(kind>=7){const radius=kind===8?10.6:kind===9?9.7:10.;eye=[0,kind===8?2.2:1.6,radius];target=[0,.4,-.15];}
 if(kind===12){eye=[0,2.35,16.8];target=[0,.10,-1.3];if(HapaContour.active(state)){eye=[0,1.4,9.4];target=[0,.4,-2.4];}}
 if(kind===13){eye=[0,1.35,14.0];target=[0,-.05,-2.3];if(HapaContour.active(state)){eye=[0,1.3,9.0];target=[0,.5,-2.8];}}
 if(kind===14){if(window.HapaContour&&HapaContour.active(state)){eye=[0,1.35,12.15];target=[0,.55,-1.9];}else{eye=[0,1.65,16.2];target=[0,.05,-1.9];}}
 if(kind===15){eye=[0,1.5,8.5];target=[0,-.10,0.];}
 if(kind===16){eye=[0,1.4,11.5];target=[0,.15,-.8];}
 if(kind===24){eye=[0,1.8,11.4];target=[0,.65,-2.];}if(kind===25){eye=[.4,1.6,12.2];target=[0,.85,-2.6];}
 if(kind===21){eye=[0,2.0,9.8];target=[0,.74,-1.7];}
 if(kind===22){eye=[0,1.0,10.8];target=[0,.55,-1.0];}
 if(kind===20){eye=[1.0,2.20,8.8];target=[0,.25,-2.];}
 if(kind===18){eye=[0,2.8,12.4];target=[0,-.28,-2.4];}
 const cfg=state.reliquary,k=evalFrame.articulation;
 let motionTelemetry=null;
 if(kind>0&&cfg?.orbitInstrument&&!still&&k){
  const studyOrbit=(kind===12||kind===13||kind===14),baseAmp=studyOrbit?(.045+.075*cfg.orbitWidth):(kind===6?.15+.30*cfg.orbitWidth:kind===4?.22+.48*cfg.orbitWidth:.18+.42*cfg.orbitWidth);
  const peakBoost=(cfg.cameraSurge??.85)*(k.breadthPeak??0);
  const amp=baseAmp*(.34+.76*m)*(1+.55*peakBoost);
  const ph=k.phase; // Already integrated; never phase × instantaneous speed.
  const ang=Math.sin(ph)*amp+.08*peakBoost*Math.sin(ph*.5);
  const oldR=Math.hypot(eye[0],eye[2]-(kind===5?1.4:0));
  const bass=k.signals.bass.mass,voice=k.signals['lead-vocals'].sustain;
  const radius=oldR-.18*bass-.12*voice-.20*peakBoost*(.25+.75*bass);
  const lift=(.13+.08*peakBoost)*(kind===6?.6:1);
  eye=[Math.sin(ang)*radius,eye[1]+Math.sin(ph*.62)*lift+.05*peakBoost*Math.cos(ph*.35),Math.cos(ang)*radius+(kind===5?1.4:0)];
  motionTelemetry={phase:ph,phaseRate:k.phaseRate,angle:ang,phaseAngularRate:Math.cos(ph)*amp*k.phaseRate,envelope:'bounded upright arc with peak surge',source:k.cameraSource,peakDrive:k.peakDrive||0,breadthPeak:k.breadthPeak||0,cameraScale:k.cameraScale||1};
 }
 const hero=HapaCurrents.camera(state,t,evalFrame,eye,target,kind);eye=hero.eye;target=hero.target;if(hero.hero)motionTelemetry={...(motionTelemetry||{}),hero:hero.hero};
 const cut=state.cut?HapaEditorial.frame(state,state._cueTime??t):null;
 if(!state._noPortal&&cut&&kind>=2&&kind<6&&cut.portal>0){const l=cut.layout.A,p=cut.portal,center=[l.x,.2+l.y,1.45+l.z],normal=[Math.sin(l.yaw),0,Math.cos(l.yaw)];const goal=add(center,scale(normal,1.05*l.scale));eye=eye.map((v,i)=>v+(goal[i]-v)*p);target=target.map((v,i)=>v+(center[i]-v)*p);}
 if(state._pose)return fromPose(state._pose,aspect,kind);
 const frozen=cut?.shot?.cameraPose; if(frozen){eye=[...frozen.eye];target=add(eye,frozen.forward);}
 let forward=norm(sub(target,eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);
 if(!frozen){const damp=1-(cut?.portal||0);forward=norm(add(add(scale(forward,Math.cos(state.yaw*damp)*Math.cos(state.pitch*damp)),scale(right,Math.sin(state.yaw*damp)*Math.cos(state.pitch*damp))),scale(up,Math.sin(state.pitch*damp))));}
 right=norm(cross(forward,[0,1,0]));up=cross(right,forward);
 const fov=frozen?.fov||state.fov;const f=1/Math.tan(fov*Math.PI/360),near=.08,far=140;
 const proj=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
 const view=new Float32Array([right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,-dot(right,eye),-dot(up,eye),dot(forward,eye),1]);
 return {eye,forward,right,up,pv:mul(proj,view),fov:fov*Math.PI/180,near,far,kind,instrument:frozen?null:motionTelemetry};
}
function fromPose(pose,aspect,kind){
 const eye=pose.eye,forward=norm(pose.forward),right=norm(cross(forward,pose.up||[0,1,0])),up=cross(right,forward),fov=pose.fov||53,near=.08,far=140,f=1/Math.tan(fov*Math.PI/360);
 const proj=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
 const view=new Float32Array([right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,-dot(right,eye),-dot(up,eye),dot(forward,eye),1]);
 return {eye,forward,right,up,pv:mul(proj,view),fov:fov*Math.PI/180,near,far,kind};
}
return{fromPose,dot,add,sub,scale,norm,cross,mul,transform,identity,model,camera};
})();

