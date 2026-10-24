import {readFile,writeFile,mkdir,unlink,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const digest=value=>createHash('sha256').update(value).digest('hex');
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{2,23}$/.test(id);
const grantPath=(root,id)=>path.join(root,'data/avatar-voices/consumers',id+'.json');
export async function createVoiceConsumerGrant({root,consumerId,avatarIds,tokenFile,ttlHours=168}){
 if(!validId(consumerId)||!Array.isArray(avatarIds)||!avatarIds.length||avatarIds.length>8||avatarIds.some(id=>typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id)))throw Error('Choose a consumer ID and one to eight exact Avatar IDs.');
 if(!Number.isFinite(ttlHours)||ttlHours<1||ttlHours>168)throw Error('Voice connection must expire within one to 168 hours.');
 const token=consumerId+'.'+randomBytes(32).toString('hex'),file=grantPath(root,consumerId);
 const grant={version:'hapa.avatar-voice-consumer.v1',consumerId,avatarIds:[...new Set(avatarIds)],scope:'dialogue-only',tokenSha256:digest(token),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+ttlHours*3600000).toISOString(),revokedAt:null};
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});
 // Never overwrite an existing consumer grant or a caller's credential file.
 await writeFile(file,JSON.stringify(grant,null,2),{flag:'wx',mode:0o600});
 try{await writeFile(tokenFile,token+'\n',{flag:'wx',mode:0o600});}catch(error){await unlink(file);throw error;}
 return {ok:true,consumerId,avatarIds:grant.avatarIds,scope:grant.scope,expiresAt:grant.expiresAt,tokenFile};
}
export async function revokeVoiceConsumerGrant({root,consumerId}){
 if(!validId(consumerId))throw Error('Invalid consumer ID.');
 const file=grantPath(root,consumerId),grant=JSON.parse(await readFile(file,'utf8'));
 grant.revokedAt??=new Date().toISOString();const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
 await writeFile(temp,JSON.stringify(grant,null,2),{flag:'wx',mode:0o600});await rename(temp,file);
 return {ok:true,consumerId,revokedAt:grant.revokedAt};
}
export async function authorizeVoiceConsumer(req,{root,bind,now=Date.now()}={}){
 if(bind!=='127.0.0.1'||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)||!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')||req.headers.origin||req.headers['sec-fetch-site'])return null;
 const match=/^Bearer ([a-z][a-z0-9-]{2,23})\.([a-f0-9]{64})$/.exec(req.headers.authorization||'');if(!match)return null;
 let grant;try{grant=JSON.parse(await readFile(grantPath(root,match[1]),'utf8'));}catch{return null;}
 if(grant.version!=='hapa.avatar-voice-consumer.v1'||grant.consumerId!==match[1]||grant.scope!=='dialogue-only'||grant.revokedAt||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=now||!Array.isArray(grant.avatarIds))return null;
 const actual=Buffer.from(digest(match[1]+'.'+match[2]),'hex'),expected=Buffer.from(grant.tokenSha256||'','hex');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 return {mode:'voice-consumer',consumerId:grant.consumerId,avatarIds:grant.avatarIds};
}
export function consumerRequestId(consumerId,value){
 if(!validId(consumerId)||typeof value!=='string'||!/^[-_a-zA-Z0-9]{8,54}$/.test(value))throw Error('Supply an 8–54 character consumer requestId.');
 return consumerId+'__'+value;
}
export function ownsVoiceJob(authorization,clip){return typeof clip?.requestId==='string'&&clip.requestId.startsWith(authorization.consumerId+'__');}
export function consumerVoiceLibrary(value){
 return {schemaVersion:value.schemaVersion,avatarId:value.avatarId,dialogue:value.dialogue,provider:{ready:value.provider?.ready===true},styles:value.styles.map(({id,title})=>({id,title})),cards:value.cards.filter(c=>c.consent?.confirmed&&!c.deletedAt&&!c.archived&&c.custodyState==='verified').map(c=>({id:c.id,title:c.title,avatarId:c.avatarId,speaker:c.speaker,speakerAvatarId:c.speakerAvatarId,style:c.style,sha256:c.sha256,syntheticSource:c.syntheticSource===true,custodyState:'verified',consent:{confirmed:true}}))};
}
export function consumerVoiceJob(clip){return Object.fromEntries(['id','avatarId','state','duration','error','createdAt','startedAt','finishedAt'].filter(k=>clip[k]!==undefined).map(k=>[k,clip[k]]));}
