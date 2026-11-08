import {campfireEnvironmentProfile,createEnvironmentAccent,recordEnvironmentAccent} from './stage-environment.js';
// Hapa Fire Dust: WebGPU host for the existing Score Dust performance.
// Shared targets/constants: Hapa.ai / Calder Wong. Fluid/render foundation: Leon Lin.
import { UniformStruct, computePipeline, layoutFromWGSL } from '../gpu.js';
import { dustParticleConstants, fillDustFormationTargets } from './vendor/echo-dust-swarm.js';
import {createCampfireSignals,stepCampfireSignals} from './musical-signals.js';
import {createCampfireMotion,stepCampfireMotion} from './motion-controls.js';
import {measureSubjectBounds,followSubjectBounds,pocketSubjectBounds,copySubjectBounds} from './subject-framing.js';

// 0.3 is the existing direction default and preserves previous behavior.
// Authored intensity scales only discrete reactions, never ambient spark rate.
export function campfireAccentResponse(kick,shock,level=0.3,reduced=false){
  const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
  const scale=Math.min(2,Math.max(0,finite(level,0.3))/0.3);
  return {kick:reduced?0:Math.min(1.5,Math.max(0,finite(kick))*scale),shock:reduced?0:Math.min(2,Math.max(0,finite(shock))*scale)};
}

