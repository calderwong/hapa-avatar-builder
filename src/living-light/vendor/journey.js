/* Living Light 109 — continuous Tunnel Worlds. A view recipe, NOT a rewritten tour.
 * One host/source clock. Family transitions, distance and encounters are seekable.
 * Authored resting travel is explicit; audio phases come from authorized stem signals.
 */
'use strict';
window.HapaJourney=(()=>{
 const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),S=x=>{x=C(x);return x*x*(3-2*x);};
 const families=[
  {id:'fractal',name:'Fractal Wall',description:'Original recursive walls and red contour skeleton — the anchor.',shape:[1,1,0,0],period:10,hot:[3.2,.08,.012],cold:[.03,.18,2]},
  {id:'cathedral',name:'Cathedral Grid',description:'Tall ogival ribs, raised vaults, dark recursive side chapels.',shape:[1,1.16,.012,0],period:8,hot:[1.7,.64,.11],cold:[.035,.35,.88]},
  {id:'weave',name:'Weave / Loom',description:'Interlaced scalloped ribs, alternating braids and axial tension.',shape:[1.05,.98,.055,.11],period:7.5,hot:[1.75,.11,.50],cold:[.045,.90,.74]},
  {id:'electric',name:'Electric / Neon',description:'Polygonal conduit frames, split traces and finite onset accents.',shape:[.98,1.02,.024,.025],period:6.8,hot:[.14,1.45,2.3],cold:[1.35,.038,.63]},
  {id:'glass',name:'Tidal Glass',description:'Rolling elliptical ribs and glass-like surface sheen; not physical refraction.',shape:[1.12,1.04,.052,.038],period:11.5,hot:[.15,1.25,1.55],cold:[.07,.18,1.05]},
  {id:'star',name:'Star Reliquary',description:'Six-lobed halo ribs, bronze threads and blue jewel accents.',shape:[1.05,1.05,.028,.018],period:9,hot:[2.1,.87,.16],cold:[.04,.43,1.55]}
 ];
 const defaults=()=>({schema:'hapa.journey/1',mode:'standard',family:'auto',variety:.65,speed:1,drift:.32,intensity:.78,seed:109,avatarStyle:'apparition'});
 const config=s=>s.reliquary?.journey||defaults();
 function validate(c){
  if(!c||typeof c!=='object'||Array.isArray(c)||c.schema!=='hapa.journey/1')throw Error('Unsupported Tunnel Worlds recipe');
  for(const k of Object.keys(c))if(!Object.hasOwn(defaults(),k))throw Error('Unknown Tunnel Worlds control: '+k);
  if(!['standard','tunnel','avatar'].includes(c.mode))throw Error('Unknown journey mode');
  if(c.family!=='auto'&&!families.some(f=>f.id===c.family))throw Error('Unknown tunnel family');
  for(const k of ['variety','drift','intensity'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error(k+' must be finite 0–1');
  if(!Number.isFinite(c.speed)||c.speed<.4||c.speed>2)throw Error('Travel speed must be 0.4–2');
  if(!Number.isInteger(c.seed)||c.seed<0||c.seed>4294967295)throw Error('Journey seed must be uint32');
  if(!['apparition','traveler'].includes(c.avatarStyle))throw Error('Unknown avatar treatment');return true;
 }
 function patch(s,p,replace=false){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Journey patch must be an object');
  const n=replace?structuredClone(p):{...config(s),...p};validate(n);
  HapaEditorial.checkpoint(s,'Tunnel Worlds recipe');s.reliquary.journey=n;HapaEditorial.saveActive(s);return structuredClone(n);
 }
 const active=s=>config(s).mode!=='standard'&&!s._stageInspect&&!s._elementInspect&&!s._geometryProof;
 function distance(cache,s,t,kin){
  const c=config(s);if(s.reduced||s.reliquary?.animated===false)return 7.4;
  const k=kin||HapaArticulation.evaluate(cache,s,t),v=id=>Math.max(0,k.signals[id]?.phase||0);
  return 7.4+c.speed*(1.35*t+.60*v('bass')+.26*v('lead-vocals')+.20*v('guitar'));
 }
 // No random calls or frame accumulation. The anchor recurs between contrasting families.
 function schedule(c,t){
  const dur=36-16*c.variety,n=Math.floor(t/dur),phase=t/dur-n;
  const offset=((c.seed^109)>>>0)%5,alts=[1,2,3,4,5],v=alts.slice(offset).concat(alts.slice(0,offset)),order=[0,v[0],0,v[1],v[2],0,v[3],v[4]];
  let a=c.family==='auto'?order[n%order.length]:families.findIndex(f=>f.id===c.family);
  let b=c.family==='auto'?order[(n+1)%order.length]:a;
  const u=c.family==='auto'?S((phase-.80)/.20):0,weights=Array(6).fill(0);weights[a]+=1-u;weights[b]+=u;
  return {weights,a,b,blend:u,chapter:n+1,chapterSeconds:dur,nextTime:(n+1)*dur};
 }
 function evaluate(cache,s,t){
  if(!Number.isFinite(t)||t<0||t>cache.score.duration+.001)throw Error('Journey time outside the song');
  const c=config(s),moving=!s.reduced&&s.reliquary?.animated!==false,clock=moving?t:0,k=HapaArticulation.evaluate(cache,s,clock);
  const q=schedule(c,clock),z=distance(cache,s,clock,k);
  const period=52,first=Math.min(24,cache.score.duration*.25),ix=Math.max(0,Math.round((clock-first)/period)),at=first+ix*period;
  const encounterTime=Math.min(cache.score.duration-.5,at),encounterZ=distance(cache,s,encounterTime);
  const avatar=c.mode==='avatar'&&s.reliquary?.tunnelFigures!==false;
  const traveler=avatar&&c.avatarStyle==='traveler';
  const near=avatar&&!traveler?Math.exp(-Math.pow((z-encounterZ)/15,2)):0;
  const weight=q.weights.slice();
  if(near>.001&&c.family==='auto'){for(let i=0;i<6;i++)weight[i]*=1-near*.78;weight[5]+=near*.78;}
  const blendProp=key=>families[0][key].map((_,j)=>families.reduce((v,f,i)=>v+f[key][j]*weight[i],0));
  const shape=blendProp('shape'),hot=blendProp('hot'),cold=blendProp('cold');
  const spacing=families.reduce((v,f,i)=>v+f.period*weight[i],0);
  const drift=moving?c.drift:0,eye=[Math.sin(clock*.11)*drift*.29-near*.32,Math.sin(clock*.073)*drift*.18,z];
  const forward=HapaMath.norm([Math.sin(clock*.061)*drift*.035+Math.sin(s.yaw||0)*.22,(s.pitch||0)*.20,1]);
  let subject=null;
  if(avatar){
   if(traveler){const dz=s.aspect==='9:16'?12.5:10.5;subject={style:'traveler',time:clock,position:[.38*Math.sin(clock*.095),-.05,z+dz],scale:.64,yaw:Math.PI+.09*Math.sin(clock*.15),distance:dz};}
   else if(encounterZ-z>-4&&encounterZ-z<72){subject={style:'apparition',time:encounterTime,position:[2.35,-.15,encounterZ],scale:.62,yaw:Math.PI-.18,distance:encounterZ-z};}
  }
  const principal=weight.indexOf(Math.max(...weight)),family=families[principal];
  return {schema:'hapa.journey.frame/1',mode:c.mode,time:t,clock,moving,z,eye,forward,weights:weight,shape,hot,cold,spacing,
   chapter:q.chapter,blend:q.blend,family:family.id,name:family.name,nextTime:q.nextTime,subject,
   pocket:avatar&&!traveler?[encounterZ,17,.56,1]:[0,1,0,0],intensity:c.intensity,
   config:c,coverage:1,policy:'continuous authored corridor; integrated authorized-stem phase; no scenic stops; Standard itinerary unmodified'};
 }
 return{defaults,config,validate,patch,active,distance,schedule,evaluate,families};
})();

HapaCore.modules.push({id:'world.tunnel-worlds',version:'0.9.19',kind:'world',description:'Opt-in continuous fractal-derived view; six authored families and native Reliquary mesh encounters; no alternate transport'});
