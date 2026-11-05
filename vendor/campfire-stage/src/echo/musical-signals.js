// Master-spectrum and authored-cue envelopes. These are not isolated stems.
const finite=(x,fallback=0)=>Number.isFinite(x)?x:fallback;
const clamp=(x,max=1)=>Math.max(0,Math.min(max,finite(x)));
const mean=(bands,indices)=>indices.reduce((sum,i)=>sum+clamp(bands?.[i]),0)/indices.length;
const low=bands=>mean(bands,[0,1,2,3,4,5]);
const high=bands=>mean(bands,[24,26,28,30]);
function follow(value,target,dt,attack,release){return value+(target-value)*(1-Math.exp(-dt/(target>value?attack:release)));}

export function createCampfireSignals({intensity=0,bands=[]}={}){
 const bass=low(bands),treble=high(bands);
 return {slowEnergy:clamp(.8*clamp(intensity)+.2*bass),bass,highFast:treble,highFloor:treble,beat:0,transient:0,accentArmed:true,lastAccentAt:-1000000,warmedSeconds:0};
}

export function stepCampfireSignals(state,{dt,time,intensity,bands,kick=0,shock=0,accentLevel=.3,reduced=false}){
 const step=clamp(dt,.1),bass=low(bands),treble=high(bands);
 state.slowEnergy=follow(state.slowEnergy,clamp(.8*clamp(intensity)+.2*bass),step,.9,2.2);
 state.bass=follow(state.bass,bass,step,.10,.45);
 state.highFast=follow(state.highFast,treble,step,.035,.16);
 state.highFloor=follow(state.highFloor,treble,step,1.1,2);
 state.beat=reduced?0:Math.max(state.beat*Math.exp(-step/.22),clamp(kick,1.5));
 state.transient=reduced?0:state.transient*Math.exp(-step/.22);
 state.warmedSeconds+=step;
 const novelty=Math.max(0,state.highFast-state.highFloor);
 if(novelty<.045)state.accentArmed=true;
 const level=clamp(accentLevel,1),at=finite(time),ready=at-state.lastAccentAt>=3&&state.warmedSeconds>=.4;
 const onset=novelty>.35&&state.accentArmed;
 const accentOpportunity=level>0&&ready&&(onset||shock>.45);
 const emitAccent=!reduced&&accentOpportunity;
 let accentStrength=0;
 if(accentOpportunity){
  accentStrength=clamp(Math.max(clamp(shock,2)*.55,clamp((novelty-.30)/.25+.30))*Math.min(2,level/.3),1.5);
  state.transient=reduced?0:Math.max(state.transient,accentStrength);state.lastAccentAt=at;
  if(onset)state.accentArmed=false;
 }
 return {slowEnergy:state.slowEnergy,bass:state.bass,highFast:state.highFast,beat:state.beat,transient:state.transient,novelty,accentOpportunity,emitAccent,accentStrength};
}
