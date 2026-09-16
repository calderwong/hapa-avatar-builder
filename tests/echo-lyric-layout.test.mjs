import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEchoLyricObstacles,chooseEchoLyricPlacement,echoLyricPresentation,fitEchoLyricWordMotion} from '../src/domain/echo-lyric-presentation.js';
import {echoLyricWordTimingPolicy} from '../src/domain/echo-lyric-template-runtime.js';
import {hashEchoLyricOverlayExecutionContract} from '../src/domain/hyperframes-show-compiler.js';
const profile={width:1920,height:1080},hash='a'.repeat(64);
const media=()=>[{startSeconds:0,endSeconds:5,media:{imageShot:{original:{sha256:hash,width:1920,height:1080},protectionStatus:'source-bound',protectionEvidence:{status:'source-bound',sourceHash:hash},protectedRegions:[{id:'face',kind:'face',rect:{x:.4,y:.6,width:.2,height:.2}}]}},cameraKeyframes:[{crop:{x:0,y:0,width:1,height:1,cameraModel:'protected-v2',fit:'cover'}},{crop:{x:0,y:0,width:1,height:1,cameraModel:'protected-v2',fit:'cover'}}]}];
test('caption obstacles preserve source-bound face/bubble geometry through actual protected camera projection',()=>{
 const rows=prepareEchoLyricObstacles(media(),profile);assert.equal(rows[0].status,'source-bound-camera-envelope');const r=rows[0].rectangles[0];assert.deepEqual([r.x,r.y,r.width,r.height],[.4,.6,.20000000000000007,.20000000000000007]);assert.equal(r.sourceHash,hash);
 const layout=chooseEchoLyricPlacement({presentation:echoLyricPresentation({position:'bottom-center'},profile),panelHeight:180,obstacles:rows[0].rectangles});assert.equal(layout.status,'clear');assert.ok(layout.y<200);
 const bad=media();bad[0].media.imageShot.protectionEvidence.sourceHash='b'.repeat(64);assert.equal(prepareEchoLyricObstacles(bad,profile)[0].status,'source-or-camera-unverified');assert.equal(prepareEchoLyricObstacles(bad,profile)[0].rectangles.length,0);
});
test('moving camera envelope includes all supplied keyframes and rejects unsupported scaling corridors',()=>{
 const input=media();input[0].cameraKeyframes=[{crop:{x:0,y:0,width:.8,height:.8,cameraModel:'protected-v2',fit:'cover'}},{crop:{x:.1,y:.1,width:.8,height:.8,cameraModel:'protected-v2',fit:'cover'}}];
 const r=prepareEchoLyricObstacles(input,profile)[0].rectangles[0];assert.ok(r.x<=.3750001&&r.x+r.width>=.75-1e-8);assert.ok(r.y<=.6250001&&r.y+r.height>=1-1e-8);
 input[0].cameraKeyframes[1].crop.width=.7;assert.equal(prepareEchoLyricObstacles(input,profile)[0].status,'source-or-camera-unverified');
});
test('impossible caption avoidance is explicit and custom safe margins change execution identity',()=>{
 const presentation=echoLyricPresentation({safeArea:{titleInset:.15,lyricBottom:.2}},profile);const r=chooseEchoLyricPlacement({presentation,panelHeight:220,obstacles:[{x:0,y:0,width:1,height:1}]});assert.equal(r.status,'protected-region-collision');assert.ok(r.x>=1920*.15);assert.ok(r.y>=1080*.15);
 assert.notEqual(hashEchoLyricOverlayExecutionContract({safeArea:{titleInset:.15}}),hashEchoLyricOverlayExecutionContract({safeArea:{titleInset:.1}}));
});
test('word animation remains inside its cached rectangle without layout reads',()=>{
 const value=fitEchoLyricWordMotion({scale:1.16,rotateDegrees:8,translateX:-30,translateY:30},{x:0,y:0,width:500,height:60},{x:-20,y:-14,width:540,height:88});assert.match(value,/translate\(/);assert.ok(!value.includes('NaN'));
});
test('out-of-phrase, overlapping and explicitly unaligned words use honest phrase fallback',()=>{
 const line={start:1,end:3,words:[{word:'hold',start:1,end:2,confidence:.9},{word:'on',start:2,end:3,confidence:.9}]};assert.equal(echoLyricWordTimingPolicy(line).mode,'word');
 for(const [patch,reason]of [[{start:1.9},'overlapping-word-intervals'],[{end:3.1},'word-outside-phrase'],[{matched:false},'word-unaligned']]){const copy=structuredClone(line);Object.assign(copy.words[1],patch);assert.equal(echoLyricWordTimingPolicy(copy).reason,reason)}
});
test('direct STT anchors can animate words without pretending they are syllable exact',()=>{
 const line={start:1,end:3,words:[{word:'hold',start:1,end:2,matched:true},{word:'on',start:2,end:3,matched:true}]};const policy=echoLyricWordTimingPolicy(line,'dear-papa-playlist-lyric-timing');assert.equal(policy.mode,'word');assert.equal(policy.reason,'direct-stt-word-anchors');assert.match(policy.label,/not syllable exact/i);
});
