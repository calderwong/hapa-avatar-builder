// In-memory shared Score Dust sessions on the local Builder API. The server is
// the room clock: every response carries its receive and send times so peers
// can estimate their offset. Sessions are ephemeral (process-scoped) and
// revisioned so stale updates never replace newer state.
//
// Cross-device guests (P2 item 17): the owner (an admin/local-UI caller) issues
// expiring, limited-use invite codes; a phone or another computer redeems one
// with a display name and receives its own guest token, scoped to that one
// session. Guests can read the session (score, timeline, timing), react, and
// drive play only when the owner hands control to them. Codes and tokens are
// 256-bit random values stored only as SHA-256 hashes; a restart revokes all.
//
// Song audio for guests: the host shares an audio *source* the Builder
// resolves itself (an Atlas master or a prepared playback job), never a URL.
// A guest who asks for audio gets a per-guest audio key in an HttpOnly cookie
// scoped to /api/echos/score-dust/guest/audio/<session>, so an <audio> element
// can stream it with byte ranges and no secret ever appears in a URL.
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { ECHO_SCORE_DUST_SESSION_SCHEMA, validateSharedPlayInput } from '../src/domain/echo-score-dust-shared-play.js';

const fail=(message,statusCode=422,code=null)=>Object.assign(new Error(message),{statusCode,code});
const secret=()=>randomBytes(32).toString('base64url');
const digest=(value)=>createHash('sha256').update(String(value)).digest();
const sameHash=(a,b)=>a.length===b.length&&timingSafeEqual(a,b);
export const SCORE_DUST_REACTIONS=Object.freeze(['spark','heart','wave','fire','clap']);
const MAX_GUESTS=20,MAX_INVITE_MINUTES=240,MAX_INVITE_USES=20,REACTION_GAP_MS=500,MAX_REACTIONS=50,FAILED_JOIN_LIMIT=20;
export const SCORE_DUST_GUEST_AUDIO_PREFIX='/api/echos/score-dust/guest/audio/';
export const SCORE_DUST_GUEST_AUDIO_COOKIE='hapa_score_dust_audio';

/** What anyone in the room may see: never hashes, invites, tokens or the audio source. */
function publicView(s,now){
 const {guests,invites,audioSource,...rest}=s;
 return {...structuredClone(rest),audioAvailable:Boolean(audioSource),guests:guests.filter(g=>!g.revoked).map(g=>({id:g.id,name:g.name,joinedAtRoomMs:g.joinedAtRoomMs,online:now-g.lastSeenRoomMs<5000})),invitesActive:invites.filter(i=>i.usesLeft>0&&i.expiresAtRoomMs>now).length};
}

