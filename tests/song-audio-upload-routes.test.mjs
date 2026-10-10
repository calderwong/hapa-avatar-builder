import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handleAudioAtlas} from '../server/audio-atlas-routes.mjs';
const prefix='http://127.0.0.1:19873/api/echos/audio-atlas';
async function request({method='GET',suffix='/songs/test/files',headers={},authorized=true,uploads}={}){
 const req=Readable.from([Buffer.from('binary audio')]);Object.assign(req,{method,headers:{host:'127.0.0.1:19873',...headers}});let result;
 const sendJson=(_res,status,body)=>result={status,body};
 await handleAudioAtlas({req,res:{},url:new URL(prefix+suffix),atlas:{},uploads,requireAdmin:()=>{if(!authorized)sendJson(null,401,{error:'unauthorized'});return authorized;},sendJson,readBody:()=>{throw Error('binary must not go through JSON parser');}});return result;
}
test('file routes require auth and reject foreign browser origin before upload service runs',async()=>{
 const uploads={upload:()=>{throw Error('must not run');},status:()=>{throw Error('must not run');}};
 assert.equal((await request({uploads,authorized:false})).status,401);
 assert.equal((await request({uploads,method:'POST',headers:{origin:'https://foreign.test','sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await request({uploads,method:'POST',headers:{origin:'http://127.0.0.1:19873','sec-fetch-site':'cross-site'}})).status,403);
});
test('authenticated raw upload preserves bytes and explicit destination and replace intent',async()=>{
 let params;
 const uploads={upload:async p=>{params=p;let bytes='';for await(const c of p.stream)bytes+=c.toString();return {received:bytes};}};
 const r=await request({method:'POST',suffix:'/songs/song%3A1/files?kind=stem&format=wav&role=Backing+Vocals&filename=02-vocals.wav&revision=abc&replace=false',headers:{origin:'http://127.0.0.1:19873','sec-fetch-site':'same-origin'},uploads});
 assert.equal(r.status,201);assert.equal(r.body.received,'binary audio');assert.equal(params.songId,'song:1');assert.equal(params.role,'Backing Vocals');assert.equal(params.replace,false);
});
test('route rejects oversized requests and preserves typed errors',async()=>{
 assert.equal((await request({method:'POST',headers:{'content-length':String(2**31)},uploads:{}})).status,413);
 const r=await request({uploads:{status:()=>{throw Object.assign(new Error('Song changed'),{statusCode:409});}}});assert.equal(r.status,409);assert.equal(r.body.message,'Song changed');
});
