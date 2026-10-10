import {echoProtectedCameraFrame,echoCameraKeyframeAt} from "../src/domain/echo-camera-framing.js";
import {echoTimelineMediaInstances,hyperFramesMediaOpacityState} from "../src/domain/echo-media-presentation.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {reconcileEchoPlayerSlots} from '../src/domain/echo-player-pool.js';
import {mapEchoSourceWindowTime,echoSourceWindowAtEnd,echoSourceWindowPlaybackRate,normalizeEchoTransitionTimeMapping,planEchoPlaybackCorrection,echoDecodedPlaybackPhase} from '../src/domain/echo-playback-sync.js';
import {observeEchoPresentedFrames} from '../src/domain/echo-presentation-timing.js';
const source=fs.readFileSync(new URL('../src/components/HapaEchosView.jsx',import.meta.url),'utf8');
const start=source.indexOf('function PersistentEchoABPlayers(');
const end=source.indexOf('\n  return (\n    <>',start);
const actual=source.slice(start,end)+'\nreturn {playerRefs,slotStateRef,preparationsRef,stageStatus,activeIndex};\n}';
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(budget=3){
 const hooks=[],effects=[],frames=new Map(),timers=new Map();let cursor=0,scheduled=false,current,result,next=1,mounted=true,tickNow=performance.now()+1000;
 const videos=Array.from({length:budget},()=>({src:'',currentSrc:'',currentTime:0,duration:6,readyState:4,videoWidth:640,videoHeight:360,parentElement:{clientWidth:1920,clientHeight:1080},seeking:false,paused:true,dataset:{},style:{},listeners:new Map(),loads:0,plays:0,
  load(){this.loads++;this.currentSrc=this.src;},removeAttribute(name){if(name==='src')this.src='';},
  play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;},
  addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);},
  requestVideoFrameCallback(fn){this.frame=fn;return 1;},cancelVideoFrameCallback(){this.frame=null;}
 }));
 const schedule=()=>{if(scheduled||!mounted)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(mounted)render(current);});};
 const presentationSampleRef={current:null};let observerStop=null;
 const onPresentedMediaChange=binding=>{
  observerStop?.();observerStop=null;presentationSampleRef.current=null;
  if(binding?.presented&&binding.element)observerStop=observeEchoPresentedFrames({video:binding.element,
   getContext:()=>({shot:binding.shot,audio:{currentTime:current.songTime,playbackRate:1,paused:!current.playing},
    context:{state:'running',currentTime:20,getOutputTimestamp:()=>({contextTime:20,performanceTime:tickNow})}}),
   onSample:sample=>{presentationSampleRef.current={element:binding.element,sourceKey:binding.sourceKey,advancing:!binding.element.paused&&!binding.element.seeking,sample};}});
 };
 const context={Map,Set,Promise,Math,Number,String,Boolean,Array,Error,performance:{now:()=>tickNow},globalThis:{},
  useRef:value=>{const i=cursor++;return hooks[i]??(hooks[i]={current:value});},
  useState:value=>{const i=cursor++;if(!hooks[i])hooks[i]={value};return [hooks[i].value,nextValue=>{const val=typeof nextValue==='function'?nextValue(hooks[i].value):nextValue;if(!Object.is(hooks[i].value,val)){hooks[i].value=val;schedule();}}];},
  useEffect:(effect,deps)=>{const i=cursor++;const prior=hooks[i];if(!prior||deps.some((v,j)=>!Object.is(v,prior.deps[j]))){hooks[i]={deps,cleanup:prior?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=effect();});}},
  window:{setTimeout:fn=>{const id=next++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=next++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)},
  ECHO_VIDEO_PLAYER_POOL_SIZE:budget,ECHO_VIDEO_PLAYER_INDICES:Array.from({length:budget},(_,i)=>i),ECHO_VIDEO_LOOKAHEAD_COUNT:budget-1,EMPTY_ECHO_CAMERA_KEYFRAMES:[],
  echoPresentedShotKey:shot=>JSON.stringify([shot?.media_id,shot?.start_sec]),shotMediaType:shot=>shot?.media_contract?.type||(shot?.media_id?'video':'generated-visualizer'),shotRuntimeUri:shot=>shot.media_uri,resolveMediaUri:uri=>uri,
  echoTimelineMediaInstances,hyperFramesMediaOpacityState,echoCameraKeyframeAt,echoProtectedCameraFrame,resolveEchoShotSourceDimensions:()=>({isPortrait:false}),cameraMotionStyleForShot:(_shot,_time,_portrait,_index,crop)=>({presentation:{crop},transform:"scale(1)",objectPosition:"center center",transformOrigin:"center center"}),
  reconcileEchoPlayerSlots,mapEchoSourceWindowTime,echoSourceWindowAtEnd,echoSourceWindowPlaybackRate,normalizeEchoTransitionTimeMapping,planEchoPlaybackCorrection,echoDecodedPlaybackPhase,
  estimateEchoAudibleClock:()=>({audibleSongTime:current.songTime}),
 };
 vm.createContext(context);vm.runInContext(actual+'\nglobalThis.component=PersistentEchoABPlayers;',context);
 function render(props){current=props;cursor=0;result=context.globalThis.component(props);result.playerRefs.current=videos;while(effects.length)effects.shift()();}
 const shot=(id,start=0)=>({media_id:id,media_uri:'/media/'+id+'.mp4',start_sec:start,end_sec:start+4});
 const update=(now,lookahead=[],time=now.start_sec,extra={})=>render({shot:now,lookaheadShots:lookahead,playing:true,songTime:time,clockRef:{current:time},presentationSampleRef,onPresentedMediaChange,...extra});
 const release=async index=>{await settle();const callback=videos[index].frame;assert.ok(callback,'player requested a decoded frame');videos[index].frame=null;callback(tickNow,{mediaTime:videos[index].currentTime,expectedDisplayTime:tickNow});await settle();};
 const tickPlayback=()=>{tickNow+=40;for(const [id,callback] of [...frames])if(String(callback).includes('synchronize(now)')){frames.delete(id);callback(tickNow);}};
 return {videos,shot,update,release,settle,tickPlayback,setSongTime(time){current.songTime=time;current.clockRef.current=time;},tickPresentation(milliseconds=40){tickNow+=milliseconds;for(const [id,callback] of [...frames])if(String(callback).includes('presentationInputsRef.current')){frames.delete(id);callback(tickNow);}},get result(){return result;},unmount(){observerStop?.();mounted=false;for(const hook of hooks)hook?.cleanup?.();},timers};
}

