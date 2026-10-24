import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,copyFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAvatarVoiceService} from '../server/avatar-voice.mjs';
import {openAvatarCardCustodyService} from '../server/card-custody-service.mjs';
import {validateVoiceScript,voiceStyleCoverage} from '../src/domain/avatar-voice.js';
import {voiceChild,createOmniVoiceProvider} from '../server/avatar-voice-provider.mjs';
import {voiceBrowserContext} from '../server/avatar-voice-routes.mjs';

function wav(seconds=4){const b=Buffer.alloc(44+seconds*48000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
test('Voice Card custody, Avatar isolation, automatic scripts, generation provenance and restart persistence',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'avatar-voice-'));const custody=openAvatarCardCustodyService({root:path.join(root,'custody')});
  let calls=0;const provider={status:async()=>({ready:true}),generate:async({output,transcript})=>{calls++;assert.equal(transcript,'A reference recording.');await writeFile(output,wav());return {provider:'test-only',synthetic:true};}};
  const make=()=>createAvatarVoiceService({root,custody,resolveAvatar:async id=>['red','blue'].includes(id)?{id,primaryName:id}:null,provider,convert:copyFile});let service=make();
  try{
    const input={style:'warm',transcript:'A reference recording.',speaker:'Synthetic fixture',provenance:'Test-only synthetic WAV',syntheticSource:true,consent:true,dataUrl:`data:audio/wav;base64,${wav().toString('base64')}`};
    await assert.rejects(service.capture('red',{...input,consent:false}),/permission/);
    await service.capture('red',input);
    for(let i=0;i<100;i++){if((await service.inspect('red')).clips.every(c=>c.state==='ready'))break;await new Promise(r=>setTimeout(r,20));}
    const result=await service.inspect('red');assert.equal(result.cards.length,1);assert.equal(result.scripts.length,2);assert.equal(calls,2);assert.ok(result.cards[0].cardCoreKey);assert.equal(result.clips[0].state,'ready');assert.equal(result.clips[0].referenceSha256,result.cards[0].sha256);
    const bundle=await service.bundle('red',result.clips[0].id);assert.equal(bundle.plan.version,'hapa.avatar-drive.v1');assert.equal(bundle.plan.text,result.scripts[0].text);assert.equal(Buffer.from(bundle.audioBase64,'base64').toString('ascii',0,4),'RIFF');
    assert.equal((await service.inspect('blue')).cards.length,0);await assert.rejects(service.generate('blue',{scriptId:result.scripts[0].id,voiceCardId:result.cards[0].id}),/belonging/);await assert.rejects(service.audio('blue',result.cards[0].file),/not found/);
    await service.close();service=make();assert.equal((await service.inspect('red')).clips.length,2);
    const source=await service.audio('red',result.cards[0].file);await writeFile(source,wav(5));await service.generate('red',{scriptId:result.scripts[0].id,voiceCardId:result.cards[0].id});
    for(let i=0;i<100;i++){if((await service.inspect('red')).clips.at(-1).state==='failed')break;await new Promise(r=>setTimeout(r,20));}
    assert.match((await service.inspect('red')).clips.at(-1).error,/source changed/);assert.equal(calls,2);
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
test('Scripts reject unsupported performance directions',()=>{assert.throws(()=>validateVoiceScript({title:'Test',text:'Hi',gesture:'wave'}),/Unsupported/);});
test('Real audio conversion saves a playable private capture and archive is reversible',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'avatar-voice-convert-'));
  const service=createAvatarVoiceService({root,custody:openAvatarCardCustodyService({root:path.join(root,'custody')}),resolveAvatar:async id=>({id,primaryName:'Test'}),provider:{status:async()=>({ready:false,error:'Test: no model'})}});
  try{
    let value=await service.capture('fixture',{style:'natural',transcript:'Synthetic fixture only.',speaker:'Test',provenance:'Deterministic WAV fixture',syntheticSource:true,consent:true,autoGenerate:false,dataUrl:`data:audio/wav;base64,${wav().toString('base64')}`});
    assert.equal(value.cards[0].duration,4);assert.equal(value.scripts.length,0);
    const voiceCardId=value.cards[0].id;
    value=await service.archive('fixture',{voiceCardId,archived:true});assert.equal(value.cards[0].archived,true);
    value=await service.archive('fixture',{voiceCardId,archived:false});assert.equal(value.cards[0].archived,false);
    assert.ok((await readFile(await service.audio('fixture',value.cards[0].file))).length>44);
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
test('Voice browser boundary rejects cross-origin, missing intent and LAN listeners',()=>{
  const req={method:'POST',headers:{host:'127.0.0.1:8807',origin:'http://127.0.0.1:8807','sec-fetch-site':'same-origin','x-hapa-first-party-intent':'avatar-voice'},socket:{}};
  const options={bind:'127.0.0.1',allowedOrigins:new Set(['http://127.0.0.1:8807'])};
  assert.equal(voiceBrowserContext(req,options),true);assert.equal(voiceBrowserContext(req,{...options,bind:'0.0.0.0'}),false);
  for(const key of ['host','origin','sec-fetch-site','x-hapa-first-party-intent']){const headers={...req.headers};delete headers[key];assert.equal(voiceBrowserContext({...req,headers},options),false);}
  assert.equal(voiceBrowserContext({...req,headers:{...req.headers,origin:'https://evil.example'}},options),false);
});
test('Voice process boundary strips inherited hooks, rejects recursion, cancels and waits for exit',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'avatar-voice-process-')),file=path.join(root,'worker.cjs');
  await writeFile(file,"if(process.env.NODE_OPTIONS||process.execArgv.length||process.env.HAPA_AVATAR_VOICE_WORKER!=='1')process.exit(4);setInterval(()=>{},1000);");
  const controller=new AbortController();const result=voiceChild(process.execPath,[file],{signal:controller.signal,timeout:3000});setTimeout(()=>controller.abort(),150);await assert.rejects(result,/Cancelled/);await rm(root,{recursive:true,force:true});
});

