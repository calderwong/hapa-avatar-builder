
/* Electricity Instrument 0.9.1. Source-time charge bank and spatial binding.
 * One bounded leaky reservoir driven by measured musical envelopes; onsets gate discharge.
 * This models artistic charge/release memory, not real volts, amps or dielectric fields.
 */
'use strict';
window.HapaElectricity=(()=>{
 const cp=x=>structuredClone(x),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),K=HapaElectricKernel,store=new WeakMap(),hz=60;
 const worlds=[{id:'stormglass-rotunda',name:'Stormglass Rotunda',kind:21,subtitle:'Porcelain electrodes / singing arcs / luminous charge'},
 {id:'voltaic-harp',name:'Voltaic Harp',kind:22,subtitle:'Held filaments / copper strings / branching replies'}],styles=['arc-relay','neon-cascade'];
 const defaults=()=>({schema:'hapa.paint.electricity/2',enabled:true,animate:true,branches:true,streamers:false,windLink:true,media:false,gentle:true,baseMotion:.62,audioAmp:.80,charge:.72,threshold:.44,bend:.62,branching:.58,travel:.64,corona:.43,afterglow:.66,light:.60,palette:'ion'});
 const nums=['baseMotion','audioAmp','charge','threshold','bend','branching','travel','corona','afterglow','light'],bools=['enabled','animate','branches','streamers','windLink','media','gentle'];
 const presets={corona:{charge:.53,threshold:.66,bend:.35,branching:.26,travel:.42,corona:.62,afterglow:.84,light:.46,palette:'ion'},
 storm:{charge:.91,threshold:.27,bend:.84,branching:.92,travel:.80,corona:.35,afterglow:.62,light:.68,palette:'ion'},
 copper:{charge:.69,threshold:.44,bend:.55,branching:.50,travel:.61,corona:.42,afterglow:.73,light:.56,palette:'copper'}};
 function validate(c){if(!c||c.schema!==defaults().schema||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown Electricity settings');for(const k of nums)if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Electricity '+k+' outside 0–1');for(const k of bools)if(typeof c[k]!=='boolean')throw Error('Electricity '+k+' must be boolean');if(!['ion','copper','violet'].includes(c.palette))throw Error('Unknown Electricity palette');return true;}
 const config=s=>s.reliquary?.electricity||defaults(),active=s=>s._tunnel?styles.includes(s._bridge?.style):worlds.some(w=>w.id===s.world),kind=s=>s._tunnel?(s._bridge?.style==='neon-cascade'?26:23):s.world==='neon-cloister'?24:['lumen-arcade','halo-vault'].includes(s.world)?25:s.world==='voltaic-harp'?22:21;
 function patch(s,p){const n={...config(s),...p};validate(n);HapaEditorial.checkpoint(s,'Electricity Paint');s.reliquary.electricity=n;HapaEditorial.saveActive(s);return cp(n);}
 const families=['drums','guitar','keyboard','percussion'];
 function bank(cache,s){const c=config(s),sig=JSON.stringify([cache.fixture,c.charge,c.threshold,HapaArticulation.ids.map(id=>s.stems[id]?.visual!==false)]);let variants=store.get(cache);if(!variants){variants=new Map();store.set(cache,variants);}if(variants.has(sig))return variants.get(sig);
  const b=HapaArticulation.responseBank(cache),N=b.frames,charges=new Float32Array(N),events=[],get=(id,k,i)=>s.stems[id]?.visual===false?0:b.rows[id]?.[k]?.[i]||0;
  const candidates=[];if(cache.fixture==='song')for(const source of families){const st=cache.score.stems.find(x=>x.id===source);if(st?.availability!=='present'||s.stems[source]?.visual===false)continue;
   for(let j=0;j<st.events.length;j++){const e=st.events[j];if(e.strength<.32)continue;candidates.push({...e,source,index:j,tick:Math.ceil(e.time*hz-1e-6)});}}
  candidates.sort((a,b)=>a.tick-b.tick||b.strength-a.strength);let j=0,last=-10,q=0;
  for(let i=0;i<N;i++){const excitation=clamp(get('bass','mass',i)*.35+get('lead-vocals','sustain',i)*.31+get('synth','sustain',i)*.15+get('guitar','sustain',i)*.19);
   q+=((.20+1.75*c.charge)*excitation*(1-q)-.18*q)/hz;q=clamp(q);
   while(j<candidates.length&&candidates[j].tick<=i){const e=candidates[j++];if(i/hz-last<.85||q<.12+.45*c.threshold)continue;
    const id=cache.score.id+':electric:'+e.source+':'+e.index,energy=clamp(.45*q+.55*e.strength);
    events.push({id,source:e.source,time:e.time,strength:energy,seed:K.hash(id),chargeBefore:q,chargeAfter:q*.34,basis:'measured onset gated by normalized charge reservoir'});q*=.34;last=i/hz;}
   charges[i]=q;
  }
  const result={charges,events,signature:sig};if(variants.size>5)variants.clear();variants.set(sig,result);return result;
 }
 const read=(a,t)=>{const p=clamp(t*hz,0,a.length-1),i=Math.floor(p);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(p-i);};
 const roles=[{name:'Charge / stored tension',sources:['bass','lead-vocals','synth','guitar']},{name:'Reach / held filament',sources:['lead-vocals','backing-vocals']},{name:'Kinks / branching',sources:['guitar','keyboard','backing-vocals']},{name:'Discharge / finite stroke',sources:families},{name:'Travel / slow corona',sources:['guitar','keyboard','synth']}];
 function evaluate(cache,s,t){if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Electricity time outside source');const c=config(s),on=c.enabled&&c.animate&&s.reliquary?.animated!==false&&!s.reduced;
  const kin=HapaArticulation.evaluate(cache,s,t),v=(id,k)=>on?(kin.signals[id]?.[k]||0):0,mac=HapaDirector.evaluate(cache.score,cache,s,t).values,b=bank(cache,s),charge=on?read(b.charges,t):.27;
  let events=on?b.events.filter(e=>e.time<=t&&t-e.time<3).map(e=>({...e,age:t-e.time})):[];
  if(on)for(const e of [...s.director.gestures,...s._gestureLive||[]])if(e.kind==='discharge'&&e.time<=t&&t-e.time<3)events.push({id:e.id,source:'human-discharge',time:e.time,age:t-e.time,strength:e.strength,seed:K.hash(e.id),basis:e.origin});
  events.sort((a,b)=>b.time-a.time);events=events.slice(0,4);
  const basalPhase=on?t*(2.0*c.baseMotion):0;
  const musicalPhase=on?(v('guitar','phase')*.55+v('keyboard','phase')*.42+v('synth','phase')*.16)*c.audioAmp*(.3+1.6*c.travel):0;
  const phase=basalPhase+musicalPhase;
  const voice=v('lead-vocals','sustain'),back=v('backing-vocals','sustain'),pluck=Math.max(v('guitar','attack'),v('keyboard','attack')),width=v('backing-vocals','width');
  const wind=on&&c.windLink&&s.reliquary?.wind?.enabled?HapaWindKernel.sample(HapaWind.evaluate(cache,s,t).field,[0,1,-1]).velocity:[0,0,0];
  const color=c.palette==='copper'?[1,.36,.085]:c.palette==='violet'?[.51,.16,1]:[.10,.64,1];
  const field={schema:'hapa.paint.electricity.field/1',shape:[charge,clamp(c.bend*(.18+.25*c.baseMotion+c.audioAmp*(.58*pluck+.12*charge))*(.72+.28*(on?mac.motion*c.audioAmp:0))),.18+.65*voice*c.audioAmp,clamp(c.branching*(.26+c.audioAmp*(.54*back+.18*width)))],motion:[phase,v('bass','phase')*.2,clamp(wind[0],-2,2),clamp(wind[2],-2,2)],color};
  const locks=s.cut?HapaEditorial.frame(s,s._cueTime??t).shot.locks:null;
  const strength=Math.max(0,...events.map(e=>K.envelope(e.age,c.afterglow,c.gentle).pulse*e.strength));
  return{schema:'hapa.paint.electricity.packet/1',source:cache.score.id,time:t,enabled:c.enabled,animated:on,field,charge,events,voice,back,pluck,phase,basalPhase,musicalPhase,basePhaseRate:on?2*c.baseMotion:0,radiance:.42+.88*mac.radiance,discharge:strength,lookLocked:!!(locks?.look||locks?.shot),configuration:cp(c),
   trace:roles.map(r=>({...r,inputs:r.sources.map(id=>({id,availability:kin.signals[id]?.availability||'missing',enabled:on&&kin.signals[id]?.enabled&&['present','synthetic'].includes(kin.signals[id]?.availability),sourceAssetId:kin.signals[id]?.sourceAssetId||null}))})),basis:'normalized musical reservoir / directed fractal channels; no voltage, current or plasma measurement'};
 }
 function layout(s){if(window.HapaLumen?.native(s))return HapaLumen.layout(s);if(s._tunnel){const L=s._bridge.length,channels=[];for(let i=0;i<4;i++)for(const side of [-1,1])channels.push({a:[side*3.18,.95,2.5+i*(L-5)/3],b:[side*.42,3.25,2.5+i*(L-5)/3],role:['guitar','lead-vocals','percussion','backing-vocals'][i]});return channels;}
  if(s.world==='voltaic-harp')return Array.from({length:5},(_,i)=>({a:[(i-2)*1.38,-.90,-.9],b:[(i-2)*1.38,2.10+.55*Math.cos((i-2)*.65),-1.20],role:['guitar','backing-vocals','lead-vocals','synth','keyboard'][i]}));
  return Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return{a:[Math.cos(a)*3.35,1.06+(i%2)*.60,-1.7+Math.sin(a)*2.55],b:[0,2.10,-1.70],role:['guitar','backing-vocals','lead-vocals','bass','synth','percussion'][i]};});}
 function paths(q,channels){if(!q.enabled)return[];const c=q.configuration,paths=[];
  for(let k=0;k<channels.length;k++){const ch=channels[k],s=K.seed(q.source+':'+k+':'+ch.role),relevant=q.events.filter(e=>e.seed%channels.length===k||e.source===ch.role);let env=0,after=0,front=1,growth=1;
   for(const e of relevant){const z=K.envelope(e.age,c.afterglow,c.gentle);env=Math.max(env,z.pulse*e.strength);after=Math.max(after,z.afterglow*e.strength);front=z.front;growth=z.leader;}
   const sustain=.045+c.corona*(.14+q.charge*.22+q.voice*.17),energy=sustain+env*(c.gentle?.75:1.05)+after*.25;
   paths.push({a:ch.a,b:ch.b,seed:s,index:k,branch:0,energy,width:.035+.033*q.charge,pulse:env,front,growth:env>0?growth:1,role:ch.role});
   if(c.branches)for(let j=0;j<3;j++){const fraction=.24+j*.19,g=K.branch(q.field,ch.a,ch.b,fraction,j,s),weight=clamp(c.branching*3-j);if(weight<=0)continue;
    paths.push({...g,index:k,branch:j+1,energy:energy*(.18+.46*weight),width:.017+.011*weight,pulse:env,front,growth:env>0?growth:1,role:ch.role});}
  }return paths;
 }
 function sample(q,a,b,u,seed=0){K.validate(q.field);if(![a,b].every(p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))||!Number.isFinite(u)||u<0||u>1||!Number.isFinite(seed))throw Error('Finite 3D terminals and a 0–1 path coordinate are required');return K.point(q.field,a,b,u,seed);}
 function decorate(s){const list=s.passages.bridges;if(!list.length)return;let from=s.passages.baseWorld;
  const relay=list.findIndex((b,i)=>i>=3&&!['fractal-loom','threshold','thread','braid','iris-bloom'].includes(b.style));
  for(let i=0;i<list.length;i++){const b=list[i];b.from=from;if(i===0){b.to='stormglass-rotunda';b.toPalette='electric-porcelain';}if(i===relay){b.to='voltaic-harp';b.toPalette='electric-copper';b.style='arc-relay';b.label='Arc Relay';}from=b.to;}
 }
 function tour(s,score){if(s.passages.bridges.some(b=>b.locked)||s.director.shots.some(x=>x.locks?.shot||x.locks?.camera))throw Error('Unlock protected routes before adding Electricity');const next=cp(s.passages);decorate({...s,passages:next});HapaPassages.validate({...s,passages:next},score);HapaEditorial.checkpoint(s,'Electricity excursions');s.passages=next;HapaEditorial.saveActive(s);return cp(next);}
 return{upgrade:c=>{const n={...defaults(),...c,schema:'hapa.paint.electricity/2'};validate(n);return n;},worlds,styles,defaults,validate,config,patch,active,kind,roles,presets,evaluate,layout,paths,sample,decorate,tour,events:(cache,s)=>cp(bank(cache,s).events)};
})();
for(const w of HapaElectricity.worlds)HapaCore.worlds.push({...w,modules:['paint.electricity','electricity.terminals'],camera:'bounded upright conductor orbit'});
HapaCore.palettes.push({id:'electric-porcelain',name:'Electricity / Storm porcelain',roles:{background:'#090f24',shadow:'#112236',body:'#506276',accent:'#36b7d6',highlight:'#f6d59e',emission:'#74d9ff',fog:'#1b2d48'}},{id:'electric-copper',name:'Electricity / Copper hymn',roles:{background:'#111221',shadow:'#202a36',body:'#646476',accent:'#9787db',highlight:'#fad4a3',emission:'#ffc46e',fog:'#322d42'}});
HapaCore.modules.push({id:'paint.electricity',version:'1.0.0',kind:'paint',description:'Source-time charge memory, endpoint-pinned multiscale channels, grafted branches and finite strokes'});
HapaPaints.register({id:'electricity',version:'1.0.0',name:'Electricity Instrument',outputs:['normalized charge','discharge events','3D channel position','corona','branch grafts'],bindings:['conductor rotunda','electric harp','arc relay','optional streamer traces'],evaluate:(...a)=>HapaElectricity.evaluate(...a),sample:(q,a,b,u,seed)=>HapaElectricity.sample(q,a,b,u,seed)});

