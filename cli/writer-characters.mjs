#!/usr/bin/env node
// Credentials come from private owner files or the environment, never argv.
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {loadWriterApiToken} from '../server/writer-room-credentials.mjs';
const args=process.argv.slice(2),command=args.shift()||'help',options={};
let avatarId='',parseError='';
const optionNames=['dry-run','file','project','branch','scene','limit','offset','q','revision','as-of','before'];
while(args.length){const arg=args.shift();if(arg.startsWith('--')){const key=arg.slice(2);if(!optionNames.includes(key))parseError='Unknown option';options[key]=key==='dry-run'?true:args.shift();if(options[key]===undefined)parseError='Missing option value';}else if(!avatarId)avatarId=arg;else parseError='Unexpected argument';}
const help=`writer-characters list | read <avatar-id> | history <avatar-id> | verify <avatar-id> | sync <avatar-id> | save <avatar-id> --file request.json [--dry-run]
writer-characters checkpoint-read | checkpoint-history | checkpoint-save --file request.json [--dry-run]
read/checkpoint-read: --revision N or --as-of UTC-ISO. history/checkpoint-history: --before N --limit 20.
Scope: --project global --branch <id> --scene <id> (checkpoint scope has no scene).
Saves require sources and provenance. Restore appends with current revision/digest and exact provenance.restoreFrom.
Private owner configuration supplies API access; HAPA_WRITER_ROOM_URL and HAPA_WRITER_ROOM_ADMIN_TOKEN are optional environment overrides.`;
async function requestFile(path,limit){
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const info=await file.stat();if(!info.isFile())throw new Error('Request input must be a regular file');if(info.size>limit)throw new Error(`Request exceeds the configured ${limit}-byte transfer budget; no text was truncated or saved`);
    const chunks=[];let size=0;while(true){const buffer=Buffer.alloc(Math.min(65536,limit+1-size));const {bytesRead}=await file.read(buffer);if(!bytesRead)break;size+=bytesRead;if(size>limit)throw new Error('Request exceeds the configured transfer budget; no text was truncated or saved');chunks.push(buffer.subarray(0,bytesRead));}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }finally{await file.close();}
}
async function resultBody(response,limit){let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('Response exceeds the configured transfer budget; refresh before retrying a save');chunks.push(chunk);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
if(command==='help') console.log(help);
else try{
  if(parseError)throw new Error(parseError);
  if(!['list','read','history','verify','sync','save','capabilities','checkpoint-read','checkpoint-history','checkpoint-save'].includes(command))throw new Error('Unknown command');
  const base=new URL(process.env.HAPA_WRITER_ROOM_URL||'http://127.0.0.1:8795');
  if(base.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('Use a literal loopback HTTP service origin');
  let token;try{token=await loadWriterApiToken();}catch{throw new Error('The private Writer’s Room API credential is unavailable or has unsafe permissions.');}
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const checkpoint=command.startsWith('checkpoint-');
  if(!checkpoint&&!['list','capabilities'].includes(command)&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(avatarId))throw new Error('An exact Avatar ID is required');
  if(checkpoint&&(avatarId||options.scene))throw new Error('Checkpoint identity uses --project and --branch only');
  const scope={projectId:options.project||'global',branchId:options.branch||null,sceneId:options.scene||null};
  const capResponse=await fetch(new URL('/v1/writer-characters/capabilities',base),{headers,signal:AbortSignal.timeout(25000)});
  const capabilities=await resultBody(capResponse,1024*1024);
  if(!capResponse.ok)throw new Error(capabilities.message||'Service capabilities unavailable');
  if(command==='capabilities')console.log(JSON.stringify(capabilities,null,2));
  else{
    const requestLimit=capabilities.transferLimits?.requestBytes,outputLimit=capabilities.transferLimits?.outputBytes;
    if(!Number.isSafeInteger(requestLimit)||requestLimit<1||!Number.isSafeInteger(outputLimit)||outputLimit<1)throw new Error('Service does not expose the current transfer contract');
    let suffix=command==='list'?'':checkpoint?`/checkpoints${command==='checkpoint-read'?`/${options.revision||'current'}`:''}`:`/${encodeURIComponent(avatarId)}${['sync','history','verify'].includes(command)?`/${command}`:options.revision&&command==='read'?`/revisions/${options.revision}`:''}`;
    const url=new URL(`/v1/writer-characters${suffix}`,base);let method='GET',body;
    if(['save','checkpoint-save'].includes(command)){
      if(!options.file)throw new Error('--file is required');body=await requestFile(options.file,requestLimit);
      if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Expected a request object');
      if(checkpoint){body.projectId=body.projectId??scope.projectId;body.branchId=body.branchId??scope.branchId;}else body.scope=body.scope||scope;
      body.dryRun=options['dry-run']===true;method=checkpoint?'POST':'PUT';
    }else if(command==='sync'){method='POST';body={scope};}
    else if(command==='list'){for(const key of ['q','offset','limit'])if(options[key])url.searchParams.set(key,options[key]);}
    else{for(const[k,v]of Object.entries(scope))if(v!==null&&(!checkpoint||k!=='sceneId'))url.searchParams.set(k,v);if(options['as-of'])url.searchParams.set('asOf',options['as-of']);if(options.before)url.searchParams.set('beforeRevision',options.before);if(options.limit)url.searchParams.set('limit',options.limit);}
    const serialized=body?JSON.stringify(body):undefined;
    if(serialized&&Buffer.byteLength(serialized)>requestLimit)throw new Error('Request exceeds the configured transfer budget; no text was truncated or saved');
    const response=await fetch(url,{method,headers,body:serialized,signal:AbortSignal.timeout(25000)});
    // The owner reply budget excludes the bounded Builder source projection.
    const result=await resultBody(response,outputLimit+1024*1024);console.log(JSON.stringify(result,null,2));if(!response.ok)process.exitCode=1;
  }
}catch(error){console.log(JSON.stringify({ok:false,error:'writer_character_client_failed',message:error.message}));process.exitCode=1;}