test('pending next cue is reused and unrelated lookahead completion cannot pause the active player',async()=>{
 const f=fixture();const a=f.shot('a'),b=f.shot('b',4),c=f.shot('c',8);
 f.update(a,[b,c]);await f.release(1);
 const bIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['b',4]));
 const cIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['c',8]));
 assert.ok(bIndex>=0&&cIndex>=0);const bLoads=f.videos[bIndex].loads;
 f.update(b,[c]);await f.release(bIndex);
 assert.equal(f.result.activeIndex,bIndex);assert.equal(f.videos[bIndex].paused,false);
 assert.equal(f.videos[bIndex].loads,bLoads,'cue change must reuse its pending decoder');
 await f.release(cIndex);
 assert.equal(f.result.activeIndex,bIndex);assert.equal(f.videos[bIndex].paused,false);
 assert.equal(f.videos[cIndex].paused,true);f.unmount();
});

test('far seek waits for busy staging ownership, discards stale activation and retains the newest cue',async()=>{
 const f=fixture();const a=f.shot('a'),b=f.shot('b',4),c=f.shot('c',8),d=f.shot('d',12),e=f.shot('e',16);
 f.update(a,[b,c]);await f.release(1);
 const bIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['b',4]));
 f.update(d,[],12);await f.settle();
 assert.equal(f.result.activeIndex,1,'visible old player remains while both staging owners are busy');
 await f.release(bIndex);await f.settle();
 const dIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['d',12]));assert.ok(dIndex>=0);
 f.update(e,[],16);await f.release(dIndex);await f.settle();
 assert.notEqual(f.result.slotStateRef.current[f.result.activeIndex].key,JSON.stringify(['d',12]));
 const eIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['e',16]));await f.release(eIndex);
 assert.equal(f.result.activeIndex,eIndex);assert.equal(f.result.stageStatus,'ready');f.unmount();
});

