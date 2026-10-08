import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('local HyperFrames delegates explicit file arguments without telemetry, updates or inherited Node loaders',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hapa-hyperframes-policy-'));
 try {
  await fs.mkdir(path.join(root,'dist'));
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({type:'module',version:'0.7.66'}));
  const cli=path.join(root,'dist/cli.js');
  await fs.writeFile(cli,"console.log(JSON.stringify({args:process.argv.slice(2),execArgv:process.execArgv,nodeOptions:process.env.NODE_OPTIONS||null,role:process.env.HAPA_LOCAL_HYPERFRAMES_WORKER,update:process.env.HYPERFRAMES_NO_UPDATE_CHECK,install:process.env.HYPERFRAMES_NO_AUTO_INSTALL,telemetry:process.env.HYPERFRAMES_NO_TELEMETRY}));\n");
  const result=spawnSync(process.execPath,['scripts/run-local-hyperframes.mjs','lint','--json','a directory; with punctuation'],{encoding:'utf8',timeout:10000,shell:false,env:{...process.env,HYPERFRAMES_CLI:cli,HAPA_LOCAL_HYPERFRAMES_WORKER:'',NODE_OPTIONS:'--no-warnings',HYPERFRAMES_NO_TELEMETRY:'0',HYPERFRAMES_NO_UPDATE_CHECK:'0',HYPERFRAMES_NO_AUTO_INSTALL:'0'}});
  assert.equal(result.status,0,result.stderr);assert.ifError(result.error);
  assert.deepEqual(JSON.parse(result.stdout),{args:['lint','--json','a directory; with punctuation'],execArgv:[],nodeOptions:null,role:'1',update:'1',install:'1',telemetry:'1'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('local HyperFrames rejects worker re-entry before resolving or spawning another CLI',()=>{
 const result=spawnSync(process.execPath,['scripts/run-local-hyperframes.mjs','--print-path'],{encoding:'utf8',timeout:10000,shell:false,env:{...process.env,NODE_OPTIONS:'',HYPERFRAMES_CLI:'/does/not/exist',HAPA_LOCAL_HYPERFRAMES_WORKER:'1'}});
 assert.equal(result.status,1);assert.ifError(result.error);assert.equal(result.stdout,'');assert.match(result.stderr,/cannot re-enter/);
});
