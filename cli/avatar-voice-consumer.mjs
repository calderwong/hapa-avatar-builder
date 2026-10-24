#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createVoiceConsumerGrant,revokeVoiceConsumerGrant} from '../server/avatar-voice-consumer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{
 const [command,consumerId,...args]=process.argv.slice(2);
 if(command==='grant'){
  const [avatarId,tokenFile]=args;if(!tokenFile)throw Error('Use grant CONSUMER_ID AVATAR_ID ABSOLUTE_TOKEN_FILE');
  if(!path.isAbsolute(tokenFile))throw Error('Use an absolute private credential file path.');
  const store=JSON.parse(await readFile(path.join(root,'data/avatar-store.json'),'utf8'));
  if(!store.avatars.some(a=>a.id===avatarId&&!a.projection?.readOnly&&!a.isExternalProjection))throw Error('Choose an editable CMS Avatar.');
  console.log(JSON.stringify(await createVoiceConsumerGrant({root,consumerId,avatarIds:[avatarId],tokenFile})));
 }else if(command==='revoke')console.log(JSON.stringify(await revokeVoiceConsumerGrant({root,consumerId})));
 else throw Error('Use grant CONSUMER_ID AVATAR_ID ABSOLUTE_TOKEN_FILE, or revoke CONSUMER_ID. Credentials are never printed.');
}catch(error){console.log(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
