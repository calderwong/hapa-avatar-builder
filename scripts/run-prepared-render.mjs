#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import encoding from './lib/prepared-frame-encoding.cjs';
if(process.env.HAPA_PREPARED_CAPTURE_WORKER==='1'||process.env.HAPA_PREPARED_ENCODER_WORKER==='1')throw Error('A prepared render worker cannot enter its parent launcher');
const root=path.resolve(import.meta.dirname,'..'),arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
if(!arg('project')||!arg('output'))throw Error('Use --project=<compiled-package> --output=<new-directory>');
const output=path.resolve(arg('output')),project=await fs.realpath(arg('project'));
try{await fs.stat(output);throw Error('Render output already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const executable=createRequire(import.meta.url)('electron');
const invocation=encoding.captureInvocation({executable,root,project,output,parentEnv:process.env});
let child,exitResult,timer;
const cancellation=encoding.createCaptureCancellation({killGroup:signal=>{if(child?.pid)try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')console.error(error.message);}}});
const cancel=reason=>cancellation.cancel(reason);
process.once('SIGINT',()=>cancel('Prepared render canceled'));process.once('SIGTERM',()=>cancel('Prepared render canceled'));
const alive=()=>{try{process.kill(-child.pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
async function reap(){
 if(!child?.pid)return;
 if(alive())process.kill(-child.pid,'SIGTERM');
 let until=Date.now()+3000;while(alive()&&Date.now()<until)await delay(50);
 if(alive())process.kill(-child.pid,'SIGKILL');
 until=Date.now()+3000;while(alive()&&Date.now()<until)await delay(50);
 if(alive())throw Error('Owned render process group did not exit');
 await fs.rm(path.join(os.tmpdir(),'hapa-prepared-render-'+child.pid),{recursive:true,force:true});
}
let error;
try{
 child=spawn(invocation.executable,invocation.args,invocation.options);
 timer=setTimeout(()=>cancel('Prepared render exceeded 30 minutes'),1800e3);
 exitResult=await new Promise(resolve=>{child.once('error',e=>resolve({error:e.message}));child.once('close',(code,signal)=>resolve({code,signal}));});
 if(cancellation.reason||exitResult.code!==0)throw Error(cancellation.reason||'Prepared render child failed');
 const result=JSON.parse(await fs.readFile(path.join(output,'render-result.json'),'utf8'));if(result.ok!==true)throw Error('Prepared renderer did not commit a result');
}catch(e){error=e;}finally{clearTimeout(timer);cancellation.dispose();try{await reap();}catch(e){error ||= e;}}
if(error){
 // The output was absent before this owned child. Never rewrite prior takes.
 if(await fs.stat(output).then(s=>s.isDirectory()).catch(()=>false))await fs.writeFile(path.join(output,'capture-owner-failure.json'),JSON.stringify({ok:false,message:error.message,child:exitResult,processGroupReleased:child?.pid?!alive():true},null,2),{flag:'wx'});
 console.error(error.message);process.exitCode=1;
}else console.log(JSON.stringify({ok:true,captureOwner:'hapa-prepared-electron-v1',processGroupReleased:true}));
