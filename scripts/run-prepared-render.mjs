#!/usr/bin/env node
import path from 'node:path';
import {runPreparedRender} from '../server/prepared-render-owner.mjs';
const arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
if(!arg('project')||!arg('output'))throw Error('Use --project=<compiled-package> --output=<new-directory>');
const controller=new AbortController(),cancel=()=>controller.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
 const {result,...receipt}=await runPreparedRender({root:path.resolve(import.meta.dirname,'..'),project:arg('project'),output:arg('output'),signal:controller.signal,onOutput:value=>process.stdout.write(value)});
 console.log(JSON.stringify(receipt));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
