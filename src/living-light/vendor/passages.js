
/* Passages 0.6: pure, source-time transition score. No clock or GPU ownership.
 * A bridge owns an explicit interval ending at a shot boundary. Plan -> approve -> render.
 * No random decisions during playback. Frozen/locked shots produce stationary handoffs.
 */
'use strict';
window.HapaPassages=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 const smooth=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
 const clone=x=>structuredClone(x);
 const worlds=['neon-cloister','lumen-arcade','halo-vault','stormglass-rotunda','voltaic-harp','alchemical-court','celestial-reliquary','resonance-vault','solar-reliquary','weave-study','threshold-theatre','tidal-observatory','circuit-basilica','astral-anchorage','cloud-choir','rain-court','windward-reach','hearth-of-three','cinder-organ','confluence-court','prism-sanctum','echo-lattice','contour-gallery'];
 const styles=['neon-cascade','arc-relay','fractal-loom','threshold','thread','media-weave','braid','iris-bloom','reliquary-thread','halo-bloom','oracle-procession','silken-current','crown-engine','circuit-transit','cloud-slipstream','tidal-conduit','ember-passage','pressure-passage','prism-spindle','echo-drift','contour-fold'];
 const paletteCycle=['copper-nocturne','blue-hour','gilded-tide','ember-memory'];
 function plan(score,shots,pace='flow',mix='fractal-first'){
  if(!['flow','balanced'].includes(pace))throw Error('Unknown journey pace');
  if(!['fractal-first','new-designs'].includes(mix))throw Error('Unknown tunnel mix');
  const out=[],seq=['tidal-observatory','celestial-reliquary','solar-reliquary','resonance-vault','celestial-reliquary','weave-study'];
  const designs=mix==='new-designs'?['silken-current','oracle-procession','crown-engine']:['fractal-loom','fractal-loom','silken-current','fractal-loom','oracle-procession','fractal-loom','fractal-loom','crown-engine'];
  const names={'fractal-loom':'Golden Loom · Fractal','silken-current':'Silken Current','oracle-procession':'Oracle Procession','crown-engine':'Crown Engine'};
  const looks={'celestial-reliquary':'astral-brocade','tidal-observatory':'pearl-tide','solar-reliquary':'blue-hour','resonance-vault':'cinder-jade','weave-study':'gilded-tide'};
  let from='celestial-reliquary';
  for(let i=1;i<shots.length&&out.length<12;i++){
   if(pace==='balanced'&&i%2===0)continue;
   const prev=shots[i-1],arrival=shots[i].start,span=prev.end-prev.start;
   const dwell=pace==='flow'?Math.max(2.5,Math.min(4.0,span*.12)):Math.max(5,span*.45);
   const duration=+Math.min(60,span-dwell).toFixed(3);if(duration<4)continue;
   const n=out.length,to=i===shots.length-1?'celestial-reliquary':seq[n%seq.length];
   out.push({id:'passage-'+(n+1),label:names[designs[n%designs.length]]+' '+(n+1),from,to,fromShot:prev.id,toShot:shots[i].id,
    start:+(arrival-duration).toFixed(3),arrival,duration,style:designs[n%designs.length],entry:.18,length:36+(n%3)*4,reveal:.32,continuity:.68,wallMedia:false,toPalette:looks[to],locked:false,
    cueBasis:'Existing measured-change editorial boundary; title-blind flow recipe. Arrival is not a certified beat.'});from=to;
  }
  HapaRealms.decorate(out);HapaWater.decorate(out);HapaFire.decorate(out);HapaWind.decorate(out);
  const p={schema:'hapa.passages/0.8.9',enabled:true,baseWorld:'celestial-reliquary',polish:true,pace,mix,bridges:out};return mix==='fractal-first'?heroMix(p):p;
 }

 // Decoration may choose destinations, but a later overlay must not silently erase
 // the user's primary travel language. Reserve one Contour and one Lattice journey.
 function heroMix(p,target=.62){
  const list=p.bridges,total=list.reduce((n,b)=>n+b.duration,0);
  if(!list.length||!total)return p;
  const reserve=new Set();for(const style of ['contour-fold','echo-drift']){const i=list.findIndex(b=>b.style===style);if(i>=0)reserve.add(i);}
  const order=list.map((b,i)=>i).filter(i=>!reserve.has(i)).sort((a,b)=>(a===0?-1:b===0?1:list[b].duration-list[a].duration));
  let have=list.filter(b=>b.style==='fractal-loom').reduce((n,b)=>n+b.duration,0);
  for(const i of order){if(have/total>=target&&list[0].style==='fractal-loom')break;const b=list[i];if(b.style!=='fractal-loom'){b.style='fractal-loom';b.label='Golden Loom · Geometry Dance '+(i+1);have+=b.duration;}}
  // Extremely short schedules may lack room for all three families. Prioritize the
 // chosen fractal share, then leave every alternative explicitly selectable.
  if(have/total<target)for(const i of [...reserve]){const b=list[i];if(b.style!=='fractal-loom'){b.style='fractal-loom';b.label='Golden Loom · Geometry Dance '+(i+1);have+=b.duration;}if(have/total>=target)break;}
  p.mix='fractal-first';return p;
 }
 function coverage(p,duration){const passage=p.bridges.reduce((n,b)=>n+b.duration,0),flight=p.bridges.reduce((n,b)=>n+b.duration*(1-(b.entry??.27)),0);return{count:p.bridges.length,passageSeconds:passage,flightSeconds:flight,passageRatio:passage/duration,flightRatio:flight/duration,fractalSeconds:p.bridges.filter(b=>['fractal-loom','threshold','thread','media-weave','braid','iris-bloom','reliquary-thread','halo-bloom'].includes(b.style)).reduce((n,b)=>n+b.duration,0)};}
 function replan(state,score,pace){
  if(state.passages.bridges.some(b=>b.locked)||state.director.shots.some(s=>s.locks?.shot||s.locks?.camera))throw Error('Unlock protected route endpoints before replanning; existing takes are unchanged.');
  const next=plan(score,state.director.shots,pace,state.passages.mix||'fractal-first');for(const b of next.bridges){const old=state.passages.bridges.find(x=>x.toShot===b.toShot);if(old)for(const k of ['to','toPalette','style','label','length','wallMedia','continuity','reveal'])b[k]=old[k];}let from=next.baseWorld;for(const b of next.bridges){b.from=from;from=b.to;}if(next.mix==='fractal-first')heroMix(next);validate({...state,passages:next},score);
  HapaEditorial.checkpoint(state,'Replan '+pace+' itinerary');state.passages=next;
  for(const b of next.bridges){const dest=state.director.shots.find(s=>s.id===b.toShot);if(dest?.media&&!dest.locks?.media)dest.media.portal=false;}
  HapaEditorial.saveActive(state);return clone(next);
 }
 function setMix(state,score,mix){
  if(!['fractal-first','new-designs'].includes(mix))throw Error('Unknown tunnel mix');
  if(state.passages.bridges.some(b=>b.locked)||state.director.shots.some(s=>s.locks?.shot||s.locks?.camera))throw Error('Unlock protected route endpoints before changing tunnel mix');
  const next=clone(state.passages),seq=mix==='new-designs'?['silken-current','oracle-procession','crown-engine']:['fractal-loom','fractal-loom','silken-current','fractal-loom','oracle-procession','fractal-loom','fractal-loom','crown-engine'];
  const labels={'fractal-loom':'Golden Loom · Fractal','silken-current':'Silken Current','oracle-procession':'Oracle Procession','crown-engine':'Crown Engine'};
  if(mix==='fractal-first')heroMix(next);else next.bridges.forEach((b,i)=>{b.style=seq[i%seq.length];b.label=labels[b.style]+' '+(i+1);});next.mix=mix;
  validate({...state,passages:next},score);HapaEditorial.checkpoint(state,'Tunnel mix '+mix);state.passages=next;HapaEditorial.saveActive(state);return clone(next);
 }
 function init(score,state){state.passages=plan(score,state.director.shots);for(const b of state.passages.bridges){const dest=state.director.shots.find(s=>s.id===b.toShot);if(dest?.media)dest.media.portal=false;}return state.passages;}
 function validate(state,score){
  const p=state.passages;if(!p||p.schema!=='hapa.passages/0.8.9'||typeof p.enabled!=='boolean'||typeof p.polish!=='boolean'||!worlds.includes(p.baseWorld)||!Array.isArray(p.bridges)||p.bridges.length>12)throw Error('Invalid passage score');
  if(p.mix!==undefined&&!['fractal-first','new-designs'].includes(p.mix))throw Error('Unknown tunnel mix');
  let last=0,world=p.baseWorld;const ids=new Set();
  for(const b of p.bridges){
   if(typeof b.id!=='string'||ids.has(b.id)||!styles.includes(b.style)||!HapaCore.palettes.some(p=>p.id===b.toPalette)||typeof b.label!=='string'||b.label.length>80||!worlds.includes(b.to)||b.from!==world||typeof b.locked!=='boolean'||typeof b.wallMedia!=='boolean')throw Error('Invalid passage identity/route');
   if(b.entry!==undefined&&(!Number.isFinite(b.entry)||b.entry<.12||b.entry>.35))throw Error('Invalid entry fraction');
   ids.add(b.id);const prev=state.director.shots.find(s=>s.id===b.fromShot),next=state.director.shots.find(s=>s.id===b.toShot);
   if(!prev||!next||Math.abs(prev.end-next.start)>.001)throw Error('Passage endpoints must be adjacent shots');
   if(![b.start,b.arrival,b.duration,b.length,b.reveal,b.continuity].every(Number.isFinite)||b.start<last||b.start<prev.start||Math.abs(b.arrival-next.start)>.001||Math.abs(b.arrival-b.start-b.duration)>.001||b.duration<4||b.duration>60||b.length<12||b.length>54||b.reveal<.12||b.reveal>.75||b.continuity<0||b.continuity>1||b.arrival>score.duration)throw Error('Invalid passage timing or bounds');
   last=b.arrival;world=b.to;
  }return true;
 }
 function protection(state,b){const a=state.director.shots.find(s=>s.id===b.fromShot),z=state.director.shots.find(s=>s.id===b.toShot);return !a||!z?'missing endpoint':a.locks.shot||z.locks.shot?'protected shot':a.locks.camera||z.locks.camera?'frozen camera':state.reduced||state.camera==='still'?'reduced/still camera':null;}
 function at(state,t){
  const p=state.passages;if(!p?.enabled)return{active:false,world:state.world,stage:'single world',reason:null};let world=p.baseWorld,palette=state.palette;
  for(const b of p.bridges){
   if(t<b.start)return{active:false,world,palette,stage:'in scene',next:b};
   if(t>=b.arrival){world=b.to;palette=b.toPalette;continue;}
   const u=clamp((t-b.start)/b.duration),reason=protection(state,b),entry=b.entry??.27,flight=clamp((u-entry)/(1-entry));
   const reveal=smooth((flight-b.reveal)/.22),stage=u<.07?'prepare':u<entry?'enter':flight<b.reveal?'travel':flight<.90?'reveal':'land';
   return{active:true,world:b.from,palette,to:b.to,bridge:b,u,entry,flight,progress:smooth(flight),reveal,stage:reason?'quiet handoff':stage,reason,quiet:!!reason,
    // Pulse/material controls do not modify journey progress or the landing timestamp.
    arrival:b.arrival,remaining:Math.max(0,b.arrival-t)};
  }return{active:false,world,palette,stage:'in scene'};
 }
 function edit(state,score,id,patch){const b=state.passages.bridges.find(x=>x.id===id);if(!b)throw Error('Unknown passage');if(b.locked&&Object.keys(patch).some(k=>k!=='locked'))throw Error('Passage is protected');
  const allowed=['label','toPalette','duration','style','length','reveal','continuity','wallMedia','locked'];for(const k of Object.keys(patch))if(!allowed.includes(k))throw Error('Unsupported passage field: '+k);
  if(Object.keys(patch).some(k=>k!=='locked')&&protection(state,b)&&protection(state,b)!=='reduced/still camera')throw Error('Unlock endpoint shot/camera before changing this route');
  const next=clone(state.passages),c=next.bridges.find(x=>x.id===id);Object.assign(c,patch);c.start=+(c.arrival-c.duration).toFixed(3);
  validate({...state,passages:next},score);HapaEditorial.checkpoint(state,'Edit '+id);state.passages=next;HapaEditorial.saveActive(state);return clone(c);
 }
 function reconcile(state,score){ // Only explicit shot-boundary edits call this, under the same undo checkpoint.
  if(!state.passages)return;
  const next=clone(state.passages);
  for(const b of next.bridges){const prev=state.director.shots.find(s=>s.id===b.fromShot),dest=state.director.shots.find(s=>s.id===b.toShot);if(!prev||!dest)throw Error('Passage endpoint was removed');if(Math.abs(b.arrival-dest.start)>.001){if(b.locked)throw Error('Moving that shot would move a protected arrival');b.arrival=dest.start;b.start=+(b.arrival-b.duration).toFixed(3);}}
  validate({...state,passages:next},score);state.passages=next;
 }
 return{heroMix,plan,coverage,replan,setMix,init,validate,protection,at,edit,reconcile,worlds,styles,smooth,clamp};
})();

