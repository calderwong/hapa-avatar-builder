
/* Water Instrument 0.8.7 — original Hapa Paint. No clock, audio player, GPU or network ownership.
 * Water quantities are authored rendering units. They are not measured ocean/weather variables.
 * One wave/event packet feeds the ocean, court, passage and optional ribbon coating.
 */
'use strict';
window.HapaPaints=(()=>{const entries=new Map();return{
 register(p){if(!p?.id||entries.has(p.id))throw Error('Paint identity already registered');entries.set(p.id,Object.freeze(p));},
 list:()=>[...entries.values()].map(p=>({id:p.id,version:p.version,name:p.name,outputs:p.outputs,bindings:p.bindings})),
 get:id=>{const p=entries.get(id);if(!p)throw Error('Unknown Paint');return p;}
};})();
window.HapaWater=(()=>{
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=(a,b,v)=>{v=clamp((v-a)/(b-a));return v*v*(3-2*v)},copy=x=>structuredClone(x),TAU=Math.PI*2;
 const worlds=[{id:'rain-court',name:'Rain Court',kind:12,subtitle:'A rain-played mirror pool / stone listening arches'},
 {id:'windward-reach',name:'Windward Reach',kind:13,subtitle:'Open swell / wind-combed water / a sunlit tide instrument'}];
 const styles=['tidal-conduit'];
 const defaults=()=>({schema:'hapa.paint.water/1',enabled:true,animate:true,upgradeTidal:true,streamers:false,reflections:true,
  swell:.68,wind:.56,impacts:.70,current:.62,light:.72,foam:.25,clarity:.66,windBearing:28});
 const numbers={swell:[0,1],wind:[0,1],impacts:[0,1],current:[0,1],light:[0,1],foam:[0,1],clarity:[0,1],windBearing:[-180,180]};
 const roles=[{id:'swell',name:'Swell / weight',sources:['bass'],verb:'lift · roll · settle'},
 {id:'wind',name:'Wind / surface grain',sources:['synth','strings','backing-vocals'],verb:'comb · gust · breathe'},
 {id:'impacts',name:'Impacts / rings',sources:['drums','percussion','keyboard'],verb:'touch · expand · fade'},
 {id:'current',name:'Current / travel',sources:['guitar','keyboard','bass'],verb:'advect · carry · return'},
 {id:'light',name:'Light / glints',sources:['lead-vocals','percussion','brass','woodwinds'],verb:'catch · reflect · soften'}];
 const presets={mirror:{swell:.12,wind:.15,impacts:.85,current:.28,light:.60,foam:.03,clarity:.86},
  windglass:{swell:.68,wind:.56,impacts:.70,current:.62,light:.72,foam:.25,clarity:.66},
  storm:{swell:1,wind:.92,impacts:.82,current:.85,light:.64,foam:.70,clarity:.39}};
 function validate(c){if(!c||c.schema!=='hapa.paint.water/1'||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown Water Paint settings');
  for(const k of ['enabled','animate','upgradeTidal','streamers','reflections'])if(typeof c[k]!=='boolean')throw Error('Water '+k+' must be boolean');
  for(const [k,[a,b]]of Object.entries(numbers))if(!Number.isFinite(c[k])||c[k]<a||c[k]>b)throw Error('Water '+k+' outside '+a+'–'+b);return true;}
 const config=s=>s.reliquary?.water||defaults();
 function patch(s,p){const n={...config(s),...p};validate(n);HapaEditorial.checkpoint(s,'Water Paint');s.reliquary.water=n;HapaEditorial.saveActive(s);return copy(n);}
 function enabled(s){const c=config(s);return (s._tunnel?styles.includes(s._bridge?.style):worlds.some(w=>w.id===s.world)||s.world==='tidal-observatory'&&c.upgradeTidal);}
 function kind(s){if(window.HapaWind?.combined(s))return s._tunnel?20:18;return s._tunnel?14:s.world==='rain-court'?12:s.world==='windward-reach'?13:5;}
 function binding(s){const k=kind(s);if(k===18||k===20)return{id:k===18?'confluence-basin':'pressure-channel',kind:k,level:-1.62,span:k===18?27:18,depth:1.7,amplitude:.66};return {id:k===12?'mirror-basin':k===13?'exposed-sea':k===14?'passage-channel':'tidal-islands',kind:k,level:k===12?-1.62:k===14?-1.85:-2.32,
  span:k===12?26:k===14?18:150,depth:k===12?1.15:k===14?2.45:4.0,amplitude:k===12?.50:k===14?.58:1};}
 // Stable event coordinates are bound at event time, not rebuilt around the moving eye.
 const hashes=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;};
 function pos(id,tag,s,evTime,cache){const h=hashes(id),x=(h%1009)/1009,z=((h>>>10)%1013)/1013,k=kind(s);
  if(k===14||k===20){const b=s._bridge;const p={progress:HapaCurrents.progress(cache,s,b,evTime)};return[(x-.5)*6.8,Math.min(b.length-1,Math.max(.5,-.35+b.length*(p.progress||0)+2.2))];}
  return[(x-.5)*(k===12?12:18),(z-.5)*(k===12?9:16)-1.5];}
 function evaluate(cache,s,t){t=HapaElements.time(s,t,'water');s=HapaElements.stateFor(s,'water');if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Water time outside source');
  const c=config(s),on=c.enabled&&c.animate&&s.reliquary?.animated!==false&&!s.reduced;
  const kin=HapaArticulation.evaluate(cache,s,t),sig=kin.signals,macro=HapaDirector.evaluate(cache.score,cache,s,t).values;
  const locks=s.cut?HapaEditorial.frame(s,s._cueTime??t).shot.locks:null,lookLocked=!!(locks?.look||locks?.shot);
  const basis=binding(s),now=on?t:0;
  const val=(id,k)=>on?(sig[id]?.[k]||0):0;
  const bass=val('bass','mass'),vocal=val('lead-vocals','sustain'),pad=Math.max(val('synth','mass'),val('strings','mass')),
   choir=val('backing-vocals','sustain'),brilliance=Math.max(val('percussion','attack'),val('brass','attack'),val('woodwinds','attack'));
  const phrase=HapaCurrents.evaluate(cache,s,t,{kin}),breadth=1+(s.reliquary?.breadthAmount||0)*1.15*(on?phrase.opening:0);
  const strength=c.enabled?(on?(.4+.6*macro.motion):.65):0;
  const swell=c.enabled?(.045+c.swell*(.12+.58*bass+.12*vocal)*strength)*breadth:0;
  const wind=c.enabled?c.wind*(.16+.67*pad+.17*choir)*strength:0;
  const phase=[now*.97+c.current*(val('bass','phase')*.12+val('guitar','phase')*.10),
   now*1.32+c.current*(val('keyboard','phase')*.12+val('guitar','phase')*.11),
   now*2.07+val('synth','phase')*.18,now*2.88+val('strings','phase')*.18];
  const angle=c.windBearing*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),dirs=[[.92,.392],[-.39,.921],[.83,-.557],[.23,.973]],lengths=[11.8,6.8,3.4,1.8],weights=[.48,.28,.14,.065];
  const waves=[];for(let i=0;i<4;i++){const d=dirs[i],dx=d[0]*cs-d[1]*sn,dz=d[0]*sn+d[1]*cs,k=TAU/lengths[i];
   waves.push(dx*k,dz*k,Math.min(.62,swell)*weights[i]*basis.amplitude,phase[i]);}
  const candidates=[],drops=[];
  if(on&&c.impacts>0&&(!cache.fixture||cache.fixture==='song'))for(const source of ['drums','percussion','keyboard']){
   if(s.stems[source]?.visual===false)continue;const stem=cache.score.stems.find(x=>x.id===source);if(stem?.availability!=='present')continue;
   const ev=stem.events||[];let lo=0,hi=ev.length;while(lo<hi){const mid=(lo+hi)>>1;if(ev[mid].time<=t)lo=mid+1;else hi=mid;}
   for(let j=lo;j<Math.min(ev.length,lo+3);j++){const e=ev[j],until=e.time-t;if(until>.42)break;if(e.strength<.30||(s._tunnel&&e.time<s._bridge.start))continue;const id=cache.score.id+':'+source+':'+j,p=pos(id,source,s,e.time,cache);drops.push({id,source,time:e.time,until,x:p[0],z:p[1],strength:e.strength});}
   for(let i=lo-1;i>=0;i--){const e=ev[i],age=t-e.time;if(age>5.5)break;if(s._tunnel&&e.time<s._bridge.start)continue;
    if(e.strength<.30)continue;const id=cache.score.id+':'+source+':'+i,c=pos(id,source,s,e.time,cache);candidates.push({id,source,time:e.time,age,strength:e.strength*(source==='keyboard'?.50:source==='percussion'?.65:1),x:c[0],z:c[1]});if(lo-i>16)break;}
  }
  const deck=HapaHorizons.evaluate(s,t);if(on)for(const e of deck.waves||[]){const age=e.age??(t-e.time);if(age>=0&&age<5.5)candidates.push({id:'human-wave:'+((t-age).toFixed(4)),source:'human-wave',time:t-age,age,strength:e.strength??e.amplitude??1,x:0,z:(kind(s)===14||kind(s)===20)?(s._bridge.length*(HapaCurrents.progress(cache,s,s._bridge,t-age)||0)+2):2});}
  // Preserve a small set; screen-wide micro-rain is not fabricated from empty stems.
  candidates.sort((a,b)=>b.time-a.time);const events=candidates.slice(0,6),ringUniform=new Array(24).fill(0);
  events.forEach((e,i)=>{const amp=c.impacts*e.strength*.14*basis.amplitude;ringUniform.splice(i*4,4,e.x,e.z,e.age,amp);});
  const light=lookLocked?.7:c.light*(on?(.52+.38*macro.radiance+.23*vocal+.13*brilliance):.8),foam=c.enabled?c.foam*(.16+.66*bass+.18*wind):0;
  const uvFlow=on?[now*.11+c.current*(val('guitar','phase')*.06+val('keyboard','phase')*.05),now*.055+val('synth','phase')*.05]:[0,0];
  const trace=roles.map(r=>({id:r.id,name:r.name,verb:r.verb,inputs:r.sources.map(id=>({id,availability:sig[id]?.availability||'missing',enabled:!!sig[id]?.enabled&&['present','synthetic'].includes(sig[id]?.availability),sourceAssetId:sig[id]?.sourceAssetId||null})),value:{swell,wind,impacts:events.length?Math.max(...events.map(e=>e.strength))*c.impacts:0,current:c.current,light}[r.id]}));
  return HapaElements.water({schema:'hapa.paint.water.packet/1',source:cache.score.id,time:t,animated:on,binding:basis,waves,events,drops:drops.slice(0,6),rings:ringUniform,wind,swell,foam,light:clamp(light,0,1.25),clarity:c.clarity,
   flow:uvFlow,chop:.12+.24*wind,reflections:c.reflections,lookLocked,trace,
   bounds:{maximumWaveHeight:waves.filter((_,i)=>i%4===2).reduce((a,v)=>a+v*1.3,0)+.36,ringLifetime:5.5},
   carry:phrase.packet,gesture:deck.open,outputs:['height','slope','normal','crest','flow','reflected-light','transmittance'],
   basis:'authored water motion from measured stem activity; no inferred wind/weather/lyrics'},cache,s,t);
 }
 function sample(packet,x,z){if(![x,z].every(Number.isFinite))throw Error('Water coordinates must be finite');let h=0,dx=0,dz=0,crest=0;
  const warp=packet.warp||[0,0],X=x+warp[0]*Math.sin(z*.24-warp[1]),jac=warp[0]*.24*Math.cos(z*.24-warp[1]);
  for(let i=0;i<4;i++){const [kx,kz,a,p]=packet.waves.slice(i*4,i*4+4),q=kx*X+kz*z-p,S=Math.sin(q),C=Math.cos(q),b=packet.chop;
   h+=a*(S+b*Math.cos(2*q));const d=a*(C-2*b*Math.sin(2*q));dx+=d*kx;dz+=d*(kz+kx*jac);crest+=a*Math.max(0,S)**3;}
  for(let i=0;i<6;i++){const [ex,ez,age,a]=packet.rings.slice(i*4,i*4+4);if(a===0)continue;const x1=x-ex,z1=z-ez,r=Math.sqrt(x1*x1+z1*z1+.0004),d=r-age*2.1,env=Math.exp(-d*d*.9-age*.62)*smooth(0,.12,age)*(1-smooth(4.9,5.5,age)),S=Math.sin(d*5.8),C=Math.cos(d*5.8);
   h+=a*S*env;const deriv=a*env*(5.8*C-1.8*d*S)/r;dx+=deriv*x1;dz+=deriv*z1;}
  const len=Math.hypot(dx,1,dz);return{height:h,slope:[dx,dz],normal:[-dx/len,1/len,-dz/len],crest,flow:[...packet.flow],level:packet.binding.level+h};
 }
 function decorate(list){let from=list[0]?.from;for(let i=0;i<list.length;i++){const b=list[i];b.from=from;
  if(i===2){b.to='windward-reach';b.toPalette='water-sunrise';b.style='tidal-conduit';b.label='Tidal Conduit';}
  if(i===5){b.to='rain-court';b.toPalette='water-moonstone';b.label='A court of listening water';}from=b.to;}return list;}
 function tour(s,score){if(s.passages.bridges.some(b=>b.locked)||s.director.shots.some(x=>x.locks?.shot||x.locks?.camera))throw Error('Unlock protected routes before adding water excursions');
  const next=copy(s.passages);decorate(next.bridges);HapaPassages.validate({...s,passages:next},score);HapaEditorial.checkpoint(s,'Add Water excursions');s.passages=next;HapaEditorial.saveActive(s);return copy(next);}
 return{worlds,styles,defaults,validate,config,patch,enabled,kind,binding,roles,presets,evaluate,sample,decorate,tour};
})();
for(const w of HapaWater.worlds)HapaCore.worlds.push({...w,modules:['paint.water','water.stage'],camera:'upright low-water musical arc'});
HapaCore.palettes.push({id:'water-sunrise',name:'Water / Sunrise',roles:{background:'#141d30',shadow:'#063346',body:'#247c89',accent:'#62c9c1',highlight:'#f3d9a0',emission:'#87ccc1',fog:'#577986'}},
 {id:'water-moonstone',name:'Water / Moonstone',roles:{background:'#0a1025',shadow:'#091f31',body:'#284c63',accent:'#62b6ca',highlight:'#d9e8eb',emission:'#8ac9e2',fog:'#293d58'}});
HapaCore.modules.push({id:'paint.water',version:'0.1.0',kind:'paint',description:'Reusable source-time height/slope/flow/optics instrument; independent of placement and song transport'});
HapaPaints.register({id:'water',version:'0.1.0',name:'Water Instrument',outputs:['height','slope','normal','crest','flow','transmittance','reflected-light'],bindings:['horizontal surface','falling sheet','ribbon coating'],evaluate:(...a)=>HapaWater.evaluate(...a),sample:(...a)=>HapaWater.sample(...a)});

