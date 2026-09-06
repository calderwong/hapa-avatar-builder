import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEchoCatalogObservation as project} from '../server/echo-catalog-observations.mjs';
import {echoObservationsInSourceWindow as windowed} from '../src/domain/echo-observation-window.js';
const sha='a'.repeat(64),fingerprint=JSON.stringify({ahash:'a',dhash:'b',phash:'c',lumaMean:.2,lumaStd:.1});
const fixture=()=>({video:{media_id:'m',sha256:sha,duration_sec:10},frame:{frame_id:'f',media_id:'m',marker:'mid',at_seconds:5,updated_at:'2026-01-01T00:00:00Z',fingerprint_json:fingerprint},recognition:{frame_id:'f',media_id:'m',marker:'mid',status:'ready',provider:'apple-vision',recognized_at:'2026-01-01T00:01:00Z',fingerprint_json:fingerprint,labels_json:JSON.stringify([{identifier:'fire',confidence:.427},{identifier:'people',confidence:.18}]),text_lines_json:JSON.stringify([{text:'京都 café',confidence:.9}])},sourceInspection:{status:'bytes-verified',sha256:sha}});

test('catalog projection preserves timed inference, per-label confidence and explicit missing identity',()=>{
 const input=fixture(),before=JSON.stringify(input),row=project(input);
 assert.equal(row.status,'inferred-limited');assert.equal(row.pointSeconds,5);
 assert.deepEqual(row.labels.map(x=>[x.text,x.confidence]),[['fire',.427],['people',.18]]);
 assert.equal(row.textLines[0].text,'京都 café');assert.equal(row.textLines[0].language,null);
 assert.deepEqual(row.characterIds,[]);assert.deepEqual(row.actions,[]);assert.deepEqual(row.usableIntervals,[]);
 assert.equal(row.modelRevision,null);assert.match(row.recognitionFrameBinding,/not-cryptographic/);
 assert.equal(JSON.stringify(input),before);assert.deepEqual(project(input),row);
});

test('changed/unverified source bytes and mismatched or stale recognition do not score',()=>{
 for(const change of [x=>x.sourceInspection.sha256='b'.repeat(64),x=>x.sourceInspection.status='stat-only',x=>x.recognition.media_id='other',x=>x.recognition.frame_id='other',x=>x.recognition.marker='first',x=>x.recognition.status='unavailable',x=>x.frame.updated_at='2026-02-01T00:00:00Z',x=>x.frame.updated_at=null,x=>x.frame.at_seconds=null,x=>x.frame.at_seconds=-1,x=>x.frame.at_seconds=11,x=>x.recognition.fingerprint_json='{}']){
  const input=fixture();change(input);const row=project(input);assert.equal(row.status,'unavailable');assert.deepEqual(row.labels,[]);
 }
});

test('source windows exclude out-of-window points and never multiply duplicate confidence votes',()=>{
 const row=project(fixture());
 const inside=windowed([row,row],{sourceSha256:sha,startSeconds:5,endSeconds:6});assert.equal(inside.observations.length,1);
 for(const window of [{startSeconds:0,endSeconds:5},{startSeconds:6,endSeconds:10},{startSeconds:0,endSeconds:10,sourceSha256:'b'.repeat(64)}])assert.equal(windowed([row],{sourceSha256:sha,...window}).observations.length,0);
 assert.equal(windowed([row],{sourceSha256:sha,startSeconds:null,endSeconds:10}).reason,'source-window-unverified');
 const conflict={...row,revision:'b'.repeat(64)};const result=windowed([row,conflict],{sourceSha256:sha,startSeconds:0,endSeconds:10});
 assert.equal(result.observations.length,0);assert.deepEqual(result.conflictingFrames,['f']);
});

test('changed observation content changes revision; malformed and over-budget rows remain unavailable',()=>{
 const input=fixture(),first=project(input);input.recognition.labels_json='[{"identifier":"water","confidence":0.8}]';assert.notEqual(project(input).revision,first.revision);
 for(const value of ['bad','{}',JSON.stringify(Array(513).fill('label')),JSON.stringify([{identifier:'x'.repeat(4097)}])]){input.recognition.labels_json=value;assert.equal(project(input).status,'unavailable');}
 assert.throws(()=>windowed(Array(6145).fill(first),{sourceSha256:sha,startSeconds:0,endSeconds:10}),/count-budget/);
});