export class FireDust {
  constructor({ device, sim, renderer, sparks, playback, sampleBands, count=12000, seed=7, reduced=false,environmentQuality='high' }) {
    Object.assign(this,{device,sim,renderer,sparks,playback,sampleBands,count,seed,reduced});
    this.environmentQuality=campfireEnvironmentProfile(environmentQuality).name;
    this.time=0; this.formation='sphere'; this.kickAmount=0; this.shockAmount=0; this.formed=false; this.participation=0.8;this.readingClearance=0;
    this.settings={dust:1,smoke:1,formation:1}; this.cameraYaw=0;
    this.constants=dustParticleConstants(count,seed);
    const n=count;
    this.target=new Float32Array(n*3); this.normal=new Float32Array(n*3); this.param=new Float32Array(n); this.flex=new Float32Array(n); this.tint=new Uint8Array(n*3);
    const buffer=(size,extra=0)=>device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|extra});
    this.state=buffer(n*32,GPUBufferUsage.COPY_SRC); this.targets=buffer(n*48,GPUBufferUsage.COPY_SRC); this.bandBuffer=buffer(128);
    this.C=buffer(n*16);
    const c=new Float32Array(n*4);
    for(let i=0;i<n;i++)c.set([this.constants.frequency[i],this.constants.rank[i],this.constants.lag[i],this.constants.size[i]],i*4);
    device.queue.writeBuffer(this.C,0,c);
    this.U=new UniformStruct(device,'DP',['time','dt','count','hold','omega','flow','kick','rotation','blend','intensity','scale','anchor','ox','oy','oz','sx','sy','sz','changed','stagger','shock','reading','gain','smoke','r0','g0','b0','r1','g1','b1','r2','g2','b2','reduced','participation','calm','boundary','picture','clearance','volumeFill','torsion','width','colourMode','desaturate','arrivalMode','arrivalSeconds','plumeCoherence','ring','burst','styleAccent','cContour','cShell','cVolume','cPlume','constructionEnabled','slowEnergy','beatEnvelope','readWidth','readHeight','readCenter','unwind','danceX','danceZ','circulation','lift','transitionKind','morphSeconds','departure','pockets','pocketAge','pocketLeft','atmosphereCount','atmosphereTime','atmosphereGain','accentAge','accentStrength','accentX','accentZ','figure','departureKind','atmosphereBudget','copyDuet','copyOrbit','copyFan','copyCascade','copyPhase','colourBoost','sourceColour']);
    this.sampler=device.createSampler({minFilter:'linear',magFilter:'linear'});
    this.build(); this.reset(); this.setFormation('sphere');
  }
  reset(startTime=0) {
    this.time=startTime; this.ashClock=startTime*(this.reduced?.15:1); this.kickAmount=0;this.shockAmount=0;this.participation=0.8;this.readingClearance=0;this.sim.reset();this.sparks.reset();this.renderer.histReset=true;
    const state=new Float32Array(this.count*8);
    for(let i=0;i<this.count;i++){
      const a=this.constants.rank[i]*Math.PI*2,rr=0.18*Math.sqrt(this.constants.lag[i]);
      state.set([Math.cos(a)*rr,0.12+this.constants.lag[i]*0.8,Math.sin(a)*rr,this.constants.lag[i]*3,0,0.1,0,1],i*8);
    }
    this.signals=createCampfireSignals({intensity:this.playback.stateAt(startTime).intensity,bands:this.sampleBands(startTime)});
    this.motion=null;this.sceneKey=null;this.environmentAccent=createEnvironmentAccent();
    // A new seeded run must not morph from the previous song's final target.
    for(const name of ['target','normal','param','flex','tint'])this[name].fill(0);
    this.targetIsObject=false;this.targetIsPicture=false;this.targetIsFigure=false;this.targetIsBurst=false;this.sourceColour=0;this.targetCopyable=false;
    this.frameBounds=null;
    this.device.queue.writeBuffer(this.state,0,state);this.changed=startTime;this.lastStep=null;
  }
  setFormation(spec,{stagger=0.35,snap=false}={}) {
    const previous=this.target.slice();
    // Formation selection happens immediately before the owner's next 60 Hz
    // step. Keep image/lyric targets intact; only reinterpret shape cues.
    const stage=this.stageDirectionAt?.(Math.round(this.time*60+1)/60);
    if(typeof spec==='string'&&stage?.formation&&!['image','figure','symbol','fire'].includes(stage.formation))spec=stage.formation;
    this.sceneKey=stage?.sceneKey??null;
    if(typeof spec==='string'&&stage?.sceneKey)stagger=stage.staggerSeconds??stagger;
    const ribbon=spec==='ribbon',ring=typeof spec==='string'&&stage?.motif==='open-ring';
    const out=fillDustFormationTargets(ribbon?'sheet':ring?'ring':spec,{n:this.count,seed:this.seed,scatter:this.constants.scatter,rank:this.constants.rank,target:this.target,normal:this.normal,param:this.param,flex:this.flex,tint:this.tint});
    if(ribbon||spec==='spiral')for(let i=0;i<this.count;i++){
      const k=i*3,x=this.target[k],y=this.target[k+1],z=this.target[k+2];
      if(ribbon){this.target[k]=x*.9;this.target[k+1]=z*.7;this.target[k+2]=.18*Math.sin(x*2.8+z*2);this.normal.set([0,0,1],k);}
      else {this.target[k+1]=z;this.target[k+2]=y;const ny=this.normal[k+1];this.normal[k+1]=this.normal[k+2];this.normal[k+2]=ny;}
    }
    if(ring){
      // Reorient the upstream ring vertically and leave a small opening at its
      // top. Stable slots keep transitions consistent; varying rib amplitude
      // makes later returns distinct without altering owner cue identities.
      const rib=stage.ringVariant===5?.11:stage.ringVariant===10?.16:stage.ringVariant===13?.07:0;
      for(let i=0;i<this.count;i++){
        const k=i*3,u=this.param[i],a=Math.PI*0.64+u*Math.PI*1.72;
        const radius=Math.hypot(this.target[k],this.target[k+2])*(1+rib*Math.sin(a*8));
        const depth=this.target[k+1];
        this.target[k]=Math.cos(a)*radius;this.target[k+1]=Math.sin(a)*radius;this.target[k+2]=depth;
        this.normal[k]=Math.cos(a);this.normal[k+1]=Math.sin(a);this.normal[k+2]=0;
      }
      // Explicit construction choices keep the same particle slots and ring
      // angles. Shell is the existing ring; contour sharpens its edge, volume
      // fills it, and plume loosens it into a dispersed current.
      if(!stage.constructionMix&&stage.construction&&stage.construction!=='shell')for(let i=0;i<this.count;i++){
        const k=i*3,r=Math.hypot(this.target[k],this.target[k+1]),rank=this.constants.rank[i],lag=this.constants.lag[i];
        if(stage.construction==='contour'&&r>1e-6){this.target[k]/=r;this.target[k+1]/=r;this.target[k+2]*=.22;}
        else if(stage.construction==='volume'&&lag>.35){const fill=Math.sqrt(rank);this.target[k]*=fill;this.target[k+1]*=fill;this.target[k+2]+=(lag-.5)*.36;}
        else if(stage.construction==='plume'&&lag>.45){this.target[k]+=this.constants.scatter[k]*.45;this.target[k+1]+=this.constants.scatter[k+1]*.45+.18;this.target[k+2]+=this.constants.scatter[k+2]*.45;}
      }
    }
    this.targetBounds={...measureSubjectBounds(this.target),flat:typeof spec==='object'?1:0};
    if(!this.frameBounds||snap)this.frameBounds={...this.targetBounds};
    this.constructionNotice=stage?.construction&&!ring&&typeof spec==='string'?`Construction ${stage.construction} is not available for this shape.`:null;
    this.snappedFormation=Boolean(snap&&this.time>0);
    this.formation=ribbon?'ribbon':out.family;this.targetIsObject=typeof spec==='object';this.targetIsPicture=spec?.campfireKind==='picture';this.targetIsFigure=spec?.campfireFigure===true;this.targetIsBurst=spec?.campfireKind==='phrase'&&spec.campfireBurst===true;this.changed=this.time;this.stagger=this.targetIsBurst?Math.min(.08,stagger):this.targetIsPicture&&stage?.composition==='integrated'?Math.min(.12,stagger):stagger;
    this.sourceColour=Number(spec?.campfireSourceColour)||0;this.targetCopyable=spec?.campfireCopyable===true;
    const p=new Float32Array(this.count*12);
    for(let i=0;i<this.count;i++){
      p.set([this.target[i*3],this.target[i*3+1],this.target[i*3+2],this.param[i],this.normal[i*3],this.normal[i*3+1],this.normal[i*3+2],this.flex[i],previous[i*3],previous[i*3+1],previous[i*3+2],this.targetIsFigure||this.sourceColour>0?(this.tint[i*3]+this.tint[i*3+1]*256+this.tint[i*3+2]*65536):0],i*12);
    }
    this.device.queue.writeBuffer(this.targets,0,p);
  }
  kick(v){this.kickAmount=Math.min(1.5,this.kickAmount+v);}
  shock(v){this.shockAmount=Math.min(2,v);}
  step(dt,controls) {
    // Match the owner's integer 60 Hz grid. Accumulated floating-point time
    // could put a target change one epsilon before the new cue for its entire hold.
    const nextTime=this.time+dt;
    this.time=Math.abs(dt-1/60)<1e-8?Math.round(nextTime*60)/60:nextTime;
    this.ashClock+=dt*(this.reduced?.15:1);
    const s=this.playback.stateAt(this.time),bands=controls.bands||this.sampleBands(this.time);
    // Resolve presentation at simulation time, not the last display frame.
    // Catch-up steps can cross cues and must each see their own camera/palette.
    const presentation=this.presentationAt?.(this.time,s);
    if(presentation){this.cameraYaw=presentation.yaw;this.palette=presentation.palette;this.colourStyle=presentation.style;}
    const bass=(bands[0]+bands[1]+bands[2]+bands[3]+bands[4]+bands[5])/6;
    const high=(bands[24]+bands[26]+bands[28]+bands[30])/4;
    const elapsed=this.time-s.cue.start,remaining=s.cue.end-this.time;
    // The score controller can select a phrase ahead of its vocal interval.
    // Use the selected target's own intent instead of guessing from current time.
    this.reading=this.targetIsObject&&!this.targetIsBurst;
    // Each existing cue breathes out of the plume and releases at its tail.
    const ramp=(x)=>{const v=Math.max(0,Math.min(1,x));return v*v*(3-2*v);};
    const direction=this.stageDirectionAt?.(this.time);
    // The local arrangement already authors its departures and transfers.
    // Do not compound them with the older three-second cue-level gather.
    const envelope=direction?.sceneKey?ramp(this.time/.65):ramp((elapsed-0.8)/2.4)*ramp((remaining-0.25)/1.6);
    if(direction?.sceneKey&&direction.sceneKey!==this.sceneKey&&!this.targetIsObject&& !['fire','image','symbol'].includes(direction.formation))this.setFormation(direction.formation==='figure'?'helix':direction.formation,{stagger:.24});
    // Only explicitly authored clearance changes the existing performance.
    // Smooth its entry and exit so ambient grains do not blink at a cue edge.
    const clearanceTarget=this.targetIsBurst?.50:this.reading?(direction?.readingClearance??0)*(this.targetIsPicture?.85:1):0;
    this.readingClearance+=(clearanceTarget-this.readingClearance)*(1-Math.exp(-dt/0.35));
    const accent=campfireAccentResponse(this.kickAmount,this.shockAmount,direction?.accents,this.reduced);
    const musical=stepCampfireSignals(this.signals,{dt,time:this.time,bands,intensity:s.intensity,kick:accent.kick,shock:accent.shock,accentLevel:direction?.accents??.3,reduced:this.reduced});
    const environment=campfireEnvironmentProfile(this.environmentQuality),environmentEnabled=Boolean(direction?.sceneKey);
    if(environmentEnabled&&musical.accentOpportunity&&!this.targetIsObject)recordEnvironmentAccent(this.environmentAccent,this.time,musical.accentStrength);
    const envAccent=this.environmentAccent,accentAge=this.time-envAccent.at;
    const integrated=direction?.composition==='integrated';
    const baseHold=this.targetIsPicture||this.targetIsBurst?Math.max(integrated?.96:.82,controls.hold??0):integrated?Math.max(.88,controls.hold??0):(controls.hold??0.6);
    const visualRelease=this.visualStateAt?.(this.time)?.phrase?.visualRelease??1;
    const hold=Math.max(0,Math.min(1,baseHold*(this.targetIsBurst||this.reading&&!this.targetIsPicture?1:envelope)*this.settings.formation*(direction?.release??1)*(direction?.formationDrive??1)*(this.targetIsObject?1:(direction?.sceneRelease??1))*visualRelease));
    // Reserve a visible current to feed readable images, even when Echo asks
    // for full participation. Other cues retain the score-driven population.
    const participationCeiling=this.reading?0.68:this.targetIsBurst?.72:.92;
    // Brief word fragments need a legible minimum population while leaving
    // a free current. This is an explicit local phrase adaptation of density.
    const phraseFloor=this.targetIsBurst?.52:integrated&&this.targetIsPicture?.62:0;
    const requestedParticipation=Math.max(0,Math.min(participationCeiling,Math.max(phraseFloor,(controls.participation??.8)*(direction?.participation??1))));
    this.participation+=(requestedParticipation-this.participation)*(1-Math.exp(-dt/0.65));
    const calm=Math.max(0,Math.min(1,controls.calm??0));
    const intensity=0.45+0.65*musical.slowEnergy+0.12*musical.bass;
    const danceScale=this.reduced?.18:1;
    const wind=this.reduced?0.08:0.17*Math.sin(this.time*0.19)+0.22*(s.busy-0.5)+(direction?.danceX??0)*danceScale;
    const windZ=0.12*Math.cos(this.time*0.13)+(direction?.danceZ??0)*danceScale;
    this.sim.setParams({intensity:intensity*(direction?.flameDrive??1),gust:this.reduced?0:(direction?.flameGust??0),windX:wind,windZ,burstAmt:accent.shock*0.25});
    // Ground current is a surface treatment driven by the same wind and song
    // clock; it remains independent of recruited formation particles.
    Object.assign(this.renderer.params,{ashStrength:(direction?.groundAsh??0)*(.45+.55*s.intensity)*this.settings.dust,
      ashWindX:wind,ashWindZ:windZ,ashPhase:this.ashClock,ashExtent:direction?.groundExtent??1.25+.65*musical.slowEnergy,
      ashDensity:direction?.groundDensity??1,ashAccentAge:accentAge,ashAccentStrength:environmentEnabled?envAccent.strength*environment.gain*(this.reduced?.15:1):0,
      ashAccentX:Math.cos(envAccent.angle)*1.85,ashAccentZ:Math.sin(envAccent.angle)*1.85});
    this.sparks.rate=2+musical.highFast*(this.reduced?1.5:5);
    if(musical.emitAccent&&!this.targetIsObject)this.sparks.burst({n:Math.max(1,Math.round(10*musical.accentStrength*environment.sparkScale)),pos:[0,0.13,0],speed:2.4+.5*musical.accentStrength,radius:0.1,dur:0.06,fan:1.2,size:1.1,aim:[Math.cos(envAccent.angle),0,Math.sin(envAccent.angle)]});
    const col=direction?.dustPalette||this.palette||[{r:.2,g:.65,b:1},{r:.55,g:.3,b:1},{r:1,g:.65,b:.25}];
    const f=this.sim;
    // Bind the arrival to the target change, so crossing into a later section
    // does not change an in-flight gesture. Derived from song time on restore.
    const arrival=this.stageDirectionAt?.(Math.round(this.changed*60+1)/60);
    // The open-ring hero remains readable as the camera orbits. Other owner
    // shapes retain their authored rotation; ring variation is a restrained tilt.
    const rotation=this.reading||this.targetIsBurst||['ribbon','spiral','snowflake'].includes(this.formation)?-this.cameraYaw:this.formation==='ring'?-this.cameraYaw+(this.reduced?0:0.18*Math.sin(this.time*.13)):controls.rotation;
    const motionTarget={hold,omega:this.targetIsBurst?8.5:integrated?this.targetIsPicture?9.6:Math.max(controls.omega??4,direction.catchOmega)+1.0*(direction?.catchPulse??0):this.targetIsObject||this.reduced?controls.omega:(controls.omega??4)+3*(direction?.catchPulse??0),flow:controls.flow,rotation,
      scale:this.reading?(integrated?this.targetIsFigure?.82:.92:.82):(0.48+0.35*Math.max(0,Math.min(1,controls.reach??0.4)))*(direction?.reach??1)*(this.targetIsObject?1:(direction?.sceneScale??1)*(direction?.subjectScale??1)),anchor:this.reading?(direction?.readingAnchor??1.78):(direction?.subjectAnchor??1.55),calm,protection:this.reading?1:this.targetIsBurst?.70:0};
    if(!this.motion)this.motion=createCampfireMotion(motionTarget);
    const motion=stepCampfireMotion(this.motion,motionTarget,dt,{reading:this.reading,burst:this.targetIsBurst});
    const pockets=this.targetIsObject?0:(direction?.pockets??0);
    const copyMix=this.targetIsObject&&!this.targetCopyable?[0,0,0,0]:(direction?.copyMix??[0,0,0,0]);
    followSubjectBounds(this.frameBounds,copySubjectBounds(pocketSubjectBounds(this.targetBounds,pockets),copyMix),dt);
    this.U.set({time:this.time,dt,count:this.count,hold:motion.hold,omega:motion.omega,flow:motion.flow,kick:accent.kick,rotation:motion.rotation,blend:motion.hold,intensity:s.intensity,
      scale:motion.scale,anchor:motion.anchor,ox:f.origin[0],oy:f.origin[1],oz:f.origin[2],sx:f.size[0],sy:f.size[1],sz:f.size[2],changed:this.changed-(this.snappedFormation?5:0),stagger:this.stagger,shock:accent.shock,reading:motion.protection,
      gain:this.settings.dust*(direction?.dustVisibility??1),smoke:Math.max(0,Math.min(2,this.settings.smoke*(direction?.smoke??1))),r0:col[0].r,g0:col[0].g,b0:col[0].b,r1:col[1%col.length].r,g1:col[1%col.length].g,b1:col[1%col.length].b,r2:col[2%col.length].r,g2:col[2%col.length].g,b2:col[2%col.length].b,reduced:this.reduced?1:0,participation:this.participation,calm:motion.calm,boundary:direction?.boundary??0.3,picture:this.targetIsPicture?1:0,clearance:this.readingClearance,volumeFill:this.targetIsObject?0:direction?.volumeFill??0,torsion:this.targetIsObject?0:(direction?.torsion??0)*(this.reduced?.15:1),width:this.targetIsObject?1:direction?.width??1,colourMode:({depth:1,height:2,frequency:3,speed:4})[direction?.dustColourMode??this.colourStyle?.mode]??0,desaturate:direction?.dustDesaturate??this.colourStyle?.desaturate??0,arrivalMode:this.targetIsObject||this.snappedFormation||arrival?.sceneKey?0:arrival?.arrivalMode??0,arrivalSeconds:arrival?.arrivalSeconds??.7,plumeCoherence:direction?.plumeCoherence??0,ring:this.formation==='ring'?1:0,burst:this.targetIsBurst?1:0,styleAccent:this.reduced?0:Math.max(0,Math.min(1,this.colourStyle?.flash??0))*.07,
      cContour:this.targetIsObject?0:direction?.constructionMix?.[0]??0,cShell:this.targetIsObject?0:direction?.constructionMix?.[1]??0,cVolume:this.targetIsObject?0:direction?.constructionMix?.[2]??0,cPlume:this.targetIsObject?0:direction?.constructionMix?.[3]??0,slowEnergy:musical.slowEnergy,beatEnvelope:musical.beat,constructionEnabled:!this.targetIsObject&&this.formation==='ring'&&direction?.constructionMix?1:0,
      readWidth:Math.max(.3,this.targetBounds.radius*motion.scale+.15),readHeight:Math.max(.22,(this.targetBounds.high-this.targetBounds.low)*motion.scale*.5+.12),readCenter:motion.anchor+(this.targetBounds.high+this.targetBounds.low)*motion.scale*.5,
      sourceColour:this.sourceColour>0?(direction?.sourceColour??this.sourceColour):0,copyDuet:copyMix[0],copyOrbit:copyMix[1],copyFan:copyMix[2],copyCascade:copyMix[3],copyPhase:direction?.copyPhase??0,colourBoost:direction?.dustColourBoost??1,atmosphereBudget:this.peripheralBudget??1,atmosphereCount:environmentEnabled?environment.count:0,atmosphereTime:this.ashClock,atmosphereGain:environmentEnabled?(direction?.atmosphere??0)*environment.gain:0,
      figure:this.targetIsFigure?1:0,accentAge,accentStrength:environmentEnabled&&!this.reduced?envAccent.strength*environment.gain:0,accentX:Math.cos(envAccent.angle),accentZ:Math.sin(envAccent.angle),
      pockets,pocketAge:direction?.pocketAge??0,pocketLeft:direction?.pocketLeft??0,
      transitionKind:this.targetIsObject?0:arrival?.transitionKind??0,morphSeconds:this.targetIsObject?(integrated?.40:.7):arrival?.morphSeconds??.7,departure:this.targetIsObject?0:(direction?.anticipation??0)*(this.reduced?.2:1),departureKind:direction?.departureKind??0,
      danceX:(direction?.danceX??0)*danceScale,danceZ:(direction?.danceZ??0)*danceScale,circulation:(direction?.circulation??0)*danceScale,lift:(direction?.lift??0)*danceScale,
      unwind:this.formation==='helix'&&!this.targetIsObject?(direction?.unwind??0)*(this.reduced?.2:1):0}).upload();
    this.device.queue.writeBuffer(this.bandBuffer,0,bands);
    const prof=this.profiler,enc=this.device.createCommandEncoder();f.step(enc,dt,prof);this.sparks.step(enc,dt,prof);
    const pass=enc.beginComputePass({timestampWrites:prof?.pass('dust-simulation')});pass.setPipeline(this.pipe);pass.setBindGroup(0,this.computeGroup());pass.dispatchWorkgroups(Math.ceil(this.count/64));pass.end();
    this.device.queue.submit([enc.finish()]);this.kickAmount=0;this.shockAmount=0;
    this.lastStep={time:this.time,musical,motion:{...motion},hold:motion.hold,intensity,bass,high,reading:this.reading,participation:this.participation,omega:motion.omega,reach:controls.reach,calm:motion.calm,constructionNotice:this.constructionNotice};
  }
  computeGroup(){
    const d=this.device;
    if(this.flowView!==this.sim.vel){
      this.flowView=this.sim.vel;
      this.bg=d.createBindGroup({layout:this.pipe.bgl,entries:[
        {binding:0,resource:{buffer:this.U.buffer}},{binding:1,resource:{buffer:this.state}},{binding:2,resource:{buffer:this.targets}},{binding:3,resource:{buffer:this.C}},
        {binding:4,resource:this.sim.vel.createView()},{binding:5,resource:this.sampler},{binding:6,resource:{buffer:this.bandBuffer}}]});
    }return this.bg;
  }
  build(){
    const d=this.device;
    const structures=`struct Grain{p:vec4f,v:vec4f};struct Target{p:vec4f,n:vec4f,old:vec4f};
// A narrow band of free persistent slots feeds the held subject. The rest
// remains ordinary upward smoke; no population is spawned for this gesture.
fn danceAxis(y:f32)->vec2f {
 let h=smoothstep(0.12,1.6,y);
 return vec2f(0.10*sin(y*1.4-D.time*0.22),0.08*cos(y*1.2-D.time*0.17))+vec2f(D.danceX,D.danceZ)*h*0.65;
}
fn feedingWeight(rank:f32)->f32 {
 return smoothstep(D.participation+0.015,D.participation+0.055,rank)*(1.0-smoothstep(D.participation+0.15,D.participation+0.23,rank));
}`;
    this.pipe=computePipeline(d,`${this.U.wgsl()}${structures}
@group(0) @binding(0) var<uniform> D:DP;
@group(0) @binding(1) var<storage,read_write> grains:array<Grain>;
@group(0) @binding(2) var<storage,read> targets:array<Target>;
@group(0) @binding(3) var<storage,read> constants:array<vec4f>;
@group(0) @binding(4) var velocity:texture_3d<f32>;
@group(0) @binding(5) var linear:sampler;
@group(0) @binding(6) var<storage,read> bands:array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(D.count)){return;}var g=grains[i];let c=constants[i];let q=targets[i];
 let rank=c.y;let recruitment=1.0-smoothstep(D.participation-0.04,D.participation+0.04,rank);
 // Edges let go first; the stable core stays available for readable forms.
 let edge=smoothstep(0.55,0.95,rank/max(D.participation,0.04));
 let edgeRelease=edge*smoothstep(0.12,0.95,1.0-D.blend)*mix(0.65,0.12,D.reading);
 var held=D.blend*recruitment*(1.0-edgeRelease)*(1.0-D.cPlume*edge*0.3);
 // Membership comes from the immutable lag seed, never the current shape.
 let pocket=min(2.0,floor(c.z*3.0));
 let pocketEnvelope=smoothstep(pocket*.22,pocket*.22+.45,D.pocketAge)*(1.0-smoothstep(D.pocketLeft-.6,D.pocketLeft,pocket*.16));
 held*=1.0-D.pockets*(1.0-pocketEnvelope)*.55;
 let bandx=clamp(q.p.w,0.0,1.0)*31.0;let b=min(u32(bandx),30u);let energy=mix(bands[b],bands[b+1u],fract(bandx));
 // Stable strip/group delays make the transfer itself a visible gesture.
 let order=select(c.z,q.p.w,D.transitionKind>3.5&&D.transitionKind<4.5);
 let delay=order*D.stagger;
 let switched=smoothstep(delay,delay+select(max(0.24,D.morphSeconds),0.24,D.burst>0.5),D.time-D.changed);
 var local=mix(q.old.xyz,q.p.xyz,switched)*D.scale;
 let transfer=sin(switched*3.14159265)*(1.0-D.reduced*0.8);
 if(D.transitionKind>0.5&&D.transitionKind<1.5){local.y+=transfer*(.25+.22*c.z);}
 if(D.transitionKind>1.5&&D.transitionKind<2.5){let angle=transfer*(c.z-.5)*2.4;let xy=local.xy;local.x=xy.x*cos(angle)-xy.y*sin(angle);local.y=xy.x*sin(angle)+xy.y*cos(angle);}
 if(D.transitionKind>2.5&&D.transitionKind<3.5){local+=vec3f(sin(c.z*53.0),cos(c.z*37.0)*.65,sin(c.z*71.0))*.32*transfer;}
 if(D.transitionKind>3.5&&D.transitionKind<4.5){let strip=floor(q.p.w*7.0);local.x+=sin(strip*2.4)*.32*transfer;local.y+=(strip/6.0-.5)*.25*transfer;}
 if(D.transitionKind>4.5&&D.transitionKind<5.5){local*=1.0-.45*transfer;}
 // Opposing lanes cross, then catch; a siphon dips through the feeding plume.
 // Same slots and velocity persist. Object targets always select kind zero.
 if(D.transitionKind>5.5&&D.transitionKind<6.5){
  let side=select(-1.0,1.0,c.z>.5);
  local.x+=side*transfer*.48;local.z+=sin(c.z*6.2831853)*transfer*.22;
 }
 if(D.transitionKind>6.5&&D.transitionKind<7.5){
  local.x*=1.0-.55*transfer;local.z*=1.0-.55*transfer;local.y-=transfer*.42;
 }
 // Extra handoff paths: fan peel, corkscrew, wing exchange, butterfly and
 // stepped cascade. They deform attractors, never reset particle positions.
 if(D.transitionKind>7.5&&D.transitionKind<8.5){local.x+=sin(q.p.w*6.2831853)*transfer*.42;local.y+=abs(c.z-.5)*transfer*.38;}
 if(D.transitionKind>8.5&&D.transitionKind<9.5){let a=transfer*(c.z*2.0-1.0)*3.14159265;let xz=local.xz;local.x=xz.x*cos(a)-xz.y*sin(a);local.z=xz.x*sin(a)+xz.y*cos(a);local.y+=transfer*.22;}
 if(D.transitionKind>9.5&&D.transitionKind<10.5){local.x+=select(-1.0,1.0,c.z>.5)*transfer*.48;local.y+=sin(q.p.w*3.14159265)*transfer*.3;}
 if(D.transitionKind>10.5&&D.transitionKind<11.5){local.z+=select(-1.0,1.0,c.z>.5)*transfer*.38;local.x*=1.0-.42*transfer;}
 if(D.transitionKind>11.5){local.y+=(floor(c.z*3.0)-1.0)*transfer*.32;local.x+=sin(c.z*6.2831853)*transfer*.28;}
 // Outer grains begin leaving before the next cue lands; the core holds.
 local+=q.n.xyz*edge*D.departure*.16;
 if(D.departureKind>5.5&&D.departureKind<6.5){local.x+=select(-1.0,1.0,c.z>.5)*edge*D.departure*.25;}
 if(D.departureKind>6.5){local.x*=1.0-.22*edge*D.departure;local.z*=1.0-.22*edge*D.departure;local.y+=edge*D.departure*.20;}
 // Stable slots move from a hollow surface into volume, with traveling torsion.
 let sculpt=smoothstep(0.20,0.75,rank/max(D.participation,0.04));
 let inward=mix(1.0,sqrt(max(0.01,c.z)),D.volumeFill*sculpt);
 // Fill the transverse section without shortening a vertical helix.
 local.x*=inward;
 if(D.ring>0.5){local.y*=inward;}else{local.z*=inward;}
 // One target and one set of persistent slots can become a fine contour,
 // thicker shell, granular filled volume, then a loose current and back.
 if(D.constructionEnabled>0.5){
  let radial=local.xy/max(length(local.xy),0.0001);
  let phi=c.z*6.2831853;
  let contour=vec3f(local.xy,local.z*0.12);
  let shell=vec3f(local.xy+radial*cos(phi)*0.10*D.scale,local.z+sin(phi)*0.10*D.scale);
  let filled=vec3f(local.xy*sqrt(max(0.01,c.z)),local.z+(rank-0.5)*0.32*D.scale);
  let volume=mix(shell,filled,sculpt);
  let drift=vec3f(sin(q.p.w*11.0-D.time*0.28),0.55+0.6*sin(q.p.w*7.0+D.time*0.24),cos(q.p.w*9.0+D.time*0.19));
  let plume=local+drift*0.36*D.scale*select(1.0,0.35,D.reduced>0.5);
  let constructed=contour*D.cContour+shell*D.cShell+volume*D.cVolume+plume*D.cPlume;
  local=mix(local,constructed,switched);
 }
 // Open the outer braid around an unchanged core, then regather it. The
 // authored cue curve changes winding, not particle assignments or births.
 let opening=smoothstep(0.55,0.85,rank/max(D.participation,0.04));
 let openTurn=-q.p.w*18.8495559*D.unwind*opening;
 let opened=vec2f(local.x*cos(openTurn)-local.z*sin(openTurn),local.x*sin(openTurn)+local.z*cos(openTurn));
 local.x=opened.x*(1.0+0.28*D.unwind*opening);local.z=opened.y*(1.0+0.28*D.unwind*opening);
 let turn=D.torsion*(local.y*2.8+0.35*sin(q.p.w*6.2831853-D.time*0.38));
 let tx=local.x*cos(turn)-local.z*sin(turn);
 local.z=local.x*sin(turn)+local.z*cos(turn);local.x=tx*D.width;
 // Related forms answer with staggered envelopes while sharing one pool.
 let pocketMix=D.pockets*pocketEnvelope;
 local*=1.0-.66*pocketMix;
 let pocketOffset=vec3f((pocket-1.0)*.88,select(-.12,.18,pocket==1.0),select(-.10,.10,pocket==1.0));
 local+=pocketOffset*pocketMix*D.scale;
 // Duplicate the full sampled feature into stable sub-populations. Blended
 // programs keep copies present across the following target-family change.
 let copies=D.copyDuet+D.copyOrbit+D.copyFan+D.copyCascade;
 let side=select(-1.0,1.0,c.z>.5);let group=floor(c.z*3.0)-1.0;
 let phase=select(D.copyPhase,0.0,D.reduced>.5);
 let duet=vec3f(side*(.78+.12*sin(phase)),side*.12*sin(phase*.7),side*.10*cos(phase));
 let exchange=vec3f(side*.85*cos(phase),side*.22*sin(phase),side*.45*sin(phase));
 let fan=vec3f(group*.78,.20*(1.0-abs(group))+.10*sin(phase+group),group*.12*cos(phase));
 let cascade=vec3f(group*.60,group*.36+.12*sin(phase-group),-group*.20);
 local*=1.0-.50*copies;
 local+=(duet*D.copyDuet+exchange*D.copyOrbit+fan*D.copyFan+cascade*D.copyCascade)*D.scale;
 let cr=cos(D.rotation);let sr=sin(D.rotation);
 let goal=vec3f(local.x*cr-local.z*sr,local.y+D.anchor,local.x*sr+local.z*cr);
 let normal=vec3f(q.n.x*cr-q.n.z*sr,q.n.y,q.n.x*sr+q.n.z*cr);
 // A stable core keeps text legible while the outer recruited grains breathe.
 let wave=sin(q.p.w*13.0+D.time*0.8+c.z*3.0)+0.45*sin(q.p.w*27.0-D.time*0.53)+D.beatEnvelope*0.45*sin(q.p.w*18.0-D.time*2.0);
 let freedom=clamp(D.boundary/0.3,0.0,2.0)*(1.0-D.calm*0.7)*(1.0-D.reduced*0.75)*mix(1.0,0.15,D.reading);
 let boundary=edge*wave*0.075*freedom;
 // A slow traveling twist moves the outside without vibrating a word core.
 let twist=edge*freedom*0.08*sin(local.y*5.0-D.time*0.48+c.z*1.7);
 let tangent=vec3f(-local.z*cr-local.x*sr,0.0,-local.z*sr+local.x*cr);
 var goalPosition=goal+normal*(energy*q.n.w*mix(0.12,0.015,D.reading)+boundary)+tangent*twist;
 let arrival=smoothstep(c.z*D.stagger,max(0.71,D.arrivalSeconds)+c.z*D.stagger,D.time-D.changed);
 let arc=sin(arrival*3.14159265)*(1.0-D.reduced*0.8);
 // Curved attractor paths preserve the actual particle position and momentum.
 if(D.arrivalMode>0.5&&D.arrivalMode<1.5){goalPosition.y-=arc*(0.35+0.3*c.z);}
 if(D.arrivalMode>1.5&&D.arrivalMode<2.5){goalPosition+=vec3f(cos(q.p.w*6.2831853)*0.24,-0.4,sin(q.p.w*6.2831853)*0.24)*arc;}
 if(D.arrivalMode>2.5){goalPosition+=normal*arc*(0.15+0.2*c.z)+vec3f(0.0,-arc*0.2,0.0);}
 var pos=g.p.xyz;var v=g.v.xyz;
 let uv=(pos-vec3f(D.ox,D.oy,D.oz))/vec3f(D.sx,D.sy,D.sz);
 let sampledFlow=textureSampleLevel(velocity,linear,clamp(uv,vec3f(0.001),vec3f(0.999)),0.0).xyz;
 // Fade from actual combustion velocity to a coherent, cheaper outer plume.
 // Also fade outside the sides rather than indefinitely clamping the edge texel.
 let sideDistance=max(abs(uv.x-0.5),abs(uv.z-0.5));
 let handoff=max(smoothstep(0.78,1.08,uv.y),smoothstep(0.42,0.58,sideDistance));
 let outerHeight=max(uv.y-0.78,0.0);
 let continuation=vec3f(0.12*sin(D.time*0.35+pos.y*1.4),0.60/(1.0+outerHeight*0.8),0.10*cos(D.time*0.28+pos.y));
 var flow=mix(sampledFlow,continuation,handoff);
 // A coherent feeding column continues beyond the combustion grid. The
 // sideways correction is gentle, height-dependent and never resets grains.
 let axis=danceAxis(pos.y);
 let radial=pos.xz-axis;
 let plumeInward=0.45*(1.15-0.30*D.slowEnergy);
 let feeder=vec3f(-radial.x*plumeInward-radial.y*0.18,0.12,-radial.y*plumeInward+radial.x*0.18);
 flow+=feeder*handoff*D.plumeCoherence*(1.0-held);
 // Matching low flame wind and outer smoke direction form one dancing current.
 let dance=vec3f(D.danceX-radial.y*D.circulation,D.lift,D.danceZ+radial.x*D.circulation);
 flow+=dance*smoothstep(0.18,1.3,pos.y)*(1.0-held*0.92);
 // The body answers the current, while words and pictures keep their anchor.
 goalPosition+=vec3f(D.danceX,0.06*sin(D.time*1.8),D.danceZ)*0.18*(1.0-D.reading)*(1.0-D.burst)*(1.0-D.picture);
 // Released edges ride upward instead of remaining a collapsed target cloud.
 flow.y+=D.plumeCoherence*edge*(1.0-held)*0.12;
 // Steer a small free band along a widening rising route toward its own
 // target location, then let it peel upward. Velocity remains continuous:
 // this changes the field, never particle position or identity.
 let climb=smoothstep(0.55,max(0.85,goalPosition.y),pos.y);
 let destination=mix(axis,goalPosition.xz,climb*climb);
 let guide=vec3f((destination.x-pos.x)*1.4,0.32+0.10*sin(q.p.w*6.2831853+D.time*0.3),(destination.y-pos.z)*1.4);
 let feeding=feedingWeight(rank)*D.plumeCoherence*(1.0-held)*smoothstep(0.35,0.8,pos.y)*(1.0-smoothstep(goalPosition.y+0.10,goalPosition.y+0.5,pos.y))*smoothstep(0.06,0.4,D.blend);
 flow=mix(flow,guide,feeding*0.8);
 let curl=vec3f(sin(pos.y*3.0+D.time*.5)+cos(pos.z*2.0-D.time*.3),sin(pos.z*2.0+D.time*.4),cos(pos.x*3.0+D.time*.3));
 flow+=curl*(0.07+D.flow*0.14)*(1.0-held*0.95)*(1.0-D.calm*0.65);
 let omega=D.omega*c.x;
 let attraction=(goalPosition-pos)*omega*omega*held;
 let drag=mix(2.5,omega*1.65,smoothstep(0.16,0.45,held));
 let accel=attraction+(flow-v)*drag*(1.0-held*0.94)-v*held*omega*1.4;
 v+=accel*D.dt;v+=normal*D.kick*0.14*(1.0-D.reading)*(1.0-D.burst*0.75);
 v+=normalize(pos+vec3f(0.001))*D.shock*0.25*(1.0-D.reading)*(1.0-D.burst*0.75);
 let speed=length(v);if(speed>4.0){v*=4.0/speed;}pos+=v*D.dt;
 var age=g.p.w+D.dt;
 // Ambient grains recycle; directed grains remain persistent during their hold.
 if(held>=0.05){age=min(age,5.7+rank*6.0);}
 if((held<0.05&&(pos.y>3.7||age>7.0+rank*6.0))||pos.y<0.02||length(pos.xz)>3.5){
  let a=c.z*6.2831853+D.time*0.07;pos=vec3f(cos(a)*sqrt(rank)*0.19,0.10+0.07*c.z,sin(a)*sqrt(rank)*0.19);v=vec3f(0.0,0.2,0.0);age=0.0;
 }
 grains[i].p=vec4f(pos,age);grains[i].v=vec4f(v,energy);
}`, 'main','echoDustFlow');
    const R=this.renderer;
    const code=`${R.header()}${this.U.wgsl()}${structures}
@group(0) @binding(1) var<uniform> D:DP;
@group(0) @binding(2) var<storage,read> grains:array<Grain>;
@group(0) @binding(3) var<storage,read> constants:array<vec4f>;
@group(0) @binding(4) var depthT:texture_2d<f32>;
@group(0) @binding(5) var fireT:texture_3d<f32>;
@group(0) @binding(6) var fireSmokeT:texture_3d<f32>;
@group(0) @binding(7) var fireSampler:sampler;
@group(0) @binding(8) var<storage,read> paintTargets:array<Target>;
// Approximate foreground fire-volume extinction at the sprite centre. The
// opaque fire composite is already complete, so this is not exact interleaved
// volume compositing; it keeps foreground fire from being wholly ignored.
fn foregroundTransmission(rel:vec3f)->f32 {
 let dist=length(rel);if(dist<0.0001){return 1.0;}
 let ro=vec3f(R.camX,R.camY,R.camZ);let rd=rel/dist;
 let safe=select(select(vec3f(-0.00001),vec3f(0.00001),rd>=vec3f(0.0)),rd,abs(rd)>vec3f(0.00001));
 let bmin=vec3f(R.ox,R.oy,R.oz);let bmax=bmin+vec3f(R.sx,R.sy,R.sz);
 let a=(bmin-ro)/safe;let b=(bmax-ro)/safe;let lo=min(a,b);let hi=max(a,b);
 let tn=max(0.0,max(lo.x,max(lo.y,lo.z)));let tf=min(dist,min(hi.x,min(hi.y,hi.z)));
 if(tf<=tn){return 1.0;}
 let ds=(tf-tn)/6.0;let dims=vec3f(R.nx,R.ny,R.nz);var optical=0.0;
 for(var i=0;i<6;i++){
  let p=ro+rd*(tn+(f32(i)+0.5)*ds);let g=(p-bmin)/R.dx;
  let edge=min(min(g.x,dims.x-g.x),min(g.z,dims.z-g.z));
  let fade=smoothstep(0.02,0.15,edge*R.dx)*smoothstep(0.0,0.4,(dims.y-g.y)*R.dx);
  var soot=textureSampleLevel(fireT,fireSampler,g/dims,0.0).z*fade;
  if(R.sootEdge>0.0){soot*=smoothstep(0.6*R.sootEdge,1.4*R.sootEdge,soot);}
  let smoke=textureSampleLevel(fireSmokeT,fireSampler,g/dims,0.0).z*fade;
  optical+=(max(soot,0.0)*R.sootAbs+max(smoke,0.0)*R.smokeScat*1.1)*ds;
 }
 return exp(-optical);
}
// Coarse outer-plume model shared by smoke appearance and grain extinction.
// The physical combustion volume remains authoritative near the fire. This
// extension is an artistic continuation, not a second combustion simulation.
fn outerSmokeProfile(p:vec3f)->f32 {
 let lower=D.oy+D.sy*0.65;let upper=D.oy+D.sy*0.95;
 let height=smoothstep(lower,upper,p.y)*(1.0-smoothstep(2.65,3.5,p.y));
 let axis=danceAxis(p.y);
 let width=(0.19+0.13*max(p.y,0.0))*(0.85+0.3*D.slowEnergy);let q=(p.xz-axis)/vec2f(width,width*0.85);
 let radial=dot(q,q);
 let body=exp(-radial*2.0)+0.22*exp(-radial*0.6);
 let wisps=0.65+0.35*sin(p.y*5.0-D.time*0.45+q.x*0.8);
 let region=length(vec3f(p.x/max(.3,D.readWidth),(p.y-D.readCenter)/max(.22,D.readHeight),p.z/.65));
 let clearance=1.0-D.clearance*(1.0-smoothstep(.65,1.3,region))*.65;
 return clamp(body*wisps*height*clearance,0.0,1.2);
}
fn outerSmokeTransmission(rel:vec3f)->f32 {
 let distance=length(rel);if(distance<0.0001||D.smoke<=0.0||D.gain<=0.0){return 1.0;}
 let origin=vec3f(R.camX,R.camY,R.camZ);let ray=rel/distance;
 // Five midpoint samples to the actual grain, so near grains see less smoke
 // than grains behind the same plume. No new texture or per-pixel march.
 let step=distance/5.0;var optical=0.0;
 for(var sample=0;sample<5;sample++){
  optical+=outerSmokeProfile(origin+ray*(f32(sample)+0.5)*step)*step;
 }
 return exp(-optical*0.65*D.smoke*D.gain);
}
struct V{@builtin(position) pos:vec4f,@location(0) uv:vec2f,@location(1) col:vec3f,@location(2) dist:f32,@location(3) alpha:f32};
// Match the simulation's recycle boundaries. This also covers held grains:
// if a formation releases outside the domain it must not vanish in one frame.
fn recycleFade(p:vec3f)->f32 {
 return smoothstep(0.02,0.16,p.y)*(1.0-smoothstep(3.12,3.5,length(p.xz)))*(1.0-smoothstep(3.3,3.7,p.y));
}
// Feather an elliptical screen-space reading region around the projected text
// anchor. Only free particles use this mask; formed letters stay untouched.
fn readingTransmission(screen:vec2f)->f32 {
 let rel=vec3f(0.0,D.readCenter,0.0)-vec3f(R.camX,R.camY,R.camZ);
 let z=max(dot(rel,vec3f(R.fwdX,R.fwdY,R.fwdZ)),0.1);
 let center=vec2f(dot(rel,vec3f(R.rgtX,R.rgtY,R.rgtZ))/z/R.tanFov/R.aspect,dot(rel,vec3f(R.upX,R.upY,R.upZ))/z/R.tanFov);
 let radius=vec2f(clamp(D.readWidth/z/R.tanFov/R.aspect,0.10,0.92),clamp(D.readHeight/z/R.tanFov,0.08,0.85));
 let edge=length((screen-center)/radius);return 1.0-D.clearance*(1.0-smoothstep(0.65,1.15,edge))*0.85;
}
@vertex fn vs(@builtin(vertex_index) vertex:u32,@builtin(instance_index) i:u32)->V{
 let offsets=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 let g=grains[i];let c=constants[i];let rel=g.p.xyz-vec3f(R.camX,R.camY,R.camZ);
 let z=dot(rel,vec3f(R.fwdX,R.fwdY,R.fwdZ));
 let x=dot(rel,vec3f(R.rgtX,R.rgtY,R.rgtZ));let y=dot(rel,vec3f(R.upX,R.upY,R.upZ));
 let ambient=smoothstep(D.participation-0.04,D.participation+0.04,c.y);let sz=mix(1.3+c.w*1.1,5.0+c.w*3.0,ambient);
 let radius=sz*(R.height/1080.0)*2.0/max(z,0.1);
 let offset=offsets[vertex];var out:V;
 out.pos=vec4f(x/max(z,0.01)/R.tanFov/R.aspect+offset.x*radius*2.0/R.width,y/max(z,0.01)/R.tanFov+offset.y*radius*2.0/R.height,0.,1.);
 if(z<0.05){out.pos=vec4f(2.,2.,0.,1.);}
 // Saved spatial color describes the subject rather than random grain slots.
 var u=fract(c.y*3.0);
 if(D.colourMode>0.5&&D.colourMode<1.5){u=clamp(0.5+dot(g.p.xyz-vec3f(0.0,D.anchor,0.0),vec3f(R.fwdX,R.fwdY,R.fwdZ))/1.8,0.0,1.0);}
 if(D.colourMode>1.5&&D.colourMode<2.5){u=clamp((g.p.y-0.65)/2.0,0.0,1.0);}
 if(D.colourMode>2.5&&D.colourMode<3.5){u=clamp(paintTargets[i].p.w,0.0,1.0);}
 if(D.colourMode>3.5){u=clamp(length(g.v.xyz)/2.5,0.0,1.0);}
 let copies=D.copyDuet+D.copyOrbit+D.copyFan+D.copyCascade;
 let pairColour=select(0.0,1.0,c.z>.5);let tripleColour=floor(c.z*3.0)/2.0;
 let groupColour=mix(pairColour,tripleColour,clamp(D.copyFan+D.copyCascade,0.0,1.0));
 u=mix(u,groupColour,clamp(copies*.94,0.0,1.0));
 let col=mix(vec3f(D.r0,D.g0,D.b0),vec3f(D.r1,D.g1,D.b1),min(u*2.0,1.0));
 var pal=mix(col,vec3f(D.r2,D.g2,D.b2),max(u*2.0-1.0,0.0));
 pal=mix(pal,vec3f(1.0),D.styleAccent);
 pal=mix(pal,vec3f(dot(pal,vec3f(0.2126,0.7152,0.0722))),D.desaturate);
 // Preserve the static reference's light/dark facial and clothing detail
 // within the song palette. The source is not a rigged or animated body.
 if(D.figure>.5){
  let rgb=u32(paintTargets[i].old.w);
  let source=vec3f(f32(rgb&255u),f32((rgb>>8u)&255u),f32((rgb>>16u)&255u))/255.0;
  let luma=dot(source,vec3f(.2126,.7152,.0722));
  pal*=.32+1.05*smoothstep(.03,.65,luma);
 }
 // Generated song art can retain its own pigment. Lift very dark materials
 // gently so the silhouette survives a sparse luminous-particle rendition.
 if(D.sourceColour>.001){
  let rgb=u32(paintTargets[i].old.w);
  let source=vec3f(f32(rgb&255u),f32((rgb>>8u)&255u),f32((rgb>>16u)&255u))/255.0;
  let peak=max(source.r,max(source.g,source.b));
  let pigment=source*(.35+.65/max(.25,peak));
  pal=mix(pal,pigment,clamp(D.sourceColour,0.0,1.0)*smoothstep(0.0,.55,D.time-D.changed));
 }
 // Emission starts fire-warm, cools to soot, then resolves into the authored
 // palette as this grain is recruited. It is an artistic age/height model.
 let cooled=smoothstep(0.15,1.5,g.p.w)*smoothstep(0.2,1.3,g.p.y);
 let forming=(1.0-ambient)*smoothstep(0.08,0.65,D.blend);
 let feeding=feedingWeight(c.y)*smoothstep(0.06,0.4,D.blend)*smoothstep(0.65,1.65,g.p.y)*(1.0-smoothstep(2.25,3.1,g.p.y));
 var smokeCol=mix(vec3f(1.0,0.32,0.055),vec3f(0.34,0.38,0.42),cooled);
 let fireLight=(1.0-smoothstep(0.35,1.65,g.p.y))*ambient;
 smokeCol+=vec3f(0.45,0.12,0.025)*fireLight;
 let materialCol=mix(smokeCol,pal,max(forming*smoothstep(0.25,1.1,g.p.y),feeding*0.55));
 let birth=smoothstep(0.,0.8,g.p.w);
 let lifetime=7.0+c.y*6.0;
 let ageFade=1.0-smoothstep(lifetime-1.3,lifetime,g.p.w);
 let heightFade=1.0-smoothstep(3.2,3.7,g.p.y);
 let fade=mix(ageFade*heightFade,1.0,smoothstep(0.05,0.3,forming));
 let twinkle=1.0+select(0.25,0.0,D.reduced>0.5)*sin(c.z*130.0+D.time*(2.0+c.x));
 out.col=materialCol*(0.035+0.045*g.v.w)*twinkle*mix(1.0,2.3,forming)*mix(1.0,D.colourBoost,forming)*mix(1.0,1.35,D.picture*(1.0-ambient));out.alpha=mix(0.92,(0.10+0.10*feeding)*D.smoke,ambient)*birth*fade*recycleFade(g.p.xyz)*D.gain*foregroundTransmission(rel)*outerSmokeTransmission(rel)*mix(1.0,readingTransmission(out.pos.xy),ambient);
 out.uv=offset;out.dist=length(rel);return out;
}
@fragment fn fs(v:V)->@location(0) vec4f{
 let dd=vec2f(textureDimensions(depthT));let d=textureLoad(depthT,vec2i(v.pos.xy/vec2f(R.width,R.height)*dd),0).x;
 if(v.dist>d){discard;}let r=dot(v.uv,v.uv);if(r>1.0){discard;}
 // Soften intersections on the visible side of opaque surfaces without
 // letting grains leak through trees or ground behind their depth.
 let intersection=smoothstep(0.0,0.035,d-v.dist);
 let a=exp(-r*4.0)*v.alpha*intersection;
 return vec4f(v.col*a,a*0.22);
}
// Soft smoke sprites reuse a subset of the existing persistent free grains.
// Shared outer density gives them the same coarse body as grain extinction;
// sprite overlap is still an approximation rather than exact volume compositing.
@vertex fn smokeVs(@builtin(vertex_index) vertex:u32,@builtin(instance_index) instance:u32)->V{
 let offsets=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 let i=instance*4u;let g=grains[i];let c=constants[i];let rel=g.p.xyz-vec3f(R.camX,R.camY,R.camZ);
 let z=dot(rel,vec3f(R.fwdX,R.fwdY,R.fwdZ));let x=dot(rel,vec3f(R.rgtX,R.rgtY,R.rgtZ));let y=dot(rel,vec3f(R.upX,R.upY,R.upZ));
 let free=smoothstep(D.participation-0.04,D.participation+0.04,c.y);
 let age=smoothstep(0.15,1.0,g.p.w)*(1.0-smoothstep(7.0+c.y*6.0-1.3,7.0+c.y*6.0,g.p.w));
 let height=smoothstep(0.25,0.55,g.p.y)*(1.0-smoothstep(2.1,3.4,g.p.y));
 let sz=(25.0+24.0*c.w)*(R.height/1080.0)*2.0/max(z,0.1);let offset=offsets[vertex];var out:V;
 out.pos=vec4f(x/max(z,0.01)/R.tanFov/R.aspect+offset.x*sz*2.0/R.width,y/max(z,0.01)/R.tanFov+offset.y*sz*2.0/R.height,0.,1.);
 if(z<0.05){out.pos=vec4f(2.,2.,0.,1.);}
 let warm=1.0-smoothstep(0.4,1.5,g.p.y);
 out.col=mix(vec3f(0.07,0.085,0.10),vec3f(0.21,0.075,0.018),warm);
 out.alpha=0.010*free*age*height*(0.2+0.8*outerSmokeProfile(g.p.xyz))*recycleFade(g.p.xyz)*D.smoke*D.gain*foregroundTransmission(rel)*readingTransmission(out.pos.xy);out.uv=offset;out.dist=length(rel);return out;
}
// Sparse world-space atmosphere plus one rare analytic ember trajectory.
// No extra particle storage or simulation clock is allocated.
@vertex fn atmosphereVs(@builtin(vertex_index) vertex:u32,@builtin(instance_index) instance:u32)->V{
 let offsets=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 let c=constants[(instance*43u)%u32(D.count)];
 var world=vec3f(0.0);var alpha=0.0;var size=1.0;var colour=vec3f(.10,.055,.024);
 if(instance<u32(D.atmosphereCount)){
  let layer=f32(instance%3u);let age=fract(c.z+D.atmosphereTime*(.020+.008*c.x));
  let a=c.y*6.2831853+D.atmosphereTime*(.017+.009*c.x);
  let radius=.9+layer*.85+c.w*.25;
  world=vec3f(cos(a)*radius,.25+age*2.65+.05*sin(a*3.0),sin(a)*radius);
  alpha=smoothstep(0.0,.12,age)*(1.0-smoothstep(.82,1.0,age))*.10*D.atmosphereGain;
  let rank=(f32(instance)+.5)/max(1.0,D.atmosphereCount);
  alpha*=1.0-smoothstep(D.atmosphereBudget,D.atmosphereBudget+.12,rank);
  size=1.0+layer*.55;colour=mix(vec3f(.10,.05,.018),vec3f(.065,.075,.09),age*.75);
 }else{
  let tail=f32(instance-u32(D.atmosphereCount));let age=D.accentAge-tail*.018;
  let u=clamp(age/1.45,0.0,1.0);let radius=.25+1.60*u;
  world=vec3f(D.accentX*radius,.14+1.05*sin(u*3.14159265),D.accentZ*radius);
  // A bright head leads a cooling, narrowing tail. Keep it readable above
  // the ground response without turning the whole plume into an accent.
  let trail=1.0-tail/18.0;
  alpha=select(0.0,min(.85,D.accentStrength*.80)*trail*(1.0-smoothstep(.85,1.0,u)),age>=0.0&&age<1.45);
  size=2.4+2.8*pow(trail,3.0);colour=mix(vec3f(.32,.065,.008),vec3f(1.0,.34,.055),pow(trail,4.0));
 }
 let rel=world-vec3f(R.camX,R.camY,R.camZ);let z=dot(rel,vec3f(R.fwdX,R.fwdY,R.fwdZ));
 let screen=vec2f(dot(rel,vec3f(R.rgtX,R.rgtY,R.rgtZ))/max(z,.01)/R.tanFov/R.aspect,dot(rel,vec3f(R.upX,R.upY,R.upZ))/max(z,.01)/R.tanFov);
 var clear=1.0;if(D.clearance>.01){clear=smoothstep(1.0-D.clearance*.8,1.0,readingTransmission(screen));}
 alpha*=smoothstep(.4,.9,z)*(1.0-smoothstep(6.0,8.0,z))*clear*D.gain;
 let pixels=clamp(size*R.height/720.0/max(z,.6),.65,3.5);let offset=offsets[vertex];var out:V;
 out.pos=vec4f(screen+offset*pixels*2.0/vec2f(R.width,R.height),0.0,1.0);if(z<.4||alpha<.00001){out.pos=vec4f(2.,2.,0.,1.);}
 out.col=colour;out.alpha=alpha;out.uv=offset;out.dist=length(rel);return out;
}
@fragment fn smokeFs(v:V)->@location(0) vec4f{
 let dd=vec2f(textureDimensions(depthT));let depth=textureLoad(depthT,vec2i(v.pos.xy/vec2f(R.width,R.height)*dd),0).x;
 if(v.dist>depth){discard;}
 let warped=v.uv+vec2f(sin(v.uv.y*8.0+v.dist*5.0),cos(v.uv.x*9.0-v.dist*4.0))*0.10;
 let r=dot(warped,warped);if(r>1.0){discard;}
 let intersection=smoothstep(0.0,0.12,depth-v.dist);
 let a=exp(-r*3.5)*(1.0-smoothstep(0.55,1.0,r))*v.alpha*intersection;
 return vec4f(v.col*a,a);
}`;
    const module=d.createShaderModule({label:'echoDustPaint',code});
    module.getCompilationInfo().then(i=>i.messages.filter(x=>x.type==='error').forEach(x=>console.error('Dust paint:',x.message)));
    this.layout=layoutFromWGSL(d,code,GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT);
    this.drawPipe=d.createRenderPipeline({layout:d.createPipelineLayout({bindGroupLayouts:[this.layout]}),vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba16float',blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'zero',dstFactor:'one',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
    this.atmospherePipe=d.createRenderPipeline({layout:d.createPipelineLayout({bindGroupLayouts:[this.layout]}),vertex:{module,entryPoint:'atmosphereVs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba16float',blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'zero',dstFactor:'one',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
    this.smokePipe=d.createRenderPipeline({layout:d.createPipelineLayout({bindGroupLayouts:[this.layout]}),vertex:{module,entryPoint:'smokeVs'},fragment:{module,entryPoint:'smokeFs',targets:[{format:'rgba16float',blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'zero',dstFactor:'one',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  }
  draw(enc,prof){
    const R=this.renderer,d=this.device;
    this.U.set({atmosphereBudget:this.peripheralBudget??1}).upload();
    if(this.depth!==R.depth){this.depth=R.depth;this.drawBg=d.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:R.U.buffer}},{binding:1,resource:{buffer:this.U.buffer}},{binding:2,resource:{buffer:this.state}},{binding:3,resource:{buffer:this.C}},{binding:4,resource:R.depth.createView()},{binding:5,resource:this.sim.S.createView()},{binding:6,resource:this.sim.S2.createView()},{binding:7,resource:R.lin},{binding:8,resource:{buffer:this.targets}}]});}
    const p=enc.beginRenderPass({timestampWrites:prof?.pass('smoke-and-dust-draw'),colorAttachments:[{view:R.hdr.createView(),loadOp:'load',storeOp:'store'}]});p.setBindGroup(0,this.drawBg);p.setPipeline(this.smokePipe);p.draw(6,Math.floor(this.count/4));p.setPipeline(this.drawPipe);p.draw(6,this.count);p.setPipeline(this.atmospherePipe);p.draw(6,campfireEnvironmentProfile(this.environmentQuality).count+18);p.end();
  }
}
