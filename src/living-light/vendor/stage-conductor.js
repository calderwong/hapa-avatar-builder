
/* Living Light 107 — Dancing Stages. Original source-time world choreography.
 * No second player, AudioContext, feature analysis, wall-clock integration or simulation.
 * Missing optional subtree means 106. Resting life is authored, never a detected beat.
 */
'use strict';
window.HapaStages=(()=>{
 const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),copy=x=>structuredClone(x);
 const worlds=[
  {id:'confluence-court',name:'Confluence Court',family:'pressure',palette:'confluence-dusk',signature:'Pressure sails · carved amphitheatre · asymmetric air-conducted ribs'},
  {id:'celestial-reliquary',name:'Celestial Reliquary',family:'celestial',palette:'astral-brocade',signature:'Velvet apse · answering bronze fans · suspended constellations'},
  {id:'rain-court',name:'Rain Court',family:'rain',palette:'water-moonstone',signature:'Rain-glass shutters · engraved listening stones · falling-sky canopy'},
  {id:'tidal-observatory',name:'Tidal Observatory',family:'tidal',palette:'pearl-tide',signature:'Tidal terraces · distant wind harps · an open layered horizon'},
  {id:'windward-reach',name:'Windward Reach',family:'windward',palette:'water-sunrise',signature:'Wind vanes · paired sail wings · long rolling counterpoint'},
  {id:'hearth-of-three',name:'Hearth of Three',family:'hearth',palette:'hearth-twilight',signature:'Basalt shelter · warm flues · heavy, delayed architectural recoil'},
  {id:'cinder-organ',name:'Cinder Organ',family:'organ',palette:'hearth-twilight',signature:'Telescoping resonators · copper shutters · soot-carved stone'},
  {id:'neon-cloister',name:'Neon Cloister',family:'porcelain',palette:'electric-neon',signature:'Porcelain bellows · engraved side chapels · cool/warm material contrast'},
  {id:'lumen-arcade',name:'Lumen Arcade',family:'copper',palette:'lumen-copper',signature:'Copper lamellae · articulated vault baffles · traveling architectural bends'},
  {id:'solar-reliquary',name:'Solar Reliquary',family:'solar',palette:'gilded-tide',signature:'Heliostat petals · engraved bronze backing · harmonic opening'},
  {id:'weave-study',name:'Weave Study',family:'textile',palette:'rose-vellum',signature:'Suspended textile swatches · carved loom frames · layered cloth tension'},
  {id:'halo-vault',name:'Halo Vault (Arcade)',family:'copper',palette:'electric-halo',signature:'Compatibility alias for the copper Arcade composition'}
 ];
 const keys=['dance','texture','atmosphere','echo','life'],families=[...new Set(worlds.map(w=>w.family))];
 const defaults=()=>({schema:'hapa.stages/1',enabled:true,dance:.82,texture:.84,atmosphere:.40,echo:.68,life:.60,focus:'balanced',seed:108,overrides:{}});
 function validate(c){
  if(!c||typeof c!=='object'||Array.isArray(c)||c.schema!=='hapa.stages/1'||Object.keys(c).some(k=>!Object.hasOwn(defaults(),k)))throw Error('Unknown Stage recipe');
  if(typeof c.enabled!=='boolean')throw Error('Stage enabled must be boolean');
  for(const k of keys)if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Stage '+k+' must be finite 0–1');
  if(!['minimal','balanced','rich'].includes(c.focus))throw Error('Unknown Background Focus');
  if(!Number.isInteger(c.seed)||c.seed<0||c.seed>4294967295)throw Error('Stage seed must be uint32');
  if(!c.overrides||typeof c.overrides!=='object'||Array.isArray(c.overrides))throw Error('Stage overrides must be a world map');
  for(const [id,o]of Object.entries(c.overrides)){
   if(!worlds.some(w=>w.id===id)||!o||typeof o!=='object'||Array.isArray(o))throw Error('Unknown stage override '+id);
   for(const [k,v]of Object.entries(o))if(k==='focus'?!['minimal','balanced','rich'].includes(v):!keys.includes(k)||!Number.isFinite(v)||v<0||v>1)throw Error('Invalid stage override '+id+'/'+k);
  }return true;
 }
 const config=s=>s.reliquary?.stages||{...defaults(),enabled:false};
 const settings=s=>({...config(s),...config(s).overrides[s.world]});
 const world=s=>worlds.find(w=>w.id===s.world);
 const eligible=s=>!s._tunnel&&!s._geometryProof&&!s._elementInspect&&!window.HapaDynamics?.relevant(s)&&!!world(s);
 const enabled=s=>eligible(s)&&config(s).enabled&&!s._stageInspect?.baseline;
 function patch(s,p,replace=false){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Stage patch must be an object');
  const old=config(s),n=replace?copy(p):{...old,...p,overrides:copy(old.overrides)};
  if(!replace&&Object.hasOwn(p,'overrides')){
   if(!p.overrides||typeof p.overrides!=='object'||Array.isArray(p.overrides))throw Error('Stage overrides must be a world map');
   for(const [id,v]of Object.entries(p.overrides)){if(!worlds.some(w=>w.id===id)||v!==null&&(typeof v!=='object'||Array.isArray(v)))throw Error('Invalid stage override '+id);if(v===null)delete n.overrides[id];else n.overrides[id]={...n.overrides[id],...v};}
  }
  validate(n);HapaEditorial.checkpoint(s,'Dancing Stages');s.reliquary.stages=n;HapaEditorial.saveActive(s);return copy(n);
 }
 const apply=s=>patch(s,defaults(),true);
 const memo=new WeakMap();let hits=0,misses=0;
 function evaluate(cache,s,t){
  if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Stage time outside the source');
  const c=settings(s),w=world(s),on=enabled(s),pr=s._stageInspect;
  if(!on)return{schema:'hapa.stage.response/1',enabled:false,time:t,world:s.world,reason:!eligible(s)?'Not a 107 stage / protected inspection or passage':pr?.baseline?'106 comparison':'106 treatment retained',config:c};
  const time=pr?.freeze?C(pr.time,0,cache.score.duration):t,moving=!s.reduced&&s.reliquary?.animated!==false;
  const state=pr?.rest?{...s,stems:Object.fromEntries(Object.entries(s.stems).map(([id,v])=>[id,{...v,visual:false}]))}:s;
  const mask=HapaArticulation.ids.map(id=>state.stems[id]?.visual===false?'0':'1').join('');
  const key=JSON.stringify([time,cache.fixture,s.world,c,mask,moving,!!pr?.body,s.reliquary?.breadthAmount,s.reliquary?.dance,s.reliquary?.wind,s.reliquary?.fire,s.reliquary?.water,s.reliquary?.elemental,s.horizons,s._gestureLive]);
  let m=memo.get(cache);if(!m){m=new Map();memo.set(cache,m);}if(m.has(key)){hits++;return m.get(key);}misses++;
  // Use the existing 60 Hz causal articulation bank. No extra response filter/latency stack.
  const kin=HapaArticulation.evaluate(cache,state,time),sig=kin.signals;
  const v=(id,k)=>moving?(sig[id]?.[k]||0):0;
  const body=[C(v('bass','mass')),C(v('lead-vocals','sustain')),
   C(Math.max(v('synth','sustain'),v('strings','sustain'),v('backing-vocals','sustain'))),C(Math.max(v('guitar','attack'),v('keyboard','attack')))];
  const dc=HapaGeometryDance.config(s),octave=[.74,1,1.32][dc.octave]||1,rate=octave*(dc.character==='flow'?.88:dc.character==='percussive'?1.12:1);
  const phase=moving?[time*.38*c.life+v('bass','phase')*.37,
   time*.24*c.life+v('lead-vocals','phase')*.43+v('backing-vocals','phase')*.18,
   time*.33*c.life+v('guitar','phase')*.44+v('keyboard','phase')*.36,
   time*.15*c.life+v('synth','phase')*.24+v('strings','phase')*.22].map(p=>p*rate):[0,0,0,0];
  const accents=[];
  if(moving&&!pr?.rest&&cache.fixture==='song')for(const id of ['drums','percussion','keyboard']){
   const stem=cache.score.stems.find(x=>x.id===id);if(state.stems[id]?.visual===false||stem?.availability!=='present')continue;
   const es=stem.events||[];let lo=0,hi=es.length;while(lo<hi){const mid=(lo+hi)>>1;if(es[mid].time<=time)lo=mid+1;else hi=mid;}
   for(let i=lo-1;i>=0;i--){const e=es[i],age=time-e.time;if(age>4.4)break;if(e.strength<.4)continue;
    accents.push({id:cache.score.id+':stage:'+id+':'+i,source:id,sourceTime:e.time,age,strength:C(e.strength),seed:(i*1.618+(id==='drums'?0:id==='percussion'?2:4))%6.2831853,lifetime:4.4});}
  }
  accents.sort((a,b)=>b.sourceTime-a.sourceTime);accents.splice(4);
  const packed=new Array(16).fill(0);accents.forEach((e,i)=>packed.splice(i*4,4,e.age,e.strength,e.seed,e.lifetime));
  const breadth=1+.30*(s.reliquary?.breadthAmount||0)*C(kin.breadthPeak||0);
  const amp=moving?c.dance*breadth:0;
  // Shared Wind field, sampled at authored rest coordinates by the receiving mesh.
  // It does not drive or mutate Water/Fire; there is no feedback cycle.
  const wind=moving&&HapaWind.config(state).enabled&&w.family==='pressure'?HapaWind.evaluate(cache,state,time):null;
  const q={schema:'hapa.stage.response/1',enabled:true,time,world:s.world,family:w.family,familyIndex:families.indexOf(w.family),signature:w.signature,config:c,
   moving,clock:moving?time*c.life*rate:0,phase,body,amp,echo:moving?c.echo:0,accents,packed,
   motion:[amp,c.life,body[0],body[1]],tone:[body[2],body[3],moving?C(Math.abs(v('drums','strike'))):0,0],
   wind,bodyOnly:!!pr?.body,focusScale:{minimal:.72,balanced:1.02,rich:1.22}[c.focus],
   provenance:HapaArticulation.ids.map(id=>({source:id,availability:sig[id]?.availability||'missing',sourceAssetId:sig[id]?.sourceAssetId||null,enabled:sig[id]?.enabled!==false,raw:sig[id]?.raw??null,mapped:moving?sig[id]?.mass||0:0})),
   policy:'source-time causal response / finite measured-onset packets / authored resting motion; not beat, lyric or physical structural analysis',
   limits:{maximumBaseDanceAmplitude:1.30,roleFlexibility:[1,1.35,1.65,1.75,1.4,1.6,1.8,.8],receiverWindClamp:1.5,materials:'bounded filtered surface relief; not added microgeometry',silence:'no invented onset events; authored life only'}};
  if(m.size>=8)m.delete(m.keys().next().value);m.set(key,q);return q;
 }
 function echo(q,p,seed){let out=0;if(!q.enabled||!q.moving)return 0;const d=Math.hypot(p[0],p[2]+2);
  for(const e of q.accents){const a=e.age-d/7-(.5+.5*Math.sin(seed))* .18;if(a<0)continue;
   out+=e.strength*Math.sin(a*7.5)*Math.exp(-a*1.8)*C(a/.07);}
  return C(out,-1,1)*q.echo;
 }
 function point(q,p,anchor,data){
  if(!q?.enabled)return p.slice();const [role,seed,height]=data,ph=q.phase,m=q.motion,tn=q.tone,amp=m[0]*([1,1.35,1.65,1.75,1.4,1.6,1.8,.8][Math.round(role)]||1),h=Math.max(.1,height),s=seed+(q.config.seed%997)*.013;
  if(amp<=0||role<.5)return p.slice();const v=p.map((x,i)=>x-anchor[i]),top=C(v[1]/h),hang=C(-v[1]/h),e=echo(q,p,s),life=m[1];
  let x=p[0],y=p[1],z=p[2];
  if(role<1.5){const g=top*top,a=ph[0]+s+v[2]*.23;
   x+=amp*g*(v[0]*(.015*life+.040*m[2])*Math.sin(a)+(.06*life+.20*m[3])*Math.sin(ph[1]+s));
   y+=amp*g*((.09*life+.34*m[2])*Math.sin(a-.5)+.15*e);
   z+=amp*g*((.10*life+.35*tn[0])*Math.sin(ph[3]+s+v[0]*.25)+.18*e);
  }else if(role<2.5||role>6.5){const g=hang*hang,wind=q.wind?HapaWindKernel.sample(q.wind.field,p).velocity.map(v=>C(v,-1.5,1.5)):[0,0,0],air=role>6.5?.45:1;
   x+=amp*g*air*((.20*life+.42*m[3])*Math.sin(ph[1]+s+v[1]*.65)+wind[0]*(.12*life+.26*m[3]));
   z+=amp*g*air*((.22*life+.44*tn[0])*Math.sin(ph[3]+s+v[0]*1.6+v[1]*.8)+.34*e+wind[2]*(.12*life+.26*m[3]));
   y+=amp*hang*air*(.06*life+.15*tn[1])*Math.sin(ph[2]+s+v[0]*1.2);
  }else if(role<3.5){const a=amp*((.045*life+.18*m[3]+.10*tn[1])*Math.sin(ph[1]+s)+.10*e),c=Math.cos(a),sn=Math.sin(a);x=anchor[0]+v[0]*c-v[2]*sn;z=anchor[2]+v[0]*sn+v[2]*c;y+=amp*top*(.06*life+.17*tn[0])*Math.sin(ph[3]+s);
  }else if(role<4.5){y+=amp*top*((.10*life+.50*m[2])*Math.sin(ph[0]+s)+.38*e);x+=amp*top*(.03*life+.13*tn[1])*Math.sin(ph[2]+s);
  }else if(role<5.5){const a=amp*(.03*life+.12*tn[0]) *Math.sin(ph[3]+s),c=Math.cos(a),sn=Math.sin(a);x=anchor[0]+v[0]*c-v[1]*sn;y=anchor[1]+v[0]*sn+v[1]*c;z+=amp*(.13*life+.38*m[3])*Math.sin(ph[1]+s)+amp*.12*e;
  }else{const g=top*top;y+=amp*g*(.08*life+.30*m[2])*Math.sin(ph[0]+s+v[2]*.2);z+=amp*g*((.18*life+.35*tn[0])*Math.sin(ph[3]+s+v[1]*.6)+.22*e);}
  return [x,y,z];
 }
 return{worlds,families,keys,defaults,validate,config,settings,eligible,enabled,world,patch,apply,evaluate,echo,point,stats:()=>({cacheHits:hits,cacheMisses:misses,cachePolicy:'up to eight source/recipe/mask packets per active source cache'})};
})();
HapaCore.modules.push({id:'world.stage-conductor',version:'0.9.17',kind:'control',description:'Optional deterministic world choreography; separate life, geometry, texture, atmosphere and finite musical echo; no new source analysis'});

