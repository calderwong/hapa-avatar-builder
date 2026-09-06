import fs from 'node:fs/promises';
import path from 'node:path';
import {compileEchoRecipeSnapshot} from '../server/echo-recipe-batch-compiler.mjs';
if(process.env.HAPA_ECHO_RECIPE_BATCH_WORKER!=='1'||!process.connected)throw new Error('Recipe worker requires its owned parent IPC channel and role.');
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const inputFile=option('input'),output=option('output');
if(!inputFile||!output)throw new Error('Worker requires its owned input and output paths.');
let finished=false;
process.on('disconnect',()=>{if(!finished)process.exit(130)});
const deadline=setTimeout(()=>process.exit(124),120000);
try {
  if((await fs.stat(inputFile)).size>64*1024*1024)throw new Error('Prepared snapshot exceeds the 64 MiB worker input budget.');
  const input=JSON.parse(await fs.readFile(inputFile,'utf8'));
  const started=performance.now(),result=compileEchoRecipeSnapshot(input),bytes=JSON.stringify(result)+'\n';
  if(Buffer.byteLength(bytes)>192*1024*1024)throw new Error('Compiled result exceeds the 192 MiB artifact budget.');
  await fs.writeFile(path.join(output,'result.json'),bytes,{flag:'wx'});
  await fs.writeFile(path.join(output,'metrics.json'),JSON.stringify({durationMs:performance.now()-started,maxResidentSetKilobytes:process.resourceUsage().maxRSS,outputBytes:Buffer.byteLength(bytes)})+'\n',{flag:'wx'});
}catch(error){
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({code:error.code||'recipe-compile-failed',message:String(error.message).slice(0,2000),constraints:error.result||null})+'\n').catch(()=>{});
  process.exitCode=1;
}finally{finished=true;clearTimeout(deadline);if(process.connected)process.disconnect()}
