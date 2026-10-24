#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
const [command,avatarId,inputPath]=process.argv.slice(2);
try {
  if(!['list','capture','script','generate','speak','job','cancel','audio','archive','delete'].includes(command)||!avatarId)throw new Error('Usage: node cli/avatar-voice.mjs list|capture|script|generate|speak|job|cancel|audio|archive|delete AVATAR_ID [JSON_FILE or AUDIO_FILE_ID]');
  const base=process.env.HAPA_AVATAR_URL||'http://127.0.0.1:8797';
  if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Use a local Builder URL.');
  const token=process.env.HAPA_AVATAR_ADMIN_TOKEN||(process.env.HAPA_AVATAR_TOKEN_FILE?await readFile(process.env.HAPA_AVATAR_TOKEN_FILE,'utf8'):'');
  if(!token.trim())throw new Error('Set HAPA_AVATAR_ADMIN_TOKEN or HAPA_AVATAR_TOKEN_FILE; never pass credentials in arguments.');
  const action={list:'',capture:'/capture',script:'/scripts',generate:'/generate',speak:'/speak',job:`/jobs/${encodeURIComponent(inputPath||'')}`,cancel:'/cancel',archive:'/archive',delete:'/delete',audio:`/audio/${encodeURIComponent(inputPath||'')}`}[command];
  let body=['list','audio','job'].includes(command)?null:command==='cancel'&&!inputPath?{}:JSON.parse(await readFile(inputPath,'utf8'));
  if(command==='capture'&&body.audioPath){const bytes=await readFile(body.audioPath);body.dataUrl=`data:audio/wav;base64,${bytes.toString('base64')}`;delete body.audioPath;}
  const r=await fetch(`${base}/api/avatar-voices/${encodeURIComponent(avatarId)}${action}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token.trim()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(command==='audio'&&r.ok){const output=process.argv[5];if(!output)throw new Error('Supply an output WAV path.');await writeFile(output,Buffer.from(await r.arrayBuffer()),{flag:'wx'});console.log(JSON.stringify({ok:true,output}));}
  else{const value=await r.json();if(!r.ok)throw new Error(value.message||value.error);console.log(JSON.stringify({ok:true,data:value},null,2));}
}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
