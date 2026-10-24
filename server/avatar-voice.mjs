import {readFile,writeFile,mkdir,rename,copyFile,rm,chmod,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {VOICE_SCHEMA,VOICE_STYLES,voiceText,voiceStyle,validateVoiceScript,starterVoiceScripts} from '../src/domain/avatar-voice.js';
import {createOmniVoiceProvider,voiceChild} from './avatar-voice-provider.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const id=kind=>`${kind}-${randomUUID()}`;
const now=()=>new Date().toISOString();
export function voiceWavDuration(wav){
  if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('Invalid WAV audio.');
  let rate=0,size=0;
  for(let offset=12;offset+8<=wav.length;){const n=wav.readUInt32LE(offset+4),tag=wav.toString('ascii',offset,offset+4);if(offset+8+n>wav.length)throw new Error('Truncated WAV audio.');if(tag==='fmt '&&n>=16)rate=wav.readUInt32LE(offset+16);if(tag==='data')size+=n;offset+=8+n+(n%2);}
  if(!rate||!size)throw new Error('WAV audio has no samples.');return size/rate;
}
export function createAvatarVoiceService({root,custody,resolveAvatar,listSpeakers,provider,convert}={}) {
  const dir=path.join(root,'data/avatar-voices'),storePath=path.join(dir,'library.json');
  let tail=Promise.resolve(),running=false,controller=null,closed=false,capturing=false,activeClipId=null;
  const transaction=fn=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;};
  const load=async()=>{try{return JSON.parse(await readFile(storePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {schemaVersion:VOICE_SCHEMA,cards:[],scripts:[],clips:[]};}};
  async function save(store){
    await mkdir(dir,{recursive:true});await mkdir(path.join(root,'data/backups/avatar-voices'),{recursive:true});
    try{await copyFile(storePath,path.join(root,'data/backups/avatar-voices',`${Date.now()}-${randomUUID()}.json`));}catch(e){if(e.code!=='ENOENT')throw e;}
    const tmp=`${storePath}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(store,null,2),{mode:0o600});await rename(tmp,storePath);
  }
  async function engine(){if(provider)return provider;let config={};try{config=JSON.parse(await readFile(path.join(dir,'provider.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return createOmniVoiceProvider(config);}
  async function avatar(avatarId){const a=await resolveAvatar(avatarId);if(!a||a.projection?.readOnly||a.isExternalProjection)throw new Error('Choose an editable Avatar from this Builder.');return a;}
  async function createCard(record){
    const result=await custody.ensure({card:{...record,cardType:'voice',sourceKind:'avatar-voice',summary:`${record.style} voice sample for Avatar ${record.avatarId}; audio SHA-256 ${record.sha256}`,sourceRefs:[{kind:'avatar',cardId:record.avatarId}],attribution:{source:record.provenance,creator:record.speaker,tool:'Avatar Builder voice capture'}},actorId:'local-voice-author',evidenceRef:'avatar-voice:explicit-capture'});
    const card={...result.card,custodyState:'verified',visibility:'local-private'};
    // Private custody receipt/outbox: no external publication or raw audio payload.
    await appendFile(path.join(dir,'outbox.ndjson'),JSON.stringify({id:id('event'),event:'card.created',cardId:record.id,avatarId:record.avatarId,custody:result.receipt,visibility:'local-private',state:'local-only',at:now()})+'\n',{mode:0o600});
    return card;
  }
  const audioUrl=(avatarId,file)=>`/api/avatar-voices/${encodeURIComponent(avatarId)}/audio/${encodeURIComponent(file)}`;
  async function inspect(avatarId){await avatar(avatarId);const store=await load();return {schemaVersion:VOICE_SCHEMA,avatarId,dialogue:{version:'hapa.avatar-utterance.v1',idempotent:true,scopedCancellation:true},styles:VOICE_STYLES,provider:await(await engine()).status(),speakers:listSpeakers?await listSpeakers():[{id:avatarId,label:(await avatar(avatarId)).primaryName}],cards:store.cards.filter(c=>c.avatarId===avatarId),scripts:store.scripts.filter(c=>c.avatarId===avatarId),clips:store.clips.filter(c=>c.avatarId===avatarId)};}
  async function capture(avatarId,input){if(capturing||closed)throw new Error('A capture is already being saved. Try again when it finishes.');capturing=true;try{return await captureInner(avatarId,input);}finally{capturing=false;}}
  async function captureInner(avatarId,input){
    const a=await avatar(avatarId),style=voiceStyle(input.style),transcript=voiceText(input.transcript,'Exact recording transcript',1200),provenance=voiceText(input.provenance,'Source / permission note',500);
    const speakerAvatarId=input.speakerAvatarId||avatarId,speakerAvatar=await avatar(speakerAvatarId),speaker=voiceText(speakerAvatar.primaryName,'CMS speaker',120);
    if(input.replacesVoiceCardId){const previous=(await load()).cards.find(c=>c.id===input.replacesVoiceCardId&&c.avatarId===avatarId&&!c.deletedAt);if(!previous)throw new Error('The capture to re-record is no longer available.');}
    if(input.consent!==true)throw new Error('Confirm permission to use this voice for generated speech.');
    const match=/^data:audio\/[\w.+;-]+;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.dataUrl||'');
    if(!match)throw new Error('Upload or record an audio clip.');
    const bytes=Buffer.from(match[1],'base64');if(bytes.length<44||bytes.length>15*1024*1024)throw new Error('Audio must be between 44 bytes and 15 MB.');
    const cardId=id('voice'),temp=path.join(dir,`${cardId}.input`),output=path.join(dir,`${cardId}.wav`);
    await mkdir(dir,{recursive:true,mode:0o700});await writeFile(temp,bytes,{mode:0o600});
    let committed=false;
    try {
      if(convert)await convert(temp,output);else await voiceChild('/opt/homebrew/bin/ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-i',temp,'-t','31','-ac','1','-ar','24000','-c:a','pcm_s16le','-y',output],{timeout:30000});
      await chmod(output,0o600);const wav=await readFile(output);const duration=voiceWavDuration(wav);
      if(duration<3||duration>30.1)throw new Error('Use a recording between 3 and 30 seconds (6–15 seconds is ideal).');
      const record={id:cardId,schemaVersion:VOICE_SCHEMA,avatarId,title:voiceText(input.title||`${a.primaryName} · ${style}`,'Voice Card title',120),speaker,speakerAvatarId,replacesVoiceCardId:input.replacesVoiceCardId||null,style,transcript,provenance,consent:{confirmed:true,at:now(),scope:'local voice synthesis'},syntheticSource:input.syntheticSource===true,sha256:sha(wav),bytes:wav.length,duration:Math.round(duration*100)/100,file:path.basename(output),audioUrl:audioUrl(avatarId,path.basename(output)),createdAt:now()};
      await transaction(async()=>{const store=await load();const previous=input.replacesVoiceCardId?store.cards.find(c=>c.id===input.replacesVoiceCardId&&c.avatarId===avatarId&&!c.deletedAt):null;if(input.replacesVoiceCardId&&!previous)throw new Error('The capture to re-record is no longer available.');if(input.autoGenerate!==false&&store.clips.filter(c=>['queued','generating'].includes(c.state)).length>4)throw new Error('The generation queue is full. Uncheck automatic generation to save just the capture.');store.cards.push({...record,custodyState:'pending',visibility:'local-private'});await save(store);committed=true;const card=await createCard(record);store.cards[store.cards.length-1]=card;if(previous){card.replacesVoiceCardId=previous.id;previous.replacedByVoiceCardId=card.id;previous.deletedAt=now();}
        if(input.autoGenerate!==false){for(const template of starterVoiceScripts(a.primaryName||'your Avatar',style)){
          const script={...validateVoiceScript(template),id:id('script'),avatarId,createdAt:now(),sourceVoiceCardId:card.id};store.scripts.push(script);store.clips.push(newClip(script,card));
        }}await save(store);committed=true;});
      kick();return inspect(avatarId);
    }catch(e){if(!committed)await rm(output,{force:true});throw e;}finally{await rm(temp,{force:true});}
  }
  function newClip(script,card){return {id:id('clip'),avatarId:script.avatarId,scriptId:script.id,voiceCardId:card.id,referenceSha256:card.sha256,script:{...script},state:'queued',synthetic:true,createdAt:now()};}
  async function saveScript(avatarId,input){await avatar(avatarId);const value=validateVoiceScript(input);await transaction(async()=>{const store=await load();store.scripts.push({...value,id:id('script'),avatarId,createdAt:now(),supersedes:input.supersedes||null});await save(store);});return inspect(avatarId);}
  async function archive(avatarId,input){await avatar(avatarId);await transaction(async()=>{const store=await load(),card=store.cards.find(c=>c.avatarId===avatarId&&c.id===input.voiceCardId);if(!card)throw new Error('Voice Card not found.');if(typeof input.archived!=='boolean')throw new Error('Set archived to true or false.');card.archived=input.archived;card.updatedAt=now();await save(store);});return inspect(avatarId);}
  async function remove(avatarId,input){await avatar(avatarId);await transaction(async()=>{const store=await load(),card=store.cards.find(c=>c.avatarId===avatarId&&c.id===input.voiceCardId);if(!card)throw new Error('Voice Card not found.');if(typeof input.deleted!=='boolean')throw new Error('Set deleted to true or false.');card.deletedAt=input.deleted?now():null;card.updatedAt=now();await save(store);});return inspect(avatarId);}
  async function generate(avatarId,input){await avatar(avatarId);await transaction(async()=>{const store=await load();const script=store.scripts.find(s=>s.avatarId===avatarId&&s.id===input.scriptId),card=store.cards.find(c=>c.avatarId===avatarId&&c.id===input.voiceCardId);if(!script||!card)throw new Error('Choose a saved script and Voice Card belonging to this Avatar.');if(card.deletedAt||card.archived||card.custodyState!=='verified')throw new Error('Choose an active Voice Card.');if(store.clips.filter(c=>['queued','generating'].includes(c.state)).length>=6)throw new Error('Six clips are already waiting. Let them finish first.');store.clips.push(newClip(script,card));await save(store);});kick();return inspect(avatarId);}
  const requestKey=value=>{if(typeof value!=='string'||!/^[-_a-zA-Z0-9]{8,80}$/.test(value))throw new Error('Supply an 8–80 character utterance requestId.');return value;};
  const usable=card=>card?.consent?.confirmed&&!card.deletedAt&&!card.archived&&card.custodyState==='verified';
  // Durable exact-request semantics: retry cannot create a second script or clip.
  async function speak(avatarId,input){
    await avatar(avatarId);if(closed)throw new Error('Voice service is closing.');
    const requestId=requestKey(input.requestId),script=validateVoiceScript(input.script||{});
    const requestHash=sha(JSON.stringify({script,voiceCardId:input.voiceCardId}));
    const result=await transaction(async()=>{
      const store=await load(),existing=store.clips.find(c=>c.avatarId===avatarId&&c.requestId===requestId);
      if(existing){if(existing.requestHash!==requestHash)throw new Error('This requestId already names a different utterance.');return existing;}
      if(store.utteranceCancels?.some(c=>c.avatarId===avatarId&&c.requestId===requestId))return {id:null,avatarId,requestId,state:'cancelled'};
      const card=store.cards.find(c=>c.avatarId===avatarId&&c.id===input.voiceCardId);
      if(!usable(card))throw new Error('Choose an active, permitted Voice Card belonging to this Avatar.');
      if(store.clips.filter(c=>['queued','generating'].includes(c.state)).length>=6)throw new Error('Six clips are already waiting. Let them finish first.');
      const saved={...script,id:id('script'),avatarId,createdAt:now(),source:'live-dialogue',requestId};
      const clip={...newClip(saved,card),requestId,requestHash};
      store.scripts.push(saved);store.clips.push(clip);await save(store);return clip;
    });
    if(result.state==='queued')kick();return result;
  }
  async function job(avatarId,clipId){await avatar(avatarId);const clip=(await load()).clips.find(c=>c.avatarId===avatarId&&c.id===clipId);if(!clip)throw new Error('Clip not found for this Avatar.');return clip;}
  async function updateClip(clipId,patch){return transaction(async()=>{const store=await load();const clip=store.clips.find(c=>c.id===clipId);Object.assign(clip,patch,{updatedAt:now()});await save(store);return clip;});}
  async function drain(){
    if(running||closed)return;running=true;let lock=false;
    try{
      await mkdir(dir,{recursive:true});
      const lockDir=path.join(dir,'generation.lock');
      try{await mkdir(lockDir);lock=true;}catch(e){
        if(e.code!=='EEXIST')throw e;
        const owner=JSON.parse(await readFile(path.join(lockDir,'owner.json'),'utf8'));
        if(!Number.isSafeInteger(owner.pid)||owner.pid<1)throw new Error('Voice generation lock needs operator inspection.');
        try{process.kill(owner.pid,0);throw new Error('Another Builder process owns voice generation.');}catch(check){if(check.code!=='ESRCH')throw check;}
        await rm(lockDir,{recursive:true});await mkdir(lockDir);lock=true;
      }
      await writeFile(path.join(lockDir,'owner.json'),JSON.stringify({pid:process.pid,createdAt:now()}),{mode:0o600});
      await transaction(async()=>{const s=await load();let changed=false;for(const c of s.clips)if(c.state==='generating'){Object.assign(c,{state:'interrupted',error:'The previous generation stopped. Generate this script again to retry.'});changed=true;}if(changed)await save(s);});
      while(!closed){
        const candidate=(await load()).clips.find(c=>c.state==='queued');if(!candidate)break;
        controller=new AbortController();activeClipId=candidate.id;
        // Claim inside the same writer queue as cancellation; cancelled work cannot revive.
        const claimed=await transaction(async()=>{const store=await load(),clip=store.clips.find(c=>c.id===candidate.id);if(clip?.state!=='queued')return null;Object.assign(clip,{state:'generating',startedAt:now()});await save(store);return {clip,card:store.cards.find(c=>c.id===clip.voiceCardId)};});
        if(!claimed){controller=null;activeClipId=null;continue;}
        const {clip,card}=claimed,file=`${clip.id}.wav`,output=path.join(dir,file);
        try{
          if(!usable(card))throw new Error('This Voice Card is deleted, archived, pending custody, or missing permission.');
          if(controller.signal.aborted)throw new Error('Cancelled');
          const reference=path.join(dir,card.file);if(sha(await readFile(reference))!==clip.referenceSha256)throw new Error('Voice source changed; capture it again.');
          const receipt=await(await engine()).generate({text:clip.script.text,reference,transcript:card.transcript,output,signal:controller.signal});
          await chmod(output,0o600);const bytes=await readFile(output),duration=voiceWavDuration(bytes);
          if(sha(await readFile(reference))!==clip.referenceSha256)throw new Error('Voice source changed during generation.');
          await transaction(async()=>{
            const store=await load(),current=store.clips.find(c=>c.id===clip.id),source=store.cards.find(c=>c.id===clip.voiceCardId);
            if(controller.signal.aborted)throw new Error('Cancelled');
            if(!usable(source)||source.sha256!==clip.referenceSha256)throw new Error('Voice Card changed or became unavailable during generation.');
            Object.assign(current,{state:'ready',file,audioUrl:audioUrl(clip.avatarId,file),sha256:sha(bytes),bytes:bytes.length,duration,generation:receipt,finishedAt:now()});await save(store);
          });
        }catch(e){await rm(output,{force:true});await updateClip(clip.id,{state:controller.signal.aborted?'cancelled':'failed',error:e.message,finishedAt:now()});}finally{controller=null;activeClipId=null;}
      }
    }finally{controller=null;activeClipId=null;if(lock)await rm(path.join(dir,'generation.lock'),{recursive:true,force:true});running=false;}
  }
  function kick(){void drain().catch(e=>{console.error('Avatar voice queue:',e.message);});}
  async function cancel(avatarId,input={}){
    await avatar(avatarId);
    if(input.clipId&&input.requestId)throw new Error('Choose clipId or requestId, not both.');
    if(input.requestId)requestKey(input.requestId);
    await transaction(async()=>{
      const store=await load();
      if(input.clipId&&!store.clips.some(c=>c.avatarId===avatarId&&c.id===input.clipId))throw new Error('Clip not found for this Avatar.');
      if(input.requestId){store.utteranceCancels??=[];if(!store.utteranceCancels.some(c=>c.avatarId===avatarId&&c.requestId===input.requestId))store.utteranceCancels.push({avatarId,requestId:input.requestId,at:now()});}
      const matches=c=>c.avatarId===avatarId&&(!input.clipId||c.id===input.clipId)&&(!input.requestId||c.requestId===input.requestId);
      for(const clip of store.clips.filter(matches)){
        if(clip.state==='queued')Object.assign(clip,{state:'cancelled',updatedAt:now()});
        if(clip.id===activeClipId)controller?.abort();
      }
      await save(store);
    });
    return inspect(avatarId);
  }
  async function audio(avatarId,file){const store=await load();if(![...store.cards,...store.clips].some(c=>c.avatarId===avatarId&&c.file===file))throw new Error('Audio not found for this Avatar.');if(path.basename(file)!==file)throw new Error('Invalid audio file.');return path.join(dir,file);}
  async function bundle(avatarId,clipId){const store=await load(),clip=store.clips.find(c=>c.avatarId===avatarId&&c.id===clipId&&c.state==='ready');if(!clip)throw new Error('Choose a completed Avatar Clip.');const bytes=await readFile(await audio(avatarId,clip.file));if(sha(bytes)!==clip.sha256)throw new Error('Generated audio changed.');const s=clip.script;return {id:clip.id,avatarId,plan:{version:'hapa.avatar-drive.v1',text:s.text,expression:s.expression,gesture:s.gesture,turn:s.turn,wink:s.wink||'none'},audioBase64:bytes.toString('base64'),model:clip.generation.model||clip.generation.provider,provenance:{voiceCardId:clip.voiceCardId,scriptId:clip.scriptId,referenceSha256:clip.referenceSha256,audioSha256:clip.sha256,synthetic:true}};}
  return {inspect,capture,saveScript,generate,speak,job,cancel,archive,remove,audio,bundle,async close(){closed=true;controller?.abort();while(running)await new Promise(r=>setTimeout(r,50));await tail;}};
}
