
/* Octave 0.8: eight regional instruments over the existing source-time response bank.
 * Availability and actor-role enablement are explicit. No word/emotion inference.
 * Region coordinates are rest-local coordinates, so trim and cloth remain attached.
 */
'use strict';
window.HapaOctave=(()=>{
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x)};
 const regions=[
  {id:'voice',name:'Mask / stellar core',sources:['lead-vocals'],role:'voice',verb:'open · sustain · exhale'},
  {id:'left',name:'Left mantle / streamers',sources:['guitar'],role:'lace',verb:'pluck · curl · carry'},
  {id:'right',name:'Right mantle / streamers',sources:['keyboard'],role:'lace',verb:'fan · ripple · settle'},
  {id:'hem',name:'Lower drape',sources:['bass'],role:'breath',verb:'lift · drag · return'},
  {id:'crown',name:'Answering crown',sources:['backing-vocals'],role:'answer',verb:'counter-turn · unfold'},
  {id:'shoulders',name:'Shoulder frame',sources:['drums'],role:'strikes',verb:'impact · opposite recoil'},
  {id:'sky',name:'Inner field / flowing dye',sources:['synth','strings','other'],role:'nebula',verb:'drift · diffuse · migrate'},
  {id:'fringe',name:'Gems / fine fringe',sources:['percussion','brass','woodwinds'],role:'jewels',verb:'quiver · glint · rest'}
 ];
 const styles=['silken-current','oracle-procession','crown-engine'];
 const defaultGains=()=>Object.fromEntries(regions.map(r=>[r.id,1]));
 function validateGains(v){if(!v||typeof v!=='object'||Object.keys(v).length!==regions.length||regions.some(r=>!Number.isFinite(v[r.id])||v[r.id]<0||v[r.id]>1))throw Error('Regional gains must contain all eight 0–1 values');}
 function evaluate(cache,state,t,provided={}){
  const cfg=state.reliquary,bank=provided.kin||HapaArticulation.evaluate(cache,state,t),mac=provided.macro||HapaDirector.evaluate(cache.score,cache,state,t).values;
  const motion=state.reduced?0:mac.motion,active=cfg?.animated&&cfg?.regional&&!state.reduced;
  const peakDrive=clamp(Math.max(
   bank.signals['lead-vocals'].attack*.88+bank.signals['lead-vocals'].sustain*.42,
   Math.abs(bank.signals.drums.strike)*.95+bank.signals.drums.low*.12,
   bank.signals.bass.mass*.86+bank.signals.bass.low*.12,
   bank.signals['backing-vocals'].sustain*.72,
   Math.max(Math.abs(bank.signals.guitar.strike),Math.abs(bank.signals.keyboard.strike))*.68,
   (bank.signals.synth.sustain*.34+bank.signals.strings.sustain*.28),
   motion*.58
  ),0,1.2);
  const phr=HapaCurrents.evaluate(cache,state,t,{kin:bank});const oldPeak=smooth(.18,.96,peakDrive);const breadthPeak=phr.on?oldPeak+(phr.selected-oldPeak)*phr.contrast:oldPeak, movementScale=1+4*(cfg?.breadthAmount??1)*breadthPeak;
  const gain=active?cfg.clothAmount*(.35+.65*motion)*movementScale:0;
  const trace={},q={};
  for(const r of regions){
   const enabled=active&&cfg.roles[r.role]!==false,g=enabled?cfg.regionGains[r.id]:0;
   const ss=r.sources.map(id=>bank.signals[id]);
   const pick=k=>Math.max(0,...ss.map(s=>s[k]||0));
   const signed=ss.reduce((a,s)=>Math.abs(s.strike)>Math.abs(a)?s.strike:a,0);
   const phase=ss.reduce((n,s)=>n+(s.phase||0),0);
   q[r.id]={amplitude:clamp(.62*pick('sustain')+.25*pick('attack')+.13*pick('mass'))*g,
    mass:pick('mass')*g,attack:pick('attack')*g,strike:signed*g,color:pick('color')*g,phase:enabled&&g>0?phase:0};
   trace[r.id]={name:r.name,verb:r.verb,gain:g,amplitude:q[r.id].amplitude,signedRecoil:q[r.id].strike,
    inputs:r.sources.map((id,i)=>({id,availability:ss[i].availability,enabled:ss[i].enabled,sourceAssetId:ss[i].sourceAssetId}))};
  }
  const A=[q.voice.amplitude,q.left.amplitude,q.right.amplitude,q.hem.mass].map(v=>v*gain);
  const B=[q.crown.amplitude,q.shoulders.strike,q.sky.amplitude,q.fringe.strike].map(v=>v*gain);
  const phase=[q.voice.phase,q.left.phase*1.8,q.right.phase*1.6,q.hem.phase*.8];
  const extras=[q.crown.phase*.8,q.sky.phase*.32,q.fringe.phase*1.2,active?t*.09:0];
  const locks=state.cut?HapaEditorial.frame(state,state._cueTime??t).shot.locks:null;
  const dye=active&&cfg.paletteMotion&&!locks?.look&&!locks?.shot?cfg.dyeAmount*(.3+.7*q.sky.color)*(1+1.25*(cfg?.breadthAmount??1)*breadthPeak)*(.35+.65*mac.radiance):0;
  return{A,B,phase,extras,dye,trace,motion,choreo:phr.shape,packet:phr.packetUniform,packetColor:phr.packet.color,phrase:phr.stage,time:cfg?.animated?t:0,peakDrive,breadthPeak,movementScale,
    restriction:state.reduced?'Displacement disabled by reduced motion':active?'regional map enabled':'regional map disabled'};
 }
 // Exact regional rest-space offsets shared with the GPU. The model transform is downstream.
 function offset(p,reg,q){
  if(!q)return[0,0,0];const [x,y,z]=p,A=q.A,B=q.B,P=q.phase;
  if(reg>.5&&reg<1.5){const r=Math.hypot(x/.9,(y-.07)/1.28),mask=1-smooth(.08,1.1,r);return[x*A[0]*.022*mask,(y-.07)*A[0]*.018*mask,A[0]*.018*mask];}
  if(reg>1.5&&reg<3.5){
   const left=1-smooth(-.24,.24,x),right=1-left,flank=smooth(.30,1.55,Math.abs(x));
   const pin=(.24+.76*flank)*(reg>2.5?.72:1-smooth(.95,2.25,y)*.72);
   const waveL=Math.sin(P[1]-y*3.1+x*.6),waveR=Math.sin(P[2]-y*2.5-x*.8);
   const ch=q.choreo||[0,0,0,0];const curl=(A[1]*left*waveL+A[2]*right*waveR)*pin;const gather=ch[0],opening=ch[1],settle=ch[2];const sweep=(opening*.32*Math.sin(P[3]*.65-y*1.15)-settle*.07*Math.sin(P[3]*.38-y*.7))*flank;
   const hem=smooth(.10,2.6,-y),flow=Math.sin(P[3]-y*1.8+x*.75);
   return[.09*curl+.035*A[3]*hem*flow-x*gather*.08*flank+Math.sign(x)*opening*.14*flank, .07*A[3]*hem*Math.cos(P[3]*.7+x)+.025*B[1]*flank+gather*.08*flank,
    .24*curl+.14*A[3]*hem*flow+.045*B[1]*flank*(1-hem*.6)+sweep];
  }
  return[0,0,0];
 }
 const glsl=`
uniform vec4 uRegionA,uRegionB,uRegionPhase,uRegionExtra,uPhraseShape;
vec3 octaveOffset(vec3 p,float reg){
 if(reg>.5&&reg<1.5){float r=length(vec2(p.x/.9,(p.y-.07)/1.28)),m=1.-smoothstep(.08,1.1,r);return vec3(p.x*uRegionA.x*.022*m,(p.y-.07)*uRegionA.x*.018*m,uRegionA.x*.018*m);}
 if(reg>1.5&&reg<3.5){
  float l=1.-smoothstep(-.24,.24,p.x),r=1.-l,flank=smoothstep(.30,1.55,abs(p.x));
  float pin=(.24+.76*flank)*(reg>2.5?.72:1.-smoothstep(.95,2.25,p.y)*.72);
  float curl=(uRegionA.y*l*sin(uRegionPhase.y-p.y*3.1+p.x*.6)+uRegionA.z*r*sin(uRegionPhase.z-p.y*2.5-p.x*.8))*pin;
  float hem=smoothstep(.10,2.6,-p.y),flow=sin(uRegionPhase.w-p.y*1.8+p.x*.75);float sweep=(uPhraseShape.y*.32*sin(uRegionPhase.w*.65-p.y*1.15)-uPhraseShape.z*.07*sin(uRegionPhase.w*.38-p.y*.7))*flank;
  return vec3(.09*curl+.035*uRegionA.w*hem*flow-p.x*uPhraseShape.x*.08*flank+sign(p.x)*uPhraseShape.y*.14*flank,.07*uRegionA.w*hem*cos(uRegionPhase.w*.7+p.x)+.025*uRegionB.y*flank+uPhraseShape.x*.08*flank,
   .24*curl+.14*uRegionA.w*hem*flow+.045*uRegionB.y*flank*(1.-hem*.6)+sweep);
 }return vec3(0.);
}`;
 return{regions,styles,defaultGains,validateGains,evaluate,offset,glsl};
})();

