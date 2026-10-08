
/* Fire Instrument 0.8.8. Pure adapter; no clock, device, GPU, network or private global state.
 * Existing measured 30 Hz features / 60 Hz artistic bank feed one reusable fire packet.
 */
'use strict';
window.HapaFire=(()=>{
 const cp=x=>structuredClone(x),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const worlds=[{id:'hearth-of-three',name:'Hearth of Three',kind:15,subtitle:'A shared fire / riverstone seats / dusk-blue sky'},
 {id:'cinder-organ',name:'Cinder Organ',kind:16,subtitle:'Rising voices / basalt vanes / tempered flame'}],styles=['ember-passage'];
 const defaults=()=>({schema:'hapa.paint.fire/1',enabled:true,animate:true,streamers:false,media:false,fuel:.62,reach:.65,turbulence:.64,wind:.35,embers:.58,haze:.22,light:.68,smoke:.20,bearing:22,palette:'ember'});
 const nums={fuel:[0,1],reach:[0,1],turbulence:[0,1],wind:[0,1],embers:[0,1],haze:[0,1],light:[0,1],smoke:[0,1],bearing:[-180,180]};
 const presets={hearth:{fuel:.57,reach:.42,turbulence:.46,wind:.19,embers:.42,haze:.15,light:.58,smoke:.15,palette:'ember'},
  forge:{fuel:.86,reach:.94,turbulence:.84,wind:.33,embers:.88,haze:.32,light:.80,smoke:.26,palette:'ember'},
  spirit:{fuel:.50,reach:.75,turbulence:.50,wind:.48,embers:.35,haze:.16,light:.52,smoke:.08,palette:'spirit'}};
 function validate(c){if(!c||c.schema!=='hapa.paint.fire/1'||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown Fire settings');
  for(const k of ['enabled','animate','streamers','media'])if(typeof c[k]!=='boolean')throw Error('Fire '+k+' must be boolean');
  for(const [k,[a,b]]of Object.entries(nums))if(!Number.isFinite(c[k])||c[k]<a||c[k]>b)throw Error('Fire '+k+' outside bounds');
  if(!['ember','spirit','copper'].includes(c.palette))throw Error('Unknown Fire color recipe');return true;}
 const config=s=>s.reliquary?.fire||defaults();
 function patch(s,p){const n={...config(s),...p};validate(n);HapaEditorial.checkpoint(s,'Fire Paint');s.reliquary.fire=n;HapaEditorial.saveActive(s);return cp(n);}
 const active=s=>s._tunnel?styles.includes(s._bridge?.style):worlds.some(w=>w.id===s.world);
 const kind=s=>s._tunnel?17:s.world==='cinder-organ'?16:15;
 const hash=s=>{let h=2166136261;for(const x of s)h=Math.imul(h^x.charCodeAt(0),16777619);return h>>>0;};
 const roles=[{id:'fuel',name:'Fuel / held warmth',sources:['bass','synth'],verb:'gather · feed · coast'},
 {id:'reach',name:'Tongues / vocal reach',sources:['lead-vocals','backing-vocals'],verb:'rise · stretch · release'},
 {id:'turbulence',name:'Curl / plucked detail',sources:['guitar','keyboard'],verb:'split · fold · reconnect'},
 {id:'wind',name:'Wind / lean',sources:['strings','synth','other'],verb:'bend · trail · settle'},
 {id:'embers',name:'Sparks / accents',sources:['drums','percussion','keyboard'],verb:'lift · curl · cool'},
 {id:'light',name:'Light / warm spill',sources:['lead-vocals','bass'],verb:'illuminate · hold · dim'}];
 function evaluate(cache,s,t){t=HapaElements.time(s,t,'fire');s=HapaElements.stateFor(s,'fire');if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Fire time outside source');const c=config(s),on=c.enabled&&c.animate&&s.reliquary?.animated!==false&&!s.reduced;
  const kin=HapaArticulation.evaluate(cache,s,t),sig=kin.signals,mac=HapaDirector.evaluate(cache.score,cache,s,t).values,cur=HapaCurrents.evaluate(cache,s,t,{kin});
  const v=(id,k)=>on?(sig[id]?.[k]||0):0,bass=v('bass','mass'),voice=v('lead-vocals','sustain'),back=v('backing-vocals','sustain'),plucked=Math.max(v('guitar','attack'),v('keyboard','attack')),pad=Math.max(v('strings','mass'),v('synth','mass')),air=v('other','sustain');
  const opening=on?cur.opening:0,gather=on?cur.gather:0,motion=on?mac.motion:.45;
  const fuel=c.enabled?clamp(c.fuel*(.34+.50*bass+.16*pad+.15*opening),0,1.3):0;
  const height=clamp(1.2+c.reach*(.90+1.0*voice+.32*back)+opening*c.reach*.40,.5,4.7);
  const turb=clamp(c.turbulence*(.28+.52*plucked+.24*voice)*(.45+.55*motion),0,1.4);
  const wind=c.wind*(.25+.5*pad+.22*air),angle=c.bearing*Math.PI/180;
  const slow=on?t*.16+v('synth','phase')*.10+v('strings','phase')*.08:0;
  const phase=on?t*.83+v('guitar','phase')*.32+v('keyboard','phase')*.23+v('bass','phase')*.10:0;
  const light=c.light*(on?(.46+.32*voice+.24*bass+.14*mac.radiance):.66),heatHaze=c.enabled&&on?c.haze*(.38+.36*voice+.22*bass):0;
  const field={schema:'hapa.paint.fire.field/1',shape:[fuel,height,turb,c.smoke*(.65+.35*pad)],motion:[phase,slow,Math.cos(angle)*wind,Math.sin(angle)*wind],optics:[clamp(light,0,1.5),heatHaze,c.embers,['ember','spirit','copper'].indexOf(c.palette)]};
  const events=[];
  if(on&&c.embers>0&&(!cache.fixture||cache.fixture==='song'))for(const source of ['drums','percussion','keyboard']){if(s.stems[source]?.visual===false)continue;const stem=cache.score.stems.find(x=>x.id===source);if(stem?.availability!=='present')continue;
   const ev=stem.events||[];let lo=0,hi=ev.length;while(lo<hi){const m=(lo+hi)>>1;if(ev[m].time<=t)lo=m+1;else hi=m;}
   for(let j=lo-1;j>=0;j--){const e=ev[j],age=t-e.time;if(age>4.5)break;if(e.strength<.34||s._tunnel&&e.time<s._bridge.start)continue;
    const id=cache.score.id+':fire:'+source+':'+j;events.push({id,source,time:e.time,age,strength:e.strength*(source==='keyboard'?.6:source==='percussion'?.75:1),seed:hash(id)});if(lo-j>15)break;}}
  const deck=HapaHorizons.evaluate(s,t);if(on)for(const w of deck.waves||[]){const age=w.age??(t-w.time);if(age>=0&&age<4.5){const id='human-fire:'+((t-age).toFixed(3));events.push({id,source:'human-wave',time:t-age,age,strength:.9,seed:hash(id)});}}
  events.sort((a,b)=>b.time-a.time);events.splice(6);
  const locks=s.cut?HapaEditorial.frame(s,s._cueTime??t).shot.locks:null;
  return HapaElements.fire({schema:'hapa.paint.fire.packet/1',source:cache.score.id,time:t,clock:on?t:0,animated:on,enabled:c.enabled,field,events,opening,gathering:gather,lookLocked:!!(locks?.look||locks?.shot),carry:cur.packet,
   channels:{fuel,reach:height,turbulence:turb,wind,embers:events.length,light,heatHaze},trace:roles.map(r=>({id:r.id,name:r.name,verb:r.verb,inputs:r.sources.map(id=>({id,availability:sig[id]?.availability||'missing',enabled:!!sig[id]?.enabled&&on&&['present','synthetic'].includes(sig[id]?.availability),sourceAssetId:sig[id]?.sourceAssetId||null}))})),
   basis:'artistic fire coefficients from measured audio; no inferred combustion, Kelvin, weather or emotion'},cache,s,t);
 }
 function emitters(s){if(s._tunnel){const L=s._bridge.length;const e=[];for(let i=0;i<4;i++)for(const side of [-1,1])e.push([side*3.45,-1.30,3+i*(L-6)/3,.68]);return e;}
  if(s.world==='cinder-organ')return [[0,-1.00,-.45,1.00],[-2.9,-.20,-1.9,.53],[2.9,-.20,-1.9,.53],[-4.8,.5,-3.7,.45],[4.8,.5,-3.7,.45]];
  return [[0,-1.25,0,1.12]];}
 function sparks(q,places){const out=[];if(!q.animated||!q.enabled||q.field.optics[2]===0)return out;
  const density=q.field.optics[2];
  // Small explicit idle ember stream; event bursts remain separate and source-bound.
  const ev=[...q.events];for(let i=0;i<4;i++){const period=3.6,offset=i*.83,born=Math.floor((q.clock-offset)/period)*period+offset;if(born>=0)ev.push({id:'idle:'+i+':'+born,time:born,age:q.clock-born,strength:.23,seed:hash('idle:'+i+':'+born)});}
  for(const e of ev){const count=e.source?Math.ceil(4*density):1;if(e.age<0||e.age>4.5)continue;
   for(let i=0;i<count;i++){const sd=(e.seed+i*1013)>>>0,rnd=((sd%997)/997),a=rnd*Math.PI*2,origin=places[sd%places.length],age=e.age,sc=origin[3];
    const yy=(1.25+.75*e.strength)*age-.12*age*age,r=.12+.20*age;
    const x=Math.cos(a)*r+q.field.motion[2]*age*.22+Math.sin(age*1.8+a)*.09,z=Math.sin(a)*r+q.field.motion[3]*age*.22;
    const fade=Math.min(1,age/.08)*Math.pow(Math.max(0,1-age/4.5),1.4)*(.45+.55*e.strength)*density;
    const col=HapaFireKernel.color(Math.max(.02,.55-age*.12),q.field.optics[3]);out.push({id:e.id+':'+i,source:e.source||'authored-idle',position:[origin[0]+x*sc,origin[1]+yy*sc,origin[2]+z*sc],size:2.0+e.strength*1.5,alpha:fade,color:col});}
  }return out.slice(0,32);
 }
 function decorate(list){let from=list[0]?.from;for(let i=0;i<list.length;i++){const b=list[i];b.from=from;if(i===6){b.to='hearth-of-three';b.toPalette='hearth-twilight';b.label='The shared warmth';}if(i===7){b.style='ember-passage';b.to='cinder-organ';b.toPalette='forge-nocturne';b.label='Ember Passage';}from=b.to;}return list;}
 function tour(s,score){if(s.passages.bridges.some(b=>b.locked)||s.director.shots.some(x=>x.locks?.shot||x.locks?.camera))throw Error('Unlock protected routes before adding Fire excursions');
  const next=cp(s.passages);decorate(next.bridges);HapaPassages.validate({...s,passages:next},score);HapaEditorial.checkpoint(s,'Add Fire excursions');s.passages=next;HapaEditorial.saveActive(s);return cp(next);}
 return{worlds,styles,defaults,validate,config,patch,active,kind,roles,presets,evaluate,emitters,sparks,decorate,tour};
})();
for(const w of HapaFire.worlds)HapaCore.worlds.push({...w,modules:['paint.fire','fire.stage'],camera:'bounded warm-hearth sweep'});
HapaCore.palettes.push({id:'hearth-twilight',name:'Fire / Hearth twilight',roles:{background:'#101628',shadow:'#161e2c',body:'#544f52',accent:'#829bb1',highlight:'#edd0a2',emission:'#f59d48',fog:'#1b2d45'}},
 {id:'forge-nocturne',name:'Fire / Forge nocturne',roles:{background:'#090f1d',shadow:'#101820',body:'#455363',accent:'#73adbe',highlight:'#f5d4a0',emission:'#fca043',fog:'#253443'}});
HapaCore.modules.push({id:'paint.fire',version:'0.1.0',kind:'paint',description:'Reusable emitter-local density / heat / curl / optics packet, independent of audio and rendering ownership'});
HapaPaints.register({id:'fire',version:'0.1.0',name:'Fire Instrument',outputs:['density','normalized heat','smoke','curl field','emission','thermal distortion','local light'],bindings:['hearth volume','brazier procession','ember surface'],evaluate:(...a)=>HapaFire.evaluate(...a),sample:(packet,x,y,z)=>window.HapaWind?HapaWind.sampleFire(packet,[x,y,z]):HapaFireKernel.sample(packet.field,[x,y,z])});

