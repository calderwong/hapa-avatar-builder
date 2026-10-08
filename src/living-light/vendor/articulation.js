
/* Articulation 0.8 — deterministic, causal motion filters over measured audio.
 * No network, DOM, player or free-running simulation. 60 Hz is a reconstruction
 * grid for 30 Hz analysis, not new acoustic resolution. A seek evaluates the same
 * precomputed state; frame drops never integrate extra motion.
 */
'use strict';
window.HapaArticulation=(()=>{
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),hz=60,dt=1/hz,store=new WeakMap();
 const ids=['lead-vocals','backing-vocals','bass','drums','guitar','keyboard','synth','strings','percussion','brass','woodwinds','other'];
 const fields=['attack','sustain','mass','strike','brightness','low','mid','high','pan','width','phase','cameraArea','color'];
 const sample=(a,t)=>{if(!a)return 0;const p=clamp(t*hz,0,a.length-1),i=Math.floor(p),j=Math.min(a.length-1,i+1);return a[i]+(a[j]-a[i])*(p-i)};
 function spring(w,z){const wd=w*Math.sqrt(1-z*z),e=Math.exp(-z*w*dt),c=Math.cos(wd*dt),s=Math.sin(wd*dt);return [e*(c+z*w*s/wd),e*s/wd,-e*w*w*s/wd,e*(c-z*w*s/wd)];}
 const impulseM=spring(15,.48),massM=spring(8,.84),coeff=tau=>1-Math.exp(-dt/tau);
 function build(cache){
  const score=cache.score,N=Math.ceil(score.duration*hz)+1,rows={};
  for(const id of ids){
   const src=score.stems.find(s=>s.id===id);if(!src)continue;
   const out=Object.fromEntries(fields.map(k=>[k,new Float32Array(N)]));
   let attack=0,sustain=0,x=0,v=0,sx=0,sv=0,area=0,phase=0,prevSpeed=0,color=0,prevEnergy=0;
   let bright=0,lo=0,mid=0,hi=0,pan=0,width=0,speed=0;
   let eventIndex=0;const events=cache.fixture==='song'?(src.events||[]):[];
   const get=(key,t)=>{const f=cache.get(id,key,t);return ['present','synthetic'].includes(f.availability)?clamp(f.value??0):0;};
   for(let i=0;i<N;i++){
    const t=Math.min(score.duration,i*dt),e=get('energy',t),bn=get('brightness',t),ln=get('low',t)*e,mn=get('mid',t)*e,hn=get('high',t)*e;
    attack+=(e-attack)*coeff(e>attack?.035:.17);
    sustain+=(e-sustain)*coeff(e>sustain?.16:.65);
    bright+=(bn-bright)*coeff(.12);lo+=(ln-lo)*coeff(.09);mid+=(mn-mid)*coeff(.12);hi+=(hn-hi)*coeff(.07);
    pan+=((get('pan',t)*2-1)*e-pan)*coeff(.22);width+=(get('width',t)*e-width)*coeff(.24);
    color+=(sustain-color)*coeff(1.15);
    // A damped target-following body and a separate event-excited elastic response.
    const dx=x-e;
    const mx=massM[0]*dx+massM[1]*v;v=massM[2]*dx+massM[3]*v;x=e+mx;
    let impulse=0;
    while(eventIndex<events.length&&events[eventIndex].time<=t+1e-8){const ev=events[eventIndex++];if(t-ev.time<=dt*1.1)impulse+=ev.strength;}
    if(cache.fixture!=='song'&&cache.fixture!=='silence')impulse=Math.max(0,e-prevEnergy)*.7;
    prevEnergy=e;sv+=Math.min(1.5,impulse)*15;
    const nsx=impulseM[0]*sx+impulseM[1]*sv;sv=impulseM[2]*sx+impulseM[3]*sv;sx=nsx;
    // Positive, smoothed velocity. Integral is continuous, never t*speed(t).
    const desired=clamp(.70*color+.20*sustain+.10*lo);speed+=(desired-speed)*coeff(.75);
    if(i)area+=(prevSpeed+speed)*.5*dt;prevSpeed=speed;
    if(i)phase+=dt*sustain*(.24+.76*bright);
    const values={attack,sustain,mass:clamp(x,0,1.2),strike:clamp(sx,-1,1),brightness:bright,low:lo,mid,high:hi,pan,width,phase,cameraArea:area,color};
    for(const key of fields)out[key][i]=values[key];
   }
   rows[id]=out;
  }
  return{rows,fixture:cache.fixture,score,frames:N,bytes:Object.values(rows).reduce((n,r)=>n+Object.values(r).reduce((a,b)=>a+b.byteLength,0),0)};
 }
 function buffers(cache){let b=store.get(cache);if(!b||b.fixture!==cache.fixture||b.score!==cache.score){b=build(cache);store.set(cache,b);}return b;}
 const blank=()=>Object.fromEntries(fields.map(k=>[k,0]));
 // One cached prefix per participation mask. Saved surge changes rescore this prefix;
 // ordinary live Motion/Auto gestures do not reset the accumulated phase.
 function surgeBank(b,state){
  const signature=ids.map(id=>state.stems[id]?.visual!==false?'1':'0').join('');
  b.surgeVariants=b.surgeVariants||new Map();if(b.surgeVariants.has(signature))return b.surgeVariants.get(signature);
  const peak=new Float32Array(b.frames),area=new Float64Array(b.frames);let p=0,previous=0;
  const get=(id,key,i)=>state.stems[id]?.visual===false?0:b.rows[id]?.[key]?.[i]||0;
  for(let i=0;i<b.frames;i++){
   const v=Math.min(1.2,Math.max(get('lead-vocals','attack',i)*.88+get('lead-vocals','sustain',i)*.42,
    Math.abs(get('drums','strike',i))*.95+get('drums','low',i)*.12,
    get('bass','mass',i)*.86+get('bass','low',i)*.12,
    get('backing-vocals','sustain',i)*.72+get('backing-vocals','attack',i)*.18,
    Math.max(Math.abs(get('guitar','strike',i)),Math.abs(get('keyboard','strike',i)))*.68,
    get('synth','sustain',i)*.34+get('strings','sustain',i)*.28));
   let x=clamp((v-.18)/.78);x=x*x*(3-2*x);p+=(x-p)*coeff(x>p?.28:.90);peak[i]=p;
   // Base camera rate is the derivative of the existing integrated source curve.
   let rate=.045;if(i)for(const [id,w]of [['bass',.43],['drums',.38],['lead-vocals',.25],['guitar',.18],['synth',.15]])rate+=.12*w*(get(id,'cameraArea',i)-get(id,'cameraArea',i-1))*hz;
   const product=rate*p;if(i)area[i]=area[i-1]+dt*(previous+product)*.5;previous=product;
  }
  const out={peak,area};if(b.surgeVariants.size>4)b.surgeVariants.clear();b.surgeVariants.set(signature,out);return out;
 }

 function evaluate(cache,state,t){
  if(!Number.isFinite(t)||t<0||t>cache.score.duration)throw Error('Motion time outside source duration');
  const b=buffers(cache),signals={};
  for(const id of ids){const f=cache.get(id,'energy',t),enabled=state.stems[id]?.visual!==false,present=['present','synthetic'].includes(f.availability),row=b.rows[id];
   const values=blank();if(enabled&&present&&row)for(const key of fields)values[key]=sample(row[key],t)*(key==='pan'?1:1);
   signals[id]={...values,raw:f.value,availability:f.availability,sourceAssetId:f.sourceAssetId,enabled};
  }
  const weighted=(key,pairs)=>pairs.reduce((sum,[id,w])=>sum+signals[id][key]*w,0);
  const area=weighted('cameraArea',[['bass',.43],['drums',.38],['lead-vocals',.25],['guitar',.18],['synth',.15]]);
  // Instantaneous slope of the exact piecewise-linear integrated curve.
  const rate=(id)=>{const row=b.rows[id],f=signals[id];if(!row||!f.enabled||!['present','synthetic'].includes(f.availability))return 0;
   const i=Math.min(row.cameraArea.length-2,Math.max(0,Math.floor(t*hz)));return (row.cameraArea[i+1]-row.cameraArea[i])*hz;};
  const speed=.045+.12*([['bass',.43],['drums',.38],['lead-vocals',.25],['guitar',.18],['synth',.15]].reduce((n,[id,w])=>n+rate(id)*w,0));
  const surge=surgeBank(b,state),amount=state.reliquary?.cameraSurge??0,extra=sample(surge.area,t),peak=sample(surge.peak,t);
  const index=Math.min(surge.area.length-2,Math.max(0,Math.floor(t*hz))),extraRate=(surge.area[index+1]-surge.area[index])*hz;
  return{signals,basePhase:.045*t+.12*area,phase:.045*t+.12*area+3.4*amount*extra,
   phaseRate:speed+3.4*amount*extraRate,breadthPeak:peak,cameraScale:1+3.4*amount*peak,
   cameraSource:'integrated smoothed stem velocity + integrated peak surge; radians per song second',gridHz:hz,analysisHz:cache.score.fps,cacheBytes:b.bytes};
 }
 // Linear-light, semantic palette motion. Dark roles and gold remain quieter than
 // the expressive accent/emission roles; no full-screen additive color veil.
 function palette(base,cache,state,t){
  const cfg=state.reliquary,cut=state.cut?HapaEditorial.frame(state,state._cueTime??t):null;
  if(!cfg?.paletteMotion||cut?.shot?.locks?.look||cut?.shot?.locks?.shot)return base;
  const f=evaluate(cache,state,t).signals,voice=f['lead-vocals'],air=f.synth,back=f['backing-vocals'];
  const warm=clamp(.52*voice.color+.18*back.color+.12*f.drums.color),cool=clamp(.50*air.color+.30*f.strings.color+.15*f.keyboard.color);
  const blend=cfg.colorAmount??.55,out={};
  const amber={uBody:[.16,.046,.085],uAccent:[.73,.17,.046],uEmission:[1,.34,.09]},blue={uBody:[.052,.065,.24],uAccent:[.045,.30,.79],uEmission:[.11,.55,1]};
  for(const [k,v]of Object.entries(base)){
   let dst=v,amount=0;if(k in amber){const sum=warm+cool;if(sum>0){dst=amber[k].map((x,i)=>(x*warm+blue[k][i]*cool)/sum);amount=clamp(sum)*blend;}}
   // Highlight/gold, background and fog deliberately remain authored anchors.
   out[k]=v.map((x,i)=>x+(dst[i]-x)*amount);
  }
  return out;
 }
 return{evaluate,palette,ids,fields,responseBank:buffers,gridHz:hz,invalidate:cache=>store.delete(cache)};
})();
const _beforeKinetics=HapaCore.evaluate;
HapaCore.evaluate=function(cache,state,t){const f=_beforeKinetics(cache,state,t);f.articulation=HapaArticulation.evaluate(cache,state,t);return f;};

