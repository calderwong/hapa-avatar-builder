import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createVoiceConsumerGrant,revokeVoiceConsumerGrant,authorizeVoiceConsumer,consumerRequestId} from '../server/avatar-voice-consumer.mjs';
import {handleAvatarVoice} from '../server/avatar-voice-routes.mjs';

test('Private expiring consumer credential grants literal-loopback dialogue only and revokes immediately',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'voice-consumer-')),tokenFile=path.join(root,'token');
 try{
  const receipt=await createVoiceConsumerGrant({root,consumerId:'harbor',avatarIds:['red'],tokenFile,ttlHours:1});
  const token=(await readFile(tokenFile,'utf8')).trim();assert.ok(!JSON.stringify(receipt).includes(token));assert.equal((await stat(tokenFile)).mode&0o777,0o600);
  const req={headers:{host:'127.0.0.1:8807',authorization:'Bearer '+token},socket:{remoteAddress:'127.0.0.1'}};
  const options={root,bind:'127.0.0.1'};
  assert.deepEqual(await authorizeVoiceConsumer(req,options),{mode:'voice-consumer',consumerId:'harbor',avatarIds:['red']});
  for(const h of [{origin:'http://127.0.0.1:8807'},{'sec-fetch-site':'same-origin'},{host:'evil.example'},{authorization:'Bearer harbor.'+'0'.repeat(64)}])assert.equal(await authorizeVoiceConsumer({...req,headers:{...req.headers,...h}},options),null);
  assert.equal(await authorizeVoiceConsumer(req,{...options,bind:'0.0.0.0'}),null);
  assert.equal(await authorizeVoiceConsumer({...req,socket:{remoteAddress:'192.168.1.2'}},options),null);
  assert.equal(await authorizeVoiceConsumer(req,{...options,now:Date.parse(receipt.expiresAt)}),null);
  await assert.rejects(createVoiceConsumerGrant({root,consumerId:'harbor',avatarIds:['blue'],tokenFile}),/EEXIST/);
  await revokeVoiceConsumerGrant({root,consumerId:'harbor'});assert.equal(await authorizeVoiceConsumer(req,options),null);
  assert.equal((await readFile(tokenFile,'utf8')).trim(),token);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Failed credential output cannot overwrite an existing file or leave a live grant',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'voice-consumer-')),tokenFile=path.join(root,'existing');
 try{await writeFile(tokenFile,'preserve');await assert.rejects(createVoiceConsumerGrant({root,consumerId:'harbor',avatarIds:['red'],tokenFile}),/EEXIST/);assert.equal(await readFile(tokenFile,'utf8'),'preserve');await assert.rejects(readFile(path.join(root,'data/avatar-voices/consumers/harbor.json')),/ENOENT/);}finally{await rm(root,{recursive:true,force:true});}
});

test('Consumer routes isolate jobs and strip private captures, transcripts and unrelated library records',async()=>{
 const auth={mode:'voice-consumer',consumerId:'harbor',avatarIds:['red']},calls=[];
 const service={inspect:async()=>({avatarId:'red',styles:[{id:'natural',title:'Natural',prompt:'private prompt'}],provider:{ready:true,root:'/private/engine'},cards:[{id:'voice',title:'Red',avatarId:'red',style:'natural',sha256:'hash',consent:{confirmed:true},custodyState:'verified',transcript:'private transcript',file:'private.wav',audioUrl:'/capture.wav'},{id:'deleted',consent:{confirmed:true},custodyState:'verified',deletedAt:'now'}],scripts:[{text:'private script'}],clips:[{id:'unrelated'}]}),speak:async(a,b)=>{calls.push(['speak',a,b]);return {id:'own',state:'queued',requestId:b.requestId,script:b.script};},job:async(a,id)=>({id,avatarId:a,requestId:id==='own'?'harbor__request-0001':'other__request-0001',state:'ready',script:{text:'private'}}),bundle:async(a,id)=>({id,avatarId:a,plan:{text:'Own generated reply'}}),cancel:async(a,b)=>{calls.push(['cancel',a,b]);return {cards:[{transcript:'never expose'}]};}};
 const run=async(method,route,input={})=>{let result;await handleAvatarVoice({req:{method},res:{setHeader(){}},url:new URL('http://127.0.0.1:8807/api/avatar-voices/'+route),service,readBody:async()=>structuredClone(input),sendJson:(_r,status,value)=>{result={status,value};},requireAdmin:async()=>auth});return result;};
 const library=await run('GET','red');assert.equal(library.status,200);assert.equal(library.value.cards.length,1);assert.ok(!JSON.stringify(library).includes('private'));assert.ok(!library.value.scripts);assert.ok(!library.value.clips);
 assert.equal((await run('GET','blue')).status,403);
 for(const [method,route] of [['POST','capture'],['POST','delete'],['POST','archive'],['POST','generate'],['POST','scripts'],['GET','audio/private.wav']])assert.equal((await run(method,'red/'+route)).status,403);
 assert.equal((await run('POST','red/speak',{requestId:'request-0001',voiceCardId:'voice',script:{text:'Hello'}})).status,202);assert.equal(calls[0][2].requestId,'harbor__request-0001');
 assert.equal((await run('GET','red/jobs/own')).value.script,undefined);assert.equal((await run('GET','red/bundle/own')).status,200);
 for(const route of ['jobs/other','bundle/other'])assert.equal((await run('GET','red/'+route)).status,400);
 assert.equal((await run('POST','red/cancel',{clipId:'other'})).status,400);assert.equal((await run('POST','red/cancel',{})).status,400);
 assert.equal((await run('POST','red/cancel',{requestId:'request-0001',clipId:'own'})).status,400);
 const cancelled=await run('POST','red/cancel',{requestId:'request-0001'});assert.equal(cancelled.status,200);assert.deepEqual(calls.at(-1),['cancel','red',{requestId:'harbor__request-0001'}]);assert.ok(!cancelled.value.cards);
});

test('Consumer request namespace cannot alias another consumer or exceed durable request limits',()=>{
 assert.equal(consumerRequestId('harbor','a'.repeat(54)).length,62);
 assert.throws(()=>consumerRequestId('harbor','a'.repeat(55)),/8–54/);
 assert.throws(()=>consumerRequestId('../harbor','request-0001'),/8–54/);
 assert.notEqual(consumerRequestId('harbor','other__request-0001'),consumerRequestId('other','request-0001'));
});
