
/* Transient elemental proof view on the existing renderer/context. Never serialized.
 * Fixed camera, constant transfer, no bloom, particles, media, or moving light in Body-only.
 */
'use strict';
window.HapaElementVisuals=function(r){
 const oldRoute=r.routeRender.bind(r),oldFinish=r.finishScene.bind(r);
 // Submission telemetry only: performance.now does not drive any visual motion.
 const timed=['drawWater','drawWind','drawFireLayer'];r.elementPassTimes={};
 for(const name of timed){const old=r[name].bind(r);r[name]=(...args)=>{const begin=performance.now();try{return old(...args);}finally{const q=r.elementPassTimes[name]||(r.elementPassTimes[name]={calls:0,cpuSubmissionMs:0});q.calls++;q.cpuSubmissionMs+=performance.now()-begin;}};}
 const oldRender=r.render.bind(r);r.render=(...args)=>{r.elementPassTimes={};return oldRender(...args);};
 const worlds={water:'rain-court',wind:'confluence-court',fire:'hearth-of-three',together:'confluence-court'};
 const poses={water:{eye:[0,-.38,7.4],forward:[0,-.20,-1],fov:57},wind:{eye:[7,2.7,10],forward:[-7,-2,-12],fov:58},fire:{eye:[3.8,1.25,6.2],forward:[-3.8,-.75,-6.2],fov:51},together:{eye:[7,2.7,10],forward:[-7,-2,-12],fov:58}};
 r.elementInspect=(mode,element='together',options={})=>{
  if(mode==='off'||mode===false){delete r.state._elementInspect;return null;}
  if(!Object.hasOwn(worlds,element))throw Error('Unknown inspection element');
  if(!['body','rest','freeze','baseline','beauty'].includes(mode))throw Error('Unknown elemental inspection mode');
  const prior=r.state._elementInspect,keep=prior?.element===element;
  const q=keep?{...prior}:{element,body:false,rest:false,freeze:false,baseline:false,time:r.lastTime||0,world:worlds[element],palette:element==='water'?'water-moonstone':element==='fire'?'hearth-twilight':'confluence-dusk',pose:structuredClone(poses[element])};
  if(mode==='beauty')Object.assign(q,{body:false,rest:false,freeze:false,baseline:false});else q[mode]=!q[mode];
  if(mode==='freeze'&&q.freeze)q.time=r.lastTime||0;
  if(options.world){if(!HapaCore.worlds.some(w=>w.id===options.world))throw Error('Unknown inspection world');q.world=options.world;}
  if(options.style){if(!['tidal-conduit','pressure-passage','ember-passage'].includes(options.style))throw Error('Unknown elemental passage');q.style=options.style;q.pose={eye:[0,.2,5.5],forward:[0,0,1],fov:58};}
  if(options.pose){const p=options.pose;if(![...p.eye,...p.forward,p.fov].every(Number.isFinite)||Math.hypot(...p.forward)<.001||p.fov<20||p.fov>100)throw Error('Invalid inspection camera');q.pose=structuredClone(p);}
  r.state._elementInspect=q;return structuredClone(q);
 };
 r.routeRender=t=>{
  const pr=r.state._elementInspect;if(!pr)return oldRoute(t);
  const saved=r.state,st={...saved,world:pr.world,palette:pr.palette,showMedia:false,_hideMedia:true,_noPortal:true,_pose:pr.pose,flow:{...saved.flow,edge:!pr.body&&saved.flow?.edge},effects:{...saved.effects,dust:false,bloom:!pr.body&&saved.effects.bloom,flare:false,finish:!pr.body&&saved.effects.finish},reliquary:{...saved.reliquary,water:{...saved.reliquary.water},wind:{...saved.reliquary.wind},fire:{...saved.reliquary.fire}}};
  if(pr.element==='water'){st.reliquary.wind.visible=false;st.reliquary.fire.enabled=false;}
  if(pr.element==='fire')st.reliquary.wind.visible=false;
  if(pr.element==='wind'){st.reliquary.fire.enabled=false;st.reliquary.water.enabled=false;}
  if(pr.style){st._tunnel=true;st._bridge={id:'element-proof',style:pr.style,length:42,start:0,duration:r.score.duration,arrival:r.score.duration,entry:.18};}
  r.state=st;try{r.routeTelemetry={active:false,stage:'fixed camera / elemental inspection',proof:true,style:pr.style||pr.world};const f=r.drawScene(t);f.routeWorld='Elemental inspection / '+pr.element;f.elementInspection=structuredClone(pr);return f;}finally{r.state=saved;}
 };
 r.finishScene=(t,f)=>{
  if(r.state._elementInspect?.body){r.full(r.programs.geometryCopy,null,{uImage:0,uResolution:[r.width,r.height]},[r.scene.textures[0]]);return;}
  return oldFinish(t,f);
 };
 return true;
};

