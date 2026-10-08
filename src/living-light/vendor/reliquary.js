
/* Reliquary Conductor 0.8. Pure, song-time animation; no audio/player/GPU ownership.
 * Packet labels identify roles. Cached measurements are NOT phonemes or emotions.
 * The same role mapping serves every song, with missing/silent inputs kept distinct.
 */
'use strict';
window.HapaReliquary=(()=>{
 const C=HapaCore,D=HapaDirector,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);},clone=x=>structuredClone(x);
 const roles=[
  {id:'voice',label:'Stellar voice',sources:['lead-vocals'],feature:'energy',target:'Vocal attack, mask opening and sustained corona',window:.16},
  {id:'answer',label:'Answering crown',sources:['backing-vocals'],feature:'energy',target:'Counter-turning crown and answering arc',window:.42},
  {id:'breath',label:'Cloth breath',sources:['bass'],feature:'energy',target:'Grounded drape lift and long, damped release',window:.65},
  {id:'lace',label:'Filigree current',sources:['guitar','keyboard'],feature:'energy',target:'Plucked gold recoil and sustained travelling bends',window:.30},
  {id:'strikes',label:'Resonant steps',sources:['drums'],feature:'onset',target:'Elastic frame recoil and localized floor rings',window:.07},
  {id:'nebula',label:'Inner sky',sources:['synth','strings'],feature:'energy',target:'Slow cloud drift and color migration',window:.80},
  {id:'jewels',label:'Jeweled accents',sources:['percussion','brass','woodwinds'],feature:'onset',target:'Fast localized jewel glints and elastic accents',window:.09},
  {id:'air',label:'Suspended light',sources:['other'],feature:'energy',target:'Sparse chamber motes',window:.70}
 ];
 const defaults=()=>({journey:HapaJourney.defaults(),stages:HapaStages.defaults(),elemental:HapaElements.defaults(),dance:HapaGeometryDance.defaults(),lumen:HapaLumen.defaults(),electricity:HapaElectricity.defaults(),dynamics:HapaDynamics.defaults(),wind:HapaWind.defaults(),fire:HapaFire.defaults(),water:HapaWater.defaults(),schema:'hapa.reliquary/0.9.4r1',animated:true,framing:'score',focus:'directed',defocus:.24,micro:true,embroidery:true,corona:true,jewels:true,crown:true,roomMedia:true,articulation:true,shapeAmount:.92,rebound:.8,flowAmount:.85,paletteMotion:true,colorAmount:.58,orbitInstrument:true,orbitWidth:.72,regional:true,clothAmount:.82,dyeAmount:.66,ribbons:true,tunnelFigures:true,breadthAmount:1,cameraSurge:.85,regionGains:HapaOctave.defaultGains(),roles:Object.fromEntries(roles.map(r=>[r.id,true])),loom:HapaLoom.defaults(),realms:HapaRealms.defaults(),currents:HapaCurrents.defaults()});
 function validateConfig(c){
  if(!c||c.schema!=='hapa.reliquary/0.9.4r1')throw Error('Unsupported Reliquary settings');
  for(const k of ['animated','micro','embroidery','corona','jewels','crown','roomMedia','articulation','paletteMotion','orbitInstrument','regional','ribbons','tunnelFigures'])if(typeof c[k]!=='boolean')throw Error('Invalid Reliquary toggle: '+k);
  if(!['score','portrait','close','chamber'].includes(c.framing)||!['directed','core','trim','deep'].includes(c.focus))throw Error('Invalid Reliquary camera/focus');
  if(!Number.isFinite(c.defocus)||c.defocus<0||c.defocus>1)throw Error('Defocus must be within 0–1');
  for(const k of ['shapeAmount','rebound','flowAmount','colorAmount','orbitWidth','clothAmount','dyeAmount','breadthAmount','cameraSurge'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Invalid articulation amount: '+k);
  if(!c.roles||Object.keys(c.roles).length!==roles.length||roles.some(r=>typeof c.roles[r.id]!=='boolean'))throw Error('Invalid role switches');
  if(c.journey!==undefined)HapaJourney.validate(c.journey);if(c.stages!==undefined)HapaStages.validate(c.stages);if(c.elemental!==undefined)HapaElements.validate(c.elemental);if(c.dance!==undefined)HapaGeometryDance.validate(c.dance);HapaLumen.validate(c.lumen);HapaElectricity.validate(c.electricity);HapaDynamics.validate(c.dynamics);HapaOctave.validateGains(c.regionGains);HapaWater.validate(c.water);HapaFire.validate(c.fire);HapaWind.validate(c.wind);HapaLoom.validate(c.loom);HapaRealms.validate(c.realms);HapaCurrents.validate(c.currents);
  for(const k of Object.keys(c))if(!(k in defaults()))throw Error('Unknown Reliquary property: '+k);
  return true;
 }
 function validate(s){validateConfig(s.reliquary);for(const t of s.cut?.takes||[])validateConfig(t.reliquary);return true;}
 function smoothFeature(cache,state,id,feature,t,window){
  const at=cache.get(id,feature,t),enabled=state.stems[id]?.visual!==false;
  // Finite causal sampling: seekable, stateless smoothing over the cached analysis.
  let value=0,weight=0;
  if(enabled&&['present','synthetic'].includes(at.availability))for(let i=0;i<9;i++){const w=9-i;value+=(cache.get(id,feature,Math.max(0,t-window*i/8)).value||0)*w;weight+=w;}
  return {id,availability:at.availability,raw:at.value,enabled,filtered:weight?clamp(value/weight):0,sourceAssetId:at.sourceAssetId};
 }
 function evaluate(cache,state,t,frame){
  if(!Number.isFinite(t)||t<0||t>cache.score.duration)throw Error('Reliquary time outside the current song');
  const cfg=state.reliquary||defaults(),director=frame?.director||D.evaluate(cache.score,cache,state,t),macro=director.values,trace={},levels={};
  for(const r of roles){const inputs=r.sources.map(id=>smoothFeature(cache,state,id,r.feature,t,r.window));const max=Math.max(0,...inputs.map(x=>x.filtered)),enabled=cfg.animated&&cfg.roles[r.id];levels[r.id]=enabled?max:0;
   trace[r.id]={label:r.label,target:r.target,feature:r.feature,windowSeconds:r.window,inputs,enabled,final:levels[r.id]};}
  const mov=state.reduced?0:macro.motion, v=levels;
  const kin=HapaArticulation.evaluate(cache,state,t),zero=Object.fromEntries(HapaArticulation.fields.map(k=>[k,0]));
  const signal=(id,role)=>cfg.animated&&cfg.roles[role]?kin.signals[id]:zero;
  const voice=signal('lead-vocals','voice'),back=signal('backing-vocals','answer'),bass=signal('bass','breath'),drum=signal('drums','strikes'),guitar=signal('guitar','lace'),keys=signal('keyboard','lace'),synth=signal('synth','nebula'),strings=signal('strings','nebula'),perc=signal('percussion','jewels'),brass=signal('brass','jewels'),winds=signal('woodwinds','jewels');
  const dynamics=cfg.animated&&cfg.articulation&&!state.reduced;
  const pluck=Math.max(Math.abs(guitar.strike),Math.abs(keys.strike));
  const peakDrive=clamp(Math.max(
   voice.attack*.88+voice.sustain*.42,
   Math.abs(drum.strike)*.95+drum.low*.12,
   bass.mass*.86+bass.low*.12,
   back.sustain*.72+back.attack*.18,
   pluck*.68,
   (synth.sustain*.34+strings.sustain*.28),
   mov*.58
  ),0,1.2);
  const phr=frame?.currents||HapaCurrents.evaluate(cache,state,t,{kin});const oldPeak=smooth(.18,.96,peakDrive);const breadthPeak=phr.on?oldPeak+(phr.selected-oldPeak)*phr.contrast:oldPeak, breadthBoost=cfg.breadthAmount*breadthPeak;
  const movementScale=1+4*breadthBoost; // at full peaks, up to ~5x the current floor.
  const cameraScale=1+3.4*cfg.cameraSurge*breadthPeak;
  const strength=dynamics?cfg.shapeAmount*(.35+.65*mov)*movementScale:0,punch=dynamics?cfg.rebound*(.25+.75*mov)*(1+2.6*breadthBoost):0;
  const slowV=cfg.animated&&cfg.roles.voice?smoothFeature(cache,state,'lead-vocals','energy',t,1.25).filtered:.35;
  const focusMix=cfg.focus==='trim'?1:cfg.focus==='core'||cfg.focus==='deep'?0:clamp(.58*(1-slowV*1.7),.06,.58);
  const pulses=[];
  if(cfg.animated&&cfg.roles.strikes&&state.stems.drums?.visual!==false){
   const stem=cache.score.stems.find(s=>s.id==='drums');
   if(stem?.availability==='present'&&(!cache.fixture||cache.fixture==='song')){
    const ev=stem.events;let lo=0,hi=ev.length;while(lo<hi){const m=(lo+hi)>>1;if(ev[m].time<=t)lo=m+1;else hi=m;}
    for(let i=lo-1;i>=0&&pulses.length<4;i--){const age=t-ev[i].time;if(age>3.0)break;if(age>=0)pulses.push({age,strength:ev[i].strength*(state.reduced?.15:1),source:'drums',basis:'measured onset'});}
   }
  }
  const gest=window.HapaHorizons?HapaHorizons.evaluate(state,t):{open:0,spotlight:0,charge:0,waves:[]};
  const art={
   core:clamp(.36+macro.radiance*.66+v.voice*.83+v.answer*.17+gest.spotlight*.20,.25,1.75),
   corePulse:1+v.voice*.13+(dynamics?voice.attack*.08*(1+.6*breadthBoost):0),clothAmplitude:cfg.animated?(.002+.023*v.breath)*(.22+mov)*movementScale*(!state.reduced?1:.15):0,
   latticeAngle:cfg.animated?.018*Math.sin(t*.31)*mov*(.15+v.voice)*(1+.45*breadthBoost):0,
   headYaw:cfg.animated?Math.sin(t*.095)*.008*mov+strength*(voice.pan*.03+back.mass*.026*Math.sin(back.phase*.55)):0,headPitch:cfg.animated?.012*Math.sin(t*.073)*mov*(1+.35*breadthBoost)-strength*bass.mass*.025+punch*drum.strike*.018:0,
   corona:cfg.corona?(.62+v.voice*.46+v.answer*.10+(dynamics?voice.high*.20:0)*(1+.7*breadthBoost)):0,
   haloOpen:clamp(.18+macro.reveal*.32+v.answer*.40+gest.open*.17+.06*breadthBoost),
   goldFlow:v.lace*(.18+macro.radiance*.42)*(1+.8*breadthBoost),nebula:.24+v.nebula*.74*(1+.5*breadthBoost),
   jewelAccent:v.jewels*.50+v.strikes*.19*(1+.7*breadthBoost),air:v.air*(.3+macro.density*.65),
   focusMix:cfg.focus==='directed'?focusMix*(1-gest.spotlight):focusMix,defocus:cfg.focus==='deep'||state.reduced?0:cfg.defocus,
   motion:mov,time:cfg.animated?t:0,density:macro.density,spotlight:gest.spotlight,
   peakDrive,breadthPeak,breadthBoost,movementScale,cameraScale,
   maskOpen:strength*clamp(voice.sustain*.70+voice.attack*.24+back.mass*.12),
   bodyLift:strength*(bass.mass*.17+bass.low*.045),
   bodyRecoil:punch*drum.strike*(.09+.10*drum.low),
   trimBend:strength*clamp(guitar.mass*.50+keys.mass*.26+guitar.mid*.15),
   trimPluck:punch*(guitar.strike*.055+keys.strike*.035),
   bodyPhase:bass.phase*.95,lacePhase:guitar.phase*2.6+keys.phase*1.5,
   voicePhase:voice.phase*1.55,cloudPhase:synth.phase*.28+strings.phase*.22,
   crownPhase:dynamics?(back.phase*.75+brass.phase*.14):0,
   crownTilt:strength*back.mass*(.20+.10*back.width),
   jewelKick:punch*(perc.strike+brass.strike*.5+winds.strike*.5)*.025,
   currentGain:cfg.articulation?cfg.flowAmount*(1+.9*breadthBoost):0,
   cameraSpeed:kin.phaseRate,orbitPhase:kin.phase,
   kinetics:{voice,back,bass,drum,guitar,keys,synth,strings,pluck},
   pulses,gestureWaves:gest.waves||[],trace
  };
  art.regions=HapaOctave.evaluate(cache,state,t,{kin,macro});art.currents=phr;
  if(phr.on){if(cfg.focus==='directed'&&HapaCurrents.config(state).lens)art.focusMix=clamp(art.focusMix+phr.focus*.8-phr.opening*phr.contrast*.12);if(!phr.lookProtected){art.core*=1+.10*phr.opening*phr.contrast;art.spotlight=clamp(art.spotlight+phr.opening*phr.contrast*.24);}}
  // The optical actor does not read or change clock, route length, or arrival.
  return art;
 }
 function patch(state,p){const next=clone(state.reliquary||defaults());for(const [k,v]of Object.entries(p)){if(k==='roles')next.roles={...next.roles,...v};else if(k==='regionGains')next.regionGains={...next.regionGains,...v};else if(k==='electricity')next.electricity={...next.electricity,...v};else if(k==='wind')next.wind={...next.wind,...v};else if(k==='fire')next.fire={...next.fire,...v};else if(k==='water')next.water={...next.water,...v};else if(k==='loom')next.loom={...next.loom,...v};else if(k==='currents')next.currents={...next.currents,...v};else if(k==='realms')next.realms={...next.realms,...v};else next[k]=v;}validateConfig(next);HapaEditorial.checkpoint(state,'Reliquary articulation');state.reliquary=next;HapaEditorial.saveActive(state);return clone(next);}
 function migration(raw,score){
  if(['hapa.director.session/0.9.1','hapa.director.session/0.9.2','hapa.director.session/0.9.3'].includes(raw?.schema)){
   const out=clone(raw);out.schema='hapa.director.session/0.9.4r1';
   const convert=c=>({...clone(c),schema:'hapa.reliquary/0.9.4r1',lumen:{...HapaLumen.defaults(),air:0,detail:0},electricity:HapaElectricity.upgrade(c.electricity)});
   out.reliquary=convert(out.reliquary);for(const take of out.cut?.takes||[])take.reliquary=convert(take.reliquary);
   if(out.cut){out.cut.undo=[];out.cut.redo=[];out.cut.punch=null;}
   out.director.touches={};out.director.releases={};D.validateSession(out,score);
   return{session:out,requiresConfirmation:true,changes:['Preserve all ten song identities, registered routes, timing, media cues, locks and previous Paint recipes.','Add Base motion and Audio amplification. Electricity will move continuously during quiet playing time; pause and Reduced motion freeze it.','New illuminated-air and detail amounts begin at zero in this reviewed copy. Legacy neon CSS is removed.','No itinerary is replaced, no imported URL is fetched, and the source file remains unchanged.']};
  }

  if(raw?.schema==='hapa.director.session/0.9.0'){const out=clone(raw);out.schema='hapa.director.session/0.9.4r1';const convert=c=>({...clone(c),schema:'hapa.reliquary/0.9.4r1',lumen:HapaLumen.defaults(),electricity:{...HapaElectricity.defaults(),enabled:false,streamers:false}});out.reliquary=convert(out.reliquary);for(const take of out.cut?.takes||[])take.reliquary=convert(take.reliquary);out.cut.undo=[];out.cut.redo=[];out.cut.punch=null;D.validateSession(out,score);return{session:out,requiresConfirmation:true,changes:['Preserve all original Paint recipes, simulation events, source hashes, routes and locks.','Add Electricity disabled, without changing old routes. Enable it and add excursions explicitly.','The original file is untouched. No URI is fetched.']};}

  if(raw?.schema==='hapa.director.session/0.8.9'){const out=clone(raw);out.schema='hapa.director.session/0.9.4r1';out.reliquary.schema='hapa.reliquary/0.9.4r1';out.reliquary.electricity={...HapaElectricity.defaults(),enabled:false};for(const t of out.cut?.takes||[]){t.reliquary.schema='hapa.reliquary/0.9.4r1';t.reliquary.electricity={...HapaElectricity.defaults(),enabled:false};}out.reliquary.lumen=HapaLumen.defaults();for(const take of out.cut?.takes||[])take.reliquary.lumen=HapaLumen.defaults();out.reliquary.dynamics=HapaDynamics.defaults();for(const take of out.cut?.takes||[])take.reliquary.dynamics=HapaDynamics.defaults();out.cut.undo=[];out.cut.redo=[];out.cut.punch=null;D.validateSession(out,score);return{session:out,requiresConfirmation:true,changes:['Preserve all existing Paints, source identities, routes, locks and gestures.','Add a separate numerical laboratory without binding it to old scenes.','GPU recovery is active application-wide. No URI is fetched on import.']};}

  if(raw?.schema==='hapa.director.session/0.7')return HapaHorizons.migration(raw,score);
  if(!['hapa.director.session/0.8.8','hapa.director.session/0.8.7','hapa.director.session/0.8.6','hapa.director.session/0.8.5','hapa.director.session/0.8','hapa.director.session/0.8.1','hapa.director.session/0.8.2','hapa.director.session/0.8.3','hapa.director.session/0.8.4','hapa.director.session/0.7.1','hapa.director.session/0.7.6','hapa.director.session/0.7.7','hapa.director.session/0.7.8','hapa.director.session/0.7.9'].includes(raw?.schema))throw Error('Unsupported source session for reviewed conversion');
  const modern=['hapa.director.session/0.8.8','hapa.director.session/0.8.7','hapa.director.session/0.8.6','hapa.director.session/0.8.5','hapa.director.session/0.8.4','hapa.director.session/0.8','hapa.director.session/0.8.1','hapa.director.session/0.8.2','hapa.director.session/0.8.3'].includes(raw.schema);
  const convert=c=>{const n=defaults();delete n.stages;if(!modern){n.regional=false;n.ribbons=false;n.dyeAmount=0;}
   // Only the old 0.8.1 sessions actually contained a breadth setting.
   n.breadthAmount=0;n.cameraSurge=0;
   for(const k of Object.keys(n))if(k!=='schema'&&c?.[k]!==undefined)n[k]=clone(c[k]);
   n.loom=c?.loom?clone(c.loom):{...HapaLoom.defaults(),mode:'original'};n.realms=c?.realms?clone(c.realms):HapaRealms.defaults();n.currents=c?.currents?clone(c.currents):{...HapaCurrents.defaults(),enabled:false};n.water=c?.water?clone(c.water):{...HapaWater.defaults(),upgradeTidal:false,streamers:false};n.fire=c?.fire?clone(c.fire):HapaFire.defaults();n.wind={...HapaWind.defaults(),enabled:false};n.electricity={...HapaElectricity.defaults(),enabled:false};return n;};
  const out=clone(raw);out.schema='hapa.director.session/0.9.4r1';out.passages.schema='hapa.passages/0.8.9';out.reliquary=convert(raw.reliquary);out.director.touches={};out.director.releases={};
  for(const take of out.cut?.takes||[]){take.reliquary=convert(take.reliquary);if(take.passages)take.passages.schema='hapa.passages/0.8.9';}
  if(out.cut){out.cut.undo=[];out.cut.redo=[];out.cut.punch=null;}delete out.atelier;
  D.validateSession(out,score);
  return{session:out,requiresConfirmation:true,changes:['Preserve source identities, cues, locks, routes and recorded human releases.','Preserve existing regional motion, breadth, camera choices, routes and timing. Older sessions receive reviewed defaults; no automatic itinerary changes.','Preserve recognized actor choices; remove 0.7.7 mnemonic labels, which were not lyric analysis.','Preserve 0.8.4 Golden Loom choices. Add realm settings only; approved routes are not replanned. Remove unverified 0.8.3 atelier labels.','Preserve existing phrase choreography. New Water Paint starts unbound to old Tidal/streamer surfaces; add water excursions explicitly. All original timings remain.','Fire begins unbound to existing surfaces. Water settings and all existing itinerary times are preserved. Add Fire excursions explicitly.','Preserve Fire and Water recipes. Wind starts disabled in reviewed older takes; enable explicitly. No route timing changes.','Apply to a copy only. No media downloads. Pixel identity across builds is not promised.']};
 }
 // Shared CPU anchor for optics; matches the position deformation in the mesh shader.
 function point(p,kind,reg,a,shift=[0,0]){
  const rest=[...p];p=[...p];const cx=.07;
  if(reg<3.5){
   if(reg>.5&&reg<1.5){
    const x=p[0],y=p[1]-cx,r=Math.min(1.6,Math.hypot(x/.90,y/1.28)),ang=Math.atan2(y,x);
    const edge=1-Math.min(1,Math.max(0,(r-.06)/1.1));
    const expand=1+a.maskOpen*.085*(.35+.65*edge)+a.trimBend*.018*Math.sin(a.lacePhase-r*5+ang*2)*edge;
    p[0]=x*expand;p[1]=cx+y*expand;p[2]+=a.maskOpen*.065*edge+a.trimPluck*.6*edge*Math.sin(r*8+ang*4)+a.bodyRecoil;
    const turn=a.latticeAngle*(1-Math.min(1,r))+a.trimBend*.020*Math.sin(a.lacePhase*.7)*edge;
    const c=Math.cos(turn),s=Math.sin(turn),xx=p[0];p[0]=c*xx-s*(p[1]-cx);p[1]=cx+s*xx+c*(p[1]-cx);
   }else{
    const hem=Math.min(1,Math.max(0,(-p[1]+.25)/2.4));
    p[2]+=a.clothAmplitude*Math.sin(a.time*.70+p[1]*.70+p[0]*1.2)+a.bodyLift*(.4+.6*hem)*Math.sin(a.bodyPhase-p[1]*1.5)+a.bodyRecoil*(.3+.7*hem);
    p[1]+=a.bodyLift*.30*(1-hem);p[0]+=a.bodyLift*.16*Math.sin(a.bodyPhase*.6+p[1])*(.25+.75*hem);
   }
  }
  const delta=HapaOctave.offset(rest,reg,a.regions);p=p.map((v,i)=>v+delta[i]);
  const yaw=reg>3.5?0:a.headYaw,pit=reg>3.5?0:a.headPitch;
  let y=Math.cos(pit)*p[1]-Math.sin(pit)*p[2],z=Math.sin(pit)*p[1]+Math.cos(pit)*p[2];
  p=[Math.cos(yaw)*p[0]+Math.sin(yaw)*z,y,-Math.sin(yaw)*p[0]+Math.cos(yaw)*z];
  if(reg<3.5){p[0]+=shift[0];p[1]+=shift[1];}return p;
 }

 return{point,roles,defaults,validateConfig,validate,evaluate,patch,migration,smoothFeature};
})();
HapaCore.worlds.push({id:'celestial-reliquary',name:'Celestial Reliquary',subtitle:'A living oracle / jeweled cloth / stellar filigree',kind:6,modules:['mesh.celestial-reliquary','conductor.reliquary','optics.reliquary-focus','media.surface'],camera:'score-time portrait / chamber / upright arrival'});
HapaCore.palettes.push({id:'astral-brocade',name:'Astral brocade',description:'Indigo velvet, blue corona and warm gold filigree',roles:{background:'#080b16',shadow:'#191232',body:'#3b245f',accent:'#418dc7',highlight:'#f9d18a',emission:'#7fcfff',fog:'#111423'}});
HapaCore.modules.push({id:'mesh.celestial-reliquary',version:'0.8',kind:'geometry',outputs:['linearColor','linearEmission','projectedDepth'],description:'Atelier-authored cloth, gold tubes and gems in the existing GL context'},{id:'conductor.reliquary',version:'0.8',kind:'control',description:'Eight bounded roles; source-time measured features and explicit silence'},{id:'optics.reliquary-focus',version:'0.8',kind:'screen-effect',description:'Depth-aware linear-light focus within each Reliquary view, before the shared output transform'});