test('natural-end transport does not truncate audio at rounded project metadata duration',()=>{
 const begin=source.indexOf('    const tick = () => {',source.indexOf('// Playback timer ticker fallback'));
 const finish=source.indexOf('\n      if (powerMode === "docked")',begin);
 const tick=source.slice(begin,finish)+'\n}; tick();';
 let paused=0;const audio={paused:false,currentTime:213.7,duration:213.75,pause(){paused++;}};
 const clock={current:0},ticks=[];
 vm.runInNewContext(tick,{audioPlaybackReceiptRef:{current:null},audioRef:{current:audio},activeProjectRef:{current:{duration:213.68}},currentTimeRef:clock,echoPlaybackEngineRef:{current:{tick:(time)=>ticks.push(time)}},setIsPlaying:()=>{},setCurrentTime:()=>{}});
 assert.equal(paused,0);assert.equal(audio.currentTime,213.7);assert.equal(clock.current,213.7);assert.deepEqual(ticks,[213.7]);
});

test('ended current clip holds without restarting and an explicit reverse seek releases it',async()=>{
 const f=fixture();const a={...f.shot('short'),end_sec:9};f.update(a);await f.release(1);
 const video=f.videos[1];video.currentTime=6;video.paused=true;video.ended=true;const plays=video.plays;
 f.update(a,[],5.8);await f.settle();
 assert.equal(video.plays,plays,"rate adjustment can end the source before the expected terminal sample");
 f.update(a,[],7);await f.settle();
 assert.equal(video.plays,plays,'naturally ended clip must not restart at zero');assert.equal(video.paused,true);
 f.update(a,[],.1);await f.settle();
 assert.equal(video.currentTime,.1);assert.ok(video.plays>plays,'a real reverse seek resumes this clip');f.unmount();
});

test('startup phase remains unconsumed until an advancing decoded frame arrives',async()=>{
 const f=fixture(),a=f.shot('delayed');f.update(a);await f.release(1);
 const video=f.videos[1];video.currentTime=.013;
 f.setSongTime(.22);f.tickPlayback();
 assert.equal(video.currentTime,.013,'before the live frame, do not seek a decoder that has only resolved play()');
 assert.equal(video.playbackRate,1.04);
 await f.release(1);f.tickPlayback();
 assert.equal(video.currentTime,.22,'the first live decoded frame acquires phase against the fresh audio clock');
 f.setSongTime(.3);f.tickPlayback();
 assert.equal(video.currentTime,.22,'normal following resumes after the one acquisition seek');
 f.unmount();assert.equal(video.frame,null);
});

test('paused or stale acquisition callbacks cannot consume a new cue phase',async()=>{
 const f=fixture(),a=f.shot('a'),b=f.shot('b',4);f.update(a,[b]);await f.release(1);
 const old=f.videos[1].frame;assert.ok(old);
 f.update(b,[],4);await f.settle();
 old(performance.now(),{mediaTime:0});
 const index=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['b',4]));await f.release(index);
 const video=f.videos[index];video.paused=true;await f.release(index);
 f.setSongTime(4.2);f.tickPlayback();assert.equal(video.currentTime,0);
 assert.equal(video.paused,false);
 await f.release(index);f.tickPlayback();assert.ok(Math.abs(video.currentTime-.2)<1e-9);
 f.unmount();
});


test('prepared incoming dissolve uses absolute song time, holds source origin, and reverses without a CSS clock',async()=>{
 const f=fixture();const a=f.shot('a'),b={...f.shot('b',4),transition:'crossfade'};
 f.update(a,[b]);await f.release(1);
 const bi=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['b',4]));
 await f.release(bi);
 f.setSongTime(3.7);f.tickPresentation();
 assert.ok(Math.abs(Number(f.videos[bi].style.opacity)-(1/3))<1e-6);
 assert.equal(f.videos[bi].currentTime,0);
 assert.equal(f.videos[bi].paused,true);
 assert.equal(Number(f.videos[f.result.activeIndex].style.opacity),1);
 f.setSongTime(3);f.tickPresentation();assert.equal(Number(f.videos[bi].style.opacity),0);
 f.setSongTime(3.7);f.tickPresentation();assert.ok(Math.abs(Number(f.videos[bi].style.opacity)-(1/3))<1e-6);
 f.update(b,[],4);await f.settle();f.tickPresentation();
 assert.equal(f.result.activeIndex,bi);assert.equal(Number(f.videos[bi].style.opacity),1);
 f.unmount();
});

