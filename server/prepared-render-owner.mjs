import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import encoding from '../scripts/lib/prepared-frame-encoding.cjs';

/** One lifecycle owner shared by CLI and managed jobs. No launcher subprocess:
 * the registered child is the actual Electron process-group leader. */
export async function runPreparedRender({root,project,output,signal,registerProcess,onOutput=()=>{},timeoutMs=1800e3}){
 if(process.env.HAPA_PREPARED_CAPTURE_WORKER==='1'||process.env.HAPA_PREPARED_ENCODER_WORKER==='1')throw Error('A prepared render worker cannot enter its parent launcher');
 if(process.platform==='win32')throw Error('Prepared capture requires a qualified POSIX process-group owner');
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>1800e3)throw Error('Prepared capture timeout exceeds its budget');
 signal?.throwIfAborted();
 root=path.resolve(root);project=await fs.realpath(project);output=path.resolve(output);
 try{await fs.stat(output);throw Error('Render output already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 const executable=createRequire(import.meta.url)('electron');
 const invocation=encoding.captureInvocation({executable,root,project,output,parentEnv:process.env});
 invocation.options.stdio=['ignore','pipe','pipe'];
 const captureId=randomUUID();invocation.options.env.HAPA_PREPARED_CAPTURE_ID=captureId;
 const ownsOutput=async()=>{try{return JSON.parse(await fs.readFile(path.join(output,'capture-started.json'),'utf8')).captureId===captureId;}catch{return false;}};
 let child,exitResult,timer,unregister,error,result,tail='';
 const alive=()=>{if(!child?.pid)return false;try{process.kill(-child.pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
 const kill=kind=>{if(child?.pid)try{process.kill(-child.pid,kind);}catch(e){if(e.code!=='ESRCH')throw e;}};
 const cancellation=encoding.createCaptureCancellation({killGroup:kill});
 const terminate=()=>cancellation.cancel('Prepared render canceled');
 const observe=chunk=>{const value=String(chunk);tail=(tail+value).slice(-512*1024);try{onOutput(value);}catch(e){error ||= e;terminate();}};
 try{
  signal?.throwIfAborted();
  child=spawn(invocation.executable,invocation.args,invocation.options);
  const completion=new Promise(resolve=>{child.once('error',e=>resolve({error:e.message}));child.once('close',(code,signal)=>resolve({code,signal}));});
  child.stdout.on('data',observe);child.stderr.on('data',observe);
  unregister=registerProcess?.({child,terminate});
  signal?.addEventListener('abort',terminate,{once:true});if(signal?.aborted)terminate();
  timer=setTimeout(()=>cancellation.cancel('Prepared render exceeded its time budget'),timeoutMs);
  exitResult=await completion;
  if(error)throw error;
  if(cancellation.reason||exitResult.code!==0)throw Error(cancellation.reason||exitResult.error||'Prepared render child failed');
  result=JSON.parse(await fs.readFile(path.join(output,'render-result.json'),'utf8'));
  if(!await ownsOutput())throw Error('Capture output ownership changed');
  if(result.ok!==true)throw Error('Prepared renderer did not commit a result');
 }catch(e){error=e;}
 finally{
  clearTimeout(timer);signal?.removeEventListener('abort',terminate);
  // Keep registered until the entire group, not just its leader, has exited.
  try{
   if(alive())kill('SIGTERM');
   let until=Date.now()+3000;while(alive()&&Date.now()<until)await delay(50);
   if(alive())kill('SIGKILL');
   until=Date.now()+3000;while(alive()&&Date.now()<until)await delay(50);
   if(alive())throw Error('Owned render process group did not exit');
   if(child?.pid)await fs.rm(path.join(os.tmpdir(),'hapa-prepared-render-'+child.pid),{recursive:true,force:true});
  }catch(e){error ||= e;}
  cancellation.dispose();if(typeof unregister==='function')unregister();
 }
 if(error){
  if(await ownsOutput())await fs.writeFile(path.join(output,'capture-owner-failure.json'),JSON.stringify({ok:false,message:error.message,child:exitResult,processGroupReleased:!alive()},null,2),{flag:'wx'});
  error.stdout=tail;throw error;
 }
 const ownerReceipt={ok:true,captureOwner:'hapa-prepared-electron-v1',processGroupReleased:true};
 await fs.writeFile(path.join(output,'capture-owner-result.json'),JSON.stringify(ownerReceipt),{flag:'wx'});
 return {...ownerReceipt,result};
}
