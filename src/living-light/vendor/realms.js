
/* Shader Realms 0.9.6: host-side placement/control adapter.
 * Shader-derived modules are CC BY-NC-SA 3.0: see SHADER_CREDITS.md.
 * Requested ISF editor IDs are treated as aesthetic targets, not verbatim source ports.
 */
'use strict';
window.HapaRealms=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),copy=x=>structuredClone(x);
 const worlds=[
  {id:'circuit-basilica',name:'Circuit Basilica',kind:7,subtitle:'Kali orbit traps / inscribed stone / suspended engine',source:'UltimateKaliCircuits'},
  {id:'astral-anchorage',name:'Astral Anchorage',kind:8,subtitle:'Fractal starlight / orbital instruments / open sky',source:'SpaceIsThePlace'},
  {id:'cloud-choir',name:'Cloud Choir',kind:9,subtitle:'Protean clouds / floating ribs / illuminated mist',source:'CloudVortex'},
  {id:'prism-sanctum',name:'Prism Sanctum',kind:12,subtitle:'Spectral spokes / petaled rings / opaline aperture',source:'ISF study 5e7a804a7c113618206deea1'},
  {id:'echo-lattice',name:'Echo Lattice',kind:13,subtitle:'Angular mesh / crosshatch vault / audio-reactive weave',source:'ISF study 5e7a7f7b7c113618206dde5f'},
  {id:'contour-gallery',name:'Contour Gallery',kind:14,subtitle:'Dominant ember arcs / blue void cells / opaline contour glow',source:'ISF study 5e7a7fcb7c113618206de47c'}
 ];
 const styles=['circuit-transit','cloud-slipstream','prism-spindle','echo-drift','contour-fold'];
 const defaults=()=>({detail:.88,atmosphere:.64,expression:.92,studyBlend:1.0,studyAuto:true,animate:true,media:false,contour:HapaContour.defaults()});
 function validate(c){if(!c||typeof c!=='object'||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown realm settings');for(const k of ['detail','atmosphere','expression','studyBlend'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Realm '+k+' must be finite 0–1');for(const k of ['animate','media','studyAuto'])if(typeof c[k]!=='boolean')throw Error('Realm '+k+' must be boolean');if(c.contour!==undefined)HapaContour.validate(c.contour);return true;}
 function evaluate(cache,state,t){
  const cfg={...defaults(),...(state.reliquary?.realms||{})},kin=HapaArticulation.evaluate(cache,state,t),s=kin.signals;
  const macro=HapaDirector.evaluate(cache.score,cache,state,t).values;
  const shot=state.cut?HapaEditorial.frame(state,state._cueTime??t).shot:null;
  const on=cfg.animate&&state.reliquary?.animated!==false&&!state.reduced;
  const voice=s['lead-vocals'],bass=s.bass,drum=s.drums,g=s.guitar,k=s.keyboard,b=s['backing-vocals'];
  const air=Math.max(s.synth.sustain,s.strings.sustain,s.other.sustain),strings=s.strings,other=s.other;
  const phase=on?[g.phase*.15+k.phase*.12+drum.phase*.024,
   s.synth.phase*.065+strings.phase*.048+bass.phase*.017+.025*t,
   s.synth.phase*.018+strings.phase*.025+b.phase*.012+.004*t,
   b.phase*.07+bass.phase*.025+.017*t]:[0,0,0,0];
  const depthPolicy=shot?.locks?.look||shot?.locks?.shot?'protected look':'authored palette';
  const choreo=HapaCurrents.evaluate(cache,state,t,{kin}),actions=choreo.on&&HapaCurrents.config(state).realmActions;
  const levels=[voice.sustain,bass.mass,on?drum.strike:0,air];
  const realmKey=state._tunnel?(state._bridge?.style||'cloud-slipstream'):(state.world||'circuit-basilica');
  const emphasis=realmKey==='prism-sanctum'||realmKey==='prism-spindle'||realmKey==='astral-anchorage'?[1.55,.34,.20]
   :realmKey==='echo-lattice'||realmKey==='echo-drift'||realmKey==='circuit-basilica'||realmKey==='circuit-transit'?[.22,1.62,.24]
   :realmKey==='contour-gallery'||realmKey==='contour-fold'||realmKey==='cloud-choir'||realmKey==='cloud-slipstream'?[.18,.26,1.58]
   :[.72,.72,.72];
  const kSus=k.sustain||0,gHit=g.strike||g.sustain||0,bSus=b.sustain||0;
  let triad=[
   .16+voice.sustain*.44+kSus*.30+s.synth.sustain*.28+choreo.opening*.16,
   .16+drum.strike*.40+gHit*.24+bass.mass*.28+choreo.contrast*.15,
   .16+air*.42+bSus*.25+strings.sustain*.24+choreo.focus*.14+other.sustain*.10
  ].map((v,i)=>v*emphasis[i]);
  const contourLift=(realmKey==='prism-sanctum'||realmKey==='prism-spindle'||realmKey==='echo-lattice'||realmKey==='echo-drift'||realmKey==='cloud-choir'||realmKey==='cloud-slipstream')?(.14+.16*choreo.selected+.08*air):0;
  triad[2]+=contourLift;
  const articulationPeak=Math.max(levels[0],levels[1],levels[2],levels[3]);
  const dominance=1.18+cfg.studyBlend*.52+macro.motion*.60+articulationPeak*.42;
  triad=triad.map(v=>Math.pow(Math.max(v,.0001),dominance));
  const sum=triad[0]+triad[1]+triad[2]||1;triad=triad.map(v=>v/sum);
  if(!cfg.studyAuto){
    const eSum=emphasis[0]+emphasis[1]+emphasis[2];
    triad=emphasis.map(v=>v/eSum);
  }
  const dominantIndex=triad[0]>=triad[1]&&triad[0]>=triad[2]?0:(triad[1]>=triad[2]?1:2);
  const dominant=['prism','echo','contour'][dominantIndex];
  const blend=state.reduced?0:clamp(cfg.studyBlend*(.90+.95*macro.motion+.30*articulationPeak),0,1.35);
  const atmosphereScale=realmKey==='prism-sanctum'||realmKey==='prism-spindle' ? .028
   :realmKey==='contour-gallery'||realmKey==='contour-fold' ? .12
   :realmKey==='echo-lattice'||realmKey==='echo-drift' ? .24
   :realmKey==='astral-anchorage' ? .80
   :realmKey==='cloud-choir'||realmKey==='cloud-slipstream' ? .84:1;
  return {choreo,actions,phase,levels,studyMix:triad,studyBlend:blend,dominantStudy:dominant,dominance,
   expression:state.reduced?0:cfg.expression*(.32+.68*macro.motion),detail:cfg.detail,atmosphere:cfg.atmosphere*atmosphereScale,
   radiance:clamp(.50+macro.radiance*.76+voice.sustain*.28,0,1.55),animated:on,depthPolicy,
   signals:{voice:voice.availability,bass:bass.availability,drums:drum.availability,guitar:g.availability,keyboard:k.availability,synth:s.synth.availability},
   basis:'existing 30 Hz features / 60 Hz response reconstruction; no lyric or emotion classification',realmKey};
 }
 function patch(state,p){const next={...(state.reliquary.realms||defaults()),...p};validate(next);HapaEditorial.checkpoint(state,'Shader realm settings');state.reliquary.realms=next;HapaEditorial.saveActive(state);return copy(next);}
 function paletteFor(world){return {'circuit-basilica':'circuit-nocturne','astral-anchorage':'astral-sapphire','cloud-choir':'cloud-amethyst','prism-sanctum':'prism-opaline','echo-lattice':'echo-ultraviolet','contour-gallery':'contour-cyan'}[world];}
 function decorate(bridges){
  const plan=[
   {to:'prism-sanctum',style:'prism-spindle',label:'Prism Overture',palette:'prism-opaline'},
   {to:'echo-lattice',style:'echo-drift',label:'Echo Transit',palette:'echo-ultraviolet'},
   {to:'contour-gallery',style:'contour-fold',label:'Contour Rise',palette:'contour-cyan'},
   {to:'astral-anchorage',style:'prism-spindle',label:'Astral Prism',palette:'astral-sapphire'},
   {to:'circuit-basilica',style:'echo-drift',label:'Circuit Echo',palette:'circuit-nocturne'},
   {to:'cloud-choir',style:'contour-fold',label:'Cloud Contour',palette:'cloud-amethyst'},
   {to:'prism-sanctum',style:'prism-spindle',label:'Prism Return',palette:'prism-opaline'},
   {to:'echo-lattice',style:'echo-drift',label:'Echo Return',palette:'echo-ultraviolet'},
   {to:'contour-gallery',style:'contour-fold',label:'Contour Homecoming',palette:'contour-cyan'},
   {to:'celestial-reliquary',style:'circuit-transit',label:'Circuit Homecoming',palette:'astral-brocade'}
  ];
  let from=bridges[0]?.from;
  for(let i=0;i<bridges.length;i++){
   const b=bridges[i],step=plan[Math.min(i,plan.length-1)];b.from=from;b.to=step.to;b.style=step.style;b.toPalette=step.palette;b.label=step.label;from=b.to;
  }
  return bridges;
 }
 function tour(state,score){
  if(state.passages.bridges.some(b=>b.locked)||state.director.shots.some(s=>s.locks?.shot||s.locks?.camera))throw Error('Protected route: unlock endpoints before adding excursions');
  const next=copy(state.passages);decorate(next.bridges);HapaPassages.validate({...state,passages:next},score);
  HapaEditorial.checkpoint(state,'Add shader realm excursions');state.passages=next;HapaEditorial.saveActive(state);return copy(next);
 }
 return{worlds,styles,defaults,validate,evaluate,patch,decorate,tour,paletteFor};
})();
for(const w of HapaRealms.worlds)HapaCore.worlds.push({...w,modules:['realm.source-adaptation','media.surface'],camera:'bounded musical orbit / mapped live portal'});
HapaCore.modules.push({id:'realm.source-adaptation',version:'0.9.11',kind:'world',description:'Attributed noncommercial shader-study worlds and passages; original geometry; depth-limited volume',license:'CC BY-NC-SA 3.0'});

