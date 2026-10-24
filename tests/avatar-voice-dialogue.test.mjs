import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,copyFile,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAvatarVoiceService} from '../server/avatar-voice.mjs';
import {handleAvatarVoice} from '../server/avatar-voice-routes.mjs';
function wav(){const b=Buffer.alloc(44+4*48000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
async function until(fn){for(let i=0;i<150;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,10));}throw Error('Fixture deadline');}
async function fixture(provider){const root=await mkdtemp(path.join(os.tmpdir(),'avatar-dialogue-'));const make=()=>createAvatarVoiceService({root,resolveAvatar:async id=>['red','blue'].includes(id)?{id,primaryName:id}:null,custody:{ensure:async({card})=>({card,receipt:{fixture:true}})},provider,convert:copyFile});let service=make();const captured=await service.capture('red',{style:'natural',transcript:'Synthetic test reference.',provenance:'Test only; no real voice',syntheticSource:true,consent:true,autoGenerate:false,dataUrl:'data:audio/wav;base64,'+wav().toString('base64')});return {root,make,service,card:captured.cards[0]};}
const input=(card,requestId,text='Hello there.')=>({requestId,voiceCardId:card.id,script:{title:'So-Crates dialogue',text,style:'natural',expression:'smile',gesture:'rest',turn:.1,wink:'left'}});

test('Utterance request is durable, idempotent, isolated and pinned to an exact script/Voice Card',async()=>{
 let calls=0;const f=await fixture({status:async()=>({ready:true}),generate:async({output})=>{calls++;await writeFile(output,wav());return {provider:'fixture'};}});let s=f.service;
 try{
  const request=input(f.card,'utterance-0001');const first=await s.speak('red',request);
  const duplicate=await s.speak('red',request);assert.equal(duplicate.id,first.id);
  await assert.rejects(s.speak('red',{...request,script:{...request.script,text:'Different'}}),/different utterance/);
  await assert.rejects(s.speak('blue',input(f.card,'utterance-0002')),/belonging/);
  await until(async()=> (await s.job('red',first.id)).state==='ready');
  const bundle=await s.bundle('red',first.id);assert.equal(bundle.plan.wink,'left');assert.equal(bundle.plan.text,request.script.text);assert.equal(bundle.provenance.referenceSha256,f.card.sha256);
  await s.close();s=f.make();assert.equal((await s.speak('red',request)).id,first.id);assert.equal(calls,1);assert.equal((await s.inspect('red')).scripts.length,1);
  await s.cancel('red',{requestId:'cancel-before-send'});
  assert.equal((await s.speak('red',input(f.card,'cancel-before-send'))).state,'cancelled');assert.equal(calls,1);
  await assert.rejects(s.job('blue',first.id),/not found/);
 }finally{await s.close();await rm(f.root,{recursive:true,force:true});}
});

test('Scoped cancellation stops only its utterance and queued work cannot revive',async()=>{
 let started=false,release;const f=await fixture({status:async()=>({ready:true}),generate:async({text,output,signal})=>{
  if(text==='Hold first.'){started=true;await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});if(signal.aborted)reject(Error('Cancelled'));});}
  await writeFile(output,wav());return {provider:'fixture'};
 }});const s=f.service;
 try{
  const a=await s.speak('red',input(f.card,'hold-first','Hold first.'));await until(()=>started);
  const b=await s.speak('red',input(f.card,'cancel-second','Cancel only this.'));
  const c=await s.speak('red',input(f.card,'keep-third','Keep this.'));
  await assert.rejects(s.cancel('blue',{clipId:a.id}),/not found/);
  await s.cancel('red',{clipId:b.id});assert.equal((await s.job('red',a.id)).state,'generating');
  await s.cancel('red',{requestId:'hold-first'});
  await until(async()=> (await s.job('red',c.id)).state==='ready');
  assert.equal((await s.job('red',a.id)).state,'cancelled');assert.equal((await s.job('red',b.id)).state,'cancelled');
  assert.equal((await s.speak('red',input(f.card,'cancel-second','Cancel only this.'))).state,'cancelled');
 }finally{release?.();await s.close();await rm(f.root,{recursive:true,force:true});}
});

test('Revoking a capture during generation prevents publication and preserves earlier clip provenance',async()=>{
 let calls=0,started=false,release;const f=await fixture({status:async()=>({ready:true}),generate:async({output,signal})=>{calls++;if(calls===2){started=true;await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});});}await writeFile(output,wav());return {provider:'fixture'};}});const s=f.service;
 try{
  const old=await s.speak('red',input(f.card,'before-delete'));await until(async()=> (await s.job('red',old.id)).state==='ready');
  const pending=await s.speak('red',input(f.card,'during-delete'));await until(()=>started);
  await s.remove('red',{voiceCardId:f.card.id,deleted:true});release();
  await until(async()=> (await s.job('red',pending.id)).state==='failed');
  await assert.rejects(access(path.join(f.root,'data/avatar-voices',pending.id+'.wav')));
  assert.equal((await s.bundle('red',old.id)).provenance.voiceCardId,f.card.id);
  await assert.rejects(s.speak('red',input(f.card,'after-delete')),/active, permitted/);
 }finally{release?.();await s.close();await rm(f.root,{recursive:true,force:true});}
});

test('HTTP routes preserve authentication and exact speak/job/cancel payloads',async()=>{
 const calls=[],service={speak:async(a,b)=>{calls.push(['speak',a,b]);return {id:'clip-1'};},job:async(a,id)=>{calls.push(['job',a,id]);return {id};},cancel:async(a,b)=>{calls.push(['cancel',a,b]);return {};}};
 const run=async(method,route,body,authorized=true)=>{const replies=[];await handleAvatarVoice({req:{method},res:{setHeader(){}},url:new URL('http://localhost/api/avatar-voices/red/'+route),service,readBody:async()=>body,sendJson:(_r,status,value)=>replies.push({status,value}),requireAdmin:()=>authorized});return replies;};
 assert.equal((await run('POST','speak',{requestId:'one-request'}))[0].status,202);
 await run('GET','jobs/clip-1');await run('POST','cancel',{clipId:'clip-1'});await run('POST','speak',{},false);
 assert.deepEqual(calls,[['speak','red',{requestId:'one-request'}],['job','red','clip-1'],['cancel','red',{clipId:'clip-1'}]]);
});
