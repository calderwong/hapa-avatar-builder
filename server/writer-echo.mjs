// Read-only Echo projection for the authenticated Writer room. No media workers.
import path from 'node:path';
import os from 'node:os';
import {readFile, stat, realpath, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {stableEchoMasterReferenceStringify} from '../src/domain/echo-master-reference-export.js';
import {createEchoReferenceMiningStore} from './echo-reference-mining-store.mjs';

export const ECHO_WRITER_CONTRACT='hapa.writer-echo/v1';
const BASE='/v1/writer-characters/echo';
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:stableEchoMasterReferenceStringify(x)).digest('hex');
const list=x=>Array.isArray(x)?x:[];
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,x[k]]));
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(x);
const signature=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
function fault(code,message,status=400){return Object.assign(new Error(message),{code,status});}
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}

export function projectEcho({songbook,songStore,sourceDigests={}}) {
  if(!Array.isArray(songbook?.songCards)||!Array.isArray(songStore?.songs))throw fault('echo_sources','Echo owner sources are unavailable or invalid.',503);
  const native=new Map();
  for(const song of songStore.songs){if(!safeId(song.id)||native.has(song.id))throw fault('echo_identity','Duplicate or invalid native song ID.',503);native.set(song.id,song);}
  const seeds=new Map();
  for(const song of songbook.songCards){if(!safeId(song.id)||seeds.has(song.id))throw fault('echo_identity','Duplicate or invalid songbook ID.',503);seeds.set(song.id,song);}
  const albumId=songbook.album?.id||songStore.album?.id;
  for(const song of native.values())if(!seeds.has(song.id)&&song.albumId===albumId)seeds.set(song.id,{id:song.id});
  const references=new Map(list(songStore.referenceCatalog).map(r=>[r.id,r]));
  const songs=[];const audioPaths=new Map();
  for(const [id,seed] of seeds){
    const song=native.get(id)||seed;
    const lyric=typeof song.lyrics==='string'?{text:song.lyrics}:song.lyrics||seed.lyrics||{};
    const lyricsText=typeof lyric.text==='string'?lyric.text:'';
    const lyricsDigest=hash(lyricsText);
    const connectors=list(song.referenceConnectors);
    const referenceIds=new Set(connectors.map(r=>String(r.referenceId||'').replace(/^reference:/,'')));
    const selectedReferences=[...referenceIds].map(refId=>references.has(refId)?references.get(refId):{id:refId,title:refId,status:'unresolved-source'});
    const record={owner:'hapa-avatar-builder',id,title:song.title||seed.title||id,trackNumber:song.trackNumber??seed.trackNumber??null,
      registrySongId:song.audio?.registryTrackId||seed.registryTrackId||lyric.sourceId||null,
      author:song.author||seed.author||null,authorship:song.authorship||seed.authorship||{},
      loreStatus:song.loreStatus||seed.loreStatus||'unreviewed',performancePerspective:song.performancePerspective||seed.performancePerspective||{},
      lyrics:{...pick(lyric,['status','sourceKind','sourceId','sourceTitle','sourceTextType','matchScore']),text:lyricsText,sha256:lyricsDigest,
        sourceClaimedSha256:lyric.sha256||null,sourceHashMatches:lyric.sha256?lyric.sha256===lyricsDigest:null},
      knowledge:song.knowledge||{},attachments:pick(song.attachments,['avatarLinks','sceneLinks','cardLinks']),
      referenceConnectors:connectors,references:selectedReferences,
      referenceGraphEdges:list(songStore.referenceGraphEdges).filter(e=>referenceIds.has(e.fromReferenceId)||referenceIds.has(e.toReferenceId)),
      source:{ref:`hapa://echo-album/songs/${encodeURIComponent(id)}`,timestamp:song.updatedAt||seed.updatedAt||songStore.updatedAt||songbook.updatedAt||null,
        nativeSongPresent:native.has(id),lyricOwner:lyric.sourceKind||'hapa-avatar-builder',lineage:pick(song.lineage||seed.lineage,['sourceCardId','sourceSongId','registryTrackId','lyricsSourceId','provenanceNotes'])}};
    record.digest=hash(record);record.revision=record.digest;
    record.source.sourceDigests=sourceDigests;
    if(typeof song.audio?.localPath==='string'&&/\.(mp3|wav|m4a|ogg)$/i.test(song.audio.localPath)){
      audioPaths.set(id,song.audio.localPath);record.audioUrl=`${BASE}/songs/${encodeURIComponent(id)}/audio`;record.audioStatus='owner-path-recorded';
    } else {record.audioUrl=null;record.audioStatus='unavailable';}
    record.duration=Number(song.audio?.duration)||null;
    songs.push(record);
  }
  songs.sort((a,b)=>(a.trackNumber??Infinity)-(b.trackNumber??Infinity)||a.id.localeCompare(b.id));
  return {contract:ECHO_WRITER_CONTRACT,album:pick(songStore.album||songbook.album,['id','title','author','aliases','activeProjection','identityRule']),songs,audioPaths,
    sourceDigests,counts:{songs:songs.length,withLyrics:songs.filter(s=>s.lyrics.text.length>0).length,curatedReferences:references.size,connectors:songs.reduce((n,s)=>n+s.referenceConnectors.length,0)}};
}

