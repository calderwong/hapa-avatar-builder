#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {runEchoRecipeBatch} from '../server/echo-recipe-batch.mjs';
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const requestFile=option('request'),output=option('output');
if(!requestFile||!output)throw Error('Usage: node scripts/compile-echo-recipe-batch.mjs --request=album-request.json --output=artifacts/my-recipe-batch [--max-jobs=1] [--retry-failed]');
const file=path.resolve(requestFile),request=JSON.parse(await fs.readFile(file,'utf8'));
if(Array.isArray(request.songs))request.songs=request.songs.map(song=>({...song,projectPath:path.resolve(path.dirname(file),song.projectPath)}));
const controller=new AbortController();
const cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
  const result=await runEchoRecipeBatch({request,output:path.resolve(output),signal:controller.signal,maxJobs:option('max-jobs')===undefined?Infinity:Number(option('max-jobs')),retryFailed:process.argv.includes('--retry-failed'),
    onProgress:event=>console.log(JSON.stringify({status:event.status,preparation:event.preparation,activeWorker:event.activeWorker,compiled:event.work?.compiled,cacheHits:event.work?.cacheHits,jobs:event.jobs?.map(job=>({id:job.id,status:job.status}))}))});
  console.log(JSON.stringify({status:result.status,output:path.resolve(output),work:result.work}));
  process.exitCode=result.status==='failed'?1:result.status==='cancelled'?130:0;
}catch(error){console.error(JSON.stringify({error:error.message,code:error.code||null}));process.exitCode=controller.signal.aborted?130:1}
finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel)}
