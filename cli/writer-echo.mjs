#!/usr/bin/env node
// Read-only client. No service launch, child process, or album writes.
import os from 'node:os';
import path from 'node:path';
import {readWriterPrivateFile} from '../server/writer-room-credentials.mjs';
const args=process.argv.slice(2),command=args.shift()||'help';
try{
  if(command==='help'){console.log(JSON.stringify({ok:true,commands:['list [--query TEXT] [--offset N]','read --song EXACT_ID','references --song EXACT_ID'],owner:'hapa-avatar-builder',readOnly:true}));}
  else{
    if(!['list','read','references'].includes(command))throw Error('Use list, read or references.');
    const options={};for(let i=0;i<args.length;i+=2){if(!['--query','--offset','--song'].includes(args[i])||!args[i+1]||options[args[i]]!==undefined)throw Error('Invalid or repeated argument.');options[args[i]]=args[i+1];}
    if(command!=='list'&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(options['--song']||''))throw Error('An exact song ID is required.');
    const config=JSON.parse(await readWriterPrivateFile(process.env.HAPA_WRITER_ROOM_CONFIG||path.join(os.homedir(),'.hapa-second-brain/writers-room-characters/service.json')));
    const token=(await readWriterPrivateFile(config.apiTokenFile)).trim();
    const port=Number(process.env.HAPA_WRITER_ROOM_PORT||8795);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port.');
    if(Object.keys(options).some(k=>!(command==='list'?['--query','--offset']:['--song']).includes(k)))throw Error('Invalid option for this command.');
    const route=command!=='list'?'/'+encodeURIComponent(options['--song'])+(command==='references'?'/references':''):'?'+new URLSearchParams({q:options['--query']||'',offset:options['--offset']||'0',limit:'100'});
    const response=await fetch(`http://127.0.0.1:${port}/v1/writer-characters/echo/songs${route}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    const data=await response.json();console.log(JSON.stringify(data,null,2));if(!response.ok||data.ok!==true)process.exitCode=1;
  }
}catch(error){console.error(JSON.stringify({ok:false,error:'echo_read_failed',message:error.message.startsWith('Invalid')||error.message.startsWith('Use ')||error.message.startsWith('An exact')?error.message:'Could not read the local Echo owner. Check its configuration and availability.'}));process.exitCode=1;}
