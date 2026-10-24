import test from 'node:test';import assert from 'node:assert/strict';
import {echoLyricHasManualTiming,echoLyricSourceMatches,echoLyricRegistryTrackId,echoLyricDuplicateRegistryIds} from '../src/domain/echo-lyric-sync-safety.js';
test('mass sync protects each supported manual timing marker',()=>{
 for(const field of ['locked','manual_locked','timingCorrection']){
 assert.equal(echoLyricHasManualTiming({timed_lyrics:[{[field]:true}]}),true);
 assert.equal(echoLyricHasManualTiming({lyricTimings:[{words:[{[field]:true}]}]}),true);
 }assert.equal(echoLyricHasManualTiming({lyric_timing_manual_edit:{}}),true);
});
test('source preservation requires every exact lyric line in order',()=>{
 const lyrics='[Verse]\nFirst—line!\nSecond line';assert.equal(echoLyricSourceMatches([{text:'First—line!'},{text:'Second line'}],lyrics),true);
 assert.equal(echoLyricSourceMatches([{text:'First—line!'}],lyrics),false);assert.equal(echoLyricSourceMatches([{text:'First line'},{text:'Second line'}],lyrics),false);
});

test('timing preparation and sync use the canonical lineage ID for distinct recorded takes',()=>{
 const first={lineage:{registryTrackId:'take-a'},audio:{registryTrackId:'take-a'}}, second={lineage:{registryTrackId:'take-b'},audio:{registryTrackId:'take-a'}};
 assert.equal(echoLyricRegistryTrackId(first),'take-a');assert.equal(echoLyricRegistryTrackId(second),'take-b');
 assert.equal(echoLyricRegistryTrackId({audio:{registryTrackId:'legacy'}}),'legacy');assert.equal(echoLyricRegistryTrackId({}),'');
});

test('catalog preparation detects a shared output identity before either candidate can overwrite the other',()=>{
 assert.deepEqual([...echoLyricDuplicateRegistryIds([{lineage:{registryTrackId:'a'}},{audio:{registryTrackId:'a'}},{},{lineage:{registryTrackId:'b'},audio:{registryTrackId:'a'}}])],['a']);
});
