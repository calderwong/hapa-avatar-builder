// Hapa.ai / Calder Wong. Album-wide visual development over the owner's exact
// score. No song-specific timeline, image, lyric or saved direction is copied.
export const CAMPFIRE_CHOREOGRAPHY_REVISION = 'score-scenes-v1';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const v=clamp(x);return v*v*(3-2*v);};
const families=['fountain','ribbon','ring','spiral','helix','shell','snowflake','dandelion'];
const scoreFamilies=[...families,'sheet','sphere','gem','attractor','sunflower','mobius','jellyfish'];
const lerp=(a,b,u)=>a+(b-a)*u;
function lowerBound(values,t){let lo=0,hi=values.length;while(lo<hi){const mid=(lo+hi)>>1;if(values[mid]<t)lo=mid+1;else hi=mid;}return lo;}
export function createScoreChoreography(packet,base){
 if(!base?.at||!packet.score?.cues?.length)throw Error('Campfire needs a resolved direction and score cues.');
 const beats=(packet.timeline.beats||[]).filter(Number.isFinite).sort((a,b)=>a-b),scenes=[];
 const periodAt=t=>{const i=Math.min(Math.max(1,lowerBound(beats,t)),beats.length-1);return i>0?clamp(beats[i]-beats[i-1],.25,1.5):.6;};
 const beatAt=t=>{if(!beats.length)return t/.6;const i=Math.max(0,lowerBound(beats,t)-1);return i+(t-beats[i])/periodAt(t);};
 for(const [cueIndex,cue] of packet.score.cues.entries()){
  const motif=packet.score.motifs.find(m=>m.id===cue.motifId),protectedTarget=Boolean(motif?.imageRef)||['image','logo','model'].includes(motif?.family);
  const authored=base.at(cue.start+.001),hero=authored.motif==='open-ring'?'ring':scoreFamilies.includes(motif?.family)?motif.family:'fountain';
  let start=cue.start,part=0;
  while(start<cue.end){
   const period=periodAt(start),length=clamp(period*(cue.density>.6?8:10),3.2,6.5)*[1,.85,1.1][part%3];
   let end=Math.min(cue.end,start+length);
   if(end<cue.end){
    const bi=lowerBound(beats,end),choices=[beats[bi-1],beats[bi]].filter(t=>Number.isFinite(t)&&t>start+2.5&&t<cue.end-1.5);
    if(choices.length)end=choices.reduce((a,b)=>Math.abs(a-end)<Math.abs(b-end)?a:b);
    if(cue.end-end<1.5)end=cue.end;
   }
   // Return to the song's hero between answers. Explicit saved ring/construction
   // and image motifs keep their identity; their movement still develops.
   const keepHero=protectedTarget||authored.motif||authored.construction;
   const formation=keepHero||part%2===0?hero:families[(families.indexOf(hero)+part+cueIndex)%families.length];
   const index=scenes.length;
   scenes.push({key:`${cue.id}:campfire:${part}`,cueId:cue.id,start,end,formation,protectedTarget,
    copyKind:protectedTarget||part%3===0?0:1+(index%4),transitionKind:1+(index%12),
    scale:[1,.82,1.12,.94][index%4],period,morphSeconds:Math.min((end-start)*.22,period*.9,.8)});
   start=end;part++;
  }
 }
 const starts=scenes.map(s=>s.start);
 return {extension:base.extension,creativeRevision:CAMPFIRE_CHOREOGRAPHY_REVISION,scenes,at(time){
  const index=Math.max(0,lowerBound(starts,time+1e-7)-1),s=scenes[index],prior=scenes[Math.max(0,index-1)];
  const age=Math.max(0,time-s.start),mix=smooth(age/Math.max(.35,s.morphSeconds)),beat=beatAt(time),phase=beat*Math.PI*.25;
  const original=base.at(time),strength=clamp(original.participation??.8,.2,1),anticipation=index===scenes.length-1?0:smooth(1-(s.end-time)/Math.min(.7,(s.end-s.start)*.15));
  return {...original,sceneKey:s.key,sceneTitle:s.formation,formation:s.formation,
   // Scene transfers retain visible material through the boundary. A saved
   // ending/zero-participation direction still takes precedence via the base.
   composition:'integrated',catchOmega:8.6,subjectScale:1.12,subjectAnchor:1.85,readingAnchor:2.15,
   transitionKind:s.transitionKind,departureKind:1+(index+1)%7,morphSeconds:s.morphSeconds,staggerSeconds:s.period*.20,
   anticipation,sceneRelease:(index?lerp(.82,1,mix):1)*(1-.18*anticipation),sceneScale:lerp(prior.scale,s.scale,mix),
   copyMix:[1,2,3,4].map(k=>lerp(prior.copyKind===k?1:0,s.copyKind===k?1:0,mix)),copyPhase:phase,
   danceX:Math.sin(phase*.5)*.28*strength,danceZ:Math.cos(phase*.37)*.18*strength,
   circulation:Math.sin(phase*.23)*.5*strength,lift:(.18+.08*Math.sin(phase))*strength,
   flameDrive:.78+.10*Math.sin(phase*.5),flameGust:.12+.08*Math.sin(phase)**2,
   lightingEnergy:clamp(strength*.7),atmosphere:.35*strength,groundExtent:2,groundDensity:.5,
   readingClearance:original.readingClearance??.65};
 }};
}
