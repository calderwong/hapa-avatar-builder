
/* Wind Instrument / shared cause, deliberately different material responses.
 * Base Fire heat and base Water roughness inform Wind once; downstream bindings do
 * not feed back recursively. This directed exchange is not a coupled PDE/thermodynamic solver.
 */
'use strict';
window.HapaWind=(()=>{
 const cp=x=>structuredClone(x),C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const waterBase=HapaWater.evaluate,fireBase=HapaFire.evaluate,firePlacesBase=HapaFire.emitters,fireSparksBase=HapaFire.sparks,waterSampleBase=HapaWater.sample;
 const worlds=[{id:'confluence-court',name:'Confluence Court',kind:18,subtitle:'Painted air / fire bowls / responsive mirror water'}],styles=['pressure-passage'];
 const defaults=()=>({schema:'hapa.paint.wind/1',enabled:true,animate:true,visible:true,everywhere:false,fireLink:true,waterLink:true,exchange:true,
  strength:.60,gusts:.68,curl:.53,vortex:.44,pressure:.78,pigment:.67,fireCoupling:.72,waterCoupling:.80,heatLift:.53,waterDrag:.48,bearing:18,palette:'jade'});
 const numbers={strength:[0,1],gusts:[0,1],curl:[0,1],vortex:[0,1],pressure:[0,1],pigment:[0,1],fireCoupling:[0,1],waterCoupling:[0,1],heatLift:[0,1],waterDrag:[0,1],bearing:[-180,180]};
 const presets={zephyr:{strength:.32,gusts:.35,curl:.28,vortex:.18,pressure:.42,pigment:.50,palette:'pearl'},tempest:{strength:.85,gusts:.95,curl:.84,vortex:.68,pressure:1,pigment:.70,palette:'copper'},calligraphy:{strength:.55,gusts:.64,curl:.53,vortex:.53,pressure:.78,pigment:.80,palette:'jade'}};
 function validate(c){if(!c||c.schema!=='hapa.paint.wind/1'||Object.keys(c).some(k=>!Object.hasOwn(defaults(),k)))throw Error('Unknown Wind settings');for(const k of ['enabled','animate','visible','everywhere','fireLink','waterLink','exchange'])if(typeof c[k]!=='boolean')throw Error('Wind '+k+' must be boolean');for(const [k,[a,b]]of Object.entries(numbers))if(!Number.isFinite(c[k])||c[k]<a||c[k]>b)throw Error('Wind '+k+' outside bounds');if(!['jade','copper','pearl'].includes(c.palette))throw Error('Unknown Wind palette');return true;}
 const config=s=>s.reliquary?.wind||defaults(),combined=s=>s._tunnel?styles.includes(s._bridge?.style):s.world==='confluence-court';
 const relevant=s=>combined(s)||HapaWater.enabled(s)||HapaFire.active(s)||config(s).everywhere;
 function patch(s,p){const n={...config(s),...p};validate(n);HapaEditorial.checkpoint(s,'Wind Paint');s.reliquary.wind=n;HapaEditorial.saveActive(s);return cp(n);}
 function places(s){if(combined(s)){if(s._tunnel){const out=[],L=s._bridge.length;for(let i=0;i<4;i++)for(const side of [-1,1])out.push([side*3.40,-.70,3.5+i*(L-7)/3,.64]);return out;}
   return [[-3.,-.78,-1.8,1.02],[3.,-.78,-1.8,1.02],[0.,-.72,-5.1,.90]];}return HapaFire.active(s)?firePlacesBase(s):[];}
 const hash=s=>{let h=2166136261;for(const x of s)h=Math.imul(h^x.charCodeAt(0),16777619);return h>>>0;};
 const stores=new WeakMap(),sample=(a,t)=>{const x=C(t*60,0,a.length-1),i=Math.floor(x);return a[i]+((a[i+1]??a[i])-a[i])*(x-i);};
 function bank(cache,s){const b=HapaArticulation.responseBank(cache),sig=HapaArticulation.ids.map(id=>s.stems[id]?.visual===false?'0':'1').join('');let v=stores.get(b);if(!v){v=new Map();stores.set(b,v);}if(v.has(sig))return v.get(sig);
  const mean=new Float32Array(b.frames),sea=new Float32Array(b.frames),travel=new Float64Array(b.frames);let a=0,w=0,old=0;
  const g=(id,k,i)=>s.stems[id]?.visual===false?0:b.rows[id]?.[k]?.[i]||0;
  for(let i=0;i<b.frames;i++){const raw=C(.35*g('lead-vocals','sustain',i)+.27*g('synth','mass',i)+.21*g('strings','mass',i)+.20*g('backing-vocals','sustain',i)+.22*g('bass','mass',i));
   a+=(raw-a)*(1-Math.exp(-1/(60*(raw>a?.28:.95))));w+=(a-w)*(1-Math.exp(-1/(60*(a>w?1.5:3.6))));mean[i]=a;sea[i]=w;const velocity=.5+a*1.8;if(i)travel[i]=travel[i-1]+(old+velocity)/120;old=velocity;}
  const out={mean,sea,travel};if(v.size>4)v.clear();v.set(sig,out);return out;
 }
 function pressureEvents(cache,s,t,c){if(c.pressure===0)return[];const out=[];if(!cache.fixture||cache.fixture==='song')for(const source of ['drums','percussion','keyboard']){if(s.stems[source]?.visual===false)continue;const stem=cache.score.stems.find(x=>x.id===source);if(stem?.availability!=='present')continue;const es=stem.events||[];let lo=0,hi=es.length;while(lo<hi){const m=(lo+hi)>>1;if(es[m].time<=t)lo=m+1;else hi=m;}
   for(let i=lo-1;i>=0;i--){const e=es[i];if(t-e.time>8)break;if(e.strength<.52||s._tunnel&&e.time<s._bridge.start)continue;const id=cache.score.id+':wind:'+source+':'+i;out.push({id,source,time:e.time,age:t-e.time,strength:e.strength*(source==='keyboard'?.55:source==='percussion'?.72:1)});}}
  const gestures=[...(s.director.gestures||[]),...(s._gestureLive||[])];for(const e of gestures)if(e.kind==='shock'&&t>=e.time&&t-e.time<8)out.push({id:e.id,source:'human-pressure',time:e.time,age:t-e.time,strength:e.strength});
  out.sort((a,b)=>b.time-a.time);const chosen=[];for(const e of out){if(e.source!=='human-pressure'&&chosen.some(a=>Math.abs(a.time-e.time)<.60))continue;const seed=hash(e.id),L=s._bridge?.length||36;
   const z=s._tunnel?C(-.35+L*HapaCurrents.progress(cache,s,s._bridge,e.time)+2.,.4,L-1.5):e.source==='human-pressure'?0:-2+(seed%13-6)*.14;
   chosen.push({...e,origin:[e.source==='human-pressure'?0:((seed%17)-8)*.12,-1.38,z],speed:4.6,width:.44+.15*e.strength,life:8});if(chosen.length===4)break;}
  return chosen;
 }
 const roles=[{id:'flow',name:'Carrying breeze',sources:['lead-vocals','backing-vocals','synth','strings','bass'],verb:'gather · travel · coast'},
 {id:'curl',name:'Vortices / brush turns',sources:['guitar','keyboard'],verb:'curl · thread · unfurl'},
 {id:'pressure',name:'Pressure fronts',sources:['drums','percussion','keyboard'],verb:'compress · pass · rebound'},
 {id:'color',name:'Pigment / air ink',sources:['lead-vocals','backing-vocals','synth'],verb:'catch light · split · fade'}];
 function evaluate(cache,s,t){t=HapaElements.time(s,t,'wind');s=HapaElements.stateFor(s,'wind');if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Wind time outside source');const c=config(s),on=c.enabled&&c.animate&&s.reliquary?.animated!==false&&!s.reduced,b=bank(cache,s),kin=HapaArticulation.evaluate(cache,s,t),signals=kin.signals,mac=HapaDirector.evaluate(cache.score,cache,s,t).values,cur=HapaCurrents.evaluate(cache,s,t,{kin});
  const v=(id,k)=>on?(signals[id]?.[k]||0):0,activity=on?sample(b.mean,t):0,memory=on?sample(b.sea,t):0;
  const phase=on?sample(b.travel,t)*(.62+c.strength*.55):0,angle=c.bearing*Math.PI/180,force=c.enabled?(.16+c.strength*(.40+1.20*activity))*(on?(.5+.5*mac.motion):.55):0;
  const fire=places(s).length?fireBase(cache,s,on?t:0):null,water=combined(s)||HapaWater.enabled(s)?waterBase(cache,s,on?t:0):null,thermal=new Array(32).fill(0),positions=places(s);
  if(c.enabled&&c.exchange&&c.heatLift>0&&fire?.enabled)positions.forEach((e,i)=>{thermal.splice(i*4,4,e[0],e[1],e[2],C(fire.field.shape[0]*(HapaElements.enabled(s)?1.05:(.45+fire.field.optics[0]))*.85,0,1.6));});
  const events=on?pressureEvents(cache,s,t,c):[],orig=new Array(16).fill(0),shapes=new Array(16).fill(0);for(let i=0;i<4;i++){shapes.splice(i*4,4,0,4.6,.5,8);if(events[i]){const e=events[i];orig.splice(i*4,4,...e.origin,e.age);shapes.splice(i*4,4,e.strength*c.pressure,e.speed,e.width,e.life);}}
  const damp=water&&c.enabled&&c.exchange?c.waterDrag*(.35+.65*C(water.swell+.35*water.wind)):0;
  const field={schema:'hapa.paint.wind.field/1',mean:[Math.cos(angle)*force,0,Math.sin(angle)*force,phase],detail:[c.enabled?c.curl*(.22+.65*Math.max(v('guitar','attack'),v('keyboard','attack'))):0,c.enabled?c.vortex*(.30+.55*v('backing-vocals','sustain')+.22*(on?cur.opening:0)):0,c.enabled?c.gusts*(.2+activity*.65):0,c.enabled&&c.exchange?c.heatLift*1.8:0],origin:[0,-.2,s._tunnel?s._bridge.length*.50:-2.,4.6],surface:[water?.binding.level??-100,water?.swell||0,damp,0],shockOrigins:orig,shockShapes:shapes,thermals:thermal};
  const locks=s.cut?HapaEditorial.frame(s,s._cueTime??t).shot.locks:null,colorLocked=!!(locks?.look||locks?.shot);
  const palettes={jade:[[.14,.62,.61],[.88,.63,.24]],pearl:[[.48,.62,.80],[.78,.79,.71]],copper:[[.88,.34,.12],[.33,.68,.72]]};const tones=palettes[c.palette],colorPulse=C(v('lead-vocals','sustain')*.40+v('backing-vocals','attack')*.18),colors=[tones[0].map((x,i)=>x*(1-colorPulse*.35)+tones[1][i]*colorPulse*.35),tones[1]];
  return HapaElements.wind({schema:'hapa.paint.wind.packet/1',source:cache.score.id,time:t,animated:on,field,events,force,memory,activity,phase,fireCoupling:on&&c.fireLink?c.fireCoupling:0,waterCoupling:on&&c.waterLink?c.waterCoupling:0,
   pigment:c.enabled&&c.visible&&!colorLocked?c.pigment:0,palette:c.palette,colors,feedback:{thermalCount:thermal.filter((_,i)=>i%4===3&&thermal[i]>0).length,waterDamping:damp,policy:'uncoupled Fire/Water feed Wind once; no recursive amplification'},
   trace:roles.map(r=>({...r,inputs:r.sources.map(id=>({id,enabled:on&&signals[id]?.enabled,availability:signals[id]?.availability||'missing',sourceAssetId:signals[id]?.sourceAssetId||null}))})),basis:'authored wind/pressure field driven by source-time stem activity; scene units, not weather or acoustic pressure'},cache,s,t);
 }
 function coupleWater(cache,s,t,q){s=HapaElements.stateFor(s,'water');if(HapaElements.enabled(s)&&!HapaWater.config(s).enabled)return q;const w=evaluate(cache,s,q.time);if(!w.waterCoupling)return q;return{...q,sharedWind:w,wind:q.wind+.30*w.waterCoupling*w.memory,foam:C(q.foam+w.waterCoupling*w.memory*.035,0,1),coupling:{kind:'wind-to-water',gain:w.waterCoupling,memorySeconds:'1.5 rise / 3.6 decay',eventIds:w.events.map(e=>e.id)}};}
 function coupleFire(cache,s,t,q){s=HapaElements.stateFor(s,'fire');const w=evaluate(cache,s,q.time);if(!w.fireCoupling)return q;return{...q,sharedWind:w,emitters:places(s),coupling:{kind:'wind-to-fire',gain:w.fireCoupling,eventIds:w.events.map(e=>e.id)}};}
 function sampleWater(q,x,z){const out=waterSampleBase(q,x,z);if(!q.sharedWind?.waterCoupling)return out;const w=q.sharedWind,d=HapaWindKernel.water(w.field,[x,z],w.waterCoupling,w.memory);out.height+=d.height;out.level+=d.height;out.slope=out.slope.map((v,i)=>v+d.slope[i]);const len=Math.hypot(...out.slope,1);out.normal=[-out.slope[0]/len,1/len,-out.slope[1]/len];return out;}
 function sampleFire(q,p,emitter=q.emitters?.[0]||[0,0,0,1]){const w=q.sharedWind,off=emitter[0]*.73+emitter[1]*.31+emitter[2]*1.17;if(!w?.fireCoupling)return HapaFireKernel.sample(q.field,p,off);const world=p.map((x,i)=>emitter[i]+x*emitter[3]),v=HapaWindKernel.sample(w.field,world),yn=C(p[1]/q.field.shape[1],0,1.2),g=w.fireCoupling;
  const point=[p[0]-C(v.velocity[0]*.38*g*yn*yn,-1.3,1.3),p[1]*(1+C(v.pressure,-.5,1)*.28*g),p[2]-C(v.velocity[2]*.38*g*yn*yn,-1.3,1.3)];return{...HapaFireKernel.sample(q.field,point,off),wind:v};}
 function sparks(q,ps){const p=fireSparksBase(q,ps),w=q.sharedWind;if(!w?.fireCoupling)return p;
  for(const a of p){const v=HapaWindKernel.sample(w.field,a.position),age=C(a.position[1]+1.3,0,4);a.position[0]+=C(v.velocity[0]*.17*w.fireCoupling,-.65,.65)*age;a.position[2]+=C(v.velocity[2]*.17*w.fireCoupling,-.65,.65)*age;a.position[1]+=C(v.velocity[1]*.10*w.fireCoupling,0,.55);}
  return p;
 }
 function decorate(list){let from=list[0]?.from;for(let i=0;i<list.length;i++){const b=list[i];b.from=from;if(i===7){b.to='confluence-court';b.toPalette='confluence-dusk';b.style='pressure-passage';b.label='Pressure Passage';}from=b.to;}return list;}
 function tour(s,score){if(s.passages.bridges.some(b=>b.locked)||s.director.shots.some(x=>x.locks?.shot||x.locks?.camera))throw Error('Unlock protected routes before adding Wind excursion');const n=cp(s.passages);decorate(n.bridges);HapaPassages.validate({...s,passages:n},score);HapaEditorial.checkpoint(s,'Add Wind excursion');s.passages=n;HapaEditorial.saveActive(s);return cp(n);}
 return{worlds,styles,defaults,numbers,presets,validate,config,patch,combined,relevant,roles,evaluate,places,coupleFire,coupleWater,sampleWater,sampleFire,sparks,decorate,tour,baseWater:waterBase,baseFire:fireBase,baseWaterSample:waterSampleBase};
})();
const _waterEval089=HapaWater.evaluate,_fireEval089=HapaFire.evaluate;
HapaWater.evaluate=(cache,s,t)=>HapaWind.coupleWater(cache,s,t,_waterEval089(cache,s,t));HapaWater.sample=HapaWind.sampleWater;
HapaFire.evaluate=(cache,s,t)=>HapaWind.coupleFire(cache,s,t,_fireEval089(cache,s,t));HapaFire.sparks=HapaWind.sparks;
for(const w of HapaWind.worlds)HapaCore.worlds.push({...w,modules:['paint.wind','paint.water','paint.fire'],camera:'bounded shared-element court sweep'});
HapaCore.palettes.push({id:'confluence-dusk',name:'Wind / Confluence dusk',roles:{background:'#121c30',shadow:'#091e2e',body:'#396775',accent:'#5abcb9',highlight:'#f0ddac',emission:'#8cbec9',fog:'#415b78'}});
HapaCore.modules.push({id:'paint.wind',version:'0.1.0',kind:'paint',description:'Shared world-space breeze, curl, finite pressure fronts and visible air ink; asymmetric Fire/Water coupling'});
HapaPaints.register({id:'wind',version:'0.1.0',name:'Wind Instrument',outputs:['world velocity','signed pressure','compression front','thermal lift','surface damping','painted streamlines'],bindings:['calligraphic ribbons','pressure shells','fire lean','water wake','confluence court'],evaluate:HapaWind.evaluate,sample:(packet,x,y,z)=>HapaWindKernel.sample(packet.field,[x,y,z])});

