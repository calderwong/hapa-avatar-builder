
/* Living Light 106. Original Hapa source-time adapters, not a second audio engine.
 * Existing 60 Hz response bank owns filtering/integration. No wall clock or live beat claims.
 * Optional saved subtree: its absence intentionally means the unmodified 105 treatment.
 */
'use strict';
window.HapaElements=(()=>{
 const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),cp=x=>structuredClone(x);
 const kinds=['water','wind','fire'], controls={life:[0,1],shape:[0,1],contour:[0,1],light:[0,1],interaction:[0,1]};
 const defaults=()=>({schema:'hapa.elemental/1',enabled:true,life:.64,shape:.78,contour:.48,light:.62,interaction:.76,caustics:.32,seed:106,history:'lagged-phase-art-direction/1',overrides:{water:{},wind:{},fire:{}}});
 function validate(c){
  if(!c||c.schema!=='hapa.elemental/1'||Object.keys(c).some(k=>!Object.hasOwn(defaults(),k)))throw Error('Unknown Elemental recipe');
  if(typeof c.enabled!=='boolean')throw Error('Elemental enabled must be boolean');
  for(const [k,[a,b]]of Object.entries({...controls,caustics:[0,1]}))if(!Number.isFinite(c[k])||c[k]<a||c[k]>b)throw Error('Elemental '+k+' must be finite '+a+'–'+b);
  if(!Number.isInteger(c.seed)||c.seed<0||c.seed>4294967295)throw Error('Elemental seed must be uint32');
  if(c.history!=='lagged-phase-art-direction/1')throw Error('Unsupported motion-history policy');
  if(!c.overrides||Object.keys(c.overrides).length!==3||kinds.some(k=>!c.overrides[k]||typeof c.overrides[k]!=='object'||Array.isArray(c.overrides[k])))throw Error('Expected Water / Wind / Fire overrides');
  for(const el of kinds)for(const [k,v]of Object.entries(c.overrides[el]))if(!Object.hasOwn(controls,k)||!Number.isFinite(v)||v<0||v>1)throw Error('Invalid '+el+' override: '+k);
  return true;
 }
 const config=s=>s.reliquary?.elemental||{...defaults(),enabled:false};
 const settings=(s,el)=>({...config(s),...config(s).overrides[el]});
 function eligible(s){return !window.HapaDynamics?.relevant(s)&&(s._tunnel?['tidal-conduit','ember-passage','pressure-passage'].includes(s._bridge?.style):['tidal-observatory','rain-court','windward-reach','hearth-of-three','cinder-organ','confluence-court'].includes(s.world));}
 const enabled=s=>eligible(s)&&config(s).enabled&&!s._elementInspect?.baseline;
 const selected=(s,el)=>s._elementInspect&&(s._elementInspect.element===el||s._elementInspect.element==='together');
 const time=(s,t,el)=>selected(s,el)&&s._elementInspect.freeze?s._elementInspect.time:t;
 function stateFor(s,el){
  if(!selected(s,el)||!s._elementInspect.rest)return s;
  return {...s,stems:Object.fromEntries(Object.entries(s.stems).map(([id,v])=>[id,{...v,visual:false}]))};
 }
 function patch(s,p,replace=false){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Elemental patch must be an object');
  const old=config(s),n=replace?cp(p):{...old,...p,overrides:cp(old.overrides)};
  if(!replace&&Object.hasOwn(p,'overrides')){if(!p.overrides||typeof p.overrides!=='object'||Array.isArray(p.overrides))throw Error('Overrides must be an element map');for(const el of Object.keys(p.overrides)){if(!kinds.includes(el))throw Error('Unknown element '+el);n.overrides[el]=p.overrides[el]===null?{}:{...n.overrides[el],...p.overrides[el]};}}
  validate(n);HapaEditorial.checkpoint(s,'Elemental Performance');s.reliquary.elemental=n;HapaEditorial.saveActive(s);return cp(n);
 }
 function apply(s){return patch(s,{...defaults(),enabled:true},true);}
 const memo=new WeakMap();let hits=0,misses=0;
 function evaluate(cache,s,t){
  if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Elemental time outside source');
  const mask=HapaArticulation.ids.map(id=>s.stems[id]?.visual===false?'0':'1').join('');
  const dc=HapaGeometryDance.config(s),c=config(s),moving=!s.reduced&&s.reliquary?.animated!==false;
  const key=JSON.stringify([t,cache.fixture,mask,c,dc,s.reliquary?.breadthAmount,moving]);
  let m=memo.get(cache);if(!m){m=new Map();memo.set(cache,m);}if(m.has(key)){hits++;return m.get(key);}misses++;
  const kin=HapaArticulation.evaluate(cache,s,t),sig=kin.signals,cur=HapaCurrents.evaluate(cache,s,t,{kin});
  const v=(id,k)=>moving?sig[id]?.[k]||0:0;
  const body={bass:C(v('bass','mass')),voice:C(v('lead-vocals','sustain')),harmonic:C(Math.max(v('synth','mass'),v('strings','mass'),v('backing-vocals','sustain')))};
  const articulation={vocal:C(v('lead-vocals','attack')),plucked:C(Math.max(v('guitar','attack'),v('keyboard','attack'))),percussion:C(Math.max(Math.abs(v('drums','strike')),Math.abs(v('percussion','strike'))))};
  const detail=C(Math.max(v('percussion','high'),v('guitar','high'),v('synth','high')));
  const integratedPhase=[v('bass','phase'),v('lead-vocals','phase')+.35*v('backing-vocals','phase'),v('guitar','phase')+.7*v('keyboard','phase'),v('synth','phase')+.65*v('strings','phase')];
  const accents=[];
  if(moving&&(!cache.fixture||cache.fixture==='song'))for(const source of ['drums','percussion','keyboard']){
   const stem=cache.score.stems.find(x=>x.id===source);if(s.stems[source]?.visual===false||stem?.availability!=='present')continue;
   const es=stem.events||[];let lo=0,hi=es.length;while(lo<hi){const mid=(lo+hi)>>1;if(es[mid].time<=t)lo=mid+1;else hi=mid;}
   for(let i=lo-1;i>=0&&lo-i<=12;i--){const e=es[i],age=t-e.time;if(age>3.2)break;if(e.strength<.34)continue;
    accents.push({id:cache.score.id+':'+source+':'+i,source,time:e.time,age,magnitude:e.strength,lifetime:3.2,envelope:Math.min(1,age/.045)*Math.exp(-age/1.05)*e.strength});}
  }
  accents.sort((a,b)=>b.time-a.time);accents.splice(8);
  const recovery=C(accents.reduce((sum,e)=>sum+e.envelope*.38,0));
  const peak=C(kin.breadthPeak||0),breadth=1+4*(s.reliquary?.breadthAmount||0)*peak;
  const q={schema:'hapa.elemental.response/1',source:cache.score.id,time:t,visualStemMask:mask,moving,
   floorPhase:moving?t:0,integratedPhase,body,articulation,detail,accents,phrase:{opening:cur.opening,gather:cur.gather,classification:'measured-activity interpretation'},peakEnvelope:peak,breadth,recovery,
   character:dc.character,octave:dc.octave,rate:[.74,1,1.32][dc.octave],
   provenance:HapaArticulation.ids.map(id=>({source:id,sourceAssetId:sig[id]?.sourceAssetId||null,availability:sig[id]?.availability||'missing',enabled:sig[id]?.enabled!==false,raw:sig[id]?.raw??null,mapped:moving?sig[id]?.mass||0:0,limit:'existing 60 Hz artistic response; finite 0–1 body mapping'})),
   history:c.history,seed:c.seed,basis:'existing causal response filters and accumulated phases; source onsets, not beat/lyric inference'};
  if(m.size>=12)m.delete(m.keys().next().value);m.set(key,q);return q;
 }
 function optical(s,el){const c=settings(s,el);return {on:enabled(s),contour:c.contour,light:c.light,body:!!s._elementInspect?.body,caustics:c.caustics};}
 const phases=(q,c,rates)=>rates.map((rate,i)=>q.floorPhase*rate*c.life*q.rate+q.integratedPhase[i]*c.shape*.42*q.rate);
 function water(q,cache,s,t){
  q.style=optical(s,'water');if(!enabled(s)||!HapaWater.config(s).enabled)return q;
  const r=evaluate(cache,q.animated?s:{...s,reduced:true},t),c=settings(s,'water'),wc=HapaWater.config(s),b=r.body,a=r.articulation;
  const drive=c.shape*(1+.18*(r.breadth-1)),factor=r.character==='elastic'?1.12:r.character==='percussive'?.92:1;
  const raw=(.075+.15*c.life+drive*(.56*b.bass+.17*b.voice+.12*b.harmonic+.12*r.recovery))*wc.swell*factor;
  const limit=q.binding.kind===12?.58:q.binding.kind===18||q.binding.kind===20?.66:1.06;
  const amp=limit*(1-Math.exp(-raw/limit)),angle=wc.windBearing*Math.PI/180+c.shape*.22*b.voice*Math.sin(r.integratedPhase[1]*.16);
  const lengths=[14.6,7.1,3.7,1.95],weights=[.61,.29,.075,.025],dirs=[.32,1.94,-.57,1.32],phase=phases(r,c,[.76,1.16,1.73,2.16]);
  q.waves=[];for(let i=0;i<4;i++){const k=Math.PI*2/lengths[i],d=dirs[i]+angle;q.waves.push(Math.cos(d)*k,Math.sin(d)*k,amp*weights[i],phase[i]);}
  q.chop=.07+.13*(.3+b.bass)*c.shape;
  q.warp=[r.moving?(.06*c.life+.42*c.shape*b.voice):0,phase[1]*.29];
  const slope=q.waves.reduce((v,x,i)=>i%4===2?v+Math.hypot(q.waves[i-2],q.waves[i-1])*x*(1+2*q.chop):v,0)*(1+Math.abs(q.warp[0])*.24);
  const slopeScale=Math.min(1,.80/Math.max(.001,slope));for(let i=2;i<16;i+=4)q.waves[i]*=slopeScale;
  // Surface is a height graph, with no horizontal displacement or foldable sheet map.
  q.rings=q.rings.map((v,i)=>i%4===3?v*c.shape:v);q.swell=amp;q.flow=[phase[0]*.11,phase[2]*.055];q.foam=wc.foam*(.10+.27*b.bass+.18*r.recovery);
  q.light=wc.light*(.38+.8*c.light);q.wind=wc.wind*(.08*c.life+c.shape*(.20*b.harmonic+.16*r.detail));
  q.response=r;q.limits={rawAmplitude:raw,finalAmplitude:amp*slopeScale,heightBudget:limit,slopeBound:slope*slopeScale,reason:slopeScale<1?'complete wave/shear slope budget':'smooth monotone height budget; no hard dead zone',horizontalDisplacement:0};
  q.bounds.maximumWaveHeight=amp*(1+q.chop)+.36;
  return q;
 }
 function fire(q,cache,s,t){
  q.style=optical(s,'fire');if(!enabled(s)||!q.enabled)return q;
  const r=evaluate(cache,q.animated?s:{...s,reduced:true},t),c=settings(s,'fire'),fc=HapaFire.config(s),b=r.body,a=r.articulation,drive=c.shape*(1+.15*(r.breadth-1));
  const ph=phases(r,c,[1.28,.33,.89,.26]);
  const width=.84+.16*c.life+drive*(.36*b.bass+.16*r.recovery);
  const rawH=1.18+fc.reach*(.68+.45*c.life+drive*(1.60*b.voice+.42*b.harmonic+.44*r.recovery));
  q.field.shape=[C(fc.fuel*(.31+.13*c.life+drive*(.50*b.bass+.13*b.harmonic+.12*r.recovery)),0,1.35),C(rawH,1.0,4.4),C(fc.turbulence*(.18+.13*c.life+drive*(.48*a.plucked+.18*b.voice)),0,1.25),fc.smoke*(.40*c.life+c.shape*.3*b.harmonic)];
  const breeze=fc.wind*(.12*c.life+c.shape*(.35*b.harmonic+.12*r.detail)),bearing=fc.bearing*Math.PI/180;
  q.field.motion=[ph[0]+ph[2]*.22,ph[1],Math.cos(bearing)*breeze,Math.sin(bearing)*breeze];
  q.field.performance=[1,width,C(drive*b.voice),C(drive*(a.plucked+.3*r.recovery))];
  q.field.gesture=[ph[1],ph[2],r.recovery*c.shape,ph[3]];q.events=q.events.map(e=>({...e,strength:e.strength*c.shape})).filter(e=>e.strength>0);
  q.field.optics=[fc.light*(.28+.90*c.light),r.moving?fc.haze*.55:0,fc.embers,q.field.optics[3]];
  if(q.style.body)q.field.optics[1]=0;
  q.response=r;q.limits={rawReach:rawH,finalReach:q.field.shape[1],reachLimit:4.4,width,reason:rawH>4.4?'emitter reach bound':'within emitter bounds'};
  return q;
 }
 function wind(q,cache,s,t){
  q.style=optical(s,'wind');if(!enabled(s)||!HapaWind.config(s).enabled)return q;
  const r=evaluate(cache,q.animated?s:{...s,reduced:true},t),c=settings(s,'wind'),wc=HapaWind.config(s),b=r.body,a=r.articulation,drive=c.shape*(1+.13*(r.breadth-1));
  const phase=phases(r,c,[.79,.37,.54,.25]);
  const force=.13+.30*c.life+drive*(.52*b.voice+.42*b.harmonic+.25*b.bass),angle=wc.bearing*Math.PI/180+.24*c.shape*b.voice*Math.sin(phase[1]);
  q.field.mean=[Math.cos(angle)*force,0,Math.sin(angle)*force,phase[0]+phase[3]*.22];
  q.field.detail[0]=wc.curl*(.38*c.life+drive*(.62*a.plucked+.14*r.detail));
  q.field.detail[1]=wc.vortex*(1.10*c.life+drive*(1.30*b.harmonic+.38*b.voice));
  q.field.detail[2]=wc.gusts*(.15*c.life+drive*(.25*b.bass+.32*r.recovery));
  q.field.shockShapes=q.field.shockShapes.map((v,i)=>i%4===0?v*c.shape:v);q.events=q.events.map(e=>({...e,strength:e.strength*c.shape}));q.field.surface[3]=1; // sphere/surface intersection in the 106 wake derivative.
  q.phase=q.field.mean[3];q.force=force;q.memory=r.moving?(.16*c.life+c.shape*q.memory):0;
  q.fireCoupling*=c.interaction;q.waterCoupling*=c.interaction;
  q.pigment*=.80;q.colors=[[.39,.52,.68],[.72,.68,.48]];
  q.response=r;q.history=c.history;q.limits={velocityPolicy:'bounded analytic field; fixed source-time lagged phases, not transported material',maximumPressurePackets:4};
  return q;
 }
 return {defaults,validate,config,settings,eligible,enabled,time,stateFor,patch,apply,evaluate,optical,water,fire,wind,controls,kinds,
  stats:()=>({responseCacheHits:hits,responseCacheMisses:misses,maximumCachedPacketsPerSource:12,history:'lagged-phase-art-direction/1'})};
})();

