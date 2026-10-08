
/* Source-time finite-volume experiment. Reads existing Paint recipes and stem bank.
 * Owns numerical state/checkpoints, never an audio clock or graphics context. */
'use strict';
window.HapaDynamics=(()=>{
 const clone=x=>structuredClone(x),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),DT=.05;
 const defaultObstacles=()=>[{id:'deflector',type:'box',center:[0,.05,-2],half:[.36,.90,.78]},{id:'hood',type:'sphere',center:[1.5,1.55,-2],radius:.64}];
 const defaults=()=>({schema:'hapa.element.dynamics/1',enabled:true,obstacles:true,projection:true,combustion:true,boiling:true,condensation:true,ink:true,surfaces:true,orderCorrect:true,demonstration:false,fuel:.70,wind:.52,quench:.75,pigment:.55,volume:.68,obstacleShapes:defaultObstacles(),events:[]});
 const config=s=>s.reliquary?.dynamics||defaults();
 function validate(c){const d=defaults();if(!c||c.schema!==d.schema)throw Error('Unknown Dynamics recipe schema');for(const k of Object.keys(c))if(!(k in d))throw Error('Unknown Dynamics setting '+k);
  for(const k of ['enabled','obstacles','projection','combustion','boiling','condensation','ink','surfaces','orderCorrect','demonstration'])if(typeof c[k]!=='boolean')throw Error('Dynamics '+k+' must be boolean');
  for(const k of ['fuel','wind','quench','pigment','volume'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Dynamics '+k+' outside 0–1');
  const vec=(v,a,b)=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&n>=a&&n<=b);
  if(!Array.isArray(c.obstacleShapes)||c.obstacleShapes.length>10)throw Error('Up to ten obstacles are supported');const ids=new Set();
  for(const o of c.obstacleShapes){if(typeof o.id!=='string'||ids.has(o.id)||!['box','sphere','capsule'].includes(o.type)||!vec(o.center,-20,20))throw Error('Invalid obstacle');ids.add(o.id);if(o.type==='box'&&!vec(o.half,.08,4))throw Error('Invalid box bounds');if(o.type!=='box'&&(!Number.isFinite(o.radius)||o.radius<.08||o.radius>4))throw Error('Invalid obstacle radius');if(o.type==='capsule'&&(!Number.isFinite(o.halfHeight)||o.halfHeight<0||o.halfHeight>4))throw Error('Invalid capsule');}
  if(!Array.isArray(c.events)||c.events.length>128)throw Error('Maximum 128 intervention events');const es=new Set();for(const e of c.events){if(!['quench','ignite','pressure'].includes(e.kind)||!Number.isFinite(e.time)||e.time<0||e.time>3600||!Number.isFinite(e.strength)||e.strength<=0||e.strength>4||typeof e.id!=='string'||es.has(e.id))throw Error('Invalid intervention');es.add(e.id);}
  return true;
 }
 function patch(state,p){const n={...clone(config(state)),...clone(p)};validate(n);HapaEditorial.checkpoint(state,'Dynamics recipe');state.reliquary.dynamics=n;HapaEditorial.saveActive(state);return clone(n);}
 function event(state,time,kind){if(!['quench','ignite','pressure'].includes(kind)||!Number.isFinite(time)||time<0)throw Error('Invalid intervention');const c=clone(config(state));if(c.events.length>=128)throw Error('Intervention track is full');const tick=Math.ceil((time+1e-7)/DT),id='dyn-'+kind+'-'+tick+'-'+c.events.length;
  c.events.push({id,kind,time:tick*DT,strength:kind==='quench'?(.7+c.quench*2.6):1});patch(state,{events:c.events});return c.events.at(-1);}
 function configKey(state){const c=config(state),{ink,surfaces,orderCorrect,pigment,volume,...physics}=c;
  return JSON.stringify([physics,state.reduced,state.reliquary.animated,state.stems,state.reliquary.fire,state.reliquary.water,state.reliquary.wind]);}
 const caches=new WeakMap();let serial=0;
 function get(cache,state){const key=configKey(state);let bank=caches.get(cache);if(!bank){bank=new Map();caches.set(cache,bank);}if(bank.has(key))return bank.get(key);
  const c=config(state),solver=new HapaDynamicsKernel.Solver({obstacles:c.obstacleShapes,projection:c.projection,reaction:c.combustion,boiling:c.boiling,condensation:c.condensation});solver.cfg.obstacles=c.obstacles;solver.rasterize();
  const entry={key,solver,checkpoints:new Map([[0,solver.snapshot()]]),lastTime:0,source:cache.score.id,steps:0,serial:String(++serial),lastInput:null};bank.set(key,entry);
  // Bound recipe branches; each branch has a bounded set of numerical snapshots.
  if(bank.size>3)bank.delete(bank.keys().next().value);return entry;
 }
 function input(cache,state,t){
  const c=config(state),k=HapaArticulation.evaluate(cache,state,t).signals,F=state.reliquary.fire,W=state.reliquary.wind;
  const v=k['lead-vocals'],b=k.bass,g=k.guitar,keys=k.keyboard,s=k.synth,st=k.strings,back=k['backing-vocals'];
  const bearing=(W.bearing||0)*Math.PI/180,force=(.15+c.wind*.70)*(.7+.42*(v.sustain+back.sustain)+.2*b.mass);
  const out={fuel:F.enabled?(c.fuel*(.55+.8*(F.fuel??.65))*(.95+.50*b.mass+.25*s.sustain)):0,
   heat:.86+.35*v.sustain,wind:[Math.cos(bearing)*force,0,Math.sin(bearing)*force],curl:.2+.8*Math.max(g.attack,keys.attack),voice:v.sustain,ink:true};
  const events=c.events.slice();if(c.demonstration)events.push({id:'authored-quench',kind:'quench',time:16,strength:2.3},{id:'authored-reignite',kind:'ignite',time:24,strength:1});
  const pressureEvents=state.director?.gestures?.filter(e=>e.kind==='pressure')||[];for(const e of pressureEvents)events.push({...e,strength:1});
  for(const e of events){const age=t-e.time;if(e.kind==='quench'&&age>=0&&age<1.8)out.quench={strength:e.strength,radius:1.12,origin:[-1.5,-1.15,-2]};if(e.kind==='ignite'&&age>=0&&age<.22)out.ignite=true;if(e.kind==='pressure'&&age>=0&&age<DT)out.pressure={strength:e.strength,origin:[0,.4,-2]};}
  return out;
 }
 function targetTick(state,t){return !config(state).enabled||state.reduced||!state.reliquary.animated?0:Math.max(0,Math.floor((t+1e-7)/DT));}
 function seekBase(entry,tick){if(tick<entry.solver.tick){let chosen=0;for(const n of entry.checkpoints.keys())if(n<=tick&&n>chosen)chosen=n;entry.solver.restore(entry.checkpoints.get(chosen));}}
 function advance(cache,state,t,limit=1e9){if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Dynamics time outside song');const e=get(cache,state),tick=targetTick(state,t);seekBase(e,tick);let done=0;
  while(e.solver.tick<tick&&done++<limit){const at=e.solver.tick*DT;e.lastInput=input(cache,state,at);e.solver.step(e.lastInput);e.steps++;
   if(e.solver.tick%40===0){e.checkpoints.set(e.solver.tick,e.solver.snapshot());if(e.checkpoints.size>33){const k=[...e.checkpoints.keys()].find(k=>k!==0);e.checkpoints.delete(k);}}}
  e.lastTime=t;return{...e,complete:e.solver.tick===tick,requestedTick:tick};}
 async function prepare(cache,state,t,onProgress=()=>{}){let e;do{e=advance(cache,state,t,8);onProgress(e.solver.tick*DT,t);if(!e.complete)await new Promise(r=>setTimeout(r,0));}while(!e.complete);return stats(e,t);}
 function stats(e,t){return{...clone(e.solver.stats),songTime:t,simulatedTime:e.solver.tick*DT,grid:[e.solver.nx,e.solver.ny,e.solver.nz],spacing:e.solver.h,dt:DT,checkpointCount:e.checkpoints.size,stepsComputed:e.steps,source:e.source,history:'fixed-step state; cold seek replays from retained checkpoint',input:e.lastInput};}
 function evaluate(cache,state,t){const e=advance(cache,state,t);return{entry:e,solver:e.solver,stats:stats(e,t),config:config(state)};}
 function tour(state,score){const n=clone(state.passages);const b=n.bridges.find(x=>x.style==='fractal-loom')||n.bridges[0];if(!b)throw Error('No itinerary available');if(n.bridges.some(x=>x.locked)||state.director.shots.some(s=>s.locks.shot||s.locks.camera))throw Error('Unlock the protected route before adding the experiment');
  b.to='alchemical-court';b.toPalette='reaction-copper';let w=n.baseWorld;for(const x of n.bridges){x.from=w;w=x.to;}HapaPassages.validate({...state,passages:n},score);HapaEditorial.checkpoint(state,'Add Alchemical Court arrival');state.passages=n;HapaEditorial.saveActive(state);return clone(n);}
 HapaCore.worlds.push({id:'alchemical-court',name:'Alchemical Court',subtitle:'Transported heat / obstacle-aware air / quenching water',kind:20,modules:['simulation.elemental','render.layered-elements'],camera:'bounded laboratory reveal'});
 HapaCore.palettes.push({id:'reaction-copper',name:'Copper & condensed pearl',roles:{background:'#090f1b',shadow:'#14202b',body:'#315057',accent:'#54b9be',highlight:'#f8d59a',emission:'#f9a051',fog:'#162c38'}});
 HapaCore.modules.push({id:'simulation.elemental',version:'0.9.0',kind:'simulation',description:'Fixed-step MAC gas, reaction, liquid cooling/phase change, shallow patch'}, {id:'render.layered-elements',version:'0.9.0',kind:'renderer',description:'Six depth-peels interleaved with mixed fire/smoke/condensate; overflow probe'});
 return{defaults,config,validate,patch,event,input,get,advance,prepare,evaluate,tour,stats,DT,relevant:s=>s.world==='alchemical-court'};
})();