export function projectEchoAtlas(run,id){
    const node='song:'+id,edges=list(run.graph?.edges).filter(e=>e.fromId===node||e.toId===node);
    const ids=new Set(edges.flatMap(e=>[e.fromId,e.toId]).filter(x=>typeof x==='string'&&/^reference(?:-card)?:/.test(x)));
    const cards=list(run.cards).filter(c=>ids.has(c.id));
    const projection={owner:'hapa-avatar-builder',songId:id,sourceRunId:run.runId||null,sourceRunHash:run.runHash||null,sourceTimestamp:run.generatedAt||null,runtime:run.referenceRuntime||null,cards,edges,
      boundary:'Existing owner Reference Atlas projection. Interpretations, unresolved records, review state and rights remain as recorded; no promotion or generation.'};
    return {...projection,digest:hash(projection)};
}

export function createEchoReader({root,audioRoots=[path.join(os.homedir(),'Desktop/suno-library'),path.join(root,'data/media')],maxSourceBytes=128*1024*1024}={}){
  const paths=[path.join(root,'data/dear-papa-songbook.json'),path.join(root,'data/hapa-songs-store.json')];
  let cached=null,cachedSignature=null,pending=null;
  async function load(){
    if(pending)return pending;
    pending=(async()=>{
      const before=await Promise.all(paths.map(p=>stat(p)));
      if(before.some(s=>!s.isFile()||s.size>maxSourceBytes))throw fault('echo_source_resource','Echo source exceeds the configured source-read budget.',503);
      const stamp=before.map(signature).join('|');if(cached&&stamp===cachedSignature)return cached;
      const bytes=await Promise.all(paths.map(p=>readFile(p)));const after=await Promise.all(paths.map(p=>stat(p)));
      if(stamp!==after.map(signature).join('|'))throw fault('echo_source_changed','Echo sources changed while reading. Refresh again.',409);
      const next=projectEcho({songbook:JSON.parse(bytes[0]),songStore:JSON.parse(bytes[1]),sourceDigests:{songbook:hash(bytes[0]),songStore:hash(bytes[1])}});
      cached=next;cachedSignature=stamp;return next;
    })();try{return await pending;}finally{pending=null;}
  }
  async function audio(req,res,id){
    const data=await load(), source=data.audioPaths.get(id);if(!source)throw fault('audio_unavailable','No local audio is recorded for this song.',404);
    const file=await realpath(source).catch(()=>null);const roots=(await Promise.all(audioRoots.map(p=>realpath(p).catch(()=>null)))).filter(Boolean);
    if(!file||!roots.some(p=>file.startsWith(p+path.sep)))throw fault('audio_unavailable','Local song audio is unavailable in the approved library roots.',404);
    const mime={'.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg'}[path.extname(file).toLowerCase()];
    if(!mime)throw fault('audio_type','Unsupported audio type.',415);
    const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const info=await fd.stat();if(!info.isFile()||!info.size)throw fault('audio_unavailable','Local audio is not a regular nonempty file.',404);
      let start=0,end=info.size-1,status=200;
      if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match)throw fault('audio_range','Use one explicit byte range.',416);start=Number(match[1]);end=match[2]?Number(match[2]):end;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size)throw fault('audio_range','Audio range is unavailable.',416);end=Math.min(end,info.size-1);status=206;}
      res.writeHead(status,{'Content-Type':mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
      await pipeline(fd.createReadStream({start,end,autoClose:false}),res);
    }finally{await fd.close();}
  }
  let atlasStore;
  async function references(id){
    const data=await load();if(!data.songs.some(s=>s.id===id))throw fault('not_found','Echo song not found.',404);
    atlasStore ||= createEchoReferenceMiningStore({root:path.join(root,'data/echo-reference-mining'),songStorePath:paths[1],researchProjectionPath:path.join(root,'data/echo-reference-research-loop/projected-run.json'),animatedMediaPath:path.join(root,'data/echo-reference-animated-media.json'),previewFirstAuthorityPath:path.join(root,'data/echo-reference-governance/preview-first-authority.json')});
    // Reuse the owner's read-only currentRun projection. It may derive current
    // deterministic coverage in memory; no mining run or worker is dispatched.
    const run=await atlasStore.currentRun();
    return projectEchoAtlas(run,id);
  }
  return {load,audio,references};
}

