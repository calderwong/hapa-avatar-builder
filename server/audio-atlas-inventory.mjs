import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { echoSourceContainer } from './echo-source-inventory.mjs';

const roleKey=value=>String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function local(value,root){
 if(typeof value!=='string'||!value)return null;
 if(value.startsWith('file://')){try{return fileURLToPath(value);}catch{return null;}}
 if(value.startsWith('/api/')||/^https?:/i.test(value))return null;
 if(value.startsWith('/media/'))return path.join(root,'public',value);
 if(path.isAbsolute(value))return value;
 return null;
}
/** Exact single-file availability. Format-sibling and role summaries cannot
 * establish availability of an individually selected playback declaration. */
export async function inspectExactAudioReference(file){
 if(typeof file!=='string'||!path.isAbsolute(file))return {state:'unresolved',verification:'exact-readable-header-only',decode_verified:false};
 let handle;
 try{
  handle=await fs.open(file,'r');const stat=await handle.stat();
  if(!stat.isFile()||stat.size<16||stat.size>2*1024**3)return {state:'invalid',reason:'empty, non-file or source budget exceeded',decode_verified:false};
  const header=Buffer.alloc(16);await handle.read(header,0,16,0);const container=echoSourceContainer(header);
  return {state:['unknown','archive'].includes(container)?'invalid':'available',container,bytes:stat.size,verification:'exact-readable-header-only',decode_verified:false};
 }catch(error){return {state:error.code==='ENOENT'?'missing':'unreadable',reason:error.code||'source_read_failed',decode_verified:false};}
 finally{await handle?.close();}
}
/** Shallow, bounded checks of registered paths and same-basename format siblings.
 * Header-readable is not full decoding, original WAV provenance or stem alignment. */
export async function inspectSongAudio(song,{root=process.cwd()}={}){
 const cache=new Map(),directories=new Map();
 async function check(file,format){
  if(!cache.has(file))cache.set(file,(async()=>{
   let handle;
   try{handle=await fs.open(file,'r');const stat=await handle.stat();
    if(!stat.isFile()||stat.size<16)return {path:file,state:'invalid',reason:'empty or non-audio file'};
    const header=Buffer.alloc(16);await handle.read(header,0,16,0);
    const container=echoSourceContainer(header);
    return {path:file,state:container===format?'available':'invalid',container,bytes:stat.size,reason:container===format?null:`expected ${format}, found ${container}`};
   }catch(e){return {path:file,state:e.code==='ENOENT'?'missing':'unreadable',reason:e.code||e.message};}
   finally{await handle?.close();}
  })());
  return cache.get(file);
 }
 async function numberedRoleSiblings(record,format){
  const file=local(record.localPath,root),role=roleKey(record.stemType||record.kind||record.title);
  // Only numbered, role-only filenames qualify; never infer a role from a song title.
  if(!file||roleKey(path.basename(file,path.extname(file)).replace(/^\d+[-_ .]+/,''))!==role)return [];
  const dir=path.dirname(file);
  if(!directories.has(dir))directories.set(dir,(async()=>{
   const names=[];try{const entries=await fs.opendir(dir);for await(const entry of entries){
    if(names.length>=512)return [];names.push(entry.name);
   }}catch{return [];}return names;
  })());
  return (await directories.get(dir)).filter(name=>path.extname(name).toLowerCase()==='.'+format&&roleKey(path.basename(name,path.extname(name)).replace(/^\d+[-_ .]+/,''))===role).map(name=>path.join(dir,name));
 }
 async function formatCheck(record,format,stem=false){
  const refs=[record.localPath,record[format+'Path'],record[format+'Uri'],record.uri];
  const direct=refs.map(v=>local(v,root)).filter(Boolean);
  const candidates=new Set(direct.filter(p=>(path.extname(p).toLowerCase()==='.'+format||(format==='wav'&&path.extname(p).toLowerCase()==='.wave'))));
  // Only exact siblings of an existing registered audio path; never crawl unrelated directories.
  for(const p of direct)if(/\.(wav|wave|mp3|m4a|aac|flac|ogg|opus|aif|aiff)$/i.test(p)){
   candidates.add(p.replace(/\.[^.]+$/,'.'+format));
   candidates.add(p.replace(/\.[^.]+$/,'.'+format.toUpperCase()));
  }
  if(stem)for(const p of await numberedRoleSiblings(record,format))candidates.add(p);
  const files=await Promise.all([...candidates].map(p=>check(p,format)));
  const found=files.filter(x=>x.state==='available');
  const issue=files.find(x=>['invalid','unreadable'].includes(x.state));
  return {state:found.length?'available':issue?.state||(candidates.size?'missing':'unresolved'),files:found,issues:files.filter(x=>x.state!=='available'),reason:found.length?null:issue?.reason||(candidates.size?'No readable local '+format.toUpperCase()+' at the registered path or same-basename sibling':'No resolvable local file reference')};
 }
 const audio=song.audio||{};
 const wav=await formatCheck(audio,'wav'),mp3=await formatCheck(audio,'mp3');
 const groups=new Map();
 for(const row of song.stems||[]){
  if(row.kind==='archive-zip'||/\.zip$/i.test(row.localPath||row.uri||''))continue;
  const role=row.stemType||row.kind||row.title||row.id,key=roleKey(role);
  if(!groups.has(key))groups.set(key,{role,records:[]});groups.get(key).records.push(row);
 }
 const sets={};
 for(const format of ['wav','mp3']){
  const roles=[];
  for(const group of groups.values()){
   const candidates=await Promise.all(group.records.map(row=>formatCheck(row,format,true)));
   const present=candidates.find(x=>x.state==='available');
   roles.push({role:group.role,state:present?'available':candidates.find(x=>['invalid','unreadable'].includes(x.state))?.state||(candidates.every(x=>x.state==='unresolved')?'unresolved':'missing'),files:present?.files||[],reason:present?null:`No readable ${format.toUpperCase()} for this declared stem role`});
  }
  const present=roles.filter(x=>x.state==='available').length;
  sets[format+'_stems']={state:!roles.length?'missing':present===roles.length?'available':present?'partial':'missing',present,expected:roles.length,roles,missing_roles:roles.filter(x=>x.state!=='available').map(x=>x.role)};
 }
 return {id:song.id,title:song.title,createdAt:song.createdAt||null,addedAt:song.addedAt||null,wav,mp3,...sets,checked_at:new Date().toISOString(),verification:'readable-file-and-container-header',scope:'registered paths, exact format siblings, and numbered role matches in registered stem folders (512-entry cap); no recursive search',decode_verified:false};
}
export async function inspectAudioInventory(songs,{root}={}){
 const start=Date.now(),rows=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,songs.length)},async()=>{while(cursor<songs.length){const index=cursor++;rows[index]=await inspectSongAudio(songs[index],{root});}}));
 return {schema_version:'hapa.audio-file-inventory.v1',checked_at:new Date().toISOString(),duration_ms:Date.now()-start,songs:rows,summary:{songs:rows.length,wav:rows.filter(s=>s.wav.state==='available').length,mp3:rows.filter(s=>s.mp3.state==='available').length,complete_wav_stems:rows.filter(s=>s.wav_stems.state==='available').length,partial_wav_stems:rows.filter(s=>s.wav_stems.state==='partial').length,complete_mp3_stems:rows.filter(s=>s.mp3_stems.state==='available').length,partial_mp3_stems:rows.filter(s=>s.mp3_stems.state==='partial').length}};
}
