#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import {createEchoSongHealth} from '../server/echo-song-health.mjs';
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const option=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const song=option('song'),command=args[0]||'audit';
if(args.includes('--help')){
 console.log(`Song Health · Topview
  audit [--song=ID] [--resume]   Read owner evidence; save each completed song.
  report                        Read the saved album report.
  repair --song=ID|--all --action=fork-current-timing|choose-direction|refresh-delivery
         [--base=http://127.0.0.1:8807]
  record-proof --song=ID --file=proof.json
Audit does not analyze audio or mutate songs. Repair uses the running Builder
owner, one song at a time, with no automatic replay after an ambiguous failure.
Missing specialist evidence remains an explicit failure. See docs/ECHO_SONG_HEALTH.md.`);
 process.exit(0);
}
let owner;
try {
 if(command==='repair'||command==='record-proof'){
  const action=option('action');
  if(command==='repair'&&(!['fork-current-timing','choose-direction','refresh-delivery'].includes(action)||(!song&&!args.includes('--all'))))throw Error('Repair requires --song=ID or --all and an explicit supported --action.');
  const base=new URL(option('base')||'http://127.0.0.1:8807');
  if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('Repair requires the existing loopback Builder.');
  const origin=base.origin,headers={'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'};
  const session=await fetch(origin+'/api/local-ui-session',{method:'POST',redirect:'error',headers:{...headers,'X-Hapa-First-Party-Intent':'audio-atlas'},signal:AbortSignal.timeout(15000)});
  if(!session.ok)throw Error('Local Builder session unavailable.');
  const cookie=session.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const request=async(route,body)=>{const r=await fetch(origin+'/api/echos/audio-atlas/song-health'+route,{method:body?'POST':'GET',redirect:'error',headers:{...headers,Cookie:cookie},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(780000)});const v=await r.json();if(!r.ok)throw Object.assign(Error(v.message||v.error||String(r.status)),{httpStatus:r.status});return v;};
  if(command==='record-proof'){const file=option('file');if(!song||!file)throw Error('Use record-proof --song=ID --file=proof.json');const value=await request('/proof',{songId:song,proof:JSON.parse(await fs.readFile(file,'utf8'))});console.log(JSON.stringify({songId:song,status:value.status,fingerprint:value.fingerprint}));}else{
  const report=await request('');
  const rows=report.rows.filter(r=>song?r.songId===song:action==='choose-direction'?(r.repair?.directionEligible||r.checks?.some(c=>c.id==='direction.current'&&c.status==='fail'&&c.message.includes('default'))):action==='refresh-delivery'?r.recommendedCutId&&r.checks.find(c=>c.id==='cuts.current')?.status==='pass'&&r.checks.find(c=>c.id==='playback.lyrics')?.status!=='pass':r.repair?.eligible);
  if(song&&!rows.length)throw Error('Song not found in the album.');
  console.log(JSON.stringify({action,admitted:rows.length}));
  let stop=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stop=true;console.error('Stopping after the current owner operation; saved results are retained.');});
  for(const [i,row]of rows.entries()){
   if(stop)break;
   try{
   console.log(JSON.stringify({songId:row.songId,phase:'repairing',action}));
   const value=await request('/repair',{songId:row.songId,action});
   console.log(JSON.stringify({done:i+1,total:rows.length,songId:row.songId,action,ok:value.ok,status:value.status||value.receipt?.status,reason:value.reason,childId:value.receipt?.childId,remaining:value.row?.checks.filter(c=>c.status!=='pass').map(c=>c.id)}));
   if(!value.ok)process.exitCode=2;}catch(error){if(!error.httpStatus||error.httpStatus>=500)throw error;console.log(JSON.stringify({done:i+1,total:rows.length,songId:row.songId,action,status:'held',reason:error.message}));process.exitCode=2;}
  }
  }
 }else{
  if(!['audit','report','record-proof'].includes(command))throw Error('Unknown command. Use --help.');
  owner=createEchoSongHealth({root});
  if(command==='record-proof'){
   const file=option('file');if(!song||!file)throw Error('Use record-proof --song=ID --file=proof.json');
   console.log(JSON.stringify(await owner.recordProof(song,JSON.parse(await fs.readFile(file,'utf8')))));
  }else if(command==='report')console.log(JSON.stringify(await owner.report(),null,2));
  else{
   let stop=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stop=true;console.error('Stopping after this song; resume skips unchanged completed evidence.');});
   const songs=song?[{songId:song}]:await owner.inventory();
   for(const [i,s]of songs.entries()){
    if(stop)break;
    const row=await owner.audit(s.songId,{resume:args.includes('--resume')});
    console.log(JSON.stringify({done:i+1,total:songs.length,songId:s.songId,status:row.status,reused:row.reused||false,failures:row.checks.filter(c=>c.status!=='pass').map(c=>c.id)}));
   }
   const report=await owner.report();console.log(JSON.stringify(report.summary));
   if(report.summary.healthy!==report.summary.songs)process.exitCode=2;
  }
 }
}catch(error){console.error(error.message);process.exitCode=1;}finally{if(owner)await owner.close();}
