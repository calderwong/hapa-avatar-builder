
/* Choreographed Currents 0.8.8. Deterministic editorial interpretation, not
 * lyric/beat/emotion inference. A fixed source grid owns motion history; the GPU,
 * delivered frame rate and human faders never advance that history.
 */
'use strict';
window.HapaCurrents=(()=>{
 const hz=30,dt=1/hz,store=new WeakMap(),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const smooth=x=>{x=clamp(x);return x*x*(3-2*x);},ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
 const defaults=()=>({enabled:true,contrast:.88,journeys:true,carry:true,heroes:true,lens:true,cloth:true,realmActions:true,halfVolume:false});
 function validate(c){if(!c||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown Currents setting');for(const k of Object.keys(defaults()))if(k==='contrast'){if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Phrase contrast must be finite 0–1');}else if(typeof c[k]!=='boolean')throw Error('Invalid Currents toggle: '+k);return true;}
 const config=s=>s.reliquary?.currents||defaults();
 const weights={'lead-vocals':.22,'backing-vocals':.06,bass:.24,drums:.25,guitar:.12,keyboard:.07,synth:.06,strings:.05,other:.03};
 const at=(a,t)=>{const p=clamp(t*hz,0,a.length-1),i=Math.floor(p),j=Math.min(i+1,a.length-1);return a[i]+(a[j]-a[i])*(p-i);};
 function bank(cache,state){
  let root=store.get(cache);if(!root||root.fixture!==cache.fixture||root.score!==cache.score){root={fixture:cache.fixture,score:cache.score,variants:new Map()};store.set(cache,root);}
  const sig=HapaArticulation.ids.map(id=>state.stems[id]?.visual===false?'0':'1').join('');
  if(root.variants.has(sig))return root.variants.get(sig);
  const raw=HapaArticulation.responseBank(cache),N=Math.ceil(cache.score.duration*hz)+1;
  const onsetIds=['drums','guitar','keyboard'];const onsetSources=new Uint8Array(N);const energy=new Float32Array(N),onset=new Float32Array(N),vocals=new Float32Array(N),low=new Float32Array(N);
  const live=id=>state.stems[id]?.visual!==false&&['present','synthetic'].includes(cache.get(id,'energy',0).availability);
  const read=(id,k,i)=>live(id)?(raw.rows[id]?.[k]?.[Math.min(i*2,raw.frames-1)]||0):0;
  let sum=Object.entries(weights).reduce((n,[id,w])=>n+(live(id)?w:0),0);
  for(let i=0;i<N;i++){
   let e=0;for(const [id,w]of Object.entries(weights))e+=w*(read(id,'sustain',i)*.65+read(id,'attack',i)*.35);
   energy[i]=sum?e/sum:0;const values=onsetIds.map((id,j)=>Math.max(0,read(id,'strike',i))*(j===0?1:.55));onset[i]=Math.max(...values);onsetSources[i]=values.indexOf(Math.max(...values));
   vocals[i]=read('lead-vocals','sustain',i);low[i]=read('bass','mass',i);
  }
  const sorted=Array.from(energy).sort((a,b)=>a-b),q=p=>sorted[Math.floor(p*(N-1))];
  // Offline relative calibration. Does not claim causal live-input analysis.
  const bottom=q(.12),top=q(.90),span=Math.max(.10,top-bottom);
  const fields=['energy','gather','opening','settle','selected','rise','steady','focus'];
  const rows=Object.fromEntries(fields.map(k=>[k,new Float32Array(N)])),events=[];
  let fast=0,slow=0,gather=0,opening=0,settle=0,focus=0,last=-20,lastVoice=-20,release=-20;
  for(let i=0;i<N;i++){
   const t=i/hz,E=energy[i];fast+=(E-fast)*(1-Math.exp(-dt/.34));slow+=(E-slow)*(1-Math.exp(-dt/3.6));
   const level=clamp((fast-bottom)/span),rise=clamp((fast-slow)/span*3.5),riseTarget=rise*clamp(level*1.8);
   gather+=(riseTarget-gather)*(1-Math.exp(-dt/(riseTarget>gather?.55:1.8)));
   const prev=low[Math.max(0,i-60)],returning=low[i]>.23&&prev<.10;
   const attack=onset[i]>.18&&rise>.15&&level>.40;
   const releaseNow=t-last>12&&(attack||returning&&level>.44||rise>.60&&level>.64)&&E>.025;
   if(releaseNow){release=t;last=t;const source=returning?'bass':attack?onsetIds[onsetSources[i]]:Object.entries(weights).sort((a,b)=>b[1]*read(b[0],'attack',i)-a[1]*read(a[0],'attack',i))[0][0];events.push({id:`${cache.score.id}:${source}:${i}`,time:t,source,strength:clamp(.40+level*.40+rise*.20),life:24,kind:'release',evidence:{rise,level,onset:onset[i],bassReturn:returning}});}
   const age=t-release,openTarget=age>=0&&age<7?smooth(age/.20)*(1-smooth((age-1.65)/5.2))*(.68+.32*level):0;
   opening+=(openTarget-opening)*(1-Math.exp(-dt/.18));
   const settleTarget=age>1.8&&age<10?smooth((age-1.8)/1.7)*(1-smooth((age-6)/4)):0;
   settle+=(settleTarget-settle)*(1-Math.exp(-dt/.45));
   // A small subset of real vocal entries can carry a gesture through multiple views.
   if(t-last>8&&t-lastVoice>10&&vocals[i]>.23&&vocals[Math.max(0,i-36)]<.11&&E>.025){lastVoice=t;last=t;events.push({id:`${cache.score.id}:lead-vocals:${i}`,time:t,source:'lead-vocals',strength:clamp(.45+vocals[i]*.55),life:24,kind:'vocal entry',evidence:{level,vocal: vocals[i],previous: vocals[Math.max(0,i-36)]}});}
   const focusTarget=clamp(gather*.48*(1-opening)+settle*.14);focus+=(focusTarget-focus)*(1-Math.exp(-dt/.8));
   const steady=smooth((level-.43)/.50),selected=clamp(Math.max(opening,steady*.76,gather*.56));
   for(const [k,v]of Object.entries({energy:level,gather,opening,settle,selected,rise,steady,focus}))rows[k][i]=E<.001&&fast<.001?0:v;
  }
  const packets=[];for(const e of events)if(!packets.length||e.time>=packets.at(-1).time+packets.at(-1).life)packets.push(e);
  const out={rows,events,packets,signature:sig,frames:N,calibration:{bottom,top,span},routes:new Map(),gridHz:hz};
  if(root.variants.size>=4)root.variants.delete(root.variants.keys().next().value);root.variants.set(sig,out);return out;
 }
 const colors={'lead-vocals':[1,.53,.13],drums:[.98,.75,.35],bass:[.14,.83,.63],guitar:[.12,.68,1],keyboard:[.42,.55,1],human:[.65,.86,1]};
 function evaluate(cache,state,t,provided={}){
  if(!Number.isFinite(t)||t<0||t>cache.score.duration)throw Error('Currents time outside source duration');
  const cfg=config(state),b=bank(cache,state),q=Object.fromEntries(Object.entries(b.rows).map(([k,a])=>[k,at(a,t)]));
  const on=cfg.enabled&&!state.reduced&&state.reliquary?.animated!==false;
  const gest=HapaHorizons.evaluate(state,t),manual=on?(gest.gather||0):0,burst=on?(gest.released||0):0;
  q.gather=clamp(q.gather+manual);q.opening=clamp(q.opening+burst);
  const activeEvents=b.packets.filter(e=>e.time<=t&&e.time+e.life>t);
  let chosen=activeEvents.at(-1)||null;
  if(gest.carryEvents?.length)chosen=gest.carryEvents.at(-1);
  const progress=chosen?clamp((t-chosen.time)/chosen.life):0;
  const strength=on&&cfg.carry&&chosen?chosen.strength*smooth((t-chosen.time)/.32)*(1-smooth((progress-.60)/.40)):0;
  const packet=chosen?{...chosen,age:t-chosen.time,progress,strength,color:colors[chosen.source]||colors['lead-vocals']}:{id:null,source:null,time:0,age:0,progress:0,strength:0,color:[1,.53,.13]};
  const kin=provided.kin||HapaArticulation.evaluate(cache,state,t),base=kin.breadthPeak||0;
  const gate=on?cfg.contrast:0,selected=base+(q.selected-base)*gate;
  const shot=state.cut?HapaEditorial.frame(state,state._cueTime??t).shot:null,look=!!(shot?.locks?.look||shot?.locks?.shot);
  const stage=!on?'Baseline':q.opening>.32?'Opening':q.gather>.27?'Gathering':q.settle>.27?'Settling':q.steady>.50?'Carrying':'Flowing';
  return {...q,on,stage,contrast:gate,selected:clamp(selected),packet,lookProtected:look,
   evidence:{normalizedActivity:q.energy,risingActivity:q.rise,calibration:b.calibration},
   shape:cfg.cloth&&on? [q.gather*gate,q.opening*gate,q.settle*gate,strength]:[0,0,0,0],
   cue:on?[q.gather*gate,q.opening*gate,q.settle*gate,look?0:gate]:[0,0,0,0],
   packetUniform:on&&cfg.carry&&!look?[progress,strength,chosen?.source==='drums'?1:chosen?.source==='bass'?2:0,1]:[0,0,0,0],
   focus:on&&cfg.lens&&!look?q.focus*(1-q.opening)*gate:0,
   interpretation:'Authored gather/open/settle decisions from measured activity, not inferred lyrics or emotions'};
 }
 function routeTable(cache,state,b){
  const cfg=config(state),data=bank(cache,state),enter=b.entry??.27,start=b.start+b.duration*enter,T=b.arrival-start;
  const contrast=cfg.contrast,amount=cfg.enabled&&cfg.journeys&&!state.reduced&&state.reliquary?.animated!==false?(state.reliquary.cameraSurge??0)*1.08*cfg.contrast:0;
  const key=[b.id,b.start,b.arrival,b.length,enter,contrast,amount].join(':');if(data.routes.has(key))return data.routes.get(key);
  const count=Math.max(120,Math.ceil(T*hz)),base=new Float64Array(count+1),mod=new Float64Array(count+1),rate=new Float64Array(count+1);
  for(let i=0;i<=count;i++){
   const u=i/count,t=start+u*T;const open=at(data.rows.opening,t),g=at(data.rows.gather,t),level=at(data.rows.energy,t);
   base[i]=30*u*u*(1-u)*(1-u);const rise=at(data.rows.rise,t);mod[i]=1+amount*(2.25*open+.80*level+.35*rise-.40*g);
  }
  const speedLimit=Math.max(6,b.length/T*1.875*1.65),accelLimit=Math.max(4,b.length/(T*T)*5.774*2.1);let applied=1,area,maxSpeed,maxAccel;
  for(let attempt=0;attempt<12;attempt++){
   area=new Float64Array(count+1);for(let i=0;i<=count;i++)rate[i]=base[i]*(1+(mod[i]-1)*applied);
   for(let i=1;i<=count;i++)area[i]=area[i-1]+(rate[i]+rate[i-1])/(2*count);
   const norm=area[count]||1;for(let i=0;i<=count;i++){area[i]/=norm;rate[i]=rate[i]/norm*b.length/T;}
   maxSpeed=Math.max(...rate);maxAccel=0;for(let i=1;i<=count;i++)maxAccel=Math.max(maxAccel,Math.abs(rate[i]-rate[i-1])*count/T);
   if(maxSpeed<=speedLimit&&maxAccel<=accelLimit)break;applied*=.70;
  }
  area[0]=0;area[count]=1;const result={area,rate,start,T,count,applied,amount,maxSpeed,maxAccel,speedLimit,accelLimit};if(data.routes.size>64)data.routes.clear();data.routes.set(key,result);return result;
 }
 function progress(cache,state,b,t){
  if(b.journey)return (HapaJourney.distance(cache,state,Math.max(0,t))+.35)/b.length;
  const cfg=config(state),entry=b.entry??.27,flight=clamp(((t-b.start)/b.duration-entry)/(1-entry));
  if(!cfg.enabled||!cfg.journeys||state.reduced||state.reliquary?.animated===false||!(state.reliquary?.cameraSurge>0))return ease(flight);
  const q=routeTable(cache,state,b);return spline(q,b,flight).position;
 }
 function spline(q,b,f){if(f<=0)return{position:0,speed:0};if(f>=1)return{position:1,speed:0};const p=f*q.count,i=Math.floor(p),u=p-i,v=u*u,w=v*u,delta=q.T/q.count,m0=q.rate[i]*delta/b.length,m1=q.rate[i+1]*delta/b.length;return{position:(2*w-3*v+1)*q.area[i]+(w-2*v+u)*m0+(-2*w+3*v)*q.area[i+1]+(w-v)*m1,speed:((6*v-6*u)*q.area[i]+(3*v-4*u+1)*m0+(-6*v+6*u)*q.area[i+1]+(3*v-2*u)*m1)*b.length/delta};}
 function route(cache,state,t){const p=HapaPassages.at(state,t);if(!p.active||p.quiet)return p;const b=p.bridge,cfg=config(state);const q=routeTable(cache,state,b),f=clamp((t-q.start)/q.T),ix=Math.min(q.count-1,Math.floor(f*q.count));return {...p,progress:progress(cache,state,b,t),speed:p.u<p.entry?null:spline(q,b,f).speed,motionPolicy:cfg.enabled&&cfg.journeys?'normalized musical velocity':'original quintic',speedLimit:q.speedLimit,accelerationLimit:q.accelLimit,appliedModulation:q.applied*q.amount};}
 // Different bounded arrival/hold arcs. No roll, no new clock, no collision promise.
 function camera(state,t,frame,eye,target,kind){
  const cfg=config(state),q=frame.currents,k=frame.articulation;
  if(!cfg.enabled||!cfg.heroes||!q?.on||!k||kind<1||state.reduced||state.camera==='still'||!state.reliquary?.orbitInstrument)return {eye,target,hero:null};
  const sourceT=state._cueTime??t,visit=(state.passages?.bridges||[]).filter(b=>b.to===state.world&&b.arrival<=sourceT+.001).at(-1),anchor=visit?.arrival??0;
  const elapsed=t-anchor,phase=k.phase,weight=.55+.75*(frame.director?.values.motion??.5);
  const shapes={6:['Shoulder to stellar core',.24,.05],7:['Pillar reveal',.30,.20],8:['Rising armillary arc',.27,.85],9:['Cloud clearing drift',.24,.25],5:['Waterline lift',.20,.35]};
  const [name,width,rise]=shapes[kind]||['Counterpoint arc',.18,.20];
  const local=elapsed*.36+phase*.18,angle=width*Math.sin(local)*weight;
  const r=Math.hypot(eye[0],eye[2]),old=Math.atan2(eye[0],eye[2]);const a=clamp(old+angle,-.72,.72);
  const out=[Math.sin(a)*r,eye[1]+rise*(.5+.5*Math.sin(local*.62)) *weight,Math.cos(a)*r];
  return{eye:out,target:[...target],hero:{name,anchor,angle:a,elapsed,world:state.world}};
 }
 function configure(state,p){const next={...config(state),...p};validate(next);HapaEditorial.checkpoint(state,'Choreographed currents');state.reliquary.currents=next;HapaEditorial.saveActive(state);return structuredClone(next);}
 return{defaults,validate,config,evaluate,bank,progress,route,routeTable,spline,camera,configure,smooth,ease};
})();
const _currentEvaluate=HapaCore.evaluate;
HapaCore.evaluate=function(cache,state,t){const f=_currentEvaluate(cache,state,t);f.currents=HapaCurrents.evaluate(cache,state,t,{kin:f.articulation});return f;};