test('OmniVoice readiness rejects empty caches and incomplete tokenizer weights',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'avatar-voice-model-'));
  try{
    await mkdir(path.join(root,'.venv/bin'),{recursive:true});await writeFile(path.join(root,'.venv/bin/python'),'fixture');
    const model=path.join(root,'checkpoint');await mkdir(model);
    const provider=createOmniVoiceProvider({root,model});assert.equal((await provider.status()).ready,false);
    await mkdir(path.join(model,'audio_tokenizer'));
    for(const name of ['config.json','tokenizer.json','model.safetensors','audio_tokenizer/config.json','audio_tokenizer/preprocessor_config.json'])await writeFile(path.join(model,name),'{}');
    assert.equal((await provider.status()).ready,false);
    await writeFile(path.join(model,'audio_tokenizer/model.safetensors'),'fixture');assert.equal((await provider.status()).ready,true);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('CMS speakers resolve by ID; deletion, restore and replacement preserve source history',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'avatar-voice-cms-'));
  let failConversion=false;
  const people=[{id:'red',primaryName:'Red'},{id:'blue',primaryName:'Blue'}];
  const service=createAvatarVoiceService({root,custody:openAvatarCardCustodyService({root:path.join(root,'custody')}),resolveAvatar:async id=>people.find(a=>a.id===id),listSpeakers:async()=>people.map(a=>({id:a.id,label:a.primaryName})),provider:{status:async()=>({ready:false,error:'Test only'})},convert:async(a,b)=>{if(failConversion)throw new Error('Fixture conversion failed');await copyFile(a,b);}});
  const input={style:'natural',transcript:'A synthetic reference.',provenance:'Test fixture',consent:true,autoGenerate:false,syntheticSource:true,dataUrl:`data:audio/wav;base64,${wav().toString('base64')}`};
  try{
    let result=await service.capture('red',input);
    const original=result.cards[0];assert.equal(original.speaker,'Red');assert.equal(original.speakerAvatarId,'red');assert.equal(result.speakers.length,2);
    await assert.rejects(service.capture('red',{...input,speakerAvatarId:'missing'}),/editable Avatar/);
    await assert.rejects(service.remove('blue',{voiceCardId:original.id,deleted:true}),/not found/);
    failConversion=true;await assert.rejects(service.capture('red',{...input,replacesVoiceCardId:original.id}),/conversion failed/);
    assert.equal((await service.inspect('red')).cards[0].deletedAt,undefined);failConversion=false;
    result=await service.capture('red',{...input,speakerAvatarId:'blue',speaker:'untrusted typed label',replacesVoiceCardId:original.id});
    const replacement=result.cards[1];assert.equal(replacement.speaker,'Blue');assert.equal(replacement.speakerAvatarId,'blue');assert.equal(replacement.replacesVoiceCardId,original.id);assert.ok(result.cards[0].deletedAt);assert.equal(result.cards[0].replacedByVoiceCardId,replacement.id);
    assert.ok((await readFile(await service.audio('red',original.file))).length>44);
    result=await service.saveScript('red',{title:'Test',text:'Hello from the test.'});
    await assert.rejects(service.generate('red',{scriptId:result.scripts[0].id,voiceCardId:original.id}),/active Voice Card/);
    result=await service.remove('red',{voiceCardId:original.id,deleted:false});assert.equal(result.cards[0].deletedAt,null);
    result=await service.remove('red',{voiceCardId:replacement.id,deleted:true});assert.ok(result.cards[1].deletedAt);
    await assert.rejects(service.capture('red',{...input,replacesVoiceCardId:replacement.id}),/no longer available/);
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
});

test('Style coverage counts distinct saved active styles, not drafts, duplicate takes or deleted records',()=>{
 const ready=style=>({style,custodyState:'verified'});
 assert.equal(voiceStyleCoverage().complete,0);
 const cards=[ready('natural'),ready('natural'),{...ready('warm'),deletedAt:'now'},{...ready('excited'),archived:true},{style:'serious',custodyState:'pending'},ready('unknown')];
 assert.deepEqual(voiceStyleCoverage(cards),{counts:{natural:2,warm:0,excited:0,serious:0,storytelling:0},complete:1,percent:20});
 cards[2].deletedAt=null;assert.equal(voiceStyleCoverage(cards).percent,40);
 assert.equal(voiceStyleCoverage(['natural','warm','excited','serious','storytelling'].map(ready)).percent,100);
});
