// Fixed budgets for the added environment marks only. Fire/Dust simulation
// resolution is unchanged; these are not general device support claims.
export function campfireEnvironmentProfile(value='high'){
 const name=['low','med','high'].includes(value)?value:'high';
 return {name,...({low:{count:96,gain:.65,sparkScale:.6},med:{count:192,gain:.85,sparkScale:.8},high:{count:256,gain:1,sparkScale:1}}[name])};
}
export function createEnvironmentAccent(){return {at:-1e6,strength:0,angle:0};}
export function recordEnvironmentAccent(state,time,strength){
 state.at=time;state.strength=Math.max(0,Math.min(1.5,strength));
 // Alternate sideward arcs so a rare accent has a followable trajectory.
 state.angle=(Math.sin(time*.71)<0?Math.PI:0)+.25*Math.sin(time*.23);
 return state;
}