export function createScoreDustSessionStore({now=()=>Date.now(),maxSessions=32,idleMs=6*60*60*1000}={}){
 const sessions=new Map();
 // Failed joins are throttled per session, so wrong codes aimed at one room (or
 // at made-up session ids) never lock guests out of another room.
 const failedJoins=new Map();
 const prune=()=>{
  for(const [id,s] of sessions)if(now()-s.updatedAtRoomMs>idleMs)sessions.delete(id);
  while(sessions.size>maxSessions)sessions.delete(sessions.keys().next().value);
  for(const id of failedJoins.keys())if(id!=='unknown-session'&&!sessions.has(id))failedJoins.delete(id);
 };
 const find=(id)=>{const s=sessions.get(id);if(!s)throw fail('Shared session not found',404);return s;};
 const bump=(s)=>{s.revision++;s.updatedAtRoomMs=now();};
 function create(input){
  const check=validateSharedPlayInput(input);if(!check.ok)throw fail(check.errors.join(' '));
  prune();
  const at=now(),state=input.state||'paused';
  const session={schemaVersion:ECHO_SCORE_DUST_SESSION_SCHEMA,id:randomUUID(),revision:1,songId:input.songId,runId:input.runId||null,audioIdentity:input.audioIdentity||null,
   scoreFingerprint:input.scoreFingerprint||null,direction:structuredClone(input.direction||{}),playSettings:structuredClone(input.playSettings||{}),title:String(input.title||'').slice(0,160),
   score:input.score?structuredClone(input.score):null,timeline:input.timeline?structuredClone(input.timeline):null,audioSource:input.audioSource?structuredClone(input.audioSource):null,
   durationSeconds:input.durationSeconds??null,state,positionSeconds:input.positionSeconds??0,startedAtRoomMs:state==='playing'?at:null,createdAtRoomMs:at,updatedAtRoomMs:at,
   controller:'owner',reactions:[],guests:[],invites:[]};
  sessions.set(session.id,session);return publicView(session,at);
 }
 function get(id){return publicView(find(id),now());}
 function applyPlay(s,input,at){
  s.state=input.state??s.state;
  s.positionSeconds=input.positionSeconds??(s.startedAtRoomMs!==null?s.positionSeconds+(at-s.startedAtRoomMs)/1000:s.positionSeconds);
  s.startedAtRoomMs=s.state==='playing'?at:null;
 }
 function update(id,input){
  const s=find(id);
  const check=validateSharedPlayInput(input,{partial:true});if(!check.ok)throw fail(check.errors.join(' '));
  if(input.baseRevision!==s.revision)throw fail(`Session revision conflict: base ${input.baseRevision}, current ${s.revision}`,409);
  const at=now();
  for(const key of ['runId','audioIdentity','scoreFingerprint','direction','playSettings','durationSeconds','title','score','timeline','audioSource'])if(input[key]!==undefined)s[key]=structuredClone(input[key]);
  // While a guest holds control, the owner's play state is not applied (it can take control back).
  if((input.state!==undefined||input.positionSeconds!==undefined)&&s.controller==='owner')applyPlay(s,input,at);
  bump(s);return publicView(s,at);
 }
 function createInvite(id,{ttlMinutes=60,maxUses=5}={}){
  const s=find(id),ttl=Math.min(MAX_INVITE_MINUTES,Math.max(1,Math.floor(Number(ttlMinutes)||60))),uses=Math.min(MAX_INVITE_USES,Math.max(1,Math.floor(Number(maxUses)||5)));
  const code=secret(),at=now();
  s.invites=s.invites.filter(i=>i.usesLeft>0&&i.expiresAtRoomMs>at);
  s.invites.push({hash:digest(code),expiresAtRoomMs:at+ttl*60000,usesLeft:uses});
  return {sessionId:s.id,code,expiresAtRoomMs:at+ttl*60000,usesLeft:uses};
 }
 function join({sessionId,invite,name}={}){
  const at=now();
  const s=sessions.get(String(sessionId||'')),bucket=s?s.id:'unknown-session';
  const failures=(failedJoins.get(bucket)||[]).filter(t=>at-t<60000);
  failedJoins.set(bucket,failures);
  if(failures.length>=FAILED_JOIN_LIMIT)throw fail('Too many failed joins; wait a minute.',429,'guest_join_rate_limited');
  const hash=digest(invite||''),slot=s?.invites.find(i=>sameHash(i.hash,hash)&&i.usesLeft>0&&i.expiresAtRoomMs>at);
  if(!s||!slot){failures.push(at);throw fail('This invite is invalid, used up or expired. Ask the host for a new link.',403,'guest_invite_invalid');}
  const clean=String(name||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,40);
  if(!clean)throw fail('Enter a display name.',422,'guest_name_required');
  if(s.guests.filter(g=>!g.revoked).length>=MAX_GUESTS)throw fail('This session is full.',409,'session_full');
  slot.usesLeft--;
  const token=secret(),guest={id:randomUUID(),name:clean,tokenHash:digest(token),audioKeyHash:null,joinedAtRoomMs:at,lastSeenRoomMs:at,lastReactionMs:0,revoked:false};
  s.guests.push(guest);bump(s);
  return {guestId:guest.id,guestToken:token,session:publicView(s,at)};
 }
 /** Resolve a guest bearer token to its session and guest (refreshes presence). */
 function authGuest(token){
  const hash=digest(token||'');
  for(const s of sessions.values()){const g=s.guests.find(x=>!x.revoked&&sameHash(x.tokenHash,hash));if(g){g.lastSeenRoomMs=now();return {s,g};}}
  throw fail('Guest sign-in expired or was revoked. Ask the host for a new link.',401,'guest_unauthorized');
 }
 function guestSession(token){const {s,g}=authGuest(token);return {...publicView(s,now()),you:{id:g.id,name:g.name,hasControl:s.controller===g.id}};}
 function revokeGuest(id,guestId){const s=find(id),g=s.guests.find(x=>x.id===guestId&&!x.revoked);if(!g)throw fail('Guest not found',404);g.revoked=true;if(s.controller===g.id)s.controller='owner';bump(s);return publicView(s,now());}
 function setController(id,controller){
  const s=find(id);
  if(controller!=='owner'&&!s.guests.some(g=>g.id===controller&&!g.revoked))throw fail('Control can pass only to a signed-in guest.',422);
  // Freeze the clock position at the hand-off so the next controller starts from the shared state.
  const at=now();applyPlay(s,{},at);s.controller=controller;bump(s);return publicView(s,at);
 }
 function react(token,kind){
  const {s,g}=authGuest(token),at=now();
  if(!SCORE_DUST_REACTIONS.includes(kind))throw fail(`Reaction must be one of ${SCORE_DUST_REACTIONS.join(', ')}.`);
  if(at-g.lastReactionMs<REACTION_GAP_MS)throw fail('One reaction every half second.',429,'reaction_rate_limited');
  g.lastReactionMs=at;
  s.reactions.push({id:randomUUID(),guestId:g.id,name:g.name,kind,atRoomMs:at});
  if(s.reactions.length>MAX_REACTIONS)s.reactions.splice(0,s.reactions.length-MAX_REACTIONS);
  bump(s);return publicView(s,at);
 }
 function guestControl(token,input={}){
  const {s,g}=authGuest(token);
  if(s.controller!==g.id)throw fail('The host has not handed you control.',403,'guest_not_controller');
  const play={state:input.state,positionSeconds:input.positionSeconds};
  const check=validateSharedPlayInput({...play,baseRevision:input.baseRevision},{partial:true});if(!check.ok)throw fail(check.errors.join(' '));
  if(input.baseRevision!==s.revision)throw fail(`Session revision conflict: base ${input.baseRevision}, current ${s.revision}`,409);
  const at=now();applyPlay(s,play,at);bump(s);return publicView(s,at);
 }
 /** A fresh per-guest audio key (the previous one stops working). */
 function issueAudioKey(token){
  const {s,g}=authGuest(token);
  if(!s.audioSource)throw fail('The host is not sharing song audio for this session.',404,'guest_audio_unavailable');
  const key=secret();g.audioKeyHash=digest(key);
  return {sessionId:s.id,key,audioUri:`${SCORE_DUST_GUEST_AUDIO_PREFIX}${s.id}`};
 }
 /** Resolve an audio key to the session's audio source; revoked guests lose audio at once. */
 function guestAudio(sessionId,key){
  const s=sessions.get(String(sessionId||'')),hash=digest(key||'');
  const g=s?.guests.find(x=>!x.revoked&&x.audioKeyHash&&sameHash(x.audioKeyHash,hash));
  if(!s||!g)throw fail('Audio sign-in expired or was revoked. Tap Play audio here again.',401,'guest_audio_unauthorized');
  if(!s.audioSource)throw fail('The host is not sharing song audio for this session.',404,'guest_audio_unavailable');
  g.lastSeenRoomMs=now();
  return {songId:s.songId,source:structuredClone(s.audioSource)};
 }
 return {create,get,update,createInvite,join,guestSession,revokeGuest,setController,react,guestControl,issueAudioKey,guestAudio,size:()=>sessions.size};
}

