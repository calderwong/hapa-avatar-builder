import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasFixture} from './echo-score-dust-fixture.mjs';
import {atlasVisualScore} from '../server/audio-atlas-visual-score.mjs';
import {buildEchoCampfirePreviewPacket} from '../src/domain/echo-campfire-preview.js';
import {readSavedCampfireDirection} from '../vendor/campfire-stage/src/echo/saved-campfire-direction.js';
import {createScoreChoreography} from '../vendor/campfire-stage/src/echo/score-choreography.js';
import {FireDust} from '../vendor/campfire-stage/src/echo/fire-dust.js';
import {dustParticleConstants} from '../vendor/campfire-stage/src/echo/vendor/echo-dust-swarm.js';
import {prepareEchoScorePlayback} from '../vendor/campfire-stage/src/echo/vendor/echo-visual-score.js';
import {createScoreDustPerformance} from '../vendor/campfire-stage/src/echo/vendor/echo-score-dust-performance.js';
function fixture(){const value=atlasVisualScore(atlasFixture());return buildEchoCampfirePreviewPacket({status:'atlas',validation:{ok:true},...value,settings:{pulse:1,seed:7}},'song-trip').packet;}
test('all cues develop, cover the whole song, preserve inputs and remain deterministic without beats',()=>{
 for(const sparse of [false,true]){
 const packet=fixture();if(sparse)packet.timeline.beats=[];const original=JSON.stringify(packet);
 const base=readSavedCampfireDirection(packet).direction,d=createScoreChoreography(packet,base);
 assert.equal(d.scenes[0].start,0);assert.equal(d.scenes.at(-1).end,packet.timeline.durationSeconds);
 for(const [i,s] of d.scenes.entries()){assert.ok(s.end>s.start);assert.ok(s.end-s.start<9);if(i)assert.equal(s.start,d.scenes[i-1].end);}
 assert.ok(d.scenes.length>packet.score.cues.length*3);
 for(let t=0;t<packet.timeline.durationSeconds;t+=.1){const v=d.at(t);for(const [k,n] of Object.entries(v))if(typeof n==='number')assert.ok(Number.isFinite(n),k);assert.ok(v.sceneRelease>=.67);assert.deepEqual(v,createScoreChoreography(packet,base).at(t));}
 assert.equal(JSON.stringify(packet),original);
 for(const s of d.scenes.slice(1))for(const k of ['sceneScale','sceneRelease','danceX','danceZ'])assert.ok(Math.abs(d.at(s.start-1e-6)[k]-d.at(s.start)[k])<.001,`${k} boundary`);
 }
});
test('saved quiet/ending settings and protected image cues retain authority',()=>{
 const packet=fixture();packet.score.motifs[0].imageRef={assetId:'song-owned-image'};
 const base={at:()=>({participation:0,release:.2,dustVisibility:.1,reach:.7,smoke:.4,motif:'open-ring',construction:'shell'})};
 const d=createScoreChoreography(packet,base);
 for(const s of d.scenes){const v=d.at(s.start+.01);assert.equal(v.participation,0);assert.equal(v.release,.2);assert.equal(v.dustVisibility,.1);assert.equal(v.reach,.7);assert.equal(v.formation,'ring');if(s.protectedTarget)assert.equal(s.copyKind,0);}
});
test('short cues never create reversed scenes',()=>{
 const packet=fixture();packet.timeline.durationSeconds=1;packet.score.cues=[{...packet.score.cues[0],start:0,end:.01},{...packet.score.cues[1],start:.01,end:1}];
 const d=createScoreChoreography(packet,{at:()=>({})});assert.equal(d.scenes.length,2);assert.equal(d.scenes[0].end,.01);assert.ok(d.at(.01).sceneKey.includes(packet.score.cues[1].id));
});
test('real score controller and FireDust stay finite and visibly held through cue boundaries',()=>{
 const packet=fixture(),playback=prepareEchoScorePlayback(packet.score,packet.timeline),direction=createScoreChoreography(packet,readSavedCampfireDirection(packet).direction),n=24,noop=()=>{},seen=new Set();
 const pass={setPipeline:noop,setBindGroup:noop,dispatchWorkgroups:noop,end:noop};
 const host=Object.assign(Object.create(FireDust.prototype),{count:n,seed:7,time:0,constants:dustParticleConstants(n,7),target:new Float32Array(n*3),normal:new Float32Array(n*3),param:new Float32Array(n),flex:new Float32Array(n),tint:new Uint8Array(n*3),device:{queue:{writeBuffer:noop,submit:noop},createCommandEncoder:()=>({beginComputePass:()=>pass,finish:noop})},U:{set(v){this.values=v;return this;},upload:noop},sim:{origin:[0,0,0],size:[1,2,1],reset:noop,step:noop,setParams:noop},sparks:{reset:noop,step:noop,burst:noop},renderer:{params:{}},playback,sampleBands:()=>new Float32Array(32),stageDirectionAt:direction.at,settings:{dust:1,smoke:1,formation:1},computeGroup:noop});
 const performance=createScoreDustPerformance({playback,count:n,settings:{prerollSeconds:0},createSwarm:()=>host});performance.advanceTo(0);
 for(let k=1;k<=Math.floor(packet.timeline.durationSeconds*60);k++){
  performance.advanceTo(k/60);seen.add(host.formation);
  for(const [field,v] of Object.entries(host.U.values))assert.ok(Number.isFinite(v),field);
  if(k>60)assert.ok(host.U.values.hold>.5,`Unexpected formation dropout at ${k/60}`);
 }
 assert.ok(seen.size>=5);
});

test('image targets release on stage replacement and cancelled setup does not proceed',async()=>{
 const {preparePictureTargets}=await import('../vendor/campfire-stage/src/echo/picture-targets.js');
 const motif={imageRef:{assetId:'local-logo',kind:'text',text:'Luna'}};
 const pictures=await preparePictureTargets({score:{motifs:[motif]},count:1,seed:7,phraseTargets:()=>({count:1})});
 assert.equal(pictures.targetsFor(motif).campfireKind,'picture');pictures.clear();pictures.clear();assert.equal(pictures.targetsFor(motif),null);
 const aborter=new AbortController();aborter.abort();await assert.rejects(preparePictureTargets({score:{motifs:[]},signal:aborter.signal}),/abort/i);
});

test('cast-library absence reaches the Campfire loader; malformed scores are not called loading',()=>{
 const packet=fixture(),dust={status:'atlas',...packet,settings:packet.playSettings,direction:{},validation:{ok:false,errors:[{code:'absent-asset',message:'Image asset is not in the cast library.'}]}};
 assert.ok(buildEchoCampfirePreviewPacket(dust,'song-trip').packet);
 dust.validation.errors.push({code:'missing-motif',message:'Motif is not defined.'});assert.throws(()=>buildEchoCampfirePreviewPacket(dust,'song-trip'),/Motif is not defined/);
});
