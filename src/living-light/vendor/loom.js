
/* Golden Loom 0.8.4: a source-time surface instrument, NOT an ISF-source port.
 * Does not own a clock, depth field, camera, topology or audio player.
 */
'use strict';
window.HapaLoom=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 const modes=[{id:'original',name:'Original · 0.8.2 surface'},
  {id:'filigree',name:'Living Filigree · connected light'},
  {id:'interference',name:'Silk Interference · flowing light'},
  {id:'contours',name:'Spectral Contours · crisp bands'}];
 const defaults=()=>({schema:'hapa.loom/0.8.4',mode:'filigree',amount:.88,clarity:.80,pulses:.96,current:.92,contrast:.60,ribbons:true});
 function validate(c){if(!c||c.schema!=='hapa.loom/0.8.4'||!modes.some(m=>m.id===c.mode)||typeof c.ribbons!=='boolean')throw Error('Invalid Golden Loom configuration');
  for(const k of ['amount','clarity','pulses','current','contrast'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Loom '+k+' must be a finite 0–1 value');
  for(const k of Object.keys(c))if(!(k in defaults()))throw Error('Unknown Loom setting: '+k);return true;}
 function configure(state,patch){const c={...(state.reliquary.loom||defaults()),...patch};validate(c);HapaEditorial.checkpoint(state,'Golden Loom surface');state.reliquary.loom=c;HapaEditorial.saveActive(state);return structuredClone(c);}
 function evaluate(cache,state,t,provided={}){
  const c=state.reliquary?.loom||defaults(),f=provided.frame||HapaCore.evaluate(cache,state,t),s=f.articulation.signals;
  const shot=state.cut?HapaEditorial.frame(state,state._cueTime??t).shot:null;
  const protectedLook=!!(shot?.locks?.look||shot?.locks?.shot),kind=provided.cam?.kind??HapaCore.worlds.find(w=>w.id===state.world)?.kind;
  const analytic=!!state._tunnel&&(HapaOctave.styles.includes(state._bridge?.style)||HapaRealms.styles.includes(state._bridge?.style)||HapaWater.styles.includes(state._bridge?.style)||HapaFire.styles.includes(state._bridge?.style)||HapaWind.styles.includes(state._bridge?.style)||HapaElectricity.styles.includes(state._bridge?.style));
  const active=kind===0&&!analytic&&c.mode!=='original'&&c.amount>0&&!protectedLook;
  const quiet=!!state.reduced||state.reliquary?.animated===false;
  const voice=s['lead-vocals'],g=s.guitar,k=s.keyboard,b=s.bass,d=s.drums,sky=s.synth,strings=s.strings;
  const v=clamp(voice.sustain),lace=clamp(g.sustain*.72+k.sustain*.52),mass=clamp(b.mass),air=clamp(sky.color*.65+strings.color*.45);
  // Saved current amount scales integrated phases, never elapsed time * instantaneous energy.
  const speed=.72+c.current*1.76,phases=quiet?[0,0,0,0]:[
   (g.phase*.88+k.phase*.76+voice.phase*.24)*speed,
   (b.phase*.64+sky.phase*.36+strings.phase*.28)*speed,
   (voice.phase*.46+g.phase*.18)*speed,
   (sky.phase*.28+strings.phase*.30)*speed];
  const pulses=new Float32Array(18),events=[];for(let i=0;i<6;i++)pulses[i*3]=-10000;
  const src=cache.score.stems.find(x=>x.id==='drums'),br=state._tunnel?state._bridge:null;
  if(active&&!quiet&&cache.fixture==='song'&&src?.availability==='present'&&state.stems.drums?.visual!==false){
   const a=src.events||[];let lo=0,hi=a.length;while(lo<hi){const mid=(lo+hi)>>1;if(a[mid].time<=t)lo=mid+1;else hi=mid;}
   for(let j=lo-1;j>=0&&events.length<6;j--){const ev=a[j],age=t-ev.time;if(age>6.5)break;if(age<0||(br&&ev.time<br.start))continue;
    const entry=br?.entry??.27,origin=br?-.35+br.length*HapaCurrents.progress(cache,state,br,ev.time):-7+cache.phase(ev.time);
    const z=origin+3.2+age*8.5,strength=clamp(ev.strength)*Math.exp(-age*.48),width=.70+mass*.65;
    const index=events.length;events.push({time:ev.time,age,origin,z,strength,width});pulses.set([z,strength,width],index*3);
   }
  }
  const motion=f.director?.values?.motion??.4,range=state.reliquary?.breadthAmount??0,groove=clamp(v*.34+lace*.26+mass*.24+air*.16);
  const u={uLoomOn:active?1:0,uLoomMode:Math.max(0,modes.findIndex(m=>m.id===c.mode)-1),uLoomMix:active?c.amount:0,
   uLoomClarity:c.clarity,uLoomPulses:active&&!quiet?c.pulses:0,uLoomContrast:c.contrast,uLoomRibbons:active&&c.ribbons?1:0,
   uLoomPhase:phases,uLoomVoice:v,uLoomLace:lace,uLoomBass:mass,uLoomAir:air,
   uLoomRange:quiet?1:1+.82*range*(f.articulation.breadthPeak||0)+.46*groove+.18*motion+.12*c.current,uLoomEvents:pulses};
  return{config:structuredClone(c),active,reason:protectedLook?'protected look':analytic?'alternative tunnel':kind!==0?'other world':c.mode==='original'?'original surface':quiet?'quiet/static current':'performing',
   time:t,phase:phases,voice:v,lace,bass:mass,air,pulseCount:events.length,events,uniforms:u,
   sources:['lead-vocals','guitar','keyboard','bass','drums','synth','strings'].map(id=>({id,availability:s[id].availability,enabled:s[id].enabled,sourceAssetId:s[id].sourceAssetId})),
   interpretation:'Authored color/light response; no words, beat labels or light-transport simulation'};
 }
 return{modes,defaults,validate,configure,evaluate};
})();

