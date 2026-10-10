#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSongAudioUpload} from '../server/song-audio-upload.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let inputStream;
try{
 const opts=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg.slice(2),true]:[arg.slice(2,at),arg.slice(at+1)];}));
 for(const key of Object.keys(opts))if(!['song','file','kind','format','role','revision','replace','apply'].includes(key))throw new Error('Unknown option '+key);
 if(!opts.song)throw new Error('Use --song=ID to inspect; then --file=PATH --kind=master|stem --format=wav|mp3 [--role=Vocals] --revision=HASH --apply [--replace]');
 const service=createSongAudioUpload({root,storePath:process.env.HAPA_SONG_STORE||path.join(root,'data/hapa-songs-store.json')});
 if(opts.apply&&(!opts.file||!path.isAbsolute(opts.file)||!fs.statSync(opts.file).isFile()))throw new Error('Apply requires an absolute path to a regular file');
 if(opts.apply)inputStream=fs.createReadStream(opts.file);
 const result=opts.apply?await service.upload({songId:opts.song,kind:opts.kind,format:opts.format,role:opts.role,filename:path.basename(opts.file),revision:opts.revision,replace:opts.replace===true,stream:inputStream}):await service.status(opts.song);
 console.log(JSON.stringify({ok:true,...result},null,2));
}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}finally{inputStream?.destroy();}
