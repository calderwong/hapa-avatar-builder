// Local response of the existing score controls, not another musical timeline.
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const bound=(value,lo,hi,fallback)=>Math.max(lo,Math.min(hi,finite(value,fallback)));
const targets=input=>({
 hold:bound(input.hold,0,1,0),omega:bound(input.omega,1,10,4),
 flow:bound(input.flow,0,1,.1),scale:bound(input.scale,.1,1.5,.7),
 anchor:bound(input.anchor,.8,2.2,1.55),calm:bound(input.calm,0,1,0),
 protection:bound(input.protection,0,1,0),rotation:finite(input.rotation,0)
});
export function createCampfireMotion(input={}){return targets(input);}
export function stepCampfireMotion(state,input,dt,{reading=false,burst=false}={}){
 const target=targets(input),step=bound(dt,0,.1,0);
 for(const key of Object.keys(target)){
  let delta=target[key]-state[key];
  if(key==='rotation')delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  // Short hooks need a quick settle; long forms have a softer catch and tail.
  const timing=burst?.035:reading?.065:key==='hold'?.18:key==='protection'?.10:.30;
  const release=key==='hold'&&delta<0?Math.min(timing,.12):timing;
  state[key]+=delta*(1-Math.exp(-step/release));
 }
 return state;
}