const readCookie=(req,name)=>{for(const pair of String(req.headers.cookie||'').split(';')){const i=pair.indexOf('=');if(i>0&&pair.slice(0,i).trim()===name)return pair.slice(i+1).trim();}return '';};

/** Routes under /api/echos/score-dust/sessions (owner/admin); responses carry room-clock times. */
export async function handleScoreDustSessions({req,res,url,store,requireAdmin,readBody,sendJson,now=()=>Date.now()}){
 const prefix='/api/echos/score-dust/sessions';if(!url.pathname.startsWith(prefix))return false;
 const serverReceiveMs=now();
 if(!requireAdmin(req,res))return true;
 const reply=(status,body)=>sendJson(res,status,{ok:status<400,...body,clock:{serverReceiveMs,serverSendMs:now()}});
 try{
  const suffix=url.pathname.slice(prefix.length);
  if(suffix===''&&req.method==='POST'){reply(201,{session:store.create(await readBody(req))});return true;}
  const match=suffix.match(/^\/([0-9a-f-]{36})(?:\/(invites|guests|controller)(?:\/([0-9a-f-]{36}))?)?$/);
  if(!match)throw fail('Shared session route not found',404);
  const [,id,action,guestId]=match;
  if(!action&&req.method==='GET'){reply(200,{session:store.get(id)});return true;}
  if(!action&&req.method==='PUT'){reply(200,{session:store.update(id,await readBody(req))});return true;}
  if(action==='invites'&&req.method==='POST'){reply(201,{invite:store.createInvite(id,await readBody(req))});return true;}
  if(action==='guests'&&!guestId&&req.method==='GET'){reply(200,{guests:store.get(id).guests});return true;}
  if(action==='guests'&&guestId&&req.method==='DELETE'){reply(200,{session:store.revokeGuest(id,guestId)});return true;}
  if(action==='controller'&&req.method==='PUT'){reply(200,{session:store.setController(id,String((await readBody(req)).controller||''))});return true;}
  throw fail('Method not allowed',405);
 }catch(error){reply(error.statusCode||500,{error:error.statusCode===409?'session_conflict':'session_request_failed',message:error.message});}
 return true;
}

