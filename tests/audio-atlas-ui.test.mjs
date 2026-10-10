import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAtlasClient,correctionSamples,matchesFileFilter,timeLabel,eventLabel} from '../src/domain/audio-atlas-ui.js';
const response=(status,value)=>({status,ok:status<400,json:async()=>value});
test('seconds retain source sample boundaries and reject invalid edits',()=>{
 assert.deepEqual(correctionSamples('27.24','27.54',48000,11687040),{start_sample:1307520,end_sample:1321920});
 for(const [a,b] of [['','1'],['1',''],['2','1'],['-1','1'],['NaN','1'],['0','999']])assert.equal(correctionSamples(a,b,48000,11687040),null);
 assert.deepEqual(correctionSamples('1','','48000',96000,true),{start_sample:48000,end_sample:48000});
 assert.equal(correctionSamples('2','2',48000,96000,true),null);
});
test('file filters distinguish complete, missing and unknown inventory',()=>{
 const full={wav:{state:'available'},mp3:{state:'available'},wav_stems:{state:'available'},mp3_stems:{state:'available'}};
 assert.equal(matchesFileFilter(full,'attention'),false);assert.equal(matchesFileFilter({...full,wav:{state:'missing'}},'wav'),true);assert.equal(matchesFileFilter(undefined,'attention'),true);assert.equal(matchesFileFilter(full,'all'),true);
 assert.equal(timeLabel(59.999),'1:00.00');assert.equal(timeLabel(27.24),'0:27.24');assert.equal(timeLabel(243.44),'4:03.44');
});
test('typed auth rejection refreshes once and then replays exact request',async()=>{
 const calls=[]; const queue=[response(503,{error:'admin_auth_not_configured'}),response(201,{ok:true}),response(200,{ok:true})];
 const c=createAtlasClient('',async(url,opts)=>{calls.push([url,opts]);return queue.shift();});
 await c.request('/jobs',{method:'POST',body:'{"songId":"test"}'});
 assert.equal(calls.length,3);assert.equal(calls[1][0],'/api/local-ui-session');assert.equal(calls[2][1].body,calls[0][1].body);assert.equal(calls[1][1].headers['X-Hapa-First-Party-Intent'],'audio-atlas');
});
test('ambiguous errors and second auth rejection never replay again',async()=>{
 for(const failure of [response(500,{error:'unknown'}),new Error('timeout')]){let n=0;const c=createAtlasClient('',async()=>{n++;if(failure instanceof Error)throw failure;return failure;});await assert.rejects(c.request('/jobs',{method:'POST'}));assert.equal(n,1);}
 let n=0;const c=createAtlasClient('',async()=>{n++;return n===2?response(201,{}):response(401,{error:'unauthorized'});});await assert.rejects(c.request('/jobs',{method:'POST'}));assert.equal(n,3);
});
test('concurrent session refreshes coalesce',async()=>{
 let n=0,resolve;const c=createAtlasClient('',()=>{n++;return new Promise(r=>resolve=r);});const a=c.connect(),b=c.connect();assert.equal(n,1);resolve(response(201,{}));await Promise.all([a,b]);
});

test('event labels show queried text, never promote a pending correction',()=>{assert.equal(eventLabel({payload:{text:'original'},review:{correction:{text:'unapproved'}}}),'original');assert.equal(eventLabel({payload:{text:'accepted'},correction_applied:true}),'accepted');});
