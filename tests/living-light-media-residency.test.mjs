import test from 'node:test';
import assert from 'node:assert/strict';
import {installLivingLightMedia} from '../src/living-light/media-surfaces.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {newJourneyDraft,editJourneyDraft} from '../src/domain/living-light-journey.js';
import {livingLightCutMedia,LIVING_LIGHT_MEDIA_SCHEMA} from '../src/domain/living-light-media.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {compileLivingLightNativeTour} from '../src/domain/living-light-native-tour.js';
const registry=createLivingLightRegistry(),thing=id=>registry.entries.find(t=>t.source.moduleId===id),ref=t=>({thingId:t.thingId,revisionId:t.revisionId});
function route(){
 let draft=newJourneyDraft({songId:'song:fixture',title:'Residency fixture',durationUs:60e6,thing:thing('solar-reliquary'),mode:'tour'},registry);
 for(const [destination,tunnel] of [['tidal-observatory','fractal-loom'],['resonance-vault','silken-current']])draft=editJourneyDraft(draft,{type:'add',thingRef:ref(thing(destination)),bridgeRef:ref(thing(tunnel))},registry);
 const clips=livingLightCutMedia({song_id:'song:fixture',active_direction_script_variant:{id:'cut:fixture'},timeline:[{id:'shot:tunnel',media_id:'media:tunnel',media_uri:'/media/tunnel.mp4'},{id:'shot:portal',media_id:'media:portal',media_uri:'/media/portal.mp4'}]});
 for(const [index,surface,row] of [[0,'wall-left',draft.schedule[1]],[1,'portal',draft.schedule[0]]]){
  draft=editJourneyDraft(draft,{type:'media',instanceId:row.instanceId,surfaceId:surface,placement:{schemaVersion:LIVING_LIGHT_MEDIA_SCHEMA,enabled:true,surfaceRef:{instanceId:row.instanceId,surfaceId:surface},mediaRef:clips[index].ref,trim:{inUs:1e6,outUs:4e6},loopPolicy:'loop',brightness:.9}},registry);
 }
 return {...draft,journeyId:'journey:fixture',revisionId:'revision:fixture',parentRevisionId:null};
}
const saved=route();
function fixture(activate=true){
 const videos=[],textures=new Set();let notifications=0;
 const gl=new Proxy({createTexture(){const t={};textures.add(t);return t;},deleteTexture(t){assert(textures.delete(t));}},{get:(o,k)=>o[k]||(()=>{})});
 const renderer={gl,state:{},drawScene(){return {};}};
 const adapter=installLivingLightMedia({renderer,native:{},journey:structuredClone(saved),sources:saved.mediaSlots.filter(s=>s.enabled).map((s,i)=>({ref:s.mediaRef,uri:`fixture:${i}`})),onChange(){notifications++;},videoFactory(){
  const listeners=new Map(),past=new Map();
  const video={paused:true,seeking:false,readyState:2,duration:8,videoWidth:640,videoHeight:360,currentTime:0,removed:false,cleared:false,
   addEventListener(k,f){listeners.set(k,f);past.set(k,f);},removeEventListener(k){listeners.delete(k);},
   pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},load(){},remove(){this.removed=true;},removeAttribute(k){if(k==='src'){this.cleared=true;delete this.src;}},listeners,past};
  videos.push(video);return video;
 }});
 if(activate)adapter.sync({visualUs:0,playing:false});
 return {adapter,videos,textures,notifications:()=>notifications,
  sync(visualUs,frame){adapter.sync({visualUs,frame,playing:false,reducedMotion:false});},
  dispose(){adapter.dispose();assert.equal(textures.size,0);assert(videos.every(v=>v.paused&&v.removed&&v.cleared&&v.listeners.size===0));}};
}
test('jump abandons both painted resources; reverse return reacquires exact sources and ignores stale callbacks',()=>{
 const f=fixture();try{
  assert.equal(f.videos.length,2);f.videos.forEach(v=>v.listeners.get('loadeddata')());assert.equal(f.textures.size,2);
  assert.equal(f.adapter.diagnostics().filter(d=>d.required).length,1);
  const last=saved.schedule.at(-1);f.sync(last.startUs);
  assert.equal(f.textures.size,0);assert(f.videos.every(v=>v.removed));assert(f.adapter.diagnostics().every(d=>!d.resident&&!d.required));
  f.sync(0);assert.equal(f.videos.length,4);const before=f.notifications();
  for(const old of f.videos.slice(0,2)){old.past.get('loadeddata')();old.past.get('error')();old.past.get('seeked')();}
  assert.equal(f.notifications(),before);assert.equal(f.textures.size,0);assert(f.adapter.diagnostics().every(d=>d.status==='loading'));
  f.videos.slice(2).forEach(v=>v.listeners.get('loadeddata')());assert.equal(f.textures.size,2);
 }finally{f.dispose();}
});
test('native passage phase releases outgoing media when only tunnel and destination remain',()=>{
 const f=fixture(),bridge=saved.schedule.find(r=>r.fromInstanceId);try{
  f.sync(bridge.startUs,{active:true,u:0,entry:.2});assert.equal(f.adapter.diagnostics().filter(d=>d.required).length,2);
  f.sync(bridge.startUs+2e6,{active:true,u:.3,entry:.2});
  const state=f.adapter.diagnostics();assert.equal(state.filter(d=>d.resident).length,1);
  assert.equal(state.find(d=>d.surface.surfaceId==='portal').status,'idle');assert.equal(state.find(d=>d.surface.surfaceId==='wall-left').required,true);
  f.sync(bridge.endUs);assert(f.adapter.diagnostics().every(d=>!d.resident&&!d.required));
 }finally{f.dispose();}
});
test('quiet passage only requires its two endpoint Locations',()=>{
 const f=fixture(),bridge=saved.schedule.find(r=>r.fromInstanceId);try{
  f.sync(bridge.startUs,{active:true,quiet:true});const state=f.adapter.diagnostics();
  assert.equal(state.find(d=>d.surface.surfaceId==='wall-left').resident,false);
  assert.equal(state.find(d=>d.surface.surfaceId==='portal').required,true);
 }finally{f.dispose();}
});
test('late rejected playback from an evicted video cannot poison its replacement',async()=>{
 const f=fixture();try{
  const old=f.videos.find(v=>v.src==='fixture:1');old.listeners.get('loadeddata')();
  let reject;old.play=()=>new Promise((_r,j)=>{reject=j;});
  f.adapter.sync({visualUs:0,playing:true});old.listeners.get('seeked')();f.adapter.sync({visualUs:0,playing:true});
  assert.equal(typeof reject,'function');f.sync(saved.schedule.at(-1).startUs);f.sync(0);
  await Promise.resolve();const before=f.notifications();reject(Object.assign(Error('late denial'),{name:'NotAllowedError'}));await Promise.resolve();await Promise.resolve();
  assert.equal(f.notifications(),before);assert(!f.adapter.diagnostics().some(d=>d.message.includes('denied')));
 }finally{f.dispose();}
});