/**
 * Guest routes under /api/echos/score-dust/guest. No admin check: each call is
 * authorised by an invite code (join), the guest's own bearer token, or (song
 * audio only) the guest's audio-key cookie.
 * resolveAudio(source, songId) → local file path; serveLocalFile streams it with ranges.
 */
export async function handleScoreDustGuests({req,res,url,store,readBody,sendJson,resolveAudio=null,serveLocalFile=null,secure=false,now=()=>Date.now()}){
 const prefix='/api/echos/score-dust/guest';if(!url.pathname.startsWith(`${prefix}/`))return false;
 const serverReceiveMs=now();
 const reply=(status,body)=>sendJson(res,status,{ok:status<400,...body,clock:{serverReceiveMs,serverSendMs:now()}});
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 try{
  const suffix=url.pathname.slice(prefix.length);
  const audio=url.pathname.startsWith(SCORE_DUST_GUEST_AUDIO_PREFIX)?url.pathname.slice(SCORE_DUST_GUEST_AUDIO_PREFIX.length):null;
  if(audio!==null&&['GET','HEAD'].includes(req.method)){
   if(!/^[0-9a-f-]{36}$/.test(audio))throw fail('Guest route not found',404);
   if(!resolveAudio||!serveLocalFile)throw fail('Guest audio is not available on this Builder.',503,'guest_audio_unavailable');
   const {songId,source}=store.guestAudio(audio,readCookie(req,SCORE_DUST_GUEST_AUDIO_COOKIE));
   await serveLocalFile(await resolveAudio(source,songId),req,res);return true;
  }
  if(suffix==='/audio-access'&&req.method==='POST'){
   const access=store.issueAudioKey(token);
   res.setHeader('Set-Cookie',`${SCORE_DUST_GUEST_AUDIO_COOKIE}=${access.key}; Path=${access.audioUri}; HttpOnly; SameSite=Strict; Max-Age=${12*60*60}${secure?'; Secure':''}`);
   reply(200,{audioUri:access.audioUri});return true;
  }
  if(suffix==='/join'&&req.method==='POST'){reply(201,store.join(await readBody(req,64*1024)));return true;}
  if(suffix==='/session'&&req.method==='GET'){reply(200,{session:store.guestSession(token)});return true;}
  if(suffix==='/reactions'&&req.method==='POST'){reply(201,{session:store.react(token,String((await readBody(req,4096)).kind||''))});return true;}
  if(suffix==='/control'&&req.method==='PUT'){reply(200,{session:store.guestControl(token,await readBody(req,4096))});return true;}
  throw fail('Guest route not found',404);
 }catch(error){reply(error.statusCode||500,{error:error.code||'guest_request_failed',message:error.message});}
 return true;
}
