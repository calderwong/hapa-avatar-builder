#!/usr/bin/env node
// Credentials come from private owner files or the environment, never argv.
import {readFile,stat} from 'node:fs/promises';
import {loadWriterApiToken} from '../server/writer-room-credentials.mjs';
const args=process.argv.slice(2),command=args.shift()||'help';
const options={};let avatarId='',parseError='';
while(args.length){const arg=args.shift();if(arg.startsWith('--')){const key=arg.slice(2);if(!['dry-run','file','project','branch','scene','limit','offset','q'].includes(key))parseError='Unknown option';options[key]=['dry-run'].includes(key)?true:args.shift();}else if(!avatarId)avatarId=arg;else parseError='Unexpected argument';}
if(command==='help'){console.log('writer-characters list | read <avatar-id> | history <avatar-id> | sync <avatar-id> | save <avatar-id> --file request.json [--dry-run]\nOptional --project global --branch <id> --scene <id>. The private owner configuration supplies API access; HAPA_WRITER_ROOM_URL and HAPA_WRITER_ROOM_ADMIN_TOKEN are optional environment overrides.');}
else {
  try {
    if(parseError)throw new Error(parseError);
    if(!['list','read','history','sync','save','capabilities'].includes(command))throw new Error('Unknown command');
    const base=new URL(process.env.HAPA_WRITER_ROOM_URL||'http://127.0.0.1:8795');
    if(base.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.search||base.hash)throw new Error('Use a literal loopback HTTP service URL');
    let token;try{token=await loadWriterApiToken();}catch{throw new Error('The private Writer’s Room API credential is unavailable or has unsafe permissions.');}
    if(!['list','capabilities'].includes(command)&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(avatarId))throw new Error('An exact Avatar ID is required');
    const scope={projectId:options.project||'global',branchId:options.branch||null,sceneId:options.scene||null};
    const url=new URL('/v1/writer-characters'+(['list','capabilities'].includes(command)?command==='capabilities'?'/capabilities':'':`/${encodeURIComponent(avatarId)}${['sync','history'].includes(command)?`/${command}`:''}`),base);
    let method='GET',body;
    if(command==='save'){if(!options.file)throw new Error('--file is required');const info=await stat(options.file);if(!info.isFile()||info.size>256*1024)throw new Error('Request file must be a regular file of at most 256 KiB');const bytes=await readFile(options.file);if(bytes.length>256*1024)throw new Error('Request file exceeds 256 KiB');body=JSON.parse(bytes);body.scope=body.scope||scope;body.dryRun=options['dry-run']===true;method='PUT';}
    else if(command==='sync'){method='POST';body={scope};}
    else if(command!=='list'&&command!=='capabilities'){for(const[k,v]of Object.entries(scope))if(v!==null)url.searchParams.set(k,v);}
    else if(command==='list'){if(options.limit)url.searchParams.set('limit',options.limit);if(options.offset)url.searchParams.set('offset',options.offset);if(options.q)url.searchParams.set('q',options.q);}
    const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
    const result=await response.json();console.log(JSON.stringify(result,null,2));if(!response.ok)process.exitCode=1;
  }catch(error){console.log(JSON.stringify({ok:false,error:'writer_character_client_failed',message:error.message}));process.exitCode=1;}
}
