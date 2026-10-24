// In-memory shared Score Dust sessions on the local Builder API. The server is
// the room clock: every response carries its receive and send times so peers
// can estimate their offset. Sessions are ephemeral (process-scoped) and
// revisioned so stale updates never replace newer state.
import { randomUUID } from 'node:crypto';
import { ECHO_SCORE_DUST_SESSION_SCHEMA, validateSharedPlayInput } from '../src/domain/echo-score-dust-shared-play.js';

const fail=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});

export function createScoreDustSessionStore({now=()=>Date.now(),maxSessions=32,idleMs=6*60*60*1000}={}){
 const sessions=new Map();
 const prune=()=>{for(const [id,s] of sessions)if(now()-s.updatedAtRoomMs>idleMs)sessions.delete(id);while(sessions.size>maxSessions)sessions.delete(sessions.keys().next().value);};
 function create(input){
  const check=validateSharedPlayInput(input);if(!check.ok)throw fail(check.errors.join(' '));
  prune();
  const at=now(),state=input.state||'paused';
  const session={schemaVersion:ECHO_SCORE_DUST_SESSION_SCHEMA,id:randomUUID(),revision:1,songId:input.songId,runId:input.runId||null,audioIdentity:input.audioIdentity||null,
   scoreFingerprint:input.scoreFingerprint||null,direction:structuredClone(input.direction||{}),playSettings:structuredClone(input.playSettings||{}),title:String(input.title||'').slice(0,160),
   durationSeconds:input.durationSeconds??null,state,positionSeconds:input.positionSeconds??0,startedAtRoomMs:state==='playing'?at:null,createdAtRoomMs:at,updatedAtRoomMs:at};
  sessions.set(session.id,session);return structuredClone(session);
 }
 function get(id){const s=sessions.get(id);if(!s)throw fail('Shared session not found',404);return structuredClone(s);}
 function update(id,input){
  const s=sessions.get(id);if(!s)throw fail('Shared session not found',404);
  const check=validateSharedPlayInput(input,{partial:true});if(!check.ok)throw fail(check.errors.join(' '));
  if(input.baseRevision!==s.revision)throw fail(`Session revision conflict: base ${input.baseRevision}, current ${s.revision}`,409);
  const at=now(),next={...s};
  for(const key of ['runId','audioIdentity','scoreFingerprint','direction','playSettings','durationSeconds','title'])if(input[key]!==undefined)next[key]=structuredClone(input[key]);
  if(input.state!==undefined||input.positionSeconds!==undefined){
   next.state=input.state??s.state;
   next.positionSeconds=input.positionSeconds??(s.state==='playing'?s.positionSeconds+(at-s.startedAtRoomMs)/1000:s.positionSeconds);
   next.startedAtRoomMs=next.state==='playing'?at:null;
  }
  next.revision=s.revision+1;next.updatedAtRoomMs=at;sessions.set(id,next);return structuredClone(next);
 }
 return {create,get,update,size:()=>sessions.size};
}

/** Routes under /api/echos/score-dust/sessions; responses carry room-clock times. */
export async function handleScoreDustSessions({req,res,url,store,requireAdmin,readBody,sendJson,now=()=>Date.now()}){
 const prefix='/api/echos/score-dust/sessions';if(!url.pathname.startsWith(prefix))return false;
 const serverReceiveMs=now();
 if(!requireAdmin(req,res))return true;
 const reply=(status,body)=>sendJson(res,status,{ok:status<400,...body,clock:{serverReceiveMs,serverSendMs:now()}});
 try{
  const suffix=url.pathname.slice(prefix.length);
  if(suffix===''&&req.method==='POST'){reply(201,{session:store.create(await readBody(req))});return true;}
  const match=suffix.match(/^\/([0-9a-f-]{36})$/);
  if(!match)throw fail('Shared session route not found',404);
  if(req.method==='GET'){reply(200,{session:store.get(match[1])});return true;}
  if(req.method==='PUT'){reply(200,{session:store.update(match[1],await readBody(req))});return true;}
  throw fail('Method not allowed',405);
 }catch(error){reply(error.statusCode||500,{error:error.statusCode===409?'session_conflict':'session_request_failed',message:error.message});}
 return true;
}
