import { orbit } from '../camera.js';
import { sampleDustTargetsFromPixels } from './vendor/echo-dust-swarm.js';
import {fitSubjectFrame} from './subject-framing.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
// The forest responds to section-level energy, not individual beats. This
// closed-form envelope depends only on song time, so seeking and offline
// rendering produce the same lighting without a separate simulation clock.
export function createSongStageLighting(cues,direction=null){
 const sections=(Array.isArray(cues)?cues:[]).filter(c=>Number.isFinite(c.start)).map(c=>{
  const authored=direction?.at((c.start+(Number.isFinite(c.end)?c.end:c.start))/2)?.lightingEnergy;
  return {start:Math.max(0,c.start),authored:Number.isFinite(authored),energy:Number.isFinite(authored)?clamp(authored):Number.isFinite(c.density)?clamp(c.density):.5};
 }).sort((a,b)=>a.start-b.start);
 const authored=sections.some(s=>s.authored);
 return time=>{
  if(!sections.length)return {lightK:1,stageLightReach:0};
  const t=Number.isFinite(time)?Math.max(0,time):0;
  let value=sections[0]?.energy??.5,target=value,previous=0;
  for(const section of sections){
   if(section.start>t)break;
   value=target+(value-target)*Math.exp(-(section.start-previous)/4);
   target=section.energy;previous=section.start;
  }
  value=target+(value-target)*Math.exp(-(t-previous)/4);
  // Light keeps its physical fire origin. A slow artistic reach envelope
  // exposes more ground/trunks at peaks without pulsing the moon or stars.
  return authored?{lightK:.64+.72*value,stageLightReach:1.8+3*value}:{lightK:.85+.3*value,stageLightReach:0};
 };
}
const comfortBlend=(comfort,t)=>{const u=clamp((t-comfort.at)/1.2);return u*u*(3-2*u);};
export function directedYaw(performance,t,state,swarm=null){
  const target=.25+.28*Math.sin(performance.camera(t,state).yaw*.55),comfort=swarm?.cameraComfort;
  if(!comfort)return target;
  return swarm.reduced?comfort.yaw:comfort.yaw+(target-comfort.yaw)*comfortBlend(comfort,t);
}
export function directedPitch(swarm,stage,t){
  let value=swarm.reduced?.12:.13+.025*Math.sin(t*.12);
  const comfort=swarm.cameraComfort;
  if(comfort)value=swarm.reduced?comfort.pitch:comfort.pitch+(value-comfort.pitch)*comfortBlend(comfort,t);
  return clamp(value+(stage?.pitchOffset??0),-.08,.35);
}
export function setCameraComfort(performance,swarm,t,state,enabled){
  const next=enabled===true;if(next===swarm.reduced)return;
  // Capture before changing the controller's reduced flag. Otherwise its
  // fixed angle has already replaced the shot we are trying to preserve.
  const comfort={at:t,yaw:directedYaw(performance,t,state,swarm),pitch:directedPitch(swarm,null,t)};
  performance.setReducedMotion(next);swarm.reduced=next;swarm.cameraComfort=comfort;
}
export function directedCamera(performance,swarm,stageDirection,t,state,aspect=16/9){
  const yaw=directedYaw(performance,t,state,swarm),stage=stageDirection?.at(t);
  // Authored pitch is a bounded framing offset, not an independent camera
  // clock. Reduce-motion keeps the authored framing but removes camera drift.
  const pitch=directedPitch(swarm,stage,t);
  const ease=x=>{const q=clamp(x);return q*q*(3-2*q);};
  const tall=state.motif.family==='helix'?ease((t-state.cue.start)/2)*ease((state.cue.end-t)/2):0;
  // Open rings need headroom while they form above the anchored fire. An
  // image target takes precedence over the stage's procedural-ring override.
  // Ease in and out at cue edges; dispersed rings need a little more space.
  const ring=stage?.motif==='open-ring'&&!state.motif.imageRef?ease((t-state.cue.start)/2)*ease((state.cue.end-t)/2):0;
  const dispersed=stage?.constructionMix?ring*stage.constructionMix[3]:stage?.construction==='plume'?ring:0;
  // Narrow views need a wider horizontal reading area. Preserve the existing
  // landscape shot and gradually pull back/widen the lens below square.
  const narrow=ease((1-Math.max(.2,aspect))/.55);
  const integrated=stage?.composition==='integrated';
  const dist=clamp(((integrated?3.85:3.2)-state.anticipation*.18)*(stage?.distanceScale??1)+.7*tall+.5*ring+.2*dispersed+2*narrow,2.8,6.2);
  const fov=52+8*narrow;
  if(swarm.frameBounds&&swarm.motion){
    const fit=fitSubjectFrame({bounds:swarm.frameBounds,scale:swarm.motion.scale,anchor:swarm.motion.anchor,pitch,aspect,fov,minimumDistance:dist,flat:swarm.frameBounds.flat,subjectFocus:integrated?.72:0});
    const visibility=clamp((stage?.dustVisibility??1)*(swarm.settings?.dust??1));
    return orbit({yaw,pitch,dist:dist+(fit.distance-dist)*visibility,target:[0,1.12+(fit.targetY-1.12)*visibility,0],fov});
  }
  return orbit({yaw,pitch,dist,target:[0,1.12+.18*tall+.12*ring+.04*dispersed,0],fov});
}
export function createPhraseTargets(packet){
 const cache=new Map();const sample=(p,count,seed)=>{
  if(cache.has(p.id))return cache.get(p.id);
  const c=typeof document!=='undefined'?document.createElement('canvas'):new OffscreenCanvas(1024,220);c.width=1024;c.height=220;
  const g=c.getContext('2d',{willReadFrequently:true});
  const text=p.text.trim(),hero=!p.burst&&/^switch\s+hands[, .!?]*$/i.test(text);
  // Visual fragments retain words from the verified hook; they do not change
  // canonical phrase text, timings or the normal subtitle line.
  const house=p.burst&&/our\s+house/i.test(text);
  const spin=p.burst&&/rip-off.*spin-off/i.test(text);
  const lines=hero?['Switch','Hands']:house?['House']:spin?['Rip-off','Spin-off']:[text];
  c.height=lines.length===2?440:260;
  const family=(p.font||packet.direction.lyrics?.font)==='serif'?'Georgia,serif':'system-ui,sans-serif';
  let size=hero?180:p.burst?200:110;
  g.font=`650 ${size}px ${family}`;
  const maxWidth=Math.max(...lines.map(line=>g.measureText(line).width));
  size=Math.min(size,920/Math.max(1,maxWidth)*size);
  g.font=`650 ${size}px ${family}`;g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff';
  lines.forEach((line,i)=>g.fillText(line,512,lines.length===2?125+i*190:c.height/2));
  const points=sampleDustTargetsFromPixels(g.getImageData(0,0,c.width,c.height),{count,seed,scale:3.3,mode:'alpha'});
  // Retain the score's intent for as long as this target is active, including
  // the controller's lookahead and release between phrase state changes.
  points.campfireKind='phrase';points.campfireBurst=Boolean(p.burst);points.campfireDisplayLines=lines;
  cache.set(p.id,points);return points;
 };sample.clear=()=>cache.clear();return sample;
}
