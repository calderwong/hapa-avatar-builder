import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {echoSourceContainer} from './echo-source-inventory.mjs';
import {inspectSongAudio} from './audio-atlas-inventory.mjs';
import {acquireOwnedFileLock,releaseOwnedFileLock} from './owned-file-lock.mjs';

const hash=value=>createHash('sha256').update(typeof value==='object'&&!Buffer.isBuffer(value)?JSON.stringify(value):value).digest('hex');
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
const roleKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const MAX_AUDIO_UPLOAD_BYTES=1024*1024*1024;

/** Attach bytes to one existing song; never normalize the album or modify source files. */
export function createSongAudioUpload({root,storePath=path.join(root,'data/hapa-songs-store.json'),onSaved=()=>{},maxBytes=MAX_AUDIO_UPLOAD_BYTES}={}){
 const mediaDir=path.join(path.dirname(storePath),'song-audio-uploads');let active=0;
 function readSong(songId){
  if(fs.lstatSync(storePath).isSymbolicLink())fail('Song store may not be a symbolic link');
  const bytes=fs.readFileSync(storePath),store=JSON.parse(bytes),matches=(store.songs||[]).filter(s=>s.id===songId);
  if(matches.length!==1)fail('Song ID must resolve exactly once',404);
  return {bytes,store,song:matches[0],revision:hash(matches[0])};
 }
 async function status(songId){const {song,revision}=readSong(songId);return {songId,title:song.title,revision,inventory:await inspectSongAudio(song,{root}),maxBytes};}
 async function upload({songId,kind,format,role='',filename,revision,replace=false,stream}){
  if(!['master','stem'].includes(kind)||!['wav','mp3'].includes(format))fail('Choose full song or stem and WAV or MP3');
  if(typeof filename!=='string'||filename.length>240||/[\\/\x00-\x1f]/.test(filename)||!new RegExp(format==='wav'?'\\.(wav|wave)$':'\\.mp3$','i').test(filename))fail('Filename must match the selected audio format');
  if(kind==='stem'&&(!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,79}$/.test(role)||!roleKey(role)))fail('Choose a stem role (letters, numbers, spaces, hyphens; up to 80 characters)');
  const original=readSong(songId);
  if(!revision||revision!==original.revision)fail('Song changed. Recheck files and review your upload again.',409);
  if(active>=2)fail('Two uploads are already running. Retry after they finish.',429);
  const inventory=await inspectSongAudio(original.song,{root});
  const current=kind==='master'?inventory[format]:inventory[format+'_stems'].roles.find(r=>roleKey(r.role)===roleKey(role));
  if(current?.state==='available'&&replace!==true)fail('This audio slot already has a file. Explicitly allow replacement or remove this upload.',409);
  if(active>=2)fail('Two uploads are already running. Retry after they finish.',429);
  active++;
  const id=randomUUID(),file=path.join(mediaDir,`${id}.${format}`),temporary=file+'.part';let handle,published=false,lock,storeTemp;
  try{
   await fsp.mkdir(mediaDir,{recursive:true});handle=await fsp.open(temporary,'wx',0o600);
   let bytes=0,header=Buffer.alloc(0);const digest=createHash('sha256');
   for await(const chunk of stream){
    const data=Buffer.from(chunk);bytes+=data.length;if(bytes>maxBytes)fail('File exceeds the upload size limit',413);
    if(header.length<16)header=Buffer.concat([header,data.subarray(0,16-header.length)]);
    digest.update(data);await handle.writeFile(data);
   }
   if(bytes<44||echoSourceContainer(header)!==format)fail('File contents do not match the selected audio format. Choose a WAV or MP3 audio file.',415);
   await handle.sync();await handle.close();handle=null;
   lock=acquireOwnedFileLock({lockPath:storePath+'.audio-reference-repair.lock',schemaVersion:'hapa.song-audio-reference-repair-lock.v1',staleLegacyMs:60000});
   // No asynchronous gap from final revision check to atomic publication. Other
   // processes that do not use this lock remain outside its coordination scope.
   const latest=readSong(songId);if(latest.revision!==revision)fail('Song changed during upload. Recheck files and review again.',409);
   const song=latest.song;let target;
   if(kind==='master'){song.audio||={};target=song.audio;}
   else{
    song.stems||=[];target=song.stems.find(s=>roleKey(s.stemType||s.kind||s.title||s.id)===roleKey(role));
    if(!target){if(song.stems.length>=48)fail('This song has reached the 48 stem-record limit');target={id:`${songId}-stem-${roleKey(role)}`,stemType:role,kind:role};song.stems.push(target);}
   }
   const previous=structuredClone(target),sha256=digest.digest('hex');
   // Preserve a legacy single localPath before choosing the new preferred source.
   const oldFormat=path.extname(target.localPath||'').slice(1).toLowerCase().replace(/^wave$/,'wav');
   if(['wav','mp3'].includes(oldFormat)&&!target[oldFormat+'Path']&&target.localPath){
    target[oldFormat+'Path']=target.localPath;
    target[oldFormat+'Uri']||=pathToFileURL(target.localPath).href;
   }
   target[format+'Path']=file;target[format+'Uri']=pathToFileURL(file).href;
   const oldPreferredExists=target.localPath&&fs.existsSync(target.localPath);
   if(format==='wav'||!oldPreferredExists||new RegExp(`\\.${format}$`,'i').test(target.localPath||'')){
    target.localPath=file;target.localAvailable=true;target.format=format;target.sha256=sha256;
   }
   target.audioUploads=[...(target.audioUploads||[]),{id,format,path:file,filename,sha256,bytes,uploadedAt:new Date().toISOString(),source:'user-file-upload',verification:'container-header',decodeVerified:false}];
   const next=Buffer.from(JSON.stringify(latest.store,null,2)+'\n');
   const backupDir=path.join(path.dirname(storePath),'backups'),receiptDir=path.join(path.dirname(storePath),'merge-reports');
   fs.mkdirSync(backupDir,{recursive:true});fs.mkdirSync(receiptDir,{recursive:true});
   const backupPath=path.join(backupDir,`songs-before-audio-upload-${id}.json`),receiptPath=path.join(receiptDir,`audio-upload-${id}.json`);
   const receipt={schemaVersion:'hapa.song-audio-upload.v1',id,songId,kind,role,format,filename,file,sha256,bytes,previous,backupPath,beforeStoreSha256:hash(latest.bytes),afterStoreSha256:hash(next),state:'prepared',sourceFilesModified:false};
   fs.writeFileSync(backupPath,latest.bytes,{flag:'wx',mode:0o600});fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
   fs.renameSync(temporary,file);
   storeTemp=storePath+'.'+id+'.tmp';const fd=fs.openSync(storeTemp,'wx',fs.statSync(storePath).mode&0o777);
   try{fs.writeFileSync(fd,next);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   if(hash(fs.readFileSync(storePath))!==receipt.beforeStoreSha256)fail('Song store changed before publication. Recheck before retrying.',409);
   fs.renameSync(storeTemp,storePath);storeTemp=null;published=true;
   fs.writeFileSync(receiptPath,JSON.stringify({...receipt,state:'applied'},null,2)+'\n',{mode:0o600});
   onSaved();
   return {...await status(songId),upload:{id,filename,kind,format,role,bytes,sha256,receiptPath}};
  }finally{
   await handle?.close();if(lock)releaseOwnedFileLock(lock);active--;
   await fsp.rm(temporary,{force:true});if(storeTemp)fs.rmSync(storeTemp,{force:true});if(!published)await fsp.rm(file,{force:true});
  }
 }
 return {status,upload};
}
