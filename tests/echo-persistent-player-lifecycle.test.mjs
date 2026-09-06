import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {reconcileEchoPlayerSlots} from '../src/domain/echo-player-pool.js';
import {mapEchoSourceWindowTime,echoSourceWindowAtEnd,echoSourceWindowPlaybackRate,normalizeEchoTransitionTimeMapping,planEchoPlaybackCorrection} from '../src/domain/echo-playback-sync.js';
const source=fs.readFileSync(new URL('../src/components/HapaEchosView.jsx',import.meta.url),'utf8');
const start=source.indexOf('function PersistentEchoABPlayers(');
const end=source.indexOf('\n  return (\n    <>',start);
const actual=source.slice(start,end)+'\nreturn {playerRefs,slotStateRef,preparationsRef,stageStatus,activeIndex};\n}';
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(budget=3){
 const hooks=[],effects=[],frames=new Map(),timers=new Map();let cursor=0,scheduled=false,current,result,next=1,mounted=true;
 const videos=Array.from({length:budget},()=>({src:'',currentSrc:'',currentTime:0,duration:6,readyState:4,videoWidth:640,seeking:false,paused:true,dataset:{},style:{},listeners:new Map(),loads:0,plays:0,
  load(){this.loads++;this.currentSrc=this.src;},removeAttribute(name){if(name==='src')this.src='';},
  play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;},
  addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);},
  requestVideoFrameCallback(fn){this.frame=fn;return 1;}
 }));
 const schedule=()=>{if(scheduled||!mounted)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(mounted)render(current);});};
 const context={Map,Set,Promise,Math,Number,String,Boolean,Array,Error,performance,globalThis:{},
  useRef:value=>{const i=cursor++;return hooks[i]??(hooks[i]={current:value});},
  useState:value=>{const i=cursor++;if(!hooks[i])hooks[i]={value};return [hooks[i].value,nextValue=>{const val=typeof nextValue==='function'?nextValue(hooks[i].value):nextValue;if(!Object.is(hooks[i].value,val)){hooks[i].value=val;schedule();}}];},
  useEffect:(effect,deps)=>{const i=cursor++;const prior=hooks[i];if(!prior||deps.some((v,j)=>!Object.is(v,prior.deps[j]))){hooks[i]={deps,cleanup:prior?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=effect();});}},
  window:{setTimeout:fn=>{const id=next++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=next++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)},
  ECHO_VIDEO_PLAYER_POOL_SIZE:budget,ECHO_VIDEO_PLAYER_INDICES:Array.from({length:budget},(_,i)=>i),ECHO_VIDEO_LOOKAHEAD_COUNT:budget-1,EMPTY_ECHO_CAMERA_KEYFRAMES:[],
  echoPresentedShotKey:shot=>JSON.stringify([shot?.media_id,shot?.start_sec]),shotMediaType:shot=>shot?.media_id?'video':'generated-visualizer',shotRuntimeUri:shot=>shot.media_uri,resolveMediaUri:uri=>uri,
  reconcileEchoPlayerSlots,mapEchoSourceWindowTime,echoSourceWindowAtEnd,echoSourceWindowPlaybackRate,normalizeEchoTransitionTimeMapping,planEchoPlaybackCorrection,
  estimateEchoAudibleClock:()=>({audibleSongTime:current.songTime}),
 };
 vm.createContext(context);vm.runInContext(actual+'\nglobalThis.component=PersistentEchoABPlayers;',context);
 function render(props){current=props;cursor=0;result=context.globalThis.component(props);result.playerRefs.current=videos;while(effects.length)effects.shift()();}
 const shot=(id,start=0)=>({media_id:id,media_uri:'/media/'+id+'.mp4',start_sec:start,end_sec:start+4});
 const update=(now,lookahead=[],time=now.start_sec)=>render({shot:now,lookaheadShots:lookahead,playing:true,songTime:time,clockRef:{current:time}});
 const release=async index=>{await settle();const callback=videos[index].frame;assert.ok(callback,'preparation requested a decoded frame');videos[index].frame=null;callback();await settle();};
 return {videos,shot,update,release,settle,get result(){return result;},unmount(){mounted=false;for(const hook of hooks)hook?.cleanup?.();},timers};
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
 vm.runInNewContext(tick,{audioRef:{current:audio},activeProjectRef:{current:{duration:213.68}},currentTimeRef:clock,echoPlaybackEngineRef:{current:{tick:(time)=>ticks.push(time)}},setIsPlaying:()=>{},setCurrentTime:()=>{}});
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
