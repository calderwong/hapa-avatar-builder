import test from 'node:test';
import assert from 'node:assert/strict';
import {mapEchoSourceWindowTime,echoSourceWindowAtEnd} from '../src/domain/echo-playback-sync.js';
import {reconcileEchoPlayerSlots} from '../src/domain/echo-player-pool.js';

test('ordinary and trimmed clips hold at the same reachable end used by the mapper',()=>{
 for(const options of [{durationSeconds:5.033008},{durationSeconds:20,sourceInSeconds:4,sourceOutSeconds:6},{durationSeconds:.12}]){
  const first=mapEchoSourceWindowTime({...options,elapsedSeconds:0,loop:false});
  const terminal=mapEchoSourceWindowTime({...options,elapsedSeconds:100,loop:false});
  assert.equal(echoSourceWindowAtEnd({...options,elapsedSeconds:terminal-first-.005}),false);
  assert.equal(echoSourceWindowAtEnd({...options,elapsedSeconds:terminal-first}),true);
  assert.equal(echoSourceWindowAtEnd({...options,elapsedSeconds:100}),true);
 }
 assert.equal(echoSourceWindowAtEnd({durationSeconds:0,elapsedSeconds:100}),false);
});

test('authored time mapping holds only at its declared last sample and reverses on seek',()=>{
 const options={durationSeconds:8,sourceInSeconds:0,sourceOutSeconds:5,cueDurationSeconds:2,timeMapping:{schemaVersion:'hapa.echo.transition-time-map.v1',mode:'fit-source-once-to-cue',sourceInSeconds:0,sourceOutSeconds:5,sourceDurationSeconds:5,cueDurationSeconds:2,cueSampleSpanSeconds:2-1/30,outputFps:30,playbackRate:5/(2-1/30),valid:true,reachesDeclaredLastFrame:true}};
 assert.equal(echoSourceWindowAtEnd({...options,elapsedSeconds:1.9}),false);
 assert.equal(echoSourceWindowAtEnd({...options,elapsedSeconds:2-1/30}),true);
 assert.equal(echoSourceWindowAtEnd({...options,elapsedSeconds:0}),false);
});

test('lookahead keeps every requested ready lease and never reassigns an unrelated busy slot',()=>{
 const slots=[{key:'current'},{key:'next'},{key:'obsolete'},{key:'later'},{key:'busy-old'}];
 const leases=[{assetKey:'next',lookahead:1},{assetKey:'later',lookahead:2},{assetKey:'new',lookahead:3}];
 const value=reconcileEchoPlayerSlots(slots,leases,0,{busySlotIndices:[4]});
 assert.deepEqual(value.assignments.map(x=>[x.lease.assetKey,x.slotIndex]),[['next',1],['later',3],['new',2]]);
 const full=reconcileEchoPlayerSlots(slots,[...leases,{assetKey:'newest',lookahead:4}],0,{busySlotIndices:[4]});
 assert.equal(full.assignments.some(x=>x.slotIndex===4),false);
 const released=reconcileEchoPlayerSlots(slots,[...leases,{assetKey:'newest',lookahead:4}],0);
 assert.equal(released.assignments.find(x=>x.lease.assetKey==='newest').slotIndex,4);
});

test('cue identities containing URI fragments remain distinct when explicitly requested',()=>{
 const first=JSON.stringify(['asset','/clip.mp4#crop',0,4]);
 const next=JSON.stringify(['asset','/clip.mp4#crop',4,8]);
 const result=reconcileEchoPlayerSlots([{key:first},{key:next},{key:''}],[{assetKey:next,lookahead:0}],0,{keyOf:String});
 assert.equal(result.assignments[0].slotIndex,1);
 assert.equal(result.assignments[0].reused,true);
});