test('image current cue retains and prepares the next video without replacing the pool',async()=>{
 const f=fixture();const a={...f.shot('image'),media_contract:{type:'image'}},b=f.shot('b',4);
 f.update(a,[b]);await f.settle();
 const bi=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['b',4]));
 assert.ok(bi>=0);await f.release(bi);const loads=f.videos[bi].loads;
 f.update(b,[],4);await f.settle();
 assert.equal(f.result.activeIndex,bi);assert.equal(f.videos[bi].loads,loads);
 f.unmount();
});


test('actual player loop applies each incoming protected crop and clears it on a legacy pooled shot',async()=>{
 const f=fixture();const a=f.shot('a'),b={...f.shot('b',4),transition:'crossfade'},c=f.shot('c',8);
 const crops=[{x:.1,y:.1,width:.8,height:.8,cameraModel:'protected-v2',fit:'cover'},
  {x:0,y:.25,width:1,height:.5,cameraModel:'protected-v2',fit:'contain'}];
 const showGraph={tracks:[{cards:[a,b].map((s,i)=>({media:{id:s.media_id},startSeconds:s.start_sec,endSeconds:s.end_sec,
  cameraKeyframes:[{atSeconds:s.start_sec,crop:crops[i],cameraPathId:'path-'+i}]}))}]};
 const extra={showGraph,style:{width:'100%',height:'100%',objectFit:'cover'}};
 f.update(a,[b,c],0,extra);await f.release(1);
 const bIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['b',4]));await f.release(bIndex);
 f.setSongTime(3.7);f.tickPresentation();
 for(const [shot,crop] of [[a,crops[0]],[b,crops[1]]]){
  const index=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify([shot.media_id,shot.start_sec]));
  const video=f.videos[index];const expected=echoProtectedCameraFrame({sourceWidth:640,sourceHeight:360,outputWidth:1920,outputHeight:1080,crop});
  assert.equal(video.dataset.echoProtectedCamera,'true');
  assert.equal(video.style.clipPath,expected.style.clipPath);
  assert.equal(video.style.width,expected.style.width);
  assert.equal(video.style.left,expected.style.left);
 }
 const cIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['c',8]));await f.release(cIndex);
 f.update(c,[],8.5,extra);await f.settle();f.tickPresentation();
 const d=f.shot('d',12);f.update(d,[],12.5,extra);await f.settle();
 const dIndex=f.result.slotStateRef.current.findIndex(slot=>slot.key===JSON.stringify(['d',12]));
 assert.equal(f.videos[dIndex].dataset.echoProtectedCamera,'true','the reuse target previously held a protected shot');
 f.videos[dIndex].listeners.get('seeked')?.();await f.settle();
 await f.release(dIndex);f.tickPresentation();
 const video=f.videos[f.result.activeIndex];assert.equal(video.dataset.echoProtectedCamera,undefined);
 assert.equal(video.style.width,'100%');assert.equal(video.style.objectFit,'cover');assert.equal(video.style.clipPath||'','');f.unmount();
});

 test('presentation follows live song frames at 75Hz and skips duplicate output frames',async()=>{
 const f=fixture(),a=f.shot('cadence'),audio={currentTime:.04,paused:false,playbackRate:1};
 f.update(a,[],0,{audioRef:{current:audio}});await f.release(1);
 const video=f.videos[f.result.activeIndex];let writes=0,opacity=video.style.opacity;
 Object.defineProperty(video.style,'opacity',{get:()=>opacity,set:value=>{opacity=value;writes++;},configurable:true});
 audio.currentTime=.06;f.tickPresentation(1000/75);
 assert.equal(writes,0,'same song frame does not repeat DOM presentation');
 audio.currentTime=.07;f.tickPresentation(1000/75);
 assert.equal(writes,1,'next output frame is not skipped by a wall-time throttle');
 assert.equal(Number(opacity),hyperFramesMediaOpacityState(echoTimelineMediaInstances([a]),0,2/30).alpha,'live master wins over stale parent clock');
 audio.currentTime=.09;f.tickPresentation(1000/75);assert.equal(writes,1);f.unmount();
});