test('residency notifications coalesce outside rendering and stop after disposal',async()=>{
 const f=fixture(false);
 f.sync(0);f.sync(0);assert.equal(f.notifications(),0);await Promise.resolve();assert.equal(f.notifications(),1);
 f.sync(0);await Promise.resolve();assert.equal(f.notifications(),1);
 f.sync(saved.schedule.at(-1).startUs);await Promise.resolve();assert.equal(f.notifications(),2);
 f.sync(0);f.dispose();await Promise.resolve();assert.equal(f.notifications(),2);
});
test('preparation creates no decoders until the exact first frame requests them',()=>{
 const f=fixture(false);try{
  assert.equal(f.videos.length,0);f.sync(saved.schedule.at(-1).startUs);assert.equal(f.videos.length,0);
  f.sync(0);assert.equal(f.videos.length,2);assert.equal(f.adapter.diagnostics().filter(d=>d.required).length,1);
 }finally{f.dispose();}
});
test('an inactive Director gap releases painted media while allowing exact later reacquisition',()=>{
 const f=fixture();try{
  f.videos.forEach(v=>v.listeners.get('loadeddata')());assert.equal(f.textures.size,2);
  f.adapter.idle();assert.equal(f.textures.size,0);assert(f.adapter.diagnostics().every(d=>!d.resident&&!d.required));
  f.adapter.idle();assert.equal(f.videos.length,2);f.sync(0);assert.equal(f.videos.length,4);
  assert.equal(f.adapter.diagnostics().filter(d=>d.required).length,1);
 }finally{f.dispose();}
});
test('residency uses the actual native phase through forward and reverse passage boundaries',()=>{
 const f=fixture(),native=createNativeNamespace();
 const tour=compileLivingLightNativeTour(saved,{registry,native,durationUs:60e6});
 const state=native.HapaCore.initialState(tour.score);Object.assign(state,{director:native.HapaDirector.create(tour.score),passages:tour.passages,reliquary:native.HapaReliquary.defaults(),flow:{resonance:true,braid:true,edge:true},showMedia:false,videoWeave:false});native.HapaHorizons.init(state);state.reliquary.journey={...native.HapaJourney.defaults(),mode:'standard',family:'auto',seed:saved.seed};state.world=tour.passages.baseWorld;
 const cache=new native.HapaCore.FeatureCache(tour.score),bridge=saved.schedule[1];
 const times=[0,bridge.startUs,bridge.startUs+2e6,bridge.endUs-1,bridge.endUs,saved.schedule.at(-1).startUs];
 const sample=time=>{const frame=native.HapaCurrents.route(cache,state,time/1e6);f.sync(time,frame);return f.adapter.diagnostics().map(d=>({surface:d.surface,required:d.required,resident:d.resident}));};
 try{const forward=times.map(sample);for(let i=times.length-1;i>=0;i--)assert.deepEqual(sample(times[i]),forward[i]);assert(forward.at(-1).every(d=>!d.resident));}
 finally{f.dispose();}
});