export function createWriterEchoExtension(options){
  const reader=options.reader||createEchoReader(options);
  return async function handleEcho(req,res,{url}){
    if(!url.pathname.startsWith(BASE+'/'))return false;
    try{
      if(req.method!=='GET')throw fault('read_only','Echo source records are read-only in Writer’s Room.',405);
      const parts=url.pathname.slice(BASE.length+1).split('/');
      if(parts[0]!=='songs')throw fault('not_found','Unknown Echo route.',404);
      const data=await reader.load();
      if(parts.length===1){
        const q=url.searchParams.get('q')||'',offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||40);
        if(q.length>500||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw fault('query','Use a valid search and page.');
        const needle=q.toLocaleLowerCase();const rows=data.songs.filter(s=>!needle||[s.title,s.lyrics.text,JSON.stringify(s.knowledge),JSON.stringify(s.references)].join('\n').toLocaleLowerCase().includes(needle));
        send(res,200,{ok:true,contract:data.contract,album:data.album,counts:data.counts,total:rows.length,offset,limit,sourceDigests:data.sourceDigests,songs:rows.slice(offset,offset+limit).map(s=>({...pick(s,['id','title','trackNumber','author','digest','revision','registrySongId','audioStatus']),lyricsStatus:s.lyrics.status||'unspecified',lineCount:s.lyrics.text?s.lyrics.text.split(/\r?\n/).length:0,referenceCount:s.references.length}))});return true;
      }
      const id=decodeURIComponent(parts[1]);if(!safeId(id))throw fault('song_id','Invalid exact song ID.');
      const song=data.songs.find(s=>s.id===id);if(!song)throw fault('not_found','Echo song not found.',404);
      if(parts.length===3&&parts[2]==='audio'){await reader.audio(req,res,id);return true;}
      if(parts.length===3&&parts[2]==='references'){send(res,200,{ok:true,contract:ECHO_WRITER_CONTRACT,references:await reader.references(id)});return true;}
      if(parts.length!==2)throw fault('not_found','Unknown Echo route.',404);
      send(res,200,{ok:true,contract:data.contract,song});return true;
    }catch(error){if(res.headersSent)res.destroy();else send(res,error.status||503,{ok:false,error:error.code||'echo_owner_unavailable',message:error.status?error.message:'Echo owner sources could not be read. Refresh after checking the local owner.'});return true;}
  };
}