HapaCore.palettes.push(
{id:'circuit-nocturne',name:'Circuit Nocturne',description:'Obsidian sapphire, cyan circuitry and brushed gold',roles:{background:'#030913',shadow:'#081725',body:'#214a66',accent:'#20c8d7',highlight:'#ffdaa0',emission:'#7bdcff',fog:'#0d1c36'}},
{id:'astral-sapphire',name:'Astral Sapphire',description:'Deep violet, stellar blues and pale orbital metal',roles:{background:'#020514',shadow:'#10112e',body:'#243960',accent:'#429cff',highlight:'#d6eeff',emission:'#8889fa',fog:'#161738'}},
{id:'cloud-amethyst',name:'Cloud Amethyst',description:'Lavender cloudbanks, pearlescent arches and midnight slate',roles:{background:'#080c1e',shadow:'#102333',body:'#264d63',accent:'#797bbd',highlight:'#dbe4e4',emission:'#88c3e5',fog:'#252c51'}},
{id:'prism-opaline',name:'Prism Opaline',description:'Near-black indigo, spectral cyan, magenta and opaline violet',roles:{background:'#01030a',shadow:'#091126',body:'#152447',accent:'#ff4fc9',highlight:'#dccbff',emission:'#54efff',fog:'#12163a'}},
{id:'echo-ultraviolet',name:'Echo Ultraviolet',description:'Black-violet ink, ultraviolet lattice and electric mint',roles:{background:'#01020a',shadow:'#09081c',body:'#141d39',accent:'#8854ff',highlight:'#b9ffe9',emission:'#31ffc7',fog:'#111633'}},
{id:'contour-cyan',name:'Contour Emberline',description:'Deep ultramarine void with hot ember contours and opaline pressure nodes',roles:{background:'#01021a',shadow:'#05072d',body:'#0d1760',accent:'#ff2c1c',highlight:'#ffd7cf',emission:'#ff8f6c',fog:'#0d1140'}}
);

