#!/usr/bin/env node
// Owner maintenance operation: repair one missing local reference, never normalize the album.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {echoSourceContainer} from '../server/echo-source-inventory.mjs';
import {acquireOwnedFileLock,releaseOwnedFileLock} from '../server/owned-file-lock.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error(message);};
function inspect(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const before=fs.fstatSync(fd);if(!before.isFile()||before.size<16||before.size>512*1024*1024)fail('Candidate must be a regular audio file between16bytes and512MiB');
  const buffer=Buffer.alloc(65536),digest=createHash('sha256');let header=null,n;
  while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0){if(!header)header=Buffer.from(buffer.subarray(0,16));digest.update(buffer.subarray(0,n));}
  const after=fs.fstatSync(fd);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)fail('Candidate changed while hashing');
  const format=path.extname(file).slice(1).toLowerCase();if(!['mp3','wav'].includes(format)||echoSourceContainer(header)!==format)fail('Candidate extension and readable audio header must agree');
  return {sha256:digest.digest('hex'),bytes:before.size,container:format,verification:'bytes-and-container-header',decodeVerified:false,originalLosslessProvenance:'not-established'};
 }finally{fs.closeSync(fd);}
}
export function repairSongAudioReference({root,songId,newPath,expectedStoreSha256,expectedSourceSha256,apply=false}={}){
 if(!path.isAbsolute(root||'')||!songId||!path.isAbsolute(newPath||''))fail('Absolute root/path and exact song ID required');
 const storePath=path.join(root,'data/hapa-songs-store.json');
 if(fs.lstatSync(storePath).isSymbolicLink())fail('Song store must not be a symlink');
 let lock=null,temporary=null;
 try{
  if(apply)lock=acquireOwnedFileLock({lockPath:storePath+'.audio-reference-repair.lock',schemaVersion:'hapa.song-audio-reference-repair-lock.v1',staleLegacyMs:60000});
  const original=fs.readFileSync(storePath),beforeSha=sha(original),store=JSON.parse(original);
  if(expectedStoreSha256&&expectedStoreSha256!==beforeSha)fail('Song store changed; refresh dry run');
  if(apply&&(!/^[a-f0-9]{64}$/.test(expectedStoreSha256||'')||!/^[a-f0-9]{64}$/.test(expectedSourceSha256||'')))fail('Apply requires both reviewed store and candidate hashes');
  const matches=store.songs?.filter(s=>s.id===songId)||[];if(matches.length!==1)fail('Song ID must resolve exactly once');
  const song=matches[0],oldPath=song.audio?.localPath;
  if(!path.isAbsolute(oldPath||'')||! /\.(wav|wave|mp3|m4a|aac|flac|ogg|opus|aif|aiff)$/i.test(oldPath))fail('Existing local reference is not a recognized audio path');
  if(path.dirname(oldPath)!==path.dirname(newPath)||path.basename(oldPath,path.extname(oldPath))!==path.basename(newPath,path.extname(newPath)))fail('Repair must use an exact-basename format sibling in the same registered folder');
  try{fs.statSync(oldPath);fail('Existing source still exists; format replacement is not a missing-reference repair');}catch(e){if(e.code!=='ENOENT')throw e;}
  const candidate=inspect(newPath);if(expectedSourceSha256&&candidate.sha256!==expectedSourceSha256)fail('Candidate bytes changed; refresh dry run');
  song.audio={...song.audio,localPath:newPath,localAvailable:true};
  const next=Buffer.from(JSON.stringify(store,null,2)+'\n');
  const report={schemaVersion:'hapa.song-audio-reference-repair.v1',operationId:randomUUID(),state:apply?'prepared':'dry-run',songId,oldPath,newPath,beforeStoreSha256:beforeSha,afterStoreSha256:sha(next),candidate,changedFields:['audio.localPath',...(JSON.parse(original).songs.find(s=>s.id===songId).audio.localAvailable===true?[]:['audio.localAvailable'])],sourceMediaWritten:false,otherSongRecordsChanged:false};
  if(!apply)return report;
  const backupDir=path.join(root,'data/backups'),reportDir=path.join(root,'data/merge-reports');fs.mkdirSync(backupDir,{recursive:true});fs.mkdirSync(reportDir,{recursive:true});
  report.backupPath=path.join(backupDir,`hapa-songs-store.before-audio-reference-${report.operationId}.json`);report.receiptPath=path.join(reportDir,`audio-reference-${report.operationId}.json`);
  fs.writeFileSync(report.backupPath,original,{flag:'wx',mode:0o600});
  fs.writeFileSync(report.receiptPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  temporary=storePath+'.'+report.operationId+'.tmp';const fd=fs.openSync(temporary,'wx',fs.statSync(storePath).mode&0o777);
  try{fs.writeFileSync(fd,next);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(sha(fs.readFileSync(storePath))!==beforeSha)fail('Song store changed before publication; backup/receipt retained');
  if(inspect(newPath).sha256!==candidate.sha256)fail('Candidate changed before publication; backup/receipt retained');
  fs.renameSync(temporary,storePath);temporary=null;
  report.state='applied';report.readbackMatches=sha(fs.readFileSync(storePath))===report.afterStoreSha256;
  fs.writeFileSync(report.receiptPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(!report.readbackMatches)fail('Store changed after repair; inspect receipt before retrying');
  return report;
 }finally{if(temporary)fs.rmSync(temporary,{force:true});if(lock)releaseOwnedFileLock(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const opts=Object.fromEntries(process.argv.slice(2).map(arg=>{if(!arg.startsWith('--'))fail('Use --name=value options');const i=arg.indexOf('=');return i<0?[arg.slice(2),true]:[arg.slice(2,i),arg.slice(i+1)];}));
  for(const key of Object.keys(opts))if(!['song','path','expected-store-sha256','expected-source-sha256','apply'].includes(key))fail('Unknown option: '+key);
  const data=repairSongAudioReference({root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),songId:opts.song,newPath:opts.path,expectedStoreSha256:opts['expected-store-sha256'],expectedSourceSha256:opts['expected-source-sha256'],apply:opts.apply===true});
  console.log(JSON.stringify({ok:true,data},null,2));
 }catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
}
