import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runVisualMediaProbeCommand} from '../server/render-visual-media-preflight.mjs';

test('a probe that ignores SIGTERM cannot survive its deadline or cancellation', {timeout:10000}, async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'echo-probe-process-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const worker=path.join(directory,'stubborn-probe.mjs');
  await fs.writeFile(worker,"import fs from 'node:fs';\nprocess.on('SIGTERM',()=>{});\nfs.writeFileSync(process.argv[2],String(process.pid));\nsetInterval(()=>{},100);\n");
  for(const mode of ['deadline','cancel']){
    const pidFile=path.join(directory,mode+'.pid'),controller=new AbortController();
    const pending=runVisualMediaProbeCommand(process.execPath,[worker,pidFile],mode==='deadline'?500:5000,{signal:controller.signal});
    const outcome=pending.then(()=>null,error=>error);
    let pid;
    for(let attempt=0;attempt<100&&!pid;attempt++){
      pid=Number(await fs.readFile(pidFile,'utf8').catch(()=>0));
      if(!pid)await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.ok(pid,'named probe reached its signal handler');
    t.after(()=>{try{process.kill(pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}});
    if(mode==='cancel')controller.abort();
    const error=await outcome;assert.ok(error);
    if(mode==='deadline')assert.equal(error.signal,'SIGKILL');else assert.equal(error.name,'AbortError');
    let alive=true;
    for(let attempt=0;attempt<100&&alive;attempt++){
      try{process.kill(pid,0)}catch(error){if(error.code==='ESRCH')alive=false;else throw error}
      if(alive)await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(alive,false,mode+' probe is terminal before cleanup finishes');
  }
});
